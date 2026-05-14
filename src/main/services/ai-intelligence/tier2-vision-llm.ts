// ===============================
// Tier 2 Vision LLM - Venice AI integration for deep analysis
// ===============================

import https from 'https'
import fs from 'fs'
import { extractFilenameHints, renderHintsForPrompt, detectStudio, assessFilename, describeDurationBucket } from './filename-hints'
import { parseFilename, renderParsedForPrompt } from './filename-tokenizer'
import { getCanonicalPromptVocabulary, normalizeToCanonical, isJunkTag, decomposeToAtoms } from './canonical-tags'

// ─────────────────────────────────────────────────────────────────────────────
// Venice model selection.
//
// We use `venice-uncensored-1-2` — Venice's only model that is BOTH
// vision-capable AND trait-tagged "most_uncensored" (verified live via
// /api/v1/models on 2026-05-08). The default vision model
// (`qwen3-vl-235b-a22b`, trait `default_vision`) refuses adult content,
// which is the entire workload here.
//
// `VENICE_DEFAULT_PARAMS` are the shared `venice_parameters` we send on
// every call to keep behavior predictable and fast:
//   - include_venice_system_prompt: false → strips Venice's safety prompt
//   - enable_web_search: 'off'             → never waste latency on web lookups
//   - strip_thinking_response: true        → clean any <think> blocks if model emits them
// ─────────────────────────────────────────────────────────────────────────────
const VENICE_VISION_MODEL = 'venice-uncensored-1-2'
const VENICE_DEFAULT_PARAMS = {
  include_venice_system_prompt: false,
  enable_web_search: 'off' as const,
  strip_thinking_response: true
}

export type Tier2TagSource =
  | 'position'   // missionary, doggystyle, cowgirl, etc.
  | 'action'    // anal sex, blowjob, fingering, etc.
  | 'performer' // gender, body type, hair, ethnicity descriptors
  | 'setting'   // bedroom, outdoors, studio, etc.
  | 'body'      // body type or feature tag (busty, petite, athletic, etc.)
  | 'context'   // POV, amateur, professional, BDSM, fetish, etc.
  | 'intensity' // softcore, hardcore, extreme
  | 'other'

export interface Tier2Tag {
  name: string
  confidence: number  // 0-1
  source: Tier2TagSource
  /** Multi-frame agreement: how many of `totalFrames` flagged this tag.
   *  Single-frame analysis defaults to (1, 1). Used by the review UI to
   *  surface "12/12 agreed" badges so the user can spot low-confidence
   *  tags that only appeared in one frame. */
  frameCount?: number
  totalFrames?: number
  /** Approximate timestamp positions (% through video) where this tag
   *  was detected. Lets the review UI render a "this tag appeared at
   *  0:30, 1:15" timeline. Computed during multi-frame aggregation
   *  by averaging the batch positions where the tag was emitted. */
  framePositions?: number[]
}

export interface Tier2Result {
  title: string | null
  description: string | null
  additionalTags: string[]
  attributes: {
    performerCount: number | null
    setting: string | null
    lighting: string | null
    isPov: boolean | null
    isAmateur: boolean | null
    isProfessional: boolean | null
  }
  // Phase A — rich multi-tag output (Vault is tag-based, no winner-take-all category).
  richTags: Tier2Tag[]
  isAnimated: boolean | null
  genders: string[]
  positions: string[]
  actions: string[]
  // Suggested clean filename for "rename weird names" feature. Without extension.
  suggestedFilename: string | null
  /** Multi-frame consensus stats. Lets the review UI surface "this video
   *  was analyzed across N frames; M tags agreed across all of them"
   *  type signals without re-counting per tag. */
  consensus?: {
    totalFrames: number
    /** Tags that appeared in EVERY frame (high signal). */
    unanimousTagCount: number
    /** Tags that appeared in only one frame (low signal — flag for review). */
    singletonTagCount: number
    /** Average per-tag agreement = mean(frameCount/totalFrames) across all tags. */
    averageAgreement: number
  }
}

export class Tier2VisionLLM {
  private apiKey: string | null = null
  private enabled = false

  configure(config: { apiKey?: string }): void {
    if (config.apiKey) {
      this.apiKey = config.apiKey
      this.enabled = true
    }
  }

  isEnabled(): boolean {
    return this.enabled && !!this.apiKey
  }

  /**
   * Check if a filename is "gibberish" (hash-like, UUID-like, or mostly digits)
   */
  isGibberishFilename(filename: string): boolean {
    // Remove extension
    const name = filename.replace(/\.[^.]+$/, '')

    // Check if it's a hash (8+ hex chars)
    if (/^[a-f0-9]{8,}$/i.test(name)) return true

    // Check if it's a UUID
    if (/^[a-f0-9]{8}-[a-f0-9]{4}/i.test(name)) return true

    // Check if too short
    if (name.length < 4) return true

    // Check if >60% digits with no real words
    const digitCount = (name.match(/\d/g) || []).length
    const hasWord = /[a-z]{3,}/i.test(name)
    if (digitCount / name.length > 0.6 && !hasWord) return true

    return false
  }

  /**
   * Analyze frames using Venice AI vision model.
   *
   * Phase B: with 2+ frames we run ONE Venice call per frame and aggregate the
   * rich-tag results with weighted consensus voting (middle frames weighted 1.2x,
   * agreement across frames boosts confidence). With 1 frame we make a single call.
   *
   * This trades latency (3 frames = 3 sequential calls + 2s delay between) for
   * accuracy — no single frame can mislead the entire tag set.
   */
  async analyze(
    framePaths: string[],
    mediaType: 'video' | 'image' | 'gif',
    filename: string,
    tier1Tags: string[],
    /** Per-frame progress callback for the ProcessingQueue's stage-weighted bar. */
    onFrameProgress?: (completedFrames: number, totalFrames: number) => void,
    /** Past attempts the user rejected — Venice avoids repeating these. */
    rejectionHints?: { prevTitles?: string[]; prevDescs?: string[]; prevTags?: string[] },
    /** Video duration in seconds. Used to inject a content-shape hint
     *  ("compilation, don't summarize as one scene") into the prompt. */
    durationSec?: number | null,
    /** Pre-rendered library-wide rejection-pattern block. The caller
     *  builds this from rejection-patterns.ts so the Tier 2 module
     *  doesn't take a DB dependency. Empty string = no patterns yet. */
    libraryRejectionBlock?: string,
    /** Similar already-approved items from the user's library (top 5 by
     *  cosine similarity on Tier 1 tags). Used as few-shot examples in
     *  the Venice prompt so the model sees concrete "good output" for
     *  similar content from the user's own taste profile. */
    similarApprovedExamples?: Array<{
      filename: string
      title: string | null
      description: string | null
      similarity: number
      sharedTags: string[]
      approvedTags: Array<{ name: string; confidence: number; source: string }>
    }>
  ): Promise<Tier2Result> {
    if (!this.isEnabled()) {
      throw new Error('Tier 2 not configured - missing API key')
    }

    console.log(`[Tier2] Starting analysis for ${filename}`)
    console.log(`[Tier2] Frame paths: ${framePaths.join(', ')}`)

    // Up to 12 frames per the dynamic-sampling spec (task #1): the frame
    // extractor decides the actual count based on video length + audio/
    // motion peaks, and Tier 2 forwards everything it sent. We don't cap
    // below what the extractor produced — that would defeat its
    // length-aware decisions. The 12 ceiling matches the extractor's max
    // and bounds latency at ~12 × (3-5s call + 2s pace) ≈ 1 minute worst-case.
    const selectedFrames = framePaths.slice(0, 12).filter((p) => {
      if (!fs.existsSync(p)) {
        console.warn(`[Tier2] Frame not found: ${p}`)
        return false
      }
      return true
    })

    if (selectedFrames.length === 0) {
      throw new Error('No valid frames to analyze')
    }

    console.log(`[Tier2] Analyzing ${selectedFrames.length} frame(s) for ${filename}`)

    // Single-frame fast path.
    if (selectedFrames.length === 1) {
      onFrameProgress?.(0, 1)
      const r = await this.analyzeSingleFrame(selectedFrames[0], 0, 1, mediaType, filename, tier1Tags, rejectionHints, durationSec, libraryRejectionBlock, similarApprovedExamples)
      onFrameProgress?.(1, 1)
      return r
    }

    // Multi-frame: chunk frames into batches of 3 and send each batch in
    // ONE Venice call. Why 3:
    //   - Venice handles up to ~5 images per message reliably, but each
    //     image eats tokens (~1500-2500 per 1280px frame). 3 keeps total
    //     request size predictable.
    //   - Gives the model cross-frame reasoning ("the position changes
    //     from cowgirl in frame 1 to reverse cowgirl in frame 3 — both
    //     should be tagged") which single-frame analysis can't do.
    //   - 12 frames → 4 calls instead of 12 = 3x latency reduction.
    //   - Still produces ≥2 independent batches for cross-batch consensus
    //     voting via aggregateMultiFrameResults().
    //
    // Each batch returns ONE Tier2Result. We then aggregate across batches
    // as before — same voting/agreement bonus logic applies, the "frame"
    // unit just becomes a "batch" instead.
    const BATCH_SIZE = 3
    const batches: string[][] = []
    for (let i = 0; i < selectedFrames.length; i += BATCH_SIZE) {
      batches.push(selectedFrames.slice(i, i + BATCH_SIZE))
    }

    const perBatchResults: Tier2Result[] = []
    onFrameProgress?.(0, selectedFrames.length)
    let completedFrames = 0
    for (let bi = 0; bi < batches.length; bi++) {
      const batch = batches[bi]
      try {
        const result = await this.analyzeBatch(
          batch,
          bi,
          batches.length,
          selectedFrames.length,
          mediaType,
          filename,
          tier1Tags,
          rejectionHints,
          durationSec,
          libraryRejectionBlock,
          similarApprovedExamples
        )
        perBatchResults.push(result)
      } catch (err) {
        console.warn(`[Tier2] Batch ${bi + 1}/${batches.length} failed:`, err)
      }
      completedFrames += batch.length
      onFrameProgress?.(completedFrames, selectedFrames.length)
      // Pace next batch to respect rate limit. Lower delay because we're
      // making fewer total calls (3-4 instead of 12).
      if (bi < batches.length - 1) {
        await new Promise((res) => setTimeout(res, 1500))
      }
    }

    if (perBatchResults.length === 0) {
      throw new Error('All frame analyses failed')
    }
    if (perBatchResults.length === 1) {
      return perBatchResults[0]
    }

    return aggregateMultiFrameResults(perBatchResults)
  }

  /**
   * Analyze a batch of frames in ONE Venice call. The model sees all
   * frames simultaneously and produces a single combined Tier2Result,
   * letting it reason about position changes / scene continuity that
   * single-frame analysis can't capture.
   */
  private async analyzeBatch(
    framePaths: string[],
    batchIndex: number,
    totalBatches: number,
    totalFrames: number,
    mediaType: 'video' | 'image' | 'gif',
    filename: string,
    tier1Tags: string[],
    rejectionHints?: { prevTitles?: string[]; prevDescs?: string[]; prevTags?: string[] },
    durationSec?: number | null,
    libraryRejectionBlock?: string,
    similarApprovedExamples?: Array<{
      filename: string
      title: string | null
      description: string | null
      similarity: number
      sharedTags: string[]
      approvedTags: Array<{ name: string; confidence: number; source: string }>
    }>
  ): Promise<Tier2Result> {
    // Single-frame batch reuses the existing path (cheaper prompt, no need
    // for multi-image scaffolding).
    if (framePaths.length === 1) {
      return this.analyzeSingleFrame(
        framePaths[0],
        batchIndex,
        totalBatches,
        mediaType,
        filename,
        tier1Tags,
        rejectionHints,
        durationSec,
        libraryRejectionBlock,
        similarApprovedExamples
      )
    }

    const assessment = assessFilename(filename)
    const filenameContext =
      assessment.action === 'generate'
        ? `Current filename "${filename}" is unusable (${assessment.reason}) — generate a new title and suggested_filename.`
        : assessment.action === 'clean'
          ? `Current filename "${filename}" is junk-tagged. Cleaned hint: "${assessment.cleaned}". Use the cleaned form as a soft prior; you may improve on it.`
          : `Current filename "${filename}" may be usable as a hint.`

    const studio = detectStudio(filename)
    const studioBlock = studio ? `\nStudio detected from filename: "${studio}". Reference in title if appropriate.` : ''

    const durationBucket = mediaType === 'video' ? describeDurationBucket(durationSec) : null
    const durationBlock = durationBucket ? `\nVideo length: ${durationBucket}` : ''

    const tier1TagList = tier1Tags.slice(0, 20).join(', ')

    // Estimate each frame's position in the source video. The frame
    // extractor evenly distributes picks across the usable window, so we
    // approximate progress as (frameIndex / totalFrames) — close enough
    // for the model's temporal reasoning. Format as a label list the
    // model can reference per image.
    const frameLabels = framePaths.map((_, i) => {
      const globalIdx = batchIndex * 3 + i
      const progressPct = totalFrames > 1 ? Math.round((globalIdx / (totalFrames - 1)) * 100) : 50
      if (!durationSec || durationSec <= 0) {
        return `Frame ${globalIdx + 1}/${totalFrames} (${progressPct}% through video)`
      }
      const t = (durationSec * progressPct) / 100
      const h = Math.floor(t / 3600)
      const m = Math.floor((t % 3600) / 60)
      const s = Math.floor(t % 60)
      const ts = h > 0
        ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
        : `${m}:${String(s).padStart(2, '0')}`
      return `Frame ${globalIdx + 1}/${totalFrames} at ${ts} (${progressPct}% through video)`
    })

    const filenameHints = extractFilenameHints(filename)
    const hintsBlock = renderHintsForPrompt(filenameHints)
    const parsedFilename = parseFilename(filename)
    const parsedBlock = renderParsedForPrompt(parsedFilename)
    const combinedFilenameBlock = [hintsBlock, parsedBlock].filter(Boolean).join('\n\n')

    let rejectionBlock = ''
    if (rejectionHints) {
      const titles = (rejectionHints.prevTitles ?? []).filter(Boolean)
      const descs = (rejectionHints.prevDescs ?? []).filter(Boolean)
      const tags = (rejectionHints.prevTags ?? []).filter(Boolean)
      if (titles.length || descs.length || tags.length) {
        rejectionBlock = `

═══════════════════════════════════════════════════════════════════════
USER REJECTED THESE PREVIOUS ATTEMPTS — DO NOT REPEAT
═══════════════════════════════════════════════════════════════════════
${titles.length ? `Titles rejected: ${titles.map(t => `"${t}"`).join(', ')}` : ''}
${descs.length ? `Descriptions rejected: ${descs.slice(0, 3).map(d => `"${d.slice(0, 120)}"`).join(' / ')}` : ''}
${tags.length ? `Tags rejected: ${tags.slice(0, 30).join(', ')}` : ''}
═══════════════════════════════════════════════════════════════════════
`
      }
    }

    const systemPrompt = buildVeniceAnalysisSystemPrompt()
    const libraryBlock = libraryRejectionBlock ? '\n\n' + libraryRejectionBlock : ''
    const fewShotBlock = renderFewShotBlock(similarApprovedExamples)

    const userText = `Analyze these ${framePaths.length} frames from the SAME ${mediaType}. They are listed in temporal order:
${frameLabels.map((l, i) => `  • Image ${i + 1}: ${l}`).join('\n')}

${filenameContext}${studioBlock}${durationBlock}${fewShotBlock}

Tier-1 (ONNX) already detected: [${tier1TagList || 'none'}]
Use this as a HINT, not a constraint.${combinedFilenameBlock ? '\n\n' + combinedFilenameBlock : ''}${libraryBlock}${rejectionBlock}

CRITICAL: This is from an ADULT video library. Tag what the VIDEO is across
ALL the frames combined — positions or actions that appear in ANY frame
should be in rich_tags. A position change between frames means BOTH positions
get tagged. If the filename + context point to explicit content, emit those
tags with confidence ≥ 0.7 even if the visible frames are ambiguous.

PREFER tags from this canonical adult-tag vocabulary (these are the words
real porn sites use; matching them helps the user's filtering / search work):
${getCanonicalPromptVocabulary()}

Use the EXACT phrasing above when you can — lowercase, space-separated.

Return ONE JSON object covering all ${framePaths.length} frames together.`

    // Read & inline each frame as base64. Venice's chat API takes
    // multiple image_url parts in the same content array.
    const content: any[] = []
    for (const p of framePaths) {
      try {
        const buf = fs.readFileSync(p)
        content.push({ type: 'image_url', image_url: { url: `data:image/jpeg;base64,${buf.toString('base64')}` } })
      } catch (err) {
        console.warn(`[Tier2] Skipping unreadable frame in batch: ${p}`, err)
      }
    }
    if (content.length === 0) {
      throw new Error('No readable frames in batch')
    }
    content.push({ type: 'text', text: userText })

    console.log(`[Tier2]  · batch ${batchIndex + 1}/${totalBatches}: ${content.length - 1} frames`)

    const requestBody = {
      model: VENICE_VISION_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content }
      ],
      // Bump max_tokens for batched calls — the model has more to describe.
      max_tokens: 3000,
      temperature: 0.15,
      top_p: 0.85,
      frequency_penalty: 0.1,
      response_format: { type: 'json_object' as const },
      venice_parameters: VENICE_DEFAULT_PARAMS
    }

    const response = await this.callVeniceApi(requestBody)
    return this.parseResponse(response)
  }

  /**
   * Analyze a single frame. Used as both the one-shot path and the building
   * block for multi-frame voting.
   *
   * @param frameIndex   0-based position of this frame within the run
   * @param totalFrames  total number of frames being analyzed in this run
   */
  private async analyzeSingleFrame(
    framePath: string,
    frameIndex: number,
    totalFrames: number,
    mediaType: 'video' | 'image' | 'gif',
    filename: string,
    tier1Tags: string[],
    rejectionHints?: { prevTitles?: string[]; prevDescs?: string[]; prevTags?: string[] },
    durationSec?: number | null,
    libraryRejectionBlock?: string,
    similarApprovedExamples?: Array<{
      filename: string
      title: string | null
      description: string | null
      similarity: number
      sharedTags: string[]
      approvedTags: Array<{ name: string; confidence: number; source: string }>
    }>
  ): Promise<Tier2Result> {
    const stats = fs.statSync(framePath)
    console.log(`[Tier2]  · frame ${frameIndex + 1}/${totalFrames}: ${framePath} (${stats.size}B)`)
    const buffer = fs.readFileSync(framePath)
    const base64 = buffer.toString('base64')
    const frameDataUrl = `data:image/jpeg;base64,${base64}`

    // 3-way filename assessment (#76 port from analyzer.py): generate / clean / ok.
    // For 'clean' we still feed Venice the cleaned hint instead of the raw stem.
    const assessment = assessFilename(filename)
    const filenameContext =
      assessment.action === 'generate'
        ? `Current filename "${filename}" is unusable (${assessment.reason}) — generate a new title and suggested_filename.`
        : assessment.action === 'clean'
          ? `Current filename "${filename}" is junk-tagged. Cleaned hint: "${assessment.cleaned}". Use the cleaned form as a soft prior; you may improve on it.`
          : `Current filename "${filename}" may be usable as a hint.`

    // Studio detection — surfaced separately so Venice can reference it in
    // the suggested title (e.g. "Brazzers — …") when the user's library tags
    // are studio-aware. Soft prior only.
    const studio = detectStudio(filename)
    const studioBlock = studio ? `\nStudio detected from filename: "${studio}". Reference in title if appropriate.` : ''

    // Duration bucket — tells Venice whether to summarize as one scene or
    // a compilation. Only applies to videos with a real duration.
    const durationBucket = mediaType === 'video' ? describeDurationBucket(durationSec) : null
    const durationBlock = durationBucket ? `\nVideo length: ${durationBucket}` : ''

    const tier1TagList = tier1Tags.slice(0, 20).join(', ')

    // Per-frame timestamp + position metadata. qwen3-vl supports
    // explicit text-timestamp alignment for temporal reasoning — feeding
    // ACTUAL timestamps (HH:MM:SS / progress %) gives the model better
    // grounding than a categorical "EARLY/MIDDLE/LATE" hint. Researched
    // 2026-05-10 from the Qwen3-VL technical report (arxiv 2511.21631).
    //
    // Fallback: when we don't know duration (image, missing metadata),
    // we still report frame N of M.
    const temporalHint = (() => {
      if (totalFrames === 1) return ''
      // Estimate where in the video this frame sits. The frame extractor
      // distributes picks across [intro%, outro%] of the video — assume
      // even spacing for the prompt label (close enough for the model's
      // temporal reasoning; the extractor's actual placement varies by
      // scene peaks but the user-visible label is more useful as %).
      const progressPct = totalFrames > 1
        ? Math.round((frameIndex / (totalFrames - 1)) * 100)
        : 50
      const tsLabel = (() => {
        if (!durationSec || durationSec <= 0) return null
        const t = (durationSec * progressPct) / 100
        const h = Math.floor(t / 3600)
        const m = Math.floor((t % 3600) / 60)
        const s = Math.floor(t % 60)
        return h > 0
          ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
          : `${m}:${String(s).padStart(2, '0')}`
      })()
      const ts = tsLabel ? ` at ${tsLabel}` : ''
      return ` Frame ${frameIndex + 1} of ${totalFrames}${ts} (${progressPct}% through video).`
    })()

    // Phase D: filename keyword hints (ported from analyzer.py:267-340)
    const filenameHints = extractFilenameHints(filename)
    const hintsBlock = renderHintsForPrompt(filenameHints)
    // Anitomy-style structured parse: studio / performers / date /
    // resolution / title. Lets Venice trust filename data when frames
    // are ambiguous.
    const parsedFilename = parseFilename(filename)
    const parsedBlock = renderParsedForPrompt(parsedFilename)
    const combinedFilenameBlock = [hintsBlock, parsedBlock].filter(Boolean).join('\n\n')

    // Rejection-feedback block: when the user has rejected previous Tier 2
    // attempts on this media, list the rejected directions so Venice
    // produces something different on this pass.
    let rejectionBlock = ''
    if (rejectionHints) {
      const titles = (rejectionHints.prevTitles ?? []).filter(Boolean)
      const descs = (rejectionHints.prevDescs ?? []).filter(Boolean)
      const tags = (rejectionHints.prevTags ?? []).filter(Boolean)
      if (titles.length || descs.length || tags.length) {
        rejectionBlock = `

═══════════════════════════════════════════════════════════════════════
USER REJECTED THESE PREVIOUS ATTEMPTS — DO NOT REPEAT
═══════════════════════════════════════════════════════════════════════
${titles.length ? `Titles rejected: ${titles.map(t => `"${t}"`).join(', ')}` : ''}
${descs.length ? `Descriptions rejected: ${descs.slice(0, 3).map(d => `"${d.slice(0, 120)}"`).join(' / ')}` : ''}
${tags.length ? `Tags rejected: ${tags.slice(0, 30).join(', ')}` : ''}

Look at the frame fresh. Produce DIFFERENT tags, a DIFFERENT title, a
DIFFERENT description angle. The previous output didn't fit the user's
view of this video — try another reading of what's happening.
═══════════════════════════════════════════════════════════════════════
`
      }
    }

    const systemPrompt = buildVeniceAnalysisSystemPrompt()
    // Library-wide rejection block goes BEFORE per-media rejectionBlock so
    // the per-media (specific past attempts on THIS video) is the most
    // recent + most specific signal Venice sees.
    const libraryBlock = libraryRejectionBlock ? '\n\n' + libraryRejectionBlock : ''
    const fewShotBlock = renderFewShotBlock(similarApprovedExamples)
    const userMessage = `Analyze this ${mediaType} frame.${temporalHint} ${filenameContext}${studioBlock}${durationBlock}${fewShotBlock}

Tier-1 (ONNX) already detected: [${tier1TagList || 'none'}]
Use this as a HINT, not a constraint. Your rich_tags should add specifics MISSING above.${combinedFilenameBlock ? '\n\n' + combinedFilenameBlock : ''}${libraryBlock}${rejectionBlock}

CRITICAL: This is from an ADULT video library. Even if the specific frame looks
like a setup shot (clothed, just sitting on a bed, etc.), use the FILENAME +
context to infer the ACTUAL content category and emit those tags with
confidence ≥ 0.7. Do NOT describe the visible frame as "looking relaxed and
comfortable" if the filename and context point to explicit content — the
filename is your strongest signal when the frame is ambiguous. Tag what the
VIDEO is, not just what this single frame happens to show.

PREFER tags from this canonical adult-tag vocabulary (these are the words
real porn sites use; matching them helps the user's filtering / search work):
${getCanonicalPromptVocabulary()}

Use the EXACT phrasing above when you can — e.g. "doggystyle" not "doggy
position", "creampie" not "internal cum", "deepthroat" not "deep throating",
"face fuck" not "face fucking". Lowercase, space-separated.

Walk through the 8 analysis steps internally, then return JSON only.`

    const content: any[] = [
      { type: 'image_url', image_url: { url: frameDataUrl } },
      { type: 'text', text: userMessage }
    ]

    const requestBody = {
      model: VENICE_VISION_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content }
      ],
      // Sharper params for tagging (2026-05-09 tuning):
      //   - max_tokens: 2048 — long rich_tags lists were getting truncated
      //     mid-JSON on multi-frame analyses, breaking parseResponse.
      //   - temperature: 0.15 — lower than 0.3 because we want repeatable
      //     deterministic tag picks, not creative variation. Tag accuracy
      //     improves when the model commits to its top picks instead of
      //     sampling from the long tail.
      //   - top_p: 0.85 — narrows the sampling pool further; with low temp,
      //     this keeps "doggystyle" from drifting to "doggy position".
      //   - frequency_penalty: 0.1 — discourages the model from repeating
      //     the same tag with slight variants in the same response.
      //   - response_format: forces JSON object output so the parser doesn't
      //     have to fish JSON out of explanatory prose.
      max_tokens: 2048,
      temperature: 0.15,
      top_p: 0.85,
      frequency_penalty: 0.1,
      response_format: { type: 'json_object' as const },
      venice_parameters: VENICE_DEFAULT_PARAMS
    }

    const response = await this.callVeniceApi(requestBody)
    return this.parseResponse(response)
  }

  /**
   * Streaming variant of callVeniceApi — uses SSE so the renderer can
   * render tokens as they arrive (typewriter effect on regen).
   *
   * Venice (and OpenAI-compatible servers) emit chunks formatted as:
   *   data: {"choices":[{"delta":{"content":"hello"}}]}
   *   data: {"choices":[{"delta":{"content":" world"}}]}
   *   data: [DONE]
   *
   * onChunk fires once per token slice. Returns the full assembled
   * string on completion.
   */
  async callVeniceApiStream(
    body: any,
    onChunk: (delta: string, accumulated: string) => void
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const streamingBody = { ...body, stream: true }
      const postData = JSON.stringify(streamingBody)

      const options = {
        hostname: 'api.venice.ai',
        path: '/api/v1/chat/completions',
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          'Accept': 'text/event-stream',
          'Content-Length': Buffer.byteLength(postData),
        },
      }

      const req = https.request(options, (res) => {
        if (res.statusCode === 429) {
          const retryAfterHeader = res.headers['retry-after']
          let retryAfterSec = 60
          if (typeof retryAfterHeader === 'string') {
            const n = parseInt(retryAfterHeader, 10)
            if (!isNaN(n) && n > 0) retryAfterSec = Math.min(600, n)
          }
          const err: any = new Error(`Venice rate limited — retry in ${retryAfterSec}s`)
          err.code = 'VENICE_RATE_LIMITED'
          err.retryAfterSec = retryAfterSec
          res.resume()
          reject(err)
          return
        }
        if (res.statusCode === 401) {
          const err: any = new Error('Invalid API key - check your Venice API key')
          err.code = 'VENICE_AUTH_FAILED'
          res.resume()
          reject(err)
          return
        }
        if (res.statusCode !== 200) {
          let body = ''
          res.on('data', (c) => body += c)
          res.on('end', () => {
            const err: any = new Error(`Venice API error: ${res.statusCode}`)
            err.code = 'VENICE_API_ERROR'
            err.httpStatus = res.statusCode
            err.body = body.slice(0, 500)
            reject(err)
          })
          return
        }

        let buffered = ''
        let accumulated = ''
        res.setEncoding('utf8')
        res.on('data', (chunk: string) => {
          buffered += chunk
          // SSE frames are separated by double newlines. Split on
          // \n\n and keep the trailing partial frame in `buffered`.
          let idx = buffered.indexOf('\n\n')
          while (idx >= 0) {
            const frame = buffered.slice(0, idx)
            buffered = buffered.slice(idx + 2)
            idx = buffered.indexOf('\n\n')
            // Each frame may have one or more `data: …` lines (rare —
            // typically one). Comment lines start with `:`.
            for (const line of frame.split('\n')) {
              if (!line.startsWith('data:')) continue
              const payload = line.slice(5).trim()
              if (!payload || payload === '[DONE]') continue
              try {
                const parsed = JSON.parse(payload)
                const delta: string = parsed.choices?.[0]?.delta?.content ?? ''
                if (delta) {
                  accumulated += delta
                  try { onChunk(delta, accumulated) } catch { /* swallow consumer errors */ }
                }
              } catch (err) {
                console.warn('[Tier2 SSE] malformed frame:', payload.slice(0, 100), err)
              }
            }
          }
        })
        res.on('end', () => {
          // Flush any final partial frame (rare).
          if (buffered.trim()) {
            for (const line of buffered.split('\n')) {
              if (!line.startsWith('data:')) continue
              const payload = line.slice(5).trim()
              if (!payload || payload === '[DONE]') continue
              try {
                const parsed = JSON.parse(payload)
                const delta: string = parsed.choices?.[0]?.delta?.content ?? ''
                if (delta) {
                  accumulated += delta
                  try { onChunk(delta, accumulated) } catch { /* ignore */ }
                }
              } catch { /* ignore */ }
            }
          }
          resolve(accumulated)
        })
        res.on('error', (err: any) => {
          const wrapped: any = new Error(`Venice stream broke: ${err.message ?? err}`)
          wrapped.code = 'VENICE_STREAM_ERROR'
          wrapped.cause = err
          reject(wrapped)
        })
      })

      req.on('error', (err: any) => {
        const wrapped: any = new Error(`Venice unreachable: ${err.message ?? err}`)
        wrapped.code = 'VENICE_UNREACHABLE'
        wrapped.retryAfterSec = 60
        wrapped.cause = err
        reject(wrapped)
      })
      req.write(postData)
      req.end()
    })
  }

  private async callVeniceApi(body: any): Promise<string> {
    return new Promise((resolve, reject) => {
      const postData = JSON.stringify(body)

      // Debug: log API key prefix (first 20 chars only for security)
      const keyPreview = this.apiKey ? `${this.apiKey.slice(0, 20)}...` : 'NO KEY'
      console.log(`[Tier2] Calling Venice API with key: ${keyPreview}`)

      const options = {
        hostname: 'api.venice.ai',
        path: '/api/v1/chat/completions',
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData)
        }
      }

      const req = https.request(options, (res) => {
        let data = ''
        res.on('data', chunk => data += chunk)
        res.on('end', () => {
          if (res.statusCode === 429) {
            // Parse Retry-After header for the precise wait time when
            // Venice provides one; default to 60s otherwise. Error
            // metadata is structured so the renderer can render a
            // countdown timer instead of a generic "rate limited" toast.
            // (User asked 2026-05-12 — no local-LLM fallback, just a
            // clear retry-in-N-seconds UI.)
            const retryAfterHeader = res.headers['retry-after']
            let retryAfterSec = 60
            if (typeof retryAfterHeader === 'string') {
              const n = parseInt(retryAfterHeader, 10)
              if (!isNaN(n) && n > 0) retryAfterSec = Math.min(600, n)
            }
            const err: any = new Error(`Venice rate limited — retry in ${retryAfterSec}s`)
            err.code = 'VENICE_RATE_LIMITED'
            err.retryAfterSec = retryAfterSec
            reject(err)
          } else if (res.statusCode === 401) {
            console.error('[Tier2] 401 Unauthorized - API response:', data)
            const err: any = new Error('Invalid API key - check your Venice API key')
            err.code = 'VENICE_AUTH_FAILED'
            reject(err)
          } else if (res.statusCode !== 200) {
            console.error(`[Tier2] API error ${res.statusCode}:`, data)
            const err: any = new Error(`Venice API error: ${res.statusCode}`)
            err.code = 'VENICE_API_ERROR'
            err.httpStatus = res.statusCode
            err.body = data.slice(0, 500)
            reject(err)
          } else {
            try {
              const parsed = JSON.parse(data)
              const content = parsed.choices?.[0]?.message?.content || ''
              resolve(content)
            } catch {
              reject(new Error('Failed to parse API response'))
            }
          }
        })
      })

      req.on('error', (err: any) => {
        // Network errors (ENOTFOUND, ECONNREFUSED, ETIMEDOUT) = Venice
        // unreachable. Default 60s retry so the user has something
        // actionable rather than a raw stack trace.
        const wrapped: any = new Error(`Venice unreachable: ${err.message ?? err}`)
        wrapped.code = 'VENICE_UNREACHABLE'
        wrapped.retryAfterSec = 60
        wrapped.cause = err
        reject(wrapped)
      })
      req.write(postData)
      req.end()
    })
  }

  private parseResponse(response: string): Tier2Result {
    // Try to extract JSON from the response
    const jsonMatch = response.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      console.warn('[Tier2] No JSON found in response')
      return this.emptyResult()
    }

    try {
      const parsed = JSON.parse(jsonMatch[0])

      // Normalize rich tags. Accept either an array of {name,confidence,source}
      // or a flat string array (best-effort fallback). Each tag name is also
      // run through normalizeToCanonical() so off-vocab outputs like
      // "deep throating" collapse to "deepthroat" — matches the canonical
      // vocabulary the prompt biased the model toward.
      const richTagsRaw = Array.isArray(parsed.rich_tags) ? parsed.rich_tags : []
      const richTagsPreDedupe: Tier2Tag[] = richTagsRaw
        .map((t: any) => {
          if (typeof t === 'string') {
            return {
              name: normalizeToCanonical(t.trim().toLowerCase()),
              confidence: 0.6,
              source: 'other' as Tier2TagSource
            }
          }
          if (t && typeof t.name === 'string') {
            return {
              name: normalizeToCanonical(String(t.name).trim().toLowerCase()),
              confidence: typeof t.confidence === 'number' ? Math.max(0, Math.min(1, t.confidence)) : 0.6,
              source: normalizeTagSource(t.source)
            }
          }
          return null
        })
        .filter((t: any): t is Tier2Tag => !!t && t.name.length > 0)
        // Drop junk: furniture, captioner color-noun phrases, typos, hedge tags.
        // isJunkTag() runs AFTER normalize so it sees the cleaned form.
        .filter((t: Tier2Tag) => !isJunkTag(t.name))

      // Two off-vocab tags can normalize to the same canonical (e.g.
      // "doggy" + "doggystyle" → "doggystyle"). Keep the higher-confidence
      // version when we collide.
      const richTagsByName = new Map<string, Tier2Tag>()
      for (const t of richTagsPreDedupe) {
        const cur = richTagsByName.get(t.name)
        if (!cur || t.confidence > cur.confidence) richTagsByName.set(t.name, t)
      }

      // Decompose compounds into atomic tags. When a compound is FULLY
      // covered by atoms (decomposeToAtoms returns atoms-only, no compound
      // in its output), we replace the compound with its atoms. When it
      // returns compound + atoms (partial coverage), we keep both.
      //
      // User rule (2026-05-12): they prefer to combine atoms manually
      // rather than have the AI emit "public sex" alongside "public" —
      // so when the compound IS fully atomizable, the compound goes
      // away entirely. Their downstream filter UX lets them search
      // "public" AND "sex" together to recover the compound when wanted.
      for (const t of Array.from(richTagsByName.values())) {
        const atoms = decomposeToAtoms(t.name)
        const compoundDropped = atoms.length > 0 && !atoms.includes(t.name)
        for (const atom of atoms) {
          if (atom === t.name) continue
          if (isJunkTag(atom)) continue
          const existing = richTagsByName.get(atom)
          if (!existing || t.confidence > existing.confidence) {
            richTagsByName.set(atom, { ...t, name: atom })
          }
        }
        if (compoundDropped) {
          richTagsByName.delete(t.name)
        }
      }
      const richTags: Tier2Tag[] = Array.from(richTagsByName.values())

      // Derive a flat additional_tags list from rich tags + parsed.additional_tags
      // for backwards compatibility with Tier 3 tag matcher.
      const flatFromRich = richTags.map((t) => t.name)
      const flatLegacy = Array.isArray(parsed.additional_tags) ? parsed.additional_tags : []
      const mergedFlat = Array.from(new Set([...flatLegacy, ...flatFromRich].map((s: any) => String(s).trim().toLowerCase()).filter(Boolean)))

      // Derive convenience taxonomy arrays from richTags by source.
      const positions = richTags.filter((t) => t.source === 'position').map((t) => t.name)
      const actions = richTags.filter((t) => t.source === 'action').map((t) => t.name)

      const genders = Array.isArray(parsed.genders) ? parsed.genders.map((g: any) => String(g).trim().toLowerCase()).filter(Boolean) : []

      const suggestedFilenameRaw = typeof parsed.suggested_filename === 'string' ? parsed.suggested_filename : null
      const suggestedFilename = suggestedFilenameRaw ? sanitizeSuggestedFilename(suggestedFilenameRaw) : null

      return {
        title: parsed.title || null,
        description: parsed.description || null,
        additionalTags: mergedFlat,
        attributes: {
          performerCount: parsed.attributes?.performer_count ?? null,
          setting: parsed.attributes?.setting ?? null,
          lighting: parsed.attributes?.lighting ?? null,
          isPov: parsed.attributes?.is_pov ?? null,
          isAmateur: parsed.attributes?.is_amateur ?? null,
          isProfessional: parsed.attributes?.is_professional ?? null
        },
        richTags,
        isAnimated: typeof parsed.is_animated === 'boolean' ? parsed.is_animated : null,
        genders,
        positions,
        actions,
        suggestedFilename
      }
    } catch (err) {
      console.warn('[Tier2] Failed to parse JSON:', err)
      return this.emptyResult()
    }
  }

  /**
   * Free-form commentary mode used by the Xyrene watch-along feature. Bypasses
   * the rich-tag analysis prompt entirely — caller supplies a custom system
   * prompt (Xyrene's bible) and a single image (the captured video frame).
   * Returns prose, NOT JSON.
   */
  async generateCommentary(
    framePathOrDataUrl: string,
    systemPrompt: string,
    options?: { temperature?: number; maxTokens?: number }
  ): Promise<string | null> {
    if (!this.isEnabled()) {
      throw new Error('Tier 2 not configured - missing API key')
    }
    if (!systemPrompt) return null

    let frameDataUrl: string
    if (framePathOrDataUrl.startsWith('data:')) {
      frameDataUrl = framePathOrDataUrl
    } else {
      if (!fs.existsSync(framePathOrDataUrl)) return null
      const buf = fs.readFileSync(framePathOrDataUrl)
      frameDataUrl = `data:image/jpeg;base64,${buf.toString('base64')}`
    }

    const requestBody = {
      model: VENICE_VISION_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: frameDataUrl } },
            { type: 'text', text: 'React to this frame in your voice. One short reaction. No quotes, no preamble.' }
          ]
        }
      ],
      max_tokens: options?.maxTokens ?? 200,
      temperature: options?.temperature ?? 0.85,
      venice_parameters: VENICE_DEFAULT_PARAMS
    }

    try {
      const raw = await this.callVeniceApi(requestBody)
      const trimmed = raw.trim()
        .replace(/^["'`]+|["'`]+$/g, '')   // strip wrapping quotes if model added them
        .replace(/^\*\*|\*\*$/g, '')        // strip bold markdown wrap
        .trim()
      return trimmed || null
    } catch (err) {
      console.warn('[Tier2] Commentary generation failed:', err)
      return null
    }
  }

  /**
   * Re-generate JUST the title or JUST the description for an existing
   * media item, given the original frames + tier1 hints + the previous
   * value (for "iterate, don't restart" anchoring). Returns the new value
   * or null. Used by the Review-tab "Regenerate" buttons.
   */
  async regenerateField(args: {
    framePaths: string[]
    mediaType: 'video' | 'image' | 'gif'
    filename: string
    tier1Tags: string[]
    currentTitle: string | null
    currentDescription: string | null
    field: 'title' | 'description'
  }): Promise<string | null> {
    if (!this.isEnabled()) throw new Error('Tier 2 not configured - missing API key')
    const valid = args.framePaths.filter((p) => fs.existsSync(p)).slice(0, 4)
    if (valid.length === 0) throw new Error('No valid frames')

    const content: any[] = []
    for (const fp of valid) {
      const buf = fs.readFileSync(fp)
      content.push({ type: 'image_url', image_url: { url: `data:image/jpeg;base64,${buf.toString('base64')}` } })
    }

    const tier1List = args.tier1Tags.slice(0, 16).join(', ')
    const prev = args.field === 'title' ? args.currentTitle : args.currentDescription
    const otherFieldLabel = args.field === 'title' ? 'description' : 'title'
    const otherField = args.field === 'title' ? args.currentDescription : args.currentTitle

    const userText = args.field === 'title'
      ? `Regenerate JUST the title for this ${args.mediaType}.
Filename: "${args.filename}"
Already-known tags: [${tier1List || 'none'}]
${otherField ? `Existing ${otherFieldLabel} (don't contradict): "${otherField}"` : ''}
${prev ? `Previous title was: "${prev}" — produce a DIFFERENT, better one.` : ''}

Reply with ONLY the new title (4-12 words, capitalized like a porn-site
content title, vulgar OK, NO hedge words like "implied" / "appears to be").`
      : `Regenerate JUST the description for this ${args.mediaType}.
Filename: "${args.filename}"
Already-known tags: [${tier1List || 'none'}]
${otherField ? `Existing ${otherFieldLabel} (don't contradict): "${otherField}"` : ''}
${prev ? `Previous description was: "${prev}" — produce a DIFFERENT, more accurate one.` : ''}

Reply with ONLY the new description, 2-3 sentences, EXPLICIT and SPECIFIC,
porn-site-style vocabulary (cock, pussy, tits, cum, fuck, blowjob, etc.).
NEVER hedge ("implied" / "appears to be" / "in a suggestive pose" are FORBIDDEN).
For VIDEOS, when temporal evidence is clear, write as a sequence
("Starts with X, builds to Y, finishes on Z").`

    content.push({ type: 'text', text: userText })

    const systemPrompt = args.field === 'title'
      ? 'You are a porn-site content tagger writing one short title. Output only the title — no quotes, no markdown, no preamble. Vulgar OK. NEVER hedge.'
      : 'You are a porn-site content tagger writing one short description (2-3 sentences). Output only the description — no quotes, no markdown, no preamble. Vulgar / explicit / graphic. NEVER hedge.'

    const requestBody = {
      model: VENICE_VISION_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content },
      ],
      max_tokens: args.field === 'title' ? 80 : 400,
      temperature: 0.5,  // higher than analysis (0.15) so regen produces a meaningfully different result
      top_p: 0.9,
      venice_parameters: VENICE_DEFAULT_PARAMS,
    }

    try {
      const raw = await this.callVeniceApi(requestBody)
      const cleaned = raw.trim()
        .replace(/^["'`]+|["'`]+$/g, '')
        .replace(/^\*\*|\*\*$/g, '')
        .replace(/^title\s*:\s*/i, '')
        .replace(/^description\s*:\s*/i, '')
        .trim()
      return cleaned || null
    } catch (err) {
      console.warn(`[Tier2] regenerateField(${args.field}) failed:`, err)
      return null
    }
  }

  /**
   * Streaming variant of regenerateField. Calls onChunk for each
   * token slice as it arrives. Returns the final cleaned string when
   * the stream completes.
   */
  async regenerateFieldStream(args: {
    framePaths: string[]
    mediaType: 'video' | 'image' | 'gif'
    filename: string
    tier1Tags: string[]
    currentTitle: string | null
    currentDescription: string | null
    field: 'title' | 'description'
    onChunk: (delta: string, accumulated: string) => void
  }): Promise<string | null> {
    if (!this.isEnabled()) throw new Error('Tier 2 not configured - missing API key')
    const valid = args.framePaths.filter((p) => fs.existsSync(p)).slice(0, 4)
    if (valid.length === 0) throw new Error('No valid frames')

    const content: any[] = []
    for (const fp of valid) {
      const buf = fs.readFileSync(fp)
      content.push({ type: 'image_url', image_url: { url: `data:image/jpeg;base64,${buf.toString('base64')}` } })
    }

    const tier1List = args.tier1Tags.slice(0, 16).join(', ')
    const prev = args.field === 'title' ? args.currentTitle : args.currentDescription
    const otherFieldLabel = args.field === 'title' ? 'description' : 'title'
    const otherField = args.field === 'title' ? args.currentDescription : args.currentTitle

    const userText = args.field === 'title'
      ? `Regenerate JUST the title for this ${args.mediaType}.
Filename: "${args.filename}"
Already-known tags: [${tier1List || 'none'}]
${otherField ? `Existing ${otherFieldLabel} (don't contradict): "${otherField}"` : ''}
${prev ? `Previous title was: "${prev}" — produce a DIFFERENT, better one.` : ''}

Reply with ONLY the new title (4-12 words, capitalized like a porn-site
content title, vulgar OK, NO hedge words like "implied" / "appears to be").`
      : `Regenerate JUST the description for this ${args.mediaType}.
Filename: "${args.filename}"
Already-known tags: [${tier1List || 'none'}]
${otherField ? `Existing ${otherFieldLabel} (don't contradict): "${otherField}"` : ''}
${prev ? `Previous description was: "${prev}" — produce a DIFFERENT, more accurate one.` : ''}

Reply with ONLY the new description, 2-3 sentences, EXPLICIT and SPECIFIC,
porn-site-style vocabulary (cock, pussy, tits, cum, fuck, blowjob, etc.).
NEVER hedge ("implied" / "appears to be" / "in a suggestive pose" are FORBIDDEN).
For VIDEOS, when temporal evidence is clear, write as a sequence
("Starts with X, builds to Y, finishes on Z").`

    content.push({ type: 'text', text: userText })

    const systemPrompt = args.field === 'title'
      ? 'You are a porn-site content tagger writing one short title. Output only the title — no quotes, no markdown, no preamble. Vulgar OK. NEVER hedge.'
      : 'You are a porn-site content tagger writing one short description (2-3 sentences). Output only the description — no quotes, no markdown, no preamble. Vulgar / explicit / graphic. NEVER hedge.'

    const requestBody = {
      model: VENICE_VISION_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content },
      ],
      max_tokens: args.field === 'title' ? 80 : 400,
      temperature: 0.5,
      top_p: 0.9,
      venice_parameters: VENICE_DEFAULT_PARAMS,
    }

    try {
      const raw = await this.callVeniceApiStream(requestBody, args.onChunk)
      const cleaned = raw.trim()
        .replace(/^["'`]+|["'`]+$/g, '')
        .replace(/^\*\*|\*\*$/g, '')
        .replace(/^title\s*:\s*/i, '')
        .replace(/^description\s*:\s*/i, '')
        .trim()
      return cleaned || null
    } catch (err) {
      console.warn(`[Tier2] regenerateFieldStream(${args.field}) failed:`, err)
      return null
    }
  }

  /**
   * Plain text→text Venice call (no images). Used by callers that need a
   * one-shot LLM completion with their own system prompt — the
   * session-learning extractor (#44), future ad-hoc summarizers, etc.
   */
  async callLLMText(systemPrompt: string, userMessage: string, options?: { temperature?: number; maxTokens?: number; topP?: number }): Promise<string> {
    if (!this.isEnabled()) throw new Error('Tier 2 not configured - missing API key')
    const requestBody = {
      model: VENICE_VISION_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      max_tokens: options?.maxTokens ?? 800,
      temperature: options?.temperature ?? 0.4,
      top_p: options?.topP ?? 0.9,
      venice_parameters: VENICE_DEFAULT_PARAMS,
    }
    return await this.callVeniceApi(requestBody)
  }

  private emptyResult(): Tier2Result {
    return {
      title: null,
      description: null,
      additionalTags: [],
      attributes: {
        performerCount: null,
        setting: null,
        lighting: null,
        isPov: null,
        isAmateur: null,
        isProfessional: null
      },
      richTags: [],
      isAnimated: null,
      genders: [],
      positions: [],
      actions: [],
      suggestedFilename: null
    }
  }

  /**
   * Generate captions (top/bottom text) for Brainwash editor using Venice AI
   */
  async generateCaptions(
    imagePath: string,
    style: 'goon' | 'degrading' | 'worship' | 'hentai' | 'generic' | 'meme' | 'pov' = 'meme'
  ): Promise<{ topText: string | null; bottomText: string | null }> {
    if (!this.isEnabled()) {
      throw new Error('Venice AI not configured - add API key in settings')
    }

    console.log(`[Tier2] Generating captions for: ${imagePath}, style: ${style}`)

    // Read and convert image to base64
    if (!fs.existsSync(imagePath)) {
      throw new Error(`Image not found: ${imagePath}`)
    }
    const buffer = fs.readFileSync(imagePath)
    const base64 = buffer.toString('base64')
    const imageData = `data:image/jpeg;base64,${base64}`

    // Style-specific prompt instructions
    const styleInstructions: Record<string, string> = {
      goon: 'Create captions for a gooner meme. Use explicit, encouraging language about stroking, edging, pumping, addiction to porn. Be raw and direct.',
      degrading: 'Create degrading/humiliation captions. Mock the viewer for being addicted, pathetic, weak for porn. Be harsh but playful.',
      worship: 'Create worship/devotion captions. Emphasize beauty, perfection, submission, obedience. Treat the subject as divine.',
      hentai: 'Create anime/hentai captions. Reference 2D, waifus, degenerate culture. Can be ironic or sincere weeb humor.',
      generic: 'Create attention-grabbing captions that fit the image content. Can be sexual, provocative, or humorous depending on what fits.',
      // 'meme' is the new default — it produces 4chan / X (Twitter) NSFW caption-meme energy
      // based ON THE IMAGE, not generic. Use this one when calling without a style.
      // POV / scenario captions for the auto-PMV pipeline. The model gets a
      // frame from a clip and writes a 1-2 sentence "you" perspective scenario
      // that matches what's happening — like the captions you'd see on a clip
      // edit set to EDM. Speaking AT the viewer ("you like..."), reframing the
      // performer's relationship to the viewer ("mommy", "girlfriend", etc.).
      pov: `Write a SECOND-PERSON POV caption that reframes the action in this frame
as a personal scenario being narrated TO the viewer.

Examples of the energy:
  - "you like when mommy rides your cock"
  - "your girlfriend got bored of your dick so she cheated"
  - "she's been begging for it all week"
  - "she knows you're watching and won't look away"
  - "your stepsister snuck into your room again"
  - "she's pretending you're her boyfriend"

Format rules:
  - Start with "you" or imply the viewer is the subject (you / your).
  - 1 sentence, max 12 words. Lowercase fine. No periods needed.
  - Use the visible action / position / performer vibe to choose the scenario.
  - Common archetypes to draw from: mommy, milf, stepmom, stepsister, girlfriend,
    cheating gf, slut, your wife, your roommate, your teacher, your boss, your
    best friend's mom — pick whatever fits the visible scene.
  - Filthy is expected. cock, pussy, cum, slut, etc. all in play.
  - NO quotes, NO markdown, NO preamble. Just the line.

Return as the bottomText (top can be null) so it sits at the bottom of the clip.`,
      meme: `Create a TWITTER / 4CHAN porn-caption meme based on what is actually visible in this image.
Channel chronically-online NSFW Twitter / /b/ caption culture: blunt, shock-value-but-funny, low-effort feel,
sometimes greentext rhythm, sometimes a single brutal line, sometimes a mock-rhetorical question.

Specifically:
- Look at the image first. Reference what's actually in it (act, body type, position, vibe). DO NOT write generic captions.
- Use shitposter cadence. Short. Punchy. Dropped articles. Lowercase fine. ALL CAPS for emphasis.
- Allowed energy: thirsty greentext ("> be me / > see this / > kek"), incel-cope humor, reaction takes
  ("the way her" / "imagine being..."), self-deprecating gooner bits, clinical-but-vulgar descriptions,
  rhetorical "this is what x percent of..." takes. Anonymous-poster voice, not advertiser.
- Vocabulary: cock, cunt, pussy, slut, whore, milf, anon, kek, based, mid, sus, ratio, NSFW, OF girl,
  pawg, etc. — drop them naturally, don't list them.
- Avoid: corporate adjectives ("stunning," "gorgeous," "exquisite"), wedding-aesthetic praise,
  worshipful tone, hashtags, emojis (text only), polished marketing copy.
- Form: top text is the SETUP / OBSERVATION (often longer); bottom text is the PUNCHLINE / TAKE
  (shorter, hits harder). Either can be null if a one-liner is funnier.

Examples of the right energy (style only — generate fresh content based on the image):
  TOP: "this is what 80% of Twitter is now"     BOTTOM: "and im not complaining"
  TOP: "she really thought she did something"   BOTTOM: "she did"
  TOP: "the way she takes it"                   BOTTOM: "should be studied"
  TOP: null                                     BOTTOM: "anon ate THAT"

DO NOT explain the joke, DO NOT add quotation marks, DO NOT include hashtags. Just the caption text.`
    }

    const systemPrompt = `You are a caption generator for Brainwash, an adult meme/caption creator tool in the Vault application.
Your job is to create impactful TOP and BOTTOM text captions for adult images, similar to classic meme format.

RULES:
- TOP text appears at the top of the image (usually 1-5 words, setup or intro)
- BOTTOM text appears at the bottom (usually 1-5 words, punchline or emphasis)
- Keep each line SHORT and PUNCHY. These are captions, not sentences.
- Use ALL CAPS for impact (standard meme style)
- Be explicit and adult-oriented. This is NSFW content.
- Respond with ONLY JSON, no other text.

STYLE INSTRUCTIONS:
${styleInstructions[style]}

OUTPUT FORMAT:
{
  "topText": "UPPER TEXT HERE",
  "bottomText": "LOWER TEXT HERE"
}

Either field can be null if a single line caption works better. Do not include quotes or punctuation in the caption text itself.`

    const content: any[] = [
      { type: 'image_url', image_url: { url: imageData } },
      { type: 'text', text: 'Generate captions for this image. Respond with JSON only.' }
    ]

    const requestBody = {
      model: VENICE_VISION_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content }
      ],
      max_tokens: 256,
      temperature: 0.8, // Higher temp for more creative captions
      venice_parameters: VENICE_DEFAULT_PARAMS
    }

    try {
      const response = await this.callVeniceApi(requestBody)

      // Parse the response
      const jsonMatch = response.match(/\{[\s\S]*\}/)
      if (!jsonMatch) {
        console.warn('[Tier2] No JSON found in caption response')
        return { topText: null, bottomText: null }
      }

      const parsed = JSON.parse(jsonMatch[0])
      return {
        topText: parsed.topText || parsed.top_text || null,
        bottomText: parsed.bottomText || parsed.bottom_text || null
      }
    } catch (err) {
      console.error('[Tier2] Caption generation failed:', err)
      throw err
    }
  }
}

// ───────────────────────────────────────────────────────────────────────────
// Multi-frame aggregation (Phase B)
// ───────────────────────────────────────────────────────────────────────────

/**
 * Combine per-frame Tier2Result objects via weighted consensus voting.
 *
 * Tags appearing in multiple frames have their confidence reinforced;
 * single-frame tags keep their raw confidence (no penalty — they may simply
 * describe a single moment of the video).
 *
 * Middle frames are weighted 1.2x because they tend to be most representative
 * of the central action, mirroring the analyzer.py convention.
 */
export function aggregateMultiFrameResults(results: Tier2Result[]): Tier2Result {
  if (results.length === 0) {
    return {
      title: null, description: null, additionalTags: [],
      attributes: { performerCount: null, setting: null, lighting: null, isPov: null, isAmateur: null, isProfessional: null },
      richTags: [], isAnimated: null, genders: [], positions: [], actions: [], suggestedFilename: null
    }
  }
  if (results.length === 1) return results[0]

  const n = results.length
  const middleIdx = Math.floor((n - 1) / 2)
  const weights = results.map((_, i) => i === middleIdx ? 1.2 : 1.0)
  const totalWeight = weights.reduce((s, w) => s + w, 0)

  // Tag aggregation: name → { totalWeightedConf, frameCount, sources[] }
  type Acc = { weightedSum: number; frames: number; sources: Tier2TagSource[] }
  const tagMap = new Map<string, Acc>()
  for (let i = 0; i < n; i++) {
    for (const t of results[i].richTags) {
      const key = t.name
      const existing = tagMap.get(key)
      if (existing) {
        existing.weightedSum += t.confidence * weights[i]
        existing.frames += 1
        existing.sources.push(t.source)
      } else {
        tagMap.set(key, { weightedSum: t.confidence * weights[i], frames: 1, sources: [t.source] })
      }
    }
  }

  const richTags: Tier2Tag[] = Array.from(tagMap.entries())
    .map(([name, acc]) => {
      const weightedAvg = acc.weightedSum / totalWeight
      // Agreement boost: tags in 2+ frames get +0.05, in all frames get +0.10
      const bonus = acc.frames === n ? 0.10 : acc.frames >= 2 ? 0.05 : 0
      const confidence = Math.min(weightedAvg + bonus, 1.0)
      // Pick the most-common source (tiebreaker: first seen).
      const sourceCount = new Map<Tier2TagSource, number>()
      for (const s of acc.sources) sourceCount.set(s, (sourceCount.get(s) ?? 0) + 1)
      const source = [...sourceCount.entries()].sort((a, b) => b[1] - a[1])[0][0]
      return { name, confidence, source, frameCount: acc.frames, totalFrames: n }
    })
    .sort((a, b) => b.confidence - a.confidence)

  // Aggregate consensus stats — surfaced in review UI for "X/N agreed" badges.
  const unanimousTagCount = richTags.filter((t) => (t.frameCount ?? 0) === n).length
  const singletonTagCount = richTags.filter((t) => (t.frameCount ?? 0) === 1).length
  const averageAgreement = richTags.length === 0
    ? 0
    : richTags.reduce((sum, t) => sum + (t.frameCount ?? 0), 0) / (richTags.length * n)
  const consensus = {
    totalFrames: n,
    unanimousTagCount,
    singletonTagCount,
    averageAgreement: Math.round(averageAgreement * 100) / 100,
  }

  // Animated: majority vote (fallback null if mixed null/false/true).
  const animatedVotes = results.map((r) => r.isAnimated).filter((v) => v !== null) as boolean[]
  let isAnimated: boolean | null = null
  if (animatedVotes.length > 0) {
    const trueCount = animatedVotes.filter(Boolean).length
    isAnimated = trueCount > animatedVotes.length / 2
  }

  // Title: pick the longest-but-not-too-long result.
  const candidateTitles = results.map((r) => r.title).filter((t): t is string => !!t)
  const title = candidateTitles.length > 0
    ? candidateTitles.sort((a, b) => Math.abs(a.length - 40) - Math.abs(b.length - 40))[0]
    : null

  // Description: take from the frame with the most rich_tags (most informative).
  const descSource = [...results].sort((a, b) => b.richTags.length - a.richTags.length)[0]
  const description = descSource.description ?? results.find((r) => r.description)?.description ?? null

  // Attributes: take from the frame with most non-null attribute values.
  const scoreAttrs = (r: Tier2Result) =>
    Object.values(r.attributes).filter((v) => v !== null).length
  const attrSource = [...results].sort((a, b) => scoreAttrs(b) - scoreAttrs(a))[0]
  const attributes = attrSource.attributes

  // Genders: union across frames.
  const genderSet = new Set<string>()
  for (const r of results) for (const g of r.genders) genderSet.add(g)
  const genders = Array.from(genderSet)

  // Positions / actions derived from richTags by source.
  const positions = richTags.filter((t) => t.source === 'position').map((t) => t.name)
  const actions = richTags.filter((t) => t.source === 'action').map((t) => t.name)

  // Suggested filename: first non-null suggestion.
  const suggestedFilename = results.find((r) => r.suggestedFilename)?.suggestedFilename ?? null

  // Flatten richTag names + per-frame additional_tags for backwards-compat.
  const flatSet = new Set<string>()
  for (const t of richTags) flatSet.add(t.name)
  for (const r of results) for (const t of r.additionalTags) flatSet.add(t)
  const additionalTags = Array.from(flatSet)

  return {
    title,
    description,
    additionalTags,
    attributes,
    richTags,
    isAnimated,
    genders,
    positions,
    actions,
    suggestedFilename,
    consensus,
  }
}

// ───────────────────────────────────────────────────────────────────────────
// Helpers for rich-tag analysis (Phase A port from content_analyzer)
// ───────────────────────────────────────────────────────────────────────────

const VALID_TAG_SOURCES: ReadonlyArray<Tier2TagSource> = [
  'position', 'action', 'performer', 'setting', 'body', 'context', 'intensity', 'other'
]

function normalizeTagSource(value: unknown): Tier2TagSource {
  if (typeof value === 'string') {
    const lower = value.trim().toLowerCase()
    if ((VALID_TAG_SOURCES as readonly string[]).includes(lower)) return lower as Tier2TagSource
  }
  return 'other'
}

function sanitizeSuggestedFilename(raw: string): string | null {
  // Strip extension if model included one — we re-attach the original.
  let cleaned = raw.trim().replace(/\.[a-zA-Z0-9]{2,4}$/, '')
  // Replace path separators and invalid Windows filename chars.
  cleaned = cleaned.replace(/[\\/:*?"<>|]+/g, ' ')
  // Collapse whitespace.
  cleaned = cleaned.replace(/\s+/g, ' ').trim()
  // Cap length to 100 chars to stay below typical FS limits after extension.
  if (cleaned.length > 100) cleaned = cleaned.slice(0, 100).trim()
  if (cleaned.length === 0) return null
  return cleaned
}

/**
 * System prompt for Venice vision analysis.
 *
 * Ported from `content_analyzer/analyzer.py:1590-1744` (8-step chain-of-thought),
 * but adapted for Vault's many-to-many tag model: the model emits a RICH SET OF
 * TAGS (not a single category). Each tag carries a confidence and source class.
 *
 * Vault stores all tags it returns; the renderer's review queue lets the user
 * accept/reject per-tag.
 */
/**
 * Render up to N rejected similar items as NEGATIVE examples — "do not
 * produce this". Compounds with the positive few-shot block: positive
 * shows what to imitate, negative shows what to avoid for the same
 * style/category of content.
 */
export function renderNegativeFewShotBlock(
  rejectedExamples: Array<{
    filename: string
    title: string | null
    description: string | null
    rejectedTags: string[]
  }> | undefined
): string {
  if (!rejectedExamples || rejectedExamples.length === 0) return ''
  const top = rejectedExamples.slice(0, 2)
  const blocks = top.map((ex, i) => {
    const tagList = ex.rejectedTags.slice(0, 12).join(', ')
    const titleStr = ex.title ? JSON.stringify(ex.title) : 'null'
    const descStr = ex.description ? JSON.stringify(ex.description.slice(0, 200)) : 'null'
    return `REJECTED EXAMPLE ${i + 1}:
  source filename: ${JSON.stringify(ex.filename)}
  USER REJECTED THIS OUTPUT:
  title: ${titleStr}
  description: ${descStr}
  tags the user dropped: [${tagList}]`
  }).join('\n\n')
  return `

═══════════════════════════════════════════════════════════════════════
USER-REJECTED OUTPUTS ON SIMILAR CONTENT — DO NOT REPEAT
═══════════════════════════════════════════════════════════════════════
${blocks}
═══════════════════════════════════════════════════════════════════════
`
}

/**
 * Render up to N similar already-approved items as concrete few-shot
 * examples in the prompt. Format mirrors the JSON shape Venice is asked
 * to produce so the model can pattern-match its output structure to
 * what's already worked for this user's library.
 *
 * Why this matters: the model is calibrated on the internet, not on
 * this user. Showing it 2-3 of THEIR approved outputs aligns its
 * vocabulary + style + tag granularity to their actual taste in a
 * single API call. Compounds with every approval.
 */
function renderFewShotBlock(
  examples: Array<{
    filename: string
    title: string | null
    description: string | null
    similarity: number
    sharedTags: string[]
    approvedTags: Array<{ name: string; confidence: number; source: string }>
  }> | undefined
): string {
  if (!examples || examples.length === 0) return ''
  // Cap at 3 — anything more inflates prompt size for diminishing
  // returns. The top 3 by similarity carry most of the signal.
  const top = examples.slice(0, 3)
  const blocks = top.map((ex, i) => {
    const tagsByName = new Map<string, { confidence: number; source: string }>()
    for (const t of ex.approvedTags) tagsByName.set(t.name, { confidence: t.confidence, source: t.source })
    // Limit tag list to 15 for prompt-size; pick highest-confidence.
    const sorted = Array.from(tagsByName.entries())
      .sort((a, b) => b[1].confidence - a[1].confidence)
      .slice(0, 15)
    const tagLines = sorted.map(([name, v]) =>
      `    { "name": "${name}", "confidence": ${v.confidence.toFixed(2)}, "source": "${v.source}" }`
    ).join(',\n')
    const titleStr = ex.title ? JSON.stringify(ex.title) : 'null'
    const descStr = ex.description ? JSON.stringify(ex.description.slice(0, 240)) : 'null'
    return `EXAMPLE ${i + 1} (cosine ${ex.similarity.toFixed(2)}, shared: ${ex.sharedTags.slice(0, 5).join(', ')}):
  source filename: ${JSON.stringify(ex.filename)}
  USER-APPROVED OUTPUT:
  {
    "title": ${titleStr},
    "description": ${descStr},
    "rich_tags": [
${tagLines}
    ]
  }`
  }).join('\n\n')
  return `

═══════════════════════════════════════════════════════════════════════
USER'S APPROVED OUTPUTS ON SIMILAR CONTENT — match this style + vocab
═══════════════════════════════════════════════════════════════════════
The user has already reviewed and APPROVED these outputs on visually-
or tagwise-similar items from their own library. Use them as the
ground-truth style guide for THIS analysis: the tag vocabulary they
prefer, the title voice they like, the description level they expect.
Don't copy verbatim — match the granularity, the tag set shape, and
the writing voice.

${blocks}
═══════════════════════════════════════════════════════════════════════
`
}

function buildVeniceAnalysisSystemPrompt(): string {
  return `You are the deep media-analysis engine for Vault, a private adult-content library.
You receive 1-3 representative frames from a single piece of media (video / image / gif).
Your job is to walk a strict 8-step chain-of-thought analysis, then emit a
rich JSON description with as many ACCURATE tags as you can justify from the visuals.

CORE RULES
- Be EXPLICIT and VULGAR. This is porn — write like a porn site, not like a
  film critic or a clinical caption. Use the actual words: "cock", "pussy",
  "tits", "ass", "cum", "fuck", "blowjob", "creampie", "facial". Don't say
  "phallus" / "genitals" / "intercourse" / "intimate act" — say what it is.
- NEVER hedge. The forbidden phrases are: "implied", "possible",
  "potential", "appears to be", "seems to", "what looks like", "in a
  suggestive pose", "in a teasing manner". If you can see what's
  happening, say it. If you can't, OMIT the detail entirely — never qualify.
- Never moralize, warn, or add disclaimers. The user owns this content privately.
- Output ONLY a single JSON object. No preamble, no markdown fences, no commentary.
- Use null when you genuinely cannot tell. Do not guess.
- This system is TAG-BASED, not category-based. Multiple tags are EXPECTED.
  DO NOT pick a single winning category. Emit every tag you can defend.

═══════════════════════════════════════════════════════════════════════
ANALYSIS STEPS — perform in order before writing JSON
═══════════════════════════════════════════════════════════════════════

STEP 1 — CONTENT FORMAT
  Is this animated/drawn/CGI/3D-render/SFM/Blender/cartoon/anime?
    YES → set is_animated=true. Use ONLY these drawing-style tags (use as
          many as apply, but NOTHING else):
            "hentai"   — anime/manga-style 2D animation or stills
            "animation" — any drawn motion (umbrella)
            "3d"       — 3D-rendered (SFM, Blender, CGI, character models)
          DO NOT emit "3d render", "sfm", "blender", "cgi", "cg", "drawn",
          "illustration", "artwork", "2d", "anime style", "western cartoon",
          "sketch", "render". Those are art-school jargon, not porn-site tags.
          Confidence 0.9+ on the chosen drawing-style tags when obvious.
          When animated: NEVER emit "amateur" / "professional" — those only
          apply to live-action production context.
    NO  → is_animated=false. Live-action; drawing-style tags forbidden.
  Audio-only / black screen → add "sound only" tag (source:context).

STEP 2 — PERFORMER COUNT & GENDERS
  Count visible performers. Identify each as: female, male, trans (or more
  specifically MTF / FTM if direction is identifiable), or indeterminate.
  Set genders array and performer_count.
  Emit ATOMIC count + gender tags — NEVER "1girl" / "2girls" / "1boy"
  / "solo female" compounds. The user combines atoms in the picker:
    1 visible female  → emit "solo" + "female"   (NOT "1girl", NOT "solo female")
    1 visible male    → emit "solo" + "male"     (NOT "1boy", NOT "solo male")
    2 visible females → emit "duo" + "female" + "lesbian"
    2 visible males   → emit "duo" + "male" + "gay"
    1 male + 1 female → emit "duo" + "female" + "male" + "couple"
    3+ performers     → emit "threesome" / "gangbang" + relevant gender mix
  Trans performers: when direction is visually clear (breasts + penis, top
  surgery scars + vagina, etc.), emit "mtf" or "ftm". When unclear, emit
  generic "trans".

STEP 3 — POSITION ANALYSIS  (source: "position")
  Identify EVERY position visible. Examples:
    missionary, doggystyle, prone bone, cowgirl, reverse cowgirl,
    standing, against wall, table bend, pile driver, amazon, lap sitting,
    spooning, scissors, 69, face sitting, kneeling oral, pinned, suspended.
  Camera angle is its own tag (source: "context"):
    POV, first person, third person, side angle, wide shot, close-up, face focused.

STEP 4 — ANAL VS VAGINAL  (CRITICAL — source: "action")
  Examine angle of penetration relative to anatomy.
  Anal indicators:  gape, ass cheeks spread, lube on anus, puckered/relaxed sphincter,
                    high-hip prone bone, characteristic angle, anal toy or beads visible.
  Vaginal indicators: labia visibly spread, clitoris exposed, deeper pubic-bone angle,
                      vaginal lubrication patterns.
  When both are present (e.g., DP) emit BOTH tags.
  Output the porn-site action tags:
    Anal → "anal" (NOT "anal sex" — porn sites just say "anal")
    Vaginal → emit "sex" or "hardcore" or just the position
       (NEVER emit "vaginal sex" or "vaginal" — those are clinical;
        porn sites label this by position/style, not by orifice)
    Both → "anal" + "double penetration" / "dp"

STEP 5 — ORAL ANALYSIS  (source: "action")
  Mouth on penis  → "blowjob" (deepthroat, sloppy, throat fuck, gagging)
  Mouth on vulva  → "cunnilingus" (face sitting, eating out)
  Mouth on anus   → "anilingus" / "rimming"
  Both giving simultaneously → "69 position".
  Add ALL applicable mouth-action tags.

STEP 6 — SOLO / MASTURBATION  (source: "action")
  HARD GATE: count performers across ALL frames before tagging anything
  as solo/masturbation. If you see TWO sets of hands, a penis owned by
  someone other than the focal performer, a body part entering from
  off-frame, or another voice in dialog audio cues, this is NOT solo.
  The single biggest tagger failure is misclassifying actual penetrative
  sex as masturbation because the male was momentarily off-camera. When
  in doubt, look for: a second pair of hands, lubrication-streak
  patterns indicating thrusting, hip-on-hip slap audio, partner body
  parts in any frame. ANY of those = not solo = NOT masturbation.

  If — and only if — 1 performer is verified across all frames:
    Female: emit "masturbation" + "female" + "solo" always. Then add the
      specific ACT:
        - "fingering"     ONLY when fingers visibly penetrate the vagina
        - "clit rubbing"  external clit only, no penetration
        - "vibrator", "dildo", "magic wand"  when toys visible
        - "squirting"     when ejaculate visible
      Multiple acts can stack: a video can be "masturbation + fingering +
      clit rubbing + squirting" if all three happen across frames.
    Male: emit "masturbation" + "male" + "solo" always. Then:
        - "stroking" (cock in hand), "edging", "fleshlight", "prostate play".
  Toys are their own tag (source:other or context): "vibrator", "dildo",
  "anal beads", etc.

  If 2+ performers are visible and ANY penetration happens, emit "sex"
  (not "masturbation") plus the position tags (missionary / doggystyle /
  cowgirl / etc). Toys-with-partner = "toy play" plus the partner-act
  tags (e.g. "couple + dildo + cunnilingus") — NEVER "masturbation".

STEP 6.5 — PLATFORM CUES  (source: "context")
  If you can see Snapchat UI in the frame (yellow/pink ghost icon, "Tap
  to load preview" overlay, vertical aspect, snap-style emojis or stickers
  burned into the image), emit "snapchat".
  Likewise for "tiktok" (TikTok watermark / username overlay), "onlyfans"
  (OF watermark / handle overlay), "webcam" (chatroom UI, talk-to-camera
  framing). These are real porn-site categories the user filters by.

STEP 7 — GROUP CONFIGURATIONS  (source: "context")
  3 performers: "threesome", + config: "mfm", "ffm", "fff", "mmm".
  4+: "gangbang".
  Specific configs: "double penetration" (DP), "double vaginal", "double anal", "airtight", "spitroast", "eiffel tower".

STEP 8 — DESCRIPTORS  (multiple sources)
  Performer descriptors (source: "performer"):
    Race / ethnicity (REQUIRED when visually identifiable — porn sites use
      these as primary categories): "asian", "ebony", "latina", "white",
      "arab", "mixed race". Emit confidently (≥0.8) when the performer's
      ethnicity is clearly readable from the frame. SKIP for animated
      content — race tags don't apply to drawn characters.
    Age cue (teen, barely legal, milf, mature, cougar, gilf, stepmom).
    Body type — pick the BEST single match; do not stack multiple body types:
      "petite"     small frame, slim
      "slim"       thin, modest curves
      "athletic"   toned, fit, muscular
      "curvy"      hourglass, voluptuous (NOT plus-size)
      "thicc"      thick thighs, big ass, fuller frame (still curvy)
      "pawg"       big-ass white woman specifically
      "bbw"        plus-size / chubby
      "twink" / "jock" / "bear" / "daddy"   for male performers
      "hairy"      visible body / pubic hair
      DO NOT emit "plus size" — use "bbw" or "pawg".
    Role hint (stepmom, stepsister, wife, girlfriend, cheating wife, etc.).
  Body features (source: "body"):
    Breast SIZE matters more than naturalness — user 2026-05-09 explicitly
    dropped "natural breasts" because the size descriptor (big tits / small
    tits / huge tits / flat chest) carries the actual signal. ONLY emit
    "fake breasts" when implants are visibly obvious. NEVER emit
    "natural breasts" — pick the size tag instead.
    Tags: big tits, small tits, huge tits, flat chest, big ass,
    fake breasts (only if visibly enhanced), tattooed, pierced, shaved,
    hairy, pregnant.
  Setting (source: "setting"):
    Only when it's a porn-site-tag-worthy setting: outdoor, public, beach, pool,
    shower, car, hotel room. Generic interior rooms (bedroom / kitchen /
    living room) DO NOT need to be tagged — they're scene description, not
    a porn-site tag.
  Special context (source: "context"):
    BDSM, bondage, fetish, foot fetish, public sex, cosplay, massage, taboo,
    creampie, squirt, pmv, hmv, amateur, professional, voyeur, casting couch.
  Intensity (source: "intensity") — emit AT MOST ONE:
    softcore, moderate, hardcore, intense, extreme.

═══════════════════════════════════════════════════════════════════════
TAG QUALITY RULES
═══════════════════════════════════════════════════════════════════════
- Use vocabulary that appears as a CATEGORY OR TAG ON A REAL PORN SITE.
  Pornhub / xHamster / Empornium / xVideos. If a site wouldn't list it as a
  filterable tag, you shouldn't either.
- Lowercase, space-separated.
- Specific over vague. "reverse cowgirl" not "sex". "deepthroat" not "deep throating".
- ATOMIC PREFERENCE: when you'd say "facial close up" or "sloppy blowjob",
  emit BOTH the compound AND the atoms as separate tags
  (e.g. "facial close up" + "facial" + "close up"). The user combines atoms
  in the picker. If a compound is non-decomposable (e.g. "step mom",
  "double penetration", "face fuck") just emit the whole.
- Confidence 0.0-1.0. ≥0.85 = unambiguous visual.
  0.6-0.8 = visible but partially obscured / cross-frame inferred.
  ≤0.5 = strong hint, low certainty — for filename or single-frame inferences.
- Quality over quantity. Emit ONLY tags you can defend from the visual
  evidence. 5 correct tags beats 20 with 8 hallucinations. If a tag
  feels like a guess, OMIT it. Aim for 8-18 high-confidence rich_tags;
  more is fine if the content actually supports them.

═══════════════════════════════════════════════════════════════════════
MUTUAL-EXCLUSION HARD RULES — these contradictions are FORBIDDEN
═══════════════════════════════════════════════════════════════════════
(These are codified in code too — emitting them costs API tokens for
nothing, and they make the user re-reject the same mistake on every
single video. Pre-filter your own output before returning.)

1. SOLO ⇄ MULTI-PERFORMER. If you emit "solo" or "masturbation",
   you may NOT also emit "group", "threesome", "couple", "duo",
   "gangbang", "mfm", "mff", "mmf", "ffm", or any other multi-performer
   tag. ONE performer is one performer.

2. SOLO/LESBIAN ⇄ MALE-REQUIRED ACTS. If only female performers are
   visible (no penis, no male body parts) you may NOT emit "blowjob",
   "deepthroat", "fellatio", "cumshot", "creampie", "facial", "handjob",
   "anal sex", or any other act that requires a male performer.
   Female-only acts (cunnilingus, scissoring, dildo, vibrator,
   fingering, squirting, masturbation) ARE allowed.

3. NUDE ⇄ CLOTHED. If you emit "nude" / "naked" the performer is
   visibly nude in the frame — you may NOT also emit "lingerie",
   "clothed", "underwear", "dressed". Pick one based on what's
   actually on screen.

4. TRANS without indicators. NEVER emit "trans" / "transgender" /
   "mtf" / "ftm" / "shemale" / "futa" unless you can POINT to a
   visible trans-coded body feature (penis on a femme body, top
   surgery scars on a torso, visible bulge on a femme presentation).
   A normal cis-female scene gets ZERO trans tags. A normal cis-male
   scene gets ZERO trans tags. The DEFAULT for any visible performer
   is cis-gendered — the user wants trans tags ONLY when biology is
   genuinely ambiguous in the frame. The model has been overusing
   this for months. ABSOLUTELY STOP. If you cannot identify a
   specific frame and a specific body feature that requires the
   trans tag, omit it. "Just in case" trans tagging is forbidden.

   Examples:
     - A nude woman on her back with no penis visible → NO trans tag.
     - A man with penis, normal male body → NO trans tag.
     - A femme body with a visible penis tucking or bulge → "mtf".
     - A masc body with visible top-surgery scars + vulva → "ftm".

5. MASTURBATION ⇄ SEX. "masturbation" means SOLO self-stimulation.
   Never combine with "sex" / "blowjob" / "anal" / "cunnilingus" /
   "doggystyle" / "missionary" / "cowgirl" / any partner-act. If
   you're about to emit "masturbation" AND any partner-act, you've
   miscounted performers — go back to STEP 1, recount, and emit
   "sex" + the position instead. SOLO is solo. PARTNER is partner.

5. ATOMIC vs COMPOUND. "public" + "public sex" — never both. If a
   sex act is actually happening outdoors, emit "public" + the
   specific act (e.g. "public" + "blowjob"). If no sex is happening
   (girl peeing outdoors, walking nude, posing), emit ONLY "public",
   NOT "public sex".

6. BODY TYPES are MUTUALLY EXCLUSIVE. Pick ONE: petite OR slim OR
   athletic OR curvy OR thicc OR pawg OR bbw. Never emit two
   contradictory body types on the same video.

═══════════════════════════════════════════════════════════════════════

NEVER EMIT THESE TAGS — they're noise that pollutes the user's library:
  - HAIR COLORS in any form: "blonde", "brunette", "redhead", "black hair",
    "blonde hair", "red hair", "dyed hair", etc. Hair color belongs in the
    TITLE only, never in tags.
  - Furniture / scene description: "checkered pillow", "white sheets",
    "potted plant", "wallpaper", "lamp", "couch arm". The user wants tags
    that filter videos, not captions of the room.
  - Hedge prefixes: "implied X", "possible X", "appears to be X". Either
    the visual evidence is there with confidence ≥0.5 or you skip the tag.
  - WD-Tagger / booru meta: "1girl", "1boy", "solo" (as count),
    "looking at viewer", "monochrome", "no humans", "text focus",
    "speech bubble", "general", "sensitive", "questionable", "explicit"
    (as a single bare tag — content rating belongs elsewhere).
  - Camera / production meta: "high resolution", "watermark", "realistic",
    "photo", "video", "screenshot", "selfie", "ui", "logo".
  - Film-grammar terms: "medium shot", "wide shot", "long shot",
    "establishing shot", "overhead shot", "low angle shot". (close-up /
    close up / closeup IS a real porn-site tag — keep that one.)
  - "plus size" — use "bbw" or "pawg" instead.
  - On ANIMATED content only: NEVER emit "amateur" / "professional" —
    those describe live-action production context, not drawn art.
  - Captioner verb-forms with no subject: "enjoying", "looking",
    "smiling", "kissing", "embracing", "hugging", "cuddling" alone.
    These describe a frame, not a video category.
  - Single-word color/light captions: "dark", "bright", "warm", "dim",
    "shadowed". Lighting conditions are not tags.
  - Clinical / hedge vocabulary: "clitoral stimulation" (use "clit play" or
    "fingering"), "genital contact", "sexual intercourse", "penile penetration".
  - "vaginal sex" / "vaginal" / "fellatio" / "oral sex" — these are clinical
    not colloquial. Porn sites use "anal", "blowjob", "doggystyle", "cowgirl",
    etc. Use the position / act / orifice that matches porn-site vocab.
    "anal sex" is also forbidden — just "anal".
  - Drawing-style / production jargon: "3d render", "sfm", "blender",
    "cgi", "cg", "render", "drawn", "drawing", "illustration", "artwork",
    "sketch", "2d", "anime style", "manga style", "western cartoon", "2d anime".
    For animated content emit ONLY "hentai" / "animation" / "3d".

═══════════════════════════════════════════════════════════════════════
SELF-GROUNDING — applies to every rich_tag before you write it
═══════════════════════════════════════════════════════════════════════
(MASH-VLM-style hallucination mitigation. The model has been emitting
tags that aren't supported by the frames; the user is rejecting them
manually. Before you write each tag, do this internal check:)

For each tag you're about to emit, mentally answer:
  Q1. WHICH frame (1, 2, … N) shows the evidence?
  Q2. WHICH region (upper / lower / left / right / full frame / not
      visible — relying on filename or context only)?
  Q3. Is the evidence DIRECT (a body part / object / position is
      visibly present) or INFERRED (filename / Tier-1 hints / prior
      genre patterns)?

Then calibrate the confidence by your answers:
  - Direct visual evidence in ≥1 frame    →  confidence 0.75–0.95
  - Cross-frame inference (Q2 says "implied by temporal sequence")
                                          →  confidence 0.55–0.75
  - Filename-only or Tier-1-only support  →  confidence ≤ 0.45
  - Cannot answer Q1 (no frame supports it) → DO NOT EMIT.

The user has seen a thousand videos tagged "fellatio" from one frame
of a clothed setup shot. That's a Q1 failure: no frame supports it.
Don't emit it. Lower confidence is BETTER than a confident guess — the
training loop weights high-confidence rejections more heavily, so a
0.95 hallucination poisons future predictions worse than a 0.45 one.

When in doubt, the tag list should be SHORTER. 8 well-grounded tags
beats 18 guesses. The user complained on 2026-05-12 about "same tags
on every video" — that's the model defaulting to genre-typical tags
when frames are ambiguous. Resist that. Tag what you SEE, not what
the genre USUALLY contains.

═══════════════════════════════════════════════════════════════════════
DESCRIPTION RULES
═══════════════════════════════════════════════════════════════════════
description: 2-3 sentences, EXPLICIT, GRAPHIC, VULGAR. Write like a porn
  site's video summary, not a screenwriter's logline. The user is an adult
  who chose this content; sanitized prose actively makes the library worse.
  - Use porn vocabulary: cock, dick, pussy, tits, ass, cum, fuck, suck,
    creampie, facial, deepthroat, gape, ride, pound, etc. Whatever fits.
  - Name the act, the position, the body parts emphasized, and any
    notable feature (POV, ethnicity if obvious, body type, kink).
  - For VIDEOS specifically, when frames disagree across the timeline,
    write as a sequence: "Starts with X, builds to Y, finishes on Z" — when
    temporal evidence is clear.
  - NEVER hedge. The phrases "implied", "appears to be", "seems to",
    "in a suggestive pose", "in a teasing manner" are FORBIDDEN. If you
    can see it, say it directly. If you can't, omit.
  - No moralizing, no warnings, no content advisories.
  Good: "Petite blonde gets POV missionary on a hotel bed, hops on top for
        cowgirl mid-scene, takes a thick creampie at the end."
  Good: "Latina MILF rides a fat dildo on the kitchen counter, squirting
        all over the floor."
  Good: "Hentai schoolgirl bounces on a thick cock in a classroom, gets
        her tits squeezed and finishes with a facial."
  Bad:  "Two people are intimate in a romantic setting." (vague, sanitized)
  Bad:  "Implied fellatio with a teasing expression." (HEDGING — forbidden)
  Bad:  "Engages in sexual intercourse." (clinical)

═══════════════════════════════════════════════════════════════════════
TITLE & SUGGESTED FILENAME
═══════════════════════════════════════════════════════════════════════
title: 4-12 words, written like a porn-site title — direct, vulgar OK,
  search-friendly. Capitalized like a content title. Hair color and act
  are great anchors here.
  Good: "Petite Blonde Takes Creampie POV On Hotel Bed"
  Good: "Big Tit Latina MILF Rides Cock On Kitchen Counter"
  Good: "Hentai Schoolgirl Gets Pounded And Cum-Drenched"
  Bad:  "Video 1", "Hot Scene", "An Intimate Encounter" (vague / sanitized)
  Bad:  "Implied Fellatio Scene" (HEDGING — forbidden)

suggested_filename: A clean filesystem-safe name (no extension, no slashes).
  Use this when the source filename is gibberish (hash, UUID, mostly digits).
  Format: "Subject Action Detail" — title case, spaces, no punctuation except dashes.
  Example: "Blonde Amateur POV Hotel Ride"
  If the original filename is already descriptive, return null for this field.

═══════════════════════════════════════════════════════════════════════
OUTPUT FORMAT — return EXACTLY this JSON shape, no other text
═══════════════════════════════════════════════════════════════════════
{
  "is_animated": false,
  "performer_count": 2,
  "genders": ["female", "male"],
  "title": "Brunette Couple Missionary Bed Scene",
  "suggested_filename": "Brunette Couple Missionary Bed",
  "description": "Brunette woman takes missionary from a male partner on a bed, transitions to deeper thrusting halfway through, ends on a facial close-up.",
  "rich_tags": [
    { "name": "missionary",      "confidence": 0.95, "source": "position" },
    { "name": "hardcore",        "confidence": 0.92, "source": "intensity" },
    { "name": "facial",          "confidence": 0.85, "source": "action" },
    { "name": "close up",        "confidence": 0.8,  "source": "context" },
    { "name": "natural breasts", "confidence": 0.7,  "source": "body" },
    { "name": "professional",    "confidence": 0.6,  "source": "context" },
    { "name": "hardcore",        "confidence": 0.85, "source": "intensity" }
  ],
  "additional_tags": ["couple"],
  "attributes": {
    "performer_count": 2,
    "setting": null,
    "lighting": "warm",
    "is_pov": false,
    "is_amateur": false,
    "is_professional": true
  }
}`
}
