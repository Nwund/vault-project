// File: vault-mobile/components/QuickActions.tsx
// Quick action buttons for common operations

import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import * as Haptics from 'expo-haptics'
import { router } from 'expo-router'

interface QuickAction {
  id: string
  icon: keyof typeof Ionicons.glyphMap
  label: string
  color: string
  onPress: () => void
}

interface QuickActionsProps {
  actions?: QuickAction[]
}

const DEFAULT_ACTIONS: QuickAction[] = [
  {
    id: 'shuffle',
    icon: 'shuffle',
    label: 'Shuffle',
    color: '#3b82f6',
    onPress: () => {
      // Will be overridden by parent
    },
  },
  {
    id: 'favorites',
    icon: 'heart',
    label: 'Favorites',
    color: '#ef4444',
    onPress: () => router.push('/favorites'),
  },
  {
    id: 'history',
    icon: 'time',
    label: 'History',
    color: '#a855f7',
    onPress: () => router.push('/history'),
  },
  {
    id: 'tags',
    icon: 'pricetags',
    label: 'Tags',
    color: '#22c55e',
    onPress: () => router.push('/tags'),
  },
]

export function QuickActions({ actions = DEFAULT_ACTIONS }: QuickActionsProps) {
  const handlePress = (action: QuickAction) => {
    if (Platform.OS === 'ios') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    }
    action.onPress()
  }

  return (
    <View style={styles.container}>
      {actions.map((action) => (
        <TouchableOpacity
          key={action.id}
          style={styles.actionButton}
          onPress={() => handlePress(action)}
          activeOpacity={0.7}
        >
          <View
            style={[
              styles.iconContainer,
              { backgroundColor: `${action.color}20` },
            ]}
          >
            <Ionicons name={action.icon} size={22} color={action.color} />
          </View>
          <Text style={styles.label}>{action.label}</Text>
        </TouchableOpacity>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
  },
  actionButton: {
    flex: 1,
    alignItems: 'center',
    padding: 12,
    backgroundColor: '#18181b',
    borderRadius: 14,
    gap: 8,
  },
  iconContainer: {
    width: 44,
    height: 44,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  label: {
    color: '#a1a1aa',
    fontSize: 12,
    fontWeight: '600',
  },
})
