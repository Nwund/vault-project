// File: src/main/services/media-tools.ts
//
// ffmpeg-backed implementations for the four Library tool dialogs
// that were previously stubs (MediaExporter, MediaMerger, MediaRotator,
// WatermarkAdder). All write to a caller-chosen output path; the
// source media is never overwritten.
//
//   export   — format/quality/resolution/fps/trim/audio-strip
//   merge    — concatenate N video files via ffmpeg concat demuxer
//   rotate   — rotate/flip image or video by 0/90/180/270 + flip x/y
//   watermark — overlay text or image on a video/image, with
//               positioning + opacity + scale
//
// Long-running; callers should surface a spinner.

import { spawn } from 'node:child_process'
import * as path from 'node:path'
import * as fs from 'node:fs'
import * as os from 'node:os'

function runFfmpeg(ffmpegPath: string, args: string[]): Promise<{ ok: boolean; stderr: string; code: number | null }> {
  return new Promise((resolve) => {
    const proc = spawn(ffmpegPath, args, { windowsHide: true })
    let stderr = ''
    proc.stderr?.on('data', (d) => { stderr += d.toString() })
    proc.on('error', () => resolve({ ok: false, stderr, code: null }))
    proc.on('close', (code) => resolve({ ok: code === 0, stderr, code }))
  })
}

// ──────────────────────────────────────────────────────────────────────
// EXPORT — format / quality / resolution / fps / trim / strip audio
// ──────────────────────────────────────────────────────────────────────

type Quality = 'low' | 'medium' | 'high' | 'original'

export interface ExportOptions {
  format: string  // 'mp4' | 'webm' | 'mkv' | 'gif' | 'jpg' | 'png' | 'webp'
  quality: Quality
  resolution?: string  // 'original' | '1920x1080' | etc
  fps?: number
  startSec?: number
  endSec?: number
  removeAudio?: boolean
}

const QUALITY_CRF: Record<Quality, number> = {
  original: 0,
  high: 18,
  medium: 23,
  low: 28,
}

const QUALITY_RES: Record<Quality, string> = {
  original: '',
  high: '1920:-2',
  medium: '1280:-2',
  low: '854:-2',
}

export async function exportMedia(
  ffmpegPath: string,
  srcPath: string,
  dstPath: string,
  options: ExportOptions,
): Promise<{ ok: boolean; error?: string; dstPath?: string }> {
  if (!fs.existsSync(srcPath)) return { ok: false, error: 'source file missing' }
  const args: string[] = []
  // Trim before -i so seek is fast (input seek) for video; harmless for image.
  if (options.startSec != null && options.startSec > 0) {
    args.push('-ss', String(options.startSec))
  }
  args.push('-i', srcPath)
  if (options.endSec != null && options.startSec != null && options.endSec > options.startSec) {
    args.push('-t', String(options.endSec - options.startSec))
  } else if (options.endSec != null && options.startSec == null) {
    args.push('-t', String(options.endSec))
  }
  // Resolution + FPS via -vf
  const vf: string[] = []
  if (options.resolution && options.resolution !== 'original') {
    // resolution comes as 'WxH'; convert to scale=W:H
    const [w, h] = options.resolution.split('x')
    if (w && h) vf.push(`scale=${w}:${h}`)
  } else if (options.quality !== 'original' && QUALITY_RES[options.quality]) {
    vf.push(`scale=${QUALITY_RES[options.quality]}`)
  }
  if (options.fps && options.fps > 0) vf.push(`fps=${options.fps}`)
  if (vf.length > 0) args.push('-vf', vf.join(','))
  // Quality / codec
  if (options.format === 'gif') {
    // GIF needs special handling — palette-gen pass would be cleaner
    // but we use a single-pass with reasonable defaults.
    args.push('-f', 'gif')
  } else if (options.format === 'jpg' || options.format === 'png' || options.format === 'webp') {
    args.push('-frames:v', '1')
  } else {
    // Video formats
    args.push('-c:v', 'libx264')
    if (options.quality !== 'original') {
      args.push('-crf', String(QUALITY_CRF[options.quality]))
    }
    args.push('-preset', 'medium')
  }
  // Audio
  if (options.removeAudio || options.format === 'gif') {
    args.push('-an')
  } else if (options.format === 'webm') {
    args.push('-c:a', 'libopus')
  } else if (options.format === 'mp4' || options.format === 'mkv') {
    args.push('-c:a', 'aac')
  }
  args.push('-y', dstPath)
  const result = await runFfmpeg(ffmpegPath, args)
  if (!result.ok) {
    return { ok: false, error: `ffmpeg failed (${result.code}): ${result.stderr.split('\n').pop()}` }
  }
  return { ok: true, dstPath }
}

// ──────────────────────────────────────────────────────────────────────
// MERGE — concat N videos via ffmpeg concat demuxer
// ──────────────────────────────────────────────────────────────────────

export interface MergeOptions {
  /** Output format (mp4/webm/mkv). Default 'mp4'. */
  outputFormat?: 'mp4' | 'webm' | 'mkv'
  /** Whether to re-encode (true) or stream-copy (false, faster but
   *  requires all inputs share codec). Default true. */
  reencode?: boolean
}

export async function mergeVideos(
  ffmpegPath: string,
  srcPaths: string[],
  dstPath: string,
  options: MergeOptions = {},
): Promise<{ ok: boolean; error?: string; dstPath?: string }> {
  if (srcPaths.length < 2) return { ok: false, error: 'need at least 2 inputs to merge' }
  const missing = srcPaths.find((p) => !fs.existsSync(p))
  if (missing) return { ok: false, error: `source missing: ${missing}` }
  const tmpList = path.join(os.tmpdir(), `vault-merge-${Date.now()}.txt`)
  // Concat-demuxer format: one `file '<path>'` per line, single-quoted with
  // single quotes inside escaped as '\''.
  const listContent = srcPaths
    .map((p) => `file '${p.replace(/'/g, "'\\''")}'`)
    .join('\n')
  fs.writeFileSync(tmpList, listContent, 'utf8')
  try {
    const args = ['-f', 'concat', '-safe', '0', '-i', tmpList]
    if (options.reencode === false) {
      args.push('-c', 'copy')
    } else {
      args.push('-c:v', 'libx264', '-crf', '18', '-preset', 'medium', '-c:a', 'aac')
    }
    args.push('-y', dstPath)
    const result = await runFfmpeg(ffmpegPath, args)
    if (!result.ok) {
      return { ok: false, error: `ffmpeg merge failed (${result.code}): ${result.stderr.split('\n').pop()}` }
    }
    return { ok: true, dstPath }
  } finally {
    try { fs.unlinkSync(tmpList) } catch { /* ignore */ }
  }
}

// ──────────────────────────────────────────────────────────────────────
// ROTATE — image or video; 0/90/180/270 deg + optional flip
// ──────────────────────────────────────────────────────────────────────

export interface RotateOptions {
  /** Rotation in degrees: 0, 90, 180, 270. */
  rotation: 0 | 90 | 180 | 270
  /** Horizontal flip (mirror left/right). */
  flipH?: boolean
  /** Vertical flip (mirror up/down). */
  flipV?: boolean
}

export async function rotateMedia(
  ffmpegPath: string,
  srcPath: string,
  dstPath: string,
  options: RotateOptions,
): Promise<{ ok: boolean; error?: string; dstPath?: string }> {
  if (!fs.existsSync(srcPath)) return { ok: false, error: 'source file missing' }
  const filters: string[] = []
  // Rotation: transpose is the most reliable filter for 90/270; rotate
  // for 180 (which is just hflip+vflip). 0 = no rotation filter.
  if (options.rotation === 90) filters.push('transpose=1')
  else if (options.rotation === 180) filters.push('hflip,vflip')
  else if (options.rotation === 270) filters.push('transpose=2')
  if (options.flipH) filters.push('hflip')
  if (options.flipV) filters.push('vflip')
  if (filters.length === 0) {
    return { ok: false, error: 'no rotation/flip specified' }
  }
  const args = ['-i', srcPath, '-vf', filters.join(',')]
  // For images, the single -frames:v 1 keeps the output a single frame.
  const ext = path.extname(dstPath).toLowerCase()
  if (['.jpg', '.jpeg', '.png', '.webp', '.bmp'].includes(ext)) {
    args.push('-frames:v', '1')
  } else {
    args.push('-c:v', 'libx264', '-crf', '18', '-preset', 'medium', '-c:a', 'copy')
  }
  args.push('-y', dstPath)
  const result = await runFfmpeg(ffmpegPath, args)
  if (!result.ok) {
    return { ok: false, error: `ffmpeg rotate failed (${result.code}): ${result.stderr.split('\n').pop()}` }
  }
  return { ok: true, dstPath }
}

// ──────────────────────────────────────────────────────────────────────
// WATERMARK — overlay text or image on video/image
// ──────────────────────────────────────────────────────────────────────

export interface WatermarkOptions {
  /** Either text to overlay, OR a path to an image file. */
  text?: string
  imagePath?: string
  /** Corner: 'tl' | 'tr' | 'bl' | 'br' | 'center'. Default 'br'. */
  position?: 'tl' | 'tr' | 'bl' | 'br' | 'center'
  /** 0-1, default 0.7. */
  opacity?: number
  /** For text: pixel size, default 48. */
  fontSize?: number
  /** Color CSS-style ('white' | '#ff0' | etc). Default 'white'. */
  color?: string
  /** For image: scale 0.0-1.0 relative to video width. Default 0.15. */
  imageScale?: number
}

function positionToXy(pos: WatermarkOptions['position']): { x: string; y: string } {
  switch (pos) {
    case 'tl': return { x: '10', y: '10' }
    case 'tr': return { x: 'main_w-overlay_w-10', y: '10' }
    case 'bl': return { x: '10', y: 'main_h-overlay_h-10' }
    case 'center': return { x: '(main_w-overlay_w)/2', y: '(main_h-overlay_h)/2' }
    case 'br':
    default: return { x: 'main_w-overlay_w-10', y: 'main_h-overlay_h-10' }
  }
}

function positionToTextXy(pos: WatermarkOptions['position']): { x: string; y: string } {
  switch (pos) {
    case 'tl': return { x: '10', y: '10' }
    case 'tr': return { x: 'w-tw-10', y: '10' }
    case 'bl': return { x: '10', y: 'h-th-10' }
    case 'center': return { x: '(w-tw)/2', y: '(h-th)/2' }
    case 'br':
    default: return { x: 'w-tw-10', y: 'h-th-10' }
  }
}

export async function applyWatermark(
  ffmpegPath: string,
  srcPath: string,
  dstPath: string,
  options: WatermarkOptions,
): Promise<{ ok: boolean; error?: string; dstPath?: string }> {
  if (!fs.existsSync(srcPath)) return { ok: false, error: 'source file missing' }
  if (!options.text && !options.imagePath) return { ok: false, error: 'no text or imagePath specified' }
  const opacity = Math.max(0, Math.min(1, options.opacity ?? 0.7))
  const args: string[] = ['-i', srcPath]
  if (options.imagePath) {
    if (!fs.existsSync(options.imagePath)) return { ok: false, error: 'watermark image missing' }
    args.push('-i', options.imagePath)
    const { x, y } = positionToXy(options.position)
    const scale = Math.max(0.01, Math.min(1, options.imageScale ?? 0.15))
    const filter = `[1:v]scale=iw*${scale}:-1,format=rgba,colorchannelmixer=aa=${opacity}[wm];[0:v][wm]overlay=${x}:${y}`
    args.push('-filter_complex', filter)
  } else {
    const { x, y } = positionToTextXy(options.position)
    // Escape single quotes and colons that drawtext is allergic to.
    const safeText = (options.text ?? '').replace(/'/g, "\\'").replace(/:/g, '\\:')
    const fontSize = options.fontSize ?? 48
    const color = options.color ?? 'white'
    const filter = `drawtext=text='${safeText}':fontsize=${fontSize}:fontcolor=${color}@${opacity}:x=${x}:y=${y}:box=1:boxcolor=black@${opacity * 0.4}:boxborderw=8`
    args.push('-vf', filter)
  }
  const ext = path.extname(dstPath).toLowerCase()
  if (['.jpg', '.jpeg', '.png', '.webp', '.bmp'].includes(ext)) {
    args.push('-frames:v', '1')
  } else {
    args.push('-c:v', 'libx264', '-crf', '18', '-preset', 'medium', '-c:a', 'copy')
  }
  args.push('-y', dstPath)
  const result = await runFfmpeg(ffmpegPath, args)
  if (!result.ok) {
    return { ok: false, error: `ffmpeg watermark failed (${result.code}): ${result.stderr.split('\n').pop()}` }
  }
  return { ok: true, dstPath }
}
