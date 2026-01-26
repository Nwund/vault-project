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
  // Priority: videos first
  const priority = payload.type === 'video' ? 10 : 5
  db.enqueueJob('media:analyze', payload, priority)
}

export async function scanAndUpsertAll(db: DB, mediaDir: string): Promise<void> {
  await fs.mkdir(mediaDir, { recursive: true })
  const entries = await fg(['**/*.*'], {
    cwd: mediaDir,
    dot: false,
    onlyFiles: true,
    absolute: true,
    suppressErrors: true
  })

  for (const p of entries) {
    // eslint-disable-next-line no-await-in-loop
    await upsertOne(db, p)
  }
}

export async function upsertOne(db: DB, filePath: string): Promise<void> {
  const { type, ext } = classifyMedia(filePath)
  if (!type) return

  const st = await fs.stat(filePath)
  const existing = db.getMediaByPath(filePath)

  // If unchanged but missing analysis/thumb, enqueue and return quickly.
  if (existing && existing.mtimeMs === st.mtimeMs && existing.size === st.size) {
    if (needsAnalyze(existing)) {
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
 * Remove database entries for files that no longer exist on disk.
 * Called on startup to clean up stale entries.
 */
export function cleanupMissingFiles(db: DB): number {
  const allMedia = db.listAllMediaPaths()
  let removed = 0

  for (const { id, path: filePath } of allMedia) {
    if (!fsSync.existsSync(filePath)) {
      console.log('[Scanner] Removing missing file from DB:', filePath)
      db.deleteMediaById(id)
      removed++
    }
  }

  if (removed > 0) {
    console.log(`[Scanner] Cleaned up ${removed} missing file(s) from database`)
  }

  return removed
}