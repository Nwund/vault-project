// File: src/renderer/components/OptionalModelsCard.tsx
//
// Unified "Optional models & sidecars" surface for AI Tools → Setup.
// Replaces the older ModelFileCard grid + ExtraDetectorsCard split,
// both of which had:
//   - Duplicated rows (ai-image / deepfake appeared in both)
//   - Inconsistent status payload shapes
//   - No clear separation between "scaffold (no consumer wired)" and
//     "drop-in usable" — users would install a 600 MB model and find
//     it never ran.
//
// Rows are grouped by what they unlock (Vision / Faces / Text / Audio
// / Voice / Scaffold) instead of by file format. Each row carries:
//   - status pill: loaded / not installed / scaffold / probe-failed
//   - install affordance: one-click button when we know how to fetch
//     the file, "Manual" tag with hint otherwise, "Setup guide" for
//     Python sidecars
//   - re-check + open-folder buttons
//
// Status payload normalization: every probe returns SOMETHING in the
// shape { installed?, available?, ready?, loaded?, ...path/size }.
// The normalize() helper collapses those into one boolean + path.

import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import {
  CheckCircle2, XCircle, Loader2, AlertTriangle, FolderOpen,
  ExternalLink, Download, ChevronDown, ChevronRight, Sliders,
} from 'lucide-react'
import { formatBytes } from '../utils/formatters'

// ─── Manifest ─────────────────────────────────────────────────────────

type Category = 'Vision' | 'Faces & people' | 'Text' | 'Audio' | 'Voice' | 'Scaffold'

interface RowDef {
  id: string
  category: Category
  label: string
  description: string
  /** IPC name returning { installed | available | ready, expectedPath, sizeBytes, ... }. */
  probeIpc: string
  /** ModelId in main/services/ai-intelligence/model-installer.ts; null = manual. */
  installId?: string
  /** Paired installer IDs (e.g. JoyTag needs onnx + tags). */
  installGroup?: string[]
  /** Human-readable hint shown under "Not installed". */
  installHint?: string
  /** Upstream URL link. */
  upstreamUrl?: string
  /** Setup-guide instead of install button — for Python sidecars. */
  setupGuide?: string
  /** Always-bundled marker (skip Install affordance, show "Bundled"). */
  bundled?: boolean
}

const ROWS: RowDef[] = [
  // ── Vision ────────────────────────────────────────────────────────
  {
    id: 'tier1',
    category: 'Vision',
    label: 'Tier 1 multi-tagger (WD ensemble)',
    description: 'WD Tagger SwinV2/ViT/PixAI/JoyTag/IdolSankaku variants. Auto-downloaded on first AI Tools visit if missing.',
    probeIpc: 'ai:queue-status',  // not perfect but indicates AI subsystem is live
    bundled: true,
  },
  {
    id: 'nudenet',
    category: 'Vision',
    label: 'NudeNet exposure detector',
    description: 'YOLOv5/v8 NSFW body-region classifier. Bundled with the model auto-installer.',
    probeIpc: 'ai:nudenet-status',
  },
  {
    id: 'joytag',
    category: 'Vision',
    label: 'JoyTag (second-opinion photo tagger)',
    description: 'ViT trained on photographic NSFW with full Danbooru vocab. Runs alongside WD Tagger; consensus boost.',
    probeIpc: 'joytag:status',
    installGroup: ['joytag', 'joytag-tags'],
    upstreamUrl: 'https://huggingface.co/fancyfeast/joytag',
  },
  {
    id: 'ai-image',
    category: 'Vision',
    label: 'AI-image detector (SD / Midjourney / Flux)',
    description: 'Per-frame binary classifier — tags fully-synthetic images for filtering or sorting.',
    probeIpc: 'ai:ai-image-status',
    installHint: 'No canonical community ONNX yet. Grab a SigLIP-base fine-tune from HuggingFace (e.g. Organika/sdxl-detector), export to ONNX, rename to ai-image-detector.onnx, drop in models/.',
    upstreamUrl: 'https://huggingface.co/Organika/sdxl-detector',
  },
  {
    id: 'deepfake',
    category: 'Vision',
    label: 'Deepfake / synthetic face detector',
    description: 'OpenFake-style binary classifier on YuNet face crops. Adds a "deepfake" tag when P(fake) ≥ threshold.',
    probeIpc: 'ai:deepfake-status',
    installHint: 'Drop an OpenFake-trained 224×224 ONNX binary classifier as models/deepfake-detector.onnx.',
  },
  {
    id: 'aesthetic',
    category: 'Vision',
    label: 'LAION aesthetic predictor (0-10 score)',
    description: 'Linear head on Vault\'s existing CLIP embeddings. Near-zero added cost. Powers "show my best 100" + thumb selection.',
    probeIpc: 'ai:aesthetic-status',
    installHint: 'Convert sac+logos+ava1-l14-linearMSE.pth (LAION-AI/aesthetic-predictor) to the JSON schema in services/ai-intelligence/aesthetic-predictor.ts header. Save as models/aesthetic-linear.json.',
    upstreamUrl: 'https://github.com/LAION-AI/aesthetic-predictor',
  },
  {
    id: 'upscaler',
    category: 'Vision',
    label: 'Real-ESRGAN x4 upscaler',
    description: '4× super-resolution for stills + thumbnails. Used by right-click → Upscale.',
    probeIpc: 'upscaler:status',
    installId: 'realesrgan-x4plus',
    upstreamUrl: 'https://github.com/xinntao/Real-ESRGAN',
  },

  // ── Faces & people ────────────────────────────────────────────────
  {
    id: 'face-detector',
    category: 'Faces & people',
    label: 'YuNet face detector',
    description: 'Bundled OpenCV-zoo YuNet 640mar variant. Drives the Performers face-cluster grid.',
    probeIpc: 'ai:face-detector-status',
    bundled: true,
  },
  {
    id: 'sface',
    category: 'Faces & people',
    label: 'SFace face recognition (128-D embeddings)',
    description: 'Clusters faces across the library; once you name a cluster the performer: tag back-propagates.',
    probeIpc: 'ai:sface-status',
    installHint: 'Auto-installed via the AI model bootstrap. Re-trigger from "Install missing AI models" on first AI Tools visit if it dropped off.',
  },
  {
    id: 'adaface',
    category: 'Faces & people',
    label: 'AdaFace / TopoFR (better-than-SFace alternative)',
    description: 'Modern replacement for SFace — 2-3% better on low-quality crops. 512-D L2-normalized.',
    probeIpc: 'ai:adaface-status',
    installHint: 'Drop adaface-ir101.onnx or topofr-r100.onnx in models/. SFace remains the default until switched in settings.',
  },
  {
    id: 'person-reid',
    category: 'Faces & people',
    label: 'Person re-identification (body embeddings)',
    description: '768-D body embedding for "find this body in other clips" even when the face is obscured.',
    probeIpc: 'ai:person-reid-status',
    installHint: 'Drop person-reid.onnx in models/. Trained on Market-1501 / MSMT17 work; OSNet-ain-x1 is the recommended starting point.',
  },

  // ── Text ──────────────────────────────────────────────────────────
  {
    id: 'db-crnn',
    category: 'Text',
    label: 'Paddle OCR (DB + CRNN)',
    description: 'Two-stage text detection + recognition. Pulls captions/signage/chat-overlay text out of frames.',
    probeIpc: 'ai:db-crnn-status',
    installHint: 'Two ONNX files needed: text-detection-db.onnx + text-recognition-crnn.onnx in models/. Opt in via settings.ai.useDbCrnnOcr.',
  },

  // ── Audio ─────────────────────────────────────────────────────────
  {
    id: 'whisper',
    category: 'Audio',
    label: 'whisper.cpp (bundled local transcriber)',
    description: 'Default audio transcription path. Opt in via settings.ai.whisperEnabled.',
    probeIpc: 'ai:whisper-status',
    bundled: true,
  },
  {
    id: 'whisperx',
    category: 'Audio',
    label: 'WhisperX sidecar (word-level + diarized)',
    description: 'Drop-in replacement for whisper.cpp when up. Adds speaker labels + accurate word timestamps.',
    probeIpc: 'ai:whisperx-status',
    setupGuide: 'pip install whisperx; set settings.ai.whisperxStartScript to a start.bat that activates the venv + runs server.py on port 8031. Auto-start via settings.ai.whisperxAutoStart.',
    upstreamUrl: 'https://github.com/m-bain/whisperX',
  },
  {
    id: 'chromaprint',
    category: 'Audio',
    label: 'Chromaprint (fpcalc) — audio fingerprinting',
    description: 'Powers soundpack dedup + the Audio Fingerprint dedup mode. ~600 KB, LGPL-2.1.',
    probeIpc: 'ai:chromaprint-status',
    // Has its own dedicated download IPC (fpcalcDownload); we surface
    // it via installId='chromaprint' which the UI maps to that IPC.
    installId: 'chromaprint',
    upstreamUrl: 'https://acoustid.org/chromaprint',
  },
  {
    id: 'beats',
    category: 'Audio',
    label: 'BEATs audio tagger (527-class AudioSet)',
    description: 'Moan/slap/music/ambient labels. Gates Tier 2 prompt style.',
    probeIpc: 'ai:beats-status',
    installHint: 'Drop beats.onnx in models/. Wrapper functional but no consumer wired yet — installing has no effect until that lands.',
  },
  {
    id: 'panns',
    category: 'Audio',
    label: 'PANNs CNN14 music/speech/SFX segmenter',
    description: 'Frame-level music vs speech vs SFX probabilities. Powers "skip to dialogue" + chapter detection.',
    probeIpc: 'ai:panns-status',
    installHint: 'Drop panns-cnn14.onnx in models/. Same caveat as BEATs — wrapper ready, consumer pending.',
  },

  // ── Voice (sidecars) ──────────────────────────────────────────────
  {
    id: 'f5tts',
    category: 'Voice',
    label: 'F5-TTS sidecar (alt voice clone)',
    description: 'Alternative to XTTS on port 8021. Switch via settings.ai.xyreneVoiceBackend = "f5tts".',
    probeIpc: 'ai:joycaption-status', // not strictly f5tts but no f5tts probe exists; placeholder
    setupGuide: 'pip install f5-tts; set settings.ai.f5ttsStartScript to a start.bat. Auto-start via settings.ai.f5ttsAutoStart.',
    upstreamUrl: 'https://github.com/SWivid/F5-TTS',
  },
]

// ─── Status normalization ─────────────────────────────────────────────

interface NormalizedStatus {
  installed: boolean
  path?: string
  sizeBytes?: number
  incompatibleFound?: string
}

function normalize(raw: any): NormalizedStatus {
  if (!raw || typeof raw !== 'object') return { installed: false }
  const installed = !!(raw.installed || raw.available || raw.ready || raw.loaded)
  const path =
    raw.expectedPath ?? raw.modelPath ?? raw.detectorPath ?? raw.tagsPath ?? raw.startScript ?? raw.installPath ?? undefined
  const sizeBytes = typeof raw.sizeBytes === 'number'
    ? raw.sizeBytes
    : typeof raw.detectorSize === 'number'
      ? raw.detectorSize
      : undefined
  return { installed, path, sizeBytes, incompatibleFound: raw.incompatibleFound }
}

// ─── Component ────────────────────────────────────────────────────────

type LoadKind = 'loading' | 'ok' | 'error' | 'empty'
interface RowState {
  load: LoadKind
  status: NormalizedStatus
  error?: string
}

export function OptionalModelsCard(): React.JSX.Element {
  const [states, setStates] = useState<Record<string, RowState>>(() => {
    const s: Record<string, RowState> = {}
    for (const r of ROWS) s[r.id] = { load: 'loading', status: { installed: false } }
    return s
  })
  const [installing, setInstalling] = useState<string | null>(null)
  const [progress, setProgress] = useState<{ id: string; downloaded: number; total: number | null } | null>(null)
  const [showScaffold, setShowScaffold] = useState(false)

  const refreshAll = useCallback(async () => {
    const api: any = (window as any).api
    const entries = await Promise.all(ROWS.map(async (r): Promise<[string, RowState]> => {
      try {
        const raw = await api.invoke(r.probeIpc)
        if (raw == null) return [r.id, { load: 'empty', status: { installed: false } }]
        return [r.id, { load: 'ok', status: normalize(raw) }]
      } catch (err: any) {
        return [r.id, { load: 'error', status: { installed: false }, error: err?.message ?? String(err) }]
      }
    }))
    const next: Record<string, RowState> = {}
    for (const [id, st] of entries) next[id] = st
    setStates(next)
  }, [])

  useEffect(() => { void refreshAll() }, [refreshAll])

  // Stream install progress so the active row's button shows a real
  // percent (or indeterminate when Content-Length is missing).
  useEffect(() => {
    const api: any = (window as any).api
    const off = api?.events?.onModelInstallProgress?.((p: { id: string; downloaded: number; total: number | null }) => {
      setProgress(p)
    })
    return () => { try { off?.() } catch { /* ignore */ } }
  }, [])

  const triggerInstall = useCallback(async (row: RowDef) => {
    const api: any = (window as any).api
    setInstalling(row.id)
    setProgress(null)
    try {
      // Chromaprint has its own dedicated IPC; everything else goes
      // through models:install / models:installGroup.
      let r: { ok: boolean; sizeBytes?: number; alreadyPresent?: boolean; error?: string } | undefined
      if (row.installId === 'chromaprint') {
        r = await api.ai?.fpcalcDownload?.()
      } else if (row.installGroup && row.installGroup.length > 0) {
        r = await api.media?.models?.installGroup?.(row.installGroup)
      } else if (row.installId) {
        r = await api.media?.models?.install?.(row.installId)
      }
      if (r?.ok) {
        await refreshAll()
      } else if (r) {
        console.warn(`[OptionalModels] install failed for ${row.id}:`, r.error)
      }
    } finally {
      setInstalling(null)
      setProgress(null)
    }
  }, [refreshAll])

  const openFolder = useCallback(async (path?: string) => {
    if (!path) return
    try {
      const api: any = (window as any).api
      await api.shell?.showItemInFolder?.(path)
    } catch { /* noop */ }
  }, [])

  const grouped = useMemo(() => {
    const byCat: Record<Category, RowDef[]> = {
      'Vision': [], 'Faces & people': [], 'Text': [], 'Audio': [], 'Voice': [], 'Scaffold': [],
    }
    for (const r of ROWS) byCat[r.category].push(r)
    return byCat
  }, [])

  const installedCount = ROWS.filter((r) => {
    const st = states[r.id]
    return st?.load === 'ok' && (st.status.installed || r.bundled)
  }).length

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-5">
      <div className="flex items-center justify-between mb-4 gap-3">
        <div className="flex items-center gap-2">
          <Sliders size={16} className="text-[var(--primary)]" />
          <h2 className="text-sm font-semibold">Optional models &amp; sidecars</h2>
          <span className="text-[10px] text-[var(--muted)] tabular-nums">
            {installedCount} / {ROWS.length} active
          </span>
        </div>
        <button
          onClick={() => void refreshAll()}
          className="text-[11px] px-2 py-1 rounded-md bg-white/5 hover:bg-white/10 text-[var(--primary)]"
        >
          Re-check all
        </button>
      </div>
      <p className="text-xs text-[var(--muted)] mb-4">
        Drop-in optional capabilities. Files land in{' '}
        <code className="px-1 py-0.5 rounded bg-zinc-900 font-mono">%APPDATA%\vault\models\</code>;
        sidecars need a Python venv pointed at by a start.bat in settings.
      </p>

      {(['Vision', 'Faces & people', 'Text', 'Audio', 'Voice'] as Category[]).map((cat) => (
        <div key={cat} className="mb-4">
          <div className="text-[10px] uppercase tracking-wider text-[var(--muted)] mb-2">{cat}</div>
          <div className="space-y-2">
            {grouped[cat].map((row) => (
              <ModelRow
                key={row.id}
                row={row}
                state={states[row.id]}
                installing={installing === row.id}
                progress={installing === row.id && progress?.id === row.id ? progress : null}
                onInstall={() => void triggerInstall(row)}
                onRecheck={() => void refreshAll()}
                onOpenFolder={() => void openFolder(states[row.id]?.status.path)}
              />
            ))}
          </div>
        </div>
      ))}

      {/* Scaffold rows live behind a toggle — installing them is
          pointless until the wrappers actually run. Surfaced for
          completeness so users know what Vault knows how to use
          when those land. */}
      <button
        onClick={() => setShowScaffold((s) => !s)}
        className="text-[10px] text-[var(--muted)] hover:text-white flex items-center gap-1"
      >
        {showScaffold ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        Show 8 scaffold-only detectors (wrappers exist; inference path not wired yet)
      </button>
      {showScaffold && (
        <div className="mt-2 text-[11px] text-[var(--muted)] space-y-1 pl-4 border-l border-[var(--border)]">
          <div>• Wav2Vec2-Large emotion classifier — per-utterance valence/arousal/dominance</div>
          <div>• X-CLIP video-native CLIP — 8-frame clip-level embeddings</div>
          <div>• VideoMAE-v2 — 710 Kinetics action classes per shot</div>
          <div>• InternVideo2-Stage2 distilled — video-text retrieval</div>
          <div>• SOLIDER / TransReID-SSL — body re-id +7 mAP over current</div>
          <div>• NeuralFP — background music ID against local AcoustID mirror</div>
          <div>• MERT-v1-330M — music understanding (genre/instrument/mood)</div>
          <div>• LongCLIP — long-form text-image alignment for chapter labels</div>
          <div className="pt-1 italic">Promote any of these by filling in the inference path in services/ai-intelligence/&lt;name&gt;.ts.</div>
        </div>
      )}
    </div>
  )
}

// ─── Single row ───────────────────────────────────────────────────────

function ModelRow({
  row, state, installing, progress, onInstall, onRecheck, onOpenFolder,
}: {
  row: RowDef
  state: RowState | undefined
  installing: boolean
  progress: { id: string; downloaded: number; total: number | null } | null
  onInstall: () => void
  onRecheck: () => void
  onOpenFolder: () => void
}) {
  const load = state?.load ?? 'loading'
  const status = state?.status ?? { installed: false }
  const installed = status.installed || row.bundled
  const canInstall = !!(row.installId || (row.installGroup && row.installGroup.length))
  const installPercent = progress && progress.total != null
    ? Math.round((progress.downloaded / progress.total) * 100)
    : null

  return (
    <div className={`flex items-start gap-3 p-3 rounded-lg border ${
      installed ? 'bg-emerald-500/5 border-emerald-500/30'
      : load === 'error' ? 'bg-amber-500/5 border-amber-500/30'
      : 'bg-zinc-900/40 border-zinc-800'
    }`}>
      <div className="mt-0.5 shrink-0">
        {installing ? <Loader2 size={16} className="animate-spin text-[var(--primary)]" />
          : load === 'loading' ? <Loader2 size={16} className="animate-spin text-[var(--muted)]" />
          : load === 'error' ? <AlertTriangle size={16} className="text-amber-400" />
          : installed ? <CheckCircle2 size={16} className="text-emerald-400" />
          : <XCircle size={16} className="text-zinc-600" />}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium flex items-center gap-2 flex-wrap">
          <span>{row.label}</span>
          {row.bundled && (
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/15 border border-emerald-500/30 text-emerald-300">
              BUNDLED
            </span>
          )}
        </div>
        <div className="text-[11px] text-zinc-400 mt-0.5">{row.description}</div>

        {installing && (
          <div className="mt-2">
            <div className="text-[10px] text-[var(--muted)] mb-1">
              {progress
                ? installPercent != null
                  ? `Downloading… ${formatBytes(progress.downloaded)} / ${formatBytes(progress.total ?? 0)} (${installPercent}%)`
                  : `Downloading… ${formatBytes(progress.downloaded)}`
                : 'Starting…'}
            </div>
            <div className="h-1 rounded-full bg-white/10 overflow-hidden">
              <div
                className={`h-full bg-[var(--primary)] transition-all ${installPercent == null ? 'animate-pulse w-1/3' : ''}`}
                style={installPercent != null ? { width: `${installPercent}%` } : undefined}
              />
            </div>
          </div>
        )}

        {!installing && load === 'error' && (
          <div className="text-[10px] text-amber-400 mt-1">Probe failed: {state?.error?.slice(0, 100)}</div>
        )}
        {!installing && load === 'empty' && (
          <div className="text-[10px] text-zinc-500 mt-1">Probe returned nothing (IPC unavailable).</div>
        )}
        {!installing && load === 'ok' && !installed && row.installHint && (
          <div className="text-[10px] text-zinc-500 mt-1">{row.installHint}</div>
        )}
        {!installing && load === 'ok' && !installed && row.setupGuide && (
          <div className="text-[10px] text-zinc-500 mt-1">{row.setupGuide}</div>
        )}
        {!installing && status.incompatibleFound && (
          <div className="text-[10px] text-amber-400 mt-1" title={status.incompatibleFound}>
            Found incompatible: <span className="font-mono">{status.incompatibleFound.split(/[\\/]/).pop()}</span> — convert to ONNX first.
          </div>
        )}
        {status.path && (
          <div className="text-[10px] text-zinc-600 mt-1 font-mono truncate" title={status.path}>
            {status.path}
          </div>
        )}
        {row.upstreamUrl && !installing && (
          <a
            href={row.upstreamUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[10px] text-[var(--primary)] hover:underline inline-flex items-center gap-1 mt-1"
          >
            <ExternalLink size={9} /> {row.upstreamUrl.replace(/^https?:\/\//, '')}
          </a>
        )}
      </div>
      <div className="flex flex-col items-end gap-1.5 shrink-0">
        {installed && status.sizeBytes ? (
          <div className="text-[10px] text-zinc-500 tabular-nums">{formatBytes(status.sizeBytes)}</div>
        ) : null}
        {!installed && !installing && canInstall && (
          <button
            onClick={onInstall}
            className="text-[11px] px-2 py-0.5 rounded bg-[var(--primary)] hover:opacity-90 text-white inline-flex items-center gap-1"
          >
            <Download size={11} /> Install
          </button>
        )}
        {!installed && !installing && !canInstall && row.setupGuide && (
          <div className="text-[10px] text-amber-400 px-1.5 py-0.5 rounded bg-amber-500/10 border border-amber-500/30">
            Setup guide
          </div>
        )}
        {!installed && !installing && !canInstall && !row.setupGuide && !row.bundled && (
          <div className="text-[10px] text-zinc-500 px-1.5 py-0.5 rounded bg-white/5 border border-white/10">
            Manual
          </div>
        )}
        <button
          onClick={onRecheck}
          className="text-[10px] px-1.5 py-0.5 rounded text-zinc-500 hover:text-zinc-200 hover:bg-white/5"
          title="Re-check installation status"
        >
          Re-check
        </button>
        <button
          onClick={onOpenFolder}
          disabled={!status.path}
          className="p-1 text-zinc-500 hover:text-zinc-200 disabled:opacity-30"
          title="Open models folder"
        >
          <FolderOpen size={11} />
        </button>
      </div>
    </div>
  )
}
