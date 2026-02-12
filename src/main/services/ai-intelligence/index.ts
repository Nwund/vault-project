// ===============================
// AI Intelligence System - Main Entry Point
// ===============================

import { ipcMain, BrowserWindow } from 'electron'
import type { DB } from '../../db'
import { getSettings, updateSettings } from '../../settings'

import { FrameExtractor } from './frame-extractor'
import { ModelDownloader } from './model-downloader'
import { Tier1OnnxTagger } from './tier1-onnx-tagger'
import { Tier2VisionLLM } from './tier2-vision-llm'
import { Tier3TagMatcher } from './tier3-tag-matcher'
import { ProcessingQueue } from './processing-queue'

let frameExtractor: FrameExtractor | null = null
let modelDownloader: ModelDownloader | null = null
let tier1Tagger: Tier1OnnxTagger | null = null
let tier2Vision: Tier2VisionLLM | null = null
let tier3Matcher: Tier3TagMatcher | null = null
let processingQueue: ProcessingQueue | null = null

export function initializeAiIntelligence(
  db: DB,
  ffmpegPath: string,
  mainWindow: BrowserWindow | null
): void {
  frameExtractor = new FrameExtractor(ffmpegPath)
  modelDownloader = new ModelDownloader()
  tier1Tagger = new Tier1OnnxTagger(modelDownloader)
  tier2Vision = new Tier2VisionLLM()
  tier3Matcher = new Tier3TagMatcher(db)
  processingQueue = new ProcessingQueue(
    db,
    frameExtractor,
    tier1Tagger,
    tier2Vision,
    tier3Matcher,
    mainWindow
  )

  // Load saved Venice API key from settings
  const savedSettings = getSettings()
  const savedApiKey = (savedSettings as any)?.ai?.veniceApiKey
  if (savedApiKey && tier2Vision) {
    tier2Vision.configure({ apiKey: savedApiKey })
    console.log('[AI] Restored Venice API key from settings')
  }

  registerIpcHandlers(db, mainWindow)
}

function registerIpcHandlers(db: DB, mainWindow: BrowserWindow | null): void {
  // Check if ONNX models are downloaded
  ipcMain.handle('ai:check-models', async () => {
    if (!modelDownloader) return { all_ready: false, models: [] }
    return modelDownloader.checkModels()
  })

  // Download missing ONNX models
  ipcMain.handle('ai:download-models', async () => {
    if (!modelDownloader) throw new Error('Model downloader not initialized')
    return modelDownloader.downloadModels((progress) => {
      mainWindow?.webContents.send('ai:model-download', progress)
    })
  })

  // Configure Tier 2 (Venice API key)
  ipcMain.handle('ai:configure-tier2', async (_ev, config: { apiKey?: string }) => {
    if (!tier2Vision) throw new Error('Tier 2 not initialized')
    tier2Vision.configure(config)

    // Persist API key to settings
    if (config.apiKey) {
      const current = getSettings() as any
      updateSettings({
        ai: {
          ...(current.ai || {}),
          veniceApiKey: config.apiKey,
          tier2Enabled: true,
        }
      } as any)
      console.log('[AI] Venice API key saved to settings')
    }
    return true
  })

  // Get Tier 2 configuration status
  ipcMain.handle('ai:get-tier2-config', async () => {
    const savedSettings = getSettings() as any
    return {
      apiKey: savedSettings?.ai?.veniceApiKey || '',
      configured: tier2Vision?.isEnabled() || false,
    }
  })

  // Queue untagged media for processing
  ipcMain.handle('ai:queue-untagged', async () => {
    if (!processingQueue) throw new Error('Processing queue not initialized')
    return processingQueue.queueUntagged()
  })

  // Queue specific media IDs
  ipcMain.handle('ai:queue-specific', async (_ev, mediaIds: string[]) => {
    if (!processingQueue) throw new Error('Processing queue not initialized')
    return processingQueue.queueSpecific(mediaIds)
  })

  // Queue entire library
  ipcMain.handle('ai:queue-all', async () => {
    if (!processingQueue) throw new Error('Processing queue not initialized')
    return processingQueue.queueAll()
  })

  // Get queue status
  ipcMain.handle('ai:queue-status', async () => {
    if (!processingQueue) throw new Error('Processing queue not initialized')
    return processingQueue.getStatus()
  })

  // Start processing
  ipcMain.handle('ai:start', async (_ev, options?: { enableTier2?: boolean; concurrency?: number }) => {
    if (!processingQueue) throw new Error('Processing queue not initialized')
    return processingQueue.start(options)
  })

  // Pause processing
  ipcMain.handle('ai:pause', async () => {
    if (!processingQueue) throw new Error('Processing queue not initialized')
    return processingQueue.pause()
  })

  // Resume processing
  ipcMain.handle('ai:resume', async () => {
    if (!processingQueue) throw new Error('Processing queue not initialized')
    return processingQueue.resume()
  })

  // Stop processing
  ipcMain.handle('ai:stop', async () => {
    if (!processingQueue) throw new Error('Processing queue not initialized')
    return processingQueue.stop()
  })

  // List items awaiting review
  ipcMain.handle('ai:review-list', async (_ev, options?: { limit?: number; offset?: number }) => {
    if (!processingQueue) throw new Error('Processing queue not initialized')
    return processingQueue.getReviewList(options)
  })

  // Approve all suggestions for a media item
  ipcMain.handle('ai:approve', async (_ev, mediaId: string) => {
    if (!processingQueue) throw new Error('Processing queue not initialized')
    return processingQueue.approve(mediaId)
  })

  // Approve with user modifications
  ipcMain.handle('ai:approve-edited', async (_ev, mediaId: string, edits: {
    selectedTagIds?: number[]
    editedTitle?: string
    newTags?: string[]
  }) => {
    if (!processingQueue) throw new Error('Processing queue not initialized')
    return processingQueue.approveEdited(mediaId, edits)
  })

  // Reject all suggestions for a media item
  ipcMain.handle('ai:reject', async (_ev, mediaId: string) => {
    if (!processingQueue) throw new Error('Processing queue not initialized')
    return processingQueue.reject(mediaId)
  })

  // Bulk approve all pending
  ipcMain.handle('ai:bulk-approve', async () => {
    if (!processingQueue) throw new Error('Processing queue not initialized')
    return processingQueue.bulkApprove()
  })

  // Bulk reject all pending
  ipcMain.handle('ai:bulk-reject', async () => {
    if (!processingQueue) throw new Error('Processing queue not initialized')
    return processingQueue.bulkReject()
  })

  // Get processing stats
  ipcMain.handle('ai:get-stats', async () => {
    if (!processingQueue) throw new Error('Processing queue not initialized')
    return processingQueue.getStats()
  })

  // Clear all failed items
  ipcMain.handle('ai:clear-failed', async () => {
    if (!processingQueue) throw new Error('Processing queue not initialized')
    return processingQueue.clearFailed()
  })

  // Retry all failed items
  ipcMain.handle('ai:retry-failed', async () => {
    if (!processingQueue) throw new Error('Processing queue not initialized')
    return processingQueue.retryFailed()
  })

  // Cleanup invalid/nonsensical tags
  ipcMain.handle('ai:cleanup-tags', async () => {
    const rawDb = db.raw
    const savedSettings = getSettings() as any
    const protectedTags = new Set((savedSettings?.ai?.protectedTags || []).map((t: string) => t.toLowerCase()))

    // Tags that should be removed - nonsensical, too short, or AI artifacts
    const INVALID_TAG_PATTERNS = [
      /^[a-z]$/i,                           // Single letters (A, B, C, etc.)
      /^[a-z]{1,2}$/i,                       // 1-2 character tags
      /^[0-9]+$/,                            // Pure numbers
      /^[^a-z0-9]+$/i,                       // Only special chars
      /monochrome/i,                         // AI artifact
      /grayscale/i,                          // AI artifact
      /non.?human/i,                         // AI artifact
      /^simple.?background$/i,               // AI artifact
      /^white.?background$/i,                // AI artifact
      /^looking.?at.?viewer$/i,              // Anime tagger artifact
      /^1girl$/i,                            // Anime tagger artifact
      /^1boy$/i,                             // Anime tagger artifact
      /^solo$/i,                             // May be valid but often noise
      /fart/i,                               // Invalid
      /hairy.?toe/i,                         // Invalid
      /^rating.?/i,                          // AI metadata
      /^score.?/i,                           // AI metadata
      /^artist.?/i,                          // AI metadata
      /^copyright.?/i,                       // AI metadata
      /^character.?/i,                       // AI metadata
      /^general$/i,                          // AI metadata
      /^sensitive$/i,                        // AI metadata
      /^questionable$/i,                     // AI metadata
      /^explicit$/i,                         // AI metadata - use own rating system
    ]

    // Get all tags
    const allTags = rawDb.prepare('SELECT id, name FROM tags').all() as Array<{ id: string; name: string }>
    const tagsToRemove: string[] = []

    for (const tag of allTags) {
      // Skip protected tags
      if (protectedTags.has(tag.name.toLowerCase())) {
        console.log(`[AI] Skipping protected tag: ${tag.name}`)
        continue
      }

      const shouldRemove = INVALID_TAG_PATTERNS.some(pattern => pattern.test(tag.name))
      if (shouldRemove) {
        tagsToRemove.push(tag.id)
      }
    }

    if (tagsToRemove.length === 0) {
      console.log('[AI] No invalid tags found')
      return { removed: 0 }
    }

    // Remove the tags and their associations
    const deleteMediaTags = rawDb.prepare('DELETE FROM media_tags WHERE tagId = ?')
    const deleteTag = rawDb.prepare('DELETE FROM tags WHERE id = ?')

    rawDb.transaction(() => {
      for (const tagId of tagsToRemove) {
        deleteMediaTags.run(tagId)
        deleteTag.run(tagId)
      }
    })()

    console.log(`[AI] Cleaned up ${tagsToRemove.length} invalid tags`)
    return { removed: tagsToRemove.length }
  })

  // Get protected tags
  ipcMain.handle('ai:get-protected-tags', async () => {
    const savedSettings = getSettings() as any
    return savedSettings?.ai?.protectedTags || []
  })

  // Set protected tags
  ipcMain.handle('ai:set-protected-tags', async (_ev, tags: string[]) => {
    const current = getSettings() as any
    updateSettings({
      ai: {
        ...(current.ai || {}),
        protectedTags: tags,
      }
    } as any)
    console.log(`[AI] Updated protected tags: ${tags.length} tags`)
    return { success: true }
  })

  // Add a protected tag
  ipcMain.handle('ai:add-protected-tag', async (_ev, tag: string) => {
    const current = getSettings() as any
    const existing = current?.ai?.protectedTags || []
    if (!existing.includes(tag)) {
      updateSettings({
        ai: {
          ...(current.ai || {}),
          protectedTags: [...existing, tag],
        }
      } as any)
    }
    return { success: true }
  })

  // Remove a protected tag
  ipcMain.handle('ai:remove-protected-tag', async (_ev, tag: string) => {
    const current = getSettings() as any
    const existing = current?.ai?.protectedTags || []
    updateSettings({
      ai: {
        ...(current.ai || {}),
        protectedTags: existing.filter((t: string) => t !== tag),
      }
    } as any)
    return { success: true }
  })

  // Analyze image for caption generation
  // Uses existing tags or generates captions based on content type
  ipcMain.handle('ai:analyze-for-caption', async (_ev, mediaId: string) => {
    try {
      // Get existing tags for this media
      const tags = db.raw.prepare('SELECT t.name FROM tags t JOIN media_tags mt ON t.id = mt.tagId JOIN media m ON m.id = mt.mediaId WHERE m.id = ?').all(mediaId) as { name: string }[]

      if (tags.length === 0) {
        return null // No tags available, let frontend use fallback
      }

      const tagNames = tags.map(t => t.name.toLowerCase())

      // Determine content type
      const isAnime = tagNames.some(t => ['hentai', 'anime', '2d', 'animated', 'drawn'].includes(t))

      // Caption templates based on detected content type
      const captionOptions = {
        goon: [
          { top: 'STROKE', bottom: 'EDGE' },
          { top: 'GOOD GOONER', bottom: null },
          { top: 'PORN IS LIFE', bottom: null },
          { top: 'LEAK FOR ME', bottom: null },
        ],
        degrading: [
          { top: 'LOOK AT THIS', bottom: 'YOU PATHETIC FUCK' },
          { top: 'YOU LOVE THIS', bottom: "DON'T YOU" },
        ],
        worship: [
          { top: 'WORSHIP', bottom: 'SUBMIT' },
          { top: 'PERFECT', bottom: null },
        ],
        hentai: [
          { top: 'ANIME BRAIN', bottom: 'ROT' },
          { top: '2D > 3D', bottom: null },
        ]
      }

      // Select category based on content
      let category = 'goon'
      if (isAnime) category = 'hentai'

      // Pick random caption from category
      const options = captionOptions[category as keyof typeof captionOptions]
      const selected = options[Math.floor(Math.random() * options.length)]

      return {
        topText: selected.top,
        bottomText: selected.bottom,
        category
      }
    } catch (err) {
      console.error('[AI] Caption analysis failed:', err)
      return null
    }
  })
}

export { FrameExtractor, ModelDownloader, Tier1OnnxTagger, Tier2VisionLLM, Tier3TagMatcher, ProcessingQueue }
