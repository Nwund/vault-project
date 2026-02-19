// File: src/renderer/components/DuplicateFinder.tsx
// Find and manage duplicate media files

import React, { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Copy,
  Trash2,
  Check,
  X,
  Search,
  Filter,
  Image,
  Film,
  HardDrive,
  Calendar,
  Eye,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Loader2,
  RefreshCw,
  Merge,
  Star,
  Heart
} from 'lucide-react'
import { formatFileSize, formatDate, formatDuration } from '../utils/formatters'

interface DuplicateItem {
  id: string
  path: string
  filename: string
  type: 'video' | 'image'
  thumbnail?: string
  fileSize: number
  duration?: number
  width?: number
  height?: number
  rating?: number
  isFavorite?: boolean
  viewCount?: number
  createdAt: number
}

interface DuplicateGroup {
  id: string
  hash: string
  items: DuplicateItem[]
  similarity: number // 0-100
  totalSize: number
  potentialSavings: number
}

interface DuplicateFinderProps {
  onScan: () => Promise<DuplicateGroup[]>
  onDelete: (ids: string[]) => Promise<void>
  onKeepBest: (groupId: string) => Promise<void>
  onMerge: (groupId: string, keepId: string) => Promise<void>
  className?: string
}

export function DuplicateFinder({
  onScan,
  onDelete,
  onKeepBest,
  onMerge,
  className = ''
}: DuplicateFinderProps) {
  const [groups, setGroups] = useState<DuplicateGroup[]>([])
  const [isScanning, setIsScanning] = useState(false)
  const [scanProgress, setScanProgress] = useState(0)
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set())
  const [filter, setFilter] = useState<'all' | 'exact' | 'similar'>('all')
  const [sortBy, setSortBy] = useState<'size' | 'count' | 'similarity'>('size')

  // Stats
  const stats = useMemo(() => {
    const totalGroups = groups.length
    const totalDuplicates = groups.reduce((acc, g) => acc + g.items.length - 1, 0)
    const totalSavings = groups.reduce((acc, g) => acc + g.potentialSavings, 0)
    const exactMatches = groups.filter(g => g.similarity === 100).length
    const similarMatches = groups.filter(g => g.similarity < 100).length

    return { totalGroups, totalDuplicates, totalSavings, exactMatches, similarMatches }
  }, [groups])

  // Filter groups
  const filteredGroups = useMemo(() => {
    let result = [...groups]

    if (filter === 'exact') {
      result = result.filter(g => g.similarity === 100)
    } else if (filter === 'similar') {
      result = result.filter(g => g.similarity < 100)
    }

    result.sort((a, b) => {
      switch (sortBy) {
        case 'size': return b.potentialSavings - a.potentialSavings
        case 'count': return b.items.length - a.items.length
        case 'similarity': return b.similarity - a.similarity
        default: return 0
      }
    })

    return result
  }, [groups, filter, sortBy])

  // Run scan
  const handleScan = useCallback(async () => {
    setIsScanning(true)
    setScanProgress(0)

    try {
      const result = await onScan()
      setGroups(result)
    } catch (e) {
      console.error('Scan failed:', e)
    } finally {
      setIsScanning(false)
    }
  }, [onScan])

  // Toggle group expansion
  const toggleGroup = useCallback((groupId: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev)
      if (next.has(groupId)) {
        next.delete(groupId)
      } else {
        next.add(groupId)
      }
      return next
    })
  }, [])

  // Select item
  const toggleSelect = useCallback((itemId: string) => {
    setSelectedItems(prev => {
      const next = new Set(prev)
      if (next.has(itemId)) {
        next.delete(itemId)
      } else {
        next.add(itemId)
      }
      return next
    })
  }, [])

  // Delete selected
  const deleteSelected = useCallback(async () => {
    if (selectedItems.size === 0) return
    await onDelete(Array.from(selectedItems))
    setSelectedItems(new Set())
    handleScan() // Refresh
  }, [selectedItems, onDelete, handleScan])

  // Keep best in group
  const handleKeepBest = useCallback(async (groupId: string) => {
    await onKeepBest(groupId)
    handleScan()
  }, [onKeepBest, handleScan])

  // Get best item in group (highest rating, most views, etc.)
  const getBestItem = useCallback((group: DuplicateGroup) => {
    return group.items.reduce((best, item) => {
      const score = (item.rating || 0) * 10 + (item.viewCount || 0) + (item.isFavorite ? 50 : 0)
      const bestScore = (best.rating || 0) * 10 + (best.viewCount || 0) + (best.isFavorite ? 50 : 0)
      return score > bestScore ? item : best
    })
  }, [])

  return (
    <div className={`bg-zinc-900/95 backdrop-blur-xl rounded-2xl border border-zinc-700 shadow-2xl overflow-hidden ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-orange-500/20 flex items-center justify-center">
            <Copy size={20} className="text-orange-400" />
          </div>
          <div>
            <h2 className="font-semibold">Duplicate Finder</h2>
            <p className="text-xs text-zinc-500">
              {stats.totalGroups} groups • {stats.totalDuplicates} duplicates • {formatFileSize(stats.totalSavings)} recoverable
            </p>
          </div>
        </div>
        <button
          onClick={handleScan}
          disabled={isScanning}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--primary)] hover:bg-[var(--primary)]/80 transition disabled:opacity-50"
        >
          {isScanning ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <RefreshCw size={16} />
          )}
          {isScanning ? 'Scanning...' : 'Scan'}
        </button>
      </div>

      {/* Progress bar */}
      {isScanning && (
        <div className="h-1 bg-zinc-800">
          <div
            className="h-full bg-[var(--primary)] transition-all duration-300"
            style={{ width: `${scanProgress}%` }}
          />
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-4 px-5 py-3 border-b border-zinc-800">
        <div className="flex items-center gap-2">
          <Filter size={14} className="text-zinc-500" />
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as any)}
            className="bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1 text-sm"
          >
            <option value="all">All ({stats.totalGroups})</option>
            <option value="exact">Exact ({stats.exactMatches})</option>
            <option value="similar">Similar ({stats.similarMatches})</option>
          </select>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-zinc-500">Sort:</span>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1 text-sm"
          >
            <option value="size">Size savings</option>
            <option value="count">Duplicate count</option>
            <option value="similarity">Similarity</option>
          </select>
        </div>
        <div className="flex-1" />
        {selectedItems.size > 0 && (
          <button
            onClick={deleteSelected}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30 transition text-sm"
          >
            <Trash2 size={14} />
            Delete Selected ({selectedItems.size})
          </button>
        )}
      </div>

      {/* Groups list */}
      <div className="max-h-[60vh] overflow-y-auto">
        {filteredGroups.length === 0 ? (
          <div className="py-16 text-center">
            {isScanning ? (
              <>
                <Loader2 size={40} className="mx-auto mb-3 text-zinc-600 animate-spin" />
                <p className="text-zinc-500">Scanning for duplicates...</p>
              </>
            ) : groups.length === 0 ? (
              <>
                <Copy size={40} className="mx-auto mb-3 text-zinc-600" />
                <p className="text-zinc-500">No duplicates found</p>
                <p className="text-xs text-zinc-600 mt-1">Click Scan to search for duplicate files</p>
              </>
            ) : (
              <>
                <Filter size={40} className="mx-auto mb-3 text-zinc-600" />
                <p className="text-zinc-500">No matching duplicates</p>
              </>
            )}
          </div>
        ) : (
          <div className="divide-y divide-zinc-800/50">
            {filteredGroups.map(group => (
              <DuplicateGroupItem
                key={group.id}
                group={group}
                isExpanded={expandedGroups.has(group.id)}
                selectedItems={selectedItems}
                bestItem={getBestItem(group)}
                onToggle={() => toggleGroup(group.id)}
                onSelectItem={toggleSelect}
                onKeepBest={() => handleKeepBest(group.id)}
                onMerge={(keepId) => onMerge(group.id, keepId)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      {stats.totalSavings > 0 && (
        <div className="px-5 py-3 border-t border-zinc-800 bg-orange-500/5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm">
              <AlertTriangle size={14} className="text-orange-400" />
              <span className="text-orange-400">
                Potential space savings: {formatFileSize(stats.totalSavings)}
              </span>
            </div>
            <button
              onClick={() => {/* Auto cleanup */}}
              className="text-xs text-zinc-500 hover:text-white transition"
            >
              Auto cleanup (keep highest rated)
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// Duplicate group item
function DuplicateGroupItem({
  group,
  isExpanded,
  selectedItems,
  bestItem,
  onToggle,
  onSelectItem,
  onKeepBest,
  onMerge
}: {
  group: DuplicateGroup
  isExpanded: boolean
  selectedItems: Set<string>
  bestItem: DuplicateItem
  onToggle: () => void
  onSelectItem: (id: string) => void
  onKeepBest: () => void
  onMerge: (keepId: string) => void
}) {
  const firstItem = group.items[0]

  return (
    <div>
      {/* Group header */}
      <div
        className="flex items-center gap-3 px-5 py-3 cursor-pointer hover:bg-zinc-800/50 transition"
        onClick={onToggle}
      >
        {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}

        {/* Thumbnail */}
        <div className="w-12 h-12 rounded-lg bg-zinc-800 overflow-hidden flex-shrink-0">
          {firstItem.thumbnail ? (
            <img src={firstItem.thumbnail} alt="" className="w-full h-full object-cover" />
          ) : firstItem.type === 'video' ? (
            <Film size={20} className="w-full h-full p-3 text-zinc-600" />
          ) : (
            <Image size={20} className="w-full h-full p-3 text-zinc-600" />
          )}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm truncate">{firstItem.filename}</span>
            <span className={`px-1.5 py-0.5 rounded text-[10px] ${
              group.similarity === 100
                ? 'bg-red-500/20 text-red-400'
                : 'bg-yellow-500/20 text-yellow-400'
            }`}>
              {group.similarity === 100 ? 'Exact' : `${group.similarity}% similar`}
            </span>
          </div>
          <div className="text-xs text-zinc-500">
            {group.items.length} copies • Save {formatFileSize(group.potentialSavings)}
          </div>
        </div>

        {/* Quick actions */}
        <button
          onClick={(e) => { e.stopPropagation(); onKeepBest() }}
          className="flex items-center gap-1 px-2 py-1 rounded text-xs bg-green-500/20 text-green-400 hover:bg-green-500/30 transition"
        >
          <Check size={10} />
          Keep Best
        </button>
      </div>

      {/* Expanded items */}
      {isExpanded && (
        <div className="px-5 pb-3 space-y-2">
          {group.items.map(item => {
            const isBest = item.id === bestItem.id
            const isSelected = selectedItems.has(item.id)

            return (
              <div
                key={item.id}
                className={`flex items-center gap-3 p-2 rounded-lg ${
                  isBest ? 'bg-green-500/10 border border-green-500/30' : 'bg-zinc-800/50'
                }`}
              >
                {/* Select checkbox */}
                <button
                  onClick={() => onSelectItem(item.id)}
                  className={`w-5 h-5 rounded border-2 flex items-center justify-center transition ${
                    isSelected
                      ? 'bg-red-500 border-red-500'
                      : 'border-zinc-600 hover:border-zinc-400'
                  }`}
                >
                  {isSelected && <Trash2 size={10} className="text-white" />}
                </button>

                {/* Thumbnail */}
                <div className="w-10 h-10 rounded bg-zinc-700 overflow-hidden flex-shrink-0">
                  {item.thumbnail ? (
                    <img src={item.thumbnail} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      {item.type === 'video' ? <Film size={14} /> : <Image size={14} />}
                    </div>
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="text-sm truncate">{item.filename}</div>
                  <div className="flex items-center gap-3 text-[10px] text-zinc-500">
                    <span>{formatFileSize(item.fileSize)}</span>
                    {item.width && item.height && <span>{item.width}×{item.height}</span>}
                    {item.duration && <span>{formatDuration(item.duration)}</span>}
                  </div>
                </div>

                {/* Stats */}
                <div className="flex items-center gap-2 text-xs">
                  {item.rating && (
                    <span className="flex items-center gap-0.5 text-yellow-400">
                      <Star size={10} className="fill-current" />
                      {item.rating}
                    </span>
                  )}
                  {item.isFavorite && <Heart size={10} className="text-red-400 fill-current" />}
                  {item.viewCount !== undefined && (
                    <span className="flex items-center gap-0.5 text-zinc-500">
                      <Eye size={10} />
                      {item.viewCount}
                    </span>
                  )}
                </div>

                {/* Best badge */}
                {isBest && (
                  <span className="px-1.5 py-0.5 rounded bg-green-500/20 text-green-400 text-[10px]">
                    Best
                  </span>
                )}

                {/* Keep button */}
                {!isBest && (
                  <button
                    onClick={() => onMerge(item.id)}
                    className="px-2 py-1 rounded text-xs bg-zinc-700 hover:bg-zinc-600 transition"
                  >
                    Keep This
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// Compact duplicate indicator
export function DuplicateIndicator({
  count,
  onClick,
  className = ''
}: {
  count: number
  onClick: () => void
  className?: string
}) {
  if (count === 0) return null

  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1 px-2 py-1 rounded-full bg-orange-500/20 text-orange-400 hover:bg-orange-500/30 transition text-xs ${className}`}
    >
      <Copy size={12} />
      {count} duplicates
    </button>
  )
}

export default DuplicateFinder
