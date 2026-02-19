// File: src/renderer/components/KeyframeExtractor.tsx
// Extract keyframes/thumbnails from video at intervals

import React, { useState, useCallback, useRef } from 'react'
import { Image, Download, Grid3X3, Loader2, Settings, Trash2, Check, Copy, Save, Film } from 'lucide-react'
import { formatDuration } from '../utils/formatters'

interface Keyframe { id: string; time: number; dataUrl: string; width: number; height: number }
interface KeyframeExtractorProps { videoRef: React.RefObject<HTMLVideoElement>; duration: number; onExtract?: (frames: Keyframe[]) => void; className?: string }

export function KeyframeExtractor({ videoRef, duration, onExtract, className = '' }: KeyframeExtractorProps) {
  const [frames, setFrames] = useState<Keyframe[]>([])
  const [extracting, setExtracting] = useState(false)
  const [progress, setProgress] = useState(0)
  const [interval, setInterval] = useState(10)
  const [quality, setQuality] = useState<'low' | 'medium' | 'high'>('medium')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const qualities = { low: { scale: 0.25, q: 0.6 }, medium: { scale: 0.5, q: 0.8 }, high: { scale: 1, q: 0.95 } }

  const extract = useCallback(async () => {
    const video = videoRef.current, canvas = canvasRef.current
    if (!video || !canvas) return
    setExtracting(true); setProgress(0); setFrames([])
    const ctx = canvas.getContext('2d')!
    const { scale, q } = qualities[quality]
    const w = video.videoWidth * scale, h = video.videoHeight * scale
    canvas.width = w; canvas.height = h
    const extracted: Keyframe[] = []
    const count = Math.floor(duration / interval)

    for (let i = 0; i <= count; i++) {
      const time = i * interval
      video.currentTime = time
      await new Promise(r => video.onseeked = r)
      ctx.drawImage(video, 0, 0, w, h)
      extracted.push({ id: `frame-${i}`, time, dataUrl: canvas.toDataURL('image/jpeg', q), width: w, height: h })
      setProgress(((i + 1) / (count + 1)) * 100)
    }

    setFrames(extracted); onExtract?.(extracted); setExtracting(false)
  }, [videoRef, duration, interval, quality, onExtract])

  const downloadSelected = useCallback(() => {
    const toDownload = frames.filter(f => selected.has(f.id))
    toDownload.forEach((f, i) => {
      const a = document.createElement('a')
      a.href = f.dataUrl; a.download = `keyframe_${formatDuration(f.time).replace(/:/g, '-')}.jpg`
      setTimeout(() => a.click(), i * 100)
    })
  }, [frames, selected])

  const downloadAll = useCallback(() => {
    frames.forEach((f, i) => {
      const a = document.createElement('a')
      a.href = f.dataUrl; a.download = `keyframe_${formatDuration(f.time).replace(/:/g, '-')}.jpg`
      setTimeout(() => a.click(), i * 100)
    })
  }, [frames])

  const toggleSelect = useCallback((id: string) => {
    setSelected(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next })
  }, [])

  return (
    <div className={`bg-zinc-900 rounded-xl border border-zinc-700 overflow-hidden ${className}`}>
      <canvas ref={canvasRef} className="hidden" />
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
        <div className="flex items-center gap-2"><Grid3X3 size={16} className="text-[var(--primary)]" /><span className="font-semibold text-sm">Keyframe Extractor</span></div>
        <button onClick={extract} disabled={extracting} className="flex items-center gap-2 px-3 py-1.5 rounded bg-[var(--primary)] text-sm disabled:opacity-50">{extracting ? <Loader2 size={14} className="animate-spin" /> : <Image size={14} />}{extracting ? `${progress.toFixed(0)}%` : 'Extract'}</button>
      </div>
      {/* Settings */}
      <div className="flex items-center gap-4 px-4 py-3 border-b border-zinc-800">
        <div className="flex items-center gap-2"><span className="text-xs text-zinc-500">Every</span><select value={interval} onChange={e => setInterval(parseInt(e.target.value))} className="px-2 py-1 bg-zinc-800 rounded text-sm"><option value={5}>5s</option><option value={10}>10s</option><option value={30}>30s</option><option value={60}>1m</option></select></div>
        <div className="flex items-center gap-2"><span className="text-xs text-zinc-500">Quality</span><div className="flex gap-1">{(['low', 'medium', 'high'] as const).map(q => <button key={q} onClick={() => setQuality(q)} className={`px-2 py-1 rounded text-xs ${quality === q ? 'bg-[var(--primary)]' : 'bg-zinc-800'}`}>{q}</button>)}</div></div>
        <div className="flex-1" />
        <span className="text-xs text-zinc-500">~{Math.ceil(duration / interval)} frames</span>
      </div>
      {/* Frames grid */}
      {frames.length > 0 ? <>
        <div className="grid grid-cols-4 gap-2 p-3 max-h-64 overflow-y-auto">
          {frames.map(f => (
            <div key={f.id} onClick={() => toggleSelect(f.id)} className={`relative aspect-video rounded overflow-hidden cursor-pointer ${selected.has(f.id) ? 'ring-2 ring-[var(--primary)]' : ''}`}>
              <img src={f.dataUrl} className="w-full h-full object-cover" />
              <div className="absolute bottom-0 left-0 right-0 px-1 py-0.5 bg-black/60 text-[10px]">{formatDuration(f.time)}</div>
              {selected.has(f.id) && <div className="absolute top-1 right-1 w-4 h-4 rounded-full bg-[var(--primary)] flex items-center justify-center"><Check size={10} /></div>}
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between px-4 py-2 border-t border-zinc-800">
          <span className="text-xs text-zinc-500">{selected.size} selected</span>
          <div className="flex gap-2">
            {selected.size > 0 && <button onClick={downloadSelected} className="flex items-center gap-1 px-2 py-1 rounded bg-zinc-800 text-xs"><Download size={12} />Selected</button>}
            <button onClick={downloadAll} className="flex items-center gap-1 px-2 py-1 rounded bg-[var(--primary)] text-xs"><Download size={12} />All ({frames.length})</button>
          </div>
        </div>
      </> : <div className="py-12 text-center text-zinc-500"><Film size={32} className="mx-auto mb-2 opacity-50" /><p className="text-sm">Extract thumbnails from video</p></div>}
    </div>
  )
}
export default KeyframeExtractor
