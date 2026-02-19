// File: src/renderer/components/VideoChapters.tsx
// Video chapter navigation with custom markers and backend persistence

import React, { useState, useCallback, useMemo, useEffect } from 'react'
import { BookOpen, Plus, Edit3, Trash2, Clock, GripVertical, Check, X, Loader2, RefreshCw, Sparkles } from 'lucide-react'
import { formatDuration } from '../utils/formatters'

interface Chapter {
  id: string
  time: number
  title: string
  color?: string
}

interface VideoChaptersProps {
  mediaId: string
  duration: number
  currentTime: number
  chapters?: Chapter[]
  onChaptersChange?: (chapters: Chapter[]) => void
  onSeek: (time: number) => void
  className?: string
}

const CHAPTER_COLORS = [
  '#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899'
]

export function VideoChapters({
  mediaId,
  duration,
  currentTime,
  chapters: propChapters,
  onChaptersChange,
  onSeek,
  className = ''
}: VideoChaptersProps) {
  const [chapters, setChapters] = useState<Chapter[]>(propChapters || [])
  const [loading, setLoading] = useState(!propChapters)
  const [saving, setSaving] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [generating, setGenerating] = useState(false)

  // Fetch chapters from backend
  useEffect(() => {
    if (propChapters) {
      setChapters(propChapters)
      return
    }

    const fetchChapters = async () => {
      setLoading(true)
      try {
        // Try dedicated chapters API
        let result = await window.api.invoke('chapters:getForMedia', mediaId)

        if (!result || !Array.isArray(result) || result.length === 0) {
          // Fallback: try to get from media metadata
          const media = await window.api.invoke('media:getById', mediaId)
          if (media?.chapters) {
            result = typeof media.chapters === 'string'
              ? JSON.parse(media.chapters)
              : media.chapters
          }
        }

        if (result && Array.isArray(result)) {
          setChapters(result.map((c: any, i: number) => ({
            id: c.id || `ch-${i}-${Date.now()}`,
            time: c.time || c.startTime || 0,
            title: c.title || c.name || `Chapter ${i + 1}`,
            color: c.color || CHAPTER_COLORS[i % CHAPTER_COLORS.length]
          })))
        }
      } catch (e) {
        console.error('Failed to fetch chapters:', e)
      }
      setLoading(false)
    }

    fetchChapters()
  }, [mediaId, propChapters])

  // Save chapters to backend
  const saveChapters = useCallback(async (updatedChapters: Chapter[]) => {
    setChapters(updatedChapters)
    onChaptersChange?.(updatedChapters)

    setSaving(true)
    try {
      // Try dedicated chapters API
      await window.api.invoke('chapters:saveForMedia', mediaId, updatedChapters)
    } catch {
      // Fallback: save to media metadata
      try {
        await window.api.invoke('media:updateMetadata', mediaId, {
          chapters: JSON.stringify(updatedChapters)
        })
      } catch (e) {
        console.error('Failed to save chapters:', e)
      }
    }
    setSaving(false)
  }, [mediaId, onChaptersChange])

  const sorted = useMemo(() =>
    [...chapters].sort((a, b) => a.time - b.time), [chapters])

  const current = useMemo(() =>
    sorted.filter(c => c.time <= currentTime).pop(), [sorted, currentTime])

  const addChapter = useCallback(async () => {
    const newChapter: Chapter = {
      id: `ch-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      time: currentTime,
      title: `Chapter ${chapters.length + 1}`,
      color: CHAPTER_COLORS[chapters.length % CHAPTER_COLORS.length]
    }
    await saveChapters([...chapters, newChapter])
  }, [chapters, currentTime, saveChapters])

  const updateChapter = useCallback(async (id: string, updates: Partial<Chapter>) => {
    const updatedChapters = chapters.map(c =>
      c.id === id ? { ...c, ...updates } : c
    )
    await saveChapters(updatedChapters)
    setEditing(null)
  }, [chapters, saveChapters])

  const deleteChapter = useCallback(async (id: string) => {
    const updatedChapters = chapters.filter(c => c.id !== id)
    await saveChapters(updatedChapters)
  }, [chapters, saveChapters])

  // Auto-generate chapters based on scene detection
  const generateChapters = useCallback(async () => {
    setGenerating(true)
    try {
      // Try scene detection
      const scenes = await window.api.invoke('scenes:detectById', mediaId)

      if (scenes && Array.isArray(scenes) && scenes.length > 0) {
        // Convert scenes to chapters
        const generatedChapters: Chapter[] = scenes.map((scene: any, i: number) => ({
          id: `ch-auto-${i}-${Date.now()}`,
          time: scene.time || scene.timestamp || scene.start || 0,
          title: scene.title || `Scene ${i + 1}`,
          color: CHAPTER_COLORS[i % CHAPTER_COLORS.length]
        }))

        // Filter to reasonable number of chapters
        const filtered = generatedChapters.filter((ch, i, arr) => {
          if (i === 0) return true
          // Minimum 30 seconds between chapters
          return ch.time - arr[i - 1].time >= 30
        }).slice(0, 20)

        await saveChapters(filtered)
      } else {
        // Fallback: create evenly spaced chapters
        const count = Math.min(Math.floor(duration / 60), 10) // One chapter per minute, max 10
        if (count >= 2) {
          const interval = duration / count
          const autoChapters: Chapter[] = []
          for (let i = 0; i < count; i++) {
            autoChapters.push({
              id: `ch-auto-${i}-${Date.now()}`,
              time: i * interval,
              title: `Part ${i + 1}`,
              color: CHAPTER_COLORS[i % CHAPTER_COLORS.length]
            })
          }
          await saveChapters(autoChapters)
        }
      }
    } catch (e) {
      console.error('Failed to generate chapters:', e)
    }
    setGenerating(false)
  }, [mediaId, duration, saveChapters])

  return (
    <div className={`bg-zinc-900 rounded-xl border border-zinc-700 overflow-hidden ${className}`}>
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
        <div className="flex items-center gap-2">
          <BookOpen size={16} className="text-[var(--primary)]" />
          <span className="font-semibold text-sm">Chapters</span>
          <span className="text-xs text-zinc-500">({chapters.length})</span>
          {saving && <Loader2 size={12} className="animate-spin text-zinc-500" />}
        </div>
        <div className="flex items-center gap-1">
          {chapters.length === 0 && (
            <button
              onClick={generateChapters}
              disabled={generating}
              className="flex items-center gap-1 px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-xs"
              title="Auto-generate chapters"
            >
              {generating ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <Sparkles size={12} />
              )}
              Auto
            </button>
          )}
          <button
            onClick={addChapter}
            className="flex items-center gap-1 px-2 py-1 rounded bg-[var(--primary)] text-xs"
          >
            <Plus size={12} />
            Add at {formatDuration(currentTime)}
          </button>
        </div>
      </div>

      {/* Timeline visualization */}
      <div className="px-4 py-2 border-b border-zinc-800">
        <div className="relative h-3 bg-zinc-800 rounded-full overflow-hidden">
          {/* Progress */}
          <div
            className="absolute h-full bg-white/20 rounded-l-full transition-all"
            style={{ width: `${(currentTime / duration) * 100}%` }}
          />
          {/* Chapter markers */}
          {sorted.map(ch => (
            <button
              key={ch.id}
              onClick={() => onSeek(ch.time)}
              className="absolute w-1.5 h-full rounded transition hover:scale-y-125"
              style={{
                left: `${(ch.time / duration) * 100}%`,
                backgroundColor: ch.color || '#var(--primary)',
                transform: `translateX(-50%)`,
                opacity: ch.id === current?.id ? 1 : 0.7
              }}
              title={`${ch.title} - ${formatDuration(ch.time)}`}
            />
          ))}
          {/* Current position indicator */}
          <div
            className="absolute top-0 w-0.5 h-full bg-white"
            style={{ left: `${(currentTime / duration) * 100}%` }}
          />
        </div>
      </div>

      {/* Chapter list */}
      <div className="max-h-48 overflow-y-auto">
        {loading ? (
          <div className="py-6 text-center">
            <Loader2 size={20} className="mx-auto animate-spin text-zinc-500" />
            <p className="text-sm text-zinc-500 mt-2">Loading chapters...</p>
          </div>
        ) : sorted.length === 0 ? (
          <div className="py-6 text-center text-zinc-500">
            <BookOpen size={24} className="mx-auto mb-2 opacity-50" />
            <p className="text-sm">No chapters yet</p>
            <p className="text-xs mt-1">Click "Add" to create chapters or "Auto" to generate them</p>
          </div>
        ) : (
          sorted.map((ch, i) => (
            <div
              key={ch.id}
              className={`flex items-center gap-2 px-4 py-2 group transition
                ${ch.id === current?.id ? 'bg-[var(--primary)]/10' : 'hover:bg-zinc-800/50'}`}
            >
              <GripVertical size={12} className="text-zinc-600 cursor-grab opacity-0 group-hover:opacity-100" />
              <div
                className="w-2 h-2 rounded-full flex-shrink-0"
                style={{ backgroundColor: ch.color || 'var(--primary)' }}
              />
              <button
                onClick={() => onSeek(ch.time)}
                className="w-14 text-xs text-zinc-500 hover:text-white text-left"
              >
                {formatDuration(ch.time)}
              </button>

              {editing === ch.id ? (
                <div className="flex-1 flex items-center gap-2">
                  <input
                    value={editTitle}
                    onChange={e => setEditTitle(e.target.value)}
                    className="flex-1 px-2 py-1 bg-zinc-800 rounded text-sm outline-none focus:ring-1 focus:ring-[var(--primary)]"
                    autoFocus
                    onKeyDown={e => {
                      if (e.key === 'Enter') updateChapter(ch.id, { title: editTitle })
                      if (e.key === 'Escape') setEditing(null)
                    }}
                  />
                  <div className="flex gap-1">
                    {CHAPTER_COLORS.map(color => (
                      <button
                        key={color}
                        onClick={() => updateChapter(ch.id, { color })}
                        className={`w-4 h-4 rounded-full ${ch.color === color ? 'ring-1 ring-white ring-offset-1 ring-offset-zinc-900' : ''}`}
                        style={{ backgroundColor: color }}
                      />
                    ))}
                  </div>
                  <button
                    onClick={() => updateChapter(ch.id, { title: editTitle })}
                    className="p-1 text-green-400 hover:bg-green-500/20 rounded"
                  >
                    <Check size={12} />
                  </button>
                  <button
                    onClick={() => setEditing(null)}
                    className="p-1 text-zinc-500 hover:bg-zinc-700 rounded"
                  >
                    <X size={12} />
                  </button>
                </div>
              ) : (
                <>
                  <span
                    className={`flex-1 text-sm cursor-pointer hover:text-[var(--primary)] ${ch.id === current?.id ? 'text-[var(--primary)] font-medium' : ''}`}
                    onClick={() => onSeek(ch.time)}
                  >
                    {ch.title}
                  </span>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition">
                    <button
                      onClick={() => { setEditing(ch.id); setEditTitle(ch.title) }}
                      className="p-1 rounded hover:bg-zinc-700"
                      title="Edit"
                    >
                      <Edit3 size={12} />
                    </button>
                    <button
                      onClick={() => deleteChapter(ch.id)}
                      className="p-1 rounded hover:bg-red-500/20 text-red-400"
                      title="Delete"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </>
              )}
            </div>
          ))
        )}
      </div>

      {/* Current chapter info */}
      {current && (
        <div className="px-4 py-2 border-t border-zinc-800 bg-zinc-800/30">
          <div className="flex items-center gap-2">
            <div
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: current.color || 'var(--primary)' }}
            />
            <span className="text-xs text-zinc-400">Now playing:</span>
            <span className="text-xs font-medium">{current.title}</span>
          </div>
        </div>
      )}
    </div>
  )
}
export default VideoChapters
