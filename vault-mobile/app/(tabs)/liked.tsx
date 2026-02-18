// File: vault-mobile/app/(tabs)/liked.tsx
// Shows all liked/favorited videos and images

import { useState, useCallback, useMemo, memo } from 'react'
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  Platform,
  Image,
  RefreshControl,
} from 'react-native'
import { router } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import * as Haptics from 'expo-haptics'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useFavoritesStore, FavoriteItem } from '@/stores/favorites'
import { useConnectionStore } from '@/stores/connection'
import { useToast } from '@/contexts/toast'
import { api } from '@/services/api'

const { width: SCREEN_WIDTH } = Dimensions.get('window')
const NUM_COLUMNS = 3
const ITEM_SPACING = 2
const ITEM_WIDTH = (SCREEN_WIDTH - ITEM_SPACING * (NUM_COLUMNS + 1)) / NUM_COLUMNS

// Grid item component
const LikedItem = memo(({
  item,
  onPress,
  onRemove,
}: {
  item: FavoriteItem
  onPress: () => void
  onRemove: () => void
}) => {
  const formatDuration = (seconds?: number) => {
    if (!seconds) return ''
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  return (
    <TouchableOpacity
      style={styles.gridItem}
      onPress={onPress}
      onLongPress={() => {
        if (Platform.OS === 'ios') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
        onRemove()
      }}
      activeOpacity={0.8}
    >
      <Image
        source={{ uri: api.getThumbUrl(item.id) }}
        style={styles.thumbnail}
        resizeMode="cover"
      />

      {/* Type indicator - bright colored icons */}
      <View style={styles.typeIndicator}>
        <Ionicons
          name={item.type === 'video' ? 'videocam' : item.type === 'gif' ? 'infinite' : 'image'}
          size={14}
          color={item.type === 'video' ? '#3b82f6' : item.type === 'gif' ? '#a855f7' : '#22c55e'}
        />
      </View>

      {/* Duration badge for videos */}
      {item.type === 'video' && item.durationSec && (
        <View style={styles.durationBadge}>
          <Text style={styles.durationText}>{formatDuration(item.durationSec)}</Text>
        </View>
      )}

      {/* Heart indicator - always red */}
      <View style={styles.heartIndicator}>
        <Ionicons name="heart" size={16} color="#ef4444" />
      </View>
    </TouchableOpacity>
  )
})

export default function LikedScreen() {
  const { items, removeFavorite } = useFavoritesStore()
  const { isConnected } = useConnectionStore()
  const toast = useToast()
  const insets = useSafeAreaInsets()
  const [refreshing, setRefreshing] = useState(false)

  // Sort by most recently added
  const sortedItems = useMemo(() => {
    return [...items].sort((a, b) => b.addedAt - a.addedAt)
  }, [items])

  const handleItemPress = useCallback((item: FavoriteItem) => {
    if (Platform.OS === 'ios') Haptics.selectionAsync()
    if (item.type === 'video') {
      router.push(`/player/${item.id}`)
    } else {
      router.push({ pathname: '/viewer/[id]', params: { id: item.id } })
    }
  }, [])

  const handleRemove = useCallback((item: FavoriteItem) => {
    if (Platform.OS === 'ios') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)
    removeFavorite(item.id)
    toast.info('Removed from Favorites')
  }, [removeFavorite, toast])

  const handleRefresh = useCallback(() => {
    setRefreshing(true)
    // Just trigger a re-render by waiting a moment
    setTimeout(() => setRefreshing(false), 500)
  }, [])

  const renderItem = useCallback(({ item }: { item: FavoriteItem }) => (
    <LikedItem
      item={item}
      onPress={() => handleItemPress(item)}
      onRemove={() => handleRemove(item)}
    />
  ), [handleItemPress, handleRemove])

  const keyExtractor = useCallback((item: FavoriteItem) => item.id, [])

  if (items.length === 0) {
    return (
      <View style={styles.centerContainer}>
        <Ionicons name="heart-outline" size={64} color="#52525b" />
        <Text style={styles.emptyTitle}>No Liked Items</Text>
        <Text style={styles.emptySubtitle}>
          Double-tap videos in the feed or long-press in library to like
        </Text>
      </View>
    )
  }

  return (
    <View style={styles.container}>
      {/* Stats header */}
      <View style={styles.statsHeader}>
        <View style={styles.statItem}>
          <Ionicons name="heart" size={18} color="#ef4444" />
          <Text style={styles.statValue}>{items.length}</Text>
          <Text style={styles.statLabel}>Liked</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Ionicons name="videocam" size={18} color="#3b82f6" />
          <Text style={styles.statValue}>
            {items.filter(i => i.type === 'video').length}
          </Text>
          <Text style={styles.statLabel}>Videos</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Ionicons name="image" size={18} color="#22c55e" />
          <Text style={styles.statValue}>
            {items.filter(i => i.type === 'image' || i.type === 'gif').length}
          </Text>
          <Text style={styles.statLabel}>Images</Text>
        </View>
      </View>

      {/* Grid */}
      <FlatList
        data={sortedItems}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        numColumns={NUM_COLUMNS}
        contentContainerStyle={[
          styles.gridContent,
          { paddingBottom: insets.bottom + 100 },
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor="#3b82f6"
          />
        }
      />

      {/* Hint at bottom */}
      <View style={[styles.hintContainer, { bottom: insets.bottom + 90 }]}>
        <Text style={styles.hintText}>Long-press to remove from liked</Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#09090b',
  },
  centerContainer: {
    flex: 1,
    backgroundColor: '#09090b',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
    marginTop: 16,
  },
  emptySubtitle: {
    color: '#71717a',
    fontSize: 15,
    marginTop: 8,
    textAlign: 'center',
    lineHeight: 22,
  },
  statsHeader: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 24,
    backgroundColor: '#18181b',
    borderBottomWidth: 1,
    borderBottomColor: '#27272a',
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statValue: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  statLabel: {
    color: '#71717a',
    fontSize: 13,
  },
  statDivider: {
    width: 1,
    height: 20,
    backgroundColor: '#27272a',
    marginHorizontal: 20,
  },
  gridContent: {
    padding: ITEM_SPACING,
  },
  gridItem: {
    width: ITEM_WIDTH,
    height: ITEM_WIDTH * 1.3,
    margin: ITEM_SPACING / 2,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#18181b',
  },
  thumbnail: {
    width: '100%',
    height: '100%',
  },
  typeIndicator: {
    position: 'absolute',
    top: 6,
    left: 6,
    backgroundColor: 'rgba(0,0,0,0.85)',
    borderRadius: 6,
    padding: 5,
  },
  durationBadge: {
    position: 'absolute',
    bottom: 6,
    right: 6,
    backgroundColor: 'rgba(0,0,0,0.9)',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 4,
  },
  durationText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },
  heartIndicator: {
    position: 'absolute',
    top: 6,
    right: 6,
    backgroundColor: 'rgba(0,0,0,0.85)',
    borderRadius: 12,
    padding: 5,
  },
  hintContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  hintText: {
    color: '#52525b',
    fontSize: 12,
    backgroundColor: 'rgba(24, 24, 27, 0.9)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
})
