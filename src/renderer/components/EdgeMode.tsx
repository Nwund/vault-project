// File: src/renderer/components/EdgeMode.tsx
// Advanced edge mode with timer-based intensity control and guided sessions

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import {
  Flame,
  Timer,
  Pause,
  Play,
  RotateCcw,
  ChevronDown,
  ChevronUp,
  Settings,
  X,
  Zap,
  Moon,
  Sun,
  AlertCircle,
  Bell,
  Heart,
  Sparkles,
  TrendingUp,
  Clock
} from 'lucide-react'
import { formatDuration } from '../utils/formatters'

interface EdgeModePhase {
  id: string
  name: string
  duration: number // seconds
  intensity: 'rest' | 'low' | 'medium' | 'high' | 'peak'
  color: string
  instruction: string
}

interface EdgeModePreset {
  id: string
  name: string
  description: string
  icon: React.ElementType
  phases: EdgeModePhase[]
  totalDuration: number
}

// Preset edge sessions
const EDGE_PRESETS: EdgeModePreset[] = [
  {
    id: 'beginner',
    name: 'Gentle Waves',
    description: 'Perfect for beginners - gradual build-up with rest periods',
    icon: Sun,
    phases: [
      { id: 'warm1', name: 'Warm Up', duration: 60, intensity: 'low', color: 'bg-blue-500', instruction: 'Start slow and relaxed' },
      { id: 'build1', name: 'Build', duration: 120, intensity: 'medium', color: 'bg-green-500', instruction: 'Increase pace gradually' },
      { id: 'rest1', name: 'Cool Down', duration: 30, intensity: 'rest', color: 'bg-zinc-500', instruction: 'Take a break, hands off' },
      { id: 'build2', name: 'Build Again', duration: 120, intensity: 'medium', color: 'bg-green-500', instruction: 'Resume at medium pace' },
      { id: 'peak1', name: 'Edge', duration: 60, intensity: 'high', color: 'bg-orange-500', instruction: 'Get close, then slow down' },
      { id: 'rest2', name: 'Rest', duration: 30, intensity: 'rest', color: 'bg-zinc-500', instruction: 'Cool down completely' },
      { id: 'finish', name: 'Finish', duration: 60, intensity: 'peak', color: 'bg-red-500', instruction: 'Go for it!' }
    ],
    totalDuration: 480
  },
  {
    id: 'intermediate',
    name: 'Rising Storm',
    description: 'Multiple peaks with shorter rests - builds stamina',
    icon: TrendingUp,
    phases: [
      { id: 'warm', name: 'Warm Up', duration: 90, intensity: 'low', color: 'bg-blue-500', instruction: 'Get comfortable' },
      { id: 'build1', name: 'First Wave', duration: 150, intensity: 'medium', color: 'bg-green-500', instruction: 'Build momentum' },
      { id: 'edge1', name: 'Edge 1', duration: 60, intensity: 'high', color: 'bg-orange-500', instruction: 'Get to the edge, hold it' },
      { id: 'rest1', name: 'Brief Rest', duration: 20, intensity: 'rest', color: 'bg-zinc-500', instruction: 'Quick cool down' },
      { id: 'build2', name: 'Second Wave', duration: 120, intensity: 'medium', color: 'bg-green-500', instruction: 'Build again' },
      { id: 'edge2', name: 'Edge 2', duration: 60, intensity: 'high', color: 'bg-orange-500', instruction: 'Edge harder this time' },
      { id: 'rest2', name: 'Brief Rest', duration: 20, intensity: 'rest', color: 'bg-zinc-500', instruction: 'Another quick break' },
      { id: 'build3', name: 'Third Wave', duration: 90, intensity: 'medium', color: 'bg-green-500', instruction: 'Final build-up' },
      { id: 'edge3', name: 'Edge 3', duration: 45, intensity: 'high', color: 'bg-orange-500', instruction: 'One more edge' },
      { id: 'peak', name: 'Release', duration: 45, intensity: 'peak', color: 'bg-red-500', instruction: 'Let go!' }
    ],
    totalDuration: 700
  },
  {
    id: 'marathon',
    name: 'Endurance Test',
    description: 'Extended session with many edges - for experienced users',
    icon: Flame,
    phases: [
      { id: 'warm', name: 'Slow Start', duration: 120, intensity: 'low', color: 'bg-blue-500', instruction: 'Begin very slowly' },
      { id: 'cruise1', name: 'Cruise', duration: 180, intensity: 'medium', color: 'bg-green-500', instruction: 'Find your rhythm' },
      { id: 'edge1', name: 'Edge 1', duration: 90, intensity: 'high', color: 'bg-orange-500', instruction: 'First edge' },
      { id: 'deny1', name: 'Denial', duration: 45, intensity: 'low', color: 'bg-purple-500', instruction: 'Slow way down' },
      { id: 'cruise2', name: 'Cruise', duration: 150, intensity: 'medium', color: 'bg-green-500', instruction: 'Back to cruising' },
      { id: 'edge2', name: 'Edge 2', duration: 90, intensity: 'high', color: 'bg-orange-500', instruction: 'Second edge' },
      { id: 'deny2', name: 'Denial', duration: 45, intensity: 'low', color: 'bg-purple-500', instruction: 'Pull back again' },
      { id: 'cruise3', name: 'Cruise', duration: 120, intensity: 'medium', color: 'bg-green-500', instruction: 'Keep going' },
      { id: 'edge3', name: 'Edge 3', duration: 90, intensity: 'high', color: 'bg-orange-500', instruction: 'Third edge' },
      { id: 'deny3', name: 'Final Denial', duration: 60, intensity: 'low', color: 'bg-purple-500', instruction: 'Last denial period' },
      { id: 'buildup', name: 'Final Build', duration: 120, intensity: 'high', color: 'bg-orange-500', instruction: 'Build to the end' },
      { id: 'peak', name: 'Climax', duration: 90, intensity: 'peak', color: 'bg-red-500', instruction: 'You earned it!' }
    ],
    totalDuration: 1200
  },
  {
    id: 'quickie',
    name: 'Quick Edge',
    description: 'Short and intense - when you have limited time',
    icon: Zap,
    phases: [
      { id: 'fast', name: 'Fast Start', duration: 60, intensity: 'medium', color: 'bg-green-500', instruction: 'Skip warmup, get going' },
      { id: 'edge1', name: 'Quick Edge', duration: 45, intensity: 'high', color: 'bg-orange-500', instruction: 'Edge fast' },
      { id: 'rest', name: 'Mini Rest', duration: 15, intensity: 'rest', color: 'bg-zinc-500', instruction: 'Tiny break' },
      { id: 'edge2', name: 'Edge Again', duration: 45, intensity: 'high', color: 'bg-orange-500', instruction: 'One more edge' },
      { id: 'finish', name: 'Finish', duration: 45, intensity: 'peak', color: 'bg-red-500', instruction: 'Go!' }
    ],
    totalDuration: 210
  },
  {
    id: 'tease',
    name: 'Tease & Deny',
    description: 'Heavy on denial periods - builds anticipation',
    icon: Moon,
    phases: [
      { id: 'warm', name: 'Warm Up', duration: 90, intensity: 'low', color: 'bg-blue-500', instruction: 'Start gently' },
      { id: 'tease1', name: 'Tease', duration: 60, intensity: 'medium', color: 'bg-pink-500', instruction: 'Just enough to excite' },
      { id: 'deny1', name: 'Deny', duration: 60, intensity: 'rest', color: 'bg-zinc-500', instruction: 'Hands off completely' },
      { id: 'tease2', name: 'Tease More', duration: 90, intensity: 'medium', color: 'bg-pink-500', instruction: 'Edge closer' },
      { id: 'deny2', name: 'Deny Again', duration: 45, intensity: 'rest', color: 'bg-zinc-500', instruction: 'Pull away' },
      { id: 'tease3', name: 'Big Tease', duration: 90, intensity: 'high', color: 'bg-orange-500', instruction: 'Get very close' },
      { id: 'deny3', name: 'Hard Deny', duration: 30, intensity: 'rest', color: 'bg-zinc-500', instruction: 'Total denial' },
      { id: 'release', name: 'Release', duration: 75, intensity: 'peak', color: 'bg-red-500', instruction: 'Finally release!' }
    ],
    totalDuration: 540
  }
]

interface EdgeModeProps {
  onClose?: () => void
  minimal?: boolean
  className?: string
}

export function EdgeMode({ onClose, minimal = false, className = '' }: EdgeModeProps) {
  const [selectedPreset, setSelectedPreset] = useState<EdgeModePreset>(EDGE_PRESETS[0])
  const [isRunning, setIsRunning] = useState(false)
  const [isPaused, setIsPaused] = useState(false)
  const [currentPhaseIndex, setCurrentPhaseIndex] = useState(0)
  const [phaseTimeRemaining, setPhaseTimeRemaining] = useState(0)
  const [totalElapsed, setTotalElapsed] = useState(0)
  const [edgeCount, setEdgeCount] = useState(0)
  const [showSettings, setShowSettings] = useState(false)
  const [soundEnabled, setSoundEnabled] = useState(true)
  const [vibrationEnabled, setVibrationEnabled] = useState(true)
  const [intensityMultiplier, setIntensityMultiplier] = useState(1) // 0.5x to 2x

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  const currentPhase = selectedPreset.phases[currentPhaseIndex]
  const adjustedPhaseDuration = Math.round(currentPhase?.duration * intensityMultiplier) || 0
  const progress = adjustedPhaseDuration > 0 ? ((adjustedPhaseDuration - phaseTimeRemaining) / adjustedPhaseDuration) * 100 : 0
  const totalAdjustedDuration = useMemo(() =>
    selectedPreset.phases.reduce((sum, p) => sum + Math.round(p.duration * intensityMultiplier), 0),
    [selectedPreset, intensityMultiplier]
  )

  // Play sound notification
  const playSound = useCallback((type: 'phase' | 'edge' | 'rest' | 'complete') => {
    if (!soundEnabled) return

    // Different frequencies for different events
    const frequencies: Record<string, number[]> = {
      phase: [440, 550],
      edge: [660, 880],
      rest: [330, 220],
      complete: [523, 659, 784]
    }

    try {
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)()
      const freqs = frequencies[type]

      freqs.forEach((freq, i) => {
        const oscillator = audioContext.createOscillator()
        const gainNode = audioContext.createGain()

        oscillator.connect(gainNode)
        gainNode.connect(audioContext.destination)

        oscillator.frequency.value = freq
        oscillator.type = 'sine'

        gainNode.gain.setValueAtTime(0.3, audioContext.currentTime)
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3)

        oscillator.start(audioContext.currentTime + i * 0.15)
        oscillator.stop(audioContext.currentTime + i * 0.15 + 0.3)
      })
    } catch { /* ignore audio errors */ }
  }, [soundEnabled])

  // Vibration
  const vibrate = useCallback((pattern: number[]) => {
    if (!vibrationEnabled || !navigator.vibrate) return
    navigator.vibrate(pattern)
  }, [vibrationEnabled])

  // Start session
  const startSession = useCallback(() => {
    setIsRunning(true)
    setIsPaused(false)
    setCurrentPhaseIndex(0)
    setPhaseTimeRemaining(Math.round(selectedPreset.phases[0].duration * intensityMultiplier))
    setTotalElapsed(0)
    setEdgeCount(0)
    playSound('phase')
  }, [selectedPreset, intensityMultiplier, playSound])

  // Stop session
  const stopSession = useCallback(() => {
    setIsRunning(false)
    setIsPaused(false)
    setCurrentPhaseIndex(0)
    setPhaseTimeRemaining(0)
    setTotalElapsed(0)
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
    }
  }, [])

  // Toggle pause
  const togglePause = useCallback(() => {
    setIsPaused(prev => !prev)
  }, [])

  // Timer logic
  useEffect(() => {
    if (!isRunning || isPaused) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
      }
      return
    }

    intervalRef.current = setInterval(() => {
      setPhaseTimeRemaining(prev => {
        if (prev <= 1) {
          // Move to next phase
          const nextIndex = currentPhaseIndex + 1

          if (nextIndex >= selectedPreset.phases.length) {
            // Session complete
            playSound('complete')
            vibrate([200, 100, 200, 100, 400])
            stopSession()
            return 0
          }

          const nextPhase = selectedPreset.phases[nextIndex]
          setCurrentPhaseIndex(nextIndex)

          // Track edges
          if (nextPhase.intensity === 'high' || nextPhase.intensity === 'peak') {
            setEdgeCount(c => c + 1)
            playSound('edge')
            vibrate([100, 50, 100])
          } else if (nextPhase.intensity === 'rest') {
            playSound('rest')
            vibrate([200])
          } else {
            playSound('phase')
          }

          return Math.round(nextPhase.duration * intensityMultiplier)
        }
        return prev - 1
      })

      setTotalElapsed(prev => prev + 1)
    }, 1000)

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
      }
    }
  }, [isRunning, isPaused, currentPhaseIndex, selectedPreset, intensityMultiplier, playSound, vibrate, stopSession])

  // Get intensity color
  const getIntensityColor = (intensity: string) => {
    switch (intensity) {
      case 'rest': return 'from-zinc-600 to-zinc-700'
      case 'low': return 'from-blue-500 to-blue-600'
      case 'medium': return 'from-green-500 to-emerald-600'
      case 'high': return 'from-orange-500 to-red-500'
      case 'peak': return 'from-red-500 to-pink-600'
      default: return 'from-zinc-500 to-zinc-600'
    }
  }

  // Get intensity icon
  const getIntensityIcon = (intensity: string) => {
    switch (intensity) {
      case 'rest': return Moon
      case 'low': return Sun
      case 'medium': return TrendingUp
      case 'high': return Flame
      case 'peak': return Zap
      default: return AlertCircle
    }
  }

  // Minimal view - just the timer
  if (minimal && isRunning) {
    const IntensityIcon = getIntensityIcon(currentPhase?.intensity || 'low')

    return (
      <div
        className={`flex items-center gap-3 px-4 py-2 rounded-xl bg-gradient-to-r ${getIntensityColor(currentPhase?.intensity || 'low')} ${className}`}
      >
        <IntensityIcon size={18} className="animate-pulse" />
        <div className="flex-1">
          <div className="text-sm font-bold">{currentPhase?.name}</div>
          <div className="text-xs opacity-80">{formatDuration(phaseTimeRemaining)}</div>
        </div>
        <button onClick={togglePause} className="p-1">
          {isPaused ? <Play size={16} /> : <Pause size={16} />}
        </button>
      </div>
    )
  }

  return (
    <div className={`bg-zinc-900/95 backdrop-blur-xl rounded-2xl border border-zinc-700 shadow-2xl overflow-hidden ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-red-500 to-pink-600 flex items-center justify-center">
            <Flame size={20} className="text-white" />
          </div>
          <div>
            <h2 className="font-semibold">Edge Mode</h2>
            <p className="text-xs text-zinc-400">Guided intensity sessions</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowSettings(prev => !prev)}
            className="p-2 rounded-lg hover:bg-zinc-800 transition"
          >
            <Settings size={16} className="text-zinc-400" />
          </button>
          {onClose && (
            <button onClick={onClose} className="p-2 rounded-lg hover:bg-zinc-800 transition">
              <X size={16} />
            </button>
          )}
        </div>
      </div>

      {/* Settings panel */}
      {showSettings && (
        <div className="px-5 py-4 bg-zinc-800/50 border-b border-zinc-800 space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-sm text-zinc-400">Sound notifications</label>
            <button
              onClick={() => setSoundEnabled(prev => !prev)}
              className={`w-10 h-6 rounded-full transition ${soundEnabled ? 'bg-[var(--primary)]' : 'bg-zinc-700'}`}
            >
              <div className={`w-4 h-4 rounded-full bg-white transform transition ${soundEnabled ? 'translate-x-5' : 'translate-x-1'}`} />
            </button>
          </div>
          <div className="flex items-center justify-between">
            <label className="text-sm text-zinc-400">Vibration (mobile)</label>
            <button
              onClick={() => setVibrationEnabled(prev => !prev)}
              className={`w-10 h-6 rounded-full transition ${vibrationEnabled ? 'bg-[var(--primary)]' : 'bg-zinc-700'}`}
            >
              <div className={`w-4 h-4 rounded-full bg-white transform transition ${vibrationEnabled ? 'translate-x-5' : 'translate-x-1'}`} />
            </button>
          </div>
          <div className="flex items-center justify-between">
            <label className="text-sm text-zinc-400">
              Duration multiplier: {intensityMultiplier}x
            </label>
            <input
              type="range"
              min={0.5}
              max={2}
              step={0.25}
              value={intensityMultiplier}
              onChange={(e) => setIntensityMultiplier(parseFloat(e.target.value))}
              className="w-24 accent-[var(--primary)]"
            />
          </div>
        </div>
      )}

      {/* Preset selection (when not running) */}
      {!isRunning && (
        <div className="p-5 space-y-4">
          <div className="text-sm text-zinc-400 font-medium">Choose a session</div>
          <div className="space-y-2">
            {EDGE_PRESETS.map(preset => {
              const PresetIcon = preset.icon
              const isSelected = selectedPreset.id === preset.id

              return (
                <button
                  key={preset.id}
                  onClick={() => setSelectedPreset(preset)}
                  className={`w-full flex items-center gap-3 p-4 rounded-xl transition text-left ${
                    isSelected
                      ? 'bg-[var(--primary)]/20 border-2 border-[var(--primary)]'
                      : 'bg-zinc-800/50 border-2 border-transparent hover:bg-zinc-800'
                  }`}
                >
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                    isSelected ? 'bg-[var(--primary)]' : 'bg-zinc-700'
                  }`}>
                    <PresetIcon size={20} className="text-white" />
                  </div>
                  <div className="flex-1">
                    <div className="font-medium">{preset.name}</div>
                    <div className="text-xs text-zinc-500">{preset.description}</div>
                    <div className="text-xs text-zinc-400 mt-1">
                      {formatDuration(Math.round(preset.totalDuration * intensityMultiplier))} • {preset.phases.length} phases
                    </div>
                  </div>
                </button>
              )
            })}
          </div>

          <button
            onClick={startSession}
            className="w-full py-4 bg-gradient-to-r from-red-500 to-pink-600 rounded-xl font-bold text-lg hover:from-red-400 hover:to-pink-500 transition"
          >
            Start Session
          </button>
        </div>
      )}

      {/* Active session */}
      {isRunning && currentPhase && (
        <div className="p-5 space-y-6">
          {/* Current phase display */}
          <div className={`p-6 rounded-2xl bg-gradient-to-br ${getIntensityColor(currentPhase.intensity)} text-center`}>
            <div className="text-5xl font-mono font-bold mb-2">
              {formatDuration(phaseTimeRemaining)}
            </div>
            <div className="text-xl font-semibold mb-1">{currentPhase.name}</div>
            <div className="text-sm opacity-80">{currentPhase.instruction}</div>
          </div>

          {/* Phase progress bar */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-zinc-400">
              <span>Phase progress</span>
              <span>{Math.round(progress)}%</span>
            </div>
            <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
              <div
                className={`h-full ${currentPhase.color} transition-all duration-1000`}
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>

          {/* Overall progress */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-zinc-400">
              <span>Session progress</span>
              <span>{formatDuration(totalElapsed)} / {formatDuration(totalAdjustedDuration)}</span>
            </div>
            <div className="h-1 bg-zinc-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-[var(--primary)] transition-all duration-1000"
                style={{ width: `${(totalElapsed / totalAdjustedDuration) * 100}%` }}
              />
            </div>
          </div>

          {/* Phase timeline */}
          <div className="space-y-1">
            <div className="text-xs text-zinc-400 font-medium">Phases</div>
            <div className="flex gap-1">
              {selectedPreset.phases.map((phase, i) => (
                <div
                  key={phase.id}
                  className={`flex-1 h-6 rounded ${phase.color} transition ${
                    i < currentPhaseIndex ? 'opacity-50' : i === currentPhaseIndex ? 'ring-2 ring-white' : 'opacity-30'
                  }`}
                  title={phase.name}
                />
              ))}
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-4 text-center">
            <div className="bg-zinc-800/50 rounded-xl p-3">
              <div className="text-2xl font-bold text-[var(--primary)]">{edgeCount}</div>
              <div className="text-xs text-zinc-500">Edges</div>
            </div>
            <div className="bg-zinc-800/50 rounded-xl p-3">
              <div className="text-2xl font-bold">{currentPhaseIndex + 1}/{selectedPreset.phases.length}</div>
              <div className="text-xs text-zinc-500">Phase</div>
            </div>
            <div className="bg-zinc-800/50 rounded-xl p-3">
              <div className="text-2xl font-bold">{formatDuration(totalAdjustedDuration - totalElapsed)}</div>
              <div className="text-xs text-zinc-500">Remaining</div>
            </div>
          </div>

          {/* Controls */}
          <div className="flex items-center justify-center gap-3">
            <button
              onClick={togglePause}
              className={`p-4 rounded-xl transition ${
                isPaused
                  ? 'bg-green-500/20 text-green-400 hover:bg-green-500/30'
                  : 'bg-amber-500/20 text-amber-400 hover:bg-amber-500/30'
              }`}
            >
              {isPaused ? <Play size={24} /> : <Pause size={24} />}
            </button>
            <button
              onClick={stopSession}
              className="p-4 rounded-xl bg-red-500/20 text-red-400 hover:bg-red-500/30 transition"
            >
              <X size={24} />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// Compact edge mode indicator
export function EdgeModeIndicator({
  onClick,
  className = ''
}: {
  onClick?: () => void
  className?: string
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-3 py-2 rounded-lg bg-gradient-to-r from-red-500/20 to-pink-500/20 hover:from-red-500/30 hover:to-pink-500/30 transition ${className}`}
    >
      <Flame size={16} className="text-red-400" />
      <span className="text-sm text-red-300">Edge Mode</span>
    </button>
  )
}

export default EdgeMode
