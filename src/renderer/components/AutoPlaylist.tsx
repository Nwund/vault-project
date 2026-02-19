// File: src/renderer/components/AutoPlaylist.tsx
// Auto-generated playlists based on viewing habits

import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { Sparkles, Play, Clock, TrendingUp, Heart, Star, Calendar, RefreshCw, ChevronRight, Film, Shuffle, Plus, Check } from 'lucide-react'
import { formatDuration } from '../utils/formatters'

type PlaylistType = 'most_watched' | 'recently_added' | 'top_rated' | 'favorites' | 'unwatched' | 'trending' | 'mood_match'
interface AutoPlaylistItem { id: string; title: string; thumbnail?: string; duration?: number; type: 'video' | 'image' }
interface AutoPlaylist { type: PlaylistType; title: string; description: string; icon: React.ElementType; items: AutoPlaylistItem[]; color: string }
interface AutoPlaylistProps { onGenerate: (type: PlaylistType) => Promise<AutoPlaylistItem[]>; onPlay: (items: AutoPlaylistItem[]) => void; onSave: (type: PlaylistType, name: string) => void; className?: string }

const PLAYLIST_TYPES: Array<{ type: PlaylistType; title: string; desc: string; icon: React.ElementType; color: string }> = [
  { type: 'most_watched', title: 'Most Watched', desc: 'Your top replays', icon: TrendingUp, color: 'text-blue-400' },
  { type: 'recently_added', title: 'Recently Added', desc: 'Fresh content', icon: Clock, color: 'text-green-400' },
  { type: 'top_rated', title: 'Top Rated', desc: '5-star favorites', icon: Star, color: 'text-yellow-400' },
  { type: 'favorites', title: 'Quick Favorites', desc: 'Most loved', icon: Heart, color: 'text-red-400' },
  { type: 'unwatched', title: 'Unwatched', desc: 'Discover new', icon: Sparkles, color: 'text-purple-400' },
  { type: 'trending', title: 'Trending', desc: 'Hot this week', icon: TrendingUp, color: 'text-orange-400' },
  { type: 'mood_match', title: 'Mood Match', desc: 'Based on time', icon: Calendar, color: 'text-pink-400' }
]

export function AutoPlaylist({ onGenerate, onPlay, onSave, className = '' }: AutoPlaylistProps) {
  const [playlists, setPlaylists] = useState<AutoPlaylist[]>([])
  const [loading, setLoading] = useState<PlaylistType | null>(null)
  const [expanded, setExpanded] = useState<PlaylistType | null>(null)
  const [saved, setSaved] = useState<Set<PlaylistType>>(new Set())

  const generatePlaylist = useCallback(async (type: PlaylistType) => {
    setLoading(type)
    try {
      const items = await onGenerate(type)
      const config = PLAYLIST_TYPES.find(p => p.type === type)!
      setPlaylists(prev => {
        const filtered = prev.filter(p => p.type !== type)
        return [...filtered, { type, title: config.title, description: config.desc, icon: config.icon, items, color: config.color }]
      })
      setExpanded(type)
    } catch (e) { console.error('Failed to generate playlist:', e) }
    finally { setLoading(null) }
  }, [onGenerate])

  const handleSave = useCallback((type: PlaylistType) => {
    const playlist = playlists.find(p => p.type === type)
    if (playlist) {
      onSave(type, playlist.title)
      setSaved(prev => new Set([...prev, type]))
    }
  }, [playlists, onSave])

  const totalDuration = useCallback((items: AutoPlaylistItem[]) => items.reduce((acc, i) => acc + (i.duration || 0), 0), [])

  return (
    <div className={`bg-zinc-900 rounded-xl border border-zinc-700 overflow-hidden ${className}`}>
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
        <div className="flex items-center gap-2"><Sparkles size={16} className="text-[var(--primary)]" /><span className="font-semibold text-sm">Auto Playlists</span></div>
        <button onClick={() => PLAYLIST_TYPES.forEach(p => generatePlaylist(p.type))} className="text-xs text-zinc-500 hover:text-white">Generate All</button>
      </div>
      <div className="max-h-96 overflow-y-auto">
        {PLAYLIST_TYPES.map(config => {
          const playlist = playlists.find(p => p.type === config.type)
          const isLoading = loading === config.type
          const isExpanded = expanded === config.type
          const isSaved = saved.has(config.type)
          const Icon = config.icon

          return (
            <div key={config.type} className="border-b border-zinc-800/50 last:border-0">
              <div className="flex items-center gap-3 px-4 py-3 hover:bg-zinc-800/30 cursor-pointer" onClick={() => playlist ? setExpanded(isExpanded ? null : config.type) : generatePlaylist(config.type)}>
                <div className={`w-8 h-8 rounded-lg bg-zinc-800 flex items-center justify-center ${config.color}`}><Icon size={16} /></div>
                <div className="flex-1">
                  <div className="text-sm font-medium">{config.title}</div>
                  <div className="text-xs text-zinc-500">{config.desc}</div>
                </div>
                {isLoading ? <div className="w-4 h-4 border-2 border-zinc-600 border-t-[var(--primary)] rounded-full animate-spin" />
                : playlist ? <><span className="text-xs text-zinc-500">{playlist.items.length} items</span><ChevronRight size={14} className={`text-zinc-600 transition ${isExpanded ? 'rotate-90' : ''}`} /></>
                : <button className="px-2 py-1 rounded bg-zinc-800 text-xs">Generate</button>}
              </div>
              {/* Expanded content */}
              {isExpanded && playlist && <div className="px-4 pb-3">
                <div className="flex gap-2 mb-2">
                  <button onClick={() => onPlay(playlist.items)} className="flex-1 flex items-center justify-center gap-1 py-2 bg-[var(--primary)] rounded text-sm"><Play size={14} />Play All</button>
                  <button onClick={() => onPlay([...playlist.items].sort(() => Math.random() - 0.5))} className="p-2 rounded bg-zinc-800"><Shuffle size={14} /></button>
                  {!isSaved && <button onClick={() => handleSave(config.type)} className="p-2 rounded bg-zinc-800"><Plus size={14} /></button>}
                  {isSaved && <button className="p-2 rounded bg-green-500/20 text-green-400"><Check size={14} /></button>}
                </div>
                <div className="text-xs text-zinc-500 mb-2">{formatDuration(totalDuration(playlist.items))} total</div>
                <div className="grid grid-cols-4 gap-1">{playlist.items.slice(0, 8).map(item => (
                  <div key={item.id} className="aspect-video rounded overflow-hidden bg-zinc-800">{item.thumbnail && <img src={item.thumbnail} className="w-full h-full object-cover" />}</div>
                ))}{playlist.items.length > 8 && <div className="aspect-video rounded bg-zinc-800 flex items-center justify-center text-xs text-zinc-500">+{playlist.items.length - 8}</div>}</div>
              </div>}
            </div>
          )
        })}
      </div>
    </div>
  )
}
export default AutoPlaylist
