// File: src/renderer/components/StatsDashboard.tsx
// Enhanced statistics dashboard with visualizations

import React, { useState, useEffect, useCallback, useMemo } from 'react'
import {
  BarChart3,
  PieChart,
  TrendingUp,
  Clock,
  HardDrive,
  Tag,
  Film,
  Image,
  FileImage,
  Star,
  Eye,
  Calendar,
  Activity,
  AlertTriangle,
  CheckCircle,
  ChevronRight,
  RefreshCw,
  Loader2,
  Sparkles,
  Heart,
  Zap,
  Award
} from 'lucide-react'
import { toFileUrlCached } from '../hooks/usePerformance'
import { formatBytes, formatDuration } from '../utils/formatters'

interface DashboardStats {
  overview: {
    totalMedia: number
    totalSize: number
    totalDuration: number
    avgRating: number
  }
  quality: {
    uhd4k: number
    hd1080p: number
    hd720p: number
    sd480p: number
    sdLow: number
    unknown: number
  }
  topTags: Array<{ name: string; count: number }>
  recentlyAdded: Array<{ id: string; filename: string; addedAt: number; thumbPath?: string }>
  mostViewed: Array<{ id: string; filename: string; views: number; thumbPath?: string }>
  health: {
    score: number
    issues: Array<{ type: string; count: number; severity: string; description: string }>
    recommendations: string[]
  }
}

interface StorageStats {
  totalSize: number
  videoSize: number
  imageSize: number
  gifSize: number
  largestFiles: Array<{ id: string; filename: string; size: number }>
}

interface DurationStats {
  avgDuration: number
  medianDuration: number
  totalPlaytime: number
  durationBuckets: {
    under1min: number
    oneToFive: number
    fiveToFifteen: number
    fifteenToThirty: number
    thirtyToSixty: number
    overHour: number
  }
}

interface TagStats {
  totalTags: number
  usedTags: number
  unusedTags: number
  avgTagsPerMedia: number
  untaggedMedia: number
  tagCloud: Array<{ name: string; count: number }>
}

interface GrowthStats {
  monthlyGrowth: Array<{ month: string; added: number; cumulative: number }>
  avgDailyAdditions: number
}

interface StatsDashboardProps {
  onSelectMedia?: (mediaId: string) => void
  onNavigateToTag?: (tag: string) => void
  className?: string
}

export function StatsDashboard({
  onSelectMedia,
  onNavigateToTag,
  className = ''
}: StatsDashboardProps) {
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'overview' | 'storage' | 'content' | 'tags' | 'activity'>('overview')
  const [dashboardStats, setDashboardStats] = useState<DashboardStats | null>(null)
  const [storageStats, setStorageStats] = useState<StorageStats | null>(null)
  const [durationStats, setDurationStats] = useState<DurationStats | null>(null)
  const [tagStats, setTagStats] = useState<TagStats | null>(null)
  const [growthStats, setGrowthStats] = useState<GrowthStats | null>(null)

  const loadStats = useCallback(async () => {
    setLoading(true)
    try {
      const [dashboard, storage, duration, tags, growth] = await Promise.all([
        window.api.invoke('advancedStats:getDashboard') as Promise<DashboardStats>,
        window.api.invoke('advancedStats:getStorage') as Promise<StorageStats>,
        window.api.invoke('advancedStats:getDuration') as Promise<DurationStats>,
        window.api.invoke('advancedStats:getTags') as Promise<TagStats>,
        window.api.invoke('advancedStats:getGrowth') as Promise<GrowthStats>
      ])
      setDashboardStats(dashboard)
      setStorageStats(storage)
      setDurationStats(duration)
      setTagStats(tags)
      setGrowthStats(growth)
    } catch (e) {
      console.error('Failed to load stats:', e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadStats()
  }, [loadStats])

  if (loading) {
    return (
      <div className={`flex items-center justify-center py-24 ${className}`}>
        <div className="text-center">
          <Loader2 size={32} className="animate-spin text-[var(--primary)] mx-auto mb-4" />
          <p className="text-zinc-400">Loading statistics...</p>
        </div>
      </div>
    )
  }

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Tab navigation */}
      <div className="flex items-center gap-1 p-1 bg-zinc-800/50 rounded-xl">
        {[
          { id: 'overview', label: 'Overview', icon: BarChart3 },
          { id: 'storage', label: 'Storage', icon: HardDrive },
          { id: 'content', label: 'Content', icon: Film },
          { id: 'tags', label: 'Tags', icon: Tag },
          { id: 'activity', label: 'Activity', icon: Activity }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg transition ${
              activeTab === tab.id
                ? 'bg-[var(--primary)] text-white'
                : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
            }`}
          >
            <tab.icon size={16} />
            <span className="text-sm font-medium">{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Content */}
      {activeTab === 'overview' && dashboardStats && (
        <OverviewTab
          stats={dashboardStats}
          onSelectMedia={onSelectMedia}
          onNavigateToTag={onNavigateToTag}
        />
      )}
      {activeTab === 'storage' && storageStats && (
        <StorageTab stats={storageStats} onSelectMedia={onSelectMedia} />
      )}
      {activeTab === 'content' && durationStats && dashboardStats && (
        <ContentTab durationStats={durationStats} qualityStats={dashboardStats.quality} />
      )}
      {activeTab === 'tags' && tagStats && (
        <TagsTab stats={tagStats} onNavigateToTag={onNavigateToTag} />
      )}
      {activeTab === 'activity' && dashboardStats && growthStats && (
        <ActivityTab dashboardStats={dashboardStats} growthStats={growthStats} onSelectMedia={onSelectMedia} />
      )}

      {/* Refresh button */}
      <div className="flex justify-center">
        <button
          onClick={loadStats}
          className="flex items-center gap-2 px-4 py-2 text-sm text-zinc-400 hover:text-white transition"
        >
          <RefreshCw size={14} />
          Refresh Statistics
        </button>
      </div>
    </div>
  )
}

// Overview Tab
function OverviewTab({
  stats,
  onSelectMedia,
  onNavigateToTag
}: {
  stats: DashboardStats
  onSelectMedia?: (id: string) => void
  onNavigateToTag?: (tag: string) => void
}) {
  return (
    <div className="space-y-6">
      {/* Hero stats */}
      <div className="grid grid-cols-4 gap-4">
        <StatCard
          icon={Film}
          label="Total Media"
          value={stats.overview.totalMedia.toLocaleString()}
          color="blue"
        />
        <StatCard
          icon={HardDrive}
          label="Storage Used"
          value={formatBytes(stats.overview.totalSize)}
          color="purple"
        />
        <StatCard
          icon={Clock}
          label="Total Duration"
          value={formatDuration(stats.overview.totalDuration)}
          color="green"
        />
        <StatCard
          icon={Star}
          label="Avg Rating"
          value={stats.overview.avgRating.toFixed(1)}
          suffix="/5"
          color="amber"
        />
      </div>

      {/* Library health */}
      <div className="bg-zinc-800/50 rounded-2xl p-5">
        <h3 className="font-semibold mb-4 flex items-center gap-2">
          <Activity size={18} className="text-[var(--primary)]" />
          Library Health
        </h3>
        <div className="flex items-center gap-6">
          <div className="relative w-24 h-24">
            <svg className="w-full h-full transform -rotate-90">
              <circle
                cx="48"
                cy="48"
                r="40"
                fill="none"
                stroke="currentColor"
                strokeWidth="8"
                className="text-zinc-700"
              />
              <circle
                cx="48"
                cy="48"
                r="40"
                fill="none"
                stroke="currentColor"
                strokeWidth="8"
                strokeDasharray={`${(stats.health.score / 100) * 251.2} 251.2`}
                className={
                  stats.health.score >= 80
                    ? 'text-emerald-500'
                    : stats.health.score >= 60
                    ? 'text-amber-500'
                    : 'text-red-500'
                }
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-2xl font-bold">{stats.health.score}</span>
            </div>
          </div>
          <div className="flex-1 space-y-2">
            {stats.health.issues.length === 0 ? (
              <div className="flex items-center gap-2 text-emerald-400">
                <CheckCircle size={16} />
                <span>Your library is in great shape!</span>
              </div>
            ) : (
              stats.health.issues.slice(0, 3).map((issue, i) => (
                <div key={i} className="flex items-center gap-2 text-sm">
                  <AlertTriangle
                    size={14}
                    className={
                      issue.severity === 'high'
                        ? 'text-red-400'
                        : issue.severity === 'medium'
                        ? 'text-amber-400'
                        : 'text-zinc-400'
                    }
                  />
                  <span className="text-zinc-300">{issue.description}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Two columns */}
      <div className="grid grid-cols-2 gap-6">
        {/* Top Tags */}
        <div className="bg-zinc-800/50 rounded-2xl p-5">
          <h3 className="font-semibold mb-4 flex items-center gap-2">
            <Tag size={18} className="text-[var(--primary)]" />
            Top Tags
          </h3>
          <div className="space-y-2">
            {stats.topTags.slice(0, 8).map((tag, i) => (
              <div
                key={tag.name}
                className="flex items-center gap-3 cursor-pointer hover:bg-zinc-800 rounded-lg p-2 transition"
                onClick={() => onNavigateToTag?.(tag.name)}
              >
                <span className="text-xs text-zinc-500 w-4">{i + 1}</span>
                <span className="flex-1 text-sm">{tag.name}</span>
                <span className="text-xs text-zinc-400">{tag.count}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Most Viewed */}
        <div className="bg-zinc-800/50 rounded-2xl p-5">
          <h3 className="font-semibold mb-4 flex items-center gap-2">
            <Eye size={18} className="text-[var(--primary)]" />
            Most Viewed
          </h3>
          <div className="space-y-2">
            {stats.mostViewed.slice(0, 5).map((item, i) => (
              <MediaRow
                key={item.id}
                item={item}
                rank={i + 1}
                onClick={() => onSelectMedia?.(item.id)}
                statLabel={`${item.views} views`}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

// Storage Tab
function StorageTab({
  stats,
  onSelectMedia
}: {
  stats: StorageStats
  onSelectMedia?: (id: string) => void
}) {
  const typeBreakdown = useMemo(() => {
    const total = stats.totalSize || 1
    return [
      { label: 'Videos', size: stats.videoSize, percent: (stats.videoSize / total) * 100, color: 'bg-blue-500' },
      { label: 'Images', size: stats.imageSize, percent: (stats.imageSize / total) * 100, color: 'bg-purple-500' },
      { label: 'GIFs', size: stats.gifSize, percent: (stats.gifSize / total) * 100, color: 'bg-green-500' }
    ]
  }, [stats])

  return (
    <div className="space-y-6">
      {/* Total storage */}
      <div className="bg-zinc-800/50 rounded-2xl p-6 text-center">
        <HardDrive size={32} className="text-[var(--primary)] mx-auto mb-3" />
        <div className="text-4xl font-bold mb-1">{formatBytes(stats.totalSize)}</div>
        <div className="text-zinc-400">Total Storage Used</div>
      </div>

      {/* Type breakdown */}
      <div className="bg-zinc-800/50 rounded-2xl p-5">
        <h3 className="font-semibold mb-4">Storage by Type</h3>

        {/* Bar visualization */}
        <div className="h-6 flex rounded-lg overflow-hidden mb-4">
          {typeBreakdown.map(type => (
            <div
              key={type.label}
              className={`${type.color} transition-all`}
              style={{ width: `${type.percent}%` }}
              title={`${type.label}: ${formatBytes(type.size)}`}
            />
          ))}
        </div>

        {/* Legend */}
        <div className="grid grid-cols-3 gap-4">
          {typeBreakdown.map(type => (
            <div key={type.label} className="flex items-center gap-3">
              <div className={`w-3 h-3 rounded ${type.color}`} />
              <div>
                <div className="text-sm font-medium">{type.label}</div>
                <div className="text-xs text-zinc-400">
                  {formatBytes(type.size)} ({type.percent.toFixed(1)}%)
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Largest files */}
      <div className="bg-zinc-800/50 rounded-2xl p-5">
        <h3 className="font-semibold mb-4">Largest Files</h3>
        <div className="space-y-2">
          {stats.largestFiles.map((file, i) => (
            <div
              key={file.id}
              className="flex items-center gap-3 p-2 rounded-lg hover:bg-zinc-800 cursor-pointer transition"
              onClick={() => onSelectMedia?.(file.id)}
            >
              <span className="text-xs text-zinc-500 w-4">{i + 1}</span>
              <span className="flex-1 text-sm truncate">{file.filename}</span>
              <span className="text-sm font-medium text-[var(--primary)]">{formatBytes(file.size)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// Content Tab
function ContentTab({
  durationStats,
  qualityStats
}: {
  durationStats: DurationStats
  qualityStats: DashboardStats['quality']
}) {
  const durationBuckets = useMemo(() => [
    { label: '<1m', value: durationStats.durationBuckets.under1min, color: 'bg-blue-500' },
    { label: '1-5m', value: durationStats.durationBuckets.oneToFive, color: 'bg-cyan-500' },
    { label: '5-15m', value: durationStats.durationBuckets.fiveToFifteen, color: 'bg-green-500' },
    { label: '15-30m', value: durationStats.durationBuckets.fifteenToThirty, color: 'bg-amber-500' },
    { label: '30-60m', value: durationStats.durationBuckets.thirtyToSixty, color: 'bg-orange-500' },
    { label: '>1h', value: durationStats.durationBuckets.overHour, color: 'bg-red-500' }
  ], [durationStats])

  const maxDurationBucket = Math.max(...durationBuckets.map(b => b.value)) || 1

  const qualityBuckets = useMemo(() => [
    { label: '4K', value: qualityStats.uhd4k, color: 'bg-purple-500' },
    { label: '1080p', value: qualityStats.hd1080p, color: 'bg-blue-500' },
    { label: '720p', value: qualityStats.hd720p, color: 'bg-green-500' },
    { label: '480p', value: qualityStats.sd480p, color: 'bg-amber-500' },
    { label: 'SD', value: qualityStats.sdLow, color: 'bg-red-500' }
  ], [qualityStats])

  const maxQualityBucket = Math.max(...qualityBuckets.map(b => b.value)) || 1

  return (
    <div className="space-y-6">
      {/* Duration stats */}
      <div className="grid grid-cols-3 gap-4">
        <StatCard
          icon={Clock}
          label="Average Duration"
          value={formatDuration(durationStats.avgDuration)}
          color="blue"
        />
        <StatCard
          icon={Clock}
          label="Median Duration"
          value={formatDuration(durationStats.medianDuration)}
          color="purple"
        />
        <StatCard
          icon={Clock}
          label="Total Playtime"
          value={formatDuration(durationStats.totalPlaytime)}
          color="green"
        />
      </div>

      {/* Duration distribution */}
      <div className="bg-zinc-800/50 rounded-2xl p-5">
        <h3 className="font-semibold mb-4">Duration Distribution</h3>
        <div className="flex items-end gap-2 h-32">
          {durationBuckets.map(bucket => (
            <div key={bucket.label} className="flex-1 flex flex-col items-center gap-2">
              <div
                className={`w-full ${bucket.color} rounded-t transition-all`}
                style={{ height: `${(bucket.value / maxDurationBucket) * 100}%`, minHeight: bucket.value > 0 ? '4px' : '0' }}
              />
              <div className="text-xs text-zinc-400">{bucket.label}</div>
              <div className="text-xs font-medium">{bucket.value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Quality distribution */}
      <div className="bg-zinc-800/50 rounded-2xl p-5">
        <h3 className="font-semibold mb-4">Video Quality</h3>
        <div className="flex items-end gap-2 h-32">
          {qualityBuckets.map(bucket => (
            <div key={bucket.label} className="flex-1 flex flex-col items-center gap-2">
              <div
                className={`w-full ${bucket.color} rounded-t transition-all`}
                style={{ height: `${(bucket.value / maxQualityBucket) * 100}%`, minHeight: bucket.value > 0 ? '4px' : '0' }}
              />
              <div className="text-xs text-zinc-400">{bucket.label}</div>
              <div className="text-xs font-medium">{bucket.value}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// Tags Tab
function TagsTab({
  stats,
  onNavigateToTag
}: {
  stats: TagStats
  onNavigateToTag?: (tag: string) => void
}) {
  const maxTagCount = Math.max(...stats.tagCloud.map(t => t.count)) || 1

  return (
    <div className="space-y-6">
      {/* Tag stats */}
      <div className="grid grid-cols-4 gap-4">
        <StatCard icon={Tag} label="Total Tags" value={stats.totalTags.toString()} color="blue" />
        <StatCard icon={CheckCircle} label="Used Tags" value={stats.usedTags.toString()} color="green" />
        <StatCard icon={AlertTriangle} label="Untagged Media" value={stats.untaggedMedia.toString()} color="amber" />
        <StatCard icon={Sparkles} label="Avg per Media" value={stats.avgTagsPerMedia.toFixed(1)} color="purple" />
      </div>

      {/* Tag cloud */}
      <div className="bg-zinc-800/50 rounded-2xl p-5">
        <h3 className="font-semibold mb-4">Tag Cloud</h3>
        <div className="flex flex-wrap gap-2">
          {stats.tagCloud.slice(0, 50).map(tag => {
            const size = 0.7 + (tag.count / maxTagCount) * 0.8
            return (
              <button
                key={tag.name}
                onClick={() => onNavigateToTag?.(tag.name)}
                className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 rounded-full transition"
                style={{ fontSize: `${size}rem` }}
              >
                {tag.name}
                <span className="ml-1 text-xs text-zinc-500">({tag.count})</span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// Activity Tab
function ActivityTab({
  dashboardStats,
  growthStats,
  onSelectMedia
}: {
  dashboardStats: DashboardStats
  growthStats: GrowthStats
  onSelectMedia?: (id: string) => void
}) {
  const maxMonthly = Math.max(...growthStats.monthlyGrowth.map(m => m.added)) || 1

  return (
    <div className="space-y-6">
      {/* Growth chart */}
      <div className="bg-zinc-800/50 rounded-2xl p-5">
        <h3 className="font-semibold mb-4 flex items-center gap-2">
          <TrendingUp size={18} className="text-[var(--primary)]" />
          Library Growth
        </h3>
        <div className="flex items-end gap-1 h-32">
          {growthStats.monthlyGrowth.slice(-12).map((month, i) => (
            <div key={month.month} className="flex-1 flex flex-col items-center gap-1">
              <div
                className="w-full bg-[var(--primary)] rounded-t transition-all"
                style={{ height: `${(month.added / maxMonthly) * 100}%`, minHeight: month.added > 0 ? '4px' : '0' }}
                title={`${month.month}: ${month.added} added`}
              />
              {i % 2 === 0 && (
                <div className="text-[10px] text-zinc-500">{month.month.slice(-2)}</div>
              )}
            </div>
          ))}
        </div>
        <div className="mt-4 text-center text-sm text-zinc-400">
          Average: {growthStats.avgDailyAdditions.toFixed(1)} items/day
        </div>
      </div>

      {/* Recently added */}
      <div className="bg-zinc-800/50 rounded-2xl p-5">
        <h3 className="font-semibold mb-4 flex items-center gap-2">
          <Calendar size={18} className="text-[var(--primary)]" />
          Recently Added
        </h3>
        <div className="space-y-2">
          {dashboardStats.recentlyAdded.slice(0, 6).map(item => (
            <MediaRow
              key={item.id}
              item={item}
              onClick={() => onSelectMedia?.(item.id)}
              statLabel={new Date(item.addedAt).toLocaleDateString()}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

// Stat card component
function StatCard({
  icon: Icon,
  label,
  value,
  suffix,
  color
}: {
  icon: React.ElementType
  label: string
  value: string
  suffix?: string
  color: 'blue' | 'purple' | 'green' | 'amber' | 'red'
}) {
  const colors = {
    blue: 'bg-blue-500/20 text-blue-400',
    purple: 'bg-purple-500/20 text-purple-400',
    green: 'bg-emerald-500/20 text-emerald-400',
    amber: 'bg-amber-500/20 text-amber-400',
    red: 'bg-red-500/20 text-red-400'
  }

  return (
    <div className="bg-zinc-800/50 rounded-xl p-4">
      <div className={`w-10 h-10 rounded-lg ${colors[color]} flex items-center justify-center mb-3`}>
        <Icon size={20} />
      </div>
      <div className="text-2xl font-bold">
        {value}
        {suffix && <span className="text-sm text-zinc-400 ml-1">{suffix}</span>}
      </div>
      <div className="text-sm text-zinc-400">{label}</div>
    </div>
  )
}

// Media row component
function MediaRow({
  item,
  rank,
  onClick,
  statLabel
}: {
  item: { id: string; filename: string; thumbPath?: string }
  rank?: number
  onClick?: () => void
  statLabel: string
}) {
  const [thumbUrl, setThumbUrl] = useState('')

  useEffect(() => {
    if (item.thumbPath) {
      toFileUrlCached(item.thumbPath).then(setThumbUrl).catch(() => {})
    }
  }, [item.thumbPath])

  return (
    <div
      className="flex items-center gap-3 p-2 rounded-lg hover:bg-zinc-800 cursor-pointer transition"
      onClick={onClick}
    >
      {rank && <span className="text-xs text-zinc-500 w-4">{rank}</span>}
      <div className="w-12 h-8 bg-zinc-800 rounded overflow-hidden flex-shrink-0">
        {thumbUrl ? (
          <img src={thumbUrl} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-zinc-600">
            <Film size={14} />
          </div>
        )}
      </div>
      <span className="flex-1 text-sm truncate">{item.filename}</span>
      <span className="text-xs text-zinc-400">{statLabel}</span>
      <ChevronRight size={14} className="text-zinc-600" />
    </div>
  )
}

export default StatsDashboard
