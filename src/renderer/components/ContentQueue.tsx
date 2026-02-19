// File: src/renderer/components/ContentQueue.tsx
// Content queue system for continuous playback with up-next functionality

import React, { useState, useCallback, useEffect, useMemo } from 'react'
import {
  ListOrdered,
  Play,
  X,
  ChevronUp,
  ChevronDown,
  Shuffle,
  Repeat,
  Trash2,
  Plus,
  GripVertical,
  SkipForward,
  Clock,
  Film,
  Sparkles,
  Music2
} from 'lucide-react'
import { toFileUrlCached } from '../hooks/usePerformance'
import { formatDuration } from '../utils/formatters'

export interface QueueItem {
  id: string
  mediaId: string
  filename: string
  thumbPath: string | null
  type: 'video' | 'image' | 'gif'
  durationSec: number | null
  addedAt: number
}

export interface ContentQueueState {
  items: QueueItem[]
  currentIndex: number
  isPlaying: boolean
  repeatMode: 'none' | 'one' | 'all'
  shuffled: boolean
  autoAdvance: boolean
  autoAdvanceDelay: number // seconds for images
}

interface ContentQueueProps {
  onPlayMedia: (mediaId: string) => void
  onClose?: () => void
  position?: 'left' | 'right'
  minimal?: boolean
  className?: string
}

// Global queue state (persisted in memory)
let globalQueue: ContentQueueState = {
  items: [],
  currentIndex: -1,
  isPlaying: false,
  repeatMode: 'none',
  shuffled: false,
  autoAdvance: true,
  autoAdvanceDelay: 10
}

// Queue event listeners
const queueListeners = new Set<(state: ContentQueueState) => void>()

function notifyQueueChange() {
  queueListeners.forEach(fn => fn({ ...globalQueue }))
}

// Queue actions
export function queueAdd(item: Omit<QueueItem, 'id' | 'addedAt'>) {
  const queueItem: QueueItem = {
    ...item,
    id: `q-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    addedAt: Date.now()
  }
  globalQueue.items.push(queueItem)
  notifyQueueChange()
  return queueItem.id
}

export function queueAddMultiple(items: Array<Omit<QueueItem, 'id' | 'addedAt'>>) {
  const queueItems: QueueItem[] = items.map((item, i) => ({
    ...item,
    id: `q-${Date.now()}-${i}-${Math.random().toString(36).slice(2)}`,
    addedAt: Date.now() + i
  }))
  globalQueue.items.push(...queueItems)
  notifyQueueChange()
}

export function queueRemove(id: string) {
  const index = globalQueue.items.findIndex(i => i.id === id)
  if (index >= 0) {
    globalQueue.items.splice(index, 1)
    // Adjust current index if needed
    if (index < globalQueue.currentIndex) {
      globalQueue.currentIndex--
    } else if (index === globalQueue.currentIndex) {
      globalQueue.currentIndex = Math.min(globalQueue.currentIndex, globalQueue.items.length - 1)
    }
    notifyQueueChange()
  }
}

export function queueClear() {
  globalQueue.items = []
  globalQueue.currentIndex = -1
  globalQueue.isPlaying = false
  notifyQueueChange()
}

export function queuePlayIndex(index: number) {
  if (index >= 0 && index < globalQueue.items.length) {
    globalQueue.currentIndex = index
    globalQueue.isPlaying = true
    notifyQueueChange()
    return globalQueue.items[index]
  }
  return null
}

export function queuePlayNext(): QueueItem | null {
  if (globalQueue.items.length === 0) return null

  if (globalQueue.repeatMode === 'one') {
    return globalQueue.items[globalQueue.currentIndex] || null
  }

  let nextIndex = globalQueue.currentIndex + 1

  if (nextIndex >= globalQueue.items.length) {
    if (globalQueue.repeatMode === 'all') {
      nextIndex = 0
    } else {
      globalQueue.isPlaying = false
      notifyQueueChange()
      return null
    }
  }

  return queuePlayIndex(nextIndex)
}

export function queuePlayPrevious(): QueueItem | null {
  if (globalQueue.items.length === 0) return null

  let prevIndex = globalQueue.currentIndex - 1
  if (prevIndex < 0) {
    if (globalQueue.repeatMode === 'all') {
      prevIndex = globalQueue.items.length - 1
    } else {
      prevIndex = 0
    }
  }

  return queuePlayIndex(prevIndex)
}

export function queueMoveItem(fromIndex: number, toIndex: number) {
  if (fromIndex < 0 || fromIndex >= globalQueue.items.length) return
  if (toIndex < 0 || toIndex >= globalQueue.items.length) return

  const [item] = globalQueue.items.splice(fromIndex, 1)
  globalQueue.items.splice(toIndex, 0, item)

  // Adjust current index
  if (fromIndex === globalQueue.currentIndex) {
    globalQueue.currentIndex = toIndex
  } else if (fromIndex < globalQueue.currentIndex && toIndex >= globalQueue.currentIndex) {
    globalQueue.currentIndex--
  } else if (fromIndex > globalQueue.currentIndex && toIndex <= globalQueue.currentIndex) {
    globalQueue.currentIndex++
  }

  notifyQueueChange()
}

export function queueShuffle() {
  if (globalQueue.items.length <= 1) return

  const current = globalQueue.items[globalQueue.currentIndex]

  // Fisher-Yates shuffle
  for (let i = globalQueue.items.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[globalQueue.items[i], globalQueue.items[j]] = [globalQueue.items[j], globalQueue.items[i]]
  }

  // Keep current item at current position
  if (current) {
    const newIndex = globalQueue.items.findIndex(i => i.id === current.id)
    if (newIndex !== globalQueue.currentIndex) {
      queueMoveItem(newIndex, globalQueue.currentIndex)
    }
  }

  globalQueue.shuffled = true
  notifyQueueChange()
}

export function queueSetRepeatMode(mode: 'none' | 'one' | 'all') {
  globalQueue.repeatMode = mode
  notifyQueueChange()
}

export function queueSetAutoAdvance(enabled: boolean, delay?: number) {
  globalQueue.autoAdvance = enabled
  if (delay !== undefined) {
    globalQueue.autoAdvanceDelay = delay
  }
  notifyQueueChange()
}

export function getQueueState(): ContentQueueState {
  return { ...globalQueue }
}

export function useQueueState(): ContentQueueState {
  const [state, setState] = useState<ContentQueueState>(() => ({ ...globalQueue }))

  useEffect(() => {
    const listener = (newState: ContentQueueState) => setState(newState)
    queueListeners.add(listener)
    return () => { queueListeners.delete(listener) }
  }, [])

  return state
}

// Main Queue Component
export function ContentQueue({
  onPlayMedia,
  onClose,
  position = 'right',
  minimal = false,
  className = ''
}: ContentQueueProps) {
  const queue = useQueueState()
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)

  const totalDuration = useMemo(() => {
    return queue.items.reduce((sum, item) => sum + (item.durationSec || 0), 0)
  }, [queue.items])

  const handlePlay = useCallback((index: number) => {
    const item = queuePlayIndex(index)
    if (item) {
      onPlayMedia(item.mediaId)
    }
  }, [onPlayMedia])

  const handlePlayNext = useCallback(() => {
    const item = queuePlayNext()
    if (item) {
      onPlayMedia(item.mediaId)
    }
  }, [onPlayMedia])

  const handleDragStart = useCallback((index: number) => {
    setDraggedIndex(index)
  }, [])

  const handleDragOver = useCallback((index: number) => {
    setDragOverIndex(index)
  }, [])

  const handleDragEnd = useCallback(() => {
    if (draggedIndex !== null && dragOverIndex !== null && draggedIndex !== dragOverIndex) {
      queueMoveItem(draggedIndex, dragOverIndex)
    }
    setDraggedIndex(null)
    setDragOverIndex(null)
  }, [draggedIndex, dragOverIndex])

  const cycleRepeatMode = useCallback(() => {
    const modes: Array<'none' | 'one' | 'all'> = ['none', 'one', 'all']
    const currentIdx = modes.indexOf(queue.repeatMode)
    const nextMode = modes[(currentIdx + 1) % modes.length]
    queueSetRepeatMode(nextMode)
  }, [queue.repeatMode])

  const getRepeatIcon = () => {
    switch (queue.repeatMode) {
      case 'one': return '1'
      case 'all': return '∞'
      default: return ''
    }
  }

  if (queue.items.length === 0 && !minimal) {
    return (
      <div className={`bg-zinc-900/95 backdrop-blur-xl rounded-2xl border border-zinc-700 shadow-2xl overflow-hidden ${className}`}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
          <div className="flex items-center gap-2">
            <ListOrdered size={18} className="text-[var(--primary)]" />
            <span className="font-semibold">Queue</span>
          </div>
          {onClose && (
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-zinc-800 transition">
              <X size={16} />
            </button>
          )}
        </div>
        <div className="py-12 text-center text-zinc-500">
          <ListOrdered size={32} className="mx-auto mb-2 opacity-50" />
          <p>Queue is empty</p>
          <p className="text-xs mt-1">Add media to start building your queue</p>
        </div>
      </div>
    )
  }

  // Minimal inline view
  if (minimal) {
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        <ListOrdered size={14} className="text-[var(--primary)]" />
        <span className="text-sm text-zinc-400">
          {queue.items.length > 0 ? (
            <>
              {queue.currentIndex + 1}/{queue.items.length}
              {totalDuration > 0 && ` • ${formatDuration(totalDuration)}`}
            </>
          ) : (
            'No queue'
          )}
        </span>
        {queue.items.length > 0 && (
          <button
            onClick={handlePlayNext}
            className="p-1 rounded hover:bg-zinc-800 transition"
            title="Play next"
          >
            <SkipForward size={14} />
          </button>
        )}
      </div>
    )
  }

  return (
    <div className={`bg-zinc-900/95 backdrop-blur-xl rounded-2xl border border-zinc-700 shadow-2xl overflow-hidden ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
        <div className="flex items-center gap-2">
          <ListOrdered size={18} className="text-[var(--primary)]" />
          <span className="font-semibold">Queue</span>
          <span className="text-xs text-zinc-500">
            {queue.items.length} items
            {totalDuration > 0 && ` • ${formatDuration(totalDuration)}`}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={queueShuffle}
            className={`p-1.5 rounded-lg transition ${
              queue.shuffled ? 'bg-[var(--primary)]/20 text-[var(--primary)]' : 'hover:bg-zinc-800 text-zinc-400'
            }`}
            title="Shuffle"
          >
            <Shuffle size={14} />
          </button>
          <button
            onClick={cycleRepeatMode}
            className={`p-1.5 rounded-lg transition relative ${
              queue.repeatMode !== 'none' ? 'bg-[var(--primary)]/20 text-[var(--primary)]' : 'hover:bg-zinc-800 text-zinc-400'
            }`}
            title={`Repeat: ${queue.repeatMode}`}
          >
            <Repeat size={14} />
            {queue.repeatMode !== 'none' && (
              <span className="absolute -top-1 -right-1 text-[8px] font-bold">{getRepeatIcon()}</span>
            )}
          </button>
          <button
            onClick={queueClear}
            className="p-1.5 rounded-lg hover:bg-red-500/20 hover:text-red-400 transition text-zinc-400"
            title="Clear queue"
          >
            <Trash2 size={14} />
          </button>
          {onClose && (
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-zinc-800 transition">
              <X size={16} />
            </button>
          )}
        </div>
      </div>

      {/* Now Playing */}
      {queue.currentIndex >= 0 && queue.items[queue.currentIndex] && (
        <div className="px-4 py-3 bg-[var(--primary)]/10 border-b border-zinc-800">
          <div className="flex items-center gap-2 text-xs text-[var(--primary)] mb-2">
            <Music2 size={12} />
            <span className="font-medium">Now Playing</span>
          </div>
          <QueueItemRow
            item={queue.items[queue.currentIndex]}
            index={queue.currentIndex}
            isCurrent
            onPlay={() => handlePlay(queue.currentIndex)}
            onRemove={() => queueRemove(queue.items[queue.currentIndex].id)}
          />
        </div>
      )}

      {/* Up Next */}
      <div className="max-h-[50vh] overflow-y-auto">
        {queue.items.length > 1 && (
          <div className="px-4 py-2 border-b border-zinc-800">
            <span className="text-xs text-zinc-500 font-medium">Up Next</span>
          </div>
        )}
        <div className="divide-y divide-zinc-800/50">
          {queue.items.map((item, index) => {
            if (index === queue.currentIndex) return null
            return (
              <div
                key={item.id}
                className={`px-4 py-2 ${
                  dragOverIndex === index ? 'bg-[var(--primary)]/20' : ''
                }`}
                draggable
                onDragStart={() => handleDragStart(index)}
                onDragOver={(e) => {
                  e.preventDefault()
                  handleDragOver(index)
                }}
                onDragEnd={handleDragEnd}
              >
                <QueueItemRow
                  item={item}
                  index={index}
                  isCurrent={false}
                  onPlay={() => handlePlay(index)}
                  onRemove={() => queueRemove(item.id)}
                  onMoveUp={index > 0 ? () => queueMoveItem(index, index - 1) : undefined}
                  onMoveDown={index < queue.items.length - 1 ? () => queueMoveItem(index, index + 1) : undefined}
                  isDragging={draggedIndex === index}
                />
              </div>
            )
          })}
        </div>
      </div>

      {/* Auto-advance settings */}
      <div className="px-4 py-3 border-t border-zinc-800">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="auto-advance"
              checked={queue.autoAdvance}
              onChange={(e) => queueSetAutoAdvance(e.target.checked)}
              className="rounded border-zinc-600 bg-zinc-800 text-[var(--primary)] focus:ring-[var(--primary)]"
            />
            <label htmlFor="auto-advance" className="text-sm text-zinc-400">
              Auto-advance
            </label>
          </div>
          {queue.autoAdvance && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-zinc-500">Images:</span>
              <select
                value={queue.autoAdvanceDelay}
                onChange={(e) => queueSetAutoAdvance(true, parseInt(e.target.value))}
                className="text-xs bg-zinc-800 border border-zinc-700 rounded px-2 py-1"
              >
                <option value={5}>5s</option>
                <option value={10}>10s</option>
                <option value={15}>15s</option>
                <option value={30}>30s</option>
                <option value={60}>1m</option>
              </select>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// Individual queue item row
function QueueItemRow({
  item,
  index,
  isCurrent,
  onPlay,
  onRemove,
  onMoveUp,
  onMoveDown,
  isDragging
}: {
  item: QueueItem
  index: number
  isCurrent: boolean
  onPlay: () => void
  onRemove: () => void
  onMoveUp?: () => void
  onMoveDown?: () => void
  isDragging?: boolean
}) {
  const [thumbUrl, setThumbUrl] = useState('')

  useEffect(() => {
    if (item.thumbPath) {
      toFileUrlCached(item.thumbPath).then(setThumbUrl).catch(() => {})
    }
  }, [item.thumbPath])

  return (
    <div
      className={`flex items-center gap-3 group cursor-pointer transition ${
        isDragging ? 'opacity-50' : ''
      } ${isCurrent ? '' : 'hover:bg-zinc-800/50 rounded-lg p-1 -m-1'}`}
      onClick={onPlay}
    >
      {/* Drag handle */}
      {!isCurrent && (
        <div className="cursor-grab text-zinc-600 hover:text-zinc-400 transition opacity-0 group-hover:opacity-100">
          <GripVertical size={14} />
        </div>
      )}

      {/* Index */}
      <span className={`w-6 text-center text-xs ${isCurrent ? 'text-[var(--primary)]' : 'text-zinc-500'}`}>
        {isCurrent ? '▶' : index + 1}
      </span>

      {/* Thumbnail */}
      <div className="relative w-12 h-8 bg-zinc-800 rounded overflow-hidden flex-shrink-0">
        {thumbUrl ? (
          <img src={thumbUrl} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-zinc-600">
            <Film size={12} />
          </div>
        )}
        {item.type === 'video' && item.durationSec && (
          <div className="absolute bottom-0 right-0 px-1 bg-black/80 text-[8px]">
            {formatDuration(item.durationSec)}
          </div>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className={`text-sm truncate ${isCurrent ? 'text-white' : 'text-zinc-300'}`}>
          {item.filename}
        </div>
        <div className="text-[10px] text-zinc-500 capitalize">{item.type}</div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition">
        {onMoveUp && (
          <button
            onClick={(e) => { e.stopPropagation(); onMoveUp() }}
            className="p-1 rounded hover:bg-zinc-700"
          >
            <ChevronUp size={12} />
          </button>
        )}
        {onMoveDown && (
          <button
            onClick={(e) => { e.stopPropagation(); onMoveDown() }}
            className="p-1 rounded hover:bg-zinc-700"
          >
            <ChevronDown size={12} />
          </button>
        )}
        <button
          onClick={(e) => { e.stopPropagation(); onRemove() }}
          className="p-1 rounded hover:bg-red-500/20 hover:text-red-400"
        >
          <X size={12} />
        </button>
      </div>
    </div>
  )
}

// Quick add to queue button for media cards
export function AddToQueueButton({
  media,
  className = ''
}: {
  media: { id: string; filename: string; thumbPath?: string | null; type: string; durationSec?: number | null }
  className?: string
}) {
  const [added, setAdded] = useState(false)

  const handleAdd = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    queueAdd({
      mediaId: media.id,
      filename: media.filename,
      thumbPath: media.thumbPath || null,
      type: media.type as 'video' | 'image' | 'gif',
      durationSec: media.durationSec || null
    })
    setAdded(true)
    setTimeout(() => setAdded(false), 1500)
  }, [media])

  return (
    <button
      onClick={handleAdd}
      className={`p-1.5 rounded-lg transition ${
        added
          ? 'bg-green-500/20 text-green-400'
          : 'bg-black/50 hover:bg-black/80 text-white'
      } ${className}`}
      title={added ? 'Added to queue' : 'Add to queue'}
    >
      {added ? <Sparkles size={14} /> : <Plus size={14} />}
    </button>
  )
}

// Mini queue indicator for status bar
export function QueueIndicator({
  onClick,
  className = ''
}: {
  onClick?: () => void
  className?: string
}) {
  const queue = useQueueState()

  if (queue.items.length === 0) return null

  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-3 py-1.5 rounded-lg bg-zinc-800/80 hover:bg-zinc-700 transition ${className}`}
    >
      <ListOrdered size={14} className="text-[var(--primary)]" />
      <span className="text-sm">
        {queue.currentIndex + 1}/{queue.items.length}
      </span>
    </button>
  )
}

export default ContentQueue
