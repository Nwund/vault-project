// File: src/main/services/import-service.ts
// Import media from external sources and formats

import type { DB } from '../db'
import { EventEmitter } from 'events'
import fs from 'fs'
import path from 'path'

export interface ImportSource {
  type: 'folder' | 'playlist' | 'json' | 'csv' | 'hydrus' | 'plex'
  path: string
  options?: Record<string, any>
}

export interface ImportOptions {
  copyFiles?: boolean
  moveFiles?: boolean
  destination?: string
  generateThumbnails?: boolean
  extractMetadata?: boolean
  autoTag?: boolean
  skipDuplicates?: boolean
  preserveStructure?: boolean
  createPlaylist?: boolean
  playlistName?: string
}

export interface ImportProgress {
  total: number
  processed: number
  imported: number
  skipped: number
  failed: number
  currentFile: string
  stage: 'scanning' | 'importing' | 'processing' | 'complete'
}

export interface ImportResult {
  success: boolean
  totalFiles: number
  imported: number
  skipped: number
  failed: number
  errors: Array<{ file: string; error: string }>
  duration: number
  playlistId?: string
}

export interface PlaylistImport {
  name: string
  items: Array<{
    path: string
    title?: string
    duration?: number
  }>
}

export class ImportService extends EventEmitter {
  private isImporting = false
  private shouldCancel = false
  private progress: ImportProgress = {
    total: 0,
    processed: 0,
    imported: 0,
    skipped: 0,
    failed: 0,
    currentFile: '',
    stage: 'scanning'
  }

  private supportedFormats = new Set([
    '.mp4', '.mkv', '.avi', '.mov', '.wmv', '.webm', '.m4v', '.flv', '.ts',
    '.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.tiff'
  ])

  constructor(private db: DB) {
    super()
  }

  /**
   * Import from a folder
   */
  async importFolder(folderPath: string, options?: ImportOptions): Promise<ImportResult> {
    if (this.isImporting) {
      throw new Error('Import already in progress')
    }

    this.isImporting = true
    this.shouldCancel = false
    const startTime = Date.now()
    const errors: Array<{ file: string; error: string }> = []

    this.resetProgress()
    this.progress.stage = 'scanning'

    try {
      // Scan for files
      const files = this.scanFolder(folderPath, options?.preserveStructure)
      this.progress.total = files.length

      this.emit('progress', { ...this.progress })

      this.progress.stage = 'importing'

      let imported = 0
      let skipped = 0
      let failed = 0
      let playlistId: string | undefined

      // Create playlist if requested
      if (options?.createPlaylist) {
        const name = options.playlistName || path.basename(folderPath)
        const existing = this.db.raw.prepare('SELECT id FROM playlists WHERE name = ?').get(name) as any
        if (existing) {
          playlistId = existing.id
        } else {
          const id = this.generateId()
          this.db.raw.prepare('INSERT INTO playlists (id, name, createdAt) VALUES (?, ?, ?)').run(id, name, Date.now())
          playlistId = id
        }
      }

      for (let i = 0; i < files.length; i++) {
        if (this.shouldCancel) break

        const file = files[i]
        this.progress.currentFile = path.basename(file)
        this.progress.processed = i + 1

        try {
          // Check if already exists
          if (options?.skipDuplicates) {
            const existing = this.db.raw.prepare('SELECT id FROM media WHERE path = ?').get(file)
            if (existing) {
              skipped++
              this.progress.skipped = skipped
              continue
            }
          }

          // Import the file
          const mediaId = await this.importFile(file, options)

          if (mediaId) {
            imported++
            this.progress.imported = imported

            // Add to playlist if created
            if (playlistId) {
              const position = this.db.raw.prepare('SELECT MAX(position) as max FROM playlist_media WHERE playlistId = ?').get(playlistId) as any
              this.db.raw.prepare('INSERT OR IGNORE INTO playlist_media (playlistId, mediaId, position) VALUES (?, ?, ?)').run(playlistId, mediaId, (position?.max || 0) + 1)
            }
          } else {
            skipped++
            this.progress.skipped = skipped
          }
        } catch (e: any) {
          failed++
          this.progress.failed = failed
          errors.push({ file, error: e?.message || 'Unknown error' })
        }

        this.emit('progress', { ...this.progress })
      }

      this.progress.stage = 'complete'
      this.emit('progress', { ...this.progress })

      return {
        success: failed === 0,
        totalFiles: files.length,
        imported,
        skipped,
        failed,
        errors,
        duration: Date.now() - startTime,
        playlistId
      }
    } finally {
      this.isImporting = false
    }
  }

  /**
   * Import from M3U/PLS playlist file
   */
  async importPlaylist(playlistPath: string, options?: ImportOptions): Promise<ImportResult> {
    const ext = path.extname(playlistPath).toLowerCase()
    let playlist: PlaylistImport

    if (ext === '.m3u' || ext === '.m3u8') {
      playlist = this.parseM3U(playlistPath)
    } else if (ext === '.pls') {
      playlist = this.parsePLS(playlistPath)
    } else if (ext === '.json') {
      playlist = this.parseJSONPlaylist(playlistPath)
    } else {
      throw new Error(`Unsupported playlist format: ${ext}`)
    }

    // Create playlist
    const playlistId = this.generateId()
    const playlistName = options?.playlistName || playlist.name || path.parse(playlistPath).name
    this.db.raw.prepare('INSERT INTO playlists (id, name, createdAt) VALUES (?, ?, ?)').run(playlistId, playlistName, Date.now())

    // Import files from playlist
    const errors: Array<{ file: string; error: string }> = []
    let imported = 0
    let skipped = 0
    let failed = 0
    const startTime = Date.now()

    for (let i = 0; i < playlist.items.length; i++) {
      const item = playlist.items[i]

      if (!fs.existsSync(item.path)) {
        skipped++
        continue
      }

      try {
        // Check if already in library
        let existing = this.db.raw.prepare('SELECT id FROM media WHERE path = ?').get(item.path) as any
        let mediaId: string

        if (existing) {
          mediaId = existing.id
        } else {
          const newId = await this.importFile(item.path, options)
          if (!newId) {
            skipped++
            continue
          }
          mediaId = newId
          imported++
        }

        // Add to playlist
        this.db.raw.prepare('INSERT OR IGNORE INTO playlist_media (playlistId, mediaId, position) VALUES (?, ?, ?)').run(playlistId, mediaId, i)
      } catch (e: any) {
        failed++
        errors.push({ file: item.path, error: e?.message || 'Unknown error' })
      }
    }

    return {
      success: failed === 0,
      totalFiles: playlist.items.length,
      imported,
      skipped,
      failed,
      errors,
      duration: Date.now() - startTime,
      playlistId
    }
  }

  /**
   * Import library data from JSON export
   */
  async importLibraryData(jsonPath: string, options?: {
    mergeMode?: 'skip' | 'update' | 'replace'
    importMedia?: boolean
    importPlaylists?: boolean
    importTags?: boolean
    importStats?: boolean
  }): Promise<ImportResult> {
    const content = fs.readFileSync(jsonPath, 'utf8')
    const data = JSON.parse(content)
    const mergeMode = options?.mergeMode ?? 'skip'
    const startTime = Date.now()
    const errors: Array<{ file: string; error: string }> = []
    let imported = 0
    let skipped = 0

    // Import tags first
    if (options?.importTags !== false && data.tags) {
      for (const tag of data.tags) {
        try {
          const existing = this.db.raw.prepare('SELECT id FROM tags WHERE id = ?').get(tag.id)
          if (existing && mergeMode === 'skip') {
            skipped++
            continue
          }
          if (existing && mergeMode === 'update') {
            this.db.raw.prepare('UPDATE tags SET name = ?, color = ?, category = ? WHERE id = ?')
              .run(tag.name, tag.color, tag.category, tag.id)
          } else {
            this.db.raw.prepare('INSERT OR REPLACE INTO tags (id, name, color, category) VALUES (?, ?, ?, ?)')
              .run(tag.id, tag.name, tag.color, tag.category)
          }
          imported++
        } catch (e: any) {
          errors.push({ file: `tag:${tag.name}`, error: e?.message })
        }
      }
    }

    // Import media references
    if (options?.importMedia !== false && data.media) {
      for (const media of data.media) {
        try {
          const existing = this.db.raw.prepare('SELECT id FROM media WHERE id = ?').get(media.id)
          if (existing && mergeMode === 'skip') {
            skipped++
            continue
          }
          // Only import if file exists
          if (fs.existsSync(media.path)) {
            this.db.raw.prepare(`
              INSERT OR REPLACE INTO media
              (id, path, filename, type, size, durationSec, width, height, thumbPath, addedAt, hashSha256, phash)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run(
              media.id, media.path, media.filename, media.type,
              media.size, media.durationSec, media.width, media.height,
              media.thumbPath, media.addedAt, media.hashSha256, media.phash
            )
            imported++
          } else {
            skipped++
          }
        } catch (e: any) {
          errors.push({ file: media.filename, error: e?.message })
        }
      }
    }

    // Import media-tag relationships
    if (data.mediaTags) {
      for (const mt of data.mediaTags) {
        try {
          this.db.raw.prepare('INSERT OR IGNORE INTO media_tags (mediaId, tagId) VALUES (?, ?)')
            .run(mt.mediaId, mt.tagId)
        } catch { /* ignore */ }
      }
    }

    // Import playlists
    if (options?.importPlaylists !== false && data.playlists) {
      for (const playlist of data.playlists) {
        try {
          const existing = this.db.raw.prepare('SELECT id FROM playlists WHERE id = ?').get(playlist.id)
          if (existing && mergeMode === 'skip') continue

          this.db.raw.prepare('INSERT OR REPLACE INTO playlists (id, name, description, createdAt) VALUES (?, ?, ?, ?)')
            .run(playlist.id, playlist.name, playlist.description, playlist.createdAt)
          imported++
        } catch (e: any) {
          errors.push({ file: `playlist:${playlist.name}`, error: e?.message })
        }
      }

      // Import playlist-media relationships
      if (data.playlistMedia) {
        for (const pm of data.playlistMedia) {
          try {
            this.db.raw.prepare('INSERT OR IGNORE INTO playlist_media (playlistId, mediaId, position) VALUES (?, ?, ?)')
              .run(pm.playlistId, pm.mediaId, pm.position)
          } catch { /* ignore */ }
        }
      }
    }

    // Import stats
    if (options?.importStats !== false && data.mediaStats) {
      for (const stat of data.mediaStats) {
        try {
          this.db.raw.prepare('INSERT OR REPLACE INTO media_stats (mediaId, viewCount, rating, lastViewedAt) VALUES (?, ?, ?, ?)')
            .run(stat.mediaId, stat.viewCount, stat.rating, stat.lastViewedAt)
        } catch { /* ignore */ }
      }
    }

    return {
      success: errors.length === 0,
      totalFiles: imported + skipped + errors.length,
      imported,
      skipped,
      failed: errors.length,
      errors,
      duration: Date.now() - startTime
    }
  }

  /**
   * Cancel import
   */
  cancel(): void {
    this.shouldCancel = true
  }

  /**
   * Check if import is in progress
   */
  isInProgress(): boolean {
    return this.isImporting
  }

  /**
   * Get progress
   */
  getProgress(): ImportProgress {
    return { ...this.progress }
  }

  private scanFolder(folderPath: string, preserveStructure?: boolean): string[] {
    const files: string[] = []

    const scan = (dir: string): void => {
      const entries = fs.readdirSync(dir, { withFileTypes: true })

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name)

        if (entry.isDirectory()) {
          scan(fullPath)
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name).toLowerCase()
          if (this.supportedFormats.has(ext)) {
            files.push(fullPath)
          }
        }
      }
    }

    scan(folderPath)
    return files
  }

  private async importFile(filePath: string, options?: ImportOptions): Promise<string | null> {
    const stats = fs.statSync(filePath)
    const ext = path.extname(filePath).toLowerCase()
    const filename = path.basename(filePath)

    // Determine type
    let type: 'video' | 'image' | 'gif'
    if (['.mp4', '.mkv', '.avi', '.mov', '.wmv', '.webm', '.m4v', '.flv', '.ts'].includes(ext)) {
      type = 'video'
    } else if (ext === '.gif') {
      type = 'gif'
    } else {
      type = 'image'
    }

    const id = this.generateId()

    this.db.raw.prepare(`
      INSERT INTO media (id, path, filename, type, size, addedAt)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, filePath, filename, type, stats.size, Date.now())

    // Initialize stats
    this.db.raw.prepare('INSERT OR IGNORE INTO media_stats (mediaId, viewCount, rating) VALUES (?, 0, 0)').run(id)

    return id
  }

  private parseM3U(filePath: string): PlaylistImport {
    const content = fs.readFileSync(filePath, 'utf8')
    const lines = content.split('\n').map(l => l.trim()).filter(l => l)
    const basePath = path.dirname(filePath)

    const items: PlaylistImport['items'] = []
    let currentTitle: string | undefined
    let currentDuration: number | undefined

    for (const line of lines) {
      if (line.startsWith('#EXTINF:')) {
        const match = line.match(/#EXTINF:(-?\d+),(.*)/)
        if (match) {
          currentDuration = parseInt(match[1])
          currentTitle = match[2]
        }
      } else if (!line.startsWith('#')) {
        const itemPath = path.isAbsolute(line) ? line : path.join(basePath, line)
        items.push({
          path: itemPath,
          title: currentTitle,
          duration: currentDuration
        })
        currentTitle = undefined
        currentDuration = undefined
      }
    }

    const nameMatch = content.match(/#PLAYLIST:(.*)/)
    return {
      name: nameMatch ? nameMatch[1].trim() : path.parse(filePath).name,
      items
    }
  }

  private parsePLS(filePath: string): PlaylistImport {
    const content = fs.readFileSync(filePath, 'utf8')
    const basePath = path.dirname(filePath)
    const items: PlaylistImport['items'] = []

    const fileMatches = content.matchAll(/File(\d+)=(.+)/g)
    const titleMatches = content.matchAll(/Title(\d+)=(.+)/g)
    const lengthMatches = content.matchAll(/Length(\d+)=(-?\d+)/g)

    const files: Record<string, string> = {}
    const titles: Record<string, string> = {}
    const lengths: Record<string, number> = {}

    for (const match of fileMatches) files[match[1]] = match[2].trim()
    for (const match of titleMatches) titles[match[1]] = match[2].trim()
    for (const match of lengthMatches) lengths[match[1]] = parseInt(match[2])

    for (const num of Object.keys(files).sort((a, b) => parseInt(a) - parseInt(b))) {
      const fileLine = files[num]
      const itemPath = path.isAbsolute(fileLine) ? fileLine : path.join(basePath, fileLine)
      items.push({
        path: itemPath,
        title: titles[num],
        duration: lengths[num]
      })
    }

    const nameMatch = content.match(/PlaylistName=(.+)/)
    return {
      name: nameMatch ? nameMatch[1].trim() : path.parse(filePath).name,
      items
    }
  }

  private parseJSONPlaylist(filePath: string): PlaylistImport {
    const content = fs.readFileSync(filePath, 'utf8')
    const data = JSON.parse(content)

    return {
      name: data.name || path.parse(filePath).name,
      items: (data.items || data.tracks || []).map((item: any) => ({
        path: item.path || item.file || item.location,
        title: item.title || item.name,
        duration: item.duration || item.length
      }))
    }
  }

  private resetProgress(): void {
    this.progress = {
      total: 0,
      processed: 0,
      imported: 0,
      skipped: 0,
      failed: 0,
      currentFile: '',
      stage: 'scanning'
    }
  }

  private generateId(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'
    let id = ''
    for (let i = 0; i < 21; i++) {
      id += chars[Math.floor(Math.random() * chars.length)]
    }
    return id
  }
}

// Singleton
let instance: ImportService | null = null

export function getImportService(db: DB): ImportService {
  if (!instance) {
    instance = new ImportService(db)
  }
  return instance
}
