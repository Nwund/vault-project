// File: src/renderer/components/AudioVisualizer.tsx
// Real-time audio visualization with multiple modes

import React, { useState, useEffect, useRef, useCallback } from 'react'
import { Activity, BarChart3, Waves, Radio, Settings, Volume2 } from 'lucide-react'

type VisualizerMode = 'bars' | 'wave' | 'circular' | 'spectrum'
interface AudioVisualizerProps { videoRef: React.RefObject<HTMLVideoElement>; mode?: VisualizerMode; color?: string; height?: number; className?: string }

export function AudioVisualizer({ videoRef, mode: initialMode = 'bars', color = 'var(--primary)', height = 80, className = '' }: AudioVisualizerProps) {
  const [mode, setMode] = useState<VisualizerMode>(initialMode)
  const [sensitivity, setSensitivity] = useState(1)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null)
  const rafRef = useRef<number>()

  useEffect(() => {
    const video = videoRef.current, canvas = canvasRef.current
    if (!video || !canvas) return
    const ctx = canvas.getContext('2d')!

    if (!audioCtxRef.current) {
      audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)()
      analyserRef.current = audioCtxRef.current.createAnalyser()
      analyserRef.current.fftSize = 256
      sourceRef.current = audioCtxRef.current.createMediaElementSource(video)
      sourceRef.current.connect(analyserRef.current)
      analyserRef.current.connect(audioCtxRef.current.destination)
    }

    const analyser = analyserRef.current!
    const bufferLength = analyser.frequencyBinCount
    const dataArray = new Uint8Array(bufferLength)

    const draw = () => {
      rafRef.current = requestAnimationFrame(draw)
      analyser.getByteFrequencyData(dataArray)
      const w = canvas.width, h = canvas.height
      ctx.clearRect(0, 0, w, h)

      if (mode === 'bars') {
        const barW = (w / bufferLength) * 2.5
        let x = 0
        for (let i = 0; i < bufferLength; i++) {
          const barH = (dataArray[i] / 255) * h * sensitivity
          ctx.fillStyle = color
          ctx.fillRect(x, h - barH, barW - 1, barH)
          x += barW
        }
      } else if (mode === 'wave') {
        analyser.getByteTimeDomainData(dataArray)
        ctx.lineWidth = 2
        ctx.strokeStyle = color
        ctx.beginPath()
        const sliceW = w / bufferLength
        let x = 0
        for (let i = 0; i < bufferLength; i++) {
          const v = dataArray[i] / 128.0
          const y = (v * h) / 2
          i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
          x += sliceW
        }
        ctx.lineTo(w, h / 2)
        ctx.stroke()
      } else if (mode === 'circular') {
        const centerX = w / 2, centerY = h / 2, radius = Math.min(w, h) / 3
        for (let i = 0; i < bufferLength; i++) {
          const angle = (i / bufferLength) * Math.PI * 2
          const amp = (dataArray[i] / 255) * radius * sensitivity
          const x1 = centerX + Math.cos(angle) * radius
          const y1 = centerY + Math.sin(angle) * radius
          const x2 = centerX + Math.cos(angle) * (radius + amp)
          const y2 = centerY + Math.sin(angle) * (radius + amp)
          ctx.beginPath()
          ctx.moveTo(x1, y1)
          ctx.lineTo(x2, y2)
          ctx.strokeStyle = color
          ctx.lineWidth = 2
          ctx.stroke()
        }
      } else if (mode === 'spectrum') {
        const gradient = ctx.createLinearGradient(0, h, 0, 0)
        gradient.addColorStop(0, 'blue'); gradient.addColorStop(0.5, 'green'); gradient.addColorStop(1, 'red')
        const barW = w / bufferLength
        for (let i = 0; i < bufferLength; i++) {
          const barH = (dataArray[i] / 255) * h * sensitivity
          ctx.fillStyle = gradient
          ctx.fillRect(i * barW, h - barH, barW - 1, barH)
        }
      }
    }

    draw()
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }
  }, [videoRef, mode, color, sensitivity])

  useEffect(() => {
    const resize = () => {
      if (canvasRef.current) {
        canvasRef.current.width = canvasRef.current.offsetWidth
        canvasRef.current.height = height
      }
    }
    resize()
    window.addEventListener('resize', resize)
    return () => window.removeEventListener('resize', resize)
  }, [height])

  const modes: Array<{ id: VisualizerMode; icon: React.ElementType }> = [
    { id: 'bars', icon: BarChart3 }, { id: 'wave', icon: Waves }, { id: 'circular', icon: Radio }, { id: 'spectrum', icon: Activity }
  ]

  return (
    <div className={`bg-zinc-900 rounded-xl border border-zinc-700 overflow-hidden ${className}`}>
      <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-800">
        <div className="flex items-center gap-2"><Volume2 size={14} className="text-[var(--primary)]" /><span className="text-sm font-medium">Visualizer</span></div>
        <div className="flex items-center gap-1">{modes.map(m => <button key={m.id} onClick={() => setMode(m.id)} className={`p-1.5 rounded ${mode === m.id ? 'bg-[var(--primary)]' : 'hover:bg-zinc-800'}`}><m.icon size={12} /></button>)}</div>
      </div>
      <canvas ref={canvasRef} style={{ height }} className="w-full" />
      <div className="flex items-center gap-2 px-3 py-2 border-t border-zinc-800"><span className="text-xs text-zinc-500">Sensitivity</span><input type="range" min={0.5} max={2} step={0.1} value={sensitivity} onChange={e => setSensitivity(parseFloat(e.target.value))} className="flex-1 accent-[var(--primary)]" /></div>
    </div>
  )
}
export default AudioVisualizer
