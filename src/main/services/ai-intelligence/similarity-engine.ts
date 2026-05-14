// ===============================
// File: src/main/services/ai-intelligence/similarity-engine.ts
//
// "More like this" recommendation engine.
//
// Approach: each media that has been Tier-2 analyzed has a `rich_tags` JSON
// blob — a list of { name, confidence, source }. We treat that as a sparse
// vector keyed by tag name with weight = confidence × source_weight, then
// rank candidates by cosine similarity to a source media's vector.
//
// This is intentionally NOT using ANN embeddings — we already have the
// rich-tag taxonomy from Tier 2 (Phase A), and a sparse cosine on a few
// thousand items finishes in single-digit ms. Adding embeddings is a
// future option if the user wants semantic-string search ("beach scenes")
// but isn't needed for "show me more videos like this one."
// ===============================

import type { DB } from '../../db'
import { getCalibrationService } from './calibration-service'

type RawDB = DB['raw']

export interface SimilarMedia {
  mediaId: string
  filename: string
  thumbPath: string | null
  type: string
  durationSec: number | null
  similarity: number       // 0..1 cosine score
  sharedTags: string[]     // tag names this candidate shares with the source
  matchCount: number       // how many tags overlapped (for display)
}

interface RichTag {
  name: string
  confidence: number
  source: string
}

// Different tag sources contribute differently — actions and positions are
// the strongest signal of "this video is like that video." Performer
// descriptors (hair, ethnicity) are mid-strength. Generic context tags are
// weakest. Mirrors content_analyzer's intuition that two videos sharing
// "missionary + creampie" matter more than two videos sharing "bedroom".
const SOURCE_WEIGHT: Record<string, number> = {
  action: 1.4,
  position: 1.3,
  performer: 1.0,
  body: 0.9,
  intensity: 0.8,
  context: 0.7,
  setting: 0.6,
  other: 0.5
}

function weightOf(source: string): number {
  return SOURCE_WEIGHT[source] ?? 0.5
}

/**
 * Parse a rich_tags JSON cell. Tolerates malformed rows by returning [].
 */
function parseRichTags(json: string | null | undefined): RichTag[] {
  if (!json) return []
  try {
    const parsed = JSON.parse(json)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((t: any) =>
      t && typeof t.name === 'string' && typeof t.confidence === 'number' && typeof t.source === 'string'
    )
  } catch {
    return []
  }
}

/**
 * Build a sparse weighted vector from rich tags.
 * Map<tagName, weight> where weight = confidence × source_weight.
 */
function buildVector(tags: RichTag[]): Map<string, number> {
  const v = new Map<string, number>()
  for (const t of tags) {
    const w = Math.max(0, Math.min(1, t.confidence)) * weightOf(t.source)
    if (w <= 0) continue
    // If a tag appears twice (rare), keep the larger weight.
    const cur = v.get(t.name)
    if (cur === undefined || w > cur) v.set(t.name, w)
  }
  return v
}

function magnitude(v: Map<string, number>): number {
  let sum = 0
  for (const w of v.values()) sum += w * w
  return Math.sqrt(sum)
}

/**
 * Cosine similarity over two sparse weighted vectors.
 * Iterates the SHORTER vector to keep it cheap when one is small.
 */
function cosine(a: Map<string, number>, b: Map<string, number>): { sim: number; shared: string[] } {
  const magA = magnitude(a)
  const magB = magnitude(b)
  if (magA === 0 || magB === 0) return { sim: 0, shared: [] }
  let dot = 0
  const shared: string[] = []
  const [smaller, larger] = a.size <= b.size ? [a, b] : [b, a]
  for (const [name, wSmall] of smaller) {
    const wLarge = larger.get(name)
    if (wLarge !== undefined) {
      dot += wSmall * wLarge
      shared.push(name)
    }
  }
  return { sim: dot / (magA * magB), shared }
}

export interface SimilarityEngineOptions {
  /** Minimum cosine similarity for inclusion (0..1). Default 0.05 — drop near-zero matches. */
  minSimilarity?: number
  /** Filter by media type. Default: same type as source. */
  matchType?: 'video' | 'image' | 'gif' | null | 'any'
}

export class SimilarityEngine {
  private rawDb: RawDB
  private db: DB

  // Cached per-media vectors, keyed by mediaId. Invalidated whenever AI
  // analysis writes a new row (we wire that in storeResults — see below).
  private vectorCache = new Map<string, Map<string, number>>()
  private cacheLoaded = false

  constructor(db: DB) {
    this.rawDb = db.raw
    this.db = db
  }

  /**
   * Build a vector applying user-feedback calibration. A tag the user has
   * historically approved gets its weight bumped up; rejected tags get pushed
   * down. Falls back to the raw confidence × source weight when there's no
   * calibration data yet.
   */
  private buildCalibratedVector(tags: RichTag[]): Map<string, number> {
    const calibration = getCalibrationService(this.db)
    const v = new Map<string, number>()
    for (const t of tags) {
      const calibratedConf = calibration.calibrate(t.name, t.source, t.confidence)
      const w = Math.max(0, Math.min(1, calibratedConf)) * weightOf(t.source)
      if (w <= 0) continue
      const cur = v.get(t.name)
      if (cur === undefined || w > cur) v.set(t.name, w)
    }
    return v
  }

  /**
   * Build (or rebuild) the per-media vector cache from ai_analysis_results.
   * Called lazily on first use; can be called manually after a bulk import.
   */
  private ensureCache(): void {
    if (this.cacheLoaded) return
    this.vectorCache.clear()
    const rows = this.rawDb.prepare(`
      SELECT media_id, rich_tags
      FROM ai_analysis_results
      WHERE rich_tags IS NOT NULL
    `).all() as Array<{ media_id: string; rich_tags: string }>

    for (const row of rows) {
      const tags = parseRichTags(row.rich_tags)
      if (tags.length === 0) continue
      this.vectorCache.set(row.media_id, this.buildCalibratedVector(tags))
    }
    this.cacheLoaded = true
    console.log(`[Similarity] Loaded ${this.vectorCache.size} media vectors`)
  }

  /** Force a cache rebuild — call after a major ai_analysis_results update. */
  refresh(): void {
    this.cacheLoaded = false
    this.ensureCache()
  }

  /** Update a single media's cached vector — call right after storing AI results. */
  updateOne(mediaId: string): void {
    if (!this.cacheLoaded) {
      // First-call lazy population covers it.
      return
    }
    const row = this.rawDb.prepare(
      `SELECT rich_tags FROM ai_analysis_results WHERE media_id = ?`
    ).get(mediaId) as { rich_tags: string } | undefined
    if (!row?.rich_tags) {
      this.vectorCache.delete(mediaId)
      return
    }
    const tags = parseRichTags(row.rich_tags)
    if (tags.length === 0) {
      this.vectorCache.delete(mediaId)
      return
    }
    this.vectorCache.set(mediaId, this.buildCalibratedVector(tags))
  }

  /**
   * Find media most similar to `mediaId`. Returns up to `limit` results sorted
   * by similarity descending.
   *
   * If the source has no analysis yet, returns an empty list — the caller
   * should fall back to the legacy tag-overlap recommender.
   */
  findSimilar(mediaId: string, limit = 12, options?: SimilarityEngineOptions): SimilarMedia[] {
    this.ensureCache()

    const sourceVec = this.vectorCache.get(mediaId)
    if (!sourceVec || sourceVec.size === 0) return []

    // Determine the type filter — by default match the source's type so an
    // image's "similar" list is other images, video → other videos, etc.
    const matchType = options?.matchType
    const sourceMeta = this.rawDb.prepare(`SELECT type FROM media WHERE id = ?`).get(mediaId) as { type?: string } | undefined
    const filterType = matchType === undefined
      ? sourceMeta?.type ?? null
      : matchType === 'any'
        ? null
        : matchType

    const minSim = options?.minSimilarity ?? 0.05
    const candidates: Array<{ id: string; sim: number; shared: string[] }> = []

    for (const [otherId, vec] of this.vectorCache) {
      if (otherId === mediaId) continue
      const { sim, shared } = cosine(sourceVec, vec)
      if (sim < minSim) continue
      candidates.push({ id: otherId, sim, shared })
    }

    candidates.sort((a, b) => b.sim - a.sim)

    // Hydrate top-N with metadata. We over-fetch in case some candidates have
    // been deleted from the media table (orphaned analysis rows).
    const top = candidates.slice(0, Math.max(limit * 3, limit + 8))
    if (top.length === 0) return []

    const placeholders = top.map(() => '?').join(',')
    const ids = top.map((c) => c.id)
    const metaRows = this.rawDb.prepare(`
      SELECT id, filename, thumbPath, type, durationSec
      FROM media
      WHERE id IN (${placeholders})
      ${filterType ? 'AND type = ?' : ''}
    `).all(...ids, ...(filterType ? [filterType] : [])) as Array<{
      id: string
      filename: string
      thumbPath: string | null
      type: string
      durationSec: number | null
    }>

    const metaById = new Map(metaRows.map((r) => [r.id, r]))
    const out: SimilarMedia[] = []
    for (const c of top) {
      const meta = metaById.get(c.id)
      if (!meta) continue
      out.push({
        mediaId: meta.id,
        filename: meta.filename,
        thumbPath: meta.thumbPath,
        type: meta.type,
        durationSec: meta.durationSec,
        similarity: c.sim,
        sharedTags: c.shared.slice(0, 6),
        matchCount: c.shared.length
      })
      if (out.length >= limit) break
    }
    return out
  }

  /** Diagnostic: how many media currently have AI vectors. */
  getCachedCount(): number {
    this.ensureCache()
    return this.vectorCache.size
  }

  /**
   * Find the top-N APPROVED media most similar to a probe tag list.
   * Used during analysis when the new media doesn't have a vector yet —
   * the caller passes Tier 1 + filename hint tags as a provisional probe,
   * and we return the user's already-approved items that match that
   * fingerprint. The caller can then use those items' tags as a
   * calibrated prior + their approved titles/descriptions as few-shot
   * examples for the Tier 2 prompt.
   *
   * Why APPROVED-only: an unreviewed item's tags are as likely to be
   * wrong as right; an approved item's tags have been validated by the
   * user, so they carry actual signal. This is the whole point of
   * compounding the review work into future runs.
   *
   * @param probeTags tag names with confidence + source labels (output
   *                  of Tier 1, filename extractor, or any other early
   *                  signal we have for the new media)
   * @param excludeMediaId optional: skip this media id (when re-analyzing,
   *                      don't match the item against itself)
   */
  findSimilarApprovedByTagList(
    probeTags: Array<{ name: string; confidence: number; source: string }>,
    limit = 5,
    excludeMediaId?: string
  ): Array<{
    mediaId: string
    filename: string
    title: string | null
    description: string | null
    similarity: number
    sharedTags: string[]
    /** The APPROVED rich-tag set on this match — usable as priors. */
    approvedTags: RichTag[]
  }> {
    if (!probeTags || probeTags.length === 0) return []
    this.ensureCache()

    // Build the probe vector exactly like a real cached vector so cosine
    // is apples-to-apples. We don't run calibration on the probe — the
    // incoming tags are first-pass evidence, not user-approved truth.
    const probeVec = buildVector(probeTags.map((t) => ({
      name: t.name,
      confidence: t.confidence,
      source: t.source,
    })))
    if (probeVec.size === 0) return []

    // Pull the approved set so we can intersect.
    const approvedRows = this.rawDb.prepare(`
      SELECT ar.media_id, ar.rich_tags, ar.approved_title, ar.description, m.filename
      FROM ai_analysis_results ar
      INNER JOIN media m ON m.id = ar.media_id
      WHERE ar.review_status = 'approved' AND ar.rich_tags IS NOT NULL
    `).all() as Array<{
      media_id: string
      rich_tags: string
      approved_title: string | null
      description: string | null
      filename: string
    }>

    const candidates: Array<{
      mediaId: string
      filename: string
      title: string | null
      description: string | null
      similarity: number
      sharedTags: string[]
      approvedTags: RichTag[]
    }> = []

    for (const row of approvedRows) {
      if (excludeMediaId && row.media_id === excludeMediaId) continue
      const tags = parseRichTags(row.rich_tags)
      if (tags.length === 0) continue
      const cached = this.vectorCache.get(row.media_id) ?? this.buildCalibratedVector(tags)
      const { sim, shared } = cosine(probeVec, cached)
      if (sim < 0.05) continue
      candidates.push({
        mediaId: row.media_id,
        filename: row.filename,
        title: row.approved_title,
        description: row.description,
        similarity: sim,
        sharedTags: shared.slice(0, 8),
        approvedTags: tags,
      })
    }

    candidates.sort((a, b) => b.similarity - a.similarity)
    return candidates.slice(0, limit)
  }

  /**
   * Aggregate prior tags from a list of similar-approved matches.
   * Each tag gets a confidence score = max(similarity × tag.confidence)
   * across all the matches that emitted it, weighted by source. Used as
   * an extra confidence source merged with the live Venice output —
   * tags that show up across multiple similar approved items get a
   * proportionally stronger vote.
   */
  static buildPriorsFromSimilar(
    matches: Array<{ similarity: number; approvedTags: RichTag[] }>
  ): Array<{ name: string; confidence: number; source: string; matchCount: number }> {
    if (matches.length === 0) return []
    // tagName → { bestScore, source, matchCount }
    const acc = new Map<string, { score: number; source: string; matches: number }>()
    for (const m of matches) {
      for (const t of m.approvedTags) {
        // Soft cap so a single 1.0-similarity match (perfect dup) doesn't
        // bulldoze the prior — we still want Venice's view to dominate.
        const score = Math.min(0.9, m.similarity) * t.confidence
        const cur = acc.get(t.name)
        if (!cur) {
          acc.set(t.name, { score, source: t.source, matches: 1 })
        } else {
          cur.matches += 1
          if (score > cur.score) cur.score = score
        }
      }
    }
    return Array.from(acc.entries()).map(([name, v]) => ({
      name,
      confidence: v.score,
      source: v.source,
      matchCount: v.matches,
    }))
  }
}

let singleton: SimilarityEngine | null = null

export function getSimilarityEngine(db: DB): SimilarityEngine {
  if (!singleton) singleton = new SimilarityEngine(db)
  return singleton
}
