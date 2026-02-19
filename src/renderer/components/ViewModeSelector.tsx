// File: src/renderer/components/ViewModeSelector.tsx
// Media view mode selector with preview

import React, { useState, useCallback } from 'react'
import { LayoutGrid, Grid3X3, List, Columns, Film, Rows, LayoutDashboard, Maximize, Settings, Check } from 'lucide-react'

type ViewMode = 'grid' | 'grid-large' | 'list' | 'masonry' | 'timeline' | 'carousel' | 'compact' | 'theater'
interface ViewModeConfig { columns: number; showInfo: boolean; showThumbnails: boolean; cardSize: 'small' | 'medium' | 'large'; aspectRatio: '16:9' | '4:3' | '1:1' | 'auto' }
interface ViewModeSelectorProps { mode: ViewMode; config: ViewModeConfig; onChange: (mode: ViewMode, config: ViewModeConfig) => void; className?: string }

const MODES: Array<{ id: ViewMode; label: string; icon: React.ElementType; desc: string }> = [
  { id: 'grid', label: 'Grid', icon: Grid3X3, desc: 'Standard grid layout' },
  { id: 'grid-large', label: 'Large Grid', icon: LayoutGrid, desc: 'Bigger thumbnails' },
  { id: 'list', label: 'List', icon: List, desc: 'Detailed list view' },
  { id: 'masonry', label: 'Masonry', icon: Columns, desc: 'Pinterest-style' },
  { id: 'timeline', label: 'Timeline', icon: Rows, desc: 'Chronological view' },
  { id: 'carousel', label: 'Carousel', icon: Film, desc: 'Horizontal scroll' },
  { id: 'compact', label: 'Compact', icon: LayoutDashboard, desc: 'Dense grid' },
  { id: 'theater', label: 'Theater', icon: Maximize, desc: 'Full-width preview' }
]

export function ViewModeSelector({ mode, config, onChange, className = '' }: ViewModeSelectorProps) {
  const [showConfig, setShowConfig] = useState(false)
  const currentMode = MODES.find(m => m.id === mode)!

  const updateConfig = useCallback((updates: Partial<ViewModeConfig>) => {
    onChange(mode, { ...config, ...updates })
  }, [mode, config, onChange])

  return (
    <div className={`bg-zinc-900 rounded-xl border border-zinc-700 overflow-hidden ${className}`}>
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
        <div className="flex items-center gap-2"><currentMode.icon size={16} className="text-[var(--primary)]" /><span className="font-semibold text-sm">View Mode</span></div>
        <button onClick={() => setShowConfig(!showConfig)} className={`p-1.5 rounded ${showConfig ? 'bg-[var(--primary)]' : 'hover:bg-zinc-800'}`}><Settings size={14} /></button>
      </div>
      {/* Mode selection */}
      <div className="grid grid-cols-4 gap-2 p-3">
        {MODES.map(m => (
          <button key={m.id} onClick={() => onChange(m.id, config)} className={`flex flex-col items-center gap-1 p-3 rounded-lg transition ${mode === m.id ? 'bg-[var(--primary)]' : 'bg-zinc-800 hover:bg-zinc-700'}`}>
            <m.icon size={18} />
            <span className="text-xs">{m.label}</span>
          </button>
        ))}
      </div>
      {/* Config panel */}
      {showConfig && <div className="px-4 py-3 border-t border-zinc-800 space-y-4">
        {/* Columns */}
        <div><div className="flex items-center justify-between text-xs mb-2"><span className="text-zinc-500">Columns</span><span>{config.columns}</span></div>
          <input type="range" min={2} max={8} value={config.columns} onChange={e => updateConfig({ columns: parseInt(e.target.value) })} className="w-full accent-[var(--primary)]" />
        </div>
        {/* Card size */}
        <div><div className="text-xs text-zinc-500 mb-2">Card Size</div>
          <div className="flex gap-2">{(['small', 'medium', 'large'] as const).map(s => <button key={s} onClick={() => updateConfig({ cardSize: s })} className={`flex-1 py-1.5 rounded text-xs ${config.cardSize === s ? 'bg-[var(--primary)]' : 'bg-zinc-800'}`}>{s.charAt(0).toUpperCase() + s.slice(1)}</button>)}</div>
        </div>
        {/* Aspect ratio */}
        <div><div className="text-xs text-zinc-500 mb-2">Aspect Ratio</div>
          <div className="flex gap-2">{(['auto', '16:9', '4:3', '1:1'] as const).map(ar => <button key={ar} onClick={() => updateConfig({ aspectRatio: ar })} className={`flex-1 py-1.5 rounded text-xs ${config.aspectRatio === ar ? 'bg-[var(--primary)]' : 'bg-zinc-800'}`}>{ar}</button>)}</div>
        </div>
        {/* Toggles */}
        <div className="space-y-2">
          <label className="flex items-center justify-between"><span className="text-sm">Show info</span>
            <button onClick={() => updateConfig({ showInfo: !config.showInfo })} className={`w-8 h-5 rounded-full ${config.showInfo ? 'bg-[var(--primary)]' : 'bg-zinc-700'}`}><div className={`w-3 h-3 rounded-full bg-white transform ${config.showInfo ? 'translate-x-4' : 'translate-x-1'}`} /></button>
          </label>
          <label className="flex items-center justify-between"><span className="text-sm">Show thumbnails</span>
            <button onClick={() => updateConfig({ showThumbnails: !config.showThumbnails })} className={`w-8 h-5 rounded-full ${config.showThumbnails ? 'bg-[var(--primary)]' : 'bg-zinc-700'}`}><div className={`w-3 h-3 rounded-full bg-white transform ${config.showThumbnails ? 'translate-x-4' : 'translate-x-1'}`} /></button>
          </label>
        </div>
      </div>}
    </div>
  )
}
export default ViewModeSelector
