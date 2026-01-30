// File: src/renderer/hooks/useAnime.ts
// Anime.js v4 animation utilities hook

import { useCallback, useRef, useEffect } from 'react'
import { animate, stagger, createTimeline, utils } from 'animejs'

type AnimeTarget = string | Element | Element[] | NodeList | null

export function useAnime() {
  const animationsRef = useRef<ReturnType<typeof animate>[]>([])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      animationsRef.current.forEach(anim => anim.pause())
      animationsRef.current = []
    }
  }, [])

  // Base animate function
  const run = useCallback((target: AnimeTarget, params: Parameters<typeof animate>[1]) => {
    if (!target) return null
    const anim = animate(target, params)
    animationsRef.current.push(anim)
    return anim
  }, [])

  // Fade in
  const fadeIn = useCallback((target: AnimeTarget, duration = 400) => {
    return run(target, {
      opacity: [0, 1],
      duration,
      ease: 'outQuad'
    })
  }, [run])

  // Fade out
  const fadeOut = useCallback((target: AnimeTarget, duration = 400) => {
    return run(target, {
      opacity: [1, 0],
      duration,
      ease: 'outQuad'
    })
  }, [run])

  // Slide in from direction
  const slideIn = useCallback((
    target: AnimeTarget,
    direction: 'left' | 'right' | 'up' | 'down' = 'up',
    duration = 500
  ) => {
    const translations: Record<string, { prop: string; value: number[] }> = {
      left: { prop: 'translateX', value: [-50, 0] },
      right: { prop: 'translateX', value: [50, 0] },
      up: { prop: 'translateY', value: [50, 0] },
      down: { prop: 'translateY', value: [-50, 0] }
    }
    const { prop, value } = translations[direction]

    return run(target, {
      [prop]: value,
      opacity: [0, 1],
      duration,
      ease: 'outQuad'
    })
  }, [run])

  // Scale in
  const scaleIn = useCallback((target: AnimeTarget, duration = 400) => {
    return run(target, {
      scale: [0.8, 1],
      opacity: [0, 1],
      duration,
      ease: 'outBack'
    })
  }, [run])

  // Pulse effect
  const pulse = useCallback((target: AnimeTarget, scale = 1.1) => {
    return run(target, {
      scale: [1, scale, 1],
      duration: 400,
      ease: 'inOutQuad'
    })
  }, [run])

  // Shake effect
  const shake = useCallback((target: AnimeTarget, intensity = 10) => {
    return run(target, {
      translateX: [0, -intensity, intensity, -intensity, intensity, 0],
      duration: 500,
      ease: 'inOutQuad'
    })
  }, [run])

  // Bounce effect
  const bounce = useCallback((target: AnimeTarget, height = 20) => {
    return run(target, {
      translateY: [0, -height, 0],
      duration: 600,
      ease: 'outBounce'
    })
  }, [run])

  // Wiggle/jiggle effect
  const wiggle = useCallback((target: AnimeTarget) => {
    return run(target, {
      rotate: [0, -5, 5, -5, 5, 0],
      duration: 400,
      ease: 'inOutQuad'
    })
  }, [run])

  // Rubber band effect
  const rubberBand = useCallback((target: AnimeTarget) => {
    return run(target, {
      scaleX: [1, 1.25, 0.75, 1.15, 0.95, 1],
      scaleY: [1, 0.75, 1.25, 0.85, 1.05, 1],
      duration: 800,
      ease: 'outQuad'
    })
  }, [run])

  // Heartbeat effect
  const heartbeat = useCallback((target: AnimeTarget) => {
    return run(target, {
      scale: [1, 1.1, 1, 1.1, 1],
      duration: 800,
      ease: 'inOutQuad'
    })
  }, [run])

  // Flash effect
  const flash = useCallback((target: AnimeTarget, times = 3) => {
    return run(target, {
      opacity: Array(times * 2).fill(0).map((_, i) => i % 2 === 0 ? 0 : 1),
      duration: 300 * times,
      ease: 'linear'
    })
  }, [run])

  // Staggered animation
  const staggered = useCallback((
    target: AnimeTarget,
    animationParams: Parameters<typeof animate>[1],
    staggerDelay = 50
  ) => {
    return run(target, {
      ...animationParams,
      delay: stagger(staggerDelay)
    })
  }, [run])

  // List item enter animation (staggered)
  const listEnter = useCallback((target: AnimeTarget, delay = 30) => {
    return run(target, {
      translateY: [20, 0],
      opacity: [0, 1],
      duration: 400,
      delay: stagger(delay),
      ease: 'outQuad'
    })
  }, [run])

  // Timeline helper
  const timeline = useCallback((defaults?: Parameters<typeof createTimeline>[0]) => {
    return createTimeline(defaults)
  }, [])

  // Stop all animations
  const stopAll = useCallback(() => {
    animationsRef.current.forEach(anim => anim.pause())
    animationsRef.current = []
  }, [])

  return {
    animate: run,
    fadeIn,
    fadeOut,
    slideIn,
    scaleIn,
    pulse,
    shake,
    bounce,
    wiggle,
    rubberBand,
    heartbeat,
    flash,
    stagger: staggered,
    listEnter,
    timeline,
    stopAll,
    // Re-export anime utilities
    staggerFn: stagger,
    utils
  }
}

export default useAnime
