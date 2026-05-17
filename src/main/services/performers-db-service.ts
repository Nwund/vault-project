// File: src/main/services/performers-db-service.ts
//
// #106 — Stash-style local performer database.
//
// Holds canonical performer rows that the renderer can:
//   - search by name/alias
//   - cross-reference to StashDB / ThePornDB / FansDB ids so future
//     scene-match calls hit cached metadata instead of round-tripping
//   - merge duplicate face/body clusters into a single named performer
//
// The schema is intentionally narrow (one row per real-world person).
// The existing face-cluster system stays the source of truth for
// per-media performer:NAME tags; this table is the *bio sidecar*
// that lets the renderer render a rich performer page (bio, aliases,
// scenes count via tag count, headshot).

import type { DB } from '../db'
import { nanoid } from 'nanoid'

export interface PerformerRow {
  id: string
  name: string
  aliases: string[]
  gender: string | null
  country: string | null
  ethnicity: string | null
  birthdate: string | null
  bio: string | null
  headshotPath: string | null
  stashdbId: string | null
  tpdbId: string | null
  fansdbId: string | null
  createdAt: number
  updatedAt: number
  /** Derived per-call: how many media items carry this performer's tag. */
  sceneCount?: number
}

interface RawRow {
  id: string; name: string; aliases: string | null; gender: string | null
  country: string | null; ethnicity: string | null; birthdate: string | null
  bio: string | null; headshot_path: string | null
  stashdb_id: string | null; tpdb_id: string | null; fansdb_id: string | null
  created_at: number; updated_at: number
}

function fromRaw(r: RawRow, sceneCount?: number): PerformerRow {
  let aliases: string[] = []
  if (r.aliases) {
    try {
      const parsed = JSON.parse(r.aliases)
      if (Array.isArray(parsed)) aliases = parsed.map((s) => String(s))
    } catch { /* malformed json, drop */ }
  }
  return {
    id: r.id, name: r.name, aliases,
    gender: r.gender, country: r.country, ethnicity: r.ethnicity,
    birthdate: r.birthdate, bio: r.bio, headshotPath: r.headshot_path,
    stashdbId: r.stashdb_id, tpdbId: r.tpdb_id, fansdbId: r.fansdb_id,
    createdAt: r.created_at, updatedAt: r.updated_at,
    sceneCount,
  }
}

export class PerformersDbService {
  constructor(private db: DB) {}

  list(opts?: { query?: string; limit?: number }): PerformerRow[] {
    const limit = opts?.limit ?? 500
    let rows: RawRow[]
    if (opts?.query?.trim()) {
      const q = `%${opts.query.trim().toLowerCase()}%`
      // Name OR alias substring match. Aliases are JSON; we match the
      // raw text since SQLite has no JSON_EXTRACT-style ARRAY contains.
      rows = this.db.raw.prepare(`
        SELECT * FROM performers_db
        WHERE LOWER(name) LIKE ? OR LOWER(COALESCE(aliases, '')) LIKE ?
        ORDER BY name COLLATE NOCASE
        LIMIT ?
      `).all(q, q, limit) as RawRow[]
    } else {
      rows = this.db.raw.prepare(`
        SELECT * FROM performers_db
        ORDER BY name COLLATE NOCASE
        LIMIT ?
      `).all(limit) as RawRow[]
    }

    // Single-query scene count per performer via tag join. We treat
    // `performer:NAME` tags as the canonical link between this table
    // and the media catalog.
    const counts = this.countScenesByName(rows.map((r) => r.name))
    return rows.map((r) => fromRaw(r, counts.get(r.name.toLowerCase()) ?? 0))
  }

  get(id: string): PerformerRow | null {
    const r = this.db.raw.prepare(`SELECT * FROM performers_db WHERE id = ?`).get(id) as RawRow | undefined
    if (!r) return null
    const counts = this.countScenesByName([r.name])
    return fromRaw(r, counts.get(r.name.toLowerCase()) ?? 0)
  }

  create(args: Partial<Omit<PerformerRow, 'id' | 'createdAt' | 'updatedAt' | 'sceneCount'>> & { name: string }): PerformerRow {
    const id = `perf-${Date.now()}-${nanoid(5)}`
    const now = Date.now()
    this.db.raw.prepare(`
      INSERT INTO performers_db
        (id, name, aliases, gender, country, ethnicity, birthdate, bio, headshot_path,
         stashdb_id, tpdb_id, fansdb_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, args.name, JSON.stringify(args.aliases ?? []),
      args.gender ?? null, args.country ?? null, args.ethnicity ?? null,
      args.birthdate ?? null, args.bio ?? null, args.headshotPath ?? null,
      args.stashdbId ?? null, args.tpdbId ?? null, args.fansdbId ?? null,
      now, now,
    )
    return this.get(id)!
  }

  update(id: string, patch: Partial<Omit<PerformerRow, 'id' | 'createdAt' | 'updatedAt' | 'sceneCount'>>): void {
    const sets: string[] = []
    const args: unknown[] = []
    const colMap: Record<string, string> = {
      name: 'name', gender: 'gender', country: 'country', ethnicity: 'ethnicity',
      birthdate: 'birthdate', bio: 'bio', headshotPath: 'headshot_path',
      stashdbId: 'stashdb_id', tpdbId: 'tpdb_id', fansdbId: 'fansdb_id',
    }
    for (const [k, col] of Object.entries(colMap)) {
      if ((patch as any)[k] !== undefined) { sets.push(`${col} = ?`); args.push((patch as any)[k]) }
    }
    if (patch.aliases !== undefined) {
      sets.push('aliases = ?'); args.push(JSON.stringify(patch.aliases))
    }
    if (sets.length === 0) return
    sets.push('updated_at = ?'); args.push(Date.now())
    args.push(id)
    this.db.raw.prepare(`UPDATE performers_db SET ${sets.join(', ')} WHERE id = ?`).run(...args)
  }

  delete(id: string): void {
    this.db.raw.prepare(`DELETE FROM performers_db WHERE id = ?`).run(id)
  }

  // Helper: how many media items are tagged with each name? Treats
  // both `performer:NAME` and bare `NAME` tags as matches (some adult
  // tags use the bare form historically).
  private countScenesByName(names: string[]): Map<string, number> {
    const out = new Map<string, number>()
    if (names.length === 0) return out
    const lowered = names.map((n) => n.toLowerCase())
    const placeholders = lowered.map(() => '?').join(',')
    const prefixed = lowered.map((n) => `performer:${n}`)
    const rows = this.db.raw.prepare(`
      SELECT LOWER(t.name) AS tagName, COUNT(DISTINCT mt.mediaId) AS n
      FROM tags t
      JOIN media_tags mt ON mt.tagId = t.id
      WHERE LOWER(t.name) IN (${placeholders})
         OR LOWER(t.name) IN (${prefixed.map(() => '?').join(',')})
      GROUP BY LOWER(t.name)
    `).all(...lowered, ...prefixed) as Array<{ tagName: string; n: number }>
    for (const r of rows) {
      const bare = r.tagName.replace(/^performer:/, '')
      out.set(bare, (out.get(bare) ?? 0) + r.n)
    }
    return out
  }
}

let _instance: PerformersDbService | null = null
export function getPerformersDbService(db: DB): PerformersDbService {
  if (!_instance) _instance = new PerformersDbService(db)
  return _instance
}
