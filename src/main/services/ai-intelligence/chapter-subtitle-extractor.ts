// File: src/main/services/ai-intelligence/chapter-subtitle-extractor.ts
//
// Extract free scene-boundary signals + dialogue from media files
// without running any ML:
//
//   1. CHAPTERS — many commercial DVD/BD rips ship with chapter markers
//      that already encode scene boundaries. ffprobe -show_chapters
//      parses them in milliseconds. When present, these are MORE
//      reliable than visual scene-detection.
//
//   2. EMBEDDED SUBTITLES — soft subs (subtitle streams in MKV/MP4)
//      via ffmpeg -c:s copy. Cheap when present; tells the AI what
//      dialogue is happening across the video without running Whisper.
//
// Both are used as queue priors in processing-queue: a video with a
// "Chapter 03 - Outdoor" marker at 02:14 gets that span tagged
// outdoor + the chapter title hint surfaces in Tier 2's frame
// extraction window.
//
// This module is "free metadata mining" — runs in ~100ms per file
// and only fires when the file actually has the data.

import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

export interface ChapterMarker {
  startSec: number
  endSec: number
  title: string | null
}

export interface SubtitleStream {
  index: number
  language: string | null
  /** Path to the extracted .srt — caller is responsible for cleanup. */
  srtPath: string
}

export interface ExtractedMetadata {
  chapters: ChapterMarker[]
  subtitles: SubtitleStream[]
}

/**
 * Probe a media file for chapters + subtitle streams. Returns empty
 * arrays when nothing is present. Doesn't throw on common failures
 * (ffmpeg missing, file unreadable) — logs and returns empty so the
 * caller can fall through to other signal sources.
 */
export async function extractChaptersAndSubtitles(
  mediaPath: string,
  ffmpegPath: string,
  ffprobePath: string,
  options?: { extractSubtitles?: boolean; tmpDir?: string }
): Promise<ExtractedMetadata> {
  const empty: ExtractedMetadata = { chapters: [], subtitles: [] }
  if (!fs.existsSync(mediaPath)) return empty

  const chapters = await probeChapters(mediaPath, ffprobePath)
  const subtitles = options?.extractSubtitles !== false
    ? await extractEmbeddedSubtitles(mediaPath, ffmpegPath, ffprobePath, options?.tmpDir)
    : []

  return { chapters, subtitles }
}

async function probeChapters(
  mediaPath: string,
  ffprobePath: string
): Promise<ChapterMarker[]> {
  return new Promise((resolve) => {
    let out = ''
    try {
      const proc = spawn(ffprobePath, [
        '-hide_banner',
        '-print_format', 'json',
        '-show_chapters',
        '-i', mediaPath,
      ], { windowsHide: true })
      proc.stdout?.on('data', (d: Buffer) => { out += d.toString() })
      proc.on('error', () => resolve([]))
      proc.on('close', () => {
        try {
          const parsed = JSON.parse(out || '{}')
          const chapters: any[] = Array.isArray(parsed.chapters) ? parsed.chapters : []
          const result: ChapterMarker[] = chapters.map((c) => ({
            startSec: Number(c.start_time ?? 0),
            endSec: Number(c.end_time ?? 0),
            title: typeof c.tags?.title === 'string' ? c.tags.title : null,
          })).filter((c) => c.endSec > c.startSec)
          if (result.length > 0) {
            console.log(`[ChapterExtractor] Found ${result.length} chapters in ${path.basename(mediaPath)}`)
          }
          resolve(result)
        } catch { resolve([]) }
      })
    } catch { resolve([]) }
  })
}

async function extractEmbeddedSubtitles(
  mediaPath: string,
  ffmpegPath: string,
  ffprobePath: string,
  tmpDir?: string
): Promise<SubtitleStream[]> {
  // First probe to find subtitle streams.
  const streams = await new Promise<Array<{ index: number; language: string | null }>>((resolve) => {
    let out = ''
    try {
      const proc = spawn(ffprobePath, [
        '-hide_banner',
        '-print_format', 'json',
        '-show_streams',
        '-select_streams', 's',  // subtitle streams only
        '-i', mediaPath,
      ], { windowsHide: true })
      proc.stdout?.on('data', (d: Buffer) => { out += d.toString() })
      proc.on('error', () => resolve([]))
      proc.on('close', () => {
        try {
          const parsed = JSON.parse(out || '{}')
          const arr: any[] = Array.isArray(parsed.streams) ? parsed.streams : []
          resolve(arr.map((s) => ({
            index: Number(s.index ?? 0),
            language: typeof s.tags?.language === 'string' ? s.tags.language : null,
          })))
        } catch { resolve([]) }
      })
    } catch { resolve([]) }
  })

  if (streams.length === 0) return []

  // Extract each as a .srt. Use a single-tmp-dir for cleanup hygiene.
  const dir = tmpDir
    ?? path.join(os.tmpdir(), `vault-subs-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`)
  try { fs.mkdirSync(dir, { recursive: true }) } catch { /* exists */ }

  const results: SubtitleStream[] = []
  for (const s of streams) {
    const srtPath = path.join(dir, `track${s.index}.srt`)
    const ok = await new Promise<boolean>((resolve) => {
      try {
        const proc = spawn(ffmpegPath, [
          '-y', '-hide_banner', '-loglevel', 'error',
          '-i', mediaPath,
          '-map', `0:${s.index}`,
          '-c:s', 'srt',  // re-encode to srt (some containers use ass/pgs)
          srtPath,
        ], { windowsHide: true })
        proc.on('error', () => resolve(false))
        proc.on('close', (code) => resolve(code === 0 && fs.existsSync(srtPath)))
      } catch { resolve(false) }
    })
    if (ok) {
      results.push({ index: s.index, language: s.language, srtPath })
    }
  }
  if (results.length > 0) {
    console.log(`[SubtitleExtractor] Extracted ${results.length} subtitle stream(s) from ${path.basename(mediaPath)}`)
  }
  return results
}

/**
 * Cheap parse of a .srt file. Returns segment objects suitable for
 * use as transcript priors in Tier 2's Venice prompt.
 */
export function parseSrt(srtPath: string): Array<{ startSec: number; endSec: number; text: string }> {
  if (!fs.existsSync(srtPath)) return []
  let content: string
  try { content = fs.readFileSync(srtPath, 'utf8') } catch { return [] }

  const segments: Array<{ startSec: number; endSec: number; text: string }> = []
  const blocks = content.split(/\r?\n\r?\n/)
  const timeRe = /(\d{2}):(\d{2}):(\d{2})[,.](\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2})[,.](\d{3})/
  for (const block of blocks) {
    const lines = block.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
    if (lines.length < 2) continue
    const timeLine = lines.find((l) => timeRe.test(l))
    if (!timeLine) continue
    const m = timeRe.exec(timeLine)!
    const startSec = +m[1] * 3600 + +m[2] * 60 + +m[3] + +m[4] / 1000
    const endSec = +m[5] * 3600 + +m[6] * 60 + +m[7] + +m[8] / 1000
    // text lines are everything after the time line. Strip HTML tags
    // sometimes embedded in styled subs.
    const text = lines.slice(lines.indexOf(timeLine) + 1)
      .join(' ')
      .replace(/<[^>]+>/g, '')
      .trim()
    if (text) segments.push({ startSec, endSec, text })
  }
  return segments
}

/**
 * Render chapter + subtitle info into a Venice prompt-injection block.
 * Empty string when neither is available.
 */
export function renderChapterSubtitleBlockForPrompt(meta: ExtractedMetadata): string {
  if (meta.chapters.length === 0 && meta.subtitles.length === 0) return ''
  const lines: string[] = []
  if (meta.chapters.length > 0) {
    lines.push('Embedded chapter markers (likely scene boundaries):')
    for (const c of meta.chapters.slice(0, 20)) {
      const minStart = Math.floor(c.startSec / 60)
      const secStart = Math.floor(c.startSec % 60).toString().padStart(2, '0')
      const title = c.title ? ` — ${c.title}` : ''
      lines.push(`  ${minStart}:${secStart}${title}`)
    }
  }
  if (meta.subtitles.length > 0) {
    // Surface up to 5 short dialogue lines per stream — Venice doesn't
    // need a full transcript, just enough to know what kind of scene
    // this is.
    for (const s of meta.subtitles) {
      const segments = parseSrt(s.srtPath).slice(0, 5)
      if (segments.length === 0) continue
      lines.push(`Embedded subtitle (${s.language ?? 'unknown'}) sample lines:`)
      for (const seg of segments) {
        lines.push(`  ${seg.text.slice(0, 120)}`)
      }
    }
  }
  return `
══════════════════════════════════════════════════════════════════════
EMBEDDED METADATA — chapter markers + subtitle dialogue
══════════════════════════════════════════════════════════════════════
${lines.join('\n')}

Use chapter markers to know where scene boundaries fall (if you tag a
position/act, it likely starts on the nearest chapter boundary). Use
subtitle dialogue to extract context (e.g. "step-sister", "stepmom",
"casting", platform names) and emit those as canonical tags. NEVER
quote subtitle text verbatim in the description.
══════════════════════════════════════════════════════════════════════
`
}
