// File: src/renderer/components/QuickNote.tsx
// Quick notes attachment for media items with backend persistence

import React, { useState, useCallback, useRef, useEffect } from 'react'
import { StickyNote, Plus, Trash2, Edit3, Check, X, Clock, Pin, PinOff, Loader2, RefreshCw } from 'lucide-react'
import { formatDate } from '../utils/formatters'

interface Note {
  id: string
  content: string
  color: string
  pinned: boolean
  createdAt: number
  updatedAt: number
}

interface QuickNoteProps {
  mediaId: string
  notes?: Note[]
  onChange?: (notes: Note[]) => void
  className?: string
}

const COLORS = ['#fef08a', '#bef264', '#67e8f9', '#f9a8d4', '#fdba74', '#c4b5fd']

export function QuickNote({ mediaId, notes: propNotes, onChange, className = '' }: QuickNoteProps) {
  const [notes, setNotes] = useState<Note[]>(propNotes || [])
  const [loading, setLoading] = useState(!propNotes)
  const [saving, setSaving] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  const [editContent, setEditContent] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [newContent, setNewContent] = useState('')
  const [newColor, setNewColor] = useState(COLORS[0])
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Fetch notes from backend
  useEffect(() => {
    if (propNotes) {
      setNotes(propNotes)
      return
    }

    const fetchNotes = async () => {
      setLoading(true)
      try {
        // Try dedicated notes API first
        let result = await window.api.invoke('notes:getForMedia', mediaId)

        if (!result || !Array.isArray(result)) {
          // Fallback: try to get from media metadata
          const media = await window.api.invoke('media:getById', mediaId)
          if (media?.notes) {
            result = typeof media.notes === 'string'
              ? JSON.parse(media.notes)
              : media.notes
          }
        }

        if (result && Array.isArray(result)) {
          setNotes(result.map((n: any) => ({
            id: n.id || `note-${Date.now()}-${Math.random()}`,
            content: n.content || n.text || '',
            color: n.color || COLORS[0],
            pinned: n.isPinned || n.pinned || false,
            createdAt: n.createdAt || n.created_at || Date.now(),
            updatedAt: n.updatedAt || n.updated_at || Date.now()
          })))
        }
      } catch (e) {
        console.error('Failed to fetch notes:', e)
      }
      setLoading(false)
    }

    fetchNotes()
  }, [mediaId, propNotes])

  // Update local state only - individual operations handle backend
  const updateLocalNotes = useCallback((updatedNotes: Note[]) => {
    setNotes(updatedNotes)
    onChange?.(updatedNotes)
  }, [onChange])

  const sorted = [...notes].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
    return b.updatedAt - a.updatedAt
  })

  const addNote = useCallback(async () => {
    if (!newContent.trim()) return
    setSaving(true)
    try {
      // Use notes:add API - returns the created note
      const created = await window.api.invoke('notes:add', mediaId, newContent.trim(), {
        isPinned: false,
        color: newColor
      })

      if (created) {
        const note: Note = {
          id: created.id,
          content: created.content,
          color: created.color || newColor,
          pinned: created.isPinned || false,
          createdAt: created.createdAt || Date.now(),
          updatedAt: created.updatedAt || Date.now()
        }
        updateLocalNotes([...notes, note])
      }
    } catch (e) {
      console.error('Failed to add note:', e)
    }
    setSaving(false)
    setNewContent('')
    setShowAdd(false)
  }, [newContent, newColor, notes, updateLocalNotes, mediaId])

  const updateNote = useCallback(async (id: string, updates: Partial<Note>) => {
    setSaving(true)
    try {
      // Map local Note fields to backend MediaNote fields
      const backendUpdates: any = {}
      if (updates.content !== undefined) backendUpdates.content = updates.content
      if (updates.pinned !== undefined) backendUpdates.isPinned = updates.pinned
      if (updates.color !== undefined) backendUpdates.color = updates.color

      await window.api.invoke('notes:update', id, backendUpdates)

      const updatedNotes = notes.map(n =>
        n.id === id ? { ...n, ...updates, updatedAt: Date.now() } : n
      )
      updateLocalNotes(updatedNotes)
    } catch (e) {
      console.error('Failed to update note:', e)
    }
    setSaving(false)
    setEditing(null)
  }, [notes, updateLocalNotes])

  const deleteNote = useCallback(async (id: string) => {
    setSaving(true)
    try {
      await window.api.invoke('notes:delete', id)
      const updatedNotes = notes.filter(n => n.id !== id)
      updateLocalNotes(updatedNotes)
    } catch (e) {
      console.error('Failed to delete note:', e)
    }
    setSaving(false)
  }, [notes, updateLocalNotes])

  const togglePin = useCallback(async (id: string) => {
    const note = notes.find(n => n.id === id)
    if (note) {
      await updateNote(id, { pinned: !note.pinned })
    }
  }, [notes, updateNote])

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      let result = await window.api.invoke('notes:getForMedia', mediaId)
      if (!result || !Array.isArray(result)) {
        const media = await window.api.invoke('media:getById', mediaId)
        if (media?.notes) {
          result = typeof media.notes === 'string' ? JSON.parse(media.notes) : media.notes
        }
      }
      if (result && Array.isArray(result)) {
        setNotes(result.map((n: any) => ({
          id: n.id || `note-${Date.now()}-${Math.random()}`,
          content: n.content || n.text || '',
          color: n.color || COLORS[0],
          pinned: n.isPinned || n.pinned || false,
          createdAt: n.createdAt || n.created_at || Date.now(),
          updatedAt: n.updatedAt || n.updated_at || Date.now()
        })))
      }
    } catch (e) {
      console.error('Failed to refresh notes:', e)
    }
    setLoading(false)
  }, [mediaId])

  return (
    <div className={`bg-zinc-900 rounded-xl border border-zinc-700 overflow-hidden ${className}`}>
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
        <div className="flex items-center gap-2">
          <StickyNote size={16} className="text-[var(--primary)]" />
          <span className="font-semibold text-sm">Notes</span>
          <span className="text-xs text-zinc-500">({notes.length})</span>
          {saving && <Loader2 size={12} className="animate-spin text-zinc-500" />}
        </div>
        <div className="flex items-center gap-1">
          <button onClick={refresh} disabled={loading} className="p-1.5 rounded hover:bg-zinc-800">
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
          </button>
          <button onClick={() => setShowAdd(true)} className="flex items-center gap-1 px-2 py-1 rounded bg-[var(--primary)] text-xs">
            <Plus size={12} />Add
          </button>
        </div>
      </div>

      {/* Add form */}
      {showAdd && (
        <div className="p-3 border-b border-zinc-800 bg-zinc-800/30">
          <textarea
            ref={textareaRef}
            value={newContent}
            onChange={e => setNewContent(e.target.value)}
            placeholder="Write a note..."
            className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded text-sm resize-none"
            rows={3}
            autoFocus
            onKeyDown={e => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                addNote()
              }
            }}
          />
          <div className="flex items-center justify-between mt-2">
            <div className="flex gap-1">
              {COLORS.map(c => (
                <button
                  key={c}
                  onClick={() => setNewColor(c)}
                  className={`w-5 h-5 rounded-full transition ${newColor === c ? 'ring-2 ring-white ring-offset-1 ring-offset-zinc-900' : 'hover:scale-110'}`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
            <div className="flex gap-2">
              <button onClick={() => setShowAdd(false)} className="px-3 py-1 bg-zinc-700 rounded text-sm hover:bg-zinc-600">
                Cancel
              </button>
              <button
                onClick={addNote}
                disabled={!newContent.trim()}
                className="px-3 py-1 bg-[var(--primary)] rounded text-sm disabled:opacity-50"
              >
                Save
              </button>
            </div>
          </div>
          <p className="text-[10px] text-zinc-500 mt-2">Tip: Ctrl+Enter to save</p>
        </div>
      )}

      {/* Notes list */}
      <div className="max-h-64 overflow-y-auto">
        {loading ? (
          <div className="py-8 text-center">
            <Loader2 size={24} className="mx-auto animate-spin text-zinc-500" />
            <p className="text-sm text-zinc-500 mt-2">Loading notes...</p>
          </div>
        ) : sorted.length === 0 ? (
          <div className="py-8 text-center text-zinc-500">
            <StickyNote size={24} className="mx-auto mb-2 opacity-50" />
            <p className="text-sm">No notes</p>
            <p className="text-xs mt-1">Add notes to remember details about this media</p>
          </div>
        ) : (
          sorted.map(note => (
            <div
              key={note.id}
              className="relative group border-b border-zinc-800/50 last:border-0"
              style={{ borderLeftWidth: 3, borderLeftColor: note.color }}
            >
              <div className="px-4 py-3">
                {editing === note.id ? (
                  <div>
                    <textarea
                      value={editContent}
                      onChange={e => setEditContent(e.target.value)}
                      className="w-full px-2 py-1 bg-zinc-800 rounded text-sm resize-none"
                      rows={3}
                      autoFocus
                      onKeyDown={e => {
                        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                          updateNote(note.id, { content: editContent })
                        }
                        if (e.key === 'Escape') {
                          setEditing(null)
                        }
                      }}
                    />
                    <div className="flex items-center justify-between mt-2">
                      <div className="flex gap-1">
                        {COLORS.map(c => (
                          <button
                            key={c}
                            onClick={() => updateNote(note.id, { color: c })}
                            className={`w-4 h-4 rounded-full ${note.color === c ? 'ring-1 ring-white' : ''}`}
                            style={{ backgroundColor: c }}
                          />
                        ))}
                      </div>
                      <div className="flex gap-1">
                        <button
                          onClick={() => updateNote(note.id, { content: editContent })}
                          className="p-1 text-green-400 hover:bg-green-500/20 rounded"
                        >
                          <Check size={14} />
                        </button>
                        <button
                          onClick={() => setEditing(null)}
                          className="p-1 text-zinc-500 hover:bg-zinc-700 rounded"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <>
                    <p className="text-sm whitespace-pre-wrap">{note.content}</p>
                    <div className="flex items-center gap-2 mt-2 text-[10px] text-zinc-500">
                      <Clock size={8} />
                      {formatDate(note.updatedAt)}
                    </div>
                  </>
                )}
              </div>
              <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition">
                <button
                  onClick={() => togglePin(note.id)}
                  className={`p-1 rounded ${note.pinned ? 'text-[var(--primary)] bg-[var(--primary)]/20' : 'hover:bg-zinc-700'}`}
                  title={note.pinned ? 'Unpin' : 'Pin to top'}
                >
                  {note.pinned ? <Pin size={12} /> : <PinOff size={12} />}
                </button>
                <button
                  onClick={() => { setEditing(note.id); setEditContent(note.content) }}
                  className="p-1 rounded hover:bg-zinc-700"
                  title="Edit"
                >
                  <Edit3 size={12} />
                </button>
                <button
                  onClick={() => deleteNote(note.id)}
                  className="p-1 rounded hover:bg-red-500/20 text-red-400"
                  title="Delete"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
export default QuickNote
