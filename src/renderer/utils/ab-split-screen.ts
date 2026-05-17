// File: src/renderer/utils/ab-split-screen.ts
//
// #241 A-17 — A/B preset compare with a split-screen wipe. Renders
// two passes of the same video side-by-side, with a draggable
// vertical divider revealing the "after" pass under the "before".
//
// Implementation: a Canvas2D over the player. The "before" canvas
// captures frames from `videoBefore`, the "after" from `videoAfter`.
// Each frame we draw `videoBefore` full-bleed, then clip to the
// right of the divider X and draw `videoAfter` there.
//
// Both videos must be sync'd (same currentTime). Caller passes a
// `syncVideos(): void` callback we'll invoke each frame so the user's
// own preset-driven pass can keep its source aligned.

export interface AbWipeOptions {
  videoBefore: HTMLVideoElement
  videoAfter: HTMLVideoElement
  canvas: HTMLCanvasElement
  syncVideos?: () => void
}

export interface AbWipeHandle {
  setDividerX: (xPct: number) => void   // 0..1
  destroy: () => void
}

export function startAbWipe(options: AbWipeOptions): AbWipeHandle {
  const { videoBefore, videoAfter, canvas } = options
  const ctx = canvas.getContext('2d', { alpha: false })
  if (!ctx) throw new Error('canvas 2d unavailable')
  let dividerPct = 0.5
  let stopped = false
  let raf = 0

  const draw = () => {
    if (stopped) return
    raf = requestAnimationFrame(draw)
    if (!videoBefore.videoWidth) return
    options.syncVideos?.()
    if (canvas.width !== videoBefore.videoWidth) canvas.width = videoBefore.videoWidth
    if (canvas.height !== videoBefore.videoHeight) canvas.height = videoBefore.videoHeight
    ctx.drawImage(videoBefore, 0, 0)
    const divX = Math.round(canvas.width * dividerPct)
    if (divX < canvas.width) {
      ctx.save()
      ctx.beginPath()
      ctx.rect(divX, 0, canvas.width - divX, canvas.height)
      ctx.clip()
      ctx.drawImage(videoAfter, 0, 0)
      ctx.restore()
    }
    // Divider bar.
    ctx.fillStyle = 'rgba(255,255,255,0.9)'
    ctx.fillRect(divX - 1, 0, 2, canvas.height)
    // Handle pill.
    ctx.fillStyle = 'rgba(0,0,0,0.6)'
    ctx.beginPath()
    ctx.arc(divX, canvas.height / 2, 18, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = 'rgba(255,255,255,1)'
    ctx.font = '14px sans-serif'
    ctx.fillText('AB', divX - 11, canvas.height / 2 + 5)
  }
  raf = requestAnimationFrame(draw)

  return {
    setDividerX: (pct) => { dividerPct = Math.max(0, Math.min(1, pct)) },
    destroy: () => {
      stopped = true
      cancelAnimationFrame(raf)
    },
  }
}
