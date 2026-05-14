// File: src/main/services/ai-intelligence/audio-peak-detector.ts
//
// Minimum-viable highlight-reel detector. The full Moment-DETR /
// Saliency-Guided-DETR pipeline (#62) needs an ML model and a frame
// pre-extraction pass; this module produces the same SHAPE of result
// (a list of {startSec, endSec, score} highlights) using nothing
// more than ffmpeg's astats filter measuring RMS-by-window.
//
// Why it works for adult video:
//   - Moaning + plap rhythm = sustained high RMS.
//   - Cumshot scenes have a characteristic intensity ramp.
//   - Talking-head / setup audio is much quieter than action.
//   - Music-only sections sit at a steady mid-RMS that windowed
//     z-score downweights vs the dialogue + moan peaks.
//
// Output goes into:
//   - markers:upsert (auto-bookmarks at peak timestamps)
//   - the VideoStash timeline's "highlight ticks" overlay
//   - the Today's-Mix block-scheduler's "skip to action" mode

import { spawn } from 'node:child_process'
import fs from 'node:fs'

export interface AudioPeakWindow {
  /** Start of the window in seconds. */
  startSec: number
  /** End of the window in seconds. */
  endSec: number
  /** RMS in dBFS for the window (-90..0). */
  rmsDb: number
  /** z-score relative to the video's own RMS distribution. */
  zScore: number
}

export interface HighlightCandidate {
  startSec: number
  endSec: number
  /** Composite score in [0, 1]; higher = more highlight-worthy. */
  score: number
  rmsDb: number
}

/**
 * Run ffmpeg with the `astats` filter over `windowSec`-second windows,
 * parse the per-window RMS, return the full list (not deduped). Cheap:
 * single decode pass, ~real-time on modern hardware.
 *
 * Returns [] when the file has no audio track or analysis fails.
 */
export async function extractAudioWindows(
  videoPath: string,
  ffmpegPath: string,
  windowSec: number = 5
): Promise<AudioPeakWindow[]> {
  if (!fs.existsSync(videoPath) || windowSec <= 0) return []
  const w = Math.max(0.5, Math.min(60, windowSec))

  return new Promise((resolve) => {
    // astats with metadata=1:reset=1 emits one frame of metadata per
    // analysis window (length=<seconds>). The `ametadata=mode=print`
    // sink prints each frame's metadata to stderr so we can parse it.
    const proc = spawn(ffmpegPath, [
      '-hide_banner',
      '-nostats',
      '-i', videoPath,
      '-af', `astats=metadata=1:reset=1:length=${w},ametadata=mode=print:file=-`,
      '-vn',
      '-f', 'null',
      '-'
    ], { windowsHide: true })

    let stdout = ''
    let stderr = ''
    proc.stdout?.on('data', (d) => { stdout += d.toString() })
    proc.stderr?.on('data', (d) => { stderr += d.toString() })
    proc.on('error', () => resolve([]))
    proc.on('close', () => {
      try {
        // ametadata prints to stdout when file=-. Combine both just
        // in case the build sends it to stderr.
        const text = stdout || stderr
        resolve(parseAstatsWindows(text, w))
      } catch (err) {
        console.warn('[AudioPeak] Parse failed:', err)
        resolve([])
      }
    })
  })
}

/**
 * Parse the ametadata-printed astats output. Each window arrives as a
 * block like:
 *
 *   frame:0    pts:0       pts_time:0
 *   lavfi.astats.Overall.RMS_level=-22.345
 *   lavfi.astats.Overall.RMS_peak=...
 *
 * We collect (pts_time, RMS_level) pairs. The pts_time on the FRAME
 * line marks the END of the previous window when reset=1.
 */
function parseAstatsWindows(text: string, windowSec: number): AudioPeakWindow[] {
  const lines = text.split(/\r?\n/)
  const windows: AudioPeakWindow[] = []
  let currentPts = 0
  let pendingRms: number | null = null
  for (const line of lines) {
    const frameMatch = /^frame:\d+\s+pts:\S+\s+pts_time:([0-9.]+)/.exec(line)
    if (frameMatch) {
      if (pendingRms !== null) {
        windows.push({
          startSec: Math.max(0, currentPts - windowSec),
          endSec: currentPts,
          rmsDb: pendingRms,
          zScore: 0,  // filled in below
        })
        pendingRms = null
      }
      currentPts = parseFloat(frameMatch[1])
      continue
    }
    const rmsMatch = /lavfi\.astats\.Overall\.RMS_level=(-?[\d.]+|nan|inf|-inf)/.exec(line)
    if (rmsMatch) {
      const raw = rmsMatch[1]
      if (raw === 'nan' || raw === 'inf' || raw === '-inf') {
        pendingRms = -90
      } else {
        const v = parseFloat(raw)
        pendingRms = isFinite(v) ? v : -90
      }
    }
  }
  // Flush the last pending window — astats sometimes doesn't emit a
  // trailing FRAME boundary line when the stream ends mid-window.
  if (pendingRms !== null) {
    windows.push({
      startSec: Math.max(0, currentPts - windowSec),
      endSec: currentPts,
      rmsDb: pendingRms,
      zScore: 0,
    })
  }
  if (windows.length === 0) return []
  // Compute z-scores for each window relative to the video's own RMS
  // distribution. Highlights are local outliers; absolute thresholds
  // misfire on quiet vs loud videos.
  const mean = windows.reduce((s, w) => s + w.rmsDb, 0) / windows.length
  const variance = windows.reduce((s, w) => s + (w.rmsDb - mean) ** 2, 0) / windows.length
  const std = Math.sqrt(Math.max(variance, 0.01))
  for (const w of windows) w.zScore = (w.rmsDb - mean) / std
  return windows
}

/**
 * Pick the top N highlight candidates from the window list. Merges
 * adjacent peak windows so back-to-back loud sections become one
 * longer highlight rather than several short ones. Sorts by score
 * descending.
 *
 * Defaults:
 *   topN     = 5     — the typical "highlight reel" count
 *   minZ     = 0.75  — only windows ≥0.75 σ above mean qualify
 *   maxLen   = 30    — cap each highlight at 30s so we don't merge
 *                      a whole continuous sex scene into one entry
 *
 * Composite score blends z-score (loudness vs own baseline) with
 * absolute RMS (don't recommend "highlights" from a silent video).
 */
export function pickHighlights(
  windows: AudioPeakWindow[],
  options: { topN?: number; minZ?: number; maxLenSec?: number } = {}
): HighlightCandidate[] {
  const topN = Math.max(1, Math.min(20, options.topN ?? 5))
  const minZ = options.minZ ?? 0.75
  const maxLen = options.maxLenSec ?? 30
  if (windows.length === 0) return []

  // Mark each window as peak/not-peak.
  const isPeak = windows.map((w) => w.zScore >= minZ && w.rmsDb > -45)

  // Merge contiguous peaks into runs.
  type Run = { start: number; end: number; sumZ: number; maxZ: number; sumRms: number; count: number }
  const runs: Run[] = []
  let cur: Run | null = null
  for (let i = 0; i < windows.length; i++) {
    if (isPeak[i]) {
      if (cur && windows[i].startSec - cur.end <= 0.5) {
        // Extend
        cur.end = windows[i].endSec
        cur.sumZ += windows[i].zScore
        cur.maxZ = Math.max(cur.maxZ, windows[i].zScore)
        cur.sumRms += windows[i].rmsDb
        cur.count += 1
        // Cap by maxLen — split if we're past the cap.
        if (cur.end - cur.start > maxLen) {
          runs.push(cur)
          cur = null
        }
      } else {
        if (cur) runs.push(cur)
        cur = {
          start: windows[i].startSec,
          end: windows[i].endSec,
          sumZ: windows[i].zScore,
          maxZ: windows[i].zScore,
          sumRms: windows[i].rmsDb,
          count: 1,
        }
      }
    } else {
      if (cur) { runs.push(cur); cur = null }
    }
  }
  if (cur) runs.push(cur)

  // Score: blend mean z-score with absolute RMS quality. Map to 0..1.
  // 95th-percentile-ish z is around 2.0; map z=2 → 1.0, z=0.75 → 0.4.
  const scored: HighlightCandidate[] = runs.map((r) => {
    const meanZ = r.sumZ / r.count
    const meanRms = r.sumRms / r.count
    const zPart = Math.max(0, Math.min(1, (meanZ - 0.5) / 1.5))
    const rmsPart = Math.max(0, Math.min(1, (meanRms + 50) / 35))  // -50 → 0, -15 → 1
    return {
      startSec: r.start,
      endSec: r.end,
      score: 0.7 * zPart + 0.3 * rmsPart,
      rmsDb: meanRms,
    }
  })
  scored.sort((a, b) => b.score - a.score)
  return scored.slice(0, topN)
}

/**
 * One-call helper for typical usage. Returns the top N highlight
 * candidates for a video. Empty array on failure / no audio.
 */
export async function detectHighlightsFromAudio(
  videoPath: string,
  ffmpegPath: string,
  options: { topN?: number; minZ?: number; maxLenSec?: number; windowSec?: number } = {}
): Promise<HighlightCandidate[]> {
  const windows = await extractAudioWindows(videoPath, ffmpegPath, options.windowSec ?? 5)
  return pickHighlights(windows, options)
}
