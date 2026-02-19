// File: src/renderer/hooks/useVideoPreloader.ts
// Video preloading system for smooth transitions and instant playback

import { useState, useCallback, useEffect, useRef } from 'react'
import { toFileUrlCached } from './usePerformance'

interface PreloadedVideo {
  id: string
  url: string
  element: HTMLVideoElement
  ready: boolean
  preloadedAt: number
  size?: number
}

interface PreloaderState {
  preloaded: Map<string, PreloadedVideo>
  loading: Set<string>
  maxCacheSize: number // in bytes
  maxItems: number
}

// Global preloader state
let globalState: PreloaderState = {
  preloaded: new Map(),
  loading: new Set(),
  maxCacheSize: 500 * 1024 * 1024, // 500MB default
  maxItems: 10
}

const listeners = new Set<() => void>()

function notifyListeners() {
  listeners.forEach(fn => fn())
}

// Preload a video
export async function preloadVideo(mediaId: string, path: string): Promise<boolean> {
  // Already preloaded or loading
  if (globalState.preloaded.has(mediaId) || globalState.loading.has(mediaId)) {
    return true
  }

  // Check cache limits
  enforceCacheLimits()

  globalState.loading.add(mediaId)
  notifyListeners()

  try {
    const url = await toFileUrlCached(path)

    return new Promise((resolve) => {
      const video = document.createElement('video')
      video.preload = 'auto'
      video.muted = true

      const onCanPlay = () => {
        globalState.loading.delete(mediaId)
        globalState.preloaded.set(mediaId, {
          id: mediaId,
          url,
          element: video,
          ready: true,
          preloadedAt: Date.now()
        })
        notifyListeners()
        resolve(true)
      }

      const onError = () => {
        globalState.loading.delete(mediaId)
        notifyListeners()
        resolve(false)
      }

      video.addEventListener('canplaythrough', onCanPlay, { once: true })
      video.addEventListener('error', onError, { once: true })

      // Timeout for slow loads
      setTimeout(() => {
        if (globalState.loading.has(mediaId)) {
          globalState.loading.delete(mediaId)
          notifyListeners()
          resolve(false)
        }
      }, 30000)

      video.src = url
      video.load()
    })
  } catch {
    globalState.loading.delete(mediaId)
    notifyListeners()
    return false
  }
}

// Preload multiple videos (for queue, adjacent items)
export async function preloadVideos(
  items: Array<{ id: string; path: string }>,
  maxConcurrent = 2
): Promise<number> {
  let loaded = 0
  const queue = [...items]

  const loadNext = async (): Promise<void> => {
    const item = queue.shift()
    if (!item) return

    const success = await preloadVideo(item.id, item.path)
    if (success) loaded++

    if (queue.length > 0) {
      await loadNext()
    }
  }

  // Start concurrent loading
  const workers = Array(Math.min(maxConcurrent, items.length))
    .fill(null)
    .map(() => loadNext())

  await Promise.all(workers)
  return loaded
}

// Get preloaded video if available
export function getPreloadedVideo(mediaId: string): PreloadedVideo | undefined {
  const video = globalState.preloaded.get(mediaId)
  if (video) {
    // Update access time
    video.preloadedAt = Date.now()
  }
  return video
}

// Check if video is preloaded
export function isVideoPreloaded(mediaId: string): boolean {
  return globalState.preloaded.has(mediaId)
}

// Check if video is loading
export function isVideoLoading(mediaId: string): boolean {
  return globalState.loading.has(mediaId)
}

// Remove preloaded video
export function removePreloadedVideo(mediaId: string): void {
  const video = globalState.preloaded.get(mediaId)
  if (video) {
    video.element.src = ''
    video.element.load()
    globalState.preloaded.delete(mediaId)
    notifyListeners()
  }
}

// Clear all preloaded videos
export function clearPreloadCache(): void {
  for (const video of globalState.preloaded.values()) {
    video.element.src = ''
    video.element.load()
  }
  globalState.preloaded.clear()
  notifyListeners()
}

// Enforce cache limits
function enforceCacheLimits(): void {
  // Remove oldest items if exceeding max count
  while (globalState.preloaded.size >= globalState.maxItems) {
    let oldest: string | null = null
    let oldestTime = Infinity

    for (const [id, video] of globalState.preloaded) {
      if (video.preloadedAt < oldestTime) {
        oldestTime = video.preloadedAt
        oldest = id
      }
    }

    if (oldest) {
      removePreloadedVideo(oldest)
    } else {
      break
    }
  }
}

// Configure cache settings
export function configurePreloader(options: {
  maxCacheSize?: number
  maxItems?: number
}): void {
  if (options.maxCacheSize !== undefined) {
    globalState.maxCacheSize = options.maxCacheSize
  }
  if (options.maxItems !== undefined) {
    globalState.maxItems = options.maxItems
  }
  enforceCacheLimits()
}

// Get preloader stats
export function getPreloaderStats(): {
  preloadedCount: number
  loadingCount: number
  maxItems: number
  maxCacheSize: number
} {
  return {
    preloadedCount: globalState.preloaded.size,
    loadingCount: globalState.loading.size,
    maxItems: globalState.maxItems,
    maxCacheSize: globalState.maxCacheSize
  }
}

// React hook for preloader state
export function useVideoPreloader() {
  const [, forceUpdate] = useState(0)

  useEffect(() => {
    const listener = () => forceUpdate(n => n + 1)
    listeners.add(listener)
    return () => { listeners.delete(listener) }
  }, [])

  return {
    preloadVideo,
    preloadVideos,
    getPreloadedVideo,
    isVideoPreloaded,
    isVideoLoading,
    removePreloadedVideo,
    clearPreloadCache,
    configurePreloader,
    stats: getPreloaderStats()
  }
}

// Hook for preloading adjacent items in a list
export function useAdjacentPreloader(
  currentIndex: number,
  items: Array<{ id: string; path: string; type: string }>,
  preloadCount = 2
) {
  const preloadedRef = useRef(new Set<string>())

  useEffect(() => {
    if (currentIndex < 0 || items.length === 0) return

    // Get adjacent video items
    const adjacentItems: Array<{ id: string; path: string }> = []

    for (let i = 1; i <= preloadCount; i++) {
      // Next items
      const nextIdx = currentIndex + i
      if (nextIdx < items.length && items[nextIdx].type === 'video') {
        adjacentItems.push(items[nextIdx])
      }

      // Previous items
      const prevIdx = currentIndex - i
      if (prevIdx >= 0 && items[prevIdx].type === 'video') {
        adjacentItems.push(items[prevIdx])
      }
    }

    // Preload items that haven't been preloaded yet
    for (const item of adjacentItems) {
      if (!preloadedRef.current.has(item.id) && !isVideoPreloaded(item.id)) {
        preloadedRef.current.add(item.id)
        preloadVideo(item.id, item.path)
      }
    }
  }, [currentIndex, items, preloadCount])

  return {
    isPreloaded: (id: string) => isVideoPreloaded(id),
    isLoading: (id: string) => isVideoLoading(id),
    preloadNext: () => {
      const nextIdx = currentIndex + 1
      if (nextIdx < items.length && items[nextIdx].type === 'video') {
        preloadVideo(items[nextIdx].id, items[nextIdx].path)
      }
    }
  }
}

// Hook for queue preloading
export function useQueuePreloader(
  queue: Array<{ mediaId: string; type: string }>,
  currentIndex: number,
  getPath: (mediaId: string) => Promise<string>
) {
  const preloadedRef = useRef(new Set<string>())

  useEffect(() => {
    if (queue.length === 0 || currentIndex < 0) return

    const preloadUpcoming = async () => {
      // Preload next 3 videos in queue
      for (let i = 1; i <= 3; i++) {
        const idx = currentIndex + i
        if (idx >= queue.length) break

        const item = queue[idx]
        if (item.type !== 'video') continue
        if (preloadedRef.current.has(item.mediaId)) continue
        if (isVideoPreloaded(item.mediaId)) continue

        try {
          const path = await getPath(item.mediaId)
          preloadedRef.current.add(item.mediaId)
          preloadVideo(item.mediaId, path)
        } catch {}
      }
    }

    preloadUpcoming()
  }, [queue, currentIndex, getPath])
}

export default useVideoPreloader
