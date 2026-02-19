// File: src/main/services/visual-similarity.ts
// Visual similarity search using perceptual hashing

import { spawn } from 'child_process'
import path from 'path'
import fs from 'fs/promises'
import { app } from 'electron'
import type { DB } from '../db'

// Hash size in bits (64 = 8x8 image)
const HASH_SIZE = 8
const HASH_BITS = HASH_SIZE * HASH_SIZE

/**
 * Compute average hash (aHash) from grayscale pixel values
 * Simple and fast, good for exact duplicates
 */
function computeAverageHash(pixels: number[]): string {
  const avg = pixels.reduce((a, b) => a + b, 0) / pixels.length
  let hash = ''
  for (const p of pixels) {
    hash += p >= avg ? '1' : '0'
  }
  return binaryToHex(hash)
}

/**
 * Compute difference hash (dHash) - better at catching edits
 * Compares each pixel to its right neighbor
 */
function computeDifferenceHash(pixels: number[]): string {
  let hash = ''
  for (let y = 0; y < HASH_SIZE; y++) {
    for (let x = 0; x < HASH_SIZE; x++) {
      const idx = y * (HASH_SIZE + 1) + x
      const nextIdx = idx + 1
      hash += pixels[idx] < pixels[nextIdx] ? '1' : '0'
    }
  }
  return binaryToHex(hash)
}

/**
 * Convert binary string to hex
 */
function binaryToHex(binary: string): string {
  let hex = ''
  for (let i = 0; i < binary.length; i += 4) {
    const chunk = binary.slice(i, i + 4).padEnd(4, '0')
    hex += parseInt(chunk, 2).toString(16)
  }
  return hex
}

/**
 * Convert hex to binary string
 */
function hexToBinary(hex: string): string {
  let binary = ''
  for (const char of hex) {
    binary += parseInt(char, 16).toString(2).padStart(4, '0')
  }
  return binary
}

/**
 * Calculate Hamming distance between two hashes
 * Returns number of differing bits (0 = identical, higher = more different)
 */
export function hammingDistance(hash1: string, hash2: string): number {
  const bin1 = hexToBinary(hash1)
  const bin2 = hexToBinary(hash2)

  let distance = 0
  const len = Math.max(bin1.length, bin2.length)

  for (let i = 0; i < len; i++) {
    if ((bin1[i] || '0') !== (bin2[i] || '0')) {
      distance++
    }
  }

  return distance
}

/**
 * Calculate similarity score from Hamming distance
 * Returns 0-100 percentage (100 = identical)
 */
export function similarityScore(hash1: string, hash2: string): number {
  const distance = hammingDistance(hash1, hash2)
  return Math.round((1 - distance / HASH_BITS) * 100)
}

/**
 * Get FFmpeg binary path
 */
function getFFmpegPath(): string {
  const isDev = !app.isPackaged
  if (isDev) {
    // Development: check common locations
    const devPaths = [
      path.join(process.cwd(), 'bin', 'ffmpeg.exe'),
      path.join(process.cwd(), 'node_modules', 'ffmpeg-static', 'ffmpeg.exe'),
      'ffmpeg' // System PATH
    ]
    for (const p of devPaths) {
      try {
        if (p === 'ffmpeg' || require('fs').existsSync(p)) return p
      } catch {}
    }
    return 'ffmpeg'
  }
  // Production: bundled ffmpeg
  return path.join(process.resourcesPath, 'bin', 'ffmpeg.exe')
}

/**
 * Extract a frame from video and get raw pixels
 */
async function extractVideoFrame(videoPath: string, timeSec: number = 1): Promise<Buffer | null> {
  const ffmpeg = getFFmpegPath()

  return new Promise((resolve) => {
    // Extract frame as raw grayscale, resized to 9x8 for dHash (need 1 extra column)
    const args = [
      '-ss', String(timeSec),
      '-i', videoPath,
      '-vframes', '1',
      '-vf', `scale=${HASH_SIZE + 1}:${HASH_SIZE},format=gray`,
      '-f', 'rawvideo',
      '-'
    ]

    const chunks: Buffer[] = []
    const proc = spawn(ffmpeg, args, { stdio: ['ignore', 'pipe', 'ignore'] })

    proc.stdout.on('data', (chunk) => chunks.push(chunk))
    proc.on('close', (code) => {
      if (code === 0 && chunks.length > 0) {
        resolve(Buffer.concat(chunks))
      } else {
        resolve(null)
      }
    })
    proc.on('error', () => resolve(null))

    // Timeout
    setTimeout(() => {
      proc.kill()
      resolve(null)
    }, 10000)
  })
}

/**
 * Compute perceptual hash for an image file
 */
async function computeImageHash(imagePath: string): Promise<string | null> {
  const ffmpeg = getFFmpegPath()

  return new Promise((resolve) => {
    const args = [
      '-i', imagePath,
      '-vframes', '1',
      '-vf', `scale=${HASH_SIZE + 1}:${HASH_SIZE},format=gray`,
      '-f', 'rawvideo',
      '-'
    ]

    const chunks: Buffer[] = []
    const proc = spawn(ffmpeg, args, { stdio: ['ignore', 'pipe', 'ignore'] })

    proc.stdout.on('data', (chunk) => chunks.push(chunk))
    proc.on('close', (code) => {
      if (code === 0 && chunks.length > 0) {
        const pixels = Array.from(Buffer.concat(chunks))
        const hash = computeDifferenceHash(pixels)
        resolve(hash)
      } else {
        resolve(null)
      }
    })
    proc.on('error', () => resolve(null))

    setTimeout(() => {
      proc.kill()
      resolve(null)
    }, 10000)
  })
}

/**
 * Compute perceptual hash for a video file
 * Takes samples from multiple timestamps for better matching
 */
async function computeVideoHash(videoPath: string, durationSec?: number): Promise<string | null> {
  // Sample multiple frames and combine hashes
  const sampleTimes = durationSec
    ? [
        Math.min(1, durationSec * 0.1),
        durationSec * 0.25,
        durationSec * 0.5,
        durationSec * 0.75
      ]
    : [1, 5, 15, 30]

  // Try each sample time until we get a good frame
  for (const time of sampleTimes) {
    const pixels = await extractVideoFrame(videoPath, time)
    if (pixels && pixels.length >= (HASH_SIZE + 1) * HASH_SIZE) {
      const pixelArray = Array.from(pixels)
      return computeDifferenceHash(pixelArray)
    }
  }

  return null
}

/**
 * Compute hash for any media file
 */
export async function computeMediaHash(
  filePath: string,
  type: 'video' | 'image' | 'gif',
  durationSec?: number
): Promise<string | null> {
  try {
    // Check file exists
    await fs.access(filePath)

    if (type === 'video') {
      return computeVideoHash(filePath, durationSec ?? undefined)
    } else {
      return computeImageHash(filePath)
    }
  } catch (e) {
    console.error(`[VisualSimilarity] Failed to compute hash for ${filePath}:`, e)
    return null
  }
}

/**
 * Visual similarity search service
 */
export class VisualSimilarityService {
  constructor(private db: DB) {}

  /**
   * Update phash for a media item
   */
  async updateHash(mediaId: string): Promise<string | null> {
    const media = this.db.getMedia(mediaId)
    if (!media) return null

    const hash = await computeMediaHash(
      media.path,
      media.type as 'video' | 'image' | 'gif',
      media.durationSec ?? undefined
    )

    if (hash) {
      this.db.raw.prepare(`UPDATE media SET phash = ? WHERE id = ?`).run(hash, mediaId)
    }

    return hash
  }

  /**
   * Find visually similar media
   */
  findSimilar(
    mediaId: string,
    threshold: number = 10, // Max Hamming distance (0-64)
    limit: number = 20
  ): Array<{ media: any; similarity: number; distance: number }> {
    const source = this.db.getMedia(mediaId)
    if (!source?.phash) return []

    const sourceHash = source.phash

    // Get all media with hashes
    const allMedia = this.db.raw.prepare(`
      SELECT * FROM media
      WHERE phash IS NOT NULL AND id != ? AND analyzeError = 0
    `).all(mediaId) as any[]

    // Calculate distances and filter
    const results: Array<{ media: any; similarity: number; distance: number }> = []

    for (const media of allMedia) {
      const distance = hammingDistance(sourceHash, media.phash)
      if (distance <= threshold) {
        results.push({
          media,
          distance,
          similarity: similarityScore(sourceHash, media.phash)
        })
      }
    }

    // Sort by similarity (most similar first)
    results.sort((a, b) => a.distance - b.distance)

    return results.slice(0, limit)
  }

  /**
   * Find exact duplicates (distance = 0)
   */
  findDuplicates(mediaId: string): any[] {
    const results = this.findSimilar(mediaId, 0, 100)
    return results.map(r => r.media)
  }

  /**
   * Find near-duplicates (very high similarity)
   */
  findNearDuplicates(mediaId: string): Array<{ media: any; similarity: number }> {
    const results = this.findSimilar(mediaId, 5, 50)
    return results.map(r => ({ media: r.media, similarity: r.similarity }))
  }

  /**
   * Find all duplicate groups in the library
   */
  findAllDuplicateGroups(threshold: number = 5): Array<{ items: any[]; similarity: number }> {
    const allMedia = this.db.raw.prepare(`
      SELECT * FROM media
      WHERE phash IS NOT NULL AND analyzeError = 0
      ORDER BY addedAt DESC
    `).all() as any[]

    const groups: Array<{ items: any[]; similarity: number }> = []
    const processed = new Set<string>()

    for (const media of allMedia) {
      if (processed.has(media.id)) continue

      const similar = this.findSimilar(media.id, threshold, 100)
        .filter(r => !processed.has(r.media.id))

      if (similar.length > 0) {
        const group = {
          items: [media, ...similar.map(r => r.media)],
          similarity: similar.length > 0
            ? Math.round(similar.reduce((a, b) => a + b.similarity, 0) / similar.length)
            : 100
        }
        groups.push(group)

        // Mark all as processed
        processed.add(media.id)
        for (const r of similar) {
          processed.add(r.media.id)
        }
      }
    }

    return groups
  }

  /**
   * Get statistics about hash coverage
   */
  getStats(): {
    totalMedia: number
    hashedMedia: number
    unhashed: number
    percentComplete: number
  } {
    const total = this.db.raw.prepare(`SELECT COUNT(*) as n FROM media WHERE analyzeError = 0`).get() as { n: number }
    const hashed = this.db.raw.prepare(`SELECT COUNT(*) as n FROM media WHERE phash IS NOT NULL AND analyzeError = 0`).get() as { n: number }

    return {
      totalMedia: total.n,
      hashedMedia: hashed.n,
      unhashed: total.n - hashed.n,
      percentComplete: total.n > 0 ? Math.round((hashed.n / total.n) * 100) : 0
    }
  }

  /**
   * Get media items that need hashing
   */
  getUnhashed(limit: number = 100): any[] {
    return this.db.raw.prepare(`
      SELECT * FROM media
      WHERE phash IS NULL AND analyzeError = 0
      ORDER BY addedAt DESC
      LIMIT ?
    `).all(limit) as any[]
  }

  /**
   * Batch compute hashes for unhashed media
   */
  async batchComputeHashes(
    limit: number = 50,
    onProgress?: (current: number, total: number, mediaId: string) => void
  ): Promise<{ processed: number; failed: number }> {
    const unhashed = this.getUnhashed(limit)
    let processed = 0
    let failed = 0

    for (let i = 0; i < unhashed.length; i++) {
      const media = unhashed[i]
      onProgress?.(i + 1, unhashed.length, media.id)

      const hash = await this.updateHash(media.id)
      if (hash) {
        processed++
      } else {
        failed++
      }
    }

    return { processed, failed }
  }

  /**
   * Compare two specific media items
   */
  compareMedia(mediaId1: string, mediaId2: string): {
    similar: boolean
    similarity: number
    distance: number
  } | null {
    const media1 = this.db.getMedia(mediaId1)
    const media2 = this.db.getMedia(mediaId2)

    if (!media1?.phash || !media2?.phash) {
      return null
    }

    const distance = hammingDistance(media1.phash, media2.phash)
    const similarity = similarityScore(media1.phash, media2.phash)

    return {
      similar: distance <= 10,
      similarity,
      distance
    }
  }
}

// Singleton
let instance: VisualSimilarityService | null = null

export function getVisualSimilarityService(db: DB): VisualSimilarityService {
  if (!instance) {
    instance = new VisualSimilarityService(db)
  }
  return instance
}

export default VisualSimilarityService
