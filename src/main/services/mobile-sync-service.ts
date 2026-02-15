// File: src/main/services/mobile-sync-service.ts
// HTTP server for mobile app communication

import { EventEmitter } from 'events'
import * as http from 'http'
import * as https from 'https'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import * as crypto from 'crypto'
import { URL } from 'url'

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface MobileSyncConfig {
  port: number
  enableHttps: boolean
  allowedNetworks: string[] // CIDR ranges or 'local'
}

export interface PairedDevice {
  id: string
  name: string
  platform: 'ios' | 'android'
  token: string
  pairedAt: number
  lastSeen: number
}

export interface PairingSession {
  code: string
  expiresAt: number
  deviceName?: string
}

export interface SyncState {
  lastSync: number
  mediaCount: number
  playlistCount: number
}

// ═══════════════════════════════════════════════════════════════════════════
// MOBILE SYNC SERVICE
// ═══════════════════════════════════════════════════════════════════════════

class MobileSyncService extends EventEmitter {
  private server: http.Server | https.Server | null = null
  private port: number = 8765
  private isRunning: boolean = false
  private pairedDevices: Map<string, PairedDevice> = new Map()
  private activePairingSessions: Map<string, PairingSession> = new Map()
  private tokenToDeviceId: Map<string, string> = new Map()

  // Injected dependencies - will be set by ipc.ts
  public getMediaList: ((opts?: any) => Promise<any[]>) | null = null
  public getMediaCount: (() => Promise<number>) | null = null
  public getMediaById: ((id: string) => Promise<any>) | null = null
  public getPlaylists: (() => Promise<any[]>) | null = null
  public getPlaylistItems: ((id: string) => Promise<any[]>) | null = null
  public addPlaylistItems: ((playlistId: string, mediaIds: string[]) => Promise<void>) | null = null
  public getTags: (() => Promise<string[]>) | null = null
  public getThumbPath: ((mediaPath: string) => Promise<string | null>) | null = null
  public generateThumb: ((mediaId: string) => Promise<string | null>) | null = null

  constructor() {
    super()
    this.loadPairedDevices()
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SERVER MANAGEMENT
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Start the mobile sync HTTP server
   */
  async start(port: number = 8765): Promise<{ success: boolean; port?: number; addresses?: string[]; error?: string }> {
    if (this.isRunning) {
      return { success: true, port: this.port, addresses: this.getLocalAddresses() }
    }

    this.port = port

    return new Promise((resolve) => {
      this.server = http.createServer((req, res) => {
        this.handleRequest(req, res)
      })

      this.server.on('error', (err: NodeJS.ErrnoException) => {
        console.error('[MobileSync] Server error:', err)
        if (err.code === 'EADDRINUSE') {
          resolve({ success: false, error: `Port ${port} is already in use` })
        } else {
          resolve({ success: false, error: err.message })
        }
      })

      this.server.listen(port, '0.0.0.0', () => {
        this.isRunning = true
        const addresses = this.getLocalAddresses()
        console.log('[MobileSync] Server started on port', port)
        console.log('[MobileSync] Accessible at:', addresses)
        this.emit('started', { port, addresses })
        resolve({ success: true, port, addresses })
      })
    })
  }

  /**
   * Stop the mobile sync server
   */
  async stop(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.server) {
        resolve()
        return
      }

      this.server.close(() => {
        this.isRunning = false
        this.server = null
        console.log('[MobileSync] Server stopped')
        this.emit('stopped')
        resolve()
      })
    })
  }

  /**
   * Get server status
   */
  getStatus(): { running: boolean; port: number; addresses: string[]; pairedDevices: number } {
    return {
      running: this.isRunning,
      port: this.port,
      addresses: this.isRunning ? this.getLocalAddresses() : [],
      pairedDevices: this.pairedDevices.size
    }
  }

  /**
   * Get all local network addresses
   */
  private getLocalAddresses(): string[] {
    const addresses: string[] = []
    const interfaces = os.networkInterfaces()

    for (const name of Object.keys(interfaces)) {
      for (const iface of interfaces[name] || []) {
        if (iface.family === 'IPv4' && !iface.internal) {
          addresses.push(`http://${iface.address}:${this.port}`)
        }
      }
    }

    return addresses
  }

  // ─────────────────────────────────────────────────────────────────────────
  // REQUEST HANDLING
  // ─────────────────────────────────────────────────────────────────────────

  private async handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    // CORS headers for mobile app
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

    if (req.method === 'OPTIONS') {
      res.writeHead(204)
      res.end()
      return
    }

    const url = new URL(req.url || '/', `http://${req.headers.host}`)
    const pathname = url.pathname

    try {
      // Public endpoints (no auth required)
      if (pathname === '/api/ping') {
        return this.sendJson(res, { status: 'ok', version: '1.0.0' })
      }

      if (pathname === '/api/pair' && req.method === 'POST') {
        return this.handlePairing(req, res)
      }

      if (pathname === '/api/pair/status') {
        const code = url.searchParams.get('code')
        return this.handlePairingStatus(res, code)
      }

      // Protected endpoints (require auth)
      const authResult = this.authenticateRequest(req)
      if (!authResult.authenticated) {
        return this.sendError(res, 401, 'Unauthorized')
      }

      // Update last seen
      if (authResult.deviceId) {
        const device = this.pairedDevices.get(authResult.deviceId)
        if (device) {
          device.lastSeen = Date.now()
        }
      }

      // Route to handlers
      if (pathname === '/api/library') {
        return this.handleLibrary(req, res, url)
      }

      if (pathname.startsWith('/api/library/')) {
        const mediaId = pathname.replace('/api/library/', '')
        return this.handleMediaDetail(res, mediaId)
      }

      if (pathname.startsWith('/api/media/') && pathname.endsWith('/stream')) {
        const mediaId = pathname.replace('/api/media/', '').replace('/stream', '')
        return this.handleMediaStream(req, res, mediaId)
      }

      if (pathname.startsWith('/api/media/') && pathname.endsWith('/thumb')) {
        const mediaId = pathname.replace('/api/media/', '').replace('/thumb', '')
        return this.handleMediaThumb(res, mediaId)
      }

      if (pathname === '/api/playlists') {
        return this.handlePlaylists(res)
      }

      if (pathname.startsWith('/api/playlists/')) {
        const pathParts = pathname.replace('/api/playlists/', '').split('/')
        const playlistId = pathParts[0]

        // POST /api/playlists/{id}/items - Add items to playlist
        if (pathParts[1] === 'items' && req.method === 'POST') {
          return this.handleAddPlaylistItems(req, res, playlistId)
        }

        // GET /api/playlists/{id} - Get playlist details
        return this.handlePlaylistDetail(res, playlistId)
      }

      if (pathname === '/api/tags') {
        return this.handleTags(res)
      }

      if (pathname === '/api/sync/status') {
        return this.handleSyncStatus(res)
      }

      if (pathname === '/api/devices') {
        return this.handleDevices(res)
      }

      // 404 for unknown routes
      return this.sendError(res, 404, 'Not found')
    } catch (err: any) {
      console.error('[MobileSync] Request error:', err)
      return this.sendError(res, 500, err.message || 'Internal server error')
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // AUTHENTICATION & PAIRING
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Generate a new pairing code
   */
  generatePairingCode(): { code: string; expiresAt: number; qrData: string } {
    const code = this.generateSecureCode(6)
    const expiresAt = Date.now() + 5 * 60 * 1000 // 5 minutes

    this.activePairingSessions.set(code, {
      code,
      expiresAt
    })

    // Clean up expired sessions
    this.cleanupExpiredSessions()

    const addresses = this.getLocalAddresses()
    const qrData = JSON.stringify({
      type: 'vault-mobile-pair',
      code,
      addresses,
      expiresAt
    })

    console.log('[MobileSync] Generated pairing code:', code)
    return { code, expiresAt, qrData }
  }

  private async handlePairing(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const body = await this.parseJsonBody(req)
    const { code, deviceName, platform } = body

    if (!code || !deviceName) {
      return this.sendError(res, 400, 'Missing code or deviceName')
    }

    const session = this.activePairingSessions.get(code)
    if (!session || session.expiresAt < Date.now()) {
      this.activePairingSessions.delete(code)
      return this.sendError(res, 400, 'Invalid or expired pairing code')
    }

    // Generate device token
    const deviceId = crypto.randomUUID()
    const token = this.generateSecureToken()

    const device: PairedDevice = {
      id: deviceId,
      name: deviceName,
      platform: platform || 'android',
      token,
      pairedAt: Date.now(),
      lastSeen: Date.now()
    }

    this.pairedDevices.set(deviceId, device)
    this.tokenToDeviceId.set(token, deviceId)
    this.activePairingSessions.delete(code)
    this.savePairedDevices()

    console.log('[MobileSync] Device paired:', deviceName)
    this.emit('devicePaired', device)

    return this.sendJson(res, {
      success: true,
      deviceId,
      token
    })
  }

  private handlePairingStatus(res: http.ServerResponse, code: string | null): void {
    if (!code) {
      return this.sendError(res, 400, 'Missing code')
    }

    const session = this.activePairingSessions.get(code)
    if (!session) {
      return this.sendJson(res, { valid: false, reason: 'not_found' })
    }

    if (session.expiresAt < Date.now()) {
      this.activePairingSessions.delete(code)
      return this.sendJson(res, { valid: false, reason: 'expired' })
    }

    return this.sendJson(res, {
      valid: true,
      expiresAt: session.expiresAt,
      remainingMs: session.expiresAt - Date.now()
    })
  }

  private authenticateRequest(req: http.IncomingMessage): { authenticated: boolean; deviceId?: string } {
    // Try Authorization header first
    const authHeader = req.headers.authorization
    let token: string | null = null

    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7)
    }

    // Also check query param (needed for mobile Image/Video components that can't send headers)
    if (!token) {
      const url = new URL(req.url || '/', `http://${req.headers.host}`)
      token = url.searchParams.get('token')
    }

    if (!token) {
      return { authenticated: false }
    }

    const deviceId = this.tokenToDeviceId.get(token)

    if (!deviceId || !this.pairedDevices.has(deviceId)) {
      return { authenticated: false }
    }

    return { authenticated: true, deviceId }
  }

  /**
   * Unpair a device
   */
  unpairDevice(deviceId: string): boolean {
    const device = this.pairedDevices.get(deviceId)
    if (!device) return false

    this.tokenToDeviceId.delete(device.token)
    this.pairedDevices.delete(deviceId)
    this.savePairedDevices()

    console.log('[MobileSync] Device unpaired:', device.name)
    this.emit('deviceUnpaired', device)

    return true
  }

  /**
   * Get all paired devices
   */
  getPairedDevices(): PairedDevice[] {
    return Array.from(this.pairedDevices.values())
  }

  // ─────────────────────────────────────────────────────────────────────────
  // API HANDLERS
  // ─────────────────────────────────────────────────────────────────────────

  private async handleLibrary(req: http.IncomingMessage, res: http.ServerResponse, url: URL): Promise<void> {
    if (!this.getMediaList) {
      return this.sendError(res, 500, 'Media service not available')
    }

    const page = parseInt(url.searchParams.get('page') || '1')
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '50'), 100)
    const type = url.searchParams.get('type') || undefined
    const tags = url.searchParams.get('tags')?.split(',').filter(Boolean) || undefined
    const search = url.searchParams.get('search') || undefined
    const sort = url.searchParams.get('sort') || 'newest'

    try {
      const allMedia = await this.getMediaList({
        type,
        tags,
        search,
        sort,
        limit: limit,
        offset: (page - 1) * limit
      })

      // Transform for mobile - exclude full paths for security
      const items = allMedia.map((m: any) => ({
        id: m.id,
        filename: m.filename,
        type: m.type,
        durationSec: m.durationSec,
        sizeBytes: m.sizeBytes,
        width: m.width,
        height: m.height,
        addedAt: m.addedAt,
        rating: m.rating,
        viewCount: m.viewCount,
        tags: m.tags || [],
        hasThumb: !!m.thumbPath
      }))

      // Get total count if available
      const totalCount = this.getMediaCount ? await this.getMediaCount() : undefined

      return this.sendJson(res, {
        items,
        page,
        limit,
        hasMore: items.length === limit,
        totalCount
      })
    } catch (err: any) {
      return this.sendError(res, 500, err.message)
    }
  }

  private async handleMediaDetail(res: http.ServerResponse, mediaId: string): Promise<void> {
    if (!this.getMediaById) {
      return this.sendError(res, 500, 'Media service not available')
    }

    try {
      const media = await this.getMediaById(mediaId)
      if (!media) {
        return this.sendError(res, 404, 'Media not found')
      }

      return this.sendJson(res, {
        id: media.id,
        filename: media.filename,
        type: media.type,
        durationSec: media.durationSec,
        sizeBytes: media.sizeBytes,
        width: media.width,
        height: media.height,
        addedAt: media.addedAt,
        rating: media.rating,
        viewCount: media.viewCount,
        tags: media.tags || [],
        hasThumb: !!media.thumbPath
      })
    } catch (err: any) {
      return this.sendError(res, 500, err.message)
    }
  }

  private async handleMediaStream(req: http.IncomingMessage, res: http.ServerResponse, mediaId: string): Promise<void> {
    if (!this.getMediaById) {
      return this.sendError(res, 500, 'Media service not available')
    }

    try {
      const media = await this.getMediaById(mediaId)
      if (!media || !media.path) {
        return this.sendError(res, 404, 'Media not found')
      }

      const filePath = media.path
      if (!fs.existsSync(filePath)) {
        return this.sendError(res, 404, 'File not found')
      }

      const stat = fs.statSync(filePath)
      const fileSize = stat.size
      const ext = path.extname(filePath).toLowerCase()

      const mimeTypes: Record<string, string> = {
        '.mp4': 'video/mp4',
        '.mkv': 'video/x-matroska',
        '.avi': 'video/x-msvideo',
        '.mov': 'video/quicktime',
        '.webm': 'video/webm',
        '.m4v': 'video/x-m4v',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.png': 'image/png',
        '.gif': 'image/gif',
        '.webp': 'image/webp'
      }

      const contentType = mimeTypes[ext] || 'application/octet-stream'
      const range = req.headers.range

      if (range) {
        const parts = range.replace(/bytes=/, '').split('-')
        const start = parseInt(parts[0], 10)
        const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1
        const chunksize = end - start + 1

        res.writeHead(206, {
          'Content-Range': `bytes ${start}-${end}/${fileSize}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': chunksize,
          'Content-Type': contentType
        })

        fs.createReadStream(filePath, { start, end }).pipe(res)
      } else {
        res.writeHead(200, {
          'Content-Length': fileSize,
          'Content-Type': contentType,
          'Accept-Ranges': 'bytes'
        })

        fs.createReadStream(filePath).pipe(res)
      }
    } catch (err: any) {
      console.error('[MobileSync] Stream error:', err)
      return this.sendError(res, 500, err.message)
    }
  }

  private async handleMediaThumb(res: http.ServerResponse, mediaId: string): Promise<void> {
    if (!this.getMediaById) {
      return this.sendError(res, 500, 'Media service not available')
    }

    try {
      const media = await this.getMediaById(mediaId)
      if (!media) {
        return this.sendError(res, 404, 'Media not found')
      }

      let thumbPath = media.thumbPath

      // If no thumb exists, try to generate one on-demand
      if ((!thumbPath || !fs.existsSync(thumbPath)) && this.generateThumb) {
        console.log('[MobileSync] Generating thumb for:', mediaId)
        thumbPath = await this.generateThumb(mediaId)
      }

      if (!thumbPath || !fs.existsSync(thumbPath)) {
        // For images, serve the actual image as the thumb
        if (media.type === 'image' && media.path && fs.existsSync(media.path)) {
          const stat = fs.statSync(media.path)
          const ext = path.extname(media.path).toLowerCase()
          const mimeTypes: Record<string, string> = {
            '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
            '.png': 'image/png', '.gif': 'image/gif',
            '.webp': 'image/webp', '.heic': 'image/heic'
          }
          res.writeHead(200, {
            'Content-Length': stat.size,
            'Content-Type': mimeTypes[ext] || 'image/jpeg',
            'Cache-Control': 'public, max-age=86400'
          })
          return fs.createReadStream(media.path).pipe(res) as any
        }
        return this.sendError(res, 404, 'Thumbnail not found')
      }

      const stat = fs.statSync(thumbPath)
      res.writeHead(200, {
        'Content-Length': stat.size,
        'Content-Type': 'image/jpeg',
        'Cache-Control': 'public, max-age=86400'
      })

      fs.createReadStream(thumbPath).pipe(res)
    } catch (err: any) {
      return this.sendError(res, 500, err.message)
    }
  }

  private async handlePlaylists(res: http.ServerResponse): Promise<void> {
    if (!this.getPlaylists) {
      return this.sendError(res, 500, 'Playlist service not available')
    }

    try {
      const playlists = await this.getPlaylists()
      return this.sendJson(res, {
        items: playlists.map((p: any) => ({
          id: p.id,
          name: p.name,
          itemCount: p.itemCount || 0,
          createdAt: p.createdAt,
          isSmart: !!p.isSmart
        }))
      })
    } catch (err: any) {
      return this.sendError(res, 500, err.message)
    }
  }

  private async handlePlaylistDetail(res: http.ServerResponse, playlistId: string): Promise<void> {
    if (!this.getPlaylistItems) {
      return this.sendError(res, 500, 'Playlist service not available')
    }

    try {
      const items = await this.getPlaylistItems(playlistId)
      return this.sendJson(res, {
        id: playlistId,
        items: items.map((item: any) => ({
          id: item.media?.id || item.mediaId,
          filename: item.media?.filename || item.filename,
          type: item.media?.type || item.type,
          durationSec: item.media?.durationSec || item.durationSec,
          hasThumb: !!(item.media?.thumbPath || item.thumbPath)
        }))
      })
    } catch (err: any) {
      return this.sendError(res, 500, err.message)
    }
  }

  private async handleAddPlaylistItems(req: http.IncomingMessage, res: http.ServerResponse, playlistId: string): Promise<void> {
    if (!this.addPlaylistItems) {
      return this.sendError(res, 500, 'Playlist service not available')
    }

    try {
      const body = await this.parseJsonBody(req)
      const { mediaIds } = body

      if (!mediaIds || !Array.isArray(mediaIds) || mediaIds.length === 0) {
        return this.sendError(res, 400, 'mediaIds array is required')
      }

      await this.addPlaylistItems(playlistId, mediaIds)
      console.log('[MobileSync] Added', mediaIds.length, 'items to playlist', playlistId)

      return this.sendJson(res, {
        success: true,
        added: mediaIds.length
      })
    } catch (err: any) {
      return this.sendError(res, 500, err.message)
    }
  }

  private async handleTags(res: http.ServerResponse): Promise<void> {
    if (!this.getTags) {
      return this.sendError(res, 500, 'Tag service not available')
    }

    try {
      const tags = await this.getTags()
      return this.sendJson(res, { tags })
    } catch (err: any) {
      return this.sendError(res, 500, err.message)
    }
  }

  private async handleSyncStatus(res: http.ServerResponse): Promise<void> {
    // Return current sync state
    return this.sendJson(res, {
      lastSync: Date.now(),
      serverVersion: '1.0.0'
    })
  }

  private handleDevices(res: http.ServerResponse): void {
    return this.sendJson(res, {
      devices: this.getPairedDevices().map(d => ({
        id: d.id,
        name: d.name,
        platform: d.platform,
        pairedAt: d.pairedAt,
        lastSeen: d.lastSeen
      }))
    })
  }

  // ─────────────────────────────────────────────────────────────────────────
  // HELPERS
  // ─────────────────────────────────────────────────────────────────────────

  private sendJson(res: http.ServerResponse, data: any): void {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(data))
  }

  private sendError(res: http.ServerResponse, status: number, message: string): void {
    res.writeHead(status, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: message }))
  }

  private async parseJsonBody(req: http.IncomingMessage): Promise<any> {
    return new Promise((resolve, reject) => {
      let body = ''
      req.on('data', chunk => { body += chunk.toString() })
      req.on('end', () => {
        try {
          resolve(body ? JSON.parse(body) : {})
        } catch (err) {
          reject(new Error('Invalid JSON body'))
        }
      })
      req.on('error', reject)
    })
  }

  private generateSecureCode(length: number): string {
    const chars = '0123456789'
    let code = ''
    const randomBytes = crypto.randomBytes(length)
    for (let i = 0; i < length; i++) {
      code += chars[randomBytes[i] % chars.length]
    }
    return code
  }

  private generateSecureToken(): string {
    return crypto.randomBytes(32).toString('hex')
  }

  private cleanupExpiredSessions(): void {
    const now = Date.now()
    for (const [code, session] of this.activePairingSessions) {
      if (session.expiresAt < now) {
        this.activePairingSessions.delete(code)
      }
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PERSISTENCE
  // ─────────────────────────────────────────────────────────────────────────

  private getStoragePath(): string {
    const appData = process.env.APPDATA || process.env.HOME || os.homedir()
    return path.join(appData, '.vault', 'mobile-devices.json')
  }

  private loadPairedDevices(): void {
    try {
      const storagePath = this.getStoragePath()
      if (fs.existsSync(storagePath)) {
        const data = JSON.parse(fs.readFileSync(storagePath, 'utf-8'))
        for (const device of data.devices || []) {
          this.pairedDevices.set(device.id, device)
          this.tokenToDeviceId.set(device.token, device.id)
        }
        console.log('[MobileSync] Loaded', this.pairedDevices.size, 'paired devices')
      }
    } catch (err) {
      console.error('[MobileSync] Failed to load paired devices:', err)
    }
  }

  private savePairedDevices(): void {
    try {
      const storagePath = this.getStoragePath()
      const dir = path.dirname(storagePath)
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
      }
      fs.writeFileSync(storagePath, JSON.stringify({
        devices: Array.from(this.pairedDevices.values())
      }, null, 2))
    } catch (err) {
      console.error('[MobileSync] Failed to save paired devices:', err)
    }
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    this.stop()
    this.removeAllListeners()
  }
}

// Singleton instance
let mobileSyncService: MobileSyncService | null = null

export function getMobileSyncService(): MobileSyncService {
  if (!mobileSyncService) {
    mobileSyncService = new MobileSyncService()
  }
  return mobileSyncService
}

export default MobileSyncService
