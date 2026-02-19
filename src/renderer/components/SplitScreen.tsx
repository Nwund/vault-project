// File: src/renderer/components/SplitScreen.tsx
// Multi-video split screen player

import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import { LayoutGrid, Plus, X, Play, Pause, Volume2, VolumeX, Maximize, Grid2X2, Grid3X3, Rows, Columns, Shuffle } from 'lucide-react'

interface VideoSlot { id: string; mediaId?: string; path?: string; thumbnail?: string; title?: string }
type Layout = '2x1' | '1x2' | '2x2' | '3x3' | '1+2' | '2+1'
interface SplitScreenProps { availableMedia: Array<{ id: string; path: string; thumbnail?: string; title: string }>; onMediaSelect?: (slotId: string, mediaId: string) => void; className?: string }

export function SplitScreen({ availableMedia, onMediaSelect, className = '' }: SplitScreenProps) {
  const [layout, setLayout] = useState<Layout>('2x2')
  const [slots, setSlots] = useState<VideoSlot[]>([])
  const [syncPlayback, setSyncPlayback] = useState(true)
  const [isPlaying, setIsPlaying] = useState(false)
  const [masterVolume, setMasterVolume] = useState(0.5)
  const [activeSlot, setActiveSlot] = useState<string | null>(null)
  const videoRefs = useRef<Map<string, HTMLVideoElement>>(new Map())

  const layoutConfigs: Record<Layout, { rows: number; cols: number; slots: number }> = {
    '2x1': { rows: 1, cols: 2, slots: 2 }, '1x2': { rows: 2, cols: 1, slots: 2 },
    '2x2': { rows: 2, cols: 2, slots: 4 }, '3x3': { rows: 3, cols: 3, slots: 9 },
    '1+2': { rows: 2, cols: 2, slots: 3 }, '2+1': { rows: 2, cols: 2, slots: 3 }
  }

  useEffect(() => {
    const config = layoutConfigs[layout]
    setSlots(Array.from({ length: config.slots }, (_, i) => ({ id: `slot-${i}` })))
  }, [layout])

  const assignMedia = useCallback((slotId: string, media: typeof availableMedia[0]) => {
    setSlots(prev => prev.map(s => s.id === slotId ? { ...s, mediaId: media.id, path: media.path, thumbnail: media.thumbnail, title: media.title } : s))
    onMediaSelect?.(slotId, media.id)
  }, [onMediaSelect])

  const clearSlot = useCallback((slotId: string) => {
    setSlots(prev => prev.map(s => s.id === slotId ? { id: s.id } : s))
  }, [])

  const shuffleMedia = useCallback(() => {
    const shuffled = [...availableMedia].sort(() => Math.random() - 0.5)
    setSlots(prev => prev.map((s, i) => shuffled[i] ? { ...s, mediaId: shuffled[i].id, path: shuffled[i].path, thumbnail: shuffled[i].thumbnail, title: shuffled[i].title } : { id: s.id }))
  }, [availableMedia])

  const togglePlayAll = useCallback(() => {
    videoRefs.current.forEach(v => isPlaying ? v.pause() : v.play())
    setIsPlaying(!isPlaying)
  }, [isPlaying])

  const setRef = useCallback((id: string, el: HTMLVideoElement | null) => {
    if (el) videoRefs.current.set(id, el)
    else videoRefs.current.delete(id)
  }, [])

  useEffect(() => {
    videoRefs.current.forEach(v => v.volume = masterVolume)
  }, [masterVolume])

  const layouts: Array<{ id: Layout; icon: React.ElementType; label: string }> = [
    { id: '2x1', icon: Columns, label: '2 Side' }, { id: '1x2', icon: Rows, label: '2 Stack' },
    { id: '2x2', icon: Grid2X2, label: '4 Grid' }, { id: '3x3', icon: Grid3X3, label: '9 Grid' }
  ]

  return (
    <div className={`bg-zinc-900 rounded-xl border border-zinc-700 overflow-hidden ${className}`}>
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
        <div className="flex items-center gap-2"><LayoutGrid size={16} className="text-[var(--primary)]" /><span className="font-semibold text-sm">Split Screen</span></div>
        <div className="flex gap-2">
          {layouts.map(l => <button key={l.id} onClick={() => setLayout(l.id)} className={`p-1.5 rounded ${layout === l.id ? 'bg-[var(--primary)]' : 'hover:bg-zinc-800'}`} title={l.label}><l.icon size={14} /></button>)}
          <button onClick={shuffleMedia} className="p-1.5 rounded hover:bg-zinc-800" title="Shuffle"><Shuffle size={14} /></button>
        </div>
      </div>
      {/* Video grid */}
      <div className={`grid gap-1 p-2 bg-black aspect-video`} style={{ gridTemplateColumns: `repeat(${layoutConfigs[layout].cols}, 1fr)`, gridTemplateRows: `repeat(${layoutConfigs[layout].rows}, 1fr)` }}>
        {slots.map((slot, i) => (
          <div key={slot.id} className={`relative bg-zinc-900 rounded overflow-hidden group ${activeSlot === slot.id ? 'ring-2 ring-[var(--primary)]' : ''}`} onClick={() => setActiveSlot(slot.id)}>
            {slot.path ? <>
              <video ref={el => setRef(slot.id, el)} src={`file://${slot.path}`} className="w-full h-full object-contain" loop muted={i > 0 || !syncPlayback} />
              <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition flex items-center justify-center gap-2">
                <button onClick={(e) => { e.stopPropagation(); const v = videoRefs.current.get(slot.id); v?.paused ? v.play() : v?.pause() }} className="p-2 rounded-full bg-black/50"><Play size={16} /></button>
                <button onClick={(e) => { e.stopPropagation(); clearSlot(slot.id) }} className="p-2 rounded-full bg-red-500/50"><X size={16} /></button>
              </div>
              <div className="absolute bottom-0 left-0 right-0 px-2 py-1 bg-black/60 text-xs truncate opacity-0 group-hover:opacity-100">{slot.title}</div>
            </> : <div className="w-full h-full flex items-center justify-center"><button onClick={() => { const rand = availableMedia[Math.floor(Math.random() * availableMedia.length)]; if (rand) assignMedia(slot.id, rand) }} className="p-3 rounded-full bg-zinc-800 hover:bg-zinc-700"><Plus size={20} /></button></div>}
          </div>
        ))}
      </div>
      {/* Controls */}
      <div className="flex items-center gap-4 px-4 py-3 border-t border-zinc-800">
        <button onClick={togglePlayAll} className="p-2 rounded-full bg-[var(--primary)]">{isPlaying ? <Pause size={16} /> : <Play size={16} />}</button>
        <div className="flex items-center gap-2 flex-1"><Volume2 size={14} /><input type="range" min={0} max={1} step={0.1} value={masterVolume} onChange={e => setMasterVolume(parseFloat(e.target.value))} className="flex-1 accent-[var(--primary)]" /></div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={syncPlayback} onChange={e => setSyncPlayback(e.target.checked)} className="accent-[var(--primary)]" />Sync</label>
      </div>
    </div>
  )
}
export default SplitScreen
