// File: src/renderer/components/StreaksAchievements.tsx
// Gamification system with streaks, achievements, and milestones

import React, { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Trophy,
  Flame,
  Star,
  Heart,
  Eye,
  Clock,
  Calendar,
  Zap,
  Award,
  Crown,
  Target,
  TrendingUp,
  Medal,
  Gift,
  Sparkles,
  X,
  ChevronRight,
  Lock,
  Check
} from 'lucide-react'
import { formatDuration } from '../utils/formatters'

// Achievement definitions
interface Achievement {
  id: string
  name: string
  description: string
  icon: React.ElementType
  color: string
  category: 'viewing' | 'collection' | 'engagement' | 'streaks' | 'exploration'
  requirement: {
    type: 'count' | 'streak' | 'duration' | 'milestone'
    target: number
    current?: number
  }
  rarity: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary'
  unlockedAt?: number
}

// Streak data
interface StreakData {
  currentStreak: number
  longestStreak: number
  lastActiveDate: string
  totalActiveDays: number
  weeklyStreak: number[]
}

// User stats for achievements
interface UserStats {
  totalViews: number
  totalWatchTime: number // seconds
  favoritesCount: number
  ratingsCount: number
  tagsUsed: number
  playlistsCreated: number
  sessionsCount: number
  longestSession: number // seconds
  uniqueMediaViewed: number
  consecutiveDays: number
}

// Achievement definitions
const ACHIEVEMENTS: Achievement[] = [
  // Viewing achievements
  {
    id: 'first_view',
    name: 'First Glance',
    description: 'View your first piece of content',
    icon: Eye,
    color: 'text-blue-400',
    category: 'viewing',
    requirement: { type: 'count', target: 1 },
    rarity: 'common'
  },
  {
    id: 'views_10',
    name: 'Getting Started',
    description: 'View 10 items',
    icon: Eye,
    color: 'text-blue-400',
    category: 'viewing',
    requirement: { type: 'count', target: 10 },
    rarity: 'common'
  },
  {
    id: 'views_100',
    name: 'Viewer',
    description: 'View 100 items',
    icon: Eye,
    color: 'text-blue-500',
    category: 'viewing',
    requirement: { type: 'count', target: 100 },
    rarity: 'uncommon'
  },
  {
    id: 'views_500',
    name: 'Dedicated Viewer',
    description: 'View 500 items',
    icon: Eye,
    color: 'text-indigo-400',
    category: 'viewing',
    requirement: { type: 'count', target: 500 },
    rarity: 'rare'
  },
  {
    id: 'views_1000',
    name: 'Connoisseur',
    description: 'View 1,000 items',
    icon: Crown,
    color: 'text-purple-400',
    category: 'viewing',
    requirement: { type: 'count', target: 1000 },
    rarity: 'epic'
  },

  // Watch time achievements
  {
    id: 'time_1h',
    name: 'Hour Mark',
    description: 'Watch 1 hour of content',
    icon: Clock,
    color: 'text-green-400',
    category: 'viewing',
    requirement: { type: 'duration', target: 3600 },
    rarity: 'common'
  },
  {
    id: 'time_10h',
    name: 'Binge Watcher',
    description: 'Watch 10 hours of content',
    icon: Clock,
    color: 'text-green-500',
    category: 'viewing',
    requirement: { type: 'duration', target: 36000 },
    rarity: 'uncommon'
  },
  {
    id: 'time_100h',
    name: 'Time Invested',
    description: 'Watch 100 hours of content',
    icon: Clock,
    color: 'text-emerald-400',
    category: 'viewing',
    requirement: { type: 'duration', target: 360000 },
    rarity: 'rare'
  },

  // Favorites achievements
  {
    id: 'fav_first',
    name: 'First Love',
    description: 'Add your first favorite',
    icon: Heart,
    color: 'text-pink-400',
    category: 'engagement',
    requirement: { type: 'count', target: 1 },
    rarity: 'common'
  },
  {
    id: 'fav_50',
    name: 'Heart Collector',
    description: 'Add 50 favorites',
    icon: Heart,
    color: 'text-pink-500',
    category: 'engagement',
    requirement: { type: 'count', target: 50 },
    rarity: 'uncommon'
  },
  {
    id: 'fav_200',
    name: 'Hopeless Romantic',
    description: 'Add 200 favorites',
    icon: Heart,
    color: 'text-red-400',
    category: 'engagement',
    requirement: { type: 'count', target: 200 },
    rarity: 'rare'
  },

  // Rating achievements
  {
    id: 'rate_first',
    name: 'Critic',
    description: 'Rate your first item',
    icon: Star,
    color: 'text-amber-400',
    category: 'engagement',
    requirement: { type: 'count', target: 1 },
    rarity: 'common'
  },
  {
    id: 'rate_100',
    name: 'Expert Rater',
    description: 'Rate 100 items',
    icon: Star,
    color: 'text-amber-500',
    category: 'engagement',
    requirement: { type: 'count', target: 100 },
    rarity: 'uncommon'
  },

  // Streak achievements
  {
    id: 'streak_3',
    name: 'Getting Warm',
    description: '3 day streak',
    icon: Flame,
    color: 'text-orange-400',
    category: 'streaks',
    requirement: { type: 'streak', target: 3 },
    rarity: 'common'
  },
  {
    id: 'streak_7',
    name: 'Week Warrior',
    description: '7 day streak',
    icon: Flame,
    color: 'text-orange-500',
    category: 'streaks',
    requirement: { type: 'streak', target: 7 },
    rarity: 'uncommon'
  },
  {
    id: 'streak_30',
    name: 'Monthly Devotion',
    description: '30 day streak',
    icon: Flame,
    color: 'text-red-500',
    category: 'streaks',
    requirement: { type: 'streak', target: 30 },
    rarity: 'rare'
  },
  {
    id: 'streak_100',
    name: 'Unstoppable',
    description: '100 day streak',
    icon: Flame,
    color: 'text-red-600',
    category: 'streaks',
    requirement: { type: 'streak', target: 100 },
    rarity: 'epic'
  },
  {
    id: 'streak_365',
    name: 'Year of Dedication',
    description: '365 day streak',
    icon: Crown,
    color: 'text-yellow-400',
    category: 'streaks',
    requirement: { type: 'streak', target: 365 },
    rarity: 'legendary'
  },

  // Session achievements
  {
    id: 'marathon_1h',
    name: 'Marathon Session',
    description: 'Single session over 1 hour',
    icon: Zap,
    color: 'text-yellow-400',
    category: 'viewing',
    requirement: { type: 'milestone', target: 3600 },
    rarity: 'uncommon'
  },
  {
    id: 'marathon_3h',
    name: 'True Endurance',
    description: 'Single session over 3 hours',
    icon: Zap,
    color: 'text-yellow-500',
    category: 'viewing',
    requirement: { type: 'milestone', target: 10800 },
    rarity: 'rare'
  },

  // Collection achievements
  {
    id: 'collection_100',
    name: 'Collector',
    description: 'Have 100 items in library',
    icon: Trophy,
    color: 'text-cyan-400',
    category: 'collection',
    requirement: { type: 'count', target: 100 },
    rarity: 'common'
  },
  {
    id: 'collection_1000',
    name: 'Archivist',
    description: 'Have 1,000 items in library',
    icon: Trophy,
    color: 'text-cyan-500',
    category: 'collection',
    requirement: { type: 'count', target: 1000 },
    rarity: 'rare'
  },
  {
    id: 'collection_10000',
    name: 'Ultimate Curator',
    description: 'Have 10,000 items in library',
    icon: Crown,
    color: 'text-purple-500',
    category: 'collection',
    requirement: { type: 'count', target: 10000 },
    rarity: 'legendary'
  },

  // Exploration achievements
  {
    id: 'tag_master',
    name: 'Tag Master',
    description: 'Use 50 different tags',
    icon: Target,
    color: 'text-teal-400',
    category: 'exploration',
    requirement: { type: 'count', target: 50 },
    rarity: 'uncommon'
  },
  {
    id: 'playlist_creator',
    name: 'Playlist Pro',
    description: 'Create 10 playlists',
    icon: Medal,
    color: 'text-violet-400',
    category: 'exploration',
    requirement: { type: 'count', target: 10 },
    rarity: 'uncommon'
  }
]

// Rarity styles
const RARITY_STYLES = {
  common: 'from-zinc-500 to-zinc-600',
  uncommon: 'from-green-500 to-emerald-600',
  rare: 'from-blue-500 to-indigo-600',
  epic: 'from-purple-500 to-pink-600',
  legendary: 'from-amber-400 to-orange-500'
}

const RARITY_GLOW = {
  common: '',
  uncommon: 'shadow-green-500/30',
  rare: 'shadow-blue-500/30',
  epic: 'shadow-purple-500/30',
  legendary: 'shadow-amber-400/50 animate-pulse'
}

interface StreaksAchievementsProps {
  stats: UserStats
  streakData: StreakData
  unlockedAchievements: string[]
  onClose?: () => void
  className?: string
}

export function StreaksAchievements({
  stats,
  streakData,
  unlockedAchievements,
  onClose,
  className = ''
}: StreaksAchievementsProps) {
  const [activeCategory, setActiveCategory] = useState<string>('all')
  const [showUnlockedOnly, setShowUnlockedOnly] = useState(false)

  // Calculate achievement progress
  const achievementsWithProgress = useMemo(() => {
    return ACHIEVEMENTS.map(achievement => {
      let current = 0
      let isUnlocked = unlockedAchievements.includes(achievement.id)

      switch (achievement.id) {
        case 'first_view':
        case 'views_10':
        case 'views_100':
        case 'views_500':
        case 'views_1000':
          current = stats.totalViews
          break
        case 'time_1h':
        case 'time_10h':
        case 'time_100h':
          current = stats.totalWatchTime
          break
        case 'fav_first':
        case 'fav_50':
        case 'fav_200':
          current = stats.favoritesCount
          break
        case 'rate_first':
        case 'rate_100':
          current = stats.ratingsCount
          break
        case 'streak_3':
        case 'streak_7':
        case 'streak_30':
        case 'streak_100':
        case 'streak_365':
          current = streakData.currentStreak
          break
        case 'marathon_1h':
        case 'marathon_3h':
          current = stats.longestSession
          break
        case 'collection_100':
        case 'collection_1000':
        case 'collection_10000':
          current = stats.uniqueMediaViewed
          break
        case 'tag_master':
          current = stats.tagsUsed
          break
        case 'playlist_creator':
          current = stats.playlistsCreated
          break
      }

      const progress = Math.min(100, (current / achievement.requirement.target) * 100)

      return {
        ...achievement,
        requirement: { ...achievement.requirement, current },
        isUnlocked,
        progress
      }
    })
  }, [stats, streakData, unlockedAchievements])

  // Filter achievements
  const filteredAchievements = useMemo(() => {
    return achievementsWithProgress.filter(a => {
      if (showUnlockedOnly && !a.isUnlocked) return false
      if (activeCategory !== 'all' && a.category !== activeCategory) return false
      return true
    })
  }, [achievementsWithProgress, activeCategory, showUnlockedOnly])

  // Count unlocked by rarity
  const unlockedByRarity = useMemo(() => {
    const counts: Record<string, { unlocked: number; total: number }> = {}
    for (const rarity of ['common', 'uncommon', 'rare', 'epic', 'legendary']) {
      counts[rarity] = {
        unlocked: achievementsWithProgress.filter(a => a.rarity === rarity && a.isUnlocked).length,
        total: achievementsWithProgress.filter(a => a.rarity === rarity).length
      }
    }
    return counts
  }, [achievementsWithProgress])

  return (
    <div className={`bg-zinc-900/95 backdrop-blur-xl rounded-2xl border border-zinc-700 shadow-2xl overflow-hidden ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center">
            <Trophy size={20} className="text-white" />
          </div>
          <div>
            <h2 className="font-semibold">Achievements</h2>
            <p className="text-xs text-zinc-400">
              {unlockedAchievements.length} / {ACHIEVEMENTS.length} unlocked
            </p>
          </div>
        </div>
        {onClose && (
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-zinc-800 transition">
            <X size={18} />
          </button>
        )}
      </div>

      {/* Streak display */}
      <div className="px-5 py-4 bg-gradient-to-r from-orange-500/20 to-red-500/20 border-b border-zinc-800">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Flame size={24} className={streakData.currentStreak > 0 ? 'text-orange-400 animate-pulse' : 'text-zinc-600'} />
              <div>
                <div className="text-2xl font-bold">{streakData.currentStreak}</div>
                <div className="text-xs text-zinc-400">Day Streak</div>
              </div>
            </div>
            <div className="h-10 w-px bg-zinc-700" />
            <div>
              <div className="text-lg font-bold text-zinc-300">{streakData.longestStreak}</div>
              <div className="text-xs text-zinc-500">Best Streak</div>
            </div>
            <div className="h-10 w-px bg-zinc-700" />
            <div>
              <div className="text-lg font-bold text-zinc-300">{streakData.totalActiveDays}</div>
              <div className="text-xs text-zinc-500">Total Days</div>
            </div>
          </div>
          {/* Weekly activity */}
          <div className="flex items-center gap-1">
            {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((day, i) => (
              <div key={i} className="flex flex-col items-center gap-1">
                <span className="text-[10px] text-zinc-500">{day}</span>
                <div
                  className={`w-6 h-6 rounded-md flex items-center justify-center ${
                    streakData.weeklyStreak[i]
                      ? 'bg-orange-500/30 text-orange-400'
                      : 'bg-zinc-800 text-zinc-600'
                  }`}
                >
                  {streakData.weeklyStreak[i] ? <Check size={12} /> : null}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Rarity overview */}
      <div className="px-5 py-3 border-b border-zinc-800">
        <div className="flex items-center gap-2">
          {Object.entries(unlockedByRarity).map(([rarity, counts]) => (
            <div
              key={rarity}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gradient-to-r ${RARITY_STYLES[rarity as keyof typeof RARITY_STYLES]} bg-opacity-20`}
            >
              <span className="text-xs font-medium capitalize text-white">{rarity}</span>
              <span className="text-xs text-white/70">
                {counts.unlocked}/{counts.total}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Category filter */}
      <div className="flex items-center gap-2 px-5 py-3 border-b border-zinc-800 overflow-x-auto">
        {[
          { id: 'all', label: 'All' },
          { id: 'viewing', label: 'Viewing' },
          { id: 'engagement', label: 'Engagement' },
          { id: 'streaks', label: 'Streaks' },
          { id: 'collection', label: 'Collection' },
          { id: 'exploration', label: 'Exploration' }
        ].map(cat => (
          <button
            key={cat.id}
            onClick={() => setActiveCategory(cat.id)}
            className={`px-3 py-1.5 rounded-lg text-sm whitespace-nowrap transition ${
              activeCategory === cat.id
                ? 'bg-[var(--primary)] text-white'
                : 'bg-zinc-800 text-zinc-400 hover:text-white'
            }`}
          >
            {cat.label}
          </button>
        ))}
        <div className="flex-1" />
        <label className="flex items-center gap-2 text-sm text-zinc-400">
          <input
            type="checkbox"
            checked={showUnlockedOnly}
            onChange={(e) => setShowUnlockedOnly(e.target.checked)}
            className="rounded border-zinc-600 bg-zinc-800 text-[var(--primary)]"
          />
          Unlocked only
        </label>
      </div>

      {/* Achievements grid */}
      <div className="max-h-[50vh] overflow-y-auto p-5">
        <div className="grid grid-cols-2 gap-3">
          {filteredAchievements.map(achievement => (
            <AchievementCard key={achievement.id} achievement={achievement} />
          ))}
        </div>
      </div>
    </div>
  )
}

// Individual achievement card
function AchievementCard({
  achievement
}: {
  achievement: Achievement & { isUnlocked: boolean; progress: number }
}) {
  const Icon = achievement.icon
  const rarityStyle = RARITY_STYLES[achievement.rarity]
  const rarityGlow = RARITY_GLOW[achievement.rarity]

  return (
    <div
      className={`relative p-4 rounded-xl border transition ${
        achievement.isUnlocked
          ? `bg-gradient-to-br ${rarityStyle} bg-opacity-20 border-transparent shadow-lg ${rarityGlow}`
          : 'bg-zinc-800/50 border-zinc-700 opacity-60'
      }`}
    >
      {/* Lock overlay */}
      {!achievement.isUnlocked && (
        <div className="absolute top-2 right-2">
          <Lock size={14} className="text-zinc-500" />
        </div>
      )}

      {/* Icon */}
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 ${
        achievement.isUnlocked
          ? `bg-white/20`
          : 'bg-zinc-700'
      }`}>
        <Icon size={20} className={achievement.isUnlocked ? achievement.color : 'text-zinc-500'} />
      </div>

      {/* Info */}
      <div className="mb-2">
        <div className={`font-medium text-sm ${achievement.isUnlocked ? 'text-white' : 'text-zinc-400'}`}>
          {achievement.name}
        </div>
        <div className="text-xs text-zinc-500">{achievement.description}</div>
      </div>

      {/* Progress bar */}
      {!achievement.isUnlocked && (
        <div className="space-y-1">
          <div className="h-1.5 bg-zinc-700 rounded-full overflow-hidden">
            <div
              className={`h-full bg-gradient-to-r ${rarityStyle} transition-all duration-500`}
              style={{ width: `${achievement.progress}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-[10px] text-zinc-500">
            <span>{formatProgress(achievement.requirement.current || 0, achievement.requirement.type)}</span>
            <span>{formatProgress(achievement.requirement.target, achievement.requirement.type)}</span>
          </div>
        </div>
      )}

      {/* Unlocked badge */}
      {achievement.isUnlocked && (
        <div className="flex items-center gap-1 text-xs text-white/70">
          <Check size={12} />
          <span>Unlocked</span>
        </div>
      )}

      {/* Rarity badge */}
      <div className={`absolute top-2 left-2 px-1.5 py-0.5 rounded text-[9px] uppercase font-medium bg-gradient-to-r ${rarityStyle}`}>
        {achievement.rarity}
      </div>
    </div>
  )
}

// Format progress value
function formatProgress(value: number, type: string): string {
  if (type === 'duration') {
    return formatDuration(value)
  }
  if (value >= 1000) {
    return `${(value / 1000).toFixed(1)}k`
  }
  return value.toString()
}

// Mini streak display for toolbar
export function StreakDisplay({
  streak,
  onClick,
  className = ''
}: {
  streak: number
  onClick?: () => void
  className?: string
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-2 py-1 rounded-lg transition ${
        streak > 0
          ? 'bg-orange-500/20 text-orange-400 hover:bg-orange-500/30'
          : 'bg-zinc-800 text-zinc-500 hover:bg-zinc-700'
      } ${className}`}
    >
      <Flame size={14} className={streak > 0 ? 'animate-pulse' : ''} />
      <span className="text-sm font-medium">{streak}</span>
    </button>
  )
}

// Achievement unlock toast
export function AchievementUnlockToast({
  achievement,
  onClose
}: {
  achievement: Achievement
  onClose: () => void
}) {
  const Icon = achievement.icon
  const rarityStyle = RARITY_STYLES[achievement.rarity]

  useEffect(() => {
    const timer = setTimeout(onClose, 5000)
    return () => clearTimeout(timer)
  }, [onClose])

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[9999] animate-in slide-in-from-bottom-4">
      <div className={`flex items-center gap-4 px-6 py-4 rounded-2xl bg-gradient-to-r ${rarityStyle} shadow-2xl`}>
        <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center">
          <Icon size={24} className="text-white" />
        </div>
        <div>
          <div className="text-xs text-white/70 uppercase tracking-wide">Achievement Unlocked!</div>
          <div className="text-lg font-bold text-white">{achievement.name}</div>
          <div className="text-sm text-white/80">{achievement.description}</div>
        </div>
        <button onClick={onClose} className="p-2 hover:bg-white/20 rounded-lg transition">
          <X size={18} className="text-white" />
        </button>
      </div>
    </div>
  )
}

export default StreaksAchievements
