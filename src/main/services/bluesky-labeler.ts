// File: src/main/services/bluesky-labeler.ts
//
// #273 C-49 — ATProto Bluesky labeler service. Runs an HTTP labeler
// endpoint that ATProto clients (Bluesky app, third-party clients
// that subscribe to it) can query for moderation labels on AT-URIs.
//
// Vault doesn't publish public labels — this endpoint exists so the
// USER can self-label their own posts / saved Bluesky media within
// Vault's UI, and other Vault instances on their mesh can sync those
// labels.
//
// Labeler protocol (subset):
//   GET  /xrpc/com.atproto.label.queryLabels?uriPatterns=...
//        → { labels: [{ src, uri, val, cts }] }
//   POST /labels/upsert  (Vault-only; not part of ATProto)
//        → adds / updates a label
//
// Labels live in a tiny SQLite-backed store (vault.sqlite3 already
// open via DB) so they survive restarts and ride mesh sync.

import * as http from 'node:http'
import type { DB } from '../db'

let server: http.Server | null = null
let serverPort = 0

function ensureSchema(db: DB): void {
  db.raw.exec(`
    CREATE TABLE IF NOT EXISTS atproto_labels (
      uri TEXT NOT NULL,
      val TEXT NOT NULL,
      src TEXT NOT NULL,
      cts INTEGER NOT NULL,
      PRIMARY KEY (uri, val)
    );
    CREATE INDEX IF NOT EXISTS idx_atproto_labels_uri ON atproto_labels(uri);
  `)
}

export async function start(db: DB, port = 8586): Promise<{ ok: boolean; port?: number; error?: string }> {
  if (server) return { ok: true, port: serverPort }
  ensureSchema(db)
  return new Promise((resolve) => {
    const s = http.createServer(async (req, res) => {
      try {
        const url = new URL(req.url ?? '/', `http://${req.headers.host}`)
        if (req.method === 'GET' && url.pathname === '/xrpc/com.atproto.label.queryLabels') {
          const patterns = url.searchParams.getAll('uriPatterns')
          if (patterns.length === 0) { res.statusCode = 400; res.end(JSON.stringify({ error: 'missing uriPatterns' })); return }
          const rows: any[] = []
          for (const p of patterns) {
            const sql = p.endsWith('*')
              ? `SELECT uri, val, src, cts FROM atproto_labels WHERE uri LIKE ?`
              : `SELECT uri, val, src, cts FROM atproto_labels WHERE uri = ?`
            const param = p.endsWith('*') ? `${p.slice(0, -1)}%` : p
            const r = db.raw.prepare(sql).all(param)
            rows.push(...r)
          }
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ labels: rows }))
          return
        }
        if (req.method === 'POST' && url.pathname === '/labels/upsert') {
          const chunks: Buffer[] = []
          req.on('data', (c) => chunks.push(c as Buffer))
          req.on('end', () => {
            try {
              const body = JSON.parse(Buffer.concat(chunks).toString('utf8'))
              const { uri, val, src } = body
              if (!uri || !val || !src) { res.statusCode = 400; res.end(JSON.stringify({ error: 'uri/val/src required' })); return }
              db.raw.prepare(`
                INSERT INTO atproto_labels (uri, val, src, cts)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(uri, val) DO UPDATE SET cts = excluded.cts, src = excluded.src
              `).run(uri, val, src, Date.now())
              res.end(JSON.stringify({ ok: true }))
            } catch (err: any) {
              res.statusCode = 500
              res.end(JSON.stringify({ error: String(err?.message ?? err) }))
            }
          })
          return
        }
        res.statusCode = 404
        res.end(JSON.stringify({ error: 'not found' }))
      } catch (err) {
        res.statusCode = 500
        res.end(JSON.stringify({ error: String(err) }))
      }
    })
    s.on('error', (err) => {
      server = null
      resolve({ ok: false, error: String(err) })
    })
    s.listen(port, '127.0.0.1', () => {
      server = s
      serverPort = port
      resolve({ ok: true, port })
    })
  })
}

export function stop(): void {
  if (!server) return
  try { server.close() } catch { /* ignore */ }
  server = null
}

export function listLabels(db: DB, uri?: string): Array<{ uri: string; val: string; src: string; cts: number }> {
  ensureSchema(db)
  if (uri) return db.raw.prepare(`SELECT uri, val, src, cts FROM atproto_labels WHERE uri = ?`).all(uri) as any[]
  return db.raw.prepare(`SELECT uri, val, src, cts FROM atproto_labels ORDER BY cts DESC LIMIT 500`).all() as any[]
}
