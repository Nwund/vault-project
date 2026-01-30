// ===============================
// File: src/main/services/ai/ai-library-tools.ts
// AI-powered library maintenance tools
// ===============================

import fs from 'node:fs'
import path from 'node:path'
import { getAiConfig } from '../../ai/aiTagger'
import type { MediaRow } from '../../types'

interface OllamaResponse {
  message?: { content?: string }
}

// Check if Ollama is available
export async function isOllamaAvailable(): Promise<boolean> {
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

// ═══════════════════════════════════════════════════════════════════════════
// AI TAG CLEANING - Normalize, merge similar, fix typos
// ═══════════════════════════════════════════════════════════════════════════

interface TagCleanupResult {
  original: string
  cleaned: string
  action: 'keep' | 'rename' | 'merge' | 'delete'
  mergeInto?: string
  reason?: string
}

export async function aiCleanupTags(
  existingTags: Array<{ name: string; count: number }>,
  onProgress?: (current: number, total: number, tag: string) => void
): Promise<{
  success: boolean
  results: TagCleanupResult[]
  merged: number
  renamed: number
  deleted: number
}> {
  const available = await isOllamaAvailable()
  if (!available) {
    return { success: false, results: [], merged: 0, renamed: 0, deleted: 0 }
  }

  const aiConfig = getAiConfig()
  const results: TagCleanupResult[] = []
  let merged = 0, renamed = 0, deleted = 0

  // Build context of all tags for the AI
  const tagList = existingTags.map(t => `"${t.name}" (${t.count} videos)`).join(', ')

  const systemPrompt = `You are a tag management assistant for an adult media library.
Your job is to clean up and normalize tags.

Rules:
- Merge similar tags (e.g., "blowjob" and "bj" should merge into "blowjob")
- Fix typos (e.g., "blowjib" -> "blowjob")
- Normalize casing (prefer lowercase)
- Delete useless tags (random strings, URLs, numbers only, gibberish)
- Keep descriptive, meaningful tags
- When merging, prefer the more common/descriptive version

For each tag, respond with JSON:
{"action": "keep|rename|merge|delete", "newName": "cleaned name if rename", "mergeInto": "target tag if merge", "reason": "brief explanation"}

Current tags in library: [${tagList}]`

  // Process tags in batches to avoid overwhelming the AI
  const batchSize = 10
  for (let i = 0; i < existingTags.length; i += batchSize) {
    const batch = existingTags.slice(i, i + batchSize)

    for (const tag of batch) {
      onProgress?.(i + batch.indexOf(tag), existingTags.length, tag.name)

      try {
        const res = await fetch(new URL('/api/chat', aiConfig.ollamaUrl).toString(), {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            model: 'llama3.1',  // Use text model for this
            stream: false,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: `Analyze this tag: "${tag.name}" (used on ${tag.count} items). Should it be kept, renamed, merged, or deleted?` }
            ]
          })
        })

        if (!res.ok) {
          results.push({ original: tag.name, cleaned: tag.name, action: 'keep' })
          continue
        }

        const json = await res.json() as OllamaResponse
        const text = json?.message?.content ?? ''

        // Parse JSON response
        const match = text.match(/\{[\s\S]*\}/)
        if (match) {
          const parsed = JSON.parse(match[0])
          const action = parsed.action as 'keep' | 'rename' | 'merge' | 'delete'

          results.push({
            original: tag.name,
            cleaned: parsed.newName || tag.name,
            action,
            mergeInto: parsed.mergeInto,
            reason: parsed.reason
          })

          if (action === 'merge') merged++
          else if (action === 'rename') renamed++
          else if (action === 'delete') deleted++
        } else {
          results.push({ original: tag.name, cleaned: tag.name, action: 'keep' })
        }
      } catch (e) {
        console.error(`[AI] Failed to analyze tag "${tag.name}":`, e)
        results.push({ original: tag.name, cleaned: tag.name, action: 'keep' })
      }
    }
  }

  return { success: true, results, merged, renamed, deleted }
}

// ═══════════════════════════════════════════════════════════════════════════
// AI TAG CREATION - Create new tags dynamically from video content
// ═══════════════════════════════════════════════════════════════════════════

export interface AiGeneratedTag {
  name: string
  confidence: number
  isNew: boolean  // true if this is a newly created tag
}

export async function aiGenerateTags(
  media: MediaRow,
  existingTags: string[],
  existingLibraryTags: string[]  // All tags that exist in the library
): Promise<{
  success: boolean
  tags: AiGeneratedTag[]
  rawResponse?: string
}> {
  const available = await isOllamaAvailable()
  if (!available) {
    return { success: false, tags: [] }
  }

  const aiConfig = getAiConfig()

  // Get image to analyze
  let imageB64: string
  try {
    if (media.type === 'video' && media.thumbPath && fs.existsSync(media.thumbPath)) {
      imageB64 = fs.readFileSync(media.thumbPath).toString('base64')
    } else if ((media.type === 'image' || media.type === 'gif') && fs.existsSync(media.path)) {
      imageB64 = fs.readFileSync(media.path).toString('base64')
    } else {
      return { success: false, tags: [] }
    }
  } catch {
    return { success: false, tags: [] }
  }

  const existingLibraryList = existingLibraryTags.slice(0, 100).map(t => `"${t}"`).join(', ')

  const prompt = `You are a creative media tagger for adult content.
Your job is to generate descriptive, useful tags for this content.

IMPORTANT RULES:
1. You CAN create new tags that don't exist yet - be creative but tasteful
2. Prefer using existing library tags when they fit: [${existingLibraryList}]
3. Tags should be lowercase, 1-3 words each
4. Create tags for: actions, positions, settings, attributes, mood
5. Be specific and descriptive (e.g., "outdoor pool", "red lingerie", "POV angle")
6. Avoid generic tags like "video" or "hot"
7. Maximum 8 tags per item

Current tags on this item: [${existingTags.join(', ')}]

Return JSON ONLY: {"tags": [{"name": "tag name", "confidence": 0.0-1.0}]}`

  try {
    const res = await fetch(new URL('/api/chat', aiConfig.ollamaUrl).toString(), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: aiConfig.ollamaModel,  // Vision model (llava)
        stream: false,
        messages: [
          { role: 'system', content: prompt },
          { role: 'user', content: 'Generate tags for this content.', images: [imageB64] }
        ]
      })
    })

    if (!res.ok) {
      return { success: false, tags: [] }
    }

    const json = await res.json() as OllamaResponse
    const text = json?.message?.content ?? ''

    const match = text.match(/\{[\s\S]*\}/)
    if (!match) {
      return { success: false, tags: [], rawResponse: text }
    }

    const parsed = JSON.parse(match[0])
    if (!Array.isArray(parsed.tags)) {
      return { success: false, tags: [], rawResponse: text }
    }

    const existingLibrarySet = new Set(existingLibraryTags.map(t => t.toLowerCase()))
    const existingOnItemSet = new Set(existingTags.map(t => t.toLowerCase()))

    const tags: AiGeneratedTag[] = parsed.tags
      .filter((t: any) => t.name && typeof t.name === 'string')
      .map((t: any) => {
        const name = String(t.name).toLowerCase().trim().slice(0, 50)
        return {
          name,
          confidence: Math.min(1, Math.max(0, Number(t.confidence) || 0.5)),
          isNew: !existingLibrarySet.has(name)
        }
      })
      .filter((t: AiGeneratedTag) =>
        t.name.length >= 2 &&
        t.name.length <= 50 &&
        !existingOnItemSet.has(t.name)
      )
      .slice(0, 8)

    return { success: true, tags, rawResponse: text }
  } catch (e) {
    console.error('[AI] Failed to generate tags:', e)
    return { success: false, tags: [] }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// AI FILE RENAMING - Generate clean, descriptive filenames from video content
// ═══════════════════════════════════════════════════════════════════════════

export async function aiSuggestFilename(
  media: MediaRow,
  tags: string[]
): Promise<{
  success: boolean
  suggestedName: string | null
  reason?: string
}> {
  const available = await isOllamaAvailable()
  if (!available) {
    console.log(`[AI Rename] Ollama not available`)
    return { success: false, suggestedName: null, reason: 'Ollama not available' }
  }

  const aiConfig = getAiConfig()

  // Get image to analyze
  let imageB64: string
  let imagePath: string
  try {
    if (media.type === 'video' && media.thumbPath && fs.existsSync(media.thumbPath)) {
      imagePath = media.thumbPath
      imageB64 = fs.readFileSync(media.thumbPath).toString('base64')
    } else if ((media.type === 'image' || media.type === 'gif') && fs.existsSync(media.path)) {
      imagePath = media.path
      imageB64 = fs.readFileSync(media.path).toString('base64')
    } else {
      console.log(`[AI Rename] No image available for: ${media.filename}`)
      return { success: false, suggestedName: null, reason: 'No thumbnail available' }
    }
  } catch (e) {
    console.log(`[AI Rename] Failed to read image for: ${media.filename}`, e)
    return { success: false, suggestedName: null, reason: 'Failed to read image' }
  }

  console.log(`[AI Rename] Analyzing: ${media.filename} using image: ${imagePath}`)

  const prompt = `You are a file naming assistant for adult media.
Generate a clean, descriptive filename based on the image content.

RULES:
1. Use Title Case With Spaces (e.g., "Blonde Beach Solo Session")
2. Be descriptive but tasteful (2-6 words)
3. Focus on setting, appearance, mood
4. Do NOT include file extension
5. Do NOT use explicit/vulgar words
6. Make it searchable and memorable
7. Current tags for context: [${tags.join(', ')}]
8. Current filename: "${media.filename}"

Return ONLY the suggested filename, nothing else.`

  try {
    const res = await fetch(new URL('/api/chat', aiConfig.ollamaUrl).toString(), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: aiConfig.ollamaModel,
        stream: false,
        messages: [
          { role: 'system', content: prompt },
          { role: 'user', content: 'Suggest a clean, descriptive filename for this content.', images: [imageB64] }
        ]
      })
    })

    if (!res.ok) {
      console.log(`[AI Rename] Ollama request failed: ${res.status}`)
      return { success: false, suggestedName: null, reason: `Ollama error: ${res.status}` }
    }

    const json = await res.json() as OllamaResponse
    let suggested = json?.message?.content?.trim() ?? ''
    console.log(`[AI Rename] Raw suggestion for ${media.filename}: "${suggested}"`)

    // Clean up the suggestion
    suggested = suggested
      .replace(/^["']|["']$/g, '')  // Remove quotes
      .replace(/\.[a-z0-9]{2,4}$/i, '')  // Remove extension if included
      .replace(/[<>:"/\\|?*]/g, '')  // Remove invalid chars
      .trim()
      .slice(0, 100)

    if (suggested.length < 3) {
      console.log(`[AI Rename] Suggestion too short, skipping`)
      return { success: false, suggestedName: null, reason: 'Suggestion too short' }
    }

    // Add original extension
    const ext = path.extname(media.path)
    console.log(`[AI Rename] Final suggestion: "${suggested}${ext}"`)
    return { success: true, suggestedName: suggested + ext }
  } catch (e) {
    console.error('[AI] Failed to suggest filename:', e)
    return { success: false, suggestedName: null }
  }
}

// Batch rename files using AI
export async function aiBatchRename(
  mediaList: MediaRow[],
  getTagsForMedia: (mediaId: string) => string[],
  renameFile: (mediaId: string, newName: string) => Promise<boolean>,
  onProgress?: (current: number, total: number, filename: string) => void
): Promise<{
  success: boolean
  renamed: number
  skipped: number
  failed: number
  errors: string[]
}> {
  let renamed = 0, skipped = 0, failed = 0
  const errors: string[] = []

  for (let i = 0; i < mediaList.length; i++) {
    const media = mediaList[i]
    onProgress?.(i, mediaList.length, media.filename)

    try {
      const tags = getTagsForMedia(media.id)
      const result = await aiSuggestFilename(media, tags)

      if (!result.success || !result.suggestedName) {
        skipped++
        continue
      }

      // Skip if name is essentially the same
      const currentBasename = path.basename(media.path, path.extname(media.path))
      const suggestedBasename = path.basename(result.suggestedName, path.extname(result.suggestedName))

      if (currentBasename.toLowerCase() === suggestedBasename.toLowerCase()) {
        skipped++
        continue
      }

      // Rename the file
      const success = await renameFile(media.id, result.suggestedName)
      if (success) {
        renamed++
        console.log(`[AI Rename] ${media.filename} -> ${result.suggestedName}`)
      } else {
        failed++
      }
    } catch (e: any) {
      failed++
      if (errors.length < 10) {
        errors.push(`${media.filename}: ${e.message}`)
      }
    }
  }

  return { success: true, renamed, skipped, failed, errors }
}
