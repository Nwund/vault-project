// File: src/renderer/components/MediaTimeline.tsx
// Timeline view showing media by date with grouping and backend integration

import React, { useState, useMemo, useCallback, useEffect } from 'react'
import { Calendar, ChevronLeft, ChevronRight, Grid3X3, List, Film, Image as ImageIcon, Star, Play, Loader2, RefreshCw } from 'lucide-react'
import { formatDuration } from '../utils/formatters'

interface MediaItem {
  id: string
  title: string
  thumbnail?: string
  type: 'video' | 'image'
  date: number
  rating?: number
  duration?: number
}

interface MediaTimelineProps {
  items?: MediaItem[]
  view?: 'month' | 'week' | 'day'
  onSelect?: (id: string) => void
  onPlay?: (id: string) => void
  className?: string
}

// Helper to extract items from various API response formats
function extractItems<T>(result: any): T[] {
  if (!result) return []
  if (Array.isArray(result)) return result
  if (result.items && Array.isArray(result.items)) return result.items
  if (result.data && Array.isArray(result.data)) return result.data
  if (result.rows && Array.isArray(result.rows)) return result.rows
  return []
}

export function MediaTimeline({
  items: propItems,
  view: initialView = 'month',
  onSelect,
  onPlay,
  className = ''
}: MediaTimelineProps) {
  const [items, setItems] = useState<MediaItem[]>(propItems || [])
  const [loading, setLoading] = useState(!propItems)
  const [view, setView] = useState(initialView)
  const [currentDate, setCurrentDate] = useState(new Date())
  const [displayMode, setDisplayMode] = useState<'grid' | 'list'>('grid')

  // Fetch media from backend when date or view changes
  useEffect(() => {
    if (propItems) {
      setItems(propItems)
      return
    }

    const fetchMedia = async () => {
      setLoading(true)
      try {
        // Calculate date range based on current view
        const start = new Date(currentDate)
        const end = new Date(currentDate)

        if (view === 'day') {
          start.setHours(0, 0, 0, 0)
          end.setHours(23, 59, 59, 999)
        } else if (view === 'week') {
          start.setDate(currentDate.getDate() - currentDate.getDay())
          start.setHours(0, 0, 0, 0)
          end.setDate(start.getDate() + 6)
          end.setHours(23, 59, 59, 999)
        } else {
          // Month view - get 3 months of data for context
          start.setMonth(currentDate.getMonth() - 1, 1)
          start.setHours(0, 0, 0, 0)
          end.setMonth(currentDate.getMonth() + 2, 0)
          end.setHours(23, 59, 59, 999)
        }

        // Fetch media sorted by creation date
        const result = await window.api.media.list({
          limit: 500,
          sortBy: 'createdAt',
          sortOrder: 'desc'
        })

        const allMedia = extractItems(result)

        // Filter by date range and transform
        const filtered = allMedia
          .filter((m: any) => {
            const d = new Date(m.createdAt || m.addedAt || m.created_at || 0).getTime()
            return d >= start.getTime() && d <= end.getTime()
          })
          .map((m: any) => ({
            id: m.id,
            title: m.filename || m.title || 'Unknown',
            thumbnail: m.thumbPath || m.thumbnail,
            type: (m.type || 'video') as 'video' | 'image',
            date: new Date(m.createdAt || m.addedAt || m.created_at || 0).getTime(),
            rating: m.rating,
            duration: m.durationSec || m.duration
          }))

        setItems(filtered)
      } catch (e) {
        console.error('Failed to fetch media:', e)
      }
      setLoading(false)
    }

    fetchMedia()
  }, [propItems, currentDate, view])

  const grouped = useMemo(() => {
    const groups: Record<string, MediaItem[]> = {}
    items.forEach(item => {
      const d = new Date(item.date)
      let key: string
      if (view === 'day') {
        key = d.toISOString().split('T')[0]
      } else if (view === 'week') {
        const w = new Date(d)
        w.setDate(d.getDate() - d.getDay())
        key = w.toISOString().split('T')[0]
      } else {
        key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      }
      if (!groups[key]) groups[key] = []
      groups[key].push(item)
    })
    return Object.entries(groups).sort((a, b) => b[0].localeCompare(a[0]))
  }, [items, view])

  const currentPeriod = useMemo(() => {
    if (view === 'month') {
      return currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    }
    if (view === 'week') {
      const start = new Date(currentDate)
      start.setDate(currentDate.getDate() - currentDate.getDay())
      const end = new Date(start)
      end.setDate(start.getDate() + 6)
      return `${start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${end.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
    }
    return currentDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
  }, [currentDate, view])

  const navigate = useCallback((dir: -1 | 1) => {
    setCurrentDate(d => {
      const n = new Date(d)
      if (view === 'month') n.setMonth(d.getMonth() + dir)
      else if (view === 'week') n.setDate(d.getDate() + dir * 7)
      else n.setDate(d.getDate() + dir)
      return n
    })
  }, [view])

  const goToToday = useCallback(() => {
    setCurrentDate(new Date())
  }, [])

  const formatGroupLabel = (key: string) => {
    const d = new Date(key)
    if (view === 'day') return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
    if (view === 'week') return `Week of ${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
    return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
  }

  const handleSelect = useCallback((id: string) => {
    if (onSelect) {
      onSelect(id)
    }
  }, [onSelect])

  const handlePlay = useCallback((id: string) => {
    if (onPlay) {
      onPlay(id)
    } else {
      // Default: open video
      window.dispatchEvent(new CustomEvent('vault-open-video', {
        detail: { id }
      }))
    }
  }, [onPlay])

  const stats = useMemo(() => ({
    total: items.length,
    videos: items.filter(i => i.type === 'video').length,
    images: items.filter(i => i.type === 'image').length,
    totalDuration: items.reduce((acc, i) => acc + (i.duration || 0), 0)
  }), [items])

  return (
    <div className={`bg-zinc-900 rounded-xl border border-zinc-700 overflow-hidden ${className}`}>
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
        <div className="flex items-center gap-2">
          <Calendar size={16} className="text-[var(--primary)]" />
          <span className="font-semibold text-sm">Timeline</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex gap-1">
            {(['day', 'week', 'month'] as const).map(v => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`px-2 py-1 rounded text-xs transition ${view === v ? 'bg-[var(--primary)]' : 'bg-zinc-800 hover:bg-zinc-700'}`}
              >
                {v.charAt(0).toUpperCase() + v.slice(1)}
              </button>
            ))}
          </div>
          <button
            onClick={() => setDisplayMode(displayMode === 'grid' ? 'list' : 'grid')}
            className="p-1.5 rounded hover:bg-zinc-800"
            title={displayMode === 'grid' ? 'List view' : 'Grid view'}
          >
            {displayMode === 'grid' ? <List size={14} /> : <Grid3X3 size={14} />}
          </button>
        </div>
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-800">
        <button onClick={() => navigate(-1)} className="p-1 rounded hover:bg-zinc-800">
          <ChevronLeft size={16} />
        </button>
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{currentPeriod}</span>
          <button
            onClick={goToToday}
            className="px-2 py-0.5 rounded bg-zinc-800 text-xs hover:bg-zinc-700"
          >
            Today
          </button>
        </div>
        <button onClick={() => navigate(1)} className="p-1 rounded hover:bg-zinc-800">
          <ChevronRight size={16} />
        </button>
      </div>

      {/* Stats */}
      <div className="flex items-center justify-between px-4 py-1.5 border-b border-zinc-800 text-xs text-zinc-500">
        <span>{stats.total} items</span>
        <span>
          {stats.videos} videos • {stats.images} images
          {stats.totalDuration > 0 && ` • ${formatDuration(stats.totalDuration)}`}
        </span>
      </div>

      {/* Content */}
      <div className="max-h-96 overflow-y-auto">
        {loading ? (
          <div className="py-12 text-center">
            <Loader2 size={24} className="mx-auto animate-spin text-zinc-500" />
            <p className="text-sm text-zinc-500 mt-2">Loading timeline...</p>
          </div>
        ) : grouped.length === 0 ? (
          <div className="py-12 text-center text-zinc-500">
            <Calendar size={32} className="mx-auto mb-2 opacity-50" />
            <p className="text-sm">No media in this period</p>
            <p className="text-xs mt-1">Try navigating to a different date</p>
          </div>
        ) : (
          grouped.map(([key, groupItems]) => (
            <div key={key} className="border-b border-zinc-800/50 last:border-0">
              <div className="flex items-center justify-between px-4 py-2 bg-zinc-800/30 sticky top-0 z-10">
                <span className="text-xs font-medium">{formatGroupLabel(key)}</span>
                <span className="text-xs text-zinc-500">{groupItems.length} items</span>
              </div>

              {displayMode === 'grid' ? (
                <div className="grid grid-cols-4 gap-2 p-2">
                  {groupItems.map(item => (
                    <div
                      key={item.id}
                      onClick={() => handleSelect(item.id)}
                      className="relative aspect-video rounded overflow-hidden cursor-pointer group bg-zinc-800"
                    >
                      {item.thumbnail ? (
                        <img src={item.thumbnail} className="w-full h-full object-cover" alt="" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          {item.type === 'video' ? (
                            <Film size={16} className="text-zinc-600" />
                          ) : (
                            <ImageIcon size={16} className="text-zinc-600" />
                          )}
                        </div>
                      )}
                      {item.rating != null && item.rating > 0 && (
                        <div className="absolute top-1 right-1 flex items-center gap-0.5 px-1 py-0.5 rounded bg-black/70 text-[10px]">
                          <Star size={8} className="text-yellow-400 fill-yellow-400" />
                          {item.rating}
                        </div>
                      )}
                      {item.duration != null && item.duration > 0 && (
                        <div className="absolute bottom-1 right-1 px-1 py-0.5 rounded bg-black/70 text-[10px]">
                          {formatDuration(item.duration)}
                        </div>
                      )}
                      <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition">
                        <button
                          onClick={e => { e.stopPropagation(); handlePlay(item.id) }}
                          className="p-2 rounded-full bg-[var(--primary)] hover:scale-110 transition"
                        >
                          <Play size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div>
                  {groupItems.map(item => (
                    <div
                      key={item.id}
                      onClick={() => handleSelect(item.id)}
                      className="flex items-center gap-3 px-4 py-2 hover:bg-zinc-800/50 cursor-pointer group"
                    >
                      <div className="relative w-16 h-10 rounded bg-zinc-800 overflow-hidden flex-shrink-0">
                        {item.thumbnail ? (
                          <img src={item.thumbnail} className="w-full h-full object-cover" alt="" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            {item.type === 'video' ? (
                              <Film size={14} className="text-zinc-600" />
                            ) : (
                              <ImageIcon size={14} className="text-zinc-600" />
                            )}
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm truncate">{item.title}</div>
                        <div className="flex items-center gap-2 text-xs text-zinc-500">
                          <span>{item.type}</span>
                          {item.duration != null && item.duration > 0 && (
                            <span>• {formatDuration(item.duration)}</span>
                          )}
                        </div>
                      </div>
                      {item.rating != null && item.rating > 0 && (
                        <div className="flex items-center gap-0.5 text-xs">
                          <Star size={10} className="text-yellow-400 fill-yellow-400" />
                          {item.rating}
                        </div>
                      )}
                      <button
                        onClick={e => { e.stopPropagation(); handlePlay(item.id) }}
                        className="p-1.5 rounded bg-[var(--primary)] opacity-0 group-hover:opacity-100 transition"
                      >
                        <Play size={10} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
export default MediaTimeline
