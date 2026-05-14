// File: src/main/services/xmp-export.ts
//
// XMP sidecar export — darktable / Lightroom / Immich compatibility.
// Writes `<basename>.xmp` next to each media file with Vault's tags,
// rating, and title/description in the standard XMP RDF/XML format.
//
// Why XMP alongside NFO + .stash.json:
//   - NFO: Kodi / Jellyfin / Emby (movie players)
//   - .stash.json: Stash (adult-media-specific)
//   - XMP: darktable / Lightroom / Immich (photo+video managers)
//
// Each sidecar is independent; the user picks which downstream tools
// they care about and exports accordingly.

import fs from 'node:fs'
import type { DB } from '../db'

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/**
 * Build an XMP XML document for a media row's tags + rating + title.
 * Uses the dublin core (dc:), xmp (xmp:), and digiKam (digiKam:) /
 * Lightroom (lr:) namespaces that downstream tools recognize.
 */
export function buildXmpXml(args: {
  title: string
  description?: string | null
  /** 0-5 star rating. */
  rating?: number | null
  tags: string[]
  performers: string[]
  studio?: string | null
  /** ISO 8601 date for xmp:CreateDate. */
  createDate?: string | null
}): string {
  // Combine performers as `Person|NAME` and studio as `Place|STUDIO`
  // following digiKam's hierarchical-keyword convention. Tools that
  // don't understand the pipe just treat them as flat keywords.
  const allKeywords: string[] = []
  for (const tag of args.tags) allKeywords.push(tag)
  for (const p of args.performers) allKeywords.push(`Person|${p}`)
  if (args.studio) allKeywords.push(`Place|${args.studio}`)

  const lines: string[] = []
  lines.push('<?xml version="1.0" encoding="UTF-8"?>')
  lines.push('<x:xmpmeta xmlns:x="adobe:ns:meta/">')
  lines.push('  <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"')
  lines.push('           xmlns:dc="http://purl.org/dc/elements/1.1/"')
  lines.push('           xmlns:xmp="http://ns.adobe.com/xap/1.0/"')
  lines.push('           xmlns:lr="http://ns.adobe.com/lightroom/1.0/"')
  lines.push('           xmlns:digiKam="http://www.digikam.org/ns/1.0/">')
  lines.push('    <rdf:Description rdf:about="">')

  // dc:title (alt-lang bag, x-default)
  lines.push('      <dc:title>')
  lines.push('        <rdf:Alt>')
  lines.push(`          <rdf:li xml:lang="x-default">${escapeXml(args.title)}</rdf:li>`)
  lines.push('        </rdf:Alt>')
  lines.push('      </dc:title>')

  if (args.description) {
    lines.push('      <dc:description>')
    lines.push('        <rdf:Alt>')
    lines.push(`          <rdf:li xml:lang="x-default">${escapeXml(args.description)}</rdf:li>`)
    lines.push('        </rdf:Alt>')
    lines.push('      </dc:description>')
  }

  // dc:subject — flat keyword bag (most tools index this)
  if (allKeywords.length > 0) {
    lines.push('      <dc:subject>')
    lines.push('        <rdf:Bag>')
    for (const kw of allKeywords) {
      lines.push(`          <rdf:li>${escapeXml(kw)}</rdf:li>`)
    }
    lines.push('        </rdf:Bag>')
    lines.push('      </dc:subject>')
  }

  // lr:hierarchicalSubject — Lightroom's hierarchical keyword bag.
  // Same content as dc:subject; some tools prefer this form.
  if (allKeywords.length > 0) {
    lines.push('      <lr:hierarchicalSubject>')
    lines.push('        <rdf:Bag>')
    for (const kw of allKeywords) {
      lines.push(`          <rdf:li>${escapeXml(kw)}</rdf:li>`)
    }
    lines.push('        </rdf:Bag>')
    lines.push('      </lr:hierarchicalSubject>')
  }

  // xmp:Rating — XMP standard 0-5 (-1 = rejected, but Vault doesn't expose that).
  if (typeof args.rating === 'number' && args.rating >= 0 && args.rating <= 5) {
    lines.push(`      <xmp:Rating>${Math.round(args.rating)}</xmp:Rating>`)
  }

  // xmp:CreateDate (when known).
  if (args.createDate) {
    lines.push(`      <xmp:CreateDate>${escapeXml(args.createDate)}</xmp:CreateDate>`)
  }

  // digiKam:TagsList — explicit hierarchical-keyword bag in digiKam's
  // namespace for tools that index that variant.
  if (allKeywords.length > 0) {
    lines.push('      <digiKam:TagsList>')
    lines.push('        <rdf:Seq>')
    for (const kw of allKeywords) {
      lines.push(`          <rdf:li>${escapeXml(kw)}</rdf:li>`)
    }
    lines.push('        </rdf:Seq>')
    lines.push('      </digiKam:TagsList>')
  }

  lines.push('    </rdf:Description>')
  lines.push('  </rdf:RDF>')
  lines.push('</x:xmpmeta>')
  return lines.join('\n')
}

export function exportXmpSidecar(db: DB, mediaId: string): { ok: boolean; path?: string; error?: string } {
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
    if (r.name.startsWith('performer:')) performers.push(r.name.slice('performer:'.length))
    else if (r.name.startsWith('studio:')) studio = r.name.slice('studio:'.length)
    else tags.push(r.name)
  }

  let title: string = (media.filename ?? 'Untitled').replace(/\.[^.]+$/, '')
  let description: string | null = null
  try {
    const row = (db as any).raw?.prepare?.(`
      SELECT COALESCE(approved_title, suggested_title) AS title, description
      FROM ai_analysis_results
      WHERE media_id = ?
    `).get(mediaId) as { title: string | null; description: string | null } | undefined
    if (row?.title) title = row.title
    if (row?.description) description = row.description
  } catch { /* table may not exist */ }

  const xml = buildXmpXml({
    title,
    description,
    rating: typeof media.rating === 'number' ? media.rating : null,
    tags,
    performers,
    studio,
    createDate: typeof media.addedAt === 'number' ? new Date(media.addedAt).toISOString() : null,
  })

  const xmpPath = media.path + '.xmp'
  try {
    fs.writeFileSync(xmpPath, xml + '\n', 'utf8')
    return { ok: true, path: xmpPath }
  } catch (err: any) {
    return { ok: false, error: err?.message ?? String(err) }
  }
}

export function exportAllXmpSidecars(db: DB): {
  scanned: number
  written: number
  failed: number
  skipped: number
  errors: string[]
} {
  let scanned = 0, written = 0, failed = 0, skipped = 0
  const errors: string[] = []
  let allMedia: Array<{ id: string }> = []
  try {
    allMedia = ((db as any).listMedia?.({ q: '', type: '', tag: '', limit: 1000000, offset: 0 }) ?? []) as any[]
  } catch { /* ignore */ }
  for (const m of allMedia) {
    scanned++
    const r = exportXmpSidecar(db, m.id)
    if (r.ok) written++
    else if (r.error === 'source file missing') skipped++
    else { failed++; if (errors.length < 10) errors.push(`${m.id}: ${r.error}`) }
  }
  return { scanned, written, failed, skipped, errors }
}
