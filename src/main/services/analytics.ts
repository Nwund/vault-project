// File: src/main/services/analytics.ts
// Internal analytics tracking (privacy-respecting, all local)

import type { DB } from '../db'

export interface UsageEvent {
  event: string
  category: string
  data?: Record<string, any>
  timestamp: number
}

export interface SessionData {
  id: string
  startTime: number
  endTime?: number
  duration?: number
  pageViews: Array<{ page: string; timestamp: number; duration?: number }>
  actions: Array<{ action: string; target?: string; timestamp: number }>
  mediaViewed: Array<{ mediaId: string; duration: number }>
}

export interface UsageStats {
  totalSessions: number
  totalTimeSpent: number
  avgSessionLength: number
  mostUsedFeatures: Array<{ feature: string; count: number }>
  viewPatterns: {
    byHour: number[]
    byDayOfWeek: number[]
  }
  mediaEngagement: {
    totalViewed: number
    avgViewDuration: number
    completionRate: number
  }
}

export interface FeatureUsage {
  goonWall: number
  library: number
  playlists: number
  tags: number
  search: number
  settings: number
  export: number
  import: number
  cast: number
  slideshow: number
  compare: number
  sessions: number
}

export class AnalyticsService {
  private currentSession: SessionData | null = null
  private events: UsageEvent[] = []
  private featureUsage: FeatureUsage = {
    goonWall: 0,
    library: 0,
    playlists: 0,
    tags: 0,
    search: 0,
    settings: 0,
    export: 0,
    import: 0,
    cast: 0,
    slideshow: 0,
    compare: 0,
    sessions: 0
  }

  constructor(private db: DB) {
    this.loadData()
  }

  private loadData(): void {
    // Try to load from settings
    try {
      const row = this.db.raw.prepare("SELECT value FROM settings WHERE key = 'analytics_data'").get() as any
      if (row?.value) {
        const data = JSON.parse(row.value)
        this.featureUsage = { ...this.featureUsage, ...data.featureUsage }
        this.events = data.events || []
      }
    } catch { /* ignore */ }
  }

  private saveData(): void {
    try {
      const data = {
        featureUsage: this.featureUsage,
        events: this.events.slice(-1000) // Keep last 1000 events
      }
      this.db.raw.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('analytics_data', ?)").run(JSON.stringify(data))
    } catch { /* ignore */ }
  }

  /**
   * Start a new session
   */
  startSession(): string {
    const id = `session-${Date.now()}`
    this.currentSession = {
      id,
      startTime: Date.now(),
      pageViews: [],
      actions: [],
      mediaViewed: []
    }
    this.trackEvent('session', 'start')
    return id
  }

  /**
   * End current session
   */
  endSession(): SessionData | null {
    if (!this.currentSession) return null

    this.currentSession.endTime = Date.now()
    this.currentSession.duration = this.currentSession.endTime - this.currentSession.startTime

    this.trackEvent('session', 'end', {
      duration: this.currentSession.duration,
      pageViews: this.currentSession.pageViews.length,
      actions: this.currentSession.actions.length,
      mediaViewed: this.currentSession.mediaViewed.length
    })

    const session = this.currentSession
    this.currentSession = null
    this.saveData()

    return session
  }

  /**
   * Track a page view
   */
  trackPageView(page: string): void {
    const timestamp = Date.now()

    // Close previous page view
    if (this.currentSession?.pageViews.length) {
      const prev = this.currentSession.pageViews[this.currentSession.pageViews.length - 1]
      if (!prev.duration) {
        prev.duration = timestamp - prev.timestamp
      }
    }

    this.currentSession?.pageViews.push({ page, timestamp })
    this.trackFeature(page)
    this.trackEvent('navigation', 'pageView', { page })
  }

  /**
   * Track an action
   */
  trackAction(action: string, target?: string): void {
    this.currentSession?.actions.push({
      action,
      target,
      timestamp: Date.now()
    })
    this.trackEvent('action', action, { target })
  }

  /**
   * Track media view
   */
  trackMediaView(mediaId: string, duration: number): void {
    this.currentSession?.mediaViewed.push({ mediaId, duration })
    this.trackEvent('media', 'view', { mediaId, duration })
  }

  /**
   * Track feature usage
   */
  trackFeature(feature: string): void {
    const featureMap: Record<string, keyof FeatureUsage> = {
      'goonwall': 'goonWall',
      'feed': 'goonWall',
      'library': 'library',
      'browse': 'library',
      'playlists': 'playlists',
      'tags': 'tags',
      'search': 'search',
      'settings': 'settings',
      'export': 'export',
      'import': 'import',
      'cast': 'cast',
      'dlna': 'cast',
      'slideshow': 'slideshow',
      'compare': 'compare',
      'sessions': 'sessions'
    }

    const key = featureMap[feature.toLowerCase()]
    if (key) {
      this.featureUsage[key]++
    }
  }

  /**
   * Track a generic event
   */
  trackEvent(category: string, event: string, data?: Record<string, any>): void {
    this.events.push({
      event,
      category,
      data,
      timestamp: Date.now()
    })

    // Trim events if too many
    if (this.events.length > 2000) {
      this.events = this.events.slice(-1000)
    }
  }

  /**
   * Get usage statistics
   */
  getUsageStats(): UsageStats {
    // Calculate session stats
    const sessionEvents = this.events.filter(e => e.category === 'session')
    const sessions = sessionEvents.filter(e => e.event === 'end')

    const totalSessions = sessions.length
    const totalTime = sessions.reduce((sum, s) => sum + (s.data?.duration || 0), 0)
    const avgSessionLength = totalSessions > 0 ? totalTime / totalSessions : 0

    // View patterns
    const byHour = Array(24).fill(0)
    const byDayOfWeek = Array(7).fill(0)

    for (const event of this.events) {
      const date = new Date(event.timestamp)
      byHour[date.getHours()]++
      byDayOfWeek[date.getDay()]++
    }

    // Most used features
    const featureEntries = Object.entries(this.featureUsage)
      .map(([feature, count]) => ({ feature, count }))
      .filter(f => f.count > 0)
      .sort((a, b) => b.count - a.count)

    // Media engagement
    const mediaEvents = this.events.filter(e => e.category === 'media' && e.event === 'view')
    const totalViewed = mediaEvents.length
    const avgViewDuration = totalViewed > 0
      ? mediaEvents.reduce((sum, e) => sum + (e.data?.duration || 0), 0) / totalViewed
      : 0

    return {
      totalSessions,
      totalTimeSpent: totalTime,
      avgSessionLength,
      mostUsedFeatures: featureEntries.slice(0, 10),
      viewPatterns: { byHour, byDayOfWeek },
      mediaEngagement: {
        totalViewed,
        avgViewDuration,
        completionRate: 0 // Would need more tracking
      }
    }
  }

  /**
   * Get feature usage stats
   */
  getFeatureUsage(): FeatureUsage {
    return { ...this.featureUsage }
  }

  /**
   * Get recent events
   */
  getRecentEvents(limit = 100): UsageEvent[] {
    return this.events.slice(-limit).reverse()
  }

  /**
   * Get events by category
   */
  getEventsByCategory(category: string, limit = 100): UsageEvent[] {
    return this.events
      .filter(e => e.category === category)
      .slice(-limit)
      .reverse()
  }

  /**
   * Get current session
   */
  getCurrentSession(): SessionData | null {
    return this.currentSession
  }

  /**
   * Get peak usage hours
   */
  getPeakHours(): Array<{ hour: number; count: number }> {
    const byHour = Array(24).fill(0)

    for (const event of this.events) {
      const hour = new Date(event.timestamp).getHours()
      byHour[hour]++
    }

    return byHour
      .map((count, hour) => ({ hour, count }))
      .sort((a, b) => b.count - a.count)
  }

  /**
   * Get usage heatmap data
   */
  getUsageHeatmap(days = 30): Array<{ date: string; count: number }> {
    const now = Date.now()
    const dayMs = 24 * 60 * 60 * 1000
    const startDate = now - days * dayMs

    const byDay: Record<string, number> = {}

    for (const event of this.events) {
      if (event.timestamp >= startDate) {
        const date = new Date(event.timestamp).toISOString().slice(0, 10)
        byDay[date] = (byDay[date] || 0) + 1
      }
    }

    return Object.entries(byDay)
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date))
  }

  /**
   * Clear all analytics data
   */
  clearData(): void {
    this.events = []
    this.featureUsage = {
      goonWall: 0,
      library: 0,
      playlists: 0,
      tags: 0,
      search: 0,
      settings: 0,
      export: 0,
      import: 0,
      cast: 0,
      slideshow: 0,
      compare: 0,
      sessions: 0
    }
    this.currentSession = null
    this.saveData()
  }

  /**
   * Export analytics data
   */
  exportData(): {
    events: UsageEvent[]
    featureUsage: FeatureUsage
    stats: UsageStats
  } {
    return {
      events: this.events,
      featureUsage: this.featureUsage,
      stats: this.getUsageStats()
    }
  }
}

// Singleton
let instance: AnalyticsService | null = null

export function getAnalyticsService(db: DB): AnalyticsService {
  if (!instance) {
    instance = new AnalyticsService(db)
  }
  return instance
}
