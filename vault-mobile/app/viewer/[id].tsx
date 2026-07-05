// File: vault-mobile/app/viewer/[id].tsx
// Image viewer with zoom and pan gestures

import { useState, useEffect, useCallback, useRef } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  StatusBar,
  ActivityIndicator,
  Platform,
} from 'react-native'
import { useLocalSearchParams, router } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import * as Haptics from 'expo-haptics'
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  runOnJS,
} from 'react-native-reanimated'
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from 'react-native-gesture-handler'
import { useConnectionStore } from '@/stores/connection'
import { useLibraryStore } from '@/stores/library'
import { useDownloadStore } from '@/stores/downloads'
import { api } from '@/services/api'
import { getErrorMessage } from '@/utils'

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window')

export default function ImageViewerScreen() {
  const { id, offline } = useLocalSearchParams<{ id: string; offline?: string }>()
  const { token, serverUrl } = useConnectionStore()
  const { getAdjacentItems } = useLibraryStore()
  const { downloads, getLocalPath } = useDownloadStore()

  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showControls, setShowControls] = useState(true)
  const [mediaTitle, setMediaTitle] = useState<string>('')
  const [imageUri, setImageUri] = useState<string | null>(null)

  // Animation values
  const scale = useSharedValue(1)
  const savedScale = useSharedValue(1)
  const translateX = useSharedValue(0)
  const translateY = useSharedValue(0)
  const savedTranslateX = useSharedValue(0)
  const savedTranslateY = useSharedValue(0)

  const controlsTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  const adjacentItems = getAdjacentItems(id!)

  // Load media info and determine image URI
  useEffect(() => {
    const loadMedia = async () => {
      try {
        // Check for offline mode
        const localPath = getLocalPath(id!)
        const isOfflineMode = offline === 'true' || !serverUrl

        if (isOfflineMode && localPath) {
          // Use downloaded local file
          setImageUri(localPath)
          const downloadedMedia = downloads.find(d => d.id === id)
          setMediaTitle(downloadedMedia?.filename || 'Downloaded Image')
        } else if (isOfflineMode && !localPath) {
          setError('This image is not available offline. Please download it first.')
        } else {
          // Online mode - use remote URL
          setImageUri(api.getImageUrl(id!))
          const info = await api.getMediaById(id!)
          setMediaTitle(info?.filename || 'Unknown')
        }
      } catch (err) {
        setError(getErrorMessage(err))
      }
    }
    if (id) loadMedia()
  }, [id, offline, serverUrl, downloads])

  // Auto-hide controls
  useEffect(() => {
    if (showControls) {
      if (controlsTimeout.current) clearTimeout(controlsTimeout.current)
      controlsTimeout.current = setTimeout(() => {
        setShowControls(false)
      }, 3000)
    }
    return () => {
      if (controlsTimeout.current) clearTimeout(controlsTimeout.current)
    }
  }, [showControls])

  const handleClose = () => {
    if (Platform.OS === 'ios') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    router.back()
  }

  const navigateToImage = useCallback((direction: 'prev' | 'next') => {
    const targetItem = direction === 'prev' ? adjacentItems.prev : adjacentItems.next
    if (targetItem) {
      if (Platform.OS === 'ios') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
      // Reset zoom
      scale.value = withTiming(1)
      translateX.value = withTiming(0)
      translateY.value = withTiming(0)
      savedScale.value = 1
      savedTranslateX.value = 0
      savedTranslateY.value = 0
      router.replace({ pathname: '/viewer/[id]', params: { id: targetItem.id } })
    }
  }, [adjacentItems])

  const toggleControls = useCallback(() => {
    setShowControls(prev => !prev)
  }, [])

  const resetZoom = useCallback(() => {
    scale.value = withSpring(1)
    translateX.value = withSpring(0)
    translateY.value = withSpring(0)
    savedScale.value = 1
    savedTranslateX.value = 0
    savedTranslateY.value = 0
    if (Platform.OS === 'ios') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
  }, [])

  // Pinch gesture for zoom
  const pinchGesture = Gesture.Pinch()
    .onUpdate((event) => {
      'worklet'
      scale.value = savedScale.value * event.scale
    })
    .onEnd(() => {
      'worklet'
      if (scale.value < 1) {
        scale.value = withSpring(1)
        translateX.value = withSpring(0)
        translateY.value = withSpring(0)
        savedScale.value = 1
        savedTranslateX.value = 0
        savedTranslateY.value = 0
      } else if (scale.value > 5) {
        scale.value = withSpring(5)
        savedScale.value = 5
      } else {
        savedScale.value = scale.value
      }
    })

  // Pan gesture for moving when zoomed
  const panGesture = Gesture.Pan()
    .onUpdate((event) => {
      'worklet'
      if (savedScale.value > 1) {
        translateX.value = savedTranslateX.value + event.translationX
        translateY.value = savedTranslateY.value + event.translationY
      }
    })
    .onEnd((event) => {
      'worklet'
      if (savedScale.value > 1) {
        savedTranslateX.value = translateX.value
        savedTranslateY.value = translateY.value
      } else {
        // Swipe navigation when not zoomed
        if (Math.abs(event.translationX) > SCREEN_WIDTH * 0.3) {
          if (event.translationX > 0) {
            runOnJS(navigateToImage)('prev')
          } else {
            runOnJS(navigateToImage)('next')
          }
        }
      }
    })

  // Double tap to zoom
  const doubleTapGesture = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd((event) => {
      'worklet'
      if (scale.value > 1) {
        // Reset zoom
        scale.value = withSpring(1)
        translateX.value = withSpring(0)
        translateY.value = withSpring(0)
        savedScale.value = 1
        savedTranslateX.value = 0
        savedTranslateY.value = 0
      } else {
        // Zoom in to 2x centered on tap point
        scale.value = withSpring(2.5)
        savedScale.value = 2.5
        // Calculate offset to center on tap point
        const targetX = (SCREEN_WIDTH / 2 - event.x) * 1.5
        const targetY = (SCREEN_HEIGHT / 2 - event.y) * 1.5
        translateX.value = withSpring(targetX)
        translateY.value = withSpring(targetY)
        savedTranslateX.value = targetX
        savedTranslateY.value = targetY
      }
    })

  // Single tap to toggle controls
  const singleTapGesture = Gesture.Tap()
    .onEnd(() => {
      'worklet'
      runOnJS(toggleControls)()
    })

  // Combine gestures
  const composedGesture = Gesture.Simultaneous(
    pinchGesture,
    panGesture,
    Gesture.Exclusive(doubleTapGesture, singleTapGesture)
  )

  // Animated style for image
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }))

  return (
    <GestureHandlerRootView style={styles.container}>
      <StatusBar hidden />

      <GestureDetector gesture={composedGesture}>
        <View style={styles.imageContainer}>
          {imageUri && (
            <Animated.Image
              source={{
                uri: imageUri,
                // Only include auth headers for remote URLs, not local files
                headers: (offline !== 'true' && token) ? { Authorization: `Bearer ${token}` } : undefined,
              }}
              style={[styles.image, animatedStyle]}
              resizeMode="contain"
              onLoadStart={() => setIsLoading(true)}
              onLoadEnd={() => setIsLoading(false)}
              onError={() => setError('Failed to load image')}
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
      </GestureDetector>

      {/* Controls Overlay */}
      {showControls && !error && (
        <View style={styles.controlsOverlay} pointerEvents="box-none">
          {/* Top Bar */}
          <View style={styles.topBar}>
            <TouchableOpacity style={styles.iconButton} onPress={handleClose}>
              <Ionicons name="close" size={28} color="#fff" />
            </TouchableOpacity>
            <Text style={styles.title} numberOfLines={1}>
              {mediaTitle}
            </Text>
            <TouchableOpacity style={styles.iconButton} onPress={resetZoom}>
              <Ionicons name="scan" size={24} color="#fff" />
            </TouchableOpacity>
          </View>

          {/* Bottom Bar */}
          <View style={styles.bottomBar}>
            <TouchableOpacity
              style={[styles.navButton, !adjacentItems.prev && styles.navButtonDisabled]}
              onPress={() => adjacentItems.prev && navigateToImage('prev')}
              disabled={!adjacentItems.prev}
            >
              <Ionicons
                name="chevron-back"
                size={28}
                color={adjacentItems.prev ? '#fff' : '#52525b'}
              />
            </TouchableOpacity>

            <View style={styles.zoomInfo}>
              <Ionicons name="expand" size={18} color="#71717a" />
              <Text style={styles.zoomText}>Pinch to zoom • Double-tap</Text>
            </View>

            <TouchableOpacity
              style={[styles.navButton, !adjacentItems.next && styles.navButtonDisabled]}
              onPress={() => adjacentItems.next && navigateToImage('next')}
              disabled={!adjacentItems.next}
            >
              <Ionicons
                name="chevron-forward"
                size={28}
                color={adjacentItems.next ? '#fff' : '#52525b'}
              />
            </TouchableOpacity>
          </View>
        </View>
      )}
    </GestureHandlerRootView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  imageContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  image: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
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
    pointerEvents: 'box-none',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    paddingTop: Platform.OS === 'ios' ? 56 : 16,
    backgroundColor: 'rgba(0,0,0,0.5)',
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
  bottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    paddingBottom: Platform.OS === 'ios' ? 40 : 24,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  navButton: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  navButtonDisabled: {
    opacity: 0.3,
  },
  zoomInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  zoomText: {
    color: '#71717a',
    fontSize: 13,
  },
})
