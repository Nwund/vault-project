// File: src/renderer/components/RelatedMediaPanel.tsx
// Show related media items (sequels, series, etc.)

import { useState, useEffect, useCallback } from 'react'
import { Link2, Plus, ChevronRight, Film, Image, Sparkles, Trash2, X, Play, ListVideo, ArrowRight } from 'lucide-react'
import { toFileUrlCached } from '../hooks/usePerformance'

interface RelatedMedia {
  id: string
  filename: string
  thumbPath?: string
  type: string
  relationshipType: string
  relationshipId: string
  note?: string
}

interface SeriesItem {
  id: string
  filename: string
  thumbPath?: string
  type: string
  durationSec?: number
  order?: number
}

interface RelatedMediaPanelProps {
  mediaId: string
  onPlayMedia: (mediaId: string) => void
  className?: string
}

const RELATIONSHIP_LABELS: Record<string, { label: string; color: string }> = {
  sequel: { label: 'Sequel', color: 'text-blue-400' },
  prequel: { label: 'Prequel', color: 'text-purple-400' },
  related: { label: 'Related', color: 'text-green-400' },
  alternate: { label: 'Alternate', color: 'text-yellow-400' },
  series: { label: 'Series', color: 'text-cyan-400' },
  duplicate: { label: 'Duplicate', color: 'text-red-400' },
  compilation: { label: 'Compilation', color: 'text-orange-400' },
  source: { label: 'Source', color: 'text-pink-400' },
  derived: { label: 'Derived', color: 'text-indigo-400' },
  response: { label: 'Response', color: 'text-emerald-400' },
}

export function RelatedMediaPanel({ mediaId, onPlayMedia, className = '' }: RelatedMediaPanelProps) {
  const [related, setRelated] = useState<RelatedMedia[]>([])
  const [suggestions, setSuggestions] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [showAddForm, setShowAddForm] = useState(false)
  const [showSeriesModal, setShowSeriesModal] = useState(false)
  const [seriesItems, setSeriesItems] = useState<SeriesItem[]>([])
  const [loadingSeries, setLoadingSeries] = useState(false)

  const loadRelated = useCallback(async () => {
    try {
      const items = await window.api.invoke('relationships:getForMedia', mediaId)
      setRelated(items)
    } catch (e) {
      console.error('Failed to load related media:', e)
    } finally {
      setLoading(false)
    }
  }, [mediaId])

  const loadSuggestions = useCallback(async () => {
    try {
      const items = await window.api.invoke('relationships:suggestRelationships', mediaId, 5)
      setSuggestions(items)
    } catch (e) {
      console.error('Failed to load suggestions:', e)
    }
  }, [mediaId])

  useEffect(() => {
    loadRelated()
  }, [loadRelated])

  const handleRemoveRelationship = async (relationshipId: string) => {
    try {
      await window.api.invoke('relationships:delete', relationshipId)
      loadRelated()
    } catch (e) {
      console.error('Failed to remove relationship:', e)
    }
  }

  const handleAcceptSuggestion = async (suggestion: any) => {
    try {
      await window.api.invoke('relationships:create', mediaId, suggestion.id, suggestion.suggestedType)
      loadRelated()
      setSuggestions(prev => prev.filter(s => s.id !== suggestion.id))
    } catch (e) {
      console.error('Failed to create relationship:', e)
    }
  }

  const handleFindSeries = async () => {
    setLoadingSeries(true)
    setShowSeriesModal(true)
    try {
      const seriesIds = await window.api.invoke('relationships:findSeries', mediaId) as string[]
      if (seriesIds?.length > 0) {
        // Fetch media details for each series item
        const items = await Promise.all(
          seriesIds.map(async (id, index) => {
            try {
              const media = await window.api.media.get(id)
              return { ...media, order: index + 1 }
            } catch {
              return null
            }
          })
        )
        setSeriesItems(items.filter(Boolean) as SeriesItem[])
      }
    } catch (e) {
      console.error('[RelatedMedia] Failed to find series:', e)
    } finally {
      setLoadingSeries(false)
    }
  }

  const getMediaIcon = (type: string) => {
    switch (type) {
      case 'video': return <Film className="w-3 h-3" />
      case 'image': return <Image className="w-3 h-3" />
      default: return <Sparkles className="w-3 h-3" />
    }
  }

  if (loading) {
    return (
      <div className={`bg-zinc-900 rounded-lg p-4 ${className}`}>
        <div className="animate-pulse">
          <div className="h-4 bg-zinc-700 rounded w-24 mb-4" />
          <div className="h-16 bg-zinc-800 rounded" />
        </div>
      </div>
    )
  }

  return (
    <div className={`bg-zinc-900 rounded-lg border border-zinc-700 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-zinc-700">
        <div className="flex items-center gap-2">
          <Link2 className="w-4 h-4 text-cyan-400" />
          <span className="text-sm font-medium">Related</span>
          {related.length > 0 && (
            <span className="text-xs text-zinc-500">({related.length})</span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => { loadSuggestions(); setShowSuggestions(!showSuggestions) }}
            className={`p-1.5 rounded text-xs ${showSuggestions ? 'bg-cyan-600' : 'hover:bg-zinc-700'}`}
            title="Show suggestions"
          >
            <Sparkles className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className={`p-1.5 rounded ${showAddForm ? 'bg-zinc-700' : 'hover:bg-zinc-700'}`}
            title={showAddForm ? 'Close add form' : 'Add relationship'}
          >
            {showAddForm ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Suggestions */}
      {showSuggestions && suggestions.length > 0 && (
        <div className="p-2 border-b border-zinc-700 bg-cyan-900/20">
          <p className="text-xs text-cyan-400 mb-2">Suggested relationships:</p>
          <div className="space-y-1">
            {suggestions.map((suggestion) => (
              <div
                key={suggestion.id}
                className="flex items-center gap-2 p-1.5 bg-zinc-800/50 rounded"
              >
                <div className="w-10 h-7 bg-zinc-700 rounded overflow-hidden flex-shrink-0">
                  {suggestion.thumbPath ? (
                    <img
                      src={`vault://${suggestion.thumbPath}`}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-zinc-500">
                      {getMediaIcon('video')}
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs truncate">{suggestion.filename}</p>
                  <p className="text-xs text-zinc-500">
                    {Math.round(suggestion.confidence * 100)}% • {suggestion.suggestedType}
                  </p>
                </div>
                <button
                  onClick={() => handleAcceptSuggestion(suggestion)}
                  className="p-1 bg-cyan-600 hover:bg-cyan-500 rounded"
                  title="Accept suggestion"
                >
                  <Plus className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Related Media List */}
      <div className="max-h-48 overflow-y-auto">
        {related.length === 0 ? (
          <div className="p-4 text-center text-zinc-500">
            <Link2 className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p className="text-xs">No related media</p>
            <p className="text-xs mt-1">Link sequels, series, or alternates</p>
          </div>
        ) : (
          <div className="p-2 space-y-1">
            {related.map((item) => {
              const relType = RELATIONSHIP_LABELS[item.relationshipType] || { label: item.relationshipType, color: 'text-zinc-400' }

              return (
                <div
                  key={item.relationshipId}
                  className="group flex items-center gap-2 p-1.5 rounded hover:bg-zinc-800 cursor-pointer"
                  onClick={() => onPlayMedia(item.id)}
                >
                  {/* Thumbnail */}
                  <div className="w-12 h-8 bg-zinc-700 rounded overflow-hidden flex-shrink-0">
                    {item.thumbPath ? (
                      <img
                        src={`vault://${item.thumbPath}`}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-zinc-500">
                        {getMediaIcon(item.type)}
                      </div>
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-xs truncate">{item.filename}</p>
                    <div className="flex items-center gap-1">
                      <span className={`text-xs ${relType.color}`}>{relType.label}</span>
                      {item.note && (
                        <span className="text-xs text-zinc-500 truncate">• {item.note}</span>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="hidden group-hover:flex items-center gap-1">
                    <button
                      onClick={(e) => { e.stopPropagation(); onPlayMedia(item.id) }}
                      className="p-1 hover:bg-zinc-600 rounded"
                      title="Play media"
                    >
                      <ChevronRight className="w-3 h-3 text-zinc-400" />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleRemoveRelationship(item.relationshipId) }}
                      className="p-1 hover:bg-zinc-600 rounded"
                      title="Remove relationship"
                    >
                      <Trash2 className="w-3 h-3 text-red-400" />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Find Series Button */}
      {related.some(r => ['sequel', 'prequel', 'series'].includes(r.relationshipType)) && (
        <div className="p-2 border-t border-zinc-700">
          <button
            onClick={handleFindSeries}
            className="w-full flex items-center justify-center gap-2 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 rounded text-xs"
          >
            <Link2 className="w-3 h-3" />
            View Full Series
          </button>
        </div>
      )}

      {/* Series Modal */}
      {showSeriesModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-zinc-900 rounded-2xl border border-zinc-700 w-full max-w-2xl max-h-[80vh] overflow-hidden shadow-2xl">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-4 border-b border-zinc-700">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-500">
                  <ListVideo size={20} className="text-white" />
                </div>
                <div>
                  <h2 className="text-lg font-bold">Full Series</h2>
                  <p className="text-xs text-zinc-500">
                    {seriesItems.length} items in this series
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowSeriesModal(false)}
                className="p-2 rounded-lg hover:bg-zinc-800 transition"
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-4 overflow-y-auto max-h-[60vh]">
              {loadingSeries ? (
                <div className="flex flex-col items-center justify-center py-12">
                  <div className="w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin mb-3" />
                  <p className="text-sm text-zinc-500">Loading series...</p>
                </div>
              ) : seriesItems.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-zinc-500">
                  <ListVideo size={40} className="mb-3 opacity-30" />
                  <p className="text-sm">No series items found</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {seriesItems.map((item, index) => (
                    <SeriesItemCard
                      key={item.id}
                      item={item}
                      index={index}
                      isCurrent={item.id === mediaId}
                      onPlay={() => {
                        onPlayMedia(item.id)
                        setShowSeriesModal(false)
                      }}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            {seriesItems.length > 0 && (
              <div className="p-4 border-t border-zinc-700 flex justify-between items-center">
                <p className="text-xs text-zinc-500">
                  Click any item to play
                </p>
                <button
                  onClick={() => {
                    // Play all in sequence - play first item
                    if (seriesItems.length > 0) {
                      onPlayMedia(seriesItems[0].id)
                      setShowSeriesModal(false)
                    }
                  }}
                  className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-cyan-500 to-blue-500 rounded-lg text-sm font-medium hover:opacity-90 transition"
                >
                  <Play size={16} />
                  Play All
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// Series Item Card Component
function SeriesItemCard({ item, index, isCurrent, onPlay }: {
  item: SeriesItem
  index: number
  isCurrent: boolean
  onPlay: () => void
}) {
  const [thumbUrl, setThumbUrl] = useState('')

  useEffect(() => {
    if (item.thumbPath) {
      toFileUrlCached(item.thumbPath)
        .then(setThumbUrl)
        .catch(() => {})
    }
  }, [item.thumbPath])

  const formatDuration = (sec: number) => {
    const mins = Math.floor(sec / 60)
    const secs = Math.floor(sec % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  return (
    <div
      onClick={onPlay}
      className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all ${
        isCurrent
          ? 'bg-cyan-500/20 ring-1 ring-cyan-500/50'
          : 'bg-zinc-800/50 hover:bg-zinc-800'
      }`}
    >
      {/* Order Number */}
      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
        isCurrent
          ? 'bg-cyan-500 text-white'
          : 'bg-zinc-700 text-zinc-300'
      }`}>
        {index + 1}
      </div>

      {/* Thumbnail */}
      <div className="w-20 h-12 bg-zinc-700 rounded-lg overflow-hidden flex-shrink-0">
        {thumbUrl ? (
          <img
            src={thumbUrl}
            alt=""
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-zinc-500">
            <Film size={20} />
          </div>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium truncate ${isCurrent ? 'text-cyan-300' : 'text-white'}`}>
          {item.filename}
        </p>
        <div className="flex items-center gap-2 text-xs text-zinc-500">
          {item.durationSec && (
            <span>{formatDuration(item.durationSec)}</span>
          )}
          {isCurrent && (
            <span className="text-cyan-400">Currently viewing</span>
          )}
        </div>
      </div>

      {/* Play button */}
      <div className="flex-shrink-0">
        <div className={`w-10 h-10 rounded-full flex items-center justify-center transition ${
          isCurrent
            ? 'bg-cyan-500 text-white'
            : 'bg-zinc-700 text-zinc-400 hover:bg-zinc-600 hover:text-white'
        }`}>
          <Play size={18} className="ml-0.5" fill="currentColor" />
        </div>
      </div>
    </div>
  )
}

export default RelatedMediaPanel
