// File: src/main/services/advanced-stats.ts
// Advanced statistics and analytics for the library

import type { DB } from '../db'

export interface TimeRangeStats {
  period: string
  mediaAdded: number
  mediaViewed: number
  totalWatchTime: number
  avgSessionLength: number
  peakHour: number
  topTags: Array<{ name: string; count: number }>
}

export interface StorageStats {
  totalSize: number
  videoSize: number
  imageSize: number
  gifSize: number
  cacheSize: number
  thumbsSize: number
  transcodesSize: number
  largestFiles: Array<{ id: string; filename: string; size: number }>
}

export interface QualityBreakdown {
  uhd4k: number
  hd1080p: number
  hd720p: number
  sd480p: number
  sdLow: number
  unknown: number
  avgBitrate: number
  hdrContent: number
}

export interface DurationStats {
  avgDuration: number
  medianDuration: number
  shortestVideo: { id: string; filename: string; duration: number } | null
  longestVideo: { id: string; filename: string; duration: number } | null
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

export interface TagStats {
  totalTags: number
  usedTags: number
  unusedTags: number
  avgTagsPerMedia: number
  mostTagged: { id: string; filename: string; tagCount: number } | null
  untaggedMedia: number
  tagCloud: Array<{ name: string; count: number; category?: string }>
}

export interface ActivityStats {
  totalSessions: number
  totalWatchTime: number
  avgSessionLength: number
  longestSession: number
  currentStreak: number
  longestStreak: number
  viewsByDayOfWeek: number[]
  viewsByHour: number[]
  mostViewedMedia: Array<{ id: string; filename: string; views: number; thumbPath?: string }>
  recentActivity: Array<{ date: string; views: number; watchTime: number }>
}

export interface GrowthStats {
  monthlyGrowth: Array<{
    month: string
    added: number
    cumulative: number
  }>
  weeklyGrowth: Array<{
    week: string
    added: number
  }>
  avgDailyAdditions: number
  totalDaysActive: number
}

export interface LibraryHealth {
  score: number // 0-100
  issues: Array<{
    type: 'missing_thumbs' | 'missing_files' | 'duplicates' | 'untagged' | 'broken_refs'
    count: number
    severity: 'low' | 'medium' | 'high'
    description: string
  }>
  recommendations: string[]
}

export class AdvancedStatsService {
  constructor(private db: DB) {}

  /**
   * Get storage breakdown statistics
   */
  getStorageStats(): StorageStats {
    // Get sizes by type
    const sizeByType = this.db.raw.prepare(`
      SELECT type, SUM(size) as totalSize
      FROM media
      GROUP BY type
    `).all() as Array<{ type: string; totalSize: number }>

    let videoSize = 0, imageSize = 0, gifSize = 0
    for (const row of sizeByType) {
      if (row.type === 'video') videoSize = row.totalSize
      else if (row.type === 'image') imageSize = row.totalSize
      else if (row.type === 'gif') gifSize = row.totalSize
    }

    const totalSize = videoSize + imageSize + gifSize

    // Get largest files
    const largestFiles = this.db.raw.prepare(`
      SELECT id, filename, size
      FROM media
      ORDER BY size DESC
      LIMIT 10
    `).all() as Array<{ id: string; filename: string; size: number }>

    return {
      totalSize,
      videoSize,
      imageSize,
      gifSize,
      cacheSize: 0, // Would need file system scan
      thumbsSize: 0,
      transcodesSize: 0,
      largestFiles
    }
  }

  /**
   * Get video quality breakdown
   */
  getQualityBreakdown(): QualityBreakdown {
    const rows = this.db.raw.prepare(`
      SELECT height, width FROM media WHERE type = 'video'
    `).all() as Array<{ height: number | null; width: number | null }>

    let uhd4k = 0, hd1080p = 0, hd720p = 0, sd480p = 0, sdLow = 0, unknown = 0

    for (const row of rows) {
      const h = row.height || 0
      if (h === 0) unknown++
      else if (h >= 2160) uhd4k++
      else if (h >= 1080) hd1080p++
      else if (h >= 720) hd720p++
      else if (h >= 480) sd480p++
      else sdLow++
    }

    return {
      uhd4k,
      hd1080p,
      hd720p,
      sd480p,
      sdLow,
      unknown,
      avgBitrate: 0, // Would need more data
      hdrContent: 0
    }
  }

  /**
   * Get duration statistics for videos
   */
  getDurationStats(): DurationStats {
    // Get all durations
    const durations = this.db.raw.prepare(`
      SELECT id, filename, durationSec
      FROM media
      WHERE type = 'video' AND durationSec > 0
      ORDER BY durationSec
    `).all() as Array<{ id: string; filename: string; durationSec: number }>

    if (durations.length === 0) {
      return {
        avgDuration: 0,
        medianDuration: 0,
        shortestVideo: null,
        longestVideo: null,
        totalPlaytime: 0,
        durationBuckets: {
          under1min: 0,
          oneToFive: 0,
          fiveToFifteen: 0,
          fifteenToThirty: 0,
          thirtyToSixty: 0,
          overHour: 0
        }
      }
    }

    const total = durations.reduce((sum, d) => sum + d.durationSec, 0)
    const avg = total / durations.length
    const medianIdx = Math.floor(durations.length / 2)
    const median = durations[medianIdx].durationSec

    // Duration buckets
    const buckets = {
      under1min: 0,
      oneToFive: 0,
      fiveToFifteen: 0,
      fifteenToThirty: 0,
      thirtyToSixty: 0,
      overHour: 0
    }

    for (const d of durations) {
      const mins = d.durationSec / 60
      if (mins < 1) buckets.under1min++
      else if (mins < 5) buckets.oneToFive++
      else if (mins < 15) buckets.fiveToFifteen++
      else if (mins < 30) buckets.fifteenToThirty++
      else if (mins < 60) buckets.thirtyToSixty++
      else buckets.overHour++
    }

    return {
      avgDuration: avg,
      medianDuration: median,
      shortestVideo: durations[0],
      longestVideo: durations[durations.length - 1],
      totalPlaytime: total,
      durationBuckets: buckets
    }
  }

  /**
   * Get tag statistics
   */
  getTagStats(): TagStats {
    // Total tags
    const totalRow = this.db.raw.prepare('SELECT COUNT(*) as count FROM tags').get() as { count: number }
    const totalTags = totalRow.count

    // Used tags
    const usedRow = this.db.raw.prepare(`
      SELECT COUNT(DISTINCT tagId) as count FROM media_tags
    `).get() as { count: number }
    const usedTags = usedRow.count

    // Avg tags per media
    const avgRow = this.db.raw.prepare(`
      SELECT AVG(tagCount) as avg FROM (
        SELECT COUNT(*) as tagCount FROM media_tags GROUP BY mediaId
      )
    `).get() as { avg: number | null }
    const avgTagsPerMedia = avgRow.avg || 0

    // Most tagged
    const mostTagged = this.db.raw.prepare(`
      SELECT m.id, m.filename, COUNT(mt.tagId) as tagCount
      FROM media m
      JOIN media_tags mt ON m.id = mt.mediaId
      GROUP BY m.id
      ORDER BY tagCount DESC
      LIMIT 1
    `).get() as { id: string; filename: string; tagCount: number } | undefined

    // Untagged media
    const untaggedRow = this.db.raw.prepare(`
      SELECT COUNT(*) as count FROM media m
      WHERE NOT EXISTS (SELECT 1 FROM media_tags mt WHERE mt.mediaId = m.id)
    `).get() as { count: number }

    // Tag cloud
    const tagCloud = this.db.raw.prepare(`
      SELECT t.name, COUNT(mt.mediaId) as count, t.category
      FROM tags t
      LEFT JOIN media_tags mt ON t.id = mt.tagId
      GROUP BY t.id
      ORDER BY count DESC
      LIMIT 100
    `).all() as Array<{ name: string; count: number; category?: string }>

    return {
      totalTags,
      usedTags,
      unusedTags: totalTags - usedTags,
      avgTagsPerMedia,
      mostTagged: mostTagged || null,
      untaggedMedia: untaggedRow.count,
      tagCloud
    }
  }

  /**
   * Get activity/viewing statistics
   */
  getActivityStats(): ActivityStats {
    // Views by day of week (0=Sunday)
    const viewsByDay = Array(7).fill(0)

    // Views by hour
    const viewsByHour = Array(24).fill(0)

    // Most viewed
    const mostViewed = this.db.raw.prepare(`
      SELECT m.id, m.filename, m.thumbPath, ms.viewCount as views
      FROM media m
      JOIN media_stats ms ON m.id = ms.mediaId
      WHERE ms.viewCount > 0
      ORDER BY ms.viewCount DESC
      LIMIT 10
    `).all() as Array<{ id: string; filename: string; thumbPath?: string; views: number }>

    // Recent activity (last 30 days) - simplified
    const recentActivity: Array<{ date: string; views: number; watchTime: number }> = []

    return {
      totalSessions: 0,
      totalWatchTime: 0,
      avgSessionLength: 0,
      longestSession: 0,
      currentStreak: 0,
      longestStreak: 0,
      viewsByDayOfWeek: viewsByDay,
      viewsByHour: viewsByHour,
      mostViewedMedia: mostViewed,
      recentActivity
    }
  }

  /**
   * Get library growth statistics
   */
  getGrowthStats(): GrowthStats {
    // Monthly growth
    const monthlyData = this.db.raw.prepare(`
      SELECT
        strftime('%Y-%m', addedAt / 1000, 'unixepoch') as month,
        COUNT(*) as added
      FROM media
      WHERE addedAt IS NOT NULL
      GROUP BY month
      ORDER BY month
    `).all() as Array<{ month: string; added: number }>

    let cumulative = 0
    const monthlyGrowth = monthlyData.map(row => {
      cumulative += row.added
      return {
        month: row.month,
        added: row.added,
        cumulative
      }
    })

    // Weekly growth (last 12 weeks)
    const weeklyData = this.db.raw.prepare(`
      SELECT
        strftime('%Y-W%W', addedAt / 1000, 'unixepoch') as week,
        COUNT(*) as added
      FROM media
      WHERE addedAt > ?
      GROUP BY week
      ORDER BY week
    `).all(Date.now() - 12 * 7 * 24 * 60 * 60 * 1000) as Array<{ week: string; added: number }>

    // Average daily additions
    const rangeRow = this.db.raw.prepare(`
      SELECT MIN(addedAt) as first, MAX(addedAt) as last, COUNT(*) as total
      FROM media
      WHERE addedAt IS NOT NULL
    `).get() as { first: number | null; last: number | null; total: number }

    let avgDailyAdditions = 0
    let totalDaysActive = 0

    if (rangeRow.first && rangeRow.last) {
      totalDaysActive = Math.ceil((rangeRow.last - rangeRow.first) / (24 * 60 * 60 * 1000)) || 1
      avgDailyAdditions = rangeRow.total / totalDaysActive
    }

    return {
      monthlyGrowth,
      weeklyGrowth: weeklyData,
      avgDailyAdditions,
      totalDaysActive
    }
  }

  /**
   * Get library health check
   */
  getLibraryHealth(): LibraryHealth {
    const issues: LibraryHealth['issues'] = []
    let score = 100

    // Check for missing thumbnails
    const missingThumbs = this.db.raw.prepare(`
      SELECT COUNT(*) as count FROM media
      WHERE thumbPath IS NULL OR thumbPath = ''
    `).get() as { count: number }

    if (missingThumbs.count > 0) {
      const severity = missingThumbs.count > 100 ? 'medium' : 'low'
      issues.push({
        type: 'missing_thumbs',
        count: missingThumbs.count,
        severity,
        description: `${missingThumbs.count} media items are missing thumbnails`
      })
      score -= severity === 'medium' ? 10 : 5
    }

    // Check for untagged media
    const untagged = this.db.raw.prepare(`
      SELECT COUNT(*) as count FROM media m
      WHERE NOT EXISTS (SELECT 1 FROM media_tags mt WHERE mt.mediaId = m.id)
    `).get() as { count: number }

    if (untagged.count > 0) {
      const total = this.db.raw.prepare('SELECT COUNT(*) as c FROM media').get() as { c: number }
      const untaggedPercent = (untagged.count / total.c) * 100

      if (untaggedPercent > 50) {
        issues.push({
          type: 'untagged',
          count: untagged.count,
          severity: 'medium',
          description: `${untagged.count} media items (${untaggedPercent.toFixed(0)}%) have no tags`
        })
        score -= 15
      } else if (untaggedPercent > 20) {
        issues.push({
          type: 'untagged',
          count: untagged.count,
          severity: 'low',
          description: `${untagged.count} media items (${untaggedPercent.toFixed(0)}%) have no tags`
        })
        score -= 5
      }
    }

    // Check for duplicates
    const duplicateGroups = this.db.raw.prepare(`
      SELECT COUNT(*) as count FROM (
        SELECT hashSha256 FROM media
        WHERE hashSha256 IS NOT NULL
        GROUP BY hashSha256
        HAVING COUNT(*) > 1
      )
    `).get() as { count: number }

    if (duplicateGroups.count > 0) {
      issues.push({
        type: 'duplicates',
        count: duplicateGroups.count,
        severity: duplicateGroups.count > 20 ? 'medium' : 'low',
        description: `${duplicateGroups.count} groups of duplicate files detected`
      })
      score -= duplicateGroups.count > 20 ? 10 : 5
    }

    // Generate recommendations
    const recommendations: string[] = []

    if (missingThumbs.count > 0) {
      recommendations.push('Generate missing thumbnails to improve browsing experience')
    }
    if (untagged.count > 10) {
      recommendations.push('Tag your media for better organization and searchability')
    }
    if (duplicateGroups.count > 0) {
      recommendations.push('Review and remove duplicate files to free up storage')
    }
    if (issues.length === 0) {
      recommendations.push('Your library is in great shape! Consider backing up regularly.')
    }

    return {
      score: Math.max(0, score),
      issues,
      recommendations
    }
  }

  /**
   * Get comprehensive dashboard stats
   */
  getDashboardStats(): {
    overview: {
      totalMedia: number
      totalSize: number
      totalDuration: number
      avgRating: number
    }
    quality: QualityBreakdown
    topTags: Array<{ name: string; count: number }>
    recentlyAdded: Array<{ id: string; filename: string; addedAt: number; thumbPath?: string }>
    mostViewed: Array<{ id: string; filename: string; views: number; thumbPath?: string }>
    health: LibraryHealth
  } {
    // Overview
    const overview = this.db.raw.prepare(`
      SELECT
        COUNT(*) as totalMedia,
        COALESCE(SUM(size), 0) as totalSize,
        COALESCE(SUM(CASE WHEN type = 'video' THEN durationSec ELSE 0 END), 0) as totalDuration
      FROM media
    `).get() as { totalMedia: number; totalSize: number; totalDuration: number }

    const ratingRow = this.db.raw.prepare(`
      SELECT AVG(rating) as avg FROM media_stats WHERE rating > 0
    `).get() as { avg: number | null }

    // Top tags
    const topTags = this.db.raw.prepare(`
      SELECT t.name, COUNT(mt.mediaId) as count
      FROM tags t
      JOIN media_tags mt ON t.id = mt.tagId
      GROUP BY t.id
      ORDER BY count DESC
      LIMIT 10
    `).all() as Array<{ name: string; count: number }>

    // Recently added
    const recentlyAdded = this.db.raw.prepare(`
      SELECT id, filename, addedAt, thumbPath
      FROM media
      ORDER BY addedAt DESC
      LIMIT 10
    `).all() as Array<{ id: string; filename: string; addedAt: number; thumbPath?: string }>

    // Most viewed
    const mostViewed = this.db.raw.prepare(`
      SELECT m.id, m.filename, m.thumbPath, ms.viewCount as views
      FROM media m
      JOIN media_stats ms ON m.id = ms.mediaId
      WHERE ms.viewCount > 0
      ORDER BY ms.viewCount DESC
      LIMIT 10
    `).all() as Array<{ id: string; filename: string; thumbPath?: string; views: number }>

    return {
      overview: {
        ...overview,
        avgRating: ratingRow.avg || 0
      },
      quality: this.getQualityBreakdown(),
      topTags,
      recentlyAdded,
      mostViewed,
      health: this.getLibraryHealth()
    }
  }

  /**
   * Get time-based statistics
   */
  getTimeRangeStats(startDate: number, endDate: number): TimeRangeStats {
    const added = this.db.raw.prepare(`
      SELECT COUNT(*) as count FROM media
      WHERE addedAt >= ? AND addedAt <= ?
    `).get(startDate, endDate) as { count: number }

    const topTags = this.db.raw.prepare(`
      SELECT t.name, COUNT(mt.mediaId) as count
      FROM tags t
      JOIN media_tags mt ON t.id = mt.tagId
      JOIN media m ON mt.mediaId = m.id
      WHERE m.addedAt >= ? AND m.addedAt <= ?
      GROUP BY t.id
      ORDER BY count DESC
      LIMIT 5
    `).all(startDate, endDate) as Array<{ name: string; count: number }>

    return {
      period: `${new Date(startDate).toLocaleDateString()} - ${new Date(endDate).toLocaleDateString()}`,
      mediaAdded: added.count,
      mediaViewed: 0,
      totalWatchTime: 0,
      avgSessionLength: 0,
      peakHour: 0,
      topTags
    }
  }
}

// Singleton
let instance: AdvancedStatsService | null = null

export function getAdvancedStatsService(db: DB): AdvancedStatsService {
  if (!instance) {
    instance = new AdvancedStatsService(db)
  }
  return instance
}
