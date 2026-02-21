// File: src/main/services/url-downloader-service.ts
// URL video downloader service using yt-dlp

import { EventEmitter } from 'events'
import { spawn, ChildProcess } from 'child_process'
import * as path from 'path'
import * as fs from 'fs'
import * as os from 'os'
import { app } from 'electron'
import { nanoid } from 'nanoid'

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface DownloadItem {
  id: string
  url: string
  title: string
  status: 'queued' | 'downloading' | 'processing' | 'completed' | 'error'
  progress: number // 0-100
  speed: string // e.g., "2.5MiB/s"
  eta: string // e.g., "00:45"
  outputPath: string | null
  error: string | null
  thumbnailUrl: string | null
  fileSize: string | null
  duration: string | null
  createdAt: number
  startedAt: number | null
  completedAt: number | null
  source: 'desktop' | 'mobile'
}

export interface DownloadOptions {
  quality?: 'best' | '1080p' | '720p' | '480p'
  audioOnly?: boolean
  outputDir?: string
  filename?: string
}

// ═══════════════════════════════════════════════════════════════════════════
// URL DOWNLOADER SERVICE
// ═══════════════════════════════════════════════════════════════════════════

class UrlDownloaderService extends EventEmitter {
  private downloads: Map<string, DownloadItem> = new Map()
  private activeProcess: ChildProcess | null = null
  private queue: string[] = []
  private isProcessingQueue: boolean = false
  private ytdlpPath: string | null = null
  private downloadDir: string

  constructor() {
    super()
    this.downloadDir = path.join(app.getPath('videos'), 'Vault Downloads')
    this.ensureDownloadDir()
    this.findYtDlp()
  }

  // ─────────────────────────────────────────────────────────────────────────
  // INITIALIZATION
  // ─────────────────────────────────────────────────────────────────────────

  private ensureDownloadDir(): void {
    if (!fs.existsSync(this.downloadDir)) {
      fs.mkdirSync(this.downloadDir, { recursive: true })
    }
  }

  /**
   * Find yt-dlp binary - check bundled location first, then common install locations, then PATH
   */
  private findYtDlp(): void {
    const isWin = os.platform() === 'win32'
    const exe = isWin ? 'yt-dlp.exe' : 'yt-dlp'

    // Build list of paths to check
    const searchPaths = [
      // In production (packaged app)
      path.join(process.resourcesPath || '', 'bin', exe),
      // In development
      path.join(app.getAppPath(), 'resources', 'bin', exe),
      path.join(app.getAppPath(), '..', 'bin', exe),
    ]

    // Add Windows-specific install locations
    if (isWin) {
      const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local')
      searchPaths.push(
        // WinGet Links directory
        path.join(localAppData, 'Microsoft', 'WinGet', 'Links', 'yt-dlp.exe'),
        // Scoop
        path.join(os.homedir(), 'scoop', 'shims', 'yt-dlp.exe'),
        // Chocolatey
        path.join(process.env.ChocolateyInstall || 'C:\\ProgramData\\chocolatey', 'bin', 'yt-dlp.exe'),
      )
    }

    for (const p of searchPaths) {
      if (fs.existsSync(p)) {
        this.ytdlpPath = p
        console.log('[UrlDownloader] Found yt-dlp at:', p)
        return
      }
    }

    // Fallback to PATH
    this.ytdlpPath = exe
    console.log('[UrlDownloader] Using system yt-dlp:', exe)
  }

  /**
   * Check if yt-dlp is available
   */
  async checkAvailability(): Promise<{ available: boolean; version?: string; error?: string }> {
    if (!this.ytdlpPath) {
      return { available: false, error: 'yt-dlp not found' }
    }

    return new Promise((resolve) => {
      try {
        const proc = spawn(this.ytdlpPath!, ['--version'], {
          windowsHide: true,
          timeout: 10000
        })

        let output = ''
        proc.stdout?.on('data', (data) => { output += data.toString() })
        proc.stderr?.on('data', (data) => { output += data.toString() })

        proc.on('close', (code) => {
          if (code === 0) {
            resolve({ available: true, version: output.trim() })
          } else {
            resolve({ available: false, error: `Exit code: ${code}` })
          }
        })

        proc.on('error', (err) => {
          resolve({ available: false, error: err.message })
        })
      } catch (err: any) {
        resolve({ available: false, error: err.message })
      }
    })
  }

  // ─────────────────────────────────────────────────────────────────────────
  // DOWNLOAD MANAGEMENT
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Add a URL to the download queue
   */
  async addDownload(url: string, options?: DownloadOptions, source: 'desktop' | 'mobile' = 'desktop'): Promise<DownloadItem> {
    const id = nanoid()

    const item: DownloadItem = {
      id,
      url,
      title: 'Fetching info...',
      status: 'queued',
      progress: 0,
      speed: '',
      eta: '',
      outputPath: null,
      error: null,
      thumbnailUrl: null,
      fileSize: null,
      duration: null,
      createdAt: Date.now(),
      startedAt: null,
      completedAt: null,
      source
    }

    this.downloads.set(id, item)
    this.queue.push(id)
    this.emit('download:added', item)

    // Fetch video info in background
    this.fetchVideoInfo(id, url)

    // Process queue
    this.processQueue()

    return item
  }

  /**
   * Fetch video info (title, thumbnail, duration)
   */
  private async fetchVideoInfo(id: string, url: string): Promise<void> {
    if (!this.ytdlpPath) return

    const item = this.downloads.get(id)
    if (!item) return

    try {
      const proc = spawn(this.ytdlpPath, [
        '--dump-json',
        '--no-download',
        '--no-warnings',
        url
      ], { windowsHide: true })

      let output = ''
      proc.stdout?.on('data', (data) => { output += data.toString() })

      proc.on('close', (code) => {
        if (code === 0 && output) {
          try {
            // yt-dlp outputs one JSON per line for playlists, so parse line by line
            const lines = output.trim().split('\n')
            for (const line of lines) {
              try {
                const info = JSON.parse(line)
                // Use the first valid entry (or last if it's a playlist summary)
                if (info.title) {
                  item.title = info.title
                  item.thumbnailUrl = info.thumbnail || null
                  item.duration = info.duration_string || (info.duration ? this.formatDuration(info.duration) : null)
                  item.fileSize = info.filesize_approx ? this.formatBytes(info.filesize_approx) : null
                  break
                }
              } catch {
                // Skip invalid JSON lines
              }
            }
            this.emit('download:updated', item)
          } catch (e) {
            console.warn('[UrlDownloader] JSON parse failed for video info:', (e as Error).message)
          }
        }
      })
    } catch (e) {
      console.warn('[UrlDownloader] Info fetch failed (non-critical):', (e as Error).message)
    }
  }

  /**
   * Process the download queue
   */
  private async processQueue(): Promise<void> {
    if (this.isProcessingQueue || this.activeProcess) return
    if (this.queue.length === 0) return
    if (!this.ytdlpPath) return

    this.isProcessingQueue = true

    const id = this.queue.shift()!
    const item = this.downloads.get(id)

    if (!item) {
      this.isProcessingQueue = false
      this.processQueue()
      return
    }

    item.status = 'downloading'
    item.startedAt = Date.now()
    this.emit('download:started', item)

    try {
      await this.executeDownload(item)
    } catch (err: any) {
      item.status = 'error'
      item.error = err.message
      this.emit('download:error', item)
    }

    this.isProcessingQueue = false
    this.processQueue()
  }

  /**
   * Execute the actual download
   */
  private executeDownload(item: DownloadItem): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.ytdlpPath) {
        reject(new Error('yt-dlp not available'))
        return
      }

      const outputTemplate = path.join(this.downloadDir, '%(title)s.%(ext)s')

      const args = [
        '-f', 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best',
        '--merge-output-format', 'mp4',
        '-o', outputTemplate,
        '--newline', // Progress on new lines
        '--progress',
        '--no-warnings',
        '--no-playlist', // Single video only
        '--write-thumbnail',
        '--convert-thumbnails', 'jpg',
        item.url
      ]

      console.log('[UrlDownloader] Starting download:', item.url)

      this.activeProcess = spawn(this.ytdlpPath!, args, {
        windowsHide: true,
        cwd: this.downloadDir
      })

      // Track output file
      let outputFile: string | null = null

      this.activeProcess.stdout?.on('data', (data) => {
        const lines = data.toString().split('\n')
        for (const line of lines) {
          this.parseProgressLine(item, line.trim())

          // Check for destination file
          const destMatch = line.match(/\[download\] Destination: (.+)/)
          if (destMatch) {
            outputFile = destMatch[1].trim()
          }

          // Check for already downloaded
          const alreadyMatch = line.match(/\[download\] (.+) has already been downloaded/)
          if (alreadyMatch) {
            outputFile = alreadyMatch[1].trim()
          }

          // Check for merge output
          const mergeMatch = line.match(/\[Merger\] Merging formats into "(.+)"/)
          if (mergeMatch) {
            outputFile = mergeMatch[1].trim()
          }
        }
      })

      this.activeProcess.stderr?.on('data', (data) => {
        const msg = data.toString().trim()
        if (msg.includes('ERROR')) {
          item.error = msg
        }
      })

      this.activeProcess.on('close', (code) => {
        this.activeProcess = null

        if (code === 0) {
          item.status = 'completed'
          item.progress = 100
          item.completedAt = Date.now()
          item.outputPath = outputFile

          console.log('[UrlDownloader] Download completed:', item.title)
          this.emit('download:completed', item)
          resolve()
        } else {
          item.status = 'error'
          item.error = item.error || `Process exited with code ${code}`
          this.emit('download:error', item)
          reject(new Error(item.error))
        }
      })

      this.activeProcess.on('error', (err) => {
        this.activeProcess = null
        item.status = 'error'
        item.error = err.message
        this.emit('download:error', item)
        reject(err)
      })
    })
  }

  /**
   * Parse yt-dlp progress output
   */
  private parseProgressLine(item: DownloadItem, line: string): void {
    // Parse: [download]  45.2% of 150.00MiB at 2.50MiB/s ETA 00:45
    const progressMatch = line.match(/\[download\]\s+(\d+\.?\d*)%\s+of\s+([\d.]+\w+)\s+at\s+([\d.]+\w+\/s)\s+ETA\s+([\d:]+)/)
    if (progressMatch) {
      const [, percent, size, speed, eta] = progressMatch
      item.progress = parseFloat(percent)
      item.fileSize = size
      item.speed = speed
      item.eta = eta
      this.emit('download:progress', item)
      return
    }

    // Parse: [download]  45.2% of ~150.00MiB at 2.50MiB/s ETA 00:45
    const approxMatch = line.match(/\[download\]\s+(\d+\.?\d*)%\s+of\s+~?([\d.]+\w+)\s+at\s+([\d.]+\w+\/s)\s+ETA\s+([\d:]+)/)
    if (approxMatch) {
      const [, percent, size, speed, eta] = approxMatch
      item.progress = parseFloat(percent)
      item.fileSize = size
      item.speed = speed
      item.eta = eta
      this.emit('download:progress', item)
      return
    }

    // Parse: [download] 100% of 150.00MiB in 00:45
    const completeMatch = line.match(/\[download\]\s+100%\s+of\s+([\d.]+\w+)/)
    if (completeMatch) {
      item.progress = 100
      item.fileSize = completeMatch[1]
      this.emit('download:progress', item)
    }
  }

  /**
   * Cancel a download
   */
  cancelDownload(id: string): boolean {
    const item = this.downloads.get(id)
    if (!item) return false

    // Remove from queue if queued
    const queueIndex = this.queue.indexOf(id)
    if (queueIndex !== -1) {
      this.queue.splice(queueIndex, 1)
      item.status = 'error'
      item.error = 'Cancelled'
      this.emit('download:cancelled', item)
      return true
    }

    // Kill active process if this is the current download
    if (item.status === 'downloading' && this.activeProcess) {
      this.activeProcess.kill('SIGTERM')
      item.status = 'error'
      item.error = 'Cancelled'
      this.emit('download:cancelled', item)
      return true
    }

    return false
  }

  /**
   * Remove a download from history
   */
  removeDownload(id: string): boolean {
    const item = this.downloads.get(id)
    if (!item) return false

    // Cancel if active
    this.cancelDownload(id)

    this.downloads.delete(id)
    this.emit('download:removed', id)
    return true
  }

  /**
   * Get all downloads
   */
  getDownloads(): DownloadItem[] {
    return Array.from(this.downloads.values())
      .sort((a, b) => b.createdAt - a.createdAt)
  }

  /**
   * Get download by ID
   */
  getDownload(id: string): DownloadItem | null {
    return this.downloads.get(id) || null
  }

  /**
   * Clear completed downloads
   */
  clearCompleted(): number {
    let cleared = 0
    for (const [id, item] of this.downloads) {
      if (item.status === 'completed' || item.status === 'error') {
        this.downloads.delete(id)
        cleared++
      }
    }
    this.emit('downloads:cleared', cleared)
    return cleared
  }

  /**
   * Get download directory
   */
  getDownloadDir(): string {
    return this.downloadDir
  }

  /**
   * Set download directory
   */
  setDownloadDir(dir: string): void {
    this.downloadDir = dir
    this.ensureDownloadDir()
  }

  // ─────────────────────────────────────────────────────────────────────────
  // HELPERS
  // ─────────────────────────────────────────────────────────────────────────

  private formatDuration(seconds: number): string {
    const h = Math.floor(seconds / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    const s = Math.floor(seconds % 60)

    if (h > 0) {
      return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
    }
    return `${m}:${s.toString().padStart(2, '0')}`
  }

  private formatBytes(bytes: number): string {
    if (bytes < 1024) return bytes + ' B'
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KiB'
    if (bytes < 1073741824) return (bytes / 1048576).toFixed(1) + ' MiB'
    return (bytes / 1073741824).toFixed(1) + ' GiB'
  }
}

// Singleton instance
let urlDownloaderService: UrlDownloaderService | null = null

export function getUrlDownloaderService(): UrlDownloaderService {
  if (!urlDownloaderService) {
    urlDownloaderService = new UrlDownloaderService()
  }
  return urlDownloaderService
}

export default UrlDownloaderService
