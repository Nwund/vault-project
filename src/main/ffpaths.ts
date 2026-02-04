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
