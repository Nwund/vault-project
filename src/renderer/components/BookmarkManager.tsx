// File: src/renderer/components/BookmarkManager.tsx
// Video timestamp bookmarks with notes and categories

import React, { useState, useCallback, useMemo, useEffect } from 'react'
import { Bookmark, Plus, Trash2, Edit3, Clock, Tag, Search, Filter, Heart, Star, ChevronRight, Check, X, MessageSquare, Loader2 } from 'lucide-react'
import { formatDuration } from '../utils/formatters'

interface BookmarkItem { id: string; mediaId: string; timestamp: number; title: string; description?: string; color?: string; thumbnailPath?: string; createdAt?: string }
interface BookmarkManagerProps {
  mediaId: string
  duration: number
  currentTime?: number
  onSeek?: (time: number) => void
  className?: string
}

const COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#8b5cf6', '#ec4899']

export function BookmarkManager({ mediaId, duration, currentTime = 0, onSeek, className = '' }: BookmarkManagerProps) {
  const [bookmarks, setBookmarks] = useState<BookmarkItem[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState<string | null>(null)
  const [editData, setEditData] = useState<Partial<BookmarkItem>>({})
  const [showAdd, setShowAdd] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newNote, setNewNote] = useState('')
  const [newColor, setNewColor] = useState(COLORS[0])

  // Fetch bookmarks from backend
  useEffect(() => {
    const fetchBookmarks = async () => {
      setLoading(true)
      try {
        const result = await window.api.invoke('bookmarks:getForMedia', mediaId)
        setBookmarks(result || [])
      } catch (e) {
        console.error('Failed to fetch bookmarks:', e)
      }
      setLoading(false)
    }
    fetchBookmarks()
  }, [mediaId])

  const filtered = useMemo(() => {
    return bookmarks
      .filter(b => !search || b.title.toLowerCase().includes(search.toLowerCase()) || b.description?.toLowerCase().includes(search.toLowerCase()))
      .sort((a, b) => a.timestamp - b.timestamp)
  }, [bookmarks, search])

  const addBookmark = useCallback(async () => {
    if (!newTitle.trim()) return
    try {
      const result = await window.api.invoke('bookmarks:add', mediaId, currentTime, newTitle.trim(), {
        description: newNote.trim() || undefined,
        color: newColor
      })
      if (result) {
        setBookmarks(prev => [...prev, result])
      }
    } catch (e) {
      console.error('Failed to add bookmark:', e)
    }
    setNewTitle(''); setNewNote(''); setShowAdd(false)
  }, [mediaId, currentTime, newTitle, newNote, newColor])

  const quickAdd = useCallback(async () => {
    try {
      const result = await window.api.invoke('bookmarks:quickAdd', mediaId, currentTime)
      if (result) {
        setBookmarks(prev => [...prev, result])
      }
    } catch (e) {
      console.error('Failed to quick add bookmark:', e)
    }
  }, [mediaId, currentTime])

  const updateBookmark = useCallback(async (id: string, updates: Partial<BookmarkItem>) => {
    try {
      await window.api.invoke('bookmarks:update', id, updates)
      setBookmarks(prev => prev.map(b => b.id === id ? { ...b, ...updates } : b))
    } catch (e) {
      console.error('Failed to update bookmark:', e)
    }
    setEditing(null); setEditData({})
  }, [])

  const deleteBookmark = useCallback(async (id: string) => {
    try {
      await window.api.invoke('bookmarks:delete', id)
      setBookmarks(prev => prev.filter(b => b.id !== id))
    } catch (e) {
      console.error('Failed to delete bookmark:', e)
    }
  }, [])

  return (
    <div className={`bg-zinc-900 rounded-xl border border-zinc-700 overflow-hidden ${className}`}>
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
        <div className="flex items-center gap-2">
          <Bookmark size={16} className="text-[var(--primary)]" />
          <span className="font-semibold text-sm">Bookmarks</span>
          <span className="text-xs text-zinc-500">({bookmarks.length})</span>
        </div>
        <div className="flex gap-1">
          <button onClick={quickAdd} className="px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-xs" title="Quick bookmark at current time">
            <Clock size={12} />
          </button>
          <button onClick={() => setShowAdd(true)} className="flex items-center gap-1 px-2 py-1 rounded bg-[var(--primary)] text-xs">
            <Plus size={12} />Add
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="px-3 py-2 border-b border-zinc-800">
        <div className="relative">
          <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search bookmarks..." className="w-full pl-7 pr-2 py-1.5 bg-zinc-800 rounded text-xs" />
        </div>
      </div>

      {/* Add form */}
      {showAdd && (
        <div className="p-3 border-b border-zinc-800 bg-zinc-800/50 space-y-2">
          <input value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder="Bookmark title" className="w-full px-2 py-1.5 bg-zinc-900 border border-zinc-700 rounded text-sm" autoFocus />
          <textarea value={newNote} onChange={e => setNewNote(e.target.value)} placeholder="Note (optional)" className="w-full px-2 py-1.5 bg-zinc-900 border border-zinc-700 rounded text-sm resize-none" rows={2} />
          <div className="flex items-center gap-2">
            <span className="text-xs text-zinc-500">Color:</span>
            {COLORS.map(c => (
              <button key={c} onClick={() => setNewColor(c)} className={`w-5 h-5 rounded-full ${newColor === c ? 'ring-2 ring-white ring-offset-1 ring-offset-zinc-900' : ''}`} style={{ backgroundColor: c }} />
            ))}
          </div>
          <div className="flex justify-between items-center">
            <div className="text-xs text-zinc-500">At {formatDuration(currentTime)}</div>
            <div className="flex gap-2">
              <button onClick={() => setShowAdd(false)} className="px-3 py-1.5 bg-zinc-700 rounded text-sm">Cancel</button>
              <button onClick={addBookmark} disabled={!newTitle.trim()} className="px-3 py-1.5 bg-[var(--primary)] rounded text-sm disabled:opacity-50">Save</button>
            </div>
          </div>
        </div>
      )}

      {/* Bookmarks list */}
      <div className="max-h-64 overflow-y-auto">
        {loading ? (
          <div className="py-8 text-center">
            <Loader2 size={20} className="mx-auto animate-spin text-zinc-500" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-8 text-center text-zinc-500">
            <Bookmark size={24} className="mx-auto mb-2 opacity-50" />
            <p className="text-sm">No bookmarks yet</p>
            <p className="text-xs mt-1">Press B while watching to quick-add</p>
          </div>
        ) : filtered.map(b => (
          <div key={b.id} className="group flex items-start gap-3 px-4 py-3 hover:bg-zinc-800/50 border-b border-zinc-800/30">
            <div className="w-1 h-full rounded" style={{ backgroundColor: b.color || COLORS[0] }} />
            <button onClick={() => onSeek?.(b.timestamp)} className="mt-0.5 text-xs text-[var(--primary)] font-mono hover:underline">
              {formatDuration(b.timestamp)}
            </button>
            <div className="flex-1 min-w-0">
              {editing === b.id ? (
                <>
                  <input
                    value={editData.title ?? b.title}
                    onChange={e => setEditData({ ...editData, title: e.target.value })}
                    className="w-full px-2 py-1 bg-zinc-800 rounded text-sm mb-1"
                  />
                  <textarea
                    value={editData.description ?? b.description ?? ''}
                    onChange={e => setEditData({ ...editData, description: e.target.value })}
                    className="w-full px-2 py-1 bg-zinc-800 rounded text-xs resize-none"
                    rows={2}
                  />
                  <div className="flex gap-1 mt-1">
                    <button onClick={() => updateBookmark(b.id, editData)} className="p-1 text-green-400"><Check size={12} /></button>
                    <button onClick={() => setEditing(null)} className="p-1 text-zinc-500"><X size={12} /></button>
                  </div>
                </>
              ) : (
                <>
                  <div className="text-sm font-medium">{b.title}</div>
                  {b.description && <div className="text-xs text-zinc-500 mt-0.5 line-clamp-2">{b.description}</div>}
                </>
              )}
            </div>
            <div className="flex gap-1 opacity-0 group-hover:opacity-100">
              <button onClick={() => { setEditing(b.id); setEditData({}) }} className="p-1 hover:bg-zinc-700 rounded"><Edit3 size={12} /></button>
              <button onClick={() => deleteBookmark(b.id)} className="p-1 hover:bg-red-500/20 text-red-400 rounded"><Trash2 size={12} /></button>
            </div>
          </div>
        ))}
      </div>

      {/* Timeline visualization */}
      {bookmarks.length > 0 && duration > 0 && (
        <div className="px-4 py-3 border-t border-zinc-800">
          <div className="text-xs text-zinc-500 mb-2">Timeline</div>
          <div className="relative h-2 bg-zinc-800 rounded-full overflow-hidden">
            {bookmarks.map(b => (
              <button
                key={b.id}
                onClick={() => onSeek?.(b.timestamp)}
                className="absolute top-0 w-1.5 h-full rounded-full hover:scale-150 transition-transform"
                style={{ left: `${(b.timestamp / duration) * 100}%`, backgroundColor: b.color || COLORS[0] }}
                title={`${b.title} - ${formatDuration(b.timestamp)}`}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
export default BookmarkManager
