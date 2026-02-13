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
 * LRU file URL cache with configurable size limit
 * Size can be configured via Settings > Library > Memory Cache Size
 * URLs are just strings so memory footprint is minimal (~200KB for 2000 entries)
 */
let memoryCacheSize = 2000 // Default, will be updated from settings
const fileUrlCache = new Map<string, string>()

// Initialize cache size from settings (called once on app startup)
let cacheInitialized = false
async function initCacheSize(): Promise<void> {
  if (cacheInitialized) return
  cacheInitialized = true
  try {
    const settings = await window.api.settings.get()
    const configuredSize = (settings as any)?.library?.memoryCacheSize
    if (configuredSize && typeof configuredSize === 'number' && configuredSize > 0) {
      memoryCacheSize = configuredSize
      console.log('[Cache] Memory cache size set to:', memoryCacheSize)
    }
  } catch (e) {
    // Use default if settings can't be loaded
  }
}

export async function toFileUrlCached(path: string): Promise<string> {
  // Lazy initialize cache size from settings
  if (!cacheInitialized) {
    void initCacheSize()
  }

  const cached = fileUrlCache.get(path)
  if (cached) {
    // Move to end (most recently used)
    fileUrlCache.delete(path)
    fileUrlCache.set(path, cached)
    return cached
  }

  const url = await window.api.fs.toFileUrl(path)

  // Evict oldest entries if cache is full
  if (fileUrlCache.size >= memoryCacheSize) {
    const firstKey = fileUrlCache.keys().next().value
    if (firstKey) fileUrlCache.delete(firstKey)
  }

  fileUrlCache.set(path, url)
  return url
}

/**
 * Update cache size limit (called when settings change)
 */
export function setCacheSize(size: number): void {
  if (size > 0) {
    memoryCacheSize = size
    // If current cache exceeds new limit, evict oldest entries
    while (fileUrlCache.size > memoryCacheSize) {
      const firstKey = fileUrlCache.keys().next().value
      if (firstKey) fileUrlCache.delete(firstKey)
      else break
    }
  }
}

