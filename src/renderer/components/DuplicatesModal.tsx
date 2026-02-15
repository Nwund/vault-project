// File: src/renderer/components/DuplicatesModal.tsx
// Find and manage duplicate media files

import { useState, useEffect, useCallback } from 'react'
import { Copy, Trash2, Check, X, HardDrive, FileText, Hash, Loader2, ChevronDown, ChevronRight, FolderOpen, Eye } from 'lucide-react'
import { formatBytes } from '../utils/formatters'

interface DuplicateMedia {
  id: string
  filename: string
  path: string
  thumbPath?: string
  size: number
  addedAt: number
  rating?: number
  viewCount: number
}

interface DuplicateGroup {
  hash: string
  type: 'exact' | 'size' | 'name' | 'similar'
  mediaIds: string[]
  count: number
  totalSize: number
  savingsIfReduced: number
}

interface DuplicateScanResult {
  groups: DuplicateGroup[]
  totalDuplicates: number
  potentialSavings: number
  scanTime: number
}

interface DuplicatesModalProps {
  isOpen: boolean
  onClose: () => void
  onViewMedia: (mediaId: string) => void
}

type ScanType = 'exact' | 'size' | 'name'

export function DuplicatesModal({ isOpen, onClose, onViewMedia }: DuplicatesModalProps) {
  const [scanType, setScanType] = useState<ScanType>('size')
  const [isScanning, setIsScanning] = useState(false)
  const [scanResult, setScanResult] = useState<DuplicateScanResult | null>(null)
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())
  const [groupDetails, setGroupDetails] = useState<Map<string, DuplicateMedia[]>>(new Map())
  const [selectedForDeletion, setSelectedForDeletion] = useState<Set<string>>(new Set())
  const [keepSelected, setKeepSelected] = useState<Map<string, string>>(new Map()) // groupHash -> mediaId to keep
  const [stats, setStats] = useState<any>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  const loadStats = useCallback(async () => {
    try {
      const s = await window.api.invoke('duplicates:getStats')
      setStats(s)
    } catch (e) {
      console.error('Failed to load stats:', e)
    }
  }, [])

  useEffect(() => {
    if (isOpen) {
      loadStats()
    }
  }, [isOpen, loadStats])

  const handleScan = async () => {
    setIsScanning(true)
    setScanResult(null)
    setExpandedGroups(new Set())
    setGroupDetails(new Map())
    setSelectedForDeletion(new Set())
    setKeepSelected(new Map())

    try {
      let result: DuplicateScanResult
      switch (scanType) {
        case 'exact':
          result = await window.api.invoke('duplicates:findExact')
          break
        case 'size':
          result = await window.api.invoke('duplicates:findBySize')
          break
        case 'name':
          result = await window.api.invoke('duplicates:findByName')
          break
        default:
          result = await window.api.invoke('duplicates:findBySize')
      }
      setScanResult(result)

      // Auto-suggest keeps for all groups
      const keeps = new Map<string, string>()
      for (const group of result.groups) {
        const suggestion = await window.api.invoke('duplicates:suggestKeep', group.mediaIds)
        keeps.set(group.hash, suggestion.keepId)
      }
      setKeepSelected(keeps)
    } catch (e) {
      console.error('Failed to scan for duplicates:', e)
    } finally {
      setIsScanning(false)
    }
  }

  const toggleGroup = async (group: DuplicateGroup) => {
    const newExpanded = new Set(expandedGroups)
    if (newExpanded.has(group.hash)) {
      newExpanded.delete(group.hash)
    } else {
      newExpanded.add(group.hash)
      // Load details if not already loaded
      if (!groupDetails.has(group.hash)) {
        try {
          const details = await window.api.invoke('duplicates:getGroupDetails', group.mediaIds)
          setGroupDetails(new Map(groupDetails).set(group.hash, details))
        } catch (e) {
          console.error('Failed to load group details:', e)
        }
      }
    }
    setExpandedGroups(newExpanded)
  }

  const toggleSelection = (mediaId: string, groupHash: string) => {
    const keep = keepSelected.get(groupHash)
    if (mediaId === keep) return // Can't select the one we're keeping

    const newSelected = new Set(selectedForDeletion)
    if (newSelected.has(mediaId)) {
      newSelected.delete(mediaId)
    } else {
      newSelected.add(mediaId)
    }
    setSelectedForDeletion(newSelected)
  }

  const selectAllDuplicates = (group: DuplicateGroup) => {
    const keep = keepSelected.get(group.hash)
    const newSelected = new Set(selectedForDeletion)
    for (const id of group.mediaIds) {
      if (id !== keep) {
        newSelected.add(id)
      }
    }
    setSelectedForDeletion(newSelected)
  }

  const setKeep = (groupHash: string, mediaId: string) => {
    const newKeeps = new Map(keepSelected)
    newKeeps.set(groupHash, mediaId)
    setKeepSelected(newKeeps)

    // Remove from selection if it was selected for deletion
    const newSelected = new Set(selectedForDeletion)
    newSelected.delete(mediaId)
    setSelectedForDeletion(newSelected)
  }

  const handleDeleteSelected = async () => {
    if (selectedForDeletion.size === 0) return
    if (!confirm(`Delete ${selectedForDeletion.size} duplicate files? This cannot be undone.`)) return

    setIsDeleting(true)
    try {
      const resolution = {
        keep: '', // Not used when removing specific items
        remove: Array.from(selectedForDeletion),
        action: 'delete' as const
      }
      const result = await window.api.invoke('duplicates:resolve', resolution)
      if (result.success) {
        setSelectedForDeletion(new Set())
        handleScan() // Rescan
        loadStats()
      } else {
        alert(`Error: ${result.error}`)
      }
    } catch (e) {
      console.error('Failed to delete duplicates:', e)
    } finally {
      setIsDeleting(false)
    }
  }

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString()
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-zinc-900 rounded-xl shadow-2xl w-full max-w-4xl max-h-[85vh] flex flex-col border border-zinc-700">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-zinc-700">
          <div className="flex items-center gap-3">
            <Copy className="w-5 h-5 text-orange-400" />
            <h2 className="text-lg font-semibold text-white">Duplicate Finder</h2>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-zinc-700 rounded" title="Close">
            <X className="w-5 h-5 text-zinc-400" />
          </button>
        </div>

        {/* Stats Bar */}
        {stats && (
          <div className="flex items-center gap-6 px-4 py-2 bg-zinc-800/50 text-xs text-zinc-400 border-b border-zinc-800">
            <span>Total Media: {stats.totalMedia.toLocaleString()}</span>
            <span>Exact Duplicates: {stats.exactDuplicates}</span>
            <span>Same Size: {stats.sizeDuplicates}</span>
            <span>Same Name: {stats.nameDuplicates}</span>
            <span>Est. Savings: {formatBytes(stats.estimatedSavings)}</span>
          </div>
        )}

        {/* Scan Options */}
        <div className="flex items-center gap-4 p-4 border-b border-zinc-800">
          <span className="text-sm text-zinc-400">Scan by:</span>
          <div className="flex gap-2">
            <button
              onClick={() => setScanType('size')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm ${
                scanType === 'size' ? 'bg-blue-600' : 'bg-zinc-700 hover:bg-zinc-600'
              }`}
            >
              <HardDrive className="w-4 h-4" />
              File Size
            </button>
            <button
              onClick={() => setScanType('name')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm ${
                scanType === 'name' ? 'bg-blue-600' : 'bg-zinc-700 hover:bg-zinc-600'
              }`}
            >
              <FileText className="w-4 h-4" />
              Filename
            </button>
            <button
              onClick={() => setScanType('exact')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm ${
                scanType === 'exact' ? 'bg-blue-600' : 'bg-zinc-700 hover:bg-zinc-600'
              }`}
            >
              <Hash className="w-4 h-4" />
              Exact Hash
            </button>
          </div>
          <div className="flex-1" />
          <button
            onClick={handleScan}
            disabled={isScanning}
            className="flex items-center gap-2 px-4 py-2 bg-orange-600 hover:bg-orange-500 disabled:opacity-50 rounded-lg text-sm font-medium"
          >
            {isScanning ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Scanning...
              </>
            ) : (
              <>
                <Copy className="w-4 h-4" />
                Scan for Duplicates
              </>
            )}
          </button>
        </div>

        {/* Results */}
        <div className="flex-1 overflow-y-auto p-4">
          {!scanResult && !isScanning && (
            <div className="flex flex-col items-center justify-center h-48 text-zinc-500">
              <Copy className="w-16 h-16 mb-4 opacity-30" />
              <p className="text-lg">Select a scan type and click "Scan for Duplicates"</p>
              <p className="text-sm mt-2">
                {scanType === 'exact' && 'Exact hash scanning checks file content (slow but accurate)'}
                {scanType === 'size' && 'File size scanning is fast but may include false positives'}
                {scanType === 'name' && 'Filename scanning finds files with identical names'}
              </p>
            </div>
          )}

          {scanResult && scanResult.groups.length === 0 && (
            <div className="flex flex-col items-center justify-center h-48 text-zinc-500">
              <Check className="w-16 h-16 mb-4 text-green-500 opacity-50" />
              <p className="text-lg">No duplicates found!</p>
              <p className="text-sm mt-2">Scan completed in {scanResult.scanTime}ms</p>
            </div>
          )}

          {scanResult && scanResult.groups.length > 0 && (
            <div className="space-y-2">
              {/* Summary */}
              <div className="flex items-center justify-between mb-4 p-3 bg-zinc-800 rounded-lg">
                <div className="text-sm">
                  Found <span className="text-orange-400 font-bold">{scanResult.totalDuplicates}</span> duplicates in{' '}
                  <span className="font-bold">{scanResult.groups.length}</span> groups
                </div>
                <div className="text-sm">
                  Potential savings: <span className="text-green-400 font-bold">{formatBytes(scanResult.potentialSavings)}</span>
                </div>
              </div>

              {/* Groups */}
              {scanResult.groups.map((group) => {
                const isExpanded = expandedGroups.has(group.hash)
                const details = groupDetails.get(group.hash) || []
                const keepId = keepSelected.get(group.hash)

                return (
                  <div key={group.hash} className="border border-zinc-700 rounded-lg overflow-hidden">
                    {/* Group Header */}
                    <button
                      onClick={() => toggleGroup(group)}
                      className="w-full flex items-center gap-3 p-3 hover:bg-zinc-800 text-left"
                    >
                      {isExpanded ? (
                        <ChevronDown className="w-4 h-4 text-zinc-400" />
                      ) : (
                        <ChevronRight className="w-4 h-4 text-zinc-400" />
                      )}
                      <span className="flex-1 text-sm font-medium">
                        {group.count} files • {formatBytes(group.totalSize)}
                      </span>
                      <span className="text-xs text-zinc-500 px-2 py-0.5 bg-zinc-700 rounded">
                        {group.type}
                      </span>
                      <span className="text-xs text-green-400">
                        Save {formatBytes(group.savingsIfReduced)}
                      </span>
                      <button
                        onClick={(e) => { e.stopPropagation(); selectAllDuplicates(group) }}
                        className="px-2 py-1 text-xs bg-red-900/50 hover:bg-red-900 text-red-300 rounded"
                      >
                        Select All Dupes
                      </button>
                    </button>

                    {/* Group Details */}
                    {isExpanded && details.length > 0 && (
                      <div className="border-t border-zinc-700 p-2 space-y-1 bg-zinc-800/30">
                        {details.map((media) => {
                          const isKeep = media.id === keepId
                          const isSelected = selectedForDeletion.has(media.id)

                          return (
                            <div
                              key={media.id}
                              className={`flex items-center gap-3 p-2 rounded-lg ${
                                isKeep ? 'bg-green-900/30 border border-green-700' :
                                isSelected ? 'bg-red-900/30 border border-red-700' :
                                'hover:bg-zinc-700'
                              }`}
                            >
                              {/* Checkbox */}
                              <button
                                onClick={() => toggleSelection(media.id, group.hash)}
                                className={`w-5 h-5 rounded border-2 flex items-center justify-center ${
                                  isKeep ? 'border-green-500 bg-green-500 cursor-not-allowed' :
                                  isSelected ? 'border-red-500 bg-red-500' :
                                  'border-zinc-500 hover:border-zinc-400'
                                }`}
                                disabled={isKeep}
                                title={isKeep ? 'Keep this file' : isSelected ? 'Deselect for deletion' : 'Select for deletion'}
                              >
                                {(isKeep || isSelected) && <Check className="w-3 h-3" />}
                              </button>

                              {/* Thumbnail */}
                              <div className="w-16 h-10 bg-zinc-700 rounded overflow-hidden flex-shrink-0">
                                {media.thumbPath ? (
                                  <img
                                    src={`vault://${media.thumbPath}`}
                                    alt=""
                                    className="w-full h-full object-cover"
                                  />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center text-zinc-500">
                                    <FileText className="w-4 h-4" />
                                  </div>
                                )}
                              </div>

                              {/* Info */}
                              <div className="flex-1 min-w-0">
                                <p className="text-sm truncate">{media.filename}</p>
                                <p className="text-xs text-zinc-500 truncate">{media.path}</p>
                              </div>

                              {/* Stats */}
                              <div className="text-right text-xs text-zinc-400 flex-shrink-0">
                                <div>{formatBytes(media.size)}</div>
                                <div>{formatDate(media.addedAt)}</div>
                              </div>

                              {/* Rating/Views */}
                              <div className="text-right text-xs flex-shrink-0 w-16">
                                {media.rating && <div className="text-yellow-400">★ {media.rating}</div>}
                                <div className="text-zinc-500">{media.viewCount} views</div>
                              </div>

                              {/* Actions */}
                              <div className="flex items-center gap-1">
                                {isKeep ? (
                                  <span className="px-2 py-1 text-xs bg-green-700 text-green-100 rounded">KEEP</span>
                                ) : (
                                  <button
                                    onClick={() => setKeep(group.hash, media.id)}
                                    className="px-2 py-1 text-xs bg-zinc-700 hover:bg-green-700 rounded"
                                  >
                                    Keep
                                  </button>
                                )}
                                <button
                                  onClick={() => onViewMedia(media.id)}
                                  className="p-1 hover:bg-zinc-600 rounded"
                                  title="View"
                                >
                                  <Eye className="w-4 h-4 text-zinc-400" />
                                </button>
                                <button
                                  onClick={async () => {
                                    try {
                                      await window.api.invoke('shell:showItemInFolder', media.path)
                                    } catch (e) {
                                      console.error('Failed to show in folder:', e)
                                    }
                                  }}
                                  className="p-1 hover:bg-zinc-600 rounded"
                                  title="Show in folder"
                                >
                                  <FolderOpen className="w-4 h-4 text-zinc-400" />
                                </button>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        {scanResult && scanResult.groups.length > 0 && (
          <div className="flex items-center justify-between p-4 border-t border-zinc-700 bg-zinc-800/50">
            <div className="text-sm text-zinc-400">
              {selectedForDeletion.size} files selected for deletion
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setSelectedForDeletion(new Set())}
                disabled={selectedForDeletion.size === 0}
                className="px-4 py-2 text-zinc-400 hover:bg-zinc-700 disabled:opacity-50 rounded-lg text-sm"
              >
                Clear Selection
              </button>
              <button
                onClick={handleDeleteSelected}
                disabled={selectedForDeletion.size === 0 || isDeleting}
                className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-500 disabled:opacity-50 rounded-lg text-sm font-medium"
              >
                {isDeleting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Deleting...
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4" />
                    Delete Selected
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default DuplicatesModal
