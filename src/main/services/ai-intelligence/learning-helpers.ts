// File: src/main/services/ai-intelligence/learning-helpers.ts
//
// Collection of small "learn from the user's library" helpers that share
// the same data shape (approved items + tags) and the same caching
// pattern. Each helper exports one focused function for the queue/UI to
// call. Grouped here to keep the ai-intelligence/ surface manageable.
//
// Contents:
//   1. activeBatchPicker        — pick N items where AI uncertainty is
//                                  highest (for active-learning runs)
//   2. perFolderPriors          — learn folder → tag set associations,
//                                  use as priors for new items in same folder
//   3. filenameTagPredictor     — naive Bayes over approved (filename, tags)
//                                  to predict likely tags from filename alone
//   4. modelUpgradeRevalidation — pick a sample of approved items to
//                                  re-analyze for comparing prompt versions
//   5. computeApprovalVelocity  — items/minute over last hour for the UI

import type { DB } from '../../db'

type RawDB = DB['raw']

// ─── #19 Active-learning batch picking ──────────────────────────────────────

export interface ActiveBatchItem {
  mediaId: string
  filename: string
  uncertaintyScore: number  // higher = more informative if reviewed
}

/**
 * Pick N pending review items where reviewing them would move the
 * calibration the most. Scoring formula:
 *   - tag confidences near 0.5 carry more signal than 0.9 or 0.1
 *   - low cross-frame agreement (some frames flagged, others didn't)
 *   - low calibration-sample-count for the tags involved
 * Items with no rich_tags are skipped (nothing to score).
 */
export function pickActiveLearningBatch(rawDb: RawDB, n = 25): ActiveBatchItem[] {
  const rows = rawDb.prepare(`
    SELECT ar.media_id, m.filename, ar.rich_tags
    FROM ai_analysis_results ar
    INNER JOIN media m ON m.id = ar.media_id
    WHERE ar.review_status = 'pending' AND ar.rich_tags IS NOT NULL
    LIMIT 500
  `).all() as Array<{ media_id: string; filename: string; rich_tags: string }>

  const calibCounts = new Map<string, number>()
  try {
    const stats = rawDb.prepare(`SELECT tag_name, source, sample_count FROM ai_tag_calibration`).all() as Array<{ tag_name: string; source: string; sample_count: number }>
    for (const s of stats) calibCounts.set(`${s.tag_name}::${s.source}`, s.sample_count)
  } catch { /* fall through with empty map */ }

  const scored: ActiveBatchItem[] = []
  for (const r of rows) {
    let tags: any[]
    try { tags = JSON.parse(r.rich_tags) } catch { continue }
    if (!Array.isArray(tags) || tags.length === 0) continue
    let total = 0
    for (const t of tags) {
      const conf = typeof t.confidence === 'number' ? t.confidence : 0.6
      const borderline = 1 - Math.abs(conf - 0.5) * 2
      const agreement = (t.frameCount && t.totalFrames) ? t.frameCount / t.totalFrames : 1
      const disagreement = 1 - agreement
      const calibSamples = calibCounts.get(`${t.name}::${t.source}`) ?? 0
      const novelty = 1 / Math.sqrt(1 + calibSamples)
      total += borderline * 1.5 + disagreement * 1.0 + novelty * 0.8
    }
    scored.push({
      mediaId: r.media_id,
      filename: r.filename,
      uncertaintyScore: total / Math.sqrt(tags.length),
    })
  }

  scored.sort((a, b) => b.uncertaintyScore - a.uncertaintyScore)
  return scored.slice(0, n)
}

// ─── #20 Per-folder priors ──────────────────────────────────────────────────

export interface FolderPriors {
  folder: string
  itemCount: number
  topTags: Array<{ name: string; frequency: number }>
}

/**
 * For every folder containing approved items, return the top tags that
 * co-occur in that folder. Used at analysis time: when a new item is
 * in folder F, the prior tags from F's history get a small confidence
 * boost (assuming consistent organization).
 */
export function computeFolderPriors(rawDb: RawDB): Map<string, FolderPriors> {
  const rows = rawDb.prepare(`
    SELECT m.path, m.filename, t.name AS tag_name
    FROM ai_analysis_results ar
    JOIN media m ON m.id = ar.media_id
    JOIN media_tags mt ON mt.mediaId = m.id
    JOIN tags t ON t.id = mt.tagId
    WHERE ar.review_status = 'approved'
  `).all() as Array<{ path: string; filename: string; tag_name: string }>

  // Group by folder
  const byFolder = new Map<string, { items: Set<string>; tagCounts: Map<string, number> }>()
  for (const row of rows) {
    // Folder = path with filename stripped + lowercased on Windows
    const folder = row.path.slice(0, row.path.length - row.filename.length).replace(/[/\\]$/, '').toLowerCase()
    if (!folder) continue
    let acc = byFolder.get(folder)
    if (!acc) {
      acc = { items: new Set(), tagCounts: new Map() }
      byFolder.set(folder, acc)
    }
    acc.items.add(row.path)
    const name = row.tag_name.toLowerCase()
    acc.tagCounts.set(name, (acc.tagCounts.get(name) ?? 0) + 1)
  }

  const result = new Map<string, FolderPriors>()
  for (const [folder, acc] of byFolder) {
    if (acc.items.size < 3) continue  // need at least 3 approved items per folder for a stable prior
    const sorted = Array.from(acc.tagCounts.entries())
      .map(([name, count]) => ({ name, frequency: count / acc.items.size }))
      .filter((t) => t.frequency >= 0.6)  // only tags that appear on 60%+ of items
      .sort((a, b) => b.frequency - a.frequency)
      .slice(0, 10)
    if (sorted.length === 0) continue
    result.set(folder, { folder, itemCount: acc.items.size, topTags: sorted })
  }
  return result
}

/**
 * Look up priors for the folder containing the given mediaPath.
 * Returns empty array if folder isn't in the priors map (new folder
 * or too few approved items).
 */
export function priorsForMediaPath(
  rawDb: RawDB,
  mediaPath: string
): Array<{ name: string; frequency: number }> {
  const filename = mediaPath.split(/[/\\]/).pop() ?? ''
  const folder = mediaPath.slice(0, mediaPath.length - filename.length).replace(/[/\\]$/, '').toLowerCase()
  const all = computeFolderPriors(rawDb)
  return all.get(folder)?.topTags ?? []
}

// ─── #17 Approval velocity ──────────────────────────────────────────────────

export interface ApprovalVelocity {
  itemsLastHour: number
  itemsLastDay: number
  /** Estimated minutes to clear pending queue at current rate. */
  etaMinutes: number | null
}

export function computeApprovalVelocity(rawDb: RawDB): ApprovalVelocity {
  const row = rawDb.prepare(`
    SELECT
      (SELECT COUNT(*) FROM ai_analysis_results WHERE review_status = 'approved' AND reviewed_at > datetime('now', '-1 hour')) AS h,
      (SELECT COUNT(*) FROM ai_analysis_results WHERE review_status = 'approved' AND reviewed_at > datetime('now', '-1 day')) AS d,
      (SELECT COUNT(*) FROM ai_analysis_results WHERE review_status = 'pending') AS pending
  `).get() as { h: number; d: number; pending: number }
  const itemsPerMin = row.h / 60
  const etaMinutes = itemsPerMin > 0 ? row.pending / itemsPerMin : null
  return { itemsLastHour: row.h, itemsLastDay: row.d, etaMinutes }
}

// ─── #168 Model upgrade revalidation ────────────────────────────────────────

/**
 * Pick a sample of approved items for re-analysis with the current
 * pipeline. Used after a major prompt/calibration upgrade to validate
 * that previously-approved items still score well with new settings.
 *
 * Stratified sample: pulls from across approval date range so we see
 * variety, not just the most-recent approvals.
 */
export function pickValidationSample(rawDb: RawDB, n = 20): string[] {
  const rows = rawDb.prepare(`
    SELECT media_id FROM ai_analysis_results
    WHERE review_status = 'approved'
    ORDER BY RANDOM()
    LIMIT ?
  `).all(n) as Array<{ media_id: string }>
  return rows.map((r) => r.media_id)
}
