// File: src/main/thumbs.ts
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import ffmpeg from 'fluent-ffmpeg'
import { ffmpegBin, ffprobeBin } from './ffpaths'
import { getCacheDir, getSettings } from './settings'

if (ffmpegBin) ffmpeg.setFfmpegPath(ffmpegBin)
if (ffprobeBin) ffmpeg.setFfprobePath(ffprobeBin)

// Get thumbnail size based on quality setting
function getThumbSize(): number {
  const quality = getSettings().library?.thumbnailQuality ?? 'medium'
  switch (quality) {
    case 'low': return 320
    case 'high': return 720
    case 'medium':
    default: return 480
  }
}

function ensureDir(p: string): void {
  fs.mkdirSync(p, { recursive: true })
}

function thumbsRootDir(): string {
  const root = path.join(getCacheDir(), 'thumbs')
  ensureDir(root)
  return root
}

function stableThumbName(mediaId: string, mtimeMs: number, suffix: string): string {
  // Stable per media+mtime → no duplicates, good cache behavior.
  // Add a small hash to avoid weird chars.
  const h = crypto.createHash('sha1').update(`${mediaId}:${mtimeMs}:${suffix}`).digest('hex').slice(0, 10)
  return `${mediaId}-${mtimeMs}-${h}.${suffix}`
}

export async function probeVideoDurationSec(filePath: string): Promise<number | null> {
  return await new Promise((resolve) => {
    ffmpeg.ffprobe(filePath, (err, data) => {
      if (err) return resolve(null)
      const d = data.format?.duration
      if (typeof d === 'number' && Number.isFinite(d) && d > 0) return resolve(d)
      resolve(null)
    })
  })
}

export async function probeMediaDimensions(filePath: string): Promise<{ width: number; height: number } | null> {
  return await new Promise((resolve) => {
    ffmpeg.ffprobe(filePath, (err, data) => {
      if (err) return resolve(null)
      // Find the video stream (or first stream with dimensions)
      const videoStream = data.streams?.find(s => s.width && s.height)
      if (videoStream?.width && videoStream?.height) {
        return resolve({ width: videoStream.width, height: videoStream.height })
      }
      resolve(null)
    })
  })
}

function isValidThumb(filePath: string): boolean {
  try {
    const stat = fs.statSync(filePath)
    return stat.size > 1500 // black frames are typically 500-1500 bytes at 480px; real content is 5-30KB
  } catch {
    return false
  }
}

function captureScreenshot(
  filePath: string,
  outFile: string,
  outDir: string,
  atSeconds: number
): Promise<string> {
  const size = getThumbSize()
  return new Promise((resolve, reject) => {
    ffmpeg(filePath)
      .on('error', (e) => reject(e))
      .on('end', () => resolve(outFile))
      .screenshots({
        timestamps: [atSeconds],
        filename: path.basename(outFile),
        folder: outDir,
        size: `${size}x?`
      })
  })
}

export async function makeVideoThumb(params: {
  mediaId: string
  filePath: string
  mtimeMs: number
  durationSec: number | null
}): Promise<string | null> {
  const outDir = thumbsRootDir()
  const outFile = path.join(outDir, stableThumbName(params.mediaId, params.mtimeMs, 'jpg'))

  if (fs.existsSync(outFile) && isValidThumb(outFile)) return outFile

  // Try multiple timestamps to avoid black frames (intros, fades)
  const dur = params.durationSec
  const timestamps = dur && dur > 2
    ? [dur * 0.3, dur * 0.5, dur * 0.7, dur * 0.15, dur * 0.85, dur * 0.05].map(t => Math.max(0, Math.min(t, dur - 0.5))).concat([1])
    : [1, 0]

  for (const at of timestamps) {
    try {
      await captureScreenshot(params.filePath, outFile, outDir, at)
      if (isValidThumb(outFile)) return outFile
      // Tiny file likely means black/corrupt frame — try next timestamp
      try { fs.unlinkSync(outFile) } catch {}
    } catch {
      try { fs.unlinkSync(outFile) } catch {}
    }
  }

  console.error(`[Thumbs] Video thumb failed for ${params.filePath}: all timestamps produced invalid frames`)
  return null
}

export async function makeImageThumb(params: {
  mediaId: string
  filePath: string
  mtimeMs: number
}): Promise<string | null> {
  const outDir = thumbsRootDir()
  const outFile = path.join(outDir, stableThumbName(params.mediaId, params.mtimeMs, 'jpg'))

  if (fs.existsSync(outFile)) return outFile

  // Use ffmpeg as a universal image scaler/encoder.
  const size = getThumbSize()
  return await new Promise<string>((resolve, reject) => {
    ffmpeg(params.filePath)
      .on('error', (e) => reject(e))
      .on('end', () => resolve(outFile))
      .outputOptions([
        '-frames:v 1',
        '-q:v 3',
        `-vf scale=${size}:-2:force_original_aspect_ratio=decrease`
      ])
      .save(outFile)
  }).catch((err) => {
    console.error(`[Thumbs] Image thumb failed for ${params.filePath}:`, err?.message ?? err)
    return null
  })
}

export async function regenerateThumb(params: {
  mediaId: string
  filePath: string
  mtimeMs: number
  durationSec: number | null
  type: 'video' | 'image'
  existingThumbPath?: string | null
}): Promise<string | null> {
  // Delete existing thumb if present
  if (params.existingThumbPath) {
    try { fs.unlinkSync(params.existingThumbPath) } catch {}
  }
  if (params.type === 'video') {
    return makeVideoThumb({
      mediaId: params.mediaId,
      filePath: params.filePath,
      mtimeMs: params.mtimeMs,
      durationSec: params.durationSec
    })
  } else {
    return makeImageThumb({
      mediaId: params.mediaId,
      filePath: params.filePath,
      mtimeMs: params.mtimeMs
    })
  }
}

export function thumbExists(p: string | null): boolean {
  if (!p) return false
  try {
    return fs.existsSync(p)
  } catch {
    return false
  }
}