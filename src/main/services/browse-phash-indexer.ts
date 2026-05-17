// File: src/main/services/browse-phash-indexer.ts
//
// #208 — Background phash indexer for Browse-tab thumbnails.
//
// The original #111 implementation hashed thumbnails inline as cards
// rendered, which meant every Browse search hit 30+ external
// thumbnail URLs on every render. This version moves the work behind
// an in-process queue:
//
//   1. Renderer dispatches `browse:phash-enqueue(urls[])` after each
//      result render.
//   2. This service walks the queue at a low concurrency (3 fetchers),
//      downloads each thumbnail into memory, runs sharp aHash on it
//      (same 8x8 grayscale routine as visual-duplicates-service), and
//      stores `(url, phash, now)` in `browse_phash_cache`.
//   3. Renderer dispatches `browse:phash-find-similar(phash, maxDist)`
//      to check whether any local media.phash is within Hamming
//      distance ≤ N, and decorates the card with a "you have a copy"
//      badge if so.
//
// The cache is keyed by URL so subsequent search results with the
// same thumbnail (very common across booru sources) hit instantly.
//
// Concurrency stays low because remote thumbnail CDNs aggressively
// rate-limit; 3 inflight + a 30s timeout keeps us from melting any
// one host even with a 5000-result fan-out.

import type { DB } from '../db'

let _sharp: any | null = null
function getSharp(): any {
  if (_sharp) return _sharp
  try {
    _sharp = require('sharp')
  } catch (err) {
    console.warn('[BrowsePhash] sharp not available, indexer disabled:', err)
  }
  return _sharp
}

interface PhashRow {
  url: string
  phash: string
  fetched_at: number
}

const FETCH_CONCURRENCY = 3
const FETCH_TIMEOUT_MS = 30_000
// We pin the URL set so two simultaneous renders that include the
// same URL only fetch it once.
const inFlight = new Set<string>()

class BrowsePhashIndexer {
  private queue: string[] = []
  private running = 0
  private enabled = true

  constructor(private db: DB) {}

  setEnabled(on: boolean): void {
    this.enabled = on
    if (on) this.pumpQueue()
  }

  // Dedup and queue new URLs. Pre-filters out anything we've already
  // cached so callers can spam this cheaply.
  enqueue(urls: string[]): { queued: number; alreadyCached: number } {
    if (!this.enabled) return { queued: 0, alreadyCached: 0 }
    const cleaned = Array.from(new Set(urls.map((u) => u && u.trim()).filter((u) => !!u)))
    if (cleaned.length === 0) return { queued: 0, alreadyCached: 0 }

    // Bulk-check cache so we skip URLs we already have.
    const placeholders = cleaned.map(() => '?').join(',')
    const cached = this.db.raw.prepare(
      `SELECT url FROM browse_phash_cache WHERE url IN (${placeholders})`,
    ).all(...cleaned) as Array<{ url: string }>
    const cachedSet = new Set(cached.map((r) => r.url))

    let queued = 0
    for (const url of cleaned) {
      if (cachedSet.has(url)) continue
      if (inFlight.has(url)) continue
      if (this.queue.includes(url)) continue
      this.queue.push(url)
      queued++
    }
    this.pumpQueue()
    return { queued, alreadyCached: cachedSet.size }
  }

  // Cache-only lookup. Returns null for URLs not yet hashed; never
  // triggers a fetch (use enqueue first).
  lookup(urls: string[]): Record<string, string | null> {
    const result: Record<string, string | null> = {}
    if (urls.length === 0) return result
    const placeholders = urls.map(() => '?').join(',')
    const rows = this.db.raw.prepare(
      `SELECT url, phash FROM browse_phash_cache WHERE url IN (${placeholders})`,
    ).all(...urls) as PhashRow[]
    const map = new Map(rows.map((r) => [r.url, r.phash]))
    for (const url of urls) result[url] = map.get(url) ?? null
    return result
  }

  // For each candidate phash, find the closest media row (Hamming
  // distance ≤ maxDist). Returns null per candidate when no match.
  findSimilarLocal(phashes: string[], maxDist = 8): Record<string, { mediaId: string; distance: number } | null> {
    const out: Record<string, { mediaId: string; distance: number } | null> = {}
    if (phashes.length === 0) return out
    // Pull every non-null media.phash once and walk in JS — the table is
    // small enough (~thousands of entries typical) that the cost beats
    // an inner-loop SQL query per phash.
    const localRows = this.db.raw.prepare(
      `SELECT id, phash FROM media WHERE phash IS NOT NULL AND phash != ''`,
    ).all() as Array<{ id: string; phash: string }>
    for (const candidate of phashes) {
      if (!candidate || candidate.length !== 16) { out[candidate] = null; continue }
      let best: { mediaId: string; distance: number } | null = null
      for (const r of localRows) {
        if (!r.phash || r.phash.length !== 16) continue
        const d = hammingDistance(candidate, r.phash)
        if (d <= maxDist && (best === null || d < best.distance)) {
          best = { mediaId: r.id, distance: d }
          if (d === 0) break
        }
      }
      out[candidate] = best
    }
    return out
  }

  // Stats for a Library Health card / debug.
  getStats(): { cachedUrls: number; queueDepth: number; inFlight: number } {
    const count = this.db.raw.prepare(`SELECT COUNT(*) as c FROM browse_phash_cache`).get() as { c: number }
    return {
      cachedUrls: count.c,
      queueDepth: this.queue.length,
      inFlight: this.running,
    }
  }

  private pumpQueue(): void {
    if (!this.enabled) return
    while (this.running < FETCH_CONCURRENCY && this.queue.length > 0) {
      const url = this.queue.shift()!
      if (inFlight.has(url)) continue
      inFlight.add(url)
      this.running++
      this.processOne(url)
        .catch(() => { /* logged inside */ })
        .finally(() => {
          this.running--
          inFlight.delete(url)
          // Try to start another after every completion.
          this.pumpQueue()
        })
    }
  }

  private async processOne(url: string): Promise<void> {
    const sharp = getSharp()
    if (!sharp) return
    try {
      const ctrl = new AbortController()
      const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS)
      // Some booru CDNs reject when Referer == Vault's app:// origin;
      // we keep the request anonymous and rely on the network-layer
      // Referer overrides registered in main.ts.
      const res = await fetch(url, { signal: ctrl.signal })
      clearTimeout(timer)
      if (!res.ok) return
      const ab = await res.arrayBuffer()
      const phash = await this.computeAhash(Buffer.from(ab))
      if (!phash) return
      this.db.raw.prepare(`
        INSERT OR REPLACE INTO browse_phash_cache (url, phash, fetched_at)
        VALUES (?, ?, ?)
      `).run(url, phash, Date.now())
    } catch {
      // Single-URL failures are common (404, CORS, hotlinking) — we
      // swallow them rather than spamming the log.
    }
  }

  // 8x8 average-hash. Returns 16 hex chars (64-bit) compatible with
  // the format media.phash already uses.
  private async computeAhash(buf: Buffer): Promise<string | null> {
    const sharp = getSharp()
    if (!sharp) return null
    try {
      const raw = await sharp(buf, { failOnError: false })
        .resize(8, 8, { fit: 'fill', kernel: 'cubic' })
        .grayscale()
        .raw()
        .toBuffer()
      if (raw.length !== 64) return null
      let sum = 0
      for (let i = 0; i < 64; i++) sum += raw[i]
      const mean = sum / 64
      let high = 0
      let low = 0
      for (let i = 0; i < 64; i++) {
        const bit = raw[i] >= mean ? 1 : 0
        if (i < 32) high = (high << 1) | bit
        else low = (low << 1) | bit
      }
      return (high >>> 0).toString(16).padStart(8, '0') + (low >>> 0).toString(16).padStart(8, '0')
    } catch {
      return null
    }
  }
}

function hammingDistance(a: string, b: string): number {
  if (a.length !== 16 || b.length !== 16) return 64
  let dist = 0
  for (let i = 0; i < 16; i++) {
    const xa = parseInt(a[i], 16)
    const xb = parseInt(b[i], 16)
    let diff = xa ^ xb
    while (diff) { dist += diff & 1; diff >>>= 1 }
  }
  return dist
}

let _instance: BrowsePhashIndexer | null = null
export function getBrowsePhashIndexer(db: DB): BrowsePhashIndexer {
  if (!_instance) _instance = new BrowsePhashIndexer(db)
  return _instance
}
