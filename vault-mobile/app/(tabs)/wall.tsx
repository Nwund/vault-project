// File: vault-mobile/app/(tabs)/wall.tsx
// Wall Mode - Multiple videos playing simultaneously in a grid
// Pinch to zoom changes tile count, swipe to shuffle

import { useState, useEffect, useCallback, useRef, memo, useLayoutEffect } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  StatusBar,
  ActivityIndicator,
  PanResponder,
} from 'react-native'
import { Video, ResizeMode } from 'expo-av'
import { Ionicons } from '@expo/vector-icons'
import * as ScreenOrientation from 'expo-screen-orientation'
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler'
import Animated, { useSharedValue, useAnimatedStyle, withSpring, runOnJS } from 'react-native-reanimated'
import { useIsFocused, useNavigation } from '@react-navigation/native'
import { useConnectionStore } from '@/stores/connection'
import { useBrokenMediaStore, isFormatSupported } from '@/stores/broken-media'
import { api } from '@/services/api'

interface MediaItem {
  id: string
  filename: string
  type: 'video' | 'image' | 'gif'
  durationSec?: number
  hasThumb: boolean
}

// More tile options (1 to 80)
const TILE_COUNTS = [1, 2, 4, 6, 9, 12, 16, 20, 25, 30, 36, 42, 49, 56, 64, 72, 80]

// Calculate grid dimensions for a given tile count - prefer square-ish in portrait
const getGridConfig = (count: number, isPortrait: boolean) => {
  if (count === 1) return { cols: 1, rows: 1 }
  if (count === 2) return isPortrait ? { cols: 1, rows: 2 } : { cols: 2, rows: 1 }
  if (count === 4) return { cols: 2, rows: 2 }
  if (count === 6) return isPortrait ? { cols: 2, rows: 3 } : { cols: 3, rows: 2 }
  if (count === 9) return { cols: 3, rows: 3 }
  if (count === 12) return isPortrait ? { cols: 3, rows: 4 } : { cols: 4, rows: 3 }
  if (count === 16) return { cols: 4, rows: 4 }
  if (count === 20) return isPortrait ? { cols: 4, rows: 5 } : { cols: 5, rows: 4 }
  if (count === 25) return { cols: 5, rows: 5 }
  if (count === 30) return isPortrait ? { cols: 5, rows: 6 } : { cols: 6, rows: 5 }
  if (count === 36) return { cols: 6, rows: 6 }
  if (count === 42) return isPortrait ? { cols: 6, rows: 7 } : { cols: 7, rows: 6 }
  if (count === 49) return { cols: 7, rows: 7 }
  if (count === 56) return isPortrait ? { cols: 7, rows: 8 } : { cols: 8, rows: 7 }
  if (count === 64) return { cols: 8, rows: 8 }
  if (count === 72) return isPortrait ? { cols: 8, rows: 9 } : { cols: 9, rows: 8 }
  if (count === 80) return isPortrait ? { cols: 8, rows: 10 } : { cols: 10, rows: 8 }
  // Default: prefer more rows in portrait, more cols in landscape
  if (isPortrait) {
    const cols = Math.ceil(Math.sqrt(count * 0.75))
    const rows = Math.ceil(count / cols)
    return { cols, rows }
  } else {
    const cols = Math.ceil(Math.sqrt(count * 1.5))
    const rows = Math.ceil(count / cols)
    return { cols, rows }
  }
}

// Maximum videos playing at once on mobile to prevent stuttering
const MAX_MOBILE_VIDEOS = 4

// Memoized video tile component
const VideoTile = memo(({
  item,
  muted,
  shouldPlay,
  onError,
  style,
  loadDelay,
}: {
  item: MediaItem
  muted: boolean
  shouldPlay: boolean
  onError: (id: string) => void
  style: any
  loadDelay?: number
}) => {
  const videoRef = useRef<Video>(null)
  const [isReady, setIsReady] = useState(false)
  const [hasLoaded, setHasLoaded] = useState(false)

  // Stagger video loading to prevent overwhelming the device
  useEffect(() => {
    if (loadDelay && loadDelay > 0) {
      const timer = setTimeout(() => setIsReady(true), loadDelay)
      return () => clearTimeout(timer)
    } else {
      setIsReady(true)
    }
  }, [loadDelay])

  return (
    <View style={[styles.tile, style]}>
      {isReady ? (
        <Video
          ref={videoRef}
          source={{ uri: api.getStreamUrl(item.id) }}
          style={styles.tileVideo}
          resizeMode={ResizeMode.COVER}
          shouldPlay={shouldPlay && hasLoaded}
          isLooping={true}
          isMuted={muted}
          onError={() => onError(item.id)}
          onLoad={() => setHasLoaded(true)}
          progressUpdateIntervalMillis={1000}
        />
      ) : (
        <View style={[styles.tileVideo, styles.tilePlaceholder]}>
          <ActivityIndicator size="small" color="#3b82f6" />
        </View>
      )}
    </View>
  )
})

export default function WallScreen() {
  const { isConnected } = useConnectionStore()
  const { markBroken: persistBroken } = useBrokenMediaStore()
  const isFocused = useIsFocused() // Pause videos when tab not focused
  const navigation = useNavigation()

  const [tiles, setTiles] = useState<MediaItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [muted, setMuted] = useState(false)
  const [showControls, setShowControls] = useState(false) // Start hidden
  const [tileCountIndex, setTileCountIndex] = useState(3) // Start with 4 tiles
  const [brokenIds, setBrokenIds] = useState<Set<string>>(new Set())
  const [dimensions, setDimensions] = useState(Dimensions.get('window'))
  const [showTileMenu, setShowTileMenu] = useState(false)
  const [isLandscape, setIsLandscape] = useState(dimensions.width > dimensions.height)
  const [isShuffling, setIsShuffling] = useState(false)
  const [pinchFeedback, setPinchFeedback] = useState<string | null>(null)
  const [availableTags, setAvailableTags] = useState<string[]>([])
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [showTagMenu, setShowTagMenu] = useState(false)

  const controlsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pinchFeedbackTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)
  const tileCount = TILE_COUNTS[tileCountIndex]
  const gridConfig = getGridConfig(tileCount, !isLandscape)

  // Shared value for pinch scale feedback
  const pinchScale = useSharedValue(1)

  // Hide/show tab bar based on controls visibility
  useLayoutEffect(() => {
    navigation.setOptions({
      tabBarStyle: showControls ? undefined : { display: 'none' },
    })
  }, [navigation, showControls])

  // Handle orientation changes
  useEffect(() => {
    const subscription = Dimensions.addEventListener('change', ({ window }) => {
      setDimensions(window)
      setIsLandscape(window.width > window.height)
    })

    ScreenOrientation.unlockAsync()

    return () => {
      subscription?.remove()
    }
  }, [])

  // Calculate tile dimensions
  const getTileDimensions = useCallback(() => {
    const { width, height } = dimensions
    let cols = gridConfig.cols
    let rows = gridConfig.rows

    // In landscape, swap cols and rows for better layout (if not already optimal)
    if (isLandscape && tileCount > 2 && rows > cols) {
      const temp = cols
      cols = rows
      rows = temp
    }

    const tileWidth = width / cols
    const tileHeight = height / rows
    return { cols, rows, tileWidth, tileHeight }
  }, [dimensions, gridConfig, isLandscape, tileCount])

  const { tileWidth, tileHeight } = getTileDimensions()

  // Load tags
  useEffect(() => {
    const fetchTags = async () => {
      try {
        const result = await api.getTags()
        setAvailableTags(result.tags || [])
      } catch (err) {
        console.error('Failed to fetch tags:', err)
      }
    }
    if (isConnected) fetchTags()
  }, [isConnected])

  // Load random videos
  const loadVideos = useCallback(async () => {
    if (isShuffling) return
    setIsShuffling(true)
    setIsLoading(true)
    try {
      const result = await api.getLibrary({
        limit: tileCount * 5, // Load more to account for filtering
        type: 'video',
        sort: 'random',
        tags: selectedTags.length > 0 ? selectedTags : undefined,
      })

      // Filter out broken and unsupported format videos
      const validVideos = (result.items || []).filter(
        (item: MediaItem) => {
          // Skip broken videos
          if (brokenIds.has(item.id)) return false
          // Skip unsupported formats
          if (!isFormatSupported(item.filename, 'video')) return false
          return true
        }
      )

      setTiles(validVideos.slice(0, tileCount))
    } catch (err) {
      console.error('Failed to load videos:', err)
    } finally {
      setIsLoading(false)
      setIsShuffling(false)
    }
  }, [tileCount, brokenIds, isShuffling, selectedTags])

  // Ref for callbacks in gestures
  const loadVideosRef = useRef(loadVideos)
  // Use shared value for tile count index since it's accessed from worklets
  const tileCountIndexRef = useSharedValue(tileCountIndex)

  useEffect(() => {
    loadVideosRef.current = loadVideos
  }, [loadVideos])

  useEffect(() => {
    tileCountIndexRef.value = tileCountIndex
  }, [tileCountIndex])

  useEffect(() => {
    if (isConnected) {
      loadVideos()
    }
  }, [isConnected, tileCount])

  // Auto-hide controls after 5 seconds
  useEffect(() => {
    if (showControls && !showTileMenu && !showTagMenu) {
      controlsTimeoutRef.current = setTimeout(() => {
        setShowControls(false)
      }, 5000)
    }

    return () => {
      if (controlsTimeoutRef.current) {
        clearTimeout(controlsTimeoutRef.current)
      }
    }
  }, [showControls, showTileMenu, showTagMenu])

  const handleError = useCallback((id: string) => {
    // Persist broken status across sessions
    persistBroken(id)
    setBrokenIds(prev => new Set(prev).add(id))
    setTiles(prev => prev.filter(t => t.id !== id))
  }, [persistBroken])

  const shuffle = useCallback(() => {
    setShowTileMenu(false)
    loadVideos()
  }, [loadVideos])

  const selectTileCount = useCallback((index: number) => {
    setTileCountIndex(index)
    setShowTileMenu(false)
  }, [])

  const toggleTag = useCallback((tag: string) => {
    setSelectedTags(prev => {
      if (prev.includes(tag)) {
        return prev.filter(t => t !== tag)
      } else {
        return [...prev, tag]
      }
    })
  }, [])

  // Show pinch feedback briefly
  const showPinchFeedback = useCallback((count: number) => {
    setPinchFeedback(`${count} tiles`)
    if (pinchFeedbackTimeout.current) {
      clearTimeout(pinchFeedbackTimeout.current)
    }
    pinchFeedbackTimeout.current = setTimeout(() => {
      setPinchFeedback(null)
    }, 800)
  }, [])

  // Helper functions that can be called from UI thread via runOnJS
  const updateTileCount = useCallback((newIndex: number) => {
    setTileCountIndex(newIndex)
    showPinchFeedback(TILE_COUNTS[newIndex])
  }, [showPinchFeedback])

  // Shared values for pinch gesture (worklet-safe)
  const lastPinchScale = useSharedValue(1)
  const pinchGesture = Gesture.Pinch()
    .onStart(() => {
      'worklet'
      lastPinchScale.value = 1
    })
    .onUpdate((event) => {
      'worklet'
      const scaleDiff = event.scale - lastPinchScale.value

      // Pinch out (zoom in) = fewer tiles, pinch in (zoom out) = more tiles
      if (Math.abs(scaleDiff) > 0.3) {
        const currentIndex = tileCountIndexRef.value
        let newIndex = currentIndex

        if (scaleDiff > 0 && currentIndex > 0) {
          // Pinch out - fewer tiles (zoom in on videos)
          newIndex = currentIndex - 1
        } else if (scaleDiff < 0 && currentIndex < TILE_COUNTS.length - 1) {
          // Pinch in - more tiles (zoom out)
          newIndex = currentIndex + 1
        }

        if (newIndex !== currentIndex) {
          lastPinchScale.value = event.scale
          tileCountIndexRef.value = newIndex
          runOnJS(updateTileCount)(newIndex)
        }
      }

      pinchScale.value = event.scale
    })
    .onEnd(() => {
      'worklet'
      pinchScale.value = withSpring(1)
    })

  // Helper for shuffle
  const triggerShuffle = useCallback(() => {
    loadVideosRef.current()
  }, [])

  // Helper for toggling controls
  const toggleControlsFromGesture = useCallback(() => {
    if (showTileMenu) {
      setShowTileMenu(false)
    } else {
      setShowControls(prev => !prev)
    }
  }, [showTileMenu])

  // Pan gesture for swipe to shuffle
  const panGesture = Gesture.Pan()
    .minDistance(100)
    .onEnd((event) => {
      'worklet'
      if (Math.abs(event.translationX) > Math.abs(event.translationY) && Math.abs(event.translationX) > 120) {
        runOnJS(triggerShuffle)()
      }
    })

  // Tap gesture to toggle controls
  const tapGesture = Gesture.Tap()
    .onEnd(() => {
      'worklet'
      runOnJS(toggleControlsFromGesture)()
    })

  // Combine all gestures
  const composedGesture = Gesture.Simultaneous(
    pinchGesture,
    Gesture.Race(panGesture, tapGesture)
  )

  // Animated style for pinch feedback
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + (pinchScale.value - 1) * 0.05 }],
  }))

  if (!isConnected) {
    return (
      <GestureHandlerRootView style={styles.flex}>
        <View style={styles.centerContainer}>
          <Ionicons name="cloud-offline" size={64} color="#52525b" />
          <Text style={styles.emptyTitle}>Not Connected</Text>
          <Text style={styles.emptySubtitle}>Connect to your desktop Vault first</Text>
        </View>
      </GestureHandlerRootView>
    )
  }

  if (isLoading && tiles.length === 0) {
    return (
      <GestureHandlerRootView style={styles.flex}>
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#3b82f6" />
          <Text style={styles.loadingText}>Loading Wall...</Text>
        </View>
      </GestureHandlerRootView>
    )
  }

  if (tiles.length === 0) {
    return (
      <GestureHandlerRootView style={styles.flex}>
        <View style={styles.centerContainer}>
          <Ionicons name="videocam-off" size={64} color="#52525b" />
          <Text style={styles.emptyTitle}>No Videos</Text>
          <Text style={styles.emptySubtitle}>No compatible videos found</Text>
          <TouchableOpacity style={styles.retryButton} onPress={loadVideos}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </GestureHandlerRootView>
    )
  }

  return (
    <GestureHandlerRootView style={styles.flex}>
      <View style={styles.container}>
        <StatusBar hidden />

        {/* Video Grid with gestures */}
        <GestureDetector gesture={composedGesture}>
          <Animated.View style={[styles.gridContainer, animatedStyle]}>
            <View style={styles.grid}>
              {tiles.slice(0, tileCount).map((item, index) => (
                <VideoTile
                  key={item.id}
                  item={item}
                  muted={muted}
                  shouldPlay={isFocused && index < MAX_MOBILE_VIDEOS}
                  onError={handleError}
                  style={{ width: tileWidth, height: tileHeight }}
                  loadDelay={index * 150}
                />
              ))}
            </View>
          </Animated.View>
        </GestureDetector>

        {/* Pinch feedback */}
        {pinchFeedback && (
          <View style={styles.pinchFeedback} pointerEvents="none">
            <Text style={styles.pinchFeedbackText}>{pinchFeedback}</Text>
          </View>
        )}

        {/* Gesture hints */}
        {showControls && (
          <View style={styles.gestureHints} pointerEvents="none">
            <View style={styles.hintRow}>
              <Ionicons name="swap-horizontal" size={18} color="rgba(255,255,255,0.6)" />
              <Text style={styles.hintText}>Swipe to shuffle</Text>
            </View>
            <View style={styles.hintRow}>
              <Ionicons name="expand" size={18} color="rgba(255,255,255,0.6)" />
              <Text style={styles.hintText}>Pinch to resize</Text>
            </View>
          </View>
        )}

        {/* Controls Overlay */}
        {showControls && (
          <View style={styles.controlsOverlay} pointerEvents="box-none">
            {/* Top Controls */}
            <View style={[styles.controlsRow, styles.topControls]}>
              <TouchableOpacity
                style={styles.controlButton}
                onPress={() => setMuted(!muted)}
              >
                <Ionicons
                  name={muted ? 'volume-mute' : 'volume-high'}
                  size={28}
                  color="#fff"
                />
              </TouchableOpacity>

              <View style={styles.titleContainer}>
                <Text style={styles.title}>Wall</Text>
                <Text style={styles.tileCountLabel}>{tileCount} tiles</Text>
              </View>

              <TouchableOpacity
                style={styles.controlButton}
                onPress={() => setShowTileMenu(!showTileMenu)}
              >
                <Ionicons name="grid" size={26} color="#fff" />
              </TouchableOpacity>
            </View>

            {/* Bottom Controls */}
            <View style={[styles.controlsRow, styles.bottomControls]}>
              {/* Tag Filter Button */}
              {availableTags.length > 0 && (
                <TouchableOpacity
                  style={[styles.tagFilterButton, selectedTags.length > 0 && styles.tagFilterButtonActive]}
                  onPress={() => setShowTagMenu(true)}
                >
                  <Ionicons name="pricetag" size={20} color={selectedTags.length > 0 ? '#fff' : '#a1a1aa'} />
                  {selectedTags.length > 0 && (
                    <Text style={styles.tagFilterCount}>{selectedTags.length}</Text>
                  )}
                </TouchableOpacity>
              )}

              <TouchableOpacity
                style={styles.shuffleButton}
                onPress={shuffle}
                disabled={isShuffling}
              >
                <Ionicons name="shuffle" size={28} color="#fff" />
                <Text style={styles.shuffleText}>
                  {isShuffling ? 'Loading...' : 'Shuffle'}
                </Text>
              </TouchableOpacity>

              {/* Spacer for symmetry */}
              {availableTags.length > 0 && <View style={{ width: 50 }} />}
            </View>
          </View>
        )}

        {/* Tile Count Menu */}
        {showTileMenu && (
          <TouchableOpacity
            style={styles.menuOverlay}
            activeOpacity={1}
            onPress={() => setShowTileMenu(false)}
          >
            <View style={styles.tileMenu}>
              <Text style={styles.menuTitle}>Tile Count</Text>
              <View style={styles.tileOptions}>
                {TILE_COUNTS.map((count, index) => (
                  <TouchableOpacity
                    key={count}
                    style={[
                      styles.tileOption,
                      tileCountIndex === index && styles.tileOptionActive,
                    ]}
                    onPress={() => selectTileCount(index)}
                  >
                    <Text style={[
                      styles.tileOptionNumber,
                      tileCountIndex === index && styles.tileOptionTextActive,
                    ]}>
                      {count}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </TouchableOpacity>
        )}

        {/* Tag Filter Menu */}
        {showTagMenu && (
          <TouchableOpacity
            style={styles.menuOverlay}
            activeOpacity={1}
            onPress={() => setShowTagMenu(false)}
          >
            <View style={styles.tagMenu}>
              <View style={styles.tagMenuHeader}>
                <Text style={styles.menuTitle}>Filter by Tags</Text>
                {selectedTags.length > 0 && (
                  <TouchableOpacity
                    onPress={() => setSelectedTags([])}
                    style={styles.clearTagsButton}
                  >
                    <Text style={styles.clearTagsText}>Clear All</Text>
                  </TouchableOpacity>
                )}
              </View>
              <View style={styles.tagList}>
                {availableTags.slice(0, 20).map((tag) => (
                  <TouchableOpacity
                    key={tag}
                    style={[
                      styles.tagChip,
                      selectedTags.includes(tag) && styles.tagChipActive,
                    ]}
                    onPress={() => toggleTag(tag)}
                  >
                    <Text style={[
                      styles.tagChipText,
                      selectedTags.includes(tag) && styles.tagChipTextActive,
                    ]}>
                      {tag}
                    </Text>
                    {selectedTags.includes(tag) && (
                      <Ionicons name="checkmark" size={14} color="#fff" />
                    )}
                  </TouchableOpacity>
                ))}
              </View>
              <TouchableOpacity
                style={styles.applyTagsButton}
                onPress={() => {
                  setShowTagMenu(false)
                  loadVideos()
                }}
              >
                <Text style={styles.applyTagsText}>Apply & Shuffle</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        )}
      </View>
    </GestureHandlerRootView>
  )
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
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
  gridContainer: {
    flex: 1,
  },
  grid: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  tile: {
    overflow: 'hidden',
    backgroundColor: '#18181b',
  },
  tileVideo: {
    width: '100%',
    height: '100%',
  },
  tilePlaceholder: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#18181b',
  },
  pinchFeedback: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: [{ translateX: -60 }, { translateY: -30 }],
    backgroundColor: 'rgba(0,0,0,0.8)',
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderRadius: 16,
    minWidth: 120,
    alignItems: 'center',
  },
  pinchFeedbackText: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '700',
  },
  gestureHints: {
    position: 'absolute',
    bottom: 120,
    left: 0,
    right: 0,
    alignItems: 'center',
    gap: 8,
  },
  hintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
  },
  hintText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 14,
  },
  controlsOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'space-between',
    pointerEvents: 'box-none',
  },
  controlsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  topControls: {
    paddingTop: 54,
    paddingBottom: 16,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  bottomControls: {
    paddingTop: 16,
    paddingBottom: 44,
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  controlButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 22,
    paddingVertical: 16,
    borderRadius: 30,
    backgroundColor: 'rgba(255,255,255,0.2)',
    minWidth: 70,
    minHeight: 60,
    justifyContent: 'center',
  },
  titleContainer: {
    alignItems: 'center',
  },
  title: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '700',
  },
  tileCountLabel: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 14,
    marginTop: 2,
  },
  shuffleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 48,
    paddingVertical: 20,
    borderRadius: 36,
    backgroundColor: '#3b82f6',
    minHeight: 70,
  },
  shuffleText: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '600',
  },
  menuOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  tileMenu: {
    backgroundColor: '#1c1c1e',
    borderRadius: 24,
    padding: 28,
    minWidth: 320,
    maxWidth: '95%',
  },
  menuTitle: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 24,
  },
  tileOptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 12,
  },
  tileOption: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 64,
    height: 64,
    borderRadius: 16,
    backgroundColor: '#2c2c2e',
  },
  tileOptionActive: {
    backgroundColor: '#3b82f6',
  },
  tileOptionNumber: {
    color: '#a1a1aa',
    fontSize: 22,
    fontWeight: '700',
  },
  tileOptionTextActive: {
    color: '#fff',
  },
  tagFilterButton: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row',
    gap: 4,
  },
  tagFilterButtonActive: {
    backgroundColor: '#a855f7',
  },
  tagFilterCount: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  tagMenu: {
    backgroundColor: '#1c1c1e',
    borderRadius: 24,
    padding: 24,
    minWidth: 320,
    maxWidth: '95%',
    maxHeight: '80%',
  },
  tagMenuHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  clearTagsButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderRadius: 8,
  },
  clearTagsText: {
    color: '#ef4444',
    fontSize: 13,
    fontWeight: '600',
  },
  tagList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 20,
  },
  tagChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: '#2c2c2e',
  },
  tagChipActive: {
    backgroundColor: '#a855f7',
  },
  tagChipText: {
    color: '#a1a1aa',
    fontSize: 14,
    fontWeight: '600',
  },
  tagChipTextActive: {
    color: '#fff',
  },
  applyTagsButton: {
    backgroundColor: '#3b82f6',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  applyTagsText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
})
