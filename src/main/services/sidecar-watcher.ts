// File: src/main/services/sidecar-watcher.ts
//
// #323 E-99 — Sidecar-aware metadata watcher. Watches the library
// root(s) for *.xmp / *.nfo / *.stash.json sidecars and, when one
// appears or changes, reads it and applies the contained tags /
// performers / studio / title / description to the matching media
// row.
//
// Match by basename: <video>.mp4 ↔ <video>.mp4.xmp (or .xmp without
// the source ext). All three sidecar formats are supported via their
// existing import services (xmp-export's hierarchical parser, the
// .stash.json shape from stash-interop, and a minimal NFO parser).
//
// Debounced 1.5s per path — editors often rewrite sidecars in two
// passes.

import chokidar from 'chokidar'
import * as path from 'node:path'
import * as fs from 'node:fs'
import type { DB } from '../db'

export interface SidecarWatcherHandle {
  stop: () => Promise<void>
  addRoot: (root: string) => void
  removeRoot: (root: string) => void
  listRoots: () => string[]
}

const debounceMap = new Map<string, NodeJS.Timeout>()

function findMatchingMedia(db: DB, sidecarPath: string): { id: string; path: string } | null {
  // <video>.mp4.xmp → <video>.mp4   |   <video>.xmp → <video>.mp4 / .webm / …
  const candidates: string[] = []
  const dir = path.dirname(sidecarPath)
  const base = path.basename(sidecarPath)
  const stripped = base.replace(/\.(xmp|nfo|stash\.json)$/i, '')
  // Case 1: extension-preserving form (foo.mp4.xmp).
  candidates.push(path.join(dir, stripped))
  // Case 2: name-only form (foo.xmp → foo.mp4/foo.webm/…)
  const nameOnly = stripped.replace(/\.(mp4|mkv|webm|avi|mov|m4v|wmv|gif|webp|jpg|jpeg|png)$/i, '')
  if (nameOnly !== stripped) {
    for (const ext of ['.mp4', '.mkv', '.webm', '.mov', '.m4v', '.gif', '.webp', '.jpg', '.jpeg', '.png']) {
      candidates.push(path.join(dir, `${nameOnly}${ext}`))
    }
  } else {
    for (const ext of ['.mp4', '.mkv', '.webm', '.mov', '.m4v', '.gif', '.webp', '.jpg', '.jpeg', '.png']) {
      candidates.push(path.join(dir, `${stripped}${ext}`))
    }
  }
  for (const candidate of candidates) {
    const found = db.raw.prepare(`SELECT id, path FROM media WHERE path = ? LIMIT 1`).get(candidate) as { id: string; path: string } | undefined
    if (found) return found
  }
  return null
}

async function applyXmp(db: DB, mediaId: string, sidecarPath: string): Promise<void> {
  // Re-use exiftool to read the XMP — gives us the same field shape
  // we'd write via writeMetadata.
  const { readMetadata } = await import('./exif-sidecar')
  let tags: Record<string, any>
  try { tags = await readMetadata(sidecarPath) as any } catch { return }
  const subject: string[] = []
  if (Array.isArray(tags.Subject)) subject.push(...tags.Subject)
  else if (typeof tags.Subject === 'string') subject.push(tags.Subject)
  if (Array.isArray(tags.HierarchicalSubject)) {
    for (const h of tags.HierarchicalSubject) {
      // "performer|Jane Doe" → "performer:jane doe"
      const parts = String(h).split('|')
      if (parts.length === 2) subject.push(`${parts[0].toLowerCase()}:${parts[1].toLowerCase()}`)
    }
  }
  for (const t of subject) {
    try { db.addTagToMedia(mediaId, String(t).trim().toLowerCase()) } catch { /* ignore */ }
  }
  if (typeof tags.Title === 'string' && tags.Title.trim()) {
    try { db.raw.prepare(`UPDATE media SET title = COALESCE(title, ?) WHERE id = ?`).run(tags.Title, mediaId) } catch { /* ignore */ }
  }
  if (typeof tags.Description === 'string' && tags.Description.trim()) {
    try { db.raw.prepare(`UPDATE media SET description = COALESCE(description, ?) WHERE id = ?`).run(tags.Description, mediaId) } catch { /* ignore */ }
  }
}

async function applyStash(db: DB, mediaId: string, sidecarPath: string): Promise<void> {
  try {
    const raw = fs.readFileSync(sidecarPath, 'utf8')
    const j = JSON.parse(raw)
    if (Array.isArray(j.tags)) {
      for (const t of j.tags) {
        try { db.addTagToMedia(mediaId, String(t).trim().toLowerCase()) } catch { /* ignore */ }
      }
    }
    if (Array.isArray(j.performers)) {
      for (const p of j.performers) {
        try { db.addTagToMedia(mediaId, `performer:${String(p).trim().toLowerCase()}`) } catch { /* ignore */ }
      }
    }
    if (typeof j.studio === 'string' && j.studio.trim()) {
      try { db.addTagToMedia(mediaId, `studio:${j.studio.trim().toLowerCase()}`) } catch { /* ignore */ }
    }
  } catch { /* ignore */ }
}

async function applyNfo(db: DB, mediaId: string, sidecarPath: string): Promise<void> {
  try {
    const raw = fs.readFileSync(sidecarPath, 'utf8')
    const tagMatches = [...raw.matchAll(/<tag>([^<]+)<\/tag>/g)].map((m) => m[1].trim())
    const actorMatches = [...raw.matchAll(/<actor>\s*<name>([^<]+)<\/name>/g)].map((m) => m[1].trim())
    const studioMatch = /<studio>([^<]+)<\/studio>/.exec(raw)
    for (const t of tagMatches) {
      try { db.addTagToMedia(mediaId, t.toLowerCase()) } catch { /* ignore */ }
    }
    for (const a of actorMatches) {
      try { db.addTagToMedia(mediaId, `performer:${a.toLowerCase()}`) } catch { /* ignore */ }
    }
    if (studioMatch) {
      try { db.addTagToMedia(mediaId, `studio:${studioMatch[1].trim().toLowerCase()}`) } catch { /* ignore */ }
    }
  } catch { /* ignore */ }
}

function handleSidecar(db: DB, sidecarPath: string): void {
  const prev = debounceMap.get(sidecarPath)
  if (prev) clearTimeout(prev)
  debounceMap.set(sidecarPath, setTimeout(async () => {
    debounceMap.delete(sidecarPath)
    const media = findMatchingMedia(db, sidecarPath)
    if (!media) return
    if (sidecarPath.endsWith('.xmp')) await applyXmp(db, media.id, sidecarPath)
    else if (sidecarPath.endsWith('.stash.json')) await applyStash(db, media.id, sidecarPath)
    else if (sidecarPath.endsWith('.nfo')) await applyNfo(db, media.id, sidecarPath)
  }, 1500))
}

export function startSidecarWatcher(db: DB, initialRoots: string[]): SidecarWatcherHandle {
  const roots = new Set<string>(initialRoots)
  const watcher = chokidar.watch([...roots], {
    ignored: /(^|[\\/])\../,
    ignoreInitial: true,
    persistent: true,
    awaitWriteFinish: { stabilityThreshold: 800, pollInterval: 200 },
  })
  const onChange = (p: string) => {
    if (/\.xmp$|\.nfo$|\.stash\.json$/i.test(p)) handleSidecar(db, p)
  }
  watcher.on('add', onChange).on('change', onChange)
  return {
    stop: async () => {
      try { await watcher.close() } catch { /* ignore */ }
    },
    addRoot: (root: string) => {
      if (roots.has(root)) return
      roots.add(root); watcher.add(root)
    },
    removeRoot: (root: string) => {
      if (!roots.has(root)) return
      roots.delete(root); watcher.unwatch(root)
    },
    listRoots: () => [...roots],
  }
}
