// File: src/renderer/components/TagCategoriesManager.tsx
// Organize tags into hierarchical categories

import React, { useState, useEffect, useCallback } from 'react'
import {
  Tags,
  FolderTree,
  Plus,
  Trash2,
  Edit2,
  ChevronRight,
  ChevronDown,
  Wand2,
  GripVertical,
  Loader2,
  X,
  Check,
  Film,
  Users,
  Zap,
  Map,
  Palette,
  Heart,
  Award,
  Link
} from 'lucide-react'

interface TagCategory {
  id: string
  name: string
  description?: string
  color?: string
  icon?: string
  parentId: string | null
  sortOrder: number
  isSystem: boolean
  tagCount: number
  createdAt: number
}

interface TagInCategory {
  id: string
  name: string
  color?: string
  mediaCount: number
}

interface CategoryStats {
  totalCategories: number
  totalTags: number
  uncategorizedTags: number
  avgTagsPerCategory: number
}

interface TagCategoriesManagerProps {
  onTagSelect?: (tagName: string) => void
  className?: string
}

const ICON_MAP: Record<string, React.ElementType> = {
  film: Film,
  users: Users,
  zap: Zap,
  map: Map,
  palette: Palette,
  heart: Heart,
  award: Award,
  link: Link
}

export function TagCategoriesManager({ onTagSelect, className = '' }: TagCategoriesManagerProps) {
  const [categories, setCategories] = useState<TagCategory[]>([])
  const [uncategorizedTags, setUncategorizedTags] = useState<TagInCategory[]>([])
  const [stats, setStats] = useState<CategoryStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const [categoryTags, setCategoryTags] = useState<Record<string, TagInCategory[]>>({})
  const [autoCategorizing, setAutoCategorizing] = useState(false)

  // Create form
  const [showCreate, setShowCreate] = useState(false)
  const [formName, setFormName] = useState('')
  const [formDescription, setFormDescription] = useState('')
  const [formColor, setFormColor] = useState('#3b82f6')
  const [editingId, setEditingId] = useState<string | null>(null)

  const loadData = useCallback(async () => {
    try {
      const [categoriesResult, uncategorizedResult, statsResult] = await Promise.all([
        window.api.invoke('tagCategories:getAll') as Promise<TagCategory[]>,
        window.api.invoke('tagCategories:getUncategorized') as Promise<TagInCategory[]>,
        window.api.invoke('tagCategories:getStats') as Promise<CategoryStats>
      ])
      setCategories(categoriesResult || [])
      setUncategorizedTags(uncategorizedResult || [])
      setStats(statsResult || null)
    } catch (e) {
      console.error('Failed to load tag categories:', e)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  const loadCategoryTags = useCallback(async (categoryId: string) => {
    if (categoryTags[categoryId]) return
    try {
      const tags = await window.api.invoke('tagCategories:getTagsInCategory', categoryId) as TagInCategory[]
      setCategoryTags(prev => ({ ...prev, [categoryId]: tags || [] }))
    } catch (e) {
      console.error('Failed to load category tags:', e)
    }
  }, [categoryTags])

  const handleExpand = useCallback((categoryId: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev)
      if (next.has(categoryId)) {
        next.delete(categoryId)
      } else {
        next.add(categoryId)
        loadCategoryTags(categoryId)
      }
      return next
    })
  }, [loadCategoryTags])

  const handleCreate = useCallback(async () => {
    if (!formName.trim()) return
    try {
      await window.api.invoke('tagCategories:create', formName.trim(), {
        description: formDescription.trim() || undefined,
        color: formColor
      })
      loadData()
      setShowCreate(false)
      setFormName('')
      setFormDescription('')
    } catch (e) {
      console.error('Failed to create category:', e)
    }
  }, [formName, formDescription, formColor, loadData])

  const handleUpdate = useCallback(async (categoryId: string, updates: Partial<TagCategory>) => {
    try {
      await window.api.invoke('tagCategories:update', categoryId, updates)
      loadData()
      setEditingId(null)
    } catch (e) {
      console.error('Failed to update category:', e)
    }
  }, [loadData])

  const handleDelete = useCallback(async (categoryId: string) => {
    try {
      await window.api.invoke('tagCategories:delete', categoryId)
      loadData()
    } catch (e) {
      console.error('Failed to delete category:', e)
    }
  }, [loadData])

  const handleAutoCategorize = useCallback(async () => {
    setAutoCategorizing(true)
    try {
      const result = await window.api.invoke('tagCategories:autoCategorize') as { categorized: number }
      if (result) {
        loadData()
      }
    } catch (e) {
      console.error('Failed to auto-categorize:', e)
    }
    setAutoCategorizing(false)
  }, [loadData])

  const handleAssignTag = useCallback(async (tagId: string, categoryId: string | null) => {
    try {
      await window.api.invoke('tagCategories:assignTag', tagId, categoryId)
      loadData()
      // Clear cached tags for the category
      setCategoryTags(prev => {
        const next = { ...prev }
        delete next[categoryId || 'uncategorized']
        return next
      })
    } catch (e) {
      console.error('Failed to assign tag:', e)
    }
  }, [loadData])

  const handleTagClick = useCallback((tagName: string) => {
    if (onTagSelect) {
      onTagSelect(tagName)
    }
  }, [onTagSelect])

  const getCategoryIcon = useCallback((iconName?: string) => {
    return ICON_MAP[iconName || ''] || Tags
  }, [])

  const PRESET_COLORS = ['#3b82f6', '#ec4899', '#f59e0b', '#10b981', '#8b5cf6', '#ef4444', '#06b6d4', '#64748b']

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
          <FolderTree size={16} className="text-[var(--primary)]" />
          <span className="font-semibold text-sm">Tag Categories</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleAutoCategorize}
            disabled={autoCategorizing}
            className="flex items-center gap-1 px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 transition text-xs"
            title="Auto-categorize tags"
          >
            {autoCategorizing ? (
              <Loader2 size={12} className="animate-spin" />
            ) : (
              <Wand2 size={12} />
            )}
            Auto
          </button>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-1 px-2 py-1 rounded bg-[var(--primary)] hover:bg-[var(--primary)]/80 transition text-xs"
          >
            <Plus size={12} />
            New
          </button>
        </div>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-3 gap-2 px-4 py-3 border-b border-zinc-800 text-center text-xs">
          <div>
            <div className="text-lg font-bold">{stats.totalCategories}</div>
            <div className="text-zinc-500">Categories</div>
          </div>
          <div>
            <div className="text-lg font-bold">{stats.totalTags}</div>
            <div className="text-zinc-500">Total Tags</div>
          </div>
          <div>
            <div className="text-lg font-bold text-orange-400">{stats.uncategorizedTags}</div>
            <div className="text-zinc-500">Uncategorized</div>
          </div>
        </div>
      )}

      {/* Create form */}
      {showCreate && (
        <div className="p-4 border-b border-zinc-800 bg-zinc-800/30 space-y-3">
          <input
            value={formName}
            onChange={(e) => setFormName(e.target.value)}
            placeholder="Category name"
            className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded text-sm outline-none focus:border-[var(--primary)]"
            autoFocus
          />
          <input
            value={formDescription}
            onChange={(e) => setFormDescription(e.target.value)}
            placeholder="Description (optional)"
            className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded text-sm outline-none focus:border-[var(--primary)]"
          />
          <div>
            <div className="text-xs text-zinc-500 mb-2">Color</div>
            <div className="flex gap-2">
              {PRESET_COLORS.map(color => (
                <button
                  key={color}
                  onClick={() => setFormColor(color)}
                  className={`w-6 h-6 rounded-full ${formColor === color ? 'ring-2 ring-white ring-offset-2 ring-offset-zinc-900' : ''}`}
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button
              onClick={() => { setShowCreate(false); setFormName(''); setFormDescription('') }}
              className="px-3 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-xs"
            >
              Cancel
            </button>
            <button
              onClick={handleCreate}
              disabled={!formName.trim()}
              className="px-3 py-1.5 rounded bg-[var(--primary)] hover:bg-[var(--primary)]/80 text-xs disabled:opacity-50"
            >
              Create
            </button>
          </div>
        </div>
      )}

      {/* Categories list */}
      <div className="max-h-96 overflow-y-auto">
        {categories.map(category => {
          const Icon = getCategoryIcon(category.icon)
          const isExpanded = expandedIds.has(category.id)
          const tags = categoryTags[category.id] || []

          return (
            <div key={category.id} className="border-b border-zinc-800/50 last:border-0">
              <div
                className="flex items-center gap-2 px-4 py-2 hover:bg-zinc-800/50 cursor-pointer group"
                onClick={() => handleExpand(category.id)}
              >
                <button className="p-0.5">
                  {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </button>

                <div
                  className="w-6 h-6 rounded flex items-center justify-center"
                  style={{ backgroundColor: `${category.color}20` }}
                >
                  <Icon size={12} style={{ color: category.color }} />
                </div>

                {editingId === category.id ? (
                  <input
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    onBlur={() => { handleUpdate(category.id, { name: formName }); setEditingId(null) }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') { handleUpdate(category.id, { name: formName }); setEditingId(null) }
                      if (e.key === 'Escape') setEditingId(null)
                    }}
                    onClick={(e) => e.stopPropagation()}
                    className="flex-1 bg-zinc-800 px-2 py-0.5 rounded text-sm outline-none"
                    autoFocus
                  />
                ) : (
                  <span className="flex-1 text-sm">{category.name}</span>
                )}

                <span className="text-xs text-zinc-500">{category.tagCount}</span>

                {!category.isSystem && (
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition">
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        setEditingId(category.id)
                        setFormName(category.name)
                      }}
                      className="p-1 rounded hover:bg-zinc-700"
                    >
                      <Edit2 size={12} />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        handleDelete(category.id)
                      }}
                      className="p-1 rounded hover:bg-red-500/20 text-red-400"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                )}
              </div>

              {/* Tags in category */}
              {isExpanded && (
                <div className="pl-10 pr-4 py-2 bg-zinc-800/20 space-y-1">
                  {tags.length === 0 ? (
                    <div className="text-xs text-zinc-500 py-2">No tags in this category</div>
                  ) : (
                    <div className="flex flex-wrap gap-1">
                      {tags.map(tag => (
                        <button
                          key={tag.id}
                          onClick={() => handleTagClick(tag.name)}
                          className="flex items-center gap-1 px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-xs transition"
                        >
                          <span
                            className="w-2 h-2 rounded-full"
                            style={{ backgroundColor: tag.color || category.color }}
                          />
                          {tag.name}
                          <span className="text-zinc-500">({tag.mediaCount})</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}

        {/* Uncategorized section */}
        {uncategorizedTags.length > 0 && (
          <div className="border-t border-zinc-800">
            <div
              className="flex items-center gap-2 px-4 py-2 hover:bg-zinc-800/50 cursor-pointer"
              onClick={() => handleExpand('uncategorized')}
            >
              <button className="p-0.5">
                {expandedIds.has('uncategorized') ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </button>
              <div className="w-6 h-6 rounded flex items-center justify-center bg-orange-500/20">
                <Tags size={12} className="text-orange-400" />
              </div>
              <span className="flex-1 text-sm text-orange-400">Uncategorized</span>
              <span className="text-xs text-zinc-500">{uncategorizedTags.length}</span>
            </div>

            {expandedIds.has('uncategorized') && (
              <div className="pl-10 pr-4 py-2 bg-zinc-800/20">
                <div className="flex flex-wrap gap-1">
                  {uncategorizedTags.slice(0, 50).map(tag => (
                    <div
                      key={tag.id}
                      className="group flex items-center gap-1 px-2 py-1 rounded bg-zinc-800 text-xs"
                    >
                      <button
                        onClick={() => handleTagClick(tag.name)}
                        className="hover:text-[var(--primary)]"
                      >
                        {tag.name}
                      </button>
                      <span className="text-zinc-500">({tag.mediaCount})</span>

                      {/* Category assign dropdown */}
                      <select
                        className="opacity-0 group-hover:opacity-100 ml-1 bg-zinc-700 rounded text-xs px-1 py-0.5"
                        onChange={(e) => {
                          if (e.target.value) {
                            handleAssignTag(tag.id, e.target.value)
                          }
                        }}
                        onClick={(e) => e.stopPropagation()}
                        defaultValue=""
                      >
                        <option value="" disabled>Assign to...</option>
                        {categories.map(cat => (
                          <option key={cat.id} value={cat.id}>{cat.name}</option>
                        ))}
                      </select>
                    </div>
                  ))}
                  {uncategorizedTags.length > 50 && (
                    <span className="text-xs text-zinc-500 py-1">
                      +{uncategorizedTags.length - 50} more
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default TagCategoriesManager
