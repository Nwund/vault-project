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
// 16. SPARKLE OVERLAY - Floating glitter/sparkle particles
// ═══════════════════════════════════════════════════════════════════════════
export const SparkleOverlay: React.FC<{
  enabled?: boolean
  density?: number // 1-10
  colors?: string[]
  speed?: number // 1-10
}> = ({ enabled = true, density = 5, colors = ['#fff', '#ffd700', '#ff69b4', '#87ceeb'], speed = 5 }) => {
  const [sparkles, setSparkles] = useState<Array<{
    id: number
    x: number
    y: number
    size: number
    color: string
    duration: number
    delay: number
    drift: number
  }>>([])

  useEffect(() => {
    if (!enabled) return

    const count = density * 8
    const newSparkles = Array.from({ length: count }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: 2 + Math.random() * 4,
      color: colors[Math.floor(Math.random() * colors.length)],
      duration: (15 - speed) + Math.random() * 10,
      delay: Math.random() * 5,
      drift: -30 + Math.random() * 60,
    }))
    setSparkles(newSparkles)
  }, [enabled, density, speed, colors.join()])

  if (!enabled) return null

  return (
    <div className="fixed inset-0 pointer-events-none z-[9935] overflow-hidden">
      {sparkles.map((s) => (
        <div
          key={s.id}
          className="absolute rounded-full"
          style={{
            left: `${s.x}%`,
            top: `${s.y}%`,
            width: s.size,
            height: s.size,
            background: s.color,
            boxShadow: `0 0 ${s.size * 2}px ${s.color}, 0 0 ${s.size * 4}px ${s.color}`,
            animation: `sparkleFloat ${s.duration}s ease-in-out infinite`,
            animationDelay: `${s.delay}s`,
            ['--drift' as any]: `${s.drift}px`,
          }}
        />
      ))}
      <style>{`
        @keyframes sparkleFloat {
          0%, 100% {
            opacity: 0;
            transform: translateY(0) translateX(0) scale(0.5);
          }
          10% {
            opacity: 1;
            transform: translateY(-10px) translateX(var(--drift)) scale(1);
          }
          50% {
            opacity: 0.8;
            transform: translateY(-30px) translateX(calc(var(--drift) * -0.5)) scale(1.2);
          }
          90% {
            opacity: 0.3;
            transform: translateY(-50px) translateX(var(--drift)) scale(0.8);
          }
        }
      `}</style>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// 17. BOKEH OVERLAY - Soft blurry light circles
// ═══════════════════════════════════════════════════════════════════════════
export const BokehOverlay: React.FC<{
  enabled?: boolean
  count?: number
  colors?: string[]
}> = ({ enabled = true, count = 12, colors = ['rgba(255,107,157,0.3)', 'rgba(255,182,193,0.3)', 'rgba(255,255,255,0.2)', 'rgba(255,215,0,0.2)'] }) => {
  const [bokeh, setBokeh] = useState<Array<{
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

    const newBokeh = Array.from({ length: count }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: 30 + Math.random() * 100,
      color: colors[Math.floor(Math.random() * colors.length)],
      duration: 8 + Math.random() * 12,
      delay: Math.random() * 5,
    }))
    setBokeh(newBokeh)
  }, [enabled, count, colors.join()])

  if (!enabled) return null

  return (
    <div className="fixed inset-0 pointer-events-none z-[9930] overflow-hidden">
      {bokeh.map((b) => (
        <div
          key={b.id}
          className="absolute rounded-full blur-xl"
          style={{
            left: `${b.x}%`,
            top: `${b.y}%`,
            width: b.size,
            height: b.size,
            background: b.color,
            animation: `bokehPulse ${b.duration}s ease-in-out infinite`,
            animationDelay: `${b.delay}s`,
          }}
        />
      ))}
      <style>{`
        @keyframes bokehPulse {
          0%, 100% {
            opacity: 0.3;
            transform: scale(1) translate(0, 0);
          }
          25% {
            opacity: 0.6;
            transform: scale(1.1) translate(10px, -10px);
          }
          50% {
            opacity: 0.4;
            transform: scale(0.9) translate(-5px, 5px);
          }
          75% {
            opacity: 0.7;
            transform: scale(1.05) translate(5px, 10px);
          }
        }
      `}</style>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// 18. STARFIELD OVERLAY - Twinkling stars
// ═══════════════════════════════════════════════════════════════════════════
export const StarfieldOverlay: React.FC<{
  enabled?: boolean
  density?: number
}> = ({ enabled = true, density = 50 }) => {
  const [stars, setStars] = useState<Array<{
    id: number
    x: number
    y: number
    size: number
    duration: number
    delay: number
  }>>([])

  useEffect(() => {
    if (!enabled) return

    const newStars = Array.from({ length: density }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: 1 + Math.random() * 3,
      duration: 1 + Math.random() * 3,
      delay: Math.random() * 3,
    }))
    setStars(newStars)
  }, [enabled, density])

  if (!enabled) return null

  return (
    <div className="fixed inset-0 pointer-events-none z-[9925] overflow-hidden">
      {stars.map((s) => (
        <div
          key={s.id}
          className="absolute rounded-full bg-white"
          style={{
            left: `${s.x}%`,
            top: `${s.y}%`,
            width: s.size,
            height: s.size,
            boxShadow: '0 0 3px #fff, 0 0 6px #fff',
            animation: `starTwinkle ${s.duration}s ease-in-out infinite`,
            animationDelay: `${s.delay}s`,
          }}
        />
      ))}
      <style>{`
        @keyframes starTwinkle {
          0%, 100% { opacity: 0.2; transform: scale(0.8); }
          50% { opacity: 1; transform: scale(1.2); }
        }
      `}</style>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// 19. FILM GRAIN OVERLAY - Vintage film grain effect
// ═══════════════════════════════════════════════════════════════════════════
export const FilmGrainOverlay: React.FC<{
  enabled?: boolean
  opacity?: number
}> = ({ enabled = true, opacity = 0.05 }) => {
  if (!enabled) return null

  return (
    <>
      <div
        className="fixed inset-0 pointer-events-none z-[9920]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
          opacity: opacity,
          mixBlendMode: 'overlay',
          animation: 'grainShift 0.5s steps(10) infinite',
        }}
      />
      <style>{`
        @keyframes grainShift {
          0%, 100% { transform: translate(0, 0); }
          10% { transform: translate(-1%, -1%); }
          20% { transform: translate(1%, 1%); }
          30% { transform: translate(-1%, 1%); }
          40% { transform: translate(1%, -1%); }
          50% { transform: translate(-1%, 0); }
          60% { transform: translate(1%, 0); }
          70% { transform: translate(0, 1%); }
          80% { transform: translate(0, -1%); }
          90% { transform: translate(1%, 1%); }
        }
      `}</style>
    </>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// 20. DREAMY HAZE OVERLAY - Soft dreamy blur effect
// ═══════════════════════════════════════════════════════════════════════════
export const DreamyHazeOverlay: React.FC<{
  enabled?: boolean
  intensity?: number // 0-10
  color?: string
}> = ({ enabled = true, intensity = 5, color = 'rgba(255,182,193,0.1)' }) => {
  if (!enabled || intensity <= 0) return null

  return (
    <div
      className="fixed inset-0 pointer-events-none z-[9915]"
      style={{
        background: `radial-gradient(ellipse at 30% 20%, ${color} 0%, transparent 50%),
                     radial-gradient(ellipse at 70% 80%, ${color} 0%, transparent 50%),
                     radial-gradient(ellipse at 50% 50%, rgba(255,255,255,0.05) 0%, transparent 60%)`,
        animation: 'dreamyFloat 20s ease-in-out infinite',
        opacity: intensity * 0.1,
      }}
    >
      <style>{`
        @keyframes dreamyFloat {
          0%, 100% { transform: scale(1) rotate(0deg); }
          25% { transform: scale(1.05) rotate(1deg); }
          50% { transform: scale(1.1) rotate(0deg); }
          75% { transform: scale(1.05) rotate(-1deg); }
        }
      `}</style>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// 21. GOON MODE - Floating provocative text
// ═══════════════════════════════════════════════════════════════════════════
const GOON_WORDS = [
  'PUMP', 'EDGE', 'GOON', 'STROKE', 'THROB', 'WET', 'HARDER',
  'DEEPER', 'FASTER', 'SLOWER', 'HOLD', 'RELEASE', 'MOAN',
  'DRIP', 'LEAK', 'PULSE', 'ACHE', 'NEED', 'CRAVE', 'BEG',
  'WORSHIP', 'OBEY', 'SUBMIT', 'SURRENDER', 'DENY', 'EDGE MORE',
  'KEEP GOING', 'DONT STOP', 'FEEL IT', 'LET GO', 'GOONING',
  'BRAINMELT', 'PUMP IT', 'STROKE IT', 'GOON HARDER'
]

export const GoonModeOverlay: React.FC<{
  enabled?: boolean
  intensity?: number // 0-10, affects word frequency and size
  colors?: string[]
}> = ({ enabled = true, intensity = 5, colors = ['#ff6b9d', '#c44569', '#f8a5c2', '#ff4757', '#fff'] }) => {
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

  useEffect(() => {
    if (!enabled || intensity <= 0) return

    // Spawn new words based on intensity
    const interval = setInterval(() => {
      const newWord = {
        id: idRef.current++,
        word: GOON_WORDS[Math.floor(Math.random() * GOON_WORDS.length)],
        x: 10 + Math.random() * 80,
        y: 10 + Math.random() * 80,
        size: 16 + Math.random() * (intensity * 4),
        color: colors[Math.floor(Math.random() * colors.length)],
        rotation: -20 + Math.random() * 40,
        duration: 2 + Math.random() * 3,
      }
      setWords(prev => [...prev.slice(-15), newWord]) // Keep max 15 words
    }, 3000 - intensity * 200) // More frequent at higher intensity

    return () => clearInterval(interval)
  }, [enabled, intensity, colors])

  useEffect(() => {
    // Remove expired words
    const cleanup = setInterval(() => {
      setWords(prev => prev.slice(-10))
    }, 5000)
    return () => clearInterval(cleanup)
  }, [])

  if (!enabled || intensity <= 0) return null

  return (
    <div className="fixed inset-0 pointer-events-none z-[9940] overflow-hidden">
      {words.map((w) => (
        <div
          key={w.id}
          className="absolute font-black uppercase tracking-wider"
          style={{
            left: `${w.x}%`,
            top: `${w.y}%`,
            fontSize: w.size,
            color: w.color,
            textShadow: `0 0 20px ${w.color}, 0 0 40px ${w.color}`,
            transform: `rotate(${w.rotation}deg)`,
            animation: `goonWord ${w.duration}s ease-out forwards`,
            opacity: 0.8,
          }}
        >
          {w.word}
        </div>
      ))}
      <style>{`
        @keyframes goonWord {
          0% { opacity: 0; transform: scale(0.5) rotate(var(--rotation, 0deg)); }
          20% { opacity: 0.9; transform: scale(1.1) rotate(var(--rotation, 0deg)); }
          80% { opacity: 0.7; }
          100% { opacity: 0; transform: scale(1.3) rotate(var(--rotation, 0deg)) translateY(-20px); }
        }
      `}</style>
    </div>
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
  sparkles?: boolean
  bokeh?: boolean
  starfield?: boolean
  filmGrain?: boolean
  dreamyHaze?: boolean
  climaxTrigger?: number
  climaxType?: 'cum' | 'squirt' | 'orgasm'
  onClimaxComplete?: () => void
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
  sparkles = false,
  bokeh = false,
  starfield = false,
  filmGrain = false,
  dreamyHaze = false,
  climaxTrigger = 0,
  climaxType = 'orgasm',
  onClimaxComplete,
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
      {filmGrain && <FilmGrainOverlay opacity={0.03 + heatLevel * 0.005} />}
      {dreamyHaze && <DreamyHazeOverlay intensity={heatLevel} />}

      {/* Heat-based effects */}
      {particles && heatLevel >= 3 && <PleasureParticles count={heatLevel * 2} />}
      {heartbeat && heatLevel >= 4 && <HeartbeatPulse bpm={bpm} />}
      {shimmer && heatLevel >= 5 && <HeatShimmer intensity={heatLevel} />}
      {ripples && heatLevel >= 6 && <DesireRipples interval={5000 - heatLevel * 300} />}
      {trail && heatLevel >= 7 && <PassionTrail />}
      {wave && heatLevel >= 8 && <SeductionWave speed={4 - heatLevel * 0.2} />}

      {/* Goon Mode - floating provocative text */}
      {goonMode && <GoonModeOverlay enabled={goonMode} intensity={heatLevel} />}

      {/* Climax overlay - triggered externally */}
      <ClimaxOverlay trigger={climaxTrigger} type={climaxType} onComplete={onClimaxComplete} />
    </>
  )
}

export default ArousalEffects
