// File: src/renderer/components/SubtitleEditor.tsx
// Custom subtitle/caption editor with timing and styling

import React, { useState, useCallback, useMemo, useRef } from 'react'
import { Captions, Plus, Trash2, Edit3, Clock, Type, Palette, AlignLeft, AlignCenter, AlignRight, Bold, Italic, Upload, Download, Play, ChevronUp, ChevronDown } from 'lucide-react'
import { formatDuration } from '../utils/formatters'

interface Subtitle { id: string; start: number; end: number; text: string; style?: SubtitleStyle }
interface SubtitleStyle { fontSize: number; color: string; bgColor: string; align: 'left' | 'center' | 'right'; bold: boolean; italic: boolean; position: 'top' | 'center' | 'bottom' }
const DEFAULT_STYLE: SubtitleStyle = { fontSize: 24, color: '#ffffff', bgColor: '#00000080', align: 'center', bold: false, italic: false, position: 'bottom' }

interface SubtitleEditorProps { currentTime: number; duration: number; subtitles: Subtitle[]; onChange: (subs: Subtitle[]) => void; onSeek: (time: number) => void; className?: string }

export function SubtitleEditor({ currentTime, duration, subtitles, onChange, onSeek, className = '' }: SubtitleEditorProps) {
  const [editing, setEditing] = useState<string | null>(null)
  const [editText, setEditText] = useState('')
  const [editStyle, setEditStyle] = useState<SubtitleStyle>(DEFAULT_STYLE)
  const [showStylePanel, setShowStylePanel] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const sorted = useMemo(() => [...subtitles].sort((a, b) => a.start - b.start), [subtitles])
  const current = useMemo(() => sorted.find(s => s.start <= currentTime && s.end >= currentTime), [sorted, currentTime])

  const addSubtitle = useCallback(() => {
    const newSub: Subtitle = { id: `sub-${Date.now()}`, start: currentTime, end: Math.min(currentTime + 3, duration), text: 'New subtitle', style: DEFAULT_STYLE }
    onChange([...subtitles, newSub])
    setEditing(newSub.id); setEditText(newSub.text); setEditStyle(newSub.style!)
  }, [currentTime, duration, subtitles, onChange])

  const updateSubtitle = useCallback((id: string, updates: Partial<Subtitle>) => {
    onChange(subtitles.map(s => s.id === id ? { ...s, ...updates } : s))
  }, [subtitles, onChange])

  const deleteSubtitle = useCallback((id: string) => {
    onChange(subtitles.filter(s => s.id !== id))
    if (editing === id) setEditing(null)
  }, [subtitles, onChange, editing])

  const saveEdit = useCallback(() => {
    if (!editing) return
    updateSubtitle(editing, { text: editText, style: editStyle })
    setEditing(null)
  }, [editing, editText, editStyle, updateSubtitle])

  const exportSRT = useCallback(() => {
    const srt = sorted.map((s, i) => {
      const fmt = (t: number) => { const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), sec = Math.floor(t % 60), ms = Math.floor((t % 1) * 1000); return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')},${ms.toString().padStart(3, '0')}` }
      return `${i + 1}\n${fmt(s.start)} --> ${fmt(s.end)}\n${s.text}\n`
    }).join('\n')
    const blob = new Blob([srt], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = 'subtitles.srt'; a.click()
    URL.revokeObjectURL(url)
  }, [sorted])

  const importSRT = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const text = ev.target?.result as string
      const blocks = text.trim().split(/\n\n+/)
      const parsed: Subtitle[] = blocks.map((block, i) => {
        const lines = block.split('\n')
        const times = lines[1]?.match(/(\d{2}):(\d{2}):(\d{2}),(\d{3}) --> (\d{2}):(\d{2}):(\d{2}),(\d{3})/)
        if (!times) return null
        const start = parseInt(times[1]) * 3600 + parseInt(times[2]) * 60 + parseInt(times[3]) + parseInt(times[4]) / 1000
        const end = parseInt(times[5]) * 3600 + parseInt(times[6]) * 60 + parseInt(times[7]) + parseInt(times[8]) / 1000
        return { id: `sub-${i}`, start, end, text: lines.slice(2).join('\n'), style: DEFAULT_STYLE }
      }).filter(Boolean) as Subtitle[]
      onChange(parsed)
    }
    reader.readAsText(file)
  }, [onChange])

  return (
    <div className={`bg-zinc-900 rounded-xl border border-zinc-700 overflow-hidden ${className}`}>
      <input ref={fileRef} type="file" accept=".srt,.vtt" className="hidden" onChange={importSRT} />
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
        <div className="flex items-center gap-2"><Captions size={16} className="text-[var(--primary)]" /><span className="font-semibold text-sm">Subtitles</span><span className="text-xs text-zinc-500">({subtitles.length})</span></div>
        <div className="flex gap-1">
          <button onClick={() => fileRef.current?.click()} className="p-1.5 rounded hover:bg-zinc-800" title="Import SRT"><Upload size={14} /></button>
          <button onClick={exportSRT} className="p-1.5 rounded hover:bg-zinc-800" title="Export SRT"><Download size={14} /></button>
          <button onClick={addSubtitle} className="flex items-center gap-1 px-2 py-1 rounded bg-[var(--primary)] text-xs"><Plus size={12} />Add</button>
        </div>
      </div>
      {/* Current preview */}
      {current && <div className="px-4 py-3 border-b border-zinc-800 bg-zinc-800/30"><div className="text-center" style={{ color: current.style?.color, fontSize: `${(current.style?.fontSize || 24) * 0.6}px`, fontWeight: current.style?.bold ? 'bold' : 'normal', fontStyle: current.style?.italic ? 'italic' : 'normal' }}>{current.text}</div></div>}
      {/* Subtitle list */}
      <div className="max-h-64 overflow-y-auto">
        {sorted.length === 0 ? <div className="py-8 text-center text-zinc-500 text-sm">No subtitles</div> : sorted.map(s => (
          <div key={s.id} className={`group flex items-start gap-2 px-4 py-2 border-b border-zinc-800/30 ${s.id === current?.id ? 'bg-[var(--primary)]/10' : 'hover:bg-zinc-800/50'}`}>
            <button onClick={() => onSeek(s.start)} className="text-xs text-zinc-500 font-mono mt-1 w-16">{formatDuration(s.start)}</button>
            {editing === s.id ? <div className="flex-1 space-y-2">
              <textarea value={editText} onChange={e => setEditText(e.target.value)} className="w-full px-2 py-1 bg-zinc-800 rounded text-sm resize-none" rows={2} autoFocus />
              <div className="flex items-center gap-2">
                <button onClick={() => setEditStyle({ ...editStyle, bold: !editStyle.bold })} className={`p-1 rounded ${editStyle.bold ? 'bg-[var(--primary)]' : 'bg-zinc-800'}`}><Bold size={12} /></button>
                <button onClick={() => setEditStyle({ ...editStyle, italic: !editStyle.italic })} className={`p-1 rounded ${editStyle.italic ? 'bg-[var(--primary)]' : 'bg-zinc-800'}`}><Italic size={12} /></button>
                <input type="color" value={editStyle.color} onChange={e => setEditStyle({ ...editStyle, color: e.target.value })} className="w-6 h-6 rounded cursor-pointer" />
                <div className="flex-1" />
                <button onClick={() => setEditing(null)} className="px-2 py-1 bg-zinc-700 rounded text-xs">Cancel</button>
                <button onClick={saveEdit} className="px-2 py-1 bg-[var(--primary)] rounded text-xs">Save</button>
              </div>
            </div> : <div className="flex-1"><div className="text-sm">{s.text}</div><div className="text-[10px] text-zinc-600 mt-1">{formatDuration(s.end - s.start)}s</div></div>}
            <div className="flex gap-1 opacity-0 group-hover:opacity-100">
              <button onClick={() => { setEditing(s.id); setEditText(s.text); setEditStyle(s.style || DEFAULT_STYLE) }} className="p-1 hover:bg-zinc-700 rounded"><Edit3 size={12} /></button>
              <button onClick={() => deleteSubtitle(s.id)} className="p-1 hover:bg-red-500/20 text-red-400 rounded"><Trash2 size={12} /></button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
export default SubtitleEditor
