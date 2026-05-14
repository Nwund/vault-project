// File: src/main/services/ai-intelligence/multiframe-fingerprint.ts
//
// Multi-frame video fingerprinting. The existing single-keyframe pHash
// (visual-similarity.ts) misses re-encodes where the keyframe shifted.
// This module extracts N evenly-spaced frames, computes pHash on each,
// and returns an array. Two videos are "same" when ≥3 of 5 hashes
// match (Hamming distance ≤ 5 each).
//
// Inspiration: cooperdk/videoduplicatefinder which uses 5-10 frame
// fingerprints rather than single keyframes. Pure DSP, no model.
//
// Storage: caller persists the JSON array in their own table (e.g.
// media.multi_phash text column). Comparison is cheap — set
// intersection on hash strings, then optional Hamming-distance fuzzy
// match. We don't take a DB dependency here.

import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

// 8×8 dct phash, same parameters as visual-similarity.ts. Re-implemented
// here to avoid pulling sharp transitively if the caller is in a context
// where it isn't loaded yet (the frame extractor handles ffmpeg, sharp
// loads on-demand for thumbnails).
const HASH_SIZE = 8         // 8x8 = 64 bits
const HASH_INPUT_SIZE = 32  // 32x32 grayscale for DCT

let sharp: any = null

export interface MultiFrameFingerprint {
  /** Hex-encoded 64-bit pHash, one per sampled frame. */
  hashes: string[]
  /** Number of frames that actually produced a hash (≤ sample target). */
  validFrameCount: number
  /** Sampling timestamps (% of duration) for each entry — debugging aid. */
  timestampsPct: number[]
}

const EMPTY: MultiFrameFingerprint = { hashes: [], validFrameCount: 0, timestampsPct: [] }

/**
 * Extract N evenly-spaced frames as small JPEGs into a temp dir, hash
 * each, return the array. Frames span the middle 80% of the video so
 * we skip credits / black intros.
 */
export async function generateMultiFrameFingerprint(
  videoPath: string,
  ffmpegPath: string,
  durationSec: number | null | undefined,
  options?: { frameCount?: number; tmpDir?: string }
): Promise<MultiFrameFingerprint> {
  if (!fs.existsSync(videoPath)) return EMPTY
  const frameCount = options?.frameCount ?? 5
  const dur = durationSec ?? 0
  if (!dur || dur < 2) {
    // No duration → fall back to first keyframe only.
    return generateFromFrames([await extractSingleFrame(videoPath, ffmpegPath, 0.5)].filter(Boolean) as string[], [50])
  }

  const tmpDir = options?.tmpDir
    ?? path.join(os.tmpdir(), `vault-mfp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`)
  try { fs.mkdirSync(tmpDir, { recursive: true }) } catch { /* exists */ }

  // Spread frame samples across 10% → 90% of duration, evenly.
  const timestampsPct: number[] = []
  const framePaths: string[] = []
  try {
    for (let i = 0; i < frameCount; i++) {
      const pct = 10 + (i * 80) / Math.max(1, frameCount - 1)
      const tSec = (pct / 100) * dur
      const outPath = path.join(tmpDir, `frame-${i}.jpg`)
      const ok = await extractAt(videoPath, ffmpegPath, tSec, outPath)
      if (ok) {
        framePaths.push(outPath)
        timestampsPct.push(Math.round(pct * 10) / 10)
      }
    }
    return await generateFromFrames(framePaths, timestampsPct)
  } finally {
    // Best-effort cleanup.
    for (const p of framePaths) {
      try { fs.unlinkSync(p) } catch { /* ignore */ }
    }
    try { fs.rmdirSync(tmpDir) } catch { /* ignore */ }
  }
}

async function generateFromFrames(framePaths: string[], timestampsPct: number[]): Promise<MultiFrameFingerprint> {
  if (!sharp) {
    try { sharp = require('sharp') } catch { return EMPTY }
  }
  const hashes: string[] = []
  const kept: number[] = []
  for (let i = 0; i < framePaths.length; i++) {
    try {
      const h = await pHashOf(framePaths[i])
      if (h) {
        hashes.push(h)
        kept.push(timestampsPct[i] ?? 0)
      }
    } catch (err) {
      console.warn('[MultiFrame] phash failed for frame:', err)
    }
  }
  return { hashes, validFrameCount: hashes.length, timestampsPct: kept }
}

async function extractSingleFrame(videoPath: string, ffmpegPath: string, midPct: number): Promise<string | null> {
  const out = path.join(os.tmpdir(), `vault-mfp-single-${Date.now()}.jpg`)
  const ok = await extractAt(videoPath, ffmpegPath, midPct, out)
  return ok ? out : null
}

function extractAt(videoPath: string, ffmpegPath: string, tSec: number, outPath: string): Promise<boolean> {
  return new Promise((resolve) => {
    const proc = spawn(ffmpegPath, [
      '-y', '-ss', String(tSec),
      '-i', videoPath,
      '-vframes', '1',
      '-q:v', '5',
      '-vf', `scale=${HASH_INPUT_SIZE}:${HASH_INPUT_SIZE}:flags=lanczos,format=gray`,
      outPath,
    ], { windowsHide: true })
    proc.on('error', () => resolve(false))
    proc.on('close', (code) => resolve(code === 0 && fs.existsSync(outPath)))
  })
}

/** Compute 8x8 DCT pHash on a 32x32 grayscale image. */
async function pHashOf(imagePath: string): Promise<string | null> {
  if (!sharp) sharp = require('sharp')
  const buf = await sharp(imagePath)
    .resize(HASH_INPUT_SIZE, HASH_INPUT_SIZE, { fit: 'fill' })
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true })
  const pixels = new Float32Array(HASH_INPUT_SIZE * HASH_INPUT_SIZE)
  const data = buf.data as Buffer
  for (let i = 0; i < pixels.length; i++) pixels[i] = data[i]
  const dct = dct2d(pixels, HASH_INPUT_SIZE)
  // Low-frequency 8x8 block (excluding DC).
  const lowFreq = new Float32Array(HASH_SIZE * HASH_SIZE)
  for (let y = 0; y < HASH_SIZE; y++) {
    for (let x = 0; x < HASH_SIZE; x++) {
      lowFreq[y * HASH_SIZE + x] = dct[y * HASH_INPUT_SIZE + x]
    }
  }
  // Median (drop DC term at index 0 — would bias the median).
  const sorted = Array.from(lowFreq.slice(1)).sort((a, b) => a - b)
  const median = sorted[Math.floor(sorted.length / 2)]
  // Bits: 1 if above median, 0 otherwise.
  let bits = ''
  for (let i = 0; i < lowFreq.length; i++) bits += lowFreq[i] >= median ? '1' : '0'
  // Pack to hex.
  let hex = ''
  for (let i = 0; i < bits.length; i += 4) {
    hex += parseInt(bits.slice(i, i + 4), 2).toString(16)
  }
  return hex
}

/** 2D DCT-II. Cost O(N⁴) but N=32 → 1M ops, ~5ms. Used per frame. */
function dct2d(input: Float32Array, n: number): Float32Array {
  const out = new Float32Array(n * n)
  for (let u = 0; u < n; u++) {
    for (let v = 0; v < n; v++) {
      let sum = 0
      for (let x = 0; x < n; x++) {
        for (let y = 0; y < n; y++) {
          sum += input[x * n + y]
            * Math.cos(((2 * x + 1) * u * Math.PI) / (2 * n))
            * Math.cos(((2 * y + 1) * v * Math.PI) / (2 * n))
        }
      }
      const cu = u === 0 ? 1 / Math.sqrt(2) : 1
      const cv = v === 0 ? 1 / Math.sqrt(2) : 1
      out[u * n + v] = 0.25 * cu * cv * sum
    }
  }
  return out
}

/** Hamming distance over hex-encoded equal-length hashes. */
export function hammingDistanceHex(a: string, b: string): number {
  if (a.length !== b.length) return Math.max(a.length, b.length) * 4
  let dist = 0
  for (let i = 0; i < a.length; i++) {
    const xor = parseInt(a[i], 16) ^ parseInt(b[i], 16)
    dist += popcount(xor)
  }
  return dist
}

function popcount(x: number): number {
  x = x - ((x >> 1) & 0x5)
  x = (x & 0x3) + ((x >> 2) & 0x3)
  return x & 0xf
}

/**
 * Compare two multi-frame fingerprints. Returns the count of hash
 * pairs whose Hamming distance is ≤ maxDistance, treating fingerprints
 * as ordered sequences (i.e. frame 0 vs frame 0). Useful when both
 * were sampled with the same frameCount setting.
 */
export function matchOrdered(
  a: MultiFrameFingerprint,
  b: MultiFrameFingerprint,
  maxDistance = 5
): { matches: number; total: number } {
  const total = Math.min(a.hashes.length, b.hashes.length)
  let matches = 0
  for (let i = 0; i < total; i++) {
    if (hammingDistanceHex(a.hashes[i], b.hashes[i]) <= maxDistance) matches++
  }
  return { matches, total }
}

/**
 * Best-of-N match: for each frame in `a`, find its closest hash in `b`
 * and count it as a match if Hamming ≤ maxDistance. More robust to
 * frame-shift between re-encodes than `matchOrdered`.
 */
export function matchBestOf(
  a: MultiFrameFingerprint,
  b: MultiFrameFingerprint,
  maxDistance = 5
): { matches: number; total: number } {
  if (a.hashes.length === 0 || b.hashes.length === 0) {
    return { matches: 0, total: 0 }
  }
  let matches = 0
  for (const ha of a.hashes) {
    let best = Infinity
    for (const hb of b.hashes) {
      const d = hammingDistanceHex(ha, hb)
      if (d < best) best = d
      if (best <= 1) break  // early termination — clearly matched
    }
    if (best <= maxDistance) matches++
  }
  return { matches, total: a.hashes.length }
}

/** Are these two fingerprints "the same video"? Defaults: ≥3 of 5
 *  frames within Hamming 5. Tuning advice: drop to maxDistance=8 for
 *  watermarked re-encodes; tighten to 3 for catch-only-identical. */
export function isLikelyDuplicate(
  a: MultiFrameFingerprint,
  b: MultiFrameFingerprint,
  options?: { minMatches?: number; maxDistance?: number }
): boolean {
  const minMatches = options?.minMatches ?? 3
  const maxDistance = options?.maxDistance ?? 5
  const result = matchBestOf(a, b, maxDistance)
  return result.matches >= minMatches
}
