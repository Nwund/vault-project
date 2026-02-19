// File: src/renderer/components/PlaybackSpeedControl.tsx
// Playback speed controller with presets and custom speed

import React, { useState, useCallback } from 'react'
import { Gauge, ChevronDown, Zap, Minus, Plus, RotateCcw } from 'lucide-react'

interface PlaybackSpeedControlProps {
  speed: number
  onChange: (speed: number) => void
  className?: string
}

const SPEED_PRESETS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3]

export function PlaybackSpeedControl({
  speed,
  onChange,
  className = ''
}: PlaybackSpeedControlProps) {
  const [isOpen, setIsOpen] = useState(false)

  const handlePreset = useCallback((preset: number) => {
    onChange(preset)
    setIsOpen(false)
  }, [onChange])

  const adjustSpeed = useCallback((delta: number) => {
    const newSpeed = Math.max(0.25, Math.min(3, speed + delta))
    onChange(Math.round(newSpeed * 100) / 100)
  }, [speed, onChange])

  const reset = useCallback(() => {
    onChange(1)
  }, [onChange])

  return (
    <div className={`relative ${className}`}>
      <button
        onClick={() => setIsOpen(prev => !prev)}
        className={`flex items-center gap-1.5 px-2 py-1 rounded-lg transition ${
          speed !== 1
            ? 'bg-[var(--primary)]/20 text-[var(--primary)]'
            : 'bg-zinc-800 text-zinc-400 hover:text-white'
        }`}
      >
        <Gauge size={14} />
        <span className="text-sm font-medium">{speed}x</span>
        <ChevronDown size={12} className={`transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          <div className="absolute bottom-full mb-2 left-0 z-50 bg-zinc-900 rounded-xl border border-zinc-700 shadow-xl overflow-hidden w-48">
            {/* Custom speed adjustment */}
            <div className="p-3 border-b border-zinc-800">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-zinc-400">Custom Speed</span>
                <button
                  onClick={reset}
                  className="text-xs text-zinc-500 hover:text-white flex items-center gap-1"
                  title="Reset to 1x"
                >
                  <RotateCcw size={10} />
                  Reset
                </button>
              </div>
              <div className="flex items-center justify-center gap-3">
                <button
                  onClick={() => adjustSpeed(-0.25)}
                  className="p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 transition"
                >
                  <Minus size={14} />
                </button>
                <span className="text-lg font-bold w-14 text-center">{speed}x</span>
                <button
                  onClick={() => adjustSpeed(0.25)}
                  className="p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 transition"
                >
                  <Plus size={14} />
                </button>
              </div>
            </div>

            {/* Presets */}
            <div className="p-2 max-h-48 overflow-y-auto">
              <div className="grid grid-cols-2 gap-1">
                {SPEED_PRESETS.map(preset => (
                  <button
                    key={preset}
                    onClick={() => handlePreset(preset)}
                    className={`py-1.5 px-2 rounded-lg text-sm transition ${
                      speed === preset
                        ? 'bg-[var(--primary)] text-white'
                        : 'bg-zinc-800 text-zinc-400 hover:text-white'
                    }`}
                  >
                    {preset}x
                  </button>
                ))}
              </div>
            </div>

            {/* Quick actions */}
            <div className="p-2 border-t border-zinc-800 flex gap-2">
              <button
                onClick={() => handlePreset(0.5)}
                className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs"
              >
                Slow-mo
              </button>
              <button
                onClick={() => handlePreset(2)}
                className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs"
              >
                <Zap size={12} />
                Fast
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// Inline speed selector
export function SpeedSelector({
  speed,
  onChange,
  className = ''
}: {
  speed: number
  onChange: (speed: number) => void
  className?: string
}) {
  return (
    <div className={`flex items-center gap-1 ${className}`}>
      {[0.5, 1, 1.5, 2].map(preset => (
        <button
          key={preset}
          onClick={() => onChange(preset)}
          className={`px-2 py-1 rounded text-xs transition ${
            speed === preset
              ? 'bg-[var(--primary)] text-white'
              : 'bg-zinc-800 text-zinc-400 hover:text-white'
          }`}
        >
          {preset}x
        </button>
      ))}
    </div>
  )
}

// Mini speed indicator
export function SpeedBadge({
  speed,
  onClick,
  className = ''
}: {
  speed: number
  onClick?: () => void
  className?: string
}) {
  if (speed === 1) return null

  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1 px-1.5 py-0.5 rounded bg-[var(--primary)]/20 text-[var(--primary)] text-xs ${className}`}
    >
      <Gauge size={10} />
      {speed}x
    </button>
  )
}

export default PlaybackSpeedControl
