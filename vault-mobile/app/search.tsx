// File: vault-mobile/app/search.tsx
// Advanced search screen with filters and history

import { useState, useEffect, useCallback, useMemo, useRef, memo } from 'react'
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  Platform,
  Animated,
  Keyboard,
  Image,
} from 'react-native'
import { router } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import * as Haptics from 'expo-haptics'
import { useConnectionStore } from '@/stores/connection'
import { useLibraryStore } from '@/stores/library'
import { api } from '@/services/api'

interface MediaItem {
  id: string
  filename: string
  type: 'video' | 'image' | 'gif'
  durationSec?: number
  hasThumb: boolean
  tags?: string[]
}

type FilterType = 'all' | 'video' | 'image' | 'gif'

// Search history - stored in memory for session
const searchHistory: string[] = []
const MAX_HISTORY = 10

// Memoized search result item
const SearchResultItem = memo(({
  item,
  onPress,
}: {
  item: MediaItem
  onPress: () => void
}) => {
  const formatDuration = (seconds?: number) => {
    if (!seconds) return ''
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  return (
    <TouchableOpacity
      style={styles.resultItem}
      onPress={onPress}
      activeOpacity={0.7}
    >
      {/* Thumbnail - always try to load, server generates on demand */}
      <View style={styles.resultThumb}>
        <Image
          source={{ uri: api.getThumbUrl(item.id) }}
          style={styles.resultImage}
          resizeMode="cover"
        />
        {item.type === 'video' && item.durationSec && (
          <View style={styles.durationBadge}>
            <Text style={styles.durationText}>{formatDuration(item.durationSec)}</Text>
          </View>
        )}
      </View>

      {/* Info */}
      <View style={styles.resultInfo}>
        <Text style={styles.resultTitle} numberOfLines={2}>
          {item.filename}
        </Text>
        <View style={styles.resultMeta}>
          <Ionicons
            name={item.type === 'video' ? 'videocam' : item.type === 'gif' ? 'infinite' : 'image'}
            size={12}
            color="#52525b"
          />
          <Text style={styles.resultMetaText}>{item.type.toUpperCase()}</Text>
          {item.tags && item.tags.length > 0 && (
            <>
              <Text style={styles.metaDot}>•</Text>
              <Text style={styles.resultMetaText}>{item.tags.length} tags</Text>
            </>
          )}
        </View>
      </View>

      {/* Arrow */}
      <Ionicons name="chevron-forward" size={20} color="#3f3f46" />
    </TouchableOpacity>
  )
})

export default function SearchScreen() {
  const { isConnected } = useConnectionStore()
  const inputRef = useRef<TextInput>(null)

  const [query, setQuery] = useState('')
  const [results, setResults] = useState<MediaItem[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [filterType, setFilterType] = useState<FilterType>('all')
  const [history, setHistory] = useState<string[]>(searchHistory)
  const [showFilters, setShowFilters] = useState(false)

  const filterAnim = useRef(new Animated.Value(0)).current

  // Auto-focus on mount
  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 100)
  }, [])

  // Toggle filters animation
  useEffect(() => {
    Animated.spring(filterAnim, {
      toValue: showFilters ? 1 : 0,
      useNativeDriver: true,
      damping: 15,
    }).start()
  }, [showFilters])

  // Search with debounce
  useEffect(() => {
    if (!query || query.length < 2) {
      setResults([])
      return
    }

    const timer = setTimeout(async () => {
      setIsLoading(true)
      try {
        const response = await api.getLibrary({
          search: query,
          type: filterType !== 'all' ? filterType : undefined,
          limit: 50,
        })
        setResults(response.items || [])
      } catch (err) {
        console.error('Search failed:', err)
        setResults([])
      } finally {
        setIsLoading(false)
      }
    }, 300)

    return () => clearTimeout(timer)
  }, [query, filterType])

  const handleSearch = useCallback((text: string) => {
    setQuery(text)
  }, [])

  const handleSubmit = useCallback(() => {
    if (query && !searchHistory.includes(query)) {
      searchHistory.unshift(query)
      if (searchHistory.length > MAX_HISTORY) {
        searchHistory.pop()
      }
      setHistory([...searchHistory])
    }
    Keyboard.dismiss()
  }, [query])

  const handleClear = useCallback(() => {
    if (Platform.OS === 'ios') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    setQuery('')
    setResults([])
    inputRef.current?.focus()
  }, [])

  const handleResultPress = useCallback((item: MediaItem) => {
    if (Platform.OS === 'ios') Haptics.selectionAsync()
    if (item.type === 'video') {
      router.push(`/player/${item.id}`)
    } else {
      router.push({ pathname: '/viewer/[id]', params: { id: item.id } })
    }
  }, [])

  const handleHistoryPress = useCallback((term: string) => {
    if (Platform.OS === 'ios') Haptics.selectionAsync()
    setQuery(term)
    inputRef.current?.focus()
  }, [])

  const handleFilterChange = useCallback((type: FilterType) => {
    if (Platform.OS === 'ios') Haptics.selectionAsync()
    setFilterType(type)
  }, [])

  const handleClose = useCallback(() => {
    if (Platform.OS === 'ios') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    router.back()
  }, [])

  const filterHeight = filterAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 56],
  })

  const filterOpacity = filterAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
  })

  if (!isConnected) {
    return (
      <View style={styles.centerContainer}>
        <Ionicons name="cloud-offline" size={56} color="#3b82f6" />
        <Text style={styles.centerTitle}>Not Connected</Text>
        <Text style={styles.centerSubtitle}>
          Connect to your desktop Vault to search
        </Text>
      </View>
    )
  }

  return (
    <View style={styles.container}>
      {/* Search Header */}
      <View style={styles.header}>
        <View style={styles.searchContainer}>
          <Ionicons name="search" size={18} color="#71717a" style={styles.searchIcon} />
          <TextInput
            ref={inputRef}
            style={styles.searchInput}
            placeholder="Search your library..."
            placeholderTextColor="#52525b"
            value={query}
            onChangeText={handleSearch}
            onSubmitEditing={handleSubmit}
            returnKeyType="search"
            autoCorrect={false}
            autoCapitalize="none"
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={handleClear}>
              <Ionicons name="close-circle" size={20} color="#52525b" />
            </TouchableOpacity>
          )}
        </View>

        <TouchableOpacity style={styles.filterButton} onPress={() => setShowFilters(!showFilters)}>
          <Ionicons
            name={showFilters ? 'options' : 'options-outline'}
            size={22}
            color={filterType !== 'all' ? '#3b82f6' : '#fff'}
          />
        </TouchableOpacity>

        <TouchableOpacity style={styles.closeButton} onPress={handleClose}>
          <Text style={styles.closeButtonText}>Cancel</Text>
        </TouchableOpacity>
      </View>

      {/* Filters */}
      <Animated.View style={[styles.filters, { height: filterHeight, opacity: filterOpacity }]}>
        {(['all', 'video', 'image', 'gif'] as FilterType[]).map((type) => (
          <TouchableOpacity
            key={type}
            style={[
              styles.filterChip,
              filterType === type && styles.filterChipActive,
            ]}
            onPress={() => handleFilterChange(type)}
          >
            {type !== 'all' && (
              <Ionicons
                name={type === 'video' ? 'videocam' : type === 'gif' ? 'infinite' : 'image'}
                size={14}
                color={filterType === type ? '#fff' : '#71717a'}
              />
            )}
            <Text
              style={[
                styles.filterChipText,
                filterType === type && styles.filterChipTextActive,
              ]}
            >
              {type === 'all' ? 'All' : type.charAt(0).toUpperCase() + type.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </Animated.View>

      {/* Results or History */}
      {query.length > 0 ? (
        <>
          {/* Results count */}
          <View style={styles.resultsHeader}>
            <Text style={styles.resultsCount}>
              {isLoading ? 'Searching...' : `${results.length} results`}
            </Text>
          </View>

          {/* Results list */}
          <FlatList
            data={results}
            renderItem={({ item }) => (
              <SearchResultItem item={item} onPress={() => handleResultPress(item)} />
            )}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.resultsList}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            ItemSeparatorComponent={() => <View style={styles.separator} />}
            ListEmptyComponent={
              !isLoading ? (
                <View style={styles.emptyContainer}>
                  <Ionicons name="search-outline" size={40} color="#52525b" />
                  <Text style={styles.emptyText}>No results found</Text>
                </View>
              ) : null
            }
            ListFooterComponent={<View style={styles.bottomPadding} />}
          />
        </>
      ) : (
        <View style={styles.historyContainer}>
          {history.length > 0 && (
            <>
              <Text style={styles.historyTitle}>Recent Searches</Text>
              {history.map((term, index) => (
                <TouchableOpacity
                  key={`${term}-${index}`}
                  style={styles.historyItem}
                  onPress={() => handleHistoryPress(term)}
                >
                  <Ionicons name="time-outline" size={18} color="#52525b" />
                  <Text style={styles.historyText}>{term}</Text>
                  <Ionicons name="arrow-forward" size={16} color="#3f3f46" />
                </TouchableOpacity>
              ))}
            </>
          )}

          {history.length === 0 && (
            <View style={styles.emptyHistoryContainer}>
              <Ionicons name="search" size={48} color="#27272a" />
              <Text style={styles.emptyHistoryTitle}>Search your library</Text>
              <Text style={styles.emptyHistoryText}>
                Find videos, images, and GIFs by filename or tags
              </Text>
            </View>
          )}
        </View>
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
  centerTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
    marginTop: 16,
  },
  centerSubtitle: {
    color: '#71717a',
    fontSize: 15,
    marginTop: 8,
    textAlign: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'ios' ? 56 : 16,
    paddingBottom: 12,
    gap: 10,
    backgroundColor: '#18181b',
  },
  searchContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#27272a',
    paddingHorizontal: 12,
    borderRadius: 10,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    color: '#fff',
    fontSize: 16,
    paddingVertical: Platform.OS === 'ios' ? 12 : 8,
  },
  filterButton: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: '#27272a',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButton: {
    paddingHorizontal: 4,
  },
  closeButtonText: {
    color: '#3b82f6',
    fontSize: 16,
    fontWeight: '500',
  },
  filters: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 8,
    overflow: 'hidden',
    alignItems: 'center',
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#27272a',
  },
  filterChipActive: {
    backgroundColor: '#3b82f6',
  },
  filterChipText: {
    color: '#71717a',
    fontSize: 13,
    fontWeight: '600',
  },
  filterChipTextActive: {
    color: '#fff',
  },
  resultsHeader: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  resultsCount: {
    color: '#52525b',
    fontSize: 13,
  },
  resultsList: {
    paddingHorizontal: 16,
  },
  resultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#18181b',
    padding: 12,
    borderRadius: 12,
    gap: 12,
  },
  resultThumb: {
    width: 72,
    height: 54,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#27272a',
  },
  resultImage: {
    width: '100%',
    height: '100%',
  },
  resultPlaceholder: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  durationBadge: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    backgroundColor: 'rgba(0,0,0,0.75)',
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 3,
  },
  durationText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '600',
  },
  resultInfo: {
    flex: 1,
  },
  resultTitle: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
    lineHeight: 18,
  },
  resultMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
    gap: 5,
  },
  resultMetaText: {
    color: '#52525b',
    fontSize: 12,
  },
  metaDot: {
    color: '#3f3f46',
  },
  separator: {
    height: 8,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 60,
    gap: 12,
  },
  emptyText: {
    color: '#52525b',
    fontSize: 15,
  },
  historyContainer: {
    padding: 16,
  },
  historyTitle: {
    color: '#71717a',
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    marginBottom: 12,
  },
  historyItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1f1f23',
  },
  historyText: {
    flex: 1,
    color: '#fff',
    fontSize: 15,
  },
  emptyHistoryContainer: {
    alignItems: 'center',
    paddingVertical: 80,
    gap: 12,
  },
  emptyHistoryTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
    marginTop: 8,
  },
  emptyHistoryText: {
    color: '#52525b',
    fontSize: 14,
    textAlign: 'center',
    paddingHorizontal: 40,
  },
  bottomPadding: {
    height: 100,
  },
})
