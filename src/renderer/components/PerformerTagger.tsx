// File: src/renderer/components/PerformerTagger.tsx
// Actor/performer tag management with face detection suggestions

import React, { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Users,
  User,
  Plus,
  X,
  Search,
  Star,
  Heart,
  Film,
  Image,
  Check,
  Edit3,
  Trash2,
  ChevronRight,
  Camera,
  Link,
  ExternalLink,
  AlertCircle
} from 'lucide-react'

interface Performer {
  id: string
  name: string
  aliases?: string[]
  avatar?: string
  mediaCount: number
  favoriteCount: number
  rating?: number
  bio?: string
  links?: Array<{ type: string; url: string }>
}

interface PerformerTaggerProps {
  mediaId: string
  currentPerformers: Performer[]
  suggestedPerformers?: Performer[]
  allPerformers: Performer[]
  onAdd: (performerId: string) => Promise<void>
  onRemove: (performerId: string) => Promise<void>
  onCreate: (name: string) => Promise<Performer>
  onUpdate: (id: string, data: Partial<Performer>) => Promise<void>
  className?: string
}

export function PerformerTagger({
  mediaId,
  currentPerformers,
  suggestedPerformers = [],
  allPerformers,
  onAdd,
  onRemove,
  onCreate,
  onUpdate,
  className = ''
}: PerformerTaggerProps) {
  const [search, setSearch] = useState('')
  const [isAdding, setIsAdding] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [newPerformerName, setNewPerformerName] = useState('')
  const [creating, setCreating] = useState(false)
  const [editingPerformer, setEditingPerformer] = useState<Performer | null>(null)

  // Filter available performers
  const availablePerformers = useMemo(() => {
    const currentIds = new Set(currentPerformers.map(p => p.id))
    return allPerformers
      .filter(p => !currentIds.has(p.id))
      .filter(p =>
        !search ||
        p.name.toLowerCase().includes(search.toLowerCase()) ||
        p.aliases?.some(a => a.toLowerCase().includes(search.toLowerCase()))
      )
      .slice(0, 20)
  }, [allPerformers, currentPerformers, search])

  // Filter suggestions that aren't already added
  const filteredSuggestions = useMemo(() => {
    const currentIds = new Set(currentPerformers.map(p => p.id))
    return suggestedPerformers.filter(p => !currentIds.has(p.id))
  }, [suggestedPerformers, currentPerformers])

  // Handle add performer
  const handleAdd = useCallback(async (performerId: string) => {
    setIsAdding(true)
    try {
      await onAdd(performerId)
    } finally {
      setIsAdding(false)
    }
  }, [onAdd])

  // Handle create new performer
  const handleCreate = useCallback(async () => {
    if (!newPerformerName.trim()) return
    setCreating(true)
    try {
      const performer = await onCreate(newPerformerName.trim())
      await onAdd(performer.id)
      setNewPerformerName('')
      setShowCreate(false)
    } finally {
      setCreating(false)
    }
  }, [newPerformerName, onCreate, onAdd])

  return (
    <div className={`bg-zinc-900/95 backdrop-blur-xl rounded-2xl border border-zinc-700 shadow-2xl overflow-hidden ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
        <div className="flex items-center gap-2">
          <Users size={16} className="text-[var(--primary)]" />
          <span className="font-semibold text-sm">Performers</span>
          <span className="text-xs text-zinc-500">({currentPerformers.length})</span>
        </div>
      </div>

      {/* Current performers */}
      {currentPerformers.length > 0 && (
        <div className="p-3 border-b border-zinc-800 space-y-2">
          {currentPerformers.map(performer => (
            <div
              key={performer.id}
              className="flex items-center gap-3 p-2 rounded-lg bg-zinc-800/50 group"
            >
              {/* Avatar */}
              <div className="w-10 h-10 rounded-full bg-zinc-700 overflow-hidden flex-shrink-0">
                {performer.avatar ? (
                  <img src={performer.avatar} alt="" className="w-full h-full object-cover" />
                ) : (
                  <User size={20} className="w-full h-full p-2 text-zinc-500" />
                )}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{performer.name}</div>
                <div className="text-xs text-zinc-500">
                  {performer.mediaCount} media
                  {performer.rating && (
                    <span className="ml-2 flex items-center gap-0.5 inline-flex">
                      <Star size={10} className="text-yellow-400 fill-yellow-400" />
                      {performer.rating.toFixed(1)}
                    </span>
                  )}
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition">
                <button
                  onClick={() => setEditingPerformer(performer)}
                  className="p-1.5 rounded-lg hover:bg-zinc-700 transition"
                >
                  <Edit3 size={12} />
                </button>
                <button
                  onClick={() => onRemove(performer.id)}
                  className="p-1.5 rounded-lg hover:bg-red-500/20 text-red-400 transition"
                >
                  <X size={12} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* AI Suggestions */}
      {filteredSuggestions.length > 0 && (
        <div className="p-3 border-b border-zinc-800">
          <div className="flex items-center gap-1 text-xs text-zinc-500 mb-2">
            <Camera size={10} />
            Detected in this media
          </div>
          <div className="flex flex-wrap gap-2">
            {filteredSuggestions.map(performer => (
              <button
                key={performer.id}
                onClick={() => handleAdd(performer.id)}
                disabled={isAdding}
                className="flex items-center gap-2 px-2 py-1 rounded-full bg-[var(--primary)]/20 text-[var(--primary)] hover:bg-[var(--primary)]/30 transition text-sm"
              >
                <div className="w-5 h-5 rounded-full bg-zinc-700 overflow-hidden">
                  {performer.avatar ? (
                    <img src={performer.avatar} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <User size={10} className="w-full h-full p-1 text-zinc-400" />
                  )}
                </div>
                {performer.name}
                <Plus size={12} />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Search and add */}
      <div className="p-3">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search performers..."
            className="w-full pl-9 pr-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm outline-none focus:border-[var(--primary)]"
          />
        </div>

        {/* Search results */}
        {search && (
          <div className="mt-2 max-h-48 overflow-y-auto">
            {availablePerformers.length > 0 ? (
              <div className="space-y-1">
                {availablePerformers.map(performer => (
                  <button
                    key={performer.id}
                    onClick={() => { handleAdd(performer.id); setSearch('') }}
                    disabled={isAdding}
                    className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-zinc-800 transition text-left"
                  >
                    <div className="w-8 h-8 rounded-full bg-zinc-700 overflow-hidden flex-shrink-0">
                      {performer.avatar ? (
                        <img src={performer.avatar} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <User size={14} className="w-full h-full p-2 text-zinc-500" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm truncate">{performer.name}</div>
                      <div className="text-xs text-zinc-500">{performer.mediaCount} media</div>
                    </div>
                    <Plus size={14} className="text-zinc-500" />
                  </button>
                ))}
              </div>
            ) : (
              <div className="py-4 text-center">
                <p className="text-sm text-zinc-500 mb-2">No performers found</p>
                <button
                  onClick={() => { setNewPerformerName(search); setShowCreate(true) }}
                  className="text-xs text-[var(--primary)] hover:underline"
                >
                  Create "{search}"
                </button>
              </div>
            )}
          </div>
        )}

        {/* Create new */}
        {!search && (
          <button
            onClick={() => setShowCreate(true)}
            className="w-full flex items-center justify-center gap-2 mt-2 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 transition text-sm"
          >
            <Plus size={14} />
            Add New Performer
          </button>
        )}
      </div>

      {/* Create performer modal */}
      {showCreate && (
        <div className="absolute inset-0 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-zinc-900 rounded-xl border border-zinc-700 w-full max-w-sm p-4">
            <h3 className="font-semibold mb-3">New Performer</h3>
            <input
              type="text"
              value={newPerformerName}
              onChange={(e) => setNewPerformerName(e.target.value)}
              placeholder="Name"
              className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm outline-none focus:border-[var(--primary)] mb-3"
              autoFocus
            />
            <div className="flex gap-2">
              <button
                onClick={() => { setShowCreate(false); setNewPerformerName('') }}
                className="flex-1 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 transition text-sm"
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={!newPerformerName.trim() || creating}
                className="flex-1 py-2 rounded-lg bg-[var(--primary)] hover:bg-[var(--primary)]/80 transition text-sm disabled:opacity-50"
              >
                {creating ? 'Creating...' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit performer modal */}
      {editingPerformer && (
        <PerformerEditor
          performer={editingPerformer}
          onSave={async (data) => {
            await onUpdate(editingPerformer.id, data)
            setEditingPerformer(null)
          }}
          onClose={() => setEditingPerformer(null)}
        />
      )}
    </div>
  )
}

// Performer editor modal
function PerformerEditor({
  performer,
  onSave,
  onClose
}: {
  performer: Performer
  onSave: (data: Partial<Performer>) => Promise<void>
  onClose: () => void
}) {
  const [name, setName] = useState(performer.name)
  const [aliases, setAliases] = useState(performer.aliases?.join(', ') || '')
  const [bio, setBio] = useState(performer.bio || '')
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    setSaving(true)
    try {
      await onSave({
        name,
        aliases: aliases.split(',').map(a => a.trim()).filter(Boolean),
        bio
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
      <div className="bg-zinc-900 rounded-xl border border-zinc-700 w-full max-w-md p-4">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-12 h-12 rounded-full bg-zinc-700 overflow-hidden">
            {performer.avatar ? (
              <img src={performer.avatar} alt="" className="w-full h-full object-cover" />
            ) : (
              <User size={24} className="w-full h-full p-3 text-zinc-500" />
            )}
          </div>
          <div>
            <h3 className="font-semibold">Edit Performer</h3>
            <p className="text-xs text-zinc-500">{performer.mediaCount} media</p>
          </div>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-xs text-zinc-500 block mb-1">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm outline-none focus:border-[var(--primary)]"
            />
          </div>
          <div>
            <label className="text-xs text-zinc-500 block mb-1">Aliases (comma separated)</label>
            <input
              type="text"
              value={aliases}
              onChange={(e) => setAliases(e.target.value)}
              placeholder="Alt name 1, Alt name 2"
              className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm outline-none focus:border-[var(--primary)]"
            />
          </div>
          <div>
            <label className="text-xs text-zinc-500 block mb-1">Bio</label>
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm outline-none focus:border-[var(--primary)] resize-none"
            />
          </div>
        </div>

        <div className="flex gap-2 mt-4">
          <button
            onClick={onClose}
            className="flex-1 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 transition text-sm"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!name.trim() || saving}
            className="flex-1 py-2 rounded-lg bg-[var(--primary)] hover:bg-[var(--primary)]/80 transition text-sm disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}

// Performer badge for display
export function PerformerBadge({
  performer,
  onClick,
  onRemove,
  size = 'md',
  className = ''
}: {
  performer: Performer
  onClick?: () => void
  onRemove?: () => void
  size?: 'sm' | 'md' | 'lg'
  className?: string
}) {
  const sizes = {
    sm: { avatar: 'w-5 h-5', text: 'text-xs', padding: 'px-1.5 py-0.5' },
    md: { avatar: 'w-6 h-6', text: 'text-sm', padding: 'px-2 py-1' },
    lg: { avatar: 'w-8 h-8', text: 'text-base', padding: 'px-3 py-1.5' }
  }
  const s = sizes[size]

  return (
    <div
      className={`flex items-center gap-1.5 ${s.padding} rounded-full bg-zinc-800 group ${
        onClick ? 'cursor-pointer hover:bg-zinc-700' : ''
      } ${className}`}
      onClick={onClick}
    >
      <div className={`${s.avatar} rounded-full bg-zinc-700 overflow-hidden flex-shrink-0`}>
        {performer.avatar ? (
          <img src={performer.avatar} alt="" className="w-full h-full object-cover" />
        ) : (
          <User className="w-full h-full p-1 text-zinc-500" />
        )}
      </div>
      <span className={s.text}>{performer.name}</span>
      {onRemove && (
        <button
          onClick={(e) => { e.stopPropagation(); onRemove() }}
          className="p-0.5 rounded-full hover:bg-zinc-600 opacity-0 group-hover:opacity-100 transition"
        >
          <X size={10} />
        </button>
      )}
    </div>
  )
}

export default PerformerTagger
