// File: src/main/services/session-history.ts
// Track and analyze viewing sessions

import type { DB } from '../db'

export interface ViewingSession {
  id: string
  startedAt: number
  endedAt: number | null
  duration: number
  mediaViewed: string[]
  tagsViewed: string[]
  searchQueries: string[]
  actionsPerformed: SessionAction[]
  mood?: string
  notes?: string
}

export interface SessionAction {
  type: 'view' | 'rate' | 'tag' | 'favorite' | 'search' | 'playlist' | 'bookmark'
  mediaId?: string
  data?: any
  timestamp: number
}

export interface SessionSummary {
  sessionId: string
  startedAt: number
  endedAt: number | null
  duration: number
  mediaCount: number
  uniqueTags: number
  searchCount: number
  topTags: string[]
}

export interface SessionAnalytics {
  totalSessions: number
  totalDuration: number
  avgSessionDuration: number
  avgMediaPerSession: number
  mostActiveHour: number
  mostActiveDay: string
  longestSession: SessionSummary | null
}

export class SessionHistoryService {
  private currentSession: ViewingSession | null = null

  constructor(private db: DB) {
    this.ensureTable()
  }

  private ensureTable(): void {
    this.db.raw.exec(`
      CREATE TABLE IF NOT EXISTS viewing_sessions (
        id TEXT PRIMARY KEY,
        startedAt INTEGER NOT NULL,
        endedAt INTEGER,
        duration INTEGER DEFAULT 0,
        mediaViewed TEXT DEFAULT '[]',
        tagsViewed TEXT DEFAULT '[]',
        searchQueries TEXT DEFAULT '[]',
        actionsPerformed TEXT DEFAULT '[]',
        mood TEXT,
        notes TEXT
      )
    `)

    this.db.raw.exec(`
      CREATE INDEX IF NOT EXISTS idx_sessions_started ON viewing_sessions(startedAt DESC)
    `)
  }

  /**
   * Start a new session
   */
  startSession(mood?: string): ViewingSession {
    // End any existing session first
    if (this.currentSession) {
      this.endSession()
    }

    const id = this.generateId()
    const now = Date.now()

    const session: ViewingSession = {
      id,
      startedAt: now,
      endedAt: null,
      duration: 0,
      mediaViewed: [],
      tagsViewed: [],
      searchQueries: [],
      actionsPerformed: [],
      mood
    }

    this.db.raw.prepare(`
      INSERT INTO viewing_sessions (id, startedAt, mood)
      VALUES (?, ?, ?)
    `).run(id, now, mood || null)

    this.currentSession = session
    return session
  }

  /**
   * End the current session
   */
  endSession(notes?: string): ViewingSession | null {
    if (!this.currentSession) return null

    const now = Date.now()
    const duration = Math.floor((now - this.currentSession.startedAt) / 1000)

    this.db.raw.prepare(`
      UPDATE viewing_sessions
      SET endedAt = ?, duration = ?, mediaViewed = ?, tagsViewed = ?, searchQueries = ?, actionsPerformed = ?, notes = ?
      WHERE id = ?
    `).run(
      now,
      duration,
      JSON.stringify(this.currentSession.mediaViewed),
      JSON.stringify(this.currentSession.tagsViewed),
      JSON.stringify(this.currentSession.searchQueries),
      JSON.stringify(this.currentSession.actionsPerformed),
      notes || this.currentSession.notes || null,
      this.currentSession.id
    )

    const ended = { ...this.currentSession, endedAt: now, duration, notes }
    this.currentSession = null
    return ended
  }

  /**
   * Get current session
   */
  getCurrentSession(): ViewingSession | null {
    return this.currentSession
  }

  /**
   * Record media view
   */
  recordMediaView(mediaId: string): void {
    if (!this.currentSession) {
      this.startSession()
    }

    if (!this.currentSession!.mediaViewed.includes(mediaId)) {
      this.currentSession!.mediaViewed.push(mediaId)
    }

    this.currentSession!.actionsPerformed.push({
      type: 'view',
      mediaId,
      timestamp: Date.now()
    })

    // Get tags for this media
    const tags = this.db.raw.prepare(`
      SELECT t.name FROM tags t
      JOIN media_tags mt ON t.id = mt.tagId
      WHERE mt.mediaId = ?
    `).all(mediaId) as Array<{ name: string }>

    for (const tag of tags) {
      if (!this.currentSession!.tagsViewed.includes(tag.name)) {
        this.currentSession!.tagsViewed.push(tag.name)
      }
    }
  }

  /**
   * Record action
   */
  recordAction(type: SessionAction['type'], mediaId?: string, data?: any): void {
    if (!this.currentSession) {
      this.startSession()
    }

    this.currentSession!.actionsPerformed.push({
      type,
      mediaId,
      data,
      timestamp: Date.now()
    })

    if (type === 'search' && data?.query) {
      if (!this.currentSession!.searchQueries.includes(data.query)) {
        this.currentSession!.searchQueries.push(data.query)
      }
    }
  }

  /**
   * Get session by ID
   */
  getSession(sessionId: string): ViewingSession | null {
    const row = this.db.raw.prepare('SELECT * FROM viewing_sessions WHERE id = ?').get(sessionId) as any
    if (!row) return null

    return this.rowToSession(row)
  }

  /**
   * Get recent sessions
   */
  getRecentSessions(limit = 20): SessionSummary[] {
    const rows = this.db.raw.prepare(`
      SELECT * FROM viewing_sessions
      ORDER BY startedAt DESC
      LIMIT ?
    `).all(limit) as any[]

    return rows.map(row => this.rowToSummary(row))
  }

  /**
   * Get sessions in date range
   */
  getSessionsInRange(startTime: number, endTime: number): SessionSummary[] {
    const rows = this.db.raw.prepare(`
      SELECT * FROM viewing_sessions
      WHERE startedAt BETWEEN ? AND ?
      ORDER BY startedAt DESC
    `).all(startTime, endTime) as any[]

    return rows.map(row => this.rowToSummary(row))
  }

  /**
   * Get today's sessions
   */
  getTodaySessions(): SessionSummary[] {
    const startOfDay = new Date()
    startOfDay.setHours(0, 0, 0, 0)
    return this.getSessionsInRange(startOfDay.getTime(), Date.now())
  }

  /**
   * Get this week's sessions
   */
  getWeekSessions(): SessionSummary[] {
    const now = Date.now()
    const weekAgo = now - 7 * 24 * 60 * 60 * 1000
    return this.getSessionsInRange(weekAgo, now)
  }

  /**
   * Get analytics
   */
  getAnalytics(days = 30): SessionAnalytics {
    const startTime = Date.now() - days * 24 * 60 * 60 * 1000

    const stats = this.db.raw.prepare(`
      SELECT
        COUNT(*) as totalSessions,
        COALESCE(SUM(duration), 0) as totalDuration,
        COALESCE(AVG(duration), 0) as avgDuration
      FROM viewing_sessions
      WHERE startedAt > ?
    `).get(startTime) as { totalSessions: number; totalDuration: number; avgDuration: number }

    // Calculate average media per session
    const sessions = this.getSessionsInRange(startTime, Date.now())
    const totalMedia = sessions.reduce((sum, s) => sum + s.mediaCount, 0)
    const avgMedia = sessions.length > 0 ? totalMedia / sessions.length : 0

    // Find most active hour
    const hourCounts = new Map<number, number>()
    for (const session of sessions) {
      const hour = new Date(session.startedAt).getHours()
      hourCounts.set(hour, (hourCounts.get(hour) || 0) + 1)
    }
    let mostActiveHour = 0
    let maxHourCount = 0
    for (const [hour, count] of hourCounts) {
      if (count > maxHourCount) {
        maxHourCount = count
        mostActiveHour = hour
      }
    }

    // Find most active day
    const dayCounts = new Map<string, number>()
    const days_of_week = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
    for (const session of sessions) {
      const day = days_of_week[new Date(session.startedAt).getDay()]
      dayCounts.set(day, (dayCounts.get(day) || 0) + 1)
    }
    let mostActiveDay = 'Monday'
    let maxDayCount = 0
    for (const [day, count] of dayCounts) {
      if (count > maxDayCount) {
        maxDayCount = count
        mostActiveDay = day
      }
    }

    // Find longest session
    const longestRow = this.db.raw.prepare(`
      SELECT * FROM viewing_sessions
      WHERE startedAt > ?
      ORDER BY duration DESC
      LIMIT 1
    `).get(startTime) as any

    return {
      totalSessions: stats.totalSessions,
      totalDuration: stats.totalDuration,
      avgSessionDuration: Math.round(stats.avgDuration),
      avgMediaPerSession: Math.round(avgMedia * 10) / 10,
      mostActiveHour,
      mostActiveDay,
      longestSession: longestRow ? this.rowToSummary(longestRow) : null
    }
  }

  /**
   * Get frequently viewed together
   */
  getFrequentlyViewedTogether(mediaId: string, limit = 10): Array<{ mediaId: string; coViewCount: number }> {
    // Find all sessions where this media was viewed
    const rows = this.db.raw.prepare(`
      SELECT mediaViewed FROM viewing_sessions
      WHERE mediaViewed LIKE ?
    `).all(`%${mediaId}%`) as Array<{ mediaViewed: string }>

    const coOccurrences = new Map<string, number>()

    for (const row of rows) {
      const viewed = JSON.parse(row.mediaViewed) as string[]
      if (viewed.includes(mediaId)) {
        for (const otherId of viewed) {
          if (otherId !== mediaId) {
            coOccurrences.set(otherId, (coOccurrences.get(otherId) || 0) + 1)
          }
        }
      }
    }

    return Array.from(coOccurrences.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([id, count]) => ({ mediaId: id, coViewCount: count }))
  }

  /**
   * Get session tags analysis
   */
  getTagTrends(days = 30): Array<{ tag: string; sessionCount: number; trend: 'up' | 'down' | 'stable' }> {
    const now = Date.now()
    const midpoint = now - (days / 2) * 24 * 60 * 60 * 1000
    const startTime = now - days * 24 * 60 * 60 * 1000

    // Get recent sessions
    const recentRows = this.db.raw.prepare(`
      SELECT tagsViewed FROM viewing_sessions
      WHERE startedAt > ?
    `).all(midpoint) as Array<{ tagsViewed: string }>

    // Get older sessions
    const olderRows = this.db.raw.prepare(`
      SELECT tagsViewed FROM viewing_sessions
      WHERE startedAt BETWEEN ? AND ?
    `).all(startTime, midpoint) as Array<{ tagsViewed: string }>

    const recentCounts = new Map<string, number>()
    const olderCounts = new Map<string, number>()

    for (const row of recentRows) {
      const tags = JSON.parse(row.tagsViewed) as string[]
      for (const tag of tags) {
        recentCounts.set(tag, (recentCounts.get(tag) || 0) + 1)
      }
    }

    for (const row of olderRows) {
      const tags = JSON.parse(row.tagsViewed) as string[]
      for (const tag of tags) {
        olderCounts.set(tag, (olderCounts.get(tag) || 0) + 1)
      }
    }

    const allTags = new Set([...recentCounts.keys(), ...olderCounts.keys()])
    const trends: Array<{ tag: string; sessionCount: number; trend: 'up' | 'down' | 'stable' }> = []

    for (const tag of allTags) {
      const recent = recentCounts.get(tag) || 0
      const older = olderCounts.get(tag) || 0
      const total = recent + older

      let trend: 'up' | 'down' | 'stable' = 'stable'
      if (older > 0) {
        const change = (recent - older) / older
        if (change > 0.2) trend = 'up'
        else if (change < -0.2) trend = 'down'
      } else if (recent > 0) {
        trend = 'up'
      }

      trends.push({ tag, sessionCount: total, trend })
    }

    return trends.sort((a, b) => b.sessionCount - a.sessionCount).slice(0, 20)
  }

  /**
   * Delete old sessions
   */
  deleteOldSessions(keepDays = 90): number {
    const cutoff = Date.now() - keepDays * 24 * 60 * 60 * 1000
    const result = this.db.raw.prepare('DELETE FROM viewing_sessions WHERE startedAt < ?').run(cutoff)
    return result.changes
  }

  /**
   * Delete session
   */
  deleteSession(sessionId: string): boolean {
    const result = this.db.raw.prepare('DELETE FROM viewing_sessions WHERE id = ?').run(sessionId)
    return result.changes > 0
  }

  /**
   * Export session data
   */
  exportSessions(days = 30): string {
    const startTime = Date.now() - days * 24 * 60 * 60 * 1000
    const rows = this.db.raw.prepare(`
      SELECT * FROM viewing_sessions
      WHERE startedAt > ?
      ORDER BY startedAt DESC
    `).all(startTime) as any[]

    const sessions = rows.map(row => this.rowToSession(row))
    return JSON.stringify(sessions, null, 2)
  }

  private rowToSession(row: any): ViewingSession {
    return {
      id: row.id,
      startedAt: row.startedAt,
      endedAt: row.endedAt,
      duration: row.duration,
      mediaViewed: JSON.parse(row.mediaViewed || '[]'),
      tagsViewed: JSON.parse(row.tagsViewed || '[]'),
      searchQueries: JSON.parse(row.searchQueries || '[]'),
      actionsPerformed: JSON.parse(row.actionsPerformed || '[]'),
      mood: row.mood,
      notes: row.notes
    }
  }

  private rowToSummary(row: any): SessionSummary {
    const mediaViewed = JSON.parse(row.mediaViewed || '[]') as string[]
    const tagsViewed = JSON.parse(row.tagsViewed || '[]') as string[]
    const searchQueries = JSON.parse(row.searchQueries || '[]') as string[]

    return {
      sessionId: row.id,
      startedAt: row.startedAt,
      endedAt: row.endedAt,
      duration: row.duration,
      mediaCount: mediaViewed.length,
      uniqueTags: tagsViewed.length,
      searchCount: searchQueries.length,
      topTags: tagsViewed.slice(0, 5)
    }
  }

  private generateId(): string {
    return `session-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
  }
}

// Singleton
let instance: SessionHistoryService | null = null

export function getSessionHistoryService(db: DB): SessionHistoryService {
  if (!instance) {
    instance = new SessionHistoryService(db)
  }
  return instance
}
