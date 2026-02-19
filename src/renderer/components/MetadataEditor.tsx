// File: src/renderer/components/MetadataEditor.tsx
// Advanced metadata editor for media files

import React, { useState, useCallback, useMemo } from 'react'
import { FileText, Save, RotateCcw, Plus, Trash2, Calendar, Clock, Film, Image as ImageIcon, Hash, Tag, User, Globe, Link2, Star, Heart, AlertCircle, Check, ChevronDown } from 'lucide-react'
import { formatDate, formatFileSize, formatDuration } from '../utils/formatters'

interface MediaMetadata { title: string; description?: string; date?: string; rating?: number; tags: string[]; performers: string[]; studio?: string; series?: string; episode?: number; duration?: number; resolution?: string; fileSize?: number; custom: Record<string, string> }
interface MetadataEditorProps { metadata: MediaMetadata; fileInfo?: { path: string; type: 'video' | 'image'; created: number; modified: number }; onChange: (meta: MediaMetadata) => void; onSave: () => Promise<void>; className?: string }

export function MetadataEditor({ metadata, fileInfo, onChange, onSave, className = '' }: MetadataEditorProps) {
  const [saving, setSaving] = useState(false)
  const [newTag, setNewTag] = useState('')
  const [newPerformer, setNewPerformer] = useState('')
  const [newCustomKey, setNewCustomKey] = useState('')
  const [newCustomVal, setNewCustomVal] = useState('')
  const [activeTab, setActiveTab] = useState<'basic' | 'tags' | 'custom'>('basic')
  const [hasChanges, setHasChanges] = useState(false)

  const update = useCallback((updates: Partial<MediaMetadata>) => { onChange({ ...metadata, ...updates }); setHasChanges(true) }, [metadata, onChange])
  const handleSave = useCallback(async () => { setSaving(true); await onSave(); setSaving(false); setHasChanges(false) }, [onSave])

  const addTag = useCallback(() => { if (newTag.trim() && !metadata.tags.includes(newTag.trim())) { update({ tags: [...metadata.tags, newTag.trim()] }); setNewTag('') } }, [newTag, metadata.tags, update])
  const removeTag = useCallback((tag: string) => update({ tags: metadata.tags.filter(t => t !== tag) }), [metadata.tags, update])
  const addPerformer = useCallback(() => { if (newPerformer.trim() && !metadata.performers.includes(newPerformer.trim())) { update({ performers: [...metadata.performers, newPerformer.trim()] }); setNewPerformer('') } }, [newPerformer, metadata.performers, update])
  const removePerformer = useCallback((p: string) => update({ performers: metadata.performers.filter(x => x !== p) }), [metadata.performers, update])
  const addCustom = useCallback(() => { if (newCustomKey.trim()) { update({ custom: { ...metadata.custom, [newCustomKey.trim()]: newCustomVal } }); setNewCustomKey(''); setNewCustomVal('') } }, [newCustomKey, newCustomVal, metadata.custom, update])
  const removeCustom = useCallback((key: string) => { const c = { ...metadata.custom }; delete c[key]; update({ custom: c }) }, [metadata.custom, update])

  return (
    <div className={`bg-zinc-900 rounded-xl border border-zinc-700 overflow-hidden ${className}`}>
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
        <div className="flex items-center gap-2"><FileText size={16} className="text-[var(--primary)]" /><span className="font-semibold text-sm">Metadata</span>{hasChanges && <span className="w-2 h-2 rounded-full bg-orange-400" />}</div>
        <button onClick={handleSave} disabled={saving || !hasChanges} className="flex items-center gap-2 px-3 py-1.5 rounded bg-[var(--primary)] text-sm disabled:opacity-50">{saving ? <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Save size={14} />}Save</button>
      </div>
      {/* Tabs */}
      <div className="flex border-b border-zinc-800">{(['basic', 'tags', 'custom'] as const).map(t => <button key={t} onClick={() => setActiveTab(t)} className={`flex-1 py-2 text-sm ${activeTab === t ? 'border-b-2 border-[var(--primary)]' : 'text-zinc-500'}`}>{t.charAt(0).toUpperCase() + t.slice(1)}</button>)}</div>
      <div className="p-4 max-h-96 overflow-y-auto">
        {activeTab === 'basic' && <div className="space-y-4">
          <div><label className="text-xs text-zinc-500">Title</label><input value={metadata.title} onChange={e => update({ title: e.target.value })} className="w-full mt-1 px-3 py-2 bg-zinc-800 border border-zinc-700 rounded text-sm" /></div>
          <div><label className="text-xs text-zinc-500">Description</label><textarea value={metadata.description || ''} onChange={e => update({ description: e.target.value })} className="w-full mt-1 px-3 py-2 bg-zinc-800 border border-zinc-700 rounded text-sm resize-none" rows={3} /></div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="text-xs text-zinc-500">Date</label><input type="date" value={metadata.date || ''} onChange={e => update({ date: e.target.value })} className="w-full mt-1 px-3 py-2 bg-zinc-800 border border-zinc-700 rounded text-sm" /></div>
            <div><label className="text-xs text-zinc-500">Rating</label><div className="flex items-center gap-1 mt-2">{[1,2,3,4,5].map(r => <button key={r} onClick={() => update({ rating: r === metadata.rating ? 0 : r })}><Star size={18} className={r <= (metadata.rating || 0) ? 'text-yellow-400 fill-yellow-400' : 'text-zinc-600'} /></button>)}</div></div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="text-xs text-zinc-500">Studio</label><input value={metadata.studio || ''} onChange={e => update({ studio: e.target.value })} className="w-full mt-1 px-3 py-2 bg-zinc-800 border border-zinc-700 rounded text-sm" /></div>
            <div><label className="text-xs text-zinc-500">Series</label><input value={metadata.series || ''} onChange={e => update({ series: e.target.value })} className="w-full mt-1 px-3 py-2 bg-zinc-800 border border-zinc-700 rounded text-sm" /></div>
          </div>
          {fileInfo && <div className="pt-3 border-t border-zinc-800 space-y-1 text-xs text-zinc-500">
            <div className="flex justify-between"><span>Type</span><span className="flex items-center gap-1">{fileInfo.type === 'video' ? <Film size={10} /> : <ImageIcon size={10} />}{fileInfo.type}</span></div>
            {metadata.resolution && <div className="flex justify-between"><span>Resolution</span><span>{metadata.resolution}</span></div>}
            {metadata.duration && <div className="flex justify-between"><span>Duration</span><span>{formatDuration(metadata.duration)}</span></div>}
            {metadata.fileSize && <div className="flex justify-between"><span>Size</span><span>{formatFileSize(metadata.fileSize)}</span></div>}
          </div>}
        </div>}
        {activeTab === 'tags' && <div className="space-y-4">
          <div><label className="text-xs text-zinc-500">Tags</label>
            <div className="flex flex-wrap gap-1 mt-2">{metadata.tags.map(t => <span key={t} className="flex items-center gap-1 px-2 py-1 bg-[var(--primary)]/20 text-[var(--primary)] rounded text-xs">{t}<button onClick={() => removeTag(t)}><Trash2 size={10} /></button></span>)}</div>
            <div className="flex gap-2 mt-2"><input value={newTag} onChange={e => setNewTag(e.target.value)} onKeyDown={e => e.key === 'Enter' && addTag()} placeholder="Add tag" className="flex-1 px-3 py-2 bg-zinc-800 border border-zinc-700 rounded text-sm" /><button onClick={addTag} className="px-3 py-2 bg-zinc-800 rounded"><Plus size={14} /></button></div>
          </div>
          <div><label className="text-xs text-zinc-500">Performers</label>
            <div className="flex flex-wrap gap-1 mt-2">{metadata.performers.map(p => <span key={p} className="flex items-center gap-1 px-2 py-1 bg-zinc-800 rounded text-xs"><User size={10} />{p}<button onClick={() => removePerformer(p)}><Trash2 size={10} /></button></span>)}</div>
            <div className="flex gap-2 mt-2"><input value={newPerformer} onChange={e => setNewPerformer(e.target.value)} onKeyDown={e => e.key === 'Enter' && addPerformer()} placeholder="Add performer" className="flex-1 px-3 py-2 bg-zinc-800 border border-zinc-700 rounded text-sm" /><button onClick={addPerformer} className="px-3 py-2 bg-zinc-800 rounded"><Plus size={14} /></button></div>
          </div>
        </div>}
        {activeTab === 'custom' && <div className="space-y-3">
          {Object.entries(metadata.custom).map(([k, v]) => <div key={k} className="flex items-center gap-2"><span className="w-24 text-xs text-zinc-500 truncate">{k}</span><input value={v} onChange={e => update({ custom: { ...metadata.custom, [k]: e.target.value } })} className="flex-1 px-2 py-1 bg-zinc-800 rounded text-sm" /><button onClick={() => removeCustom(k)} className="p-1 text-red-400"><Trash2 size={12} /></button></div>)}
          <div className="flex gap-2 pt-2 border-t border-zinc-800"><input value={newCustomKey} onChange={e => setNewCustomKey(e.target.value)} placeholder="Key" className="w-24 px-2 py-1 bg-zinc-800 rounded text-sm" /><input value={newCustomVal} onChange={e => setNewCustomVal(e.target.value)} placeholder="Value" className="flex-1 px-2 py-1 bg-zinc-800 rounded text-sm" /><button onClick={addCustom} className="px-3 py-1 bg-zinc-800 rounded"><Plus size={14} /></button></div>
        </div>}
      </div>
    </div>
  )
}
export default MetadataEditor
