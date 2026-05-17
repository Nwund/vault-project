// File: src/main/scanner.ts
import fs from 'node:fs/promises'
import fsSync from 'node:fs'
import path from 'node:path'
import fg from 'fast-glob'
import { classifyMedia } from './media-utils'
import type { DB } from './db'
import { thumbExists } from './thumbs'

// Prevent overlapping scans for the same directory
const scanningDirs = new Set<string>()

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
  // Normalize path for consistent comparison
  const normalizedDir = path.resolve(mediaDir).toLowerCase()

  // Skip if already scanning this directory
  if (scanningDirs.has(normalizedDir)) {
    console.log(`[Scanner] Skipping duplicate scan of: ${mediaDir}`)
    return
  }

  scanningDirs.add(normalizedDir)
  console.log(`[Scanner] Starting scan of: ${mediaDir}`)

  try {
    await fs.mkdir(mediaDir, { recursive: true })
  } catch (e) {
    console.error(`[Scanner] Failed to access directory: ${mediaDir}`, e)
    scanningDirs.delete(normalizedDir)
    return
  }

  try {
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

    // Pre-load the existing-media index in ONE batched SELECT instead of
    // hitting getMediaByPath() 4000 times mid-scan. The Map key is the
    // lowercased path because Windows paths are case-insensitive on disk
    // but better-sqlite3 LIKE/= comparisons are case-sensitive.
    const existingIndex = new Map<string, ReturnType<typeof db.listAllMediaForScan>[number]>()
    for (const row of db.listAllMediaForScan()) {
      existingIndex.set(row.path.toLowerCase(), row)
    }

    let processed = 0
    let skipped = 0
    let fastPathHits = 0

    // Batch the scan into chunks of 64 files. For each chunk:
    //   1. Stat all files in parallel (Promise.all on fs.stat — disk I/O bound).
    //   2. Wrap the synchronous DB writes (upsertMedia + enqueueAnalyze)
    //      in ONE better-sqlite3 transaction. Researched 2026-05-10 —
    //      wrapping bulk inserts in a single transaction is critical for
    //      write throughput; was previously one implicit transaction per file
    //      = 4035 fsync()s for the user's library scan. Now ≈ 63
    //      transactions instead.
    //   3. Skip files that don't classify (early continue keeps upsertOne
    //      semantics intact — type-classification is pure, no I/O).
    const CHUNK_SIZE = 64
    for (let i = 0; i < entries.length; i += CHUNK_SIZE) {
      const chunk = entries.slice(i, i + CHUNK_SIZE)
      // Pre-classify + pre-stat in parallel. Files that don't match a
      // media type get filtered out before we touch the DB at all.
      // Fast-path: if the in-memory index has a row with matching mtime
      // and size and the existing row needs no re-analysis, we skip the
      // fs.stat altogether and just check the cached row. The first
      // pass still stats everything; warm-cache rescans are near-free.
      const prepared = await Promise.all(chunk.map(async (p) => {
        try {
          const { type } = classifyMedia(p)
          if (!type) return { p, skip: true } as const
          const existing = existingIndex.get(p.toLowerCase())
          const st = await fs.stat(p)
          if (
            existing &&
            existing.mtimeMs === st.mtimeMs &&
            existing.size === st.size &&
            !needsAnalyze(existing)
          ) {
            // Hot path — file unchanged, already analyzed, thumb intact.
            return { p, skip: false, type, st, existing, fastPath: true } as const
          }
          return { p, skip: false, type, st, existing, fastPath: false } as const
        } catch (e) {
          console.warn(`[Scanner] Error preparing file: ${p}`, e)
          return { p, skip: true, error: true } as const
        }
      }))

      // Synchronous transaction over the prepared rows.
      db.raw.transaction(() => {
        for (const item of prepared) {
          if (item.skip) {
            skipped++
            continue
          }
          if (item.fastPath) {
            // No-op — DB row matches disk, no re-analysis needed.
            fastPathHits++
            processed++
            continue
          }
          try {
            upsertOneSync(db, item.p, item.type, item.st, item.existing ?? null)
            processed++
          } catch (e) {
            console.warn(`[Scanner] Error processing file: ${item.p}`, e)
          }
        }
      })()
    }

    console.log(`[Scanner] Completed: ${processed} media files (${fastPathHits} unchanged, fast-path), ${skipped} non-media files skipped`)
  } finally {
    scanningDirs.delete(normalizedDir)
  }
}

/**
 * Synchronous upsert path used by scanFolder's batched transaction loop.
 * Same semantics as upsertOne but assumes type + stat have been resolved
 * by the caller. Stays inside a single transaction.
 */
function upsertOneSync(
  db: DB,
  filePath: string,
  type: 'video' | 'image' | 'gif',
  st: { mtimeMs: number; size: number },
  preloadedExisting: ReturnType<DB['listAllMediaForScan']>[number] | null,
): void {
  const { ext } = classifyMedia(filePath)
  // Use the pre-loaded row when the scanner supplied it (warm-cache
  // path). Fall back to a single SELECT for upsertOne's one-off callers
  // (file watcher, single-file imports).
  const existing = preloadedExisting ?? db.getMediaByPath(filePath)

  if (existing && existing.mtimeMs === st.mtimeMs && existing.size === st.size) {
    if (needsAnalyze(existing)) {
      if (existing.thumbPath && !thumbExists(existing.thumbPath)) {
        db.clearThumbPath(existing.id)
      }
      enqueueAnalyze(db, {
        mediaId: existing.id,
        path: filePath,
        type,
        mtimeMs: st.mtimeMs,
        size: st.size,
      })
    }
    return
  }

  const filename = path.basename(filePath)
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
    phash: existing?.phash ?? null,
  })

  // #298 — if the triage inbox is enabled AND this row is freshly
  // created (no `existing`), park it in 'pending' so the user reviews
  // before it shows up in the main library. No-op when toggle is off
  // or when the row is just being touched/re-scanned.
  if (!existing) {
    try {
      const { getSettings } = require('./settings') as { getSettings: () => any }
      if (getSettings()?.triageInboxEnabled) {
        ;(db as any).raw?.prepare?.(`UPDATE media SET triage_status = 'pending' WHERE id = ?`).run(row.id)
      }
    } catch { /* settings module not loaded yet — default 'active' is fine */ }
  }

  enqueueAnalyze(db, {
    mediaId: row.id,
    path: filePath,
    type,
    mtimeMs: st.mtimeMs,
    size: st.size,
  })
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