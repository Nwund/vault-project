// File: src/main/services/media-relationships.ts
// Link and manage relationships between media items

import type { DB } from '../db'

export type RelationshipType =
  | 'sequel'           // Part 2, 3, etc.
  | 'prequel'          // Earlier part
  | 'related'          // Generally related
  | 'alternate'        // Different version/angle
  | 'compilation'      // Part of a compilation
  | 'source'           // Original source
  | 'derived'          // Derived from (edit, crop, etc.)
  | 'series'           // Part of same series
  | 'duplicate'        // Duplicate/near-duplicate
  | 'response'         // Response/reaction to

export interface MediaRelationship {
  id: string
  sourceId: string
  targetId: string
  type: RelationshipType
  bidirectional: boolean
  note?: string
  createdAt: number
}

export interface RelatedMedia {
  id: string
  filename: string
  thumbPath?: string
  type: string
  relationshipType: RelationshipType
  relationshipId: string
  note?: string
}

export interface MediaWithRelationships {
  id: string
  filename: string
  thumbPath?: string
  relationships: RelatedMedia[]
  series?: string
  sequenceNumber?: number
}

const INVERSE_TYPES: Partial<Record<RelationshipType, RelationshipType>> = {
  'sequel': 'prequel',
  'prequel': 'sequel',
  'source': 'derived',
  'derived': 'source',
}

export class MediaRelationshipsService {
  constructor(private db: DB) {
    this.ensureTable()
  }

  private ensureTable(): void {
    this.db.raw.exec(`
      CREATE TABLE IF NOT EXISTS media_relationships (
        id TEXT PRIMARY KEY,
        sourceId TEXT NOT NULL,
        targetId TEXT NOT NULL,
        type TEXT NOT NULL,
        bidirectional INTEGER DEFAULT 0,
        note TEXT,
        createdAt INTEGER NOT NULL,
        FOREIGN KEY (sourceId) REFERENCES media(id) ON DELETE CASCADE,
        FOREIGN KEY (targetId) REFERENCES media(id) ON DELETE CASCADE,
        UNIQUE(sourceId, targetId, type)
      )
    `)

    this.db.raw.exec(`
      CREATE INDEX IF NOT EXISTS idx_rel_source ON media_relationships(sourceId)
    `)
    this.db.raw.exec(`
      CREATE INDEX IF NOT EXISTS idx_rel_target ON media_relationships(targetId)
    `)
  }

  /**
   * Create a relationship between two media items
   */
  createRelationship(sourceId: string, targetId: string, type: RelationshipType, options?: {
    bidirectional?: boolean
    note?: string
  }): MediaRelationship {
    const id = this.generateId()
    const now = Date.now()
    const bidirectional = options?.bidirectional ?? this.isBidirectionalType(type)

    this.db.raw.prepare(`
      INSERT INTO media_relationships (id, sourceId, targetId, type, bidirectional, note, createdAt)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, sourceId, targetId, type, bidirectional ? 1 : 0, options?.note || null, now)

    return {
      id,
      sourceId,
      targetId,
      type,
      bidirectional,
      note: options?.note,
      createdAt: now
    }
  }

  /**
   * Link as sequel/prequel
   */
  linkAsSequel(earlierId: string, laterId: string, note?: string): MediaRelationship {
    return this.createRelationship(earlierId, laterId, 'sequel', { note })
  }

  /**
   * Link as related
   */
  linkAsRelated(id1: string, id2: string, note?: string): MediaRelationship {
    return this.createRelationship(id1, id2, 'related', { bidirectional: true, note })
  }

  /**
   * Link as alternate version
   */
  linkAsAlternate(id1: string, id2: string, note?: string): MediaRelationship {
    return this.createRelationship(id1, id2, 'alternate', { bidirectional: true, note })
  }

  /**
   * Link as series members
   */
  linkAsSeries(mediaIds: string[], seriesNote?: string): MediaRelationship[] {
    const relationships: MediaRelationship[] = []

    for (let i = 0; i < mediaIds.length - 1; i++) {
      const rel = this.createRelationship(mediaIds[i], mediaIds[i + 1], 'series', {
        bidirectional: true,
        note: seriesNote
      })
      relationships.push(rel)
    }

    return relationships
  }

  /**
   * Mark as duplicates
   */
  markAsDuplicates(id1: string, id2: string, note?: string): MediaRelationship {
    return this.createRelationship(id1, id2, 'duplicate', { bidirectional: true, note })
  }

  /**
   * Get relationship by ID
   */
  getRelationship(relationshipId: string): MediaRelationship | null {
    const row = this.db.raw.prepare('SELECT * FROM media_relationships WHERE id = ?').get(relationshipId) as any
    if (!row) return null

    return {
      id: row.id,
      sourceId: row.sourceId,
      targetId: row.targetId,
      type: row.type,
      bidirectional: row.bidirectional === 1,
      note: row.note,
      createdAt: row.createdAt
    }
  }

  /**
   * Get all relationships for a media item
   */
  getRelationships(mediaId: string): RelatedMedia[] {
    // Get relationships where this media is source or target
    const rows = this.db.raw.prepare(`
      SELECT r.*, m.filename, m.thumbPath, m.type as mediaType,
             CASE WHEN r.sourceId = ? THEN r.targetId ELSE r.sourceId END as relatedId
      FROM media_relationships r
      JOIN media m ON (
        CASE WHEN r.sourceId = ? THEN r.targetId ELSE r.sourceId END = m.id
      )
      WHERE r.sourceId = ? OR (r.targetId = ? AND r.bidirectional = 1)
    `).all(mediaId, mediaId, mediaId, mediaId) as any[]

    return rows.map(row => {
      let relType = row.type as RelationshipType

      // Invert type if viewing from target side
      if (row.sourceId !== mediaId && INVERSE_TYPES[row.type]) {
        relType = INVERSE_TYPES[row.type] as RelationshipType
      }

      return {
        id: row.relatedId,
        filename: row.filename,
        thumbPath: row.thumbPath,
        type: row.mediaType,
        relationshipType: relType,
        relationshipId: row.id,
        note: row.note
      }
    })
  }

  /**
   * Get related by type
   */
  getRelatedByType(mediaId: string, type: RelationshipType): RelatedMedia[] {
    return this.getRelationships(mediaId).filter(r => r.relationshipType === type)
  }

  /**
   * Get sequels
   */
  getSequels(mediaId: string): RelatedMedia[] {
    return this.getRelatedByType(mediaId, 'sequel')
  }

  /**
   * Get prequels
   */
  getPrequels(mediaId: string): RelatedMedia[] {
    return this.getRelatedByType(mediaId, 'prequel')
  }

  /**
   * Get duplicates
   */
  getDuplicates(mediaId: string): RelatedMedia[] {
    return this.getRelatedByType(mediaId, 'duplicate')
  }

  /**
   * Update a relationship
   */
  updateRelationship(relationshipId: string, updates: Partial<Pick<MediaRelationship, 'type' | 'note' | 'bidirectional'>>): MediaRelationship | null {
    const existing = this.getRelationship(relationshipId)
    if (!existing) return null

    const setClauses: string[] = []
    const values: any[] = []

    if (updates.type !== undefined) {
      setClauses.push('type = ?')
      values.push(updates.type)
    }
    if (updates.note !== undefined) {
      setClauses.push('note = ?')
      values.push(updates.note)
    }
    if (updates.bidirectional !== undefined) {
      setClauses.push('bidirectional = ?')
      values.push(updates.bidirectional ? 1 : 0)
    }

    if (setClauses.length === 0) return existing

    values.push(relationshipId)
    this.db.raw.prepare(`UPDATE media_relationships SET ${setClauses.join(', ')} WHERE id = ?`).run(...values)

    return this.getRelationship(relationshipId)
  }

  /**
   * Delete a relationship
   */
  deleteRelationship(relationshipId: string): boolean {
    const result = this.db.raw.prepare('DELETE FROM media_relationships WHERE id = ?').run(relationshipId)
    return result.changes > 0
  }

  /**
   * Delete all relationships for a media item
   */
  deleteAllForMedia(mediaId: string): number {
    const result = this.db.raw.prepare('DELETE FROM media_relationships WHERE sourceId = ? OR targetId = ?').run(mediaId, mediaId)
    return result.changes
  }

  /**
   * Check if two items are related
   */
  areRelated(id1: string, id2: string): boolean {
    const row = this.db.raw.prepare(`
      SELECT id FROM media_relationships
      WHERE (sourceId = ? AND targetId = ?)
         OR (sourceId = ? AND targetId = ? AND bidirectional = 1)
      LIMIT 1
    `).get(id1, id2, id2, id1)

    return !!row
  }

  /**
   * Get relationship between two items
   */
  getRelationshipBetween(id1: string, id2: string): MediaRelationship | null {
    const row = this.db.raw.prepare(`
      SELECT * FROM media_relationships
      WHERE (sourceId = ? AND targetId = ?)
         OR (sourceId = ? AND targetId = ?)
      LIMIT 1
    `).get(id1, id2, id2, id1) as any

    if (!row) return null

    return {
      id: row.id,
      sourceId: row.sourceId,
      targetId: row.targetId,
      type: row.type,
      bidirectional: row.bidirectional === 1,
      note: row.note,
      createdAt: row.createdAt
    }
  }

  /**
   * Find series (connected chain of relationships)
   */
  findSeries(mediaId: string): string[] {
    const visited = new Set<string>()
    const series: string[] = []

    const traverse = (id: string) => {
      if (visited.has(id)) return
      visited.add(id)
      series.push(id)

      const related = this.getRelatedByType(id, 'series')
        .concat(this.getRelatedByType(id, 'sequel'))
        .concat(this.getRelatedByType(id, 'prequel'))

      for (const r of related) {
        traverse(r.id)
      }
    }

    traverse(mediaId)
    return series
  }

  /**
   * Get all media with relationships
   */
  getMediaWithRelationships(): Array<{ mediaId: string; filename: string; relationshipCount: number }> {
    const rows = this.db.raw.prepare(`
      SELECT m.id as mediaId, m.filename, COUNT(DISTINCT r.id) as relationshipCount
      FROM media m
      JOIN media_relationships r ON m.id = r.sourceId OR m.id = r.targetId
      GROUP BY m.id
      ORDER BY relationshipCount DESC
    `).all() as any[]

    return rows
  }

  /**
   * Get relationship statistics
   */
  getStats(): {
    totalRelationships: number
    mediaWithRelationships: number
    byType: Record<RelationshipType, number>
  } {
    const total = this.db.raw.prepare('SELECT COUNT(*) as count FROM media_relationships').get() as { count: number }

    const mediaCount = this.db.raw.prepare(`
      SELECT COUNT(DISTINCT id) as count FROM (
        SELECT sourceId as id FROM media_relationships
        UNION
        SELECT targetId as id FROM media_relationships
      )
    `).get() as { count: number }

    const byType: Record<string, number> = {}
    const types = this.db.raw.prepare(`
      SELECT type, COUNT(*) as count FROM media_relationships GROUP BY type
    `).all() as Array<{ type: string; count: number }>

    for (const t of types) {
      byType[t.type] = t.count
    }

    return {
      totalRelationships: total.count,
      mediaWithRelationships: mediaCount.count,
      byType: byType as Record<RelationshipType, number>
    }
  }

  /**
   * Suggest relationships based on filename similarity
   */
  suggestRelationships(mediaId: string, limit = 10): Array<{
    id: string
    filename: string
    thumbPath?: string
    confidence: number
    suggestedType: RelationshipType
  }> {
    const media = this.db.raw.prepare('SELECT filename FROM media WHERE id = ?').get(mediaId) as { filename: string } | undefined
    if (!media) return []

    const baseName = media.filename.replace(/\.[^.]+$/, '').toLowerCase()

    // Get potential matches
    const candidates = this.db.raw.prepare(`
      SELECT id, filename, thumbPath FROM media
      WHERE id != ? AND LOWER(filename) LIKE ?
      LIMIT ?
    `).all(mediaId, `%${baseName.slice(0, 10)}%`, limit * 2) as any[]

    const suggestions: Array<{
      id: string
      filename: string
      thumbPath?: string
      confidence: number
      suggestedType: RelationshipType
    }> = []

    for (const candidate of candidates) {
      // Skip if already related
      if (this.areRelated(mediaId, candidate.id)) continue

      const candName = candidate.filename.replace(/\.[^.]+$/, '').toLowerCase()
      const similarity = this.calculateSimilarity(baseName, candName)

      if (similarity > 0.5) {
        let suggestedType: RelationshipType = 'related'

        // Check for sequence patterns
        const seqMatch1 = baseName.match(/(\d+)/)
        const seqMatch2 = candName.match(/(\d+)/)
        if (seqMatch1 && seqMatch2) {
          const num1 = parseInt(seqMatch1[1])
          const num2 = parseInt(seqMatch2[1])
          if (num2 === num1 + 1) suggestedType = 'sequel'
          else if (num2 === num1 - 1) suggestedType = 'prequel'
          else if (similarity > 0.8) suggestedType = 'series'
        }

        // Check for part/vol patterns
        if (/part\s*\d/i.test(baseName) || /vol\s*\d/i.test(baseName)) {
          suggestedType = 'series'
        }

        suggestions.push({
          id: candidate.id,
          filename: candidate.filename,
          thumbPath: candidate.thumbPath,
          confidence: similarity,
          suggestedType
        })
      }
    }

    return suggestions
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, limit)
  }

  private calculateSimilarity(str1: string, str2: string): number {
    const len1 = str1.length
    const len2 = str2.length
    const maxLen = Math.max(len1, len2)

    if (maxLen === 0) return 1

    // Levenshtein distance
    const matrix: number[][] = []
    for (let i = 0; i <= len1; i++) {
      matrix[i] = [i]
    }
    for (let j = 0; j <= len2; j++) {
      matrix[0][j] = j
    }

    for (let i = 1; i <= len1; i++) {
      for (let j = 1; j <= len2; j++) {
        const cost = str1[i - 1] === str2[j - 1] ? 0 : 1
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j - 1] + cost
        )
      }
    }

    const distance = matrix[len1][len2]
    return 1 - distance / maxLen
  }

  private isBidirectionalType(type: RelationshipType): boolean {
    return ['related', 'alternate', 'series', 'duplicate'].includes(type)
  }

  private generateId(): string {
    return `rel-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
  }
}

// Singleton
let instance: MediaRelationshipsService | null = null

export function getMediaRelationshipsService(db: DB): MediaRelationshipsService {
  if (!instance) {
    instance = new MediaRelationshipsService(db)
  }
  return instance
}
