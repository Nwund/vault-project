// File: src/main/services/ai-intelligence/clip-search.ts
//
// CLIP-powered natural-language media search. Encodes a text query
// via the existing CLIP text encoder (tier1-onnx-tagger's
// getClipTextEmbedding), cosine-matches against stored image
// embeddings in media_clip_embeddings, returns ranked media ids.
//
// Activation: requires both the CLIP vision ONNX (already shipped)
// AND the BPE vocab at <userData>/models/clip-vocab.txt.gz for the
// text encoder to produce meaningful embeddings. Without BPE, the
// character-code placeholder fallback works but returns garbage
// rankings on arbitrary text — useful only for the canonical
// pre-computed prompts in CLIP_TAG_CATEGORIES.

import type { DB } from '../../db'

export interface ClipSearchHit {
  mediaId: string
  filename: string | null
  thumbPath: string | null
  similarity: number
  model: string
}

/** Decode a base64'd Float32 embedding. Returns null on malformed data. */
function decodeEmbedding(b64: string): Float32Array | null {
  try {
    const buf = Buffer.from(b64, 'base64')
    const out = new Float32Array(buf.byteLength / 4)
    for (let i = 0; i < out.length; i++) out[i] = buf.readFloatLE(i * 4)
    return out
  } catch { return null }
}

/** Encode a Float32 embedding to base64 for storage. */
export function encodeEmbedding(emb: Float32Array): string {
  const buf = Buffer.alloc(emb.byteLength)
  for (let i = 0; i < emb.length; i++) buf.writeFloatLE(emb[i], i * 4)
  return buf.toString('base64')
}

/** L2-normalize an embedding in-place. */
function l2Normalize(emb: Float32Array): void {
  let s = 0
  for (let i = 0; i < emb.length; i++) s += emb[i] * emb[i]
  const mag = Math.sqrt(s) || 1
  for (let i = 0; i < emb.length; i++) emb[i] /= mag
}

/** Cosine similarity between two same-dim Float32 vectors. */
function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) return 0
  let dot = 0
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i]
  // Both are pre-normalized → dot product = cosine similarity.
  return dot
}

/**
 * Persist a CLIP image embedding for a media item. Called from the
 * Tier 1 ONNX pipeline once per analyzed media. Idempotent: re-runs
 * replace the stored embedding.
 */
export function storeClipImageEmbedding(
  db: DB,
  mediaId: string,
  embedding: Float32Array,
  model: string = 'unknown'
): void {
  // L2-normalize before storing so search-time cosine sim is a pure dot.
  const norm = new Float32Array(embedding)
  l2Normalize(norm)
  try {
    db.raw.prepare(`
      INSERT INTO media_clip_embeddings (media_id, embedding_b64, model)
      VALUES (?, ?, ?)
      ON CONFLICT(media_id) DO UPDATE SET
        embedding_b64 = excluded.embedding_b64,
        model = excluded.model,
        created_at = strftime('%s', 'now')
    `).run(mediaId, encodeEmbedding(norm), model)
  } catch (err) {
    console.warn('[ClipSearch] embedding persist failed:', err)
  }
}

/**
 * Search by natural-language query. Computes the query embedding via
 * the supplied text-encoder function (injected so this module doesn't
 * import tier1-onnx-tagger directly, which would be a circular dep),
 * then cosine-ranks against every stored image embedding.
 *
 * O(N) over stored embeddings. At Vault's scale (10k-50k items)
 * that's <500ms per query — acceptable for a search box. Beyond
 * 100k an ANN index would help.
 */
export async function searchClipByText(
  db: DB,
  query: string,
  encodeText: (text: string) => Promise<Float32Array>,
  options?: { limit?: number; minSimilarity?: number }
): Promise<ClipSearchHit[]> {
  const limit = Math.max(1, Math.min(500, options?.limit ?? 50))
  const minSimilarity = options?.minSimilarity ?? 0.18  // ~typical CLIP cosine floor for "relevant"

  const queryEmb = await encodeText(query)
  if (!queryEmb || queryEmb.length === 0) return []
  l2Normalize(queryEmb)

  const rows = db.raw.prepare(`
    SELECT ce.media_id, ce.embedding_b64, ce.model,
           m.filename, m.thumbPath
    FROM media_clip_embeddings ce
    INNER JOIN media m ON m.id = ce.media_id
  `).all() as Array<{
    media_id: string; embedding_b64: string; model: string
    filename: string | null; thumbPath: string | null
  }>

  const hits: ClipSearchHit[] = []
  for (const row of rows) {
    const emb = decodeEmbedding(row.embedding_b64)
    if (!emb) continue
    if (emb.length !== queryEmb.length) continue  // dim mismatch (different CLIP model)
    const sim = cosineSimilarity(queryEmb, emb)
    if (sim < minSimilarity) continue
    hits.push({
      mediaId: row.media_id,
      filename: row.filename,
      thumbPath: row.thumbPath,
      similarity: sim,
      model: row.model,
    })
  }

  hits.sort((a, b) => b.similarity - a.similarity)
  return hits.slice(0, limit)
}

/** Diagnostic: how many media items have a stored CLIP embedding. */
export function getClipEmbeddingCoverage(db: DB): { stored: number; total: number; perModel: Record<string, number> } {
  const total = (db.raw.prepare(`SELECT COUNT(*) as n FROM media`).get() as { n: number }).n
  const stored = (db.raw.prepare(`SELECT COUNT(*) as n FROM media_clip_embeddings`).get() as { n: number }).n
  const perModel: Record<string, number> = {}
  const rows = db.raw.prepare(`
    SELECT model, COUNT(*) as n FROM media_clip_embeddings GROUP BY model
  `).all() as Array<{ model: string; n: number }>
  for (const r of rows) perModel[r.model] = r.n
  return { stored, total, perModel }
}
