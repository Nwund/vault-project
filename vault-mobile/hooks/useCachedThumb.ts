// File: vault-mobile/hooks/useCachedThumb.ts
// Hook for loading cached thumbnails

import { useState, useEffect } from 'react'
import { cacheService } from '@/services/cache'

/**
 * Hook that returns a cached thumbnail URI
 * Falls back to remote URL while caching in background
 */
export function useCachedThumb(mediaId: string | null, remoteUrl: string | null): {
  uri: string | null
  isLoading: boolean
  isCached: boolean
} {
  const [uri, setUri] = useState<string | null>(remoteUrl)
  const [isLoading, setIsLoading] = useState(true)
  const [isCached, setIsCached] = useState(false)

  useEffect(() => {
    if (!mediaId || !remoteUrl) {
      setUri(null)
      setIsLoading(false)
      setIsCached(false)
      return
    }

    let cancelled = false

    const loadThumb = async () => {
      setIsLoading(true)

      // First check if we have a cached version
      const cachedPath = await cacheService.getCachedThumbPath(mediaId)

      if (cancelled) return

      if (cachedPath) {
        setUri(cachedPath)
        setIsCached(true)
        setIsLoading(false)
        return
      }

      // Use remote URL immediately while caching in background
      setUri(remoteUrl)
      setIsLoading(false)

      // Cache in background
      const cached = await cacheService.cacheThumb(mediaId, remoteUrl)

      if (cancelled) return

      if (cached) {
        setUri(cached)
        setIsCached(true)
      }
    }

    loadThumb()

    return () => {
      cancelled = true
    }
  }, [mediaId, remoteUrl])

  return { uri, isLoading, isCached }
}
