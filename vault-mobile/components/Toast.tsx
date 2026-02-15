// File: vault-mobile/components/Toast.tsx
// Toast notification component with blur effect

import { useEffect, useRef } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Platform,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { BlurView } from 'expo-blur'
import * as Haptics from 'expo-haptics'

type ToastType = 'success' | 'error' | 'warning' | 'info'

interface ToastProps {
  visible: boolean
  type?: ToastType
  title: string
  message?: string
  duration?: number
  onDismiss: () => void
}

const TOAST_CONFIG: Record<ToastType, { icon: string; color: string; bg: string }> = {
  success: {
    icon: 'checkmark-circle',
    color: '#22c55e',
    bg: 'rgba(34, 197, 94, 0.15)',
  },
  error: {
    icon: 'alert-circle',
    color: '#ef4444',
    bg: 'rgba(239, 68, 68, 0.15)',
  },
  warning: {
    icon: 'warning',
    color: '#f59e0b',
    bg: 'rgba(245, 158, 11, 0.15)',
  },
  info: {
    icon: 'information-circle',
    color: '#3b82f6',
    bg: 'rgba(59, 130, 246, 0.15)',
  },
}

export function Toast({
  visible,
  type = 'info',
  title,
  message,
  duration = 3000,
  onDismiss,
}: ToastProps) {
  const insets = useSafeAreaInsets()
  const slideAnim = useRef(new Animated.Value(-100)).current
  const opacityAnim = useRef(new Animated.Value(0)).current

  useEffect(() => {
    if (visible) {
      // Haptic feedback on show
      if (Platform.OS === 'ios') {
        if (type === 'error') {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
        } else if (type === 'success') {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
        } else {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
        }
      }

      // Slide in with bounce
      Animated.parallel([
        Animated.spring(slideAnim, {
          toValue: 0,
          useNativeDriver: true,
          damping: 12,
          stiffness: 180,
        }),
        Animated.timing(opacityAnim, {
          toValue: 1,
          duration: 250,
          useNativeDriver: true,
        }),
      ]).start()

      // Auto dismiss
      if (duration > 0) {
        const timer = setTimeout(() => {
          dismiss()
        }, duration)
        return () => clearTimeout(timer)
      }
    } else {
      // Slide out
      dismiss()
    }
  }, [visible])

  const dismiss = () => {
    Animated.parallel([
      Animated.spring(slideAnim, {
        toValue: -100,
        useNativeDriver: true,
      }),
      Animated.timing(opacityAnim, {
        toValue: 0,
        duration: 150,
        useNativeDriver: true,
      }),
    ]).start(() => onDismiss())
  }

  const config = TOAST_CONFIG[type]

  if (!visible) return null

  return (
    <Animated.View
      style={[
        styles.container,
        {
          top: insets.top + 12,
          transform: [{ translateY: slideAnim }],
          opacity: opacityAnim,
        },
      ]}
    >
      <TouchableOpacity
        onPress={dismiss}
        activeOpacity={0.95}
        style={styles.touchable}
      >
        <BlurView intensity={80} tint="dark" style={styles.blurContainer}>
          <View style={[styles.toast, { borderColor: config.color }]}>
            <View style={[styles.iconContainer, { backgroundColor: config.bg }]}>
              <Ionicons name={config.icon as any} size={22} color={config.color} />
            </View>
            <View style={styles.content}>
              <Text style={styles.title}>{title}</Text>
              {message && <Text style={styles.message}>{message}</Text>}
            </View>
            <View style={[styles.accentBar, { backgroundColor: config.color }]} />
          </View>
        </BlurView>
      </TouchableOpacity>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 16,
    right: 16,
    zIndex: 9999,
  },
  touchable: {
    borderRadius: 16,
    overflow: 'hidden',
  },
  blurContainer: {
    borderRadius: 16,
    overflow: 'hidden',
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    gap: 12,
    borderWidth: 1,
    borderRadius: 16,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    position: 'relative',
    overflow: 'hidden',
  },
  iconContainer: {
    width: 38,
    height: 38,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    flex: 1,
  },
  title: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  message: {
    color: '#a1a1aa',
    fontSize: 13,
    marginTop: 2,
  },
  accentBar: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 3,
    borderTopLeftRadius: 16,
    borderBottomLeftRadius: 16,
  },
})
