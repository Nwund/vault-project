// File: vault-mobile/components/SkeletonLoader.tsx
// Skeleton loading placeholders for better perceived performance

import { useEffect, useRef, memo } from 'react'
import { View, StyleSheet, Animated, Dimensions } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'

const { width: SCREEN_WIDTH } = Dimensions.get('window')

// Animated shimmer effect
const ShimmerEffect = memo(({ style }: { style?: any }) => {
  const translateX = useRef(new Animated.Value(-SCREEN_WIDTH)).current

  useEffect(() => {
    const animation = Animated.loop(
      Animated.timing(translateX, {
        toValue: SCREEN_WIDTH,
        duration: 1500,
        useNativeDriver: true,
      })
    )
    animation.start()
    return () => animation.stop()
  }, [])

  return (
    <View style={[styles.shimmerContainer, style]}>
      <Animated.View
        style={[
          styles.shimmer,
          { transform: [{ translateX }] },
        ]}
      >
        <LinearGradient
          colors={['transparent', 'rgba(255,255,255,0.08)', 'transparent']}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
    </View>
  )
})

// Grid skeleton for library/media list
export const GridSkeleton = memo(({ columns = 3, rows = 4 }: { columns?: number; rows?: number }) => {
  const itemWidth = (SCREEN_WIDTH - 16) / columns - 4

  return (
    <View style={styles.gridContainer}>
      {Array.from({ length: columns * rows }).map((_, index) => (
        <View
          key={index}
          style={[styles.gridItem, { width: itemWidth, height: itemWidth * 0.75 }]}
        >
          <ShimmerEffect />
        </View>
      ))}
    </View>
  )
})

// Card skeleton for list items
export const CardSkeleton = memo(({ count = 3 }: { count?: number }) => {
  return (
    <View style={styles.cardContainer}>
      {Array.from({ length: count }).map((_, index) => (
        <View key={index} style={styles.card}>
          {/* Thumbnail */}
          <View style={styles.cardThumb}>
            <ShimmerEffect />
          </View>
          {/* Content */}
          <View style={styles.cardContent}>
            <View style={styles.cardTitleSkeleton}>
              <ShimmerEffect />
            </View>
            <View style={styles.cardSubtitleSkeleton}>
              <ShimmerEffect />
            </View>
          </View>
        </View>
      ))}
    </View>
  )
})

// Feed skeleton for vertical video feed
export const FeedSkeleton = memo(() => {
  return (
    <View style={styles.feedContainer}>
      <View style={styles.feedItem}>
        <ShimmerEffect style={styles.feedShimmer} />
        {/* Fake controls */}
        <View style={styles.feedControls}>
          <View style={styles.feedControlItem}>
            <ShimmerEffect />
          </View>
          <View style={styles.feedControlItem}>
            <ShimmerEffect />
          </View>
          <View style={styles.feedControlItem}>
            <ShimmerEffect />
          </View>
        </View>
      </View>
    </View>
  )
})

// Stats skeleton for header stats
export const StatsSkeleton = memo(() => {
  return (
    <View style={styles.statsContainer}>
      {[1, 2, 3].map((_, index) => (
        <View key={index} style={styles.statItem}>
          <View style={styles.statValue}>
            <ShimmerEffect />
          </View>
          <View style={styles.statLabel}>
            <ShimmerEffect />
          </View>
        </View>
      ))}
    </View>
  )
})

// Continue watching skeleton
export const ContinueWatchingSkeleton = memo(() => {
  return (
    <View style={styles.continueContainer}>
      <View style={styles.sectionTitleSkeleton}>
        <ShimmerEffect />
      </View>
      <View style={styles.continueScroll}>
        {[1, 2, 3].map((_, index) => (
          <View key={index} style={styles.continueItem}>
            <View style={styles.continueThumb}>
              <ShimmerEffect />
            </View>
            <View style={styles.continueProgress}>
              <ShimmerEffect />
            </View>
            <View style={styles.continueTitle}>
              <ShimmerEffect />
            </View>
          </View>
        ))}
      </View>
    </View>
  )
})

// Player controls skeleton
export const PlayerSkeleton = memo(() => {
  return (
    <View style={styles.playerContainer}>
      <View style={styles.playerVideo}>
        <ShimmerEffect style={styles.playerShimmer} />
      </View>
    </View>
  )
})

const styles = StyleSheet.create({
  shimmerContainer: {
    overflow: 'hidden',
    backgroundColor: '#18181b',
    width: '100%',
    height: '100%',
    borderRadius: 8,
  },
  shimmer: {
    width: '100%',
    height: '100%',
  },
  // Grid styles
  gridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 4,
    gap: 4,
  },
  gridItem: {
    borderRadius: 8,
    overflow: 'hidden',
  },
  // Card styles
  cardContainer: {
    padding: 16,
    gap: 12,
  },
  card: {
    flexDirection: 'row',
    backgroundColor: '#18181b',
    borderRadius: 14,
    padding: 12,
    gap: 14,
  },
  cardThumb: {
    width: 100,
    height: 75,
    borderRadius: 10,
    overflow: 'hidden',
  },
  cardContent: {
    flex: 1,
    justifyContent: 'center',
    gap: 8,
  },
  cardTitleSkeleton: {
    height: 16,
    borderRadius: 4,
    width: '80%',
    overflow: 'hidden',
  },
  cardSubtitleSkeleton: {
    height: 12,
    borderRadius: 4,
    width: '50%',
    overflow: 'hidden',
  },
  // Feed styles
  feedContainer: {
    flex: 1,
    backgroundColor: '#000',
  },
  feedItem: {
    flex: 1,
    position: 'relative',
  },
  feedShimmer: {
    flex: 1,
    borderRadius: 0,
  },
  feedControls: {
    position: 'absolute',
    right: 16,
    bottom: 120,
    gap: 20,
  },
  feedControlItem: {
    width: 44,
    height: 44,
    borderRadius: 22,
    overflow: 'hidden',
  },
  // Stats styles
  statsContainer: {
    flexDirection: 'row',
    backgroundColor: '#18181b',
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 16,
    padding: 16,
    gap: 12,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
    gap: 8,
  },
  statValue: {
    width: 40,
    height: 24,
    borderRadius: 6,
    overflow: 'hidden',
  },
  statLabel: {
    width: 60,
    height: 12,
    borderRadius: 4,
    overflow: 'hidden',
  },
  // Continue watching styles
  continueContainer: {
    paddingTop: 16,
  },
  sectionTitleSkeleton: {
    width: 140,
    height: 20,
    borderRadius: 6,
    marginLeft: 16,
    marginBottom: 12,
    overflow: 'hidden',
  },
  continueScroll: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    gap: 12,
  },
  continueItem: {
    width: 160,
    backgroundColor: '#18181b',
    borderRadius: 12,
    overflow: 'hidden',
  },
  continueThumb: {
    width: '100%',
    height: 90,
  },
  continueProgress: {
    height: 3,
    backgroundColor: '#27272a',
  },
  continueTitle: {
    height: 14,
    margin: 10,
    borderRadius: 4,
    overflow: 'hidden',
  },
  // Player styles
  playerContainer: {
    flex: 1,
    backgroundColor: '#000',
  },
  playerVideo: {
    flex: 1,
  },
  playerShimmer: {
    flex: 1,
    borderRadius: 0,
  },
})
