// File: src/renderer/components/VisualStimulants.tsx
// 15 Visual Sexual Stimulants for Maximum Arousal Experience

import React, { useEffect, useState, useRef } from 'react'

// ═══════════════════════════════════════════════════════════════════════════
// 1. PULSING BORDER - Rhythmic breathing effect
// ═══════════════════════════════════════════════════════════════════════════
export const PulsingBorder: React.FC<{
  children: React.ReactNode
  intensity?: number // 0-10
  color?: string
  className?: string
}> = ({ children, intensity = 5, color = 'var(--primary)', className = '' }) => {
  const pulseSpeed = 2 - intensity * 0.15 // 2s to 0.5s
  const pulseOpacity = 0.2 + intensity * 0.06 // 0.2 to 0.8

  return (
    <div className={`relative ${className}`}>
      <div
        className="absolute inset-0 rounded-xl pointer-events-none"
        style={{
          boxShadow: `0 0 ${10 + intensity * 3}px ${color}`,
          animation: `pulsingBorder ${pulseSpeed}s ease-in-out infinite`,
          opacity: pulseOpacity,
        }}
      />
      {children}
      <style>{`
        @keyframes pulsingBorder {
          0%, 100% { opacity: ${pulseOpacity * 0.5}; transform: scale(1); }
          50% { opacity: ${pulseOpacity}; transform: scale(1.02); }
        }
      `}</style>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// 2. BREATHING GLOW - Soft ambient glow that breathes
// ═══════════════════════════════════════════════════════════════════════════
export const BreathingGlow: React.FC<{
  children: React.ReactNode
  color?: string
  size?: number
}> = ({ children, color = 'rgba(255, 107, 157, 0.3)', size = 100 }) => {
  return (
    <div className="relative">
      <div
        className="absolute inset-0 -z-10 blur-3xl pointer-events-none"
        style={{
          background: `radial-gradient(circle at center, ${color} 0%, transparent 70%)`,
          animation: 'breathingGlow 4s ease-in-out infinite',
          width: `${size}%`,
          height: `${size}%`,
          left: `${(100 - size) / 2}%`,
          top: `${(100 - size) / 2}%`,
        }}
      />
      {children}
      <style>{`
        @keyframes breathingGlow {
          0%, 100% { opacity: 0.4; transform: scale(0.95); }
          50% { opacity: 0.8; transform: scale(1.05); }
        }
      `}</style>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. HEAT SHIMMER - Wavy distortion effect
// ═══════════════════════════════════════════════════════════════════════════
export const HeatShimmer: React.FC<{
  enabled?: boolean
  intensity?: number
}> = ({ enabled = true, intensity = 5 }) => {
  if (!enabled) return null

  return (
    <>
      <div
        className="fixed inset-0 pointer-events-none z-[9980]"
        style={{
          background: `url("data:image/svg+xml,%3Csvg viewBox='0 0 400 400' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='0.03'/%3E%3C/svg%3E")`,
          animation: `heatShimmer ${8 - intensity * 0.5}s linear infinite`,
        }}
      />
      <style>{`
        @keyframes heatShimmer {
          0% { transform: translateY(0); }
          100% { transform: translateY(-20px); }
        }
      `}</style>
    </>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// 4. PLEASURE PARTICLES - Floating particles that drift upward
// ═══════════════════════════════════════════════════════════════════════════
export const PleasureParticles: React.FC<{
  count?: number
  colors?: string[]
  enabled?: boolean
}> = ({ count = 15, colors = ['#ff6b9d', '#c44569', '#f8a5c2'], enabled = true }) => {
  const [particles, setParticles] = useState<Array<{
    id: number
    x: number
    y: number
    size: number
    color: string
    duration: number
    delay: number
  }>>([])

  useEffect(() => {
    if (!enabled) return
    const newParticles = Array.from({ length: count }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      y: 100 + Math.random() * 20,
      size: 3 + Math.random() * 5,
      color: colors[Math.floor(Math.random() * colors.length)],
      duration: 8 + Math.random() * 8,
      delay: Math.random() * 5,
    }))
    setParticles(newParticles)
  }, [count, enabled])

  if (!enabled) return null

  return (
    <div className="fixed inset-0 pointer-events-none z-[9985] overflow-hidden">
      {particles.map((p) => (
        <div
          key={p.id}
          className="absolute rounded-full"
          style={{
            left: `${p.x}%`,
            bottom: `-${p.size}px`,
            width: p.size,
            height: p.size,
            background: `radial-gradient(circle, ${p.color} 0%, transparent 70%)`,
            animation: `pleasureFloat ${p.duration}s ease-in-out infinite`,
            animationDelay: `${p.delay}s`,
          }}
        />
      ))}
      <style>{`
        @keyframes pleasureFloat {
          0% { transform: translateY(0) translateX(0) scale(1); opacity: 0; }
          10% { opacity: 0.8; }
          50% { transform: translateY(-50vh) translateX(20px) scale(1.2); opacity: 0.6; }
          90% { opacity: 0.3; }
          100% { transform: translateY(-100vh) translateX(-10px) scale(0.5); opacity: 0; }
        }
      `}</style>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// 5. AROUSAL GRADIENT - Color transitions based on arousal level
// ═══════════════════════════════════════════════════════════════════════════
export const ArousalGradient: React.FC<{
  level: number // 0-10
  children: React.ReactNode
}> = ({ level, children }) => {
  // Gradient from cool to hot
  const gradients = [
    'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)', // 0 - Cool dark
    'linear-gradient(135deg, #1a1a2e 0%, #1e3a5f 100%)', // 1
    'linear-gradient(135deg, #1e2a3a 0%, #2a3f5f 100%)', // 2
    'linear-gradient(135deg, #2a2a3e 0%, #3a2f5f 100%)', // 3
    'linear-gradient(135deg, #3a2a4e 0%, #4a2f5f 100%)', // 4 - Warming
    'linear-gradient(135deg, #4a2a4e 0%, #5a2f5f 100%)', // 5
    'linear-gradient(135deg, #5a2a4e 0%, #6a2f4f 100%)', // 6
    'linear-gradient(135deg, #6a2a3e 0%, #7a2f3f 100%)', // 7 - Hot
    'linear-gradient(135deg, #7a2a3e 0%, #8a2f3f 100%)', // 8
    'linear-gradient(135deg, #8a2a2e 0%, #9a1f2f 100%)', // 9
    'linear-gradient(135deg, #9a1a1e 0%, #c44569 100%)', // 10 - Maximum heat
  ]

  const gradient = gradients[Math.min(10, Math.max(0, Math.floor(level)))]

  return (
    <div
      style={{
        background: gradient,
        transition: 'background 2s ease',
      }}
    >
      {children}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// 6. HEARTBEAT PULSE - Rhythmic pulsing effect
// ═══════════════════════════════════════════════════════════════════════════
export const HeartbeatPulse: React.FC<{
  bpm?: number // beats per minute
  color?: string
  enabled?: boolean
}> = ({ bpm = 80, color = 'rgba(255, 107, 157, 0.2)', enabled = true }) => {
  if (!enabled) return null

  const duration = 60 / bpm // seconds per beat

  return (
    <>
      <div
        className="fixed inset-0 pointer-events-none z-[9975]"
        style={{
          background: `radial-gradient(ellipse at center, ${color} 0%, transparent 70%)`,
          animation: `heartbeat ${duration}s ease-in-out infinite`,
        }}
      />
      <style>{`
        @keyframes heartbeat {
          0%, 100% { opacity: 0; transform: scale(0.95); }
          15% { opacity: 1; transform: scale(1.05); }
          30% { opacity: 0.3; transform: scale(0.98); }
          45% { opacity: 0.8; transform: scale(1.02); }
          60% { opacity: 0; transform: scale(0.95); }
        }
      `}</style>
    </>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// 7. SENSUAL BLUR - Soft focus effect at edges
// ═══════════════════════════════════════════════════════════════════════════
export const SensualBlur: React.FC<{
  intensity?: number // 0-10
  enabled?: boolean
}> = ({ intensity = 5, enabled = true }) => {
  if (!enabled || intensity <= 0) return null

  const blurAmount = intensity * 0.5

  return (
    <div
      className="fixed inset-0 pointer-events-none z-[9970]"
      style={{
        background: `radial-gradient(ellipse at center, transparent 50%, rgba(0,0,0,${intensity * 0.02}) 100%)`,
        backdropFilter: `blur(${blurAmount}px)`,
        maskImage: 'radial-gradient(ellipse at center, transparent 40%, black 100%)',
        WebkitMaskImage: 'radial-gradient(ellipse at center, transparent 40%, black 100%)',
      }}
    />
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// 8. DESIRE RIPPLES - Expanding circular waves
// ═══════════════════════════════════════════════════════════════════════════
export const DesireRipples: React.FC<{
  origin?: { x: number; y: number }
  color?: string
  interval?: number // ms between ripples
  enabled?: boolean
}> = ({ origin = { x: 50, y: 50 }, color = 'rgba(255, 107, 157, 0.3)', interval = 3000, enabled = true }) => {
  const [ripples, setRipples] = useState<Array<{ id: number; x: number; y: number }>>([])
  const idRef = useRef(0)

  useEffect(() => {
    if (!enabled) return

    const timer = setInterval(() => {
      setRipples((prev) => [...prev.slice(-3), { id: idRef.current++, x: origin.x, y: origin.y }])
    }, interval)

    return () => clearInterval(timer)
  }, [enabled, interval, origin.x, origin.y])

  if (!enabled) return null

  return (
    <div className="fixed inset-0 pointer-events-none z-[9965] overflow-hidden">
      {ripples.map((ripple) => (
        <div
          key={ripple.id}
          className="absolute rounded-full"
          style={{
            left: `${ripple.x}%`,
            top: `${ripple.y}%`,
            transform: 'translate(-50%, -50%)',
            border: `2px solid ${color}`,
            animation: 'rippleExpand 4s ease-out forwards',
          }}
        />
      ))}
      <style>{`
        @keyframes rippleExpand {
          0% { width: 0; height: 0; opacity: 1; }
          100% { width: 200vmax; height: 200vmax; opacity: 0; }
        }
      `}</style>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// 9. LUSTFUL LENS - Vignette with color tint
// ═══════════════════════════════════════════════════════════════════════════
export const LustfulLens: React.FC<{
  tint?: string
  intensity?: number // 0-10
}> = ({ tint = 'rgba(255, 50, 100, 0.1)', intensity = 5 }) => {
  if (intensity <= 0) return null

  return (
    <div
      className="fixed inset-0 pointer-events-none z-[9960]"
      style={{
        background: `radial-gradient(ellipse at center, ${tint} 0%, transparent 60%),
                     radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,${intensity * 0.05}) 100%)`,
      }}
    />
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// 10. ECSTASY FLASH - Brief bright flashes
// ═══════════════════════════════════════════════════════════════════════════
export const EcstasyFlash: React.FC<{
  trigger?: number // increment to trigger flash
  color?: string
  duration?: number
}> = ({ trigger = 0, color = 'rgba(255, 255, 255, 0.3)', duration = 200 }) => {
  const [flashing, setFlashing] = useState(false)

  useEffect(() => {
    if (trigger > 0) {
      setFlashing(true)
      const timer = setTimeout(() => setFlashing(false), duration)
      return () => clearTimeout(timer)
    }
  }, [trigger, duration])

  if (!flashing) return null

  return (
    <div
      className="fixed inset-0 pointer-events-none z-[9999]"
      style={{
        background: color,
        animation: `ecstasyFlash ${duration}ms ease-out forwards`,
      }}
    >
      <style>{`
        @keyframes ecstasyFlash {
          0% { opacity: 1; }
          100% { opacity: 0; }
        }
      `}</style>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// 11. PASSION TRAIL - Mouse/touch following effect
// ═══════════════════════════════════════════════════════════════════════════
export const PassionTrail: React.FC<{
  color?: string
  size?: number
  enabled?: boolean
}> = ({ color = 'rgba(255, 107, 157, 0.5)', size = 20, enabled = true }) => {
  const [trails, setTrails] = useState<Array<{ id: number; x: number; y: number }>>([])
  const idRef = useRef(0)

  useEffect(() => {
    if (!enabled) return

    const handleMove = (e: MouseEvent | TouchEvent) => {
      const x = 'touches' in e ? e.touches[0].clientX : e.clientX
      const y = 'touches' in e ? e.touches[0].clientY : e.clientY

      setTrails((prev) => [...prev.slice(-10), { id: idRef.current++, x, y }])
    }

    window.addEventListener('mousemove', handleMove)
    window.addEventListener('touchmove', handleMove)

    return () => {
      window.removeEventListener('mousemove', handleMove)
      window.removeEventListener('touchmove', handleMove)
    }
  }, [enabled])

  if (!enabled) return null

  return (
    <div className="fixed inset-0 pointer-events-none z-[9955]">
      {trails.map((trail, i) => (
        <div
          key={trail.id}
          className="absolute rounded-full"
          style={{
            left: trail.x,
            top: trail.y,
            width: size * (1 - i * 0.08),
            height: size * (1 - i * 0.08),
            background: `radial-gradient(circle, ${color} 0%, transparent 70%)`,
            transform: 'translate(-50%, -50%)',
            opacity: 1 - i * 0.1,
            animation: 'trailFade 0.5s ease-out forwards',
          }}
        />
      ))}
      <style>{`
        @keyframes trailFade {
          to { opacity: 0; transform: translate(-50%, -50%) scale(0.5); }
        }
      `}</style>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// 12. INTIMATE GLOW - Soft glow around interactive elements
// ═══════════════════════════════════════════════════════════════════════════
export const IntimateGlow: React.FC<{
  children: React.ReactNode
  color?: string
  intensity?: number
  className?: string
}> = ({ children, color = 'var(--primary)', intensity = 5, className = '' }) => {
  return (
    <div
      className={`relative group ${className}`}
      style={{
        filter: `drop-shadow(0 0 ${intensity}px ${color})`,
        transition: 'filter 0.3s ease',
      }}
    >
      {children}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// 13. CLIMAX BURST - Particle explosion effect
// ═══════════════════════════════════════════════════════════════════════════
export const ClimaxBurst: React.FC<{
  trigger?: number // increment to trigger burst
  x?: number
  y?: number
  particleCount?: number
  colors?: string[]
}> = ({ trigger = 0, x = 50, y = 50, particleCount = 30, colors = ['#ff6b9d', '#c44569', '#f8a5c2', '#fff'] }) => {
  const [particles, setParticles] = useState<Array<{
    id: number
    angle: number
    distance: number
    size: number
    color: string
  }>>([])

  useEffect(() => {
    if (trigger > 0) {
      const newParticles = Array.from({ length: particleCount }, (_, i) => ({
        id: Date.now() + i,
        angle: (i / particleCount) * 360,
        distance: 100 + Math.random() * 200,
        size: 4 + Math.random() * 8,
        color: colors[Math.floor(Math.random() * colors.length)],
      }))
      setParticles(newParticles)

      const timer = setTimeout(() => setParticles([]), 1500)
      return () => clearTimeout(timer)
    }
  }, [trigger, particleCount])

  if (particles.length === 0) return null

  return (
    <div className="fixed inset-0 pointer-events-none z-[9998]">
      {particles.map((p) => (
        <div
          key={p.id}
          className="absolute rounded-full"
          style={{
            left: `${x}%`,
            top: `${y}%`,
            width: p.size,
            height: p.size,
            background: p.color,
            animation: `burstParticle 1s ease-out forwards`,
            ['--angle' as any]: `${p.angle}deg`,
            ['--distance' as any]: `${p.distance}px`,
          }}
        />
      ))}
      <style>{`
        @keyframes burstParticle {
          0% {
            transform: translate(-50%, -50%) rotate(var(--angle)) translateX(0);
            opacity: 1;
          }
          100% {
            transform: translate(-50%, -50%) rotate(var(--angle)) translateX(var(--distance));
            opacity: 0;
          }
        }
      `}</style>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// 14. SEDUCTION WAVE - Wave animation across screen
// ═══════════════════════════════════════════════════════════════════════════
export const SeductionWave: React.FC<{
  color?: string
  speed?: number
  enabled?: boolean
}> = ({ color = 'rgba(255, 107, 157, 0.1)', speed = 3, enabled = true }) => {
  if (!enabled) return null

  return (
    <>
      <div
        className="fixed inset-0 pointer-events-none z-[9945]"
        style={{
          background: `linear-gradient(90deg, transparent 0%, ${color} 50%, transparent 100%)`,
          animation: `seductionWave ${speed}s ease-in-out infinite`,
        }}
      />
      <style>{`
        @keyframes seductionWave {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
      `}</style>
    </>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// 15. TEMPTATION AURA - Animated aura around content
// ═══════════════════════════════════════════════════════════════════════════
export const TemptationAura: React.FC<{
  children: React.ReactNode
  colors?: string[]
  speed?: number
  className?: string
}> = ({
  children,
  colors = ['#ff6b9d', '#c44569', '#f8a5c2', '#ff6b9d'],
  speed = 3,
  className = ''
}) => {
  const gradientColors = colors.join(', ')

  return (
    <div className={`relative ${className}`}>
      <div
        className="absolute -inset-1 rounded-xl opacity-50 blur-sm"
        style={{
          background: `linear-gradient(45deg, ${gradientColors})`,
          backgroundSize: '400% 400%',
          animation: `auraShift ${speed}s ease infinite`,
        }}
      />
      <div className="relative">{children}</div>
      <style>{`
        @keyframes auraShift {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
      `}</style>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// 16. SPARKLE OVERLAY - Cinema-quality floating sparkle particles
// ═══════════════════════════════════════════════════════════════════════════
export const SparkleOverlay: React.FC<{
  enabled?: boolean
  density?: number // 1-10
  colors?: string[]
  speed?: number // 1-10
}> = ({ enabled = true, density = 5, colors = ['rgba(255,255,255,0.9)', 'rgba(255,215,0,0.8)', 'rgba(255,182,193,0.7)'], speed = 5 }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animationRef = useRef<number>(0)
  const particlesRef = useRef<Array<{
    x: number
    y: number
    size: number
    color: string
    speedX: number
    speedY: number
    opacity: number
    pulse: number
    pulseSpeed: number
  }>>([])

  useEffect(() => {
    if (!enabled) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Set canvas size
    const resize = () => {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
    }
    resize()
    window.addEventListener('resize', resize)

    // Initialize particles
    const count = density * 12
    particlesRef.current = Array.from({ length: count }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      size: 1 + Math.random() * 2.5,
      color: colors[Math.floor(Math.random() * colors.length)],
      speedX: (Math.random() - 0.5) * 0.3,
      speedY: -0.2 - Math.random() * 0.4,
      opacity: 0.3 + Math.random() * 0.7,
      pulse: Math.random() * Math.PI * 2,
      pulseSpeed: 0.02 + Math.random() * 0.03,
    }))

    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      particlesRef.current.forEach((p) => {
        // Update position
        p.x += p.speedX * (speed / 5)
        p.y += p.speedY * (speed / 5)
        p.pulse += p.pulseSpeed

        // Wrap around screen
        if (p.y < -10) {
          p.y = canvas.height + 10
          p.x = Math.random() * canvas.width
        }
        if (p.x < -10) p.x = canvas.width + 10
        if (p.x > canvas.width + 10) p.x = -10

        // Calculate pulsing opacity
        const pulseOpacity = p.opacity * (0.5 + 0.5 * Math.sin(p.pulse))

        // Draw sparkle with soft glow
        const gradient = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size * 3)
        gradient.addColorStop(0, p.color.replace(/[\d.]+\)$/, `${pulseOpacity})`))
        gradient.addColorStop(0.4, p.color.replace(/[\d.]+\)$/, `${pulseOpacity * 0.5})`))
        gradient.addColorStop(1, 'transparent')

        ctx.beginPath()
        ctx.arc(p.x, p.y, p.size * 3, 0, Math.PI * 2)
        ctx.fillStyle = gradient
        ctx.fill()

        // Draw bright center
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.size * 0.5, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(255,255,255,${pulseOpacity})`
        ctx.fill()
      })

      animationRef.current = requestAnimationFrame(animate)
    }

    animate()

    return () => {
      cancelAnimationFrame(animationRef.current)
      window.removeEventListener('resize', resize)
    }
  }, [enabled, density, speed, colors.join(',')])

  if (!enabled) return null

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none z-[9935]"
      style={{ mixBlendMode: 'screen' }}
    />
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// 17. BOKEH OVERLAY - Cinematic soft blurry light circles
// ═══════════════════════════════════════════════════════════════════════════
export const BokehOverlay: React.FC<{
  enabled?: boolean
  count?: number
  colors?: string[]
}> = ({ enabled = true, count = 12, colors = ['rgba(255,107,157,0.15)', 'rgba(255,182,193,0.12)', 'rgba(255,255,255,0.1)', 'rgba(255,200,150,0.1)'] }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animationRef = useRef<number>(0)
  const bokehRef = useRef<Array<{
    x: number
    y: number
    size: number
    color: string
    speedX: number
    speedY: number
    opacity: number
    phase: number
  }>>([])

  useEffect(() => {
    if (!enabled) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const resize = () => {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
    }
    resize()
    window.addEventListener('resize', resize)

    // Initialize bokeh circles
    bokehRef.current = Array.from({ length: count }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      size: 60 + Math.random() * 150,
      color: colors[Math.floor(Math.random() * colors.length)],
      speedX: (Math.random() - 0.5) * 0.15,
      speedY: (Math.random() - 0.5) * 0.15,
      opacity: 0.1 + Math.random() * 0.15,
      phase: Math.random() * Math.PI * 2,
    }))

    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      bokehRef.current.forEach((b) => {
        // Slow, dreamy movement
        b.x += b.speedX
        b.y += b.speedY
        b.phase += 0.005

        // Wrap around with padding
        if (b.x < -b.size) b.x = canvas.width + b.size
        if (b.x > canvas.width + b.size) b.x = -b.size
        if (b.y < -b.size) b.y = canvas.height + b.size
        if (b.y > canvas.height + b.size) b.y = -b.size

        // Pulsing opacity
        const pulseOpacity = b.opacity * (0.7 + 0.3 * Math.sin(b.phase))

        // Draw soft bokeh circle with multiple gradient layers
        const gradient = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.size)
        gradient.addColorStop(0, b.color.replace(/[\d.]+\)$/, `${pulseOpacity * 0.8})`))
        gradient.addColorStop(0.5, b.color.replace(/[\d.]+\)$/, `${pulseOpacity * 0.4})`))
        gradient.addColorStop(0.8, b.color.replace(/[\d.]+\)$/, `${pulseOpacity * 0.1})`))
        gradient.addColorStop(1, 'transparent')

        ctx.beginPath()
        ctx.arc(b.x, b.y, b.size, 0, Math.PI * 2)
        ctx.fillStyle = gradient
        ctx.fill()
      })

      animationRef.current = requestAnimationFrame(animate)
    }

    animate()

    return () => {
      cancelAnimationFrame(animationRef.current)
      window.removeEventListener('resize', resize)
    }
  }, [enabled, count, colors.join(',')])

  if (!enabled) return null

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none z-[9930]"
      style={{ mixBlendMode: 'screen', filter: 'blur(20px)' }}
    />
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// 18. STARFIELD OVERLAY - Cinematic twinkling stars
// ═══════════════════════════════════════════════════════════════════════════
export const StarfieldOverlay: React.FC<{
  enabled?: boolean
  density?: number
}> = ({ enabled = true, density = 50 }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animationRef = useRef<number>(0)
  const starsRef = useRef<Array<{
    x: number
    y: number
    size: number
    brightness: number
    twinkleSpeed: number
    phase: number
  }>>([])

  useEffect(() => {
    if (!enabled) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const resize = () => {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
    }
    resize()
    window.addEventListener('resize', resize)

    // Initialize stars with varying properties
    starsRef.current = Array.from({ length: density }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      size: 0.5 + Math.random() * 2,
      brightness: 0.3 + Math.random() * 0.7,
      twinkleSpeed: 0.01 + Math.random() * 0.03,
      phase: Math.random() * Math.PI * 2,
    }))

    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      starsRef.current.forEach((star) => {
        star.phase += star.twinkleSpeed

        // Calculate twinkling brightness with smooth sine wave
        const twinkle = 0.4 + 0.6 * Math.sin(star.phase)
        const currentBrightness = star.brightness * twinkle

        // Draw star with soft glow
        const gradient = ctx.createRadialGradient(star.x, star.y, 0, star.x, star.y, star.size * 4)
        gradient.addColorStop(0, `rgba(255, 255, 255, ${currentBrightness})`)
        gradient.addColorStop(0.3, `rgba(255, 255, 255, ${currentBrightness * 0.5})`)
        gradient.addColorStop(0.6, `rgba(200, 220, 255, ${currentBrightness * 0.2})`)
        gradient.addColorStop(1, 'transparent')

        ctx.beginPath()
        ctx.arc(star.x, star.y, star.size * 4, 0, Math.PI * 2)
        ctx.fillStyle = gradient
        ctx.fill()

        // Draw bright center point
        ctx.beginPath()
        ctx.arc(star.x, star.y, star.size * 0.5, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(255, 255, 255, ${currentBrightness})`
        ctx.fill()
      })

      animationRef.current = requestAnimationFrame(animate)
    }

    animate()

    return () => {
      cancelAnimationFrame(animationRef.current)
      window.removeEventListener('resize', resize)
    }
  }, [enabled, density])

  if (!enabled) return null

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none z-[9925]"
      style={{ mixBlendMode: 'screen' }}
    />
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// 19. FILM GRAIN OVERLAY - CRT TV / VHS style with scanlines
// ═══════════════════════════════════════════════════════════════════════════
export const FilmGrainOverlay: React.FC<{
  enabled?: boolean
  opacity?: number
  speed?: number // 1-10, controls grain animation speed
  scanlines?: boolean // Enable CRT scanlines
  scanlineIntensity?: number // 0-1
}> = ({ enabled = true, opacity = 0.15, speed = 5, scanlines = true, scanlineIntensity = 0.3 }) => {
  const grainCanvasRef = useRef<HTMLCanvasElement>(null)
  const scanlineCanvasRef = useRef<HTMLCanvasElement>(null)
  const animationRef = useRef<number>(0)
  const frameCount = useRef(0)
  const scanlineOffset = useRef(0)

  // Grain effect
  useEffect(() => {
    if (!enabled) return
    const canvas = grainCanvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d', { alpha: true })
    if (!ctx) return

    // Use smaller canvas for performance, scale up with CSS
    const scale = 0.4
    const resize = () => {
      canvas.width = Math.floor(window.innerWidth * scale)
      canvas.height = Math.floor(window.innerHeight * scale)
    }
    resize()
    window.addEventListener('resize', resize)

    // Pre-generate noise frames with varying intensity
    const noiseFrames: ImageData[] = []
    const frameTotal = 10
    for (let f = 0; f < frameTotal; f++) {
      const imageData = ctx.createImageData(canvas.width, canvas.height)
      const data = imageData.data
      for (let i = 0; i < data.length; i += 4) {
        // More varied noise - some pixels brighter, some darker
        const noise = Math.random()
        const intensity = noise < 0.5
          ? Math.floor(noise * 2 * 180) // Darker pixels
          : Math.floor(128 + (noise - 0.5) * 2 * 127) // Brighter pixels
        data[i] = intensity     // R
        data[i + 1] = intensity // G
        data[i + 2] = intensity // B
        data[i + 3] = 255
      }
      noiseFrames.push(imageData)
    }

    const animate = () => {
      frameCount.current++

      // Update grain at variable speed
      const updateInterval = Math.max(1, 5 - Math.floor(speed / 2.5))
      if (frameCount.current % updateInterval === 0) {
        const frameIndex = Math.floor(Math.random() * frameTotal)
        ctx.putImageData(noiseFrames[frameIndex], 0, 0)
      }

      animationRef.current = requestAnimationFrame(animate)
    }

    animate()

    return () => {
      cancelAnimationFrame(animationRef.current)
      window.removeEventListener('resize', resize)
    }
  }, [enabled, speed])

  // Scanline effect - separate canvas for crisp lines + Pip-Boy scanner
  useEffect(() => {
    if (!enabled || !scanlines) return
    const canvas = scanlineCanvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Pip-Boy style scanner state
    let scannerY = -100
    let scannerActive = false
    let scannerSpeed = 0
    let nextScanTime = Date.now() + 2000 + Math.random() * 5000

    const resize = () => {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
    }

    const drawScanlines = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      // Pip-Boy style scanning beam - the main effect (no static scanlines)
      if (scannerActive) {
        // Wide glow area above the scan line (like Fallout 4 terminal refresh)
        const glowHeight = 120
        const glowGradient = ctx.createLinearGradient(0, scannerY - glowHeight, 0, scannerY + 20)
        glowGradient.addColorStop(0, 'transparent')
        glowGradient.addColorStop(0.5, `rgba(120, 255, 180, ${scanlineIntensity * 0.08})`)
        glowGradient.addColorStop(0.8, `rgba(150, 255, 200, ${scanlineIntensity * 0.15})`)
        glowGradient.addColorStop(0.95, `rgba(200, 255, 220, ${scanlineIntensity * 0.25})`)
        glowGradient.addColorStop(1, `rgba(255, 255, 255, ${scanlineIntensity * 0.4})`)

        ctx.fillStyle = glowGradient
        ctx.fillRect(0, scannerY - glowHeight, canvas.width, glowHeight + 20)

        // The main bright scan line
        ctx.fillStyle = `rgba(200, 255, 220, ${scanlineIntensity * 0.7})`
        ctx.fillRect(0, scannerY - 1, canvas.width, 3)

        // Slight trail below the line
        const trailGradient = ctx.createLinearGradient(0, scannerY, 0, scannerY + 40)
        trailGradient.addColorStop(0, `rgba(150, 255, 200, ${scanlineIntensity * 0.2})`)
        trailGradient.addColorStop(1, 'transparent')
        ctx.fillStyle = trailGradient
        ctx.fillRect(0, scannerY, canvas.width, 40)

        // Update scanner position
        scannerY += scannerSpeed
        if (scannerY > canvas.height + 50) {
          scannerActive = false
          nextScanTime = Date.now() + 4000 + Math.random() * 10000 // Random 4-14 seconds
        }
      } else {
        // Check if it's time for a new scan
        if (Date.now() > nextScanTime) {
          scannerActive = true
          scannerY = -80
          scannerSpeed = 3 + Math.random() * 4 // Slower, smoother speed 3-7 pixels per frame
        }
      }

      // Subtle screen flicker (very occasional)
      if (Math.random() < 0.002) {
        ctx.fillStyle = `rgba(150, 255, 200, ${0.03 + Math.random() * 0.05})`
        ctx.fillRect(0, 0, canvas.width, canvas.height)
      }

      // Subtle vignette for CRT curvature feel
      const vignetteGradient = ctx.createRadialGradient(
        canvas.width / 2, canvas.height / 2, canvas.height * 0.4,
        canvas.width / 2, canvas.height / 2, canvas.height * 0.9
      )
      vignetteGradient.addColorStop(0, 'transparent')
      vignetteGradient.addColorStop(1, `rgba(0, 0, 0, ${scanlineIntensity * 0.15})`)
      ctx.fillStyle = vignetteGradient
      ctx.fillRect(0, 0, canvas.width, canvas.height)
    }

    resize()
    window.addEventListener('resize', resize)

    // Animate scanlines with Pip-Boy scanner
    let scanlineAnim: number
    const animateScanlines = () => {
      scanlineOffset.current += 0.03
      if (Math.random() < 0.001) {
        // Occasional VHS glitch - jump the scanlines
        scanlineOffset.current += Math.random() * 15
      }
      drawScanlines()
      scanlineAnim = requestAnimationFrame(animateScanlines)
    }
    animateScanlines()

    return () => {
      cancelAnimationFrame(scanlineAnim)
      window.removeEventListener('resize', resize)
    }
  }, [enabled, scanlines, scanlineIntensity])

  if (!enabled) return null

  return (
    <>
      {/* Grain layer - very high z-index to cover entire window including UI */}
      <canvas
        ref={grainCanvasRef}
        className="fixed inset-0 pointer-events-none z-[99990]"
        style={{
          opacity: opacity,
          mixBlendMode: 'overlay',
          width: '100%',
          height: '100%',
          imageRendering: 'pixelated',
        }}
      />
      {/* Scanline layer - very high z-index to cover entire window including UI */}
      {scanlines && (
        <canvas
          ref={scanlineCanvasRef}
          className="fixed inset-0 pointer-events-none z-[99991]"
          style={{
            opacity: 1,
            mixBlendMode: 'multiply',
          }}
        />
      )}
    </>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// 20. DREAMY HAZE OVERLAY - Cinematic soft dreamy atmosphere
// ═══════════════════════════════════════════════════════════════════════════
export const DreamyHazeOverlay: React.FC<{
  enabled?: boolean
  intensity?: number // 0-10
  color?: string
}> = ({ enabled = true, intensity = 5, color = 'rgba(255,150,180,0.25)' }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animationRef = useRef<number>(0)
  const timeRef = useRef(0)

  useEffect(() => {
    if (!enabled || intensity <= 0) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const resize = () => {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
    }
    resize()
    window.addEventListener('resize', resize)

    const hazePoints = [
      { x: 0.15, y: 0.1, size: 0.6, phase: 0 },
      { x: 0.85, y: 0.2, size: 0.5, phase: Math.PI / 3 },
      { x: 0.5, y: 0.45, size: 0.7, phase: Math.PI / 2 },
      { x: 0.2, y: 0.8, size: 0.5, phase: Math.PI },
      { x: 0.8, y: 0.85, size: 0.55, phase: Math.PI * 1.5 },
      { x: 0.4, y: 0.3, size: 0.45, phase: Math.PI * 0.7 },
      { x: 0.6, y: 0.7, size: 0.5, phase: Math.PI * 1.2 },
    ]

    const animate = () => {
      timeRef.current += 0.004
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      // Much stronger base opacity
      const baseOpacity = (intensity / 10) * 0.5

      hazePoints.forEach((point) => {
        const pulse = 0.6 + 0.4 * Math.sin(timeRef.current + point.phase)
        const x = canvas.width * (point.x + 0.03 * Math.sin(timeRef.current * 0.4 + point.phase))
        const y = canvas.height * (point.y + 0.03 * Math.cos(timeRef.current * 0.25 + point.phase))
        const size = Math.min(canvas.width, canvas.height) * point.size * pulse

        const gradient = ctx.createRadialGradient(x, y, 0, x, y, size)
        gradient.addColorStop(0, color.replace(/[\d.]+\)$/, `${baseOpacity * pulse})`))
        gradient.addColorStop(0.3, color.replace(/[\d.]+\)$/, `${baseOpacity * 0.6 * pulse})`))
        gradient.addColorStop(0.6, color.replace(/[\d.]+\)$/, `${baseOpacity * 0.3 * pulse})`))
        gradient.addColorStop(1, 'transparent')

        ctx.beginPath()
        ctx.arc(x, y, size, 0, Math.PI * 2)
        ctx.fillStyle = gradient
        ctx.fill()
      })

      // Stronger vignette
      const vignetteGradient = ctx.createRadialGradient(
        canvas.width / 2, canvas.height / 2, canvas.height * 0.2,
        canvas.width / 2, canvas.height / 2, canvas.height * 0.85
      )
      vignetteGradient.addColorStop(0, 'transparent')
      vignetteGradient.addColorStop(1, `rgba(0, 0, 0, ${intensity * 0.04})`)

      ctx.fillStyle = vignetteGradient
      ctx.fillRect(0, 0, canvas.width, canvas.height)

      animationRef.current = requestAnimationFrame(animate)
    }

    animate()

    return () => {
      cancelAnimationFrame(animationRef.current)
      window.removeEventListener('resize', resize)
    }
  }, [enabled, intensity, color])

  if (!enabled || intensity <= 0) return null

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none z-[9915]"
      style={{ mixBlendMode: 'screen', filter: 'blur(30px)' }}
    />
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// 21. CRT CURVED SCREEN OVERLAY - Enhanced retro CRT look with all classic effects
// ═══════════════════════════════════════════════════════════════════════════
export const CRTCurveOverlay: React.FC<{
  enabled?: boolean
  intensity?: number // 0-10, controls curvature amount
  showScanlines?: boolean
  vignetteStrength?: number // 0-1
  rgbSubpixels?: boolean // RGB subpixel simulation
  chromaticAberration?: boolean // Color separation at edges
  screenFlicker?: boolean // Random brightness flicker
  flickerIntensity?: number // 0-1
}> = ({
  enabled = true,
  intensity = 5,
  showScanlines = false,
  vignetteStrength = 0.4,
  rgbSubpixels = true,
  chromaticAberration = true,
  screenFlicker = true,
  flickerIntensity = 0.3
}) => {
  const [flickerOpacity, setFlickerOpacity] = useState(0)
  const flickerRef = useRef<number>()

  // Screen flicker effect - random subtle brightness variations
  useEffect(() => {
    if (!enabled || !screenFlicker) return

    let lastFlicker = Date.now()
    const animate = () => {
      const now = Date.now()
      // Flicker occasionally (every 50-200ms on average)
      if (now - lastFlicker > 50 + Math.random() * 150) {
        // Random flicker intensity, occasionally stronger
        const isStrongFlicker = Math.random() < 0.1
        const flicker = isStrongFlicker
          ? (Math.random() * 0.15 + 0.05) * flickerIntensity
          : (Math.random() * 0.04) * flickerIntensity
        setFlickerOpacity(flicker)
        lastFlicker = now

        // Quick decay
        setTimeout(() => setFlickerOpacity(0), 30 + Math.random() * 50)
      }
      flickerRef.current = requestAnimationFrame(animate)
    }

    flickerRef.current = requestAnimationFrame(animate)
    return () => {
      if (flickerRef.current) cancelAnimationFrame(flickerRef.current)
    }
  }, [enabled, screenFlicker, flickerIntensity])

  if (!enabled) return null

  // Calculate barrel distortion based on intensity (0-10 maps to subtle-strong curve)
  const borderRadius = `${intensity * 2}% / ${intensity * 1.5}%`
  const chromaticOffset = intensity * 0.15 // px offset for chromatic aberration

  return (
    <>
      {/* Chromatic Aberration - RGB color separation at edges */}
      {chromaticAberration && (
        <>
          {/* Red channel offset */}
          <div
            className="fixed inset-0 pointer-events-none z-[99983] mix-blend-screen"
            style={{
              background: `radial-gradient(ellipse at center, transparent 60%, rgba(255,0,0,${0.02 + intensity * 0.008}) 100%)`,
              transform: `translate(${chromaticOffset}px, 0)`,
              borderRadius,
            }}
          />
          {/* Cyan channel offset (opposite of red) */}
          <div
            className="fixed inset-0 pointer-events-none z-[99983] mix-blend-screen"
            style={{
              background: `radial-gradient(ellipse at center, transparent 60%, rgba(0,255,255,${0.02 + intensity * 0.008}) 100%)`,
              transform: `translate(${-chromaticOffset}px, 0)`,
              borderRadius,
            }}
          />
        </>
      )}

      {/* RGB Subpixel simulation - fine vertical RGB stripes */}
      {rgbSubpixels && (
        <div
          className="fixed inset-0 pointer-events-none z-[99984]"
          style={{
            backgroundImage: `repeating-linear-gradient(
              90deg,
              rgba(255,0,0,${0.02 + intensity * 0.003}) 0px,
              rgba(255,0,0,${0.02 + intensity * 0.003}) 1px,
              rgba(0,255,0,${0.02 + intensity * 0.003}) 1px,
              rgba(0,255,0,${0.02 + intensity * 0.003}) 2px,
              rgba(0,0,255,${0.02 + intensity * 0.003}) 2px,
              rgba(0,0,255,${0.02 + intensity * 0.003}) 3px
            )`,
            opacity: 0.4 + intensity * 0.06,
            mixBlendMode: 'overlay',
            borderRadius,
          }}
        />
      )}

      {/* Main CRT curvature overlay - vignette effect */}
      <div
        className="fixed inset-0 pointer-events-none z-[99985]"
        style={{
          background: `
            radial-gradient(
              ellipse at center,
              transparent 0%,
              transparent ${60 - intensity * 3}%,
              rgba(0,0,0,${vignetteStrength * 0.3}) ${75 - intensity * 2}%,
              rgba(0,0,0,${vignetteStrength * 0.6}) ${90 - intensity}%,
              rgba(0,0,0,${vignetteStrength}) 100%
            )
          `,
          boxShadow: `
            inset 0 0 ${80 + intensity * 10}px rgba(0,0,0,${vignetteStrength * 0.5}),
            inset 0 0 ${150 + intensity * 15}px rgba(0,0,0,${vignetteStrength * 0.3})
          `,
        }}
      />

      {/* Edge curvature simulation with subtle borders (barrel distortion feel) */}
      <div
        className="fixed inset-0 pointer-events-none z-[99986]"
        style={{
          borderRadius,
          boxShadow: `
            inset 0 0 ${40 + intensity * 8}px rgba(0,0,0,${0.2 + intensity * 0.03}),
            inset 0 ${-intensity * 2}px ${intensity * 8}px rgba(0,0,0,0.1),
            inset 0 ${intensity * 2}px ${intensity * 8}px rgba(0,0,0,0.1),
            inset ${-intensity * 2}px 0 ${intensity * 8}px rgba(0,0,0,0.1),
            inset ${intensity * 2}px 0 ${intensity * 8}px rgba(0,0,0,0.1)
          `,
        }}
      />

      {/* Screen edge highlight (subtle reflection on curved glass) */}
      <div
        className="fixed inset-0 pointer-events-none z-[99987]"
        style={{
          background: `
            linear-gradient(
              135deg,
              rgba(255,255,255,${0.02 + intensity * 0.005}) 0%,
              transparent 30%,
              transparent 70%,
              rgba(0,0,0,${0.05 + intensity * 0.01}) 100%
            )
          `,
          borderRadius,
        }}
      />

      {/* Fine CRT scanlines */}
      {showScanlines && (
        <div
          className="fixed inset-0 pointer-events-none z-[99988]"
          style={{
            background: `repeating-linear-gradient(
              0deg,
              transparent 0px,
              transparent 2px,
              rgba(0,0,0,${0.03 + intensity * 0.005}) 2px,
              rgba(0,0,0,${0.03 + intensity * 0.005}) 4px
            )`,
            borderRadius,
          }}
        />
      )}

      {/* Screen flicker overlay */}
      {screenFlicker && flickerOpacity > 0 && (
        <div
          className="fixed inset-0 pointer-events-none z-[99989]"
          style={{
            backgroundColor: `rgba(255,255,255,${flickerOpacity})`,
            mixBlendMode: 'overlay',
            transition: 'opacity 30ms linear',
          }}
        />
      )}
    </>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// 22. GOON WORDS SYSTEM - Floating provocative text with presets
// ═══════════════════════════════════════════════════════════════════════════

// Word pack presets
export const GOON_WORD_PACKS = {
  praise: {
    name: 'Praise',
    description: 'Encouraging affirmations',
    words: [
      'GOOD BOY', 'PERFECT STROKER', 'AMAZING SLUT', 'YES, LIKE THAT', 'SO GOOD FOR ME',
      'BEAUTIFUL COCK', 'HANDSOME AND HARD', 'OBEDIENT TOY', 'EAGER TO PLEASE', 'PRECIOUS CUMSLUT',
      'DESERVE THIS', 'SO PROUD OF YOU', 'SPECIAL SLUT', 'LOVED AND USED', 'APPROVED TO CUM',
      'PERFECT EDGER', 'GOOD PIGGY'
    ]
  },
  humiliation: {
    name: 'Humiliation',
    description: 'Degrading reminders',
    words: [
      'ASHAMED AND HARD', 'EMBARRASSED SLUT', 'EXPOSED FOR USE', 'NAKED AND WEAK', 'HELPLESS COCK',
      'LAUGHED AT', 'SO SMALL', 'INADEQUATE', 'INFERIOR FUCKTOY', 'BROKEN IN',
      'PUBLIC PROPERTY', 'DEGRADED HOLE', 'SHAMED STROKER', 'OBJECTIFIED', 'HUMILIATED PIG',
      'JUST A HOLE', 'RIDICULED AND USED'
    ]
  },
  insult: {
    name: 'Insult',
    description: 'Harsh degradation',
    words: [
      'USELESS IDIOT', 'PATHETIC STROKER', 'WORTHLESS CUMSLUT', 'DISGUSTING PIG', 'FILTHY WHORE',
      'LOSER', 'FREAK', 'DISGRACE', 'FAILURE', 'SCUM',
      'HUMAN TOILET', 'REVOLTING', 'MINDLESS DOLL', 'STUPID CUNT', 'GARBAGE',
      'PIECE OF SHIT', 'WASTE OF SPACE'
    ]
  },
  kink: {
    name: 'Kink',
    description: 'BDSM-themed words',
    words: [
      'SUBMIT', 'SERVE', 'WORSHIP COCK', 'PROPERTY', 'USE ME',
      'DEGRADE ME', 'OBEY', 'COLLARED SLUT', 'PAIN IS PLEASURE', "SIR'S FUCKTOY",
      "MASTER'S HOLE", 'DEVOTED', 'BOUND TO PLEASE', 'KNEEL AND STROKE', 'OBJECTIFIED',
      'FETISH DOLL', 'TOTAL SUBMISSION', 'OWNED'
    ]
  },
  goon: {
    name: 'Goon',
    description: 'Classic gooning words',
    words: [
      'GOON', 'STROKE', 'PUMP', 'EDGE', 'MINDLESS',
      'NO THOUGHTS', 'ADDICTED', 'PORN IS LIFE', 'LEAKING', 'DEEPER',
      'FOREVER', 'SPIRAL', 'BATE', 'COCKDRUNK', 'EMPTY HEAD',
      'RUIN IT', 'GOOD GOONER', 'LOOPED'
    ]
  },
  mommy: {
    name: 'Mommy',
    description: 'Nurturing domme vibes',
    words: [
      "MOMMY'S GOOD BOY", 'STROKE FOR MOMMY', 'CUM FOR MOMMY', 'GOOD BOY', "MOMMY'S COCK",
      'NURSE YOUR DICK', 'MILK IT BABY', 'LISTEN TO MOMMY', 'PRECIOUS BOY', 'MOMMY KNOWS BEST',
      'EMPTY FOR MOMMY', 'OBEDIENT BOY', "MOMMY'S TOY", "CUM IN MOMMY'S HAND", 'SAFE TO LEAK',
      'BE A GOOD BOY', 'THANK YOU MOMMY'
    ]
  },
  brat: {
    name: 'Brat',
    description: 'Bratty sub energy',
    words: [
      'SPOILED BRAT', 'DEMANDING BITCH', 'GREEDY LITTLE SLUT', 'WORSHIP ME', 'GIMME MORE COCK',
      'PRINCESS GETS WHAT SHE WANTS', 'EARN THIS PUSSY', 'THANK ME, DADDY', 'SUCH A GOOD TOY', 'NOW, PIGGY',
      'I OWN YOUR STROKES', 'BEG FOR IT', 'SPOILED AND FUCKED', 'DESERVE THIS', 'ENTITLED TO YOUR CUM',
      'BRATTY FUCKDOLL', 'MINE TO TEASE'
    ]
  },
  pervert: {
    name: 'Pervert',
    description: 'Shame and deviance',
    words: [
      'FILTHY PERVERT', 'DEPRAVED', 'OBSESSED WITH COCK', 'TWISTED FUCK', 'SHAMELESS',
      'PORN SICK', 'DEGENERATE', 'SICK FUCK', 'FREAK', 'CARNAL SLUT',
      'UNHOLY STROKER', 'OBSCENE', 'GLUTTON FOR PORN', 'VULGAR BITCH', 'CORRUPTED',
      'NASTY PIG', 'SINNING'
    ]
  },
  seduction: {
    name: 'Seduction',
    description: 'Teasing and tempting',
    words: [
      'COME CLOSER', 'TOUCH YOURSELF', 'WANT ME?', 'YOU NEED THIS', 'DESIRE ME',
      'SO HOT', 'IRRESISTIBLE', 'TEMPTED YET?', 'CRAVING MORE', 'GIVE IN',
      'LET GO', 'SURRENDER', 'FEEL THE HEAT', 'BURNING UP', 'NEED IT BAD',
      'ACHING FOR IT', 'DRIPPING WET'
    ]
  },
  dirty: {
    name: 'Dirty Talk',
    description: 'Explicit dirty talk',
    words: [
      'FUCK ME', 'SO WET', 'HARDER', 'DEEPER', 'DON\'T STOP',
      'RIGHT THERE', 'FILL ME UP', 'POUND ME', 'TASTE ME', 'LICK IT',
      'SUCK IT', 'SPREAD IT', 'TAKE IT ALL', 'SO TIGHT', 'CREAM FOR ME',
      'MAKE ME CUM', 'BREED ME'
    ]
  },
  worship: {
    name: 'Body Worship',
    description: 'Appreciating the body',
    words: [
      'PERFECT ASS', 'BEAUTIFUL TITS', 'THICK THIGHS', 'GORGEOUS COCK', 'SEXY LIPS',
      'DIVINE BODY', 'WORSHIP ME', 'FLAWLESS', 'STUNNING', 'MESMERIZING',
      'HYPNOTIC CURVES', 'HEAVENLY', 'IRRESISTIBLE SKIN', 'PERFECT HOLE', 'DELICIOUS',
      'MOUTHWATERING', 'ADDICTIVE BODY'
    ]
  },
  denial: {
    name: 'Denial & Tease',
    description: 'Edge and denial play',
    words: [
      'NOT YET', 'KEEP EDGING', 'DON\'T CUM', 'HOLD IT', 'DENIED',
      'EDGE LONGER', 'STAY ON THE EDGE', 'NO RELEASE', 'SUFFER FOR ME', 'BEG FOR IT',
      'EARN YOUR ORGASM', 'RUINED', 'DESPERATE', 'ACHING', 'THROBBING',
      'ALMOST THERE', 'BACK OFF'
    ]
  },
  encouragement: {
    name: 'Encouragement',
    description: 'Positive affirmations',
    words: [
      'YOU CAN DO IT', 'SO CLOSE', 'ALMOST THERE', 'KEEP GOING', 'THAT\'S IT',
      'PERFECT', 'JUST LIKE THAT', 'SO GOOD', 'DON\'T STOP NOW', 'YES YES YES',
      'AMAZING', 'INCREDIBLE', 'YOU DESERVE THIS', 'LET IT BUILD', 'FEEL IT',
      'EMBRACE IT', 'RELEASE'
    ]
  }
} as const

export type GoonWordPackId = keyof typeof GOON_WORD_PACKS

export interface GoonWordsSettings {
  enabled: boolean
  enabledPacks: GoonWordPackId[]
  customWords: string[]
  fontSize: number // 16-48
  fontFamily: string
  fontColor: string
  glowColor: string
  frequency: number // 1-10 (seconds between words)
  duration: number // 1-5 (seconds word is visible)
  randomRotation: boolean
  intensity: number // 0-10
}

export const DEFAULT_GOON_WORDS_SETTINGS: GoonWordsSettings = {
  enabled: false,
  enabledPacks: ['goon', 'kink'],
  customWords: [],
  fontSize: 32,
  fontFamily: 'system-ui',
  fontColor: '#ffffff',
  glowColor: '#ff6b9d',
  frequency: 5,
  duration: 3,
  randomRotation: true,
  intensity: 5
}

export const GoonModeOverlay: React.FC<{
  enabled?: boolean
  intensity?: number // 0-10, affects word frequency and size
  colors?: string[]
  settings?: Partial<GoonWordsSettings>
}> = ({ enabled = true, intensity = 5, colors = ['#ffffff'], settings }) => {
  const [words, setWords] = useState<Array<{
    id: number
    word: string
    x: number
    y: number
    size: number
    color: string
    rotation: number
    duration: number
  }>>([])
  const idRef = useRef(0)

  // Get active word pool from enabled packs
  const activeWords = React.useMemo(() => {
    const enabledPacks = settings?.enabledPacks ?? DEFAULT_GOON_WORDS_SETTINGS.enabledPacks
    const customWords = settings?.customWords ?? []

    let wordPool: string[] = []
    for (const packId of enabledPacks) {
      const pack = GOON_WORD_PACKS[packId]
      if (pack) {
        wordPool = [...wordPool, ...pack.words]
      }
    }

    // Add custom words
    if (customWords.length > 0) {
      wordPool = [...wordPool, ...customWords]
    }

    // Fallback to goon pack if nothing enabled
    if (wordPool.length === 0) {
      wordPool = [...GOON_WORD_PACKS.goon.words]
    }

    return wordPool
  }, [settings?.enabledPacks, settings?.customWords])

  const effectiveSettings = {
    ...DEFAULT_GOON_WORDS_SETTINGS,
    ...settings,
    intensity
  }

  useEffect(() => {
    if (!enabled || intensity <= 0) return

    // Spawn new words based on intensity and frequency setting
    const baseInterval = effectiveSettings.frequency * 1000
    const interval = setInterval(() => {
      const fontSize = effectiveSettings.fontSize + Math.random() * (intensity * 2)
      const newWord = {
        id: idRef.current++,
        word: activeWords[Math.floor(Math.random() * activeWords.length)],
        x: 5 + Math.random() * 90,
        y: 5 + Math.random() * 90,
        size: fontSize,
        color: effectiveSettings.fontColor,
        rotation: effectiveSettings.randomRotation ? (-25 + Math.random() * 50) : 0,
        duration: effectiveSettings.duration + Math.random() * 1.5,
      }
      setWords(prev => [...prev.slice(-20), newWord]) // Keep max 20 words
    }, Math.max(500, baseInterval - intensity * 200)) // Faster at higher intensity

    return () => clearInterval(interval)
  }, [enabled, intensity, activeWords, effectiveSettings.frequency, effectiveSettings.duration, effectiveSettings.fontSize, effectiveSettings.fontColor, effectiveSettings.randomRotation])

  useEffect(() => {
    // Remove expired words
    const cleanup = setInterval(() => {
      setWords(prev => prev.slice(-15))
    }, 5000)
    return () => clearInterval(cleanup)
  }, [])

  if (!enabled || intensity <= 0) return null

  const glowColor = effectiveSettings.glowColor

  return (
    <div className="fixed inset-0 pointer-events-none z-[9940] overflow-hidden">
      {words.map((w) => (
        <div
          key={w.id}
          className="absolute uppercase tracking-wider"
          style={{
            left: `${w.x}%`,
            top: `${w.y}%`,
            fontSize: w.size,
            fontWeight: 900,
            fontFamily: effectiveSettings.fontFamily,
            color: w.color,
            textShadow: `
              0 0 10px ${glowColor},
              0 0 20px ${glowColor},
              0 0 40px ${glowColor},
              2px 2px 0 rgba(0,0,0,0.8),
              -2px -2px 0 rgba(0,0,0,0.8),
              2px -2px 0 rgba(0,0,0,0.8),
              -2px 2px 0 rgba(0,0,0,0.8)
            `,
            transform: `rotate(${w.rotation}deg)`,
            animation: `goonWord ${w.duration}s ease-out forwards`,
            WebkitTextStroke: '1px rgba(0,0,0,0.5)',
          }}
        >
          {w.word}
        </div>
      ))}
      <style>{`
        @keyframes goonWord {
          0% { opacity: 0; transform: scale(0.5) rotate(var(--rotation, 0deg)); }
          15% { opacity: 1; transform: scale(1.15) rotate(var(--rotation, 0deg)); }
          25% { transform: scale(1) rotate(var(--rotation, 0deg)); }
          75% { opacity: 0.9; }
          100% { opacity: 0; transform: scale(1.2) rotate(var(--rotation, 0deg)) translateY(-30px); }
        }
      `}</style>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// 23. INVERSION OVERLAY - Color inversion filter (like photo negative)
// ═══════════════════════════════════════════════════════════════════════════
export const InversionOverlay: React.FC<{
  enabled?: boolean
  intensity?: number // 0-1
  animated?: boolean
}> = ({ enabled = true, intensity = 1, animated = false }) => {
  const [pulse, setPulse] = useState(1)

  useEffect(() => {
    if (!enabled || !animated) return
    const interval = setInterval(() => {
      setPulse(p => p === 1 ? 0.7 : 1)
    }, 2000)
    return () => clearInterval(interval)
  }, [enabled, animated])

  if (!enabled) return null

  return (
    <div
      className="fixed inset-0 pointer-events-none z-[9960]"
      style={{
        backdropFilter: `invert(${intensity * (animated ? pulse : 1)})`,
        WebkitBackdropFilter: `invert(${intensity * (animated ? pulse : 1)})`,
        transition: animated ? 'all 1s ease-in-out' : 'none',
      }}
    />
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// 24. THERMAL OVERLAY - Heat vision / thermal camera effect
// ═══════════════════════════════════════════════════════════════════════════
export const ThermalOverlay: React.FC<{
  enabled?: boolean
  intensity?: number // 0-10
}> = ({ enabled = true, intensity = 5 }) => {
  if (!enabled) return null

  const hueRotate = 180 + intensity * 10 // Shift towards thermal colors
  const saturate = 1.5 + intensity * 0.15

  return (
    <>
      {/* Main thermal filter */}
      <div
        className="fixed inset-0 pointer-events-none z-[9955]"
        style={{
          backdropFilter: `hue-rotate(${hueRotate}deg) saturate(${saturate}) contrast(1.2)`,
          WebkitBackdropFilter: `hue-rotate(${hueRotate}deg) saturate(${saturate}) contrast(1.2)`,
        }}
      />
      {/* Heat overlay gradient */}
      <div
        className="fixed inset-0 pointer-events-none z-[9956]"
        style={{
          background: `radial-gradient(circle at 50% 50%,
            rgba(255, 50, 0, ${0.05 * intensity}) 0%,
            rgba(255, 150, 0, ${0.03 * intensity}) 30%,
            rgba(0, 100, 255, ${0.02 * intensity}) 70%,
            transparent 100%)`,
          mixBlendMode: 'overlay',
        }}
      />
    </>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// 25. HYPNO SPIRAL OVERLAY - Mesmerizing hypnotic spiral
// ═══════════════════════════════════════════════════════════════════════════
export const HypnoSpiralOverlay: React.FC<{
  enabled?: boolean
  speed?: number // 1-10
  color?: string
  opacity?: number
}> = ({ enabled = true, speed = 5, color = '#ff6b9d', opacity = 0.15 }) => {
  if (!enabled) return null

  const duration = 20 - speed * 1.5 // 5s to 20s

  return (
    <>
      <div
        className="fixed inset-0 pointer-events-none z-[9950] flex items-center justify-center"
        style={{ opacity }}
      >
        <div
          style={{
            width: '200vmax',
            height: '200vmax',
            background: `conic-gradient(from 0deg,
              ${color} 0deg, transparent 30deg,
              ${color} 60deg, transparent 90deg,
              ${color} 120deg, transparent 150deg,
              ${color} 180deg, transparent 210deg,
              ${color} 240deg, transparent 270deg,
              ${color} 300deg, transparent 330deg,
              ${color} 360deg)`,
            animation: `hypnoSpin ${duration}s linear infinite`,
            borderRadius: '50%',
          }}
        />
      </div>
      <style>{`
        @keyframes hypnoSpin {
          0% { transform: rotate(0deg) scale(1); }
          50% { transform: rotate(180deg) scale(1.1); }
          100% { transform: rotate(360deg) scale(1); }
        }
      `}</style>
    </>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// 26. LUST PULSE OVERLAY - Pulsing waves of desire from screen center
// ═══════════════════════════════════════════════════════════════════════════
export const LustPulseOverlay: React.FC<{
  enabled?: boolean
  color?: string
  interval?: number // ms between pulses
}> = ({ enabled = true, color = 'rgba(255, 107, 157, 0.3)', interval = 2000 }) => {
  const [rings, setRings] = useState<number[]>([])

  useEffect(() => {
    if (!enabled) return
    const timer = setInterval(() => {
      setRings(prev => [...prev.slice(-4), Date.now()])
    }, interval)
    return () => clearInterval(timer)
  }, [enabled, interval])

  if (!enabled) return null

  return (
    <div className="fixed inset-0 pointer-events-none z-[9945] flex items-center justify-center overflow-hidden">
      {rings.map((id) => (
        <div
          key={id}
          className="absolute rounded-full"
          style={{
            border: `3px solid ${color}`,
            animation: 'lustPulseRing 3s ease-out forwards',
          }}
        />
      ))}
      <style>{`
        @keyframes lustPulseRing {
          0% { width: 0; height: 0; opacity: 0.8; }
          100% { width: 300vmax; height: 300vmax; opacity: 0; }
        }
      `}</style>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// 27. NEON GLOW OVERLAY - Neon edge glow effect
// ═══════════════════════════════════════════════════════════════════════════
export const NeonGlowOverlay: React.FC<{
  enabled?: boolean
  color?: string
  intensity?: number // 0-10
  animated?: boolean
}> = ({ enabled = true, color = '#ff00ff', intensity = 5, animated = true }) => {
  if (!enabled) return null

  const glowSize = 20 + intensity * 8
  const glowOpacity = 0.3 + intensity * 0.05

  return (
    <>
      <div
        className="fixed inset-0 pointer-events-none z-[9940]"
        style={{
          boxShadow: `inset 0 0 ${glowSize}px ${color}, inset 0 0 ${glowSize * 2}px ${color}`,
          opacity: glowOpacity,
          animation: animated ? 'neonPulse 2s ease-in-out infinite' : 'none',
        }}
      />
      <style>{`
        @keyframes neonPulse {
          0%, 100% { opacity: ${glowOpacity}; }
          50% { opacity: ${glowOpacity * 1.5}; }
        }
      `}</style>
    </>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// 28. DRIPPING OVERLAY - Sexy dripping effect from top
// ═══════════════════════════════════════════════════════════════════════════
export const DrippingOverlay: React.FC<{
  enabled?: boolean
  color?: string
  count?: number
  speed?: number // 1-10
}> = ({ enabled = true, color = 'rgba(255, 150, 200, 0.4)', count = 8, speed = 5 }) => {
  const [drips, setDrips] = useState<Array<{ id: number; x: number; delay: number; size: number }>>([])

  useEffect(() => {
    if (!enabled) return
    const newDrips = Array.from({ length: count }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      delay: Math.random() * 5,
      size: 10 + Math.random() * 30,
    }))
    setDrips(newDrips)
  }, [enabled, count])

  if (!enabled) return null

  const duration = 15 - speed // 5s to 15s

  return (
    <>
      <div className="fixed inset-0 pointer-events-none z-[9935] overflow-hidden">
        {drips.map((drip) => (
          <div
            key={drip.id}
            className="absolute top-0 rounded-b-full"
            style={{
              left: `${drip.x}%`,
              width: drip.size,
              height: '150vh',
              background: `linear-gradient(to bottom, ${color} 0%, transparent 100%)`,
              animation: `dripping ${duration}s ease-in infinite`,
              animationDelay: `${drip.delay}s`,
              opacity: 0,
            }}
          />
        ))}
      </div>
      <style>{`
        @keyframes dripping {
          0% { transform: translateY(-100%); opacity: 0; }
          10% { opacity: 0.8; }
          90% { opacity: 0.6; }
          100% { transform: translateY(100%); opacity: 0; }
        }
      `}</style>
    </>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// 29. EDGE PULSE OVERLAY - Screen edges pulse with arousal
// ═══════════════════════════════════════════════════════════════════════════
export const EdgePulseOverlay: React.FC<{
  enabled?: boolean
  color?: string
  intensity?: number // 0-10
  speed?: number // 1-10
}> = ({ enabled = true, color = '#ff3366', intensity = 5, speed = 5 }) => {
  if (!enabled) return null

  const borderWidth = 2 + intensity * 0.8
  const blurSize = 10 + intensity * 5
  const duration = 3 - speed * 0.2

  return (
    <>
      <div
        className="fixed inset-0 pointer-events-none z-[9925]"
        style={{
          border: `${borderWidth}px solid ${color}`,
          boxShadow: `inset 0 0 ${blurSize}px ${color}`,
          animation: `edgePulse ${duration}s ease-in-out infinite`,
        }}
      />
      <style>{`
        @keyframes edgePulse {
          0%, 100% { opacity: 0.3; }
          50% { opacity: 0.7; }
        }
      `}</style>
    </>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// 30. BREATHE SYNC OVERLAY - Visual breathing guide for edging
// ═══════════════════════════════════════════════════════════════════════════
export const BreatheSyncOverlay: React.FC<{
  enabled?: boolean
  inhaleTime?: number // seconds
  holdTime?: number
  exhaleTime?: number
  color?: string
}> = ({ enabled = true, inhaleTime = 4, holdTime = 2, exhaleTime = 4, color = 'rgba(100, 200, 255, 0.2)' }) => {
  const [phase, setPhase] = useState<'inhale' | 'hold' | 'exhale'>('inhale')
  const [scale, setScale] = useState(0.8)

  useEffect(() => {
    if (!enabled) return
    const totalCycle = inhaleTime + holdTime + exhaleTime
    let elapsed = 0

    const interval = setInterval(() => {
      elapsed = (elapsed + 0.05) % totalCycle

      if (elapsed < inhaleTime) {
        setPhase('inhale')
        setScale(0.8 + (elapsed / inhaleTime) * 0.4)
      } else if (elapsed < inhaleTime + holdTime) {
        setPhase('hold')
        setScale(1.2)
      } else {
        setPhase('exhale')
        const exhaleProgress = (elapsed - inhaleTime - holdTime) / exhaleTime
        setScale(1.2 - exhaleProgress * 0.4)
      }
    }, 50)

    return () => clearInterval(interval)
  }, [enabled, inhaleTime, holdTime, exhaleTime])

  if (!enabled) return null

  return (
    <div className="fixed inset-0 pointer-events-none z-[9920] flex items-center justify-center">
      <div
        className="rounded-full transition-transform duration-100"
        style={{
          width: '60vmin',
          height: '60vmin',
          background: `radial-gradient(circle, ${color} 0%, transparent 70%)`,
          transform: `scale(${scale})`,
        }}
      />
      <div className="absolute text-white/60 text-2xl font-light tracking-widest uppercase">
        {phase === 'inhale' && 'Breathe In...'}
        {phase === 'hold' && 'Hold...'}
        {phase === 'exhale' && 'Breathe Out...'}
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// 31. COLOR CYCLE OVERLAY - Cycling color wash for trance effect
// ═══════════════════════════════════════════════════════════════════════════
export const ColorCycleOverlay: React.FC<{
  enabled?: boolean
  speed?: number // 1-10
  opacity?: number
}> = ({ enabled = true, speed = 5, opacity = 0.15 }) => {
  const [hue, setHue] = useState(0)

  useEffect(() => {
    if (!enabled) return
    const interval = setInterval(() => {
      setHue(h => (h + speed * 0.5) % 360)
    }, 50)
    return () => clearInterval(interval)
  }, [enabled, speed])

  if (!enabled) return null

  return (
    <div
      className="fixed inset-0 pointer-events-none z-[9910]"
      style={{
        background: `linear-gradient(135deg,
          hsla(${hue}, 80%, 50%, ${opacity}) 0%,
          hsla(${(hue + 60) % 360}, 80%, 50%, ${opacity}) 33%,
          hsla(${(hue + 120) % 360}, 80%, 50%, ${opacity}) 66%,
          hsla(${(hue + 180) % 360}, 80%, 50%, ${opacity}) 100%)`,
        mixBlendMode: 'overlay',
      }}
    />
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// 32. PIXELATE OVERLAY - Pixelation effect that intensifies
// ═══════════════════════════════════════════════════════════════════════════
export const PixelateOverlay: React.FC<{
  enabled?: boolean
  intensity?: number // 0-10 (0 = no pixelation, 10 = very blocky)
  animated?: boolean
}> = ({ enabled = true, intensity = 3, animated = false }) => {
  const [currentIntensity, setCurrentIntensity] = useState(intensity)

  useEffect(() => {
    if (!enabled || !animated) {
      setCurrentIntensity(intensity)
      return
    }
    const interval = setInterval(() => {
      setCurrentIntensity(prev => {
        const next = prev + (Math.random() - 0.5) * 2
        return Math.max(0, Math.min(10, next))
      })
    }, 500)
    return () => clearInterval(interval)
  }, [enabled, animated, intensity])

  if (!enabled || currentIntensity <= 0) return null

  // SVG filter for pixelation effect
  const pixelSize = Math.max(1, currentIntensity * 2)

  return (
    <>
      <svg className="fixed" style={{ width: 0, height: 0 }}>
        <defs>
          <filter id="pixelate-filter">
            <feFlood x="0" y="0" width={pixelSize} height={pixelSize} />
            <feComposite width={pixelSize} height={pixelSize} />
            <feTile result="tile" />
            <feComposite in="SourceGraphic" in2="tile" operator="in" />
            <feMorphology operator="dilate" radius={pixelSize / 4} />
          </filter>
        </defs>
      </svg>
      <div
        className="fixed inset-0 pointer-events-none z-[9905]"
        style={{
          backdropFilter: `blur(${currentIntensity * 0.3}px)`,
          WebkitBackdropFilter: `blur(${currentIntensity * 0.3}px)`,
        }}
      />
    </>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// 33. VAPORWAVE OVERLAY - Retro aesthetic with grid and sun
// ═══════════════════════════════════════════════════════════════════════════
export const VaporwaveOverlay: React.FC<{
  enabled?: boolean
  opacity?: number
}> = ({ enabled = true, opacity = 0.2 }) => {
  if (!enabled) return null

  return (
    <>
      <div className="fixed inset-0 pointer-events-none z-[9900]" style={{ opacity }}>
        {/* Sun */}
        <div
          className="absolute"
          style={{
            bottom: '30%',
            left: '50%',
            transform: 'translateX(-50%)',
            width: '40vmin',
            height: '20vmin',
            background: 'linear-gradient(to bottom, #ff6b9d 0%, #ff9a56 50%, #ffcd56 100%)',
            borderRadius: '50% 50% 0 0',
            boxShadow: '0 0 60px rgba(255, 107, 157, 0.5)',
          }}
        />
        {/* Grid floor */}
        <div
          className="absolute bottom-0 left-0 right-0"
          style={{
            height: '40%',
            background: `
              linear-gradient(transparent 0%, rgba(255, 107, 157, 0.1) 100%),
              repeating-linear-gradient(90deg, rgba(255, 107, 157, 0.3) 0px, transparent 1px, transparent 50px),
              repeating-linear-gradient(0deg, rgba(255, 107, 157, 0.3) 0px, transparent 1px, transparent 50px)
            `,
            transform: 'perspective(200px) rotateX(60deg)',
            transformOrigin: 'center bottom',
            animation: 'vaporwaveScroll 5s linear infinite',
          }}
        />
      </div>
      <style>{`
        @keyframes vaporwaveScroll {
          0% { background-position: 0 0; }
          100% { background-position: 0 50px; }
        }
      `}</style>
    </>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// 17. CLIMAX OVERLAY - Intense visual + audio climax effect
// ═══════════════════════════════════════════════════════════════════════════
export const ClimaxOverlay: React.FC<{
  trigger?: number // Increment to trigger climax
  type?: 'cum' | 'squirt' | 'orgasm'
  playSound?: boolean
  onComplete?: () => void
}> = ({ trigger = 0, type = 'orgasm', playSound = true, onComplete }) => {
  const [active, setActive] = useState(false)
  const [particles, setParticles] = useState<Array<{
    id: number
    x: number
    y: number
    size: number
    angle: number
    distance: number
    color: string
  }>>([])

  useEffect(() => {
    if (trigger > 0) {
      setActive(true)

      // Create burst particles
      const colors = type === 'squirt'
        ? ['#a8e6ff', '#87ceeb', '#b0e0e6', '#fff']
        : ['#fff', '#ffe4e1', '#ffb6c1', '#ffc0cb']

      const newParticles = Array.from({ length: 50 }, (_, i) => ({
        id: Date.now() + i,
        x: 50,
        y: 50,
        size: 4 + Math.random() * 12,
        angle: Math.random() * 360,
        distance: 100 + Math.random() * 400,
        color: colors[Math.floor(Math.random() * colors.length)],
      }))
      setParticles(newParticles)

      // Play climax sound if available
      if (playSound) {
        // Sound will be handled by the parent component using soundPlayer
      }

      // Reset after animation
      const timer = setTimeout(() => {
        setActive(false)
        setParticles([])
        onComplete?.()
      }, 3000)

      return () => clearTimeout(timer)
    }
  }, [trigger, type, playSound, onComplete])

  if (!active) return null

  return (
    <div className="fixed inset-0 pointer-events-none z-[9997]">
      {/* Flash */}
      <div
        className="absolute inset-0"
        style={{
          background: type === 'squirt'
            ? 'radial-gradient(circle at center, rgba(168, 230, 255, 0.5) 0%, transparent 70%)'
            : 'radial-gradient(circle at center, rgba(255, 255, 255, 0.6) 0%, transparent 70%)',
          animation: 'climaxFlash 0.5s ease-out forwards',
        }}
      />

      {/* Pulsing rings */}
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="absolute left-1/2 top-1/2 rounded-full"
          style={{
            border: `3px solid ${type === 'squirt' ? 'rgba(168, 230, 255, 0.6)' : 'rgba(255, 182, 193, 0.6)'}`,
            animation: `climaxRing 1.5s ease-out ${i * 0.2}s forwards`,
            transform: 'translate(-50%, -50%)',
          }}
        />
      ))}

      {/* Burst particles */}
      {particles.map((p) => (
        <div
          key={p.id}
          className="absolute rounded-full"
          style={{
            left: `${p.x}%`,
            top: `${p.y}%`,
            width: p.size,
            height: p.size,
            background: p.color,
            boxShadow: `0 0 ${p.size}px ${p.color}`,
            animation: `climaxBurst 2s ease-out forwards`,
            ['--angle' as any]: `${p.angle}deg`,
            ['--distance' as any]: `${p.distance}px`,
          }}
        />
      ))}

      {/* Text flash */}
      <div
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-center"
        style={{
          animation: 'climaxText 2s ease-out forwards',
        }}
      >
        <div className="text-6xl font-black text-white drop-shadow-[0_0_30px_rgba(255,255,255,0.8)]"
          style={{ textShadow: '0 0 40px #fff, 0 0 80px #ff6b9d' }}>
          {type === 'squirt' ? '💦' : type === 'cum' ? '💦' : '✨'}
        </div>
      </div>

      <style>{`
        @keyframes climaxFlash {
          0% { opacity: 1; }
          100% { opacity: 0; }
        }
        @keyframes climaxRing {
          0% { width: 0; height: 0; opacity: 1; }
          100% { width: 200vmax; height: 200vmax; opacity: 0; }
        }
        @keyframes climaxBurst {
          0% { transform: translate(-50%, -50%) rotate(var(--angle)) translateX(0); opacity: 1; }
          100% { transform: translate(-50%, -50%) rotate(var(--angle)) translateX(var(--distance)); opacity: 0; }
        }
        @keyframes climaxText {
          0% { opacity: 0; transform: translate(-50%, -50%) scale(0.5); }
          20% { opacity: 1; transform: translate(-50%, -50%) scale(1.2); }
          80% { opacity: 0.8; }
          100% { opacity: 0; transform: translate(-50%, -50%) scale(2); }
        }
      `}</style>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// MASTER COMPONENT - Combines all effects based on arousal level
// ═══════════════════════════════════════════════════════════════════════════
export interface ArousalEffectsConfig {
  heatLevel: number // 0-10
  particles: boolean
  heartbeat: boolean
  shimmer: boolean
  ripples: boolean
  trail: boolean
  wave: boolean
  goonMode?: boolean
  goonWordsSettings?: Partial<GoonWordsSettings>
  sparkles?: boolean
  bokeh?: boolean
  starfield?: boolean
  filmGrain?: boolean
  dreamyHaze?: boolean
  crtCurve?: boolean
  crtIntensity?: number // 0-10
  crtRgbSubpixels?: boolean
  crtChromaticAberration?: boolean
  crtScreenFlicker?: boolean
  climaxTrigger?: number
  climaxType?: 'cum' | 'squirt' | 'orgasm'
  onClimaxComplete?: () => void
  // New effects
  inversion?: boolean
  inversionIntensity?: number
  thermal?: boolean
  thermalIntensity?: number
  hypnoSpiral?: boolean
  hypnoSpiralSpeed?: number
  lustPulse?: boolean
  neonGlow?: boolean
  neonColor?: string
  dripping?: boolean
  edgePulse?: boolean
  breatheSync?: boolean
  colorCycle?: boolean
  vaporwave?: boolean
}

export const ArousalEffects: React.FC<ArousalEffectsConfig> = ({
  heatLevel,
  particles,
  heartbeat,
  shimmer,
  ripples,
  trail,
  wave,
  goonMode = false,
  goonWordsSettings,
  sparkles = false,
  bokeh = false,
  starfield = false,
  filmGrain = false,
  dreamyHaze = false,
  crtCurve = false,
  crtIntensity = 5,
  crtRgbSubpixels = true,
  crtChromaticAberration = true,
  crtScreenFlicker = true,
  climaxTrigger = 0,
  climaxType = 'orgasm',
  onClimaxComplete,
  // New effects
  inversion = false,
  inversionIntensity = 1,
  thermal = false,
  thermalIntensity = 5,
  hypnoSpiral = false,
  hypnoSpiralSpeed = 5,
  lustPulse = false,
  neonGlow = false,
  neonColor = '#ff00ff',
  dripping = false,
  edgePulse = false,
  breatheSync = false,
  colorCycle = false,
  vaporwave = false,
}) => {
  // Calculate BPM based on heat level (60-120 BPM)
  const bpm = 60 + heatLevel * 6

  return (
    <>
      {/* Always-on effects scaled by heat */}
      <LustfulLens intensity={heatLevel} />

      {/* Ambient overlays - always available when enabled */}
      {sparkles && <SparkleOverlay density={Math.max(3, heatLevel)} speed={heatLevel} />}
      {bokeh && <BokehOverlay count={8 + heatLevel} />}
      {starfield && <StarfieldOverlay density={30 + heatLevel * 5} />}
      {filmGrain && <FilmGrainOverlay opacity={0.12 + heatLevel * 0.01} scanlines={true} scanlineIntensity={0.25 + heatLevel * 0.02} />}
      {dreamyHaze && <DreamyHazeOverlay intensity={heatLevel} />}

      {/* NEW: Advanced visual effects */}
      {inversion && <InversionOverlay intensity={inversionIntensity} />}
      {thermal && <ThermalOverlay intensity={thermalIntensity} />}
      {hypnoSpiral && <HypnoSpiralOverlay speed={hypnoSpiralSpeed} opacity={0.1 + heatLevel * 0.02} />}
      {lustPulse && <LustPulseOverlay interval={3000 - heatLevel * 200} />}
      {neonGlow && <NeonGlowOverlay color={neonColor} intensity={heatLevel} />}
      {dripping && <DrippingOverlay speed={heatLevel} />}
      {edgePulse && <EdgePulseOverlay intensity={heatLevel} speed={heatLevel} />}
      {breatheSync && <BreatheSyncOverlay />}
      {colorCycle && <ColorCycleOverlay speed={heatLevel} opacity={0.1 + heatLevel * 0.02} />}
      {vaporwave && <VaporwaveOverlay opacity={0.15 + heatLevel * 0.02} />}

      {/* Heat-based effects */}
      {particles && heatLevel >= 3 && <PleasureParticles count={heatLevel * 2} />}
      {heartbeat && heatLevel >= 4 && <HeartbeatPulse bpm={bpm} />}
      {shimmer && heatLevel >= 5 && <HeatShimmer intensity={heatLevel} />}
      {ripples && heatLevel >= 6 && <DesireRipples interval={5000 - heatLevel * 300} />}
      {trail && heatLevel >= 7 && <PassionTrail />}
      {wave && heatLevel >= 8 && <SeductionWave speed={4 - heatLevel * 0.2} />}

      {/* Goon Mode - floating provocative text */}
      {goonMode && <GoonModeOverlay enabled={goonMode} intensity={goonWordsSettings?.intensity ?? heatLevel} settings={goonWordsSettings} />}

      {/* CRT Curved Screen Effect with enhanced features */}
      {crtCurve && (
        <CRTCurveOverlay
          enabled={crtCurve}
          intensity={crtIntensity}
          rgbSubpixels={crtRgbSubpixels}
          chromaticAberration={crtChromaticAberration}
          screenFlicker={crtScreenFlicker}
        />
      )}

      {/* Climax overlay - triggered externally */}
      <ClimaxOverlay trigger={climaxTrigger} type={climaxType} onComplete={onClimaxComplete} />
    </>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// 22. CUM COUNTDOWN OVERLAY - Sexy countdown to climax
// ═══════════════════════════════════════════════════════════════════════════
export interface CumCountdownConfig {
  duration: number // seconds
  onComplete?: () => void
  onCancel?: () => void
  visualStyle?: 'minimal' | 'dramatic' | 'intense'
  showPulse?: boolean
  playVoice?: boolean
}

export const CumCountdownOverlay: React.FC<{
  active: boolean
  config: CumCountdownConfig
}> = ({ active, config }) => {
  const [timeLeft, setTimeLeft] = useState(config.duration)
  const [phase, setPhase] = useState<'countdown' | 'final' | 'complete'>('countdown')
  const intervalRef = useRef<NodeJS.Timeout | null>(null)
  const startTimeRef = useRef<number>(0)

  useEffect(() => {
    if (!active) {
      setTimeLeft(config.duration)
      setPhase('countdown')
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
      return
    }

    startTimeRef.current = Date.now()
    setTimeLeft(config.duration)
    setPhase('countdown')

    intervalRef.current = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startTimeRef.current) / 1000)
      const remaining = Math.max(0, config.duration - elapsed)
      setTimeLeft(remaining)

      // Final 5 seconds - intense phase
      if (remaining <= 5 && remaining > 0) {
        setPhase('final')
      }

      // Complete
      if (remaining <= 0) {
        setPhase('complete')
        if (intervalRef.current) {
          clearInterval(intervalRef.current)
          intervalRef.current = null
        }
        config.onComplete?.()
      }
    }, 100)

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  }, [active, config.duration])

  // TTS Voice countdown
  const lastSpokenRef = useRef<number>(-1)
  useEffect(() => {
    if (!active || !config.playVoice) return
    if (typeof window === 'undefined' || !window.speechSynthesis) return

    // Speak countdown numbers in final 10 seconds
    if (timeLeft <= 10 && timeLeft > 0 && timeLeft !== lastSpokenRef.current) {
      lastSpokenRef.current = timeLeft
      const utterance = new SpeechSynthesisUtterance(timeLeft.toString())
      utterance.rate = 0.9
      utterance.pitch = 1.2
      // Try to use a female voice if available
      const voices = window.speechSynthesis.getVoices()
      const femaleVoice = voices.find(v =>
        v.name.includes('female') ||
        v.name.includes('Female') ||
        v.name.includes('Samantha') ||
        v.name.includes('Victoria') ||
        v.name.includes('Karen') ||
        v.name.includes('Zira')
      )
      if (femaleVoice) utterance.voice = femaleVoice
      window.speechSynthesis.speak(utterance)
    }

    // Speak "CUM!" on complete
    if (timeLeft <= 0 && lastSpokenRef.current !== 0) {
      lastSpokenRef.current = 0
      const utterance = new SpeechSynthesisUtterance('Cum now!')
      utterance.rate = 0.8
      utterance.pitch = 1.3
      utterance.volume = 1
      const voices = window.speechSynthesis.getVoices()
      const femaleVoice = voices.find(v =>
        v.name.includes('female') ||
        v.name.includes('Female') ||
        v.name.includes('Samantha') ||
        v.name.includes('Victoria') ||
        v.name.includes('Karen') ||
        v.name.includes('Zira')
      )
      if (femaleVoice) utterance.voice = femaleVoice
      window.speechSynthesis.speak(utterance)
    }
  }, [active, timeLeft, config.playVoice])

  if (!active && phase !== 'complete') return null

  const getCountdownText = () => {
    if (timeLeft <= 0) return 'CUM!'
    if (timeLeft <= 3) return timeLeft.toString()
    if (timeLeft <= 5) return timeLeft.toString()
    if (timeLeft <= 10) return timeLeft.toString()
    return timeLeft.toString()
  }

  const getSubText = () => {
    if (timeLeft <= 0) return 'NOW!'
    if (timeLeft <= 3) return 'ALMOST THERE...'
    if (timeLeft <= 5) return 'GET READY...'
    if (timeLeft <= 10) return 'KEEP STROKING...'
    return 'EDGE FOR ME...'
  }

  const pulseIntensity = phase === 'final' ? 1 + (5 - timeLeft) * 0.1 : 1
  const glowIntensity = phase === 'final' ? 20 + (5 - timeLeft) * 10 : 10

  return (
    <>
      {/* Background pulse overlay */}
      <div
        className="fixed inset-0 pointer-events-none z-[99995] transition-all duration-200"
        style={{
          background: phase === 'final'
            ? `radial-gradient(circle at center, rgba(255, 50, 100, ${0.1 + (5 - timeLeft) * 0.05}) 0%, transparent 70%)`
            : phase === 'complete'
            ? 'radial-gradient(circle at center, rgba(255, 100, 150, 0.4) 0%, transparent 70%)'
            : 'transparent',
          animation: phase === 'final' ? `countdownPulse ${0.5 - timeLeft * 0.05}s ease-in-out infinite` : 'none',
        }}
      />

      {/* Main countdown display */}
      <div
        className="fixed inset-0 pointer-events-none z-[99996] flex items-center justify-center"
        style={{
          animation: phase === 'complete' ? 'climaxFlash 0.5s ease-out' : 'none',
        }}
      >
        <div
          className="text-center transform transition-all duration-200"
          style={{
            transform: `scale(${pulseIntensity})`,
          }}
        >
          {/* Main number */}
          <div
            className="font-black tracking-tight"
            style={{
              fontSize: phase === 'complete' ? '20rem' : timeLeft <= 5 ? '16rem' : '12rem',
              color: phase === 'complete' ? '#ff3366' : timeLeft <= 3 ? '#ff4477' : timeLeft <= 5 ? '#ff6699' : '#ffffff',
              textShadow: `
                0 0 ${glowIntensity}px currentColor,
                0 0 ${glowIntensity * 2}px currentColor,
                0 0 ${glowIntensity * 3}px rgba(255, 100, 150, 0.5)
              `,
              lineHeight: 1,
              animation: phase === 'final' ? 'countdownBounce 0.3s ease-out' : 'none',
            }}
          >
            {getCountdownText()}
          </div>

          {/* Sub text */}
          <div
            className="text-2xl font-bold uppercase tracking-widest mt-4"
            style={{
              color: 'rgba(255, 255, 255, 0.9)',
              textShadow: '0 0 10px rgba(255, 100, 150, 0.8)',
            }}
          >
            {getSubText()}
          </div>

          {/* Progress ring */}
          {timeLeft > 0 && (
            <svg
              className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 -z-10"
              width="500"
              height="500"
              viewBox="0 0 500 500"
            >
              <circle
                cx="250"
                cy="250"
                r="230"
                fill="none"
                stroke="rgba(255, 255, 255, 0.1)"
                strokeWidth="8"
              />
              <circle
                cx="250"
                cy="250"
                r="230"
                fill="none"
                stroke={timeLeft <= 5 ? '#ff4477' : '#ff6699'}
                strokeWidth="8"
                strokeLinecap="round"
                strokeDasharray={`${2 * Math.PI * 230}`}
                strokeDashoffset={`${2 * Math.PI * 230 * (1 - timeLeft / config.duration)}`}
                transform="rotate(-90 250 250)"
                style={{
                  transition: 'stroke-dashoffset 0.1s linear',
                  filter: `drop-shadow(0 0 ${glowIntensity}px currentColor)`,
                }}
              />
            </svg>
          )}
        </div>
      </div>

      {/* Cancel hint */}
      {active && timeLeft > 0 && (
        <div className="fixed bottom-8 left-1/2 transform -translate-x-1/2 z-[99997] text-white/50 text-sm">
          Press ESC to cancel
        </div>
      )}

      <style>{`
        @keyframes countdownPulse {
          0%, 100% { opacity: 0.8; }
          50% { opacity: 1; }
        }
        @keyframes countdownBounce {
          0% { transform: scale(0.9); }
          50% { transform: scale(1.1); }
          100% { transform: scale(1); }
        }
        @keyframes climaxFlash {
          0% { background: rgba(255, 50, 100, 0.8); }
          100% { background: transparent; }
        }
      `}</style>
    </>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// HEARTS OVERLAY - Floating hearts rising upward
// ═══════════════════════════════════════════════════════════════════════════
export const HeartsOverlay: React.FC<{
  intensity?: number // 1-10
  color?: string
}> = ({ intensity = 5, color = '#ff6b9d' }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const resize = () => {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
    }
    resize()
    window.addEventListener('resize', resize)

    interface Heart {
      x: number
      y: number
      size: number
      speed: number
      wobble: number
      wobbleSpeed: number
      opacity: number
      rotation: number
      rotationSpeed: number
    }

    const hearts: Heart[] = []
    const heartCount = Math.floor(10 + intensity * 3)

    const createHeart = (startAtBottom = true): Heart => ({
      x: Math.random() * canvas.width,
      y: startAtBottom ? canvas.height + 50 : Math.random() * canvas.height,
      size: 15 + Math.random() * 20,
      speed: 0.5 + Math.random() * 1.5 + intensity * 0.1,
      wobble: 0,
      wobbleSpeed: 0.02 + Math.random() * 0.02,
      opacity: 0.4 + Math.random() * 0.4,
      rotation: Math.random() * Math.PI * 2,
      rotationSpeed: (Math.random() - 0.5) * 0.02,
    })

    for (let i = 0; i < heartCount; i++) {
      hearts.push(createHeart(false))
    }

    const drawHeart = (x: number, y: number, size: number, rotation: number, opacity: number) => {
      ctx.save()
      ctx.translate(x, y)
      ctx.rotate(rotation)
      ctx.globalAlpha = opacity
      ctx.fillStyle = color
      ctx.beginPath()
      ctx.moveTo(0, -size * 0.3)
      ctx.bezierCurveTo(-size * 0.5, -size * 0.8, -size, -size * 0.2, 0, size * 0.5)
      ctx.bezierCurveTo(size, -size * 0.2, size * 0.5, -size * 0.8, 0, -size * 0.3)
      ctx.fill()
      ctx.restore()
    }

    let animationId: number
    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      hearts.forEach((heart, index) => {
        heart.y -= heart.speed
        heart.wobble += heart.wobbleSpeed
        heart.rotation += heart.rotationSpeed
        const wobbleX = Math.sin(heart.wobble) * 30

        drawHeart(heart.x + wobbleX, heart.y, heart.size, heart.rotation, heart.opacity)

        if (heart.y < -50) {
          hearts[index] = createHeart(true)
        }
      })

      animationId = requestAnimationFrame(animate)
    }

    animate()

    return () => {
      cancelAnimationFrame(animationId)
      window.removeEventListener('resize', resize)
    }
  }, [intensity, color])

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none z-30"
      style={{ opacity: 0.8 }}
    />
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// RAIN OVERLAY - Raindrops running down the screen
// ═══════════════════════════════════════════════════════════════════════════
export const RainOverlay: React.FC<{
  intensity?: number // 1-10
  color?: string
}> = ({ intensity = 5, color = 'rgba(150, 200, 255, 0.4)' }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const resize = () => {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
    }
    resize()
    window.addEventListener('resize', resize)

    interface Raindrop {
      x: number
      y: number
      length: number
      speed: number
      opacity: number
      thickness: number
    }

    const drops: Raindrop[] = []
    const dropCount = Math.floor(50 + intensity * 30)

    const createDrop = (startAtTop = true): Raindrop => ({
      x: Math.random() * canvas.width,
      y: startAtTop ? -20 : Math.random() * canvas.height,
      length: 20 + Math.random() * 30,
      speed: 8 + Math.random() * 8 + intensity * 0.5,
      opacity: 0.2 + Math.random() * 0.3,
      thickness: 1 + Math.random() * 2,
    })

    for (let i = 0; i < dropCount; i++) {
      drops.push(createDrop(false))
    }

    let animationId: number
    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      drops.forEach((drop, index) => {
        drop.y += drop.speed

        ctx.beginPath()
        ctx.strokeStyle = color
        ctx.globalAlpha = drop.opacity
        ctx.lineWidth = drop.thickness
        ctx.lineCap = 'round'
        ctx.moveTo(drop.x, drop.y)
        ctx.lineTo(drop.x + 2, drop.y + drop.length)
        ctx.stroke()

        if (drop.y > canvas.height + 50) {
          drops[index] = createDrop(true)
        }
      })

      animationId = requestAnimationFrame(animate)
    }

    animate()

    return () => {
      cancelAnimationFrame(animationId)
      window.removeEventListener('resize', resize)
    }
  }, [intensity, color])

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none z-30"
    />
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// GLITCH OVERLAY - RGB split and screen jitter
// ═══════════════════════════════════════════════════════════════════════════
export const GlitchOverlay: React.FC<{
  intensity?: number // 1-10
}> = ({ intensity = 5 }) => {
  const [glitchState, setGlitchState] = useState({
    rgbSplit: 0,
    offsetX: 0,
    offsetY: 0,
    sliceY: 0,
    sliceHeight: 0,
    active: false,
  })

  useEffect(() => {
    const glitchInterval = setInterval(() => {
      // Random glitch activation
      if (Math.random() < 0.1 + intensity * 0.05) {
        setGlitchState({
          rgbSplit: (Math.random() - 0.5) * intensity * 2,
          offsetX: (Math.random() - 0.5) * intensity * 3,
          offsetY: (Math.random() - 0.5) * intensity * 1,
          sliceY: Math.random() * 100,
          sliceHeight: 5 + Math.random() * 15,
          active: true,
        })

        // Reset after short duration
        setTimeout(() => {
          setGlitchState(prev => ({ ...prev, active: false, rgbSplit: 0, offsetX: 0, offsetY: 0 }))
        }, 50 + Math.random() * 100)
      }
    }, 100)

    return () => clearInterval(glitchInterval)
  }, [intensity])

  if (!glitchState.active) return null

  return (
    <div
      className="fixed inset-0 pointer-events-none z-40"
      style={{
        mixBlendMode: 'screen',
      }}
    >
      {/* RGB split effect */}
      <div
        className="absolute inset-0"
        style={{
          background: `linear-gradient(90deg,
            rgba(255, 0, 0, 0.1) 0%,
            transparent 50%,
            rgba(0, 255, 255, 0.1) 100%)`,
          transform: `translateX(${glitchState.rgbSplit}px)`,
        }}
      />

      {/* Horizontal slice glitch */}
      <div
        className="absolute left-0 right-0 bg-white/10"
        style={{
          top: `${glitchState.sliceY}%`,
          height: `${glitchState.sliceHeight}px`,
          transform: `translateX(${glitchState.offsetX * 5}px)`,
        }}
      />

      {/* Scanline flash */}
      <div
        className="absolute inset-0"
        style={{
          background: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255, 255, 255, 0.03) 2px, rgba(255, 255, 255, 0.03) 4px)',
          opacity: 0.5,
        }}
      />
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// BUBBLES OVERLAY - Floating bubbles
// ═══════════════════════════════════════════════════════════════════════════
export const BubblesOverlay: React.FC<{
  intensity?: number // 1-10
  color?: string
}> = ({ intensity = 5, color = 'rgba(255, 255, 255, 0.3)' }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const resize = () => {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
    }
    resize()
    window.addEventListener('resize', resize)

    interface Bubble {
      x: number
      y: number
      radius: number
      speed: number
      wobble: number
      wobbleSpeed: number
      opacity: number
    }

    const bubbles: Bubble[] = []
    const bubbleCount = Math.floor(15 + intensity * 4)

    const createBubble = (startAtBottom = true): Bubble => ({
      x: Math.random() * canvas.width,
      y: startAtBottom ? canvas.height + 50 : Math.random() * canvas.height,
      radius: 10 + Math.random() * 30,
      speed: 0.5 + Math.random() * 1 + intensity * 0.1,
      wobble: Math.random() * Math.PI * 2,
      wobbleSpeed: 0.02 + Math.random() * 0.02,
      opacity: 0.2 + Math.random() * 0.3,
    })

    for (let i = 0; i < bubbleCount; i++) {
      bubbles.push(createBubble(false))
    }

    let animationId: number
    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      bubbles.forEach((bubble, index) => {
        bubble.y -= bubble.speed
        bubble.wobble += bubble.wobbleSpeed
        const wobbleX = Math.sin(bubble.wobble) * 20

        // Draw bubble
        ctx.beginPath()
        ctx.arc(bubble.x + wobbleX, bubble.y, bubble.radius, 0, Math.PI * 2)
        ctx.strokeStyle = color
        ctx.globalAlpha = bubble.opacity
        ctx.lineWidth = 2
        ctx.stroke()

        // Highlight
        ctx.beginPath()
        ctx.arc(
          bubble.x + wobbleX - bubble.radius * 0.3,
          bubble.y - bubble.radius * 0.3,
          bubble.radius * 0.2,
          0,
          Math.PI * 2
        )
        ctx.fillStyle = 'rgba(255, 255, 255, 0.5)'
        ctx.globalAlpha = bubble.opacity * 0.8
        ctx.fill()

        if (bubble.y < -bubble.radius * 2) {
          bubbles[index] = createBubble(true)
        }
      })

      animationId = requestAnimationFrame(animate)
    }

    animate()

    return () => {
      cancelAnimationFrame(animationId)
      window.removeEventListener('resize', resize)
    }
  }, [intensity, color])

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none z-30"
    />
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// MATRIX RAIN OVERLAY - Falling green characters
// ═══════════════════════════════════════════════════════════════════════════
export const MatrixRainOverlay: React.FC<{
  intensity?: number // 1-10
  color?: string
}> = ({ intensity = 5, color = '#00ff00' }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const resize = () => {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
    }
    resize()
    window.addEventListener('resize', resize)

    const fontSize = 14
    const columns = Math.floor(canvas.width / fontSize)
    const drops: number[] = new Array(columns).fill(1)

    // Matrix characters
    const chars = 'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン0123456789'

    let animationId: number
    const animate = () => {
      // Fade effect
      ctx.fillStyle = 'rgba(0, 0, 0, 0.05)'
      ctx.fillRect(0, 0, canvas.width, canvas.height)

      ctx.fillStyle = color
      ctx.font = `${fontSize}px monospace`

      for (let i = 0; i < drops.length; i++) {
        const char = chars[Math.floor(Math.random() * chars.length)]
        const x = i * fontSize
        const y = drops[i] * fontSize

        // Vary opacity based on intensity
        ctx.globalAlpha = 0.3 + (intensity / 10) * 0.5

        ctx.fillText(char, x, y)

        // Reset drop randomly
        if (y > canvas.height && Math.random() > 0.975) {
          drops[i] = 0
        }

        drops[i] += 0.5 + (intensity / 10) * 0.5
      }

      animationId = requestAnimationFrame(animate)
    }

    animate()

    return () => {
      cancelAnimationFrame(animationId)
      window.removeEventListener('resize', resize)
    }
  }, [intensity, color])

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none z-30"
      style={{ opacity: 0.6 }}
    />
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// CONFETTI OVERLAY - Celebration particles
// ═══════════════════════════════════════════════════════════════════════════
export const ConfettiOverlay: React.FC<{
  intensity?: number // 1-10
  burst?: boolean
}> = ({ intensity = 5, burst = false }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const burstTriggered = useRef(false)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const resize = () => {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
    }
    resize()
    window.addEventListener('resize', resize)

    interface Confetti {
      x: number
      y: number
      width: number
      height: number
      color: string
      rotation: number
      rotationSpeed: number
      speedX: number
      speedY: number
      gravity: number
      opacity: number
    }

    const confetti: Confetti[] = []
    const colors = ['#ff6b9d', '#c9184a', '#ff85a1', '#ffc0cb', '#ff1493', '#da70d6', '#9370db', '#87ceeb']

    const createConfetti = (fromTop = false, fromCenter = false): Confetti => {
      let x = Math.random() * canvas.width
      let y = fromTop ? -20 : canvas.height + 20
      let speedX = (Math.random() - 0.5) * 4
      let speedY = fromTop ? 2 + Math.random() * 3 : -(8 + Math.random() * 8)

      if (fromCenter) {
        x = canvas.width / 2 + (Math.random() - 0.5) * 100
        y = canvas.height / 2
        const angle = Math.random() * Math.PI * 2
        const speed = 5 + Math.random() * 10
        speedX = Math.cos(angle) * speed
        speedY = Math.sin(angle) * speed - 5
      }

      return {
        x,
        y,
        width: 8 + Math.random() * 8,
        height: 4 + Math.random() * 4,
        color: colors[Math.floor(Math.random() * colors.length)],
        rotation: Math.random() * Math.PI * 2,
        rotationSpeed: (Math.random() - 0.5) * 0.2,
        speedX,
        speedY,
        gravity: 0.1 + Math.random() * 0.1,
        opacity: 0.8 + Math.random() * 0.2,
      }
    }

    // Initial confetti
    const confettiCount = Math.floor(20 + intensity * 5)
    for (let i = 0; i < confettiCount; i++) {
      confetti.push(createConfetti(true))
    }

    let animationId: number
    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      // Handle burst
      if (burst && !burstTriggered.current) {
        burstTriggered.current = true
        for (let i = 0; i < 50; i++) {
          confetti.push(createConfetti(false, true))
        }
      }

      confetti.forEach((c, index) => {
        c.x += c.speedX
        c.y += c.speedY
        c.speedY += c.gravity
        c.rotation += c.rotationSpeed
        c.speedX *= 0.99

        ctx.save()
        ctx.translate(c.x, c.y)
        ctx.rotate(c.rotation)
        ctx.globalAlpha = c.opacity
        ctx.fillStyle = c.color
        ctx.fillRect(-c.width / 2, -c.height / 2, c.width, c.height)
        ctx.restore()

        if (c.y > canvas.height + 50) {
          confetti[index] = createConfetti(true)
        }
      })

      animationId = requestAnimationFrame(animate)
    }

    animate()

    return () => {
      cancelAnimationFrame(animationId)
      window.removeEventListener('resize', resize)
      burstTriggered.current = false
    }
  }, [intensity, burst])

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none z-30"
    />
  )
}

export default ArousalEffects
