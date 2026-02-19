// File: src/renderer/components/SpeedRamp.tsx
// Variable speed control with ramping

import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react'
import { Gauge, Plus, Trash2, Play, Pause, RotateCcw, Save, Zap, Clock } from 'lucide-react'
import { formatDuration } from '../utils/formatters'

interface SpeedPoint { time: number; speed: number }
interface SpeedRampProps { videoRef: React.RefObject<HTMLVideoElement>; duration: number; onApply: (points: SpeedPoint[]) => void; className?: string }

const PRESETS = [
  { name: 'Slow Motion', points: [{ time: 0, speed: 0.25 }] },
  { name: 'Speed Up', points: [{ time: 0, speed: 1 }, { time: 0.5, speed: 2 }] },
  { name: 'Dramatic', points: [{ time: 0, speed: 1 }, { time: 0.3, speed: 0.25 }, { time: 0.5, speed: 0.25 }, { time: 0.7, speed: 2 }] },
  { name: 'Punch', points: [{ time: 0, speed: 1 }, { time: 0.4, speed: 0.1 }, { time: 0.5, speed: 3 }] }
]

export function SpeedRamp({ videoRef, duration, onApply, className = '' }: SpeedRampProps) {
  const [points, setPoints] = useState<SpeedPoint[]>([{ time: 0, speed: 1 }])
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [selectedPoint, setSelectedPoint] = useState<number | null>(null)
  const graphRef = useRef<HTMLDivElement>(null)

  const sortedPoints = useMemo(() => [...points].sort((a, b) => a.time - b.time), [points])

  const getCurrentSpeed = useCallback((time: number) => {
    if (sortedPoints.length === 0) return 1
    if (sortedPoints.length === 1) return sortedPoints[0].speed
    const normalizedTime = time / duration
    for (let i = sortedPoints.length - 1; i >= 0; i--) {
      if (normalizedTime >= sortedPoints[i].time) {
        if (i === sortedPoints.length - 1) return sortedPoints[i].speed
        const t1 = sortedPoints[i].time, t2 = sortedPoints[i + 1].time
        const s1 = sortedPoints[i].speed, s2 = sortedPoints[i + 1].speed
        const progress = (normalizedTime - t1) / (t2 - t1)
        return s1 + (s2 - s1) * progress
      }
    }
    return sortedPoints[0].speed
  }, [sortedPoints, duration])

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    const update = () => { setCurrentTime(video.currentTime); video.playbackRate = getCurrentSpeed(video.currentTime) }
    video.addEventListener('timeupdate', update)
    return () => video.removeEventListener('timeupdate', update)
  }, [videoRef, getCurrentSpeed])

  const addPoint = useCallback((e: React.MouseEvent) => {
    if (!graphRef.current) return
    const rect = graphRef.current.getBoundingClientRect()
    const time = (e.clientX - rect.left) / rect.width
    const speed = 3 - ((e.clientY - rect.top) / rect.height) * 2.9
    setPoints(p => [...p, { time: Math.max(0, Math.min(1, time)), speed: Math.max(0.1, Math.min(3, speed)) }])
  }, [])

  const updatePoint = useCallback((index: number, updates: Partial<SpeedPoint>) => {
    setPoints(p => p.map((pt, i) => i === index ? { ...pt, ...updates } : pt))
  }, [])

  const deletePoint = useCallback((index: number) => {
    if (points.length <= 1) return
    setPoints(p => p.filter((_, i) => i !== index))
    setSelectedPoint(null)
  }, [points.length])

  const applyPreset = useCallback((preset: typeof PRESETS[0]) => {
    setPoints(preset.points)
  }, [])

  const reset = useCallback(() => { setPoints([{ time: 0, speed: 1 }]) }, [])
  const togglePlay = useCallback(() => { const v = videoRef.current; v && (isPlaying ? v.pause() : v.play()); setIsPlaying(!isPlaying) }, [videoRef, isPlaying])

  const pathD = useMemo(() => {
    if (sortedPoints.length === 0) return ''
    const pts = sortedPoints.map(p => ({ x: p.time * 100, y: 100 - ((p.speed - 0.1) / 2.9) * 100 }))
    return `M ${pts[0].x} ${pts[0].y} ` + pts.slice(1).map(p => `L ${p.x} ${p.y}`).join(' ')
  }, [sortedPoints])

  return (
    <div className={`bg-zinc-900 rounded-xl border border-zinc-700 overflow-hidden ${className}`}>
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
        <div className="flex items-center gap-2"><Gauge size={16} className="text-[var(--primary)]" /><span className="font-semibold text-sm">Speed Ramp</span></div>
        <div className="flex gap-1"><button onClick={reset} className="p-1.5 rounded hover:bg-zinc-800"><RotateCcw size={14} /></button><button onClick={() => onApply(points)} className="flex items-center gap-1 px-2 py-1 rounded bg-[var(--primary)] text-xs"><Save size={12} />Apply</button></div>
      </div>
      {/* Presets */}
      <div className="flex gap-2 px-4 py-2 border-b border-zinc-800 overflow-x-auto">{PRESETS.map(p => <button key={p.name} onClick={() => applyPreset(p)} className="px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-xs whitespace-nowrap">{p.name}</button>)}</div>
      {/* Graph */}
      <div ref={graphRef} className="relative h-32 mx-4 my-4 bg-zinc-800 rounded cursor-crosshair" onClick={addPoint}>
        <svg className="absolute inset-0 w-full h-full"><path d={pathD} fill="none" stroke="var(--primary)" strokeWidth="2" /></svg>
        {/* Grid lines */}
        {[0.5, 1, 1.5, 2, 2.5].map(s => <div key={s} className="absolute left-0 right-0 border-t border-zinc-700/50" style={{ top: `${100 - ((s - 0.1) / 2.9) * 100}%` }}><span className="absolute -left-8 text-[10px] text-zinc-600">{s}x</span></div>)}
        {/* Points */}
        {sortedPoints.map((p, i) => <div key={i} className={`absolute w-3 h-3 rounded-full cursor-pointer ${selectedPoint === i ? 'bg-white ring-2 ring-[var(--primary)]' : 'bg-[var(--primary)]'}`} style={{ left: `calc(${p.time * 100}% - 6px)`, top: `calc(${100 - ((p.speed - 0.1) / 2.9) * 100}% - 6px)` }} onClick={e => { e.stopPropagation(); setSelectedPoint(i) }} />)}
        {/* Playhead */}
        <div className="absolute top-0 bottom-0 w-0.5 bg-white pointer-events-none" style={{ left: `${(currentTime / duration) * 100}%` }} />
      </div>
      {/* Current speed display */}
      <div className="flex items-center justify-between px-4 pb-2 text-sm">
        <span className="text-zinc-500">Current: <span className="text-white font-mono">{getCurrentSpeed(currentTime).toFixed(2)}x</span></span>
        <span className="text-zinc-500">{formatDuration(currentTime)} / {formatDuration(duration)}</span>
      </div>
      {/* Selected point editor */}
      {selectedPoint !== null && sortedPoints[selectedPoint] && <div className="px-4 py-3 border-t border-zinc-800 bg-zinc-800/30">
        <div className="flex items-center justify-between mb-2"><span className="text-xs text-zinc-500">Point {selectedPoint + 1}</span><button onClick={() => deletePoint(selectedPoint)} className="p-1 rounded text-red-400 hover:bg-red-500/20"><Trash2 size={12} /></button></div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="text-xs text-zinc-500">Time</label><input type="range" min={0} max={1} step={0.01} value={sortedPoints[selectedPoint].time} onChange={e => updatePoint(selectedPoint, { time: parseFloat(e.target.value) })} className="w-full accent-[var(--primary)]" /></div>
          <div><label className="text-xs text-zinc-500">Speed ({sortedPoints[selectedPoint].speed.toFixed(2)}x)</label><input type="range" min={0.1} max={3} step={0.1} value={sortedPoints[selectedPoint].speed} onChange={e => updatePoint(selectedPoint, { speed: parseFloat(e.target.value) })} className="w-full accent-[var(--primary)]" /></div>
        </div>
      </div>}
      {/* Controls */}
      <div className="flex items-center justify-center gap-4 px-4 py-3 border-t border-zinc-800">
        <button onClick={togglePlay} className="p-2 rounded-full bg-[var(--primary)]">{isPlaying ? <Pause size={16} /> : <Play size={16} />}</button>
      </div>
    </div>
  )
}
export default SpeedRamp
