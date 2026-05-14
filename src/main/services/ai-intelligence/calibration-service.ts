// ===============================
// File: src/main/services/ai-intelligence/calibration-service.ts
//
// Confidence calibration over time. Ported in spirit from
// content_analyzer/analyzer.py:LearningDatabase.confidence_history +
// correction_history.
//
// Two signals feed every prediction:
//   1. SAMPLE MEAN — for a given (tag, source), what's the historical
//      avg raw confidence Tier 2 has produced? Use that as a Bayesian
//      prior on new predictions.
//   2. USER FEEDBACK — how often has the user approved this tag in the
//      review queue vs rejected it? Tags the user keeps rejecting get
//      their confidence multiplied down; tags they consistently approve
//      get bumped up.
//
// Both are blended into a calibrated confidence used by:
//   - the review queue's display (sort + visual indicators)
//   - the similarity engine's vector weights (better signal = better recs)
//   - the auto-categorize threshold (avoid auto-applying tags the user
//     has historically rejected)
// ===============================

import type { DB } from '../../db'

type RawDB = DB['raw']

// Bayesian-style blending: incoming weight α decreases as sample count
// rises, so a tag with 100 historical samples mostly trusts its mean.
// Tag with 1 sample mostly trusts the new prediction.
const PRIOR_STRENGTH = 8

// Approve/reject ratio scales the final confidence. Cap the multiplier
// between 0.4× and 1.15× so the calibration nudges, not destroys.
const FEEDBACK_MIN = 0.4
const FEEDBACK_MAX = 1.15

export interface CalibrationStat {
  tagName: string
  source: string
  sampleCount: number
  meanConfidence: number  // 0..1
  approvedCount: number
  rejectedCount: number
  approvalRatio: number   // 0..1, defaults to 0.5 with no feedback
  lastSeen: string
}

export class CalibrationService {
  private rawDb: RawDB

  // Hot cache — populated on first lookup, kept in sync with writes.
  private cache = new Map<string, CalibrationStat>()
  private cacheLoaded = false

  constructor(db: DB) {
    this.rawDb = db.raw
  }

  private key(tagName: string, source: string): string {
    return `${tagName}::${source}`
  }

  private loadCache(): void {
    if (this.cacheLoaded) return
    try {
      const rows = this.rawDb.prepare(`
        SELECT tag_name, source, sample_count, sum_confidence,
               approved_count, rejected_count, last_seen
        FROM ai_tag_calibration
      `).all() as Array<{
        tag_name: string; source: string; sample_count: number; sum_confidence: number;
        approved_count: number; rejected_count: number; last_seen: string
      }>
      for (const r of rows) {
        this.cache.set(this.key(r.tag_name, r.source), {
          tagName: r.tag_name,
          source: r.source,
          sampleCount: r.sample_count,
          meanConfidence: r.sample_count > 0 ? r.sum_confidence / r.sample_count : 0.5,
          approvedCount: r.approved_count,
          rejectedCount: r.rejected_count,
          approvalRatio: this.computeApprovalRatio(r.approved_count, r.rejected_count),
          lastSeen: r.last_seen
        })
      }
      this.cacheLoaded = true
      console.log(`[Calibration] Loaded ${this.cache.size} tag stats`)
    } catch (err) {
      // Migration may not have run yet — service stays empty until then.
      console.warn('[Calibration] cache load failed (will retry):', err)
    }
  }

  private computeApprovalRatio(approved: number, rejected: number): number {
    const total = approved + rejected
    if (total === 0) return 0.5  // no feedback yet → neutral
    // Wilson-ish smoothing: a tag with 1 approval shouldn't read as 100%.
    return (approved + 1) / (total + 2)
  }

  /** Fetch a single calibration row. Returns undefined for unseen tags. */
  get(tagName: string, source: string): CalibrationStat | undefined {
    this.loadCache()
    return this.cache.get(this.key(tagName, source))
  }

  /**
   * Apply calibration to a raw confidence value.
   *   - Blends raw toward historical mean using PRIOR_STRENGTH
   *   - Multiplies by an approval-ratio factor in [FEEDBACK_MIN, FEEDBACK_MAX]
   *   - Recent decisions weigh more than old ones (exponential decay)
   *
   * For unseen tags this returns the raw value unchanged.
   */
  calibrate(tagName: string, source: string, rawConfidence: number): number {
    const stat = this.get(tagName, source)
    if (!stat || stat.sampleCount === 0) return rawConfidence

    // Blend raw toward historical mean.
    const alpha = PRIOR_STRENGTH / (PRIOR_STRENGTH + stat.sampleCount)
    const blended = alpha * rawConfidence + (1 - alpha) * stat.meanConfidence

    // Apply time-decayed approval ratio. The freshness multiplier comes
    // from how long ago `lastSeen` was — recent feedback weights more
    // because the user's taste evolves. Half-life is ~30 days.
    //
    // Decay formula:
    //   weight = 0.5 ^ (daysSinceLastSeen / 30)
    //   adjustedRatio = ratio * weight + 0.5 * (1 - weight)
    // → As feedback ages, the ratio drifts back toward 0.5 (neutral),
    //   so old "always reject" signals stop overriding new reality.
    let adjustedRatio = stat.approvalRatio
    try {
      const lastSeenTs = stat.lastSeen ? new Date(stat.lastSeen).getTime() : Date.now()
      const daysSince = (Date.now() - lastSeenTs) / 86_400_000
      if (daysSince > 0) {
        const weight = Math.pow(0.5, daysSince / 30)
        adjustedRatio = stat.approvalRatio * weight + 0.5 * (1 - weight)
      }
    } catch { /* fall through with raw ratio */ }

    // Scale by approval ratio.
    const feedbackScale = FEEDBACK_MIN + (FEEDBACK_MAX - FEEDBACK_MIN) * adjustedRatio
    const final = blended * feedbackScale

    return Math.max(0, Math.min(1, final))
  }

  /**
   * Record a new sighting of a tag from a Tier-2 analysis. Bumps sample_count
   * and the running confidence sum so future calibrations have better data.
   */
  recordSample(tagName: string, source: string, rawConfidence: number): void {
    if (!tagName || !source) return
    this.loadCache()
    try {
      this.rawDb.prepare(`
        INSERT INTO ai_tag_calibration (tag_name, source, sample_count, sum_confidence, last_seen)
        VALUES (?, ?, 1, ?, datetime('now'))
        ON CONFLICT(tag_name, source) DO UPDATE SET
          sample_count = sample_count + 1,
          sum_confidence = sum_confidence + excluded.sum_confidence,
          last_seen = excluded.last_seen
      `).run(tagName, source, rawConfidence)

      const k = this.key(tagName, source)
      const cur = this.cache.get(k)
      if (cur) {
        const newCount = cur.sampleCount + 1
        const newSum = cur.meanConfidence * cur.sampleCount + rawConfidence
        cur.sampleCount = newCount
        cur.meanConfidence = newSum / newCount
        cur.lastSeen = new Date().toISOString()
      } else {
        this.cache.set(k, {
          tagName, source,
          sampleCount: 1,
          meanConfidence: rawConfidence,
          approvedCount: 0,
          rejectedCount: 0,
          approvalRatio: 0.5,
          lastSeen: new Date().toISOString()
        })
      }
    } catch (err) {
      // Don't let calibration writes block analysis. Log + move on.
      console.warn('[Calibration] recordSample failed:', err)
    }
  }

  /**
   * Tags the user has rejected ≥N times with 0 approvals — strong
   * candidates for the user's protected list. Surface in the AI Tools
   * UI with a "Protect these tags?" button.
   */
  candidatesForAutoProtect(minRejections = 10): CalibrationStat[] {
    this.loadCache()
    return Array.from(this.cache.values())
      .filter((s) => s.rejectedCount >= minRejections && s.approvedCount === 0)
      .sort((a, b) => b.rejectedCount - a.rejectedCount)
  }

  /**
   * Per-source rejection rate — "you reject 40% of `performer` tags,
   * 5% of `position`". Helps the user tune per-source thresholds.
   */
  rejectionRatesBySource(): Array<{ source: string; approved: number; rejected: number; ratio: number }> {
    this.loadCache()
    const bySource = new Map<string, { approved: number; rejected: number }>()
    for (const stat of this.cache.values()) {
      const cur = bySource.get(stat.source) ?? { approved: 0, rejected: 0 }
      cur.approved += stat.approvedCount
      cur.rejected += stat.rejectedCount
      bySource.set(stat.source, cur)
    }
    return Array.from(bySource.entries()).map(([source, v]) => {
      const total = v.approved + v.rejected
      return {
        source,
        approved: v.approved,
        rejected: v.rejected,
        ratio: total > 0 ? v.rejected / total : 0,
      }
    }).sort((a, b) => b.ratio - a.ratio)
  }

  /** Convenience: bulk-record all rich tags from a Tier-2 result. */
  recordSamples(richTags: Array<{ name: string; confidence: number; source: string }>): void {
    for (const t of richTags) {
      this.recordSample(t.name, t.source, t.confidence)
    }
  }

  /**
   * Apply calibration to a list of rich tags in-place (returns a new array
   * with adjusted confidences; original objects untouched). Tags the user
   * keeps rejecting get a haircut; tags they consistently approve get
   * boosted toward their historical mean. Unseen tags pass through with
   * their raw confidence.
   *
   * This is the bridge that turns dormant feedback data into live accuracy
   * adjustments. Called from the processing queue after Tier 2 returns
   * but BEFORE storage / auto-apply, so review-queue display + auto-apply
   * threshold both see calibrated values.
   */
  calibrateAll<T extends { name: string; source: string; confidence: number }>(richTags: T[]): T[] {
    if (richTags.length === 0) return richTags
    this.loadCache()
    return richTags.map((t) => ({
      ...t,
      confidence: this.calibrate(t.name, t.source, t.confidence),
    }))
  }

  /**
   * Record user feedback on a tag — increments approved or rejected count.
   * Called from the review queue's approve/reject paths.
   */
  recordFeedback(tagName: string, source: string, decision: 'approved' | 'rejected'): void {
    if (!tagName || !source) return
    this.loadCache()
    const col = decision === 'approved' ? 'approved_count' : 'rejected_count'
    try {
      this.rawDb.prepare(`
        INSERT INTO ai_tag_calibration (tag_name, source, ${col}, last_seen)
        VALUES (?, ?, 1, datetime('now'))
        ON CONFLICT(tag_name, source) DO UPDATE SET
          ${col} = ${col} + 1,
          last_seen = excluded.last_seen
      `).run(tagName, source)

      const k = this.key(tagName, source)
      const cur = this.cache.get(k)
      if (cur) {
        if (decision === 'approved') cur.approvedCount += 1
        else cur.rejectedCount += 1
        cur.approvalRatio = this.computeApprovalRatio(cur.approvedCount, cur.rejectedCount)
        cur.lastSeen = new Date().toISOString()
      } else {
        this.cache.set(k, {
          tagName, source,
          sampleCount: 0,
          meanConfidence: 0.5,
          approvedCount: decision === 'approved' ? 1 : 0,
          rejectedCount: decision === 'rejected' ? 1 : 0,
          approvalRatio: this.computeApprovalRatio(
            decision === 'approved' ? 1 : 0,
            decision === 'rejected' ? 1 : 0
          ),
          lastSeen: new Date().toISOString()
        })
      }
    } catch (err) {
      console.warn('[Calibration] recordFeedback failed:', err)
    }
  }

  /**
   * Total stats across the table — useful for the AI Setup tab.
   *
   * `totalApproved` / `totalRejected` count TAG-INSTANCES (one approved
   * media with 5 tags = 5 approvals here), used internally for
   * calibration. The renderer also needs distinct-media counts so
   * the "Approvals" card reads correctly to the user — query both
   * and let the UI pick which to show.
   */
  getSummary(): {
    tagsTracked: number
    totalSamples: number
    totalApproved: number
    totalRejected: number
    /** Distinct media items in review_status='approved'. This is the
     *  number the user actually thinks of as "approvals". */
    mediaApproved: number
    /** Distinct media items in review_status='rejected'. */
    mediaRejected: number
    /** Distinct media items in review_status='pending'. */
    mediaPending: number
  } {
    this.loadCache()
    let totalSamples = 0, totalApproved = 0, totalRejected = 0
    for (const s of this.cache.values()) {
      totalSamples += s.sampleCount
      totalApproved += s.approvedCount
      totalRejected += s.rejectedCount
    }
    // Distinct media counts from ai_analysis_results — what users
    // mean when they say "I approved N items."
    let mediaApproved = 0, mediaRejected = 0, mediaPending = 0
    try {
      const rows = this.rawDb.prepare(`
        SELECT review_status, COUNT(*) as n
        FROM ai_analysis_results
        GROUP BY review_status
      `).all() as Array<{ review_status: string; n: number }>
      for (const r of rows) {
        if (r.review_status === 'approved') mediaApproved = r.n
        else if (r.review_status === 'rejected') mediaRejected = r.n
        else if (r.review_status === 'pending') mediaPending = r.n
      }
    } catch (err) {
      console.warn('[Calibration] media count probe failed:', err)
    }
    return {
      tagsTracked: this.cache.size,
      totalSamples,
      totalApproved,
      totalRejected,
      mediaApproved,
      mediaRejected,
      mediaPending,
    }
  }

  /** Top tags by approval ratio (min sample size to filter noise). */
  topByApproval(limit = 10, minTotal = 3): CalibrationStat[] {
    this.loadCache()
    return Array.from(this.cache.values())
      .filter((s) => (s.approvedCount + s.rejectedCount) >= minTotal)
      .sort((a, b) => b.approvalRatio - a.approvalRatio)
      .slice(0, limit)
  }

  /**
   * Bottom tags by approval ratio — i.e. things the user keeps rejecting.
   * Most useful in the Review tab: surface these so the user can decide
   * to add them to the protected/junk list and stop seeing them at all.
   * Order is most-rejected first.
   */
  topByRejection(limit = 10, minTotal = 3): CalibrationStat[] {
    this.loadCache()
    return Array.from(this.cache.values())
      .filter((s) => (s.approvedCount + s.rejectedCount) >= minTotal && s.rejectedCount > 0)
      .sort((a, b) => {
        // Sort by approvalRatio ascending (worst first), then by rejected
        // count desc so the most-egregious offenders bubble up.
        if (a.approvalRatio !== b.approvalRatio) return a.approvalRatio - b.approvalRatio
        return b.rejectedCount - a.rejectedCount
      })
      .slice(0, limit)
  }

  /**
   * Walk the existing ai_analysis_results table and replay every prior
   * approve / reject decision into the calibration table. Used when the
   * calibration table is empty but the user has already reviewed
   * thousands of items — recovers the training signal that was lost to
   * an earlier bundler bug (require('./calibration-service') failed
   * silently for every Tier 2 result before 2026-05-12).
   *
   * For each row:
   *   - If rich_tags JSON is populated: record each tag as a sample
   *     (mean confidence + sample count).
   *   - If review_status='approved': mark every kept tag as approved.
   *   - If review_status='rejected': mark every rich_tag as rejected.
   *   - If approved_tag_ids is set (approveEdited path): tags in that
   *     list = approved, the rest = rejected.
   *
   * Returns counts so the UI can show what was recovered. Idempotent —
   * calling twice double-counts (the DB has no dedup key); callers
   * should check whether the calibration table is already non-empty
   * before invoking unless they explicitly want a reset.
   */
  backfillFromHistory(): {
    rowsProcessed: number
    samplesRecorded: number
    approvalsRecorded: number
    rejectionsRecorded: number
  } {
    this.loadCache()
    let rowsProcessed = 0
    let samplesRecorded = 0
    let approvalsRecorded = 0
    let rejectionsRecorded = 0

    const rows = this.rawDb.prepare(`
      SELECT media_id, rich_tags, review_status, approved_tag_ids, rejection_history
      FROM ai_analysis_results
      WHERE rich_tags IS NOT NULL
    `).all() as Array<{
      media_id: string
      rich_tags: string | null
      review_status: string | null
      approved_tag_ids: string | null
      rejection_history: string | null
    }>

    // Build a name→id map once so we can resolve approved_tag_ids
    // (numeric tag IDs) back to tag names for calibration.
    const tagIdToName = new Map<string, string>()
    try {
      const tagRows = this.rawDb.prepare('SELECT id, name FROM tags').all() as Array<{ id: string; name: string }>
      for (const r of tagRows) tagIdToName.set(String(r.id), r.name.toLowerCase())
    } catch { /* if tags table is empty/missing, fall back to name-only matching */ }

    for (const row of rows) {
      rowsProcessed++
      let richTags: Array<{ name: string; confidence: number; source: string }> = []
      try {
        const parsed = JSON.parse(row.rich_tags ?? '[]')
        if (Array.isArray(parsed)) {
          richTags = parsed
            .filter((t: any) => t && typeof t.name === 'string')
            .map((t: any) => ({
              name: String(t.name).toLowerCase(),
              confidence: typeof t.confidence === 'number' ? t.confidence : 0.6,
              source: typeof t.source === 'string' ? t.source : 'other',
            }))
        }
      } catch { continue }

      // Sample-recording pass — every rich_tag bumps the sample counter.
      for (const t of richTags) {
        try {
          this.recordSample(t.name, t.source, t.confidence)
          samplesRecorded++
        } catch { /* keep going on individual failures */ }
      }

      // Feedback pass — determine per-tag approve/reject.
      if (row.review_status === 'approved') {
        // Resolve which tags the user actually kept. If approved_tag_ids
        // is set, only those tags count as approved (the rest were
        // dropped during edit). Otherwise the whole set was approved.
        let keptNames: Set<string> | null = null
        if (row.approved_tag_ids) {
          try {
            const ids = JSON.parse(row.approved_tag_ids) as Array<string | number>
            if (Array.isArray(ids)) {
              const names = new Set<string>()
              for (const id of ids) {
                const name = tagIdToName.get(String(id))
                if (name) names.add(name)
              }
              keptNames = names
            }
          } catch { /* ignore */ }
        }

        for (const t of richTags) {
          const decision: 'approved' | 'rejected' =
            keptNames === null
              ? 'approved'
              : (keptNames.has(t.name) ? 'approved' : 'rejected')
          try {
            this.recordFeedback(t.name, t.source, decision)
            if (decision === 'approved') approvalsRecorded++; else rejectionsRecorded++
          } catch { /* ignore */ }
        }
      } else if (row.review_status === 'rejected') {
        for (const t of richTags) {
          try {
            this.recordFeedback(t.name, t.source, 'rejected')
            rejectionsRecorded++
          } catch { /* ignore */ }
        }
      }
      // If review_status is 'pending' / null we still recorded the
      // samples (above) so the historical mean carries forward when
      // future user feedback arrives.
    }

    console.log(`[Calibration] Backfill complete: ${rowsProcessed} rows → ${samplesRecorded} samples, ${approvalsRecorded} approvals, ${rejectionsRecorded} rejections`)
    return { rowsProcessed, samplesRecorded, approvalsRecorded, rejectionsRecorded }
  }
}

let singleton: CalibrationService | null = null

export function getCalibrationService(db: DB): CalibrationService {
  if (!singleton) singleton = new CalibrationService(db)
  return singleton
}
