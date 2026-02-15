// File: src/main/services/media-compare.ts
// Side-by-side media comparison service

import type { DB } from '../db'
import path from 'path'

export interface MediaCompareItem {
  id: string
  filename: string
  path: string
  type: string
  thumbPath?: string
  size: number
  sizeFormatted: string
  durationSec?: number
  durationFormatted?: string
  width?: number
  height?: number
  resolution?: string
  codec?: string
  frameRate?: number
  bitRate?: number
  addedAt: number
  rating?: number
  viewCount: number
  tags: string[]
  phash?: string
}

export interface ComparisonResult {
  items: MediaCompareItem[]
  differences: {
    size: { smallest: string; largest: string; diff: number }
    duration?: { shortest: string; longest: string; diff: number }
    quality?: { best: string; worst: string }
    rating?: { highest: string; lowest: string }
    age: { newest: string; oldest: string; diff: number }
    similarity?: number  // 0-100 for perceptual hash comparison
  }
  recommendations: {
    keepBest?: string     // ID of recommended "best" item to keep
    reason: string
    duplicateType?: 'exact' | 'similar' | 'different'
  }
}

export interface CompareOptions {
  includeMetadata?: boolean
  includeTags?: boolean
  calculateSimilarity?: boolean
}

export class MediaCompareService {
  constructor(private db: DB) {}

  /**
   * Compare multiple media items
   */
  async compare(mediaIds: string[], options?: CompareOptions): Promise<ComparisonResult> {
    const _includeMetadata = options?.includeMetadata ?? true // Reserved for future use
    const includeTags = options?.includeTags ?? true
    const calculateSimilarity = options?.calculateSimilarity ?? true

    // Get media data
    const items: MediaCompareItem[] = []

    for (const id of mediaIds) {
      const row = this.db.raw.prepare(`
        SELECT m.*, ms.rating, ms.viewCount
        FROM media m
        LEFT JOIN media_stats ms ON m.id = ms.mediaId
        WHERE m.id = ?
      `).get(id) as any

      if (!row) continue

      const item: MediaCompareItem = {
        id: row.id,
        filename: row.filename,
        path: row.path,
        type: row.type,
        thumbPath: row.thumbPath,
        size: row.size,
        sizeFormatted: this.formatBytes(row.size),
        addedAt: row.addedAt,
        rating: row.rating || 0,
        viewCount: row.viewCount || 0,
        tags: [],
        phash: row.phash
      }

      if (row.durationSec) {
        item.durationSec = row.durationSec
        item.durationFormatted = this.formatDuration(row.durationSec)
      }

      if (row.width && row.height) {
        item.width = row.width
        item.height = row.height
        item.resolution = `${row.width}x${row.height}`
      }

      if (includeTags) {
        const tags = this.db.raw.prepare(`
          SELECT t.name FROM tags t
          JOIN media_tags mt ON t.id = mt.tagId
          WHERE mt.mediaId = ?
        `).all(id) as Array<{ name: string }>
        item.tags = tags.map(t => t.name)
      }

      items.push(item)
    }

    if (items.length < 2) {
      throw new Error('Need at least 2 items to compare')
    }

    // Calculate differences
    const differences = this.calculateDifferences(items, calculateSimilarity)

    // Generate recommendations
    const recommendations = this.generateRecommendations(items, differences)

    return {
      items,
      differences,
      recommendations
    }
  }

  private calculateDifferences(items: MediaCompareItem[], calculateSimilarity: boolean): ComparisonResult['differences'] {
    // Size comparison
    const bySize = [...items].sort((a, b) => a.size - b.size)
    const sizeDiff = {
      smallest: bySize[0].id,
      largest: bySize[bySize.length - 1].id,
      diff: bySize[bySize.length - 1].size - bySize[0].size
    }

    // Duration comparison (videos only)
    let durationDiff: ComparisonResult['differences']['duration']
    const withDuration = items.filter(i => i.durationSec)
    if (withDuration.length >= 2) {
      const byDuration = [...withDuration].sort((a, b) => (a.durationSec || 0) - (b.durationSec || 0))
      durationDiff = {
        shortest: byDuration[0].id,
        longest: byDuration[byDuration.length - 1].id,
        diff: (byDuration[byDuration.length - 1].durationSec || 0) - (byDuration[0].durationSec || 0)
      }
    }

    // Quality comparison
    let qualityDiff: ComparisonResult['differences']['quality']
    const withResolution = items.filter(i => i.height)
    if (withResolution.length >= 2) {
      const byQuality = [...withResolution].sort((a, b) => (a.height || 0) - (b.height || 0))
      qualityDiff = {
        worst: byQuality[0].id,
        best: byQuality[byQuality.length - 1].id
      }
    }

    // Rating comparison
    let ratingDiff: ComparisonResult['differences']['rating']
    const withRating = items.filter(i => (i.rating || 0) > 0)
    if (withRating.length >= 2) {
      const byRating = [...withRating].sort((a, b) => (a.rating || 0) - (b.rating || 0))
      ratingDiff = {
        lowest: byRating[0].id,
        highest: byRating[byRating.length - 1].id
      }
    }

    // Age comparison
    const byAge = [...items].sort((a, b) => a.addedAt - b.addedAt)
    const ageDiff = {
      oldest: byAge[0].id,
      newest: byAge[byAge.length - 1].id,
      diff: byAge[byAge.length - 1].addedAt - byAge[0].addedAt
    }

    // Similarity calculation
    let similarity: number | undefined
    if (calculateSimilarity && items.length === 2 && items[0].phash && items[1].phash) {
      similarity = this.calculateSimilarity(items[0].phash, items[1].phash)
    }

    return {
      size: sizeDiff,
      duration: durationDiff,
      quality: qualityDiff,
      rating: ratingDiff,
      age: ageDiff,
      similarity
    }
  }

  private generateRecommendations(
    items: MediaCompareItem[],
    differences: ComparisonResult['differences']
  ): ComparisonResult['recommendations'] {
    // Determine duplicate type
    let duplicateType: 'exact' | 'similar' | 'different' = 'different'
    if (differences.similarity !== undefined) {
      if (differences.similarity >= 98) duplicateType = 'exact'
      else if (differences.similarity >= 80) duplicateType = 'similar'
    }

    // Score each item
    const scores: Map<string, number> = new Map()
    for (const item of items) {
      let score = 0

      // Higher quality = better
      if (item.height) score += item.height / 100

      // More tags = better organized
      score += item.tags.length * 5

      // Higher rating = better
      score += (item.rating || 0) * 20

      // More views = more valuable
      score += Math.log10(item.viewCount + 1) * 10

      // Larger file might mean better quality (for same resolution)
      score += Math.log10(item.size) * 2

      scores.set(item.id, score)
    }

    // Find best item
    let bestId = items[0].id
    let bestScore = scores.get(items[0].id) || 0
    for (const item of items) {
      const score = scores.get(item.id) || 0
      if (score > bestScore) {
        bestScore = score
        bestId = item.id
      }
    }

    const bestItem = items.find(i => i.id === bestId)!

    // Generate reason
    const reasons: string[] = []
    if (differences.quality?.best === bestId) {
      reasons.push('highest resolution')
    }
    if (differences.rating?.highest === bestId) {
      reasons.push('highest rated')
    }
    if (bestItem.tags.length > 0) {
      const avgTags = items.reduce((s, i) => s + i.tags.length, 0) / items.length
      if (bestItem.tags.length > avgTags) {
        reasons.push('better organized with tags')
      }
    }

    return {
      keepBest: bestId,
      reason: reasons.length > 0
        ? `Recommended to keep: ${reasons.join(', ')}`
        : 'Similar quality, any can be kept',
      duplicateType
    }
  }

  /**
   * Calculate perceptual hash similarity
   */
  private calculateSimilarity(hash1: string, hash2: string): number {
    if (!hash1 || !hash2 || hash1.length !== hash2.length) {
      return 0
    }

    let distance = 0
    for (let i = 0; i < hash1.length; i++) {
      const xor = parseInt(hash1[i], 16) ^ parseInt(hash2[i], 16)
      let bits = 0
      let n = xor
      while (n) {
        bits += n & 1
        n >>= 1
      }
      distance += bits
    }

    const maxDistance = hash1.length * 4
    return Math.round(((maxDistance - distance) / maxDistance) * 100 * 10) / 10
  }

  /**
   * Quick compare two items
   */
  quickCompare(id1: string, id2: string): {
    areSimilar: boolean
    similarity: number
    sameResolution: boolean
    sizeDiff: number
    durationDiff: number
  } {
    const item1 = this.db.raw.prepare(`
      SELECT size, durationSec, width, height, phash FROM media WHERE id = ?
    `).get(id1) as any

    const item2 = this.db.raw.prepare(`
      SELECT size, durationSec, width, height, phash FROM media WHERE id = ?
    `).get(id2) as any

    if (!item1 || !item2) {
      throw new Error('One or both items not found')
    }

    const similarity = item1.phash && item2.phash
      ? this.calculateSimilarity(item1.phash, item2.phash)
      : 0

    return {
      areSimilar: similarity >= 80,
      similarity,
      sameResolution: item1.width === item2.width && item1.height === item2.height,
      sizeDiff: Math.abs(item1.size - item2.size),
      durationDiff: Math.abs((item1.durationSec || 0) - (item2.durationSec || 0))
    }
  }

  /**
   * Find potential duplicates for comparison
   */
  findDuplicateCandidates(mediaId: string, limit = 10): Array<{
    id: string
    filename: string
    similarity: number
    reason: 'hash' | 'phash' | 'filename' | 'size'
  }> {
    const candidates: Array<{
      id: string
      filename: string
      similarity: number
      reason: 'hash' | 'phash' | 'filename' | 'size'
    }> = []

    const source = this.db.raw.prepare(`
      SELECT filename, size, phash, hashSha256 FROM media WHERE id = ?
    `).get(mediaId) as any

    if (!source) return []

    // Exact hash match
    if (source.hashSha256) {
      const hashMatches = this.db.raw.prepare(`
        SELECT id, filename FROM media
        WHERE hashSha256 = ? AND id != ?
        LIMIT ?
      `).all(source.hashSha256, mediaId, limit) as any[]

      for (const match of hashMatches) {
        candidates.push({
          id: match.id,
          filename: match.filename,
          similarity: 100,
          reason: 'hash'
        })
      }
    }

    // Perceptual hash similarity
    if (source.phash) {
      const phashCandidates = this.db.raw.prepare(`
        SELECT id, filename, phash FROM media
        WHERE phash IS NOT NULL AND id != ?
      `).all(mediaId) as any[]

      for (const candidate of phashCandidates) {
        const similarity = this.calculateSimilarity(source.phash, candidate.phash)
        if (similarity >= 70 && !candidates.find(c => c.id === candidate.id)) {
          candidates.push({
            id: candidate.id,
            filename: candidate.filename,
            similarity,
            reason: 'phash'
          })
        }
      }
    }

    // Similar filename
    const baseName = path.parse(source.filename).name.toLowerCase()
    const filenameMatches = this.db.raw.prepare(`
      SELECT id, filename FROM media
      WHERE LOWER(filename) LIKE ? AND id != ?
      LIMIT ?
    `).all(`%${baseName.slice(0, 10)}%`, mediaId, limit) as any[]

    for (const match of filenameMatches) {
      if (!candidates.find(c => c.id === match.id)) {
        candidates.push({
          id: match.id,
          filename: match.filename,
          similarity: 50,
          reason: 'filename'
        })
      }
    }

    // Sort by similarity
    candidates.sort((a, b) => b.similarity - a.similarity)

    return candidates.slice(0, limit)
  }

  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  private formatDuration(seconds: number): string {
    const h = Math.floor(seconds / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    const s = Math.floor(seconds % 60)

    if (h > 0) {
      return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
    }
    return `${m}:${s.toString().padStart(2, '0')}`
  }
}

// Singleton
let instance: MediaCompareService | null = null

export function getMediaCompareService(db: DB): MediaCompareService {
  if (!instance) {
    instance = new MediaCompareService(db)
  }
  return instance
}
