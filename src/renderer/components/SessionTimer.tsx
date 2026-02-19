// File: src/renderer/components/SessionTimer.tsx
// Session timer with break reminders and usage tracking

import React, { useState, useEffect, useCallback, useRef } from 'react'
import { Timer, Pause, Play, RotateCcw, Bell, BellOff, X, Coffee, Zap, Moon, Sun } from 'lucide-react'

interface SessionTimerProps {
  onClose?: () => void
  minimal?: boolean
  className?: string
}

interface SessionStats {
  totalTime: number
  breaksTaken: number
  sessionStart: number
  isPaused: boolean
}

export function SessionTimer({ onClose, minimal = false, className = '' }: SessionTimerProps) {
  const [sessionTime, setSessionTime] = useState(0) // seconds
  const [isPaused, setIsPaused] = useState(false)
  const [breakReminders, setBreakReminders] = useState(true)
  const [breakInterval, setBreakInterval] = useState(30) // minutes
  const [lastBreakReminder, setLastBreakReminder] = useState(0)
  const [showBreakPrompt, setShowBreakPrompt] = useState(false)
  const [breaksTaken, setBreaksTaken] = useState(0)
  const [sessionStart] = useState(Date.now())
  const [expanded, setExpanded] = useState(!minimal)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Start timer on mount
  useEffect(() => {
    if (!isPaused) {
      intervalRef.current = setInterval(() => {
        setSessionTime(prev => prev + 1)
      }, 1000)
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
      }
    }
  }, [isPaused])

  // Check for break reminders
  useEffect(() => {
    if (!breakReminders || isPaused) return

    const sessionMinutes = sessionTime / 60
    const timeSinceLastReminder = sessionMinutes - lastBreakReminder

    if (timeSinceLastReminder >= breakInterval) {
      setShowBreakPrompt(true)
      setLastBreakReminder(sessionMinutes)

      // Play notification sound
      try {
        const audio = new Audio('data:audio/wav;base64,UklGRl9vT19XQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YU...')
        audio.volume = 0.3
        audio.play().catch(() => {})
      } catch {}
    }
  }, [sessionTime, breakReminders, breakInterval, lastBreakReminder, isPaused])

  const formatTime = useCallback((seconds: number): string => {
    const hrs = Math.floor(seconds / 3600)
    const mins = Math.floor((seconds % 3600) / 60)
    const secs = seconds % 60

    if (hrs > 0) {
      return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
    }
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }, [])

  const togglePause = useCallback(() => {
    setIsPaused(prev => !prev)
  }, [])

  const resetTimer = useCallback(() => {
    setSessionTime(0)
    setBreaksTaken(0)
    setLastBreakReminder(0)
    setIsPaused(false)
  }, [])

  const takeBreak = useCallback(() => {
    setShowBreakPrompt(false)
    setBreaksTaken(prev => prev + 1)
    setIsPaused(true)
  }, [])

  const skipBreak = useCallback(() => {
    setShowBreakPrompt(false)
  }, [])

  // Get session "energy" based on time
  const getSessionEnergy = useCallback(() => {
    const minutes = sessionTime / 60
    if (minutes < 15) return { icon: Zap, label: 'Fresh', color: 'text-green-400' }
    if (minutes < 30) return { icon: Sun, label: 'Active', color: 'text-yellow-400' }
    if (minutes < 60) return { icon: Coffee, label: 'Warmed Up', color: 'text-orange-400' }
    return { icon: Moon, label: 'Marathon', color: 'text-purple-400' }
  }, [sessionTime])

  const energy = getSessionEnergy()
  const EnergyIcon = energy.icon

  // Minimal floating view
  if (minimal && !expanded) {
    return (
      <div
        className={`fixed bottom-4 right-4 z-50 flex items-center gap-2 px-3 py-2 bg-zinc-900/90 backdrop-blur-sm rounded-full border border-zinc-700 shadow-lg cursor-pointer hover:border-zinc-500 transition ${className}`}
        onClick={() => setExpanded(true)}
      >
        <Timer size={14} className={isPaused ? 'text-zinc-500' : 'text-[var(--primary)]'} />
        <span className={`text-sm font-mono ${isPaused ? 'text-zinc-500' : 'text-white'}`}>
          {formatTime(sessionTime)}
        </span>
        <EnergyIcon size={12} className={energy.color} />
      </div>
    )
  }

  return (
    <>
      {/* Main timer panel */}
      <div className={`bg-zinc-900/95 backdrop-blur-xl rounded-2xl border border-zinc-700 shadow-2xl overflow-hidden ${className}`}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
          <div className="flex items-center gap-2">
            <Timer size={18} className="text-[var(--primary)]" />
            <span className="font-semibold">Session Timer</span>
          </div>
          <div className="flex items-center gap-1">
            {minimal && (
              <button
                onClick={() => setExpanded(false)}
                className="p-1.5 rounded-lg hover:bg-zinc-800 transition text-zinc-400"
                title="Minimize"
              >
                <X size={14} />
              </button>
            )}
            {onClose && (
              <button
                onClick={onClose}
                className="p-1.5 rounded-lg hover:bg-red-500/20 hover:text-red-400 transition"
                title="Close timer"
              >
                <X size={16} />
              </button>
            )}
          </div>
        </div>

        {/* Timer display */}
        <div className="p-6 text-center">
          <div className="mb-4">
            <div className={`text-5xl font-mono font-bold ${isPaused ? 'text-zinc-500' : 'text-white'}`}>
              {formatTime(sessionTime)}
            </div>
            <div className={`flex items-center justify-center gap-2 mt-2 ${energy.color}`}>
              <EnergyIcon size={16} />
              <span className="text-sm">{energy.label}</span>
            </div>
          </div>

          {/* Controls */}
          <div className="flex items-center justify-center gap-3">
            <button
              onClick={togglePause}
              className={`p-3 rounded-xl transition ${
                isPaused
                  ? 'bg-green-500/20 text-green-400 hover:bg-green-500/30'
                  : 'bg-amber-500/20 text-amber-400 hover:bg-amber-500/30'
              }`}
              title={isPaused ? 'Resume' : 'Pause'}
            >
              {isPaused ? <Play size={20} /> : <Pause size={20} />}
            </button>

            <button
              onClick={resetTimer}
              className="p-3 rounded-xl bg-zinc-800 hover:bg-zinc-700 transition"
              title="Reset"
            >
              <RotateCcw size={20} />
            </button>

            <button
              onClick={() => setBreakReminders(prev => !prev)}
              className={`p-3 rounded-xl transition ${
                breakReminders
                  ? 'bg-blue-500/20 text-blue-400'
                  : 'bg-zinc-800 text-zinc-500'
              }`}
              title={breakReminders ? 'Disable break reminders' : 'Enable break reminders'}
            >
              {breakReminders ? <Bell size={20} /> : <BellOff size={20} />}
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="px-4 pb-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-zinc-800/50 rounded-xl p-3 text-center">
              <div className="text-2xl font-bold text-[var(--primary)]">{breaksTaken}</div>
              <div className="text-xs text-zinc-500">Breaks Taken</div>
            </div>
            <div className="bg-zinc-800/50 rounded-xl p-3 text-center">
              <div className="text-2xl font-bold text-white">
                {new Date(sessionStart).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </div>
              <div className="text-xs text-zinc-500">Started At</div>
            </div>
          </div>

          {/* Break interval setting */}
          {breakReminders && (
            <div className="flex items-center justify-between bg-zinc-800/50 rounded-xl p-3">
              <span className="text-sm text-zinc-400">Break reminder every</span>
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min={15}
                  max={60}
                  step={5}
                  value={breakInterval}
                  onChange={(e) => setBreakInterval(parseInt(e.target.value))}
                  className="w-20 accent-[var(--primary)]"
                />
                <span className="text-sm font-medium w-12 text-right">{breakInterval}m</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Break prompt overlay */}
      {showBreakPrompt && (
        <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center">
          <div className="bg-zinc-900 rounded-2xl border border-zinc-700 shadow-2xl p-6 max-w-sm mx-4 text-center">
            <div className="w-16 h-16 rounded-full bg-blue-500/20 flex items-center justify-center mx-auto mb-4">
              <Coffee size={32} className="text-blue-400" />
            </div>
            <h3 className="text-xl font-bold mb-2">Time for a Break!</h3>
            <p className="text-zinc-400 mb-6">
              You've been active for {breakInterval} minutes. Take a moment to stretch, hydrate, or rest your eyes.
            </p>
            <div className="flex gap-3">
              <button
                onClick={takeBreak}
                className="flex-1 py-3 bg-blue-500 hover:bg-blue-400 rounded-xl font-semibold transition"
              >
                Take a Break
              </button>
              <button
                onClick={skipBreak}
                className="flex-1 py-3 bg-zinc-800 hover:bg-zinc-700 rounded-xl transition"
              >
                Skip
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

// Compact inline timer for toolbar
export function SessionTimerInline({ className = '' }: { className?: string }) {
  const [sessionTime, setSessionTime] = useState(0)

  useEffect(() => {
    const interval = setInterval(() => {
      setSessionTime(prev => prev + 1)
    }, 1000)
    return () => clearInterval(interval)
  }, [])

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  return (
    <div className={`flex items-center gap-1.5 text-sm ${className}`}>
      <Timer size={14} className="text-[var(--primary)]" />
      <span className="font-mono text-zinc-400">{formatTime(sessionTime)}</span>
    </div>
  )
}

export default SessionTimer
