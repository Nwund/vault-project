// File: src/renderer/components/FavoriteFolders.tsx
// Quick access sidebar for favorite folders

import React, { useState, useEffect, useCallback } from 'react'
import {
  Folder,
  FolderHeart,
  Star,
  ChevronRight,
  ChevronDown,
  Plus,
  Trash2,
  RefreshCw,
  Film,
  Image as ImageIcon,
  HardDrive,
  Clock,
  MoreVertical,
  Edit2,
  ExternalLink,
  Loader2
} from 'lucide-react'
import { formatFileSize, formatDate } from '../utils/formatters'

interface FavoriteFolder {
  id: string
  path: string
  name: string
  icon?: string
  color?: string
  sortOrder: number
  mediaCount: number
  lastAccessed: number
  createdAt: number
}

interface FolderStats {
  totalFiles: number
  videoCount: number
  imageCount: number
  gifCount: number
  totalSize: number
  newestFile: number
}

interface FavoriteFoldersProps {
  onNavigate?: (folderPath: string) => void
  onMediaSelect?: (mediaIds: string[]) => void
  className?: string
  compact?: boolean
}

export function FavoriteFolders({
  onNavigate,
  onMediaSelect,
  className = '',
  compact = false
}: FavoriteFoldersProps) {
  const [folders, setFolders] = useState<FavoriteFolder[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [stats, setStats] = useState<Record<string, FolderStats>>({})
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')

  const loadFolders = useCallback(async () => {
    try {
      const result = await window.api.invoke('favoriteFolders:getAll') as FavoriteFolder[]
      setFolders(result || [])
    } catch (e) {
      console.error('Failed to load favorite folders:', e)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    loadFolders()
  }, [loadFolders])

  const loadStats = useCallback(async (folderId: string) => {
    try {
      const result = await window.api.invoke('favoriteFolders:getStats', folderId) as FolderStats
      if (result) {
        setStats(prev => ({ ...prev, [folderId]: result }))
      }
    } catch (e) {
      console.error('Failed to load folder stats:', e)
    }
  }, [])

  const handleExpand = useCallback((folderId: string) => {
    if (expandedId === folderId) {
      setExpandedId(null)
    } else {
      setExpandedId(folderId)
      if (!stats[folderId]) {
        loadStats(folderId)
      }
    }
  }, [expandedId, stats, loadStats])

  const handleAddFolder = useCallback(async () => {
    const selected = await window.api.fs.chooseFolder({ title: 'Select Favorite Folder' })
    if (selected) {
      try {
        await window.api.invoke('favoriteFolders:add', selected)
        loadFolders()
      } catch (e) {
        console.error('Failed to add folder:', e)
      }
    }
  }, [loadFolders])

  const handleRemove = useCallback(async (folderId: string) => {
    try {
      await window.api.invoke('favoriteFolders:remove', folderId)
      setFolders(prev => prev.filter(f => f.id !== folderId))
    } catch (e) {
      console.error('Failed to remove folder:', e)
    }
  }, [])

  const handleRename = useCallback(async (folderId: string) => {
    if (!editName.trim()) return
    try {
      await window.api.invoke('favoriteFolders:update', folderId, { name: editName.trim() })
      setFolders(prev => prev.map(f => f.id === folderId ? { ...f, name: editName.trim() } : f))
      setEditingId(null)
    } catch (e) {
      console.error('Failed to rename folder:', e)
    }
  }, [editName])

  const handleClick = useCallback(async (folder: FavoriteFolder) => {
    await window.api.invoke('favoriteFolders:recordAccess', folder.id)
    if (onNavigate) {
      onNavigate(folder.path)
    } else if (onMediaSelect) {
      const mediaIds = await window.api.invoke('favoriteFolders:getMedia', folder.id, 100) as string[]
      if (mediaIds?.length) {
        onMediaSelect(mediaIds)
      }
    }
  }, [onNavigate, onMediaSelect])

  const handleOpenInExplorer = useCallback(async (path: string) => {
    await window.api.shell.showItemInFolder(path)
  }, [])

  if (loading) {
    return (
      <div className={`flex items-center justify-center py-8 ${className}`}>
        <Loader2 className="animate-spin text-zinc-500" size={20} />
      </div>
    )
  }

  return (
    <div className={`bg-zinc-900 rounded-xl border border-zinc-700 overflow-hidden ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
        <div className="flex items-center gap-2">
          <FolderHeart size={16} className="text-[var(--primary)]" />
          <span className="font-semibold text-sm">Favorites</span>
          <span className="text-xs text-zinc-500">({folders.length})</span>
        </div>
        <button
          onClick={handleAddFolder}
          className="p-1.5 rounded hover:bg-zinc-800 transition"
          title="Add folder"
        >
          <Plus size={14} />
        </button>
      </div>

      {/* Folder list */}
      <div className={compact ? 'max-h-48 overflow-y-auto' : 'max-h-96 overflow-y-auto'}>
        {folders.length === 0 ? (
          <div className="py-8 text-center text-zinc-500">
            <Folder size={24} className="mx-auto mb-2 opacity-50" />
            <p className="text-sm">No favorite folders</p>
            <button
              onClick={handleAddFolder}
              className="text-xs text-[var(--primary)] hover:underline mt-2"
            >
              Add a folder
            </button>
          </div>
        ) : (
          folders.map(folder => {
            const isExpanded = expandedId === folder.id
            const folderStats = stats[folder.id]
            const isEditing = editingId === folder.id

            return (
              <div key={folder.id} className="border-b border-zinc-800/50 last:border-0">
                <div
                  className="flex items-center gap-2 px-3 py-2 hover:bg-zinc-800/50 cursor-pointer group"
                  onClick={() => handleClick(folder)}
                >
                  <button
                    onClick={(e) => { e.stopPropagation(); handleExpand(folder.id) }}
                    className="p-0.5 hover:bg-zinc-700 rounded"
                  >
                    {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  </button>

                  <Folder
                    size={16}
                    className={folder.color ? '' : 'text-yellow-500'}
                    style={folder.color ? { color: folder.color } : undefined}
                  />

                  {isEditing ? (
                    <input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      onBlur={() => handleRename(folder.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleRename(folder.id)
                        if (e.key === 'Escape') setEditingId(null)
                      }}
                      onClick={(e) => e.stopPropagation()}
                      className="flex-1 bg-zinc-800 px-2 py-0.5 rounded text-sm outline-none"
                      autoFocus
                    />
                  ) : (
                    <span className="flex-1 text-sm truncate">{folder.name}</span>
                  )}

                  <span className="text-xs text-zinc-500">{folder.mediaCount}</span>

                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition">
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        setEditingId(folder.id)
                        setEditName(folder.name)
                      }}
                      className="p-1 rounded hover:bg-zinc-700"
                      title="Rename"
                    >
                      <Edit2 size={12} />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        handleOpenInExplorer(folder.path)
                      }}
                      className="p-1 rounded hover:bg-zinc-700"
                      title="Open in Explorer"
                    >
                      <ExternalLink size={12} />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        handleRemove(folder.id)
                      }}
                      className="p-1 rounded hover:bg-red-500/20 text-red-400"
                      title="Remove"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>

                {/* Expanded stats */}
                {isExpanded && (
                  <div className="px-4 py-2 bg-zinc-800/30 text-xs text-zinc-500 space-y-1">
                    <div className="truncate text-zinc-600">{folder.path}</div>
                    {folderStats ? (
                      <>
                        <div className="flex items-center gap-4">
                          <span className="flex items-center gap-1">
                            <Film size={10} /> {folderStats.videoCount} videos
                          </span>
                          <span className="flex items-center gap-1">
                            <ImageIcon size={10} /> {folderStats.imageCount} images
                          </span>
                        </div>
                        <div className="flex items-center gap-4">
                          <span className="flex items-center gap-1">
                            <HardDrive size={10} /> {formatFileSize(folderStats.totalSize)}
                          </span>
                          {folderStats.newestFile > 0 && (
                            <span className="flex items-center gap-1">
                              <Clock size={10} /> {formatDate(folderStats.newestFile)}
                            </span>
                          )}
                        </div>
                      </>
                    ) : (
                      <Loader2 size={12} className="animate-spin" />
                    )}
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

export default FavoriteFolders
