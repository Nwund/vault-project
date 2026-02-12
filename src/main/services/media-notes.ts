// File: src/main/services/media-notes.ts
// Add and manage personal notes on media items

import type { DB } from '../db'

export interface MediaNote {
  id: string
  mediaId: string
  content: string
  isPinned: boolean
  color?: string
  createdAt: number
  updatedAt: number
}

export interface NoteSearchResult {
  note: MediaNote
  mediaId: string
  filename: string
  thumbPath?: string
  snippet: string
}

export class MediaNotesService {
  constructor(private db: DB) {
    this.ensureTable()
  }

  private ensureTable(): void {
    this.db.raw.exec(`
      CREATE TABLE IF NOT EXISTS media_notes (
        id TEXT PRIMARY KEY,
        mediaId TEXT NOT NULL,
        content TEXT NOT NULL,
        isPinned INTEGER DEFAULT 0,
        color TEXT,
        createdAt INTEGER NOT NULL,
        updatedAt INTEGER NOT NULL,
        FOREIGN KEY (mediaId) REFERENCES media(id) ON DELETE CASCADE
      )
    `)

    this.db.raw.exec(`
      CREATE INDEX IF NOT EXISTS idx_notes_media ON media_notes(mediaId)
    `)

    // Full-text search for notes
    try {
      this.db.raw.exec(`
        CREATE VIRTUAL TABLE IF NOT EXISTS media_notes_fts USING fts5(
          content,
          content='media_notes',
          content_rowid='rowid'
        )
      `)
    } catch {
      // FTS table might already exist
    }
  }

  /**
   * Add a note to a media item
   */
  addNote(mediaId: string, content: string, options?: {
    isPinned?: boolean
    color?: string
  }): MediaNote {
    const id = this.generateId()
    const now = Date.now()

    this.db.raw.prepare(`
      INSERT INTO media_notes (id, mediaId, content, isPinned, color, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      mediaId,
      content,
      options?.isPinned ? 1 : 0,
      options?.color || null,
      now,
      now
    )

    // Update FTS
    this.updateFTS(id, content)

    return {
      id,
      mediaId,
      content,
      isPinned: options?.isPinned ?? false,
      color: options?.color,
      createdAt: now,
      updatedAt: now
    }
  }

  /**
   * Get all notes for a media item
   */
  getNotesForMedia(mediaId: string): MediaNote[] {
    const rows = this.db.raw.prepare(`
      SELECT * FROM media_notes
      WHERE mediaId = ?
      ORDER BY isPinned DESC, updatedAt DESC
    `).all(mediaId) as any[]

    return rows.map(row => ({
      id: row.id,
      mediaId: row.mediaId,
      content: row.content,
      isPinned: row.isPinned === 1,
      color: row.color,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt
    }))
  }

  /**
   * Get a specific note
   */
  getNote(noteId: string): MediaNote | null {
    const row = this.db.raw.prepare('SELECT * FROM media_notes WHERE id = ?').get(noteId) as any
    if (!row) return null

    return {
      id: row.id,
      mediaId: row.mediaId,
      content: row.content,
      isPinned: row.isPinned === 1,
      color: row.color,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt
    }
  }

  /**
   * Update a note
   */
  updateNote(noteId: string, updates: Partial<Pick<MediaNote, 'content' | 'isPinned' | 'color'>>): MediaNote | null {
    const existing = this.getNote(noteId)
    if (!existing) return null

    const setClauses: string[] = ['updatedAt = ?']
    const values: any[] = [Date.now()]

    if (updates.content !== undefined) {
      setClauses.push('content = ?')
      values.push(updates.content)
    }
    if (updates.isPinned !== undefined) {
      setClauses.push('isPinned = ?')
      values.push(updates.isPinned ? 1 : 0)
    }
    if (updates.color !== undefined) {
      setClauses.push('color = ?')
      values.push(updates.color)
    }

    values.push(noteId)

    this.db.raw.prepare(`
      UPDATE media_notes SET ${setClauses.join(', ')} WHERE id = ?
    `).run(...values)

    // Update FTS if content changed
    if (updates.content !== undefined) {
      this.updateFTS(noteId, updates.content)
    }

    return this.getNote(noteId)
  }

  /**
   * Delete a note
   */
  deleteNote(noteId: string): boolean {
    const result = this.db.raw.prepare('DELETE FROM media_notes WHERE id = ?').run(noteId)
    return result.changes > 0
  }

  /**
   * Delete all notes for a media item
   */
  deleteAllForMedia(mediaId: string): number {
    const result = this.db.raw.prepare('DELETE FROM media_notes WHERE mediaId = ?').run(mediaId)
    return result.changes
  }

  /**
   * Toggle pin status
   */
  togglePin(noteId: string): MediaNote | null {
    const existing = this.getNote(noteId)
    if (!existing) return null

    return this.updateNote(noteId, { isPinned: !existing.isPinned })
  }

  /**
   * Search notes
   */
  searchNotes(query: string, limit = 50): NoteSearchResult[] {
    try {
      // Try FTS search first
      const rows = this.db.raw.prepare(`
        SELECT n.*, m.filename, m.thumbPath,
               snippet(media_notes_fts, 0, '<mark>', '</mark>', '...', 20) as snippet
        FROM media_notes_fts f
        JOIN media_notes n ON f.rowid = n.rowid
        JOIN media m ON n.mediaId = m.id
        WHERE media_notes_fts MATCH ?
        LIMIT ?
      `).all(query, limit) as any[]

      return rows.map(row => ({
        note: {
          id: row.id,
          mediaId: row.mediaId,
          content: row.content,
          isPinned: row.isPinned === 1,
          color: row.color,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt
        },
        mediaId: row.mediaId,
        filename: row.filename,
        thumbPath: row.thumbPath,
        snippet: row.snippet || row.content.slice(0, 100)
      }))
    } catch {
      // Fallback to LIKE search
      const rows = this.db.raw.prepare(`
        SELECT n.*, m.filename, m.thumbPath
        FROM media_notes n
        JOIN media m ON n.mediaId = m.id
        WHERE n.content LIKE ?
        ORDER BY n.updatedAt DESC
        LIMIT ?
      `).all(`%${query}%`, limit) as any[]

      return rows.map(row => ({
        note: {
          id: row.id,
          mediaId: row.mediaId,
          content: row.content,
          isPinned: row.isPinned === 1,
          color: row.color,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt
        },
        mediaId: row.mediaId,
        filename: row.filename,
        thumbPath: row.thumbPath,
        snippet: this.createSnippet(row.content, query)
      }))
    }
  }

  /**
   * Get all media with notes
   */
  getMediaWithNotes(): Array<{ mediaId: string; filename: string; thumbPath?: string; noteCount: number; latestNote: string }> {
    const rows = this.db.raw.prepare(`
      SELECT m.id as mediaId, m.filename, m.thumbPath,
             COUNT(n.id) as noteCount,
             (SELECT content FROM media_notes WHERE mediaId = m.id ORDER BY updatedAt DESC LIMIT 1) as latestNote
      FROM media m
      JOIN media_notes n ON m.id = n.mediaId
      GROUP BY m.id
      ORDER BY MAX(n.updatedAt) DESC
    `).all() as any[]

    return rows
  }

  /**
   * Get recent notes
   */
  getRecentNotes(limit = 20): Array<MediaNote & { filename: string }> {
    const rows = this.db.raw.prepare(`
      SELECT n.*, m.filename
      FROM media_notes n
      JOIN media m ON n.mediaId = m.id
      ORDER BY n.updatedAt DESC
      LIMIT ?
    `).all(limit) as any[]

    return rows.map(row => ({
      id: row.id,
      mediaId: row.mediaId,
      content: row.content,
      isPinned: row.isPinned === 1,
      color: row.color,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      filename: row.filename
    }))
  }

  /**
   * Get pinned notes
   */
  getPinnedNotes(): Array<MediaNote & { filename: string }> {
    const rows = this.db.raw.prepare(`
      SELECT n.*, m.filename
      FROM media_notes n
      JOIN media m ON n.mediaId = m.id
      WHERE n.isPinned = 1
      ORDER BY n.updatedAt DESC
    `).all() as any[]

    return rows.map(row => ({
      id: row.id,
      mediaId: row.mediaId,
      content: row.content,
      isPinned: true,
      color: row.color,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      filename: row.filename
    }))
  }

  /**
   * Get note statistics
   */
  getStats(): {
    totalNotes: number
    mediaWithNotes: number
    pinnedNotes: number
    avgNotesPerMedia: number
    colorDistribution: Record<string, number>
  } {
    const total = this.db.raw.prepare('SELECT COUNT(*) as count FROM media_notes').get() as { count: number }
    const mediaCount = this.db.raw.prepare('SELECT COUNT(DISTINCT mediaId) as count FROM media_notes').get() as { count: number }
    const pinned = this.db.raw.prepare('SELECT COUNT(*) as count FROM media_notes WHERE isPinned = 1').get() as { count: number }

    const colors = this.db.raw.prepare(`
      SELECT COALESCE(color, 'default') as color, COUNT(*) as count
      FROM media_notes
      GROUP BY color
    `).all() as Array<{ color: string; count: number }>

    const colorDistribution: Record<string, number> = {}
    for (const c of colors) {
      colorDistribution[c.color] = c.count
    }

    return {
      totalNotes: total.count,
      mediaWithNotes: mediaCount.count,
      pinnedNotes: pinned.count,
      avgNotesPerMedia: mediaCount.count > 0 ? total.count / mediaCount.count : 0,
      colorDistribution
    }
  }

  /**
   * Export notes for a media item
   */
  exportNotes(mediaId: string): string {
    const notes = this.getNotesForMedia(mediaId)
    return JSON.stringify(notes, null, 2)
  }

  /**
   * Import notes from JSON
   */
  importNotes(mediaId: string, json: string): number {
    const notes = JSON.parse(json) as Array<{ content: string; isPinned?: boolean; color?: string }>
    let imported = 0

    for (const note of notes) {
      try {
        this.addNote(mediaId, note.content, {
          isPinned: note.isPinned,
          color: note.color
        })
        imported++
      } catch {
        // Skip errors
      }
    }

    return imported
  }

  private updateFTS(noteId: string, content: string): void {
    try {
      // Get rowid
      const row = this.db.raw.prepare('SELECT rowid FROM media_notes WHERE id = ?').get(noteId) as { rowid: number } | undefined
      if (!row) return

      // Delete old entry
      this.db.raw.prepare('DELETE FROM media_notes_fts WHERE rowid = ?').run(row.rowid)

      // Insert new entry
      this.db.raw.prepare('INSERT INTO media_notes_fts(rowid, content) VALUES (?, ?)').run(row.rowid, content)
    } catch {
      // FTS might not be available
    }
  }

  private createSnippet(content: string, query: string): string {
    const lowerContent = content.toLowerCase()
    const lowerQuery = query.toLowerCase()
    const index = lowerContent.indexOf(lowerQuery)

    if (index === -1) {
      return content.slice(0, 100) + (content.length > 100 ? '...' : '')
    }

    const start = Math.max(0, index - 30)
    const end = Math.min(content.length, index + query.length + 30)

    let snippet = ''
    if (start > 0) snippet += '...'
    snippet += content.slice(start, end)
    if (end < content.length) snippet += '...'

    return snippet
  }

  private generateId(): string {
    return `note-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
  }
}

// Singleton
let instance: MediaNotesService | null = null

export function getMediaNotesService(db: DB): MediaNotesService {
  if (!instance) {
    instance = new MediaNotesService(db)
  }
  return instance
}
