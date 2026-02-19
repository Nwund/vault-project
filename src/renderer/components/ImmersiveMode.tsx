// File: src/renderer/components/ImmersiveMode.tsx
// Full-screen immersive mode with minimal UI and gesture controls

import React, { useState, useEffect, useCallback, useRef } from 'react'
import {
  X,
  ChevronLeft,
  ChevronRight,
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize,
  Minimize,
  Heart,
  Star,
  Clock,
  Eye,
  Settings,
  Keyboard,
  Shuffle
} from 'lucide-react'
import { toFileUrlCached } from '../hooks/usePerformance'
import { formatDuration } from '../utils/formatters'

interface MediaItem {
  id: string
  path: string
  filename: string
  thumbPath?: string | null
  type: 'video' | 'image' | 'gif'
  durationSec?: number | null
  rating?: number
  isFavorite?: boolean
}

interface ImmersiveModeProps {
  media: MediaItem
  mediaList: MediaItem[]
  onClose: () => void
  onMediaChange: (mediaId: string) => void
  onToggleFavorite?: (mediaId: string) => void
  onRate?: (mediaId: string, rating: number) => void
}

export function ImmersiveMode({
  media,
  mediaList,
  onClose,
  onMediaChange,
  onToggleFavorite,
  onRate
}: ImmersiveModeProps) {
  const [url, setUrl] = useState('')
  const [isPlaying, setIsPlaying] = useState(true)
  const [isMuted, setIsMuted] = useState(false)
  const [volume, setVolume] = useState(0.7)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [showControls, setShowControls] = useState(false)
  const [showHints, setShowHints] = useState(true)
  const [isLoading, setIsLoading] = useState(true)
  const [autoAdvance, setAutoAdvance] = useState(true)
  const [autoAdvanceDelay, setAutoAdvanceDelay] = useState(8) // seconds for images
  const [slideTimer, setSlideTimer] = useState<NodeJS.Timeout | null>(null)
  const [sessionTime, setSessionTime] = useState(0)
  const [viewCount, setViewCount] = useState(0)

  const videoRef = useRef<HTMLVideoElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const hideControlsTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastMouseMove = useRef<number>(Date.now())

  const currentIndex = mediaList.findIndex(m => m.id === media.id)
  const hasPrev = currentIndex > 0
  const hasNext = currentIndex < mediaList.length - 1

  // Load media URL
  useEffect(() => {
    setIsLoading(true)
    toFileUrlCached(media.path).then(setUrl).catch(() => {})
    setViewCount(prev => prev + 1)
  }, [media.path])

  // Session timer
  useEffect(() => {
    const interval = setInterval(() => {
      setSessionTime(prev => prev + 1)
    }, 1000)
    return () => clearInterval(interval)
  }, [])

  // Hide hints after initial display
  useEffect(() => {
    const timeout = setTimeout(() => setShowHints(false), 4000)
    return () => clearTimeout(timeout)
  }, [])

  // Auto-hide controls
  const resetControlsTimeout = useCallback(() => {
    if (hideControlsTimeout.current) {
      clearTimeout(hideControlsTimeout.current)
    }
    setShowControls(true)
    hideControlsTimeout.current = setTimeout(() => {
      setShowControls(false)
    }, 2500)
  }, [])

  // Mouse movement detection
  const handleMouseMove = useCallback(() => {
    lastMouseMove.current = Date.now()
    resetControlsTimeout()
  }, [resetControlsTimeout])

  // Image auto-advance timer
  useEffect(() => {
    if (media.type !== 'video' && autoAdvance && hasNext) {
      const timer = setTimeout(() => {
        navigateNext()
      }, autoAdvanceDelay * 1000)
      setSlideTimer(timer)
      return () => clearTimeout(timer)
    }
    return () => {
      if (slideTimer) clearTimeout(slideTimer)
    }
  }, [media.id, media.type, autoAdvance, autoAdvanceDelay, hasNext])

  // Navigation
  const navigateNext = useCallback(() => {
    if (hasNext) {
      onMediaChange(mediaList[currentIndex + 1].id)
    }
  }, [currentIndex, hasNext, mediaList, onMediaChange])

  const navigatePrev = useCallback(() => {
    if (hasPrev) {
      onMediaChange(mediaList[currentIndex - 1].id)
    }
  }, [currentIndex, hasPrev, mediaList, onMediaChange])

  const navigateRandom = useCallback(() => {
    if (mediaList.length <= 1) return
    let randomIndex: number
    do {
      randomIndex = Math.floor(Math.random() * mediaList.length)
    } while (randomIndex === currentIndex)
    onMediaChange(mediaList[randomIndex].id)
  }, [currentIndex, mediaList, onMediaChange])

  // Video controls
  const togglePlay = useCallback(() => {
    if (!videoRef.current) return
    if (videoRef.current.paused) {
      videoRef.current.play()
      setIsPlaying(true)
    } else {
      videoRef.current.pause()
      setIsPlaying(false)
    }
  }, [])

  const toggleMute = useCallback(() => {
    if (!videoRef.current) return
    videoRef.current.muted = !videoRef.current.muted
    setIsMuted(videoRef.current.muted)
  }, [])

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return

      switch (e.key.toLowerCase()) {
        case 'escape':
          onClose()
          break
        case 'arrowleft':
        case 'h':
          navigatePrev()
          break
        case 'arrowright':
        case 'l':
          navigateNext()
          break
        case ' ':
        case 'k':
          e.preventDefault()
          togglePlay()
          break
        case 'm':
          toggleMute()
          break
        case 'f':
          if (onToggleFavorite) {
            onToggleFavorite(media.id)
          }
          break
        case 'r':
          navigateRandom()
          break
        case 'a':
          setAutoAdvance(prev => !prev)
          break
        case '1':
        case '2':
        case '3':
        case '4':
        case '5':
          if (onRate) {
            onRate(media.id, parseInt(e.key))
          }
          break
        case 'arrowup':
          if (videoRef.current) {
            videoRef.current.volume = Math.min(1, videoRef.current.volume + 0.1)
            setVolume(videoRef.current.volume)
          }
          break
        case 'arrowdown':
          if (videoRef.current) {
            videoRef.current.volume = Math.max(0, videoRef.current.volume - 0.1)
            setVolume(videoRef.current.volume)
          }
          break
        case 'j':
          if (videoRef.current) {
            videoRef.current.currentTime -= 10
          }
          break
        case ';':
          if (videoRef.current) {
            videoRef.current.currentTime += 10
          }
          break
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [media.id, navigateNext, navigatePrev, navigateRandom, onClose, onRate, onToggleFavorite, toggleMute, togglePlay])

  // Video event handlers
  const handleVideoTimeUpdate = useCallback(() => {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime)
    }
  }, [])

  const handleVideoLoaded = useCallback(() => {
    setIsLoading(false)
    if (videoRef.current) {
      setDuration(videoRef.current.duration)
    }
  }, [])

  const handleVideoEnded = useCallback(() => {
    if (autoAdvance && hasNext) {
      navigateNext()
    }
  }, [autoAdvance, hasNext, navigateNext])

  // Click to navigate (sides) or pause (center)
  const handleContentClick = useCallback((e: React.MouseEvent) => {
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return

    const x = e.clientX - rect.left
    const clickZone = x / rect.width

    if (clickZone < 0.25) {
      navigatePrev()
    } else if (clickZone > 0.75) {
      navigateNext()
    } else if (media.type === 'video') {
      togglePlay()
    }
  }, [media.type, navigateNext, navigatePrev, togglePlay])

  // Progress bar click
  const handleProgressClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!videoRef.current || !duration) return
    const rect = e.currentTarget.getBoundingClientRect()
    const percent = (e.clientX - rect.left) / rect.width
    videoRef.current.currentTime = percent * duration
  }, [duration])

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-[9999] bg-black cursor-none select-none"
      onMouseMove={handleMouseMove}
      onClick={handleContentClick}
    >
      {/* Media content */}
      <div className="absolute inset-0 flex items-center justify-center">
        {media.type === 'video' ? (
          <video
            ref={videoRef}
            src={url}
            className="max-w-full max-h-full w-full h-full object-contain"
            autoPlay
            loop={!autoAdvance}
            muted={isMuted}
            onTimeUpdate={handleVideoTimeUpdate}
            onLoadedMetadata={handleVideoLoaded}
            onEnded={handleVideoEnded}
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
          />
        ) : (
          <img
            src={url}
            alt={media.filename}
            className="max-w-full max-h-full object-contain"
            onLoad={() => setIsLoading(false)}
          />
        )}
      </div>

      {/* Loading indicator */}
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-12 h-12 border-4 border-white/20 border-t-white rounded-full animate-spin" />
        </div>
      )}

      {/* Navigation zones indicator (on hover) */}
      {showControls && (
        <>
          <div
            className={`absolute left-0 top-0 w-1/4 h-full flex items-center justify-center bg-gradient-to-r from-black/30 to-transparent transition-opacity ${
              hasPrev ? 'opacity-100' : 'opacity-30'
            }`}
          >
            <ChevronLeft size={48} className="text-white/70" />
          </div>
          <div
            className={`absolute right-0 top-0 w-1/4 h-full flex items-center justify-center bg-gradient-to-l from-black/30 to-transparent transition-opacity ${
              hasNext ? 'opacity-100' : 'opacity-30'
            }`}
          >
            <ChevronRight size={48} className="text-white/70" />
          </div>
        </>
      )}

      {/* Top bar - session info */}
      <div
        className={`absolute top-0 left-0 right-0 p-4 bg-gradient-to-b from-black/80 to-transparent transition-opacity duration-300 ${
          showControls ? 'opacity-100' : 'opacity-0'
        }`}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={(e) => { e.stopPropagation(); onClose() }}
              className="p-2 rounded-full bg-white/10 hover:bg-white/20 transition"
            >
              <X size={20} />
            </button>
            <div className="text-sm">
              <span className="text-white font-medium">{media.filename}</span>
              <span className="text-zinc-400 ml-3">
                {currentIndex + 1} / {mediaList.length}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-4 text-sm text-zinc-400">
            <span className="flex items-center gap-1">
              <Clock size={14} />
              {formatDuration(sessionTime)}
            </span>
            <span className="flex items-center gap-1">
              <Eye size={14} />
              {viewCount}
            </span>
          </div>
        </div>
      </div>

      {/* Bottom bar - controls */}
      <div
        className={`absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/80 to-transparent transition-opacity duration-300 ${
          showControls ? 'opacity-100' : 'opacity-0'
        }`}
      >
        {/* Progress bar for video */}
        {media.type === 'video' && duration > 0 && (
          <div
            className="h-1 bg-white/20 rounded-full mb-4 cursor-pointer"
            onClick={(e) => { e.stopPropagation(); handleProgressClick(e) }}
          >
            <div
              className="h-full bg-[var(--primary)] rounded-full relative"
              style={{ width: `${(currentTime / duration) * 100}%` }}
            >
              <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full shadow-lg" />
            </div>
          </div>
        )}

        {/* Image auto-advance progress */}
        {media.type !== 'video' && autoAdvance && hasNext && (
          <div className="h-1 bg-white/20 rounded-full mb-4 overflow-hidden">
            <div
              className="h-full bg-[var(--primary)] transition-all duration-1000 ease-linear"
              style={{
                animation: `progress-fill ${autoAdvanceDelay}s linear`,
                width: '100%'
              }}
            />
          </div>
        )}

        <div className="flex items-center justify-between">
          {/* Left controls */}
          <div className="flex items-center gap-3">
            {media.type === 'video' && (
              <>
                <button
                  onClick={(e) => { e.stopPropagation(); togglePlay() }}
                  className="p-2 rounded-full bg-white/10 hover:bg-white/20 transition"
                >
                  {isPlaying ? <Pause size={20} /> : <Play size={20} />}
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); toggleMute() }}
                  className="p-2 rounded-full bg-white/10 hover:bg-white/20 transition"
                >
                  {isMuted ? <VolumeX size={20} /> : <Volume2 size={20} />}
                </button>
                <span className="text-sm text-zinc-400">
                  {formatDuration(currentTime)} / {formatDuration(duration)}
                </span>
              </>
            )}
          </div>

          {/* Center controls */}
          <div className="flex items-center gap-2">
            {onToggleFavorite && (
              <button
                onClick={(e) => { e.stopPropagation(); onToggleFavorite(media.id) }}
                className={`p-2 rounded-full transition ${
                  media.isFavorite
                    ? 'bg-pink-500/20 text-pink-400'
                    : 'bg-white/10 hover:bg-white/20'
                }`}
              >
                <Heart size={20} fill={media.isFavorite ? 'currentColor' : 'none'} />
              </button>
            )}
            <button
              onClick={(e) => { e.stopPropagation(); navigateRandom() }}
              className="p-2 rounded-full bg-white/10 hover:bg-white/20 transition"
              title="Random"
            >
              <Shuffle size={20} />
            </button>
            {onRate && (
              <div className="flex items-center gap-1 ml-2">
                {[1, 2, 3, 4, 5].map(star => (
                  <button
                    key={star}
                    onClick={(e) => { e.stopPropagation(); onRate(media.id, star) }}
                    className={`p-1 transition ${
                      (media.rating || 0) >= star ? 'text-amber-400' : 'text-zinc-600 hover:text-zinc-400'
                    }`}
                  >
                    <Star size={16} fill={(media.rating || 0) >= star ? 'currentColor' : 'none'} />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Right controls */}
          <div className="flex items-center gap-3">
            <button
              onClick={(e) => { e.stopPropagation(); setAutoAdvance(prev => !prev) }}
              className={`px-3 py-1.5 rounded-lg text-sm transition ${
                autoAdvance
                  ? 'bg-[var(--primary)]/20 text-[var(--primary)]'
                  : 'bg-white/10 text-zinc-400 hover:bg-white/20'
              }`}
            >
              Auto
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); setShowHints(true); setTimeout(() => setShowHints(false), 4000) }}
              className="p-2 rounded-full bg-white/10 hover:bg-white/20 transition"
              title="Show keyboard hints"
            >
              <Keyboard size={20} />
            </button>
          </div>
        </div>
      </div>

      {/* Keyboard hints */}
      {showHints && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-black/90 rounded-2xl p-6 text-center">
          <h3 className="text-lg font-bold mb-4">Keyboard Shortcuts</h3>
          <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
            <div className="text-right text-zinc-400">← / H</div>
            <div className="text-left">Previous</div>
            <div className="text-right text-zinc-400">→ / L</div>
            <div className="text-left">Next</div>
            <div className="text-right text-zinc-400">Space / K</div>
            <div className="text-left">Play/Pause</div>
            <div className="text-right text-zinc-400">J / ;</div>
            <div className="text-left">±10 seconds</div>
            <div className="text-right text-zinc-400">M</div>
            <div className="text-left">Mute</div>
            <div className="text-right text-zinc-400">F</div>
            <div className="text-left">Favorite</div>
            <div className="text-right text-zinc-400">R</div>
            <div className="text-left">Random</div>
            <div className="text-right text-zinc-400">A</div>
            <div className="text-left">Auto-advance</div>
            <div className="text-right text-zinc-400">1-5</div>
            <div className="text-left">Rate</div>
            <div className="text-right text-zinc-400">Esc</div>
            <div className="text-left">Exit</div>
          </div>
          <p className="text-xs text-zinc-500 mt-4">Click left/right edges to navigate</p>
        </div>
      )}

      {/* CSS for progress animation */}
      <style>{`
        @keyframes progress-fill {
          from { width: 0%; }
          to { width: 100%; }
        }
      `}</style>
    </div>
  )
}

// Quick immersive mode toggle button
export function ImmersiveModeButton({
  onClick,
  className = ''
}: {
  onClick: () => void
  className?: string
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-3 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 transition ${className}`}
      title="Enter immersive mode"
    >
      <Maximize size={16} className="text-[var(--primary)]" />
      <span className="text-sm">Immersive</span>
    </button>
  )
}

export default ImmersiveMode
