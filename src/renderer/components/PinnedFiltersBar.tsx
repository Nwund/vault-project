// File: src/renderer/components/PinnedFiltersBar.tsx
//
// Sticky horizontal bar at the top of Library showing user-pinned
// filter snapshots. Click a chip to apply the snapshot; click "Pin
// current" to save the active filter combination as a new chip.
//
// Storage: localStorage key vault_pinned_filters as JSON-array of
// PinnedFilter records. Cap at 10 entries to keep the bar readable.
//
// Snapshot fields mirror what LibraryPage already persists to
// sessionStorage (query / activeTags / typeFilter / sortBy /
// sortAscending / pageSize / layout). The "name" is user-supplied
// at pin-time via a tiny inline prompt.

import { useEffect, useState, useCallback } from 'react'
import { Pin, X, Plus, Check } from 'lucide-react'

export interface FilterSnapshot {
  query: string
  activeTags: string[]
  typeFilter: string
  sortBy: string
  sortAscending: boolean
  pageSize: number
  layout: string
}

export interface PinnedFilter extends FilterSnapshot {
  id: string
  name: string
  pinnedAt: number
}

const STORAGE_KEY = 'vault_pinned_filters'
const MAX_PINS = 10

export function loadPinnedFilters(): PinnedFilter[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function savePinnedFilters(filters: PinnedFilter[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filters))
  } catch { /* quota / corruption — ignore */ }
}

function snapshotMatches(a: FilterSnapshot, b: FilterSnapshot): boolean {
  if (a.query !== b.query) return false
  if (a.typeFilter !== b.typeFilter) return false
  if (a.sortBy !== b.sortBy) return false
  if (a.sortAscending !== b.sortAscending) return false
  if (a.pageSize !== b.pageSize) return false
  if (a.layout !== b.layout) return false
  if (a.activeTags.length !== b.activeTags.length) return false
  const aSet = new Set(a.activeTags.map(t => t.toLowerCase()))
  for (const t of b.activeTags) if (!aSet.has(t.toLowerCase())) return false
  return true
}

function autoName(snap: FilterSnapshot): string {
  const parts: string[] = []
  if (snap.query) parts.push(`"${snap.query.slice(0, 20)}"`)
  if (snap.typeFilter && snap.typeFilter !== 'all') parts.push(snap.typeFilter)
  if (snap.activeTags.length > 0) parts.push(snap.activeTags.slice(0, 2).join('+'))
  if (parts.length === 0) parts.push(`Layout: ${snap.layout}`)
  return parts.join(' · ')
}

interface Props {
  /** Current filter snapshot — used to detect "Pin current" + chip-active state. */
  current: FilterSnapshot
  /** Apply a pinned snapshot. Caller wires this to setState for each filter field. */
  onApply: (snap: FilterSnapshot) => void
  className?: string
}

export function PinnedFiltersBar({ current, onApply, className }: Props) {
  const [pins, setPins] = useState<PinnedFilter[]>(() => loadPinnedFilters())
  const [namingPrompt, setNamingPrompt] = useState(false)
  const [draftName, setDraftName] = useState('')

  // Sync to other tabs / windows that mutate the same key.
  useEffect(() => {
    const handler = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) setPins(loadPinnedFilters())
    }
    window.addEventListener('storage', handler)
    return () => window.removeEventListener('storage', handler)
  }, [])

  const isPinned = pins.find(p => snapshotMatches(p, current))

  const pinCurrent = useCallback((name: string) => {
    if (pins.length >= MAX_PINS) return
    const next: PinnedFilter = {
      id: `pin-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: name.trim() || autoName(current),
      pinnedAt: Date.now(),
      ...current,
    }
    const updated = [...pins, next]
    setPins(updated)
    savePinnedFilters(updated)
    setNamingPrompt(false)
    setDraftName('')
  }, [pins, current])

  const unpin = useCallback((id: string) => {
    const updated = pins.filter(p => p.id !== id)
    setPins(updated)
    savePinnedFilters(updated)
  }, [pins])

  // Don't render anything until there's at least one pin OR the user
  // is trying to pin something — keeps the chrome quiet for new users.
  if (pins.length === 0 && !namingPrompt) {
    // Render only a tiny "Pin current filter" affordance on the right edge,
    // and only if the current filter is non-default (anything pinnable).
    const isDefault = !current.query && current.typeFilter === 'all' && current.activeTags.length === 0
    if (isDefault) return null
    return (
      <div className={className}>
        <button
          onClick={() => { setDraftName(autoName(current)); setNamingPrompt(true) }}
          className="text-[11px] px-2 py-1 rounded bg-white/5 hover:bg-white/10 text-[var(--muted)] hover:text-white transition flex items-center gap-1"
          title="Save this filter combo as a quick-access chip"
        >
          <Pin size={11} />
          Pin current filter
        </button>
      </div>
    )
  }

  return (
    <div className={className}>
      <div className="flex items-center gap-1.5 flex-wrap">
        {/* Existing pins */}
        {pins.map(pin => {
          const active = snapshotMatches(pin, current)
          return (
            <div
              key={pin.id}
              className={`group relative flex items-center rounded-full text-[11px] transition ${
                active
                  ? 'bg-[var(--primary)] text-white'
                  : 'bg-white/5 hover:bg-white/10 text-white/80'
              }`}
            >
              <button
                onClick={() => onApply(pin)}
                className="pl-2.5 pr-1.5 py-1 flex items-center gap-1"
                title={`Apply "${pin.name}"`}
              >
                <Pin size={10} />
                <span className="truncate max-w-[10rem]">{pin.name}</span>
              </button>
              <button
                onClick={() => unpin(pin.id)}
                className="px-1.5 py-1 opacity-50 hover:opacity-100 hover:text-red-300 transition"
                title="Unpin"
              >
                <X size={10} />
              </button>
            </div>
          )
        })}

        {/* Pin current button — when current isn't already pinned */}
        {!isPinned && pins.length < MAX_PINS && !namingPrompt && (
          <button
            onClick={() => { setDraftName(autoName(current)); setNamingPrompt(true) }}
            className="text-[11px] px-2.5 py-1 rounded-full bg-white/5 hover:bg-white/10 text-[var(--muted)] hover:text-white transition flex items-center gap-1 border border-dashed border-white/10"
            title="Save this filter combo as a quick-access chip"
          >
            <Plus size={10} />
            Pin current
          </button>
        )}

        {/* Inline name input when pinning */}
        {namingPrompt && (
          <div className="flex items-center gap-1 bg-[var(--primary)]/10 border border-[var(--primary)]/30 rounded-full pl-2 pr-1 py-0.5">
            <input
              autoFocus
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') pinCurrent(draftName)
                if (e.key === 'Escape') { setNamingPrompt(false); setDraftName('') }
              }}
              placeholder="Name…"
              className="bg-transparent text-[11px] outline-none placeholder:text-[var(--muted)] w-32"
            />
            <button
              onClick={() => pinCurrent(draftName)}
              className="p-0.5 rounded text-[var(--primary)] hover:bg-[var(--primary)]/20"
              title="Save"
            >
              <Check size={11} />
            </button>
            <button
              onClick={() => { setNamingPrompt(false); setDraftName('') }}
              className="p-0.5 rounded text-[var(--muted)] hover:bg-white/10"
              title="Cancel"
            >
              <X size={11} />
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
