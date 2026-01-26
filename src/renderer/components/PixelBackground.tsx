// File: src/renderer/components/PixelBackground.tsx
// Animated pixel art backgrounds with parallax cursor tracking

import React, { useEffect, useRef, useState, useMemo } from 'react'

// Import background images - Original
import sky1 from '../assets/backgrounds/sky 1.png'
import sky2 from '../assets/backgrounds/sky 2.png'
import skyline1 from '../assets/backgrounds/skyline.png'
import skyline2 from '../assets/backgrounds/skyline 2.png'

// Import new backgrounds - City
import cityNight1 from '../assets/backgrounds/city/city-night-1.png'
import cityNight2 from '../assets/backgrounds/city/city-night-2.png'
import cityDay from '../assets/backgrounds/city/city-day.png'

// Import new backgrounds - Sky
import clouds1 from '../assets/backgrounds/sky/clouds-1.png'
import clouds2 from '../assets/backgrounds/sky/clouds-2.png'
import cloudsSunset from '../assets/backgrounds/sky/clouds-sunset.png'

export type PixelTheme =
  | 'nightSky' | 'daySky' | 'cityReflection' | 'cityLights'
  | 'neonCity' | 'neonCity2' | 'pixelCity'
  | 'clouds' | 'cloudsDrift' | 'sunset'
  | 'custom'

// Theme images
const THEME_IMAGES: Record<PixelTheme, string> = {
  nightSky: sky1,
  daySky: sky2,
  cityReflection: skyline1,
  cityLights: skyline2,
  neonCity: cityNight1,
  neonCity2: cityNight2,
  pixelCity: cityDay,
  clouds: clouds1,
  cloudsDrift: clouds2,
  sunset: cloudsSunset,
  custom: '',
}

// Theme color palettes - these override app theme colors when pixel background is active
// Panels are more opaque for better text visibility
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
  nightSky: {
    primary: '#a78bfa',
    secondary: '#818cf8',
    accent: '#c4b5fd',
    bg: '#0a0714',
    panel: 'rgba(15, 10, 30, 0.95)',
    border: 'rgba(139, 92, 246, 0.3)',
    text: '#f5f3ff',
    muted: '#a5a3c7',
    gradient: 'linear-gradient(135deg, #4c1d95 0%, #1e1b4b 100%)',
  },
  daySky: {
    primary: '#38bdf8',
    secondary: '#22d3ee',
    accent: '#7dd3fc',
    bg: '#0a1520',
    panel: 'rgba(10, 21, 32, 0.95)',
    border: 'rgba(56, 189, 248, 0.3)',
    text: '#f0f9ff',
    muted: '#94a3b8',
    gradient: 'linear-gradient(135deg, #0284c7 0%, #0c4a6e 100%)',
  },
  cityReflection: {
    primary: '#c084fc',
    secondary: '#a78bfa',
    accent: '#d8b4fe',
    bg: '#0a0a14',
    panel: 'rgba(13, 13, 26, 0.95)',
    border: 'rgba(168, 85, 247, 0.3)',
    text: '#faf5ff',
    muted: '#a8a3c2',
    gradient: 'linear-gradient(135deg, #7c3aed 0%, #312e81 100%)',
  },
  cityLights: {
    primary: '#fb923c',
    secondary: '#f97316',
    accent: '#fdba74',
    bg: '#120a05',
    panel: 'rgba(18, 10, 5, 0.95)',
    border: 'rgba(249, 115, 22, 0.3)',
    text: '#fff7ed',
    muted: '#b8a090',
    gradient: 'linear-gradient(135deg, #ea580c 0%, #7c2d12 100%)',
  },
  neonCity: {
    primary: '#f472b6',
    secondary: '#22d3ee',
    accent: '#f9a8d4',
    bg: '#080812',
    panel: 'rgba(10, 10, 20, 0.95)',
    border: 'rgba(236, 72, 153, 0.3)',
    text: '#fdf2f8',
    muted: '#a8a3b8',
    gradient: 'linear-gradient(135deg, #ec4899 0%, #06b6d4 100%)',
  },
  neonCity2: {
    primary: '#a78bfa',
    secondary: '#e879f9',
    accent: '#c4b5fd',
    bg: '#0a0810',
    panel: 'rgba(13, 10, 20, 0.95)',
    border: 'rgba(139, 92, 246, 0.3)',
    text: '#faf5ff',
    muted: '#a5a0b8',
    gradient: 'linear-gradient(135deg, #8b5cf6 0%, #d946ef 100%)',
  },
  pixelCity: {
    primary: '#fbbf24',
    secondary: '#f59e0b',
    accent: '#fcd34d',
    bg: '#100c05',
    panel: 'rgba(16, 12, 5, 0.95)',
    border: 'rgba(245, 158, 11, 0.3)',
    text: '#fffbeb',
    muted: '#b5a888',
    gradient: 'linear-gradient(135deg, #f59e0b 0%, #b45309 100%)',
  },
  clouds: {
    primary: '#38bdf8',
    secondary: '#0ea5e9',
    accent: '#7dd3fc',
    bg: '#0a1218',
    panel: 'rgba(12, 21, 32, 0.95)',
    border: 'rgba(56, 189, 248, 0.3)',
    text: '#f0f9ff',
    muted: '#8facc0',
    gradient: 'linear-gradient(135deg, #38bdf8 0%, #0369a1 100%)',
  },
  cloudsDrift: {
    primary: '#94a3b8',
    secondary: '#64748b',
    accent: '#cbd5e1',
    bg: '#0c1015',
    panel: 'rgba(15, 19, 24, 0.95)',
    border: 'rgba(100, 116, 139, 0.3)',
    text: '#f1f5f9',
    muted: '#8892a0',
    gradient: 'linear-gradient(135deg, #64748b 0%, #334155 100%)',
  },
  sunset: {
    primary: '#fb923c',
    secondary: '#fb7185',
    accent: '#fdba74',
    bg: '#100808',
    panel: 'rgba(16, 8, 8, 0.95)',
    border: 'rgba(249, 115, 22, 0.3)',
    text: '#fff7ed',
    muted: '#b89090',
    gradient: 'linear-gradient(135deg, #f97316 0%, #be123c 100%)',
  },
  custom: {
    primary: '#a78bfa',
    secondary: '#818cf8',
    accent: '#c4b5fd',
    bg: '#08080c',
    panel: 'rgba(10, 10, 15, 0.95)',
    border: 'rgba(139, 92, 246, 0.3)',
    text: '#f5f3ff',
    muted: '#9090a0',
    gradient: 'linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%)',
  },
}

// Theme metadata for UI
export const THEME_INFO: Record<PixelTheme, { name: string; category: string }> = {
  nightSky: { name: 'Night Sky', category: 'Sky' },
  daySky: { name: 'Day Sky', category: 'Sky' },
  cityReflection: { name: 'City Reflection', category: 'City' },
  cityLights: { name: 'City Lights', category: 'City' },
  neonCity: { name: 'Neon City', category: 'City' },
  neonCity2: { name: 'Neon District', category: 'City' },
  pixelCity: { name: 'Pixel City', category: 'City' },
  clouds: { name: 'Clouds', category: 'Sky' },
  cloudsDrift: { name: 'Drifting Clouds', category: 'Sky' },
  sunset: { name: 'Sunset', category: 'Sky' },
  custom: { name: 'Custom', category: 'Other' },
}

interface PixelBackgroundProps {
  theme?: PixelTheme
  customImage?: string
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
  theme = 'cityLights',
  customImage,
  parallaxStrength = 30,
  opacity = 40,
  children,
}: PixelBackgroundProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [mousePos, setMousePos] = useState({ x: 0.5, y: 0.5 })

  const backgroundImage = customImage || THEME_IMAGES[theme]

  // Convert 0-100 scales to usable values
  const normalizedParallax = (parallaxStrength / 100) * 0.06 // Max 6% movement
  const normalizedOpacity = opacity / 100

  // Apply theme colors when theme changes
  useEffect(() => {
    if (theme && theme !== 'custom') {
      applyPixelThemeColors(theme)
    }
    return () => {
      // Don't clear on unmount - let the parent handle that
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
      if (!containerRef.current) return
      const rect = containerRef.current.getBoundingClientRect()
      targetX = (e.clientX - rect.left) / rect.width
      targetY = (e.clientY - rect.top) / rect.height
    }

    // Smooth interpolation loop
    const animate = () => {
      const ease = 0.08 // Lower = smoother
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

  const parallaxOffset = useMemo(() => {
    if (parallaxStrength === 0) return { x: 0, y: 0 }
    return {
      x: (mousePos.x - 0.5) * normalizedParallax * 100,
      y: (mousePos.y - 0.5) * normalizedParallax * 100,
    }
  }, [mousePos, normalizedParallax, parallaxStrength])

  return (
    <div ref={containerRef} className="absolute inset-0 overflow-hidden pointer-events-none">
      {/* Background image layer with parallax */}
      {backgroundImage && (
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: `url(${backgroundImage})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            transform: `translate(${parallaxOffset.x}px, ${parallaxOffset.y}px) scale(1.08)`,
            opacity: normalizedOpacity,
            imageRendering: 'pixelated',
            willChange: 'transform',
          }}
        />
      )}

      {/* Subtle vignette overlay */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.4) 100%)',
        }}
      />

      {/* Content */}
      {children}
    </div>
  )
}

export default PixelBackground
