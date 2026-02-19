// File: src/renderer/components/SmartPlaylistBuilder.tsx
// Visual builder for creating and editing smart playlists

import React, { useState, useCallback, useEffect, useMemo } from 'react'
import {
  ListPlus,
  Plus,
  X,
  Trash2,
  Save,
  Play,
  RefreshCw,
  Zap,
  Clock,
  Star,
  Eye,
  EyeOff,
  Film,
  Image,
  Calendar,
  Tag,
  Hash,
  SlidersHorizontal,
  Sparkles,
  Heart,
  Moon,
  Compass,
  Gem,
  PlayCircle,
  Timer,
  ChevronDown,
  ChevronRight,
  Search,
  FileText,
  ArrowUpDown
} from 'lucide-react'

// Types matching the service
interface SmartPlaylistRule {
  field: 'tag' | 'type' | 'rating' | 'duration' | 'addedAt' | 'views' | 'filename'
  operator: 'equals' | 'contains' | 'greater' | 'less' | 'between' | 'in' | 'not_in'
  value: string | number | string[] | number[]
  value2?: string | number
}

interface SmartPlaylistRules {
  match: 'all' | 'any'
  rules: SmartPlaylistRule[]
  sortBy?: 'addedAt' | 'rating' | 'views' | 'duration' | 'random'
  sortOrder?: 'asc' | 'desc'
  limit?: number
}

interface SmartPlaylistBuilderProps {
  initialRules?: SmartPlaylistRules
  onSave: (name: string, rules: SmartPlaylistRules) => void
  onCancel: () => void
  onPreview?: (rules: SmartPlaylistRules) => void
  previewCount?: number
  existingName?: string
  className?: string
}

// Field configurations
const FIELD_OPTIONS = [
  { value: 'type', label: 'Type', icon: Film, description: 'Media type (video, image, gif)' },
  { value: 'tag', label: 'Tag', icon: Tag, description: 'Content tags' },
  { value: 'rating', label: 'Rating', icon: Star, description: 'Star rating (1-5)' },
  { value: 'duration', label: 'Duration', icon: Clock, description: 'Video length in seconds' },
  { value: 'views', label: 'View Count', icon: Eye, description: 'Number of times viewed' },
  { value: 'addedAt', label: 'Added Date', icon: Calendar, description: 'Days since added' },
  { value: 'filename', label: 'Filename', icon: FileText, description: 'File name contains' }
]

// Operators for each field
const OPERATORS_BY_FIELD: Record<string, Array<{ value: string; label: string }>> = {
  type: [
    { value: 'equals', label: 'is' },
    { value: 'in', label: 'is any of' }
  ],
  tag: [
    { value: 'equals', label: 'is' },
    { value: 'contains', label: 'contains' },
    { value: 'in', label: 'includes any of' },
    { value: 'not_in', label: 'excludes' }
  ],
  rating: [
    { value: 'equals', label: 'equals' },
    { value: 'greater', label: 'greater than' },
    { value: 'less', label: 'less than' },
    { value: 'between', label: 'between' }
  ],
  duration: [
    { value: 'greater', label: 'longer than' },
    { value: 'less', label: 'shorter than' },
    { value: 'between', label: 'between' }
  ],
  views: [
    { value: 'equals', label: 'equals' },
    { value: 'greater', label: 'more than' },
    { value: 'less', label: 'less than' }
  ],
  addedAt: [
    { value: 'greater', label: 'within last' },
    { value: 'less', label: 'older than' }
  ],
  filename: [
    { value: 'contains', label: 'contains' }
  ]
}

// Sort options
const SORT_OPTIONS = [
  { value: 'addedAt', label: 'Date Added', icon: Calendar },
  { value: 'rating', label: 'Rating', icon: Star },
  { value: 'views', label: 'View Count', icon: Eye },
  { value: 'duration', label: 'Duration', icon: Clock },
  { value: 'random', label: 'Random', icon: Sparkles }
]

// Preset templates
const PRESET_TEMPLATES = [
  { id: 'favorites', name: 'Recent Favorites', icon: Heart, color: 'text-pink-400' },
  { id: 'long', name: 'Long Videos', icon: Clock, color: 'text-blue-400' },
  { id: 'quick', name: 'Quick Clips', icon: Zap, color: 'text-yellow-400' },
  { id: 'topRated', name: 'Top Rated', icon: Star, color: 'text-amber-400' },
  { id: 'unwatched', name: 'Unwatched', icon: EyeOff, color: 'text-purple-400' },
  { id: 'daily', name: 'Daily Discovery', icon: Compass, color: 'text-cyan-400' },
  { id: 'gems', name: 'Hidden Gems', icon: Gem, color: 'text-emerald-400' },
  { id: 'marathon', name: 'Marathon Night', icon: Moon, color: 'text-indigo-400' }
]

export function SmartPlaylistBuilder({
  initialRules,
  onSave,
  onCancel,
  onPreview,
  previewCount,
  existingName = '',
  className = ''
}: SmartPlaylistBuilderProps) {
  const [name, setName] = useState(existingName)
  const [matchMode, setMatchMode] = useState<'all' | 'any'>(initialRules?.match || 'all')
  const [rules, setRules] = useState<SmartPlaylistRule[]>(initialRules?.rules || [])
  const [sortBy, setSortBy] = useState(initialRules?.sortBy || 'addedAt')
  const [sortOrder, setSortOrder] = useState(initialRules?.sortOrder || 'desc')
  const [limit, setLimit] = useState(initialRules?.limit || 100)
  const [showPresets, setShowPresets] = useState(!initialRules)
  const [availableTags, setAvailableTags] = useState<string[]>([])

  // Load available tags
  useEffect(() => {
    window.api.tags?.list?.()
      .then((tags: any[]) => setAvailableTags(tags.map(t => t.name)))
      .catch(() => {})
  }, [])

  // Build rules object
  const currentRules = useMemo((): SmartPlaylistRules => ({
    match: matchMode,
    rules,
    sortBy: sortBy as any,
    sortOrder,
    limit
  }), [matchMode, rules, sortBy, sortOrder, limit])

  // Trigger preview when rules change
  useEffect(() => {
    if (rules.length > 0) {
      onPreview?.(currentRules)
    }
  }, [currentRules, onPreview])

  // Add a new rule
  const addRule = useCallback(() => {
    setRules(prev => [...prev, {
      field: 'type',
      operator: 'equals',
      value: 'video'
    }])
    setShowPresets(false)
  }, [])

  // Update a rule
  const updateRule = useCallback((index: number, updates: Partial<SmartPlaylistRule>) => {
    setRules(prev => prev.map((rule, i) => i === index ? { ...rule, ...updates } : rule))
  }, [])

  // Remove a rule
  const removeRule = useCallback((index: number) => {
    setRules(prev => prev.filter((_, i) => i !== index))
  }, [])

  // Apply preset template
  const applyPreset = useCallback((presetId: string) => {
    const presets: Record<string, { name: string; rules: SmartPlaylistRules }> = {
      favorites: {
        name: 'Recent Favorites',
        rules: {
          match: 'all',
          rules: [
            { field: 'rating', operator: 'greater', value: 3 },
            { field: 'addedAt', operator: 'greater', value: 30 }
          ],
          sortBy: 'addedAt',
          sortOrder: 'desc',
          limit: 100
        }
      },
      long: {
        name: 'Long Videos',
        rules: {
          match: 'all',
          rules: [
            { field: 'type', operator: 'equals', value: 'video' },
            { field: 'duration', operator: 'greater', value: 600 }
          ],
          sortBy: 'duration',
          sortOrder: 'desc',
          limit: 200
        }
      },
      quick: {
        name: 'Quick Clips',
        rules: {
          match: 'all',
          rules: [
            { field: 'type', operator: 'equals', value: 'video' },
            { field: 'duration', operator: 'less', value: 60 }
          ],
          sortBy: 'random',
          limit: 50
        }
      },
      topRated: {
        name: 'Top Rated',
        rules: {
          match: 'all',
          rules: [{ field: 'rating', operator: 'equals', value: 5 }],
          sortBy: 'views',
          sortOrder: 'desc',
          limit: 100
        }
      },
      unwatched: {
        name: 'Unwatched',
        rules: {
          match: 'all',
          rules: [{ field: 'views', operator: 'less', value: 1 }],
          sortBy: 'addedAt',
          sortOrder: 'desc',
          limit: 200
        }
      },
      daily: {
        name: 'Daily Discovery',
        rules: {
          match: 'all',
          rules: [{ field: 'views', operator: 'less', value: 1 }],
          sortBy: 'random',
          limit: 25
        }
      },
      gems: {
        name: 'Hidden Gems',
        rules: {
          match: 'all',
          rules: [
            { field: 'rating', operator: 'greater', value: 3 },
            { field: 'views', operator: 'less', value: 3 }
          ],
          sortBy: 'rating',
          sortOrder: 'desc',
          limit: 50
        }
      },
      marathon: {
        name: 'Marathon Night',
        rules: {
          match: 'all',
          rules: [
            { field: 'type', operator: 'equals', value: 'video' },
            { field: 'duration', operator: 'greater', value: 1800 }
          ],
          sortBy: 'rating',
          sortOrder: 'desc',
          limit: 50
        }
      }
    }

    const preset = presets[presetId]
    if (preset) {
      setName(preset.name)
      setMatchMode(preset.rules.match)
      setRules(preset.rules.rules)
      setSortBy(preset.rules.sortBy || 'addedAt')
      setSortOrder(preset.rules.sortOrder || 'desc')
      setLimit(preset.rules.limit || 100)
      setShowPresets(false)
    }
  }, [])

  // Handle save
  const handleSave = useCallback(() => {
    if (!name.trim() || rules.length === 0) return
    onSave(name.trim(), currentRules)
  }, [name, rules.length, currentRules, onSave])

  return (
    <div className={`bg-zinc-900/95 backdrop-blur-xl rounded-2xl border border-zinc-700 shadow-2xl overflow-hidden ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[var(--primary)]/20 flex items-center justify-center">
            <ListPlus size={20} className="text-[var(--primary)]" />
          </div>
          <div>
            <h2 className="font-semibold">Smart Playlist Builder</h2>
            <p className="text-xs text-zinc-400">Create auto-updating playlists</p>
          </div>
        </div>
        <button onClick={onCancel} className="p-2 rounded-lg hover:bg-zinc-800 transition">
          <X size={18} />
        </button>
      </div>

      <div className="p-5 space-y-6 max-h-[70vh] overflow-y-auto">
        {/* Preset templates */}
        {showPresets && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-zinc-400">Quick Start Templates</h3>
              <button
                onClick={() => setShowPresets(false)}
                className="text-xs text-zinc-500 hover:text-white transition"
              >
                Build from scratch
              </button>
            </div>
            <div className="grid grid-cols-4 gap-2">
              {PRESET_TEMPLATES.map(preset => {
                const Icon = preset.icon
                return (
                  <button
                    key={preset.id}
                    onClick={() => applyPreset(preset.id)}
                    className="flex flex-col items-center gap-1.5 p-3 rounded-xl bg-zinc-800/50 hover:bg-zinc-800 transition text-center"
                  >
                    <Icon size={20} className={preset.color} />
                    <span className="text-xs text-zinc-300">{preset.name}</span>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Name input */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-zinc-400">Playlist Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="My Smart Playlist"
            className="w-full px-4 py-2.5 bg-zinc-800 border border-zinc-700 rounded-xl outline-none focus:border-[var(--primary)] transition"
          />
        </div>

        {/* Match mode */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-zinc-400">Match</label>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setMatchMode('all')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                matchMode === 'all'
                  ? 'bg-[var(--primary)] text-white'
                  : 'bg-zinc-800 text-zinc-400 hover:text-white'
              }`}
            >
              All rules (AND)
            </button>
            <button
              onClick={() => setMatchMode('any')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                matchMode === 'any'
                  ? 'bg-[var(--primary)] text-white'
                  : 'bg-zinc-800 text-zinc-400 hover:text-white'
              }`}
            >
              Any rule (OR)
            </button>
          </div>
        </div>

        {/* Rules */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-zinc-400">Rules</label>
            <button
              onClick={addRule}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[var(--primary)]/20 text-[var(--primary)] text-sm hover:bg-[var(--primary)]/30 transition"
            >
              <Plus size={14} />
              Add Rule
            </button>
          </div>

          {rules.length === 0 ? (
            <div className="py-8 text-center text-zinc-500 bg-zinc-800/30 rounded-xl">
              <SlidersHorizontal size={24} className="mx-auto mb-2 opacity-50" />
              <p className="text-sm">No rules yet</p>
              <p className="text-xs mt-1">Add rules to define your smart playlist</p>
            </div>
          ) : (
            <div className="space-y-2">
              {rules.map((rule, index) => (
                <RuleEditor
                  key={index}
                  rule={rule}
                  index={index}
                  onUpdate={(updates) => updateRule(index, updates)}
                  onRemove={() => removeRule(index)}
                  availableTags={availableTags}
                  isFirst={index === 0}
                  matchMode={matchMode}
                />
              ))}
            </div>
          )}
        </div>

        {/* Sort options */}
        <div className="space-y-3">
          <label className="text-sm font-medium text-zinc-400">Sort By</label>
          <div className="flex items-center gap-2">
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="flex-1 px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg outline-none focus:border-[var(--primary)]"
            >
              {SORT_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            {sortBy !== 'random' && (
              <button
                onClick={() => setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')}
                className="p-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 transition"
                title={sortOrder === 'asc' ? 'Ascending' : 'Descending'}
              >
                <ArrowUpDown size={18} className={sortOrder === 'asc' ? 'rotate-180' : ''} />
              </button>
            )}
          </div>
        </div>

        {/* Limit */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-zinc-400">Limit</label>
            <span className="text-sm text-zinc-500">{limit} items</span>
          </div>
          <input
            type="range"
            min={10}
            max={500}
            step={10}
            value={limit}
            onChange={(e) => setLimit(parseInt(e.target.value))}
            className="w-full accent-[var(--primary)]"
          />
        </div>

        {/* Preview count */}
        {previewCount !== undefined && rules.length > 0 && (
          <div className="flex items-center justify-center gap-2 py-3 bg-zinc-800/50 rounded-xl">
            <Search size={16} className="text-zinc-400" />
            <span className="text-sm">
              <span className="text-white font-medium">{previewCount}</span>
              <span className="text-zinc-400"> items match</span>
            </span>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-5 py-4 border-t border-zinc-800">
        <button
          onClick={onCancel}
          className="px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 transition"
        >
          Cancel
        </button>
        <div className="flex items-center gap-2">
          <button
            onClick={handleSave}
            disabled={!name.trim() || rules.length === 0}
            className="flex items-center gap-2 px-6 py-2 rounded-lg bg-[var(--primary)] hover:bg-[var(--primary)]/80 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Save size={16} />
            Save Playlist
          </button>
        </div>
      </div>
    </div>
  )
}

// Individual rule editor
function RuleEditor({
  rule,
  index,
  onUpdate,
  onRemove,
  availableTags,
  isFirst,
  matchMode
}: {
  rule: SmartPlaylistRule
  index: number
  onUpdate: (updates: Partial<SmartPlaylistRule>) => void
  onRemove: () => void
  availableTags: string[]
  isFirst: boolean
  matchMode: 'all' | 'any'
}) {
  const operators = OPERATORS_BY_FIELD[rule.field] || []

  // Reset operator when field changes
  const handleFieldChange = (field: string) => {
    const newOperators = OPERATORS_BY_FIELD[field] || []
    onUpdate({
      field: field as any,
      operator: newOperators[0]?.value as any,
      value: getDefaultValue(field),
      value2: undefined
    })
  }

  // Get default value for a field
  const getDefaultValue = (field: string) => {
    switch (field) {
      case 'type': return 'video'
      case 'rating': return 3
      case 'duration': return 300
      case 'views': return 0
      case 'addedAt': return 30
      default: return ''
    }
  }

  return (
    <div className="flex items-center gap-2 p-3 bg-zinc-800/50 rounded-xl group">
      {/* Connector */}
      {!isFirst && (
        <span className="text-xs text-zinc-500 w-10">
          {matchMode === 'all' ? 'AND' : 'OR'}
        </span>
      )}
      {isFirst && <div className="w-10" />}

      {/* Field select */}
      <select
        value={rule.field}
        onChange={(e) => handleFieldChange(e.target.value)}
        className="px-3 py-2 bg-zinc-700 border border-zinc-600 rounded-lg text-sm outline-none focus:border-[var(--primary)]"
      >
        {FIELD_OPTIONS.map(opt => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>

      {/* Operator select */}
      <select
        value={rule.operator}
        onChange={(e) => onUpdate({ operator: e.target.value as any })}
        className="px-3 py-2 bg-zinc-700 border border-zinc-600 rounded-lg text-sm outline-none focus:border-[var(--primary)]"
      >
        {operators.map(opt => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>

      {/* Value input */}
      <RuleValueInput
        field={rule.field}
        operator={rule.operator}
        value={rule.value}
        value2={rule.value2}
        onChange={(value, value2) => onUpdate({ value, value2 })}
        availableTags={availableTags}
      />

      {/* Remove button */}
      <button
        onClick={onRemove}
        className="p-1.5 rounded-lg hover:bg-red-500/20 hover:text-red-400 transition opacity-0 group-hover:opacity-100"
      >
        <Trash2 size={14} />
      </button>
    </div>
  )
}

// Value input based on field type
function RuleValueInput({
  field,
  operator,
  value,
  value2,
  onChange,
  availableTags
}: {
  field: string
  operator: string
  value: any
  value2?: any
  onChange: (value: any, value2?: any) => void
  availableTags: string[]
}) {
  switch (field) {
    case 'type':
      if (operator === 'in') {
        return (
          <div className="flex items-center gap-2">
            {['video', 'image', 'gif'].map(t => (
              <label key={t} className="flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={Array.isArray(value) && value.includes(t)}
                  onChange={(e) => {
                    const current = Array.isArray(value) ? value : []
                    if (e.target.checked) {
                      onChange([...current, t])
                    } else {
                      onChange(current.filter((v: string) => v !== t))
                    }
                  }}
                  className="rounded border-zinc-600 bg-zinc-700 text-[var(--primary)]"
                />
                <span className="text-sm capitalize">{t}</span>
              </label>
            ))}
          </div>
        )
      }
      return (
        <select
          value={value as string}
          onChange={(e) => onChange(e.target.value)}
          className="px-3 py-2 bg-zinc-700 border border-zinc-600 rounded-lg text-sm outline-none focus:border-[var(--primary)]"
        >
          <option value="video">Video</option>
          <option value="image">Image</option>
          <option value="gif">GIF</option>
        </select>
      )

    case 'tag':
      return (
        <input
          type="text"
          value={value as string}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Tag name"
          list="tag-suggestions"
          className="flex-1 px-3 py-2 bg-zinc-700 border border-zinc-600 rounded-lg text-sm outline-none focus:border-[var(--primary)]"
        />
      )

    case 'rating':
      if (operator === 'between') {
        return (
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={1}
              max={5}
              value={value as number}
              onChange={(e) => onChange(parseInt(e.target.value), value2)}
              className="w-16 px-3 py-2 bg-zinc-700 border border-zinc-600 rounded-lg text-sm outline-none focus:border-[var(--primary)]"
            />
            <span className="text-zinc-500">and</span>
            <input
              type="number"
              min={1}
              max={5}
              value={value2 as number || 5}
              onChange={(e) => onChange(value, parseInt(e.target.value))}
              className="w-16 px-3 py-2 bg-zinc-700 border border-zinc-600 rounded-lg text-sm outline-none focus:border-[var(--primary)]"
            />
          </div>
        )
      }
      return (
        <div className="flex items-center gap-1">
          {[1, 2, 3, 4, 5].map(star => (
            <button
              key={star}
              onClick={() => onChange(star)}
              className={`p-1 transition ${
                star <= (value as number) ? 'text-amber-400' : 'text-zinc-600 hover:text-zinc-400'
              }`}
            >
              <Star size={18} fill={star <= (value as number) ? 'currentColor' : 'none'} />
            </button>
          ))}
        </div>
      )

    case 'duration':
      if (operator === 'between') {
        return (
          <div className="flex items-center gap-2">
            <DurationInput value={value as number} onChange={(v) => onChange(v, value2)} />
            <span className="text-zinc-500">and</span>
            <DurationInput value={value2 as number || 600} onChange={(v) => onChange(value, v)} />
          </div>
        )
      }
      return <DurationInput value={value as number} onChange={onChange} />

    case 'views':
    case 'addedAt':
      return (
        <input
          type="number"
          min={0}
          value={value as number}
          onChange={(e) => onChange(parseInt(e.target.value))}
          className="w-20 px-3 py-2 bg-zinc-700 border border-zinc-600 rounded-lg text-sm outline-none focus:border-[var(--primary)]"
        />
      )

    case 'filename':
      return (
        <input
          type="text"
          value={value as string}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Search text"
          className="flex-1 px-3 py-2 bg-zinc-700 border border-zinc-600 rounded-lg text-sm outline-none focus:border-[var(--primary)]"
        />
      )

    default:
      return null
  }
}

// Duration input with friendly format
function DurationInput({
  value,
  onChange
}: {
  value: number
  onChange: (seconds: number) => void
}) {
  const [displayValue, setDisplayValue] = useState('')

  useEffect(() => {
    if (value >= 3600) {
      setDisplayValue(`${Math.floor(value / 3600)}h`)
    } else if (value >= 60) {
      setDisplayValue(`${Math.floor(value / 60)}m`)
    } else {
      setDisplayValue(`${value}s`)
    }
  }, [value])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target.value
    setDisplayValue(input)

    // Parse duration
    const match = input.match(/^(\d+)\s*(h|m|s)?$/i)
    if (match) {
      const num = parseInt(match[1])
      const unit = match[2]?.toLowerCase()
      if (unit === 'h') {
        onChange(num * 3600)
      } else if (unit === 'm') {
        onChange(num * 60)
      } else {
        onChange(num)
      }
    }
  }

  return (
    <input
      type="text"
      value={displayValue}
      onChange={handleChange}
      placeholder="5m"
      className="w-20 px-3 py-2 bg-zinc-700 border border-zinc-600 rounded-lg text-sm outline-none focus:border-[var(--primary)]"
    />
  )
}

export default SmartPlaylistBuilder
