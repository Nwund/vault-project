// File: src/renderer/components/AspectRatioSwitcher.tsx
// Quick aspect ratio switching for video player

import React, { useState, useCallback, useMemo } from 'react'
import { Maximize, Square, Smartphone, Monitor, Film, Tv, RectangleHorizontal, RectangleVertical, Expand, Shrink, RotateCcw } from 'lucide-react'

type AspectRatio = '16:9' | '4:3' | '21:9' | '1:1' | '9:16' | '4:5' | 'auto' | 'fill' | 'cover'
type FitMode = 'contain' | 'cover' | 'fill' | 'none'
interface AspectRatioSwitcherProps { videoRef: React.RefObject<HTMLVideoElement>; containerRef: React.RefObject<HTMLDivElement>; current?: AspectRatio; onAspectChange: (aspect: AspectRatio) => void; onFitChange?: (fit: FitMode) => void; className?: string }

const RATIOS: Array<{ id: AspectRatio; label: string; icon: React.ElementType; ratio?: number }> = [
  { id: 'auto', label: 'Auto', icon: RotateCcw },
  { id: '16:9', label: '16:9', icon: Monitor, ratio: 16/9 },
  { id: '4:3', label: '4:3', icon: Tv, ratio: 4/3 },
  { id: '21:9', label: '21:9', icon: RectangleHorizontal, ratio: 21/9 },
  { id: '1:1', label: '1:1', icon: Square, ratio: 1 },
  { id: '9:16', label: '9:16', icon: Smartphone, ratio: 9/16 },
  { id: '4:5', label: '4:5', icon: RectangleVertical, ratio: 4/5 },
  { id: 'fill', label: 'Fill', icon: Expand },
  { id: 'cover', label: 'Cover', icon: Maximize }
]

const FIT_MODES: Array<{ id: FitMode; label: string; desc: string }> = [
  { id: 'contain', label: 'Fit', desc: 'Show full video' },
  { id: 'cover', label: 'Cover', desc: 'Fill and crop' },
  { id: 'fill', label: 'Stretch', desc: 'Stretch to fit' },
  { id: 'none', label: 'Original', desc: 'Native size' }
]

export function AspectRatioSwitcher({ videoRef, containerRef, current = 'auto', onAspectChange, onFitChange, className = '' }: AspectRatioSwitcherProps) {
  const [fitMode, setFitMode] = useState<FitMode>('contain')
  const [zoom, setZoom] = useState(100)
  const [panX, setPanX] = useState(0)
  const [panY, setPanY] = useState(0)

  const videoInfo = useMemo(() => {
    const video = videoRef.current
    if (!video) return { width: 1920, height: 1080, ratio: 16/9 }
    return { width: video.videoWidth, height: video.videoHeight, ratio: video.videoWidth / video.videoHeight }
  }, [videoRef])

  const currentRatioInfo = useMemo(() => RATIOS.find(r => r.id === current), [current])

  const handleAspectChange = useCallback((aspect: AspectRatio) => {
    onAspectChange(aspect)
    // Reset pan/zoom
    setZoom(100); setPanX(0); setPanY(0)
  }, [onAspectChange])

  const handleFitChange = useCallback((fit: FitMode) => {
    setFitMode(fit)
    onFitChange?.(fit)
  }, [onFitChange])

  const getVideoStyle = useMemo(() => {
    const styles: React.CSSProperties = { objectFit: fitMode, transform: `scale(${zoom / 100}) translate(${panX}px, ${panY}px)` }
    if (current !== 'auto' && current !== 'fill' && current !== 'cover') {
      const ratio = RATIOS.find(r => r.id === current)?.ratio
      if (ratio) styles.aspectRatio = String(ratio)
    }
    return styles
  }, [current, fitMode, zoom, panX, panY])

  const reset = useCallback(() => {
    onAspectChange('auto')
    setFitMode('contain')
    setZoom(100); setPanX(0); setPanY(0)
  }, [onAspectChange])

  return (
    <div className={`bg-zinc-900 rounded-xl border border-zinc-700 overflow-hidden ${className}`}>
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
        <div className="flex items-center gap-2"><Maximize size={16} className="text-[var(--primary)]" /><span className="font-semibold text-sm">Aspect Ratio</span></div>
        <button onClick={reset} className="p-1.5 rounded hover:bg-zinc-800"><RotateCcw size={14} /></button>
      </div>
      {/* Video info */}
      <div className="px-4 py-2 border-b border-zinc-800 text-xs text-zinc-500">
        Native: {videoInfo.width}×{videoInfo.height} ({videoInfo.ratio.toFixed(2)})
      </div>
      {/* Aspect ratios */}
      <div className="grid grid-cols-3 gap-2 p-3 border-b border-zinc-800">
        {RATIOS.map(r => (
          <button key={r.id} onClick={() => handleAspectChange(r.id)} className={`flex items-center gap-2 px-2 py-2 rounded ${current === r.id ? 'bg-[var(--primary)]' : 'bg-zinc-800 hover:bg-zinc-700'}`}>
            <r.icon size={14} /><span className="text-xs">{r.label}</span>
          </button>
        ))}
      </div>
      {/* Fit mode */}
      <div className="px-4 py-3 border-b border-zinc-800">
        <div className="text-xs text-zinc-500 mb-2">Fit Mode</div>
        <div className="grid grid-cols-4 gap-2">{FIT_MODES.map(f => (
          <button key={f.id} onClick={() => handleFitChange(f.id)} className={`py-2 rounded text-center ${fitMode === f.id ? 'bg-[var(--primary)]' : 'bg-zinc-800 hover:bg-zinc-700'}`}>
            <div className="text-xs">{f.label}</div>
          </button>
        ))}</div>
      </div>
      {/* Zoom & Pan */}
      <div className="px-4 py-3 space-y-3">
        <div><div className="flex justify-between text-xs mb-1"><span className="text-zinc-500">Zoom</span><span>{zoom}%</span></div>
        <input type="range" min={50} max={200} value={zoom} onChange={e => setZoom(parseInt(e.target.value))} className="w-full accent-[var(--primary)]" /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><div className="flex justify-between text-xs mb-1"><span className="text-zinc-500">Pan X</span><span>{panX}px</span></div>
          <input type="range" min={-100} max={100} value={panX} onChange={e => setPanX(parseInt(e.target.value))} className="w-full accent-[var(--primary)]" /></div>
          <div><div className="flex justify-between text-xs mb-1"><span className="text-zinc-500">Pan Y</span><span>{panY}px</span></div>
          <input type="range" min={-100} max={100} value={panY} onChange={e => setPanY(parseInt(e.target.value))} className="w-full accent-[var(--primary)]" /></div>
        </div>
      </div>
    </div>
  )
}
export default AspectRatioSwitcher
