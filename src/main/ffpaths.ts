// Resolve ffmpeg and ffprobe binary paths for both dev and production.
// In dev: uses the npm packages (ffmpeg-static, ffprobe-static).
// In production: uses extraResources bundled alongside the app.
import path from 'node:path'
import fs from 'node:fs'

function resolveExtraResource(name: string): string | null {
  // In packaged app, extraResources are at process.resourcesPath
  if (process.resourcesPath) {
    const resourcePath = path.join(process.resourcesPath, name)
    if (fs.existsSync(resourcePath)) return resourcePath
  }
  return null
}

// Use dynamic module name to prevent Vite from bundling these binary packages
declare const __non_webpack_require__: typeof require
const _require = typeof __non_webpack_require__ !== 'undefined' ? __non_webpack_require__ : require

function resolveFfmpegPath(): string | null {
  const prod = resolveExtraResource('ffmpeg.exe')
  if (prod) return prod

  try {
    const mod = 'ffmpeg-static'
    return _require(mod) as string
  } catch {
    return null
  }
}

function resolveFfprobePath(): string | null {
  const prod = resolveExtraResource('ffprobe.exe')
  if (prod) return prod

  try {
    const mod = 'ffprobe-static'
    return _require(mod)?.path as string
  } catch {
    return null
  }
}

export const ffmpegBin = resolveFfmpegPath()
export const ffprobeBin = resolveFfprobePath()

/**
 * Runtime-detected hardware-acceleration capabilities of the bundled
 * ffmpeg. Populated once on first call by spawning `ffmpeg -hwaccels`
 * and `ffmpeg -encoders` and pattern-matching the output. Cached so
 * subsequent reads are free.
 *
 * Vault uses this to route frame-extraction through CUDA on RTX-class
 * hardware (2-10× speedup on 1080p+), with QSV / AMF / DXVA2 as
 * fallbacks. CPU path remains the safe default if nothing detected.
 */
export interface HwAccelCaps {
  cudaDecode: boolean        // -hwaccel cuda available
  cudaEncode: boolean        // h264_nvenc / hevc_nvenc available
  qsvDecode: boolean         // Intel QuickSync decode
  qsvEncode: boolean
  amfEncode: boolean         // AMD AMF
  dxva2: boolean             // generic Windows decode fallback
  hevcCuvid: boolean         // HEVC via NVDEC
  h264Cuvid: boolean         // H.264 via NVDEC
}

let _hwAccelCache: HwAccelCaps | null = null

export async function detectHwAccelCaps(): Promise<HwAccelCaps> {
  if (_hwAccelCache) return _hwAccelCache
  const empty: HwAccelCaps = {
    cudaDecode: false, cudaEncode: false,
    qsvDecode: false, qsvEncode: false,
    amfEncode: false, dxva2: false,
    hevcCuvid: false, h264Cuvid: false,
  }
  if (!ffmpegBin) { _hwAccelCache = empty; return empty }

  const { spawn } = await import('node:child_process')
  const run = (args: string[]): Promise<string> => new Promise((resolve) => {
    let out = ''
    try {
      const proc = spawn(ffmpegBin!, args, { windowsHide: true })
      proc.stdout?.on('data', (d: Buffer) => { out += d.toString() })
      proc.stderr?.on('data', (d: Buffer) => { out += d.toString() })
      proc.on('error', () => resolve(''))
      proc.on('close', () => resolve(out))
    } catch { resolve('') }
  })

  const [hwaccels, encoders, decoders] = await Promise.all([
    run(['-hide_banner', '-hwaccels']),
    run(['-hide_banner', '-encoders']),
    run(['-hide_banner', '-decoders']),
  ])

  const caps: HwAccelCaps = {
    cudaDecode: /\bcuda\b/i.test(hwaccels),
    qsvDecode: /\bqsv\b/i.test(hwaccels),
    dxva2: /\b(d3d11va|dxva2)\b/i.test(hwaccels),
    cudaEncode: /h264_nvenc|hevc_nvenc/i.test(encoders),
    qsvEncode: /h264_qsv|hevc_qsv/i.test(encoders),
    amfEncode: /h264_amf|hevc_amf/i.test(encoders),
    h264Cuvid: /h264_cuvid/i.test(decoders),
    hevcCuvid: /hevc_cuvid/i.test(decoders),
  }
  _hwAccelCache = caps
  console.log('[ffpaths] HW accel capabilities:', caps)
  return caps
}

/**
 * Build the `-hwaccel ... -hwaccel_output_format ...` prefix args for
 * a frame-extract command. Returns an empty array when no HW accel is
 * available so callers can splat unconditionally:
 *
 *   const hwArgs = await ffmpegHwAccelArgs()
 *   spawn(ffmpegBin, [...hwArgs, '-ss', t, '-i', path, ...rest])
 *
 * The args picked here keep decoded frames on-GPU through scale, only
 * downloading the final encoded JPEG output. ~2× on 1080p, ~10× on 4K
 * vs the CPU path.
 */
export async function ffmpegHwAccelArgs(): Promise<string[]> {
  const caps = await detectHwAccelCaps()
  if (caps.cudaDecode) {
    return ['-hwaccel', 'cuda', '-hwaccel_output_format', 'cuda']
  }
  if (caps.qsvDecode) {
    return ['-hwaccel', 'qsv', '-hwaccel_output_format', 'qsv']
  }
  if (caps.dxva2) {
    return ['-hwaccel', 'd3d11va']
  }
  return []
}
