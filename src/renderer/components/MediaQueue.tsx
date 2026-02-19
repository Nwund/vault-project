// File: src/renderer/components/MediaQueue.tsx
// Playback queue with ordering and shuffle

import React, { useState, useCallback, useMemo } from 'react'
import { ListOrdered, Play, Pause, SkipForward, SkipBack, Shuffle, Repeat, Repeat1, Trash2, GripVertical, X, Plus, Clock, ChevronUp, ChevronDown, Film } from 'lucide-react'
import { formatDuration } from '../utils/formatters'

interface QueueItem { id: string; title: string; thumbnail?: string; duration?: number; type: 'video' | 'image' }
type RepeatMode = 'off' | 'all' | 'one'
interface MediaQueueProps { items: QueueItem[]; currentIndex: number; isPlaying: boolean; onPlay: (index: number) => void; onPause: () => void; onNext: () => void; onPrev: () => void; onReorder: (from: number, to: number) => void; onRemove: (index: number) => void; onClear: () => void; onShuffle: () => void; repeatMode: RepeatMode; onRepeatChange: (mode: RepeatMode) => void; className?: string }

export function MediaQueue({ items, currentIndex, isPlaying, onPlay, onPause, onNext, onPrev, onReorder, onRemove, onClear, onShuffle, repeatMode, onRepeatChange, className = '' }: MediaQueueProps) {
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [dropIndex, setDropIndex] = useState<number | null>(null)

  const totalDuration = useMemo(() => items.reduce((acc, i) => acc + (i.duration || 0), 0), [items])
  const remainingDuration = useMemo(() => items.slice(currentIndex).reduce((acc, i) => acc + (i.duration || 0), 0), [items, currentIndex])

  const handleDragStart = (index: number) => setDragIndex(index)
  const handleDragOver = (index: number) => setDropIndex(index)
  const handleDragEnd = () => {
    if (dragIndex !== null && dropIndex !== null && dragIndex !== dropIndex) onReorder(dragIndex, dropIndex)
    setDragIndex(null); setDropIndex(null)
  }

  const cycleRepeat = useCallback(() => {
    const modes: RepeatMode[] = ['off', 'all', 'one']
    const next = modes[(modes.indexOf(repeatMode) + 1) % modes.length]
    onRepeatChange(next)
  }, [repeatMode, onRepeatChange])

  const RepeatIcon = repeatMode === 'one' ? Repeat1 : Repeat

  return (
    <div className={`bg-zinc-900 rounded-xl border border-zinc-700 overflow-hidden ${className}`}>
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
        <div className="flex items-center gap-2"><ListOrdered size={16} className="text-[var(--primary)]" /><span className="font-semibold text-sm">Queue</span><span className="text-xs text-zinc-500">({items.length})</span></div>
        <button onClick={onClear} className="text-xs text-zinc-500 hover:text-white">Clear</button>
      </div>
      {/* Stats */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-800 text-xs text-zinc-500">
        <span>Total: {formatDuration(totalDuration)}</span>
        <span>Remaining: {formatDuration(remainingDuration)}</span>
      </div>
      {/* Controls */}
      <div className="flex items-center justify-center gap-2 px-4 py-3 border-b border-zinc-800">
        <button onClick={onShuffle} className="p-2 rounded-full hover:bg-zinc-800"><Shuffle size={16} /></button>
        <button onClick={onPrev} disabled={currentIndex === 0} className="p-2 rounded-full hover:bg-zinc-800 disabled:opacity-30"><SkipBack size={16} /></button>
        <button onClick={() => isPlaying ? onPause() : onPlay(currentIndex)} className="p-3 rounded-full bg-[var(--primary)]">{isPlaying ? <Pause size={18} /> : <Play size={18} />}</button>
        <button onClick={onNext} disabled={currentIndex >= items.length - 1} className="p-2 rounded-full hover:bg-zinc-800 disabled:opacity-30"><SkipForward size={16} /></button>
        <button onClick={cycleRepeat} className={`p-2 rounded-full ${repeatMode !== 'off' ? 'text-[var(--primary)]' : ''} hover:bg-zinc-800`}><RepeatIcon size={16} /></button>
      </div>
      {/* Queue list */}
      <div className="max-h-64 overflow-y-auto">
        {items.length === 0 ? <div className="py-12 text-center text-zinc-500"><ListOrdered size={32} className="mx-auto mb-2 opacity-50" /><p className="text-sm">Queue is empty</p></div>
        : items.map((item, index) => {
          const isCurrent = index === currentIndex
          const isPlayed = index < currentIndex
          return (
            <div key={item.id} draggable onDragStart={() => handleDragStart(index)} onDragOver={() => handleDragOver(index)} onDragEnd={handleDragEnd}
              className={`flex items-center gap-2 px-4 py-2 group ${isCurrent ? 'bg-[var(--primary)]/10' : isPlayed ? 'opacity-50' : ''} ${dropIndex === index ? 'border-t-2 border-[var(--primary)]' : ''} ${dragIndex === index ? 'opacity-50' : ''} hover:bg-zinc-800/30`}>
              <GripVertical size={12} className="text-zinc-600 cursor-grab" />
              <span className="w-6 text-center text-xs text-zinc-500">{index + 1}</span>
              <div className="relative w-12 h-8 rounded bg-zinc-800 overflow-hidden flex-shrink-0">
                {item.thumbnail ? <img src={item.thumbnail} className="w-full h-full object-cover" /> : <Film size={12} className="absolute inset-0 m-auto text-zinc-600" />}
                {isCurrent && isPlaying && <div className="absolute inset-0 bg-black/50 flex items-center justify-center"><div className="flex gap-0.5">{[0,1,2].map(i => <div key={i} className="w-0.5 h-3 bg-[var(--primary)] animate-pulse" style={{ animationDelay: `${i * 0.1}s` }} />)}</div></div>}
              </div>
              <div className="flex-1 min-w-0">
                <div className={`text-sm truncate ${isCurrent ? 'text-[var(--primary)] font-medium' : ''}`}>{item.title}</div>
                {item.duration && <div className="text-xs text-zinc-600">{formatDuration(item.duration)}</div>}
              </div>
              <div className="flex gap-1 opacity-0 group-hover:opacity-100">
                <button onClick={() => onPlay(index)} className="p-1 rounded hover:bg-zinc-700"><Play size={12} /></button>
                <button onClick={() => onRemove(index)} className="p-1 rounded hover:bg-red-500/20 text-red-400"><X size={12} /></button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
export default MediaQueue
