// File: src/renderer/components/CustomFiltersManager.tsx
// Create and manage custom filter presets

import React, { useState, useEffect, useCallback } from 'react'
import {
  Filter,
  Plus,
  Trash2,
  Edit2,
  Play,
  Copy,
  Star,
  Clock,
  Eye,
  EyeOff,
  Film,
  Image as ImageIcon,
  Tag,
  HardDrive,
  TrendingUp,
  Award,
  Zap,
  Loader2,
  ChevronDown,
  ChevronUp,
  Check,
  X,
  Settings
} from 'lucide-react'

type FilterField = 'type' | 'tags' | 'rating' | 'duration' | 'resolution' | 'size' | 'addedAt' | 'viewCount' | 'filename' | 'path' | 'favorite'
type FilterOperator = 'equals' | 'notEquals' | 'contains' | 'notContains' | 'greaterThan' | 'lessThan' | 'between' | 'in' | 'notIn' | 'exists' | 'notExists'

interface FilterCondition {
  field: FilterField
  operator: FilterOperator
  value: any
  value2?: any
}

interface CustomFilter {
  id: string
  name: string
  description?: string
  conditions: FilterCondition[]
  combineMode: 'and' | 'or'
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
  icon?: string
  color?: string
  isQuickAccess: boolean
  useCount: number
  createdAt: number
  updatedAt: number
}

interface CustomFiltersManagerProps {
  onFilterExecute?: (mediaIds: string[]) => void
  className?: string
}

const FIELD_OPTIONS: Array<{ value: FilterField; label: string; icon: React.ElementType }> = [
  { value: 'type', label: 'Media Type', icon: Film },
  { value: 'tags', label: 'Tags', icon: Tag },
  { value: 'rating', label: 'Rating', icon: Star },
  { value: 'duration', label: 'Duration', icon: Clock },
  { value: 'resolution', label: 'Resolution', icon: Award },
  { value: 'size', label: 'File Size', icon: HardDrive },
  { value: 'addedAt', label: 'Date Added', icon: Clock },
  { value: 'viewCount', label: 'View Count', icon: Eye },
  { value: 'filename', label: 'Filename', icon: Film },
  { value: 'favorite', label: 'Favorite', icon: Star }
]

const OPERATOR_OPTIONS: Record<FilterField, Array<{ value: FilterOperator; label: string }>> = {
  type: [
    { value: 'equals', label: 'is' },
    { value: 'notEquals', label: 'is not' }
  ],
  tags: [
    { value: 'in', label: 'includes any' },
    { value: 'notIn', label: 'excludes' },
    { value: 'exists', label: 'has tags' },
    { value: 'notExists', label: 'has no tags' }
  ],
  rating: [
    { value: 'greaterThan', label: 'greater than' },
    { value: 'lessThan', label: 'less than' },
    { value: 'equals', label: 'equals' },
    { value: 'between', label: 'between' }
  ],
  duration: [
    { value: 'greaterThan', label: 'longer than' },
    { value: 'lessThan', label: 'shorter than' },
    { value: 'between', label: 'between' }
  ],
  resolution: [
    { value: 'greaterThan', label: 'higher than' },
    { value: 'lessThan', label: 'lower than' }
  ],
  size: [
    { value: 'greaterThan', label: 'larger than' },
    { value: 'lessThan', label: 'smaller than' }
  ],
  addedAt: [
    { value: 'greaterThan', label: 'after' },
    { value: 'lessThan', label: 'before' }
  ],
  viewCount: [
    { value: 'greaterThan', label: 'more than' },
    { value: 'lessThan', label: 'less than' },
    { value: 'equals', label: 'exactly' }
  ],
  filename: [
    { value: 'contains', label: 'contains' },
    { value: 'notContains', label: 'does not contain' }
  ],
  path: [
    { value: 'contains', label: 'contains' },
    { value: 'notContains', label: 'does not contain' }
  ],
  favorite: [
    { value: 'equals', label: 'is' }
  ]
}

export function CustomFiltersManager({ onFilterExecute, className = '' }: CustomFiltersManagerProps) {
  const [filters, setFilters] = useState<CustomFilter[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [editingFilter, setEditingFilter] = useState<CustomFilter | null>(null)
  const [executing, setExecuting] = useState<string | null>(null)

  // Create/Edit form state
  const [formName, setFormName] = useState('')
  const [formDescription, setFormDescription] = useState('')
  const [formConditions, setFormConditions] = useState<FilterCondition[]>([])
  const [formCombineMode, setFormCombineMode] = useState<'and' | 'or'>('and')
  const [formIsQuickAccess, setFormIsQuickAccess] = useState(false)
  const [previewCount, setPreviewCount] = useState<number | null>(null)

  const loadFilters = useCallback(async () => {
    try {
      const result = await window.api.invoke('customFilters:getAll', true) as CustomFilter[]
      setFilters(result || [])
    } catch (e) {
      console.error('Failed to load filters:', e)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    loadFilters()
  }, [loadFilters])

  const resetForm = useCallback(() => {
    setFormName('')
    setFormDescription('')
    setFormConditions([])
    setFormCombineMode('and')
    setFormIsQuickAccess(false)
    setPreviewCount(null)
    setEditingFilter(null)
    setShowCreate(false)
  }, [])

  const handleCreate = useCallback(() => {
    setShowCreate(true)
    setFormConditions([{ field: 'type', operator: 'equals', value: 'video' }])
  }, [])

  const handleEdit = useCallback((filter: CustomFilter) => {
    setEditingFilter(filter)
    setFormName(filter.name)
    setFormDescription(filter.description || '')
    setFormConditions([...filter.conditions])
    setFormCombineMode(filter.combineMode)
    setFormIsQuickAccess(filter.isQuickAccess)
    setShowCreate(true)
  }, [])

  const handleSave = useCallback(async () => {
    if (!formName.trim() || formConditions.length === 0) return

    try {
      if (editingFilter) {
        await window.api.invoke('customFilters:update', editingFilter.id, {
          name: formName.trim(),
          description: formDescription.trim() || undefined,
          conditions: formConditions,
          combineMode: formCombineMode,
          isQuickAccess: formIsQuickAccess
        })
      } else {
        await window.api.invoke('customFilters:create', formName.trim(), formConditions, {
          description: formDescription.trim() || undefined,
          combineMode: formCombineMode,
          isQuickAccess: formIsQuickAccess
        })
      }
      loadFilters()
      resetForm()
    } catch (e) {
      console.error('Failed to save filter:', e)
    }
  }, [editingFilter, formName, formDescription, formConditions, formCombineMode, formIsQuickAccess, loadFilters, resetForm])

  const handleDelete = useCallback(async (filterId: string) => {
    try {
      await window.api.invoke('customFilters:delete', filterId)
      setFilters(prev => prev.filter(f => f.id !== filterId))
    } catch (e) {
      console.error('Failed to delete filter:', e)
    }
  }, [])

  const handleDuplicate = useCallback(async (filterId: string) => {
    try {
      await window.api.invoke('customFilters:duplicate', filterId)
      loadFilters()
    } catch (e) {
      console.error('Failed to duplicate filter:', e)
    }
  }, [loadFilters])

  const handleExecute = useCallback(async (filterId: string) => {
    setExecuting(filterId)
    try {
      const result = await window.api.invoke('customFilters:execute', filterId) as { mediaIds: string[]; totalCount: number }
      if (result && onFilterExecute) {
        onFilterExecute(result.mediaIds)
      }
    } catch (e) {
      console.error('Failed to execute filter:', e)
    }
    setExecuting(null)
  }, [onFilterExecute])

  const handleToggleQuickAccess = useCallback(async (filterId: string) => {
    try {
      await window.api.invoke('customFilters:toggleQuickAccess', filterId)
      loadFilters()
    } catch (e) {
      console.error('Failed to toggle quick access:', e)
    }
  }, [loadFilters])

  const handlePreview = useCallback(async () => {
    if (formConditions.length === 0) return
    try {
      const count = await window.api.invoke('customFilters:preview', formConditions, formCombineMode) as number
      setPreviewCount(count)
    } catch (e) {
      setPreviewCount(null)
    }
  }, [formConditions, formCombineMode])

  const addCondition = useCallback(() => {
    setFormConditions(prev => [...prev, { field: 'type', operator: 'equals', value: 'video' }])
  }, [])

  const removeCondition = useCallback((index: number) => {
    setFormConditions(prev => prev.filter((_, i) => i !== index))
  }, [])

  const updateCondition = useCallback((index: number, updates: Partial<FilterCondition>) => {
    setFormConditions(prev => prev.map((c, i) => i === index ? { ...c, ...updates } : c))
  }, [])

  const getIconForFilter = useCallback((filter: CustomFilter) => {
    const iconMap: Record<string, React.ElementType> = {
      clock: Clock,
      star: Star,
      'eye-off': EyeOff,
      film: Film,
      zap: Zap,
      monitor: Award,
      'trending-up': TrendingUp,
      'hard-drive': HardDrive
    }
    return iconMap[filter.icon || ''] || Filter
  }, [])

  // Quick access filters
  const quickAccessFilters = filters.filter(f => f.isQuickAccess)
  const otherFilters = filters.filter(f => !f.isQuickAccess)

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
          <Filter size={16} className="text-[var(--primary)]" />
          <span className="font-semibold text-sm">Custom Filters</span>
          <span className="text-xs text-zinc-500">({filters.length})</span>
        </div>
        <button
          onClick={handleCreate}
          className="flex items-center gap-1 px-2 py-1 rounded bg-[var(--primary)] hover:bg-[var(--primary)]/80 transition text-xs"
        >
          <Plus size={12} />
          New Filter
        </button>
      </div>

      {/* Create/Edit form */}
      {showCreate && (
        <div className="p-4 border-b border-zinc-800 bg-zinc-800/30">
          <div className="space-y-3">
            <input
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              placeholder="Filter name"
              className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded text-sm outline-none focus:border-[var(--primary)]"
            />

            <input
              value={formDescription}
              onChange={(e) => setFormDescription(e.target.value)}
              placeholder="Description (optional)"
              className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded text-sm outline-none focus:border-[var(--primary)]"
            />

            {/* Conditions */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-zinc-500">
                <span>Conditions</span>
                <select
                  value={formCombineMode}
                  onChange={(e) => setFormCombineMode(e.target.value as 'and' | 'or')}
                  className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs"
                >
                  <option value="and">Match ALL</option>
                  <option value="or">Match ANY</option>
                </select>
              </div>

              {formConditions.map((condition, index) => (
                <div key={index} className="flex items-center gap-2">
                  <select
                    value={condition.field}
                    onChange={(e) => updateCondition(index, { field: e.target.value as FilterField, operator: 'equals', value: '' })}
                    className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-xs"
                  >
                    {FIELD_OPTIONS.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>

                  <select
                    value={condition.operator}
                    onChange={(e) => updateCondition(index, { operator: e.target.value as FilterOperator })}
                    className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-xs"
                  >
                    {(OPERATOR_OPTIONS[condition.field] || []).map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>

                  {condition.field === 'type' ? (
                    <select
                      value={condition.value || ''}
                      onChange={(e) => updateCondition(index, { value: e.target.value })}
                      className="flex-1 bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-xs"
                    >
                      <option value="video">Video</option>
                      <option value="image">Image</option>
                      <option value="gif">GIF</option>
                    </select>
                  ) : condition.field === 'favorite' ? (
                    <select
                      value={condition.value ? 'true' : 'false'}
                      onChange={(e) => updateCondition(index, { value: e.target.value === 'true' })}
                      className="flex-1 bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-xs"
                    >
                      <option value="true">Yes</option>
                      <option value="false">No</option>
                    </select>
                  ) : condition.operator !== 'exists' && condition.operator !== 'notExists' ? (
                    <input
                      type={['rating', 'duration', 'resolution', 'size', 'viewCount'].includes(condition.field) ? 'number' : 'text'}
                      value={condition.value || ''}
                      onChange={(e) => updateCondition(index, { value: e.target.value })}
                      placeholder="Value"
                      className="flex-1 bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-xs outline-none"
                    />
                  ) : null}

                  <button
                    onClick={() => removeCondition(index)}
                    className="p-1 rounded hover:bg-red-500/20 text-red-400"
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}

              <button
                onClick={addCondition}
                className="text-xs text-[var(--primary)] hover:underline"
              >
                + Add condition
              </button>
            </div>

            {/* Options */}
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={formIsQuickAccess}
                onChange={(e) => setFormIsQuickAccess(e.target.checked)}
                className="accent-[var(--primary)]"
              />
              Show in Quick Access
            </label>

            {/* Preview */}
            {previewCount !== null && (
              <div className="text-xs text-zinc-500">
                Preview: {previewCount} items match
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center justify-between pt-2">
              <button
                onClick={handlePreview}
                className="px-3 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-xs"
              >
                Preview
              </button>
              <div className="flex items-center gap-2">
                <button
                  onClick={resetForm}
                  className="px-3 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-xs"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={!formName.trim() || formConditions.length === 0}
                  className="px-3 py-1.5 rounded bg-[var(--primary)] hover:bg-[var(--primary)]/80 text-xs disabled:opacity-50"
                >
                  {editingFilter ? 'Update' : 'Create'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Quick Access */}
      {quickAccessFilters.length > 0 && (
        <div className="px-4 py-2 border-b border-zinc-800">
          <div className="text-xs text-zinc-500 mb-2">Quick Access</div>
          <div className="flex flex-wrap gap-2">
            {quickAccessFilters.map(filter => {
              const Icon = getIconForFilter(filter)
              return (
                <button
                  key={filter.id}
                  onClick={() => handleExecute(filter.id)}
                  disabled={executing === filter.id}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 transition text-xs"
                >
                  {executing === filter.id ? (
                    <Loader2 size={12} className="animate-spin" />
                  ) : (
                    <Icon size={12} />
                  )}
                  {filter.name}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Filter list */}
      <div className="max-h-80 overflow-y-auto">
        {filters.length === 0 ? (
          <div className="py-8 text-center text-zinc-500">
            <Filter size={24} className="mx-auto mb-2 opacity-50" />
            <p className="text-sm">No custom filters</p>
            <button
              onClick={handleCreate}
              className="text-xs text-[var(--primary)] hover:underline mt-2"
            >
              Create your first filter
            </button>
          </div>
        ) : (
          [...quickAccessFilters, ...otherFilters].map(filter => {
            const Icon = getIconForFilter(filter)
            const isPreset = filter.id.startsWith('preset-')

            return (
              <div
                key={filter.id}
                className="flex items-center gap-3 px-4 py-2 hover:bg-zinc-800/50 group"
              >
                <div className={`w-8 h-8 rounded flex items-center justify-center ${
                  filter.isQuickAccess ? 'bg-[var(--primary)]/20' : 'bg-zinc-800'
                }`}>
                  <Icon size={14} className={filter.isQuickAccess ? 'text-[var(--primary)]' : ''} />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="text-sm truncate">{filter.name}</div>
                  {filter.description && (
                    <div className="text-xs text-zinc-500 truncate">{filter.description}</div>
                  )}
                </div>

                <span className="text-xs text-zinc-500">
                  {filter.conditions.length} rule{filter.conditions.length !== 1 ? 's' : ''}
                </span>

                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition">
                  <button
                    onClick={() => handleExecute(filter.id)}
                    disabled={executing === filter.id}
                    className="p-1.5 rounded bg-[var(--primary)] hover:bg-[var(--primary)]/80"
                    title="Run filter"
                  >
                    {executing === filter.id ? (
                      <Loader2 size={12} className="animate-spin" />
                    ) : (
                      <Play size={12} />
                    )}
                  </button>
                  <button
                    onClick={() => handleToggleQuickAccess(filter.id)}
                    className={`p-1.5 rounded hover:bg-zinc-700 ${filter.isQuickAccess ? 'text-[var(--primary)]' : ''}`}
                    title={filter.isQuickAccess ? 'Remove from Quick Access' : 'Add to Quick Access'}
                  >
                    <Star size={12} className={filter.isQuickAccess ? 'fill-current' : ''} />
                  </button>
                  {!isPreset && (
                    <>
                      <button
                        onClick={() => handleEdit(filter)}
                        className="p-1.5 rounded hover:bg-zinc-700"
                        title="Edit"
                      >
                        <Edit2 size={12} />
                      </button>
                      <button
                        onClick={() => handleDuplicate(filter.id)}
                        className="p-1.5 rounded hover:bg-zinc-700"
                        title="Duplicate"
                      >
                        <Copy size={12} />
                      </button>
                      <button
                        onClick={() => handleDelete(filter.id)}
                        className="p-1.5 rounded hover:bg-red-500/20 text-red-400"
                        title="Delete"
                      >
                        <Trash2 size={12} />
                      </button>
                    </>
                  )}
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

export default CustomFiltersManager
