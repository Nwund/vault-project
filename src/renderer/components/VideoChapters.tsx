// File: src/renderer/components/VideoChapters.tsx
// Video chapter navigation with custom markers

import React, { useState, useCallback, useMemo } from 'react'
import { BookOpen, Plus, Edit3, Trash2, Clock, ChevronRight, GripVertical, Check, X } from 'lucide-react'
import { formatDuration } from '../utils/formatters'

interface Chapter { id: string; time: number; title: string; color?: string }
interface VideoChaptersProps {
  mediaId: string
  duration: number
  currentTime: number
  chapters: Chapter[]
  onChaptersChange: (chapters: Chapter[]) => void
  onSeek: (time: number) => void
  className?: string
}

export function VideoChapters({ mediaId, duration, currentTime, chapters, onChaptersChange, onSeek, className = '' }: VideoChaptersProps) {
  const [editing, setEditing] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const sorted = useMemo(() => [...chapters].sort((a, b) => a.time - b.time), [chapters])
  const current = useMemo(() => sorted.filter(c => c.time <= currentTime).pop(), [sorted, currentTime])

  const addChapter = useCallback(() => {
    const ch: Chapter = { id: `ch-${Date.now()}`, time: currentTime, title: `Chapter ${chapters.length + 1}` }
    onChaptersChange([...chapters, ch])
  }, [chapters, currentTime, onChaptersChange])

  const updateChapter = useCallback((id: string, title: string) => {
    onChaptersChange(chapters.map(c => c.id === id ? { ...c, title } : c))
    setEditing(null)
  }, [chapters, onChaptersChange])

  const deleteChapter = useCallback((id: string) => {
    onChaptersChange(chapters.filter(c => c.id !== id))
  }, [chapters, onChaptersChange])

  return (
    <div className={`bg-zinc-900 rounded-xl border border-zinc-700 overflow-hidden ${className}`}>
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
        <div className="flex items-center gap-2"><BookOpen size={16} className="text-[var(--primary)]" /><span className="font-semibold text-sm">Chapters</span><span className="text-xs text-zinc-500">({chapters.length})</span></div>
        <button onClick={addChapter} className="flex items-center gap-1 px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-xs"><Plus size={12} />Add at {formatDuration(currentTime)}</button>
      </div>
      {/* Timeline */}
      <div className="px-4 py-2 border-b border-zinc-800"><div className="relative h-2 bg-zinc-800 rounded-full">
        {sorted.map(ch => <div key={ch.id} className={`absolute w-1 h-full rounded ${ch.id === current?.id ? 'bg-[var(--primary)]' : 'bg-zinc-600'}`} style={{ left: `${(ch.time / duration) * 100}%` }} title={ch.title} />)}
        <div className="absolute h-full bg-white/20 rounded-l-full" style={{ width: `${(currentTime / duration) * 100}%` }} />
      </div></div>
      {/* List */}
      <div className="max-h-48 overflow-y-auto">
        {sorted.length === 0 ? <div className="py-6 text-center text-zinc-500 text-sm">No chapters yet</div> : sorted.map((ch, i) => (
          <div key={ch.id} className={`flex items-center gap-2 px-4 py-2 ${ch.id === current?.id ? 'bg-[var(--primary)]/10' : 'hover:bg-zinc-800'}`}>
            <GripVertical size={12} className="text-zinc-600 cursor-grab" />
            <button onClick={() => onSeek(ch.time)} className="w-12 text-xs text-zinc-500">{formatDuration(ch.time)}</button>
            {editing === ch.id ? (
              <><input value={editTitle} onChange={e => setEditTitle(e.target.value)} className="flex-1 px-2 py-1 bg-zinc-800 rounded text-sm" autoFocus onKeyDown={e => e.key === 'Enter' && updateChapter(ch.id, editTitle)} />
              <button onClick={() => updateChapter(ch.id, editTitle)} className="p-1 text-green-400"><Check size={12} /></button>
              <button onClick={() => setEditing(null)} className="p-1 text-zinc-500"><X size={12} /></button></>
            ) : (
              <><span className="flex-1 text-sm cursor-pointer" onClick={() => onSeek(ch.time)}>{ch.title}</span>
              <button onClick={() => { setEditing(ch.id); setEditTitle(ch.title) }} className="p-1 opacity-0 group-hover:opacity-100 hover:bg-zinc-700 rounded"><Edit3 size={12} /></button>
              <button onClick={() => deleteChapter(ch.id)} className="p-1 opacity-0 group-hover:opacity-100 hover:bg-red-500/20 text-red-400 rounded"><Trash2 size={12} /></button></>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
export default VideoChapters
