// File: src/main/services/edging-tracker.ts
//
// #348 — Edging scoreboard. Tracks per-session start/end timestamps,
// climax-vs-denial outcome, and an XP score the user can chase as a
// gamified self-discipline mechanic. XP formula intentionally rewards
// denial (longer + denied = more XP):
//
//   xpEarned = floor(durationMin * (climaxed ? 0.5 : 1.5)) + denialBonus
//
//   denialBonus = streak * 5 (consecutive denied sessions multiply)
//
// #363 — Per-media denial cooldown. setDenialCooldown(mediaId, mins)
// stamps media_stats.denialUntilTs; the player UI checks via
// getDenialStatus() and renders a clarity overlay if true.
//
// Caller injects the better-sqlite3 connection (ipc.ts holds the
// canonical instance and threads it through).

import { nanoid } from 'nanoid'
import type Database from 'better-sqlite3'

type Raw = Database.Database

export interface EdgingSession {
  id: string
  startedAt: number
  endedAt: number | null
  durationSec: number | null
  climaxed: boolean
  xpEarned: number
  notes: string | null
}

export interface EdgingStats {
  totalSessions: number
  totalDeniedSessions: number
  totalClimaxSessions: number
  currentDenialStreak: number
  longestDenialStreak: number
  totalXp: number
  longestSessionSec: number
  averageSessionSec: number
}

function row2session(r: any): EdgingSession {
  return {
    id: r.id,
    startedAt: r.startedAt,
    endedAt: r.endedAt,
    durationSec: r.durationSec,
    climaxed: r.climaxed === 1,
    xpEarned: r.xpEarned,
    notes: r.notes,
  }
}

export function startEdgingSession(db: Raw): EdgingSession {
  // Close any dangling open session first (app crash recovery).
  const stale = db.prepare(`SELECT id FROM edging_sessions WHERE endedAt IS NULL LIMIT 1`).get() as { id: string } | undefined
  if (stale) {
    db.prepare(`UPDATE edging_sessions SET endedAt = ?, notes = COALESCE(notes, '') || ' (stale)' WHERE id = ?`)
      .run(Date.now(), stale.id)
  }
  const id = nanoid()
  const now = Date.now()
  db.prepare(`INSERT INTO edging_sessions (id, startedAt, endedAt, durationSec, climaxed, xpEarned, notes) VALUES (?, ?, NULL, NULL, 0, 0, NULL)`)
    .run(id, now)
  return { id, startedAt: now, endedAt: null, durationSec: null, climaxed: false, xpEarned: 0, notes: null }
}

// #350 — outcome vocabulary expanded to include 'ruined'. A ruined
// orgasm (orgasm without satisfaction) counts as a denial-streak
// continuation for streak purposes, gets a higher XP multiplier than
// denied (the user pushed past the edge but choked off completion),
// but is still recorded distinctly so the scoreboard can show it.
//
// Database storage stays in `climaxed INTEGER` (0/1) for back-compat,
// with the 'ruined' status flagged in the `notes` column as a marker
// prefix. Old clients reading the table see 'ruined' as 'denied'.
export type EdgingOutcome = 'climax' | 'denied' | 'ruined'

/** Returned alongside the closed session so the renderer can show
 *  exactly how the XP total was computed (base + streak + ruined). */
export interface XpBreakdown {
  base: number       // floor(durationMin * multiplier)
  multiplier: number // 0.5 / 1.5 / 2.0 by outcome
  durationMin: number
  streakBonus: number
  streakCount: number
  ruinedBonus: number
  total: number
}

export function endEdgingSession(db: Raw, opts: { outcome?: EdgingOutcome; climaxed?: boolean; notes?: string | null }): (EdgingSession & { xpBreakdown?: XpBreakdown }) | null {
  const open = db.prepare(`SELECT * FROM edging_sessions WHERE endedAt IS NULL ORDER BY startedAt DESC LIMIT 1`).get() as any
  if (!open) return null
  // Accept either the new `outcome` field or the legacy `climaxed` bool.
  const outcome: EdgingOutcome = opts.outcome ?? (opts.climaxed ? 'climax' : 'denied')
  const now = Date.now()
  const durSec = Math.round((now - open.startedAt) / 1000)
  const continuingStreak = outcome === 'climax' ? 0 : computeCurrentDenialStreak(db) + 1
  const breakdown = computeXpBreakdown(durSec, outcome, continuingStreak)
  const xp = breakdown.total
  // Storage encoding: 'climax' → climaxed=1; 'denied'/'ruined' → climaxed=0
  // with the marker stuffed into notes so we can recover it on read.
  const climaxedInt = outcome === 'climax' ? 1 : 0
  const notesOut = outcome === 'ruined'
    ? `[ruined] ${opts.notes ?? ''}`.trim()
    : (opts.notes ?? null)
  db.prepare(`UPDATE edging_sessions SET endedAt = ?, durationSec = ?, climaxed = ?, xpEarned = ?, notes = ? WHERE id = ?`)
    .run(now, durSec, climaxedInt, xp, notesOut, open.id)
  const updated = db.prepare(`SELECT * FROM edging_sessions WHERE id = ?`).get(open.id) as any
  return { ...row2session(updated), xpBreakdown: breakdown }
}

function computeXpBreakdown(durationSec: number, outcome: EdgingOutcome, streakIfNotClimax: number): XpBreakdown {
  const durationMin = Math.max(0, durationSec / 60)
  // Multiplier table: climax = 0.5x (instant gratification penalty),
  // ruined = 2.0x (you got close AND chose to suffer — highest reward),
  // denied = 1.5x (controlled stop).
  const multiplier = outcome === 'climax' ? 0.5 : outcome === 'ruined' ? 2.0 : 1.5
  const base = Math.floor(durationMin * multiplier)
  const streakBonus = outcome === 'climax' ? 0 : streakIfNotClimax * 5
  // Ruined gets a flat +25 bonus on top — the act itself is XP-worthy.
  const ruinedBonus = outcome === 'ruined' ? 25 : 0
  return {
    base,
    multiplier,
    durationMin,
    streakBonus,
    streakCount: outcome === 'climax' ? 0 : streakIfNotClimax,
    ruinedBonus,
    total: base + streakBonus + ruinedBonus,
  }
}

function computeCurrentDenialStreak(db: Raw): number {
  const rows = db.prepare(`SELECT climaxed FROM edging_sessions WHERE endedAt IS NOT NULL ORDER BY endedAt DESC`).all() as Array<{ climaxed: number }>
  let streak = 0
  for (const r of rows) {
    if (r.climaxed === 0) streak++
    else break
  }
  return streak
}

export function getEdgingStats(db: Raw): EdgingStats {
  const closed = db.prepare(`SELECT * FROM edging_sessions WHERE endedAt IS NOT NULL ORDER BY endedAt DESC`).all() as any[]
  const totalSessions = closed.length
  const totalDeniedSessions = closed.filter((r) => r.climaxed === 0).length
  const totalClimaxSessions = totalSessions - totalDeniedSessions
  let currentStreak = 0
  for (const r of closed) {
    if (r.climaxed === 0) currentStreak++
    else break
  }
  let longestStreak = 0
  let run = 0
  for (let i = closed.length - 1; i >= 0; i--) {
    if (closed[i].climaxed === 0) { run++; if (run > longestStreak) longestStreak = run }
    else run = 0
  }
  const totalXp = closed.reduce((sum, r) => sum + (r.xpEarned ?? 0), 0)
  const longestSessionSec = closed.reduce((max, r) => Math.max(max, r.durationSec ?? 0), 0)
  const averageSessionSec = totalSessions > 0
    ? Math.round(closed.reduce((sum, r) => sum + (r.durationSec ?? 0), 0) / totalSessions)
    : 0
  return {
    totalSessions, totalDeniedSessions, totalClimaxSessions,
    currentDenialStreak: currentStreak, longestDenialStreak: longestStreak,
    totalXp, longestSessionSec, averageSessionSec,
  }
}

export function getRecentSessions(db: Raw, limit = 50): EdgingSession[] {
  const rows = db.prepare(`SELECT * FROM edging_sessions ORDER BY startedAt DESC LIMIT ?`).all(limit) as any[]
  return rows.map(row2session)
}

// ──────────────────────────────────────────────────────────────────────
// #376 H-152 — Orgasm budget & relapse ledger. The user sets a monthly
// allowance (N climaxes per calendar month). Each completed session
// with outcome='climax' decrements the budget. A "relapse" is any
// climax past the budget. The ledger reports current month usage,
// remaining budget, and a 6-month rolling history.
// ──────────────────────────────────────────────────────────────────────

export interface BudgetStatus {
  budget: number             // user-configured monthly budget (default 8)
  monthStart: number         // epoch ms of the current month's 1st
  climaxesThisMonth: number  // climax outcomes since monthStart
  ruinedThisMonth: number    // ruined outcomes (count against budget at 0.5×)
  remaining: number          // budget - climaxesThisMonth - 0.5 * ruined (floored at 0)
  inRelapse: boolean         // climaxes exceed budget
  relapseCount: number       // climaxes past budget this month
  budgetHealthPct: number    // 0..1, 1 = fresh budget, 0 = exhausted
}

function monthStartTs(d = new Date()): number {
  return new Date(d.getFullYear(), d.getMonth(), 1).getTime()
}

export function getOrgasmBudget(db: Raw, configuredBudget?: number): BudgetStatus {
  const budget = Math.max(1, configuredBudget ?? 8)
  const start = monthStartTs()
  const climaxRows = db.prepare(`SELECT COUNT(*) AS n FROM edging_sessions WHERE climaxed = 1 AND endedAt >= ?`).get(start) as { n: number }
  const ruinedRows = db.prepare(`SELECT COUNT(*) AS n FROM edging_sessions WHERE climaxed = 0 AND notes LIKE '[ruined]%' AND endedAt >= ?`).get(start) as { n: number }
  const climaxes = climaxRows.n
  const ruined = ruinedRows.n
  // Ruined counts at 0.5× — you got close + chose to suffer.
  const used = climaxes + ruined * 0.5
  const remaining = Math.max(0, budget - used)
  const inRelapse = climaxes > budget
  const relapseCount = Math.max(0, climaxes - budget)
  return {
    budget,
    monthStart: start,
    climaxesThisMonth: climaxes,
    ruinedThisMonth: ruined,
    remaining,
    inRelapse,
    relapseCount,
    budgetHealthPct: budget > 0 ? Math.max(0, Math.min(1, remaining / budget)) : 0,
  }
}

// 6-month rolling history. Each entry is one calendar month.
export function getBudgetHistory(db: Raw, budget: number, monthsBack = 6): Array<{
  monthStart: number
  monthLabel: string  // "2026-04"
  climaxes: number
  ruined: number
  relapses: number    // climaxes past budget that month
}> {
  const out: Array<{ monthStart: number; monthLabel: string; climaxes: number; ruined: number; relapses: number }> = []
  const now = new Date()
  for (let i = monthsBack - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const next = new Date(d.getFullYear(), d.getMonth() + 1, 1)
    const start = d.getTime()
    const end = next.getTime()
    const cr = db.prepare(`SELECT COUNT(*) AS n FROM edging_sessions WHERE climaxed = 1 AND endedAt >= ? AND endedAt < ?`).get(start, end) as { n: number }
    const rr = db.prepare(`SELECT COUNT(*) AS n FROM edging_sessions WHERE climaxed = 0 AND notes LIKE '[ruined]%' AND endedAt >= ? AND endedAt < ?`).get(start, end) as { n: number }
    out.push({
      monthStart: start,
      monthLabel: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
      climaxes: cr.n,
      ruined: rr.n,
      relapses: Math.max(0, cr.n - budget),
    })
  }
  return out
}

// ──────────────────────────────────────────────────────────────────────
// #363 — per-media denial cooldown
// ──────────────────────────────────────────────────────────────────────

export function setDenialCooldown(db: Raw, mediaId: string, durationMin: number): { until: number } {
  const until = Date.now() + Math.max(1, durationMin) * 60 * 1000
  const now = Date.now()
  db.prepare(`
    INSERT INTO media_stats (mediaId, views, lastViewedAt, rating, oCount, updatedAt, denialUntilTs)
    VALUES (?, 0, NULL, 0, 0, ?, ?)
    ON CONFLICT(mediaId) DO UPDATE SET denialUntilTs = excluded.denialUntilTs, updatedAt = excluded.updatedAt
  `).run(mediaId, now, until)
  return { until }
}

export function clearDenialCooldown(db: Raw, mediaId: string): void {
  db.prepare(`UPDATE media_stats SET denialUntilTs = NULL, updatedAt = ? WHERE mediaId = ?`)
    .run(Date.now(), mediaId)
}

export function getDenialStatus(db: Raw, mediaId: string): { active: boolean; until: number | null; remainingMs: number } {
  const row = db.prepare(`SELECT denialUntilTs FROM media_stats WHERE mediaId = ?`).get(mediaId) as { denialUntilTs: number | null } | undefined
  const until = row?.denialUntilTs ?? null
  const now = Date.now()
  const active = !!(until && until > now)
  return { active, until, remainingMs: active ? until! - now : 0 }
}

// Bulk lookup — returns every media with an active denial cooldown, so
// the library can paint badges on cards without firing N IPCs.
export function listActiveDenials(db: Raw): Array<{ mediaId: string; until: number; remainingMs: number }> {
  const now = Date.now()
  const rows = db.prepare(
    `SELECT mediaId, denialUntilTs FROM media_stats WHERE denialUntilTs IS NOT NULL AND denialUntilTs > ?`
  ).all(now) as Array<{ mediaId: string; denialUntilTs: number }>
  return rows.map((r) => ({ mediaId: r.mediaId, until: r.denialUntilTs, remainingMs: r.denialUntilTs - now }))
}
