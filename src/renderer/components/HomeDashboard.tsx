// File: src/renderer/components/HomeDashboard.tsx
// Home dashboard with Continue Watching, Recommendations, Recently Added, Favorites, and Most Watched

import React, { useState, useEffect, useCallback, useRef } from 'react'
import { Play, Clock, Sparkles, Plus, ChevronRight, RefreshCw, Film, Image, Heart, TrendingUp, Shuffle, Zap, ListVideo, BarChart3, Eye, Timer, Star, Flame, Crown, Target, Gamepad2 } from 'lucide-react'
import { formatDuration } from '../utils/formatters'
import { toFileUrlCached } from '../utils/urlCache'

interface MediaItem {
  id: string
  filename: string
  thumbPath?: string | null
  type: string
  durationSec?: number | null
}

interface ContinueWatchingItem {
  mediaId: string
  resumePosition: number
  completionPercent: number
  lastWatched: number
}

interface RecommendationItem {
  id: string
  reason: string
  score: number
}

interface HomeDashboardProps {
  onPlayMedia: (mediaId: string) => void
  onNavigateToLibrary: () => void
  onNavigateToStats?: () => void
}

// Use shared URL cache
const getThumbUrl = toFileUrlCached

function formatTimeAgo(timestamp: number): string {
  const now = Date.now()
  const diff = now - timestamp
  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)

  if (days > 0) return `${days}d ago`
  if (hours > 0) return `${hours}h ago`
  if (minutes > 0) return `${minutes}m ago`
  return 'Just now'
}

function formatWatchTime(seconds: number): string {
  if (seconds < 60) return `${Math.floor(seconds)}s`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`
  const hours = Math.floor(seconds / 3600)
  const mins = Math.floor((seconds % 3600) / 60)
  if (hours < 24) return `${hours}h ${mins}m`
  const days = Math.floor(hours / 24)
  const remainingHours = hours % 24
  return `${days}d ${remainingHours}h`
}

function getGreeting(): string {
  const hour = new Date().getHours()
  if (hour < 5) return 'Late Night Session'
  if (hour < 12) return 'Good Morning'
  if (hour < 17) return 'Good Afternoon'
  if (hour < 21) return 'Good Evening'
  return 'Night Owl Mode'
}

function MediaCard({ media, onClick, badge, progress, rank }: {
  media: MediaItem
  onClick: () => void
  badge?: React.ReactNode
  progress?: number
  rank?: number
}) {
  const [thumbUrl, setThumbUrl] = useState('')
  const [isHovered, setIsHovered] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    if (media.thumbPath) {
      setIsLoading(true)
      getThumbUrl(media.thumbPath)
        .then((url) => {
          setThumbUrl(url)
          setIsLoading(false)
        })
        .catch(() => setIsLoading(false))
    } else {
      setIsLoading(false)
    }
  }, [media.thumbPath])

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className="flex-shrink-0 w-48 cursor-pointer group relative"
    >
      {/* Rank number for top items */}
      {rank && rank <= 3 && (
        <div className={`absolute -left-2 -top-2 z-20 w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shadow-lg ${
          rank === 1 ? 'bg-gradient-to-br from-yellow-400 to-amber-600 text-black' :
          rank === 2 ? 'bg-gradient-to-br from-gray-300 to-gray-500 text-black' :
          'bg-gradient-to-br from-amber-600 to-orange-700 text-white'
        }`}>
          {rank}
        </div>
      )}

      <div className="relative aspect-video bg-zinc-800/80 rounded-xl overflow-hidden mb-2 shadow-lg group-hover:shadow-xl group-hover:shadow-[var(--primary)]/20 transition-all duration-300">
        {/* Loading shimmer */}
        {isLoading && (
          <div className="absolute inset-0 skeleton" />
        )}

        {thumbUrl ? (
          <img
            src={thumbUrl}
            alt={media.filename}
            className="w-full h-full object-cover transition-all duration-300 group-hover:scale-110 group-hover:brightness-110"
            loading="lazy"
          />
        ) : !isLoading && (
          <div className="w-full h-full flex items-center justify-center text-zinc-600 bg-gradient-to-br from-zinc-800 to-zinc-900">
            {media.type === 'video' ? <Film size={28} /> : <Image size={28} />}
          </div>
        )}

        {/* Gradient overlay for better text readability */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

        {/* Play overlay on hover */}
        <div className={`absolute inset-0 flex items-center justify-center transition-all duration-300 ${isHovered ? 'opacity-100 scale-100' : 'opacity-0 scale-90'}`}>
          <div className="w-14 h-14 rounded-full bg-white/95 flex items-center justify-center shadow-xl transform group-hover:scale-110 transition-transform">
            <Play size={26} className="text-black ml-1" fill="currentColor" />
          </div>
        </div>

        {/* Progress bar */}
        {progress !== undefined && progress > 0 && (
          <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-black/70">
            <div
              className="h-full bg-gradient-to-r from-[var(--primary)] to-pink-400 transition-all"
              style={{ width: `${Math.min(progress, 100)}%` }}
            />
          </div>
        )}

        {/* Duration badge */}
        {media.durationSec && (
          <div className="absolute bottom-2 right-2 px-2 py-0.5 bg-black/90 rounded-md text-[11px] text-white font-medium backdrop-blur-sm">
            {formatDuration(media.durationSec)}
          </div>
        )}

        {/* Custom badge */}
        {badge && (
          <div className="absolute top-2 left-2">
            {badge}
          </div>
        )}

        {/* Type indicator */}
        <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
          {media.type === 'video' ? (
            <Film size={14} className="text-white/80" />
          ) : (
            <Image size={14} className="text-white/80" />
          )}
        </div>
      </div>

      <div className="text-sm text-white/90 truncate group-hover:text-white transition-colors font-medium px-1">
        {media.filename}
      </div>
    </div>
  )
}

function HorizontalSection({ title, icon, items, loading, onRefresh, onSeeAll, children, gradient }: {
  title: string
  icon: React.ReactNode
  items: number
  loading?: boolean
  onRefresh?: () => void
  onSeeAll?: () => void
  children: React.ReactNode
  gradient?: string
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(false)

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const checkScroll = () => {
      setCanScrollLeft(el.scrollLeft > 0)
      setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 10)
    }
    checkScroll()
    el.addEventListener('scroll', checkScroll)
    return () => el.removeEventListener('scroll', checkScroll)
  }, [items])

  const scroll = (direction: 'left' | 'right') => {
    const el = scrollRef.current
    if (!el) return
    const amount = direction === 'left' ? -400 : 400
    el.scrollBy({ left: amount, behavior: 'smooth' })
  }

  return (
    <div className="mb-8 relative group/section">
      {/* Section header */}
      <div className="flex items-center justify-between mb-4 px-1">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-xl ${gradient || 'bg-zinc-800'}`}>
            {icon}
          </div>
          <div>
            <span className="font-bold text-white text-lg">{title}</span>
            <span className="ml-2 text-xs text-zinc-500 bg-zinc-800/50 px-2 py-0.5 rounded-full">{items}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {onRefresh && (
            <button
              onClick={onRefresh}
              disabled={loading}
              className="p-2 rounded-lg hover:bg-white/10 transition disabled:opacity-50 text-zinc-400 hover:text-white"
              title="Refresh"
            >
              <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            </button>
          )}
          {onSeeAll && (
            <button
              onClick={onSeeAll}
              className="flex items-center gap-1 text-sm text-[var(--primary)] hover:text-[var(--primary)]/80 transition font-medium px-3 py-1.5 rounded-lg hover:bg-[var(--primary)]/10"
            >
              See All <ChevronRight size={16} />
            </button>
          )}
        </div>
      </div>

      {/* Scroll container with navigation arrows */}
      <div className="relative">
        {/* Left scroll button */}
        {canScrollLeft && (
          <button
            onClick={() => scroll('left')}
            className="absolute left-0 top-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded-full bg-black/80 text-white flex items-center justify-center opacity-0 group-hover/section:opacity-100 transition-opacity shadow-xl hover:bg-black hover:scale-110"
          >
            <ChevronRight size={20} className="rotate-180" />
          </button>
        )}

        {/* Right scroll button */}
        {canScrollRight && (
          <button
            onClick={() => scroll('right')}
            className="absolute right-0 top-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded-full bg-black/80 text-white flex items-center justify-center opacity-0 group-hover/section:opacity-100 transition-opacity shadow-xl hover:bg-black hover:scale-110"
          >
            <ChevronRight size={20} />
          </button>
        )}

        {/* Edge gradients for scroll indication */}
        {canScrollLeft && (
          <div className="absolute left-0 top-0 bottom-0 w-16 bg-gradient-to-r from-[var(--bg)] to-transparent z-[5] pointer-events-none" />
        )}
        {canScrollRight && (
          <div className="absolute right-0 top-0 bottom-0 w-16 bg-gradient-to-l from-[var(--bg)] to-transparent z-[5] pointer-events-none" />
        )}

        <div
          ref={scrollRef}
          className="flex gap-4 overflow-x-auto pb-3 px-1 scrollbar-hidden scroll-smooth"
        >
          {children}
        </div>
      </div>
    </div>
  )
}

export function HomeDashboard({ onPlayMedia, onNavigateToLibrary, onNavigateToStats }: HomeDashboardProps) {
  const [continueWatching, setContinueWatching] = useState<Array<ContinueWatchingItem & MediaItem>>([])
  const [recommendations, setRecommendations] = useState<Array<RecommendationItem & MediaItem>>([])
  const [recentlyAdded, setRecentlyAdded] = useState<MediaItem[]>([])
  const [favorites, setFavorites] = useState<MediaItem[]>([])
  const [mostWatched, setMostWatched] = useState<Array<MediaItem & { viewCount: number }>>([])
  const [loadingContinue, setLoadingContinue] = useState(true)
  const [loadingRecs, setLoadingRecs] = useState(true)
  const [loadingRecent, setLoadingRecent] = useState(true)
  const [loadingFavorites, setLoadingFavorites] = useState(true)
  const [loadingMostWatched, setLoadingMostWatched] = useState(true)
  const [watchLater, setWatchLater] = useState<Array<MediaItem & { priority: number }>>([])
  const [loadingWatchLater, setLoadingWatchLater] = useState(true)
  const [quickStats, setQuickStats] = useState<{
    totalMedia: number
    totalVideos: number
    totalImages: number
    totalFavorites: number
    totalWatchTime: number
  } | null>(null)
  const [pickingRandom, setPickingRandom] = useState(false)

  const loadContinueWatching = useCallback(async () => {
    setLoadingContinue(true)
    try {
      const items = await window.api.invoke('watch:get-continue-watching', 10) as ContinueWatchingItem[]

      // Fetch media details for each item
      const withMedia = await Promise.all(
        items.map(async (item) => {
          try {
            const media = await window.api.media.get(item.mediaId)
            return { ...item, ...media }
          } catch {
            return null
          }
        })
      )

      setContinueWatching(withMedia.filter(Boolean) as Array<ContinueWatchingItem & MediaItem>)
    } catch (e) {
      console.error('Failed to load continue watching:', e)
    } finally {
      setLoadingContinue(false)
    }
  }, [])

  const loadRecommendations = useCallback(async () => {
    setLoadingRecs(true)
    try {
      const items = await window.api.invoke('watch:get-recommendations', 12) as RecommendationItem[]

      // Fetch media details for each item
      const withMedia = await Promise.all(
        items.map(async (item) => {
          try {
            const media = await window.api.media.get(item.id)
            return { ...item, ...media }
          } catch {
            return null
          }
        })
      )

      setRecommendations(withMedia.filter(Boolean) as Array<RecommendationItem & MediaItem>)
    } catch (e) {
      console.error('Failed to load recommendations:', e)
    } finally {
      setLoadingRecs(false)
    }
  }, [])

  const loadRecentlyAdded = useCallback(async () => {
    setLoadingRecent(true)
    try {
      const result = await window.api.media.list({ limit: 12, sortBy: 'addedAt' })
      const items = Array.isArray(result) ? result : (result as any)?.items ?? []
      setRecentlyAdded(items)
    } catch (e) {
      console.error('Failed to load recently added:', e)
    } finally {
      setLoadingRecent(false)
    }
  }, [])

  const loadFavorites = useCallback(async () => {
    setLoadingFavorites(true)
    try {
      const result = await window.api.media.list({ limit: 12, liked: true })
      const items = Array.isArray(result) ? result : (result as any)?.items ?? []
      setFavorites(items)
    } catch (e) {
      console.error('Failed to load favorites:', e)
    } finally {
      setLoadingFavorites(false)
    }
  }, [])

  const loadMostWatched = useCallback(async () => {
    setLoadingMostWatched(true)
    try {
      const result = await window.api.invoke('watch:get-most-viewed', 12) as Array<{ id: string; viewCount: number }>
      // Fetch media details for each
      const withMedia = await Promise.all(
        result.map(async (item) => {
          try {
            const media = await window.api.media.get(item.id)
            return { ...media, viewCount: item.viewCount }
          } catch {
            return null
          }
        })
      )
      setMostWatched(withMedia.filter(Boolean) as Array<MediaItem & { viewCount: number }>)
    } catch (e) {
      console.error('Failed to load most watched:', e)
    } finally {
      setLoadingMostWatched(false)
    }
  }, [])

  const loadQuickStats = useCallback(async () => {
    try {
      const [allResult, videoResult, imageResult, favResult, watchStats] = await Promise.all([
        window.api.media.list({ limit: 1 }),
        window.api.media.list({ limit: 1, type: 'video' }),
        window.api.media.list({ limit: 1, type: 'image' }),
        window.api.media.list({ limit: 1, liked: true }),
        window.api.invoke('watch:get-stats').catch(() => ({ totalWatchTime: 0 }))
      ])

      setQuickStats({
        totalMedia: (allResult as any)?.total ?? 0,
        totalVideos: (videoResult as any)?.total ?? 0,
        totalImages: (imageResult as any)?.total ?? 0,
        totalFavorites: (favResult as any)?.total ?? 0,
        totalWatchTime: (watchStats as any)?.totalWatchTime ?? 0
      })
    } catch (e) {
      console.error('Failed to load quick stats:', e)
    }
  }, [])

  const loadWatchLater = useCallback(async () => {
    setLoadingWatchLater(true)
    try {
      const items = await window.api.invoke('watchLater:getQueue', { limit: 12 }) as Array<{ mediaId: string; priority: number }>
      // Fetch media details for each
      const withMedia = await Promise.all(
        items.map(async (item) => {
          try {
            const media = await window.api.media.get(item.mediaId)
            return { ...media, priority: item.priority }
          } catch {
            return null
          }
        })
      )
      setWatchLater(withMedia.filter(Boolean) as Array<MediaItem & { priority: number }>)
    } catch (e) {
      console.error('Failed to load watch later:', e)
    } finally {
      setLoadingWatchLater(false)
    }
  }, [])

  const pickRandomVideo = useCallback(async () => {
    setPickingRandom(true)
    try {
      const result = await window.api.media.list({ limit: 100, type: 'video' })
      const items = Array.isArray(result) ? result : (result as any)?.items ?? []
      if (items.length > 0) {
        const randomItem = items[Math.floor(Math.random() * items.length)]
        onPlayMedia(randomItem.id)
      }
    } catch (e) {
      console.error('Failed to pick random video:', e)
    } finally {
      setPickingRandom(false)
    }
  }, [onPlayMedia])

  useEffect(() => {
    loadContinueWatching()
    loadRecommendations()
    loadRecentlyAdded()
    loadFavorites()
    loadMostWatched()
    loadWatchLater()
    loadQuickStats()
  }, [loadContinueWatching, loadRecommendations, loadRecentlyAdded, loadFavorites, loadMostWatched, loadWatchLater, loadQuickStats])

  return (
    <div className="h-full overflow-y-auto">
      {/* Hero Section with Gradient Background */}
      <div className="relative bg-gradient-to-br from-zinc-900 via-zinc-900 to-zinc-800 border-b border-zinc-800">
        {/* Decorative gradient orbs */}
        <div className="absolute top-0 right-0 w-96 h-96 bg-gradient-to-br from-[var(--primary)]/20 to-purple-600/10 rounded-full blur-3xl" />
        <div className="absolute bottom-0 left-0 w-64 h-64 bg-gradient-to-tr from-blue-600/10 to-cyan-400/5 rounded-full blur-3xl" />

        <div className="relative p-8 pb-6">
          {/* Greeting with time-based icon */}
          <div className="mb-6">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-3 rounded-2xl bg-gradient-to-br from-[var(--primary)] to-pink-600 shadow-lg shadow-[var(--primary)]/30">
                {new Date().getHours() < 12 ? <Flame size={24} /> :
                 new Date().getHours() < 18 ? <Star size={24} /> :
                 <Crown size={24} />}
              </div>
              <div>
                <h1 className="text-3xl font-bold bg-gradient-to-r from-white via-white to-zinc-400 bg-clip-text text-transparent text-glow-subtle">
                  {getGreeting()}
                </h1>
                <p className="text-zinc-400 mt-0.5">Your personal media experience awaits</p>
              </div>
            </div>
          </div>

          {/* Quick Actions Bar - Enhanced */}
          <div className="flex flex-wrap gap-3 mb-6">
            <button
              onClick={pickRandomVideo}
              disabled={pickingRandom}
              className="group flex items-center gap-2.5 px-5 py-3 bg-gradient-to-r from-[var(--primary)] to-pink-500 hover:from-[var(--primary)] hover:to-pink-400 rounded-xl font-semibold transition-all shadow-lg shadow-[var(--primary)]/30 disabled:opacity-50 hover:shadow-xl hover:shadow-[var(--primary)]/40 hover:scale-[1.02] active:scale-[0.98]"
            >
              <Shuffle size={20} className={`${pickingRandom ? 'animate-spin' : 'group-hover:rotate-180 transition-transform duration-500'}`} />
              <span>Random Pick</span>
              <div className="ml-1 px-2 py-0.5 bg-white/20 rounded-md text-xs">R</div>
            </button>
            <button
              onClick={onNavigateToLibrary}
              className="group flex items-center gap-2.5 px-5 py-3 bg-zinc-800 hover:bg-zinc-700 rounded-xl font-semibold transition-all border border-zinc-700 hover:border-zinc-600 hover:scale-[1.02] active:scale-[0.98]"
            >
              <Film size={20} className="group-hover:scale-110 transition-transform" />
              <span>Browse Library</span>
            </button>
            {continueWatching.length > 0 && (
              <button
                onClick={() => onPlayMedia(continueWatching[0].mediaId)}
                className="group flex items-center gap-2.5 px-5 py-3 bg-gradient-to-r from-blue-600 to-cyan-500 hover:from-blue-500 hover:to-cyan-400 rounded-xl font-semibold transition-all shadow-lg shadow-blue-500/30 hover:shadow-xl hover:shadow-blue-500/40 hover:scale-[1.02] active:scale-[0.98]"
              >
                <Zap size={20} className="group-hover:animate-pulse" />
                <span>Quick Resume</span>
              </button>
            )}
            <button
              onClick={onNavigateToStats}
              className="flex items-center gap-2 px-4 py-3 bg-zinc-800/50 hover:bg-zinc-700/50 rounded-xl font-medium transition border border-zinc-700/50 hover:border-zinc-600/50 text-zinc-300 hover:text-white"
            >
              <Gamepad2 size={18} />
              <span>Challenges</span>
            </button>
          </div>

          {/* Quick Stats Card - Enhanced */}
          {quickStats && quickStats.totalMedia > 0 && (
            <div className="p-5 bg-zinc-800/40 backdrop-blur-sm rounded-2xl border border-zinc-700/50 shadow-xl card-shine">
              <div className="flex items-center gap-2 mb-4">
                <BarChart3 size={18} className="text-[var(--primary)]" />
                <span className="font-semibold text-white">Your Collection</span>
              </div>
              <div className="grid grid-cols-5 gap-6">
                <div className="text-center group cursor-default">
                  <div className="w-14 h-14 mx-auto mb-2 rounded-xl bg-gradient-to-br from-blue-500/20 to-blue-600/10 flex items-center justify-center group-hover:scale-110 transition-transform">
                    <Film size={24} className="text-blue-400" />
                  </div>
                  <div className="text-2xl font-bold text-white">{quickStats.totalMedia.toLocaleString()}</div>
                  <div className="text-[11px] text-zinc-500 uppercase tracking-wider font-medium">Total</div>
                </div>
                <div className="text-center group cursor-default">
                  <div className="w-14 h-14 mx-auto mb-2 rounded-xl bg-gradient-to-br from-green-500/20 to-green-600/10 flex items-center justify-center group-hover:scale-110 transition-transform">
                    <Play size={24} className="text-green-400" />
                  </div>
                  <div className="text-2xl font-bold text-white">{quickStats.totalVideos.toLocaleString()}</div>
                  <div className="text-[11px] text-zinc-500 uppercase tracking-wider font-medium">Videos</div>
                </div>
                <div className="text-center group cursor-default">
                  <div className="w-14 h-14 mx-auto mb-2 rounded-xl bg-gradient-to-br from-purple-500/20 to-purple-600/10 flex items-center justify-center group-hover:scale-110 transition-transform">
                    <Image size={24} className="text-purple-400" />
                  </div>
                  <div className="text-2xl font-bold text-white">{quickStats.totalImages.toLocaleString()}</div>
                  <div className="text-[11px] text-zinc-500 uppercase tracking-wider font-medium">Images</div>
                </div>
                <div className="text-center group cursor-default">
                  <div className="w-14 h-14 mx-auto mb-2 rounded-xl bg-gradient-to-br from-red-500/20 to-red-600/10 flex items-center justify-center group-hover:scale-110 transition-transform">
                    <Heart size={24} className="text-red-400" />
                  </div>
                  <div className="text-2xl font-bold text-white">{quickStats.totalFavorites.toLocaleString()}</div>
                  <div className="text-[11px] text-zinc-500 uppercase tracking-wider font-medium">Favorites</div>
                </div>
                <div className="text-center group cursor-default">
                  <div className="w-14 h-14 mx-auto mb-2 rounded-xl bg-gradient-to-br from-orange-500/20 to-orange-600/10 flex items-center justify-center group-hover:scale-110 transition-transform">
                    <Timer size={24} className="text-orange-400" />
                  </div>
                  <div className="text-2xl font-bold text-white">{formatWatchTime(quickStats.totalWatchTime)}</div>
                  <div className="text-[11px] text-zinc-500 uppercase tracking-wider font-medium">Watched</div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Content Sections */}
      <div className="p-6 space-y-2">

      {/* Continue Watching Section */}
      {continueWatching.length > 0 && (
        <HorizontalSection
          title="Continue Watching"
          icon={<Clock size={20} className="text-white" />}
          gradient="bg-gradient-to-br from-blue-500 to-blue-600"
          items={continueWatching.length}
          loading={loadingContinue}
          onRefresh={loadContinueWatching}
        >
          {continueWatching.map((item) => (
            <MediaCard
              key={item.mediaId}
              media={item}
              onClick={() => onPlayMedia(item.mediaId)}
              progress={item.completionPercent}
              badge={
                <span className="px-2 py-0.5 bg-blue-500/90 backdrop-blur-sm rounded-md text-[11px] text-white font-medium shadow-lg">
                  {formatTimeAgo(item.lastWatched)}
                </span>
              }
            />
          ))}
        </HorizontalSection>
      )}

      {/* Recommendations Section */}
      {recommendations.length > 0 && (
        <HorizontalSection
          title="Recommended For You"
          icon={<Sparkles size={20} className="text-white" />}
          gradient="bg-gradient-to-br from-purple-500 to-pink-500"
          items={recommendations.length}
          loading={loadingRecs}
          onRefresh={loadRecommendations}
        >
          {recommendations.map((item) => (
            <MediaCard
              key={item.id}
              media={item}
              onClick={() => onPlayMedia(item.id)}
              badge={
                <span className="px-2 py-0.5 bg-purple-500/90 backdrop-blur-sm rounded-md text-[11px] text-white font-medium truncate max-w-[120px] shadow-lg">
                  {item.reason}
                </span>
              }
            />
          ))}
        </HorizontalSection>
      )}

      {/* Favorites Section */}
      {favorites.length > 0 && (
        <HorizontalSection
          title="Your Favorites"
          icon={<Heart size={20} className="text-white" />}
          gradient="bg-gradient-to-br from-red-500 to-pink-500"
          items={favorites.length}
          loading={loadingFavorites}
          onRefresh={loadFavorites}
        >
          {favorites.map((item) => (
            <MediaCard
              key={item.id}
              media={item}
              onClick={() => onPlayMedia(item.id)}
              badge={
                <span className="px-2 py-0.5 bg-red-500/90 backdrop-blur-sm rounded-md text-[11px] text-white flex items-center gap-1 shadow-lg">
                  <Heart size={11} fill="currentColor" />
                </span>
              }
            />
          ))}
        </HorizontalSection>
      )}

      {/* Watch Later Section */}
      {watchLater.length > 0 && (
        <HorizontalSection
          title="Watch Later"
          icon={<ListVideo size={20} className="text-white" />}
          gradient="bg-gradient-to-br from-cyan-500 to-blue-500"
          items={watchLater.length}
          loading={loadingWatchLater}
          onRefresh={loadWatchLater}
        >
          {watchLater.map((item, idx) => (
            <MediaCard
              key={item.id}
              media={item}
              onClick={() => onPlayMedia(item.id)}
              rank={item.priority > 0 ? item.priority : undefined}
              badge={
                item.priority > 0 ? (
                  <span className="px-2 py-0.5 bg-cyan-500/90 backdrop-blur-sm rounded-md text-[11px] text-white font-medium shadow-lg">
                    Priority
                  </span>
                ) : undefined
              }
            />
          ))}
        </HorizontalSection>
      )}

      {/* Most Watched Section */}
      {mostWatched.length > 0 && (
        <HorizontalSection
          title="Most Watched"
          icon={<TrendingUp size={20} className="text-white" />}
          gradient="bg-gradient-to-br from-orange-500 to-red-500"
          items={mostWatched.length}
          loading={loadingMostWatched}
          onRefresh={loadMostWatched}
        >
          {mostWatched.map((item, idx) => (
            <MediaCard
              key={item.id}
              media={item}
              onClick={() => onPlayMedia(item.id)}
              rank={idx + 1}
              badge={
                <span className="px-2 py-0.5 bg-orange-500/90 backdrop-blur-sm rounded-md text-[11px] text-white font-medium shadow-lg flex items-center gap-1">
                  <Eye size={11} /> {item.viewCount}
                </span>
              }
            />
          ))}
        </HorizontalSection>
      )}

      {/* Recently Added Section */}
      <HorizontalSection
        title="Recently Added"
        icon={<Plus size={20} className="text-white" />}
        gradient="bg-gradient-to-br from-green-500 to-emerald-500"
        items={recentlyAdded.length}
        loading={loadingRecent}
        onRefresh={loadRecentlyAdded}
        onSeeAll={onNavigateToLibrary}
      >
        {recentlyAdded.length > 0 ? (
          recentlyAdded.map((item) => (
            <MediaCard
              key={item.id}
              media={item}
              onClick={() => onPlayMedia(item.id)}
              badge={
                <span className="px-2 py-0.5 bg-green-500/90 backdrop-blur-sm rounded-md text-[11px] text-white font-medium shadow-lg">
                  New
                </span>
              }
            />
          ))
        ) : !loadingRecent ? (
          <div className="flex-1 flex flex-col items-center justify-center py-16 text-zinc-500 w-full">
            <div className="w-16 h-16 rounded-2xl bg-zinc-800 flex items-center justify-center mb-4">
              <Film size={28} className="opacity-50" />
            </div>
            <div className="text-base font-medium">No media yet</div>
            <div className="text-sm text-zinc-600 mt-1">Add folders in Settings to get started</div>
          </div>
        ) : null}
      </HorizontalSection>

      {/* Empty state when nothing to show */}
      {continueWatching.length === 0 && recommendations.length === 0 && recentlyAdded.length === 0 && !loadingContinue && !loadingRecs && !loadingRecent && (
        <div className="flex flex-col items-center justify-center min-h-[400px] text-center py-16">
          <div className="w-24 h-24 rounded-3xl bg-gradient-to-br from-[var(--primary)]/20 to-purple-500/10 flex items-center justify-center mb-6">
            <Sparkles size={40} className="text-[var(--primary)]" />
          </div>
          <h2 className="text-2xl font-bold text-white mb-3">Welcome to Vault</h2>
          <p className="text-zinc-400 max-w-md text-base leading-relaxed">
            Add media folders in Settings to start building your collection.
            Your personalized dashboard will appear here once you start watching.
          </p>
          <button
            onClick={onNavigateToLibrary}
            className="mt-8 px-8 py-3 bg-gradient-to-r from-[var(--primary)] to-pink-500 hover:from-[var(--primary)] hover:to-pink-400 rounded-xl font-semibold transition-all shadow-lg shadow-[var(--primary)]/30 hover:shadow-xl hover:scale-[1.02]"
          >
            Go to Library
          </button>
        </div>
      )}
      </div>
    </div>
  )
}

export default HomeDashboard
