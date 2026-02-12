// File: src/main/services/watch-later.ts
// Watch Later queue management

import type { DB } from '../db'

export interface WatchLaterItem {
  id: string
  mediaId: string
  priority: number
  addedAt: number
  note?: string
  reminderAt?: number
}

export interface WatchLaterWithMedia extends WatchLaterItem {
  filename: string
  thumbPath?: string
  type: string
  durationSec?: number
}

export class WatchLaterService {
  constructor(private db: DB) {
    this.ensureTable()
  }

  private ensureTable(): void {
    this.db.raw.exec(`
      CREATE TABLE IF NOT EXISTS watch_later (
        id TEXT PRIMARY KEY,
        mediaId TEXT NOT NULL UNIQUE,
        priority INTEGER DEFAULT 0,
        addedAt INTEGER NOT NULL,
        note TEXT,
        reminderAt INTEGER,
        FOREIGN KEY (mediaId) REFERENCES media(id) ON DELETE CASCADE
      )
    `)

    this.db.raw.exec(`
      CREATE INDEX IF NOT EXISTS idx_watchlater_priority ON watch_later(priority DESC, addedAt ASC)
    `)
  }

  /**
   * Add item to watch later queue
   */
  add(mediaId: string, options?: {
    priority?: number
    note?: string
    reminderAt?: number
  }): WatchLaterItem {
    const id = this.generateId()
    const now = Date.now()

    // Check if already exists
    const existing = this.getByMediaId(mediaId)
    if (existing) {
      return existing
    }

    this.db.raw.prepare(`
      INSERT INTO watch_later (id, mediaId, priority, addedAt, note, reminderAt)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      id,
      mediaId,
      options?.priority ?? 0,
      now,
      options?.note || null,
      options?.reminderAt || null
    )

    return {
      id,
      mediaId,
      priority: options?.priority ?? 0,
      addedAt: now,
      note: options?.note,
      reminderAt: options?.reminderAt
    }
  }

  /**
   * Remove from watch later queue
   */
  remove(mediaId: string): boolean {
    const result = this.db.raw.prepare('DELETE FROM watch_later WHERE mediaId = ?').run(mediaId)
    return result.changes > 0
  }

  /**
   * Remove by ID
   */
  removeById(id: string): boolean {
    const result = this.db.raw.prepare('DELETE FROM watch_later WHERE id = ?').run(id)
    return result.changes > 0
  }

  /**
   * Check if in queue
   */
  isInQueue(mediaId: string): boolean {
    const row = this.db.raw.prepare('SELECT id FROM watch_later WHERE mediaId = ?').get(mediaId)
    return !!row
  }

  /**
   * Get by media ID
   */
  getByMediaId(mediaId: string): WatchLaterItem | null {
    const row = this.db.raw.prepare('SELECT * FROM watch_later WHERE mediaId = ?').get(mediaId) as any
    if (!row) return null

    return {
      id: row.id,
      mediaId: row.mediaId,
      priority: row.priority,
      addedAt: row.addedAt,
      note: row.note,
      reminderAt: row.reminderAt
    }
  }

  /**
   * Get entire queue
   */
  getQueue(options?: {
    limit?: number
    offset?: number
    sortBy?: 'priority' | 'addedAt' | 'reminderAt'
  }): WatchLaterWithMedia[] {
    const limit = options?.limit ?? 100
    const offset = options?.offset ?? 0
    const sortBy = options?.sortBy ?? 'priority'

    let orderClause = 'wl.priority DESC, wl.addedAt ASC'
    if (sortBy === 'addedAt') orderClause = 'wl.addedAt DESC'
    if (sortBy === 'reminderAt') orderClause = 'wl.reminderAt ASC NULLS LAST, wl.priority DESC'

    const rows = this.db.raw.prepare(`
      SELECT wl.*, m.filename, m.thumbPath, m.type, m.durationSec
      FROM watch_later wl
      JOIN media m ON wl.mediaId = m.id
      ORDER BY ${orderClause}
      LIMIT ? OFFSET ?
    `).all(limit, offset) as any[]

    return rows.map(row => ({
      id: row.id,
      mediaId: row.mediaId,
      priority: row.priority,
      addedAt: row.addedAt,
      note: row.note,
      reminderAt: row.reminderAt,
      filename: row.filename,
      thumbPath: row.thumbPath,
      type: row.type,
      durationSec: row.durationSec
    }))
  }

  /**
   * Get queue count
   */
  getCount(): number {
    const row = this.db.raw.prepare('SELECT COUNT(*) as count FROM watch_later').get() as { count: number }
    return row.count
  }

  /**
   * Get total duration of videos in queue
   */
  getTotalDuration(): number {
    const row = this.db.raw.prepare(`
      SELECT COALESCE(SUM(m.durationSec), 0) as total
      FROM watch_later wl
      JOIN media m ON wl.mediaId = m.id
      WHERE m.type = 'video'
    `).get() as { total: number }
    return row.total
  }

  /**
   * Update item
   */
  update(id: string, updates: Partial<Pick<WatchLaterItem, 'priority' | 'note' | 'reminderAt'>>): WatchLaterItem | null {
    const setClauses: string[] = []
    const values: any[] = []

    if (updates.priority !== undefined) {
      setClauses.push('priority = ?')
      values.push(updates.priority)
    }
    if (updates.note !== undefined) {
      setClauses.push('note = ?')
      values.push(updates.note)
    }
    if (updates.reminderAt !== undefined) {
      setClauses.push('reminderAt = ?')
      values.push(updates.reminderAt)
    }

    if (setClauses.length === 0) return null

    values.push(id)
    this.db.raw.prepare(`UPDATE watch_later SET ${setClauses.join(', ')} WHERE id = ?`).run(...values)

    const row = this.db.raw.prepare('SELECT * FROM watch_later WHERE id = ?').get(id) as any
    if (!row) return null

    return {
      id: row.id,
      mediaId: row.mediaId,
      priority: row.priority,
      addedAt: row.addedAt,
      note: row.note,
      reminderAt: row.reminderAt
    }
  }

  /**
   * Set priority
   */
  setPriority(mediaId: string, priority: number): boolean {
    const result = this.db.raw.prepare('UPDATE watch_later SET priority = ? WHERE mediaId = ?').run(priority, mediaId)
    return result.changes > 0
  }

  /**
   * Bump priority (increase by 1)
   */
  bumpPriority(mediaId: string): boolean {
    const result = this.db.raw.prepare('UPDATE watch_later SET priority = priority + 1 WHERE mediaId = ?').run(mediaId)
    return result.changes > 0
  }

  /**
   * Get next item to watch
   */
  getNext(): WatchLaterWithMedia | null {
    const items = this.getQueue({ limit: 1 })
    return items[0] || null
  }

  /**
   * Pop next item (get and remove)
   */
  popNext(): WatchLaterWithMedia | null {
    const next = this.getNext()
    if (next) {
      this.removeById(next.id)
    }
    return next
  }

  /**
   * Get items with reminders due
   */
  getDueReminders(): WatchLaterWithMedia[] {
    const now = Date.now()
    const rows = this.db.raw.prepare(`
      SELECT wl.*, m.filename, m.thumbPath, m.type, m.durationSec
      FROM watch_later wl
      JOIN media m ON wl.mediaId = m.id
      WHERE wl.reminderAt IS NOT NULL AND wl.reminderAt <= ?
      ORDER BY wl.reminderAt ASC
    `).all(now) as any[]

    return rows.map(row => ({
      id: row.id,
      mediaId: row.mediaId,
      priority: row.priority,
      addedAt: row.addedAt,
      note: row.note,
      reminderAt: row.reminderAt,
      filename: row.filename,
      thumbPath: row.thumbPath,
      type: row.type,
      durationSec: row.durationSec
    }))
  }

  /**
   * Clear all reminders
   */
  clearReminders(): number {
    const result = this.db.raw.prepare('UPDATE watch_later SET reminderAt = NULL WHERE reminderAt IS NOT NULL').run()
    return result.changes
  }

  /**
   * Clear entire queue
   */
  clearQueue(): number {
    const result = this.db.raw.prepare('DELETE FROM watch_later').run()
    return result.changes
  }

  /**
   * Reorder queue (by drag and drop)
   */
  reorder(orderedMediaIds: string[]): void {
    for (let i = 0; i < orderedMediaIds.length; i++) {
      // Higher priority = earlier in list
      const priority = orderedMediaIds.length - i
      this.db.raw.prepare('UPDATE watch_later SET priority = ? WHERE mediaId = ?').run(priority, orderedMediaIds[i])
    }
  }

  /**
   * Get statistics
   */
  getStats(): {
    totalItems: number
    totalDuration: number
    highPriorityItems: number
    withReminders: number
    byType: Record<string, number>
  } {
    const total = this.getCount()
    const duration = this.getTotalDuration()

    const highPriority = this.db.raw.prepare('SELECT COUNT(*) as count FROM watch_later WHERE priority > 5').get() as { count: number }
    const withReminders = this.db.raw.prepare('SELECT COUNT(*) as count FROM watch_later WHERE reminderAt IS NOT NULL').get() as { count: number }

    const byType = this.db.raw.prepare(`
      SELECT m.type, COUNT(*) as count
      FROM watch_later wl
      JOIN media m ON wl.mediaId = m.id
      GROUP BY m.type
    `).all() as Array<{ type: string; count: number }>

    const typeMap: Record<string, number> = {}
    for (const t of byType) {
      typeMap[t.type] = t.count
    }

    return {
      totalItems: total,
      totalDuration: duration,
      highPriorityItems: highPriority.count,
      withReminders: withReminders.count,
      byType: typeMap
    }
  }

  /**
   * Add multiple items
   */
  addMultiple(mediaIds: string[], priority?: number): number {
    let added = 0
    for (const mediaId of mediaIds) {
      try {
        if (!this.isInQueue(mediaId)) {
          this.add(mediaId, { priority })
          added++
        }
      } catch {
        // Skip errors
      }
    }
    return added
  }

  /**
   * Shuffle queue (randomize priorities)
   */
  shuffle(): void {
    const items = this.getQueue({ limit: 10000 })
    const shuffled = items.sort(() => Math.random() - 0.5)
    this.reorder(shuffled.map(i => i.mediaId))
  }

  private generateId(): string {
    return `wl-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
  }
}

// Singleton
let instance: WatchLaterService | null = null

export function getWatchLaterService(db: DB): WatchLaterService {
  if (!instance) {
    instance = new WatchLaterService(db)
  }
  return instance
}
