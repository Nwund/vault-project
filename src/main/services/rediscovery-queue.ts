// File: src/main/services/rediscovery-queue.ts
//
// #293 D-69 — Anki FSRS-lite rediscovery queue. Picks library items
// the user is in the "spaced-repetition sweet spot" for: viewed at
// least once, not viewed too recently (still novel), not viewed too
// long ago (still familiar). Higher-rated items resurface more often;
// items the user hasn't watched in months get priority over items
// from last week.
//
// Algorithm (no actual SCRS card state — we infer from views/rating):
//
//   score = rating_weight * intervalScore(daysSinceLastView, rating)
//
// where intervalScore peaks at:
//   - 14 days  for rating <= 2 (rare items — surface them more often)
//   - 28 days  for rating == 3
//   - 60 days  for rating == 4
//   - 120 days for rating >= 5 (favorites — pace them out)
//
// Items the user has never viewed are excluded (they belong in
// "fresh import" surfaces, not rediscovery).
//
// Pure SQL + lightweight math — no embeddings needed.

import type Database from 'better-sqlite3'
type Raw = Database.Database

export interface RediscoveryItem {
  mediaId: string
  filename: string
  thumbPath: string | null
  durationSec: number | null
  views: number
  rating: number
  lastViewedAt: number
  daysSinceLastView: number
  score: number
}

function targetIntervalDays(rating: number): number {
  if (rating >= 5) return 120
  if (rating === 4) return 60
  if (rating === 3) return 28
  return 14
}

// Bell curve around target — 1.0 at peak, falls off ~exponentially.
// Items half a target away → 0.5; items 2× target away → ~0.15.
function intervalScore(days: number, target: number): number {
  const ratio = days / target
  // Gaussian-ish: exp(-(ratio-1)^2 / 0.6)
  return Math.exp(-Math.pow(ratio - 1, 2) / 0.6)
}

export function getRediscoveryQueue(db: Raw, opts: { limit?: number; minDaysSinceView?: number } = {}): RediscoveryItem[] {
  const limit = Math.max(1, Math.min(opts.limit ?? 24, 200))
  const minDays = Math.max(1, opts.minDaysSinceView ?? 7)
  const minMsAgo = Date.now() - minDays * 86_400_000

  // Pull every viewed item with rating/views; rank in JS so we can use
  // the bell-curve scoring without writing it in SQL.
  const rows = db.prepare(`
    SELECT m.id AS mediaId, m.filename, m.thumbPath, m.durationSec,
           s.views, s.rating, s.lastViewedAt
    FROM media m
    JOIN media_stats s ON s.mediaId = m.id
    WHERE s.views > 0 AND s.lastViewedAt IS NOT NULL AND s.lastViewedAt <= ?
      AND COALESCE(m.triage_status, 'active') = 'active'
  `).all(minMsAgo) as Array<{ mediaId: string; filename: string; thumbPath: string | null; durationSec: number | null; views: number; rating: number; lastViewedAt: number }>

  const now = Date.now()
  const scored = rows.map((r) => {
    const days = (now - r.lastViewedAt) / 86_400_000
    const target = targetIntervalDays(r.rating)
    const interval = intervalScore(days, target)
    // Rating weight: rating 0-2 → 0.5×, 3 → 1×, 4 → 1.5×, 5 → 2×.
    const ratingWeight = r.rating >= 5 ? 2 : r.rating === 4 ? 1.5 : r.rating === 3 ? 1 : 0.5
    const score = interval * ratingWeight
    return {
      mediaId: r.mediaId,
      filename: r.filename,
      thumbPath: r.thumbPath,
      durationSec: r.durationSec,
      views: r.views,
      rating: r.rating,
      lastViewedAt: r.lastViewedAt,
      daysSinceLastView: days,
      score,
    } as RediscoveryItem
  })

  scored.sort((a, b) => b.score - a.score)
  return scored.slice(0, limit)
}
