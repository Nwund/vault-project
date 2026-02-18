// File: vault-mobile/app/(tabs)/index.tsx
// Library tab - Enhanced media grid with better UX

import { useState, useEffect, useCallback, useMemo, memo, useRef } from 'react'
import {
  View,
  Text,
  FlatList,
  Image,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  RefreshControl,
  StyleSheet,
  Dimensions,
  Platform,
  Animated,
  Modal,
  Pressable,
  ScrollView,
  ImageBackground,
  Alert,
} from 'react-native'
import { router } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import * as Haptics from 'expo-haptics'
import { LinearGradient } from 'expo-linear-gradient'
import { useConnectionStore } from '@/stores/connection'
import { useLibraryStore } from '@/stores/library'
import { useFavoritesStore } from '@/stores/favorites'
import { useHistoryStore, type HistoryItem } from '@/stores/history'
import { useDownloadStore } from '@/stores/downloads'
import { useToast } from '@/contexts/toast'
import { api } from '@/services/api'
import { shareService } from '@/services/share'
import { cacheService } from '@/services/cache'
import { QuickPlayModal } from '@/components/QuickPlayModal'
import { GridSkeleton, ContinueWatchingSkeleton } from '@/components/SkeletonLoader'
import { useBrokenMediaStore, isFormatSupported } from '@/stores/broken-media'

const { width: SCREEN_WIDTH } = Dimensions.get('window')

// Dynamic column count based on screen width
const getColumnCount = () => {
  if (SCREEN_WIDTH > 768) return 5
  if (SCREEN_WIDTH > 500) return 4
  return 3
}

interface MediaItem {
  id: string
  filename: string
  type: 'video' | 'image' | 'gif'
  durationSec?: number
  sizeBytes?: number
  hasThumb: boolean
  tags?: string[]
}

type SortOption = 'newest' | 'oldest' | 'name' | 'size' | 'duration' | 'random' | 'liked'
type TypeFilter = 'all' | 'video' | 'image' | 'gif'

const SORT_OPTIONS: { value: SortOption; label: string; icon: string }[] = [
  { value: 'newest', label: 'Newest', icon: 'time' },
  { value: 'oldest', label: 'Oldest', icon: 'hourglass' },
  { value: 'liked', label: 'Liked', icon: 'heart' },
  { value: 'name', label: 'Name', icon: 'text' },
  { value: 'size', label: 'Size', icon: 'server' },
  { value: 'duration', label: 'Duration', icon: 'timer' },
  { value: 'random', label: 'Random', icon: 'shuffle' },
]

// Memoized grid item for performance
const GridItem = memo(({
  item,
  itemWidth,
  onPress,
  onLongPress,
  onLoadError,
  onDownload,
  isDownloaded,
}: {
  item: MediaItem
  itemWidth: number
  onPress: () => void
  onLongPress: () => void
  onLoadError?: (id: string) => void
  onDownload?: () => void
  isDownloaded?: boolean
}) => {
  const [loaded, setLoaded] = useState(false)
  const [thumbUri, setThumbUri] = useState<string | null>(null)
  const [hasError, setHasError] = useState(false)
  const opacity = useState(new Animated.Value(0))[0]

  // Check if format is supported
  const formatSupported = isFormatSupported(item.filename, item.type)

  // Always try to fetch thumbnail - server generates on demand if needed
  const remoteThumbUrl = api.getThumbUrl(item.id)

  // Load cached thumbnail or use remote URL
  useEffect(() => {
    if (!remoteThumbUrl) return

    let cancelled = false

    const loadThumb = async () => {
      // Check cache first
      const cached = await cacheService.getCachedThumbPath(item.id)
      if (cancelled) return

      if (cached) {
        setThumbUri(cached)
      } else {
        // Use remote URL and cache in background
        setThumbUri(remoteThumbUrl)
        cacheService.cacheThumb(item.id, remoteThumbUrl).catch(() => {})
      }
    }

    loadThumb()
    return () => { cancelled = true }
  }, [item.id, remoteThumbUrl])

  const handleLoad = () => {
    setLoaded(true)
    setHasError(false)
    Animated.timing(opacity, {
      toValue: 1,
      duration: 200,
      useNativeDriver: true,
    }).start()
  }

  const handleError = () => {
    setHasError(true)
    // Report error but don't hide item - show placeholder instead
    onLoadError?.(item.id)
  }

  const formatDuration = (seconds?: number) => {
    if (!seconds) return ''
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  // Show unsupported format indicator instead of hiding
  const showUnsupportedWarning = !formatSupported && item.type === 'video'

  return (
    <TouchableOpacity
      style={[
        styles.gridItem,
        { width: itemWidth, height: itemWidth * 0.75 },
        showUnsupportedWarning && styles.gridItemUnsupported,
      ]}
      onPress={onPress}
      onLongPress={onLongPress}
      activeOpacity={0.8}
      delayLongPress={300}
    >
      <View style={styles.thumbContainer}>
        {/* Placeholder */}
        {(!loaded || hasError) && (
          <View style={[styles.thumbnail, styles.placeholder]}>
            <Ionicons
              name={item.type === 'video' ? 'videocam' : 'image'}
              size={28}
              color="#3f3f46"
            />
          </View>
        )}

        {/* Thumbnail */}
        {thumbUri && !hasError && (
          <Animated.Image
            source={{ uri: thumbUri }}
            style={[styles.thumbnail, { opacity }]}
            resizeMode="cover"
            onLoad={handleLoad}
            onError={handleError}
          />
        )}

        {/* Fallback for no thumb */}
        {!thumbUri && !loaded && !hasError && (
          <View style={[styles.thumbnail, styles.noThumb]}>
            <Ionicons
              name={item.type === 'video' ? 'videocam' : 'image'}
              size={32}
              color="#52525b"
            />
          </View>
        )}

        {/* Type indicator overlay - bright colored badges */}
        <View style={styles.overlay}>
          {item.type === 'video' && (
            <View style={styles.playIndicator}>
              <Ionicons name="play" size={12} color="#fff" />
            </View>
          )}
          {item.type === 'gif' && (
            <View style={styles.gifBadge}>
              <Text style={styles.gifText}>GIF</Text>
            </View>
          )}
          {item.type === 'image' && (
            <View style={styles.imageIndicator}>
              <Ionicons name="image" size={12} color="#fff" />
            </View>
          )}
        </View>

        {/* Duration badge for videos */}
        {item.type === 'video' && item.durationSec && (
          <View style={styles.durationBadge}>
            <Text style={styles.durationText}>
              {formatDuration(item.durationSec)}
            </Text>
          </View>
        )}

        {/* Unsupported format warning */}
        {showUnsupportedWarning && (
          <View style={styles.unsupportedBadge}>
            <Ionicons name="warning" size={12} color="#f59e0b" />
          </View>
        )}

        {/* Download button */}
        {onDownload && !isDownloaded && (
          <TouchableOpacity
            style={styles.downloadButton}
            onPress={onDownload}
          >
            <Ionicons name="cloud-download-outline" size={18} color="#fff" />
          </TouchableOpacity>
        )}

        {/* Downloaded indicator */}
        {isDownloaded && (
          <View style={styles.downloadedBadge}>
            <Ionicons name="checkmark-circle" size={16} color="#22c55e" />
          </View>
        )}
      </View>
    </TouchableOpacity>
  )
})

interface Playlist {
  id: string
  name: string
  itemCount: number
  isSmart?: boolean
}

export default function LibraryScreen() {
  const { isConnected } = useConnectionStore()
  const { items, isLoading, hasMore, page, sortBy, totalCount, fetchLibrary, refreshLibrary, setSortBy } = useLibraryStore()
  const { markThumbFailed, isBroken, isThumbFailed, brokenIds } = useBrokenMediaStore()
  const { items: favoriteItems, isFavorite, toggleFavorite } = useFavoritesStore()
  const { items: historyItems, addToHistory } = useHistoryStore()
  const { addToQueue, startDownload, downloadQueue, downloads } = useDownloadStore()
  const toast = useToast()

  // Get partially watched videos (progress > 5% and < 95%)
  const continueWatching = useMemo(() => {
    return historyItems
      .filter(h => h.type === 'video' && h.progress && h.progress > 0.05 && h.progress < 0.95)
      .slice(0, 10)
  }, [historyItems])

  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all')
  const [showSortMenu, setShowSortMenu] = useState(false)
  const [selectedItem, setSelectedItem] = useState<MediaItem | null>(null)
  const [showActionMenu, setShowActionMenu] = useState(false)
  const [showPlaylistPicker, setShowPlaylistPicker] = useState(false)
  const [playlists, setPlaylists] = useState<Playlist[]>([])
  const [loadingPlaylists, setLoadingPlaylists] = useState(false)
  const [isDownloading, setIsDownloading] = useState(false)
  const [isSharing, setIsSharing] = useState(false)
  const [showQuickPlay, setShowQuickPlay] = useState(false)

  // FAB animation
  const fabScale = useRef(new Animated.Value(1)).current
  const fabRotate = useRef(new Animated.Value(0)).current

  const columnCount = getColumnCount()
  const itemWidth = (SCREEN_WIDTH - 8) / columnCount - 4

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery)
    }, 300)
    return () => clearTimeout(timer)
  }, [searchQuery])

  useEffect(() => {
    if (isConnected) {
      fetchLibrary()
    }
  }, [isConnected])

  // Filter items locally
  const filteredItems = useMemo(() => {
    // When sorting by liked - use favorites store items directly
    if (sortBy === 'liked') {
      let result: MediaItem[] = favoriteItems.map(fav => ({
        id: fav.id,
        filename: fav.filename,
        type: fav.type,
        durationSec: fav.durationSec,
        hasThumb: fav.hasThumb,
      }))

      // Filter by type
      if (typeFilter !== 'all') {
        result = result.filter(item => item.type === typeFilter)
      }

      // Filter by search query
      if (debouncedSearch) {
        const query = debouncedSearch.toLowerCase()
        result = result.filter(item => item.filename.toLowerCase().includes(query))
      }

      return result
    }

    let result = items

    // Filter out broken media and unsupported formats
    result = result.filter(item => {
      // Skip items marked as broken (failed to play previously)
      if (isBroken(item.id)) return false
      // Skip videos with unsupported formats (MKV, AVI, WMV, FLV)
      if (item.type === 'video' && !isFormatSupported(item.filename, 'video')) return false
      return true
    })

    // Filter by type
    if (typeFilter !== 'all') {
      result = result.filter(item => item.type === typeFilter)
    }

    // Filter by search query
    if (debouncedSearch) {
      const query = debouncedSearch.toLowerCase()
      result = result.filter(item =>
        item.filename.toLowerCase().includes(query) ||
        item.tags?.some(tag => tag.toLowerCase().includes(query))
      )
    }

    return result
  }, [items, favoriteItems, typeFilter, debouncedSearch, brokenIds, sortBy])

  const handleRefresh = useCallback(() => {
    if (Platform.OS === 'ios') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    refreshLibrary()
  }, [])

  const handleLoadMore = useCallback(() => {
    if (hasMore && !isLoading) {
      fetchLibrary(page + 1)
    }
  }, [hasMore, isLoading, page])

  const handleItemPress = useCallback((item: MediaItem) => {
    if (Platform.OS === 'ios') Haptics.selectionAsync()
    // Add to history
    addToHistory({
      id: item.id,
      filename: item.filename,
      type: item.type,
      durationSec: item.durationSec,
      hasThumb: item.hasThumb,
    })
    // Use viewer for images/gifs, player for videos
    if (item.type === 'video') {
      router.push(`/player/${item.id}`)
    } else {
      router.push({ pathname: '/viewer/[id]', params: { id: item.id } })
    }
  }, [addToHistory])

  const handleItemLongPress = useCallback((item: MediaItem) => {
    if (Platform.OS === 'ios') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
    setSelectedItem(item)
    setShowActionMenu(true)
  }, [])

  const handleSortChange = useCallback((sort: SortOption) => {
    if (Platform.OS === 'ios') Haptics.selectionAsync()
    setSortBy(sort)
    setShowSortMenu(false)
  }, [])

  const handleTypeFilterChange = useCallback((type: TypeFilter) => {
    if (Platform.OS === 'ios') Haptics.selectionAsync()
    setTypeFilter(type)
  }, [])

  const handleQuickPlay = useCallback(() => {
    if (filteredItems.length > 0) {
      if (Platform.OS === 'ios') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
      const randomIndex = Math.floor(Math.random() * filteredItems.length)
      router.push(`/player/${filteredItems[randomIndex].id}`)
    }
  }, [filteredItems])

  const handleShowQuickPlay = useCallback(() => {
    if (Platform.OS === 'ios') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
    // Animate FAB
    Animated.sequence([
      Animated.parallel([
        Animated.spring(fabScale, { toValue: 0.9, useNativeDriver: true }),
        Animated.timing(fabRotate, { toValue: 1, duration: 200, useNativeDriver: true }),
      ]),
      Animated.spring(fabScale, { toValue: 1, useNativeDriver: true }),
    ]).start()
    fabRotate.setValue(0)
    setShowQuickPlay(true)
  }, [])

  // Handle download for offline
  const handleDownload = useCallback(async (item: MediaItem) => {
    if (Platform.OS === 'ios') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)

    // Check if already downloaded or in queue
    const isDownloaded = downloads.some(d => d.id === item.id)
    const isInQueue = downloadQueue.some(d => d.id === item.id)

    if (isDownloaded) {
      toast.info('Already Downloaded', 'This item is available offline')
      return
    }

    if (isInQueue) {
      toast.info('Already in Queue', 'This item is being downloaded')
      return
    }

    setIsDownloading(true)
    try {
      const streamUrl = api.getStreamUrl(item.id)
      addToQueue({
        id: item.id,
        filename: item.filename,
        remoteUrl: streamUrl,
        type: item.type,
        durationSec: item.durationSec,
      })
      await startDownload(item.id)
      if (Platform.OS === 'ios') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
      toast.success('Download Started', 'Available offline when complete')
    } catch (err) {
      console.error('Download failed:', err)
      toast.error('Download Failed', 'Unable to start download')
    } finally {
      setIsDownloading(false)
    }
  }, [downloads, downloadQueue, addToQueue, startDownload, toast])

  // Handle share
  const handleShare = useCallback(async (item: MediaItem) => {
    if (Platform.OS === 'ios') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)

    setIsSharing(true)
    try {
      await shareService.shareMedia({
        id: item.id,
        filename: item.filename,
        type: item.type,
      })
    } catch (err) {
      console.error('Share failed:', err)
    } finally {
      setIsSharing(false)
    }
  }, [])

  // Handle add to playlist/session
  const handleAddToPlaylist = useCallback(async () => {
    if (!selectedItem) return

    setLoadingPlaylists(true)
    try {
      const result = await api.getPlaylists()
      // Filter out smart playlists - can't add to those
      const manualPlaylists = (result.items || []).filter((p: Playlist) => !p.isSmart)
      setPlaylists(manualPlaylists)
      setShowPlaylistPicker(true)
    } catch (err) {
      console.error('Failed to load playlists:', err)
      toast.error('Error', 'Unable to load playlists')
    } finally {
      setLoadingPlaylists(false)
    }
  }, [selectedItem, toast])

  const handlePlaylistSelect = useCallback(async (playlist: Playlist) => {
    if (!selectedItem) return

    setShowPlaylistPicker(false)

    try {
      await api.addToPlaylist(playlist.id, [selectedItem.id])
      if (Platform.OS === 'ios') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
      toast.success('Added to Session', `Added to "${playlist.name}"`)
    } catch (err) {
      if (Platform.OS === 'ios') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
      toast.error('Error', 'Failed to add to playlist')
      console.error('Failed to add to playlist:', err)
    }
  }, [selectedItem, toast])

  const handleThumbLoadError = useCallback((id: string) => {
    markThumbFailed(id)
  }, [markThumbFailed])

  const renderItem = useCallback(({ item }: { item: MediaItem }) => (
    <GridItem
      item={item}
      itemWidth={itemWidth}
      onPress={() => handleItemPress(item)}
      onLongPress={() => handleItemLongPress(item)}
      onLoadError={handleThumbLoadError}
      onDownload={() => handleDownload(item)}
      isDownloaded={downloads.some(d => d.id === item.id)}
    />
  ), [itemWidth, handleItemPress, handleItemLongPress, handleThumbLoadError, handleDownload, downloads])

  const keyExtractor = useCallback((item: MediaItem) => item.id, [])

  if (!isConnected) {
    return (
      <View style={styles.centerContainer}>
        <View style={styles.emptyIconContainer}>
          <Ionicons name="cloud-offline" size={56} color="#3b82f6" />
        </View>
        <Text style={styles.emptyTitle}>Not Connected</Text>
        <Text style={styles.emptySubtitle}>
          Connect to your desktop Vault to browse your library
        </Text>
        <TouchableOpacity
          style={styles.primaryButton}
          onPress={() => router.push('/connect')}
        >
          <Ionicons name="link" size={20} color="#fff" />
          <Text style={styles.primaryButtonText}>Connect Now</Text>
        </TouchableOpacity>
      </View>
    )
  }

  return (
    <View style={styles.container}>
      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <Ionicons name="search" size={18} color="#71717a" style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search library..."
          placeholderTextColor="#52525b"
          value={searchQuery}
          onChangeText={setSearchQuery}
          returnKeyType="search"
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

      {/* Filter Bar */}
      <View style={styles.filterBar}>
        {/* Type Filters */}
        <View style={styles.typeFilters}>
          {(['all', 'video', 'image', 'gif'] as TypeFilter[]).map((type) => (
            <TouchableOpacity
              key={type}
              style={[
                styles.filterChip,
                typeFilter === type && styles.filterChipActive,
              ]}
              onPress={() => handleTypeFilterChange(type)}
            >
              {type !== 'all' && (
                <Ionicons
                  name={type === 'video' ? 'videocam' : type === 'gif' ? 'images' : 'image'}
                  size={14}
                  color={typeFilter === type ? '#fff' : '#71717a'}
                  style={{ marginRight: 4 }}
                />
              )}
              <Text
                style={[
                  styles.filterChipText,
                  typeFilter === type && styles.filterChipTextActive,
                ]}
              >
                {type === 'all' ? 'All' : type.charAt(0).toUpperCase() + type.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Sort & Quick Actions */}
        <View style={styles.actionButtons}>
          <TouchableOpacity
            style={styles.iconButton}
            onPress={handleQuickPlay}
          >
            <Ionicons name="shuffle" size={20} color="#3b82f6" />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.sortButton}
            onPress={() => setShowSortMenu(true)}
          >
            <Ionicons name="swap-vertical" size={16} color="#a1a1aa" />
            <Text style={styles.sortButtonText}>
              {SORT_OPTIONS.find(o => o.value === sortBy)?.label}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Continue Watching Section */}
      {continueWatching.length > 0 && (
        <View style={styles.continueSection}>
          <Text style={styles.continueSectionTitle}>Continue Watching</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.continueScrollContent}
          >
            {continueWatching.map((item) => (
              <TouchableOpacity
                key={item.id}
                style={styles.continueItem}
                onPress={() => {
                  if (Platform.OS === 'ios') Haptics.selectionAsync()
                  router.push(`/player/${item.id}`)
                }}
                activeOpacity={0.8}
              >
                <Image
                source={{ uri: api.getThumbUrl(item.id) }}
                style={styles.continueThumb}
                resizeMode="cover"
              />
                <View style={styles.continueProgress}>
                  <View style={[styles.continueProgressFill, { width: `${(item.progress || 0) * 100}%` }]} />
                </View>
                <Text style={styles.continueFilename} numberOfLines={1}>
                  {item.filename}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      {/* Stats Bar */}
      <View style={styles.statsBar}>
        <Text style={styles.statsText}>
          {filteredItems.length} {filteredItems.length === 1 ? 'item' : 'items'}
          {typeFilter !== 'all' && ` (${typeFilter}s)`}
          {totalCount > 0 && ` of ${totalCount.toLocaleString()} total`}
        </Text>
        {hasMore && (
          <Text style={styles.loadMoreHint}>Scroll to load more</Text>
        )}
      </View>

      {/* Media Grid */}
      <FlatList
        key={`grid-${columnCount}`}
        data={filteredItems}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        numColumns={columnCount}
        contentContainerStyle={styles.gridContainer}
        showsVerticalScrollIndicator={false}
        removeClippedSubviews={true}
        maxToRenderPerBatch={15}
        windowSize={5}
        refreshControl={
          <RefreshControl
            refreshing={isLoading && page === 1}
            onRefresh={handleRefresh}
            tintColor="#3b82f6"
            colors={['#3b82f6']}
          />
        }
        onEndReached={handleLoadMore}
        onEndReachedThreshold={0.3}
        ListFooterComponent={
          <>
            {isLoading && page > 1 && (
              <View style={styles.loadingFooter}>
                <ActivityIndicator size="small" color="#3b82f6" />
              </View>
            )}
            {!isLoading && hasMore && filteredItems.length > 0 && (
              <TouchableOpacity style={styles.loadMoreButton} onPress={handleLoadMore}>
                <Text style={styles.loadMoreButtonText}>Load More</Text>
              </TouchableOpacity>
            )}
            <View style={styles.bottomPadding} />
          </>
        }
        ListEmptyComponent={
          isLoading ? (
            <GridSkeleton columns={columnCount} rows={4} />
          ) : (
            <View style={styles.emptyContainer}>
              <View style={styles.emptyIconContainer}>
                <Ionicons name="images" size={48} color="#3b82f6" />
              </View>
              <Text style={styles.emptyTitle}>No Media Found</Text>
              <Text style={styles.emptySubtitle}>
                {searchQuery
                  ? 'Try a different search term'
                  : 'Your library is empty or no items match your filters'}
              </Text>
            </View>
          )
        }
      />

      {/* Sort Menu Modal */}
      <Modal
        visible={showSortMenu}
        transparent
        animationType="fade"
        onRequestClose={() => setShowSortMenu(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setShowSortMenu(false)}
        >
          <View style={styles.sortMenu}>
            <Text style={styles.sortMenuTitle}>Sort By</Text>
            {SORT_OPTIONS.map((option) => (
              <TouchableOpacity
                key={option.value}
                style={[
                  styles.sortMenuItem,
                  sortBy === option.value && styles.sortMenuItemActive,
                ]}
                onPress={() => handleSortChange(option.value)}
              >
                <Ionicons
                  name={option.icon as any}
                  size={18}
                  color={sortBy === option.value ? '#3b82f6' : '#71717a'}
                />
                <Text
                  style={[
                    styles.sortMenuItemText,
                    sortBy === option.value && styles.sortMenuItemTextActive,
                  ]}
                >
                  {option.label}
                </Text>
                {sortBy === option.value && (
                  <Ionicons name="checkmark" size={18} color="#3b82f6" />
                )}
              </TouchableOpacity>
            ))}
          </View>
        </Pressable>
      </Modal>

      {/* Action Menu Modal */}
      <Modal
        visible={showActionMenu}
        transparent
        animationType="slide"
        onRequestClose={() => setShowActionMenu(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setShowActionMenu(false)}
        >
          <View style={styles.actionMenu}>
            <View style={styles.actionMenuHandle} />
            {selectedItem && (
              <>
                {/* Thumbnail preview */}
                <View style={styles.actionMenuPreview}>
                  {selectedItem.hasThumb && (
                    <Image
                      source={{ uri: api.getThumbUrl(selectedItem.id) }}
                      style={styles.actionMenuThumb}
                      resizeMode="cover"
                    />
                  )}
                  <View style={styles.actionMenuInfo}>
                    <Text style={styles.actionMenuTitle} numberOfLines={2}>
                      {selectedItem.filename}
                    </Text>
                    <View style={styles.actionMenuMeta}>
                      <View style={styles.metaBadge}>
                        <Ionicons
                          name={selectedItem.type === 'video' ? 'videocam' : selectedItem.type === 'gif' ? 'images' : 'image'}
                          size={12}
                          color="#71717a"
                        />
                        <Text style={styles.metaBadgeText}>
                          {selectedItem.type.toUpperCase()}
                        </Text>
                      </View>
                      {selectedItem.durationSec && (
                        <Text style={styles.actionMenuDuration}>
                          {Math.floor(selectedItem.durationSec / 60)}:{(selectedItem.durationSec % 60).toString().padStart(2, '0')}
                        </Text>
                      )}
                      {selectedItem.sizeBytes && (
                        <Text style={styles.actionMenuSize}>
                          {(selectedItem.sizeBytes / (1024 * 1024)).toFixed(1)} MB
                        </Text>
                      )}
                    </View>
                  </View>
                </View>

                <View style={styles.actionMenuDivider} />

                <TouchableOpacity
                  style={styles.actionMenuItem}
                  onPress={() => {
                    setShowActionMenu(false)
                    handleItemPress(selectedItem)
                  }}
                >
                  <View style={[styles.actionMenuIcon, { backgroundColor: 'rgba(34, 197, 94, 0.15)' }]}>
                    <Ionicons name={selectedItem.type === 'video' ? 'play' : 'eye'} size={20} color="#22c55e" />
                  </View>
                  <Text style={styles.actionMenuItemText}>
                    {selectedItem.type === 'video' ? 'Play Video' : 'View Image'}
                  </Text>
                  <Ionicons name="chevron-forward" size={20} color="#3f3f46" />
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.actionMenuItem}
                  onPress={() => {
                    if (Platform.OS === 'ios') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
                    const wasFavorite = isFavorite(selectedItem.id)
                    toggleFavorite({
                      id: selectedItem.id,
                      filename: selectedItem.filename,
                      type: selectedItem.type,
                      durationSec: selectedItem.durationSec,
                      hasThumb: selectedItem.hasThumb,
                    })
                    setShowActionMenu(false)
                    toast.success(
                      wasFavorite ? 'Removed from Favorites' : 'Added to Favorites'
                    )
                  }}
                >
                  <View style={[styles.actionMenuIcon, { backgroundColor: isFavorite(selectedItem.id) ? 'rgba(239, 68, 68, 0.15)' : 'rgba(239, 68, 68, 0.15)' }]}>
                    <Ionicons
                      name={isFavorite(selectedItem.id) ? 'heart' : 'heart-outline'}
                      size={20}
                      color="#ef4444"
                    />
                  </View>
                  <Text style={styles.actionMenuItemText}>
                    {isFavorite(selectedItem.id) ? 'Remove from Favorites' : 'Add to Favorites'}
                  </Text>
                  <Ionicons name="chevron-forward" size={20} color="#3f3f46" />
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.actionMenuItem, loadingPlaylists && styles.actionMenuItemDisabled]}
                  disabled={loadingPlaylists}
                  onPress={() => {
                    setShowActionMenu(false)
                    handleAddToPlaylist()
                  }}
                >
                  <View style={[styles.actionMenuIcon, { backgroundColor: 'rgba(168, 85, 247, 0.15)' }]}>
                    {loadingPlaylists ? (
                      <ActivityIndicator size="small" color="#a855f7" />
                    ) : (
                      <Ionicons name="musical-notes" size={20} color="#a855f7" />
                    )}
                  </View>
                  <Text style={styles.actionMenuItemText}>Add to Session</Text>
                  <Ionicons name="chevron-forward" size={20} color="#3f3f46" />
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.actionMenuItem, isDownloading && styles.actionMenuItemDisabled]}
                  disabled={isDownloading}
                  onPress={() => {
                    setShowActionMenu(false)
                    handleDownload(selectedItem)
                  }}
                >
                  <View style={[styles.actionMenuIcon, { backgroundColor: 'rgba(59, 130, 246, 0.15)' }]}>
                    {isDownloading ? (
                      <ActivityIndicator size="small" color="#3b82f6" />
                    ) : (
                      <Ionicons name="cloud-download" size={20} color="#3b82f6" />
                    )}
                  </View>
                  <Text style={styles.actionMenuItemText}>Download for Offline</Text>
                  <Ionicons name="chevron-forward" size={20} color="#3f3f46" />
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.actionMenuItem, isSharing && styles.actionMenuItemDisabled]}
                  disabled={isSharing}
                  onPress={() => {
                    setShowActionMenu(false)
                    handleShare(selectedItem)
                  }}
                >
                  <View style={[styles.actionMenuIcon, { backgroundColor: 'rgba(249, 115, 22, 0.15)' }]}>
                    {isSharing ? (
                      <ActivityIndicator size="small" color="#f97316" />
                    ) : (
                      <Ionicons name="share-outline" size={20} color="#f97316" />
                    )}
                  </View>
                  <Text style={styles.actionMenuItemText}>Share</Text>
                  <Ionicons name="chevron-forward" size={20} color="#3f3f46" />
                </TouchableOpacity>
              </>
            )}
          </View>
        </Pressable>
      </Modal>

      {/* Playlist Picker Modal */}
      <Modal
        visible={showPlaylistPicker}
        animationType="slide"
        transparent
        onRequestClose={() => setShowPlaylistPicker(false)}
      >
        <Pressable
          style={styles.actionMenuOverlay}
          onPress={() => setShowPlaylistPicker(false)}
        >
          <View style={styles.actionMenuContent}>
            <View style={styles.actionMenuHeader}>
              <Text style={styles.actionMenuTitle}>Add to Session</Text>
              <TouchableOpacity onPress={() => setShowPlaylistPicker(false)}>
                <Ionicons name="close" size={24} color="#71717a" />
              </TouchableOpacity>
            </View>

            {playlists.length === 0 ? (
              <View style={styles.emptyPlaylistsContainer}>
                <Ionicons name="musical-notes-outline" size={48} color="#3f3f46" />
                <Text style={styles.emptyPlaylistsText}>No playlists available</Text>
                <Text style={styles.emptyPlaylistsSubtext}>
                  Create a playlist in the desktop app first
                </Text>
              </View>
            ) : (
              <ScrollView style={styles.playlistList}>
                {playlists.map((playlist) => (
                  <TouchableOpacity
                    key={playlist.id}
                    style={styles.playlistItem}
                    onPress={() => handlePlaylistSelect(playlist)}
                  >
                    <View style={styles.playlistIcon}>
                      <Ionicons name="musical-notes" size={20} color="#a855f7" />
                    </View>
                    <View style={styles.playlistInfo}>
                      <Text style={styles.playlistName}>{playlist.name}</Text>
                      <Text style={styles.playlistCount}>
                        {playlist.itemCount} {playlist.itemCount === 1 ? 'item' : 'items'}
                      </Text>
                    </View>
                    <Ionicons name="add-circle-outline" size={24} color="#a855f7" />
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
          </View>
        </Pressable>
      </Modal>

      {/* Floating Action Button for Quick Play */}
      {filteredItems.length > 0 && (
        <Animated.View
          style={[
            styles.fabContainer,
            {
              transform: [
                { scale: fabScale },
                { rotate: fabRotate.interpolate({
                  inputRange: [0, 1],
                  outputRange: ['0deg', '45deg'],
                }) },
              ],
            },
          ]}
        >
          <TouchableOpacity
            style={styles.fab}
            onPress={handleShowQuickPlay}
            activeOpacity={0.9}
          >
            <LinearGradient
              colors={['#3b82f6', '#8b5cf6']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.fabGradient}
            >
              <Ionicons name="flash" size={26} color="#fff" />
            </LinearGradient>
          </TouchableOpacity>
        </Animated.View>
      )}

      {/* Quick Play Modal */}
      <QuickPlayModal
        visible={showQuickPlay}
        onClose={() => setShowQuickPlay(false)}
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
    marginHorizontal: 12,
    marginTop: 8,
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
  filterBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 4,
    gap: 8,
  },
  typeFilters: {
    flexDirection: 'row',
    gap: 6,
    flexShrink: 1,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#1f1f23',
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
  actionButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(59, 130, 246, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sortButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#1f1f23',
    borderRadius: 16,
  },
  sortButtonText: {
    color: '#a1a1aa',
    fontSize: 12,
    fontWeight: '600',
  },
  statsBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  statsText: {
    color: '#52525b',
    fontSize: 12,
  },
  loadMoreHint: {
    color: '#3b82f6',
    fontSize: 12,
    fontWeight: '500',
  },
  continueSection: {
    paddingTop: 12,
  },
  continueSectionTitle: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '700',
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  continueScrollContent: {
    paddingHorizontal: 12,
    gap: 12,
  },
  continueItem: {
    width: 160,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#18181b',
  },
  continueThumb: {
    width: '100%',
    height: 90,
    backgroundColor: '#27272a',
  },
  continueProgress: {
    height: 3,
    backgroundColor: '#27272a',
  },
  continueProgressFill: {
    height: '100%',
    backgroundColor: '#3b82f6',
  },
  continueFilename: {
    color: '#a1a1aa',
    fontSize: 12,
    padding: 10,
  },
  gridContainer: {
    paddingHorizontal: 4,
    paddingBottom: 100,
  },
  gridItem: {
    margin: 2,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#18181b',
  },
  gridItemUnsupported: {
    opacity: 0.7,
  },
  unsupportedBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(245, 158, 11, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  downloadButton: {
    position: 'absolute',
    bottom: 6,
    right: 6,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#3b82f6',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.5,
    shadowRadius: 4,
    elevation: 5,
  },
  downloadedBadge: {
    position: 'absolute',
    bottom: 6,
    right: 6,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#22c55e',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 3,
    elevation: 4,
  },
  thumbContainer: {
    flex: 1,
    position: 'relative',
  },
  thumbnail: {
    width: '100%',
    height: '100%',
  },
  placeholder: {
    position: 'absolute',
    backgroundColor: '#18181b',
    justifyContent: 'center',
    alignItems: 'center',
  },
  noThumb: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#1f1f23',
  },
  overlay: {
    position: 'absolute',
    top: 4,
    left: 4,
    flexDirection: 'row',
    gap: 4,
  },
  playIndicator: {
    backgroundColor: '#3b82f6',
    borderRadius: 12,
    width: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 3,
    elevation: 4,
  },
  imageIndicator: {
    backgroundColor: '#22c55e',
    borderRadius: 12,
    width: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 3,
    elevation: 4,
  },
  gifBadge: {
    backgroundColor: '#a855f7',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 3,
    elevation: 4,
  },
  gifText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '800',
  },
  durationBadge: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    backgroundColor: 'rgba(0,0,0,0.85)',
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  durationText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '600',
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
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 28,
    backgroundColor: '#3b82f6',
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 14,
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  loadingFooter: {
    paddingVertical: 20,
    alignItems: 'center',
  },
  bottomPadding: {
    height: 100,
  },
  loadMoreButton: {
    backgroundColor: '#3b82f6',
    marginHorizontal: 16,
    marginVertical: 12,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  loadMoreButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sortMenu: {
    backgroundColor: '#1c1c1e',
    borderRadius: 16,
    padding: 8,
    width: '80%',
    maxWidth: 300,
  },
  sortMenuTitle: {
    color: '#71717a',
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  sortMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 10,
    gap: 12,
  },
  sortMenuItemActive: {
    backgroundColor: 'rgba(59, 130, 246, 0.15)',
  },
  sortMenuItemText: {
    flex: 1,
    color: '#fff',
    fontSize: 16,
  },
  sortMenuItemTextActive: {
    color: '#3b82f6',
    fontWeight: '600',
  },
  actionMenu: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#1c1c1e',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: Platform.OS === 'ios' ? 40 : 20,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  actionMenuHandle: {
    width: 40,
    height: 4,
    backgroundColor: '#3f3f46',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 16,
  },
  actionMenuPreview: {
    flexDirection: 'row',
    padding: 16,
    gap: 14,
  },
  actionMenuThumb: {
    width: 80,
    height: 60,
    borderRadius: 8,
    backgroundColor: '#27272a',
  },
  actionMenuInfo: {
    flex: 1,
    justifyContent: 'center',
  },
  actionMenuTitle: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 20,
  },
  actionMenuMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 6,
  },
  metaBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#27272a',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  metaBadgeText: {
    color: '#71717a',
    fontSize: 10,
    fontWeight: '600',
  },
  actionMenuDuration: {
    color: '#71717a',
    fontSize: 12,
  },
  actionMenuSize: {
    color: '#52525b',
    fontSize: 12,
  },
  actionMenuDivider: {
    height: 1,
    backgroundColor: '#27272a',
    marginHorizontal: 16,
  },
  actionMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 14,
  },
  actionMenuIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionMenuItemText: {
    flex: 1,
    color: '#fff',
    fontSize: 16,
  },
  actionMenuItemDisabled: {
    opacity: 0.5,
  },
  emptyPlaylistsContainer: {
    alignItems: 'center',
    paddingVertical: 32,
    paddingHorizontal: 24,
  },
  emptyPlaylistsText: {
    color: '#a1a1aa',
    fontSize: 16,
    fontWeight: '600',
    marginTop: 12,
  },
  emptyPlaylistsSubtext: {
    color: '#52525b',
    fontSize: 14,
    marginTop: 4,
    textAlign: 'center',
  },
  playlistList: {
    maxHeight: 300,
  },
  playlistItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 14,
  },
  playlistIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: 'rgba(168, 85, 247, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  playlistInfo: {
    flex: 1,
  },
  playlistName: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '500',
  },
  playlistCount: {
    color: '#71717a',
    fontSize: 13,
    marginTop: 2,
  },
  actionMenuOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  actionMenuContent: {
    backgroundColor: '#1c1c1e',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: Platform.OS === 'ios' ? 40 : 20,
    paddingHorizontal: 16,
    paddingTop: 16,
    maxHeight: '70%',
  },
  actionMenuHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  fabContainer: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 110 : 80,
    right: 20,
    shadowColor: '#3b82f6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 8,
  },
  fab: {
    width: 60,
    height: 60,
    borderRadius: 30,
    overflow: 'hidden',
  },
  fabGradient: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
})
