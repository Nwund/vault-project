// File: src/renderer/components/ThumbnailSelector.tsx
// Select or generate custom thumbnail for media

import React, { useState, useCallback, useRef } from 'react'
import { Image, Film, Camera, Upload, RefreshCw, Check, Grid3X3, Clock, Loader2, Trash2, Star, Wand2 } from 'lucide-react'
import { formatDuration } from '../utils/formatters'

interface Thumbnail { id: string; dataUrl: string; time?: number; isCustom?: boolean; isDefault?: boolean }
interface ThumbnailSelectorProps { videoRef?: React.RefObject<HTMLVideoElement>; duration?: number; currentThumbnail?: string; onSelect: (dataUrl: string) => void; onGenerate?: (time: number) => Promise<string>; onUpload?: (file: File) => Promise<string>; className?: string }

export function ThumbnailSelector({ videoRef, duration, currentThumbnail, onSelect, onGenerate, onUpload, className = '' }: ThumbnailSelectorProps) {
  const [thumbnails, setThumbnails] = useState<Thumbnail[]>([])
  const [generating, setGenerating] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [gridCount, setGridCount] = useState(9)
  const fileRef = useRef<HTMLInputElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const generateGrid = useCallback(async () => {
    if (!videoRef?.current || !duration || !canvasRef.current) return
    setGenerating(true)
    const video = videoRef.current, canvas = canvasRef.current
    const ctx = canvas.getContext('2d')!
    canvas.width = 320; canvas.height = 180
    const thumbs: Thumbnail[] = []
    for (let i = 0; i < gridCount; i++) {
      const time = (i / (gridCount - 1)) * duration
      video.currentTime = time
      await new Promise(r => video.onseeked = r)
      ctx.drawImage(video, 0, 0, 320, 180)
      thumbs.push({ id: `thumb-${i}`, dataUrl: canvas.toDataURL('image/jpeg', 0.8), time })
    }
    setThumbnails(thumbs); setGenerating(false)
  }, [videoRef, duration, gridCount])

  const captureFrame = useCallback(async () => {
    if (!videoRef?.current || !canvasRef.current) return
    const video = videoRef.current, canvas = canvasRef.current
    const ctx = canvas.getContext('2d')!
    canvas.width = 640; canvas.height = 360
    ctx.drawImage(video, 0, 0, 640, 360)
    const dataUrl = canvas.toDataURL('image/jpeg', 0.9)
    const thumb: Thumbnail = { id: `capture-${Date.now()}`, dataUrl, time: video.currentTime, isCustom: true }
    setThumbnails(prev => [...prev, thumb])
    setSelectedId(thumb.id)
  }, [videoRef])

  const handleUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !onUpload) return
    const dataUrl = await onUpload(file)
    const thumb: Thumbnail = { id: `upload-${Date.now()}`, dataUrl, isCustom: true }
    setThumbnails(prev => [...prev, thumb])
    setSelectedId(thumb.id)
  }, [onUpload])

  const selectThumb = useCallback((thumb: Thumbnail) => {
    setSelectedId(thumb.id)
    onSelect(thumb.dataUrl)
  }, [onSelect])

  const removeThumb = useCallback((id: string) => {
    setThumbnails(prev => prev.filter(t => t.id !== id))
    if (selectedId === id) setSelectedId(null)
  }, [selectedId])

  const smartSelect = useCallback(async () => {
    // Would use AI to pick best thumbnail
    if (thumbnails.length > 0) {
      const best = thumbnails[Math.floor(thumbnails.length / 2)]
      selectThumb(best)
    }
  }, [thumbnails, selectThumb])

  return (
    <div className={`bg-zinc-900 rounded-xl border border-zinc-700 overflow-hidden ${className}`}>
      <canvas ref={canvasRef} className="hidden" />
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleUpload} />
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
        <div className="flex items-center gap-2"><Image size={16} className="text-[var(--primary)]" /><span className="font-semibold text-sm">Thumbnail</span></div>
        <div className="flex gap-1">
          {videoRef && <button onClick={captureFrame} className="flex items-center gap-1 px-2 py-1 rounded bg-zinc-800 text-xs"><Camera size={12} />Capture</button>}
          {onUpload && <button onClick={() => fileRef.current?.click()} className="flex items-center gap-1 px-2 py-1 rounded bg-zinc-800 text-xs"><Upload size={12} />Upload</button>}
        </div>
      </div>
      {/* Current thumbnail */}
      {currentThumbnail && <div className="px-4 py-3 border-b border-zinc-800">
        <div className="text-xs text-zinc-500 mb-2">Current</div>
        <div className="relative w-32 h-18 rounded overflow-hidden"><img src={currentThumbnail} className="w-full h-full object-cover" /><div className="absolute top-1 right-1"><Star size={12} className="text-yellow-400 fill-yellow-400" /></div></div>
      </div>}
      {/* Generate grid */}
      {videoRef && duration && <div className="px-4 py-3 border-b border-zinc-800">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-zinc-500">Generate from video</span>
          <div className="flex items-center gap-2">
            <select value={gridCount} onChange={e => setGridCount(parseInt(e.target.value))} className="px-2 py-1 bg-zinc-800 rounded text-xs">{[4, 6, 9, 12, 16].map(n => <option key={n} value={n}>{n} frames</option>)}</select>
            <button onClick={generateGrid} disabled={generating} className="flex items-center gap-1 px-2 py-1 rounded bg-[var(--primary)] text-xs disabled:opacity-50">{generating ? <Loader2 size={12} className="animate-spin" /> : <Grid3X3 size={12} />}Generate</button>
          </div>
        </div>
      </div>}
      {/* Thumbnails grid */}
      {thumbnails.length > 0 && <>
        <div className="grid grid-cols-3 gap-2 p-3 max-h-48 overflow-y-auto">
          {thumbnails.map(thumb => (
            <div key={thumb.id} onClick={() => selectThumb(thumb)} className={`relative aspect-video rounded overflow-hidden cursor-pointer group ${selectedId === thumb.id ? 'ring-2 ring-[var(--primary)]' : ''}`}>
              <img src={thumb.dataUrl} className="w-full h-full object-cover" />
              {thumb.time !== undefined && <div className="absolute bottom-0 left-0 right-0 px-1 py-0.5 bg-black/60 text-[10px]">{formatDuration(thumb.time)}</div>}
              {thumb.isCustom && <div className="absolute top-1 left-1 px-1 py-0.5 bg-[var(--primary)] rounded text-[8px]">Custom</div>}
              {selectedId === thumb.id && <div className="absolute top-1 right-1 w-4 h-4 rounded-full bg-[var(--primary)] flex items-center justify-center"><Check size={10} /></div>}
              <button onClick={e => { e.stopPropagation(); removeThumb(thumb.id) }} className="absolute bottom-1 right-1 p-1 rounded bg-red-500/50 opacity-0 group-hover:opacity-100"><Trash2 size={10} /></button>
            </div>
          ))}
        </div>
        <div className="px-4 py-2 border-t border-zinc-800 flex justify-between items-center">
          <span className="text-xs text-zinc-500">{thumbnails.length} thumbnails</span>
          <button onClick={smartSelect} className="flex items-center gap-1 px-2 py-1 rounded bg-zinc-800 text-xs"><Wand2 size={12} />Smart Select</button>
        </div>
      </>}
      {thumbnails.length === 0 && !generating && <div className="py-8 text-center text-zinc-500"><Image size={24} className="mx-auto mb-2 opacity-50" /><p className="text-sm">Generate or upload thumbnails</p></div>}
    </div>
  )
}
export default ThumbnailSelector
