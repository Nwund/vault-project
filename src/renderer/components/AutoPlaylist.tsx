// File: src/renderer/components/AutoPlaylist.tsx
// Auto-generated playlists based on viewing habits with backend integration

import React, { useState, useCallback } from 'react'
import { Sparkles, Play, Clock, TrendingUp, Heart, Star, Calendar, ChevronRight, Shuffle, Plus, Check, Loader2, RefreshCw, Eye } from 'lucide-react'
import { formatDuration } from '../utils/formatters'

type PlaylistType = 'most_watched' | 'recently_added' | 'top_rated' | 'favorites' | 'unwatched' | 'trending' | 'random_mix'

interface AutoPlaylistItem {
  id: string
  title: string
  thumbnail?: string
  duration?: number
  type: 'video' | 'image'
}

interface AutoPlaylist {
  type: PlaylistType
  title: string
  description: string
  icon: React.ElementType
  items: AutoPlaylistItem[]
  color: string
}

interface AutoPlaylistProps {
  onPlay?: (items: AutoPlaylistItem[]) => void
  onSave?: (type: PlaylistType, name: string, items: AutoPlaylistItem[]) => void
  className?: string
}

const PLAYLIST_TYPES: Array<{ type: PlaylistType; title: string; desc: string; icon: React.ElementType; color: string }> = [
  { type: 'most_watched', title: 'Most Watched', desc: 'Your top replays', icon: TrendingUp, color: 'text-blue-400' },
  { type: 'recently_added', title: 'Recently Added', desc: 'Fresh content', icon: Clock, color: 'text-green-400' },
  { type: 'top_rated', title: 'Top Rated', desc: '5-star favorites', icon: Star, color: 'text-yellow-400' },
  { type: 'favorites', title: 'Favorites', desc: 'Your loved items', icon: Heart, color: 'text-red-400' },
  { type: 'unwatched', title: 'Unwatched', desc: 'Discover new', icon: Eye, color: 'text-purple-400' },
  { type: 'trending', title: 'Hot This Week', desc: 'Most viewed recently', icon: TrendingUp, color: 'text-orange-400' },
  { type: 'random_mix', title: 'Random Mix', desc: 'Surprise selection', icon: Shuffle, color: 'text-pink-400' }
]

// Helper to extract items from various API response formats
function extractItems<T>(result: any): T[] {
  if (!result) return []
  if (Array.isArray(result)) return result
  if (result.items && Array.isArray(result.items)) return result.items
  if (result.data && Array.isArray(result.data)) return result.data
  if (result.rows && Array.isArray(result.rows)) return result.rows
  return []
}

export function AutoPlaylist({ onPlay, onSave, className = '' }: AutoPlaylistProps) {
  const [playlists, setPlaylists] = useState<AutoPlaylist[]>([])
  const [loading, setLoading] = useState<PlaylistType | null>(null)
  const [expanded, setExpanded] = useState<PlaylistType | null>(null)
  const [saved, setSaved] = useState<Set<PlaylistType>>(new Set())

  const generatePlaylist = useCallback(async (type: PlaylistType) => {
    setLoading(type)
    try {
      let items: AutoPlaylistItem[] = []
      const limit = 50

      switch (type) {
        case 'most_watched': {
          // Get watch history sorted by view count
          try {
            const history = await window.api.invoke('watch:get-history', 200)
            if (history && Array.isArray(history)) {
              // Count views per media
              const viewCounts: Record<string, number> = {}
              for (const h of history) {
                const id = h.mediaId || h.media_id
                viewCounts[id] = (viewCounts[id] || 0) + 1
              }
              // Get top viewed IDs
              const topIds = Object.entries(viewCounts)
                .sort((a, b) => b[1] - a[1])
                .slice(0, limit)
                .map(([id]) => id)

              // Fetch media details for top viewed
              for (const id of topIds) {
                try {
                  const media = await window.api.invoke('media:getById', id)
                  if (media && media.type === 'video') {
                    items.push({
                      id: media.id,
                      title: media.filename || 'Unknown',
                      thumbnail: media.thumbPath,
                      duration: media.durationSec || 0,
                      type: media.type || 'video'
                    })
                  }
                } catch {}
              }
            }
          } catch {}

          // Fallback: get by view count from media
          if (items.length === 0) {
            const result = await window.api.media.list({
              limit,
              type: 'video',
              sortBy: 'viewCount',
              sortOrder: 'desc'
            })
            items = extractItems(result).map((m: any) => ({
              id: m.id,
              title: m.filename || 'Unknown',
              thumbnail: m.thumbPath,
              duration: m.durationSec || 0,
              type: m.type || 'video'
            }))
          }
          break
        }

        case 'recently_added': {
          const result = await window.api.media.list({
            limit,
            type: 'video',
            sortBy: 'createdAt',
            sortOrder: 'desc'
          })
          items = extractItems(result).map((m: any) => ({
            id: m.id,
            title: m.filename || 'Unknown',
            thumbnail: m.thumbPath,
            duration: m.durationSec || 0,
            type: m.type || 'video'
          }))
          break
        }

        case 'top_rated': {
          const result = await window.api.media.list({
            limit,
            type: 'video',
            sortBy: 'rating',
            sortOrder: 'desc',
            minRating: 4
          })
          items = extractItems(result)
            .filter((m: any) => (m.rating || 0) >= 4)
            .map((m: any) => ({
              id: m.id,
              title: m.filename || 'Unknown',
              thumbnail: m.thumbPath,
              duration: m.durationSec || 0,
              type: m.type || 'video'
            }))
          break
        }

        case 'favorites': {
          const result = await window.api.media.list({
            limit,
            type: 'video',
            favorite: true,
            sortBy: 'updatedAt',
            sortOrder: 'desc'
          })
          items = extractItems(result)
            .filter((m: any) => m.favorite)
            .map((m: any) => ({
              id: m.id,
              title: m.filename || 'Unknown',
              thumbnail: m.thumbPath,
              duration: m.durationSec || 0,
              type: m.type || 'video'
            }))
          break
        }

        case 'unwatched': {
          // Get all videos
          const result = await window.api.media.list({
            limit: 200,
            type: 'video',
            sortBy: 'createdAt',
            sortOrder: 'desc'
          })
          const allMedia = extractItems(result)

          // Get watched IDs
          const watchedIds = new Set<string>()
          try {
            const history = await window.api.invoke('watch:get-history', 500)
            if (history && Array.isArray(history)) {
              for (const h of history) {
                watchedIds.add(h.mediaId || h.media_id)
              }
            }
          } catch {}

          // Filter to unwatched
          items = allMedia
            .filter((m: any) => !watchedIds.has(m.id) && (m.viewCount || 0) === 0)
            .slice(0, limit)
            .map((m: any) => ({
              id: m.id,
              title: m.filename || 'Unknown',
              thumbnail: m.thumbPath,
              duration: m.durationSec || 0,
              type: m.type || 'video'
            }))
          break
        }

        case 'trending': {
          // Get recent watch history (last 7 days)
          try {
            const history = await window.api.invoke('watch:get-history', 500)
            if (history && Array.isArray(history)) {
              const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000
              const recentViews: Record<string, number> = {}

              for (const h of history) {
                const watchedAt = h.lastWatched || h.watchedAt || h.timestamp
                if (new Date(watchedAt).getTime() > weekAgo) {
                  const id = h.mediaId || h.media_id
                  recentViews[id] = (recentViews[id] || 0) + 1
                }
              }

              const trendingIds = Object.entries(recentViews)
                .sort((a, b) => b[1] - a[1])
                .slice(0, limit)
                .map(([id]) => id)

              for (const id of trendingIds) {
                try {
                  const media = await window.api.invoke('media:getById', id)
                  if (media && media.type === 'video') {
                    items.push({
                      id: media.id,
                      title: media.filename || 'Unknown',
                      thumbnail: media.thumbPath,
                      duration: media.durationSec || 0,
                      type: media.type || 'video'
                    })
                  }
                } catch {}
              }
            }
          } catch {}

          // Fallback
          if (items.length === 0) {
            const result = await window.api.media.list({
              limit,
              type: 'video',
              sortBy: 'updatedAt',
              sortOrder: 'desc'
            })
            items = extractItems(result).map((m: any) => ({
              id: m.id,
              title: m.filename || 'Unknown',
              thumbnail: m.thumbPath,
              duration: m.durationSec || 0,
              type: m.type || 'video'
            }))
          }
          break
        }

        case 'random_mix': {
          const result = await window.api.media.list({
            limit: 200,
            type: 'video'
          })
          const allMedia = extractItems(result)

          // Shuffle and take random selection
          const shuffled = [...allMedia].sort(() => Math.random() - 0.5)
          items = shuffled.slice(0, limit).map((m: any) => ({
            id: m.id,
            title: m.filename || 'Unknown',
            thumbnail: m.thumbPath,
            duration: m.durationSec || 0,
            type: m.type || 'video'
          }))
          break
        }
      }

      const config = PLAYLIST_TYPES.find(p => p.type === type)!
      setPlaylists(prev => {
        const filtered = prev.filter(p => p.type !== type)
        return [...filtered, {
          type,
          title: config.title,
          description: config.desc,
          icon: config.icon,
          items,
          color: config.color
        }]
      })
      setExpanded(type)
    } catch (e) {
      console.error('Failed to generate playlist:', e)
    } finally {
      setLoading(null)
    }
  }, [])

  const handlePlay = useCallback((items: AutoPlaylistItem[]) => {
    if (onPlay) {
      onPlay(items)
    } else {
      // Default behavior: open first video
      if (items.length > 0) {
        window.dispatchEvent(new CustomEvent('vault-open-video', {
          detail: { id: items[0].id }
        }))
      }
    }
  }, [onPlay])

  const handleSave = useCallback(async (type: PlaylistType) => {
    const playlist = playlists.find(p => p.type === type)
    if (playlist) {
      if (onSave) {
        onSave(type, playlist.title, playlist.items)
      } else {
        // Default behavior: save as playlist
        try {
          await window.api.invoke('playlists:create', {
            name: `${playlist.title} - Auto Generated`,
            description: `Auto-generated playlist: ${playlist.description}`,
            items: playlist.items.map(i => i.id)
          })
        } catch (e) {
          console.error('Failed to save playlist:', e)
        }
      }
      setSaved(prev => new Set([...prev, type]))
    }
  }, [playlists, onSave])

  const totalDuration = useCallback((items: AutoPlaylistItem[]) =>
    items.reduce((acc, i) => acc + (i.duration || 0), 0), [])

  const generateAll = useCallback(async () => {
    for (const config of PLAYLIST_TYPES) {
      await generatePlaylist(config.type)
    }
  }, [generatePlaylist])

  return (
    <div className={`bg-zinc-900 rounded-xl border border-zinc-700 overflow-hidden ${className}`}>
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
        <div className="flex items-center gap-2">
          <Sparkles size={16} className="text-[var(--primary)]" />
          <span className="font-semibold text-sm">Auto Playlists</span>
        </div>
        <button
          onClick={generateAll}
          disabled={loading !== null}
          className="flex items-center gap-1 text-xs text-zinc-500 hover:text-white disabled:opacity-50"
        >
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
          Generate All
        </button>
      </div>

      <div className="max-h-96 overflow-y-auto">
        {PLAYLIST_TYPES.map(config => {
          const playlist = playlists.find(p => p.type === config.type)
          const isLoading = loading === config.type
          const isExpanded = expanded === config.type
          const isSaved = saved.has(config.type)
          const Icon = config.icon

          return (
            <div key={config.type} className="border-b border-zinc-800/50 last:border-0">
              <div
                className="flex items-center gap-3 px-4 py-3 hover:bg-zinc-800/30 cursor-pointer"
                onClick={() => playlist ? setExpanded(isExpanded ? null : config.type) : generatePlaylist(config.type)}
              >
                <div className={`w-8 h-8 rounded-lg bg-zinc-800 flex items-center justify-center ${config.color}`}>
                  <Icon size={16} />
                </div>
                <div className="flex-1">
                  <div className="text-sm font-medium">{config.title}</div>
                  <div className="text-xs text-zinc-500">{config.desc}</div>
                </div>
                {isLoading ? (
                  <Loader2 size={14} className="animate-spin text-[var(--primary)]" />
                ) : playlist ? (
                  <>
                    <span className="text-xs text-zinc-500">{playlist.items.length} items</span>
                    <ChevronRight size={14} className={`text-zinc-600 transition ${isExpanded ? 'rotate-90' : ''}`} />
                  </>
                ) : (
                  <button className="px-2 py-1 rounded bg-zinc-800 text-xs hover:bg-zinc-700">
                    Generate
                  </button>
                )}
              </div>

              {/* Expanded content */}
              {isExpanded && playlist && (
                <div className="px-4 pb-3">
                  {playlist.items.length === 0 ? (
                    <div className="py-4 text-center text-zinc-500 text-sm">
                      No items found for this playlist type
                    </div>
                  ) : (
                    <>
                      <div className="flex gap-2 mb-2">
                        <button
                          onClick={() => handlePlay(playlist.items)}
                          className="flex-1 flex items-center justify-center gap-1 py-2 bg-[var(--primary)] rounded text-sm hover:opacity-90"
                        >
                          <Play size={14} />
                          Play All
                        </button>
                        <button
                          onClick={() => handlePlay([...playlist.items].sort(() => Math.random() - 0.5))}
                          className="p-2 rounded bg-zinc-800 hover:bg-zinc-700"
                          title="Shuffle"
                        >
                          <Shuffle size={14} />
                        </button>
                        {!isSaved ? (
                          <button
                            onClick={() => handleSave(config.type)}
                            className="p-2 rounded bg-zinc-800 hover:bg-zinc-700"
                            title="Save as Playlist"
                          >
                            <Plus size={14} />
                          </button>
                        ) : (
                          <button className="p-2 rounded bg-green-500/20 text-green-400" title="Saved">
                            <Check size={14} />
                          </button>
                        )}
                        <button
                          onClick={() => generatePlaylist(config.type)}
                          className="p-2 rounded bg-zinc-800 hover:bg-zinc-700"
                          title="Refresh"
                        >
                          <RefreshCw size={14} />
                        </button>
                      </div>
                      <div className="text-xs text-zinc-500 mb-2">
                        {formatDuration(totalDuration(playlist.items))} total duration
                      </div>
                      <div className="grid grid-cols-4 gap-1">
                        {playlist.items.slice(0, 8).map(item => (
                          <div
                            key={item.id}
                            className="aspect-video rounded overflow-hidden bg-zinc-800 cursor-pointer hover:ring-1 hover:ring-[var(--primary)]"
                            onClick={(e) => {
                              e.stopPropagation()
                              window.dispatchEvent(new CustomEvent('vault-open-video', {
                                detail: { id: item.id }
                              }))
                            }}
                          >
                            {item.thumbnail ? (
                              <img src={item.thumbnail} className="w-full h-full object-cover" alt="" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-zinc-600">
                                <Play size={16} />
                              </div>
                            )}
                          </div>
                        ))}
                        {playlist.items.length > 8 && (
                          <div className="aspect-video rounded bg-zinc-800 flex items-center justify-center text-xs text-zinc-500">
                            +{playlist.items.length - 8}
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
export default AutoPlaylist
