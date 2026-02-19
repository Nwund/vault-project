// File: src/renderer/components/MediaTimeline.tsx
// Timeline view showing media by date with grouping

import React, { useState, useMemo, useCallback } from 'react'
import { Calendar, ChevronLeft, ChevronRight, Grid3X3, List, Film, Image as ImageIcon, Star, Play, Eye } from 'lucide-react'

interface MediaItem { id: string; title: string; thumbnail?: string; type: 'video' | 'image'; date: number; rating?: number; duration?: number }
interface MediaTimelineProps { items: MediaItem[]; view?: 'month' | 'week' | 'day'; onSelect: (id: string) => void; onPlay: (id: string) => void; className?: string }

export function MediaTimeline({ items, view: initialView = 'month', onSelect, onPlay, className = '' }: MediaTimelineProps) {
  const [view, setView] = useState(initialView)
  const [currentDate, setCurrentDate] = useState(new Date())
  const [displayMode, setDisplayMode] = useState<'grid' | 'list'>('grid')

  const grouped = useMemo(() => {
    const groups: Record<string, MediaItem[]> = {}
    items.forEach(item => {
      const d = new Date(item.date)
      let key: string
      if (view === 'day') key = d.toISOString().split('T')[0]
      else if (view === 'week') { const w = new Date(d); w.setDate(d.getDate() - d.getDay()); key = w.toISOString().split('T')[0] }
      else key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      if (!groups[key]) groups[key] = []
      groups[key].push(item)
    })
    return Object.entries(groups).sort((a, b) => b[0].localeCompare(a[0]))
  }, [items, view])

  const currentPeriod = useMemo(() => {
    if (view === 'month') return currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    if (view === 'week') { const start = new Date(currentDate); start.setDate(currentDate.getDate() - currentDate.getDay()); return `Week of ${start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` }
    return currentDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
  }, [currentDate, view])

  const navigate = useCallback((dir: -1 | 1) => {
    setCurrentDate(d => {
      const n = new Date(d)
      if (view === 'month') n.setMonth(d.getMonth() + dir)
      else if (view === 'week') n.setDate(d.getDate() + dir * 7)
      else n.setDate(d.getDate() + dir)
      return n
    })
  }, [view])

  const formatGroupLabel = (key: string) => {
    const d = new Date(key)
    if (view === 'day') return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
    if (view === 'week') return `Week of ${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
    return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
  }

  return (
    <div className={`bg-zinc-900 rounded-xl border border-zinc-700 overflow-hidden ${className}`}>
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
        <div className="flex items-center gap-2"><Calendar size={16} className="text-[var(--primary)]" /><span className="font-semibold text-sm">Timeline</span></div>
        <div className="flex items-center gap-2">
          <div className="flex gap-1">{(['day', 'week', 'month'] as const).map(v => <button key={v} onClick={() => setView(v)} className={`px-2 py-1 rounded text-xs ${view === v ? 'bg-[var(--primary)]' : 'bg-zinc-800'}`}>{v.charAt(0).toUpperCase() + v.slice(1)}</button>)}</div>
          <button onClick={() => setDisplayMode(displayMode === 'grid' ? 'list' : 'grid')} className="p-1.5 rounded hover:bg-zinc-800">{displayMode === 'grid' ? <List size={14} /> : <Grid3X3 size={14} />}</button>
        </div>
      </div>
      {/* Navigation */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-800">
        <button onClick={() => navigate(-1)} className="p-1 rounded hover:bg-zinc-800"><ChevronLeft size={16} /></button>
        <span className="text-sm font-medium">{currentPeriod}</span>
        <button onClick={() => navigate(1)} className="p-1 rounded hover:bg-zinc-800"><ChevronRight size={16} /></button>
      </div>
      {/* Content */}
      <div className="max-h-96 overflow-y-auto">
        {grouped.length === 0 ? <div className="py-12 text-center text-zinc-500"><Calendar size={32} className="mx-auto mb-2 opacity-50" /><p className="text-sm">No media in this period</p></div>
        : grouped.map(([key, groupItems]) => (
          <div key={key} className="border-b border-zinc-800/50 last:border-0">
            <div className="flex items-center justify-between px-4 py-2 bg-zinc-800/30 sticky top-0"><span className="text-xs font-medium">{formatGroupLabel(key)}</span><span className="text-xs text-zinc-500">{groupItems.length} items</span></div>
            {displayMode === 'grid' ? <div className="grid grid-cols-4 gap-2 p-2">{groupItems.map(item => (
              <div key={item.id} onClick={() => onSelect(item.id)} className="relative aspect-video rounded overflow-hidden cursor-pointer group">
                {item.thumbnail ? <img src={item.thumbnail} className="w-full h-full object-cover" /> : <div className="w-full h-full bg-zinc-800 flex items-center justify-center">{item.type === 'video' ? <Film size={16} /> : <ImageIcon size={16} />}</div>}
                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center"><button onClick={e => { e.stopPropagation(); onPlay(item.id) }} className="p-2 rounded-full bg-[var(--primary)]"><Play size={14} /></button></div>
              </div>
            ))}</div> : <div>{groupItems.map(item => (
              <div key={item.id} onClick={() => onSelect(item.id)} className="flex items-center gap-3 px-4 py-2 hover:bg-zinc-800/50 cursor-pointer">
                <div className="w-12 h-8 rounded bg-zinc-800 overflow-hidden">{item.thumbnail && <img src={item.thumbnail} className="w-full h-full object-cover" />}</div>
                <div className="flex-1 min-w-0"><div className="text-sm truncate">{item.title}</div></div>
                {item.rating && <Star size={10} className="text-yellow-400 fill-yellow-400" />}
                <button onClick={e => { e.stopPropagation(); onPlay(item.id) }} className="p-1 rounded bg-[var(--primary)]"><Play size={10} /></button>
              </div>
            ))}</div>}
          </div>
        ))}
      </div>
    </div>
  )
}
export default MediaTimeline
