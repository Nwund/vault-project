// File: src/renderer/components/ParticlesBackground.tsx
// Pure React particle system - foundation for theme particles
// No external dependencies, fully integrated with React lifecycle

import React, { useEffect, useRef, useCallback, useState } from 'react'

// ═══════════════════════════════════════════════════════════════════════════
// PARTICLE CONFIGURATION TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface ParticleConfig {
  // Number of particles
  count: number
  // Colors (can be array for random selection)
  colors: string[]
  // Size range [min, max]
  sizeRange: [number, number]
  // Speed range [min, max]
  speedRange: [number, number]
  // Opacity range [min, max]
  opacityRange: [number, number]
  // Connect particles with lines?
  lineLinks: boolean
  // Line link distance
  linkDistance: number
  // Line opacity
  linkOpacity: number
  // Mouse interaction mode
  mouseMode: 'none' | 'repulse' | 'attract' | 'grab' | 'bubble'
  // Mouse interaction radius
  mouseRadius: number
  // Direction: 'none' | 'top' | 'bottom' | 'left' | 'right'
  direction: 'none' | 'top' | 'bottom' | 'left' | 'right'
  // Shape
  shape: 'circle' | 'square' | 'star'
  // Pulse/twinkle effect
  twinkle: boolean
}

// ═══════════════════════════════════════════════════════════════════════════
// PARTICLE CLASS
// ═══════════════════════════════════════════════════════════════════════════

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  size: number
  color: string
  opacity: number
  targetOpacity: number
  phase: number
}

// ═══════════════════════════════════════════════════════════════════════════
// PRESET CONFIGURATIONS
// ═══════════════════════════════════════════════════════════════════════════

const PRESETS: Record<string, ParticleConfig> = {
  default: {
    count: 50,
    colors: ['#ffffff'],
    sizeRange: [2, 4],
    speedRange: [0.3, 1],
    opacityRange: [0.2, 0.5],
    lineLinks: false,
    linkDistance: 150,
    linkOpacity: 0.2,
    mouseMode: 'repulse',
    mouseRadius: 100,
    direction: 'none',
    shape: 'circle',
    twinkle: true
  },

  romantic: {
    count: 40,
    colors: ['#ff69b4', '#ff1493', '#ffb6c1', '#ffc0cb', '#ff85a2'],
    sizeRange: [3, 6],
    speedRange: [0.5, 1.5],
    opacityRange: [0.3, 0.7],
    lineLinks: false,
    linkDistance: 150,
    linkOpacity: 0.3,
    mouseMode: 'bubble',
    mouseRadius: 150,
    direction: 'top',
    shape: 'circle',
    twinkle: true
  },

  network: {
    count: 80,
    colors: ['#8b5cf6', '#a78bfa'],
    sizeRange: [2, 4],
    speedRange: [0.5, 1.5],
    opacityRange: [0.4, 0.7],
    lineLinks: true,
    linkDistance: 120,
    linkOpacity: 0.3,
    mouseMode: 'grab',
    mouseRadius: 200,
    direction: 'none',
    shape: 'circle',
    twinkle: false
  },

  fire: {
    count: 60,
    colors: ['#ff4500', '#ff6347', '#ff8c00', '#ffa500', '#ffcc00'],
    sizeRange: [2, 5],
    speedRange: [1, 3],
    opacityRange: [0.4, 0.8],
    lineLinks: false,
    linkDistance: 150,
    linkOpacity: 0.4,
    mouseMode: 'repulse',
    mouseRadius: 100,
    direction: 'top',
    shape: 'circle',
    twinkle: true
  },

  snow: {
    count: 100,
    colors: ['#ffffff', '#f0f8ff', '#e6f3ff'],
    sizeRange: [2, 5],
    speedRange: [0.5, 2],
    opacityRange: [0.5, 0.9],
    lineLinks: false,
    linkDistance: 150,
    linkOpacity: 0.4,
    mouseMode: 'repulse',
    mouseRadius: 80,
    direction: 'bottom',
    shape: 'circle',
    twinkle: false
  },

  neon: {
    count: 50,
    colors: ['#00ffff', '#ff00ff', '#00ff00', '#ffff00'],
    sizeRange: [2, 5],
    speedRange: [1, 3],
    opacityRange: [0.5, 0.9],
    lineLinks: true,
    linkDistance: 100,
    linkOpacity: 0.5,
    mouseMode: 'grab',
    mouseRadius: 150,
    direction: 'none',
    shape: 'circle',
    twinkle: true
  },

  galaxy: {
    count: 150,
    colors: ['#ffffff', '#fffacd', '#add8e6', '#ffb6c1', '#e6e6fa'],
    sizeRange: [1, 3],
    speedRange: [0.1, 0.5],
    opacityRange: [0.3, 0.9],
    lineLinks: false,
    linkDistance: 150,
    linkOpacity: 0.4,
    mouseMode: 'bubble',
    mouseRadius: 200,
    direction: 'none',
    shape: 'star',
    twinkle: true
  },

  minimal: {
    count: 20,
    colors: ['#ffffff'],
    sizeRange: [1, 2],
    speedRange: [0.2, 0.5],
    opacityRange: [0.1, 0.2],
    lineLinks: false,
    linkDistance: 150,
    linkOpacity: 0.1,
    mouseMode: 'none',
    mouseRadius: 100,
    direction: 'none',
    shape: 'circle',
    twinkle: false
  },

  roadmap: {
    count: 60,
    colors: ['#8b5cf6', '#ec4899', '#06b6d4', '#10b981', '#f59e0b'],
    sizeRange: [2, 4],
    speedRange: [0.3, 1],
    opacityRange: [0.3, 0.6],
    lineLinks: true,
    linkDistance: 100,
    linkOpacity: 0.2,
    mouseMode: 'grab',
    mouseRadius: 150,
    direction: 'none',
    shape: 'circle',
    twinkle: true
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// PARTICLES BACKGROUND COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

interface ParticlesBackgroundProps {
  preset?: keyof typeof PRESETS | ParticleConfig
  enabled?: boolean
  className?: string
  style?: React.CSSProperties
}

export function ParticlesBackground({
  preset = 'default',
  enabled = true,
  className = '',
  style = {}
}: ParticlesBackgroundProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const particlesRef = useRef<Particle[]>([])
  const mouseRef = useRef({ x: -1000, y: -1000 })
  const animationRef = useRef<number>()
  const configRef = useRef<ParticleConfig>(
    typeof preset === 'string' ? PRESETS[preset] : preset
  )

  // Update config when preset changes
  useEffect(() => {
    configRef.current = typeof preset === 'string' ? PRESETS[preset] : preset
  }, [preset])

  // Initialize particles
  const initParticles = useCallback((width: number, height: number) => {
    const config = configRef.current
    const particles: Particle[] = []

    for (let i = 0; i < config.count; i++) {
      const size = config.sizeRange[0] + Math.random() * (config.sizeRange[1] - config.sizeRange[0])
      const speed = config.speedRange[0] + Math.random() * (config.speedRange[1] - config.speedRange[0])
      const opacity = config.opacityRange[0] + Math.random() * (config.opacityRange[1] - config.opacityRange[0])

      let vx = (Math.random() - 0.5) * speed
      let vy = (Math.random() - 0.5) * speed

      // Apply direction
      if (config.direction === 'top') vy = -Math.abs(vy)
      if (config.direction === 'bottom') vy = Math.abs(vy)
      if (config.direction === 'left') vx = -Math.abs(vx)
      if (config.direction === 'right') vx = Math.abs(vx)

      particles.push({
        x: Math.random() * width,
        y: Math.random() * height,
        vx,
        vy,
        size,
        color: config.colors[Math.floor(Math.random() * config.colors.length)],
        opacity,
        targetOpacity: opacity,
        phase: Math.random() * Math.PI * 2
      })
    }

    particlesRef.current = particles
  }, [])

  // Animation loop
  const animate = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const config = configRef.current
    const particles = particlesRef.current
    const mouse = mouseRef.current
    const width = canvas.width
    const height = canvas.height

    // Clear canvas
    ctx.clearRect(0, 0, width, height)

    // Update and draw particles
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i]

      // Twinkle effect
      if (config.twinkle) {
        p.phase += 0.02
        p.opacity = p.targetOpacity * (0.5 + 0.5 * Math.sin(p.phase))
      }

      // Mouse interaction
      if (config.mouseMode !== 'none' && mouse.x > 0 && mouse.y > 0) {
        const dx = p.x - mouse.x
        const dy = p.y - mouse.y
        const dist = Math.sqrt(dx * dx + dy * dy)

        if (dist < config.mouseRadius) {
          const force = (config.mouseRadius - dist) / config.mouseRadius

          if (config.mouseMode === 'repulse') {
            p.x += (dx / dist) * force * 2
            p.y += (dy / dist) * force * 2
          } else if (config.mouseMode === 'attract') {
            p.x -= (dx / dist) * force * 0.5
            p.y -= (dy / dist) * force * 0.5
          } else if (config.mouseMode === 'bubble') {
            // Temporarily increase size
            const bubbleSize = p.size * (1 + force * 0.5)
            p.size = bubbleSize
          }
        }
      }

      // Update position
      p.x += p.vx
      p.y += p.vy

      // Wrap around edges
      if (p.x < -p.size) p.x = width + p.size
      if (p.x > width + p.size) p.x = -p.size
      if (p.y < -p.size) p.y = height + p.size
      if (p.y > height + p.size) p.y = -p.size

      // Draw particle
      ctx.beginPath()
      ctx.globalAlpha = p.opacity

      if (config.shape === 'star') {
        // Draw star
        const spikes = 5
        const outerRadius = p.size
        const innerRadius = p.size / 2
        let rot = Math.PI / 2 * 3
        const step = Math.PI / spikes

        ctx.moveTo(p.x, p.y - outerRadius)
        for (let j = 0; j < spikes; j++) {
          ctx.lineTo(p.x + Math.cos(rot) * outerRadius, p.y + Math.sin(rot) * outerRadius)
          rot += step
          ctx.lineTo(p.x + Math.cos(rot) * innerRadius, p.y + Math.sin(rot) * innerRadius)
          rot += step
        }
        ctx.lineTo(p.x, p.y - outerRadius)
        ctx.closePath()
        ctx.fillStyle = p.color
        ctx.fill()
      } else if (config.shape === 'square') {
        ctx.fillStyle = p.color
        ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size)
      } else {
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2)
        ctx.fillStyle = p.color
        ctx.fill()
      }
    }

    // Draw links
    if (config.lineLinks) {
      ctx.globalAlpha = config.linkOpacity
      ctx.strokeStyle = config.colors[0]
      ctx.lineWidth = 1

      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x
          const dy = particles[i].y - particles[j].y
          const dist = Math.sqrt(dx * dx + dy * dy)

          if (dist < config.linkDistance) {
            const opacity = (1 - dist / config.linkDistance) * config.linkOpacity
            ctx.globalAlpha = opacity
            ctx.beginPath()
            ctx.moveTo(particles[i].x, particles[i].y)
            ctx.lineTo(particles[j].x, particles[j].y)
            ctx.stroke()
          }
        }

        // Draw grab lines to mouse
        if (config.mouseMode === 'grab' && mouse.x > 0 && mouse.y > 0) {
          const dx = particles[i].x - mouse.x
          const dy = particles[i].y - mouse.y
          const dist = Math.sqrt(dx * dx + dy * dy)

          if (dist < config.mouseRadius) {
            const opacity = (1 - dist / config.mouseRadius) * 0.5
            ctx.globalAlpha = opacity
            ctx.beginPath()
            ctx.moveTo(particles[i].x, particles[i].y)
            ctx.lineTo(mouse.x, mouse.y)
            ctx.stroke()
          }
        }
      }
    }

    ctx.globalAlpha = 1

    animationRef.current = requestAnimationFrame(animate)
  }, [])

  // Handle resize
  const handleResize = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const rect = canvas.parentElement?.getBoundingClientRect()
    if (rect) {
      canvas.width = rect.width
      canvas.height = rect.height
      initParticles(rect.width, rect.height)
    }
  }, [initParticles])

  // Handle mouse move
  const handleMouseMove = useCallback((e: MouseEvent) => {
    const canvas = canvasRef.current
    if (!canvas) return

    const rect = canvas.getBoundingClientRect()
    mouseRef.current = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    }
  }, [])

  // Handle mouse leave
  const handleMouseLeave = useCallback(() => {
    mouseRef.current = { x: -1000, y: -1000 }
  }, [])

  // Setup effect
  useEffect(() => {
    if (!enabled) return

    handleResize()

    window.addEventListener('resize', handleResize)
    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseleave', handleMouseLeave)

    animationRef.current = requestAnimationFrame(animate)

    return () => {
      window.removeEventListener('resize', handleResize)
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseleave', handleMouseLeave)

      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
    }
  }, [enabled, animate, handleResize, handleMouseMove, handleMouseLeave])

  if (!enabled) return null

  return (
    <canvas
      ref={canvasRef}
      className={`absolute inset-0 pointer-events-none ${className}`}
      style={{ zIndex: 0, ...style }}
    />
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// SPECIALIZED EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

export function RomanticParticles({ enabled = true }: { enabled?: boolean }) {
  return <ParticlesBackground preset="romantic" enabled={enabled} />
}

export function NetworkParticles({ enabled = true }: { enabled?: boolean }) {
  return <ParticlesBackground preset="network" enabled={enabled} />
}

export function FireParticles({ enabled = true }: { enabled?: boolean }) {
  return <ParticlesBackground preset="fire" enabled={enabled} />
}

export function SnowParticles({ enabled = true }: { enabled?: boolean }) {
  return <ParticlesBackground preset="snow" enabled={enabled} />
}

export function NeonParticles({ enabled = true }: { enabled?: boolean }) {
  return <ParticlesBackground preset="neon" enabled={enabled} />
}

export function GalaxyParticles({ enabled = true }: { enabled?: boolean }) {
  return <ParticlesBackground preset="galaxy" enabled={enabled} />
}

export function MinimalParticles({ enabled = true }: { enabled?: boolean }) {
  return <ParticlesBackground preset="minimal" enabled={enabled} />
}

export function RoadmapParticles({ enabled = true }: { enabled?: boolean }) {
  return <ParticlesBackground preset="roadmap" enabled={enabled} />
}

// Export presets for customization
export { PRESETS as PARTICLE_PRESETS }
export type { ParticleConfig }

export default ParticlesBackground
