// File: src/main/services/ai-intelligence/filename-classifier.ts
//
// Simple bag-of-tokens filename → tag classifier trained on the user's
// own approved-media history. The existing filename-hints.ts uses
// hand-coded regexes; this complements it by learning the patterns
// the user's library actually exhibits.
//
// Algorithm:
//   - For each approved media row, tokenize the filename (lowercase,
//     split on non-alphanumeric).
//   - For each (token, tag) pair, count co-occurrences.
//   - At inference time: tokenize the new filename → for each known
//     token, retrieve its top tags → vote → emit any tag whose
//     posterior P(tag|token) > 0.5 AND appeared in ≥ 3 approved items.
//
// Retraining: triggered every 50 new approvals, or manually via the
// Utilities tab. Models are stored in memory + cached to a JSON file
// at <userData>/filename-classifier.json.
//
// No external model. Pure JS. Cost: a 1000-media-item training set
// builds in ~50ms.

import fs from 'node:fs'
import path from 'node:path'
import { app } from 'electron'
import type { DB } from '../../db'

const MIN_TAG_SUPPORT = 3
const MIN_POSTERIOR = 0.5
const MIN_TOKEN_LEN = 3

interface ClassifierModel {
  version: 1
  trainedAt: string
  totalSamples: number
  /** tokenizedFilename count where each token appeared. */
  tokenCounts: Record<string, number>
  /** [token][tag] = co-occurrence count */
  tokenTagCounts: Record<string, Record<string, number>>
  /** Total uses per tag across all approved samples. */
  tagCounts: Record<string, number>
}

function tokenize(filename: string): string[] {
  return filename
    .toLowerCase()
    .replace(/\.[a-z0-9]{1,5}$/i, '')  // strip extension
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= MIN_TOKEN_LEN)
}

function emptyModel(): ClassifierModel {
  return {
    version: 1,
    trainedAt: new Date().toISOString(),
    totalSamples: 0,
    tokenCounts: {},
    tokenTagCounts: {},
    tagCounts: {},
  }
}

function modelPath(): string {
  return path.join(app.getPath('userData'), 'filename-classifier.json')
}

let cachedModel: ClassifierModel | null = null

export function loadModel(): ClassifierModel {
  if (cachedModel) return cachedModel
  try {
    const raw = fs.readFileSync(modelPath(), 'utf8')
    const parsed = JSON.parse(raw) as ClassifierModel
    if (parsed?.version === 1) {
      cachedModel = parsed
      return parsed
    }
  } catch { /* fall through */ }
  cachedModel = emptyModel()
  return cachedModel
}

function saveModel(m: ClassifierModel): void {
  try {
    fs.writeFileSync(modelPath(), JSON.stringify(m), 'utf8')
    cachedModel = m
  } catch (err) {
    console.warn('[FilenameClassifier] save failed:', err)
  }
}

/**
 * Retrain from scratch on all currently-approved media. Walks every
 * approved AI review row, joins to the media table for filenames,
 * joins to media_tags for the user-approved tag set, and accumulates
 * token-tag counts.
 */
export function retrain(db: DB): { samples: number; tokens: number; tags: number } {
  const m = emptyModel()
  const rows = db.raw.prepare(`
    SELECT m.id, m.filename
    FROM ai_analysis_results ar
    JOIN media m ON m.id = ar.media_id
    WHERE ar.review_status = 'approved'
  `).all() as Array<{ id: string; filename: string }>

  const tagStmt = db.raw.prepare(`
    SELECT t.name FROM media_tags mt
    JOIN tags t ON t.id = mt.tagId
    WHERE mt.mediaId = ?
  `)

  for (const row of rows) {
    const tokens = new Set(tokenize(row.filename ?? ''))
    if (tokens.size === 0) continue
    const tagsForMedia = (tagStmt.all(row.id) as Array<{ name: string }>).map((t) => t.name.toLowerCase())
    if (tagsForMedia.length === 0) continue
    m.totalSamples += 1
    for (const tok of tokens) {
      m.tokenCounts[tok] = (m.tokenCounts[tok] ?? 0) + 1
      if (!m.tokenTagCounts[tok]) m.tokenTagCounts[tok] = {}
    }
    for (const tag of tagsForMedia) {
      m.tagCounts[tag] = (m.tagCounts[tag] ?? 0) + 1
      for (const tok of tokens) {
        m.tokenTagCounts[tok][tag] = (m.tokenTagCounts[tok][tag] ?? 0) + 1
      }
    }
  }
  m.trainedAt = new Date().toISOString()
  saveModel(m)
  return {
    samples: m.totalSamples,
    tokens: Object.keys(m.tokenCounts).length,
    tags: Object.keys(m.tagCounts).length,
  }
}

export interface FilenameTagPrior {
  name: string
  confidence: number
  source: 'filename-ml'
  /** Which tokens fired this prediction — debugging aid. */
  tokens: string[]
}

/**
 * Predict tags for a new filename. Returns tags whose posterior
 * P(tag | tokens) ≥ MIN_POSTERIOR with at least one supporting token
 * seen in MIN_TAG_SUPPORT approved samples.
 */
export function predictTagsForFilename(filename: string): FilenameTagPrior[] {
  const m = loadModel()
  if (m.totalSamples < 10) return []  // not enough data

  const tokens = tokenize(filename)
  if (tokens.length === 0) return []

  // For each tag, gather evidence from each token that fired.
  // P(tag | token) = count(token AND tag) / count(token)
  // Aggregate across tokens by max (we want the strongest signal).
  const tagEvidence = new Map<string, { conf: number; tokens: string[] }>()
  for (const tok of tokens) {
    const tokCount = m.tokenCounts[tok] ?? 0
    if (tokCount < 2) continue  // unique token = noise
    const tagsForToken = m.tokenTagCounts[tok] ?? {}
    for (const tag in tagsForToken) {
      const cooc = tagsForToken[tag]
      if (cooc < MIN_TAG_SUPPORT) continue
      const posterior = cooc / tokCount
      if (posterior < MIN_POSTERIOR) continue
      const cur = tagEvidence.get(tag)
      if (!cur || posterior > cur.conf) {
        tagEvidence.set(tag, { conf: posterior, tokens: cur ? [...cur.tokens, tok] : [tok] })
      } else {
        cur.tokens.push(tok)
      }
    }
  }
  // Cap output confidence at 0.7 — filename evidence is suggestive
  // but not definitive (Tier 2 should still confirm).
  const priors: FilenameTagPrior[] = []
  for (const [name, evidence] of tagEvidence.entries()) {
    priors.push({
      name,
      confidence: Math.min(0.7, evidence.conf * 0.85),
      source: 'filename-ml',
      tokens: evidence.tokens,
    })
  }
  return priors.sort((a, b) => b.confidence - a.confidence).slice(0, 20)
}

/** Force-reload from disk on next call. Useful after retrain. */
export function invalidateCache(): void {
  cachedModel = null
}

/**
 * Incrementally update the model with one new (filename, tags) pair.
 * Used by external signal sources (e.g. booru saves where source tags
 * are scraped and normalized) to feed the learner without waiting for
 * the user to manually approve a Tier 2 review.
 *
 * The pair gets full sample weight (same as an approved review). To
 * avoid runaway drift, callers should only invoke this for tag sets
 * they have high confidence in — i.e. AFTER the tag normalizer has
 * filtered out junk.
 */
export function incrementWithSample(filename: string, tags: string[]): void {
  if (!filename || tags.length === 0) return
  const tokens = new Set(tokenize(filename))
  if (tokens.size === 0) return
  const m = loadModel()
  const tagSet = new Set(tags.map((t) => t.toLowerCase().trim()).filter((t) => t.length > 0))
  if (tagSet.size === 0) return

  m.totalSamples += 1
  for (const tok of tokens) {
    m.tokenCounts[tok] = (m.tokenCounts[tok] ?? 0) + 1
    if (!m.tokenTagCounts[tok]) m.tokenTagCounts[tok] = {}
  }
  for (const tag of tagSet) {
    m.tagCounts[tag] = (m.tagCounts[tag] ?? 0) + 1
    for (const tok of tokens) {
      m.tokenTagCounts[tok][tag] = (m.tokenTagCounts[tok][tag] ?? 0) + 1
    }
  }
  m.trainedAt = new Date().toISOString()
  saveModel(m)
}
