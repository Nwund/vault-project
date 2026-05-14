// File: src/main/services/ai-intelligence/face-cluster-service.ts
//
// Face clustering on top of SFace embeddings. Builds + maintains the
// face_clusters table — each cluster is one "person" (named or
// unnamed). New embeddings get assigned to the closest cluster by
// cosine similarity to its centroid; if no cluster is close enough,
// a new cluster is created.
//
// Centroid update: incremental mean. When a new embedding joins, the
// centroid becomes `(centroid * n + new) / (n+1)`, then re-normalized.
// This keeps cluster centers stable as more samples arrive.
//
// User workflow:
//   1. Vault tags some videos → embeddings + clusters accumulate.
//   2. User opens the Performers panel (Library → Performers tab),
//      sees N unnamed clusters with their representative thumbnails.
//   3. User names a cluster ("Mia Khalifa") → `performer:mia khalifa`
//      tag is auto-applied to every media item in that cluster.
//   4. Future media containing that face: queue's face-recognition
//      step emits the performer:NAME tag at high confidence.

import { nanoid } from 'nanoid'
import {
  cosineSimilarity,
  embeddingToBase64,
  embeddingFromBase64,
  CLUSTER_SIMILARITY_THRESHOLD,
  MATCH_SIMILARITY_THRESHOLD,
} from './sface-recognizer'
import type { DB } from '../../db'

export interface FaceCluster {
  id: string
  name: string | null
  centroid: Float32Array
  sample_count: number
  representative_media_id: string | null
  representative_bbox: string | null
  created_at: number
  updated_at: number
}

export interface FaceEmbeddingRow {
  id: string
  media_id: string
  cluster_id: string | null
  frame_idx: number
  bbox: string
  embedding: Float32Array
  detection_score: number
  created_at: number
}

let allClustersCache: FaceCluster[] | null = null
let cacheStaleAt = 0
const CACHE_TTL_MS = 5_000

/** Invalidate the in-memory cluster cache. Called after any mutation. */
function bust(): void { allClustersCache = null }

function loadAllClusters(db: DB): FaceCluster[] {
  if (allClustersCache && Date.now() < cacheStaleAt) return allClustersCache
  const rows: any[] = db.raw.prepare(`
    SELECT id, name, centroid_b64, sample_count, representative_media_id,
           representative_bbox, created_at, updated_at
    FROM face_clusters
  `).all()
  const clusters: FaceCluster[] = rows.map((r) => ({
    id: r.id,
    name: r.name ?? null,
    centroid: embeddingFromBase64(r.centroid_b64),
    sample_count: r.sample_count,
    representative_media_id: r.representative_media_id ?? null,
    representative_bbox: r.representative_bbox ?? null,
    created_at: r.created_at,
    updated_at: r.updated_at,
  }))
  allClustersCache = clusters
  cacheStaleAt = Date.now() + CACHE_TTL_MS
  return clusters
}

/**
 * Assign a new embedding to a cluster. Either finds the closest match
 * (similarity ≥ CLUSTER_SIMILARITY_THRESHOLD) and joins it, or creates
 * a new cluster. Returns the cluster the embedding was assigned to,
 * plus the similarity score for debugging.
 *
 * Also writes the embedding row to face_embeddings. Caller is
 * responsible for passing the right media_id + frame_idx + bbox.
 */
export function assignEmbeddingToCluster(
  db: DB,
  embedding: Float32Array,
  args: {
    mediaId: string
    frameIdx: number
    bbox: { x: number; y: number; w: number; h: number }
    detectionScore: number
  }
): { cluster: FaceCluster; similarity: number; newCluster: boolean } {
  const clusters = loadAllClusters(db)
  let best: FaceCluster | null = null
  let bestSim = -1
  for (const c of clusters) {
    const sim = cosineSimilarity(embedding, c.centroid)
    if (sim > bestSim) { bestSim = sim; best = c }
  }

  let assignedCluster: FaceCluster
  let newCluster = false
  const now = Date.now()

  if (best && bestSim >= CLUSTER_SIMILARITY_THRESHOLD) {
    // Update centroid incrementally + re-normalize.
    const n = best.sample_count
    const newCentroid = new Float32Array(best.centroid.length)
    for (let i = 0; i < best.centroid.length; i++) {
      newCentroid[i] = (best.centroid[i] * n + embedding[i]) / (n + 1)
    }
    let norm = 0
    for (let i = 0; i < newCentroid.length; i++) norm += newCentroid[i] * newCentroid[i]
    norm = Math.sqrt(norm) || 1
    for (let i = 0; i < newCentroid.length; i++) newCentroid[i] /= norm

    db.raw.prepare(`
      UPDATE face_clusters
      SET centroid_b64 = ?, sample_count = sample_count + 1, updated_at = ?
      WHERE id = ?
    `).run(embeddingToBase64(newCentroid), now, best.id)
    best.centroid = newCentroid
    best.sample_count += 1
    best.updated_at = now
    assignedCluster = best
  } else {
    // Create new cluster.
    const newId = nanoid()
    db.raw.prepare(`
      INSERT INTO face_clusters
        (id, name, centroid_b64, sample_count, representative_media_id, representative_bbox, created_at, updated_at)
      VALUES (?, NULL, ?, 1, ?, ?, ?, ?)
    `).run(newId, embeddingToBase64(embedding), args.mediaId, JSON.stringify(args.bbox), now, now)
    assignedCluster = {
      id: newId,
      name: null,
      centroid: embedding.slice(),
      sample_count: 1,
      representative_media_id: args.mediaId,
      representative_bbox: JSON.stringify(args.bbox),
      created_at: now,
      updated_at: now,
    }
    newCluster = true
  }

  // Save embedding row.
  db.raw.prepare(`
    INSERT INTO face_embeddings
      (id, media_id, cluster_id, frame_idx, bbox, embedding_b64, detection_score, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    nanoid(), args.mediaId, assignedCluster.id, args.frameIdx,
    JSON.stringify(args.bbox), embeddingToBase64(embedding),
    args.detectionScore, now
  )

  bust()
  return { cluster: assignedCluster, similarity: best ? bestSim : 1, newCluster }
}

/**
 * Find which named clusters a frame's faces match. Returns a list of
 * { performerName, similarity } pairs. Used by the queue to emit
 * `performer:NAME` tag priors when the video contains a recognized
 * person. Threshold is MATCH_SIMILARITY_THRESHOLD (more lenient than
 * the clustering threshold — cross-source agreement in the queue
 * filters false positives).
 */
export function findMatchingPerformers(
  db: DB,
  embedding: Float32Array
): Array<{ clusterId: string; name: string; similarity: number }> {
  const clusters = loadAllClusters(db)
  const matches: Array<{ clusterId: string; name: string; similarity: number }> = []
  for (const c of clusters) {
    if (!c.name) continue  // only named clusters can fire performer tags
    const sim = cosineSimilarity(embedding, c.centroid)
    if (sim >= MATCH_SIMILARITY_THRESHOLD) {
      matches.push({ clusterId: c.id, name: c.name, similarity: sim })
    }
  }
  matches.sort((a, b) => b.similarity - a.similarity)
  return matches
}

/** Rename a cluster. If the new name matches an existing named
 *  cluster, merges them. */
export function renameCluster(db: DB, clusterId: string, newName: string): void {
  const trimmed = newName.trim()
  if (!trimmed) {
    db.raw.prepare(`UPDATE face_clusters SET name = NULL, updated_at = ? WHERE id = ?`).run(Date.now(), clusterId)
    bust()
    return
  }
  // Check if another cluster already has this name — if so, merge.
  const existing = db.raw.prepare(`SELECT id FROM face_clusters WHERE name = ? AND id != ?`).get(trimmed, clusterId) as { id: string } | undefined
  if (existing) {
    mergeClusters(db, clusterId, existing.id)
    return
  }
  db.raw.prepare(`UPDATE face_clusters SET name = ?, updated_at = ? WHERE id = ?`).run(trimmed, Date.now(), clusterId)
  // Apply performer:NAME tag to all media in this cluster.
  const mediaIds = db.raw.prepare(`
    SELECT DISTINCT media_id FROM face_embeddings WHERE cluster_id = ?
  `).all(clusterId) as Array<{ media_id: string }>
  const tagName = `performer:${trimmed}`
  for (const { media_id } of mediaIds) {
    try {
      ;(db as any).addTagToMedia?.(media_id, tagName)
    } catch { /* ignore individual failures */ }
  }
  bust()
}

/** Merge cluster `fromId` into `intoId`. All embeddings re-point to
 *  intoId, centroid recomputed, fromId deleted. */
export function mergeClusters(db: DB, fromId: string, intoId: string): void {
  if (fromId === intoId) return
  const now = Date.now()
  db.raw.transaction(() => {
    db.raw.prepare(`UPDATE face_embeddings SET cluster_id = ? WHERE cluster_id = ?`).run(intoId, fromId)
    db.raw.prepare(`DELETE FROM face_clusters WHERE id = ?`).run(fromId)
    // Recompute centroid from all embeddings now pointing at intoId.
    const rows = db.raw.prepare(`SELECT embedding_b64 FROM face_embeddings WHERE cluster_id = ?`).all(intoId) as Array<{ embedding_b64: string }>
    if (rows.length === 0) return
    const dim = embeddingFromBase64(rows[0].embedding_b64).length
    const sum = new Float32Array(dim)
    for (const r of rows) {
      const e = embeddingFromBase64(r.embedding_b64)
      for (let i = 0; i < dim; i++) sum[i] += e[i]
    }
    let norm = 0
    for (let i = 0; i < dim; i++) { sum[i] /= rows.length; norm += sum[i] * sum[i] }
    norm = Math.sqrt(norm) || 1
    for (let i = 0; i < dim; i++) sum[i] /= norm
    db.raw.prepare(`
      UPDATE face_clusters
      SET centroid_b64 = ?, sample_count = ?, updated_at = ?
      WHERE id = ?
    `).run(embeddingToBase64(sum), rows.length, now, intoId)
  })()
  bust()
}

/** Delete a cluster + its embeddings entirely. */
export function deleteCluster(db: DB, clusterId: string): void {
  db.raw.transaction(() => {
    db.raw.prepare(`DELETE FROM face_embeddings WHERE cluster_id = ?`).run(clusterId)
    db.raw.prepare(`DELETE FROM face_clusters WHERE id = ?`).run(clusterId)
  })()
  bust()
}

/** List clusters for the UI — sorted by sample_count desc so the most-
 *  seen performers appear first. */
export function listClustersForUI(
  db: DB,
  opts?: { onlyUnnamed?: boolean; minSamples?: number; limit?: number }
): Array<{
  id: string
  name: string | null
  sampleCount: number
  mediaCount: number
  representativeMediaId: string | null
  representativeBbox: string | null
  createdAt: number
  updatedAt: number
}> {
  const minSamples = opts?.minSamples ?? 1
  const limit = opts?.limit ?? 500
  let sql = `
    SELECT c.id, c.name, c.sample_count, c.representative_media_id,
           c.representative_bbox, c.created_at, c.updated_at,
           (SELECT COUNT(DISTINCT media_id) FROM face_embeddings WHERE cluster_id = c.id) AS media_count
    FROM face_clusters c
    WHERE c.sample_count >= ?
  `
  const params: any[] = [minSamples]
  if (opts?.onlyUnnamed) sql += ` AND c.name IS NULL`
  sql += ` ORDER BY c.sample_count DESC, c.updated_at DESC LIMIT ?`
  params.push(limit)
  const rows: any[] = db.raw.prepare(sql).all(...params)
  return rows.map((r) => ({
    id: r.id,
    name: r.name ?? null,
    sampleCount: r.sample_count,
    mediaCount: r.media_count ?? 0,
    representativeMediaId: r.representative_media_id ?? null,
    representativeBbox: r.representative_bbox ?? null,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }))
}
