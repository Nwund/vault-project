// File: src/main/services/kink-discovery.ts
//
// #361 G-137 — Kink-discovery recommender via latent kink map. Pure
// embedding math; uses the existing `media_clip_embeddings` table
// (migration v22). No new ML loads — works against whatever's
// already cached there.
//
// Algorithm:
//   1. Pull every CLIP embedding for media the user has rated >= 4.
//   2. K-means cluster the embeddings into N "kink centroids"
//      (default N=5; user can tune).
//   3. For each centroid, surface the N closest unwatched / unrated
//      media — these are recommendations.
//   4. Also expose the centroids themselves so the renderer can label
//      them ("the curvy-amateur cluster", "the rough-anal cluster",
//      etc) using Florence-2 captions on the nearest exemplars.
//
// Math: cosine similarity throughout. Embeddings are stored as base64
// Float32 in the DB; we lift to Float32Array once at compute time.

import type Database from 'better-sqlite3'
type Raw = Database.Database

export interface KinkCluster {
  id: number
  centroid: Float32Array
  memberMediaIds: string[]
  exemplarMediaId: string  // member closest to centroid
}

export interface Recommendation {
  mediaId: string
  filename: string
  thumbPath: string | null
  durationSec: number | null
  clusterId: number       // which kink cluster recommended this
  similarity: number      // 0..1
}

function decodeEmb(b64: string): Float32Array {
  const buf = Buffer.from(b64, 'base64')
  const fl = new Float32Array(buf.byteLength / 4)
  for (let i = 0; i < fl.length; i++) fl[i] = buf.readFloatLE(i * 4)
  return fl
}

function cosineSim(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) return 0
  let dot = 0, na = 0, nb = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    na += a[i] * a[i]
    nb += b[i] * b[i]
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb)
  return denom === 0 ? 0 : dot / denom
}

// Naive k-means++ on Float32Array vectors. Good enough for N=5..20
// over a few thousand high-rated media. Max iterations bounded so
// this stays under 1s on a typical library.
function kmeans(vecs: Float32Array[], k: number, maxIter = 25): { centroids: Float32Array[]; assignments: number[] } {
  if (vecs.length === 0 || k <= 0) return { centroids: [], assignments: [] }
  k = Math.min(k, vecs.length)
  const dim = vecs[0].length

  // k-means++ init: first centroid random, subsequent picks weighted
  // by squared distance from nearest existing centroid.
  const centroids: Float32Array[] = []
  centroids.push(new Float32Array(vecs[Math.floor(Math.random() * vecs.length)]))
  while (centroids.length < k) {
    const dists = vecs.map((v) => {
      let min = Infinity
      for (const c of centroids) {
        const d = 1 - cosineSim(v, c)
        if (d < min) min = d
      }
      return min * min
    })
    const total = dists.reduce((a, b) => a + b, 0)
    let r = Math.random() * total
    let idx = 0
    for (let i = 0; i < dists.length; i++) {
      r -= dists[i]
      if (r <= 0) { idx = i; break }
    }
    centroids.push(new Float32Array(vecs[idx]))
  }

  const assignments = new Array<number>(vecs.length).fill(0)
  for (let iter = 0; iter < maxIter; iter++) {
    let changed = false
    // Assign each point to nearest centroid.
    for (let i = 0; i < vecs.length; i++) {
      let best = 0, bestSim = -Infinity
      for (let c = 0; c < centroids.length; c++) {
        const sim = cosineSim(vecs[i], centroids[c])
        if (sim > bestSim) { bestSim = sim; best = c }
      }
      if (assignments[i] !== best) { assignments[i] = best; changed = true }
    }
    if (!changed) break
    // Recompute centroids as the mean of assigned vectors.
    const sums: Float32Array[] = Array.from({ length: k }, () => new Float32Array(dim))
    const counts = new Array<number>(k).fill(0)
    for (let i = 0; i < vecs.length; i++) {
      const c = assignments[i]
      const v = vecs[i]
      const s = sums[c]
      for (let d = 0; d < dim; d++) s[d] += v[d]
      counts[c]++
    }
    for (let c = 0; c < k; c++) {
      if (counts[c] === 0) continue
      const s = sums[c]
      for (let d = 0; d < dim; d++) s[d] /= counts[c]
      centroids[c] = s
    }
  }
  return { centroids, assignments }
}

export interface DiscoveryOptions {
  k?: number               // number of kink clusters (default 5)
  ratingMin?: number       // minimum rating to seed (default 4)
  recsPerCluster?: number  // recommendations per cluster (default 10)
}

export interface DiscoveryResult {
  clusters: Array<{
    id: number
    memberCount: number
    exemplarMediaId: string
    exemplarFilename: string
    exemplarThumbPath: string | null
  }>
  recommendations: Recommendation[]
}

export function discoverKinks(db: Raw, options: DiscoveryOptions = {}): DiscoveryResult {
  const k = Math.max(2, Math.min(options.k ?? 5, 20))
  const ratingMin = options.ratingMin ?? 4
  const recsPerCluster = Math.max(1, Math.min(options.recsPerCluster ?? 10, 50))

  // Seed: user's high-rated media that have a CLIP embedding cached.
  const seedRows = db.prepare(`
    SELECT m.id AS mediaId, m.filename, m.thumbPath, m.durationSec, e.embedding_b64
    FROM media m
    JOIN media_clip_embeddings e ON e.media_id = m.id
    JOIN media_stats s ON s.mediaId = m.id
    WHERE s.rating >= ?
  `).all(ratingMin) as Array<{ mediaId: string; filename: string; thumbPath: string | null; durationSec: number | null; embedding_b64: string }>

  if (seedRows.length === 0) {
    return { clusters: [], recommendations: [] }
  }

  const vecs = seedRows.map((r) => decodeEmb(r.embedding_b64))
  const { centroids, assignments } = kmeans(vecs, k)

  // Build cluster summary: for each cluster, pick the member closest
  // to the centroid as the "exemplar" (the rep image we'd show in UI).
  const clusterInfo: Array<{ id: number; memberCount: number; exemplarMediaId: string; exemplarFilename: string; exemplarThumbPath: string | null }> = []
  for (let c = 0; c < centroids.length; c++) {
    const memberIdxs: number[] = []
    for (let i = 0; i < assignments.length; i++) if (assignments[i] === c) memberIdxs.push(i)
    if (memberIdxs.length === 0) continue
    // Pick member nearest to centroid.
    let bestIdx = memberIdxs[0], bestSim = -Infinity
    for (const i of memberIdxs) {
      const sim = cosineSim(vecs[i], centroids[c])
      if (sim > bestSim) { bestSim = sim; bestIdx = i }
    }
    const ex = seedRows[bestIdx]
    clusterInfo.push({
      id: c,
      memberCount: memberIdxs.length,
      exemplarMediaId: ex.mediaId,
      exemplarFilename: ex.filename,
      exemplarThumbPath: ex.thumbPath,
    })
  }

  // Recommendations: for each cluster centroid, find unrated/un-high-
  // rated media with CLIP embeddings that have HIGH cosine similarity.
  // Exclude the seed set so we don't recommend things the user already
  // loves.
  const seedSet = new Set(seedRows.map((r) => r.mediaId))
  const candidateRows = db.prepare(`
    SELECT m.id AS mediaId, m.filename, m.thumbPath, m.durationSec, e.embedding_b64
    FROM media m
    JOIN media_clip_embeddings e ON e.media_id = m.id
    LEFT JOIN media_stats s ON s.mediaId = m.id
    WHERE COALESCE(s.rating, 0) < ?
  `).all(ratingMin) as Array<{ mediaId: string; filename: string; thumbPath: string | null; durationSec: number | null; embedding_b64: string }>

  const recommendations: Recommendation[] = []
  for (let c = 0; c < centroids.length; c++) {
    const centroid = centroids[c]
    const scored: Array<{ row: typeof candidateRows[number]; sim: number }> = []
    for (const cand of candidateRows) {
      if (seedSet.has(cand.mediaId)) continue
      const vec = decodeEmb(cand.embedding_b64)
      const sim = cosineSim(vec, centroid)
      if (sim > 0.4) scored.push({ row: cand, sim })  // 0.4 floor — anything lower is noise
    }
    scored.sort((a, b) => b.sim - a.sim)
    for (const s of scored.slice(0, recsPerCluster)) {
      recommendations.push({
        mediaId: s.row.mediaId,
        filename: s.row.filename,
        thumbPath: s.row.thumbPath,
        durationSec: s.row.durationSec,
        clusterId: c,
        similarity: s.sim,
      })
    }
  }
  // Dedup recommendations (same media might score in multiple clusters
  // — keep the highest-sim variant).
  const bestPerMedia = new Map<string, Recommendation>()
  for (const r of recommendations) {
    const cur = bestPerMedia.get(r.mediaId)
    if (!cur || r.similarity > cur.similarity) bestPerMedia.set(r.mediaId, r)
  }

  return {
    clusters: clusterInfo,
    recommendations: Array.from(bestPerMedia.values()).sort((a, b) => b.similarity - a.similarity),
  }
}
