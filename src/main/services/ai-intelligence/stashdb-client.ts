// File: src/main/services/ai-intelligence/stashdb-client.ts
//
// StashDB GraphQL client. StashDB is the community metadata DB that
// Stash uses; it hosts curated performer + scene + studio data with
// stricter editorial quality than TpDB. We use it as a SECONDARY
// metadata source — falls back via scene-metadata-router when TpDB
// doesn't have a match — and as a face-cluster bootstrap source
// (#24, paired with the existing TpDB importer).
//
// Auth: API key via `ApiKey` header (no Bearer prefix). Free with
// account; rate-limited but generous enough for personal use.
//
// Settings: settings.ai.stashdbApiKey (encrypted via safeStorage,
// same pattern as Venice / TpDB).
//
// GraphQL endpoint: https://stashdb.org/graphql

import https from 'node:https'

const STASHDB_HOST = 'stashdb.org'
const STASHDB_PATH = '/graphql'
const TIMEOUT_MS = 12_000

export interface StashDBPerformer {
  id: string
  name: string
  disambiguation: string | null
  gender: string | null
  birth_date: string | null
  career_start_year: number | null
  career_end_year: number | null
  height: number | null
  images: Array<{ id: string; url: string; width: number; height: number }>
  aliases: string[]
  urls: Array<{ url: string; site?: { name: string } }>
}

export interface StashDBScene {
  id: string
  title: string
  details: string | null
  date: string | null
  duration: number | null
  urls: Array<{ url: string; site?: { name: string } }>
  studio: { id: string; name: string; parent?: { name: string } | null } | null
  performers: Array<{
    performer: { id: string; name: string; aliases: string[] }
  }>
  tags: Array<{ id: string; name: string }>
  images: Array<{ url: string; width: number; height: number }>
}

interface GraphQLResponse<T> {
  data?: T
  errors?: Array<{ message: string; path?: string[] }>
}

function gql<T>(apiKey: string, query: string, variables: Record<string, any> = {}): Promise<T> {
  return new Promise((resolve, reject) => {
    const payload = Buffer.from(JSON.stringify({ query, variables }), 'utf8')
    const req = https.request({
      hostname: STASHDB_HOST,
      port: 443,
      path: STASHDB_PATH,
      method: 'POST',
      headers: {
        ApiKey: apiKey,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'Content-Length': payload.length,
      },
      timeout: TIMEOUT_MS,
    }, (res) => {
      const chunks: Buffer[] = []
      res.on('data', (c) => chunks.push(c))
      res.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf8')
        if (!res.statusCode || res.statusCode >= 400) {
          reject(new Error(`StashDB ${res.statusCode}: ${body.slice(0, 200)}`))
          return
        }
        try {
          const parsed = JSON.parse(body) as GraphQLResponse<T>
          if (parsed.errors && parsed.errors.length > 0) {
            reject(new Error(`StashDB GraphQL: ${parsed.errors.map((e) => e.message).join('; ')}`))
            return
          }
          if (!parsed.data) {
            reject(new Error('StashDB returned no data'))
            return
          }
          resolve(parsed.data)
        } catch (err: any) {
          reject(new Error(`StashDB returned non-JSON: ${body.slice(0, 200)}`))
        }
      })
    })
    req.on('error', reject)
    req.on('timeout', () => { try { req.destroy() } catch { /* ignore */ }; reject(new Error('StashDB timeout')) })
    req.write(payload)
    req.end()
  })
}

export class StashDBClient {
  constructor(private apiKey: string) {}

  /** Health probe — fetches a single performer page; succeeds when
   *  auth passes even if the result is empty. */
  async health(): Promise<boolean> {
    try {
      await gql<{ queryPerformers: { performers: any[] } }>(this.apiKey, `
        query Health { queryPerformers(input: { page: 1, per_page: 1 }) { performers { id } } }
      `)
      return true
    } catch {
      return false
    }
  }

  /** Search performers by name. Includes aliases — searching "mia
   *  khalifa" still matches the canonical record. */
  async searchPerformers(name: string, perPage = 5): Promise<StashDBPerformer[]> {
    if (!name.trim()) return []
    const data = await gql<{ queryPerformers: { performers: StashDBPerformer[] } }>(this.apiKey, `
      query SearchPerformers($name: String!, $per: Int!) {
        queryPerformers(input: { name: $name, page: 1, per_page: $per }) {
          performers {
            id
            name
            disambiguation
            gender
            birth_date
            career_start_year
            career_end_year
            height
            aliases
            images { id url width height }
            urls { url site { name } }
          }
        }
      }
    `, { name: name.trim(), per: Math.max(1, Math.min(25, perPage)) })
    return data.queryPerformers.performers ?? []
  }

  /** Get full performer detail (including image set). */
  async getPerformer(id: string): Promise<StashDBPerformer | null> {
    try {
      const data = await gql<{ findPerformer: StashDBPerformer | null }>(this.apiKey, `
        query GetPerformer($id: ID!) {
          findPerformer(id: $id) {
            id
            name
            disambiguation
            gender
            birth_date
            career_start_year
            career_end_year
            height
            aliases
            images { id url width height }
            urls { url site { name } }
          }
        }
      `, { id })
      return data.findPerformer ?? null
    } catch (err) {
      console.warn('[StashDB] getPerformer failed:', err)
      return null
    }
  }

  /** Extract image URLs from a performer record. Same shape as TpDB
   *  client's getPerformerImageUrls for caller compatibility. */
  async getPerformerImageUrls(performerId: string): Promise<string[]> {
    const detail = await this.getPerformer(performerId)
    if (!detail) return []
    const out = new Set<string>()
    for (const img of detail.images ?? []) {
      if (img.url && /^https?:\/\//.test(img.url)) out.add(img.url)
    }
    return Array.from(out)
  }

  /** Look up a scene by fingerprint hash. StashDB supports
   *  algorithm-tagged hashes: phash / md5 / oshash. */
  async findSceneByHash(
    hash: string,
    algorithm: 'PHASH' | 'MD5' | 'OSHASH' = 'PHASH'
  ): Promise<StashDBScene | null> {
    try {
      const data = await gql<{ findSceneByFingerprint: StashDBScene | null }>(this.apiKey, `
        query FindByHash($hash: String!, $algo: FingerprintAlgorithm!) {
          findSceneByFingerprint(fingerprint: { hash: $hash, algorithm: $algo }) {
            id
            title
            details
            date
            duration
            urls { url site { name } }
            studio { id name parent { name } }
            performers { performer { id name aliases } }
            tags { id name }
            images { url width height }
          }
        }
      `, { hash, algo: algorithm })
      return data.findSceneByFingerprint ?? null
    } catch (err) {
      console.warn('[StashDB] findSceneByHash failed:', err)
      return null
    }
  }

  /** Free-text scene search. */
  async searchScenes(query: string, perPage = 10): Promise<StashDBScene[]> {
    if (!query.trim()) return []
    try {
      const data = await gql<{ queryScenes: { scenes: StashDBScene[] } }>(this.apiKey, `
        query SearchScenes($text: String!, $per: Int!) {
          queryScenes(input: { text: $text, page: 1, per_page: $per }) {
            scenes {
              id title details date duration
              urls { url site { name } }
              studio { id name parent { name } }
              performers { performer { id name aliases } }
              tags { id name }
              images { url width height }
            }
          }
        }
      `, { text: query.trim(), per: Math.max(1, Math.min(50, perPage)) })
      return data.queryScenes.scenes ?? []
    } catch (err) {
      console.warn('[StashDB] searchScenes failed:', err)
      return []
    }
  }
}

let cachedClient: StashDBClient | null = null
let cachedKeyEnding = ''

export async function getStashDBClient(): Promise<StashDBClient | null> {
  const { getSettings } = await import('../../settings')
  const { decryptString } = await import('../secure-storage')
  const stored = ((getSettings().ai as any)?.stashdbApiKey ?? '') as string
  const plain = decryptString(stored)
  if (!plain) return null
  const ending = plain.slice(-6)
  if (cachedKeyEnding !== ending) {
    cachedClient = new StashDBClient(plain)
    cachedKeyEnding = ending
  }
  return cachedClient
}
