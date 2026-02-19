// File: src/renderer/components/RelatedMedia.tsx
// Show related/similar media suggestions with backend integration

import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { Link2, Play, Clock, RefreshCw, Film, Image as ImageIcon, Sparkles, Tag, Users, Layers, Loader2 } from 'lucide-react'
import { formatDuration } from '../utils/formatters'

type RelationType = 'similar' | 'same_performer' | 'same_tag' | 'same_series' | 'ai_recommended'

interface RelatedItem {
  id: string
  title: string
  thumbnail?: string
  type: 'video' | 'image'
  duration?: number
  rating?: number
  relationTypes: RelationType[]
  score: number
}

interface RelatedMediaProps {
  currentMediaId: string
  onLoad?: (mediaId: string) => Promise<RelatedItem[]>
  onPlay?: (id: string) => void
  onQueue?: (id: string) => void
  maxItems?: number
  className?: string
}

// Helper to extract items from various API response formats
function extractItems<T>(result: any): T[] {
  if (!result) return []
  if (Array.isArray(result)) return result
  if (result.items && Array.isArray(result.items)) return result.items
  if (result.data && Array.isArray(result.data)) return result.data
  if (result.rows && Array.isArray(result.rows)) return result.rows
  return []
}

export function RelatedMedia({
  currentMediaId,
  onLoad,
  onPlay,
  onQueue,
  maxItems = 10,
  className = ''
}: RelatedMediaProps) {
  const [items, setItems] = useState<RelatedItem[]>([])
  const [loading, setLoading] = useState(false)
  const [filter, setFilter] = useState<RelationType | 'all'>('all')
  const [showAll, setShowAll] = useState(false)

  // Fetch related media from backend
  const fetchRelated = useCallback(async () => {
    setLoading(true)
    try {
      // If custom loader provided, use it
      if (onLoad) {
        const result = await onLoad(currentMediaId)
        setItems(result)
        setLoading(false)
        return
      }

      // Otherwise fetch from backend APIs
      const related: RelatedItem[] = []
      const seenIds = new Set<string>([currentMediaId])

      // Get current media details
      const currentMedia = await window.api.invoke('media:getById', currentMediaId)
      if (!currentMedia) {
        setLoading(false)
        return
      }

      // 1. Find media with same tags
      if (currentMedia.tags?.length > 0) {
        try {
          const tagNames = currentMedia.tags.map((t: any) => t.name || t).slice(0, 3)
          for (const tag of tagNames) {
            const result = await window.api.media.list({ limit: 20, tags: [tag] })
            const tagMedia = extractItems(result)
            for (const m of tagMedia) {
              if (!seenIds.has(m.id)) {
                seenIds.add(m.id)
                related.push({
                  id: m.id,
                  title: m.filename || 'Unknown',
                  thumbnail: m.thumbPath,
                  type: m.type || 'video',
                  duration: m.durationSec,
                  rating: m.rating,
                  relationTypes: ['same_tag'],
                  score: 0.7
                })
              }
            }
          }
        } catch {}
      }

      // 2. Find similar by filename pattern
      const filename = currentMedia.filename || ''
      const nameWords = filename.replace(/\.[^.]+$/, '').split(/[\s_\-\[\]\(\)]+/).filter((w: string) => w.length > 3)
      if (nameWords.length > 0) {
        try {
          const searchWord = nameWords[0]
          const result = await window.api.media.list({ limit: 30, search: searchWord })
          const similarMedia = extractItems(result)
          for (const m of similarMedia) {
            if (!seenIds.has(m.id)) {
              seenIds.add(m.id)
              // Check how many words match
              const mWords = (m.filename || '').replace(/\.[^.]+$/, '').toLowerCase().split(/[\s_\-\[\]\(\)]+/)
              const matchCount = nameWords.filter((w: string) => mWords.includes(w.toLowerCase())).length
              if (matchCount > 0) {
                related.push({
                  id: m.id,
                  title: m.filename || 'Unknown',
                  thumbnail: m.thumbPath,
                  type: m.type || 'video',
                  duration: m.durationSec,
                  rating: m.rating,
                  relationTypes: matchCount >= 2 ? ['same_series'] : ['similar'],
                  score: 0.5 + (matchCount * 0.1)
                })
              }
            }
          }
        } catch {}
      }

      // 3. Try to get recommendations from watch history
      try {
        const recommendations = await window.api.invoke('watch:get-recommendations', 20)
        if (recommendations && Array.isArray(recommendations)) {
          for (const rec of recommendations.slice(0, 10)) {
            const id = rec.id || rec.mediaId
            if (!seenIds.has(id)) {
              seenIds.add(id)
              const media = await window.api.invoke('media:getById', id)
              if (media) {
                related.push({
                  id: media.id,
                  title: media.filename || 'Unknown',
                  thumbnail: media.thumbPath,
                  type: media.type || 'video',
                  duration: media.durationSec,
                  rating: media.rating,
                  relationTypes: ['ai_recommended'],
                  score: rec.score ? rec.score / 100 : 0.8
                })
              }
            }
          }
        }
      } catch {}

      // 4. Try relationships service
      try {
        const relationships = await window.api.invoke('relationships:getForMedia', currentMediaId)
        if (relationships && Array.isArray(relationships)) {
          for (const rel of relationships) {
            const otherId = rel.mediaId === currentMediaId ? rel.relatedMediaId : rel.mediaId
            if (!seenIds.has(otherId)) {
              seenIds.add(otherId)
              const media = await window.api.invoke('media:getById', otherId)
              if (media) {
                let relType: RelationType = 'similar'
                if (rel.type === 'series' || rel.type === 'sequel') relType = 'same_series'
                else if (rel.type === 'performer') relType = 'same_performer'

                related.push({
                  id: media.id,
                  title: media.filename || 'Unknown',
                  thumbnail: media.thumbPath,
                  type: media.type || 'video',
                  duration: media.durationSec,
                  rating: media.rating,
                  relationTypes: [relType],
                  score: 0.9
                })
              }
            }
          }
        }
      } catch {}

      // Sort by score and dedupe relation types
      related.sort((a, b) => b.score - a.score)

      // Merge duplicate entries
      const merged: Record<string, RelatedItem> = {}
      for (const item of related) {
        if (merged[item.id]) {
          // Merge relation types
          const existing = merged[item.id]
          for (const rt of item.relationTypes) {
            if (!existing.relationTypes.includes(rt)) {
              existing.relationTypes.push(rt)
            }
          }
          existing.score = Math.max(existing.score, item.score)
        } else {
          merged[item.id] = item
        }
      }

      setItems(Object.values(merged).sort((a, b) => b.score - a.score))
    } catch (e) {
      console.error('Failed to fetch related media:', e)
      setItems([])
    }
    setLoading(false)
  }, [currentMediaId, onLoad])

  useEffect(() => {
    fetchRelated()
  }, [fetchRelated])

  const filtered = useMemo(() => {
    let list = filter === 'all' ? items : items.filter(i => i.relationTypes.includes(filter))
    return showAll ? list : list.slice(0, maxItems)
  }, [items, filter, showAll, maxItems])

  const handlePlay = useCallback((id: string) => {
    if (onPlay) {
      onPlay(id)
    } else {
      window.dispatchEvent(new CustomEvent('vault-open-video', {
        detail: { id }
      }))
    }
  }, [onPlay])

  const handleQueue = useCallback((id: string) => {
    if (onQueue) {
      onQueue(id)
    } else {
      window.dispatchEvent(new CustomEvent('vault-add-to-queue', {
        detail: { mediaId: id }
      }))
    }
  }, [onQueue])

  const relationIcons: Record<RelationType, { icon: React.ElementType; color: string; label: string }> = {
    similar: { icon: Layers, color: 'text-blue-400', label: 'Similar' },
    same_performer: { icon: Users, color: 'text-pink-400', label: 'Same Performer' },
    same_tag: { icon: Tag, color: 'text-green-400', label: 'Same Tag' },
    same_series: { icon: Link2, color: 'text-purple-400', label: 'Same Series' },
    ai_recommended: { icon: Sparkles, color: 'text-orange-400', label: 'AI Pick' }
  }

  const filters: Array<RelationType | 'all'> = ['all', 'similar', 'same_performer', 'same_tag', 'same_series', 'ai_recommended']

  return (
    <div className={`bg-zinc-900 rounded-xl border border-zinc-700 overflow-hidden ${className}`}>
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
        <div className="flex items-center gap-2">
          <Link2 size={16} className="text-[var(--primary)]" />
          <span className="font-semibold text-sm">Related</span>
          <span className="text-xs text-zinc-500">({items.length})</span>
        </div>
        <button
          onClick={fetchRelated}
          disabled={loading}
          className="p-1.5 rounded hover:bg-zinc-800"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-1 px-3 py-2 border-b border-zinc-800 overflow-x-auto">
        {filters.map(f => {
          const info = f === 'all' ? { icon: Layers, color: '', label: 'All' } : relationIcons[f]
          const Icon = info.icon
          const count = f === 'all' ? items.length : items.filter(i => i.relationTypes.includes(f)).length
          if (f !== 'all' && count === 0) return null

          return (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`flex items-center gap-1 px-2 py-1 rounded text-xs whitespace-nowrap transition
                ${filter === f ? 'bg-[var(--primary)]' : 'bg-zinc-800 hover:bg-zinc-700'}`}
            >
              <Icon size={10} className={filter === f ? '' : info.color} />
              {info.label} ({count})
            </button>
          )
        })}
      </div>

      {/* Items */}
      <div className="max-h-80 overflow-y-auto">
        {loading ? (
          <div className="py-8 text-center">
            <Loader2 size={24} className="mx-auto animate-spin text-zinc-500" />
            <p className="text-sm text-zinc-500 mt-2">Finding related media...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-8 text-center text-zinc-500">
            <Link2 size={24} className="mx-auto mb-2 opacity-50" />
            <p className="text-sm">No related media found</p>
            <p className="text-xs mt-1">Add tags to improve suggestions</p>
          </div>
        ) : (
          filtered.map(item => (
            <div
              key={item.id}
              className="flex items-center gap-3 px-4 py-2 hover:bg-zinc-800/50 group cursor-pointer"
              onClick={() => handlePlay(item.id)}
            >
              <div className="relative w-20 h-12 rounded bg-zinc-800 overflow-hidden flex-shrink-0">
                {item.thumbnail ? (
                  <img src={item.thumbnail} className="w-full h-full object-cover" alt="" />
                ) : item.type === 'video' ? (
                  <Film size={16} className="absolute inset-0 m-auto text-zinc-600" />
                ) : (
                  <ImageIcon size={16} className="absolute inset-0 m-auto text-zinc-600" />
                )}
                {item.duration != null && item.duration > 0 && (
                  <div className="absolute bottom-0.5 right-0.5 px-1 bg-black/70 rounded text-[9px]">
                    {formatDuration(item.duration)}
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm truncate">{item.title}</div>
                <div className="flex items-center gap-1.5 mt-0.5">
                  {item.relationTypes.slice(0, 2).map(rt => {
                    const info = relationIcons[rt]
                    const Icon = info.icon
                    return (
                      <span key={rt} className={`flex items-center gap-0.5 ${info.color}`}>
                        <Icon size={8} />
                        <span className="text-[9px]">{info.label}</span>
                      </span>
                    )
                  })}
                </div>
              </div>
              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition">
                <button
                  onClick={(e) => { e.stopPropagation(); handleQueue(item.id) }}
                  className="p-1.5 rounded bg-zinc-700 hover:bg-zinc-600"
                  title="Add to Queue"
                >
                  <Clock size={12} />
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); handlePlay(item.id) }}
                  className="p-1.5 rounded bg-[var(--primary)]"
                  title="Play"
                >
                  <Play size={12} />
                </button>
              </div>
            </div>
          ))
        )}
        {items.length > maxItems && !showAll && (
          <button
            onClick={() => setShowAll(true)}
            className="w-full py-2 text-xs text-zinc-500 hover:text-white hover:bg-zinc-800 transition"
          >
            Show all ({items.length})
          </button>
        )}
      </div>
    </div>
  )
}
export default RelatedMedia
