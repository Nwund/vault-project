// File: src/main/services/rife-interpolator.ts
//
// #227 A-03 / #255 B-31 — Real RIFE AI frame interpolation. RIFE
// upsamples 24/30 fps video into 60/120/240 fps for smoother slow-mo
// playback. The official `rife-ncnn-vulkan` binary is the easiest
// way to run it on Windows — single .exe + a folder of model
// weights, runs on any Vulkan GPU (including Intel iGPUs).
//
// Vault expects the user to drop the binary into a folder we point
// them at via settings. We invoke it as:
//
//   rife-ncnn-vulkan.exe -i <indir> -o <outdir> -m rife-v4.26 -n <multiplier>
//
// The "frame extraction → run RIFE → re-encode" sandwich:
//
//   1. ffmpeg -i src.mp4 frames/%08d.png         (extract frames)
//   2. rife-ncnn-vulkan -i frames -o out -n 2    (2× interpolation)
//   3. ffmpeg -framerate 60 -i out/%08d.png      (re-encode to mp4)
//
// We can skip the intermediate PNG pass by feeding ffmpeg's pipe
// frames directly — but the disk-staging form is what the binary
// supports today.

import { spawn } from 'node:child_process'
import * as path from 'node:path'
import * as fs from 'node:fs'
import * as os from 'node:os'

export type RifeMultiplier = 2 | 4 | 8

export interface RifeOptions {
  /** Path to rife-ncnn-vulkan(.exe). */
  binaryPath: string
  /** Path to ffmpeg binary. */
  ffmpegPath: string
  /** Output multiplier (2× / 4× / 8×). */
  multiplier: RifeMultiplier
  /** Model variant; rife-v4.26 is current default. */
  modelName?: string
  /** Destination file path; defaults to <src>.interp<x>.mp4. */
  dstPath?: string
  /** Target output framerate; default = input × multiplier. */
  outputFps?: number
  /** Codec for re-encode; default libx264 CRF 18. */
  videoCodec?: string
  crf?: number
}

function runProc(bin: string, args: string[]): Promise<{ ok: boolean; stderr: string }> {
  return new Promise((resolve) => {
    const proc = spawn(bin, args, { windowsHide: true })
    let stderr = ''
    proc.stderr?.on('data', (d) => { stderr += d.toString() })
    proc.on('error', () => resolve({ ok: false, stderr }))
    proc.on('close', (code) => resolve({ ok: code === 0, stderr }))
  })
}

async function probeFps(ffmpegPath: string, srcPath: string): Promise<number> {
  const ffprobe = ffmpegPath.replace(/ffmpeg(\.exe)?$/i, (m, ext) => `ffprobe${ext ?? ''}`)
  return new Promise((resolve) => {
    const proc = spawn(ffprobe, [
      '-v', 'error',
      '-select_streams', 'v:0',
      '-show_entries', 'stream=r_frame_rate',
      '-of', 'csv=p=0',
      srcPath,
    ], { windowsHide: true })
    let out = ''
    proc.stdout?.on('data', (d) => { out += d.toString() })
    proc.on('close', () => {
      const m = /^(\d+)\/(\d+)/.exec(out.trim())
      resolve(m ? Number(m[1]) / Number(m[2]) : 30)
    })
  })
}

export async function interpolate(srcPath: string, options: RifeOptions): Promise<{ ok: boolean; dstPath?: string; error?: string }> {
  if (!fs.existsSync(options.binaryPath)) return { ok: false, error: `rife binary not found at ${options.binaryPath}` }
  if (!fs.existsSync(srcPath)) return { ok: false, error: `source not found: ${srcPath}` }
  const stem = path.parse(srcPath).name
  const dst = options.dstPath ?? path.join(path.dirname(srcPath), `${stem}.interp${options.multiplier}x.mp4`)
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vault-rife-'))
  const framesDir = path.join(workDir, 'frames')
  const outDir = path.join(workDir, 'out')
  fs.mkdirSync(framesDir, { recursive: true })
  fs.mkdirSync(outDir, { recursive: true })
  try {
    // 1. Extract frames at source FPS.
    const extract = await runProc(options.ffmpegPath, [
      '-hide_banner', '-y', '-i', srcPath,
      '-q:v', '1',
      path.join(framesDir, '%08d.png'),
    ])
    if (!extract.ok) return { ok: false, error: 'frame extraction failed: ' + extract.stderr.split(/\r?\n/).slice(-3).join('\n') }
    // 2. Run RIFE.
    const rifeArgs = [
      '-i', framesDir,
      '-o', outDir,
      '-n', String(options.multiplier),
      '-m', options.modelName ?? 'rife-v4.26',
    ]
    const rife = await runProc(options.binaryPath, rifeArgs)
    if (!rife.ok) return { ok: false, error: 'rife failed: ' + rife.stderr.split(/\r?\n/).slice(-3).join('\n') }
    // 3. Reassemble at target FPS.
    const srcFps = await probeFps(options.ffmpegPath, srcPath)
    const outFps = options.outputFps ?? srcFps * options.multiplier
    const vcodec = options.videoCodec ?? 'libx264'
    const crf = options.crf ?? 18
    // Bring audio over from src so the timing stays right.
    const assemble = await runProc(options.ffmpegPath, [
      '-hide_banner', '-y',
      '-framerate', String(outFps),
      '-i', path.join(outDir, '%08d.png'),
      '-i', srcPath,
      '-map', '0:v:0', '-map', '1:a?',
      '-c:v', vcodec,
      ...(vcodec === 'libx264' ? ['-crf', String(crf), '-preset', 'medium'] : []),
      '-c:a', 'copy',
      '-shortest',
      dst,
    ])
    if (!assemble.ok) return { ok: false, error: 'reassemble failed: ' + assemble.stderr.split(/\r?\n/).slice(-3).join('\n') }
    return { ok: true, dstPath: dst }
  } finally {
    try { fs.rmSync(workDir, { recursive: true, force: true }) } catch { /* ignore */ }
  }
}

/** Single-place export presets for the UI. */
export const RIFE_PRESETS = {
  '60fps': { multiplier: 2, outputFps: 60 } as Partial<RifeOptions>,
  '120fps': { multiplier: 4, outputFps: 120 } as Partial<RifeOptions>,
  '240fps': { multiplier: 8, outputFps: 240 } as Partial<RifeOptions>,
  '60fps-slowmo-half': { multiplier: 4, outputFps: 60 } as Partial<RifeOptions>,
}
