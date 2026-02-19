// File: src/renderer/components/SlideshowController.tsx
// Advanced slideshow with transitions, timing, and shuffle options

import React, { useState, useEffect, useCallback, useRef } from 'react'
import {
  Play,
  Pause,
  SkipForward,
  SkipBack,
  Shuffle,
  Repeat,
  Clock,
  Settings,
  X,
  Sparkles,
  Maximize,
  ChevronLeft,
  ChevronRight,
  Layers
} from 'lucide-react'
import { toFileUrlCached } from '../hooks/usePerformance'

interface SlideshowItem {
  id: string
  path: string
  filename: string
  type: 'image' | 'gif' | 'video'
  durationSec?: number | null
}

type TransitionType = 'fade' | 'slide' | 'zoom' | 'blur' | 'flip' | 'none'

interface SlideshowSettings {
  duration: number // seconds per image
  transition: TransitionType
  transitionDuration: number // ms
  shuffle: boolean
  loop: boolean
  autoPlay: boolean
  fitMode: 'contain' | 'cover' | 'fill'
  showInfo: boolean
}

interface SlideshowControllerProps {
  items: SlideshowItem[]
  onClose: () => void
  onMediaChange?: (mediaId: string) => void
  initialIndex?: number
  className?: string
}

const DEFAULT_SETTINGS: SlideshowSettings = {
  duration: 5,
  transition: 'fade',
  transitionDuration: 500,
  shuffle: false,
  loop: true,
  autoPlay: true,
  fitMode: 'contain',
  showInfo: true
}

const TRANSITIONS: Array<{ id: TransitionType; name: string }> = [
  { id: 'fade', name: 'Fade' },
  { id: 'slide', name: 'Slide' },
  { id: 'zoom', name: 'Zoom' },
  { id: 'blur', name: 'Blur' },
  { id: 'flip', name: 'Flip' },
  { id: 'none', name: 'None' }
]

export function SlideshowController({
  items,
  onClose,
  onMediaChange,
  initialIndex = 0,
  className = ''
}: SlideshowControllerProps) {
  const [settings, setSettings] = useState<SlideshowSettings>(() => {
    try {
      const saved = localStorage.getItem('vault-slideshow-settings')
      return saved ? { ...DEFAULT_SETTINGS, ...JSON.parse(saved) } : DEFAULT_SETTINGS
    } catch {
      return DEFAULT_SETTINGS
    }
  })

  const [currentIndex, setCurrentIndex] = useState(initialIndex)
  const [isPlaying, setIsPlaying] = useState(settings.autoPlay)
  const [showControls, setShowControls] = useState(true)
  const [showSettings, setShowSettings] = useState(false)
  const [currentUrl, setCurrentUrl] = useState('')
  const [nextUrl, setNextUrl] = useState('')
  const [isTransitioning, setIsTransitioning] = useState(false)
  const [shuffledOrder, setShuffledOrder] = useState<number[]>([])
  const [progress, setProgress] = useState(0)

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const progressRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const hideControlsTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  const currentItem = items[settings.shuffle && shuffledOrder.length ? shuffledOrder[currentIndex] : currentIndex]
  const totalItems = items.length

  // Save settings
  useEffect(() => {
    localStorage.setItem('vault-slideshow-settings', JSON.stringify(settings))
  }, [settings])

  // Initialize shuffle order
  useEffect(() => {
    if (settings.shuffle && items.length > 0) {
      const order = items.map((_, i) => i)
      for (let i = order.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[order[i], order[j]] = [order[j], order[i]]
      }
      setShuffledOrder(order)
    }
  }, [settings.shuffle, items.length])

  // Load current image
  useEffect(() => {
    if (!currentItem) return
    toFileUrlCached(currentItem.path).then(setCurrentUrl).catch(() => {})
    onMediaChange?.(currentItem.id)
  }, [currentItem, onMediaChange])

  // Preload next image
  useEffect(() => {
    const nextIdx = (currentIndex + 1) % items.length
    const nextItem = items[settings.shuffle && shuffledOrder.length ? shuffledOrder[nextIdx] : nextIdx]
    if (nextItem && nextItem.type !== 'video') {
      toFileUrlCached(nextItem.path).then(setNextUrl).catch(() => {})
    }
  }, [currentIndex, items, settings.shuffle, shuffledOrder])

  // Auto-advance timer
  useEffect(() => {
    if (!isPlaying || !currentItem) return

    // Handle video duration
    const duration = currentItem.type === 'video' && currentItem.durationSec
      ? currentItem.durationSec * 1000
      : settings.duration * 1000

    // Progress bar
    let startTime = Date.now()
    progressRef.current = setInterval(() => {
      const elapsed = Date.now() - startTime
      setProgress(Math.min(100, (elapsed / duration) * 100))
    }, 50)

    // Next slide
    timerRef.current = setTimeout(() => {
      goToNext()
    }, duration)

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      if (progressRef.current) clearInterval(progressRef.current)
      setProgress(0)
    }
  }, [isPlaying, currentIndex, currentItem, settings.duration])

  // Auto-hide controls
  const resetControlsTimeout = useCallback(() => {
    if (hideControlsTimeout.current) {
      clearTimeout(hideControlsTimeout.current)
    }
    setShowControls(true)
    hideControlsTimeout.current = setTimeout(() => {
      if (isPlaying) setShowControls(false)
    }, 3000)
  }, [isPlaying])

  // Navigation
  const goToNext = useCallback(() => {
    setIsTransitioning(true)
    setTimeout(() => {
      setCurrentIndex(prev => {
        const next = prev + 1
        if (next >= items.length) {
          if (settings.loop) return 0
          setIsPlaying(false)
          return prev
        }
        return next
      })
      setIsTransitioning(false)
      setProgress(0)
    }, settings.transitionDuration)
  }, [items.length, settings.loop, settings.transitionDuration])

  const goToPrev = useCallback(() => {
    setIsTransitioning(true)
    setTimeout(() => {
      setCurrentIndex(prev => prev > 0 ? prev - 1 : items.length - 1)
      setIsTransitioning(false)
      setProgress(0)
    }, settings.transitionDuration)
  }, [items.length, settings.transitionDuration])

  const togglePlay = useCallback(() => {
    setIsPlaying(prev => !prev)
  }, [])

  const toggleShuffle = useCallback(() => {
    setSettings(prev => ({ ...prev, shuffle: !prev.shuffle }))
  }, [])

  const toggleLoop = useCallback(() => {
    setSettings(prev => ({ ...prev, loop: !prev.loop }))
  }, [])

  // Get transition styles
  const getTransitionStyle = (): React.CSSProperties => {
    const base: React.CSSProperties = {
      transition: `all ${settings.transitionDuration}ms ease-in-out`
    }

    if (!isTransitioning) return base

    switch (settings.transition) {
      case 'fade':
        return { ...base, opacity: 0 }
      case 'slide':
        return { ...base, transform: 'translateX(-100%)' }
      case 'zoom':
        return { ...base, transform: 'scale(1.5)', opacity: 0 }
      case 'blur':
        return { ...base, filter: 'blur(20px)', opacity: 0 }
      case 'flip':
        return { ...base, transform: 'rotateY(90deg)' }
      default:
        return base
    }
  }

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case ' ':
        case 'k':
          e.preventDefault()
          togglePlay()
          break
        case 'ArrowLeft':
        case 'h':
          goToPrev()
          break
        case 'ArrowRight':
        case 'l':
          goToNext()
          break
        case 's':
          toggleShuffle()
          break
        case 'r':
          toggleLoop()
          break
        case 'Escape':
          onClose()
          break
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [togglePlay, goToPrev, goToNext, toggleShuffle, toggleLoop, onClose])

  return (
    <div
      className={`fixed inset-0 z-[9999] bg-black ${className}`}
      onMouseMove={resetControlsTimeout}
    >
      {/* Image display */}
      <div className="absolute inset-0 flex items-center justify-center">
        {currentUrl && (
          currentItem?.type === 'video' ? (
            <video
              key={currentItem.id}
              src={currentUrl}
              className="max-w-full max-h-full"
              style={{
                ...getTransitionStyle(),
                objectFit: settings.fitMode
              }}
              autoPlay
              muted
              loop
            />
          ) : (
            <img
              key={currentItem?.id}
              src={currentUrl}
              alt={currentItem?.filename}
              className="max-w-full max-h-full"
              style={{
                ...getTransitionStyle(),
                objectFit: settings.fitMode
              }}
            />
          )
        )}
      </div>

      {/* Progress bar */}
      <div className="absolute top-0 left-0 right-0 h-1 bg-white/20">
        <div
          className="h-full bg-[var(--primary)] transition-all duration-100 ease-linear"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Info overlay */}
      {settings.showInfo && showControls && currentItem && (
        <div className="absolute top-4 left-4 right-16 text-white">
          <div className="text-lg font-medium truncate">{currentItem.filename}</div>
          <div className="text-sm text-white/60">
            {currentIndex + 1} / {totalItems}
          </div>
        </div>
      )}

      {/* Close button */}
      <button
        onClick={onClose}
        className="absolute top-4 right-4 p-2 rounded-full bg-black/50 hover:bg-black/70 transition text-white"
      >
        <X size={20} />
      </button>

      {/* Controls */}
      {showControls && (
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-6">
          <div className="flex items-center justify-center gap-4">
            {/* Shuffle */}
            <button
              onClick={toggleShuffle}
              className={`p-2 rounded-lg transition ${
                settings.shuffle ? 'bg-[var(--primary)] text-white' : 'bg-white/20 text-white hover:bg-white/30'
              }`}
            >
              <Shuffle size={18} />
            </button>

            {/* Previous */}
            <button
              onClick={goToPrev}
              className="p-3 rounded-full bg-white/20 hover:bg-white/30 transition text-white"
            >
              <SkipBack size={24} />
            </button>

            {/* Play/Pause */}
            <button
              onClick={togglePlay}
              className="p-4 rounded-full bg-white/30 hover:bg-white/40 transition text-white"
            >
              {isPlaying ? <Pause size={28} /> : <Play size={28} />}
            </button>

            {/* Next */}
            <button
              onClick={goToNext}
              className="p-3 rounded-full bg-white/20 hover:bg-white/30 transition text-white"
            >
              <SkipForward size={24} />
            </button>

            {/* Loop */}
            <button
              onClick={toggleLoop}
              className={`p-2 rounded-lg transition ${
                settings.loop ? 'bg-[var(--primary)] text-white' : 'bg-white/20 text-white hover:bg-white/30'
              }`}
            >
              <Repeat size={18} />
            </button>

            {/* Settings */}
            <button
              onClick={() => setShowSettings(true)}
              className="p-2 rounded-lg bg-white/20 hover:bg-white/30 transition text-white ml-4"
            >
              <Settings size={18} />
            </button>
          </div>

          {/* Duration indicator */}
          <div className="flex items-center justify-center gap-2 mt-3 text-white/60 text-sm">
            <Clock size={14} />
            <span>{settings.duration}s</span>
          </div>
        </div>
      )}

      {/* Settings panel */}
      {showSettings && (
        <div className="absolute inset-0 bg-black/80 flex items-center justify-center" onClick={() => setShowSettings(false)}>
          <div className="bg-zinc-900 rounded-2xl p-6 max-w-md w-full mx-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-bold">Slideshow Settings</h3>
              <button onClick={() => setShowSettings(false)}>
                <X size={20} />
              </button>
            </div>

            <div className="space-y-4">
              {/* Duration */}
              <div>
                <label className="text-sm text-zinc-400 block mb-2">
                  Duration per slide: {settings.duration}s
                </label>
                <input
                  type="range"
                  min={1}
                  max={30}
                  value={settings.duration}
                  onChange={e => setSettings(prev => ({ ...prev, duration: parseInt(e.target.value) }))}
                  className="w-full accent-[var(--primary)]"
                />
              </div>

              {/* Transition */}
              <div>
                <label className="text-sm text-zinc-400 block mb-2">Transition</label>
                <div className="grid grid-cols-3 gap-2">
                  {TRANSITIONS.map(t => (
                    <button
                      key={t.id}
                      onClick={() => setSettings(prev => ({ ...prev, transition: t.id }))}
                      className={`py-2 rounded-lg text-sm transition ${
                        settings.transition === t.id
                          ? 'bg-[var(--primary)] text-white'
                          : 'bg-zinc-800 text-zinc-400 hover:text-white'
                      }`}
                    >
                      {t.name}
                    </button>
                  ))}
                </div>
              </div>

              {/* Fit mode */}
              <div>
                <label className="text-sm text-zinc-400 block mb-2">Fit Mode</label>
                <div className="flex gap-2">
                  {(['contain', 'cover', 'fill'] as const).map(mode => (
                    <button
                      key={mode}
                      onClick={() => setSettings(prev => ({ ...prev, fitMode: mode }))}
                      className={`flex-1 py-2 rounded-lg text-sm capitalize transition ${
                        settings.fitMode === mode
                          ? 'bg-[var(--primary)] text-white'
                          : 'bg-zinc-800 text-zinc-400 hover:text-white'
                      }`}
                    >
                      {mode}
                    </button>
                  ))}
                </div>
              </div>

              {/* Show info toggle */}
              <div className="flex items-center justify-between">
                <span className="text-sm">Show file info</span>
                <button
                  onClick={() => setSettings(prev => ({ ...prev, showInfo: !prev.showInfo }))}
                  className={`w-10 h-6 rounded-full transition ${
                    settings.showInfo ? 'bg-[var(--primary)]' : 'bg-zinc-700'
                  }`}
                >
                  <div className={`w-4 h-4 rounded-full bg-white transform transition ${
                    settings.showInfo ? 'translate-x-5' : 'translate-x-1'
                  }`} />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// Mini slideshow launcher button
export function SlideshowLauncher({
  items,
  onLaunch,
  className = ''
}: {
  items: SlideshowItem[]
  onLaunch: () => void
  className?: string
}) {
  return (
    <button
      onClick={onLaunch}
      disabled={items.length === 0}
      className={`flex items-center gap-2 px-3 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 transition ${className}`}
    >
      <Layers size={16} className="text-[var(--primary)]" />
      <span className="text-sm">Slideshow</span>
      <span className="text-xs text-zinc-500">{items.length}</span>
    </button>
  )
}

export default SlideshowController
