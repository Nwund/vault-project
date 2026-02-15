// File: vault-mobile/components/MediaThumbnail.tsx
// Reusable media thumbnail with badges

import { useState, useRef } from 'react'
import { View, TouchableOpacity, StyleSheet, Animated } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { Image } from 'react-native'
import { api } from '@/services/api'

interface MediaThumbnailProps {
  id: string
  type: 'video' | 'image' | 'gif'
  hasThumb: boolean
  durationSec?: number
  progress?: number // 0-1 for watch progress
  isFavorite?: boolean
  size?: 'small' | 'medium' | 'large'
  onPress?: () => void
  onLongPress?: () => void
}

export function MediaThumbnail({
  id,
  type,
  hasThumb,
  durationSec,
  progress,
  isFavorite,
  size = 'medium',
  onPress,
  onLongPress,
}: MediaThumbnailProps) {
  const [loaded, setLoaded] = useState(false)
  const opacity = useRef(new Animated.Value(0)).current

  const dimensions = {
    small: { width: 80, height: 60 },
    medium: { width: 120, height: 90 },
    large: { width: 160, height: 120 },
  }[size]

  const handleLoad = () => {
    setLoaded(true)
    Animated.timing(opacity, {
      toValue: 1,
      duration: 200,
      useNativeDriver: true,
    }).start()
  }

  const formatDuration = (seconds: number) => {
    const hrs = Math.floor(seconds / 3600)
    const mins = Math.floor((seconds % 3600) / 60)
    const secs = Math.floor(seconds % 60)
    if (hrs > 0) {
      return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
    }
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const thumbUrl = hasThumb ? api.getThumbUrl(id) : null

  return (
    <TouchableOpacity
      style={[styles.container, dimensions]}
      onPress={onPress}
      onLongPress={onLongPress}
      activeOpacity={0.8}
      delayLongPress={300}
    >
      {/* Placeholder */}
      {!loaded && (
        <View style={[styles.placeholder, dimensions]}>
          <Ionicons
            name={type === 'video' ? 'videocam' : 'image'}
            size={size === 'small' ? 20 : 28}
            color="#3f3f46"
          />
        </View>
      )}

      {/* Thumbnail */}
      {thumbUrl && (
        <Animated.Image
          source={{ uri: thumbUrl }}
          style={[styles.image, dimensions, { opacity }]}
          resizeMode="cover"
          onLoad={handleLoad}
        />
      )}

      {/* Type indicator */}
      <View style={styles.typeOverlay}>
        {type === 'video' && (
          <View style={styles.playBadge}>
            <Ionicons name="play" size={10} color="#fff" />
          </View>
        )}
        {type === 'gif' && (
          <View style={styles.gifBadge}>
            <Ionicons name="infinite" size={10} color="#fff" />
          </View>
        )}
      </View>

      {/* Duration badge */}
      {type === 'video' && durationSec && (
        <View style={styles.durationBadge}>
          <Ionicons name="time-outline" size={10} color="#fff" style={{ marginRight: 2 }} />
          <Animated.Text style={styles.durationText}>
            {formatDuration(durationSec)}
          </Animated.Text>
        </View>
      )}

      {/* Progress bar */}
      {progress !== undefined && progress > 0 && (
        <View style={styles.progressBar}>
          <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
        </View>
      )}

      {/* Favorite indicator */}
      {isFavorite && (
        <View style={styles.favoriteBadge}>
          <Ionicons name="heart" size={12} color="#ef4444" />
        </View>
      )}
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: '#18181b',
    position: 'relative',
  },
  placeholder: {
    position: 'absolute',
    backgroundColor: '#1f1f23',
    justifyContent: 'center',
    alignItems: 'center',
  },
  image: {
    borderRadius: 10,
  },
  typeOverlay: {
    position: 'absolute',
    top: 6,
    left: 6,
  },
  playBadge: {
    backgroundColor: 'rgba(0,0,0,0.7)',
    borderRadius: 10,
    width: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  gifBadge: {
    backgroundColor: '#a855f7',
    borderRadius: 10,
    width: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  durationBadge: {
    position: 'absolute',
    bottom: 6,
    right: 6,
    backgroundColor: 'rgba(0,0,0,0.85)',
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 2,
    flexDirection: 'row',
    alignItems: 'center',
  },
  durationText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '600',
  },
  progressBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#3b82f6',
  },
  favoriteBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
})
