// File: vault-mobile/app/details/[id].tsx
// Media details screen - Shows full info, tags, and actions

import { useState, useEffect, useCallback } from 'react'
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Platform,
  Image,
  Alert,
  ActivityIndicator,
} from 'react-native'
import { useLocalSearchParams, router } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import * as Haptics from 'expo-haptics'
import { useConnectionStore } from '@/stores/connection'
import { useFavoritesStore } from '@/stores/favorites'
import { useDownloadStore } from '@/stores/downloads'
import { api } from '@/services/api'
import { shareService } from '@/services/share'
import { getErrorMessage } from '@/utils'

interface MediaDetails {
  id: string
  filename: string
  type: 'video' | 'image' | 'gif'
  durationSec?: number
  sizeBytes?: number
  hasThumb: boolean
  tags?: string[]
  width?: number
  height?: number
  createdAt?: number
  addedAt?: number
}

export default function MediaDetailsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const { serverUrl } = useConnectionStore()
  const { isFavorite, toggleFavorite } = useFavoritesStore()
  const { addToQueue, startDownload, downloads } = useDownloadStore()

  const [media, setMedia] = useState<MediaDetails | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isSharing, setIsSharing] = useState(false)

  const isDownloaded = downloads.some(d => d.id === id)

  useEffect(() => {
    const loadDetails = async () => {
      try {
        setIsLoading(true)
        const data = await api.getMediaById(id!)
        if (data) {
          setMedia(data)
        } else {
          setError('Media not found')
        }
      } catch (err) {
        setError(getErrorMessage(err))
      } finally {
        setIsLoading(false)
      }
    }

    if (id) loadDetails()
  }, [id])

  const handlePlay = () => {
    if (!media) return
    if (Platform.OS === 'ios') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)

    if (media.type === 'video') {
      router.push(`/player/${id}`)
    } else {
      router.push({ pathname: '/viewer/[id]', params: { id: id! } })
    }
  }

  const handleToggleFavorite = () => {
    if (!media) return
    if (Platform.OS === 'ios') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)

    toggleFavorite({
      id: media.id,
      filename: media.filename,
      type: media.type,
      durationSec: media.durationSec,
      hasThumb: media.hasThumb,
    })
  }

  const handleDownload = async () => {
    if (!media) return
    if (Platform.OS === 'ios') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)

    if (isDownloaded) {
      Alert.alert('Already Downloaded', 'This media is already available offline.')
      return
    }

    const remoteUrl = api.getStreamUrl(id!)
    addToQueue({
      id: id!,
      filename: media.filename,
      remoteUrl,
      type: media.type,
      durationSec: media.durationSec,
    })
    startDownload(id!)

    Alert.alert('Download Started', `"${media.filename}" will be available offline soon.`)
  }

  const handleShare = async () => {
    if (!media) return
    if (Platform.OS === 'ios') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)

    setIsSharing(true)
    try {
      await shareService.shareMedia({
        id: media.id,
        filename: media.filename,
        type: media.type,
      })
    } finally {
      setIsSharing(false)
    }
  }

  const formatSize = (bytes?: number) => {
    if (!bytes) return 'Unknown'
    const mb = bytes / (1024 * 1024)
    if (mb >= 1024) {
      return `${(mb / 1024).toFixed(2)} GB`
    }
    return `${mb.toFixed(2)} MB`
  }

  const formatDuration = (seconds?: number) => {
    if (!seconds) return 'N/A'
    const hrs = Math.floor(seconds / 3600)
    const mins = Math.floor((seconds % 3600) / 60)
    const secs = Math.floor(seconds % 60)
    if (hrs > 0) {
      return `${hrs}h ${mins}m ${secs}s`
    }
    return `${mins}m ${secs}s`
  }

  const formatDate = (timestamp?: number) => {
    if (!timestamp) return 'Unknown'
    return new Date(timestamp).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
  }

  if (isLoading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#3b82f6" />
      </View>
    )
  }

  if (error || !media) {
    return (
      <View style={styles.centerContainer}>
        <Ionicons name="alert-circle" size={56} color="#ef4444" />
        <Text style={styles.errorText}>{error || 'Media not found'}</Text>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backButtonText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    )
  }

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {/* Hero Image */}
      <View style={styles.heroContainer}>
        {media.hasThumb && (
          <Image
            source={{ uri: api.getThumbUrl(id!) }}
            style={styles.heroImage}
            resizeMode="cover"
          />
        )}
        <View style={styles.heroOverlay} />

        {/* Play button overlay */}
        <TouchableOpacity style={styles.playOverlay} onPress={handlePlay}>
          <View style={styles.playButtonLarge}>
            <Ionicons
              name={media.type === 'video' ? 'play' : 'eye'}
              size={40}
              color="#fff"
            />
          </View>
        </TouchableOpacity>

        {/* Type badge */}
        <View style={styles.typeBadge}>
          <Ionicons
            name={media.type === 'video' ? 'videocam' : media.type === 'gif' ? 'infinite' : 'image'}
            size={14}
            color="#fff"
          />
          <Text style={styles.typeBadgeText}>{media.type.toUpperCase()}</Text>
        </View>
      </View>

      {/* Title */}
      <View style={styles.titleSection}>
        <Text style={styles.title}>{media.filename}</Text>
      </View>

      {/* Quick Actions */}
      <View style={styles.actionsRow}>
        <TouchableOpacity
          style={[styles.actionButton, styles.actionButtonPrimary]}
          onPress={handlePlay}
        >
          <Ionicons name={media.type === 'video' ? 'play' : 'eye'} size={20} color="#fff" />
          <Text style={styles.actionButtonTextPrimary}>
            {media.type === 'video' ? 'Play' : 'View'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionButton, isFavorite(id!) && styles.actionButtonActive]}
          onPress={handleToggleFavorite}
        >
          <Ionicons
            name={isFavorite(id!) ? 'heart' : 'heart-outline'}
            size={20}
            color={isFavorite(id!) ? '#ef4444' : '#fff'}
          />
          <Text style={styles.actionButtonText}>
            {isFavorite(id!) ? 'Favorited' : 'Favorite'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionButton, isDownloaded && styles.actionButtonActive]}
          onPress={handleDownload}
        >
          <Ionicons
            name={isDownloaded ? 'checkmark-circle' : 'cloud-download-outline'}
            size={20}
            color={isDownloaded ? '#22c55e' : '#fff'}
          />
          <Text style={styles.actionButtonText}>
            {isDownloaded ? 'Downloaded' : 'Download'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.actionButton}
          onPress={handleShare}
          disabled={isSharing}
        >
          {isSharing ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Ionicons name="share-outline" size={20} color="#fff" />
          )}
          <Text style={styles.actionButtonText}>Share</Text>
        </TouchableOpacity>
      </View>

      {/* Info Section */}
      <View style={styles.infoSection}>
        <Text style={styles.sectionTitle}>Details</Text>

        <View style={styles.infoGrid}>
          {media.type === 'video' && media.durationSec && (
            <View style={styles.infoItem}>
              <Ionicons name="time-outline" size={20} color="#71717a" />
              <View>
                <Text style={styles.infoLabel}>Duration</Text>
                <Text style={styles.infoValue}>{formatDuration(media.durationSec)}</Text>
              </View>
            </View>
          )}

          <View style={styles.infoItem}>
            <Ionicons name="document-outline" size={20} color="#71717a" />
            <View>
              <Text style={styles.infoLabel}>Size</Text>
              <Text style={styles.infoValue}>{formatSize(media.sizeBytes)}</Text>
            </View>
          </View>

          {media.width && media.height && (
            <View style={styles.infoItem}>
              <Ionicons name="resize-outline" size={20} color="#71717a" />
              <View>
                <Text style={styles.infoLabel}>Resolution</Text>
                <Text style={styles.infoValue}>{media.width} × {media.height}</Text>
              </View>
            </View>
          )}

          {media.addedAt && (
            <View style={styles.infoItem}>
              <Ionicons name="calendar-outline" size={20} color="#71717a" />
              <View>
                <Text style={styles.infoLabel}>Added</Text>
                <Text style={styles.infoValue}>{formatDate(media.addedAt)}</Text>
              </View>
            </View>
          )}
        </View>
      </View>

      {/* Tags Section */}
      {media.tags && media.tags.length > 0 && (
        <View style={styles.tagsSection}>
          <Text style={styles.sectionTitle}>Tags</Text>
          <View style={styles.tagsContainer}>
            {media.tags.map((tag) => (
              <TouchableOpacity
                key={tag}
                style={styles.tagChip}
                onPress={() => {
                  if (Platform.OS === 'ios') Haptics.selectionAsync()
                  router.push({ pathname: '/tags', params: { tag } })
                }}
              >
                <Ionicons name="pricetag" size={12} color="#3b82f6" />
                <Text style={styles.tagText}>{tag}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}

      {/* Bottom padding */}
      <View style={styles.bottomPadding} />
    </ScrollView>
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
  errorText: {
    color: '#fff',
    fontSize: 16,
    marginTop: 16,
    textAlign: 'center',
  },
  backButton: {
    marginTop: 24,
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: '#3b82f6',
    borderRadius: 8,
  },
  backButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  heroContainer: {
    height: 280,
    backgroundColor: '#18181b',
    position: 'relative',
  },
  heroImage: {
    width: '100%',
    height: '100%',
  },
  heroOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  playOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  playButtonLarge: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(59, 130, 246, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  typeBadge: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 56 : 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(0,0,0,0.75)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
  },
  typeBadgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },
  titleSection: {
    padding: 20,
    paddingBottom: 16,
  },
  title: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
    lineHeight: 28,
  },
  actionsRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 10,
  },
  actionButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#27272a',
    paddingVertical: 14,
    borderRadius: 12,
    gap: 6,
  },
  actionButtonPrimary: {
    backgroundColor: '#3b82f6',
  },
  actionButtonActive: {
    backgroundColor: '#18181b',
    borderWidth: 1,
    borderColor: '#3f3f46',
  },
  actionButtonText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '600',
  },
  actionButtonTextPrimary: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },
  infoSection: {
    padding: 20,
  },
  sectionTitle: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 16,
  },
  infoGrid: {
    backgroundColor: '#18181b',
    borderRadius: 16,
    padding: 16,
    gap: 16,
  },
  infoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  infoLabel: {
    color: '#71717a',
    fontSize: 12,
  },
  infoValue: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '500',
    marginTop: 2,
  },
  tagsSection: {
    padding: 20,
    paddingTop: 0,
  },
  tagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  tagChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(59, 130, 246, 0.15)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
  },
  tagText: {
    color: '#3b82f6',
    fontSize: 13,
    fontWeight: '500',
  },
  bottomPadding: {
    height: 100,
  },
})
