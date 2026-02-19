// File: src/renderer/components/WatermarkAdder.tsx
// Add watermarks to images/videos

import React, { useState, useCallback, useRef } from 'react'
import { Stamp, Type, Image as ImageIcon, Move, RotateCcw, Save, Upload, Trash2, Eye, EyeOff } from 'lucide-react'

interface Watermark { type: 'text' | 'image'; content: string; position: { x: number; y: number }; size: number; opacity: number; rotation: number; color?: string; font?: string }
interface WatermarkAdderProps { mediaSrc: string; mediaType: 'video' | 'image'; onApply: (watermark: Watermark) => void; className?: string }

const POSITIONS = [
  { id: 'tl', label: 'Top Left', x: 10, y: 10 }, { id: 'tc', label: 'Top Center', x: 50, y: 10 }, { id: 'tr', label: 'Top Right', x: 90, y: 10 },
  { id: 'ml', label: 'Middle Left', x: 10, y: 50 }, { id: 'mc', label: 'Center', x: 50, y: 50 }, { id: 'mr', label: 'Middle Right', x: 90, y: 50 },
  { id: 'bl', label: 'Bottom Left', x: 10, y: 90 }, { id: 'bc', label: 'Bottom Center', x: 50, y: 90 }, { id: 'br', label: 'Bottom Right', x: 90, y: 90 }
]

export function WatermarkAdder({ mediaSrc, mediaType, onApply, className = '' }: WatermarkAdderProps) {
  const [watermark, setWatermark] = useState<Watermark>({ type: 'text', content: 'Watermark', position: { x: 90, y: 90 }, size: 24, opacity: 0.5, rotation: 0, color: '#ffffff', font: 'Arial' })
  const [showPreview, setShowPreview] = useState(true)
  const [dragging, setDragging] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const previewRef = useRef<HTMLDivElement>(null)

  const handleImageUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => { setWatermark(w => ({ ...w, type: 'image', content: ev.target?.result as string })) }
    reader.readAsDataURL(file)
  }, [])

  const handleDrag = useCallback((e: React.MouseEvent) => {
    if (!dragging || !previewRef.current) return
    const rect = previewRef.current.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / rect.width) * 100
    const y = ((e.clientY - rect.top) / rect.height) * 100
    setWatermark(w => ({ ...w, position: { x: Math.max(0, Math.min(100, x)), y: Math.max(0, Math.min(100, y)) } }))
  }, [dragging])

  const setPosition = useCallback((pos: typeof POSITIONS[0]) => {
    setWatermark(w => ({ ...w, position: { x: pos.x, y: pos.y } }))
  }, [])

  const reset = useCallback(() => {
    setWatermark({ type: 'text', content: 'Watermark', position: { x: 90, y: 90 }, size: 24, opacity: 0.5, rotation: 0, color: '#ffffff', font: 'Arial' })
  }, [])

  return (
    <div className={`bg-zinc-900 rounded-xl border border-zinc-700 overflow-hidden ${className}`}>
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
        <div className="flex items-center gap-2"><Stamp size={16} className="text-[var(--primary)]" /><span className="font-semibold text-sm">Watermark</span></div>
        <div className="flex gap-1">
          <button onClick={() => setShowPreview(!showPreview)} className="p-1.5 rounded hover:bg-zinc-800">{showPreview ? <Eye size={14} /> : <EyeOff size={14} />}</button>
          <button onClick={reset} className="p-1.5 rounded hover:bg-zinc-800"><RotateCcw size={14} /></button>
        </div>
      </div>
      {/* Type selector */}
      <div className="flex gap-2 px-4 py-3 border-b border-zinc-800">
        <button onClick={() => setWatermark(w => ({ ...w, type: 'text' }))} className={`flex-1 flex items-center justify-center gap-1 py-2 rounded ${watermark.type === 'text' ? 'bg-[var(--primary)]' : 'bg-zinc-800'}`}><Type size={14} />Text</button>
        <button onClick={() => fileRef.current?.click()} className={`flex-1 flex items-center justify-center gap-1 py-2 rounded ${watermark.type === 'image' ? 'bg-[var(--primary)]' : 'bg-zinc-800'}`}><ImageIcon size={14} />Image</button>
      </div>
      {/* Preview */}
      <div ref={previewRef} className="relative aspect-video m-4 bg-black rounded overflow-hidden cursor-crosshair" onMouseDown={() => setDragging(true)} onMouseUp={() => setDragging(false)} onMouseLeave={() => setDragging(false)} onMouseMove={handleDrag}>
        {mediaType === 'video' ? <video src={mediaSrc} className="w-full h-full object-contain" muted loop autoPlay /> : <img src={mediaSrc} className="w-full h-full object-contain" />}
        {showPreview && <div className="absolute pointer-events-none" style={{ left: `${watermark.position.x}%`, top: `${watermark.position.y}%`, transform: `translate(-50%, -50%) rotate(${watermark.rotation}deg)`, opacity: watermark.opacity }}>
          {watermark.type === 'text' ? <span style={{ fontSize: watermark.size, color: watermark.color, fontFamily: watermark.font }}>{watermark.content}</span>
          : watermark.content.startsWith('data:') ? <img src={watermark.content} style={{ width: watermark.size * 4 }} /> : null}
        </div>}
      </div>
      {/* Position presets */}
      <div className="px-4 pb-3"><div className="grid grid-cols-3 gap-1">{POSITIONS.map(p => <button key={p.id} onClick={() => setPosition(p)} className={`py-1.5 rounded text-[10px] ${watermark.position.x === p.x && watermark.position.y === p.y ? 'bg-[var(--primary)]' : 'bg-zinc-800'}`}>{p.label}</button>)}</div></div>
      {/* Settings */}
      <div className="px-4 pb-4 space-y-3">
        {watermark.type === 'text' && <>
          <input value={watermark.content} onChange={e => setWatermark(w => ({ ...w, content: e.target.value }))} placeholder="Watermark text" className="w-full px-3 py-2 bg-zinc-800 rounded text-sm" />
          <div className="flex gap-2"><input type="color" value={watermark.color} onChange={e => setWatermark(w => ({ ...w, color: e.target.value }))} className="w-10 h-8 rounded cursor-pointer" /><select value={watermark.font} onChange={e => setWatermark(w => ({ ...w, font: e.target.value }))} className="flex-1 px-2 py-1 bg-zinc-800 rounded text-sm">{['Arial', 'Times New Roman', 'Courier New', 'Georgia', 'Verdana'].map(f => <option key={f} value={f}>{f}</option>)}</select></div>
        </>}
        <div><div className="flex justify-between text-xs mb-1"><span className="text-zinc-500">Size</span><span>{watermark.size}px</span></div><input type="range" min={12} max={72} value={watermark.size} onChange={e => setWatermark(w => ({ ...w, size: parseInt(e.target.value) }))} className="w-full accent-[var(--primary)]" /></div>
        <div><div className="flex justify-between text-xs mb-1"><span className="text-zinc-500">Opacity</span><span>{Math.round(watermark.opacity * 100)}%</span></div><input type="range" min={0.1} max={1} step={0.1} value={watermark.opacity} onChange={e => setWatermark(w => ({ ...w, opacity: parseFloat(e.target.value) }))} className="w-full accent-[var(--primary)]" /></div>
        <div><div className="flex justify-between text-xs mb-1"><span className="text-zinc-500">Rotation</span><span>{watermark.rotation}°</span></div><input type="range" min={-180} max={180} value={watermark.rotation} onChange={e => setWatermark(w => ({ ...w, rotation: parseInt(e.target.value) }))} className="w-full accent-[var(--primary)]" /></div>
      </div>
      <div className="px-4 pb-4"><button onClick={() => onApply(watermark)} className="w-full flex items-center justify-center gap-2 py-2.5 bg-[var(--primary)] rounded text-sm"><Save size={14} />Apply Watermark</button></div>
    </div>
  )
}
export default WatermarkAdder
