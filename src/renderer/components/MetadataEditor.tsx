// File: src/renderer/components/MetadataEditor.tsx
// Advanced metadata editor for media files

import React, { useState, useCallback, useEffect } from 'react'
import { FileText, Save, RotateCcw, Plus, Trash2, Calendar, Clock, Film, Image as ImageIcon, Hash, Tag, User, Globe, Link2, Star, Heart, AlertCircle, Check, ChevronDown, Loader2 } from 'lucide-react'
import { formatDuration } from '../utils/formatters'

interface MediaData {
  id: string
  title: string
  tags: string[]
  performers: string[]
  rating: number
  customFields: Record<string, string>
}

interface MetadataEditorProps {
  media?: MediaData
  mediaId?: string
  onSave?: (data: MediaData) => void
  onClose?: () => void
  className?: string
}

export function MetadataEditor({ media, mediaId, onSave, onClose, className = '' }: MetadataEditorProps) {
  const [loading, setLoading] = useState(!media)
  const [saving, setSaving] = useState(false)
  const [data, setData] = useState<MediaData>(media || { id: mediaId || '', title: '', tags: [], performers: [], rating: 0, customFields: {} })
  const [originalData, setOriginalData] = useState<MediaData | null>(null)
  const [newTag, setNewTag] = useState('')
  const [newPerformer, setNewPerformer] = useState('')
  const [newCustomKey, setNewCustomKey] = useState('')
  const [newCustomVal, setNewCustomVal] = useState('')
  const [activeTab, setActiveTab] = useState<'basic' | 'tags' | 'custom'>('basic')

  // Fetch media data if only mediaId provided
  useEffect(() => {
    const fetchMedia = async () => {
      if (media || !mediaId) return
      setLoading(true)
      try {
        const result = await window.api.invoke('media:getById', mediaId)
        if (result) {
          const tags = await window.api.invoke('tags:getForMedia', mediaId) || []
          const loaded: MediaData = {
            id: mediaId,
            title: result.filename || '',
            tags: tags.map((t: any) => t.name || t),
            performers: [],
            rating: result.rating || 0,
            customFields: {}
          }
          setData(loaded)
          setOriginalData(loaded)
        }
      } catch (e) {
        console.error('Failed to load media:', e)
      }
      setLoading(false)
    }
    fetchMedia()
  }, [media, mediaId])

  const hasChanges = JSON.stringify(data) !== JSON.stringify(originalData)

  const update = useCallback((updates: Partial<MediaData>) => {
    setData(prev => ({ ...prev, ...updates }))
  }, [])

  const handleSave = useCallback(async () => {
    setSaving(true)
    try {
      // Save rating
      if (data.rating !== originalData?.rating) {
        await window.api.media?.setRating?.(data.id, data.rating)
      }

      // Update tags - add new, remove old
      const oldTags = new Set(originalData?.tags || [])
      const newTags = new Set(data.tags)
      for (const tag of data.tags) {
        if (!oldTags.has(tag)) {
          await window.api.invoke('tags:addToMedia', data.id, tag)
        }
      }
      for (const tag of originalData?.tags || []) {
        if (!newTags.has(tag)) {
          await window.api.invoke('tags:removeFromMedia', data.id, tag)
        }
      }

      setOriginalData(data)
      onSave?.(data)
    } catch (e) {
      console.error('Failed to save metadata:', e)
    }
    setSaving(false)
  }, [data, originalData, onSave])

  const addTag = useCallback(() => {
    if (newTag.trim() && !data.tags.includes(newTag.trim())) {
      update({ tags: [...data.tags, newTag.trim()] })
      setNewTag('')
    }
  }, [newTag, data.tags, update])

  const removeTag = useCallback((tag: string) => {
    update({ tags: data.tags.filter(t => t !== tag) })
  }, [data.tags, update])

  const addPerformer = useCallback(() => {
    if (newPerformer.trim() && !data.performers.includes(newPerformer.trim())) {
      update({ performers: [...data.performers, newPerformer.trim()] })
      setNewPerformer('')
    }
  }, [newPerformer, data.performers, update])

  const removePerformer = useCallback((p: string) => {
    update({ performers: data.performers.filter(x => x !== p) })
  }, [data.performers, update])

  const addCustom = useCallback(() => {
    if (newCustomKey.trim()) {
      update({ customFields: { ...data.customFields, [newCustomKey.trim()]: newCustomVal } })
      setNewCustomKey('')
      setNewCustomVal('')
    }
  }, [newCustomKey, newCustomVal, data.customFields, update])

  const removeCustom = useCallback((key: string) => {
    const c = { ...data.customFields }
    delete c[key]
    update({ customFields: c })
  }, [data.customFields, update])

  if (loading) {
    return (
      <div className={`bg-zinc-900 rounded-xl border border-zinc-700 p-8 flex items-center justify-center ${className}`}>
        <Loader2 size={24} className="animate-spin text-zinc-500" />
      </div>
    )
  }

  return (
    <div className={`bg-zinc-900 rounded-xl border border-zinc-700 overflow-hidden ${className}`}>
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
        <div className="flex items-center gap-2">
          <FileText size={16} className="text-[var(--primary)]" />
          <span className="font-semibold text-sm">Metadata Editor</span>
          {hasChanges && <span className="w-2 h-2 rounded-full bg-orange-400" />}
        </div>
        <div className="flex gap-2">
          {onClose && (
            <button onClick={onClose} className="px-3 py-1.5 rounded bg-zinc-800 text-sm">Cancel</button>
          )}
          <button onClick={handleSave} disabled={saving || !hasChanges} className="flex items-center gap-2 px-3 py-1.5 rounded bg-[var(--primary)] text-sm disabled:opacity-50">
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}Save
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-zinc-800">
        {(['basic', 'tags', 'custom'] as const).map(t => (
          <button
            key={t}
            onClick={() => setActiveTab(t)}
            className={`flex-1 py-2 text-sm ${activeTab === t ? 'border-b-2 border-[var(--primary)]' : 'text-zinc-500'}`}
          >
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      <div className="p-4 max-h-96 overflow-y-auto">
        {activeTab === 'basic' && (
          <div className="space-y-4">
            <div>
              <label className="text-xs text-zinc-500">Title</label>
              <input
                value={data.title}
                onChange={e => update({ title: e.target.value })}
                className="w-full mt-1 px-3 py-2 bg-zinc-800 border border-zinc-700 rounded text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-zinc-500">Rating</label>
              <div className="flex items-center gap-1 mt-2">
                {[1, 2, 3, 4, 5].map(r => (
                  <button key={r} onClick={() => update({ rating: r === data.rating ? 0 : r })}>
                    <Star size={20} className={r <= data.rating ? 'text-yellow-400 fill-yellow-400' : 'text-zinc-600'} />
                  </button>
                ))}
                {data.rating > 0 && <span className="ml-2 text-xs text-zinc-500">{data.rating}/5</span>}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'tags' && (
          <div className="space-y-4">
            <div>
              <label className="text-xs text-zinc-500">Tags</label>
              <div className="flex flex-wrap gap-1 mt-2">
                {data.tags.map(t => (
                  <span key={t} className="flex items-center gap-1 px-2 py-1 bg-[var(--primary)]/20 text-[var(--primary)] rounded text-xs">
                    <Tag size={10} />{t}
                    <button onClick={() => removeTag(t)} className="ml-1 hover:text-white"><Trash2 size={10} /></button>
                  </span>
                ))}
              </div>
              <div className="flex gap-2 mt-2">
                <input
                  value={newTag}
                  onChange={e => setNewTag(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addTag()}
                  placeholder="Add tag"
                  className="flex-1 px-3 py-2 bg-zinc-800 border border-zinc-700 rounded text-sm"
                />
                <button onClick={addTag} className="px-3 py-2 bg-zinc-800 hover:bg-zinc-700 rounded"><Plus size={14} /></button>
              </div>
            </div>
            <div>
              <label className="text-xs text-zinc-500">Performers</label>
              <div className="flex flex-wrap gap-1 mt-2">
                {data.performers.map(p => (
                  <span key={p} className="flex items-center gap-1 px-2 py-1 bg-zinc-800 rounded text-xs">
                    <User size={10} />{p}
                    <button onClick={() => removePerformer(p)} className="ml-1 hover:text-red-400"><Trash2 size={10} /></button>
                  </span>
                ))}
              </div>
              <div className="flex gap-2 mt-2">
                <input
                  value={newPerformer}
                  onChange={e => setNewPerformer(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addPerformer()}
                  placeholder="Add performer"
                  className="flex-1 px-3 py-2 bg-zinc-800 border border-zinc-700 rounded text-sm"
                />
                <button onClick={addPerformer} className="px-3 py-2 bg-zinc-800 hover:bg-zinc-700 rounded"><Plus size={14} /></button>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'custom' && (
          <div className="space-y-3">
            {Object.entries(data.customFields).map(([k, v]) => (
              <div key={k} className="flex items-center gap-2">
                <span className="w-24 text-xs text-zinc-500 truncate">{k}</span>
                <input
                  value={v}
                  onChange={e => update({ customFields: { ...data.customFields, [k]: e.target.value } })}
                  className="flex-1 px-2 py-1 bg-zinc-800 rounded text-sm"
                />
                <button onClick={() => removeCustom(k)} className="p-1 text-red-400 hover:bg-red-500/20 rounded"><Trash2 size={12} /></button>
              </div>
            ))}
            <div className="flex gap-2 pt-2 border-t border-zinc-800">
              <input value={newCustomKey} onChange={e => setNewCustomKey(e.target.value)} placeholder="Key" className="w-24 px-2 py-1 bg-zinc-800 rounded text-sm" />
              <input value={newCustomVal} onChange={e => setNewCustomVal(e.target.value)} placeholder="Value" className="flex-1 px-2 py-1 bg-zinc-800 rounded text-sm" />
              <button onClick={addCustom} className="px-3 py-1 bg-zinc-800 hover:bg-zinc-700 rounded"><Plus size={14} /></button>
            </div>
            {Object.keys(data.customFields).length === 0 && (
              <p className="text-xs text-zinc-500 text-center py-4">Add custom metadata fields</p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
export default MetadataEditor
