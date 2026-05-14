// File: src/main/services/ai-intelligence/photo-face-clusterer.ts
//
// Shared "URL list → face cluster centroid" pipeline. Originally
// inlined in tpdb-face-importer.ts; extracted here so the StashDB +
// future ManyVids / OnlyFans importers can share the embedding loop
// without duplicating download / detect / embed / blend logic.

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import https from 'node:https'
import http from 'node:http'
import { nanoid } from 'nanoid'
import type { DB } from '../../db'

export interface PhotoFaceClusterRequest {
  performerName: string
  photoUrls: string[]
  /** Cap photos processed (default 12). Each photo costs one network
   *  download + one YuNet detect + one ArcFace embed. */
  maxPhotos?: number
  /** Tagging convention. Override only if you want non-standard
   *  prefix (e.g. 'creator:' instead of 'performer:'). */
  tagPrefix?: string
  /** Source label written into face_clusters.id prefix. */
  sourceTag?: string
}

export interface PhotoFaceClusterResult {
  ok: boolean
  error?: string
  performerName: string
  photosFetched: number
  photosWithFace: number
  embeddingsExtracted: number
  clusterId?: string
  clusterCreated?: boolean
  warnings: string[]
}

/** Download to temp. Returns local path or null on failure. 10MB cap. */
async function downloadToTemp(url: string, tmpDir: string): Promise<string | null> {
  return new Promise((resolve) => {
    const ext = (path.extname(url).split('?')[0] || '.jpg').slice(0, 5)
    const outPath = path.join(tmpDir, `${nanoid(8)}${ext}`)
    const proto = url.startsWith('https:') ? https : http
    const req = proto.get(url, { timeout: 15_000, headers: { 'User-Agent': 'vault/1.0' } }, (res) => {
      if (!res.statusCode || res.statusCode >= 400) { resolve(null); return }
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        const redirectUrl = res.headers.location.startsWith('http')
          ? res.headers.location
          : new URL(res.headers.location, url).toString()
        res.resume()
        downloadToTemp(redirectUrl, tmpDir).then(resolve)
        return
      }
      const ws = fs.createWriteStream(outPath)
      let bytes = 0
      const MAX = 10 * 1024 * 1024
      res.on('data', (chunk: Buffer) => {
        bytes += chunk.length
        if (bytes > MAX) {
          res.destroy(); ws.destroy()
          try { fs.unlinkSync(outPath) } catch { /* ignore */ }
          resolve(null); return
        }
        ws.write(chunk)
      })
      res.on('end', () => { ws.end(); ws.on('finish', () => resolve(outPath)) })
      res.on('error', () => {
        ws.destroy()
        try { fs.unlinkSync(outPath) } catch { /* ignore */ }
        resolve(null)
      })
    })
    req.on('error', () => resolve(null))
    req.on('timeout', () => { try { req.destroy() } catch { /* ignore */ }; resolve(null) })
  })
}

/**
 * Run the shared download → detect → embed → cluster-upsert pipeline.
 * Returns a structured result. Both TpDB and StashDB importers feed
 * URLs into this function and surface the same result shape.
 */
export async function clusterPhotosIntoFaceCluster(
  db: DB,
  req: PhotoFaceClusterRequest
): Promise<PhotoFaceClusterResult> {
  const name = req.performerName.trim().toLowerCase()
  const tagPrefix = req.tagPrefix ?? 'performer:'
  const sourceTag = req.sourceTag ?? 'photo'
  const result: PhotoFaceClusterResult = {
    ok: false,
    performerName: name,
    photosFetched: 0,
    photosWithFace: 0,
    embeddingsExtracted: 0,
    warnings: [],
  }
  if (!name) {
    result.error = 'performerName required'
    return result
  }
  if (req.photoUrls.length === 0) {
    result.error = 'no photo URLs provided'
    return result
  }
  const maxPhotos = Math.max(1, Math.min(50, req.maxPhotos ?? 12))
  const urls = req.photoUrls.slice(0, maxPhotos)

  // Confirm models are available before paying for downloads.
  const { isFaceDetectorAvailable, detectFaces } = await import('./face-detector')
  const { isSFaceAvailable, extractEmbedding, embeddingToBase64 } = await import('./sface-recognizer')
  if (!isFaceDetectorAvailable()) {
    result.error = 'YuNet face detector not installed'
    return result
  }
  if (!isSFaceAvailable()) {
    result.error = 'Face recognition model not installed (drop ArcFace / AdaFace / SFace ONNX at userData/models/)'
    return result
  }

  const tmpDir = path.join(os.tmpdir(), `vault-faces-${Date.now()}-${nanoid(6)}`)
  fs.mkdirSync(tmpDir, { recursive: true })
  const embeddings: Float32Array[] = []
  let firstFaceBbox: { x: number; y: number; w: number; h: number } | null = null
  try {
    for (const url of urls) {
      const local = await downloadToTemp(url, tmpDir)
      if (!local) {
        result.warnings.push(`download failed: ${url.slice(0, 80)}`)
        continue
      }
      result.photosFetched++
      const detection = await detectFaces(local)
      if (!detection || detection.faces.length === 0) {
        result.warnings.push(`no face detected in ${path.basename(local)}`)
        continue
      }
      result.photosWithFace++
      const face = detection.faces.slice().sort((a, b) => b.score - a.score)[0]
      const emb = await extractEmbedding(local, { x: face.x, y: face.y, w: face.w, h: face.h })
      if (!emb) {
        result.warnings.push(`embedding failed for ${path.basename(local)}`)
        continue
      }
      embeddings.push(emb)
      if (!firstFaceBbox) firstFaceBbox = { x: face.x, y: face.y, w: face.w, h: face.h }
    }
  } finally {
    try {
      for (const f of fs.readdirSync(tmpDir)) {
        try { fs.unlinkSync(path.join(tmpDir, f)) } catch { /* ignore */ }
      }
      fs.rmdirSync(tmpDir)
    } catch { /* ignore */ }
  }
  result.embeddingsExtracted = embeddings.length
  if (embeddings.length === 0) {
    result.error = 'No face embeddings extracted from photos'
    return result
  }

  // Average → centroid, L2-normalize.
  const dim = embeddings[0].length
  const sum = new Float32Array(dim)
  for (const e of embeddings) {
    if (e.length !== dim) continue
    for (let i = 0; i < dim; i++) sum[i] += e[i]
  }
  for (let i = 0; i < dim; i++) sum[i] /= embeddings.length
  let mag = 0
  for (let i = 0; i < dim; i++) mag += sum[i] * sum[i]
  mag = Math.sqrt(mag) || 1
  for (let i = 0; i < dim; i++) sum[i] /= mag

  // Upsert face_clusters row by name with weighted-blend merge logic.
  const existing = db.raw.prepare(
    `SELECT id, centroid_b64, sample_count FROM face_clusters WHERE LOWER(name) = ?`
  ).get(name) as { id: string; centroid_b64: string; sample_count: number } | undefined

  let clusterId: string
  let clusterCreated = false
  const now = Date.now()
  if (existing) {
    clusterId = existing.id
    if (existing.centroid_b64) {
      try {
        const buf = Buffer.from(existing.centroid_b64, 'base64')
        const old = new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4)
        if (old.length === dim) {
          const nOld = existing.sample_count || 1
          const nNew = embeddings.length
          const total = nOld + nNew
          const blended = new Float32Array(dim)
          for (let i = 0; i < dim; i++) blended[i] = (old[i] * nOld + sum[i] * nNew) / total
          let m2 = 0
          for (let i = 0; i < dim; i++) m2 += blended[i] * blended[i]
          m2 = Math.sqrt(m2) || 1
          for (let i = 0; i < dim; i++) blended[i] /= m2
          db.raw.prepare(`
            UPDATE face_clusters
            SET centroid_b64 = ?, sample_count = sample_count + ?, updated_at = ?
            WHERE id = ?
          `).run(embeddingToBase64(blended), embeddings.length, now, clusterId)
        } else {
          result.warnings.push(
            `Existing cluster centroid is ${old.length}-D but our new embedding is ${dim}-D — recognizer mismatch. Switch all faces to the same model and re-import.`
          )
          result.clusterId = clusterId
          result.ok = true
          return result
        }
      } catch (err) {
        result.warnings.push(`Failed to blend existing centroid: ${err}`)
      }
    } else {
      db.raw.prepare(`
        UPDATE face_clusters
        SET centroid_b64 = ?, sample_count = ?, updated_at = ?
        WHERE id = ?
      `).run(embeddingToBase64(sum), embeddings.length, now, clusterId)
    }
  } else {
    clusterId = `${sourceTag}-${nanoid()}`
    clusterCreated = true
    db.raw.prepare(`
      INSERT INTO face_clusters
        (id, name, centroid_b64, sample_count, representative_media_id, representative_bbox, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      clusterId, name, embeddingToBase64(sum), embeddings.length,
      null, firstFaceBbox ? JSON.stringify(firstFaceBbox) : null,
      now, now,
    )
  }

  // Apply tag to any media already linked to the cluster.
  try {
    const mediaIds = db.raw.prepare(`
      SELECT DISTINCT media_id FROM face_embeddings WHERE cluster_id = ?
    `).all(clusterId) as Array<{ media_id: string }>
    const tagName = `${tagPrefix}${name}`
    for (const { media_id } of mediaIds) {
      try { (db as any).addTagToMedia?.(media_id, tagName) } catch { /* ignore */ }
    }
  } catch { /* face_embeddings table may be missing on old DBs */ }

  result.clusterId = clusterId
  result.clusterCreated = clusterCreated
  result.ok = true
  return result
}
