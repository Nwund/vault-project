// File: src/main/services/ai-intelligence/filename-tokenizer.ts
//
// Anitomy-style filename parser. The existing filename-hints.ts is a
// substring keyword matcher — great for tag inference, but it doesn't
// give us a STRUCTURED view of the filename (title vs. studio vs.
// performers vs. date vs. resolution etc.).
//
// This module produces a typed token stream + element table the way
// the Anitomy library does for anime filenames. The output is fed into
// the Tier 2 prompt as a structured hint AND used by the bulk-rename
// engine to default-fill template variables when the user hasn't
// manually populated metadata yet.
//
// Pipeline:
//   1. Tokenize:    split on separators while keeping bracket/paren
//                   boundaries as their own tokens; mark each token's
//                   role candidates.
//   2. Identify:    state-machine pass tags each token as date,
//                   resolution, codec, audio, group, etc. via
//                   anchored regex on the WHOLE token (avoids false
//                   positives like "1080p" matching inside a title).
//   3. Collapse:    unidentified tokens between identified ones form
//                   the title; first " - " or " — " separator splits
//                   studio prefix from title.
//
// Design notes:
//   - Pure-function module, no I/O, fully unit-testable.
//   - We intentionally don't import filename-hints — the two systems
//     are independent: hints emits tags, this emits STRUCTURE.
//   - Adult-video-aware: known patterns include OnlyFans/Fansly
//     watermarks, Brazzers-style "Studio - Date - Performer - Title"
//     layout, and the @username convention.

export type TokenKind =
  | 'open-bracket'   // [ ( {
  | 'close-bracket'  // ] ) }
  | 'separator'      // - _ . space
  | 'word'           // anything else

export interface RawToken {
  text: string
  kind: TokenKind
  /** Position in the original (extension-stripped) string. */
  start: number
  end: number
  /** Bracket nesting depth at this token (open-bracket is at depth+1 inside its range). */
  depth: number
}

export type ElementKind =
  | 'studio'
  | 'release-group'
  | 'performer'
  | 'title'
  | 'date'
  | 'year'
  | 'episode'
  | 'scene'
  | 'resolution'
  | 'video-codec'
  | 'audio-codec'
  | 'source'           // WEB / BluRay / DVD / HDTV / WEBRip
  | 'hdr'              // HDR / HDR10 / DV
  | 'language'
  | 'site'             // onlyfans / fansly / chaturbate
  | 'hash'             // 8+ hex (release hash)
  | 'extension'
  | 'junk'             // copy/final/v2 markers

export interface ParsedElement {
  kind: ElementKind
  value: string
  /** Range into the original (extension-stripped) name for highlighting. */
  span?: { start: number; end: number }
}

export interface ParsedFilename {
  /** Lowercased extension without dot, or null if no extension found. */
  extension: string | null
  /** Single source of truth for every recognized fragment. */
  elements: ParsedElement[]
  /** Convenience accessor: first title element or full title if multiple. */
  title: string | null
  /** Convenience accessor: studio name (lowercased). */
  studio: string | null
  /** Convenience accessor: parsed performers. */
  performers: string[]
  /** ISO date string YYYY-MM-DD if a date was recognized. */
  date: string | null
  /** 4-digit year if recognized (independent of full date). */
  year: number | null
  /** Resolution string like 1080p, 4k, 2160p. */
  resolution: string | null
  /** Raw token stream — useful for diffing against bulk-rename templates. */
  rawTokens: RawToken[]
}

const BRACKET_OPEN = new Set(['[', '(', '{', '<'])
const BRACKET_CLOSE = new Set([']', ')', '}', '>'])
const SEPARATORS = new Set([' ', '\t', '_', '-', '.', '+'])

// ────────────────────────────────────────────────────────────
// Tokenizer
// ────────────────────────────────────────────────────────────

function tokenize(name: string): RawToken[] {
  const tokens: RawToken[] = []
  let depth = 0
  let i = 0
  while (i < name.length) {
    const ch = name[i]
    if (BRACKET_OPEN.has(ch)) {
      depth += 1
      tokens.push({ text: ch, kind: 'open-bracket', start: i, end: i + 1, depth })
      i += 1
      continue
    }
    if (BRACKET_CLOSE.has(ch)) {
      tokens.push({ text: ch, kind: 'close-bracket', start: i, end: i + 1, depth })
      depth = Math.max(0, depth - 1)
      i += 1
      continue
    }
    if (SEPARATORS.has(ch)) {
      const start = i
      while (i < name.length && SEPARATORS.has(name[i])) i += 1
      tokens.push({ text: name.slice(start, i), kind: 'separator', start, end: i, depth })
      continue
    }
    // word — consume until separator or bracket
    const start = i
    while (i < name.length && !SEPARATORS.has(name[i]) && !BRACKET_OPEN.has(name[i]) && !BRACKET_CLOSE.has(name[i])) {
      i += 1
    }
    tokens.push({ text: name.slice(start, i), kind: 'word', start, end: i, depth })
  }
  return tokens
}

// ────────────────────────────────────────────────────────────
// Element classifiers — each returns null or a normalized value.
// They operate on a SINGLE word token. Returning null means "not me".
// ────────────────────────────────────────────────────────────

function classifyResolution(t: string): string | null {
  // 1080p, 1080P, 1920x1080, 4k, 4K, 2160p, 480p
  const m1 = /^(\d{3,4})p$/i.exec(t)
  if (m1) return `${m1[1]}p`
  const m2 = /^(\d{3,4})x(\d{3,4})$/i.exec(t)
  if (m2) return `${m2[1]}x${m2[2]}`
  if (/^(4k|8k|uhd|fhd)$/i.exec(t)) return t.toLowerCase()
  if (/^(2160|1440|1080|720|480|360)$/.exec(t)) return `${t}p`
  return null
}

function classifyVideoCodec(t: string): string | null {
  const low = t.toLowerCase()
  if (/^x26[45]$/.test(low) || /^h\.?26[45]$/.test(low)) return low.replace('.', '')
  if (/^(hevc|avc|av1|vp9|xvid|divx)$/.test(low)) return low
  return null
}

function classifyAudioCodec(t: string): string | null {
  const low = t.toLowerCase()
  if (/^(aac|ac3|eac3|dts|dts-hd|truehd|opus|flac|mp3|mp2|pcm)$/.test(low)) return low
  if (/^(5\.1|7\.1|2\.0)$/.test(low)) return low
  return null
}

function classifySource(t: string): string | null {
  const low = t.toLowerCase()
  if (/^(web-?dl|web-?rip|webrip|hdtv|bluray|bdrip|brrip|dvdrip|hdrip|amzn|nf|hulu|dsnp)$/.test(low)) {
    return low.replace(/-/g, '')
  }
  return null
}

function classifyHdr(t: string): string | null {
  const low = t.toLowerCase()
  if (/^(hdr|hdr10|hdr10\+|hlg|dovi|dv)$/.test(low)) return low
  return null
}

function classifyLanguage(t: string): string | null {
  const low = t.toLowerCase()
  if (/^(jpn|jap|eng|english|esp|spa|kor|chi|cn|jp|kr|us|fr|de|it|ru|pt|br)$/.test(low)) return low
  return null
}

function classifyDate(t: string): string | null {
  // YYYY-MM-DD, YYYY.MM.DD, YYYYMMDD, YYYY_MM_DD
  const m1 = /^(\d{4})[-._](\d{1,2})[-._](\d{1,2})$/.exec(t)
  if (m1) {
    const y = +m1[1], mo = +m1[2], d = +m1[3]
    if (y >= 1990 && y <= 2099 && mo >= 1 && mo <= 12 && d >= 1 && d <= 31) {
      return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    }
  }
  const m2 = /^(\d{4})(\d{2})(\d{2})$/.exec(t)
  if (m2) {
    const y = +m2[1], mo = +m2[2], d = +m2[3]
    if (y >= 1990 && y <= 2099 && mo >= 1 && mo <= 12 && d >= 1 && d <= 31) {
      return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    }
  }
  return null
}

function classifyYear(t: string): number | null {
  const m = /^(\d{4})$/.exec(t)
  if (!m) return null
  const y = +m[1]
  if (y >= 1990 && y <= 2099) return y
  return null
}

function classifyEpisode(t: string): string | null {
  // E12, E012, EP12, S01E12 (capture episode part)
  const m = /^s\d{1,3}e(\d{1,4})$/i.exec(t)
  if (m) return m[1].padStart(2, '0')
  const m2 = /^e?p?(\d{1,4})$/i.exec(t)
  if (m2 && /^(e|ep)/i.test(t)) return m2[1].padStart(2, '0')
  return null
}

function classifySceneNumber(t: string): string | null {
  // Scene01, sc01, scene-1
  const m = /^(?:scene|sc)[-._]?(\d{1,3})$/i.exec(t)
  return m ? m[1].padStart(2, '0') : null
}

function classifyHash(t: string): string | null {
  if (/^[a-f0-9]{8,32}$/i.test(t)) return t.toLowerCase()
  return null
}

function classifyJunk(t: string): string | null {
  const low = t.toLowerCase()
  if (/^(copy|final|edit|repack|proper|repost|reup|remux|sample|trailer|preview)$/.test(low)) return low
  if (/^v\d+$/i.test(low)) return low
  return null
}

function classifySite(t: string): string | null {
  const low = t.toLowerCase()
  if (/^(onlyfans|fansly|manyvids|chaturbate|stripchat|cam4|myfreecams|camsoda|jerkmate|reddit|pornhub|xvideos|xhamster|spankbang|youporn|redtube|eporner|porntrex)(\.com)?$/.test(low)) {
    return low.replace(/\.com$/, '')
  }
  return null
}

// ────────────────────────────────────────────────────────────
// Studio/performer detection
// ────────────────────────────────────────────────────────────

// Small studio vocab kept in this module so the file is
// self-contained. filename-hints has a larger KNOWN_STUDIOS list, but
// importing it would create a circular shape; we duplicate the most
// common ones here.
const STUDIO_VOCAB = new Set([
  'brazzers', 'bangbros', 'realitykings', 'naughtyamerica', 'mofos',
  'blacked', 'blackedraw', 'tushy', 'tushyraw', 'vixen', 'deeper',
  'wicked', 'evilangel', 'kink', 'legalporno', 'private', 'hardx',
  'julesjordan', 'newsensations', 'darkx', 'milehighmedia',
  'teamskeet', 'familystrokes', 'sislovesme', 'mylf', 'mylfx',
  'adulttime', 'transangels', 'transerotica',
  'fakeagent', 'faketaxi', 'publicagent', 'czechcasting',
  'analized', 'pornpros', 'tokyohot', 'caribbeancom', '1pondo', 'heyzo',
  'badoinkvr', 'naughtyamericavr', 'wankzvr', 'sexlikereal',
  'pornhub', 'xvideos', 'xhamster', 'spankbang', 'redtube',
])

function classifyStudio(t: string): string | null {
  const low = t.toLowerCase().replace(/\.com$/, '')
  return STUDIO_VOCAB.has(low) ? low : null
}

// A performer mention looks like "@username" (OnlyFans/Twitter style)
// or two consecutive capitalized tokens "Riley Reid". We catch the @
// case here cheaply; the dual-capitalized case requires sequence
// awareness and is handled in the identify pass below.
function classifyPerformerAt(t: string): string | null {
  const m = /^@([a-zA-Z0-9_]{3,32})$/.exec(t)
  return m ? m[1] : null
}

// ────────────────────────────────────────────────────────────
// Identify pass
// ────────────────────────────────────────────────────────────

/**
 * Classify each word token. The function returns identified elements
 * AND a parallel array marking which raw tokens were "consumed" so
 * the title-collection pass can ignore them.
 */
function identifyElements(tokens: RawToken[]): { elements: ParsedElement[]; consumed: Set<number> } {
  const elements: ParsedElement[] = []
  const consumed = new Set<number>()
  const wordIndices: number[] = []
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i].kind === 'word') wordIndices.push(i)
  }

  // First pass: per-token unambiguous classifiers.
  for (const i of wordIndices) {
    const tok = tokens[i]
    const text = tok.text

    const date = classifyDate(text)
    if (date) {
      elements.push({ kind: 'date', value: date, span: { start: tok.start, end: tok.end } })
      // Year is implied by date — emit both so consumers can pick either.
      elements.push({ kind: 'year', value: date.slice(0, 4), span: { start: tok.start, end: tok.start + 4 } })
      consumed.add(i)
      continue
    }

    const res = classifyResolution(text)
    if (res) {
      elements.push({ kind: 'resolution', value: res, span: { start: tok.start, end: tok.end } })
      consumed.add(i)
      continue
    }

    const vc = classifyVideoCodec(text)
    if (vc) {
      elements.push({ kind: 'video-codec', value: vc, span: { start: tok.start, end: tok.end } })
      consumed.add(i)
      continue
    }

    const ac = classifyAudioCodec(text)
    if (ac) {
      elements.push({ kind: 'audio-codec', value: ac, span: { start: tok.start, end: tok.end } })
      consumed.add(i)
      continue
    }

    const src = classifySource(text)
    if (src) {
      elements.push({ kind: 'source', value: src, span: { start: tok.start, end: tok.end } })
      consumed.add(i)
      continue
    }

    const hdr = classifyHdr(text)
    if (hdr) {
      elements.push({ kind: 'hdr', value: hdr, span: { start: tok.start, end: tok.end } })
      consumed.add(i)
      continue
    }

    const ep = classifyEpisode(text)
    if (ep) {
      elements.push({ kind: 'episode', value: ep, span: { start: tok.start, end: tok.end } })
      consumed.add(i)
      continue
    }

    const scene = classifySceneNumber(text)
    if (scene) {
      elements.push({ kind: 'scene', value: scene, span: { start: tok.start, end: tok.end } })
      consumed.add(i)
      continue
    }

    const site = classifySite(text)
    if (site) {
      elements.push({ kind: 'site', value: site, span: { start: tok.start, end: tok.end } })
      consumed.add(i)
      continue
    }

    const studio = classifyStudio(text)
    if (studio) {
      elements.push({ kind: 'studio', value: studio, span: { start: tok.start, end: tok.end } })
      consumed.add(i)
      continue
    }

    const at = classifyPerformerAt(text)
    if (at) {
      elements.push({ kind: 'performer', value: at, span: { start: tok.start, end: tok.end } })
      consumed.add(i)
      continue
    }

    const hash = classifyHash(text)
    if (hash) {
      elements.push({ kind: 'hash', value: hash, span: { start: tok.start, end: tok.end } })
      consumed.add(i)
      continue
    }

    const lang = classifyLanguage(text)
    if (lang) {
      elements.push({ kind: 'language', value: lang, span: { start: tok.start, end: tok.end } })
      consumed.add(i)
      continue
    }

    const junk = classifyJunk(text)
    if (junk) {
      elements.push({ kind: 'junk', value: junk, span: { start: tok.start, end: tok.end } })
      consumed.add(i)
      continue
    }

    const year = classifyYear(text)
    if (year !== null) {
      // Year-only tokens are ambiguous (could be in a title like
      // "Eleven 2024"). Only treat as year if it sits in a paren/
      // bracket, or is the last token of a top-level run.
      if (tok.depth > 0) {
        elements.push({ kind: 'year', value: String(year), span: { start: tok.start, end: tok.end } })
        consumed.add(i)
      }
      // else leave for title
    }
  }

  // Second pass: bracket-enclosed groups at start/end are release groups.
  // Pattern: [ word-tokens ] at depth 1 with no other elements identified inside.
  // The first such group at the start = release-group. Trailing bracket-groups
  // with hashes inside are also release-group containers.
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i].kind === 'open-bracket') {
      // Find matching close at same nominal depth
      let close = -1
      for (let j = i + 1; j < tokens.length; j++) {
        if (tokens[j].kind === 'close-bracket' && tokens[j].depth === tokens[i].depth) {
          close = j
          break
        }
      }
      if (close < 0) continue
      // Collect word tokens inside
      const insideWords: number[] = []
      for (let j = i + 1; j < close; j++) {
        if (tokens[j].kind === 'word' && !consumed.has(j)) insideWords.push(j)
      }
      if (insideWords.length === 0) continue
      // If the first non-separator token sequence is uninterrupted words,
      // treat as a release-group label.
      const text = insideWords.map(idx => tokens[idx].text).join(' ').trim()
      if (text.length > 0 && text.length < 40) {
        elements.push({
          kind: 'release-group',
          value: text,
          span: { start: tokens[i].start, end: tokens[close].end },
        })
        for (const idx of insideWords) consumed.add(idx)
      }
    }
  }

  // Third pass: consecutive capitalized-word runs of length ≥ 2 that
  // weren't otherwise consumed → candidate performer names.
  // Heuristic: a "Name" word is /^[A-Z][a-z]+$/ — strict enough to avoid
  // catching acronyms, generic adjectives, or all-caps tags.
  for (let i = 0; i < wordIndices.length; i++) {
    const idx = wordIndices[i]
    if (consumed.has(idx)) continue
    const tok = tokens[idx]
    if (!/^[A-Z][a-z]+$/.test(tok.text)) continue
    // Look ahead: only "separator → capitalized word" pairs count.
    // Stop once we hit a non-Name boundary.
    const run: number[] = [idx]
    let j = i + 1
    while (j < wordIndices.length) {
      const nextIdx = wordIndices[j]
      const next = tokens[nextIdx]
      // Only consider IMMEDIATELY-adjacent words (sep between, no bracket).
      const between = tokens.slice(idx + 1, nextIdx).every(t => t.kind === 'separator')
      if (!between) break
      if (consumed.has(nextIdx)) break
      if (!/^[A-Z][a-z]+$/.test(next.text)) break
      run.push(nextIdx)
      j += 1
    }
    if (run.length >= 2) {
      const name = run.map(r => tokens[r].text).join(' ')
      elements.push({
        kind: 'performer',
        value: name,
        span: { start: tokens[run[0]].start, end: tokens[run[run.length - 1]].end },
      })
      for (const r of run) consumed.add(r)
      i = wordIndices.indexOf(run[run.length - 1])
    }
  }

  return { elements, consumed }
}

// ────────────────────────────────────────────────────────────
// Title extraction
// ────────────────────────────────────────────────────────────

/**
 * Title = the longest contiguous run of unconsumed word tokens at depth 0,
 * with separators flattened to single spaces. If a " - " separator splits
 * the run into two halves AND the first half is short (≤3 words) we
 * promote the first half to studio and use the second as title.
 */
function extractTitle(tokens: RawToken[], consumed: Set<number>): { studio?: string; title?: string } {
  // Build segments at depth 0 broken by long separator runs ("- " etc.)
  type Segment = { start: number; end: number; words: string[]; wordIndices: number[] }
  const segments: Segment[] = []
  let current: Segment | null = null
  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i]
    if (tok.depth > 0) {
      if (current && current.words.length > 0) { segments.push(current); current = null }
      continue
    }
    if (tok.kind === 'word' && !consumed.has(i)) {
      if (!current) current = { start: tok.start, end: tok.end, words: [], wordIndices: [] }
      current.words.push(tok.text)
      current.wordIndices.push(i)
      current.end = tok.end
      continue
    }
    if (tok.kind === 'separator') {
      // " - " (a dash surrounded by spaces, or a long separator) is
      // treated as a segment boundary.
      const text = tok.text
      if (text.includes('-') && text.length >= 2 && current && current.words.length > 0) {
        segments.push(current)
        current = null
      }
      // Else: keep accumulating.
      continue
    }
    if (current && current.words.length > 0) {
      segments.push(current)
      current = null
    }
  }
  if (current && current.words.length > 0) segments.push(current)

  if (segments.length === 0) return {}

  // Pick the longest segment as the title.
  const longest = segments.reduce((a, b) => (b.words.join(' ').length > a.words.join(' ').length ? b : a))
  const titleText = longest.words.join(' ').trim()

  // If there's a SHORT (≤3 words) segment BEFORE the title that's all caps
  // or capitalized, treat it as a studio label.
  const longestIdx = segments.indexOf(longest)
  let studio: string | undefined
  for (let s = 0; s < longestIdx; s++) {
    const seg = segments[s]
    if (seg.words.length >= 1 && seg.words.length <= 3 && seg.words.every(w => /^[A-Z0-9]/.test(w))) {
      studio = seg.words.join(' ').toLowerCase().replace(/\.com$/, '')
    }
  }

  return { studio, title: titleText.length > 0 ? titleText : undefined }
}

// ────────────────────────────────────────────────────────────
// Public API
// ────────────────────────────────────────────────────────────

/**
 * Parse a filename into its structured elements. Pure function — no
 * I/O. Safe to call on every media row at scan time.
 */
export function parseFilename(filename: string): ParsedFilename {
  // Strip extension
  const extMatch = /\.([a-z0-9]{1,5})$/i.exec(filename)
  const extension = extMatch ? extMatch[1].toLowerCase() : null
  const stem = extension ? filename.slice(0, -extMatch![0].length) : filename

  const rawTokens = tokenize(stem)
  const { elements, consumed } = identifyElements(rawTokens)
  const { studio: titleStudio, title } = extractTitle(rawTokens, consumed)

  // Studio precedence: explicit STUDIO_VOCAB match > derived from title leading segment.
  const explicitStudio = elements.find(e => e.kind === 'studio')?.value
  const studio = explicitStudio ?? titleStudio ?? null

  if (title) elements.push({ kind: 'title', value: title })

  const performers = elements.filter(e => e.kind === 'performer').map(e => e.value)
  const date = elements.find(e => e.kind === 'date')?.value ?? null
  const yearStr = elements.find(e => e.kind === 'year')?.value ?? null
  const year = yearStr ? Number(yearStr) : null
  const resolution = elements.find(e => e.kind === 'resolution')?.value ?? null

  if (extension) elements.push({ kind: 'extension', value: extension })

  return {
    extension,
    elements,
    title: title ?? null,
    studio,
    performers,
    date,
    year,
    resolution,
    rawTokens,
  }
}

/**
 * Render a parsed filename as a short hint block for the Tier 2 Venice
 * prompt. Only emits a block if at least 2 structural elements were
 * identified (otherwise the parse is too thin to be useful).
 */
export function renderParsedForPrompt(parsed: ParsedFilename): string {
  const lines: string[] = []
  if (parsed.studio) lines.push(`Studio (filename): ${parsed.studio}`)
  if (parsed.performers.length > 0) lines.push(`Performers (filename): ${parsed.performers.join(', ')}`)
  if (parsed.date) lines.push(`Recorded: ${parsed.date}`)
  else if (parsed.year) lines.push(`Year: ${parsed.year}`)
  if (parsed.resolution) lines.push(`Resolution: ${parsed.resolution}`)
  if (parsed.title) lines.push(`Title (filename): ${parsed.title}`)
  if (lines.length < 2) return ''
  lines.unshift('Filename structure (soft hint — verify with frames):')
  return lines.join('\n  ')
}
