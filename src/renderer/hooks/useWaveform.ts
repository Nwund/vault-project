// File: src/renderer/hooks/useWaveform.ts
// Web Audio API waveform visualization hook for PMV Editor

import { useRef, useState, useEffect, useCallback } from 'react'

export interface WaveformData {
  peaks: number[]
  duration: number
}

export interface UseWaveformOptions {
  samples?: number // Number of samples for visualization (default: 1000)
  barColor?: string
  playedColor?: string
  backgroundColor?: string
}

export function useWaveform(audioPath: string | null, options: UseWaveformOptions = {}) {
  const { samples = 1000 } = options

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const audioBufferRef = useRef<AudioBuffer | null>(null)
  const audioElementRef = useRef<HTMLAudioElement | null>(null)
  const animationFrameRef = useRef<number | null>(null)

  const [waveformData, setWaveformData] = useState<WaveformData | null>(null)
  const [duration, setDuration] = useState(0)
  const [currentTime, setCurrentTime] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Load and decode audio file
  const loadAudio = useCallback(async (path: string) => {
    setIsLoading(true)
    setError(null)

    try {
      // Create audio context if needed
      if (!audioContextRef.current) {
        audioContextRef.current = new AudioContext()
      }

      // Convert file path to URL
      const fileUrl = await window.api.fs.toFileUrl(path)
      if (!fileUrl) {
        throw new Error('Failed to get file URL')
      }

      // Fetch and decode audio
      const response = await fetch(fileUrl as string)
      const arrayBuffer = await response.arrayBuffer()
      const audioBuffer = await audioContextRef.current.decodeAudioData(arrayBuffer)

      audioBufferRef.current = audioBuffer
      setDuration(audioBuffer.duration)

      // Generate waveform peaks
      const peaks = generatePeaks(audioBuffer, samples)
      setWaveformData({ peaks, duration: audioBuffer.duration })

      // Create audio element for playback
      if (audioElementRef.current) {
        audioElementRef.current.pause()
        audioElementRef.current.src = ''
      }
      const audio = new Audio(fileUrl as string)
      audio.addEventListener('timeupdate', () => {
        setCurrentTime(audio.currentTime)
      })
      audio.addEventListener('ended', () => {
        setIsPlaying(false)
        setCurrentTime(0)
      })
      audio.addEventListener('play', () => setIsPlaying(true))
      audio.addEventListener('pause', () => setIsPlaying(false))
      audioElementRef.current = audio

      setIsLoading(false)
    } catch (err: any) {
      console.error('[useWaveform] Failed to load audio:', err)
      setError(err?.message || 'Failed to load audio')
      setIsLoading(false)
    }
  }, [samples])

  // Generate peaks from audio buffer
  function generatePeaks(buffer: AudioBuffer, numSamples: number): number[] {
    const channelData = buffer.getChannelData(0) // Use first channel
    const samplesPerPeak = Math.floor(channelData.length / numSamples)
    const peaks: number[] = []

    for (let i = 0; i < numSamples; i++) {
      const start = i * samplesPerPeak
      const end = start + samplesPerPeak
      let max = 0

      for (let j = start; j < end && j < channelData.length; j++) {
        const abs = Math.abs(channelData[j])
        if (abs > max) max = abs
      }

      peaks.push(max)
    }

    return peaks
  }

  // Draw waveform to canvas
  const drawWaveform = useCallback(() => {
    const canvas = canvasRef.current
    const data = waveformData

    if (!canvas || !data) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const { width, height } = canvas
    const { peaks } = data

    // Clear canvas
    ctx.fillStyle = options.backgroundColor || '#18181b'
    ctx.fillRect(0, 0, width, height)

    const barWidth = width / peaks.length
    const centerY = height / 2
    const playedRatio = duration > 0 ? currentTime / duration : 0
    const playedBars = Math.floor(peaks.length * playedRatio)

    // Draw bars
    peaks.forEach((peak, i) => {
      const barHeight = peak * height * 0.9 // 90% of height max
      const x = i * barWidth
      const y = centerY - barHeight / 2

      // Different color for played portion
      if (i < playedBars) {
        ctx.fillStyle = options.playedColor || '#a855f7' // Purple for played
      } else {
        ctx.fillStyle = options.barColor || '#52525b' // Zinc for unplayed
      }

      ctx.fillRect(x, y, Math.max(barWidth - 1, 1), barHeight)
    })

    // Draw playhead
    if (duration > 0) {
      const playheadX = playedRatio * width
      ctx.strokeStyle = '#ffffff'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(playheadX, 0)
      ctx.lineTo(playheadX, height)
      ctx.stroke()
    }
  }, [waveformData, currentTime, duration, options.barColor, options.playedColor, options.backgroundColor])

  // Handle canvas click for seeking
  const handleCanvasClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    const audio = audioElementRef.current

    if (!canvas || !audio || duration === 0) return

    const rect = canvas.getBoundingClientRect()
    const x = e.clientX - rect.left
    const ratio = x / rect.width
    const newTime = ratio * duration

    audio.currentTime = newTime
    setCurrentTime(newTime)
  }, [duration])

  // Playback controls
  const play = useCallback(() => {
    audioElementRef.current?.play()
  }, [])

  const pause = useCallback(() => {
    audioElementRef.current?.pause()
  }, [])

  const togglePlayPause = useCallback(() => {
    if (isPlaying) {
      pause()
    } else {
      play()
    }
  }, [isPlaying, play, pause])

  const seek = useCallback((time: number) => {
    if (audioElementRef.current) {
      audioElementRef.current.currentTime = time
      setCurrentTime(time)
    }
  }, [])

  const seekPercent = useCallback((percent: number) => {
    if (duration > 0) {
      seek(percent * duration)
    }
  }, [duration, seek])

  // Set volume (0-1)
  const setVolume = useCallback((volume: number) => {
    if (audioElementRef.current) {
      audioElementRef.current.volume = Math.max(0, Math.min(1, volume))
    }
  }, [])

  // Load audio when path changes
  useEffect(() => {
    if (audioPath) {
      loadAudio(audioPath)
    } else {
      // Reset state when path is cleared
      setWaveformData(null)
      setDuration(0)
      setCurrentTime(0)
      setIsPlaying(false)
      if (audioElementRef.current) {
        audioElementRef.current.pause()
        audioElementRef.current.src = ''
        audioElementRef.current = null
      }
    }

    return () => {
      if (audioElementRef.current) {
        audioElementRef.current.pause()
      }
    }
  }, [audioPath, loadAudio])

  // Animation loop for drawing
  useEffect(() => {
    const animate = () => {
      drawWaveform()
      animationFrameRef.current = requestAnimationFrame(animate)
    }

    if (waveformData) {
      animate()
    }

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
    }
  }, [waveformData, drawWaveform])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (audioContextRef.current) {
        audioContextRef.current.close()
      }
      if (audioElementRef.current) {
        audioElementRef.current.pause()
        audioElementRef.current.src = ''
      }
    }
  }, [])

  return {
    canvasRef,
    waveformData,
    duration,
    currentTime,
    isPlaying,
    isLoading,
    error,
    play,
    pause,
    togglePlayPause,
    seek,
    seekPercent,
    setVolume,
    handleCanvasClick
  }
}
