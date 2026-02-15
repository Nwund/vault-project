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
} from 'react-native'
import { Video, ResizeMode, AVPlaybackStatus } from 'expo-av'
import { Ionicons } from '@expo/vector-icons'
import { LinearGradient } from 'expo-linear-gradient'
import { BlurView } from 'expo-blur'
import * as Haptics from 'expo-haptics'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useConnectionStore } from '@/stores/connection'
import { useFavoritesStore } from '@/stores/favorites'
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
}: {
  item: MediaItem
  isActive: boolean
  isMuted: boolean
  onToggleMute: () => void
  onToggleFavorite: () => void
  isFavorite: boolean
  onDoubleTap: () => void
}) => {
  const videoRef = useRef<Video>(null)
  const [isPlaying, setIsPlaying] = useState(true)
  const [progress, setProgress] = useState(0)
  const [duration, setDuration] = useState(0)
  const [isBuffering, setIsBuffering] = useState(true)
  const heartScale = useRef(new RNAnimated.Value(0)).current
  const lastTap = useRef(0)
  const insets = useSafeAreaInsets()

  // Handle playback based on visibility
  useEffect(() => {
    if (videoRef.current) {
      if (isActive) {
        videoRef.current.playAsync()
        setIsPlaying(true)
      } else {
        videoRef.current.pauseAsync()
        setIsPlaying(false)
      }
    }
  }, [isActive])

  const handlePlaybackStatus = (status: AVPlaybackStatus) => {
    if (!status.isLoaded) return
    setIsBuffering(status.isBuffering)
    if (status.durationMillis) {
      setDuration(status.durationMillis)
      setProgress(status.positionMillis / status.durationMillis)
    }
  }

  const togglePlayPause = () => {
    const now = Date.now()
    // Check for double tap
    if (now - lastTap.current < 300) {
      // Double tap - like animation
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
      lastTap.current = 0
    } else {
      lastTap.current = now
      // Single tap - toggle play/pause after delay
      setTimeout(() => {
        if (Date.now() - lastTap.current >= 300 && lastTap.current === now) {
          if (videoRef.current) {
            if (isPlaying) {
              videoRef.current.pauseAsync()
              setIsPlaying(false)
            } else {
              videoRef.current.playAsync()
              setIsPlaying(true)
            }
          }
        }
      }, 300)
    }
  }

  const formatDuration = (ms: number) => {
    const totalSec = Math.floor(ms / 1000)
    const min = Math.floor(totalSec / 60)
    const sec = totalSec % 60
    return `${min}:${sec.toString().padStart(2, '0')}`
  }

  return (
    <TouchableOpacity
      activeOpacity={1}
      style={styles.feedItem}
      onPress={togglePlayPause}
    >
      <Video
        ref={videoRef}
        source={{ uri: api.getStreamUrl(item.id) }}
        style={styles.video}
        resizeMode={ResizeMode.CONTAIN}
        shouldPlay={isActive}
        isLooping
        isMuted={isMuted}
        onPlaybackStatusUpdate={handlePlaybackStatus}
        posterSource={{ uri: api.getThumbUrl(item.id) }}
        usePoster
        posterStyle={styles.poster}
      />

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

      {/* Bottom gradient */}
      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.8)']}
        style={[styles.bottomGradient, { paddingBottom: insets.bottom + 80 }]}
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

        {/* Progress bar */}
        <View style={styles.progressContainer}>
          <View style={[styles.progressBar, { width: `${progress * 100}%` }]} />
        </View>
        <View style={styles.timeRow}>
          <Text style={styles.timeText}>{formatDuration(progress * duration)}</Text>
          <Text style={styles.timeText}>{formatDuration(duration)}</Text>
        </View>
      </LinearGradient>

      {/* Top gradient */}
      <LinearGradient
        colors={['rgba(0,0,0,0.6)', 'transparent']}
        style={[styles.topGradient, { paddingTop: insets.top }]}
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
    </TouchableOpacity>
  )
})

export default function FeedScreen() {
  const { isConnected } = useConnectionStore()
  const { isFavorite, toggleFavorite } = useFavoritesStore()
  const insets = useSafeAreaInsets()

  const [videos, setVideos] = useState<MediaItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [isMuted, setIsMuted] = useState(false)
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(true)
  const flatListRef = useRef<FlatList>(null)

  // Load videos
  const loadVideos = useCallback(async (pageNum: number = 1, append: boolean = false) => {
    if (!isConnected) return

    try {
      setIsLoading(true)
      const result = await api.getLibrary({
        page: pageNum,
        limit: 10,
        type: 'video',
        sort: 'random',
      })

      const newVideos = result.items || []
      setHasMore(result.hasMore ?? newVideos.length === 10)

      if (append) {
        setVideos(prev => [...prev, ...newVideos])
      } else {
        setVideos(newVideos)
      }
    } catch (err) {
      console.error('Failed to load videos:', err)
    } finally {
      setIsLoading(false)
    }
  }, [isConnected])

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

  const handleToggleFavorite = useCallback((id: string) => {
    toggleFavorite(id)
  }, [toggleFavorite])

  const renderItem = useCallback(({ item, index }: { item: MediaItem; index: number }) => (
    <FeedItem
      item={item}
      isActive={index === currentIndex}
      isMuted={isMuted}
      onToggleMute={() => setIsMuted(!isMuted)}
      onToggleFavorite={() => handleToggleFavorite(item.id)}
      isFavorite={isFavorite(item.id)}
      onDoubleTap={() => handleToggleFavorite(item.id)}
    />
  ), [currentIndex, isMuted, handleToggleFavorite, isFavorite])

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
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#3b82f6" />
        <Text style={styles.loadingText}>Loading Feed...</Text>
      </View>
    )
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
  progressContainer: {
    height: 3,
    backgroundColor: 'rgba(255,255,255,0.3)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    backgroundColor: '#fff',
    borderRadius: 2,
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
})
