// File: vault-mobile/components/EmptyState.tsx
// Reusable empty state component

import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { Ionicons } from '@expo/vector-icons'

interface EmptyStateProps {
  icon: keyof typeof Ionicons.glyphMap
  iconColor?: string
  title: string
  subtitle: string
  actionLabel?: string
  actionIcon?: keyof typeof Ionicons.glyphMap
  onAction?: () => void
}

export function EmptyState({
  icon,
  iconColor = '#3b82f6',
  title,
  subtitle,
  actionLabel,
  actionIcon,
  onAction,
}: EmptyStateProps) {
  return (
    <View style={styles.container}>
      <View style={[styles.iconContainer, { backgroundColor: `${iconColor}15` }]}>
        <Ionicons name={icon} size={48} color={iconColor} />
      </View>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.subtitle}>{subtitle}</Text>
      {actionLabel && onAction && (
        <TouchableOpacity style={styles.actionButton} onPress={onAction}>
          {actionIcon && <Ionicons name={actionIcon} size={18} color="#fff" />}
          <Text style={styles.actionButtonText}>{actionLabel}</Text>
        </TouchableOpacity>
      )}
    </View>
  )
}

// Pre-configured empty states for common scenarios
export function NotConnectedState({ onConnect }: { onConnect?: () => void }) {
  return (
    <EmptyState
      icon="cloud-offline"
      iconColor="#f59e0b"
      title="Not Connected"
      subtitle="Connect to your desktop Vault to browse your library"
      actionLabel="Connect Now"
      onAction={onConnect}
    />
  )
}

export function NoVideosState({ onRefresh }: { onRefresh?: () => void }) {
  return (
    <EmptyState
      icon="videocam-off"
      iconColor="#52525b"
      title="No Videos Found"
      subtitle="Videos in supported formats (MP4, MOV) will appear here"
      actionLabel="Refresh"
      onAction={onRefresh}
    />
  )
}

export function NoFavoritesState({ onBrowse }: { onBrowse?: () => void }) {
  return (
    <EmptyState
      icon="heart-outline"
      iconColor="#ef4444"
      title="No Favorites Yet"
      subtitle="Double-tap videos or tap the heart icon to add favorites"
      actionLabel="Browse Library"
      onAction={onBrowse}
    />
  )
}

export function NoDownloadsState({ onBrowse }: { onBrowse?: () => void }) {
  return (
    <EmptyState
      icon="cloud-download-outline"
      iconColor="#3b82f6"
      title="No Downloads"
      subtitle="Download videos to watch offline when not connected"
      actionLabel="Browse Library"
      onAction={onBrowse}
    />
  )
}

export function NoHistoryState({ onBrowse }: { onBrowse?: () => void }) {
  return (
    <EmptyState
      icon="time-outline"
      iconColor="#8b5cf6"
      title="No Watch History"
      subtitle="Videos you watch will appear here"
      actionLabel="Start Watching"
      onAction={onBrowse}
    />
  )
}

export function NetworkErrorState({ onRetry }: { onRetry?: () => void }) {
  return (
    <EmptyState
      icon="wifi-outline"
      iconColor="#ef4444"
      title="Connection Error"
      subtitle="Unable to reach your Vault server. Check your connection and try again."
      actionLabel="Retry"
      onAction={onRetry}
    />
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  iconContainer: {
    width: 96,
    height: 96,
    borderRadius: 48,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 8,
  },
  subtitle: {
    color: '#71717a',
    fontSize: 15,
    textAlign: 'center',
    paddingHorizontal: 20,
    lineHeight: 22,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 28,
    backgroundColor: '#3b82f6',
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 14,
  },
  actionButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
})
