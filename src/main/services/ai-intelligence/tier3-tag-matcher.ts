// ===============================
// Tier 3 Tag Matcher - Map AI labels to existing tag library
// ===============================

import type { DB } from '../../db'

// We need access to raw database for direct SQL queries
type RawDB = DB['raw']

export interface MatchedTag {
  id: number
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

// Synonym dictionary for common tag variations
const SYNONYMS: Record<string, string[]> = {
  // Hair colors
  'blonde': ['blonde hair', 'blond', 'blond hair', 'golden hair'],
  'brunette': ['brunette hair', 'brown hair', 'dark hair'],
  'redhead': ['red hair', 'ginger', 'ginger hair', 'auburn'],
  'black hair': ['dark hair', 'raven hair'],

  // Body types
  'busty': ['big breasts', 'large breasts', 'huge breasts', 'big boobs', 'large boobs'],
  'petite': ['small', 'tiny', 'slim', 'small frame'],
  'curvy': ['thick', 'thicc', 'voluptuous', 'hourglass'],
  'athletic': ['fit', 'toned', 'muscular', 'sporty'],
  'bbw': ['plus size', 'chubby', 'plump', 'heavy'],
  'milf': ['mature', 'mom', 'mother'],

  // Actions
  'blowjob': ['bj', 'oral', 'sucking', 'fellatio', 'giving head'],
  'handjob': ['hj', 'hand job', 'stroking', 'jerking'],
  'anal': ['anal sex', 'butt sex', 'ass fuck'],
  'doggy': ['doggystyle', 'doggy style', 'from behind'],
  'cowgirl': ['riding', 'on top', 'girl on top'],
  'reverse cowgirl': ['reverse riding'],
  'missionary': ['missionary position'],
  'creampie': ['cream pie', 'cum inside', 'internal cum'],
  'facial': ['cum on face', 'face cum'],
  'cumshot': ['cum shot', 'money shot'],
  'deepthroat': ['deep throat', 'throat fuck'],
  'titfuck': ['tit fuck', 'titty fuck', 'paizuri', 'boobjob'],

  // Settings
  'bedroom': ['bed', 'in bed'],
  'bathroom': ['shower', 'bath', 'tub'],
  'outdoor': ['outside', 'outdoors', 'public'],
  'office': ['work', 'desk'],
  'kitchen': ['counter'],

  // Clothing
  'lingerie': ['underwear', 'bra', 'panties'],
  'stockings': ['thigh highs', 'nylons', 'hosiery'],
  'heels': ['high heels', 'stilettos'],
  'bikini': ['swimsuit', 'bathing suit'],
  'cosplay': ['costume', 'roleplay'],

  // Categories
  'pov': ['point of view', 'first person'],
  'solo': ['solo female', 'solo male', 'masturbation'],
  'lesbian': ['girl on girl', 'gg', 'ff'],
  'threesome': ['3some', 'three way', 'menage'],
  'gangbang': ['gang bang', 'group sex'],
  'interracial': ['ir', 'bbc', 'interacial'],
  'amateur': ['homemade', 'home video'],
  'professional': ['studio', 'pro'],

  // Positions
  '69': ['sixty nine', 'sixtynine'],
  'standing': ['standing sex', 'standing position'],
  'prone': ['prone bone', 'face down'],
}

// Build reverse lookup map
const REVERSE_SYNONYMS: Map<string, string> = new Map()
for (const [canonical, synonyms] of Object.entries(SYNONYMS)) {
  for (const syn of synonyms) {
    REVERSE_SYNONYMS.set(syn.toLowerCase(), canonical)
  }
}

export class Tier3TagMatcher {
  private rawDb: RawDB
  private tagCache: Map<string, { id: number; name: string }> = new Map()
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
      const tags = this.rawDb.prepare('SELECT id, name FROM tags').all() as Array<{ id: number; name: string }>
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
   * Match AI-generated tags to existing library tags
   */
  match(
    tier1Tags: Array<{ label: string; confidence: number }>,
    tier2Tags?: string[]
  ): Tier3Result {
    this.refreshCache()

    const matchedTags: MatchedTag[] = []
    const newTagSuggestions: NewTagSuggestion[] = []
    const seenTagIds = new Set<number>()

    // Process Tier 1 tags
    for (const tag of tier1Tags) {
      const result = this.findMatch(tag.label, tag.confidence)
      if (result.matched && !seenTagIds.has(result.matched.id)) {
        seenTagIds.add(result.matched.id)
        matchedTags.push(result.matched)
      } else if (result.suggestion) {
        newTagSuggestions.push(result.suggestion)
      }
    }

    // Process Tier 2 tags (if available)
    if (tier2Tags) {
      for (const tagName of tier2Tags) {
        const result = this.findMatch(tagName, 0.7) // Default confidence for Tier 2
        if (result.matched && !seenTagIds.has(result.matched.id)) {
          seenTagIds.add(result.matched.id)
          matchedTags.push(result.matched)
        } else if (result.suggestion) {
          // Check if we already have this suggestion
          const existing = newTagSuggestions.find(s => s.name.toLowerCase() === result.suggestion!.name.toLowerCase())
          if (!existing) {
            newTagSuggestions.push(result.suggestion)
          }
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
  createNewTags(suggestions: NewTagSuggestion[]): number[] {
    const createdIds: number[] = []

    for (const suggestion of suggestions) {
      try {
        const existing = this.rawDb.prepare('SELECT id FROM tags WHERE LOWER(name) = LOWER(?)').get(suggestion.name) as { id: number } | undefined
        if (existing) {
          createdIds.push(existing.id)
          continue
        }

        const result = this.rawDb.prepare('INSERT INTO tags (name, color) VALUES (?, ?)').run(
          suggestion.name,
          this.generateColor()
        )
        createdIds.push(result.lastInsertRowid as number)
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
