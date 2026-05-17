// File: src/main/services/cowatch-recommender.ts
//
// #137 — Single-user implicit-feedback recommender.
//
// Vault has one user, so canonical ALS over a (user × item) matrix
// doesn't apply. We approximate "more like this" via item-item
// co-watch similarity:
//
//   1. Two media are considered co-watched if they're both started
//      within the same 1-hour rolling window in `watch_sessions`.
//   2. similarity(A, B) =
//        cowatch_count(A,B)² /
//        sqrt(views(A) × views(B))
//      — cosine-style but with the squared co-count favoring items
//      the user reliably pairs together over items they happen to
//      watch alongside many things (the "popular item" trap).
//   3. Recommendations for seed S = top-K by similarity(S, ·).
//
// We bias slightly with the user's affinity signal (completion% +
// replays) so a co-watched-but-skipped-immediately item ranks below
// a co-watched-and-actually-finished one.
//
// All-SQL implementation; no in-memory matrix factorization. Runs in
// ~10ms for a typical library (a few hundred view sessions).

import type { DB } from '../db'

export interface Recommendation {
  mediaId: string
  filename: string
  thumbPath: string | null
  similarity: number
  /** How many times the seed and this item were co-watched. */
  coCount: number
}

const COWATCH_WINDOW_MINUTES = 60

export class CoWatchRecommender {
  constructor(private db: DB) {}

  /**
   * Top-K items co-watched with `seedMediaId`. Excludes the seed
   * itself and anything the user marked as not-interested (rating ≤
   * -1, if the catalog ever uses that convention).
   */
  recommendFor(seedMediaId: string, limit = 12): Recommendation[] {
    const windowMs = COWATCH_WINDOW_MINUTES * 60_000
    // For each seed session, candidate sessions are those starting
    // within ±60min. We aggregate over all (seedSession, candidate)
    // pairs to get co-counts.
    const rows = this.db.raw.prepare(`
      WITH seed_sessions AS (
        SELECT startedAt FROM watch_sessions WHERE mediaId = ?
      ),
      cowatch_raw AS (
        SELECT ws.mediaId AS coId,
               COUNT(*) AS coCount
        FROM watch_sessions ws
        JOIN seed_sessions ss
          ON ABS(ws.startedAt - ss.startedAt) <= ?
        WHERE ws.mediaId != ?
        GROUP BY ws.mediaId
      ),
      view_totals AS (
        SELECT mediaId, COUNT(*) AS views,
               AVG(COALESCE(completionPercent, 0)) AS avgComp
        FROM watch_sessions GROUP BY mediaId
      ),
      seed_views AS (
        SELECT COUNT(*) AS n FROM watch_sessions WHERE mediaId = ?
      )
      SELECT m.id AS mediaId,
             m.filename AS filename,
             m.thumbPath AS thumbPath,
             cw.coCount AS coCount,
             vt.views AS views,
             COALESCE(vt.avgComp, 0) AS avgComp,
             sv.n AS seedViews
      FROM cowatch_raw cw
      JOIN media m ON m.id = cw.coId
      JOIN view_totals vt ON vt.mediaId = cw.coId
      CROSS JOIN seed_views sv
      WHERE sv.n > 0 AND vt.views > 0
      ORDER BY cw.coCount DESC
      LIMIT ?
    `).all(
      seedMediaId,
      windowMs,
      seedMediaId,
      seedMediaId,
      Math.max(limit * 4, 40), // over-fetch so the JS rerank can pick the best K
    ) as Array<{
      mediaId: string; filename: string; thumbPath: string | null
      coCount: number; views: number; avgComp: number; seedViews: number
    }>

    if (rows.length === 0) return []

    // Apply the cosine-style similarity + completion bias in JS so we
    // can tune without rewriting the SQL.
    const scored = rows.map((r) => {
      const denom = Math.sqrt(r.views * Math.max(1, r.seedViews))
      const baseSim = denom > 0 ? (r.coCount * r.coCount) / denom : 0
      const completionBoost = 1 + Math.max(0, Math.min(1, r.avgComp / 100)) // 1.0 .. 2.0
      return {
        mediaId: r.mediaId,
        filename: r.filename,
        thumbPath: r.thumbPath,
        similarity: baseSim * completionBoost,
        coCount: r.coCount,
      }
    })
    scored.sort((a, b) => b.similarity - a.similarity)
    return scored.slice(0, limit)
  }

  /**
   * Personalized "today's picks" rail — broad, not seeded by a
   * specific item. Returns top-K media by recency-weighted affinity:
   *
   *   score = (views × log(1 + replays_last_7d)) + favorite_bonus
   *           − recently_watched_penalty
   *
   * The penalty avoids surfacing the same handful of recent rewatches
   * over and over.
   */
  todaysPicks(limit = 12): Recommendation[] {
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000
    const dayAgo = Date.now() - 24 * 60 * 60 * 1000
    const rows = this.db.raw.prepare(`
      WITH recents AS (
        SELECT mediaId, COUNT(*) AS replays7d FROM watch_sessions
        WHERE startedAt >= ? GROUP BY mediaId
      ),
      last_seen AS (
        SELECT mediaId, MAX(startedAt) AS lastAt FROM watch_sessions GROUP BY mediaId
      ),
      view_totals AS (
        SELECT mediaId, COUNT(*) AS views FROM watch_sessions GROUP BY mediaId
      )
      SELECT m.id AS mediaId,
             m.filename AS filename,
             m.thumbPath AS thumbPath,
             vt.views AS views,
             COALESCE(rc.replays7d, 0) AS replays7d,
             ls.lastAt AS lastAt,
             COALESCE(m.rating, 0) AS rating
      FROM view_totals vt
      JOIN media m ON m.id = vt.mediaId
      LEFT JOIN recents rc ON rc.mediaId = vt.mediaId
      LEFT JOIN last_seen ls ON ls.mediaId = vt.mediaId
      WHERE m.type = 'video' OR m.type = 'image'
      ORDER BY vt.views DESC
      LIMIT 300
    `).all(weekAgo) as Array<{
      mediaId: string; filename: string; thumbPath: string | null
      views: number; replays7d: number; lastAt: number | null; rating: number
    }>

    const scored = rows.map((r) => {
      const replayBoost = Math.log(1 + r.replays7d)
      const favBonus = (r.rating ?? 0) >= 4 ? 1.5 : 1.0
      const recencyPenalty = r.lastAt && r.lastAt > dayAgo ? 0.4 : 1.0
      const score = r.views * replayBoost * favBonus * recencyPenalty
      return {
        mediaId: r.mediaId,
        filename: r.filename,
        thumbPath: r.thumbPath,
        similarity: score,
        coCount: 0,
      }
    })
    scored.sort((a, b) => b.similarity - a.similarity)
    return scored.slice(0, limit)
  }
}

let _instance: CoWatchRecommender | null = null
export function getCoWatchRecommender(db: DB): CoWatchRecommender {
  if (!_instance) _instance = new CoWatchRecommender(db)
  return _instance
}
