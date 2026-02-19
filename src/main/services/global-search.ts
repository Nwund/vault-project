// File: src/main/services/global-search.ts
// Global search service - unified search across media, tags, playlists
// Enhanced with fuzzy matching and advanced query parsing

import type { DB } from '../db'
import { fuzzyScore, parseSearchQuery, buildSqlFromParsedQuery, fuzzyMatch } from './fuzzy-search'

export interface SearchResult {
  type: 'media' | 'tag' | 'playlist'
  id: string
  title: string
  subtitle?: string
  thumbnail?: string
  metadata?: Record<string, any>
  score: number
  highlights?: string[] // Matched portions for UI highlighting
}

export interface SearchOptions {
  query: string
  types?: ('media' | 'tag' | 'playlist')[]
  limit?: number
  mediaType?: 'video' | 'image' | 'gif'
  minRating?: number
  tags?: string[]
  fuzzy?: boolean // Enable fuzzy matching (default: true)
}

export class GlobalSearchService {
  constructor(private db: DB) {}

  /**
   * Perform a unified search across all content
   * Supports fuzzy matching and advanced query syntax:
   * - "exact phrase" for literal matching
   * - -exclude to exclude terms
   * - type:video, rating:4, tag:blonde for filters
   * - OR for alternative matches
   */
  search(options: SearchOptions): SearchResult[] {
    const { query, types = ['media', 'tag', 'playlist'], limit = 50, fuzzy = true } = options
    const results: SearchResult[] = []

    if (!query || query.length < 1) {
      return results
    }

    // Parse query for advanced syntax
    const parsed = parseSearchQuery(query)
    const searchTerm = query.toLowerCase().trim()

    // Search media
    if (types.includes('media')) {
      const mediaResults = this.searchMedia(searchTerm, options, parsed, fuzzy)
      results.push(...mediaResults)
    }

    // Search tags
    if (types.includes('tag')) {
      const tagResults = this.searchTags(searchTerm, fuzzy)
      results.push(...tagResults)
    }

    // Search playlists
    if (types.includes('playlist')) {
      const playlistResults = this.searchPlaylists(searchTerm, fuzzy)
      results.push(...playlistResults)
    }

    // Sort by score and limit
    results.sort((a, b) => b.score - a.score)
    return results.slice(0, limit)
  }

  private searchMedia(query: string, options: SearchOptions, parsed: ReturnType<typeof parseSearchQuery>, useFuzzy: boolean): SearchResult[] {
    // Build dynamic WHERE clause from parsed query
    const { where: parsedWhere, params: parsedParams } = buildSqlFromParsedQuery(parsed)

    let sql = `
      SELECT DISTINCT
        m.id,
        m.filename,
        m.type,
        m.thumbPath,
        m.durationSec,
        COALESCE(s.rating, 0) as rating,
        COALESCE(s.views, 0) as views,
        GROUP_CONCAT(DISTINCT t.name) as tagNames
      FROM media m
      LEFT JOIN media_stats s ON m.id = s.mediaId
      LEFT JOIN media_tags mt ON m.id = mt.mediaId
      LEFT JOIN tags t ON mt.tagId = t.id
      WHERE ${parsedWhere}
    `
    const params: any[] = [...parsedParams]

    // Apply additional options filters
    if (options.mediaType) {
      sql += ' AND m.type = ?'
      params.push(options.mediaType)
    }

    if (options.minRating !== undefined) {
      sql += ' AND COALESCE(s.rating, 0) >= ?'
      params.push(options.minRating)
    }

    if (options.tags && options.tags.length > 0) {
      const placeholders = options.tags.map(() => '?').join(',')
      sql += ` AND m.id IN (
        SELECT mt2.mediaId FROM media_tags mt2
        JOIN tags t2 ON mt2.tagId = t2.id
        WHERE t2.name IN (${placeholders})
      )`
      params.push(...options.tags)
    }

    sql += ' GROUP BY m.id ORDER BY views DESC, rating DESC LIMIT 100'

    const rows = this.db.raw.prepare(sql).all(...params) as any[]

    // Apply fuzzy scoring and filtering
    let results = rows.map(row => {
      const fscore = useFuzzy ? fuzzyScore(row.filename, query) : 0
      const tagScore = row.tagNames ? fuzzyScore(row.tagNames, query) * 0.5 : 0

      return {
        type: 'media' as const,
        id: row.id,
        title: row.filename,
        subtitle: `${row.type} • ${row.views} views${row.rating > 0 ? ` • ${row.rating}★` : ''}`,
        thumbnail: row.thumbPath,
        metadata: {
          mediaType: row.type,
          duration: row.durationSec,
          rating: row.rating,
          views: row.views,
          tags: row.tagNames?.split(',') || []
        },
        score: this.calculateMediaScore(row, query) + fscore + tagScore,
        highlights: this.getHighlights(row.filename, query)
      }
    })

    // If fuzzy is enabled and we have few results, also do fuzzy match on all media
    if (useFuzzy && results.length < 10 && query.length >= 3) {
      const allMedia = this.db.raw.prepare(`
        SELECT m.id, m.filename, m.type, m.thumbPath, m.durationSec,
               COALESCE(s.rating, 0) as rating, COALESCE(s.views, 0) as views
        FROM media m
        LEFT JOIN media_stats s ON m.id = s.mediaId
        LIMIT 500
      `).all() as any[]

      const existingIds = new Set(results.map(r => r.id))

      for (const row of allMedia) {
        if (existingIds.has(row.id)) continue
        if (fuzzyMatch(row.filename, query, 0.5)) {
          results.push({
            type: 'media' as const,
            id: row.id,
            title: row.filename,
            subtitle: `${row.type} • ${row.views} views${row.rating > 0 ? ` • ${row.rating}★` : ''}`,
            thumbnail: row.thumbPath,
            metadata: {
              mediaType: row.type,
              duration: row.durationSec,
              rating: row.rating,
              views: row.views,
              tags: []
            },
            score: fuzzyScore(row.filename, query) * 0.8, // Slightly lower for fuzzy-only matches
            highlights: this.getHighlights(row.filename, query)
          })
        }
      }
    }

    return results
  }

  private getHighlights(text: string, query: string): string[] {
    const highlights: string[] = []
    const t = text.toLowerCase()
    const q = query.toLowerCase()

    // Find matching portions
    let idx = t.indexOf(q)
    while (idx !== -1) {
      highlights.push(text.substring(idx, idx + q.length))
      idx = t.indexOf(q, idx + 1)
    }

    return highlights
  }

  private searchTags(query: string, useFuzzy: boolean): SearchResult[] {
    // First try SQL LIKE
    const rows = this.db.raw.prepare(`
      SELECT t.id, t.name, COUNT(mt.mediaId) as count
      FROM tags t
      LEFT JOIN media_tags mt ON t.id = mt.tagId
      WHERE t.name LIKE ?
      GROUP BY t.id
      ORDER BY count DESC
      LIMIT 30
    `).all(`%${query}%`) as any[]

    let results = rows.map(row => ({
      type: 'tag' as const,
      id: row.id,
      title: row.name,
      subtitle: `${row.count} items`,
      metadata: { count: row.count },
      score: this.calculateTagScore(row, query) + (useFuzzy ? fuzzyScore(row.name, query) * 0.5 : 0),
      highlights: this.getHighlights(row.name, query)
    }))

    // Add fuzzy matches if enabled and few results
    if (useFuzzy && results.length < 5 && query.length >= 2) {
      const allTags = this.db.raw.prepare(`
        SELECT t.id, t.name, COUNT(mt.mediaId) as count
        FROM tags t
        LEFT JOIN media_tags mt ON t.id = mt.tagId
        GROUP BY t.id
        ORDER BY count DESC
        LIMIT 200
      `).all() as any[]

      const existingIds = new Set(results.map(r => r.id))

      for (const row of allTags) {
        if (existingIds.has(row.id)) continue
        if (fuzzyMatch(row.name, query, 0.6)) {
          results.push({
            type: 'tag' as const,
            id: row.id,
            title: row.name,
            subtitle: `${row.count} items`,
            metadata: { count: row.count },
            score: fuzzyScore(row.name, query) * 0.7,
            highlights: []
          })
        }
      }
    }

    return results
  }

  private searchPlaylists(query: string, useFuzzy: boolean): SearchResult[] {
    const rows = this.db.raw.prepare(`
      SELECT p.id, p.name, p.isSmart, COUNT(pi.id) as itemCount
      FROM playlists p
      LEFT JOIN playlist_items pi ON p.id = pi.playlistId
      WHERE p.name LIKE ?
      GROUP BY p.id
      ORDER BY p.updatedAt DESC
      LIMIT 15
    `).all(`%${query}%`) as any[]

    let results = rows.map(row => ({
      type: 'playlist' as const,
      id: row.id,
      title: row.name,
      subtitle: `${row.isSmart ? 'Smart • ' : ''}${row.itemCount} items`,
      metadata: { isSmart: row.isSmart, itemCount: row.itemCount },
      score: this.calculatePlaylistScore(row, query) + (useFuzzy ? fuzzyScore(row.name, query) * 0.3 : 0),
      highlights: this.getHighlights(row.name, query)
    }))

    // Fuzzy fallback for playlists
    if (useFuzzy && results.length < 3 && query.length >= 2) {
      const allPlaylists = this.db.raw.prepare(`
        SELECT p.id, p.name, p.isSmart, COUNT(pi.id) as itemCount
        FROM playlists p
        LEFT JOIN playlist_items pi ON p.id = pi.playlistId
        GROUP BY p.id
        LIMIT 50
      `).all() as any[]

      const existingIds = new Set(results.map(r => r.id))

      for (const row of allPlaylists) {
        if (existingIds.has(row.id)) continue
        if (fuzzyMatch(row.name, query, 0.5)) {
          results.push({
            type: 'playlist' as const,
            id: row.id,
            title: row.name,
            subtitle: `${row.isSmart ? 'Smart • ' : ''}${row.itemCount} items`,
            metadata: { isSmart: row.isSmart, itemCount: row.itemCount },
            score: fuzzyScore(row.name, query) * 0.6,
            highlights: []
          })
        }
      }
    }

    return results
  }

  private calculateMediaScore(row: any, query: string): number {
    let score = 50
    const filename = row.filename.toLowerCase()

    // Exact match boost
    if (filename === query) score += 50
    // Starts with boost
    else if (filename.startsWith(query)) score += 30
    // Contains boost
    else if (filename.includes(query)) score += 10

    // Rating boost
    score += (row.rating || 0) * 5

    // Views boost (diminishing returns)
    score += Math.min(row.views * 0.1, 20)

    return score
  }

  private calculateTagScore(row: any, query: string): number {
    let score = 70 // Tags are often what users want
    const name = row.name.toLowerCase()

    // Exact match boost
    if (name === query) score += 50
    // Starts with boost
    else if (name.startsWith(query)) score += 30

    // Popular tags boost
    score += Math.min(row.count * 0.5, 30)

    return score
  }

  private calculatePlaylistScore(row: any, query: string): number {
    let score = 60
    const name = row.name.toLowerCase()

    // Exact match boost
    if (name === query) score += 40
    // Starts with boost
    else if (name.startsWith(query)) score += 20

    // Item count boost
    score += Math.min(row.itemCount * 0.2, 15)

    return score
  }

  /**
   * Get search suggestions (autocomplete)
   */
  getSuggestions(query: string, limit = 10): string[] {
    if (!query || query.length < 2) return []

    const suggestions = new Set<string>()

    // Tag suggestions
    const tags = this.db.raw.prepare(`
      SELECT name FROM tags WHERE name LIKE ? ORDER BY name LIMIT 5
    `).all(`${query}%`) as { name: string }[]
    tags.forEach(t => suggestions.add(t.name))

    // Recent search suggestions
    const recent = this.db.raw.prepare(`
      SELECT DISTINCT query FROM search_history
      WHERE query LIKE ? ORDER BY createdAt DESC LIMIT 5
    `).all(`${query}%`) as { query: string }[]
    recent.forEach(r => suggestions.add(r.query))

    return Array.from(suggestions).slice(0, limit)
  }

  /**
   * Save search to history
   */
  saveToHistory(query: string): void {
    if (!query || query.length < 2) return

    this.db.raw.prepare(`
      INSERT INTO search_history (id, query, createdAt)
      VALUES (?, ?, ?)
    `).run(require('nanoid').nanoid(), query, Date.now())

    // Cleanup old history (keep last 100)
    this.db.raw.prepare(`
      DELETE FROM search_history WHERE id NOT IN (
        SELECT id FROM search_history ORDER BY createdAt DESC LIMIT 100
      )
    `).run()
  }

  /**
   * Get recent searches
   */
  getRecentSearches(limit = 10): string[] {
    const rows = this.db.raw.prepare(`
      SELECT DISTINCT query FROM search_history
      ORDER BY createdAt DESC LIMIT ?
    `).all(limit) as { query: string }[]

    return rows.map(r => r.query)
  }

  /**
   * Clear search history
   */
  clearHistory(): void {
    this.db.raw.prepare('DELETE FROM search_history').run()
  }
}

// Singleton
let instance: GlobalSearchService | null = null

export function getGlobalSearchService(db: DB): GlobalSearchService {
  if (!instance) {
    instance = new GlobalSearchService(db)
  }
  return instance
}
