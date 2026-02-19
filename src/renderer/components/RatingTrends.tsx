// File: src/renderer/components/RatingTrends.tsx
// Display rating history trends with charts

import React, { useState, useEffect, useCallback, useMemo } from 'react'
import {
  TrendingUp,
  TrendingDown,
  Minus,
  Star,
  History,
  RefreshCw,
  Film,
  Loader2,
  ArrowUp,
  ArrowDown,
  Zap
} from 'lucide-react'
import { formatDate } from '../utils/formatters'

interface RatingTrend {
  mediaId: string
  filename: string
  thumbPath?: string
  currentRating: number
  initialRating: number
  changeCount: number
  trend: 'up' | 'down' | 'stable'
  avgRating: number
}

interface RatingStats {
  totalChanges: number
  mediaWithChanges: number
  avgChangesPerMedia: number
  avgRatingChange: number
  risingCount: number
  fallingCount: number
}

type ViewMode = 'rising' | 'falling' | 'volatile' | 'recent'

interface RatingTrendsProps {
  onMediaClick?: (mediaId: string) => void
  className?: string
}

export function RatingTrends({ onMediaClick, className = '' }: RatingTrendsProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('rising')
  const [items, setItems] = useState<RatingTrend[]>([])
  const [stats, setStats] = useState<RatingStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [recentItems, setRecentItems] = useState<Array<{
    mediaId: string
    filename: string
    thumbPath?: string
    oldRating: number | null
    newRating: number
    changedAt: number
  }>>([])

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [statsResult, risingResult, fallingResult, volatileResult, recentResult] = await Promise.all([
        window.api.invoke<RatingStats>('ratingHistory:getStats'),
        window.api.invoke<RatingTrend[]>('ratingHistory:getRisingStars', 20),
        window.api.invoke<RatingTrend[]>('ratingHistory:getFallingStars', 20),
        window.api.invoke<RatingTrend[]>('ratingHistory:getMostVolatile', 20),
        window.api.invoke<any[]>('ratingHistory:getRecentlyRated', 20)
      ])

      setStats(statsResult || null)
      setRecentItems(recentResult || [])

      // Set items based on current view mode
      switch (viewMode) {
        case 'rising':
          setItems(risingResult || [])
          break
        case 'falling':
          setItems(fallingResult || [])
          break
        case 'volatile':
          setItems(volatileResult || [])
          break
      }
    } catch (e) {
      console.error('Failed to load rating trends:', e)
    }
    setLoading(false)
  }, [viewMode])

  useEffect(() => {
    loadData()
  }, [loadData])

  const handleMediaClick = useCallback((mediaId: string) => {
    if (onMediaClick) {
      onMediaClick(mediaId)
    } else {
      window.dispatchEvent(new CustomEvent('vault-open-video', { detail: { id: mediaId } }))
    }
  }, [onMediaClick])

  const TrendIcon = useCallback(({ trend }: { trend: 'up' | 'down' | 'stable' }) => {
    switch (trend) {
      case 'up':
        return <TrendingUp size={14} className="text-green-400" />
      case 'down':
        return <TrendingDown size={14} className="text-red-400" />
      default:
        return <Minus size={14} className="text-zinc-500" />
    }
  }, [])

  const renderStars = useCallback((rating: number) => {
    return (
      <div className="flex items-center gap-0.5">
        {[1, 2, 3, 4, 5].map(i => (
          <Star
            key={i}
            size={10}
            className={i <= rating ? 'fill-yellow-400 text-yellow-400' : 'text-zinc-600'}
          />
        ))}
      </div>
    )
  }, [])

  const modes: Array<{ id: ViewMode; label: string; icon: React.ElementType; color: string }> = [
    { id: 'rising', label: 'Rising', icon: TrendingUp, color: 'text-green-400' },
    { id: 'falling', label: 'Falling', icon: TrendingDown, color: 'text-red-400' },
    { id: 'volatile', label: 'Volatile', icon: Zap, color: 'text-orange-400' },
    { id: 'recent', label: 'Recent', icon: History, color: 'text-blue-400' }
  ]

  return (
    <div className={`bg-zinc-900 rounded-xl border border-zinc-700 overflow-hidden ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
        <div className="flex items-center gap-2">
          <TrendingUp size={16} className="text-[var(--primary)]" />
          <span className="font-semibold text-sm">Rating Trends</span>
        </div>
        <button
          onClick={loadData}
          disabled={loading}
          className="p-1.5 rounded hover:bg-zinc-800 transition"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Stats summary */}
      {stats && (
        <div className="grid grid-cols-3 gap-2 px-4 py-3 border-b border-zinc-800 text-center text-xs">
          <div>
            <div className="text-lg font-bold text-[var(--primary)]">{stats.totalChanges}</div>
            <div className="text-zinc-500">Total Changes</div>
          </div>
          <div>
            <div className="text-lg font-bold text-green-400">{stats.risingCount}</div>
            <div className="text-zinc-500">Rising</div>
          </div>
          <div>
            <div className="text-lg font-bold text-red-400">{stats.fallingCount}</div>
            <div className="text-zinc-500">Falling</div>
          </div>
        </div>
      )}

      {/* View mode tabs */}
      <div className="flex gap-1 px-3 py-2 border-b border-zinc-800 overflow-x-auto">
        {modes.map(mode => {
          const Icon = mode.icon
          return (
            <button
              key={mode.id}
              onClick={() => setViewMode(mode.id)}
              className={`flex items-center gap-1 px-3 py-1.5 rounded text-xs whitespace-nowrap transition
                ${viewMode === mode.id ? 'bg-[var(--primary)]' : 'bg-zinc-800 hover:bg-zinc-700'}`}
            >
              <Icon size={12} className={viewMode === mode.id ? '' : mode.color} />
              {mode.label}
            </button>
          )
        })}
      </div>

      {/* Content */}
      <div className="max-h-80 overflow-y-auto">
        {loading ? (
          <div className="py-8 text-center">
            <Loader2 size={24} className="mx-auto animate-spin text-zinc-500" />
            <p className="text-sm text-zinc-500 mt-2">Loading trends...</p>
          </div>
        ) : viewMode === 'recent' ? (
          recentItems.length === 0 ? (
            <div className="py-8 text-center text-zinc-500">
              <History size={24} className="mx-auto mb-2 opacity-50" />
              <p className="text-sm">No recent ratings</p>
            </div>
          ) : (
            recentItems.map((item, idx) => (
              <div
                key={`${item.mediaId}-${idx}`}
                onClick={() => handleMediaClick(item.mediaId)}
                className="flex items-center gap-3 px-4 py-2 hover:bg-zinc-800/50 cursor-pointer"
              >
                <div className="relative w-12 h-8 rounded bg-zinc-800 overflow-hidden flex-shrink-0">
                  {item.thumbPath ? (
                    <img src={item.thumbPath} className="w-full h-full object-cover" alt="" />
                  ) : (
                    <Film size={14} className="absolute inset-0 m-auto text-zinc-600" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm truncate">{item.filename}</div>
                  <div className="text-xs text-zinc-500">{formatDate(item.changedAt)}</div>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  {item.oldRating !== null && (
                    <>
                      <span className="text-zinc-500">{item.oldRating.toFixed(1)}</span>
                      {item.newRating > item.oldRating ? (
                        <ArrowUp size={12} className="text-green-400" />
                      ) : item.newRating < item.oldRating ? (
                        <ArrowDown size={12} className="text-red-400" />
                      ) : (
                        <Minus size={12} className="text-zinc-500" />
                      )}
                    </>
                  )}
                  <span className={item.oldRating === null ? '' : item.newRating > (item.oldRating || 0) ? 'text-green-400' : item.newRating < (item.oldRating || 0) ? 'text-red-400' : ''}>
                    {item.newRating.toFixed(1)}
                  </span>
                </div>
              </div>
            ))
          )
        ) : items.length === 0 ? (
          <div className="py-8 text-center text-zinc-500">
            <TrendingUp size={24} className="mx-auto mb-2 opacity-50" />
            <p className="text-sm">No trends found</p>
            <p className="text-xs mt-1">Rate more media to see trends</p>
          </div>
        ) : (
          items.map(item => {
            const change = item.currentRating - item.initialRating

            return (
              <div
                key={item.mediaId}
                onClick={() => handleMediaClick(item.mediaId)}
                className="flex items-center gap-3 px-4 py-2 hover:bg-zinc-800/50 cursor-pointer"
              >
                <div className="relative w-14 h-10 rounded bg-zinc-800 overflow-hidden flex-shrink-0">
                  {item.thumbPath ? (
                    <img src={item.thumbPath} className="w-full h-full object-cover" alt="" />
                  ) : (
                    <Film size={14} className="absolute inset-0 m-auto text-zinc-600" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm truncate">{item.filename}</div>
                  <div className="flex items-center gap-2 mt-0.5">
                    {renderStars(Math.round(item.currentRating))}
                    <span className="text-xs text-zinc-500">
                      {item.changeCount} change{item.changeCount !== 1 ? 's' : ''}
                    </span>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <TrendIcon trend={item.trend} />
                  <span className={`text-xs font-medium ${
                    change > 0 ? 'text-green-400' : change < 0 ? 'text-red-400' : 'text-zinc-500'
                  }`}>
                    {change > 0 ? '+' : ''}{change.toFixed(1)}
                  </span>
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

export default RatingTrends
