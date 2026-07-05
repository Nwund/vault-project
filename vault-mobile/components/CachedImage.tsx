// File: vault-mobile/components/CachedImage.tsx
// Image component with automatic caching

import { useState, useEffect, memo } from 'react'
import { Image, ImageStyle, StyleProp, View, ActivityIndicator } from 'react-native'
import { cacheService } from '@/services/cache'

interface CachedImageProps {
  mediaId: string
  remoteUrl: string
  style?: StyleProp<ImageStyle>
  resizeMode?: 'cover' | 'contain' | 'stretch' | 'center'
  showLoading?: boolean
  onLoad?: () => void
  onError?: () => void
}

export const CachedImage = memo(function CachedImage({
  mediaId,
  remoteUrl,
  style,
  resizeMode = 'cover',
  showLoading = false,
  onLoad,
  onError,
}: CachedImageProps) {
  const [uri, setUri] = useState<string>(remoteUrl)
  const [isLoading, setIsLoading] = useState(true)
  const [hasError, setHasError] = useState(false)

  useEffect(() => {
    let cancelled = false

    const loadCached = async () => {
      // Check cache first
      const cachedPath = await cacheService.getCachedThumbPath(mediaId)

      if (cancelled) return

      if (cachedPath) {
        setUri(cachedPath)
      } else {
        // Use remote URL and cache in background
        setUri(remoteUrl)
        cacheService.cacheThumb(mediaId, remoteUrl).then(cached => {
          if (!cancelled && cached) {
            // Update to cached version (will cause re-render but image is now local)
            setUri(cached)
          }
        }).catch(() => {})
      }
    }

    loadCached()

    return () => {
      cancelled = true
    }
  }, [mediaId, remoteUrl])

  const handleLoad = () => {
    setIsLoading(false)
    onLoad?.()
  }

  const handleError = () => {
    setIsLoading(false)
    setHasError(true)
    onError?.()
  }

  if (hasError) {
    return (
      <View style={[style, { backgroundColor: '#27272a', justifyContent: 'center', alignItems: 'center' }]}>
        <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: '#3f3f46' }} />
      </View>
    )
  }

  return (
    <View style={style}>
      <Image
        source={{ uri }}
        style={{ width: '100%', height: '100%' }}
        resizeMode={resizeMode}
        onLoad={handleLoad}
        onError={handleError}
      />
      {showLoading && isLoading && (
        <View style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          justifyContent: 'center',
          alignItems: 'center',
          backgroundColor: '#18181b',
        }}>
          <ActivityIndicator size="small" color="#3b82f6" />
        </View>
      )}
    </View>
  )
})
