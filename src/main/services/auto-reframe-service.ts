// File: src/main/services/auto-reframe-service.ts
//
// #169 — Auto-reframe a video to a target aspect ratio (e.g. 9:16
// vertical for shorts, 1:1 for IG posts).
//
// Phase 1 (this implementation): face-detection-driven static crop.
//   1. Sample N evenly-spaced frames (10 default).
//   2. Run the existing YuNet face detector on each.
//   3. Average the face center-x across frames; if no faces detected,
//      fall back to true center (0.5).
//   4. Emit a single re-encoded video with `ffmpeg crop=W:H:X:Y`
//      pinned to the smoothed center-x.
//
// Phase 2 (deferred): proper saliency-driven per-frame crop with
// ffmpeg `sendcmd` so the crop tracks subject motion frame-by-frame.
// Requires either a saliency ONNX or a more expensive YuNet run on
// every frame.
//
// Output mp4 lands in <userData>/reframed/<mediaId>-<ratio>.mp4.

import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { app } from 'electron'

export interface ReframeOptions {
  /** Target aspect ratio as "WxH" or numeric (9:16 → 9/16). */
  aspectRatio: '9:16' | '1:1' | '4:5'
  /** Number of frames to sample for face-center averaging. Default 10. */
  sampleCount?: number
  /** Output target height in px. Default 1280 for 9:16. */
  outputHeight?: number
  /** Skip generation if a file already exists. Default true. */
  reuseExisting?: boolean
}

const ASPECTS: Record<ReframeOptions['aspectRatio'], { w: number; h: number }> = {
  '9:16': { w: 9, h: 16 },
  '1:1':  { w: 1, h: 1 },
  '4:5':  { w: 4, h: 5 },
}

export async function autoReframe(
  videoPath: string,
  ffmpegPath: string,
  ffprobePath: string | null,
  mediaId: string,
  options: ReframeOptions,
): Promise<string | null> {
  if (!fs.existsSync(videoPath)) return null
  const reuse = options.reuseExisting !== false
  const sampleCount = Math.max(3, Math.min(30, options.sampleCount ?? 10))

  // Output path keyed by ratio so different ratios coexist.
  const outDir = path.join(app.getPath('userData'), 'reframed')
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true })
  const ratioSlug = options.aspectRatio.replace(':', 'x')
  const outPath = path.join(outDir, `${mediaId}-${ratioSlug}.mp4`)
  if (reuse && fs.existsSync(outPath)) return outPath

  // 1. Probe source for dimensions + duration via ffprobe so we know
  // the crop math + how to sample frames.
  let srcW = 1920, srcH = 1080, durationSec = 60
  if (ffprobePath) {
    try {
      const { spawnSync } = await import('node:child_process')
      const r = spawnSync(ffprobePath, [
        '-v', 'error', '-select_streams', 'v:0',
        '-show_entries', 'stream=width,height,duration',
        '-of', 'csv=p=0', videoPath,
      ], { encoding: 'utf8' })
      const parts = r.stdout.trim().split(',')
      if (parts.length >= 2) {
        srcW = Number(parts[0]) || srcW
        srcH = Number(parts[1]) || srcH
      }
      if (parts.length >= 3) {
        const d = Number(parts[2])
        if (Number.isFinite(d) && d > 0) durationSec = d
      }
    } catch { /* skip */ }
  }

  // 2. Sample frames + run YuNet to find face centers.
  const { detectFaces } = await import('./ai-intelligence/face-detector')
  const tmpDir = path.join(app.getPath('userData'), 'reframed', '.tmp', mediaId)
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true })
  const centersX: number[] = []
  for (let i = 0; i < sampleCount; i++) {
    const t = (durationSec * (i + 0.5)) / sampleCount
    const framePath = path.join(tmpDir, `frame-${i}.jpg`)
    try {
      await new Promise<void>((resolve) => {
        const proc = spawn(ffmpegPath, [
          '-y', '-ss', t.toFixed(3), '-i', videoPath,
          '-frames:v', '1', '-q:v', '4',
          framePath,
        ], { windowsHide: true })
        proc.on('close', () => resolve())
        proc.on('error', () => resolve())
      })
      if (fs.existsSync(framePath)) {
        const res = await detectFaces(framePath)
        if (res && res.faces.length > 0) {
          // Pick the highest-confidence face per frame, take its center.
          const top = res.faces.reduce((a, b) => (a.score > b.score ? a : b))
          centersX.push(top.x + top.w / 2)
        }
      }
    } catch { /* skip frame */ }
    try { fs.unlinkSync(framePath) } catch { /* noop */ }
  }
  // Cleanup tmp dir best-effort.
  try { fs.rmdirSync(tmpDir, { recursive: true } as any) } catch { /* noop */ }

  // 3. Compute the static crop center-x. Trim outliers via a 10-90
  // percentile filter to ignore stray off-screen face detections.
  let centerX = 0.5
  if (centersX.length >= 3) {
    const sorted = [...centersX].sort((a, b) => a - b)
    const lo = Math.floor(sorted.length * 0.1)
    const hi = Math.ceil(sorted.length * 0.9)
    const trimmed = sorted.slice(lo, hi)
    centerX = trimmed.reduce((s, v) => s + v, 0) / trimmed.length
  } else if (centersX.length > 0) {
    centerX = centersX.reduce((s, v) => s + v, 0) / centersX.length
  }

  // 4. Compute crop dims. Target aspect = aspect.w / aspect.h.
  // The crop width = srcH * aspect.w / aspect.h (since we generally
  // shrink width, not height). Crop x = clamp(centerX * srcW - cropW/2).
  const a = ASPECTS[options.aspectRatio]
  let cropW = Math.round((srcH * a.w) / a.h)
  let cropH = srcH
  if (cropW > srcW) {
    // Source is already narrower than target — fall back to letterbox
    // by cropping height instead.
    cropW = srcW
    cropH = Math.round((srcW * a.h) / a.w)
  }
  // Even values (h264 requirement)
  cropW = Math.max(2, cropW - (cropW % 2))
  cropH = Math.max(2, cropH - (cropH % 2))
  let cropX = Math.round(centerX * srcW - cropW / 2)
  cropX = Math.max(0, Math.min(srcW - cropW, cropX))
  const cropY = Math.max(0, Math.round((srcH - cropH) / 2))

  // 5. Encode. Use libx264 veryfast — fast enough that even a 10-minute
  // source reframes in 30-60s on CPU.
  return new Promise<string | null>((resolve) => {
    const args = [
      '-y',
      '-i', videoPath,
      '-vf', `crop=${cropW}:${cropH}:${cropX}:${cropY}`,
      '-c:v', 'libx264',
      '-preset', 'veryfast',
      '-crf', '22',
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
      if (code === 0 && fs.existsSync(outPath)) resolve(outPath)
      else { console.warn(`[AutoReframe] FFmpeg exit ${code}: ${stderr.slice(-300)}`); resolve(null) }
    })
  })
}

export function reframedPathFor(mediaId: string, ratio: ReframeOptions['aspectRatio']): string | null {
  const slug = ratio.replace(':', 'x')
  const p = path.join(app.getPath('userData'), 'reframed', `${mediaId}-${slug}.mp4`)
  return fs.existsSync(p) ? p : null
}
