// File: vault-mobile/hooks/useHaptics.ts
// Hook for haptic feedback with settings awareness

import { useCallback } from 'react'
import { Platform } from 'react-native'
import * as Haptics from 'expo-haptics'
import { useSettingsStore } from '@/stores/settings'

export function useHaptics() {
  const { hapticEnabled } = useSettingsStore()

  const light = useCallback(() => {
    if (Platform.OS === 'ios' && hapticEnabled) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    }
  }, [hapticEnabled])

  const medium = useCallback(() => {
    if (Platform.OS === 'ios' && hapticEnabled) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
    }
  }, [hapticEnabled])

  const heavy = useCallback(() => {
    if (Platform.OS === 'ios' && hapticEnabled) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy)
    }
  }, [hapticEnabled])

  const selection = useCallback(() => {
    if (Platform.OS === 'ios' && hapticEnabled) {
      Haptics.selectionAsync()
    }
  }, [hapticEnabled])

  const success = useCallback(() => {
    if (Platform.OS === 'ios' && hapticEnabled) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
    }
  }, [hapticEnabled])

  const warning = useCallback(() => {
    if (Platform.OS === 'ios' && hapticEnabled) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)
    }
  }, [hapticEnabled])

  const error = useCallback(() => {
    if (Platform.OS === 'ios' && hapticEnabled) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
    }
  }, [hapticEnabled])

  return {
    light,
    medium,
    heavy,
    selection,
    success,
    warning,
    error,
    enabled: hapticEnabled,
  }
}
