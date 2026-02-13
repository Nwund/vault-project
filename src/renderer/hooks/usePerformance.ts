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
 * Lazy load with IntersectionObserver - larger margin for earlier preloading
 */
export function useLazyLoad(
  rootMargin = '600px' // Increased for earlier preload
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
      { rootMargin, threshold: 0 }
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
 * LRU file URL cache with size limit
 * Increased to 2000 entries for large libraries (100s of GBs with thousands of files)
 * URLs are just strings so memory footprint is minimal (~200KB for 2000 entries)
 */
const MAX_CACHE_SIZE = 2000
const fileUrlCache = new Map<string, string>()

export async function toFileUrlCached(path: string): Promise<string> {
  const cached = fileUrlCache.get(path)
  if (cached) {
    // Move to end (most recently used)
    fileUrlCache.delete(path)
    fileUrlCache.set(path, cached)
    return cached
  }

  const url = await window.api.fs.toFileUrl(path)

  // Evict oldest entries if cache is full
  if (fileUrlCache.size >= MAX_CACHE_SIZE) {
    const firstKey = fileUrlCache.keys().next().value
    if (firstKey) fileUrlCache.delete(firstKey)
  }

  fileUrlCache.set(path, url)
  return url
}

export function clearFileUrlCache() {
  fileUrlCache.clear()
}

/**
 * Batch preload multiple file URLs
 * Increased batch size to 50 for faster initial loading of large grids
 */
export async function preloadFileUrls(paths: string[]): Promise<void> {
  const uncached = paths.filter(p => !fileUrlCache.has(p))
  // Process in batches of 50 for better performance
  const batchSize = 50
  for (let i = 0; i < Math.min(uncached.length, batchSize); i += 10) {
    await Promise.all(uncached.slice(i, i + 10).map(p => toFileUrlCached(p)))
  }
}

/**
 * Video element pool for reuse
 */
const videoPool: HTMLVideoElement[] = []
const MAX_POOL_SIZE = 8

export function getPooledVideo(): HTMLVideoElement {
  const video = videoPool.pop()
  if (video) {
    video.src = ''
    video.load()
    return video
  }
  return document.createElement('video')
}

export function returnVideoToPool(video: HTMLVideoElement): void {
  if (videoPool.length < MAX_POOL_SIZE) {
    video.pause()
    video.src = ''
    video.load()
    video.removeAttribute('src')
    videoPool.push(video)
  }
}

/**
 * Preload video by creating a hidden video element
 */
export function preloadVideo(url: string): () => void {
  const video = getPooledVideo()
  video.preload = 'metadata'
  video.src = url
  video.load()

  return () => {
    returnVideoToPool(video)
  }
}

/**
 * Request idle callback with fallback
 */
export function requestIdleCallback(callback: () => void, timeout = 100): number {
  if (typeof (globalThis as any).requestIdleCallback === 'function') {
    return (globalThis as any).requestIdleCallback(callback, { timeout })
  }
  return setTimeout(callback, 1) as unknown as number
}

export function cancelIdleCallback(id: number): void {
  if (typeof (globalThis as any).cancelIdleCallback === 'function') {
    (globalThis as any).cancelIdleCallback(id)
  } else {
    clearTimeout(id)
  }
}
