// File: src/renderer/components/SessionSummary.tsx
// Post-session summary with stats, insights, and recommendations

import React, { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Clock,
  Eye,
  Heart,
  Star,
  TrendingUp,
  Film,
  Image,
  Award,
  Zap,
  Coffee,
  Moon,
  Sun,
  Sparkles,
  Share2,
  Download,
  X,
  ChevronRight,
  Play,
  Calendar,
  BarChart3
} from 'lucide-react'
import { formatDuration } from '../utils/formatters'

interface SessionStats {
  sessionId: string
  startTime: number
  endTime: number
  duration: number
  mediaViewed: Array<{
    id: string
    filename: string
    type: string
    duration: number
    rating?: number
    favorited?: boolean
  }>
  totalViewed: number
  videosWatched: number
  imagesViewed: number
  favoritesAdded: number
  ratingsGiven: number
  avgRating: number
  peakHour: number
  tags: string[]
}

interface SessionSummaryProps {
  stats: SessionStats
  onClose: () => void
  onPlayMedia?: (mediaId: string) => void
  onViewMore?: () => void
  className?: string
}

export function SessionSummary({
  stats,
  onClose,
  onPlayMedia,
  onViewMore,
  className = ''
}: SessionSummaryProps) {
  const [showDetails, setShowDetails] = useState(false)

  // Calculate derived stats
  const sessionInsights = useMemo(() => {
    const durationMins = stats.duration / 60
    const avgViewTime = stats.totalViewed > 0 ? stats.duration / stats.totalViewed : 0

    // Session mood based on patterns
    let mood: { icon: React.ElementType; label: string; color: string }
    if (durationMins < 15) {
      mood = { icon: Zap, label: 'Quick Session', color: 'text-yellow-400' }
    } else if (durationMins < 30) {
      mood = { icon: Sun, label: 'Casual Browse', color: 'text-orange-400' }
    } else if (durationMins < 60) {
      mood = { icon: Coffee, label: 'Extended Session', color: 'text-amber-400' }
    } else {
      mood = { icon: Moon, label: 'Marathon Session', color: 'text-purple-400' }
    }

    // Content preference
    const videoRatio = stats.totalViewed > 0 ? stats.videosWatched / stats.totalViewed : 0
    let preference: string
    if (videoRatio > 0.7) {
      preference = 'Video enthusiast'
    } else if (videoRatio < 0.3) {
      preference = 'Image collector'
    } else {
      preference = 'Mixed explorer'
    }

    // Engagement score (0-100)
    const engagementScore = Math.min(100, Math.round(
      (stats.favoritesAdded * 20) +
      (stats.ratingsGiven * 10) +
      (stats.avgRating * 10) +
      (Math.min(stats.totalViewed, 10) * 3)
    ))

    // Top tags
    const tagCounts = stats.tags.reduce((acc, tag) => {
      acc[tag] = (acc[tag] || 0) + 1
      return acc
    }, {} as Record<string, number>)
    const topTags = Object.entries(tagCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([tag]) => tag)

    return {
      mood,
      preference,
      engagementScore,
      avgViewTime,
      topTags
    }
  }, [stats])

  // Time of day greeting
  const getTimeGreeting = () => {
    const hour = new Date(stats.endTime).getHours()
    if (hour < 12) return 'morning'
    if (hour < 17) return 'afternoon'
    if (hour < 21) return 'evening'
    return 'late night'
  }

  const MoodIcon = sessionInsights.mood.icon

  return (
    <div className={`fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm ${className}`}>
      <div className="bg-zinc-900 rounded-3xl border border-zinc-700 shadow-2xl max-w-lg w-full mx-4 overflow-hidden animate-in zoom-in-95">
        {/* Header with gradient */}
        <div className="relative bg-gradient-to-br from-[var(--primary)] to-pink-600 p-6 text-center">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-2 rounded-full bg-white/20 hover:bg-white/30 transition"
          >
            <X size={18} />
          </button>

          <div className="w-16 h-16 rounded-full bg-white/20 flex items-center justify-center mx-auto mb-4">
            <MoodIcon size={32} className="text-white" />
          </div>

          <h2 className="text-2xl font-bold mb-1">Session Complete!</h2>
          <p className="text-white/80">
            Great {getTimeGreeting()} session
          </p>
        </div>

        {/* Main stats */}
        <div className="p-6 space-y-6">
          {/* Duration highlight */}
          <div className="text-center">
            <div className="text-4xl font-mono font-bold text-white mb-1">
              {formatDuration(stats.duration)}
            </div>
            <div className="text-sm text-zinc-400">{sessionInsights.mood.label}</div>
          </div>

          {/* Quick stats grid */}
          <div className="grid grid-cols-4 gap-3">
            <StatBox
              icon={Eye}
              value={stats.totalViewed}
              label="Viewed"
              color="text-blue-400"
            />
            <StatBox
              icon={Film}
              value={stats.videosWatched}
              label="Videos"
              color="text-indigo-400"
            />
            <StatBox
              icon={Heart}
              value={stats.favoritesAdded}
              label="Favorited"
              color="text-pink-400"
            />
            <StatBox
              icon={Star}
              value={stats.ratingsGiven}
              label="Rated"
              color="text-amber-400"
            />
          </div>

          {/* Engagement score */}
          <div className="bg-zinc-800/50 rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-zinc-400">Engagement Score</span>
              <span className="text-2xl font-bold text-[var(--primary)]">{sessionInsights.engagementScore}</span>
            </div>
            <div className="h-2 bg-zinc-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-[var(--primary)] to-pink-500 transition-all duration-500"
                style={{ width: `${sessionInsights.engagementScore}%` }}
              />
            </div>
            <p className="text-xs text-zinc-500 mt-2">
              {sessionInsights.engagementScore >= 80 ? 'Highly engaged! You really enjoyed this session.' :
               sessionInsights.engagementScore >= 50 ? 'Good engagement. Nice variety in your viewing.' :
               'Quick browse session. More interaction = better recommendations!'}
            </p>
          </div>

          {/* Insights */}
          <div className="space-y-2">
            <h3 className="text-sm font-medium text-zinc-400">Insights</h3>
            <div className="space-y-2">
              <InsightRow
                icon={TrendingUp}
                text={`You're a "${sessionInsights.preference}"`}
                color="text-green-400"
              />
              {stats.avgRating > 0 && (
                <InsightRow
                  icon={Star}
                  text={`Average rating: ${stats.avgRating.toFixed(1)} stars`}
                  color="text-amber-400"
                />
              )}
              <InsightRow
                icon={Clock}
                text={`Avg ${formatDuration(Math.round(sessionInsights.avgViewTime))} per item`}
                color="text-blue-400"
              />
            </div>
          </div>

          {/* Top tags */}
          {sessionInsights.topTags.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-medium text-zinc-400">Top Tags This Session</h3>
              <div className="flex flex-wrap gap-2">
                {sessionInsights.topTags.map(tag => (
                  <span
                    key={tag}
                    className="px-3 py-1 rounded-full bg-zinc-800 text-sm text-zinc-300"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Expand details */}
          {stats.mediaViewed.length > 0 && (
            <button
              onClick={() => setShowDetails(prev => !prev)}
              className="w-full flex items-center justify-between p-3 rounded-xl bg-zinc-800/50 hover:bg-zinc-800 transition"
            >
              <span className="text-sm text-zinc-400">View {stats.mediaViewed.length} items viewed</span>
              <ChevronRight
                size={16}
                className={`text-zinc-500 transition ${showDetails ? 'rotate-90' : ''}`}
              />
            </button>
          )}

          {/* Detailed list */}
          {showDetails && (
            <div className="max-h-48 overflow-y-auto space-y-1">
              {stats.mediaViewed.map((item, i) => (
                <div
                  key={i}
                  className="flex items-center gap-3 p-2 rounded-lg hover:bg-zinc-800/50 cursor-pointer"
                  onClick={() => onPlayMedia?.(item.id)}
                >
                  <span className="text-xs text-zinc-500 w-6">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm truncate">{item.filename}</div>
                    <div className="text-xs text-zinc-500 flex items-center gap-2">
                      <span className="capitalize">{item.type}</span>
                      {item.duration > 0 && <span>• {formatDuration(item.duration)}</span>}
                      {item.rating && (
                        <span className="flex items-center gap-0.5 text-amber-400">
                          <Star size={10} fill="currentColor" />
                          {item.rating}
                        </span>
                      )}
                      {item.favorited && (
                        <Heart size={10} className="text-pink-400" fill="currentColor" />
                      )}
                    </div>
                  </div>
                  <Play size={14} className="text-zinc-500" />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="px-6 pb-6 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-3 bg-zinc-800 hover:bg-zinc-700 rounded-xl transition font-medium"
          >
            Close
          </button>
          {onViewMore && (
            <button
              onClick={onViewMore}
              className="flex-1 py-3 bg-[var(--primary)] hover:bg-[var(--primary)]/80 rounded-xl transition font-medium flex items-center justify-center gap-2"
            >
              <Sparkles size={16} />
              Continue
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// Stat box component
function StatBox({
  icon: Icon,
  value,
  label,
  color
}: {
  icon: React.ElementType
  value: number
  label: string
  color: string
}) {
  return (
    <div className="bg-zinc-800/50 rounded-xl p-3 text-center">
      <Icon size={18} className={`${color} mx-auto mb-1`} />
      <div className="text-xl font-bold text-white">{value}</div>
      <div className="text-[10px] text-zinc-500">{label}</div>
    </div>
  )
}

// Insight row component
function InsightRow({
  icon: Icon,
  text,
  color
}: {
  icon: React.ElementType
  text: string
  color: string
}) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <Icon size={14} className={color} />
      <span className="text-zinc-300">{text}</span>
    </div>
  )
}

// Mini session tracker for ongoing sessions
export function SessionTracker({
  startTime,
  itemsViewed,
  onShowSummary,
  className = ''
}: {
  startTime: number
  itemsViewed: number
  onShowSummary?: () => void
  className?: string
}) {
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTime) / 1000))
    }, 1000)
    return () => clearInterval(interval)
  }, [startTime])

  return (
    <div
      className={`flex items-center gap-3 px-3 py-2 rounded-lg bg-zinc-800/80 ${className}`}
      onClick={onShowSummary}
    >
      <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
      <div className="text-sm">
        <span className="font-mono text-white">{formatDuration(elapsed)}</span>
        <span className="text-zinc-400 ml-2">• {itemsViewed} viewed</span>
      </div>
    </div>
  )
}

// Achievement badge component
export function AchievementBadge({
  icon: Icon,
  title,
  description,
  color,
  earned,
  className = ''
}: {
  icon: React.ElementType
  title: string
  description: string
  color: string
  earned: boolean
  className?: string
}) {
  return (
    <div
      className={`relative p-4 rounded-xl border transition ${
        earned
          ? `bg-gradient-to-br from-${color}/20 to-${color}/10 border-${color}/50`
          : 'bg-zinc-800/50 border-zinc-700 opacity-50'
      } ${className}`}
    >
      <div className="flex items-center gap-3">
        <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
          earned ? `bg-${color}/30` : 'bg-zinc-700'
        }`}>
          <Icon size={20} className={earned ? color : 'text-zinc-500'} />
        </div>
        <div>
          <div className="font-medium text-white">{title}</div>
          <div className="text-xs text-zinc-400">{description}</div>
        </div>
      </div>
      {earned && (
        <div className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-green-500 flex items-center justify-center">
          <Award size={12} className="text-white" />
        </div>
      )}
    </div>
  )
}

export default SessionSummary
