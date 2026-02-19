// File: src/renderer/components/RelatedMedia.tsx
// Show related/similar media suggestions

import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { Link2, Play, Heart, Star, Clock, RefreshCw, ChevronRight, Film, Image as ImageIcon, Sparkles, Tag, Users, Layers } from 'lucide-react'
import { formatDuration } from '../utils/formatters'

type RelationType = 'similar' | 'same_performer' | 'same_tag' | 'same_series' | 'ai_recommended'
interface RelatedItem { id: string; title: string; thumbnail?: string; type: 'video' | 'image'; duration?: number; rating?: number; relationTypes: RelationType[]; score: number }
interface RelatedMediaProps { currentMediaId: string; onLoad: (mediaId: string) => Promise<RelatedItem[]>; onPlay: (id: string) => void; onQueue: (id: string) => void; maxItems?: number; className?: string }

export function RelatedMedia({ currentMediaId, onLoad, onPlay, onQueue, maxItems = 10, className = '' }: RelatedMediaProps) {
  const [items, setItems] = useState<RelatedItem[]>([])
  const [loading, setLoading] = useState(false)
  const [filter, setFilter] = useState<RelationType | 'all'>('all')
  const [showAll, setShowAll] = useState(false)

  useEffect(() => {
    setLoading(true)
    onLoad(currentMediaId).then(setItems).catch(() => setItems([])).finally(() => setLoading(false))
  }, [currentMediaId, onLoad])

  const filtered = useMemo(() => {
    let list = filter === 'all' ? items : items.filter(i => i.relationTypes.includes(filter))
    return showAll ? list : list.slice(0, maxItems)
  }, [items, filter, showAll, maxItems])

  const relationIcons: Record<RelationType, { icon: React.ElementType; color: string; label: string }> = {
    similar: { icon: Layers, color: 'text-blue-400', label: 'Similar' },
    same_performer: { icon: Users, color: 'text-pink-400', label: 'Same Performer' },
    same_tag: { icon: Tag, color: 'text-green-400', label: 'Same Tag' },
    same_series: { icon: Link2, color: 'text-purple-400', label: 'Same Series' },
    ai_recommended: { icon: Sparkles, color: 'text-orange-400', label: 'AI Recommended' }
  }

  const filters: Array<RelationType | 'all'> = ['all', 'similar', 'same_performer', 'same_tag', 'same_series', 'ai_recommended']

  return (
    <div className={`bg-zinc-900 rounded-xl border border-zinc-700 overflow-hidden ${className}`}>
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
        <div className="flex items-center gap-2"><Link2 size={16} className="text-[var(--primary)]" /><span className="font-semibold text-sm">Related</span><span className="text-xs text-zinc-500">({items.length})</span></div>
        <button onClick={() => { setLoading(true); onLoad(currentMediaId).then(setItems).finally(() => setLoading(false)) }} className="p-1.5 rounded hover:bg-zinc-800"><RefreshCw size={14} className={loading ? 'animate-spin' : ''} /></button>
      </div>
      {/* Filters */}
      <div className="flex gap-1 px-3 py-2 border-b border-zinc-800 overflow-x-auto">{filters.map(f => {
        const info = f === 'all' ? { icon: Layers, color: '', label: 'All' } : relationIcons[f]
        const Icon = info.icon
        const count = f === 'all' ? items.length : items.filter(i => i.relationTypes.includes(f)).length
        return <button key={f} onClick={() => setFilter(f)} className={`flex items-center gap-1 px-2 py-1 rounded text-xs whitespace-nowrap ${filter === f ? 'bg-[var(--primary)]' : 'bg-zinc-800'}`}><Icon size={10} className={filter === f ? '' : info.color} />{info.label} ({count})</button>
      })}</div>
      {/* Items */}
      <div className="max-h-80 overflow-y-auto">
        {loading ? <div className="py-8 text-center"><div className="w-6 h-6 border-2 border-zinc-700 border-t-[var(--primary)] rounded-full animate-spin mx-auto" /></div>
        : filtered.length === 0 ? <div className="py-8 text-center text-zinc-500"><Link2 size={24} className="mx-auto mb-2 opacity-50" /><p className="text-sm">No related media</p></div>
        : filtered.map(item => (
          <div key={item.id} className="flex items-center gap-3 px-4 py-2 hover:bg-zinc-800/50 group">
            <div className="relative w-20 h-12 rounded bg-zinc-800 overflow-hidden flex-shrink-0">
              {item.thumbnail ? <img src={item.thumbnail} className="w-full h-full object-cover" /> : item.type === 'video' ? <Film size={16} className="absolute inset-0 m-auto text-zinc-600" /> : <ImageIcon size={16} className="absolute inset-0 m-auto text-zinc-600" />}
              {item.duration && <div className="absolute bottom-0.5 right-0.5 px-1 bg-black/70 rounded text-[9px]">{formatDuration(item.duration)}</div>}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm truncate">{item.title}</div>
              <div className="flex items-center gap-1 mt-0.5">{item.relationTypes.slice(0, 2).map(rt => { const info = relationIcons[rt]; const Icon = info.icon; return <span key={rt} className={`flex items-center gap-0.5 ${info.color}`}><Icon size={8} /><span className="text-[9px]">{info.label}</span></span> })}</div>
            </div>
            {item.rating && <div className="flex items-center gap-0.5"><Star size={10} className="text-yellow-400 fill-yellow-400" /><span className="text-xs">{item.rating}</span></div>}
            <div className="flex gap-1 opacity-0 group-hover:opacity-100">
              <button onClick={() => onQueue(item.id)} className="p-1.5 rounded bg-zinc-700 hover:bg-zinc-600"><Clock size={12} /></button>
              <button onClick={() => onPlay(item.id)} className="p-1.5 rounded bg-[var(--primary)]"><Play size={12} /></button>
            </div>
          </div>
        ))}
        {items.length > maxItems && !showAll && <button onClick={() => setShowAll(true)} className="w-full py-2 text-xs text-zinc-500 hover:text-white hover:bg-zinc-800">Show all ({items.length})</button>}
      </div>
    </div>
  )
}
export default RelatedMedia
