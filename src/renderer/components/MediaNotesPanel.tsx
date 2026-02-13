// File: src/renderer/components/MediaNotesPanel.tsx
// Personal notes panel for media items

import React, { useState, useEffect, useCallback } from 'react'
import { StickyNote, Plus, Trash2, Edit2, Check, X, Pin, PinOff, Search } from 'lucide-react'

interface MediaNote {
  id: string
  mediaId: string
  content: string
  isPinned: boolean
  color?: string
  createdAt: number
  updatedAt: number
}

interface MediaNotesPanelProps {
  mediaId: string
  className?: string
}

const NOTE_COLORS = [
  { name: 'Default', value: undefined },
  { name: 'Yellow', value: '#fef08a' },
  { name: 'Green', value: '#bbf7d0' },
  { name: 'Blue', value: '#bfdbfe' },
  { name: 'Pink', value: '#fbcfe8' },
  { name: 'Purple', value: '#ddd6fe' },
  { name: 'Orange', value: '#fed7aa' },
]

export function MediaNotesPanel({ mediaId, className = '' }: MediaNotesPanelProps) {
  const [notes, setNotes] = useState<MediaNote[]>([])
  const [loading, setLoading] = useState(true)
  const [showAddForm, setShowAddForm] = useState(false)
  const [newContent, setNewContent] = useState('')
  const [newColor, setNewColor] = useState<string | undefined>(undefined)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editContent, setEditContent] = useState('')

  const loadNotes = useCallback(async () => {
    try {
      const items = await window.api.invoke('notes:getForMedia', mediaId)
      setNotes(items)
    } catch (e) {
      console.error('Failed to load notes:', e)
    } finally {
      setLoading(false)
    }
  }, [mediaId])

  useEffect(() => {
    loadNotes()
  }, [loadNotes])

  const handleAdd = async () => {
    if (!newContent.trim()) return
    try {
      await window.api.invoke('notes:add', mediaId, newContent, {
        color: newColor
      })
      setNewContent('')
      setNewColor(undefined)
      setShowAddForm(false)
      loadNotes()
    } catch (e) {
      console.error('Failed to add note:', e)
    }
  }

  const handleDelete = async (noteId: string) => {
    try {
      await window.api.invoke('notes:delete', noteId)
      loadNotes()
    } catch (e) {
      console.error('Failed to delete note:', e)
    }
  }

  const handleTogglePin = async (noteId: string) => {
    try {
      await window.api.invoke('notes:togglePin', noteId)
      loadNotes()
    } catch (e) {
      console.error('Failed to toggle pin:', e)
    }
  }

  const handleEdit = (note: MediaNote) => {
    setEditingId(note.id)
    setEditContent(note.content)
  }

  const handleSaveEdit = async () => {
    if (!editingId || !editContent.trim()) return
    try {
      await window.api.invoke('notes:update', editingId, {
        content: editContent
      })
      setEditingId(null)
      loadNotes()
    } catch (e) {
      console.error('Failed to update note:', e)
    }
  }

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp)
    const now = new Date()
    const diff = now.getTime() - date.getTime()
    const days = Math.floor(diff / (1000 * 60 * 60 * 24))

    if (days === 0) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    } else if (days === 1) {
      return 'Yesterday'
    } else if (days < 7) {
      return `${days} days ago`
    } else {
      return date.toLocaleDateString()
    }
  }

  if (loading) {
    return (
      <div className={`bg-zinc-900 rounded-lg p-4 ${className}`}>
        <div className="animate-pulse">
          <div className="h-4 bg-zinc-700 rounded w-24 mb-4" />
          <div className="h-20 bg-zinc-800 rounded" />
        </div>
      </div>
    )
  }

  return (
    <div className={`bg-zinc-900 rounded-lg border border-zinc-700 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-zinc-700">
        <div className="flex items-center gap-2">
          <StickyNote className="w-4 h-4 text-yellow-400" />
          <span className="text-sm font-medium">Notes</span>
          {notes.length > 0 && (
            <span className="text-xs text-zinc-500">({notes.length})</span>
          )}
        </div>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className={`p-1.5 rounded ${showAddForm ? 'bg-zinc-700' : 'hover:bg-zinc-700'}`}
          title={showAddForm ? 'Close form' : 'Add note'}
        >
          {showAddForm ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
        </button>
      </div>

      {/* Add Form */}
      {showAddForm && (
        <div className="p-3 border-b border-zinc-700 space-y-2">
          <textarea
            value={newContent}
            onChange={(e) => setNewContent(e.target.value)}
            placeholder="Write a note..."
            className="w-full px-3 py-2 bg-zinc-800 rounded-lg text-sm resize-none"
            rows={3}
            autoFocus
          />
          <div className="flex items-center gap-2">
            <span className="text-xs text-zinc-500">Color:</span>
            {NOTE_COLORS.map((c) => (
              <button
                key={c.name}
                onClick={() => setNewColor(c.value)}
                className={`w-5 h-5 rounded border-2 ${
                  newColor === c.value ? 'border-white' : 'border-transparent'
                }`}
                style={{ backgroundColor: c.value || '#3f3f46' }}
                title={c.name}
              />
            ))}
            <div className="flex-1" />
            <button
              onClick={handleAdd}
              disabled={!newContent.trim()}
              className="px-3 py-1 bg-yellow-600 hover:bg-yellow-500 disabled:opacity-50 rounded text-sm"
            >
              Add Note
            </button>
          </div>
        </div>
      )}

      {/* Notes List */}
      <div className="max-h-64 overflow-y-auto">
        {notes.length === 0 ? (
          <div className="p-6 text-center text-zinc-500">
            <StickyNote className="w-10 h-10 mx-auto mb-2 opacity-30" />
            <p className="text-sm">No notes yet</p>
            <p className="text-xs mt-1">Add personal notes about this media</p>
          </div>
        ) : (
          <div className="p-2 space-y-2">
            {notes.map((note) => (
              <div
                key={note.id}
                className="group relative rounded-lg p-3 transition-colors"
                style={{
                  backgroundColor: note.color ? `${note.color}20` : '#27272a',
                  borderLeft: note.color ? `3px solid ${note.color}` : '3px solid #3f3f46'
                }}
              >
                {/* Pin indicator */}
                {note.isPinned && (
                  <Pin className="absolute top-2 right-2 w-3 h-3 text-yellow-400" />
                )}

                {editingId === note.id ? (
                  <div className="space-y-2">
                    <textarea
                      value={editContent}
                      onChange={(e) => setEditContent(e.target.value)}
                      className="w-full px-2 py-1 bg-zinc-800 rounded text-sm resize-none"
                      rows={3}
                      autoFocus
                    />
                    <div className="flex gap-1">
                      <button
                        onClick={handleSaveEdit}
                        className="p-1 bg-green-600 hover:bg-green-500 rounded"
                        title="Save"
                      >
                        <Check className="w-3 h-3" />
                      </button>
                      <button
                        onClick={() => setEditingId(null)}
                        className="p-1 bg-zinc-600 hover:bg-zinc-500 rounded"
                        title="Cancel"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <p className="text-sm whitespace-pre-wrap pr-6">{note.content}</p>
                    <div className="flex items-center justify-between mt-2">
                      <span className="text-xs text-zinc-500">
                        {formatDate(note.updatedAt)}
                      </span>
                      <div className="hidden group-hover:flex items-center gap-1">
                        <button
                          onClick={() => handleTogglePin(note.id)}
                          className="p-1 hover:bg-zinc-600 rounded"
                          title={note.isPinned ? 'Unpin' : 'Pin'}
                        >
                          {note.isPinned ? (
                            <PinOff className="w-3 h-3 text-zinc-400" />
                          ) : (
                            <Pin className="w-3 h-3 text-zinc-400" />
                          )}
                        </button>
                        <button
                          onClick={() => handleEdit(note)}
                          className="p-1 hover:bg-zinc-600 rounded"
                          title="Edit note"
                        >
                          <Edit2 className="w-3 h-3 text-zinc-400" />
                        </button>
                        <button
                          onClick={() => handleDelete(note.id)}
                          className="p-1 hover:bg-zinc-600 rounded"
                          title="Delete note"
                        >
                          <Trash2 className="w-3 h-3 text-red-400" />
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default MediaNotesPanel
