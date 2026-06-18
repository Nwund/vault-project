// File: src/main/services/ai-intelligence/description-tag-extractor.ts
//
// Mine canonical-tag mentions out of the Tier 2 description text and
// surface them as extra rich_tags. User feedback 2026-05-12: "most of
// the descriptions are correct… tags should be using descriptions as
// well and same methodology to have tags applied."
//
// Approach: scan the description for occurrences of canonical tag names
// using word-boundary regex matches. Multi-word tags (e.g. "facial close
// up", "reverse cowgirl") are matched as phrases; single-word atoms are
// matched as whole-word tokens. Each match emits a Tier2Tag with
// source='other' (carries forward the same calibration/exclusion
// pipeline) and a conservative confidence floor — the description is
// supporting evidence, not first-class observation.
//
// Anti-pattern guard: the description vocabulary is wider than the
// canonical-tag set, so we restrict matches to tags that are in
// CANONICAL_TAGS. This prevents the extractor from emitting garbage
// like "the" or fragments of unrelated phrases.

import { CANONICAL_TAGS, normalizeToCanonical, isJunkTag, isAutoApplyBlocked } from './canonical-tags'
import type { Tier2Tag, Tier2TagSource } from './tier2-vision-llm'

// Tags we deliberately DON'T extract from descriptions even when they
// appear, because they trigger too many false positives in narrative
// prose (e.g. "couple" can mean "a few", "duo" rarely shows up, "sex"
// is too generic). Stays in CANONICAL_TAGS for prompt vocab use.
const DESCRIPTION_EXTRACTION_BLOCKLIST = new Set<string>([
  'couple', 'couples', 'duo', 'sex', 'group',
  // Genders alone — already handled by Tier 2 structured output.
  'male', 'female', 'man', 'woman',
])

// Heuristic: when the description mentions one of these phrases, the
// tag in value should NOT be extracted because the phrase implies the
// opposite or non-presence. E.g. "no anal" → don't tag "anal".
const NEGATION_MARKERS = ['no ', 'not ', "doesn't ", "doesn't have", 'without ', 'never ']

// Cache the matchers — building regex per call would be wasteful when
// the processing queue calls this on every analysis.
let cachedMatchers: Array<{ name: string; re: RegExp }> | null = null

function buildMatchers(): Array<{ name: string; re: RegExp }> {
  if (cachedMatchers) return cachedMatchers
  const matchers: Array<{ name: string; re: RegExp }> = []
  for (const raw of CANONICAL_TAGS) {
    const name = String(raw).toLowerCase().trim()
    if (!name) continue
    if (DESCRIPTION_EXTRACTION_BLOCKLIST.has(name)) continue
    if (isJunkTag(name)) continue
    if (isAutoApplyBlocked(name)) continue
    // Build a word-boundary regex. Multi-word tags use \s+ between tokens
    // so "facial close up" matches "facial close-up", "facial closeup",
    // etc. via the secondary normalizer below — but the primary match
    // uses \s+ literally for simplicity.
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+')
    matchers.push({ name, re: new RegExp(`\\b${escaped}\\b`, 'i') })
  }
  // Sort longest-first so multi-word tags claim their tokens before
  // single-word atoms get a chance to match overlapping fragments.
  // (e.g. "reverse cowgirl" matches before "cowgirl" so we don't tag
  // both.)
  matchers.sort((a, b) => b.name.length - a.name.length)
  cachedMatchers = matchers
  return matchers
}

/** Reset the matcher cache. Used by tests; production never needs this. */
export function _resetDescriptionMatchers(): void {
  cachedMatchers = null
}

/**
 * Map canonical-tag name → likely Tier2TagSource. Lets the description-
 * derived tags carry useful source labels so the rich-tags UI / calibration
 * stays consistent. Heuristic — when in doubt, fall back to 'other'.
 */
function classifySource(name: string): Tier2TagSource {
  // Cheap pattern checks against well-known buckets.
  if (/cowgirl|missionary|doggystyle|prone bone|amazon|spooning|piledriver|standing|kneeling|69|face sitting|wheelbarrow/.test(name)) {
    return 'position'
  }
  if (/blowjob|fellatio|deepthroat|cunnilingus|rimjob|rimming|facial|cumshot|creampie|fingering|squirt|anal|handjob|tit ?fuck|titjob|footjob|gangbang|orgy|masturbation|stroking|edging|fisting|pissing|cum/.test(name)) {
    return 'action'
  }
  if (/petite|curvy|thicc|pawg|bbw|skinny|slim|athletic|fit|muscular|teen|milf|mature|asian|ebony|latina|tattooed|pierced|hairy|busty|stepmom|wife|girlfriend|twink|bear|jock|daddy|femboy/.test(name)) {
    return 'performer'
  }
  if (/big tits|small tits|huge tits|fake breasts|big ass|flat chest|shaved pussy|hairy pussy|long hair|short hair/.test(name)) {
    return 'body'
  }
  if (/outdoor|public|beach|pool|shower|bathroom|kitchen|car|office|hotel|webcam|onlyfans|snapchat|tiktok/.test(name)) {
    return 'setting'
  }
  if (/hardcore|softcore|intense|extreme|moderate|rough|gentle|passionate/.test(name)) {
    return 'intensity'
  }
  return 'other'
}

export interface DescriptionExtractionResult {
  /** New rich_tags derived from the description. Conservative confidence. */
  derivedTags: Tier2Tag[]
  /** Names of canonical tags that appeared in the description AND were
   *  already in the existing rich_tags set. Used for confidence boosting
   *  (independent corroboration). */
  reinforcedNames: Set<string>
}

/**
 * Extract canonical-tag mentions from a description. Returns:
 *   - `derivedTags`: tags FOUND in the description that are NOT in
 *     existing rich_tags (the new contribution).
 *   - `reinforcedNames`: tags found that ARE already in rich_tags (the
 *     caller can use this set to bump confidence for cross-source agreement).
 *
 * @param description  raw text from Tier 2
 * @param existingNames lowercased names of rich_tags already in the result
 * @param baseConfidence floor confidence for description-only matches.
 *        Default 0.55 — high enough to surface in the review UI but
 *        below the typical auto-apply threshold so the user still confirms.
 */
export function extractTagsFromDescription(
  description: string | null | undefined,
  existingNames: Set<string>,
  baseConfidence = 0.55
): DescriptionExtractionResult {
  const result: DescriptionExtractionResult = {
    derivedTags: [],
    reinforcedNames: new Set<string>(),
  }
  if (!description || !description.trim()) return result

  const text = description.toLowerCase()
  // Pre-compute negation spans so we can skip matches inside them.
  // A "negation span" is the substring from a negation marker to the
  // next sentence boundary (period, semicolon, comma, or 60 chars,
  // whichever comes first).
  const negatedSpans: Array<[number, number]> = []
  for (const marker of NEGATION_MARKERS) {
    let idx = 0
    while ((idx = text.indexOf(marker, idx)) !== -1) {
      const end = (() => {
        const periodAt = text.indexOf('.', idx)
        const semiAt = text.indexOf(';', idx)
        const commaAt = text.indexOf(',', idx)
        const candidates = [periodAt, semiAt, commaAt, idx + 60].filter(n => n > idx)
        return Math.min(...candidates)
      })()
      negatedSpans.push([idx, end])
      idx = end
    }
  }
  const isInNegation = (pos: number) => negatedSpans.some(([a, b]) => pos >= a && pos < b)

  const matchers = buildMatchers()
  const seen = new Set<string>()

  for (const { name, re } of matchers) {
    const match = re.exec(text)
    if (!match) continue
    if (isInNegation(match.index)) continue
    const canonical = normalizeToCanonical(name)
    if (!canonical || seen.has(canonical)) continue
    seen.add(canonical)

    if (existingNames.has(canonical)) {
      // Tier 2 vision already emitted this — note for confidence boost.
      result.reinforcedNames.add(canonical)
    } else {
      result.derivedTags.push({
        name: canonical,
        confidence: baseConfidence,
        source: classifySource(canonical),
        // We treat the entire description as one "frame" of evidence
        // for agreement purposes — surfaces as 1/1 in the consensus UI.
        frameCount: 1,
        totalFrames: 1,
      })
    }
  }

  return result
}
