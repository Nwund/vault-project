// File: src/renderer/utils/waveform-painter.ts
//
// #236 A-12 — Waveform-painted timeline ruler. Decodes the audio
// track of a video via the offline AudioContext, downsamples to a
// N-sample peak array, paints it into a canvas as a symmetric
// waveform strip. The player overlays this above (or behind) the
// scrubber so the user sees where the loud moments are.
//
// Pure renderer utility — no main-process dep. Caller passes a
// blob/file URL the offline audio context can decode (file://,
// vault://, blob:). Returns the peak array + a ready-to-draw
// canvas so the caller can position/size it however they want.

export interface WaveformResult {
  peaks: Float32Array
  durationSec: number
  sampleRate: number
}

export interface PaintOptions {
  width?: number
  height?: number
  color?: string
  bgColor?: string
  centered?: boolean   // mirror-pad to vertical center (default true)
  /** progressColor — if set, paints a "played" overlay up to progressPct */
  progressColor?: string
  progressPct?: number
}

let sharedAc: AudioContext | null = null
function ctx(): AudioContext {
  if (!sharedAc || sharedAc.state === 'closed') sharedAc = new (window.AudioContext || (window as any).webkitAudioContext)()
  return sharedAc
}

// Decode + downsample audio. Resolves with a peak array of `peaksCount`
// floats in [0, 1] representing max-abs-amplitude per bucket.
export async function generateWaveform(srcUrl: string, peaksCount = 1200): Promise<WaveformResult | null> {
  try {
    const resp = await fetch(srcUrl)
    if (!resp.ok) return null
    const buf = await resp.arrayBuffer()
    const ac = ctx()
    if (ac.state === 'suspended') await ac.resume()
    const decoded = await ac.decodeAudioData(buf.slice(0))
    // Sum channels and take abs-max per bucket.
    const channels: Float32Array[] = []
    for (let c = 0; c < decoded.numberOfChannels; c++) channels.push(decoded.getChannelData(c))
    const samples = decoded.length
    const bucketSize = Math.max(1, Math.floor(samples / peaksCount))
    const peaks = new Float32Array(peaksCount)
    for (let b = 0; b < peaksCount; b++) {
      const start = b * bucketSize
      const end = Math.min(samples, start + bucketSize)
      let peak = 0
      for (let i = start; i < end; i++) {
        // Avg across channels then abs.
        let sum = 0
        for (const ch of channels) sum += Math.abs(ch[i])
        const v = sum / channels.length
        if (v > peak) peak = v
      }
      peaks[b] = Math.min(1, peak)
    }
    return { peaks, durationSec: decoded.duration, sampleRate: decoded.sampleRate }
  } catch (err) {
    console.warn('[waveform] generate failed:', err)
    return null
  }
}

// Paint a previously-generated peak array onto an HTMLCanvasElement.
// Caller owns the canvas (DPI, sizing, mounting).
export function paintWaveform(canvas: HTMLCanvasElement, peaks: Float32Array, options: PaintOptions = {}): void {
  const w = options.width ?? canvas.width
  const h = options.height ?? canvas.height
  const color = options.color ?? 'rgba(255, 107, 157, 0.6)'
  const bgColor = options.bgColor ?? 'transparent'
  const centered = options.centered !== false
  const progressColor = options.progressColor ?? 'rgba(255, 107, 157, 0.9)'
  const progressPct = Math.max(0, Math.min(1, options.progressPct ?? 0))

  const dpr = window.devicePixelRatio || 1
  canvas.width = w * dpr
  canvas.height = h * dpr
  canvas.style.width = `${w}px`
  canvas.style.height = `${h}px`
  const cx = canvas.getContext('2d')
  if (!cx) return
  cx.scale(dpr, dpr)
  cx.clearRect(0, 0, w, h)
  if (bgColor !== 'transparent') { cx.fillStyle = bgColor; cx.fillRect(0, 0, w, h) }

  const barCount = peaks.length
  const barW = w / barCount
  for (let i = 0; i < barCount; i++) {
    const peak = peaks[i]
    const barH = peak * h * (centered ? 0.5 : 1)
    const x = i * barW
    const isPlayed = (i / barCount) <= progressPct
    cx.fillStyle = isPlayed ? progressColor : color
    if (centered) {
      cx.fillRect(x, (h / 2) - barH, Math.max(0.5, barW - 0.5), barH * 2)
    } else {
      cx.fillRect(x, h - barH, Math.max(0.5, barW - 0.5), barH)
    }
  }
}

// Convenience: decode + paint in one call.
export async function generateAndPaintWaveform(canvas: HTMLCanvasElement, srcUrl: string, options: PaintOptions = {}): Promise<WaveformResult | null> {
  const result = await generateWaveform(srcUrl, Math.max(100, options.width ?? canvas.width))
  if (!result) return null
  paintWaveform(canvas, result.peaks, options)
  return result
}
