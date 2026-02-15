// File: src/renderer/components/HeatOverlay.tsx
// Visual heat/arousal overlay that intensifies over time

import React, { useEffect, useState } from 'react'

interface HeatOverlayProps {
  level: number // 0-10
  enabled?: boolean
}

export const HeatOverlay: React.FC<HeatOverlayProps> = ({ level, enabled = true }) => {
  if (!enabled || level <= 0) return null

  // Calculate effect intensities based on heat level
  const vignetteIntensity = Math.min(0.4, level * 0.04)
  const warmthIntensity = Math.min(0.08, level * 0.008)
  const glowIntensity = Math.min(0.3, level * 0.03)
  const pulseEnabled = level >= 6
  const particlesEnabled = level >= 8

  return (
    <>
      {/* Vignette - dark edges that focus attention */}
      <div
        className="fixed inset-0 pointer-events-none z-[9990]"
        style={{
          background: `radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,${vignetteIntensity}) 100%)`,
        }}
      />

      {/* Warmth overlay - subtle red/pink tint */}
      <div
        className="fixed inset-0 pointer-events-none z-[9991]"
        style={{
          background: `rgba(255, 50, 80, ${warmthIntensity})`,
          mixBlendMode: 'overlay',
        }}
      />

      {/* Edge glow */}
      <div
        className="fixed inset-0 pointer-events-none z-[9992]"
        style={{
          boxShadow: `inset 0 0 100px rgba(255, 50, 100, ${glowIntensity})`,
        }}
      />

      {/* Pulse overlay at high heat */}
      {pulseEnabled && (
        <div
          className="fixed inset-0 pointer-events-none z-[9993]"
          style={{
            animation: 'heatPulse 2s ease-in-out infinite',
          }}
        />
      )}

      {/* Floating particles at very high heat */}
      {particlesEnabled && <FloatingParticles count={level * 2} />}

      {/* Keyframes */}
      <style>{`
        @keyframes heatPulse {
          0%, 100% {
            box-shadow: inset 0 0 50px rgba(255, 50, 100, 0);
          }
          50% {
            box-shadow: inset 0 0 100px rgba(255, 50, 100, 0.1);
          }
        }
      `}</style>
    </>
  )
}

// Floating particles component
const FloatingParticles: React.FC<{ count: number }> = ({ count }) => {
  const [particles, setParticles] = useState<Array<{
    id: number
    x: number
    y: number
    size: number
    duration: number
    delay: number
  }>>([])

  useEffect(() => {
    const newParticles = Array.from({ length: count }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: 2 + Math.random() * 4,
      duration: 10 + Math.random() * 10,
      delay: Math.random() * 5,
    }))
    setParticles(newParticles)
  }, [count])

  return (
    <div className="fixed inset-0 pointer-events-none z-[9994] overflow-hidden">
      {particles.map((p) => (
        <div
          key={p.id}
          className="absolute rounded-full"
          style={{
            left: `${p.x}%`,
            top: `${p.y}%`,
            width: p.size,
            height: p.size,
            background: 'radial-gradient(circle, rgba(255,107,157,0.6) 0%, transparent 70%)',
            animation: `floatParticle ${p.duration}s ease-in-out infinite`,
            animationDelay: `${p.delay}s`,
          }}
        />
      ))}
      <style>{`
        @keyframes floatParticle {
          0%, 100% {
            transform: translateY(0) translateX(0) scale(1);
            opacity: 0.3;
          }
          25% {
            transform: translateY(-20px) translateX(10px) scale(1.2);
            opacity: 0.6;
          }
          50% {
            transform: translateY(-10px) translateX(-15px) scale(0.8);
            opacity: 0.4;
          }
          75% {
            transform: translateY(-30px) translateX(5px) scale(1.1);
            opacity: 0.5;
          }
        }
      `}</style>
    </div>
  )
}

// Hook to track session duration and calculate heat level
export function useHeatLevel(sessionActive: boolean): number {
  const [startTime, setStartTime] = useState<number | null>(null)
  const [heatLevel, setHeatLevel] = useState(0)

  useEffect(() => {
    if (sessionActive && !startTime) {
      setStartTime(Date.now())
    } else if (!sessionActive) {
      setStartTime(null)
      setHeatLevel(0)
    }
  }, [sessionActive, startTime])

  useEffect(() => {
    if (!startTime) return

    const interval = setInterval(() => {
      const elapsed = (Date.now() - startTime) / 1000 / 60 // minutes
      // Heat builds slowly: reaches level 10 after ~30 minutes
      const newLevel = Math.min(10, elapsed / 3)
      setHeatLevel(newLevel)
    }, 5000) // Update every 5 seconds

    return () => clearInterval(interval)
  }, [startTime])

  return heatLevel
}

// Manual heat level control
export function useManualHeat(initialLevel = 0): [number, (level: number) => void, () => void] {
  const [heatLevel, setHeatLevel] = useState(initialLevel)

  const resetHeat = () => {
    setHeatLevel(0)
  }

  return [heatLevel, setHeatLevel, resetHeat]
}

export default HeatOverlay
