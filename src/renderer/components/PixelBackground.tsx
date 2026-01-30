// File: src/renderer/components/PixelBackground.tsx
// Animated pixel art backgrounds with multi-layer parallax

import React, { useEffect, useRef, useState, useMemo } from 'react'

// Import new parallax backgrounds - City 2 (10 layers)
import city2_1 from '../assets/backgrounds/city-2/1.png'
import city2_2 from '../assets/backgrounds/city-2/2.png'
import city2_4 from '../assets/backgrounds/city-2/4.png'
import city2_5 from '../assets/backgrounds/city-2/5.png'
import city2_6 from '../assets/backgrounds/city-2/6.png'
import city2_7 from '../assets/backgrounds/city-2/7.png'
import city2_8 from '../assets/backgrounds/city-2/8.png'
import city2_9 from '../assets/backgrounds/city-2/9.png'
import city2_10 from '../assets/backgrounds/city-2/10.png'

// Import new parallax backgrounds - City 3 (6 layers)
import city3_1 from '../assets/backgrounds/city-3/1.png'
import city3_2 from '../assets/backgrounds/city-3/2.png'
import city3_3 from '../assets/backgrounds/city-3/3.png'
import city3_4 from '../assets/backgrounds/city-3/4.png'
import city3_5 from '../assets/backgrounds/city-3/5.png'
import city3_6 from '../assets/backgrounds/city-3/6.png'

// Import new parallax backgrounds - City New (4 layers)
import cityNew_1 from '../assets/backgrounds/city-new/1.png'
import cityNew_2 from '../assets/backgrounds/city-new/2.png'
import cityNew_3 from '../assets/backgrounds/city-new/3.png'
import cityNew_4 from '../assets/backgrounds/city-new/4.png'

// Import new parallax backgrounds - Cloud (3 layers)
import cloudNew_1 from '../assets/backgrounds/cloud-new/1.png'
import cloudNew_2 from '../assets/backgrounds/cloud-new/2.png'
import cloudNew_3 from '../assets/backgrounds/cloud-new/3.png'

// Import new parallax backgrounds - Cloud 2 (4 layers)
import cloud2_1 from '../assets/backgrounds/cloud-2/1.png'
import cloud2_2 from '../assets/backgrounds/cloud-2/2.png'
import cloud2_4 from '../assets/backgrounds/cloud-2/4.png'
import cloud2_5 from '../assets/backgrounds/cloud-2/5.png'

// Import aquarium
import aquarium_5 from '../assets/backgrounds/aquarium/5.png'

export type PixelTheme =
  | 'neonMetropolis'  // city-2 - vibrant neon city
  | 'cyberpunkCity'   // city-3 - darker cyberpunk
  | 'retroCity'       // city-new - retro style
  | 'dreamyClouds'    // cloud-new
  | 'stormClouds'     // cloud-2
  | 'aquarium'        // underwater
  | 'none'

// Multi-layer parallax configurations
// Each layer has: image, depth (0=far, 1=close), and optional animation
interface ParallaxLayer {
  image: string
  depth: number // 0 = far background, 1 = closest foreground
  animate?: 'drift-left' | 'drift-right' | 'float' | 'none'
  animationSpeed?: number // seconds for one cycle
}

const THEME_LAYERS: Record<Exclude<PixelTheme, 'none'>, ParallaxLayer[]> = {
  neonMetropolis: [
    { image: city2_1, depth: 0, animate: 'none' },
    { image: city2_2, depth: 0.1, animate: 'none' },
    { image: city2_4, depth: 0.2, animate: 'none' },
    { image: city2_5, depth: 0.3, animate: 'none' },
    { image: city2_6, depth: 0.4, animate: 'none' },
    { image: city2_7, depth: 0.5, animate: 'none' },
    { image: city2_8, depth: 0.6, animate: 'none' },
    { image: city2_9, depth: 0.8, animate: 'none' },
    { image: city2_10, depth: 1, animate: 'none' },
  ],
  cyberpunkCity: [
    { image: city3_1, depth: 0, animate: 'none' },
    { image: city3_2, depth: 0.15, animate: 'none' },
    { image: city3_3, depth: 0.3, animate: 'none' },
    { image: city3_4, depth: 0.5, animate: 'none' },
    { image: city3_5, depth: 0.7, animate: 'none' },
    { image: city3_6, depth: 1, animate: 'none' },
  ],
  retroCity: [
    { image: cityNew_1, depth: 0, animate: 'none' },
    { image: cityNew_2, depth: 0.3, animate: 'none' },
    { image: cityNew_3, depth: 0.6, animate: 'none' },
    { image: cityNew_4, depth: 1, animate: 'none' },
  ],
  dreamyClouds: [
    { image: cloudNew_1, depth: 0, animate: 'drift-left', animationSpeed: 120 },
    { image: cloudNew_2, depth: 0.4, animate: 'drift-right', animationSpeed: 80 },
    { image: cloudNew_3, depth: 1, animate: 'drift-left', animationSpeed: 60 },
  ],
  stormClouds: [
    { image: cloud2_1, depth: 0, animate: 'drift-left', animationSpeed: 100 },
    { image: cloud2_2, depth: 0.3, animate: 'drift-right', animationSpeed: 70 },
    { image: cloud2_4, depth: 0.6, animate: 'drift-left', animationSpeed: 50 },
    { image: cloud2_5, depth: 1, animate: 'drift-right', animationSpeed: 40 },
  ],
  aquarium: [
    { image: aquarium_5, depth: 0.5, animate: 'float', animationSpeed: 8 },
  ],
}

// Theme color palettes - panels are solid/opaque for better readability
export const THEME_COLORS: Record<PixelTheme, {
  primary: string
  secondary: string
  accent: string
  bg: string
  panel: string
  border: string
  text: string
  muted: string
  gradient: string
}> = {
  neonMetropolis: {
    primary: '#f472b6',
    secondary: '#22d3ee',
    accent: '#f9a8d4',
    bg: '#080812',
    panel: '#0d0d1a',
    border: 'rgba(236, 72, 153, 0.6)',
    text: '#fdf2f8',
    muted: '#a8a3b8',
    gradient: 'linear-gradient(135deg, #ec4899 0%, #06b6d4 100%)',
  },
  cyberpunkCity: {
    primary: '#a78bfa',
    secondary: '#e879f9',
    accent: '#c4b5fd',
    bg: '#0a0810',
    panel: '#100d18',
    border: 'rgba(139, 92, 246, 0.6)',
    text: '#faf5ff',
    muted: '#a5a0b8',
    gradient: 'linear-gradient(135deg, #8b5cf6 0%, #d946ef 100%)',
  },
  retroCity: {
    primary: '#fbbf24',
    secondary: '#f59e0b',
    accent: '#fcd34d',
    bg: '#100c05',
    panel: '#1a1408',
    border: 'rgba(245, 158, 11, 0.6)',
    text: '#fffbeb',
    muted: '#b5a888',
    gradient: 'linear-gradient(135deg, #f59e0b 0%, #b45309 100%)',
  },
  dreamyClouds: {
    primary: '#38bdf8',
    secondary: '#0ea5e9',
    accent: '#7dd3fc',
    bg: '#0a1218',
    panel: '#0c1620',
    border: 'rgba(56, 189, 248, 0.6)',
    text: '#f0f9ff',
    muted: '#8facc0',
    gradient: 'linear-gradient(135deg, #38bdf8 0%, #0369a1 100%)',
  },
  stormClouds: {
    primary: '#94a3b8',
    secondary: '#64748b',
    accent: '#cbd5e1',
    bg: '#0c1015',
    panel: '#12181e',
    border: 'rgba(100, 116, 139, 0.6)',
    text: '#f1f5f9',
    muted: '#8892a0',
    gradient: 'linear-gradient(135deg, #64748b 0%, #334155 100%)',
  },
  aquarium: {
    primary: '#22d3ee',
    secondary: '#06b6d4',
    accent: '#67e8f9',
    bg: '#041015',
    panel: '#081418',
    border: 'rgba(34, 211, 238, 0.6)',
    text: '#ecfeff',
    muted: '#7dd3fc',
    gradient: 'linear-gradient(135deg, #22d3ee 0%, #0891b2 100%)',
  },
  none: {
    primary: '#a78bfa',
    secondary: '#818cf8',
    accent: '#c4b5fd',
    bg: '#08080c',
    panel: '#0e0e14',
    border: 'rgba(139, 92, 246, 0.5)',
    text: '#f5f3ff',
    muted: '#9090a0',
    gradient: 'linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%)',
  },
}

// Theme metadata for UI
export const THEME_INFO: Record<PixelTheme, { name: string; category: string; description: string }> = {
  neonMetropolis: { name: 'Neon Metropolis', category: 'City', description: '10-layer vibrant neon cityscape' },
  cyberpunkCity: { name: 'Cyberpunk City', category: 'City', description: '6-layer dark cyberpunk scene' },
  retroCity: { name: 'Retro City', category: 'City', description: '4-layer retro pixel city' },
  dreamyClouds: { name: 'Dreamy Clouds', category: 'Sky', description: 'Drifting animated clouds' },
  stormClouds: { name: 'Storm Clouds', category: 'Sky', description: 'Moody storm clouds' },
  aquarium: { name: 'Aquarium', category: 'Nature', description: 'Underwater scene' },
  none: { name: 'None', category: 'Other', description: 'No background' },
}

interface PixelBackgroundProps {
  theme?: PixelTheme
  parallaxStrength?: number // 0-100
  opacity?: number // 0-100
  children?: React.ReactNode
}

// Apply pixel theme colors as CSS variables
export function applyPixelThemeColors(theme: PixelTheme) {
  const colors = THEME_COLORS[theme]
  if (!colors) return

  const root = document.documentElement
  root.style.setProperty('--primary', colors.primary)
  root.style.setProperty('--secondary', colors.secondary)
  root.style.setProperty('--accent', colors.accent)
  root.style.setProperty('--bg', colors.bg)
  root.style.setProperty('--panel', colors.panel)
  root.style.setProperty('--border', colors.border)
  root.style.setProperty('--text', colors.text)
  root.style.setProperty('--muted', colors.muted)
  root.style.setProperty('--text-muted', colors.muted)
  root.style.setProperty('--gradient', colors.gradient)
}

// Clear pixel theme colors (restore original theme)
export function clearPixelThemeColors() {
  const root = document.documentElement
  root.style.removeProperty('--primary')
  root.style.removeProperty('--secondary')
  root.style.removeProperty('--accent')
  root.style.removeProperty('--bg')
  root.style.removeProperty('--panel')
  root.style.removeProperty('--border')
  root.style.removeProperty('--text')
  root.style.removeProperty('--muted')
  root.style.removeProperty('--text-muted')
  root.style.removeProperty('--gradient')
}

export function PixelBackground({
  theme = 'neonMetropolis',
  parallaxStrength = 35,
  opacity = 50,
  children,
}: PixelBackgroundProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [mousePos, setMousePos] = useState({ x: 0.5, y: 0.5 })

  const layers = theme !== 'none' ? THEME_LAYERS[theme] : []

  // Convert 0-100 scales to usable values
  const normalizedParallax = (parallaxStrength / 100) * 50 // Max 50px movement
  const normalizedOpacity = opacity / 100

  // Apply theme colors when theme changes
  useEffect(() => {
    if (theme && theme !== 'none') {
      applyPixelThemeColors(theme)
    }
  }, [theme])

  // Parallax mouse tracking with smooth interpolation
  useEffect(() => {
    if (parallaxStrength === 0) return

    let rafId: number
    let targetX = 0.5
    let targetY = 0.5
    let currentX = 0.5
    let currentY = 0.5

    const handleMouseMove = (e: MouseEvent) => {
      targetX = e.clientX / window.innerWidth
      targetY = e.clientY / window.innerHeight
    }

    // Smooth interpolation loop
    const animate = () => {
      const ease = 0.06
      currentX += (targetX - currentX) * ease
      currentY += (targetY - currentY) * ease
      setMousePos({ x: currentX, y: currentY })
      rafId = requestAnimationFrame(animate)
    }

    window.addEventListener('mousemove', handleMouseMove, { passive: true })
    rafId = requestAnimationFrame(animate)

    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      if (rafId) cancelAnimationFrame(rafId)
    }
  }, [parallaxStrength])

  if (theme === 'none' || layers.length === 0) {
    return <>{children}</>
  }

  return (
    <div ref={containerRef} className="absolute inset-0 overflow-hidden pointer-events-none">
      {/* Render parallax layers */}
      {layers.map((layer, index) => {
        const offsetX = (mousePos.x - 0.5) * normalizedParallax * layer.depth
        const offsetY = (mousePos.y - 0.5) * normalizedParallax * layer.depth * 0.5

        // Animation styles
        let animationStyle = {}
        if (layer.animate === 'drift-left') {
          animationStyle = {
            animation: `driftLeft ${layer.animationSpeed || 60}s linear infinite`,
          }
        } else if (layer.animate === 'drift-right') {
          animationStyle = {
            animation: `driftRight ${layer.animationSpeed || 60}s linear infinite`,
          }
        } else if (layer.animate === 'float') {
          animationStyle = {
            animation: `float ${layer.animationSpeed || 8}s ease-in-out infinite`,
          }
        }

        return (
          <div
            key={index}
            className="absolute inset-0"
            style={{
              backgroundImage: `url(${layer.image})`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
              backgroundRepeat: layer.animate?.startsWith('drift') ? 'repeat-x' : 'no-repeat',
              transform: `translate(${offsetX}px, ${offsetY}px) scale(1.1)`,
              opacity: normalizedOpacity,
              imageRendering: 'pixelated',
              willChange: 'transform',
              zIndex: index,
              ...animationStyle,
            }}
          />
        )
      })}

      {/* Vignette overlay */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse at center, transparent 30%, rgba(0,0,0,0.5) 100%)',
          zIndex: layers.length + 1,
        }}
      />

      {/* Global keyframes */}
      <style>{`
        @keyframes driftLeft {
          from { background-position-x: 0; }
          to { background-position-x: -100%; }
        }
        @keyframes driftRight {
          from { background-position-x: 0; }
          to { background-position-x: 100%; }
        }
        @keyframes float {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-10px); }
        }
      `}</style>

      {/* Content */}
      {children}
    </div>
  )
}

export default PixelBackground
