// File: src/main/services/video-bookmarks.ts
// Save and manage bookmarks/timestamps within videos

import type { DB } from '../db'

export interface VideoBookmark {
  id: string
  mediaId: string
  timestamp: number       // Seconds into video
  timestampFormatted: string
  title: string
  description?: string
  thumbnailPath?: string
  color?: string
  createdAt: number
  updatedAt: number
}

export interface BookmarkGroup {
  mediaId: string
  filename: string
  thumbPath?: string
  duration: number
  bookmarks: VideoBookmark[]
  count: number
}

export class VideoBookmarksService {
  constructor(private db: DB) {
    this.ensureTable()
  }

  private ensureTable(): void {
    this.db.raw.exec(`
      CREATE TABLE IF NOT EXISTS video_bookmarks (
        id TEXT PRIMARY KEY,
        mediaId TEXT NOT NULL,
        timestamp REAL NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        thumbnailPath TEXT,
        color TEXT,
        createdAt INTEGER NOT NULL,
        updatedAt INTEGER NOT NULL,
        FOREIGN KEY (mediaId) REFERENCES media(id) ON DELETE CASCADE
      )
    `)

    // Create index for fast lookup
    this.db.raw.exec(`
      CREATE INDEX IF NOT EXISTS idx_bookmarks_media ON video_bookmarks(mediaId)
    `)
  }

  /**
   * Add a bookmark to a video
   */
  addBookmark(mediaId: string, timestamp: number, title: string, options?: {
    description?: string
    thumbnailPath?: string
    color?: string
  }): VideoBookmark {
    const id = this.generateId()
    const now = Date.now()

    this.db.raw.prepare(`
      INSERT INTO video_bookmarks (id, mediaId, timestamp, title, description, thumbnailPath, color, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      mediaId,
      timestamp,
      title,
      options?.description || null,
      options?.thumbnailPath || null,
      options?.color || null,
      now,
      now
    )

    return {
      id,
      mediaId,
      timestamp,
      timestampFormatted: this.formatTimestamp(timestamp),
      title,
      description: options?.description,
      thumbnailPath: options?.thumbnailPath,
      color: options?.color,
      createdAt: now,
      updatedAt: now
    }
  }

  /**
   * Quick bookmark (auto-generates title)
   */
  quickBookmark(mediaId: string, timestamp: number): VideoBookmark {
    const existing = this.getBookmarksForMedia(mediaId)
    const title = `Bookmark ${existing.length + 1}`
    return this.addBookmark(mediaId, timestamp, title)
  }

  /**
   * Get all bookmarks for a video
   */
  getBookmarksForMedia(mediaId: string): VideoBookmark[] {
    const rows = this.db.raw.prepare(`
      SELECT * FROM video_bookmarks
      WHERE mediaId = ?
      ORDER BY timestamp ASC
    `).all(mediaId) as any[]

    return rows.map(row => ({
      id: row.id,
      mediaId: row.mediaId,
      timestamp: row.timestamp,
      timestampFormatted: this.formatTimestamp(row.timestamp),
      title: row.title,
      description: row.description,
      thumbnailPath: row.thumbnailPath,
      color: row.color,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt
    }))
  }

  /**
   * Get a specific bookmark
   */
  getBookmark(bookmarkId: string): VideoBookmark | null {
    const row = this.db.raw.prepare('SELECT * FROM video_bookmarks WHERE id = ?').get(bookmarkId) as any
    if (!row) return null

    return {
      id: row.id,
      mediaId: row.mediaId,
      timestamp: row.timestamp,
      timestampFormatted: this.formatTimestamp(row.timestamp),
      title: row.title,
      description: row.description,
      thumbnailPath: row.thumbnailPath,
      color: row.color,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt
    }
  }

  /**
   * Update a bookmark
   */
  updateBookmark(bookmarkId: string, updates: Partial<Pick<VideoBookmark, 'title' | 'description' | 'color' | 'timestamp'>>): VideoBookmark | null {
    const existing = this.getBookmark(bookmarkId)
    if (!existing) return null

    const setClauses: string[] = ['updatedAt = ?']
    const values: any[] = [Date.now()]

    if (updates.title !== undefined) {
      setClauses.push('title = ?')
      values.push(updates.title)
    }
    if (updates.description !== undefined) {
      setClauses.push('description = ?')
      values.push(updates.description)
    }
    if (updates.color !== undefined) {
      setClauses.push('color = ?')
      values.push(updates.color)
    }
    if (updates.timestamp !== undefined) {
      setClauses.push('timestamp = ?')
      values.push(updates.timestamp)
    }

    values.push(bookmarkId)

    this.db.raw.prepare(`
      UPDATE video_bookmarks SET ${setClauses.join(', ')} WHERE id = ?
    `).run(...values)

    return this.getBookmark(bookmarkId)
  }

  /**
   * Delete a bookmark
   */
  deleteBookmark(bookmarkId: string): boolean {
    const result = this.db.raw.prepare('DELETE FROM video_bookmarks WHERE id = ?').run(bookmarkId)
    return result.changes > 0
  }

  /**
   * Delete all bookmarks for a video
   */
  deleteAllForMedia(mediaId: string): number {
    const result = this.db.raw.prepare('DELETE FROM video_bookmarks WHERE mediaId = ?').run(mediaId)
    return result.changes
  }

  /**
   * Get all videos with bookmarks
   */
  getBookmarkedVideos(): BookmarkGroup[] {
    const groups = this.db.raw.prepare(`
      SELECT m.id, m.filename, m.thumbPath, m.durationSec,
             COUNT(vb.id) as bookmarkCount
      FROM media m
      JOIN video_bookmarks vb ON m.id = vb.mediaId
      GROUP BY m.id
      ORDER BY MAX(vb.createdAt) DESC
    `).all() as any[]

    return groups.map(group => ({
      mediaId: group.id,
      filename: group.filename,
      thumbPath: group.thumbPath,
      duration: group.durationSec || 0,
      bookmarks: this.getBookmarksForMedia(group.id),
      count: group.bookmarkCount
    }))
  }

  /**
   * Get recent bookmarks across all videos
   */
  getRecentBookmarks(limit = 20): Array<VideoBookmark & { filename: string }> {
    const rows = this.db.raw.prepare(`
      SELECT vb.*, m.filename
      FROM video_bookmarks vb
      JOIN media m ON vb.mediaId = m.id
      ORDER BY vb.createdAt DESC
      LIMIT ?
    `).all(limit) as any[]

    return rows.map(row => ({
      id: row.id,
      mediaId: row.mediaId,
      timestamp: row.timestamp,
      timestampFormatted: this.formatTimestamp(row.timestamp),
      title: row.title,
      description: row.description,
      thumbnailPath: row.thumbnailPath,
      color: row.color,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      filename: row.filename
    }))
  }

  /**
   * Find bookmark nearest to timestamp
   */
  findNearestBookmark(mediaId: string, timestamp: number): VideoBookmark | null {
    const bookmarks = this.getBookmarksForMedia(mediaId)
    if (bookmarks.length === 0) return null

    let nearest = bookmarks[0]
    let minDiff = Math.abs(timestamp - nearest.timestamp)

    for (const bookmark of bookmarks) {
      const diff = Math.abs(timestamp - bookmark.timestamp)
      if (diff < minDiff) {
        minDiff = diff
        nearest = bookmark
      }
    }

    return nearest
  }

  /**
   * Get next bookmark after timestamp
   */
  getNextBookmark(mediaId: string, timestamp: number): VideoBookmark | null {
    const row = this.db.raw.prepare(`
      SELECT * FROM video_bookmarks
      WHERE mediaId = ? AND timestamp > ?
      ORDER BY timestamp ASC
      LIMIT 1
    `).get(mediaId, timestamp) as any

    if (!row) return null

    return {
      id: row.id,
      mediaId: row.mediaId,
      timestamp: row.timestamp,
      timestampFormatted: this.formatTimestamp(row.timestamp),
      title: row.title,
      description: row.description,
      thumbnailPath: row.thumbnailPath,
      color: row.color,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt
    }
  }

  /**
   * Get previous bookmark before timestamp
   */
  getPreviousBookmark(mediaId: string, timestamp: number): VideoBookmark | null {
    const row = this.db.raw.prepare(`
      SELECT * FROM video_bookmarks
      WHERE mediaId = ? AND timestamp < ?
      ORDER BY timestamp DESC
      LIMIT 1
    `).get(mediaId, timestamp) as any

    if (!row) return null

    return {
      id: row.id,
      mediaId: row.mediaId,
      timestamp: row.timestamp,
      timestampFormatted: this.formatTimestamp(row.timestamp),
      title: row.title,
      description: row.description,
      thumbnailPath: row.thumbnailPath,
      color: row.color,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt
    }
  }

  /**
   * Get total bookmark count
   */
  getTotalCount(): number {
    const row = this.db.raw.prepare('SELECT COUNT(*) as count FROM video_bookmarks').get() as { count: number }
    return row.count
  }

  /**
   * Get bookmark statistics
   */
  getStats(): {
    totalBookmarks: number
    videosWithBookmarks: number
    avgBookmarksPerVideo: number
    mostBookmarkedVideo: { mediaId: string; filename: string; count: number } | null
  } {
    const total = this.getTotalCount()

    const videosRow = this.db.raw.prepare(`
      SELECT COUNT(DISTINCT mediaId) as count FROM video_bookmarks
    `).get() as { count: number }

    const mostBookmarked = this.db.raw.prepare(`
      SELECT m.id as mediaId, m.filename, COUNT(vb.id) as count
      FROM media m
      JOIN video_bookmarks vb ON m.id = vb.mediaId
      GROUP BY m.id
      ORDER BY count DESC
      LIMIT 1
    `).get() as any

    return {
      totalBookmarks: total,
      videosWithBookmarks: videosRow.count,
      avgBookmarksPerVideo: videosRow.count > 0 ? total / videosRow.count : 0,
      mostBookmarkedVideo: mostBookmarked ? {
        mediaId: mostBookmarked.mediaId,
        filename: mostBookmarked.filename,
        count: mostBookmarked.count
      } : null
    }
  }

  /**
   * Export bookmarks for a video
   */
  exportBookmarks(mediaId: string, format: 'json' | 'chapters' = 'json'): string {
    const bookmarks = this.getBookmarksForMedia(mediaId)

    if (format === 'chapters') {
      // FFmpeg chapter format
      let content = ';FFMETADATA1\n'
      for (const bookmark of bookmarks) {
        content += '[CHAPTER]\n'
        content += 'TIMEBASE=1/1000\n'
        content += `START=${Math.floor(bookmark.timestamp * 1000)}\n`
        content += `END=${Math.floor(bookmark.timestamp * 1000) + 1000}\n`
        content += `title=${bookmark.title}\n`
      }
      return content
    }

    return JSON.stringify(bookmarks, null, 2)
  }

  /**
   * Import bookmarks from JSON
   */
  importBookmarks(mediaId: string, json: string): number {
    const bookmarks = JSON.parse(json) as Array<{ timestamp: number; title: string; description?: string; color?: string }>
    let imported = 0

    for (const bookmark of bookmarks) {
      try {
        this.addBookmark(mediaId, bookmark.timestamp, bookmark.title, {
          description: bookmark.description,
          color: bookmark.color
        })
        imported++
      } catch {
        // Skip duplicates or errors
      }
    }

    return imported
  }

  private formatTimestamp(seconds: number): string {
    const h = Math.floor(seconds / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    const s = Math.floor(seconds % 60)

    if (h > 0) {
      return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
    }
    return `${m}:${s.toString().padStart(2, '0')}`
  }

  private generateId(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'
    let id = ''
    for (let i = 0; i < 21; i++) {
      id += chars[Math.floor(Math.random() * chars.length)]
    }
    return id
  }
}

// Singleton
let instance: VideoBookmarksService | null = null

export function getVideoBookmarksService(db: DB): VideoBookmarksService {
  if (!instance) {
    instance = new VideoBookmarksService(db)
  }
  return instance
}
