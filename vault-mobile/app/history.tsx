// File: vault-mobile/app/history.tsx
// Watch History screen - View recently watched items

import { useCallback, memo } from 'react'
import {
  View,
  Text,
  FlatList,
  Image,
  TouchableOpacity,
  StyleSheet,
  Platform,
  Alert,
} from 'react-native'
import { router } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import * as Haptics from 'expo-haptics'
import { useHistoryStore, type HistoryItem } from '@/stores/history'
import { api } from '@/services/api'

// Memoized history item
const HistoryCard = memo(({
  item,
  onPress,
  onRemove,
}: {
  item: HistoryItem
  onPress: () => void
  onRemove: () => void
}) => {
  const formatDuration = (seconds?: number) => {
    if (!seconds) return ''
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp)
    const now = new Date()
    const diff = now.getTime() - date.getTime()

    if (diff < 60000) return 'Just now'
    if (diff < 3600000) return `${Math.floor(diff / 60000)} min ago`
    if (diff < 86400000) return `${Math.floor(diff / 3600000)} hours ago`
    if (diff < 172800000) return 'Yesterday'
    if (diff < 604800000) return `${Math.floor(diff / 86400000)} days ago`
    return date.toLocaleDateString()
  }

  const progressPercent = (item.progress || 0) * 100

  return (
    <TouchableOpacity
      style={styles.historyCard}
      onPress={onPress}
      activeOpacity={0.8}
    >
      {/* Thumbnail with progress - always try to load, server generates on demand */}
      <View style={styles.thumbContainer}>
        <Image
          source={{ uri: api.getThumbUrl(item.id) }}
          style={styles.thumbnail}
          resizeMode="cover"
        />

        {/* Progress bar */}
        {item.type === 'video' && item.progress !== undefined && (
          <View style={styles.progressBar}>
            <View style={[styles.progressFill, { width: `${progressPercent}%` }]} />
          </View>
        )}

        {/* Duration */}
        {item.type === 'video' && item.durationSec && (
          <View style={styles.durationBadge}>
            <Text style={styles.durationText}>
              {formatDuration(item.durationSec)}
            </Text>
          </View>
        )}

        {/* Completed badge */}
        {item.progress && item.progress >= 0.95 && (
          <View style={styles.completedBadge}>
            <Ionicons name="checkmark" size={12} color="#fff" />
          </View>
        )}
      </View>

      {/* Info */}
      <View style={styles.infoContainer}>
        <Text style={styles.filename} numberOfLines={2}>
          {item.filename}
        </Text>
        <View style={styles.metaRow}>
          <Ionicons name="time-outline" size={12} color="#52525b" />
          <Text style={styles.metaText}>
            {formatDate(item.watchedAt)}
          </Text>
          {item.progress !== undefined && item.progress > 0 && item.progress < 0.95 && (
            <>
              <Text style={styles.metaDot}>•</Text>
              <Text style={[styles.metaText, { color: '#3b82f6' }]}>
                {Math.round(progressPercent)}% watched
              </Text>
            </>
          )}
        </View>
      </View>

      {/* Remove button */}
      <TouchableOpacity
        style={styles.removeButton}
        onPress={onRemove}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      >
        <Ionicons name="close" size={18} color="#71717a" />
      </TouchableOpacity>
    </TouchableOpacity>
  )
})

export default function HistoryScreen() {
  const { items, removeFromHistory, clearHistory } = useHistoryStore()

  const handleItemPress = useCallback((item: HistoryItem) => {
    if (Platform.OS === 'ios') Haptics.selectionAsync()
    if (item.type === 'video') {
      router.push(`/player/${item.id}`)
    } else {
      router.push({ pathname: '/viewer/[id]', params: { id: item.id } })
    }
  }, [])

  const handleRemove = useCallback((item: HistoryItem) => {
    if (Platform.OS === 'ios') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    removeFromHistory(item.id)
  }, [removeFromHistory])

  const handleClearAll = useCallback(() => {
    if (Platform.OS === 'ios') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)
    Alert.alert(
      'Clear History',
      `Remove all ${items.length} items from history?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear All',
          style: 'destructive',
          onPress: () => clearHistory(),
        },
      ]
    )
  }, [items.length, clearHistory])

  const renderItem = useCallback(({ item }: { item: HistoryItem }) => (
    <HistoryCard
      item={item}
      onPress={() => handleItemPress(item)}
      onRemove={() => handleRemove(item)}
    />
  ), [handleItemPress, handleRemove])

  // Group items by date
  const inProgressItems = items.filter(i => i.progress && i.progress > 0.05 && i.progress < 0.95)
  const recentItems = items.filter(i => !i.progress || i.progress <= 0.05 || i.progress >= 0.95)

  if (items.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <View style={styles.emptyIconContainer}>
          <Ionicons name="time-outline" size={56} color="#a855f7" />
        </View>
        <Text style={styles.emptyTitle}>No History Yet</Text>
        <Text style={styles.emptySubtitle}>
          Start watching videos and they'll appear here
        </Text>
        <TouchableOpacity
          style={styles.browseButton}
          onPress={() => router.back()}
        >
          <Ionicons name="library" size={20} color="#fff" />
          <Text style={styles.browseButtonText}>Browse Library</Text>
        </TouchableOpacity>
      </View>
    )
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{items.length}</Text>
            <Text style={styles.statLabel}>Total Watched</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{inProgressItems.length}</Text>
            <Text style={styles.statLabel}>In Progress</Text>
          </View>
        </View>

        {items.length > 0 && (
          <TouchableOpacity
            style={styles.clearAllButton}
            onPress={handleClearAll}
          >
            <Ionicons name="trash-outline" size={16} color="#a855f7" />
            <Text style={styles.clearAllText}>Clear History</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* History List */}
      <FlatList
        data={items}
        renderItem={renderItem}
        keyExtractor={(item) => `${item.id}-${item.watchedAt}`}
        contentContainerStyle={styles.listContainer}
        showsVerticalScrollIndicator={false}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        ListFooterComponent={<View style={styles.bottomPadding} />}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#09090b',
  },
  emptyContainer: {
    flex: 1,
    backgroundColor: '#09090b',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyIconContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(168, 85, 247, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  emptyTitle: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 10,
  },
  emptySubtitle: {
    color: '#71717a',
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
    paddingHorizontal: 20,
  },
  browseButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 32,
    backgroundColor: '#3b82f6',
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 14,
  },
  browseButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  header: {
    padding: 16,
    gap: 16,
  },
  statsRow: {
    flexDirection: 'row',
    backgroundColor: '#18181b',
    borderRadius: 16,
    padding: 16,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  statValue: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '700',
  },
  statLabel: {
    color: '#71717a',
    fontSize: 12,
  },
  statDivider: {
    width: 1,
    backgroundColor: '#27272a',
    marginHorizontal: 16,
  },
  clearAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    backgroundColor: 'rgba(168, 85, 247, 0.1)',
    borderRadius: 12,
  },
  clearAllText: {
    color: '#a855f7',
    fontSize: 14,
    fontWeight: '600',
  },
  listContainer: {
    paddingHorizontal: 16,
  },
  historyCard: {
    flexDirection: 'row',
    backgroundColor: '#18181b',
    borderRadius: 14,
    padding: 12,
    gap: 14,
  },
  thumbContainer: {
    width: 100,
    height: 75,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: '#27272a',
    position: 'relative',
  },
  thumbnail: {
    width: '100%',
    height: '100%',
  },
  noThumb: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  progressBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#3b82f6',
  },
  durationBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    backgroundColor: 'rgba(0,0,0,0.85)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  durationText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '600',
  },
  completedBadge: {
    position: 'absolute',
    top: 6,
    left: 6,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#22c55e',
    justifyContent: 'center',
    alignItems: 'center',
  },
  infoContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  filename: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 20,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
    gap: 5,
  },
  metaText: {
    color: '#52525b',
    fontSize: 12,
  },
  metaDot: {
    color: '#3f3f46',
  },
  removeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(113, 113, 122, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'center',
  },
  separator: {
    height: 10,
  },
  bottomPadding: {
    height: 100,
  },
})
