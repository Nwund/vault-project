// File: src/renderer/components/GestureControls.tsx
// Touch and swipe gesture controls for media navigation

import React, { useState, useEffect, useCallback, useRef } from 'react'
import {
  Hand,
  ChevronLeft,
  ChevronRight,
  Volume2,
  VolumeX,
  Heart,
  Play,
  Pause,
  SkipForward,
  SkipBack,
  Maximize,
  X,
  Settings,
  Info
} from 'lucide-react'

interface GestureZone {
  id: string
  area: 'left' | 'center' | 'right' | 'top' | 'bottom'
  action: string
  description: string
}

interface GestureControlsProps {
  containerRef: React.RefObject<HTMLElement>
  onSwipeLeft?: () => void
  onSwipeRight?: () => void
  onSwipeUp?: () => void
  onSwipeDown?: () => void
  onTap?: () => void
  onDoubleTap?: () => void
  onDoubleTapLeft?: () => void
  onDoubleTapRight?: () => void
  onLongPress?: () => void
  onVolumeSwipe?: (delta: number) => void
  onProgressSwipe?: (delta: number) => void
  enabled?: boolean
  showHints?: boolean
  className?: string
}

interface GestureState {
  startX: number
  startY: number
  startTime: number
  isSwiping: boolean
  swipeDirection: 'horizontal' | 'vertical' | null
}

// Gesture thresholds
const SWIPE_THRESHOLD = 50 // Minimum distance for swipe
const SWIPE_VELOCITY_THRESHOLD = 0.3 // Minimum velocity
const DOUBLE_TAP_DELAY = 300 // Max time between taps
const LONG_PRESS_DELAY = 500 // Time for long press
const TAP_ZONE_WIDTH = 0.3 // Percentage of screen width for tap zones

export function GestureControls({
  containerRef,
  onSwipeLeft,
  onSwipeRight,
  onSwipeUp,
  onSwipeDown,
  onTap,
  onDoubleTap,
  onDoubleTapLeft,
  onDoubleTapRight,
  onLongPress,
  onVolumeSwipe,
  onProgressSwipe,
  enabled = true,
  showHints = false,
  className = ''
}: GestureControlsProps) {
  const [gesture, setGesture] = useState<GestureState | null>(null)
  const [showGestureIndicator, setShowGestureIndicator] = useState<string | null>(null)
  const [tapCount, setTapCount] = useState(0)
  const [lastTapTime, setLastTapTime] = useState(0)
  const [lastTapX, setLastTapX] = useState(0)

  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const tapTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Clear timers
  const clearTimers = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
    if (tapTimer.current) {
      clearTimeout(tapTimer.current)
      tapTimer.current = null
    }
  }, [])

  // Handle touch start
  const handleTouchStart = useCallback((e: TouchEvent) => {
    if (!enabled) return

    const touch = e.touches[0]
    setGesture({
      startX: touch.clientX,
      startY: touch.clientY,
      startTime: Date.now(),
      isSwiping: false,
      swipeDirection: null
    })

    // Start long press timer
    longPressTimer.current = setTimeout(() => {
      onLongPress?.()
      setShowGestureIndicator('longpress')
      setTimeout(() => setShowGestureIndicator(null), 500)
      setGesture(null)
    }, LONG_PRESS_DELAY)
  }, [enabled, onLongPress])

  // Handle touch move
  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (!gesture || !enabled) return

    const touch = e.touches[0]
    const deltaX = touch.clientX - gesture.startX
    const deltaY = touch.clientY - gesture.startY

    // Cancel long press if moving
    if (Math.abs(deltaX) > 10 || Math.abs(deltaY) > 10) {
      if (longPressTimer.current) {
        clearTimeout(longPressTimer.current)
        longPressTimer.current = null
      }
    }

    // Determine swipe direction
    if (!gesture.swipeDirection && (Math.abs(deltaX) > 20 || Math.abs(deltaY) > 20)) {
      const direction = Math.abs(deltaX) > Math.abs(deltaY) ? 'horizontal' : 'vertical'
      setGesture(prev => prev ? { ...prev, isSwiping: true, swipeDirection: direction } : null)
    }

    // Handle volume swipe (vertical on right side)
    if (gesture.swipeDirection === 'vertical' && gesture.startX > window.innerWidth * 0.7) {
      const normalizedDelta = -deltaY / 200
      onVolumeSwipe?.(normalizedDelta)
    }

    // Handle progress swipe (horizontal on center)
    if (gesture.swipeDirection === 'horizontal' && gesture.startX > window.innerWidth * 0.3 && gesture.startX < window.innerWidth * 0.7) {
      const normalizedDelta = deltaX / window.innerWidth
      onProgressSwipe?.(normalizedDelta)
    }
  }, [gesture, enabled, onVolumeSwipe, onProgressSwipe])

  // Handle touch end
  const handleTouchEnd = useCallback((e: TouchEvent) => {
    clearTimers()
    if (!gesture || !enabled) return

    const touch = e.changedTouches[0]
    const deltaX = touch.clientX - gesture.startX
    const deltaY = touch.clientY - gesture.startY
    const deltaTime = Date.now() - gesture.startTime
    const velocity = Math.sqrt(deltaX * deltaX + deltaY * deltaY) / deltaTime

    // Check for swipe
    if (gesture.isSwiping && velocity > SWIPE_VELOCITY_THRESHOLD) {
      if (gesture.swipeDirection === 'horizontal') {
        if (Math.abs(deltaX) > SWIPE_THRESHOLD) {
          if (deltaX > 0) {
            onSwipeRight?.()
            setShowGestureIndicator('swipe-right')
          } else {
            onSwipeLeft?.()
            setShowGestureIndicator('swipe-left')
          }
        }
      } else if (gesture.swipeDirection === 'vertical') {
        if (Math.abs(deltaY) > SWIPE_THRESHOLD) {
          if (deltaY > 0) {
            onSwipeDown?.()
            setShowGestureIndicator('swipe-down')
          } else {
            onSwipeUp?.()
            setShowGestureIndicator('swipe-up')
          }
        }
      }
      setTimeout(() => setShowGestureIndicator(null), 500)
    } else if (!gesture.isSwiping && deltaTime < 300) {
      // Handle tap
      const now = Date.now()
      const timeSinceLastTap = now - lastTapTime
      const tapX = touch.clientX

      if (timeSinceLastTap < DOUBLE_TAP_DELAY && Math.abs(tapX - lastTapX) < 50) {
        // Double tap
        setTapCount(0)
        clearTimers()

        const screenWidth = window.innerWidth
        const tapZone = tapX / screenWidth

        if (tapZone < TAP_ZONE_WIDTH) {
          onDoubleTapLeft?.()
          setShowGestureIndicator('double-tap-left')
        } else if (tapZone > (1 - TAP_ZONE_WIDTH)) {
          onDoubleTapRight?.()
          setShowGestureIndicator('double-tap-right')
        } else {
          onDoubleTap?.()
          setShowGestureIndicator('double-tap')
        }
        setTimeout(() => setShowGestureIndicator(null), 500)
      } else {
        // Single tap - wait to see if double tap follows
        setTapCount(1)
        setLastTapTime(now)
        setLastTapX(tapX)

        tapTimer.current = setTimeout(() => {
          onTap?.()
          setTapCount(0)
        }, DOUBLE_TAP_DELAY)
      }
    }

    setGesture(null)
  }, [gesture, enabled, clearTimers, lastTapTime, lastTapX, onSwipeLeft, onSwipeRight, onSwipeUp, onSwipeDown, onTap, onDoubleTap, onDoubleTapLeft, onDoubleTapRight])

  // Attach event listeners
  useEffect(() => {
    const container = containerRef.current
    if (!container || !enabled) return

    container.addEventListener('touchstart', handleTouchStart, { passive: true })
    container.addEventListener('touchmove', handleTouchMove, { passive: true })
    container.addEventListener('touchend', handleTouchEnd, { passive: true })

    return () => {
      container.removeEventListener('touchstart', handleTouchStart)
      container.removeEventListener('touchmove', handleTouchMove)
      container.removeEventListener('touchend', handleTouchEnd)
      clearTimers()
    }
  }, [containerRef, enabled, handleTouchStart, handleTouchMove, handleTouchEnd, clearTimers])

  // Render gesture indicator
  const renderIndicator = () => {
    if (!showGestureIndicator) return null

    const indicators: Record<string, { icon: React.ElementType; text: string; position: string }> = {
      'swipe-left': { icon: ChevronLeft, text: 'Previous', position: 'left-4' },
      'swipe-right': { icon: ChevronRight, text: 'Next', position: 'right-4' },
      'swipe-up': { icon: Maximize, text: 'Fullscreen', position: 'top-1/2 -translate-y-1/2' },
      'swipe-down': { icon: X, text: 'Close', position: 'top-1/2 -translate-y-1/2' },
      'double-tap': { icon: Play, text: 'Play/Pause', position: 'top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2' },
      'double-tap-left': { icon: SkipBack, text: '-10s', position: 'left-1/4 top-1/2 -translate-y-1/2' },
      'double-tap-right': { icon: SkipForward, text: '+10s', position: 'right-1/4 top-1/2 -translate-y-1/2' },
      'longpress': { icon: Heart, text: 'Favorite', position: 'top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2' }
    }

    const indicator = indicators[showGestureIndicator]
    if (!indicator) return null

    const Icon = indicator.icon

    return (
      <div className={`absolute ${indicator.position} z-50 pointer-events-none animate-in zoom-in-50 fade-in duration-200`}>
        <div className="flex flex-col items-center gap-2 px-4 py-3 bg-black/70 rounded-xl backdrop-blur-sm">
          <Icon size={32} className="text-white" />
          <span className="text-sm text-white">{indicator.text}</span>
        </div>
      </div>
    )
  }

  // Render hints overlay
  const renderHints = () => {
    if (!showHints) return null

    return (
      <div className="absolute inset-0 z-40 pointer-events-none">
        {/* Left zone */}
        <div className="absolute left-0 top-0 bottom-0 w-[30%] flex items-center justify-center">
          <div className="flex flex-col items-center gap-1 px-4 py-2 bg-black/50 rounded-xl">
            <SkipBack size={20} className="text-white/70" />
            <span className="text-xs text-white/70">Double tap: -10s</span>
          </div>
        </div>
        {/* Center zone */}
        <div className="absolute left-[30%] right-[30%] top-0 bottom-0 flex items-center justify-center">
          <div className="flex flex-col items-center gap-1 px-4 py-2 bg-black/50 rounded-xl">
            <Play size={20} className="text-white/70" />
            <span className="text-xs text-white/70">Double tap: Play/Pause</span>
          </div>
        </div>
        {/* Right zone */}
        <div className="absolute right-0 top-0 bottom-0 w-[30%] flex items-center justify-center">
          <div className="flex flex-col items-center gap-1 px-4 py-2 bg-black/50 rounded-xl">
            <SkipForward size={20} className="text-white/70" />
            <span className="text-xs text-white/70">Double tap: +10s</span>
          </div>
        </div>
        {/* Volume zone */}
        <div className="absolute right-4 top-1/2 -translate-y-1/2">
          <div className="flex flex-col items-center gap-1 px-3 py-2 bg-black/50 rounded-xl">
            <Volume2 size={16} className="text-white/70" />
            <span className="text-xs text-white/70">Swipe: Volume</span>
          </div>
        </div>
        {/* Swipe indicators */}
        <div className="absolute top-4 left-1/2 -translate-x-1/2">
          <div className="flex items-center gap-4 px-4 py-2 bg-black/50 rounded-xl">
            <span className="text-xs text-white/70">← Swipe →</span>
            <span className="text-xs text-white/50">Navigate</span>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={`absolute inset-0 ${className}`}>
      {renderIndicator()}
      {renderHints()}
    </div>
  )
}

// Gesture settings panel
export function GestureSettings({
  settings,
  onUpdate,
  className = ''
}: {
  settings: {
    enabled: boolean
    swipeToNavigate: boolean
    doubleTapToSeek: boolean
    volumeGesture: boolean
    longPressToFavorite: boolean
  }
  onUpdate: (key: string, value: boolean) => void
  className?: string
}) {
  return (
    <div className={`space-y-3 ${className}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Hand size={16} className="text-zinc-400" />
          <span className="text-sm">Gesture Controls</span>
        </div>
        <button
          onClick={() => onUpdate('enabled', !settings.enabled)}
          className={`w-10 h-6 rounded-full transition ${
            settings.enabled ? 'bg-[var(--primary)]' : 'bg-zinc-700'
          }`}
        >
          <div className={`w-4 h-4 rounded-full bg-white transform transition ${
            settings.enabled ? 'translate-x-5' : 'translate-x-1'
          }`} />
        </button>
      </div>

      {settings.enabled && (
        <div className="space-y-2 pl-6">
          {[
            { key: 'swipeToNavigate', label: 'Swipe to navigate', icon: ChevronRight },
            { key: 'doubleTapToSeek', label: 'Double tap to seek', icon: SkipForward },
            { key: 'volumeGesture', label: 'Swipe for volume', icon: Volume2 },
            { key: 'longPressToFavorite', label: 'Long press to favorite', icon: Heart }
          ].map(item => {
            const Icon = item.icon
            const isEnabled = settings[item.key as keyof typeof settings]
            return (
              <div key={item.key} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Icon size={14} className="text-zinc-500" />
                  <span className="text-xs text-zinc-400">{item.label}</span>
                </div>
                <button
                  onClick={() => onUpdate(item.key, !isEnabled)}
                  className={`w-8 h-5 rounded-full transition ${
                    isEnabled ? 'bg-[var(--primary)]' : 'bg-zinc-700'
                  }`}
                >
                  <div className={`w-3 h-3 rounded-full bg-white transform transition ${
                    isEnabled ? 'translate-x-4' : 'translate-x-1'
                  }`} />
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default GestureControls
