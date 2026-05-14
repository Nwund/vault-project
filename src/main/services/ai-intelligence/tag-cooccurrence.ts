// File: src/main/services/ai-intelligence/tag-cooccurrence.ts
//
// Build a tag co-occurrence map from APPROVED media tags. When the user
// is editing a review item we use this to surface "related tags you
// might want" — tags that co-occur with the user's current selection in
// existing approved items but aren't yet picked.
//
// Source of truth: the media_tags table (final state of each item's
// tagging), filtered to media that has been approved at least once.
// This is the user's actual taste signal, not raw AI output.
//
// Output: for a set of currently-selected tag names, return the top-N
// candidate tag names ordered by lift = P(target | selected) / P(target).
// Lift catches tags that strongly co-occur instead of just popular ones.

import type { DB } from '../../db'

type RawDB = DB['raw']

export interface CooccurrenceSuggestion {
  name: string
  /** Estimated probability of target tag given the selected tags. */
  probability: number
  /** How many approved media contain BOTH the selected tags AND target. */
  jointCount: number
  /** Total approved media containing target (denominator for P(target)). */
  totalCount: number
}

// Cached co-occurrence matrix. Rebuilt on demand; invalidated when a new
// item gets approved with new tags. The matrix is build-once-use-many
// because for a 4000-item library we have maybe 500 unique tags × 500 =
// 250k cells, but most cells are zero. We store sparse.
let cachedMatrix: { tags: Map<string, number>; cooccur: Map<string, Map<string, number>>; built: number } | null = null
const CACHE_TTL_MS = 60_000  // 1 minute — long enough to coalesce burst review edits, short enough to feel live

export function invalidateCooccurrenceCache(): void {
  cachedMatrix = null
}

function buildMatrix(rawDb: RawDB): { tags: Map<string, number>; cooccur: Map<string, Map<string, number>>; built: number } {
  // Pull each approved media's tag list. media_tags is name-keyed via
  // the tags table. Restrict to items the user has approved at least
  // once (approved_tag_ids non-empty) so unreviewed items don't poison
  // the prior.
  //
  // Why JOIN against ai_analysis_results: an item is "approved" when
  // review_status='approved'. If the user has tagged something manually
  // (no AI analysis row at all), we still pick it up because media_tags
  // is the authoritative final-state table.
  const rows = rawDb.prepare(`
    SELECT mt.mediaId, t.name
    FROM media_tags mt
    JOIN tags t ON t.id = mt.tagId
    WHERE EXISTS (
      SELECT 1 FROM ai_analysis_results ar
      WHERE ar.media_id = mt.mediaId AND ar.review_status = 'approved'
    )
       OR NOT EXISTS (
      SELECT 1 FROM ai_analysis_results ar WHERE ar.media_id = mt.mediaId
    )
  `).all() as Array<{ mediaId: string; name: string }>

  // Group tags by media so we can iterate per-item pairs.
  const byMedia = new Map<string, Set<string>>()
  for (const r of rows) {
    const name = r.name.toLowerCase()
    let set = byMedia.get(r.mediaId)
    if (!set) { set = new Set(); byMedia.set(r.mediaId, set) }
    set.add(name)
  }

  const tags = new Map<string, number>()      // tag name → total count
  const cooccur = new Map<string, Map<string, number>>()  // tagA → (tagB → joint count)

  for (const tagSet of byMedia.values()) {
    const arr = Array.from(tagSet)
    for (const t of arr) {
      tags.set(t, (tags.get(t) ?? 0) + 1)
    }
    // All unordered pairs in this item — increment both directions so
    // lookups are symmetric without having to canonicalize.
    for (let i = 0; i < arr.length; i++) {
      const a = arr[i]
      let row = cooccur.get(a)
      if (!row) { row = new Map(); cooccur.set(a, row) }
      for (let j = 0; j < arr.length; j++) {
        if (i === j) continue
        const b = arr[j]
        row.set(b, (row.get(b) ?? 0) + 1)
      }
    }
  }

  console.log(`[Cooccurrence] Built matrix: ${tags.size} tags across ${byMedia.size} approved media`)
  return { tags, cooccur, built: Date.now() }
}

function getMatrix(rawDb: RawDB) {
  if (!cachedMatrix || Date.now() - cachedMatrix.built > CACHE_TTL_MS) {
    cachedMatrix = buildMatrix(rawDb)
  }
  return cachedMatrix
}

/**
 * Suggest related tags. Given a set of currently-selected tag names,
 * find tags that strongly co-occur with them in the user's approved
 * media — useful as "tags you might also want" hints in the review UI.
 *
 * @param selectedNames  the tags the user has already picked for this item
 * @param excludeNames   names to never return (already-selected + protected)
 * @param limit          max suggestions
 * @param minJointCount  drop tags that only co-occurred a handful of times
 *                       (otherwise rare combinations dominate the lift score)
 */
export function suggestRelatedTags(
  rawDb: RawDB,
  selectedNames: Set<string>,
  excludeNames: Set<string>,
  limit = 8,
  minJointCount = 2
): CooccurrenceSuggestion[] {
  if (selectedNames.size === 0) return []
  const { tags, cooccur } = getMatrix(rawDb)
  if (tags.size === 0) return []

  // Total approved-media count = max single tag count (an upper bound
  // for "items in the library that have any approved tag at all").
  // Used as the denominator for P(target).
  let universe = 0
  for (const c of tags.values()) if (c > universe) universe = c

  // For each candidate tag (in the joint with ANY selected tag), score
  // by aggregated lift across selected tags. Lift = P(target | selected) /
  // P(target). >1 = co-occurs more than chance; <1 = anti-correlated.
  const candidateScores = new Map<string, { score: number; jointCount: number; totalCount: number }>()

  const selectedLower = new Set<string>(Array.from(selectedNames).map((n) => n.toLowerCase()))
  for (const sel of selectedLower) {
    const row = cooccur.get(sel)
    if (!row) continue
    const selCount = tags.get(sel) ?? 0
    if (selCount === 0) continue

    for (const [target, jointCount] of row) {
      if (selectedLower.has(target)) continue
      if (excludeNames.has(target)) continue
      if (jointCount < minJointCount) continue

      const targetCount = tags.get(target) ?? 1
      const pTarget = targetCount / universe
      const pTargetGivenSel = jointCount / selCount
      // Lift can blow up for rare tags; smooth by adding a small prior.
      const lift = pTargetGivenSel / (pTarget + 0.001)

      const cur = candidateScores.get(target)
      if (cur) {
        cur.score += lift
        cur.jointCount = Math.max(cur.jointCount, jointCount)
      } else {
        candidateScores.set(target, { score: lift, jointCount, totalCount: targetCount })
      }
    }
  }

  return Array.from(candidateScores.entries())
    .sort((a, b) => b[1].score - a[1].score)
    .slice(0, limit)
    .map(([name, v]) => ({
      name,
      probability: Math.min(1, v.score / Math.max(1, selectedNames.size)),
      jointCount: v.jointCount,
      totalCount: v.totalCount,
    }))
}
