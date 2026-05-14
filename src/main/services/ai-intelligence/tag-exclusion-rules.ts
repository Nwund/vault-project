// File: src/main/services/ai-intelligence/tag-exclusion-rules.ts
//
// Post-processing pass over Venice's rich_tags that drops tags
// contradicting the rest of the set. The Venice model frequently
// hallucinates "group" on solo videos, "fellatio" on female-only
// videos, "lingerie" on nude videos, "trans" on cis-female videos,
// and "public sex" on outdoor non-sexual videos. None of these
// pass even a casual sanity check, and they pollute the user's tag
// library + train the calibration in the wrong direction.
//
// Rules are codified here so they can be unit-tested independently
// of the LLM call, and so we can add new ones without touching the
// queue orchestration.
//
// Two phases:
//   1. Drop entire bad-vocabulary tags the user has flagged as
//      not-real-porn-site-vocab (e.g. "fellatio" → user wants
//      "blowjob"; this is handled in tier3-tag-matcher's redirect
//      map, but we ALSO drop them here in case Tier 3 isn't run).
//   2. Pairwise exclusion: when tag A is present (above a confidence
//      floor) drop tag B regardless of B's confidence.

import type { Tier2Tag } from './tier2-vision-llm'

// Tags the user wants stripped on sight — they're clinical / anatomical
// rather than the colloquial porn-site labels the user actually filters by.
// Tier 3 redirects most of these to canonical equivalents; we drop the
// rest defensively in case Tier 3 misses one (e.g. a new compound form).
const BAD_VOCABULARY = new Set<string>([
  'vaginal sex',
  'vaginal',
  'fellatio',
  'oral sex',
  // 'oral' is OK — porn sites use it generically; 'oral sex' is the
  // clinical phrasing the user objects to.
])

// Tags that ASSERT a single performer. If any of these are present
// at high confidence, multi-performer tags get dropped.
const SOLO_ASSERTS = new Set<string>(['solo', 'solo female', 'solo male', 'masturbation'])

// Tags that imply multiple performers — drop if a solo assertion wins.
const MULTI_PERFORMER_TAGS = new Set<string>([
  'group', 'group sex', 'threesome', 'foursome', 'orgy', 'gangbang',
  'couple', 'couples', 'mfm', 'mff', 'mmf', 'ffm',
])

// Tags that require at least one male performer. Dropped on solo-female
// or lesbian scenes.
const MALE_REQUIRED_TAGS = new Set<string>([
  'fellatio', 'blowjob', 'deepthroat', 'face fuck',
  'vaginal sex', 'anal sex',
  'cumshot', 'cum shot', 'creampie', 'cream pie', 'facial', 'cum on face',
  'handjob', 'rimjob',
])

// Tags that ASSERT no male performer (female-only / lesbian context).
// Used to gate the male-required drop above.
const FEMALE_ONLY_ASSERTS = new Set<string>([
  'lesbian', 'lesbians', 'girl on girl', 'wlw',
  'solo female', 'female solo',
])

// Tags that assert visible nudity. Used to drop "lingerie"/"clothed"
// when the subject is naked.
const NUDE_ASSERTS = new Set<string>([
  'nude', 'naked', 'nudity', 'fully nude', 'completely nude',
])
const CLOTHED_TAGS = new Set<string>([
  'lingerie', 'clothed', 'fully clothed', 'dressed', 'underwear',
])

// Body-type pairs that contradict each other. We keep the higher-confidence
// tag and drop the other.
const BODY_TYPE_CONFLICTS: Array<[string, string]> = [
  ['petite', 'curvy'],
  ['petite', 'bbw'],
  ['petite', 'thick'],
  ['skinny', 'curvy'],
  ['skinny', 'bbw'],
  ['skinny', 'thick'],
  ['curvy', 'skinny'],
]

// Tags that ASSERT a sexual act is happening. If NONE of these are
// present we drop "public sex" — the model gets fooled by outdoor
// scenes (peeing, posing, walking) and tags them as public sex.
const SEX_ACT_ASSERTS = new Set<string>([
  'sex', 'fucking', 'penetration', 'penetrative sex',
  'vaginal sex', 'anal sex', 'oral sex', 'fellatio', 'blowjob',
  'cunnilingus', 'doggystyle', 'cowgirl', 'reverse cowgirl', 'missionary',
  'creampie', 'cumshot', 'facial',
  'dildo', 'vibrator', 'masturbation',  // self-pleasure also counts as a "sex act" for this rule
])

// Tags that ASSERT trans content. Without one of these signals, "trans"
// shouldn't be auto-applied — the model overuses it.
const TRANS_ASSERTS = new Set<string>([
  'trans', 'transgender', 'ts', 't-girl', 'tgirl', 'shemale', 'futa', 'futanari',
])

// Tags that imply a partner-act is occurring. If any of these are
// present, "masturbation" is wrong — the model misclassified
// penetrative sex (likely the male was off-camera for a frame). Drop
// masturbation and let the partner-act tags carry.
const PARTNER_ACT_TAGS = new Set<string>([
  'sex', 'fucking', 'penetration', 'penetrative sex',
  'blowjob', 'deepthroat', 'face fuck', 'fellatio',
  'cunnilingus', 'pussylick', '69 position', 'anilingus', 'rimming',
  'anal', 'anal sex', 'doggystyle', 'cowgirl', 'reverse cowgirl',
  'missionary', 'spooning', 'standing',
  'titfuck', 'tit fuck', 'handjob', 'footjob',
  'creampie', 'cumshot', 'facial', 'cum on face',
])

const CONFIDENCE_FLOOR = 0.45  // a tag with conf < this can't trigger an exclusion

export interface ExclusionReport {
  kept: Tier2Tag[]
  dropped: Array<{ tag: Tier2Tag; reason: string }>
}

function hasAny(set: Set<string>, names: Set<string>): boolean {
  for (const n of names) if (set.has(n)) return true
  return false
}

/**
 * Run the exclusion pass. Returns the filtered list + a report of
 * what was dropped (so the queue can log it for diagnostics).
 */
export function applyExclusionRules(richTags: Tier2Tag[]): ExclusionReport {
  if (richTags.length === 0) return { kept: [], dropped: [] }

  // Build a confidence-weighted name set for assertion checks.
  // We only treat a tag as an "assertion" if its confidence cleared
  // the floor — a 0.2-confidence "solo" tag shouldn't be allowed to
  // veto a 0.9-confidence "couple" tag (probably wrong assertion).
  const confidentNames = new Set<string>()
  for (const t of richTags) {
    if (t.confidence >= CONFIDENCE_FLOOR) confidentNames.add(t.name)
  }

  const hasSoloAssert = hasAny(confidentNames, SOLO_ASSERTS)
  const hasFemaleOnlyAssert = hasAny(confidentNames, FEMALE_ONLY_ASSERTS)
  const hasNudeAssert = hasAny(confidentNames, NUDE_ASSERTS)
  const hasTransAssert = hasAny(confidentNames, TRANS_ASSERTS)
  const hasSexActAssert = hasAny(confidentNames, SEX_ACT_ASSERTS)
  const hasPartnerActAssert = hasAny(confidentNames, PARTNER_ACT_TAGS)

  const dropped: Array<{ tag: Tier2Tag; reason: string }> = []
  const kept: Tier2Tag[] = []

  for (const t of richTags) {
    // Phase 1: bad-vocabulary drop (always applies)
    if (BAD_VOCABULARY.has(t.name)) {
      dropped.push({ tag: t, reason: 'bad-vocab (user prefers porn-site labels)' })
      continue
    }

    // Phase 2: pairwise exclusions
    if (hasSoloAssert && MULTI_PERFORMER_TAGS.has(t.name)) {
      dropped.push({ tag: t, reason: 'solo-asserted → no multi-performer' })
      continue
    }

    if ((hasSoloAssert || hasFemaleOnlyAssert) && MALE_REQUIRED_TAGS.has(t.name)) {
      dropped.push({ tag: t, reason: 'female-only/solo → no male-requiring acts' })
      continue
    }

    if (hasNudeAssert && CLOTHED_TAGS.has(t.name)) {
      dropped.push({ tag: t, reason: 'nude-asserted → no clothing tags' })
      continue
    }

    // Bare "trans" / "transgender" — user wants mtf/ftm with visible
    // indicators OR nothing. Drop bare "trans" unconditionally; if the
    // model is genuinely confident, it should have used mtf or ftm.
    if (t.name === 'trans' || t.name === 'transgender') {
      dropped.push({ tag: t, reason: 'bare trans dropped — user wants mtf/ftm with visible indicators only' })
      continue
    }
    // mtf/ftm/shemale/futa — keep only when corroborated by another
    // trans indicator OR when conf ≥ 0.85. Otherwise the model is
    // pattern-matching, not actually seeing a trans body. The user
    // has flagged this as a primary failure mode.
    if ((t.name === 'mtf' || t.name === 'ftm' || t.name === 'shemale' || t.name === 'futa' || t.name === 'futanari')
        && !hasTransAssert && t.confidence < 0.85) {
      dropped.push({ tag: t, reason: `${t.name} w/o supporting indicator (conf ${t.confidence.toFixed(2)} < 0.85)` })
      continue
    }

    if (t.name === 'public sex' && !hasSexActAssert) {
      dropped.push({ tag: t, reason: 'public sex w/o any sex-act tag' })
      continue
    }

    // Masturbation ⇄ partner-act exclusion. If any partner-act is
    // present at floor confidence, masturbation is the model's
    // miscount (likely the male was off-frame for a moment). Drop
    // masturbation; keep solo only if there's no partner act either.
    // User reported this as a primary tagger failure 2026-05-13.
    if ((t.name === 'masturbation' || t.name === 'solo') && hasPartnerActAssert) {
      dropped.push({ tag: t, reason: 'masturbation/solo + partner-act → miscount, kept partner-act' })
      continue
    }

    kept.push(t)
  }

  // Phase 3: body-type conflicts — these need pairwise comparison
  // because both tags can have above-floor confidence. Keep the higher,
  // drop the lower. (Done in a second pass on `kept` so the earlier
  // exclusion rules can fire first.)
  const keptByName = new Map<string, Tier2Tag>(kept.map((t) => [t.name, t]))
  for (const [a, b] of BODY_TYPE_CONFLICTS) {
    const ta = keptByName.get(a)
    const tb = keptByName.get(b)
    if (ta && tb) {
      const loser = ta.confidence < tb.confidence ? ta : tb
      keptByName.delete(loser.name)
      dropped.push({ tag: loser, reason: `body-type conflict with "${loser === ta ? b : a}"` })
    }
  }

  return {
    kept: Array.from(keptByName.values()),
    dropped,
  }
}
