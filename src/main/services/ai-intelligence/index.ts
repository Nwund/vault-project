// ===============================
// AI Intelligence System - Main Entry Point
// ===============================

import { ipcMain, BrowserWindow } from 'electron'
import type { DB } from '../../db'
import { getSettings, updateSettings, type VaultSettings } from '../../settings'

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
  const savedSettings = getSettings() as VaultSettings
  const savedApiKey = savedSettings?.ai?.veniceApiKey
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
      const current = getSettings() as VaultSettings
      updateSettings({
        ai: {
          ...current.ai,
          veniceApiKey: config.apiKey,
          tier2Enabled: true,
        }
      } as Partial<VaultSettings>)
      console.log('[AI] Venice API key saved to settings')
    }
    return true
  })

  // Get Tier 2 configuration status
  ipcMain.handle('ai:get-tier2-config', async () => {
    const savedSettings = getSettings() as VaultSettings
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

  // Get count of untagged media (for UI badge)
  ipcMain.handle('ai:get-untagged-count', async () => {
    if (!processingQueue) return 0
    try {
      return processingQueue.getUntaggedCount()
    } catch {
      return 0
    }
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
    const savedSettings = getSettings() as VaultSettings
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
    const savedSettings = getSettings() as VaultSettings
    return savedSettings?.ai?.protectedTags || []
  })

  // Set protected tags
  ipcMain.handle('ai:set-protected-tags', async (_ev, tags: string[]) => {
    const current = getSettings() as VaultSettings
    updateSettings({
      ai: {
        ...current.ai,
        protectedTags: tags,
      }
    } as Partial<VaultSettings>)
    console.log(`[AI] Updated protected tags: ${tags.length} tags`)
    return { success: true }
  })

  // Add a protected tag
  ipcMain.handle('ai:add-protected-tag', async (_ev, tag: string) => {
    const current = getSettings() as VaultSettings
    const existing = current?.ai?.protectedTags || []
    if (!existing.includes(tag)) {
      updateSettings({
        ai: {
          ...current.ai,
          protectedTags: [...existing, tag],
        }
      } as Partial<VaultSettings>)
    }
    return { success: true }
  })

  // Remove a protected tag
  ipcMain.handle('ai:remove-protected-tag', async (_ev, tag: string) => {
    const current = getSettings() as VaultSettings
    const existing = current?.ai?.protectedTags || []
    updateSettings({
      ai: {
        ...current.ai,
        protectedTags: existing.filter((t: string) => t !== tag),
      }
    } as Partial<VaultSettings>)
    return { success: true }
  })

  // Analyze image for caption generation
  // Uses existing tags or generates captions based on content type
  ipcMain.handle('ai:analyze-for-caption', async (_ev, mediaId: string) => {
    try {
      // Get existing tags for this media
      const tags = db.raw.prepare('SELECT t.name FROM tags t JOIN media_tags mt ON t.id = mt.tagId JOIN media m ON m.id = mt.mediaId WHERE m.id = ?').all(mediaId) as { name: string }[]

      const tagNames = tags.map(t => t.name.toLowerCase())

      // Comprehensive caption templates based on detected content type
      const captionOptions = {
        goon: [
          { top: 'STROKE', bottom: 'EDGE' },
          { top: 'GOOD GOONER', bottom: 'KEEP PUMPING' },
          { top: 'PORN IS LIFE', bottom: 'EMBRACE IT' },
          { top: 'LEAK FOR ME', bottom: null },
          { top: 'MINDLESS', bottom: 'PUMPING' },
          { top: 'NO THOUGHTS', bottom: 'JUST STROKE' },
          { top: 'EDGE LONGER', bottom: null },
          { top: 'DEEPER', bottom: 'INTO THE SPIRAL' },
          { top: 'ADDICTED', bottom: "CAN'T STOP" },
          { top: 'GOOD BOY', bottom: 'PUMP HARDER' },
        ],
        degrading: [
          { top: 'LOOK AT THIS', bottom: 'YOU PATHETIC FUCK' },
          { top: 'YOU LOVE THIS', bottom: "DON'T YOU" },
          { top: 'PATHETIC', bottom: 'KEEP STROKING' },
          { top: "CAN'T HELP YOURSELF", bottom: null },
          { top: 'EXPOSED', bottom: 'AND HARD' },
          { top: 'SUCH A LOSER', bottom: null },
          { top: 'WEAK', bottom: 'FOR PORN' },
          { top: 'SHAMEFUL', bottom: 'KEEP GOING' },
        ],
        worship: [
          { top: 'WORSHIP', bottom: 'SUBMIT' },
          { top: 'PERFECT', bottom: 'DIVINE' },
          { top: 'GODDESS', bottom: null },
          { top: 'BOW DOWN', bottom: null },
          { top: 'SERVE', bottom: 'OBEY' },
          { top: 'BEAUTIFUL', bottom: 'WORSHIP HER' },
        ],
        hentai: [
          { top: 'ANIME BRAIN', bottom: 'ROT' },
          { top: '2D > 3D', bottom: null },
          { top: 'WAIFU', bottom: 'MATERIAL' },
          { top: 'DEGENERATE', bottom: 'WEEB' },
          { top: 'CULTURED', bottom: null },
          { top: 'HENTAI', bottom: 'ENJOYER' },
        ],
        ass: [
          { top: 'THAT ASS', bottom: 'IS PERFECT' },
          { top: 'WORSHIP IT', bottom: null },
          { top: 'THICC', bottom: null },
          { top: 'CAKE', bottom: 'FOR DAYS' },
          { top: 'BOOTY', bottom: 'HYPNOTIZED' },
        ],
        boobs: [
          { top: 'THOSE TITS', bottom: 'AMAZING' },
          { top: 'TITTY', bottom: 'HYPNOTIZED' },
          { top: 'BIG', bottom: 'BEAUTIFUL' },
          { top: 'MOMMY', bottom: 'MILKERS' },
          { top: 'STACKED', bottom: null },
        ],
        femdom: [
          { top: 'OBEY', bottom: 'YOUR GODDESS' },
          { top: 'KNEEL', bottom: null },
          { top: 'YES MISTRESS', bottom: null },
          { top: 'SUBMIT', bottom: 'TO HER' },
          { top: 'DOMINATED', bottom: null },
          { top: "SHE'S IN CHARGE", bottom: null },
        ],
        sissy: [
          { top: 'SISSY', bottom: 'BRAIN' },
          { top: 'PRETTY GIRL', bottom: null },
          { top: 'FEMINIZED', bottom: null },
          { top: 'GOOD GIRL', bottom: null },
          { top: 'SO PRETTY', bottom: 'SO HORNY' },
        ],
        denial: [
          { top: 'EDGE', bottom: "DON'T CUM" },
          { top: 'NOT YET', bottom: 'KEEP EDGING' },
          { top: 'DENIED', bottom: null },
          { top: 'HOLD IT', bottom: 'LONGER' },
          { top: 'SUFFER', bottom: 'FOR ME' },
        ],
        encouragement: [
          { top: 'SO CLOSE', bottom: 'KEEP GOING' },
          { top: 'ALMOST THERE', bottom: null },
          { top: "THAT'S IT", bottom: 'GOOD' },
          { top: 'PERFECT', bottom: null },
          { top: 'LET GO', bottom: null },
          { top: 'RELEASE', bottom: null },
        ],
        blowjob: [
          { top: 'SUCK IT', bottom: null },
          { top: 'DEEP', bottom: null },
          { top: 'THROAT IT', bottom: null },
          { top: 'GOOD GIRL', bottom: null },
          { top: 'DROOLING', bottom: null },
        ],
        pov: [
          { top: 'LOOK AT HER', bottom: null },
          { top: 'YOUR VIEW', bottom: null },
          { top: 'IMAGINE', bottom: null },
          { top: 'RIGHT THERE', bottom: null },
        ],
        milf: [
          { top: 'MOMMY', bottom: 'KNOWS BEST' },
          { top: 'EXPERIENCED', bottom: null },
          { top: 'MATURE', bottom: 'PERFECTION' },
        ],
        teen: [
          { top: 'SO YOUNG', bottom: 'SO HOT' },
          { top: 'FRESH', bottom: null },
          { top: 'CUTE', bottom: null },
        ],
        lesbian: [
          { top: 'GIRLS', bottom: 'PLAYING' },
          { top: 'SAPPHIC', bottom: 'BLISS' },
          { top: 'LICK', bottom: null },
        ],
        hardcore: [
          { top: 'FUCK', bottom: 'HARDER' },
          { top: 'POUND', bottom: 'IT' },
          { top: 'ROUGH', bottom: null },
          { top: 'DESTROY', bottom: 'HER' },
        ],
        creampie: [
          { top: 'FILL HER', bottom: null },
          { top: 'BREED', bottom: null },
          { top: 'INSIDE', bottom: null },
          { top: 'DRIPPING', bottom: null },
        ],
        facial: [
          { top: 'CUM', bottom: 'COVERED' },
          { top: 'GLAZED', bottom: null },
          { top: 'MESSY', bottom: null },
        ],
      }

      // Detect content type from tags
      const categoryMatchers: { category: string; keywords: string[] }[] = [
        { category: 'hentai', keywords: ['hentai', 'anime', '2d', 'animated', 'drawn', 'cartoon', 'manga'] },
        { category: 'femdom', keywords: ['femdom', 'dominatrix', 'mistress', 'domme', 'goddess', 'foot worship'] },
        { category: 'sissy', keywords: ['sissy', 'feminization', 'crossdress', 'trap', 'femboy'] },
        { category: 'ass', keywords: ['ass', 'butt', 'booty', 'anal', 'pawg', 'thicc'] },
        { category: 'boobs', keywords: ['tits', 'boobs', 'breasts', 'busty', 'big tits', 'huge tits'] },
        { category: 'denial', keywords: ['denial', 'edge', 'edging', 'tease', 'ruined'] },
        { category: 'blowjob', keywords: ['blowjob', 'bj', 'oral', 'deepthroat', 'suck'] },
        { category: 'pov', keywords: ['pov', 'point of view'] },
        { category: 'milf', keywords: ['milf', 'mature', 'cougar', 'mom'] },
        { category: 'teen', keywords: ['teen', 'young', 'petite', 'barely legal'] },
        { category: 'lesbian', keywords: ['lesbian', 'girl on girl', 'sapphic'] },
        { category: 'hardcore', keywords: ['hardcore', 'rough', 'hard fuck', 'pounding'] },
        { category: 'creampie', keywords: ['creampie', 'breeding', 'cum inside'] },
        { category: 'facial', keywords: ['facial', 'cumshot', 'bukkake'] },
        { category: 'worship', keywords: ['worship', 'divine', 'goddess', 'perfect body'] },
        { category: 'degrading', keywords: ['humiliation', 'degradation', 'pathetic', 'loser'] },
      ]

      // Find matching category
      let category = 'goon' // default
      for (const matcher of categoryMatchers) {
        if (tagNames.some(t => matcher.keywords.some(k => t.includes(k)))) {
          category = matcher.category
          break
        }
      }

      // If no tags but we still want to return something, pick from goon or encouragement randomly
      if (tags.length === 0) {
        const randomCategories = ['goon', 'encouragement', 'denial']
        category = randomCategories[Math.floor(Math.random() * randomCategories.length)]
      }

      // Pick random caption from category
      const options = captionOptions[category as keyof typeof captionOptions] || captionOptions.goon
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

  // Generate captions using Venice AI vision (when API key is configured)
  ipcMain.handle('ai:venice-caption', async (_ev, mediaId: string, style?: string) => {
    try {
      if (!tier2Vision?.isEnabled()) {
        return { error: 'Venice AI not configured', topText: null, bottomText: null }
      }

      // Get the media path from database
      const media = db.raw.prepare('SELECT path, thumbPath, type FROM media WHERE id = ?').get(mediaId) as {
        path: string
        thumbPath: string | null
        type: string
      } | undefined

      if (!media) {
        return { error: 'Media not found', topText: null, bottomText: null }
      }

      // Use thumbnail if available (smaller file), otherwise use original
      const imagePath = media.thumbPath || media.path
      const captionStyle = (style || 'generic') as 'goon' | 'degrading' | 'worship' | 'hentai' | 'generic'

      const result = await tier2Vision.generateCaptions(imagePath, captionStyle)
      return {
        topText: result.topText,
        bottomText: result.bottomText,
        source: 'venice'
      }
    } catch (err) {
      console.error('[AI] Venice caption generation failed:', err)
      return { error: String(err), topText: null, bottomText: null }
    }
  })

  // Check if Venice AI is configured
  ipcMain.handle('ai:venice-status', async () => {
    return {
      configured: tier2Vision?.isEnabled() ?? false
    }
  })
}

export { FrameExtractor, ModelDownloader, Tier1OnnxTagger, Tier2VisionLLM, Tier3TagMatcher, ProcessingQueue }
