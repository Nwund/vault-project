// File: src/renderer/components/BookmarksPanel.tsx
// Video bookmarks panel - save and navigate to timestamps

import React, { useState, useEffect, useCallback } from 'react'
import { Bookmark, Plus, Trash2, Edit2, Check, X, ChevronLeft, ChevronRight, Clock, Download } from 'lucide-react'
import { formatDuration } from '../utils/formatters'

interface VideoBookmark {
  id: string
  mediaId: string
  timestamp: number
  timestampFormatted: string
  title: string
  description?: string
  color?: string
  createdAt: number
}

interface BookmarksPanelProps {
  mediaId: string
  currentTime: number
  duration: number
  onSeek: (time: number) => void
  isCompact?: boolean
}

const COLORS = [
  { name: 'Blue', value: '#3b82f6' },
  { name: 'Green', value: '#22c55e' },
  { name: 'Yellow', value: '#eab308' },
  { name: 'Red', value: '#ef4444' },
  { name: 'Purple', value: '#a855f7' },
  { name: 'Pink', value: '#ec4899' },
  { name: 'Orange', value: '#f97316' },
  { name: 'Cyan', value: '#06b6d4' },
]

export function BookmarksPanel({ mediaId, currentTime, duration, onSeek, isCompact = false }: BookmarksPanelProps) {
  const [bookmarks, setBookmarks] = useState<VideoBookmark[]>([])
  const [isExpanded, setIsExpanded] = useState(!isCompact)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [showAddForm, setShowAddForm] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newColor, setNewColor] = useState('#3b82f6')

  const loadBookmarks = useCallback(async () => {
    try {
      const items = await window.api.invoke('bookmarks:getForMedia', mediaId)
      setBookmarks(items)
    } catch (e) {
      console.error('Failed to load bookmarks:', e)
    }
  }, [mediaId])

  useEffect(() => {
    loadBookmarks()
  }, [loadBookmarks])

  const handleQuickAdd = async () => {
    try {
      await window.api.invoke('bookmarks:quickAdd', mediaId, currentTime)
      loadBookmarks()
    } catch (e) {
      console.error('Failed to add bookmark:', e)
    }
  }

  const handleAdd = async () => {
    if (!newTitle.trim()) return
    try {
      await window.api.invoke('bookmarks:add', mediaId, currentTime, newTitle, {
        color: newColor
      })
      setNewTitle('')
      setShowAddForm(false)
      loadBookmarks()
    } catch (e) {
      console.error('Failed to add bookmark:', e)
    }
  }

  const handleDelete = async (bookmarkId: string) => {
    try {
      await window.api.invoke('bookmarks:delete', bookmarkId)
      loadBookmarks()
    } catch (e) {
      console.error('Failed to delete bookmark:', e)
    }
  }

  const handleEdit = (bookmark: VideoBookmark) => {
    setEditingId(bookmark.id)
    setEditTitle(bookmark.title)
    setEditDescription(bookmark.description || '')
  }

  const handleSaveEdit = async () => {
    if (!editingId || !editTitle.trim()) return
    try {
      await window.api.invoke('bookmarks:update', editingId, {
        title: editTitle,
        description: editDescription || undefined
      })
      setEditingId(null)
      loadBookmarks()
    } catch (e) {
      console.error('Failed to update bookmark:', e)
    }
  }

  const handleExport = async () => {
    try {
      const data = await window.api.invoke('bookmarks:export', mediaId, 'json')
      const blob = new Blob([data], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `bookmarks-${mediaId}.json`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      console.error('Failed to export bookmarks:', e)
    }
  }

  const goToNext = async () => {
    try {
      const next = await window.api.invoke('bookmarks:getNext', mediaId, currentTime)
      if (next) onSeek(next.timestamp)
    } catch (e) {
      console.error('Failed to navigate to next bookmark:', e)
    }
  }

  const goToPrevious = async () => {
    try {
      const prev = await window.api.invoke('bookmarks:getPrevious', mediaId, currentTime)
      if (prev) onSeek(prev.timestamp)
    } catch (e) {
      console.error('Failed to navigate to previous bookmark:', e)
    }
  }

  // Compact mode - just show bookmark indicators on timeline
  if (isCompact && !isExpanded) {
    return (
      <div className="flex items-center gap-1">
        <button
          onClick={handleQuickAdd}
          className="p-1 hover:bg-white/20 rounded"
          title="Add bookmark at current time (B)"
        >
          <Bookmark className="w-4 h-4" />
        </button>
        {bookmarks.length > 0 && (
          <>
            <button onClick={goToPrevious} className="p-1 hover:bg-white/20 rounded" title="Previous bookmark">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-xs text-zinc-400">{bookmarks.length}</span>
            <button onClick={goToNext} className="p-1 hover:bg-white/20 rounded" title="Next bookmark">
              <ChevronRight className="w-4 h-4" />
            </button>
          </>
        )}
        <button
          onClick={() => setIsExpanded(true)}
          className="p-1 hover:bg-white/20 rounded text-xs"
          title="Expand bookmarks"
        >
          ...
        </button>
      </div>
    )
  }

  return (
    <div className="bg-zinc-900/95 backdrop-blur rounded-lg border border-zinc-700 w-64 max-h-80 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-2 border-b border-zinc-700">
        <div className="flex items-center gap-2">
          <Bookmark className="w-4 h-4 text-blue-400" />
          <span className="text-sm font-medium">Bookmarks</span>
          <span className="text-xs text-zinc-500">({bookmarks.length})</span>
        </div>
        <div className="flex items-center gap-1">
          {bookmarks.length > 0 && (
            <button onClick={handleExport} className="p-1 hover:bg-zinc-700 rounded" title="Export">
              <Download className="w-3.5 h-3.5 text-zinc-400" />
            </button>
          )}
          {isCompact && (
            <button onClick={() => setIsExpanded(false)} className="p-1 hover:bg-zinc-700 rounded" title="Collapse">
              <X className="w-3.5 h-3.5 text-zinc-400" />
            </button>
          )}
        </div>
      </div>

      {/* Add Form */}
      {showAddForm ? (
        <div className="p-2 border-b border-zinc-700 space-y-2">
          <input
            type="text"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="Bookmark title..."
            className="w-full px-2 py-1 bg-zinc-800 rounded text-sm"
            autoFocus
            onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          />
          <div className="flex items-center gap-1">
            {COLORS.map((c) => (
              <button
                key={c.value}
                onClick={() => setNewColor(c.value)}
                className={`w-5 h-5 rounded-full ${newColor === c.value ? 'ring-2 ring-white ring-offset-1 ring-offset-zinc-900' : ''}`}
                style={{ backgroundColor: c.value }}
                title={c.name}
              />
            ))}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-zinc-500">
              <Clock className="w-3 h-3 inline mr-1" />
              {formatDuration(currentTime)}
            </span>
            <div className="flex-1" />
            <button
              onClick={() => setShowAddForm(false)}
              className="px-2 py-1 text-xs text-zinc-400 hover:bg-zinc-700 rounded"
            >
              Cancel
            </button>
            <button
              onClick={handleAdd}
              disabled={!newTitle.trim()}
              className="px-2 py-1 text-xs bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded"
            >
              Add
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-1 p-2 border-b border-zinc-700">
          <button
            onClick={handleQuickAdd}
            className="flex-1 flex items-center justify-center gap-1 px-2 py-1 bg-zinc-800 hover:bg-zinc-700 rounded text-xs"
          >
            <Plus className="w-3 h-3" />
            Quick Add
          </button>
          <button
            onClick={() => setShowAddForm(true)}
            className="px-2 py-1 bg-blue-600 hover:bg-blue-500 rounded text-xs"
          >
            Custom
          </button>
        </div>
      )}

      {/* Navigation */}
      {bookmarks.length > 0 && (
        <div className="flex items-center justify-between px-2 py-1 border-b border-zinc-800">
          <button
            onClick={goToPrevious}
            className="flex items-center gap-1 px-2 py-0.5 hover:bg-zinc-700 rounded text-xs"
          >
            <ChevronLeft className="w-3 h-3" />
            Prev
          </button>
          <button
            onClick={goToNext}
            className="flex items-center gap-1 px-2 py-0.5 hover:bg-zinc-700 rounded text-xs"
          >
            Next
            <ChevronRight className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* Bookmarks List */}
      <div className="flex-1 overflow-y-auto">
        {bookmarks.length === 0 ? (
          <div className="p-4 text-center text-xs text-zinc-500">
            <Bookmark className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p>No bookmarks yet</p>
            <p className="mt-1">Press B to add at current time</p>
          </div>
        ) : (
          <div className="p-1 space-y-0.5">
            {bookmarks.map((bookmark) => (
              <div
                key={bookmark.id}
                className="group flex items-center gap-2 p-1.5 rounded hover:bg-zinc-800 cursor-pointer"
                onClick={() => onSeek(bookmark.timestamp)}
              >
                {/* Color indicator */}
                <div
                  className="w-1 h-8 rounded-full flex-shrink-0"
                  style={{ backgroundColor: bookmark.color || '#3b82f6' }}
                />

                {editingId === bookmark.id ? (
                  <div className="flex-1 space-y-1" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="text"
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      className="w-full px-1 py-0.5 bg-zinc-700 rounded text-xs"
                      autoFocus
                    />
                    <input
                      type="text"
                      value={editDescription}
                      onChange={(e) => setEditDescription(e.target.value)}
                      placeholder="Description (optional)"
                      className="w-full px-1 py-0.5 bg-zinc-700 rounded text-xs"
                    />
                    <div className="flex gap-1">
                      <button
                        onClick={handleSaveEdit}
                        className="p-0.5 bg-green-600 rounded"
                      >
                        <Check className="w-3 h-3" />
                      </button>
                      <button
                        onClick={() => setEditingId(null)}
                        className="p-0.5 bg-zinc-600 rounded"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate">{bookmark.title}</p>
                      {bookmark.description && (
                        <p className="text-xs text-zinc-500 truncate">{bookmark.description}</p>
                      )}
                    </div>
                    <span className="text-xs text-zinc-500 font-mono">
                      {bookmark.timestampFormatted}
                    </span>
                    <div className="hidden group-hover:flex items-center gap-0.5">
                      <button
                        onClick={(e) => { e.stopPropagation(); handleEdit(bookmark) }}
                        className="p-0.5 hover:bg-zinc-600 rounded"
                      >
                        <Edit2 className="w-3 h-3 text-zinc-400" />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDelete(bookmark.id) }}
                        className="p-0.5 hover:bg-zinc-600 rounded"
                      >
                        <Trash2 className="w-3 h-3 text-red-400" />
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Timeline Preview */}
      {bookmarks.length > 0 && duration > 0 && (
        <div className="p-2 border-t border-zinc-700">
          <div className="relative h-2 bg-zinc-800 rounded-full overflow-hidden">
            {/* Progress */}
            <div
              className="absolute h-full bg-zinc-600"
              style={{ width: `${(currentTime / duration) * 100}%` }}
            />
            {/* Bookmark markers */}
            {bookmarks.map((bookmark) => (
              <button
                key={bookmark.id}
                onClick={() => onSeek(bookmark.timestamp)}
                className="absolute w-2 h-2 -translate-x-1/2 top-0 rounded-full hover:scale-150 transition-transform"
                style={{
                  left: `${(bookmark.timestamp / duration) * 100}%`,
                  backgroundColor: bookmark.color || '#3b82f6'
                }}
                title={`${bookmark.title} (${bookmark.timestampFormatted})`}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default BookmarksPanel
