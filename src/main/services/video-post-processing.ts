// File: src/main/services/video-post-processing.ts
//
// Three ffmpeg-driven post-processing operations on existing videos.
// All are non-destructive: the original stays put and a derived file
// is written next to it (default) or to a caller-chosen path.
//
//   #225 toneMapHDR        — HDR (BT.2020 / PQ / HLG) → SDR (BT.709)
//                            via zscale + tonemap=hable. Most "washed
//                            out" or "too dark" HDR clips render fine
//                            after this pass.
//   #235 masterAudio       — bring audio up to broadcast-spec
//                            -16 LUFS / -1.5 TP / 11 LRA via the
//                            two-pass loudnorm filter, ending with an
//                            alimiter peak ceiling. Ready for Discord
//                            / Twitter share.
//   #238 denoiseAndGrain   — hqdn3d temporal+spatial denoise followed
//                            by a light film-grain restore. Cleans
//                            handheld phone footage without making it
//                            look like a wax figure.
//
// Each function returns the destination path on success. Long-running;
// caller should surface a spinner.

import { spawn } from 'node:child_process'
import * as path from 'node:path'
import * as fs from 'node:fs'

function defaultOutPath(srcPath: string, suffix: string): string {
  const ext = path.extname(srcPath)
  const base = srcPath.slice(0, srcPath.length - ext.length)
  return `${base}.${suffix}${ext}`
}

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
// #225 HDR → SDR tone mapping
// ──────────────────────────────────────────────────────────────────────

export interface ToneMapOptions {
  dstPath?: string
  // 'hable' = filmic shoulder (default, looks most natural)
  // 'mobius' = blended linear/log; preserves highlights better but
  //   can crush midtones
  // 'reinhard' = simple ratio compression; oldest, most conservative
  tonemap?: 'hable' | 'mobius' | 'reinhard'
  // Target peak luminance in nits. 100 = TV-spec SDR. 200 = "punchier"
  // for HDR clips that would otherwise look too dim on SDR displays.
  peak?: number
  videoCodec?: string  // default 'libx264'; pass 'h264_nvenc' / 'hevc_nvenc' to use HW
  crf?: number         // x264 CRF, default 18
}

export async function toneMapHDR(
  ffmpegPath: string,
  srcPath: string,
  options: ToneMapOptions = {},
): Promise<{ ok: boolean; dstPath?: string; error?: string }> {
  const dst = options.dstPath ?? defaultOutPath(srcPath, 'sdr')
  const tonemap = options.tonemap ?? 'hable'
  const peak = options.peak ?? 100
  const vcodec = options.videoCodec ?? 'libx264'
  const crf = options.crf ?? 18
  // The filter chain converts BT.2020 → linear via zscale, applies
  // tonemap, then re-encodes to BT.709 SDR. Strict ranges so the
  // chain works on HDR10 + HLG sources alike.
  const vf = [
    `zscale=t=linear:npl=${peak}`,
    `format=gbrpf32le`,
    `zscale=p=bt709`,
    `tonemap=tonemap=${tonemap}:desat=0`,
    `zscale=t=bt709:m=bt709:r=tv`,
    `format=yuv420p`,
  ].join(',')
  const args = [
    '-hide_banner', '-y',
    '-i', srcPath,
    '-vf', vf,
    '-c:v', vcodec,
    ...(vcodec === 'libx264' ? ['-crf', String(crf), '-preset', 'medium'] : []),
    '-c:a', 'copy',
    dst,
  ]
  const r = await runFfmpeg(ffmpegPath, args)
  if (r.ok) return { ok: true, dstPath: dst }
  // Clean up partial output on failure so the next attempt starts clean.
  try { if (fs.existsSync(dst)) fs.unlinkSync(dst) } catch { /* ignore */ }
  return { ok: false, error: r.stderr.trim().split(/\r?\n/).slice(-5).join('\n') }
}

// ──────────────────────────────────────────────────────────────────────
// #235 audio mastering — two-pass loudnorm + alimiter
// ──────────────────────────────────────────────────────────────────────

export interface MasterAudioOptions {
  dstPath?: string
  // EBU R128 targets. -16 LUFS is YouTube / Apple Music. -14 is Spotify.
  // -23 is broadcast. True-peak ceiling defaults to -1.5 dB to keep
  // codec headroom for AAC/Opus re-encodes downstream.
  targetLufs?: number
  truePeakDb?: number
  lra?: number
}

export async function masterAudio(
  ffmpegPath: string,
  srcPath: string,
  options: MasterAudioOptions = {},
): Promise<{ ok: boolean; dstPath?: string; measured?: any; error?: string }> {
  const dst = options.dstPath ?? defaultOutPath(srcPath, 'mastered')
  const i = options.targetLufs ?? -16
  const tp = options.truePeakDb ?? -1.5
  const lra = options.lra ?? 11
  // Pass 1: measure. Output goes to /dev/null but stderr contains the
  // JSON measurement block we feed into pass 2.
  const measureArgs = [
    '-hide_banner', '-nostats',
    '-i', srcPath,
    '-af', `loudnorm=I=${i}:TP=${tp}:LRA=${lra}:print_format=json`,
    '-f', 'null', '-',
  ]
  const m = await runFfmpeg(ffmpegPath, measureArgs)
  if (!m.ok) return { ok: false, error: 'loudnorm measure pass failed:\n' + m.stderr.slice(-400) }
  // Extract the JSON block — it's the last {...} in stderr.
  const jsonMatch = m.stderr.match(/\{[\s\S]*?"input_i"[\s\S]*?\}/)
  if (!jsonMatch) return { ok: false, error: 'could not parse loudnorm measurement' }
  let measured: any
  try { measured = JSON.parse(jsonMatch[0]) } catch (err: any) {
    return { ok: false, error: `loudnorm JSON parse failed: ${err.message}` }
  }
  // Pass 2: apply with measured stats threaded back in, then alimiter
  // as a hard true-peak guardrail.
  const af = [
    `loudnorm=I=${i}:TP=${tp}:LRA=${lra}` +
      `:measured_I=${measured.input_i}` +
      `:measured_TP=${measured.input_tp}` +
      `:measured_LRA=${measured.input_lra}` +
      `:measured_thresh=${measured.input_thresh}` +
      `:offset=${measured.target_offset}` +
      `:linear=true:print_format=summary`,
    `alimiter=limit=${Math.pow(10, tp / 20).toFixed(4)}:asc=1`,
  ].join(',')
  const args = [
    '-hide_banner', '-y',
    '-i', srcPath,
    '-c:v', 'copy',
    '-af', af,
    '-c:a', 'aac', '-b:a', '192k',
    dst,
  ]
  const r = await runFfmpeg(ffmpegPath, args)
  if (r.ok) return { ok: true, dstPath: dst, measured }
  try { if (fs.existsSync(dst)) fs.unlinkSync(dst) } catch { /* ignore */ }
  return { ok: false, error: r.stderr.trim().split(/\r?\n/).slice(-5).join('\n') }
}

// ──────────────────────────────────────────────────────────────────────
// #238 hqdn3d denoise + light grain restore
// ──────────────────────────────────────────────────────────────────────

export interface DenoiseOptions {
  dstPath?: string
  // hqdn3d strength: luma_spatial:chroma_spatial:luma_temporal:chroma_temporal
  // Default is the ffmpeg "smooth" preset (4:3:6:4.5).
  strength?: 'light' | 'medium' | 'heavy'
  // Grain restore amount 0..50 (0 disables). Adds noise=alls back so
  // the denoise pass doesn't leave that "plastic skin" look.
  grain?: number
  videoCodec?: string
  crf?: number
}

const HQDN3D_PRESETS: Record<NonNullable<DenoiseOptions['strength']>, string> = {
  light: '2:1.5:3:2',
  medium: '4:3:6:4.5',
  heavy: '8:6:9:7',
}

// ──────────────────────────────────────────────────────────────────────
// #231 vidstab two-pass deshake — fixes phone/handheld shake without
// the wobble artifacts of single-pass deshake.
// ──────────────────────────────────────────────────────────────────────

export interface DeshakeOptions {
  dstPath?: string
  // Shakiness 1..10 — higher = more aggressive shake assumption
  shakiness?: number
  // Accuracy 1..15 — higher = more reference points, slower
  accuracy?: number
  // Smoothing 0..100 frames — higher = smoother but more frame trim
  smoothing?: number
  // Crop 'black' (default — preserves resolution, may show black) or 'keep' (no crop, full warp).
  crop?: 'black' | 'keep'
  videoCodec?: string
  crf?: number
}

export async function deshake(
  ffmpegPath: string,
  srcPath: string,
  options: DeshakeOptions = {},
): Promise<{ ok: boolean; dstPath?: string; error?: string }> {
  const dst = options.dstPath ?? defaultOutPath(srcPath, 'deshake')
  const shakiness = Math.max(1, Math.min(10, options.shakiness ?? 5))
  const accuracy = Math.max(1, Math.min(15, options.accuracy ?? 9))
  const smoothing = Math.max(1, Math.min(100, options.smoothing ?? 30))
  const crop = options.crop ?? 'black'
  const vcodec = options.videoCodec ?? 'libx264'
  const crf = options.crf ?? 18
  const path = await import('node:path')
  const os = await import('node:os')
  const trfPath = path.join(os.tmpdir(), `vault-vidstab-${Date.now()}.trf`)
  try {
    // Pass 1: vidstabdetect writes motion data to .trf
    const detect = await runFfmpeg(ffmpegPath, [
      '-hide_banner', '-y', '-i', srcPath,
      '-vf', `vidstabdetect=shakiness=${shakiness}:accuracy=${accuracy}:result=${trfPath}`,
      '-f', 'null', '-',
    ])
    if (!detect.ok) {
      return { ok: false, error: `vidstabdetect failed: ${detect.stderr.split(/\r?\n/).slice(-3).join('\n')}` }
    }
    // Pass 2: vidstabtransform applies smoothed correction
    const apply = await runFfmpeg(ffmpegPath, [
      '-hide_banner', '-y', '-i', srcPath,
      '-vf', `vidstabtransform=input=${trfPath}:smoothing=${smoothing}:crop=${crop}:zoom=0:optzoom=1`,
      '-c:v', vcodec,
      ...(vcodec === 'libx264' ? ['-crf', String(crf), '-preset', 'medium'] : []),
      '-c:a', 'copy',
      dst,
    ])
    if (apply.ok) return { ok: true, dstPath: dst }
    try { if (fs.existsSync(dst)) fs.unlinkSync(dst) } catch { /* ignore */ }
    return { ok: false, error: apply.stderr.trim().split(/\r?\n/).slice(-5).join('\n') }
  } finally {
    try { fs.unlinkSync(trfPath) } catch { /* ignore */ }
  }
}

// ─── Motion-vector-driven auto-pan reframer (#232) ─────────────────
//
// Reframes a wide-aspect video into a portrait/square crop that
// follows action via ffmpeg's `cropdetect` over a downscaled probe,
// then a single render that crops to a smoothed window. Uses
// cropdetect+select to find the densest motion region per chunk
// (~2s window), interpolates between centers, and re-encodes.
//
// Cheaper than real motion-vector extraction (which would need
// codec_data parsing); the cropdetect approach is the practical
// default that ffmpeg ships out of the box.

export interface ReframeOptions {
  dstPath?: string
  /** Target aspect ratio, e.g. '9:16' for TikTok, '1:1' for IG. */
  aspect: '9:16' | '1:1' | '4:5' | '16:9'
  /** Smoothing window in seconds; bigger = less jitter, more drag. */
  smoothing?: number
  /** Output height in px. Defaults to source height. */
  height?: number
  videoCodec?: string
  crf?: number
}

const ASPECT_RATIO_MAP: Record<ReframeOptions['aspect'], number> = {
  '9:16': 9 / 16,
  '1:1': 1,
  '4:5': 4 / 5,
  '16:9': 16 / 9,
}

async function probeDimensions(ffmpegPath: string, srcPath: string): Promise<{ w: number; h: number; duration: number } | null> {
  const ffprobe = ffmpegPath.replace(/ffmpeg(\.exe)?$/i, (m, ext) => `ffprobe${ext ?? ''}`)
  return new Promise((resolve) => {
    const proc = spawn(ffprobe, [
      '-v', 'error',
      '-select_streams', 'v:0',
      '-show_entries', 'stream=width,height:format=duration',
      '-of', 'json',
      srcPath,
    ], { windowsHide: true })
    let out = ''
    proc.stdout?.on('data', (d) => { out += d.toString() })
    proc.on('error', () => resolve(null))
    proc.on('close', () => {
      try {
        const j = JSON.parse(out)
        const s = j.streams?.[0]
        resolve({ w: Number(s.width), h: Number(s.height), duration: Number(j.format?.duration ?? 0) })
      } catch { resolve(null) }
    })
  })
}

async function detectActivityCenters(
  ffmpegPath: string,
  srcPath: string,
  windowSec: number,
  duration: number,
  srcW: number,
  srcH: number,
): Promise<Array<{ t: number; cx: number; cy: number }>> {
  // Sample one frame every windowSec, run cropdetect to find the
  // bounding box of "interesting" (non-black, high-variance) content.
  // Use the bbox center as the focus point.
  const fps = 1 / Math.max(0.5, windowSec)
  return new Promise((resolve) => {
    const proc = spawn(ffmpegPath, [
      '-hide_banner', '-loglevel', 'info',
      '-i', srcPath,
      '-vf', `fps=${fps},cropdetect=limit=24:round=2:reset_count=1`,
      '-f', 'null', '-',
    ], { windowsHide: true })
    let buf = ''
    proc.stderr?.on('data', (d) => { buf += d.toString() })
    proc.on('close', () => {
      const re = /t:(\d+\.?\d*).*?crop=(\d+):(\d+):(\d+):(\d+)/g
      const centers: Array<{ t: number; cx: number; cy: number }> = []
      let m
      while ((m = re.exec(buf)) !== null) {
        const t = Number(m[1])
        const cw = Number(m[2]), ch = Number(m[3])
        const cx = Number(m[4]) + cw / 2
        const cy = Number(m[5]) + ch / 2
        centers.push({ t, cx, cy })
      }
      if (centers.length === 0) {
        // Fallback: static center.
        centers.push({ t: 0, cx: srcW / 2, cy: srcH / 2 })
        centers.push({ t: duration, cx: srcW / 2, cy: srcH / 2 })
      }
      resolve(centers)
    })
  })
}

function buildCropExpr(
  centers: Array<{ t: number; cx: number; cy: number }>,
  cropW: number,
  cropH: number,
  srcW: number,
  srcH: number,
): { x: string; y: string } {
  // Build a piecewise-linear ffmpeg expression interpolating x/y over time.
  // ffmpeg has `between(t, a, b)` and ternary `if(cond, then, else)` — chain
  // them for each segment. Clamp at frame edges.
  const buildAxis = (axis: 'cx' | 'cy'): string => {
    const half = axis === 'cx' ? cropW / 2 : cropH / 2
    const max = (axis === 'cx' ? srcW : srcH) - (axis === 'cx' ? cropW : cropH)
    const segments = centers.map((c, i) => {
      const next = centers[i + 1] ?? c
      const dt = Math.max(0.01, next.t - c.t)
      const v0 = Math.max(0, Math.min(max, c[axis] - half))
      const v1 = Math.max(0, Math.min(max, next[axis] - half))
      return `if(between(t,${c.t.toFixed(3)},${next.t.toFixed(3)}),${v0.toFixed(2)}+(${(v1 - v0).toFixed(2)})*(t-${c.t.toFixed(3)})/${dt.toFixed(3)},`
    })
    const tail = `0${')'.repeat(segments.length)}`
    return segments.join('') + tail
  }
  return { x: buildAxis('cx'), y: buildAxis('cy') }
}

export async function reframeMotion(
  ffmpegPath: string,
  srcPath: string,
  options: ReframeOptions,
): Promise<{ ok: boolean; dstPath?: string; error?: string }> {
  const dst = options.dstPath ?? defaultOutPath(srcPath, `reframe-${options.aspect.replace(':', 'x')}`)
  const dims = await probeDimensions(ffmpegPath, srcPath)
  if (!dims) return { ok: false, error: 'ffprobe failed' }
  const aspectRatio = ASPECT_RATIO_MAP[options.aspect]
  const outH = options.height ?? dims.h
  const outW = Math.round(outH * aspectRatio)
  // Crop region in source dimensions; height locked to source, width derived.
  const cropH = dims.h
  const cropW = Math.min(dims.w, Math.round(cropH * aspectRatio))
  const smoothing = options.smoothing ?? 2
  const centers = await detectActivityCenters(ffmpegPath, srcPath, smoothing, dims.duration, dims.w, dims.h)
  const { x, y } = buildCropExpr(centers, cropW, cropH, dims.w, dims.h)
  const vf = `crop=${cropW}:${cropH}:${x}:${y},scale=${outW}:${outH}`
  const vcodec = options.videoCodec ?? 'libx264'
  const crf = options.crf ?? 18
  const args = [
    '-hide_banner', '-y',
    '-i', srcPath,
    '-vf', vf,
    '-c:v', vcodec,
    ...(vcodec === 'libx264' ? ['-crf', String(crf), '-preset', 'medium'] : []),
    '-c:a', 'copy',
    dst,
  ]
  const r = await runFfmpeg(ffmpegPath, args)
  if (r.ok) return { ok: true, dstPath: dst }
  try { if (fs.existsSync(dst)) fs.unlinkSync(dst) } catch { /* ignore */ }
  return { ok: false, error: r.stderr.trim().split(/\r?\n/).slice(-5).join('\n') }
}

export async function denoiseAndGrain(
  ffmpegPath: string,
  srcPath: string,
  options: DenoiseOptions = {},
): Promise<{ ok: boolean; dstPath?: string; error?: string }> {
  const dst = options.dstPath ?? defaultOutPath(srcPath, 'denoised')
  const strength = HQDN3D_PRESETS[options.strength ?? 'medium']
  const grain = Math.max(0, Math.min(50, options.grain ?? 8))
  const vcodec = options.videoCodec ?? 'libx264'
  const crf = options.crf ?? 18
  const vf = grain > 0
    ? `hqdn3d=${strength},noise=alls=${grain}:allf=t+u`
    : `hqdn3d=${strength}`
  const args = [
    '-hide_banner', '-y',
    '-i', srcPath,
    '-vf', vf,
    '-c:v', vcodec,
    ...(vcodec === 'libx264' ? ['-crf', String(crf), '-preset', 'medium'] : []),
    '-c:a', 'copy',
    dst,
  ]
  const r = await runFfmpeg(ffmpegPath, args)
  if (r.ok) return { ok: true, dstPath: dst }
  try { if (fs.existsSync(dst)) fs.unlinkSync(dst) } catch { /* ignore */ }
  return { ok: false, error: r.stderr.trim().split(/\r?\n/).slice(-5).join('\n') }
}
