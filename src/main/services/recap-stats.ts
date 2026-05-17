// File: src/main/services/recap-stats.ts
//
// #303 D-79 — Spotify Wrapped-style Recap cards. Aggregates viewing
// history into shareable monthly / mid-year / yearly recap blocks.
// Each recap has a small set of headline stats designed for a single
// card-sized UI presentation.
//
// All queries hit existing media_stats + media tables — no new
// columns needed. Watch history is approximated from
// media_stats.views + lastViewedAt (per-view timestamps live in a
// separate watch-history table if available; otherwise we approximate
// from lastViewedAt as a single bucket).

import type Database from 'better-sqlite3'
type Raw = Database.Database

export interface RecapStats {
  windowLabel: string         // "May 2026" / "H1 2026" / "2026"
  windowStart: number         // epoch ms
  windowEnd: number           // epoch ms (exclusive)
  totalViews: number
  totalWatchMinutes: number   // estimated (views × durationSec / 60)
  uniqueMediaWatched: number
  topMedia: Array<{ mediaId: string; filename: string; views: number; thumbPath: string | null }>
  topTags: Array<{ name: string; useCount: number }>
  topPerformers: Array<{ name: string; useCount: number }>
  topStudios: Array<{ name: string; useCount: number }>
  avgRating: number | null
  newImports: number
  fiveStarItems: number
  highlights: string[]        // human-readable one-liners
}

interface Window {
  start: number
  end: number
  label: string
}

function monthWindow(year: number, month0: number): Window {
  const start = new Date(year, month0, 1).getTime()
  const end = new Date(year, month0 + 1, 1).getTime()
  const labelMonth = new Date(year, month0).toLocaleString('en-US', { month: 'long' })
  return { start, end, label: `${labelMonth} ${year}` }
}

function halfYearWindow(year: number, half: 1 | 2): Window {
  const startMonth = half === 1 ? 0 : 6
  const start = new Date(year, startMonth, 1).getTime()
  const end = new Date(year, startMonth + 6, 1).getTime()
  return { start, end, label: `H${half} ${year}` }
}

function yearWindow(year: number): Window {
  const start = new Date(year, 0, 1).getTime()
  const end = new Date(year + 1, 0, 1).getTime()
  return { start, end, label: `${year}` }
}

function computeForWindow(db: Raw, win: Window): RecapStats {
  // Views: rows in media_stats where lastViewedAt falls in window AND
  // views > 0. (Approximation — true per-view timestamps would need a
  // watch_history table; using lastViewedAt under-counts items watched
  // multiple times across the window but is good enough for Recap.)
  const baseRows = db.prepare(`
    SELECT m.id AS mediaId, m.filename, m.thumbPath, m.durationSec,
           s.views, s.rating, s.lastViewedAt
    FROM media_stats s
    JOIN media m ON m.id = s.mediaId
    WHERE s.lastViewedAt >= ? AND s.lastViewedAt < ?
  `).all(win.start, win.end) as Array<{ mediaId: string; filename: string; thumbPath: string | null; durationSec: number | null; views: number; rating: number; lastViewedAt: number }>

  const totalViews = baseRows.reduce((s, r) => s + (r.views || 0), 0)
  const totalWatchMinutes = Math.round(baseRows.reduce((s, r) => s + ((r.views || 0) * (r.durationSec || 0)), 0) / 60)
  const uniqueMediaWatched = baseRows.length
  const ratedRows = baseRows.filter((r) => r.rating > 0)
  const avgRating = ratedRows.length > 0
    ? Math.round((ratedRows.reduce((s, r) => s + r.rating, 0) / ratedRows.length) * 10) / 10
    : null
  const fiveStarItems = baseRows.filter((r) => r.rating >= 5).length

  const sortedByViews = [...baseRows].sort((a, b) => b.views - a.views).slice(0, 5)
  const topMedia = sortedByViews.map((r) => ({
    mediaId: r.mediaId, filename: r.filename, views: r.views, thumbPath: r.thumbPath,
  }))

  // Top tags / performers / studios — aggregate across the watched
  // media's tags. We bucket performers + studios separately by name
  // prefix; everything else is a generic tag.
  const tagCounts = new Map<string, number>()
  const perfCounts = new Map<string, number>()
  if (baseRows.length > 0) {
    const ids = baseRows.map((r) => r.mediaId)
    const placeholders = ids.map(() => '?').join(',')
    const tagRows = db.prepare(`
      SELECT t.name AS name, COUNT(*) AS n
      FROM media_tags mt
      JOIN tags t ON t.id = mt.tagId
      WHERE mt.mediaId IN (${placeholders})
      GROUP BY t.name
    `).all(...ids) as Array<{ name: string; n: number }>
    for (const t of tagRows) {
      if (t.name.startsWith('performer:')) {
        perfCounts.set(t.name.slice('performer:'.length), t.n)
      } else if (t.name.startsWith('studio:') || t.name.startsWith('platform:')) {
        // skip from generic tag list — we'll handle studios below
      } else {
        tagCounts.set(t.name, t.n)
      }
    }
  }
  const topTags = Array.from(tagCounts.entries())
    .sort((a, b) => b[1] - a[1]).slice(0, 8)
    .map(([name, useCount]) => ({ name, useCount }))
  const topPerformers = Array.from(perfCounts.entries())
    .sort((a, b) => b[1] - a[1]).slice(0, 5)
    .map(([name, useCount]) => ({ name, useCount }))

  // Studios: watched media with studio_id, joined to studios table.
  let topStudios: Array<{ name: string; useCount: number }> = []
  try {
    if (baseRows.length > 0) {
      const ids = baseRows.map((r) => r.mediaId)
      const placeholders = ids.map(() => '?').join(',')
      const studioRows = db.prepare(`
        SELECT st.name AS name, COUNT(*) AS n
        FROM media m
        JOIN studios st ON st.id = m.studio_id
        WHERE m.id IN (${placeholders})
        GROUP BY st.name
        ORDER BY n DESC
        LIMIT 5
      `).all(...ids) as Array<{ name: string; n: number }>
      topStudios = studioRows.map((r) => ({ name: r.name, useCount: r.n }))
    }
  } catch { /* studios table may not exist yet */ }

  // New imports in the window: media.addedAt in range.
  const newImportRow = db.prepare(`SELECT COUNT(*) AS n FROM media WHERE addedAt >= ? AND addedAt < ?`).get(win.start, win.end) as { n: number }
  const newImports = newImportRow.n

  // Highlights — auto-generated headline strings.
  const highlights: string[] = []
  if (totalWatchMinutes > 0) highlights.push(`You watched ${totalWatchMinutes.toLocaleString()} minutes (~${Math.round(totalWatchMinutes / 60)} hours)`)
  if (uniqueMediaWatched > 0) highlights.push(`${uniqueMediaWatched} unique items watched`)
  if (newImports > 0) highlights.push(`${newImports} new files added`)
  if (fiveStarItems > 0) highlights.push(`${fiveStarItems} item${fiveStarItems > 1 ? 's' : ''} earned 5 stars`)
  if (topPerformers[0]) highlights.push(`Most-watched performer: ${topPerformers[0].name} (×${topPerformers[0].useCount})`)
  if (topTags[0]) highlights.push(`Most-tagged: ${topTags[0].name} (×${topTags[0].useCount})`)
  if (topStudios[0]) highlights.push(`Top studio: ${topStudios[0].name} (×${topStudios[0].useCount})`)

  return {
    windowLabel: win.label,
    windowStart: win.start,
    windowEnd: win.end,
    totalViews,
    totalWatchMinutes,
    uniqueMediaWatched,
    topMedia,
    topTags,
    topPerformers,
    topStudios,
    avgRating,
    newImports,
    fiveStarItems,
    highlights,
  }
}

export function getMonthlyRecap(db: Raw, year?: number, month0?: number): RecapStats {
  const now = new Date()
  return computeForWindow(db, monthWindow(year ?? now.getFullYear(), month0 ?? now.getMonth()))
}

export function getHalfYearRecap(db: Raw, year?: number, half?: 1 | 2): RecapStats {
  const now = new Date()
  const h: 1 | 2 = half ?? (now.getMonth() < 6 ? 1 : 2)
  return computeForWindow(db, halfYearWindow(year ?? now.getFullYear(), h))
}

export function getYearlyRecap(db: Raw, year?: number): RecapStats {
  return computeForWindow(db, yearWindow(year ?? new Date().getFullYear()))
}
