// File: src/renderer/components/ColorGrading.tsx
// Professional color grading controls for video

import React, { useState, useCallback, useMemo } from 'react'
import { Palette, RotateCcw, Save, Sliders, Sun, Contrast, Droplets, Thermometer, Sparkles } from 'lucide-react'

interface ColorSettings { brightness: number; contrast: number; saturation: number; hue: number; temperature: number; tint: number; shadows: number; highlights: number; vibrance: number }
const DEFAULT: ColorSettings = { brightness: 100, contrast: 100, saturation: 100, hue: 0, temperature: 0, tint: 0, shadows: 0, highlights: 0, vibrance: 0 }
const PRESETS = [
  { name: 'Cinematic', s: { brightness: 95, contrast: 115, saturation: 90, hue: 0, temperature: -10, tint: 5, shadows: 10, highlights: -5, vibrance: 10 } },
  { name: 'Vintage', s: { brightness: 105, contrast: 90, saturation: 80, hue: 15, temperature: 20, tint: 10, shadows: 15, highlights: -10, vibrance: -20 } },
  { name: 'Cold', s: { brightness: 100, contrast: 105, saturation: 95, hue: 0, temperature: -30, tint: -5, shadows: 5, highlights: 0, vibrance: 5 } },
  { name: 'Warm', s: { brightness: 102, contrast: 100, saturation: 110, hue: 0, temperature: 25, tint: 5, shadows: -5, highlights: 5, vibrance: 15 } },
  { name: 'Noir', s: { brightness: 100, contrast: 130, saturation: 0, hue: 0, temperature: 0, tint: 0, shadows: 20, highlights: -15, vibrance: 0 } },
]

interface ColorGradingProps { settings: ColorSettings; onChange: (s: ColorSettings) => void; onSavePreset?: (name: string, s: ColorSettings) => void; className?: string }

export function ColorGrading({ settings, onChange, onSavePreset, className = '' }: ColorGradingProps) {
  const [activeTab, setActiveTab] = useState<'basic' | 'advanced'>('basic')
  const cssFilter = useMemo(() => `brightness(${settings.brightness}%) contrast(${settings.contrast}%) saturate(${settings.saturation}%) hue-rotate(${settings.hue}deg) sepia(${Math.max(0, settings.temperature)}%) ${settings.temperature < 0 ? `hue-rotate(${settings.temperature}deg)` : ''}`, [settings])
  const reset = useCallback(() => onChange(DEFAULT), [onChange])
  const applyPreset = useCallback((p: typeof PRESETS[0]) => onChange(p.s), [onChange])

  const Slider = ({ label, icon: Icon, value, min, max, onChange: oc }: { label: string; icon: React.ElementType; value: number; min: number; max: number; onChange: (v: number) => void }) => (
    <div className="space-y-1"><div className="flex items-center justify-between text-xs"><span className="flex items-center gap-1 text-zinc-400"><Icon size={10} />{label}</span><span className="text-zinc-500">{value}{label === 'Hue' ? '°' : '%'}</span></div>
    <input type="range" min={min} max={max} value={value} onChange={e => oc(parseInt(e.target.value))} className="w-full h-1 accent-[var(--primary)]" /></div>
  )

  return (
    <div className={`bg-zinc-900 rounded-xl border border-zinc-700 overflow-hidden ${className}`}>
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
        <div className="flex items-center gap-2"><Palette size={16} className="text-[var(--primary)]" /><span className="font-semibold text-sm">Color Grading</span></div>
        <button onClick={reset} className="p-1.5 rounded hover:bg-zinc-800"><RotateCcw size={14} /></button>
      </div>
      {/* Presets */}
      <div className="flex gap-1 px-3 py-2 border-b border-zinc-800 overflow-x-auto">{PRESETS.map(p => <button key={p.name} onClick={() => applyPreset(p)} className="px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-xs whitespace-nowrap">{p.name}</button>)}</div>
      {/* Tabs */}
      <div className="flex border-b border-zinc-800">{['basic', 'advanced'].map(t => <button key={t} onClick={() => setActiveTab(t as any)} className={`flex-1 py-2 text-xs ${activeTab === t ? 'border-b-2 border-[var(--primary)]' : 'text-zinc-500'}`}>{t.charAt(0).toUpperCase() + t.slice(1)}</button>)}</div>
      <div className="p-4 space-y-4">
        {activeTab === 'basic' ? <>
          <Slider label="Brightness" icon={Sun} value={settings.brightness} min={50} max={150} onChange={v => onChange({ ...settings, brightness: v })} />
          <Slider label="Contrast" icon={Contrast} value={settings.contrast} min={50} max={150} onChange={v => onChange({ ...settings, contrast: v })} />
          <Slider label="Saturation" icon={Droplets} value={settings.saturation} min={0} max={200} onChange={v => onChange({ ...settings, saturation: v })} />
          <Slider label="Temperature" icon={Thermometer} value={settings.temperature} min={-50} max={50} onChange={v => onChange({ ...settings, temperature: v })} />
        </> : <>
          <Slider label="Hue" icon={Palette} value={settings.hue} min={-180} max={180} onChange={v => onChange({ ...settings, hue: v })} />
          <Slider label="Shadows" icon={Contrast} value={settings.shadows} min={-50} max={50} onChange={v => onChange({ ...settings, shadows: v })} />
          <Slider label="Highlights" icon={Sun} value={settings.highlights} min={-50} max={50} onChange={v => onChange({ ...settings, highlights: v })} />
          <Slider label="Vibrance" icon={Sparkles} value={settings.vibrance} min={-50} max={50} onChange={v => onChange({ ...settings, vibrance: v })} />
        </>}
      </div>
    </div>
  )
}
export default ColorGrading
