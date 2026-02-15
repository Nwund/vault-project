// File: src/main/services/dlna-service.ts
// DLNA/UPnP service for casting media to smart TVs

/// <reference path="../types/dlnacasts2.d.ts" />

import { EventEmitter } from 'events'
import * as http from 'http'
import * as path from 'path'
import * as fs from 'fs'

// Dynamic import for dlnacasts2
let dlnacasts: any = null

export interface DLNADevice {
  id: string
  name: string
  host: string
  xml: string
  type: 'dlna' | 'chromecast'
  status: 'idle' | 'playing' | 'paused' | 'buffering'
}

export interface CastStatus {
  deviceId: string
  state: 'idle' | 'playing' | 'paused' | 'buffering' | 'stopped'
  currentTime: number
  duration: number
  volume: number
  muted: boolean
  mediaPath: string | null
}

export interface CastOptions {
  title?: string
  type?: 'video' | 'image'
  autoplay?: boolean
  startPosition?: number
}

// Queue system types
export interface CastQueueItem {
  mediaId: string
  path: string
  title: string
  duration?: number
}

export interface CastQueue {
  items: CastQueueItem[]
  currentIndex: number
  shuffleEnabled: boolean
  repeatMode: 'none' | 'one' | 'all'
  originalOrder: CastQueueItem[] // For unshuffle
}

class DLNAService extends EventEmitter {
  private devices: Map<string, DLNADevice> = new Map()
  private browser: any = null
  private activeDevice: any = null
  private activeDeviceId: string | null = null
  private mediaServer: http.Server | null = null
  private mediaServerPort: number = 0
  private currentMediaPath: string | null = null
  private isScanning: boolean = false
  private statusPollInterval: NodeJS.Timeout | null = null

  // Queue system
  private queue: CastQueue = {
    items: [],
    currentIndex: -1,
    shuffleEnabled: false,
    repeatMode: 'none',
    originalOrder: []
  }
  private lastPlaybackState: CastStatus['state'] = 'idle'
  private autoAdvanceEnabled: boolean = true

  constructor() {
    super()
    this.initDlnacasts()
  }

  private async initDlnacasts(): Promise<void> {
    try {
      dlnacasts = await import('dlnacasts2')
      console.log('[DLNA] dlnacasts2 loaded successfully')
    } catch (err) {
      console.error('[DLNA] Failed to load dlnacasts2:', err)
    }
  }

  /**
   * Start scanning for DLNA devices on the network
   */
  async startDiscovery(): Promise<void> {
    if (this.isScanning) {
      console.log('[DLNA] Already scanning')
      return
    }

    if (!dlnacasts) {
      await this.initDlnacasts()
      if (!dlnacasts) {
        throw new Error('DLNA library not available')
      }
    }

    this.isScanning = true
    this.devices.clear()

    try {
      this.browser = dlnacasts.default ? dlnacasts.default() : dlnacasts()

      this.browser.on('update', (device: any) => {
        const dlnaDevice: DLNADevice = {
          id: this.generateDeviceId(device),
          name: device.name || 'Unknown Device',
          host: device.host || '',
          xml: device.xml || '',
          type: 'dlna',
          status: 'idle',
        }

        this.devices.set(dlnaDevice.id, dlnaDevice)
        this.emit('deviceFound', dlnaDevice)
        console.log('[DLNA] Device found:', dlnaDevice.name)
      })

      console.log('[DLNA] Started device discovery')
      this.emit('discoveryStarted')
    } catch (err) {
      this.isScanning = false
      console.error('[DLNA] Discovery error:', err)
      throw err
    }
  }

  /**
   * Stop scanning for devices
   */
  stopDiscovery(): void {
    if (this.browser) {
      try {
        this.browser.destroy?.()
      } catch {
        // Ignore cleanup errors
      }
      this.browser = null
    }
    this.isScanning = false
    this.emit('discoveryStopped')
    console.log('[DLNA] Stopped device discovery')
  }

  /**
   * Get all discovered devices
   */
  getDevices(): DLNADevice[] {
    return Array.from(this.devices.values())
  }

  /**
   * Connect to a device by IP address manually
   */
  async connectManual(ip: string): Promise<boolean> {
    console.log('[DLNA] Attempting manual connection to:', ip)

    // Create a manual device entry
    const manualDevice: DLNADevice = {
      id: `manual-${ip.replace(/\./g, '-')}`,
      name: `TV @ ${ip}`,
      host: ip,
      xml: '',
      type: 'dlna',
      status: 'idle'
    }

    // Add to devices list
    this.devices.set(manualDevice.id, manualDevice)
    this.emit('deviceFound', manualDevice)

    // Try to create a player for this device
    if (dlnacasts) {
      try {
        // Create a synthetic device object that dlnacasts can use
        const syntheticDevice = {
          name: manualDevice.name,
          host: ip,
          xml: `http://${ip}:8008/ssdp/device-desc.xml` // Common DLNA description URL
        }

        this.browser = dlnacasts.default ? dlnacasts.default() : dlnacasts()

        // The device is added - actual connection happens when casting
        console.log('[DLNA] Manual device registered:', manualDevice.name)
        return true
      } catch (err) {
        console.error('[DLNA] Manual connection error:', err)
        return false
      }
    }

    return true
  }

  /**
   * Generate unique device ID
   */
  private generateDeviceId(device: any): string {
    const host = device.host || 'unknown'
    const name = device.name || 'device'
    return `${name.toLowerCase().replace(/\s+/g, '-')}-${host.replace(/\./g, '-')}`
  }

  /**
   * Start local media server to serve files to DLNA devices
   */
  private async startMediaServer(): Promise<number> {
    if (this.mediaServer) {
      return this.mediaServerPort
    }

    return new Promise((resolve, reject) => {
      this.mediaServer = http.createServer((req, res) => {
        if (!this.currentMediaPath) {
          res.writeHead(404)
          res.end('No media')
          return
        }

        const filePath = this.currentMediaPath
        const stat = fs.statSync(filePath)
        const fileSize = stat.size
        const ext = path.extname(filePath).toLowerCase()
        const mimeTypes: Record<string, string> = {
          '.mp4': 'video/mp4',
          '.mkv': 'video/x-matroska',
          '.avi': 'video/x-msvideo',
          '.mov': 'video/quicktime',
          '.webm': 'video/webm',
          '.wmv': 'video/x-ms-wmv',
          '.flv': 'video/x-flv',
          '.m4v': 'video/x-m4v',
          '.jpg': 'image/jpeg',
          '.jpeg': 'image/jpeg',
          '.png': 'image/png',
          '.gif': 'image/gif',
          '.webp': 'image/webp',
        }

        const contentType = mimeTypes[ext] || 'application/octet-stream'
        const range = req.headers.range

        if (range) {
          // Handle range requests for seeking
          const parts = range.replace(/bytes=/, '').split('-')
          const start = parseInt(parts[0], 10)
          const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1
          const chunksize = end - start + 1

          const file = fs.createReadStream(filePath, { start, end })
          res.writeHead(206, {
            'Content-Range': `bytes ${start}-${end}/${fileSize}`,
            'Accept-Ranges': 'bytes',
            'Content-Length': chunksize,
            'Content-Type': contentType,
            'Access-Control-Allow-Origin': '*',
          })
          file.pipe(res)
        } else {
          res.writeHead(200, {
            'Content-Length': fileSize,
            'Content-Type': contentType,
            'Accept-Ranges': 'bytes',
            'Access-Control-Allow-Origin': '*',
          })
          fs.createReadStream(filePath).pipe(res)
        }
      })

      this.mediaServer.on('error', (err) => {
        console.error('[DLNA] Media server error:', err)
        reject(err)
      })

      // Listen on random available port
      this.mediaServer.listen(0, '0.0.0.0', () => {
        const address = this.mediaServer!.address()
        if (address && typeof address === 'object') {
          this.mediaServerPort = address.port
          console.log('[DLNA] Media server started on port', this.mediaServerPort)
          resolve(this.mediaServerPort)
        } else {
          reject(new Error('Failed to get server address'))
        }
      })
    })
  }

  /**
   * Stop media server
   */
  private stopMediaServer(): void {
    if (this.mediaServer) {
      this.mediaServer.close()
      this.mediaServer = null
      this.mediaServerPort = 0
      console.log('[DLNA] Media server stopped')
    }
  }

  /**
   * Get local IP address for serving media
   */
  private getLocalIP(): string {
    const os = require('os')
    const interfaces = os.networkInterfaces()

    for (const name of Object.keys(interfaces)) {
      for (const iface of interfaces[name]) {
        // Skip internal and non-IPv4 addresses
        if (iface.family === 'IPv4' && !iface.internal) {
          return iface.address
        }
      }
    }
    return '127.0.0.1'
  }

  /**
   * Cast media to a DLNA device
   */
  async cast(deviceId: string, mediaPath: string, options: CastOptions = {}): Promise<void> {
    const device = this.devices.get(deviceId)
    if (!device) {
      throw new Error(`Device not found: ${deviceId}`)
    }

    // Verify file exists
    if (!fs.existsSync(mediaPath)) {
      throw new Error(`Media file not found: ${mediaPath}`)
    }

    // Start media server
    await this.startMediaServer()

    this.currentMediaPath = mediaPath
    this.activeDeviceId = deviceId

    const localIP = this.getLocalIP()
    const mediaUrl = `http://${localIP}:${this.mediaServerPort}/media`
    const ext = path.extname(mediaPath).toLowerCase()
    const isVideo = ['.mp4', '.mkv', '.avi', '.mov', '.webm', '.wmv', '.flv', '.m4v'].includes(ext)

    console.log('[DLNA] Casting to', device.name, ':', mediaUrl)

    return new Promise((resolve, reject) => {
      if (!this.browser) {
        reject(new Error('DLNA browser not initialized'))
        return
      }

      // Find the device in the browser's device list
      const browserDevice = this.browser.players?.find(
        (p: any) => this.generateDeviceId(p) === deviceId
      )

      if (!browserDevice) {
        reject(new Error('Device not found in browser'))
        return
      }

      this.activeDevice = browserDevice

      // Build play options - only include seek if we have a start position
      // Some TVs (like webOS) don't support seek mode
      const playOptions: any = {
        title: options.title || path.basename(mediaPath),
        type: isVideo ? 'video/mp4' : 'image/jpeg',
        autoplay: options.autoplay !== false,
      }

      // Only add seek if we actually need to start somewhere other than beginning
      if (options.startPosition && options.startPosition > 0) {
        playOptions.seek = options.startPosition
      }

      browserDevice.play(mediaUrl, playOptions, (err: Error | null) => {
        if (err) {
          console.error('[DLNA] Cast error:', err)
          reject(err)
          return
        }

        console.log('[DLNA] Casting started successfully')
        this.startStatusPolling()
        resolve()
      })
    })
  }

  /**
   * Start polling for playback status
   */
  private startStatusPolling(): void {
    this.stopStatusPolling()

    this.statusPollInterval = setInterval(async () => {
      try {
        const status = await this.getPlaybackStatus()
        this.emit('statusUpdate', status)

        // Detect playback end for auto-advance
        if (this.lastPlaybackState === 'playing' && status.state === 'stopped') {
          // Playback just ended
          this.handlePlaybackEnded()
        }
        this.lastPlaybackState = status.state
      } catch {
        // Ignore status errors
      }
    }, 1000)
  }

  /**
   * Stop status polling
   */
  private stopStatusPolling(): void {
    if (this.statusPollInterval) {
      clearInterval(this.statusPollInterval)
      this.statusPollInterval = null
    }
  }

  /**
   * Get current playback status
   */
  async getPlaybackStatus(): Promise<CastStatus> {
    return new Promise((resolve, reject) => {
      if (!this.activeDevice) {
        resolve({
          deviceId: '',
          state: 'idle',
          currentTime: 0,
          duration: 0,
          volume: 1,
          muted: false,
          mediaPath: null,
        })
        return
      }

      this.activeDevice.status((err: Error | null, status: any) => {
        if (err) {
          reject(err)
          return
        }

        resolve({
          deviceId: this.activeDeviceId || '',
          state: this.mapPlayState(status?.playerState || 'IDLE'),
          currentTime: status?.currentTime || 0,
          duration: status?.media?.duration || 0,
          volume: status?.volume?.level || 1,
          muted: status?.volume?.muted || false,
          mediaPath: this.currentMediaPath,
        })
      })
    })
  }

  /**
   * Map DLNA player state to our state
   */
  private mapPlayState(state: string): CastStatus['state'] {
    switch (state.toUpperCase()) {
      case 'PLAYING':
        return 'playing'
      case 'PAUSED':
        return 'paused'
      case 'BUFFERING':
        return 'buffering'
      case 'STOPPED':
        return 'stopped'
      default:
        return 'idle'
    }
  }

  /**
   * Pause playback
   */
  async pause(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.activeDevice) {
        reject(new Error('No active device'))
        return
      }

      this.activeDevice.pause((err: Error | null) => {
        if (err) reject(err)
        else resolve()
      })
    })
  }

  /**
   * Resume playback
   */
  async play(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.activeDevice) {
        reject(new Error('No active device'))
        return
      }

      this.activeDevice.play((err: Error | null) => {
        if (err) reject(err)
        else resolve()
      })
    })
  }

  /**
   * Stop playback
   */
  async stop(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.activeDevice) {
        resolve()
        return
      }

      this.activeDevice.stop((err: Error | null) => {
        this.stopStatusPolling()
        this.activeDevice = null
        this.activeDeviceId = null
        this.stopMediaServer()

        if (err) reject(err)
        else resolve()
      })
    })
  }

  /**
   * Seek to position (gracefully handles unsupported devices)
   */
  async seek(position: number): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.activeDevice) {
        reject(new Error('No active device'))
        return
      }

      this.activeDevice.seek(position, (err: Error | null) => {
        if (err) {
          // Handle "Seek mode not supported" (error 710) gracefully
          if (err.message?.includes('710') || err.message?.includes('Seek mode not supported')) {
            console.log('[DLNA] Seek not supported on this device, ignoring')
            resolve() // Don't fail, just ignore
          } else {
            reject(err)
          }
        } else {
          resolve()
        }
      })
    })
  }

  /**
   * Set volume (0-1)
   */
  async setVolume(volume: number): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.activeDevice) {
        reject(new Error('No active device'))
        return
      }

      const clampedVolume = Math.max(0, Math.min(1, volume))
      this.activeDevice.volume(clampedVolume, (err: Error | null) => {
        if (err) reject(err)
        else resolve()
      })
    })
  }

  /**
   * Check if currently casting
   */
  isCasting(): boolean {
    return this.activeDevice !== null
  }

  /**
   * Get active device info
   */
  getActiveDevice(): DLNADevice | null {
    if (!this.activeDeviceId) return null
    return this.devices.get(this.activeDeviceId) || null
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // QUEUE MANAGEMENT
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Set the entire cast queue
   */
  setQueue(items: CastQueueItem[]): void {
    this.queue = {
      items: [...items],
      currentIndex: items.length > 0 ? 0 : -1,
      shuffleEnabled: false,
      repeatMode: 'none',
      originalOrder: [...items]
    }
    this.emit('queueUpdated', this.getQueueState())
    console.log('[DLNA] Queue set with', items.length, 'items')
  }

  /**
   * Add a single item to the queue
   */
  addToQueue(item: CastQueueItem): void {
    this.queue.items.push(item)
    this.queue.originalOrder.push(item)
    // If queue was empty, set current index to first item
    if (this.queue.currentIndex === -1) {
      this.queue.currentIndex = 0
    }
    this.emit('queueUpdated', this.getQueueState())
    console.log('[DLNA] Added to queue:', item.title)
  }

  /**
   * Clear the queue
   */
  clearQueue(): void {
    this.queue = {
      items: [],
      currentIndex: -1,
      shuffleEnabled: false,
      repeatMode: 'none',
      originalOrder: []
    }
    this.emit('queueUpdated', this.getQueueState())
    console.log('[DLNA] Queue cleared')
  }

  /**
   * Get current queue state
   */
  getQueueState(): CastQueue & { currentItem: CastQueueItem | null } {
    return {
      ...this.queue,
      currentItem: this.queue.currentIndex >= 0 ? this.queue.items[this.queue.currentIndex] : null
    }
  }

  /**
   * Play the next item in the queue
   */
  async playNext(): Promise<boolean> {
    if (this.queue.items.length === 0) return false

    let nextIndex = this.queue.currentIndex + 1

    // Handle repeat modes
    if (nextIndex >= this.queue.items.length) {
      if (this.queue.repeatMode === 'all') {
        nextIndex = 0
      } else {
        // End of queue
        this.emit('queueEnded')
        return false
      }
    }

    return this.playAtIndex(nextIndex)
  }

  /**
   * Play the previous item in the queue
   */
  async playPrevious(): Promise<boolean> {
    if (this.queue.items.length === 0) return false

    let prevIndex = this.queue.currentIndex - 1

    // Handle wrap-around with repeat all
    if (prevIndex < 0) {
      if (this.queue.repeatMode === 'all') {
        prevIndex = this.queue.items.length - 1
      } else {
        prevIndex = 0 // Stay at first item
      }
    }

    return this.playAtIndex(prevIndex)
  }

  /**
   * Play item at specific index in queue
   */
  async playAtIndex(index: number): Promise<boolean> {
    if (index < 0 || index >= this.queue.items.length) return false

    const item = this.queue.items[index]
    this.queue.currentIndex = index

    try {
      // Cast to the active device
      if (!this.activeDeviceId) {
        console.warn('[DLNA] No active device for queue playback')
        return false
      }

      await this.cast(this.activeDeviceId, item.path, {
        title: item.title,
        type: 'video',
        autoplay: true
      })

      this.emit('queueUpdated', this.getQueueState())
      return true
    } catch (err) {
      console.error('[DLNA] Failed to play queue item:', err)
      return false
    }
  }

  /**
   * Toggle shuffle mode
   */
  setShuffle(enabled: boolean): void {
    if (enabled && !this.queue.shuffleEnabled) {
      // Enable shuffle - randomize items except current
      const currentItem = this.queue.items[this.queue.currentIndex]
      const otherItems = this.queue.items.filter((_, i) => i !== this.queue.currentIndex)

      // Fisher-Yates shuffle
      for (let i = otherItems.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[otherItems[i], otherItems[j]] = [otherItems[j], otherItems[i]]
      }

      // Put current item at start, then shuffled items
      if (currentItem) {
        this.queue.items = [currentItem, ...otherItems]
        this.queue.currentIndex = 0
      } else {
        this.queue.items = otherItems
      }
    } else if (!enabled && this.queue.shuffleEnabled) {
      // Disable shuffle - restore original order
      const currentItem = this.queue.items[this.queue.currentIndex]
      this.queue.items = [...this.queue.originalOrder]

      // Find current item in restored order
      if (currentItem) {
        const newIndex = this.queue.items.findIndex(i => i.mediaId === currentItem.mediaId)
        this.queue.currentIndex = newIndex >= 0 ? newIndex : 0
      }
    }

    this.queue.shuffleEnabled = enabled
    this.emit('queueUpdated', this.getQueueState())
    console.log('[DLNA] Shuffle', enabled ? 'enabled' : 'disabled')
  }

  /**
   * Set repeat mode
   */
  setRepeat(mode: 'none' | 'one' | 'all'): void {
    this.queue.repeatMode = mode
    this.emit('queueUpdated', this.getQueueState())
    console.log('[DLNA] Repeat mode set to:', mode)
  }

  /**
   * Reorder queue items (drag and drop)
   */
  reorderQueue(fromIndex: number, toIndex: number): void {
    if (fromIndex < 0 || fromIndex >= this.queue.items.length) return
    if (toIndex < 0 || toIndex >= this.queue.items.length) return

    const [item] = this.queue.items.splice(fromIndex, 1)
    this.queue.items.splice(toIndex, 0, item)

    // Update current index if affected
    if (this.queue.currentIndex === fromIndex) {
      this.queue.currentIndex = toIndex
    } else if (fromIndex < this.queue.currentIndex && toIndex >= this.queue.currentIndex) {
      this.queue.currentIndex--
    } else if (fromIndex > this.queue.currentIndex && toIndex <= this.queue.currentIndex) {
      this.queue.currentIndex++
    }

    this.emit('queueUpdated', this.getQueueState())
    console.log('[DLNA] Queue reordered')
  }

  /**
   * Remove item from queue by index
   */
  removeFromQueue(index: number): void {
    if (index < 0 || index >= this.queue.items.length) return

    this.queue.items.splice(index, 1)

    // Update current index
    if (index < this.queue.currentIndex) {
      this.queue.currentIndex--
    } else if (index === this.queue.currentIndex) {
      // Current item removed - stay at same index (which is now next item)
      if (this.queue.currentIndex >= this.queue.items.length) {
        this.queue.currentIndex = this.queue.items.length - 1
      }
    }

    if (this.queue.items.length === 0) {
      this.queue.currentIndex = -1
    }

    this.emit('queueUpdated', this.getQueueState())
    console.log('[DLNA] Removed item from queue')
  }

  /**
   * Handle auto-advance when playback ends
   * Called by status polling when state changes to stopped
   */
  private async handlePlaybackEnded(): Promise<void> {
    if (!this.autoAdvanceEnabled) return
    if (this.queue.items.length === 0) return

    console.log('[DLNA] Playback ended, checking for next item...')

    // Handle repeat one mode
    if (this.queue.repeatMode === 'one') {
      await this.playAtIndex(this.queue.currentIndex)
      return
    }

    // Try to play next item
    const hasNext = await this.playNext()
    if (!hasNext) {
      console.log('[DLNA] Queue finished')
      this.emit('queueEnded')
    }
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    this.stopStatusPolling()
    this.stopDiscovery()
    this.stopMediaServer()
    this.clearQueue()
    this.removeAllListeners()
  }
}

// Singleton instance
let dlnaService: DLNAService | null = null

export function getDLNAService(): DLNAService {
  if (!dlnaService) {
    dlnaService = new DLNAService()
  }
  return dlnaService
}

export default DLNAService
