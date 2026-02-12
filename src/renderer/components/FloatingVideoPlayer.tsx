// File: src/renderer/components/FloatingVideoPlayer.tsx
// Floating Picture-in-Picture style video player with fullscreen support


import React, { useState, useRef, useEffect, useCallback } from 'react'
import { X, ChevronLeft, ChevronRight, Maximize2, Minimize2, Volume2, VolumeX, FolderOpen, Play, Pause, Sparkles, Heart, Settings2, Tv, Ban, Cast, Loader2, Monitor, StopCircle } from 'lucide-react'

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
  const prevVolumeRef = useRef(0.5) // Remember volume before muting/zeroing
  const [isPaused, setIsPaused] = useState(false)
  const [showControls, setShowControls] = useState(true)
  const [isLoading, setIsLoading] = useState(true)
  const [hasError, setHasError] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [showVolumeSlider, setShowVolumeSlider] = useState(false)
  const [volumeDragging, setVolumeDragging] = useState(false)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [analysisResult, setAnalysisResult] = useState<string | null>(null)
  const [isLiked, setIsLiked] = useState(false)
  const [transcodeRetried, setTranscodeRetried] = useState(false)
  const [showQualityMenu, setShowQualityMenu] = useState(false)
  const [currentResolution, setCurrentResolution] = useState<string>(() => {
    // Load persisted resolution from localStorage
    return localStorage.getItem('vault-video-resolution') || 'original'
  })
  const [lowQualityMode, setLowQualityMode] = useState(() => {
    return localStorage.getItem('vault-low-quality-mode') === 'true'
  })
  const [lowQualityIntensity, setLowQualityIntensity] = useState(5)
  // Scene markers state
  const [markers, setMarkers] = useState<Array<{ id: string; timeSec: number; title: string }>>([])
  const [showMarkerInput, setShowMarkerInput] = useState<{ timeSec: number } | null>(null)
  const [newMarkerTitle, setNewMarkerTitle] = useState('')
  // DLNA casting state
  const [showCastMenu, setShowCastMenu] = useState(false)
  const [dlnaDevices, setDlnaDevices] = useState<Array<{ id: string; name: string; host: string; type: string; status: string }>>([])
  const [isScanning, setIsScanning] = useState(false)
  const [isCasting, setIsCasting] = useState(false)
  const [activeDevice, setActiveDevice] = useState<{ id: string; name: string } | null>(null)
  const [castError, setCastError] = useState<string | null>(null)
  // Image zoom and pan state
  const [imageZoom, setImageZoom] = useState(1)
  const [imagePan, setImagePan] = useState({ x: 0, y: 0 })
  const [isPanning, setIsPanning] = useState(false)
  const [panStart, setPanStart] = useState({ x: 0, y: 0, panX: 0, panY: 0 })
  const imageContainerRef = useRef<HTMLDivElement>(null)
  const errorHandled = useRef(false) // Prevent duplicate error handling
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

  // Load video URL - respect persisted resolution setting
  useEffect(() => {
    let alive = true
    setIsLoading(true)
    setHasError(false)
    aspectRatioSet.current = false // Reset for new video
    setTranscodeRetried(false)
    errorHandled.current = false
    ;(async () => {
      try {
        // Check if we have a non-original resolution set
        if (currentResolution !== 'original') {
          const heightMap: Record<string, number> = {
            '1080p': 1080,
            '720p': 720,
            '480p': 480,
            '360p': 360,
            '240p': 240,
          }
          const targetHeight = heightMap[currentResolution] || 720
          const u = await window.api.media.getLowResUrl?.(media.id, targetHeight)
          if (alive && u) {
            setUrl(u as string)
            return
          }
        }
        // Load original or fallback
        const u = await window.api.media.getPlayableUrl(media.id)
        if (alive && u) {
          setUrl(u as string)
          return
        }
      } catch {}
      // Fallback to direct file URL
      const u = await toFileUrlCached(media.path)
      if (alive) setUrl(u)
    })()
    return () => { alive = false }
  }, [media.id, media.path, currentResolution])

  // Apply volume to video element
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.volume = volume
      videoRef.current.muted = isMuted
    }
  }, [volume, isMuted])

  // Navigation functions (declared before hooks that reference them)
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

  // Image zoom handlers
  const handleImageWheel = useCallback((e: React.WheelEvent) => {
    if (media.type === 'video') return
    e.preventDefault()
    e.stopPropagation()
    const delta = e.deltaY > 0 ? -0.1 : 0.1
    setImageZoom(prev => Math.max(0.5, Math.min(5, prev + delta)))
  }, [media.type])

  const handleImageDoubleClick = useCallback(() => {
    if (media.type === 'video') return
    // Toggle between fit (1x) and 100% (actual size or 2x for small images)
    if (imageZoom === 1) {
      setImageZoom(2)
      setImagePan({ x: 0, y: 0 })
    } else {
      setImageZoom(1)
      setImagePan({ x: 0, y: 0 })
    }
  }, [media.type, imageZoom])

  const handleImageMouseDown = useCallback((e: React.MouseEvent) => {
    if (media.type === 'video' || imageZoom <= 1) return
    e.preventDefault()
    setIsPanning(true)
    setPanStart({ x: e.clientX, y: e.clientY, panX: imagePan.x, panY: imagePan.y })
  }, [media.type, imageZoom, imagePan])

  const handleImageMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isPanning) return
    const dx = e.clientX - panStart.x
    const dy = e.clientY - panStart.y
    setImagePan({ x: panStart.panX + dx, y: panStart.panY + dy })
  }, [isPanning, panStart])

  const handleImageMouseUp = useCallback(() => {
    setIsPanning(false)
  }, [])

  // Reset zoom/pan when media changes
  useEffect(() => {
    setImageZoom(1)
    setImagePan({ x: 0, y: 0 })
  }, [media.id])

  // Record view
  useEffect(() => {
    window.api.media.recordView(media.id)
  }, [media.id])

  // Load markers for current media
  useEffect(() => {
    if (media.type !== 'video') {
      setMarkers([])
      return
    }
    window.api.markers?.list?.(media.id)
      .then((m: any) => setMarkers(m || []))
      .catch(() => setMarkers([]))
  }, [media.id, media.type])

  // Preload next 3 videos for smoother navigation
  useEffect(() => {
    if (currentIndex < 0 || mediaList.length === 0) return

    const preloadPromises: Promise<void>[] = []
    for (let i = 1; i <= 3; i++) {
      const nextIdx = currentIndex + i
      if (nextIdx < mediaList.length) {
        const nextMedia = mediaList[nextIdx]
        // Preload the URL (just warm the cache, don't store result)
        preloadPromises.push(
          window.api.media.getPlayableUrl(nextMedia.id).catch(() => {})
        )
      }
    }

    // Execute preloads in parallel
    Promise.all(preloadPromises)
  }, [currentIndex, mediaList])

  // Loading timeout - if video doesn't load within 10 seconds, auto-skip or show error
  useEffect(() => {
    if (!isLoading || hasError) return
    const timeout = setTimeout(() => {
      if (isLoading && !hasError) {
        console.warn('[FloatingPlayer] Loading timeout, auto-skipping:', media.path)
        if (hasNext) { goToNext(); return }
        setHasError(true)
        setIsLoading(false)
      }
    }, 10000)
    return () => clearTimeout(timeout)
  }, [isLoading, hasError, media.path, hasNext, goToNext])

  // Handle video events
  const handleCanPlay = useCallback(() => {
    setIsLoading(false)
    setHasError(false)
    errorHandled.current = false
    if (videoRef.current) {
      setDuration(videoRef.current.duration)
      // Apply initial volume
      videoRef.current.volume = volume
      videoRef.current.muted = isMuted
    }
  }, [isMuted, volume])

  const handleError = useCallback((e: React.SyntheticEvent<HTMLVideoElement | HTMLImageElement>) => {
    // Prevent duplicate error handling (video element fires error multiple times)
    if (errorHandled.current) return
    errorHandled.current = true

    const target = e.currentTarget
    if ('error' in target && target.error) {
      const videoError = target.error as MediaError
      const errorType = ['', 'ABORTED', 'NETWORK', 'DECODE', 'SRC_NOT_SUPPORTED'][videoError.code] || 'UNKNOWN'
      console.warn('[FloatingPlayer] Video error:', { path: media.path, code: videoError.code, errorType })

      // Retry with force transcode if not already retried and it's a decode/format error
      if (!transcodeRetried && (videoError.code === 3 || videoError.code === 4)) {
        setTranscodeRetried(true)
        errorHandled.current = false // Allow one more error after transcode retry
        window.api.media.getPlayableUrl(media.id, true).then((u: any) => {
          if (u) {
            setUrl(u as string)
            setHasError(false)
            setIsLoading(true)
            return
          }
          // Transcode failed — auto-skip to next video
          if (hasNext) { goToNext(); return }
          setIsLoading(false)
          setHasError(true)
        }).catch(() => {
          if (hasNext) { goToNext(); return }
          setIsLoading(false)
          setHasError(true)
        })
        return
      }
    } else {
      console.warn('[FloatingPlayer] Media error:', media.path)
    }
    // Auto-skip to next if available
    if (hasNext) { goToNext(); return }
    setIsLoading(false)
    setHasError(true)
  }, [media.path, media.id, transcodeRetried, hasNext, goToNext])

  const handleTimeUpdate = useCallback(() => {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime)
    }
  }, [])

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

  const handleToggleLike = useCallback(async () => {
    const wasLiked = isLiked
    const newRating = wasLiked ? 0 : 5
    setIsLiked(!wasLiked)
    try {
      await window.api.media.setRating(media.id, newRating)
    } catch (err) {
      console.error('[FloatingPlayer] Like failed:', err)
      setIsLiked(wasLiked)
    }
  }, [isLiked, media.id])

  const handleBlacklist = useCallback(async () => {
    try {
      await window.api.settings.blacklist?.addMedia?.(media.id)
      // Move to next item and close if this was the only one
      const currentIndex = mediaList.findIndex(m => m.id === media.id)
      if (mediaList.length > 1) {
        const nextIndex = currentIndex < mediaList.length - 1 ? currentIndex + 1 : currentIndex - 1
        onMediaChange(mediaList[nextIndex].id)
      } else {
        onClose()
      }
    } catch (err) {
      console.error('[FloatingPlayer] Blacklist failed:', err)
    }
  }, [media.id, mediaList, onMediaChange, onClose])

  // DLNA casting handlers
  const handleOpenCastMenu = useCallback(async () => {
    setShowCastMenu(true)
    setCastError(null)
    setIsScanning(true)

    try {
      // Start discovery
      await window.api.dlna?.startDiscovery?.()
      // Get initial devices
      const devices = await window.api.dlna?.getDevices?.() || []
      setDlnaDevices(devices)
    } catch (err: any) {
      console.error('[DLNA] Discovery error:', err)
      setCastError(err.message || 'Failed to scan for devices')
    } finally {
      setIsScanning(false)
    }
  }, [])

  const handleCloseCastMenu = useCallback(async () => {
    setShowCastMenu(false)
    setCastError(null)
    try {
      await window.api.dlna?.stopDiscovery?.()
    } catch {}
  }, [])

  const handleCastToDevice = useCallback(async (deviceId: string, deviceName: string) => {
    if (media.type !== 'video') return

    setCastError(null)
    setIsCasting(true)

    try {
      // Pause local playback
      if (videoRef.current) {
        videoRef.current.pause()
        setIsPaused(true)
      }

      const result = await window.api.dlna?.cast?.(deviceId, media.path, {
        title: media.filename || 'Vault Video',
        type: 'video',
        autoplay: true,
        startPosition: currentTime
      })

      if (result?.success) {
        setActiveDevice({ id: deviceId, name: deviceName })
        setShowCastMenu(false)
      } else {
        setCastError(result?.error || 'Failed to cast')
        setIsCasting(false)
      }
    } catch (err: any) {
      console.error('[DLNA] Cast error:', err)
      setCastError(err.message || 'Cast failed')
      setIsCasting(false)
    }
  }, [media.type, media.path, media.filename, currentTime])

  const handleStopCasting = useCallback(async () => {
    try {
      await window.api.dlna?.stop?.()
      setIsCasting(false)
      setActiveDevice(null)
      // Resume local playback
      if (videoRef.current) {
        videoRef.current.play()
        setIsPaused(false)
      }
    } catch (err) {
      console.error('[DLNA] Stop cast error:', err)
    }
  }, [])

  // Listen for DLNA device discoveries
  useEffect(() => {
    if (!showCastMenu) return

    const unsubscribe = window.api.dlna?.onDeviceFound?.((device: any) => {
      setDlnaDevices(prev => {
        const exists = prev.some(d => d.id === device.id)
        if (exists) return prev
        return [...prev, device]
      })
    })

    return () => {
      unsubscribe?.()
    }
  }, [showCastMenu])

  // Check casting status on mount
  useEffect(() => {
    window.api.dlna?.isCasting?.().then((casting: boolean) => {
      setIsCasting(casting)
      if (casting) {
        window.api.dlna?.getActiveDevice?.().then((device: any) => {
          if (device) {
            setActiveDevice({ id: device.id, name: device.name })
          }
        })
      }
    }).catch(() => {})
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
        if (isMuted || volume === 0) {
          const restored = prevVolumeRef.current > 0 ? prevVolumeRef.current : 0.5
          setVolume(restored)
          setIsMuted(false)
        } else {
          prevVolumeRef.current = volume
          setIsMuted(true)
        }
      } else if (e.key === 'f' || e.key === 'F') {
        toggleFullscreen()
      } else if (e.key === 'l' || e.key === 'L') {
        handleToggleLike()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [goToPrev, goToNext, onClose, isFullscreen, togglePlay, handleToggleLike])

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

  // Load liked status when media changes
  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const stats = await window.api.media.getStats(media.id)
        if (alive) setIsLiked((stats?.rating ?? 0) >= 5)
      } catch {}
    })()
    return () => { alive = false }
  }, [media.id])

  // Load playback settings for quality mode
  useEffect(() => {
    ;(async () => {
      try {
        const settings = await window.api.settings.get()
        const playback = settings?.playback || {}
        setLowQualityMode(playback.lowQualityMode ?? false)
        setLowQualityIntensity(playback.lowQualityIntensity ?? 5)
        if (playback.defaultResolution && playback.defaultResolution !== 'original') {
          setCurrentResolution(playback.defaultResolution)
        }
      } catch {}
    })()
  }, [])

  // Handle resolution change - persists across all videos
  const handleResolutionChange = useCallback(async (resolution: string) => {
    setCurrentResolution(resolution)
    localStorage.setItem('vault-video-resolution', resolution)
    setShowQualityMenu(false)
    setIsLoading(true)
    setHasError(false)
    errorHandled.current = false

    try {
      if (resolution === 'original') {
        // Load original quality
        const u = await window.api.media.getPlayableUrl(media.id)
        if (u) {
          setUrl(u as string)
          return
        }
      } else {
        // Request transcoded version at specific resolution
        const heightMap: Record<string, number> = {
          '1080p': 1080,
          '720p': 720,
          '480p': 480,
          '360p': 360,
          '240p': 240,
        }
        const targetHeight = heightMap[resolution] || 720
        const u = await window.api.media.getLowResUrl?.(media.id, targetHeight)
        if (u) {
          setUrl(u as string)
          return
        }
      }
      // Fallback to original if transcoding fails
      const u = await toFileUrlCached(media.path)
      setUrl(u)
    } catch (e) {
      console.error('[FloatingPlayer] Resolution change failed:', e)
      const u = await toFileUrlCached(media.path)
      setUrl(u)
    }
  }, [media.id, media.path])

  // Toggle low quality mode
  const toggleLowQualityMode = useCallback(() => {
    const newValue = !lowQualityMode
    setLowQualityMode(newValue)
    localStorage.setItem('vault-low-quality-mode', String(newValue))
  }, [lowQualityMode])

  const handleRevealInFolder = async () => {
    await window.api.shell.showItemInFolder(media.path)
  }

  // Deep AI Analysis for this video - includes tagging, scene detection, and file renaming
  const handleAiAnalyze = async () => {
    if (media.type !== 'video') return
    setIsAnalyzing(true)
    setAnalysisResult(null)
    const results: string[] = []

    try {
      // Step 1: Run AI tagging
      const tagResult = await window.api.aiTools?.generateTags?.(media.id)
      if (tagResult?.success && tagResult.applied > 0) {
        results.push(`${tagResult.applied} tags`)
      }

      // Step 2: Run deep video analysis
      const analysisRes = await window.api.videoAnalysis?.analyze?.(media.id)
      if (analysisRes?.success) {
        const scenes = analysisRes.analysis?.scenes?.length ?? 0
        if (scenes > 0) results.push(`${scenes} scenes`)
      }

      // Step 3: Suggest and apply AI filename
      const renameResult = await window.api.aiTools?.suggestFilename?.(media.id)
      if (renameResult?.success && renameResult.suggestedName) {
        results.push(`renamed`)
      }

      setAnalysisResult(results.length > 0 ? `AI: ${results.join(', ')}` : 'Analysis complete')

      // Auto-hide result after 5 seconds
      setTimeout(() => setAnalysisResult(null), 5000)
    } catch (e: any) {
      console.error('[AI Analyze] Error:', e)
      setAnalysisResult(`Error: ${e.message}`)
      setTimeout(() => setAnalysisResult(null), 3000)
    } finally {
      setIsAnalyzing(false)
    }
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

      {/* AI Analysis Result */}
      {analysisResult && (
        <div className="absolute top-12 left-1/2 -translate-x-1/2 px-4 py-2 bg-purple-500/90 text-white text-sm rounded-lg shadow-lg z-30 animate-fade-in">
          <div className="flex items-center gap-2">
            <Sparkles size={14} />
            {analysisResult}
          </div>
        </div>
      )}

      {/* AI Analyzing Overlay */}
      {isAnalyzing && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/50 z-25">
          <div className="flex flex-col items-center gap-3">
            <Sparkles size={32} className="text-purple-400 animate-pulse" />
            <div className="text-white text-sm">AI Analyzing...</div>
          </div>
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
            style={lowQualityMode ? {
              filter: `blur(${lowQualityIntensity * 0.15}px) contrast(${1 + lowQualityIntensity * 0.05}) saturate(${Math.max(0.5, 1 - lowQualityIntensity * 0.05)})`,
              imageRendering: lowQualityIntensity > 5 ? 'pixelated' : 'auto',
            } : undefined}
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
          <div
            ref={imageContainerRef}
            className="w-full h-full bg-black overflow-hidden"
            onWheel={handleImageWheel}
            onDoubleClick={handleImageDoubleClick}
            onMouseDown={handleImageMouseDown}
            onMouseMove={handleImageMouseMove}
            onMouseUp={handleImageMouseUp}
            onMouseLeave={handleImageMouseUp}
            style={{ cursor: imageZoom > 1 ? (isPanning ? 'grabbing' : 'grab') : 'zoom-in' }}
          >
            <img
              src={url}
              alt={filename}
              className="w-full h-full object-contain select-none"
              draggable={false}
              style={{
                transform: `scale(${imageZoom}) translate(${imagePan.x / imageZoom}px, ${imagePan.y / imageZoom}px)`,
                transformOrigin: 'center center',
                transition: isPanning ? 'none' : 'transform 0.1s ease-out',
                ...(lowQualityMode ? {
                  filter: `blur(${lowQualityIntensity * 0.2}px) contrast(${1 + lowQualityIntensity * 0.05}) saturate(${Math.max(0.5, 1 - lowQualityIntensity * 0.05)})`,
                  imageRendering: lowQualityIntensity > 5 ? 'pixelated' : 'auto',
                } : {})
              }}
              onLoad={() => setIsLoading(false)}
              onError={handleError}
            />
            {/* Zoom level indicator */}
            {imageZoom !== 1 && (
              <div className="absolute bottom-16 left-1/2 -translate-x-1/2 px-3 py-1 bg-black/70 rounded-full text-xs text-white/80 backdrop-blur-sm">
                {Math.round(imageZoom * 100)}%
              </div>
            )}
          </div>
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
            className="w-full h-1.5 bg-white/20 rounded-full mb-3 cursor-pointer group relative"
            onClick={handleProgressClick}
            onContextMenu={(e) => {
              e.preventDefault()
              if (progressRef.current && duration > 0) {
                const rect = progressRef.current.getBoundingClientRect()
                const percent = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
                const timeSec = percent * duration
                setShowMarkerInput({ timeSec })
                setNewMarkerTitle('')
              }
            }}
          >
            {/* Progress fill */}
            <div
              className="h-full bg-white/80 rounded-full relative"
              style={{ width: `${(currentTime / duration) * 100}%` }}
            >
              <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full opacity-0 group-hover:opacity-100 transition" />
            </div>
            {/* Markers */}
            {markers.map((marker) => (
              <div
                key={marker.id}
                className="absolute top-1/2 -translate-y-1/2 w-2 h-2 bg-amber-400 rounded-full cursor-pointer hover:scale-150 transition z-10"
                style={{ left: `${(marker.timeSec / duration) * 100}%`, marginLeft: '-4px' }}
                title={`${marker.title} (${formatDuration(marker.timeSec)})`}
                onClick={(e) => {
                  e.stopPropagation()
                  if (videoRef.current) {
                    videoRef.current.currentTime = marker.timeSec
                  }
                }}
              />
            ))}
          </div>
        )}

        {/* Marker input popup */}
        {showMarkerInput && (
          <div className="absolute bottom-16 left-1/2 -translate-x-1/2 bg-black/95 backdrop-blur-xl rounded-xl border border-white/20 p-3 z-50 min-w-[200px]">
            <div className="text-xs text-white/60 mb-2">
              Add marker at {formatDuration(showMarkerInput.timeSec)}
            </div>
            <input
              type="text"
              value={newMarkerTitle}
              onChange={(e) => setNewMarkerTitle(e.target.value)}
              placeholder="Marker title..."
              className="w-full px-2 py-1.5 text-xs bg-white/10 border border-white/20 rounded-lg outline-none focus:border-white/40 mb-2"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter' && newMarkerTitle.trim()) {
                  window.api.markers?.upsert?.({
                    mediaId: media.id,
                    timeSec: showMarkerInput.timeSec,
                    title: newMarkerTitle.trim()
                  }).then(() => {
                    // Reload markers
                    return window.api.markers?.list?.(media.id)
                  }).then((m: any) => {
                    setMarkers(m || [])
                    setShowMarkerInput(null)
                    setNewMarkerTitle('')
                  })
                } else if (e.key === 'Escape') {
                  setShowMarkerInput(null)
                }
              }}
            />
            <div className="flex gap-2">
              <button
                onClick={() => {
                  if (!newMarkerTitle.trim()) return
                  window.api.markers?.upsert?.({
                    mediaId: media.id,
                    timeSec: showMarkerInput.timeSec,
                    title: newMarkerTitle.trim()
                  }).then(() => window.api.markers?.list?.(media.id))
                    .then((m: any) => {
                      setMarkers(m || [])
                      setShowMarkerInput(null)
                      setNewMarkerTitle('')
                    })
                }}
                className="flex-1 px-3 py-1.5 text-xs bg-amber-500/80 hover:bg-amber-500 rounded-lg transition"
              >
                Add
              </button>
              <button
                onClick={() => setShowMarkerInput(null)}
                className="px-3 py-1.5 text-xs bg-white/10 hover:bg-white/20 rounded-lg transition"
              >
                Cancel
              </button>
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
                onMouseLeave={() => { if (!volumeDragging) setShowVolumeSlider(false) }}
              >
                <button
                  onClick={() => {
                    if (isMuted || volume === 0) {
                      // Unmute: restore previous volume
                      const restored = prevVolumeRef.current > 0 ? prevVolumeRef.current : 0.5
                      setVolume(restored)
                      setIsMuted(false)
                    } else {
                      // Mute: save current volume and mute
                      prevVolumeRef.current = volume
                      setIsMuted(true)
                    }
                  }}
                  onMouseEnter={() => setShowVolumeSlider(true)}
                  className="p-2 rounded-lg bg-white/10 hover:bg-white/20 transition"
                  title={isMuted || volume === 0 ? 'Click to unmute (M)' : 'Click to mute (M)'}
                >
                  {isMuted || volume === 0 ? <VolumeX size={16} /> : <Volume2 size={16} />}
                </button>
                {/* Volume slider */}
                {showVolumeSlider && (
                  <div
                    className="no-drag absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-3 py-3 bg-black/90 rounded-lg border border-white/20"
                    onMouseDown={(e) => e.stopPropagation()}
                    onMouseMove={(e) => e.stopPropagation()}
                    onMouseUp={(e) => e.stopPropagation()}
                    onPointerDown={(e) => e.stopPropagation()}
                    onPointerMove={(e) => e.stopPropagation()}
                    onPointerUp={(e) => e.stopPropagation()}
                  >
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.01"
                      value={volume}
                      onInput={(e) => {
                        const v = parseFloat((e.target as HTMLInputElement).value)
                        if (v > 0) prevVolumeRef.current = v
                        setVolume(v)
                        if (v > 0 && isMuted) setIsMuted(false)
                      }}
                      onChange={(e) => {
                        const v = parseFloat(e.target.value)
                        if (v > 0) prevVolumeRef.current = v
                        setVolume(v)
                        if (v > 0 && isMuted) setIsMuted(false)
                      }}
                      onMouseDown={(e) => {
                        e.stopPropagation()
                        setVolumeDragging(true)
                      }}
                      onMouseUp={() => setVolumeDragging(false)}
                      onPointerDown={(e) => {
                        e.stopPropagation()
                        e.currentTarget.setPointerCapture(e.pointerId)
                        setVolumeDragging(true)
                      }}
                      onPointerUp={(e) => {
                        e.currentTarget.releasePointerCapture(e.pointerId)
                        setVolumeDragging(false)
                      }}
                      onLostPointerCapture={() => setVolumeDragging(false)}
                      className="volume-slider w-24 cursor-pointer"
                      style={{
                        writingMode: 'horizontal-tb',
                        background: `linear-gradient(to right, rgba(255,255,255,0.8) ${volume * 100}%, rgba(255,255,255,0.2) ${volume * 100}%)`
                      }}
                    />
                    <div className="text-[10px] text-white/60 text-center mt-1">{Math.round(volume * 100)}%</div>
                  </div>
                )}
                {/* Transparent bridge to prevent mouseLeave gap */}
                {showVolumeSlider && (
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 w-12 h-2" />
                )}
              </div>
            )}

            <button
              onClick={handleToggleLike}
              className={`p-2 rounded-lg transition ${isLiked ? 'bg-pink-500/80 shadow-[0_0_12px_rgba(236,72,153,0.5)]' : 'bg-white/10 hover:bg-pink-500/60'}`}
              title={isLiked ? 'Unlike (L)' : 'Like (L)'}
            >
              <Heart size={16} className={isLiked ? 'fill-current' : ''} />
            </button>

            <button
              onClick={handleBlacklist}
              className="p-2 rounded-lg bg-white/10 hover:bg-red-500/60 transition"
              title="Blacklist this item"
            >
              <Ban size={16} />
            </button>

            <button
              onClick={handleRevealInFolder}
              className="p-2 rounded-lg bg-white/10 hover:bg-white/20 transition"
              title="Show in folder"
            >
              <FolderOpen size={16} />
            </button>

            {/* Low Quality Mode Toggle */}
            <button
              onClick={toggleLowQualityMode}
              className={`p-2 rounded-lg transition ${lowQualityMode ? 'bg-amber-500/70 shadow-[0_0_10px_rgba(245,158,11,0.4)]' : 'bg-white/10 hover:bg-white/20'}`}
              title={lowQualityMode ? 'Low Quality Mode ON (click to disable)' : 'Enable Low Quality Mode'}
            >
              <Tv size={16} />
            </button>

            {/* Quality/Resolution Selector */}
            {media.type === 'video' && (
              <div className="relative">
                <button
                  onClick={() => setShowQualityMenu(!showQualityMenu)}
                  className={`p-2 rounded-lg transition ${showQualityMenu ? 'bg-white/30' : 'bg-white/10 hover:bg-white/20'}`}
                  title="Video Quality"
                >
                  <Settings2 size={16} />
                </button>
                {showQualityMenu && (
                  <div
                    className="absolute bottom-full right-0 mb-2 py-2 bg-black/95 rounded-xl border border-white/20 shadow-2xl min-w-[140px] z-50"
                    onMouseLeave={() => setShowQualityMenu(false)}
                  >
                    <div className="px-3 py-1 text-[10px] text-white/50 uppercase tracking-wider">Quality</div>
                    {['original', '1080p', '720p', '480p', '360p', '240p'].map((res) => (
                      <button
                        key={res}
                        onClick={() => handleResolutionChange(res)}
                        className={`w-full px-3 py-1.5 text-left text-sm transition hover:bg-white/10 flex items-center justify-between ${
                          currentResolution === res ? 'text-[var(--primary)]' : 'text-white/80'
                        }`}
                      >
                        <span>{res === 'original' ? 'Original' : res}</span>
                        {currentResolution === res && <span className="text-xs">✓</span>}
                      </button>
                    ))}
                    {lowQualityMode && (
                      <>
                        <div className="border-t border-white/10 my-1" />
                        <div className="px-3 py-1 text-[10px] text-pink-400/80">
                          Low Quality Mode Active
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* DLNA Cast Button */}
            {media.type === 'video' && (
              <div className="relative">
                {isCasting && activeDevice ? (
                  <button
                    onClick={handleStopCasting}
                    className="p-2 rounded-lg bg-blue-500/80 hover:bg-red-500/80 transition shadow-[0_0_12px_rgba(59,130,246,0.5)]"
                    title={`Casting to ${activeDevice.name} - Click to stop`}
                  >
                    <StopCircle size={16} />
                  </button>
                ) : (
                  <button
                    onClick={handleOpenCastMenu}
                    className={`p-2 rounded-lg transition ${showCastMenu ? 'bg-blue-500/80' : 'bg-white/10 hover:bg-blue-500/60'}`}
                    title="Cast to TV"
                  >
                    <Cast size={16} />
                  </button>
                )}
              </div>
            )}

            {media.type === 'video' && (
              <button
                onClick={handleAiAnalyze}
                disabled={isAnalyzing}
                className={`p-2 rounded-lg transition ${isAnalyzing ? 'bg-purple-500/50 animate-pulse' : 'bg-purple-500/60 hover:bg-purple-500/80'}`}
                title="AI Deep Analysis"
              >
                <Sparkles size={16} className={isAnalyzing ? 'animate-spin' : ''} />
              </button>
            )}

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

      {/* DLNA Cast Menu Modal */}
      {showCastMenu && (
        <div
          className="absolute inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center"
          onClick={handleCloseCastMenu}
        >
          <div
            className="bg-zinc-900 rounded-2xl border border-white/20 shadow-2xl w-[90%] max-w-[360px] max-h-[80%] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
              <div className="flex items-center gap-2">
                <Cast size={18} className="text-blue-400" />
                <span className="font-medium">Cast to TV</span>
              </div>
              <button
                onClick={handleCloseCastMenu}
                className="p-1 hover:bg-white/10 rounded-lg transition"
              >
                <X size={18} />
              </button>
            </div>

            {/* Content */}
            <div className="p-4 max-h-[400px] overflow-y-auto">
              {/* Casting indicator */}
              {isCasting && activeDevice && (
                <div className="mb-4 p-3 bg-blue-500/20 border border-blue-500/30 rounded-xl">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Monitor size={16} className="text-blue-400" />
                      <span className="text-sm">Casting to {activeDevice.name}</span>
                    </div>
                    <button
                      onClick={handleStopCasting}
                      className="px-3 py-1 text-xs bg-red-500/80 hover:bg-red-500 rounded-lg transition"
                    >
                      Stop
                    </button>
                  </div>
                </div>
              )}

              {/* Error message */}
              {castError && (
                <div className="mb-4 p-3 bg-red-500/20 border border-red-500/30 rounded-xl text-sm text-red-300">
                  {castError}
                </div>
              )}

              {/* Scanning indicator */}
              {isScanning && (
                <div className="flex items-center justify-center gap-2 py-4 text-white/60">
                  <Loader2 size={18} className="animate-spin" />
                  <span className="text-sm">Scanning for devices...</span>
                </div>
              )}

              {/* Device list */}
              {dlnaDevices.length > 0 ? (
                <div className="space-y-2">
                  <div className="text-xs text-white/50 uppercase tracking-wider mb-2">
                    Available Devices
                  </div>
                  {dlnaDevices.map((device) => (
                    <button
                      key={device.id}
                      onClick={() => handleCastToDevice(device.id, device.name)}
                      disabled={isCasting && activeDevice?.id === device.id}
                      className={`w-full flex items-center gap-3 p-3 rounded-xl transition ${
                        isCasting && activeDevice?.id === device.id
                          ? 'bg-blue-500/30 border border-blue-500/50'
                          : 'bg-white/5 hover:bg-white/10 border border-white/10'
                      }`}
                    >
                      <Monitor size={20} className={
                        isCasting && activeDevice?.id === device.id ? 'text-blue-400' : 'text-white/60'
                      } />
                      <div className="flex-1 text-left">
                        <div className="text-sm font-medium">{device.name}</div>
                        <div className="text-xs text-white/40">{device.host}</div>
                      </div>
                      {isCasting && activeDevice?.id === device.id && (
                        <div className="text-xs text-blue-400">Playing</div>
                      )}
                    </button>
                  ))}
                </div>
              ) : !isScanning ? (
                <div className="text-center py-8 text-white/40">
                  <Monitor size={32} className="mx-auto mb-2 opacity-50" />
                  <div className="text-sm">No devices found</div>
                  <div className="text-xs mt-1">Make sure your TV is on the same network</div>
                  <button
                    onClick={handleOpenCastMenu}
                    className="mt-4 px-4 py-2 text-sm bg-white/10 hover:bg-white/20 rounded-lg transition"
                  >
                    Scan Again
                  </button>
                </div>
              ) : null}
            </div>

            {/* Footer */}
            <div className="px-4 py-3 border-t border-white/10 bg-white/5">
              <div className="text-[10px] text-white/40 text-center">
                Supports DLNA/UPnP compatible TVs and devices
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default FloatingVideoPlayer
