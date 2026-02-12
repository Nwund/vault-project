// Service: On-demand FFmpeg transcoding for non-native video formats
// Supports hardware-accelerated encoding: NVENC (NVIDIA), QSV (Intel), VAAPI (Linux)
import fs from 'node:fs'
import path from 'node:path'
import { exec } from 'node:child_process'
import { promisify } from 'node:util'
import ffmpeg from 'fluent-ffmpeg'
import { ffmpegBin, ffprobeBin } from '../ffpaths'
import { getCacheDir } from '../settings'

const execAsync = promisify(exec)

if (ffmpegBin) ffmpeg.setFfmpegPath(ffmpegBin)
if (ffprobeBin) ffmpeg.setFfprobePath(ffprobeBin)

// ═══════════════════════════════════════════════════════════════════════════
// HARDWARE ENCODER DETECTION
// ═══════════════════════════════════════════════════════════════════════════

export type HardwareEncoder = 'h264_nvenc' | 'h264_qsv' | 'h264_vaapi' | 'h264_amf' | 'libx264'

export interface EncoderInfo {
  id: HardwareEncoder
  name: string
  available: boolean
  description: string
}

// Cache detected encoders
let detectedEncoders: EncoderInfo[] | null = null
let preferredEncoder: HardwareEncoder = 'libx264'

/**
 * Detect available hardware encoders using FFmpeg
 */
export async function detectHardwareEncoders(): Promise<EncoderInfo[]> {
  if (detectedEncoders) return detectedEncoders

  const encoders: EncoderInfo[] = [
    { id: 'h264_nvenc', name: 'NVIDIA NVENC', available: false, description: 'NVIDIA GPU hardware encoding (fastest)' },
    { id: 'h264_qsv', name: 'Intel Quick Sync', available: false, description: 'Intel integrated GPU encoding' },
    { id: 'h264_vaapi', name: 'VA-API', available: false, description: 'Linux hardware acceleration' },
    { id: 'h264_amf', name: 'AMD AMF', available: false, description: 'AMD GPU hardware encoding' },
    { id: 'libx264', name: 'Software (x264)', available: true, description: 'CPU-based encoding (always available)' },
  ]

  const ffmpegPath = ffmpegBin || 'ffmpeg'

  try {
    // Get list of available encoders
    const { stdout } = await execAsync(`"${ffmpegPath}" -hide_banner -encoders 2>&1`)
    const encoderList = stdout.toLowerCase()

    // Check each hardware encoder
    for (const encoder of encoders) {
      if (encoder.id === 'libx264') continue // Always available

      // Check if encoder is listed
      if (encoderList.includes(encoder.id)) {
        // Try to actually use the encoder with a test
        try {
          const testResult = await testEncoder(encoder.id, ffmpegPath)
          encoder.available = testResult
          if (testResult) {
            console.log(`[Transcode] Hardware encoder available: ${encoder.name}`)
          }
        } catch {
          encoder.available = false
        }
      }
    }
  } catch (err) {
    console.error('[Transcode] Failed to detect hardware encoders:', err)
  }

  detectedEncoders = encoders
  console.log('[Transcode] Detected encoders:', encoders.filter(e => e.available).map(e => e.name).join(', '))
  return encoders
}

/**
 * Test if an encoder actually works by trying to encode a tiny test
 */
async function testEncoder(encoderId: string, ffmpegPath: string): Promise<boolean> {
  // Create a tiny test: generate 1 frame, try to encode it
  const testCmd = `"${ffmpegPath}" -hide_banner -f lavfi -i color=black:s=64x64:d=0.1 -c:v ${encoderId} -f null - 2>&1`

  try {
    await execAsync(testCmd, { timeout: 10000 })
    return true
  } catch (err: any) {
    // If the command failed, the encoder isn't working
    return false
  }
}

/**
 * Get all detected encoders
 */
export function getEncoders(): EncoderInfo[] {
  return detectedEncoders || []
}

/**
 * Get the preferred/selected encoder
 */
export function getPreferredEncoder(): HardwareEncoder {
  return preferredEncoder
}

/**
 * Set the preferred encoder
 */
export function setPreferredEncoder(encoder: HardwareEncoder): void {
  preferredEncoder = encoder
  console.log('[Transcode] Preferred encoder set to:', encoder)
}

/**
 * Get the best available encoder (respects user preference if available)
 */
export function getBestEncoder(): HardwareEncoder {
  if (!detectedEncoders) return 'libx264'

  // If preferred encoder is available, use it
  const preferred = detectedEncoders.find(e => e.id === preferredEncoder && e.available)
  if (preferred) return preferred.id

  // Otherwise, pick the best available in order of speed
  const priority: HardwareEncoder[] = ['h264_nvenc', 'h264_amf', 'h264_qsv', 'h264_vaapi', 'libx264']
  for (const id of priority) {
    const encoder = detectedEncoders.find(e => e.id === id && e.available)
    if (encoder) return encoder.id
  }

  return 'libx264'
}

/**
 * Get FFmpeg output options for the given encoder
 */
function getEncoderOptions(encoder: HardwareEncoder, quality: 'fast' | 'balanced' | 'quality' = 'balanced'): string[] {
  const presets: Record<typeof quality, { crf: number; preset: string }> = {
    fast: { crf: 28, preset: 'ultrafast' },
    balanced: { crf: 23, preset: 'fast' },
    quality: { crf: 18, preset: 'slow' },
  }

  const { crf, preset } = presets[quality]

  switch (encoder) {
    case 'h264_nvenc':
      return [
        '-c:v', 'h264_nvenc',
        '-preset', quality === 'fast' ? 'p1' : quality === 'quality' ? 'p7' : 'p4',
        '-cq', String(crf + 5), // NVENC CQ is roughly CRF + 5
        '-b:v', '0',
      ]
    case 'h264_qsv':
      return [
        '-c:v', 'h264_qsv',
        '-preset', quality === 'fast' ? 'veryfast' : quality === 'quality' ? 'veryslow' : 'medium',
        '-global_quality', String(crf + 2),
      ]
    case 'h264_vaapi':
      return [
        '-vaapi_device', '/dev/dri/renderD128',
        '-c:v', 'h264_vaapi',
        '-qp', String(crf + 2),
      ]
    case 'h264_amf':
      return [
        '-c:v', 'h264_amf',
        '-quality', quality === 'fast' ? 'speed' : quality === 'quality' ? 'quality' : 'balanced',
        '-rc', 'vbr_latency',
        '-qp_i', String(crf),
        '-qp_p', String(crf + 2),
      ]
    case 'libx264':
    default:
      return [
        '-c:v', 'libx264',
        '-preset', preset,
        '-crf', String(crf),
      ]
  }
}

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

// Limit concurrent transcodes to prevent system overload
const MAX_CONCURRENT_TRANSCODES = 4
let activeTranscodes = 0
const transcodeQueue: Array<() => void> = []

async function withTranscodeLimit<T>(fn: () => Promise<T>): Promise<T> {
  // Wait if at capacity
  if (activeTranscodes >= MAX_CONCURRENT_TRANSCODES) {
    await new Promise<void>(resolve => transcodeQueue.push(resolve))
  }
  activeTranscodes++
  try {
    return await fn()
  } finally {
    activeTranscodes--
    const next = transcodeQueue.shift()
    if (next) next()
  }
}

export function transcodeToMp4(inputPath: string, mediaId: string): Promise<string> {
  const existing = getTranscodedPath(mediaId)
  if (existing) return Promise.resolve(existing)

  // Deduplicate concurrent requests for the same media
  if (inFlight.has(mediaId)) return inFlight.get(mediaId)!

  const outPath = path.join(transcodesDir(), `${mediaId}.mp4`)
  const tmpPath = outPath + '.tmp.mp4'

  const promise = withTranscodeLimit(() => new Promise<string>((resolve, reject) => {
    const encoder = getBestEncoder()
    const encoderOpts = getEncoderOptions(encoder, 'balanced')
    console.log(`[Transcode] Starting with ${encoder}: ${inputPath} -> ${outPath}`)

    ffmpeg(inputPath)
      .outputOptions([
        ...encoderOpts,
        '-c:a', 'aac',
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
        console.error(`[Transcode] Error with ${encoder}: ${inputPath}`, err.message)
        // If hardware encoder failed, retry with software
        if (encoder !== 'libx264') {
          console.log(`[Transcode] Retrying with software encoder...`)
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
                console.log(`[Transcode] Complete (fallback): ${outPath}`)
                resolve(outPath)
              } catch (e) {
                reject(e)
              } finally {
                inFlight.delete(mediaId)
              }
            })
            .on('error', (err2) => {
              console.error(`[Transcode] Fallback also failed: ${inputPath}`, err2.message)
              try { fs.unlinkSync(tmpPath) } catch {}
              inFlight.delete(mediaId)
              reject(err2)
            })
            .run()
        } else {
          try { fs.unlinkSync(tmpPath) } catch {}
          inFlight.delete(mediaId)
          reject(err)
        }
      })
      .run()
  }))

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

  const promise = withTranscodeLimit(() => new Promise<string>((resolve, reject) => {
    const encoder = getBestEncoder()
    const encoderOpts = getEncoderOptions(encoder, 'fast')
    console.log(`[Transcode-LowRes] Starting ${maxHeight}p with ${encoder}: ${inputPath}`)

    ffmpeg(inputPath)
      .outputOptions([
        ...encoderOpts,
        '-c:a', 'aac',
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
        console.error(`[Transcode-LowRes] Error with ${encoder}: ${inputPath}`, err.message)
        // Fallback to software if hardware failed
        if (encoder !== 'libx264') {
          console.log(`[Transcode-LowRes] Retrying with software encoder...`)
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
                console.log(`[Transcode-LowRes] Complete (fallback): ${outPath}`)
                resolve(outPath)
              } catch (e) {
                reject(e)
              } finally {
                inFlight.delete(flightKey)
              }
            })
            .on('error', (err2) => {
              console.error(`[Transcode-LowRes] Fallback failed: ${inputPath}`, err2.message)
              try { fs.unlinkSync(tmpPath) } catch {}
              inFlight.delete(flightKey)
              reject(err2)
            })
            .run()
        } else {
          try { fs.unlinkSync(tmpPath) } catch {}
          inFlight.delete(flightKey)
          reject(err)
        }
      })
      .run()
  }))

  inFlight.set(flightKey, promise)
  return promise
}
