'use memo'
// File: src/renderer/components/SubliminalOverlay.tsx
//
// Subliminal text overlay. Flashes user-defined phrases briefly over
// the active player / wall at randomized intervals. Designed to layer
// over GoonWall, FloatingVideoPlayer, and the Brainwash player without
// blocking interaction.
//
// Phrases come from settings.subliminal.phrases. If empty, the overlay
// no-ops entirely so the component is free to mount unconditionally.

import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'

export type SubliminalConfig = {
  // Phrases to cycle through. One is picked at random per flash.
  phrases: string[]
  // Min/max ms between flashes.
  minIntervalMs?: number
  maxIntervalMs?: number
  // How long each phrase stays visible (fade-in + hold + fade-out).
  visibleMs?: number
  // 0–1; lower = more subliminal, higher = more in-your-face.
  intensity?: number
  // Where the text lands. 'random' bounces it; 'center' is steady.
  placement?: 'center' | 'random'
  // Text color override (defaults to a soft pink that reads on dark video).
  color?: string
}

export function SubliminalOverlay({
  active,
  config,
}: {
  active: boolean
  config: SubliminalConfig
}) {
  const [flash, setFlash] = useState<{
    id: number
    text: string
    top: string
    left: string
    rotate: number
  } | null>(null)
  const flashIdRef = useRef(0)

  // Read config with defensible defaults — every field is optional so
  // callers can pass {phrases: [...]} and get a sensible feel.
  const phrases = config.phrases ?? []
  const minInterval = Math.max(500, config.minIntervalMs ?? 4000)
  const maxInterval = Math.max(minInterval + 500, config.maxIntervalMs ?? 9000)
  const visibleMs = Math.max(150, config.visibleMs ?? 700)
  const intensity = Math.max(0, Math.min(1, config.intensity ?? 0.5))
  const placement = config.placement ?? 'random'
  const color = config.color ?? 'rgb(244, 114, 182)'

  useEffect(() => {
    if (!active || phrases.length === 0) {
      setFlash(null)
      return
    }
    let cancelled = false
    let nextTimer: ReturnType<typeof setTimeout> | null = null
    let clearTimer: ReturnType<typeof setTimeout> | null = null

    const schedule = () => {
      const wait = minInterval + Math.random() * (maxInterval - minInterval)
      nextTimer = setTimeout(() => {
        if (cancelled) return
        const text = phrases[Math.floor(Math.random() * phrases.length)]
        const id = flashIdRef.current++
        // Random placement within the safe interior of the parent.
        const top = placement === 'center' ? '45%' : `${20 + Math.random() * 50}%`
        const left = placement === 'center' ? '50%' : `${15 + Math.random() * 70}%`
        const rotate = placement === 'center' ? 0 : -4 + Math.random() * 8
        setFlash({ id, text, top, left, rotate })
        clearTimer = setTimeout(() => {
          if (!cancelled) setFlash(null)
        }, visibleMs)
        schedule()
      }, wait)
    }
    schedule()
    return () => {
      cancelled = true
      if (nextTimer) clearTimeout(nextTimer)
      if (clearTimer) clearTimeout(clearTimer)
    }
  }, [active, phrases, minInterval, maxInterval, visibleMs, placement])

  if (!active || phrases.length === 0) return null

  // Opacity scales with intensity; even at intensity=1 we cap at 0.9
  // so the text never fully blocks what's behind it.
  const peakOpacity = 0.25 + intensity * 0.65

  // Font size also scales — small + subtle at low intensity, billboard
  // at high.
  const baseSize = 36 + intensity * 56

  return (
    <div className="absolute inset-0 pointer-events-none z-30 overflow-hidden">
      <AnimatePresence>
        {flash && (
          <motion.div
            key={flash.id}
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: peakOpacity, scale: 1 }}
            exit={{ opacity: 0, scale: 1.05 }}
            transition={{ duration: visibleMs / 1000 / 2, ease: 'easeOut' }}
            className="absolute -translate-x-1/2 -translate-y-1/2 font-bold uppercase tracking-widest select-none"
            style={{
              top: flash.top,
              left: flash.left,
              fontSize: baseSize,
              color,
              rotate: `${flash.rotate}deg`,
              textShadow: `0 0 ${8 + intensity * 24}px ${color}, 0 2px 8px rgba(0,0,0,0.7)`,
              mixBlendMode: 'screen',
            }}
          >
            {flash.text}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
