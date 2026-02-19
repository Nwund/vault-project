// File: src/renderer/components/PlaylistQuickAdd.tsx
// Quick add media to playlists with create new option

import React, { useState, useEffect, useCallback } from 'react'
import {
  ListPlus,
  Plus,
  Check,
  Search,
  Folder,
  X,
  Sparkles,
  Clock,
  Star
} from 'lucide-react'

interface Playlist {
  id: string
  name: string
  itemCount: number
  isSmart?: boolean
}

interface PlaylistQuickAddProps {
  mediaId: string | string[] // Single or multiple media IDs
  onClose: () => void
  onAddToPlaylist: (playlistId: string, mediaIds: string[]) => Promise<void>
  onCreatePlaylist: (name: string, mediaIds: string[]) => Promise<string>
  className?: string
}

export function PlaylistQuickAdd({
  mediaId,
  onClose,
  onAddToPlaylist,
  onCreatePlaylist,
  className = ''
}: PlaylistQuickAddProps) {
  const [playlists, setPlaylists] = useState<Playlist[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [adding, setAdding] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [newPlaylistName, setNewPlaylistName] = useState('')
  const [creating, setCreating] = useState(false)

  const mediaIds = Array.isArray(mediaId) ? mediaId : [mediaId]

  // Load playlists
  useEffect(() => {
    setLoading(true)
    window.api.playlists?.list?.()
      .then((result: Playlist[]) => {
        setPlaylists(result.filter(p => !p.isSmart))
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  // Filter playlists
  const filteredPlaylists = playlists.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase())
  )

  // Add to playlist
  const handleAdd = useCallback(async (playlistId: string) => {
    setAdding(playlistId)
    try {
      await onAddToPlaylist(playlistId, mediaIds)
      setSelectedIds(prev => new Set([...prev, playlistId]))
    } catch (e) {
      console.error('Failed to add to playlist:', e)
    } finally {
      setAdding(null)
    }
  }, [mediaIds, onAddToPlaylist])

  // Create new playlist
  const handleCreate = useCallback(async () => {
    if (!newPlaylistName.trim()) return
    setCreating(true)
    try {
      const newId = await onCreatePlaylist(newPlaylistName.trim(), mediaIds)
      setSelectedIds(prev => new Set([...prev, newId]))
      setShowCreate(false)
      setNewPlaylistName('')
      // Reload playlists
      const result = await window.api.playlists?.list?.()
      setPlaylists(result?.filter((p: Playlist) => !p.isSmart) || [])
    } catch (e) {
      console.error('Failed to create playlist:', e)
    } finally {
      setCreating(false)
    }
  }, [newPlaylistName, mediaIds, onCreatePlaylist])

  return (
    <div className={`bg-zinc-900/95 backdrop-blur-xl rounded-2xl border border-zinc-700 shadow-2xl overflow-hidden w-72 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
        <div className="flex items-center gap-2">
          <ListPlus size={16} className="text-[var(--primary)]" />
          <span className="font-semibold text-sm">Add to Playlist</span>
          {mediaIds.length > 1 && (
            <span className="text-xs text-zinc-500">({mediaIds.length} items)</span>
          )}
        </div>
        <button onClick={onClose} className="p-1 rounded hover:bg-zinc-800 transition">
          <X size={14} />
        </button>
      </div>

      {/* Search */}
      <div className="p-3 border-b border-zinc-800">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search playlists..."
            className="w-full pl-9 pr-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm outline-none focus:border-[var(--primary)]"
            autoFocus
          />
        </div>
      </div>

      {/* Playlists list */}
      <div className="max-h-64 overflow-y-auto">
        {loading ? (
          <div className="py-8 text-center text-zinc-500">
            <div className="w-6 h-6 border-2 border-zinc-700 border-t-[var(--primary)] rounded-full animate-spin mx-auto" />
          </div>
        ) : filteredPlaylists.length === 0 ? (
          <div className="py-8 text-center text-zinc-500">
            {search ? 'No matching playlists' : 'No playlists yet'}
          </div>
        ) : (
          <div className="divide-y divide-zinc-800/50">
            {filteredPlaylists.map(playlist => {
              const isSelected = selectedIds.has(playlist.id)
              const isAdding = adding === playlist.id

              return (
                <button
                  key={playlist.id}
                  onClick={() => !isSelected && handleAdd(playlist.id)}
                  disabled={isSelected || isAdding}
                  className={`w-full flex items-center gap-3 px-4 py-3 text-left transition ${
                    isSelected
                      ? 'bg-green-500/10'
                      : 'hover:bg-zinc-800'
                  }`}
                >
                  <div className="w-8 h-8 rounded-lg bg-zinc-800 flex items-center justify-center flex-shrink-0">
                    {isAdding ? (
                      <div className="w-4 h-4 border-2 border-zinc-600 border-t-[var(--primary)] rounded-full animate-spin" />
                    ) : isSelected ? (
                      <Check size={14} className="text-green-400" />
                    ) : (
                      <Folder size={14} className="text-zinc-500" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm truncate">{playlist.name}</div>
                    <div className="text-xs text-zinc-500">{playlist.itemCount} items</div>
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* Create new */}
      <div className="p-3 border-t border-zinc-800">
        {showCreate ? (
          <div className="space-y-2">
            <input
              type="text"
              value={newPlaylistName}
              onChange={(e) => setNewPlaylistName(e.target.value)}
              placeholder="Playlist name"
              className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm outline-none focus:border-[var(--primary)]"
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            />
            <div className="flex gap-2">
              <button
                onClick={() => setShowCreate(false)}
                className="flex-1 py-2 rounded-lg bg-zinc-800 text-sm hover:bg-zinc-700 transition"
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={!newPlaylistName.trim() || creating}
                className="flex-1 py-2 rounded-lg bg-[var(--primary)] text-sm hover:bg-[var(--primary)]/80 transition disabled:opacity-50"
              >
                {creating ? 'Creating...' : 'Create'}
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setShowCreate(true)}
            className="w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-sm transition"
          >
            <Plus size={14} />
            Create New Playlist
          </button>
        )}
      </div>
    </div>
  )
}

// Quick add button for media cards
export function AddToPlaylistButton({
  mediaId,
  onAddToPlaylist,
  onCreatePlaylist,
  className = ''
}: {
  mediaId: string | string[]
  onAddToPlaylist: (playlistId: string, mediaIds: string[]) => Promise<void>
  onCreatePlaylist: (name: string, mediaIds: string[]) => Promise<string>
  className?: string
}) {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <div className="relative">
      <button
        onClick={(e) => {
          e.stopPropagation()
          setIsOpen(true)
        }}
        className={`p-1.5 rounded-lg bg-black/50 hover:bg-black/70 transition text-white ${className}`}
        title="Add to playlist"
      >
        <ListPlus size={14} />
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          <div className="absolute top-full mt-2 right-0 z-50">
            <PlaylistQuickAdd
              mediaId={mediaId}
              onClose={() => setIsOpen(false)}
              onAddToPlaylist={onAddToPlaylist}
              onCreatePlaylist={onCreatePlaylist}
            />
          </div>
        </>
      )}
    </div>
  )
}

export default PlaylistQuickAdd
