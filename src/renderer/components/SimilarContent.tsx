// File: src/renderer/components/SimilarContent.tsx
// Visual similarity search panel - Find duplicates and similar content

import React, { useState, useEffect, useCallback } from 'react'
import {
  Search,
  Copy,
  Trash2,
  RefreshCw,
  ChevronRight,
  ChevronDown,
  Image,
  X,
  Loader2,
  HardDrive,
  AlertTriangle,
  Sparkles,
  Eye,
  Check
} from 'lucide-react'
import { toFileUrlCached } from '../hooks/usePerformance'
import { formatBytes } from '../utils/formatters'

interface SimilarMatch {
  mediaId: string
  filename: string
  thumbPath: string | null
  type: string
  similarity: number
  matchType: 'exact' | 'very_similar' | 'similar' | 'somewhat_similar'
}

interface SimilarityGroup {
  groupId: string
  items: SimilarMatch[]
  count: number
}

interface SimilarContentProps {
  mediaId?: string // If provided, show similar to this media
  onSelectMedia?: (mediaId: string) => void
  onClose?: () => void
  className?: string
}

export function SimilarContent({
  mediaId,
  onSelectMedia,
  onClose,
  className = ''
}: SimilarContentProps) {
  const [mode, setMode] = useState<'similar' | 'duplicates' | 'groups'>('similar')
  const [loading, setLoading] = useState(false)
  const [similarItems, setSimilarItems] = useState<SimilarMatch[]>([])
  const [duplicateGroups, setDuplicateGroups] = useState<SimilarityGroup[]>([])
  const [stats, setStats] = useState<{
    duplicateGroups: number
    totalDuplicates: number
    potentialSavingsBytes: number
  } | null>(null)
  const [hashStats, setHashStats] = useState<{
    totalMedia: number
    hashedMedia: number
    unhashed: number
    percentComplete: number
  } | null>(null)
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())
  const [isHashing, setIsHashing] = useState(false)

  // Load similar items when mediaId changes
  useEffect(() => {
    if (mediaId && mode === 'similar') {
      loadSimilar()
    }
  }, [mediaId, mode])

  // Load stats on mount
  useEffect(() => {
    loadStats()
    loadHashStats()
  }, [])

  const loadSimilar = useCallback(async () => {
    if (!mediaId) return
    setLoading(true)
    try {
      const items = await window.api.similar.find(mediaId, {
        minSimilarity: 60,
        limit: 30
      })
      setSimilarItems(items)
    } catch (e) {
      console.error('Failed to load similar items:', e)
    } finally {
      setLoading(false)
    }
  }, [mediaId])

  const loadDuplicates = useCallback(async () => {
    setLoading(true)
    try {
      const groups = await window.api.similar.findDuplicates()
      setDuplicateGroups(groups)
    } catch (e) {
      console.error('Failed to load duplicates:', e)
    } finally {
      setLoading(false)
    }
  }, [])

  const loadGroups = useCallback(async () => {
    setLoading(true)
    try {
      const groups = await window.api.similar.findAllGroups({
        minSimilarity: 85,
        minGroupSize: 2
      })
      setDuplicateGroups(groups)
    } catch (e) {
      console.error('Failed to load groups:', e)
    } finally {
      setLoading(false)
    }
  }, [])

  const loadStats = useCallback(async () => {
    try {
      const s = await window.api.similar.getStats()
      setStats(s)
    } catch (e) {
      console.error('Failed to load stats:', e)
    }
  }, [])

  const loadHashStats = useCallback(async () => {
    try {
      const s = await window.api.similar.getHashStats()
      setHashStats(s)
    } catch (e) {
      console.error('Failed to load hash stats:', e)
    }
  }, [])

  const handleComputeHashes = useCallback(async () => {
    setIsHashing(true)
    try {
      const result = await window.api.similar.batchComputeHashes(100)
      console.log(`Computed ${result.processed} hashes, ${result.failed} failed`)
      await loadHashStats()
    } catch (e) {
      console.error('Failed to compute hashes:', e)
    } finally {
      setIsHashing(false)
    }
  }, [loadHashStats])

  const handleModeChange = useCallback((newMode: 'similar' | 'duplicates' | 'groups') => {
    setMode(newMode)
    if (newMode === 'duplicates') {
      loadDuplicates()
    } else if (newMode === 'groups') {
      loadGroups()
    } else if (mediaId) {
      loadSimilar()
    }
  }, [loadDuplicates, loadGroups, loadSimilar, mediaId])

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

  const getSimilarityColor = (similarity: number): string => {
    if (similarity >= 98) return 'text-red-400'
    if (similarity >= 90) return 'text-orange-400'
    if (similarity >= 80) return 'text-yellow-400'
    return 'text-green-400'
  }

  const getMatchTypeLabel = (matchType: string): string => {
    switch (matchType) {
      case 'exact': return 'Exact'
      case 'very_similar': return 'Very Similar'
      case 'similar': return 'Similar'
      default: return 'Somewhat Similar'
    }
  }

  return (
    <div className={`bg-zinc-900/95 backdrop-blur-xl rounded-2xl border border-zinc-700 shadow-2xl overflow-hidden ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
        <div className="flex items-center gap-2">
          <Search size={18} className="text-[var(--primary)]" />
          <span className="font-semibold">Visual Similarity</span>
        </div>
        <div className="flex items-center gap-2">
          {onClose && (
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-zinc-800 transition"
            >
              <X size={16} />
            </button>
          )}
        </div>
      </div>

      {/* Mode tabs */}
      <div className="flex border-b border-zinc-800">
        <button
          onClick={() => handleModeChange('similar')}
          className={`flex-1 px-4 py-2.5 text-sm font-medium transition ${
            mode === 'similar'
              ? 'text-[var(--primary)] border-b-2 border-[var(--primary)]'
              : 'text-zinc-400 hover:text-white'
          }`}
          disabled={!mediaId}
        >
          <Sparkles size={14} className="inline mr-2" />
          Similar
        </button>
        <button
          onClick={() => handleModeChange('duplicates')}
          className={`flex-1 px-4 py-2.5 text-sm font-medium transition ${
            mode === 'duplicates'
              ? 'text-[var(--primary)] border-b-2 border-[var(--primary)]'
              : 'text-zinc-400 hover:text-white'
          }`}
        >
          <Copy size={14} className="inline mr-2" />
          Duplicates
        </button>
        <button
          onClick={() => handleModeChange('groups')}
          className={`flex-1 px-4 py-2.5 text-sm font-medium transition ${
            mode === 'groups'
              ? 'text-[var(--primary)] border-b-2 border-[var(--primary)]'
              : 'text-zinc-400 hover:text-white'
          }`}
        >
          <Image size={14} className="inline mr-2" />
          Groups
        </button>
      </div>

      {/* Stats bar */}
      {stats && (
        <div className="flex items-center justify-between px-4 py-2 bg-zinc-800/50 text-xs">
          <div className="flex items-center gap-4">
            <span className="text-zinc-400">
              <Copy size={12} className="inline mr-1" />
              {stats.duplicateGroups} duplicate groups
            </span>
            <span className="text-zinc-400">
              <AlertTriangle size={12} className="inline mr-1" />
              {stats.totalDuplicates} duplicates
            </span>
          </div>
          <span className="text-emerald-400 font-medium">
            <HardDrive size={12} className="inline mr-1" />
            {formatBytes(stats.potentialSavingsBytes)} saveable
          </span>
        </div>
      )}

      {/* Hash progress bar */}
      {hashStats && hashStats.percentComplete < 100 && (
        <div className="px-4 py-2 bg-amber-500/10 border-b border-zinc-800">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-amber-400">
              Hashing: {hashStats.hashedMedia} / {hashStats.totalMedia} ({hashStats.percentComplete}%)
            </span>
            <button
              onClick={handleComputeHashes}
              disabled={isHashing}
              className="text-xs text-amber-400 hover:text-amber-300 flex items-center gap-1"
            >
              {isHashing ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <RefreshCw size={12} />
              )}
              {isHashing ? 'Hashing...' : 'Compute'}
            </button>
          </div>
          <div className="h-1 bg-zinc-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-amber-500 transition-all"
              style={{ width: `${hashStats.percentComplete}%` }}
            />
          </div>
        </div>
      )}

      {/* Content */}
      <div className="max-h-[60vh] overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 size={24} className="animate-spin text-[var(--primary)]" />
          </div>
        ) : mode === 'similar' ? (
          // Similar items view
          <div className="p-4 space-y-2">
            {similarItems.length === 0 ? (
              <div className="text-center py-8 text-zinc-500">
                {mediaId ? 'No similar items found' : 'Select a media item to find similar'}
              </div>
            ) : (
              similarItems.map(item => (
                <SimilarItem
                  key={item.mediaId}
                  item={item}
                  onClick={() => onSelectMedia?.(item.mediaId)}
                />
              ))
            )}
          </div>
        ) : (
          // Duplicate groups view
          <div className="p-4 space-y-2">
            {duplicateGroups.length === 0 ? (
              <div className="text-center py-8 text-zinc-500">
                No duplicates found
              </div>
            ) : (
              duplicateGroups.map(group => (
                <div key={group.groupId} className="bg-zinc-800/50 rounded-xl overflow-hidden">
                  <button
                    onClick={() => toggleGroup(group.groupId)}
                    className="w-full flex items-center justify-between p-3 hover:bg-zinc-800 transition"
                  >
                    <div className="flex items-center gap-3">
                      {expandedGroups.has(group.groupId) ? (
                        <ChevronDown size={16} />
                      ) : (
                        <ChevronRight size={16} />
                      )}
                      <span className="font-medium">{group.count} items</span>
                      <span className="text-xs text-zinc-500">
                        {group.items[0]?.filename}
                      </span>
                    </div>
                    <span className={`text-sm ${getSimilarityColor(group.items[0]?.similarity || 0)}`}>
                      {group.items[0]?.similarity}%
                    </span>
                  </button>

                  {expandedGroups.has(group.groupId) && (
                    <div className="px-3 pb-3 space-y-2 border-t border-zinc-700">
                      {group.items.map((item, idx) => (
                        <SimilarItem
                          key={item.mediaId}
                          item={item}
                          onClick={() => onSelectMedia?.(item.mediaId)}
                          isFirst={idx === 0}
                        />
                      ))}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Footer actions */}
      <div className="flex items-center justify-between px-4 py-3 border-t border-zinc-800 bg-zinc-800/30">
        <button
          onClick={() => {
            if (mode === 'similar') loadSimilar()
            else if (mode === 'duplicates') loadDuplicates()
            else loadGroups()
          }}
          className="flex items-center gap-2 text-sm text-zinc-400 hover:text-white transition"
        >
          <RefreshCw size={14} />
          Refresh
        </button>
        {mode !== 'similar' && duplicateGroups.length > 0 && (
          <button className="flex items-center gap-2 px-3 py-1.5 bg-red-500/20 text-red-400 rounded-lg text-sm hover:bg-red-500/30 transition">
            <Trash2 size={14} />
            Clean Duplicates
          </button>
        )}
      </div>
    </div>
  )
}

// Similar item row component
function SimilarItem({
  item,
  onClick,
  isFirst = false
}: {
  item: SimilarMatch
  onClick?: () => void
  isFirst?: boolean
}) {
  const [thumbUrl, setThumbUrl] = useState('')

  useEffect(() => {
    if (item.thumbPath) {
      toFileUrlCached(item.thumbPath).then(setThumbUrl).catch(() => {})
    }
  }, [item.thumbPath])

  const getSimilarityColor = (similarity: number): string => {
    if (similarity >= 98) return 'text-red-400 bg-red-500/20'
    if (similarity >= 90) return 'text-orange-400 bg-orange-500/20'
    if (similarity >= 80) return 'text-yellow-400 bg-yellow-500/20'
    return 'text-green-400 bg-green-500/20'
  }

  return (
    <div
      className={`flex items-center gap-3 p-2 rounded-lg hover:bg-zinc-800 transition cursor-pointer ${
        isFirst ? 'bg-emerald-500/10 border border-emerald-500/30' : ''
      }`}
      onClick={onClick}
    >
      {/* Thumbnail */}
      <div className="relative w-16 h-10 bg-zinc-800 rounded overflow-hidden flex-shrink-0">
        {thumbUrl ? (
          <img src={thumbUrl} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-zinc-600">
            <Image size={16} />
          </div>
        )}
        {isFirst && (
          <div className="absolute top-0.5 left-0.5 px-1 bg-emerald-500 rounded text-[8px] font-bold">
            KEEP
          </div>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="text-sm text-white truncate">{item.filename}</div>
        <div className="flex items-center gap-2 text-[10px] text-zinc-500">
          <span className="capitalize">{item.type}</span>
          <span>•</span>
          <span>{item.matchType.replace('_', ' ')}</span>
        </div>
      </div>

      {/* Similarity badge */}
      <div className={`px-2 py-0.5 rounded-full text-xs font-medium ${getSimilarityColor(item.similarity)}`}>
        {item.similarity}%
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition">
        <button
          className="p-1.5 rounded hover:bg-zinc-700 transition"
          title="View"
          onClick={(e) => {
            e.stopPropagation()
            onClick?.()
          }}
        >
          <Eye size={14} />
        </button>
      </div>
    </div>
  )
}

// Quick "More Like This" button for media cards
export function MoreLikeThisButton({
  mediaId,
  onShowSimilar,
  className = ''
}: {
  mediaId: string
  onShowSimilar: (mediaId: string) => void
  className?: string
}) {
  const [count, setCount] = useState<number | null>(null)

  useEffect(() => {
    // Quick check for similar count
    window.api.similar.find(mediaId, { minSimilarity: 80, limit: 5 })
      .then(items => setCount(items.length))
      .catch(() => setCount(null))
  }, [mediaId])

  if (count === null || count === 0) return null

  return (
    <button
      onClick={(e) => {
        e.stopPropagation()
        onShowSimilar(mediaId)
      }}
      className={`flex items-center gap-1 px-2 py-1 bg-purple-500/20 text-purple-400 rounded text-xs hover:bg-purple-500/30 transition ${className}`}
      title={`${count} similar items`}
    >
      <Sparkles size={12} />
      {count}
    </button>
  )
}

export default SimilarContent
