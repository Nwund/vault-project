// File: src/renderer/utils/beat-transitions.ts
//
// #171 — Beat-locked transition library.
//
// A small set of dependency-free transition effects you can apply to
// any <video> by drawing into an overlay <canvas>. Each transition is
// (ctx, video, t01) → void where t01 is progress 0..1 across the
// transition window. The PMV editor quantizes the start of each
// transition to the nearest beat marker so they fire on the downbeat.
//
// Effects implemented here use Canvas2D only — no WebGL shaders, no
// stock PNG sequences. Trade-off: slightly less polished than the
// VEGAS/After-Effects equivalents but ship today and look 80% as good
// for PMV/B-roll work.
//
//   rgbSplit       chromatic-aberration pulse on the beat
//   zoomBlur       radial-blur-style accumulation
//   filmBurn       warm vignette + noise overlay
//   datamoshLite   horizontal slice glitch (RGBA byte-swap rows)
//   flashCut       quick white frame
//
// Real datamosh (skipped I-frame re-encode via ffmpeg) needs a main-
// process pass on the source file — handled separately by the export
// pipeline, not by this realtime preview layer.

export type TransitionId = 'rgbSplit' | 'zoomBlur' | 'filmBurn' | 'datamoshLite' | 'flashCut'

export const TRANSITION_PRESETS: ReadonlyArray<{ id: TransitionId; label: string; duration: number }> = [
  { id: 'rgbSplit',     label: 'RGB split',     duration: 0.35 },
  { id: 'zoomBlur',     label: 'Zoom blur',     duration: 0.40 },
  { id: 'filmBurn',     label: 'Film burn',     duration: 0.55 },
  { id: 'datamoshLite', label: 'Datamosh lite', duration: 0.30 },
  { id: 'flashCut',     label: 'Flash cut',     duration: 0.18 },
]

/**
 * Apply the named transition to the given canvas, drawing the video
 * frame (or its previous frame) with the effect at progress t01.
 *
 * Caller is expected to draw the base video frame onto the canvas
 * before calling — applyTransition only overlays / mutates pixels.
 */
export function applyTransition(
  id: TransitionId,
  ctx: CanvasRenderingContext2D,
  video: HTMLVideoElement | null,
  t01: number,
): void {
  const t = Math.max(0, Math.min(1, t01))
  switch (id) {
    case 'rgbSplit':     return drawRgbSplit(ctx, video, t)
    case 'zoomBlur':     return drawZoomBlur(ctx, video, t)
    case 'filmBurn':     return drawFilmBurn(ctx, t)
    case 'datamoshLite': return drawDatamoshLite(ctx, t)
    case 'flashCut':     return drawFlashCut(ctx, t)
  }
}

function drawRgbSplit(ctx: CanvasRenderingContext2D, video: HTMLVideoElement | null, t: number): void {
  if (!video) return
  const w = ctx.canvas.width
  const h = ctx.canvas.height
  // Eased pulse — strong at start, decays out so the split snaps to
  // the beat then dissolves over the rest of the window.
  const amp = (1 - t) * 12 // px offset
  ctx.clearRect(0, 0, w, h)
  ctx.globalCompositeOperation = 'lighter'
  // Red channel offset right + slight green left + blue centered.
  ctx.filter = 'sepia(1) saturate(20) hue-rotate(-50deg)'
  ctx.drawImage(video, amp, 0, w, h)
  ctx.filter = 'sepia(1) saturate(20) hue-rotate(70deg)'
  ctx.drawImage(video, -amp, 0, w, h)
  ctx.filter = 'sepia(1) saturate(20) hue-rotate(180deg)'
  ctx.drawImage(video, 0, 0, w, h)
  ctx.filter = 'none'
  ctx.globalCompositeOperation = 'source-over'
}

function drawZoomBlur(ctx: CanvasRenderingContext2D, video: HTMLVideoElement | null, t: number): void {
  if (!video) return
  const w = ctx.canvas.width
  const h = ctx.canvas.height
  ctx.clearRect(0, 0, w, h)
  // Composite N successively scaled copies with decreasing alpha for
  // a radial-zoom blur look. 6 layers keeps it cheap (<3ms/frame).
  const layers = 6
  for (let i = 0; i < layers; i++) {
    const k = 1 + (i / layers) * (0.15 + t * 0.45)
    const dw = w * k
    const dh = h * k
    ctx.globalAlpha = (1 - i / layers) * 0.85
    ctx.drawImage(video, (w - dw) / 2, (h - dh) / 2, dw, dh)
  }
  ctx.globalAlpha = 1
}

function drawFilmBurn(ctx: CanvasRenderingContext2D, t: number): void {
  const w = ctx.canvas.width
  const h = ctx.canvas.height
  // Soft amber vignette that peaks at t=0.5 and decays.
  const peak = 1 - Math.abs(2 * t - 1)
  const grad = ctx.createRadialGradient(w * 0.5, h * 0.5, w * 0.1, w * 0.5, h * 0.5, w * 0.7)
  grad.addColorStop(0, `rgba(255, 180, 100, ${peak * 0.55})`)
  grad.addColorStop(1, `rgba(180, 80, 40, ${peak * 0.05})`)
  ctx.globalCompositeOperation = 'screen'
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, w, h)
  ctx.globalCompositeOperation = 'source-over'
  // Sparse noise specks for grain.
  ctx.fillStyle = `rgba(255,210,140,${peak * 0.35})`
  const count = Math.floor(w * h * 0.0003 * peak)
  for (let i = 0; i < count; i++) {
    const x = Math.random() * w
    const y = Math.random() * h
    ctx.fillRect(x, y, 1, 1)
  }
}

function drawDatamoshLite(ctx: CanvasRenderingContext2D, t: number): void {
  const w = ctx.canvas.width
  const h = ctx.canvas.height
  // Horizontal slice glitch: grab N strips and translate them by a
  // pseudo-random offset that decays over the window.
  const amp = (1 - t) * (w * 0.08)
  const strips = 10
  const stripH = h / strips
  for (let i = 0; i < strips; i++) {
    if (Math.random() > 0.55) continue
    const y = i * stripH
    const dx = (Math.random() - 0.5) * amp
    try {
      const slice = ctx.getImageData(0, y, w, stripH)
      ctx.putImageData(slice, dx, y)
    } catch { /* tainted canvas — skip */ }
  }
}

function drawFlashCut(ctx: CanvasRenderingContext2D, t: number): void {
  const peak = 1 - Math.abs(2 * t - 1)
  ctx.fillStyle = `rgba(255,255,255,${peak * 0.95})`
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height)
}

/**
 * Given a list of beat times (sec) and a current playhead time,
 * return the nearest beat ≤ t — useful for snapping a transition
 * START to a beat downbeat.
 */
export function quantizeToBeat(currentSec: number, beats: number[]): number {
  if (beats.length === 0) return currentSec
  // beats are assumed sorted ascending
  let prev = beats[0]
  for (const b of beats) {
    if (b > currentSec) return prev
    prev = b
  }
  return prev
}
