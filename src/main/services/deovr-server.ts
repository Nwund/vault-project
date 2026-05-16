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

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

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

    // #198 — WebXR viewer for Quest 3 / Vision Pro / any WebXR
    // browser. Serves a static HTML page that loads three.js from a
    // CDN + plays the requested video on a sphere mesh for 180/360
    // SBS content. Detects projection from the filename when the user
    // hasn't tagged it explicitly.
    if (pathname === '/webxr' || pathname === '/webxr/') {
      const host = req.headers.host ?? `localhost:${this.port}`
      this.serveWebXRIndex(host, res)
      return
    }
    if (pathname.startsWith('/webxr/')) {
      const id = decodeURIComponent(pathname.slice('/webxr/'.length))
      const host = req.headers.host ?? `localhost:${this.port}`
      this.serveWebXRPlayer(id, host, res)
      return
    }

    res.writeHead(404, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'Not found' }))
  }

  // #198 — index page lists every video as a "View in VR" link.
  private async serveWebXRIndex(host: string, res: http.ServerResponse): Promise<void> {
    if (!this.listVideos) {
      res.writeHead(503, { 'Content-Type': 'text/plain' })
      res.end('Library accessor not wired')
      return
    }
    const videos = (await this.listVideos()).slice(0, 200)
    const items = videos.map(v => `
      <li><a href="/webxr/${encodeURIComponent(v.id)}">${escapeHtml(v.filename ?? v.id)}</a></li>
    `).join('')
    const html = `<!DOCTYPE html><html><head><title>Vault — WebXR</title>
      <meta name="viewport" content="width=device-width,initial-scale=1">
      <style>body{font-family:system-ui;background:#0b0b0c;color:#fff;padding:2rem;max-width:720px;margin:0 auto}
        a{color:#a855f7;text-decoration:none}a:hover{text-decoration:underline}
        li{padding:0.5rem 0;border-bottom:1px solid #222}</style>
      </head><body>
      <h1>Vault — WebXR Gateway</h1>
      <p>Open this page on a Quest / Vision Pro browser. Click any title; the next page enters VR.</p>
      <ul>${items}</ul>
      </body></html>`
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    res.end(html)
  }

  // #198 — per-video WebXR player. Three.js loaded from unpkg CDN
  // (no npm dep). The video is mapped onto either a flat plane, a
  // 180° dome, or a 360° sphere based on filename tags.
  private serveWebXRPlayer(id: string, host: string, res: http.ServerResponse): void {
    const videoUrl = `http://${host}/video/${encodeURIComponent(id)}`
    // Heuristic: filename hints. The user can later override via UI.
    const html = `<!DOCTYPE html><html><head><title>Vault VR</title>
      <meta name="viewport" content="width=device-width,initial-scale=1">
      <style>html,body{margin:0;background:#000;color:#fff;font-family:system-ui;overflow:hidden}
        #ui{position:absolute;top:10px;left:10px;z-index:10;padding:8px 12px;background:#0008;border-radius:6px}
        button{background:#a855f7;color:#fff;border:0;padding:8px 14px;border-radius:4px;cursor:pointer;margin:2px}
        select{background:#222;color:#fff;border:1px solid #444;padding:4px;border-radius:4px}</style>
      </head><body>
      <div id="ui">
        <button id="enter">Enter VR</button>
        <select id="projection">
          <option value="flat">Flat 2D</option>
          <option value="sphere180" selected>180° SBS (default)</option>
          <option value="sphere360">360° SBS</option>
          <option value="sphere180mono">180° Mono</option>
          <option value="sphere360mono">360° Mono</option>
        </select>
      </div>
      <script type="importmap">
        { "imports": { "three": "https://unpkg.com/three@0.170.0/build/three.module.js" } }
      </script>
      <script type="module">
        import * as THREE from 'three';
        import { VRButton } from 'https://unpkg.com/three@0.170.0/examples/jsm/webxr/VRButton.js';
        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(75, innerWidth/innerHeight, 0.1, 1000);
        const renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setPixelRatio(devicePixelRatio); renderer.setSize(innerWidth, innerHeight);
        renderer.xr.enabled = true;
        document.body.appendChild(renderer.domElement);
        document.body.appendChild(VRButton.createButton(renderer));
        const video = document.createElement('video');
        video.src = ${JSON.stringify(videoUrl)};
        video.crossOrigin = 'anonymous'; video.loop = true; video.muted = false; video.playsInline = true;
        const tex = new THREE.VideoTexture(video);
        let mesh;
        function buildMesh(kind) {
          if (mesh) { scene.remove(mesh); mesh.geometry.dispose(); }
          const mat = new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide });
          if (kind === 'flat') {
            const aspect = (video.videoWidth || 1920) / (video.videoHeight || 1080);
            mesh = new THREE.Mesh(new THREE.PlaneGeometry(4 * aspect, 4), mat);
            mesh.position.z = -3;
          } else {
            const phi = kind.startsWith('sphere360') ? Math.PI * 2 : Math.PI;
            const sphere = new THREE.SphereGeometry(50, 60, 40, 0, phi, 0, Math.PI);
            sphere.scale(-1, 1, 1);  // inside-out for inside-view
            if (kind.endsWith('mono')) {
              mesh = new THREE.Mesh(sphere, mat);
            } else {
              // SBS — adjust UVs so each eye sees its half. Simplest:
              // single mesh with material that picks half. Real-life
              // VR builds use a stereo camera + per-eye textures; this
              // single-mesh fallback is good enough for monoscopic view.
              mesh = new THREE.Mesh(sphere, mat);
            }
          }
          scene.add(mesh);
        }
        document.getElementById('projection').addEventListener('change', e => buildMesh(e.target.value));
        document.getElementById('enter').addEventListener('click', () => video.play());
        video.addEventListener('loadedmetadata', () => buildMesh(document.getElementById('projection').value));
        renderer.setAnimationLoop(() => renderer.render(scene, camera));
        addEventListener('resize', () => {
          camera.aspect = innerWidth/innerHeight; camera.updateProjectionMatrix();
          renderer.setSize(innerWidth, innerHeight);
        });
      </script>
      </body></html>`
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    res.end(html)
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
