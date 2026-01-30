// ===============================
// File: src/main/services/tagging/hybrid-tagger.ts
// Unified hybrid tagging system - combines multiple taggers cost-effectively
// ===============================

import { getSmartTagger, type TagSuggestion } from './smart-tagger'
import { aiTagVideo, getAiConfig, type AiTagResult } from '../../ai/aiTagger'
import type { MediaRow } from '../../types'

export interface HybridTagResult {
  mediaId: string
  filename: string

  // Combined results
  tags: Array<{
    name: string
    confidence: number
    sources: ('filename' | 'vision' | 'cloud')[]
  }>

  // Individual results for transparency
  filenameTags: TagSuggestion[]
  visionTags: AiTagResult['tags']
  cloudTags?: AiTagResult['tags']

  // Stats
  processingTime: number
  methodsUsed: string[]
}

export interface HybridTaggerConfig {
  // Enable/disable each tier
  useFilename: boolean      // Tier 1: Smart tagger (always fast & free)
  useVision: boolean        // Tier 2: Ollama vision (free if local)
  useCloud: boolean         // Tier 3: Cloud API (paid, use sparingly)

  // Thresholds
  minConfidence: number     // Minimum confidence to include tag (0-1)
  visionMinTags: number     // Only run vision if filename yields fewer than N tags
  cloudMinTags: number      // Only run cloud if combined yields fewer than N tags

  // Weights for combining
  filenameWeight: number    // Weight for filename-derived tags
  visionWeight: number      // Weight for vision-derived tags
  cloudWeight: number       // Weight for cloud-derived tags
}

const DEFAULT_CONFIG: HybridTaggerConfig = {
  useFilename: true,
  useVision: true,
  useCloud: false,         // Disabled by default (costs money)

  minConfidence: 0.4,
  visionMinTags: 3,        // If filename gives <3 tags, run vision
  cloudMinTags: 2,         // If combined <2 tags, consider cloud

  filenameWeight: 0.7,
  visionWeight: 1.0,
  cloudWeight: 1.0,
}

export class HybridTagger {
  private config: HybridTaggerConfig
  private smartTagger = getSmartTagger()

  constructor(config: Partial<HybridTaggerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config }
  }

  // Check if Ollama is available
  async isVisionAvailable(): Promise<boolean> {
    const aiConfig = getAiConfig()
    if (!aiConfig.enabled || aiConfig.provider !== 'ollama') return false

    try {
      const res = await fetch(new URL('/api/tags', aiConfig.ollamaUrl).toString(), {
        method: 'GET',
        signal: AbortSignal.timeout(3000)
      })
      return res.ok
    } catch {
      return false
    }
  }

  // Analyze a single image with Ollama vision (with timeout)
  private async analyzeImage(imagePath: string): Promise<{ tags: Array<{ name: string; confidence: number }> }> {
    const aiConfig = getAiConfig()
    const fs = await import('fs')

    console.log(`[HybridTagger] Analyzing image: ${imagePath}`)

    const imageB64 = fs.readFileSync(imagePath).toString('base64')
    const tagList = aiConfig.allowedTags.map(t => `"${t}"`).join(', ')

    const prompt = [
      'You are a strict media tagger.',
      'From the allowed tag list ONLY, choose the most relevant tags for this image.',
      'Return JSON ONLY: {"tags":[{"name":"<tag>","confidence":0.0}]}',
      `Allowed tags: [${tagList}]`
    ].join('\n')

    try {
      // 30 second timeout for vision analysis
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 30000)

      const res = await fetch(new URL('/api/chat', aiConfig.ollamaUrl).toString(), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          model: aiConfig.ollamaModel,
          stream: false,
          messages: [
            { role: 'system', content: prompt },
            { role: 'user', content: 'Tag this image.', images: [imageB64] }
          ]
        }),
        signal: controller.signal
      })

      clearTimeout(timeout)

      if (!res.ok) {
        console.log(`[HybridTagger] Ollama returned ${res.status}`)
        return { tags: [] }
      }

      const json = await res.json() as { message?: { content?: string } }
      const text = json?.message?.content ?? ''
      console.log(`[HybridTagger] Got response: ${text.slice(0, 100)}...`)

      const match = text.match(/\{[\s\S]*\}/)
      if (match) {
        const parsed = JSON.parse(match[0])
        if (Array.isArray(parsed.tags)) {
          const tags = parsed.tags
            .filter((t: any) => aiConfig.allowedTags.includes(t.name))
            .map((t: any) => ({ name: t.name, confidence: Math.min(1, Math.max(0, t.confidence)) }))
          console.log(`[HybridTagger] Found ${tags.length} tags`)
          return { tags }
        }
      }
    } catch (e: any) {
      if (e.name === 'AbortError') {
        console.log(`[HybridTagger] Timeout analyzing image`)
      } else {
        console.log(`[HybridTagger] Error: ${e.message}`)
      }
    }

    return { tags: [] }
  }

  // Use AI to suggest a clean, descriptive filename based on content
  async suggestFilename(media: MediaRow): Promise<string | null> {
    const visionAvailable = await this.isVisionAvailable()
    if (!visionAvailable) return null

    const aiConfig = getAiConfig()
    const fs = await import('fs')
    const path = await import('path')

    let imageB64: string

    if (media.type === 'video') {
      // Use thumbnail if available, otherwise skip
      if (!media.thumbPath) return null
      imageB64 = fs.readFileSync(media.thumbPath).toString('base64')
    } else {
      imageB64 = fs.readFileSync(media.path).toString('base64')
    }

    const prompt = [
      'You are a file naming assistant for adult content.',
      'Based on the image, suggest a short, descriptive filename (2-5 words).',
      'Rules:',
      '- Use lowercase with underscores between words',
      '- Be descriptive but tasteful (e.g., "blonde_bedroom_solo", "couple_outdoor_romantic")',
      '- Do NOT include file extension',
      '- Do NOT use offensive or explicit words',
      '- Keep it simple and searchable',
      '',
      'Return ONLY the suggested filename, nothing else.'
    ].join('\n')

    try {
      const res = await fetch(new URL('/api/chat', aiConfig.ollamaUrl).toString(), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          model: aiConfig.ollamaModel,
          stream: false,
          messages: [
            { role: 'system', content: prompt },
            { role: 'user', content: 'Suggest a filename for this content.', images: [imageB64] }
          ]
        })
      })

      if (!res.ok) return null

      const json = await res.json() as { message?: { content?: string } }
      let suggested = json?.message?.content?.trim() ?? ''

      // Clean up the suggestion
      suggested = suggested
        .toLowerCase()
        .replace(/[^a-z0-9_\s]/g, '')
        .replace(/\s+/g, '_')
        .replace(/_+/g, '_')
        .slice(0, 50)

      if (suggested.length < 3) return null

      // Add original extension
      const ext = path.extname(media.path)
      return suggested + ext
    } catch {
      return null
    }
  }

  // Tag a single media item using hybrid approach
  async tagMedia(media: MediaRow): Promise<HybridTagResult> {
    const start = Date.now()
    const methodsUsed: string[] = []

    // Combined tags map: tag name -> { confidence, sources }
    const tagMap = new Map<string, { confidence: number; sources: Set<string> }>()

    // Tier 1: Filename analysis (always run - instant & free)
    let filenameTags: TagSuggestion[] = []
    if (this.config.useFilename) {
      const result = this.smartTagger.analyzeFilename(media.path)
      filenameTags = result.suggestedTags
      methodsUsed.push('filename')

      for (const tag of filenameTags) {
        const weighted = tag.confidence * this.config.filenameWeight
        if (tagMap.has(tag.tag)) {
          const existing = tagMap.get(tag.tag)!
          existing.confidence = Math.max(existing.confidence, weighted)
          existing.sources.add('filename')
        } else {
          tagMap.set(tag.tag, { confidence: weighted, sources: new Set(['filename']) })
        }
      }
    }

    // Tier 2: Vision analysis (run if needed and available)
    let visionTags: AiTagResult['tags'] = []
    const highConfidenceTags = Array.from(tagMap.values()).filter(t => t.confidence >= this.config.minConfidence)

    // Run vision for videos OR images if we don't have enough tags
    if (this.config.useVision &&
        (media.type === 'video' || media.type === 'image' || media.type === 'gif') &&
        highConfidenceTags.length < this.config.visionMinTags) {

      const visionAvailable = await this.isVisionAvailable()
      if (visionAvailable) {
        try {
          // For images, we can analyze directly; for videos, extract frames
          if (media.type === 'video') {
            const result = await aiTagVideo(media.path)
            visionTags = result.tags
          } else {
            // For images/gifs, use Ollama directly with the image
            const result = await this.analyzeImage(media.path)
            visionTags = result.tags
          }
          methodsUsed.push('vision')

          for (const tag of visionTags) {
            const weighted = tag.confidence * this.config.visionWeight
            if (tagMap.has(tag.name)) {
              const existing = tagMap.get(tag.name)!
              // Boost confidence when multiple sources agree
              existing.confidence = Math.min(1.0, existing.confidence + weighted * 0.5)
              existing.sources.add('vision')
            } else {
              tagMap.set(tag.name, { confidence: weighted, sources: new Set(['vision']) })
            }
          }
        } catch (e) {
          console.error('[HybridTagger] Vision analysis failed:', e)
        }
      }
    }

    // Tier 3: Cloud API (only if really needed and enabled)
    // TODO: Implement cloud API integration (OpenAI Vision, Claude, etc.)
    // For now this is a placeholder
    let cloudTags: AiTagResult['tags'] | undefined

    // Build final results
    const tags = Array.from(tagMap.entries())
      .map(([name, data]) => ({
        name,
        confidence: data.confidence,
        sources: Array.from(data.sources) as ('filename' | 'vision' | 'cloud')[]
      }))
      .filter(t => t.confidence >= this.config.minConfidence)
      .sort((a, b) => b.confidence - a.confidence)

    return {
      mediaId: media.id,
      filename: media.filename,
      tags,
      filenameTags,
      visionTags,
      cloudTags,
      processingTime: Date.now() - start,
      methodsUsed
    }
  }

  // Batch tag multiple media items with progress callback
  async tagBatch(
    mediaList: MediaRow[],
    onProgress?: (completed: number, total: number, current: MediaRow) => void
  ): Promise<HybridTagResult[]> {
    const results: HybridTagResult[] = []

    for (let i = 0; i < mediaList.length; i++) {
      const media = mediaList[i]
      onProgress?.(i, mediaList.length, media)

      try {
        const result = await this.tagMedia(media)
        results.push(result)
      } catch (e) {
        console.error(`[HybridTagger] Failed to tag ${media.filename}:`, e)
        results.push({
          mediaId: media.id,
          filename: media.filename,
          tags: [],
          filenameTags: [],
          visionTags: [],
          processingTime: 0,
          methodsUsed: []
        })
      }
    }

    onProgress?.(mediaList.length, mediaList.length, mediaList[mediaList.length - 1])
    return results
  }

  // Get suggested tags for untagged or poorly-tagged media
  async getSuggestionsForMedia(media: MediaRow, existingTags: string[]): Promise<string[]> {
    const result = await this.tagMedia(media)

    // Filter out tags that already exist
    const existingSet = new Set(existingTags.map(t => t.toLowerCase()))
    const newTags = result.tags
      .filter(t => !existingSet.has(t.name.toLowerCase()))
      .map(t => t.name)

    return newTags
  }

  // Auto-tag all untagged media in batches
  async autoTagUntagged(
    getUntaggedMedia: () => Promise<MediaRow[]>,
    applyTags: (mediaId: string, tags: string[]) => Promise<void>,
    options?: {
      batchSize?: number
      maxItems?: number
      onProgress?: (completed: number, total: number) => void
    }
  ): Promise<{ tagged: number; failed: number }> {
    const batchSize = options?.batchSize ?? 10
    const maxItems = options?.maxItems ?? 1000

    let tagged = 0
    let failed = 0

    const untagged = await getUntaggedMedia()
    const toProcess = untagged.slice(0, maxItems)

    for (let i = 0; i < toProcess.length; i += batchSize) {
      const batch = toProcess.slice(i, i + batchSize)
      const results = await this.tagBatch(batch)

      for (const result of results) {
        if (result.tags.length > 0) {
          try {
            await applyTags(result.mediaId, result.tags.map(t => t.name))
            tagged++
          } catch {
            failed++
          }
        }
      }

      options?.onProgress?.(Math.min(i + batchSize, toProcess.length), toProcess.length)
    }

    return { tagged, failed }
  }
}

// Singleton
let instance: HybridTagger | null = null

export function getHybridTagger(config?: Partial<HybridTaggerConfig>): HybridTagger {
  if (!instance || config) {
    instance = new HybridTagger(config)
  }
  return instance
}
