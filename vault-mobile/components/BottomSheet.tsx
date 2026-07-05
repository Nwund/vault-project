// File: vault-mobile/components/BottomSheet.tsx
// Reusable bottom sheet component with drag gestures

import { useRef, useEffect, useCallback } from 'react'
import {
  View,
  Text,
  Modal,
  Pressable,
  StyleSheet,
  Animated,
  PanResponder,
  Platform,
  Dimensions,
} from 'react-native'

const { height: SCREEN_HEIGHT } = Dimensions.get('window')

interface BottomSheetProps {
  visible: boolean
  onClose: () => void
  title?: string
  height?: number | 'auto'
  children: React.ReactNode
}

export function BottomSheet({
  visible,
  onClose,
  title,
  height = 'auto',
  children,
}: BottomSheetProps) {
  const slideAnim = useRef(new Animated.Value(SCREEN_HEIGHT)).current
  const fadeAnim = useRef(new Animated.Value(0)).current
  const gestureY = useRef(new Animated.Value(0)).current

  const sheetHeight = height === 'auto' ? SCREEN_HEIGHT * 0.6 : height

  useEffect(() => {
    if (visible) {
      gestureY.setValue(0)
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.spring(slideAnim, {
          toValue: 0,
          damping: 20,
          stiffness: 300,
          useNativeDriver: true,
        }),
      ]).start()
    } else {
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 150,
          useNativeDriver: true,
        }),
        Animated.timing(slideAnim, {
          toValue: SCREEN_HEIGHT,
          duration: 150,
          useNativeDriver: true,
        }),
      ]).start()
    }
  }, [visible])

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        return gestureState.dy > 10
      },
      onPanResponderMove: (_, gestureState) => {
        if (gestureState.dy > 0) {
          gestureY.setValue(gestureState.dy)
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dy > 100 || gestureState.vy > 0.5) {
          onClose()
        } else {
          Animated.spring(gestureY, {
            toValue: 0,
            useNativeDriver: true,
          }).start()
        }
      },
    })
  ).current

  const translateY = Animated.add(slideAnim, gestureY)

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
    >
      <Animated.View style={[styles.overlay, { opacity: fadeAnim }]}>
        <Pressable style={styles.overlayPressable} onPress={onClose} />
      </Animated.View>

      <Animated.View
        style={[
          styles.sheet,
          {
            height: sheetHeight,
            transform: [{ translateY }],
          },
        ]}
      >
        {/* Handle area for drag */}
        <View style={styles.handleArea} {...panResponder.panHandlers}>
          <View style={styles.handle} />
          {title && <Text style={styles.title}>{title}</Text>}
        </View>

        {/* Content */}
        <View style={styles.content}>{children}</View>
      </Animated.View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  overlayPressable: {
    flex: 1,
  },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#1c1c1e',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  handleArea: {
    alignItems: 'center',
    paddingTop: 12,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#27272a',
  },
  handle: {
    width: 40,
    height: 4,
    backgroundColor: '#3f3f46',
    borderRadius: 2,
    marginBottom: 12,
  },
  title: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '600',
  },
  content: {
    flex: 1,
    paddingHorizontal: 16,
    paddingBottom: Platform.OS === 'ios' ? 40 : 20,
  },
})
