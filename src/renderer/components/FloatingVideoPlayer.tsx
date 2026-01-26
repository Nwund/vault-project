// File: src/renderer/components/FloatingVideoPlayer.tsx
// Floating Picture-in-Picture style video player with fullscreen support

import React, { useState, useRef, useEffect, useCallback } from 'react'
import { X, ChevronLeft, ChevronRight, Maximize2, Minimize2, Volume2, VolumeX, Star, FolderOpen, Play, Pause } from 'lucide-react'

interface MediaRow {
  id: string
  path: string
  filename?: string
  type: 'video' | 'image' | 'gif'
  thumbPath?: string | null
  durationSec?: number | null
  sizeBytes?: number | null
}

interface FloatingVideoPlayerProps {
  media: MediaRow
  mediaList: MediaRow[]
  onClose: () => void
  onMediaChange: (mediaId: string) => void
  instanceIndex?: number // For positioning multiple players
  initialPosition?: { x: number; y: number }
  otherPlayerBounds?: Array<{ x: number; y: number; width: number; height: number }> // For collision detection
  onBoundsChange?: (bounds: { x: number; y: number; width: number; height: number }) => void
}

// URL cache for file paths
const urlCache = new Map<string, string>()
async function toFileUrlCached(absPath: string): Promise<string> {
  if (urlCache.has(absPath)) return urlCache.get(absPath)!
  const url = await window.api.thumbs.getUrl(absPath)
  urlCache.set(absPath, url)
  return url
}

function formatDuration(sec: number | null | undefined): string {
  if (!sec) return ''
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

export function FloatingVideoPlayer({ media, mediaList, onClose, onMediaChange, instanceIndex = 0, initialPosition, otherPlayerBounds = [], onBoundsChange }: FloatingVideoPlayerProps) {
  const [url, setUrl] = useState('')
  const [isFullscreen, setIsFullscreen] = useState(false)
  // Position - only set from initialPosition on first mount, then preserve
  const [position, setPosition] = useState(() => ({
    x: initialPosition?.x ?? 20 + instanceIndex * 60,
    y: initialPosition?.y ?? window.innerHeight - 350 - instanceIndex * 50
  }))
  const [size, setSize] = useState({ width: 480, height: 270 }) // 16:9 default
  const [aspectRatio, setAspectRatio] = useState(16 / 9) // Lock to video aspect ratio
  const [isDragging, setIsDragging] = useState(false)
  const [isResizing, setIsResizing] = useState<string | null>(null)
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 })
  const [resizeStart, setResizeStart] = useState({ x: 0, y: 0, width: 0, height: 0, posX: 0, posY: 0 })
  const [isMuted, setIsMuted] = useState(false)
  const [volume, setVolume] = useState(0.5) // Volume 0-1
  const [isPaused, setIsPaused] = useState(false)
  const [showControls, setShowControls] = useState(true)
  const [isLoading, setIsLoading] = useState(true)
  const [hasError, setHasError] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [showVolumeSlider, setShowVolumeSlider] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const hideControlsTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)
  const progressRef = useRef<HTMLDivElement>(null)
  const positionInitialized = useRef(false)
  const aspectRatioSet = useRef(false) // Track if aspect ratio has been set for this video

  const MIN_WIDTH = 200
  const MIN_HEIGHT = 120
  const MAX_WIDTH = window.innerWidth - 40
  const MAX_HEIGHT = window.innerHeight - 40
  const lastBoundsRef = useRef<string>('')

  // Report bounds changes for collision detection - only when actually changed
  useEffect(() => {
    const boundsKey = `${position.x},${position.y},${size.width},${size.height}`
    if (boundsKey !== lastBoundsRef.current) {
      lastBoundsRef.current = boundsKey
      onBoundsChange?.({ ...position, ...size })
    }
  }, [position.x, position.y, size.width, size.height]) // Don't include onBoundsChange to avoid loops

  // Get current index in media list
  const currentIndex = mediaList.findIndex(m => m.id === media.id)
  const hasPrev = currentIndex > 0
  const hasNext = currentIndex < mediaList.length - 1

  // Load video URL
  useEffect(() => {
    let alive = true
    setIsLoading(true)
    setHasError(false)
    aspectRatioSet.current = false // Reset for new video
    ;(async () => {
      const u = await toFileUrlCached(media.path)
      if (alive) setUrl(u)
    })()
    return () => { alive = false }
  }, [media.path])

  // Apply volume to video element
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.volume = isMuted ? 0 : volume
    }
  }, [volume, isMuted])

  // Record view
  useEffect(() => {
    window.api.media.recordView(media.id)
  }, [media.id])

  // Loading timeout - if video doesn't load within 10 seconds, show error
  useEffect(() => {
    if (!isLoading || hasError) return
    const timeout = setTimeout(() => {
      if (isLoading && !hasError) {
        console.warn('[FloatingPlayer] Loading timeout:', media.path)
        setHasError(true)
        setIsLoading(false)
      }
    }, 10000)
    return () => clearTimeout(timeout)
  }, [isLoading, hasError, media.path])

  // Handle video events
  const handleCanPlay = useCallback(() => {
    setIsLoading(false)
    setHasError(false)
    if (videoRef.current) {
      setDuration(videoRef.current.duration)
      // Apply initial volume
      videoRef.current.volume = isMuted ? 0 : volume
    }
  }, [isMuted, volume])

  const handleError = useCallback((e: React.SyntheticEvent<HTMLVideoElement | HTMLImageElement>) => {
    setIsLoading(false)
    setHasError(true)
    const target = e.currentTarget
    if ('error' in target && target.error) {
      const videoError = target.error as MediaError
      console.warn('[FloatingPlayer] Video error:', {
        path: media.path,
        code: videoError.code,
        message: videoError.message,
        // MediaError codes: 1=ABORTED, 2=NETWORK, 3=DECODE, 4=SRC_NOT_SUPPORTED
        errorType: ['', 'ABORTED', 'NETWORK', 'DECODE', 'SRC_NOT_SUPPORTED'][videoError.code] || 'UNKNOWN'
      })
    } else {
      console.warn('[FloatingPlayer] Media error:', media.path)
    }
  }, [media.path])

  const handleTimeUpdate = useCallback(() => {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime)
    }
  }, [])

  // Navigation functions
  const goToPrev = useCallback(() => {
    if (hasPrev) {
      onMediaChange(mediaList[currentIndex - 1].id)
    }
  }, [currentIndex, hasPrev, mediaList, onMediaChange])

  const goToNext = useCallback(() => {
    if (hasNext) {
      onMediaChange(mediaList[currentIndex + 1].id)
    }
  }, [currentIndex, hasNext, mediaList, onMediaChange])

  // Toggle play/pause
  const togglePlay = useCallback(() => {
    if (videoRef.current) {
      if (videoRef.current.paused) {
        videoRef.current.play()
        setIsPaused(false)
      } else {
        videoRef.current.pause()
        setIsPaused(true)
      }
    }
  }, [])

  // Seek
  const handleProgressClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (progressRef.current && videoRef.current) {
      const rect = progressRef.current.getBoundingClientRect()
      const percent = (e.clientX - rect.left) / rect.width
      videoRef.current.currentTime = percent * videoRef.current.duration
    }
  }, [])

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
        if (e.shiftKey && videoRef.current) {
          videoRef.current.currentTime -= 5
        } else {
          goToPrev()
        }
      } else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
        if (e.shiftKey && videoRef.current) {
          videoRef.current.currentTime += 5
        } else {
          goToNext()
        }
      } else if (e.key === 'Escape') {
        if (isFullscreen) {
          exitFullscreen()
        } else {
          onClose()
        }
      } else if (e.key === ' ') {
        e.preventDefault()
        togglePlay()
      } else if (e.key === 'm' || e.key === 'M') {
        setIsMuted(prev => !prev)
      } else if (e.key === 'f' || e.key === 'F') {
        toggleFullscreen()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [goToPrev, goToNext, onClose, isFullscreen, togglePlay])

  // Fullscreen handling
  const toggleFullscreen = useCallback(async () => {
    if (!isFullscreen) {
      try {
        if (containerRef.current) {
          await containerRef.current.requestFullscreen()
          setIsFullscreen(true)
        }
      } catch (e) {
        console.warn('[FloatingPlayer] Fullscreen error:', e)
      }
    } else {
      exitFullscreen()
    }
  }, [isFullscreen])

  const exitFullscreen = useCallback(async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen()
      }
      setIsFullscreen(false)
    } catch (e) {
      console.warn('[FloatingPlayer] Exit fullscreen error:', e)
    }
  }, [])

  // Listen for fullscreen changes
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement)
    }
    document.addEventListener('fullscreenchange', handleFullscreenChange)
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange)
  }, [])

  // Drag handling (only when not fullscreen)
  const handleMouseDown = (e: React.MouseEvent) => {
    if (isFullscreen) return
    if ((e.target as HTMLElement).closest('.no-drag')) return
    setIsDragging(true)
    setDragOffset({
      x: e.clientX - position.x,
      y: e.clientY - position.y
    })
  }

  // Check collision with other players and adjust position
  const resolveCollision = (newX: number, newY: number): { x: number; y: number } => {
    let x = Math.max(0, Math.min(window.innerWidth - size.width, newX))
    let y = Math.max(0, Math.min(window.innerHeight - size.height, newY))

    // Check against each other player's bounds
    for (const other of otherPlayerBounds) {
      // Calculate overlap
      const myRight = x + size.width
      const myBottom = y + size.height
      const otherRight = other.x + other.width
      const otherBottom = other.y + other.height

      // Check if overlapping
      if (x < otherRight && myRight > other.x && y < otherBottom && myBottom > other.y) {
        // Calculate overlap amounts for each direction
        const overlapLeft = otherRight - x
        const overlapRight = myRight - other.x
        const overlapTop = otherBottom - y
        const overlapBottom = myBottom - other.y

        // Find the smallest overlap and push out in that direction
        const minOverlap = Math.min(overlapLeft, overlapRight, overlapTop, overlapBottom)

        if (minOverlap === overlapLeft) {
          x = otherRight // Push right
        } else if (minOverlap === overlapRight) {
          x = other.x - size.width // Push left
        } else if (minOverlap === overlapTop) {
          y = otherBottom // Push down
        } else {
          y = other.y - size.height // Push up
        }
      }
    }

    // Clamp to screen bounds again after collision resolution
    x = Math.max(0, Math.min(window.innerWidth - size.width, x))
    y = Math.max(0, Math.min(window.innerHeight - size.height, y))

    return { x, y }
  }

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDragging && !isFullscreen) {
        const rawX = e.clientX - dragOffset.x
        const rawY = e.clientY - dragOffset.y
        const resolved = resolveCollision(rawX, rawY)
        setPosition(resolved)
      }
    }

    const handleMouseUp = () => {
      setIsDragging(false)
    }

    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove)
      window.addEventListener('mouseup', handleMouseUp)
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isDragging, dragOffset, size, isFullscreen, otherPlayerBounds])

  // Resize handling
  const handleResizeStart = (e: React.MouseEvent, direction: string) => {
    e.preventDefault()
    e.stopPropagation()
    if (isFullscreen) return
    setIsResizing(direction)
    setResizeStart({
      x: e.clientX,
      y: e.clientY,
      width: size.width,
      height: size.height,
      posX: position.x,
      posY: position.y
    })
  }

  useEffect(() => {
    if (!isResizing) return

    const handleResizeMove = (e: MouseEvent) => {
      const dx = e.clientX - resizeStart.x
      const dy = e.clientY - resizeStart.y

      let newWidth = resizeStart.width
      let newHeight = resizeStart.height
      let newX = resizeStart.posX
      let newY = resizeStart.posY

      // Corner resize - maintain aspect ratio
      if (isResizing.length === 2) {
        // Determine primary direction based on mouse movement
        const absDx = Math.abs(dx)
        const absDy = Math.abs(dy)

        if (absDx > absDy) {
          // Width-based resize
          if (isResizing.includes('e')) {
            newWidth = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, resizeStart.width + dx))
          } else if (isResizing.includes('w')) {
            newWidth = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, resizeStart.width - dx))
            newX = resizeStart.posX + (resizeStart.width - newWidth)
          }
          newHeight = newWidth / aspectRatio
        } else {
          // Height-based resize
          if (isResizing.includes('s')) {
            newHeight = Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, resizeStart.height + dy))
          } else if (isResizing.includes('n')) {
            newHeight = Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, resizeStart.height - dy))
            newY = resizeStart.posY + (resizeStart.height - newHeight)
          }
          newWidth = newHeight * aspectRatio
        }
      } else {
        // Edge resize - maintain aspect ratio
        if (isResizing === 'e') {
          newWidth = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, resizeStart.width + dx))
          newHeight = newWidth / aspectRatio
        } else if (isResizing === 'w') {
          newWidth = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, resizeStart.width - dx))
          newX = resizeStart.posX + (resizeStart.width - newWidth)
          newHeight = newWidth / aspectRatio
        } else if (isResizing === 's') {
          newHeight = Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, resizeStart.height + dy))
          newWidth = newHeight * aspectRatio
        } else if (isResizing === 'n') {
          newHeight = Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, resizeStart.height - dy))
          newY = resizeStart.posY + (resizeStart.height - newHeight)
          newWidth = newHeight * aspectRatio
        }
      }

      // Clamp to bounds
      newWidth = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, newWidth))
      newHeight = Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, newHeight))
      newX = Math.max(0, Math.min(window.innerWidth - newWidth, newX))
      newY = Math.max(0, Math.min(window.innerHeight - newHeight, newY))

      setSize({ width: newWidth, height: newHeight })
      setPosition({ x: newX, y: newY })
    }

    const handleResizeEnd = () => {
      setIsResizing(null)
    }

    window.addEventListener('mousemove', handleResizeMove)
    window.addEventListener('mouseup', handleResizeEnd)

    return () => {
      window.removeEventListener('mousemove', handleResizeMove)
      window.removeEventListener('mouseup', handleResizeEnd)
    }
  }, [isResizing, resizeStart, aspectRatio, MIN_WIDTH, MIN_HEIGHT, MAX_WIDTH, MAX_HEIGHT])

  // Auto-hide controls
  const resetHideControlsTimer = useCallback(() => {
    setShowControls(true)
    if (hideControlsTimeout.current) {
      clearTimeout(hideControlsTimeout.current)
    }
    hideControlsTimeout.current = setTimeout(() => {
      if (!isPaused) setShowControls(false)
    }, 3000)
  }, [isPaused])

  useEffect(() => {
    return () => {
      if (hideControlsTimeout.current) {
        clearTimeout(hideControlsTimeout.current)
      }
    }
  }, [])

  // Quick actions
  const handleIncO = async () => {
    await window.api.media.incO(media.id)
  }

  const handleRate5Stars = async () => {
    await window.api.media.setRating(media.id, 5)
  }

  const handleRevealInFolder = async () => {
    await window.api.shell.showItemInFolder(media.path)
  }

  const filename = media.filename || media.path.split(/[/\\]/).pop() || 'Unknown'

  // Container styles
  const containerStyle: React.CSSProperties = isFullscreen
    ? { position: 'fixed', inset: 0, zIndex: 9999 }
    : {
        position: 'fixed',
        left: position.x,
        top: position.y,
        width: size.width,
        height: size.height,
        zIndex: 100,
        cursor: isDragging ? 'grabbing' : 'default'
      }

  return (
    <div
      ref={containerRef}
      className={`bg-black overflow-hidden ${isFullscreen ? '' : 'rounded-xl border border-white/20 shadow-2xl'}`}
      style={containerStyle}
      onMouseMove={resetHideControlsTimer}
    >
      {/* Resize handles (not in fullscreen) */}
      {!isFullscreen && (
        <>
          {/* Edge handles */}
          <div
            className="absolute top-0 left-4 right-4 h-2 cursor-n-resize z-30 hover:bg-white/20"
            onMouseDown={(e) => handleResizeStart(e, 'n')}
          />
          <div
            className="absolute bottom-0 left-4 right-4 h-2 cursor-s-resize z-30 hover:bg-white/20"
            onMouseDown={(e) => handleResizeStart(e, 's')}
          />
          <div
            className="absolute left-0 top-4 bottom-4 w-2 cursor-w-resize z-30 hover:bg-white/20"
            onMouseDown={(e) => handleResizeStart(e, 'w')}
          />
          <div
            className="absolute right-0 top-4 bottom-4 w-2 cursor-e-resize z-30 hover:bg-white/20"
            onMouseDown={(e) => handleResizeStart(e, 'e')}
          />
          {/* Corner handles */}
          <div
            className="absolute top-0 left-0 w-4 h-4 cursor-nw-resize z-30 hover:bg-white/30 rounded-tl-xl"
            onMouseDown={(e) => handleResizeStart(e, 'nw')}
          />
          <div
            className="absolute top-0 right-0 w-4 h-4 cursor-ne-resize z-30 hover:bg-white/30 rounded-tr-xl"
            onMouseDown={(e) => handleResizeStart(e, 'ne')}
          />
          <div
            className="absolute bottom-0 left-0 w-4 h-4 cursor-sw-resize z-30 hover:bg-white/30 rounded-bl-xl"
            onMouseDown={(e) => handleResizeStart(e, 'sw')}
          />
          <div
            className="absolute bottom-0 right-0 w-4 h-4 cursor-se-resize z-30 hover:bg-white/30 rounded-br-xl"
            onMouseDown={(e) => handleResizeStart(e, 'se')}
          />
        </>
      )}

      {/* Draggable header (not in fullscreen) */}
      {!isFullscreen && (
        <div
          className={`absolute top-0 left-0 right-0 h-9 bg-gradient-to-b from-black/90 to-transparent z-10 flex items-center justify-between px-3 transition-opacity duration-300 ${showControls ? 'opacity-100' : 'opacity-0'}`}
          onMouseDown={handleMouseDown}
          style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
        >
          <div className="text-[11px] text-white/80 truncate max-w-[70%]" title={filename}>
            {filename}
          </div>
          <div className="flex items-center gap-1 no-drag">
            <button
              onClick={toggleFullscreen}
              className="p-1 hover:bg-white/20 rounded transition"
              title="Fullscreen (F)"
            >
              <Maximize2 size={14} />
            </button>
            <button
              onClick={onClose}
              className="p-1 hover:bg-red-500/50 rounded transition"
              title="Close (Esc)"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      )}

      {/* Loading indicator */}
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/50 z-20">
          <div className="w-10 h-10 border-3 border-white/20 border-t-white rounded-full animate-spin" />
        </div>
      )}

      {/* Error state */}
      {hasError && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black z-20">
          <div className="text-4xl mb-2">⚠️</div>
          <div className="text-sm text-white/60">Failed to load video</div>
          <button
            onClick={goToNext}
            className="mt-3 px-4 py-2 bg-white/20 rounded-lg text-sm hover:bg-white/30 transition"
          >
            Skip to next
          </button>
        </div>
      )}

      {/* Video/Image - only render when URL is ready */}
      {media.type === 'video' ? (
        url ? (
          <video
            ref={videoRef}
            src={url}
            autoPlay
            loop
            playsInline
            preload="auto"
            className={`w-full h-full object-contain bg-black ${isFullscreen ? '' : ''}`}
            onClick={togglePlay}
            onCanPlay={handleCanPlay}
            onLoadedMetadata={(e) => {
              // Capture actual video dimensions and set aspect ratio - only once per video
              if (aspectRatioSet.current) return
              const video = e.currentTarget
              if (video.videoWidth && video.videoHeight) {
                aspectRatioSet.current = true
                const ratio = video.videoWidth / video.videoHeight
                setAspectRatio(ratio)
                // Adjust size to match video aspect ratio
                setSize(prev => ({
                  width: prev.width,
                  height: prev.width / ratio
                }))
              }
              console.log('[FloatingPlayer] Metadata loaded:', media.path, { width: video.videoWidth, height: video.videoHeight })
            }}
            onError={handleError}
            onTimeUpdate={handleTimeUpdate}
            onPlay={() => setIsPaused(false)}
            onPause={() => setIsPaused(true)}
            onStalled={() => console.warn('[FloatingPlayer] Video stalled:', media.path)}
            onWaiting={() => setIsLoading(true)}
            onPlaying={() => setIsLoading(false)}
          />
        ) : (
          <div className="w-full h-full bg-black" />
        )
      ) : (
        url ? (
          <img
            src={url}
            alt={filename}
            className="w-full h-full object-contain bg-black"
            onLoad={() => setIsLoading(false)}
            onError={handleError}
          />
        ) : (
          <div className="w-full h-full bg-black" />
        )
      )}

      {/* Bottom controls */}
      <div
        className={`absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/95 via-black/70 to-transparent transition-opacity duration-300 ${showControls ? 'opacity-100' : 'opacity-0'}`}
        style={{ padding: isFullscreen ? '20px' : '12px' }}
      >
        {/* Progress bar (for videos) */}
        {media.type === 'video' && duration > 0 && (
          <div
            ref={progressRef}
            className="w-full h-1 bg-white/20 rounded-full mb-3 cursor-pointer group"
            onClick={handleProgressClick}
          >
            <div
              className="h-full bg-white/80 rounded-full relative"
              style={{ width: `${(currentTime / duration) * 100}%` }}
            >
              <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full opacity-0 group-hover:opacity-100 transition" />
            </div>
          </div>
        )}

        <div className="flex items-center justify-between">
          {/* Left: Navigation */}
          <div className="flex items-center gap-2 no-drag">
            <button
              onClick={goToPrev}
              disabled={!hasPrev}
              className={`p-2 rounded-lg transition ${hasPrev ? 'bg-white/20 hover:bg-white/30' : 'bg-white/5 opacity-40 cursor-not-allowed'}`}
              title="Previous (A / ←)"
            >
              <ChevronLeft size={18} />
            </button>

            {media.type === 'video' && (
              <button
                onClick={togglePlay}
                className="p-2 rounded-lg bg-white/20 hover:bg-white/30 transition"
                title={isPaused ? 'Play (Space)' : 'Pause (Space)'}
              >
                {isPaused ? <Play size={18} /> : <Pause size={18} />}
              </button>
            )}

            <button
              onClick={goToNext}
              disabled={!hasNext}
              className={`p-2 rounded-lg transition ${hasNext ? 'bg-white/20 hover:bg-white/30' : 'bg-white/5 opacity-40 cursor-not-allowed'}`}
              title="Next (D / →)"
            >
              <ChevronRight size={18} />
            </button>

            {/* Counter & Time */}
            <span className="text-[11px] text-white/60 ml-2">
              {currentIndex + 1}/{mediaList.length}
              {media.type === 'video' && duration > 0 && (
                <span className="ml-2">
                  {formatDuration(currentTime)} / {formatDuration(duration)}
                </span>
              )}
            </span>
          </div>

          {/* Right: Actions */}
          <div className="flex items-center gap-1 no-drag">
            {media.type === 'video' && (
              <div
                className="relative flex items-center"
                onMouseEnter={() => setShowVolumeSlider(true)}
                onMouseLeave={() => setShowVolumeSlider(false)}
              >
                <button
                  onClick={() => setIsMuted(!isMuted)}
                  className="p-2 rounded-lg bg-white/10 hover:bg-white/20 transition"
                  title={isMuted ? 'Unmute (M)' : 'Mute (M)'}
                >
                  {isMuted || volume === 0 ? <VolumeX size={16} /> : <Volume2 size={16} />}
                </button>
                {/* Volume slider */}
                <div className={`absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-3 bg-black/90 rounded-lg border border-white/20 transition-all duration-200 ${showVolumeSlider ? 'opacity-100 visible' : 'opacity-0 invisible'}`}>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={volume}
                    onChange={(e) => {
                      const v = parseFloat(e.target.value)
                      setVolume(v)
                      if (v > 0 && isMuted) setIsMuted(false)
                    }}
                    className="w-20 h-1 appearance-none bg-white/30 rounded-full cursor-pointer accent-white"
                    style={{ writingMode: 'horizontal-tb' }}
                  />
                  <div className="text-[10px] text-white/60 text-center mt-1">{Math.round(volume * 100)}%</div>
                </div>
              </div>
            )}

            <button
              onClick={handleIncO}
              className="p-2 rounded-lg bg-pink-600/60 hover:bg-pink-600/80 transition"
              title="+O"
            >
              <span className="text-xs font-bold">+O</span>
            </button>

            <button
              onClick={handleRate5Stars}
              className="p-2 rounded-lg bg-yellow-600/60 hover:bg-yellow-600/80 transition"
              title="Rate 5 stars"
            >
              <Star size={16} />
            </button>

            <button
              onClick={handleRevealInFolder}
              className="p-2 rounded-lg bg-white/10 hover:bg-white/20 transition"
              title="Show in folder"
            >
              <FolderOpen size={16} />
            </button>

            {isFullscreen && (
              <button
                onClick={exitFullscreen}
                className="p-2 rounded-lg bg-white/10 hover:bg-white/20 transition ml-1"
                title="Exit fullscreen (Esc)"
              >
                <Minimize2 size={16} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Fullscreen header (only in fullscreen) */}
      {isFullscreen && (
        <div
          className={`absolute top-0 left-0 right-0 bg-gradient-to-b from-black/80 to-transparent p-4 transition-opacity duration-300 ${showControls ? 'opacity-100' : 'opacity-0'}`}
        >
          <div className="flex items-center justify-between">
            <div className="text-sm text-white/90 truncate max-w-[70%]">{filename}</div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-white/20 rounded-lg transition"
              title="Close"
            >
              <X size={20} />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default FloatingVideoPlayer
