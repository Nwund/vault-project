// File: src/main/services/color-palette.ts
//
// #286 D-62 — Eagle-style color palette indexer. For each media row
// with a thumbnail, extracts a 6-swatch palette via node-vibrant
// (vibrant / muted / vibrant-dark / muted-dark / vibrant-light /
// muted-light) and stores it as JSON in a new media_palettes table.
//
// Query API: filterByColor(rgb, tolerance) — returns media IDs whose
// palette contains a swatch within `tolerance` ΔE of the requested
// RGB. Tolerance is a simple Euclidean distance in RGB (0..441);
// 40-80 is a useful range for "this color".

import * as fs from 'node:fs'
import type { DB } from '../db'

export interface Swatch {
  /** "Vibrant" / "Muted" / etc. */
  name: string
  rgb: [number, number, number]
  population: number
}

export interface Palette {
  mediaId: string
  swatches: Swatch[]
  /** sha256 of the thumb path used — invalidation when thumb regenerates. */
  thumbSig: string
}

function ensureSchema(db: DB): void {
  db.raw.exec(`
    CREATE TABLE IF NOT EXISTS media_palettes (
      media_id TEXT PRIMARY KEY,
      thumb_sig TEXT NOT NULL,
      swatches TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_media_palettes_updated ON media_palettes(updated_at);
  `)
}

function thumbSig(thumbPath: string): string {
  try {
    const st = fs.statSync(thumbPath)
    return `${st.size}:${Math.floor(st.mtimeMs)}`
  } catch { return '' }
}

export async function extractPalette(thumbPath: string): Promise<Swatch[] | null> {
  if (!fs.existsSync(thumbPath)) return null
  const mod = await import('node-vibrant/node')
  const Vibrant = (mod as any).Vibrant
  try {
    const palette = await Vibrant.from(thumbPath).getPalette()
    const out: Swatch[] = []
    for (const name of ['Vibrant', 'Muted', 'DarkVibrant', 'DarkMuted', 'LightVibrant', 'LightMuted']) {
      const s = (palette as any)[name]
      if (s && s.rgb) {
        out.push({
          name,
          rgb: [Math.round(s.rgb[0]), Math.round(s.rgb[1]), Math.round(s.rgb[2])],
          population: s._population ?? s.population ?? 0,
        })
      }
    }
    return out
  } catch {
    return null
  }
}

export async function indexPalette(db: DB, mediaId: string): Promise<boolean> {
  ensureSchema(db)
  const row = db.raw.prepare(`SELECT thumbPath FROM media WHERE id = ?`).get(mediaId) as { thumbPath: string | null } | undefined
  if (!row?.thumbPath) return false
  const sig = thumbSig(row.thumbPath)
  if (!sig) return false
  const existing = db.raw.prepare(`SELECT thumb_sig FROM media_palettes WHERE media_id = ?`).get(mediaId) as { thumb_sig: string } | undefined
  if (existing?.thumb_sig === sig) return true  // up-to-date
  const swatches = await extractPalette(row.thumbPath)
  if (!swatches) return false
  db.raw.prepare(`
    INSERT INTO media_palettes (media_id, thumb_sig, swatches, updated_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(media_id) DO UPDATE SET thumb_sig = excluded.thumb_sig, swatches = excluded.swatches, updated_at = excluded.updated_at
  `).run(mediaId, sig, JSON.stringify(swatches), Date.now())
  return true
}

export async function indexAllPalettes(db: DB, onProgress?: (done: number, total: number) => void): Promise<{ indexed: number; skipped: number; failed: number }> {
  ensureSchema(db)
  const rows = db.raw.prepare(`SELECT id FROM media WHERE thumbPath IS NOT NULL`).all() as Array<{ id: string }>
  let indexed = 0, skipped = 0, failed = 0
  for (let i = 0; i < rows.length; i++) {
    const ok = await indexPalette(db, rows[i].id)
    if (ok) indexed++; else failed++
    if (onProgress && (i + 1) % 25 === 0) onProgress(i + 1, rows.length)
  }
  if (onProgress) onProgress(rows.length, rows.length)
  return { indexed, skipped, failed }
}

function colorDistance(a: [number, number, number], b: [number, number, number]): number {
  // Simple Euclidean in RGB; fast and good enough for "this color"
  // bucketing. CIEDE2000 would be more perceptually accurate but
  // overkill for a swatch picker.
  const dr = a[0] - b[0], dg = a[1] - b[1], db_ = a[2] - b[2]
  return Math.sqrt(dr * dr + dg * dg + db_ * db_)
}

export function filterByColor(db: DB, rgb: [number, number, number], tolerance = 60, limit = 200): string[] {
  ensureSchema(db)
  const all = db.raw.prepare(`SELECT media_id, swatches FROM media_palettes`).all() as Array<{ media_id: string; swatches: string }>
  const hits: Array<{ id: string; minDist: number }> = []
  for (const row of all) {
    let palette: Swatch[]
    try { palette = JSON.parse(row.swatches) } catch { continue }
    let minDist = Infinity
    for (const sw of palette) {
      const d = colorDistance(sw.rgb, rgb)
      if (d < minDist) minDist = d
    }
    if (minDist <= tolerance) hits.push({ id: row.media_id, minDist })
  }
  hits.sort((a, b) => a.minDist - b.minDist)
  return hits.slice(0, limit).map((h) => h.id)
}

export function getPalette(db: DB, mediaId: string): Swatch[] | null {
  ensureSchema(db)
  const row = db.raw.prepare(`SELECT swatches FROM media_palettes WHERE media_id = ?`).get(mediaId) as { swatches: string } | undefined
  if (!row) return null
  try { return JSON.parse(row.swatches) as Swatch[] } catch { return null }
}
