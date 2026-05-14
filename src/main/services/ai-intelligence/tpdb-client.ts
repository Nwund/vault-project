// File: src/main/services/ai-intelligence/tpdb-client.ts
//
// ThePornDB (TpDB) API client. TpDB hosts a curated metadata database
// of commercial adult scenes — search by phash / oshash / filename /
// performer / studio and get back exact scene info (title, performers,
// studio, release date, tags, description).
//
// Auth: Bearer token via Authorization header. Key auto-loads from
// settings.ai.tpdbApiKey (encrypted) or C:\dev\.api-keys.env on
// first run (same pattern as Venice).
//
// API base: https://api.theporndb.net (per TpDB docs).
//
// Practical use in Vault: BEFORE running expensive Tier 2 Venice
// analysis, hash the video and ask TpDB. If matched, skip Venice —
// the metadata is already canonical. Massive cost reduction on
// commercial content.

import https from 'node:https'

const TPDB_HOST = 'api.theporndb.net'
const TIMEOUT_MS = 10_000

export interface TpDBScene {
  id: string
  title: string
  description: string | null
  date: string | null
  duration: number | null
  url: string | null
  site: { name: string; short_name?: string | null } | null
  performers: Array<{
    id: string
    name: string
    gender?: string | null
    image?: string | null
  }>
  tags: Array<{ id?: string | number; name: string }>
  hashes?: Array<{ hash: string; type: string }>
}

export interface TpDBSearchResult {
  data: TpDBScene[]
  meta?: { total?: number; per_page?: number }
}

function request<T>(
  apiKey: string,
  apiPath: string,
  method: 'GET' | 'POST' = 'GET',
  body?: any
): Promise<T> {
  return new Promise((resolve, reject) => {
    const payload = body ? Buffer.from(JSON.stringify(body), 'utf8') : null
    const req = https.request(
      {
        hostname: TPDB_HOST,
        port: 443,
        path: apiPath,
        method,
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Accept: 'application/json',
          ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': payload.length } : {}),
        },
        timeout: TIMEOUT_MS,
      },
      (res) => {
        const chunks: Buffer[] = []
        res.on('data', (c: Buffer) => chunks.push(c))
        res.on('end', () => {
          const data = Buffer.concat(chunks).toString('utf8')
          if (!res.statusCode || res.statusCode >= 400) {
            reject(new Error(`TpDB ${apiPath} → ${res.statusCode}: ${data.slice(0, 200)}`))
            return
          }
          try {
            resolve(JSON.parse(data) as T)
          } catch (err) {
            reject(new Error(`TpDB ${apiPath} returned non-JSON: ${data.slice(0, 200)}`))
          }
        })
      }
    )
    req.on('error', reject)
    req.on('timeout', () => req.destroy(new Error(`TpDB ${apiPath} timed out`)))
    if (payload) req.write(payload)
    req.end()
  })
}

export class TpDBClient {
  constructor(private apiKey: string) {}

  /**
   * Health probe — checks the auth credentials are accepted.
   *
   * TpDB's API has reorganized routes over time. Different
   * generations of their token format hit different endpoints:
   *   - JWT-style tokens: /user/me works
   *   - API key tokens:   /user/me sometimes 404s; /scenes is the
   *                       universal fallback (succeeds with any
   *                       valid auth even for empty queries)
   * We try both so the probe doesn't false-fail on valid keys.
   */
  async health(): Promise<boolean> {
    const detail = await this.healthDetailed()
    return detail.ok
  }

  /**
   * Same as health() but returns the failure reason so callers can
   * surface a helpful message instead of a generic "API check failed".
   */
  async healthDetailed(): Promise<{ ok: boolean; reason?: string; endpoint?: string }> {
    let lastErr: unknown = null
    try {
      await request<any>(this.apiKey, '/user/me')
      return { ok: true, endpoint: '/user/me' }
    } catch (err) {
      lastErr = err
    }
    try {
      await request<any>(this.apiKey, '/scenes?q=test&per_page=1')
      return { ok: true, endpoint: '/scenes' }
    } catch (err) {
      lastErr = err
    }
    try {
      // Last fallback — performers list. Some keys are scoped only to
      // a subset of TpDB's endpoints.
      await request<any>(this.apiKey, '/performers?q=test&per_page=1')
      return { ok: true, endpoint: '/performers' }
    } catch (err) {
      lastErr = err
    }
    const msg = lastErr instanceof Error ? lastErr.message : String(lastErr)
    return { ok: false, reason: msg }
  }

  /** Search for a scene by free-text query (matches title, performer,
   *  filename, hash). Returns up to `perPage` results. */
  async searchScenes(query: string, perPage = 5): Promise<TpDBScene[]> {
    if (!query.trim()) return []
    const q = encodeURIComponent(query.trim())
    const result = await request<TpDBSearchResult>(
      this.apiKey,
      `/scenes?q=${q}&per_page=${perPage}`
    )
    return result.data ?? []
  }

  /** Look up a scene by a perceptual hash (phash/oshash). Returns the
   *  first match or null. */
  async findByHash(hash: string): Promise<TpDBScene | null> {
    const result = await request<TpDBSearchResult>(
      this.apiKey,
      `/scenes/hash/${encodeURIComponent(hash)}`
    )
    return result.data?.[0] ?? null
  }

  /** Search performers by name. Returns the array of matching
   *  performer objects (id, name, bio, images, measurements, etc.). */
  async searchPerformers(query: string, perPage = 10): Promise<any[]> {
    if (!query.trim()) return []
    const q = encodeURIComponent(query.trim())
    const result = await request<{ data?: any[] }>(
      this.apiKey,
      `/performers?q=${q}&per_page=${perPage}`
    )
    return result.data ?? []
  }

  /** Fetch full performer detail by id. */
  async getPerformer(id: string): Promise<any | null> {
    try {
      const result = await request<{ data?: any }>(
        this.apiKey,
        `/performers/${encodeURIComponent(id)}`
      )
      return result.data ?? null
    } catch (err) {
      console.warn('[TpDB] getPerformer failed:', err)
      return null
    }
  }

  /**
   * Scenes featuring a specific performer. Used by the watchlist
   * poller (#56) and by the "discover more from this performer" UI.
   *
   * Filters by `dateFromUnix` (release-date floor) when supplied so
   * the poller only sees NEW scenes since its last poll.
   */
  async searchScenesByPerformer(
    performerName: string,
    options?: { perPage?: number; dateFromUnix?: number }
  ): Promise<TpDBScene[]> {
    const name = performerName.trim()
    if (!name) return []
    const perPage = Math.max(1, Math.min(100, options?.perPage ?? 50))
    // TpDB's /scenes endpoint accepts a `q` free-text query and a
    // `performer` filter; we pass both for resilience (older API
    // generations honored one but not the other).
    const params = [
      `q=${encodeURIComponent(name)}`,
      `performer=${encodeURIComponent(name)}`,
      `per_page=${perPage}`,
      `sort=date`, `order=desc`,
    ]
    let result: TpDBSearchResult
    try {
      result = await request<TpDBSearchResult>(this.apiKey, `/scenes?${params.join('&')}`)
    } catch (err) {
      console.warn('[TpDB] searchScenesByPerformer failed:', err)
      return []
    }
    let scenes = result.data ?? []
    if (options?.dateFromUnix) {
      const floor = options.dateFromUnix
      scenes = scenes.filter((s) => {
        if (!s.date) return true  // keep undated scenes (rare; better
                                   // to surface as potential match than drop)
        const t = Date.parse(s.date)
        return !isFinite(t) || (t / 1000) >= floor
      })
    }
    return scenes
  }

  /**
   * Fetch the photo URLs TpDB has for a performer. Used by #23 (the
   * "auto-populate face cluster from TpDB photos" feature). Returns
   * an empty array on failure.
   *
   * TpDB's performer response shape varies by API generation:
   *   - Modern:  performer.posters[].url  + performer.image.url
   *   - Legacy:  performer.image (string URL)
   * We normalize both into a flat URL list.
   */
  async getPerformerImageUrls(performerId: string): Promise<string[]> {
    const detail = await this.getPerformer(performerId)
    if (!detail) return []
    const out: string[] = []
    const push = (v: any) => {
      if (typeof v === 'string' && /^https?:\/\//.test(v)) out.push(v)
    }
    push(detail.image)
    push(detail.image?.url)
    if (Array.isArray(detail.posters)) {
      for (const p of detail.posters) {
        push(p?.url)
        push(p?.poster)
        push(p)
      }
    }
    if (Array.isArray(detail.faces)) {
      for (const f of detail.faces) {
        push(f?.url)
        push(f?.face)
        push(f)
      }
    }
    if (Array.isArray(detail.images)) {
      for (const i of detail.images) {
        push(i?.url)
        push(i)
      }
    }
    // Dedupe while preserving order.
    return Array.from(new Set(out))
  }
}

let cachedClient: TpDBClient | null = null
let cachedKeyEnding = ''

/** Get a singleton client for the currently-configured TpDB key.
 *  Returns null if no key is configured. Callers should re-fetch on
 *  each request — cheap, and the key may rotate. */
export async function getTpDBClient(): Promise<TpDBClient | null> {
  const { getSettings } = await import('../../settings')
  const { decryptString } = await import('../secure-storage')
  const stored = ((getSettings().ai as any)?.tpdbApiKey ?? '') as string
  const plain = decryptString(stored)
  if (!plain) return null
  // Recreate when the key actually changed (cheap pointer compare on
  // the tail — full string compare would be fine too).
  const ending = plain.slice(-6)
  if (cachedKeyEnding !== ending) {
    cachedClient = new TpDBClient(plain)
    cachedKeyEnding = ending
  }
  return cachedClient
}
