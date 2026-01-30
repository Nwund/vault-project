// File: src/renderer/hooks/useVideoPreview.ts
// Video preview on hover hook - quick clips with optional sound

import { useRef, useState, useCallback, useEffect } from 'react'

interface UseVideoPreviewOptions {
  clipDuration?: number // seconds per clip
  clipCount?: number // how many clips to show
  hoverDelay?: number // ms to wait before starting preview (2 seconds)
  muted?: boolean // whether to mute the video (default true)
}

export function useVideoPreview(options: UseVideoPreviewOptions = {}) {
  const { clipDuration = 1.5, clipCount = 4, hoverDelay = 2000, muted = true } = options
  const videoRef = useRef<HTMLVideoElement>(null)
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const clipTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const clipIndexRef = useRef(0)
  const [isHovering, setIsHovering] = useState(false)
  const [isWaiting, setIsWaiting] = useState(false) // 2 second intro period
  const [isPlaying, setIsPlaying] = useState(false)

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current)
      if (clipTimeoutRef.current) clearTimeout(clipTimeoutRef.current)
      if (videoRef.current) {
        videoRef.current.pause()
        videoRef.current.src = ''
      }
    }
  }, [])

  const playNextClip = useCallback((video: HTMLVideoElement, videoDuration: number) => {
    if (!video || video.paused === undefined) return

    // Calculate clip positions spread across the video
    const clipPositions = Array.from({ length: clipCount }, (_, i) =>
      (videoDuration * 0.1) + (videoDuration * 0.7 * i / clipCount)
    )

    const currentClip = clipIndexRef.current % clipCount
    video.currentTime = clipPositions[currentClip]

    video.play().catch(() => {})

    // Schedule next clip
    clipTimeoutRef.current = setTimeout(() => {
      clipIndexRef.current++
      playNextClip(video, videoDuration)
    }, clipDuration * 1000)
  }, [clipCount, clipDuration])

  // Update muted state when it changes
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.muted = muted
    }
  }, [muted])

  const startPreview = useCallback((videoUrl: string, duration?: number) => {
    if (!videoRef.current) return

    const video = videoRef.current
    video.src = videoUrl
    video.muted = muted
    video.playsInline = true
    video.playbackRate = 1.0 // Normal speed
    clipIndexRef.current = 0

    const handleCanPlay = () => {
      setIsPlaying(true)
      const videoDuration = duration || video.duration || 30
      playNextClip(video, videoDuration)
      video.removeEventListener('canplay', handleCanPlay)
    }

    video.addEventListener('canplay', handleCanPlay)
    video.load()
  }, [playNextClip, muted])

  const stopPreview = useCallback(() => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current)
      hoverTimeoutRef.current = null
    }
    if (clipTimeoutRef.current) {
      clearTimeout(clipTimeoutRef.current)
      clipTimeoutRef.current = null
    }
    if (videoRef.current) {
      videoRef.current.pause()
      videoRef.current.src = ''
    }
    setIsPlaying(false)
    setIsWaiting(false)
    clipIndexRef.current = 0
  }, [])

  const handleMouseEnter = useCallback((videoUrl: string, duration?: number) => {
    setIsHovering(true)
    setIsWaiting(true) // Start 2 second waiting period

    // Delay before starting preview
    hoverTimeoutRef.current = setTimeout(() => {
      setIsWaiting(false)
      startPreview(videoUrl, duration)
    }, hoverDelay)
  }, [startPreview, hoverDelay])

  const handleMouseLeave = useCallback(() => {
    setIsHovering(false)
    stopPreview()
  }, [stopPreview])

  return {
    videoRef,
    isHovering,
    isWaiting, // True during 2 second intro (show HUD)
    isPlaying, // True when video is playing (hide HUD)
    handleMouseEnter,
    handleMouseLeave,
    startPreview,
    stopPreview
  }
}
