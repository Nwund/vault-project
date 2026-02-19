// File: src/renderer/components/SceneDetector.tsx
// AI-powered scene detection and chapter generation

import React, { useState, useCallback, useRef, useMemo, useEffect } from 'react'
import { Scissors, Play, Clock, Tag, Loader2, ChevronRight, Sparkles, Image, Check, Zap } from 'lucide-react'
import { formatDuration } from '../utils/formatters'

interface Scene { id: string; start: number; end: number; thumbnail?: string; label?: string; confidence: number }
interface SceneDetectorProps {
  videoRef?: React.RefObject<HTMLVideoElement>
  videoSrc?: string
  mediaId?: string
  duration: number
  onScenesDetected?: (scenes: Scene[]) => void
  onSceneSelect?: (time: number) => void
  onSeek?: (time: number) => void
  className?: string
}

export function SceneDetector({ videoRef, videoSrc, mediaId, duration, onScenesDetected, onSceneSelect, onSeek, className = '' }: SceneDetectorProps) {
  const [scenes, setScenes] = useState<Scene[]>([])
  const [detecting, setDetecting] = useState(false)
  const [progress, setProgress] = useState(0)
  const [sensitivity, setSensitivity] = useState(0.3)
  const [method, setMethod] = useState<'client' | 'server'>('client')
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const localVideoRef = useRef<HTMLVideoElement>(null)

  // Use provided videoRef or create local one
  const effectiveVideoRef = videoRef || localVideoRef

  // Load video source if only src is provided
  useEffect(() => {
    if (videoSrc && localVideoRef.current && !videoRef) {
      localVideoRef.current.src = videoSrc
    }
  }, [videoSrc, videoRef])

  const detectScenesServer = useCallback(async () => {
    if (!mediaId && !videoSrc) return
    setDetecting(true); setProgress(0)
    try {
      const result = mediaId
        ? await window.api.invoke('scenes:detectById', mediaId, { threshold: sensitivity })
        : await window.api.invoke('scenes:detect', videoSrc, { threshold: sensitivity })

      if (result?.scenes) {
        const mapped = result.scenes.map((s: any, i: number) => ({
          id: `scene-${i}`,
          start: s.start || s.timestamp || 0,
          end: s.end || (result.scenes[i + 1]?.start) || duration,
          confidence: s.confidence || s.score || 1,
          label: s.label
        }))
        setScenes(mapped)
        onScenesDetected?.(mapped)
      }
    } catch (e) {
      console.error('Server scene detection failed:', e)
    }
    setDetecting(false)
  }, [mediaId, videoSrc, sensitivity, duration, onScenesDetected])

  const detectScenesClient = useCallback(async () => {
    const video = effectiveVideoRef.current, canvas = canvasRef.current
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
    setScenes(detected); onScenesDetected?.(detected); setDetecting(false)
  }, [effectiveVideoRef, duration, sensitivity, onScenesDetected])

  const detectScenes = method === 'server' ? detectScenesServer : detectScenesClient
  const handleSeek = onSeek || onSceneSelect

  return (
    <div className={`bg-zinc-900 rounded-xl border border-zinc-700 overflow-hidden ${className}`}>
      <canvas ref={canvasRef} className="hidden" />
      {videoSrc && !videoRef && <video ref={localVideoRef} src={videoSrc} className="hidden" preload="metadata" />}

      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
        <div className="flex items-center gap-2"><Scissors size={16} className="text-[var(--primary)]" /><span className="font-semibold text-sm">Scene Detection</span></div>
        <button onClick={detectScenes} disabled={detecting} className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[var(--primary)] text-sm disabled:opacity-50">
          {detecting ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}{detecting ? `${progress.toFixed(0)}%` : 'Detect'}
        </button>
      </div>

      {/* Method selector */}
      <div className="flex gap-2 px-4 py-2 border-b border-zinc-800">
        <button onClick={() => setMethod('client')} className={`flex-1 flex items-center justify-center gap-1 py-1.5 rounded text-xs ${method === 'client' ? 'bg-[var(--primary)]' : 'bg-zinc-800'}`}>
          <Zap size={12} />Fast (Browser)
        </button>
        <button onClick={() => setMethod('server')} className={`flex-1 flex items-center justify-center gap-1 py-1.5 rounded text-xs ${method === 'server' ? 'bg-[var(--primary)]' : 'bg-zinc-800'}`}>
          <Sparkles size={12} />Accurate (FFmpeg)
        </button>
      </div>

      <div className="p-3">
        <div className="flex items-center gap-2 text-xs text-zinc-500 mb-2">
          <span>Sensitivity</span>
          <input type="range" min={0.1} max={0.6} step={0.05} value={sensitivity} onChange={e => setSensitivity(parseFloat(e.target.value))} className="flex-1 accent-[var(--primary)]" />
          <span>{(sensitivity * 100).toFixed(0)}%</span>
        </div>
      </div>

      {scenes.length > 0 && (
        <div className="max-h-64 overflow-y-auto divide-y divide-zinc-800/50">
          {scenes.map((scene, i) => (
            <button key={scene.id} onClick={() => handleSeek?.(scene.start)} className="w-full flex items-center gap-3 px-4 py-2 hover:bg-zinc-800 transition">
              <div className="w-16 h-9 rounded bg-zinc-800 overflow-hidden flex items-center justify-center">
                {scene.thumbnail ? <img src={scene.thumbnail} className="w-full h-full object-cover" /> : <Play size={12} className="text-zinc-600" />}
              </div>
              <div className="flex-1 text-left">
                <div className="text-sm">{scene.label || `Scene ${i + 1}`}</div>
                <div className="text-xs text-zinc-500">{formatDuration(scene.start)} - {formatDuration(scene.end)}</div>
              </div>
              <div className="text-xs text-zinc-600">{(scene.confidence * 100).toFixed(0)}%</div>
              <ChevronRight size={14} className="text-zinc-600" />
            </button>
          ))}
        </div>
      )}

      {scenes.length === 0 && !detecting && (
        <div className="py-8 text-center text-zinc-500">
          <Scissors size={24} className="mx-auto mb-2 opacity-50" />
          <p className="text-sm">Click Detect to find scene changes</p>
        </div>
      )}
    </div>
  )
}
export default SceneDetector
