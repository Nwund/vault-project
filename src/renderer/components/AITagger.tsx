// File: src/renderer/components/AITagger.tsx
// AI-powered automatic tagging system

import React, { useState, useCallback, useMemo } from 'react'
import { Sparkles, Tag, Loader2, Check, X, RefreshCw, Settings, Brain, Zap, Cloud, Eye, Plus, Trash2 } from 'lucide-react'

interface SuggestedTag { tag: string; confidence: number; source: 'vision' | 'audio' | 'text' | 'scene' }
interface AITaggerProps { mediaId: string; currentTags: string[]; onTagsChange: (tags: string[]) => void; onAnalyze: () => Promise<SuggestedTag[]>; className?: string }

export function AITagger({ mediaId, currentTags, onTagsChange, onAnalyze, className = '' }: AITaggerProps) {
  const [suggestions, setSuggestions] = useState<SuggestedTag[]>([])
  const [analyzing, setAnalyzing] = useState(false)
  const [threshold, setThreshold] = useState(0.6)
  const [autoAccept, setAutoAccept] = useState(false)
  const [sources, setSources] = useState<Set<SuggestedTag['source']>>(new Set(['vision', 'scene']))

  const filteredSuggestions = useMemo(() =>
    suggestions.filter(s => s.confidence >= threshold && sources.has(s.source) && !currentTags.includes(s.tag)).sort((a, b) => b.confidence - a.confidence),
    [suggestions, threshold, sources, currentTags]
  )

  const analyze = useCallback(async () => {
    setAnalyzing(true)
    try {
      const results = await onAnalyze()
      setSuggestions(results)
      if (autoAccept) {
        const toAdd = results.filter(s => s.confidence >= threshold && sources.has(s.source) && !currentTags.includes(s.tag)).map(s => s.tag)
        onTagsChange([...currentTags, ...toAdd])
      }
    } catch (e) { console.error('AI analysis failed:', e) }
    finally { setAnalyzing(false) }
  }, [onAnalyze, autoAccept, threshold, sources, currentTags, onTagsChange])

  const acceptTag = useCallback((tag: string) => { if (!currentTags.includes(tag)) onTagsChange([...currentTags, tag]) }, [currentTags, onTagsChange])
  const rejectTag = useCallback((tag: string) => { setSuggestions(s => s.filter(t => t.tag !== tag)) }, [])
  const acceptAll = useCallback(() => { onTagsChange([...currentTags, ...filteredSuggestions.map(s => s.tag)]); setSuggestions([]) }, [currentTags, filteredSuggestions, onTagsChange])
  const removeTag = useCallback((tag: string) => { onTagsChange(currentTags.filter(t => t !== tag)) }, [currentTags, onTagsChange])
  const toggleSource = useCallback((src: SuggestedTag['source']) => { setSources(s => { const n = new Set(s); n.has(src) ? n.delete(src) : n.add(src); return n }) }, [])

  const sourceIcons: Record<SuggestedTag['source'], React.ElementType> = { vision: Eye, audio: Brain, text: Tag, scene: Sparkles }
  const sourceColors: Record<SuggestedTag['source'], string> = { vision: 'text-blue-400', audio: 'text-purple-400', text: 'text-green-400', scene: 'text-orange-400' }

  return (
    <div className={`bg-zinc-900 rounded-xl border border-zinc-700 overflow-hidden ${className}`}>
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
        <div className="flex items-center gap-2"><Sparkles size={16} className="text-[var(--primary)]" /><span className="font-semibold text-sm">AI Tagger</span></div>
        <button onClick={analyze} disabled={analyzing} className="flex items-center gap-2 px-3 py-1.5 rounded bg-[var(--primary)] text-sm disabled:opacity-50">{analyzing ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}Analyze</button>
      </div>
      {/* Settings */}
      <div className="px-4 py-3 border-b border-zinc-800 space-y-3">
        <div><div className="flex items-center justify-between text-xs mb-1"><span className="text-zinc-500">Confidence threshold</span><span>{Math.round(threshold * 100)}%</span></div><input type="range" min={0.3} max={0.9} step={0.05} value={threshold} onChange={e => setThreshold(parseFloat(e.target.value))} className="w-full accent-[var(--primary)]" /></div>
        <div className="flex items-center justify-between"><div className="flex gap-2">{(['vision', 'scene', 'audio', 'text'] as const).map(src => { const Icon = sourceIcons[src]; return <button key={src} onClick={() => toggleSource(src)} className={`p-1.5 rounded ${sources.has(src) ? 'bg-zinc-700' : 'bg-zinc-800 opacity-50'}`} title={src}><Icon size={12} className={sourceColors[src]} /></button> })}</div>
        <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={autoAccept} onChange={e => setAutoAccept(e.target.checked)} className="accent-[var(--primary)]" />Auto-accept</label></div>
      </div>
      {/* Current tags */}
      <div className="px-4 py-3 border-b border-zinc-800">
        <div className="text-xs text-zinc-500 mb-2">Current Tags ({currentTags.length})</div>
        <div className="flex flex-wrap gap-1">{currentTags.map(tag => <span key={tag} className="flex items-center gap-1 px-2 py-1 bg-[var(--primary)]/20 text-[var(--primary)] rounded text-xs">{tag}<button onClick={() => removeTag(tag)}><X size={10} /></button></span>)}{currentTags.length === 0 && <span className="text-zinc-600 text-sm">No tags yet</span>}</div>
      </div>
      {/* Suggestions */}
      <div className="max-h-48 overflow-y-auto">
        {analyzing ? <div className="py-8 text-center"><Loader2 size={24} className="mx-auto mb-2 animate-spin text-[var(--primary)]" /><p className="text-sm text-zinc-500">Analyzing media...</p></div>
        : filteredSuggestions.length === 0 ? <div className="py-8 text-center text-zinc-500"><Brain size={24} className="mx-auto mb-2 opacity-50" /><p className="text-sm">No suggestions{suggestions.length > 0 ? ' (adjust threshold)' : ''}</p></div>
        : <>{filteredSuggestions.map(s => { const Icon = sourceIcons[s.source]; return (
          <div key={s.tag} className="flex items-center gap-3 px-4 py-2 hover:bg-zinc-800/50 group">
            <Icon size={12} className={sourceColors[s.source]} />
            <span className="flex-1 text-sm">{s.tag}</span>
            <div className="w-16 h-1.5 bg-zinc-800 rounded-full overflow-hidden"><div className="h-full bg-[var(--primary)]" style={{ width: `${s.confidence * 100}%` }} /></div>
            <span className="w-10 text-xs text-zinc-500 text-right">{Math.round(s.confidence * 100)}%</span>
            <div className="flex gap-1 opacity-0 group-hover:opacity-100">
              <button onClick={() => acceptTag(s.tag)} className="p-1 rounded bg-green-500/20 text-green-400"><Check size={12} /></button>
              <button onClick={() => rejectTag(s.tag)} className="p-1 rounded bg-red-500/20 text-red-400"><X size={12} /></button>
            </div>
          </div>
        )})}
        {filteredSuggestions.length > 0 && <div className="px-4 py-2 border-t border-zinc-800"><button onClick={acceptAll} className="w-full py-2 bg-green-500/20 text-green-400 rounded text-sm">Accept All ({filteredSuggestions.length})</button></div>}
        </>}
      </div>
    </div>
  )
}
export default AITagger
