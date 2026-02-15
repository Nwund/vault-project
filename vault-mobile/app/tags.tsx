// File: vault-mobile/app/tags.tsx
// Tag browser - Browse and filter by tags

import { useState, useEffect, useCallback, useMemo, memo } from 'react'
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  Platform,
  RefreshControl,
} from 'react-native'
import { useLocalSearchParams, router } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import * as Haptics from 'expo-haptics'
import { useConnectionStore } from '@/stores/connection'
import { api } from '@/services/api'

interface TagInfo {
  name: string
  count: number
  color?: string
}

// Predefined colors for tags
const TAG_COLORS = [
  '#3b82f6', '#ef4444', '#22c55e', '#f59e0b', '#a855f7',
  '#ec4899', '#14b8a6', '#f97316', '#6366f1', '#84cc16',
]

// Memoized tag item
const TagItem = memo(({
  tag,
  isSelected,
  onPress,
}: {
  tag: TagInfo
  isSelected: boolean
  onPress: () => void
}) => (
  <TouchableOpacity
    style={[
      styles.tagItem,
      isSelected && styles.tagItemSelected,
      { borderLeftColor: tag.color || '#3b82f6' },
    ]}
    onPress={onPress}
    activeOpacity={0.7}
  >
    <View style={styles.tagInfo}>
      <View style={[styles.tagDot, { backgroundColor: tag.color || '#3b82f6' }]} />
      <Text style={[styles.tagName, isSelected && styles.tagNameSelected]}>
        {tag.name}
      </Text>
    </View>
    <View style={styles.tagCount}>
      <Text style={styles.tagCountText}>{tag.count}</Text>
      <Ionicons name="chevron-forward" size={16} color="#52525b" />
    </View>
  </TouchableOpacity>
))

export default function TagsScreen() {
  const { tag: initialTag } = useLocalSearchParams<{ tag?: string }>()
  const { isConnected } = useConnectionStore()

  const [tags, setTags] = useState<TagInfo[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedTag, setSelectedTag] = useState<string | null>(initialTag || null)

  const fetchTags = useCallback(async () => {
    if (!isConnected) return

    setIsLoading(true)
    try {
      const result = await api.getTags()
      // Convert to TagInfo with colors
      const tagInfos: TagInfo[] = (result.tags || []).map((name, index) => ({
        name,
        count: 0, // Would need API support for counts
        color: TAG_COLORS[index % TAG_COLORS.length],
      }))
      setTags(tagInfos)
    } catch (err) {
      console.error('Failed to fetch tags:', err)
    } finally {
      setIsLoading(false)
    }
  }, [isConnected])

  useEffect(() => {
    fetchTags()
  }, [fetchTags])

  // Filter tags by search
  const filteredTags = useMemo(() => {
    if (!searchQuery) return tags
    const query = searchQuery.toLowerCase()
    return tags.filter(tag => tag.name.toLowerCase().includes(query))
  }, [tags, searchQuery])

  // Group tags alphabetically
  const groupedTags = useMemo(() => {
    const groups: Record<string, TagInfo[]> = {}
    for (const tag of filteredTags) {
      const letter = tag.name[0]?.toUpperCase() || '#'
      if (!groups[letter]) groups[letter] = []
      groups[letter].push(tag)
    }
    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b))
  }, [filteredTags])

  const handleTagPress = (tag: TagInfo) => {
    if (Platform.OS === 'ios') Haptics.selectionAsync()
    setSelectedTag(tag.name)
    // Navigate to library with tag filter
    router.push({ pathname: '/', params: { filterTag: tag.name } })
  }

  const handleRefresh = useCallback(() => {
    if (Platform.OS === 'ios') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    fetchTags()
  }, [fetchTags])

  if (!isConnected) {
    return (
      <View style={styles.centerContainer}>
        <View style={styles.emptyIconContainer}>
          <Ionicons name="cloud-offline" size={56} color="#3b82f6" />
        </View>
        <Text style={styles.emptyTitle}>Not Connected</Text>
        <Text style={styles.emptySubtitle}>
          Connect to your desktop Vault to browse tags
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
      {/* Search */}
      <View style={styles.searchContainer}>
        <Ionicons name="search" size={18} color="#71717a" style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search tags..."
          placeholderTextColor="#52525b"
          value={searchQuery}
          onChangeText={setSearchQuery}
          autoCorrect={false}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity
            onPress={() => setSearchQuery('')}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="close-circle" size={18} color="#52525b" />
          </TouchableOpacity>
        )}
      </View>

      {/* Stats */}
      <View style={styles.statsBar}>
        <Text style={styles.statsText}>
          {filteredTags.length} {filteredTags.length === 1 ? 'tag' : 'tags'}
          {searchQuery && ` matching "${searchQuery}"`}
        </Text>
      </View>

      {/* Tags List */}
      <FlatList
        data={filteredTags}
        renderItem={({ item }) => (
          <TagItem
            tag={item}
            isSelected={selectedTag === item.name}
            onPress={() => handleTagPress(item)}
          />
        )}
        keyExtractor={(item) => item.name}
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
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        ListEmptyComponent={
          !isLoading ? (
            <View style={styles.emptyContainer}>
              <View style={styles.emptyIconContainerSmall}>
                <Ionicons name="pricetags" size={40} color="#3b82f6" />
              </View>
              <Text style={styles.emptyTitle}>No Tags Found</Text>
              <Text style={styles.emptySubtitle}>
                {searchQuery
                  ? 'Try a different search term'
                  : 'Add tags to your media on desktop to see them here'}
              </Text>
            </View>
          ) : null
        }
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
  centerContainer: {
    flex: 1,
    backgroundColor: '#09090b',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#18181b',
    marginHorizontal: 16,
    marginTop: 16,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#27272a',
  },
  searchIcon: {
    marginRight: 10,
  },
  searchInput: {
    flex: 1,
    color: '#fff',
    fontSize: 16,
    paddingVertical: Platform.OS === 'ios' ? 14 : 10,
  },
  statsBar: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  statsText: {
    color: '#52525b',
    fontSize: 13,
  },
  listContainer: {
    paddingHorizontal: 16,
  },
  tagItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#18181b',
    padding: 16,
    borderRadius: 12,
    borderLeftWidth: 4,
  },
  tagItemSelected: {
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
  },
  tagInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  tagDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  tagName: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '500',
  },
  tagNameSelected: {
    color: '#3b82f6',
  },
  tagCount: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  tagCountText: {
    color: '#52525b',
    fontSize: 14,
    fontWeight: '500',
  },
  separator: {
    height: 8,
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
  emptyIconContainerSmall: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
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
})
