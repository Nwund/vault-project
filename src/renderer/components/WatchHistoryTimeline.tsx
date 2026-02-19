// File: src/renderer/components/WatchHistoryTimeline.tsx
// Visual timeline showing watch history with session groupings

import React, { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Clock,
  Play,
  Calendar,
  Film,
  Eye,
  Star,
  Heart,
  ChevronDown,
  ChevronUp,
  Loader2,
  RefreshCw,
  Trash2,
  Filter,
  X
} from 'lucide-react'
import { toFileUrlCached } from '../hooks/usePerformance'
import { formatDuration } from '../utils/formatters'

interface WatchHistoryItem {
  id: string
  mediaId: string
  filename: string
  thumbPath: string | null
  type: string
  viewedAt: number
  watchDuration?: number
  rating?: number
  isFavorite?: boolean
}

interface SessionGroup {
  date: string
  items: WatchHistoryItem[]
  totalDuration: number
  startTime: number
  endTime: number
}

interface WatchHistoryTimelineProps {
  onSelectMedia?: (mediaId: string) => void
  onPlayMedia?: (mediaId: string) => void
  className?: string
}

export function WatchHistoryTimeline({
  onSelectMedia,
  onPlayMedia,
  className = ''
}: WatchHistoryTimelineProps) {
  const [history, setHistory] = useState<WatchHistoryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedDays, setExpandedDays] = useState<Set<string>>(new Set())
  const [filter, setFilter] = useState<'all' | 'videos' | 'images' | 'favorites'>('all')
  const [timeRange, setTimeRange] = useState<'7d' | '30d' | '90d' | 'all'>('30d')

  const loadHistory = useCallback(async () => {
    setLoading(true)
    try {
      // Calculate date range
      let since: number | undefined
      if (timeRange !== 'all') {
        const days = timeRange === '7d' ? 7 : timeRange === '30d' ? 30 : 90
        since = Date.now() - days * 24 * 60 * 60 * 1000
      }

      const result = await window.api.invoke<WatchHistoryItem[]>('watchHistory:list', {
        limit: 500,
        since
      })
      setHistory(result)

      // Auto-expand today and yesterday
      const today = new Date().toDateString()
      const yesterday = new Date(Date.now() - 86400000).toDateString()
      setExpandedDays(new Set([today, yesterday]))
    } catch (e) {
      console.error('Failed to load watch history:', e)
    } finally {
      setLoading(false)
    }
  }, [timeRange])

  useEffect(() => {
    loadHistory()
  }, [loadHistory])

  // Group by date and filter
  const sessionGroups = useMemo(() => {
    const filtered = history.filter(item => {
      if (filter === 'videos') return item.type === 'video'
      if (filter === 'images') return item.type === 'image' || item.type === 'gif'
      if (filter === 'favorites') return item.isFavorite
      return true
    })

    const groups = new Map<string, SessionGroup>()

    for (const item of filtered) {
      const date = new Date(item.viewedAt).toDateString()
      const existing = groups.get(date)

      if (existing) {
        existing.items.push(item)
        existing.totalDuration += item.watchDuration || 0
        existing.startTime = Math.min(existing.startTime, item.viewedAt)
        existing.endTime = Math.max(existing.endTime, item.viewedAt)
      } else {
        groups.set(date, {
          date,
          items: [item],
          totalDuration: item.watchDuration || 0,
          startTime: item.viewedAt,
          endTime: item.viewedAt
        })
      }
    }

    // Sort items within each group by time (newest first)
    for (const group of groups.values()) {
      group.items.sort((a, b) => b.viewedAt - a.viewedAt)
    }

    // Convert to array and sort by date (newest first)
    return Array.from(groups.values()).sort((a, b) =>
      new Date(b.date).getTime() - new Date(a.date).getTime()
    )
  }, [history, filter])

  const toggleDay = useCallback((date: string) => {
    setExpandedDays(prev => {
      const next = new Set(prev)
      if (next.has(date)) {
        next.delete(date)
      } else {
        next.add(date)
      }
      return next
    })
  }, [])

  const handleClearHistory = useCallback(async () => {
    if (confirm('Are you sure you want to clear your watch history?')) {
      try {
        await window.api.invoke('watchHistory:clear')
        setHistory([])
      } catch (e) {
        console.error('Failed to clear history:', e)
      }
    }
  }, [])

  const formatRelativeDate = (dateStr: string): string => {
    const date = new Date(dateStr)
    const today = new Date()
    const yesterday = new Date(Date.now() - 86400000)

    if (date.toDateString() === today.toDateString()) return 'Today'
    if (date.toDateString() === yesterday.toDateString()) return 'Yesterday'

    const daysAgo = Math.floor((today.getTime() - date.getTime()) / 86400000)
    if (daysAgo < 7) return `${daysAgo} days ago`

    return date.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })
  }

  const totalStats = useMemo(() => {
    return {
      totalItems: history.length,
      totalDuration: history.reduce((sum, h) => sum + (h.watchDuration || 0), 0),
      uniqueDays: sessionGroups.length
    }
  }, [history, sessionGroups])

  return (
    <div className={`bg-zinc-900/95 rounded-2xl border border-zinc-700 overflow-hidden ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[var(--primary)]/20 flex items-center justify-center">
            <Clock size={20} className="text-[var(--primary)]" />
          </div>
          <div>
            <h2 className="font-semibold">Watch History</h2>
            <p className="text-xs text-zinc-400">
              {totalStats.totalItems} items • {formatDuration(totalStats.totalDuration)} watched
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={loadHistory}
            className="p-2 rounded-lg hover:bg-zinc-800 transition"
            title="Refresh"
          >
            <RefreshCw size={16} className="text-zinc-400" />
          </button>
          <button
            onClick={handleClearHistory}
            className="p-2 rounded-lg hover:bg-red-500/20 transition"
            title="Clear history"
          >
            <Trash2 size={16} className="text-zinc-400 hover:text-red-400" />
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 px-5 py-3 border-b border-zinc-800">
        {/* Type filter */}
        <div className="flex items-center gap-1 p-1 bg-zinc-800/50 rounded-lg">
          {(['all', 'videos', 'images', 'favorites'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition ${
                filter === f
                  ? 'bg-[var(--primary)] text-white'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              {f === 'all' ? 'All' : f === 'videos' ? 'Videos' : f === 'images' ? 'Images' : 'Favorites'}
            </button>
          ))}
        </div>

        <div className="flex-1" />

        {/* Time range */}
        <select
          value={timeRange}
          onChange={e => setTimeRange(e.target.value as any)}
          className="px-3 py-1.5 bg-zinc-800 border border-zinc-700 rounded-lg text-sm outline-none focus:border-[var(--primary)]"
        >
          <option value="7d">Last 7 days</option>
          <option value="30d">Last 30 days</option>
          <option value="90d">Last 90 days</option>
          <option value="all">All time</option>
        </select>
      </div>

      {/* Timeline */}
      <div className="max-h-[60vh] overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 size={24} className="animate-spin text-zinc-500" />
          </div>
        ) : sessionGroups.length === 0 ? (
          <div className="py-12 text-center text-zinc-500">
            <Clock size={32} className="mx-auto mb-2 opacity-50" />
            <p>No watch history</p>
            <p className="text-xs mt-1">Start watching to build your history</p>
          </div>
        ) : (
          <div className="divide-y divide-zinc-800">
            {sessionGroups.map(group => (
              <div key={group.date}>
                {/* Day header */}
                <button
                  onClick={() => toggleDay(group.date)}
                  className="w-full flex items-center gap-3 px-5 py-3 hover:bg-zinc-800/50 transition"
                >
                  <div className="flex items-center gap-3 flex-1">
                    <Calendar size={16} className="text-zinc-500" />
                    <span className="font-medium">{formatRelativeDate(group.date)}</span>
                    <span className="text-xs text-zinc-500">
                      {group.items.length} items
                    </span>
                    {group.totalDuration > 0 && (
                      <span className="text-xs text-zinc-500">
                        • {formatDuration(group.totalDuration)}
                      </span>
                    )}
                  </div>
                  {expandedDays.has(group.date) ? (
                    <ChevronUp size={16} className="text-zinc-500" />
                  ) : (
                    <ChevronDown size={16} className="text-zinc-500" />
                  )}
                </button>

                {/* Items */}
                {expandedDays.has(group.date) && (
                  <div className="px-5 pb-4 space-y-2">
                    {group.items.map(item => (
                      <HistoryItem
                        key={`${item.mediaId}-${item.viewedAt}`}
                        item={item}
                        onSelect={() => onSelectMedia?.(item.mediaId)}
                        onPlay={() => onPlayMedia?.(item.mediaId)}
                      />
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// Individual history item
function HistoryItem({
  item,
  onSelect,
  onPlay
}: {
  item: WatchHistoryItem
  onSelect?: () => void
  onPlay?: () => void
}) {
  const [thumbUrl, setThumbUrl] = useState('')

  useEffect(() => {
    if (item.thumbPath) {
      toFileUrlCached(item.thumbPath).then(setThumbUrl).catch(() => {})
    }
  }, [item.thumbPath])

  const viewTime = new Date(item.viewedAt).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit'
  })

  return (
    <div
      className="flex items-center gap-3 p-2 rounded-xl bg-zinc-800/30 hover:bg-zinc-800/60 cursor-pointer transition group"
      onClick={onSelect}
    >
      {/* Timeline connector */}
      <div className="flex flex-col items-center w-12 flex-shrink-0">
        <span className="text-xs text-zinc-500">{viewTime}</span>
        <div className="w-px h-4 bg-zinc-700" />
      </div>

      {/* Thumbnail */}
      <div className="relative w-20 h-12 bg-zinc-800 rounded-lg overflow-hidden flex-shrink-0">
        {thumbUrl ? (
          <img src={thumbUrl} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-zinc-600">
            <Film size={16} />
          </div>
        )}
        {/* Play overlay */}
        <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition">
          <button
            onClick={(e) => {
              e.stopPropagation()
              onPlay?.()
            }}
            className="p-1.5 bg-[var(--primary)] rounded-full"
          >
            <Play size={12} fill="white" />
          </button>
        </div>
        {/* Type badge */}
        <div className="absolute bottom-1 right-1 px-1 py-0.5 bg-black/70 rounded text-[8px] uppercase">
          {item.type}
        </div>
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate">{item.filename}</div>
        <div className="flex items-center gap-2 text-xs text-zinc-500">
          {item.watchDuration && item.watchDuration > 0 && (
            <span className="flex items-center gap-1">
              <Eye size={10} />
              {formatDuration(item.watchDuration)}
            </span>
          )}
          {item.rating && item.rating > 0 && (
            <span className="flex items-center gap-1 text-amber-400">
              <Star size={10} fill="currentColor" />
              {item.rating}
            </span>
          )}
          {item.isFavorite && (
            <span className="text-pink-400">
              <Heart size={10} fill="currentColor" />
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

// Compact watch history widget for sidebar
export function WatchHistoryWidget({
  onSelectMedia,
  className = ''
}: {
  onSelectMedia?: (mediaId: string) => void
  className?: string
}) {
  const [recentItems, setRecentItems] = useState<WatchHistoryItem[]>([])

  useEffect(() => {
    window.api.invoke<WatchHistoryItem[]>('watchHistory:list', { limit: 5 })
      .then(setRecentItems)
      .catch(() => {})
  }, [])

  if (recentItems.length === 0) return null

  return (
    <div className={`space-y-2 ${className}`}>
      <div className="flex items-center gap-2 text-xs text-zinc-500 font-medium">
        <Clock size={12} />
        Recently Watched
      </div>
      {recentItems.map(item => (
        <button
          key={`${item.mediaId}-${item.viewedAt}`}
          onClick={() => onSelectMedia?.(item.mediaId)}
          className="w-full flex items-center gap-2 p-2 rounded-lg hover:bg-zinc-800 transition text-left"
        >
          <div className="w-10 h-6 bg-zinc-800 rounded overflow-hidden flex-shrink-0">
            {item.thumbPath && <ThumbImage path={item.thumbPath} />}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs truncate">{item.filename}</div>
          </div>
        </button>
      ))}
    </div>
  )
}

function ThumbImage({ path }: { path: string }) {
  const [url, setUrl] = useState('')
  useEffect(() => {
    toFileUrlCached(path).then(setUrl).catch(() => {})
  }, [path])
  if (!url) return null
  return <img src={url} alt="" className="w-full h-full object-cover" />
}

export default WatchHistoryTimeline
