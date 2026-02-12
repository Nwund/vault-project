// File: src/main/services/duplicates-finder.ts
// Find and manage duplicate media files

import type { DB } from '../db'
import fs from 'node:fs'
import crypto from 'node:crypto'
import path from 'node:path'

export interface DuplicateGroup {
  hash: string
  type: 'exact' | 'size' | 'name' | 'similar'
  mediaIds: string[]
  count: number
  totalSize: number
  savingsIfReduced: number
}

export interface DuplicateMedia {
  id: string
  filename: string
  path: string
  thumbPath?: string
  size: number
  addedAt: number
  rating?: number
  viewCount: number
}

export interface DuplicateScanResult {
  groups: DuplicateGroup[]
  totalDuplicates: number
  potentialSavings: number
  scanTime: number
}

export interface DuplicateResolution {
  keep: string
  remove: string[]
  action: 'delete' | 'move' | 'mark'
}

export class DuplicatesFinderService {
  constructor(private db: DB) {
    this.ensureTable()
  }

  private ensureTable(): void {
    // Store computed hashes
    this.db.raw.exec(`
      CREATE TABLE IF NOT EXISTS media_hashes (
        mediaId TEXT PRIMARY KEY,
        fileHash TEXT,
        sizeHash TEXT,
        perceptualHash TEXT,
        computedAt INTEGER,
        FOREIGN KEY (mediaId) REFERENCES media(id) ON DELETE CASCADE
      )
    `)

    this.db.raw.exec(`
      CREATE INDEX IF NOT EXISTS idx_hash_file ON media_hashes(fileHash)
    `)
    this.db.raw.exec(`
      CREATE INDEX IF NOT EXISTS idx_hash_size ON media_hashes(sizeHash)
    `)
  }

  /**
   * Find exact duplicates (by file hash)
   */
  async findExactDuplicates(): Promise<DuplicateScanResult> {
    const startTime = Date.now()

    // First, compute hashes for files that don't have them
    await this.computeMissingHashes()

    // Find groups with matching hashes
    const groups = this.db.raw.prepare(`
      SELECT fileHash, GROUP_CONCAT(mediaId) as mediaIds, COUNT(*) as count
      FROM media_hashes
      WHERE fileHash IS NOT NULL
      GROUP BY fileHash
      HAVING count > 1
    `).all() as Array<{ fileHash: string; mediaIds: string; count: number }>

    const duplicateGroups: DuplicateGroup[] = []
    let totalDuplicates = 0
    let potentialSavings = 0

    for (const group of groups) {
      const mediaIds = group.mediaIds.split(',')
      const media = this.getMediaDetails(mediaIds)

      const totalSize = media.reduce((sum, m) => sum + m.size, 0)
      const savings = totalSize - (media[0]?.size || 0) // Save all but one

      duplicateGroups.push({
        hash: group.fileHash,
        type: 'exact',
        mediaIds,
        count: group.count,
        totalSize,
        savingsIfReduced: savings
      })

      totalDuplicates += group.count - 1
      potentialSavings += savings
    }

    return {
      groups: duplicateGroups,
      totalDuplicates,
      potentialSavings,
      scanTime: Date.now() - startTime
    }
  }

  /**
   * Find duplicates by file size (quick scan)
   */
  findSizeDuplicates(): DuplicateScanResult {
    const startTime = Date.now()

    const groups = this.db.raw.prepare(`
      SELECT size, GROUP_CONCAT(id) as mediaIds, COUNT(*) as count
      FROM media
      WHERE size > 0
      GROUP BY size
      HAVING count > 1
    `).all() as Array<{ size: number; mediaIds: string; count: number }>

    const duplicateGroups: DuplicateGroup[] = []
    let totalDuplicates = 0
    let potentialSavings = 0

    for (const group of groups) {
      const mediaIds = group.mediaIds.split(',')
      const totalSize = group.size * group.count
      const savings = totalSize - group.size

      duplicateGroups.push({
        hash: `size-${group.size}`,
        type: 'size',
        mediaIds,
        count: group.count,
        totalSize,
        savingsIfReduced: savings
      })

      totalDuplicates += group.count - 1
      potentialSavings += savings
    }

    return {
      groups: duplicateGroups,
      totalDuplicates,
      potentialSavings,
      scanTime: Date.now() - startTime
    }
  }

  /**
   * Find duplicates by filename
   */
  findNameDuplicates(): DuplicateScanResult {
    const startTime = Date.now()

    const groups = this.db.raw.prepare(`
      SELECT LOWER(filename) as lowername, GROUP_CONCAT(id) as mediaIds, COUNT(*) as count
      FROM media
      GROUP BY lowername
      HAVING count > 1
    `).all() as Array<{ lowername: string; mediaIds: string; count: number }>

    const duplicateGroups: DuplicateGroup[] = []
    let totalDuplicates = 0
    let potentialSavings = 0

    for (const group of groups) {
      const mediaIds = group.mediaIds.split(',')
      const media = this.getMediaDetails(mediaIds)
      const totalSize = media.reduce((sum, m) => sum + m.size, 0)
      const savings = totalSize - Math.max(...media.map(m => m.size))

      duplicateGroups.push({
        hash: `name-${group.lowername}`,
        type: 'name',
        mediaIds,
        count: group.count,
        totalSize,
        savingsIfReduced: savings
      })

      totalDuplicates += group.count - 1
      potentialSavings += savings
    }

    return {
      groups: duplicateGroups,
      totalDuplicates,
      potentialSavings,
      scanTime: Date.now() - startTime
    }
  }

  /**
   * Get duplicate details for a group
   */
  getDuplicateGroupDetails(mediaIds: string[]): DuplicateMedia[] {
    return this.getMediaDetails(mediaIds)
  }

  /**
   * Resolve duplicates (keep one, handle others)
   */
  resolveDuplicates(resolution: DuplicateResolution): { success: boolean; error?: string; removedCount: number } {
    let removedCount = 0

    for (const mediaId of resolution.remove) {
      try {
        const media = this.db.raw.prepare('SELECT path FROM media WHERE id = ?').get(mediaId) as { path: string } | undefined
        if (!media) continue

        if (resolution.action === 'delete') {
          // Delete the file
          if (fs.existsSync(media.path)) {
            fs.unlinkSync(media.path)
          }
          // Remove from database
          this.db.raw.prepare('DELETE FROM media WHERE id = ?').run(mediaId)
          removedCount++
        } else if (resolution.action === 'move') {
          // Move to a duplicates folder (create if needed)
          const dupFolder = path.join(path.dirname(media.path), '_duplicates')
          if (!fs.existsSync(dupFolder)) {
            fs.mkdirSync(dupFolder, { recursive: true })
          }
          const newPath = path.join(dupFolder, path.basename(media.path))
          fs.renameSync(media.path, newPath)
          // Update path in database
          this.db.raw.prepare('UPDATE media SET path = ? WHERE id = ?').run(newPath, mediaId)
          removedCount++
        } else if (resolution.action === 'mark') {
          // Just mark as duplicate (using relationships service if available)
          // For now, add a tag
          const dupTag = this.db.raw.prepare('SELECT id FROM tags WHERE name = ?').get('duplicate') as { id: string } | undefined
          if (dupTag) {
            try {
              this.db.raw.prepare('INSERT OR IGNORE INTO media_tags (mediaId, tagId) VALUES (?, ?)').run(mediaId, dupTag.id)
            } catch {
              // Ignore if already tagged
            }
          }
          removedCount++
        }
      } catch (e: any) {
        return { success: false, error: e.message, removedCount }
      }
    }

    return { success: true, removedCount }
  }

  /**
   * Auto-suggest which to keep (by rating, views, added date)
   */
  suggestKeep(mediaIds: string[]): { keepId: string; reason: string } {
    const media = this.getMediaDetails(mediaIds)

    // Priority: highest rating, most views, oldest (first added)
    media.sort((a, b) => {
      // First by rating
      const ratingDiff = (b.rating || 0) - (a.rating || 0)
      if (ratingDiff !== 0) return ratingDiff

      // Then by view count
      const viewDiff = b.viewCount - a.viewCount
      if (viewDiff !== 0) return viewDiff

      // Then by added date (keep oldest)
      return a.addedAt - b.addedAt
    })

    const keepId = media[0].id
    let reason = 'Selected based on: '
    if ((media[0].rating || 0) > 0) reason += 'highest rating'
    else if (media[0].viewCount > 0) reason += 'most viewed'
    else reason += 'first added'

    return { keepId, reason }
  }

  /**
   * Get statistics
   */
  getStats(): {
    totalMedia: number
    hashedMedia: number
    exactDuplicates: number
    sizeDuplicates: number
    nameDuplicates: number
    estimatedSavings: number
  } {
    const total = this.db.raw.prepare('SELECT COUNT(*) as count FROM media').get() as { count: number }
    const hashed = this.db.raw.prepare('SELECT COUNT(*) as count FROM media_hashes WHERE fileHash IS NOT NULL').get() as { count: number }

    const exactDups = this.db.raw.prepare(`
      SELECT COUNT(*) as count FROM (
        SELECT fileHash FROM media_hashes
        WHERE fileHash IS NOT NULL
        GROUP BY fileHash
        HAVING COUNT(*) > 1
      )
    `).get() as { count: number }

    const sizeDups = this.db.raw.prepare(`
      SELECT COUNT(*) as count FROM (
        SELECT size FROM media
        WHERE size > 0
        GROUP BY size
        HAVING COUNT(*) > 1
      )
    `).get() as { count: number }

    const nameDups = this.db.raw.prepare(`
      SELECT COUNT(*) as count FROM (
        SELECT LOWER(filename) FROM media
        GROUP BY LOWER(filename)
        HAVING COUNT(*) > 1
      )
    `).get() as { count: number }

    // Estimate savings from exact duplicates
    const savings = this.db.raw.prepare(`
      SELECT COALESCE(SUM(totalSavings), 0) as total FROM (
        SELECT SUM(m.size) - MIN(m.size) as totalSavings
        FROM media_hashes h
        JOIN media m ON h.mediaId = m.id
        WHERE h.fileHash IS NOT NULL
        GROUP BY h.fileHash
        HAVING COUNT(*) > 1
      )
    `).get() as { total: number }

    return {
      totalMedia: total.count,
      hashedMedia: hashed.count,
      exactDuplicates: exactDups.count,
      sizeDuplicates: sizeDups.count,
      nameDuplicates: nameDups.count,
      estimatedSavings: savings.total
    }
  }

  /**
   * Compute hash for a single file
   */
  async computeFileHash(mediaId: string): Promise<string | null> {
    const media = this.db.raw.prepare('SELECT path FROM media WHERE id = ?').get(mediaId) as { path: string } | undefined
    if (!media || !fs.existsSync(media.path)) return null

    try {
      const hash = await this.hashFile(media.path)

      this.db.raw.prepare(`
        INSERT OR REPLACE INTO media_hashes (mediaId, fileHash, computedAt)
        VALUES (?, ?, ?)
      `).run(mediaId, hash, Date.now())

      return hash
    } catch {
      return null
    }
  }

  /**
   * Clear all hashes (force recompute)
   */
  clearHashes(): number {
    const result = this.db.raw.prepare('DELETE FROM media_hashes').run()
    return result.changes
  }

  /**
   * Find similar files for a specific media
   */
  findSimilarTo(mediaId: string): DuplicateMedia[] {
    const media = this.db.raw.prepare('SELECT filename, size FROM media WHERE id = ?').get(mediaId) as { filename: string; size: number } | undefined
    if (!media) return []

    const similar: DuplicateMedia[] = []

    // Find by similar size (within 5%)
    const sizeTolerance = media.size * 0.05
    const sizeMatches = this.db.raw.prepare(`
      SELECT id FROM media
      WHERE id != ? AND ABS(size - ?) < ?
    `).all(mediaId, media.size, sizeTolerance) as Array<{ id: string }>

    for (const match of sizeMatches) {
      const details = this.getMediaDetails([match.id])
      similar.push(...details)
    }

    // Find by similar name
    const baseName = media.filename.replace(/\.[^.]+$/, '').toLowerCase()
    const nameMatches = this.db.raw.prepare(`
      SELECT id FROM media
      WHERE id != ? AND LOWER(filename) LIKE ?
    `).all(mediaId, `%${baseName.slice(0, Math.min(baseName.length, 20))}%`) as Array<{ id: string }>

    for (const match of nameMatches) {
      if (!similar.find(s => s.id === match.id)) {
        const details = this.getMediaDetails([match.id])
        similar.push(...details)
      }
    }

    return similar
  }

  private async computeMissingHashes(): Promise<void> {
    // Get media without hashes (limit to avoid long operations)
    const missing = this.db.raw.prepare(`
      SELECT m.id, m.path FROM media m
      LEFT JOIN media_hashes h ON m.id = h.mediaId
      WHERE h.fileHash IS NULL AND m.size < 100000000
      LIMIT 100
    `).all() as Array<{ id: string; path: string }>

    for (const media of missing) {
      await this.computeFileHash(media.id)
    }
  }

  private async hashFile(filePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash('md5')
      const stream = fs.createReadStream(filePath)

      stream.on('data', data => hash.update(data))
      stream.on('end', () => resolve(hash.digest('hex')))
      stream.on('error', reject)
    })
  }

  private getMediaDetails(mediaIds: string[]): DuplicateMedia[] {
    if (mediaIds.length === 0) return []

    const placeholders = mediaIds.map(() => '?').join(',')
    const rows = this.db.raw.prepare(`
      SELECT m.id, m.filename, m.path, m.thumbPath, m.size, m.addedAt,
             ms.rating, COALESCE(ms.playCount, 0) as viewCount
      FROM media m
      LEFT JOIN media_stats ms ON m.id = ms.mediaId
      WHERE m.id IN (${placeholders})
    `).all(...mediaIds) as any[]

    return rows.map(row => ({
      id: row.id,
      filename: row.filename,
      path: row.path,
      thumbPath: row.thumbPath,
      size: row.size,
      addedAt: row.addedAt,
      rating: row.rating,
      viewCount: row.viewCount
    }))
  }
}

// Singleton
let instance: DuplicatesFinderService | null = null

export function getDuplicatesFinderService(db: DB): DuplicatesFinderService {
  if (!instance) {
    instance = new DuplicatesFinderService(db)
  }
  return instance
}
