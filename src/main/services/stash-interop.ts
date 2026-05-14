// File: src/main/services/stash-interop.ts
//
// Stash interop. Stash (https://stashapp.cc) is a popular self-hosted
// adult media organizer. Many Vault users also run Stash; this module
// lets them flip between tools without losing tags / performers /
// studios.
//
// Two modes:
//   1. SIDECAR JSON — Stash writes a `.stash.json` file next to each
//      video describing the scene. We can read and apply its tags +
//      performers (mapped to Vault's "performer:NAME" tags) + studio.
//   2. EXPORT — write Stash-compatible JSON for each Vault media item
//      so a Stash instance can ingest the user's tagged library.
//
// Format reference: github.com/stashapp/stash → graphql/schema/types/scene.graphql
// We use the simplified scrape/export shape, not the GraphQL schema.

import fs from 'node:fs'
import path from 'node:path'
import type { DB } from '../db'

/** Stash's sidecar scene representation (simplified). */
export interface StashScene {
  title?: string | null
  details?: string | null
  date?: string | null
  rating100?: number | null
  studio?: { name: string } | null
  performers?: Array<{ name: string; gender?: string }>
  tags?: Array<{ name: string }>
  url?: string | null
}

export interface ImportResult {
  importedTags: number
  importedPerformerTags: number
  setTitle: boolean
  setDescription: boolean
  setStudio: boolean
}

/**
 * Read a `<videoFile>.stash.json` sidecar and apply its metadata to
 * the matching Vault media row. Performers get prefixed with
 * "performer:" so they're searchable but don't collide with regular
 * tag names. Studio becomes a "studio:STUDIO_NAME" tag.
 */
export function importStashSidecar(
  db: DB,
  mediaId: string,
  videoFilePath: string
): ImportResult | null {
  // Try a few sidecar locations Stash uses.
  const candidates = [
    `${videoFilePath}.stash.json`,
    videoFilePath.replace(/\.[^.]+$/, '.stash.json'),
    path.join(path.dirname(videoFilePath), `${path.basename(videoFilePath, path.extname(videoFilePath))}.json`),
  ]
  let sidecarPath: string | null = null
  for (const c of candidates) {
    if (fs.existsSync(c)) { sidecarPath = c; break }
  }
  if (!sidecarPath) return null

  let scene: StashScene
  try {
    const raw = fs.readFileSync(sidecarPath, 'utf8')
    scene = JSON.parse(raw) as StashScene
  } catch (err) {
    console.warn('[StashInterop] Failed to parse sidecar:', sidecarPath, err)
    return null
  }

  const result: ImportResult = {
    importedTags: 0,
    importedPerformerTags: 0,
    setTitle: false,
    setDescription: false,
    setStudio: false,
  }

  if (scene.title) {
    try {
      ;(db as any).setMediaTitle?.(mediaId, scene.title)
      result.setTitle = true
    } catch { /* ignore */ }
  }
  if (scene.details) {
    try {
      ;(db as any).setMediaDescription?.(mediaId, scene.details)
      result.setDescription = true
    } catch { /* ignore */ }
  }

  const tagsToApply: string[] = []
  for (const t of scene.tags ?? []) {
    if (t?.name) tagsToApply.push(t.name)
  }
  for (const p of scene.performers ?? []) {
    if (p?.name) tagsToApply.push(`performer:${p.name}`)
  }
  if (scene.studio?.name) {
    tagsToApply.push(`studio:${scene.studio.name}`)
    result.setStudio = true
  }

  for (const tag of tagsToApply) {
    try {
      ;(db as any).addTagToMedia?.(mediaId, tag)
      if (tag.startsWith('performer:')) result.importedPerformerTags += 1
      else result.importedTags += 1
    } catch { /* ignore */ }
  }
  return result
}

/**
 * Build a Stash-compatible scene JSON for a single Vault media item.
 * Caller decides where to write it (alongside the media file vs into
 * an export bundle). Tags with the "performer:" prefix are converted
 * back to Stash's performers array; "studio:" becomes the studio
 * object. Everything else stays as tags.
 */
export function exportToStashFormat(
  db: DB,
  mediaId: string
): StashScene | null {
  let media: any
  try {
    media = (db as any).getMedia?.(mediaId)
  } catch {
    return null
  }
  if (!media) return null

  const tags: Array<{ name: string }> = []
  const performers: Array<{ name: string }> = []
  let studio: { name: string } | null = null

  let rows: Array<{ name: string }> = []
  try {
    rows = (db as any).listTagsForMedia?.(mediaId) ?? []
  } catch { /* ignore */ }
  for (const r of rows) {
    const n = r.name
    if (n.startsWith('performer:')) {
      performers.push({ name: n.slice('performer:'.length) })
    } else if (n.startsWith('studio:')) {
      studio = { name: n.slice('studio:'.length) }
    } else {
      tags.push({ name: n })
    }
  }

  return {
    title: media.title ?? media.filename ?? null,
    details: media.description ?? null,
    date: media.addedAt ?? null,
    rating100: typeof media.rating === 'number' ? media.rating * 20 : null,  // Vault uses 0-5, Stash 0-100
    studio,
    performers,
    tags,
    url: null,
  }
}
