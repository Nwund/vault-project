// File: src/renderer/components/ImportProgress.tsx
// Import progress tracker with queue and status

import React, { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Download,
  X,
  Check,
  AlertCircle,
  Pause,
  Play,
  Square,
  Folder,
  File,
  Film,
  Image,
  Clock,
  Loader2,
  ChevronDown,
  ChevronUp,
  Trash2,
  RefreshCw,
  SkipForward
} from 'lucide-react'
import { formatFileSize, formatDuration } from '../utils/formatters'

interface ImportItem {
  id: string
  path: string
  filename: string
  type: 'video' | 'image'
  size: number
  status: 'pending' | 'processing' | 'completed' | 'error' | 'skipped'
  progress: number // 0-100
  error?: string
  startedAt?: number
  completedAt?: number
}

interface ImportProgressProps {
  items: ImportItem[]
  isImporting: boolean
  onPause: () => void
  onResume: () => void
  onCancel: () => void
  onRetry: (itemId: string) => void
  onSkip: (itemId: string) => void
  onRemove: (itemId: string) => void
  onClearCompleted: () => void
  className?: string
}

export function ImportProgress({
  items,
  isImporting,
  onPause,
  onResume,
  onCancel,
  onRetry,
  onSkip,
  onRemove,
  onClearCompleted,
  className = ''
}: ImportProgressProps) {
  const [isExpanded, setIsExpanded] = useState(true)
  const [showCompleted, setShowCompleted] = useState(false)

  // Calculate stats
  const stats = useMemo(() => {
    const pending = items.filter(i => i.status === 'pending').length
    const processing = items.filter(i => i.status === 'processing').length
    const completed = items.filter(i => i.status === 'completed').length
    const errors = items.filter(i => i.status === 'error').length
    const skipped = items.filter(i => i.status === 'skipped').length

    const totalSize = items.reduce((acc, i) => acc + i.size, 0)
    const processedSize = items
      .filter(i => i.status === 'completed')
      .reduce((acc, i) => acc + i.size, 0)

    const overallProgress = items.length > 0
      ? Math.round(items.reduce((acc, i) => acc + i.progress, 0) / items.length)
      : 0

    return {
      pending,
      processing,
      completed,
      errors,
      skipped,
      total: items.length,
      totalSize,
      processedSize,
      overallProgress
    }
  }, [items])

  // Get current processing item
  const currentItem = useMemo(() =>
    items.find(i => i.status === 'processing'),
    [items]
  )

  // Filter items based on view
  const displayItems = useMemo(() => {
    if (showCompleted) {
      return items
    }
    return items.filter(i => i.status !== 'completed')
  }, [items, showCompleted])

  // Get status icon
  const getStatusIcon = (status: ImportItem['status']) => {
    switch (status) {
      case 'pending': return Clock
      case 'processing': return Loader2
      case 'completed': return Check
      case 'error': return AlertCircle
      case 'skipped': return SkipForward
    }
  }

  // Get status color
  const getStatusColor = (status: ImportItem['status']) => {
    switch (status) {
      case 'pending': return 'text-zinc-500'
      case 'processing': return 'text-[var(--primary)]'
      case 'completed': return 'text-green-400'
      case 'error': return 'text-red-400'
      case 'skipped': return 'text-yellow-400'
    }
  }

  if (items.length === 0) return null

  return (
    <div className={`bg-zinc-900/95 backdrop-blur-xl rounded-2xl border border-zinc-700 shadow-2xl overflow-hidden ${className}`}>
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-zinc-800/50 transition"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-3">
          <div className="relative w-10 h-10">
            <div className="w-full h-full rounded-xl bg-[var(--primary)]/20 flex items-center justify-center">
              {isImporting ? (
                <Loader2 size={18} className="text-[var(--primary)] animate-spin" />
              ) : (
                <Download size={18} className="text-[var(--primary)]" />
              )}
            </div>
            {/* Progress ring */}
            {isImporting && (
              <svg className="absolute inset-0 w-full h-full -rotate-90">
                <circle
                  cx="20"
                  cy="20"
                  r="18"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  className="text-zinc-800"
                />
                <circle
                  cx="20"
                  cy="20"
                  r="18"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeDasharray={`${stats.overallProgress * 1.13} 113`}
                  className="text-[var(--primary)]"
                />
              </svg>
            )}
          </div>
          <div>
            <div className="font-semibold text-sm">
              {isImporting ? 'Importing...' : 'Import Complete'}
            </div>
            <div className="text-xs text-zinc-500">
              {stats.completed}/{stats.total} files • {formatFileSize(stats.processedSize)} / {formatFileSize(stats.totalSize)}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Control buttons */}
          {isImporting && (
            <>
              <button
                onClick={(e) => { e.stopPropagation(); onPause() }}
                className="p-1.5 rounded-lg hover:bg-zinc-700 transition"
                title="Pause"
              >
                <Pause size={14} />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); onCancel() }}
                className="p-1.5 rounded-lg hover:bg-zinc-700 transition"
                title="Cancel"
              >
                <Square size={14} />
              </button>
            </>
          )}
          {!isImporting && stats.pending > 0 && (
            <button
              onClick={(e) => { e.stopPropagation(); onResume() }}
              className="p-1.5 rounded-lg hover:bg-zinc-700 transition"
              title="Resume"
            >
              <Play size={14} />
            </button>
          )}

          {/* Expand/collapse */}
          {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </div>
      </div>

      {/* Overall progress bar */}
      <div className="h-1 bg-zinc-800">
        <div
          className="h-full bg-[var(--primary)] transition-all duration-300"
          style={{ width: `${stats.overallProgress}%` }}
        />
      </div>

      {/* Expanded content */}
      {isExpanded && (
        <>
          {/* Stats row */}
          <div className="flex items-center gap-4 px-4 py-2 border-b border-zinc-800 text-xs">
            <span className="flex items-center gap-1 text-zinc-500">
              <Clock size={10} />
              {stats.pending} pending
            </span>
            <span className="flex items-center gap-1 text-green-400">
              <Check size={10} />
              {stats.completed} done
            </span>
            {stats.errors > 0 && (
              <span className="flex items-center gap-1 text-red-400">
                <AlertCircle size={10} />
                {stats.errors} failed
              </span>
            )}
            <div className="flex-1" />
            <label className="flex items-center gap-1 cursor-pointer">
              <input
                type="checkbox"
                checked={showCompleted}
                onChange={(e) => setShowCompleted(e.target.checked)}
                className="w-3 h-3 accent-[var(--primary)]"
              />
              Show completed
            </label>
            {stats.completed > 0 && (
              <button
                onClick={onClearCompleted}
                className="text-zinc-500 hover:text-white transition"
              >
                Clear completed
              </button>
            )}
          </div>

          {/* Current item */}
          {currentItem && (
            <div className="px-4 py-3 bg-[var(--primary)]/10 border-b border-zinc-800">
              <div className="flex items-center gap-3">
                <div className="p-1.5 rounded bg-zinc-800">
                  {currentItem.type === 'video' ? <Film size={14} /> : <Image size={14} />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm truncate">{currentItem.filename}</div>
                  <div className="flex items-center gap-2 text-xs text-zinc-500">
                    <span>{formatFileSize(currentItem.size)}</span>
                    <span>•</span>
                    <span>{currentItem.progress}%</span>
                  </div>
                </div>
                <button
                  onClick={() => onSkip(currentItem.id)}
                  className="p-1.5 rounded hover:bg-zinc-700 transition"
                  title="Skip"
                >
                  <SkipForward size={14} />
                </button>
              </div>
              {/* Item progress bar */}
              <div className="mt-2 h-1 bg-zinc-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-[var(--primary)] transition-all duration-200"
                  style={{ width: `${currentItem.progress}%` }}
                />
              </div>
            </div>
          )}

          {/* Items list */}
          <div className="max-h-64 overflow-y-auto">
            {displayItems.length === 0 ? (
              <div className="py-8 text-center text-zinc-500 text-sm">
                No items to display
              </div>
            ) : (
              <div className="divide-y divide-zinc-800/50">
                {displayItems.map(item => {
                  const StatusIcon = getStatusIcon(item.status)
                  const statusColor = getStatusColor(item.status)

                  return (
                    <div
                      key={item.id}
                      className={`flex items-center gap-3 px-4 py-2 ${
                        item.status === 'processing' ? 'bg-[var(--primary)]/5' : ''
                      }`}
                    >
                      {/* Type icon */}
                      <div className="p-1 rounded bg-zinc-800 flex-shrink-0">
                        {item.type === 'video' ? <Film size={12} /> : <Image size={12} />}
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="text-sm truncate">{item.filename}</div>
                        {item.error && (
                          <div className="text-xs text-red-400 truncate">{item.error}</div>
                        )}
                      </div>

                      {/* Size */}
                      <span className="text-xs text-zinc-600 flex-shrink-0">
                        {formatFileSize(item.size)}
                      </span>

                      {/* Status */}
                      <StatusIcon
                        size={14}
                        className={`flex-shrink-0 ${statusColor} ${
                          item.status === 'processing' ? 'animate-spin' : ''
                        }`}
                      />

                      {/* Actions */}
                      {item.status === 'error' && (
                        <button
                          onClick={() => onRetry(item.id)}
                          className="p-1 rounded hover:bg-zinc-700 transition"
                          title="Retry"
                        >
                          <RefreshCw size={12} />
                        </button>
                      )}
                      {item.status === 'pending' && (
                        <button
                          onClick={() => onRemove(item.id)}
                          className="p-1 rounded hover:bg-zinc-700 transition"
                          title="Remove"
                        >
                          <X size={12} />
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

// Mini import indicator for status bar
export function ImportIndicator({
  itemCount,
  progress,
  isImporting,
  onClick,
  className = ''
}: {
  itemCount: number
  progress: number
  isImporting: boolean
  onClick: () => void
  className?: string
}) {
  if (itemCount === 0) return null

  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-3 py-1.5 rounded-full transition ${
        isImporting
          ? 'bg-[var(--primary)]/20 text-[var(--primary)]'
          : 'bg-zinc-800 hover:bg-zinc-700'
      } ${className}`}
    >
      {isImporting ? (
        <Loader2 size={14} className="animate-spin" />
      ) : (
        <Download size={14} />
      )}
      <span className="text-xs font-medium">
        {isImporting ? `${progress}%` : `${itemCount} queued`}
      </span>
    </button>
  )
}

// Drop zone overlay for drag and drop import
export function ImportDropZone({
  isActive,
  className = ''
}: {
  isActive: boolean
  className?: string
}) {
  if (!isActive) return null

  return (
    <div className={`fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center ${className}`}>
      <div className="text-center">
        <div className="w-24 h-24 rounded-3xl bg-[var(--primary)]/20 flex items-center justify-center mx-auto mb-4 animate-pulse">
          <Download size={40} className="text-[var(--primary)]" />
        </div>
        <h2 className="text-xl font-bold mb-2">Drop to Import</h2>
        <p className="text-zinc-400">Release to add files to your library</p>
      </div>
    </div>
  )
}

export default ImportProgress
