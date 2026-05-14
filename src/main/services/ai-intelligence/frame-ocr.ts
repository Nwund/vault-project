// File: src/main/services/ai-intelligence/frame-ocr.ts
//
// Optical character recognition pass over extracted frames. Detects
// burned-in text — Snapchat/OnlyFans/TikTok usernames, performer name
// overlays, on-screen captions, watermarks. Feeds the extracted text
// to Tier 2 as context AND auto-emits canonical platform tags when
// platform indicators are recognized.
//
// Implementation: tesseract.js worker pool. We init lazily (model
// download is ~10MB) and reuse the worker across frames in one call.
// Fast path is to OCR a downsampled greyscale crop — burned-in text is
// usually high-contrast and reads fine at 640px wide.

import fs from 'node:fs'
import path from 'node:path'
import { app } from 'electron'

let tesseract: any = null
let workerPromise: Promise<any> | null = null
let workerInitFailed = false

// Lazy-init the OCR worker. Returns null if tesseract.js can't load
// (model fetch failure, etc.) so callers can skip cleanly.
async function getWorker(): Promise<any> {
  if (workerInitFailed) return null
  if (!tesseract) {
    try {
      tesseract = await import('tesseract.js')
    } catch (err) {
      console.warn('[FrameOCR] tesseract.js failed to load:', err)
      workerInitFailed = true
      return null
    }
  }
  if (!workerPromise) {
    workerPromise = (async () => {
      try {
        // Cache the model in userData so the 10MB download is one-time.
        const cachePath = path.join(app.getPath('userData'), 'tesseract-cache')
        if (!fs.existsSync(cachePath)) fs.mkdirSync(cachePath, { recursive: true })
        const w = await tesseract.createWorker('eng', 1, {
          cachePath,
          logger: () => { /* swallow tesseract's noisy progress logs */ }
        })
        console.log('[FrameOCR] Tesseract worker ready')
        return w
      } catch (err) {
        console.warn('[FrameOCR] Worker init failed:', err)
        workerInitFailed = true
        workerPromise = null
        return null
      }
    })()
  }
  return workerPromise
}

export interface FrameOcrResult {
  /** Raw concatenated text from all frames. Empty if nothing recognized. */
  rawText: string
  /** Confidence-thresholded text lines from all frames, deduped. */
  lines: string[]
  /** Detected platforms inferred from the text (snapchat / onlyfans / etc.). */
  platforms: string[]
  /** Detected social handles / usernames (@foo style). */
  handles: string[]
}

// Patterns that map text content → canonical platform tags. Order
// matters when multiple match — earlier wins.
const PLATFORM_PATTERNS: Array<{ regex: RegExp; tag: string }> = [
  { regex: /\bsnapchat\b|👻|tap to load|swipe up|story|chat with me on snap/i, tag: 'snapchat' },
  { regex: /\bonly\s?fans\b|onlyfans\.com|of\.com\/|fans\.ly/i, tag: 'onlyfans' },
  { regex: /\btiktok\b|tiktok\.com/i, tag: 'tiktok' },
  { regex: /\binstagram\b|instagram\.com|@\w+ on ig/i, tag: 'instagram' },
  { regex: /\btwitter\b|twitter\.com|\bx\.com\b/i, tag: 'twitter' },
  { regex: /\breddit\b|reddit\.com|r\/\w+/i, tag: 'reddit' },
  { regex: /\bdiscord\b|discord\.gg|discord\.com\/invite/i, tag: 'discord' },
  { regex: /chaturbate|stripchat|cam ?soda|myfreecams|cam ?girl/i, tag: 'webcam' },
  { regex: /pornhub|brazzers|bangbros|reality kings|naughty america|mofos|teamskeet|adult time|family strokes/i, tag: 'professional' },
]

// Strip noise that OCR often emits on adult content (sub-letter
// fragments, single chars, gibberish). Keep lines that look like real
// words, handles, or recognizable phrases.
function isJunkLine(line: string): boolean {
  const trimmed = line.trim()
  if (trimmed.length < 3) return true
  // Must contain at least one vowel — filters consonant noise.
  if (!/[aeiouAEIOU]/.test(trimmed)) return true
  // Must contain at least 60% letter/digit/space chars.
  const valid = trimmed.replace(/[a-zA-Z0-9\s@_.]/g, '').length
  if (valid / trimmed.length > 0.4) return true
  return false
}

/**
 * Run OCR on a list of frame paths. Returns aggregated text + detected
 * platforms + handles. Skips silently if tesseract.js can't init.
 *
 * @param framePaths up to N frames to scan (caller controls batch size;
 *                   we recommend 3-4 sampled frames per video — text
 *                   tends to be static so more frames just costs time)
 * @param confidenceFloor 0-100; lines below this confidence are dropped
 */
export async function extractTextFromFrames(
  framePaths: string[],
  confidenceFloor = 60,
  options?: { engine?: 'tesseract' | 'db-crnn' | 'auto' }
): Promise<FrameOcrResult> {
  const empty: FrameOcrResult = { rawText: '', lines: [], platforms: [], handles: [] }
  const engine = options?.engine ?? 'auto'

  const allLines = new Set<string>()
  const allText: string[] = []

  // Prefer DB+CRNN ONNX when the user has installed both models AND
  // opted in (engine === 'db-crnn' or 'auto'). Falls back to
  // tesseract when ONNX isn't available or returns nothing — many
  // burned-in fonts read better through tesseract's well-tuned
  // language model.
  let useDbCrnn = false
  if (engine === 'db-crnn' || engine === 'auto') {
    try {
      const { isDbCrnnOcrAvailable } = await import('./paddle-ocr')
      useDbCrnn = isDbCrnnOcrAvailable()
    } catch { /* paddle module not present */ }
  }

  if (useDbCrnn) {
    const { runDbCrnnOcr } = await import('./paddle-ocr')
    for (const framePath of framePaths) {
      if (!fs.existsSync(framePath)) continue
      try {
        const lines = await runDbCrnnOcr(framePath)
        for (const t of lines) {
          if (isJunkLine(t)) continue
          allLines.add(t)
        }
        if (lines.length > 0) allText.push(lines.join('\n'))
      } catch (err) {
        console.warn('[FrameOCR] DB+CRNN failed for frame, skipping:', err)
      }
    }
    // When db-crnn yields nothing but the user explicitly chose
    // db-crnn, don't silently fall back — return empty so the user
    // notices the models aren't producing output.
    if (engine === 'db-crnn' || allLines.size > 0) {
      const rawText = allText.join('\n').trim()
      const linesArr = Array.from(allLines)
      const platforms = new Set<string>()
      const corpus = (rawText + ' ' + linesArr.join(' ')).toLowerCase()
      for (const { regex, tag } of PLATFORM_PATTERNS) {
        if (regex.test(corpus)) platforms.add(tag)
      }
      const handleRegex = /@([a-zA-Z0-9_.]{3,30})/g
      const handles = new Set<string>()
      let m: RegExpExecArray | null
      while ((m = handleRegex.exec(rawText)) !== null) handles.add(m[1].toLowerCase())
      return {
        rawText,
        lines: linesArr,
        platforms: Array.from(platforms),
        handles: Array.from(handles),
      }
    }
    // Fall through to tesseract.
  }

  if (engine === 'db-crnn') return empty  // explicit choice + unavailable = give up

  const worker = await getWorker()
  if (!worker) return empty

  for (const framePath of framePaths) {
    if (!fs.existsSync(framePath)) continue
    try {
      const { data } = await worker.recognize(framePath)
      const text = (data?.text ?? '').trim()
      if (text) allText.push(text)
      // tesseract.js v5+ returns `lines` with confidence per line.
      const lines: Array<{ text: string; confidence: number }> = data?.lines ?? []
      for (const ln of lines) {
        const t = String(ln.text ?? '').trim()
        if (!t) continue
        if (ln.confidence < confidenceFloor) continue
        if (isJunkLine(t)) continue
        allLines.add(t)
      }
    } catch (err) {
      console.warn(`[FrameOCR] Recognition failed for ${path.basename(framePath)}:`, err)
    }
  }

  const rawText = allText.join('\n').trim()
  const linesArr = Array.from(allLines)

  // Detect platforms
  const platforms = new Set<string>()
  const corpus = (rawText + ' ' + linesArr.join(' ')).toLowerCase()
  for (const { regex, tag } of PLATFORM_PATTERNS) {
    if (regex.test(corpus)) platforms.add(tag)
  }

  // Detect handles (@foo, with username chars only)
  const handleRegex = /@([a-zA-Z0-9_.]{3,30})/g
  const handles = new Set<string>()
  let m: RegExpExecArray | null
  while ((m = handleRegex.exec(rawText)) !== null) {
    handles.add(m[1].toLowerCase())
  }

  return {
    rawText,
    lines: linesArr,
    platforms: Array.from(platforms),
    handles: Array.from(handles),
  }
}

/**
 * Render an OCR result as a prompt block to inject into the Tier 2
 * Venice prompt. Empty string when OCR is empty.
 */
export function renderOcrBlockForPrompt(result: FrameOcrResult): string {
  if (!result.rawText && result.lines.length === 0) return ''
  const lines: string[] = []
  if (result.platforms.length > 0) {
    lines.push(`Platform indicators detected: ${result.platforms.join(', ')}`)
  }
  if (result.handles.length > 0) {
    lines.push(`Handles detected: ${result.handles.slice(0, 5).map((h) => '@' + h).join(', ')}`)
  }
  if (result.lines.length > 0) {
    lines.push(`On-screen text:`)
    for (const ln of result.lines.slice(0, 8)) {
      lines.push(`  • ${ln}`)
    }
  }
  return `

═══════════════════════════════════════════════════════════════════════
OCR — burned-in text detected on frames
═══════════════════════════════════════════════════════════════════════
${lines.join('\n')}

Use these as STRONG signals: platform indicators → emit the platform
tag (snapchat / onlyfans / tiktok / etc). Handles → include in title
or description when relevant. On-screen text → reflect in description
if it conveys the situation.
═══════════════════════════════════════════════════════════════════════
`
}
