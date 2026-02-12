// File: src/main/services/watch-history.ts
// Watch history tracking and content recommendations

import type { DB } from '../db'
import { nanoid } from 'nanoid'

export interface WatchSession {
  id: string
  mediaId: string
  startedAt: number
  endedAt: number | null
  watchedSeconds: number
  completionPercent: number
  resumePosition: number
}

export interface WatchStats {
  totalWatchTime: number      // Total seconds watched all time
  todayWatchTime: number      // Seconds watched today
  weekWatchTime: number       // Seconds watched this week
  avgSessionLength: number    // Average session length in seconds
  longestSession: number      // Longest single session
  totalSessions: number       // Total watch sessions
  uniqueVideosWatched: number // Unique videos watched
  favoriteTimeOfDay: string   // Most common time to watch
  mostWatchedTags: Array<{ tag: string; count: number }>
}

export interface RecommendedMedia {
  id: string
  reason: string
  score: number
  metadata?: any
}

export class WatchHistoryService {
  private activeSessions: Map<string, WatchSession> = new Map()

  constructor(private db: DB) {
    this.ensureTable()
  }

  private ensureTable(): void {
    this.db.raw.exec(`
      CREATE TABLE IF NOT EXISTS watch_sessions (
        id TEXT PRIMARY KEY,
        mediaId TEXT NOT NULL,
        startedAt REAL NOT NULL,
        endedAt REAL,
        watchedSeconds REAL NOT NULL DEFAULT 0,
        completionPercent REAL NOT NULL DEFAULT 0,
        resumePosition REAL NOT NULL DEFAULT 0
      );

      CREATE INDEX IF NOT EXISTS idx_watch_sessions_media ON watch_sessions(mediaId);
      CREATE INDEX IF NOT EXISTS idx_watch_sessions_started ON watch_sessions(startedAt DESC);
    `)
  }

  /**
   * Start a new watch session
   */
  startSession(mediaId: string): string {
    const id = nanoid()
    const session: WatchSession = {
      id,
      mediaId,
      startedAt: Date.now(),
      endedAt: null,
      watchedSeconds: 0,
      completionPercent: 0,
      resumePosition: 0
    }

    this.activeSessions.set(mediaId, session)

    this.db.raw.prepare(`
      INSERT INTO watch_sessions (id, mediaId, startedAt, watchedSeconds, completionPercent, resumePosition)
      VALUES (?, ?, ?, 0, 0, 0)
    `).run(id, mediaId, session.startedAt)

    return id
  }

  /**
   * Update an active session with progress
   */
  updateSession(mediaId: string, currentTime: number, duration: number): void {
    const session = this.activeSessions.get(mediaId)
    if (!session) return

    session.watchedSeconds = currentTime
    session.completionPercent = duration > 0 ? (currentTime / duration) * 100 : 0
    session.resumePosition = currentTime

    // Update database periodically (every 10 seconds of watching)
    if (Math.floor(currentTime) % 10 === 0) {
      this.db.raw.prepare(`
        UPDATE watch_sessions
        SET watchedSeconds = ?, completionPercent = ?, resumePosition = ?
        WHERE id = ?
      `).run(session.watchedSeconds, session.completionPercent, session.resumePosition, session.id)
    }
  }

  /**
   * End a watch session
   */
  endSession(mediaId: string): void {
    const session = this.activeSessions.get(mediaId)
    if (!session) return

    session.endedAt = Date.now()

    this.db.raw.prepare(`
      UPDATE watch_sessions
      SET endedAt = ?, watchedSeconds = ?, completionPercent = ?, resumePosition = ?
      WHERE id = ?
    `).run(session.endedAt, session.watchedSeconds, session.completionPercent, session.resumePosition, session.id)

    this.activeSessions.delete(mediaId)

    // Update media stats
    this.db.raw.prepare(`
      INSERT INTO media_stats (mediaId, views, lastViewedAt, rating, oCount, updatedAt)
      VALUES (?, 1, ?, 0, 0, ?)
      ON CONFLICT(mediaId) DO UPDATE SET
        views = views + 1,
        lastViewedAt = ?,
        updatedAt = ?
    `).run(mediaId, session.endedAt, session.endedAt, session.endedAt, session.endedAt)
  }

  /**
   * Get resume position for a media item
   */
  getResumePosition(mediaId: string): number {
    const row = this.db.raw.prepare(`
      SELECT resumePosition FROM watch_sessions
      WHERE mediaId = ? AND completionPercent < 90
      ORDER BY startedAt DESC LIMIT 1
    `).get(mediaId) as { resumePosition: number } | undefined

    return row?.resumePosition || 0
  }

  /**
   * Get recent watch history
   */
  getRecentHistory(limit = 50): Array<{ mediaId: string; watchedAt: number; duration: number }> {
    const rows = this.db.raw.prepare(`
      SELECT mediaId, MAX(startedAt) as watchedAt, SUM(watchedSeconds) as duration
      FROM watch_sessions
      GROUP BY mediaId
      ORDER BY watchedAt DESC
      LIMIT ?
    `).all(limit) as any[]

    return rows
  }

  /**
   * Get watch statistics
   */
  getStats(): WatchStats {
    const now = Date.now()
    const dayStart = now - (24 * 60 * 60 * 1000)
    const weekStart = now - (7 * 24 * 60 * 60 * 1000)

    // Total watch time
    const totalRow = this.db.raw.prepare(`
      SELECT SUM(watchedSeconds) as total FROM watch_sessions
    `).get() as { total: number | null }

    // Today's watch time
    const todayRow = this.db.raw.prepare(`
      SELECT SUM(watchedSeconds) as total FROM watch_sessions WHERE startedAt > ?
    `).get(dayStart) as { total: number | null }

    // Week's watch time
    const weekRow = this.db.raw.prepare(`
      SELECT SUM(watchedSeconds) as total FROM watch_sessions WHERE startedAt > ?
    `).get(weekStart) as { total: number | null }

    // Session stats
    const sessionStats = this.db.raw.prepare(`
      SELECT
        COUNT(*) as count,
        AVG(watchedSeconds) as avg,
        MAX(watchedSeconds) as max
      FROM watch_sessions WHERE endedAt IS NOT NULL
    `).get() as { count: number; avg: number | null; max: number | null }

    // Unique videos
    const uniqueRow = this.db.raw.prepare(`
      SELECT COUNT(DISTINCT mediaId) as count FROM watch_sessions
    `).get() as { count: number }

    // Favorite time of day
    const timeRows = this.db.raw.prepare(`
      SELECT
        CASE
          WHEN CAST(strftime('%H', datetime(startedAt/1000, 'unixepoch')) AS INTEGER) BETWEEN 6 AND 11 THEN 'morning'
          WHEN CAST(strftime('%H', datetime(startedAt/1000, 'unixepoch')) AS INTEGER) BETWEEN 12 AND 17 THEN 'afternoon'
          WHEN CAST(strftime('%H', datetime(startedAt/1000, 'unixepoch')) AS INTEGER) BETWEEN 18 AND 22 THEN 'evening'
          ELSE 'night'
        END as period,
        COUNT(*) as count
      FROM watch_sessions
      GROUP BY period
      ORDER BY count DESC
      LIMIT 1
    `).get() as { period: string; count: number } | undefined

    // Most watched tags
    const tagRows = this.db.raw.prepare(`
      SELECT t.name as tag, COUNT(*) as count
      FROM watch_sessions ws
      JOIN media_tags mt ON ws.mediaId = mt.mediaId
      JOIN tags t ON mt.tagId = t.id
      GROUP BY t.id
      ORDER BY count DESC
      LIMIT 10
    `).all() as Array<{ tag: string; count: number }>

    return {
      totalWatchTime: totalRow.total || 0,
      todayWatchTime: todayRow.total || 0,
      weekWatchTime: weekRow.total || 0,
      avgSessionLength: sessionStats.avg || 0,
      longestSession: sessionStats.max || 0,
      totalSessions: sessionStats.count || 0,
      uniqueVideosWatched: uniqueRow.count || 0,
      favoriteTimeOfDay: timeRows?.period || 'unknown',
      mostWatchedTags: tagRows
    }
  }

  /**
   * Get content recommendations based on watch history
   */
  getRecommendations(limit = 20): RecommendedMedia[] {
    const recommendations: RecommendedMedia[] = []

    // 1. More from watched tags (similar content)
    const tagBased = this.db.raw.prepare(`
      SELECT DISTINCT m.id, m.filename, COUNT(DISTINCT t.id) as tagMatches
      FROM media m
      JOIN media_tags mt ON m.id = mt.mediaId
      JOIN tags t ON mt.tagId = t.id
      WHERE t.id IN (
        SELECT DISTINCT t2.id FROM watch_sessions ws
        JOIN media_tags mt2 ON ws.mediaId = mt2.mediaId
        JOIN tags t2 ON mt2.tagId = t2.id
        ORDER BY ws.startedAt DESC
        LIMIT 50
      )
      AND m.id NOT IN (SELECT mediaId FROM watch_sessions)
      GROUP BY m.id
      ORDER BY tagMatches DESC
      LIMIT ?
    `).all(limit) as any[]

    for (const row of tagBased) {
      recommendations.push({
        id: row.id,
        reason: 'Similar to what you\'ve watched',
        score: 80 + row.tagMatches * 2
      })
    }

    // 2. Popular unwatched content
    const popular = this.db.raw.prepare(`
      SELECT m.id, m.filename, COALESCE(s.views, 0) as views, COALESCE(s.rating, 0) as rating
      FROM media m
      LEFT JOIN media_stats s ON m.id = s.mediaId
      WHERE m.id NOT IN (SELECT mediaId FROM watch_sessions)
      ORDER BY views DESC, rating DESC
      LIMIT ?
    `).all(Math.floor(limit / 2)) as any[]

    for (const row of popular) {
      recommendations.push({
        id: row.id,
        reason: 'Popular in your library',
        score: 60 + Math.min(row.views, 20) + row.rating * 5
      })
    }

    // 3. Recently added unwatched
    const recent = this.db.raw.prepare(`
      SELECT m.id, m.filename
      FROM media m
      WHERE m.id NOT IN (SELECT mediaId FROM watch_sessions)
      ORDER BY m.addedAt DESC
      LIMIT ?
    `).all(Math.floor(limit / 2)) as any[]

    for (const row of recent) {
      recommendations.push({
        id: row.id,
        reason: 'Recently added',
        score: 50
      })
    }

    // Sort by score and deduplicate
    const seen = new Set<string>()
    return recommendations
      .filter(r => {
        if (seen.has(r.id)) return false
        seen.add(r.id)
        return true
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
  }

  /**
   * Get "Continue Watching" list
   */
  getContinueWatching(limit = 10): Array<{ mediaId: string; resumePosition: number; completionPercent: number; lastWatched: number }> {
    const rows = this.db.raw.prepare(`
      SELECT
        mediaId,
        resumePosition,
        completionPercent,
        MAX(startedAt) as lastWatched
      FROM watch_sessions
      WHERE completionPercent BETWEEN 5 AND 90
      GROUP BY mediaId
      ORDER BY lastWatched DESC
      LIMIT ?
    `).all(limit) as any[]

    return rows
  }

  /**
   * Get most viewed media
   */
  getMostViewed(limit = 12): Array<{ id: string; viewCount: number }> {
    const rows = this.db.raw.prepare(`
      SELECT mediaId as id, COUNT(*) as viewCount
      FROM watch_sessions
      WHERE endedAt IS NOT NULL
      GROUP BY mediaId
      ORDER BY viewCount DESC
      LIMIT ?
    `).all(limit) as any[]

    return rows
  }

  /**
   * Clear watch history
   */
  clearHistory(olderThanDays?: number): number {
    if (olderThanDays) {
      const cutoff = Date.now() - (olderThanDays * 24 * 60 * 60 * 1000)
      const result = this.db.raw.prepare(`DELETE FROM watch_sessions WHERE startedAt < ?`).run(cutoff)
      return result.changes
    }

    const result = this.db.raw.prepare(`DELETE FROM watch_sessions`).run()
    return result.changes
  }
}

// Singleton
let instance: WatchHistoryService | null = null

export function getWatchHistoryService(db: DB): WatchHistoryService {
  if (!instance) {
    instance = new WatchHistoryService(db)
  }
  return instance
}
