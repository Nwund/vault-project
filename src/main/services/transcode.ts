// Service: On-demand FFmpeg transcoding for non-native video formats
import fs from 'node:fs'
import path from 'node:path'
import ffmpeg from 'fluent-ffmpeg'
import ffmpegPath from 'ffmpeg-static'
import ffprobeStatic from 'ffprobe-static'
import { getCacheDir } from '../settings'

if (ffmpegPath) ffmpeg.setFfmpegPath(ffmpegPath)
if (ffprobeStatic?.path) ffmpeg.setFfprobePath(ffprobeStatic.path)

function ensureDir(p: string): void {
  fs.mkdirSync(p, { recursive: true })
}

function transcodesDir(): string {
  const dir = path.join(getCacheDir(), 'transcodes')
  ensureDir(dir)
  return dir
}

const NEEDS_TRANSCODE_EXTS = new Set([
  '.mkv', '.avi', '.wmv', '.flv', '.ts', '.mpg', '.mpeg',
  '.3gp', '.vob', '.m2ts', '.mts', '.f4v', '.asf', '.divx',
  '.rm', '.rmvb'
])

export function needsTranscode(ext: string): boolean {
  return NEEDS_TRANSCODE_EXTS.has(ext.toLowerCase())
}

export function getTranscodedPath(mediaId: string): string | null {
  const out = path.join(transcodesDir(), `${mediaId}.mp4`)
  return fs.existsSync(out) ? out : null
}

// Track in-flight transcodes to avoid duplicates
const inFlight = new Map<string, Promise<string>>()

export function transcodeToMp4(inputPath: string, mediaId: string): Promise<string> {
  const existing = getTranscodedPath(mediaId)
  if (existing) return Promise.resolve(existing)

  // Deduplicate concurrent requests for the same media
  if (inFlight.has(mediaId)) return inFlight.get(mediaId)!

  const outPath = path.join(transcodesDir(), `${mediaId}.mp4`)
  const tmpPath = outPath + '.tmp.mp4'

  const promise = new Promise<string>((resolve, reject) => {
    console.log(`[Transcode] Starting: ${inputPath} -> ${outPath}`)
    ffmpeg(inputPath)
      .outputOptions([
        '-c:v', 'libx264',
        '-c:a', 'aac',
        '-preset', 'fast',
        '-crf', '23',
        '-movflags', '+faststart',
        '-y'
      ])
      .output(tmpPath)
      .on('end', () => {
        try {
          fs.renameSync(tmpPath, outPath)
          console.log(`[Transcode] Complete: ${outPath}`)
          resolve(outPath)
        } catch (e) {
          reject(e)
        } finally {
          inFlight.delete(mediaId)
        }
      })
      .on('error', (err) => {
        console.error(`[Transcode] Error: ${inputPath}`, err.message)
        try { fs.unlinkSync(tmpPath) } catch {}
        inFlight.delete(mediaId)
        reject(err)
      })
      .run()
  })

  inFlight.set(mediaId, promise)
  return promise
}
