// File: vault-mobile/components/Toast.tsx
// Toast notification component

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
      // Slide in
      Animated.parallel([
        Animated.spring(slideAnim, {
          toValue: 0,
          useNativeDriver: true,
          damping: 15,
        }),
        Animated.timing(opacityAnim, {
          toValue: 1,
          duration: 200,
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
          top: insets.top + 16,
          transform: [{ translateY: slideAnim }],
          opacity: opacityAnim,
        },
      ]}
    >
      <TouchableOpacity
        style={[styles.toast, { backgroundColor: config.bg }]}
        onPress={dismiss}
        activeOpacity={0.9}
      >
        <View style={styles.iconContainer}>
          <Ionicons name={config.icon as any} size={24} color={config.color} />
        </View>
        <View style={styles.content}>
          <Text style={[styles.title, { color: config.color }]}>{title}</Text>
          {message && <Text style={styles.message}>{message}</Text>}
        </View>
        <TouchableOpacity style={styles.closeButton} onPress={dismiss}>
          <Ionicons name="close" size={18} color="#71717a" />
        </TouchableOpacity>
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
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 14,
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 8,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    flex: 1,
  },
  title: {
    fontSize: 15,
    fontWeight: '600',
  },
  message: {
    color: '#a1a1aa',
    fontSize: 13,
    marginTop: 2,
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
})
