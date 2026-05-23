// File: src/renderer/components/NewAmbientEffects.tsx
// 2026 round of ambient overlays — Aurora Bands + Neon Rain + Lightning Veil.
// Each component is a fixed-position canvas overlay; mount them once in App
// and toggle via props. They self-animate via requestAnimationFrame and
// clean up on unmount.

import React, { useEffect, useRef } from 'react'

// ─────────────────────────────────────────────────────────────────────────────
// AURORA BANDS
// Smooth flowing gradient ribbons that drift across the screen. Reads the
// active theme's `--primary` and `--secondary` so it auto-restyles per theme.
// ─────────────────────────────────────────────────────────────────────────────
interface AuroraBandsProps {
  enabled?: boolean
  intensity?: number  // 0-1, default 0.5
  bandCount?: number  // default 4
  speed?: number      // 0-2, default 1
}
export function AuroraBands({ enabled = true, intensity = 0.5, bandCount = 4, speed = 1 }: AuroraBandsProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const rafRef = useRef<number | null>(null)
  const tRef = useRef(0)

  useEffect(() => {
    if (!enabled) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const resize = () => {
      canvas.width = window.innerWidth * window.devicePixelRatio
      canvas.height = window.innerHeight * window.devicePixelRatio
    }
    resize()
    window.addEventListener('resize', resize)

    const readThemeColor = (varName: string, fallback: string): string => {
      try {
        const v = getComputedStyle(document.documentElement).getPropertyValue(varName).trim()
        return v || fallback
      } catch { return fallback }
    }

    const draw = () => {
      const w = canvas.width
      const h = canvas.height
      ctx.clearRect(0, 0, w, h)

      const primary = readThemeColor('--primary', '#a855f7')
      const secondary = readThemeColor('--secondary', '#f472b6')

      tRef.current += 0.0025 * speed
      const t = tRef.current

      ctx.globalCompositeOperation = 'lighter'
      ctx.globalAlpha = 0.18 * intensity

      for (let i = 0; i < bandCount; i++) {
        const phase = (i / bandCount) * Math.PI * 2
        const yBase = h * (0.15 + (i / bandCount) * 0.7)
        const amp = h * 0.08
        const wavelength = w * 0.6

        const grad = ctx.createLinearGradient(0, 0, w, 0)
        grad.addColorStop(0, 'rgba(0,0,0,0)')
        grad.addColorStop(0.5, i % 2 === 0 ? primary : secondary)
        grad.addColorStop(1, 'rgba(0,0,0,0)')

        ctx.fillStyle = grad
        ctx.beginPath()
        for (let x = 0; x <= w; x += 8) {
          const yOffset = Math.sin(x / wavelength + t * 2 + phase) * amp
                        + Math.cos(x / (wavelength * 0.5) + t * 1.3 + phase) * amp * 0.5
          if (x === 0) ctx.moveTo(x, yBase + yOffset)
          else ctx.lineTo(x, yBase + yOffset)
        }
        // Close band as a thin ribbon ~80px tall (in CSS px → DPR-scaled)
        const thickness = 80 * window.devicePixelRatio
        for (let x = w; x >= 0; x -= 8) {
          const yOffset = Math.sin(x / wavelength + t * 2 + phase) * amp
                        + Math.cos(x / (wavelength * 0.5) + t * 1.3 + phase) * amp * 0.5
          ctx.lineTo(x, yBase + yOffset + thickness)
        }
        ctx.closePath()
        ctx.fill()
      }

      ctx.globalCompositeOperation = 'source-over'
      ctx.globalAlpha = 1
      rafRef.current = requestAnimationFrame(draw)
    }

    rafRef.current = requestAnimationFrame(draw)

    return () => {
      window.removeEventListener('resize', resize)
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    }
  }, [enabled, intensity, bandCount, speed])

  if (!enabled) return null
  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none fixed inset-0 z-0"
      style={{ width: '100vw', height: '100vh', mixBlendMode: 'screen' }}
      aria-hidden
    />
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// NEON RAIN
// Falling vertical streaks in the theme's primary + secondary. Cycle reuses
// existing streaks to keep memory flat regardless of how long it runs.
// ─────────────────────────────────────────────────────────────────────────────
type RainStreak = {
  x: number
  y: number
  speed: number
  length: number
  hue: 'primary' | 'secondary'
  alpha: number
}

interface NeonRainProps {
  enabled?: boolean
  intensity?: number  // 0-1, default 0.5 — controls density
  speed?: number      // 0-2, default 1
}
export function NeonRain({ enabled = true, intensity = 0.5, speed = 1 }: NeonRainProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const rafRef = useRef<number | null>(null)
  const streaksRef = useRef<RainStreak[]>([])

  useEffect(() => {
    if (!enabled) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const resize = () => {
      canvas.width = window.innerWidth * window.devicePixelRatio
      canvas.height = window.innerHeight * window.devicePixelRatio
    }
    resize()
    window.addEventListener('resize', resize)

    const targetCount = Math.max(20, Math.round(120 * intensity))
    const streaks = streaksRef.current

    const spawnStreak = (initial = false): RainStreak => ({
      x: Math.random() * canvas.width,
      y: initial ? Math.random() * canvas.height : -Math.random() * canvas.height * 0.2,
      speed: (1 + Math.random() * 2.5) * speed,
      length: (40 + Math.random() * 100) * window.devicePixelRatio,
      hue: Math.random() < 0.7 ? 'primary' : 'secondary',
      alpha: 0.4 + Math.random() * 0.6
    })

    streaks.length = 0
    for (let i = 0; i < targetCount; i++) streaks.push(spawnStreak(true))

    const readThemeColor = (varName: string, fallback: string): string => {
      try {
        const v = getComputedStyle(document.documentElement).getPropertyValue(varName).trim()
        return v || fallback
      } catch { return fallback }
    }

    const draw = () => {
      const w = canvas.width
      const h = canvas.height

      // Clear with slight alpha → motion-blur tail without a separate trail buffer
      ctx.fillStyle = 'rgba(0,0,0,0.18)'
      ctx.fillRect(0, 0, w, h)

      const primary = readThemeColor('--primary', '#a855f7')
      const secondary = readThemeColor('--secondary', '#f472b6')

      ctx.globalCompositeOperation = 'lighter'
      for (const s of streaks) {
        const grad = ctx.createLinearGradient(s.x, s.y, s.x, s.y + s.length)
        const color = s.hue === 'primary' ? primary : secondary
        grad.addColorStop(0, 'rgba(0,0,0,0)')
        grad.addColorStop(1, color)

        ctx.strokeStyle = grad
        ctx.globalAlpha = s.alpha
        ctx.lineWidth = 1.6 * window.devicePixelRatio
        ctx.beginPath()
        ctx.moveTo(s.x, s.y)
        ctx.lineTo(s.x, s.y + s.length)
        ctx.stroke()

        s.y += s.speed * window.devicePixelRatio
        if (s.y > h) Object.assign(s, spawnStreak(false))
      }
      ctx.globalAlpha = 1
      ctx.globalCompositeOperation = 'source-over'

      rafRef.current = requestAnimationFrame(draw)
    }

    rafRef.current = requestAnimationFrame(draw)

    return () => {
      window.removeEventListener('resize', resize)
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    }
  }, [enabled, intensity, speed])

  if (!enabled) return null
  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none fixed inset-0 z-0"
      style={{ width: '100vw', height: '100vh', mixBlendMode: 'screen', opacity: 0.7 }}
      aria-hidden
    />
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// LIGHTNING VEIL
// Random low-frequency screen-wide flashes with branching paths. Subtle by
// default — a flash every ~6-12s. Pairs well with stormy themes.
// ─────────────────────────────────────────────────────────────────────────────
interface LightningVeilProps {
  enabled?: boolean
  intensity?: number  // 0-1 — affects flash brightness + frequency
}
export function LightningVeil({ enabled = true, intensity = 0.5 }: LightningVeilProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const rafRef = useRef<number | null>(null)
  const nextFlashRef = useRef(0)
  const flashStateRef = useRef<{ active: boolean; t: number; bolts: Array<Array<[number, number]>> }>({
    active: false, t: 0, bolts: []
  })

  useEffect(() => {
    if (!enabled) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const resize = () => {
      canvas.width = window.innerWidth * window.devicePixelRatio
      canvas.height = window.innerHeight * window.devicePixelRatio
    }
    resize()
    window.addEventListener('resize', resize)

    const buildBolt = (startX: number, startY: number, endY: number): Array<[number, number]> => {
      const points: Array<[number, number]> = []
      const segments = 14
      let x = startX
      let y = startY
      for (let i = 0; i <= segments; i++) {
        const progress = i / segments
        const targetX = startX + (Math.random() - 0.5) * 80 * window.devicePixelRatio
        x = x * 0.7 + targetX * 0.3
        y = startY + (endY - startY) * progress
        points.push([x, y])
      }
      return points
    }

    const triggerFlash = () => {
      const w = canvas.width
      const numBolts = 1 + (Math.random() < 0.3 * intensity ? 1 : 0)
      const bolts: Array<Array<[number, number]>> = []
      for (let i = 0; i < numBolts; i++) {
        bolts.push(buildBolt(Math.random() * w, 0, canvas.height))
      }
      flashStateRef.current = { active: true, t: 0, bolts }
    }

    const minInterval = 4000  // ms
    const maxInterval = 14000
    const scheduleNext = (now: number) => {
      const span = maxInterval - (maxInterval - minInterval) * intensity
      nextFlashRef.current = now + minInterval + Math.random() * span
    }

    scheduleNext(performance.now())

    const draw = () => {
      const now = performance.now()
      const w = canvas.width
      const h = canvas.height
      ctx.clearRect(0, 0, w, h)

      if (!flashStateRef.current.active && now >= nextFlashRef.current) {
        triggerFlash()
        scheduleNext(now)
      }

      const fs = flashStateRef.current
      if (fs.active) {
        fs.t += 1 / 60
        const flashDuration = 0.45  // seconds
        const progress = fs.t / flashDuration
        if (progress >= 1) {
          fs.active = false
        } else {
          // Two-spike flicker — initial bright, soft second peak
          const envelope = Math.max(0, Math.cos(progress * Math.PI * 1.7) * Math.exp(-progress * 4))
          const flashAlpha = 0.28 * intensity * envelope

          // Veil
          ctx.fillStyle = `rgba(220, 230, 255, ${flashAlpha})`
          ctx.fillRect(0, 0, w, h)

          // Bolts
          ctx.strokeStyle = `rgba(220, 240, 255, ${0.85 * envelope})`
          ctx.lineWidth = 2.2 * window.devicePixelRatio
          ctx.shadowColor = 'rgba(160, 200, 255, 0.9)'
          ctx.shadowBlur = 18 * window.devicePixelRatio
          for (const bolt of fs.bolts) {
            ctx.beginPath()
            for (let i = 0; i < bolt.length; i++) {
              const [x, y] = bolt[i]
              if (i === 0) ctx.moveTo(x, y)
              else ctx.lineTo(x, y)
            }
            ctx.stroke()
          }
          ctx.shadowBlur = 0
        }
      }

      rafRef.current = requestAnimationFrame(draw)
    }

    rafRef.current = requestAnimationFrame(draw)

    return () => {
      window.removeEventListener('resize', resize)
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    }
  }, [enabled, intensity])

  if (!enabled) return null
  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none fixed inset-0 z-0"
      style={{ width: '100vw', height: '100vh', mixBlendMode: 'screen' }}
      aria-hidden
    />
  )
}

// Re-export as a convenience bundle.
export const NewAmbientEffects = { AuroraBands, NeonRain, LightningVeil }
export default NewAmbientEffects
