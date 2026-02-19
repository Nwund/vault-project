// File: src/renderer/components/BackupRestorePanel.tsx
// Backup and restore UI component

import React, { useState, useEffect, useCallback } from 'react'
import {
  Download,
  Upload,
  Archive,
  Trash2,
  Calendar,
  HardDrive,
  Film,
  Tag,
  List,
  Check,
  AlertTriangle,
  Loader2,
  RefreshCw,
  Clock,
  Shield,
  Database,
  Settings,
  FolderOpen,
  X
} from 'lucide-react'
import { formatBytes } from '../utils/formatters'

interface BackupInfo {
  id: string
  filename: string
  path: string
  createdAt: number
  size: number
  mediaCount: number
  tagCount: number
  playlistCount: number
  version: string
  checksum: string
}

interface BackupRestorePanelProps {
  onClose?: () => void
  className?: string
}

export function BackupRestorePanel({
  onClose,
  className = ''
}: BackupRestorePanelProps) {
  const [backups, setBackups] = useState<BackupInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [restoring, setRestoring] = useState<string | null>(null)
  const [selectedBackup, setSelectedBackup] = useState<BackupInfo | null>(null)
  const [showRestoreConfirm, setShowRestoreConfirm] = useState(false)
  const [restoreOptions, setRestoreOptions] = useState({
    restoreDatabase: true,
    restoreSettings: true,
    mergeMode: 'merge' as 'merge' | 'replace'
  })
  const [status, setStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  const loadBackups = useCallback(async () => {
    setLoading(true)
    try {
      const list = await window.api.invoke<BackupInfo[]>('backup:list')
      setBackups(list)
    } catch (e) {
      console.error('Failed to load backups:', e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadBackups()
  }, [loadBackups])

  const handleCreateBackup = useCallback(async () => {
    setCreating(true)
    setStatus(null)
    try {
      const backup = await window.api.invoke<BackupInfo>('backup:create', {
        includeDatabase: true,
        includeSettings: true
      })
      setBackups(prev => [backup, ...prev])
      setStatus({ type: 'success', message: `Backup created: ${backup.filename}` })
    } catch (e: any) {
      setStatus({ type: 'error', message: `Failed to create backup: ${e.message}` })
    } finally {
      setCreating(false)
    }
  }, [])

  const handleRestore = useCallback(async () => {
    if (!selectedBackup) return
    setRestoring(selectedBackup.id)
    setShowRestoreConfirm(false)
    setStatus(null)

    try {
      const result = await window.api.invoke<{
        success: boolean
        restored: { media: number; tags: number; playlists: number }
        errors: string[]
      }>('backup:restore', selectedBackup.path, restoreOptions)

      if (result.success) {
        setStatus({
          type: 'success',
          message: `Restored: ${result.restored.media} media, ${result.restored.tags} tags, ${result.restored.playlists} playlists`
        })
      } else {
        setStatus({ type: 'error', message: `Restore failed with ${result.errors.length} errors` })
      }
    } catch (e: any) {
      setStatus({ type: 'error', message: `Restore failed: ${e.message}` })
    } finally {
      setRestoring(null)
      setSelectedBackup(null)
    }
  }, [selectedBackup, restoreOptions])

  const handleDelete = useCallback(async (backup: BackupInfo) => {
    try {
      await window.api.invoke('backup:delete', backup.id)
      setBackups(prev => prev.filter(b => b.id !== backup.id))
    } catch (e: any) {
      setStatus({ type: 'error', message: `Failed to delete backup: ${e.message}` })
    }
  }, [])

  const handleExportToFile = useCallback(async (backup: BackupInfo) => {
    try {
      await window.api.invoke('backup:exportToFile', backup.path)
      setStatus({ type: 'success', message: 'Backup exported successfully' })
    } catch (e: any) {
      setStatus({ type: 'error', message: `Export failed: ${e.message}` })
    }
  }, [])

  const handleImportFromFile = useCallback(async () => {
    try {
      const result = await window.api.invoke<{ success: boolean; backup?: BackupInfo }>('backup:importFromFile')
      if (result.success && result.backup) {
        setBackups(prev => [result.backup!, ...prev])
        setStatus({ type: 'success', message: 'Backup imported successfully' })
      }
    } catch (e: any) {
      setStatus({ type: 'error', message: `Import failed: ${e.message}` })
    }
  }, [])

  return (
    <div className={`bg-zinc-900/95 backdrop-blur-xl rounded-2xl border border-zinc-700 shadow-2xl overflow-hidden ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[var(--primary)]/20 flex items-center justify-center">
            <Archive size={20} className="text-[var(--primary)]" />
          </div>
          <div>
            <h2 className="font-semibold">Backup & Restore</h2>
            <p className="text-xs text-zinc-400">Protect your library data</p>
          </div>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-zinc-800 transition"
          >
            <X size={18} />
          </button>
        )}
      </div>

      {/* Status message */}
      {status && (
        <div
          className={`mx-5 mt-4 p-3 rounded-lg flex items-center gap-2 ${
            status.type === 'success'
              ? 'bg-emerald-500/20 text-emerald-400'
              : 'bg-red-500/20 text-red-400'
          }`}
        >
          {status.type === 'success' ? <Check size={16} /> : <AlertTriangle size={16} />}
          <span className="text-sm">{status.message}</span>
        </div>
      )}

      {/* Actions */}
      <div className="p-5 grid grid-cols-2 gap-3">
        <button
          onClick={handleCreateBackup}
          disabled={creating}
          className="flex items-center justify-center gap-2 px-4 py-3 bg-[var(--primary)] text-white rounded-xl font-medium hover:opacity-90 transition disabled:opacity-50"
        >
          {creating ? (
            <Loader2 size={18} className="animate-spin" />
          ) : (
            <Download size={18} />
          )}
          {creating ? 'Creating...' : 'Create Backup'}
        </button>
        <button
          onClick={handleImportFromFile}
          className="flex items-center justify-center gap-2 px-4 py-3 bg-zinc-800 text-white rounded-xl font-medium hover:bg-zinc-700 transition"
        >
          <Upload size={18} />
          Import Backup
        </button>
      </div>

      {/* Backup list */}
      <div className="px-5 pb-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium text-zinc-400">Saved Backups</h3>
          <button
            onClick={loadBackups}
            className="p-1 rounded hover:bg-zinc-800 transition"
            title="Refresh"
          >
            <RefreshCw size={14} className="text-zinc-500" />
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 size={24} className="animate-spin text-zinc-500" />
          </div>
        ) : backups.length === 0 ? (
          <div className="text-center py-8 text-zinc-500">
            <Archive size={32} className="mx-auto mb-2 opacity-50" />
            <p className="text-sm">No backups yet</p>
            <p className="text-xs mt-1">Create your first backup to protect your data</p>
          </div>
        ) : (
          <div className="space-y-2 max-h-[40vh] overflow-y-auto">
            {backups.map(backup => (
              <div
                key={backup.id}
                className={`p-3 rounded-xl border transition ${
                  selectedBackup?.id === backup.id
                    ? 'border-[var(--primary)] bg-[var(--primary)]/10'
                    : 'border-zinc-800 bg-zinc-800/50 hover:border-zinc-700'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div
                    className="flex-1 cursor-pointer"
                    onClick={() => setSelectedBackup(backup)}
                  >
                    <div className="flex items-center gap-2">
                      <Database size={14} className="text-zinc-400" />
                      <span className="text-sm font-medium">
                        {new Date(backup.createdAt).toLocaleDateString()}
                      </span>
                      <span className="text-xs text-zinc-500">
                        {new Date(backup.createdAt).toLocaleTimeString()}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 mt-2 text-xs text-zinc-400">
                      <span className="flex items-center gap-1">
                        <Film size={12} />
                        {backup.mediaCount}
                      </span>
                      <span className="flex items-center gap-1">
                        <Tag size={12} />
                        {backup.tagCount}
                      </span>
                      <span className="flex items-center gap-1">
                        <List size={12} />
                        {backup.playlistCount}
                      </span>
                      <span className="flex items-center gap-1">
                        <HardDrive size={12} />
                        {formatBytes(backup.size)}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1">
                    {restoring === backup.id ? (
                      <Loader2 size={16} className="animate-spin text-zinc-400" />
                    ) : (
                      <>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            setSelectedBackup(backup)
                            setShowRestoreConfirm(true)
                          }}
                          className="p-1.5 rounded-lg hover:bg-zinc-700 transition"
                          title="Restore"
                        >
                          <Upload size={14} className="text-zinc-400" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            handleExportToFile(backup)
                          }}
                          className="p-1.5 rounded-lg hover:bg-zinc-700 transition"
                          title="Export to file"
                        >
                          <FolderOpen size={14} className="text-zinc-400" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            handleDelete(backup)
                          }}
                          className="p-1.5 rounded-lg hover:bg-red-500/20 transition"
                          title="Delete"
                        >
                          <Trash2 size={14} className="text-zinc-400 hover:text-red-400" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Restore confirmation modal */}
      {showRestoreConfirm && selectedBackup && (
        <div className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center">
          <div className="bg-zinc-900 rounded-2xl border border-zinc-700 shadow-2xl w-full max-w-md mx-4">
            <div className="p-5 border-b border-zinc-800">
              <h3 className="font-semibold">Restore Backup</h3>
              <p className="text-sm text-zinc-400 mt-1">
                Restore from {new Date(selectedBackup.createdAt).toLocaleString()}
              </p>
            </div>

            <div className="p-5 space-y-4">
              {/* Options */}
              <div className="space-y-3">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={restoreOptions.restoreDatabase}
                    onChange={e => setRestoreOptions(prev => ({ ...prev, restoreDatabase: e.target.checked }))}
                    className="rounded border-zinc-600 bg-zinc-800 text-[var(--primary)] focus:ring-[var(--primary)]"
                  />
                  <div className="flex items-center gap-2">
                    <Database size={16} className="text-zinc-400" />
                    <span>Restore media, tags, playlists</span>
                  </div>
                </label>

                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={restoreOptions.restoreSettings}
                    onChange={e => setRestoreOptions(prev => ({ ...prev, restoreSettings: e.target.checked }))}
                    className="rounded border-zinc-600 bg-zinc-800 text-[var(--primary)] focus:ring-[var(--primary)]"
                  />
                  <div className="flex items-center gap-2">
                    <Settings size={16} className="text-zinc-400" />
                    <span>Restore settings</span>
                  </div>
                </label>
              </div>

              {/* Merge mode */}
              <div className="pt-3 border-t border-zinc-800">
                <label className="block text-sm font-medium mb-2">Conflict Resolution</label>
                <div className="flex gap-2">
                  <button
                    onClick={() => setRestoreOptions(prev => ({ ...prev, mergeMode: 'merge' }))}
                    className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition ${
                      restoreOptions.mergeMode === 'merge'
                        ? 'bg-[var(--primary)] text-white'
                        : 'bg-zinc-800 text-zinc-400 hover:text-white'
                    }`}
                  >
                    Merge (Safe)
                  </button>
                  <button
                    onClick={() => setRestoreOptions(prev => ({ ...prev, mergeMode: 'replace' }))}
                    className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition ${
                      restoreOptions.mergeMode === 'replace'
                        ? 'bg-red-500 text-white'
                        : 'bg-zinc-800 text-zinc-400 hover:text-white'
                    }`}
                  >
                    Replace All
                  </button>
                </div>
                <p className="text-xs text-zinc-500 mt-2">
                  {restoreOptions.mergeMode === 'merge'
                    ? 'Keeps existing data, only adds missing items'
                    : 'Replaces all existing data with backup'}
                </p>
              </div>

              {/* Warning */}
              <div className="flex items-start gap-2 p-3 bg-amber-500/10 rounded-lg text-amber-400">
                <AlertTriangle size={16} className="flex-shrink-0 mt-0.5" />
                <p className="text-xs">
                  {restoreOptions.mergeMode === 'replace'
                    ? 'Warning: This will overwrite your current library data!'
                    : 'Existing items will be preserved. New items from backup will be added.'}
                </p>
              </div>
            </div>

            <div className="flex gap-3 p-5 border-t border-zinc-800">
              <button
                onClick={() => setShowRestoreConfirm(false)}
                className="flex-1 px-4 py-2.5 bg-zinc-800 rounded-xl font-medium hover:bg-zinc-700 transition"
              >
                Cancel
              </button>
              <button
                onClick={handleRestore}
                className="flex-1 px-4 py-2.5 bg-[var(--primary)] text-white rounded-xl font-medium hover:opacity-90 transition"
              >
                Restore
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// Quick backup button for toolbar
export function QuickBackupButton({ className = '' }: { className?: string }) {
  const [lastBackup, setLastBackup] = useState<number | null>(null)

  useEffect(() => {
    window.api.invoke<BackupInfo[]>('backup:list')
      .then(backups => {
        if (backups.length > 0) {
          setLastBackup(backups[0].createdAt)
        }
      })
      .catch(() => {})
  }, [])

  const handleQuickBackup = async () => {
    try {
      await window.api.invoke('backup:create')
      setLastBackup(Date.now())
    } catch (e) {
      console.error('Quick backup failed:', e)
    }
  }

  const daysSinceLastBackup = lastBackup
    ? Math.floor((Date.now() - lastBackup) / (1000 * 60 * 60 * 24))
    : null

  return (
    <button
      onClick={handleQuickBackup}
      className={`flex items-center gap-2 px-3 py-1.5 rounded-lg transition ${
        daysSinceLastBackup !== null && daysSinceLastBackup > 7
          ? 'bg-amber-500/20 text-amber-400 hover:bg-amber-500/30'
          : 'bg-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-700'
      } ${className}`}
      title={lastBackup ? `Last backup: ${new Date(lastBackup).toLocaleDateString()}` : 'No backups yet'}
    >
      <Shield size={14} />
      <span className="text-xs">Backup</span>
      {daysSinceLastBackup !== null && daysSinceLastBackup > 7 && (
        <span className="text-[10px] px-1.5 py-0.5 bg-amber-500 text-white rounded">
          {daysSinceLastBackup}d ago
        </span>
      )}
    </button>
  )
}

export default BackupRestorePanel
