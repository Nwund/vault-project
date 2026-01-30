// File: src/main/scanner.ts
import fs from 'node:fs/promises'
import fsSync from 'node:fs'
import path from 'node:path'
import fg from 'fast-glob'
import { classifyMedia } from './media-utils'
import type { DB } from './db'
import { thumbExists } from './thumbs'

type AnalyzePayload = {
  mediaId: string
  path: string
  type: 'video' | 'image' | 'gif'
  mtimeMs: number
  size: number
}

function needsAnalyze(row: any): boolean {
  if (!row) return true
  if (row.type === 'video') return row.durationSec == null || !thumbExists(row.thumbPath)
  if (row.type === 'image' || row.type === 'gif') return !thumbExists(row.thumbPath)
  return false
}

function enqueueAnalyze(db: DB, payload: AnalyzePayload) {
  // Skip if a queued job already exists for this media
  if (db.hasQueuedJobForMedia(payload.mediaId)) return

  // Clear any previous analyze error so item gets a fresh chance
  db.clearAnalyzeError(payload.mediaId)

  // Priority: videos first
  const priority = payload.type === 'video' ? 10 : 5
  db.enqueueJob('media:analyze', payload, priority)
}

export async function scanAndUpsertAll(db: DB, mediaDir: string): Promise<void> {
  console.log(`[Scanner] Starting scan of: ${mediaDir}`)

  try {
    await fs.mkdir(mediaDir, { recursive: true })
  } catch (e) {
    console.error(`[Scanner] Failed to access directory: ${mediaDir}`, e)
    return
  }

  const entries = await fg(['**/*.*', '**/*'], {
    cwd: mediaDir,
    dot: false,
    onlyFiles: true,
    absolute: true,
    suppressErrors: true,
    followSymbolicLinks: true,
    deep: Infinity, // Scan all subdirectories
    caseSensitiveMatch: false
  })

  console.log(`[Scanner] Found ${entries.length} files in ${mediaDir}`)

  let processed = 0
  let skipped = 0

  for (const p of entries) {
    try {
      const { type } = classifyMedia(p)
      if (type) {
        await upsertOne(db, p)
        processed++
      } else {
        skipped++
      }
    } catch (e) {
      console.warn(`[Scanner] Error processing file: ${p}`, e)
    }
  }

  console.log(`[Scanner] Completed: ${processed} media files added, ${skipped} non-media files skipped`)
}

export async function upsertOne(db: DB, filePath: string): Promise<void> {
  const { type, ext } = classifyMedia(filePath)
  if (!type) return

  const st = await fs.stat(filePath)
  const existing = db.getMediaByPath(filePath)

  // If unchanged but missing analysis/thumb, enqueue and return quickly.
  if (existing && existing.mtimeMs === st.mtimeMs && existing.size === st.size) {
    if (needsAnalyze(existing)) {
      // Clear stale thumbPath if it points to a non-existent file
      if (existing.thumbPath && !thumbExists(existing.thumbPath)) {
        db.clearThumbPath(existing.id)
      }
      enqueueAnalyze(db, {
        mediaId: existing.id,
        path: filePath,
        type,
        mtimeMs: st.mtimeMs,
        size: st.size
      })
    }
    return
  }

  const filename = path.basename(filePath)

  // Insert/update fast; do heavy work in job runner.
  const row = db.upsertMedia({
    id: existing?.id,
    addedAt: existing?.addedAt,
    type,
    path: filePath,
    filename,
    ext,
    size: st.size,
    mtimeMs: st.mtimeMs,
    durationSec: existing?.durationSec ?? null,
    thumbPath: existing?.thumbPath ?? null,
    width: existing?.width ?? null,
    height: existing?.height ?? null,
    hashSha256: existing?.hashSha256 ?? null,
    phash: existing?.phash ?? null
  })

  enqueueAnalyze(db, {
    mediaId: row.id,
    path: filePath,
    type,
    mtimeMs: st.mtimeMs,
    size: st.size
  })
}

/**
 * Remove database entries for files that no longer exist on disk
 * or are outside the configured media directories.
 * Called on startup to clean up stale entries.
 */
export function cleanupMissingFiles(db: DB, mediaDirs?: string[]): number {
  const allMedia = db.listAllMediaPaths()
  let removed = 0

  // Normalize media dirs for comparison
  const normalizedDirs = mediaDirs?.map(d => path.resolve(d).toLowerCase()) ?? []

  for (const { id, path: filePath } of allMedia) {
    const missing = !fsSync.existsSync(filePath)
    // If mediaDirs provided, also remove entries outside configured directories
    const outsideDirs = normalizedDirs.length > 0 &&
      !normalizedDirs.some(dir => path.resolve(filePath).toLowerCase().startsWith(dir))

    if (missing || outsideDirs) {
      const reason = missing ? 'missing' : 'outside media dirs'
      console.log(`[Scanner] Removing ${reason} file from DB:`, filePath)
      db.deleteMediaById(id)
      removed++
    }
  }

  if (removed > 0) {
    console.log(`[Scanner] Cleaned up ${removed} stale file(s) from database`)
  }

  return removed
}