// File: src/renderer/components/DiscoveryEngine.tsx
// Smart discovery engine with preference learning and intelligent recommendations

import React, { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Sparkles,
  Shuffle,
  Play,
  Heart,
  ThumbsUp,
  ThumbsDown,
  Clock,
  Film,
  Image,
  Loader2,
  RefreshCw,
  Settings,
  X,
  Zap,
  TrendingUp,
  Eye,
  Star,
  Filter,
  ChevronDown
} from 'lucide-react'
import { toFileUrlCached } from '../hooks/usePerformance'
import { formatDuration } from '../utils/formatters'

interface MediaItem {
  id: string
  filename: string
  thumbPath: string | null
  type: 'video' | 'image' | 'gif'
  durationSec: number | null
  rating: number | null
  viewCount: number
  lastViewedAt: number | null
  tags: string[]
  createdAt: number
}

interface DiscoveryPreferences {
  preferVideos: number // -1 to 1 (negative = prefer images)
  preferLong: number // -1 to 1 (negative = prefer short)
  preferHighRated: number // 0 to 1
  preferUnwatched: number // 0 to 1
  preferRecent: number // 0 to 1
  excludeRecentlyViewed: boolean
  recentlyViewedDays: number
  minRating: number
  favoriteTags: string[]
  excludedTags: string[]
}

interface DiscoveryEngineProps {
  onPlayMedia: (mediaId: string) => void
  onClose?: () => void
  className?: string
}

// Default preferences
const defaultPreferences: DiscoveryPreferences = {
  preferVideos: 0.3,
  preferLong: 0,
  preferHighRated: 0.5,
  preferUnwatched: 0.3,
  preferRecent: 0.2,
  excludeRecentlyViewed: true,
  recentlyViewedDays: 3,
  minRating: 0,
  favoriteTags: [],
  excludedTags: []
}

// Load preferences from storage
function loadPreferences(): DiscoveryPreferences {
  try {
    const stored = localStorage.getItem('vault-discovery-preferences')
    if (stored) {
      return { ...defaultPreferences, ...JSON.parse(stored) }
    }
  } catch {}
  return defaultPreferences
}

// Save preferences to storage
function savePreferences(prefs: DiscoveryPreferences) {
  try {
    localStorage.setItem('vault-discovery-preferences', JSON.stringify(prefs))
  } catch {}
}

export function DiscoveryEngine({
  onPlayMedia,
  onClose,
  className = ''
}: DiscoveryEngineProps) {
  const [loading, setLoading] = useState(true)
  const [suggestions, setSuggestions] = useState<MediaItem[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [preferences, setPreferences] = useState<DiscoveryPreferences>(loadPreferences)
  const [showSettings, setShowSettings] = useState(false)
  const [allTags, setAllTags] = useState<string[]>([])
  const [feedbackHistory, setFeedbackHistory] = useState<Map<string, 'like' | 'dislike'>>(new Map())
  const [mode, setMode] = useState<'curated' | 'random' | 'trending' | 'unwatched'>('curated')

  const currentSuggestion = suggestions[currentIndex]

  // Load tags
  useEffect(() => {
    window.api.tags?.list?.()
      .then((tags: any[]) => {
        setAllTags(tags.map(t => t.name))
      })
      .catch(() => {})
  }, [])

  // Calculate score for a media item
  const calculateScore = useCallback((item: MediaItem, prefs: DiscoveryPreferences): number => {
    let score = 50 // Base score

    // Type preference
    if (item.type === 'video') {
      score += prefs.preferVideos * 20
    } else {
      score -= prefs.preferVideos * 20
    }

    // Duration preference (for videos)
    if (item.type === 'video' && item.durationSec) {
      const durationMins = item.durationSec / 60
      if (prefs.preferLong > 0 && durationMins > 20) {
        score += prefs.preferLong * 15
      } else if (prefs.preferLong < 0 && durationMins < 10) {
        score += Math.abs(prefs.preferLong) * 15
      }
    }

    // Rating preference
    if (item.rating && prefs.preferHighRated > 0) {
      score += (item.rating / 5) * prefs.preferHighRated * 25
    }

    // Min rating filter
    if (prefs.minRating > 0 && (item.rating || 0) < prefs.minRating) {
      score -= 50
    }

    // Unwatched preference
    if (prefs.preferUnwatched > 0 && item.viewCount === 0) {
      score += prefs.preferUnwatched * 20
    }

    // Recent content preference
    if (prefs.preferRecent > 0) {
      const ageInDays = (Date.now() - item.createdAt) / (1000 * 60 * 60 * 24)
      if (ageInDays < 7) {
        score += prefs.preferRecent * 20
      } else if (ageInDays < 30) {
        score += prefs.preferRecent * 10
      }
    }

    // Exclude recently viewed
    if (prefs.excludeRecentlyViewed && item.lastViewedAt) {
      const daysSinceViewed = (Date.now() - item.lastViewedAt) / (1000 * 60 * 60 * 24)
      if (daysSinceViewed < prefs.recentlyViewedDays) {
        score -= 40
      }
    }

    // Favorite tags boost
    const itemTags = item.tags || []
    for (const tag of prefs.favoriteTags) {
      if (itemTags.includes(tag)) {
        score += 15
      }
    }

    // Excluded tags penalty
    for (const tag of prefs.excludedTags) {
      if (itemTags.includes(tag)) {
        score -= 100 // Strong penalty
      }
    }

    // Feedback history
    const feedback = feedbackHistory.get(item.id)
    if (feedback === 'like') {
      score += 30
    } else if (feedback === 'dislike') {
      score -= 50
    }

    // Add some randomness
    score += Math.random() * 15

    return Math.max(0, Math.min(100, score))
  }, [feedbackHistory])

  // Load and score suggestions
  const loadSuggestions = useCallback(async () => {
    setLoading(true)
    try {
      // Fetch a larger pool of media to choose from
      const result = await window.api.media.list({ limit: 500 })
      const items = Array.isArray(result) ? result : (result as any)?.items ?? []

      let scored: Array<MediaItem & { score: number }> = items.map((item: MediaItem) => ({
        ...item,
        tags: item.tags || [],
        score: calculateScore(item, preferences)
      }))

      // Filter and sort based on mode
      switch (mode) {
        case 'random':
          // Pure random shuffle
          scored = scored.sort(() => Math.random() - 0.5)
          break
        case 'trending':
          // Prefer recently viewed with high ratings
          scored = scored
            .filter(i => i.viewCount > 0)
            .sort((a, b) => {
              const aRecency = a.lastViewedAt || 0
              const bRecency = b.lastViewedAt || 0
              return bRecency - aRecency
            })
          break
        case 'unwatched':
          // Only unwatched content
          scored = scored
            .filter(i => i.viewCount === 0)
            .sort(() => Math.random() - 0.5)
          break
        case 'curated':
        default:
          // Sort by score
          scored = scored.sort((a, b) => b.score - a.score)
          break
      }

      // Take top suggestions
      const topSuggestions = scored.slice(0, 50).map(({ score, ...item }) => item)
      setSuggestions(topSuggestions)
      setCurrentIndex(0)
    } catch (e) {
      console.error('Failed to load suggestions:', e)
    } finally {
      setLoading(false)
    }
  }, [preferences, mode, calculateScore])

  // Initial load
  useEffect(() => {
    loadSuggestions()
  }, [loadSuggestions])

  // Handle feedback
  const handleFeedback = useCallback((type: 'like' | 'dislike') => {
    if (!currentSuggestion) return

    setFeedbackHistory(prev => {
      const next = new Map(prev)
      next.set(currentSuggestion.id, type)
      return next
    })

    // Move to next suggestion
    if (currentIndex < suggestions.length - 1) {
      setCurrentIndex(prev => prev + 1)
    } else {
      // Reload with updated feedback
      loadSuggestions()
    }
  }, [currentSuggestion, currentIndex, suggestions.length, loadSuggestions])

  // Navigate suggestions
  const nextSuggestion = useCallback(() => {
    if (currentIndex < suggestions.length - 1) {
      setCurrentIndex(prev => prev + 1)
    } else {
      loadSuggestions()
    }
  }, [currentIndex, suggestions.length, loadSuggestions])

  // Update preferences
  const updatePreference = useCallback((key: keyof DiscoveryPreferences, value: any) => {
    setPreferences(prev => {
      const next = { ...prev, [key]: value }
      savePreferences(next)
      return next
    })
  }, [])

  // Toggle tag preference
  const toggleFavoriteTag = useCallback((tag: string) => {
    setPreferences(prev => {
      const favoriteTags = prev.favoriteTags.includes(tag)
        ? prev.favoriteTags.filter(t => t !== tag)
        : [...prev.favoriteTags, tag]
      const next = { ...prev, favoriteTags }
      savePreferences(next)
      return next
    })
  }, [])

  const toggleExcludedTag = useCallback((tag: string) => {
    setPreferences(prev => {
      const excludedTags = prev.excludedTags.includes(tag)
        ? prev.excludedTags.filter(t => t !== tag)
        : [...prev.excludedTags, tag]
      const next = { ...prev, excludedTags }
      savePreferences(next)
      return next
    })
  }, [])

  return (
    <div className={`bg-zinc-900/95 backdrop-blur-xl rounded-2xl border border-zinc-700 shadow-2xl overflow-hidden ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-pink-600 flex items-center justify-center">
            <Sparkles size={20} className="text-white" />
          </div>
          <div>
            <h2 className="font-semibold">Discovery</h2>
            <p className="text-xs text-zinc-400">Smart content suggestions</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={loadSuggestions}
            className="p-2 rounded-lg hover:bg-zinc-800 transition"
            title="Refresh suggestions"
          >
            <RefreshCw size={16} className={`text-zinc-400 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={() => setShowSettings(prev => !prev)}
            className="p-2 rounded-lg hover:bg-zinc-800 transition"
          >
            <Settings size={16} className="text-zinc-400" />
          </button>
          {onClose && (
            <button onClick={onClose} className="p-2 rounded-lg hover:bg-zinc-800 transition">
              <X size={16} />
            </button>
          )}
        </div>
      </div>

      {/* Mode selector */}
      <div className="flex items-center gap-2 px-5 py-3 border-b border-zinc-800 overflow-x-auto">
        {[
          { id: 'curated', label: 'For You', icon: Sparkles },
          { id: 'random', label: 'Random', icon: Shuffle },
          { id: 'trending', label: 'Trending', icon: TrendingUp },
          { id: 'unwatched', label: 'Unwatched', icon: Eye }
        ].map(m => {
          const Icon = m.icon
          return (
            <button
              key={m.id}
              onClick={() => setMode(m.id as any)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition whitespace-nowrap ${
                mode === m.id
                  ? 'bg-[var(--primary)] text-white'
                  : 'bg-zinc-800 text-zinc-400 hover:text-white'
              }`}
            >
              <Icon size={14} />
              {m.label}
            </button>
          )
        })}
      </div>

      {/* Settings panel */}
      {showSettings && (
        <div className="px-5 py-4 bg-zinc-800/50 border-b border-zinc-800 space-y-4 max-h-[40vh] overflow-y-auto">
          {/* Sliders */}
          <div className="space-y-3">
            <div className="space-y-1">
              <div className="flex items-center justify-between text-sm">
                <span className="text-zinc-400">Content type</span>
                <span className="text-zinc-500">
                  {preferences.preferVideos > 0.3 ? 'Videos' : preferences.preferVideos < -0.3 ? 'Images' : 'Mixed'}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Image size={14} className="text-zinc-500" />
                <input
                  type="range"
                  min={-1}
                  max={1}
                  step={0.1}
                  value={preferences.preferVideos}
                  onChange={(e) => updatePreference('preferVideos', parseFloat(e.target.value))}
                  className="flex-1 accent-[var(--primary)]"
                />
                <Film size={14} className="text-zinc-500" />
              </div>
            </div>

            <div className="space-y-1">
              <div className="flex items-center justify-between text-sm">
                <span className="text-zinc-400">Duration preference</span>
                <span className="text-zinc-500">
                  {preferences.preferLong > 0.3 ? 'Long' : preferences.preferLong < -0.3 ? 'Short' : 'Any'}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Zap size={14} className="text-zinc-500" />
                <input
                  type="range"
                  min={-1}
                  max={1}
                  step={0.1}
                  value={preferences.preferLong}
                  onChange={(e) => updatePreference('preferLong', parseFloat(e.target.value))}
                  className="flex-1 accent-[var(--primary)]"
                />
                <Clock size={14} className="text-zinc-500" />
              </div>
            </div>

            <div className="space-y-1">
              <div className="flex items-center justify-between text-sm">
                <span className="text-zinc-400">Prefer high-rated</span>
                <span className="text-zinc-500">{Math.round(preferences.preferHighRated * 100)}%</span>
              </div>
              <input
                type="range"
                min={0}
                max={1}
                step={0.1}
                value={preferences.preferHighRated}
                onChange={(e) => updatePreference('preferHighRated', parseFloat(e.target.value))}
                className="w-full accent-[var(--primary)]"
              />
            </div>

            <div className="space-y-1">
              <div className="flex items-center justify-between text-sm">
                <span className="text-zinc-400">Prefer unwatched</span>
                <span className="text-zinc-500">{Math.round(preferences.preferUnwatched * 100)}%</span>
              </div>
              <input
                type="range"
                min={0}
                max={1}
                step={0.1}
                value={preferences.preferUnwatched}
                onChange={(e) => updatePreference('preferUnwatched', parseFloat(e.target.value))}
                className="w-full accent-[var(--primary)]"
              />
            </div>

            <div className="space-y-1">
              <div className="flex items-center justify-between text-sm">
                <span className="text-zinc-400">Minimum rating</span>
                <span className="text-zinc-500">{preferences.minRating} stars</span>
              </div>
              <input
                type="range"
                min={0}
                max={5}
                step={1}
                value={preferences.minRating}
                onChange={(e) => updatePreference('minRating', parseInt(e.target.value))}
                className="w-full accent-[var(--primary)]"
              />
            </div>
          </div>

          {/* Tags */}
          {allTags.length > 0 && (
            <div className="space-y-2">
              <div className="text-sm text-zinc-400">Favorite tags (boost)</div>
              <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto">
                {allTags.slice(0, 30).map(tag => (
                  <button
                    key={tag}
                    onClick={() => toggleFavoriteTag(tag)}
                    className={`px-2 py-1 rounded text-xs transition ${
                      preferences.favoriteTags.includes(tag)
                        ? 'bg-green-500/20 text-green-400 border border-green-500/50'
                        : 'bg-zinc-800 text-zinc-400 hover:text-white'
                    }`}
                  >
                    {tag}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Current suggestion */}
      <div className="p-5">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-12">
            <Loader2 size={32} className="animate-spin text-zinc-500 mb-2" />
            <p className="text-sm text-zinc-500">Finding content for you...</p>
          </div>
        ) : currentSuggestion ? (
          <div className="space-y-4">
            {/* Thumbnail */}
            <SuggestionCard
              item={currentSuggestion}
              onPlay={() => onPlayMedia(currentSuggestion.id)}
            />

            {/* Feedback buttons */}
            <div className="flex items-center justify-center gap-4">
              <button
                onClick={() => handleFeedback('dislike')}
                className="flex items-center gap-2 px-6 py-3 rounded-xl bg-red-500/20 text-red-400 hover:bg-red-500/30 transition"
              >
                <ThumbsDown size={20} />
                Skip
              </button>
              <button
                onClick={() => {
                  handleFeedback('like')
                  onPlayMedia(currentSuggestion.id)
                }}
                className="flex items-center gap-2 px-8 py-3 rounded-xl bg-green-500/20 text-green-400 hover:bg-green-500/30 transition"
              >
                <Play size={20} fill="currentColor" />
                Play
              </button>
              <button
                onClick={nextSuggestion}
                className="flex items-center gap-2 px-6 py-3 rounded-xl bg-zinc-800 text-zinc-400 hover:bg-zinc-700 transition"
              >
                <Shuffle size={20} />
                Next
              </button>
            </div>

            {/* Progress indicator */}
            <div className="text-center text-xs text-zinc-500">
              {currentIndex + 1} of {suggestions.length} suggestions
            </div>
          </div>
        ) : (
          <div className="py-12 text-center text-zinc-500">
            <Sparkles size={32} className="mx-auto mb-2 opacity-50" />
            <p>No suggestions available</p>
            <p className="text-xs mt-1">Try adjusting your preferences</p>
          </div>
        )}
      </div>
    </div>
  )
}

// Suggestion card component
function SuggestionCard({
  item,
  onPlay
}: {
  item: MediaItem
  onPlay: () => void
}) {
  const [thumbUrl, setThumbUrl] = useState('')

  useEffect(() => {
    if (item.thumbPath) {
      toFileUrlCached(item.thumbPath).then(setThumbUrl).catch(() => {})
    }
  }, [item.thumbPath])

  return (
    <div
      className="relative aspect-video bg-zinc-800 rounded-xl overflow-hidden cursor-pointer group"
      onClick={onPlay}
    >
      {thumbUrl ? (
        <img src={thumbUrl} alt="" className="w-full h-full object-cover" />
      ) : (
        <div className="w-full h-full flex items-center justify-center text-zinc-600">
          <Film size={48} />
        </div>
      )}

      {/* Play overlay */}
      <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition">
        <div className="w-16 h-16 rounded-full bg-white/20 flex items-center justify-center backdrop-blur-sm">
          <Play size={32} fill="white" className="text-white ml-1" />
        </div>
      </div>

      {/* Info overlay */}
      <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/80 to-transparent">
        <div className="text-sm font-medium truncate mb-1">{item.filename}</div>
        <div className="flex items-center gap-3 text-xs text-zinc-400">
          <span className="flex items-center gap-1 capitalize">
            {item.type === 'video' ? <Film size={12} /> : <Image size={12} />}
            {item.type}
          </span>
          {item.durationSec && (
            <span className="flex items-center gap-1">
              <Clock size={12} />
              {formatDuration(item.durationSec)}
            </span>
          )}
          {item.rating && (
            <span className="flex items-center gap-1 text-amber-400">
              <Star size={12} fill="currentColor" />
              {item.rating}
            </span>
          )}
          {item.viewCount > 0 && (
            <span className="flex items-center gap-1">
              <Eye size={12} />
              {item.viewCount}
            </span>
          )}
        </div>
      </div>

      {/* Type badge */}
      <div className="absolute top-3 right-3 px-2 py-1 bg-black/70 rounded text-xs uppercase">
        {item.type}
      </div>
    </div>
  )
}

// Quick discovery button for toolbar
export function QuickDiscoveryButton({
  onPlayMedia,
  className = ''
}: {
  onPlayMedia: (mediaId: string) => void
  className?: string
}) {
  const [loading, setLoading] = useState(false)

  const playRandom = useCallback(async () => {
    setLoading(true)
    try {
      const result = await window.api.media.list({ limit: 100 })
      const items = Array.isArray(result) ? result : (result as any)?.items ?? []
      if (items.length > 0) {
        const random = items[Math.floor(Math.random() * items.length)]
        onPlayMedia(random.id)
      }
    } catch (e) {
      console.error('Failed to get random media:', e)
    } finally {
      setLoading(false)
    }
  }, [onPlayMedia])

  return (
    <button
      onClick={playRandom}
      disabled={loading}
      className={`flex items-center gap-2 px-3 py-2 rounded-lg bg-gradient-to-r from-purple-500/20 to-pink-500/20 hover:from-purple-500/30 hover:to-pink-500/30 transition ${className}`}
    >
      {loading ? (
        <Loader2 size={16} className="animate-spin text-purple-400" />
      ) : (
        <Sparkles size={16} className="text-purple-400" />
      )}
      <span className="text-sm text-purple-300">Surprise Me</span>
    </button>
  )
}

export default DiscoveryEngine
