// File: src/renderer/components/PlaylistPickers.tsx
//
// Two related playlist-add popups extracted from App.tsx (#48):
//
//   PlaylistPicker      — fullscreen dialog listing all playlists for
//                         picking. Used by drag-select bulk-add flow.
//   AddToPlaylistPopup  — anchored mini-popup (portaled to body) for
//                         quick "add this one item" from any tile.
//
// Both share the same data plumbing (window.api.playlists.* + the
// challenge progress hook), so co-locating them keeps the import set
// tight in App.tsx.

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { PlaylistRow } from '../types'
import { cn } from '../utils/cn'
import { Btn } from './ui/Btn'

export function PlaylistPicker(props: {
  playlists: PlaylistRow[]
  onClose: () => void
  onPick: (playlistId: string) => void
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="playlist-picker-title"
      className="fixed inset-0 bg-black/90 backdrop-blur-md-sm flex items-center justify-center z-[60]"
    >
      <div className="w-[520px] rounded-3xl border border-white/10 bg-[var(--panel)] overflow-hidden shadow-2xl">
        <div className="px-6 py-4 border-b border-[var(--border)] flex items-center justify-between">
          <div id="playlist-picker-title" className="text-sm font-semibold">Add to Playlist</div>
          <Btn onClick={props.onClose} aria-label="Close dialog">Close</Btn>
        </div>
        <div className="p-4 space-y-2 max-h-[60vh] overflow-auto" role="list" aria-label="Available playlists">
          {props.playlists.map((p) => (
            <button
              key={p.id}
              role="listitem"
              onClick={() => props.onPick(p.id)}
              aria-label={`Add to playlist: ${p.name}`}
              className="w-full text-left px-4 py-3 rounded-2xl border border-[var(--border)] bg-black/20 hover:border-white/15 transition"
            >
              <div className="text-sm font-medium">{p.name}</div>
            </button>
          ))}
          {!props.playlists.length ? <div className="text-xs text-[var(--muted)]">No playlists yet.</div> : null}
        </div>
      </div>
    </div>
  )
}

export function AddToPlaylistPopup(props: {
  mediaId: string
  onClose: () => void
  anchorRef?: React.RefObject<HTMLElement | null>
}) {
  const [playlists, setPlaylists] = useState<PlaylistRow[]>([])
  const [containingIds, setContainingIds] = useState<Set<string>>(new Set())
  const [newName, setNewName] = useState('')
  const [loading, setLoading] = useState(true)
  const popupRef = useRef<HTMLDivElement>(null)

  const getPos = (): { top: number; left: number } => {
    if (props.anchorRef?.current) {
      const rect = props.anchorRef.current.getBoundingClientRect()
      const popupWidth = 256
      const popupHeight = 300
      let top = rect.bottom + 4
      let left = rect.left
      if (left + popupWidth > window.innerWidth) {
        left = window.innerWidth - popupWidth - 8
      }
      if (left < 8) left = 8
      if (top + popupHeight > window.innerHeight) {
        top = rect.top - popupHeight - 4
      }
      if (top < 8) top = 8
      return { top, left }
    }
    return { top: 100, left: 100 }
  }
  const [pos] = useState(getPos)

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const pls = await window.api.playlists.list()
        if (!alive) return
        setPlaylists(pls)
        const containing = new Set<string>()
        await Promise.all(pls.map(async (pl: PlaylistRow) => {
          try {
            const items = await window.api.playlists.getItems(pl.id)
            if (items.some((item: any) => (item.media?.id ?? item.mediaId) === props.mediaId)) {
              containing.add(pl.id)
            }
          } catch { /* ignore */ }
        }))
        if (alive) setContainingIds(containing)
      } catch (e) {
        console.error('[AddToPlaylistPopup] Failed to load playlists:', e)
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => { alive = false }
  }, [props.mediaId])

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (props.anchorRef?.current?.contains(e.target as Node)) return
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) {
        props.onClose()
      }
    }
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') props.onClose()
    }
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClick)
      document.addEventListener('keydown', handleKey)
    }, 0)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKey)
    }
  }, [props.onClose, props.anchorRef])

  const handleAdd = async (playlistId: string) => {
    try {
      await window.api.playlists.addItems(playlistId, [props.mediaId])
      window.api.challenges?.updateProgress?.('add_to_playlist', 1)
      props.onClose()
    } catch (e) {
      console.error('[AddToPlaylistPopup] Failed to add:', e)
    }
  }

  const handleCreate = async () => {
    if (!newName.trim()) return
    try {
      const created = await window.api.playlists.create(newName.trim())
      setNewName('')
      if (created?.id) {
        await window.api.playlists.addItems(created.id, [props.mediaId])
        window.api.challenges?.updateProgress?.('create_playlist', 1)
        window.api.challenges?.updateProgress?.('add_to_playlist', 1)
      }
      props.onClose()
    } catch (e) {
      console.error('[AddToPlaylistPopup] Failed to create playlist:', e)
    }
  }

  const popup = (
    <div
      ref={popupRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-to-playlist-title"
      className="w-64 rounded-xl border border-white/15 bg-[var(--panel)] shadow-2xl overflow-hidden backdrop-blur-xl"
      style={{ position: 'fixed', top: pos.top, left: pos.left, zIndex: 99999 }}
      onClick={(e) => e.stopPropagation()}
    >
      <div id="add-to-playlist-title" className="px-3 py-2 border-b border-[var(--border)] text-xs font-semibold text-[var(--muted)]">
        Add to Playlist
      </div>
      <div className="px-3 py-2 border-b border-[var(--border)] flex gap-1">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
          placeholder="New playlist..."
          aria-label="New playlist name"
          className="flex-1 px-2 py-1 rounded-lg bg-black/20 border border-[var(--border)] outline-none focus:border-white/15 text-xs"
          onClick={(e) => e.stopPropagation()}
        />
        <button
          onClick={handleCreate}
          aria-label="Create new playlist"
          className="px-2 py-1 rounded-lg bg-[var(--primary)] text-white text-xs hover:opacity-90 transition"
        >
          +
        </button>
      </div>
      <div className="max-h-48 overflow-auto" role="list" aria-label="Available playlists">
        {loading ? (
          <div className="px-3 py-4 text-center text-xs text-[var(--muted)]" aria-live="polite">Loading...</div>
        ) : playlists.length === 0 ? (
          <div className="px-3 py-4 text-center text-xs text-[var(--muted)]">No playlists yet</div>
        ) : (
          playlists.map((pl) => {
            const isIn = containingIds.has(pl.id)
            return (
              <button
                key={pl.id}
                role="listitem"
                onClick={() => !isIn && handleAdd(pl.id)}
                aria-label={isIn ? `${pl.name} - already added` : `Add to ${pl.name}`}
                aria-disabled={isIn}
                className={cn(
                  'w-full text-left px-3 py-2 text-xs hover:bg-white/5 transition flex items-center justify-between',
                  isIn && 'opacity-60',
                )}
              >
                <span className="truncate">{pl.name}</span>
                {isIn && <span className="text-green-400 flex-shrink-0 ml-2" aria-hidden="true">✓</span>}
              </button>
            )
          })
        )}
      </div>
    </div>
  )

  return createPortal(popup, document.body)
}
