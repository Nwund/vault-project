// File: vault-mobile/components/ActionSheet.tsx
// Reusable action sheet / bottom menu

import { useRef, useEffect } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  Pressable,
  StyleSheet,
  Animated,
  Platform,
  Image,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import * as Haptics from 'expo-haptics'

export interface ActionSheetOption {
  id: string
  label: string
  icon: keyof typeof Ionicons.glyphMap
  iconColor?: string
  iconBgColor?: string
  destructive?: boolean
  onPress: () => void
}

interface ActionSheetProps {
  visible: boolean
  onClose: () => void
  title?: string
  subtitle?: string
  thumbUrl?: string
  options: ActionSheetOption[]
}

export function ActionSheet({
  visible,
  onClose,
  title,
  subtitle,
  thumbUrl,
  options,
}: ActionSheetProps) {
  const slideAnim = useRef(new Animated.Value(300)).current
  const fadeAnim = useRef(new Animated.Value(0)).current

  useEffect(() => {
    if (visible) {
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
          toValue: 300,
          duration: 150,
          useNativeDriver: true,
        }),
      ]).start()
    }
  }, [visible])

  const handleOptionPress = (option: ActionSheetOption) => {
    if (Platform.OS === 'ios') {
      Haptics.impactAsync(
        option.destructive
          ? Haptics.ImpactFeedbackStyle.Heavy
          : Haptics.ImpactFeedbackStyle.Light
      )
    }
    onClose()
    // Small delay for animation
    setTimeout(option.onPress, 100)
  }

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
          { transform: [{ translateY: slideAnim }] },
        ]}
      >
        <View style={styles.handle} />

        {/* Header with preview */}
        {(title || thumbUrl) && (
          <>
            <View style={styles.header}>
              {thumbUrl && (
                <Image
                  source={{ uri: thumbUrl }}
                  style={styles.headerThumb}
                  resizeMode="cover"
                />
              )}
              <View style={styles.headerInfo}>
                {title && (
                  <Text style={styles.headerTitle} numberOfLines={2}>
                    {title}
                  </Text>
                )}
                {subtitle && (
                  <Text style={styles.headerSubtitle}>{subtitle}</Text>
                )}
              </View>
            </View>
            <View style={styles.divider} />
          </>
        )}

        {/* Options */}
        <View style={styles.options}>
          {options.map((option) => (
            <TouchableOpacity
              key={option.id}
              style={styles.option}
              onPress={() => handleOptionPress(option)}
              activeOpacity={0.7}
            >
              <View
                style={[
                  styles.optionIcon,
                  {
                    backgroundColor:
                      option.iconBgColor ||
                      (option.destructive
                        ? 'rgba(239, 68, 68, 0.15)'
                        : 'rgba(59, 130, 246, 0.15)'),
                  },
                ]}
              >
                <Ionicons
                  name={option.icon}
                  size={20}
                  color={
                    option.iconColor ||
                    (option.destructive ? '#ef4444' : '#3b82f6')
                  }
                />
              </View>
              <Text
                style={[
                  styles.optionLabel,
                  option.destructive && styles.optionLabelDestructive,
                ]}
              >
                {option.label}
              </Text>
              <Ionicons name="chevron-forward" size={20} color="#3f3f46" />
            </TouchableOpacity>
          ))}
        </View>

        {/* Cancel button */}
        <TouchableOpacity
          style={styles.cancelButton}
          onPress={onClose}
        >
          <Text style={styles.cancelText}>Cancel</Text>
        </TouchableOpacity>
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
    paddingBottom: Platform.OS === 'ios' ? 40 : 20,
    paddingHorizontal: 16,
  },
  handle: {
    width: 40,
    height: 4,
    backgroundColor: '#3f3f46',
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 12,
    marginBottom: 16,
  },
  header: {
    flexDirection: 'row',
    padding: 12,
    gap: 14,
  },
  headerThumb: {
    width: 72,
    height: 54,
    borderRadius: 8,
    backgroundColor: '#27272a',
  },
  headerInfo: {
    flex: 1,
    justifyContent: 'center',
  },
  headerTitle: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 20,
  },
  headerSubtitle: {
    color: '#71717a',
    fontSize: 13,
    marginTop: 4,
  },
  divider: {
    height: 1,
    backgroundColor: '#27272a',
    marginVertical: 8,
  },
  options: {
    paddingVertical: 8,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 12,
    gap: 14,
  },
  optionIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  optionLabel: {
    flex: 1,
    color: '#fff',
    fontSize: 16,
  },
  optionLabelDestructive: {
    color: '#ef4444',
  },
  cancelButton: {
    marginTop: 8,
    paddingVertical: 16,
    backgroundColor: '#27272a',
    borderRadius: 12,
    alignItems: 'center',
  },
  cancelText: {
    color: '#71717a',
    fontSize: 16,
    fontWeight: '600',
  },
})
