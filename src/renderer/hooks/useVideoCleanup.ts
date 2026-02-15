// File: src/renderer/hooks/useVideoCleanup.ts
// Proper video element cleanup to prevent memory leaks and decoder exhaustion

import { RefObject, useEffect, useRef, useCallback } from 'react'

/**
 * Hook for properly cleaning up video elements
 * Ensures video decoders are released when component unmounts
 */
export function useVideoCleanup(videoRef: RefObject<HTMLVideoElement>) {
  useEffect(() => {
    return () => {
      const video = videoRef.current
      if (video) {
        cleanupVideo(video)
      }
    }
  }, [videoRef])
}

/**
 * Clean up a video element to release decoder resources
 */
export function cleanupVideo(video: HTMLVideoElement) {
  try {
    // Pause playback
    video.pause()

    // Remove all event listeners by cloning (aggressive cleanup)
    // This helps prevent memory leaks from lingering listeners

    // Clear the source - this is the key to releasing the decoder
    video.removeAttribute('src')
    video.srcObject = null

    // Force the video to release resources
    video.load()

    // Clear any poster as well
    video.removeAttribute('poster')
  } catch (e) {
    console.warn('[VideoCleanup] Error during cleanup:', e)
  }
}

/**
 * Video pool to limit concurrent video decoders
 * Browsers have limits on how many video decoders can be active
 */
const MAX_CONCURRENT_VIDEOS = 12

class VideoDecoderPool {
  private activeVideos: Map<string, HTMLVideoElement> = new Map()
  private waitQueue: Array<{ id: string; resolve: () => void }> = []

  /**
   * Request a slot for a video decoder
   * Returns a release function to call when done
   */
  async acquire(id: string, video: HTMLVideoElement): Promise<() => void> {
    // If already acquired, just return
    if (this.activeVideos.has(id)) {
      return () => this.release(id)
    }

    // If under limit, acquire immediately
    if (this.activeVideos.size < MAX_CONCURRENT_VIDEOS) {
      this.activeVideos.set(id, video)
      return () => this.release(id)
    }

    // Otherwise, wait in queue
    await new Promise<void>((resolve) => {
      this.waitQueue.push({ id, resolve })
    })

    this.activeVideos.set(id, video)
    return () => this.release(id)
  }

  /**
   * Release a video decoder slot
   */
  release(id: string) {
    const video = this.activeVideos.get(id)
    if (video) {
      cleanupVideo(video)
      this.activeVideos.delete(id)
    }

    // Process wait queue
    if (this.waitQueue.length > 0 && this.activeVideos.size < MAX_CONCURRENT_VIDEOS) {
      const next = this.waitQueue.shift()
      if (next) {
        next.resolve()
      }
    }
  }

  /**
   * Get current pool status
   */
  getStatus() {
    return {
      active: this.activeVideos.size,
      waiting: this.waitQueue.length,
      max: MAX_CONCURRENT_VIDEOS,
    }
  }

  /**
   * Force cleanup of all videos (emergency)
   */
  releaseAll() {
    for (const [_id, video] of this.activeVideos) {
      cleanupVideo(video)
    }
    this.activeVideos.clear()
    this.waitQueue = []
  }
}

// Singleton instance
export const videoPool = new VideoDecoderPool()

/**
 * Hook that manages video in the decoder pool
 */
export function useVideoPool(
  id: string,
  videoRef: RefObject<HTMLVideoElement>,
  enabled: boolean = true
) {
  const releaseRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    if (!enabled || !videoRef.current) return

    let mounted = true

    videoPool.acquire(id, videoRef.current).then((release) => {
      if (mounted) {
        releaseRef.current = release
      } else {
        release()
      }
    })

    return () => {
      mounted = false
      if (releaseRef.current) {
        releaseRef.current()
        releaseRef.current = null
      }
    }
  }, [id, enabled, videoRef])

  return useCallback(() => {
    if (releaseRef.current) {
      releaseRef.current()
      releaseRef.current = null
    }
  }, [])
}

export default useVideoCleanup
