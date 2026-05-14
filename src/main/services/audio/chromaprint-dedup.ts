// File: src/main/services/audio/chromaprint-dedup.ts
//
// Chromaprint audio fingerprinting for the soundpack corpus. OpenNSFW
// SFX ships ~32k files with heavy duplication (re-encodes, slight
// trims, renamed copies). Chromaprint hashes are robust against all
// of those — two files with the same fingerprint sound identical
// regardless of bitrate / format / minor padding.
//
// ffmpeg ships a built-in chromaprint muxer, so we don't need the
// external fpcalc binary. The muxer outputs a 32-bit integer
// fingerprint sequence (sub-fingerprints) at ~1 per second of audio.
//
// Two fingerprints are "same" when their Hamming-distance per
// matching sub-fingerprint is below a threshold (typical: <8 bits
// per 32-bit subfp, averaged across the shorter clip's length).
//
// Output: groups of files-that-sound-identical. Caller decides
// what to do (auto-delete dupes, mark as variants, etc).

import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const MAX_AUDIO_LEN_SEC = 30   // cap per-file — most NSFW SFX are <10s
const SUBFP_HAMMING_THRESHOLD = 8  // bits per 32-bit subfp; <8 = same
const MIN_MATCHING_RATIO = 0.7  // ≥70% of matched subfps must agree

export interface SoundFingerprint {
  filePath: string
  /** Each entry is a 32-bit unsigned integer subfingerprint. */
  subfps: number[]
}

/**
 * Compute chromaprint fingerprint for a single audio file via the
 * ffmpeg `chromaprint` muxer. Returns the subfingerprint sequence as
 * an array of 32-bit unsigned ints. Null on failure (unreadable file,
 * ffmpeg crashed, etc).
 */
export async function fingerprintFile(
  ffmpegPath: string,
  filePath: string
): Promise<SoundFingerprint | null> {
  if (!fs.existsSync(filePath)) return null
  return new Promise((resolve) => {
    try {
      const proc = spawn(ffmpegPath, [
        '-hide_banner', '-loglevel', 'error',
        '-i', filePath,
        '-t', String(MAX_AUDIO_LEN_SEC),
        '-vn',
        '-ac', '1',
        '-ar', '11025',  // chromaprint's expected sample rate
        '-f', 'chromaprint',
        '-fp_format', 'raw',  // newline-separated 32-bit subfps
        'pipe:1',
      ], { windowsHide: true })

      let stdout = ''
      proc.stdout?.on('data', (d: Buffer) => { stdout += d.toString() })
      proc.on('error', () => resolve(null))
      proc.on('close', (code) => {
        if (code !== 0 || !stdout.trim()) {
          resolve(null)
          return
        }
        const subfps: number[] = []
        for (const line of stdout.split(/\s+/)) {
          if (!line) continue
          const n = parseInt(line, 10)
          if (!isNaN(n)) subfps.push(n >>> 0)  // force unsigned
        }
        if (subfps.length === 0) {
          resolve(null)
          return
        }
        resolve({ filePath, subfps })
      })
    } catch { resolve(null) }
  })
}

/** Hamming distance between two 32-bit unsigned ints. */
function hamming32(a: number, b: number): number {
  let x = (a ^ b) >>> 0
  let count = 0
  while (x) { count += x & 1; x >>>= 1 }
  return count
}

/**
 * Are two fingerprints "same audio"? Compares position-aligned
 * subfingerprints. Tolerates length mismatches by aligning the
 * shorter against the longer at offset 0 (chromaprint is alignment-
 * sensitive — a leading silence shift causes false negatives, but
 * for soundpack dedup we mostly see identical files or pure
 * re-encodes which preserve alignment).
 */
export function fingerprintsMatch(
  a: SoundFingerprint,
  b: SoundFingerprint
): boolean {
  const len = Math.min(a.subfps.length, b.subfps.length)
  if (len < 3) return false  // too short for confident match

  let matchingSubfps = 0
  for (let i = 0; i < len; i++) {
    if (hamming32(a.subfps[i], b.subfps[i]) <= SUBFP_HAMMING_THRESHOLD) {
      matchingSubfps++
    }
  }
  return matchingSubfps / len >= MIN_MATCHING_RATIO
}

/**
 * Cluster a set of soundpack files into "same audio" groups by
 * chromaprint similarity. Returns groups of ≥2 files (single-element
 * groups omitted — those aren't duplicates).
 *
 * Cost: O(N) ffmpeg invocations + O(N²) pairwise compare on the
 * resulting fingerprints. For 32k OpenNSFW files: ~32k ffmpeg calls
 * = ~1 hour wall-time at 50ms/file in parallel-8, then ~30 sec for
 * the compare pass. Recommend running as a one-time batch (cache
 * fingerprints to disk so re-runs skip already-hashed files).
 */
export async function clusterByFingerprint(
  ffmpegPath: string,
  files: string[],
  onProgress?: (done: number, total: number, currentFile: string) => void,
  options?: { concurrency?: number; existingFingerprints?: Map<string, SoundFingerprint> }
): Promise<{ groups: string[][]; fingerprints: Map<string, SoundFingerprint> }> {
  const concurrency = Math.max(1, Math.min(16, options?.concurrency ?? 4))
  const cache = options?.existingFingerprints ?? new Map<string, SoundFingerprint>()

  // Compute fingerprints in parallel batches.
  let processed = 0
  for (let i = 0; i < files.length; i += concurrency) {
    const batch = files.slice(i, i + concurrency)
    await Promise.all(batch.map(async (f) => {
      if (!cache.has(f)) {
        const fp = await fingerprintFile(ffmpegPath, f)
        if (fp) cache.set(f, fp)
      }
      processed++
      onProgress?.(processed, files.length, path.basename(f))
    }))
  }

  // Pairwise cluster via union-find. Bucket by first subfp's high-8
  // bits as a cheap pre-filter (matching fingerprints will share that
  // bucket; ~99% of comparisons get skipped this way).
  const buckets = new Map<number, string[]>()
  for (const [filePath, fp] of cache) {
    if (fp.subfps.length === 0) continue
    const bucket = (fp.subfps[0] >>> 24) & 0xFF
    if (!buckets.has(bucket)) buckets.set(bucket, [])
    buckets.get(bucket)!.push(filePath)
  }

  const parent = new Map<string, string>()
  for (const f of cache.keys()) parent.set(f, f)
  const find = (x: string): string => {
    let cur = x
    while (parent.get(cur) !== cur) cur = parent.get(cur)!
    // Path compression
    let walk = x
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

  for (const bucketFiles of buckets.values()) {
    for (let i = 0; i < bucketFiles.length; i++) {
      const fa = cache.get(bucketFiles[i])
      if (!fa) continue
      for (let j = i + 1; j < bucketFiles.length; j++) {
        const fb = cache.get(bucketFiles[j])
        if (!fb) continue
        if (fingerprintsMatch(fa, fb)) {
          union(bucketFiles[i], bucketFiles[j])
        }
      }
    }
  }

  // Collect groups.
  const groupsMap = new Map<string, string[]>()
  for (const f of cache.keys()) {
    const root = find(f)
    if (!groupsMap.has(root)) groupsMap.set(root, [])
    groupsMap.get(root)!.push(f)
  }
  const groups: string[][] = []
  for (const arr of groupsMap.values()) {
    if (arr.length >= 2) groups.push(arr)
  }
  // Largest groups first.
  groups.sort((a, b) => b.length - a.length)

  return { groups, fingerprints: cache }
}

/**
 * Save fingerprints to a JSON sidecar so re-runs skip already-hashed
 * files. Keyed by absolute path. Format: { version, fingerprints: { path: subfps[] } }
 */
export function saveFingerprintCache(
  cachePath: string,
  fingerprints: Map<string, SoundFingerprint>
): void {
  const obj: Record<string, number[]> = {}
  for (const [k, v] of fingerprints) obj[k] = v.subfps
  try {
    fs.writeFileSync(cachePath, JSON.stringify({ version: 1, fingerprints: obj }), 'utf8')
  } catch (err) {
    console.warn('[Chromaprint] cache write failed:', err)
  }
}

export function loadFingerprintCache(cachePath: string): Map<string, SoundFingerprint> {
  const cache = new Map<string, SoundFingerprint>()
  try {
    const raw = fs.readFileSync(cachePath, 'utf8')
    const parsed = JSON.parse(raw)
    if (parsed?.version === 1 && parsed.fingerprints) {
      for (const [k, v] of Object.entries(parsed.fingerprints)) {
        if (Array.isArray(v)) {
          cache.set(k, { filePath: k, subfps: v as number[] })
        }
      }
    }
  } catch { /* cache absent or corrupt — empty map is fine */ }
  return cache
}
