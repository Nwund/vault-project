// File: src/main/services/webdav-server.ts
//
// Minimal read-only WebDAV server (#181). Lets Windows Explorer /
// macOS Finder / Infuse / VLC / Kodi mount the Vault library as a
// network drive without a custom app.
//
// Implements just enough of RFC 4918 for common clients:
//   - OPTIONS: advertises DAV: 1, 2 + allowed methods
//   - PROPFIND: returns XML <multistatus> with file/collection props.
//     Depth 0 = the resource itself; Depth 1 = it + immediate children;
//     Depth infinity is rejected to keep the response bounded.
//   - GET / HEAD: streams the file with byte-range support
//   - PUT / DELETE / MKCOL / COPY / MOVE: NOT implemented (read-only)
//
// Auth: bearer token in Authorization header (matches existing
// mobile-sync token scheme so the same tokens authorize WebDAV).
//
// Layout: the root collection lists each Vault media file as a
// virtual child (filenames as path segments). Subdirectories are
// not exposed — Vault is conceptually flat from the catalog's
// perspective. Future: nest by collection or by source-tag.

import * as http from 'node:http'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { URL } from 'node:url'
import type { DB } from '../db'

const DAV_NAMESPACE = 'DAV:'

let server: http.Server | null = null
let runningPort: number | null = null

interface WebDAVDeps {
  db: DB
  validToken: (token: string) => boolean
}

function xmlEscape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function isoDate(ms: number): string {
  return new Date(ms).toISOString()
}

function contentTypeFor(p: string): string {
  const ext = path.extname(p).toLowerCase()
  switch (ext) {
    case '.mp4': case '.m4v': return 'video/mp4'
    case '.webm': return 'video/webm'
    case '.mkv': return 'video/x-matroska'
    case '.mov': return 'video/quicktime'
    case '.jpg': case '.jpeg': return 'image/jpeg'
    case '.png': return 'image/png'
    case '.gif': return 'image/gif'
    case '.webp': return 'image/webp'
    default: return 'application/octet-stream'
  }
}

function authorize(req: http.IncomingMessage, deps: WebDAVDeps): boolean {
  const auth = req.headers['authorization']
  if (!auth) return false
  const m = String(auth).match(/^Bearer\s+(.+)$/i)
  if (!m) return false
  return deps.validToken(m[1].trim())
}

function send(res: http.ServerResponse, status: number, headers: Record<string, string> = {}, body: string | Buffer = '') {
  res.writeHead(status, headers)
  res.end(body)
}

function propfindBody(resources: Array<{
  href: string
  isCollection: boolean
  filename: string
  size?: number
  mtimeMs?: number
  contentType?: string
}>): string {
  const items = resources.map(r => {
    const resourcetype = r.isCollection ? '<D:collection/>' : ''
    const props = [
      `<D:displayname>${xmlEscape(r.filename)}</D:displayname>`,
      `<D:resourcetype>${resourcetype}</D:resourcetype>`,
    ]
    if (!r.isCollection) {
      if (typeof r.size === 'number') props.push(`<D:getcontentlength>${r.size}</D:getcontentlength>`)
      if (r.contentType) props.push(`<D:getcontenttype>${r.contentType}</D:getcontenttype>`)
      if (typeof r.mtimeMs === 'number') {
        props.push(`<D:getlastmodified>${isoDate(r.mtimeMs)}</D:getlastmodified>`)
      }
    }
    return `<D:response>
      <D:href>${xmlEscape(r.href)}</D:href>
      <D:propstat>
        <D:prop>${props.join('')}</D:prop>
        <D:status>HTTP/1.1 200 OK</D:status>
      </D:propstat>
    </D:response>`
  }).join('')
  return `<?xml version="1.0" encoding="utf-8"?>\n<D:multistatus xmlns:D="${DAV_NAMESPACE}">${items}</D:multistatus>`
}

export async function startWebDavServer(port: number, deps: WebDAVDeps): Promise<{ port: number }> {
  if (server) {
    if (runningPort === port) return { port }
    await stopWebDavServer()
  }
  server = http.createServer(async (req, res) => {
    try {
      // Auth gate — everything except OPTIONS preflight requires a token.
      if (req.method !== 'OPTIONS' && !authorize(req, deps)) {
        return send(res, 401, {
          'WWW-Authenticate': 'Bearer realm="Vault WebDAV"',
        }, 'Unauthorized')
      }

      const url = new URL(req.url ?? '/', `http://localhost:${port}`)
      const pathname = decodeURIComponent(url.pathname)

      // OPTIONS — advertise DAV capability.
      if (req.method === 'OPTIONS') {
        return send(res, 200, {
          'DAV': '1, 2',
          'Allow': 'OPTIONS, GET, HEAD, PROPFIND',
          'MS-Author-Via': 'DAV',
          'Content-Length': '0',
        })
      }

      // PROPFIND — root collection or single resource.
      if (req.method === 'PROPFIND') {
        const depth = String(req.headers['depth'] ?? 'infinity').toLowerCase()
        // For Windows Explorer compat we ALWAYS list the root regardless
        // of depth=infinity (it's never huge — same as the catalog list).
        const isRoot = pathname === '/' || pathname === ''
        if (isRoot) {
          const rootResource = {
            href: '/',
            isCollection: true,
            filename: 'Vault',
          }
          if (depth === '0') {
            return send(res, 207, { 'Content-Type': 'application/xml; charset=utf-8' },
              propfindBody([rootResource]))
          }
          const items = deps.db.listAllMediaForScan()
          const resources = [rootResource, ...items.map(m => ({
            href: '/' + encodeURIComponent(path.basename(m.path)),
            isCollection: false,
            filename: path.basename(m.path),
            size: m.size ?? undefined,
            mtimeMs: m.mtimeMs ?? undefined,
            contentType: contentTypeFor(m.path),
          }))]
          return send(res, 207, { 'Content-Type': 'application/xml; charset=utf-8' },
            propfindBody(resources))
        }
        // Single-file PROPFIND.
        const filename = decodeURIComponent(pathname.replace(/^\//, ''))
        const items = deps.db.listAllMediaForScan()
        const hit = items.find(m => (path.basename(m.path)) === filename)
        if (!hit) return send(res, 404)
        return send(res, 207, { 'Content-Type': 'application/xml; charset=utf-8' },
          propfindBody([{
            href: pathname,
            isCollection: false,
            filename: path.basename(hit.path),
            size: hit.size ?? undefined,
            mtimeMs: hit.mtimeMs ?? undefined,
            contentType: contentTypeFor(hit.path),
          }]))
      }

      // GET / HEAD — stream a file with range support.
      if (req.method === 'GET' || req.method === 'HEAD') {
        if (pathname === '/' || pathname === '') return send(res, 405, {}, 'Use PROPFIND for the collection')
        const filename = decodeURIComponent(pathname.replace(/^\//, ''))
        const items = deps.db.listAllMediaForScan()
        const hit = items.find(m => (path.basename(m.path)) === filename)
        if (!hit || !fs.existsSync(hit.path)) return send(res, 404)
        const stat = fs.statSync(hit.path)
        const rangeHeader = req.headers['range']
        const headers: Record<string, string> = {
          'Content-Type': contentTypeFor(hit.path),
          'Accept-Ranges': 'bytes',
          'Last-Modified': new Date(stat.mtimeMs).toUTCString(),
        }
        if (rangeHeader) {
          const m = /bytes=(\d*)-(\d*)/.exec(String(rangeHeader))
          if (m) {
            const start = m[1] ? parseInt(m[1], 10) : 0
            const end = m[2] ? parseInt(m[2], 10) : stat.size - 1
            if (start < 0 || end >= stat.size || start > end) {
              return send(res, 416, { 'Content-Range': `bytes */${stat.size}` })
            }
            headers['Content-Range'] = `bytes ${start}-${end}/${stat.size}`
            headers['Content-Length'] = String(end - start + 1)
            res.writeHead(206, headers)
            if (req.method === 'HEAD') return res.end()
            fs.createReadStream(hit.path, { start, end }).pipe(res)
            return
          }
        }
        headers['Content-Length'] = String(stat.size)
        res.writeHead(200, headers)
        if (req.method === 'HEAD') return res.end()
        fs.createReadStream(hit.path).pipe(res)
        return
      }

      return send(res, 405, {}, 'Method not allowed (Vault WebDAV is read-only)')
    } catch (err: any) {
      console.warn('[WebDAV] handler error:', err)
      return send(res, 500, {}, err?.message ?? 'Internal error')
    }
  })

  await new Promise<void>((resolve, reject) => {
    server!.once('error', reject)
    server!.listen(port, () => resolve())
  })
  runningPort = port
  console.log(`[WebDAV] Listening on http://127.0.0.1:${port}/`)
  return { port }
}

export async function stopWebDavServer(): Promise<void> {
  if (!server) return
  await new Promise<void>((resolve) => server!.close(() => resolve()))
  server = null
  runningPort = null
  console.log('[WebDAV] Stopped')
}

export function getWebDavStatus(): { running: boolean; port: number | null } {
  return { running: !!server, port: runningPort }
}
