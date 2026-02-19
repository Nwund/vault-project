// File: src/renderer/components/PlaylistSorter.tsx
// Advanced playlist sorting with multiple criteria

import React, { useState, useCallback, useMemo } from 'react'
import { ArrowUpDown, ArrowUp, ArrowDown, GripVertical, Shuffle, RotateCcw, Check, Calendar, Clock, Star, Eye, Film, Hash, Type } from 'lucide-react'

type SortField = 'title' | 'date' | 'duration' | 'rating' | 'views' | 'random' | 'custom'
type SortOrder = 'asc' | 'desc'
interface SortCriteria { field: SortField; order: SortOrder }
interface PlaylistItem { id: string; title: string; date?: number; duration?: number; rating?: number; views?: number; index: number }
interface PlaylistSorterProps { items: PlaylistItem[]; onSort: (sortedIds: string[]) => void; onReorder?: (fromIndex: number, toIndex: number) => void; className?: string }

export function PlaylistSorter({ items, onSort, onReorder, className = '' }: PlaylistSorterProps) {
  const [criteria, setCriteria] = useState<SortCriteria[]>([{ field: 'custom', order: 'asc' }])
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [dropIndex, setDropIndex] = useState<number | null>(null)

  const sortOptions: Array<{ field: SortField; label: string; icon: React.ElementType }> = [
    { field: 'custom', label: 'Custom', icon: GripVertical }, { field: 'title', label: 'Title', icon: Type },
    { field: 'date', label: 'Date', icon: Calendar }, { field: 'duration', label: 'Duration', icon: Clock },
    { field: 'rating', label: 'Rating', icon: Star }, { field: 'views', label: 'Views', icon: Eye },
    { field: 'random', label: 'Random', icon: Shuffle }
  ]

  const sortedItems = useMemo(() => {
    const sorted = [...items]
    for (const c of criteria) {
      sorted.sort((a, b) => {
        let cmp = 0
        switch (c.field) {
          case 'title': cmp = a.title.localeCompare(b.title); break
          case 'date': cmp = (a.date || 0) - (b.date || 0); break
          case 'duration': cmp = (a.duration || 0) - (b.duration || 0); break
          case 'rating': cmp = (a.rating || 0) - (b.rating || 0); break
          case 'views': cmp = (a.views || 0) - (b.views || 0); break
          case 'random': cmp = Math.random() - 0.5; break
          case 'custom': cmp = a.index - b.index; break
        }
        return c.order === 'desc' ? -cmp : cmp
      })
    }
    return sorted
  }, [items, criteria])

  const applySort = useCallback((field: SortField) => {
    if (field === 'random') {
      setCriteria([{ field: 'random', order: 'asc' }])
      onSort(items.map(i => i.id).sort(() => Math.random() - 0.5))
      return
    }
    const existing = criteria.find(c => c.field === field)
    if (existing) {
      if (existing.order === 'asc') setCriteria([{ field, order: 'desc' }])
      else setCriteria([{ field: 'custom', order: 'asc' }])
    } else {
      setCriteria([{ field, order: 'asc' }])
    }
  }, [criteria, items, onSort])

  const handleApply = useCallback(() => {
    onSort(sortedItems.map(i => i.id))
  }, [sortedItems, onSort])

  const handleDragStart = useCallback((index: number) => setDragIndex(index), [])
  const handleDragOver = useCallback((index: number) => setDropIndex(index), [])
  const handleDragEnd = useCallback(() => {
    if (dragIndex !== null && dropIndex !== null && dragIndex !== dropIndex) {
      onReorder?.(dragIndex, dropIndex)
    }
    setDragIndex(null); setDropIndex(null)
  }, [dragIndex, dropIndex, onReorder])

  const reset = useCallback(() => {
    setCriteria([{ field: 'custom', order: 'asc' }])
    onSort(items.sort((a, b) => a.index - b.index).map(i => i.id))
  }, [items, onSort])

  const currentSort = criteria[0]

  return (
    <div className={`bg-zinc-900 rounded-xl border border-zinc-700 overflow-hidden ${className}`}>
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
        <div className="flex items-center gap-2"><ArrowUpDown size={16} className="text-[var(--primary)]" /><span className="font-semibold text-sm">Sort Playlist</span></div>
        <div className="flex gap-1"><button onClick={reset} className="p-1.5 rounded hover:bg-zinc-800"><RotateCcw size={14} /></button><button onClick={handleApply} className="flex items-center gap-1 px-3 py-1.5 rounded bg-[var(--primary)] text-sm"><Check size={14} />Apply</button></div>
      </div>
      {/* Sort options */}
      <div className="flex flex-wrap gap-2 px-4 py-3 border-b border-zinc-800">
        {sortOptions.map(opt => {
          const isActive = currentSort.field === opt.field
          const Icon = opt.icon
          return <button key={opt.field} onClick={() => applySort(opt.field)} className={`flex items-center gap-1 px-3 py-1.5 rounded text-sm ${isActive ? 'bg-[var(--primary)]' : 'bg-zinc-800 hover:bg-zinc-700'}`}>
            <Icon size={12} />{opt.label}
            {isActive && opt.field !== 'random' && opt.field !== 'custom' && (currentSort.order === 'asc' ? <ArrowUp size={10} /> : <ArrowDown size={10} />)}
          </button>
        })}
      </div>
      {/* Preview */}
      <div className="max-h-48 overflow-y-auto">
        {sortedItems.slice(0, 10).map((item, i) => (
          <div key={item.id} draggable={currentSort.field === 'custom'} onDragStart={() => handleDragStart(i)} onDragOver={() => handleDragOver(i)} onDragEnd={handleDragEnd}
            className={`flex items-center gap-3 px-4 py-2 ${dropIndex === i ? 'bg-[var(--primary)]/20' : 'hover:bg-zinc-800/50'} ${dragIndex === i ? 'opacity-50' : ''}`}>
            {currentSort.field === 'custom' && <GripVertical size={12} className="text-zinc-600 cursor-grab" />}
            <span className="w-6 text-xs text-zinc-500">{i + 1}</span>
            <span className="flex-1 text-sm truncate">{item.title}</span>
            {item.rating && <span className="flex items-center gap-0.5 text-xs text-yellow-400"><Star size={10} className="fill-current" />{item.rating}</span>}
          </div>
        ))}
        {sortedItems.length > 10 && <div className="px-4 py-2 text-xs text-zinc-500">+ {sortedItems.length - 10} more items</div>}
      </div>
    </div>
  )
}
export default PlaylistSorter
