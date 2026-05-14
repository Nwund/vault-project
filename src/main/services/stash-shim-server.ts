// File: src/main/services/stash-shim-server.ts
//
// Stash plugin-API compatibility shim (#120). Exposes a small subset
// of Stash's GraphQL API so Stash plugins can read Vault's library
// without modification. Useful for the long tail of community Stash
// plugins (scrapers, organizers, viewers) that talk to Stash via
// GraphQL — they get a usable read-only surface from Vault.
//
// What we implement:
//   query findScene(id: ID!): Scene
//   query findSceneByFingerprint(input: {algorithm, hash}): Scene
//   query findScenes(filter: FindFilterType, scene_filter: SceneFilterType): FindScenesResultType
//   query allPerformers: [Performer]
//   query findPerformer(id: ID!): Performer
//   query allStudios: [Studio]
//   query findStudio(id: ID!): Studio
//   query allTags: [Tag]
//   query stats: StatsResultType
//   query version: Version
//
// What we DON'T implement:
//   - Mutations (no scan / metadata_auto_tag / metadata_clean — Vault
//     manages its own library lifecycle)
//   - Subscriptions
//   - Stream subscriptions
//   - Auth (the shim is read-only and binds to the LAN; user toggles
//     on/off explicitly via settings)
//
// Why a handwritten parser instead of pulling in graphql.js: the shim
// only needs to recognize a handful of operation names + their
// top-level field shapes. Plugins typically use stable query
// templates we can pattern-match. Saves ~600KB on the bundle.

import * as http from 'http'
import * as os from 'os'
import { URL } from 'url'

export interface StashShimConfig {
  port: number
}

const DEFAULT_CONFIG: StashShimConfig = { port: 9998 }

// ─── Library accessors ───────────────────────────────────────────
// Wired by ipc.ts so this module doesn't need direct DB access.

export interface StashShimAccessors {
  listScenes: (opts: { page: number; perPage: number; q?: string }) => Promise<{
    count: number
    scenes: Array<{
      id: string; title: string | null; details: string | null
      date: string | null; durationSec: number | null
      filePath: string; thumbPath: string | null
      width: number | null; height: number | null
      phash: string | null; sha256: string | null
      performers: string[]; tags: string[]; studio: string | null
    }>
  }>
  getScene: (id: string) => Promise<{
    id: string; title: string | null; details: string | null
    date: string | null; durationSec: number | null
    filePath: string; thumbPath: string | null
    width: number | null; height: number | null
    phash: string | null; sha256: string | null
    performers: string[]; tags: string[]; studio: string | null
  } | null>
  findSceneByHash: (algorithm: string, hash: string) => Promise<any | null>
  allPerformers: () => Promise<Array<{ id: string; name: string; sampleCount: number }>>
  findPerformer: (id: string) => Promise<{ id: string; name: string; sampleCount: number } | null>
  allStudios: () => Promise<Array<{ id: string; name: string }>>
  findStudio: (id: string) => Promise<{ id: string; name: string } | null>
  allTags: () => Promise<Array<{ id: string; name: string; count: number }>>
  stats: () => Promise<{
    scene_count: number
    studio_count: number
    performer_count: number
    tag_count: number
    total_duration: number
  }>
}

// ─── GraphQL request parser ──────────────────────────────────────

interface ParsedQuery {
  operation: string  // top-level field name, e.g. 'findScene'
  variables: Record<string, any>
  rawQuery: string
}

/**
 * Extract operation name + variables from a GraphQL request body.
 * Handles the typical `{operationName, query, variables}` shape Stash
 * plugins send. Falls back to regex-matching the top-level field in
 * the query string when operationName is omitted.
 */
function parseGraphQLRequest(body: any): ParsedQuery | null {
  if (!body || typeof body !== 'object') return null
  const query: string = String(body.query ?? '')
  const variables: Record<string, any> = body.variables ?? {}
  const opName: string = body.operationName ?? ''

  // Pull the first non-anonymous field name from the query body.
  // GraphQL queries look like:
  //   query QueryName { findScene(id: "1") { id title } }
  // or
  //   { findScene(id: "1") { id title } }
  const fieldMatch = /(?:^|\{|\bquery\b\s*\w*\s*\{)\s*(\w+)\s*[\(\{]/.exec(query)
  const op = fieldMatch?.[1] ?? opName ?? ''
  if (!op) return null

  return { operation: op, variables, rawQuery: query }
}

// ─── Resolvers ───────────────────────────────────────────────────

interface SceneShape {
  id: string
  title: string | null
  details: string | null
  date: string | null
  durationSec: number | null
  filePath: string
  thumbPath: string | null
  width: number | null
  height: number | null
  phash: string | null
  sha256: string | null
  performers: string[]
  tags: string[]
  studio: string | null
}

function sceneToStashShape(s: SceneShape, host: string): any {
  // Stash's Scene type. We map Vault → Stash field names.
  const screenshot = s.thumbPath ? `http://${host}/thumb/${encodeURIComponent(s.id)}.jpg` : ''
  const streamUrl = `http://${host}/video/${encodeURIComponent(s.id)}.mp4`
  return {
    id: s.id,
    title: s.title ?? '',
    details: s.details ?? '',
    date: s.date ?? '',
    rating: 0,
    rating100: 0,
    o_counter: 0,
    organized: false,
    interactive: false,
    paths: {
      screenshot,
      preview: screenshot,
      stream: streamUrl,
      webp: screenshot,
      vtt: '',
      sprite: '',
      funscript: '',
      interactive_heatmap: '',
      caption: '',
    },
    file: {
      size: 0,
      duration: s.durationSec ?? 0,
      video_codec: '',
      audio_codec: '',
      width: s.width ?? 0,
      height: s.height ?? 0,
      framerate: 0,
      bitrate: 0,
      mod_time: '',
    },
    files: [{
      id: s.id,
      path: s.filePath,
      basename: s.filePath.split(/[\\/]/).pop() ?? '',
      size: 0,
      duration: s.durationSec ?? 0,
      width: s.width ?? 0,
      height: s.height ?? 0,
      fingerprints: [
        s.phash ? { type: 'PHASH', value: s.phash } : null,
        s.sha256 ? { type: 'OSHASH', value: s.sha256 } : null,
      ].filter(Boolean),
    }],
    sha256: s.sha256 ?? '',
    oshash: s.sha256 ?? '',
    checksum: s.sha256 ?? '',
    phash: s.phash ?? '',
    performers: s.performers.map((name, i) => ({
      id: `vault-perf-${i}`,
      name,
      gender: 'FEMALE',
      image_path: '',
    })),
    studio: s.studio ? {
      id: `vault-studio-${s.studio.toLowerCase().replace(/\s+/g, '-')}`,
      name: s.studio,
      image_path: '',
    } : null,
    tags: s.tags.map((name, i) => ({
      id: `vault-tag-${i}`,
      name,
    })),
    stash_ids: [],
    galleries: [],
    movies: [],
    scene_markers: [],
    captions: [],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }
}

async function resolve(query: ParsedQuery, accessors: StashShimAccessors, host: string): Promise<any> {
  const op = query.operation
  const vars = query.variables ?? {}

  switch (op) {
    case 'version':
      return {
        data: {
          version: {
            version: 'vault-stash-shim/0.1',
            hash: '',
            build_time: new Date().toISOString(),
          },
        },
      }

    case 'stats':
    case 'getStats': {
      const s = await accessors.stats()
      return { data: { stats: s } }
    }

    case 'findScene':
    case 'getScene': {
      const id = String(vars.id ?? '')
      if (!id) return { data: { findScene: null } }
      const scene = await accessors.getScene(id)
      return { data: { findScene: scene ? sceneToStashShape(scene, host) : null } }
    }

    case 'findSceneByFingerprint':
    case 'findScenesByFingerprint': {
      const input = vars.input ?? vars.fingerprint ?? {}
      const algorithm = String(input.algorithm ?? input.type ?? 'PHASH').toUpperCase()
      const hash = String(input.hash ?? input.value ?? '')
      if (!hash) return { data: { findSceneByFingerprint: null } }
      const scene = await accessors.findSceneByHash(algorithm, hash)
      return { data: { findSceneByFingerprint: scene ? sceneToStashShape(scene, host) : null } }
    }

    case 'findScenes':
    case 'allScenes': {
      const filter = vars.filter ?? {}
      const sceneFilter = vars.scene_filter ?? {}
      void sceneFilter
      const page = Math.max(1, Number(filter.page ?? 1))
      const perPage = Math.max(1, Math.min(250, Number(filter.per_page ?? 40)))
      const q = filter.q ?? ''
      const result = await accessors.listScenes({ page, perPage, q })
      return {
        data: {
          findScenes: {
            count: result.count,
            scenes: result.scenes.map((s) => sceneToStashShape(s, host)),
          },
        },
      }
    }

    case 'allPerformers':
    case 'findPerformers': {
      const performers = await accessors.allPerformers()
      const mapped = performers.map((p) => ({
        id: p.id,
        name: p.name,
        gender: 'FEMALE',
        image_path: '',
        scene_count: p.sampleCount,
      }))
      // Both `allPerformers` (returns []) and `findPerformers`
      // (returns {count, performers: []}) shapes — pick by op.
      if (op === 'findPerformers') {
        return {
          data: {
            findPerformers: {
              count: mapped.length,
              performers: mapped,
            },
          },
        }
      }
      return { data: { allPerformers: mapped } }
    }

    case 'findPerformer': {
      const id = String(vars.id ?? '')
      const p = await accessors.findPerformer(id)
      return {
        data: {
          findPerformer: p ? {
            id: p.id,
            name: p.name,
            gender: 'FEMALE',
            image_path: '',
            scene_count: p.sampleCount,
          } : null,
        },
      }
    }

    case 'allStudios':
    case 'findStudios': {
      const studios = await accessors.allStudios()
      const mapped = studios.map((s) => ({ id: s.id, name: s.name, image_path: '' }))
      if (op === 'findStudios') {
        return { data: { findStudios: { count: mapped.length, studios: mapped } } }
      }
      return { data: { allStudios: mapped } }
    }

    case 'findStudio': {
      const id = String(vars.id ?? '')
      const s = await accessors.findStudio(id)
      return {
        data: {
          findStudio: s ? { id: s.id, name: s.name, image_path: '' } : null,
        },
      }
    }

    case 'allTags':
    case 'findTags': {
      const tags = await accessors.allTags()
      const mapped = tags.map((t) => ({ id: t.id, name: t.name, scene_count: t.count }))
      if (op === 'findTags') {
        return { data: { findTags: { count: mapped.length, tags: mapped } } }
      }
      return { data: { allTags: mapped } }
    }

    default:
      // Unknown operation — return GraphQL-shaped error so plugins
      // get a structured response instead of a 500.
      return {
        data: null,
        errors: [{
          message: `Field "${op}" not implemented by Vault Stash shim. Vault implements a read-only subset; mutations + write paths are out of scope.`,
          path: [op],
          extensions: { code: 'NOT_IMPLEMENTED' },
        }],
      }
  }
}

// ─── Server ──────────────────────────────────────────────────────

class StashShimServer {
  private server: http.Server | null = null
  private isRunning = false
  private port = DEFAULT_CONFIG.port
  public accessors: StashShimAccessors | null = null

  async start(config: Partial<StashShimConfig> = {}): Promise<{
    success: boolean
    port?: number
    addresses?: string[]
    error?: string
  }> {
    if (this.isRunning) {
      return { success: true, port: this.port, addresses: this.getAddresses() }
    }
    this.port = config.port ?? DEFAULT_CONFIG.port

    return new Promise((resolve) => {
      this.server = http.createServer((req, res) => {
        this.handleRequest(req, res).catch((err) => {
          console.warn('[StashShim] handler error:', err)
          if (!res.headersSent) {
            res.writeHead(500, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ errors: [{ message: 'Internal server error' }] }))
          }
        })
      })
      this.server.on('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'EADDRINUSE') {
          resolve({ success: false, error: `Port ${this.port} already in use` })
        } else {
          resolve({ success: false, error: err.message })
        }
      })
      this.server.listen(this.port, '0.0.0.0', () => {
        this.isRunning = true
        const addresses = this.getAddresses()
        console.log(`[StashShim] Server started on port ${this.port} — graphql: http://<host>:${this.port}/graphql`)
        resolve({ success: true, port: this.port, addresses })
      })
    })
  }

  async stop(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.server) { resolve(); return }
      this.server.close(() => {
        this.isRunning = false
        this.server = null
        console.log('[StashShim] Server stopped')
        resolve()
      })
    })
  }

  getStatus() {
    return {
      running: this.isRunning,
      port: this.port,
      addresses: this.isRunning ? this.getAddresses() : [],
      graphqlUrl: this.isRunning ? `http://localhost:${this.port}/graphql` : null,
    }
  }

  private getAddresses(): string[] {
    const interfaces = os.networkInterfaces()
    const addresses: string[] = []
    for (const ifaces of Object.values(interfaces)) {
      if (!ifaces) continue
      for (const iface of ifaces) {
        if (iface.family === 'IPv4' && !iface.internal) {
          addresses.push(`http://${iface.address}:${this.port}/graphql`)
        }
      }
    }
    addresses.push(`http://localhost:${this.port}/graphql`)
    return addresses
  }

  private async handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, ApiKey')
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    if (req.method === 'OPTIONS') {
      res.writeHead(204); res.end(); return
    }

    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`)
    const pathname = url.pathname.replace(/\/+$/, '') || '/'
    const host = req.headers.host ?? `localhost:${this.port}`

    // Health probe — Stash plugins frequently ping GET / to test
    // reachability. Return a JSON banner.
    if (req.method === 'GET' && (pathname === '/' || pathname === '/healthz')) {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({
        server: 'vault-stash-shim',
        version: '0.1',
        graphqlUrl: `http://${host}/graphql`,
      }))
      return
    }

    // GraphQL endpoint.
    if (pathname === '/graphql') {
      if (req.method === 'GET') {
        // GET with `?query=...` is rare but valid. We support POST primarily.
        res.writeHead(405, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ errors: [{ message: 'Use POST for queries' }] }))
        return
      }
      if (req.method !== 'POST') {
        res.writeHead(405); res.end(); return
      }
      const chunks: Buffer[] = []
      for await (const c of req) chunks.push(c as Buffer)
      let body: any
      try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')) }
      catch { body = null }
      const parsed = parseGraphQLRequest(body)
      if (!parsed) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ errors: [{ message: 'Unparseable query' }] }))
        return
      }
      if (!this.accessors) {
        res.writeHead(503, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ errors: [{ message: 'Accessors not wired' }] }))
        return
      }
      const result = await resolve(parsed, this.accessors, host)
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(result))
      return
    }

    res.writeHead(404); res.end()
  }
}

export const stashShimServer = new StashShimServer()
