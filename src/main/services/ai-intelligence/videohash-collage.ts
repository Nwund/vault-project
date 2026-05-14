// File: src/main/services/ai-intelligence/videohash-collage.ts
//
// Single-scalar video fingerprinting via the collage-of-frames technique
// from akamhy/videohash. The complementary approach to Vault's existing
// multi-frame pHash:
//
//   - multi-frame pHash (multiframe-fingerprint.ts): N=5 separate hashes,
//     compared best-of-N. Strong against frame-shift between re-encodes.
//   - collage hash (this module): 1 hash. Sample 64 thumbnails across
//     the middle 80% of the video, tile them into one 8×8 collage image,
//     run a pHash on the collage. The result is a SINGLE 64-bit hash
//     that lets you do O(1) lookup + Hamming-distance compare.
//
// Trade-off: single-scalar is faster to index + compare in bulk (good
// for a 50k+ library scan) but loses some spatial fidelity vs the
// N-frame approach. Combine: use this for fast first-pass cluster,
// then drop to multi-frame for the actual same/different decision.
//
// Reference: github.com/akamhy/videohash (MIT-licensed, ~200 LOC core).
// We re-implement here in TS to keep Vault's existing
// ffmpeg-static + sharp deps as the only runtime requirements.

import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const COLLAGE_GRID = 8                          // 8×8 thumbnails
const COLLAGE_FRAMES = COLLAGE_GRID * COLLAGE_GRID
const THUMB_PX = 32                             // each thumbnail this size
const COLLAGE_SIDE_PX = COLLAGE_GRID * THUMB_PX // composite image side
const HASH_INPUT_SIZE = 32                      // pHash input size (must be ≥ HASH_SIZE)
const HASH_SIZE = 8                             // 8×8 = 64-bit output

let sharp: any = null

/**
 * Generate a 64-bit collage hash for a single video. Returns the hash
 * as a 16-char hex string, or null on failure (unreadable video, short
 * file, missing duration).
 */
export async function generateCollageHash(
  videoPath: string,
  ffmpegPath: string,
  durationSec: number | null | undefined,
  options?: { tmpDir?: string }
): Promise<string | null> {
  if (!fs.existsSync(videoPath)) return null
  if (!sharp) {
    try { sharp = require('sharp') } catch { return null }
  }

  const dur = durationSec ?? 0
  if (!dur || dur < 2) {
    // Too short for a meaningful collage — caller should fall back to
    // single-frame pHash via the existing visual-duplicates service.
    return null
  }

  const tmpDir = options?.tmpDir
    ?? path.join(os.tmpdir(), `vault-collage-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`)
  try { fs.mkdirSync(tmpDir, { recursive: true }) } catch { /* exists */ }

  const framePaths: string[] = []
  try {
    // Spread frame samples across the middle 80% of duration.
    const startPct = 10
    const endPct = 90
    const span = endPct - startPct

    // Extract all 64 frames in parallel batches of 8. Pure JPEG extracts
    // at 32×32 — total decode work is similar to one full-resolution
    // frame, so wall-time is dominated by ffmpeg startup × batch count.
    const BATCH = 8
    const extractOne = (i: number): Promise<string | null> => {
      const pct = startPct + (i * span) / (COLLAGE_FRAMES - 1)
      const tSec = (pct / 100) * dur
      const outPath = path.join(tmpDir, `f${String(i).padStart(2, '0')}.jpg`)
      return new Promise((resolve) => {
        const proc = spawn(ffmpegPath, [
          '-y',
          '-ss', tSec.toFixed(2),
          '-i', videoPath,
          '-vframes', '1',
          '-q:v', '5',
          '-vf', `scale=${THUMB_PX}:${THUMB_PX}:flags=lanczos`,
          outPath,
        ], { windowsHide: true })
        proc.on('error', () => resolve(null))
        proc.on('close', (code) => resolve(code === 0 && fs.existsSync(outPath) ? outPath : null))
      })
    }
    for (let i = 0; i < COLLAGE_FRAMES; i += BATCH) {
      const batch = await Promise.all(
        Array.from({ length: Math.min(BATCH, COLLAGE_FRAMES - i) }, (_, j) => extractOne(i + j))
      )
      for (const f of batch) if (f) framePaths.push(f)
    }
    if (framePaths.length < COLLAGE_FRAMES / 2) {
      console.warn(`[videohash-collage] only ${framePaths.length}/${COLLAGE_FRAMES} frames extracted, abandoning`)
      return null
    }

    // Compose the collage: paste each thumbnail into its grid cell.
    // Missing frames (failed extracts) leave a black tile, which is
    // fine — the hash degrades gracefully.
    const composite: any[] = []
    for (let i = 0; i < framePaths.length; i++) {
      const row = Math.floor(i / COLLAGE_GRID)
      const col = i % COLLAGE_GRID
      composite.push({
        input: framePaths[i],
        top: row * THUMB_PX,
        left: col * THUMB_PX,
      })
    }
    const collageBuf = await sharp({
      create: {
        width: COLLAGE_SIDE_PX,
        height: COLLAGE_SIDE_PX,
        channels: 3,
        background: { r: 0, g: 0, b: 0 },
      },
    })
      .composite(composite)
      .raw()
      .toBuffer({ resolveWithObject: true })
    void collageBuf

    // pHash the composite: resize to 32×32 grayscale, run DCT, take
    // low-frequency 8×8 block, median-threshold to 64 bits.
    const pix = await sharp({
      create: {
        width: COLLAGE_SIDE_PX,
        height: COLLAGE_SIDE_PX,
        channels: 3,
        background: { r: 0, g: 0, b: 0 },
      },
    })
      .composite(composite)
      .resize(HASH_INPUT_SIZE, HASH_INPUT_SIZE, { fit: 'fill', kernel: 'lanczos3' })
      .grayscale()
      .raw()
      .toBuffer()

    const pixels = new Float32Array(HASH_INPUT_SIZE * HASH_INPUT_SIZE)
    for (let i = 0; i < pixels.length; i++) pixels[i] = pix[i]
    const dct = dct2d(pixels, HASH_INPUT_SIZE)

    // Low-frequency 8×8 sub-block, drop DC term (index 0) before
    // computing median — DC dominates and biases the threshold.
    const lowFreq = new Float32Array(HASH_SIZE * HASH_SIZE)
    for (let y = 0; y < HASH_SIZE; y++) {
      for (let x = 0; x < HASH_SIZE; x++) {
        lowFreq[y * HASH_SIZE + x] = dct[y * HASH_INPUT_SIZE + x]
      }
    }
    const sorted = Array.from(lowFreq.slice(1)).sort((a, b) => a - b)
    const median = sorted[Math.floor(sorted.length / 2)]

    let bits = ''
    for (let i = 0; i < lowFreq.length; i++) bits += lowFreq[i] >= median ? '1' : '0'
    let hex = ''
    for (let i = 0; i < bits.length; i += 4) {
      hex += parseInt(bits.slice(i, i + 4), 2).toString(16)
    }
    return hex
  } catch (err) {
    console.warn('[videohash-collage] failed:', err)
    return null
  } finally {
    for (const f of framePaths) {
      try { fs.unlinkSync(f) } catch { /* ignore */ }
    }
    try { fs.rmdirSync(tmpDir) } catch { /* ignore */ }
  }
}

/** 2D DCT-II. N=32 → 1M ops, ~5ms. Mirror of multiframe-fingerprint's
 *  dct2d so the math is identical between modules. */
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

/** Hamming distance between two 16-char hex hashes (64 bits each). */
export function collageHammingDistance(a: string, b: string): number {
  if (a.length !== b.length) return Math.max(a.length, b.length) * 4
  let dist = 0
  for (let i = 0; i < a.length; i++) {
    let xor = parseInt(a[i], 16) ^ parseInt(b[i], 16)
    while (xor) { dist += xor & 1; xor >>>= 1 }
  }
  return dist
}

/** akamhy/videohash defaults: Hamming ≤ 8 of 64 bits = "same video." */
export function isCollageSameVideo(a: string, b: string, threshold = 8): boolean {
  return collageHammingDistance(a, b) <= threshold
}
