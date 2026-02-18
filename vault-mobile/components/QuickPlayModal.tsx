// File: vault-mobile/components/QuickPlayModal.tsx
// Quick Play modal with smart recommendations

import { useState, useEffect, useCallback, useRef, memo } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Pressable,
  Image,
  ScrollView,
  Animated,
  Platform,
  Dimensions,
} from 'react-native'
import { router } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import * as Haptics from 'expo-haptics'
import { BlurView } from 'expo-blur'
import { LinearGradient } from 'expo-linear-gradient'
import { api } from '@/services/api'
import { useHistoryStore } from '@/stores/history'
import { useFavoritesStore } from '@/stores/favorites'

const { width: SCREEN_WIDTH } = Dimensions.get('window')
const CARD_WIDTH = (SCREEN_WIDTH - 64) / 2

interface MediaItem {
  id: string
  filename: string
  type: 'video' | 'image' | 'gif'
  durationSec?: number
  hasThumb: boolean
  tags?: string[]
}

// Animated card component
const RecommendationCard = memo(({
  item,
  index,
  onPress,
  badge,
}: {
  item: MediaItem
  index: number
  onPress: () => void
  badge?: string
}) => {
  const scaleAnim = useRef(new Animated.Value(0)).current
  const translateY = useRef(new Animated.Value(30)).current

  useEffect(() => {
    Animated.parallel([
      Animated.spring(scaleAnim, {
        toValue: 1,
        delay: index * 80,
        useNativeDriver: true,
        tension: 100,
        friction: 8,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        delay: index * 80,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start()
  }, [])

  const formatDuration = (seconds?: number) => {
    if (!seconds) return ''
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const handlePressIn = () => {
    Animated.spring(scaleAnim, {
      toValue: 0.95,
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
    <Animated.View
      style={{
        transform: [
          { scale: scaleAnim },
          { translateY },
        ],
      }}
    >
      <TouchableOpacity
        style={styles.card}
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        activeOpacity={1}
      >
        {/* Thumbnail - always try to load, server generates on demand */}
        <View style={styles.cardThumbContainer}>
          <Image
            source={{ uri: api.getThumbUrl(item.id) }}
            style={styles.cardThumb}
            resizeMode="cover"
          />
          <LinearGradient
            colors={['transparent', 'rgba(0,0,0,0.8)']}
            style={styles.cardGradient}
          />
          {item.type === 'video' && (
            <View style={styles.playIcon}>
              <Ionicons name="play" size={18} color="#fff" />
            </View>
          )}
          {item.type === 'video' && item.durationSec && (
            <View style={styles.durationBadge}>
              <Text style={styles.durationText}>
                {formatDuration(item.durationSec)}
              </Text>
            </View>
          )}
          {badge && (
            <View style={styles.typeBadge}>
              <Text style={styles.typeBadgeText}>{badge}</Text>
            </View>
          )}
        </View>
        <Text style={styles.cardTitle} numberOfLines={2}>
          {item.filename}
        </Text>
      </TouchableOpacity>
    </Animated.View>
  )
})

interface QuickPlayModalProps {
  visible: boolean
  onClose: () => void
}

export function QuickPlayModal({ visible, onClose }: QuickPlayModalProps) {
  const { items: historyItems } = useHistoryStore()
  const { items: favorites } = useFavoritesStore()

  const [recommendations, setRecommendations] = useState<MediaItem[]>([])
  const [continueWatching, setContinueWatching] = useState<MediaItem[]>([])
  const [randomPicks, setRandomPicks] = useState<MediaItem[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const fadeAnim = useRef(new Animated.Value(0)).current

  // Load recommendations when modal opens
  useEffect(() => {
    if (visible) {
      loadRecommendations()
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }).start()
    } else {
      fadeAnim.setValue(0)
    }
  }, [visible])

  const loadRecommendations = async () => {
    setIsLoading(true)
    try {
      // Get continue watching from history
      const unfinished = historyItems
        .filter(h => h.type === 'video' && h.progress && h.progress > 0.05 && h.progress < 0.95)
        .slice(0, 4)
      setContinueWatching(unfinished as MediaItem[])

      // Get random recommendations
      const randomResult = await api.getLibrary({
        limit: 6,
        type: 'video',
        sort: 'random',
      })
      setRandomPicks(randomResult.items || [])

      // Get recommendations based on favorite tags
      if (favorites.length > 0) {
        // Collect tags from favorites
        const favoriteTags: string[] = []
        favorites.forEach(fav => {
          if (fav.tags) {
            fav.tags.forEach(tag => {
              if (!favoriteTags.includes(tag)) {
                favoriteTags.push(tag)
              }
            })
          }
        })

        // Use smart recommendations if we have tags
        if (favoriteTags.length > 0) {
          const recResult = await api.getRecommendations(favoriteTags, 4)
          // Filter out items already in other sections
          const existingIds = new Set([
            ...unfinished.map(i => i.id),
            ...(randomResult.items || []).map(i => i.id),
          ])
          const filteredRecs = (recResult.items || []).filter(i => !existingIds.has(i.id))
          setRecommendations(filteredRecs)
        } else {
          // No tags, just get random
          const recResult = await api.getLibrary({
            limit: 4,
            type: 'video',
            sort: 'random',
          })
          setRecommendations(recResult.items || [])
        }
      } else {
        setRecommendations([])
      }
    } catch (err) {
      console.error('Failed to load recommendations:', err)
    } finally {
      setIsLoading(false)
    }
  }

  const handlePlay = useCallback((item: MediaItem) => {
    if (Platform.OS === 'ios') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
    onClose()
    if (item.type === 'video') {
      router.push(`/player/${item.id}`)
    } else {
      router.push({ pathname: '/viewer/[id]', params: { id: item.id } })
    }
  }, [onClose])

  const handleQuickShuffle = useCallback(async () => {
    if (Platform.OS === 'ios') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy)
    onClose()

    try {
      const result = await api.getLibrary({
        limit: 1,
        type: 'video',
        sort: 'random',
      })
      if (result.items && result.items.length > 0) {
        router.push(`/player/${result.items[0].id}`)
      }
    } catch (err) {
      console.error('Failed to get random video:', err)
    }
  }, [onClose])

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable style={styles.overlay} onPress={onClose}>
        <Animated.View
          style={[styles.content, { opacity: fadeAnim }]}
        >
          <Pressable>
            <BlurView intensity={90} tint="dark" style={styles.blurContainer}>
              {/* Header */}
              <View style={styles.header}>
                <View style={styles.handle} />
                <Text style={styles.title}>Quick Play</Text>
                <Text style={styles.subtitle}>Jump right in</Text>
              </View>

              {/* Shuffle Button */}
              <TouchableOpacity
                style={styles.shuffleButton}
                onPress={handleQuickShuffle}
                activeOpacity={0.8}
              >
                <LinearGradient
                  colors={['#3b82f6', '#8b5cf6']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.shuffleGradient}
                >
                  <Ionicons name="shuffle" size={28} color="#fff" />
                  <Text style={styles.shuffleText}>Surprise Me</Text>
                  <Text style={styles.shuffleSubtext}>Play random video</Text>
                </LinearGradient>
              </TouchableOpacity>

              <ScrollView
                style={styles.scrollContent}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.scrollContainer}
              >
                {/* Continue Watching */}
                {continueWatching.length > 0 && (
                  <View style={styles.section}>
                    <View style={styles.sectionHeader}>
                      <Ionicons name="play-circle" size={18} color="#3b82f6" />
                      <Text style={styles.sectionTitle}>Continue Watching</Text>
                    </View>
                    <View style={styles.cardsGrid}>
                      {continueWatching.map((item, index) => (
                        <RecommendationCard
                          key={item.id}
                          item={item}
                          index={index}
                          onPress={() => handlePlay(item)}
                          badge="Resume"
                        />
                      ))}
                    </View>
                  </View>
                )}

                {/* Random Picks */}
                {randomPicks.length > 0 && (
                  <View style={styles.section}>
                    <View style={styles.sectionHeader}>
                      <Ionicons name="sparkles" size={18} color="#f59e0b" />
                      <Text style={styles.sectionTitle}>Random Picks</Text>
                    </View>
                    <View style={styles.cardsGrid}>
                      {randomPicks.slice(0, 4).map((item, index) => (
                        <RecommendationCard
                          key={item.id}
                          item={item}
                          index={index + (continueWatching.length)}
                          onPress={() => handlePlay(item)}
                        />
                      ))}
                    </View>
                  </View>
                )}

                {/* Based on Favorites */}
                {recommendations.length > 0 && (
                  <View style={styles.section}>
                    <View style={styles.sectionHeader}>
                      <Ionicons name="heart" size={18} color="#ef4444" />
                      <Text style={styles.sectionTitle}>For You</Text>
                    </View>
                    <View style={styles.cardsGrid}>
                      {recommendations.map((item, index) => (
                        <RecommendationCard
                          key={item.id}
                          item={item}
                          index={index + (continueWatching.length + randomPicks.length)}
                          onPress={() => handlePlay(item)}
                        />
                      ))}
                    </View>
                  </View>
                )}

                <View style={styles.bottomPadding} />
              </ScrollView>
            </BlurView>
          </Pressable>
        </Animated.View>
      </Pressable>
    </Modal>
  )
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  content: {
    maxHeight: '90%',
  },
  blurContainer: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: 'hidden',
  },
  header: {
    alignItems: 'center',
    paddingTop: 12,
    paddingBottom: 8,
  },
  handle: {
    width: 40,
    height: 4,
    backgroundColor: '#3f3f46',
    borderRadius: 2,
    marginBottom: 16,
  },
  title: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '700',
  },
  subtitle: {
    color: '#71717a',
    fontSize: 14,
    marginTop: 4,
  },
  shuffleButton: {
    marginHorizontal: 20,
    marginTop: 16,
    borderRadius: 16,
    overflow: 'hidden',
  },
  shuffleGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    gap: 12,
  },
  shuffleText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
  },
  shuffleSubtext: {
    position: 'absolute',
    bottom: 6,
    color: 'rgba(255,255,255,0.6)',
    fontSize: 11,
  },
  scrollContent: {
    flex: 1,
  },
  scrollContainer: {
    paddingHorizontal: 16,
    paddingTop: 20,
  },
  section: {
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 14,
    paddingHorizontal: 4,
  },
  sectionTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  cardsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  card: {
    width: CARD_WIDTH,
    backgroundColor: '#18181b',
    borderRadius: 14,
    overflow: 'hidden',
  },
  cardThumbContainer: {
    width: '100%',
    height: CARD_WIDTH * 0.6,
    position: 'relative',
  },
  cardThumb: {
    width: '100%',
    height: '100%',
  },
  noThumb: {
    backgroundColor: '#27272a',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardGradient: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '50%',
  },
  playIcon: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    marginTop: -16,
    marginLeft: -16,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.6)',
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
  typeBadge: {
    position: 'absolute',
    top: 6,
    left: 6,
    backgroundColor: '#3b82f6',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  typeBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
  },
  cardTitle: {
    color: '#a1a1aa',
    fontSize: 12,
    padding: 10,
    lineHeight: 16,
  },
  bottomPadding: {
    height: Platform.OS === 'ios' ? 40 : 20,
  },
})
