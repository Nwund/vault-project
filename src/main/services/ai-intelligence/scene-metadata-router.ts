// File: src/main/services/ai-intelligence/scene-metadata-router.ts
//
// Multi-source scene metadata router. Inspired by mdcx's
// (Movie_Data_Capture) fallback-chain philosophy: try each source in
// priority order until one returns a confident match, normalize the
// result into Vault's canonical SceneMetadata shape, and return it.
//
// Vault's primary source is ThePornDB (TpDB). This module wraps it
// behind a generic interface so we can plug in additional sources
// later (StashDB GraphQL, FansDB scrapers, custom mdcx sidecars)
// without changing every call site.
//
// Sources currently registered:
//   - tpdb (Vault's existing client) — phash hash lookup + free-text
//
// Sources registered as stubs (await wiring):
//   - stashdb     — needs OAuth flow; #39
//   - fansdb-yaml — needs YAML scraper interpreter; #83
//   - javdb       — JAV scraping; not yet implemented
//
// Each source implements the SceneSource interface. The router calls
// them in registration order (priority), returns the first hit with a
// confidence score above MIN_CONFIDENCE.

import type { TpDBScene } from './tpdb-client'

export interface SceneMetadata {
  /** Canonical title — porn-site style, not Movie database style. */
  title: string
  /** Free-form scene description / plot. */
  description: string | null
  /** YYYY-MM-DD release date. */
  releaseDate: string | null
  /** Duration in seconds. */
  durationSec: number | null
  /** Source URL on the metadata provider. */
  sourceUrl: string | null
  /** Lowercase studio name as the user would tag it. */
  studio: string | null
  /** Parent network / family if known. */
  network: string | null
  /** Lowercase performer names. */
  performers: string[]
  /** Tag names (already lowercased; canonical-tags normalization
   *  applied by the source adapter). */
  tags: string[]
  /** Which source this came from. */
  sourceName: string
  /** Source's own id for the scene (TpDB UUID, StashDB ID, etc.). */
  sourceId: string
  /** Confidence the router has that this is a correct match.
   *  Hash matches → 0.95; first-tier text match → 0.7; lower-tier → 0.5. */
  confidence: number
}

export interface SceneLookupContext {
  /** Filename (with extension) — used for text-based lookups. */
  filename?: string
  /** Suggested title from filename parser. */
  title?: string
  /** pHash / oshash / md5 fingerprint — preferred when present. */
  hash?: string
  /** Hash type for sources that distinguish (TpDB accepts phash/oshash). */
  hashType?: 'phash' | 'oshash' | 'md5' | 'sha256' | 'crc32'
  /** Pre-existing performer names from the user's tags. */
  knownPerformers?: string[]
  /** Pre-existing studio name from filename parsing or user tag. */
  knownStudio?: string
}

export interface SceneSource {
  name: string
  /** Is this source configured + reachable right now? */
  isAvailable(): Promise<boolean>
  /** Look up a scene. Returns null when no confident match found. */
  lookup(ctx: SceneLookupContext): Promise<SceneMetadata | null>
}

const MIN_CONFIDENCE = 0.5

// ─── TpDB adapter ──────────────────────────────────────────────────

class TpDBSource implements SceneSource {
  name = 'tpdb'
  private client: any | null = null

  async getClient(): Promise<any | null> {
    if (this.client) return this.client
    try {
      const { getSettings } = await import('../../settings')
      const enc = (getSettings().ai as any)?.tpdbApiKey
      if (!enc) return null
      const { decryptString } = await import('../secure-storage')
      const key = decryptString(enc) || enc  // tolerate plaintext for dev
      if (!key) return null
      const { TpDBClient } = await import('./tpdb-client')
      this.client = new TpDBClient(key)
      return this.client
    } catch {
      return null
    }
  }

  async isAvailable(): Promise<boolean> {
    return (await this.getClient()) !== null
  }

  async lookup(ctx: SceneLookupContext): Promise<SceneMetadata | null> {
    const client = await this.getClient()
    if (!client) return null

    // Phase 1: hash lookup is most authoritative.
    if (ctx.hash) {
      try {
        const hit: TpDBScene | null = await client.findByHash(ctx.hash)
        if (hit) return this.normalize(hit, 0.95)
      } catch (err) {
        console.warn('[SceneRouter:tpdb] hash lookup failed:', err)
      }
    }

    // Phase 2: free-text search using best available query string.
    const query = (ctx.title || ctx.filename || '').trim()
    if (!query) return null
    try {
      const results: TpDBScene[] = await client.searchScenes(query, 5)
      if (results.length === 0) return null
      // Pick the best result by title overlap with the query.
      const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
      const queryTokens = new Set(norm(query).split(/\s+/).filter(Boolean))
      let best: TpDBScene | null = null
      let bestScore = 0
      for (const r of results) {
        const titleTokens = new Set(norm(r.title || '').split(/\s+/).filter(Boolean))
        let overlap = 0
        for (const t of titleTokens) if (queryTokens.has(t)) overlap++
        const ratio = titleTokens.size > 0 ? overlap / titleTokens.size : 0
        if (ratio > bestScore) { bestScore = ratio; best = r }
      }
      if (!best || bestScore < 0.3) return null
      // Confidence scales with title overlap, capped at 0.75 for text.
      return this.normalize(best, Math.min(0.75, 0.5 + bestScore * 0.5))
    } catch (err) {
      console.warn('[SceneRouter:tpdb] text search failed:', err)
      return null
    }
  }

  private normalize(scene: TpDBScene, confidence: number): SceneMetadata {
    return {
      title: scene.title ?? 'Untitled Scene',
      description: scene.description ?? null,
      releaseDate: scene.date ?? null,
      durationSec: scene.duration ?? null,
      sourceUrl: scene.url ?? null,
      studio: scene.site?.name?.toLowerCase() ?? null,
      network: scene.site?.short_name?.toLowerCase() ?? null,
      performers: (scene.performers ?? []).map((p) => p.name.toLowerCase()),
      tags: (scene.tags ?? []).map((t) => t.name.toLowerCase()),
      sourceName: this.name,
      sourceId: scene.id,
      confidence,
    }
  }
}

// ─── Stash DB adapter ─────────────────────────────────────────────

class StashDBSource implements SceneSource {
  name = 'stashdb'
  private client: any | null = null

  async getClient(): Promise<any | null> {
    if (this.client) return this.client
    try {
      const { getStashDBClient } = await import('./stashdb-client')
      this.client = await getStashDBClient()
      return this.client
    } catch {
      return null
    }
  }

  async isAvailable(): Promise<boolean> {
    return (await this.getClient()) !== null
  }

  async lookup(ctx: SceneLookupContext): Promise<SceneMetadata | null> {
    const client = await this.getClient()
    if (!client) return null

    // Hash lookup first — StashDB indexes phash / md5 / oshash.
    if (ctx.hash) {
      const algo = (ctx.hashType?.toUpperCase() ?? 'PHASH') as 'PHASH' | 'MD5' | 'OSHASH'
      try {
        const hit = await client.findSceneByHash(ctx.hash, algo)
        if (hit) return this.normalize(hit, 0.95)
      } catch (err) {
        console.warn('[SceneRouter:stashdb] hash lookup failed:', err)
      }
    }

    const query = (ctx.title || ctx.filename || '').trim()
    if (!query) return null
    try {
      const results = await client.searchScenes(query, 5)
      if (results.length === 0) return null
      const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
      const queryTokens = new Set(norm(query).split(/\s+/).filter(Boolean))
      let best: any | null = null
      let bestScore = 0
      for (const r of results) {
        const titleTokens = new Set(norm(r.title || '').split(/\s+/).filter(Boolean))
        let overlap = 0
        for (const t of titleTokens) if (queryTokens.has(t)) overlap++
        const ratio = titleTokens.size > 0 ? overlap / titleTokens.size : 0
        if (ratio > bestScore) { bestScore = ratio; best = r }
      }
      if (!best || bestScore < 0.3) return null
      return this.normalize(best, Math.min(0.8, 0.55 + bestScore * 0.5))
    } catch (err) {
      console.warn('[SceneRouter:stashdb] text search failed:', err)
      return null
    }
  }

  private normalize(scene: any, confidence: number): SceneMetadata {
    return {
      title: scene.title ?? 'Untitled Scene',
      description: scene.details ?? null,
      releaseDate: scene.date ?? null,
      durationSec: scene.duration ?? null,
      sourceUrl: scene.urls?.[0]?.url ?? null,
      studio: scene.studio?.name?.toLowerCase() ?? null,
      network: scene.studio?.parent?.name?.toLowerCase() ?? null,
      performers: (scene.performers ?? []).map((p: any) => p?.performer?.name?.toLowerCase()).filter(Boolean),
      tags: (scene.tags ?? []).map((t: any) => t.name.toLowerCase()),
      sourceName: this.name,
      sourceId: scene.id,
      confidence,
    }
  }
}

// ─── FansDB YAML scraper adapter stub ─────────────────────────────

class FansDBSource implements SceneSource {
  name = 'fansdb-yaml'
  async isAvailable(): Promise<boolean> {
    // Pending #83 — needs YAML scraper interpreter.
    return false
  }
  async lookup(_ctx: SceneLookupContext): Promise<SceneMetadata | null> {
    return null
  }
}

// ─── Router ────────────────────────────────────────────────────────

let SOURCES: SceneSource[] | null = null

function getSources(): SceneSource[] {
  if (!SOURCES) {
    // Priority order — first match wins (above MIN_CONFIDENCE).
    SOURCES = [
      new TpDBSource(),
      new StashDBSource(),
      new FansDBSource(),
    ]
  }
  return SOURCES
}

export interface SceneLookupResult {
  match: SceneMetadata | null
  /** Which sources were attempted, in order. */
  attempted: string[]
  /** Sources skipped because they weren't configured / available. */
  skipped: string[]
}

/**
 * Try each source in priority order and return the FIRST hit above
 * MIN_CONFIDENCE. Skipped sources show up in the result so the caller
 * can suggest "configure StashDB to improve metadata coverage" etc.
 */
export async function lookupSceneMetadata(
  ctx: SceneLookupContext
): Promise<SceneLookupResult> {
  const attempted: string[] = []
  const skipped: string[] = []
  for (const src of getSources()) {
    let available = false
    try { available = await src.isAvailable() } catch { /* skip */ }
    if (!available) {
      skipped.push(src.name)
      continue
    }
    attempted.push(src.name)
    try {
      const match = await src.lookup(ctx)
      if (match && match.confidence >= MIN_CONFIDENCE) {
        return { match, attempted, skipped }
      }
    } catch (err) {
      console.warn(`[SceneRouter:${src.name}] lookup failed:`, err)
    }
  }
  return { match: null, attempted, skipped }
}

/** Diagnostic — list configured sources + availability state. */
export async function listSceneSources(): Promise<Array<{ name: string; available: boolean }>> {
  const out: Array<{ name: string; available: boolean }> = []
  for (const src of getSources()) {
    let available = false
    try { available = await src.isAvailable() } catch { /* default false */ }
    out.push({ name: src.name, available })
  }
  return out
}
