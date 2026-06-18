// ===============================
// Tier 3 Tag Matcher - Map AI labels to existing tag library
// ===============================

import { nanoid } from 'nanoid'
import type { DB } from '../../db'
import {
  getCanonicalCategory,
  normalizeToCanonical,
  isJunkTag,
  isAutoApplyBlocked,
  decomposeToAtoms,
  getCoSuggestions,
} from './canonical-tags'

// We need access to raw database for direct SQL queries
type RawDB = DB['raw']

export interface MatchedTag {
  // tags.id is TEXT PRIMARY KEY (nanoid). Was previously typed as `number` —
  // SQLite returned a string but the cast lied, and downstream INSERTs into
  // media_tags.tagId stored the rowid integer instead of the actual id, so
  // joins to tags.id never matched. Fixed to string to match reality.
  id: string
  name: string
  confidence: number
  matchType: 'exact' | 'synonym' | 'partial'
}

export interface NewTagSuggestion {
  name: string
  confidence: number
  reason: string
}

export interface Tier3Result {
  matchedTags: MatchedTag[]
  newTagSuggestions: NewTagSuggestion[]
}

// Synonym dictionary for common tag variations.
// Extensively expanded from content_analyzer/analyzer.py vocabularies
// (POSITION_VOCABULARY, MOVEMENT_VOCABULARY, ACTION_INDICATORS).
const SYNONYMS: Record<string, string[]> = {
  // ── Hair colors ─────────────────────────────────────────────────────────
  'blonde': ['blonde hair', 'blond', 'blond hair', 'golden hair', 'platinum blonde', 'bleached blonde'],
  'brunette': ['brunette hair', 'brown hair', 'dark hair', 'chestnut hair'],
  'redhead': ['red hair', 'ginger', 'ginger hair', 'auburn', 'copper hair'],
  'black hair': ['dark hair', 'raven hair', 'jet black hair'],

  // ── Body types ──────────────────────────────────────────────────────────
  'busty': ['big breasts', 'large breasts', 'huge breasts', 'big boobs', 'large boobs', 'big tits', 'huge tits'],
  'petite': ['small', 'tiny', 'slim', 'small frame', 'skinny', 'slender'],
  'curvy': ['thick', 'thicc', 'voluptuous', 'hourglass', 'phat'],
  'athletic': ['fit', 'toned', 'muscular', 'sporty', 'fitness'],
  'bbw': ['plus size', 'chubby', 'plump', 'heavy', 'big beautiful'],
  'milf': ['mature', 'mom', 'mother', 'cougar', 'older woman'],
  'big ass': ['phat ass', 'pawg', 'thick ass', 'bubble butt', 'big booty'],

  // ── Performer identity ──────────────────────────────────────────────────
  'lesbian': ['girl on girl', 'gg', 'ff', 'female only', 'lesbians', 'sapphic'],
  'gay': ['m/m', 'mm', 'male x male', 'bara', 'gay men'],
  'twink': ['femboy', 'sissy', 'slim boy', 'young male'],
  'bear': ['hairy male', 'chub', 'daddy bear'],
  'trans': ['shemale', 'ladyboy', 'tgirl', 't-girl', 'futanari', 'futa', 'dickgirl'],
  // User 2026-05-09: "trans woman → MTF, trans man → FTM".
  'mtf': ['trans woman', 'transwoman', 'm to f', 'male to female', 'transitioned woman'],
  'ftm': ['trans man', 'transman', 'f to m', 'female to male', 'transitioned man'],
  // Drawing-style — only "hentai", "animation", "3d" survive as canonical.
  // Old Tier 1 + various models still emit "anime" / "2d" / "drawn" / etc;
  // map them all to the canonical "hentai" tag so legacy output normalizes.
  'hentai': ['anime', '2d', '2d anime', 'anime style', 'manga', 'manga style'],
  'animation': ['animated', 'cartoon', 'animation style'],
  '3d': ['3d render', '3d cgi', 'cgi', 'cg', 'sfm', 'blender', 'render', '3d model'],

  // ── Oral / penetration actions ──────────────────────────────────────────
  'blowjob': ['bj', 'oral', 'sucking', 'fellatio', 'giving head', 'cock sucking', 'mouth fuck', 'face fuck',
              'sloppy head', 'two hands blowjob', 'eye contact blowjob', 'tip sucking'],
  'deepthroat': ['deep throat', 'throat fuck', 'gagging', 'throat bulge', 'throat training', 'sloppy deepthroat'],
  'cunnilingus': ['eating pussy', 'pussy eating', 'oral on female', 'face sitting', 'face riding',
                  'tongue on labia', 'clit licking', 'face buried', 'spread legs face'],
  'anilingus': ['rimming', 'ass eating', 'oral anal', 'rim job'],
  'handjob': ['hj', 'hand job', 'stroking', 'jerking', 'jerk off', 'milking'],
  'titfuck': ['tit fuck', 'titty fuck', 'paizuri', 'boobjob', 'titjob', 'breast fuck'],
  'footjob': ['foot job', 'feet on cock', 'sole job'],
  'anal': ['anal sex', 'butt sex', 'ass fuck', 'sodomy', 'anal penetration', 'rear entry anal',
           'butt fuck', 'ass fucking', 'deep anal', 'hard anal'],
  'anal gape': ['gape', 'gaping anus', 'gaping asshole', 'wide open ass'],
  'double penetration': ['dp', 'double pen', 'double vaginal', 'double anal', 'da', 'dv', 'dvp'],
  'creampie': ['cream pie', 'cum inside', 'internal cum', 'internal cumshot', 'breeding', 'cum dripping'],
  'facial': ['cum on face', 'face cum', 'cumshot on face', 'cum facial'],
  'cumshot': ['cum shot', 'money shot', 'cumming', 'cumming on'],
  'oral': ['oral sex'],
  'fingering': ['finger fucking', 'fingering pussy', 'finger play', 'self fingering'],
  'masturbation': [
    'masturbating', 'jilling', 'jerking', 'self pleasure', 'self pleasuring',
    'self-pleasure', 'self stimulation', 'self pleasure act', 'self touching',
    'playing with self', 'playing with herself', 'playing with himself',
    'touching self', 'touching herself', 'touching himself'
  ],
  'squirt': ['squirting', 'female ejaculation', 'gushing', 'spraying'],

  // ── Positions ───────────────────────────────────────────────────────────
  'doggystyle': ['doggy', 'doggy style', 'from behind', 'rear entry', 'on hands and knees', 'all fours'],
  'cowgirl': ['riding', 'on top', 'girl on top', 'female on top'],
  'reverse cowgirl': ['reverse riding', 'rcg'],
  'missionary': ['missionary position', 'man on top'],
  'prone bone': ['prone', 'face down ass up', 'fdau', 'flat doggy'],
  'spooning': ['side by side', 'spoon position', 'lateral'],
  '69': ['sixty nine', 'sixtynine', '69 position', 'inverted oral'],
  'standing': ['standing sex', 'standing position', 'standing fuck', 'standing doggy', 'against wall'],
  'amazon': ['amazon position', 'lap sitting', 'straddling on top'],
  'piledriver': ['inverted', 'upside down sex'],
  'face sitting': ['queening', 'sitting on face'],
  'bent over': ['table bend', 'couch arm', 'arched back', 'bent at waist'],
  'wheelbarrow': ['suspended', 'lifted carry', 'standing carry'],

  // ── Movement / pace ─────────────────────────────────────────────────────
  'thrusting': ['hip movement', 'pelvic motion', 'pumping', 'pounding', 'jackhammer', 'jackhammering'],
  'slow strokes': ['slow thrust', 'slow fuck', 'gentle', 'soft thrusting'],
  'rough sex': ['hard fucking', 'pounding', 'aggressive', 'intense', 'hard sex'],
  'edging': ['edge play', 'denial', 'ruined orgasm', 'start stop', 'tease and deny'],
  'grinding': ['hip rotation', 'circular motion', 'humping'],

  // ── Settings ────────────────────────────────────────────────────────────
  'bedroom': ['bed', 'in bed', 'bedside', 'mattress'],
  'bathroom': ['shower', 'bath', 'tub', 'bathtub', 'shower sex'],
  'kitchen': ['counter', 'kitchen counter', 'kitchen table'],
  'outdoor': ['outside', 'outdoors', 'public', 'in public', 'outdoor setting', 'outdoor scene', 'outside scene'],
  'office': ['work', 'desk', 'workplace'],
  'car': ['car interior', 'in car', 'backseat'],
  'pool': ['poolside', 'swimming pool'],
  'beach': ['sand', 'shore', 'oceanside'],

  // ── Clothing / appearance ──────────────────────────────────────────────
  'lingerie': ['underwear', 'bra', 'panties', 'intimates'],
  'stockings': ['thigh highs', 'nylons', 'hosiery', 'pantyhose'],
  'heels': ['high heels', 'stilettos', 'pumps'],
  'bikini': ['swimsuit', 'bathing suit', 'two piece'],
  'cosplay': ['costume', 'roleplay', 'costume play'],
  'fishnets': ['fishnet stockings', 'fishnet'],

  // ── Categories / context ────────────────────────────────────────────────
  'pov': ['point of view', 'first person', 'self perspective'],
  'solo': ['solo female', 'solo male', 'alone', 'single performer'],
  'threesome': ['3some', 'three way', 'menage', 'mfm', 'ffm', 'mmf'],
  'gangbang': ['gang bang', 'group sex', '4+ people', 'multiple men'],
  'interracial': ['ir', 'bbc', 'interacial', 'mixed race', 'bwc'],
  'amateur': ['homemade', 'home video', 'home made', 'real couple'],
  'professional': ['studio', 'pro', 'professional production'],
  'public': ['exhibitionist', 'flash', 'exhibitionism'],

  // ── BDSM / fetish ───────────────────────────────────────────────────────
  'bdsm': ['bondage', 'discipline', 'sadomasochism', 's&m', 'bondage discipline'],
  'bondage': ['tied up', 'tied', 'bound', 'rope bondage', 'shibari'],
  'spanking': ['ass slap', 'spank', 'paddle', 'paddling'],
  'choking': ['neck grab', 'breath play', 'hand on throat'],
  'femdom': ['female domination', 'mistress', 'dominant woman'],
  'submission': ['sub', 'submissive', 'subby'],
  'fetish': ['kink'],
  'foot fetish': ['feet', 'toe sucking', 'foot worship'],

  // ── Round 5 redirects (2026-05-09): merged into canonical entries above
  //    ('masturbation' and 'outdoor' duplicates removed). ──
  'vibrator': ['vibrator play', 'vibrator mplay', 'vibrator usage', 'vibrator session'],
  'dildo': ['dildo play', 'dildo session', 'dildo usage'],
  'public sex': ['public sex scene', 'street sex', 'sex in public'],
  'public blowjob': ['street blowjob', 'public bj', 'blowjob in public'],

  // ── Body parts (descriptive tags) ──────────────────────────────────────
  // (natural breasts removed from canonical 2026-05-09 — body axis is SIZE
  // not naturalness. Old "natural breasts" rows redirect to "big tits"
  // via the migration pass falling back to the user's chosen size canonical;
  // for now, no synonym → existing rows get cleanup-deleted.)
  'fake breasts': ['implants', 'silicone tits', 'enhanced breasts'],
  'tattoos': ['tattooed', 'inked'],
  'piercings': ['nipple piercing', 'pierced'],
  'shaved': ['bald', 'hairless', 'smooth'],
  'hairy': ['unshaved', 'bush'],
}

// Multi-target redirects — ONE source tag should split into MULTIPLE
// canonical atoms during cleanup migration. SYNONYMS handles 1→1, this
// handles 1→N. Used by the cleanup migration pass in `index.ts`.
export const TAG_REDIRECTS_MULTI: Record<string, ReadonlyArray<string>> = {
  // Performer compounds → atomic gender + age
  'teen girl':    ['teen', 'female'],
  'teen woman':   ['teen', 'female'],
  'teen boy':     ['teen', 'male'],
  'teen man':     ['teen', 'male'],
  'young woman':  ['teen', 'female'],
  'young man':    ['teen', 'male'],
  'young girl':   ['teen', 'female'],
  'young boy':    ['teen', 'male'],
  'older woman':  ['mature', 'female'],
  'older man':    ['mature', 'male'],
  'older lady':   ['mature', 'female'],
  // Compound shot+act → atomic act + close-up
  'facial close up':   ['facial', 'close up'],
  'facial close-up':   ['facial', 'close up'],
  'facial closeup':    ['facial', 'close up'],
  'cum close up':      ['cumshot', 'close up'],
  'cum close-up':      ['cumshot', 'close up'],
  'pussy close up':    ['close up'],
  'pussy close-up':    ['close up'],
  'ass close up':      ['close up'],
  'ass close-up':      ['close up'],
  // Trans direction redirects (matches user 2026-05-09 "MTF/FTM" rule)
  'trans woman':       ['mtf'],
  'transwoman':        ['mtf'],
  'trans female':      ['mtf'],
  'trans man':         ['ftm'],
  'transman':          ['ftm'],
  'trans male':        ['ftm'],
}

// Build reverse lookup map
const REVERSE_SYNONYMS: Map<string, string> = new Map()
for (const [canonical, synonyms] of Object.entries(SYNONYMS)) {
  for (const syn of synonyms) {
    REVERSE_SYNONYMS.set(syn.toLowerCase(), canonical)
  }
}

/**
 * Resolve a tag name to its canonical redirect target(s), or null if the
 * tag IS itself canonical / has no redirect.
 *
 * Resolution order:
 *   1. Multi-atom redirect (`teen girl` → ["teen", "female"]).
 *   2. 1→1 synonym (`vibrator play` → ["vibrator"]).
 *   3. `null` if the tag is already in its canonical form (no redirect).
 *
 * The cleanup-tags IPC uses this to MIGRATE existing rows: for any tag
 * whose redirect is non-null, it re-links `media_tags` rows to the
 * canonical target tag(s) before deleting the source.
 */
export function getTagRedirect(name: string): readonly string[] | null {
  const lower = String(name).trim().toLowerCase()
  if (!lower) return null

  // Multi-atom redirect first — these win over 1→1 synonyms.
  const multi = TAG_REDIRECTS_MULTI[lower]
  if (multi && multi.length > 0) return multi

  // 1→1 synonym
  const single = REVERSE_SYNONYMS.get(lower)
  if (single && single !== lower) return [single]

  return null
}

export class Tier3TagMatcher {
  private rawDb: RawDB
  private tagCache: Map<string, { id: string; name: string }> = new Map()
  private lastCacheUpdate = 0
  private cacheLifetime = 60000 // Refresh cache every minute

  constructor(db: DB) {
    this.rawDb = db.raw
  }

  /**
   * Refresh the tag cache from the database
   */
  private refreshCache(): void {
    const now = Date.now()
    if (now - this.lastCacheUpdate < this.cacheLifetime && this.tagCache.size > 0) {
      return
    }

    try {
      const tags = this.rawDb.prepare('SELECT id, name FROM tags').all() as Array<{ id: string; name: string }>
      this.tagCache.clear()
      for (const tag of tags) {
        this.tagCache.set(tag.name.toLowerCase(), { id: tag.id, name: tag.name })
      }
      this.lastCacheUpdate = now
      console.log(`[Tier3] Refreshed tag cache: ${this.tagCache.size} tags`)
    } catch (err) {
      console.error('[Tier3] Failed to refresh tag cache:', err)
    }
  }

  /**
   * Match AI-generated tags to existing library tags.
   *
   * Each input label is run through:
   *   1. normalizeToCanonical — strips "category:", "implied", etc. and snaps
   *      near-misses to the canonical porn-site vocabulary.
   *   2. isJunkTag           — drops captioner noise (furniture, color +
   *      object, hair-color tags, "text focus", etc.).
   *   3. decomposeToAtoms    — also surfaces atomic constituents so e.g.
   *      "facial close up" yields the compound + "facial" + "close up" as
   *      separate tags the user can pick atomically.
   *
   * The same expansion runs for both Tier 1 and Tier 2 inputs so the picker
   * sees a single consistent atomic vocabulary regardless of where a tag
   * originated.
   */
  match(
    tier1Tags: Array<{ label: string; confidence: number }>,
    tier2Tags?: string[]
  ): Tier3Result {
    this.refreshCache()

    const matchedTags: MatchedTag[] = []
    const newTagSuggestions: NewTagSuggestion[] = []
    const seenTagIds = new Set<string>()
    const seenSuggestions = new Set<string>()

    const tryMatch = (label: string, confidence: number) => {
      const result = this.findMatch(label, confidence)
      if (result.matched && !seenTagIds.has(result.matched.id)) {
        seenTagIds.add(result.matched.id)
        matchedTags.push(result.matched)
      } else if (result.suggestion && !seenSuggestions.has(result.suggestion.name.toLowerCase())) {
        seenSuggestions.add(result.suggestion.name.toLowerCase())
        newTagSuggestions.push(result.suggestion)
      }
    }

    const expandAndMatch = (rawLabel: string, confidence: number) => {
      // Check the raw label against the auto-apply blocklist BEFORE
      // normalize — catches "implied X" forms that normalize would
      // strip to a canonical bare form (then sneak through).
      if (isAutoApplyBlocked(rawLabel)) return
      const canonical = normalizeToCanonical(rawLabel)
      if (!canonical || isAutoApplyBlocked(canonical)) return
      // The compound itself + any atomic constituents. Atoms inherit a
      // slightly lower confidence because their evidence is indirect (we
      // saw the compound, not the atom in isolation).
      const atoms = decomposeToAtoms(canonical)
      for (let i = 0; i < atoms.length; i++) {
        const atom = atoms[i]
        if (!atom || isAutoApplyBlocked(atom)) continue
        const c = i === 0 ? confidence : Math.max(0.5, confidence * 0.9)
        tryMatch(atom, c)
      }
    }

    for (const tag of tier1Tags) {
      expandAndMatch(tag.label, tag.confidence)
    }

    if (tier2Tags) {
      for (const tagName of tier2Tags) {
        expandAndMatch(tagName, 0.7)
      }
    }

    // Co-suggestion pass: for every matched tag, surface implied atoms as
    // LOW-confidence suggestions in the new-tag-suggestions column. The user
    // reviews these and accepts the relevant ones. We don't auto-apply
    // because the implication isn't visual evidence — it's pattern-knowledge.
    const matchedNamesLower = new Set(matchedTags.map(m => m.name.toLowerCase()))
    for (const m of matchedTags) {
      const implied = getCoSuggestions(m.name.toLowerCase())
      for (const atom of implied) {
        if (matchedNamesLower.has(atom)) continue
        if (seenSuggestions.has(atom)) continue
        if (isAutoApplyBlocked(atom)) continue
        // Try to match the implied atom against the tag library — if it
        // already exists, promote it to matchedTags as a "synonym" hit at
        // reduced confidence. Otherwise add as a suggestion.
        const cached = this.tagCache.get(atom)
        if (cached && !seenTagIds.has(cached.id)) {
          seenTagIds.add(cached.id)
          matchedTags.push({
            id: cached.id,
            name: cached.name,
            confidence: Math.max(0.5, m.confidence * 0.7),
            matchType: 'synonym',
          })
          matchedNamesLower.add(cached.name.toLowerCase())
        } else if (!seenSuggestions.has(atom)) {
          seenSuggestions.add(atom)
          newTagSuggestions.push({
            name: atom,
            confidence: Math.max(0.5, m.confidence * 0.7),
            reason: `Implied by "${m.name}"`,
          })
        }
      }
    }

    // Sort by confidence
    matchedTags.sort((a, b) => b.confidence - a.confidence)
    newTagSuggestions.sort((a, b) => b.confidence - a.confidence)

    return {
      matchedTags,
      newTagSuggestions: newTagSuggestions.slice(0, 20) // Limit new suggestions
    }
  }

  private findMatch(
    label: string,
    confidence: number
  ): { matched?: MatchedTag; suggestion?: NewTagSuggestion } {
    const normalized = this.normalizeLabel(label)

    // Try exact match
    const exactMatch = this.tagCache.get(normalized)
    if (exactMatch) {
      return {
        matched: {
          id: exactMatch.id,
          name: exactMatch.name,
          confidence,
          matchType: 'exact'
        }
      }
    }

    // Try synonym match
    const canonical = REVERSE_SYNONYMS.get(normalized)
    if (canonical) {
      const synonymMatch = this.tagCache.get(canonical)
      if (synonymMatch) {
        return {
          matched: {
            id: synonymMatch.id,
            name: synonymMatch.name,
            confidence: confidence * 0.95, // Slightly lower for synonym
            matchType: 'synonym'
          }
        }
      }
    }

    // Try looking up in synonyms list
    for (const [canon, syns] of Object.entries(SYNONYMS)) {
      if (syns.some(s => s.toLowerCase() === normalized)) {
        const match = this.tagCache.get(canon)
        if (match) {
          return {
            matched: {
              id: match.id,
              name: match.name,
              confidence: confidence * 0.95,
              matchType: 'synonym'
            }
          }
        }
      }
    }

    // Try partial match (word containment)
    const words = normalized.split(/\s+/)
    for (const [tagName, tagInfo] of this.tagCache) {
      // Check if tag name contains our label or vice versa
      if (tagName.includes(normalized) || normalized.includes(tagName)) {
        if (Math.abs(tagName.length - normalized.length) <= 5) {
          return {
            matched: {
              id: tagInfo.id,
              name: tagInfo.name,
              confidence: confidence * 0.8, // Lower for partial
              matchType: 'partial'
            }
          }
        }
      }

      // Check word overlap
      const tagWords = tagName.split(/\s+/)
      const overlap = words.filter(w => tagWords.includes(w)).length
      if (overlap >= Math.min(words.length, tagWords.length) && overlap > 0) {
        return {
          matched: {
            id: tagInfo.id,
            name: tagInfo.name,
            confidence: confidence * 0.75,
            matchType: 'partial'
          }
        }
      }
    }

    // No match - suggest as new tag if confidence is high enough
    if (confidence >= 0.5 && normalized.length >= 3) {
      return {
        suggestion: {
          name: this.formatTagName(label),
          confidence,
          reason: 'No existing tag matches'
        }
      }
    }

    return {}
  }

  /**
   * Normalize a label for matching
   */
  private normalizeLabel(label: string): string {
    return label
      .toLowerCase()
      .replace(/_/g, ' ')
      .replace(/[^a-z0-9\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
  }

  /**
   * Format a tag name for display
   */
  private formatTagName(label: string): string {
    return label
      .replace(/_/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .split(' ')
      .map(word => word.charAt(0).toLowerCase() + word.slice(1).toLowerCase())
      .join(' ')
  }

  /**
   * Create new tags from suggestions
   */
  createNewTags(suggestions: NewTagSuggestion[]): string[] {
    // Returns the actual nanoid TEXT ids (matching tags.id) so callers can
    // INSERT them into media_tags.tagId — which is also TEXT and joined back
    // via `t.id = mt.tagId`. Previously this returned ROWIDs and the joins
    // never matched, so AI-applied tags never appeared on media.
    const createdIds: string[] = []

    for (const suggestion of suggestions) {
      try {
        const existing = this.rawDb.prepare(
          'SELECT id FROM tags WHERE LOWER(name) = LOWER(?)'
        ).get(suggestion.name) as { id: string } | undefined
        if (existing) {
          createdIds.push(existing.id)
          continue
        }

        const id = nanoid(12)
        // Look up the category from our canonical vocabulary so the AI Review
        // categorized grouping + tag-bar grouping can bucket this tag without
        // re-classifying on every render. NULL is fine for off-vocab names.
        const category = getCanonicalCategory(suggestion.name)
        this.rawDb.prepare(
          'INSERT INTO tags (id, name, color, category) VALUES (?, ?, ?, ?)'
        ).run(id, suggestion.name, this.generateColor(), category)
        createdIds.push(id)
      } catch (err) {
        console.error(`[Tier3] Failed to create tag "${suggestion.name}":`, err)
      }
    }

    // Invalidate cache
    this.lastCacheUpdate = 0

    return createdIds
  }

  /**
   * Generate a random pastel color for new tags
   */
  private generateColor(): string {
    const hue = Math.floor(Math.random() * 360)
    return `hsl(${hue}, 70%, 60%)`
  }
}
