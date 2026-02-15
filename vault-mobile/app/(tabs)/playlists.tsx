// File: vault-mobile/app/(tabs)/playlists.tsx
// Sessions/Playlists - Enhanced with better visuals

import { useState, useEffect, useCallback, useRef, memo } from 'react'
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  StyleSheet,
  Platform,
  Image,
  Animated,
} from 'react-native'
import { router } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import * as Haptics from 'expo-haptics'
import { useConnectionStore } from '@/stores/connection'
import { api } from '@/services/api'

interface Playlist {
  id: string
  name: string
  itemCount: number
  isSmart: boolean
  thumbId?: string
}

// Animated playlist item
const PlaylistItem = memo(({
  item,
  index,
  onPress,
  onPlayPress,
}: {
  item: Playlist
  index: number
  onPress: () => void
  onPlayPress: () => void
}) => {
  const fadeAnim = useRef(new Animated.Value(0)).current
  const slideAnim = useRef(new Animated.Value(20)).current

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 300,
        delay: index * 50,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 300,
        delay: index * 50,
        useNativeDriver: true,
      }),
    ]).start()
  }, [])

  const getPlaylistIcon = () => {
    if (item.isSmart) return 'sparkles'
    return 'musical-notes'
  }

  const getPlaylistColor = () => {
    if (item.isSmart) return '#a855f7'
    return '#3b82f6'
  }

  return (
    <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
      <TouchableOpacity
        style={styles.playlistCard}
        onPress={onPress}
        activeOpacity={0.8}
      >
        {/* Left section with icon */}
        <View style={[styles.playlistThumb, { backgroundColor: `${getPlaylistColor()}15` }]}>
          {item.thumbId ? (
            <Image
              source={{ uri: api.getThumbUrl(item.thumbId) }}
              style={styles.thumbImage}
            />
          ) : (
            <Ionicons
              name={getPlaylistIcon()}
              size={28}
              color={getPlaylistColor()}
            />
          )}
          {item.isSmart && (
            <View style={styles.smartBadge}>
              <Ionicons name="sparkles" size={10} color="#fff" />
            </View>
          )}
        </View>

        {/* Middle section with info */}
        <View style={styles.playlistInfo}>
          <Text style={styles.playlistName} numberOfLines={1}>
            {item.name}
          </Text>
          <View style={styles.playlistMeta}>
            <Ionicons name="layers" size={12} color="#52525b" />
            <Text style={styles.playlistMetaText}>
              {item.itemCount} {item.itemCount === 1 ? 'item' : 'items'}
            </Text>
            {item.isSmart && (
              <>
                <Text style={styles.metaDot}>•</Text>
                <Text style={[styles.playlistMetaText, { color: '#a855f7' }]}>Smart</Text>
              </>
            )}
          </View>
        </View>

        {/* Right section with play button */}
        <TouchableOpacity
          style={[styles.playButton, { backgroundColor: `${getPlaylistColor()}20` }]}
          onPress={onPlayPress}
        >
          <Ionicons name="play" size={20} color={getPlaylistColor()} />
        </TouchableOpacity>
      </TouchableOpacity>
    </Animated.View>
  )
})

export default function PlaylistsScreen() {
  const { isConnected } = useConnectionStore()
  const [playlists, setPlaylists] = useState<Playlist[]>([])
  const [isLoading, setIsLoading] = useState(false)

  const fetchPlaylists = useCallback(async () => {
    if (!isConnected) return

    setIsLoading(true)
    try {
      const result = await api.getPlaylists()
      setPlaylists(result.items || [])
    } catch (err) {
      console.error('Failed to fetch playlists:', err)
    } finally {
      setIsLoading(false)
    }
  }, [isConnected])

  useEffect(() => {
    fetchPlaylists()
  }, [fetchPlaylists])

  const handleRefresh = useCallback(() => {
    if (Platform.OS === 'ios') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    fetchPlaylists()
  }, [fetchPlaylists])

  const handlePlaylistPress = (playlist: Playlist) => {
    if (Platform.OS === 'ios') Haptics.selectionAsync()
    router.push(`/player/${playlist.id}?playlist=true`)
  }

  const handlePlayPress = (playlist: Playlist) => {
    if (Platform.OS === 'ios') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
    router.push(`/player/${playlist.id}?playlist=true&autoplay=true`)
  }

  const renderPlaylist = useCallback(({ item, index }: { item: Playlist; index: number }) => (
    <PlaylistItem
      item={item}
      index={index}
      onPress={() => handlePlaylistPress(item)}
      onPlayPress={() => handlePlayPress(item)}
    />
  ), [handlePlaylistPress, handlePlayPress])

  if (!isConnected) {
    return (
      <View style={styles.centerContainer}>
        <View style={styles.emptyIconContainer}>
          <Ionicons name="cloud-offline" size={56} color="#3b82f6" />
        </View>
        <Text style={styles.emptyTitle}>Not Connected</Text>
        <Text style={styles.emptySubtitle}>
          Connect to your desktop Vault to view sessions
        </Text>
        <TouchableOpacity
          style={styles.connectButton}
          onPress={() => router.push('/connect')}
        >
          <Ionicons name="link" size={20} color="#fff" />
          <Text style={styles.connectButtonText}>Connect Now</Text>
        </TouchableOpacity>
      </View>
    )
  }

  return (
    <View style={styles.container}>
      {/* Header Stats */}
      {playlists.length > 0 && (
        <View style={styles.headerStats}>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{playlists.length}</Text>
            <Text style={styles.statLabel}>Sessions</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statValue}>
              {playlists.filter(p => p.isSmart).length}
            </Text>
            <Text style={styles.statLabel}>Smart</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statValue}>
              {playlists.reduce((sum, p) => sum + p.itemCount, 0)}
            </Text>
            <Text style={styles.statLabel}>Total Items</Text>
          </View>
        </View>
      )}

      <FlatList
        data={playlists}
        renderItem={renderPlaylist}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContainer}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isLoading}
            onRefresh={handleRefresh}
            tintColor="#3b82f6"
            colors={['#3b82f6']}
          />
        }
        ListEmptyComponent={
          !isLoading ? (
            <View style={styles.emptyContainer}>
              <View style={styles.emptyIconContainer}>
                <Ionicons name="musical-notes" size={48} color="#3b82f6" />
              </View>
              <Text style={styles.emptyTitle}>No Sessions</Text>
              <Text style={styles.emptySubtitle}>
                Create playlists on your desktop Vault to see them here
              </Text>
            </View>
          ) : null
        }
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        ListFooterComponent={<View style={styles.bottomPadding} />}
      />

      {/* Floating Action Button */}
      {playlists.length > 0 && (
        <TouchableOpacity
          style={styles.fab}
          onPress={() => {
            if (Platform.OS === 'ios') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
            // Play random playlist
            const random = playlists[Math.floor(Math.random() * playlists.length)]
            router.push(`/player/${random.id}?playlist=true&autoplay=true`)
          }}
        >
          <Ionicons name="shuffle" size={24} color="#fff" />
        </TouchableOpacity>
      )}
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
  headerStats: {
    flexDirection: 'row',
    backgroundColor: '#18181b',
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 16,
    padding: 16,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '700',
  },
  statLabel: {
    color: '#71717a',
    fontSize: 12,
    marginTop: 4,
  },
  statDivider: {
    width: 1,
    backgroundColor: '#27272a',
    marginHorizontal: 12,
  },
  listContainer: {
    padding: 16,
    paddingTop: 12,
  },
  playlistCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#18181b',
    padding: 14,
    borderRadius: 14,
  },
  playlistThumb: {
    width: 56,
    height: 56,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
    overflow: 'hidden',
  },
  thumbImage: {
    width: '100%',
    height: '100%',
  },
  smartBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#a855f7',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#18181b',
  },
  playlistInfo: {
    flex: 1,
    marginLeft: 14,
  },
  playlistName: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  playlistMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
    gap: 5,
  },
  playlistMetaText: {
    color: '#52525b',
    fontSize: 13,
  },
  metaDot: {
    color: '#3f3f46',
    fontSize: 13,
  },
  playButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  separator: {
    height: 10,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 80,
  },
  emptyIconContainer: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  emptyTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 8,
  },
  emptySubtitle: {
    color: '#71717a',
    fontSize: 15,
    textAlign: 'center',
    paddingHorizontal: 40,
    lineHeight: 22,
  },
  connectButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 28,
    backgroundColor: '#3b82f6',
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 14,
  },
  connectButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  bottomPadding: {
    height: 100,
  },
  fab: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 110 : 80,
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#3b82f6',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#3b82f6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 8,
  },
})
