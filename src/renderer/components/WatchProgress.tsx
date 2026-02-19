// File: src/renderer/components/WatchProgress.tsx
// Continue watching progress tracker

import React, { useState, useCallback, useMemo, useEffect } from 'react'
import { Play, Clock, Trash2, ChevronRight, Calendar, Film, RotateCcw, CheckCircle, Eye, MoreHorizontal, Loader2, RefreshCw } from 'lucide-react'
import { formatDuration, formatDate } from '../utils/formatters'

interface WatchItem {
  id: string
  title: string
  thumbnail?: string
  duration: number
  progress: number
  lastWatched: Date
  type: 'video' | 'image'
}

interface WatchProgressProps {
  items?: WatchItem[]
  onResume?: (id: string, time?: number) => void
  onRemove?: (id: string) => void
  className?: string
}

export function WatchProgress({ items: propItems, onResume, onRemove, className = '' }: WatchProgressProps) {
  const [items, setItems] = useState<WatchItem[]>(propItems || [])
  const [loading, setLoading] = useState(!propItems)
  const [filter, setFilter] = useState<'all' | 'inprogress' | 'completed'>('inprogress')
  const [showMenu, setShowMenu] = useState<string | null>(null)

  // Fetch watch history from backend
  useEffect(() => {
    if (propItems) {
      setItems(propItems)
      return
    }

    const fetchHistory = async () => {
      setLoading(true)
      try {
        const history = await window.api.invoke('watch:get-history', 50)
        if (history && Array.isArray(history)) {
          // Get media details for each history item
          const enrichedItems: WatchItem[] = []
          for (const h of history.slice(0, 30)) {
            try {
              const media = await window.api.invoke('media:getById', h.mediaId || h.media_id)
              if (media) {
                enrichedItems.push({
                  id: h.mediaId || h.media_id,
                  title: media.filename || 'Unknown',
                  thumbnail: media.thumbPath || undefined,
                  duration: media.durationSec || h.duration || 0,
                  progress: h.watchedSec || h.progress || 0,
                  lastWatched: new Date(h.lastWatched || h.watchedAt || h.timestamp || Date.now()),
                  type: media.type || 'video'
                })
              }
            } catch (e) {
              // Skip items that fail to load
            }
          }
          setItems(enrichedItems)
        }
      } catch (e) {
        console.error('Failed to fetch watch history:', e)
      }
      setLoading(false)
    }

    fetchHistory()
  }, [propItems])

  const filtered = useMemo(() => {
    let list = [...items].sort((a, b) => b.lastWatched.getTime() - a.lastWatched.getTime())
    if (filter === 'inprogress') list = list.filter(i => i.progress > 0 && i.progress < i.duration * 0.9)
    if (filter === 'completed') list = list.filter(i => i.progress >= i.duration * 0.9)
    return list
  }, [items, filter])

  const stats = useMemo(() => ({
    total: items.length,
    inProgress: items.filter(i => i.progress > 0 && i.progress < i.duration * 0.9).length,
    completed: items.filter(i => i.progress >= i.duration * 0.9).length,
    totalTime: items.reduce((acc, i) => acc + i.progress, 0)
  }), [items])

  const handleRemove = useCallback(async (id: string) => {
    if (onRemove) {
      onRemove(id)
    }
    setItems(prev => prev.filter(i => i.id !== id))
    setShowMenu(null)
  }, [onRemove])

  const handleResume = useCallback((id: string, progress: number) => {
    if (onResume) {
      onResume(id, progress)
    }
  }, [onResume])

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const history = await window.api.invoke('watch:get-history', 50)
      if (history && Array.isArray(history)) {
        const enrichedItems: WatchItem[] = []
        for (const h of history.slice(0, 30)) {
          try {
            const media = await window.api.invoke('media:getById', h.mediaId || h.media_id)
            if (media) {
              enrichedItems.push({
                id: h.mediaId || h.media_id,
                title: media.filename || 'Unknown',
                thumbnail: media.thumbPath || undefined,
                duration: media.durationSec || h.duration || 0,
                progress: h.watchedSec || h.progress || 0,
                lastWatched: new Date(h.lastWatched || h.watchedAt || h.timestamp || Date.now()),
                type: media.type || 'video'
              })
            }
          } catch (e) {}
        }
        setItems(enrichedItems)
      }
    } catch (e) {
      console.error('Failed to refresh watch history:', e)
    }
    setLoading(false)
  }, [])

  return (
    <div className={`bg-zinc-900 rounded-xl border border-zinc-700 overflow-hidden ${className}`}>
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
        <div className="flex items-center gap-2">
          <Clock size={16} className="text-[var(--primary)]" />
          <span className="font-semibold text-sm">Continue Watching</span>
        </div>
        <button onClick={refresh} className="p-1.5 rounded hover:bg-zinc-800" disabled={loading}>
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Stats */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-800 text-xs text-zinc-500">
        <span>{stats.total} items • {formatDuration(stats.totalTime)} watched</span>
        <div className="flex gap-1">
          {(['all', 'inprogress', 'completed'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-2 py-0.5 rounded ${filter === f ? 'bg-zinc-800 text-white' : 'hover:bg-zinc-800/50'}`}
            >
              {f === 'all' ? 'All' : f === 'inprogress' ? 'In Progress' : 'Completed'}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      <div className="max-h-80 overflow-y-auto">
        {loading ? (
          <div className="py-12 text-center">
            <Loader2 size={24} className="mx-auto animate-spin text-zinc-500" />
            <p className="text-sm text-zinc-500 mt-2">Loading history...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-12 text-center text-zinc-500">
            <Clock size={32} className="mx-auto mb-2 opacity-50" />
            <p className="text-sm">No watch history</p>
            <p className="text-xs mt-1">Videos you watch will appear here</p>
          </div>
        ) : (
          filtered.map(item => {
            const percent = item.duration > 0 ? (item.progress / item.duration) * 100 : 0
            const isCompleted = percent >= 90

            return (
              <div key={item.id} className="relative group flex items-center gap-3 px-4 py-3 hover:bg-zinc-800/50">
                {/* Thumbnail */}
                <div className="relative w-20 h-12 rounded bg-zinc-800 overflow-hidden flex-shrink-0">
                  {item.thumbnail ? (
                    <img src={item.thumbnail} className="w-full h-full object-cover" alt="" />
                  ) : (
                    <Film size={16} className="absolute inset-0 m-auto text-zinc-600" />
                  )}
                  <div className="absolute bottom-0 left-0 right-0 h-1 bg-zinc-700">
                    <div className="h-full bg-[var(--primary)]" style={{ width: `${Math.min(percent, 100)}%` }} />
                  </div>
                  {isCompleted && (
                    <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                      <CheckCircle size={16} className="text-green-400" />
                    </div>
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{item.title}</div>
                  <div className="flex items-center gap-2 text-xs text-zinc-500">
                    <span>{formatDuration(item.progress)} / {formatDuration(item.duration)}</span>
                    <span>•</span>
                    <span>{formatDate(item.lastWatched)}</span>
                  </div>
                </div>

                {/* Actions */}
                <button
                  onClick={() => handleResume(item.id, item.progress)}
                  className="p-2 rounded-full bg-[var(--primary)] opacity-0 group-hover:opacity-100 transition"
                  title="Resume"
                >
                  <Play size={14} />
                </button>

                <div className="relative">
                  <button
                    onClick={() => setShowMenu(showMenu === item.id ? null : item.id)}
                    className="p-2 rounded opacity-0 group-hover:opacity-100 hover:bg-zinc-700"
                  >
                    <MoreHorizontal size={14} />
                  </button>
                  {showMenu === item.id && (
                    <div className="absolute right-0 top-full mt-1 bg-zinc-800 rounded-lg border border-zinc-700 shadow-xl py-1 z-10">
                      <button
                        onClick={() => handleResume(item.id, 0)}
                        className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-zinc-700 text-xs"
                      >
                        <RotateCcw size={12} />Start Over
                      </button>
                      <button
                        onClick={() => handleRemove(item.id)}
                        className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-zinc-700 text-red-400 text-xs"
                      >
                        <Trash2 size={12} />Remove
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
export default WatchProgress
