// File: src/renderer/hooks/useVideoPreview.ts
// Video preview on hover hook - quick clips with optional sound

import { useRef, useState, useCallback, useEffect } from 'react'

interface UseVideoPreviewOptions {
  clipDuration?: number // seconds per clip
  clipCount?: number // how many clips to show
  hoverDelay?: number // ms to wait before starting preview (2 seconds)
  muted?: boolean // whether to mute the video (default true)
  autoPlay?: boolean // whether to start preview immediately when visible (wall mode)
  autoPlayUrl?: string // URL to use for autoPlay
  autoPlayDuration?: number // duration for autoPlay
  wallMode?: boolean // whether to use wall mode (continuous playback, no clip cycling)
}

// Global limiter for wall mode - only allow N videos to play simultaneously
let activeWallVideos = 0
const MAX_WALL_VIDEOS = 6
const wallVideoQueue: Array<() => void> = []

function requestWallSlot(onSlotAvailable: () => void): () => void {
  if (activeWallVideos < MAX_WALL_VIDEOS) {
    activeWallVideos++
    onSlotAvailable()
    return () => {
      activeWallVideos--
      // Process queue
      if (wallVideoQueue.length > 0) {
        const next = wallVideoQueue.shift()
        next?.()
      }
    }
  } else {
    wallVideoQueue.push(onSlotAvailable)
    return () => {
      const idx = wallVideoQueue.indexOf(onSlotAvailable)
      if (idx !== -1) wallVideoQueue.splice(idx, 1)
      else {
        activeWallVideos--
        if (wallVideoQueue.length > 0) {
          const next = wallVideoQueue.shift()
          next?.()
        }
      }
    }
  }
}

export function useVideoPreview(options: UseVideoPreviewOptions = {}) {
  const { clipDuration = 1.5, clipCount = 4, hoverDelay = 2000, muted = true, autoPlay = false, autoPlayUrl, autoPlayDuration, wallMode = false } = options
  const videoRef = useRef<HTMLVideoElement>(null)
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const clipTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const clipIndexRef = useRef(0)
  const canPlayHandlerRef = useRef<(() => void) | null>(null) // Track canplay listener for cleanup
  const releaseSlotRef = useRef<(() => void) | null>(null) // Track wall slot for cleanup
  const [isHovering, setIsHovering] = useState(false)
  const [isWaiting, setIsWaiting] = useState(false) // 2 second intro period
  const [isPlaying, setIsPlaying] = useState(false)

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current)
      if (clipTimeoutRef.current) clearTimeout(clipTimeoutRef.current)
      // Clean up canplay listener if still attached
      if (videoRef.current && canPlayHandlerRef.current) {
        videoRef.current.removeEventListener('canplay', canPlayHandlerRef.current)
        canPlayHandlerRef.current = null
      }
      // Release wall slot if held
      if (releaseSlotRef.current) {
        releaseSlotRef.current()
        releaseSlotRef.current = null
      }
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

    video.play().catch(err => {
      // Only log unexpected errors (NotAllowedError is common and expected)
      if (err.name !== 'NotAllowedError' && err.name !== 'AbortError') {
        console.warn('[VideoPreview] Play failed:', err.name)
      }
    })

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

  // Track if video has been initialized in wall mode
  const hasInitializedRef = useRef(false)
  const wasPlayingRef = useRef(false)

  // Auto-play when enabled and URL is available
  useEffect(() => {
    if (!wallMode) {
      // Normal hover mode - start/stop based on autoPlay
      if (autoPlay && autoPlayUrl) {
        startPreview(autoPlayUrl, autoPlayDuration)
      }
      return () => {
        if (autoPlay) {
          stopPreview()
        }
      }
    } else {
      // Wall mode - initialize once, then pause/resume
      if (autoPlay && autoPlayUrl && !hasInitializedRef.current) {
        // First time becoming visible - start the video
        hasInitializedRef.current = true
        startPreview(autoPlayUrl, autoPlayDuration)
      } else if (autoPlay && hasInitializedRef.current && videoRef.current) {
        // Coming back into view - resume playback
        if (wasPlayingRef.current) {
          videoRef.current.play().catch(() => {})
          setIsPlaying(true)
        }
      } else if (!autoPlay && hasInitializedRef.current && videoRef.current) {
        // Going out of view - pause but don't reset
        wasPlayingRef.current = !videoRef.current.paused
        videoRef.current.pause()
        setIsPlaying(false)
      }
      // Don't return cleanup for wall mode - keep video element alive
    }
  }, [autoPlay, autoPlayUrl, autoPlayDuration, wallMode]) // eslint-disable-line react-hooks/exhaustive-deps

  const startPreview = useCallback((videoUrl: string, duration?: number) => {
    if (!videoRef.current) return

    const video = videoRef.current

    // Clean up previous canplay listener if any
    if (canPlayHandlerRef.current) {
      video.removeEventListener('canplay', canPlayHandlerRef.current)
      canPlayHandlerRef.current = null
    }

    const doStart = () => {
      video.src = videoUrl
      video.muted = muted
      video.playsInline = true
      video.playbackRate = 1.0 // Normal speed
      clipIndexRef.current = 0

      const handleCanPlay = () => {
        setIsPlaying(true)
        const videoDuration = duration || video.duration || 30

        if (wallMode) {
          // Wall mode: start from random position, play continuously, loop
          const startPos = Math.random() * videoDuration * 0.7 // Start in first 70%
          video.currentTime = startPos
          video.loop = true
          video.play().catch(err => {
            if (err.name !== 'NotAllowedError' && err.name !== 'AbortError') {
              console.warn('[VideoPreview] Wall play failed:', err.name)
            }
          })
        } else {
          // Normal mode: cycle through clips
          playNextClip(video, videoDuration)
        }
        video.removeEventListener('canplay', handleCanPlay)
        canPlayHandlerRef.current = null
      }

      const handleError = () => {
        console.warn('[VideoPreview] Video load error:', videoUrl)
        setIsPlaying(false)
        setIsWaiting(false)
        // Minimal cleanup without calling stopPreview to avoid circular ref
        if (canPlayHandlerRef.current) {
          video.removeEventListener('canplay', canPlayHandlerRef.current)
          canPlayHandlerRef.current = null
        }
        // Release slot on error
        if (wallMode && releaseSlotRef.current) {
          releaseSlotRef.current()
          releaseSlotRef.current = null
        }
      }

      canPlayHandlerRef.current = handleCanPlay
      video.addEventListener('canplay', handleCanPlay)
      video.addEventListener('error', handleError, { once: true })
      video.load()
    }

    if (wallMode) {
      // Request a slot before starting in wall mode
      releaseSlotRef.current = requestWallSlot(() => {
        // Add stagger delay for smoother loading
        setTimeout(doStart, Math.random() * 500)
      })
    } else {
      doStart()
    }
  }, [playNextClip, muted, wallMode])

  const stopPreview = useCallback(() => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current)
      hoverTimeoutRef.current = null
    }
    if (clipTimeoutRef.current) {
      clearTimeout(clipTimeoutRef.current)
      clipTimeoutRef.current = null
    }
    // Clean up canplay listener to prevent memory leak
    if (videoRef.current && canPlayHandlerRef.current) {
      videoRef.current.removeEventListener('canplay', canPlayHandlerRef.current)
      canPlayHandlerRef.current = null
    }
    // Release wall slot
    if (releaseSlotRef.current) {
      releaseSlotRef.current()
      releaseSlotRef.current = null
    }
    if (videoRef.current) {
      videoRef.current.pause()
      videoRef.current.src = ''
      videoRef.current.loop = false
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
