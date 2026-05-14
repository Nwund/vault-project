// File: src/main/services/bulk-rename.ts
//
// Bulk rename engine — mnamer-style template DSL with dry-run preview.
// Vault has scattered rename logic in various places; this is the
// canonical single-template-with-conflict-resolution path.
//
// Template syntax: {field} placeholders, optionally with format
// specifiers. Supported fields:
//
//   {title}        AI-suggested or approved title (falls back to filename)
//   {filename}     raw filename minus extension
//   {ext}          extension WITH the dot (".mp4")
//   {studio}       performer:STUDIO tag value, if present
//   {performers}   comma-joined "performer:NAME" tag names (cap 3, "et al" suffix)
//   {performer}    first performer (alias for convenience)
//   {date}         addedAt as YYYY-MM-DD
//   {year}         addedAt year
//   {month}        2-digit month
//   {day}          2-digit day
//   {tags}         comma-joined non-performer tags (cap 5)
//   {duration}     "Hh Mm" formatted duration
//   {durationsec}  raw seconds
//   {width}        pixel width
//   {height}       pixel height
//   {resolution}   "1080p", "720p", "4K", "2160p", or "WxH" fallback
//   {rating}       0-5 star count rendered as "★★★"
//   {oCount}       o-count integer
//   {viewCount}    view count integer
//
// Format specifiers: {field|truncate(40)} caps the value to 40 chars,
//                    {field|lower}, {field|upper}, {field|slug} apply
//                    case/slug transforms. Multiple chained with |.
//
// Path separators in the template create subdirectories. Empty values
// collapse to "" (so `{studio}/{title}` becomes `Untitled.mp4` when
// no studio is set rather than `/Untitled.mp4`).
//
// Conflict resolution: dry-run reports collisions; apply path appends
// _2 / _3 / etc. when the target already exists.

import fs from 'node:fs'
import path from 'node:path'
import type { DB } from '../db'
import { parseFilename } from './ai-intelligence/filename-tokenizer'

export interface RenamePreviewRow {
  mediaId: string
  fromPath: string
  toPath: string
  /** True when the computed target already exists on disk (collision). */
  collision: boolean
  /** True when toPath is unchanged from fromPath (no-op). */
  noop: boolean
  /** True when template expansion produced an empty filename. */
  empty: boolean
  /** Errors during expansion (e.g. invalid chars after expansion). */
  error?: string
}

export interface RenameApplyResult {
  applied: number
  skippedNoop: number
  skippedCollision: number
  skippedEmpty: number
  failed: number
  errors: string[]
}

const SAFE_CHARS = /[<>:"|?*\x00-\x1f]/g  // Windows-forbidden + control
const TEMPLATE_RE = /\{([a-z_]+)(\|[a-z0-9_|()]+)?\}/gi

/** Apply a format specifier chain like "lower|truncate(40)|slug". */
function applyFormatters(value: string, spec: string): string {
  const chain = spec.replace(/^\|/, '').split('|').map((s) => s.trim()).filter(Boolean)
  let out = value
  for (const f of chain) {
    const m = /^([a-z_]+)(?:\(([^)]*)\))?$/i.exec(f)
    if (!m) continue
    const fn = m[1].toLowerCase()
    const arg = m[2] ?? ''
    switch (fn) {
      case 'lower': out = out.toLowerCase(); break
      case 'upper': out = out.toUpperCase(); break
      case 'truncate': {
        const n = parseInt(arg, 10)
        if (!isNaN(n) && n > 0 && out.length > n) out = out.slice(0, n).trim()
        break
      }
      case 'slug':
        out = out.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
        break
      case 'capitalize':
        out = out.charAt(0).toUpperCase() + out.slice(1)
        break
      case 'title':
        out = out.replace(/\b\w/g, (c) => c.toUpperCase())
        break
    }
  }
  return out
}

/** Render a {resolution} string from width/height. */
function renderResolution(w: number | null, h: number | null): string {
  if (!h || h <= 0) return ''
  if (h >= 2160) return '4K'
  if (h >= 1440) return '1440p'
  if (h >= 1080) return '1080p'
  if (h >= 720) return '720p'
  if (h >= 480) return '480p'
  if (h >= 360) return '360p'
  if (w && h) return `${w}x${h}`
  return ''
}

function renderDuration(sec: number | null): string {
  if (!sec || sec <= 0) return ''
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

interface FieldBag {
  title?: string
  filename: string
  ext: string
  studio?: string
  performers: string[]
  date?: string
  year?: string
  month?: string
  day?: string
  tags: string[]
  duration?: string
  durationsec?: string
  width?: string
  height?: string
  resolution?: string
  rating?: string
  oCount?: string
  viewCount?: string
}

function pickValue(bag: FieldBag, field: string): string {
  switch (field.toLowerCase()) {
    case 'title':       return bag.title ?? ''
    case 'filename':    return bag.filename
    case 'ext':         return bag.ext
    case 'studio':      return bag.studio ?? ''
    case 'performer':   return bag.performers[0] ?? ''
    case 'performers':  {
      if (bag.performers.length === 0) return ''
      if (bag.performers.length <= 3) return bag.performers.join(', ')
      return bag.performers.slice(0, 3).join(', ') + ' et al'
    }
    case 'date':        return bag.date ?? ''
    case 'year':        return bag.year ?? ''
    case 'month':       return bag.month ?? ''
    case 'day':         return bag.day ?? ''
    case 'tags':        return bag.tags.slice(0, 5).join(', ')
    case 'duration':    return bag.duration ?? ''
    case 'durationsec': return bag.durationsec ?? ''
    case 'width':       return bag.width ?? ''
    case 'height':      return bag.height ?? ''
    case 'resolution':  return bag.resolution ?? ''
    case 'rating':      return bag.rating ?? ''
    case 'ocount':      return bag.oCount ?? ''
    case 'viewcount':   return bag.viewCount ?? ''
    default:            return ''
  }
}

function buildFieldBag(db: DB, mediaId: string): FieldBag | null {
  let media: any
  try { media = (db as any).getMedia?.(mediaId) } catch { /* ignore */ }
  if (!media) return null

  // Tags + extract performer / studio prefixes.
  let tagRows: Array<{ name: string }> = []
  try { tagRows = (db as any).listTagsForMedia?.(mediaId) ?? [] } catch { /* ignore */ }
  const performers: string[] = []
  let studio = ''
  const otherTags: string[] = []
  for (const r of tagRows) {
    const n = r.name
    if (n.startsWith('performer:')) performers.push(n.slice('performer:'.length))
    else if (n.startsWith('studio:')) studio = n.slice('studio:'.length)
    else otherTags.push(n)
  }

  // AI title + description.
  let title = ''
  try {
    const row = (db as any).raw?.prepare?.(`
      SELECT COALESCE(approved_title, suggested_title) AS title
      FROM ai_analysis_results
      WHERE media_id = ?
    `).get(mediaId) as { title: string | null } | undefined
    if (row?.title) title = row.title
  } catch { /* ignore */ }
  if (!title) title = media.filename ? media.filename.replace(/\.[^.]+$/, '') : ''

  const ext = media.ext ? (media.ext.startsWith('.') ? media.ext : `.${media.ext}`) : path.extname(media.path)
  const filename = (media.filename ?? '').replace(/\.[^.]+$/, '')

  const ratingStars = typeof media.rating === 'number' ? '★'.repeat(Math.max(0, Math.min(5, Math.round(media.rating)))) : ''
  const addedDate = typeof media.addedAt === 'number' ? new Date(media.addedAt) : null

  // Parse the filename for structured fallback values. Used only when
  // the DB doesn't have a direct equivalent (e.g. no performer: tags,
  // no studio: tag, no recorded date). Keeps the template usable on
  // un-tagged media without forcing the user to run the tagger first.
  const parsed = parseFilename(media.filename ?? '')
  if (performers.length === 0 && parsed.performers.length > 0) {
    performers.push(...parsed.performers)
  }
  if (!studio && parsed.studio) studio = parsed.studio
  const fallbackDate = parsed.date
  const fallbackYear = parsed.year != null ? String(parsed.year) : undefined

  return {
    title,
    filename,
    ext,
    studio,
    performers,
    date: fallbackDate ?? (addedDate ? addedDate.toISOString().slice(0, 10) : undefined),
    year: fallbackYear ?? (addedDate ? String(addedDate.getFullYear()) : undefined),
    month: fallbackDate
      ? fallbackDate.slice(5, 7)
      : addedDate ? String(addedDate.getMonth() + 1).padStart(2, '0') : undefined,
    day: fallbackDate
      ? fallbackDate.slice(8, 10)
      : addedDate ? String(addedDate.getDate()).padStart(2, '0') : undefined,
    tags: otherTags,
    duration: renderDuration(media.durationSec),
    durationsec: media.durationSec ? String(Math.round(media.durationSec)) : '',
    width: media.width ? String(media.width) : '',
    height: media.height ? String(media.height) : '',
    resolution: renderResolution(media.width, media.height) || (parsed.resolution ?? ''),
    rating: ratingStars,
    oCount: typeof media.oCount === 'number' ? String(media.oCount) : '',
    viewCount: typeof media.viewCount === 'number' ? String(media.viewCount) : '',
  }
}

function expandTemplate(template: string, bag: FieldBag): string {
  // Each path segment can contain placeholders. Expand inside, then
  // sanitize each segment for the filesystem.
  return template.replace(TEMPLATE_RE, (_match, field: string, formatSpec: string | undefined) => {
    let value = pickValue(bag, field)
    if (formatSpec) value = applyFormatters(value, formatSpec)
    return value
  })
}

function sanitizePathSegment(seg: string): string {
  return seg.replace(SAFE_CHARS, '').replace(/\s+/g, ' ').replace(/[. ]+$/g, '').trim()
}

/**
 * Dry-run a bulk rename. Returns one row per input media id with the
 * proposed new path + collision/noop flags. No filesystem changes.
 */
export function previewBulkRename(
  db: DB,
  mediaIds: string[],
  template: string
): RenamePreviewRow[] {
  const rows: RenamePreviewRow[] = []
  for (const id of mediaIds) {
    const bag = buildFieldBag(db, id)
    if (!bag) {
      rows.push({ mediaId: id, fromPath: '', toPath: '', collision: false, noop: false, empty: true, error: 'media not found' })
      continue
    }
    // Get the original full path so we can compute target dir.
    let media: any
    try { media = (db as any).getMedia?.(id) } catch { /* ignore */ }
    if (!media?.path) {
      rows.push({ mediaId: id, fromPath: '', toPath: '', collision: false, noop: false, empty: true, error: 'no path on media row' })
      continue
    }

    const expanded = expandTemplate(template, bag)
    // Allow forward / back slashes as path separators.
    const parts = expanded.split(/[\\/]+/).map(sanitizePathSegment).filter(Boolean)
    if (parts.length === 0) {
      rows.push({ mediaId: id, fromPath: media.path, toPath: '', collision: false, noop: false, empty: true })
      continue
    }
    // Last segment is the filename; everything else is subdirs.
    // Append the original extension if the template didn't include one.
    let last = parts[parts.length - 1]
    if (!path.extname(last)) last = last + (bag.ext || '')
    parts[parts.length - 1] = last

    const baseDir = path.dirname(media.path)
    const target = path.join(baseDir, ...parts)
    const collision = target !== media.path && fs.existsSync(target)
    const noop = target === media.path
    rows.push({
      mediaId: id,
      fromPath: media.path,
      toPath: target,
      collision,
      noop,
      empty: false,
    })
  }
  return rows
}

/**
 * Apply a bulk rename. Re-runs the preview so the renderer can call
 * apply with just (mediaIds, template) and the result is authoritative.
 * Collisions get _2 / _3 suffixed.
 */
export function applyBulkRename(
  db: DB,
  mediaIds: string[],
  template: string
): RenameApplyResult {
  const preview = previewBulkRename(db, mediaIds, template)
  const result: RenameApplyResult = {
    applied: 0,
    skippedNoop: 0,
    skippedCollision: 0,
    skippedEmpty: 0,
    failed: 0,
    errors: [],
  }
  const updateStmt = (db as any).raw?.prepare?.(`UPDATE media SET path = ?, filename = ? WHERE id = ?`)
  if (!updateStmt) {
    result.failed = preview.length
    result.errors.push('db.update statement not available')
    return result
  }

  for (const r of preview) {
    if (r.empty) { result.skippedEmpty++; continue }
    if (r.noop) { result.skippedNoop++; continue }
    let target = r.toPath
    if (r.collision) {
      // Append _N until free.
      const ext = path.extname(target)
      const base = target.slice(0, target.length - ext.length)
      let n = 2
      while (fs.existsSync(`${base}_${n}${ext}`)) n++
      target = `${base}_${n}${ext}`
    }
    try {
      const targetDir = path.dirname(target)
      fs.mkdirSync(targetDir, { recursive: true })
      fs.renameSync(r.fromPath, target)
      updateStmt.run(target, path.basename(target), r.mediaId)
      result.applied++
    } catch (err: any) {
      result.failed++
      if (result.errors.length < 10) result.errors.push(`${r.mediaId}: ${err?.message ?? String(err)}`)
    }
  }
  return result
}
