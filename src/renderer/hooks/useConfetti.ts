// File: src/renderer/hooks/useConfetti.ts
// Confetti celebration effects using canvas-confetti

import { useCallback, useRef, useEffect } from 'react'
import confetti from 'canvas-confetti'

type ConfettiShape = 'square' | 'circle' | 'star'

interface ConfettiOptions {
  particleCount?: number
  spread?: number
  startVelocity?: number
  decay?: number
  gravity?: number
  colors?: string[]
  shapes?: ConfettiShape[]
  origin?: { x: number; y: number }
  angle?: number
  scalar?: number
  drift?: number
  ticks?: number
}

export function useConfetti() {
  const confettiCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const confettiInstanceRef = useRef<any>(null)

  // Initialize confetti canvas
  useEffect(() => {
    // Create a dedicated canvas for confetti
    const canvas = document.createElement('canvas')
    canvas.style.cssText = `
      position: fixed;
      inset: 0;
      width: 100vw;
      height: 100vh;
      pointer-events: none;
      z-index: 99999;
    `
    document.body.appendChild(canvas)
    confettiCanvasRef.current = canvas

    // Create confetti instance bound to this canvas
    confettiInstanceRef.current = confetti.create(canvas, {
      resize: true,
      useWorker: true
    })

    return () => {
      if (confettiCanvasRef.current) {
        document.body.removeChild(confettiCanvasRef.current)
      }
      confettiInstanceRef.current?.reset()
    }
  }, [])

  // Fire confetti with options
  const fire = useCallback((options?: ConfettiOptions) => {
    if (!confettiInstanceRef.current) return

    confettiInstanceRef.current({
      particleCount: 100,
      spread: 70,
      startVelocity: 30,
      decay: 0.94,
      gravity: 1,
      colors: ['#ff6b6b', '#4ecdc4', '#45b7d1', '#96ceb4', '#ffeaa7', '#dfe6e9'],
      shapes: ['square', 'circle'] as ConfettiShape[],
      origin: { x: 0.5, y: 0.6 },
      ...options
    })
  }, [])

  // Quick burst effect
  const burst = useCallback(() => {
    fire({
      particleCount: 80,
      spread: 100,
      startVelocity: 45,
      origin: { x: 0.5, y: 0.5 }
    })
  }, [fire])

  // Achievement celebration - gold stars
  const achievement = useCallback(() => {
    const defaults = {
      spread: 360,
      ticks: 100,
      gravity: 0.8,
      decay: 0.94,
      startVelocity: 30,
      colors: ['#ffd700', '#ffb700', '#ff9500', '#ffcc00', '#fff700'],
      shapes: ['star'] as ConfettiShape[],
      scalar: 1.2
    }

    // Fire from center
    fire({
      ...defaults,
      particleCount: 40,
      origin: { x: 0.5, y: 0.4 }
    })

    // Fire again with delay
    setTimeout(() => {
      fire({
        ...defaults,
        particleCount: 30,
        origin: { x: 0.5, y: 0.5 }
      })
    }, 150)
  }, [fire])

  // Side cannons celebration
  const celebration = useCallback(() => {
    const duration = 3000
    const end = Date.now() + duration

    const frame = () => {
      // Left side
      fire({
        particleCount: 3,
        angle: 60,
        spread: 55,
        origin: { x: 0, y: 0.65 },
        colors: ['#ff6b6b', '#ec4899', '#f472b6']
      })

      // Right side
      fire({
        particleCount: 3,
        angle: 120,
        spread: 55,
        origin: { x: 1, y: 0.65 },
        colors: ['#4ecdc4', '#06b6d4', '#22d3d3']
      })

      if (Date.now() < end) {
        requestAnimationFrame(frame)
      }
    }

    frame()
  }, [fire])

  // Hearts for romantic moments
  const hearts = useCallback(() => {
    fire({
      particleCount: 60,
      spread: 160,
      startVelocity: 25,
      decay: 0.92,
      gravity: 0.6,
      colors: ['#ff6b6b', '#ff8888', '#ffaaaa', '#ff4444', '#ff0066'],
      shapes: ['circle'] as ConfettiShape[],
      scalar: 1.5,
      origin: { x: 0.5, y: 0.5 }
    })
  }, [fire])

  // Rainbow explosion
  const rainbow = useCallback(() => {
    const colors = [
      '#ff0000', '#ff7f00', '#ffff00', '#00ff00',
      '#0000ff', '#4b0082', '#9400d3'
    ]

    colors.forEach((color, i) => {
      setTimeout(() => {
        fire({
          particleCount: 30,
          spread: 60,
          startVelocity: 30 + i * 5,
          colors: [color],
          origin: { x: 0.5, y: 0.7 }
        })
      }, i * 100)
    })
  }, [fire])

  // Fireworks effect
  const fireworks = useCallback(() => {
    const duration = 2500
    const animationEnd = Date.now() + duration
    const defaults = {
      startVelocity: 30,
      spread: 360,
      ticks: 60,
      gravity: 1.2,
      decay: 0.94,
      colors: ['#ff6b6b', '#ffd700', '#00ff00', '#00bfff', '#ff00ff']
    }

    const randomInRange = (min: number, max: number) =>
      Math.random() * (max - min) + min

    const interval = setInterval(() => {
      const timeLeft = animationEnd - Date.now()

      if (timeLeft <= 0) {
        return clearInterval(interval)
      }

      const particleCount = 50 * (timeLeft / duration)

      // Fire from random positions
      fire({
        ...defaults,
        particleCount,
        origin: { x: randomInRange(0.1, 0.4), y: Math.random() - 0.2 }
      })
      fire({
        ...defaults,
        particleCount,
        origin: { x: randomInRange(0.6, 0.9), y: Math.random() - 0.2 }
      })
    }, 250)

    // Cleanup interval after duration
    setTimeout(() => clearInterval(interval), duration + 500)
  }, [fire])

  // Reset/clear all confetti
  const reset = useCallback(() => {
    confettiInstanceRef.current?.reset()
  }, [])

  return {
    fire,
    burst,
    achievement,
    celebration,
    hearts,
    rainbow,
    fireworks,
    reset
  }
}

export default useConfetti
