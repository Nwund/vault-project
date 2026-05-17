// File: src/renderer/utils/vectorscope.ts
//
// #226 A-02 — WebGL vectorscope + RGB-parade overlay. Two color-
// analysis displays editors use to balance grades:
//
//   Vectorscope: scatter of every pixel's chroma (Cb, Cr). Reveals
//                color cast, saturation, skin-tone alignment.
//   RGB Parade:  three vertical columns showing R, G, B per-column
//                histograms across the frame width. Reveals
//                exposure / per-channel clip.
//
// Both run on the renderer at ~30fps via Canvas + getImageData. WebGL
// would be faster but adds shader-management complexity; Canvas is
// fine for thumbnail-sized displays (320×240). Full HD is too slow.
//
// Caller passes a source <video> element + two destination canvases;
// the start() runner samples the video into a hidden temp canvas at a
// configurable resolution, builds the analysis canvases, repaints
// every animationFrame. Stop with the returned handle.

export interface ScopeHandle {
  stop: () => void
  setVisible: (kind: 'vectorscope' | 'parade', visible: boolean) => void
  setAnalysisSize: (size: number) => void  // sample resolution; default 256
}

export interface ScopeOptions {
  vectorscopeCanvas?: HTMLCanvasElement
  paradeCanvas?: HTMLCanvasElement
  analysisSize?: number   // sampled width (height auto, aspect preserved)
  fps?: number            // 30 default
  intensity?: number      // dot brightness 0..1 (vectorscope only)
}

// Helper: BT.709 RGB → YCbCr (Cb,Cr in [-0.5, 0.5])
function rgbToYCbCr709(r: number, g: number, b: number): { y: number; cb: number; cr: number } {
  const rN = r / 255, gN = g / 255, bN = b / 255
  const y = 0.2126 * rN + 0.7152 * gN + 0.0722 * bN
  const cb = -0.114572 * rN - 0.385428 * gN + 0.5 * bN
  const cr = 0.5 * rN - 0.454153 * gN - 0.045847 * bN
  return { y, cb, cr }
}

function drawVectorscopeBackground(ctx: CanvasRenderingContext2D, size: number): void {
  ctx.fillStyle = 'rgba(10, 10, 14, 1)'
  ctx.fillRect(0, 0, size, size)
  // Crosshair
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(size / 2, 0); ctx.lineTo(size / 2, size)
  ctx.moveTo(0, size / 2); ctx.lineTo(size, size / 2)
  ctx.stroke()
  // Saturation rings
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)'
  for (const r of [0.25, 0.5, 0.75]) {
    ctx.beginPath()
    ctx.arc(size / 2, size / 2, r * size / 2, 0, Math.PI * 2)
    ctx.stroke()
  }
  // Skin-tone line (10:30 angle — broadcast-standard skin axis)
  ctx.strokeStyle = 'rgba(255, 200, 150, 0.4)'
  ctx.beginPath()
  const angle = Math.PI / 180 * 33  // 33° from x-axis ≈ skin
  ctx.moveTo(size / 2 - Math.cos(angle) * size / 2, size / 2 + Math.sin(angle) * size / 2)
  ctx.lineTo(size / 2 + Math.cos(angle) * size / 2, size / 2 - Math.sin(angle) * size / 2)
  ctx.stroke()
}

function drawVectorscope(ctx: CanvasRenderingContext2D, pixels: Uint8ClampedArray, size: number, intensity: number): void {
  drawVectorscopeBackground(ctx, size)
  // Add-blend small dots — each pixel adds a tiny luminance bump where its (cb, cr) lands.
  ctx.globalCompositeOperation = 'screen'
  ctx.fillStyle = `rgba(80, 220, 120, ${intensity * 0.05})`
  const half = size / 2
  for (let i = 0; i < pixels.length; i += 4) {
    const { cb, cr } = rgbToYCbCr709(pixels[i], pixels[i + 1], pixels[i + 2])
    // Cb on x (positive right), -Cr on y (positive up).
    const x = half + cb * size
    const y = half - cr * size
    ctx.fillRect(x, y, 1, 1)
  }
  ctx.globalCompositeOperation = 'source-over'
}

function drawParade(ctx: CanvasRenderingContext2D, pixels: Uint8ClampedArray, srcW: number, srcH: number, w: number, h: number): void {
  ctx.fillStyle = 'rgba(10, 10, 14, 1)'
  ctx.fillRect(0, 0, w, h)
  // 3 stacked columns: R | G | B
  const colW = Math.floor(w / 3)
  const channels: Array<{ color: string; offset: number }> = [
    { color: 'rgba(255, 80, 80, 0.05)', offset: 0 },
    { color: 'rgba(80, 255, 80, 0.05)', offset: 1 },
    { color: 'rgba(80, 80, 255, 0.05)', offset: 2 },
  ]
  ctx.globalCompositeOperation = 'screen'
  for (const ch of channels) {
    ctx.fillStyle = ch.color
    for (let y = 0; y < srcH; y++) {
      for (let x = 0; x < srcW; x++) {
        const i = (y * srcW + x) * 4 + ch.offset
        const val = pixels[i]
        const xOut = ch.offset * colW + Math.floor((x / srcW) * colW)
        const yOut = Math.floor((1 - val / 255) * h)
        ctx.fillRect(xOut, yOut, 1, 1)
      }
    }
  }
  ctx.globalCompositeOperation = 'source-over'
  // Column dividers + 0/100% guide lines.
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)'
  ctx.lineWidth = 1
  for (let i = 1; i < 3; i++) {
    ctx.beginPath()
    ctx.moveTo(i * colW, 0); ctx.lineTo(i * colW, h)
    ctx.stroke()
  }
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)'
  for (const pct of [0.1, 0.5, 0.9]) {
    const y = pct * h
    ctx.beginPath()
    ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke()
  }
}

export function startScopes(video: HTMLVideoElement, options: ScopeOptions): ScopeHandle {
  let size = options.analysisSize ?? 256
  const fps = options.fps ?? 30
  const intensity = options.intensity ?? 0.6
  const visible = { vectorscope: !!options.vectorscopeCanvas, parade: !!options.paradeCanvas }
  const work = document.createElement('canvas')
  let rafId: number | null = null
  let lastDraw = 0
  const minIntervalMs = 1000 / fps
  let stopped = false

  const tick = (ts: number) => {
    if (stopped) return
    rafId = requestAnimationFrame(tick)
    if (ts - lastDraw < minIntervalMs) return
    lastDraw = ts
    const vw = video.videoWidth, vh = video.videoHeight
    if (!vw || !vh || video.paused) return
    // Sample to `size` x scaled height.
    const aspect = vh / vw
    const sw = Math.min(size, vw)
    const sh = Math.max(1, Math.round(sw * aspect))
    work.width = sw; work.height = sh
    const wctx = work.getContext('2d', { willReadFrequently: true })
    if (!wctx) return
    try {
      wctx.drawImage(video, 0, 0, sw, sh)
    } catch { return }  // CORS-tainted or not ready
    const imageData = wctx.getImageData(0, 0, sw, sh).data
    if (visible.vectorscope && options.vectorscopeCanvas) {
      const c = options.vectorscopeCanvas
      const dest = c.getContext('2d')
      if (dest) {
        // Force square aspect for vectorscope; size to the smaller dimension.
        const square = Math.min(c.width, c.height)
        c.width = square; c.height = square
        drawVectorscope(dest, imageData, square, intensity)
      }
    }
    if (visible.parade && options.paradeCanvas) {
      const c = options.paradeCanvas
      const dest = c.getContext('2d')
      if (dest) drawParade(dest, imageData, sw, sh, c.width, c.height)
    }
  }
  rafId = requestAnimationFrame(tick)

  return {
    stop: () => {
      stopped = true
      if (rafId !== null) cancelAnimationFrame(rafId)
    },
    setVisible: (kind, vis) => { visible[kind] = vis },
    setAnalysisSize: (s) => { size = Math.max(64, Math.min(1024, s)) },
  }
}
