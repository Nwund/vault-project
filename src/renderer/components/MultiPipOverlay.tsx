// File: src/renderer/components/MultiPipOverlay.tsx
//
// #203 — Twitch-multistream-style tiled PiP overlay.
//
// Shows up to 4 small floating video tiles in the bottom-right corner
// of the window. Only the user-promoted "active" tile plays audio;
// the others stay muted so you don't get a cacophony.
//
// Different from FloatingVideoPlayer (which is the full-feature
// draggable player) and from GoonWall (which fills the screen): this
// is a quiet HUD-style overlay you can browse the Library next to.
//
// Drag-and-drop reorders tiles within the overlay. Click any tile to
// promote it (audio swap). The whole strip can be collapsed to a
// 1-tile preview.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Volume2, VolumeX, X as XIcon, Pause, Play, ChevronDown, ChevronUp } from 'lucide-react'
import { toFileUrlCached } from '../hooks/usePerformance'

interface PipItem {
  id: string
  /** Media id from the catalog — used to resolve a playable URL. */
  mediaId: string
  /** Optional pre-resolved URL. If absent, we resolve via media.getPlayableUrl. */
  url?: string
  label?: string
}

interface Props {
  items: PipItem[]
  /** Caller can replace the list (drag handlers in renderer use this). */
  onReorder?: (items: PipItem[]) => void
  onRemove?: (id: string) => void
  onClose?: () => void
  className?: string
}

const MAX_TILES = 4
const TILE_W = 240
const TILE_H = 135
const GAP = 6

export function MultiPipOverlay({ items, onReorder, onRemove, onClose, className }: Props) {
  const tiles = useMemo(() => items.slice(0, MAX_TILES), [items])
  const [activeId, setActiveId] = useState<string | null>(tiles[0]?.id ?? null)
  const [collapsed, setCollapsed] = useState(false)
  const [globalMuted, setGlobalMuted] = useState(false)
  const [paused, setPaused] = useState(false)
  const videoRefs = useRef<Map<string, HTMLVideoElement>>(new Map())
  const [urlsById, setUrlsById] = useState<Record<string, string>>({})

  // Ensure activeId tracks the visible list as it changes.
  useEffect(() => {
    if (!activeId || !tiles.find((t) => t.id === activeId)) {
      setActiveId(tiles[0]?.id ?? null)
    }
  }, [tiles, activeId])

  // Resolve playable URLs the first time we see each id.
  useEffect(() => {
    const need = tiles.filter((t) => !t.url && !urlsById[t.id])
    if (need.length === 0) return
    let cancelled = false
    ;(async () => {
      const api: any = (window as any).api
      for (const t of need) {
        try {
          const u = await api?.media?.getPlayableUrl?.(t.mediaId)
          if (!cancelled && u) setUrlsById((prev) => ({ ...prev, [t.id]: u }))
        } catch { /* skip */ }
      }
    })()
    return () => { cancelled = true }
  }, [tiles, urlsById])

  // Sync play/pause + per-tile mute as state changes.
  useEffect(() => {
    for (const [id, el] of videoRefs.current) {
      if (paused) {
        if (!el.paused) el.pause()
      } else {
        if (el.paused) void el.play().catch(() => { /* user gesture needed */ })
      }
      el.muted = globalMuted || id !== activeId
    }
  }, [activeId, globalMuted, paused, tiles])

  const registerVideo = useCallback((id: string) => (el: HTMLVideoElement | null) => {
    if (el) videoRefs.current.set(id, el)
    else videoRefs.current.delete(id)
  }, [])

  // Drag-to-reorder: HTML5 DnD between tiles. We track the dragging id
  // so the drop handler knows what to swap with.
  const draggingIdRef = useRef<string | null>(null)
  const onDragStart = (id: string) => (e: React.DragEvent) => {
    draggingIdRef.current = id
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', id)
  }
  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }
  const onDrop = (overId: string) => (e: React.DragEvent) => {
    e.preventDefault()
    const fromId = draggingIdRef.current
    draggingIdRef.current = null
    if (!fromId || fromId === overId) return
    const next = items.slice()
    const fromIdx = next.findIndex((t) => t.id === fromId)
    const toIdx = next.findIndex((t) => t.id === overId)
    if (fromIdx < 0 || toIdx < 0) return
    const [moved] = next.splice(fromIdx, 1)
    next.splice(toIdx, 0, moved)
    onReorder?.(next)
  }

  // 1x1, 2x1, 2x2 layouts depending on tile count.
  const cols = tiles.length <= 1 ? 1 : 2

  if (tiles.length === 0) return null

  return (
    <div
      className={`fixed bottom-3 right-3 z-[100] rounded-xl bg-black/85 backdrop-blur border border-zinc-800 shadow-2xl ${className ?? ''}`}
      style={{
        width: collapsed ? TILE_W : cols * (TILE_W + GAP) - GAP + 16,
      }}
    >
      <div className="flex items-center justify-between px-2 py-1.5 border-b border-zinc-800">
        <div className="text-[10px] uppercase tracking-wide text-zinc-400">
          Multi-PiP · {tiles.length}{collapsed ? ` (collapsed)` : ''}
        </div>
        <div className="flex items-center gap-0.5">
          <button
            onClick={() => setPaused((v) => !v)}
            className="p-1 rounded hover:bg-zinc-800 text-zinc-300"
            title={paused ? 'Resume all' : 'Pause all'}
          >
            {paused ? <Play size={11} /> : <Pause size={11} />}
          </button>
          <button
            onClick={() => setGlobalMuted((v) => !v)}
            className="p-1 rounded hover:bg-zinc-800 text-zinc-300"
            title={globalMuted ? 'Unmute active' : 'Mute all'}
          >
            {globalMuted ? <VolumeX size={11} /> : <Volume2 size={11} />}
          </button>
          <button
            onClick={() => setCollapsed((v) => !v)}
            className="p-1 rounded hover:bg-zinc-800 text-zinc-300"
            title={collapsed ? 'Expand' : 'Collapse'}
          >
            {collapsed ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
          </button>
          {onClose && (
            <button
              onClick={onClose}
              className="p-1 rounded hover:bg-zinc-800 text-zinc-300"
              title="Close overlay"
            >
              <XIcon size={11} />
            </button>
          )}
        </div>
      </div>

      <div
        className="p-2 grid"
        style={{
          gridTemplateColumns: `repeat(${cols}, ${TILE_W}px)`,
          gap: `${GAP}px`,
        }}
      >
        {(collapsed ? tiles.filter((t) => t.id === activeId).slice(0, 1) : tiles).map((tile) => {
          const isActive = tile.id === activeId
          const url = tile.url ?? urlsById[tile.id]
          return (
            <div
              key={tile.id}
              draggable
              onDragStart={onDragStart(tile.id)}
              onDragOver={onDragOver}
              onDrop={onDrop(tile.id)}
              onClick={() => setActiveId(tile.id)}
              className={`relative rounded overflow-hidden cursor-pointer group ${
                isActive ? 'ring-2 ring-[var(--primary)]' : 'ring-1 ring-zinc-800 hover:ring-zinc-600'
              }`}
              style={{ width: TILE_W, height: TILE_H }}
              title={tile.label ?? tile.mediaId}
            >
              {url ? (
                <video
                  ref={registerVideo(tile.id)}
                  src={url}
                  className="absolute inset-0 w-full h-full object-cover bg-black"
                  loop
                  playsInline
                  autoPlay
                  muted={globalMuted || !isActive}
                />
              ) : (
                <div className="absolute inset-0 grid place-items-center bg-zinc-950 text-zinc-600 text-xs">
                  loading…
                </div>
              )}
              {tile.label && (
                <div className="absolute bottom-0 left-0 right-0 px-1.5 py-0.5 bg-gradient-to-t from-black/80 to-transparent text-[10px] truncate">
                  {tile.label}
                </div>
              )}
              {onRemove && (
                <button
                  onClick={(e) => { e.stopPropagation(); onRemove(tile.id) }}
                  className="absolute top-1 right-1 p-0.5 rounded bg-black/60 opacity-0 group-hover:opacity-100 transition text-zinc-300 hover:text-white"
                  title="Remove from overlay"
                >
                  <XIcon size={10} />
                </button>
              )}
              {isActive && (
                <div className="absolute top-1 left-1 px-1 py-0.5 rounded bg-[var(--primary)] text-[9px] uppercase tracking-wide">
                  Active
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
