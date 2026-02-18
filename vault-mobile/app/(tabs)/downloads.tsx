// File: vault-mobile/app/(tabs)/downloads.tsx
// Downloads tab - Enhanced with thumbnails, animations, and haptics

import { useState, useCallback, useRef, memo, useEffect } from 'react'
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Platform,
  Image,
  Animated,
  Dimensions,
  RefreshControl,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { router } from 'expo-router'
import * as Haptics from 'expo-haptics'
import { useDownloadStore, DownloadedMedia } from '@/stores/downloads'
import { useToast } from '@/contexts/toast'
import { CardSkeleton, StatsSkeleton } from '@/components/SkeletonLoader'
import { api } from '@/services/api'

const { width: SCREEN_WIDTH } = Dimensions.get('window')

// Memoized download item for performance
const DownloadItem = memo(({
  item,
  editMode,
  onPress,
  onDelete,
}: {
  item: DownloadedMedia
  editMode: boolean
  onPress: () => void
  onDelete: () => void
}) => {
  const slideAnim = useRef(new Animated.Value(0)).current
  const scaleAnim = useRef(new Animated.Value(1)).current

  const formatSize = (bytes?: number) => {
    if (!bytes) return ''
    const mb = bytes / (1024 * 1024)
    if (mb >= 1024) {
      return `${(mb / 1024).toFixed(1)} GB`
    }
    return `${mb.toFixed(1)} MB`
  }

  const formatDuration = (seconds?: number) => {
    if (!seconds) return ''
    const hrs = Math.floor(seconds / 3600)
    const mins = Math.floor((seconds % 3600) / 60)
    const secs = Math.floor(seconds % 60)
    if (hrs > 0) {
      return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
    }
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const formatDate = (timestamp?: number) => {
    if (!timestamp) return ''
    const date = new Date(timestamp)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

    if (diffDays === 0) return 'Today'
    if (diffDays === 1) return 'Yesterday'
    if (diffDays < 7) return `${diffDays} days ago`
    return date.toLocaleDateString()
  }

  const handlePressIn = () => {
    Animated.spring(scaleAnim, {
      toValue: 0.97,
      useNativeDriver: true,
    }).start()
  }

  const handlePressOut = () => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      useNativeDriver: true,
    }).start()
  }

  return (
    <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
      <TouchableOpacity
        style={styles.downloadItem}
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        activeOpacity={0.9}
      >
        {/* Thumbnail - use item.id for server-generated thumbnails */}
        <View style={styles.thumbContainer}>
          <Image
            source={{ uri: api.getThumbUrl(item.id) }}
            style={styles.thumbnail}
            resizeMode="cover"
          />
          {item.type === 'video' && item.durationSec && (
            <View style={styles.durationBadge}>
              <Text style={styles.durationText}>{formatDuration(item.durationSec)}</Text>
            </View>
          )}
          {/* Offline indicator */}
          <View style={styles.offlineBadge}>
            <Ionicons name="checkmark-circle" size={14} color="#22c55e" />
          </View>
        </View>

        {/* Info */}
        <View style={styles.itemInfo}>
          <Text style={styles.itemTitle} numberOfLines={2}>
            {item.filename}
          </Text>
          <View style={styles.itemMetaRow}>
            <Ionicons name="folder" size={12} color="#52525b" />
            <Text style={styles.itemMeta}>{formatSize(item.sizeBytes)}</Text>
            {item.downloadedAt && (
              <>
                <Text style={styles.metaDot}>•</Text>
                <Ionicons name="time" size={12} color="#52525b" />
                <Text style={styles.itemMeta}>{formatDate(item.downloadedAt)}</Text>
              </>
            )}
          </View>
        </View>

        {/* Actions */}
        {editMode ? (
          <TouchableOpacity
            style={styles.deleteButton}
            onPress={onDelete}
          >
            <Ionicons name="trash" size={22} color="#ef4444" />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={styles.playButton} onPress={onPress}>
            <Ionicons name="play" size={20} color="#3b82f6" />
          </TouchableOpacity>
        )}
      </TouchableOpacity>
    </Animated.View>
  )
})

// Queue item with animated progress
const QueueItem = memo(({ item }: { item: { id: string; filename: string; progress: number } }) => {
  const progressAnim = useRef(new Animated.Value(item.progress)).current

  // Animate progress changes
  Animated.timing(progressAnim, {
    toValue: item.progress,
    duration: 300,
    useNativeDriver: false,
  }).start()

  const progressWidth = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  })

  return (
    <View style={styles.queueItem}>
      <View style={styles.queueThumbContainer}>
        <Image
          source={{ uri: api.getThumbUrl(item.id) }}
          style={styles.queueThumb}
          resizeMode="cover"
        />
        {/* Spinning download indicator */}
        <View style={styles.downloadingIndicator}>
          <Ionicons name="arrow-down-circle" size={16} color="#3b82f6" />
        </View>
      </View>
      <View style={styles.queueInfo}>
        <Text style={styles.queueTitle} numberOfLines={1}>
          {item.filename}
        </Text>
        <View style={styles.progressBarContainer}>
          <View style={styles.progressBarBg}>
            <Animated.View style={[styles.progressBarFill, { width: progressWidth }]} />
          </View>
          <Text style={styles.progressPercent}>{Math.round(item.progress * 100)}%</Text>
        </View>
      </View>
    </View>
  )
})

export default function DownloadsScreen() {
  const { downloads, downloadQueue, removeDownload, clearCompleted, initialize, isInitialized } = useDownloadStore()
  const toast = useToast()
  const [editMode, setEditMode] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)

  // Initialize downloads on mount
  useEffect(() => {
    initialize()
  }, [initialize])

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true)
    if (Platform.OS === 'ios') Haptics.selectionAsync()
    await initialize()
    setIsRefreshing(false)
  }, [initialize])

  const formatSize = (bytes?: number) => {
    if (!bytes) return '0 MB'
    const mb = bytes / (1024 * 1024)
    if (mb >= 1024) {
      return `${(mb / 1024).toFixed(1)} GB`
    }
    return `${mb.toFixed(0)} MB`
  }

  const handlePlayDownload = useCallback((item: DownloadedMedia) => {
    if (Platform.OS === 'ios') Haptics.selectionAsync()
    // Route to appropriate viewer based on media type
    if (item.type === 'video') {
      router.push(`/player/${item.id}?offline=true`)
    } else {
      // Images and GIFs go to viewer
      router.push({ pathname: '/viewer/[id]', params: { id: item.id, offline: 'true' } })
    }
  }, [])

  const handleDeleteDownload = useCallback((item: DownloadedMedia) => {
    if (Platform.OS === 'ios') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
    Alert.alert(
      'Delete Download',
      `Are you sure you want to delete "${item.filename}"? This will free up ${formatSize(item.sizeBytes)}.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            if (Platform.OS === 'ios') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
            removeDownload(item.id)
            toast.success('Download deleted', `Freed ${formatSize(item.sizeBytes)}`)
          },
        },
      ]
    )
  }, [removeDownload, toast])

  const handleToggleEditMode = useCallback(() => {
    if (Platform.OS === 'ios') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    setEditMode(prev => !prev)
  }, [])

  const handleClearAll = useCallback(() => {
    if (Platform.OS === 'ios') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy)
    const count = downloads.length
    const size = downloads.reduce((sum, d) => sum + (d.sizeBytes || 0), 0)
    Alert.alert(
      'Clear All Downloads',
      'Are you sure you want to delete all downloaded media? This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear All',
          style: 'destructive',
          onPress: () => {
            clearCompleted()
            setEditMode(false)
            toast.success(`Cleared ${count} downloads`, `Freed ${formatSize(size)}`)
          },
        },
      ]
    )
  }, [clearCompleted, downloads, toast])

  const totalSize = downloads.reduce((sum, d) => sum + (d.sizeBytes || 0), 0)
  const videoCount = downloads.filter(d => d.type === 'video').length
  const imageCount = downloads.filter(d => d.type === 'image').length

  const renderDownloadItem = useCallback(({ item }: { item: DownloadedMedia }) => (
    <DownloadItem
      item={item}
      editMode={editMode}
      onPress={() => handlePlayDownload(item)}
      onDelete={() => handleDeleteDownload(item)}
    />
  ), [editMode, handlePlayDownload, handleDeleteDownload])

  const renderQueueItem = useCallback(({ item }: { item: { id: string; filename: string; progress: number } }) => (
    <QueueItem item={item} />
  ), [])

  // Show skeleton while initializing
  if (!isInitialized) {
    return (
      <View style={styles.container}>
        <StatsSkeleton />
        <CardSkeleton count={4} />
      </View>
    )
  }

  return (
    <View style={styles.container}>
      {/* Stats Header */}
      <View style={styles.statsHeader}>
        <View style={styles.statItem}>
          <View style={styles.statIconContainer}>
            <Ionicons name="cloud-done" size={20} color="#22c55e" />
          </View>
          <Text style={styles.statValue}>{downloads.length}</Text>
          <Text style={styles.statLabel}>Downloaded</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <View style={[styles.statIconContainer, { backgroundColor: 'rgba(139, 92, 246, 0.15)' }]}>
            <Ionicons name="hardware-chip" size={20} color="#8b5cf6" />
          </View>
          <Text style={styles.statValue}>{formatSize(totalSize)}</Text>
          <Text style={styles.statLabel}>Storage Used</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <View style={[styles.statIconContainer, { backgroundColor: 'rgba(59, 130, 246, 0.15)' }]}>
            <Ionicons name="cloud-download" size={20} color="#3b82f6" />
          </View>
          <Text style={styles.statValue}>{downloadQueue.length}</Text>
          <Text style={styles.statLabel}>In Queue</Text>
        </View>
      </View>

      {/* Type breakdown */}
      {downloads.length > 0 && (
        <View style={styles.typeBreakdown}>
          <View style={styles.typeItem}>
            <Ionicons name="videocam" size={14} color="#f97316" />
            <Text style={styles.typeText}>{videoCount} Videos</Text>
          </View>
          <View style={styles.typeDot} />
          <View style={styles.typeItem}>
            <Ionicons name="image" size={14} color="#ec4899" />
            <Text style={styles.typeText}>{imageCount} Images</Text>
          </View>
        </View>
      )}

      {/* Action Buttons */}
      {downloads.length > 0 && (
        <View style={styles.actionBar}>
          {editMode ? (
            <>
              <TouchableOpacity
                style={styles.actionButton}
                onPress={handleToggleEditMode}
              >
                <Ionicons name="checkmark" size={18} color="#22c55e" />
                <Text style={[styles.actionButtonText, { color: '#22c55e' }]}>Done</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.actionButton}
                onPress={handleClearAll}
              >
                <Ionicons name="trash" size={18} color="#ef4444" />
                <Text style={[styles.actionButtonText, { color: '#ef4444' }]}>Clear All</Text>
              </TouchableOpacity>
            </>
          ) : (
            <TouchableOpacity
              style={styles.actionButton}
              onPress={handleToggleEditMode}
            >
              <Ionicons name="create-outline" size={18} color="#3b82f6" />
              <Text style={styles.actionButtonText}>Edit</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Download Queue */}
      {downloadQueue.length > 0 && (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Downloading</Text>
            <View style={styles.queueBadge}>
              <Text style={styles.queueBadgeText}>{downloadQueue.length}</Text>
            </View>
          </View>
          <FlatList
            data={downloadQueue}
            renderItem={renderQueueItem}
            keyExtractor={(item) => item.id}
            scrollEnabled={false}
          />
        </View>
      )}

      {/* Downloaded Items */}
      <FlatList
        data={downloads}
        renderItem={renderDownloadItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContainer}
        showsVerticalScrollIndicator={false}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            tintColor="#3b82f6"
            colors={['#3b82f6']}
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <View style={styles.emptyIconContainer}>
              <Ionicons name="cloud-download" size={48} color="#3b82f6" />
            </View>
            <Text style={styles.emptyTitle}>No Downloads Yet</Text>
            <Text style={styles.emptySubtitle}>
              Download media from your library to watch offline, anywhere
            </Text>
            <TouchableOpacity
              style={styles.browseButton}
              onPress={() => {
                if (Platform.OS === 'ios') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
                router.push('/')
              }}
            >
              <Ionicons name="library" size={18} color="#fff" />
              <Text style={styles.browseButtonText}>Browse Library</Text>
            </TouchableOpacity>
          </View>
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
  statsHeader: {
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
  statIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(34, 197, 94, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  statValue: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },
  statLabel: {
    color: '#71717a',
    fontSize: 11,
    marginTop: 2,
  },
  statDivider: {
    width: 1,
    backgroundColor: '#27272a',
    marginHorizontal: 8,
  },
  typeBreakdown: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 12,
    gap: 12,
  },
  typeItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  typeText: {
    color: '#71717a',
    fontSize: 13,
  },
  typeDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#3f3f46',
  },
  actionBar: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: 16,
    paddingBottom: 8,
    gap: 16,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#18181b',
  },
  actionButtonText: {
    color: '#3b82f6',
    fontSize: 14,
    fontWeight: '600',
  },
  section: {
    marginBottom: 8,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
  },
  sectionTitle: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  queueBadge: {
    backgroundColor: '#3b82f6',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  queueBadgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  listContainer: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  downloadItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#18181b',
    padding: 12,
    borderRadius: 14,
  },
  thumbContainer: {
    width: 72,
    height: 54,
    borderRadius: 8,
    overflow: 'hidden',
    position: 'relative',
  },
  thumbnail: {
    width: '100%',
    height: '100%',
  },
  placeholderThumb: {
    width: '100%',
    height: '100%',
    backgroundColor: '#27272a',
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
  offlineBadge: {
    position: 'absolute',
    top: 4,
    left: 4,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 10,
    padding: 2,
  },
  itemInfo: {
    flex: 1,
    marginLeft: 12,
  },
  itemTitle: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
    lineHeight: 18,
  },
  itemMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
    gap: 5,
  },
  itemMeta: {
    color: '#52525b',
    fontSize: 12,
  },
  metaDot: {
    color: '#3f3f46',
    fontSize: 12,
  },
  deleteButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  playButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(59, 130, 246, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  separator: {
    height: 10,
  },
  queueItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#18181b',
    padding: 12,
    marginHorizontal: 16,
    marginVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#3b82f620',
  },
  queueThumbContainer: {
    width: 48,
    height: 48,
    borderRadius: 8,
    overflow: 'hidden',
    position: 'relative',
  },
  queueThumb: {
    width: '100%',
    height: '100%',
  },
  queuePlaceholder: {
    width: '100%',
    height: '100%',
    backgroundColor: '#27272a',
    justifyContent: 'center',
    alignItems: 'center',
  },
  downloadingIndicator: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    backgroundColor: '#18181b',
    borderRadius: 10,
    padding: 2,
  },
  queueInfo: {
    flex: 1,
    marginLeft: 12,
  },
  queueTitle: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
  },
  progressBarContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    gap: 10,
  },
  progressBarBg: {
    flex: 1,
    height: 4,
    backgroundColor: '#27272a',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#3b82f6',
    borderRadius: 2,
  },
  progressPercent: {
    color: '#3b82f6',
    fontSize: 12,
    fontWeight: '600',
    width: 36,
    textAlign: 'right',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 80,
  },
  emptyIconContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
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
    paddingHorizontal: 48,
    lineHeight: 22,
  },
  browseButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 28,
    backgroundColor: '#3b82f6',
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 14,
  },
  browseButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  bottomPadding: {
    height: Platform.OS === 'ios' ? 120 : 100,
  },
})
