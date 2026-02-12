// File: src/main/services/backup-restore.ts
// Backup and restore system for database and settings

import type { DB } from '../db'
import { app } from 'electron'
import path from 'path'
import fs from 'fs'
import { createHash } from 'crypto'

export interface BackupInfo {
  id: string
  filename: string
  path: string
  createdAt: number
  size: number
  mediaCount: number
  tagCount: number
  playlistCount: number
  version: string
  checksum: string
}

export interface BackupOptions {
  includeDatabase: boolean
  includeSettings: boolean
  includeThumbnails: boolean
  compress: boolean
}

export interface RestoreOptions {
  restoreDatabase: boolean
  restoreSettings: boolean
  restoreThumbnails: boolean
  mergeMode: 'replace' | 'merge'  // Replace all or merge with existing
}

export interface ExportData {
  version: string
  exportedAt: number
  mediaCount: number
  tagCount: number
  playlistCount: number
  data: {
    media?: any[]
    tags?: any[]
    mediaTags?: any[]
    mediaStats?: any[]
    playlists?: any[]
    playlistItems?: any[]
    collections?: any[]
    collectionItems?: any[]
    performers?: any[]
    mediaPerformers?: any[]
    markers?: any[]
    settings?: any
  }
}

const BACKUP_VERSION = '1.0'

export class BackupRestoreService {
  private backupDir: string

  constructor(private db: DB) {
    this.backupDir = path.join(app.getPath('userData'), 'backups')
    this.ensureBackupDir()
  }

  private ensureBackupDir(): void {
    if (!fs.existsSync(this.backupDir)) {
      fs.mkdirSync(this.backupDir, { recursive: true })
    }
  }

  /**
   * Create a backup
   */
  async createBackup(options: Partial<BackupOptions> = {}): Promise<BackupInfo> {
    const opts: BackupOptions = {
      includeDatabase: true,
      includeSettings: true,
      includeThumbnails: false,
      compress: false,
      ...options
    }

    const timestamp = Date.now()
    const dateStr = new Date(timestamp).toISOString().replace(/[:.]/g, '-').slice(0, 19)
    const filename = `vault-backup-${dateStr}.json`
    const backupPath = path.join(this.backupDir, filename)

    // Gather data
    const exportData: ExportData = {
      version: BACKUP_VERSION,
      exportedAt: timestamp,
      mediaCount: 0,
      tagCount: 0,
      playlistCount: 0,
      data: {}
    }

    if (opts.includeDatabase) {
      // Export media
      exportData.data.media = this.db.raw.prepare('SELECT * FROM media').all()
      exportData.mediaCount = exportData.data.media.length

      // Export tags
      exportData.data.tags = this.db.raw.prepare('SELECT * FROM tags').all()
      exportData.tagCount = exportData.data.tags.length

      // Export media-tag relationships
      exportData.data.mediaTags = this.db.raw.prepare('SELECT * FROM media_tags').all()

      // Export stats
      exportData.data.mediaStats = this.db.raw.prepare('SELECT * FROM media_stats').all()

      // Export playlists
      exportData.data.playlists = this.db.raw.prepare('SELECT * FROM playlists').all()
      exportData.playlistCount = exportData.data.playlists.length

      // Export playlist items
      exportData.data.playlistItems = this.db.raw.prepare('SELECT * FROM playlist_items').all()

      // Export collections if table exists
      try {
        exportData.data.collections = this.db.raw.prepare('SELECT * FROM collections').all()
        exportData.data.collectionItems = this.db.raw.prepare('SELECT * FROM collection_items').all()
      } catch {
        // Table might not exist
      }

      // Export performers if table exists
      try {
        exportData.data.performers = this.db.raw.prepare('SELECT * FROM performers').all()
        exportData.data.mediaPerformers = this.db.raw.prepare('SELECT * FROM media_performers').all()
      } catch {
        // Table might not exist
      }

      // Export markers
      exportData.data.markers = this.db.raw.prepare('SELECT * FROM markers').all()
    }

    if (opts.includeSettings) {
      // Read settings files
      const settingsPath = path.join(app.getPath('userData'), 'settings.json')
      if (fs.existsSync(settingsPath)) {
        try {
          exportData.data.settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'))
        } catch {
          // Ignore settings read errors
        }
      }
    }

    // Write backup file
    const jsonContent = JSON.stringify(exportData, null, 2)
    fs.writeFileSync(backupPath, jsonContent, 'utf-8')

    // Calculate checksum
    const checksum = createHash('md5').update(jsonContent).digest('hex')

    const stats = fs.statSync(backupPath)

    return {
      id: dateStr,
      filename,
      path: backupPath,
      createdAt: timestamp,
      size: stats.size,
      mediaCount: exportData.mediaCount,
      tagCount: exportData.tagCount,
      playlistCount: exportData.playlistCount,
      version: BACKUP_VERSION,
      checksum
    }
  }

  /**
   * List available backups
   */
  listBackups(): BackupInfo[] {
    const files = fs.readdirSync(this.backupDir)
      .filter(f => f.startsWith('vault-backup-') && f.endsWith('.json'))
      .sort()
      .reverse()

    const backups: BackupInfo[] = []

    for (const filename of files) {
      try {
        const filePath = path.join(this.backupDir, filename)
        const stats = fs.statSync(filePath)
        const content = fs.readFileSync(filePath, 'utf-8')
        const data = JSON.parse(content) as ExportData

        const checksum = createHash('md5').update(content).digest('hex')

        backups.push({
          id: filename.replace('vault-backup-', '').replace('.json', ''),
          filename,
          path: filePath,
          createdAt: data.exportedAt || stats.mtimeMs,
          size: stats.size,
          mediaCount: data.mediaCount || 0,
          tagCount: data.tagCount || 0,
          playlistCount: data.playlistCount || 0,
          version: data.version || 'unknown',
          checksum
        })
      } catch {
        // Skip invalid backup files
      }
    }

    return backups
  }

  /**
   * Restore from backup
   */
  async restoreBackup(backupPath: string, options: Partial<RestoreOptions> = {}): Promise<{
    success: boolean
    restored: { media: number; tags: number; playlists: number }
    errors: string[]
  }> {
    const opts: RestoreOptions = {
      restoreDatabase: true,
      restoreSettings: true,
      restoreThumbnails: false,
      mergeMode: 'merge',
      ...options
    }

    const errors: string[] = []
    const restored = { media: 0, tags: 0, playlists: 0 }

    try {
      const content = fs.readFileSync(backupPath, 'utf-8')
      const data = JSON.parse(content) as ExportData

      if (opts.restoreDatabase && data.data) {
        // Restore tags first
        if (data.data.tags && data.data.tags.length > 0) {
          const stmt = this.db.raw.prepare(`
            INSERT OR ${opts.mergeMode === 'replace' ? 'REPLACE' : 'IGNORE'} INTO tags (id, name)
            VALUES (?, ?)
          `)

          for (const tag of data.data.tags) {
            try {
              stmt.run(tag.id, tag.name)
              restored.tags++
            } catch (e: any) {
              errors.push(`Tag ${tag.name}: ${e.message}`)
            }
          }
        }

        // Restore media
        if (data.data.media && data.data.media.length > 0) {
          const stmt = this.db.raw.prepare(`
            INSERT OR ${opts.mergeMode === 'replace' ? 'REPLACE' : 'IGNORE'} INTO media
            (id, type, path, filename, ext, size, mtimeMs, addedAt, durationSec, thumbPath, width, height, hashSha256, phash)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `)

          for (const media of data.data.media) {
            try {
              stmt.run(
                media.id, media.type, media.path, media.filename, media.ext,
                media.size, media.mtimeMs, media.addedAt, media.durationSec,
                media.thumbPath, media.width, media.height, media.hashSha256, media.phash
              )
              restored.media++
            } catch (e: any) {
              errors.push(`Media ${media.filename}: ${e.message}`)
            }
          }
        }

        // Restore media-tag relationships
        if (data.data.mediaTags && data.data.mediaTags.length > 0) {
          const stmt = this.db.raw.prepare(`
            INSERT OR IGNORE INTO media_tags (mediaId, tagId) VALUES (?, ?)
          `)
          for (const mt of data.data.mediaTags) {
            try {
              stmt.run(mt.mediaId, mt.tagId)
            } catch {
              // Ignore relationship errors
            }
          }
        }

        // Restore media stats
        if (data.data.mediaStats && data.data.mediaStats.length > 0) {
          const stmt = this.db.raw.prepare(`
            INSERT OR ${opts.mergeMode === 'replace' ? 'REPLACE' : 'IGNORE'} INTO media_stats
            (mediaId, views, lastViewedAt, rating, oCount, updatedAt)
            VALUES (?, ?, ?, ?, ?, ?)
          `)
          for (const stat of data.data.mediaStats) {
            try {
              stmt.run(stat.mediaId, stat.views, stat.lastViewedAt, stat.rating, stat.oCount, stat.updatedAt)
            } catch {
              // Ignore stats errors
            }
          }
        }

        // Restore playlists
        if (data.data.playlists && data.data.playlists.length > 0) {
          const stmt = this.db.raw.prepare(`
            INSERT OR ${opts.mergeMode === 'replace' ? 'REPLACE' : 'IGNORE'} INTO playlists
            (id, name, createdAt, updatedAt)
            VALUES (?, ?, ?, ?)
          `)
          for (const playlist of data.data.playlists) {
            try {
              stmt.run(playlist.id, playlist.name, playlist.createdAt, playlist.updatedAt)
              restored.playlists++
            } catch (e: any) {
              errors.push(`Playlist ${playlist.name}: ${e.message}`)
            }
          }
        }

        // Restore playlist items
        if (data.data.playlistItems && data.data.playlistItems.length > 0) {
          const stmt = this.db.raw.prepare(`
            INSERT OR IGNORE INTO playlist_items (id, playlistId, mediaId, position, addedAt)
            VALUES (?, ?, ?, ?, ?)
          `)
          for (const item of data.data.playlistItems) {
            try {
              stmt.run(item.id, item.playlistId, item.mediaId, item.position, item.addedAt)
            } catch {
              // Ignore item errors
            }
          }
        }

        // Restore markers
        if (data.data.markers && data.data.markers.length > 0) {
          const stmt = this.db.raw.prepare(`
            INSERT OR ${opts.mergeMode === 'replace' ? 'REPLACE' : 'IGNORE'} INTO markers
            (id, mediaId, timeSec, title, createdAt)
            VALUES (?, ?, ?, ?, ?)
          `)
          for (const marker of data.data.markers) {
            try {
              stmt.run(marker.id, marker.mediaId, marker.timeSec, marker.title, marker.createdAt)
            } catch {
              // Ignore marker errors
            }
          }
        }
      }

      if (opts.restoreSettings && data.data.settings) {
        const settingsPath = path.join(app.getPath('userData'), 'settings.json')
        fs.writeFileSync(settingsPath, JSON.stringify(data.data.settings, null, 2))
      }

      return { success: true, restored, errors }
    } catch (e: any) {
      return { success: false, restored, errors: [e.message] }
    }
  }

  /**
   * Delete a backup
   */
  deleteBackup(backupPath: string): boolean {
    try {
      if (fs.existsSync(backupPath)) {
        fs.unlinkSync(backupPath)
        return true
      }
      return false
    } catch {
      return false
    }
  }

  /**
   * Export to custom path
   */
  async exportTo(exportPath: string, options: Partial<BackupOptions> = {}): Promise<BackupInfo> {
    const backup = await this.createBackup(options)

    // Copy to custom location
    fs.copyFileSync(backup.path, exportPath)

    return {
      ...backup,
      path: exportPath,
      filename: path.basename(exportPath)
    }
  }

  /**
   * Import from custom path
   */
  async importFrom(importPath: string, options: Partial<RestoreOptions> = {}): Promise<{
    success: boolean
    restored: { media: number; tags: number; playlists: number }
    errors: string[]
  }> {
    return this.restoreBackup(importPath, options)
  }

  /**
   * Get backup directory path
   */
  getBackupDir(): string {
    return this.backupDir
  }

  /**
   * Auto-cleanup old backups (keep last N)
   */
  cleanupOldBackups(keepCount = 10): number {
    const backups = this.listBackups()
    let deleted = 0

    if (backups.length > keepCount) {
      const toDelete = backups.slice(keepCount)
      for (const backup of toDelete) {
        if (this.deleteBackup(backup.path)) {
          deleted++
        }
      }
    }

    return deleted
  }
}

// Singleton
let instance: BackupRestoreService | null = null

export function getBackupRestoreService(db: DB): BackupRestoreService {
  if (!instance) {
    instance = new BackupRestoreService(db)
  }
  return instance
}
