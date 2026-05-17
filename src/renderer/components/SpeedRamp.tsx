// File: src/renderer/components/SpeedRamp.tsx
// Variable speed control with ramping

import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react'
import { Gauge, Plus, Trash2, Play, Pause, RotateCcw, Save, Zap, Clock } from 'lucide-react'
import { formatDuration } from '../utils/formatters'

// #170 — Added optional Bezier easing curves per point. Each point's
// `curve` describes how the segment FROM this point to the next one
// interpolates speed. 'linear' preserves the old straight-line behavior.
type SpeedCurve = 'linear' | 'easeIn' | 'easeOut' | 'easeInOut'
interface SpeedPoint { time: number; speed: number; curve?: SpeedCurve }
interface SpeedRampProps { videoRef: React.RefObject<HTMLVideoElement | null>; duration: number; onApply: (points: SpeedPoint[]) => void; className?: string }

const PRESETS = [
  { name: 'Slow Motion', points: [{ time: 0, speed: 0.25 }] },
  { name: 'Speed Up', points: [{ time: 0, speed: 1 }, { time: 0.5, speed: 2, curve: 'easeInOut' as SpeedCurve }] },
  { name: 'Dramatic', points: [{ time: 0, speed: 1, curve: 'easeOut' as SpeedCurve }, { time: 0.3, speed: 0.25 }, { time: 0.5, speed: 0.25, curve: 'easeIn' as SpeedCurve }, { time: 0.7, speed: 2 }] },
  { name: 'Punch', points: [{ time: 0, speed: 1, curve: 'easeIn' as SpeedCurve }, { time: 0.4, speed: 0.1 }, { time: 0.5, speed: 3 }] }
]

// Cubic-bezier evaluators tuned for "natural" easing — the same
// curves CSS transition-timing-function uses internally so the
// feel matches user expectations from other tools.
//   linear:     (0,0) (1,1)
//   easeIn:     (0.42,0) (1,1)     — accelerates into the next point
//   easeOut:    (0,0) (0.58,1)     — decelerates as it approaches
//   easeInOut:  (0.42,0) (0.58,1)  — both
function bezier1D(p1x: number, p1y: number, p2x: number, p2y: number, t: number): number {
  // Approximate the cubic-bezier curve by solving for x given t,
  // then evaluating y. We use 4 Newton-Raphson steps which is plenty
  // accurate for human-perceptible speed ramps (<0.5% error).
  const cx = 3 * p1x
  const bx = 3 * (p2x - p1x) - cx
  const ax = 1 - cx - bx
  const cy = 3 * p1y
  const by = 3 * (p2y - p1y) - cy
  const ay = 1 - cy - by
  const sampleX = (t: number) => ((ax * t + bx) * t + cx) * t
  const sampleDx = (t: number) => (3 * ax * t + 2 * bx) * t + cx
  let x = t
  for (let i = 0; i < 4; i++) {
    const cur = sampleX(x) - t
    const slope = sampleDx(x) || 1
    x -= cur / slope
  }
  return ((ay * x + by) * x + cy) * x
}

function easeT(curve: SpeedCurve, t: number): number {
  if (curve === 'linear') return t
  if (curve === 'easeIn') return bezier1D(0.42, 0, 1, 1, t)
  if (curve === 'easeOut') return bezier1D(0, 0, 0.58, 1, t)
  return bezier1D(0.42, 0, 0.58, 1, t) // easeInOut
}

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
        // #170 — apply each point's outgoing easing curve so the
        // segment from i→i+1 honors the curve the user selected.
        const eased = easeT(sortedPoints[i].curve ?? 'linear', progress)
        return s1 + (s2 - s1) * eased
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

  // #170 — Render the curve in SVG as a polyline of N sub-segments
  // per segment so non-linear easings draw correctly. 16 samples per
  // segment is more than enough for a 600px-wide graph and still
  // renders instantly even with many points.
  const pathD = useMemo(() => {
    if (sortedPoints.length === 0) return ''
    const samplesPerSeg = 16
    const xy = (time: number, speed: number) => ({ x: time * 100, y: 100 - ((speed - 0.1) / 2.9) * 100 })
    const first = xy(sortedPoints[0].time, sortedPoints[0].speed)
    let d = `M ${first.x} ${first.y} `
    for (let i = 0; i < sortedPoints.length - 1; i++) {
      const a = sortedPoints[i]
      const b = sortedPoints[i + 1]
      const curve = a.curve ?? 'linear'
      if (curve === 'linear') {
        const p = xy(b.time, b.speed)
        d += `L ${p.x} ${p.y} `
      } else {
        for (let s = 1; s <= samplesPerSeg; s++) {
          const t = s / samplesPerSeg
          const eased = easeT(curve, t)
          const speed = a.speed + (b.speed - a.speed) * eased
          const time = a.time + (b.time - a.time) * t
          const p = xy(time, speed)
          d += `L ${p.x} ${p.y} `
        }
      }
    }
    return d.trim()
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
        {/* #170 — Outgoing curve picker. Disabled on the last point
            since there's no segment after it to ease. */}
        {selectedPoint < sortedPoints.length - 1 && (
          <div className="mt-3">
            <label className="text-xs text-zinc-500 mb-1 block">Curve to next point</label>
            <div className="flex gap-1">
              {(['linear', 'easeIn', 'easeOut', 'easeInOut'] as const).map((c) => {
                const isActive = (sortedPoints[selectedPoint].curve ?? 'linear') === c
                return (
                  <button
                    key={c}
                    onClick={() => updatePoint(selectedPoint, { curve: c })}
                    className={`px-2 py-1 rounded text-[11px] transition flex-1 ${
                      isActive
                        ? 'bg-[var(--primary)] text-white'
                        : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300'
                    }`}
                  >
                    {c === 'linear' ? 'Linear' : c === 'easeIn' ? 'Ease in' : c === 'easeOut' ? 'Ease out' : 'Both'}
                  </button>
                )
              })}
            </div>
          </div>
        )}
      </div>}
      {/* Controls */}
      <div className="flex items-center justify-center gap-4 px-4 py-3 border-t border-zinc-800">
        <button onClick={togglePlay} className="p-2 rounded-full bg-[var(--primary)]">{isPlaying ? <Pause size={16} /> : <Play size={16} />}</button>
      </div>
    </div>
  )
}
export default SpeedRamp
