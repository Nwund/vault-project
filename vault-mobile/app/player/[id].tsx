// File: vault-mobile/app/player/[id].tsx
// Video player - Enhanced with speed control, haptics, and better UX

import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  StyleSheet,
  Dimensions,
  StatusBar,
  ActivityIndicator,
  GestureResponderEvent,
  Animated,
  Platform,
  Modal,
} from 'react-native'
import { useLocalSearchParams, router } from 'expo-router'
import { Video, ResizeMode, AVPlaybackStatus } from 'expo-av'
import * as ScreenOrientation from 'expo-screen-orientation'
import * as Haptics from 'expo-haptics'
import { Ionicons } from '@expo/vector-icons'
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler'
import ReAnimated, { useSharedValue, useAnimatedStyle, withSpring, runOnJS } from 'react-native-reanimated'
import { useConnectionStore } from '@/stores/connection'
import { useLibraryStore } from '@/stores/library'
import { useHistoryStore } from '@/stores/history'
import { useDownloadStore } from '@/stores/downloads'
import { useBrokenMediaStore } from '@/stores/broken-media'
import { useFavoritesStore } from '@/stores/favorites'
import { useSyncStore } from '@/stores/sync'
import { useToast } from '@/contexts/toast'
import { api } from '@/services/api'
import { getErrorMessage } from '@/utils'

const { width: SCREEN_WIDTH } = Dimensions.get('window')

const PLAYBACK_SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2]

export default function PlayerScreen() {
  const { id: routeId, offline } = useLocalSearchParams<{ id: string; offline?: string }>()
  const { serverUrl, token } = useConnectionStore()
  const { getAdjacentItems } = useLibraryStore()
  const { addToHistory, updateProgress } = useHistoryStore()
  const { downloads, getLocalPath, addToQueue, startDownload, isDownloaded } = useDownloadStore()
  const { markBroken } = useBrokenMediaStore()
  const { isFavorite, toggleFavorite } = useFavoritesStore()
  const { recordWatch, recordFavoriteChange } = useSyncStore()
  const toast = useToast()

  // Current media ID - can change via swipe without leaving player
  const [currentId, setCurrentId] = useState(routeId!)

  const videoRef = useRef<Video>(null)
  const isMountedRef = useRef(true)
  const hasErrorRef = useRef(false) // Ref for immediate error state access in closures
  const controlsTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)
  const controlsOpacity = useRef(new Animated.Value(1)).current

  // Track mounted state to prevent invalid view errors
  useEffect(() => {
    isMountedRef.current = true
    hasErrorRef.current = false // Reset error ref on mount
    return () => {
      isMountedRef.current = false
    }
  }, [])

  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [mediaUrl, setMediaUrl] = useState<string | null>(null)
  const [mediaTitle, setMediaTitle] = useState<string>('')

  // Playback state
  const [isPlaying, setIsPlaying] = useState(true)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [volume, setVolume] = useState(1)
  const [playbackSpeed, setPlaybackSpeed] = useState(1)

  // UI state
  const [showControls, setShowControls] = useState(true)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [isLocked, setIsLocked] = useState(false)
  const [showSpeedModal, setShowSpeedModal] = useState(false)
  const [showOptionsMenu, setShowOptionsMenu] = useState(false)
  const [isDownloading, setIsDownloading] = useState(false)

  // Check if current video is liked/downloaded
  const isLiked = useMemo(() => isFavorite(currentId), [currentId, isFavorite])
  const isVideoDownloaded = useMemo(() => isDownloaded(currentId), [currentId, isDownloaded])

  // Gesture state - simplified to just swipe for navigation
  const [swipeDirection, setSwipeDirection] = useState<'left' | 'right' | null>(null)
  const [isSwipeActive, setIsSwipeActive] = useState(false)
  const lastTapTime = useRef(0)
  const lastTapX = useRef(0)
  const translateX = useSharedValue(0)

  // Adjacent items for navigation - based on currentId
  const adjacentItems = useMemo(() => getAdjacentItems(currentId), [currentId, getAdjacentItems])

  // Switch to new video without leaving player
  const switchToVideo = useCallback((direction: 'prev' | 'next') => {
    const targetItem = direction === 'prev' ? adjacentItems.prev : adjacentItems.next
    if (targetItem) {
      if (Platform.OS === 'ios') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
      // Reset state for new video
      setIsLoading(true)
      setError(null)
      hasErrorRef.current = false // Reset error ref for new video
      setCurrentTime(0)
      setDuration(0)
      // Switch to new video - stays in player
      setCurrentId(targetItem.id)
    }
  }, [adjacentItems])

  // Fast swipe - navigate immediately on threshold, no slow animation
  const swipeGesture = Gesture.Pan()
    .enabled(!isLocked)
    .activeOffsetX([-10, 10])
    .failOffsetY([-50, 50])
    .onStart(() => {
      runOnJS(setIsSwipeActive)(true)
    })
    .onUpdate((event) => {
      // 1:1 finger tracking
      translateX.value = event.translationX
      runOnJS(setSwipeDirection)(event.translationX > 0 ? 'right' : 'left')
    })
    .onEnd((event) => {
      // Navigate immediately when threshold met - no slow animation
      const threshold = SCREEN_WIDTH * 0.15
      const shouldNavigate = Math.abs(event.translationX) > threshold || Math.abs(event.velocityX) > 400

      if (shouldNavigate && event.translationX > 0 && adjacentItems.prev) {
        // Switch video immediately - no navigation
        runOnJS(switchToVideo)('prev')
      } else if (shouldNavigate && event.translationX < 0 && adjacentItems.next) {
        // Switch video immediately - no navigation
        runOnJS(switchToVideo)('next')
      }

      // Always snap back quickly
      translateX.value = withSpring(0, { damping: 30, stiffness: 400 })
      runOnJS(setSwipeDirection)(null)
      runOnJS(setIsSwipeActive)(false)
    })

  // 1:1 finger tracking for iOS Photos-like feel
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }))

  // Handle tap and double-tap
  const handleTap = (evt: GestureResponderEvent) => {
    if (isLocked) {
      // Just show lock indicator briefly
      setShowControls(true)
      setTimeout(() => setShowControls(false), 1500)
      return
    }

    const now = Date.now()
    const tapX = evt.nativeEvent.pageX
    const timeDiff = now - lastTapTime.current

    if (timeDiff < 300 && Math.abs(tapX - lastTapX.current) < 50) {
      handleDoubleTap(tapX)
      lastTapTime.current = 0
    } else {
      lastTapTime.current = now
      lastTapX.current = tapX
      toggleControls()
    }
  }

  // Load media info
  useEffect(() => {
    const loadMedia = async () => {
      try {
        // Check for offline playback - either explicitly requested or no connection
        const localPath = getLocalPath(currentId)
        const isOfflineMode = offline === 'true' || !serverUrl

        if (isOfflineMode && localPath) {
          // Use downloaded local file
          setMediaUrl(localPath)
          // Get metadata from downloads store
          const downloadedMedia = downloads.find(d => d.id === currentId)
          setMediaTitle(downloadedMedia?.filename || 'Downloaded Media')

          // Add to watch history with offline info
          if (downloadedMedia) {
            addToHistory({
              id: downloadedMedia.id,
              filename: downloadedMedia.filename,
              type: downloadedMedia.type,
              durationSec: downloadedMedia.durationSec,
              hasThumb: false,
            })
            // Record for sync
            recordWatch(downloadedMedia.id)
          }
        } else if (isOfflineMode && !localPath) {
          // Offline mode but media not downloaded
          setError('This media is not available offline. Please download it first.')
        } else {
          // Online streaming mode
          const url = api.getStreamUrl(currentId)
          setMediaUrl(url)
          const info = await api.getMediaById(currentId)
          setMediaTitle(info?.filename || 'Unknown')

          // Add to watch history
          if (info) {
            addToHistory({
              id: info.id,
              filename: info.filename,
              type: info.type,
              durationSec: info.durationSec,
              hasThumb: info.hasThumb,
            })
            // Record for sync
            recordWatch(info.id)
            // Also sync to desktop immediately
            api.recordView(info.id).catch(() => {})
          }
        }
      } catch (err) {
        setError(getErrorMessage(err))
      }
    }

    if (currentId) loadMedia()
  }, [currentId, offline, serverUrl, downloads])

  // Lock orientation for fullscreen
  useEffect(() => {
    if (isFullscreen) {
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE)
    } else {
      ScreenOrientation.unlockAsync()
    }
    return () => { ScreenOrientation.unlockAsync() }
  }, [isFullscreen])

  // Auto-hide controls
  const resetControlsTimeout = useCallback(() => {
    if (controlsTimeout.current) clearTimeout(controlsTimeout.current)

    if (isPlaying && !isLocked) {
      controlsTimeout.current = setTimeout(() => {
        Animated.timing(controlsOpacity, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }).start(() => setShowControls(false))
      }, 3000)
    }
  }, [isPlaying, isLocked])

  useEffect(() => {
    if (showControls) {
      controlsOpacity.setValue(1)
      resetControlsTimeout()
    }
    return () => {
      if (controlsTimeout.current) clearTimeout(controlsTimeout.current)
    }
  }, [showControls, resetControlsTimeout])

  // Track progress updates for history
  const lastProgressUpdate = useRef(0)

  // Handle playback status updates
  const handlePlaybackStatusUpdate = useCallback((status: AVPlaybackStatus) => {
    if (!status.isLoaded) {
      setIsLoading(true)
      if (status.error) {
        hasErrorRef.current = true // Set ref immediately for sync access
        // Provide more helpful error message
        const errorMsg = status.error.includes('-11829')
          ? 'Video format not supported on iOS. Try a different video.'
          : status.error
        setError(errorMsg)
        // Mark as broken so it won't show in library
        if (currentId) markBroken(currentId)
      }
      return
    }

    setIsLoading(false)
    setIsPlaying(status.isPlaying)
    const currentPos = status.positionMillis / 1000
    const totalDur = (status.durationMillis || 0) / 1000
    setCurrentTime(currentPos)
    setDuration(totalDur)

    // Update progress in history every 10 seconds
    if (currentId && totalDur > 0 && currentPos - lastProgressUpdate.current > 10) {
      lastProgressUpdate.current = currentPos
      updateProgress(currentId, currentPos / totalDur)
    }

    if (status.didJustFinish) {
      // Mark as fully watched
      if (currentId) updateProgress(currentId, 1)
      // Auto-play next or go back
      if (adjacentItems.next) {
        switchToVideo('next')
      } else {
        router.back()
      }
    }
  }, [adjacentItems, switchToVideo, currentId, updateProgress, markBroken])

  // Controls
  const togglePlayPause = async () => {
    // Don't try to control video if it has errored out (use ref for immediate access)
    if (!videoRef.current || !isMountedRef.current || hasErrorRef.current) return
    if (Platform.OS === 'ios') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)

    try {
      if (isPlaying) {
        await videoRef.current.pauseAsync()
      } else {
        await videoRef.current.playAsync()
      }
    } catch {
      // Ignore errors from unmounted component
    }
  }

  const handleSeek = async (position: number) => {
    // Don't try to seek if video has errored out (use ref for immediate access)
    if (!videoRef.current || !isMountedRef.current || hasErrorRef.current) return
    try {
      await videoRef.current.setPositionAsync(position * 1000)
    } catch {
      // Ignore errors from unmounted component
    }
  }

  const handleDoubleTap = (x: number) => {
    const seekAmount = 10
    if (Platform.OS === 'ios') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)

    if (x < SCREEN_WIDTH / 3) {
      handleSeek(Math.max(0, currentTime - seekAmount))
    } else if (x > (SCREEN_WIDTH * 2) / 3) {
      handleSeek(Math.min(duration, currentTime + seekAmount))
    }
  }

  const toggleControls = () => {
    if (showControls) {
      Animated.timing(controlsOpacity, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }).start(() => setShowControls(false))
    } else {
      setShowControls(true)
    }
  }

  const handleClose = () => {
    if (Platform.OS === 'ios') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    router.back()
  }

  const toggleFullscreen = () => {
    if (Platform.OS === 'ios') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    setIsFullscreen(prev => !prev)
  }

  const toggleLock = () => {
    if (Platform.OS === 'ios') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
    setIsLocked(prev => !prev)
  }

  const handleSpeedChange = async (speed: number) => {
    if (Platform.OS === 'ios') Haptics.selectionAsync()
    setPlaybackSpeed(speed)
    setShowSpeedModal(false)
    // Don't try to set rate if video has errored out (use ref for immediate access)
    if (videoRef.current && isMountedRef.current && !hasErrorRef.current) {
      try {
        await videoRef.current.setRateAsync(speed, true)
      } catch {
        // Ignore errors from unmounted component
      }
    }
  }

  // Handle like/favorite
  const handleToggleLike = useCallback(() => {
    if (Platform.OS === 'ios') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
    const wasAdded = toggleFavorite({
      id: currentId,
      filename: mediaTitle,
      type: 'video',
      durationSec: duration,
      hasThumb: true,
    })
    // Record for sync and sync to desktop
    recordFavoriteChange(currentId, wasAdded)
    api.setRating(currentId, wasAdded ? 5 : 0).catch(() => {})
    if (wasAdded) {
      toast.success('Added to Favorites')
    } else {
      toast.info('Removed from Favorites')
    }
  }, [currentId, mediaTitle, duration, toggleFavorite, recordFavoriteChange, toast])

  // Handle download
  const handleDownload = useCallback(async () => {
    if (isVideoDownloaded || isDownloading) return

    if (Platform.OS === 'ios') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
    setIsDownloading(true)
    toast.info('Download started', 'Check Downloads tab for progress')

    try {
      const streamUrl = api.getStreamUrl(currentId)
      addToQueue({
        id: currentId,
        filename: mediaTitle,
        remoteUrl: streamUrl,
        type: 'video',
        durationSec: duration,
      })
      await startDownload(currentId)
      toast.success('Download complete')
    } catch (err) {
      console.error('Download failed:', err)
      toast.error('Download failed', getErrorMessage(err))
    } finally {
      setIsDownloading(false)
    }
  }, [currentId, mediaTitle, duration, isVideoDownloaded, isDownloading, addToQueue, startDownload, toast])

  // Format time
  const formatTime = (seconds: number) => {
    const hrs = Math.floor(seconds / 3600)
    const mins = Math.floor((seconds % 3600) / 60)
    const secs = Math.floor(seconds % 60)
    if (hrs > 0) {
      return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
    }
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0

  return (
    <GestureHandlerRootView style={styles.container}>
      <StatusBar hidden={isFullscreen} />

      {/* Gesture detector covers entire screen for swipe from anywhere */}
      <GestureDetector gesture={swipeGesture}>
        <ReAnimated.View style={[styles.fullScreen, animatedStyle]}>
          {/* Video layer */}
          <TouchableWithoutFeedback onPress={handleTap}>
            <View style={styles.videoContainer}>
              {mediaUrl && (
                <Video
                  ref={videoRef}
                  source={{
                    uri: mediaUrl,
                    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
                  }}
                  style={styles.video}
                  resizeMode={ResizeMode.CONTAIN}
                  shouldPlay={true}
                  isLooping={false}
                  volume={volume}
                  rate={playbackSpeed}
                  onPlaybackStatusUpdate={handlePlaybackStatusUpdate}
                  onLoad={() => setIsLoading(false)}
                  onError={(err) => {
                    const errorMsg = typeof err === 'string' && err.includes('-11829')
                      ? 'Video format not supported on iOS'
                      : getErrorMessage(err)
                    setError(errorMsg)
                    // Mark as broken so it won't show in library
                    if (currentId) markBroken(currentId)
                  }}
                />
              )}

              {/* Loading indicator */}
              {isLoading && (
                <View style={styles.loadingOverlay}>
                  <ActivityIndicator size="large" color="#3b82f6" />
                </View>
              )}

              {/* Error display */}
              {error && (
                <View style={styles.errorOverlay}>
                  <Ionicons name="alert-circle" size={48} color="#ef4444" />
                  <Text style={styles.errorText}>{error}</Text>
                  <TouchableOpacity style={styles.errorButton} onPress={handleClose}>
                    <Text style={styles.errorButtonText}>Go Back</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </TouchableWithoutFeedback>

          {/* Swipe indicator */}
          {isSwipeActive && swipeDirection && (
            <View style={styles.swipeIndicator} pointerEvents="none">
              <Ionicons
                name={swipeDirection === 'right' ? 'chevron-back' : 'chevron-forward'}
                size={48}
                color="#fff"
              />
              <Text style={styles.swipeText}>
                {swipeDirection === 'right' ? 'Previous' : 'Next'}
              </Text>
            </View>
          )}

          {/* Controls Overlay - inside gesture area */}
          {showControls && !error && (
            <Animated.View style={[styles.controlsOverlay, { opacity: controlsOpacity }]}>
              {/* Lock overlay */}
              {isLocked ? (
                <View style={styles.lockOverlay}>
                  <TouchableOpacity style={styles.unlockButton} onPress={toggleLock}>
                    <Ionicons name="lock-closed" size={28} color="#fff" />
                    <Text style={styles.unlockText}>Tap to unlock</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <>
                  {/* Top Bar */}
                  <View style={styles.topBar}>
                    <TouchableOpacity style={styles.iconButton} onPress={handleClose}>
                      <Ionicons name="chevron-down" size={28} color="#fff" />
                    </TouchableOpacity>
                    <Text style={styles.title} numberOfLines={1}>
                      {mediaTitle}
                    </Text>
                    <View style={styles.topBarRight}>
                      {/* Like button */}
                      <TouchableOpacity style={styles.iconButton} onPress={handleToggleLike}>
                        <Ionicons
                          name={isLiked ? 'heart' : 'heart-outline'}
                          size={24}
                          color={isLiked ? '#ef4444' : '#fff'}
                        />
                      </TouchableOpacity>
                      {/* Download button */}
                      <TouchableOpacity
                        style={styles.iconButton}
                        onPress={handleDownload}
                        disabled={isVideoDownloaded || isDownloading}
                      >
                        <Ionicons
                          name={isVideoDownloaded ? 'checkmark-circle' : isDownloading ? 'cloud-download' : 'cloud-download-outline'}
                          size={24}
                          color={isVideoDownloaded ? '#22c55e' : '#fff'}
                        />
                      </TouchableOpacity>
                      {/* Lock button */}
                      <TouchableOpacity style={styles.iconButton} onPress={toggleLock}>
                        <Ionicons name="lock-open" size={22} color="#fff" />
                      </TouchableOpacity>
                      {/* Fullscreen button */}
                      <TouchableOpacity style={styles.iconButton} onPress={toggleFullscreen}>
                        <Ionicons
                          name={isFullscreen ? 'contract' : 'expand'}
                          size={24}
                          color="#fff"
                        />
                      </TouchableOpacity>
                    </View>
                  </View>

              {/* Center Controls - Swipe left/right for prev/next video */}
              <View style={styles.centerControls}>
                <TouchableOpacity
                  style={styles.seekButton}
                  onPress={() => handleSeek(Math.max(0, currentTime - 10))}
                >
                  <Ionicons name="play-back" size={32} color="#fff" />
                  <Text style={styles.seekText}>10</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.playPauseButton}
                  onPress={togglePlayPause}
                >
                  <Ionicons
                    name={isPlaying ? 'pause' : 'play'}
                    size={48}
                    color="#fff"
                  />
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.seekButton}
                  onPress={() => handleSeek(Math.min(duration, currentTime + 10))}
                >
                  <Ionicons name="play-forward" size={32} color="#fff" />
                  <Text style={styles.seekText}>10</Text>
                </TouchableOpacity>
              </View>

              {/* Bottom Bar */}
              <View style={styles.bottomBar}>
                {/* Progress Bar */}
                <View style={styles.progressContainer}>
                  <Text style={styles.timeText}>{formatTime(currentTime)}</Text>
                  <TouchableOpacity
                    style={styles.progressBarWrapper}
                    activeOpacity={1}
                    onPress={(e) => {
                      const x = e.nativeEvent.locationX
                      const width = SCREEN_WIDTH - 140
                      const percent = x / width
                      handleSeek(duration * percent)
                      if (Platform.OS === 'ios') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
                    }}
                  >
                    <View style={styles.progressBar}>
                      <View style={[styles.progressFill, { width: `${progress}%` }]} />
                      <View style={[styles.progressThumb, { left: `${progress}%` }]} />
                    </View>
                  </TouchableOpacity>
                  <Text style={styles.timeText}>{formatTime(duration)}</Text>
                </View>

                {/* Extra controls */}
                <View style={styles.extraControls}>
                  <TouchableOpacity
                    style={styles.speedButton}
                    onPress={() => {
                      if (Platform.OS === 'ios') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
                      setShowSpeedModal(true)
                    }}
                  >
                    <Ionicons name="speedometer" size={18} color="#fff" />
                    <Text style={styles.speedText}>{playbackSpeed}x</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </>
          )}
          </Animated.View>
          )}
        </ReAnimated.View>
      </GestureDetector>

      {/* Speed Modal */}
      <Modal
        visible={showSpeedModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowSpeedModal(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowSpeedModal(false)}
        >
          <View style={styles.speedModal}>
            <Text style={styles.speedModalTitle}>Playback Speed</Text>
            <View style={styles.speedOptions}>
              {PLAYBACK_SPEEDS.map((speed) => (
                <TouchableOpacity
                  key={speed}
                  style={[
                    styles.speedOption,
                    playbackSpeed === speed && styles.speedOptionActive,
                  ]}
                  onPress={() => handleSpeedChange(speed)}
                >
                  <Text style={[
                    styles.speedOptionText,
                    playbackSpeed === speed && styles.speedOptionTextActive,
                  ]}>
                    {speed}x
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </TouchableOpacity>
      </Modal>
    </GestureHandlerRootView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  fullScreen: {
    flex: 1,
  },
  videoContainer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  video: {
    width: '100%',
    height: '100%',
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  errorOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.8)',
    padding: 32,
  },
  errorText: {
    color: '#fff',
    fontSize: 16,
    textAlign: 'center',
    marginTop: 16,
  },
  errorButton: {
    marginTop: 24,
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: '#3b82f6',
    borderRadius: 8,
  },
  errorButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  controlsOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'space-between',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  lockOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  unlockButton: {
    alignItems: 'center',
    padding: 24,
  },
  unlockText: {
    color: '#fff',
    fontSize: 14,
    marginTop: 8,
    opacity: 0.8,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    paddingTop: Platform.OS === 'ios' ? 56 : 16,
  },
  topBarRight: {
    flexDirection: 'row',
    gap: 4,
  },
  iconButton: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    flex: 1,
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
    marginHorizontal: 8,
  },
  centerControls: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 20,
  },
  seekButton: {
    alignItems: 'center',
  },
  seekText: {
    color: '#fff',
    fontSize: 12,
    marginTop: 4,
  },
  playPauseButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  bottomBar: {
    padding: 16,
    paddingBottom: Platform.OS === 'ios' ? 40 : 24,
  },
  progressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  timeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '500',
    width: 55,
    textAlign: 'center',
  },
  progressBarWrapper: {
    flex: 1,
    paddingVertical: 12,
  },
  progressBar: {
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.3)',
    borderRadius: 2,
    position: 'relative',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#3b82f6',
    borderRadius: 2,
  },
  progressThumb: {
    position: 'absolute',
    top: -6,
    marginLeft: -8,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  extraControls: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 12,
  },
  speedButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.15)',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
  },
  speedText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  swipeIndicator: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    marginLeft: -60,
    marginTop: -60,
    width: 120,
    height: 120,
    backgroundColor: 'rgba(0,0,0,0.85)',
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  swipeText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    marginTop: 8,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  speedModal: {
    backgroundColor: '#18181b',
    borderRadius: 20,
    padding: 24,
    width: SCREEN_WIDTH * 0.8,
    maxWidth: 320,
  },
  speedModalTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 20,
  },
  speedOptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    justifyContent: 'center',
  },
  speedOption: {
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#27272a',
    minWidth: 60,
    alignItems: 'center',
  },
  speedOptionActive: {
    backgroundColor: '#3b82f6',
  },
  speedOptionText: {
    color: '#a1a1aa',
    fontSize: 15,
    fontWeight: '600',
  },
  speedOptionTextActive: {
    color: '#fff',
  },
})
