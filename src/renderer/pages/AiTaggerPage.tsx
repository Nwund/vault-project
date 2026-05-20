// File: src/renderer/pages/AiTaggerPage.tsx
//
// AI Tools page — Setup / Queue / Review / Utilities. Wraps the Tier 1
// (local ONNX) + Tier 2 (Venice AI) tagging pipeline. Extracted from
// App.tsx as part of #48.

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Activity,
  AlertCircle,
  Brain,
  CheckCircle2,
  Download,
  Edit,
  Eye,
  FileText,
  Layers,
  Loader2,
  Pause,
  Play,
  RefreshCw,
  RotateCcw,
  Save,
  Settings,
  Shield,
  Sliders,
  Sparkles,
  Tag,
  Volume2,
  X,
  XCircle,
  Zap,
} from 'lucide-react'
import { useToast } from '../contexts'
import { useConfirm } from '../components/ConfirmDialog'
import { formatBytes } from '../utils/formatters'
import { cn } from '../utils/cn'
import { ReviewHoverPreview } from '../components/ReviewHoverPreview'
import { TaggerQualityCard } from '../components/AdminCards'
import { ModelFileCard } from '../components/ModelFileCard'
import { QualityAuditCard } from '../components/QualityAuditCard'
import { ClipSimilarityCard } from '../components/ClipSimilarityCard'
import { toFileUrlCached } from '../hooks/usePerformance'
import { DebouncedInput, DebouncedTextarea } from '../components/DebouncedField'

// ═══════════════════════════════════════════════════════════════════════════
// AI TAGGER PAGE - Multi-tier AI analysis for auto-tagging
// ═══════════════════════════════════════════════════════════════════════════

interface ModelInfo {
  name: string
  filename: string
  size: number
  downloaded: boolean
}

interface QueueStatus {
  total: number
  pending: number
  processing: number
  completed: number
  failed: number
  isRunning: boolean
  isPaused: boolean
  currentMediaId: string | null
}

interface ReviewItem {
  mediaId: string
  filename: string
  thumbnailPath?: string
  suggestedTitle?: string
  description?: string
  matchedTags: Array<{ id: string; name: string; confidence: number }>
  newTagSuggestions: Array<{ name: string; confidence: number }>
  nsfwCategory?: string
  nsfwConfidence?: number
  reviewStatus: 'pending' | 'approved' | 'rejected'
  createdAt: string
  // Phase E: Tier 2 may suggest a clean filename for gibberish-named items.
  suggestedFilename?: string | null
  // Phase A: rich tags with confidence + source classification.
  // Phase 2 of #19 audit: frameCount/totalFrames let the review UI show
  // "12/12 agreed" badges so the user can spot single-frame outliers.
  richTags?: Array<{ name: string; confidence: number; source: string; frameCount?: number; totalFrames?: number }>
}


export function AiTaggerPage() {
  const { showToast } = useToast()
  const confirm = useConfirm()

  // Model state
  const [models, setModels] = useState<ModelInfo[]>([])
  const [modelsReady, setModelsReady] = useState(false)
  const [downloadingModel, setDownloadingModel] = useState<string | null>(null)
  const [downloadProgress, setDownloadProgress] = useState(0)

  // Venice API state. The actual key never leaves the main process — the
  // renderer only sees a masked tail-preview ("••••••••mcrz") and a
  // "configured" flag. `editingKey` controls whether the input is in
  // replace-mode (textbox visible) or display-mode (preview chip visible).
  const [veniceApiKey, setVeniceApiKey] = useState('')
  const [tier2Configured, setTier2Configured] = useState(false)
  const [veniceKeyPreview, setVeniceKeyPreview] = useState('')
  const [veniceKeyEncrypted, setVeniceKeyEncrypted] = useState(false)
  const [editingVeniceKey, setEditingVeniceKey] = useState(false)

  // Queue state
  const [queueStatus, setQueueStatus] = useState<QueueStatus | null>(null)
  const [processingProgress, setProcessingProgress] = useState<{ mediaId: string; stage: string; percent: number; framesExtracted?: number; tier1Tags?: number; tier2Frame?: number; tier2Total?: number } | null>(null)
  // Duration-weighted queue progress: completedSec / totalSec.
  const [queueProgress, setQueueProgress] = useState<{ completedCount: number; totalCount: number; completedSec: number; totalSec: number; percent: number } | null>(null)

  // Review state
  const [reviewItems, setReviewItems] = useState<ReviewItem[]>([])
  const [reviewTotal, setReviewTotal] = useState(0)
  const [reviewListStatus, setReviewListStatus] = useState<'pending' | 'approved' | 'rejected'>('pending')
  // 'uncertainty' = active-learning mode: items where AI is least
  // confident appear first, so review effort directly improves the model.
  const [reviewListSort, setReviewListSort] = useState<'newest' | 'uncertainty'>('newest')
  const [selectedReviewItem, setSelectedReviewItem] = useState<ReviewItem | null>(null)
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set())
  // Names of AI-suggested NEW tags the user clicked to add. Kept separate
  // from selectedTags (which holds existing-library tag IDs) because new
  // tags don't have an ID yet — they get created on approve.
  const [selectedNewTagNames, setSelectedNewTagNames] = useState<Set<string>>(new Set())
  const [newTagInput, setNewTagInput] = useState('')
  // Tags the user has typed + clicked Add but not yet approved. Persists
  // until approve fires (then sent as newTags). Used to render them as
  // clickable chips alongside the AI suggestions.
  const [customTagsPending, setCustomTagsPending] = useState<string[]>([])
  // Co-occurrence suggestions — tags that strongly co-occur with the
  // current selection in approved media. Refreshes on selection change
  // with a debounce to coalesce burst toggles.
  const [cooccurSuggestions, setCooccurSuggestions] = useState<Array<{ name: string; jointCount: number }>>([])
  const [editedTitle, setEditedTitle] = useState('')
  const [editedDescription, setEditedDescription] = useState('')
  // Phase E: editable suggested filename (Tier 2 → user can edit before applying)
  const [editedFilename, setEditedFilename] = useState('')
  const [renameApplying, setRenameApplying] = useState(false)
  // Regenerate-button busy flags (Review tab title/description regen).
  const [regenTitleBusy, setRegenTitleBusy] = useState(false)
  const [regenDescBusy, setRegenDescBusy] = useState(false)
  // Contact-sheet path + resolved URL for the currently-selected review
  // item. Auto-fires a non-blocking generation pass after Tier 2, so by
  // the time the item shows up here the 4×3 frame grid is usually already
  // on disk. URL is converted via toFileUrlCached because Electron's
  // webSecurity blocks bare file:// — the renderer needs a cached
  // vault://-style URL.
  const [contactSheetPath, setContactSheetPath] = useState<string | null>(null)
  const [contactSheetUrl, setContactSheetUrl] = useState<string>('')
  const [contactSheetExpanded, setContactSheetExpanded] = useState(false)
  // When true, the contact sheet renders inside a full-screen modal.
  // Lets the reviewer actually see frame details for older / smaller
  // thumbnails when the inline preview is too compressed.
  const [contactSheetFullscreen, setContactSheetFullscreen] = useState(false)
  // JoyCaption sidecar status — pinged on the Setup tab to show the user
  // whether the supplementary uncensored caption model is reachable.
  const [joycaptionStatus, setJoycaptionStatus] = useState<{
    installed: boolean
    installPath: string | null
    online: boolean
    model?: string
    device?: string
    vramGb?: number
  } | null>(null)
  // Tag-category metadata + per-suggested-tag category index. Lets the
  // review pane group tag chips by semantic bucket (action / position /
  // performer / body / kink / camera …) instead of by source model.
  const [tagCategoryMeta, setTagCategoryMeta] = useState<Array<{
    id: string
    label: string
    color: string
    description: string
  }>>([])
  const [tagCategoryMap, setTagCategoryMap] = useState<Record<string, string>>({})
  // Similar-already-approved items for the current review selection.
  // Uses the existing ai:similar (rich_tag cosine similarity) to show
  // 3 visually-comparable items as context for the reviewer.
  const [similarItems, setSimilarItems] = useState<Array<{
    mediaId: string
    filename: string
    thumbPath: string | null
    similarity: number
    sharedTags: string[]
  }>>([])
  const [similarThumbs, setSimilarThumbs] = useState<Record<string, string>>({})
  // Tag autocomplete — flat list of all library tag names (lowercased)
  // for the custom-tag input. Loaded once on mount. Suggestion list
  // is computed in render from `newTagInput` against this set.
  const [allTagNames, setAllTagNames] = useState<string[]>([])
  const [tagSuggestionIdx, setTagSuggestionIdx] = useState(0)
  const [tagSuggestionsOpen, setTagSuggestionsOpen] = useState(false)
  // JoyCaption sidecar start/stop state. Start is async (model load
  // takes 30-300s depending on mode + first-run), so we show a busy
  // spinner with the elapsed time.
  const [joycaptionStartBusy, setJoycaptionStartBusy] = useState(false)
  const [joycaptionMode, setJoycaptionMode] = useState<'bf16' | '4bit'>('4bit')
  // JoyCaption smoke-test state — used by the "Test caption" button on
  // the Setup tab. Runs one image through the sidecar so the user can
  // sanity-check the install without enqueuing real media.
  const [joycaptionTestBusy, setJoycaptionTestBusy] = useState(false)
  // Caption style passed to the test call. JoyCaption supports several
  // styles; descriptive is the default since it matches Venice's
  // output shape, but the booru tag-list styles are useful for
  // smoke-testing the e621/danbooru side of the model.
  const [joycaptionTestStyle, setJoycaptionTestStyle] = useState<
    'descriptive' | 'descriptive-casual' | 'straightforward' | 'tags-danbooru' | 'tags-e621' | 'tags-rule34'
  >('descriptive')
  const [joycaptionTestResult, setJoycaptionTestResult] = useState<{
    ok: boolean
    caption?: string
    latencyMs?: number
    vramGb?: number
    error?: string
    // Thumbnail used for the test (resolved file URL) — lets the user
    // visually confirm what image the caption is describing.
    thumbUrl?: string
    thumbFilename?: string
  } | null>(null)
  // Porn-domains blocklist status — used for the Utilities-tab card
  // that lets the user upload a Bon-Appetit-style domain list to
  // augment the bundled ~50-domain set for filename platform tagging.
  const [domainsStatus, setDomainsStatus] = useState<{
    bundled: number
    user: number
    total: number
    userPath: string | null
  } | null>(null)
  const [domainsBusy, setDomainsBusy] = useState(false)
  // miles-deep model presence — pure status (no download path; the
  // user supplies the ONNX manually).
  const [milesDeepStatus, setMilesDeepStatus] = useState<{
    installed: boolean
    expectedPath: string
    sizeBytes: number
  } | null>(null)
  // MoveNet pose detector — downloadable via the standard model
  // downloader, so this just shows presence + size.
  const [poseDetectorStatus, setPoseDetectorStatus] = useState<{
    installed: boolean
    expectedPath: string
    sizeBytes: number
  } | null>(null)
  // YuNet face detector — tiny model bundled with standard downloads.
  const [faceDetectorStatus, setFaceDetectorStatus] = useState<{
    installed: boolean
    expectedPath: string
    sizeBytes: number
  } | null>(null)
  // NudeNet v3 detector — manual install (mirrors unreliable).
  const [nudenetStatus, setNudenetStatus] = useState<{
    installed: boolean
    expectedPath: string
    sizeBytes: number
  } | null>(null)
  // Gender classifier (manual install).
  const [genderStatus, setGenderStatus] = useState<{
    installed: boolean
    expectedPath: string
    sizeBytes: number
  } | null>(null)
  // CLIP BPE tokenizer vocab — Apache-2.0 file from openai/CLIP repo.
  // One-click install (ai:clip-bpe-download). Without it, CLIP text
  // encoding falls back to a character-code placeholder that gives
  // useful relative scores for fixed prompts but is useless for
  // arbitrary text. With it, real zero-shot tag validation works.
  const [clipBpeStatus, setClipBpeStatus] = useState<{
    available: boolean
    expectedPath: string
    vocabSize: number | null
  } | null>(null)
  const [clipBpeBusy, setClipBpeBusy] = useState(false)
  // WD Tagger variant selection — SwinV2 default vs ViT (smaller).
  // WD Tagger variant. Five model families supported — see
  // tier1-onnx-tagger.ts for the filename → variant mapping.
  const [wdVariant, setWdVariant] = useState<'swinv2' | 'vit' | 'pixai' | 'joytag' | 'idolsankaku'>('swinv2')
  // Multi-hypothesis Venice sampling count (1 / 2 / 3).
  const [veniceMultiSample, setVeniceMultiSample] = useState<number>(1)
  // TpDB API key state — same shape as Venice. Masked preview only.
  const [tpdbConfigured, setTpdbConfigured] = useState<boolean>(false)
  const [tpdbPreview, setTpdbPreview] = useState<string>('')
  const [tpdbHealthy, setTpdbHealthy] = useState<boolean | null>(null)
  const [tpdbHealthError, setTpdbHealthError] = useState<string | null>(null)
  const [tpdbEncrypted, setTpdbEncrypted] = useState<boolean>(false)
  const [editingTpdbKey, setEditingTpdbKey] = useState<boolean>(false)
  const [tpdbKeyInput, setTpdbKeyInput] = useState<string>('')
  // Whisper.cpp install + opt-in state. Transcription adds 10-30s
  // per video — the toggle lets users opt in only when they want
  // dirty-talk / dialogue-driven tag priors.
  const [whisperStatus, setWhisperStatus] = useState<{
    installed: boolean
    enabled: boolean
    installDir: string | null
    binaryPath: string | null
    modelPath: string | null
    modelName: string | null
  } | null>(null)
  // Auto-approve threshold preview — live histogram of pending review
  // items by max rich_tag confidence. Lets the Queue tab show "≈X of
  // Y items would auto-apply at this threshold" beneath the slider.
  const [autoApprovePreview, setAutoApprovePreview] = useState<{
    total: number
    histogram: Array<{ threshold: number; count: number }>
  } | null>(null)
  // Tag merger — user-directed collapse of two tags into one. Uses
  // the same allTagNames list as the autocomplete (loaded once on
  // mount). State pairs source + target + busy flag.
  const [mergeSource, setMergeSource] = useState('')
  const [mergeTarget, setMergeTarget] = useState('')
  const [mergeBusy, setMergeBusy] = useState(false)
  // Preview of the upcoming merge (count of items, overlap, etc.).
  // Refreshed with a small debounce as the user types into the
  // source/target pickers so they see the impact before clicking Merge.
  const [mergePreview, setMergePreview] = useState<
    | null
    | { ok: false; error: string }
    | { ok: true; sourceCount: number; targetCount: number; overlap: number; moved: number; targetExists: boolean }
  >(null)
  // Library-wide AI rejection patterns. Backend already aggregates
  // these for the Tier 2 prompt; this just surfaces the same data so
  // the user can spot which AI suggestions are most often wrong.
  const [rejectionPatterns, setRejectionPatterns] = useState<{
    totalEvents: number
    rejectedTags: Array<{ name: string; count: number }>
    hotRejections: string[]
  } | null>(null)
  // Per-input dropdown control. Lets us reuse the same suggestions
  // pattern as the review-pane custom-tag autocomplete.
  const [mergeSourceOpen, setMergeSourceOpen] = useState(false)
  const [mergeTargetOpen, setMergeTargetOpen] = useState(false)
  // Single-level undo for review decisions. Polled on every approve/
  // reject so the button reflects current availability.
  const [undoStatus, setUndoStatus] = useState<{
    available: boolean
    decisionType?: 'approve' | 'approve-edited' | 'reject'
  }>({ available: false })
  // Multi-select review state. Stores selected mediaIds. Click =
  // navigate (single selection); Ctrl/Cmd+click = toggle in multi-set;
  // Shift+click = select range from the last anchor.
  const [bulkSelectedIds, setBulkSelectedIds] = useState<Set<string>>(new Set())
  const [bulkAnchorId, setBulkAnchorId] = useState<string | null>(null)
  const [bulkBusy, setBulkBusy] = useState(false)
  // Contact-sheet backfill state — Utilities-tab one-shot to generate
  // 4×3 frame grids for every video that doesn't have one yet.
  const [contactBackfillBusy, setContactBackfillBusy] = useState(false)
  const [contactBackfillProgress, setContactBackfillProgress] = useState<{
    processed: number
    total: number
    generated: number
    skipped: number
    failed: number
  } | null>(null)
  // Filename ML classifier status — bag-of-tokens model trained on
  // the user's approved-media history. Retrain on demand via the
  // Utilities tab card.
  const [filenameMlStatus, setFilenameMlStatus] = useState<{
    samples: number
    tokens: number
    tags: number
    trainedAt: string
  } | null>(null)
  const [filenameMlBusy, setFilenameMlBusy] = useState(false)
  const [contactBackfillResult, setContactBackfillResult] = useState<{
    canceled?: boolean
    total: number
    generated: number
    skipped: number
    failed: number
  } | null>(null)

  // Protected tags state
  const [protectedTags, setProtectedTags] = useState<string[]>([])
  const [newProtectedTag, setNewProtectedTag] = useState('')

  // UI state
  const [activeTab, setActiveTab] = useState<'setup' | 'queue' | 'review' | 'tools'>('setup')
  const [tier2Enabled, setTier2Enabled] = useState(false)
  // 0 disables auto-categorize. Default ON at 0.6 so freshly-queued items
  // actually pick up tags without the user having to discover the slider.
  // Slider tops at 0.95 (in the UI + server clamps) since Tier 2 confidences
  // never hit literal 1.0.
  const [aiAutoApproveThreshold, setAiAutoApproveThreshold] = useState(0.6)
  // Batch cap — pause after processing N items. 0 = unlimited. Lets the
  // user say "tag 25 favorites first, then I'll review, then I'll decide
  // whether to keep going" instead of an unbounded run.
  const [batchLimit, setBatchLimit] = useState<number>(0)
  // When true, Tier 1 (ONNX) tags get suppressed before reaching Tier 3.
  // Content classification still runs. Recovers tag-quality control when
  // Tier 1 is producing too much booru-style noise.
  const [disableTier1Tags, setDisableTier1Tags] = useState(false)
  // Venice error state. When set, the queue is auto-paused and the user
  // sees a countdown timer until safe to retry. No local-LLM fallback —
  // user wants to be told explicitly when Venice is unavailable.
  const [veniceError, setVeniceError] = useState<{
    code: 'VENICE_RATE_LIMITED' | 'VENICE_UNREACHABLE' | 'VENICE_AUTH_FAILED' | 'VENICE_API_ERROR'
    message: string
    retryAfterSec: number | null
    retryAt: number | null
  } | null>(null)
  // Calibration summary — populated lazily, refreshed when user clicks the card.
  const [calibrationSummary, setCalibrationSummary] = useState<{
    summary: {
      tagsTracked: number
      totalSamples: number
      totalApproved: number
      totalRejected: number
      mediaApproved?: number
      mediaRejected?: number
      mediaPending?: number
    }
    topApproved: Array<{ tagName: string; source: string; approvalRatio: number; approvedCount: number; rejectedCount: number; sampleCount: number; meanConfidence: number; lastSeen: string }>
    topRejected: Array<{ tagName: string; source: string; approvalRatio: number; approvedCount: number; rejectedCount: number; sampleCount: number; meanConfidence: number; lastSeen: string }>
  } | null>(null)
  const [loadingCalibration, setLoadingCalibration] = useState(false)
  const refreshCalibration = useCallback(async () => {
    setLoadingCalibration(true)
    try {
      const result = await (window as any).api?.ai?.calibrationSummary?.()
      setCalibrationSummary(result ?? null)
    } catch (err) {
      console.warn('[Calibration] summary fetch failed:', err)
    } finally {
      setLoadingCalibration(false)
    }
  }, [])
  useEffect(() => { refreshCalibration() }, [refreshCalibration])

  // Load protected tags
  async function loadProtectedTags() {
    try {
      const tags = await window.api.ai.getProtectedTags?.()
      setProtectedTags(tags || [])
    } catch (err) {
      console.error('[AI] Failed to load protected tags:', err)
    }
  }

  // Load initial state
  useEffect(() => {
    checkModels()
    refreshQueueStatus()
    loadReviewItems()
    loadProtectedTags()

    // JoyCaption sidecar status — non-blocking probe so the Setup tab
    // can render a status badge. Falls through to "not installed" if
    // either the IPC isn't registered yet or the probe throws.
    window.api.ai.joycaptionStatus?.().then((s: any) => {
      setJoycaptionStatus(s ?? { installed: false, installPath: null, online: false })
    }).catch(() => setJoycaptionStatus({ installed: false, installPath: null, online: false }))

    // Tag category metadata — small static table used by the Review
    // pane to group AI-suggested tag chips by semantic bucket.
    window.api.ai.tagCategories?.().then((meta: any) => {
      if (Array.isArray(meta)) setTagCategoryMeta(meta)
    }).catch(() => { /* fall back to ungrouped */ })

    // Library tag names for custom-tag-input autocomplete. Loaded once;
    // we don't refresh on tag creation because the inflight ones are
    // already in customTagsPending and creating a new tag from the
    // custom input creates it locally on approve.
    window.api.tags?.list?.().then((tags: any) => {
      if (Array.isArray(tags)) {
        setAllTagNames(tags.map((t: any) => String(t.name ?? t).toLowerCase()).filter(Boolean))
      }
    }).catch(() => { /* autocomplete just stays empty */ })

    // Porn-domains blocklist status — shows on the Utilities tab so the
    // user can see whether they've uploaded a custom list already.
    window.api.ai.domainsStatus?.().then((s: any) => {
      if (s) setDomainsStatus(s)
    }).catch(() => { /* leave null */ })

    // Filename ML classifier status — current model stats.
    window.api.ai.filenameClassifierStatus?.().then((s: any) => {
      if (s) setFilenameMlStatus(s)
    }).catch(() => { /* leave null */ })

    // miles-deep ONNX presence — Setup-tab card showing whether the
    // 6-class sex-act classifier model is in place.
    window.api.ai.milesDeepStatus?.().then((s: any) => {
      if (s) setMilesDeepStatus(s)
    }).catch(() => { /* leave null */ })

    // MoveNet pose detector presence. Refreshed after model downloads
    // complete (the checkModels effect already triggers).
    window.api.ai.poseDetectorStatus?.().then((s: any) => {
      if (s) setPoseDetectorStatus(s)
    }).catch(() => { /* leave null */ })

    // YuNet face detector presence.
    window.api.ai.faceDetectorStatus?.().then((s: any) => {
      if (s) setFaceDetectorStatus(s)
    }).catch(() => { /* leave null */ })

    // NudeNet v3 detector presence (manual install).
    window.api.ai.nudenetStatus?.().then((s: any) => {
      if (s) setNudenetStatus(s)
    }).catch(() => { /* leave null */ })

    // Gender classifier (manual install).
    window.api.ai.genderClassifierStatus?.().then((s: any) => {
      if (s) setGenderStatus(s)
    }).catch(() => { /* leave null */ })

    // CLIP BPE vocab — fetched on first probe; subsequent calls are
    // synchronous map lookups.
    window.api.ai.clipBpeStatus?.().then((s: any) => {
      if (s) setClipBpeStatus(s)
    }).catch(() => { /* leave null */ })

    // WD Tagger variant + multi-sample setting.
    window.api.ai.wdVariantGet?.().then((v: any) => {
      // Five variants now supported: swinv2 (default), vit, pixai,
      // joytag, idolsankaku. UI state stays string-typed so future
      // additions don't require code changes here.
      if (typeof v === 'string' && v.length > 0) setWdVariant(v as any)
    }).catch(() => { /* default swinv2 */ })
    window.api.ai.veniceMultiSampleGet?.().then((n: any) => {
      const num = Math.max(1, Math.min(3, Math.round(Number(n) || 1)))
      setVeniceMultiSample(num)
    }).catch(() => { /* default 1 */ })

    // TpDB API key state. Auto-imports from .api-keys.env on first load
    // (server-side already; this just refreshes the masked preview).
    ;(async () => {
      try {
        const cfg = await window.api.ai.tpdbGetConfig?.()
        setTpdbConfigured(!!cfg?.configured)
        setTpdbPreview(cfg?.preview ?? '')
        setTpdbEncrypted(!!cfg?.encrypted)
        setEditingTpdbKey(!cfg?.configured)
        // If still no key configured, try auto-import from file path.
        if (!cfg?.configured) {
          try {
            const r = await window.api.ai.tpdbReloadFromFile?.()
            if (r?.ok && r.saved) {
              setTpdbConfigured(true)
              setTpdbPreview(r.preview ?? '')
              setTpdbEncrypted(!!r.encrypted)
              setEditingTpdbKey(false)
            }
          } catch { /* ignore */ }
        }
        // Ping /user/me to validate.
        try {
          const h = await window.api.ai.tpdbHealth?.()
          setTpdbHealthy(!!h?.ok)
          setTpdbHealthError(h?.ok ? null : (h?.reason ?? null))
        } catch (err: any) {
          setTpdbHealthy(false)
          setTpdbHealthError(err?.message ?? null)
        }
      } catch { /* leave defaults */ }
    })()

    // Whisper.cpp install + opt-in flag.
    window.api.ai.whisperStatus?.().then((s: any) => {
      if (s) setWhisperStatus(s)
    }).catch(() => { /* leave null */ })

    // Threshold preview histogram. Computed once on mount; recomputed
    // when the user opens the Queue tab (see effect below) so the
    // "items at this threshold" hint stays current as new analyses
    // land in the review queue.
    window.api.ai.autoApprovePreview?.().then((s: any) => {
      if (s) setAutoApprovePreview(s)
    }).catch(() => { /* leave null */ })

    // Load saved Venice API key status. Server only returns a masked
    // preview + flags; full key never crosses the IPC boundary.
    window.api.ai.getTier2Config?.().then(async (config: { configured: boolean; preview: string; encrypted: boolean; tier2Enabled: boolean; disableTier1Tags?: boolean }) => {
      setTier2Configured(!!config?.configured)
      setVeniceKeyPreview(config?.preview ?? '')
      setVeniceKeyEncrypted(!!config?.encrypted)
      setDisableTier1Tags(!!config?.disableTier1Tags)
      // Editing mode is off when there's already a saved key — user clicks
      // "Replace" to reveal the input.
      setEditingVeniceKey(!config?.configured)
      console.log('[AI] Tier2 config loaded:', { configured: config?.configured, encrypted: config?.encrypted, disableTier1Tags: config?.disableTier1Tags })

      // Auto-import: if no key is configured AND the IPC handler is
      // available (i.e. main process has the new code), silently attempt
      // a reload from .api-keys.env. If the file has a key, the user
      // gets one configured automatically without lifting a finger.
      if (!config?.configured) {
        try {
          const result = await window.api.ai.reloadKeysFromFile?.()
          if (result?.ok) {
            setTier2Configured(true)
            setVeniceKeyPreview(result.preview ?? '')
            setVeniceKeyEncrypted(!!result.encrypted)
            setEditingVeniceKey(false)
            setTier2Enabled(true)
            console.log('[AI] Auto-imported key from .api-keys.env on AI Tools mount')
          }
        } catch (err) {
          console.warn('[AI] Auto-import from .api-keys.env failed silently:', err)
        }
      }
    }).catch((err: any) => console.error('[AI] Failed to load Tier2 config:', err))

    // Subscribe to events
    const unsubStatus = window.api.events.onAiStatus?.((data: { status: string }) => {
      console.log('[AI] Status:', data.status)
      refreshQueueStatus()
    })

    const unsubProgress = window.api.events.onAiProgress?.((data: { mediaId: string; stage: string; percent: number; framesExtracted?: number; tier1Tags?: number; tier2Frame?: number; tier2Total?: number }) => {
      setProcessingProgress(data)
      if (data.stage === 'completed' || data.stage === 'failed') {
        refreshQueueStatus()
        loadReviewItems()
      }
    })

    const unsubQueueProgress = window.api.events.onAiQueueProgress?.((data: { completedCount: number; totalCount: number; completedSec: number; totalSec: number; percent: number }) => {
      setQueueProgress(data)
    })

    const unsubDownload = window.api.events.onAiModelDownload?.((data: { model: string; percent: number }) => {
      setDownloadingModel(data.model)
      setDownloadProgress(data.percent)
      if (data.percent >= 100) {
        setTimeout(() => {
          setDownloadingModel(null)
          checkModels()
        }, 500)
      }
    })

    // Venice error subscription — fires when the backend hits 429 /
    // unreachable / auth failure. Backend auto-pauses the queue; we
    // just surface the error + countdown.
    const unsubVeniceError = (window.api.events as any).onVeniceError?.((data: any) => {
      console.warn('[AI] Venice error event:', data)
      const retryAt = data.retryAfterSec != null
        ? Date.now() + data.retryAfterSec * 1000
        : null
      setVeniceError({
        code: data.code,
        message: data.message,
        retryAfterSec: data.retryAfterSec,
        retryAt,
      })
      refreshQueueStatus()
    })

    return () => {
      unsubStatus?.()
      unsubProgress?.()
      unsubQueueProgress?.()
      unsubDownload?.()
      try { unsubVeniceError?.() } catch {}
    }
  }, [])

  // Countdown ticker for the Venice retry timer. Lets the banner
  // re-render every second so the user sees the timer decrement.
  const [_tick, setTick] = useState(0)
  useEffect(() => {
    if (!veniceError?.retryAt) return
    const handle = setInterval(() => setTick((n) => n + 1), 1000)
    return () => clearInterval(handle)
  }, [veniceError?.retryAt])

  // Contact-sheet backfill progress listener — main process emits one
  // event per video processed. Cleanup unsubscribes on unmount.
  useEffect(() => {
    const off = window.api.ai.onContactSheetBackfillProgress?.((p: any) => {
      setContactBackfillProgress({
        processed: p.processed,
        total: p.total,
        generated: p.generated,
        skipped: p.skipped,
        failed: p.failed,
      })
    })
    return () => {
      if (typeof off === 'function') off()
    }
  }, [])

  // Refresh the auto-approve threshold preview whenever the user
  // switches to the Queue tab — pending counts shift as items land.
  useEffect(() => {
    if (activeTab !== 'queue') return
    window.api.ai.autoApprovePreview?.().then((s: any) => {
      if (s) setAutoApprovePreview(s)
    }).catch(() => { /* keep stale */ })
  }, [activeTab])

  // Escape closes the contact-sheet full-screen modal. Browser-level
  // because the modal isn't focused by default and key events fire on
  // window, not the dialog div.
  useEffect(() => {
    if (!contactSheetFullscreen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setContactSheetFullscreen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [contactSheetFullscreen])

  // Refresh undo button availability whenever the user opens the Review
  // tab — the snapshot is in-memory on the main process, so the renderer
  // has to ask each time.
  useEffect(() => {
    if (activeTab !== 'review') return
    refreshUndoStatus()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab])

  // Load rejection patterns when the user opens the Utilities tab.
  // Backend computes this on-demand so we re-fetch each time the tab
  // is shown — counts shift as the user reviews more items.
  useEffect(() => {
    if (activeTab !== 'tools') return
    window.api.ai.getRejectionPatterns?.().then((p: any) => {
      if (p) setRejectionPatterns(p)
    }).catch(() => { /* leave null */ })
  }, [activeTab])

  // Debounced tag-merge preview — fires the dry-run IPC ~300ms after
  // the user stops typing in either picker. Skips when either input
  // is empty or the two are identical.
  useEffect(() => {
    if (activeTab !== 'tools') return
    const s = mergeSource.trim()
    const t = mergeTarget.trim()
    if (!s) { setMergePreview(null); return }
    if (s.toLowerCase() === t.toLowerCase()) { setMergePreview(null); return }
    const handle = setTimeout(async () => {
      try {
        const r = await window.api.tags.mergePreview?.(s, t)
        setMergePreview(r ?? null)
      } catch {
        setMergePreview(null)
      }
    }, 300)
    return () => clearTimeout(handle)
  }, [activeTab, mergeSource, mergeTarget])

  async function checkModels() {
    try {
      const result = await window.api.ai.checkModels() as { all_ready: boolean; models: ModelInfo[] }
      setModels(result.models)
      setModelsReady(result.all_ready)
    } catch (err) {
      console.error('[AI] Failed to check models:', err)
    }
  }

  async function downloadModels() {
    try {
      setDownloadingModel('Starting...')
      const result = await window.api.ai.downloadModels() as { success: boolean; error?: string }
      setDownloadingModel(null)
      await checkModels()
      if (result?.success) {
        showToast('success', 'Models downloaded successfully')
      } else {
        showToast('error', result?.error ?? 'Download completed with errors')
      }
    } catch (err: any) {
      console.error('[AI] Failed to download models:', err)
      showToast('error', err?.message ?? 'Failed to download models')
      setDownloadingModel(null)
    }
  }

  async function configureVenice() {
    if (!veniceApiKey.trim()) return
    try {
      const result = await window.api.ai.configureTier2({ apiKey: veniceApiKey.trim() })
      // Re-fetch so the masked preview reflects what's actually saved.
      const cfg = await window.api.ai.getTier2Config?.()
      setTier2Configured(!!cfg?.configured)
      setVeniceKeyPreview(cfg?.preview ?? '')
      setVeniceKeyEncrypted(!!cfg?.encrypted)
      setVeniceApiKey('')
      setEditingVeniceKey(false)
      if (result?.encrypted) {
        showToast('success', 'Venice API key saved (encrypted)')
      } else if (result?.saved) {
        showToast('success', 'Venice API key saved')
      } else {
        showToast('warning', 'Configured for this session — could not persist (OS keychain unavailable)')
      }
    } catch (err: any) {
      console.error('[AI] Failed to configure Venice:', err)
      showToast('error', err?.message ?? 'Failed to configure Venice API')
    }
  }

  // Re-trigger the .api-keys.env auto-import without needing to restart
  // the app. Surfaced as a button in both display + edit mode so the user
  // can rotate the key or recover from a stale state.
  async function reloadKeyFromFile() {
    try {
      console.log('[AI Tagger UI] Triggering reloadKeysFromFile…')
      const result = await window.api.ai.reloadKeysFromFile?.()
      console.log('[AI Tagger UI] reloadKeysFromFile result:', result)
      if (!result) {
        showToast('error', 'reloadKeysFromFile IPC missing — restart the app once for the handler to register')
        return
      }
      if (result.ok) {
        setTier2Configured(true)
        setVeniceKeyPreview(result.preview ?? '')
        setVeniceKeyEncrypted(!!result.encrypted)
        setEditingVeniceKey(false)
        setVeniceApiKey('')
        setTier2Enabled(true)
        showToast('success', result.encrypted ? 'Imported & encrypted key from .api-keys.env' : 'Imported key from .api-keys.env (encryption unavailable)')
      } else {
        showToast('error', result.message ?? 'No key found in C:\\dev\\.api-keys.env')
      }
    } catch (err: any) {
      console.error('[AI Tagger UI] reloadKeysFromFile threw:', err)
      showToast('error', 'Reload failed: ' + (err?.message ?? err))
    }
  }

  async function clearVenice() {
    try {
      await window.api.ai.clearTier2?.()
      setTier2Configured(false)
      setVeniceKeyPreview('')
      setVeniceKeyEncrypted(false)
      setVeniceApiKey('')
      setEditingVeniceKey(true)
      showToast('success', 'Venice API key removed')
    } catch (err: any) {
      console.error('[AI] Failed to clear Venice key:', err)
      showToast('error', err?.message ?? 'Failed to clear Venice key')
    }
  }

  async function refreshQueueStatus() {
    try {
      const status = await window.api.ai.getQueueStatus() as QueueStatus
      setQueueStatus(status)
    } catch (err) {
      console.error('[AI] Failed to get queue status:', err)
    }
  }

  // Refresh the undo button's availability. Called after every
  // approve / reject so the button enables itself, and after undo
  // itself so the button disables again.
  async function refreshUndoStatus() {
    try {
      const s = await window.api.ai.undoStatus?.()
      setUndoStatus({
        available: !!s?.available,
        decisionType: s?.decisionType,
      })
    } catch {
      setUndoStatus({ available: false })
    }
  }

  async function undoLastReview() {
    try {
      const r = await window.api.ai.undoLastReview?.()
      if (r?.ok) {
        showToast?.('success', 'Reverted last review decision')
        loadReviewItems()
        refreshUndoStatus()
      } else {
        showToast?.('error', r?.error ?? 'Nothing to undo')
      }
    } catch (err: any) {
      showToast?.('error', err?.message ?? 'Undo failed')
    }
  }

  async function loadReviewItems(statusOverride?: 'pending' | 'approved' | 'rejected' | 'all', sortOverride?: 'newest' | 'uncertainty') {
    try {
      const status = statusOverride ?? reviewListStatus
      const sort = sortOverride ?? reviewListSort
      const result = await window.api.ai.getReviewList({ limit: 50, status, sort }) as { items: ReviewItem[]; total: number }
      setReviewItems(result.items)
      setReviewTotal(result.total)
    } catch (err) {
      console.error('[AI] Failed to load review items:', err)
    }
  }

  async function queueUntagged() {
    try {
      const result = await window.api.ai.queueUntagged() as { queued: number }
      showToast('success', `Queued ${result.queued} untagged items`)
      refreshQueueStatus()
    } catch (err: any) {
      console.error('[AI] Failed to queue untagged:', err)
      showToast('error', err?.message ?? 'Failed to queue untagged items')
    }
  }

  async function queueAll() {
    try {
      const result = await window.api.ai.queueAll() as { queued: number }
      showToast('success', `Queued ${result.queued} items for analysis`)
      refreshQueueStatus()
    } catch (err: any) {
      console.error('[AI] Failed to queue all:', err)
      showToast('error', err?.message ?? 'Failed to queue items')
    }
  }

  async function startProcessing() {
    try {
      await window.api.ai.start({
        enableTier2: tier2Enabled && tier2Configured,
        // 0 = manual review for everything (default). >0 means tags ≥ threshold
        // get auto-applied to the media; the rest stay pending in the review queue.
        autoApproveThreshold: aiAutoApproveThreshold,
        batchLimit,
      })
      const note = batchLimit > 0 ? ` (will pause after ${batchLimit} items)` : ''
      showToast('success', `AI processing started${note}`)
      refreshQueueStatus()
    } catch (err: any) {
      console.error('[AI] Failed to start processing:', err)
      showToast('error', err?.message ?? 'Failed to start processing')
    }
  }

  async function pauseProcessing() {
    try {
      await window.api.ai.pause()
      showToast('info', 'Processing paused')
      refreshQueueStatus()
    } catch (err: any) {
      console.error('[AI] Failed to pause:', err)
      showToast('error', err?.message ?? 'Failed to pause processing')
    }
  }

  async function resumeProcessing() {
    try {
      await window.api.ai.resume()
      showToast('info', 'Processing resumed')
      refreshQueueStatus()
    } catch (err: any) {
      console.error('[AI] Failed to resume:', err)
      showToast('error', err?.message ?? 'Failed to resume processing')
    }
  }

  async function stopProcessing() {
    try {
      await window.api.ai.stop()
      showToast('info', 'Processing stopped')
      refreshQueueStatus()
    } catch (err: any) {
      console.error('[AI] Failed to stop:', err)
      showToast('error', err?.message ?? 'Failed to stop processing')
    }
  }

  async function approveItem(mediaId: string) {
    try {
      await window.api.ai.approve(mediaId)
      loadReviewItems()
      refreshQueueStatus()
      refreshUndoStatus()
      if (selectedReviewItem?.mediaId === mediaId) {
        setSelectedReviewItem(null)
      }
    } catch (err: any) {
      console.error('[AI] Failed to approve:', err)
      showToast('error', err?.message ?? 'Failed to approve item')
    }
  }

  async function approveEditedItem() {
    if (!selectedReviewItem) return
    try {
      // Merge three sources of new tags:
      //   1. AI suggested-new chips the user clicked (selectedNewTagNames)
      //   2. Custom tags the user typed + clicked Add (customTagsPending)
      //   3. Anything still in the input box (comma-separated fallback)
      const fromInput = newTagInput
        ? newTagInput.split(',').map((t) => t.trim()).filter(Boolean)
        : []
      const newTags = Array.from(new Set([
        ...selectedNewTagNames,
        ...customTagsPending,
        ...fromInput,
      ]))
      await window.api.ai.approveEdited(selectedReviewItem.mediaId, {
        selectedTagIds: Array.from(selectedTags),
        editedTitle: editedTitle || undefined,
        editedDescription: editedDescription !== (selectedReviewItem.description ?? '') ? editedDescription : undefined,
        // Pass the originals too so the backend can log them as rejection
        // signals when they differ from the user's edits.
        originalTitle: selectedReviewItem.suggestedTitle ?? null,
        originalDescription: selectedReviewItem.description ?? null,
        newTags: newTags.length > 0 ? newTags : undefined
      })
      showToast('success', 'Item approved with edits')
      loadReviewItems()
      refreshQueueStatus()
      refreshUndoStatus()
      // If new tags were just created, refresh autocomplete so the
      // next review's custom-tag input suggests them. Skipped when
      // only existing tags were applied to keep the IPC cheap.
      if (newTags.length > 0) {
        try {
          const tags = await window.api.tags?.list?.()
          if (Array.isArray(tags)) {
            setAllTagNames(tags.map((t: any) => String(t.name ?? t).toLowerCase()).filter(Boolean))
          }
        } catch { /* leave stale */ }
      }
      setSelectedReviewItem(null)
      setSelectedTags(new Set())
      setEditedTitle('')
      setNewTagInput('')
    } catch (err: any) {
      console.error('[AI] Failed to approve edited:', err)
      showToast('error', err?.message ?? 'Failed to approve edited item')
    }
  }

  async function rejectItem(mediaId: string) {
    try {
      await window.api.ai.reject(mediaId)
      loadReviewItems()
      refreshQueueStatus()
      refreshUndoStatus()
      if (selectedReviewItem?.mediaId === mediaId) {
        setSelectedReviewItem(null)
      }
    } catch (err: any) {
      console.error('[AI] Failed to reject:', err)
      showToast('error', err?.message ?? 'Failed to reject item')
    }
  }

  async function bulkApproveAll() {
    try {
      const result = await window.api.ai.bulkApprove() as { approved: number }
      showToast('success', `Approved ${result.approved} items`)
      loadReviewItems()
      refreshQueueStatus()
    } catch (err: any) {
      console.error('[AI] Failed to bulk approve:', err)
      showToast('error', err?.message ?? 'Failed to bulk approve')
    }
  }

  async function bulkRejectAll() {
    try {
      const result = await window.api.ai.bulkReject() as { rejected: number }
      showToast('success', `Rejected ${result.rejected} items`)
      loadReviewItems()
      refreshQueueStatus()
      setSelectedReviewItem(null)
    } catch (err: any) {
      console.error('[AI] Failed to bulk reject:', err)
      showToast('error', err?.message ?? 'Failed to bulk reject')
    }
  }

  async function clearAllFailed() {
    try {
      const result = await window.api.ai.clearFailed()
      showToast('success', `Cleared ${result.cleared} failed items`)
      refreshQueueStatus()
      loadReviewItems()
    } catch (err: any) {
      console.error('[AI] Failed to clear failed:', err)
      showToast('error', err?.message ?? 'Failed to clear failed items')
    }
  }

  function selectReviewItem(item: ReviewItem) {
    setSelectedReviewItem(item)
    setSelectedTags(new Set(item.matchedTags.map(t => t.id)))
    // Default: pre-check ALL AI-suggested new tags so the user can deselect
    // the wrong ones rather than re-select every right one. Matches the
    // existing "matched tags start pre-checked" behavior.
    setSelectedNewTagNames(new Set(item.newTagSuggestions.map(s => s.name.toLowerCase())))
    setCustomTagsPending([])
    setEditedTitle(item.suggestedTitle || '')
    setEditedDescription(item.description || '')
    setEditedFilename(item.suggestedFilename || '')
    setNewTagInput('')
    setCooccurSuggestions([])
    setContactSheetExpanded(false)
    // Fetch the contact-sheet path async — non-blocking so the rest of
    // the pane renders immediately. Returns null if the queue hasn't
    // generated it yet (still on Tier 2 or non-video).
    setContactSheetPath(null)
    setContactSheetUrl('')
    window.api.ai.contactSheetPath?.(item.mediaId).then(async (p: string | null) => {
      if (p) {
        setContactSheetPath(p)
        try {
          const url = await toFileUrlCached(p)
          setContactSheetUrl(url)
        } catch { /* ignore */ }
      }
    }).catch(() => { /* missing is fine — just don't render the panel */ })
    // Similar items — fetch 3 visually-comparable approved items so the
    // reviewer can see what was previously tagged similarly. Resolves
    // thumbnails async via toFileUrlCached so they actually load.
    setSimilarItems([])
    setSimilarThumbs({})
    window.api.ai.similar?.({ mediaId: item.mediaId, limit: 3, matchType: 'any' })
      .then(async (r: any) => {
        const items: Array<{
          mediaId: string
          filename: string
          thumbPath: string | null
          similarity: number
          sharedTags: string[]
        }> = (r?.items ?? []).map((it: any) => ({
          mediaId: it.mediaId,
          filename: it.filename,
          thumbPath: it.thumbPath,
          similarity: it.similarity,
          sharedTags: it.sharedTags ?? [],
        }))
        setSimilarItems(items)
        const thumbs: Record<string, string> = {}
        await Promise.all(items.map(async (s) => {
          if (s.thumbPath) {
            try {
              thumbs[s.mediaId] = await toFileUrlCached(s.thumbPath)
            } catch { /* ignore */ }
          }
        }))
        setSimilarThumbs(thumbs)
      })
      .catch(() => { /* leave empty */ })

    // Build a name→category map for this item's suggested tags so we
    // can group chips by category in the picker UI below.
    const tagNames = [
      ...item.matchedTags.map(t => t.name),
      ...item.newTagSuggestions.map(s => s.name),
    ]
    if (tagNames.length > 0) {
      Promise.all(tagNames.map(async (name) => {
        try {
          const cat = await window.api.ai.tagCategory?.(name)
          return [name.toLowerCase(), (cat as string) || 'other'] as [string, string]
        } catch {
          return [name.toLowerCase(), 'other'] as [string, string]
        }
      })).then((pairs) => {
        const next: Record<string, string> = {}
        for (const [n, c] of pairs) next[n] = c
        setTagCategoryMap(next)
      })
    } else {
      setTagCategoryMap({})
    }
  }

  // Refresh co-occurrence suggestions whenever the selection changes.
  // Debounced because clicking through many chips in quick succession
  // would otherwise spam the (cheap but still nontrivial) matrix query.
  useEffect(() => {
    if (!selectedReviewItem) return
    const handle = setTimeout(async () => {
      // Collect current selection by NAME (mix of matched-tag names +
      // new-tag names + custom-pending). Pass exclude list so we don't
      // re-suggest things the user already has or has marked protected.
      const matchedNames = (selectedReviewItem.matchedTags ?? [])
        .filter((t) => selectedTags.has(t.id))
        .map((t) => t.name.toLowerCase())
      const selected = Array.from(new Set([
        ...matchedNames,
        ...Array.from(selectedNewTagNames),
        ...customTagsPending,
      ]))
      const exclude = Array.from(new Set([
        ...selected,
        ...protectedTags.map((t) => t.toLowerCase()),
      ]))
      try {
        const result = await window.api.ai.cooccurrenceSuggest?.({ selected, exclude, limit: 8 })
        setCooccurSuggestions(result ?? [])
      } catch (err) {
        console.warn('[AI] cooccurrence suggest failed:', err)
        setCooccurSuggestions([])
      }
    }, 200)
    return () => clearTimeout(handle)
  }, [selectedReviewItem, selectedTags, selectedNewTagNames, customTagsPending, protectedTags])

  async function applyRenameSuggestion() {
    if (!selectedReviewItem) return
    const target = editedFilename.trim()
    if (!target) {
      showToast('error', 'Filename cannot be empty')
      return
    }
    setRenameApplying(true)
    try {
      const result = await window.api.media?.rename?.(selectedReviewItem.mediaId, target)
      if (result?.success) {
        showToast('success', result.renamed ? `Renamed to ${result.newFilename}` : 'No rename needed')
        // Update the in-memory selection so the header reflects the new name immediately.
        if (result.newFilename) {
          setSelectedReviewItem({ ...selectedReviewItem, filename: result.newFilename, suggestedFilename: null })
        }
        loadReviewItems()
      } else {
        showToast('error', result?.error ?? 'Rename failed')
      }
    } catch (err: any) {
      showToast('error', err?.message ?? 'Rename failed')
    } finally {
      setRenameApplying(false)
    }
  }

  async function rejectRenameSuggestion() {
    if (!selectedReviewItem) return
    try {
      await window.api.media?.rejectRenameSuggestion?.(selectedReviewItem.mediaId)
      setSelectedReviewItem({ ...selectedReviewItem, suggestedFilename: null })
      setEditedFilename('')
      showToast('info', 'Suggestion dismissed')
    } catch (err: any) {
      showToast('error', err?.message ?? 'Failed to dismiss suggestion')
    }
  }

  // Keyboard shortcuts for the Review pane. Fires when the user has a
  // review item selected and is NOT typing in a text input. Lets the
  // user rip through a queue without ever touching the mouse:
  //   A = approve (with current edits)   R = reject
  //   J = previous item                  K = next item
  //   N = next item alias                U / Ctrl+Z = undo last decision
  useEffect(() => {
    if (activeTab !== 'review' || !selectedReviewItem) return
    const onKey = (e: KeyboardEvent) => {
      // Don't hijack typing in inputs / textareas / contenteditable.
      const target = e.target as HTMLElement | null
      const tag = target?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || target?.isContentEditable) return
      const k = e.key.toLowerCase()
      // Ctrl/Cmd+Z — undo. Fires regardless of selection.
      if ((e.ctrlKey || e.metaKey) && k === 'z' && !e.shiftKey && !e.altKey) {
        if (undoStatus.available) {
          e.preventDefault()
          undoLastReview()
        }
        return
      }
      // Other shortcuts shouldn't have modifiers.
      if (e.ctrlKey || e.metaKey || e.altKey) return
      const idx = reviewItems.findIndex((it) => it.mediaId === selectedReviewItem.mediaId)
      if (k === 'a') {
        e.preventDefault()
        approveEditedItem()
      } else if (k === 'r') {
        e.preventDefault()
        rejectItem(selectedReviewItem.mediaId)
      } else if (k === 'j') {
        e.preventDefault()
        if (idx > 0) selectReviewItem(reviewItems[idx - 1])
      } else if (k === 'k' || k === 'n') {
        e.preventDefault()
        if (idx >= 0 && idx < reviewItems.length - 1) selectReviewItem(reviewItems[idx + 1])
      } else if (k === 'u') {
        // Plain 'U' as a no-modifier alternative to Ctrl/Cmd+Z.
        if (undoStatus.available) {
          e.preventDefault()
          undoLastReview()
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, selectedReviewItem?.mediaId, reviewItems.length, undoStatus.available])

  // formatBytes is imported from utils/formatters

  return (
    <div className="h-full flex flex-col bg-[var(--bg)]">
      {/* Header */}
      <div className="flex-none px-6 py-4 border-b border-[var(--border)]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Brain size={24} className="text-[var(--primary)]" />
            <div>
              <h1 className="text-xl font-semibold">AI Tools</h1>
              <p className="text-sm text-[var(--muted)]">AI-powered library management</p>
            </div>
          </div>

          {/* Tab navigation */}
          <div className="flex gap-2">
            {(['setup', 'queue', 'review', 'tools'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={cn(
                  'px-4 py-2 rounded-lg text-sm font-medium transition',
                  activeTab === tab
                    ? 'bg-[var(--primary)] text-white'
                    : 'bg-white/5 hover:bg-white/10 text-[var(--text)]'
                )}
              >
                {tab === 'setup' ? 'Setup' : tab === 'queue' ? 'Queue' : tab === 'review' ? 'Review' : 'Utilities'}
                {tab === 'review' && reviewTotal > 0 && (
                  <span className="ml-2 px-1.5 py-0.5 rounded-full bg-white/20 text-xs">{reviewTotal}</span>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6 pb-safe">
        {activeTab === 'setup' && (
          <div className="max-w-2xl mx-auto space-y-6">
            {/* Models Section */}
            <div className="bg-[var(--panel)] rounded-xl border border-[var(--border)] p-6">
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <Download size={20} />
                AI Models
              </h2>

              {models.length === 0 ? (
                <p className="text-[var(--muted)]">Loading model status...</p>
              ) : (
                <div className="space-y-3">
                  {models.map(model => (
                    <div key={model.filename} className="flex items-center justify-between p-3 bg-white/5 rounded-lg">
                      <div>
                        <div className="font-medium">{model.name}</div>
                        <div className="text-sm text-[var(--muted)]">{formatBytes(model.size)}</div>
                      </div>
                      {model.downloaded ? (
                        <CheckCircle2 size={20} className="text-green-500" />
                      ) : downloadingModel === model.name ? (
                        <div className="flex items-center gap-2 min-w-[120px]">
                          <div className="flex-1 h-2 bg-black/30 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-gradient-to-r from-[var(--primary)] to-purple-500 transition-all duration-300"
                              style={{ width: `${downloadProgress}%` }}
                            />
                          </div>
                          <span className="text-xs text-[var(--muted)] w-10 text-right">{downloadProgress}%</span>
                        </div>
                      ) : (
                        <XCircle size={20} className="text-red-500/50" />
                      )}
                    </div>
                  ))}

                  {!modelsReady && (
                    <div className="space-y-3">
                      <button
                        onClick={downloadModels}
                        disabled={!!downloadingModel}
                        className={cn(
                          'w-full py-3 rounded-lg font-medium transition',
                          downloadingModel
                            ? 'bg-white/10 text-[var(--muted)] cursor-not-allowed'
                            : 'bg-[var(--primary)] text-white hover:opacity-90'
                        )}
                      >
                        {downloadingModel ? (
                          <span className="flex items-center justify-center gap-2">
                            <Loader2 size={16} className="animate-spin" />
                            Downloading {downloadingModel}...
                          </span>
                        ) : (
                          'Download Missing Models'
                        )}
                      </button>
                      {downloadingModel && (
                        <div className="bg-black/20 rounded-lg p-3">
                          <div className="flex justify-between text-xs text-[var(--muted)] mb-2">
                            <span>Downloading: {downloadingModel}</span>
                            <span>{downloadProgress}%</span>
                          </div>
                          <div className="h-2 bg-black/30 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-gradient-to-r from-[var(--primary)] to-purple-500 transition-all duration-300"
                              style={{ width: `${downloadProgress}%` }}
                            />
                          </div>
                          <p className="text-xs text-[var(--muted)] mt-2 opacity-70">
                            Large models may take several minutes. Please keep this page open.
                          </p>
                        </div>
                      )}
                    </div>
                  )}

                  {modelsReady && (
                    <div className="flex items-center gap-2 text-green-500 text-sm">
                      <CheckCircle2 size={16} />
                      All models ready for Tier 1 analysis
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Venice API Section */}
            <div className="bg-[var(--panel)] rounded-xl border border-[var(--border)] p-6">
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <Sparkles size={20} />
                Venice AI (Tier 2) - Optional
              </h2>
              <p className="text-sm text-[var(--muted)] mb-4">
                Enable deep analysis with Venice AI's vision model for better titles, descriptions, and tags.
                Get an API key at <span className="text-[var(--primary)]">venice.ai</span>
              </p>

              {tier2Configured && !editingVeniceKey ? (
                // Display mode — masked preview chip with "Confirmed" badge.
                // Slightly transparent on purpose: the user can see the
                // saved-key tail without it standing out as exposed text.
                <div className="space-y-2">
                  <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white/5 border border-[var(--border)]">
                    <span className="font-mono text-sm tracking-wider text-[var(--text)] opacity-50 select-none flex-1">
                      {veniceKeyPreview || '••••••••••••'}
                    </span>
                    <span
                      className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-green-500/15 border border-green-500/30 text-green-400 text-xs font-medium"
                      title={veniceKeyEncrypted ? 'Stored encrypted via OS keychain (Windows DPAPI / macOS Keychain / Linux libsecret)' : 'Stored (encryption unavailable)'}
                    >
                      <CheckCircle2 size={12} />
                      Confirmed
                      {veniceKeyEncrypted && <span className="opacity-60">· encrypted</span>}
                    </span>
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    <button
                      onClick={() => { setEditingVeniceKey(true); setVeniceApiKey('') }}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium bg-white/10 hover:bg-white/15 transition"
                    >
                      Replace key
                    </button>
                    <button
                      onClick={reloadKeyFromFile}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium bg-[var(--primary)]/15 hover:bg-[var(--primary)]/25 text-[var(--primary)] border border-[var(--primary)]/30 transition"
                      title="Re-read C:\dev\.api-keys.env and overwrite the stored key"
                    >
                      Reload from .api-keys.env
                    </button>
                    <button
                      onClick={clearVenice}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium bg-red-500/15 hover:bg-red-500/25 text-red-300 border border-red-500/20 transition"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ) : (
                // Edit / first-time mode — input + save.
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <input
                      type="password"
                      value={veniceApiKey}
                      onChange={(e) => setVeniceApiKey(e.target.value)}
                      placeholder="Enter Venice API key..."
                      className="flex-1 px-4 py-2 rounded-lg bg-white/5 border border-[var(--border)] focus:border-[var(--primary)] focus:outline-none"
                    />
                    <button
                      onClick={configureVenice}
                      disabled={!veniceApiKey.trim()}
                      className={cn(
                        'px-4 py-2 rounded-lg font-medium transition',
                        veniceApiKey.trim()
                          ? 'bg-[var(--primary)] text-white hover:opacity-90'
                          : 'bg-white/10 text-[var(--muted)] cursor-not-allowed'
                      )}
                    >
                      Save
                    </button>
                    {tier2Configured && (
                      <button
                        onClick={() => { setEditingVeniceKey(false); setVeniceApiKey('') }}
                        className="px-3 py-2 rounded-lg text-sm bg-white/5 hover:bg-white/10 transition"
                      >
                        Cancel
                      </button>
                    )}
                  </div>
                  <p className="text-xs text-[var(--muted)] opacity-70">
                    Saved keys are encrypted with the OS keychain (DPAPI on Windows). The plaintext never lives in any settings file.
                  </p>
                  <div className="pt-2 mt-2 border-t border-[var(--border)]">
                    <button
                      onClick={reloadKeyFromFile}
                      className="text-xs text-[var(--primary)] hover:underline"
                      title="Re-read C:\dev\.api-keys.env and import the Venice key without restarting"
                    >
                      Reload from .api-keys.env
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* ThePornDB (TpDB) scene fingerprint API. When matched,
                the queue can skip Venice entirely and pull canonical
                performer + studio + tags directly from TpDB. Hash
                lookup also lets the Review pane "match this scene"
                button identify commercial content. */}
            <div className="bg-[var(--panel)] rounded-xl border border-[var(--border)] p-6">
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <Tag size={20} />
                ThePornDB (TpDB) - Optional
              </h2>
              <p className="text-sm text-[var(--muted)] mb-4">
                Scene fingerprint + performer/studio metadata for
                commercial content. When matched, Vault gets canonical
                tags + performer names + studio + release date directly
                — no Venice call needed. Get a key at
                <span className="text-[var(--primary)]"> theporndb.net</span>
                (free tier exists).
              </p>
              {tpdbConfigured && !editingTpdbKey ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between p-3 bg-white/5 rounded-lg">
                    <div className="flex items-center gap-3 min-w-0">
                      {tpdbHealthy === null ? (
                        <Loader2 size={18} className="animate-spin text-[var(--muted)]" />
                      ) : tpdbHealthy ? (
                        <CheckCircle2 size={18} className="text-green-500" />
                      ) : (
                        <AlertCircle size={18} className="text-amber-500" />
                      )}
                      <div className="min-w-0">
                        <div className="font-medium text-sm">
                          {tpdbHealthy === null && 'Validating…'}
                          {tpdbHealthy === true && 'Connected'}
                          {tpdbHealthy === false && 'Saved but API check failed'}
                        </div>
                        <div className="text-[10px] text-[var(--muted)] mt-0.5 font-mono">
                          {tpdbPreview || '••••••••••••'}
                          {tpdbEncrypted && <span className="ml-2 text-green-300">encrypted</span>}
                        </div>
                        {tpdbHealthy === false && tpdbHealthError && (
                          <div className="text-[10px] text-amber-300 mt-1 max-w-md break-words" title={tpdbHealthError}>
                            {tpdbHealthError}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => { setEditingTpdbKey(true); setTpdbKeyInput('') }}
                        className="text-xs px-2 py-1 rounded bg-white/5 hover:bg-white/10 text-[var(--primary)] transition"
                      >
                        Replace
                      </button>
                      <button
                        onClick={async () => {
                          try {
                            await window.api.ai.tpdbClear?.()
                            setTpdbConfigured(false)
                            setTpdbPreview('')
                            setTpdbHealthy(null)
                            setEditingTpdbKey(true)
                            showToast?.('success', 'TpDB key cleared')
                          } catch (err: any) {
                            showToast?.('error', err?.message ?? 'Clear failed')
                          }
                        }}
                        className="text-xs px-2 py-1 rounded bg-red-500/10 hover:bg-red-500/20 text-red-300 transition"
                      >
                        Clear
                      </button>
                    </div>
                  </div>
                  <button
                    onClick={async () => {
                      try {
                        const r = await window.api.ai.tpdbReloadFromFile?.()
                        if (r?.ok) {
                          setTpdbConfigured(true)
                          setTpdbPreview(r.preview ?? '')
                          setTpdbEncrypted(!!r.encrypted)
                          showToast?.('success', 'Reloaded TpDB key from .api-keys.env')
                          // Re-validate health
                          const h = await window.api.ai.tpdbHealth?.()
                          setTpdbHealthy(!!h?.ok)
                          setTpdbHealthError(h?.ok ? null : (h?.reason ?? null))
                        } else {
                          showToast?.('error', r?.message ?? 'No key found in file')
                        }
                      } catch (err: any) {
                        showToast?.('error', err?.message ?? 'Reload failed')
                      }
                    }}
                    className="text-xs text-[var(--primary)] hover:underline"
                  >
                    Reload from .api-keys.env
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  <input
                    type="password"
                    value={tpdbKeyInput}
                    onChange={(e) => setTpdbKeyInput(e.target.value)}
                    placeholder="TpDB API key (Bearer token)"
                    className="w-full px-3 py-2 rounded-lg bg-white/5 border border-[var(--border)] focus:border-[var(--primary)] focus:outline-none text-sm font-mono"
                  />
                  <div className="flex items-center gap-2">
                    <button
                      onClick={async () => {
                        if (!tpdbKeyInput.trim()) return
                        try {
                          const r = await window.api.ai.tpdbConfigure?.({ apiKey: tpdbKeyInput.trim() })
                          if (r?.ok) {
                            setTpdbConfigured(true)
                            setTpdbPreview(r.preview ?? '')
                            setTpdbEncrypted(!!r.encrypted)
                            setEditingTpdbKey(false)
                            setTpdbKeyInput('')
                            showToast?.('success', `TpDB key saved${r.encrypted ? ' (encrypted)' : ''}`)
                            const h = await window.api.ai.tpdbHealth?.()
                            setTpdbHealthy(!!h?.ok)
                          setTpdbHealthError(h?.ok ? null : (h?.reason ?? null))
                          } else {
                            showToast?.('error', r?.error ?? 'Save failed')
                          }
                        } catch (err: any) {
                          showToast?.('error', err?.message ?? 'Save failed')
                        }
                      }}
                      disabled={!tpdbKeyInput.trim()}
                      className="px-4 py-2 rounded-lg bg-[var(--primary)] text-white text-sm font-medium hover:opacity-90 transition disabled:opacity-50"
                    >
                      Save
                    </button>
                    {tpdbConfigured && (
                      <button
                        onClick={() => { setEditingTpdbKey(false); setTpdbKeyInput('') }}
                        className="px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-sm transition"
                      >
                        Cancel
                      </button>
                    )}
                    <button
                      onClick={async () => {
                        try {
                          const r = await window.api.ai.tpdbReloadFromFile?.()
                          if (r?.ok) {
                            setTpdbConfigured(true)
                            setTpdbPreview(r.preview ?? '')
                            setTpdbEncrypted(!!r.encrypted)
                            setEditingTpdbKey(false)
                            showToast?.('success', 'Loaded from .api-keys.env')
                            const h = await window.api.ai.tpdbHealth?.()
                            setTpdbHealthy(!!h?.ok)
                          setTpdbHealthError(h?.ok ? null : (h?.reason ?? null))
                          } else {
                            showToast?.('error', r?.message ?? 'No key found in file')
                          }
                        } catch (err: any) {
                          showToast?.('error', err?.message ?? 'Reload failed')
                        }
                      }}
                      className="text-xs text-[var(--primary)] hover:underline ml-auto"
                    >
                      Reload from .api-keys.env
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* JoyCaption sidecar status — supplementary uncensored
                LLaVA caption + booru-style tags. Runs in PARALLEL with
                Venice, not as a fallback. Helps with descriptions and
                tag mining when Venice's output is sparse, but Venice
                remains the source of truth for Tier 2. */}
            <div className="bg-[var(--panel)] rounded-xl border border-[var(--border)] p-6">
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <Brain size={20} />
                JoyCaption (Optional supplement)
              </h2>
              <p className="text-sm text-[var(--muted)] mb-4">
                Uncensored local VLM (Apache-2.0 LLaVA on Llama-3.1) that runs alongside Venice
                to add a second descriptive caption + booru tag list. Not a Venice replacement —
                supplements rich_tags / description.
              </p>
              <div className="flex items-center justify-between p-3 bg-white/5 rounded-lg mb-3">
                <div className="flex items-center gap-3">
                  {joycaptionStatus === null ? (
                    <Loader2 size={18} className="animate-spin text-[var(--muted)]" />
                  ) : joycaptionStatus.online ? (
                    <CheckCircle2 size={18} className="text-green-500" />
                  ) : joycaptionStatus.installed ? (
                    <AlertCircle size={18} className="text-amber-500" />
                  ) : (
                    <XCircle size={18} className="text-red-500/60" />
                  )}
                  <div>
                    <div className="font-medium text-sm">
                      {joycaptionStatus === null && 'Checking…'}
                      {joycaptionStatus?.online && 'Online'}
                      {joycaptionStatus && !joycaptionStatus.online && joycaptionStatus.installed && 'Installed — sidecar offline'}
                      {joycaptionStatus && !joycaptionStatus.installed && 'Not installed'}
                    </div>
                    {joycaptionStatus?.online && (
                      <div className="text-xs text-[var(--muted)] mt-0.5">
                        {joycaptionStatus.device || 'cpu'}
                        {typeof joycaptionStatus.vramGb === 'number' ? ` · ${joycaptionStatus.vramGb.toFixed(1)} GB VRAM` : ''}
                      </div>
                    )}
                    {joycaptionStatus && !joycaptionStatus.online && joycaptionStatus.installPath && (
                      <div className="text-xs text-[var(--muted)] mt-0.5 font-mono truncate max-w-md">
                        {joycaptionStatus.installPath}
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  {joycaptionStatus?.online && (
                    <button
                      onClick={async () => {
                        try {
                          const r = await window.api.ai.joycaptionStop?.()
                          if (r?.wasManaging) {
                            showToast?.('success', 'Sidecar stopped')
                            setJoycaptionStatus(null)
                            const s = await window.api.ai.joycaptionStatus?.()
                            setJoycaptionStatus(s ?? { installed: false, installPath: null, online: false })
                          } else {
                            showToast?.('info', 'Sidecar runs out-of-band; close its console window manually')
                          }
                        } catch (err: any) {
                          showToast?.('error', err?.message ?? 'Stop failed')
                        }
                      }}
                      className="text-xs px-2 py-1 rounded bg-red-500/10 hover:bg-red-500/20 text-red-300 transition"
                      title="Shut down a sidecar Vault launched"
                    >
                      Stop
                    </button>
                  )}
                  <button
                    onClick={async () => {
                      try {
                        setJoycaptionStatus(null)
                        const s = await window.api.ai.joycaptionStatus?.()
                        setJoycaptionStatus(s ?? { installed: false, installPath: null, online: false })
                      } catch {
                        setJoycaptionStatus({ installed: false, installPath: null, online: false })
                      }
                    }}
                    className="text-xs px-2 py-1 rounded bg-white/5 hover:bg-white/10 text-[var(--primary)] transition"
                  >
                    Re-check
                  </button>
                </div>
              </div>
              {joycaptionStatus && !joycaptionStatus.installed && (
                <div className="text-xs text-[var(--muted)]">
                  Install at <span className="font-mono text-[var(--primary)]">C:\dev\joycaption-sidecar</span> —
                  run <span className="font-mono">setup.bat</span> then <span className="font-mono">start.bat</span> (bf16 ~17GB VRAM)
                  or <span className="font-mono">start_4bit.bat</span> (~6-8GB VRAM).
                </div>
              )}
              {joycaptionStatus && joycaptionStatus.installed && !joycaptionStatus.online && (
                <div className="space-y-2">
                  <div className="text-xs text-[var(--muted)]">
                    Sidecar found but /health didn't respond. Vault can launch it for you — pick a VRAM tier:
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1 bg-black/20 rounded-md p-0.5 border border-[var(--border)]">
                      {(['4bit', 'bf16'] as const).map((m) => (
                        <button
                          key={m}
                          onClick={() => setJoycaptionMode(m)}
                          className={cn(
                            'px-2.5 py-1 rounded text-[11px] font-medium transition',
                            joycaptionMode === m
                              ? 'bg-[var(--primary)] text-white'
                              : 'text-[var(--muted)] hover:text-white'
                          )}
                          title={m === '4bit'
                            ? '4-bit quantized — ~6-8GB VRAM, slightly lower quality'
                            : 'bf16 — ~17GB VRAM, full quality'}
                        >
                          {m === '4bit' ? '4-bit (6-8GB)' : 'bf16 (17GB)'}
                        </button>
                      ))}
                    </div>
                    <button
                      onClick={async () => {
                        setJoycaptionStartBusy(true)
                        try {
                          const r = await window.api.ai.joycaptionStart?.({ mode: joycaptionMode })
                          if (r?.ok) {
                            showToast?.('success', 'JoyCaption sidecar is online')
                            // Re-poll status so the badge updates.
                            const s = await window.api.ai.joycaptionStatus?.()
                            if (s) setJoycaptionStatus(s)
                          } else {
                            showToast?.('error', r?.message ?? 'Failed to start sidecar')
                          }
                        } catch (err: any) {
                          showToast?.('error', err?.message ?? 'Start failed')
                        } finally {
                          setJoycaptionStartBusy(false)
                        }
                      }}
                      disabled={joycaptionStartBusy}
                      className="text-xs px-3 py-1.5 rounded bg-[var(--primary)]/20 hover:bg-[var(--primary)]/30 border border-[var(--primary)]/40 text-[var(--primary)] transition disabled:opacity-50"
                    >
                      {joycaptionStartBusy ? (
                        <span className="inline-flex items-center gap-1">
                          <Loader2 size={12} className="animate-spin" />
                          Starting (30-180s)…
                        </span>
                      ) : 'Start sidecar'}
                    </button>
                  </div>
                  <div className="text-[10px] text-[var(--muted)]">
                    Or run <span className="font-mono">{joycaptionMode === '4bit' ? 'start_4bit.bat' : 'start.bat'}</span> manually in the install directory.
                  </div>
                </div>
              )}

              {/* Smoke-test button — captions a single thumbnail from
                  the user's library so they can verify the install
                  works before queueing real media. Disabled until the
                  sidecar reports online. */}
              {joycaptionStatus?.online && (
                <div className="mt-3 pt-3 border-t border-white/5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-xs text-[var(--muted)] flex-1">
                      Run a smoke test on a library thumbnail.
                    </div>
                    {/* Caption style picker — descriptive matches Venice's
                        output shape, the booru styles emit comma-separated
                        tag lists. */}
                    <select
                      value={joycaptionTestStyle}
                      onChange={(e) => setJoycaptionTestStyle(e.target.value as typeof joycaptionTestStyle)}
                      className="text-xs px-2 py-1.5 rounded bg-white/5 border border-[var(--border)] focus:border-[var(--primary)] focus:outline-none"
                      title="Caption style for the smoke test"
                    >
                      <option value="descriptive">descriptive</option>
                      <option value="descriptive-casual">descriptive-casual</option>
                      <option value="straightforward">straightforward</option>
                      <option value="tags-danbooru">tags-danbooru</option>
                      <option value="tags-e621">tags-e621</option>
                      <option value="tags-rule34">tags-rule34</option>
                    </select>
                    <button
                      onClick={async () => {
                        setJoycaptionTestBusy(true)
                        setJoycaptionTestResult(null)
                        try {
                          // Prefer the currently-selected review item, else
                          // the first in the review list, else a search.
                          let thumbPath: string | null =
                            selectedReviewItem?.thumbnailPath
                            ?? reviewItems[0]?.thumbnailPath
                            ?? null
                          let thumbFilename: string =
                            selectedReviewItem?.filename
                            ?? reviewItems[0]?.filename
                            ?? ''
                          if (!thumbPath) {
                            try {
                              const r = await window.api.media.search({ limit: 1 } as any)
                              const items: any[] = Array.isArray(r) ? r : r?.items ?? []
                              const first = items[0]
                              if (first?.id) {
                                thumbPath = await window.api.media.generateThumb?.(first.id) ?? null
                                thumbFilename = first.filename ?? ''
                              }
                            } catch { /* fall through */ }
                          }
                          if (!thumbPath) {
                            setJoycaptionTestResult({ ok: false, error: 'No library media to test with' })
                            return
                          }
                          let thumbUrl = ''
                          try { thumbUrl = await toFileUrlCached(thumbPath) } catch { /* render falls back to no preview */ }
                          const res = await window.api.ai.joycaptionTest?.({ imagePath: thumbPath, style: joycaptionTestStyle })
                          setJoycaptionTestResult({
                            ...(res ?? { ok: false, error: 'No response from sidecar' }),
                            thumbUrl,
                            thumbFilename,
                          })
                        } catch (err: any) {
                          setJoycaptionTestResult({ ok: false, error: err?.message ?? String(err) })
                        } finally {
                          setJoycaptionTestBusy(false)
                        }
                      }}
                      disabled={joycaptionTestBusy}
                      className="text-xs px-3 py-1.5 rounded bg-[var(--primary)]/20 hover:bg-[var(--primary)]/30 border border-[var(--primary)]/40 text-[var(--primary)] transition disabled:opacity-50"
                    >
                      {joycaptionTestBusy ? (
                        <span className="inline-flex items-center gap-1">
                          <Loader2 size={12} className="animate-spin" /> Captioning…
                        </span>
                      ) : 'Test caption'}
                    </button>
                  </div>
                  {joycaptionTestResult && (
                    <div className={cn(
                      'mt-3 rounded-lg border px-3 py-2 text-xs',
                      joycaptionTestResult.ok
                        ? 'border-green-500/30 bg-green-500/10 text-green-100'
                        : 'border-red-500/30 bg-red-500/10 text-red-200'
                    )}>
                      {joycaptionTestResult.ok ? (
                        <div className="flex gap-3">
                          {joycaptionTestResult.thumbUrl && (
                            <img
                              src={joycaptionTestResult.thumbUrl}
                              alt={joycaptionTestResult.thumbFilename || 'Test thumbnail'}
                              className="w-24 h-24 object-cover rounded border border-white/10 flex-shrink-0"
                              loading="lazy"
                            />
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-green-200 mb-1">
                              Caption ({(joycaptionTestResult.latencyMs ?? 0).toFixed(0)} ms
                              {typeof joycaptionTestResult.vramGb === 'number' ? ` · ${joycaptionTestResult.vramGb.toFixed(1)} GB VRAM` : ''})
                            </div>
                            {joycaptionTestResult.thumbFilename && (
                              <div className="text-[10px] text-green-200/60 mb-1 font-mono truncate">
                                {joycaptionTestResult.thumbFilename}
                              </div>
                            )}
                            <div className="opacity-95 whitespace-pre-wrap">{joycaptionTestResult.caption}</div>
                          </div>
                        </div>
                      ) : (
                        <div>{joycaptionTestResult.error}</div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* MoveNet pose detector — emits performer-count tags
                (solo / couple / threesome / group) + body-orientation
                tags (standing / lying down / kneeling / sitting) as
                low-confidence priors before Tier 2. Tier 2 confirms or
                overrides. Downloadable via the "Download AI Models"
                button in the Models section above. */}
            <div className="bg-[var(--panel)] rounded-xl border border-[var(--border)] p-6">
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <Eye size={20} />
                MoveNet pose detector
              </h2>
              <p className="text-sm text-[var(--muted)] mb-4">
                17-keypoint pose estimation (Google MoveNet MultiPose).
                Detects up to 6 people per frame and emits performer-count +
                body-orientation tags before Tier 2.
                ~12 MB ONNX, ~150 ms/frame on CPU.
              </p>
              <div className="flex items-center justify-between p-3 bg-white/5 rounded-lg">
                <div className="flex items-center gap-3 min-w-0">
                  {poseDetectorStatus === null ? (
                    <Loader2 size={18} className="animate-spin text-[var(--muted)]" />
                  ) : poseDetectorStatus.installed ? (
                    <CheckCircle2 size={18} className="text-green-500" />
                  ) : (
                    <XCircle size={18} className="text-red-500/60" />
                  )}
                  <div className="min-w-0">
                    <div className="font-medium text-sm">
                      {poseDetectorStatus === null && 'Checking…'}
                      {poseDetectorStatus?.installed && (
                        <>Installed <span className="text-[var(--muted)] font-normal">· {formatBytes(poseDetectorStatus.sizeBytes)}</span></>
                      )}
                      {poseDetectorStatus && !poseDetectorStatus.installed && 'Not installed'}
                    </div>
                    {poseDetectorStatus?.expectedPath && (
                      <div className="text-[10px] text-[var(--muted)] mt-0.5 font-mono truncate" title={poseDetectorStatus.expectedPath}>
                        {poseDetectorStatus.expectedPath}
                      </div>
                    )}
                  </div>
                </div>
                <button
                  onClick={async () => {
                    setPoseDetectorStatus(null)
                    try {
                      const s = await window.api.ai.poseDetectorStatus?.()
                      setPoseDetectorStatus(s ?? { installed: false, expectedPath: '', sizeBytes: 0 })
                    } catch {
                      setPoseDetectorStatus({ installed: false, expectedPath: '', sizeBytes: 0 })
                    }
                  }}
                  className="text-xs px-2 py-1 rounded bg-white/5 hover:bg-white/10 text-[var(--primary)] transition flex-shrink-0"
                >
                  Re-check
                </button>
              </div>
              {poseDetectorStatus && !poseDetectorStatus.installed && (
                <div className="text-[11px] text-[var(--muted)] mt-2 space-y-1">
                  <div>To install (~12 MB):</div>
                  <ol className="list-decimal pl-4 space-y-0.5">
                    <li>Convert Google's TF Hub <span className="font-mono">movenet/multipose/lightning</span> to ONNX via PINTO_model_zoo, OR find a community ONNX (e.g. on HuggingFace search "movenet multipose lightning onnx").</li>
                    <li>Save the file at the path above (filename: <span className="font-mono">movenet-multipose-lightning.onnx</span>).</li>
                    <li>Restart Vault — the queue auto-detects it.</li>
                  </ol>
                </div>
              )}
            </div>

            {/* YuNet face detector — tiny ~340KB ONNX from
                opencv_zoo. Emits performer-count priors based on face
                count voted across frames. Complements MoveNet pose
                detection: face works on close-ups where pose fails,
                pose works on long shots where faces are too small.
                When BOTH independently say "2 people", couple gets
                a strong cross-model agreement boost. */}
            <div className="bg-[var(--panel)] rounded-xl border border-[var(--border)] p-6">
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <Eye size={20} />
                YuNet face detector
              </h2>
              <p className="text-sm text-[var(--muted)] mb-4">
                Face bounding-box detector (~340 KB ONNX). Detects up to 6 faces
                per frame for performer-count tagging. ~30 ms/frame on CPU —
                effectively free.
              </p>
              <div className="flex items-center justify-between p-3 bg-white/5 rounded-lg">
                <div className="flex items-center gap-3 min-w-0">
                  {faceDetectorStatus === null ? (
                    <Loader2 size={18} className="animate-spin text-[var(--muted)]" />
                  ) : faceDetectorStatus.installed ? (
                    <CheckCircle2 size={18} className="text-green-500" />
                  ) : (
                    <XCircle size={18} className="text-red-500/60" />
                  )}
                  <div className="min-w-0">
                    <div className="font-medium text-sm">
                      {faceDetectorStatus === null && 'Checking…'}
                      {faceDetectorStatus?.installed && (
                        <>Installed <span className="text-[var(--muted)] font-normal">· {formatBytes(faceDetectorStatus.sizeBytes)}</span></>
                      )}
                      {faceDetectorStatus && !faceDetectorStatus.installed && 'Not installed'}
                    </div>
                    {faceDetectorStatus?.expectedPath && (
                      <div className="text-[10px] text-[var(--muted)] mt-0.5 font-mono truncate" title={faceDetectorStatus.expectedPath}>
                        {faceDetectorStatus.expectedPath}
                      </div>
                    )}
                  </div>
                </div>
                <button
                  onClick={async () => {
                    setFaceDetectorStatus(null)
                    try {
                      const s = await window.api.ai.faceDetectorStatus?.()
                      setFaceDetectorStatus(s ?? { installed: false, expectedPath: '', sizeBytes: 0 })
                    } catch {
                      setFaceDetectorStatus({ installed: false, expectedPath: '', sizeBytes: 0 })
                    }
                  }}
                  className="text-xs px-2 py-1 rounded bg-white/5 hover:bg-white/10 text-[var(--primary)] transition flex-shrink-0"
                >
                  Re-check
                </button>
              </div>
              {faceDetectorStatus && !faceDetectorStatus.installed && (
                <div className="text-[11px] text-[var(--muted)] mt-2 space-y-1">
                  <div>To install (~340 KB):</div>
                  <ol className="list-decimal pl-4 space-y-0.5">
                    <li>Get the 2023mar variant from <span className="font-mono text-[var(--primary)]/80">github.com/opencv/opencv_zoo/tree/main/models/face_detection_yunet</span> — file <span className="font-mono">face_detection_yunet_2023mar.onnx</span>.</li>
                    <li>Save it at the path above (rename to <span className="font-mono">face-detection-yunet.onnx</span>).</li>
                    <li>Restart Vault — the queue auto-detects it.</li>
                  </ol>
                </div>
              )}
            </div>

            {/* Whisper.cpp — optional speech-to-text transcription
                for dirty-talk / dialogue-driven tag mining. Uses an
                external whisper-cli binary so we don't bloat the
                Electron bundle. Keyword-matches transcript phrases
                against a curated rule set ("daddy" → dirty talk,
                "i'm gonna cum" → orgasm, "doggy" → doggystyle).
                Costs 10-30s per video on tiny.en — opt-in toggle
                keeps the queue fast for users who don't need it. */}
            <div className="bg-[var(--panel)] rounded-xl border border-[var(--border)] p-6">
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <Volume2 size={20} />
                Whisper transcription (Optional)
              </h2>
              <p className="text-sm text-[var(--muted)] mb-4">
                Transcribes the first 90 s of audio via an external whisper-cli
                binary and scans for dirty-talk / position / cumshot keywords.
                Adds 10-30 s/video on tiny.en — useful for dialogue-heavy
                content, wasted on silent / music-only.
              </p>
              <div className="flex items-center justify-between p-3 bg-white/5 rounded-lg mb-3">
                <div className="flex items-center gap-3 min-w-0">
                  {whisperStatus === null ? (
                    <Loader2 size={18} className="animate-spin text-[var(--muted)]" />
                  ) : whisperStatus.installed && whisperStatus.enabled ? (
                    <CheckCircle2 size={18} className="text-green-500" />
                  ) : whisperStatus.installed ? (
                    <AlertCircle size={18} className="text-amber-500" />
                  ) : (
                    <XCircle size={18} className="text-red-500/60" />
                  )}
                  <div className="min-w-0">
                    <div className="font-medium text-sm">
                      {whisperStatus === null && 'Checking…'}
                      {whisperStatus?.installed && whisperStatus.enabled && (
                        <>Enabled <span className="text-[var(--muted)] font-normal">· {whisperStatus.modelName}</span></>
                      )}
                      {whisperStatus?.installed && !whisperStatus.enabled && (
                        <>Installed — opt-in to use</>
                      )}
                      {whisperStatus && !whisperStatus.installed && 'Not installed'}
                    </div>
                    {whisperStatus?.installDir && (
                      <div className="text-[10px] text-[var(--muted)] mt-0.5 font-mono truncate" title={whisperStatus.installDir}>
                        {whisperStatus.installDir}
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {whisperStatus?.installed && (
                    <button
                      onClick={async () => {
                        const next = !whisperStatus.enabled
                        try {
                          await window.api.ai.whisperSetEnabled?.(next)
                          setWhisperStatus({ ...whisperStatus, enabled: next })
                          showToast?.('success', next ? 'Whisper enabled' : 'Whisper disabled')
                        } catch (err: any) {
                          showToast?.('error', err?.message ?? 'Toggle failed')
                        }
                      }}
                      className={cn(
                        'w-12 h-6 rounded-full transition relative',
                        whisperStatus.enabled ? 'bg-[var(--primary)]' : 'bg-white/20'
                      )}
                      title={whisperStatus.enabled ? 'Click to disable' : 'Click to enable'}
                    >
                      <div className={cn(
                        'absolute top-1 w-4 h-4 rounded-full bg-white transition-all',
                        whisperStatus.enabled ? 'left-7' : 'left-1'
                      )} />
                    </button>
                  )}
                  <button
                    onClick={async () => {
                      setWhisperStatus(null)
                      try {
                        const s = await window.api.ai.whisperStatus?.()
                        setWhisperStatus(s ?? { installed: false, enabled: false, installDir: null, binaryPath: null, modelPath: null, modelName: null })
                      } catch {
                        setWhisperStatus({ installed: false, enabled: false, installDir: null, binaryPath: null, modelPath: null, modelName: null })
                      }
                    }}
                    className="text-xs px-2 py-1 rounded bg-white/5 hover:bg-white/10 text-[var(--primary)] transition"
                  >
                    Re-check
                  </button>
                </div>
              </div>
              {whisperStatus && !whisperStatus.installed && (
                <div className="text-[11px] text-[var(--muted)] space-y-1">
                  <div>To install:</div>
                  <ol className="list-decimal pl-4 space-y-0.5">
                    <li>Grab a Windows build from <span className="font-mono text-[var(--primary)]/80">github.com/ggerganov/whisper.cpp/releases</span> — pick a <span className="font-mono">whisper-bin-x64.zip</span>.</li>
                    <li>Extract to <span className="font-mono">C:\dev\whisper-cpp\</span> (or <span className="font-mono">~/whisper-cpp/</span>) so <span className="font-mono">whisper-cli.exe</span> sits at the install root.</li>
                    <li>Drop <span className="font-mono">ggml-tiny.en.bin</span> into a <span className="font-mono">models/</span> subdirectory — download from <span className="font-mono text-[var(--primary)]/80">huggingface.co/ggerganov/whisper.cpp</span>.</li>
                  </ol>
                </div>
              )}
            </div>

            {/* NudeNet v3 — optional body-part detector. Emits direct
                tag priors for exposed/covered body parts. Manual
                install because the canonical model mirrors keep
                moving and we don't want a download URL that 404s. */}
            <div className="bg-[var(--panel)] rounded-xl border border-[var(--border)] p-6">
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <Eye size={20} />
                NudeNet v3 detector (Optional)
              </h2>
              <p className="text-sm text-[var(--muted)] mb-4">
                YOLOv5-format body-part detector — 18 classes. Emits
                <span className="font-mono"> exposed breasts</span>,
                <span className="font-mono"> exposed pussy</span>,
                <span className="font-mono"> exposed ass</span>,
                <span className="font-mono"> anal</span>, etc.
                with bounding-box confidence. Manual install.
              </p>
              <div className="flex items-center justify-between p-3 bg-white/5 rounded-lg mb-3">
                <div className="flex items-center gap-3 min-w-0">
                  {nudenetStatus === null ? (
                    <Loader2 size={18} className="animate-spin text-[var(--muted)]" />
                  ) : nudenetStatus.installed ? (
                    <CheckCircle2 size={18} className="text-green-500" />
                  ) : (
                    <XCircle size={18} className="text-red-500/60" />
                  )}
                  <div className="min-w-0">
                    <div className="font-medium text-sm">
                      {nudenetStatus === null && 'Checking…'}
                      {nudenetStatus?.installed && (
                        <>Installed <span className="text-[var(--muted)] font-normal">· {formatBytes(nudenetStatus.sizeBytes)}</span></>
                      )}
                      {nudenetStatus && !nudenetStatus.installed && 'Not installed'}
                    </div>
                    {nudenetStatus?.expectedPath && (
                      <div className="text-[10px] text-[var(--muted)] mt-0.5 font-mono truncate" title={nudenetStatus.expectedPath}>
                        {nudenetStatus.expectedPath}
                      </div>
                    )}
                  </div>
                </div>
                <button
                  onClick={async () => {
                    setNudenetStatus(null)
                    try {
                      const s = await window.api.ai.nudenetStatus?.()
                      setNudenetStatus(s ?? { installed: false, expectedPath: '', sizeBytes: 0 })
                    } catch {
                      setNudenetStatus({ installed: false, expectedPath: '', sizeBytes: 0 })
                    }
                  }}
                  className="text-xs px-2 py-1 rounded bg-white/5 hover:bg-white/10 text-[var(--primary)] transition flex-shrink-0"
                >
                  Re-check
                </button>
              </div>
              {nudenetStatus && !nudenetStatus.installed && (
                <div className="text-[11px] text-[var(--muted)] space-y-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span>One-click install:</span>
                    <button
                      onClick={async () => {
                        const r = await window.api.ai.nudenetDownload?.({ variant: 'nano' })
                        if (r?.ok) {
                          showToast?.('success', r.alreadyPresent ? 'Already installed' : `Nano installed (${formatBytes(r.sizeBytes ?? 0)}) · restart to activate`)
                          const s = await window.api.ai.nudenetStatus?.()
                          setNudenetStatus(s ?? null)
                        } else {
                          showToast?.('error', r?.error ?? 'Download failed')
                        }
                      }}
                      className="text-[11px] px-2 py-0.5 rounded bg-[var(--primary)] hover:opacity-90 text-white transition"
                    >
                      Nano (~12 MB)
                    </button>
                    <button
                      onClick={async () => {
                        const r = await window.api.ai.nudenetDownload?.({ variant: 'medium' })
                        if (r?.ok) {
                          showToast?.('success', r.alreadyPresent ? 'Already installed' : `Medium installed (${formatBytes(r.sizeBytes ?? 0)}) · restart to activate`)
                          const s = await window.api.ai.nudenetStatus?.()
                          setNudenetStatus(s ?? null)
                        } else {
                          showToast?.('error', r?.error ?? 'Download failed')
                        }
                      }}
                      className="text-[11px] px-2 py-0.5 rounded bg-[var(--primary)] hover:opacity-90 text-white transition"
                    >
                      Medium (~103 MB)
                    </button>
                  </div>
                  <div>
                    Or grab manually from <span className="font-mono text-[var(--primary)]/80">github.com/notAI-tech/NudeNet</span> and drop at the path above as <span className="font-mono">nudenet-detector.onnx</span>.
                  </div>
                </div>
              )}
            </div>

            {/* Gender classifier — runs on each face from YuNet,
                emits composition tags (lesbian / gay / straight /
                MFF / MMF). Manual install at userData/models/
                gender-classifier.onnx (community ONNX export of
                Intel age-gender-recognition-retail-0013 or
                equivalent). */}
            <div className="bg-[var(--panel)] rounded-xl border border-[var(--border)] p-6">
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <Eye size={20} />
                Gender classifier (Optional)
              </h2>
              <p className="text-sm text-[var(--muted)] mb-4">
                Classifies each detected face. Emits composition tags
                from the face mix: <span className="font-mono">lesbian</span> /
                <span className="font-mono"> gay</span> /
                <span className="font-mono"> straight</span> /
                <span className="font-mono"> MFF threesome</span> /
                <span className="font-mono"> MMF threesome</span>.
                Requires face detector + manual install of a small ONNX
                gender model.
              </p>
              <div className="flex items-center justify-between p-3 bg-white/5 rounded-lg">
                <div className="flex items-center gap-3 min-w-0">
                  {genderStatus === null ? (
                    <Loader2 size={18} className="animate-spin text-[var(--muted)]" />
                  ) : genderStatus.installed ? (
                    <CheckCircle2 size={18} className="text-green-500" />
                  ) : (
                    <XCircle size={18} className="text-red-500/60" />
                  )}
                  <div className="min-w-0">
                    <div className="font-medium text-sm">
                      {genderStatus === null && 'Checking…'}
                      {genderStatus?.installed && (
                        <>Installed <span className="text-[var(--muted)] font-normal">· {formatBytes(genderStatus.sizeBytes)}</span></>
                      )}
                      {genderStatus && !genderStatus.installed && 'Not installed'}
                    </div>
                    {genderStatus?.expectedPath && (
                      <div className="text-[10px] text-[var(--muted)] mt-0.5 font-mono truncate" title={genderStatus.expectedPath}>
                        {genderStatus.expectedPath}
                      </div>
                    )}
                  </div>
                </div>
                <button
                  onClick={async () => {
                    setGenderStatus(null)
                    try {
                      const s = await window.api.ai.genderClassifierStatus?.()
                      setGenderStatus(s ?? { installed: false, expectedPath: '', sizeBytes: 0 })
                    } catch {
                      setGenderStatus({ installed: false, expectedPath: '', sizeBytes: 0 })
                    }
                  }}
                  className="text-xs px-2 py-1 rounded bg-white/5 hover:bg-white/10 text-[var(--primary)] transition flex-shrink-0"
                >
                  Re-check
                </button>
              </div>
              {genderStatus && !genderStatus.installed && (
                <div className="text-[11px] text-[var(--muted)] mt-2">
                  Expected: 62×62 BGR input, output shape <span className="font-mono">[1, 2]</span> softmax (female, male)
                  or <span className="font-mono">[1, 1]</span> sigmoid (male). Drop the ONNX at the path above and restart Vault.
                </div>
              )}
            </div>

            {/* Tier 1 / Tier 2 advanced settings — WD Tagger variant
                + multi-hypothesis Venice sampling. Both opt-in. */}
            <div className="bg-[var(--panel)] rounded-xl border border-[var(--border)] p-6">
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <Sliders size={20} />
                Advanced — Tagger Variants
              </h2>

              <div className="space-y-4">
                <div>
                  <div className="flex items-start justify-between mb-2 gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm">WD Tagger variant</div>
                      <div className="text-xs text-[var(--muted)]">
                        Takes effect after restart. Drop the model ONNX at
                        <code className="text-[10px] mx-1">userData/models/&lt;filename&gt;.onnx</code>
                        and pick the variant here.
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-1 bg-black/20 rounded-md p-0.5 border border-[var(--border)]">
                      {([
                        { v: 'swinv2',      label: 'SwinV2 (467MB)' },
                        { v: 'vit',         label: 'ViT (343MB)' },
                        { v: 'pixai',       label: 'PixAI (anime)' },
                        { v: 'joytag',      label: 'JoyTag (NSFW)' },
                        { v: 'idolsankaku', label: 'idolsankaku' },
                      ] as const).map(({ v, label }) => (
                        <button
                          key={v}
                          onClick={async () => {
                            setWdVariant(v)
                            try {
                              await window.api.ai.wdVariantSet?.(v)
                              showToast?.('success', `WD Tagger → ${label} (restart to apply)`)
                            } catch (err: any) {
                              showToast?.('error', err?.message ?? 'Failed to set variant')
                            }
                          }}
                          className={cn(
                            'px-2.5 py-1 rounded text-[11px] font-medium transition whitespace-nowrap',
                            wdVariant === v
                              ? 'bg-[var(--primary)] text-white'
                              : 'text-[var(--muted)] hover:text-white'
                          )}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <div className="font-medium text-sm">Multi-hypothesis Venice sampling</div>
                      <div className="text-xs text-[var(--muted)]">
                        Run Tier 2 N times per item; vote on tags.
                        Reduces hallucination at N× Venice cost.
                      </div>
                    </div>
                    <div className="flex items-center gap-1 bg-black/20 rounded-md p-0.5 border border-[var(--border)]">
                      {[1, 2, 3].map((n) => (
                        <button
                          key={n}
                          onClick={async () => {
                            setVeniceMultiSample(n)
                            try {
                              await window.api.ai.veniceMultiSampleSet?.(n)
                              showToast?.('success', n === 1 ? 'Multi-sample disabled' : `Multi-sample: ${n} runs`)
                            } catch (err: any) {
                              showToast?.('error', err?.message ?? 'Failed to set')
                            }
                          }}
                          className={cn(
                            'px-2.5 py-1 rounded text-[11px] font-medium transition tabular-nums',
                            veniceMultiSample === n
                              ? 'bg-[var(--primary)] text-white'
                              : 'text-[var(--muted)] hover:text-white'
                          )}
                        >
                          {n}×
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* miles-deep — optional 6-class sex-act classifier from
                ryanjay0/miles-deep. Reported 95% accuracy on its target
                classes (blowjob_handjob / cunnilingus / sex_back /
                sex_front / titfuck / other). Original is a Caffe model
                so no public ONNX exists; user converts + drops the file
                at the expected path. When installed, the queue auto-
                detects it and folds its tag priors into Tier 1. */}
            <div className="bg-[var(--panel)] rounded-xl border border-[var(--border)] p-6">
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <Zap size={20} />
                miles-deep classifier (Optional)
              </h2>
              <p className="text-sm text-[var(--muted)] mb-4">
                ResNet50_1by2 sex-act classifier — 6 classes, 95% reported accuracy.
                Auto-folds its class priors into Tier 1 when the model file is on disk.
                No download (the upstream model is Caffe; you convert it locally).
              </p>
              <div className="flex items-center justify-between p-3 bg-white/5 rounded-lg mb-3">
                <div className="flex items-center gap-3 min-w-0">
                  {milesDeepStatus === null ? (
                    <Loader2 size={18} className="animate-spin text-[var(--muted)]" />
                  ) : milesDeepStatus.installed ? (
                    <CheckCircle2 size={18} className="text-green-500" />
                  ) : (
                    <XCircle size={18} className="text-red-500/60" />
                  )}
                  <div className="min-w-0">
                    <div className="font-medium text-sm">
                      {milesDeepStatus === null && 'Checking…'}
                      {milesDeepStatus?.installed && (
                        <>Installed <span className="text-[var(--muted)] font-normal">· {formatBytes(milesDeepStatus.sizeBytes)}</span></>
                      )}
                      {milesDeepStatus && !milesDeepStatus.installed && 'Not installed'}
                    </div>
                    {milesDeepStatus?.expectedPath && (
                      <div className="text-[10px] text-[var(--muted)] mt-0.5 font-mono truncate" title={milesDeepStatus.expectedPath}>
                        {milesDeepStatus.expectedPath}
                      </div>
                    )}
                  </div>
                </div>
                <button
                  onClick={async () => {
                    setMilesDeepStatus(null)
                    try {
                      const s = await window.api.ai.milesDeepStatus?.()
                      setMilesDeepStatus(s ?? { installed: false, expectedPath: '', sizeBytes: 0 })
                    } catch {
                      setMilesDeepStatus({ installed: false, expectedPath: '', sizeBytes: 0 })
                    }
                  }}
                  className="text-xs px-2 py-1 rounded bg-white/5 hover:bg-white/10 text-[var(--primary)] transition flex-shrink-0"
                >
                  Re-check
                </button>
              </div>
              {milesDeepStatus && !milesDeepStatus.installed && (
                <div className="text-[11px] text-[var(--muted)] space-y-1">
                  <div>To install:</div>
                  <ol className="list-decimal pl-4 space-y-0.5">
                    <li>Convert <span className="font-mono">ryanjay0/miles-deep</span>'s Caffe model via <span className="font-mono">caffe2onnx</span>.</li>
                    <li>Drop the resulting <span className="font-mono">.onnx</span> at the path above.</li>
                    <li>Restart Vault — the queue auto-detects + uses it.</li>
                  </ol>
                </div>
              )}
            </div>

            {/* CLIP BPE tokenizer vocab — Apache-2.0 file from openai/CLIP.
                Without it, the CLIP text encoder uses a character-code
                placeholder (works for the fixed CLIP_TAG_CATEGORIES set,
                useless for arbitrary text). With it, real zero-shot
                tag validation + free-text CLIP search works correctly.
                One-click install from the openai/CLIP raw GitHub URL. */}
            <div className="bg-[var(--panel)] rounded-xl border border-[var(--border)] p-6">
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <Zap size={20} />
                CLIP BPE tokenizer (Optional)
              </h2>
              <p className="text-sm text-[var(--muted)] mb-4">
                Real byte-pair-encoding vocab from <span className="font-mono">openai/CLIP</span>.
                Required for accurate zero-shot tag validation and free-text CLIP image search.
                ~1.4 MB, Apache-2.0.
              </p>
              <div className="flex items-center justify-between p-3 bg-white/5 rounded-lg mb-3">
                <div className="flex items-center gap-3 min-w-0">
                  {clipBpeStatus === null ? (
                    <Loader2 size={18} className="animate-spin text-[var(--muted)]" />
                  ) : clipBpeStatus.available ? (
                    <CheckCircle2 size={18} className="text-green-500" />
                  ) : (
                    <XCircle size={18} className="text-red-500/60" />
                  )}
                  <div className="min-w-0">
                    <div className="font-medium text-sm">
                      {clipBpeStatus === null && 'Checking…'}
                      {clipBpeStatus?.available && (
                        <>Installed{typeof clipBpeStatus.vocabSize === 'number'
                          ? <> <span className="text-[var(--muted)] font-normal">· vocab {clipBpeStatus.vocabSize.toLocaleString()}</span></>
                          : null}</>
                      )}
                      {clipBpeStatus && !clipBpeStatus.available && 'Not installed — falling back to character-code placeholder'}
                    </div>
                    {clipBpeStatus?.expectedPath && (
                      <div className="text-[10px] text-[var(--muted)] mt-0.5 font-mono truncate" title={clipBpeStatus.expectedPath}>
                        {clipBpeStatus.expectedPath}
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {clipBpeStatus && !clipBpeStatus.available && (
                    <button
                      disabled={clipBpeBusy}
                      onClick={async () => {
                        setClipBpeBusy(true)
                        try {
                          const r = await window.api.ai.clipBpeDownload?.()
                          if (r?.ok) {
                            showToast?.('success', r.alreadyPresent ? 'Already installed' : `Downloaded ${formatBytes(r.sizeBytes ?? 0)} · restart to activate`)
                            const s = await window.api.ai.clipBpeStatus?.()
                            setClipBpeStatus(s ?? null)
                          } else {
                            showToast?.('error', r?.error ?? 'Download failed')
                          }
                        } catch (err: any) {
                          showToast?.('error', err?.message ?? 'Download failed')
                        } finally {
                          setClipBpeBusy(false)
                        }
                      }}
                      className="text-xs px-3 py-1 rounded bg-[var(--primary)] hover:opacity-90 text-white transition disabled:opacity-50"
                    >
                      {clipBpeBusy ? 'Downloading…' : 'Install'}
                    </button>
                  )}
                  <button
                    onClick={async () => {
                      setClipBpeStatus(null)
                      try {
                        const s = await window.api.ai.clipBpeStatus?.()
                        setClipBpeStatus(s ?? { available: false, expectedPath: '', vocabSize: null })
                      } catch {
                        setClipBpeStatus({ available: false, expectedPath: '', vocabSize: null })
                      }
                    }}
                    className="text-xs px-2 py-1 rounded bg-white/5 hover:bg-white/10 text-[var(--primary)] transition"
                  >
                    Re-check
                  </button>
                </div>
              </div>
              {clipBpeStatus?.available && (
                <p className="text-[11px] text-[var(--muted)]">
                  Vocab loaded. CLIP text → image search and zero-shot tag validation are using real BPE encoding.
                </p>
              )}
            </div>

            {/* More optional detectors — compact grid of model-file cards.
                Each probe is null-safe + returns whether the .onnx is on
                disk; the user drops the file and re-checks. The pattern
                is identical to the JoyCaption / NudeNet / CLIP BPE cards
                above, just dense to avoid scroll fatigue. */}
            <div className="bg-[var(--panel)] rounded-xl border border-[var(--border)] p-6">
              <h2 className="text-lg font-semibold mb-2 flex items-center gap-2">
                <Zap size={20} />
                More optional detectors
              </h2>
              <p className="text-sm text-[var(--muted)] mb-4">
                Drop the model file at the path shown and click <span className="font-mono">Re-check</span>.
                Each card self-disables when its model isn't present, so leaving them all uninstalled is fine.
              </p>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                <ModelFileCard
                  title="SFace face recognition"
                  description="128-D face embeddings → face_clusters. ~36 MB, Apache-2.0."
                  probe={() => window.api.ai.sfaceStatus?.() ?? Promise.resolve(null) as any}
                  download={() => window.api.ai.sfaceDownload?.() ?? Promise.resolve(undefined) as any}
                  upstreamUrl="https://github.com/opencv/opencv_zoo/tree/main/models/face_recognition_sface"
                  installHint="To swap in ArcFace's 512-D embeddings instead, drop face-recognition-arcface.onnx at the path above (auto-detected)."
                  onToast={showToast}
                />
                <ModelFileCard
                  title="Person ReID"
                  description="768-D body embeddings linked to face_clusters via shared frame_idx."
                  probe={() => window.api.ai.personReidStatus?.() ?? Promise.resolve(null) as any}
                  upstreamUrl="https://github.com/KaiyangZhou/deep-person-reid"
                  installHint="Drop person-reid.onnx at the path above. Used in the Performers tab's Bodies panel."
                  onToast={showToast}
                />
                <ModelFileCard
                  title="DB + CRNN OCR"
                  description="Two-stage OCR — replaces tesseract.js. Opt-in via settings.ai.useDbCrnnOcr."
                  probe={() => window.api.ai.dbCrnnStatus?.() ?? Promise.resolve(null) as any}
                  installHint="Drop text-detection-db.onnx and text-recognition-crnn.onnx at the path above."
                  onToast={showToast}
                />
                <ModelFileCard
                  title="LAION aesthetic predictor"
                  description="0-10 aesthetic score using existing CLIP image embeddings. Near-zero compute."
                  probe={() => window.api.ai.aestheticStatus?.() ?? Promise.resolve(null) as any}
                  upstreamUrl="https://github.com/LAION-AI/aesthetic-predictor"
                  installHint="Drop aesthetic-linear.json at the path above."
                  onToast={showToast}
                />
                <ModelFileCard
                  title="Deepfake / AI-face detector"
                  description="Binary classifier on 224×224 face crops from YuNet."
                  probe={() => window.api.ai.deepfakeStatus?.() ?? Promise.resolve(null) as any}
                  installHint="Drop deepfake-detector.onnx at the path above."
                  onToast={showToast}
                />
                <ModelFileCard
                  title="AI-image (full-frame) detector"
                  description="SigLIP / DINOv2 binary head on the full frame — complements the face-level deepfake detector."
                  probe={() => window.api.ai.aiImageStatus?.() ?? Promise.resolve(null) as any}
                  installHint="Drop ai-image-detector.onnx at the path above."
                  onToast={showToast}
                />
                <ModelFileCard
                  title="WhisperX sidecar"
                  description="Word-level + speaker-diarized transcripts on port 8031. Replaces whisper.cpp when up."
                  probe={() => window.api.ai.whisperxStatus?.() ?? Promise.resolve(null) as any}
                  upstreamUrl="https://github.com/m-bain/whisperX"
                  installHint="Set settings.ai.whisperxStartScript to a start.bat that activates the venv + runs server.py. Auto-start at boot via settings.ai.whisperxAutoStart."
                  onToast={showToast}
                />
                <ModelFileCard
                  title="F5-TTS sidecar"
                  description="Voice-clone alt to XTTS on port 8021. Switch via settings.ai.xyreneVoiceBackend = 'f5tts'."
                  probe={() => window.api.ai.f5ttsStatus?.() ?? Promise.resolve(null) as any}
                  upstreamUrl="https://github.com/SWivid/F5-TTS"
                  installHint="Set settings.ai.f5ttsStartScript to a start.bat that activates the venv + runs server.py. Auto-start at boot via settings.ai.f5ttsAutoStart."
                  onToast={showToast}
                />
                <ModelFileCard
                  title="Chromaprint (fpcalc)"
                  description="Audio fingerprinting for soundpack dedup + the new Audio Fingerprint dedup mode. ~600 KB, LGPL-2.1."
                  probe={() => window.api.ai.chromaprintStatus?.() ?? Promise.resolve(null) as any}
                  download={() => window.api.ai.fpcalcDownload?.() ?? Promise.resolve(undefined) as any}
                  upstreamUrl="https://acoustid.org/chromaprint"
                  installHint="Auto-download Windows-only. On Linux/macOS install via your package manager (apt install libchromaprint-tools / brew install chromaprint)."
                  onToast={showToast}
                />
                <ModelFileCard
                  title="JoyTag (second-opinion tagger)"
                  description="ViT trained on photographic NSFW with full Danbooru vocab. Runs alongside WD Tagger; consensus boost lifts confidence on agreed tags."
                  probe={() => window.api.media?.joytag?.status?.() ?? Promise.resolve(null)}
                  upstreamUrl="https://huggingface.co/fancyfeast/joytag"
                  installHint="Drop joytag.onnx + joytag-tags.txt at <userData>/models/. Once present, the tagger ensemble auto-includes it."
                  onToast={showToast}
                />
                <ModelFileCard
                  title="Image upscaler (Real-ESRGAN)"
                  description="4× SR for stills + thumbnails. Used by the 'Upscale' action in the right-click menu."
                  probe={() => window.api.media?.upscaler?.status?.() ?? Promise.resolve(null)}
                  upstreamUrl="https://github.com/xinntao/Real-ESRGAN"
                  installHint="Drop realesrgan-x4plus.onnx (or realesrgan-anime-x4.onnx for cartoons) at <userData>/models/. Tile size auto-tuned to VRAM."
                  onToast={showToast}
                />
              </div>
            </div>

            {/* v2.7 — Quality auditor + Clip similarity (action tools, not
                status probes). Both consume window.api.tags.quality/clipSimilarity
                bridges that previously had no UI surface. */}
            <div className="bg-[var(--panel)] rounded-xl border border-[var(--border)] p-4">
              <h2 className="text-lg font-semibold mb-2 flex items-center gap-2">
                <Activity size={18} className="text-emerald-400" />
                Audits & analysis
              </h2>
              <p className="text-sm text-[var(--muted)] mb-4">
                Action tools that probe a single media item: encode quality grade
                and visual-similarity neighbors.
              </p>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                <QualityAuditCard onToast={showToast} />
                <ClipSimilarityCard onToast={showToast} />
              </div>
            </div>

            {/* How it works */}
            <div className="bg-[var(--panel)] rounded-xl border border-[var(--border)] p-6">
              <h2 className="text-lg font-semibold mb-4">How It Works</h2>
              <div className="space-y-4 text-sm">
                <div className="flex gap-4">
                  <div className="w-8 h-8 rounded-full bg-[var(--primary)]/20 flex items-center justify-center text-[var(--primary)] font-bold">1</div>
                  <div>
                    <div className="font-medium">Tier 1: Local ONNX Analysis</div>
                    <div className="text-[var(--muted)]">Fast, offline NSFW classification and content tagging using WD Tagger</div>
                  </div>
                </div>
                <div className="flex gap-4">
                  <div className="w-8 h-8 rounded-full bg-[var(--secondary)]/20 flex items-center justify-center text-[var(--secondary)] font-bold">2</div>
                  <div>
                    <div className="font-medium">Tier 2: Venice AI Vision (Optional)</div>
                    <div className="text-[var(--muted)]">Deep analysis for titles, descriptions, and additional tags</div>
                  </div>
                </div>
                <div className="flex gap-4">
                  <div className="w-8 h-8 rounded-full bg-green-500/20 flex items-center justify-center text-green-500 font-bold">3</div>
                  <div>
                    <div className="font-medium">Tier 3: Tag Matching</div>
                    <div className="text-[var(--muted)]">Maps AI labels to your existing tags with synonym matching</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'queue' && (
          <div className="max-w-3xl mx-auto space-y-6">
            {/* Venice error banner — shows when backend has paused the
                queue due to rate-limit / unreachable / auth failure.
                Counts down to safe-retry. NO local-LLM fallback per
                user request — just clear messaging + retry timer. */}
            {veniceError && (() => {
              const remainingSec = veniceError.retryAt
                ? Math.max(0, Math.ceil((veniceError.retryAt - Date.now()) / 1000))
                : null
              const canRetry = remainingSec === null || remainingSec <= 0
              const label = veniceError.code === 'VENICE_RATE_LIMITED' ? 'Venice rate-limited'
                : veniceError.code === 'VENICE_UNREACHABLE' ? 'Venice unreachable'
                : veniceError.code === 'VENICE_AUTH_FAILED' ? 'Venice API key invalid'
                : 'Venice API error'
              return (
                <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3">
                      <AlertCircle size={20} className="text-red-400 flex-none mt-0.5" />
                      <div>
                        <div className="text-base font-semibold text-red-200">{label}</div>
                        <div className="text-sm text-red-200/80 mt-1">{veniceError.message}</div>
                        {remainingSec !== null && remainingSec > 0 && (
                          <div className="text-sm text-red-200/90 mt-2 font-mono">
                            Safe to retry in {Math.floor(remainingSec / 60) > 0 ? `${Math.floor(remainingSec / 60)}m ` : ''}{remainingSec % 60}s
                          </div>
                        )}
                        {canRetry && (
                          <div className="text-sm text-green-300/90 mt-2">Ready to retry now.</div>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-2 flex-none">
                      <button
                        onClick={() => setVeniceError(null)}
                        className="px-3 py-1.5 rounded-md text-xs bg-white/10 hover:bg-white/15 text-white transition"
                      >
                        Dismiss
                      </button>
                      <button
                        onClick={async () => {
                          if (!canRetry) {
                            showToast('warning', `Wait ${remainingSec}s before retrying`)
                            return
                          }
                          setVeniceError(null)
                          await startProcessing()
                        }}
                        disabled={!canRetry}
                        className={cn(
                          'px-3 py-1.5 rounded-md text-xs font-medium transition',
                          canRetry
                            ? 'bg-red-500/30 hover:bg-red-500/40 text-white'
                            : 'bg-white/10 text-white/40 cursor-not-allowed'
                        )}
                      >
                        Retry now
                      </button>
                    </div>
                  </div>
                </div>
              )
            })()}

            {/* Queue Status */}
            <div className="bg-[var(--panel)] rounded-xl border border-[var(--border)] p-6">
              <h2 className="text-lg font-semibold mb-4">Queue Status</h2>

              {queueStatus ? (
                <div className="grid grid-cols-5 gap-4 mb-6">
                  {[
                    { label: 'Total', value: queueStatus.total, color: 'text-[var(--text)]' },
                    { label: 'Pending', value: queueStatus.pending, color: 'text-yellow-500' },
                    { label: 'Processing', value: queueStatus.processing, color: 'text-blue-500' },
                    { label: 'Completed', value: queueStatus.completed, color: 'text-green-500' },
                    { label: 'Failed', value: queueStatus.failed, color: 'text-red-500' },
                  ].map(stat => (
                    <div key={stat.label} className="text-center p-3 bg-white/5 rounded-lg">
                      <div className={cn('text-2xl font-bold', stat.color)}>{stat.value}</div>
                      <div className="text-xs text-[var(--muted)]">{stat.label}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-[var(--muted)]">Loading queue status...</p>
              )}

              {/* Progress indicators — per-item stage bar + duration-weighted queue bar. */}
              {(processingProgress || queueProgress) && queueStatus?.isRunning && (
                <div className="mb-6 p-4 bg-white/5 rounded-lg space-y-4">
                  {/* Per-item bar */}
                  {processingProgress && (
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium">
                          Current: <span className="text-[var(--primary)]">{processingProgress.stage}</span>
                          {processingProgress.tier2Frame != null && processingProgress.tier2Total != null && (
                            <span className="ml-2 text-xs text-[var(--muted)] font-normal">
                              frame {processingProgress.tier2Frame}/{processingProgress.tier2Total}
                            </span>
                          )}
                          {processingProgress.framesExtracted != null && processingProgress.stage === 'extracting' && (
                            <span className="ml-2 text-xs text-[var(--muted)] font-normal">
                              {processingProgress.framesExtracted} frames
                            </span>
                          )}
                          {processingProgress.tier1Tags != null && processingProgress.stage === 'tier1' && (
                            <span className="ml-2 text-xs text-[var(--muted)] font-normal">
                              {processingProgress.tier1Tags} tags
                            </span>
                          )}
                        </span>
                        <span className="text-sm text-[var(--muted)]">{processingProgress.percent}%</span>
                      </div>
                      <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-[var(--primary)] to-[var(--secondary)] transition-all duration-300 progress-striped"
                          style={{ width: `${processingProgress.percent}%` }}
                        />
                      </div>
                    </div>
                  )}
                  {/* Queue-level bar (duration-weighted) */}
                  {queueProgress && queueProgress.totalCount > 0 && (
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium">
                          Queue total
                          <span className="ml-2 text-xs text-[var(--muted)] font-normal">
                            {queueProgress.completedCount}/{queueProgress.totalCount} items · {(queueProgress.completedSec / 60).toFixed(0)}m / {(queueProgress.totalSec / 60).toFixed(0)}m of video
                          </span>
                        </span>
                        <span className="text-sm text-[var(--muted)]">{queueProgress.percent}%</span>
                      </div>
                      <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-emerald-500 to-cyan-500 transition-all duration-300"
                          style={{ width: `${queueProgress.percent}%` }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Queue controls */}
              <div className="flex flex-wrap gap-3">
                <button
                  onClick={queueUntagged}
                  className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/15 transition text-sm"
                >
                  Queue Untagged
                </button>
                <button
                  onClick={queueAll}
                  className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/15 transition text-sm"
                >
                  Queue All
                </button>
                <button
                  onClick={async () => {
                    const ok = await confirm({
                      title: 'Re-scan every previously-scanned video?',
                      body: 'Items you already approved are skipped to preserve manual review work. Only pending/rejected items get re-queued.',
                      confirmLabel: 'Re-queue all',
                    })
                    if (!ok) return
                    try {
                      const result = await window.api.ai.requeueAll()
                      const skippedNote = result.skippedApproved > 0
                        ? ` · ${result.skippedApproved} approved items preserved`
                        : ''
                      showToast('success', `Re-queued ${result.requeued} items${skippedNote}`)
                      refreshQueueStatus()
                      loadReviewItems()
                    } catch (err: any) {
                      showToast('error', err?.message ?? 'Failed to re-queue')
                    }
                  }}
                  className="px-4 py-2 rounded-lg bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 transition text-sm"
                  title="Re-scan pending + rejected + failed items. Items you have already APPROVED are skipped — your manual review work is preserved."
                >
                  Re-scan All
                </button>
                <button
                  onClick={async () => {
                    const ok = await confirm({
                      title: 'Wipe ALL reviews and re-scan from scratch?',
                      body: 'This deletes every manual approval and runs the full pipeline on every video — including items you already curated. Only use this after major model or prompt upgrades.',
                      confirmLabel: 'Wipe + re-scan all',
                      danger: true,
                    })
                    if (!ok) return
                    try {
                      const result = await window.api.ai.requeueAll({ includeApproved: true })
                      showToast('warning', `Wiped reviews — re-queued ${result.requeued} items including approved`)
                      refreshQueueStatus()
                      loadReviewItems()
                    } catch (err: any) {
                      showToast('error', err?.message ?? 'Failed to re-queue')
                    }
                  }}
                  className="px-3 py-2 rounded-lg bg-red-600/15 hover:bg-red-600/25 text-red-300 border border-red-500/30 transition text-xs"
                  title="DESTRUCTIVE: re-scan EVERY item including approved ones, wiping prior review decisions."
                >
                  Reset & re-scan
                </button>
                {(queueStatus?.failed ?? 0) > 0 && (
                  <>
                    <button
                      onClick={async () => {
                        const result = await window.api.ai.retryFailed()
                        console.log(`[AI] Retried ${result.retried} failed items`)
                        refreshQueueStatus()
                      }}
                      className="px-4 py-2 rounded-lg bg-yellow-600/20 hover:bg-yellow-600/30 text-yellow-400 transition text-sm"
                    >
                      Retry Failed ({queueStatus?.failed})
                    </button>
                    <button
                      onClick={async () => {
                        const result = await window.api.ai.clearFailed()
                        console.log(`[AI] Cleared ${result.cleared} failed items`)
                        refreshQueueStatus()
                      }}
                      className="px-4 py-2 rounded-lg bg-red-600/20 hover:bg-red-600/30 text-red-400 transition text-sm"
                    >
                      Clear Failed
                    </button>
                  </>
                )}
                <button
                  onClick={refreshQueueStatus}
                  className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/15 transition text-sm"
                >
                  <RefreshCw size={16} />
                </button>
              </div>
            </div>

            {/* Processing Controls */}
            <div className="bg-[var(--panel)] rounded-xl border border-[var(--border)] p-6">
              <h2 className="text-lg font-semibold mb-4">Processing Controls</h2>

              {/* Tier 2 toggle */}
              <div className="flex items-center justify-between mb-4 p-3 bg-white/5 rounded-lg">
                <div>
                  <div className="font-medium">Enable Tier 2 (Venice AI)</div>
                  <div className="text-sm text-[var(--muted)]">
                    {tier2Configured ? 'Uses Venice AI for deep analysis' : 'Configure API key in Setup tab first'}
                  </div>
                </div>
                <button
                  onClick={() => setTier2Enabled(!tier2Enabled)}
                  disabled={!tier2Configured}
                  className={cn(
                    'w-12 h-6 rounded-full transition relative',
                    tier2Enabled && tier2Configured ? 'bg-[var(--primary)]' : 'bg-white/20',
                    !tier2Configured && 'opacity-50 cursor-not-allowed'
                  )}
                >
                  <div className={cn(
                    'absolute top-1 w-4 h-4 rounded-full bg-white transition-all',
                    tier2Enabled && tier2Configured ? 'left-7' : 'left-1'
                  )} />
                </button>
              </div>

              {/* Tier 1 tag suppression toggle. ON = ONNX tags reach Tier 3
                  (default). OFF = only Tier 2 / description-derived tags
                  reach Tier 3. Tier 1 content classification (NSFW
                  category) keeps running regardless. */}
              <div className="flex items-center justify-between mb-6 p-3 bg-white/5 rounded-lg">
                <div className="flex-1 mr-3">
                  <div className="font-medium">Use Tier 1 (ONNX) as tag source</div>
                  <div className="text-sm text-[var(--muted)]">
                    {disableTier1Tags
                      ? 'OFF — only Venice + description-derived tags reach the matcher (Tier 1 still classifies content for filtering)'
                      : 'ON — WD Tagger / NudeNet / CLIP tags feed the matcher alongside Venice'}
                  </div>
                </div>
                <button
                  onClick={async () => {
                    const next = !disableTier1Tags
                    try {
                      await window.api.ai.setDisableTier1Tags?.(next)
                      setDisableTier1Tags(next)
                      showToast(next ? 'info' : 'success', next
                        ? 'Tier 1 tags suppressed — re-scan to apply'
                        : 'Tier 1 tags re-enabled')
                    } catch (err: any) {
                      showToast('error', err?.message ?? 'Failed to toggle Tier 1')
                    }
                  }}
                  className={cn(
                    'w-12 h-6 rounded-full transition relative flex-shrink-0',
                    !disableTier1Tags ? 'bg-[var(--primary)]' : 'bg-white/20'
                  )}
                >
                  <div className={cn(
                    'absolute top-1 w-4 h-4 rounded-full bg-white transition-all',
                    !disableTier1Tags ? 'left-7' : 'left-1'
                  )} />
                </button>
              </div>

              {/* Auto-categorize threshold — analyzer.py:auto_categorize port */}
              <div className="rounded-lg bg-white/5 border border-[var(--border)] p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="font-medium text-sm">Auto-apply tags above confidence</div>
                  <span className="text-xs text-[var(--muted)] tabular-nums">
                    {aiAutoApproveThreshold === 0 ? 'OFF — manual review' : `≥ ${Math.round(aiAutoApproveThreshold * 100)}%`}
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  // Cap at 0.95 because Tier 2 confidences max out around there
                  // in practice — letting the user pick 1.0 made nothing pass.
                  // Server clamps too, so this is belt-and-suspenders.
                  max={0.95}
                  step={0.05}
                  value={aiAutoApproveThreshold}
                  onChange={(e) => setAiAutoApproveThreshold(parseFloat(e.target.value))}
                  className="w-full h-2 rounded-full bg-white/10 appearance-none cursor-pointer
                    [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4
                    [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[var(--primary)]"
                />
                <p className="text-[10px] text-[var(--muted)]">
                  Tags scoring ≥ this confidence are applied to media without review.
                  AI confidences max around 95% in practice — the slider tops out there so "100%" still applies tags.
                  Tier 2 rich-tags are now also auto-promoted (covers fresh libraries with no manual tags).
                  Set to OFF (left) for full manual review.
                </p>
                {/* Live preview — at the current threshold, how many of
                    the currently-pending review items would auto-apply?
                    Lets the user dial in a sensible threshold without
                    guessing. Approximation only: this looks at max
                    rich_tag confidence per item and doesn't account for
                    per-source threshold overrides. */}
                {autoApprovePreview && aiAutoApproveThreshold > 0 && (() => {
                  const t = Math.round(aiAutoApproveThreshold * 100) / 100
                  // Snap to the nearest 0.05 bucket the backend
                  // returned; the slider's step is 0.05 so they
                  // should align exactly.
                  const bucket = autoApprovePreview.histogram
                    .slice()
                    .sort((a, b) => Math.abs(a.threshold - t) - Math.abs(b.threshold - t))[0]
                  if (!bucket) return null
                  const pct = autoApprovePreview.total > 0
                    ? Math.round((bucket.count / autoApprovePreview.total) * 100)
                    : 0
                  return (
                    <div className="flex items-center justify-between gap-3 px-2 py-1.5 rounded bg-[var(--primary)]/10 border border-[var(--primary)]/20 text-[11px]">
                      <span className="text-[var(--primary)] font-medium">
                        ≈ <span className="tabular-nums">{bucket.count}</span> of <span className="tabular-nums">{autoApprovePreview.total}</span> pending items
                      </span>
                      <span className="text-[var(--muted)]">
                        would auto-apply at ≥ {Math.round(bucket.threshold * 100)}%
                        {autoApprovePreview.total > 0 && (
                          <span className="ml-1 opacity-70">({pct}%)</span>
                        )}
                      </span>
                    </div>
                  )
                })()}
              </div>

              {/* Batch limit — pause after N items so the user can review
                  progress incrementally instead of letting the queue chew
                  through their whole library unattended. 0 = unlimited. */}
              <div className="rounded-lg bg-white/5 border border-[var(--border)] p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="font-medium text-sm">Pause after this many items</div>
                  <span className="text-xs text-[var(--muted)] tabular-nums">
                    {batchLimit === 0 ? 'No limit · run until queue empty' : `${batchLimit} items`}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {[0, 25, 50, 100, 200, 500].map((n) => (
                    <button
                      key={n}
                      onClick={() => setBatchLimit(n)}
                      className={cn(
                        'flex-1 px-2 py-1.5 rounded-md text-xs transition',
                        batchLimit === n
                          ? 'bg-[var(--primary)] text-white'
                          : 'bg-white/5 hover:bg-white/10 text-[var(--muted)]'
                      )}
                    >
                      {n === 0 ? 'All' : n}
                    </button>
                  ))}
                </div>
                <p className="text-[10px] text-[var(--muted)]">
                  Favorited / watched / playlist items get processed first regardless of duration.
                </p>
              </div>

              {/* Calibration summary — what the AI has learned from your reviews */}
              <div className="rounded-lg bg-white/5 border border-[var(--border)] p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="font-medium text-sm">AI is learning from you</div>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={async () => {
                        try {
                          const result = await window.api.ai.backfillCalibration?.()
                          if (result) {
                            showToast('success', `Replayed ${result.rowsProcessed} reviews — ${result.samplesRecorded} samples, ${result.approvalsRecorded} approvals, ${result.rejectionsRecorded} rejections`)
                            await refreshCalibration()
                          } else {
                            showToast('error', 'Backfill handler unavailable — restart the app once')
                          }
                        } catch (err: any) {
                          showToast('error', 'Backfill failed: ' + (err?.message ?? err))
                        }
                      }}
                      className="text-xs text-[var(--primary)] hover:underline transition flex items-center gap-1"
                      title="Replay every prior approve/reject decision from ai_analysis_results into the calibration table. Use this when the panel shows 0 stats despite having reviewed items."
                    >
                      Backfill from history
                    </button>
                    <button
                      onClick={refreshCalibration}
                      className="text-xs text-[var(--muted)] hover:text-white transition flex items-center gap-1"
                      disabled={loadingCalibration}
                      title="Refresh calibration data"
                    >
                      <RefreshCw size={11} className={loadingCalibration ? 'animate-spin' : ''} />
                      Refresh
                    </button>
                  </div>
                </div>
                {!calibrationSummary || calibrationSummary.summary.tagsTracked === 0 ? (
                  <p className="text-[10px] text-[var(--muted)] leading-relaxed">
                    No data yet. Each Tier 2 analysis adds samples; each approve/reject in the Review queue tunes the
                    confidence the AI assigns to that tag in the future. If you've already reviewed items but this still
                    shows zero, click <strong>Backfill from history</strong> to replay them.
                  </p>
                ) : (
                  <>
                    <div className="grid grid-cols-4 gap-2 text-center text-[10px]">
                      <div className="bg-black/30 rounded p-2">
                        <div className="text-base font-bold tabular-nums">{calibrationSummary.summary.tagsTracked}</div>
                        <div className="text-[var(--muted)]">Tags tracked</div>
                      </div>
                      <div className="bg-black/30 rounded p-2">
                        <div className="text-base font-bold tabular-nums">{calibrationSummary.summary.totalSamples}</div>
                        <div className="text-[var(--muted)]">Samples</div>
                      </div>
                      <div
                        className="bg-emerald-500/10 rounded p-2"
                        title={`${calibrationSummary.summary.totalApproved} tag-instance approvals across ${calibrationSummary.summary.mediaApproved ?? '?'} media items`}
                      >
                        <div className="text-base font-bold tabular-nums text-emerald-400">
                          {calibrationSummary.summary.mediaApproved ?? calibrationSummary.summary.totalApproved}
                        </div>
                        <div className="text-[var(--muted)]">
                          Approvals
                          <span className="text-[9px] ml-1 opacity-60">({calibrationSummary.summary.totalApproved} tag-instances)</span>
                        </div>
                      </div>
                      <div
                        className="bg-rose-500/10 rounded p-2"
                        title={`${calibrationSummary.summary.totalRejected} tag-instance rejections across ${calibrationSummary.summary.mediaRejected ?? '?'} media items`}
                      >
                        <div className="text-base font-bold tabular-nums text-rose-400">
                          {calibrationSummary.summary.mediaRejected ?? calibrationSummary.summary.totalRejected}
                        </div>
                        <div className="text-[var(--muted)]">
                          Rejections
                          <span className="text-[9px] ml-1 opacity-60">({calibrationSummary.summary.totalRejected} tag-instances)</span>
                        </div>
                      </div>
                    </div>
                    {calibrationSummary.topApproved.length > 0 && (
                      <div>
                        <div className="text-[10px] text-[var(--muted)] uppercase tracking-wider mt-1 mb-1">Top trusted tags</div>
                        <div className="flex flex-wrap gap-1">
                          {calibrationSummary.topApproved.slice(0, 12).map((t) => (
                            <span
                              key={`${t.tagName}-${t.source}`}
                              className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 tabular-nums"
                              title={`${t.approvedCount}✓/${t.rejectedCount}✗ · source: ${t.source} · mean ${(t.meanConfidence * 100).toFixed(0)}%`}
                            >
                              {t.tagName} <span className="text-emerald-400/70">{(t.approvalRatio * 100).toFixed(0)}%</span>
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    {calibrationSummary.topRejected && calibrationSummary.topRejected.length > 0 && (
                      <div>
                        <div className="text-[10px] text-[var(--muted)] uppercase tracking-wider mt-2 mb-1 flex items-center justify-between">
                          <span>Tags you reject often</span>
                          <span className="text-[var(--muted)]/70 normal-case tracking-normal">add to protected list to stop seeing them</span>
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {calibrationSummary.topRejected.slice(0, 12).map((t) => {
                            const alreadyProtected = protectedTags.includes(t.tagName)
                            return (
                              <button
                                key={`${t.tagName}-${t.source}`}
                                onClick={async () => {
                                  if (alreadyProtected) return
                                  try {
                                    await window.api.ai.addProtectedTag?.(t.tagName)
                                    await loadProtectedTags()
                                    showToast('success', `Protected "${t.tagName}" — AI will skip this tag from now on`)
                                  } catch (err: any) {
                                    showToast('error', err?.message ?? 'Failed to protect tag')
                                  }
                                }}
                                disabled={alreadyProtected}
                                className={cn(
                                  'text-[10px] px-2 py-0.5 rounded-full border tabular-nums transition',
                                  alreadyProtected
                                    ? 'bg-amber-500/15 border-amber-500/30 text-amber-300 cursor-not-allowed'
                                    : 'bg-rose-500/15 border-rose-500/30 text-rose-300 hover:bg-rose-500/25 hover:border-rose-500/50'
                                )}
                                title={alreadyProtected
                                  ? `Already protected — AI won't suggest "${t.tagName}"`
                                  : `${t.approvedCount}✓/${t.rejectedCount}✗ · source: ${t.source} · click to protect`}
                              >
                                {t.tagName} <span className="opacity-70">{(t.approvalRatio * 100).toFixed(0)}%</span>
                                {alreadyProtected && <span className="ml-1">✓</span>}
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>

              <div className="flex gap-3">
                {!queueStatus?.isRunning ? (
                  <button
                    onClick={startProcessing}
                    disabled={!modelsReady || (queueStatus?.pending ?? 0) === 0}
                    className={cn(
                      'flex-1 py-3 rounded-lg font-medium transition flex items-center justify-center gap-2',
                      modelsReady && (queueStatus?.pending ?? 0) > 0
                        ? 'bg-green-600 text-white hover:bg-green-700'
                        : 'bg-white/10 text-[var(--muted)] cursor-not-allowed'
                    )}
                  >
                    <Play size={18} />
                    Start Processing
                  </button>
                ) : queueStatus?.isPaused ? (
                  <button
                    onClick={resumeProcessing}
                    className="flex-1 py-3 rounded-lg font-medium bg-green-600 text-white hover:bg-green-700 transition flex items-center justify-center gap-2"
                  >
                    <Play size={18} />
                    Resume
                  </button>
                ) : (
                  <button
                    onClick={pauseProcessing}
                    className="flex-1 py-3 rounded-lg font-medium bg-yellow-600 text-white hover:bg-yellow-700 transition flex items-center justify-center gap-2"
                  >
                    <Pause size={18} />
                    Pause
                  </button>
                )}

                {queueStatus?.isRunning && (
                  <button
                    onClick={stopProcessing}
                    className="px-6 py-3 rounded-lg font-medium bg-red-600 text-white hover:bg-red-700 transition flex items-center justify-center gap-2"
                  >
                    <X size={18} />
                    Stop
                  </button>
                )}
              </div>

              {!modelsReady && (
                <p className="mt-4 text-sm text-yellow-500 flex items-center gap-2">
                  <AlertCircle size={16} />
                  Download AI models in the Setup tab first
                </p>
              )}
            </div>
          </div>
        )}

        {activeTab === 'review' && (
          <div className="flex gap-6 h-full">
            {/* Review list */}
            <div className="w-80 flex-none space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">
                  {reviewListStatus === 'pending' && `Pending Review (${reviewTotal})`}
                  {reviewListStatus === 'approved' && `Approved (${reviewTotal})`}
                  {reviewListStatus === 'rejected' && `Rejected (${reviewTotal})`}
                </h2>
                <div className="flex items-center gap-3">
                  {/* Undo for the most recent review decision. Reverts
                      tag links + row state. In-memory, single-level. */}
                  {undoStatus.available && (
                    <button
                      onClick={undoLastReview}
                      className="text-sm text-amber-400 hover:text-amber-300 hover:underline inline-flex items-center gap-1"
                      title={`Undo last ${undoStatus.decisionType ?? 'decision'}`}
                    >
                      <RotateCcw size={12} />
                      Undo
                    </button>
                  )}
                  {reviewListStatus === 'pending' && reviewTotal > 0 && (
                    <>
                      <button
                        onClick={bulkApproveAll}
                        className="text-sm text-[var(--primary)] hover:underline"
                      >
                        Approve All
                      </button>
                      <button
                        onClick={bulkRejectAll}
                        className="text-sm text-red-400 hover:underline"
                      >
                        Clear All
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Status filter pills — Pending (default) / Approved / Rejected.
                  Approved tab lets the user re-edit past decisions. */}
              <div className="flex items-center gap-1 bg-black/20 rounded-lg p-1 border border-[var(--border)]">
                {(['pending', 'approved', 'rejected'] as const).map((s) => (
                  <button
                    key={s}
                    onClick={() => {
                      setReviewListStatus(s)
                      setSelectedReviewItem(null)
                      loadReviewItems(s)
                    }}
                    className={cn(
                      'flex-1 px-3 py-1.5 rounded-md text-xs font-medium transition capitalize',
                      reviewListStatus === s
                        ? 'bg-[var(--primary)] text-white'
                        : 'text-[var(--muted)] hover:text-white hover:bg-white/5'
                    )}
                  >
                    {s}
                  </button>
                ))}
              </div>

              {/* Sort selector — Newest / Uncertainty.
                  Uncertainty mode pulls the items where AI is least confident
                  to the top so each review nudges the calibration the most. */}
              {reviewListStatus === 'pending' && (
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-[var(--muted)]">Sort:</span>
                  <div className="flex items-center gap-1 bg-black/20 rounded-md p-0.5 border border-[var(--border)]">
                    {(['newest', 'uncertainty'] as const).map((s) => (
                      <button
                        key={s}
                        onClick={() => {
                          setReviewListSort(s)
                          loadReviewItems(undefined, s)
                        }}
                        className={cn(
                          'px-2.5 py-1 rounded text-[11px] font-medium transition',
                          reviewListSort === s
                            ? 'bg-[var(--primary)] text-white'
                            : 'text-[var(--muted)] hover:text-white'
                        )}
                        title={s === 'uncertainty'
                          ? 'Show borderline / low-confidence items first — your reviews here move the model most'
                          : 'Show newest analyses first (default)'}
                      >
                        {s === 'newest' ? 'Newest' : 'Uncertainty'}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {(queueStatus?.failed ?? 0) > 0 && reviewListStatus === 'pending' && (
                <button
                  onClick={clearAllFailed}
                  className="w-full text-sm text-orange-400 hover:underline py-1"
                >
                  Clear All Failed ({queueStatus?.failed})
                </button>
              )}

              {reviewItems.length === 0 ? (
                <div className="text-center py-12 text-[var(--muted)]">
                  <Brain size={48} className="mx-auto mb-4 opacity-50" />
                  {reviewListStatus === 'pending' && (
                    <>
                      <p>No items pending review</p>
                      <p className="text-sm mt-2">Process some media in the Queue tab</p>
                    </>
                  )}
                  {reviewListStatus === 'approved' && (
                    <>
                      <p>No approved items yet</p>
                      <p className="text-sm mt-2">Once you approve items, they show up here for re-editing</p>
                    </>
                  )}
                  {reviewListStatus === 'rejected' && (
                    <>
                      <p>No rejected items</p>
                      <p className="text-sm mt-2">Items you reject appear here</p>
                    </>
                  )}
                </div>
              ) : (
                <>
                <div className="space-y-2 max-h-[calc(100vh-280px)] overflow-y-auto">
                  {reviewItems.map(item => {
                    const isCurrent = selectedReviewItem?.mediaId === item.mediaId
                    const isBulkSelected = bulkSelectedIds.has(item.mediaId)
                    return (
                      <button
                        key={item.mediaId}
                        onClick={(e) => {
                          // Ctrl/Cmd+click — toggle in the multi-select set
                          // (don't navigate).
                          if (e.ctrlKey || e.metaKey) {
                            setBulkSelectedIds((prev) => {
                              const next = new Set(prev)
                              if (next.has(item.mediaId)) next.delete(item.mediaId)
                              else next.add(item.mediaId)
                              return next
                            })
                            setBulkAnchorId(item.mediaId)
                            return
                          }
                          // Shift+click — select a contiguous range from
                          // the last anchor (or current selection) up to
                          // the clicked item.
                          if (e.shiftKey) {
                            const ids = reviewItems.map((it) => it.mediaId)
                            const anchor = bulkAnchorId ?? selectedReviewItem?.mediaId
                            const from = anchor ? ids.indexOf(anchor) : -1
                            const to = ids.indexOf(item.mediaId)
                            if (from >= 0 && to >= 0) {
                              const [lo, hi] = from < to ? [from, to] : [to, from]
                              setBulkSelectedIds((prev) => {
                                const next = new Set(prev)
                                for (let i = lo; i <= hi; i++) next.add(ids[i])
                                return next
                              })
                              return
                            }
                          }
                          // Plain click — clear bulk selection + navigate.
                          setBulkSelectedIds(new Set())
                          setBulkAnchorId(item.mediaId)
                          selectReviewItem(item)
                        }}
                        className={cn(
                          'w-full text-left p-3 rounded-lg transition border relative',
                          isBulkSelected
                            ? 'bg-amber-500/15 border-amber-500/40'
                            : isCurrent
                              ? 'bg-[var(--primary)]/20 border-[var(--primary)]'
                              : 'bg-white/5 border-transparent hover:bg-white/10'
                        )}
                        title={isBulkSelected
                          ? 'Bulk-selected · Ctrl/Cmd+click to unselect'
                          : 'Click to open · Ctrl/Cmd+click to multi-select · Shift+click for range'}
                      >
                        {isBulkSelected && (
                          <CheckCircle2 size={12} className="absolute top-2 right-2 text-amber-400" />
                        )}
                        <div className="font-medium truncate pr-5">{item.filename}</div>
                        <div className="text-sm text-[var(--muted)] truncate">
                          {item.matchedTags.length} tags matched
                        </div>
                      </button>
                    )
                  })}
                </div>
                {/* Bulk-action bar — appears when 2+ items are selected.
                    Approves or rejects all of them as a batch. Each
                    call goes through approve/reject one by one so the
                    snapshot, calibration, and rejection_history sides
                    work correctly. */}
                {bulkSelectedIds.size > 0 && (
                  <div className="sticky bottom-0 mt-3 p-3 rounded-lg bg-[var(--panel)] border border-amber-500/40 shadow-lg">
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <div className="text-sm">
                        <span className="text-amber-400 font-medium tabular-nums">{bulkSelectedIds.size}</span>
                        <span className="text-[var(--muted)]"> selected</span>
                      </div>
                      <button
                        onClick={() => { setBulkSelectedIds(new Set()); setBulkAnchorId(null) }}
                        className="text-[10px] text-[var(--muted)] hover:text-white"
                      >
                        Clear
                      </button>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={async () => {
                          if (bulkBusy) return
                          const ids = Array.from(bulkSelectedIds)
                          setBulkBusy(true)
                          try {
                            for (const id of ids) {
                              try { await window.api.ai.approve?.(id) } catch { /* keep going */ }
                            }
                            showToast?.('success', `Approved ${ids.length} item${ids.length === 1 ? '' : 's'}`)
                            setBulkSelectedIds(new Set())
                            loadReviewItems()
                            refreshQueueStatus()
                            refreshUndoStatus()
                          } finally {
                            setBulkBusy(false)
                          }
                        }}
                        disabled={bulkBusy}
                        className="flex-1 px-2 py-1.5 rounded text-xs font-medium bg-green-500/20 hover:bg-green-500/30 border border-green-500/40 text-green-300 transition disabled:opacity-50"
                      >
                        {bulkBusy ? '…' : `Approve ${bulkSelectedIds.size}`}
                      </button>
                      <button
                        onClick={async () => {
                          if (bulkBusy) return
                          const ids = Array.from(bulkSelectedIds)
                          setBulkBusy(true)
                          try {
                            for (const id of ids) {
                              try { await window.api.ai.reject?.(id) } catch { /* keep going */ }
                            }
                            showToast?.('success', `Rejected ${ids.length} item${ids.length === 1 ? '' : 's'}`)
                            setBulkSelectedIds(new Set())
                            loadReviewItems()
                            refreshQueueStatus()
                            refreshUndoStatus()
                          } finally {
                            setBulkBusy(false)
                          }
                        }}
                        disabled={bulkBusy}
                        className="flex-1 px-2 py-1.5 rounded text-xs font-medium bg-red-500/20 hover:bg-red-500/30 border border-red-500/40 text-red-300 transition disabled:opacity-50"
                      >
                        {bulkBusy ? '…' : `Reject ${bulkSelectedIds.size}`}
                      </button>
                    </div>
                  </div>
                )}
                </>
              )}
            </div>

            {/* Review detail */}
            <div className="flex-1 min-w-0">
              {selectedReviewItem ? (
                <div className="bg-[var(--panel)] rounded-xl border border-[var(--border)] p-6 space-y-6">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="text-lg font-semibold">{selectedReviewItem.filename}</h3>
                      {selectedReviewItem.nsfwCategory && (
                        <span className={cn(
                          'inline-block mt-1 px-2 py-0.5 rounded text-xs font-medium',
                          selectedReviewItem.nsfwCategory === 'porn' ? 'bg-red-500/20 text-red-400' :
                          selectedReviewItem.nsfwCategory === 'sexy' ? 'bg-orange-500/20 text-orange-400' :
                          selectedReviewItem.nsfwCategory === 'hentai' ? 'bg-purple-500/20 text-purple-400' :
                          'bg-white/10 text-[var(--muted)]'
                        )}>
                          {selectedReviewItem.nsfwCategory} ({Math.round((selectedReviewItem.nsfwConfidence || 0) * 100)}%)
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {/* Keyboard-shortcut hints — discoverability for the
                          power-user keybindings registered above. Visible
                          inline so you don't have to learn them elsewhere. */}
                      <div className="hidden lg:flex items-center gap-1 text-[10px] text-[var(--muted)] mr-1">
                        <kbd className="px-1.5 py-0.5 rounded bg-white/5 border border-white/10 font-mono">A</kbd>
                        <span className="opacity-70">approve</span>
                        <kbd className="px-1.5 py-0.5 rounded bg-white/5 border border-white/10 font-mono ml-1">R</kbd>
                        <span className="opacity-70">reject</span>
                        <kbd className="px-1.5 py-0.5 rounded bg-white/5 border border-white/10 font-mono ml-1">J/K</kbd>
                        <span className="opacity-70">prev/next</span>
                        <kbd className="px-1.5 py-0.5 rounded bg-white/5 border border-white/10 font-mono ml-1">U</kbd>
                        <span className="opacity-70">undo</span>
                      </div>
                      <button
                        onClick={() => rejectItem(selectedReviewItem.mediaId)}
                        className="p-2 rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30 transition"
                        title="Reject (R)"
                      >
                        <XCircle size={20} />
                      </button>
                      <button
                        onClick={() => approveItem(selectedReviewItem.mediaId)}
                        className="p-2 rounded-lg bg-green-500/20 text-green-400 hover:bg-green-500/30 transition"
                        title="Approve (A)"
                      >
                        <CheckCircle2 size={20} />
                      </button>
                    </div>
                  </div>

                  {/* Hover-preview thumbnail — plays the source video on hover
                      so the user can verify the AI tagged the right thing
                      without leaving the Review tab. */}
                  <ReviewHoverPreview mediaId={selectedReviewItem.mediaId} thumbPath={selectedReviewItem.thumbnailPath} filename={selectedReviewItem.filename} />

                  {/* Similar already-approved items — context strip
                      using the existing rich_tag cosine similarity. Helps
                      the reviewer see "we already approved these, so my
                      decision should probably match". Click a thumbnail
                      to jump to the Library page filtered to that item. */}
                  {similarItems.length > 0 && (
                    <div className="space-y-1.5">
                      <div className="text-[10px] uppercase tracking-wider text-[var(--muted)]">
                        Similar approved <span className="opacity-60">· top {similarItems.length}</span>
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        {similarItems.map((s) => (
                          <div
                            key={s.mediaId}
                            className="rounded-lg overflow-hidden border border-white/10 bg-black/30 hover:border-white/30 transition group"
                            title={`${s.filename}\n${Math.round(s.similarity * 100)}% similar · shared: ${s.sharedTags.slice(0, 5).join(', ') || '—'}`}
                          >
                            <div className="aspect-video bg-black/50 overflow-hidden">
                              {similarThumbs[s.mediaId] ? (
                                <img
                                  src={similarThumbs[s.mediaId]}
                                  alt={s.filename}
                                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                                  loading="lazy"
                                />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center text-[var(--muted)]">
                                  <Eye size={18} className="opacity-30" />
                                </div>
                              )}
                            </div>
                            <div className="px-2 py-1.5">
                              <div className="text-[11px] font-medium truncate" title={s.filename}>
                                {s.filename}
                              </div>
                              <div className="text-[10px] text-[var(--muted)] tabular-nums">
                                {Math.round(s.similarity * 100)}% match
                                {s.sharedTags.length > 0 && (
                                  <span className="ml-1 opacity-70">· {s.sharedTags.length} shared</span>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Contact sheet — 4×3 grid of evenly-spaced frames
                      sampled from the video by FFmpeg's tile filter.
                      Generated non-blocking after Tier 2. Lets the user
                      validate AI tags without scrubbing the video.
                      Inline expand for a quick look; click the image
                      itself for a full-screen modal. */}
                  {contactSheetPath && contactSheetUrl && (
                    <div className="rounded-lg border border-white/10 bg-black/30 overflow-hidden">
                      <button
                        onClick={() => setContactSheetExpanded((v) => !v)}
                        className="w-full flex items-center justify-between px-3 py-2 text-xs text-[var(--muted)] hover:bg-white/5 transition"
                      >
                        <span className="flex items-center gap-2">
                          <Layers size={12} />
                          <span>Frame grid (4×3)</span>
                        </span>
                        <span className="text-[var(--primary)]">{contactSheetExpanded ? 'Hide' : 'Show'}</span>
                      </button>
                      {contactSheetExpanded && (
                        <button
                          type="button"
                          onClick={() => setContactSheetFullscreen(true)}
                          className="block w-full p-0 m-0 border-0 cursor-zoom-in"
                          title="Click to view full-screen"
                        >
                          <img
                            src={contactSheetUrl}
                            alt="Contact sheet — click for full-screen view"
                            className="w-full block"
                            loading="lazy"
                          />
                        </button>
                      )}
                    </div>
                  )}

                  {/* Title + Filename — single unified surface. Editing the
                      title updates the display title (metadata). The
                      "Rename file" button applies the same title (sanitized)
                      as the on-disk filename. Replaces the old split UI
                      where a separate amber "Rename file?" popup duplicated
                      this with its own input. */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-sm font-medium">Title{selectedReviewItem.suggestedFilename ? ' / Filename' : ''}</label>
                      <div className="flex items-center gap-2">
                        {selectedReviewItem.suggestedFilename && (
                          <button
                            onClick={async () => {
                              const target = editedTitle.trim()
                              if (!target) {
                                showToast('error', 'Title cannot be empty')
                                return
                              }
                              setRenameApplying(true)
                              try {
                                const result = await window.api.media?.rename?.(selectedReviewItem.mediaId, target)
                                if (result?.success) {
                                  showToast('success', result.renamed ? `Renamed file to ${result.newFilename}` : 'No rename needed')
                                  if (result.newFilename) {
                                    setSelectedReviewItem({ ...selectedReviewItem, filename: result.newFilename, suggestedFilename: null })
                                  }
                                  loadReviewItems()
                                } else {
                                  showToast('error', result?.error ?? 'Rename failed')
                                }
                              } catch (err: any) {
                                showToast('error', err?.message ?? 'Rename failed')
                              } finally {
                                setRenameApplying(false)
                              }
                            }}
                            disabled={renameApplying || !editedTitle.trim()}
                            className="px-2 py-1 rounded-md text-xs bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 transition disabled:opacity-50 flex items-center gap-1"
                            title="Rename the actual file on disk to match the title above. AI flagged the current filename as gibberish."
                          >
                            {renameApplying ? <Loader2 size={11} className="animate-spin" /> : null}
                            {renameApplying ? 'Renaming…' : 'Rename file to match'}
                          </button>
                        )}
                        <button
                          onClick={async () => {
                            if (!selectedReviewItem) return
                            setRegenTitleBusy(true)
                            try {
                              const fresh = await window.api.ai.regenerateTitle(selectedReviewItem.mediaId)
                              if (fresh) {
                                setEditedTitle(fresh)
                                setSelectedReviewItem({ ...selectedReviewItem, suggestedTitle: fresh })
                                showToast?.('success', 'Title regenerated')
                              } else {
                                showToast?.('warning', 'Regeneration returned no title')
                              }
                            } catch (err: any) {
                              showToast?.('error', err?.message ?? 'Failed to regenerate title')
                            } finally {
                              setRegenTitleBusy(false)
                            }
                          }}
                          disabled={regenTitleBusy}
                          className="px-2 py-1 rounded-md text-xs bg-[var(--primary)]/15 hover:bg-[var(--primary)]/25 text-[var(--primary)] border border-[var(--primary)]/30 transition disabled:opacity-50 flex items-center gap-1"
                        >
                          <RefreshCw size={11} className={regenTitleBusy ? 'animate-spin' : ''} />
                          {regenTitleBusy ? 'Regenerating…' : 'Regenerate'}
                        </button>
                      </div>
                    </div>
                    <DebouncedInput
                      type="text"
                      value={editedTitle}
                      onChange={(next) => setEditedTitle(next)}
                      placeholder={selectedReviewItem.suggestedTitle ? '' : 'Click Regenerate to suggest a title'}
                      className="w-full px-4 py-2 rounded-lg bg-white/5 border border-[var(--border)] focus:border-[var(--primary)] focus:outline-none"
                    />
                    {selectedReviewItem.suggestedFilename && (
                      <p className="mt-1.5 text-[11px] text-amber-300/80">
                        AI flagged the original filename "<span className="font-mono">{selectedReviewItem.filename}</span>" as gibberish.
                        Click <strong>Rename file to match</strong> to use the title above as the new filename.
                      </p>
                    )}
                  </div>

                  {/* Description — always-rendered with regen, like title. */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-sm font-medium">Description</label>
                      <button
                        onClick={async () => {
                          if (!selectedReviewItem) return
                          setRegenDescBusy(true)
                          try {
                            const fresh = await window.api.ai.regenerateDescription(selectedReviewItem.mediaId)
                            if (fresh) {
                              setSelectedReviewItem({ ...selectedReviewItem, description: fresh })
                              showToast?.('success', 'Description regenerated')
                            } else {
                              showToast?.('warning', 'Regeneration returned no description')
                            }
                          } catch (err: any) {
                            showToast?.('error', err?.message ?? 'Failed to regenerate description')
                          } finally {
                            setRegenDescBusy(false)
                          }
                        }}
                        disabled={regenDescBusy}
                        className="px-2 py-1 rounded-md text-xs bg-[var(--primary)]/15 hover:bg-[var(--primary)]/25 text-[var(--primary)] border border-[var(--primary)]/30 transition disabled:opacity-50 flex items-center gap-1"
                      >
                        <RefreshCw size={11} className={regenDescBusy ? 'animate-spin' : ''} />
                        {regenDescBusy ? 'Regenerating…' : 'Regenerate'}
                      </button>
                    </div>
                    <DebouncedTextarea
                      value={editedDescription}
                      onChange={(next) => setEditedDescription(next)}
                      placeholder="Click Regenerate to produce a description, or type your own"
                      rows={3}
                      className="w-full text-sm bg-white/5 p-3 rounded-lg whitespace-pre-wrap min-h-[3.5rem] border border-[var(--border)] focus:border-[var(--primary)] focus:outline-none resize-y"
                    />
                  </div>

                  {(() => {
                    // Group matched + new-suggestion tags by semantic
                    // category. Two layers: the new tag-categories.ts
                    // taxonomy (action / position / performer / body /
                    // hair / modification / clothing / camera / kink /
                    // cum / intensity / toys / audio / platform / setting /
                    // group / format / production / other) populated via
                    // ai:tag-category, and the legacy rt.source from
                    // richTags as a fallback. The richer taxonomy gives
                    // ~19 buckets instead of 8.
                    const LEGACY_ORDER: Array<{ key: string; label: string; color: string }> = [
                      { key: 'action',    label: 'Actions',    color: 'rose' },
                      { key: 'position',  label: 'Positions',  color: 'orange' },
                      { key: 'performer', label: 'Performers', color: 'purple' },
                      { key: 'body',      label: 'Body',       color: 'pink' },
                      { key: 'intensity', label: 'Intensity',  color: 'red' },
                      { key: 'context',   label: 'Context',    color: 'cyan' },
                      { key: 'setting',   label: 'Setting',    color: 'amber' },
                      { key: 'other',     label: 'Other',      color: 'zinc' }
                    ]
                    // Prefer the richer 19-category taxonomy when meta
                    // has loaded; otherwise fall back to the 8-bucket
                    // legacy mapping for parity with prior behavior.
                    const ORDER: Array<{ key: string; label: string; color: string }> =
                      tagCategoryMeta.length > 0
                        ? [
                            ...tagCategoryMeta.map((c) => ({
                              key: c.id,
                              label: c.label,
                              // map arbitrary CSS hex/name colors to a
                              // tailwind-class root; fall back to zinc
                              // when the meta color isn't a known root.
                              color: (c.color || 'zinc'),
                            })),
                            // make sure 'other' is the catch-all bucket
                            ...(tagCategoryMeta.find((c) => c.id === 'other')
                              ? []
                              : [{ key: 'other', label: 'Other', color: 'zinc' }]),
                          ]
                        : LEGACY_ORDER
                    const nameToSource = new Map<string, string>()
                    // Frame agreement lookup: for each rich-tag name, how many
                    // frames flagged it / total frames analyzed. Lets each pill
                    // surface a "12/12" badge when unanimous, "3/12" when low.
                    const nameToAgreement = new Map<string, { f: number; t: number }>()
                    for (const rt of (selectedReviewItem.richTags ?? [])) {
                      const lower = String(rt.name).toLowerCase()
                      nameToSource.set(lower, String(rt.source).toLowerCase())
                      if (typeof rt.frameCount === 'number' && typeof rt.totalFrames === 'number' && rt.totalFrames > 1) {
                        nameToAgreement.set(lower, { f: rt.frameCount, t: rt.totalFrames })
                      }
                    }
                    const sourceOf = (name: string): string => {
                      const lower = String(name).toLowerCase()
                      // First: semantic category from tag-categories.ts
                      // (loaded async via ai:tag-category). Falls back
                      // to richTags.source, then to 'other'.
                      const cat = tagCategoryMap[lower]
                      if (cat && ORDER.find((o) => o.key === cat)) return cat
                      const s = nameToSource.get(lower)
                      if (s && ORDER.find((o) => o.key === s)) return s
                      return 'other'
                    }
                    const agreementOf = (name: string) => nameToAgreement.get(String(name).toLowerCase()) ?? null

                    type Pill =
                      | { kind: 'matched'; id: string; name: string; confidence: number; source: string }
                      | { kind: 'new'; name: string; confidence: number; source: string }
                    const pills: Pill[] = []
                    for (const t of selectedReviewItem.matchedTags) {
                      pills.push({ kind: 'matched', id: t.id, name: t.name, confidence: t.confidence, source: sourceOf(t.name) })
                    }
                    for (const t of selectedReviewItem.newTagSuggestions) {
                      pills.push({ kind: 'new', name: t.name, confidence: t.confidence, source: sourceOf(t.name) })
                    }
                    const grouped = new Map<string, Pill[]>()
                    for (const o of ORDER) grouped.set(o.key, [])
                    for (const p of pills) (grouped.get(p.source) ?? grouped.get('other'))!.push(p)
                    for (const arr of grouped.values()) arr.sort((a, b) => b.confidence - a.confidence)

                    const totalCount = pills.length
                    return (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <label className="text-sm font-medium">
                            Tags ({selectedTags.size} of {selectedReviewItem.matchedTags.length} matched selected · {selectedReviewItem.newTagSuggestions.length} new)
                          </label>
                          {totalCount > 0 && (
                            <span className="text-[10px] text-[var(--muted)]">
                              grouped by {tagCategoryMeta.length > 0 ? 'semantic category' : 'AI source'} · sorted by confidence
                            </span>
                          )}
                        </div>
                        {ORDER.map((g) => {
                          const arr = grouped.get(g.key) ?? []
                          if (arr.length === 0) return null
                          return (
                            <div key={g.key}>
                              <div className={`text-[10px] uppercase tracking-wider mb-1.5 text-${g.color}-400/80`}>
                                {g.label} <span className="opacity-60">· {arr.length}</span>
                              </div>
                              <div className="flex flex-wrap gap-2">
                                {arr.map((p, i) => (
                                  (() => {
                                    const ag = agreementOf(p.name)
                                    const unanimous = ag && ag.f === ag.t
                                    const lowAgreement = ag && ag.f / ag.t < 0.4
                                    const agreementChip = ag ? (
                                      <span
                                        className={cn(
                                          'ml-1 px-1 py-px rounded text-[9px] font-mono tabular-nums border',
                                          unanimous
                                            ? 'bg-emerald-500/20 text-emerald-300 border-emerald-400/30'
                                            : lowAgreement
                                              ? 'bg-amber-500/20 text-amber-300 border-amber-400/30'
                                              : 'bg-white/5 text-white/50 border-white/10'
                                        )}
                                        title={`Agreed across ${ag.f} of ${ag.t} frames`}
                                      >
                                        {ag.f}/{ag.t}
                                      </span>
                                    ) : null
                                    return p.kind === 'matched' ? (
                                      <button
                                        key={p.id}
                                        onClick={() => {
                                          const next = new Set(selectedTags)
                                          if (next.has(p.id)) next.delete(p.id)
                                          else next.add(p.id)
                                          setSelectedTags(next)
                                        }}
                                        className={cn(
                                          'px-3 py-1 rounded-full text-sm transition border',
                                          selectedTags.has(p.id)
                                            ? 'bg-[var(--primary)] border-[var(--primary)] text-white'
                                            : 'bg-white/5 border-white/10 hover:border-white/20'
                                        )}
                                        title={(() => {
                                          const ag = agreementOf(p.name)
                                          const lines = [
                                            `Tag: ${p.name}`,
                                            `Confidence: ${(p.confidence * 100).toFixed(1)}%`,
                                            `Source: ${p.source}`,
                                          ]
                                          if (ag) {
                                            lines.push(`Frame agreement: ${ag.f}/${ag.t} (${Math.round((ag.f / ag.t) * 100)}%)`)
                                          }
                                          lines.push('', 'matched library tag — click to toggle')
                                          return lines.join('\n')
                                        })()}
                                      >
                                        {p.name}
                                        <span className="ml-1 opacity-50 tabular-nums">
                                          {Math.round(p.confidence * 100)}%
                                        </span>
                                        {agreementChip}
                                      </button>
                                    ) : (
                                      (() => {
                                        const nameLower = p.name.toLowerCase()
                                        const isPicked = selectedNewTagNames.has(nameLower)
                                        return (
                                          <button
                                            key={`new-${i}`}
                                            onClick={() => {
                                              const next = new Set(selectedNewTagNames)
                                              if (next.has(nameLower)) next.delete(nameLower)
                                              else next.add(nameLower)
                                              setSelectedNewTagNames(next)
                                            }}
                                            className={cn(
                                              'px-3 py-1 rounded-full text-sm transition border border-dashed',
                                              isPicked
                                                ? 'bg-[var(--secondary)] border-[var(--secondary)] text-white'
                                                : 'bg-[var(--secondary)]/15 border-[var(--secondary)]/30 hover:border-[var(--secondary)]/60'
                                            )}
                                            title={(() => {
                                              const ag = agreementOf(p.name)
                                              const lines = [
                                                `New tag: ${p.name}`,
                                                `Confidence: ${(p.confidence * 100).toFixed(1)}%`,
                                                `Source: ${p.source}`,
                                              ]
                                              if (ag) {
                                                lines.push(`Frame agreement: ${ag.f}/${ag.t}`)
                                              }
                                              lines.push('', isPicked
                                                ? `Will create + apply on approve. Click to remove.`
                                                : `Click to add as a new tag.`)
                                              return lines.join('\n')
                                            })()}
                                          >
                                            {isPicked ? '✓' : '+'} {p.name}
                                            <span className="ml-1 opacity-50 tabular-nums">
                                              {Math.round(p.confidence * 100)}%
                                            </span>
                                            {agreementChip}
                                          </button>
                                        )
                                      })()
                                    )
                                  })()
                                ))}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )
                  })()}

                  {/* Co-occurrence suggestions — tags that strongly co-occur
                      with what you've already selected, based on your own
                      approved-media history. Click to add. */}
                  {cooccurSuggestions.length > 0 && (
                    <div>
                      <label className="block text-sm font-medium mb-2 flex items-center gap-2">
                        <Sparkles size={14} className="text-[var(--secondary)]" />
                        Tags you might also want
                        <span className="text-[10px] text-[var(--muted)] font-normal">based on your approved-media patterns</span>
                      </label>
                      <div className="flex flex-wrap gap-1.5">
                        {cooccurSuggestions.map((s) => (
                          <button
                            key={s.name}
                            onClick={() => {
                              if (!customTagsPending.includes(s.name)) {
                                setCustomTagsPending([...customTagsPending, s.name])
                              }
                            }}
                            className="px-2.5 py-1 rounded-full text-xs bg-[var(--secondary)]/15 hover:bg-[var(--secondary)]/25 border border-[var(--secondary)]/30 hover:border-[var(--secondary)]/50 text-[var(--secondary)] transition"
                            title={`Co-occurred with your selection in ${s.jointCount} approved item${s.jointCount === 1 ? '' : 's'}`}
                          >
                            + {s.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Add new tags — type single tag, hit Add (or Enter),
                      it appears as a chip below. Click chip × to remove.
                      Autocomplete: as you type, the top 6 prefix-then-
                      substring matches from the library tag list appear
                      below the input. Arrow keys navigate, Enter inserts
                      the highlighted suggestion (or the raw input if no
                      match is highlighted). */}
                  {(() => {
                    const q = newTagInput.trim().toLowerCase()
                    const existing = new Set([
                      ...customTagsPending.map((t) => t.toLowerCase()),
                      ...Array.from(selectedNewTagNames),
                      ...(selectedReviewItem?.matchedTags ?? []).map((t) => t.name.toLowerCase()),
                    ])
                    let suggestions: string[] = []
                    if (q.length >= 1 && allTagNames.length > 0) {
                      // Prefix matches first (better signal), then substring.
                      const prefix: string[] = []
                      const substr: string[] = []
                      for (const t of allTagNames) {
                        if (existing.has(t) || t === q) continue
                        if (t.startsWith(q)) prefix.push(t)
                        else if (t.includes(q)) substr.push(t)
                        if (prefix.length >= 6) break
                      }
                      suggestions = [...prefix, ...substr].slice(0, 6)
                    }
                    const commitTag = (name: string) => {
                      const lower = name.trim().toLowerCase()
                      if (!lower) return
                      if (!customTagsPending.includes(lower)) {
                        setCustomTagsPending([...customTagsPending, lower])
                      }
                      setNewTagInput('')
                      setTagSuggestionsOpen(false)
                      setTagSuggestionIdx(0)
                    }
                    return (
                      <div className="relative">
                        <label className="block text-sm font-medium mb-2">Add Custom Tags</label>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={newTagInput}
                            onChange={(e) => {
                              setNewTagInput(e.target.value)
                              setTagSuggestionsOpen(true)
                              setTagSuggestionIdx(0)
                            }}
                            onFocus={() => setTagSuggestionsOpen(true)}
                            onBlur={() => {
                              // Delay so click-to-pick on a suggestion
                              // registers before the dropdown unmounts.
                              setTimeout(() => setTagSuggestionsOpen(false), 150)
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'ArrowDown' && suggestions.length > 0) {
                                e.preventDefault()
                                setTagSuggestionsOpen(true)
                                setTagSuggestionIdx((i) => Math.min(suggestions.length - 1, i + 1))
                                return
                              }
                              if (e.key === 'ArrowUp' && suggestions.length > 0) {
                                e.preventDefault()
                                setTagSuggestionIdx((i) => Math.max(0, i - 1))
                                return
                              }
                              if (e.key === 'Escape') {
                                setTagSuggestionsOpen(false)
                                return
                              }
                              if (e.key === 'Enter' || e.key === ',') {
                                e.preventDefault()
                                const picked =
                                  tagSuggestionsOpen && suggestions[tagSuggestionIdx]
                                    ? suggestions[tagSuggestionIdx]
                                    : newTagInput.trim().replace(/,$/, '').toLowerCase()
                                commitTag(picked)
                              }
                            }}
                            placeholder="type a tag, press Enter or Add"
                            autoComplete="off"
                            className="flex-1 px-4 py-2 rounded-lg bg-white/5 border border-[var(--border)] focus:border-[var(--primary)] focus:outline-none"
                          />
                          <button
                            onClick={() => commitTag(newTagInput)}
                            disabled={!newTagInput.trim()}
                            className="px-4 py-2 rounded-lg bg-[var(--primary)]/20 hover:bg-[var(--primary)]/30 border border-[var(--primary)]/40 text-[var(--primary)] text-sm font-medium transition disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            Add
                          </button>
                        </div>
                        {tagSuggestionsOpen && suggestions.length > 0 && (
                          <div className="absolute left-0 right-0 top-full mt-1 z-20 rounded-lg border border-[var(--border)] bg-[var(--panel)] shadow-lg overflow-hidden">
                            {suggestions.map((s, i) => (
                              <button
                                key={s}
                                onMouseDown={(e) => { e.preventDefault(); commitTag(s) }}
                                onMouseEnter={() => setTagSuggestionIdx(i)}
                                className={cn(
                                  'w-full text-left px-3 py-1.5 text-sm flex items-center justify-between transition',
                                  i === tagSuggestionIdx ? 'bg-[var(--primary)]/20 text-white' : 'text-[var(--muted)] hover:bg-white/5'
                                )}
                              >
                                <span>{s}</span>
                                <span className="text-[10px] opacity-50">existing tag</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  })()}
                  {/* Pending custom-tag chips — same row as before, just
                      lifted out of the autocomplete-wrapper so it lives
                      at the section level. Click × to drop a chip. */}
                  {customTagsPending.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {customTagsPending.map((tag, idx) => (
                        <span
                          key={`pending-${idx}`}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs bg-[var(--primary)]/15 border border-[var(--primary)]/40 text-[var(--primary)]"
                        >
                          {tag}
                          <button
                            onClick={() => setCustomTagsPending(customTagsPending.filter((_, i) => i !== idx))}
                            className="opacity-60 hover:opacity-100"
                            title={`Remove "${tag}"`}
                          >
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Apply with edits button */}
                  <button
                    onClick={approveEditedItem}
                    className="w-full py-3 rounded-lg font-medium bg-[var(--primary)] text-white hover:opacity-90 transition"
                  >
                    Apply with Edits
                  </button>
                </div>
              ) : (
                <div className="h-full flex items-center justify-center text-[var(--muted)]">
                  <div className="text-center">
                    <Eye size={48} className="mx-auto mb-4 opacity-50" />
                    <p>Select an item to review</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'tools' && (
          <div className="max-w-2xl mx-auto space-y-6">
            {/* Tagger Quality — library-wide consensus stats from multi-frame
                agreement (#78). Tells the user how confident the existing
                analyses are + offers a "re-analyze low-agreement" action. */}
            <TaggerQualityCard />

            {/* Porn-domains blocklist — augments the bundled ~50-domain
                set used to auto-emit platform tags from filenames.
                Upload a Bon-Appetit-style .txt to expand coverage to
                hundreds of additional sites. */}
            <div className="bg-[var(--panel)] rounded-xl border border-[var(--border)] p-6">
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <Tag size={20} />
                Porn-domains list
              </h2>
              <p className="text-sm text-[var(--muted)] mb-4">
                Vault bundles a curated ~50-domain set for filename platform-tag
                detection ("filename contains <span className="font-mono">brazzers</span> → tag the
                video <span className="font-mono">brazzers</span>"). Upload a longer list
                (Bon-Appetit/porn-domains format, one domain per line, <span className="font-mono">#</span> comments OK)
                to widen coverage.
              </p>
              <div className="flex items-center justify-between p-3 rounded-lg bg-white/5 mb-3 gap-3">
                <div className="text-sm flex-1 min-w-0">
                  {domainsStatus === null ? (
                    <span className="text-[var(--muted)]">Checking…</span>
                  ) : (
                    <>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <span className="tabular-nums">
                          <span className="text-white font-medium">{domainsStatus.bundled}</span>
                          <span className="text-[var(--muted)] text-xs ml-1">bundled</span>
                        </span>
                        <span className="tabular-nums">
                          <span className="text-white font-medium">{domainsStatus.user}</span>
                          <span className="text-[var(--muted)] text-xs ml-1">user</span>
                        </span>
                        <span className="text-[var(--muted)]">·</span>
                        <span className="tabular-nums text-[var(--primary)] font-semibold">
                          {domainsStatus.total} total
                        </span>
                      </div>
                      {domainsStatus.userPath && (
                        <div className="text-[10px] text-[var(--muted)] mt-1 font-mono truncate" title={domainsStatus.userPath}>
                          {domainsStatus.userPath}
                        </div>
                      )}
                    </>
                  )}
                </div>
                <button
                  onClick={async () => {
                    setDomainsBusy(true)
                    try {
                      const result = await window.api.ai.uploadDomainsList?.()
                      if (result && !result.canceled) {
                        setDomainsStatus({
                          bundled: result.bundled,
                          user: result.user,
                          total: result.total,
                          userPath: result.userPath,
                        })
                        showToast?.('success', `Loaded ${result.loaded} domains from list`)
                      }
                    } catch (err: any) {
                      showToast?.('error', err?.message ?? 'Failed to load domains list')
                    } finally {
                      setDomainsBusy(false)
                    }
                  }}
                  disabled={domainsBusy}
                  className="text-sm px-3 py-1.5 rounded bg-[var(--primary)]/20 hover:bg-[var(--primary)]/30 border border-[var(--primary)]/40 text-[var(--primary)] transition disabled:opacity-50 flex-shrink-0"
                >
                  {domainsBusy ? (
                    <span className="inline-flex items-center gap-1">
                      <Loader2 size={12} className="animate-spin" /> Loading…
                    </span>
                  ) : domainsStatus?.user ? 'Replace list' : 'Upload list'}
                </button>
              </div>
              <div className="text-[11px] text-[var(--muted)]">
                Tip: grab the latest list from <span className="font-mono text-[var(--primary)]/80">github.com/Bon-Appetit/porn-domains</span> —
                pass the <span className="font-mono">porn.txt</span> file. Existing tags aren't re-evaluated; this affects
                future tagging passes only.
              </div>
            </div>

            {/* Top rejected AI tags — pulled from the per-decision
                rejection_history that already powers Tier 2 prompt
                priors. Lets the user see which suggestions are most
                often wrong; click a row to push the tag into the
                merger's source picker for a quick cleanup. */}
            {rejectionPatterns && rejectionPatterns.rejectedTags.length > 0 && (
              <div className="bg-[var(--panel)] rounded-xl border border-[var(--border)] p-6">
                <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                  <XCircle size={20} />
                  Most-rejected AI tags
                </h2>
                <p className="text-sm text-[var(--muted)] mb-4">
                  Tags the AI suggested that you rejected most. Use this to spot
                  recurring miscategorizations — e.g. a model consistently
                  guessing "redhead" when the performer is brunette.
                  Click any row to load it into the merger above.
                  <span className="block mt-1 text-[10px] opacity-70">
                    Based on {rejectionPatterns.totalEvents} review event{rejectionPatterns.totalEvents === 1 ? '' : 's'} library-wide.
                  </span>
                </p>
                <div className="space-y-1.5">
                  {rejectionPatterns.rejectedTags.slice(0, 10).map((r, i) => (
                    <button
                      key={r.name}
                      onClick={() => {
                        setMergeSource(r.name)
                        showToast?.('info', `Loaded "${r.name}" into merger source`)
                      }}
                      className="w-full text-left flex items-center justify-between px-3 py-1.5 rounded hover:bg-white/5 transition group"
                      title={`Click to load "${r.name}" into the merger above`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-[10px] tabular-nums text-[var(--muted)] w-5">
                          {i + 1}.
                        </span>
                        <span className="text-sm truncate">{r.name}</span>
                        {rejectionPatterns.hotRejections.includes(r.name) && (
                          <span className="text-[9px] px-1 py-px rounded bg-red-500/20 text-red-300 border border-red-500/30">
                            HOT
                          </span>
                        )}
                      </div>
                      <span className="text-xs tabular-nums text-[var(--muted)] group-hover:text-white">
                        {r.count}× rejected
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Contact-sheet backfill — generates 4×3 frame grids for
                every video that doesn't have one yet. New videos get
                their sheet auto-generated after Tier 2; this fills in
                the back catalog so the Review pane's "Frame grid"
                preview is available everywhere. */}
            <div className="bg-[var(--panel)] rounded-xl border border-[var(--border)] p-6">
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <Layers size={20} />
                Contact-sheet backfill
              </h2>
              <p className="text-sm text-[var(--muted)] mb-4">
                Generate a 4×3 frame grid for every video missing one. Lets the
                Review pane show a glance-able frame strip for older items.
                Serial pass — runs alongside the live queue without blocking
                other AI work.
              </p>
              {contactBackfillProgress && contactBackfillBusy && (
                <div className="mb-3 p-3 rounded-lg bg-white/5 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="tabular-nums">
                      {contactBackfillProgress.processed} / {contactBackfillProgress.total}
                    </span>
                    <span className="tabular-nums text-[var(--muted)]">
                      <span className="text-green-400">{contactBackfillProgress.generated} new</span>
                      <span className="mx-2 opacity-50">·</span>
                      <span>{contactBackfillProgress.skipped} skipped</span>
                      {contactBackfillProgress.failed > 0 && (
                        <>
                          <span className="mx-2 opacity-50">·</span>
                          <span className="text-red-400">{contactBackfillProgress.failed} failed</span>
                        </>
                      )}
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-black/30 overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-[var(--primary)] to-purple-500 transition-all"
                      style={{
                        width: `${contactBackfillProgress.total > 0
                          ? (contactBackfillProgress.processed / contactBackfillProgress.total) * 100
                          : 0}%`,
                      }}
                    />
                  </div>
                </div>
              )}
              {contactBackfillResult && !contactBackfillBusy && (
                <div className="mb-3 p-3 rounded-lg bg-green-500/10 border border-green-500/30 text-sm text-green-100">
                  {contactBackfillResult.canceled ? 'Canceled — ' : 'Done — '}
                  generated <strong>{contactBackfillResult.generated}</strong> new,
                  skipped <strong>{contactBackfillResult.skipped}</strong>
                  {contactBackfillResult.failed > 0 && (
                    <>, <span className="text-red-300">{contactBackfillResult.failed} failed</span></>
                  )}
                  {' '}of <strong>{contactBackfillResult.total}</strong> videos.
                </div>
              )}
              <div className="flex items-center gap-2">
                <button
                  onClick={async () => {
                    if (contactBackfillBusy) return
                    setContactBackfillBusy(true)
                    setContactBackfillResult(null)
                    setContactBackfillProgress(null)
                    try {
                      const result = await window.api.ai.contactSheetBackfill?.()
                      setContactBackfillResult({
                        canceled: result?.canceled,
                        total: result?.total ?? 0,
                        generated: result?.generated ?? 0,
                        skipped: result?.skipped ?? 0,
                        failed: result?.failed ?? 0,
                      })
                      if (!result?.ok && result?.error) {
                        showToast?.('error', result.error)
                      } else if (result?.generated > 0) {
                        showToast?.('success', `Generated ${result.generated} contact sheets`)
                      }
                    } catch (err: any) {
                      showToast?.('error', err?.message ?? 'Backfill failed')
                    } finally {
                      setContactBackfillBusy(false)
                    }
                  }}
                  disabled={contactBackfillBusy}
                  className="px-4 py-2 rounded-lg bg-[var(--primary)] text-white text-sm font-medium hover:opacity-90 transition disabled:opacity-50"
                >
                  {contactBackfillBusy ? (
                    <span className="inline-flex items-center gap-2">
                      <Loader2 size={14} className="animate-spin" />
                      Generating…
                    </span>
                  ) : 'Backfill all videos'}
                </button>
                {contactBackfillBusy && (
                  <button
                    onClick={() => window.api.ai.contactSheetBackfillCancel?.()}
                    className="px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-sm text-[var(--muted)] transition"
                  >
                    Cancel
                  </button>
                )}
              </div>
            </div>

            {/* Filename ML classifier — bag-of-tokens model trained
                on user's approved-media filenames. Emits performer /
                position priors when a new filename's tokens match
                patterns learned from past approvals. */}
            <div className="bg-[var(--panel)] rounded-xl border border-[var(--border)] p-6">
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <Brain size={20} />
                Filename ML classifier
              </h2>
              <p className="text-sm text-[var(--muted)] mb-4">
                Learns from your approved media's filenames. Tokens common to
                certain tags ("Lana_Rhoades" → brunette + busty)
                become tag priors for future videos with similar filenames.
                Retrains from scratch — takes ~50 ms per 1,000 approved items.
              </p>
              <div className="flex items-center justify-between p-3 bg-white/5 rounded-lg mb-3">
                <div className="text-sm space-y-0.5">
                  {filenameMlStatus === null ? (
                    <span className="text-[var(--muted)]">Checking…</span>
                  ) : filenameMlStatus.samples === 0 ? (
                    <span className="text-[var(--muted)]">Not trained yet — needs ≥10 approved items.</span>
                  ) : (
                    <>
                      <div>
                        <span className="text-white font-medium tabular-nums">{filenameMlStatus.samples}</span>
                        <span className="text-[var(--muted)] ml-1">samples</span>
                        <span className="mx-2 opacity-50">·</span>
                        <span className="text-white font-medium tabular-nums">{filenameMlStatus.tokens}</span>
                        <span className="text-[var(--muted)] ml-1">tokens</span>
                        <span className="mx-2 opacity-50">·</span>
                        <span className="text-white font-medium tabular-nums">{filenameMlStatus.tags}</span>
                        <span className="text-[var(--muted)] ml-1">tags</span>
                      </div>
                      <div className="text-[10px] text-[var(--muted)]">
                        Trained {new Date(filenameMlStatus.trainedAt).toLocaleString()}
                      </div>
                    </>
                  )}
                </div>
                <button
                  onClick={async () => {
                    setFilenameMlBusy(true)
                    try {
                      const r = await window.api.ai.filenameClassifierRetrain?.()
                      if (r?.ok) {
                        setFilenameMlStatus({
                          samples: r.samples,
                          tokens: r.tokens,
                          tags: r.tags,
                          trainedAt: new Date().toISOString(),
                        })
                        showToast?.('success', `Trained on ${r.samples} approved items (${r.tokens} tokens, ${r.tags} tags)`)
                      } else {
                        showToast?.('error', 'Retrain failed')
                      }
                    } catch (err: any) {
                      showToast?.('error', err?.message ?? 'Retrain failed')
                    } finally {
                      setFilenameMlBusy(false)
                    }
                  }}
                  disabled={filenameMlBusy}
                  className="text-xs px-3 py-1.5 rounded bg-[var(--primary)]/20 hover:bg-[var(--primary)]/30 border border-[var(--primary)]/40 text-[var(--primary)] transition disabled:opacity-50"
                >
                  {filenameMlBusy ? (
                    <span className="inline-flex items-center gap-1">
                      <Loader2 size={12} className="animate-spin" /> Training…
                    </span>
                  ) : 'Retrain now'}
                </button>
              </div>
            </div>

            {/* Tag merger — user-directed collapse of two tags into
                one. Picks source + target via two autocomplete inputs;
                "Merge" re-links every media currently tagged with the
                source to the target, then deletes the source tag.
                Target is auto-created if it doesn't yet exist (so the
                user can normalize toward a canonical name). */}
            <div className="bg-[var(--panel)] rounded-xl border border-[var(--border)] p-6">
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <Tag size={20} />
                Merge tags
              </h2>
              <p className="text-sm text-[var(--muted)] mb-4">
                Collapse duplicates like <span className="font-mono">blowjob</span> + <span className="font-mono">blowjobs</span>
                or <span className="font-mono">POV</span> + <span className="font-mono">pov</span>. Every media tagged
                with the source moves to the target; the source tag is then deleted.
                Auto-creates the target if it doesn't yet exist.
              </p>
              {(() => {
                // Tiny inline autocomplete component — same prefix-then-
                // substring matching as the review-pane custom-tag input
                // but scoped to this section's two pickers.
                const renderPicker = (
                  label: string,
                  value: string,
                  setValue: (v: string) => void,
                  open: boolean,
                  setOpen: (v: boolean) => void,
                  excludeName?: string
                ) => {
                  const q = value.trim().toLowerCase()
                  let suggestions: string[] = []
                  if (q.length >= 1 && allTagNames.length > 0) {
                    const prefix: string[] = []
                    const substr: string[] = []
                    for (const t of allTagNames) {
                      if (excludeName && t === excludeName.toLowerCase()) continue
                      if (t === q) continue
                      if (t.startsWith(q)) prefix.push(t)
                      else if (t.includes(q)) substr.push(t)
                      if (prefix.length >= 6) break
                    }
                    suggestions = [...prefix, ...substr].slice(0, 6)
                  }
                  return (
                    <div className="relative flex-1 min-w-0">
                      <label className="block text-xs text-[var(--muted)] mb-1">{label}</label>
                      <input
                        type="text"
                        value={value}
                        onChange={(e) => { setValue(e.target.value); setOpen(true) }}
                        onFocus={() => setOpen(true)}
                        onBlur={() => setTimeout(() => setOpen(false), 150)}
                        placeholder="tag name"
                        autoComplete="off"
                        className="w-full px-3 py-2 rounded-lg bg-white/5 border border-[var(--border)] focus:border-[var(--primary)] focus:outline-none text-sm"
                      />
                      {open && suggestions.length > 0 && (
                        <div className="absolute left-0 right-0 top-full mt-1 z-10 rounded-lg border border-[var(--border)] bg-[var(--panel)] shadow-lg overflow-hidden">
                          {suggestions.map((s) => (
                            <button
                              key={s}
                              onMouseDown={(e) => { e.preventDefault(); setValue(s); setOpen(false) }}
                              className="w-full text-left px-3 py-1.5 text-sm text-[var(--muted)] hover:bg-white/5 hover:text-white transition"
                            >
                              {s}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                }
                return (
                  <div className="space-y-3">
                    <div className="flex items-end gap-2">
                      {renderPicker('Source (will be deleted)', mergeSource, setMergeSource, mergeSourceOpen, setMergeSourceOpen, mergeTarget)}
                      <div className="text-[var(--muted)] pb-2.5">→</div>
                      {renderPicker('Target (kept)', mergeTarget, setMergeTarget, mergeTargetOpen, setMergeTargetOpen, mergeSource)}
                      <button
                        onClick={async () => {
                          if (!mergeSource.trim() || !mergeTarget.trim()) return
                          if (mergeSource.trim().toLowerCase() === mergeTarget.trim().toLowerCase()) {
                            showToast?.('error', 'Source and target are the same tag')
                            return
                          }
                          setMergeBusy(true)
                          try {
                            const r = await window.api.tags.merge?.(mergeSource.trim(), mergeTarget.trim())
                            if (r?.ok === false) {
                              showToast?.('error', r.error)
                            } else if (r?.ok) {
                              showToast?.('success', `Merged "${r.sourceName}" → "${r.targetName}" · moved ${r.moved} link${r.moved === 1 ? '' : 's'}${r.duplicatesCollapsed ? `, collapsed ${r.duplicatesCollapsed} duplicate${r.duplicatesCollapsed === 1 ? '' : 's'}` : ''}`)
                              setMergeSource('')
                              setMergeTarget('')
                              // Refresh autocomplete list (source is gone now).
                              try {
                                const tags = await window.api.tags?.list?.()
                                if (Array.isArray(tags)) {
                                  setAllTagNames(tags.map((t: any) => String(t.name ?? t).toLowerCase()).filter(Boolean))
                                }
                              } catch { /* leave stale */ }
                            }
                          } catch (err: any) {
                            showToast?.('error', err?.message ?? 'Merge failed')
                          } finally {
                            setMergeBusy(false)
                          }
                        }}
                        disabled={mergeBusy || !mergeSource.trim() || !mergeTarget.trim()}
                        className="px-4 py-2 rounded-lg bg-[var(--primary)] text-white text-sm font-medium hover:opacity-90 transition disabled:opacity-50 flex-shrink-0"
                      >
                        {mergeBusy ? (
                          <span className="inline-flex items-center gap-2">
                            <Loader2 size={12} className="animate-spin" />
                            Merging…
                          </span>
                        ) : 'Merge'}
                      </button>
                    </div>
                    {/* Live preview — count of media that will move,
                        collapse-as-duplicate overlap, and target final
                        count. Updates ~300ms after typing settles. */}
                    {mergePreview && mergePreview.ok && (
                      <div className="text-[11px] rounded bg-white/5 border border-white/10 px-2.5 py-1.5">
                        <div className="flex items-center gap-3 flex-wrap">
                          <span>
                            <span className="text-amber-300 font-medium tabular-nums">{mergePreview.sourceCount}</span>
                            <span className="text-[var(--muted)] ml-1">on source</span>
                          </span>
                          <span>
                            <span className="text-[var(--primary)] font-medium tabular-nums">
                              {mergePreview.targetExists ? mergePreview.targetCount : '0'}
                            </span>
                            <span className="text-[var(--muted)] ml-1">
                              on target{!mergePreview.targetExists && ' (will be created)'}
                            </span>
                          </span>
                          {mergePreview.overlap > 0 && (
                            <span>
                              <span className="text-purple-300 font-medium tabular-nums">{mergePreview.overlap}</span>
                              <span className="text-[var(--muted)] ml-1">already on both</span>
                            </span>
                          )}
                        </div>
                        <div className="mt-1 text-[var(--muted)]">
                          → Will move <strong className="text-white">{mergePreview.moved}</strong> media to target;
                          target ends with <strong className="text-white">{(mergePreview.targetExists ? mergePreview.targetCount : 0) + mergePreview.moved}</strong> items.
                        </div>
                      </div>
                    )}
                    {mergePreview && !mergePreview.ok && (
                      <div className="text-[11px] text-red-300/80">{mergePreview.error}</div>
                    )}
                    <div className="text-[10px] text-[var(--muted)]">
                      Irreversible — the source tag is deleted after re-linking. Consider running cleanup first to catch obvious patterns.
                    </div>
                  </div>
                )
              })()}
            </div>

            {/* Tag Cleanup */}
            <div className="bg-[var(--panel)] rounded-xl border border-[var(--border)] p-6">
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <Sparkles size={20} />
                Tag Cleanup
              </h2>
              <p className="text-sm text-[var(--muted)] mb-4">
                Strip junk tags using the live filter pipeline:
                hair colors ("blonde", "redhead"), furniture ("checkered pillow", "white sheets"),
                hedge phrases ("implied X", "appears to be"), film-grammar shots
                ("medium shot", "wide shot"), drawing-style jargon ("3d render", "sfm"),
                and clinical / captioner output ("clitoral stimulation", "sexual intercourse").
                Cleans both the live tags table AND old review records so the Review pane
                converges with the new filters without re-scanning every video.
                Tags are permanently deleted.
              </p>
              <button
                onClick={async () => {
                  try {
                    const result = await window.api.ai?.cleanupTags?.()
                    const lines: string[] = []
                    if (result?.migratedTags) {
                      lines.push(`Migrated ${result.migratedTags} tag${result.migratedTags === 1 ? '' : 's'} to canonical (re-linked ${result.migratedLinks} media entries).`)
                    }
                    if (result?.removedTags) {
                      lines.push(`Removed ${result.removedTags} junk tag${result.removedTags === 1 ? '' : 's'}.`)
                    }
                    if (result?.cleanedReviews) {
                      lines.push(`Stripped ${result.strippedTagEntries} junk entries from ${result.cleanedReviews} review record${result.cleanedReviews === 1 ? '' : 's'}.`)
                    }
                    if (lines.length === 0) lines.push('Library is already clean.')
                    showToast?.('success', lines.join(' '))
                  } catch (err) {
                    console.error('Tag cleanup failed:', err)
                    showToast?.('error', 'Tag cleanup failed - see console for details')
                  }
                }}
                className="px-6 py-3 rounded-xl bg-[var(--primary)] text-white font-medium hover:opacity-90 transition"
              >
                Clean Up Tags
              </button>
            </div>

            {/* Protected Tags */}
            <div className="bg-[var(--panel)] rounded-xl border border-[var(--border)] p-6">
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <Shield size={20} />
                Protected Tags
              </h2>
              <p className="text-sm text-[var(--muted)] mb-4">
                Tags added here will never be deleted during cleanup, even if they match
                patterns that would normally be removed.
              </p>

              {/* Current protected tags */}
              {protectedTags.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-4">
                  {protectedTags.map((tag) => (
                    <button
                      key={tag}
                      onClick={async () => {
                        try {
                          await window.api.ai.removeProtectedTag?.(tag)
                          loadProtectedTags()
                        } catch (err) {
                          console.error('[Settings] Failed to remove protected tag:', err)
                        }
                      }}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-green-500/20 border border-green-500/30 text-green-400 text-sm hover:bg-green-500/30 transition"
                    >
                      <span>{tag}</span>
                      <X size={12} />
                    </button>
                  ))}
                </div>
              )}

              {/* Add new protected tag */}
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newProtectedTag}
                  onChange={(e) => setNewProtectedTag(e.target.value)}
                  onKeyDown={async (e) => {
                    if (e.key === 'Enter' && newProtectedTag.trim()) {
                      try {
                        await window.api.ai.addProtectedTag?.(newProtectedTag.trim())
                        setNewProtectedTag('')
                        loadProtectedTags()
                      } catch (err) {
                        console.error('[Settings] Failed to add protected tag:', err)
                      }
                    }
                  }}
                  placeholder="Enter tag to protect..."
                  className="flex-1 px-4 py-2 rounded-xl bg-black/30 border border-[var(--border)] text-sm focus:outline-none focus:border-[var(--primary)]"
                />
                <button
                  onClick={async () => {
                    if (newProtectedTag.trim()) {
                      try {
                        await window.api.ai.addProtectedTag?.(newProtectedTag.trim())
                        setNewProtectedTag('')
                        loadProtectedTags()
                      } catch (err) {
                        console.error('[Settings] Failed to add protected tag:', err)
                      }
                    }
                  }}
                  className="px-4 py-2 rounded-xl bg-green-500/20 border border-green-500/30 text-green-400 text-sm hover:bg-green-500/30 transition"
                >
                  Add
                </button>
              </div>
            </div>

            {/* Bulk File Rename */}
            <div className="bg-[var(--panel)] rounded-xl border border-[var(--border)] p-6">
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <FileText size={20} />
                Bulk File Rename
              </h2>
              <p className="text-sm text-[var(--muted)] mb-4">
                Smart file renaming that cleans up messy filenames by removing random codes,
                underscores, and gibberish while preserving meaningful parts.
              </p>
              <button
                onClick={async () => {
                  const ok = await confirm({
                    title: 'Rename files with messy names?',
                    body: 'Removes random codes, underscores, and gibberish from filenames while preserving meaningful parts. The originals are renamed on disk; sidecars and DB rows update too.',
                    confirmLabel: 'Rename all',
                  })
                  if (!ok) return
                  try {
                    const result = await window.api.media?.optimizeAllNames?.()
                    if (result?.optimized > 0) {
                      showToast('success', `Renamed ${result.optimized} files (${result.skipped} skipped, ${result.failed} failed)`)
                    } else {
                      showToast('info', 'No files needed renaming')
                    }
                  } catch (err) {
                    console.error('Bulk rename failed:', err)
                    showToast('error', 'Rename failed: ' + (err as Error).message)
                  }
                }}
                className="px-6 py-3 rounded-xl bg-[var(--primary)] text-white font-medium hover:opacity-90 transition"
              >
                Start Bulk Rename
              </button>
            </div>

            {/* Auto Tag with AI */}
            <div className="bg-[var(--panel)] rounded-xl border border-[var(--border)] p-6">
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <Tag size={20} />
                Queue All for AI Tagging
              </h2>
              <p className="text-sm text-[var(--muted)] mb-4">
                Add all untagged media to the AI processing queue. Items will be analyzed
                and tagged automatically using the Tier 1 AI models.
              </p>
              <button
                onClick={async () => {
                  try {
                    const result = await window.api.ai?.queueUntagged?.()
                    if (result?.queued > 0) {
                      showToast('success', `Queued ${result.queued} items — open the Queue tab to start processing`)
                    } else {
                      showToast('info', 'No untagged items found to queue')
                    }
                  } catch (err) {
                    console.error('Queue failed:', err)
                    showToast('error', 'Queue failed: ' + (err as Error).message)
                  }
                }}
                disabled={!modelsReady}
                className={cn(
                  "px-6 py-3 rounded-xl font-medium transition",
                  modelsReady
                    ? "bg-[var(--primary)] text-white hover:opacity-90"
                    : "bg-white/10 text-[var(--muted)] cursor-not-allowed"
                )}
              >
                {modelsReady ? 'Queue Untagged Media' : 'Download Models First'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Full-screen contact sheet modal. Mounted at page-root so it
          escapes the Review pane's scroll container. Click outside the
          image or Escape to dismiss. */}
      {contactSheetFullscreen && contactSheetUrl && (
        <div
          className="fixed inset-0 z-[100] bg-black/85 backdrop-blur-sm flex items-center justify-center p-6"
          onClick={() => setContactSheetFullscreen(false)}
          onKeyDown={(e) => { if (e.key === 'Escape') setContactSheetFullscreen(false) }}
          role="dialog"
          aria-modal="true"
          tabIndex={-1}
        >
          <button
            onClick={() => setContactSheetFullscreen(false)}
            className="absolute top-4 right-4 p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white transition"
            title="Close (Esc)"
          >
            <X size={20} />
          </button>
          <img
            src={contactSheetUrl}
            alt="Contact sheet — full size"
            className="max-w-full max-h-full object-contain rounded-lg shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-xs text-white/70 bg-black/40 px-3 py-1 rounded-full">
            Click outside or press Esc to close
          </div>
        </div>
      )}
    </div>
  )
}
