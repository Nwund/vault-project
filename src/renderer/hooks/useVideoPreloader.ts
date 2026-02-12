// File: src/renderer/hooks/useVideoPreloader.ts
// Video preloading system for smooth playback in large libraries

import { useRef, useCallback, useEffect } from 'react'

interface PreloadedVideo {
  url: string
  video: HTMLVideoElement
  loadedAt: number
  ready: boolean
}

interface UseVideoPreloaderOptions {
  maxPoolSize?: number        // Max video elements in pool
  preloadAhead?: number       // How many videos to preload ahead
  maxAge?: number             // Max age in ms before evicting
  cleanupInterval?: number    // Interval for cleanup
}

const DEFAULT_OPTIONS: UseVideoPreloaderOptions = {
  maxPoolSize: 8,
  preloadAhead: 3,
  maxAge: 60000,        // 1 minute
  cleanupInterval: 30000 // 30 seconds
}

// Global video pool singleton
class VideoPool {
  private pool: Map<string, PreloadedVideo> = new Map()
  private maxSize: number
  private maxAge: number
  private cleanupTimer: NodeJS.Timeout | null = null

  constructor(maxSize = 8, maxAge = 60000) {
    this.maxSize = maxSize
    this.maxAge = maxAge
  }

  startCleanup(interval: number): void {
    if (this.cleanupTimer) return
    this.cleanupTimer = setInterval(() => this.cleanup(), interval)
  }

  stopCleanup(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer)
      this.cleanupTimer = null
    }
  }

  private cleanup(): void {
    const now = Date.now()
    const toRemove: string[] = []

    for (const [url, entry] of this.pool) {
      if (now - entry.loadedAt > this.maxAge) {
        toRemove.push(url)
      }
    }

    for (const url of toRemove) {
      this.release(url)
    }

    if (toRemove.length > 0) {
      console.log(`[VideoPool] Cleaned up ${toRemove.length} stale entries`)
    }
  }

  has(url: string): boolean {
    return this.pool.has(url)
  }

  get(url: string): HTMLVideoElement | null {
    const entry = this.pool.get(url)
    if (entry?.ready) {
      // Update access time
      entry.loadedAt = Date.now()
      return entry.video
    }
    return null
  }

  isReady(url: string): boolean {
    return this.pool.get(url)?.ready ?? false
  }

  preload(url: string, onReady?: () => void): void {
    if (this.pool.has(url)) {
      const entry = this.pool.get(url)!
      if (entry.ready && onReady) {
        onReady()
      }
      return
    }

    // Evict oldest if at capacity
    if (this.pool.size >= this.maxSize) {
      this.evictOldest()
    }

    const video = document.createElement('video')
    video.preload = 'auto'
    video.muted = true
    video.playsInline = true
    video.crossOrigin = 'anonymous'

    const entry: PreloadedVideo = {
      url,
      video,
      loadedAt: Date.now(),
      ready: false
    }

    const handleCanPlay = () => {
      entry.ready = true
      video.removeEventListener('canplaythrough', handleCanPlay)
      video.removeEventListener('error', handleError)
      onReady?.()
    }

    const handleError = () => {
      video.removeEventListener('canplaythrough', handleCanPlay)
      video.removeEventListener('error', handleError)
      this.pool.delete(url)
    }

    video.addEventListener('canplaythrough', handleCanPlay)
    video.addEventListener('error', handleError)

    this.pool.set(url, entry)
    video.src = url
    video.load()
  }

  release(url: string): void {
    const entry = this.pool.get(url)
    if (entry) {
      entry.video.pause()
      entry.video.src = ''
      entry.video.load()
      this.pool.delete(url)
    }
  }

  private evictOldest(): void {
    let oldest: string | null = null
    let oldestTime = Infinity

    for (const [url, entry] of this.pool) {
      if (entry.loadedAt < oldestTime) {
        oldestTime = entry.loadedAt
        oldest = url
      }
    }

    if (oldest) {
      this.release(oldest)
    }
  }

  clear(): void {
    for (const [url] of this.pool) {
      this.release(url)
    }
  }

  getStats(): { size: number; ready: number } {
    let ready = 0
    for (const entry of this.pool.values()) {
      if (entry.ready) ready++
    }
    return { size: this.pool.size, ready }
  }
}

// Singleton pool instance
let globalPool: VideoPool | null = null

function getPool(maxSize: number, maxAge: number): VideoPool {
  if (!globalPool) {
    globalPool = new VideoPool(maxSize, maxAge)
  }
  return globalPool
}

/**
 * Hook for preloading videos for smooth playback
 */
export function useVideoPreloader(options: UseVideoPreloaderOptions = {}) {
  const opts = { ...DEFAULT_OPTIONS, ...options }
  const poolRef = useRef<VideoPool | null>(null)
  const preloadQueueRef = useRef<string[]>([])

  // Initialize pool
  useEffect(() => {
    poolRef.current = getPool(opts.maxPoolSize!, opts.maxAge!)
    poolRef.current.startCleanup(opts.cleanupInterval!)

    return () => {
      // Don't clear pool on unmount - keep it for reuse
    }
  }, [opts.maxPoolSize, opts.maxAge, opts.cleanupInterval])

  /**
   * Preload a single video
   */
  const preload = useCallback((url: string, onReady?: () => void) => {
    poolRef.current?.preload(url, onReady)
  }, [])

  /**
   * Preload multiple videos (e.g., next items in feed)
   */
  const preloadBatch = useCallback((urls: string[]) => {
    const pool = poolRef.current
    if (!pool) return

    // Only preload what's needed
    const toPreload = urls
      .filter(url => !pool.has(url))
      .slice(0, opts.preloadAhead!)

    for (const url of toPreload) {
      pool.preload(url)
    }
  }, [opts.preloadAhead])

  /**
   * Get a preloaded video element if available
   */
  const getPreloaded = useCallback((url: string): HTMLVideoElement | null => {
    return poolRef.current?.get(url) ?? null
  }, [])

  /**
   * Check if a video is ready
   */
  const isReady = useCallback((url: string): boolean => {
    return poolRef.current?.isReady(url) ?? false
  }, [])

  /**
   * Release a video back to the pool
   */
  const release = useCallback((url: string) => {
    poolRef.current?.release(url)
  }, [])

  /**
   * Preload videos around current index
   */
  const preloadAround = useCallback((
    currentIndex: number,
    urls: string[],
    range = opts.preloadAhead!
  ) => {
    const pool = poolRef.current
    if (!pool) return

    // Preload next and previous items
    const start = Math.max(0, currentIndex - 1)
    const end = Math.min(urls.length, currentIndex + range + 1)
    const toPreload = urls.slice(start, end)

    for (const url of toPreload) {
      if (!pool.has(url)) {
        pool.preload(url)
      }
    }
  }, [opts.preloadAhead])

  /**
   * Get pool statistics
   */
  const getStats = useCallback(() => {
    return poolRef.current?.getStats() ?? { size: 0, ready: 0 }
  }, [])

  return {
    preload,
    preloadBatch,
    preloadAround,
    getPreloaded,
    isReady,
    release,
    getStats
  }
}

/**
 * Hook for using preloaded video in a component
 */
export function usePreloadedVideo(url: string | null) {
  const { preload, getPreloaded, isReady: checkReady } = useVideoPreloader()
  const videoRef = useRef<HTMLVideoElement | null>(null)

  useEffect(() => {
    if (!url) return

    // Try to get preloaded
    const preloaded = getPreloaded(url)
    if (preloaded) {
      videoRef.current = preloaded
      return
    }

    // Start preloading
    preload(url, () => {
      videoRef.current = getPreloaded(url)
    })
  }, [url, preload, getPreloaded])

  return {
    video: videoRef.current,
    isReady: url ? checkReady(url) : false
  }
}
