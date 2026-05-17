// File: src/main/services/webhook-receiver.ts
//
// #306 E-82 — Inbound webhook receiver. Spawns a tiny HTTP server
// bound to 127.0.0.1:<port>; each registered route is HMAC-SHA256
// signed via a per-route secret. Useful for n8n / Make / Zapier
// automations that need to fire Vault actions externally.
//
// Auth model:
//   - Server is loopback-only by default (127.0.0.1). Set bindHost to
//     '0.0.0.0' explicitly to expose to LAN.
//   - Every request must include `X-Vault-Signature: sha256=<hex>`
//     where <hex> = HMAC-SHA256(secret, raw body).
//   - Constant-time compare to prevent timing attacks.
//   - Reject any request that lacks a signature OR fails verification
//     with 401.
//
// Route registry:
//   Routes are managed at runtime via register/unregister. Each route
//   has a path (e.g. "/import-url"), a secret, and a callback. When a
//   verified request lands, the callback runs with the parsed body.
//
// Persisted state: routes are stored in settings.webhookRoutes so they
// survive restarts. Secrets are stored plaintext (use safeStorage if
// you want encryption — not done here because broker is loopback by
// default).

import * as http from 'node:http'
import * as crypto from 'node:crypto'
import { BrowserWindow } from 'electron'

export interface WebhookRoute {
  id: string
  path: string         // e.g. "/import-url"
  secret: string       // HMAC-SHA256 secret
  description?: string
  createdAt: number
}

type Handler = (route: WebhookRoute, body: any, headers: http.IncomingHttpHeaders) => void | Promise<void>

let server: http.Server | null = null
let port: number = 9180
let bindHost: string = '127.0.0.1'
let routes: WebhookRoute[] = []
let onHit: Handler | null = null

function timingSafeEqualStr(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b))
}

function verifySignature(route: WebhookRoute, headers: http.IncomingHttpHeaders, rawBody: Buffer): boolean {
  const sig = String(headers['x-vault-signature'] ?? '').trim()
  if (!sig.startsWith('sha256=')) return false
  const expected = 'sha256=' + crypto.createHmac('sha256', route.secret).update(rawBody).digest('hex')
  return timingSafeEqualStr(sig, expected)
}

export interface StartOptions {
  port?: number
  bindHost?: string
  initialRoutes?: WebhookRoute[]
  onHit?: Handler
}

export async function startWebhookServer(opts: StartOptions = {}): Promise<{ ok: boolean; port?: number; error?: string }> {
  if (server) {
    return { ok: true, port }
  }
  port = opts.port ?? 9180
  bindHost = opts.bindHost ?? '127.0.0.1'
  if (opts.initialRoutes) routes = [...opts.initialRoutes]
  if (opts.onHit) onHit = opts.onHit
  return await new Promise((resolve) => {
    const s = http.createServer((req, res) => {
      const url = req.url ?? '/'
      const route = routes.find((r) => r.path === url || url.startsWith(`${r.path}?`))
      if (!route) {
        res.writeHead(404, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: false, error: 'no_route' }))
        return
      }
      if (req.method !== 'POST') {
        res.writeHead(405, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: false, error: 'POST required' }))
        return
      }
      const chunks: Buffer[] = []
      req.on('data', (c) => chunks.push(c))
      req.on('end', () => {
        const raw = Buffer.concat(chunks)
        if (!verifySignature(route, req.headers, raw)) {
          res.writeHead(401, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ ok: false, error: 'invalid_signature' }))
          return
        }
        let body: any = raw.toString('utf8')
        const ct = String(req.headers['content-type'] ?? '')
        if (ct.includes('application/json')) {
          try { body = JSON.parse(body) } catch { /* keep raw string */ }
        }
        try { onHit?.(route, body, req.headers) } catch (err) {
          console.warn('[webhook] handler threw:', err)
        }
        // Also broadcast to renderer so UIs can react live.
        try {
          for (const w of BrowserWindow.getAllWindows()) {
            w.webContents.send('webhook:hit', { routeId: route.id, path: route.path, body, ts: Date.now() })
          }
        } catch { /* ignore */ }
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: true }))
      })
      req.on('error', () => { try { res.end() } catch { /* ignore */ } })
    })
    s.on('error', (err) => resolve({ ok: false, error: err.message }))
    s.listen(port, bindHost, () => {
      server = s
      console.log(`[webhook] listening on ${bindHost}:${port}, ${routes.length} routes`)
      resolve({ ok: true, port })
    })
  })
}

export async function stopWebhookServer(): Promise<void> {
  if (!server) return
  await new Promise<void>((r) => server!.close(() => r()))
  server = null
}

export function getStatus(): { running: boolean; port: number; bindHost: string; routeCount: number } {
  return { running: server !== null, port, bindHost, routeCount: routes.length }
}

export function listRoutes(): WebhookRoute[] {
  return [...routes]
}

export function addRoute(path: string, opts: { secret?: string; description?: string } = {}): WebhookRoute {
  if (!path.startsWith('/')) path = '/' + path
  const secret = opts.secret ?? crypto.randomBytes(32).toString('hex')
  const route: WebhookRoute = {
    id: crypto.randomBytes(6).toString('hex'),
    path,
    secret,
    description: opts.description,
    createdAt: Date.now(),
  }
  routes.push(route)
  return route
}

export function removeRoute(id: string): boolean {
  const before = routes.length
  routes = routes.filter((r) => r.id !== id)
  return routes.length < before
}

export function setOnHit(handler: Handler | null): void {
  onHit = handler
}
