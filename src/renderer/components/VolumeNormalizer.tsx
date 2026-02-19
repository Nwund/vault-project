// File: src/renderer/components/VolumeNormalizer.tsx
// Audio normalization and loudness controls

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import {
  Volume2,
  VolumeX,
  Volume1,
  Settings,
  Sliders,
  Activity,
  BarChart3,
  Zap,
  Moon,
  AlertCircle,
  Check,
  RefreshCw,
  X
} from 'lucide-react'

interface AudioNormalizationSettings {
  enabled: boolean
  targetLoudness: number // -24 to -14 LUFS
  maxPeak: number // -6 to 0 dB
  compressorEnabled: boolean
  compressorThreshold: number
  compressorRatio: number
  limiterEnabled: boolean
  nightMode: boolean
  nightModeReduction: number
}

interface VolumeNormalizerProps {
  videoRef: React.RefObject<HTMLVideoElement>
  settings?: Partial<AudioNormalizationSettings>
  onSettingsChange?: (settings: AudioNormalizationSettings) => void
  className?: string
}

const DEFAULT_SETTINGS: AudioNormalizationSettings = {
  enabled: true,
  targetLoudness: -18,
  maxPeak: -1,
  compressorEnabled: false,
  compressorThreshold: -20,
  compressorRatio: 4,
  limiterEnabled: true,
  nightMode: false,
  nightModeReduction: -10
}

export function VolumeNormalizer({
  videoRef,
  settings: initialSettings,
  onSettingsChange,
  className = ''
}: VolumeNormalizerProps) {
  const [settings, setSettings] = useState<AudioNormalizationSettings>({
    ...DEFAULT_SETTINGS,
    ...initialSettings
  })
  const [showSettings, setShowSettings] = useState(false)
  const [currentLevel, setCurrentLevel] = useState(-60)
  const [peakLevel, setPeakLevel] = useState(-60)
  const [isAnalyzing, setIsAnalyzing] = useState(false)

  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const gainNodeRef = useRef<GainNode | null>(null)
  const compressorRef = useRef<DynamicsCompressorNode | null>(null)
  const limiterRef = useRef<DynamicsCompressorNode | null>(null)
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null)
  const animationRef = useRef<number>()

  // Initialize audio processing
  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    // Create audio context
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)()
    audioContextRef.current = audioContext

    // Create nodes
    const source = audioContext.createMediaElementSource(video)
    sourceRef.current = source

    const analyser = audioContext.createAnalyser()
    analyser.fftSize = 256
    analyserRef.current = analyser

    const gainNode = audioContext.createGain()
    gainNodeRef.current = gainNode

    // Compressor
    const compressor = audioContext.createDynamicsCompressor()
    compressorRef.current = compressor

    // Limiter (compressor with high ratio)
    const limiter = audioContext.createDynamicsCompressor()
    limiter.threshold.value = settings.maxPeak
    limiter.knee.value = 0
    limiter.ratio.value = 20
    limiter.attack.value = 0.001
    limiter.release.value = 0.1
    limiterRef.current = limiter

    // Connect chain: source -> analyser -> gain -> compressor -> limiter -> destination
    source.connect(analyser)
    analyser.connect(gainNode)

    if (settings.compressorEnabled) {
      gainNode.connect(compressor)
      if (settings.limiterEnabled) {
        compressor.connect(limiter)
        limiter.connect(audioContext.destination)
      } else {
        compressor.connect(audioContext.destination)
      }
    } else if (settings.limiterEnabled) {
      gainNode.connect(limiter)
      limiter.connect(audioContext.destination)
    } else {
      gainNode.connect(audioContext.destination)
    }

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
      audioContext.close()
    }
  }, [videoRef])

  // Update audio processing when settings change
  useEffect(() => {
    if (!gainNodeRef.current || !compressorRef.current || !limiterRef.current) return

    // Apply gain for normalization
    const gain = settings.nightMode
      ? Math.pow(10, settings.nightModeReduction / 20)
      : 1
    gainNodeRef.current.gain.value = gain

    // Update compressor
    compressorRef.current.threshold.value = settings.compressorThreshold
    compressorRef.current.ratio.value = settings.compressorRatio

    // Update limiter
    limiterRef.current.threshold.value = settings.maxPeak

    onSettingsChange?.(settings)
  }, [settings, onSettingsChange])

  // Analyze audio levels
  useEffect(() => {
    if (!analyserRef.current || !settings.enabled) return

    const analyser = analyserRef.current
    const dataArray = new Uint8Array(analyser.frequencyBinCount)

    const analyze = () => {
      analyser.getByteFrequencyData(dataArray)

      // Calculate RMS level
      let sum = 0
      for (let i = 0; i < dataArray.length; i++) {
        sum += dataArray[i] * dataArray[i]
      }
      const rms = Math.sqrt(sum / dataArray.length)
      const db = 20 * Math.log10(rms / 255) || -60

      setCurrentLevel(Math.max(-60, Math.min(0, db)))
      setPeakLevel(prev => Math.max(prev * 0.95, db))

      animationRef.current = requestAnimationFrame(analyze)
    }

    setIsAnalyzing(true)
    analyze()

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
      setIsAnalyzing(false)
    }
  }, [settings.enabled])

  // Update settings
  const updateSettings = useCallback((updates: Partial<AudioNormalizationSettings>) => {
    setSettings(prev => {
      const next = { ...prev, ...updates }
      localStorage.setItem('vault-audio-settings', JSON.stringify(next))
      return next
    })
  }, [])

  // Presets
  const presets = useMemo(() => [
    { name: 'Default', settings: DEFAULT_SETTINGS },
    { name: 'Loud', settings: { ...DEFAULT_SETTINGS, targetLoudness: -14 } },
    { name: 'Quiet', settings: { ...DEFAULT_SETTINGS, targetLoudness: -24 } },
    { name: 'Night', settings: { ...DEFAULT_SETTINGS, nightMode: true, nightModeReduction: -15 } },
    { name: 'Dynamic', settings: { ...DEFAULT_SETTINGS, compressorEnabled: true, compressorRatio: 2 } }
  ], [])

  // Level indicator color
  const getLevelColor = (level: number) => {
    if (level > -3) return 'bg-red-500'
    if (level > -10) return 'bg-yellow-500'
    return 'bg-green-500'
  }

  return (
    <div className={`relative ${className}`}>
      {/* Main button */}
      <button
        onClick={() => setShowSettings(!showSettings)}
        className={`flex items-center gap-2 px-3 py-2 rounded-lg transition ${
          settings.enabled
            ? 'bg-[var(--primary)]/20 text-[var(--primary)]'
            : 'bg-zinc-800 hover:bg-zinc-700'
        }`}
      >
        {settings.nightMode ? (
          <Moon size={16} />
        ) : (
          <Sliders size={16} />
        )}
        <span className="text-sm">Audio</span>
        {isAnalyzing && (
          <div className="flex items-end gap-0.5 h-3">
            {[0, 1, 2].map(i => (
              <div
                key={i}
                className={`w-1 ${getLevelColor(currentLevel)} rounded-full transition-all`}
                style={{
                  height: `${Math.max(10, (currentLevel + 60) * 100 / 60 - i * 10)}%`
                }}
              />
            ))}
          </div>
        )}
      </button>

      {/* Settings panel */}
      {showSettings && (
        <div className="absolute bottom-full mb-2 right-0 w-80 bg-zinc-900/95 backdrop-blur-xl rounded-2xl border border-zinc-700 shadow-2xl overflow-hidden z-50">
          <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
            <div className="flex items-center gap-2">
              <Sliders size={16} className="text-[var(--primary)]" />
              <span className="font-semibold text-sm">Audio Normalization</span>
            </div>
            <button onClick={() => setShowSettings(false)}>
              <X size={14} />
            </button>
          </div>

          {/* Level meters */}
          <div className="px-4 py-3 border-b border-zinc-800">
            <div className="flex items-center justify-between text-xs text-zinc-500 mb-2">
              <span>Level</span>
              <span>{currentLevel.toFixed(1)} dB</span>
            </div>
            <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
              <div
                className={`h-full ${getLevelColor(currentLevel)} transition-all duration-100`}
                style={{ width: `${Math.max(0, (currentLevel + 60) * 100 / 60)}%` }}
              />
            </div>
            <div className="flex justify-between text-[10px] text-zinc-600 mt-1">
              <span>-60</span>
              <span>-40</span>
              <span>-20</span>
              <span>0 dB</span>
            </div>
          </div>

          {/* Enable toggle */}
          <div className="px-4 py-3 border-b border-zinc-800">
            <label className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Zap size={14} className="text-zinc-500" />
                <span className="text-sm">Enable Normalization</span>
              </div>
              <button
                onClick={() => updateSettings({ enabled: !settings.enabled })}
                className={`w-10 h-5 rounded-full transition ${
                  settings.enabled ? 'bg-[var(--primary)]' : 'bg-zinc-700'
                }`}
              >
                <div className={`w-4 h-4 rounded-full bg-white transform transition ${
                  settings.enabled ? 'translate-x-5' : 'translate-x-0.5'
                }`} />
              </button>
            </label>
          </div>

          {/* Settings */}
          <div className="p-4 space-y-4">
            {/* Presets */}
            <div>
              <div className="text-xs text-zinc-500 mb-2">Presets</div>
              <div className="flex flex-wrap gap-1">
                {presets.map(preset => (
                  <button
                    key={preset.name}
                    onClick={() => setSettings(preset.settings)}
                    className="px-2 py-1 rounded text-xs bg-zinc-800 hover:bg-zinc-700 transition"
                  >
                    {preset.name}
                  </button>
                ))}
              </div>
            </div>

            {/* Target loudness */}
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-zinc-500">Target Loudness</span>
                <span className="text-zinc-400">{settings.targetLoudness} LUFS</span>
              </div>
              <input
                type="range"
                min={-24}
                max={-14}
                step={1}
                value={settings.targetLoudness}
                onChange={(e) => updateSettings({ targetLoudness: parseInt(e.target.value) })}
                className="w-full accent-[var(--primary)]"
                aria-label="Target Loudness"
                aria-valuemin={-24}
                aria-valuemax={-14}
                aria-valuenow={settings.targetLoudness}
              />
            </div>

            {/* Max peak */}
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-zinc-500">Peak Limit</span>
                <span className="text-zinc-400">{settings.maxPeak} dB</span>
              </div>
              <input
                type="range"
                min={-6}
                max={0}
                step={0.5}
                value={settings.maxPeak}
                onChange={(e) => updateSettings({ maxPeak: parseFloat(e.target.value) })}
                className="w-full accent-[var(--primary)]"
                aria-label="Peak Limit"
                aria-valuemin={-6}
                aria-valuemax={0}
                aria-valuenow={settings.maxPeak}
              />
            </div>

            {/* Compressor */}
            <div className="space-y-2">
              <label className="flex items-center justify-between">
                <span className="text-sm">Compressor</span>
                <button
                  onClick={() => updateSettings({ compressorEnabled: !settings.compressorEnabled })}
                  className={`w-8 h-4 rounded-full transition ${
                    settings.compressorEnabled ? 'bg-[var(--primary)]' : 'bg-zinc-700'
                  }`}
                >
                  <div className={`w-3 h-3 rounded-full bg-white transform transition ${
                    settings.compressorEnabled ? 'translate-x-4' : 'translate-x-0.5'
                  }`} />
                </button>
              </label>

              {settings.compressorEnabled && (
                <div className="pl-4 space-y-2">
                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-zinc-500">Threshold</span>
                      <span className="text-zinc-400">{settings.compressorThreshold} dB</span>
                    </div>
                    <input
                      type="range"
                      min={-40}
                      max={0}
                      step={1}
                      value={settings.compressorThreshold}
                      onChange={(e) => updateSettings({ compressorThreshold: parseInt(e.target.value) })}
                      className="w-full accent-[var(--primary)] h-1"
                      aria-label="Compressor Threshold"
                      aria-valuemin={-40}
                      aria-valuemax={0}
                      aria-valuenow={settings.compressorThreshold}
                    />
                  </div>
                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-zinc-500">Ratio</span>
                      <span className="text-zinc-400">{settings.compressorRatio}:1</span>
                    </div>
                    <input
                      type="range"
                      min={1}
                      max={20}
                      step={1}
                      value={settings.compressorRatio}
                      onChange={(e) => updateSettings({ compressorRatio: parseInt(e.target.value) })}
                      className="w-full accent-[var(--primary)] h-1"
                      aria-label="Compressor Ratio"
                      aria-valuemin={1}
                      aria-valuemax={20}
                      aria-valuenow={settings.compressorRatio}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Night mode */}
            <div className="pt-2 border-t border-zinc-800">
              <label className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Moon size={14} className="text-zinc-500" />
                  <span className="text-sm">Night Mode</span>
                </div>
                <button
                  onClick={() => updateSettings({ nightMode: !settings.nightMode })}
                  className={`w-8 h-4 rounded-full transition ${
                    settings.nightMode ? 'bg-[var(--primary)]' : 'bg-zinc-700'
                  }`}
                >
                  <div className={`w-3 h-3 rounded-full bg-white transform transition ${
                    settings.nightMode ? 'translate-x-4' : 'translate-x-0.5'
                  }`} />
                </button>
              </label>
              {settings.nightMode && (
                <div className="mt-2">
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-zinc-500">Volume Reduction</span>
                    <span className="text-zinc-400">{settings.nightModeReduction} dB</span>
                  </div>
                  <input
                    type="range"
                    min={-20}
                    max={0}
                    step={1}
                    value={settings.nightModeReduction}
                    onChange={(e) => updateSettings({ nightModeReduction: parseInt(e.target.value) })}
                    className="w-full accent-[var(--primary)]"
                    aria-label="Night Mode Volume Reduction"
                    aria-valuemin={-20}
                    aria-valuemax={0}
                    aria-valuenow={settings.nightModeReduction}
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// Compact volume control with normalization indicator
export function VolumeControl({
  volume,
  muted,
  normalized,
  onVolumeChange,
  onMuteToggle,
  className = ''
}: {
  volume: number
  muted: boolean
  normalized?: boolean
  onVolumeChange: (volume: number) => void
  onMuteToggle: () => void
  className?: string
}) {
  const [showSlider, setShowSlider] = useState(false)

  const VolumeIcon = muted || volume === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2

  return (
    <div
      className={`flex items-center gap-2 ${className}`}
      onMouseEnter={() => setShowSlider(true)}
      onMouseLeave={() => setShowSlider(false)}
    >
      <button
        onClick={onMuteToggle}
        className="p-2 rounded-lg hover:bg-zinc-800 transition"
      >
        <VolumeIcon size={18} />
      </button>

      <div className={`flex items-center gap-2 transition-all overflow-hidden ${
        showSlider ? 'w-24 opacity-100' : 'w-0 opacity-0'
      }`}>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={muted ? 0 : volume}
          onChange={(e) => onVolumeChange(parseFloat(e.target.value))}
          className="w-full accent-[var(--primary)]"
          aria-label="Volume"
          aria-valuemin={0}
          aria-valuemax={1}
          aria-valuenow={muted ? 0 : volume}
        />
      </div>

      {normalized && (
        <div className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-[var(--primary)]/20">
          <Zap size={10} className="text-[var(--primary)]" />
          <span className="text-[10px] text-[var(--primary)]">Norm</span>
        </div>
      )}
    </div>
  )
}

export default VolumeNormalizer
