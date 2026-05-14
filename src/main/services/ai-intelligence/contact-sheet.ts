// File: src/main/services/ai-intelligence/contact-sheet.ts
//
// Generate contact-sheet thumbnails (filmstrip / screenshot grid) for
// videos. Inspired by YAPO-e-plus's per-scene contact sheet feature.
// Stored next to the existing per-media thumb so the review UI can
// show a 3x4 grid of frames at a glance — much more informative than
// a single keyframe when deciding if AI tags are right.
//
// Output: PNG saved at <thumbDir>/<mediaId>-sheet.png (e.g. 1920×1080
// composited as 4 cols × 3 rows of 480×270 tiles).

import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { app } from 'electron'

export interface ContactSheetOptions {
  cols?: number       // default 4
  rows?: number       // default 3
  tileWidth?: number  // default 480
  durationSec?: number | null
  /** vcsi-style layout preset. When set, overrides cols/rows. */
  preset?: ContactSheetPreset
  /**
   * Drop near-identical frames via FFmpeg's `mpdecimate` filter before
   * tiling. Useful for long, static videos (talking-head, ASMR) where
   * an evenly-spaced 12-frame grid would otherwise repeat the same
   * shot. Defaults to `true`; pass `false` for music videos or
   * action-heavy content where every sampled frame is meaningfully
   * different already.
   */
  dedupFrames?: boolean
}

/**
 * Named layout presets — vcsi-style "give me one of the common
 * grids" interface so callers don't have to think in cols/rows.
 * Each preset is tuned for a specific UI context:
 *
 *   review     4×3 @ 480px tiles — full review-pane contact sheet
 *   thumb      3×3 @ 320px tiles — library hover preview
 *   hover      4×1 @ 240px tiles — small filmstrip on card hover
 *   wall       5×4 @ 240px tiles — high-density playlist wall view
 *   summary    2×2 @ 640px tiles — 4-frame summary for export
 */
export type ContactSheetPreset = 'review' | 'thumb' | 'hover' | 'wall' | 'summary'

const PRESET_LAYOUTS: Record<ContactSheetPreset, { cols: number; rows: number; tileWidth: number }> = {
  review:  { cols: 4, rows: 3, tileWidth: 480 },
  thumb:   { cols: 3, rows: 3, tileWidth: 320 },
  hover:   { cols: 4, rows: 1, tileWidth: 240 },
  wall:    { cols: 5, rows: 4, tileWidth: 240 },
  summary: { cols: 2, rows: 2, tileWidth: 640 },
}

/**
 * Resolve preset → layout. Caller can still override individual
 * fields by passing them alongside a preset; explicit fields win.
 */
export function resolveContactSheetLayout(options: ContactSheetOptions): {
  cols: number; rows: number; tileWidth: number
} {
  const preset = options.preset ? PRESET_LAYOUTS[options.preset] : null
  return {
    cols: options.cols ?? preset?.cols ?? 4,
    rows: options.rows ?? preset?.rows ?? 3,
    tileWidth: options.tileWidth ?? preset?.tileWidth ?? 480,
  }
}

/**
 * Build a contact sheet for the given video using a single FFmpeg call.
 * Uses the `tile` filter to composite N evenly-spaced frames into a
 * grid. Returns the output path on success, null on failure.
 *
 * Cheap — one decode pass, no per-frame round-tripping. A 60s 1080p
 * video takes ~1-2s on CPU.
 */
export async function generateContactSheet(
  videoPath: string,
  ffmpegPath: string,
  mediaId: string,
  options: ContactSheetOptions = {}
): Promise<string | null> {
  if (!fs.existsSync(videoPath)) return null
  const { cols, rows, tileWidth } = resolveContactSheetLayout(options)
  const totalTiles = cols * rows
  const duration = options.durationSec ?? 0

  // Output goes in userData/contact-sheets/<mediaId>-sheet.png
  const outDir = path.join(app.getPath('userData'), 'contact-sheets')
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true })
  const outPath = path.join(outDir, `${mediaId}-sheet.png`)

  // If duration is known, sample N frames at even spacing using
  // `fps=<rate>` where rate = totalTiles / duration. Otherwise sample
  // every Nth frame via `select`.
  //
  // mpdecimate (when enabled) drops near-identical successive frames
  // BEFORE tiling, so a 12-cell sheet of a mostly-static video shows
  // 12 DISTINCT shots instead of 12 copies of the same scene. We
  // oversample by 3× to give mpdecimate a denser stream to dedupe
  // against — without that, evenly-spaced "boring" frames produce
  // few enough survivors that the tile filter ends up with blanks.
  const dedup = options.dedupFrames !== false
  const oversample = dedup ? 3 : 1
  // mpdecimate's defaults: hi=64*12=768, lo=64*5=320, frac=0.33 —
  // works well for adult video at 480p tile size. Looser settings
  // would drop too many distinct frames in slow-zoom sequences.
  const mpdec = dedup ? 'mpdecimate=hi=768:lo=320:frac=0.33,' : ''
  let vfFilter: string
  if (duration && duration > 1) {
    // fps filter — N frames evenly across the duration
    const fps = ((totalTiles * oversample) / duration).toFixed(4)
    vfFilter = `fps=${fps},${mpdec}scale=${tileWidth}:-1,tile=${cols}x${rows}`
  } else {
    // Fallback: every-Nth-frame select (approximate)
    vfFilter = `select=not(mod(n\\,30)),${mpdec}scale=${tileWidth}:-1,tile=${cols}x${rows}`
  }

  return new Promise<string | null>((resolve) => {
    const args = [
      '-y',
      '-i', videoPath,
      '-vf', vfFilter,
      '-frames:v', '1',
      '-q:v', '3',
      outPath,
    ]
    const proc = spawn(ffmpegPath, args, { windowsHide: true })
    let stderr = ''
    proc.stderr?.on('data', (d) => { stderr += d.toString() })
    proc.on('error', () => resolve(null))
    proc.on('close', (code) => {
      if (code === 0 && fs.existsSync(outPath)) {
        resolve(outPath)
      } else {
        console.warn(`[ContactSheet] FFmpeg exit ${code}: ${stderr.slice(-300)}`)
        resolve(null)
      }
    })
  })
}

/** Return the existing contact sheet path (if generated). */
export function contactSheetPathFor(mediaId: string): string | null {
  const p = path.join(app.getPath('userData'), 'contact-sheets', `${mediaId}-sheet.png`)
  return fs.existsSync(p) ? p : null
}
