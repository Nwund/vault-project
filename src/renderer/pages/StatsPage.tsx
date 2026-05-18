// File: src/renderer/pages/StatsPage.tsx
//
// Goon stats + collection stats + achievements + daily challenges page.
// Extracted from App.tsx as part of #48 phase B. Confetti / anime hooks
// passed in by App because they're owned at app level (shared across
// many pages for celebratory effects).

import { useEffect, useState } from 'react'
import { CheckCircle2, Clock, Star } from 'lucide-react'
import { useToast } from '../contexts'
import { useConfetti } from '../hooks/useConfetti'
import { useAnime } from '../hooks/useAnime'
import type { GoonStats, SessionAnalytics } from '../types'
import { TopBar, AnimatedCounter, DurationDisplay } from '../components/ui'
import { cn } from '../utils/cn'
import { formatBytes } from '../utils/formatters'

type Achievement = {
  id: string
  name: string
  description: string
  icon: string
  category: string
  target: number
  secret?: boolean
}

// Daily challenge type for UI
type DailyChallengeUI = {
  id: string
  type: string
  title: string
  description: string
  icon: string
  target: number
  progress: number
  completed: boolean
  rewardXp: number
}

type DailyChallengeStateUI = {
  date: string
  challenges: DailyChallengeUI[]
  completedCount: number
  totalXp: number
  streak: number
}

export function StatsPage({ confetti, anime }: { confetti?: ReturnType<typeof useConfetti>; anime?: ReturnType<typeof useAnime> }) {
  const { showToast } = useToast()
  const [goonStats, setGoonStats] = useState<GoonStats | null>(null)
  const [vaultStats, setVaultStats] = useState<any>(null)
  const [achievements, setAchievements] = useState<Achievement[]>([])
  const [loading, setLoading] = useState(true)
  const [achievementTab, setAchievementTab] = useState<string>('all')
  const [dailyChallenges, setDailyChallenges] = useState<DailyChallengeStateUI | null>(null)
  const [sessionAnalytics, setSessionAnalytics] = useState<SessionAnalytics | null>(null)

  useEffect(() => {
    loadAllStats()
    loadDailyChallenges()
    const unsubStats = window.api.events.onGoonStatsChanged?.((s: GoonStats) => setGoonStats(s))
    const unsubAchievement = window.api.events.onAchievementUnlocked?.((ids: string[]) => {
      console.log('Achievements unlocked:', ids)
      confetti?.achievement()
      loadAllStats()
    })
    const unsubChallenge = window.api.challenges?.onCompleted?.((completed: any[]) => {
      completed.forEach(c => {
        showToast('success', `Challenge Complete: ${c.title} (+${c.rewardXp} XP)`)
      })
      confetti?.burst()
      loadDailyChallenges()
    })
    // Subscribe to vault changes to refresh stats when media is added/removed
    const unsubVault = window.api.events.onVaultChanged?.(() => {
      loadAllStats()  // Refresh all stats including totalDurationSec
    })
    return () => { unsubStats?.(); unsubAchievement?.(); unsubChallenge?.(); unsubVault?.() }
  }, [])

  const loadDailyChallenges = async () => {
    try {
      const state = await window.api.challenges?.get?.()
      if (state) setDailyChallenges(state)
    } catch (e) {
      console.error('Failed to load daily challenges:', e)
    }
  }

  const loadAllStats = async () => {
    try {
      const [gs, vs, sa] = await Promise.all([
        window.api.goon.getStats(),
        window.api.vault.getStats(),
        window.api.invoke('sessionHistory:getAnalytics', 30).catch(() => null)
      ])
      setGoonStats(gs)
      setVaultStats(vs)
      if (sa) setSessionAnalytics(sa as SessionAnalytics)
      const a = await window.api.goon.getAchievements()
      setAchievements(a)
    } catch (e) {
      console.error('Failed to load stats:', e)
    } finally {
      setLoading(false)
    }
  }

  const fmt = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n)
  const fmtTime = (minutes: number) => {
    if (minutes < 60) return `${minutes}m`
    const h = Math.floor(minutes / 60)
    return h >= 24 ? `${(h / 24).toFixed(1)}d` : `${h}h ${minutes % 60}m`
  }
  const fmtSize = (bytes: number) => formatBytes(bytes)
  const fmtDuration = (seconds: number) => {
    const h = Math.floor(seconds / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    if (h >= 24) return `${(h / 24).toFixed(1)} days`
    if (h > 0) return `${h}h ${m}m`
    return `${m}m`
  }

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-[var(--muted)] animate-pulse-subtle">Loading stats...</div>
      </div>
    )
  }

  const gs = goonStats
  const vs = vaultStats
  const unlockedIds = new Set(gs?.achievements ?? [])
  const unlockedCount = achievements.filter(a => unlockedIds.has(a.id)).length
  const categories = [...new Set(achievements.map(a => a.category))]
  const filteredAchievements = achievementTab === 'all'
    ? achievements.filter(a => !a.secret || unlockedIds.has(a.id))
    : achievements.filter(a => a.category === achievementTab && (!a.secret || unlockedIds.has(a.id)))

  // Compute progress for each achievement
  const getProgress = (a: Achievement): number => {
    if (!gs) return 0
    const s = gs
    const v = vs
    switch (a.id) {
      case 'first_import': return Math.min(1, s.totalVideosWatched + s.uniqueVideosWatched > 0 ? 1 : 0)
      case 'building_collection': return Math.min(1, (v?.totalMedia ?? 0) / 100)
      case 'organized': return Math.min(1, s.playlistsCreated)
      case 'tagged': return Math.min(1, s.tagsAssigned / 10)
      case 'rated': return Math.min(1, s.ratingsGiven / 10)
      case 'night_owl': return Math.min(1, s.nightOwlSessions)
      case 'early_bird': return Math.min(1, s.earlyBirdSessions)
      case 'weekend_warrior': return Math.min(1, s.weekendSessionsThisWeekend / 5)
      case 'marathon': return Math.min(1, s.longestSession / 120)
      case 'quick_release': return s.averageSessionLength > 0 && s.averageSessionLength <= 5 ? 1 : 0
      case 'first_edge': return Math.min(1, s.totalEdges)
      case 'edge_apprentice': return Math.min(1, s.totalEdges / 10)
      case 'edge_journeyman': return Math.min(1, s.totalEdges / 50)
      case 'edge_master': return Math.min(1, s.totalEdges / 100)
      case 'edge_god': return Math.min(1, s.edgesThisSession / 100)
      case 'denial': return Math.min(1, s.longestEdge / 30)
      case 'denial_king': return Math.min(1, s.longestEdge / 60)
      case 'edge_marathon': return Math.min(1, s.edgesThisSession / 10)
      case 'precision': return s.longestEdge === 69 ? 1 : 0
      case 'control_freak': return s.edgesThisSession >= 20 && s.orgasmsThisWeek === 0 ? 1 : 0
      case 'dedicated': return Math.min(1, s.totalSessions / 10)
      case 'regular': return Math.min(1, s.totalSessions / 50)
      case 'devoted': return Math.min(1, s.totalSessions / 100)
      case 'obsessed': return Math.min(1, s.totalSessions / 500)
      case 'transcendent': return Math.min(1, s.totalTimeGooning / 60000)
      case 'iron_will': return Math.min(1, s.currentStreak / 7)
      case 'committed': return Math.min(1, s.currentStreak / 30)
      case 'nice': return Math.min(1, s.currentStreak / 69)
      case 'legendary': return Math.min(1, s.currentStreak / 100)
      case 'stamina': return Math.min(1, s.longestSession / 300)
      case 'wall_activated': return Math.min(1, s.goonWallSessions)
      case 'multi_tasker': return Math.min(1, s.goonWallMaxTiles / 4)
      case 'overload': return Math.min(1, s.goonWallMaxTiles / 9)
      case 'maximum': return Math.min(1, s.goonWallMaxTiles / 16)
      case 'hypnotized': return Math.min(1, s.goonWallTimeMinutes / 30)
      case 'wall_walker': return Math.min(1, s.goonWallSessions / 100)
      case 'shuffle_master': return Math.min(1, s.goonWallShuffles / 50)
      case 'audio_bliss': return Math.min(1, s.goonWallSessions)
      case 'the_zone': return Math.min(1, s.goonWallTimeMinutes / 60)
      case 'chaos_lover': return s.goonWallMaxTiles >= 12 ? Math.min(1, s.goonWallSessions / 10) : 0
      case 'hoarder': return Math.min(1, (v?.totalMedia ?? 0) / 500)
      case 'archivist': return Math.min(1, (v?.totalMedia ?? 0) / 1000)
      case 'mega_library': return Math.min(1, (v?.totalMedia ?? 0) / 5000)
      case 'playlist_pro': return Math.min(1, (v?.playlistCount ?? s.playlistsCreated) / 5)
      case 'tag_enthusiast': return Math.min(1, s.tagsAssigned / 50)
      case 'tag_master': return Math.min(1, s.tagsAssigned / 200)
      case 'critic': return Math.min(1, s.ratingsGiven / 50)
      case 'connoisseur': return Math.min(1, s.uniqueVideosWatched / 500)
      case 'binge_watcher': return Math.min(1, s.totalVideosWatched / 100)
      case 'explorer': return Math.min(1, s.totalVideosWatched / 1000)
      default: return 0
    }
  }

  const categoryLabels: Record<string, string> = {
    getting_started: 'Getting Started',
    edging: 'Edging',
    session: 'Sessions',
    goonwall: 'Goon Wall',
    collection: 'Collection'
  }

  return (
    <div className="h-full flex flex-col">
      <TopBar title="Stats" />

      <div className="flex-1 overflow-auto p-4 sm:p-6 pb-safe">
        {/* Streak Banner at top */}
        {gs && gs.currentStreak > 0 && (
          <div className="mb-6 p-4 bg-gradient-to-r from-[var(--primary)]/20 to-[var(--secondary)]/20 rounded-2xl border border-[var(--primary)]/30 flex items-center gap-4">
            <div className="text-4xl font-bold text-[var(--primary)]">{gs.currentStreak}</div>
            <div>
              <div className="text-sm font-semibold">Day Streak</div>
              <div className="text-xs text-[var(--muted)]">
                {gs.currentStreak >= 30 ? 'Legendary consistency' : gs.currentStreak >= 7 ? 'On a roll' : 'Keep it going'}
                {gs.longestStreak > gs.currentStreak && ` \u00b7 Best: ${gs.longestStreak} days`}
              </div>
            </div>
          </div>
        )}

        {/* Daily Challenges */}
        {dailyChallenges && (
          <div className="mb-6 p-4 bg-gradient-to-br from-amber-500/10 to-orange-500/10 rounded-2xl border border-amber-500/20">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="text-2xl">🎯</div>
                <div>
                  <div className="text-sm font-semibold">Daily Challenges</div>
                  <div className="text-xs text-[var(--muted)]">
                    {dailyChallenges.completedCount}/{dailyChallenges.challenges.length} completed
                    {dailyChallenges.streak > 0 && ` • ${dailyChallenges.streak} day streak`}
                  </div>
                </div>
              </div>
              <div className="text-right">
                <div className="text-lg font-bold text-amber-400">{dailyChallenges.totalXp.toLocaleString()} XP</div>
                <div className="text-xs text-[var(--muted)]">Total earned</div>
              </div>
            </div>

            <div className="space-y-2">
              {dailyChallenges.challenges.map(challenge => (
                <div
                  key={challenge.id}
                  className={cn(
                    'flex items-center gap-3 p-3 rounded-xl transition-all',
                    challenge.completed
                      ? 'bg-green-500/10 border border-green-500/30'
                      : 'bg-black/20 border border-white/5'
                  )}
                >
                  <div className="text-2xl">{challenge.icon}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={cn('text-sm font-medium', challenge.completed && 'line-through opacity-60')}>
                        {challenge.title}
                      </span>
                      {challenge.completed && (
                        <CheckCircle2 size={14} className="text-green-500 flex-shrink-0" />
                      )}
                    </div>
                    <div className="text-xs text-[var(--muted)]">{challenge.description}</div>
                    {!challenge.completed && (
                      <div className="mt-1.5 flex items-center gap-2">
                        <div className="flex-1 h-1.5 bg-black/30 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-amber-500 to-orange-500 transition-all duration-300"
                            style={{ width: `${(challenge.progress / challenge.target) * 100}%` }}
                          />
                        </div>
                        <span className="text-xs text-[var(--muted)] tabular-nums">
                          {challenge.progress}/{challenge.target}
                        </span>
                      </div>
                    )}
                  </div>
                  <div className={cn(
                    'text-xs font-medium px-2 py-1 rounded-lg',
                    challenge.completed ? 'bg-green-500/20 text-green-400' : 'bg-amber-500/20 text-amber-400'
                  )}>
                    +{challenge.rewardXp} XP
                  </div>
                </div>
              ))}
            </div>

            {dailyChallenges.completedCount === dailyChallenges.challenges.length && (
              <div className="mt-4 p-3 bg-green-500/10 rounded-xl border border-green-500/30 text-center">
                <div className="text-green-400 font-medium">All challenges complete!</div>
                <div className="text-xs text-[var(--muted)]">New challenges tomorrow</div>
              </div>
            )}
          </div>
        )}

        {/* Collection Overview - Big highlight card */}
        <div className="mb-6 p-4 bg-gradient-to-br from-[var(--primary)]/10 to-[var(--secondary)]/10 rounded-2xl border border-[var(--border)]">
          <div className="flex items-center gap-4 mb-3">
            <div className="text-3xl font-bold text-[var(--primary)]">{fmtSize(vs?.totalSizeBytes ?? 0)}</div>
            <div className="text-sm text-[var(--muted)]">Total Collection Size</div>
          </div>
          <div className="flex items-center gap-6 text-sm flex-wrap">
            <div className="flex items-center gap-1">
              <DurationDisplay totalSeconds={vs?.totalDurationSec ?? 0} />
              <span className="text-[var(--muted)]">of video</span>
            </div>
            <div><span className="text-white font-medium">{fmt(vs?.totalMedia ?? 0)}</span> <span className="text-[var(--muted)]">files</span></div>
            {(vs?.videosMissingDuration ?? 0) > 0 && (
              <button
                onClick={async () => {
                  try {
                    const r = await window.api.vault.backfillDurations()
                    showToast?.('info', `Queued ${r.enqueued} videos for duration scan`)
                    setTimeout(() => loadAllStats(), 800)
                  } catch (e: any) {
                    showToast?.('error', e?.message ?? 'Backfill failed')
                  }
                }}
                title="Some videos haven't had their duration extracted yet. Click to re-scan."
                className="px-2 py-1 rounded-md bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 text-xs border border-amber-500/30 transition"
              >
                {fmt(vs!.videosMissingDuration!)} pending duration scan — re-extract
              </button>
            )}
          </div>
        </div>

        {/* Stat cards — 2 rows */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          {[
            { label: 'Videos', value: fmt(vs?.videoCount ?? 0), color: 'text-blue-400' },
            { label: 'Images', value: fmt(vs?.imageCount ?? 0), color: 'text-green-400' },
            { label: 'GIFs', value: fmt(vs?.gifCount ?? 0), color: 'text-purple-400' },
            { label: 'Tags', value: fmt(vs?.tagCount ?? 0), color: 'text-amber-400' },
            { label: 'Videos Watched', value: fmt(gs?.totalVideosWatched ?? 0), color: 'text-pink-400' },
            { label: 'Unique Watched', value: fmt(gs?.uniqueVideosWatched ?? 0), color: 'text-violet-400' },
            { label: 'Playlists', value: fmt(vs?.playlistCount ?? 0), color: 'text-cyan-400' },
            { label: 'Sessions', value: fmt(gs?.totalSessions ?? 0), color: 'text-orange-400' },
          ].map((s, i) => (
            <div key={i} className="p-3 sm:p-4 bg-white/5 rounded-xl border border-white/10">
              <div className={`text-xl sm:text-2xl font-bold ${s.color} mb-0.5`}>{s.value}</div>
              <div className="text-[10px] sm:text-xs text-[var(--muted)]">{s.label}</div>
            </div>
          ))}
        </div>

        {/* Activity row */}
        <div className="grid grid-cols-4 gap-3 mb-6">
          <div className="p-3 bg-gradient-to-br from-pink-500/10 to-rose-500/10 rounded-xl border border-pink-500/20">
            <div className="text-lg font-semibold text-pink-400">{fmtDuration(gs?.totalWatchTime ?? 0)}</div>
            <div className="text-[10px] text-[var(--muted)]">Total Watch Time</div>
          </div>
          <div className="p-3 bg-white/5 rounded-xl border border-white/10">
            <div className="text-lg font-semibold">{gs?.goonWallSessions ?? 0}</div>
            <div className="text-[10px] text-[var(--muted)]">Wall Sessions</div>
          </div>
          <div className="p-3 bg-white/5 rounded-xl border border-white/10">
            <div className="text-lg font-semibold">{fmtTime(gs?.goonWallTimeMinutes ?? 0)}</div>
            <div className="text-[10px] text-[var(--muted)]">Wall Time</div>
          </div>
          <div className="p-3 bg-white/5 rounded-xl border border-white/10">
            <div className="text-lg font-semibold">{gs?.goonWallShuffles ?? 0}</div>
            <div className="text-[10px] text-[var(--muted)]">Shuffles</div>
          </div>
        </div>

        {/* Session Analytics - 30 day insights */}
        {sessionAnalytics && (
          <div className="mb-6 p-4 bg-gradient-to-br from-violet-500/10 to-purple-600/10 rounded-2xl border border-violet-500/20">
            <div className="flex items-center gap-2 mb-4">
              <Clock size={16} className="text-violet-400" />
              <span className="text-sm font-semibold text-violet-300">Session Insights</span>
              <span className="text-[10px] text-[var(--muted)]">last 30 days</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              <div>
                <div className="text-2xl font-bold text-violet-400">
                  <AnimatedCounter value={sessionAnalytics.totalSessions} />
                </div>
                <div className="text-[10px] text-[var(--muted)]">Total Sessions</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-purple-400">{fmtDuration(sessionAnalytics.totalDuration)}</div>
                <div className="text-[10px] text-[var(--muted)]">Total Time</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-pink-400">{fmtDuration(sessionAnalytics.avgSessionDuration)}</div>
                <div className="text-[10px] text-[var(--muted)]">Avg Session</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-fuchsia-400 count-up">
                  {sessionAnalytics.avgMediaPerSession.toFixed(1)}
                </div>
                <div className="text-[10px] text-[var(--muted)]">Media/Session</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-indigo-400">
                  {sessionAnalytics.mostActiveHour === 0 ? '12 AM' :
                   sessionAnalytics.mostActiveHour < 12 ? `${sessionAnalytics.mostActiveHour} AM` :
                   sessionAnalytics.mostActiveHour === 12 ? '12 PM' :
                   `${sessionAnalytics.mostActiveHour - 12} PM`}
                </div>
                <div className="text-[10px] text-[var(--muted)]">Peak Hour</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-blue-400">{sessionAnalytics.mostActiveDay}</div>
                <div className="text-[10px] text-[var(--muted)]">Peak Day</div>
              </div>
            </div>
          </div>
        )}

        {/* Top Tags and Quick Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
          {/* Top Tags */}
          <div className="p-4 bg-white/5 rounded-xl border border-white/10">
            <div className="text-sm font-semibold text-[var(--muted)] mb-3">Top Tags</div>
            <div className="flex flex-wrap gap-1.5">
              {(vs?.topTags ?? []).slice(0, 8).map((tag: { name: string; count: number }, i: number) => (
                <div
                  key={tag.name}
                  className="px-2 py-1 rounded-lg text-xs bg-[var(--primary)]/20 text-[var(--primary)] flex items-center gap-1.5"
                  title={`Used on ${tag.count} items`}
                >
                  <span>{tag.name}</span>
                  <span className="text-[10px] text-[var(--muted)]">({tag.count})</span>
                </div>
              ))}
              {(!vs?.topTags || vs.topTags.length === 0) && (
                <div className="text-xs text-[var(--muted)]">No tags yet</div>
              )}
            </div>
          </div>

          {/* Quick Stats */}
          <div className="p-4 bg-white/5 rounded-xl border border-white/10">
            <div className="text-sm font-semibold text-[var(--muted)] mb-3">Library Health</div>
            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-[var(--muted)]">Added This Week</span>
                <span className="text-green-400 font-medium">+{vs?.recentlyAdded ?? 0}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[var(--muted)]">Favorites</span>
                <span className="text-pink-400 font-medium">{vs?.favoritesCount ?? 0}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[var(--muted)]">Avg Rating</span>
                <span className="text-amber-400 font-medium">{(vs?.avgRating ?? 0).toFixed(1)} <Star size={10} className="inline" /></span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[var(--muted)]">Media Folders</span>
                <span className="text-white">{vs?.mediaDirs ?? 0}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Achievements section */}
        <div className="mb-4 flex items-center justify-between">
          <div className="text-sm font-semibold text-[var(--muted)]">
            Achievements <span className="text-[var(--primary)]">{unlockedCount}</span>/{achievements.filter(a => !a.secret).length}
          </div>
        </div>

        {/* Category tabs */}
        <div className="flex gap-1 mb-4 flex-wrap">
          <button
            onClick={() => setAchievementTab('all')}
            className={cn(
              'px-2.5 py-1 rounded-lg text-xs transition',
              achievementTab === 'all' ? 'bg-[var(--primary)]/20 text-white font-medium' : 'bg-white/5 text-white/50 hover:text-white/80'
            )}
          >All</button>
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => setAchievementTab(cat)}
              className={cn(
                'px-2.5 py-1 rounded-lg text-xs transition',
                achievementTab === cat ? 'bg-[var(--primary)]/20 text-white font-medium' : 'bg-white/5 text-white/50 hover:text-white/80'
              )}
            >{categoryLabels[cat] ?? cat}</button>
          ))}
        </div>

        {/* Achievement grid with progress */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {filteredAchievements.map(a => {
            const unlocked = unlockedIds.has(a.id)
            const progress = unlocked ? 1 : getProgress(a)
            const pct = Math.round(progress * 100)
            return (
              <div
                key={a.id}
                className={cn(
                  'p-3 rounded-xl border transition',
                  unlocked
                    ? 'bg-[var(--primary)]/10 border-[var(--primary)]/30'
                    : 'bg-white/5 border-white/10 opacity-60'
                )}
              >
                <div className="flex items-start gap-2 mb-2">
                  <div className={cn('text-xl', !unlocked && 'grayscale opacity-50')}>{unlocked ? a.icon : '🔒'}</div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium truncate">{a.name}</div>
                    <div className="text-[10px] text-[var(--muted)] leading-tight">{a.description}</div>
                  </div>
                </div>
                {/* Progress bar */}
                {!unlocked && (
                  <div className="h-1 bg-white/10 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[var(--primary)] rounded-full transition-all duration-500"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                )}
                {!unlocked && pct > 0 && (
                  <div className="text-[9px] text-[var(--muted)] mt-1">{pct}%</div>
                )}
                {unlocked && (
                  <div className="text-[9px] text-[var(--primary)] font-medium mt-1">Unlocked</div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
