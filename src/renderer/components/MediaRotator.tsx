// File: src/renderer/components/MediaRotator.tsx
// Rotate and flip images/videos

import React, { useState, useCallback, useMemo } from 'react'
import { RotateCw, RotateCcw, FlipHorizontal, FlipVertical, Check, RotateCcwSquare, Undo, Save } from 'lucide-react'

interface Transform { rotation: number; flipH: boolean; flipV: boolean }
interface MediaRotatorProps { src: string; type: 'video' | 'image'; onApply: (transform: Transform) => void; className?: string }

export function MediaRotator({ src, type, onApply, className = '' }: MediaRotatorProps) {
  const [transform, setTransform] = useState<Transform>({ rotation: 0, flipH: false, flipV: false })
  const [history, setHistory] = useState<Transform[]>([])

  const rotate = useCallback((deg: number) => {
    setHistory(h => [...h, transform])
    setTransform(t => ({ ...t, rotation: (t.rotation + deg + 360) % 360 }))
  }, [transform])

  const flip = useCallback((axis: 'h' | 'v') => {
    setHistory(h => [...h, transform])
    setTransform(t => axis === 'h' ? { ...t, flipH: !t.flipH } : { ...t, flipV: !t.flipV })
  }, [transform])

  const undo = useCallback(() => {
    if (history.length === 0) return
    setTransform(history[history.length - 1])
    setHistory(h => h.slice(0, -1))
  }, [history])

  const reset = useCallback(() => {
    setHistory([])
    setTransform({ rotation: 0, flipH: false, flipV: false })
  }, [])

  const cssTransform = useMemo(() => {
    const parts = []
    if (transform.rotation !== 0) parts.push(`rotate(${transform.rotation}deg)`)
    if (transform.flipH) parts.push('scaleX(-1)')
    if (transform.flipV) parts.push('scaleY(-1)')
    return parts.join(' ') || 'none'
  }, [transform])

  const hasChanges = transform.rotation !== 0 || transform.flipH || transform.flipV

  return (
    <div className={`bg-zinc-900 rounded-xl border border-zinc-700 overflow-hidden ${className}`}>
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
        <div className="flex items-center gap-2"><RotateCcwSquare size={16} className="text-[var(--primary)]" /><span className="font-semibold text-sm">Rotate & Flip</span></div>
        <div className="flex gap-1">
          <button onClick={undo} disabled={history.length === 0} className="p-1.5 rounded hover:bg-zinc-800 disabled:opacity-30"><Undo size={14} /></button>
          <button onClick={reset} disabled={!hasChanges} className="p-1.5 rounded hover:bg-zinc-800 disabled:opacity-30"><RotateCcw size={14} /></button>
        </div>
      </div>
      {/* Preview */}
      <div className="relative aspect-video m-4 bg-black rounded overflow-hidden flex items-center justify-center">
        {type === 'video' ? <video src={src} className="max-w-full max-h-full" style={{ transform: cssTransform }} muted loop autoPlay />
        : <img src={src} className="max-w-full max-h-full" style={{ transform: cssTransform }} />}
        <div className="absolute bottom-2 right-2 px-2 py-1 bg-black/60 rounded text-xs">{transform.rotation}°{transform.flipH ? ' H' : ''}{transform.flipV ? ' V' : ''}</div>
      </div>
      {/* Controls */}
      <div className="grid grid-cols-4 gap-2 px-4 pb-4">
        <button onClick={() => rotate(-90)} className="flex flex-col items-center gap-1 py-3 bg-zinc-800 hover:bg-zinc-700 rounded"><RotateCcw size={18} /><span className="text-xs">-90°</span></button>
        <button onClick={() => rotate(90)} className="flex flex-col items-center gap-1 py-3 bg-zinc-800 hover:bg-zinc-700 rounded"><RotateCw size={18} /><span className="text-xs">+90°</span></button>
        <button onClick={() => flip('h')} className={`flex flex-col items-center gap-1 py-3 rounded ${transform.flipH ? 'bg-[var(--primary)]' : 'bg-zinc-800 hover:bg-zinc-700'}`}><FlipHorizontal size={18} /><span className="text-xs">Flip H</span></button>
        <button onClick={() => flip('v')} className={`flex flex-col items-center gap-1 py-3 rounded ${transform.flipV ? 'bg-[var(--primary)]' : 'bg-zinc-800 hover:bg-zinc-700'}`}><FlipVertical size={18} /><span className="text-xs">Flip V</span></button>
      </div>
      {/* Fine rotation */}
      <div className="px-4 pb-4">
        <div className="flex items-center justify-between text-xs mb-2"><span className="text-zinc-500">Fine rotation</span><span>{transform.rotation}°</span></div>
        <input type="range" min={0} max={360} value={transform.rotation} onChange={e => { setHistory(h => [...h, transform]); setTransform(t => ({ ...t, rotation: parseInt(e.target.value) })) }} className="w-full accent-[var(--primary)]" />
      </div>
      {/* Apply */}
      <div className="px-4 pb-4">
        <button onClick={() => onApply(transform)} disabled={!hasChanges} className="w-full flex items-center justify-center gap-2 py-2.5 bg-[var(--primary)] rounded text-sm disabled:opacity-50"><Save size={14} />Apply Changes</button>
      </div>
    </div>
  )
}
export default MediaRotator
