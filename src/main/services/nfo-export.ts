// File: src/main/services/nfo-export.ts
//
// Kodi/Jellyfin/Emby NFO sidecar writer. Tools in that ecosystem read
// a `<basename>.nfo` XML file next to each media file to populate
// metadata without re-scraping. Format is loosely standardized — we
// follow the tinyMediaManager / Kodi movie schema which all three
// players accept.
//
// Vault writes its own canonical metadata (title, tags, performers,
// studio, rating, year) into the NFO. The user can then open the same
// library in Kodi/Jellyfin/Emby without losing tagging work.
//
// Export is per-media (write one sidecar) or bulk (walk the library).
// Files are written next to the source video, mirroring the .stash.json
// convention Vault already uses.

import fs from 'node:fs'
import path from 'node:path'
import type { DB } from '../db'

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/** Build an NFO XML string for one media row + its tags/performers/studio. */
export function buildNfoXml(args: {
  title: string
  plot?: string | null
  year?: number | null
  premiered?: string | null   // YYYY-MM-DD
  rating?: number | null      // 0-10 scale (Kodi convention)
  tags: string[]
  performers: string[]        // mapped to <actor><name>X</name></actor>
  studio?: string | null
  durationSec?: number | null
  width?: number | null
  height?: number | null
}): string {
  const lines: string[] = []
  lines.push('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>')
  lines.push('<movie>')
  lines.push(`  <title>${escapeXml(args.title)}</title>`)
  lines.push(`  <originaltitle>${escapeXml(args.title)}</originaltitle>`)
  if (args.plot) lines.push(`  <plot>${escapeXml(args.plot)}</plot>`)
  if (args.year != null) lines.push(`  <year>${args.year}</year>`)
  if (args.premiered) lines.push(`  <premiered>${escapeXml(args.premiered)}</premiered>`)
  if (args.rating != null) lines.push(`  <rating>${args.rating.toFixed(1)}</rating>`)
  if (args.studio) lines.push(`  <studio>${escapeXml(args.studio)}</studio>`)
  for (const tag of args.tags) {
    lines.push(`  <tag>${escapeXml(tag)}</tag>`)
    // Kodi also accepts <genre>...</genre>; mirror as genre so
    // category-based browse in Jellyfin lights up the genre carousel.
    lines.push(`  <genre>${escapeXml(tag)}</genre>`)
  }
  for (const performer of args.performers) {
    lines.push('  <actor>')
    lines.push(`    <name>${escapeXml(performer)}</name>`)
    lines.push('    <type>Actor</type>')
    lines.push('  </actor>')
  }
  if (args.durationSec) {
    lines.push('  <fileinfo>')
    lines.push('    <streamdetails>')
    lines.push('      <video>')
    lines.push(`        <durationinseconds>${Math.round(args.durationSec)}</durationinseconds>`)
    if (args.width) lines.push(`        <width>${args.width}</width>`)
    if (args.height) lines.push(`        <height>${args.height}</height>`)
    lines.push('      </video>')
    lines.push('    </streamdetails>')
    lines.push('  </fileinfo>')
  }
  lines.push('</movie>')
  return lines.join('\n')
}

/**
 * Export an NFO sidecar for a single media file. Writes
 * `<basename>.nfo` next to the source video. Skips silently if the
 * media row or source file is missing.
 */
export function exportNfoSidecar(db: DB, mediaId: string): { ok: boolean; path?: string; error?: string } {
  let media: any
  try { media = (db as any).getMedia?.(mediaId) } catch { /* ignore */ }
  if (!media || !media.path) return { ok: false, error: 'media row not found' }
  if (!fs.existsSync(media.path)) return { ok: false, error: 'source file missing' }

  let rows: Array<{ name: string }> = []
  try { rows = (db as any).listTagsForMedia?.(mediaId) ?? [] } catch { /* ignore */ }
  const tags: string[] = []
  const performers: string[] = []
  let studio: string | null = null
  for (const r of rows) {
    const n = r.name
    if (n.startsWith('performer:')) performers.push(n.slice('performer:'.length))
    else if (n.startsWith('studio:')) studio = n.slice('studio:'.length)
    else tags.push(n)
  }

  // Pull title/description from ai_analysis_results if present so the
  // NFO reflects the Tier 2 output, not just the filename.
  let title: string = media.filename ?? 'Untitled'
  let plot: string | null = null
  try {
    const row = (db as any).raw?.prepare?.(`
      SELECT COALESCE(approved_title, suggested_title) AS title, description
      FROM ai_analysis_results
      WHERE media_id = ?
    `).get(mediaId) as { title: string | null; description: string | null } | undefined
    if (row?.title) title = row.title
    if (row?.description) plot = row.description
  } catch { /* ignore — table may not exist on fresh DBs */ }

  const xml = buildNfoXml({
    title,
    plot,
    year: typeof media.addedAt === 'number' ? new Date(media.addedAt).getFullYear() : null,
    premiered: typeof media.addedAt === 'number'
      ? new Date(media.addedAt).toISOString().slice(0, 10)
      : null,
    rating: typeof media.rating === 'number' ? media.rating * 2 : null,  // Vault 0-5 → NFO 0-10
    tags,
    performers,
    studio,
    durationSec: media.durationSec,
    width: media.width,
    height: media.height,
  })

  const nfoPath = media.path.replace(/\.[^.]+$/, '') + '.nfo'
  try {
    fs.writeFileSync(nfoPath, xml + '\n', 'utf8')
    return { ok: true, path: nfoPath }
  } catch (err: any) {
    return { ok: false, error: err?.message ?? String(err) }
  }
}

/**
 * Bulk export — walks every media row and writes an NFO next to each.
 * Returns counts for the toast.
 */
export function exportAllNfoSidecars(db: DB): {
  scanned: number
  written: number
  failed: number
  skipped: number
  errors: string[]
} {
  let scanned = 0
  let written = 0
  let failed = 0
  let skipped = 0
  const errors: string[] = []

  let allMedia: Array<{ id: string }> = []
  try {
    allMedia = ((db as any).listMedia?.({ q: '', type: '', tag: '', limit: 1000000, offset: 0 }) ?? []) as any[]
  } catch { /* ignore */ }

  for (const m of allMedia) {
    scanned++
    const result = exportNfoSidecar(db, m.id)
    if (result.ok) written++
    else if (result.error === 'source file missing') skipped++
    else {
      failed++
      if (errors.length < 10) errors.push(`${m.id}: ${result.error}`)
    }
  }

  return { scanned, written, failed, skipped, errors }
}
