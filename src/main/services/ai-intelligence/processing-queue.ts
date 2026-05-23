// ===============================
// Processing Queue - Orchestrates AI analysis pipeline
// ===============================

import path from 'node:path'
import type { BrowserWindow } from 'electron'
import type { DB } from '../../db'
import { errorLogger } from '../error-logger'
import { getSettings } from '../../settings'
import { getCalibrationService } from './calibration-service'
import { getSimilarityEngine } from './similarity-engine'
import { invalidateRejectionPatternsCache } from './rejection-patterns'
import { applyExclusionRules } from './tag-exclusion-rules'
import { extractTagsFromDescription } from './description-tag-extractor'
import { extractTextFromFrames, renderOcrBlockForPrompt } from './frame-ocr'
import { analyzeAudioTrack, renderAudioBlockForPrompt, audioFingerprintToTagPriors, type AudioFingerprint } from './frame-audio'
import { analyzeMediaMetadata, renderMetadataBlockForPrompt } from './media-metadata-signals'
import { renderStyleBlockForPrompt, getVocabPreference } from './style-learner'
import { priorsForMediaPath } from './learning-helpers'
import { getJoyCaptionClient } from './joycaption-client'
import { detectDomains } from './domain-detector'
import { generateContactSheet } from './contact-sheet'
import { isMilesDeepAvailable, classifyFrames as milesDeepClassify } from './miles-deep-classifier'
import { isPoseDetectorAvailable, detectPoseAcrossFrames, detectPose } from './pose-detector'
import { isPersonReidAvailable, extractBodyEmbedding, embeddingToBase64 as bodyEmbToB64 } from './person-reid-recognizer'
import { nanoid as bodyNanoid } from 'nanoid'
import { isFaceDetectorAvailable, detectFacesAcrossFrames, detectFaces, type FaceDetection } from './face-detector'
import { isNudeNetDetectorAvailable, detectNudityAcrossFrames } from './nudenet-detector'
import { isSFaceAvailable, extractEmbedding } from './sface-recognizer'
import { assignEmbeddingToCluster, findMatchingPerformers } from './face-cluster-service'
import { isGenderClassifierAvailable, classifyFacesAcrossFrames } from './gender-classifier'
import { estimateBpm, bpmToTagPriors } from './frame-audio'
import { findWhisperInstall, transcribeAudio, transcriptToTagPriors } from './whisper-transcriber'
import { predictTagsForFilename, retrain as retrainFilenameClassifier } from './filename-classifier'

// We need access to raw database for direct SQL queries
type RawDB = DB['raw']
import type { FrameExtractor } from './frame-extractor'
import type { Tier1OnnxTagger, Tier1Result } from './tier1-onnx-tagger'
import type { Tier2VisionLLM, Tier2Result } from './tier2-vision-llm'
import type { Tier3TagMatcher, Tier3Result } from './tier3-tag-matcher'

export interface QueueItem {
  id: number
  mediaId: string
  status: 'pending' | 'processing' | 'completed' | 'failed'
  priority: number
  tier1Done: boolean
  tier2Needed: boolean
  tier2Done: boolean
  error?: string
}

export interface QueueStatus {
  total: number
  pending: number
  processing: number
  completed: number
  failed: number
  isRunning: boolean
  isPaused: boolean
  currentMediaId: string | null
}

export interface ProcessingStats {
  totalProcessed: number
  tier1Only: number
  tier2Used: number
  avgProcessingTime: number
  tagsMatched: number
  newTagsCreated: number
}

export interface ReviewItem {
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
  // Phase E: Tier 2 may suggest a clean filename when the original is gibberish.
  suggestedFilename?: string | null
  // Phase A: rich tags with confidence + source classification (parsed back from JSON).
  richTags?: Array<{ name: string; confidence: number; source: string }>
}

export class ProcessingQueue {
  private rawDb: RawDB
  // Full DB wrapper (with helper methods like addTagToMedia). Passed
  // through to services that need both the raw connection and the
  // wrapper helpers — e.g., face-cluster-service for performer tag
  // application on rename.
  private dbWrapper: DB
  private frameExtractor: FrameExtractor
  private tier1Tagger: Tier1OnnxTagger
  private tier2Vision: Tier2VisionLLM
  private tier3Matcher: Tier3TagMatcher
  private mainWindow: BrowserWindow | null

  private isRunning = false
  private isPaused = false
  // Optional cap on items processed per start() call. 0 = unlimited.
  // Used so the user can say "tag 50 then pause" instead of letting the
  // pipeline chew through their whole library unattended.
  private batchLimit = 0
  private batchProcessed = 0
  private currentMediaId: string | null = null
  private enableTier2 = false
  private _concurrency = 1 // Reserved for future parallel processing
  // Phase: auto-categorize. When >0, tags from Tier 3 with confidence >= threshold
  // are auto-applied to the media without needing manual review. If all tags clear
  // the bar AND no new-tag suggestions exist below the bar, the whole record is
  // marked approved silently. 0 disables (default — preserves existing review flow).
  private autoApproveThreshold = 0

  // Cached fresh sqlite connection for getReviewList. The primary connection
  // (this.rawDb) sometimes has a stale schema-cache for ai_analysis_results
  // (review_status column "not found" despite PRAGMA showing it). Once we hit
  // that error we open a parallel connection and keep it for the rest of the
  // session so the workaround doesn't pay open/close cost on every poll.
  // WAL + 5s busy_timeout matches the primary connection.
  private freshReviewDb: any = null

  // Single-level undo for the most recent approve/reject. Snapshot is
  // taken before the decision runs; ai:undo-last-review restores it.
  // In-memory only — does not survive restart. One slot is enough for
  // the "I clicked wrong" use case (which is the only undo most users
  // actually want).
  private lastReviewSnapshot: {
    mediaId: string
    decisionType: 'approve' | 'approve-edited' | 'reject'
    row: {
      review_status: string | null
      reviewed_at: string | null
      approved_tag_ids: string | null
      approved_title: string | null
      suggested_title: string | null
      description: string | null
      rejection_history: string | null
    }
    preDecisionTagIds: number[]
    takenAt: number
  } | null = null

  constructor(
    db: DB,
    frameExtractor: FrameExtractor,
    tier1Tagger: Tier1OnnxTagger,
    tier2Vision: Tier2VisionLLM,
    tier3Matcher: Tier3TagMatcher,
    mainWindow: BrowserWindow | null
  ) {
    this.rawDb = db.raw
    this.dbWrapper = db
    this.frameExtractor = frameExtractor
    this.tier1Tagger = tier1Tagger
    this.tier2Vision = tier2Vision
    this.tier3Matcher = tier3Matcher
    this.mainWindow = mainWindow
  }

  /**
   * Queue all untagged media items
   */
  queueUntagged(): { queued: number } {
    const untagged = this.rawDb.prepare(`
      SELECT m.id FROM media m
      LEFT JOIN media_tags mt ON m.id = mt.mediaId
      WHERE mt.mediaId IS NULL
      AND NOT EXISTS (SELECT 1 FROM ai_processing_queue WHERE media_id = m.id)
    `).all() as Array<{ id: string }>

    let queued = 0
    for (const item of untagged) {
      this.addToQueue(item.id, 0)
      queued++
    }

    return { queued }
  }

  /**
   * Get count of untagged media items (for UI badge)
   */
  getUntaggedCount(): number {
    const result = this.rawDb.prepare(`
      SELECT COUNT(*) as count FROM media m
      LEFT JOIN media_tags mt ON m.id = mt.mediaId
      WHERE mt.mediaId IS NULL
    `).get() as { count: number } | undefined
    return result?.count ?? 0
  }

  /**
   * Queue specific media IDs
   */
  queueSpecific(mediaIds: string[]): { queued: number } {
    let queued = 0
    for (const mediaId of mediaIds) {
      if (this.addToQueue(mediaId, 1)) {
        queued++
      }
    }
    return { queued }
  }

  /**
   * Re-queue specific media that have already been processed. Resets the
   * existing queue row to 'pending' and clears the analysis result so the
   * pipeline produces fresh output (useful after prompt/model upgrades).
   *
   * For items not yet in the queue, falls back to a fresh add. Always
   * idempotent.
   */
  requeueMedia(mediaIds: string[], priority: number = 1): { requeued: number } {
    let requeued = 0
    const tx = this.rawDb.transaction((ids: string[]) => {
      const updateExisting = this.rawDb.prepare(`
        UPDATE ai_processing_queue
        SET status = 'pending', error = NULL, tier1_done = 0, tier2_done = 0,
            completed_at = NULL, priority = MAX(priority, ?)
        WHERE media_id = ?
      `)
      const insertNew = this.rawDb.prepare(`
        INSERT OR IGNORE INTO ai_processing_queue (media_id, priority)
        VALUES (?, ?)
      `)
      const clearAnalysis = this.rawDb.prepare(`
        DELETE FROM ai_analysis_results WHERE media_id = ?
      `)
      for (const id of ids) {
        const result = updateExisting.run(priority, id)
        if (result.changes === 0) {
          insertNew.run(id, priority)
        }
        clearAnalysis.run(id)
        requeued++
      }
    })
    tx(mediaIds)
    return { requeued }
  }

  /**
   * Re-queue every previously-scanned (status='completed' or 'failed') row
   * for a fresh pass. Pending/processing rows are left alone. Useful when
   * the user wants to re-run the AI on their entire library after upgrading
   * the prompt or models.
   */
  requeueAll(opts?: { includeApproved?: boolean }): { requeued: number; skippedApproved: number } {
    // By default, EXCLUDE items the user has already approved — re-queuing
    // them would wipe out the user's manual review work. Only "completed"
    // queue rows that are still pending review (or have been rejected)
    // qualify. The user can opt-in to wipe approvals via includeApproved
    // for a true library-wide reset.
    const sql = opts?.includeApproved
      ? `
        SELECT q.media_id FROM ai_processing_queue q
        WHERE q.status IN ('completed', 'failed')
      `
      : `
        SELECT q.media_id FROM ai_processing_queue q
        LEFT JOIN ai_analysis_results r ON r.media_id = q.media_id
        WHERE q.status IN ('completed', 'failed')
          AND COALESCE(r.review_status, 'pending') != 'approved'
      `
    const rows = this.rawDb.prepare(sql).all() as Array<{ media_id: string }>

    // Count how many approved items we skipped so the UI can tell the user.
    let skippedApproved = 0
    if (!opts?.includeApproved) {
      const skipRow = this.rawDb.prepare(`
        SELECT COUNT(*) AS n FROM ai_processing_queue q
        JOIN ai_analysis_results r ON r.media_id = q.media_id
        WHERE q.status IN ('completed', 'failed')
          AND r.review_status = 'approved'
      `).get() as { n: number } | undefined
      skippedApproved = skipRow?.n ?? 0
    }

    const result = this.requeueMedia(rows.map((r) => r.media_id), -1)
    return { requeued: result.requeued, skippedApproved }
  }

  /**
   * Queue entire library
   */
  queueAll(): { queued: number } {
    const all = this.rawDb.prepare(`
      SELECT id FROM media
      WHERE NOT EXISTS (SELECT 1 FROM ai_processing_queue WHERE media_id = media.id)
    `).all() as Array<{ id: string }>

    let queued = 0
    for (const item of all) {
      this.addToQueue(item.id, -1) // Low priority for full library scan
      queued++
    }

    return { queued }
  }

  private addToQueue(mediaId: string, priority: number): boolean {
    try {
      this.rawDb.prepare(`
        INSERT OR IGNORE INTO ai_processing_queue (media_id, priority)
        VALUES (?, ?)
      `).run(mediaId, priority)
      return true
    } catch (err) {
      console.error(`[ProcessingQueue] Failed to add ${mediaId} to queue:`, err)
      return false
    }
  }

  /**
   * Get queue status.
   *
   * "completed" here means "AI finished AND the user hasn't reviewed it yet"
   * — i.e. it's the count the review pane is showing. Queue rows with
   * status='completed' whose analysis row has review_status='approved' or
   * 'rejected' do NOT count anymore, so the badge / Queue Status panel
   * correctly decrements as items get reviewed.
   *
   * Done via LEFT JOIN so a queue row missing an analysis result (shouldn't
   * happen but safe) still counts as completed-pending.
   */
  getStatus(): QueueStatus {
    const stats = this.rawDb.prepare(`
      SELECT
        (SELECT COUNT(*) FROM ai_processing_queue) AS total,
        (SELECT COUNT(*) FROM ai_processing_queue WHERE status = 'pending') AS pending,
        (SELECT COUNT(*) FROM ai_processing_queue WHERE status = 'processing') AS processing,
        (SELECT COUNT(*)
           FROM ai_processing_queue q
           LEFT JOIN ai_analysis_results r ON r.media_id = q.media_id
           WHERE q.status = 'completed'
             AND (r.review_status IS NULL OR r.review_status = 'pending')) AS completed,
        (SELECT COUNT(*) FROM ai_processing_queue WHERE status = 'failed') AS failed
    `).get() as { total: number; pending: number; processing: number; completed: number; failed: number }

    return {
      ...stats,
      isRunning: this.isRunning,
      isPaused: this.isPaused,
      currentMediaId: this.currentMediaId
    }
  }

  /**
   * Start processing
   */
  async start(options?: { enableTier2?: boolean; concurrency?: number; autoApproveThreshold?: number; batchLimit?: number }): Promise<{ success: boolean }> {
    if (this.isRunning) {
      return { success: false }
    }

    this.enableTier2 = options?.enableTier2 ?? false
    this._concurrency = options?.concurrency ?? 1
    this.autoApproveThreshold = Math.max(0, Math.min(1, options?.autoApproveThreshold ?? 0))
    this.batchLimit = Math.max(0, options?.batchLimit ?? 0)
    this.batchProcessed = 0
    this.isRunning = true
    this.isPaused = false

    // Initialize Tier 1 if needed - with graceful degradation
    try {
      const initialized = await this.tier1Tagger.initialize()
      if (!initialized) {
        this.isRunning = false
        const error = new Error('Failed to initialize Tier 1 - models may not be downloaded')
        errorLogger.error('ProcessingQueue', 'Tier 1 initialization failed', error)
        throw error
      }
    } catch (err) {
      this.isRunning = false
      errorLogger.error('ProcessingQueue', 'Tier 1 initialization exception', err as Error)
      throw err
    }

    // Start processing loop
    this.processLoop()

    return { success: true }
  }

  /**
   * Pause processing
   */
  pause(): { success: boolean } {
    if (!this.isRunning) return { success: false }
    this.isPaused = true
    this.sendStatus('paused')
    return { success: true }
  }

  /**
   * Resume processing
   */
  resume(): { success: boolean } {
    if (!this.isRunning || !this.isPaused) return { success: false }
    this.isPaused = false
    this.sendStatus('resumed')
    this.processLoop()
    return { success: true }
  }

  /**
   * Stop processing
   */
  stop(): { success: boolean } {
    this.isRunning = false
    this.isPaused = false
    this.sendStatus('stopped')
    return { success: true }
  }

  private async processLoop(): Promise<void> {
    while (this.isRunning && !this.isPaused) {
      // Honor batch limit if set — stop cleanly after processing N items
      // and tell the renderer we paused so the user can review before
      // letting the pipeline burn through the rest of their library.
      if (this.batchLimit > 0 && this.batchProcessed >= this.batchLimit) {
        console.log(`[ProcessingQueue] Batch limit ${this.batchLimit} reached, pausing`)
        this.isRunning = false
        this.isPaused = false
        this.sendStatus('batch-complete')
        break
      }

      const item = this.getNextItem()
      if (!item) {
        // Queue empty
        this.isRunning = false
        this.sendStatus('completed')
        break
      }

      try {
        await this.processItem(item)
      } catch (err) {
        // A single bad item must not kill the loop — log + mark the
        // queue row failed so getNextItem moves on. Without this guard
        // any unhandled rejection inside processItem (e.g. missing
        // column, model dependency, unreadable file) silently halts
        // the loop while isRunning stays true, leaving the UI showing
        // "Pause" with zero progress events.
        console.error(`[ProcessingQueue] processItem(${item.mediaId}) threw, marking failed and continuing:`, err)
        try {
          this.rawDb.prepare(`
            UPDATE ai_processing_queue SET status = 'failed', error = ?, completed_at = datetime('now')
            WHERE media_id = ?
          `).run(String((err as Error)?.message ?? err).slice(0, 500), item.mediaId)
        } catch { /* if even this fails, just continue */ }
      }
      this.batchProcessed += 1
    }
  }

  private getNextItem(): QueueItem | null {
    // Ordering priority (highest → lowest):
    //   1. explicit priority field (manual prioritization, requeue)
    //   2. USER INTEREST signals — items the user has interacted with
    //      should be tagged first regardless of duration. Sum of:
    //         - rating  >= 5 (favorite)   → +30
    //         - viewCount > 0             → +15
    //         - oCount   > 0              → +20 (orgasm count = strong signal)
    //         - in any playlist           → +20
    //      Computed as an interest_score and used as secondary sort.
    //   3. shortest duration first (quick feedback on short clips)
    //   4. id ASC tiebreaker
    //
    // LEFT JOIN so queue rows whose media row is missing (orphans) still
    // count as duration=∞ and sort to the back rather than crashing the
    // query. media_stats join is also LEFT — unwatched items have NULL
    // stats and naturally get interest_score=0.
    const row = this.rawDb.prepare(`
      SELECT q.id, q.media_id, q.status, q.priority, q.tier1_done, q.tier2_needed, q.tier2_done, q.error,
        (
          (CASE WHEN COALESCE(ms.rating, 0) >= 5 THEN 30 ELSE 0 END) +
          (CASE WHEN COALESCE(ms.views, 0) > 0 THEN 15 ELSE 0 END) +
          (CASE WHEN COALESCE(ms.oCount, 0) > 0 THEN 20 ELSE 0 END) +
          (CASE WHEN EXISTS (SELECT 1 FROM playlist_items pi WHERE pi.mediaId = q.media_id) THEN 20 ELSE 0 END)
        ) AS interest_score
      FROM ai_processing_queue q
      LEFT JOIN media m ON m.id = q.media_id
      LEFT JOIN media_stats ms ON ms.mediaId = q.media_id
      WHERE q.status = 'pending'
      ORDER BY q.priority DESC,
               interest_score DESC,
               COALESCE(m.durationSec, 999999) ASC,
               q.id ASC
      LIMIT 1
    `).get() as any

    if (!row) return null
    if (row.interest_score > 0) {
      console.log(`[ProcessingQueue] Prioritizing ${row.media_id} (interest_score=${row.interest_score})`)
    }

    return {
      id: row.id,
      mediaId: row.media_id,
      status: row.status,
      priority: row.priority,
      tier1Done: !!row.tier1_done,
      tier2Needed: !!row.tier2_needed,
      tier2Done: !!row.tier2_done,
      error: row.error
    }
  }

  private async processItem(item: QueueItem): Promise<void> {
    this.currentMediaId = item.mediaId
    const startTime = Date.now()

    // Mark as processing
    this.rawDb.prepare(`
      UPDATE ai_processing_queue
      SET status = 'processing', started_at = datetime('now')
      WHERE id = ?
    `).run(item.id)

    this.sendProgress(item.mediaId, 'processing', 0)

    try {
      // Get media info
      const media = this.rawDb.prepare(`
        SELECT id, filename, type, durationSec, path
        FROM media WHERE id = ?
      `).get(item.mediaId) as { id: string; filename: string; type: string; durationSec: number; path: string } | undefined

      if (!media) {
        throw new Error('Media not found')
      }

      // Determine media type
      const mediaType = this.getMediaType(media.type, media.filename)

      // Stage-weight windows for the precise progress bar:
      //   extract  0 → 15%
      //   tier1    15 → 35%
      //   tier2    35 → 80%   (longest stage — 12 Venice calls × ~5s each)
      //   tier3    80 → 90%
      //   store    90 → 100%
      const STAGE = {
        extractStart: 0, extractEnd: 15,
        tier1Start: 15, tier1End: 35,
        tier2Start: 35, tier2End: 80,
        tier3Start: 80, tier3End: 90,
        storeStart: 90, storeEnd: 100,
      }

      // Extract frames. Note: extractFrames creates a unique nanoid-named
      // subdir per call, so we capture its absolute path from the first
      // returned frame to cleanup only THIS item's directory afterwards
      // (cleanupAll() was racing with the next item's frames).
      this.sendProgress(item.mediaId, 'extracting', STAGE.extractStart)
      const frames = await this.frameExtractor.extractFrames(
        media.path,
        mediaType,
        media.durationSec
      )

      if (frames.length === 0) {
        throw new Error('No frames extracted')
      }
      this.sendProgress(item.mediaId, 'extracting', STAGE.extractEnd, { framesExtracted: frames.length })

      // Run Tier 1 analysis
      this.sendProgress(item.mediaId, 'tier1', STAGE.tier1Start)
      const tier1Result = await this.tier1Tagger.processFrames(frames.map(f => f.path))
      this.sendProgress(item.mediaId, 'tier1', STAGE.tier1End, { tier1Tags: tier1Result.tags.length })

      // Persist the CLIP image embedding from Tier 1 so the CLIP
      // search box can cosine-match it later. tier1Tagger stashes
      // the latest embedding on the instance after each CLIP run.
      const lastEmb = (this.tier1Tagger as any).lastImageEmbedding as Float32Array | undefined
      if (lastEmb && lastEmb.length > 0) {
        try {
          const { storeClipImageEmbedding } = await import('./clip-search')
          const model = lastEmb.length === 512 ? 'vit-b-32'
                      : lastEmb.length === 768 ? 'vit-l-14'
                      : `dim-${lastEmb.length}`
          storeClipImageEmbedding(this.dbWrapper, item.mediaId, lastEmb, model)
        } catch (err) {
          console.warn('[ProcessingQueue] clip embedding persist failed:', err)
        }

        // Aesthetic score (#241) — the LAION sac+logos+ava1 predictor is
        // a thin linear head on this same CLIP embedding, so it's
        // near-free to score here. predictAesthetic returns null when
        // weights aren't installed; we just skip the column update in
        // that case. Score persists to media_stats.aestheticScore
        // (migration v44) so the recommender + 'best 100' view + sort
        // can read it without re-running the model.
        try {
          const { predictAesthetic } = await import('./aesthetic-predictor')
          const score = predictAesthetic(lastEmb)
          if (typeof score === 'number') {
            this.rawDb.prepare(`
              INSERT INTO media_stats (mediaId, views, lastViewedAt, rating, oCount, updatedAt, aestheticScore)
              VALUES (?, 0, NULL, 0, 0, ?, ?)
              ON CONFLICT(mediaId) DO UPDATE SET aestheticScore = excluded.aestheticScore, updatedAt = excluded.updatedAt
            `).run(item.mediaId, Date.now(), score)
          }
        } catch (err) {
          console.warn('[ProcessingQueue] aesthetic prediction failed:', err)
        }
      }

      // PaddleOCR text extraction (#247). Opt-in via
      // settings.ai.useDbCrnnOcr. Runs on the first 2 frames only so
      // the cost is bounded — OCR is expensive and most porn frames
      // don't have text. Detected strings get added as a single tag
      // 'has-text' + persisted into the description field for search.
      try {
        const aiSettings: any = (await import('../../settings')).getAISettings?.() ?? {}
        if (aiSettings.useDbCrnnOcr) {
          const { isDbCrnnOcrAvailable, runDbCrnnOcr } = await import('./paddle-ocr')
          if (isDbCrnnOcrAvailable()) {
            const samples = frames.slice(0, 2)
            const textsAcrossFrames: string[] = []
            for (const f of samples) {
              try {
                const texts = await runDbCrnnOcr(f.path)
                for (const t of texts) {
                  const clean = t.trim()
                  if (clean.length > 1 && !textsAcrossFrames.includes(clean)) textsAcrossFrames.push(clean)
                }
              } catch { /* skip frame */ }
            }
            if (textsAcrossFrames.length > 0) {
              // Cache for later use in Tier 2 prompt + tag prior loop.
              ;(tier1Result as any).ocrTexts = textsAcrossFrames
            }
          }
        }
      } catch (err) {
        console.warn('[ProcessingQueue] PaddleOCR failed:', err)
      }

      // AI-image full-frame detector (#243). Runs on the first frame
      // (representative of the still) — full per-frame averaging would
      // double the cost. Null when no model is installed.
      try {
        const { scoreFrame: scoreAiImageFrame } = await import('./ai-image-detector')
        if (frames[0]?.path) {
          const aiScore = await scoreAiImageFrame(frames[0].path)
          if (aiScore) {
            this.rawDb.prepare(`
              INSERT INTO media_stats (mediaId, views, lastViewedAt, rating, oCount, updatedAt, aiImageProb)
              VALUES (?, 0, NULL, 0, 0, ?, ?)
              ON CONFLICT(mediaId) DO UPDATE SET aiImageProb = excluded.aiImageProb, updatedAt = excluded.updatedAt
            `).run(item.mediaId, Date.now(), aiScore.ai)
          }
        }
      } catch (err) {
        console.warn('[ProcessingQueue] ai-image score failed:', err)
      }

      // Store Tier 1 results
      this.rawDb.prepare(`
        UPDATE ai_processing_queue SET tier1_done = 1 WHERE id = ?
      `).run(item.id)

      // Perceptual-hash dedup short-circuit. If this media has a phash
      // and there's an APPROVED item with a near-identical phash (≤4
      // bits Hamming = ~94% similar), copy that item's approved tags +
      // title + description and skip Tier 2 entirely. Saves an API call
      // AND ensures consistency on re-encoded duplicates.
      //
      // We use a strict threshold (4) because we're going to commit
      // these tags as if user-approved on the new item — false positives
      // would silently apply wrong tags. The duplicates modal uses 10
      // for "show suspected duplicates", which is much looser.
      let copiedFromDuplicate = false
      try {
        const sourcePhashRow = this.rawDb.prepare(
          `SELECT phash FROM media WHERE id = ?`
        ).get(item.mediaId) as { phash: string | null } | undefined
        const sourcePhash = sourcePhashRow?.phash
        if (sourcePhash) {
          const PHASH_DEDUP_THRESHOLD = 4
          // Find approved items with a phash within threshold. SQL can't
          // do Hamming distance natively so we pull candidates with
          // identical phash strings as a fast path (the common case for
          // exact re-encodes), then fall back to a small in-memory scan.
          const exactDup = this.rawDb.prepare(`
            SELECT ar.media_id, ar.rich_tags, ar.approved_title, ar.description, ar.approved_tag_ids
            FROM ai_analysis_results ar
            JOIN media m ON m.id = ar.media_id
            WHERE ar.review_status = 'approved'
              AND m.phash = ?
              AND ar.media_id != ?
            LIMIT 1
          `).get(sourcePhash, item.mediaId) as {
            media_id: string
            rich_tags: string | null
            approved_title: string | null
            description: string | null
            approved_tag_ids: string | null
          } | undefined

          if (exactDup) {
            console.log(`[ProcessingQueue] phash dedup: copying tags from approved item ${exactDup.media_id}`)
            // Copy tag assignments from the duplicate. We grab the
            // approved_tag_ids (the user's curated final set, not all
            // rich_tags) so the copy reflects manual editing.
            let approvedIds: string[] = []
            try {
              const parsed = JSON.parse(exactDup.approved_tag_ids ?? '[]')
              if (Array.isArray(parsed)) approvedIds = parsed.map(String)
            } catch { /* ignore */ }
            for (const tagId of approvedIds) {
              this.rawDb.prepare(`
                INSERT OR IGNORE INTO media_tags (mediaId, tagId) VALUES (?, ?)
              `).run(item.mediaId, tagId)
            }
            // Copy title to media.title if the duplicate had one.
            if (exactDup.approved_title) {
              this.rawDb.prepare(`UPDATE media SET title = ? WHERE id = ?`).run(exactDup.approved_title, item.mediaId)
            }
            // Mirror the analysis row so the user can see this came from
            // a duplicate. Stash the source media id in rejection_history
            // (existing column, no migration needed) so it's auditable.
            const dupMarker = JSON.stringify([{ reason: 'phash-dup-copy', copiedFrom: exactDup.media_id, copiedAt: new Date().toISOString() }])
            this.rawDb.prepare(`
              INSERT OR REPLACE INTO ai_analysis_results (
                media_id, suggested_title, description, rich_tags,
                approved_tag_ids, approved_title,
                review_status, reviewed_at, created_at, rejection_history
              ) VALUES (?, ?, ?, ?, ?, ?, 'approved', datetime('now'), datetime('now'), ?)
            `).run(
              item.mediaId,
              exactDup.approved_title,
              exactDup.description,
              exactDup.rich_tags,
              exactDup.approved_tag_ids,
              exactDup.approved_title,
              dupMarker
            )
            copiedFromDuplicate = true
          }
        }
      } catch (err) {
        // Non-fatal — fall through to normal Tier 2 path.
        console.warn('[ProcessingQueue] phash dedup check failed (continuing):', err)
      }

      // Run Tier 2 (Venice Vision AI) if enabled - this is the main analysis for real content
      // Tier 1 (WD Tagger) is for anime, so we should always use Tier 2 for real photos/videos
      const shouldRunTier2 = this.enableTier2 && this.tier2Vision.isEnabled() && !copiedFromDuplicate

      let tier2Result: Tier2Result | null = null
      if (shouldRunTier2) {
        this.sendProgress(item.mediaId, 'tier2', STAGE.tier2Start)
        this.rawDb.prepare(`
          UPDATE ai_processing_queue SET tier2_needed = 1 WHERE id = ?
        `).run(item.id)

        console.log(`[ProcessingQueue] Running Tier 2 (Venice) analysis for ${item.mediaId}`)
        console.log(`[ProcessingQueue] Frames to analyze: ${frames.length}`)

        // Pull rejection_history so Tier 2 can avoid repeating directions
        // the user already rejected on prior passes.
        let rejectionHints: { prevTitles?: string[]; prevDescs?: string[]; prevTags?: string[] } | undefined
        try {
          const histRow = this.rawDb.prepare(
            'SELECT rejection_history FROM ai_analysis_results WHERE media_id = ?'
          ).get(item.mediaId) as { rejection_history: string | null } | undefined
          if (histRow?.rejection_history) {
            const history = JSON.parse(histRow.rejection_history) as Array<{
              prevTitle?: string | null
              prevDesc?: string | null
              prevTags?: string[]
            }>
            if (Array.isArray(history) && history.length > 0) {
              const recent = history.slice(-3)  // last 3 rejections only
              rejectionHints = {
                prevTitles: recent.map(h => h.prevTitle).filter((t): t is string => !!t),
                prevDescs: recent.map(h => h.prevDesc).filter((d): d is string => !!d),
                prevTags: Array.from(new Set(recent.flatMap(h => h.prevTags ?? []))),
              }
              console.log(`[ProcessingQueue] Threading ${history.length} rejection(s) into Tier 2 prompt`)
            }
          }
        } catch (err) {
          console.warn('[ProcessingQueue] Failed to read rejection_history:', err)
        }

        try {
          // Library-wide rejection patterns — Phase 3 slice from #19 audit.
          // Tier 2 gets a "USER OFTEN REJECTS THESE TAGS" block so the model
          // biases against patterns the user has shown they don't like, not
          // just ones rejected on THIS specific video.
          let libraryRejectionBlock = ''
          try {
            const { getCachedRejectionPatterns, renderRejectionPatternsForPrompt } = await import('./rejection-patterns')
            const patterns = getCachedRejectionPatterns(this.rawDb)
            libraryRejectionBlock = renderRejectionPatternsForPrompt(patterns)
          } catch (err) {
            console.warn('[ProcessingQueue] rejection patterns load failed:', err)
          }

          // OCR pass — extract burned-in text from a subset of frames
          // (Snapchat overlays, OnlyFans handles, performer name burns,
          // captions). Feeds Tier 2 as another context block + auto-
          // emits platform tags. Cheap: 3 frames @ ~200ms each, gated
          // behind tesseract.js init which is cached after first use.
          let ocrBlock = ''
          let ocrResult: { rawText: string; lines: string[]; platforms: string[]; handles: string[] } | null = null
          try {
            const ocrFrames = frames.slice(0, 3).map((f) => f.path)
            ocrResult = await extractTextFromFrames(ocrFrames)
            ocrBlock = renderOcrBlockForPrompt(ocrResult)
            if (ocrResult.platforms.length > 0 || ocrResult.lines.length > 0) {
              console.log(`[ProcessingQueue] OCR: ${ocrResult.lines.length} line(s), platforms: [${ocrResult.platforms.join(', ')}]`)
            }
          } catch (err) {
            console.warn('[ProcessingQueue] OCR pass failed (continuing):', err)
          }

          // Audio fingerprint — detects silent vs loud, music-only vs
          // speech, dynamic-range bursts (orgasm peaks). Visual-only
          // analysis would miss audio-driven content (PMVs, dirty talk
          // ASMR, silent compilations cut to music). Single ffmpeg pass
          // per video, ~1-2s for a typical 60s clip.
          let audioBlock = ''
          // Capture the fingerprint outside the try so the post-Tier-2
          // step can fold its priors into rich_tags. Null when audio
          // analysis is unavailable (non-video, ffmpeg failure, etc.).
          let audioFingerprint: AudioFingerprint | null = null
          if (mediaType === 'video') {
            try {
              audioFingerprint = await analyzeAudioTrack(
                media.path,
                this.frameExtractor.getFfmpegPath(),
                (media as any).durationSec ?? null
              )
              audioBlock = renderAudioBlockForPrompt(audioFingerprint)
              if (audioFingerprint.channels > 0) {
                console.log(`[ProcessingQueue] Audio: type=${audioFingerprint.contentType}, mean=${audioFingerprint.meanRmsDb.toFixed(1)}dB, peak=${audioFingerprint.peakRmsDb.toFixed(1)}dB`)
              }
            } catch (err) {
              console.warn('[ProcessingQueue] Audio analysis failed (continuing):', err)
            }
          }

          // Media metadata signals — aspect ratio (vertical → phone),
          // brightness (dark → night/dim), dominant color (cool/blue →
          // outdoor/pool), EXIF camera/software (OBS/Snapchat hints).
          // Cheap (single sharp() call on one frame).
          let metadataBlock = ''
          let metadataPriorTags: string[] = []
          try {
            if (frames.length > 0) {
              const sig = await analyzeMediaMetadata(
                media.path,
                frames[0].path,
                (media as any).width ?? null,
                (media as any).height ?? null
              )
              metadataBlock = renderMetadataBlockForPrompt(sig)
              metadataPriorTags = sig.priorTags
              if (metadataPriorTags.length > 0) {
                console.log(`[ProcessingQueue] Metadata priors: [${metadataPriorTags.join(', ')}]`)
              }
            }
          } catch (err) {
            console.warn('[ProcessingQueue] Metadata analysis failed (continuing):', err)
          }

          // Similar-video priors + few-shot. Use Tier 1 tags as a
          // provisional fingerprint to find approved items with the
          // same signature, then pass their (title, description, tags)
          // to Tier 2 as concrete examples of what good output looks
          // like for this kind of content. Compounds with every approve
          // decision the user makes.
          let similarApprovedExamples: Array<{
            mediaId: string
            filename: string
            title: string | null
            description: string | null
            similarity: number
            sharedTags: string[]
            approvedTags: Array<{ name: string; confidence: number; source: string }>
          }> = []
          try {
            const probeTags = tier1Result.tags.slice(0, 30).map((t) => ({
              name: t.label.toLowerCase(),
              confidence: t.confidence,
              source: 'other',
            }))
            const similarityEngine = getSimilarityEngine({ raw: this.rawDb } as DB)
            similarApprovedExamples = similarityEngine.findSimilarApprovedByTagList(
              probeTags,
              5,
              item.mediaId
            )
            if (similarApprovedExamples.length > 0) {
              console.log(`[ProcessingQueue] Found ${similarApprovedExamples.length} similar approved items (top sim: ${similarApprovedExamples[0].similarity.toFixed(2)})`)
            }
          } catch (err) {
            console.warn('[ProcessingQueue] Similar-priors lookup failed:', err)
          }

          // Multi-hypothesis Venice sampling — when veniceMultiSample > 1,
          // run the full analyze() N times and aggregate via voting.
          // Reduces hallucination because tags that only appeared in
          // 1 of N runs get filtered out. Costs N× Venice spend.
          let veniceMultiSample = 1
          try {
            const aiSettings = (await import('../../settings')).getSettings().ai as any
            veniceMultiSample = Math.max(1, Math.min(3, Math.round(Number(aiSettings?.veniceMultiSample) || 1)))
          } catch { /* default */ }

          const tier2Args = [
            frames.map(f => f.path),
            mediaType,
            media.filename,
            tier1Result.tags.map(t => t.label),
            // Per-frame progress callback — scales the [tier2Start, tier2End]
            // window linearly with the number of Venice calls completed.
            (done: number, total: number) => {
              const span = STAGE.tier2End - STAGE.tier2Start
              const pct = STAGE.tier2Start + Math.round((done / Math.max(1, total)) * span)
              this.sendProgress(item.mediaId, 'tier2', pct, { tier2Frame: done, tier2Total: total })
            },
            rejectionHints,
            // Duration hint — Venice gets a "Long video, likely compilation"
            // sentence based on the bucket so it doesn't try to summarize a
            // 35-min reel as one scene. Trivial cost, real signal.
            (media as any).durationSec ?? null,
            (libraryRejectionBlock ?? '') +
              (ocrBlock ?? '') +
              (audioBlock ?? '') +
              (metadataBlock ?? '') +
              renderStyleBlockForPrompt(this.rawDb),
            similarApprovedExamples,
          ] as const

          if (veniceMultiSample <= 1) {
            tier2Result = await this.tier2Vision.analyze(...tier2Args)
          } else {
            console.log(`[ProcessingQueue] Multi-hypothesis Venice: ${veniceMultiSample} samples`)
            const samples: any[] = []
            for (let s = 0; s < veniceMultiSample; s++) {
              try {
                const r = await this.tier2Vision.analyze(...tier2Args)
                samples.push(r)
              } catch (err) {
                console.warn(`[ProcessingQueue] Multi-sample run ${s + 1}/${veniceMultiSample} failed:`, err)
              }
            }
            if (samples.length === 0) {
              throw new Error('All multi-hypothesis Venice samples failed')
            }
            const { aggregateMultiFrameResults } = await import('./tier2-vision-llm')
            tier2Result = samples.length === 1 ? samples[0] : aggregateMultiFrameResults(samples)
          }

          // JoyCaption supplement (Apache-2.0 LLaVA-on-Llama-3.1, local
          // sidecar at 127.0.0.1:8030). When the sidecar is online,
          // we generate a parallel caption + booru-style tag list on
          // the first frame. Outputs feed the existing description-
          // tag-extractor as another independent signal — Venice stays
          // the primary tagger (per user's no-fallback-LLM rule).
          //
          // Two captions in one round-trip: descriptive + tag-style.
          // Descriptive goes into the description corpus for tag mining;
          // tag-style is parsed as direct rich_tags candidates.
          try {
            const jc = getJoyCaptionClient()
            const jcHealth = await jc.health()
            if (jcHealth && frames.length > 0) {
              const [descRes, tagRes] = await Promise.all([
                jc.caption(frames[0].path, { style: 'descriptive', maxTokens: 220 }),
                jc.caption(frames[0].path, { style: 'tags-danbooru', maxTokens: 180 }),
              ])
              if (descRes?.caption && tier2Result) {
                // Append JoyCaption's description to Venice's so the
                // description-tag-extractor mines BOTH for canonical
                // tag mentions. Newline-separated so the extractor's
                // sentence-splitter handles them independently.
                const combined = tier2Result.description
                  ? `${tier2Result.description}\n\n[Local caption]\n${descRes.caption}`
                  : descRes.caption
                tier2Result = { ...tier2Result, description: combined }
                console.log(`[ProcessingQueue] JoyCaption descriptive: ${descRes.caption.slice(0, 80)}…`)
              }
              if (tagRes?.caption && tier2Result) {
                // Parse booru-style tag output (comma- or
                // newline-separated). Emit as low-confidence rich_tags
                // that the calibration + exclusion pipeline will
                // filter/boost like any other source.
                const candidates = tagRes.caption
                  .split(/[\n,]+/)
                  .map((t) => t.trim().toLowerCase().replace(/^[-•*]\s*/, ''))
                  .filter((t) => t.length >= 2 && t.length <= 40)
                  .slice(0, 30)
                const existingNames = new Set(tier2Result.richTags.map((t) => t.name.toLowerCase()))
                let added = 0
                for (const name of candidates) {
                  if (existingNames.has(name)) continue
                  tier2Result.richTags.push({
                    name,
                    confidence: 0.5,  // base — calibration + mutual-exclusion will adjust
                    source: 'other',
                    frameCount: 1,
                    totalFrames: 1,
                  })
                  added++
                }
                if (added > 0) {
                  console.log(`[ProcessingQueue] JoyCaption added ${added} booru-tag candidates`)
                }
              }
            }
          } catch (err) {
            console.warn('[ProcessingQueue] JoyCaption supplement failed (continuing):', err)
          }

          // Apply protected-tag filter, calibration, AND tier1+tier2
          // agreement boost. All three happen here so the values stored
          // in ai_analysis_results AND the values used by
          // autoApplyHighConfidence reflect the user's learned preferences
          // instead of Venice's raw output.
          if (tier2Result?.richTags && tier2Result.richTags.length > 0) {
            try {
              // Step -2: OCR-derived platform tags. Direct insertion at
              // high confidence — if we visually detected "OnlyFans"
              // text on the frame, we're 95% sure it's an OnlyFans video.
              // Higher confidence than Venice's "I think this might be
              // OnlyFans" inference because we're reading actual pixels.
              if (ocrResult && ocrResult.platforms.length > 0) {
                const existingNames = new Set(tier2Result.richTags.map((t) => t.name.toLowerCase()))
                for (const platform of ocrResult.platforms) {
                  if (!existingNames.has(platform)) {
                    tier2Result.richTags.push({
                      name: platform,
                      confidence: 0.95,
                      source: 'context',
                      frameCount: 1,
                      totalFrames: 1,
                    })
                  }
                }
              }

              // Step -1.8: miles-deep ResNet50 6-class action priors.
              // Only fires if the user has dropped models/miles-deep.onnx
              // (manually converted from Caffe or community ONNX). When
              // available, classifications go in as direct action tags
              // — strong vision-based signal for blowjob/cunnilingus/
              // doggystyle/etc. Skipped silently when not installed.
              try {
                if (isMilesDeepAvailable() && frames.length > 0) {
                  const mdPriors = await milesDeepClassify(frames.map((f) => f.path))
                  if (mdPriors.length > 0) {
                    const existingNames = new Set(tier2Result.richTags.map((t) => t.name.toLowerCase()))
                    let added = 0
                    let boosted = 0
                    for (const p of mdPriors) {
                      const lower = p.name.toLowerCase()
                      const existing = tier2Result.richTags.find((t) => t.name.toLowerCase() === lower)
                      if (existing) {
                        // Cross-model agreement bonus (similar to tier1+tier2).
                        const newConf = Math.min(1, existing.confidence + 0.08)
                        if (newConf > existing.confidence) {
                          existing.confidence = newConf
                          boosted++
                        }
                      } else {
                        tier2Result.richTags.push({
                          name: p.name,
                          confidence: p.confidence,
                          source: lower.match(/cowgirl|missionary|doggystyle|reverse/) ? 'position' : 'action',
                          frameCount: 1,
                          totalFrames: 1,
                        })
                        added++
                      }
                    }
                    console.log(`[ProcessingQueue] miles-deep: +${added} new, boosted ${boosted}`)
                  }
                }
              } catch (err) {
                console.warn('[ProcessingQueue] miles-deep classification failed:', err)
              }

              // Step -1.85: NudeNet v3 body-part detection. Emits
              // direct tag priors for canonical body-part tags
              // (exposed breasts / exposed pussy / exposed ass /
              // anal / etc.). High precision — runs ONLY when the
              // ONNX is present at userData/models/nudenet-detector.onnx
              // (manual install, see Setup tab card).
              try {
                if (isNudeNetDetectorAvailable() && frames.length > 0) {
                  const nudePriors = await detectNudityAcrossFrames(frames.map((f) => f.path))
                  if (nudePriors.length > 0) {
                    let added = 0
                    let boosted = 0
                    for (const p of nudePriors) {
                      const lower = p.name.toLowerCase()
                      const existing = tier2Result.richTags.find((t) => t.name.toLowerCase() === lower)
                      if (existing) {
                        const newConf = Math.min(1, existing.confidence + 0.1)
                        if (newConf > existing.confidence) {
                          existing.confidence = newConf
                          boosted++
                        }
                      } else {
                        tier2Result.richTags.push({
                          name: p.name,
                          confidence: p.confidence,
                          source: 'body',
                          frameCount: 1,
                          totalFrames: 1,
                        })
                        added++
                      }
                    }
                    console.log(`[ProcessingQueue] nudenet: +${added} new, boosted ${boosted}`)
                  }
                }
              } catch (err) {
                console.warn('[ProcessingQueue] NudeNet detection failed:', err)
              }

              // Step -1.79: YuNet face detection. Performer-count
              // priors from face count. Complements MoveNet on close-
              // ups where pose fails (no visible shoulders/hips).
              // Cross-source agreement with pose count gives the
              // strongest possible signal — when both face and pose
              // independently say "2 people", couple is near-certain.
              // Per-frame face detections also feed the gender
              // classifier in Step -1.78 below — captured here so we
              // don't re-detect.
              const perFrameFaces: Array<{ framePath: string; faces: FaceDetection[] }> = []
              try {
                if (isFaceDetectorAvailable() && frames.length > 0) {
                  // Pre-cache per-frame face detections for gender classifier.
                  if (isGenderClassifierAvailable()) {
                    for (const f of frames.slice(0, 6)) {
                      try {
                        const r = await detectFaces(f.path)
                        perFrameFaces.push({ framePath: f.path, faces: r?.faces ?? [] })
                      } catch { /* skip frame */ }
                    }
                  }
                  const facePriors = await detectFacesAcrossFrames(frames.map((f) => f.path))
                  if (facePriors.length > 0) {
                    let added = 0
                    let boosted = 0
                    for (const p of facePriors) {
                      const lower = p.name.toLowerCase()
                      const existing = tier2Result.richTags.find((t) => t.name.toLowerCase() === lower)
                      if (existing) {
                        const newConf = Math.min(1, existing.confidence + 0.08)
                        if (newConf > existing.confidence) {
                          existing.confidence = newConf
                          boosted++
                        }
                      } else {
                        tier2Result.richTags.push({
                          name: p.name,
                          confidence: p.confidence,
                          source: 'context',
                          frameCount: 1,
                          totalFrames: 1,
                        })
                        added++
                      }
                    }
                    console.log(`[ProcessingQueue] face: +${added} new, boosted ${boosted}`)
                  }
                }
              } catch (err) {
                console.warn('[ProcessingQueue] Face detection failed:', err)
              }

              // Step -1.782 (#242): Deepfake / synthetic-face detector.
              // For each frame where YuNet found ≥1 face, score the
              // face crops with the binary classifier and write the
              // max P(fake) per item. Skipped silently when the
              // model isn't installed. Also emits 'deepfake' /
              // 'ai-generated' tag priors that fold into richTags.
              try {
                const { isDeepfakeDetectorAvailable, deepfakeTagPriorsForFrame } = await import('./deepfake-detector')
                if (isDeepfakeDetectorAvailable() && perFrameFaces.length > 0) {
                  let maxFakeAcrossFrames = 0
                  for (const { framePath, faces } of perFrameFaces) {
                    if (faces.length === 0) continue
                    const priors = await deepfakeTagPriorsForFrame(framePath, faces)
                    for (const p of priors) {
                      if (p.confidence > maxFakeAcrossFrames) maxFakeAcrossFrames = p.confidence
                      const lower = p.name.toLowerCase()
                      const existing = tier2Result.richTags.find((t) => t.name.toLowerCase() === lower)
                      if (!existing) {
                        tier2Result.richTags.push({
                          name: p.name,
                          confidence: p.confidence,
                          source: 'deepfake' as any,
                          frameCount: 1,
                          totalFrames: 1,
                        })
                      }
                    }
                  }
                  if (maxFakeAcrossFrames > 0) {
                    this.rawDb.prepare(`
                      INSERT INTO media_stats (mediaId, views, lastViewedAt, rating, oCount, updatedAt, deepfakeProb)
                      VALUES (?, 0, NULL, 0, 0, ?, ?)
                      ON CONFLICT(mediaId) DO UPDATE SET deepfakeProb = excluded.deepfakeProb, updatedAt = excluded.updatedAt
                    `).run(item.mediaId, Date.now(), maxFakeAcrossFrames)
                  }
                }
              } catch (err) {
                console.warn('[ProcessingQueue] Deepfake detection failed:', err)
              }

              // Step -1.785: SFace face recognition. For each face
              // YuNet detected, extract a 128-D embedding and assign
              // to a cluster. If a face matches a named cluster (one
              // the user has labeled as a specific performer), emit
              // performer:NAME tag priors. Skipped silently when
              // SFace isn't installed.
              try {
                if (isSFaceAvailable() && perFrameFaces.length > 0) {
                  const seenPerformers = new Map<string, number>()  // name → max similarity
                  let embeddingsExtracted = 0
                  for (let fi = 0; fi < perFrameFaces.length; fi++) {
                    const { framePath, faces } = perFrameFaces[fi]
                    for (const face of faces) {
                      if (face.score < 0.5) continue  // skip low-confidence faces
                      const emb = await extractEmbedding(framePath, face)
                      if (!emb) continue
                      embeddingsExtracted++
                      // Assign to cluster (creates a new one if no match).
                      try {
                        assignEmbeddingToCluster(this.dbWrapper, emb, {
                          mediaId: item.mediaId,
                          frameIdx: fi,
                          bbox: face,
                          detectionScore: face.score,
                        })
                      } catch (err) {
                        console.warn('[SFace] cluster assign failed:', err)
                      }
                      // Look for performer matches (named clusters).
                      const matches = findMatchingPerformers(this.dbWrapper, emb)
                      for (const m of matches) {
                        const cur = seenPerformers.get(m.name) ?? 0
                        if (m.similarity > cur) seenPerformers.set(m.name, m.similarity)
                      }
                    }
                  }
                  // Emit performer:NAME tag priors for matched named clusters.
                  let perfsAdded = 0
                  for (const [name, sim] of seenPerformers.entries()) {
                    const tagName = `performer:${name}`
                    const confidence = Math.min(0.9, 0.55 + (sim - 0.4) * 1.5)  // map similarity → confidence
                    tier2Result.richTags.push({
                      name: tagName,
                      confidence,
                      source: 'performer',
                      frameCount: 1,
                      totalFrames: 1,
                    })
                    perfsAdded++
                  }
                  console.log(`[ProcessingQueue] sface: ${embeddingsExtracted} faces embedded, ${perfsAdded} performers matched`)
                }
              } catch (err) {
                console.warn('[ProcessingQueue] SFace recognition failed:', err)
              }

              // Step -1.78: gender classifier on detected faces.
              // Composition tags ("lesbian" / "gay" / "straight" /
              // "MFF threesome" / "MMF threesome") inferred from
              // gender of detected faces. Manual install (see
              // gender-classifier.ts).
              try {
                if (isGenderClassifierAvailable() && perFrameFaces.length > 0) {
                  const genderPriors = await classifyFacesAcrossFrames(
                    frames.map((f) => f.path),
                    perFrameFaces
                  )
                  if (genderPriors.length > 0) {
                    let added = 0
                    let boosted = 0
                    for (const p of genderPriors) {
                      const lower = p.name.toLowerCase()
                      const existing = tier2Result.richTags.find((t) => t.name.toLowerCase() === lower)
                      if (existing) {
                        const newConf = Math.min(1, existing.confidence + 0.08)
                        if (newConf > existing.confidence) {
                          existing.confidence = newConf
                          boosted++
                        }
                      } else {
                        tier2Result.richTags.push({
                          name: p.name,
                          confidence: p.confidence,
                          source: 'performer',
                          frameCount: 1,
                          totalFrames: 1,
                        })
                        added++
                      }
                    }
                    console.log(`[ProcessingQueue] gender: +${added} new, boosted ${boosted}`)
                  }
                }
              } catch (err) {
                console.warn('[ProcessingQueue] Gender classification failed:', err)
              }

              // Step -1.77: MoveNet pose detection. Emits performer-count
              // priors (solo / couple / threesome / group) + body
              // orientation tags (standing / lying down / kneeling /
              // sitting) when the MoveNet ONNX is on disk. Cross-model
              // agreement with Tier 2 boosts confidence; novel tags
              // get added as low-confidence priors that the calibration
              // pipeline filters.
              try {
                if (isPoseDetectorAvailable() && frames.length > 0) {
                  const posePriors = await detectPoseAcrossFrames(frames.map((f) => f.path))
                  if (posePriors.length > 0) {
                    let added = 0
                    let boosted = 0
                    for (const p of posePriors) {
                      const lower = p.name.toLowerCase()
                      const existing = tier2Result.richTags.find((t) => t.name.toLowerCase() === lower)
                      if (existing) {
                        const newConf = Math.min(1, existing.confidence + 0.08)
                        if (newConf > existing.confidence) {
                          existing.confidence = newConf
                          boosted++
                        }
                      } else {
                        // performer-count tags route to 'context'
                        // (matches Vault's existing taxonomy); body
                        // orientation routes to 'position'.
                        const isCount = /^(solo|couple|two people|threesome|group)$/i.test(p.name)
                        tier2Result.richTags.push({
                          name: p.name,
                          confidence: p.confidence,
                          source: isCount ? 'context' : 'position',
                          frameCount: 1,
                          totalFrames: 1,
                        })
                        added++
                      }
                    }
                    console.log(`[ProcessingQueue] pose: +${added} new, boosted ${boosted}`)
                  }
                }
              } catch (err) {
                console.warn('[ProcessingQueue] Pose detection failed:', err)
              }

              // Step -1.768: Deepfake + AI-image detectors. Both are
              // optional ONNX models with the same "drop at userData/
              // models/" install pattern. Fires only when the model
              // file is present — silent no-op otherwise. Tags routed
              // to source: 'context' so the calibration pipeline sees
              // a coherent source signal.
              try {
                const { isDeepfakeDetectorAvailable, deepfakeTagPriorsForFrame } =
                  await import('./deepfake-detector')
                if (isDeepfakeDetectorAvailable() && perFrameFaces.length > 0 && frames.length > 0) {
                  // Per-frame call; aggregate across frames by taking
                  // the highest confidence emitted. One unambiguous fake
                  // face in a multi-frame batch is enough signal.
                  const aiSettingsDF = (await import('../../settings')).getSettings().ai as any
                  const dfThreshold = typeof aiSettingsDF?.deepfakeThreshold === 'number'
                    ? Math.max(0, Math.min(1, aiSettingsDF.deepfakeThreshold))
                    : undefined
                  const aggregated = new Map<string, number>()
                  for (let fi = 0; fi < frames.length; fi++) {
                    const entry = perFrameFaces[fi]
                    const faces = entry?.faces ?? []
                    if (faces.length === 0) continue
                    const priors = await deepfakeTagPriorsForFrame(
                      frames[fi].path, faces,
                      dfThreshold !== undefined ? { threshold: dfThreshold } : undefined,
                    )
                    for (const p of priors) {
                      const cur = aggregated.get(p.name) ?? 0
                      if (p.confidence > cur) aggregated.set(p.name, p.confidence)
                    }
                  }
                  for (const [name, conf] of aggregated) {
                    const existing = tier2Result.richTags.find((t) => t.name.toLowerCase() === name.toLowerCase())
                    if (existing) {
                      existing.confidence = Math.min(1, Math.max(existing.confidence, conf))
                    } else {
                      tier2Result.richTags.push({
                        name, confidence: conf, source: 'context',
                        frameCount: 1, totalFrames: 1,
                      })
                    }
                  }
                  if (aggregated.size > 0) {
                    console.log(`[ProcessingQueue] deepfake: +${aggregated.size} priors (max ${Math.max(...aggregated.values()).toFixed(2)})`)
                  }
                }
              } catch (err) {
                console.warn('[ProcessingQueue] Deepfake detector failed:', err)
              }

              try {
                const { isAiImageDetectorAvailable, aiImageTagPriorsForFrames } =
                  await import('./ai-image-detector')
                if (isAiImageDetectorAvailable() && frames.length > 0) {
                  const aiSettingsAI = (await import('../../settings')).getSettings().ai as any
                  const aiThreshold = typeof aiSettingsAI?.aiImageThreshold === 'number'
                    ? Math.max(0, Math.min(1, aiSettingsAI.aiImageThreshold))
                    : undefined
                  const priors = await aiImageTagPriorsForFrames(
                    frames.map((f) => f.path),
                    aiThreshold !== undefined ? { threshold: aiThreshold } : undefined,
                  )
                  for (const p of priors) {
                    const existing = tier2Result.richTags.find((t) => t.name.toLowerCase() === p.name.toLowerCase())
                    if (existing) {
                      existing.confidence = Math.min(1, Math.max(existing.confidence, p.confidence))
                    } else {
                      tier2Result.richTags.push({
                        name: p.name, confidence: p.confidence, source: 'context',
                        frameCount: 1, totalFrames: 1,
                      })
                    }
                  }
                  if (priors.length > 0) {
                    console.log(`[ProcessingQueue] ai-image: +${priors.length} priors (median ${priors[0].confidence.toFixed(2)})`)
                  }
                }
              } catch (err) {
                console.warn('[ProcessingQueue] AI image detector failed:', err)
              }

              // Step -1.765: Person ReID body-feature extraction.
              // For each high-confidence MoveNet pose, crop the body
              // and extract a 768-D embedding. Stored in body_embeddings
              // with a face_cluster_id back-link when a face was detected
              // in the same frame (face inherits to body). Future:
              // standalone body clustering for face-occluded videos.
              try {
                if (isPersonReidAvailable() && isPoseDetectorAvailable() && frames.length > 0) {
                  const sampleFrames = frames.slice(0, 6)
                  // Map: frameIdx → face cluster IDs found in that frame.
                  // Built from perFrameFaces + sface cluster assignments.
                  const frameToFaceClusterId = new Map<number, string>()
                  // The SFace step earlier stored cluster IDs in
                  // face_embeddings, keyed by media_id. We can look up
                  // by media_id + frame_idx to get the cluster.
                  try {
                    const faceRows: Array<{ frame_idx: number; cluster_id: string | null }> =
                      this.rawDb.prepare(
                        `SELECT frame_idx, cluster_id FROM face_embeddings WHERE media_id = ?`
                      ).all(item.mediaId) as any
                    for (const fr of faceRows) {
                      if (fr.cluster_id && !frameToFaceClusterId.has(fr.frame_idx)) {
                        frameToFaceClusterId.set(fr.frame_idx, fr.cluster_id)
                      }
                    }
                  } catch { /* face_embeddings table may not exist for old DBs */ }

                  let bodiesExtracted = 0
                  let bodiesLinked = 0
                  for (let fi = 0; fi < sampleFrames.length; fi++) {
                    const r = await detectPose(sampleFrames[fi].path)
                    if (!r) continue
                    for (const pose of r.detections) {
                      if (pose.score < 0.4) continue
                      const emb = await extractBodyEmbedding(sampleFrames[fi].path, pose)
                      if (!emb) continue
                      bodiesExtracted++
                      const linkedClusterId = frameToFaceClusterId.get(fi) ?? null
                      if (linkedClusterId) bodiesLinked++
                      try {
                        this.rawDb.prepare(`
                          INSERT INTO body_embeddings
                            (id, media_id, face_cluster_id, frame_idx, bbox, embedding_b64, detection_score, created_at)
                          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                        `).run(
                          bodyNanoid(), item.mediaId, linkedClusterId, fi,
                          JSON.stringify(pose.bbox), bodyEmbToB64(emb),
                          pose.score, Date.now()
                        )
                      } catch (err) {
                        console.warn('[PersonReID] insert failed:', err)
                      }
                    }
                  }
                  console.log(`[ProcessingQueue] reid: ${bodiesExtracted} bodies extracted, ${bodiesLinked} linked to face clusters`)
                }
              } catch (err) {
                console.warn('[ProcessingQueue] Person ReID failed:', err)
              }

              // Step -1.78: whisper.cpp transcription priors. Slow
              // (10-30s on tiny.en) — only fires when both: (a) the
              // whisper-cpp install is present on disk AND (b) the
              // user opted in via settings.ai.whisperEnabled. Audio
              // contentType acts as a cheap pre-filter: skip silent /
              // music-only videos where transcription wastes cycles.
              try {
                const aiSettings = (await import('../../settings')).getSettings().ai as any
                const whisperEnabled = !!aiSettings?.whisperEnabled
                const audioWorthwhile = !audioFingerprint
                  || (audioFingerprint.contentType !== 'silent'
                      && audioFingerprint.contentType !== 'music-only'
                      && audioFingerprint.channels > 0)
                if (whisperEnabled && audioWorthwhile && findWhisperInstall()) {
                  // (#249) Prefer WhisperX sidecar when it's running —
                  // word-level + speaker-diarized transcript instead of
                  // whisper.cpp's flat text. Falls through to whisper.cpp
                  // when WhisperX isn't reachable, so this is purely an
                  // upgrade path with no regression risk.
                  let transcript: { text: string; durationMs: number } | null = null
                  try {
                    const { isWhisperXReady, whisperxTranscribe } = await import('./whisperx-launcher')
                    if (isWhisperXReady()) {
                      const segments = await whisperxTranscribe(media.path)
                      if (segments && segments.length > 0) {
                        const joined = segments.map((s: any) => s.text).filter(Boolean).join(' ').trim()
                        if (joined) transcript = { text: joined, durationMs: 0 }
                      }
                    }
                  } catch (err) {
                    console.warn('[ProcessingQueue] WhisperX failed, falling back to whisper.cpp:', err)
                  }
                  if (!transcript) {
                    transcript = await transcribeAudio(
                      media.path,
                      this.frameExtractor.getFfmpegPath(),
                      { maxAudioSec: 90, timeoutMs: 120_000 }
                    )
                  }
                  if (transcript?.text) {
                    console.log(`[ProcessingQueue] Whisper (${transcript.durationMs}ms): "${transcript.text.slice(0, 80)}…"`)
                    // Persist transcript for full-text search (FTS5).
                    // Lets the user later search "find the video where
                    // she said X" across the library. Wrapped in
                    // try/catch because old DBs may not have the
                    // media_transcripts table yet — startup migration
                    // creates it, but during a dev hot-reload the
                    // migration might not have run.
                    try {
                      this.rawDb.prepare(`
                        INSERT INTO media_transcripts (media_id, text, language, source)
                        VALUES (?, ?, ?, 'whisper')
                        ON CONFLICT(media_id) DO UPDATE SET
                          text = excluded.text,
                          language = excluded.language,
                          source = 'whisper',
                          created_at = strftime('%s', 'now')
                      `).run(item.mediaId, transcript.text, 'en')
                    } catch (err) {
                      console.warn('[ProcessingQueue] transcript persist failed (table may not exist yet):', err)
                    }
                    const wPriors = transcriptToTagPriors(transcript.text)
                    if (wPriors.length > 0) {
                      let added = 0
                      let boosted = 0
                      for (const p of wPriors) {
                        const lower = p.name.toLowerCase()
                        const existing = tier2Result.richTags.find((t) => t.name.toLowerCase() === lower)
                        if (existing) {
                          const newConf = Math.min(1, existing.confidence + 0.1)
                          if (newConf > existing.confidence) {
                            existing.confidence = newConf
                            boosted++
                          }
                        } else {
                          // Source classification: positions get
                          // 'position', acts get 'action', dirty
                          // talk / character get 'context'. Falls
                          // through to 'other' for the catch-all.
                          const positionTags = /^(doggystyle|missionary|cowgirl|reverse cowgirl)$/i
                          const actionTags = /^(blowjob|cunnilingus|handjob|titjob|rimming|footjob|orgasm|cumshot|creampie)$/i
                          tier2Result.richTags.push({
                            name: p.name,
                            confidence: p.confidence,
                            source: positionTags.test(p.name) ? 'position'
                              : actionTags.test(p.name) ? 'action'
                              : 'context',
                            frameCount: 1,
                            totalFrames: 1,
                          })
                          added++
                        }
                      }
                      console.log(`[ProcessingQueue] transcript: +${added} new, boosted ${boosted}`)
                    }
                  }
                }
              } catch (err) {
                console.warn('[ProcessingQueue] Whisper transcription failed (continuing):', err)
              }

              // Step -1.755: audio BPM/rhythm priors. Autocorrelation
              // on the audio envelope to detect tempo. Steady beats →
              // "fast paced" / "medium tempo" / "slow" + "rhythmic"
              // tag (strong PMV/HMV signal). Pure DSP — no model.
              // Runs only when audio is present and content type isn't
              // 'silent' (no point processing silence).
              try {
                if (audioFingerprint && audioFingerprint.channels > 0
                    && audioFingerprint.contentType !== 'silent'
                    && audioFingerprint.contentType !== 'mostly-silent') {
                  const bpm = await estimateBpm(
                    media.path,
                    this.frameExtractor.getFfmpegPath(),
                    { maxAudioSec: 60, timeoutMs: 30_000 }
                  )
                  if (bpm.bpm !== null) {
                    console.log(`[ProcessingQueue] BPM: ${bpm.bpm.toFixed(1)} (clarity ${bpm.rhythmClarity.toFixed(2)})`)
                    const bpmPriors = bpmToTagPriors(bpm)
                    if (bpmPriors.length > 0) {
                      let added = 0
                      let boosted = 0
                      for (const p of bpmPriors) {
                        const lower = p.name.toLowerCase()
                        const existing = tier2Result.richTags.find((t) => t.name.toLowerCase() === lower)
                        if (existing) {
                          const newConf = Math.min(1, existing.confidence + 0.08)
                          if (newConf > existing.confidence) {
                            existing.confidence = newConf
                            boosted++
                          }
                        } else {
                          tier2Result.richTags.push({
                            name: p.name,
                            confidence: p.confidence,
                            source: 'context',
                            frameCount: 1,
                            totalFrames: 1,
                          })
                          added++
                        }
                      }
                      console.log(`[ProcessingQueue] bpm: +${added} new, boosted ${boosted}`)
                    }
                  }
                }
              } catch (err) {
                console.warn('[ProcessingQueue] BPM estimation failed:', err)
              }

              // Step -1.76: audio-fingerprint priors. The FFmpeg
              // analysis already ran before Tier 2 (its block was
              // injected into Venice's prompt). Now also turn the
              // fingerprint into direct rich_tag priors — closes the
              // loop so calibration sees the audio signal as a first-
              // class source rather than relying on Venice to echo
              // what the prompt told it. Same cross-model agreement
              // logic as miles-deep / pose.
              try {
                if (audioFingerprint) {
                  const audioPriors = audioFingerprintToTagPriors(audioFingerprint)
                  if (audioPriors.length > 0) {
                    let added = 0
                    let boosted = 0
                    for (const p of audioPriors) {
                      const lower = p.name.toLowerCase()
                      const existing = tier2Result.richTags.find((t) => t.name.toLowerCase() === lower)
                      if (existing) {
                        const newConf = Math.min(1, existing.confidence + 0.08)
                        if (newConf > existing.confidence) {
                          existing.confidence = newConf
                          boosted++
                        }
                      } else {
                        // Most audio-derived tags fit Vault's 'context'
                        // bucket (silent/loud/intense/pmv/quiet/vocal).
                        // No tag here naturally lives under position
                        // or performer, so the single mapping is fine.
                        tier2Result.richTags.push({
                          name: p.name,
                          confidence: p.confidence,
                          source: 'context',
                          frameCount: 1,
                          totalFrames: 1,
                        })
                        added++
                      }
                    }
                    console.log(`[ProcessingQueue] audio: +${added} new, boosted ${boosted}`)
                  }
                }
              } catch (err) {
                console.warn('[ProcessingQueue] Audio prior emission failed:', err)
              }

              // Step -1.74: filename ML classifier — learned from the
              // user's approved-media history. Fires only after enough
              // training data accumulated (≥10 approved items).
              // Bag-of-tokens posterior P(tag|token). Output capped at
              // 0.7 confidence so Tier 2 still has the last word.
              try {
                const fnPriors = predictTagsForFilename(media.filename)
                if (fnPriors.length > 0) {
                  let added = 0
                  let boosted = 0
                  for (const p of fnPriors) {
                    const lower = p.name.toLowerCase()
                    const existing = tier2Result.richTags.find((t) => t.name.toLowerCase() === lower)
                    if (existing) {
                      const newConf = Math.min(1, existing.confidence + 0.08)
                      if (newConf > existing.confidence) {
                        existing.confidence = newConf
                        boosted++
                      }
                    } else {
                      tier2Result.richTags.push({
                        name: p.name,
                        confidence: p.confidence,
                        source: 'context',
                        frameCount: 1,
                        totalFrames: 1,
                      })
                      added++
                    }
                  }
                  console.log(`[ProcessingQueue] filename-ml: +${added} new, boosted ${boosted}`)
                }
              } catch (err) {
                console.warn('[ProcessingQueue] Filename classifier failed:', err)
              }

              // Step -1.75: domain detection from filename. Pulls site
              // names out of filenames like "brazzers_2024_xxx.mp4" or
              // "https://onlyfans.com/foo.mp4" via the porn-domains
              // curated stem list. Direct emit because filename text
              // detection has no ambiguity.
              try {
                const domainMatches = detectDomains(media.path)
                if (domainMatches.length > 0) {
                  const existingNames = new Set(tier2Result.richTags.map((t) => t.name.toLowerCase()))
                  for (const m of domainMatches) {
                    if (!existingNames.has(m.label.toLowerCase())) {
                      tier2Result.richTags.push({
                        name: m.label,
                        confidence: 0.95,
                        source: 'context',
                        frameCount: 1,
                        totalFrames: 1,
                      })
                    }
                  }
                  console.log(`[ProcessingQueue] Domain detection: [${domainMatches.map((m) => m.label).join(', ')}]`)
                }
              } catch (err) {
                console.warn('[ProcessingQueue] Domain detection failed:', err)
              }

              // Step -1.5: media-metadata priors (vertical video, low
              // light, outdoor, screen-recording, etc.) — direct emit
              // at high confidence because these are derived from
              // unambiguous pixel/EXIF observations, not LLM inference.
              if (metadataPriorTags.length > 0) {
                const existingNames = new Set(tier2Result.richTags.map((t) => t.name.toLowerCase()))
                for (const tag of metadataPriorTags) {
                  if (!existingNames.has(tag.toLowerCase())) {
                    tier2Result.richTags.push({
                      name: tag,
                      confidence: 0.9,
                      source: 'context',
                      frameCount: 1,
                      totalFrames: 1,
                    })
                  }
                }
              }

              // Step -1.25: per-folder priors. If the new item is in a
              // folder where the user has already approved 3+ items
              // sharing the same tags (e.g. ~/Solos/), boost those
              // tags' confidence on this item. Frequency-weighted.
              try {
                const folderPriors = priorsForMediaPath(this.rawDb, media.path)
                if (folderPriors.length > 0) {
                  const existingNames = new Set(tier2Result.richTags.map((t) => t.name.toLowerCase()))
                  let boosted = 0
                  for (const p of folderPriors) {
                    const lower = p.name.toLowerCase()
                    if (existingNames.has(lower)) {
                      // Already in tier2 output — boost confidence
                      // proportional to folder frequency.
                      const tag = tier2Result.richTags.find((t) => t.name.toLowerCase() === lower)
                      if (tag) {
                        const boost = (p.frequency - 0.5) * 0.2  // up to +0.1 for tags in 100% of folder items
                        tag.confidence = Math.min(1, tag.confidence + Math.max(0, boost))
                        boosted++
                      }
                    } else if (p.frequency >= 0.85) {
                      // Folder-consistent tag the AI missed — add at
                      // medium confidence. Conservative because folder
                      // organization isn't perfect.
                      tier2Result.richTags.push({
                        name: p.name,
                        confidence: 0.6,
                        source: 'context',
                        frameCount: 1,
                        totalFrames: 1,
                      })
                    }
                  }
                  if (boosted > 0) {
                    console.log(`[ProcessingQueue] Folder priors boosted ${boosted} tag confidences from "${media.path.split(/[/\\]/).slice(-2, -1)[0]}/"`)
                  }
                }
              } catch (err) {
                console.warn('[ProcessingQueue] Folder priors lookup failed:', err)
              }

              // Step -1: merge similar-approved priors. Tags that appear
              // in BOTH Venice's output AND the similar-approved set get
              // a confidence boost; tags ONLY in the prior set are added
              // at reduced confidence (since Venice didn't see them this
              // run, they could be wrong, but the user's prior approvals
              // give them some weight). Independent vote that compounds
              // with every approval the user makes.
              if (similarApprovedExamples.length > 0) {
                const { SimilarityEngine } = await import('./similarity-engine')
                const priors = SimilarityEngine.buildPriorsFromSimilar(similarApprovedExamples)
                const existingByName = new Map(tier2Result.richTags.map((t) => [t.name.toLowerCase(), t]))
                let boosted = 0
                let added = 0
                const merged = [...tier2Result.richTags]
                for (const p of priors) {
                  const cur = existingByName.get(p.name.toLowerCase())
                  if (cur) {
                    // Both Venice + priors agree — bump confidence,
                    // capped at 1.0. Scale by how many similar items
                    // emitted this tag (3 matches > 1 match).
                    const matchScale = Math.min(0.15, 0.05 * p.matchCount)
                    const newConf = Math.min(1, cur.confidence + matchScale)
                    if (newConf > cur.confidence) {
                      cur.confidence = newConf
                      boosted++
                    }
                  } else if (p.confidence >= 0.4) {
                    // Prior-only — add at prior confidence × 0.85 (slight
                    // haircut since Venice didn't see it). Only add tags
                    // with reasonable prior signal — don't pollute the
                    // set with weak associations.
                    merged.push({
                      name: p.name,
                      confidence: p.confidence * 0.85,
                      source: (p.source as any) ?? 'other',
                      frameCount: 1,
                      totalFrames: 1,
                    })
                    added++
                  }
                }
                if (boosted > 0 || added > 0) {
                  console.log(`[ProcessingQueue] Similar-approved priors: boosted ${boosted}, added ${added}`)
                }
                tier2Result = { ...tier2Result, richTags: merged }
              }

              // Step 0: mine the description for additional canonical-tag
              // mentions. User feedback 2026-05-12 — "descriptions are
              // mostly correct, tags should be using descriptions as
              // well." We extract canonical tag names mentioned in the
              // narrative text and add any NEW ones to the rich_tags
              // set with conservative confidence. Tags that ALREADY
              // exist in rich_tags get a +0.08 cross-source agreement
              // boost (Tier 2 vision saw them in the frame AND the
              // description named them — strong signal).
              const existingNames = new Set(tier2Result.richTags.map((t) => t.name.toLowerCase()))
              const descResult = extractTagsFromDescription(tier2Result.description, existingNames)
              if (descResult.derivedTags.length > 0 || descResult.reinforcedNames.size > 0) {
                console.log(`[ProcessingQueue] Description mined ${descResult.derivedTags.length} new + ${descResult.reinforcedNames.size} reinforcing tags`)
              }
              const richTagsWithDesc = [
                ...tier2Result.richTags.map((t) =>
                  descResult.reinforcedNames.has(t.name.toLowerCase())
                    ? { ...t, confidence: Math.min(1, t.confidence + 0.08) }
                    : t
                ),
                ...descResult.derivedTags,
              ]
              tier2Result = { ...tier2Result, richTags: richTagsWithDesc }

              // Step 1: drop anything in the user's protected list. The
              // protected list is a do-not-suggest signal — these are
              // tags the user has explicitly said "stop showing me this".
              // Filtering at source means they never reach the review UI
              // OR the auto-apply path, instead of relying on per-call
              // rejection hints.
              let protectedSet = new Set<string>()
              try {
                const settings = getSettings() as any
                protectedSet = new Set<string>(
                  (settings?.ai?.protectedTags ?? []).map((s: string) => String(s).toLowerCase().trim()).filter(Boolean)
                )
              } catch { /* settings unavailable — proceed without filter */ }

              const beforeCount = tier2Result.richTags.length
              const afterProtected = protectedSet.size > 0
                ? tier2Result.richTags.filter((t) => !protectedSet.has(t.name.toLowerCase()))
                : tier2Result.richTags
              if (beforeCount !== afterProtected.length) {
                console.log(`[ProcessingQueue] Filtered ${beforeCount - afterProtected.length} protected tag(s) from Tier 2 output`)
              }

              // Step 2: cross-model agreement bonus. If Tier 1 ONNX also
              // flagged this tag, that's an independent vote — bump 0.07
              // (capped at 1.0). Conservative enough not to flip a
              // low-confidence tag into auto-apply territory by itself,
              // but enough to nudge borderline tags above the user's
              // threshold when both tiers concur.
              const tier1TagNames = new Set(
                tier1Result.tags.map((t) => String(t.label).toLowerCase().trim())
              )
              const TIER_AGREEMENT_BONUS = 0.07
              const boostedRichTags = afterProtected.map((t) => {
                if (tier1TagNames.has(t.name.toLowerCase())) {
                  return { ...t, confidence: Math.min(1, t.confidence + TIER_AGREEMENT_BONUS) }
                }
                return t
              })

              // Step 3: apply calibration. Tags the user keeps rejecting
              // get scaled down; tags they consistently approve get scaled
              // up. Unseen tags pass through.
              const calibrated = getCalibrationService({ raw: this.rawDb } as DB).calibrateAll(boostedRichTags)
              const moved = calibrated.filter((t: any, i: number) =>
                Math.abs(t.confidence - boostedRichTags[i].confidence) > 0.001
              ).length
              if (moved > 0) {
                console.log(`[ProcessingQueue] Calibration adjusted ${moved}/${calibrated.length} tag confidences`)
              }

              // Step 4: mutual-exclusion sanity pass. Drops contradictory
              // tags the LLM hallucinates (group on solo videos, lingerie
              // on nude videos, etc.) AND filters out vocabulary the user
              // explicitly told us not to emit (vaginal sex / fellatio).
              // Codified in tag-exclusion-rules.ts so the queue stays
              // orchestration-only.
              const exclusion = applyExclusionRules(calibrated)
              if (exclusion.dropped.length > 0) {
                console.log(`[ProcessingQueue] Dropped ${exclusion.dropped.length} contradictory tag(s): ` +
                  exclusion.dropped.slice(0, 8).map((d) => `${d.tag.name} (${d.reason})`).join('; '))
              }
              tier2Result = { ...tier2Result, richTags: exclusion.kept }
            } catch (err) {
              console.warn('[ProcessingQueue] Calibration/agreement boost failed (continuing):', err)
            }
          }

          if (tier2Result) {
            console.log(`[ProcessingQueue] Tier 2 result:`, {
              title: tier2Result.title,
              tags: tier2Result.additionalTags.length,
              description: tier2Result.description?.slice(0, 50),
            })
          }

          this.rawDb.prepare(`
            UPDATE ai_processing_queue SET tier2_done = 1 WHERE id = ?
          `).run(item.id)
        } catch (err: any) {
          console.error(`[ProcessingQueue] Tier 2 failed for ${item.mediaId}:`, err)
          // Surface Venice-specific failures to the renderer so the UI
          // can show "rate limited — retry in 60s" with a countdown.
          // User explicitly asked 2026-05-12: NO local-LLM fallback —
          // just a clear error + retry timer.
          if (err && (err.code === 'VENICE_RATE_LIMITED' || err.code === 'VENICE_UNREACHABLE' || err.code === 'VENICE_AUTH_FAILED' || err.code === 'VENICE_API_ERROR')) {
            // Pause the queue so we don't pile up failed items on a
            // dead/rate-limited endpoint.
            this.isPaused = true
            this.sendStatus('paused')
            this.mainWindow?.webContents.send('ai:venice-error', {
              code: err.code,
              message: err.message,
              retryAfterSec: err.retryAfterSec ?? null,
              httpStatus: err.httpStatus ?? null,
              mediaId: item.mediaId,
            })
            console.warn(`[ProcessingQueue] Pausing queue due to Venice ${err.code} (retry after ${err.retryAfterSec ?? '?'}s)`)
          }
          // Continue without Tier 2
        }
      } else {
        console.log(`[ProcessingQueue] Skipping Tier 2 - enabled: ${this.enableTier2}, configured: ${this.tier2Vision.isEnabled()}`)
      }

      // Run Tier 3 matching. User feedback 2026-05-12: Tier 1 (ONNX WD
      // Tagger + NudeNet + CLIP) is suspected of contributing noisy
      // booru-style tags ("looking at viewer", "indoors", body-part
      // labels) that pollute the picker. Setting
      // settings.ai.disableTier1Tags hides Tier 1 tags from Tier 3 input
      // — content classification (NSFW category) still runs because that
      // gates the auto-categorize logic.
      let tier1TagsForMatch = tier1Result.tags
      try {
        const settings = getSettings() as any
        if (settings?.ai?.disableTier1Tags) {
          if (tier1Result.tags.length > 0) {
            console.log(`[ProcessingQueue] Suppressing ${tier1Result.tags.length} Tier 1 tag(s) from Tier 3 input (user disabled)`)
          }
          tier1TagsForMatch = []
        }
      } catch { /* fall through with default */ }

      this.sendProgress(item.mediaId, 'tier3', STAGE.tier3Start)
      const tier3Result = this.tier3Matcher.match(
        tier1TagsForMatch,
        tier2Result?.additionalTags
      )
      this.sendProgress(item.mediaId, 'tier3', STAGE.tier3End)

      // Store results
      this.sendProgress(item.mediaId, 'storing', STAGE.storeStart)
      this.storeResults(item.mediaId, tier1Result, tier2Result, tier3Result)

      // Refresh the AI similarity vector for this media so the "More like this"
      // panel reflects the new rich_tags immediately.
      try {
        getSimilarityEngine({ raw: this.rawDb } as DB).updateOne(item.mediaId)
      } catch (err) {
        // Non-fatal — the engine will rebuild from disk on next query.
      }

      // Generate contact sheet (YAPO-style 4×3 thumbnail grid) for the
      // review UI. Fire-and-forget — doesn't block the queue. Only for
      // videos with frames available.
      if (mediaType === 'video' && frames.length > 0) {
        void generateContactSheet(
          media.path,
          this.frameExtractor.getFfmpegPath(),
          item.mediaId,
          { durationSec: (media as any).durationSec ?? null }
        ).then((sheetPath) => {
          if (sheetPath) {
            console.log(`[ProcessingQueue] Contact sheet → ${path.basename(sheetPath)}`)
          }
        }).catch(() => { /* non-fatal */ })
      }

      // Record this batch of rich tags as samples for the calibration service.
      // Future predictions for the same tag/source pairs blend toward this
      // running mean, and approvals/rejections in the review queue further
      // shape future confidence values.
      if (tier2Result?.richTags && tier2Result.richTags.length > 0) {
        try {
          getCalibrationService({ raw: this.rawDb } as DB).recordSamples(tier2Result.richTags)
        } catch (err) {
          console.warn('[ProcessingQueue] Calibration recordSamples failed:', err)
        }
      }

      // Auto-categorize: apply high-confidence tags without review when threshold > 0.
      if (this.autoApproveThreshold > 0) {
        try {
          this.autoApplyHighConfidence(item.mediaId, this.autoApproveThreshold, tier3Result, tier2Result)
        } catch (err) {
          console.warn('[ProcessingQueue] Auto-apply failed (continuing):', err)
        }
      }

      // Clean up THIS item's frame dir only — cleanupAll() was nuking
      // subsequent items' frames mid-analysis (caused [Tier2] "Frame not
      // found" + zero-tag review entries). The 500ms delay still gives
      // Windows time to release the file handle before the unlink.
      const itemFrameDir = frames.length > 0 ? path.dirname(frames[0].path) : null
      setTimeout(() => {
        try {
          if (itemFrameDir) this.frameExtractor.cleanupDir(itemFrameDir)
        } catch (e) {
          // Ignore cleanup errors
        }
      }, 500)

      // Mark as completed
      this.rawDb.prepare(`
        UPDATE ai_processing_queue
        SET status = 'completed', completed_at = datetime('now')
        WHERE id = ?
      `).run(item.id)

      const processingTime = Date.now() - startTime
      this.sendProgress(item.mediaId, 'completed', 100, { processingTime })
      this.emitQueueProgress()

    } catch (err) {
      const errMessage = err instanceof Error ? err.message : String(err)
      console.error(`[ProcessingQueue] Failed to process ${item.mediaId}:`, err)
      errorLogger.error('ProcessingQueue', `Failed to process media ${item.mediaId}`, err as Error, {
        mediaId: item.mediaId,
        queueItemId: item.id
      })

      this.rawDb.prepare(`
        UPDATE ai_processing_queue
        SET status = 'failed', error = ?, completed_at = datetime('now')
        WHERE id = ?
      `).run(errMessage, item.id)

      this.sendProgress(item.mediaId, 'failed', 0, { error: errMessage })
    }

    this.currentMediaId = null
  }

  private getMediaType(dbType: string, filename: string): 'video' | 'image' | 'gif' {
    const ext = filename.toLowerCase().split('.').pop()

    if (ext === 'gif') return 'gif'
    if (dbType === 'video' || ['mp4', 'webm', 'mov', 'avi', 'mkv'].includes(ext || '')) {
      return 'video'
    }
    return 'image'
  }

  private storeResults(
    mediaId: string,
    tier1: Tier1Result,
    tier2: Tier2Result | null,
    tier3: Tier3Result
  ): void {
    console.log(`[AI] Storing results for ${mediaId}:`, {
      tier1Tags: tier1.tags.length,
      tier2: tier2 ? { title: tier2.title, tags: tier2.additionalTags.length } : null,
      tier3: { matched: tier3.matchedTags.length, new: tier3.newTagSuggestions.length }
    })

    // Check if record exists
    const existing = this.rawDb.prepare(`
      SELECT id FROM ai_analysis_results WHERE media_id = ?
    `).get(mediaId)

    const suggestedFilename = tier2?.suggestedFilename ?? null
    const richTagsJson = tier2 && tier2.richTags.length ? JSON.stringify(tier2.richTags) : null

    if (existing) {
      console.log(`[AI] Updating existing record for ${mediaId}`)
      this.rawDb.prepare(`
        UPDATE ai_analysis_results SET
          nsfw_category = ?,
          nsfw_confidence = ?,
          tier1_raw_tags = ?,
          suggested_title = ?,
          description = ?,
          tier2_extra_tags = ?,
          attributes = ?,
          matched_tags = ?,
          new_tag_suggestions = ?,
          suggested_filename = ?,
          rich_tags = ?,
          review_status = 'pending',
          created_at = datetime('now')
        WHERE media_id = ?
      `).run(
        tier1.nsfwCategory,
        tier1.nsfwConfidence,
        JSON.stringify(tier1.tags),
        tier2?.title || null,
        tier2?.description || null,
        tier2 ? JSON.stringify(tier2.additionalTags) : null,
        tier2 ? JSON.stringify(tier2.attributes) : null,
        JSON.stringify(tier3.matchedTags),
        JSON.stringify(tier3.newTagSuggestions),
        suggestedFilename,
        richTagsJson,
        mediaId
      )
    } else {
      console.log(`[AI] Inserting new record for ${mediaId}`)
      this.rawDb.prepare(`
        INSERT INTO ai_analysis_results (
          media_id, nsfw_category, nsfw_confidence, tier1_raw_tags,
          suggested_title, description, tier2_extra_tags, attributes,
          matched_tags, new_tag_suggestions, suggested_filename, rich_tags, review_status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
      `).run(
        mediaId,
        tier1.nsfwCategory,
        tier1.nsfwConfidence,
        JSON.stringify(tier1.tags),
        tier2?.title || null,
        tier2?.description || null,
        tier2 ? JSON.stringify(tier2.additionalTags) : null,
        tier2 ? JSON.stringify(tier2.attributes) : null,
        JSON.stringify(tier3.matchedTags),
        JSON.stringify(tier3.newTagSuggestions),
        suggestedFilename,
        richTagsJson
      )
    }

    // Verify the record was stored
    const verification = this.rawDb.prepare(`
      SELECT review_status FROM ai_analysis_results WHERE media_id = ?
    `).get(mediaId) as { review_status: string } | undefined
    console.log(`[AI] Verification for ${mediaId}: status = ${verification?.review_status ?? 'NOT FOUND'}`)
  }

  /**
   * Auto-categorize: apply high-confidence tags directly to media_tags,
   * bypassing the review queue. Two sources contribute:
   *  1. Tier-3 matches (existing library tags)
   *  2. Tier-2 rich_tags (created on the fly if not yet in the library) —
   *     this prevents the empty-library trap where a fresh user with no manual
   *     tags would get 0 auto-applies even though Tier 2 produced great output.
   *
   * Threshold is capped at 0.95 server-side because Tier 2 confidences max
   * around there in practice — a "100%" UI slider should still apply tags.
   *
   * Mirrors content_analyzer/analyzer.py:auto_categorize.
   */
  private autoApplyHighConfidence(
    mediaId: string,
    threshold: number,
    tier3: Tier3Result,
    tier2: Tier2Result | null
  ): void {
    const effective = Math.min(0.95, Math.max(0, threshold))

    // Per-source threshold overrides. Different tag categories deserve
    // different floors — positions are visual + objective (0.5 OK),
    // performer tags are subjective (0.65), context can hallucinate (0.7).
    // User can override via settings.ai.perSourceThresholds.
    let sourceThresholds: Record<string, number> = {
      position: 0.5,
      action: 0.55,
      body: 0.6,
      performer: 0.65,
      intensity: 0.55,
      setting: 0.6,
      context: 0.7,
      other: 0.65,
    }
    try {
      const settings = getSettings() as any
      if (settings?.ai?.perSourceThresholds) {
        sourceThresholds = { ...sourceThresholds, ...settings.ai.perSourceThresholds }
      }
    } catch { /* fall through */ }
    // Per-tag threshold = max(global, per-source). The global threshold
    // is always the FLOOR — a high global threshold overrides loose
    // per-source values. Per-source can only raise an individual tag's
    // bar, never lower it.
    const thresholdFor = (source: string): number => {
      const s = sourceThresholds[source] ?? sourceThresholds.other ?? effective
      return Math.max(effective, s)
    }

    // Helper to look up a tag's source from tier2's richTags (for tier3
    // matches that came via Tier 2's rich tags).
    const sourceByName = new Map<string, string>()
    for (const t of tier2?.richTags ?? []) {
      sourceByName.set(t.name.toLowerCase(), t.source)
    }
    const sourceOf = (name: string): string => sourceByName.get(name.toLowerCase()) ?? 'other'

    const matchedHigh = tier3.matchedTags.filter((t) => (t.confidence ?? 0) >= thresholdFor(sourceOf(t.name)))
    const matchedLow = tier3.matchedTags.filter((t) => (t.confidence ?? 0) < thresholdFor(sourceOf(t.name)))
    const newHigh = tier3.newTagSuggestions.filter((s) => (s.confidence ?? 0) >= thresholdFor(sourceOf(s.name)))
    const newLow = tier3.newTagSuggestions.filter((s) => (s.confidence ?? 0) < thresholdFor(sourceOf(s.name)))

    // Tier 2 rich_tags above threshold that Tier 3 didn't already cover —
    // dedupe by name (case-insensitive) so we don't double-apply.
    const tier3CoveredNames = new Set<string>([
      ...tier3.matchedTags.map((t) => String(t.name).toLowerCase()),
      ...tier3.newTagSuggestions.map((s) => String(s.name).toLowerCase())
    ])
    const tier2Extra = (tier2?.richTags ?? []).filter((t) =>
      (t.confidence ?? 0) >= thresholdFor(t.source) &&
      !tier3CoveredNames.has(String(t.name).toLowerCase())
    )

    if (matchedHigh.length === 0 && newHigh.length === 0 && tier2Extra.length === 0) {
      // Nothing high enough — leave the entire result for manual review.
      return
    }

    // Apply high-confidence existing-tag matches.
    for (const tag of matchedHigh) {
      this.rawDb.prepare(
        `INSERT OR IGNORE INTO media_tags (mediaId, tagId) VALUES (?, ?)`
      ).run(mediaId, tag.id)
    }

    // Promote high-confidence new-tag suggestions into real tags + apply.
    let createdIds: string[] = []
    if (newHigh.length > 0) {
      try {
        createdIds = this.tier3Matcher.createNewTags(
          newHigh.map((s) => ({ name: s.name, confidence: s.confidence, reason: 'AI auto-applied' }))
        )
        for (const tagId of createdIds) {
          this.rawDb.prepare(
            `INSERT OR IGNORE INTO media_tags (mediaId, tagId) VALUES (?, ?)`
          ).run(mediaId, tagId)
        }
      } catch (err) {
        console.warn('[ProcessingQueue] createNewTags failed during auto-apply:', err)
      }
    }

    // Promote Tier 2 rich_tags that Tier 3 didn't already cover. This covers
    // the empty-library trap: a fresh user with no manual tags would otherwise
    // get matched=0 + new=0 even when Tier 2 produced 15 great rich_tags.
    let tier2CreatedIds: string[] = []
    if (tier2Extra.length > 0) {
      try {
        tier2CreatedIds = this.tier3Matcher.createNewTags(
          tier2Extra.map((t) => ({ name: t.name, confidence: t.confidence, reason: `Tier 2 ${t.source}` }))
        )
        for (const tagId of tier2CreatedIds) {
          this.rawDb.prepare(
            `INSERT OR IGNORE INTO media_tags (mediaId, tagId) VALUES (?, ?)`
          ).run(mediaId, tagId)
        }
      } catch (err) {
        console.warn('[ProcessingQueue] Tier 2 rich_tag promotion failed during auto-apply:', err)
      }
    }

    const totalApplied = matchedHigh.length + createdIds.length + tier2CreatedIds.length
    const allClear = matchedLow.length === 0 && newLow.length === 0

    if (allClear) {
      // Everything cleared the threshold — mark approved so it doesn't show in review.
      this.rawDb.prepare(`
        UPDATE ai_analysis_results
        SET review_status = 'approved',
            reviewed_at = datetime('now'),
            approved_tag_ids = ?
        WHERE media_id = ?
      `).run(
        JSON.stringify([...matchedHigh.map((t) => t.id), ...createdIds, ...tier2CreatedIds]),
        mediaId
      )
      console.log(`[AutoApply] ${mediaId}: all ${totalApplied} tags ≥ ${effective} — auto-approved`)
    } else {
      // Mixed — record stays pending for the user to review the low-confidence remainder,
      // but the high-confidence tags are already on the media.
      console.log(`[AutoApply] ${mediaId}: ${totalApplied} tags ≥ ${effective} auto-applied (matched ${matchedHigh.length}, new ${createdIds.length}, tier2-extra ${tier2CreatedIds.length}); ${matchedLow.length + newLow.length} below threshold left for review`)
    }
  }

  /**
   * Get list of items awaiting review. Pass `status` to filter to
   * 'pending' (default), 'approved', 'rejected', or 'all' so the
   * renderer can show an "Approved" tab where the user can re-edit
   * past decisions without losing the approval record.
   */
  getReviewList(opts0?: {
    limit?: number
    offset?: number
    status?: 'pending' | 'approved' | 'rejected' | 'all'
    sort?: 'newest' | 'uncertainty'
  }): { items: ReviewItem[]; total: number } {
    // Top-level retry: if any inner query trips "no such column" (stale
    // prepared-statement cache vs schema), force-ALTER the missing
    // columns + bust the cache via pragma, then re-enter the function
    // once.
    try {
      return this._getReviewListInner(opts0, '')
    } catch (err: any) {
      if (String(err?.message ?? '').includes('no such column')) {
        // First miss: open + cache a parallel connection. Subsequent calls
        // reuse this.freshReviewDb so we don't pay open/close on every poll
        // (the review panel polls every few seconds in some UIs).
        let freshDb: any = this.freshReviewDb
        const firstOpen = !freshDb
        if (firstOpen) {
          console.warn('[AI Review] primary connection schema-cache stale — opening parallel connection for review queries:', err.message)
        }
        try {
          if (firstOpen) {
            const Database = require('better-sqlite3')
            const { app } = require('electron')
            const dbPath = path.join(app.getPath('userData'), 'db', 'vault.sqlite3')
            console.log(`[AI Review] Fresh-conn opening: ${dbPath}`)
            freshDb = new Database(dbPath)
            freshDb.pragma('journal_mode = WAL')
            freshDb.pragma('busy_timeout = 5000')
            // One-time schema sanity log + belt-and-suspenders ALTER pass
            // for missing columns. Logs only on first open so steady-state
            // calls are silent. ALTERs are idempotent — failures (column
            // already exists) are expected and swallowed.
            try {
              const freshCols = freshDb.prepare(`PRAGMA table_info(ai_analysis_results)`).all() as Array<{ name: string }>
              const hasReview = freshCols.some((c: { name: string }) => c.name === 'review_status')
              console.log(`[AI Review] Fresh-conn sees ${freshCols.length} cols on ai_analysis_results, review_status=${hasReview}`)
            } catch (probeErr) {
              console.warn('[AI Review] Fresh-conn schema probe failed:', probeErr)
            }
            const repairCols: Array<[string, string]> = [
              ['review_status', `TEXT NOT NULL DEFAULT 'pending'`],
              ['rich_tags', `TEXT`],
              ['approved_tag_ids', `TEXT`],
              ['approved_title', `TEXT`],
              ['reviewed_at', `TEXT`],
              ['suggested_filename', `TEXT`],
              ['rejection_history', `TEXT`],
            ]
            for (const [name, def] of repairCols) {
              try { freshDb.exec(`ALTER TABLE ai_analysis_results ADD COLUMN ${name} ${def};`) }
              catch { /* already exists */ }
            }
            this.freshReviewDb = freshDb
          }
          // Direct minimal implementation against freshDb — skip the
          // full _getReviewListInner because something in that path
          // is using a different connection / cached compiled SQL.
          const status = opts0?.status ?? 'pending'
          const limit = opts0?.limit ?? 50
          const offset = opts0?.offset ?? 0
          const whereClause = status === 'all' ? '1=1' : `ar.review_status = '${status}'`

          const total = (freshDb.prepare(`
            SELECT COUNT(*) as count
            FROM ai_analysis_results ar
            INNER JOIN media m ON ar.media_id = m.id
            WHERE ${whereClause}
          `).get() as { count: number }).count

          const rows = freshDb.prepare(`
            SELECT
              ar.media_id,
              ar.suggested_title,
              ar.description,
              ar.matched_tags,
              ar.new_tag_suggestions,
              ar.nsfw_category,
              ar.nsfw_confidence,
              ar.review_status,
              ar.created_at,
              ar.suggested_filename,
              ar.rich_tags,
              ar.approved_tag_ids,
              ar.approved_title,
              m.filename,
              m.thumbPath
            FROM ai_analysis_results ar
            INNER JOIN media m ON ar.media_id = m.id
            WHERE ${whereClause}
            ORDER BY ar.created_at DESC
            LIMIT ? OFFSET ?
          `).all(limit, offset) as any[]

          // Shape rows into the ReviewItem shape the renderer expects.
          const items = rows.map((row) => {
            let matchedTags: any[] = []
            let newTagSuggestions: any[] = []
            let richTags: any[] = []
            let approvedTagIds: string[] = []
            try { if (row.matched_tags) matchedTags = JSON.parse(row.matched_tags) } catch { /* ignore */ }
            try { if (row.new_tag_suggestions) newTagSuggestions = JSON.parse(row.new_tag_suggestions) } catch { /* ignore */ }
            try { if (row.rich_tags) richTags = JSON.parse(row.rich_tags) } catch { /* ignore */ }
            try { if (row.approved_tag_ids) approvedTagIds = JSON.parse(row.approved_tag_ids) } catch { /* ignore */ }
            return {
              mediaId: row.media_id,
              filename: row.filename,
              thumbPath: row.thumbPath,
              suggestedTitle: row.suggested_title,
              description: row.description,
              matchedTags,
              newTagSuggestions,
              richTags,
              nsfwCategory: row.nsfw_category,
              nsfwConfidence: row.nsfw_confidence,
              reviewStatus: row.review_status,
              createdAt: row.created_at,
              suggestedFilename: row.suggested_filename,
              approvedTagIds,
              approvedTitle: row.approved_title,
            }
          })

          if (firstOpen) {
            console.log(`[AI Review] Fresh-conn direct response: ${items.length} items of ${total} total (subsequent calls silent)`)
          }
          return { items, total } as any
        } catch (freshErr) {
          // If the parallel connection itself fails, drop the cache so a
          // future call can try opening a new one.
          if (this.freshReviewDb === freshDb) {
            try { this.freshReviewDb?.close() } catch { /* ignore */ }
            this.freshReviewDb = null
          }
          throw freshErr
        }
      }
      throw err
    }
  }

  private _getReviewListInner(options?: {
    limit?: number
    offset?: number
    status?: 'pending' | 'approved' | 'rejected' | 'all'
    /** "uncertainty" sorts items so the ones where AI is least confident
     *  appear first. Each review on those items moves the calibration
     *  more than reviewing an obvious case would. "newest" is the
     *  legacy default (review queue in creation order). */
    sort?: 'newest' | 'uncertainty'
  }, sqlBust: string = ''): { items: ReviewItem[]; total: number } {
    const limit = options?.limit ?? 50
    const offset = options?.offset ?? 0
    const status = options?.status ?? 'pending'
    const sort = options?.sort ?? 'newest'

    // Schema-drift defensive repair — some users have older DBs where
    // the v8 CREATE TABLE never ran (review_status missing). The
    // migration framework's repair pass should have caught this on
    // startup, but in case of a transactional rollback or other edge
    // case, re-check here and ALTER if needed. Cheap one-time check
    // per call (PRAGMA is microseconds).
    try {
      const cols = this.rawDb.prepare(`PRAGMA table_info(ai_analysis_results)`).all() as Array<{ name: string }>
      if (!cols.some((c) => c.name === 'review_status')) {
        console.warn('[ProcessingQueue] review_status column missing despite migration — repairing inline')
        this.rawDb.exec(`ALTER TABLE ai_analysis_results ADD COLUMN review_status TEXT NOT NULL DEFAULT 'pending';`)
      }
      if (!cols.some((c) => c.name === 'rich_tags')) {
        this.rawDb.exec(`ALTER TABLE ai_analysis_results ADD COLUMN rich_tags TEXT;`)
      }
      if (!cols.some((c) => c.name === 'approved_tag_ids')) {
        this.rawDb.exec(`ALTER TABLE ai_analysis_results ADD COLUMN approved_tag_ids TEXT;`)
      }
      if (!cols.some((c) => c.name === 'approved_title')) {
        this.rawDb.exec(`ALTER TABLE ai_analysis_results ADD COLUMN approved_title TEXT;`)
      }
      if (!cols.some((c) => c.name === 'reviewed_at')) {
        this.rawDb.exec(`ALTER TABLE ai_analysis_results ADD COLUMN reviewed_at TEXT;`)
      }
      if (!cols.some((c) => c.name === 'suggested_filename')) {
        this.rawDb.exec(`ALTER TABLE ai_analysis_results ADD COLUMN suggested_filename TEXT;`)
      }
    } catch (err) {
      console.warn('[ProcessingQueue] inline schema check failed:', err)
    }

    // Build the WHERE clause based on requested status.
    const whereClause = status === 'all'
      ? '1=1'
      : `ar.review_status = '${status}'`

    // Bullet-proof retry: if the column is genuinely missing (e.g. cached
    // prepared statement from before a migration), recover by re-running
    // the schema repair and trying once more on a freshly-prepared
    // statement. Without this, the renderer just sees the error and
    // shows "No items pending review" forever.
    const runCount = (): number => {
      try {
        return (this.rawDb.prepare(`
          ${sqlBust}
          SELECT COUNT(*) as count
          FROM ai_analysis_results ar
          INNER JOIN media m ON ar.media_id = m.id
          WHERE ${whereClause}
        `).get() as { count: number }).count
      } catch (err: any) {
        if (String(err?.message ?? '').includes('no such column')) {
          console.warn('[AI Review] count query failed on missing column — repairing + retrying:', err.message)
          // Force ALL likely-missing columns and re-run on a fresh stmt.
          try { this.rawDb.exec(`ALTER TABLE ai_analysis_results ADD COLUMN review_status TEXT NOT NULL DEFAULT 'pending';`) } catch { /* already exists */ }
          try { this.rawDb.exec(`ALTER TABLE ai_analysis_results ADD COLUMN rich_tags TEXT;`) } catch { /* already exists */ }
          try { this.rawDb.exec(`ALTER TABLE ai_analysis_results ADD COLUMN approved_tag_ids TEXT;`) } catch { /* already exists */ }
          try { this.rawDb.exec(`ALTER TABLE ai_analysis_results ADD COLUMN approved_title TEXT;`) } catch { /* already exists */ }
          try { this.rawDb.exec(`ALTER TABLE ai_analysis_results ADD COLUMN reviewed_at TEXT;`) } catch { /* already exists */ }
          try { this.rawDb.exec(`ALTER TABLE ai_analysis_results ADD COLUMN suggested_filename TEXT;`) } catch { /* already exists */ }
          // Bust better-sqlite3's prepared-statement cache. Trick: a
          // no-op pragma write changes the schema_cookie which forces
          // re-prepare on next statement.
          this.rawDb.pragma('user_version = user_version')
          return (this.rawDb.prepare(`
            SELECT COUNT(*) as count
            FROM ai_analysis_results ar
            INNER JOIN media m ON ar.media_id = m.id
            WHERE ${whereClause}
          `).get() as { count: number }).count
        }
        throw err
      }
    }

    const total = runCount()

    if (status === 'pending') {
      // Also check for orphaned records (analysis results with no media).
      // Only run this when fetching pending — the cleanup deletes any
      // row missing a media join, which would clobber approved history
      // we want to preserve.
      const orphanedCount = (this.rawDb.prepare(`
        ${sqlBust}
        SELECT COUNT(*) as count
        FROM ai_analysis_results ar
        LEFT JOIN media m ON ar.media_id = m.id
        WHERE ar.review_status = 'pending' AND m.id IS NULL
      `).get() as { count: number }).count

      if (orphanedCount > 0) {
        console.log(`[AI Review] Warning: ${orphanedCount} orphaned analysis results (media deleted)`)
        // Clean up orphaned records
        this.rawDb.prepare(`
          ${sqlBust}
          DELETE FROM ai_analysis_results
          WHERE review_status = 'pending' AND media_id NOT IN (SELECT id FROM media)
        `).run()
      }
    }

    // Debug: Log raw counts
    const rawTotal = (this.rawDb.prepare(`
      ${sqlBust}
      SELECT COUNT(*) as count FROM ai_analysis_results WHERE ${whereClause}
    `).get() as { count: number }).count
    console.log(`[AI Review] Raw ${status} count: ${rawTotal}, Valid with media: ${total}`)

    // For uncertainty sort we over-fetch + re-rank in JS. Computing
    // tag-level uncertainty in pure SQL would require parsing the
    // rich_tags JSON column, which is a SQLite extension we don't
    // depend on. Over-fetch 3x and rank in memory is fine at our
    // library scale (low-thousands of rows).
    const overFetch = sort === 'uncertainty' ? Math.max(limit * 3, 150) : limit
    const orderClause = 'ORDER BY ar.created_at DESC'
    const rowsSql = `
      ${sqlBust}
      SELECT
        ar.media_id,
        ar.suggested_title,
        ar.description,
        ar.matched_tags,
        ar.new_tag_suggestions,
        ar.nsfw_category,
        ar.nsfw_confidence,
        ar.review_status,
        ar.created_at,
        ar.suggested_filename,
        ar.rich_tags,
        ar.approved_tag_ids,
        ar.approved_title,
        m.filename,
        m.thumbPath
      FROM ai_analysis_results ar
      INNER JOIN media m ON ar.media_id = m.id
      WHERE ${whereClause}
      ${orderClause}
      LIMIT ? OFFSET ?
    `
    let rows: any[]
    try {
      rows = this.rawDb.prepare(rowsSql).all(overFetch, sort === 'uncertainty' ? 0 : offset) as any[]
    } catch (err: any) {
      // Same retry path as the count above — if the column is genuinely
      // missing on this connection's view of the schema, ALTER + bust
      // the stmt cache + retry once.
      if (String(err?.message ?? '').includes('no such column')) {
        console.warn('[AI Review] rows query failed on missing column — repairing + retrying:', err.message)
        try { this.rawDb.exec(`ALTER TABLE ai_analysis_results ADD COLUMN review_status TEXT NOT NULL DEFAULT 'pending';`) } catch { /* exists */ }
        try { this.rawDb.exec(`ALTER TABLE ai_analysis_results ADD COLUMN rich_tags TEXT;`) } catch { /* exists */ }
        try { this.rawDb.exec(`ALTER TABLE ai_analysis_results ADD COLUMN approved_tag_ids TEXT;`) } catch { /* exists */ }
        try { this.rawDb.exec(`ALTER TABLE ai_analysis_results ADD COLUMN approved_title TEXT;`) } catch { /* exists */ }
        try { this.rawDb.exec(`ALTER TABLE ai_analysis_results ADD COLUMN reviewed_at TEXT;`) } catch { /* exists */ }
        try { this.rawDb.exec(`ALTER TABLE ai_analysis_results ADD COLUMN suggested_filename TEXT;`) } catch { /* exists */ }
        this.rawDb.pragma('user_version = user_version')
        rows = this.rawDb.prepare(rowsSql).all(overFetch, sort === 'uncertainty' ? 0 : offset) as any[]
      } else {
        throw err
      }
    }

    // Uncertainty re-rank. Score = how much the user's feedback on this
    // item would move calibration:
    //   - tags with confidence ~0.5 are most uncertain (highest score)
    //   - tags with high cross-frame disagreement add to score
    //   - tags with no calibration history yet weight more (we learn
    //     more from them than from tags we've already calibrated)
    if (sort === 'uncertainty') {
      const calibration = getCalibrationService({ raw: this.rawDb } as DB)
      const scored = rows.map((row: any) => {
        let tags: Array<{ name: string; confidence: number; source: string; frameCount?: number; totalFrames?: number }> = []
        try {
          if (row.rich_tags) {
            const parsed = JSON.parse(row.rich_tags)
            if (Array.isArray(parsed)) tags = parsed
          }
        } catch { /* ignore */ }
        if (tags.length === 0) return { row, score: 0 }

        let total = 0
        for (const t of tags) {
          // Distance from 0.5 — borderline tags carry max signal.
          const borderline = 1 - Math.abs(t.confidence - 0.5) * 2  // 1.0 at 0.5, 0.0 at 0.0 or 1.0
          // Frame disagreement (when present)
          const agreement = t.totalFrames && t.frameCount
            ? t.frameCount / t.totalFrames
            : 1
          const disagreement = 1 - agreement
          // Calibration novelty — fewer samples = bigger learning signal.
          const stat = calibration.get(t.name, t.source)
          const novelty = stat ? 1 / Math.sqrt(1 + stat.sampleCount) : 1
          total += borderline * 1.5 + disagreement * 1.0 + novelty * 0.8
        }
        // Normalize by tag count so items with one borderline tag don't
        // always lose to items with many medium-confidence tags.
        return { row, score: total / Math.sqrt(tags.length) }
      })
      scored.sort((a, b) => b.score - a.score)
      // Apply the requested limit + offset AFTER re-ranking.
      const sliced = scored.slice(offset, offset + limit).map((s) => s.row)
      rows.length = 0
      rows.push(...sliced)
    }

    console.log(`[AI Review] Returned ${rows.length} items`)

    const items: ReviewItem[] = rows.map(row => {
      let richTags: Array<{ name: string; confidence: number; source: string }> | undefined
      if (row.rich_tags) {
        try {
          const parsed = JSON.parse(row.rich_tags)
          if (Array.isArray(parsed)) richTags = parsed
        } catch {
          // ignore — bad row
        }
      }
      return {
        mediaId: row.media_id,
        filename: row.filename,
        thumbnailPath: row.thumbPath,
        suggestedTitle: row.suggested_title,
        description: row.description,
        matchedTags: JSON.parse(row.matched_tags || '[]'),
        newTagSuggestions: JSON.parse(row.new_tag_suggestions || '[]'),
        nsfwCategory: row.nsfw_category,
        nsfwConfidence: row.nsfw_confidence,
        reviewStatus: row.review_status,
        createdAt: row.created_at,
        suggestedFilename: row.suggested_filename ?? null,
        richTags
      }
    })

    return { items, total }
  }

  /**
   * Approve all suggestions for a media item
   */
  /** Snapshot a media's review-row state + current tag links right
   *  before a decision runs. Used by undoLastReview() to restore. */
  private captureUndoSnapshot(
    mediaId: string,
    decisionType: 'approve' | 'approve-edited' | 'reject'
  ): void {
    try {
      const row = this.rawDb.prepare(`
        SELECT review_status, reviewed_at, approved_tag_ids, approved_title,
               suggested_title, description, rejection_history
        FROM ai_analysis_results
        WHERE media_id = ?
      `).get(mediaId) as any
      if (!row) return
      const links = this.rawDb.prepare(
        `SELECT tagId FROM media_tags WHERE mediaId = ?`
      ).all(mediaId) as Array<{ tagId: number | string }>
      this.lastReviewSnapshot = {
        mediaId,
        decisionType,
        row: {
          review_status: row.review_status ?? null,
          reviewed_at: row.reviewed_at ?? null,
          approved_tag_ids: row.approved_tag_ids ?? null,
          approved_title: row.approved_title ?? null,
          suggested_title: row.suggested_title ?? null,
          description: row.description ?? null,
          rejection_history: row.rejection_history ?? null,
        },
        preDecisionTagIds: links.map((l) => Number(l.tagId)).filter((n) => Number.isFinite(n)),
        takenAt: Date.now(),
      }
    } catch (err) {
      console.warn('[ProcessingQueue] Failed to snapshot for undo:', err)
      this.lastReviewSnapshot = null
    }
  }

  /** Status getter for the renderer — does undo have anything to do? */
  getUndoStatus(): {
    available: boolean
    mediaId?: string
    decisionType?: 'approve' | 'approve-edited' | 'reject'
    ageMs?: number
  } {
    if (!this.lastReviewSnapshot) return { available: false }
    return {
      available: true,
      mediaId: this.lastReviewSnapshot.mediaId,
      decisionType: this.lastReviewSnapshot.decisionType,
      ageMs: Date.now() - this.lastReviewSnapshot.takenAt,
    }
  }

  /** Roll back the most recent approve/approve-edited/reject. Restores
   *  the review-row columns AND removes any tag links that were added
   *  by the decision (i.e. tagIds present now but not in the pre-
   *  decision snapshot). Single-shot — clears the snapshot on success. */
  undoLastReview(): { ok: boolean; mediaId?: string; error?: string } {
    const snap = this.lastReviewSnapshot
    if (!snap) return { ok: false, error: 'Nothing to undo' }
    try {
      this.rawDb.transaction(() => {
        // Restore the review row's columns to their snapshot values.
        this.rawDb.prepare(`
          UPDATE ai_analysis_results
          SET review_status = ?, reviewed_at = ?, approved_tag_ids = ?,
              approved_title = ?, suggested_title = ?, description = ?,
              rejection_history = ?
          WHERE media_id = ?
        `).run(
          snap.row.review_status,
          snap.row.reviewed_at,
          snap.row.approved_tag_ids,
          snap.row.approved_title,
          snap.row.suggested_title,
          snap.row.description,
          snap.row.rejection_history,
          snap.mediaId
        )
        // Remove any tag links added by the decision.
        const before = new Set<number>(snap.preDecisionTagIds)
        const current = this.rawDb.prepare(
          `SELECT tagId FROM media_tags WHERE mediaId = ?`
        ).all(snap.mediaId) as Array<{ tagId: number | string }>
        const remove = current
          .map((l) => Number(l.tagId))
          .filter((n) => Number.isFinite(n) && !before.has(n))
        const delLink = this.rawDb.prepare(
          `DELETE FROM media_tags WHERE mediaId = ? AND tagId = ?`
        )
        for (const id of remove) delLink.run(snap.mediaId, id)
      })()
      const restoredMediaId = snap.mediaId
      this.lastReviewSnapshot = null
      return { ok: true, mediaId: restoredMediaId }
    } catch (err: any) {
      console.error('[ProcessingQueue] Undo failed:', err)
      return { ok: false, error: err?.message ?? 'Undo failed' }
    }
  }

  approve(mediaId: string): { success: boolean } {
    const result = this.rawDb.prepare(`
      SELECT matched_tags, new_tag_suggestions FROM ai_analysis_results
      WHERE media_id = ?
    `).get(mediaId) as { matched_tags: string; new_tag_suggestions: string } | undefined

    if (!result) return { success: false }

    // Snapshot for single-level undo before mutating anything.
    this.captureUndoSnapshot(mediaId, 'approve')

    const matchedTags = JSON.parse(result.matched_tags || '[]') as Array<{ id: number }>
    const newSuggestions = JSON.parse(result.new_tag_suggestions || '[]') as Array<{ name: string; confidence: number }>

    // Apply matched tags
    for (const tag of matchedTags) {
      this.rawDb.prepare(`
        INSERT OR IGNORE INTO media_tags (mediaId, tagId) VALUES (?, ?)
      `).run(mediaId, tag.id)
    }

    // Create and apply new tags
    const newTagIds = this.tier3Matcher.createNewTags(newSuggestions.map(s => ({
      name: s.name,
      confidence: s.confidence,
      reason: 'AI suggested'
    })))

    for (const tagId of newTagIds) {
      this.rawDb.prepare(`
        INSERT OR IGNORE INTO media_tags (mediaId, tagId) VALUES (?, ?)
      `).run(mediaId, tagId)
    }

    // Mark as approved
    this.rawDb.prepare(`
      UPDATE ai_analysis_results
      SET review_status = 'approved', reviewed_at = datetime('now'),
          approved_tag_ids = ?
      WHERE media_id = ?
    `).run(JSON.stringify([...matchedTags.map(t => t.id), ...newTagIds]), mediaId)

    // Calibration: record approval feedback for every rich_tag the model
    // produced for this media (whole-batch approval = all tags rated good).
    this.recordCalibrationFeedback(mediaId, 'approved')

    return { success: true }
  }

  /**
   * Calibration helper. Pulls the rich_tags JSON for a media and records
   * approve/reject feedback per (tag_name, source) so the calibration
   * service learns from this user's review decisions over time.
   *
   * If `keepNames` is provided (approveEdited path), tags with names in
   * the set are recorded as 'approved' and the rest as 'rejected'.
   */
  private recordCalibrationFeedback(
    mediaId: string,
    fallbackDecision: 'approved' | 'rejected',
    keepNames?: Set<string>
  ): void {
    const calibration = getCalibrationService({ raw: this.rawDb } as DB)

    let richTags: Array<{ name: string; source: string }> = []
    try {
      const row = this.rawDb.prepare(
        `SELECT rich_tags FROM ai_analysis_results WHERE media_id = ?`
      ).get(mediaId) as { rich_tags?: string } | undefined
      if (row?.rich_tags) {
        const parsed = JSON.parse(row.rich_tags)
        if (Array.isArray(parsed)) {
          richTags = parsed.filter((t: any) =>
            t && typeof t.name === 'string' && typeof t.source === 'string'
          )
        }
      }
    } catch (err) {
      console.warn('[Calibration] Could not load rich_tags for feedback:', err)
      return
    }

    if (richTags.length === 0) return

    for (const t of richTags) {
      const normalized = t.name.toLowerCase()
      const decision = keepNames
        ? (keepNames.has(normalized) ? 'approved' : 'rejected')
        : fallbackDecision
      try {
        calibration.recordFeedback(t.name, t.source, decision)
      } catch {
        // ignore individual failures so one bad row doesn't kill the batch
      }
    }
  }

  /**
   * Approve with user modifications. The renderer passes the AI-suggested
   * originals alongside the user's edits so we can log diff signal into
   * rejection_history — when a user CHANGES a title/description, the
   * original goes into the "rejected directions" list that future Tier 2
   * calls avoid. User edits to tags (kept-set vs dropped) are still the
   * primary calibration signal; this just extends it to free-text.
   */
  approveEdited(mediaId: string, edits: {
    // Tag ids are TEXT (nanoid) — accept either number or string for back-compat
    // with any existing renderer payload, but treat them as strings going into
    // media_tags.tagId.
    selectedTagIds?: Array<string | number>
    editedTitle?: string
    editedDescription?: string
    originalTitle?: string | null
    originalDescription?: string | null
    newTags?: string[]
  }): { success: boolean } {
    // Snapshot for single-level undo before mutating anything.
    this.captureUndoSnapshot(mediaId, 'approve-edited')

    // Apply selected tags
    if (edits.selectedTagIds) {
      // Clear existing AI-applied tags first
      // Then apply the selected ones
      for (const tagId of edits.selectedTagIds) {
        this.rawDb.prepare(`
          INSERT OR IGNORE INTO media_tags (mediaId, tagId) VALUES (?, ?)
        `).run(mediaId, tagId)
      }
    }

    // Create new tags if specified
    if (edits.newTags && edits.newTags.length > 0) {
      const newTagIds = this.tier3Matcher.createNewTags(
        edits.newTags.map(name => ({ name, confidence: 1, reason: 'User created' }))
      )
      for (const tagId of newTagIds) {
        this.rawDb.prepare(`
          INSERT OR IGNORE INTO media_tags (mediaId, tagId) VALUES (?, ?)
        `).run(mediaId, tagId)
      }
    }

    // Update title if edited
    if (edits.editedTitle) {
      this.rawDb.prepare(`
        UPDATE media SET title = ? WHERE id = ?
      `).run(edits.editedTitle, mediaId)
    }

    // Update description if edited (separate from regenerate flow).
    if (edits.editedDescription !== undefined) {
      this.rawDb.prepare(`
        UPDATE ai_analysis_results SET description = ? WHERE media_id = ?
      `).run(edits.editedDescription, mediaId)
    }

    // Detect title/description edits — push the AI's original into the
    // rejection_history so future Tier 2 passes for this media (and the
    // library-wide rejection-patterns aggregator) learn what NOT to
    // emit. This is the "learn from edits" signal the user asked for.
    const titleChanged = !!(edits.editedTitle && edits.originalTitle && edits.editedTitle.trim() !== edits.originalTitle.trim())
    const descChanged = !!(edits.editedDescription !== undefined && edits.originalDescription && edits.editedDescription.trim() !== edits.originalDescription.trim())
    if (titleChanged || descChanged) {
      try {
        const existingRow = this.rawDb.prepare(
          'SELECT rejection_history FROM ai_analysis_results WHERE media_id = ?'
        ).get(mediaId) as { rejection_history: string | null } | undefined
        let history: Array<{ prevTitle?: string | null; prevDesc?: string | null; prevTags?: string[]; rejectedAt?: string; reason?: string }> = []
        if (existingRow?.rejection_history) {
          try { history = JSON.parse(existingRow.rejection_history) } catch { /* ignore */ }
          if (!Array.isArray(history)) history = []
        }
        history.push({
          prevTitle: titleChanged ? edits.originalTitle : null,
          prevDesc: descChanged ? edits.originalDescription : null,
          prevTags: [],
          rejectedAt: new Date().toISOString(),
          reason: 'user-edited-on-approve',
        })
        // Cap to last 10 entries so the prompt block doesn't bloat.
        const capped = history.slice(-10)
        this.rawDb.prepare(
          'UPDATE ai_analysis_results SET rejection_history = ? WHERE media_id = ?'
        ).run(JSON.stringify(capped), mediaId)
        console.log(`[ProcessingQueue] Logged user edit signal: title=${titleChanged}, desc=${descChanged}`)
      } catch (err) {
        console.warn('[ProcessingQueue] Failed to record edit signal:', err)
      }
    }

    // Mark as approved
    this.rawDb.prepare(`
      UPDATE ai_analysis_results
      SET review_status = 'approved', reviewed_at = datetime('now'),
          approved_tag_ids = ?, approved_title = ?
      WHERE media_id = ?
    `).run(
      JSON.stringify(edits.selectedTagIds || []),
      edits.editedTitle || null,
      mediaId
    )

    // Calibration: nuanced feedback — selected tags get 'approved', the rest
    // (tags the model produced but the user didn't keep) get 'rejected'.
    // We map tag IDs back to names via the tags table so we can match against
    // rich_tags entries (which are name-keyed).
    let keptNames = new Set<string>()
    if (edits.selectedTagIds && edits.selectedTagIds.length > 0) {
      const placeholders = edits.selectedTagIds.map(() => '?').join(',')
      const rows = this.rawDb.prepare(
        `SELECT name FROM tags WHERE id IN (${placeholders})`
      ).all(...edits.selectedTagIds) as Array<{ name: string }>
      keptNames = new Set(rows.map((r) => String(r.name).toLowerCase()))
    }
    if (edits.newTags) {
      for (const n of edits.newTags) keptNames.add(n.toLowerCase())
    }
    this.recordCalibrationFeedback(mediaId, 'approved', keptNames)

    return { success: true }
  }

  /**
   * Reject all suggestions for a media item, capture what was rejected into
   * `rejection_history`, then automatically re-enqueue the media for a fresh
   * pass with a "try a different direction" hint baked in.
   *
   * The rejection_history is a JSON array of { rejectedAt, prevTitle, prevDesc,
   * prevTags } entries. The processing pipeline reads it on the next pass
   * and threads the recent rejected directions into Tier 2's system prompt
   * so Venice produces meaningfully different output instead of repeating
   * itself.
   */
  reject(mediaId: string): { success: boolean } {
    // Snapshot for single-level undo before any mutation.
    this.captureUndoSnapshot(mediaId, 'reject')

    // Snapshot what's about to be rejected so Tier 2 can avoid repeating.
    const current = this.rawDb.prepare(`
      SELECT suggested_title, description, matched_tags, new_tag_suggestions, rejection_history
      FROM ai_analysis_results
      WHERE media_id = ?
    `).get(mediaId) as {
      suggested_title: string | null
      description: string | null
      matched_tags: string | null
      new_tag_suggestions: string | null
      rejection_history: string | null
    } | undefined

    if (current) {
      let history: any[] = []
      try { history = JSON.parse(current.rejection_history || '[]') } catch {}
      if (!Array.isArray(history)) history = []

      // Snapshot top tags by name only — keeps the JSON small and is enough
      // for Venice to "avoid these" on the rerun.
      const tagNames: string[] = []
      try {
        const matched = JSON.parse(current.matched_tags || '[]') as Array<{ name?: string }>
        for (const m of matched) if (m?.name) tagNames.push(String(m.name))
      } catch {}
      try {
        const nt = JSON.parse(current.new_tag_suggestions || '[]') as Array<{ name?: string }>
        for (const m of nt) if (m?.name) tagNames.push(String(m.name))
      } catch {}

      history.push({
        rejectedAt: new Date().toISOString(),
        prevTitle: current.suggested_title || null,
        prevDesc: current.description || null,
        prevTags: tagNames.slice(0, 24),
      })
      // Cap to 5 most-recent rejections — older ones drop out so the prompt
      // budget stays sane.
      if (history.length > 5) history = history.slice(-5)

      this.rawDb.prepare(`
        UPDATE ai_analysis_results
        SET review_status = 'rejected', reviewed_at = datetime('now'),
            rejection_history = ?
        WHERE media_id = ?
      `).run(JSON.stringify(history), mediaId)

      // Bust the library-wide rejection patterns cache so the next Tier 2
      // call picks up this fresh rejection instead of waiting for the TTL.
      try {
        invalidateRejectionPatternsCache()
      } catch { /* ignore — cache miss just costs one extra aggregation */ }
    } else {
      this.rawDb.prepare(`
        UPDATE ai_analysis_results
        SET review_status = 'rejected', reviewed_at = datetime('now')
        WHERE media_id = ?
      `).run(mediaId)
    }

    // Calibration: full reject = every rich_tag for this media gets a downvote.
    this.recordCalibrationFeedback(mediaId, 'rejected')

    // Re-enqueue for a fresh analysis pass. The processing loop reads
    // rejection_history before calling Tier 2 and passes it as a "avoid these
    // directions" hint to the prompt.
    try {
      const media = this.rawDb.prepare(
        'SELECT id, path, type, mtimeMs, size FROM media WHERE id = ?'
      ).get(mediaId) as { id: string; path: string; type: 'video' | 'image' | 'gif'; mtimeMs: number; size: number } | undefined
      if (media) {
        // Insert directly into ai_processing_queue (bypassing addToQueue's
        // INSERT OR IGNORE so a re-rejection produces a fresh row).
        this.rawDb.prepare(`
          INSERT INTO ai_processing_queue (media_id, status, priority, tier1_done, tier2_needed, tier2_done)
          VALUES (?, 'pending', 1, 0, 0, 0)
        `).run(media.id)
        console.log(`[ProcessingQueue] Rejection requeued ${media.id} for fresh analysis`)
      }
    } catch (err) {
      console.warn('[ProcessingQueue] Failed to requeue rejected item:', err)
    }

    return { success: true }
  }

  /**
   * Bulk approve all pending
   */
  bulkApprove(): { approved: number } {
    const pending = this.rawDb.prepare(`
      SELECT media_id FROM ai_analysis_results WHERE review_status = 'pending'
    `).all() as Array<{ media_id: string }>

    let approved = 0
    for (const item of pending) {
      if (this.approve(item.media_id).success) {
        approved++
      }
    }

    return { approved }
  }

  /**
   * Bulk reject all pending review items
   */
  bulkReject(): { rejected: number } {
    const result = this.rawDb.prepare(`
      UPDATE ai_analysis_results
      SET review_status = 'rejected', reviewed_at = datetime('now')
      WHERE review_status = 'pending'
    `).run()
    return { rejected: result.changes }
  }

  /**
   * Clear all failed items from the queue
   */
  clearFailed(): { cleared: number } {
    const result = this.rawDb.prepare(`
      DELETE FROM ai_processing_queue WHERE status = 'failed'
    `).run()
    return { cleared: result.changes }
  }

  /**
   * Purge orphaned queue entries — items pointing to media_ids that no
   * longer exist in the `media` table. These accumulate when files get
   * deleted/moved without the scanner cleaning up the queue side. The
   * inflation symptom: AI Tools shows "4534 queued" when the actual
   * library is 700 files. Cheap LEFT JOIN delete; safe to run anytime.
   */
  purgeOrphans(): { purged: number } {
    const result = this.rawDb.prepare(`
      DELETE FROM ai_processing_queue
      WHERE media_id NOT IN (SELECT id FROM media)
    `).run()
    return { purged: result.changes }
  }

  /**
   * Wipe the entire queue regardless of state. Recovery hatch when
   * the queue gets so out of sync that selective fixes won't bring
   * it back to sanity. Caller must accept that all in-flight work
   * is lost — nothing left to resume.
   */
  clearAll(): { cleared: number } {
    const result = this.rawDb.prepare(`DELETE FROM ai_processing_queue`).run()
    return { cleared: result.changes }
  }

  /**
   * Retry all failed items
   */
  retryFailed(): { retried: number } {
    const result = this.rawDb.prepare(`
      UPDATE ai_processing_queue
      SET status = 'pending', error = NULL, started_at = NULL, completed_at = NULL
      WHERE status = 'failed'
    `).run()
    return { retried: result.changes }
  }

  /**
   * Get processing stats
   */
  getStats(): ProcessingStats {
    const stats = this.rawDb.prepare(`
      SELECT
        COUNT(*) as totalProcessed,
        SUM(CASE WHEN tier2_done = 0 THEN 1 ELSE 0 END) as tier1Only,
        SUM(CASE WHEN tier2_done = 1 THEN 1 ELSE 0 END) as tier2Used
      FROM ai_processing_queue
      WHERE status = 'completed'
    `).get() as { totalProcessed: number; tier1Only: number; tier2Used: number }

    const tagStats = this.rawDb.prepare(`
      SELECT
        SUM(json_array_length(matched_tags)) as tagsMatched,
        SUM(json_array_length(COALESCE(approved_tag_ids, '[]'))) as newTagsCreated
      FROM ai_analysis_results
      WHERE review_status = 'approved'
    `).get() as { tagsMatched: number; newTagsCreated: number } | undefined

    return {
      totalProcessed: stats?.totalProcessed || 0,
      tier1Only: stats?.tier1Only || 0,
      tier2Used: stats?.tier2Used || 0,
      avgProcessingTime: 0, // Would need to track this
      tagsMatched: tagStats?.tagsMatched || 0,
      newTagsCreated: tagStats?.newTagsCreated || 0
    }
  }

  private sendStatus(status: string): void {
    this.mainWindow?.webContents.send('ai:status', { status })
  }

  // Progress event throttling. Tier 2 emits ai:progress at every frame
  // batch (~10-20× per video), and the renderer re-renders the entire
  // AI Tagger page on each. While the user is typing in the review
  // edit pane, this floods the React work queue and turns keystrokes
  // unresponsive. Throttle to one event per 150ms — fast enough for
  // a smooth progress bar, slow enough that the renderer can breathe
  // between updates.
  private _lastProgressSentAt = 0
  private _progressThrottleMs = 150
  // Latest progress payload waiting to ship; if a throttle blocks the
  // emit, this gets sent on the trailing edge so the bar reaches 100%.
  private _pendingProgress: { mediaId: string; stage: string; percent: number; extra?: Record<string, any> } | null = null
  private _trailingTimer: ReturnType<typeof setTimeout> | null = null

  private sendProgress(
    mediaId: string,
    stage: string,
    percent: number,
    extra?: Record<string, any>
  ): void {
    const now = Date.now()
    const elapsed = now - this._lastProgressSentAt
    // Always send terminal-state events (100%, completed, stop)
    // immediately so the UI converges; throttle only intermediate
    // updates.
    const isTerminal = percent >= 100 || stage === 'completed' || stage === 'failed'
    if (isTerminal || elapsed >= this._progressThrottleMs) {
      this._lastProgressSentAt = now
      this._pendingProgress = null
      if (this._trailingTimer) { clearTimeout(this._trailingTimer); this._trailingTimer = null }
      this.mainWindow?.webContents.send('ai:progress', { mediaId, stage, percent, ...extra })
      return
    }
    // Coalesce: store latest payload, schedule one trailing flush.
    this._pendingProgress = { mediaId, stage, percent, extra }
    if (!this._trailingTimer) {
      this._trailingTimer = setTimeout(() => {
        this._trailingTimer = null
        if (this._pendingProgress) {
          const p = this._pendingProgress
          this._pendingProgress = null
          this._lastProgressSentAt = Date.now()
          this.mainWindow?.webContents.send('ai:progress', {
            mediaId: p.mediaId, stage: p.stage, percent: p.percent, ...p.extra,
          })
        }
      }, this._progressThrottleMs - elapsed)
    }
  }

  /**
   * Emit a queue-level progress event weighted by media duration. The naive
   * "items completed / total items" measure overstates progress when the
   * smallest-first ordering chews through 30 short clips before touching
   * a long video; this gives a more honest ETA.
   *
   * Event shape: `ai:queue-progress` with
   *   { completedCount, totalCount, completedSec, totalSec, percent }
   *
   * percent is duration-weighted: completedSec / totalSec. Items with
   * unknown duration count as 60s (median assumption) so they don't
   * collapse the denominator.
   */
  private _lastQueueProgressAt = 0
  private _queueProgressThrottleMs = 500  // emit at most every 500ms

  private emitQueueProgress(): void {
    const now = Date.now()
    if (now - this._lastQueueProgressAt < this._queueProgressThrottleMs) return
    this._lastQueueProgressAt = now
    try {
      const row = this.rawDb.prepare(`
        SELECT
          q.status,
          COALESCE(m.durationSec, 60) AS d
        FROM ai_processing_queue q
        LEFT JOIN media m ON m.id = q.media_id
      `).all() as Array<{ status: string; d: number }>
      let completedCount = 0, totalCount = 0
      let completedSec = 0, totalSec = 0
      for (const r of row) {
        totalCount++
        totalSec += r.d
        if (r.status === 'completed') {
          completedCount++
          completedSec += r.d
        }
      }
      const percent = totalSec > 0 ? Math.round((completedSec / totalSec) * 100) : 0
      this.mainWindow?.webContents.send('ai:queue-progress', {
        completedCount, totalCount, completedSec, totalSec, percent
      })
    } catch (err) {
      console.warn('[ProcessingQueue] emitQueueProgress failed:', err)
    }
  }
}
