// File: src/renderer/components/AITagger.tsx
// AI-powered automatic tagging system

import React, { useState, useCallback, useMemo, useEffect } from 'react'
import { Sparkles, Tag, Loader2, Check, X, RefreshCw, Settings, Brain, Zap, Cloud, Eye, Plus, Trash2, AlertCircle } from 'lucide-react'

interface SuggestedTag { tag: string; confidence: number; source: 'vision' | 'audio' | 'text' | 'scene' }
interface AITaggerProps {
  mediaId: string
  mediaSrc?: string
  mediaType?: 'video' | 'image' | 'gif'
  onApplyTags?: (tags: string[]) => void
  className?: string
}

export function AITagger({ mediaId, mediaSrc, mediaType = 'video', onApplyTags, className = '' }: AITaggerProps) {
  const [currentTags, setCurrentTags] = useState<string[]>([])
  const [suggestions, setSuggestions] = useState<SuggestedTag[]>([])
  const [analyzing, setAnalyzing] = useState(false)
  const [loading, setLoading] = useState(true)
  const [threshold, setThreshold] = useState(0.6)
  const [autoAccept, setAutoAccept] = useState(false)
  const [sources, setSources] = useState<Set<SuggestedTag['source']>>(new Set(['vision', 'scene']))
  const [error, setError] = useState<string | null>(null)
  const [aiStatus, setAiStatus] = useState<'checking' | 'available' | 'unavailable'>('checking')

  // Load current tags
  useEffect(() => {
    const fetchTags = async () => {
      setLoading(true)
      try {
        const tags = await window.api.invoke('tags:getForMedia', mediaId)
        setCurrentTags((tags || []).map((t: any) => t.name || t))
      } catch (e) {
        console.error('Failed to fetch tags:', e)
      }
      setLoading(false)
    }
    fetchTags()
  }, [mediaId])

  // Check AI availability
  useEffect(() => {
    const checkAI = async () => {
      try {
        const models = await window.api.ai?.checkModels?.()
        setAiStatus(models?.onnx || models?.venice || models?.ollama ? 'available' : 'unavailable')
      } catch {
        setAiStatus('unavailable')
      }
    }
    checkAI()
  }, [])

  const filteredSuggestions = useMemo(() =>
    suggestions.filter(s => s.confidence >= threshold && sources.has(s.source) && !currentTags.includes(s.tag)).sort((a, b) => b.confidence - a.confidence),
    [suggestions, threshold, sources, currentTags]
  )

  const analyze = useCallback(async () => {
    setAnalyzing(true)
    setError(null)
    setSuggestions([])

    try {
      // Try to queue for AI analysis
      const queueResult = await window.api.ai?.queueForAnalysis?.([mediaId])

      // Also try direct ONNX/WD tagger if available
      let results: SuggestedTag[] = []

      try {
        // Get any existing AI analysis
        const existing = await window.api.invoke('media:getAnalysis', mediaId)
        if (existing?.tags) {
          results = existing.tags.map((t: any) => ({
            tag: t.name || t.tag || t,
            confidence: t.confidence || t.score || 0.8,
            source: 'vision' as const
          }))
        }
      } catch {}

      // If no results, try video analysis API
      if (results.length === 0 && mediaType === 'video') {
        try {
          const analysis = await window.api.invoke('ai:analyzeVideo', mediaId)
          if (analysis?.tags) {
            results = analysis.tags.map((t: any) => ({
              tag: t.name || t.tag || t,
              confidence: t.confidence || t.score || 0.7,
              source: t.source || 'scene' as const
            }))
          }
        } catch {}
      }

      // Try WD tagger for images
      if (results.length === 0) {
        try {
          const wdResult = await window.api.invoke('ai:wdTag', mediaId)
          if (wdResult?.tags) {
            results = wdResult.tags.map((t: any) => ({
              tag: t.name || t.tag || t,
              confidence: t.confidence || t.score || 0.6,
              source: 'vision' as const
            }))
          }
        } catch {}
      }

      // Generate some sample suggestions if no AI results
      if (results.length === 0) {
        // Fallback: suggest based on filename
        const media = await window.api.invoke('media:getById', mediaId)
        if (media?.filename) {
          const words = media.filename.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((w: string) => w.length > 3)
          results = words.slice(0, 5).map((word: string) => ({
            tag: word,
            confidence: 0.5,
            source: 'text' as const
          }))
        }
      }

      setSuggestions(results)

      if (autoAccept && results.length > 0) {
        const toAdd = results.filter(s => s.confidence >= threshold && sources.has(s.source) && !currentTags.includes(s.tag)).map(s => s.tag)
        if (toAdd.length > 0) {
          const newTags = [...currentTags, ...toAdd]
          setCurrentTags(newTags)
          // Save to backend
          for (const tag of toAdd) {
            await window.api.invoke('tags:addToMedia', mediaId, tag)
          }
          onApplyTags?.(newTags)
        }
      }

      if (results.length === 0) {
        setError('No tags detected. Try adjusting the threshold or queue for full AI analysis.')
      }
    } catch (e: any) {
      console.error('AI analysis failed:', e)
      setError(e.message || 'AI analysis failed')
    }
    setAnalyzing(false)
  }, [mediaId, mediaType, autoAccept, threshold, sources, currentTags, onApplyTags])

  const acceptTag = useCallback(async (tag: string) => {
    if (!currentTags.includes(tag)) {
      const newTags = [...currentTags, tag]
      setCurrentTags(newTags)
      try {
        await window.api.invoke('tags:addToMedia', mediaId, tag)
        onApplyTags?.(newTags)
      } catch (e) {
        console.error('Failed to add tag:', e)
      }
    }
  }, [mediaId, currentTags, onApplyTags])

  const rejectTag = useCallback((tag: string) => {
    setSuggestions(s => s.filter(t => t.tag !== tag))
  }, [])

  const acceptAll = useCallback(async () => {
    const toAdd = filteredSuggestions.map(s => s.tag)
    const newTags = [...currentTags, ...toAdd]
    setCurrentTags(newTags)

    for (const tag of toAdd) {
      try {
        await window.api.invoke('tags:addToMedia', mediaId, tag)
      } catch {}
    }

    setSuggestions([])
    onApplyTags?.(newTags)
  }, [mediaId, currentTags, filteredSuggestions, onApplyTags])

  const removeTag = useCallback(async (tag: string) => {
    const newTags = currentTags.filter(t => t !== tag)
    setCurrentTags(newTags)
    try {
      await window.api.invoke('tags:removeFromMedia', mediaId, tag)
    } catch {}
  }, [mediaId, currentTags])

  const toggleSource = useCallback((src: SuggestedTag['source']) => {
    setSources(s => {
      const n = new Set(s)
      n.has(src) ? n.delete(src) : n.add(src)
      return n
    })
  }, [])

  const sourceIcons: Record<SuggestedTag['source'], React.ElementType> = { vision: Eye, audio: Brain, text: Tag, scene: Sparkles }
  const sourceColors: Record<SuggestedTag['source'], string> = { vision: 'text-blue-400', audio: 'text-purple-400', text: 'text-green-400', scene: 'text-orange-400' }

  return (
    <div className={`bg-zinc-900 rounded-xl border border-zinc-700 overflow-hidden ${className}`}>
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
        <div className="flex items-center gap-2">
          <Sparkles size={16} className="text-[var(--primary)]" />
          <span className="font-semibold text-sm">AI Auto-Tagger</span>
          {aiStatus === 'available' && <span className="w-2 h-2 rounded-full bg-green-400" title="AI Available" />}
          {aiStatus === 'unavailable' && <span className="w-2 h-2 rounded-full bg-yellow-400" title="Limited AI" />}
        </div>
        <button onClick={analyze} disabled={analyzing} className="flex items-center gap-2 px-3 py-1.5 rounded bg-[var(--primary)] text-sm disabled:opacity-50">
          {analyzing ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
          {analyzing ? 'Analyzing...' : 'Analyze'}
        </button>
      </div>

      {/* Settings */}
      <div className="px-4 py-3 border-b border-zinc-800 space-y-3">
        <div>
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="text-zinc-500">Confidence threshold</span>
            <span>{Math.round(threshold * 100)}%</span>
          </div>
          <input type="range" min={0.3} max={0.9} step={0.05} value={threshold} onChange={e => setThreshold(parseFloat(e.target.value))} className="w-full accent-[var(--primary)]" />
        </div>
        <div className="flex items-center justify-between">
          <div className="flex gap-2">
            {(['vision', 'scene', 'audio', 'text'] as const).map(src => {
              const Icon = sourceIcons[src]
              return (
                <button key={src} onClick={() => toggleSource(src)} className={`p-1.5 rounded ${sources.has(src) ? 'bg-zinc-700' : 'bg-zinc-800 opacity-50'}`} title={src}>
                  <Icon size={12} className={sourceColors[src]} />
                </button>
              )
            })}
          </div>
          <label className="flex items-center gap-2 text-xs">
            <input type="checkbox" checked={autoAccept} onChange={e => setAutoAccept(e.target.checked)} className="accent-[var(--primary)]" />
            Auto-accept
          </label>
        </div>
      </div>

      {/* Current tags */}
      <div className="px-4 py-3 border-b border-zinc-800">
        <div className="text-xs text-zinc-500 mb-2">Current Tags ({currentTags.length})</div>
        <div className="flex flex-wrap gap-1">
          {loading ? (
            <Loader2 size={14} className="animate-spin text-zinc-500" />
          ) : currentTags.length === 0 ? (
            <span className="text-zinc-600 text-sm">No tags yet</span>
          ) : (
            currentTags.map(tag => (
              <span key={tag} className="flex items-center gap-1 px-2 py-1 bg-[var(--primary)]/20 text-[var(--primary)] rounded text-xs">
                {tag}
                <button onClick={() => removeTag(tag)} className="hover:text-white"><X size={10} /></button>
              </span>
            ))
          )}
        </div>
      </div>

      {/* Error message */}
      {error && (
        <div className="px-4 py-2 bg-yellow-500/10 border-b border-yellow-500/20">
          <div className="flex items-center gap-2 text-xs text-yellow-400">
            <AlertCircle size={12} />
            {error}
          </div>
        </div>
      )}

      {/* Suggestions */}
      <div className="max-h-48 overflow-y-auto">
        {analyzing ? (
          <div className="py-8 text-center">
            <Loader2 size={24} className="mx-auto mb-2 animate-spin text-[var(--primary)]" />
            <p className="text-sm text-zinc-500">Analyzing media...</p>
            <p className="text-xs text-zinc-600 mt-1">This may take a moment</p>
          </div>
        ) : filteredSuggestions.length === 0 ? (
          <div className="py-8 text-center text-zinc-500">
            <Brain size={24} className="mx-auto mb-2 opacity-50" />
            <p className="text-sm">
              {suggestions.length > 0 ? 'No suggestions (adjust threshold)' : 'Click Analyze to get AI suggestions'}
            </p>
          </div>
        ) : (
          <>
            {filteredSuggestions.map(s => {
              const Icon = sourceIcons[s.source]
              return (
                <div key={s.tag} className="flex items-center gap-3 px-4 py-2 hover:bg-zinc-800/50 group">
                  <Icon size={12} className={sourceColors[s.source]} />
                  <span className="flex-1 text-sm">{s.tag}</span>
                  <div className="w-16 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                    <div className="h-full bg-[var(--primary)]" style={{ width: `${s.confidence * 100}%` }} />
                  </div>
                  <span className="w-10 text-xs text-zinc-500 text-right">{Math.round(s.confidence * 100)}%</span>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100">
                    <button onClick={() => acceptTag(s.tag)} className="p-1 rounded bg-green-500/20 text-green-400"><Check size={12} /></button>
                    <button onClick={() => rejectTag(s.tag)} className="p-1 rounded bg-red-500/20 text-red-400"><X size={12} /></button>
                  </div>
                </div>
              )
            })}
            {filteredSuggestions.length > 0 && (
              <div className="px-4 py-2 border-t border-zinc-800">
                <button onClick={acceptAll} className="w-full py-2 bg-green-500/20 text-green-400 rounded text-sm hover:bg-green-500/30 transition">
                  Accept All ({filteredSuggestions.length})
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
export default AITagger
