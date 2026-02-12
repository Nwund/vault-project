// File: src/main/services/batch-operations.ts
// Batch operations service for bulk media actions

import type { DB } from '../db'
import path from 'node:path'
import fs from 'node:fs'
import { nanoid } from 'nanoid'

export interface BatchOperationResult {
  success: number
  failed: number
  errors: string[]
  totalTime: number
}

export interface BatchProgress {
  current: number
  total: number
  currentItem: string
  operation: string
}

type ProgressCallback = (progress: BatchProgress) => void

export class BatchOperationsService {
  constructor(private db: DB) {}

  /**
   * Add tags to multiple media items
   */
  async batchAddTags(
    mediaIds: string[],
    tagNames: string[],
    onProgress?: ProgressCallback
  ): Promise<BatchOperationResult> {
    const start = Date.now()
    let success = 0
    let failed = 0
    const errors: string[] = []

    // Ensure tags exist
    const tagIds = new Map<string, string>()
    for (const name of tagNames) {
      const existing = this.db.raw.prepare('SELECT id FROM tags WHERE name = ?').get(name) as { id: string } | undefined
      if (existing) {
        tagIds.set(name, existing.id)
      } else {
        const id = nanoid()
        this.db.raw.prepare('INSERT INTO tags (id, name) VALUES (?, ?)').run(id, name)
        tagIds.set(name, id)
      }
    }

    const linkStmt = this.db.raw.prepare('INSERT OR IGNORE INTO media_tags (mediaId, tagId) VALUES (?, ?)')

    for (let i = 0; i < mediaIds.length; i++) {
      const mediaId = mediaIds[i]
      onProgress?.({ current: i + 1, total: mediaIds.length, currentItem: mediaId, operation: 'Adding tags' })

      try {
        for (const tagId of tagIds.values()) {
          linkStmt.run(mediaId, tagId)
        }
        success++
      } catch (e: any) {
        failed++
        errors.push(`${mediaId}: ${e.message}`)
      }
    }

    return { success, failed, errors, totalTime: Date.now() - start }
  }

  /**
   * Remove tags from multiple media items
   */
  async batchRemoveTags(
    mediaIds: string[],
    tagNames: string[],
    onProgress?: ProgressCallback
  ): Promise<BatchOperationResult> {
    const start = Date.now()
    let success = 0
    let failed = 0
    const errors: string[] = []

    // Get tag IDs
    const tagIds: string[] = []
    for (const name of tagNames) {
      const tag = this.db.raw.prepare('SELECT id FROM tags WHERE name = ?').get(name) as { id: string } | undefined
      if (tag) tagIds.push(tag.id)
    }

    if (tagIds.length === 0) {
      return { success: 0, failed: 0, errors: [], totalTime: 0 }
    }

    const unlinkStmt = this.db.raw.prepare('DELETE FROM media_tags WHERE mediaId = ? AND tagId = ?')

    for (let i = 0; i < mediaIds.length; i++) {
      const mediaId = mediaIds[i]
      onProgress?.({ current: i + 1, total: mediaIds.length, currentItem: mediaId, operation: 'Removing tags' })

      try {
        for (const tagId of tagIds) {
          unlinkStmt.run(mediaId, tagId)
        }
        success++
      } catch (e: any) {
        failed++
        errors.push(`${mediaId}: ${e.message}`)
      }
    }

    return { success, failed, errors, totalTime: Date.now() - start }
  }

  /**
   * Set rating for multiple media items
   */
  async batchSetRating(
    mediaIds: string[],
    rating: number,
    onProgress?: ProgressCallback
  ): Promise<BatchOperationResult> {
    const start = Date.now()
    let success = 0
    let failed = 0
    const errors: string[] = []

    const now = Date.now()
    const upsertStmt = this.db.raw.prepare(`
      INSERT INTO media_stats (mediaId, views, lastViewedAt, rating, oCount, updatedAt)
      VALUES (?, 0, NULL, ?, 0, ?)
      ON CONFLICT(mediaId) DO UPDATE SET rating = ?, updatedAt = ?
    `)

    for (let i = 0; i < mediaIds.length; i++) {
      const mediaId = mediaIds[i]
      onProgress?.({ current: i + 1, total: mediaIds.length, currentItem: mediaId, operation: 'Setting rating' })

      try {
        upsertStmt.run(mediaId, rating, now, rating, now)
        success++
      } catch (e: any) {
        failed++
        errors.push(`${mediaId}: ${e.message}`)
      }
    }

    return { success, failed, errors, totalTime: Date.now() - start }
  }

  /**
   * Delete multiple media items (files and database entries)
   */
  async batchDelete(
    mediaIds: string[],
    deleteFiles: boolean = false,
    onProgress?: ProgressCallback
  ): Promise<BatchOperationResult> {
    const start = Date.now()
    let success = 0
    let failed = 0
    const errors: string[] = []

    for (let i = 0; i < mediaIds.length; i++) {
      const mediaId = mediaIds[i]
      onProgress?.({ current: i + 1, total: mediaIds.length, currentItem: mediaId, operation: 'Deleting' })

      try {
        const media = this.db.raw.prepare('SELECT path, thumbPath FROM media WHERE id = ?').get(mediaId) as { path: string; thumbPath?: string } | undefined

        if (media && deleteFiles) {
          // Delete actual file
          if (fs.existsSync(media.path)) {
            fs.unlinkSync(media.path)
          }
          // Delete thumbnail
          if (media.thumbPath && fs.existsSync(media.thumbPath)) {
            fs.unlinkSync(media.thumbPath)
          }
        }

        // Delete from database
        this.db.raw.prepare('DELETE FROM media_tags WHERE mediaId = ?').run(mediaId)
        this.db.raw.prepare('DELETE FROM media_stats WHERE mediaId = ?').run(mediaId)
        this.db.raw.prepare('DELETE FROM playlist_items WHERE mediaId = ?').run(mediaId)
        this.db.raw.prepare('DELETE FROM markers WHERE mediaId = ?').run(mediaId)
        this.db.raw.prepare('DELETE FROM media WHERE id = ?').run(mediaId)

        success++
      } catch (e: any) {
        failed++
        errors.push(`${mediaId}: ${e.message}`)
      }
    }

    return { success, failed, errors, totalTime: Date.now() - start }
  }

  /**
   * Add multiple media items to a playlist
   */
  async batchAddToPlaylist(
    mediaIds: string[],
    playlistId: string,
    onProgress?: ProgressCallback
  ): Promise<BatchOperationResult> {
    const start = Date.now()
    let success = 0
    let failed = 0
    const errors: string[] = []

    // Get current max position
    const maxPos = this.db.raw.prepare('SELECT MAX(position) as max FROM playlist_items WHERE playlistId = ?').get(playlistId) as { max: number | null }
    let position = (maxPos?.max ?? -1) + 1

    const insertStmt = this.db.raw.prepare(`
      INSERT OR IGNORE INTO playlist_items (id, playlistId, mediaId, position, addedAt)
      VALUES (?, ?, ?, ?, ?)
    `)

    const now = Date.now()

    for (let i = 0; i < mediaIds.length; i++) {
      const mediaId = mediaIds[i]
      onProgress?.({ current: i + 1, total: mediaIds.length, currentItem: mediaId, operation: 'Adding to playlist' })

      try {
        const result = insertStmt.run(nanoid(), playlistId, mediaId, position++, now)
        if (result.changes > 0) {
          success++
        } else {
          // Already in playlist
          failed++
          errors.push(`${mediaId}: Already in playlist`)
        }
      } catch (e: any) {
        failed++
        errors.push(`${mediaId}: ${e.message}`)
      }
    }

    // Update playlist timestamp
    this.db.raw.prepare('UPDATE playlists SET updatedAt = ? WHERE id = ?').run(now, playlistId)

    return { success, failed, errors, totalTime: Date.now() - start }
  }

  /**
   * Remove multiple media items from a playlist
   */
  async batchRemoveFromPlaylist(
    mediaIds: string[],
    playlistId: string,
    onProgress?: ProgressCallback
  ): Promise<BatchOperationResult> {
    const start = Date.now()
    let success = 0
    let failed = 0
    const errors: string[] = []

    const deleteStmt = this.db.raw.prepare('DELETE FROM playlist_items WHERE playlistId = ? AND mediaId = ?')

    for (let i = 0; i < mediaIds.length; i++) {
      const mediaId = mediaIds[i]
      onProgress?.({ current: i + 1, total: mediaIds.length, currentItem: mediaId, operation: 'Removing from playlist' })

      try {
        const result = deleteStmt.run(playlistId, mediaId)
        if (result.changes > 0) {
          success++
        }
      } catch (e: any) {
        failed++
        errors.push(`${mediaId}: ${e.message}`)
      }
    }

    // Update playlist timestamp
    this.db.raw.prepare('UPDATE playlists SET updatedAt = ? WHERE id = ?').run(Date.now(), playlistId)

    return { success, failed, errors, totalTime: Date.now() - start }
  }

  /**
   * Rename files based on pattern
   */
  async batchRename(
    mediaIds: string[],
    pattern: string, // e.g., "{index}_{tags}_{date}"
    onProgress?: ProgressCallback
  ): Promise<BatchOperationResult> {
    const start = Date.now()
    let success = 0
    let failed = 0
    const errors: string[] = []

    for (let i = 0; i < mediaIds.length; i++) {
      const mediaId = mediaIds[i]
      onProgress?.({ current: i + 1, total: mediaIds.length, currentItem: mediaId, operation: 'Renaming' })

      try {
        const media = this.db.raw.prepare('SELECT * FROM media WHERE id = ?').get(mediaId) as any
        if (!media) {
          failed++
          errors.push(`${mediaId}: Not found`)
          continue
        }

        // Get tags for this media
        const tags = this.db.raw.prepare(`
          SELECT t.name FROM tags t
          JOIN media_tags mt ON t.id = mt.tagId
          WHERE mt.mediaId = ?
          LIMIT 5
        `).all(mediaId) as { name: string }[]

        const tagString = tags.map(t => t.name).join('_').slice(0, 30) || 'untagged'
        const date = new Date(media.addedAt).toISOString().slice(0, 10)
        const ext = path.extname(media.path)

        // Apply pattern
        let newName = pattern
          .replace('{index}', String(i + 1).padStart(4, '0'))
          .replace('{tags}', tagString)
          .replace('{date}', date)
          .replace('{id}', mediaId.slice(0, 8))
          .replace('{original}', path.basename(media.filename, ext))

        // Sanitize filename
        newName = newName.replace(/[<>:"/\\|?*]/g, '_').slice(0, 200) + ext

        const newPath = path.join(path.dirname(media.path), newName)

        if (newPath !== media.path && !fs.existsSync(newPath)) {
          fs.renameSync(media.path, newPath)
          this.db.raw.prepare('UPDATE media SET path = ?, filename = ? WHERE id = ?').run(newPath, newName, mediaId)
          success++
        } else if (newPath === media.path) {
          // Same name, skip
        } else {
          failed++
          errors.push(`${mediaId}: Target path already exists`)
        }
      } catch (e: any) {
        failed++
        errors.push(`${mediaId}: ${e.message}`)
      }
    }

    return { success, failed, errors, totalTime: Date.now() - start }
  }

  /**
   * Move files to a different directory
   */
  async batchMove(
    mediaIds: string[],
    targetDir: string,
    onProgress?: ProgressCallback
  ): Promise<BatchOperationResult> {
    const start = Date.now()
    let success = 0
    let failed = 0
    const errors: string[] = []

    // Ensure target directory exists
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true })
    }

    for (let i = 0; i < mediaIds.length; i++) {
      const mediaId = mediaIds[i]
      onProgress?.({ current: i + 1, total: mediaIds.length, currentItem: mediaId, operation: 'Moving' })

      try {
        const media = this.db.raw.prepare('SELECT path, filename FROM media WHERE id = ?').get(mediaId) as { path: string; filename: string } | undefined
        if (!media) {
          failed++
          errors.push(`${mediaId}: Not found`)
          continue
        }

        const newPath = path.join(targetDir, media.filename)

        if (newPath !== media.path) {
          if (fs.existsSync(newPath)) {
            failed++
            errors.push(`${mediaId}: Target file already exists`)
            continue
          }

          fs.renameSync(media.path, newPath)
          this.db.raw.prepare('UPDATE media SET path = ? WHERE id = ?').run(newPath, mediaId)
          success++
        }
      } catch (e: any) {
        failed++
        errors.push(`${mediaId}: ${e.message}`)
      }
    }

    return { success, failed, errors, totalTime: Date.now() - start }
  }

  /**
   * Generate thumbnails for items missing them
   */
  async batchGenerateThumbnails(
    mediaIds: string[],
    thumbGenerator: (mediaPath: string, mediaId: string) => Promise<string | null>,
    onProgress?: ProgressCallback
  ): Promise<BatchOperationResult> {
    const start = Date.now()
    let success = 0
    let failed = 0
    const errors: string[] = []

    for (let i = 0; i < mediaIds.length; i++) {
      const mediaId = mediaIds[i]
      onProgress?.({ current: i + 1, total: mediaIds.length, currentItem: mediaId, operation: 'Generating thumbnail' })

      try {
        const media = this.db.raw.prepare('SELECT path, thumbPath FROM media WHERE id = ?').get(mediaId) as { path: string; thumbPath: string | null } | undefined
        if (!media) {
          failed++
          errors.push(`${mediaId}: Not found`)
          continue
        }

        if (media.thumbPath && fs.existsSync(media.thumbPath)) {
          // Already has thumbnail
          continue
        }

        const thumbPath = await thumbGenerator(media.path, mediaId)
        if (thumbPath) {
          this.db.raw.prepare('UPDATE media SET thumbPath = ? WHERE id = ?').run(thumbPath, mediaId)
          success++
        } else {
          failed++
          errors.push(`${mediaId}: Failed to generate thumbnail`)
        }
      } catch (e: any) {
        failed++
        errors.push(`${mediaId}: ${e.message}`)
      }
    }

    return { success, failed, errors, totalTime: Date.now() - start }
  }
}

// Singleton
let instance: BatchOperationsService | null = null

export function getBatchOperationsService(db: DB): BatchOperationsService {
  if (!instance) {
    instance = new BatchOperationsService(db)
  }
  return instance
}
