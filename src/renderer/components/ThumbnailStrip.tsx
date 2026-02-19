// File: src/renderer/components/ThumbnailStrip.tsx
// Video timeline with thumbnail preview strip

import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import { Film, Loader2, ZoomIn, ZoomOut, Maximize } from 'lucide-react'
import { formatDuration } from '../utils/formatters'

interface ThumbnailStripProps { videoRef: React.RefObject<HTMLVideoElement>; duration: number; currentTime: number; onSeek: (time: number) => void; chapters?: Array<{ time: number; title: string }>; markers?: Array<{ time: number; color: string }>; className?: string }

export function ThumbnailStrip({ videoRef, duration, currentTime, onSeek, chapters = [], markers = [], className = '' }: ThumbnailStripProps) {
  const [thumbnails, setThumbnails] = useState<string[]>([])
  const [generating, setGenerating] = useState(false)
  const [progress, setProgress] = useState(0)
  const [hoverTime, setHoverTime] = useState<number | null>(null)
  const [hoverThumb, setHoverThumb] = useState<string | null>(null)
  const [zoom, setZoom] = useState(1)
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const thumbCount = Math.ceil(duration / 10) // One thumb per 10 seconds

  const generateThumbnails = useCallback(async () => {
    const video = videoRef.current, canvas = canvasRef.current
    if (!video || !canvas) return
    setGenerating(true); setProgress(0)
    const ctx = canvas.getContext('2d')!
    canvas.width = 160; canvas.height = 90
    const thumbs: string[] = []
    for (let i = 0; i < thumbCount; i++) {
      video.currentTime = (i / thumbCount) * duration
      await new Promise(r => video.onseeked = r)
      ctx.drawImage(video, 0, 0, 160, 90)
      thumbs.push(canvas.toDataURL('image/jpeg', 0.6))
      setProgress(((i + 1) / thumbCount) * 100)
    }
    setThumbnails(thumbs); setGenerating(false)
  }, [videoRef, duration, thumbCount])

  useEffect(() => { if (duration > 0 && thumbnails.length === 0 && !generating) generateThumbnails() }, [duration, thumbnails, generating, generateThumbnails])

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    const pos = (e.clientX - rect.left) / rect.width
    const time = pos * duration
    setHoverTime(time)
    const idx = Math.floor(pos * thumbnails.length)
    setHoverThumb(thumbnails[idx] || null)
  }, [duration, thumbnails])

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
        <div className="flex items-center gap-2"><Film size={14} className="text-[var(--primary)]" /><span className="text-sm font-medium">Timeline</span></div>
        <div className="flex items-center gap-1">
          <button onClick={() => setZoom(Math.max(0.5, zoom - 0.25))} className="p-1 rounded hover:bg-zinc-800"><ZoomOut size={12} /></button>
          <span className="text-xs text-zinc-500 w-10 text-center">{Math.round(zoom * 100)}%</span>
          <button onClick={() => setZoom(Math.min(3, zoom + 0.25))} className="p-1 rounded hover:bg-zinc-800"><ZoomIn size={12} /></button>
        </div>
      </div>
      {/* Progress bar */}
      {generating && <div className="px-4 py-2 border-b border-zinc-800"><div className="flex items-center gap-2"><Loader2 size={12} className="animate-spin text-[var(--primary)]" /><div className="flex-1 h-1 bg-zinc-800 rounded-full overflow-hidden"><div className="h-full bg-[var(--primary)]" style={{ width: `${progress}%` }} /></div><span className="text-xs text-zinc-500">{progress.toFixed(0)}%</span></div></div>}
      {/* Thumbnail strip */}
      <div ref={containerRef} className="relative h-20 overflow-x-auto cursor-crosshair" onMouseMove={handleMouseMove} onMouseLeave={() => { setHoverTime(null); setHoverThumb(null) }} onClick={handleClick} style={{ width: `${100 * zoom}%` }}>
        {/* Thumbnails */}
        <div className="absolute inset-0 flex">{thumbnails.map((t, i) => <div key={i} className="flex-1 h-full bg-zinc-800 border-r border-zinc-900"><img src={t} className="w-full h-full object-cover" /></div>)}</div>
        {/* Markers */}
        {markers.map((m, i) => <div key={i} className="absolute top-0 bottom-0 w-0.5" style={{ left: `${(m.time / duration) * 100}%`, backgroundColor: m.color }} />)}
        {/* Chapters */}
        {chapters.map((c, i) => <div key={i} className="absolute top-0 bottom-0 border-l-2 border-yellow-500" style={{ left: `${(c.time / duration) * 100}%` }}><span className="absolute top-0 left-1 px-1 bg-yellow-500 text-black text-[8px] rounded-sm">{c.title}</span></div>)}
        {/* Playhead */}
        <div className="absolute top-0 bottom-0 w-0.5 bg-[var(--primary)]" style={{ left: `${(currentTime / duration) * 100}%` }}><div className="absolute -top-1 -left-1.5 w-3 h-3 bg-[var(--primary)] rounded-full" /></div>
        {/* Hover preview */}
        {hoverTime !== null && <div className="absolute bottom-full mb-2 transform -translate-x-1/2 pointer-events-none" style={{ left: `${(hoverTime / duration) * 100}%` }}>
          {hoverThumb && <img src={hoverThumb} className="w-32 h-18 rounded border border-zinc-700 shadow-xl" />}
          <div className="text-center mt-1 px-2 py-0.5 bg-zinc-800 rounded text-xs">{formatDuration(hoverTime)}</div>
        </div>}
      </div>
      {/* Time display */}
      <div className="flex justify-between px-4 py-1 text-xs text-zinc-500"><span>0:00</span><span>{formatDuration(currentTime)} / {formatDuration(duration)}</span><span>{formatDuration(duration)}</span></div>
    </div>
  )
}
export default ThumbnailStrip
