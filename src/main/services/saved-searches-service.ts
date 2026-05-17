// File: src/main/services/saved-searches-service.ts
//
// #206 — DB-backed pinned filter / saved-search store. Replaces
// the localStorage list that PinnedFiltersBar used to own so chips
// sync across machines through the existing mobile-sync replication
// and survive a reinstall.
//
// The query payload is stored as opaque JSON (the renderer's
// FilterSnapshot shape) — service stays agnostic to the snapshot
// fields, which lets the renderer add filter dimensions without
// rev'ing the schema.

import type { DB } from '../db'
import { nanoid } from 'nanoid'

export interface SavedSearch {
  id: string
  name: string
  queryJson: string
  position: number
  createdAt: number
  updatedAt: number
}

export class SavedSearchesService {
  constructor(private db: DB) {}

  list(): SavedSearch[] {
    const rows = this.db.raw.prepare(`
      SELECT id, name, query_json AS queryJson, position, created_at AS createdAt, updated_at AS updatedAt
      FROM saved_searches
      ORDER BY position ASC, created_at ASC
    `).all() as SavedSearch[]
    return rows
  }

  create(name: string, queryJson: string): SavedSearch {
    const id = `ss-${Date.now()}-${nanoid(6)}`
    const now = Date.now()
    // Position = max + 1 so new rows append. Renderer can reorder later.
    const max = this.db.raw.prepare(`SELECT COALESCE(MAX(position), -1) AS m FROM saved_searches`).get() as { m: number }
    const position = (max.m ?? -1) + 1
    this.db.raw.prepare(`
      INSERT INTO saved_searches (id, name, query_json, position, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, name, queryJson, position, now, now)
    return { id, name, queryJson, position, createdAt: now, updatedAt: now }
  }

  update(id: string, patch: { name?: string; queryJson?: string }): void {
    const sets: string[] = []
    const args: unknown[] = []
    if (typeof patch.name === 'string') { sets.push(`name = ?`); args.push(patch.name) }
    if (typeof patch.queryJson === 'string') { sets.push(`query_json = ?`); args.push(patch.queryJson) }
    if (sets.length === 0) return
    sets.push(`updated_at = ?`)
    args.push(Date.now())
    args.push(id)
    this.db.raw.prepare(`UPDATE saved_searches SET ${sets.join(', ')} WHERE id = ?`).run(...args)
  }

  delete(id: string): void {
    this.db.raw.prepare(`DELETE FROM saved_searches WHERE id = ?`).run(id)
  }

  // Renderer hands us the new order; we persist the positions in one
  // transaction so a partial reorder can't leave chips with duplicate
  // positions.
  reorder(orderedIds: string[]): void {
    const tx = this.db.raw.transaction((ids: string[]) => {
      const update = this.db.raw.prepare(`UPDATE saved_searches SET position = ?, updated_at = ? WHERE id = ?`)
      const now = Date.now()
      ids.forEach((id, i) => update.run(i, now, id))
    })
    tx(orderedIds)
  }

  // One-shot bulk import for the renderer's localStorage migration.
  // Pre-existing entries (by id) are left alone so re-running this is
  // safe. Returns the count of rows actually inserted.
  importLegacy(entries: Array<{ id: string; name: string; queryJson: string; pinnedAt: number }>): number {
    const tx = this.db.raw.transaction((items: typeof entries) => {
      const ins = this.db.raw.prepare(`
        INSERT OR IGNORE INTO saved_searches (id, name, query_json, position, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `)
      let n = 0
      let position = 0
      for (const e of items) {
        const result = ins.run(e.id, e.name, e.queryJson, position++, e.pinnedAt || Date.now(), e.pinnedAt || Date.now())
        if (result.changes > 0) n++
      }
      return n
    })
    return tx(entries) as number
  }
}

let _instance: SavedSearchesService | null = null
export function getSavedSearchesService(db: DB): SavedSearchesService {
  if (!_instance) _instance = new SavedSearchesService(db)
  return _instance
}
