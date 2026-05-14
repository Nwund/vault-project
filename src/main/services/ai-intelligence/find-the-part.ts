// File: src/main/services/ai-intelligence/find-the-part.ts
//
// "Find the part where X" — ReVisionLLM-style natural-language search
// across the user's library (#102). A minimum-viable version using
// only the data Vault ALREADY stores; no new schema, no per-frame
// CLIP embeddings required.
//
// Strategy: combine three independent signals into one ranked result
// list. Each signal contributes a confidence + a candidate moment
// (start/end seconds within the matched video).
//
//   1. TRANSCRIPT FTS (precise moment, when speech matches)
//      - Search media_transcripts FTS5 for the query phrase.
//      - Each match returns the FULL transcript; we approximate the
//        moment by FINDING the phrase in the text and projecting its
//        char offset onto the video duration (cheap, ~2× better than
//        nothing).
//
//   2. CHAPTER / MARKER TITLES (precise moment when labeled)
//      - Markers table has user-curated timestamps with titles.
//      - Same for chapters extracted from embedded SRT/VTT/CCEx.
//
//   3. CLIP IMAGE SIMILARITY (whole-video match, no moment)
//      - Existing clip-search returns ranked videos with no moment
//        info. Surfaces here as fallback when neither transcript nor
//        chapters mention the query but the visuals match.
//
// Output: a flat list of moments sorted by composite score. Each
// moment carries a `precision` enum so the UI can show "≈ 4:12" vs
// "match somewhere in this video."

import type { DB } from '../../db'

export type MomentPrecision = 'frame' | 'second' | 'video'

export interface FoundMoment {
  mediaId: string
  filename: string | null
  thumbPath: string | null
  /** Start time in seconds. For 'video' precision this is 0. */
  startSec: number
  /** End time in seconds. For 'video' precision this is the full duration. */
  endSec: number
  /** How specific the location is. transcript = second, marker = second,
   *  chapter = second, clip-search = video-level. */
  precision: MomentPrecision
  /** Composite score in [0, 1]; higher = better match. */
  score: number
  /** Which signal contributed this moment. */
  source: 'transcript' | 'marker' | 'chapter' | 'clip-search'
  /** Snippet of text or label for the moment. */
  excerpt: string | null
}

export interface FindThePartOptions {
  query: string
  /** Limit per source before merging. Default 25 each. */
  perSourceLimit?: number
  /** Limit total returned. Default 50. */
  limit?: number
  /** When false, skips CLIP search (fast path for transcript-only
   *  queries). Default true. */
  includeClipSearch?: boolean
  /** Inject the CLIP text-encoder closure when includeClipSearch is
   *  true. Same closure shape clip-search.ts expects. */
  encodeClipText?: (text: string) => Promise<Float32Array>
}

export interface FindThePartResult {
  query: string
  moments: FoundMoment[]
  /** Which sources actually contributed results. */
  attempted: string[]
  /** Sources skipped because they weren't available
   *  (e.g. transcripts table empty, CLIP encoder not provided). */
  skipped: string[]
}

// ─── Helpers ─────────────────────────────────────────────────────

/** Sanitize FTS5 MATCH input — quote multi-word phrases and escape
 *  internal quotes. Prevents the query from accidentally parsing as
 *  FTS5 syntax (NEAR, AND, etc.). */
function sanitizeFtsQuery(raw: string): string {
  const trimmed = raw.trim()
  if (!trimmed) return ''
  // If the query is a single token, leave it alone (allows prefix
  // matches like `lesb*`). Otherwise quote.
  if (/^\w+$/.test(trimmed)) return trimmed
  return `"${trimmed.replace(/"/g, '""')}"`
}

/** Try to locate the query phrase in a transcript text. Returns the
 *  approximate position as a fraction of the text length, or null when
 *  no match found. */
function approximatePositionInTranscript(text: string, query: string): number | null {
  if (!text || !query) return null
  const lower = text.toLowerCase()
  const idx = lower.indexOf(query.toLowerCase())
  if (idx < 0) return null
  return idx / Math.max(1, text.length)
}

// ─── Source: transcript FTS ──────────────────────────────────────

interface TranscriptHit {
  media_id: string
  text: string
  snippet: string
  filename: string | null
  thumbPath: string | null
  durationSec: number | null
}

function searchTranscripts(
  db: DB,
  query: string,
  limit: number
): TranscriptHit[] {
  const ftsQuery = sanitizeFtsQuery(query)
  if (!ftsQuery) return []
  try {
    const rows = db.raw.prepare(`
      SELECT mt.media_id, mt.text,
             snippet(media_transcripts_fts, 0, '<mark>', '</mark>', '…', 24) AS snippet,
             m.filename, m.thumbPath, m.durationSec
      FROM media_transcripts_fts fts
      INNER JOIN media_transcripts mt ON mt.rowid = fts.rowid
      INNER JOIN media m ON m.id = mt.media_id
      WHERE media_transcripts_fts MATCH ?
      ORDER BY rank
      LIMIT ?
    `).all(ftsQuery, limit) as TranscriptHit[]
    return rows
  } catch (err) {
    console.warn('[FindThePart] transcript FTS failed:', err)
    return []
  }
}

// ─── Source: markers / chapters ──────────────────────────────────

interface LabeledMoment {
  media_id: string
  timeSec: number
  title: string
  filename: string | null
  thumbPath: string | null
  durationSec: number | null
  source: 'marker' | 'chapter'
}

function searchLabels(
  db: DB,
  query: string,
  limit: number
): LabeledMoment[] {
  const pattern = `%${query.toLowerCase().replace(/[%_]/g, (c) => `\\${c}`)}%`
  const out: LabeledMoment[] = []
  try {
    const markerRows = db.raw.prepare(`
      SELECT mk.mediaId AS media_id, mk.timeSec, mk.title,
             m.filename, m.thumbPath, m.durationSec
      FROM markers mk
      INNER JOIN media m ON m.id = mk.mediaId
      WHERE LOWER(mk.title) LIKE ? ESCAPE '\\'
      LIMIT ?
    `).all(pattern, limit) as any[]
    for (const r of markerRows) {
      out.push({ ...r, source: 'marker' as const })
    }
  } catch (err) {
    console.warn('[FindThePart] marker search failed:', err)
  }
  // Chapters table is optional — older Vault DBs may not have it.
  try {
    const chapterRows = db.raw.prepare(`
      SELECT ch.media_id, ch.start_sec AS timeSec, ch.title,
             m.filename, m.thumbPath, m.durationSec
      FROM media_chapters ch
      INNER JOIN media m ON m.id = ch.media_id
      WHERE LOWER(ch.title) LIKE ? ESCAPE '\\'
      LIMIT ?
    `).all(pattern, limit) as any[]
    for (const r of chapterRows) {
      out.push({ ...r, source: 'chapter' as const })
    }
  } catch { /* table doesn't exist on older DBs */ }
  return out
}

// ─── Public API ──────────────────────────────────────────────────

export async function findThePart(
  db: DB,
  options: FindThePartOptions
): Promise<FindThePartResult> {
  const query = (options.query ?? '').trim()
  if (!query) {
    return { query: '', moments: [], attempted: [], skipped: [] }
  }
  const perSource = Math.max(1, Math.min(200, options.perSourceLimit ?? 25))
  const totalLimit = Math.max(1, Math.min(500, options.limit ?? 50))
  const attempted: string[] = []
  const skipped: string[] = []
  const moments: FoundMoment[] = []

  // Transcript FTS — most precise when speech mentions the query.
  attempted.push('transcript')
  const transcriptHits = searchTranscripts(db, query, perSource)
  for (const h of transcriptHits) {
    const pos = approximatePositionInTranscript(h.text, query)
    let startSec = 0
    let endSec = h.durationSec ?? 0
    let precision: MomentPrecision = 'video'
    if (pos !== null && h.durationSec) {
      startSec = Math.max(0, pos * h.durationSec - 5)
      endSec = Math.min(h.durationSec, startSec + 30)
      precision = 'second'
    }
    moments.push({
      mediaId: h.media_id,
      filename: h.filename,
      thumbPath: h.thumbPath,
      startSec,
      endSec,
      precision,
      // Transcript hits score high (0.7–0.95) — explicit verbal match.
      score: precision === 'second' ? 0.9 : 0.7,
      source: 'transcript',
      excerpt: h.snippet,
    })
  }

  // Markers + chapters — user-labeled / extracted moments. Highest
  // precision when label matches.
  attempted.push('labels')
  const labelHits = searchLabels(db, query, perSource)
  for (const h of labelHits) {
    moments.push({
      mediaId: h.media_id,
      filename: h.filename,
      thumbPath: h.thumbPath,
      startSec: Math.max(0, h.timeSec - 2),
      endSec: Math.min(h.durationSec ?? h.timeSec + 30, h.timeSec + 30),
      precision: 'second',
      score: h.source === 'marker' ? 0.95 : 0.85,  // user markers beat auto-chapters
      source: h.source,
      excerpt: h.title,
    })
  }

  // CLIP search — visual fallback when no transcript / label matches.
  if (options.includeClipSearch !== false && options.encodeClipText) {
    attempted.push('clip-search')
    try {
      const { searchClipByText } = await import('./clip-search')
      const hits = await searchClipByText(db, query, options.encodeClipText, {
        limit: perSource,
      })
      for (const h of hits) {
        // Skip if we already have a more-precise moment for this media.
        if (moments.some((m) => m.mediaId === h.mediaId && m.precision !== 'video')) continue
        moments.push({
          mediaId: h.mediaId,
          filename: h.filename,
          thumbPath: h.thumbPath,
          startSec: 0,
          endSec: 0,
          precision: 'video',
          // CLIP cosine similarity is roughly 0.15..0.4 for relevant
          // matches. Rescale to [0.3, 0.7] so it sits below precise
          // transcript hits but above noise.
          score: Math.min(0.7, 0.3 + h.similarity * 1.0),
          source: 'clip-search',
          excerpt: null,
        })
      }
    } catch (err) {
      console.warn('[FindThePart] clip-search failed:', err)
      skipped.push('clip-search')
    }
  } else {
    skipped.push('clip-search')
  }

  moments.sort((a, b) => b.score - a.score)
  return {
    query,
    moments: moments.slice(0, totalLimit),
    attempted,
    skipped,
  }
}
