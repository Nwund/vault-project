// File: vault-mobile/components/MediaCard.tsx
// Versatile media card component for lists and grids

import { useState, useRef, memo } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Platform,
  Image,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import * as Haptics from 'expo-haptics'
import { api } from '@/services/api'

interface MediaCardProps {
  id: string
  filename: string
  type: 'video' | 'image' | 'gif'
  hasThumb: boolean
  durationSec?: number
  sizeBytes?: number
  progress?: number // Watch progress 0-1
  isFavorite?: boolean
  isDownloaded?: boolean
  variant?: 'grid' | 'list' | 'horizontal'
  onPress?: () => void
  onLongPress?: () => void
}

export const MediaCard = memo(function MediaCard({
  id,
  filename,
  type,
  hasThumb,
  durationSec,
  sizeBytes,
  progress,
  isFavorite,
  isDownloaded,
  variant = 'grid',
  onPress,
  onLongPress,
}: MediaCardProps) {
  const [loaded, setLoaded] = useState(false)
  const opacity = useRef(new Animated.Value(0)).current
  const scale = useRef(new Animated.Value(1)).current

  // Always try to fetch thumbnail - server generates on demand
  const thumbUrl = api.getThumbUrl(id)

  const handleLoad = () => {
    setLoaded(true)
    Animated.timing(opacity, {
      toValue: 1,
      duration: 200,
      useNativeDriver: true,
    }).start()
  }

  const handlePressIn = () => {
    Animated.spring(scale, {
      toValue: 0.96,
      useNativeDriver: true,
    }).start()
  }

  const handlePressOut = () => {
    Animated.spring(scale, {
      toValue: 1,
      useNativeDriver: true,
    }).start()
  }

  const handlePress = () => {
    if (Platform.OS === 'ios') Haptics.selectionAsync()
    onPress?.()
  }

  const handleLongPressAction = () => {
    if (Platform.OS === 'ios') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
    onLongPress?.()
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

  const formatSize = (bytes: number) => {
    const mb = bytes / (1024 * 1024)
    if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`
    return `${mb.toFixed(1)} MB`
  }

  if (variant === 'list') {
    return (
      <Animated.View style={{ transform: [{ scale }] }}>
        <TouchableOpacity
          style={styles.listCard}
          onPress={handlePress}
          onLongPress={handleLongPressAction}
          onPressIn={handlePressIn}
          onPressOut={handlePressOut}
          activeOpacity={0.9}
          delayLongPress={300}
        >
          {/* Thumbnail */}
          <View style={styles.listThumbContainer}>
            {!loaded && (
              <View style={styles.listPlaceholder}>
                <Ionicons
                  name={type === 'video' ? 'videocam' : 'image'}
                  size={24}
                  color="#3f3f46"
                />
              </View>
            )}
            {thumbUrl && (
              <Animated.Image
                source={{ uri: thumbUrl }}
                style={[styles.listThumb, { opacity }]}
                resizeMode="cover"
                onLoad={handleLoad}
              />
            )}
            {type === 'video' && durationSec && (
              <View style={styles.durationBadge}>
                <Text style={styles.durationText}>{formatDuration(durationSec)}</Text>
              </View>
            )}
            {progress !== undefined && progress > 0 && (
              <View style={styles.progressBar}>
                <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
              </View>
            )}
          </View>

          {/* Info */}
          <View style={styles.listInfo}>
            <Text style={styles.listTitle} numberOfLines={2}>
              {filename}
            </Text>
            <View style={styles.listMeta}>
              <Ionicons
                name={type === 'video' ? 'videocam' : type === 'gif' ? 'infinite' : 'image'}
                size={12}
                color="#52525b"
              />
              <Text style={styles.listMetaText}>{type.toUpperCase()}</Text>
              {sizeBytes && (
                <>
                  <Text style={styles.metaDot}>•</Text>
                  <Text style={styles.listMetaText}>{formatSize(sizeBytes)}</Text>
                </>
              )}
            </View>
          </View>

          {/* Badges */}
          <View style={styles.badges}>
            {isFavorite && (
              <View style={styles.favoriteBadge}>
                <Ionicons name="heart" size={14} color="#ef4444" />
              </View>
            )}
            {isDownloaded && (
              <View style={styles.downloadedBadge}>
                <Ionicons name="checkmark-circle" size={14} color="#22c55e" />
              </View>
            )}
          </View>
        </TouchableOpacity>
      </Animated.View>
    )
  }

  if (variant === 'horizontal') {
    return (
      <Animated.View style={{ transform: [{ scale }] }}>
        <TouchableOpacity
          style={styles.horizontalCard}
          onPress={handlePress}
          onLongPress={handleLongPressAction}
          onPressIn={handlePressIn}
          onPressOut={handlePressOut}
          activeOpacity={0.9}
          delayLongPress={300}
        >
          <View style={styles.horizontalThumbContainer}>
            {!loaded && (
              <View style={styles.horizontalPlaceholder}>
                <Ionicons
                  name={type === 'video' ? 'videocam' : 'image'}
                  size={28}
                  color="#3f3f46"
                />
              </View>
            )}
            {thumbUrl && (
              <Animated.Image
                source={{ uri: thumbUrl }}
                style={[styles.horizontalThumb, { opacity }]}
                resizeMode="cover"
                onLoad={handleLoad}
              />
            )}
            {type === 'video' && (
              <View style={styles.playOverlay}>
                <Ionicons name="play" size={24} color="#fff" />
              </View>
            )}
            {progress !== undefined && progress > 0 && (
              <View style={styles.progressBar}>
                <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
              </View>
            )}
          </View>
          <Text style={styles.horizontalFilename} numberOfLines={1}>
            {filename}
          </Text>
        </TouchableOpacity>
      </Animated.View>
    )
  }

  // Grid variant (default)
  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <TouchableOpacity
        style={styles.gridCard}
        onPress={handlePress}
        onLongPress={handleLongPressAction}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        activeOpacity={0.9}
        delayLongPress={300}
      >
        {!loaded && (
          <View style={styles.gridPlaceholder}>
            <Ionicons
              name={type === 'video' ? 'videocam' : 'image'}
              size={28}
              color="#3f3f46"
            />
          </View>
        )}
        {thumbUrl && (
          <Animated.Image
            source={{ uri: thumbUrl }}
            style={[styles.gridThumb, { opacity }]}
            resizeMode="cover"
            onLoad={handleLoad}
          />
        )}

        {/* Type badge */}
        <View style={styles.typeBadge}>
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

        {/* Duration */}
        {type === 'video' && durationSec && (
          <View style={styles.durationBadge}>
            <Text style={styles.durationText}>{formatDuration(durationSec)}</Text>
          </View>
        )}

        {/* Progress */}
        {progress !== undefined && progress > 0 && (
          <View style={styles.progressBar}>
            <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
          </View>
        )}

        {/* Favorite badge */}
        {isFavorite && (
          <View style={styles.gridFavoriteBadge}>
            <Ionicons name="heart" size={12} color="#ef4444" />
          </View>
        )}
      </TouchableOpacity>
    </Animated.View>
  )
})

const styles = StyleSheet.create({
  // Grid styles
  gridCard: {
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: '#18181b',
    aspectRatio: 4 / 3,
  },
  gridPlaceholder: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#1f1f23',
  },
  gridThumb: {
    width: '100%',
    height: '100%',
  },
  typeBadge: {
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
  gridFavoriteBadge: {
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

  // List styles
  listCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#18181b',
    padding: 12,
    borderRadius: 14,
    gap: 12,
  },
  listThumbContainer: {
    width: 80,
    height: 60,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#27272a',
  },
  listPlaceholder: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listThumb: {
    width: '100%',
    height: '100%',
  },
  listInfo: {
    flex: 1,
  },
  listTitle: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
    lineHeight: 18,
  },
  listMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
    gap: 5,
  },
  listMetaText: {
    color: '#52525b',
    fontSize: 12,
  },
  metaDot: {
    color: '#3f3f46',
  },
  badges: {
    flexDirection: 'column',
    gap: 4,
  },
  favoriteBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  downloadedBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(34, 197, 94, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Horizontal styles
  horizontalCard: {
    width: 160,
    backgroundColor: '#18181b',
    borderRadius: 12,
    overflow: 'hidden',
  },
  horizontalThumbContainer: {
    width: '100%',
    height: 100,
    backgroundColor: '#27272a',
  },
  horizontalPlaceholder: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  horizontalThumb: {
    width: '100%',
    height: '100%',
  },
  playOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  horizontalFilename: {
    color: '#a1a1aa',
    fontSize: 12,
    padding: 10,
  },
})
