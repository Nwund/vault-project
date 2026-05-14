// ===============================
// Tier 1 ONNX Tagger - Local inference using ONNX models
// ===============================

import fs from 'fs'
import type { ModelDownloader } from './model-downloader'

// These will be dynamically imported to avoid issues when models aren't installed
let ort: any = null
let sharp: any = null

export interface Tier1Result {
  nsfwCategory: 'normal' | 'sexy' | 'porn' | 'hentai' | 'drawings'
  nsfwConfidence: number
  tags: Array<{ label: string; confidence: number }>
  contentType: 'anime' | 'real' | 'unknown'  // Detected content type
}

// Tags that are PURELY anime meta-tags and make NO sense for real content
// MINIMAL LIST - only truly nonsensical tags for real humans
// Many composition/camera angle tags (pov, close-up, from behind) ARE useful for real content
const ANIME_META_TAGS = new Set([
  // Character count indicators (booru-specific tagging convention)
  '1girl', '2girls', '3girls', '4girls', '5girls', '6+girls',
  '1boy', '2boys', '3boys', '4boys', '5boys', '6+boys',
  '1other', 'multiple girls', 'multiple boys',
  'solo', 'duo',  // These are booru counting conventions

  // Art medium/quality tags (only make sense for drawings)
  'highres', 'absurdres', 'incredibly absurdres',
  'simple background', 'white background', 'black background',
  'transparent background', 'gradient background',
  'sketch', 'lineart', 'line art', 'traditional media', 'digital media',
  'watercolor', 'oil painting', 'pastel', 'pencil', 'marker',
  'pixel art', '3d render', 'cg', 'cgi',
  'official art', 'key visual', 'concept art', 'cover',

  // Anime-only features (physically impossible for real humans)
  'chibi', 'kemonomimi mode', 'animal ears', 'cat ears', 'fox ears',
  'dog ears', 'bunny ears', 'wolf ears', 'horse ears',
  'tail', 'cat tail', 'fox tail', 'dog tail', 'bunny tail',
  'wings', 'demon wings', 'angel wings', 'fairy wings', 'feathered wings',
  'horns', 'demon horns', 'dragon horns',
  'anime eyes', 'huge eyes', 'blush stickers',
  'glowing eyes', 'empty eyes', 'crazy eyes', 'heart-shaped pupils',
  'elf ears', 'pointy ears',

  // Unnatural hair colors (keep natural colors - blonde, brunette, red, black, brown work for both)
  'blue hair', 'green hair', 'pink hair', 'purple hair', 'white hair',
  'silver hair', 'multicolored hair', 'gradient hair',
  'two-tone hair', 'streaked hair', 'rainbow hair', 'aqua hair',
  'orange hair',  // Debatable but usually anime

  // Unnatural eye colors
  'red eyes', 'yellow eyes', 'purple eyes', 'pink eyes',
  'orange eyes', 'heterochromia', 'multicolored eyes',

  // Anime art style tags
  'anime style', 'manga style', 'doujinshi', 'visual novel',
])

// Tags that are pure noise for an adult content library — always filter them
// regardless of contentType. WD Tagger emits color-mode + booru-rating
// artifacts that crowd out useful tags in the Review queue. Keep this list
// disjoint from ANIME_META_TAGS so the intent stays clear.
const ALWAYS_FILTERED_TAGS = new Set([
  // Color mode artifacts (WD Tagger emits these from grayscale/monochrome
  // frames or from low-saturation thumbnails)
  'monochrome', 'grayscale', 'greyscale',
  'desaturated', 'low saturation',

  // Booru rating tags — meaningless to us; we have our own NSFW classifier
  'rating:general', 'rating:sensitive', 'rating:questionable', 'rating:explicit',
  'general', 'sensitive', 'questionable', 'explicit',  // bare rating words

  // Booru meta-instructions
  'tagme', 'translation request', 'commentary request',

  // Quality / resolution noise
  'highres', 'absurdres', 'incredibly absurdres', 'lowres',
  'jpeg artifacts', 'compression artifacts',

  // "Looking at viewer" — technically descriptive but it's on virtually every
  // performer-facing-camera frame and adds zero signal
  'looking at viewer',

  // Composition / scene-meta tags from WD Tagger that show up on adult content
  // for no useful reason (a porn frame is rarely tagged "no humans" but the
  // model still fires it on close-ups; "negative space" is the same kind of
  // false positive). Added in response to live-log noise.
  'no humans', 'no human', '0girls', '0boys',
  'negative space', 'simple background', 'plain background',
  'blurry', 'blurry background', 'depth of field',
  'censored', 'uncensored', 'mosaic censoring', 'bar censor', 'heart censor',
  'real life', 'realistic', 'photograph', 'photorealistic',  // boring meta

  // Genre / composition labels WD Tagger emits on REAL frames as if they were
  // illustrations — useless for an adult library. (User reported "comic 63%"
  // and "portrait 61%" landing on a video of a teen on a bed.)
  'comic', 'portrait', 'wallpaper', 'cover',
  'dark', 'bright', 'glowing', 'shiny',  // single-word color/light artifacts
  // Note: 'group' and 'duo' are NOT filtered anymore — they're legitimate
  // atomic tags per the canonical vocab (e.g. "group sex" decomposes to
  // "group" + "sex", and the user picker treats them as filterable atoms).

  // More WD noise spotted in user's review: text focus is meaningless for
  // adult video frames, "clothed" actively pollutes (we want explicit context),
  // selfie is a phone-camera artifact tag, "screenshot" / "ui" / "logo" same.
  'text focus', 'text', 'speech bubble',
  'clothed', 'fully clothed', 'selfie',
  'screenshot', 'ui', 'logo', 'watermark',
  'official', 'commentary', 'artist name',

  // Hair colors — user prefers these in title/filename, never as tags
  // (2026-05-09 feedback). WD Tagger fires multiple hair-color tags at near-
  // equal confidence on the same frame; that's worse than dropping them all.
  'blonde', 'brunette', 'redhead', 'red head',
  'blonde hair', 'brown hair', 'black hair', 'red hair',
  'gray hair', 'grey hair', 'silver hair', 'white hair',
  'pink hair', 'blue hair', 'purple hair', 'green hair',
  'dyed hair', 'bleached hair',
])

// Exclusive groups — when WD Tagger shotguns multiple tags from one of these
// sets at near-equal confidence (it does this constantly for hair color +
// settings), keep only the single highest-confidence member of each group
// after aggregation. This stops users seeing "redhead 62% / blonde 62% /
// gray hair 62% / black hair 62%" all at once on the same video.
const EXCLUSIVE_TAG_GROUPS: ReadonlyArray<ReadonlySet<string>> = [
  new Set(['blonde', 'blonde hair', 'brunette', 'brunette hair', 'brown hair',
    'redhead', 'red hair', 'ginger', 'black hair', 'dark hair', 'gray hair',
    'grey hair', 'silver hair', 'white hair']),
  new Set(['bedroom', 'bathroom', 'kitchen', 'living room', 'office',
    'outdoors', 'public', 'beach', 'pool', 'gym', 'shower', 'bathtub',
    'car interior']),
  new Set(['solo', 'duo', 'threesome', 'gangbang', 'group sex']),  // singular categorization
]

// Tags to add based on NSFWJS category - applied to ALL content for better classification
const NSFWJS_CATEGORY_TAGS: Record<string, string[]> = {
  'porn': ['explicit', 'nsfw', 'adult content', 'real', 'live action'],
  'sexy': ['sensual', 'suggestive', 'nsfw', 'real', 'live action'],
  'hentai': ['hentai', 'anime', 'explicit', 'nsfw', 'animated', '2d'],
  'drawings': ['illustration', 'artwork', 'drawn', 'animated', '2d'],
  'normal': ['sfw']
}

// Tags from WD Tagger that should be BOOSTED (increased confidence) for real content
// These are useful descriptive tags that WD Tagger is good at detecting
const REAL_CONTENT_BOOST_TAGS = new Set([
  // Body parts / physical features (useful for all content)
  'breasts', 'large breasts', 'huge breasts', 'medium breasts', 'small breasts',
  'ass', 'thighs', 'thick thighs', 'wide hips', 'narrow waist',
  'nipples', 'areolae', 'cleavage', 'navel', 'midriff',
  'lips', 'parted lips', 'teeth', 'tongue', 'tongue out',

  // Hair (natural colors work for both)
  'long hair', 'short hair', 'medium hair', 'ponytail', 'twintails',
  'blonde hair', 'brown hair', 'black hair', 'red hair', 'dark hair',
  'bangs', 'straight hair', 'wavy hair', 'curly hair',

  // Clothing / accessories
  'bikini', 'underwear', 'lingerie', 'bra', 'panties', 'thong',
  'nude', 'naked', 'topless', 'bottomless', 'completely nude',
  'dress', 'skirt', 'shorts', 'jeans', 'leggings',
  'high heels', 'stockings', 'thighhighs', 'fishnets', 'garter belt',
  'jewelry', 'necklace', 'earrings', 'choker', 'collar',

  // Positions / actions
  'lying', 'sitting', 'standing', 'kneeling', 'on back', 'on stomach',
  'spread legs', 'crossed legs', 'bent over', 'arched back',
  'hands on hips', 'arms up', 'arms behind back',
  'masturbation', 'fingering', 'penetration', 'oral', 'sex',
  'blowjob', 'handjob', 'titjob', 'footjob', 'anal',
  'cum', 'facial', 'creampie', 'cumshot',

  // Camera angles / framing (useful for both)
  'pov', 'from behind', 'from above', 'from below', 'from side',
  'close-up', 'portrait', 'full body', 'upper body', 'lower body',
  'cowboy shot', 'looking at viewer', 'eye contact',

  // Expression / mood
  'smile', 'smiling', 'open mouth', 'closed eyes', 'wink',
  'ahegao', 'orgasm', 'pleasure', 'moaning',

  // Setting / context
  'indoors', 'outdoors', 'bedroom', 'bathroom', 'pool', 'beach',
  'bed', 'couch', 'shower', 'bathtub',
])

// NudeNet class labels
const NUDENET_LABELS = [
  'EXPOSED_ANUS', 'EXPOSED_ARMPITS', 'COVERED_BELLY', 'EXPOSED_BELLY',
  'COVERED_BUTTOCKS', 'EXPOSED_BUTTOCKS', 'FACE_F', 'FACE_M',
  'COVERED_FEET', 'EXPOSED_FEET', 'COVERED_BREAST_F', 'EXPOSED_BREAST_F',
  'COVERED_GENITALIA_F', 'EXPOSED_GENITALIA_F', 'EXPOSED_BREAST_M',
  'EXPOSED_GENITALIA_M'
]

// CLIP custom tag categories for zero-shot classification
const CLIP_TAG_CATEGORIES = {
  // Content type
  contentType: [
    'a photograph of a real person',
    'an anime or cartoon illustration',
    'a 3D rendered image',
    'a drawing or artwork'
  ],
  // Scene/setting
  setting: [
    'bedroom scene', 'bathroom scene', 'outdoor scene',
    'living room scene', 'office scene', 'studio photo',
    'beach scene', 'pool scene', 'shower scene'
  ],
  // Shot type
  shotType: [
    'close-up shot', 'medium shot', 'full body shot',
    'portrait shot', 'POV shot', 'selfie'
  ],
  // Subject count
  subjectCount: [
    'one person alone', 'two people together', 'group of people'
  ],
  // Clothing level
  clothing: [
    'fully clothed person', 'partially clothed person',
    'person in underwear or bikini', 'nude person'
  ],
  // Hair color (for real content)
  hairColor: [
    'blonde hair', 'brunette hair', 'black hair',
    'red hair', 'gray hair'
  ],
  // Body type
  bodyType: [
    'slim body type', 'athletic body type', 'curvy body type', 'plus size body type'
  ]
}

export class Tier1OnnxTagger {
  private modelDownloader: ModelDownloader
  // NSFWJS
  private nsfwSession: any = null
  private nsfwInputName: string = 'input'
  // WD Tagger
  private taggerSession: any = null
  private taggerInputName: string = 'input'
  private tagLabels: string[] = []
  // NudeNet
  private nudenetSession: any = null
  private nudenetInputName: string = 'input'
  // CLIP
  private clipVisionSession: any = null
  private clipTextSession: any = null
  private clipTextEmbeddings: Map<string, Float32Array> = new Map()

  private initialized = false

  constructor(modelDownloader: ModelDownloader) {
    this.modelDownloader = modelDownloader
  }

  /**
   * Initialize ONNX sessions (lazy initialization)
   */
  async initialize(): Promise<boolean> {
    if (this.initialized) return true

    try {
      // Dynamic imports
      ort = require('onnxruntime-node')
      sharp = require('sharp')
    } catch (err) {
      console.error('[Tier1] Failed to load dependencies:', err)
      return false
    }

    const { all_ready } = this.modelDownloader.checkModels()
    if (!all_ready) {
      console.warn('[Tier1] Models not downloaded yet')
      return false
    }

    try {
      const sessionOptions: any = {
        executionProviders: ['cpu'],
        graphOptimizationLevel: 'all',
        intraOpNumThreads: 2,
        interOpNumThreads: 1
      }

      // Load NSFW classifier
      const nsfwPath = this.modelDownloader.getModelPath('nsfw-classifier.onnx')
      if (fs.existsSync(nsfwPath)) {
        this.nsfwSession = await ort.InferenceSession.create(nsfwPath, sessionOptions)
        // Get actual input name from model
        this.nsfwInputName = this.nsfwSession.inputNames[0] || 'input'
        console.log(`[Tier1] NSFW classifier loaded (input: ${this.nsfwInputName})`)
      }

      // Load WD Tagger. Variant picked from settings:
      //   'swinv2' (default)  → wd-tagger-v3.onnx (467MB, original)
      //   'vit'               → wd-vit-tagger-v3.onnx (343MB, ~25% smaller)
      //   'pixai'             → pixai-tagger-v0_9.onnx (anime/cosplay
      //                          character specialist; recognizes named
      //                          characters like "asuka langley" that
      //                          WD Tagger doesn't know)
      //   'joytag'            → joytag.onnx (RedRocket/JoyTag — 200k+ tag
      //                          vocabulary including hard-edge NSFW
      //                          tags that WD prunes; good "second
      //                          opinion" against SwinV2)
      //   'idolsankaku'       → idolsankaku-eva02-tagger-v1.onnx
      //                          (alternate anime/cosplay specialist
      //                          trained on idolsankaku boards; some
      //                          characters PixAI misses)
      // Falls back to whichever model is present when the picked one
      // isn't on disk.
      let wdVariant = 'swinv2'
      try {
        const { getSettings } = await import('../../settings')
        wdVariant = ((getSettings().ai as any)?.wdTaggerVariant ?? 'swinv2').toString().toLowerCase()
      } catch { /* default */ }
      const swinPath = this.modelDownloader.getModelPath('wd-tagger-v3.onnx')
      const vitPath = this.modelDownloader.getModelPath('wd-vit-tagger-v3.onnx')
      const pixaiPath = this.modelDownloader.getModelPath('pixai-tagger-v0_9.onnx')
      const joytagPath = this.modelDownloader.getModelPath('joytag.onnx')
      const idolPath = this.modelDownloader.getModelPath('idolsankaku-eva02-tagger-v1.onnx')
      let taggerPath: string
      if (wdVariant === 'pixai' && fs.existsSync(pixaiPath)) taggerPath = pixaiPath
      else if (wdVariant === 'joytag' && fs.existsSync(joytagPath)) taggerPath = joytagPath
      else if (wdVariant === 'idolsankaku' && fs.existsSync(idolPath)) taggerPath = idolPath
      else if (wdVariant === 'vit' && fs.existsSync(vitPath)) taggerPath = vitPath
      else if (fs.existsSync(swinPath)) taggerPath = swinPath
      else if (fs.existsSync(vitPath)) taggerPath = vitPath
      else if (fs.existsSync(joytagPath)) taggerPath = joytagPath
      else if (fs.existsSync(pixaiPath)) taggerPath = pixaiPath
      else taggerPath = idolPath
      if (fs.existsSync(taggerPath)) {
        this.taggerSession = await ort.InferenceSession.create(taggerPath, sessionOptions)
        this.taggerInputName = this.taggerSession.inputNames[0] || 'input'
        const variantLabel = taggerPath === pixaiPath ? 'pixai'
          : taggerPath === joytagPath ? 'joytag'
          : taggerPath === idolPath ? 'idolsankaku'
          : taggerPath === vitPath ? 'vit' : 'swinv2'
        console.log(`[Tier1] WD Tagger loaded — variant: ${variantLabel} (input: ${this.taggerInputName})`)
      }

      // Load NudeNet classifier
      const nudenetPath = this.modelDownloader.getModelPath('nudenet-classifier.onnx')
      if (fs.existsSync(nudenetPath)) {
        this.nudenetSession = await ort.InferenceSession.create(nudenetPath, sessionOptions)
        this.nudenetInputName = this.nudenetSession.inputNames[0] || 'input'
        console.log(`[Tier1] NudeNet loaded (input: ${this.nudenetInputName})`)
      }

      // Load CLIP models
      const clipVisionPath = this.modelDownloader.getModelPath('clip-vision.onnx')
      const clipTextPath = this.modelDownloader.getModelPath('clip-text.onnx')
      if (fs.existsSync(clipVisionPath) && fs.existsSync(clipTextPath)) {
        this.clipVisionSession = await ort.InferenceSession.create(clipVisionPath, sessionOptions)
        this.clipTextSession = await ort.InferenceSession.create(clipTextPath, sessionOptions)
        console.log(`[Tier1] CLIP models loaded`)
        // Pre-compute text embeddings for all tag categories
        await this.precomputeClipTextEmbeddings()
      }

      // Load tag labels
      this.tagLabels = this.modelDownloader.getTagLabels()
      console.log(`[Tier1] Loaded ${this.tagLabels.length} tag labels`)

      this.initialized = true
      return true
    } catch (err) {
      console.error('[Tier1] Failed to initialize:', err)
      return false
    }
  }

  /**
   * Process a single frame and return results from ALL models
   */
  async processFrame(framePath: string): Promise<{
    nsfw: { category: string; confidence: number } | null
    tags: Array<{ label: string; confidence: number }>
    nudenet: Array<{ label: string; confidence: number }>
    clip: Array<{ label: string; confidence: number }>
  }> {
    if (!this.initialized) {
      await this.initialize()
    }

    const result = {
      nsfw: null as { category: string; confidence: number } | null,
      tags: [] as Array<{ label: string; confidence: number }>,
      nudenet: [] as Array<{ label: string; confidence: number }>,
      clip: [] as Array<{ label: string; confidence: number }>
    }

    try {
      // Validate frame exists and is not empty
      const fs = require('fs')
      if (!fs.existsSync(framePath)) {
        console.warn(`[Tier1] Frame not found: ${framePath}`)
        return result
      }
      const stats = fs.statSync(framePath)
      if (stats.size < 1024) {
        console.warn(`[Tier1] Frame too small (${stats.size} bytes): ${framePath}`)
        return result
      }

      // Run NSFW classifier
      if (this.nsfwSession) {
        const nsfwInput = await this.preprocessForNsfw(framePath)
        const feeds: Record<string, any> = {}
        feeds[this.nsfwInputName] = nsfwInput
        const nsfwOutput = await this.nsfwSession.run(feeds)
        const nsfwResult = this.parseNsfwOutput(nsfwOutput)
        result.nsfw = nsfwResult
      }

      // Run WD Tagger
      if (this.taggerSession && this.tagLabels.length > 0) {
        const taggerInput = await this.preprocessForTagger(framePath)
        const feeds: Record<string, any> = {}
        feeds[this.taggerInputName] = taggerInput
        const taggerOutput = await this.taggerSession.run(feeds)
        result.tags = this.parseTaggerOutput(taggerOutput)
      }

      // Run NudeNet
      if (this.nudenetSession) {
        const nudenetInput = await this.preprocessForNudenet(framePath)
        const feeds: Record<string, any> = {}
        feeds[this.nudenetInputName] = nudenetInput
        const nudenetOutput = await this.nudenetSession.run(feeds)
        result.nudenet = this.parseNudenetOutput(nudenetOutput)
      }

      // Run CLIP zero-shot classification
      if (this.clipVisionSession && this.clipTextEmbeddings.size > 0) {
        result.clip = await this.runClipClassification(framePath)
      }
    } catch (err) {
      console.error('[Tier1] Error processing frame:', err)
    }

    return result
  }

  /**
   * Process multiple frames and aggregate results from ALL models
   */
  async processFrames(framePaths: string[]): Promise<Tier1Result> {
    const allNsfw: Array<{ category: string; scores: number[] }> = []
    const tagCounts: Map<string, { sum: number; count: number; max: number; source: string }> = new Map()

    console.log(`[Tier1] Processing ${framePaths.length} frames with NSFWJS + WD Tagger + NudeNet + CLIP`)

    for (const framePath of framePaths) {
      const result = await this.processFrame(framePath)

      // NSFWJS results
      if (result.nsfw) {
        allNsfw.push({
          category: result.nsfw.category,
          scores: [result.nsfw.confidence]
        })
      }

      // WD Tagger tags
      for (const tag of result.tags) {
        const existing = tagCounts.get(tag.label) || { sum: 0, count: 0, max: 0, source: 'wd' }
        existing.sum += tag.confidence
        existing.count++
        existing.max = Math.max(existing.max, tag.confidence)
        tagCounts.set(tag.label, existing)
      }

      // NudeNet tags (body part detection)
      for (const tag of result.nudenet) {
        // Convert NudeNet labels to readable tags
        const readableLabel = this.nudenetLabelToTag(tag.label)
        if (readableLabel) {
          const existing = tagCounts.get(readableLabel) || { sum: 0, count: 0, max: 0, source: 'nudenet' }
          existing.sum += tag.confidence
          existing.count++
          existing.max = Math.max(existing.max, tag.confidence)
          tagCounts.set(readableLabel, existing)
        }
      }

      // CLIP zero-shot tags
      for (const tag of result.clip) {
        const existing = tagCounts.get(tag.label) || { sum: 0, count: 0, max: 0, source: 'clip' }
        existing.sum += tag.confidence
        existing.count++
        existing.max = Math.max(existing.max, tag.confidence)
        tagCounts.set(tag.label, existing)
      }
    }

    // Aggregate NSFW - take the MAX score category
    let nsfwCategory: Tier1Result['nsfwCategory'] = 'normal'
    let nsfwConfidence = 0
    for (const item of allNsfw) {
      const conf = item.scores[0]
      if (conf > nsfwConfidence) {
        nsfwConfidence = conf
        nsfwCategory = item.category as Tier1Result['nsfwCategory']
      }
    }

    // Determine content type from NSFWJS category
    // 'hentai' and 'drawings' = anime/drawn content
    // 'porn' and 'sexy' = real content
    // 'normal' = unknown (could be either)
    // Low confidence = treat as unknown to avoid wrong filtering
    let contentType: 'anime' | 'real' | 'unknown' = 'unknown'
    if (nsfwConfidence >= 0.6) {  // Only trust classification with decent confidence
      if (nsfwCategory === 'hentai' || nsfwCategory === 'drawings') {
        contentType = 'anime'
      } else if (nsfwCategory === 'porn' || nsfwCategory === 'sexy') {
        contentType = 'real'
      }
    }

    console.log(`[Tier1] Content type: ${contentType} (NSFW: ${nsfwCategory} @ ${(nsfwConfidence * 100).toFixed(1)}%)`)

    // Aggregate tags
    // Keep tags that appear in >=30% of frames OR have >=0.8 confidence in any frame
    const frameCount = framePaths.length
    const threshold = 0.3
    const highConfThreshold = 0.8
    const minConfThreshold = 0.35
    const boostedMinConfThreshold = 0.25  // Lower threshold for boosted tags

    const aggregatedTags: Array<{ label: string; confidence: number }> = []
    let filteredCount = 0
    let boostedCount = 0

    for (const [label, data] of tagCounts) {
      const frequency = data.count / frameCount
      const avgConfidence = data.sum / data.count
      const labelLower = label.toLowerCase().replace(/_/g, ' ')

      // ALWAYS-filtered noise tags (color mode artifacts, booru ratings, etc.)
      // These are useless for an adult content library regardless of contentType,
      // and were the source of "monochrome 90%" / "grayscale 90%" review-queue
      // pollution.
      if (ALWAYS_FILTERED_TAGS.has(labelLower)) {
        filteredCount++
        continue
      }

      // For real content, filter out anime META tags
      if (contentType === 'real') {
        if (ANIME_META_TAGS.has(labelLower)) {
          filteredCount++
          continue  // Skip anime meta tag
        }
      }

      // Check if this is a boosted tag for real content
      const isBoosted = contentType === 'real' && REAL_CONTENT_BOOST_TAGS.has(labelLower)
      const effectiveMinConf = isBoosted ? boostedMinConfThreshold : minConfThreshold

      if ((frequency >= threshold || data.max >= highConfThreshold) && avgConfidence >= effectiveMinConf) {
        // Apply confidence boost for useful tags on real content
        let finalConfidence = avgConfidence
        if (isBoosted) {
          finalConfidence = Math.min(1.0, avgConfidence * 1.15)  // 15% boost, cap at 1.0
          boostedCount++
        }
        aggregatedTags.push({ label, confidence: finalConfidence })
      }
    }

    // Add NSFWJS category-based tags for ALL content (not just real)
    // This provides consistent classification across anime and real content
    if (nsfwConfidence > 0.5) {
      const categoryTags = NSFWJS_CATEGORY_TAGS[nsfwCategory] || []
      for (const tag of categoryTags) {
        // Check if tag already exists (avoid duplicates)
        if (!aggregatedTags.some(t => t.label.toLowerCase() === tag.toLowerCase())) {
          aggregatedTags.push({ label: tag, confidence: nsfwConfidence })
        }
      }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // High-signal atomic tags from cross-model evidence (gender / count / body
    // type). User feedback 2026-05-09: tags must look like real porn-site tags
    // — no "category:" prefix, no compound buckets. Just plain atomic words
    // the user combines in the picker. NSFWJS rating tags are already added
    // above via NSFWJS_CATEGORY_TAGS, so no need to duplicate them here.
    // ═══════════════════════════════════════════════════════════════════════════
    const derivedTags: Array<{ label: string; confidence: number }> = []

    const findConfidence = (predicate: (label: string) => boolean): number =>
      aggregatedTags.find(t => predicate(t.label.toLowerCase()))?.confidence ?? 0.7

    // Gender — emit plain "female" / "male" when NudeNet face / body-part
    // signal agrees with WD Tagger gender hints.
    const hasFemaleSignal = aggregatedTags.some(t => {
      const l = t.label.toLowerCase()
      return l.includes('female face') || l === 'female' ||
        ['exposed breasts', 'covered breasts', 'exposed pussy', 'covered pussy'].includes(l)
    })
    const hasMaleSignal = aggregatedTags.some(t => {
      const l = t.label.toLowerCase()
      return l.includes('male face') || l === 'male' ||
        ['male chest', 'exposed penis'].includes(l)
    })
    if (hasFemaleSignal) {
      derivedTags.push({ label: 'female', confidence: findConfidence(l => l.includes('female')) })
    }
    if (hasMaleSignal) {
      derivedTags.push({ label: 'male', confidence: findConfidence(l => l === 'male' || l.includes('male face')) })
    }

    // Subject count (CLIP zero-shot already produces "solo"/"couple"/"group"
    // as plain atomic tags via processFrame; nothing to re-emit here. We only
    // make sure a synonymous "duo" gets surfaced when CLIP picked "couple",
    // because the canonical vocab includes both.)
    if (aggregatedTags.some(t => t.label.toLowerCase() === 'couple')) {
      derivedTags.push({ label: 'duo', confidence: 0.75 })
    }

    // Body type (CLIP gives plain "slim"/"athletic"/"curvy"/"plus size"
    // already; just ensure they survive aggregation as atomic tags rather
    // than being filtered by the EXCLUSIVE_TAG_GROUPS dedupe later. These
    // are passthrough — no prefix, no rewrapping.)
    // (No code needed — CLIP output already in aggregatedTags.)

    // Content type → emit "animated"/"live action" as plain atomic tags
    // matching canonical vocabulary. These are richer than NSFWJS's
    // category-tag set when the underlying signal is high-confidence.
    if (contentType === 'anime') {
      derivedTags.push({ label: 'animated', confidence: 0.9 })
    } else if (contentType === 'real') {
      derivedTags.push({ label: 'live action', confidence: 0.9 })
    }

    // Merge — skip duplicates against existing aggregated tags
    for (const tag of derivedTags) {
      if (!aggregatedTags.some(t => t.label.toLowerCase() === tag.label.toLowerCase())) {
        aggregatedTags.push(tag)
      }
    }

    console.log(`[Tier1] Derived ${derivedTags.length} atomic tags: ${derivedTags.map(c => c.label).join(', ')}`)

    // Sort by confidence and take top 60 (increased to allow category tags)
    aggregatedTags.sort((a, b) => b.confidence - a.confidence)

    // Apply exclusive-group filter — for each group of mutually-exclusive
    // tags (e.g. hair colors, room types), keep only the single highest-
    // confidence member. Stops the "redhead 62% + blonde 62% + black hair 62%"
    // shotgun output WD Tagger produces.
    const droppedFromExclusive: string[] = []
    const keptByGroup = new WeakMap<ReadonlySet<string>, string>()
    const exclusiveFiltered = aggregatedTags.filter((t) => {
      const labelLower = t.label.toLowerCase().replace(/_/g, ' ')
      for (const group of EXCLUSIVE_TAG_GROUPS) {
        if (group.has(labelLower)) {
          const existing = keptByGroup.get(group)
          if (existing === undefined) {
            keptByGroup.set(group, labelLower)
            return true
          } else {
            // We sorted desc by confidence, so the first member we see is
            // already the highest — drop this one.
            droppedFromExclusive.push(t.label)
            return false
          }
        }
      }
      return true
    })
    if (droppedFromExclusive.length > 0) {
      console.log(`[Tier1] Dropped ${droppedFromExclusive.length} tags from exclusive groups: ${droppedFromExclusive.slice(0, 8).join(', ')}`)
    }

    const topTags = exclusiveFiltered.slice(0, 60)

    if (contentType === 'real') {
      console.log(`[Tier1] Real content: ${topTags.length} tags (${filteredCount} anime tags filtered, ${boostedCount} tags boosted)`)
    } else if (contentType === 'anime') {
      console.log(`[Tier1] Anime content: ${topTags.length} tags (full WD Tagger output + NSFWJS categories)`)
    } else {
      console.log(`[Tier1] Unknown content type: ${topTags.length} tags`)
    }

    return {
      nsfwCategory,
      nsfwConfidence,
      tags: topTags,
      contentType
    }
  }

  /**
   * Preprocess image for NSFW classifier (224x224, RGB, NHWC, normalized 0-1)
   * NSFWJS uses MobileNet/Inception which expects NHWC format
   */
  private async preprocessForNsfw(imagePath: string): Promise<any> {
    const { data } = await sharp(imagePath)
      .resize(224, 224, { fit: 'cover' })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true })

    // Convert to Float32Array in NHWC format [1, 224, 224, 3]
    const float32Data = new Float32Array(1 * 224 * 224 * 3)
    const pixels = data

    for (let i = 0; i < 224 * 224 * 3; i++) {
      float32Data[i] = pixels[i] / 255.0
    }

    return new ort.Tensor('float32', float32Data, [1, 224, 224, 3])
  }

  /**
   * Preprocess image for WD Tagger (448x448, BGR, NHWC, normalized 0-1)
   */
  private async preprocessForTagger(imagePath: string): Promise<any> {
    const { data } = await sharp(imagePath)
      .resize(448, 448, { fit: 'cover' })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true })

    // Convert to Float32Array in NHWC format [1, 448, 448, 3] with BGR order
    const float32Data = new Float32Array(1 * 448 * 448 * 3)
    const pixels = data

    for (let h = 0; h < 448; h++) {
      for (let w = 0; w < 448; w++) {
        const srcIdx = (h * 448 + w) * 3
        const dstIdx = (h * 448 + w) * 3

        // Swap R and B for BGR
        float32Data[dstIdx + 0] = pixels[srcIdx + 2] / 255.0 // B
        float32Data[dstIdx + 1] = pixels[srcIdx + 1] / 255.0 // G
        float32Data[dstIdx + 2] = pixels[srcIdx + 0] / 255.0 // R
      }
    }

    return new ort.Tensor('float32', float32Data, [1, 448, 448, 3])
  }

  /**
   * Parse NSFW classifier output
   */
  private parseNsfwOutput(output: any): { category: string; confidence: number } {
    const categories = ['drawings', 'hentai', 'neutral', 'porn', 'sexy']
    const outputTensor = Object.values(output)[0] as any
    const logits = outputTensor.data as Float32Array

    // Apply softmax
    const maxLogit = Math.max(...logits)
    const expScores = logits.map((l: number) => Math.exp(l - maxLogit))
    const sumExp = expScores.reduce((a: number, b: number) => a + b, 0)
    const probs = expScores.map((e: number) => e / sumExp)

    // Find max
    let maxIdx = 0
    let maxProb = 0
    for (let i = 0; i < probs.length; i++) {
      if (probs[i] > maxProb) {
        maxProb = probs[i]
        maxIdx = i
      }
    }

    // Map 'neutral' to 'normal'
    let category = categories[maxIdx]
    if (category === 'neutral') category = 'normal'

    return { category, confidence: maxProb }
  }

  /**
   * Parse WD Tagger output
   */
  private parseTaggerOutput(output: any): Array<{ label: string; confidence: number }> {
    const outputTensor = Object.values(output)[0] as any
    const scores = outputTensor.data as Float32Array

    const results: Array<{ label: string; confidence: number }> = []
    const threshold = 0.35

    for (let i = 0; i < scores.length && i < this.tagLabels.length; i++) {
      if (scores[i] >= threshold) {
        results.push({
          label: this.tagLabels[i],
          confidence: scores[i]
        })
      }
    }

    return results.sort((a, b) => b.confidence - a.confidence)
  }

  /**
   * Check if initialized
   */
  isInitialized(): boolean {
    return this.initialized
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // NudeNet Helper Functions
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Preprocess image for NudeNet (224x224, RGB, NHWC, normalized 0-1)
   */
  private async preprocessForNudenet(imagePath: string): Promise<any> {
    const { data } = await sharp(imagePath)
      .resize(224, 224, { fit: 'cover' })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true })

    const float32Data = new Float32Array(1 * 224 * 224 * 3)
    for (let i = 0; i < 224 * 224 * 3; i++) {
      float32Data[i] = data[i] / 255.0
    }

    return new ort.Tensor('float32', float32Data, [1, 224, 224, 3])
  }

  /**
   * Parse NudeNet classifier output
   */
  private parseNudenetOutput(output: any): Array<{ label: string; confidence: number }> {
    const outputTensor = Object.values(output)[0] as any
    const scores = outputTensor.data as Float32Array

    const results: Array<{ label: string; confidence: number }> = []
    const threshold = 0.5  // NudeNet threshold

    for (let i = 0; i < scores.length && i < NUDENET_LABELS.length; i++) {
      if (scores[i] >= threshold) {
        results.push({
          label: NUDENET_LABELS[i],
          confidence: scores[i]
        })
      }
    }

    return results.sort((a, b) => b.confidence - a.confidence)
  }

  /**
   * Convert NudeNet labels to readable tag names
   */
  private nudenetLabelToTag(label: string): string | null {
    const mapping: Record<string, string> = {
      'EXPOSED_ANUS': 'anal',
      'EXPOSED_ARMPITS': 'armpits',
      'COVERED_BELLY': 'belly',
      'EXPOSED_BELLY': 'exposed belly',
      'COVERED_BUTTOCKS': 'ass',
      'EXPOSED_BUTTOCKS': 'exposed ass',
      'FACE_F': 'female face',
      'FACE_M': 'male face',
      'COVERED_FEET': 'feet',
      'EXPOSED_FEET': 'bare feet',
      'COVERED_BREAST_F': 'covered breasts',
      'EXPOSED_BREAST_F': 'exposed breasts',
      'COVERED_GENITALIA_F': 'covered pussy',
      'EXPOSED_GENITALIA_F': 'exposed pussy',
      'EXPOSED_BREAST_M': 'male chest',
      'EXPOSED_GENITALIA_M': 'exposed penis'
    }
    return mapping[label] || null
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CLIP Helper Functions
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Pre-compute text embeddings for all CLIP tag categories
   */
  private async precomputeClipTextEmbeddings(): Promise<void> {
    if (!this.clipTextSession) return

    console.log('[Tier1] Pre-computing CLIP text embeddings...')

    for (const [_category, texts] of Object.entries(CLIP_TAG_CATEGORIES)) {
      for (const text of texts) {
        try {
          const embedding = await this.getClipTextEmbedding(text)
          this.clipTextEmbeddings.set(text, embedding)
        } catch (err) {
          console.warn(`[Tier1] Failed to compute embedding for "${text}":`, err)
        }
      }
    }

    console.log(`[Tier1] Pre-computed ${this.clipTextEmbeddings.size} CLIP text embeddings`)
  }

  /**
   * Get CLIP text embedding for a single text. Uses the real CLIP BPE
   * tokenizer when the user has dropped bpe_simple_vocab_16e6.txt.gz
   * (Apache-2.0) at <userData>/models/clip-vocab.txt.gz. Falls back
   * to a character-code placeholder when the vocab isn't installed —
   * the fixed CLIP_TAG_CATEGORIES set still gives useful relative
   * ordering even with the placeholder, but arbitrary-text zero-shot
   * scoring is only meaningful with the real tokenizer.
   */
  private async getClipTextEmbedding(text: string): Promise<Float32Array> {
    const maxLen = 77
    let tokens: BigInt64Array | null = null

    // Try real BPE first.
    try {
      const { encodeClipText } = await import('./clip-bpe-tokenizer')
      tokens = encodeClipText(text)
    } catch (err) {
      console.warn('[Tier1 CLIP] BPE tokenizer load failed:', err)
    }

    if (!tokens) {
      // Fallback: character-code placeholder.
      tokens = new BigInt64Array(maxLen)
      tokens[0] = BigInt(49406)
      const chars = text.toLowerCase().slice(0, maxLen - 2)
      for (let i = 0; i < chars.length; i++) {
        tokens[i + 1] = BigInt(chars.charCodeAt(i))
      }
      tokens[chars.length + 1] = BigInt(49407)
    }

    const inputTensor = new ort.Tensor('int64', tokens, [1, maxLen])
    const feeds: Record<string, any> = { input_ids: inputTensor }

    const output = await this.clipTextSession.run(feeds)
    const outputTensor = Object.values(output)[0] as any

    return new Float32Array(outputTensor.data)
  }

  /**
   * Preprocess image for CLIP (224x224, RGB, normalized with CLIP mean/std)
   */
  private async preprocessForClip(imagePath: string): Promise<any> {
    const { data } = await sharp(imagePath)
      .resize(224, 224, { fit: 'cover' })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true })

    // CLIP normalization values
    const mean = [0.48145466, 0.4578275, 0.40821073]
    const std = [0.26862954, 0.26130258, 0.27577711]

    const float32Data = new Float32Array(1 * 3 * 224 * 224)

    // CLIP expects NCHW format
    for (let c = 0; c < 3; c++) {
      for (let h = 0; h < 224; h++) {
        for (let w = 0; w < 224; w++) {
          const srcIdx = (h * 224 + w) * 3 + c
          const dstIdx = c * 224 * 224 + h * 224 + w
          float32Data[dstIdx] = (data[srcIdx] / 255.0 - mean[c]) / std[c]
        }
      }
    }

    return new ort.Tensor('float32', float32Data, [1, 3, 224, 224])
  }

  /**
   * Run CLIP zero-shot classification
   */
  private async runClipClassification(imagePath: string): Promise<Array<{ label: string; confidence: number }>> {
    if (!this.clipVisionSession || this.clipTextEmbeddings.size === 0) {
      return []
    }

    try {
      // Get image embedding
      const imageInput = await this.preprocessForClip(imagePath)
      const feeds: Record<string, any> = { pixel_values: imageInput }
      const output = await this.clipVisionSession.run(feeds)
      const imageEmbedding = new Float32Array((Object.values(output)[0] as any).data)
      // Stash the raw embedding so callers (processing-queue) can
      // grab it and persist to media_clip_embeddings for the CLIP
      // search box. Stored on the instance because returning it
      // through the existing return tuple would require touching
      // every caller's destructure pattern.
      ;(this as any).lastImageEmbedding = imageEmbedding

      // Normalize image embedding
      const imageNorm = Math.sqrt(imageEmbedding.reduce((sum, val) => sum + val * val, 0))
      const normalizedImage = imageEmbedding.map(v => v / imageNorm)

      // Compare with all text embeddings
      const results: Array<{ label: string; confidence: number }> = []

      for (const [text, textEmbedding] of this.clipTextEmbeddings) {
        // Normalize text embedding
        const textNorm = Math.sqrt(textEmbedding.reduce((sum, val) => sum + val * val, 0))
        const normalizedText = textEmbedding.map(v => v / textNorm)

        // Cosine similarity
        let similarity = 0
        for (let i = 0; i < normalizedImage.length && i < normalizedText.length; i++) {
          similarity += normalizedImage[i] * normalizedText[i]
        }

        // Convert to probability-like score (0-1)
        const score = (similarity + 1) / 2

        if (score > 0.5) {  // Only include if reasonably confident
          // Extract simple tag from the full text description
          const tag = this.clipTextToTag(text)
          if (tag) {
            results.push({ label: tag, confidence: score })
          }
        }
      }

      return results.sort((a, b) => b.confidence - a.confidence).slice(0, 10)
    } catch (err) {
      console.error('[Tier1] CLIP classification error:', err)
      return []
    }
  }

  /**
   * Convert CLIP text description to a simple tag
   */
  private clipTextToTag(text: string): string | null {
    // Extract the key descriptor from the full text
    const mappings: Record<string, string> = {
      'a photograph of a real person': 'real person',
      'an anime or cartoon illustration': 'anime',
      'a 3D rendered image': '3d render',
      'a drawing or artwork': 'artwork',
      'bedroom scene': 'bedroom',
      'bathroom scene': 'bathroom',
      'outdoor scene': 'outdoors',
      'living room scene': 'living room',
      'office scene': 'office',
      'studio photo': 'studio',
      'beach scene': 'beach',
      'pool scene': 'pool',
      'shower scene': 'shower',
      'close-up shot': 'close-up',
      'medium shot': 'medium shot',
      'full body shot': 'full body',
      'portrait shot': 'portrait',
      'POV shot': 'pov',
      'selfie': 'selfie',
      'one person alone': 'solo',
      'two people together': 'couple',
      'group of people': 'group',
      'fully clothed person': 'clothed',
      'partially clothed person': 'partially clothed',
      'person in underwear or bikini': 'underwear',
      'nude person': 'nude',
      'blonde hair': 'blonde',
      'brunette hair': 'brunette',
      'black hair': 'black hair',
      'red hair': 'redhead',
      'gray hair': 'gray hair',
      'slim body type': 'slim',
      'athletic body type': 'athletic',
      'curvy body type': 'curvy',
      'plus size body type': 'plus size'
    }

    return mappings[text] || null
  }
}
