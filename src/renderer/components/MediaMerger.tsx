// File: src/renderer/components/MediaMerger.tsx
// Merge multiple videos into one

import React, { useState, useCallback, useMemo } from 'react'
import { Merge, Plus, Trash2, GripVertical, Play, ChevronUp, ChevronDown, Film, Clock, Download, Loader2, Check, Settings } from 'lucide-react'
import { formatDuration } from '../utils/formatters'

interface MergeItem { id: string; path: string; title: string; thumbnail?: string; duration: number; trimStart?: number; trimEnd?: number }
interface MediaMergerProps { onMerge: (items: MergeItem[], settings: MergeSettings) => Promise<void>; onAddMedia: () => Promise<MergeItem | null>; className?: string }
interface MergeSettings { outputFormat: 'mp4' | 'webm' | 'mkv'; quality: 'low' | 'medium' | 'high'; addTransitions: boolean; transitionDuration: number }

export function MediaMerger({ onMerge, onAddMedia, className = '' }: MediaMergerProps) {
  const [items, setItems] = useState<MergeItem[]>([])
  const [settings, setSettings] = useState<MergeSettings>({ outputFormat: 'mp4', quality: 'high', addTransitions: false, transitionDuration: 0.5 })
  const [merging, setMerging] = useState(false)
  const [progress, setProgress] = useState(0)
  const [showSettings, setShowSettings] = useState(false)
  const [dragIndex, setDragIndex] = useState<number | null>(null)

  const totalDuration = useMemo(() => items.reduce((acc, i) => {
    const start = i.trimStart || 0, end = i.trimEnd || i.duration
    return acc + (end - start)
  }, 0), [items])

  const addItem = useCallback(async () => {
    const item = await onAddMedia()
    if (item) setItems(prev => [...prev, item])
  }, [onAddMedia])

  const removeItem = useCallback((id: string) => {
    setItems(prev => prev.filter(i => i.id !== id))
  }, [])

  const moveItem = useCallback((from: number, to: number) => {
    setItems(prev => {
      const arr = [...prev]
      const [item] = arr.splice(from, 1)
      arr.splice(to, 0, item)
      return arr
    })
  }, [])

  const updateTrim = useCallback((id: string, trimStart?: number, trimEnd?: number) => {
    setItems(prev => prev.map(i => i.id === id ? { ...i, trimStart, trimEnd } : i))
  }, [])

  const handleMerge = useCallback(async () => {
    if (items.length < 2) return
    setMerging(true); setProgress(0)
    const interval = setInterval(() => setProgress(p => Math.min(p + 5, 95)), 500)
    try {
      await onMerge(items, settings)
      setProgress(100)
    } catch (e) { console.error('Merge failed:', e) }
    finally { clearInterval(interval); setMerging(false) }
  }, [items, settings, onMerge])

  const handleDragStart = (index: number) => setDragIndex(index)
  const handleDragOver = (index: number) => { if (dragIndex !== null && dragIndex !== index) { moveItem(dragIndex, index); setDragIndex(index) } }
  const handleDragEnd = () => setDragIndex(null)

  return (
    <div className={`bg-zinc-900 rounded-xl border border-zinc-700 overflow-hidden ${className}`}>
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
        <div className="flex items-center gap-2"><Merge size={16} className="text-[var(--primary)]" /><span className="font-semibold text-sm">Merge Videos</span><span className="text-xs text-zinc-500">({items.length})</span></div>
        <div className="flex gap-1"><button onClick={() => setShowSettings(!showSettings)} className={`p-1.5 rounded ${showSettings ? 'bg-[var(--primary)]' : 'hover:bg-zinc-800'}`}><Settings size={14} /></button><button onClick={addItem} className="flex items-center gap-1 px-2 py-1 rounded bg-[var(--primary)] text-xs"><Plus size={12} />Add</button></div>
      </div>
      {/* Settings */}
      {showSettings && <div className="px-4 py-3 border-b border-zinc-800 grid grid-cols-3 gap-3">
        <div><label className="text-xs text-zinc-500">Format</label><select value={settings.outputFormat} onChange={e => setSettings(s => ({ ...s, outputFormat: e.target.value as any }))} className="w-full mt-1 px-2 py-1 bg-zinc-800 rounded text-sm">{['mp4', 'webm', 'mkv'].map(f => <option key={f} value={f}>{f.toUpperCase()}</option>)}</select></div>
        <div><label className="text-xs text-zinc-500">Quality</label><select value={settings.quality} onChange={e => setSettings(s => ({ ...s, quality: e.target.value as any }))} className="w-full mt-1 px-2 py-1 bg-zinc-800 rounded text-sm">{['low', 'medium', 'high'].map(q => <option key={q} value={q}>{q.charAt(0).toUpperCase() + q.slice(1)}</option>)}</select></div>
        <div><label className="flex items-center gap-2 text-xs text-zinc-500 mt-4"><input type="checkbox" checked={settings.addTransitions} onChange={e => setSettings(s => ({ ...s, addTransitions: e.target.checked }))} className="accent-[var(--primary)]" />Transitions</label></div>
      </div>}
      {/* Items list */}
      <div className="max-h-64 overflow-y-auto">
        {items.length === 0 ? <div className="py-12 text-center text-zinc-500"><Film size={32} className="mx-auto mb-2 opacity-50" /><p className="text-sm">Add videos to merge</p></div>
        : items.map((item, index) => (
          <div key={item.id} draggable onDragStart={() => handleDragStart(index)} onDragOver={() => handleDragOver(index)} onDragEnd={handleDragEnd}
            className={`flex items-center gap-3 px-4 py-3 border-b border-zinc-800/50 ${dragIndex === index ? 'bg-[var(--primary)]/10' : 'hover:bg-zinc-800/30'}`}>
            <GripVertical size={14} className="text-zinc-600 cursor-grab" />
            <span className="w-6 h-6 rounded-full bg-zinc-800 flex items-center justify-center text-xs">{index + 1}</span>
            <div className="w-16 h-10 rounded bg-zinc-800 overflow-hidden">{item.thumbnail && <img src={item.thumbnail} className="w-full h-full object-cover" />}</div>
            <div className="flex-1 min-w-0">
              <div className="text-sm truncate">{item.title}</div>
              <div className="text-xs text-zinc-500">{formatDuration((item.trimEnd || item.duration) - (item.trimStart || 0))}</div>
            </div>
            <div className="flex gap-1">
              <button onClick={() => moveItem(index, Math.max(0, index - 1))} disabled={index === 0} className="p-1 rounded hover:bg-zinc-700 disabled:opacity-30"><ChevronUp size={12} /></button>
              <button onClick={() => moveItem(index, Math.min(items.length - 1, index + 1))} disabled={index === items.length - 1} className="p-1 rounded hover:bg-zinc-700 disabled:opacity-30"><ChevronDown size={12} /></button>
              <button onClick={() => removeItem(item.id)} className="p-1 rounded hover:bg-red-500/20 text-red-400"><Trash2 size={12} /></button>
            </div>
          </div>
        ))}
      </div>
      {/* Footer */}
      {items.length > 0 && <div className="px-4 py-3 border-t border-zinc-800">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs text-zinc-500">Total: {formatDuration(totalDuration)}</span>
          <span className="text-xs text-zinc-500">{items.length} clips</span>
        </div>
        {merging && <div className="mb-3"><div className="h-2 bg-zinc-800 rounded-full overflow-hidden"><div className="h-full bg-[var(--primary)] transition-all" style={{ width: `${progress}%` }} /></div></div>}
        <button onClick={handleMerge} disabled={items.length < 2 || merging} className="w-full flex items-center justify-center gap-2 py-2.5 bg-[var(--primary)] rounded text-sm disabled:opacity-50">
          {merging ? <Loader2 size={16} className="animate-spin" /> : progress === 100 ? <Check size={16} /> : <Merge size={16} />}
          {merging ? `Merging... ${progress}%` : progress === 100 ? 'Done!' : 'Merge Videos'}
        </button>
      </div>}
    </div>
  )
}
export default MediaMerger
