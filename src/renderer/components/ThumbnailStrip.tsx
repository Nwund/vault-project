// File: src/renderer/components/ThumbnailStrip.tsx
// Video timeline with thumbnail preview strip.
//
// v2.7 #331 — when a `videoPath` prop is provided AND the MessagePort
// scrub-thumb channel is reachable, the strip lazy-fetches per-bucket
// thumbnails from main-process ffmpeg (disk-cached, near-instant after
// first pass). Falls back to in-renderer video seeking + canvas grab
// when the MessagePort path isn't available (the old behavior).

import React, { useState, useCallback, useRef, useEffect } from 'react'
import { Film, Loader2, ZoomIn, ZoomOut } from 'lucide-react'
import { formatDuration } from '../utils/formatters'
import { useScrubThumbs } from '../hooks/useScrubThumbs'

interface ThumbnailStripProps {
  videoRef: React.RefObject<HTMLVideoElement | null>
  duration: number
  currentTime: number
  onSeek: (time: number) => void
  chapters?: Array<{ time: number; title: string }>
  markers?: Array<{ time: number; color: string }>
  className?: string
  /** v2.7 — file path or vault:// URL of the source video; enables the
   *  MessagePort/ffmpeg fast path. Pass `media.path` from the player. */
  videoPath?: string
}

const THUMB_W = 160
const THUMB_H = 90
const SEC_PER_THUMB = 10

export function ThumbnailStrip({
  videoRef,
  duration,
  currentTime,
  onSeek,
  chapters = [],
  markers = [],
  className = '',
  videoPath,
}: ThumbnailStripProps) {
  const [thumbnails, setThumbnails] = useState<(string | null)[]>([])
  const [generating, setGenerating] = useState(false)
  const [progress, setProgress] = useState(0)
  const [hoverTime, setHoverTime] = useState<number | null>(null)
  const [hoverThumb, setHoverThumb] = useState<string | null>(null)
  const [zoom, setZoom] = useState(1)
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const thumbCount = Math.max(1, Math.ceil(duration / SEC_PER_THUMB))

  // MessagePort fast path — null videoPath means hook is dormant.
  const { getThumb, ready: scrubReady } = useScrubThumbs(videoPath)
  const useScrubFast = scrubReady && !!videoPath

  // ─── Fast path: lazy fetch thumbs via MessagePort ────────────────────
  useEffect(() => {
    if (!useScrubFast || duration <= 0) return
    let cancelled = false
    setGenerating(true)
    setThumbnails(new Array(thumbCount).fill(null))
    setProgress(0)
    ;(async () => {
      // Fan out lightly — 4 concurrent requests keeps ffmpeg busy without
      // saturating it. Thumbs are 1-second-bucketed in main, so repeats
      // hit the cache after the first pass.
      const indices = Array.from({ length: thumbCount }, (_, i) => i)
      const chunkSize = 4
      let done = 0
      for (let i = 0; i < indices.length; i += chunkSize) {
        const chunk = indices.slice(i, i + chunkSize)
        const results = await Promise.all(chunk.map((idx) => getThumb((idx / thumbCount) * duration)))
        if (cancelled) return
        setThumbnails((prev) => {
          const next = [...prev]
          chunk.forEach((idx, k) => { next[idx] = results[k] })
          return next
        })
        done += chunk.length
        setProgress((done / thumbCount) * 100)
      }
      if (!cancelled) setGenerating(false)
    })()
    return () => { cancelled = true }
  }, [useScrubFast, duration, thumbCount, getThumb])

  // ─── Fallback: in-renderer video seek + canvas grab (existing) ──────
  const generateFallback = useCallback(async () => {
    const video = videoRef.current, canvas = canvasRef.current
    if (!video || !canvas) return
    setGenerating(true); setProgress(0)
    const ctx = canvas.getContext('2d')!
    canvas.width = THUMB_W; canvas.height = THUMB_H
    const thumbs: (string | null)[] = []
    for (let i = 0; i < thumbCount; i++) {
      video.currentTime = (i / thumbCount) * duration
      await new Promise((r) => { video.onseeked = () => r(null) })
      ctx.drawImage(video, 0, 0, THUMB_W, THUMB_H)
      thumbs.push(canvas.toDataURL('image/jpeg', 0.6))
      setProgress(((i + 1) / thumbCount) * 100)
    }
    setThumbnails(thumbs); setGenerating(false)
  }, [videoRef, duration, thumbCount])

  useEffect(() => {
    if (useScrubFast) return
    if (duration > 0 && thumbnails.length === 0 && !generating) generateFallback()
  }, [useScrubFast, duration, thumbnails.length, generating, generateFallback])

  // ─── Hover preview ───────────────────────────────────────────────────
  const handleMouseMove = useCallback(async (e: React.MouseEvent) => {
    if (!containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    const pos = (e.clientX - rect.left) / rect.width
    const time = pos * duration
    setHoverTime(time)
    if (useScrubFast) {
      const t = await getThumb(time)
      setHoverThumb(t)
    } else {
      const idx = Math.floor(pos * thumbnails.length)
      setHoverThumb(thumbnails[idx] || null)
    }
  }, [duration, thumbnails, useScrubFast, getThumb])

  const handleClick = useCallback((e: React.MouseEvent) => {
    if (!containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    const pos = (e.clientX - rect.left) / rect.width
    onSeek(pos * duration)
  }, [duration, onSeek])

  return (
    <div className={`bg-zinc-900 rounded-xl border border-zinc-700 overflow-hidden ${className}`}>
      <canvas ref={canvasRef} className="hidden" />
      <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-800">
        <div className="flex items-center gap-2">
          <Film size={14} className="text-[var(--primary)]" />
          <span className="text-sm font-medium">Timeline</span>
          {useScrubFast && (
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 uppercase tracking-wider font-medium" title="MessagePort fast-path (ffmpeg + disk cache)">
              fast
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => setZoom(Math.max(0.5, zoom - 0.25))} className="p-1 rounded hover:bg-zinc-800"><ZoomOut size={12} /></button>
          <span className="text-xs text-zinc-500 w-10 text-center">{Math.round(zoom * 100)}%</span>
          <button onClick={() => setZoom(Math.min(3, zoom + 0.25))} className="p-1 rounded hover:bg-zinc-800"><ZoomIn size={12} /></button>
        </div>
      </div>
      {/* Progress bar */}
      {generating && (
        <div className="px-4 py-2 border-b border-zinc-800">
          <div className="flex items-center gap-2">
            <Loader2 size={12} className="animate-spin text-[var(--primary)]" />
            <div className="flex-1 h-1 bg-zinc-800 rounded-full overflow-hidden">
              <div className="h-full bg-[var(--primary)] transition-[width]" style={{ width: `${progress}%` }} />
            </div>
            <span className="text-xs text-zinc-500 tabular-nums">{progress.toFixed(0)}%</span>
          </div>
        </div>
      )}
      {/* Thumbnail strip */}
      <div ref={containerRef} className="relative h-20 overflow-x-auto cursor-crosshair" onMouseMove={handleMouseMove} onMouseLeave={() => { setHoverTime(null); setHoverThumb(null) }} onClick={handleClick} style={{ width: `${100 * zoom}%` }}>
        {/* Thumbnails */}
        <div className="absolute inset-0 flex">
          {thumbnails.map((t, i) => (
            <div key={i} className="flex-1 h-full bg-zinc-800 border-r border-zinc-900">
              {t ? <img src={t} className="w-full h-full object-cover" /> : <div className="w-full h-full" />}
            </div>
          ))}
        </div>
        {/* Markers */}
        {markers.map((m, i) => <div key={i} className="absolute top-0 bottom-0 w-0.5" style={{ left: `${(m.time / duration) * 100}%`, backgroundColor: m.color }} />)}
        {/* Chapters */}
        {chapters.map((c, i) => (
          <div key={i} className="absolute top-0 bottom-0 border-l-2 border-yellow-500" style={{ left: `${(c.time / duration) * 100}%` }}>
            <span className="absolute top-0 left-1 px-1 bg-yellow-500 text-black text-[8px] rounded-sm">{c.title}</span>
          </div>
        ))}
        {/* Playhead */}
        <div className="absolute top-0 bottom-0 w-0.5 bg-[var(--primary)]" style={{ left: `${(currentTime / duration) * 100}%` }}>
          <div className="absolute -top-1 -left-1.5 w-3 h-3 bg-[var(--primary)] rounded-full" />
        </div>
        {/* Hover preview */}
        {hoverTime !== null && (
          <div className="absolute bottom-full mb-2 transform -translate-x-1/2 pointer-events-none" style={{ left: `${(hoverTime / duration) * 100}%` }}>
            {hoverThumb && <img src={hoverThumb} className="w-32 h-18 rounded border border-zinc-700 shadow-xl" />}
            <div className="text-center mt-1 px-2 py-0.5 bg-zinc-800 rounded text-xs tabular-nums">{formatDuration(hoverTime)}</div>
          </div>
        )}
      </div>
      {/* Time display */}
      <div className="flex justify-between px-4 py-1 text-xs text-zinc-500 tabular-nums">
        <span>0:00</span>
        <span>{formatDuration(currentTime)} / {formatDuration(duration)}</span>
        <span>{formatDuration(duration)}</span>
      </div>
    </div>
  )
}

export default ThumbnailStrip
