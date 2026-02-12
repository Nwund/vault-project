// File: src/renderer/components/HomeDashboard.tsx
// Home dashboard with Continue Watching, Recommendations, Recently Added, Favorites, and Most Watched

import React, { useState, useEffect, useCallback } from 'react'
import { Play, Clock, Sparkles, Plus, ChevronRight, RefreshCw, Film, Image, Heart, TrendingUp, Shuffle, Zap, ListVideo, BarChart3, Eye, Timer } from 'lucide-react'

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
}

// URL cache for thumbnails
const thumbCache = new Map<string, string>()
async function getThumbUrl(path: string): Promise<string> {
  if (thumbCache.has(path)) return thumbCache.get(path)!
  const url = await window.api.thumbs.getUrl(path)
  thumbCache.set(path, url)
  return url
}

function formatDuration(sec: number | null | undefined): string {
  if (!sec) return ''
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

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

function MediaCard({ media, onClick, badge, progress }: {
  media: MediaItem
  onClick: () => void
  badge?: React.ReactNode
  progress?: number
}) {
  const [thumbUrl, setThumbUrl] = useState('')
  const [isHovered, setIsHovered] = useState(false)

  useEffect(() => {
    if (media.thumbPath) {
      getThumbUrl(media.thumbPath).then(setThumbUrl).catch(() => {})
    }
  }, [media.thumbPath])

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className="flex-shrink-0 w-44 cursor-pointer group"
    >
      <div className="relative aspect-video bg-zinc-800 rounded-lg overflow-hidden mb-2">
        {thumbUrl ? (
          <img
            src={thumbUrl}
            alt={media.filename}
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-zinc-600">
            {media.type === 'video' ? <Film size={24} /> : <Image size={24} />}
          </div>
        )}

        {/* Play overlay on hover */}
        <div className={`absolute inset-0 bg-black/50 flex items-center justify-center transition-opacity duration-200 ${isHovered ? 'opacity-100' : 'opacity-0'}`}>
          <div className="w-12 h-12 rounded-full bg-white/90 flex items-center justify-center">
            <Play size={24} className="text-black ml-1" />
          </div>
        </div>

        {/* Progress bar */}
        {progress !== undefined && progress > 0 && (
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/50">
            <div
              className="h-full bg-[var(--primary)]"
              style={{ width: `${Math.min(progress, 100)}%` }}
            />
          </div>
        )}

        {/* Duration badge */}
        {media.durationSec && (
          <div className="absolute bottom-2 right-2 px-1.5 py-0.5 bg-black/80 rounded text-[10px] text-white">
            {formatDuration(media.durationSec)}
          </div>
        )}

        {/* Custom badge */}
        {badge && (
          <div className="absolute top-2 left-2">
            {badge}
          </div>
        )}
      </div>

      <div className="text-xs text-white/80 truncate group-hover:text-white transition-colors">
        {media.filename}
      </div>
    </div>
  )
}

function HorizontalSection({ title, icon, items, loading, onRefresh, onSeeAll, children }: {
  title: string
  icon: React.ReactNode
  items: number
  loading?: boolean
  onRefresh?: () => void
  onSeeAll?: () => void
  children: React.ReactNode
}) {
  return (
    <div className="mb-8">
      <div className="flex items-center justify-between mb-4 px-1">
        <div className="flex items-center gap-2">
          {icon}
          <span className="font-semibold text-white">{title}</span>
          <span className="text-xs text-zinc-500">({items})</span>
        </div>
        <div className="flex items-center gap-2">
          {onRefresh && (
            <button
              onClick={onRefresh}
              disabled={loading}
              className="p-1.5 rounded-lg hover:bg-white/10 transition disabled:opacity-50"
              title="Refresh"
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            </button>
          )}
          {onSeeAll && (
            <button
              onClick={onSeeAll}
              className="flex items-center gap-1 text-xs text-[var(--primary)] hover:text-[var(--primary)]/80 transition"
            >
              See All <ChevronRight size={14} />
            </button>
          )}
        </div>
      </div>

      <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-zinc-700 scrollbar-track-transparent">
        {children}
      </div>
    </div>
  )
}

export function HomeDashboard({ onPlayMedia, onNavigateToLibrary }: HomeDashboardProps) {
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
      const items = await window.api.invoke('watchLater:list', 12) as Array<{ mediaId: string; priority: number }>
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
    <div className="h-full overflow-y-auto p-6">
      {/* Greeting */}
      <div className="mb-4">
        <h1 className="text-2xl font-bold bg-gradient-to-r from-white to-zinc-400 bg-clip-text text-transparent">
          {getGreeting()}
        </h1>
        <p className="text-sm text-zinc-500">Welcome to your media vault</p>
      </div>

      {/* Quick Actions Bar */}
      <div className="flex gap-3 mb-6">
        <button
          onClick={pickRandomVideo}
          disabled={pickingRandom}
          className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-pink-500 to-orange-500 hover:from-pink-600 hover:to-orange-600 rounded-lg font-medium transition-all shadow-lg shadow-pink-500/20 disabled:opacity-50"
        >
          <Shuffle size={18} className={pickingRandom ? 'animate-spin' : ''} />
          <span>Random Pick</span>
        </button>
        <button
          onClick={onNavigateToLibrary}
          className="flex items-center gap-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg font-medium transition"
        >
          <Film size={18} />
          <span>Browse Library</span>
        </button>
        {continueWatching.length > 0 && (
          <button
            onClick={() => onPlayMedia(continueWatching[0].mediaId)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg font-medium transition"
          >
            <Zap size={18} />
            <span>Quick Resume</span>
          </button>
        )}
      </div>

      {/* Quick Stats Card */}
      {quickStats && quickStats.totalMedia > 0 && (
        <div className="mb-6 p-4 bg-gradient-to-r from-zinc-800/50 to-zinc-900/50 rounded-xl border border-zinc-700/50">
          <div className="flex items-center gap-2 mb-3">
            <BarChart3 size={16} className="text-zinc-400" />
            <span className="text-sm font-medium text-zinc-300">Library Overview</span>
          </div>
          <div className="grid grid-cols-5 gap-4">
            <div className="text-center">
              <div className="flex items-center justify-center gap-1 text-2xl font-bold text-white">
                <Film size={18} className="text-blue-400" />
                {quickStats.totalMedia.toLocaleString()}
              </div>
              <div className="text-[10px] text-zinc-500 uppercase tracking-wider">Total</div>
            </div>
            <div className="text-center">
              <div className="flex items-center justify-center gap-1 text-2xl font-bold text-white">
                <Play size={18} className="text-green-400" />
                {quickStats.totalVideos.toLocaleString()}
              </div>
              <div className="text-[10px] text-zinc-500 uppercase tracking-wider">Videos</div>
            </div>
            <div className="text-center">
              <div className="flex items-center justify-center gap-1 text-2xl font-bold text-white">
                <Image size={18} className="text-purple-400" />
                {quickStats.totalImages.toLocaleString()}
              </div>
              <div className="text-[10px] text-zinc-500 uppercase tracking-wider">Images</div>
            </div>
            <div className="text-center">
              <div className="flex items-center justify-center gap-1 text-2xl font-bold text-white">
                <Heart size={18} className="text-red-400" />
                {quickStats.totalFavorites.toLocaleString()}
              </div>
              <div className="text-[10px] text-zinc-500 uppercase tracking-wider">Favorites</div>
            </div>
            <div className="text-center">
              <div className="flex items-center justify-center gap-1 text-2xl font-bold text-white">
                <Timer size={18} className="text-orange-400" />
                {formatWatchTime(quickStats.totalWatchTime)}
              </div>
              <div className="text-[10px] text-zinc-500 uppercase tracking-wider">Watched</div>
            </div>
          </div>
        </div>
      )}

      {/* Continue Watching Section */}
      {continueWatching.length > 0 && (
        <HorizontalSection
          title="Continue Watching"
          icon={<Clock size={18} className="text-blue-400" />}
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
                <span className="px-1.5 py-0.5 bg-blue-500/80 rounded text-[10px] text-white">
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
          icon={<Sparkles size={18} className="text-purple-400" />}
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
                <span className="px-1.5 py-0.5 bg-purple-500/80 rounded text-[10px] text-white truncate max-w-[120px]">
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
          icon={<Heart size={18} className="text-red-400" />}
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
                <span className="px-1.5 py-0.5 bg-red-500/80 rounded text-[10px] text-white flex items-center gap-1">
                  <Heart size={10} fill="currentColor" />
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
          icon={<ListVideo size={18} className="text-cyan-400" />}
          items={watchLater.length}
          loading={loadingWatchLater}
          onRefresh={loadWatchLater}
        >
          {watchLater.map((item) => (
            <MediaCard
              key={item.id}
              media={item}
              onClick={() => onPlayMedia(item.id)}
              badge={
                item.priority > 0 ? (
                  <span className="px-1.5 py-0.5 bg-cyan-500/80 rounded text-[10px] text-white">
                    #{item.priority}
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
          icon={<TrendingUp size={18} className="text-orange-400" />}
          items={mostWatched.length}
          loading={loadingMostWatched}
          onRefresh={loadMostWatched}
        >
          {mostWatched.map((item) => (
            <MediaCard
              key={item.id}
              media={item}
              onClick={() => onPlayMedia(item.id)}
              badge={
                <span className="px-1.5 py-0.5 bg-orange-500/80 rounded text-[10px] text-white">
                  {item.viewCount} views
                </span>
              }
            />
          ))}
        </HorizontalSection>
      )}

      {/* Recently Added Section */}
      <HorizontalSection
        title="Recently Added"
        icon={<Plus size={18} className="text-green-400" />}
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
            />
          ))
        ) : !loadingRecent ? (
          <div className="flex-1 flex flex-col items-center justify-center py-12 text-zinc-500">
            <Film size={32} className="mb-2 opacity-50" />
            <div className="text-sm">No media yet</div>
            <div className="text-xs">Add folders in Settings to get started</div>
          </div>
        ) : null}
      </HorizontalSection>

      {/* Empty state when nothing to show */}
      {continueWatching.length === 0 && recommendations.length === 0 && recentlyAdded.length === 0 && !loadingContinue && !loadingRecs && !loadingRecent && (
        <div className="flex flex-col items-center justify-center h-full text-center">
          <Sparkles size={48} className="text-zinc-600 mb-4" />
          <h2 className="text-xl font-semibold mb-2">Welcome to Vault</h2>
          <p className="text-zinc-500 max-w-md">
            Add media folders in Settings to start building your collection.
            Your personalized dashboard will appear here once you start watching.
          </p>
          <button
            onClick={onNavigateToLibrary}
            className="mt-6 px-6 py-2 bg-[var(--primary)] hover:bg-[var(--primary)]/80 rounded-lg font-medium transition"
          >
            Go to Library
          </button>
        </div>
      )}
    </div>
  )
}

export default HomeDashboard
