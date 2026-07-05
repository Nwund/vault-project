// File: vault-mobile/app/(tabs)/feed.tsx
// TikTok-style vertical swipe video feed

import { useState, useEffect, useCallback, useRef, memo } from 'react'
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  StatusBar,
  ActivityIndicator,
  Platform,
  Animated as RNAnimated,
  ViewToken,
  GestureResponderEvent,
} from 'react-native'
import { Video, ResizeMode, AVPlaybackStatus } from 'expo-av'
import { Ionicons } from '@expo/vector-icons'
import { LinearGradient } from 'expo-linear-gradient'
import * as Haptics from 'expo-haptics'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useIsFocused } from '@react-navigation/native'
import { useConnectionStore } from '@/stores/connection'
import { useFavoritesStore } from '@/stores/favorites'
import { useBrokenMediaStore, isFormatSupported } from '@/stores/broken-media'
import { FeedSkeleton } from '@/components/SkeletonLoader'
import { api } from '@/services/api'

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window')

interface MediaItem {
  id: string
  filename: string
  type: 'video' | 'image' | 'gif'
  durationSec?: number
  hasThumb: boolean
  tags?: string[]
}

// Single video item in the feed
const FeedItem = memo(({
  item,
  isActive,
  isMuted,
  onToggleMute,
  onToggleFavorite,
  isFavorite,
  onDoubleTap,
  onError,
}: {
  item: MediaItem
  isActive: boolean
  isMuted: boolean
  onToggleMute: () => void
  onToggleFavorite: () => void
  isFavorite: boolean
  onDoubleTap: () => void
  onError?: (id: string) => void
}) => {
  const videoRef = useRef<Video>(null)
  const isMountedRef = useRef(true)
  const hasErrorRef = useRef(false) // Ref for immediate error state access in closures
  const [isPlaying, setIsPlaying] = useState(true)
  const [progress, setProgress] = useState(0)
  const [currentPosition, setCurrentPosition] = useState(0)
  const [duration, setDuration] = useState(0)
  const [isBuffering, setIsBuffering] = useState(true)
  const [hasError, setHasError] = useState(false)
  const [seekIndicator, setSeekIndicator] = useState<{ direction: 'left' | 'right'; visible: boolean }>({ direction: 'left', visible: false })

  const heartScale = useRef(new RNAnimated.Value(0)).current
  const seekIndicatorScale = useRef(new RNAnimated.Value(0)).current
  const lastTap = useRef(0)
  const lastTapX = useRef(0)
  const insets = useSafeAreaInsets()

  // Track mounted state to prevent invalid view errors
  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
    }
  }, [])

  // Handle playback based on visibility
  useEffect(() => {
    // Don't try to control video if it has errored out (component unmounted)
    // Check both state and ref to catch immediate errors
    if (videoRef.current && isMountedRef.current && !hasError && !hasErrorRef.current) {
      if (isActive) {
        videoRef.current.playAsync().catch(() => {})
        setIsPlaying(true)
      } else {
        videoRef.current.pauseAsync().catch(() => {})
        setIsPlaying(false)
      }
    }
  }, [isActive, hasError])

  const handlePlaybackStatus = (status: AVPlaybackStatus) => {
    if (!status.isLoaded) {
      if (status.error) {
        console.log('Video playback error:', status.error)
        hasErrorRef.current = true // Set ref immediately for sync access
        setHasError(true)
        onError?.(item.id)
      }
      return
    }
    setIsBuffering(status.isBuffering)
    if (status.durationMillis) {
      setDuration(status.durationMillis)
      setCurrentPosition(status.positionMillis)
      setProgress(status.positionMillis / status.durationMillis)
    }
  }

  const handleVideoError = (error: string) => {
    console.log('Video load error:', error)
    hasErrorRef.current = true // Set ref immediately for sync access
    setHasError(true)
    onError?.(item.id)
  }

  // Seek video by delta seconds
  const seekBy = useCallback(async (deltaSec: number) => {
    // Check both state and ref for immediate error detection
    if (!videoRef.current || !isMountedRef.current || hasErrorRef.current || duration === 0) return
    try {
      const newPosition = Math.max(0, Math.min(duration, currentPosition + deltaSec * 1000))
      await videoRef.current.setPositionAsync(newPosition)
      if (Platform.OS === 'ios') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    } catch {
      // Ignore errors from unmounted component
    }
  }, [duration, currentPosition])

  // Seek to specific position
  const seekTo = useCallback(async (positionMs: number) => {
    // Check both state and ref for immediate error detection
    if (!videoRef.current || !isMountedRef.current || hasErrorRef.current) return
    try {
      const clampedPosition = Math.max(0, Math.min(duration, positionMs))
      await videoRef.current.setPositionAsync(clampedPosition)
    } catch {
      // Ignore errors from unmounted component
    }
  }, [duration])

  // Show seek indicator animation
  const showSeekIndicator = useCallback((direction: 'left' | 'right') => {
    setSeekIndicator({ direction, visible: true })
    RNAnimated.sequence([
      RNAnimated.spring(seekIndicatorScale, {
        toValue: 1,
        useNativeDriver: true,
        friction: 5,
      }),
      RNAnimated.timing(seekIndicatorScale, {
        toValue: 0,
        duration: 200,
        delay: 300,
        useNativeDriver: true,
      }),
    ]).start(() => setSeekIndicator(prev => ({ ...prev, visible: false })))
  }, [])

  // Handle tap with position awareness for double-tap seek
  const handleTap = (evt: GestureResponderEvent) => {
    const now = Date.now()
    const tapX = evt.nativeEvent.pageX

    // Check for double tap
    if (now - lastTap.current < 300 && Math.abs(tapX - lastTapX.current) < 100) {
      // Double tap detected - determine which side
      const screenThird = SCREEN_WIDTH / 3

      if (tapX < screenThird) {
        // Left third - seek back 10 seconds
        seekBy(-10)
        showSeekIndicator('left')
      } else if (tapX > screenThird * 2) {
        // Right third - seek forward 10 seconds
        seekBy(10)
        showSeekIndicator('right')
      } else {
        // Center - like animation
        if (Platform.OS === 'ios') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
        onDoubleTap()
        RNAnimated.sequence([
          RNAnimated.spring(heartScale, {
            toValue: 1,
            useNativeDriver: true,
            friction: 3,
          }),
          RNAnimated.timing(heartScale, {
            toValue: 0,
            duration: 300,
            delay: 500,
            useNativeDriver: true,
          }),
        ]).start()
      }
      lastTap.current = 0
    } else {
      lastTap.current = now
      lastTapX.current = tapX
      // Single tap - toggle play/pause after delay
      setTimeout(() => {
        if (Date.now() - lastTap.current >= 300 && lastTap.current === now) {
          // Don't try to control video if it has errored out (use ref for immediate access in closure)
          if (videoRef.current && isMountedRef.current && !hasErrorRef.current) {
            if (isPlaying) {
              videoRef.current.pauseAsync().catch(() => {})
              setIsPlaying(false)
            } else {
              videoRef.current.playAsync().catch(() => {})
              setIsPlaying(true)
            }
          }
        }
      }, 300)
    }
  }

  // Handle progress bar scrubbing
  const handleProgressBarTouch = useCallback((evt: GestureResponderEvent) => {
    const touchX = evt.nativeEvent.locationX
    const barWidth = SCREEN_WIDTH - 32 // Account for padding
    const percent = Math.max(0, Math.min(1, touchX / barWidth))
    const newPosition = percent * duration

    setProgress(percent)
    seekTo(newPosition)
    if (Platform.OS === 'ios') Haptics.selectionAsync()
  }, [duration, seekTo])

  const formatDuration = (ms: number) => {
    const totalSec = Math.floor(ms / 1000)
    const min = Math.floor(totalSec / 60)
    const sec = totalSec % 60
    return `${min}:${sec.toString().padStart(2, '0')}`
  }

  return (
    <View style={styles.feedItem}>
      <TouchableOpacity
        activeOpacity={1}
        style={StyleSheet.absoluteFill}
        onPress={handleTap}
      >
        {!hasError && (
          <Video
            ref={videoRef}
            source={{ uri: api.getStreamUrl(item.id) }}
            style={styles.video}
            resizeMode={ResizeMode.CONTAIN}
            shouldPlay={isActive}
            isLooping
            isMuted={isMuted}
            onPlaybackStatusUpdate={handlePlaybackStatus}
            onError={(err) => handleVideoError(String(err))}
            posterSource={{ uri: api.getThumbUrl(item.id) }}
            usePoster
            posterStyle={styles.poster}
          />
        )}

        {/* Error state */}
        {hasError && (
          <View style={styles.errorContainer}>
            <Ionicons name="warning" size={48} color="#f59e0b" />
            <Text style={styles.errorTitle}>Cannot Play</Text>
            <Text style={styles.errorSubtitle}>This video format is not supported</Text>
          </View>
        )}

        {/* Buffering indicator */}
        {isBuffering && isActive && (
          <View style={styles.bufferingContainer}>
            <ActivityIndicator size="large" color="#fff" />
          </View>
        )}

        {/* Pause icon */}
        {!isPlaying && !isBuffering && (
          <View style={styles.pauseOverlay}>
            <View style={styles.pauseIcon}>
              <Ionicons name="play" size={60} color="#fff" />
            </View>
          </View>
        )}
      </TouchableOpacity>

      {/* Double-tap heart animation */}
      <RNAnimated.View
        style={[
          styles.heartAnimation,
          {
            transform: [{ scale: heartScale }],
            opacity: heartScale,
          },
        ]}
        pointerEvents="none"
      >
        <Ionicons name="heart" size={100} color="#ef4444" />
      </RNAnimated.View>

      {/* Seek indicator - left side (-10s) */}
      {seekIndicator.visible && seekIndicator.direction === 'left' && (
        <RNAnimated.View
          style={[
            styles.seekIndicator,
            styles.seekIndicatorLeft,
            { transform: [{ scale: seekIndicatorScale }], opacity: seekIndicatorScale },
          ]}
          pointerEvents="none"
        >
          <Ionicons name="play-back" size={32} color="#fff" />
          <Text style={styles.seekIndicatorText}>-10s</Text>
        </RNAnimated.View>
      )}

      {/* Seek indicator - right side (+10s) */}
      {seekIndicator.visible && seekIndicator.direction === 'right' && (
        <RNAnimated.View
          style={[
            styles.seekIndicator,
            styles.seekIndicatorRight,
            { transform: [{ scale: seekIndicatorScale }], opacity: seekIndicatorScale },
          ]}
          pointerEvents="none"
        >
          <Ionicons name="play-forward" size={32} color="#fff" />
          <Text style={styles.seekIndicatorText}>+10s</Text>
        </RNAnimated.View>
      )}

      {/* Bottom gradient */}
      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.8)']}
        style={[styles.bottomGradient, { paddingBottom: insets.bottom + 80 }]}
        pointerEvents="box-none"
      >
        {/* Video info */}
        <View style={styles.videoInfo}>
          <Text style={styles.filename} numberOfLines={2}>
            {item.filename.replace(/\.[^/.]+$/, '')}
          </Text>
          {item.tags && item.tags.length > 0 && (
            <View style={styles.tagsRow}>
              {item.tags.slice(0, 3).map((tag) => (
                <View key={tag} style={styles.tag}>
                  <Text style={styles.tagText}>#{tag}</Text>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* Touchable progress bar for scrubbing */}
        <TouchableOpacity
          activeOpacity={1}
          style={styles.progressTouchArea}
          onPress={handleProgressBarTouch}
        >
          <View style={styles.progressContainer}>
            <View style={[styles.progressBar, { width: `${progress * 100}%` }]} />
          </View>
        </TouchableOpacity>
        <View style={styles.timeRow}>
          <Text style={styles.timeText}>{formatDuration(progress * duration)}</Text>
          <Text style={styles.timeText}>{formatDuration(duration)}</Text>
        </View>
      </LinearGradient>

      {/* Top gradient */}
      <LinearGradient
        colors={['rgba(0,0,0,0.6)', 'transparent']}
        style={[styles.topGradient, { paddingTop: insets.top }]}
        pointerEvents="none"
      >
        <Text style={styles.feedTitle}>Feed</Text>
      </LinearGradient>

      {/* Right side actions */}
      <View style={[styles.actionsColumn, { bottom: insets.bottom + 100 }]}>
        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => {
            if (Platform.OS === 'ios') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
            onToggleFavorite()
          }}
        >
          <Ionicons
            name={isFavorite ? 'heart' : 'heart-outline'}
            size={32}
            color={isFavorite ? '#ef4444' : '#fff'}
          />
          <Text style={styles.actionLabel}>Like</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => {
            if (Platform.OS === 'ios') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
            onToggleMute()
          }}
        >
          <Ionicons
            name={isMuted ? 'volume-mute' : 'volume-high'}
            size={28}
            color="#fff"
          />
          <Text style={styles.actionLabel}>{isMuted ? 'Muted' : 'Sound'}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.actionButton}>
          <Ionicons name="share-outline" size={28} color="#fff" />
          <Text style={styles.actionLabel}>Share</Text>
        </TouchableOpacity>
      </View>
    </View>
  )
})

export default function FeedScreen() {
  const { isConnected } = useConnectionStore()
  const { isFavorite, toggleFavorite } = useFavoritesStore()
  const { markBroken, isBroken } = useBrokenMediaStore()
  const insets = useSafeAreaInsets()
  const isFocused = useIsFocused() // Pause videos when tab not focused

  const [videos, setVideos] = useState<MediaItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [isMuted, setIsMuted] = useState(false)
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(true)
  const [localBrokenIds, setLocalBrokenIds] = useState<Set<string>>(new Set())
  const flatListRef = useRef<FlatList>(null)

  // Load videos
  const loadVideos = useCallback(async (pageNum: number = 1, append: boolean = false) => {
    if (!isConnected) return

    try {
      setIsLoading(true)
      const result = await api.getLibrary({
        page: pageNum,
        limit: 20, // Load more to account for filtering
        type: 'video',
        sort: 'random',
      })

      // Filter out unsupported formats and broken videos
      const allVideos = result.items || []
      const supportedVideos = allVideos.filter((video: MediaItem) => {
        // Filter out known broken videos
        if (isBroken(video.id)) return false
        // Filter out unsupported formats
        if (!isFormatSupported(video.filename, 'video')) return false
        return true
      })

      setHasMore(result.hasMore ?? allVideos.length === 20)

      if (append) {
        setVideos(prev => [...prev, ...supportedVideos])
      } else {
        setVideos(supportedVideos)
      }
    } catch (err) {
      console.error('Failed to load videos:', err)
    } finally {
      setIsLoading(false)
    }
  }, [isConnected, isBroken])

  // Handle video playback error - remove from current list and mark as broken
  const handleVideoError = useCallback((id: string) => {
    markBroken(id)
    setLocalBrokenIds(prev => new Set(prev).add(id))
    // Remove from current video list
    setVideos(prev => prev.filter(v => v.id !== id))
  }, [markBroken])

  useEffect(() => {
    loadVideos()
  }, [loadVideos])

  // Track visible item
  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    if (viewableItems.length > 0 && viewableItems[0].index !== null) {
      setCurrentIndex(viewableItems[0].index)
      if (Platform.OS === 'ios') Haptics.selectionAsync()
    }
  }).current

  const viewabilityConfig = useRef({
    itemVisiblePercentThreshold: 80,
  }).current

  // Load more when reaching end
  const handleEndReached = useCallback(() => {
    if (!isLoading && hasMore) {
      const nextPage = page + 1
      setPage(nextPage)
      loadVideos(nextPage, true)
    }
  }, [isLoading, hasMore, page, loadVideos])

  const handleToggleFavorite = useCallback((item: MediaItem) => {
    toggleFavorite({
      id: item.id,
      filename: item.filename,
      type: item.type,
      durationSec: item.durationSec,
      hasThumb: item.hasThumb,
    })
  }, [toggleFavorite])

  const renderItem = useCallback(({ item, index }: { item: MediaItem; index: number }) => (
    <FeedItem
      item={item}
      isActive={index === currentIndex && isFocused}
      isMuted={isMuted}
      onToggleMute={() => setIsMuted(!isMuted)}
      onToggleFavorite={() => handleToggleFavorite(item)}
      isFavorite={isFavorite(item.id)}
      onDoubleTap={() => handleToggleFavorite(item)}
      onError={handleVideoError}
    />
  ), [currentIndex, isMuted, handleToggleFavorite, isFavorite, handleVideoError, isFocused])

  if (!isConnected) {
    return (
      <View style={styles.centerContainer}>
        <Ionicons name="cloud-offline" size={64} color="#52525b" />
        <Text style={styles.emptyTitle}>Not Connected</Text>
        <Text style={styles.emptySubtitle}>Connect to your desktop Vault first</Text>
      </View>
    )
  }

  if (isLoading && videos.length === 0) {
    return <FeedSkeleton />
  }

  if (videos.length === 0) {
    return (
      <View style={styles.centerContainer}>
        <Ionicons name="videocam-off" size={64} color="#52525b" />
        <Text style={styles.emptyTitle}>No Videos</Text>
        <Text style={styles.emptySubtitle}>No videos found in your library</Text>
        <TouchableOpacity style={styles.retryButton} onPress={() => loadVideos()}>
          <Text style={styles.retryText}>Retry</Text>
        </TouchableOpacity>
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <StatusBar hidden />
      <FlatList
        ref={flatListRef}
        data={videos}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        pagingEnabled
        showsVerticalScrollIndicator={false}
        snapToInterval={SCREEN_HEIGHT}
        snapToAlignment="start"
        decelerationRate="fast"
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        onEndReached={handleEndReached}
        onEndReachedThreshold={0.5}
        removeClippedSubviews
        maxToRenderPerBatch={3}
        windowSize={5}
        initialNumToRender={2}
        getItemLayout={(_, index) => ({
          length: SCREEN_HEIGHT,
          offset: SCREEN_HEIGHT * index,
          index,
        })}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  centerContainer: {
    flex: 1,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '600',
    marginTop: 16,
  },
  emptySubtitle: {
    color: '#71717a',
    fontSize: 16,
    marginTop: 8,
    textAlign: 'center',
  },
  loadingText: {
    color: '#71717a',
    fontSize: 16,
    marginTop: 16,
  },
  retryButton: {
    marginTop: 24,
    paddingHorizontal: 32,
    paddingVertical: 16,
    backgroundColor: '#3b82f6',
    borderRadius: 12,
  },
  retryText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  feedItem: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
    backgroundColor: '#000',
  },
  video: {
    ...StyleSheet.absoluteFillObject,
  },
  poster: {
    ...StyleSheet.absoluteFillObject,
    resizeMode: 'cover',
  },
  bufferingContainer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  pauseOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pauseIcon: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingLeft: 10,
  },
  heartAnimation: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    marginTop: -50,
    marginLeft: -50,
  },
  topGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    paddingBottom: 40,
  },
  feedTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
    marginTop: 8,
  },
  bottomGradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    paddingTop: 60,
  },
  videoInfo: {
    marginBottom: 12,
    paddingRight: 80,
  },
  filename: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  tagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  tag: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  tagText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '500',
  },
  progressTouchArea: {
    paddingVertical: 12,
    marginVertical: -12,
  },
  progressContainer: {
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.3)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    backgroundColor: '#fff',
    borderRadius: 2,
  },
  seekIndicator: {
    position: 'absolute',
    top: '50%',
    marginTop: -40,
    backgroundColor: 'rgba(0,0,0,0.7)',
    borderRadius: 16,
    paddingHorizontal: 20,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  seekIndicatorLeft: {
    left: 40,
  },
  seekIndicatorRight: {
    right: 40,
  },
  seekIndicatorText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    marginTop: 4,
  },
  timeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  timeText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
    fontWeight: '500',
  },
  actionsColumn: {
    position: 'absolute',
    right: 12,
    alignItems: 'center',
    gap: 20,
  },
  actionButton: {
    alignItems: 'center',
    gap: 4,
  },
  actionLabel: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '500',
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  errorContainer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#18181b',
  },
  errorTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
    marginTop: 16,
  },
  errorSubtitle: {
    color: '#71717a',
    fontSize: 14,
    marginTop: 8,
    textAlign: 'center',
    paddingHorizontal: 32,
  },
})
