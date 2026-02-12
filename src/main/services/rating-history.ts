// File: src/main/services/rating-history.ts
// Track rating changes over time for media items

import type { DB } from '../db'

export interface RatingHistoryEntry {
  id: string
  mediaId: string
  oldRating: number | null
  newRating: number
  changedAt: number
  sessionId?: string
}

export interface RatingTrend {
  mediaId: string
  filename: string
  thumbPath?: string
  currentRating: number
  initialRating: number
  changeCount: number
  trend: 'up' | 'down' | 'stable'
  avgRating: number
}

export class RatingHistoryService {
  constructor(private db: DB) {
    this.ensureTable()
  }

  private ensureTable(): void {
    this.db.raw.exec(`
      CREATE TABLE IF NOT EXISTS rating_history (
        id TEXT PRIMARY KEY,
        mediaId TEXT NOT NULL,
        oldRating REAL,
        newRating REAL NOT NULL,
        changedAt INTEGER NOT NULL,
        sessionId TEXT,
        FOREIGN KEY (mediaId) REFERENCES media(id) ON DELETE CASCADE
      )
    `)

    this.db.raw.exec(`
      CREATE INDEX IF NOT EXISTS idx_rating_history_media ON rating_history(mediaId, changedAt DESC)
    `)
  }

  /**
   * Record a rating change
   */
  recordChange(mediaId: string, oldRating: number | null, newRating: number, sessionId?: string): RatingHistoryEntry {
    const id = this.generateId()
    const now = Date.now()

    this.db.raw.prepare(`
      INSERT INTO rating_history (id, mediaId, oldRating, newRating, changedAt, sessionId)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, mediaId, oldRating, newRating, now, sessionId || null)

    return {
      id,
      mediaId,
      oldRating,
      newRating,
      changedAt: now,
      sessionId
    }
  }

  /**
   * Get rating history for a media item
   */
  getHistory(mediaId: string, limit = 50): RatingHistoryEntry[] {
    const rows = this.db.raw.prepare(`
      SELECT * FROM rating_history
      WHERE mediaId = ?
      ORDER BY changedAt DESC
      LIMIT ?
    `).all(mediaId, limit) as any[]

    return rows.map(row => ({
      id: row.id,
      mediaId: row.mediaId,
      oldRating: row.oldRating,
      newRating: row.newRating,
      changedAt: row.changedAt,
      sessionId: row.sessionId
    }))
  }

  /**
   * Get initial rating (first recorded)
   */
  getInitialRating(mediaId: string): number | null {
    const row = this.db.raw.prepare(`
      SELECT newRating FROM rating_history
      WHERE mediaId = ?
      ORDER BY changedAt ASC
      LIMIT 1
    `).get(mediaId) as { newRating: number } | undefined

    return row?.newRating ?? null
  }

  /**
   * Get rating changes in a time range
   */
  getChangesInRange(startTime: number, endTime: number): Array<RatingHistoryEntry & { filename: string }> {
    const rows = this.db.raw.prepare(`
      SELECT rh.*, m.filename
      FROM rating_history rh
      JOIN media m ON rh.mediaId = m.id
      WHERE rh.changedAt BETWEEN ? AND ?
      ORDER BY rh.changedAt DESC
    `).all(startTime, endTime) as any[]

    return rows.map(row => ({
      id: row.id,
      mediaId: row.mediaId,
      oldRating: row.oldRating,
      newRating: row.newRating,
      changedAt: row.changedAt,
      sessionId: row.sessionId,
      filename: row.filename
    }))
  }

  /**
   * Get media with rating trends
   */
  getTrends(minChanges = 2): RatingTrend[] {
    const rows = this.db.raw.prepare(`
      SELECT
        m.id as mediaId,
        m.filename,
        m.thumbPath,
        ms.rating as currentRating,
        (SELECT newRating FROM rating_history WHERE mediaId = m.id ORDER BY changedAt ASC LIMIT 1) as initialRating,
        COUNT(rh.id) as changeCount,
        AVG(rh.newRating) as avgRating
      FROM media m
      JOIN media_stats ms ON m.id = ms.mediaId
      JOIN rating_history rh ON m.id = rh.mediaId
      GROUP BY m.id
      HAVING changeCount >= ?
      ORDER BY changeCount DESC
    `).all(minChanges) as any[]

    return rows.map(row => ({
      mediaId: row.mediaId,
      filename: row.filename,
      thumbPath: row.thumbPath,
      currentRating: row.currentRating || 0,
      initialRating: row.initialRating || 0,
      changeCount: row.changeCount,
      trend: this.calculateTrend(row.initialRating || 0, row.currentRating || 0),
      avgRating: row.avgRating || 0
    }))
  }

  /**
   * Get items that have increased in rating
   */
  getRisingStars(limit = 20): RatingTrend[] {
    return this.getTrends(1)
      .filter(t => t.trend === 'up')
      .sort((a, b) => (b.currentRating - b.initialRating) - (a.currentRating - a.initialRating))
      .slice(0, limit)
  }

  /**
   * Get items that have decreased in rating
   */
  getFallingStars(limit = 20): RatingTrend[] {
    return this.getTrends(1)
      .filter(t => t.trend === 'down')
      .sort((a, b) => (a.currentRating - a.initialRating) - (b.currentRating - b.initialRating))
      .slice(0, limit)
  }

  /**
   * Get most volatile (frequently changed) ratings
   */
  getMostVolatile(limit = 20): RatingTrend[] {
    return this.getTrends(3)
      .sort((a, b) => b.changeCount - a.changeCount)
      .slice(0, limit)
  }

  /**
   * Get recently rated items
   */
  getRecentlyRated(limit = 20): Array<RatingHistoryEntry & { filename: string; thumbPath?: string }> {
    const rows = this.db.raw.prepare(`
      SELECT rh.*, m.filename, m.thumbPath
      FROM rating_history rh
      JOIN media m ON rh.mediaId = m.id
      ORDER BY rh.changedAt DESC
      LIMIT ?
    `).all(limit) as any[]

    return rows.map(row => ({
      id: row.id,
      mediaId: row.mediaId,
      oldRating: row.oldRating,
      newRating: row.newRating,
      changedAt: row.changedAt,
      sessionId: row.sessionId,
      filename: row.filename,
      thumbPath: row.thumbPath
    }))
  }

  /**
   * Get rating distribution over time
   */
  getRatingDistributionOverTime(days = 30): Array<{
    date: string
    distribution: Record<number, number>
  }> {
    const results: Array<{ date: string; distribution: Record<number, number> }> = []
    const now = Date.now()
    const dayMs = 24 * 60 * 60 * 1000

    for (let i = days - 1; i >= 0; i--) {
      const dayStart = now - (i + 1) * dayMs
      const dayEnd = now - i * dayMs
      const date = new Date(dayEnd).toISOString().split('T')[0]

      const rows = this.db.raw.prepare(`
        SELECT ROUND(newRating) as rating, COUNT(*) as count
        FROM rating_history
        WHERE changedAt BETWEEN ? AND ?
        GROUP BY ROUND(newRating)
      `).all(dayStart, dayEnd) as Array<{ rating: number; count: number }>

      const distribution: Record<number, number> = {}
      for (const row of rows) {
        distribution[row.rating] = row.count
      }

      results.push({ date, distribution })
    }

    return results
  }

  /**
   * Get average rating by session
   */
  getSessionAverages(): Array<{
    sessionId: string | null
    avgRating: number
    count: number
    firstRating: number
    lastRating: number
  }> {
    const rows = this.db.raw.prepare(`
      SELECT
        sessionId,
        AVG(newRating) as avgRating,
        COUNT(*) as count,
        MIN(changedAt) as firstTime,
        MAX(changedAt) as lastTime
      FROM rating_history
      GROUP BY sessionId
      ORDER BY lastTime DESC
      LIMIT 50
    `).all() as any[]

    return rows.map(row => ({
      sessionId: row.sessionId,
      avgRating: row.avgRating,
      count: row.count,
      firstRating: row.firstTime,
      lastRating: row.lastTime
    }))
  }

  /**
   * Undo last rating change
   */
  undoLastChange(mediaId: string): number | null {
    const history = this.getHistory(mediaId, 2)
    if (history.length < 1) return null

    const lastChange = history[0]
    const previousRating = lastChange.oldRating

    // Delete the last history entry
    this.db.raw.prepare('DELETE FROM rating_history WHERE id = ?').run(lastChange.id)

    // Return the previous rating to restore
    return previousRating
  }

  /**
   * Get statistics
   */
  getStats(): {
    totalChanges: number
    mediaWithChanges: number
    avgChangesPerMedia: number
    avgRatingChange: number
    risingCount: number
    fallingCount: number
  } {
    const total = this.db.raw.prepare('SELECT COUNT(*) as count FROM rating_history').get() as { count: number }
    const mediaCount = this.db.raw.prepare('SELECT COUNT(DISTINCT mediaId) as count FROM rating_history').get() as { count: number }

    const avgChange = this.db.raw.prepare(`
      SELECT AVG(newRating - COALESCE(oldRating, newRating)) as avg
      FROM rating_history
      WHERE oldRating IS NOT NULL
    `).get() as { avg: number | null }

    const trends = this.getTrends(1)
    const rising = trends.filter(t => t.trend === 'up').length
    const falling = trends.filter(t => t.trend === 'down').length

    return {
      totalChanges: total.count,
      mediaWithChanges: mediaCount.count,
      avgChangesPerMedia: mediaCount.count > 0 ? total.count / mediaCount.count : 0,
      avgRatingChange: avgChange.avg || 0,
      risingCount: rising,
      fallingCount: falling
    }
  }

  /**
   * Clean up old history (keep last N entries per media)
   */
  cleanup(keepPerMedia = 20): number {
    // Get all media with more than keepPerMedia entries
    const mediaToClean = this.db.raw.prepare(`
      SELECT mediaId, COUNT(*) as count
      FROM rating_history
      GROUP BY mediaId
      HAVING count > ?
    `).all(keepPerMedia) as Array<{ mediaId: string; count: number }>

    let deleted = 0
    for (const { mediaId, count } of mediaToClean) {
      const toDelete = count - keepPerMedia
      const result = this.db.raw.prepare(`
        DELETE FROM rating_history
        WHERE id IN (
          SELECT id FROM rating_history
          WHERE mediaId = ?
          ORDER BY changedAt ASC
          LIMIT ?
        )
      `).run(mediaId, toDelete)
      deleted += result.changes
    }

    return deleted
  }

  /**
   * Export history for a media item
   */
  exportHistory(mediaId: string): string {
    const history = this.getHistory(mediaId, 1000)
    return JSON.stringify(history, null, 2)
  }

  private calculateTrend(initial: number, current: number): 'up' | 'down' | 'stable' {
    const diff = current - initial
    if (diff > 0.5) return 'up'
    if (diff < -0.5) return 'down'
    return 'stable'
  }

  private generateId(): string {
    return `rh-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
  }
}

// Singleton
let instance: RatingHistoryService | null = null

export function getRatingHistoryService(db: DB): RatingHistoryService {
  if (!instance) {
    instance = new RatingHistoryService(db)
  }
  return instance
}
