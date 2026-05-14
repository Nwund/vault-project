// File: src/main/services/deovr-server.ts
//
// XBVR-style HTTP endpoint exposing Vault's library to VR players
// (DeoVR / HereSphere / SkyBox VR). The format is the DeoVR JSON
// catalog — a list-of-scenes shape these players expect when you
// point them at a server URL.
//
// Endpoints:
//   GET /deovr/         → root catalog JSON
//                          { name, scenes: [{ name, list: [SceneItem] }] }
//   GET /deovr/<id>     → single scene detail JSON
//   GET /video/<id>     → MP4 stream with HTTP Range support
//   GET /thumb/<id>     → JPEG thumbnail
//
// Security model: NO AUTH. The server binds to all interfaces (LAN)
// so VR headsets can reach it. The user enables it via Settings.
// Disable when not actively casting to a headset to avoid leaving
// the library reachable.
//
// Why a separate server from mobile-sync? DeoVR doesn't pair — it
// just hits the catalog URL with no headers. Adding a no-auth route
// to mobile-sync would weaken its pairing model. Better to host a
// dedicated server the user can toggle independently.

import * as http from 'http'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { URL } from 'url'

export interface DeoVRSceneItem {
  id: number
  title: string
  videoLength: number          // seconds
  thumbnailUrl: string
  video_url: string
  is3d: boolean
  screenType?: string          // 'flat' | 'dome' | 'sphere' | 'fisheye' | etc
  stereoMode?: string          // 'sbs' | 'tb' | 'mono'
  encodings?: Array<{
    name: string
    videoSources: Array<{
      resolution: number
      url: string
    }>
  }>
}

export interface DeoVRCatalog {
  name: string
  scenes: Array<{
    name: string
    list: DeoVRSceneItem[]
  }>
}

export interface DeoVRServerConfig {
  port: number
  /** Maximum scenes returned in the root catalog. DeoVR can paginate
   *  but most users want a single big list. 500 is a safe ceiling. */
  maxScenes: number
  /** Default screen type when video metadata doesn't suggest VR — most
   *  users with this endpoint enabled will be using VR headsets. */
  defaultScreenType: 'flat' | 'dome'
}

const DEFAULT_CONFIG: DeoVRServerConfig = {
  port: 9999,
  maxScenes: 500,
  defaultScreenType: 'flat',
}

class DeoVRServer {
  private server: http.Server | null = null
  private isRunning = false
  private port = DEFAULT_CONFIG.port
  private config: DeoVRServerConfig = DEFAULT_CONFIG

  // Injected accessors — wired by ipc.ts at startup so the server
  // doesn't need direct DB access.
  public listVideos: (() => Promise<Array<{
    id: string
    title: string | null
    filename: string
    path: string
    durationSec: number | null
    thumbPath: string | null
    width: number | null
    height: number | null
  }>>) | null = null

  public getVideo: ((id: string) => Promise<{
    id: string
    title: string | null
    filename: string
    path: string
    durationSec: number | null
    thumbPath: string | null
    width: number | null
    height: number | null
  } | null>) | null = null

  async start(config: Partial<DeoVRServerConfig> = {}): Promise<{
    success: boolean
    port?: number
    addresses?: string[]
    error?: string
  }> {
    if (this.isRunning) {
      return { success: true, port: this.port, addresses: this.getLocalAddresses() }
    }
    this.config = { ...DEFAULT_CONFIG, ...config }
    this.port = this.config.port

    return new Promise((resolve) => {
      this.server = http.createServer((req, res) => {
        this.handleRequest(req, res).catch((err) => {
          console.warn('[DeoVR] Handler error:', err)
          if (!res.headersSent) {
            res.writeHead(500, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ error: 'Internal server error' }))
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
        const addresses = this.getLocalAddresses()
        console.log(`[DeoVR] Server started on port ${this.port} — catalog: http://<host>:${this.port}/deovr/`)
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
        console.log('[DeoVR] Server stopped')
        resolve()
      })
    })
  }

  getStatus() {
    return {
      running: this.isRunning,
      port: this.port,
      addresses: this.isRunning ? this.getLocalAddresses() : [],
      catalogUrl: this.isRunning ? `http://localhost:${this.port}/deovr/` : null,
    }
  }

  /** All non-internal IPv4 addresses on this host — useful for showing
   *  the user which URLs to type into their VR headset. */
  private getLocalAddresses(): string[] {
    const interfaces = os.networkInterfaces()
    const addresses: string[] = []
    for (const ifaces of Object.values(interfaces)) {
      if (!ifaces) continue
      for (const iface of ifaces) {
        if (iface.family === 'IPv4' && !iface.internal) {
          addresses.push(`http://${iface.address}:${this.port}/deovr/`)
        }
      }
    }
    addresses.push(`http://localhost:${this.port}/deovr/`)
    return addresses
  }

  private async handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    // CORS — VR browsers sometimes fetch from a different origin.
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Range')
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
    if (req.method === 'OPTIONS') {
      res.writeHead(204)
      res.end()
      return
    }

    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`)
    const pathname = url.pathname.replace(/\/+$/, '') || '/'

    // Root catalog. DeoVR pings /deovr first.
    if (pathname === '/deovr' || pathname === '' || pathname === '/') {
      await this.serveCatalog(res)
      return
    }

    // Single scene detail. /deovr/<id>
    if (pathname.startsWith('/deovr/')) {
      const id = decodeURIComponent(pathname.slice('/deovr/'.length))
      if (id) {
        await this.serveSceneDetail(id, res)
        return
      }
    }

    // Video stream. /video/<id>
    if (pathname.startsWith('/video/')) {
      const id = decodeURIComponent(pathname.slice('/video/'.length).replace(/\.[a-z0-9]+$/i, ''))
      await this.serveVideo(id, req, res)
      return
    }

    // Thumbnail. /thumb/<id>
    if (pathname.startsWith('/thumb/')) {
      const id = decodeURIComponent(pathname.slice('/thumb/'.length).replace(/\.[a-z0-9]+$/i, ''))
      await this.serveThumb(id, res)
      return
    }

    res.writeHead(404, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'Not found' }))
  }

  private async serveCatalog(res: http.ServerResponse): Promise<void> {
    if (!this.listVideos) {
      res.writeHead(503, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Library accessor not wired' }))
      return
    }
    const videos = await this.listVideos()
    const host = res.req.headers.host ?? `localhost:${this.port}`
    const scenes: DeoVRSceneItem[] = videos
      .slice(0, this.config.maxScenes)
      .map((v) => this.toSceneItem(v, host))
    const catalog: DeoVRCatalog = {
      name: 'Vault',
      scenes: [
        { name: 'Library', list: scenes },
      ],
    }
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(catalog))
  }

  private async serveSceneDetail(id: string, res: http.ServerResponse): Promise<void> {
    if (!this.getVideo) {
      res.writeHead(503, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Library accessor not wired' }))
      return
    }
    const video = await this.getVideo(id)
    if (!video) {
      res.writeHead(404, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Scene not found' }))
      return
    }
    const host = res.req.headers.host ?? `localhost:${this.port}`
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(this.toSceneItem(video, host)))
  }

  private toSceneItem(
    v: { id: string; title: string | null; filename: string; durationSec: number | null; width: number | null; height: number | null },
    host: string,
  ): DeoVRSceneItem {
    const title = v.title || v.filename.replace(/\.[^.]+$/, '') || `Scene ${v.id}`
    const videoUrl = `http://${host}/video/${encodeURIComponent(v.id)}.mp4`
    const thumbnailUrl = `http://${host}/thumb/${encodeURIComponent(v.id)}.jpg`
    const resolution = v.height ?? 1080
    // Stable numeric id derived from string id — DeoVR's `id` field
    // must be numeric. We hash the first 8 hex chars of the string.
    const numericId = (() => {
      let h = 0
      for (let i = 0; i < v.id.length; i++) h = (h * 31 + v.id.charCodeAt(i)) | 0
      return Math.abs(h)
    })()
    return {
      id: numericId,
      title,
      videoLength: v.durationSec ? Math.round(v.durationSec) : 0,
      thumbnailUrl,
      video_url: videoUrl,
      is3d: false,
      screenType: this.config.defaultScreenType,
      stereoMode: 'mono',
      encodings: [
        {
          name: 'h264',
          videoSources: [
            { resolution, url: videoUrl },
          ],
        },
      ],
    }
  }

  private async serveVideo(id: string, req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    if (!this.getVideo) {
      res.writeHead(503); res.end(); return
    }
    const video = await this.getVideo(id)
    if (!video || !fs.existsSync(video.path)) {
      res.writeHead(404); res.end(); return
    }
    const stat = fs.statSync(video.path)
    const fileSize = stat.size
    const range = req.headers.range
    // Pick a content type from extension.
    const ext = path.extname(video.path).toLowerCase()
    const contentType =
      ext === '.mp4' ? 'video/mp4'
      : ext === '.webm' ? 'video/webm'
      : ext === '.mkv' ? 'video/x-matroska'
      : ext === '.mov' ? 'video/quicktime'
      : 'application/octet-stream'

    if (range) {
      // HTTP Range — required by DeoVR for seeking.
      const parts = /bytes=(\d*)-(\d*)/.exec(range)
      if (!parts) {
        res.writeHead(416); res.end(); return
      }
      const start = parts[1] ? parseInt(parts[1], 10) : 0
      const end = parts[2] ? parseInt(parts[2], 10) : fileSize - 1
      if (start >= fileSize || end >= fileSize || start > end) {
        res.writeHead(416, { 'Content-Range': `bytes */${fileSize}` })
        res.end()
        return
      }
      const chunkSize = (end - start) + 1
      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunkSize,
        'Content-Type': contentType,
      })
      const stream = fs.createReadStream(video.path, { start, end })
      stream.pipe(res)
      stream.on('error', () => { try { res.destroy() } catch { /* ignore */ } })
    } else {
      res.writeHead(200, {
        'Content-Length': fileSize,
        'Content-Type': contentType,
        'Accept-Ranges': 'bytes',
      })
      const stream = fs.createReadStream(video.path)
      stream.pipe(res)
      stream.on('error', () => { try { res.destroy() } catch { /* ignore */ } })
    }
  }

  private async serveThumb(id: string, res: http.ServerResponse): Promise<void> {
    if (!this.getVideo) {
      res.writeHead(503); res.end(); return
    }
    const video = await this.getVideo(id)
    if (!video?.thumbPath || !fs.existsSync(video.thumbPath)) {
      res.writeHead(404); res.end(); return
    }
    const stat = fs.statSync(video.thumbPath)
    const ext = path.extname(video.thumbPath).toLowerCase()
    const contentType = ext === '.png' ? 'image/png' : 'image/jpeg'
    res.writeHead(200, {
      'Content-Type': contentType,
      'Content-Length': stat.size,
      'Cache-Control': 'public, max-age=3600',
    })
    fs.createReadStream(video.thumbPath).pipe(res)
  }
}

export const deovrServer = new DeoVRServer()
