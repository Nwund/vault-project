// File: src/renderer/components/BatchActions.tsx
// Bulk operations panel for multiple selected media items

import React, { useState, useCallback, useMemo } from 'react'
import {
  Trash2,
  Heart,
  HeartOff,
  Tag,
  ListPlus,
  Clock,
  Eye,
  EyeOff,
  Star,
  Download,
  FolderOpen,
  Copy,
  X,
  CheckSquare,
  Square,
  AlertTriangle,
  Loader2,
  Check
} from 'lucide-react'

interface BatchActionsProps {
  selectedIds: string[]
  totalCount: number
  onSelectAll: () => void
  onDeselectAll: () => void
  onAction: (action: string, data?: any) => Promise<void>
  onClose: () => void
  className?: string
}

interface ActionState {
  loading: boolean
  success: boolean
  error: string | null
}

export function BatchActions({
  selectedIds,
  totalCount,
  onSelectAll,
  onDeselectAll,
  onAction,
  onClose,
  className = ''
}: BatchActionsProps) {
  const [actionStates, setActionStates] = useState<Record<string, ActionState>>({})
  const [showConfirm, setShowConfirm] = useState<string | null>(null)
  const [ratingValue, setRatingValue] = useState<number | null>(null)

  // Execute action with loading state
  const executeAction = useCallback(async (actionId: string, data?: any) => {
    setActionStates(prev => ({
      ...prev,
      [actionId]: { loading: true, success: false, error: null }
    }))

    try {
      await onAction(actionId, data)
      setActionStates(prev => ({
        ...prev,
        [actionId]: { loading: false, success: true, error: null }
      }))

      // Reset success state after delay
      setTimeout(() => {
        setActionStates(prev => ({
          ...prev,
          [actionId]: { loading: false, success: false, error: null }
        }))
      }, 2000)
    } catch (e) {
      setActionStates(prev => ({
        ...prev,
        [actionId]: { loading: false, success: false, error: (e as Error).message }
      }))
    }
  }, [onAction])

  // Handle action with optional confirmation
  const handleAction = useCallback((actionId: string, requireConfirm: boolean = false, data?: any) => {
    if (requireConfirm) {
      setShowConfirm(actionId)
    } else {
      executeAction(actionId, data)
    }
  }, [executeAction])

  // Confirm dangerous action
  const confirmAction = useCallback(() => {
    if (showConfirm) {
      executeAction(showConfirm)
      setShowConfirm(null)
    }
  }, [showConfirm, executeAction])

  // Get button state
  const getButtonState = useCallback((actionId: string) => {
    return actionStates[actionId] || { loading: false, success: false, error: null }
  }, [actionStates])

  // Action groups
  const actionGroups = useMemo(() => [
    {
      label: 'Organize',
      actions: [
        { id: 'favorite', label: 'Favorite', icon: Heart, color: 'text-red-400' },
        { id: 'unfavorite', label: 'Unfavorite', icon: HeartOff },
        { id: 'add-tags', label: 'Add Tags', icon: Tag },
        { id: 'add-to-playlist', label: 'Add to Playlist', icon: ListPlus }
      ]
    },
    {
      label: 'Rate',
      actions: [
        { id: 'rate-1', label: '1 Star', icon: Star, data: 1 },
        { id: 'rate-2', label: '2 Stars', icon: Star, data: 2 },
        { id: 'rate-3', label: '3 Stars', icon: Star, data: 3 },
        { id: 'rate-4', label: '4 Stars', icon: Star, data: 4 },
        { id: 'rate-5', label: '5 Stars', icon: Star, data: 5 },
        { id: 'clear-rating', label: 'Clear', icon: Star, data: 0 }
      ]
    },
    {
      label: 'Queue',
      actions: [
        { id: 'add-to-queue', label: 'Add to Queue', icon: Clock },
        { id: 'play-all', label: 'Play All', icon: Eye }
      ]
    },
    {
      label: 'Visibility',
      actions: [
        { id: 'hide', label: 'Hide', icon: EyeOff },
        { id: 'unhide', label: 'Unhide', icon: Eye }
      ]
    },
    {
      label: 'Danger',
      actions: [
        { id: 'delete', label: 'Delete', icon: Trash2, danger: true, confirm: true }
      ]
    }
  ], [])

  const count = selectedIds.length
  const allSelected = count === totalCount

  return (
    <div className={`bg-zinc-900/95 backdrop-blur-xl rounded-2xl border border-zinc-700 shadow-2xl overflow-hidden ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-[var(--primary)]/20 flex items-center justify-center">
            <CheckSquare size={16} className="text-[var(--primary)]" />
          </div>
          <div>
            <div className="font-semibold text-sm">{count} Selected</div>
            <div className="text-xs text-zinc-500">of {totalCount} items</div>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-2 rounded-lg hover:bg-zinc-800 transition"
        >
          <X size={16} />
        </button>
      </div>

      {/* Selection controls */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-zinc-800">
        <button
          onClick={onSelectAll}
          disabled={allSelected}
          className="flex items-center gap-1 px-2 py-1 rounded text-xs hover:bg-zinc-800 transition disabled:opacity-50"
        >
          <CheckSquare size={12} />
          Select All
        </button>
        <button
          onClick={onDeselectAll}
          disabled={count === 0}
          className="flex items-center gap-1 px-2 py-1 rounded text-xs hover:bg-zinc-800 transition disabled:opacity-50"
        >
          <Square size={12} />
          Deselect All
        </button>
      </div>

      {/* Actions */}
      <div className="max-h-[60vh] overflow-y-auto p-4 space-y-4">
        {actionGroups.map(group => (
          <div key={group.label}>
            <h3 className="text-xs text-zinc-500 mb-2">{group.label}</h3>
            <div className="flex flex-wrap gap-2">
              {group.actions.map(action => {
                const state = getButtonState(action.id)
                const Icon = action.icon

                return (
                  <button
                    key={action.id}
                    onClick={() => handleAction(
                      action.id,
                      (action as any).confirm,
                      (action as any).data
                    )}
                    disabled={state.loading || count === 0}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition ${
                      state.success
                        ? 'bg-green-500/20 text-green-400'
                        : (action as any).danger
                        ? 'bg-red-500/10 hover:bg-red-500/20 text-red-400'
                        : 'bg-zinc-800 hover:bg-zinc-700'
                    } disabled:opacity-50`}
                  >
                    {state.loading ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : state.success ? (
                      <Check size={14} />
                    ) : (
                      <Icon size={14} className={(action as any).color || ''} />
                    )}
                    {action.label}
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Confirmation dialog */}
      {showConfirm && (
        <div className="absolute inset-0 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-zinc-900 rounded-xl border border-zinc-700 p-4 max-w-xs">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-full bg-red-500/20 flex items-center justify-center">
                <AlertTriangle size={20} className="text-red-400" />
              </div>
              <div>
                <h3 className="font-semibold">Confirm Action</h3>
                <p className="text-sm text-zinc-400">This cannot be undone.</p>
              </div>
            </div>
            <p className="text-sm text-zinc-400 mb-4">
              Are you sure you want to {showConfirm} {count} item{count > 1 ? 's' : ''}?
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setShowConfirm(null)}
                className="flex-1 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 transition text-sm"
              >
                Cancel
              </button>
              <button
                onClick={confirmAction}
                className="flex-1 py-2 rounded-lg bg-red-500 hover:bg-red-600 transition text-sm"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// Floating batch action bar
export function BatchActionBar({
  selectedIds,
  onAction,
  onClear,
  className = ''
}: {
  selectedIds: string[]
  onAction: (action: string) => void
  onClear: () => void
  className?: string
}) {
  if (selectedIds.length === 0) return null

  const quickActions = [
    { id: 'favorite', icon: Heart, label: 'Favorite' },
    { id: 'add-tags', icon: Tag, label: 'Tag' },
    { id: 'add-to-playlist', icon: ListPlus, label: 'Playlist' },
    { id: 'add-to-queue', icon: Clock, label: 'Queue' },
    { id: 'delete', icon: Trash2, label: 'Delete', danger: true }
  ]

  return (
    <div className={`flex items-center gap-2 px-4 py-2 bg-zinc-900/95 backdrop-blur-xl rounded-full border border-zinc-700 shadow-xl ${className}`}>
      <span className="text-sm font-medium px-2">
        {selectedIds.length} selected
      </span>
      <div className="w-px h-4 bg-zinc-700" />
      {quickActions.map(action => (
        <button
          key={action.id}
          onClick={() => onAction(action.id)}
          className={`p-2 rounded-full transition ${
            action.danger
              ? 'hover:bg-red-500/20 text-red-400'
              : 'hover:bg-zinc-800'
          }`}
          title={action.label}
        >
          <action.icon size={16} />
        </button>
      ))}
      <div className="w-px h-4 bg-zinc-700" />
      <button
        onClick={onClear}
        className="p-2 rounded-full hover:bg-zinc-800 transition"
        title="Clear selection"
      >
        <X size={16} />
      </button>
    </div>
  )
}

// Selection checkbox component
export function SelectionCheckbox({
  isSelected,
  onChange,
  className = ''
}: {
  isSelected: boolean
  onChange: (selected: boolean) => void
  className?: string
}) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation()
        onChange(!isSelected)
      }}
      className={`w-5 h-5 rounded border-2 flex items-center justify-center transition ${
        isSelected
          ? 'bg-[var(--primary)] border-[var(--primary)]'
          : 'border-zinc-600 hover:border-zinc-400'
      } ${className}`}
    >
      {isSelected && <Check size={12} className="text-white" />}
    </button>
  )
}

export default BatchActions
