// File: src/main/services/fuzzy-search.ts
// Fuzzy search utilities for intelligent matching

/**
 * Calculate Levenshtein distance between two strings
 * Used for typo-tolerant matching
 */
export function levenshteinDistance(a: string, b: string): number {
  if (a.length === 0) return b.length
  if (b.length === 0) return a.length

  const matrix: number[][] = []

  // Initialize matrix
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i]
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j
  }

  // Fill matrix
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1]
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        )
      }
    }
  }

  return matrix[b.length][a.length]
}

/**
 * Calculate similarity score (0-1) between two strings
 */
export function similarity(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length)
  if (maxLen === 0) return 1
  return 1 - levenshteinDistance(a, b) / maxLen
}

/**
 * Check if a string matches a query with fuzzy tolerance
 */
export function fuzzyMatch(target: string, query: string, threshold = 0.6): boolean {
  const t = target.toLowerCase()
  const q = query.toLowerCase()

  // Exact or contains match
  if (t.includes(q)) return true

  // Word-level matching
  const targetWords = t.split(/[\s\-_\.]+/)
  const queryWords = q.split(/[\s\-_\.]+/)

  // All query words should match at least one target word
  for (const qWord of queryWords) {
    if (qWord.length < 2) continue
    let matched = false
    for (const tWord of targetWords) {
      if (tWord.includes(qWord) || similarity(tWord, qWord) >= threshold) {
        matched = true
        break
      }
    }
    if (!matched) return false
  }

  return true
}

/**
 * Calculate fuzzy search score for ranking results
 */
export function fuzzyScore(target: string, query: string): number {
  const t = target.toLowerCase()
  const q = query.toLowerCase()

  let score = 0

  // Exact match (highest score)
  if (t === q) return 100

  // Starts with query
  if (t.startsWith(q)) {
    score += 80
    return score
  }

  // Contains query (word boundary aware)
  if (t.includes(` ${q}`) || t.includes(`-${q}`) || t.includes(`_${q}`)) {
    score += 70
    return score
  }

  // Simple contains
  if (t.includes(q)) {
    score += 60
    return score
  }

  // Word matching
  const targetWords = t.split(/[\s\-_\.]+/)
  const queryWords = q.split(/[\s\-_\.]+/)

  let wordMatches = 0
  let totalSimilarity = 0

  for (const qWord of queryWords) {
    if (qWord.length < 2) continue
    let bestMatch = 0
    for (const tWord of targetWords) {
      const sim = similarity(tWord, qWord)
      if (sim > bestMatch) bestMatch = sim
      if (tWord.startsWith(qWord)) bestMatch = Math.max(bestMatch, 0.9)
    }
    if (bestMatch > 0.5) {
      wordMatches++
      totalSimilarity += bestMatch
    }
  }

  if (queryWords.length > 0) {
    const matchRatio = wordMatches / queryWords.length
    score += matchRatio * 40
    score += (totalSimilarity / queryWords.length) * 20
  }

  return score
}

/**
 * Advanced fuzzy search with multiple strategies
 */
export interface FuzzySearchOptions {
  threshold?: number      // Minimum similarity threshold (0-1)
  maxResults?: number     // Maximum results to return
  boostExact?: boolean    // Boost exact matches
  boostStart?: boolean    // Boost matches at start
  caseSensitive?: boolean // Case sensitive matching
}

export interface FuzzySearchResult<T> {
  item: T
  score: number
  matches: string[] // Which fields matched
}

export function fuzzySearchArray<T>(
  items: T[],
  query: string,
  getFields: (item: T) => string[],
  options: FuzzySearchOptions = {}
): FuzzySearchResult<T>[] {
  const {
    threshold = 0.4,
    maxResults = 50,
    boostExact = true,
    boostStart = true,
    caseSensitive = false
  } = options

  if (!query || query.length < 1) {
    return items.slice(0, maxResults).map(item => ({
      item,
      score: 0,
      matches: []
    }))
  }

  const q = caseSensitive ? query : query.toLowerCase()
  const results: FuzzySearchResult<T>[] = []

  for (const item of items) {
    const fields = getFields(item)
    let bestScore = 0
    const matches: string[] = []

    for (const field of fields) {
      if (!field) continue
      const f = caseSensitive ? field : field.toLowerCase()
      const score = fuzzyScore(f, q)

      if (score > threshold * 100) {
        matches.push(field)
        if (score > bestScore) bestScore = score
      }
    }

    if (bestScore > 0 || matches.length > 0) {
      results.push({ item, score: bestScore, matches })
    }
  }

  // Sort by score descending
  results.sort((a, b) => b.score - a.score)

  return results.slice(0, maxResults)
}

/**
 * Highlight matching portions in text
 */
export function highlightMatches(text: string, query: string): string {
  if (!query || query.length < 2) return text

  const t = text.toLowerCase()
  const q = query.toLowerCase()

  // Find all occurrences
  const indices: Array<{ start: number; end: number }> = []
  let idx = t.indexOf(q)
  while (idx !== -1) {
    indices.push({ start: idx, end: idx + q.length })
    idx = t.indexOf(q, idx + 1)
  }

  if (indices.length === 0) return text

  // Build highlighted string
  let result = ''
  let lastEnd = 0
  for (const { start, end } of indices) {
    result += text.slice(lastEnd, start)
    result += `<mark>${text.slice(start, end)}</mark>`
    lastEnd = end
  }
  result += text.slice(lastEnd)

  return result
}

/**
 * Parse search query with operators
 * Supports: "exact phrase", -exclude, tag:value, OR, AND
 */
export interface ParsedQuery {
  terms: string[]           // Regular search terms
  exactPhrases: string[]    // Quoted phrases
  excludes: string[]        // -excluded terms
  filters: Map<string, string[]> // tag:value pairs
  hasOr: boolean
}

export function parseSearchQuery(query: string): ParsedQuery {
  const result: ParsedQuery = {
    terms: [],
    exactPhrases: [],
    excludes: [],
    filters: new Map(),
    hasOr: false
  }

  if (!query) return result

  // Extract quoted phrases
  const phraseRegex = /"([^"]+)"/g
  let match
  while ((match = phraseRegex.exec(query)) !== null) {
    result.exactPhrases.push(match[1])
  }
  query = query.replace(phraseRegex, '')

  // Check for OR operator
  result.hasOr = query.includes(' OR ')

  // Split by whitespace
  const tokens = query.split(/\s+/).filter(Boolean)

  for (const token of tokens) {
    if (token === 'OR' || token === 'AND') continue

    // Exclude term
    if (token.startsWith('-') && token.length > 1) {
      result.excludes.push(token.slice(1))
      continue
    }

    // Filter term (tag:value)
    const colonIdx = token.indexOf(':')
    if (colonIdx > 0 && colonIdx < token.length - 1) {
      const key = token.slice(0, colonIdx).toLowerCase()
      const value = token.slice(colonIdx + 1)
      if (!result.filters.has(key)) {
        result.filters.set(key, [])
      }
      result.filters.get(key)!.push(value)
      continue
    }

    // Regular term
    result.terms.push(token)
  }

  return result
}

/**
 * Build SQL WHERE clause from parsed query
 */
export function buildSqlFromParsedQuery(
  parsed: ParsedQuery,
  filenameColumn = 'filename',
  tagColumn = 't.name'
): { where: string; params: any[] } {
  const conditions: string[] = []
  const params: any[] = []

  // Regular terms with fuzzy matching via LIKE
  if (parsed.terms.length > 0) {
    const termConditions = parsed.terms.map(term => {
      params.push(`%${term}%`)
      return `(${filenameColumn} LIKE ? COLLATE NOCASE)`
    })

    if (parsed.hasOr) {
      conditions.push(`(${termConditions.join(' OR ')})`)
    } else {
      conditions.push(`(${termConditions.join(' AND ')})`)
    }
  }

  // Exact phrases
  for (const phrase of parsed.exactPhrases) {
    params.push(`%${phrase}%`)
    conditions.push(`${filenameColumn} LIKE ? COLLATE NOCASE`)
  }

  // Excludes
  for (const exclude of parsed.excludes) {
    params.push(`%${exclude}%`)
    conditions.push(`${filenameColumn} NOT LIKE ? COLLATE NOCASE`)
  }

  // Handle special filters
  const typeFilter = parsed.filters.get('type')
  if (typeFilter && typeFilter.length > 0) {
    const placeholders = typeFilter.map(() => '?').join(',')
    conditions.push(`type IN (${placeholders})`)
    params.push(...typeFilter)
  }

  const ratingFilter = parsed.filters.get('rating')
  if (ratingFilter && ratingFilter.length > 0) {
    for (const rating of ratingFilter) {
      const num = parseInt(rating)
      if (!isNaN(num)) {
        conditions.push('COALESCE(s.rating, 0) >= ?')
        params.push(num)
      }
    }
  }

  // Tag filters
  const tagFilters = parsed.filters.get('tag')
  if (tagFilters && tagFilters.length > 0) {
    // These need to be joined with the tags table
    const placeholders = tagFilters.map(() => '?').join(',')
    conditions.push(`EXISTS (
      SELECT 1 FROM media_tags mt2
      JOIN tags t2 ON mt2.tagId = t2.id
      WHERE mt2.mediaId = m.id AND t2.name IN (${placeholders})
    )`)
    params.push(...tagFilters)
  }

  return {
    where: conditions.length > 0 ? conditions.join(' AND ') : '1=1',
    params
  }
}
