// File: src/main/watcher.ts
import chokidar from 'chokidar'
import path from 'node:path'
import type { DB } from './db'
import { upsertOne } from './scanner'

// Normalize path for consistent comparison (Windows uses backslashes)
function normalizePath(p: string): string {
  return path.normalize(p)
}

export function startWatcher(db: DB, mediaDir: string, onChange?: () => void) {
  const watcher = chokidar.watch(mediaDir, {
    persistent: true,
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 800, pollInterval: 200 }
  })

  const bump = () => onChange?.()

  watcher.on('add', async (p) => {
    await upsertOne(db, normalizePath(p))
    bump()
  })

  watcher.on('change', async (p) => {
    await upsertOne(db, normalizePath(p))
    bump()
  })

  watcher.on('unlink', (p) => {
    const normalPath = normalizePath(p)
    console.log('[Watcher] File deleted:', normalPath)
    db.deleteMediaByPath(normalPath)
    bump()
  })

  watcher.on('error', (err) => {
    console.error('[Watcher] Error:', err)
  })

  return watcher
}