// File: src/main/services/sprite-sheet-chapters.ts
//
// #316 E-92 — Sprite-sheet chapter editor backend. Generates a
// contact-sheet PNG of N evenly-spaced thumbnails from a video, plus
// a metadata JSON mapping cell index → timestamp. The renderer
// displays the sprite, lets the user pick which cells become chapter
// markers + name them, then we re-use #233 chapter-roundtrip to
// either embed FFmetadata or export a WebVTT sidecar.
//
// Sheet layout: rectangular grid. Default 8 cols × N rows (one row
// per 8 thumbnails, capped at 16 rows = 128 thumbnails). Thumbnail
// size 192×108 (16:9) — same as the existing thumb generator.

import { spawn } from 'node:child_process'
import { promises as fsp } from 'node:fs'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import { nanoid } from 'nanoid'

export interface SpriteSheetResult {
  ok: boolean
  spritePath?: string
  cols?: number
  rows?: number
  thumbWidth?: number
  thumbHeight?: number
  cells?: Array<{ idx: number; timeSec: number; col: number; row: number }>
  error?: string
}

export async function generateSpriteSheet(
  ffmpegPath: string,
  srcPath: string,
  durationSec: number,
  options: { cells?: number; cols?: number; thumbWidth?: number; thumbHeight?: number; dstPath?: string } = {},
): Promise<SpriteSheetResult> {
  const cells = Math.max(8, Math.min(options.cells ?? 64, 128))
  const cols = options.cols ?? 8
  const rows = Math.ceil(cells / cols)
  const tw = options.thumbWidth ?? 192
  const th = options.thumbHeight ?? 108
  const tmpDir = path.join(os.tmpdir(), `vault-sprite-${nanoid(6)}`)
  const dstPath = options.dstPath ?? path.join(os.tmpdir(), `vault-sprite-${nanoid(6)}.png`)
  try {
    await fsp.mkdir(tmpDir, { recursive: true })
    // Step 1: extract `cells` evenly-spaced frames via select=eq(n,...) is hard;
    // simpler is `fps=1/<interval>` where interval = duration/cells. Edge case:
    // very short videos → bump the rate.
    const intervalSec = Math.max(0.1, durationSec / cells)
    const fpsRate = 1 / intervalSec
    const extractOk = await new Promise<boolean>((resolve) => {
      const proc = spawn(ffmpegPath, [
        '-hide_banner', '-y', '-loglevel', 'error',
        '-i', srcPath,
        '-vf', `fps=${fpsRate.toFixed(4)},scale=${tw}:${th}:force_original_aspect_ratio=decrease,pad=${tw}:${th}:(ow-iw)/2:(oh-ih)/2`,
        '-vframes', String(cells),
        '-q:v', '3',
        path.join(tmpDir, 'cell_%04d.jpg'),
      ], { windowsHide: true })
      proc.on('error', () => resolve(false))
      proc.on('close', (code) => resolve(code === 0))
    })
    if (!extractOk) return { ok: false, error: 'ffmpeg extraction failed' }
    // Step 2: tile them with ffmpeg's tile filter into one PNG.
    const tileOk = await new Promise<boolean>((resolve) => {
      const proc = spawn(ffmpegPath, [
        '-hide_banner', '-y', '-loglevel', 'error',
        '-pattern_type', 'sequence', '-start_number', '1',
        '-i', path.join(tmpDir, 'cell_%04d.jpg'),
        '-vf', `tile=${cols}x${rows}:padding=2:color=black`,
        '-frames:v', '1',
        dstPath,
      ], { windowsHide: true })
      proc.on('error', () => resolve(false))
      proc.on('close', (code) => resolve(code === 0))
    })
    if (!tileOk) return { ok: false, error: 'ffmpeg tile failed' }

    const cellsArr: Array<{ idx: number; timeSec: number; col: number; row: number }> = []
    for (let i = 0; i < cells; i++) {
      cellsArr.push({
        idx: i,
        timeSec: i * intervalSec,
        col: i % cols,
        row: Math.floor(i / cols),
      })
    }
    return {
      ok: true,
      spritePath: dstPath,
      cols, rows, thumbWidth: tw, thumbHeight: th,
      cells: cellsArr,
    }
  } finally {
    // Clean per-cell temp files.
    try {
      const files = await fsp.readdir(tmpDir)
      await Promise.all(files.map((f) => fsp.unlink(path.join(tmpDir, f)).catch(() => {})))
      await fsp.rmdir(tmpDir)
    } catch { /* ignore */ }
  }
}

// Take a set of picked cell indices + titles → a sorted Chapter[] ready
// for the chapter-roundtrip's writeChaptersFFMeta or exportChaptersAsVtt.
export function buildChaptersFromPicks(
  picks: Array<{ cellIdx: number; title: string; timeSec: number }>,
  durationSec: number,
): Array<{ startSec: number; endSec: number; title: string }> {
  const sorted = [...picks].sort((a, b) => a.timeSec - b.timeSec)
  const out: Array<{ startSec: number; endSec: number; title: string }> = []
  for (let i = 0; i < sorted.length; i++) {
    const start = sorted[i].timeSec
    const end = i + 1 < sorted.length ? sorted[i + 1].timeSec : durationSec
    out.push({ startSec: start, endSec: end, title: sorted[i].title || `Chapter ${i + 1}` })
  }
  return out
}
