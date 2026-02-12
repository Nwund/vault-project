// File: src/main/services/similar-content.ts
// Find visually similar content using perceptual hashing

import type { DB } from '../db'

export interface SimilarMatch {
  mediaId: string
  filename: string
  thumbPath: string | null
  type: string
  similarity: number  // 0-100 percentage
  matchType: 'exact' | 'very_similar' | 'similar' | 'somewhat_similar'
}

export interface SimilarityGroup {
  groupId: string
  items: SimilarMatch[]
  count: number
}

export class SimilarContentService {
  constructor(private db: DB) {}

  /**
   * Find media similar to a given item
   */
  findSimilar(mediaId: string, options?: {
    minSimilarity?: number
    limit?: number
    sameTypeOnly?: boolean
  }): SimilarMatch[] {
    const minSim = options?.minSimilarity ?? 70
    const limit = options?.limit ?? 20
    const sameTypeOnly = options?.sameTypeOnly ?? false

    // Get the target media's phash
    const target = this.db.raw.prepare('SELECT phash, type FROM media WHERE id = ?').get(mediaId) as { phash: string | null; type: string } | undefined

    if (!target?.phash) {
      return []
    }

    // Query all media with phashes
    let query = 'SELECT id, filename, thumbPath, type, phash FROM media WHERE phash IS NOT NULL AND id != ?'
    const params: any[] = [mediaId]

    if (sameTypeOnly) {
      query += ' AND type = ?'
      params.push(target.type)
    }

    const candidates = this.db.raw.prepare(query).all(...params) as Array<{
      id: string
      filename: string
      thumbPath: string | null
      type: string
      phash: string
    }>

    const matches: SimilarMatch[] = []

    for (const candidate of candidates) {
      const similarity = this.calculateSimilarity(target.phash, candidate.phash)

      if (similarity >= minSim) {
        matches.push({
          mediaId: candidate.id,
          filename: candidate.filename,
          thumbPath: candidate.thumbPath,
          type: candidate.type,
          similarity,
          matchType: this.getMatchType(similarity)
        })
      }
    }

    // Sort by similarity descending
    matches.sort((a, b) => b.similarity - a.similarity)

    return matches.slice(0, limit)
  }

  /**
   * Find all groups of similar content in the library
   */
  findAllSimilarGroups(options?: {
    minSimilarity?: number
    minGroupSize?: number
  }): SimilarityGroup[] {
    const minSim = options?.minSimilarity ?? 85
    const minGroupSize = options?.minGroupSize ?? 2

    // Get all media with phashes
    const allMedia = this.db.raw.prepare(`
      SELECT id, filename, thumbPath, type, phash
      FROM media WHERE phash IS NOT NULL
    `).all() as Array<{
      id: string
      filename: string
      thumbPath: string | null
      type: string
      phash: string
    }>

    const groups: Map<string, Set<string>> = new Map()
    const processed = new Set<string>()

    for (let i = 0; i < allMedia.length; i++) {
      if (processed.has(allMedia[i].id)) continue

      const group = new Set<string>([allMedia[i].id])

      for (let j = i + 1; j < allMedia.length; j++) {
        if (processed.has(allMedia[j].id)) continue

        const similarity = this.calculateSimilarity(allMedia[i].phash, allMedia[j].phash)

        if (similarity >= minSim) {
          group.add(allMedia[j].id)
        }
      }

      if (group.size >= minGroupSize) {
        const groupId = `group-${i}`
        groups.set(groupId, group)
        for (const id of group) {
          processed.add(id)
        }
      }
    }

    // Build result
    const result: SimilarityGroup[] = []

    for (const [groupId, mediaIds] of groups) {
      const items: SimilarMatch[] = []

      for (const id of mediaIds) {
        const media = allMedia.find(m => m.id === id)
        if (media) {
          items.push({
            mediaId: media.id,
            filename: media.filename,
            thumbPath: media.thumbPath,
            type: media.type,
            similarity: 100, // Within group
            matchType: 'very_similar'
          })
        }
      }

      result.push({
        groupId,
        items,
        count: items.length
      })
    }

    // Sort by group size descending
    result.sort((a, b) => b.count - a.count)

    return result
  }

  /**
   * Find exact duplicates (by file hash)
   */
  findExactDuplicates(): SimilarityGroup[] {
    const groups = this.db.raw.prepare(`
      SELECT hashSha256, GROUP_CONCAT(id) as ids, COUNT(*) as count
      FROM media
      WHERE hashSha256 IS NOT NULL
      GROUP BY hashSha256
      HAVING count > 1
      ORDER BY count DESC
    `).all() as Array<{ hashSha256: string; ids: string; count: number }>

    const result: SimilarityGroup[] = []

    for (const group of groups) {
      const mediaIds = group.ids.split(',')
      const items: SimilarMatch[] = []

      for (const id of mediaIds) {
        const media = this.db.raw.prepare('SELECT id, filename, thumbPath, type FROM media WHERE id = ?').get(id) as any
        if (media) {
          items.push({
            mediaId: media.id,
            filename: media.filename,
            thumbPath: media.thumbPath,
            type: media.type,
            similarity: 100,
            matchType: 'exact'
          })
        }
      }

      result.push({
        groupId: `dup-${group.hashSha256.slice(0, 8)}`,
        items,
        count: items.length
      })
    }

    return result
  }

  /**
   * Calculate perceptual hash similarity (Hamming distance based)
   */
  private calculateSimilarity(hash1: string, hash2: string): number {
    if (!hash1 || !hash2 || hash1.length !== hash2.length) {
      return 0
    }

    // Convert hex hashes to binary and calculate Hamming distance
    let distance = 0
    const len = hash1.length

    for (let i = 0; i < len; i++) {
      const xor = parseInt(hash1[i], 16) ^ parseInt(hash2[i], 16)
      // Count bits set in xor
      distance += this.countBits(xor)
    }

    // Convert distance to similarity percentage
    // Max distance for a hex string of length N is N * 4 (4 bits per hex char)
    const maxDistance = len * 4
    const similarity = ((maxDistance - distance) / maxDistance) * 100

    return Math.round(similarity * 10) / 10
  }

  private countBits(n: number): number {
    let count = 0
    while (n) {
      count += n & 1
      n >>= 1
    }
    return count
  }

  private getMatchType(similarity: number): SimilarMatch['matchType'] {
    if (similarity >= 98) return 'exact'
    if (similarity >= 90) return 'very_similar'
    if (similarity >= 80) return 'similar'
    return 'somewhat_similar'
  }

  /**
   * Get recommendation: "More like this"
   */
  getMoreLikeThis(mediaId: string, limit = 10): SimilarMatch[] {
    // First try perceptual similarity
    const similar = this.findSimilar(mediaId, { minSimilarity: 60, limit: limit * 2 })

    if (similar.length >= limit) {
      return similar.slice(0, limit)
    }

    // Supplement with tag-based similarity
    const tagBased = this.findByTagSimilarity(mediaId, limit - similar.length)
    const existingIds = new Set(similar.map(s => s.mediaId))

    for (const match of tagBased) {
      if (!existingIds.has(match.mediaId)) {
        similar.push(match)
      }
    }

    return similar.slice(0, limit)
  }

  /**
   * Find similar by shared tags
   */
  private findByTagSimilarity(mediaId: string, limit: number): SimilarMatch[] {
    const rows = this.db.raw.prepare(`
      SELECT m.id, m.filename, m.thumbPath, m.type,
             COUNT(DISTINCT mt2.tagId) as sharedTags
      FROM media m
      JOIN media_tags mt2 ON m.id = mt2.mediaId
      WHERE mt2.tagId IN (
        SELECT tagId FROM media_tags WHERE mediaId = ?
      )
      AND m.id != ?
      GROUP BY m.id
      ORDER BY sharedTags DESC
      LIMIT ?
    `).all(mediaId, mediaId, limit) as Array<{
      id: string
      filename: string
      thumbPath: string | null
      type: string
      sharedTags: number
    }>

    return rows.map(row => ({
      mediaId: row.id,
      filename: row.filename,
      thumbPath: row.thumbPath,
      type: row.type,
      similarity: Math.min(row.sharedTags * 15, 90), // Convert tag count to similarity
      matchType: 'similar' as const
    }))
  }

  /**
   * Get total duplicate storage that could be freed
   */
  getDuplicateStats(): {
    duplicateGroups: number
    totalDuplicates: number
    potentialSavingsBytes: number
  } {
    const duplicates = this.findExactDuplicates()

    let totalDuplicates = 0
    let potentialSavings = 0

    for (const group of duplicates) {
      // Count all except one (the "original" to keep)
      totalDuplicates += group.count - 1

      // Get size of one item
      const mediaId = group.items[0]?.mediaId
      if (mediaId) {
        const size = this.db.raw.prepare('SELECT size FROM media WHERE id = ?').get(mediaId) as { size: number } | undefined
        if (size) {
          potentialSavings += size.size * (group.count - 1)
        }
      }
    }

    return {
      duplicateGroups: duplicates.length,
      totalDuplicates,
      potentialSavingsBytes: potentialSavings
    }
  }
}

// Singleton
let instance: SimilarContentService | null = null

export function getSimilarContentService(db: DB): SimilarContentService {
  if (!instance) {
    instance = new SimilarContentService(db)
  }
  return instance
}
