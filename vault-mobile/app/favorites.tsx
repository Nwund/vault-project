// File: vault-mobile/app/favorites.tsx
// Favorites screen - View and manage saved favorites

import { useState, useCallback, memo } from 'react'
import {
  View,
  Text,
  FlatList,
  Image,
  TouchableOpacity,
  StyleSheet,
  Platform,
  Animated,
  Alert,
} from 'react-native'
import { router } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import * as Haptics from 'expo-haptics'
import { useFavoritesStore, type FavoriteItem } from '@/stores/favorites'
import { api } from '@/services/api'

// Memoized favorite item
const FavoriteCard = memo(({
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

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp)
    const now = new Date()
    const diff = now.getTime() - date.getTime()

    if (diff < 86400000) return 'Today'
    if (diff < 172800000) return 'Yesterday'
    if (diff < 604800000) return `${Math.floor(diff / 86400000)} days ago`
    return date.toLocaleDateString()
  }

  return (
    <TouchableOpacity
      style={styles.favoriteCard}
      onPress={onPress}
      activeOpacity={0.8}
    >
      {/* Thumbnail */}
      <View style={styles.thumbContainer}>
        {item.hasThumb ? (
          <Image
            source={{ uri: api.getThumbUrl(item.id) }}
            style={styles.thumbnail}
            resizeMode="cover"
          />
        ) : (
          <View style={[styles.thumbnail, styles.noThumb]}>
            <Ionicons
              name={item.type === 'video' ? 'videocam' : 'image'}
              size={28}
              color="#52525b"
            />
          </View>
        )}

        {/* Type badge */}
        {item.type === 'video' && (
          <View style={styles.playBadge}>
            <Ionicons name="play" size={12} color="#fff" />
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
      </View>

      {/* Info */}
      <View style={styles.infoContainer}>
        <Text style={styles.filename} numberOfLines={2}>
          {item.filename}
        </Text>
        <View style={styles.metaRow}>
          <Text style={styles.metaText}>
            {item.type.charAt(0).toUpperCase() + item.type.slice(1)}
          </Text>
          <Text style={styles.metaDot}>•</Text>
          <Text style={styles.metaText}>
            Added {formatDate(item.addedAt)}
          </Text>
        </View>
      </View>

      {/* Remove button */}
      <TouchableOpacity
        style={styles.removeButton}
        onPress={onRemove}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      >
        <Ionicons name="heart-dislike" size={20} color="#ef4444" />
      </TouchableOpacity>
    </TouchableOpacity>
  )
})

export default function FavoritesScreen() {
  const { items, removeFavorite, clearAll } = useFavoritesStore()

  const handleItemPress = useCallback((item: FavoriteItem) => {
    if (Platform.OS === 'ios') Haptics.selectionAsync()
    if (item.type === 'video') {
      router.push(`/player/${item.id}`)
    } else {
      router.push({ pathname: '/viewer/[id]', params: { id: item.id } })
    }
  }, [])

  const handleRemove = useCallback((item: FavoriteItem) => {
    if (Platform.OS === 'ios') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    removeFavorite(item.id)
  }, [removeFavorite])

  const handleClearAll = useCallback(() => {
    if (Platform.OS === 'ios') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)
    Alert.alert(
      'Clear All Favorites',
      `Remove all ${items.length} favorites?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear All',
          style: 'destructive',
          onPress: () => clearAll(),
        },
      ]
    )
  }, [items.length, clearAll])

  const renderItem = useCallback(({ item }: { item: FavoriteItem }) => (
    <FavoriteCard
      item={item}
      onPress={() => handleItemPress(item)}
      onRemove={() => handleRemove(item)}
    />
  ), [handleItemPress, handleRemove])

  if (items.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <View style={styles.emptyIconContainer}>
          <Ionicons name="heart-outline" size={56} color="#ef4444" />
        </View>
        <Text style={styles.emptyTitle}>No Favorites Yet</Text>
        <Text style={styles.emptySubtitle}>
          Long-press any item in your library to add it to favorites
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
      {/* Header Stats */}
      <View style={styles.header}>
        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <Ionicons name="heart" size={20} color="#ef4444" />
            <Text style={styles.statValue}>{items.length}</Text>
            <Text style={styles.statLabel}>Favorites</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Ionicons name="videocam" size={20} color="#3b82f6" />
            <Text style={styles.statValue}>
              {items.filter(i => i.type === 'video').length}
            </Text>
            <Text style={styles.statLabel}>Videos</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Ionicons name="image" size={20} color="#22c55e" />
            <Text style={styles.statValue}>
              {items.filter(i => i.type === 'image' || i.type === 'gif').length}
            </Text>
            <Text style={styles.statLabel}>Images</Text>
          </View>
        </View>

        {items.length > 0 && (
          <TouchableOpacity
            style={styles.clearAllButton}
            onPress={handleClearAll}
          >
            <Ionicons name="trash-outline" size={16} color="#ef4444" />
            <Text style={styles.clearAllText}>Clear All</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Favorites List */}
      <FlatList
        data={items}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
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
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
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
    gap: 6,
  },
  statValue: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
  },
  statLabel: {
    color: '#71717a',
    fontSize: 12,
  },
  statDivider: {
    width: 1,
    backgroundColor: '#27272a',
    marginHorizontal: 12,
  },
  clearAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderRadius: 12,
  },
  clearAllText: {
    color: '#ef4444',
    fontSize: 14,
    fontWeight: '600',
  },
  listContainer: {
    paddingHorizontal: 16,
  },
  favoriteCard: {
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
  playBadge: {
    position: 'absolute',
    top: 6,
    left: 6,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  durationBadge: {
    position: 'absolute',
    bottom: 6,
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
    gap: 6,
  },
  metaText: {
    color: '#52525b',
    fontSize: 12,
  },
  metaDot: {
    color: '#3f3f46',
  },
  removeButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
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
