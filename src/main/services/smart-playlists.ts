// File: src/main/services/smart-playlists.ts
// Smart Playlists - Auto-updating playlists based on rules

import type { DB } from '../db'
import { nanoid } from 'nanoid'

export interface SmartPlaylistRule {
  field: 'tag' | 'type' | 'rating' | 'duration' | 'addedAt' | 'views' | 'filename'
  operator: 'equals' | 'contains' | 'greater' | 'less' | 'between' | 'in' | 'not_in'
  value: string | number | string[] | number[]
  value2?: string | number  // For 'between' operator
}

export interface SmartPlaylistRules {
  match: 'all' | 'any'  // AND vs OR
  rules: SmartPlaylistRule[]
  sortBy?: 'addedAt' | 'rating' | 'views' | 'duration' | 'random'
  sortOrder?: 'asc' | 'desc'
  limit?: number
}

export interface SmartPlaylist {
  id: string
  name: string
  isSmart: boolean
  rulesJson: string
  lastRefreshed: number | null
  createdAt: number
  updatedAt: number
}

export class SmartPlaylistService {
  constructor(private db: DB) {}

  /**
   * Create a new smart playlist
   */
  createSmartPlaylist(name: string, rules: SmartPlaylistRules): SmartPlaylist {
    const id = nanoid()
    const now = Date.now()
    const rulesJson = JSON.stringify(rules)

    this.db.raw.prepare(`
      INSERT INTO playlists (id, name, createdAt, updatedAt, isSmart, rulesJson, lastRefreshed)
      VALUES (?, ?, ?, ?, 1, ?, NULL)
    `).run(id, name, now, now, rulesJson)

    return {
      id,
      name,
      isSmart: true,
      rulesJson,
      lastRefreshed: null,
      createdAt: now,
      updatedAt: now
    }
  }

  /**
   * Update smart playlist rules
   */
  updateRules(playlistId: string, rules: SmartPlaylistRules): void {
    const rulesJson = JSON.stringify(rules)
    this.db.raw.prepare(`
      UPDATE playlists SET rulesJson = ?, updatedAt = ?, lastRefreshed = NULL
      WHERE id = ? AND isSmart = 1
    `).run(rulesJson, Date.now(), playlistId)
  }

  /**
   * Refresh a smart playlist - regenerate items based on rules
   */
  refreshPlaylist(playlistId: string): { count: number; refreshedAt: number } {
    const playlist = this.db.raw.prepare(`
      SELECT * FROM playlists WHERE id = ? AND isSmart = 1
    `).get(playlistId) as SmartPlaylist | undefined

    if (!playlist) {
      throw new Error('Smart playlist not found')
    }

    const rules: SmartPlaylistRules = JSON.parse(playlist.rulesJson)
    const mediaIds = this.queryMediaByRules(rules)

    // Clear existing items
    this.db.raw.prepare(`DELETE FROM playlist_items WHERE playlistId = ?`).run(playlistId)

    // Insert new items
    const insertStmt = this.db.raw.prepare(`
      INSERT INTO playlist_items (id, playlistId, mediaId, position, addedAt)
      VALUES (?, ?, ?, ?, ?)
    `)

    const now = Date.now()
    const insertMany = this.db.raw.transaction((ids: string[]) => {
      for (let i = 0; i < ids.length; i++) {
        insertStmt.run(nanoid(), playlistId, ids[i], i, now)
      }
    })

    insertMany(mediaIds)

    // Update last refreshed
    this.db.raw.prepare(`
      UPDATE playlists SET lastRefreshed = ? WHERE id = ?
    `).run(now, playlistId)

    return { count: mediaIds.length, refreshedAt: now }
  }

  /**
   * Query media based on smart playlist rules
   */
  private queryMediaByRules(rules: SmartPlaylistRules): string[] {
    const conditions: string[] = []
    const params: any[] = []

    for (const rule of rules.rules) {
      const condition = this.buildCondition(rule, params)
      if (condition) {
        conditions.push(condition)
      }
    }

    if (conditions.length === 0) {
      return []
    }

    const whereClause = rules.match === 'all'
      ? conditions.join(' AND ')
      : conditions.join(' OR ')

    let orderClause = ''
    if (rules.sortBy === 'random') {
      orderClause = 'ORDER BY RANDOM()'
    } else if (rules.sortBy) {
      const sortMap: Record<string, string> = {
        addedAt: 'm.addedAt',
        rating: 'COALESCE(s.rating, 0)',
        views: 'COALESCE(s.views, 0)',
        duration: 'COALESCE(m.durationSec, 0)'
      }
      const sortCol = sortMap[rules.sortBy] || 'm.addedAt'
      const sortDir = rules.sortOrder === 'asc' ? 'ASC' : 'DESC'
      orderClause = `ORDER BY ${sortCol} ${sortDir}`
    }

    const limitClause = rules.limit ? `LIMIT ${Math.min(rules.limit, 1000)}` : 'LIMIT 500'

    const sql = `
      SELECT DISTINCT m.id
      FROM media m
      LEFT JOIN media_stats s ON m.id = s.mediaId
      LEFT JOIN media_tags mt ON m.id = mt.mediaId
      LEFT JOIN tags t ON mt.tagId = t.id
      WHERE ${whereClause}
      ${orderClause}
      ${limitClause}
    `

    const rows = this.db.raw.prepare(sql).all(...params) as { id: string }[]
    return rows.map(r => r.id)
  }

  /**
   * Build a SQL condition from a rule
   */
  private buildCondition(rule: SmartPlaylistRule, params: any[]): string | null {
    switch (rule.field) {
      case 'tag':
        if (rule.operator === 'equals') {
          params.push(rule.value)
          return 't.name = ?'
        } else if (rule.operator === 'contains') {
          params.push(`%${rule.value}%`)
          return 't.name LIKE ?'
        } else if (rule.operator === 'in' && Array.isArray(rule.value)) {
          const placeholders = rule.value.map(() => '?').join(',')
          params.push(...rule.value)
          return `t.name IN (${placeholders})`
        } else if (rule.operator === 'not_in' && Array.isArray(rule.value)) {
          const placeholders = rule.value.map(() => '?').join(',')
          params.push(...rule.value)
          return `m.id NOT IN (SELECT mediaId FROM media_tags mt2 JOIN tags t2 ON mt2.tagId = t2.id WHERE t2.name IN (${placeholders}))`
        }
        break

      case 'type':
        if (rule.operator === 'equals') {
          params.push(rule.value)
          return 'm.type = ?'
        } else if (rule.operator === 'in' && Array.isArray(rule.value)) {
          const placeholders = rule.value.map(() => '?').join(',')
          params.push(...rule.value)
          return `m.type IN (${placeholders})`
        }
        break

      case 'rating':
        if (rule.operator === 'equals') {
          params.push(rule.value)
          return 'COALESCE(s.rating, 0) = ?'
        } else if (rule.operator === 'greater') {
          params.push(rule.value)
          return 'COALESCE(s.rating, 0) > ?'
        } else if (rule.operator === 'less') {
          params.push(rule.value)
          return 'COALESCE(s.rating, 0) < ?'
        } else if (rule.operator === 'between') {
          params.push(rule.value, rule.value2)
          return 'COALESCE(s.rating, 0) BETWEEN ? AND ?'
        }
        break

      case 'duration':
        if (rule.operator === 'greater') {
          params.push(rule.value)
          return 'COALESCE(m.durationSec, 0) > ?'
        } else if (rule.operator === 'less') {
          params.push(rule.value)
          return 'COALESCE(m.durationSec, 0) < ?'
        } else if (rule.operator === 'between') {
          params.push(rule.value, rule.value2)
          return 'COALESCE(m.durationSec, 0) BETWEEN ? AND ?'
        }
        break

      case 'views':
        if (rule.operator === 'greater') {
          params.push(rule.value)
          return 'COALESCE(s.views, 0) > ?'
        } else if (rule.operator === 'less') {
          params.push(rule.value)
          return 'COALESCE(s.views, 0) < ?'
        }
        break

      case 'addedAt':
        if (rule.operator === 'greater') {
          // Value is days ago
          const daysAgo = Date.now() - (Number(rule.value) * 24 * 60 * 60 * 1000)
          params.push(daysAgo)
          return 'm.addedAt > ?'
        } else if (rule.operator === 'less') {
          const daysAgo = Date.now() - (Number(rule.value) * 24 * 60 * 60 * 1000)
          params.push(daysAgo)
          return 'm.addedAt < ?'
        }
        break

      case 'filename':
        if (rule.operator === 'contains') {
          params.push(`%${rule.value}%`)
          return 'm.filename LIKE ?'
        }
        break
    }

    return null
  }

  /**
   * Get all smart playlists
   */
  getSmartPlaylists(): SmartPlaylist[] {
    return this.db.raw.prepare(`
      SELECT * FROM playlists WHERE isSmart = 1 ORDER BY updatedAt DESC
    `).all() as SmartPlaylist[]
  }

  /**
   * Convert a regular playlist to a smart playlist
   */
  convertToSmart(playlistId: string, rules: SmartPlaylistRules): void {
    const rulesJson = JSON.stringify(rules)
    this.db.raw.prepare(`
      UPDATE playlists SET isSmart = 1, rulesJson = ?, updatedAt = ?
      WHERE id = ?
    `).run(rulesJson, Date.now(), playlistId)
  }

  /**
   * Convert a smart playlist to a regular playlist (keeps current items)
   */
  convertToRegular(playlistId: string): void {
    this.db.raw.prepare(`
      UPDATE playlists SET isSmart = 0, rulesJson = NULL, updatedAt = ?
      WHERE id = ?
    `).run(Date.now(), playlistId)
  }

  /**
   * Refresh all smart playlists that are stale
   */
  refreshStale(maxAgeMs = 3600000): { refreshed: number; total: number } {
    const cutoff = Date.now() - maxAgeMs
    const stalePlaylists = this.db.raw.prepare(`
      SELECT id FROM playlists
      WHERE isSmart = 1 AND (lastRefreshed IS NULL OR lastRefreshed < ?)
    `).all(cutoff) as { id: string }[]

    let refreshed = 0
    for (const playlist of stalePlaylists) {
      try {
        this.refreshPlaylist(playlist.id)
        refreshed++
      } catch (e) {
        console.error(`[SmartPlaylists] Failed to refresh ${playlist.id}:`, e)
      }
    }

    return { refreshed, total: stalePlaylists.length }
  }
}

// Singleton
let instance: SmartPlaylistService | null = null

export function getSmartPlaylistService(db: DB): SmartPlaylistService {
  if (!instance) {
    instance = new SmartPlaylistService(db)
  }
  return instance
}

// Preset smart playlist templates
export const SMART_PLAYLIST_PRESETS = {
  recentFavorites: {
    name: 'Recent Favorites',
    description: 'Highly rated content from the last month',
    icon: 'heart',
    rules: {
      match: 'all' as const,
      rules: [
        { field: 'rating' as const, operator: 'greater' as const, value: 3 },
        { field: 'addedAt' as const, operator: 'greater' as const, value: 30 }
      ],
      sortBy: 'addedAt' as const,
      sortOrder: 'desc' as const,
      limit: 100
    }
  },
  longVideos: {
    name: 'Long Videos',
    description: 'Extended content over 10 minutes',
    icon: 'clock',
    rules: {
      match: 'all' as const,
      rules: [
        { field: 'type' as const, operator: 'equals' as const, value: 'video' },
        { field: 'duration' as const, operator: 'greater' as const, value: 600 }
      ],
      sortBy: 'duration' as const,
      sortOrder: 'desc' as const,
      limit: 200
    }
  },
  quickClips: {
    name: 'Quick Clips',
    description: 'Short videos under 1 minute',
    icon: 'zap',
    rules: {
      match: 'all' as const,
      rules: [
        { field: 'type' as const, operator: 'equals' as const, value: 'video' },
        { field: 'duration' as const, operator: 'less' as const, value: 60 }
      ],
      sortBy: 'random' as const,
      limit: 50
    }
  },
  topRated: {
    name: 'Top Rated',
    description: '5-star content only',
    icon: 'star',
    rules: {
      match: 'all' as const,
      rules: [
        { field: 'rating' as const, operator: 'equals' as const, value: 5 }
      ],
      sortBy: 'views' as const,
      sortOrder: 'desc' as const,
      limit: 100
    }
  },
  unwatched: {
    name: 'Unwatched',
    description: 'Content you haven\'t viewed yet',
    icon: 'eye-off',
    rules: {
      match: 'all' as const,
      rules: [
        { field: 'views' as const, operator: 'less' as const, value: 1 }
      ],
      sortBy: 'addedAt' as const,
      sortOrder: 'desc' as const,
      limit: 200
    }
  },
  mostWatched: {
    name: 'Most Watched',
    description: 'Your most viewed content',
    icon: 'eye',
    rules: {
      match: 'all' as const,
      rules: [
        { field: 'views' as const, operator: 'greater' as const, value: 5 }
      ],
      sortBy: 'views' as const,
      sortOrder: 'desc' as const,
      limit: 100
    }
  },
  dailyDiscovery: {
    name: 'Daily Discovery',
    description: 'Random unwatched content to explore',
    icon: 'compass',
    rules: {
      match: 'all' as const,
      rules: [
        { field: 'views' as const, operator: 'less' as const, value: 1 }
      ],
      sortBy: 'random' as const,
      limit: 25
    }
  },
  hiddenGems: {
    name: 'Hidden Gems',
    description: 'Highly rated but rarely watched',
    icon: 'gem',
    rules: {
      match: 'all' as const,
      rules: [
        { field: 'rating' as const, operator: 'greater' as const, value: 3 },
        { field: 'views' as const, operator: 'less' as const, value: 3 }
      ],
      sortBy: 'rating' as const,
      sortOrder: 'desc' as const,
      limit: 50
    }
  },
  sessionStarters: {
    name: 'Session Starters',
    description: 'Short highly-rated clips to get going',
    icon: 'play-circle',
    rules: {
      match: 'all' as const,
      rules: [
        { field: 'type' as const, operator: 'equals' as const, value: 'video' },
        { field: 'duration' as const, operator: 'less' as const, value: 180 },
        { field: 'rating' as const, operator: 'greater' as const, value: 3 }
      ],
      sortBy: 'random' as const,
      limit: 30
    }
  },
  marathonNight: {
    name: 'Marathon Night',
    description: 'Extended 30+ minute videos',
    icon: 'moon',
    rules: {
      match: 'all' as const,
      rules: [
        { field: 'type' as const, operator: 'equals' as const, value: 'video' },
        { field: 'duration' as const, operator: 'greater' as const, value: 1800 }
      ],
      sortBy: 'rating' as const,
      sortOrder: 'desc' as const,
      limit: 50
    }
  },
  freshContent: {
    name: 'Fresh Content',
    description: 'Added in the last 7 days',
    icon: 'sparkles',
    rules: {
      match: 'all' as const,
      rules: [
        { field: 'addedAt' as const, operator: 'greater' as const, value: 7 }
      ],
      sortBy: 'addedAt' as const,
      sortOrder: 'desc' as const,
      limit: 100
    }
  },
  allImages: {
    name: 'All Images',
    description: 'Browse your image collection',
    icon: 'image',
    rules: {
      match: 'all' as const,
      rules: [
        { field: 'type' as const, operator: 'equals' as const, value: 'image' }
      ],
      sortBy: 'addedAt' as const,
      sortOrder: 'desc' as const,
      limit: 500
    }
  },
  allGifs: {
    name: 'All GIFs',
    description: 'Your animated GIF collection',
    icon: 'film',
    rules: {
      match: 'all' as const,
      rules: [
        { field: 'type' as const, operator: 'equals' as const, value: 'gif' }
      ],
      sortBy: 'random' as const,
      limit: 200
    }
  },
  midLengthPerfect: {
    name: 'Perfect Length',
    description: 'Videos between 5-15 minutes',
    icon: 'timer',
    rules: {
      match: 'all' as const,
      rules: [
        { field: 'type' as const, operator: 'equals' as const, value: 'video' },
        { field: 'duration' as const, operator: 'between' as const, value: 300, value2: 900 }
      ],
      sortBy: 'rating' as const,
      sortOrder: 'desc' as const,
      limit: 100
    }
  }
}
