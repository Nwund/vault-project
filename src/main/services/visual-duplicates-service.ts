// ===============================
// File: src/main/services/visual-duplicates-service.ts
//
// Visual (perceptual) duplicate finder. Complements the existing
// duplicates-finder.ts which only catches byte-identical files via
// SHA-256. This service catches *visually similar* media — re-encodes,
// different bitrates, slight crops, watermarks, etc.
//
// Ported from content_analyzer/advanced_features.py:VisualDuplicateScanner.
// We use a simple aHash (average hash): downscale the thumbnail to 8x8
// grayscale, hash each pixel as 1/0 vs the mean. Two hashes with
// Hamming distance ≤ 5 are usually the same content. Storing the 64-bit
// hash as a 16-char hex string in media.phash.
// ===============================

import fs from 'node:fs'
import path from 'node:path'
import type { DB } from '../db'
import {
  generateMultiFrameFingerprint,
  matchBestOf,
  type MultiFrameFingerprint,
} from './ai-intelligence/multiframe-fingerprint'

type RawDB = DB['raw']

let _sharp: any | null = null
function getSharp(): any {
  if (_sharp) return _sharp
  // Lazy require so the service never fails to load if sharp's native
  // bindings aren't built yet — falls back to a no-op.
  try {
    _sharp = require('sharp')
  } catch (err) {
    console.warn('[VisualDuplicates] sharp not available, perceptual hashing disabled:', err)
  }
  return _sharp
}

export interface VisualDuplicateGroup {
  /** Representative media for the group (the first hash seen). */
  representativeId: string
  /** All media in this visual cluster including the representative. */
  members: Array<{
    mediaId: string
    filename: string
    thumbPath: string | null
    sizeBytes: number | null
    width: number | null
    height: number | null
    distance: number  // Hamming distance to the representative; 0 for the rep itself.
  }>
}

export interface VisualScanProgress {
  hashed: number
  total: number
  currentFile?: string
}

export class VisualDuplicatesService {
  private rawDb: RawDB
  private aborted = false

  constructor(db: DB) {
    this.rawDb = db.raw
  }

  /**
   * Compute aHash for a single image (or video thumbnail) at the given path.
   * Returns a 16-char hex string (64-bit hash) or null if processing failed.
   */
  async computePerceptualHash(imagePath: string): Promise<string | null> {
    const sharp = getSharp()
    if (!sharp) return null
    if (!fs.existsSync(imagePath)) return null

    try {
      // 8x8 grayscale, resized using a fast averaging filter — that's exactly
      // what aHash needs (no edge preservation, just pixel intensity).
      const buf = await sharp(imagePath)
        .resize(8, 8, { fit: 'fill', kernel: 'cubic' })
        .grayscale()
        .raw()
        .toBuffer()

      if (buf.length !== 64) return null

      // Compute mean
      let sum = 0
      for (let i = 0; i < 64; i++) sum += buf[i]
      const mean = sum / 64

      // Build 64-bit hash, encoded as 16 hex chars (high nibble first).
      let high = 0
      let low = 0
      for (let i = 0; i < 64; i++) {
        const bit = buf[i] >= mean ? 1 : 0
        if (i < 32) high = (high << 1) | bit
        else low = (low << 1) | bit
      }
      return (high >>> 0).toString(16).padStart(8, '0') + (low >>> 0).toString(16).padStart(8, '0')
    } catch (err) {
      // Don't spam — single-file failures shouldn't kill batch runs.
      return null
    }
  }

  /** Hamming distance between two 16-char hex hashes. */
  hammingDistance(a: string, b: string): number {
    if (a.length !== 16 || b.length !== 16) return 64
    let dist = 0
    for (let i = 0; i < 16; i++) {
      const xa = parseInt(a[i], 16)
      const xb = parseInt(b[i], 16)
      let diff = xa ^ xb
      while (diff) { dist += diff & 1; diff >>>= 1 }
    }
    return dist
  }

  /** Stop the next iteration of computeAllHashes(). */
  abort(): void { this.aborted = true }

  /**
   * Walk every media row missing a phash and compute one from its thumbnail.
   * Cheap (~10ms/image with sharp) but I/O bound; processes serially so we
   * don't blow up sharp's worker pool.
   */
  async computeAllHashes(
    onProgress?: (p: VisualScanProgress) => void,
    options?: { batchSize?: number; onlyUnhashed?: boolean }
  ): Promise<{ hashed: number; skipped: number }> {
    this.aborted = false
    const onlyUnhashed = options?.onlyUnhashed ?? true
    const where = onlyUnhashed ? 'WHERE phash IS NULL OR phash = ""' : ''
    const rows = this.rawDb.prepare(`
      SELECT id, thumbPath, path, type
      FROM media
      ${where}
    `).all() as Array<{ id: string; thumbPath: string | null; path: string; type: string }>

    const update = this.rawDb.prepare(`UPDATE media SET phash = ? WHERE id = ?`)
    let hashed = 0
    let skipped = 0
    const total = rows.length

    for (let i = 0; i < rows.length; i++) {
      if (this.aborted) break
      const r = rows[i]
      // Prefer thumbnail (small, fast); fall back to the original for images.
      const target = r.thumbPath && fs.existsSync(r.thumbPath)
        ? r.thumbPath
        : (r.type === 'image' && fs.existsSync(r.path) ? r.path : null)

      if (!target) {
        skipped++
        continue
      }

      const hash = await this.computePerceptualHash(target)
      if (hash) {
        update.run(hash, r.id)
        hashed++
      } else {
        skipped++
      }

      if (onProgress && (i % 10 === 0 || i === rows.length - 1)) {
        onProgress({ hashed, total, currentFile: path.basename(r.path) })
      }
    }

    return { hashed, skipped }
  }

  /**
   * Group all hashed media by visual similarity. Two media are clustered if
   * Hamming distance between their hashes is ≤ maxDistance (default 5).
   *
   * Returns groups of size ≥ 2 only — single-item "groups" aren't duplicates.
   *
   * Performance: O(N²) over hashed media. For a 10k library that's 50M
   * comparisons, each cheap (~6 XOR + popcount). Runs in ~1-2 seconds.
   */
  findVisualGroups(maxDistance = 5): VisualDuplicateGroup[] {
    const rows = this.rawDb.prepare(`
      SELECT id, filename, thumbPath, size, width, height, phash
      FROM media
      WHERE phash IS NOT NULL AND phash != ''
    `).all() as Array<{
      id: string; filename: string; thumbPath: string | null;
      size: number | null; width: number | null; height: number | null;
      phash: string
    }>

    if (rows.length < 2) return []

    // Union-find: each node starts as its own root, then we merge any pair
    // within maxDistance.
    const parent = new Map<string, string>()
    rows.forEach((r) => parent.set(r.id, r.id))
    const find = (id: string): string => {
      let cur = id
      while (parent.get(cur) !== cur) cur = parent.get(cur)!
      // Path compression
      let walk = id
      while (parent.get(walk) !== cur) {
        const next = parent.get(walk)!
        parent.set(walk, cur)
        walk = next
      }
      return cur
    }
    const union = (a: string, b: string) => {
      const ra = find(a)
      const rb = find(b)
      if (ra !== rb) parent.set(ra, rb)
    }

    for (let i = 0; i < rows.length; i++) {
      for (let j = i + 1; j < rows.length; j++) {
        const d = this.hammingDistance(rows[i].phash, rows[j].phash)
        if (d <= maxDistance) union(rows[i].id, rows[j].id)
      }
    }

    // Bucket by root
    const groups = new Map<string, typeof rows>()
    for (const r of rows) {
      const root = find(r.id)
      if (!groups.has(root)) groups.set(root, [])
      groups.get(root)!.push(r)
    }

    const out: VisualDuplicateGroup[] = []
    for (const [root, members] of groups) {
      if (members.length < 2) continue
      const rep = members.find((m) => m.id === root) ?? members[0]
      out.push({
        representativeId: rep.id,
        members: members.map((m) => ({
          mediaId: m.id,
          filename: m.filename,
          thumbPath: m.thumbPath,
          sizeBytes: m.size,
          width: m.width,
          height: m.height,
          distance: this.hammingDistance(rep.phash, m.phash)
        })).sort((a, b) => a.distance - b.distance)
      })
    }

    // Sort groups by member count (largest first), then by best-case smallest distance
    out.sort((a, b) => b.members.length - a.members.length)
    return out
  }

  /** How many media currently have a perceptual hash. */
  getHashCoverage(): { hashed: number; total: number } {
    const total = (this.rawDb.prepare(`SELECT COUNT(*) as n FROM media`).get() as { n: number }).n
    const hashed = (this.rawDb.prepare(
      `SELECT COUNT(*) as n FROM media WHERE phash IS NOT NULL AND phash != ''`
    ).get() as { n: number }).n
    return { hashed, total }
  }

  // ─────────────────────────────────────────────────────────────────────────
  //   Multi-frame fingerprint (videos only) — catches re-encodes where the
  //   single keyframe pHash shifted. Stored as JSON in media.multi_phash:
  //     {"hashes":["a1b2…","c3d4…",…], "validFrameCount":5, "timestampsPct":[10,30,50,70,90]}
  // ─────────────────────────────────────────────────────────────────────────

  /** How many videos currently have a multi-frame fingerprint. */
  getMultiFrameCoverage(): { hashed: number; total: number } {
    const total = (this.rawDb.prepare(
      `SELECT COUNT(*) as n FROM media WHERE type = 'video' AND COALESCE(durationSec, 0) > 0`
    ).get() as { n: number }).n
    const hashed = (this.rawDb.prepare(
      `SELECT COUNT(*) as n FROM media WHERE type = 'video' AND multi_phash IS NOT NULL AND multi_phash != ''`
    ).get() as { n: number }).n
    return { hashed, total }
  }

  /** Compute and persist a multi-frame fingerprint for a single video. */
  async computeMultiFrameHash(
    mediaId: string,
    ffmpegPath: string
  ): Promise<MultiFrameFingerprint | null> {
    const row = this.rawDb.prepare(
      `SELECT path, durationSec, type FROM media WHERE id = ?`
    ).get(mediaId) as { path: string; durationSec: number | null; type: string } | undefined
    if (!row || row.type !== 'video' || !fs.existsSync(row.path)) return null

    const fp = await generateMultiFrameFingerprint(row.path, ffmpegPath, row.durationSec)
    if (!fp.hashes.length) return null

    this.rawDb.prepare(`UPDATE media SET multi_phash = ? WHERE id = ?`)
      .run(JSON.stringify(fp), mediaId)
    return fp
  }

  /**
   * Compute multi-frame fingerprints for every video missing one. Defaults
   * to onlyUnhashed = true to make repeat runs cheap. Each video takes
   * ~1-3s (5 ffmpeg extracts + 5 DCT). Worker runs serially to avoid
   * blowing up ffmpeg subprocess count.
   */
  async computeAllMultiFrameHashes(
    ffmpegPath: string,
    onProgress?: (p: VisualScanProgress) => void,
    options?: { onlyUnhashed?: boolean }
  ): Promise<{ hashed: number; skipped: number }> {
    this.aborted = false
    const onlyUnhashed = options?.onlyUnhashed ?? true
    const where = onlyUnhashed
      ? `WHERE type = 'video' AND COALESCE(durationSec, 0) > 0 AND (multi_phash IS NULL OR multi_phash = '')`
      : `WHERE type = 'video' AND COALESCE(durationSec, 0) > 0`
    const rows = this.rawDb.prepare(
      `SELECT id, path, durationSec FROM media ${where}`
    ).all() as Array<{ id: string; path: string; durationSec: number | null }>

    const update = this.rawDb.prepare(`UPDATE media SET multi_phash = ? WHERE id = ?`)
    let hashed = 0
    let skipped = 0
    const total = rows.length

    for (let i = 0; i < rows.length; i++) {
      if (this.aborted) break
      const r = rows[i]
      if (!fs.existsSync(r.path)) { skipped++; continue }

      const fp = await generateMultiFrameFingerprint(r.path, ffmpegPath, r.durationSec)
      if (fp.hashes.length > 0) {
        update.run(JSON.stringify(fp), r.id)
        hashed++
      } else {
        skipped++
      }

      if (onProgress) {
        onProgress({ hashed, total, currentFile: path.basename(r.path) })
      }
    }

    return { hashed, skipped }
  }

  /**
   * Group videos by multi-frame similarity. Two videos cluster when
   * matchBestOf returns ≥ minMatches frame pairs within maxDistance
   * Hamming bits. Same union-find structure as findVisualGroups.
   *
   * Cost: O(N²) frame comparisons. For each pair, up to frameCount² ≈ 25
   * hex-Hamming evaluations. A 1000-video library = ~12M comparisons,
   * ~1s. Beyond ~5k videos consider an LSH index.
   */
  findMultiFrameGroups(
    maxDistance = 5,
    minMatches = 3
  ): VisualDuplicateGroup[] {
    const rows = this.rawDb.prepare(`
      SELECT id, filename, thumbPath, size, width, height, multi_phash
      FROM media
      WHERE type = 'video' AND multi_phash IS NOT NULL AND multi_phash != ''
    `).all() as Array<{
      id: string; filename: string; thumbPath: string | null;
      size: number | null; width: number | null; height: number | null;
      multi_phash: string
    }>

    if (rows.length < 2) return []

    const fingerprints: Array<{ row: typeof rows[0]; fp: MultiFrameFingerprint }> = []
    for (const r of rows) {
      try {
        const fp = JSON.parse(r.multi_phash) as MultiFrameFingerprint
        if (fp && Array.isArray(fp.hashes) && fp.hashes.length > 0) {
          fingerprints.push({ row: r, fp })
        }
      } catch { /* skip malformed */ }
    }

    const parent = new Map<string, string>()
    fingerprints.forEach(({ row }) => parent.set(row.id, row.id))
    const find = (id: string): string => {
      let cur = id
      while (parent.get(cur) !== cur) cur = parent.get(cur)!
      let walk = id
      while (parent.get(walk) !== cur) {
        const next = parent.get(walk)!
        parent.set(walk, cur)
        walk = next
      }
      return cur
    }
    const union = (a: string, b: string) => {
      const ra = find(a); const rb = find(b)
      if (ra !== rb) parent.set(ra, rb)
    }

    // Per-pair best-of-N match. Symmetric — only walk j > i.
    for (let i = 0; i < fingerprints.length; i++) {
      for (let j = i + 1; j < fingerprints.length; j++) {
        const { matches } = matchBestOf(fingerprints[i].fp, fingerprints[j].fp, maxDistance)
        if (matches >= minMatches) {
          union(fingerprints[i].row.id, fingerprints[j].row.id)
        }
      }
    }

    const groups = new Map<string, typeof fingerprints>()
    for (const fp of fingerprints) {
      const root = find(fp.row.id)
      if (!groups.has(root)) groups.set(root, [])
      groups.get(root)!.push(fp)
    }

    const out: VisualDuplicateGroup[] = []
    for (const [root, members] of groups) {
      if (members.length < 2) continue
      const rep = members.find((m) => m.row.id === root) ?? members[0]
      out.push({
        representativeId: rep.row.id,
        members: members.map((m) => {
          const { matches } = matchBestOf(rep.fp, m.fp, maxDistance)
          // Surface "matches" as a pseudo-distance (lower = better) so the
          // existing UI ordering by `distance` still makes sense: higher
          // match count → smaller pseudo-distance.
          const pseudo = rep.fp.hashes.length - matches
          return {
            mediaId: m.row.id,
            filename: m.row.filename,
            thumbPath: m.row.thumbPath,
            sizeBytes: m.row.size,
            width: m.row.width,
            height: m.row.height,
            distance: pseudo,
          }
        }).sort((a, b) => a.distance - b.distance)
      })
    }

    out.sort((a, b) => b.members.length - a.members.length)
    return out
  }

  // ─────────────────────────────────────────────────────────────────────────
  //   Chromaprint audio fingerprint (videos with audio + audio-only).
  //   Catches re-encodes that share the audio stream but differ visually
  //   (cropped / watermarked / re-encoded). Stored as JSON envelope
  //   {"d": durationSec, "f": "<base64-chromaprint>"} on media.chromaprint.
  // ─────────────────────────────────────────────────────────────────────────

  getChromaprintCoverage(): { hashed: number; total: number } {
    const total = (this.rawDb.prepare(
      `SELECT COUNT(*) as n FROM media WHERE type IN ('video') AND COALESCE(durationSec, 0) > 0`
    ).get() as { n: number }).n
    const hashed = (this.rawDb.prepare(
      `SELECT COUNT(*) as n FROM media WHERE type IN ('video') AND chromaprint IS NOT NULL AND chromaprint != ''`
    ).get() as { n: number }).n
    return { hashed, total }
  }

  /** Compute and persist the chromaprint envelope for a single media item. */
  async computeChromaprint(mediaId: string): Promise<{ d: number; f: string } | null> {
    const { chromaprintFile } = await import('./ai-intelligence/chromaprint-fingerprint')
    const row = this.rawDb.prepare(
      `SELECT path, type FROM media WHERE id = ?`
    ).get(mediaId) as { path: string; type: string } | undefined
    if (!row || row.type !== 'video' || !fs.existsSync(row.path)) return null

    const r = await chromaprintFile(row.path)
    if (!r) return null
    const env = { d: r.duration, f: r.fingerprint }
    this.rawDb.prepare(`UPDATE media SET chromaprint = ? WHERE id = ?`)
      .run(JSON.stringify(env), mediaId)
    return env
  }

  /** Bulk-compute chromaprints. fpcalc averages ~1s/file. */
  async computeAllChromaprints(
    onProgress?: (p: VisualScanProgress) => void,
    options?: { onlyUnhashed?: boolean }
  ): Promise<{ hashed: number; skipped: number }> {
    this.aborted = false
    const onlyUnhashed = options?.onlyUnhashed ?? true
    const where = onlyUnhashed
      ? `WHERE type = 'video' AND COALESCE(durationSec, 0) > 0 AND (chromaprint IS NULL OR chromaprint = '')`
      : `WHERE type = 'video' AND COALESCE(durationSec, 0) > 0`
    const rows = this.rawDb.prepare(
      `SELECT id, path FROM media ${where}`
    ).all() as Array<{ id: string; path: string }>

    const { chromaprintFile } = await import('./ai-intelligence/chromaprint-fingerprint')
    const update = this.rawDb.prepare(`UPDATE media SET chromaprint = ? WHERE id = ?`)
    let hashed = 0
    let skipped = 0
    const total = rows.length

    for (let i = 0; i < rows.length; i++) {
      if (this.aborted) break
      const r = rows[i]
      if (!fs.existsSync(r.path)) { skipped++; continue }

      const cp = await chromaprintFile(r.path)
      if (cp) {
        update.run(JSON.stringify({ d: cp.duration, f: cp.fingerprint }), r.id)
        hashed++
      } else {
        skipped++
      }

      if (onProgress) {
        onProgress({ hashed, total, currentFile: path.basename(r.path) })
      }
    }

    return { hashed, skipped }
  }

  /**
   * Group videos by chromaprint similarity. Two videos cluster when
   * chromaprintSimilarity >= threshold (default 0.85). Same union-find
   * structure as findMultiFrameGroups.
   */
  async findChromaprintGroups(threshold = 0.85): Promise<VisualDuplicateGroup[]> {
    const { chromaprintSimilarity } = await import('./ai-intelligence/chromaprint-fingerprint')
    const rows = this.rawDb.prepare(`
      SELECT id, filename, thumbPath, size, width, height, chromaprint
      FROM media
      WHERE type = 'video' AND chromaprint IS NOT NULL AND chromaprint != ''
    `).all() as Array<{
      id: string; filename: string; thumbPath: string | null;
      size: number | null; width: number | null; height: number | null;
      chromaprint: string
    }>

    if (rows.length < 2) return []

    const fingerprints: Array<{ row: typeof rows[0]; fp: string; dur: number }> = []
    for (const r of rows) {
      try {
        const env = JSON.parse(r.chromaprint) as { d: number; f: string }
        if (env && typeof env.f === 'string' && env.f.length > 0) {
          fingerprints.push({ row: r, fp: env.f, dur: env.d })
        }
      } catch { /* skip malformed */ }
    }

    const parent = new Map<string, string>()
    fingerprints.forEach(({ row }) => parent.set(row.id, row.id))
    const find = (id: string): string => {
      let cur = id
      while (parent.get(cur) !== cur) cur = parent.get(cur)!
      let walk = id
      while (parent.get(walk) !== cur) {
        const next = parent.get(walk)!
        parent.set(walk, cur)
        walk = next
      }
      return cur
    }
    const union = (a: string, b: string) => {
      const ra = find(a); const rb = find(b)
      if (ra !== rb) parent.set(ra, rb)
    }

    // Pre-filter pairs by duration (within 5%) — chromaprint similarity
    // on grossly different-length clips is meaningless.
    for (let i = 0; i < fingerprints.length; i++) {
      for (let j = i + 1; j < fingerprints.length; j++) {
        const a = fingerprints[i], b = fingerprints[j]
        const durRatio = Math.min(a.dur, b.dur) / Math.max(a.dur, b.dur)
        if (durRatio < 0.95) continue
        if (chromaprintSimilarity(a.fp, b.fp) >= threshold) {
          union(a.row.id, b.row.id)
        }
      }
    }

    const groups = new Map<string, typeof fingerprints>()
    for (const fp of fingerprints) {
      const root = find(fp.row.id)
      if (!groups.has(root)) groups.set(root, [])
      groups.get(root)!.push(fp)
    }

    const out: VisualDuplicateGroup[] = []
    for (const [root, members] of groups) {
      if (members.length < 2) continue
      const rep = members.find((m) => m.row.id === root) ?? members[0]
      out.push({
        representativeId: rep.row.id,
        members: members.map((m) => {
          const sim = chromaprintSimilarity(rep.fp, m.fp)
          // Pseudo-distance: 100 - similarity*100, so identical→0
          return {
            mediaId: m.row.id,
            filename: m.row.filename,
            thumbPath: m.row.thumbPath,
            sizeBytes: m.row.size,
            width: m.row.width,
            height: m.row.height,
            distance: Math.round((1 - sim) * 100),
          }
        }).sort((a, b) => a.distance - b.distance)
      })
    }
    out.sort((a, b) => b.members.length - a.members.length)
    return out
  }
}

let singleton: VisualDuplicatesService | null = null

export function getVisualDuplicatesService(db: DB): VisualDuplicatesService {
  if (!singleton) singleton = new VisualDuplicatesService(db)
  return singleton
}
