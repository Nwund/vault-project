// File: src/main/services/file-watcher.ts
// Real-time directory monitoring for auto-import

import { EventEmitter } from 'events'
import fs from 'fs'
import path from 'path'

export interface WatchedDirectory {
  path: string
  recursive: boolean
  enabled: boolean
  autoImport: boolean
  lastEvent: number | null
}

export interface FileEvent {
  type: 'add' | 'change' | 'unlink' | 'addDir' | 'unlinkDir'
  path: string
  directory: string
  timestamp: number
}

const MEDIA_EXTENSIONS = new Set([
  '.mp4', '.mkv', '.avi', '.mov', '.wmv', '.webm', '.m4v', '.flv',
  '.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.tiff',
])

export class FileWatcherService extends EventEmitter {
  private watchers: Map<string, fs.FSWatcher> = new Map()
  private directories: Map<string, WatchedDirectory> = new Map()
  private eventQueue: FileEvent[] = []
  private debounceTimer: NodeJS.Timeout | null = null
  private debounceMs: number = 500
  private isProcessing: boolean = false
  private stats = {
    totalEvents: 0,
    filesAdded: 0,
    filesChanged: 0,
    filesRemoved: 0
  }

  constructor() {
    super()
  }

  /**
   * Add a directory to watch
   */
  watchDirectory(dirPath: string, options?: {
    recursive?: boolean
    autoImport?: boolean
  }): WatchedDirectory | null {
    if (!fs.existsSync(dirPath)) {
      console.error(`[FileWatcher] Directory does not exist: ${dirPath}`)
      return null
    }

    const stats = fs.statSync(dirPath)
    if (!stats.isDirectory()) {
      console.error(`[FileWatcher] Not a directory: ${dirPath}`)
      return null
    }

    // Already watching?
    if (this.watchers.has(dirPath)) {
      const dir = this.directories.get(dirPath)
      return dir || null
    }

    const watchedDir: WatchedDirectory = {
      path: dirPath,
      recursive: options?.recursive ?? true,
      enabled: true,
      autoImport: options?.autoImport ?? true,
      lastEvent: null
    }

    try {
      const watcher = fs.watch(dirPath, { recursive: watchedDir.recursive }, (eventType, filename) => {
        if (!filename) return
        this.handleFileEvent(dirPath, eventType, filename)
      })

      watcher.on('error', (err) => {
        console.error(`[FileWatcher] Error watching ${dirPath}:`, err)
        this.emit('watchError', { directory: dirPath, error: err })
      })

      this.watchers.set(dirPath, watcher)
      this.directories.set(dirPath, watchedDir)

      console.log(`[FileWatcher] Now watching: ${dirPath}`)
      this.emit('directoryAdded', watchedDir)

      return watchedDir
    } catch (e: any) {
      console.error(`[FileWatcher] Failed to watch ${dirPath}:`, e)
      return null
    }
  }

  /**
   * Stop watching a directory
   */
  unwatchDirectory(dirPath: string): boolean {
    const watcher = this.watchers.get(dirPath)
    if (!watcher) return false

    watcher.close()
    this.watchers.delete(dirPath)
    this.directories.delete(dirPath)

    console.log(`[FileWatcher] Stopped watching: ${dirPath}`)
    this.emit('directoryRemoved', dirPath)

    return true
  }

  /**
   * Toggle watching for a directory
   */
  toggleDirectory(dirPath: string, enabled: boolean): WatchedDirectory | null {
    const dir = this.directories.get(dirPath)
    if (!dir) return null

    if (enabled && !this.watchers.has(dirPath)) {
      // Re-add watcher
      return this.watchDirectory(dirPath, {
        recursive: dir.recursive,
        autoImport: dir.autoImport
      })
    } else if (!enabled && this.watchers.has(dirPath)) {
      // Remove watcher but keep config
      const watcher = this.watchers.get(dirPath)
      watcher?.close()
      this.watchers.delete(dirPath)
    }

    dir.enabled = enabled
    return dir
  }

  /**
   * Get all watched directories
   */
  getWatchedDirectories(): WatchedDirectory[] {
    return Array.from(this.directories.values())
  }

  /**
   * Handle file system event
   */
  private handleFileEvent(dirPath: string, eventType: string, filename: string): void {
    const fullPath = path.join(dirPath, filename)
    const ext = path.extname(filename).toLowerCase()

    // Only process media files
    if (!MEDIA_EXTENSIONS.has(ext)) {
      return
    }

    const dir = this.directories.get(dirPath)
    if (dir) {
      dir.lastEvent = Date.now()
    }

    let type: FileEvent['type'] = 'change'

    // Determine event type
    if (eventType === 'rename') {
      if (fs.existsSync(fullPath)) {
        const stats = fs.statSync(fullPath)
        type = stats.isDirectory() ? 'addDir' : 'add'
      } else {
        type = 'unlink'
      }
    }

    const event: FileEvent = {
      type,
      path: fullPath,
      directory: dirPath,
      timestamp: Date.now()
    }

    this.stats.totalEvents++
    if (type === 'add') this.stats.filesAdded++
    else if (type === 'change') this.stats.filesChanged++
    else if (type === 'unlink') this.stats.filesRemoved++

    this.queueEvent(event)
  }

  /**
   * Queue event with debouncing
   */
  private queueEvent(event: FileEvent): void {
    this.eventQueue.push(event)

    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer)
    }

    this.debounceTimer = setTimeout(() => {
      this.processEventQueue()
    }, this.debounceMs)
  }

  /**
   * Process queued events
   */
  private async processEventQueue(): Promise<void> {
    if (this.isProcessing || this.eventQueue.length === 0) {
      return
    }

    this.isProcessing = true
    const events = [...this.eventQueue]
    this.eventQueue = []

    // Deduplicate events for the same file
    const uniqueEvents = new Map<string, FileEvent>()
    for (const event of events) {
      const key = `${event.path}:${event.type}`
      // Keep the most recent event for each file+type combo
      if (!uniqueEvents.has(event.path) ||
          uniqueEvents.get(event.path)!.timestamp < event.timestamp) {
        uniqueEvents.set(event.path, event)
      }
    }

    const processedEvents = Array.from(uniqueEvents.values())

    // Emit batch event
    this.emit('filesChanged', processedEvents)

    // Emit individual events for auto-import
    for (const event of processedEvents) {
      if (event.type === 'add') {
        const dir = this.directories.get(event.directory)
        if (dir?.autoImport) {
          this.emit('newMediaFile', event)
        }
      } else if (event.type === 'unlink') {
        this.emit('mediaFileRemoved', event)
      }
    }

    this.isProcessing = false

    // Process any events that came in while we were processing
    if (this.eventQueue.length > 0) {
      this.debounceTimer = setTimeout(() => {
        this.processEventQueue()
      }, this.debounceMs)
    }
  }

  /**
   * Get pending events count
   */
  getPendingCount(): number {
    return this.eventQueue.length
  }

  /**
   * Get watcher statistics
   */
  getStats(): typeof this.stats {
    return { ...this.stats }
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.stats = {
      totalEvents: 0,
      filesAdded: 0,
      filesChanged: 0,
      filesRemoved: 0
    }
  }

  /**
   * Set debounce time
   */
  setDebounceMs(ms: number): void {
    this.debounceMs = Math.max(100, Math.min(5000, ms))
  }

  /**
   * Check if a path is being watched
   */
  isWatching(dirPath: string): boolean {
    return this.watchers.has(dirPath) && (this.directories.get(dirPath)?.enabled ?? false)
  }

  /**
   * Scan a directory for new files (manual trigger)
   */
  async scanDirectory(dirPath: string): Promise<string[]> {
    const newFiles: string[] = []

    if (!fs.existsSync(dirPath)) {
      return newFiles
    }

    const scanRecursive = (dir: string): void => {
      const entries = fs.readdirSync(dir, { withFileTypes: true })

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name)

        if (entry.isDirectory()) {
          scanRecursive(fullPath)
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name).toLowerCase()
          if (MEDIA_EXTENSIONS.has(ext)) {
            newFiles.push(fullPath)
          }
        }
      }
    }

    scanRecursive(dirPath)
    return newFiles
  }

  /**
   * Stop all watchers
   */
  stopAll(): void {
    for (const [dirPath, watcher] of this.watchers) {
      watcher.close()
      console.log(`[FileWatcher] Stopped watching: ${dirPath}`)
    }
    this.watchers.clear()

    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer)
      this.debounceTimer = null
    }

    this.eventQueue = []
    this.emit('allStopped')
  }

  /**
   * Restart all watchers
   */
  restartAll(): void {
    const dirs = Array.from(this.directories.values())
    this.stopAll()

    for (const dir of dirs) {
      if (dir.enabled) {
        this.watchDirectory(dir.path, {
          recursive: dir.recursive,
          autoImport: dir.autoImport
        })
      }
    }
  }
}

// Singleton
let instance: FileWatcherService | null = null

export function getFileWatcherService(): FileWatcherService {
  if (!instance) {
    instance = new FileWatcherService()
  }
  return instance
}
