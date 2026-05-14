// File: src/main/services/ai-intelligence/rejection-patterns.ts
//
// Library-wide aggregation of user rejections. The per-media rejection
// flow already exists (ai_analysis_results.rejection_history is JSON array
// of {rejectedAt, prevTitle, prevDesc, prevTags}; ProcessingQueue threads
// recent entries into the per-media Tier 2 prompt as "USER REJECTED THESE").
//
// What this file adds: library-wide aggregation. When the user rejects
// `wedding ring` on 8 different videos, we want EVERY future Tier 2 call
// to know that — not just retries on the specific videos. This is the
// Phase 3 slice from CONTENT_ANALYZER_AUDIT.md, scoped down: just the
// pattern aggregator + a prompt block. Calibration weights and the full
// learning DB are still deferred.

import type Database from 'better-sqlite3'

export interface RejectionPatterns {
  /** Total rejection events analyzed (one per row in history). */
  totalEvents: number
  /** Tag names that show up in rejected outputs most often. */
  rejectedTags: Array<{ name: string; count: number }>
  /** Tags rejected ≥ this many times — Venice should treat these as
   *  near-deny-list. Currently 3+. */
  hotRejections: string[]
}

/**
 * Walk every ai_analysis_results.rejection_history row, parse the JSON
 * array, count how often each tag name appears in rejected `prevTags`.
 * Returns the top 30 most-rejected tags + a "hot" subset (≥3 rejections).
 *
 * Cheap: ~50ms on 4k rows. Cached at the call site via a module-level
 * timestamp guard.
 */
export function aggregateRejectionPatterns(rawDb: Database.Database): RejectionPatterns {
  const rows = rawDb.prepare(`
    SELECT rejection_history FROM ai_analysis_results
    WHERE rejection_history IS NOT NULL AND rejection_history != ''
  `).all() as Array<{ rejection_history: string }>

  const tagCounts = new Map<string, number>()
  let totalEvents = 0

  for (const row of rows) {
    let history: Array<{ prevTags?: string[] | string }> = []
    try { history = JSON.parse(row.rejection_history) } catch { continue }
    if (!Array.isArray(history)) continue

    for (const event of history) {
      totalEvents++
      const prevTags = event.prevTags
      if (!prevTags) continue
      // Normalize — historical rows may have stringified arrays or
      // bare names depending on the writer at the time.
      const list: string[] = Array.isArray(prevTags)
        ? prevTags
        : typeof prevTags === 'string'
          ? prevTags.split(/[,;]\s*/)
          : []
      for (const t of list) {
        const lower = String(t).toLowerCase().trim()
        if (!lower || lower.length < 2 || lower.length > 50) continue
        tagCounts.set(lower, (tagCounts.get(lower) ?? 0) + 1)
      }
    }
  }

  const rejectedTags = [...tagCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 30)
    .map(([name, count]) => ({ name, count }))

  const hotRejections = rejectedTags.filter((t) => t.count >= 3).map((t) => t.name)

  return { totalEvents, rejectedTags, hotRejections }
}

/**
 * Render the patterns into a concise system-prompt block. Returns empty
 * string when there's nothing meaningful to inject (no history yet, or
 * fewer than 3 rejections — not enough signal).
 *
 * Tone: SOFT prior. Venice is told to "avoid emitting these unless the
 * frame strongly supports them" — not a hard ban, because some legitimate
 * tags get rejected for one-off reasons.
 */
export function renderRejectionPatternsForPrompt(p: RejectionPatterns): string {
  if (p.hotRejections.length === 0) return ''

  return `═══════════════════════════════════════════════════════════════════════
USER PATTERNS — TAGS PREVIOUSLY REJECTED ACROSS THE LIBRARY
═══════════════════════════════════════════════════════════════════════
The user has rejected these tags on multiple videos before. Treat them
as a STRONG SOFT prior: avoid emitting them unless the current frame
unambiguously shows the concept. When in doubt, pick a different tag.

Often-rejected: ${p.hotRejections.slice(0, 20).join(', ')}
═══════════════════════════════════════════════════════════════════════`
}

// ─── Module-level cache ─────────────────────────────────────────────────────
//
// Aggregation walks every rejection_history row + parses JSON. Cheap
// per call but called once per Venice frame. A 2-minute TTL is plenty
// — rejection events are user-driven, not high-frequency.

let cached: { patterns: RejectionPatterns; expiresAt: number } | null = null
const CACHE_TTL_MS = 2 * 60 * 1000

export function getCachedRejectionPatterns(rawDb: Database.Database): RejectionPatterns {
  const now = Date.now()
  if (cached && cached.expiresAt > now) return cached.patterns
  const patterns = aggregateRejectionPatterns(rawDb)
  cached = { patterns, expiresAt: now + CACHE_TTL_MS }
  return patterns
}

/** Invalidate the cache — call from the reject() path so a fresh rejection
 *  propagates to the next Tier 2 call without waiting for the TTL. */
export function invalidateRejectionPatternsCache(): void {
  cached = null
}
