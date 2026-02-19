// File: src/renderer/components/MediaQueue.tsx
// Playback queue with ordering, shuffle, and persistence

import React, { useState, useCallback, useMemo, useEffect } from 'react'
import { ListOrdered, Play, Pause, SkipForward, SkipBack, Shuffle, Repeat, Repeat1, Trash2, GripVertical, X, Plus, Clock, Film, Loader2, RefreshCw, Save } from 'lucide-react'
import { formatDuration } from '../utils/formatters'

interface QueueItem {
  id: string
  title: string
  thumbnail?: string
  duration?: number
  type: 'video' | 'image'
}

type RepeatMode = 'off' | 'all' | 'one'

interface MediaQueueProps {
  items?: QueueItem[]
  currentIndex?: number
  isPlaying?: boolean
  onPlay?: (index: number) => void
  onPause?: () => void
  onNext?: () => void
  onPrev?: () => void
  onReorder?: (from: number, to: number) => void
  onRemove?: (index: number) => void
  onClear?: () => void
  onShuffle?: () => void
  repeatMode?: RepeatMode
  onRepeatChange?: (mode: RepeatMode) => void
  className?: string
}

const STORAGE_KEY = 'vault-media-queue'

export function MediaQueue({
  items: propItems,
  currentIndex: propCurrentIndex = 0,
  isPlaying: propIsPlaying = false,
  onPlay,
  onPause,
  onNext,
  onPrev,
  onReorder,
  onRemove,
  onClear,
  onShuffle,
  repeatMode: propRepeatMode = 'off',
  onRepeatChange,
  className = ''
}: MediaQueueProps) {
  const [items, setItems] = useState<QueueItem[]>(propItems || [])
  const [currentIndex, setCurrentIndex] = useState(propCurrentIndex)
  const [isPlaying, setIsPlaying] = useState(propIsPlaying)
  const [repeatMode, setRepeatMode] = useState<RepeatMode>(propRepeatMode)
  const [loading, setLoading] = useState(!propItems)
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [dropIndex, setDropIndex] = useState<number | null>(null)

  // Sync with props
  useEffect(() => {
    if (propItems) setItems(propItems)
  }, [propItems])

  useEffect(() => {
    setCurrentIndex(propCurrentIndex)
  }, [propCurrentIndex])

  useEffect(() => {
    setIsPlaying(propIsPlaying)
  }, [propIsPlaying])

  useEffect(() => {
    setRepeatMode(propRepeatMode)
  }, [propRepeatMode])

  // Load queue from storage on mount
  useEffect(() => {
    if (propItems) return

    const loadQueue = async () => {
      setLoading(true)
      try {
        // Try localStorage first
        const stored = localStorage.getItem(STORAGE_KEY)
        if (stored) {
          const data = JSON.parse(stored)
          if (data.items && Array.isArray(data.items)) {
            // Validate items still exist
            const validItems: QueueItem[] = []
            for (const item of data.items) {
              try {
                const media = await window.api.invoke('media:getById', item.id)
                if (media) {
                  validItems.push({
                    id: media.id,
                    title: media.filename || item.title,
                    thumbnail: media.thumbPath || item.thumbnail,
                    duration: media.durationSec || item.duration,
                    type: media.type || item.type || 'video'
                  })
                }
              } catch {
                // Keep original item if validation fails
                validItems.push(item)
              }
            }
            setItems(validItems)
            setCurrentIndex(Math.min(data.currentIndex || 0, validItems.length - 1))
            setRepeatMode(data.repeatMode || 'off')
          }
        }
      } catch (e) {
        console.error('Failed to load queue:', e)
      }
      setLoading(false)
    }

    loadQueue()
  }, [propItems])

  // Save queue to storage on change
  const saveQueue = useCallback((queueItems: QueueItem[], index: number, repeat: RepeatMode) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        items: queueItems,
        currentIndex: index,
        repeatMode: repeat,
        savedAt: Date.now()
      }))
    } catch (e) {
      console.error('Failed to save queue:', e)
    }
  }, [])

  // Update storage when queue changes
  useEffect(() => {
    if (!loading && items.length > 0) {
      saveQueue(items, currentIndex, repeatMode)
    }
  }, [items, currentIndex, repeatMode, loading, saveQueue])

  const totalDuration = useMemo(() =>
    items.reduce((acc, i) => acc + (i.duration || 0), 0), [items])

  const remainingDuration = useMemo(() =>
    items.slice(currentIndex).reduce((acc, i) => acc + (i.duration || 0), 0), [items, currentIndex])

  const handleDragStart = (index: number) => setDragIndex(index)
  const handleDragOver = (index: number) => setDropIndex(index)

  const handleDragEnd = () => {
    if (dragIndex !== null && dropIndex !== null && dragIndex !== dropIndex) {
      if (onReorder) {
        onReorder(dragIndex, dropIndex)
      } else {
        // Handle internally
        const newItems = [...items]
        const [removed] = newItems.splice(dragIndex, 1)
        newItems.splice(dropIndex, 0, removed)
        setItems(newItems)

        // Adjust current index if needed
        if (dragIndex === currentIndex) {
          setCurrentIndex(dropIndex)
        } else if (dragIndex < currentIndex && dropIndex >= currentIndex) {
          setCurrentIndex(currentIndex - 1)
        } else if (dragIndex > currentIndex && dropIndex <= currentIndex) {
          setCurrentIndex(currentIndex + 1)
        }
      }
    }
    setDragIndex(null)
    setDropIndex(null)
  }

  const handlePlay = useCallback((index: number) => {
    setCurrentIndex(index)
    setIsPlaying(true)
    if (onPlay) {
      onPlay(index)
    } else {
      // Default: open the video
      const item = items[index]
      if (item) {
        window.dispatchEvent(new CustomEvent('vault-open-video', {
          detail: { id: item.id }
        }))
      }
    }
  }, [items, onPlay])

  const handlePause = useCallback(() => {
    setIsPlaying(false)
    onPause?.()
  }, [onPause])

  const handleNext = useCallback(() => {
    let nextIndex = currentIndex + 1
    if (nextIndex >= items.length) {
      if (repeatMode === 'all') {
        nextIndex = 0
      } else {
        return
      }
    }
    handlePlay(nextIndex)
    onNext?.()
  }, [currentIndex, items.length, repeatMode, handlePlay, onNext])

  const handlePrev = useCallback(() => {
    const prevIndex = Math.max(0, currentIndex - 1)
    handlePlay(prevIndex)
    onPrev?.()
  }, [currentIndex, handlePlay, onPrev])

  const handleRemove = useCallback((index: number) => {
    if (onRemove) {
      onRemove(index)
    } else {
      const newItems = items.filter((_, i) => i !== index)
      setItems(newItems)
      if (index < currentIndex) {
        setCurrentIndex(currentIndex - 1)
      } else if (index === currentIndex && currentIndex >= newItems.length) {
        setCurrentIndex(Math.max(0, newItems.length - 1))
      }
    }
  }, [items, currentIndex, onRemove])

  const handleClear = useCallback(() => {
    if (onClear) {
      onClear()
    } else {
      setItems([])
      setCurrentIndex(0)
      setIsPlaying(false)
      localStorage.removeItem(STORAGE_KEY)
    }
  }, [onClear])

  const handleShuffle = useCallback(() => {
    if (onShuffle) {
      onShuffle()
    } else {
      const currentItem = items[currentIndex]
      const otherItems = items.filter((_, i) => i !== currentIndex)
      const shuffled = otherItems.sort(() => Math.random() - 0.5)
      setItems([currentItem, ...shuffled])
      setCurrentIndex(0)
    }
  }, [items, currentIndex, onShuffle])

  const cycleRepeat = useCallback(() => {
    const modes: RepeatMode[] = ['off', 'all', 'one']
    const next = modes[(modes.indexOf(repeatMode) + 1) % modes.length]
    setRepeatMode(next)
    onRepeatChange?.(next)
  }, [repeatMode, onRepeatChange])

  const addToQueue = useCallback(async (mediaId: string) => {
    try {
      const media = await window.api.invoke('media:getById', mediaId)
      if (media) {
        const newItem: QueueItem = {
          id: media.id,
          title: media.filename || 'Unknown',
          thumbnail: media.thumbPath,
          duration: media.durationSec || 0,
          type: media.type || 'video'
        }
        setItems(prev => [...prev, newItem])
      }
    } catch (e) {
      console.error('Failed to add to queue:', e)
    }
  }, [])

  // Listen for add-to-queue events
  useEffect(() => {
    const handler = (e: CustomEvent) => {
      if (e.detail?.mediaId) {
        addToQueue(e.detail.mediaId)
      }
    }
    window.addEventListener('vault-add-to-queue' as any, handler)
    return () => window.removeEventListener('vault-add-to-queue' as any, handler)
  }, [addToQueue])

  const RepeatIcon = repeatMode === 'one' ? Repeat1 : Repeat

  return (
    <div className={`bg-zinc-900 rounded-xl border border-zinc-700 overflow-hidden ${className}`}>
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
        <div className="flex items-center gap-2">
          <ListOrdered size={16} className="text-[var(--primary)]" />
          <span className="font-semibold text-sm">Queue</span>
          <span className="text-xs text-zinc-500">({items.length})</span>
        </div>
        <button
          onClick={handleClear}
          disabled={items.length === 0}
          className="text-xs text-zinc-500 hover:text-white disabled:opacity-30"
        >
          Clear
        </button>
      </div>

      {/* Stats */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-800 text-xs text-zinc-500">
        <span>Total: {formatDuration(totalDuration)}</span>
        <span>Remaining: {formatDuration(remainingDuration)}</span>
      </div>

      {/* Controls */}
      <div className="flex items-center justify-center gap-2 px-4 py-3 border-b border-zinc-800">
        <button
          onClick={handleShuffle}
          disabled={items.length < 2}
          className="p-2 rounded-full hover:bg-zinc-800 disabled:opacity-30"
          title="Shuffle"
        >
          <Shuffle size={16} />
        </button>
        <button
          onClick={handlePrev}
          disabled={currentIndex === 0}
          className="p-2 rounded-full hover:bg-zinc-800 disabled:opacity-30"
          title="Previous"
        >
          <SkipBack size={16} />
        </button>
        <button
          onClick={() => isPlaying ? handlePause() : handlePlay(currentIndex)}
          disabled={items.length === 0}
          className="p-3 rounded-full bg-[var(--primary)] disabled:opacity-30"
        >
          {isPlaying ? <Pause size={18} /> : <Play size={18} />}
        </button>
        <button
          onClick={handleNext}
          disabled={currentIndex >= items.length - 1 && repeatMode !== 'all'}
          className="p-2 rounded-full hover:bg-zinc-800 disabled:opacity-30"
          title="Next"
        >
          <SkipForward size={16} />
        </button>
        <button
          onClick={cycleRepeat}
          className={`p-2 rounded-full ${repeatMode !== 'off' ? 'text-[var(--primary)] bg-[var(--primary)]/10' : ''} hover:bg-zinc-800`}
          title={`Repeat: ${repeatMode}`}
        >
          <RepeatIcon size={16} />
        </button>
      </div>

      {/* Queue list */}
      <div className="max-h-64 overflow-y-auto">
        {loading ? (
          <div className="py-12 text-center">
            <Loader2 size={24} className="mx-auto animate-spin text-zinc-500" />
            <p className="text-sm text-zinc-500 mt-2">Loading queue...</p>
          </div>
        ) : items.length === 0 ? (
          <div className="py-12 text-center text-zinc-500">
            <ListOrdered size={32} className="mx-auto mb-2 opacity-50" />
            <p className="text-sm">Queue is empty</p>
            <p className="text-xs mt-1">Right-click media to add to queue</p>
          </div>
        ) : (
          items.map((item, index) => {
            const isCurrent = index === currentIndex
            const isPlayed = index < currentIndex

            return (
              <div
                key={item.id}
                draggable
                onDragStart={() => handleDragStart(index)}
                onDragOver={(e) => { e.preventDefault(); handleDragOver(index) }}
                onDragEnd={handleDragEnd}
                className={`flex items-center gap-2 px-4 py-2 group cursor-grab active:cursor-grabbing
                  ${isCurrent ? 'bg-[var(--primary)]/10' : isPlayed ? 'opacity-50' : ''}
                  ${dropIndex === index ? 'border-t-2 border-[var(--primary)]' : ''}
                  ${dragIndex === index ? 'opacity-50' : ''}
                  hover:bg-zinc-800/30`}
              >
                <GripVertical size={12} className="text-zinc-600 flex-shrink-0" />
                <span className="w-6 text-center text-xs text-zinc-500">{index + 1}</span>
                <div className="relative w-12 h-8 rounded bg-zinc-800 overflow-hidden flex-shrink-0">
                  {item.thumbnail ? (
                    <img src={item.thumbnail} className="w-full h-full object-cover" alt="" />
                  ) : (
                    <Film size={12} className="absolute inset-0 m-auto text-zinc-600" />
                  )}
                  {isCurrent && isPlaying && (
                    <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                      <div className="flex gap-0.5">
                        {[0, 1, 2].map(i => (
                          <div
                            key={i}
                            className="w-0.5 h-3 bg-[var(--primary)] animate-pulse"
                            style={{ animationDelay: `${i * 0.15}s` }}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className={`text-sm truncate ${isCurrent ? 'text-[var(--primary)] font-medium' : ''}`}>
                    {item.title}
                  </div>
                  {item.duration != null && item.duration > 0 && (
                    <div className="text-xs text-zinc-600">{formatDuration(item.duration)}</div>
                  )}
                </div>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition">
                  <button
                    onClick={() => handlePlay(index)}
                    className="p-1 rounded hover:bg-zinc-700"
                    title="Play"
                  >
                    <Play size={12} />
                  </button>
                  <button
                    onClick={() => handleRemove(index)}
                    className="p-1 rounded hover:bg-red-500/20 text-red-400"
                    title="Remove"
                  >
                    <X size={12} />
                  </button>
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
export default MediaQueue
