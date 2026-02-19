// File: src/renderer/components/QuickNote.tsx
// Quick notes attachment for media items

import React, { useState, useCallback, useRef } from 'react'
import { StickyNote, Plus, Trash2, Edit3, Check, X, Clock, Pin, PinOff, Palette, ChevronDown } from 'lucide-react'
import { formatDate } from '../utils/formatters'

interface Note { id: string; content: string; color: string; pinned: boolean; createdAt: number; updatedAt: number }
interface QuickNoteProps { mediaId: string; notes: Note[]; onChange: (notes: Note[]) => void; className?: string }

const COLORS = ['#fef08a', '#bef264', '#67e8f9', '#f9a8d4', '#fdba74', '#c4b5fd']

export function QuickNote({ mediaId, notes, onChange, className = '' }: QuickNoteProps) {
  const [editing, setEditing] = useState<string | null>(null)
  const [editContent, setEditContent] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [newContent, setNewContent] = useState('')
  const [newColor, setNewColor] = useState(COLORS[0])
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const sorted = [...notes].sort((a, b) => { if (a.pinned !== b.pinned) return a.pinned ? -1 : 1; return b.updatedAt - a.updatedAt })

  const addNote = useCallback(() => {
    if (!newContent.trim()) return
    const note: Note = { id: `note-${Date.now()}`, content: newContent.trim(), color: newColor, pinned: false, createdAt: Date.now(), updatedAt: Date.now() }
    onChange([...notes, note])
    setNewContent(''); setShowAdd(false)
  }, [newContent, newColor, notes, onChange])

  const updateNote = useCallback((id: string, updates: Partial<Note>) => {
    onChange(notes.map(n => n.id === id ? { ...n, ...updates, updatedAt: Date.now() } : n))
    setEditing(null)
  }, [notes, onChange])

  const deleteNote = useCallback((id: string) => {
    onChange(notes.filter(n => n.id !== id))
  }, [notes, onChange])

  const togglePin = useCallback((id: string) => {
    onChange(notes.map(n => n.id === id ? { ...n, pinned: !n.pinned, updatedAt: Date.now() } : n))
  }, [notes, onChange])

  return (
    <div className={`bg-zinc-900 rounded-xl border border-zinc-700 overflow-hidden ${className}`}>
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
        <div className="flex items-center gap-2"><StickyNote size={16} className="text-[var(--primary)]" /><span className="font-semibold text-sm">Notes</span><span className="text-xs text-zinc-500">({notes.length})</span></div>
        <button onClick={() => setShowAdd(true)} className="flex items-center gap-1 px-2 py-1 rounded bg-[var(--primary)] text-xs"><Plus size={12} />Add</button>
      </div>
      {/* Add form */}
      {showAdd && <div className="p-3 border-b border-zinc-800 bg-zinc-800/30">
        <textarea ref={textareaRef} value={newContent} onChange={e => setNewContent(e.target.value)} placeholder="Write a note..." className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded text-sm resize-none" rows={3} autoFocus />
        <div className="flex items-center justify-between mt-2">
          <div className="flex gap-1">{COLORS.map(c => <button key={c} onClick={() => setNewColor(c)} className={`w-5 h-5 rounded-full ${newColor === c ? 'ring-2 ring-white' : ''}`} style={{ backgroundColor: c }} />)}</div>
          <div className="flex gap-2"><button onClick={() => setShowAdd(false)} className="px-3 py-1 bg-zinc-700 rounded text-sm">Cancel</button><button onClick={addNote} disabled={!newContent.trim()} className="px-3 py-1 bg-[var(--primary)] rounded text-sm disabled:opacity-50">Save</button></div>
        </div>
      </div>}
      {/* Notes list */}
      <div className="max-h-64 overflow-y-auto">
        {sorted.length === 0 ? <div className="py-8 text-center text-zinc-500"><StickyNote size={24} className="mx-auto mb-2 opacity-50" /><p className="text-sm">No notes</p></div>
        : sorted.map(note => (
          <div key={note.id} className="relative group border-b border-zinc-800/50 last:border-0" style={{ borderLeftWidth: 3, borderLeftColor: note.color }}>
            <div className="px-4 py-3">
              {editing === note.id ? <div>
                <textarea value={editContent} onChange={e => setEditContent(e.target.value)} className="w-full px-2 py-1 bg-zinc-800 rounded text-sm resize-none" rows={3} autoFocus />
                <div className="flex gap-1 mt-2"><button onClick={() => updateNote(note.id, { content: editContent })} className="p-1 text-green-400"><Check size={14} /></button><button onClick={() => setEditing(null)} className="p-1 text-zinc-500"><X size={14} /></button></div>
              </div> : <>
                <p className="text-sm whitespace-pre-wrap">{note.content}</p>
                <div className="flex items-center gap-2 mt-2 text-[10px] text-zinc-500"><Clock size={8} />{formatDate(note.updatedAt)}</div>
              </>}
            </div>
            <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100">
              <button onClick={() => togglePin(note.id)} className={`p-1 rounded ${note.pinned ? 'text-[var(--primary)]' : 'hover:bg-zinc-700'}`}>{note.pinned ? <Pin size={12} /> : <PinOff size={12} />}</button>
              <button onClick={() => { setEditing(note.id); setEditContent(note.content) }} className="p-1 rounded hover:bg-zinc-700"><Edit3 size={12} /></button>
              <button onClick={() => deleteNote(note.id)} className="p-1 rounded hover:bg-red-500/20 text-red-400"><Trash2 size={12} /></button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
export default QuickNote
