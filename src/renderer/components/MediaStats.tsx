// File: src/renderer/components/MediaStats.tsx
// Analytics dashboard component for media library statistics

import React, { useState, useEffect, useMemo } from 'react'
import {
  BarChart3,
  PieChart,
  TrendingUp,
  Clock,
  Film,
  Image,
  Star,
  Heart,
  Eye,
  Calendar,
  HardDrive,
  Tag,
  Folder,
  Users,
  Activity,
  ArrowUp,
  ArrowDown,
  Minus
} from 'lucide-react'
import { formatDuration, formatFileSize } from '../utils/formatters'

interface LibraryStats {
  totalItems: number
  totalVideos: number
  totalImages: number
  totalDuration: number
  totalSize: number
  totalFavorites: number
  totalRated: number
  averageRating: number
  totalViews: number
  totalTags: number
  totalPlaylists: number
}

interface TimeStats {
  totalWatchTime: number
  averageSessionDuration: number
  longestSession: number
  totalSessions: number
  peakHour: number
  peakDay: string
}

interface TrendData {
  date: string
  value: number
}

interface TopItem {
  id: string
  name: string
  thumbnail?: string
  type: 'video' | 'image'
  value: number
}

interface MediaStatsProps {
  libraryStats: LibraryStats
  timeStats: TimeStats
  viewTrends: TrendData[]
  topViewed: TopItem[]
  topRated: TopItem[]
  recentlyAdded: TopItem[]
  tagDistribution: Array<{ tag: string; count: number }>
  className?: string
}

export function MediaStats({
  libraryStats,
  timeStats,
  viewTrends,
  topViewed,
  topRated,
  recentlyAdded,
  tagDistribution,
  className = ''
}: MediaStatsProps) {
  const [activeTab, setActiveTab] = useState<'overview' | 'activity' | 'content'>('overview')
  const [timeRange, setTimeRange] = useState<'week' | 'month' | 'year' | 'all'>('month')

  // Calculate trend direction
  const getTrend = (data: TrendData[]) => {
    if (data.length < 2) return { direction: 'stable' as const, percent: 0 }
    const recent = data.slice(-7).reduce((acc, d) => acc + d.value, 0)
    const previous = data.slice(-14, -7).reduce((acc, d) => acc + d.value, 0)
    if (previous === 0) return { direction: 'up' as const, percent: 100 }
    const change = ((recent - previous) / previous) * 100
    return {
      direction: change > 5 ? 'up' as const : change < -5 ? 'down' as const : 'stable' as const,
      percent: Math.abs(Math.round(change))
    }
  }

  const viewTrend = getTrend(viewTrends)

  // Format peak hour
  const formatHour = (hour: number) => {
    const ampm = hour >= 12 ? 'PM' : 'AM'
    const h = hour % 12 || 12
    return `${h}:00 ${ampm}`
  }

  // Max value for bar chart
  const maxTrendValue = Math.max(...viewTrends.map(t => t.value), 1)

  return (
    <div className={`bg-zinc-900/95 backdrop-blur-xl rounded-2xl border border-zinc-700 shadow-2xl overflow-hidden ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[var(--primary)]/20 flex items-center justify-center">
            <BarChart3 size={20} className="text-[var(--primary)]" />
          </div>
          <div>
            <h2 className="font-semibold">Library Statistics</h2>
            <p className="text-xs text-zinc-500">{libraryStats.totalItems.toLocaleString()} items</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <select
            value={timeRange}
            onChange={(e) => setTimeRange(e.target.value as any)}
            className="bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1 text-sm"
          >
            <option value="week">Last Week</option>
            <option value="month">Last Month</option>
            <option value="year">Last Year</option>
            <option value="all">All Time</option>
          </select>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-zinc-800">
        {(['overview', 'activity', 'content'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 py-3 text-sm font-medium transition ${
              activeTab === tab
                ? 'border-b-2 border-[var(--primary)] text-white'
                : 'text-zinc-500 hover:text-white'
            }`}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      <div className="p-5">
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {/* Quick stats grid */}
            <div className="grid grid-cols-4 gap-3">
              <StatCard
                icon={Film}
                label="Videos"
                value={libraryStats.totalVideos.toLocaleString()}
                subValue={formatDuration(libraryStats.totalDuration)}
                color="text-blue-400"
              />
              <StatCard
                icon={Image}
                label="Images"
                value={libraryStats.totalImages.toLocaleString()}
                color="text-green-400"
              />
              <StatCard
                icon={Heart}
                label="Favorites"
                value={libraryStats.totalFavorites.toLocaleString()}
                color="text-red-400"
              />
              <StatCard
                icon={HardDrive}
                label="Total Size"
                value={formatFileSize(libraryStats.totalSize)}
                color="text-purple-400"
              />
            </div>

            {/* Activity chart */}
            <div className="bg-zinc-800/50 rounded-xl p-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-medium">Viewing Activity</h3>
                <div className="flex items-center gap-1">
                  {viewTrend.direction === 'up' && <ArrowUp size={14} className="text-green-400" />}
                  {viewTrend.direction === 'down' && <ArrowDown size={14} className="text-red-400" />}
                  {viewTrend.direction === 'stable' && <Minus size={14} className="text-zinc-500" />}
                  <span className={`text-xs ${
                    viewTrend.direction === 'up' ? 'text-green-400' :
                    viewTrend.direction === 'down' ? 'text-red-400' : 'text-zinc-500'
                  }`}>
                    {viewTrend.percent}%
                  </span>
                </div>
              </div>

              {/* Mini bar chart */}
              <div className="flex items-end gap-1 h-20">
                {viewTrends.slice(-14).map((trend, i) => (
                  <div
                    key={i}
                    className="flex-1 bg-[var(--primary)]/30 rounded-t hover:bg-[var(--primary)]/50 transition"
                    style={{ height: `${(trend.value / maxTrendValue) * 100}%`, minHeight: '4px' }}
                    title={`${trend.date}: ${trend.value} views`}
                  />
                ))}
              </div>
              <div className="flex justify-between mt-2 text-[10px] text-zinc-600">
                <span>{viewTrends[viewTrends.length - 14]?.date || ''}</span>
                <span>{viewTrends[viewTrends.length - 1]?.date || ''}</span>
              </div>
            </div>

            {/* Rating distribution */}
            <div className="bg-zinc-800/50 rounded-xl p-4">
              <h3 className="text-sm font-medium mb-3">Ratings Overview</h3>
              <div className="flex items-center gap-4">
                <div className="text-center">
                  <div className="text-3xl font-bold text-[var(--primary)]">
                    {libraryStats.averageRating.toFixed(1)}
                  </div>
                  <div className="text-xs text-zinc-500">Average</div>
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-1 mb-1">
                    {[1, 2, 3, 4, 5].map(star => (
                      <Star
                        key={star}
                        size={16}
                        className={star <= Math.round(libraryStats.averageRating)
                          ? 'text-yellow-400 fill-yellow-400'
                          : 'text-zinc-600'
                        }
                      />
                    ))}
                  </div>
                  <div className="text-xs text-zinc-500">
                    {libraryStats.totalRated} rated out of {libraryStats.totalItems}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'activity' && (
          <div className="space-y-6">
            {/* Time stats */}
            <div className="grid grid-cols-3 gap-3">
              <StatCard
                icon={Clock}
                label="Watch Time"
                value={formatDuration(timeStats.totalWatchTime)}
                color="text-cyan-400"
              />
              <StatCard
                icon={Activity}
                label="Sessions"
                value={timeStats.totalSessions.toLocaleString()}
                subValue={`Avg: ${formatDuration(timeStats.averageSessionDuration)}`}
                color="text-orange-400"
              />
              <StatCard
                icon={TrendingUp}
                label="Longest"
                value={formatDuration(timeStats.longestSession)}
                color="text-pink-400"
              />
            </div>

            {/* Peak activity */}
            <div className="bg-zinc-800/50 rounded-xl p-4">
              <h3 className="text-sm font-medium mb-3">Peak Activity</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-xs text-zinc-500 mb-1">Most Active Hour</div>
                  <div className="text-lg font-semibold">{formatHour(timeStats.peakHour)}</div>
                </div>
                <div>
                  <div className="text-xs text-zinc-500 mb-1">Most Active Day</div>
                  <div className="text-lg font-semibold">{timeStats.peakDay}</div>
                </div>
              </div>
            </div>

            {/* Top viewed */}
            <div className="bg-zinc-800/50 rounded-xl p-4">
              <h3 className="text-sm font-medium mb-3">Most Viewed</h3>
              <div className="space-y-2">
                {topViewed.slice(0, 5).map((item, i) => (
                  <div key={item.id} className="flex items-center gap-3">
                    <span className="w-5 text-center text-xs text-zinc-500">{i + 1}</span>
                    <div className="w-8 h-8 rounded bg-zinc-700 overflow-hidden flex-shrink-0">
                      {item.thumbnail ? (
                        <img src={item.thumbnail} alt="" className="w-full h-full object-cover" />
                      ) : item.type === 'video' ? (
                        <Film size={14} className="w-full h-full p-2 text-zinc-500" />
                      ) : (
                        <Image size={14} className="w-full h-full p-2 text-zinc-500" />
                      )}
                    </div>
                    <span className="flex-1 text-sm truncate">{item.name}</span>
                    <span className="text-xs text-zinc-500">{item.value} views</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'content' && (
          <div className="space-y-6">
            {/* Tag distribution */}
            <div className="bg-zinc-800/50 rounded-xl p-4">
              <h3 className="text-sm font-medium mb-3">Popular Tags</h3>
              <div className="flex flex-wrap gap-2">
                {tagDistribution.slice(0, 10).map(({ tag, count }) => (
                  <span
                    key={tag}
                    className="px-2 py-1 rounded-full bg-zinc-700 text-xs"
                    style={{
                      opacity: 0.5 + (count / tagDistribution[0].count) * 0.5
                    }}
                  >
                    {tag} <span className="text-zinc-500">({count})</span>
                  </span>
                ))}
              </div>
            </div>

            {/* Top rated */}
            <div className="bg-zinc-800/50 rounded-xl p-4">
              <h3 className="text-sm font-medium mb-3">Top Rated</h3>
              <div className="space-y-2">
                {topRated.slice(0, 5).map((item, i) => (
                  <div key={item.id} className="flex items-center gap-3">
                    <span className="w-5 text-center text-xs text-zinc-500">{i + 1}</span>
                    <div className="w-8 h-8 rounded bg-zinc-700 overflow-hidden flex-shrink-0">
                      {item.thumbnail ? (
                        <img src={item.thumbnail} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <Star size={14} className="w-full h-full p-2 text-zinc-500" />
                      )}
                    </div>
                    <span className="flex-1 text-sm truncate">{item.name}</span>
                    <div className="flex items-center gap-0.5">
                      <Star size={12} className="text-yellow-400 fill-yellow-400" />
                      <span className="text-xs">{item.value}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Recently added */}
            <div className="bg-zinc-800/50 rounded-xl p-4">
              <h3 className="text-sm font-medium mb-3">Recently Added</h3>
              <div className="grid grid-cols-5 gap-2">
                {recentlyAdded.slice(0, 5).map(item => (
                  <div key={item.id} className="aspect-square rounded-lg bg-zinc-700 overflow-hidden">
                    {item.thumbnail ? (
                      <img src={item.thumbnail} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        {item.type === 'video' ? <Film size={16} /> : <Image size={16} />}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// Stat card component
function StatCard({
  icon: Icon,
  label,
  value,
  subValue,
  color
}: {
  icon: React.ElementType
  label: string
  value: string
  subValue?: string
  color: string
}) {
  return (
    <div className="bg-zinc-800/50 rounded-xl p-3">
      <div className="flex items-center gap-2 mb-2">
        <Icon size={14} className={color} />
        <span className="text-xs text-zinc-500">{label}</span>
      </div>
      <div className="text-lg font-semibold">{value}</div>
      {subValue && <div className="text-[10px] text-zinc-600 mt-0.5">{subValue}</div>}
    </div>
  )
}

// Mini stats bar for header
export function QuickStats({
  stats,
  className = ''
}: {
  stats: Partial<LibraryStats>
  className?: string
}) {
  return (
    <div className={`flex items-center gap-4 ${className}`}>
      {stats.totalItems !== undefined && (
        <span className="flex items-center gap-1 text-xs text-zinc-500">
          <Film size={12} />
          {stats.totalItems.toLocaleString()}
        </span>
      )}
      {stats.totalFavorites !== undefined && (
        <span className="flex items-center gap-1 text-xs text-zinc-500">
          <Heart size={12} />
          {stats.totalFavorites}
        </span>
      )}
      {stats.totalSize !== undefined && (
        <span className="flex items-center gap-1 text-xs text-zinc-500">
          <HardDrive size={12} />
          {formatFileSize(stats.totalSize)}
        </span>
      )}
    </div>
  )
}

export default MediaStats
