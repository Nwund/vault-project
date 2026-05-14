// File: src/main/services/ai-intelligence/booru-tag-normalizer.ts
//
// Booru/tube tags arrive as raw strings from a source's vocab (often
// underscored, anime-meta, compound, or in a domain-specific dialect
// like e621 lore). This module maps them into Vault's atomic
// porn-site-aligned tag vocabulary defined in canonical-tags.ts.
//
// Pipeline:
//   1. Tokenize space-separated source tags.
//   2. Underscore → space, lowercase.
//   3. Cheap canonical pass: normalizeToCanonical → drop isJunkTag →
//      decompose compounds to atoms.
//   4. Optional Venice pass: take the surviving terms, ask Venice to
//      map any unfamiliar/dialect terms to canonical tags (skipped
//      when no API key configured — the cheap pass alone still beats
//      the raw source vocab).
//
// Returns the FINAL deduplicated list of tag names to apply.

import {
  normalizeToCanonical,
  isJunkTag,
  decomposeToAtoms,
} from './canonical-tags'

export interface NormalizationOptions {
  /** Use Venice for a richer mapping pass. Defaults to true; falls back
   *  to canonical-only when no API key is configured. */
  useVenice?: boolean
  /** Existing tag names on the media (so we can avoid duplicates and
   *  preserve user-curated picks). */
  existingTags?: string[]
}

export interface NormalizationResult {
  /** Final tag list to apply. */
  tags: string[]
  /** Tags from `existingTags` that were superseded by a canonical
   *  equivalent and should be removed. */
  remove: string[]
  /** Tags that the canonical pass dropped as junk — surfaced for
   *  logging / UI. */
  dropped: string[]
  /** Whether Venice was actually consulted. */
  veniceUsed: boolean
}

/** Light tokenizer for raw booru-style tag strings. Splits on
 *  whitespace, replaces underscores, lowercases. */
export function tokenizeSourceTags(raw: string | null | undefined): string[] {
  if (!raw) return []
  return raw
    .split(/\s+/)
    .map((t) => t.trim().toLowerCase().replace(/_/g, ' '))
    .filter((t) => t.length > 0 && t.length <= 60)
}

/** Cheap normalize pass — canonical-tags only, no AI cost. */
export function normalizeBooruTagsCheap(
  rawTags: string[]
): { tags: string[]; dropped: string[] } {
  const kept = new Set<string>()
  const dropped: string[] = []

  for (const raw of rawTags) {
    const normalized = normalizeToCanonical(raw)
    if (!normalized) { dropped.push(raw); continue }
    if (isJunkTag(normalized)) { dropped.push(raw); continue }

    // Decompose compounds. If the compound itself is still meaningful
    // and not covered by atoms (decomposeToAtoms includes the original
    // when atoms don't fully cover), keep it; otherwise drop the
    // compound and keep only the atoms.
    const atoms = decomposeToAtoms(normalized)
    for (const a of atoms) {
      if (!isJunkTag(a)) kept.add(a)
    }
  }

  return { tags: Array.from(kept), dropped }
}

/**
 * Full normalization — cheap pass + optional Venice mapping pass.
 * The Venice pass receives the cheap-pass output AND any source terms
 * that were dropped, and is asked to:
 *   1. Map dropped/unfamiliar terms to canonical equivalents (when
 *      one exists in our vocab — Venice has been trained on the
 *      canonical-tags conventions via system prompt).
 *   2. Emit ONLY tags that fit Vault's atomic porn-site vocab.
 *   3. Reject everything else.
 */
export async function normalizeBooruTags(
  raw: string | string[] | null | undefined,
  options: NormalizationOptions = {}
): Promise<NormalizationResult> {
  const tokens = Array.isArray(raw) ? raw : tokenizeSourceTags(raw)
  const cheap = normalizeBooruTagsCheap(tokens)

  const finalTags = new Set(cheap.tags)
  const dropped = [...cheap.dropped]
  let veniceUsed = false

  // Compute supersede list: existing tags that are synonyms of a new
  // canonical form get marked for removal.
  const remove = new Set<string>()
  if (options.existingTags) {
    for (const existing of options.existingTags) {
      const norm = normalizeToCanonical(existing)
      if (!norm) continue
      // If the canonical form differs and we have the canonical form
      // in our final tags, remove the legacy form.
      if (norm !== existing.toLowerCase() && finalTags.has(norm)) {
        remove.add(existing)
      }
      // Also remove existing junk forms.
      if (isJunkTag(existing)) remove.add(existing)
    }
  }

  // Venice mapping pass — defer-load to avoid pulling the Tier 2 model
  // graph when it's not needed.
  if (options.useVenice !== false && (cheap.dropped.length > 0 || cheap.tags.length > 0)) {
    try {
      const { Tier2VisionLLM } = await import('./tier2-vision-llm')
      const llm = new Tier2VisionLLM()
      if (llm.isEnabled()) {
        veniceUsed = true
        const surviving = Array.from(finalTags)
        const droppedSample = cheap.dropped.slice(0, 50) // cap to keep prompt small
        const system = `You map raw booru/tube source tags to Vault's atomic porn-site-aligned tag vocabulary.

VAULT TAG RULES:
- Atomic only. No compound tags ("solo female" → emit "solo" AND "female", never the compound).
- No anime booru meta (1girl, solo, looking at viewer, breasts, etc unless they're real porn-site words).
- No film-grammar shots (medium shot, wide shot, close-up shots).
- No hedge prefixes (implied X, possible X, appears to be X).
- No hair-color tags (blonde, brunette, redhead) — reserved for filenames/titles.
- No clinical terms (vaginal intercourse, clitoral stimulation, sexual intercourse).
- No "X setting", "lying on bed", "looking at viewer", "smiling".
- USE real porn-site vocab: cock, pussy, tits, cum, fuck, blowjob, anal, doggy style, missionary, cowgirl, etc.
- Trans direction is mtf or ftm (not "trans woman" or "trans man").
- Race tags when identifiable: asian, ebony, latina, white, arab, mixed race.
- Body type: pawg, bbw, thicc, milf, teen — not "plus size", "young woman".
- Genres/sources: anime → hentai. Animation → animation. CGI/Blender/SFM → 3d.
- Platform cues: snapchat, tiktok, onlyfans, webcam, live stream, selfie.

OUTPUT: a JSON object {"tags": ["tag1", "tag2", ...]}. Each tag is the final canonical form to ATTACH to the media. Include the surviving-input tags AND any new tags you can confidently infer from the dropped source terms. Do NOT include junk. Do NOT include hedge words. Lowercase. Atomic.

NEVER OUTPUT: anime meta (1girl, looking at viewer, solo female compound), hair colors, "implied" prefixes, film shots, clinical vocab, body parts in isolation (breasts, vagina), platform-tag prefixes (category:, tag:).`

        const userMessage = `Surviving source tags after cleanup:
${surviving.join(', ')}

Source tags that the cheap pass rejected (may contain salvageable signal — examine and emit canonical equivalents IF they map cleanly to vault vocab):
${droppedSample.join(', ')}

Return the JSON.`

        const response = await llm.callLLMText(system, userMessage, {
          temperature: 0.2,
          maxTokens: 600,
        })

        // Parse the JSON response. Fall back to cheap-only if it's
        // malformed.
        try {
          const match = response.match(/\{[\s\S]*"tags"[\s\S]*\}/)
          if (match) {
            const parsed = JSON.parse(match[0])
            if (Array.isArray(parsed.tags)) {
              // Re-validate Venice output against our junk filter — it
              // sometimes leaks anime meta despite the prompt.
              for (const t of parsed.tags) {
                if (typeof t !== 'string') continue
                const n = normalizeToCanonical(t.trim().toLowerCase())
                if (n && !isJunkTag(n)) finalTags.add(n)
              }
            }
          }
        } catch (err) {
          console.warn('[booru-tag-normalizer] Venice JSON parse failed:', err)
        }
      }
    } catch (err) {
      console.warn('[booru-tag-normalizer] Venice pass skipped:', err)
    }
  }

  return {
    tags: Array.from(finalTags),
    remove: Array.from(remove),
    dropped,
    veniceUsed,
  }
}
