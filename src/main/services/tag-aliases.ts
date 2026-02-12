// File: src/main/services/tag-aliases.ts
// Manage tag synonyms and aliases

import type { DB } from '../db'

export interface TagAlias {
  id: string
  tagId: string
  alias: string
  createdAt: number
}

export interface TagWithAliases {
  id: string
  name: string
  color?: string
  aliases: string[]
  mediaCount: number
}

export class TagAliasesService {
  constructor(private db: DB) {
    this.ensureTable()
    this.loadCommonAliases()
  }

  private ensureTable(): void {
    this.db.raw.exec(`
      CREATE TABLE IF NOT EXISTS tag_aliases (
        id TEXT PRIMARY KEY,
        tagId TEXT NOT NULL,
        alias TEXT NOT NULL COLLATE NOCASE,
        createdAt INTEGER NOT NULL,
        FOREIGN KEY (tagId) REFERENCES tags(id) ON DELETE CASCADE,
        UNIQUE(alias)
      )
    `)

    this.db.raw.exec(`
      CREATE INDEX IF NOT EXISTS idx_alias_tag ON tag_aliases(tagId)
    `)
    this.db.raw.exec(`
      CREATE INDEX IF NOT EXISTS idx_alias_name ON tag_aliases(alias COLLATE NOCASE)
    `)
  }

  private loadCommonAliases(): void {
    // Load common aliases if the table is empty
    const count = this.db.raw.prepare('SELECT COUNT(*) as count FROM tag_aliases').get() as { count: number }
    if (count.count > 0) return

    const commonAliases: Record<string, string[]> = {
      // Body types
      'bbw': ['big beautiful woman', 'plus size', 'curvy', 'thick'],
      'petite': ['small', 'tiny', 'short'],
      'milf': ['mom', 'mature', 'cougar'],
      'teen': ['young', '18+', 'barely legal'],

      // Hair colors
      'blonde': ['blond', 'golden hair'],
      'brunette': ['brown hair', 'dark hair'],
      'redhead': ['red hair', 'ginger'],

      // Actions
      'bj': ['blowjob', 'oral', 'head'],
      'anal': ['butt', 'ass'],
      'pov': ['first person', 'point of view'],

      // Styles
      'amateur': ['homemade', 'real', 'authentic'],
      'professional': ['pro', 'studio'],
      'hentai': ['anime', 'cartoon', 'animated'],

      // Quality
      '4k': ['uhd', 'ultra hd', '2160p'],
      'hd': ['high definition', '1080p', '720p'],
    }

    for (const [tag, aliases] of Object.entries(commonAliases)) {
      const tagRow = this.db.raw.prepare('SELECT id FROM tags WHERE LOWER(name) = LOWER(?)').get(tag) as { id: string } | undefined
      if (tagRow) {
        for (const alias of aliases) {
          try {
            this.addAlias(tagRow.id, alias)
          } catch {
            // Skip if alias already exists
          }
        }
      }
    }
  }

  /**
   * Add an alias to a tag
   */
  addAlias(tagId: string, alias: string): TagAlias {
    const id = this.generateId()
    const now = Date.now()

    // Normalize alias
    const normalizedAlias = alias.toLowerCase().trim()

    // Check if this alias already points to a tag
    const existing = this.resolveAlias(normalizedAlias)
    if (existing) {
      throw new Error(`Alias "${alias}" already exists for tag "${existing.name}"`)
    }

    this.db.raw.prepare(`
      INSERT INTO tag_aliases (id, tagId, alias, createdAt)
      VALUES (?, ?, ?, ?)
    `).run(id, tagId, normalizedAlias, now)

    return {
      id,
      tagId,
      alias: normalizedAlias,
      createdAt: now
    }
  }

  /**
   * Remove an alias
   */
  removeAlias(aliasId: string): boolean {
    const result = this.db.raw.prepare('DELETE FROM tag_aliases WHERE id = ?').run(aliasId)
    return result.changes > 0
  }

  /**
   * Remove alias by name
   */
  removeAliasByName(alias: string): boolean {
    const result = this.db.raw.prepare('DELETE FROM tag_aliases WHERE LOWER(alias) = LOWER(?)').run(alias)
    return result.changes > 0
  }

  /**
   * Get aliases for a tag
   */
  getAliasesForTag(tagId: string): TagAlias[] {
    const rows = this.db.raw.prepare(`
      SELECT * FROM tag_aliases WHERE tagId = ? ORDER BY alias
    `).all(tagId) as any[]

    return rows.map(row => ({
      id: row.id,
      tagId: row.tagId,
      alias: row.alias,
      createdAt: row.createdAt
    }))
  }

  /**
   * Resolve an alias to a tag
   */
  resolveAlias(alias: string): { id: string; name: string } | null {
    // First check if it's a direct tag name
    const directTag = this.db.raw.prepare('SELECT id, name FROM tags WHERE LOWER(name) = LOWER(?)').get(alias) as { id: string; name: string } | undefined
    if (directTag) return directTag

    // Then check aliases
    const row = this.db.raw.prepare(`
      SELECT t.id, t.name
      FROM tag_aliases ta
      JOIN tags t ON ta.tagId = t.id
      WHERE LOWER(ta.alias) = LOWER(?)
    `).get(alias) as { id: string; name: string } | undefined

    return row || null
  }

  /**
   * Resolve multiple aliases
   */
  resolveAliases(aliases: string[]): Array<{ input: string; resolved: { id: string; name: string } | null }> {
    return aliases.map(alias => ({
      input: alias,
      resolved: this.resolveAlias(alias)
    }))
  }

  /**
   * Get all tags with their aliases
   */
  getAllTagsWithAliases(): TagWithAliases[] {
    const tags = this.db.raw.prepare(`
      SELECT t.id, t.name, t.color, COUNT(mt.mediaId) as mediaCount
      FROM tags t
      LEFT JOIN media_tags mt ON t.id = mt.tagId
      GROUP BY t.id
      ORDER BY t.name
    `).all() as any[]

    return tags.map(tag => ({
      id: tag.id,
      name: tag.name,
      color: tag.color,
      aliases: this.getAliasesForTag(tag.id).map(a => a.alias),
      mediaCount: tag.mediaCount
    }))
  }

  /**
   * Search tags and aliases
   */
  search(query: string, limit = 20): Array<{ id: string; name: string; matchedAlias?: string }> {
    const results: Array<{ id: string; name: string; matchedAlias?: string }> = []
    const seen = new Set<string>()

    // Search direct tag names first
    const directMatches = this.db.raw.prepare(`
      SELECT id, name FROM tags
      WHERE LOWER(name) LIKE LOWER(?)
      ORDER BY name
      LIMIT ?
    `).all(`%${query}%`, limit) as any[]

    for (const tag of directMatches) {
      if (!seen.has(tag.id)) {
        seen.add(tag.id)
        results.push({ id: tag.id, name: tag.name })
      }
    }

    // Search aliases
    if (results.length < limit) {
      const aliasMatches = this.db.raw.prepare(`
        SELECT t.id, t.name, ta.alias
        FROM tag_aliases ta
        JOIN tags t ON ta.tagId = t.id
        WHERE LOWER(ta.alias) LIKE LOWER(?)
        ORDER BY ta.alias
        LIMIT ?
      `).all(`%${query}%`, limit - results.length) as any[]

      for (const match of aliasMatches) {
        if (!seen.has(match.id)) {
          seen.add(match.id)
          results.push({
            id: match.id,
            name: match.name,
            matchedAlias: match.alias
          })
        }
      }
    }

    return results
  }

  /**
   * Suggest aliases for a tag based on common patterns
   */
  suggestAliases(tagName: string): string[] {
    const suggestions: string[] = []
    const lower = tagName.toLowerCase()

    // Plural/singular
    if (lower.endsWith('s')) {
      suggestions.push(lower.slice(0, -1))
    } else {
      suggestions.push(lower + 's')
    }

    // Common abbreviations
    const abbrevs: Record<string, string[]> = {
      'blowjob': ['bj'],
      'handjob': ['hj'],
      'footjob': ['fj'],
      'point of view': ['pov'],
      'amateur': ['ama'],
      'professional': ['pro'],
    }

    if (abbrevs[lower]) {
      suggestions.push(...abbrevs[lower])
    }

    // Reverse lookup
    for (const [full, shorts] of Object.entries(abbrevs)) {
      if (shorts.includes(lower)) {
        suggestions.push(full)
      }
    }

    // Remove spaces/underscores variations
    if (lower.includes(' ')) {
      suggestions.push(lower.replace(/ /g, ''))
      suggestions.push(lower.replace(/ /g, '-'))
      suggestions.push(lower.replace(/ /g, '_'))
    }
    if (lower.includes('-')) {
      suggestions.push(lower.replace(/-/g, ' '))
      suggestions.push(lower.replace(/-/g, ''))
    }

    // Filter out the original and existing aliases
    const existing = new Set([lower])
    const tagRow = this.db.raw.prepare('SELECT id FROM tags WHERE LOWER(name) = LOWER(?)').get(tagName) as { id: string } | undefined
    if (tagRow) {
      const aliases = this.getAliasesForTag(tagRow.id)
      for (const a of aliases) {
        existing.add(a.alias.toLowerCase())
      }
    }

    return suggestions.filter(s => !existing.has(s.toLowerCase()))
  }

  /**
   * Merge aliases from one tag to another
   */
  mergeAliases(fromTagId: string, toTagId: string): number {
    const result = this.db.raw.prepare('UPDATE tag_aliases SET tagId = ? WHERE tagId = ?').run(toTagId, fromTagId)
    return result.changes
  }

  /**
   * Get statistics
   */
  getStats(): {
    totalAliases: number
    tagsWithAliases: number
    avgAliasesPerTag: number
    mostAliases: { tagId: string; tagName: string; count: number } | null
  } {
    const total = this.db.raw.prepare('SELECT COUNT(*) as count FROM tag_aliases').get() as { count: number }
    const tagsWithAliases = this.db.raw.prepare('SELECT COUNT(DISTINCT tagId) as count FROM tag_aliases').get() as { count: number }

    const most = this.db.raw.prepare(`
      SELECT t.id as tagId, t.name as tagName, COUNT(ta.id) as count
      FROM tags t
      JOIN tag_aliases ta ON t.id = ta.tagId
      GROUP BY t.id
      ORDER BY count DESC
      LIMIT 1
    `).get() as { tagId: string; tagName: string; count: number } | undefined

    return {
      totalAliases: total.count,
      tagsWithAliases: tagsWithAliases.count,
      avgAliasesPerTag: tagsWithAliases.count > 0 ? total.count / tagsWithAliases.count : 0,
      mostAliases: most || null
    }
  }

  /**
   * Export all aliases
   */
  exportAliases(): Record<string, string[]> {
    const result: Record<string, string[]> = {}

    const rows = this.db.raw.prepare(`
      SELECT t.name, ta.alias
      FROM tag_aliases ta
      JOIN tags t ON ta.tagId = t.id
      ORDER BY t.name, ta.alias
    `).all() as any[]

    for (const row of rows) {
      if (!result[row.name]) {
        result[row.name] = []
      }
      result[row.name].push(row.alias)
    }

    return result
  }

  /**
   * Import aliases from JSON
   */
  importAliases(data: Record<string, string[]>): { imported: number; skipped: number } {
    let imported = 0
    let skipped = 0

    for (const [tagName, aliases] of Object.entries(data)) {
      const tag = this.db.raw.prepare('SELECT id FROM tags WHERE LOWER(name) = LOWER(?)').get(tagName) as { id: string } | undefined
      if (!tag) {
        skipped += aliases.length
        continue
      }

      for (const alias of aliases) {
        try {
          this.addAlias(tag.id, alias)
          imported++
        } catch {
          skipped++
        }
      }
    }

    return { imported, skipped }
  }

  private generateId(): string {
    return `alias-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
  }
}

// Singleton
let instance: TagAliasesService | null = null

export function getTagAliasesService(db: DB): TagAliasesService {
  if (!instance) {
    instance = new TagAliasesService(db)
  }
  return instance
}
