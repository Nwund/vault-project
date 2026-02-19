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

/**
 * Clear all caches - useful for memory management
 */
export function clearAllCaches(): void {
  fileUrlCache.clear()
  requestIdleCallbackQueue = []
  console.log('[Cache] All caches cleared')
}

/**
 * Get cache statistics
 */
export function getCacheStats(): { urlCacheSize: number; maxCacheSize: number } {
  return {
    urlCacheSize: fileUrlCache.size,
    maxCacheSize: memoryCacheSize
  }
}

/**
 * Request idle callback with fallback for older browsers
 */
const requestIdleCallbackShim =
  typeof requestIdleCallback === 'function'
    ? requestIdleCallback
    : (cb: IdleRequestCallback) => setTimeout(cb, 1)

/**
 * Queue for idle callbacks
 */
let requestIdleCallbackQueue: Array<() => void> = []
let isProcessingIdleQueue = false

/**
 * Schedule work to run during idle periods
 * Good for non-urgent tasks like prefetching, analytics, etc.
 */
export function scheduleIdleTask(task: () => void): void {
  requestIdleCallbackQueue.push(task)

  if (!isProcessingIdleQueue) {
    isProcessingIdleQueue = true
    requestIdleCallbackShim((deadline) => {
      processIdleQueue(deadline)
    })
  }
}

function processIdleQueue(deadline: IdleDeadline): void {
  while (requestIdleCallbackQueue.length > 0 && deadline.timeRemaining() > 0) {
    const task = requestIdleCallbackQueue.shift()
    if (task) {
      try {
        task()
      } catch (e) {
        console.error('[IdleTask] Error:', e)
      }
    }
  }

  if (requestIdleCallbackQueue.length > 0) {
    requestIdleCallbackShim((deadline) => {
      processIdleQueue(deadline)
    })
  } else {
    isProcessingIdleQueue = false
  }
}

/**
 * Prefetch URLs in the background during idle time
 */
export function prefetchUrls(paths: string[]): void {
  paths.forEach(path => {
    scheduleIdleTask(() => {
      toFileUrlCached(path).catch(() => {})
    })
  })
}

/**
 * Use memoized callback that only changes when deps change
 * More stable than useCallback for complex dependencies
 */
export function useStableCallback<T extends (...args: any[]) => any>(
  callback: T,
  deps: React.DependencyList
): T {
  const callbackRef = useRef(callback)
  const depsRef = useRef(deps)

  // Check if deps changed
  const depsChanged =
    depsRef.current.length !== deps.length ||
    depsRef.current.some((dep, i) => dep !== deps[i])

  if (depsChanged) {
    callbackRef.current = callback
    depsRef.current = deps
  }

  return useCallback(
    ((...args: Parameters<T>) => callbackRef.current(...args)) as T,
    []
  )
}

/**
 * Use previous value for comparison
 */
export function usePrevious<T>(value: T): T | undefined {
  const ref = useRef<T>()
  useEffect(() => {
    ref.current = value
  })
  return ref.current
}

/**
 * Measure render performance
 */
export function useRenderMetrics(componentName: string): void {
  const renderCountRef = useRef(0)
  const lastRenderRef = useRef(Date.now())

  useEffect(() => {
    renderCountRef.current++
    const now = Date.now()
    const timeSinceLastRender = now - lastRenderRef.current

    if (process.env.NODE_ENV === 'development' && timeSinceLastRender < 50) {
      console.warn(
        `[RenderMetrics] ${componentName} rendered ${renderCountRef.current} times. ` +
        `Last render was ${timeSinceLastRender}ms ago - possible excessive re-render`
      )
    }

    lastRenderRef.current = now
  })
}

/**
 * Batch multiple state updates into a single render
 */
export function useBatchedState<T extends Record<string, any>>(
  initialState: T
): [T, (updates: Partial<T>) => void] {
  const [state, setState] = useState(initialState)
  const pendingUpdatesRef = useRef<Partial<T>>({})
  const updateScheduledRef = useRef(false)

  const batchUpdate = useCallback((updates: Partial<T>) => {
    pendingUpdatesRef.current = { ...pendingUpdatesRef.current, ...updates }

    if (!updateScheduledRef.current) {
      updateScheduledRef.current = true
      queueMicrotask(() => {
        setState(prev => ({ ...prev, ...pendingUpdatesRef.current }))
        pendingUpdatesRef.current = {}
        updateScheduledRef.current = false
      })
    }
  }, [])

  return [state, batchUpdate]
}

/**
 * Virtualization helper - calculate visible range
 */
export function useVirtualization(
  totalCount: number,
  itemHeight: number,
  containerHeight: number,
  scrollTop: number,
  overscan = 3
): { startIndex: number; endIndex: number; offsetY: number } {
  const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan)
  const visibleCount = Math.ceil(containerHeight / itemHeight)
  const endIndex = Math.min(totalCount - 1, startIndex + visibleCount + overscan * 2)
  const offsetY = startIndex * itemHeight

  return { startIndex, endIndex, offsetY }
}

/**
 * Image preloader for smoother transitions
 */
const preloadedImages = new Set<string>()

export function preloadImage(src: string): Promise<void> {
  if (preloadedImages.has(src)) return Promise.resolve()

  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      preloadedImages.add(src)
      resolve()
    }
    img.onerror = reject
    img.src = src
  })
}

/**
 * Batch preload images during idle time
 */
export function batchPreloadImages(srcs: string[], concurrent = 3): void {
  let index = 0

  const loadNext = () => {
    if (index >= srcs.length) return

    const batch = srcs.slice(index, index + concurrent)
    index += concurrent

    Promise.all(batch.map(src => preloadImage(src).catch(() => {}))).then(() => {
      scheduleIdleTask(loadNext)
    })
  }

  scheduleIdleTask(loadNext)
}

