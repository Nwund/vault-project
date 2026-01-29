// File: src/main/thumbs.ts
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import ffmpeg from 'fluent-ffmpeg'
import ffmpegPath from 'ffmpeg-static'
import ffprobeStatic from 'ffprobe-static'
import { getCacheDir } from './settings'

if (ffmpegPath) ffmpeg.setFfmpegPath(ffmpegPath)
if (ffprobeStatic?.path) ffmpeg.setFfprobePath(ffprobeStatic.path)

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

export async function makeVideoThumb(params: {
  mediaId: string
  filePath: string
  mtimeMs: number
  durationSec: number | null
}): Promise<string | null> {
  const outDir = thumbsRootDir()
  const outFile = path.join(outDir, stableThumbName(params.mediaId, params.mtimeMs, 'jpg'))

  if (fs.existsSync(outFile)) return outFile

  const at = params.durationSec && params.durationSec > 6 ? Math.min(params.durationSec * 0.1, 10) : 3

  return await new Promise((resolve, reject) => {
    ffmpeg(params.filePath)
      .on('error', (e) => reject(e))
      .on('end', () => resolve(outFile))
      .screenshots({
        timestamps: [at],
        filename: path.basename(outFile),
        folder: outDir,
        size: '480x?'
      })
  }).catch((err) => {
    console.error(`[Thumbs] Video thumb failed for ${params.filePath}:`, err?.message ?? err)
    return null
  })
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
  return await new Promise((resolve, reject) => {
    ffmpeg(params.filePath)
      .on('error', (e) => reject(e))
      .on('end', () => resolve(outFile))
      .outputOptions([
        '-frames:v 1',
        '-q:v 3',
        '-vf scale=480:-2:force_original_aspect_ratio=decrease'
      ])
      .save(outFile)
  }).catch((err) => {
    console.error(`[Thumbs] Image thumb failed for ${params.filePath}:`, err?.message ?? err)
    return null
  })
}

export function thumbExists(p: string | null): boolean {
  if (!p) return false
  try {
    return fs.existsSync(p)
  } catch {
    return false
  }
}