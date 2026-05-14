// File: src/main/services/ai-intelligence/style-learner.ts
//
// Learn the user's writing voice from their APPROVED title/description
// outputs and surface it as prompt context for Tier 2 + regenerate calls.
//
// What we learn:
//   1. Title style — average length, common opening words, vulgarity
//      level (uses words like "cock"/"pussy" vs sanitized words).
//   2. Description style — avg sentence count, typical vocab, structure.
//   3. Tag vocabulary preference — when the user has tagged both
//      "blowjob" and "bj" we prefer the more common form going forward.
//
// All three feed back into prompts as "this is how the user writes" /
// "this is the user's preferred spelling" so future generations land
// closer to what they'll approve without edits.

import type { DB } from '../../db'

type RawDB = DB['raw']

export interface TitleStyle {
  avgWordCount: number
  topOpeningWords: string[]
  vulgarityScore: number  // 0..1, how often raw words appear
  sampleTitles: string[]
}

export interface DescriptionStyle {
  avgSentenceCount: number
  avgWordCount: number
  vulgarityScore: number
  sampleDescriptions: string[]
}

export interface VocabPreference {
  /** Map from synonym → preferred canonical form. e.g. "bj" → "blowjob"
   *  when the user has tagged 30 items "blowjob" and 2 "bj". */
  preferred: Map<string, string>
}

// Words that signal vulgar/colloquial vocab (used to score style).
const VULGAR_VOCAB = new Set([
  'cock', 'dick', 'pussy', 'tits', 'ass', 'cum', 'fuck', 'fucking',
  'fucked', 'suck', 'sucked', 'sucking', 'creampie', 'facial',
  'gape', 'plow', 'pound', 'pounded', 'pounding', 'slut', 'whore',
  'bitch', 'horny', 'wet', 'tight', 'thick', 'huge', 'massive',
])

// Common synonym groups — pick whichever the user uses more often.
// Order in each group doesn't imply preference; we count both.
const SYNONYM_GROUPS: string[][] = [
  ['blowjob', 'bj', 'oral'],
  ['cumshot', 'cum shot', 'cum', 'jizz'],
  ['creampie', 'cream pie', 'internal cumshot'],
  ['anal', 'butt fuck', 'butt sex', 'sodomy'],
  ['doggystyle', 'doggy style', 'from behind', 'doggy'],
  ['big tits', 'huge tits', 'big boobs', 'massive tits'],
  ['big ass', 'big butt', 'thicc ass'],
  ['stepmom', 'step mom', 'step-mom'],
  ['stepsister', 'step sister', 'step-sister'],
  ['milf', 'mature mom'],
]

let cached: { titleStyle: TitleStyle; descStyle: DescriptionStyle; vocab: VocabPreference; built: number } | null = null
const CACHE_TTL_MS = 5 * 60_000

function tokenizeWords(text: string): string[] {
  return text.toLowerCase()
    .replace(/[^a-zA-Z0-9\s'-]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 0)
}

function countVulgar(text: string): number {
  const words = tokenizeWords(text)
  if (words.length === 0) return 0
  let hits = 0
  for (const w of words) if (VULGAR_VOCAB.has(w)) hits++
  return hits / words.length
}

function buildStyle(rawDb: RawDB) {
  // Pull all approved titles + descriptions. Cap to last 200 by
  // reviewed_at so the style reflects current taste (works with the
  // calibration decay we added in task #18).
  const rows = rawDb.prepare(`
    SELECT approved_title, description
    FROM ai_analysis_results
    WHERE review_status = 'approved'
      AND (approved_title IS NOT NULL OR description IS NOT NULL)
    ORDER BY reviewed_at DESC
    LIMIT 200
  `).all() as Array<{ approved_title: string | null; description: string | null }>

  const titles = rows.map((r) => r.approved_title).filter((t): t is string => !!t && t.trim().length > 0)
  const descs = rows.map((r) => r.description).filter((d): d is string => !!d && d.trim().length > 0)

  // Title style
  const titleWordCounts = titles.map((t) => tokenizeWords(t).length)
  const avgTitleWords = titleWordCounts.length > 0
    ? titleWordCounts.reduce((a, b) => a + b, 0) / titleWordCounts.length
    : 0
  const openingCounts = new Map<string, number>()
  for (const t of titles) {
    const first = tokenizeWords(t)[0]
    if (first) openingCounts.set(first, (openingCounts.get(first) ?? 0) + 1)
  }
  const topOpening = Array.from(openingCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([w]) => w)
  const titleVulgarity = titles.length > 0
    ? titles.reduce((s, t) => s + countVulgar(t), 0) / titles.length
    : 0
  const sampleTitles = titles.slice(0, 5)

  // Description style
  const descWordCounts = descs.map((d) => tokenizeWords(d).length)
  const avgDescWords = descWordCounts.length > 0
    ? descWordCounts.reduce((a, b) => a + b, 0) / descWordCounts.length
    : 0
  const descSentCounts = descs.map((d) => (d.match(/[.!?]+/g) ?? []).length || 1)
  const avgDescSent = descSentCounts.length > 0
    ? descSentCounts.reduce((a, b) => a + b, 0) / descSentCounts.length
    : 0
  const descVulgarity = descs.length > 0
    ? descs.reduce((s, d) => s + countVulgar(d), 0) / descs.length
    : 0
  const sampleDescs = descs.slice(0, 3)

  // Vocab preferences. Count how many APPROVED items have each tag in
  // a synonym group; the most-used name is what we'll bias toward.
  const tagCounts = rawDb.prepare(`
    SELECT LOWER(t.name) AS name, COUNT(*) AS n
    FROM media_tags mt
    JOIN tags t ON t.id = mt.tagId
    WHERE EXISTS (
      SELECT 1 FROM ai_analysis_results ar
      WHERE ar.media_id = mt.mediaId AND ar.review_status = 'approved'
    )
    GROUP BY LOWER(t.name)
  `).all() as Array<{ name: string; n: number }>
  const tagN = new Map(tagCounts.map((r) => [r.name, r.n]))

  const preferred = new Map<string, string>()
  for (const group of SYNONYM_GROUPS) {
    const counts = group.map((g) => ({ name: g, n: tagN.get(g) ?? 0 }))
    counts.sort((a, b) => b.n - a.n)
    if (counts[0].n === 0) continue  // user has none of these tags
    const winner = counts[0].name
    for (const other of counts) {
      if (other.name !== winner && other.n < counts[0].n) {
        preferred.set(other.name, winner)
      }
    }
  }

  return {
    titleStyle: {
      avgWordCount: avgTitleWords,
      topOpeningWords: topOpening,
      vulgarityScore: titleVulgarity,
      sampleTitles,
    },
    descStyle: {
      avgSentenceCount: avgDescSent,
      avgWordCount: avgDescWords,
      vulgarityScore: descVulgarity,
      sampleDescriptions: sampleDescs,
    },
    vocab: { preferred },
    built: Date.now(),
  }
}

function getStyle(rawDb: RawDB) {
  if (!cached || Date.now() - cached.built > CACHE_TTL_MS) {
    cached = buildStyle(rawDb)
  }
  return cached
}

export function invalidateStyleCache(): void {
  cached = null
}

/**
 * Render a compact "user's style" prompt block for injection into Tier 2
 * and regenerate prompts. Empty when there's not enough data.
 */
export function renderStyleBlockForPrompt(rawDb: RawDB): string {
  const { titleStyle, descStyle, vocab } = getStyle(rawDb)
  if (titleStyle.sampleTitles.length === 0 && descStyle.sampleDescriptions.length === 0) {
    return ''
  }
  const lines: string[] = []
  if (titleStyle.sampleTitles.length > 0) {
    lines.push(`Title voice — avg ${titleStyle.avgWordCount.toFixed(1)} words, vulgarity ${(titleStyle.vulgarityScore * 100).toFixed(0)}%${titleStyle.topOpeningWords.length ? `, often starts with: ${titleStyle.topOpeningWords.slice(0, 4).join(', ')}` : ''}`)
    lines.push(`User-approved title examples:`)
    for (const t of titleStyle.sampleTitles) lines.push(`  • "${t}"`)
  }
  if (descStyle.sampleDescriptions.length > 0) {
    lines.push(`Description voice — avg ${descStyle.avgSentenceCount.toFixed(1)} sentences / ${descStyle.avgWordCount.toFixed(0)} words, vulgarity ${(descStyle.vulgarityScore * 100).toFixed(0)}%`)
    lines.push(`User-approved description examples:`)
    for (const d of descStyle.sampleDescriptions) lines.push(`  • "${d.slice(0, 200)}"`)
  }
  if (vocab.preferred.size > 0) {
    const pairs = Array.from(vocab.preferred.entries()).slice(0, 8)
    lines.push(`Vocabulary preferences (user uses these more):`)
    for (const [from, to] of pairs) lines.push(`  • prefer "${to}" over "${from}"`)
  }
  return `

═══════════════════════════════════════════════════════════════════════
USER'S WRITING VOICE — derived from their approved outputs
═══════════════════════════════════════════════════════════════════════
${lines.join('\n')}

Match this voice. Don't sanitize if their style is vulgar. Don't pad
if their descriptions are tight. Use the vocabulary forms they prefer.
═══════════════════════════════════════════════════════════════════════
`
}

/**
 * Direct access for non-prompt callers (e.g. apply vocab preferences
 * to raw Venice output before storage).
 */
export function getVocabPreference(rawDb: RawDB): Map<string, string> {
  return getStyle(rawDb).vocab.preferred
}
