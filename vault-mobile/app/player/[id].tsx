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
  PanResponder,
  GestureResponderEvent,
  Animated,
  Platform,
  Modal,
} from 'react-native'
import { useLocalSearchParams, router } from 'expo-router'
import { Video, ResizeMode, AVPlaybackStatus } from 'expo-av'
import * as ScreenOrientation from 'expo-screen-orientation'
import * as Brightness from 'expo-brightness'
import * as Haptics from 'expo-haptics'
import { Ionicons } from '@expo/vector-icons'
import { useConnectionStore } from '@/stores/connection'
import { useLibraryStore } from '@/stores/library'
import { useHistoryStore } from '@/stores/history'
import { useDownloadStore } from '@/stores/downloads'
import { api } from '@/services/api'
import { getErrorMessage } from '@/utils'

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window')
const GESTURE_THRESHOLD = 10

const PLAYBACK_SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2]

export default function PlayerScreen() {
  const { id, offline } = useLocalSearchParams<{ id: string; offline?: string }>()
  const { serverUrl, token } = useConnectionStore()
  const { getAdjacentItems } = useLibraryStore()
  const { addToHistory, updateProgress } = useHistoryStore()
  const { downloads, getLocalPath } = useDownloadStore()

  const videoRef = useRef<Video>(null)
  const controlsTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)
  const swipeAnim = useRef(new Animated.Value(0)).current
  const controlsOpacity = useRef(new Animated.Value(1)).current
  const seekIndicatorOpacity = useRef(new Animated.Value(0)).current

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

  // Gesture state
  const [gestureType, setGestureType] = useState<'none' | 'volume' | 'brightness' | 'seek' | 'swipe'>('none')
  const [gestureValue, setGestureValue] = useState(0)
  const [brightness, setBrightness] = useState(0.5)
  const [swipeDirection, setSwipeDirection] = useState<'left' | 'right' | null>(null)
  const [seekDelta, setSeekDelta] = useState(0)
  const gestureStartValue = useRef(0)
  const gestureStartTime = useRef(0)
  const lastTapTime = useRef(0)
  const lastTapX = useRef(0)

  // Adjacent items for navigation
  const adjacentItems = useMemo(() => getAdjacentItems(id!), [id, getAdjacentItems])

  const navigateToVideo = useCallback((direction: 'prev' | 'next') => {
    const targetItem = direction === 'prev' ? adjacentItems.prev : adjacentItems.next
    if (targetItem) {
      if (Platform.OS === 'ios') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
      router.replace(`/player/${targetItem.id}`)
    }
  }, [adjacentItems])

  // Initialize brightness
  useEffect(() => {
    Brightness.getBrightnessAsync().then((b: number) => setBrightness(b)).catch(() => {})
  }, [])

  // Pan responder for gestures
  const panResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => !isLocked,
    onMoveShouldSetPanResponder: (_, gestureState) => {
      if (isLocked) return false
      return Math.abs(gestureState.dy) > GESTURE_THRESHOLD || Math.abs(gestureState.dx) > GESTURE_THRESHOLD
    },
    onPanResponderGrant: (evt, gestureState) => {
      const touchX = evt.nativeEvent.pageX
      const touchY = evt.nativeEvent.pageY

      // If touch is in bottom third, it's a seek gesture
      if (touchY > SCREEN_HEIGHT * 0.7) {
        setGestureType('seek')
        gestureStartTime.current = currentTime
        seekIndicatorOpacity.setValue(1)
      } else if (touchX < SCREEN_WIDTH / 2) {
        setGestureType('brightness')
        gestureStartValue.current = brightness
      } else {
        setGestureType('volume')
        gestureStartValue.current = volume
      }
    },
    onPanResponderMove: (evt, gestureState) => {
      const { dx, dy } = gestureState

      // Horizontal swipe for seek (bottom area) or navigation
      if (gestureType === 'seek') {
        const seekSeconds = (dx / SCREEN_WIDTH) * duration * 0.5
        setSeekDelta(seekSeconds)
        return
      }

      // Check if horizontal swipe is dominant for navigation
      if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 30) {
        setGestureType('swipe')
        setSwipeDirection(dx > 0 ? 'right' : 'left')
        swipeAnim.setValue(dx)
        return
      }

      // Vertical gestures for volume/brightness
      const change = -(dy / (SCREEN_HEIGHT * 0.5))
      const newValue = Math.max(0, Math.min(1, gestureStartValue.current + change))

      if (gestureType === 'brightness') {
        setBrightness(newValue)
        setGestureValue(newValue)
        Brightness.setBrightnessAsync(newValue).catch(() => {})
      } else if (gestureType === 'volume') {
        setVolume(newValue)
        setGestureValue(newValue)
        videoRef.current?.setVolumeAsync(newValue).catch(() => {})
      }
    },
    onPanResponderRelease: (_, gestureState) => {
      const { dx } = gestureState

      // Handle seek completion
      if (gestureType === 'seek' && seekDelta !== 0) {
        const newTime = Math.max(0, Math.min(duration, gestureStartTime.current + seekDelta))
        handleSeek(newTime)
        if (Platform.OS === 'ios') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
        setSeekDelta(0)
        Animated.timing(seekIndicatorOpacity, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }).start()
      }

      // Handle swipe navigation
      if (gestureType === 'swipe' && Math.abs(dx) > SCREEN_WIDTH * 0.25) {
        if (dx > 0 && adjacentItems.prev) {
          navigateToVideo('prev')
        } else if (dx < 0 && adjacentItems.next) {
          navigateToVideo('next')
        }
      }

      Animated.spring(swipeAnim, {
        toValue: 0,
        useNativeDriver: true,
      }).start()

      setTimeout(() => {
        setGestureType('none')
        setSwipeDirection(null)
      }, 300)
    },
  }), [brightness, volume, gestureType, adjacentItems, navigateToVideo, swipeAnim, isLocked, duration, currentTime, seekDelta])

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
        const localPath = getLocalPath(id!)
        const isOfflineMode = offline === 'true' || !serverUrl

        if (isOfflineMode && localPath) {
          // Use downloaded local file
          setMediaUrl(localPath)
          // Get metadata from downloads store
          const downloadedMedia = downloads.find(d => d.id === id)
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
          }
        } else if (isOfflineMode && !localPath) {
          // Offline mode but media not downloaded
          setError('This media is not available offline. Please download it first.')
        } else {
          // Online streaming mode
          const url = api.getStreamUrl(id!)
          setMediaUrl(url)
          const info = await api.getMediaById(id!)
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
          }
        }
      } catch (err) {
        setError(getErrorMessage(err))
      }
    }

    if (id) loadMedia()
  }, [id, offline, serverUrl, downloads])

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
      if (status.error) setError(status.error)
      return
    }

    setIsLoading(false)
    setIsPlaying(status.isPlaying)
    const currentPos = status.positionMillis / 1000
    const totalDur = (status.durationMillis || 0) / 1000
    setCurrentTime(currentPos)
    setDuration(totalDur)

    // Update progress in history every 10 seconds
    if (id && totalDur > 0 && currentPos - lastProgressUpdate.current > 10) {
      lastProgressUpdate.current = currentPos
      updateProgress(id, currentPos / totalDur)
    }

    if (status.didJustFinish) {
      // Mark as fully watched
      if (id) updateProgress(id, 1)
      // Auto-play next or go back
      if (adjacentItems.next) {
        navigateToVideo('next')
      } else {
        router.back()
      }
    }
  }, [adjacentItems, navigateToVideo, id, updateProgress])

  // Controls
  const togglePlayPause = async () => {
    if (!videoRef.current) return
    if (Platform.OS === 'ios') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)

    if (isPlaying) {
      await videoRef.current.pauseAsync()
    } else {
      await videoRef.current.playAsync()
    }
  }

  const handleSeek = async (position: number) => {
    if (!videoRef.current) return
    await videoRef.current.setPositionAsync(position * 1000)
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
    await videoRef.current?.setRateAsync(speed, true)
  }

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
    <View style={styles.container}>
      <StatusBar hidden={isFullscreen} />

      {/* Video with gesture handling */}
      <View style={styles.videoContainer} {...panResponder.panHandlers}>
        <TouchableWithoutFeedback onPress={handleTap}>
          <View style={styles.videoWrapper}>
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
                onError={(err) => setError(err)}
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

        {/* Gesture Indicators */}
        {gestureType === 'volume' && (
          <View style={styles.gestureIndicator}>
            <Ionicons
              name={gestureValue === 0 ? 'volume-mute' : gestureValue < 0.5 ? 'volume-low' : 'volume-high'}
              size={32}
              color="#fff"
            />
            <View style={styles.gestureBar}>
              <View style={[styles.gestureBarFill, { height: `${gestureValue * 100}%` }]} />
            </View>
            <Text style={styles.gestureText}>{Math.round(gestureValue * 100)}%</Text>
          </View>
        )}

        {gestureType === 'brightness' && (
          <View style={styles.gestureIndicator}>
            <Ionicons name="sunny" size={32} color="#fff" />
            <View style={styles.gestureBar}>
              <View style={[styles.gestureBarFill, { height: `${gestureValue * 100}%` }]} />
            </View>
            <Text style={styles.gestureText}>{Math.round(gestureValue * 100)}%</Text>
          </View>
        )}

        {/* Seek indicator */}
        {gestureType === 'seek' && (
          <Animated.View style={[styles.seekIndicator, { opacity: seekIndicatorOpacity }]}>
            <Ionicons
              name={seekDelta >= 0 ? 'play-forward' : 'play-back'}
              size={28}
              color="#fff"
            />
            <Text style={styles.seekDeltaText}>
              {seekDelta >= 0 ? '+' : ''}{formatTime(Math.abs(seekDelta))}
            </Text>
            <Text style={styles.seekTargetText}>
              {formatTime(Math.max(0, Math.min(duration, gestureStartTime.current + seekDelta)))}
            </Text>
          </Animated.View>
        )}
      </View>

      {/* Controls Overlay */}
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
                  <TouchableOpacity style={styles.iconButton} onPress={toggleLock}>
                    <Ionicons name="lock-open" size={22} color="#fff" />
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.iconButton} onPress={toggleFullscreen}>
                    <Ionicons
                      name={isFullscreen ? 'contract' : 'expand'}
                      size={24}
                      color="#fff"
                    />
                  </TouchableOpacity>
                </View>
              </View>

              {/* Center Controls */}
              <View style={styles.centerControls}>
                {/* Previous Video */}
                <TouchableOpacity
                  style={[styles.navButton, !adjacentItems.prev && styles.navButtonDisabled]}
                  onPress={() => adjacentItems.prev && navigateToVideo('prev')}
                  disabled={!adjacentItems.prev}
                >
                  <Ionicons name="play-skip-back" size={28} color={adjacentItems.prev ? '#fff' : '#52525b'} />
                </TouchableOpacity>

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

                {/* Next Video */}
                <TouchableOpacity
                  style={[styles.navButton, !adjacentItems.next && styles.navButtonDisabled]}
                  onPress={() => adjacentItems.next && navigateToVideo('next')}
                  disabled={!adjacentItems.next}
                >
                  <Ionicons name="play-skip-forward" size={28} color={adjacentItems.next ? '#fff' : '#52525b'} />
                </TouchableOpacity>
              </View>

              {/* Swipe Indicator */}
              {gestureType === 'swipe' && (
                <View style={styles.swipeIndicator}>
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
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  videoContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  videoWrapper: {
    width: '100%',
    height: '100%',
  },
  video: {
    width: '100%',
    height: '100%',
  },
  gestureIndicator: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    marginLeft: -45,
    marginTop: -85,
    width: 90,
    height: 170,
    backgroundColor: 'rgba(0,0,0,0.8)',
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
  },
  gestureBar: {
    width: 6,
    height: 80,
    backgroundColor: 'rgba(255,255,255,0.3)',
    borderRadius: 3,
    marginVertical: 10,
    overflow: 'hidden',
    justifyContent: 'flex-end',
  },
  gestureBarFill: {
    width: '100%',
    backgroundColor: '#3b82f6',
    borderRadius: 3,
  },
  gestureText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  seekIndicator: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    marginLeft: -60,
    marginTop: -50,
    width: 120,
    height: 100,
    backgroundColor: 'rgba(0,0,0,0.85)',
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
  },
  seekDeltaText: {
    color: '#3b82f6',
    fontSize: 18,
    fontWeight: '700',
    marginTop: 6,
  },
  seekTargetText: {
    color: '#71717a',
    fontSize: 13,
    marginTop: 4,
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
  navButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  navButtonDisabled: {
    opacity: 0.3,
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
