// File: src/renderer/components/FolderWatcher.tsx
// Watch folder status indicator and management

import React, { useState, useEffect, useCallback, useMemo } from 'react'
import {
  FolderSearch,
  FolderPlus,
  FolderMinus,
  FolderSync,
  Folder,
  FolderOpen,
  Eye,
  EyeOff,
  RefreshCw,
  Settings,
  X,
  Check,
  AlertCircle,
  Clock,
  Film,
  Image,
  HardDrive,
  Loader2,
  ChevronRight,
  Plus,
  Trash2
} from 'lucide-react'
import { formatFileSize, formatDate } from '../utils/formatters'

interface WatchedFolder {
  id: string
  path: string
  name: string
  isActive: boolean
  recursive: boolean
  autoImport: boolean
  fileTypes: ('video' | 'image')[]
  lastScan?: number
  itemCount: number
  totalSize: number
  status: 'idle' | 'scanning' | 'error'
  error?: string
}

interface FolderWatcherProps {
  folders: WatchedFolder[]
  onAddFolder: (path: string, options: Partial<WatchedFolder>) => void
  onRemoveFolder: (id: string) => void
  onUpdateFolder: (id: string, updates: Partial<WatchedFolder>) => void
  onScanFolder: (id: string) => void
  onScanAll: () => void
  className?: string
}

export function FolderWatcher({
  folders,
  onAddFolder,
  onRemoveFolder,
  onUpdateFolder,
  onScanFolder,
  onScanAll,
  className = ''
}: FolderWatcherProps) {
  const [showAddFolder, setShowAddFolder] = useState(false)
  const [editingFolder, setEditingFolder] = useState<string | null>(null)
  const [newFolderPath, setNewFolderPath] = useState('')

  // Stats
  const stats = useMemo(() => {
    const active = folders.filter(f => f.isActive).length
    const totalItems = folders.reduce((acc, f) => acc + f.itemCount, 0)
    const totalSize = folders.reduce((acc, f) => acc + f.totalSize, 0)
    const scanning = folders.some(f => f.status === 'scanning')
    const errors = folders.filter(f => f.status === 'error').length

    return { active, total: folders.length, totalItems, totalSize, scanning, errors }
  }, [folders])

  // Handle add folder
  const handleAddFolder = useCallback(async () => {
    if (!newFolderPath.trim()) return

    // In real app, would use electron dialog
    onAddFolder(newFolderPath.trim(), {
      recursive: true,
      autoImport: true,
      fileTypes: ['video', 'image']
    })

    setNewFolderPath('')
    setShowAddFolder(false)
  }, [newFolderPath, onAddFolder])

  // Browse for folder using Electron dialog
  const browseFolder = useCallback(async () => {
    const selected = await window.api.fs.chooseFolder({ title: 'Select Watch Folder' })
    if (selected) {
      setNewFolderPath(selected)
    }
  }, [])

  return (
    <div className={`bg-zinc-900/95 backdrop-blur-xl rounded-2xl border border-zinc-700 shadow-2xl overflow-hidden ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[var(--primary)]/20 flex items-center justify-center">
            <FolderSearch size={20} className="text-[var(--primary)]" />
          </div>
          <div>
            <h2 className="font-semibold">Watch Folders</h2>
            <p className="text-xs text-zinc-500">
              {stats.active} active • {stats.totalItems} items • {formatFileSize(stats.totalSize)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onScanAll}
            disabled={stats.scanning}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 transition text-sm disabled:opacity-50"
          >
            <RefreshCw size={14} className={stats.scanning ? 'animate-spin' : ''} />
            Scan All
          </button>
          <button
            onClick={() => setShowAddFolder(true)}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[var(--primary)] hover:bg-[var(--primary)]/80 transition text-sm"
          >
            <Plus size={14} />
            Add
          </button>
        </div>
      </div>

      {/* Add folder form */}
      {showAddFolder && (
        <div className="px-5 py-4 border-b border-zinc-800 bg-zinc-800/50">
          <div className="flex gap-2">
            <input
              type="text"
              value={newFolderPath}
              onChange={(e) => setNewFolderPath(e.target.value)}
              placeholder="Enter folder path or browse..."
              className="flex-1 px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-sm outline-none focus:border-[var(--primary)]"
              autoFocus
            />
            <button
              onClick={browseFolder}
              className="px-3 py-2 rounded-lg bg-zinc-700 hover:bg-zinc-600 transition"
            >
              <Folder size={16} />
            </button>
            <button
              onClick={handleAddFolder}
              disabled={!newFolderPath.trim()}
              className="px-4 py-2 rounded-lg bg-[var(--primary)] hover:bg-[var(--primary)]/80 transition disabled:opacity-50"
            >
              Add
            </button>
            <button
              onClick={() => setShowAddFolder(false)}
              className="px-3 py-2 rounded-lg bg-zinc-700 hover:bg-zinc-600 transition"
            >
              <X size={16} />
            </button>
          </div>
        </div>
      )}

      {/* Folders list */}
      <div className="max-h-[50vh] overflow-y-auto">
        {folders.length === 0 ? (
          <div className="py-12 text-center">
            <FolderPlus size={40} className="mx-auto mb-3 text-zinc-600" />
            <p className="text-zinc-500">No watch folders</p>
            <p className="text-xs text-zinc-600 mt-1">Add folders to auto-import new media</p>
          </div>
        ) : (
          <div className="divide-y divide-zinc-800/50">
            {folders.map(folder => (
              <WatchedFolderItem
                key={folder.id}
                folder={folder}
                isEditing={editingFolder === folder.id}
                onEdit={() => setEditingFolder(folder.id)}
                onStopEdit={() => setEditingFolder(null)}
                onUpdate={(updates) => onUpdateFolder(folder.id, updates)}
                onRemove={() => onRemoveFolder(folder.id)}
                onScan={() => onScanFolder(folder.id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Status bar */}
      {stats.errors > 0 && (
        <div className="px-5 py-2 border-t border-zinc-800 bg-red-500/10">
          <div className="flex items-center gap-2 text-xs text-red-400">
            <AlertCircle size={12} />
            {stats.errors} folder{stats.errors > 1 ? 's' : ''} with errors
          </div>
        </div>
      )}
    </div>
  )
}

// Individual folder item
function WatchedFolderItem({
  folder,
  isEditing,
  onEdit,
  onStopEdit,
  onUpdate,
  onRemove,
  onScan
}: {
  folder: WatchedFolder
  isEditing: boolean
  onEdit: () => void
  onStopEdit: () => void
  onUpdate: (updates: Partial<WatchedFolder>) => void
  onRemove: () => void
  onScan: () => void
}) {
  const [showSettings, setShowSettings] = useState(false)

  return (
    <div className={`${folder.status === 'error' ? 'bg-red-500/5' : ''}`}>
      <div className="flex items-center gap-3 px-5 py-3">
        {/* Status/icon */}
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
          folder.isActive ? 'bg-green-500/20' : 'bg-zinc-800'
        }`}>
          {folder.status === 'scanning' ? (
            <Loader2 size={18} className="text-[var(--primary)] animate-spin" />
          ) : folder.status === 'error' ? (
            <AlertCircle size={18} className="text-red-400" />
          ) : (
            <FolderOpen size={18} className={folder.isActive ? 'text-green-400' : 'text-zinc-500'} />
          )}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm truncate">{folder.name}</span>
            {folder.recursive && (
              <span className="px-1.5 py-0.5 rounded bg-zinc-800 text-[10px] text-zinc-500">
                Recursive
              </span>
            )}
            {folder.autoImport && (
              <span className="px-1.5 py-0.5 rounded bg-[var(--primary)]/20 text-[10px] text-[var(--primary)]">
                Auto
              </span>
            )}
          </div>
          <div className="text-xs text-zinc-500 truncate">{folder.path}</div>
          {folder.error && (
            <div className="text-xs text-red-400 mt-1">{folder.error}</div>
          )}
        </div>

        {/* Stats */}
        <div className="text-right text-xs text-zinc-500 flex-shrink-0">
          <div>{folder.itemCount} items</div>
          <div>{formatFileSize(folder.totalSize)}</div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            onClick={() => onUpdate({ isActive: !folder.isActive })}
            className={`p-2 rounded-lg transition ${
              folder.isActive ? 'text-green-400 hover:bg-green-500/20' : 'hover:bg-zinc-800'
            }`}
            title={folder.isActive ? 'Pause watching' : 'Start watching'}
          >
            {folder.isActive ? <Eye size={14} /> : <EyeOff size={14} />}
          </button>
          <button
            onClick={onScan}
            disabled={folder.status === 'scanning'}
            className="p-2 rounded-lg hover:bg-zinc-800 transition disabled:opacity-50"
            title="Scan now"
          >
            <RefreshCw size={14} className={folder.status === 'scanning' ? 'animate-spin' : ''} />
          </button>
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="p-2 rounded-lg hover:bg-zinc-800 transition"
            title="Settings"
          >
            <Settings size={14} />
          </button>
        </div>
      </div>

      {/* Settings panel */}
      {showSettings && (
        <div className="px-5 py-3 bg-zinc-800/50 border-t border-zinc-800/50">
          <div className="grid grid-cols-2 gap-4">
            {/* Options */}
            <div className="space-y-2">
              <label className="flex items-center justify-between text-sm">
                <span className="text-zinc-400">Recursive scan</span>
                <button
                  onClick={() => onUpdate({ recursive: !folder.recursive })}
                  className={`w-8 h-5 rounded-full transition ${
                    folder.recursive ? 'bg-[var(--primary)]' : 'bg-zinc-700'
                  }`}
                >
                  <div className={`w-3 h-3 rounded-full bg-white transform transition ${
                    folder.recursive ? 'translate-x-4' : 'translate-x-1'
                  }`} />
                </button>
              </label>
              <label className="flex items-center justify-between text-sm">
                <span className="text-zinc-400">Auto import</span>
                <button
                  onClick={() => onUpdate({ autoImport: !folder.autoImport })}
                  className={`w-8 h-5 rounded-full transition ${
                    folder.autoImport ? 'bg-[var(--primary)]' : 'bg-zinc-700'
                  }`}
                >
                  <div className={`w-3 h-3 rounded-full bg-white transform transition ${
                    folder.autoImport ? 'translate-x-4' : 'translate-x-1'
                  }`} />
                </button>
              </label>
            </div>

            {/* File types */}
            <div>
              <div className="text-xs text-zinc-500 mb-2">File types</div>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    const types = folder.fileTypes.includes('video')
                      ? folder.fileTypes.filter(t => t !== 'video')
                      : [...folder.fileTypes, 'video']
                    onUpdate({ fileTypes: types as ('video' | 'image')[] })
                  }}
                  className={`flex items-center gap-1 px-2 py-1 rounded text-xs transition ${
                    folder.fileTypes.includes('video')
                      ? 'bg-[var(--primary)] text-white'
                      : 'bg-zinc-700 text-zinc-400'
                  }`}
                >
                  <Film size={10} />
                  Videos
                </button>
                <button
                  onClick={() => {
                    const types = folder.fileTypes.includes('image')
                      ? folder.fileTypes.filter(t => t !== 'image')
                      : [...folder.fileTypes, 'image']
                    onUpdate({ fileTypes: types as ('video' | 'image')[] })
                  }}
                  className={`flex items-center gap-1 px-2 py-1 rounded text-xs transition ${
                    folder.fileTypes.includes('image')
                      ? 'bg-[var(--primary)] text-white'
                      : 'bg-zinc-700 text-zinc-400'
                  }`}
                >
                  <Image size={10} />
                  Images
                </button>
              </div>
            </div>
          </div>

          {/* Remove button */}
          <div className="mt-4 pt-3 border-t border-zinc-700/50 flex justify-between items-center">
            <span className="text-xs text-zinc-600">
              Last scan: {folder.lastScan ? formatDate(folder.lastScan) : 'Never'}
            </span>
            <button
              onClick={onRemove}
              className="flex items-center gap-1 px-2 py-1 rounded text-xs text-red-400 hover:bg-red-500/20 transition"
            >
              <Trash2 size={10} />
              Remove folder
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// Compact watch indicator for toolbar
export function WatchIndicator({
  activeCount,
  isScanning,
  onClick,
  className = ''
}: {
  activeCount: number
  isScanning: boolean
  onClick: () => void
  className?: string
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-3 py-1.5 rounded-full transition ${
        isScanning
          ? 'bg-[var(--primary)]/20'
          : activeCount > 0
          ? 'bg-green-500/20'
          : 'bg-zinc-800 hover:bg-zinc-700'
      } ${className}`}
      title={`${activeCount} folders being watched`}
    >
      {isScanning ? (
        <Loader2 size={14} className="text-[var(--primary)] animate-spin" />
      ) : (
        <FolderSync size={14} className={activeCount > 0 ? 'text-green-400' : 'text-zinc-500'} />
      )}
      <span className="text-xs">{activeCount}</span>
    </button>
  )
}

export default FolderWatcher
