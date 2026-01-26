// File: src/renderer/hooks/usePerformance.ts
// Performance hooks for optimization

import { useState, useEffect, useRef, useCallback } from 'react'

/**
 * Debounce a value - delays updating until value stops changing
 */
export function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value)

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])

  return debouncedValue
}

/**
 * Throttle a callback - limits execution rate
 */
export function useThrottle<T extends (...args: any[]) => any>(
  callback: T,
  delay: number
): T {
  const lastRun = useRef(Date.now())
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)

  return useCallback(
    ((...args: Parameters<T>) => {
      const now = Date.now()
      const timeSinceLastRun = now - lastRun.current

      if (timeSinceLastRun >= delay) {
        lastRun.current = now
        callback(...args)
      } else {
        if (timeoutRef.current) clearTimeout(timeoutRef.current)
        timeoutRef.current = setTimeout(() => {
          lastRun.current = Date.now()
          callback(...args)
        }, delay - timeSinceLastRun)
      }
    }) as T,
    [callback, delay]
  )
}

/**
 * Lazy load with IntersectionObserver
 */
export function useLazyLoad(
  rootMargin = '100px'
): [React.RefObject<HTMLDivElement>, boolean] {
  const ref = useRef<HTMLDivElement>(null)
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    const element = ref.current
    if (!element) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true)
          observer.disconnect()
        }
      },
      { rootMargin }
    )

    observer.observe(element)
    return () => observer.disconnect()
  }, [rootMargin])

  return [ref, isVisible]
}

/**
 * Hook for video element cleanup
 */
export function useVideoCleanup(videoRef: React.RefObject<HTMLVideoElement>) {
  useEffect(() => {
    return () => {
      const video = videoRef.current
      if (video) {
        video.pause()
        video.src = ''
        video.load() // Release decoder
      }
    }
  }, [])
}

/**
 * Manages limited concurrent video decoders
 */
const activeDecoders = new Set<string>()
const MAX_DECODERS = 6

export function useVideoDecoder(id: string): boolean {
  const [canDecode, setCanDecode] = useState(false)

  useEffect(() => {
    if (activeDecoders.size < MAX_DECODERS) {
      activeDecoders.add(id)
      setCanDecode(true)
    }

    return () => {
      activeDecoders.delete(id)
    }
  }, [id])

  return canDecode
}

/**
 * Memoized file URL cache
 */
const fileUrlCache = new Map<string, string>()

export async function toFileUrlCached(path: string): Promise<string> {
  const cached = fileUrlCache.get(path)
  if (cached) return cached

  const url = await window.api.fs.toFileUrl(path)
  fileUrlCache.set(path, url)
  return url
}

export function clearFileUrlCache() {
  fileUrlCache.clear()
}
