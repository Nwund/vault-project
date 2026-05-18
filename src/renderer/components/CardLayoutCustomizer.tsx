// File: src/renderer/components/CardLayoutCustomizer.tsx
//
// #159 — Settings card letting users:
//   1. Pick which metadata appears on Library grid cards (rating,
//      duration, tag chips, performer, last-watched, etc).
//   2. Reorder the Home tab's sections via drag-and-drop, or hide
//      sections they don't use.
//
// Persists to localStorage via useCardLayoutPrefs. MediaTile + the
// Library Home renderer read the same hook so changes take effect
// instantly without a refresh.

import React, { useCallback, useState } from 'react'
import { LayoutGrid, RotateCcw, GripVertical } from 'lucide-react'
import { useCardLayoutPrefs } from '../hooks/useCardLayoutPrefs'

export function CardLayoutCustomizer(): React.JSX.Element {
  const {
    fields, setField, resetFields, ALL_FIELDS,
    homeOrder, setHomeOrder, resetHome, ALL_HOME_SECTIONS,
  } = useCardLayoutPrefs()

  const [dragId, setDragId] = useState<string | null>(null)

  const onDragStart = useCallback((id: string) => (e: React.DragEvent) => {
    setDragId(id)
    e.dataTransfer.effectAllowed = 'move'
  }, [])

  const onDrop = useCallback((overId: string) => (e: React.DragEvent) => {
    e.preventDefault()
    const fromId = dragId
    setDragId(null)
    if (!fromId || fromId === overId) return
    const next = homeOrder.slice()
    const fromIdx = next.findIndex((s) => s === fromId)
    const toIdx = next.findIndex((s) => s === overId)
    if (fromIdx < 0 || toIdx < 0) return
    const [moved] = next.splice(fromIdx, 1)
    next.splice(toIdx, 0, moved as any)
    setHomeOrder(next)
  }, [dragId, homeOrder, setHomeOrder])

  return (
    <div className="rounded-3xl border border-[var(--border)] bg-black/20 p-5 mt-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <LayoutGrid size={16} className="text-[var(--primary)]" />
          <div className="text-sm font-semibold">Card &amp; Home layout</div>
        </div>
      </div>

      {/* Section 1: card fields */}
      <div className="mb-5">
        <div className="flex items-center justify-between mb-2">
          <div className="text-xs uppercase tracking-wide text-zinc-500">Metadata on Library cards</div>
          <button
            onClick={resetFields}
            className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-400"
          >
            <RotateCcw size={10} /> Defaults
          </button>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-1.5">
          {ALL_FIELDS.map((f) => {
            const on = fields.has(f.id)
            return (
              <label
                key={f.id}
                className={`flex items-center gap-2 px-2 py-1.5 rounded-md text-xs cursor-pointer border transition ${
                  on ? 'bg-[var(--primary)]/15 border-[var(--primary)]/40' : 'bg-zinc-900/40 border-zinc-800 hover:border-[var(--border)]'
                }`}
              >
                <input
                  type="checkbox"
                  checked={on}
                  onChange={(e) => setField(f.id, e.target.checked)}
                  className="accent-[var(--primary)]"
                />
                {f.label}
              </label>
            )
          })}
        </div>
      </div>

      {/* Section 2: home order */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <div className="text-xs uppercase tracking-wide text-zinc-500">Home tab section order</div>
          <button
            onClick={resetHome}
            className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-400"
          >
            <RotateCcw size={10} /> Defaults
          </button>
        </div>
        <div className="space-y-1">
          {homeOrder.map((id) => {
            const def = ALL_HOME_SECTIONS.find((s) => s.id === id)
            if (!def) return null
            return (
              <div
                key={id}
                draggable
                onDragStart={onDragStart(id)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={onDrop(id)}
                className={`flex items-center gap-2 px-2 py-1.5 rounded-md text-sm cursor-grab bg-zinc-900/40 border border-zinc-800 hover:border-[var(--border)] ${
                  dragId === id ? 'opacity-50' : ''
                }`}
              >
                <GripVertical size={12} className="text-zinc-500" />
                <span className="flex-1">{def.label}</span>
              </div>
            )
          })}
        </div>
        <div className="text-[10px] text-zinc-500 mt-2">
          Drag rows to reorder. Sections render top-to-bottom in this order on the Home tab.
        </div>
      </div>
    </div>
  )
}
