// File: src/renderer/components/QuickFavorites.tsx
// Quick access floating panel for favorite media

import React, { useState, useEffect, useCallback } from 'react'
import { Heart, Play, ChevronDown, ChevronUp, X, Shuffle, ExternalLink } from 'lucide-react'
import { toFileUrlCached } from '../hooks/usePerformance'
import { formatDuration } from '../utils/formatters'

interface MediaItem {
  id: string
  filename: string
  thumbPath?: string | null
  type: string
  durationSec?: number | null
}

interface QuickFavoritesProps {
  onPlayMedia: (mediaId: string) => void
  onOpenInLibrary?: (mediaId: string) => void
  position?: 'left' | 'right'
  className?: string
}

export function QuickFavorites({
  onPlayMedia,
  onOpenInLibrary,
  position = 'right',
  className = ''
}: QuickFavoritesProps) {
  const [favorites, setFavorites] = useState<MediaItem[]>([])
  const [loading, setLoading] = useState(true)
  const [isExpanded, setIsExpanded] = useState(false)
  const [hoveredId, setHoveredId] = useState<string | null>(null)

  const loadFavorites = useCallback(async () => {
    setLoading(true)
    try {
      const result = await window.api.media.list({ limit: 20, liked: true })
      const items = Array.isArray(result) ? result : (result as any)?.items ?? []
      setFavorites(items)
    } catch (e) {
      console.error('Failed to load favorites:', e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadFavorites()
  }, [loadFavorites])

  const playRandom = useCallback(() => {
    if (favorites.length === 0) return
    const random = favorites[Math.floor(Math.random() * favorites.length)]
    onPlayMedia(random.id)
  }, [favorites, onPlayMedia])

  if (favorites.length === 0 && !loading) {
    return null
  }

  return (
    <div
      className={`fixed ${position === 'right' ? 'right-4' : 'left-4'} top-1/2 -translate-y-1/2 z-40 ${className}`}
    >
      {/* Toggle button */}
      <button
        onClick={() => setIsExpanded(prev => !prev)}
        className={`absolute ${position === 'right' ? '-left-10' : '-right-10'} top-1/2 -translate-y-1/2 w-8 h-16 bg-zinc-900/90 backdrop-blur-sm border border-zinc-700 rounded-lg flex flex-col items-center justify-center gap-1 hover:bg-zinc-800 transition shadow-lg`}
        title={isExpanded ? 'Hide favorites' : 'Show favorites'}
      >
        <Heart size={14} className="text-pink-400 fill-pink-400" />
        <span className="text-[10px] text-zinc-400">{favorites.length}</span>
        {position === 'right' ? (
          isExpanded ? <ChevronDown size={10} className="rotate-90" /> : <ChevronUp size={10} className="rotate-90" />
        ) : (
          isExpanded ? <ChevronUp size={10} className="-rotate-90" /> : <ChevronDown size={10} className="-rotate-90" />
        )}
      </button>

      {/* Favorites panel */}
      <div
        className={`bg-zinc-900/95 backdrop-blur-xl rounded-2xl border border-zinc-700 shadow-2xl overflow-hidden transition-all duration-300 ${
          isExpanded ? 'opacity-100 scale-100' : 'opacity-0 scale-95 pointer-events-none'
        }`}
        style={{ width: isExpanded ? 220 : 0 }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-800">
          <div className="flex items-center gap-2">
            <Heart size={14} className="text-pink-400 fill-pink-400" />
            <span className="text-sm font-semibold">Quick Favorites</span>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={playRandom}
              className="p-1.5 rounded-lg hover:bg-zinc-800 transition text-zinc-400 hover:text-white"
              title="Play random favorite"
            >
              <Shuffle size={14} />
            </button>
            <button
              onClick={() => setIsExpanded(false)}
              className="p-1.5 rounded-lg hover:bg-zinc-800 transition text-zinc-400"
            >
              <X size={14} />
            </button>
          </div>
        </div>

        {/* Favorites list */}
        <div className="max-h-[60vh] overflow-y-auto p-2 space-y-1">
          {loading ? (
            // Skeleton loading
            Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center gap-2 p-1.5 rounded-lg">
                <div className="w-16 h-10 bg-zinc-800 rounded sexy-shimmer" />
                <div className="flex-1 space-y-1">
                  <div className="h-3 bg-zinc-800 rounded sexy-shimmer w-4/5" />
                  <div className="h-2 bg-zinc-800 rounded sexy-shimmer w-1/2" />
                </div>
              </div>
            ))
          ) : (
            favorites.map(item => (
              <div
                key={item.id}
                className="group flex items-center gap-2 p-1.5 rounded-lg hover:bg-zinc-800 cursor-pointer transition"
                onClick={() => onPlayMedia(item.id)}
                onMouseEnter={() => setHoveredId(item.id)}
                onMouseLeave={() => setHoveredId(null)}
              >
                {/* Thumbnail */}
                <div className="relative w-16 h-10 bg-zinc-800 rounded overflow-hidden flex-shrink-0">
                  {item.thumbPath ? (
                    <LazyThumb thumbPath={item.thumbPath} />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-zinc-600">
                      <Heart size={14} />
                    </div>
                  )}
                  {/* Play overlay */}
                  <div className={`absolute inset-0 bg-black/50 flex items-center justify-center transition ${hoveredId === item.id ? 'opacity-100' : 'opacity-0'}`}>
                    <Play size={16} className="text-white" fill="white" />
                  </div>
                  {/* Duration badge */}
                  {item.durationSec && (
                    <div className="absolute bottom-0.5 right-0.5 px-1 py-0.5 bg-black/80 rounded text-[9px] text-white">
                      {formatDuration(item.durationSec)}
                    </div>
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-white truncate">{item.filename}</div>
                  <div className="text-[10px] text-zinc-500 capitalize">{item.type}</div>
                </div>

                {/* Quick actions */}
                {onOpenInLibrary && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      onOpenInLibrary(item.id)
                    }}
                    className="p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-zinc-700 transition"
                    title="Show in library"
                  >
                    <ExternalLink size={12} className="text-zinc-400" />
                  </button>
                )}
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        {favorites.length > 0 && (
          <div className="px-3 py-2 border-t border-zinc-800 text-center">
            <span className="text-[10px] text-zinc-500">
              {favorites.length} favorites
            </span>
          </div>
        )}
      </div>
    </div>
  )
}

// Lazy loading thumbnail
function LazyThumb({ thumbPath }: { thumbPath: string }) {
  const [url, setUrl] = useState('')
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    toFileUrlCached(thumbPath).then(setUrl).catch(() => {})
  }, [thumbPath])

  if (!url) return <div className="w-full h-full bg-zinc-700 sexy-shimmer" />

  return (
    <img
      src={url}
      alt=""
      className={`w-full h-full object-cover transition-opacity ${loaded ? 'opacity-100' : 'opacity-0'}`}
      onLoad={() => setLoaded(true)}
    />
  )
}

export default QuickFavorites
