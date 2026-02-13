// File: src/renderer/components/WatchLaterPanel.tsx
// Watch Later queue panel with drag-to-reorder

import React, { useState, useEffect, useCallback } from 'react'
import { Clock, Play, Trash2, GripVertical, Shuffle, ChevronUp, ChevronDown, X, Plus, Bell, BellOff } from 'lucide-react'

interface WatchLaterItem {
  id: string
  mediaId: string
  priority: number
  addedAt: number
  note?: string
  reminderAt?: number
  filename: string
  thumbPath?: string
  type: string
  durationSec?: number
}

interface WatchLaterPanelProps {
  isOpen: boolean
  onClose: () => void
  onPlayMedia: (mediaId: string) => void
  selectedMediaIds?: string[]
}

export function WatchLaterPanel({ isOpen, onClose, onPlayMedia, selectedMediaIds = [] }: WatchLaterPanelProps) {
  const [queue, setQueue] = useState<WatchLaterItem[]>([])
  const [stats, setStats] = useState<{ totalItems: number; totalDuration: number } | null>(null)
  const [loading, setLoading] = useState(true)
  const [draggedItem, setDraggedItem] = useState<string | null>(null)
  const [dragOverItem, setDragOverItem] = useState<string | null>(null)

  const loadQueue = useCallback(async () => {
    try {
      const items = await window.api.invoke('watchLater:getQueue', { limit: 100 })
      const queueStats = await window.api.invoke('watchLater:getStats')
      setQueue(items)
      setStats(queueStats)
    } catch (e) {
      console.error('Failed to load watch later queue:', e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (isOpen) {
      loadQueue()
    }
  }, [isOpen, loadQueue])

  const handleRemove = async (mediaId: string) => {
    await window.api.invoke('watchLater:remove', mediaId)
    setQueue(prev => prev.filter(item => item.mediaId !== mediaId))
  }

  const handlePlayNext = async () => {
    const next = await window.api.invoke('watchLater:popNext')
    if (next) {
      onPlayMedia(next.mediaId)
      loadQueue()
    }
  }

  const handleShuffle = async () => {
    await window.api.invoke('watchLater:shuffle')
    loadQueue()
  }

  const handleBumpPriority = async (mediaId: string) => {
    await window.api.invoke('watchLater:bumpPriority', mediaId)
    loadQueue()
  }

  const handleClearQueue = async () => {
    if (confirm('Clear entire watch later queue?')) {
      await window.api.invoke('watchLater:clearQueue')
      loadQueue()
    }
  }

  const handleAddSelected = async () => {
    if (selectedMediaIds.length > 0) {
      await window.api.invoke('watchLater:addMultiple', selectedMediaIds)
      loadQueue()
    }
  }

  const handleDragStart = (e: React.DragEvent, itemId: string) => {
    setDraggedItem(itemId)
    e.dataTransfer.effectAllowed = 'move'
  }

  const handleDragOver = (e: React.DragEvent, itemId: string) => {
    e.preventDefault()
    if (draggedItem && draggedItem !== itemId) {
      setDragOverItem(itemId)
    }
  }

  const handleDragEnd = async () => {
    if (draggedItem && dragOverItem) {
      const newQueue = [...queue]
      const draggedIndex = newQueue.findIndex(item => item.id === draggedItem)
      const dropIndex = newQueue.findIndex(item => item.id === dragOverItem)

      if (draggedIndex !== -1 && dropIndex !== -1) {
        const [removed] = newQueue.splice(draggedIndex, 1)
        newQueue.splice(dropIndex, 0, removed)
        setQueue(newQueue)

        // Update order on backend
        const orderedIds = newQueue.map(item => item.mediaId)
        await window.api.invoke('watchLater:reorder', orderedIds)
      }
    }
    setDraggedItem(null)
    setDragOverItem(null)
  }

  const formatDuration = (sec?: number) => {
    if (!sec) return '--:--'
    const h = Math.floor(sec / 3600)
    const m = Math.floor((sec % 3600) / 60)
    const s = Math.floor(sec % 60)
    if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
    return `${m}:${s.toString().padStart(2, '0')}`
  }

  const formatTotalDuration = (sec: number) => {
    const h = Math.floor(sec / 3600)
    const m = Math.floor((sec % 3600) / 60)
    if (h > 0) return `${h}h ${m}m`
    return `${m}m`
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-zinc-900 rounded-xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col border border-zinc-700">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-zinc-700">
          <div className="flex items-center gap-3">
            <Clock className="w-5 h-5 text-blue-400" />
            <h2 className="text-lg font-semibold text-white">Watch Later</h2>
            {stats && (
              <span className="text-sm text-zinc-400">
                {stats.totalItems} items • {formatTotalDuration(stats.totalDuration)}
              </span>
            )}
          </div>
          <button onClick={onClose} className="p-1 hover:bg-zinc-700 rounded" title="Close">
            <X className="w-5 h-5 text-zinc-400" />
          </button>
        </div>

        {/* Actions Bar */}
        <div className="flex items-center gap-2 p-3 border-b border-zinc-800">
          <button
            onClick={handlePlayNext}
            disabled={queue.length === 0}
            className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded-lg text-sm font-medium"
          >
            <Play className="w-4 h-4" />
            Play Next
          </button>
          <button
            onClick={handleShuffle}
            disabled={queue.length < 2}
            className="flex items-center gap-2 px-3 py-1.5 bg-zinc-700 hover:bg-zinc-600 disabled:opacity-50 rounded-lg text-sm"
          >
            <Shuffle className="w-4 h-4" />
            Shuffle
          </button>
          {selectedMediaIds.length > 0 && (
            <button
              onClick={handleAddSelected}
              className="flex items-center gap-2 px-3 py-1.5 bg-green-600 hover:bg-green-500 rounded-lg text-sm"
            >
              <Plus className="w-4 h-4" />
              Add {selectedMediaIds.length} Selected
            </button>
          )}
          <div className="flex-1" />
          <button
            onClick={handleClearQueue}
            disabled={queue.length === 0}
            className="flex items-center gap-2 px-3 py-1.5 text-red-400 hover:bg-red-900/30 disabled:opacity-50 rounded-lg text-sm"
          >
            <Trash2 className="w-4 h-4" />
            Clear All
          </button>
        </div>

        {/* Queue List */}
        <div className="flex-1 overflow-y-auto p-2">
          {loading ? (
            <div className="flex items-center justify-center h-32 text-zinc-500">
              Loading...
            </div>
          ) : queue.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 text-zinc-500">
              <Clock className="w-12 h-12 mb-2 opacity-30" />
              <p>Your watch later queue is empty</p>
              <p className="text-sm mt-1">Right-click media and select "Add to Watch Later"</p>
            </div>
          ) : (
            <div className="space-y-1">
              {queue.map((item, index) => (
                <div
                  key={item.id}
                  draggable
                  onDragStart={(e) => handleDragStart(e, item.id)}
                  onDragOver={(e) => handleDragOver(e, item.id)}
                  onDragEnd={handleDragEnd}
                  className={`
                    flex items-center gap-3 p-2 rounded-lg cursor-move
                    ${draggedItem === item.id ? 'opacity-50' : ''}
                    ${dragOverItem === item.id ? 'bg-blue-900/30 border border-blue-500' : 'hover:bg-zinc-800'}
                    transition-colors
                  `}
                >
                  {/* Drag Handle */}
                  <GripVertical className="w-4 h-4 text-zinc-600 flex-shrink-0" />

                  {/* Position */}
                  <span className="w-6 text-center text-sm text-zinc-500 font-mono">
                    {index + 1}
                  </span>

                  {/* Thumbnail */}
                  <div className="w-20 h-12 bg-zinc-800 rounded overflow-hidden flex-shrink-0">
                    {item.thumbPath ? (
                      <img
                        src={`vault://${item.thumbPath}`}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-zinc-600">
                        <Play className="w-6 h-6" />
                      </div>
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white truncate">{item.filename}</p>
                    <div className="flex items-center gap-2 text-xs text-zinc-500">
                      <span>{item.type}</span>
                      {item.durationSec && (
                        <>
                          <span>•</span>
                          <span>{formatDuration(item.durationSec)}</span>
                        </>
                      )}
                      {item.note && (
                        <>
                          <span>•</span>
                          <span className="truncate">{item.note}</span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Priority Indicator */}
                  {item.priority > 5 && (
                    <span className="px-2 py-0.5 bg-yellow-500/20 text-yellow-400 text-xs rounded">
                      High
                    </span>
                  )}

                  {/* Reminder Indicator */}
                  {item.reminderAt && (
                    <Bell className="w-4 h-4 text-blue-400" />
                  )}

                  {/* Actions */}
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleBumpPriority(item.mediaId)}
                      className="p-1.5 hover:bg-zinc-700 rounded"
                      title="Increase priority"
                    >
                      <ChevronUp className="w-4 h-4 text-zinc-400" />
                    </button>
                    <button
                      onClick={() => onPlayMedia(item.mediaId)}
                      className="p-1.5 hover:bg-zinc-700 rounded"
                      title="Play now"
                    >
                      <Play className="w-4 h-4 text-green-400" />
                    </button>
                    <button
                      onClick={() => handleRemove(item.mediaId)}
                      className="p-1.5 hover:bg-zinc-700 rounded"
                      title="Remove"
                    >
                      <Trash2 className="w-4 h-4 text-red-400" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-zinc-800 text-xs text-zinc-500 text-center">
          Drag items to reorder • Click Play to watch • Press Shuffle for random order
        </div>
      </div>
    </div>
  )
}

export default WatchLaterPanel
