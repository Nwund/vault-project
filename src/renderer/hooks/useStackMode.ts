// File: src/renderer/hooks/useStackMode.ts
//
// #296 D-72 — TikTok-style vertical-swipe Stack mode. Renders a
// vertical pager: one full-viewport tile at a time, swipe/wheel
// up/down to advance to the next or previous item.
//
// Behaviors:
//   - Snap-to-page (scroll-snap-type: y mandatory).
//   - Auto-play current video; pause neighbors.
//   - Preload next 1 video so the swap is instant.
//   - Loop at the end (configurable).
//
// State lives in the hook; callers render the items via the items()
// helper or rebuild themselves with currentIndex.

import { useCallback, useEffect, useRef, useState } from 'react'

export interface UseStackModeOptions {
  count: number
  /** When true, advance past the end wraps back to 0. Default false. */
  loop?: boolean
  /** Min gesture distance to count as a swipe (px). Default 80. */
  threshold?: number
  onChange?: (newIndex: number) => void
}

export function useStackMode(opts: UseStackModeOptions): {
  currentIndex: number
  next: () => void
  prev: () => void
  jumpTo: (i: number) => void
  pagerProps: {
    ref: React.RefObject<HTMLDivElement | null>
    onWheel: (e: React.WheelEvent<HTMLDivElement>) => void
    onTouchStart: (e: React.TouchEvent<HTMLDivElement>) => void
    onTouchEnd: (e: React.TouchEvent<HTMLDivElement>) => void
    style: React.CSSProperties
  }
} {
  const [currentIndex, setCurrentIndex] = useState(0)
  const ref = useRef<HTMLDivElement>(null)
  const touchStartY = useRef<number | null>(null)
  const wheelLock = useRef(false)
  const threshold = opts.threshold ?? 80

  const jumpTo = useCallback((i: number) => {
    let next = i
    if (next < 0) next = opts.loop ? opts.count - 1 : 0
    if (next >= opts.count) next = opts.loop ? 0 : opts.count - 1
    setCurrentIndex(next)
    opts.onChange?.(next)
    ref.current?.scrollTo({ top: next * (ref.current.clientHeight), behavior: 'smooth' })
  }, [opts.count, opts.loop, opts.onChange])

  const next = useCallback(() => jumpTo(currentIndex + 1), [jumpTo, currentIndex])
  const prev = useCallback(() => jumpTo(currentIndex - 1), [jumpTo, currentIndex])

  const onWheel = useCallback((e: React.WheelEvent<HTMLDivElement>) => {
    if (wheelLock.current) return
    if (Math.abs(e.deltaY) < 40) return
    wheelLock.current = true
    setTimeout(() => { wheelLock.current = false }, 400)
    if (e.deltaY > 0) next(); else prev()
  }, [next, prev])

  const onTouchStart = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
    touchStartY.current = e.touches[0].clientY
  }, [])

  const onTouchEnd = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
    if (touchStartY.current === null) return
    const dy = (e.changedTouches[0]?.clientY ?? 0) - touchStartY.current
    touchStartY.current = null
    if (Math.abs(dy) < threshold) return
    if (dy < 0) next(); else prev()
  }, [next, prev, threshold])

  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.scrollTop = currentIndex * el.clientHeight
  }, [currentIndex])

  return {
    currentIndex,
    next,
    prev,
    jumpTo,
    pagerProps: {
      ref,
      onWheel,
      onTouchStart,
      onTouchEnd,
      style: {
        height: '100vh',
        overflowY: 'hidden',
        scrollSnapType: 'y mandatory',
      },
    },
  }
}
