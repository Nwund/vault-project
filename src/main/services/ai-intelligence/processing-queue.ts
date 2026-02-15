// ===============================
// Processing Queue - Orchestrates AI analysis pipeline
// ===============================

import type { BrowserWindow } from 'electron'
import type { DB } from '../../db'
import { errorLogger } from '../error-logger'

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
  matchedTags: Array<{ id: number; name: string; confidence: number }>
  newTagSuggestions: Array<{ name: string; confidence: number }>
  nsfwCategory?: string
  nsfwConfidence?: number
  reviewStatus: 'pending' | 'approved' | 'rejected'
  createdAt: string
}

export class ProcessingQueue {
  private rawDb: RawDB
  private frameExtractor: FrameExtractor
  private tier1Tagger: Tier1OnnxTagger
  private tier2Vision: Tier2VisionLLM
  private tier3Matcher: Tier3TagMatcher
  private mainWindow: BrowserWindow | null

  private isRunning = false
  private isPaused = false
  private currentMediaId: string | null = null
  private enableTier2 = false
  private _concurrency = 1 // Reserved for future parallel processing

  constructor(
    db: DB,
    frameExtractor: FrameExtractor,
    tier1Tagger: Tier1OnnxTagger,
    tier2Vision: Tier2VisionLLM,
    tier3Matcher: Tier3TagMatcher,
    mainWindow: BrowserWindow | null
  ) {
    this.rawDb = db.raw
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
   * Get queue status
   */
  getStatus(): QueueStatus {
    const stats = this.rawDb.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN status = 'processing' THEN 1 ELSE 0 END) as processing,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed
      FROM ai_processing_queue
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
  async start(options?: { enableTier2?: boolean; concurrency?: number }): Promise<{ success: boolean }> {
    if (this.isRunning) {
      return { success: false }
    }

    this.enableTier2 = options?.enableTier2 ?? false
    this._concurrency = options?.concurrency ?? 1
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
      const item = this.getNextItem()
      if (!item) {
        // Queue empty
        this.isRunning = false
        this.sendStatus('completed')
        break
      }

      await this.processItem(item)
    }
  }

  private getNextItem(): QueueItem | null {
    const row = this.rawDb.prepare(`
      SELECT id, media_id, status, priority, tier1_done, tier2_needed, tier2_done, error
      FROM ai_processing_queue
      WHERE status = 'pending'
      ORDER BY priority DESC, id ASC
      LIMIT 1
    `).get() as any

    if (!row) return null

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

      // Extract frames
      this.sendProgress(item.mediaId, 'extracting', 10)
      const frames = await this.frameExtractor.extractFrames(
        media.path,
        mediaType,
        media.durationSec
      )

      if (frames.length === 0) {
        throw new Error('No frames extracted')
      }

      // Run Tier 1 analysis
      this.sendProgress(item.mediaId, 'tier1', 30)
      const tier1Result = await this.tier1Tagger.processFrames(frames.map(f => f.path))

      // Store Tier 1 results
      this.rawDb.prepare(`
        UPDATE ai_processing_queue SET tier1_done = 1 WHERE id = ?
      `).run(item.id)

      // Run Tier 2 (Venice Vision AI) if enabled - this is the main analysis for real content
      // Tier 1 (WD Tagger) is for anime, so we should always use Tier 2 for real photos/videos
      const shouldRunTier2 = this.enableTier2 && this.tier2Vision.isEnabled()

      let tier2Result: Tier2Result | null = null
      if (shouldRunTier2) {
        this.sendProgress(item.mediaId, 'tier2', 50)
        this.rawDb.prepare(`
          UPDATE ai_processing_queue SET tier2_needed = 1 WHERE id = ?
        `).run(item.id)

        console.log(`[ProcessingQueue] Running Tier 2 (Venice) analysis for ${item.mediaId}`)
        console.log(`[ProcessingQueue] Frames to analyze: ${frames.length}`)

        try {
          tier2Result = await this.tier2Vision.analyze(
            frames.map(f => f.path),
            mediaType,
            media.filename,
            tier1Result.tags.map(t => t.label)
          )

          console.log(`[ProcessingQueue] Tier 2 result:`, {
            title: tier2Result.title,
            tags: tier2Result.additionalTags.length,
            description: tier2Result.description?.slice(0, 50)
          })

          this.rawDb.prepare(`
            UPDATE ai_processing_queue SET tier2_done = 1 WHERE id = ?
          `).run(item.id)
        } catch (err) {
          console.error(`[ProcessingQueue] Tier 2 failed for ${item.mediaId}:`, err)
          // Continue without Tier 2
        }
      } else {
        console.log(`[ProcessingQueue] Skipping Tier 2 - enabled: ${this.enableTier2}, configured: ${this.tier2Vision.isEnabled()}`)
      }

      // Run Tier 3 matching
      this.sendProgress(item.mediaId, 'tier3', 70)
      const tier3Result = this.tier3Matcher.match(
        tier1Result.tags,
        tier2Result?.additionalTags
      )

      // Store results
      this.sendProgress(item.mediaId, 'storing', 90)
      this.storeResults(item.mediaId, tier1Result, tier2Result, tier3Result)

      // Clean up frames for this item (with a delay for Windows file locking)
      setTimeout(() => {
        try {
          this.frameExtractor.cleanupAll()
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
        mediaId
      )
    } else {
      console.log(`[AI] Inserting new record for ${mediaId}`)
      this.rawDb.prepare(`
        INSERT INTO ai_analysis_results (
          media_id, nsfw_category, nsfw_confidence, tier1_raw_tags,
          suggested_title, description, tier2_extra_tags, attributes,
          matched_tags, new_tag_suggestions, review_status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
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
        JSON.stringify(tier3.newTagSuggestions)
      )
    }

    // Verify the record was stored
    const verification = this.rawDb.prepare(`
      SELECT review_status FROM ai_analysis_results WHERE media_id = ?
    `).get(mediaId) as { review_status: string } | undefined
    console.log(`[AI] Verification for ${mediaId}: status = ${verification?.review_status ?? 'NOT FOUND'}`)
  }

  /**
   * Get list of items awaiting review
   */
  getReviewList(options?: { limit?: number; offset?: number }): { items: ReviewItem[]; total: number } {
    const limit = options?.limit ?? 50
    const offset = options?.offset ?? 0

    // Count items that have matching media (consistent with actual results)
    const totalResult = this.rawDb.prepare(`
      SELECT COUNT(*) as count
      FROM ai_analysis_results ar
      INNER JOIN media m ON ar.media_id = m.id
      WHERE ar.review_status = 'pending'
    `).get() as { count: number }
    const total = totalResult.count

    // Also check for orphaned records (analysis results with no media)
    const orphanedCount = (this.rawDb.prepare(`
      SELECT COUNT(*) as count
      FROM ai_analysis_results ar
      LEFT JOIN media m ON ar.media_id = m.id
      WHERE ar.review_status = 'pending' AND m.id IS NULL
    `).get() as { count: number }).count

    if (orphanedCount > 0) {
      console.log(`[AI Review] Warning: ${orphanedCount} orphaned analysis results (media deleted)`)
      // Clean up orphaned records
      this.rawDb.prepare(`
        DELETE FROM ai_analysis_results
        WHERE media_id NOT IN (SELECT id FROM media)
      `).run()
    }

    // Debug: Log raw counts
    const rawTotal = (this.rawDb.prepare(`
      SELECT COUNT(*) as count FROM ai_analysis_results WHERE review_status = 'pending'
    `).get() as { count: number }).count
    console.log(`[AI Review] Raw pending count: ${rawTotal}, Valid with media: ${total}`)

    const rows = this.rawDb.prepare(`
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
        m.filename,
        m.thumbPath
      FROM ai_analysis_results ar
      INNER JOIN media m ON ar.media_id = m.id
      WHERE ar.review_status = 'pending'
      ORDER BY ar.created_at DESC
      LIMIT ? OFFSET ?
    `).all(limit, offset) as any[]

    console.log(`[AI Review] Returned ${rows.length} items`)

    const items: ReviewItem[] = rows.map(row => ({
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
      createdAt: row.created_at
    }))

    return { items, total }
  }

  /**
   * Approve all suggestions for a media item
   */
  approve(mediaId: string): { success: boolean } {
    const result = this.rawDb.prepare(`
      SELECT matched_tags, new_tag_suggestions FROM ai_analysis_results
      WHERE media_id = ?
    `).get(mediaId) as { matched_tags: string; new_tag_suggestions: string } | undefined

    if (!result) return { success: false }

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

    return { success: true }
  }

  /**
   * Approve with user modifications
   */
  approveEdited(mediaId: string, edits: {
    selectedTagIds?: number[]
    editedTitle?: string
    newTags?: string[]
  }): { success: boolean } {
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

    return { success: true }
  }

  /**
   * Reject all suggestions for a media item
   */
  reject(mediaId: string): { success: boolean } {
    this.rawDb.prepare(`
      UPDATE ai_analysis_results
      SET review_status = 'rejected', reviewed_at = datetime('now')
      WHERE media_id = ?
    `).run(mediaId)

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

  private sendProgress(
    mediaId: string,
    stage: string,
    percent: number,
    extra?: Record<string, any>
  ): void {
    this.mainWindow?.webContents.send('ai:progress', {
      mediaId,
      stage,
      percent,
      ...extra
    })
  }
}
