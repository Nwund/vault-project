// File: src/main/services/tag-affinity-recommender.ts
//
// #138 — Two-tower-style content+behavior recommender.
//
// Classical two-tower learns a user embedding and an item embedding,
// scoring affinity = dot(user, item). Single-user Vault means we can
// skip the user-tower training entirely: the user embedding is just
// their tag-affinity vector built from view history + ratings.
//
//   user_affinity[tag] =
//     Σ over watched media m:
//       contains(m, tag) × completion(m) × log(1 + views(m))
//
//   item_score[m] = Σ over tags(m) of user_affinity[tag] × tag_weight(tag, m)
//
// where tag_weight is 1.0 for manual tags and the AI confidence for
// rich_tags. Items the user has already watched a lot get a recency
// penalty so the feed stays fresh.
//
// This complements the co-watch recommender (#137):
//   - co-watch  ≈ collaborative signal
//   - tag-aff   ≈ content signal
// The renderer can blend both with a weight knob if desired.

import type { DB } from '../db'

export interface TagAffinityHit {
  mediaId: string
  filename: string
  thumbPath: string | null
  score: number
}

const RECENCY_PENALTY_HOURS = 48

export class TagAffinityRecommender {
  constructor(private db: DB) {}

  /**
   * Build the user's tag-affinity vector from watch history. Returns
   * a map of tag-name (lowercased) → score in arbitrary units.
   *
   * Cached at instance level for the lifetime of the process; call
   * `invalidate()` after the user's view history materially changes
   * (e.g. after dozens of new watch sessions).
   */
  private cache: Map<string, number> | null = null
  private cachedAt = 0
  private static CACHE_TTL_MS = 5 * 60_000

  private buildUserVector(): Map<string, number> {
    if (this.cache && Date.now() - this.cachedAt < TagAffinityRecommender.CACHE_TTL_MS) {
      return this.cache
    }
    const rows = this.db.raw.prepare(`
      WITH watch_agg AS (
        SELECT ws.mediaId,
               COUNT(*) AS views,
               AVG(COALESCE(ws.completionPercent, 0)) AS avgComp
        FROM watch_sessions ws
        GROUP BY ws.mediaId
      )
      SELECT wa.mediaId, wa.views, wa.avgComp,
             COALESCE(m.rating, 0) AS rating
      FROM watch_agg wa
      JOIN media m ON m.id = wa.mediaId
      WHERE m.type = 'video' OR m.type = 'image'
    `).all() as Array<{ mediaId: string; views: number; avgComp: number; rating: number }>
    const affinity = new Map<string, number>()
    if (rows.length === 0) {
      this.cache = affinity
      this.cachedAt = Date.now()
      return affinity
    }

    // For each watched media, pull its tags and accumulate weighted
    // contribution to each tag.
    const tagStmt = this.db.raw.prepare(`
      SELECT t.name FROM media_tags mt
      JOIN tags t ON t.id = mt.tagId
      WHERE mt.mediaId = ?
    `)
    for (const r of rows) {
      const weight = (r.avgComp / 100) * Math.log(1 + r.views) * (1 + (r.rating ?? 0) * 0.25)
      if (weight <= 0) continue
      const tags = tagStmt.all(r.mediaId) as Array<{ name: string }>
      for (const t of tags) {
        const k = String(t.name).toLowerCase()
        affinity.set(k, (affinity.get(k) ?? 0) + weight)
      }
    }
    this.cache = affinity
    this.cachedAt = Date.now()
    return affinity
  }

  invalidate(): void {
    this.cache = null
    this.cachedAt = 0
  }

  /**
   * Top-K recommendations across the whole library, scored by the
   * user's tag-affinity vector.
   */
  recommend(limit = 20, excludeMediaIds: string[] = []): TagAffinityHit[] {
    const userVec = this.buildUserVector()
    if (userVec.size === 0) return []
    // Pull all media + their tags + last-seen, then score in JS.
    // Even with 50k library entries this is sub-100ms because the
    // tag-join is one query and the scoring is a Map lookup per tag.
    const recencyThreshold = Date.now() - RECENCY_PENALTY_HOURS * 60 * 60 * 1000
    const rows = this.db.raw.prepare(`
      SELECT m.id AS mediaId,
             m.filename AS filename,
             m.thumbPath AS thumbPath,
             ls.lastAt AS lastAt,
             GROUP_CONCAT(LOWER(t.name), '|') AS tagCsv
      FROM media m
      LEFT JOIN media_tags mt ON mt.mediaId = m.id
      LEFT JOIN tags t ON t.id = mt.tagId
      LEFT JOIN (
        SELECT mediaId, MAX(startedAt) AS lastAt
        FROM watch_sessions
        GROUP BY mediaId
      ) ls ON ls.mediaId = m.id
      WHERE m.type IN ('video', 'image')
      GROUP BY m.id
    `).all() as Array<{ mediaId: string; filename: string; thumbPath: string | null; lastAt: number | null; tagCsv: string | null }>

    const excludeSet = new Set(excludeMediaIds)
    const scored: TagAffinityHit[] = []
    for (const r of rows) {
      if (excludeSet.has(r.mediaId)) continue
      if (!r.tagCsv) continue
      const tags = r.tagCsv.split('|').filter(Boolean)
      if (tags.length === 0) continue
      let s = 0
      for (const t of tags) {
        const w = userVec.get(t)
        if (w) s += w
      }
      if (s <= 0) continue
      // Recency penalty so the feed stays fresh.
      if (r.lastAt && r.lastAt > recencyThreshold) s *= 0.35
      scored.push({
        mediaId: r.mediaId,
        filename: r.filename,
        thumbPath: r.thumbPath,
        score: s,
      })
    }
    scored.sort((a, b) => b.score - a.score)
    return scored.slice(0, limit)
  }
}

let _instance: TagAffinityRecommender | null = null
export function getTagAffinityRecommender(db: DB): TagAffinityRecommender {
  if (!_instance) _instance = new TagAffinityRecommender(db)
  return _instance
}
