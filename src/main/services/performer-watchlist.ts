// File: src/main/services/performer-watchlist.ts
//
// Whisparr-style performer watchlist (#56). Users flag performers they
// want to follow; this service maintains the schedule + dedup logic
// for periodic polls against Browse sources, surfaces hits as
// pending entries the user can approve / dismiss / queue-for-download
// from the Performers tab.
//
// Polling is INTENTIONALLY conservative — each performer gets one
// poll per N hours (default 24), and the scheduler staggers them so
// we don't hammer all sources at once. The poller calls existing
// Browse APIs (TpDB / Reddit / Bluesky / RedGifs / boorus) under the
// hood — no new auth / scraping logic in this module.
//
// What this module DOES:
//   - CRUD + dedup over performer_watchlist + performer_watchlist_hits
//   - Schedule next-poll-at deterministically (with jitter)
//   - Dispatch poll requests to existing Browse-source adapters
//   - Persist new uploads as 'pending' hits
//
// What this module does NOT do:
//   - Download files (the user clicks "queue" on a hit to add it to
//     the URL downloader queue)
//   - Auto-tag / auto-organize downloaded files (queue handles that)
//   - Manage source authentication (each Browse source manages its
//     own credentials via settings.ai)

import { nanoid } from 'nanoid'
import type { DB } from '../db'

export type WatchlistSourceName =
  | 'tpdb'
  | 'reddit'
  | 'bluesky'
  | 'redgifs'
  | 'e621'
  | 'danbooru'
  | 'gelbooru'

export interface WatchlistEntry {
  performerName: string
  faceClusterId: string | null
  sources: WatchlistSourceName[]
  enabled: boolean
  lastPolledAt: number | null
  nextPollAt: number | null
  pollIntervalHours: number
  addedAt: number
  notes: string | null
}

export interface WatchlistHit {
  id: string
  performerName: string
  sourceName: string
  sourceId: string | null
  url: string
  title: string | null
  thumbUrl: string | null
  releasedAt: number | null
  discoveredAt: number
  status: 'pending' | 'queued' | 'dismissed' | 'downloaded'
  notes: string | null
}

const DEFAULT_POLL_INTERVAL_HOURS = 24
const POLL_JITTER_PCT = 0.1  // ±10% jitter so all watchlist entries
                              // don't poll at the same wall-clock time

function jitteredNextPoll(intervalHours: number): number {
  const ms = intervalHours * 3600 * 1000
  const jitter = ms * POLL_JITTER_PCT * (Math.random() - 0.5) * 2
  return Date.now() / 1000 + (ms + jitter) / 1000
}

export function addWatchlistEntry(
  db: DB,
  opts: {
    performerName: string
    faceClusterId?: string | null
    sources?: WatchlistSourceName[]
    pollIntervalHours?: number
    notes?: string
  }
): WatchlistEntry {
  const name = opts.performerName.trim().toLowerCase()
  if (!name) throw new Error('performerName required')
  const sources = opts.sources && opts.sources.length > 0
    ? opts.sources
    : (['tpdb', 'reddit', 'bluesky'] as WatchlistSourceName[])
  const pollIntervalHours = Math.max(1, Math.min(168, opts.pollIntervalHours ?? DEFAULT_POLL_INTERVAL_HOURS))
  const now = Date.now() / 1000
  const nextPollAt = jitteredNextPoll(pollIntervalHours)
  db.raw.prepare(`
    INSERT INTO performer_watchlist
      (performer_name, face_cluster_id, sources, enabled, last_polled_at, next_poll_at, poll_interval_hours, added_at, notes)
    VALUES (?, ?, ?, 1, NULL, ?, ?, ?, ?)
    ON CONFLICT(performer_name) DO UPDATE SET
      face_cluster_id = excluded.face_cluster_id,
      sources = excluded.sources,
      enabled = 1,
      poll_interval_hours = excluded.poll_interval_hours,
      notes = excluded.notes
  `).run(
    name,
    opts.faceClusterId ?? null,
    JSON.stringify(sources),
    nextPollAt,
    pollIntervalHours,
    now,
    opts.notes ?? null,
  )
  return getWatchlistEntry(db, name)!
}

export function getWatchlistEntry(db: DB, performerName: string): WatchlistEntry | null {
  const row = db.raw.prepare(`
    SELECT * FROM performer_watchlist WHERE performer_name = ?
  `).get(performerName.toLowerCase()) as any | undefined
  if (!row) return null
  return rowToEntry(row)
}

export function listWatchlistEntries(db: DB, options?: { enabledOnly?: boolean }): WatchlistEntry[] {
  const sql = options?.enabledOnly
    ? `SELECT * FROM performer_watchlist WHERE enabled = 1 ORDER BY added_at DESC`
    : `SELECT * FROM performer_watchlist ORDER BY added_at DESC`
  const rows = db.raw.prepare(sql).all() as any[]
  return rows.map(rowToEntry)
}

export function removeWatchlistEntry(db: DB, performerName: string): void {
  db.raw.prepare(`DELETE FROM performer_watchlist WHERE performer_name = ?`).run(performerName.toLowerCase())
}

export function setWatchlistEnabled(db: DB, performerName: string, enabled: boolean): void {
  db.raw.prepare(`
    UPDATE performer_watchlist SET enabled = ? WHERE performer_name = ?
  `).run(enabled ? 1 : 0, performerName.toLowerCase())
}

function rowToEntry(row: any): WatchlistEntry {
  let sources: WatchlistSourceName[] = []
  try {
    const parsed = JSON.parse(row.sources ?? '[]')
    if (Array.isArray(parsed)) {
      sources = parsed.filter((s): s is WatchlistSourceName => typeof s === 'string')
    }
  } catch { /* default to empty */ }
  return {
    performerName: row.performer_name,
    faceClusterId: row.face_cluster_id ?? null,
    sources,
    enabled: !!row.enabled,
    lastPolledAt: row.last_polled_at ?? null,
    nextPollAt: row.next_poll_at ?? null,
    pollIntervalHours: row.poll_interval_hours,
    addedAt: row.added_at,
    notes: row.notes ?? null,
  }
}

// ─── Hits ──────────────────────────────────────────────────────────

/** Persist a hit. Idempotent — dedupes on (performer, source, sourceId). */
export function recordHit(db: DB, hit: Omit<WatchlistHit, 'id' | 'discoveredAt'>): WatchlistHit | null {
  const id = nanoid()
  const now = Date.now() / 1000
  try {
    db.raw.prepare(`
      INSERT INTO performer_watchlist_hits
        (id, performer_name, source_name, source_id, url, title, thumb_url, released_at, discovered_at, status, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      hit.performerName.toLowerCase(),
      hit.sourceName,
      hit.sourceId ?? null,
      hit.url,
      hit.title ?? null,
      hit.thumbUrl ?? null,
      hit.releasedAt ?? null,
      now,
      hit.status ?? 'pending',
      hit.notes ?? null,
    )
  } catch (err: any) {
    if (err?.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return null  // already known
    }
    throw err
  }
  return { ...hit, id, discoveredAt: now }
}

export function listHits(
  db: DB,
  options?: { performerName?: string; status?: WatchlistHit['status']; limit?: number; offset?: number }
): WatchlistHit[] {
  const wheres: string[] = []
  const params: any[] = []
  if (options?.performerName) {
    wheres.push('performer_name = ?')
    params.push(options.performerName.toLowerCase())
  }
  if (options?.status) {
    wheres.push('status = ?')
    params.push(options.status)
  }
  const where = wheres.length > 0 ? `WHERE ${wheres.join(' AND ')}` : ''
  const limit = Math.max(1, Math.min(1000, options?.limit ?? 100))
  const offset = Math.max(0, options?.offset ?? 0)
  const rows = db.raw.prepare(`
    SELECT * FROM performer_watchlist_hits
    ${where}
    ORDER BY discovered_at DESC
    LIMIT ? OFFSET ?
  `).all(...params, limit, offset) as any[]
  return rows.map((r) => ({
    id: r.id,
    performerName: r.performer_name,
    sourceName: r.source_name,
    sourceId: r.source_id ?? null,
    url: r.url,
    title: r.title ?? null,
    thumbUrl: r.thumb_url ?? null,
    releasedAt: r.released_at ?? null,
    discoveredAt: r.discovered_at,
    status: r.status,
    notes: r.notes ?? null,
  }))
}

export function setHitStatus(
  db: DB,
  hitId: string,
  status: WatchlistHit['status']
): void {
  db.raw.prepare(`UPDATE performer_watchlist_hits SET status = ? WHERE id = ?`).run(status, hitId)
}

// ─── Poller ────────────────────────────────────────────────────────

/**
 * Return performers due for a poll right now. The scheduler should
 * call this periodically (every minute or so) and poll each entry.
 * Stale entries (next_poll_at past current time) are returned
 * oldest-first so the scheduler catches up gracefully after sleep.
 */
export function getEntriesDueForPoll(db: DB, now: number = Date.now() / 1000, max: number = 5): WatchlistEntry[] {
  const rows = db.raw.prepare(`
    SELECT * FROM performer_watchlist
    WHERE enabled = 1
      AND (next_poll_at IS NULL OR next_poll_at <= ?)
    ORDER BY COALESCE(last_polled_at, 0) ASC
    LIMIT ?
  `).all(now, max) as any[]
  return rows.map(rowToEntry)
}

/**
 * Mark an entry as having been polled — updates last_polled_at and
 * schedules the next poll with jitter. Called by the poller after it
 * finishes hitting all configured sources for the performer.
 */
export function markPolled(db: DB, performerName: string, intervalHours: number): void {
  const now = Date.now() / 1000
  const next = jitteredNextPoll(intervalHours)
  db.raw.prepare(`
    UPDATE performer_watchlist
    SET last_polled_at = ?, next_poll_at = ?
    WHERE performer_name = ?
  `).run(now, next, performerName.toLowerCase())
}

export interface WatchlistPollStats {
  performersPolled: number
  hitsRecorded: number
  hitsAlreadyKnown: number
  sourceErrors: number
  attemptedSources: Record<string, number>
}

/**
 * Run one poll cycle. Pulls up to `maxPerformers` due entries from
 * the watchlist, dispatches to each configured source via
 * `dispatchPoll`, persists new hits, marks entries polled.
 *
 * `dispatchPoll` is injected so this module doesn't need direct
 * knowledge of the Browse-source clients (which live in
 * ai-intelligence/booru-client.ts and similar). The caller wires up
 * a closure that knows how to invoke each source by name.
 */
export async function runPollCycle(
  db: DB,
  dispatchPoll: (
    entry: WatchlistEntry,
    source: WatchlistSourceName
  ) => Promise<Array<Omit<WatchlistHit, 'id' | 'discoveredAt' | 'status'>>>,
  options?: { maxPerformers?: number }
): Promise<WatchlistPollStats> {
  const stats: WatchlistPollStats = {
    performersPolled: 0,
    hitsRecorded: 0,
    hitsAlreadyKnown: 0,
    sourceErrors: 0,
    attemptedSources: {},
  }
  const due = getEntriesDueForPoll(db, Date.now() / 1000, options?.maxPerformers ?? 5)
  for (const entry of due) {
    for (const src of entry.sources) {
      stats.attemptedSources[src] = (stats.attemptedSources[src] ?? 0) + 1
      try {
        const results = await dispatchPoll(entry, src)
        for (const r of results) {
          const persisted = recordHit(db, { ...r, status: 'pending' })
          if (persisted) stats.hitsRecorded++
          else stats.hitsAlreadyKnown++
        }
      } catch (err) {
        stats.sourceErrors++
        console.warn(`[WatchlistPoller] ${entry.performerName}/${src} failed:`, err)
      }
    }
    markPolled(db, entry.performerName, entry.pollIntervalHours)
    stats.performersPolled++
  }
  return stats
}
