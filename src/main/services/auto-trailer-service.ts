// File: src/main/services/auto-trailer-service.ts
//
// #179 — Auto-trailer generator: 30-second highlight reel for a
// single video.
//
// Strategy:
//   1. Skip the first/last 10% of the source (usually intros/credits).
//   2. Sample 6 candidate windows (3s each) evenly through the middle
//      80%, OR (when useAudioPeaks=true / #140) pick by audio energy.
//   3. Cut each window with re-encode + crossfade for clean seams.
//   4. Concat with brief 200ms crossfades using ffmpeg's xfade filter.
//   5. Output 30s mp4 (h264/aac) to userData/trailers/<mediaId>-trailer.mp4
//
// We aim for "good enough as a hover preview / share preview", not
// editorial quality. The encoder uses fast presets so a 30min source
// trailers in ~5s on CPU.

import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { app } from 'electron'

export interface AutoTrailerOptions {
  /** Total trailer duration target in seconds. Default 30. */
  durationSec?: number
  /** Number of clips to sample from the source. Default 6 (~5s each). */
  clipCount?: number
  /** Crossfade duration in seconds. Default 0.2 (subtle). */
  crossfadeSec?: number
  /** When true, only regenerate if no trailer exists. Default true. */
  reuseExisting?: boolean
  /** #140 — When true, pick clip starts by audio energy peaks instead
   *  of even spacing. Useful for music videos / action scenes; falls
   *  back to even spacing if the audio analysis fails. Default false
   *  (preserves the original auto-trailer behavior). */
  useAudioPeaks?: boolean
}

export async function generateAutoTrailer(
  videoPath: string,
  ffmpegPath: string,
  mediaId: string,
  durationSec: number,
  options: AutoTrailerOptions = {},
): Promise<string | null> {
  if (!fs.existsSync(videoPath)) return null
  if (!durationSec || durationSec < 15) return null // too short to bother

  const targetDur = options.durationSec ?? 30
  const requestedCount = Math.max(2, Math.min(10, options.clipCount ?? 6))
  const xfade = Math.max(0, Math.min(1, options.crossfadeSec ?? 0.2))
  const reuse = options.reuseExisting !== false
  const perClipDur = targetDur / requestedCount

  const outDir = path.join(app.getPath('userData'), 'trailers')
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true })
  const outPath = path.join(outDir, `${mediaId}-trailer.mp4`)
  if (reuse && fs.existsSync(outPath)) return outPath

  // Pick clip start times. Two strategies:
  //   1. evenly-spaced (default) — predictable, no decode cost.
  //   2. audio-peak driven (#140) — best moments by loudness; falls
  //      through to even spacing on failure.
  const usableStart = durationSec * 0.1
  const usableEnd = durationSec * 0.9
  const usableSpan = usableEnd - usableStart
  let starts: number[] = []
  if (options.useAudioPeaks) {
    try {
      const peaks = await import('./ai-intelligence/audio-peak-detector')
        .then(m => m.detectHighlightsFromAudio(videoPath, ffmpegPath, {
          topN: requestedCount * 2, // over-fetch then NMS
          windowSec: Math.max(2, Math.floor(perClipDur)),
        }))
        .catch(() => [])
      const sorted = peaks
        .filter((p: any) => p.startSec >= usableStart && p.startSec <= usableEnd)
        .sort((a: any, b: any) => b.score - a.score)
      const picked: number[] = []
      for (const p of sorted) {
        const conflict = picked.some((s) => Math.abs(s - p.startSec) < perClipDur)
        if (conflict) continue
        picked.push(p.startSec)
        if (picked.length >= requestedCount) break
      }
      picked.sort((a, b) => a - b)
      if (picked.length >= 2) starts = picked
    } catch { /* fall through to even spacing */ }
  }
  if (starts.length === 0) {
    for (let i = 0; i < requestedCount; i++) {
      const center = usableStart + ((i + 0.5) / requestedCount) * usableSpan
      const start = Math.max(0, center - perClipDur / 2)
      starts.push(start)
    }
  }
  // Final clip count is whatever ended up in starts so the ffmpeg
  // input + filter graph stays consistent.
  const clipCount = starts.length

  // Build a single ffmpeg command that:
  //   - opens the source N times with -ss and -t
  //   - concats them with xfade
  const inputArgs: string[] = []
  for (const s of starts) {
    inputArgs.push('-ss', s.toFixed(3), '-t', perClipDur.toFixed(3), '-i', videoPath)
  }

  // Compose video xfade chain. The offset for xfade transition[i] is
  // the running total of prior clips' visible durations minus the
  // overlap. Each segment surfaces (perClipDur − xfade) of "new" time.
  const visibleSeg = Math.max(0.1, perClipDur - xfade)
  let vFilter = '[0:v]setpts=PTS-STARTPTS,scale=854:-2:force_original_aspect_ratio=decrease,setsar=1[v0];'
  for (let i = 1; i < clipCount; i++) {
    vFilter += `[${i}:v]setpts=PTS-STARTPTS,scale=854:-2:force_original_aspect_ratio=decrease,setsar=1[v${i}];`
  }
  let prevTag = 'v0'
  for (let i = 1; i < clipCount; i++) {
    const offset = i * visibleSeg
    const outTag = i === clipCount - 1 ? 'vout' : `vx${i}`
    vFilter += `[${prevTag}][v${i}]xfade=transition=fade:duration=${xfade}:offset=${offset.toFixed(3)}[${outTag}];`
    prevTag = outTag
  }
  vFilter = vFilter.replace(/;$/, '')

  // Audio: acrossfade pairs. Simpler — pair-wise reduction.
  let aFilter = ''
  if (clipCount === 1) {
    aFilter = '[0:a]anull[aout]'
  } else {
    aFilter += `[0:a][1:a]acrossfade=d=${xfade}:c1=tri:c2=tri[ax1];`
    for (let i = 2; i < clipCount; i++) {
      const outTag = i === clipCount - 1 ? 'aout' : `ax${i}`
      aFilter += `[ax${i - 1}][${i}:a]acrossfade=d=${xfade}:c1=tri:c2=tri[${outTag}];`
    }
    aFilter = aFilter.replace(/;$/, '')
  }

  const filterComplex = `${vFilter};${aFilter}`

  return new Promise<string | null>((resolve) => {
    const args = [
      '-y',
      ...inputArgs,
      '-filter_complex', filterComplex,
      '-map', '[vout]',
      '-map', '[aout]',
      '-c:v', 'libx264',
      '-preset', 'veryfast',
      '-crf', '24',
      '-c:a', 'aac',
      '-b:a', '128k',
      '-movflags', '+faststart',
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
        console.warn(`[AutoTrailer] FFmpeg exit ${code}: ${stderr.slice(-400)}`)
        resolve(null)
      }
    })
  })
}

export function trailerPathFor(mediaId: string): string | null {
  const p = path.join(app.getPath('userData'), 'trailers', `${mediaId}-trailer.mp4`)
  return fs.existsSync(p) ? p : null
}
