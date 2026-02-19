// File: src/renderer/components/SmartCrop.tsx
// AI-assisted smart cropping with aspect ratio presets

import React, { useState, useCallback, useRef, useEffect } from 'react'
import { Crop, Maximize, Square, Smartphone, Monitor, Film, Wand2, RotateCcw, Check, Move } from 'lucide-react'

interface CropRegion { x: number; y: number; width: number; height: number }
type AspectRatio = '16:9' | '9:16' | '4:3' | '1:1' | '21:9' | 'free'
interface SmartCropProps { imageSrc: string; onCrop: (region: CropRegion, aspectRatio: AspectRatio) => void; onSmartCrop?: () => Promise<CropRegion>; className?: string }

export function SmartCrop({ imageSrc, onCrop, onSmartCrop, className = '' }: SmartCropProps) {
  const [region, setRegion] = useState<CropRegion>({ x: 0, y: 0, width: 100, height: 100 })
  const [aspect, setAspect] = useState<AspectRatio>('free')
  const [dragging, setDragging] = useState<'move' | 'nw' | 'ne' | 'sw' | 'se' | null>(null)
  const [imgSize, setImgSize] = useState({ w: 0, h: 0 })
  const containerRef = useRef<HTMLDivElement>(null)
  const dragStart = useRef({ x: 0, y: 0, region: { ...region } })

  const aspects: Array<{ id: AspectRatio; label: string; icon: React.ElementType; ratio?: number }> = [
    { id: 'free', label: 'Free', icon: Crop }, { id: '16:9', label: '16:9', icon: Monitor, ratio: 16/9 },
    { id: '9:16', label: '9:16', icon: Smartphone, ratio: 9/16 }, { id: '4:3', label: '4:3', icon: Film, ratio: 4/3 },
    { id: '1:1', label: '1:1', icon: Square, ratio: 1 }, { id: '21:9', label: '21:9', icon: Maximize, ratio: 21/9 }
  ]

  const handleImgLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    setImgSize({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })
  }, [])

  const handleMouseDown = useCallback((e: React.MouseEvent, type: typeof dragging) => {
    e.preventDefault()
    setDragging(type)
    dragStart.current = { x: e.clientX, y: e.clientY, region: { ...region } }
  }, [region])

  useEffect(() => {
    if (!dragging) return
    const handleMove = (e: MouseEvent) => {
      if (!containerRef.current) return
      const rect = containerRef.current.getBoundingClientRect()
      const dx = ((e.clientX - dragStart.current.x) / rect.width) * 100
      const dy = ((e.clientY - dragStart.current.y) / rect.height) * 100
      const sr = dragStart.current.region

      if (dragging === 'move') {
        setRegion({ ...sr, x: Math.max(0, Math.min(100 - sr.width, sr.x + dx)), y: Math.max(0, Math.min(100 - sr.height, sr.y + dy)) })
      } else {
        let nx = sr.x, ny = sr.y, nw = sr.width, nh = sr.height
        if (dragging.includes('w')) { nx = Math.max(0, sr.x + dx); nw = sr.width - dx }
        if (dragging.includes('e')) { nw = Math.min(100 - sr.x, sr.width + dx) }
        if (dragging.includes('n')) { ny = Math.max(0, sr.y + dy); nh = sr.height - dy }
        if (dragging.includes('s')) { nh = Math.min(100 - sr.y, sr.height + dy) }
        const currentAspect = aspects.find(a => a.id === aspect)
        if (currentAspect?.ratio) { nh = nw / currentAspect.ratio * (imgSize.w / imgSize.h) }
        if (nw > 5 && nh > 5) setRegion({ x: nx, y: ny, width: nw, height: nh })
      }
    }
    const handleUp = () => setDragging(null)
    window.addEventListener('mousemove', handleMove)
    window.addEventListener('mouseup', handleUp)
    return () => { window.removeEventListener('mousemove', handleMove); window.removeEventListener('mouseup', handleUp) }
  }, [dragging, aspect, aspects, imgSize])

  const applyAspect = useCallback((a: AspectRatio) => {
    setAspect(a)
    const ar = aspects.find(x => x.id === a)?.ratio
    if (ar && imgSize.w > 0) {
      const h = (region.width * (imgSize.w / imgSize.h)) / ar
      setRegion(r => ({ ...r, height: Math.min(100 - r.y, h) }))
    }
  }, [aspects, imgSize, region.width])

  const smartCrop = useCallback(async () => {
    if (!onSmartCrop) return
    const detected = await onSmartCrop()
    setRegion(detected)
  }, [onSmartCrop])

  const reset = useCallback(() => setRegion({ x: 0, y: 0, width: 100, height: 100 }), [])

  return (
    <div className={`bg-zinc-900 rounded-xl border border-zinc-700 overflow-hidden ${className}`}>
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
        <div className="flex items-center gap-2"><Crop size={16} className="text-[var(--primary)]" /><span className="font-semibold text-sm">Smart Crop</span></div>
        <div className="flex gap-1">{onSmartCrop && <button onClick={smartCrop} className="flex items-center gap-1 px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-xs"><Wand2 size={12} />Auto</button>}<button onClick={reset} className="p-1.5 rounded hover:bg-zinc-800"><RotateCcw size={14} /></button></div>
      </div>
      {/* Aspect ratios */}
      <div className="flex gap-1 px-3 py-2 border-b border-zinc-800">{aspects.map(a => <button key={a.id} onClick={() => applyAspect(a.id)} className={`flex items-center gap-1 px-2 py-1 rounded text-xs ${aspect === a.id ? 'bg-[var(--primary)]' : 'bg-zinc-800'}`}><a.icon size={10} />{a.label}</button>)}</div>
      {/* Crop area */}
      <div ref={containerRef} className="relative aspect-video m-3 bg-black rounded overflow-hidden">
        <img src={imageSrc} onLoad={handleImgLoad} className="w-full h-full object-contain" draggable={false} />
        <div className="absolute inset-0 bg-black/50" style={{ clipPath: `polygon(0 0, 100% 0, 100% 100%, 0 100%, 0 0, ${region.x}% ${region.y}%, ${region.x}% ${region.y + region.height}%, ${region.x + region.width}% ${region.y + region.height}%, ${region.x + region.width}% ${region.y}%, ${region.x}% ${region.y}%)` }} />
        <div className="absolute border-2 border-[var(--primary)]" style={{ left: `${region.x}%`, top: `${region.y}%`, width: `${region.width}%`, height: `${region.height}%` }} onMouseDown={e => handleMouseDown(e, 'move')}>
          <div className="absolute inset-0 cursor-move flex items-center justify-center"><Move size={16} className="text-white/50" /></div>
          {(['nw', 'ne', 'sw', 'se'] as const).map(h => <div key={h} onMouseDown={e => handleMouseDown(e, h)} className={`absolute w-3 h-3 bg-[var(--primary)] rounded-full cursor-${h}-resize ${h.includes('n') ? '-top-1.5' : '-bottom-1.5'} ${h.includes('w') ? '-left-1.5' : '-right-1.5'}`} />)}
          <div className="absolute inset-0 grid grid-cols-3 grid-rows-3 pointer-events-none">{Array.from({ length: 9 }).map((_, i) => <div key={i} className="border border-white/10" />)}</div>
        </div>
      </div>
      <div className="flex justify-between items-center px-4 py-3 border-t border-zinc-800">
        <span className="text-xs text-zinc-500">{Math.round(region.width)}% × {Math.round(region.height)}%</span>
        <button onClick={() => onCrop(region, aspect)} className="flex items-center gap-2 px-4 py-2 rounded bg-[var(--primary)] text-sm"><Check size={14} />Apply Crop</button>
      </div>
    </div>
  )
}
export default SmartCrop
