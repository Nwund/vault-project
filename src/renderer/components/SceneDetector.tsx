// File: src/renderer/components/SceneDetector.tsx
// AI-powered scene detection and chapter generation

import React, { useState, useCallback, useRef, useMemo } from 'react'
import { Scissors, Play, Clock, Tag, Loader2, ChevronRight, Sparkles, Image, Check } from 'lucide-react'
import { formatDuration } from '../utils/formatters'

interface Scene { id: string; start: number; end: number; thumbnail?: string; label?: string; confidence: number }
interface SceneDetectorProps {
  videoRef: React.RefObject<HTMLVideoElement>
  duration: number
  onScenesDetected: (scenes: Scene[]) => void
  onSeek: (time: number) => void
  className?: string
}

export function SceneDetector({ videoRef, duration, onScenesDetected, onSeek, className = '' }: SceneDetectorProps) {
  const [scenes, setScenes] = useState<Scene[]>([])
  const [detecting, setDetecting] = useState(false)
  const [progress, setProgress] = useState(0)
  const [sensitivity, setSensitivity] = useState(0.3)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const detectScenes = useCallback(async () => {
    const video = videoRef.current, canvas = canvasRef.current
    if (!video || !canvas) return
    setDetecting(true); setProgress(0)
    const ctx = canvas.getContext('2d')!
    canvas.width = 160; canvas.height = 90
    const detected: Scene[] = []
    let lastFrame: ImageData | null = null, sceneStart = 0
    const step = 0.5, total = Math.floor(duration / step)

    for (let i = 0; i < total; i++) {
      video.currentTime = i * step
      await new Promise(r => video.onseeked = r)
      ctx.drawImage(video, 0, 0, 160, 90)
      const frame = ctx.getImageData(0, 0, 160, 90)
      if (lastFrame) {
        let diff = 0
        for (let j = 0; j < frame.data.length; j += 4) {
          diff += Math.abs(frame.data[j] - lastFrame.data[j]) + Math.abs(frame.data[j+1] - lastFrame.data[j+1]) + Math.abs(frame.data[j+2] - lastFrame.data[j+2])
        }
        const norm = diff / (frame.data.length * 255 / 4)
        if (norm > sensitivity) {
          detected.push({ id: `scene-${detected.length}`, start: sceneStart, end: i * step, thumbnail: canvas.toDataURL('image/jpeg', 0.6), confidence: norm })
          sceneStart = i * step
        }
      }
      lastFrame = frame; setProgress((i / total) * 100)
    }
    detected.push({ id: `scene-${detected.length}`, start: sceneStart, end: duration, confidence: 1 })
    setScenes(detected); onScenesDetected(detected); setDetecting(false)
  }, [videoRef, duration, sensitivity, onScenesDetected])

  return (
    <div className={`bg-zinc-900 rounded-xl border border-zinc-700 overflow-hidden ${className}`}>
      <canvas ref={canvasRef} className="hidden" />
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
        <div className="flex items-center gap-2"><Scissors size={16} className="text-[var(--primary)]" /><span className="font-semibold text-sm">Scene Detection</span></div>
        <button onClick={detectScenes} disabled={detecting} className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[var(--primary)] text-sm disabled:opacity-50">
          {detecting ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}{detecting ? `${progress.toFixed(0)}%` : 'Detect'}
        </button>
      </div>
      <div className="p-3"><div className="flex items-center gap-2 text-xs text-zinc-500 mb-2"><span>Sensitivity</span><input type="range" min={0.1} max={0.6} step={0.05} value={sensitivity} onChange={e => setSensitivity(parseFloat(e.target.value))} className="flex-1 accent-[var(--primary)]" /><span>{(sensitivity * 100).toFixed(0)}%</span></div></div>
      {scenes.length > 0 && <div className="max-h-64 overflow-y-auto divide-y divide-zinc-800/50">
        {scenes.map((scene, i) => (
          <button key={scene.id} onClick={() => onSeek(scene.start)} className="w-full flex items-center gap-3 px-4 py-2 hover:bg-zinc-800 transition">
            <div className="w-16 h-9 rounded bg-zinc-800 overflow-hidden">{scene.thumbnail && <img src={scene.thumbnail} className="w-full h-full object-cover" />}</div>
            <div className="flex-1 text-left"><div className="text-sm">Scene {i + 1}</div><div className="text-xs text-zinc-500">{formatDuration(scene.start)} - {formatDuration(scene.end)}</div></div>
            <ChevronRight size={14} className="text-zinc-600" />
          </button>
        ))}
      </div>}
    </div>
  )
}
export default SceneDetector
