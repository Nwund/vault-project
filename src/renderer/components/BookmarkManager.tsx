// File: src/renderer/components/BookmarkManager.tsx
// Video timestamp bookmarks with notes and categories

import React, { useState, useCallback, useMemo } from 'react'
import { Bookmark, Plus, Trash2, Edit3, Clock, Tag, Search, Filter, Heart, Star, ChevronRight, Check, X, MessageSquare } from 'lucide-react'
import { formatDuration } from '../utils/formatters'

interface BookmarkItem { id: string; mediaId: string; time: number; title: string; note?: string; category?: string; rating?: number; thumbnail?: string; createdAt: number }
interface BookmarkManagerProps { mediaId: string; currentTime: number; bookmarks: BookmarkItem[]; categories?: string[]; onAdd: (b: Omit<BookmarkItem, 'id' | 'createdAt'>) => void; onUpdate: (id: string, b: Partial<BookmarkItem>) => void; onDelete: (id: string) => void; onSeek: (time: number) => void; className?: string }

export function BookmarkManager({ mediaId, currentTime, bookmarks, categories = ['Important', 'Favorite', 'Review'], onAdd, onUpdate, onDelete, onSeek, className = '' }: BookmarkManagerProps) {
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<string | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [editData, setEditData] = useState<Partial<BookmarkItem>>({})
  const [showAdd, setShowAdd] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newNote, setNewNote] = useState('')
  const [newCategory, setNewCategory] = useState('')

  const filtered = useMemo(() => {
    return bookmarks.filter(b => b.mediaId === mediaId).filter(b => !search || b.title.toLowerCase().includes(search.toLowerCase()) || b.note?.toLowerCase().includes(search.toLowerCase())).filter(b => !filter || b.category === filter).sort((a, b) => a.time - b.time)
  }, [bookmarks, mediaId, search, filter])

  const addBookmark = useCallback(() => {
    if (!newTitle.trim()) return
    onAdd({ mediaId, time: currentTime, title: newTitle.trim(), note: newNote.trim() || undefined, category: newCategory || undefined })
    setNewTitle(''); setNewNote(''); setNewCategory(''); setShowAdd(false)
  }, [mediaId, currentTime, newTitle, newNote, newCategory, onAdd])

  const saveEdit = useCallback(() => {
    if (!editing) return
    onUpdate(editing, editData)
    setEditing(null); setEditData({})
  }, [editing, editData, onUpdate])

  return (
    <div className={`bg-zinc-900 rounded-xl border border-zinc-700 overflow-hidden ${className}`}>
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
        <div className="flex items-center gap-2"><Bookmark size={16} className="text-[var(--primary)]" /><span className="font-semibold text-sm">Bookmarks</span><span className="text-xs text-zinc-500">({filtered.length})</span></div>
        <button onClick={() => setShowAdd(true)} className="flex items-center gap-1 px-2 py-1 rounded bg-[var(--primary)] text-xs"><Plus size={12} />Add</button>
      </div>
      {/* Search & Filter */}
      <div className="flex gap-2 px-3 py-2 border-b border-zinc-800">
        <div className="flex-1 relative"><Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-zinc-500" /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search..." className="w-full pl-7 pr-2 py-1 bg-zinc-800 rounded text-xs" /></div>
        <select value={filter || ''} onChange={e => setFilter(e.target.value || null)} className="px-2 py-1 bg-zinc-800 rounded text-xs"><option value="">All</option>{categories.map(c => <option key={c} value={c}>{c}</option>)}</select>
      </div>
      {/* Add form */}
      {showAdd && <div className="p-3 border-b border-zinc-800 bg-zinc-800/50 space-y-2">
        <input value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder="Title" className="w-full px-2 py-1.5 bg-zinc-900 border border-zinc-700 rounded text-sm" autoFocus />
        <textarea value={newNote} onChange={e => setNewNote(e.target.value)} placeholder="Note (optional)" className="w-full px-2 py-1.5 bg-zinc-900 border border-zinc-700 rounded text-sm resize-none" rows={2} />
        <div className="flex gap-2"><select value={newCategory} onChange={e => setNewCategory(e.target.value)} className="flex-1 px-2 py-1.5 bg-zinc-900 border border-zinc-700 rounded text-sm"><option value="">No category</option>{categories.map(c => <option key={c} value={c}>{c}</option>)}</select>
        <button onClick={() => setShowAdd(false)} className="px-3 py-1.5 bg-zinc-700 rounded text-sm">Cancel</button><button onClick={addBookmark} disabled={!newTitle.trim()} className="px-3 py-1.5 bg-[var(--primary)] rounded text-sm disabled:opacity-50">Save</button></div>
        <div className="text-xs text-zinc-500">At {formatDuration(currentTime)}</div>
      </div>}
      {/* Bookmarks list */}
      <div className="max-h-64 overflow-y-auto">
        {filtered.length === 0 ? <div className="py-8 text-center text-zinc-500 text-sm">No bookmarks</div> : filtered.map(b => (
          <div key={b.id} className="group flex items-start gap-3 px-4 py-3 hover:bg-zinc-800/50 border-b border-zinc-800/30">
            <button onClick={() => onSeek(b.time)} className="mt-0.5 text-xs text-[var(--primary)] font-mono">{formatDuration(b.time)}</button>
            <div className="flex-1 min-w-0">
              {editing === b.id ? <><input value={editData.title || b.title} onChange={e => setEditData({ ...editData, title: e.target.value })} className="w-full px-2 py-1 bg-zinc-800 rounded text-sm mb-1" />
                <textarea value={editData.note ?? b.note ?? ''} onChange={e => setEditData({ ...editData, note: e.target.value })} className="w-full px-2 py-1 bg-zinc-800 rounded text-xs resize-none" rows={2} />
                <div className="flex gap-1 mt-1"><button onClick={saveEdit} className="p-1 text-green-400"><Check size={12} /></button><button onClick={() => setEditing(null)} className="p-1 text-zinc-500"><X size={12} /></button></div></>
              : <><div className="text-sm font-medium">{b.title}</div>{b.note && <div className="text-xs text-zinc-500 mt-0.5 line-clamp-2">{b.note}</div>}{b.category && <span className="inline-block mt-1 px-1.5 py-0.5 rounded bg-zinc-800 text-[10px] text-zinc-400">{b.category}</span>}</>}
            </div>
            <div className="flex gap-1 opacity-0 group-hover:opacity-100">
              <button onClick={() => { setEditing(b.id); setEditData({}) }} className="p-1 hover:bg-zinc-700 rounded"><Edit3 size={12} /></button>
              <button onClick={() => onDelete(b.id)} className="p-1 hover:bg-red-500/20 text-red-400 rounded"><Trash2 size={12} /></button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
export default BookmarkManager
