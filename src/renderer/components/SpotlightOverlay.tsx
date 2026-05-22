// File: src/renderer/components/SpotlightOverlay.tsx
//
// #163 — Motion-tracked spotlight / pixelate overlay.
//
// Phase 1 (this file): manual-region overlay. User clicks the video
// to set the spotlight center; choose between two effects:
//   - 'spotlight'  →  dim outside the circle, leave inside untouched
//   - 'pixelate'   →  pixelate inside the circle, leave outside clear
//
// Renders a <canvas> over the supplied <video> and redraws on each
// rAF tick. The user can drag the center to move the spot and use
// the slider to resize the radius.
//
// Object tracking (CapCut-style "track object" with TrackerCSRT) is
// left for a Phase 2 follow-up: it requires loading OpenCV.js or
// MediaPipe Tasks Vision from a CDN, plus a noticeable per-frame
// budget. The Phase-1 manual mode covers the common cases (fixed
// camera, talking head, license-plate redaction) without any deps.

import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Eye, Square, Move } from 'lucide-react'

interface Props {
  /** Video element to overlay. The canvas is positioned absolutely on top. */
  videoRef: React.RefObject<HTMLVideoElement | null>
  /** Optional initial mode. */
  initialMode?: 'spotlight' | 'pixelate'
  /** When provided, the overlay restores the last saved preset for this
   *  mediaId on mount and offers a "Save preset" button that persists
   *  the current settings (mode/center/radius/dim/pixel) to localStorage. */
  mediaId?: string
  onClose?: () => void
}

type SpotlightPreset = {
  mode: 'spotlight' | 'pixelate'
  center: { x: number; y: number } | null
  radius: number
  dimOpacity: number
  pixelSize: number
}

const PRESET_KEY_PREFIX = 'vault.spotlight.preset.'

function loadPreset(mediaId: string | undefined): SpotlightPreset | null {
  if (!mediaId) return null
  try {
    const raw = window.localStorage.getItem(PRESET_KEY_PREFIX + mediaId)
    if (!raw) return null
    const p = JSON.parse(raw)
    if (typeof p?.radius !== 'number') return null
    return p as SpotlightPreset
  } catch { return null }
}

function savePreset(mediaId: string | undefined, preset: SpotlightPreset): void {
  if (!mediaId) return
  try { window.localStorage.setItem(PRESET_KEY_PREFIX + mediaId, JSON.stringify(preset)) } catch { /* ignore */ }
}

function clearPreset(mediaId: string | undefined): void {
  if (!mediaId) return
  try { window.localStorage.removeItem(PRESET_KEY_PREFIX + mediaId) } catch { /* ignore */ }
}

export function SpotlightOverlay({ videoRef, initialMode = 'spotlight', mediaId, onClose }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  // Load the saved preset (if any) once on mount so the user picks up
  // where they left off on this video.
  const initialPreset = loadPreset(mediaId)
  const [mode, setMode] = useState<'spotlight' | 'pixelate'>(initialPreset?.mode ?? initialMode)
  const [center, setCenter] = useState<{ x: number; y: number } | null>(initialPreset?.center ?? null)
  const [radius, setRadius] = useState(initialPreset?.radius ?? 120)
  const [dimOpacity, setDimOpacity] = useState(initialPreset?.dimOpacity ?? 0.75)
  const [pixelSize, setPixelSize] = useState(initialPreset?.pixelSize ?? 16)
  const [savedAt, setSavedAt] = useState<number | null>(initialPreset ? Date.now() : null)
  const draggingRef = useRef(false)

  const onCanvasClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const c = canvasRef.current
    if (!c) return
    const rect = c.getBoundingClientRect()
    setCenter({
      x: (e.clientX - rect.left) * (c.width / rect.width),
      y: (e.clientY - rect.top) * (c.height / rect.height),
    })
  }, [])

  const onCanvasMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!draggingRef.current) return
    const c = canvasRef.current
    if (!c) return
    const rect = c.getBoundingClientRect()
    setCenter({
      x: (e.clientX - rect.left) * (c.width / rect.width),
      y: (e.clientY - rect.top) * (c.height / rect.height),
    })
  }, [])

  // Re-render loop: every rAF draw the spotlight on top of the video.
  // The <canvas> stays the same size as the video element so coords
  // line up regardless of object-fit.
  useEffect(() => {
    let raf = 0
    const draw = () => {
      const video = videoRef.current
      const canvas = canvasRef.current
      if (video && canvas) {
        // Size canvas to native video dims so the effect aligns with
        // pixels at whatever DPI the user is on.
        if (canvas.width !== video.videoWidth) canvas.width = video.videoWidth || canvas.width
        if (canvas.height !== video.videoHeight) canvas.height = video.videoHeight || canvas.height
        const ctx = canvas.getContext('2d')
        if (ctx) drawOverlay(ctx, canvas, video, mode, center, radius, dimOpacity, pixelSize)
      }
      raf = requestAnimationFrame(draw)
    }
    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [videoRef, mode, center, radius, dimOpacity, pixelSize])

  return (
    <>
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full cursor-crosshair z-10"
        style={{ pointerEvents: 'auto' }}
        onClick={onCanvasClick}
        onMouseDown={() => { draggingRef.current = true }}
        onMouseUp={() => { draggingRef.current = false }}
        onMouseLeave={() => { draggingRef.current = false }}
        onMouseMove={onCanvasMove}
      />
      {/* Compact control strip at the top of the video pane. */}
      <div className="absolute top-2 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 px-3 py-1.5 rounded-full bg-black/80 border border-zinc-800 text-xs">
        <button
          onClick={() => setMode('spotlight')}
          className={`flex items-center gap-1 px-2 py-1 rounded ${mode === 'spotlight' ? 'bg-[var(--primary)] text-white' : 'text-zinc-300 hover:bg-zinc-800'}`}
        >
          <Eye size={12} /> Spotlight
        </button>
        <button
          onClick={() => setMode('pixelate')}
          className={`flex items-center gap-1 px-2 py-1 rounded ${mode === 'pixelate' ? 'bg-[var(--primary)] text-white' : 'text-zinc-300 hover:bg-zinc-800'}`}
        >
          <Square size={12} /> Pixelate
        </button>
        <div className="w-px h-4 bg-zinc-700" />
        <div className="flex items-center gap-1">
          <Move size={11} className="text-zinc-500" />
          <input
            type="range"
            min={30}
            max={400}
            value={radius}
            onChange={(e) => setRadius(Number(e.target.value))}
            className="w-24 accent-[var(--primary)]"
            title="Radius"
          />
        </div>
        {mode === 'spotlight' ? (
          <div className="flex items-center gap-1">
            <span className="text-zinc-500">Dim</span>
            <input
              type="range"
              min={0.3}
              max={1}
              step={0.05}
              value={dimOpacity}
              onChange={(e) => setDimOpacity(Number(e.target.value))}
              className="w-20 accent-[var(--primary)]"
            />
          </div>
        ) : (
          <div className="flex items-center gap-1">
            <span className="text-zinc-500">Px</span>
            <input
              type="range"
              min={4}
              max={48}
              step={2}
              value={pixelSize}
              onChange={(e) => setPixelSize(Number(e.target.value))}
              className="w-20 accent-[var(--primary)]"
            />
          </div>
        )}
        {mediaId && (
          <>
            <div className="w-px h-4 bg-zinc-700" />
            <button
              onClick={() => {
                savePreset(mediaId, { mode, center, radius, dimOpacity, pixelSize })
                setSavedAt(Date.now())
              }}
              className={`px-2 py-1 rounded text-[10px] transition ${
                savedAt && Date.now() - savedAt < 2000
                  ? 'bg-emerald-500/30 text-emerald-100'
                  : 'text-zinc-300 hover:bg-zinc-800'
              }`}
              title="Save these spotlight settings for this video"
            >
              {savedAt && Date.now() - savedAt < 2000 ? 'Saved!' : 'Save preset'}
            </button>
            {savedAt && (
              <button
                onClick={() => {
                  clearPreset(mediaId)
                  setSavedAt(null)
                }}
                className="px-2 py-1 rounded text-[10px] text-zinc-400 hover:bg-zinc-800"
                title="Forget saved spotlight settings for this video"
              >
                Reset
              </button>
            )}
          </>
        )}
        {onClose && (
          <button
            onClick={onClose}
            className="px-2 py-1 rounded text-zinc-300 hover:bg-zinc-800"
            title="Close overlay"
          >
            ✕
          </button>
        )}
      </div>
    </>
  )
}

function drawOverlay(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  video: HTMLVideoElement,
  mode: 'spotlight' | 'pixelate',
  center: { x: number; y: number } | null,
  radius: number,
  dimOpacity: number,
  pixelSize: number,
): void {
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  if (!center) return
  // For pixelate, we need video pixels to sample from — copy the
  // current frame onto an offscreen, then re-draw the affected disc.
  if (mode === 'pixelate') {
    // Pixelate by drawing downsampled-then-upsampled video into the disc.
    // Use a temporary offscreen canvas at 1/pixelSize for the downsample.
    const off = document.createElement('canvas')
    off.width = Math.max(1, Math.floor(canvas.width / pixelSize))
    off.height = Math.max(1, Math.floor(canvas.height / pixelSize))
    const offCtx = off.getContext('2d')
    if (!offCtx) return
    offCtx.imageSmoothingEnabled = false
    offCtx.drawImage(video, 0, 0, off.width, off.height)
    ctx.save()
    ctx.beginPath()
    ctx.arc(center.x, center.y, radius, 0, Math.PI * 2)
    ctx.closePath()
    ctx.clip()
    ctx.imageSmoothingEnabled = false
    ctx.drawImage(off, 0, 0, canvas.width, canvas.height)
    ctx.restore()
    // Soft edge: feather the rim with a thin gradient ring so the
    // pixelation doesn't have a hard cutoff.
    const grad = ctx.createRadialGradient(center.x, center.y, radius * 0.85, center.x, center.y, radius * 1.05)
    grad.addColorStop(0, 'rgba(0,0,0,0)')
    grad.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    return
  }

  // Spotlight: dim everything outside the disc using destination-out
  // to punch a hole in a uniform fill.
  ctx.fillStyle = `rgba(0,0,0,${dimOpacity})`
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.save()
  ctx.globalCompositeOperation = 'destination-out'
  const grad = ctx.createRadialGradient(center.x, center.y, 0, center.x, center.y, radius)
  grad.addColorStop(0, 'rgba(0,0,0,1)')
  grad.addColorStop(0.85, 'rgba(0,0,0,1)')
  grad.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = grad
  ctx.beginPath()
  ctx.arc(center.x, center.y, radius, 0, Math.PI * 2)
  ctx.closePath()
  ctx.fill()
  ctx.restore()
}
