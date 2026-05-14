// File: src/renderer/hooks/useAnime.ts
//
// Animation utility hook. Migrated from anime.js v4 → GSAP (#75) so
// the bundle only ships ONE animation library. The exported method
// surface stays identical (fadeIn / slideIn / pulse / heartbeat /
// etc.) — every caller keeps working without changes.
//
// GSAP is what the rest of Vault already uses for complex sequences;
// dropping anime.js saves ~25KB gzip on the renderer bundle.

import { useCallback, useRef, useEffect } from 'react'
import { gsap } from 'gsap'

type AnimeTarget = string | Element | Element[] | NodeList | null
type Tween = gsap.core.Tween | gsap.core.Timeline

/** Loose shape for callers — most ignore the return type entirely, but
 *  a few await `.pause()` / `.play()`. GSAP tweens expose both. */
export type Animation = Tween | null

function asGsapTarget(t: AnimeTarget): gsap.TweenTarget | null {
  if (!t) return null
  // NodeList → Array. GSAP accepts both, but Array is friendlier
  // when the list might be empty.
  if (t instanceof NodeList) return Array.from(t)
  return t
}

export function useAnime() {
  const animationsRef = useRef<Tween[]>([])

  // Pause everything on unmount so detached DOM nodes don't keep
  // ticking. GSAP tweens auto-recycle on tween.kill() but pause is
  // enough for the unmount path.
  useEffect(() => {
    return () => {
      animationsRef.current.forEach((anim) => { try { anim.pause() } catch { /* ignore */ } })
      animationsRef.current = []
    }
  }, [])

  /** Generic animate. Params shape mirrors anime.js's loose record so
   *  legacy callers stay compiling. GSAP interprets numeric props
   *  identically; ease strings are translated below. */
  const run = useCallback((target: AnimeTarget, params: any): Animation => {
    const t = asGsapTarget(target)
    if (!t) return null
    const { duration = 400, delay = 0, ease, easing, ...rest } = params ?? {}
    const easeName = translateEase(ease ?? easing)
    const tween = gsap.to(t, {
      ...rest,
      duration: duration / 1000,  // anime.js uses ms; gsap uses seconds
      delay: typeof delay === 'function' ? delay : (delay / 1000),
      ease: easeName,
    })
    animationsRef.current.push(tween)
    return tween
  }, [])

  /** Map anime.js ease tokens to GSAP equivalents. Anything unknown
   *  falls through to the literal string (GSAP returns a no-op tween
   *  rather than throwing on unknown eases). */
  function translateEase(s: any): string {
    if (typeof s !== 'string' || !s) return 'power1.out'
    const map: Record<string, string> = {
      outQuad: 'power1.out',
      inOutQuad: 'power1.inOut',
      outBack: 'back.out(1.4)',
      outBounce: 'bounce.out',
      linear: 'none',
    }
    return map[s] ?? s
  }

  const fadeIn = useCallback((target: AnimeTarget, duration = 400): Animation => {
    const t = asGsapTarget(target)
    if (!t) return null
    const tween = gsap.fromTo(t, { opacity: 0 }, {
      opacity: 1, duration: duration / 1000, ease: 'power1.out',
    })
    animationsRef.current.push(tween)
    return tween
  }, [])

  const fadeOut = useCallback((target: AnimeTarget, duration = 400): Animation => {
    const t = asGsapTarget(target)
    if (!t) return null
    const tween = gsap.to(t, {
      opacity: 0, duration: duration / 1000, ease: 'power1.out',
    })
    animationsRef.current.push(tween)
    return tween
  }, [])

  const slideIn = useCallback((
    target: AnimeTarget,
    direction: 'left' | 'right' | 'up' | 'down' = 'up',
    duration = 500
  ): Animation => {
    const t = asGsapTarget(target)
    if (!t) return null
    const offsets: Record<string, { x: number; y: number }> = {
      left:  { x: -50, y: 0 },
      right: { x:  50, y: 0 },
      up:    { x: 0,   y: 50 },
      down:  { x: 0,   y: -50 },
    }
    const { x, y } = offsets[direction]
    const tween = gsap.fromTo(t, { x, y, opacity: 0 }, {
      x: 0, y: 0, opacity: 1, duration: duration / 1000, ease: 'power1.out',
    })
    animationsRef.current.push(tween)
    return tween
  }, [])

  const scaleIn = useCallback((target: AnimeTarget, duration = 400): Animation => {
    const t = asGsapTarget(target)
    if (!t) return null
    const tween = gsap.fromTo(t, { scale: 0.8, opacity: 0 }, {
      scale: 1, opacity: 1, duration: duration / 1000, ease: 'back.out(1.4)',
    })
    animationsRef.current.push(tween)
    return tween
  }, [])

  const pulse = useCallback((target: AnimeTarget, scale = 1.1): Animation => {
    const t = asGsapTarget(target)
    if (!t) return null
    const tl = gsap.timeline()
    tl.to(t, { scale, duration: 0.2, ease: 'power1.inOut' })
      .to(t, { scale: 1, duration: 0.2, ease: 'power1.inOut' })
    animationsRef.current.push(tl)
    return tl
  }, [])

  const shake = useCallback((target: AnimeTarget, intensity = 10): Animation => {
    const t = asGsapTarget(target)
    if (!t) return null
    const tl = gsap.timeline()
    tl.to(t, { x: -intensity, duration: 0.05 })
      .to(t, { x: intensity, duration: 0.1 })
      .to(t, { x: -intensity, duration: 0.1 })
      .to(t, { x: intensity, duration: 0.1 })
      .to(t, { x: 0, duration: 0.15 })
    animationsRef.current.push(tl)
    return tl
  }, [])

  const bounce = useCallback((target: AnimeTarget, height = 20): Animation => {
    const t = asGsapTarget(target)
    if (!t) return null
    const tl = gsap.timeline()
    tl.to(t, { y: -height, duration: 0.3, ease: 'power2.out' })
      .to(t, { y: 0, duration: 0.3, ease: 'bounce.out' })
    animationsRef.current.push(tl)
    return tl
  }, [])

  const wiggle = useCallback((target: AnimeTarget): Animation => {
    const t = asGsapTarget(target)
    if (!t) return null
    const tl = gsap.timeline()
    tl.to(t, { rotation: -5, duration: 0.08 })
      .to(t, { rotation: 5, duration: 0.08 })
      .to(t, { rotation: -5, duration: 0.08 })
      .to(t, { rotation: 5, duration: 0.08 })
      .to(t, { rotation: 0, duration: 0.08 })
    animationsRef.current.push(tl)
    return tl
  }, [])

  const rubberBand = useCallback((target: AnimeTarget): Animation => {
    const t = asGsapTarget(target)
    if (!t) return null
    const tl = gsap.timeline()
    tl.to(t, { scaleX: 1.25, scaleY: 0.75, duration: 0.1 })
      .to(t, { scaleX: 0.75, scaleY: 1.25, duration: 0.1 })
      .to(t, { scaleX: 1.15, scaleY: 0.85, duration: 0.1 })
      .to(t, { scaleX: 0.95, scaleY: 1.05, duration: 0.1 })
      .to(t, { scaleX: 1, scaleY: 1, duration: 0.4 })
    animationsRef.current.push(tl)
    return tl
  }, [])

  const heartbeat = useCallback((target: AnimeTarget): Animation => {
    const t = asGsapTarget(target)
    if (!t) return null
    const tl = gsap.timeline()
    tl.to(t, { scale: 1.1, duration: 0.15 })
      .to(t, { scale: 1, duration: 0.15 })
      .to(t, { scale: 1.1, duration: 0.15 })
      .to(t, { scale: 1, duration: 0.35, ease: 'power1.inOut' })
    animationsRef.current.push(tl)
    return tl
  }, [])

  const flash = useCallback((target: AnimeTarget, times = 3): Animation => {
    const t = asGsapTarget(target)
    if (!t) return null
    const tl = gsap.timeline()
    for (let i = 0; i < times; i++) {
      tl.to(t, { opacity: 0, duration: 0.15, ease: 'none' })
        .to(t, { opacity: 1, duration: 0.15, ease: 'none' })
    }
    animationsRef.current.push(tl)
    return tl
  }, [])

  /** Stagger any animation across the target list. anime.js's
   *  `stagger(50)` translates to GSAP's `stagger: 0.05`. */
  const staggered = useCallback((
    target: AnimeTarget,
    animationParams: any,
    staggerDelay = 50
  ): Animation => {
    const t = asGsapTarget(target)
    if (!t) return null
    const { duration = 400, delay = 0, ease, easing, ...rest } = animationParams ?? {}
    const tween = gsap.to(t, {
      ...rest,
      duration: duration / 1000,
      delay: delay / 1000,
      ease: translateEase(ease ?? easing),
      stagger: staggerDelay / 1000,
    })
    animationsRef.current.push(tween)
    return tween
  }, [])

  const listEnter = useCallback((target: AnimeTarget, delay = 30): Animation => {
    const t = asGsapTarget(target)
    if (!t) return null
    const tween = gsap.fromTo(t,
      { y: 20, opacity: 0 },
      { y: 0, opacity: 1, duration: 0.4, ease: 'power1.out', stagger: delay / 1000 }
    )
    animationsRef.current.push(tween)
    return tween
  }, [])

  /** Anime.js-style timeline. GSAP timeline has the same chain shape:
   *  tl.to(target, opts).to(target, opts) — so callers that
   *  fluent-chain on the returned object stay working. */
  const timeline = useCallback((defaults?: any) => {
    const tl = gsap.timeline(defaults)
    animationsRef.current.push(tl)
    return tl
  }, [])

  const stopAll = useCallback(() => {
    animationsRef.current.forEach((anim) => { try { anim.pause() } catch { /* ignore */ } })
    animationsRef.current = []
  }, [])

  /** Anime.js's `stagger()` factory. GSAP accepts a numeric stagger
   *  directly, so this just returns the millisecond → second conversion
   *  for legacy callers that import staggerFn explicitly. */
  const staggerFn = (ms: number) => ms / 1000

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
    staggerFn,
    // utils placeholder for legacy callers. GSAP exposes its own utils
    // namespace at `gsap.utils`. Re-export so calls like
    // `utils.random(...)` keep working.
    utils: gsap.utils,
  }
}

export default useAnime
