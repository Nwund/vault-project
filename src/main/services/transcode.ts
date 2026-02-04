// Service: On-demand FFmpeg transcoding for non-native video formats
import fs from 'node:fs'
import path from 'node:path'
import ffmpeg from 'fluent-ffmpeg'
import { ffmpegBin, ffprobeBin } from '../ffpaths'
import { getCacheDir } from '../settings'

if (ffmpegBin) ffmpeg.setFfmpegPath(ffmpegBin)
if (ffprobeBin) ffmpeg.setFfprobePath(ffprobeBin)

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
  '.rm', '.rmvb', '.mov', '.m4v'
])

// Codecs that Chromium/Electron can natively decode
const CHROMIUM_VIDEO_CODECS = new Set([
  'h264', 'vp8', 'vp9', 'av1', 'theora'
])
const CHROMIUM_AUDIO_CODECS = new Set([
  'aac', 'mp3', 'opus', 'vorbis', 'flac', 'pcm_s16le', 'pcm_s24le', 'pcm_f32le'
])

// Cache probe results in memory to avoid repeated ffprobe calls
const probeCache = new Map<string, boolean>()

/**
 * Probe a video file with ffprobe to check if its codecs are Chromium-compatible.
 * Returns true if the file needs transcoding (has unsupported codecs).
 */
export async function probeNeedsTranscode(filePath: string): Promise<boolean> {
  if (probeCache.has(filePath)) return probeCache.get(filePath)!

  return new Promise((resolve) => {
    ffmpeg.ffprobe(filePath, (err, data) => {
      if (err) {
        console.warn('[Transcode] ffprobe failed, assuming transcode needed:', filePath, err.message)
        probeCache.set(filePath, true)
        resolve(true)
        return
      }

      const streams = data.streams || []
      let dominated = false

      for (const stream of streams) {
        const codecName = (stream.codec_name || '').toLowerCase()
        if (stream.codec_type === 'video') {
          if (!CHROMIUM_VIDEO_CODECS.has(codecName)) {
            console.log(`[Transcode] Unsupported video codec "${codecName}" in: ${filePath}`)
            dominated = true
            break
          }
        } else if (stream.codec_type === 'audio') {
          if (!CHROMIUM_AUDIO_CODECS.has(codecName)) {
            console.log(`[Transcode] Unsupported audio codec "${codecName}" in: ${filePath}`)
            dominated = true
            break
          }
        }
      }

      probeCache.set(filePath, dominated)
      resolve(dominated)
    })
  })
}

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

/**
 * Transcode to a low-resolution MP4 for GoonWall tiles.
 * Uses ultrafast preset, low resolution, and high CRF for speed.
 * Cached separately from full-quality transcodes.
 */
export function transcodeLowRes(inputPath: string, mediaId: string, maxHeight: number = 360): Promise<string> {
  const dir = path.join(getCacheDir(), 'transcodes-lowres')
  ensureDir(dir)

  const tag = `${mediaId}_${maxHeight}p`
  const outPath = path.join(dir, `${tag}.mp4`)
  if (fs.existsSync(outPath)) return Promise.resolve(outPath)

  const flightKey = `lowres:${tag}`
  if (inFlight.has(flightKey)) return inFlight.get(flightKey)!

  const tmpPath = outPath + '.tmp.mp4'

  const promise = new Promise<string>((resolve, reject) => {
    console.log(`[Transcode-LowRes] Starting ${maxHeight}p: ${inputPath}`)
    ffmpeg(inputPath)
      .outputOptions([
        '-c:v', 'libx264',
        '-c:a', 'aac',
        '-preset', 'ultrafast',
        '-crf', '30',
        '-vf', `scale=-2:${maxHeight}`,
        '-movflags', '+faststart',
        '-y'
      ])
      .output(tmpPath)
      .on('end', () => {
        try {
          fs.renameSync(tmpPath, outPath)
          console.log(`[Transcode-LowRes] Complete: ${outPath}`)
          resolve(outPath)
        } catch (e) {
          reject(e)
        } finally {
          inFlight.delete(flightKey)
        }
      })
      .on('error', (err) => {
        console.error(`[Transcode-LowRes] Error: ${inputPath}`, err.message)
        try { fs.unlinkSync(tmpPath) } catch {}
        inFlight.delete(flightKey)
        reject(err)
      })
      .run()
  })

  inFlight.set(flightKey, promise)
  return promise
}
