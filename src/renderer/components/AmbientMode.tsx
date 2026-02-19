// File: src/renderer/components/AmbientMode.tsx
// Ambient lighting mode with color extraction and dynamic effects

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import {
  Sun,
  Moon,
  Settings,
  X,
  Palette,
  Zap,
  Sparkles,
  Eye,
  EyeOff,
  Monitor,
  Lightbulb,
  Waves,
  Circle,
  Square
} from 'lucide-react'

interface AmbientModeProps {
  videoRef?: React.RefObject<HTMLVideoElement>
  imageUrl?: string
  enabled?: boolean
  onToggle?: (enabled: boolean) => void
  className?: string
}

interface AmbientSettings {
  intensity: number // 0-100
  blur: number // 0-100
  spread: number // 0-100
  saturation: number // 0-200
  mode: 'auto' | 'static' | 'pulse' | 'reactive'
  position: 'all' | 'sides' | 'bottom' | 'top'
  color?: string // For static mode
  updateRate: number // ms between color updates
}

const DEFAULT_SETTINGS: AmbientSettings = {
  intensity: 60,
  blur: 70,
  spread: 80,
  saturation: 120,
  mode: 'auto',
  position: 'all',
  updateRate: 100
}

export function AmbientMode({
  videoRef,
  imageUrl,
  enabled = false,
  onToggle,
  className = ''
}: AmbientModeProps) {
  const [settings, setSettings] = useState<AmbientSettings>(() => {
    try {
      const saved = localStorage.getItem('vault-ambient-settings')
      return saved ? { ...DEFAULT_SETTINGS, ...JSON.parse(saved) } : DEFAULT_SETTINGS
    } catch {
      return DEFAULT_SETTINGS
    }
  })
  const [dominantColors, setDominantColors] = useState<string[]>(['#1a1a2e', '#16213e', '#0f3460'])
  const [showSettings, setShowSettings] = useState(false)
  const [isPulsing, setPulsing] = useState(false)

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animationRef = useRef<number>(0)
  const lastUpdateRef = useRef<number>(0)

  // Save settings
  useEffect(() => {
    localStorage.setItem('vault-ambient-settings', JSON.stringify(settings))
  }, [settings])

  // Extract colors from video frame
  const extractColorsFromVideo = useCallback(() => {
    if (!videoRef?.current || !canvasRef.current) return

    const video = videoRef.current
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Downscale for performance
    const width = 32
    const height = 18
    canvas.width = width
    canvas.height = height

    try {
      ctx.drawImage(video, 0, 0, width, height)
      const imageData = ctx.getImageData(0, 0, width, height).data

      // Sample colors from different regions
      const regions = {
        topLeft: { x: 0, y: 0, w: width / 2, h: height / 2 },
        topRight: { x: width / 2, y: 0, w: width / 2, h: height / 2 },
        bottomLeft: { x: 0, y: height / 2, w: width / 2, h: height / 2 },
        bottomRight: { x: width / 2, y: height / 2, w: width / 2, h: height / 2 },
        center: { x: width / 4, y: height / 4, w: width / 2, h: height / 2 }
      }

      const colors: string[] = []
      for (const region of Object.values(regions)) {
        let r = 0, g = 0, b = 0, count = 0
        for (let y = region.y; y < region.y + region.h; y++) {
          for (let x = region.x; x < region.x + region.w; x++) {
            const i = (y * width + x) * 4
            r += imageData[i]
            g += imageData[i + 1]
            b += imageData[i + 2]
            count++
          }
        }
        // Apply saturation boost
        const satMult = settings.saturation / 100
        const avg = (r + g + b) / 3 / count
        r = Math.min(255, avg + (r / count - avg) * satMult)
        g = Math.min(255, avg + (g / count - avg) * satMult)
        b = Math.min(255, avg + (b / count - avg) * satMult)
        colors.push(`rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`)
      }

      setDominantColors(colors)
    } catch (e) {
      // Video might not be ready
    }
  }, [videoRef, settings.saturation])

  // Extract colors from static image
  const extractColorsFromImage = useCallback((url: string) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      const canvas = canvasRef.current
      if (!canvas) return
      const ctx = canvas.getContext('2d')
      if (!ctx) return

      const width = 32
      const height = 18
      canvas.width = width
      canvas.height = height

      ctx.drawImage(img, 0, 0, width, height)
      const imageData = ctx.getImageData(0, 0, width, height).data

      const colors: string[] = []
      const regions = [
        [0, 0, 16, 9],
        [16, 0, 16, 9],
        [0, 9, 16, 9],
        [16, 9, 16, 9],
        [8, 4, 16, 10]
      ]

      for (const [rx, ry, rw, rh] of regions) {
        let r = 0, g = 0, b = 0, count = 0
        for (let y = ry; y < ry + rh; y++) {
          for (let x = rx; x < rx + rw; x++) {
            const i = (y * width + x) * 4
            r += imageData[i]
            g += imageData[i + 1]
            b += imageData[i + 2]
            count++
          }
        }
        const satMult = settings.saturation / 100
        const avg = (r + g + b) / 3 / count
        r = Math.min(255, avg + (r / count - avg) * satMult)
        g = Math.min(255, avg + (g / count - avg) * satMult)
        b = Math.min(255, avg + (b / count - avg) * satMult)
        colors.push(`rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`)
      }

      setDominantColors(colors)
    }
    img.src = url
  }, [settings.saturation])

  // Animation loop for video color extraction
  useEffect(() => {
    if (!enabled || !videoRef?.current || settings.mode !== 'auto') {
      return
    }

    const animate = (timestamp: number) => {
      if (timestamp - lastUpdateRef.current >= settings.updateRate) {
        extractColorsFromVideo()
        lastUpdateRef.current = timestamp
      }
      animationRef.current = requestAnimationFrame(animate)
    }

    animationRef.current = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(animationRef.current)
  }, [enabled, videoRef, settings.mode, settings.updateRate, extractColorsFromVideo])

  // Extract colors from image when URL changes
  useEffect(() => {
    if (!enabled || !imageUrl) return
    extractColorsFromImage(imageUrl)
  }, [enabled, imageUrl, extractColorsFromImage])

  // Pulse effect
  useEffect(() => {
    if (!enabled || settings.mode !== 'pulse') return

    const interval = setInterval(() => {
      setPulsing(prev => !prev)
    }, 1500)

    return () => clearInterval(interval)
  }, [enabled, settings.mode])

  // Generate gradient based on position
  const gradientStyle = useMemo(() => {
    if (!enabled) return {}

    const intensity = settings.intensity / 100
    const blur = settings.blur
    const spread = settings.spread

    const color1 = dominantColors[0] || '#1a1a2e'
    const color2 = dominantColors[1] || '#16213e'
    const color3 = dominantColors[2] || '#0f3460'
    const color4 = dominantColors[3] || '#1a1a2e'
    const color5 = dominantColors[4] || '#16213e'

    let boxShadow = ''

    switch (settings.position) {
      case 'sides':
        boxShadow = `
          -${spread * 2}px 0 ${blur * 2}px ${spread}px ${color1},
          ${spread * 2}px 0 ${blur * 2}px ${spread}px ${color2}
        `
        break
      case 'bottom':
        boxShadow = `
          0 ${spread * 2}px ${blur * 2}px ${spread}px ${color5}
        `
        break
      case 'top':
        boxShadow = `
          0 -${spread * 2}px ${blur * 2}px ${spread}px ${color5}
        `
        break
      case 'all':
      default:
        boxShadow = `
          -${spread * 1.5}px 0 ${blur * 2}px ${spread}px ${color1},
          ${spread * 1.5}px 0 ${blur * 2}px ${spread}px ${color2},
          0 -${spread * 1.5}px ${blur * 2}px ${spread}px ${color3},
          0 ${spread * 1.5}px ${blur * 2}px ${spread}px ${color4},
          0 0 ${blur * 3}px ${spread * 1.5}px ${color5}
        `
    }

    return {
      boxShadow,
      opacity: intensity * (settings.mode === 'pulse' && isPulsing ? 1.2 : 1),
      transition: settings.mode === 'auto' ? `box-shadow ${settings.updateRate}ms ease` : 'box-shadow 0.5s ease, opacity 1s ease'
    }
  }, [enabled, settings, dominantColors, isPulsing])

  // Update setting
  const updateSetting = useCallback(<K extends keyof AmbientSettings>(key: K, value: AmbientSettings[K]) => {
    setSettings(prev => ({ ...prev, [key]: value }))
  }, [])

  if (!enabled) return null

  return (
    <>
      {/* Hidden canvas for color extraction */}
      <canvas ref={canvasRef} className="hidden" />

      {/* Ambient glow layer */}
      <div
        className={`fixed inset-0 pointer-events-none z-[9990] ${className}`}
        style={gradientStyle}
      />

      {/* Settings button */}
      <button
        onClick={() => setShowSettings(prev => !prev)}
        className="fixed bottom-4 left-4 z-[9995] p-2 rounded-full bg-black/50 backdrop-blur-sm border border-white/20 hover:bg-black/70 transition"
        title="Ambient settings"
      >
        <Palette size={18} className="text-white" />
      </button>

      {/* Settings panel */}
      {showSettings && (
        <div className="fixed bottom-16 left-4 z-[9995] w-72 bg-zinc-900/95 backdrop-blur-xl rounded-2xl border border-zinc-700 shadow-2xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
            <div className="flex items-center gap-2">
              <Sparkles size={16} className="text-[var(--primary)]" />
              <span className="font-semibold text-sm">Ambient Mode</span>
            </div>
            <button
              onClick={() => setShowSettings(false)}
              className="p-1 rounded hover:bg-zinc-800 transition"
            >
              <X size={14} />
            </button>
          </div>

          <div className="p-4 space-y-4">
            {/* Mode selector */}
            <div className="space-y-2">
              <label className="text-xs text-zinc-400">Mode</label>
              <div className="grid grid-cols-4 gap-1">
                {[
                  { id: 'auto', label: 'Auto', icon: Zap },
                  { id: 'static', label: 'Static', icon: Circle },
                  { id: 'pulse', label: 'Pulse', icon: Waves },
                  { id: 'reactive', label: 'React', icon: Lightbulb }
                ].map(mode => {
                  const Icon = mode.icon
                  return (
                    <button
                      key={mode.id}
                      onClick={() => updateSetting('mode', mode.id as any)}
                      className={`flex flex-col items-center gap-1 p-2 rounded-lg transition text-xs ${
                        settings.mode === mode.id
                          ? 'bg-[var(--primary)]/20 text-[var(--primary)]'
                          : 'bg-zinc-800 text-zinc-400 hover:text-white'
                      }`}
                    >
                      <Icon size={14} />
                      {mode.label}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Position selector */}
            <div className="space-y-2">
              <label className="text-xs text-zinc-400">Position</label>
              <div className="flex gap-1">
                {[
                  { id: 'all', label: 'All' },
                  { id: 'sides', label: 'Sides' },
                  { id: 'bottom', label: 'Bottom' },
                  { id: 'top', label: 'Top' }
                ].map(pos => (
                  <button
                    key={pos.id}
                    onClick={() => updateSetting('position', pos.id as any)}
                    className={`flex-1 py-1.5 rounded-lg text-xs transition ${
                      settings.position === pos.id
                        ? 'bg-[var(--primary)]/20 text-[var(--primary)]'
                        : 'bg-zinc-800 text-zinc-400 hover:text-white'
                    }`}
                  >
                    {pos.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Intensity slider */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-zinc-400">Intensity</span>
                <span className="text-zinc-500">{settings.intensity}%</span>
              </div>
              <input
                type="range"
                min={10}
                max={100}
                step={1}
                value={settings.intensity}
                onChange={(e) => updateSetting('intensity', parseInt(e.target.value))}
                className="w-full accent-[var(--primary)]"
                aria-label="Ambient Intensity"
                aria-valuemin={10}
                aria-valuemax={100}
                aria-valuenow={settings.intensity}
              />
            </div>

            {/* Blur slider */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-zinc-400">Blur</span>
                <span className="text-zinc-500">{settings.blur}%</span>
              </div>
              <input
                type="range"
                min={20}
                max={100}
                step={1}
                value={settings.blur}
                onChange={(e) => updateSetting('blur', parseInt(e.target.value))}
                className="w-full accent-[var(--primary)]"
                aria-label="Ambient Blur"
                aria-valuemin={20}
                aria-valuemax={100}
                aria-valuenow={settings.blur}
              />
            </div>

            {/* Spread slider */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-zinc-400">Spread</span>
                <span className="text-zinc-500">{settings.spread}%</span>
              </div>
              <input
                type="range"
                min={20}
                max={100}
                step={1}
                value={settings.spread}
                onChange={(e) => updateSetting('spread', parseInt(e.target.value))}
                className="w-full accent-[var(--primary)]"
                aria-label="Ambient Spread"
                aria-valuemin={20}
                aria-valuemax={100}
                aria-valuenow={settings.spread}
              />
            </div>

            {/* Saturation slider */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-zinc-400">Saturation</span>
                <span className="text-zinc-500">{settings.saturation}%</span>
              </div>
              <input
                type="range"
                min={50}
                max={200}
                step={1}
                value={settings.saturation}
                onChange={(e) => updateSetting('saturation', parseInt(e.target.value))}
                className="w-full accent-[var(--primary)]"
                aria-label="Ambient Saturation"
                aria-valuemin={50}
                aria-valuemax={200}
                aria-valuenow={settings.saturation}
              />
            </div>

            {/* Color preview */}
            <div className="space-y-2">
              <label className="text-xs text-zinc-400">Detected Colors</label>
              <div className="flex gap-2">
                {dominantColors.slice(0, 5).map((color, i) => (
                  <div
                    key={i}
                    className="w-10 h-10 rounded-lg border border-zinc-700"
                    style={{ backgroundColor: color }}
                    title={color}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* Toggle off */}
          <div className="px-4 pb-4">
            <button
              onClick={() => onToggle?.(false)}
              className="w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 transition text-sm"
            >
              <EyeOff size={14} />
              Disable Ambient Mode
            </button>
          </div>
        </div>
      )}
    </>
  )
}

// Ambient mode toggle button
export function AmbientModeToggle({
  enabled,
  onToggle,
  className = ''
}: {
  enabled: boolean
  onToggle: (enabled: boolean) => void
  className?: string
}) {
  return (
    <button
      onClick={() => onToggle(!enabled)}
      className={`flex items-center gap-2 px-3 py-2 rounded-lg transition ${
        enabled
          ? 'bg-[var(--primary)]/20 text-[var(--primary)]'
          : 'bg-zinc-800 text-zinc-400 hover:text-white'
      } ${className}`}
      title={enabled ? 'Disable ambient mode' : 'Enable ambient mode'}
    >
      <Sparkles size={16} />
      <span className="text-sm">Ambient</span>
    </button>
  )
}

// Pre-built ambient presets
export function AmbientPresetButton({
  preset,
  onApply,
  className = ''
}: {
  preset: 'romantic' | 'energetic' | 'calm' | 'intense'
  onApply: (settings: Partial<AmbientSettings>) => void
  className?: string
}) {
  const presets: Record<string, { settings: Partial<AmbientSettings>; icon: React.ElementType; color: string }> = {
    romantic: {
      settings: { intensity: 40, blur: 80, saturation: 130, mode: 'pulse' },
      icon: Moon,
      color: 'text-pink-400'
    },
    energetic: {
      settings: { intensity: 80, blur: 60, saturation: 150, mode: 'auto', updateRate: 50 },
      icon: Zap,
      color: 'text-yellow-400'
    },
    calm: {
      settings: { intensity: 30, blur: 90, saturation: 100, mode: 'auto', updateRate: 200 },
      icon: Waves,
      color: 'text-blue-400'
    },
    intense: {
      settings: { intensity: 90, blur: 50, saturation: 180, mode: 'reactive' },
      icon: Sun,
      color: 'text-orange-400'
    }
  }

  const config = presets[preset]
  const Icon = config.icon

  return (
    <button
      onClick={() => onApply(config.settings)}
      className={`flex items-center gap-2 px-3 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 transition ${className}`}
    >
      <Icon size={14} className={config.color} />
      <span className="text-sm capitalize">{preset}</span>
    </button>
  )
}

export default AmbientMode
