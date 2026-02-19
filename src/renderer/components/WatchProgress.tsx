// File: src/renderer/components/WatchProgress.tsx
// Continue watching progress tracker

import React, { useState, useCallback, useMemo } from 'react'
import { Play, Clock, Trash2, ChevronRight, Calendar, Film, RotateCcw, CheckCircle, Eye, MoreHorizontal } from 'lucide-react'
import { formatDuration, formatDate } from '../utils/formatters'

interface WatchItem { id: string; mediaId: string; title: string; thumbnail?: string; progress: number; duration: number; lastWatched: number; completed: boolean }
interface WatchProgressProps { items: WatchItem[]; onResume: (mediaId: string, time: number) => void; onRemove: (id: string) => void; onMarkComplete: (id: string) => void; onClearAll: () => void; className?: string }

export function WatchProgress({ items, onResume, onRemove, onMarkComplete, onClearAll, className = '' }: WatchProgressProps) {
  const [filter, setFilter] = useState<'all' | 'inprogress' | 'completed'>('all')
  const [showMenu, setShowMenu] = useState<string | null>(null)

  const filtered = useMemo(() => {
    let list = [...items].sort((a, b) => b.lastWatched - a.lastWatched)
    if (filter === 'inprogress') list = list.filter(i => !i.completed && i.progress > 0)
    if (filter === 'completed') list = list.filter(i => i.completed)
    return list
  }, [items, filter])

  const stats = useMemo(() => ({
    total: items.length,
    inProgress: items.filter(i => !i.completed && i.progress > 0).length,
    completed: items.filter(i => i.completed).length,
    totalTime: items.reduce((acc, i) => acc + i.progress, 0)
  }), [items])

  return (
    <div className={`bg-zinc-900 rounded-xl border border-zinc-700 overflow-hidden ${className}`}>
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
        <div className="flex items-center gap-2"><Clock size={16} className="text-[var(--primary)]" /><span className="font-semibold text-sm">Continue Watching</span></div>
        <button onClick={onClearAll} className="text-xs text-zinc-500 hover:text-white">Clear All</button>
      </div>
      {/* Stats */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-800 text-xs text-zinc-500">
        <span>{stats.total} items • {formatDuration(stats.totalTime)} watched</span>
        <div className="flex gap-2">{(['all', 'inprogress', 'completed'] as const).map(f => <button key={f} onClick={() => setFilter(f)} className={`px-2 py-0.5 rounded ${filter === f ? 'bg-zinc-800 text-white' : ''}`}>{f === 'all' ? 'All' : f === 'inprogress' ? 'In Progress' : 'Completed'}</button>)}</div>
      </div>
      {/* List */}
      <div className="max-h-80 overflow-y-auto">
        {filtered.length === 0 ? <div className="py-12 text-center text-zinc-500"><Clock size={32} className="mx-auto mb-2 opacity-50" /><p className="text-sm">No watch history</p></div> : filtered.map(item => {
          const percent = (item.progress / item.duration) * 100
          return (
            <div key={item.id} className="relative group flex items-center gap-3 px-4 py-3 hover:bg-zinc-800/50">
              {/* Thumbnail */}
              <div className="relative w-20 h-12 rounded bg-zinc-800 overflow-hidden flex-shrink-0">
                {item.thumbnail ? <img src={item.thumbnail} className="w-full h-full object-cover" /> : <Film size={16} className="absolute inset-0 m-auto text-zinc-600" />}
                <div className="absolute bottom-0 left-0 right-0 h-1 bg-zinc-700"><div className="h-full bg-[var(--primary)]" style={{ width: `${percent}%` }} /></div>
                {item.completed && <div className="absolute inset-0 bg-black/50 flex items-center justify-center"><CheckCircle size={16} className="text-green-400" /></div>}
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
              <button onClick={() => onResume(item.mediaId, item.progress)} className="p-2 rounded-full bg-[var(--primary)] opacity-0 group-hover:opacity-100 transition"><Play size={14} /></button>
              <div className="relative">
                <button onClick={() => setShowMenu(showMenu === item.id ? null : item.id)} className="p-2 rounded opacity-0 group-hover:opacity-100 hover:bg-zinc-700"><MoreHorizontal size={14} /></button>
                {showMenu === item.id && <div className="absolute right-0 top-full mt-1 bg-zinc-800 rounded-lg border border-zinc-700 shadow-xl py-1 z-10">
                  <button onClick={() => { onMarkComplete(item.id); setShowMenu(null) }} className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-zinc-700 text-xs"><CheckCircle size={12} />Mark Complete</button>
                  <button onClick={() => { onRemove(item.id); setShowMenu(null) }} className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-zinc-700 text-red-400 text-xs"><Trash2 size={12} />Remove</button>
                </div>}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
export default WatchProgress
