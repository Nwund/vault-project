// File: src/renderer/components/LoopRegion.tsx
// A/B loop region selector for video playback

import React, { useState, useCallback, useEffect, useRef } from 'react'
import { Repeat, X, ChevronLeft, ChevronRight, Lock, Unlock, Scissors, Save } from 'lucide-react'
import { formatDuration } from '../utils/formatters'

interface Loop { id: string; start: number; end: number; name?: string }
interface LoopRegionProps { videoRef: React.RefObject<HTMLVideoElement>; duration: number; currentTime: number; savedLoops?: Loop[]; onSaveLoop?: (loop: Loop) => void; className?: string }

export function LoopRegion({ videoRef, duration, currentTime, savedLoops = [], onSaveLoop, className = '' }: LoopRegionProps) {
  const [active, setActive] = useState(false)
  const [start, setStart] = useState(0)
  const [end, setEnd] = useState(duration)
  const [locked, setLocked] = useState(false)
  const [dragging, setDragging] = useState<'start' | 'end' | null>(null)
  const barRef = useRef<HTMLDivElement>(null)

  useEffect(() => { setEnd(duration) }, [duration])

  useEffect(() => {
    if (!active || !videoRef.current) return
    const video = videoRef.current
    const check = () => { if (video.currentTime >= end) video.currentTime = start }
    video.addEventListener('timeupdate', check)
    return () => video.removeEventListener('timeupdate', check)
  }, [active, start, end, videoRef])

  const handleMouseDown = (type: 'start' | 'end') => (e: React.MouseEvent) => { e.preventDefault(); setDragging(type) }

  useEffect(() => {
    if (!dragging) return
    const handleMove = (e: MouseEvent) => {
      if (!barRef.current) return
      const rect = barRef.current.getBoundingClientRect()
      const pos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
      const time = pos * duration
      if (dragging === 'start') setStart(Math.min(time, end - 1))
      else setEnd(Math.max(time, start + 1))
    }
    const handleUp = () => setDragging(null)
    window.addEventListener('mousemove', handleMove)
    window.addEventListener('mouseup', handleUp)
    return () => { window.removeEventListener('mousemove', handleMove); window.removeEventListener('mouseup', handleUp) }
  }, [dragging, duration, start, end])

  const setA = useCallback(() => setStart(currentTime), [currentTime])
  const setB = useCallback(() => setEnd(currentTime), [currentTime])
  const save = useCallback(() => { onSaveLoop?.({ id: `loop-${Date.now()}`, start, end, name: `Loop ${savedLoops.length + 1}` }) }, [start, end, savedLoops, onSaveLoop])

  return (
    <div className={`bg-zinc-900 rounded-xl border border-zinc-700 overflow-hidden ${className}`}>
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
        <div className="flex items-center gap-2"><Repeat size={16} className={active ? 'text-[var(--primary)]' : 'text-zinc-500'} /><span className="font-semibold text-sm">Loop Region</span></div>
        <div className="flex items-center gap-1">
          <button onClick={() => setLocked(!locked)} className={`p-1.5 rounded ${locked ? 'bg-[var(--primary)]/20 text-[var(--primary)]' : 'hover:bg-zinc-800'}`}>{locked ? <Lock size={14} /> : <Unlock size={14} />}</button>
          <button onClick={() => setActive(!active)} className={`px-3 py-1 rounded text-xs ${active ? 'bg-[var(--primary)] text-white' : 'bg-zinc-800'}`}>{active ? 'On' : 'Off'}</button>
        </div>
      </div>
      {/* Timeline */}
      <div className="px-4 py-4">
        <div ref={barRef} className="relative h-8 bg-zinc-800 rounded cursor-crosshair">
          <div className="absolute h-full bg-[var(--primary)]/30 rounded" style={{ left: `${(start / duration) * 100}%`, width: `${((end - start) / duration) * 100}%` }} />
          <div onMouseDown={handleMouseDown('start')} className="absolute top-0 bottom-0 w-2 bg-[var(--primary)] rounded-l cursor-ew-resize" style={{ left: `${(start / duration) * 100}%` }}><ChevronLeft size={12} className="absolute top-1/2 left-0 -translate-y-1/2 text-white" /></div>
          <div onMouseDown={handleMouseDown('end')} className="absolute top-0 bottom-0 w-2 bg-[var(--primary)] rounded-r cursor-ew-resize" style={{ left: `calc(${(end / duration) * 100}% - 8px)` }}><ChevronRight size={12} className="absolute top-1/2 right-0 -translate-y-1/2 text-white" /></div>
          <div className="absolute top-0 bottom-0 w-0.5 bg-white" style={{ left: `${(currentTime / duration) * 100}%` }} />
        </div>
        <div className="flex justify-between mt-2 text-xs text-zinc-500"><span>{formatDuration(start)}</span><span>{formatDuration(end - start)} loop</span><span>{formatDuration(end)}</span></div>
      </div>
      {/* Quick actions */}
      <div className="flex gap-2 px-4 pb-3">
        <button onClick={setA} className="flex-1 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-xs">Set A</button>
        <button onClick={setB} className="flex-1 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-xs">Set B</button>
        {onSaveLoop && <button onClick={save} className="px-3 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700"><Save size={12} /></button>}
      </div>
      {/* Saved loops */}
      {savedLoops.length > 0 && <div className="border-t border-zinc-800 max-h-24 overflow-y-auto">
        {savedLoops.map(l => <button key={l.id} onClick={() => { setStart(l.start); setEnd(l.end); setActive(true) }} className="w-full flex items-center justify-between px-4 py-2 hover:bg-zinc-800 text-xs"><span>{l.name}</span><span className="text-zinc-500">{formatDuration(l.start)} - {formatDuration(l.end)}</span></button>)}
      </div>}
    </div>
  )
}
export default LoopRegion
