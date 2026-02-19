// File: src/renderer/components/VideoFilters.tsx
// Real-time video filters and effects

import React, { useState, useCallback, useMemo } from 'react'
import { Wand2, RotateCcw, Sparkles, Zap, Moon, Sun, Droplets, Eye, Layers, Save, Plus } from 'lucide-react'

interface FilterPreset { id: string; name: string; filters: string; icon?: React.ElementType }
const PRESETS: FilterPreset[] = [
  { id: 'none', name: 'None', filters: 'none' },
  { id: 'vivid', name: 'Vivid', filters: 'saturate(1.4) contrast(1.1)', icon: Sparkles },
  { id: 'warm', name: 'Warm', filters: 'sepia(0.3) saturate(1.2)', icon: Sun },
  { id: 'cool', name: 'Cool', filters: 'hue-rotate(-20deg) saturate(1.1)', icon: Moon },
  { id: 'noir', name: 'Noir', filters: 'grayscale(1) contrast(1.3)', icon: Eye },
  { id: 'vintage', name: 'Vintage', filters: 'sepia(0.5) contrast(0.9) brightness(1.1)', icon: Layers },
  { id: 'dreamy', name: 'Dreamy', filters: 'brightness(1.1) contrast(0.95) blur(0.5px)', icon: Droplets },
  { id: 'sharp', name: 'Sharp', filters: 'contrast(1.2) saturate(1.1)', icon: Zap },
]

interface VideoFiltersProps { onFilterChange: (filter: string) => void; currentFilter?: string; customPresets?: FilterPreset[]; onSavePreset?: (preset: FilterPreset) => void; className?: string }

export function VideoFilters({ onFilterChange, currentFilter = 'none', customPresets = [], onSavePreset, className = '' }: VideoFiltersProps) {
  const [showCustom, setShowCustom] = useState(false)
  const [blur, setBlur] = useState(0)
  const [brightness, setBrightness] = useState(100)
  const [contrast, setContrast] = useState(100)
  const [saturation, setSaturation] = useState(100)
  const [hue, setHue] = useState(0)
  const [sepia, setSepia] = useState(0)
  const [invert, setInvert] = useState(0)

  const allPresets = useMemo(() => [...PRESETS, ...customPresets], [customPresets])
  const customFilter = useMemo(() => `blur(${blur}px) brightness(${brightness}%) contrast(${contrast}%) saturate(${saturation}%) hue-rotate(${hue}deg) sepia(${sepia}%) invert(${invert}%)`, [blur, brightness, contrast, saturation, hue, sepia, invert])

  const applyCustom = useCallback(() => { onFilterChange(customFilter) }, [customFilter, onFilterChange])
  const reset = useCallback(() => { setBlur(0); setBrightness(100); setContrast(100); setSaturation(100); setHue(0); setSepia(0); setInvert(0); onFilterChange('none') }, [onFilterChange])

  const saveCustom = useCallback(() => {
    const name = prompt('Preset name:')
    if (name) onSavePreset?.({ id: `custom-${Date.now()}`, name, filters: customFilter })
  }, [customFilter, onSavePreset])

  const Slider = ({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (v: number) => void }) => (
    <div className="flex items-center gap-2"><span className="w-20 text-xs text-zinc-500">{label}</span><input type="range" min={min} max={max} step={1} value={value} onChange={e => { onChange(parseInt(e.target.value)); applyCustom() }} className="flex-1 h-1 accent-[var(--primary)]" aria-label={label} aria-valuemin={min} aria-valuemax={max} aria-valuenow={value} /><span className="w-10 text-xs text-zinc-500 text-right">{value}{label === 'Hue' ? '°' : '%'}</span></div>
  )

  return (
    <div className={`bg-zinc-900 rounded-xl border border-zinc-700 overflow-hidden ${className}`}>
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
        <div className="flex items-center gap-2"><Wand2 size={16} className="text-[var(--primary)]" /><span className="font-semibold text-sm">Filters</span></div>
        <div className="flex gap-1"><button onClick={() => setShowCustom(!showCustom)} className={`p-1.5 rounded ${showCustom ? 'bg-[var(--primary)]' : 'hover:bg-zinc-800'}`}><Plus size={14} /></button><button onClick={reset} className="p-1.5 rounded hover:bg-zinc-800"><RotateCcw size={14} /></button></div>
      </div>
      {/* Presets */}
      <div className="grid grid-cols-4 gap-2 p-3 border-b border-zinc-800">
        {allPresets.map(p => {
          const Icon = p.icon || Wand2
          return <button key={p.id} onClick={() => onFilterChange(p.filters)} className={`flex flex-col items-center gap-1 p-2 rounded ${currentFilter === p.filters ? 'bg-[var(--primary)]' : 'bg-zinc-800 hover:bg-zinc-700'}`}><Icon size={14} /><span className="text-[10px]">{p.name}</span></button>
        })}
      </div>
      {/* Custom sliders */}
      {showCustom && <div className="p-4 space-y-3">
        <Slider label="Blur" value={blur} min={0} max={20} onChange={setBlur} />
        <Slider label="Brightness" value={brightness} min={50} max={150} onChange={setBrightness} />
        <Slider label="Contrast" value={contrast} min={50} max={150} onChange={setContrast} />
        <Slider label="Saturation" value={saturation} min={0} max={200} onChange={setSaturation} />
        <Slider label="Hue" value={hue} min={-180} max={180} onChange={setHue} />
        <Slider label="Sepia" value={sepia} min={0} max={100} onChange={setSepia} />
        <Slider label="Invert" value={invert} min={0} max={100} onChange={setInvert} />
        <div className="flex gap-2 pt-2">{onSavePreset && <button onClick={saveCustom} className="flex-1 flex items-center justify-center gap-1 py-2 bg-zinc-800 rounded text-sm"><Save size={12} />Save Preset</button>}<button onClick={applyCustom} className="flex-1 py-2 bg-[var(--primary)] rounded text-sm">Apply</button></div>
      </div>}
    </div>
  )
}
export default VideoFilters
