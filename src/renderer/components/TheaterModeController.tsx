// File: src/renderer/components/TheaterModeController.tsx
// Enhanced theater mode with ambient effects and smart controls

import React, { useState, useCallback, useEffect, useMemo } from 'react'
import {
  Tv,
  Settings,
  X,
  Sun,
  Moon,
  Sparkles,
  Eye,
  Volume2,
  VolumeX,
  Maximize,
  Minimize,
  Monitor,
  Play,
  Pause,
  SkipForward,
  SkipBack,
  Clock,
  Star,
  Heart,
  Palette,
  Zap,
  Waves,
  SlidersHorizontal,
  ArrowUpDown
} from 'lucide-react'

interface TheaterModeSettings {
  enabled: boolean
  ambientLight: boolean
  ambientIntensity: number
  dimBackground: boolean
  dimLevel: number
  hideControls: boolean
  autoHideDelay: number
  cinematicBars: boolean
  colorCorrection: boolean
  brightness: number
  contrast: number
  saturation: number
  autoPlay: boolean
  autoAdvance: boolean
  preloadNext: boolean
  loopMode: 'none' | 'one' | 'all'
}

const DEFAULT_SETTINGS: TheaterModeSettings = {
  enabled: false,
  ambientLight: true,
  ambientIntensity: 60,
  dimBackground: true,
  dimLevel: 85,
  hideControls: true,
  autoHideDelay: 3,
  cinematicBars: false,
  colorCorrection: false,
  brightness: 100,
  contrast: 100,
  saturation: 100,
  autoPlay: true,
  autoAdvance: true,
  preloadNext: true,
  loopMode: 'none'
}

interface TheaterModeControllerProps {
  onEnterTheaterMode?: () => void
  onExitTheaterMode?: () => void
  onSettingsChange?: (settings: TheaterModeSettings) => void
  className?: string
}

export function TheaterModeController({
  onEnterTheaterMode,
  onExitTheaterMode,
  onSettingsChange,
  className = ''
}: TheaterModeControllerProps) {
  const [settings, setSettings] = useState<TheaterModeSettings>(() => {
    try {
      const saved = localStorage.getItem('vault-theater-settings')
      return saved ? { ...DEFAULT_SETTINGS, ...JSON.parse(saved) } : DEFAULT_SETTINGS
    } catch {
      return DEFAULT_SETTINGS
    }
  })
  const [showSettings, setShowSettings] = useState(false)
  const [activeSection, setActiveSection] = useState<'display' | 'playback' | 'effects'>('display')

  // Save settings
  useEffect(() => {
    localStorage.setItem('vault-theater-settings', JSON.stringify(settings))
    onSettingsChange?.(settings)
  }, [settings, onSettingsChange])

  // Update setting
  const updateSetting = useCallback(<K extends keyof TheaterModeSettings>(
    key: K,
    value: TheaterModeSettings[K]
  ) => {
    setSettings(prev => ({ ...prev, [key]: value }))
  }, [])

  // Toggle theater mode
  const toggleTheaterMode = useCallback(() => {
    const newEnabled = !settings.enabled
    updateSetting('enabled', newEnabled)
    if (newEnabled) {
      onEnterTheaterMode?.()
    } else {
      onExitTheaterMode?.()
    }
  }, [settings.enabled, updateSetting, onEnterTheaterMode, onExitTheaterMode])

  // Quick presets
  const applyPreset = useCallback((preset: 'cinema' | 'gaming' | 'focus' | 'default') => {
    const presets: Record<string, Partial<TheaterModeSettings>> = {
      cinema: {
        ambientLight: true,
        ambientIntensity: 80,
        dimBackground: true,
        dimLevel: 95,
        cinematicBars: true,
        colorCorrection: true,
        contrast: 110,
        saturation: 110
      },
      gaming: {
        ambientLight: true,
        ambientIntensity: 100,
        dimBackground: true,
        dimLevel: 70,
        cinematicBars: false,
        colorCorrection: true,
        brightness: 105,
        saturation: 120
      },
      focus: {
        ambientLight: false,
        dimBackground: true,
        dimLevel: 100,
        cinematicBars: false,
        colorCorrection: false
      },
      default: DEFAULT_SETTINGS
    }
    setSettings(prev => ({ ...prev, ...presets[preset] }))
  }, [])

  return (
    <div className={`relative ${className}`}>
      {/* Toggle button */}
      <button
        onClick={toggleTheaterMode}
        className={`flex items-center gap-2 px-4 py-2 rounded-xl transition ${
          settings.enabled
            ? 'bg-[var(--primary)] text-white'
            : 'bg-zinc-800 text-zinc-400 hover:text-white'
        }`}
      >
        <Tv size={18} />
        <span className="text-sm font-medium">Theater</span>
      </button>

      {/* Settings button */}
      <button
        onClick={() => setShowSettings(prev => !prev)}
        className="absolute -right-2 -top-2 p-1.5 rounded-full bg-zinc-700 hover:bg-zinc-600 transition"
      >
        <Settings size={12} />
      </button>

      {/* Settings panel */}
      {showSettings && (
        <div className="absolute top-full mt-2 right-0 w-80 bg-zinc-900/95 backdrop-blur-xl rounded-2xl border border-zinc-700 shadow-2xl overflow-hidden z-50">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
            <div className="flex items-center gap-2">
              <Tv size={16} className="text-[var(--primary)]" />
              <span className="font-semibold text-sm">Theater Mode</span>
            </div>
            <button onClick={() => setShowSettings(false)} className="p-1 rounded hover:bg-zinc-800">
              <X size={14} />
            </button>
          </div>

          {/* Section tabs */}
          <div className="flex border-b border-zinc-800">
            {[
              { id: 'display', label: 'Display', icon: Monitor },
              { id: 'playback', label: 'Playback', icon: Play },
              { id: 'effects', label: 'Effects', icon: Sparkles }
            ].map(section => {
              const Icon = section.icon
              return (
                <button
                  key={section.id}
                  onClick={() => setActiveSection(section.id as any)}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs transition ${
                    activeSection === section.id
                      ? 'text-[var(--primary)] border-b-2 border-[var(--primary)]'
                      : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  <Icon size={12} />
                  {section.label}
                </button>
              )
            })}
          </div>

          {/* Settings content */}
          <div className="p-4 space-y-4 max-h-[50vh] overflow-y-auto">
            {/* Quick presets */}
            <div className="space-y-2">
              <label className="text-xs text-zinc-400 font-medium">Quick Presets</label>
              <div className="grid grid-cols-4 gap-2">
                {[
                  { id: 'cinema', label: 'Cinema', icon: Tv },
                  { id: 'gaming', label: 'Gaming', icon: Zap },
                  { id: 'focus', label: 'Focus', icon: Eye },
                  { id: 'default', label: 'Default', icon: SlidersHorizontal }
                ].map(preset => {
                  const Icon = preset.icon
                  return (
                    <button
                      key={preset.id}
                      onClick={() => applyPreset(preset.id as any)}
                      className="flex flex-col items-center gap-1 p-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 transition text-xs"
                    >
                      <Icon size={14} className="text-zinc-400" />
                      {preset.label}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Display settings */}
            {activeSection === 'display' && (
              <div className="space-y-3">
                <SettingToggle
                  label="Dim Background"
                  description="Darken surrounding UI"
                  enabled={settings.dimBackground}
                  onChange={(v) => updateSetting('dimBackground', v)}
                />
                {settings.dimBackground && (
                  <SettingSlider
                    label="Dim Level"
                    value={settings.dimLevel}
                    min={50}
                    max={100}
                    onChange={(v) => updateSetting('dimLevel', v)}
                    suffix="%"
                  />
                )}

                <SettingToggle
                  label="Cinematic Bars"
                  description="Letterbox bars for widescreen"
                  enabled={settings.cinematicBars}
                  onChange={(v) => updateSetting('cinematicBars', v)}
                />

                <SettingToggle
                  label="Auto-hide Controls"
                  description="Hide player controls when idle"
                  enabled={settings.hideControls}
                  onChange={(v) => updateSetting('hideControls', v)}
                />
                {settings.hideControls && (
                  <SettingSlider
                    label="Auto-hide Delay"
                    value={settings.autoHideDelay}
                    min={1}
                    max={10}
                    onChange={(v) => updateSetting('autoHideDelay', v)}
                    suffix="s"
                  />
                )}
              </div>
            )}

            {/* Playback settings */}
            {activeSection === 'playback' && (
              <div className="space-y-3">
                <SettingToggle
                  label="Auto-play"
                  description="Start playing immediately"
                  enabled={settings.autoPlay}
                  onChange={(v) => updateSetting('autoPlay', v)}
                />

                <SettingToggle
                  label="Auto-advance"
                  description="Play next item when current ends"
                  enabled={settings.autoAdvance}
                  onChange={(v) => updateSetting('autoAdvance', v)}
                />

                <SettingToggle
                  label="Preload Next"
                  description="Buffer next video for instant playback"
                  enabled={settings.preloadNext}
                  onChange={(v) => updateSetting('preloadNext', v)}
                />

                <div className="space-y-1">
                  <label className="text-xs text-zinc-400">Loop Mode</label>
                  <div className="flex gap-2">
                    {[
                      { value: 'none', label: 'Off' },
                      { value: 'one', label: 'One' },
                      { value: 'all', label: 'All' }
                    ].map(opt => (
                      <button
                        key={opt.value}
                        onClick={() => updateSetting('loopMode', opt.value as any)}
                        className={`flex-1 py-1.5 rounded-lg text-xs transition ${
                          settings.loopMode === opt.value
                            ? 'bg-[var(--primary)] text-white'
                            : 'bg-zinc-800 text-zinc-400'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Effects settings */}
            {activeSection === 'effects' && (
              <div className="space-y-3">
                <SettingToggle
                  label="Ambient Light"
                  description="Dynamic background glow from video"
                  enabled={settings.ambientLight}
                  onChange={(v) => updateSetting('ambientLight', v)}
                />
                {settings.ambientLight && (
                  <SettingSlider
                    label="Ambient Intensity"
                    value={settings.ambientIntensity}
                    min={20}
                    max={100}
                    onChange={(v) => updateSetting('ambientIntensity', v)}
                    suffix="%"
                  />
                )}

                <SettingToggle
                  label="Color Correction"
                  description="Manual brightness/contrast/saturation"
                  enabled={settings.colorCorrection}
                  onChange={(v) => updateSetting('colorCorrection', v)}
                />
                {settings.colorCorrection && (
                  <>
                    <SettingSlider
                      label="Brightness"
                      value={settings.brightness}
                      min={50}
                      max={150}
                      onChange={(v) => updateSetting('brightness', v)}
                      suffix="%"
                    />
                    <SettingSlider
                      label="Contrast"
                      value={settings.contrast}
                      min={50}
                      max={150}
                      onChange={(v) => updateSetting('contrast', v)}
                      suffix="%"
                    />
                    <SettingSlider
                      label="Saturation"
                      value={settings.saturation}
                      min={0}
                      max={200}
                      onChange={(v) => updateSetting('saturation', v)}
                      suffix="%"
                    />
                  </>
                )}
              </div>
            )}
          </div>

          {/* Reset button */}
          <div className="px-4 pb-4">
            <button
              onClick={() => setSettings(DEFAULT_SETTINGS)}
              className="w-full py-2 text-xs text-zinc-400 hover:text-white transition"
            >
              Reset to defaults
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// Setting toggle component
function SettingToggle({
  label,
  description,
  enabled,
  onChange
}: {
  label: string
  description?: string
  enabled: boolean
  onChange: (value: boolean) => void
}) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <div className="text-sm text-white">{label}</div>
        {description && <div className="text-xs text-zinc-500">{description}</div>}
      </div>
      <button
        onClick={() => onChange(!enabled)}
        className={`w-10 h-6 rounded-full transition ${enabled ? 'bg-[var(--primary)]' : 'bg-zinc-700'}`}
      >
        <div className={`w-4 h-4 rounded-full bg-white transform transition ${enabled ? 'translate-x-5' : 'translate-x-1'}`} />
      </button>
    </div>
  )
}

// Setting slider component
function SettingSlider({
  label,
  value,
  min,
  max,
  onChange,
  suffix = ''
}: {
  label: string
  value: number
  min: number
  max: number
  onChange: (value: number) => void
  suffix?: string
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-xs text-zinc-400">{label}</span>
        <span className="text-xs text-zinc-500">{value}{suffix}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(parseInt(e.target.value))}
        className="w-full accent-[var(--primary)]"
      />
    </div>
  )
}

// Theater mode overlay for background dimming
export function TheaterModeOverlay({
  enabled,
  dimLevel,
  cinematicBars,
  className = ''
}: {
  enabled: boolean
  dimLevel: number
  cinematicBars: boolean
  className?: string
}) {
  if (!enabled) return null

  return (
    <>
      {/* Dim overlay */}
      <div
        className={`fixed inset-0 bg-black pointer-events-none z-[9980] ${className}`}
        style={{ opacity: dimLevel / 100 }}
      />

      {/* Cinematic bars */}
      {cinematicBars && (
        <>
          <div className="fixed top-0 left-0 right-0 h-[10vh] bg-black z-[9985]" />
          <div className="fixed bottom-0 left-0 right-0 h-[10vh] bg-black z-[9985]" />
        </>
      )}
    </>
  )
}

// Color correction filter for video
export function ColorCorrectionFilter({
  brightness,
  contrast,
  saturation
}: {
  brightness: number
  contrast: number
  saturation: number
}) {
  const filterStyle = useMemo(() => {
    return {
      filter: `brightness(${brightness / 100}) contrast(${contrast / 100}) saturate(${saturation / 100})`
    }
  }, [brightness, contrast, saturation])

  return (
    <style>{`
      .theater-video {
        filter: brightness(${brightness / 100}) contrast(${contrast / 100}) saturate(${saturation / 100});
      }
    `}</style>
  )
}

// Hook for theater mode state
export function useTheaterMode() {
  const [settings, setSettings] = useState<TheaterModeSettings>(() => {
    try {
      const saved = localStorage.getItem('vault-theater-settings')
      return saved ? { ...DEFAULT_SETTINGS, ...JSON.parse(saved) } : DEFAULT_SETTINGS
    } catch {
      return DEFAULT_SETTINGS
    }
  })

  const toggleTheaterMode = useCallback(() => {
    setSettings(prev => {
      const next = { ...prev, enabled: !prev.enabled }
      localStorage.setItem('vault-theater-settings', JSON.stringify(next))
      return next
    })
  }, [])

  const updateSetting = useCallback(<K extends keyof TheaterModeSettings>(
    key: K,
    value: TheaterModeSettings[K]
  ) => {
    setSettings(prev => {
      const next = { ...prev, [key]: value }
      localStorage.setItem('vault-theater-settings', JSON.stringify(next))
      return next
    })
  }, [])

  return {
    settings,
    toggleTheaterMode,
    updateSetting,
    isTheaterMode: settings.enabled
  }
}

export default TheaterModeController
