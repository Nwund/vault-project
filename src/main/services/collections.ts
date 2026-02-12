// File: src/main/services/collections.ts
// Collections system - group related content together

import type { DB } from '../db'
import { nanoid } from 'nanoid'

export interface Collection {
  id: string
  name: string
  description: string | null
  coverMediaId: string | null
  color: string | null
  icon: string | null
  isPrivate: boolean
  sortOrder: number
  createdAt: number
  updatedAt: number
}

export interface CollectionWithStats extends Collection {
  itemCount: number
  totalSize: number
  totalDuration: number
}

export class CollectionService {
  constructor(private db: DB) {
    this.ensureTables()
  }

  private ensureTables(): void {
    this.db.raw.exec(`
      CREATE TABLE IF NOT EXISTS collections (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        coverMediaId TEXT,
        color TEXT,
        icon TEXT,
        isPrivate INTEGER NOT NULL DEFAULT 0,
        sortOrder INTEGER NOT NULL DEFAULT 0,
        createdAt REAL NOT NULL,
        updatedAt REAL NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_collections_sort ON collections(sortOrder);

      CREATE TABLE IF NOT EXISTS collection_items (
        collectionId TEXT NOT NULL,
        mediaId TEXT NOT NULL,
        position INTEGER NOT NULL DEFAULT 0,
        addedAt REAL NOT NULL,
        PRIMARY KEY (collectionId, mediaId)
      );

      CREATE INDEX IF NOT EXISTS idx_collection_items_collection ON collection_items(collectionId, position);
      CREATE INDEX IF NOT EXISTS idx_collection_items_media ON collection_items(mediaId);
    `)
  }

  /**
   * Create a new collection
   */
  create(data: Partial<Collection>): Collection {
    const id = nanoid()
    const now = Date.now()

    // Get next sort order
    const maxSort = this.db.raw.prepare('SELECT MAX(sortOrder) as max FROM collections').get() as { max: number | null }
    const sortOrder = (maxSort?.max ?? -1) + 1

    const collection: Collection = {
      id,
      name: data.name || 'New Collection',
      description: data.description || null,
      coverMediaId: data.coverMediaId || null,
      color: data.color || null,
      icon: data.icon || null,
      isPrivate: data.isPrivate || false,
      sortOrder,
      createdAt: now,
      updatedAt: now
    }

    this.db.raw.prepare(`
      INSERT INTO collections (id, name, description, coverMediaId, color, icon, isPrivate, sortOrder, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, collection.name, collection.description, collection.coverMediaId,
      collection.color, collection.icon, collection.isPrivate ? 1 : 0,
      sortOrder, now, now
    )

    return collection
  }

  /**
   * Update a collection
   */
  update(id: string, data: Partial<Collection>): Collection | null {
    const existing = this.getById(id)
    if (!existing) return null

    const updated: Collection = {
      ...existing,
      ...data,
      id,
      updatedAt: Date.now()
    }

    this.db.raw.prepare(`
      UPDATE collections SET
        name = ?, description = ?, coverMediaId = ?, color = ?, icon = ?,
        isPrivate = ?, sortOrder = ?, updatedAt = ?
      WHERE id = ?
    `).run(
      updated.name, updated.description, updated.coverMediaId,
      updated.color, updated.icon, updated.isPrivate ? 1 : 0,
      updated.sortOrder, updated.updatedAt, id
    )

    return updated
  }

  /**
   * Delete a collection
   */
  delete(id: string): boolean {
    this.db.raw.prepare('DELETE FROM collection_items WHERE collectionId = ?').run(id)
    const result = this.db.raw.prepare('DELETE FROM collections WHERE id = ?').run(id)
    return result.changes > 0
  }

  /**
   * Get collection by ID
   */
  getById(id: string): Collection | null {
    const row = this.db.raw.prepare('SELECT * FROM collections WHERE id = ?').get(id) as any
    return row ? this.rowToCollection(row) : null
  }

  /**
   * Get all collections
   */
  getAll(includePrivate = true): CollectionWithStats[] {
    let query = 'SELECT * FROM collections'
    if (!includePrivate) {
      query += ' WHERE isPrivate = 0'
    }
    query += ' ORDER BY sortOrder ASC'

    const rows = this.db.raw.prepare(query).all() as any[]

    return rows.map(row => {
      const collection = this.rowToCollection(row)
      const stats = this.getStats(collection.id)
      return { ...collection, ...stats }
    })
  }

  /**
   * Get stats for a collection
   */
  private getStats(collectionId: string): { itemCount: number; totalSize: number; totalDuration: number } {
    const row = this.db.raw.prepare(`
      SELECT
        COUNT(*) as itemCount,
        COALESCE(SUM(m.size), 0) as totalSize,
        COALESCE(SUM(m.durationSec), 0) as totalDuration
      FROM collection_items ci
      JOIN media m ON ci.mediaId = m.id
      WHERE ci.collectionId = ?
    `).get(collectionId) as any

    return {
      itemCount: row?.itemCount || 0,
      totalSize: row?.totalSize || 0,
      totalDuration: row?.totalDuration || 0
    }
  }

  /**
   * Add media to collection
   */
  addMedia(collectionId: string, mediaIds: string[]): number {
    const now = Date.now()
    let added = 0

    // Get current max position
    const maxPos = this.db.raw.prepare('SELECT MAX(position) as max FROM collection_items WHERE collectionId = ?').get(collectionId) as { max: number | null }
    let position = (maxPos?.max ?? -1) + 1

    const stmt = this.db.raw.prepare(`
      INSERT OR IGNORE INTO collection_items (collectionId, mediaId, position, addedAt)
      VALUES (?, ?, ?, ?)
    `)

    for (const mediaId of mediaIds) {
      const result = stmt.run(collectionId, mediaId, position++, now)
      if (result.changes > 0) added++
    }

    // Update collection timestamp
    this.db.raw.prepare('UPDATE collections SET updatedAt = ? WHERE id = ?').run(now, collectionId)

    // Auto-set cover if none
    const collection = this.getById(collectionId)
    if (collection && !collection.coverMediaId && added > 0) {
      this.update(collectionId, { coverMediaId: mediaIds[0] })
    }

    return added
  }

  /**
   * Remove media from collection
   */
  removeMedia(collectionId: string, mediaIds: string[]): number {
    let removed = 0
    const stmt = this.db.raw.prepare('DELETE FROM collection_items WHERE collectionId = ? AND mediaId = ?')

    for (const mediaId of mediaIds) {
      const result = stmt.run(collectionId, mediaId)
      if (result.changes > 0) removed++
    }

    // Update timestamp
    this.db.raw.prepare('UPDATE collections SET updatedAt = ? WHERE id = ?').run(Date.now(), collectionId)

    return removed
  }

  /**
   * Get media IDs in a collection
   */
  getMediaIds(collectionId: string): string[] {
    const rows = this.db.raw.prepare(`
      SELECT mediaId FROM collection_items WHERE collectionId = ? ORDER BY position ASC
    `).all(collectionId) as { mediaId: string }[]

    return rows.map(r => r.mediaId)
  }

  /**
   * Get collections containing a media item
   */
  getCollectionsForMedia(mediaId: string): Collection[] {
    const rows = this.db.raw.prepare(`
      SELECT c.* FROM collections c
      JOIN collection_items ci ON c.id = ci.collectionId
      WHERE ci.mediaId = ?
      ORDER BY c.sortOrder ASC
    `).all(mediaId) as any[]

    return rows.map(r => this.rowToCollection(r))
  }

  /**
   * Reorder items in collection
   */
  reorderItems(collectionId: string, mediaIds: string[]): void {
    const stmt = this.db.raw.prepare('UPDATE collection_items SET position = ? WHERE collectionId = ? AND mediaId = ?')

    this.db.raw.transaction(() => {
      for (let i = 0; i < mediaIds.length; i++) {
        stmt.run(i, collectionId, mediaIds[i])
      }
    })()

    this.db.raw.prepare('UPDATE collections SET updatedAt = ? WHERE id = ?').run(Date.now(), collectionId)
  }

  /**
   * Reorder collections
   */
  reorderCollections(collectionIds: string[]): void {
    const stmt = this.db.raw.prepare('UPDATE collections SET sortOrder = ? WHERE id = ?')

    this.db.raw.transaction(() => {
      for (let i = 0; i < collectionIds.length; i++) {
        stmt.run(i, collectionIds[i])
      }
    })()
  }

  /**
   * Duplicate a collection
   */
  duplicate(id: string, newName?: string): Collection | null {
    const original = this.getById(id)
    if (!original) return null

    const newCollection = this.create({
      name: newName || `${original.name} (Copy)`,
      description: original.description,
      color: original.color,
      icon: original.icon,
      isPrivate: original.isPrivate
    })

    // Copy items
    const mediaIds = this.getMediaIds(id)
    if (mediaIds.length > 0) {
      this.addMedia(newCollection.id, mediaIds)
    }

    return newCollection
  }

  /**
   * Merge collections
   */
  merge(targetId: string, sourceId: string, deleteSource = true): boolean {
    const target = this.getById(targetId)
    const source = this.getById(sourceId)

    if (!target || !source) return false

    // Add source items to target
    const sourceMediaIds = this.getMediaIds(sourceId)
    if (sourceMediaIds.length > 0) {
      this.addMedia(targetId, sourceMediaIds)
    }

    // Optionally delete source
    if (deleteSource) {
      this.delete(sourceId)
    }

    return true
  }

  private rowToCollection(row: any): Collection {
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      coverMediaId: row.coverMediaId,
      color: row.color,
      icon: row.icon,
      isPrivate: row.isPrivate === 1,
      sortOrder: row.sortOrder,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt
    }
  }
}

// Singleton
let instance: CollectionService | null = null

export function getCollectionService(db: DB): CollectionService {
  if (!instance) {
    instance = new CollectionService(db)
  }
  return instance
}
