// File: src/main/services/export-service.ts
// Export media and playlists to various formats

import type { DB } from '../db'
import { EventEmitter } from 'events'
import fs from 'fs'
import path from 'path'

export type ExportFormat = 'copy' | 'move' | 'm3u' | 'pls' | 'csv' | 'json' | 'html'

export interface ExportOptions {
  format: ExportFormat
  destination: string
  includeMetadata?: boolean
  organizeByTag?: boolean
  organizeByDate?: boolean
  organizeByType?: boolean
  flattenStructure?: boolean
  renamePattern?: string  // e.g., "{index}_{filename}" or "{date}_{rating}_{filename}"
  maxFilenameLength?: number
  overwriteExisting?: boolean
  generateReport?: boolean
}

export interface ExportProgress {
  total: number
  completed: number
  currentFile: string
  errors: Array<{ file: string; error: string }>
  bytesTransferred: number
  speed: number
}

export interface ExportResult {
  success: boolean
  exported: number
  failed: number
  totalBytes: number
  destinationPath: string
  reportPath?: string
  errors: Array<{ file: string; error: string }>
  duration: number
}

export interface PlaylistExportOptions {
  format: 'm3u' | 'pls' | 'json' | 'csv'
  relativePaths?: boolean
  includeMetadata?: boolean
}

export class ExportService extends EventEmitter {
  private isExporting = false
  private shouldCancel = false
  private progress: ExportProgress = {
    total: 0,
    completed: 0,
    currentFile: '',
    errors: [],
    bytesTransferred: 0,
    speed: 0
  }

  constructor(private db: DB) {
    super()
  }

  /**
   * Export media items
   */
  async exportMedia(mediaIds: string[], options: ExportOptions): Promise<ExportResult> {
    if (this.isExporting) {
      throw new Error('Export already in progress')
    }

    this.isExporting = true
    this.shouldCancel = false
    const startTime = Date.now()
    const errors: Array<{ file: string; error: string }> = []
    let exported = 0
    let totalBytes = 0

    this.progress = {
      total: mediaIds.length,
      completed: 0,
      currentFile: '',
      errors: [],
      bytesTransferred: 0,
      speed: 0
    }

    try {
      // Ensure destination exists
      if (!fs.existsSync(options.destination)) {
        fs.mkdirSync(options.destination, { recursive: true })
      }

      // Get media info
      const placeholders = mediaIds.map(() => '?').join(',')
      const mediaItems = this.db.raw.prepare(`
        SELECT m.*, ms.rating
        FROM media m
        LEFT JOIN media_stats ms ON m.id = ms.mediaId
        WHERE m.id IN (${placeholders})
      `).all(...mediaIds) as any[]

      for (let i = 0; i < mediaItems.length; i++) {
        if (this.shouldCancel) break

        const media = mediaItems[i]
        this.progress.currentFile = media.filename
        this.emit('progress', { ...this.progress })

        try {
          const destPath = this.getDestinationPath(media, options, i)

          // Ensure directory exists
          const destDir = path.dirname(destPath)
          if (!fs.existsSync(destDir)) {
            fs.mkdirSync(destDir, { recursive: true })
          }

          // Skip if exists and not overwriting
          if (fs.existsSync(destPath) && !options.overwriteExisting) {
            errors.push({ file: media.filename, error: 'File already exists' })
            continue
          }

          if (options.format === 'copy') {
            await this.copyFile(media.path, destPath)
            const stats = fs.statSync(destPath)
            totalBytes += stats.size
          } else if (options.format === 'move') {
            await this.moveFile(media.path, destPath)
            const stats = fs.statSync(destPath)
            totalBytes += stats.size
            // Update database with new path
            this.db.raw.prepare('UPDATE media SET path = ? WHERE id = ?').run(destPath, media.id)
          }

          exported++
        } catch (e: any) {
          errors.push({ file: media.filename, error: e?.message || 'Unknown error' })
        }

        this.progress.completed = i + 1
        this.progress.bytesTransferred = totalBytes
        this.progress.errors = errors
        this.emit('progress', { ...this.progress })
      }

      // Generate report if requested
      let reportPath: string | undefined
      if (options.generateReport) {
        reportPath = await this.generateReport(options.destination, mediaItems, errors, {
          exported,
          totalBytes,
          duration: Date.now() - startTime
        })
      }

      return {
        success: errors.length === 0,
        exported,
        failed: errors.length,
        totalBytes,
        destinationPath: options.destination,
        reportPath,
        errors,
        duration: Date.now() - startTime
      }
    } finally {
      this.isExporting = false
    }
  }

  /**
   * Export a playlist
   */
  async exportPlaylist(playlistId: string, options: PlaylistExportOptions, destination: string): Promise<ExportResult> {
    const startTime = Date.now()

    // Get playlist info
    const playlist = this.db.raw.prepare('SELECT * FROM playlists WHERE id = ?').get(playlistId) as any
    if (!playlist) {
      throw new Error('Playlist not found')
    }

    // Get playlist items
    const items = this.db.raw.prepare(`
      SELECT m.*, pm.position
      FROM media m
      JOIN playlist_media pm ON m.id = pm.mediaId
      WHERE pm.playlistId = ?
      ORDER BY pm.position
    `).all(playlistId) as any[]

    let content = ''
    const basePath = path.dirname(destination)

    switch (options.format) {
      case 'm3u':
        content = this.generateM3U(playlist, items, basePath, options.relativePaths)
        break
      case 'pls':
        content = this.generatePLS(playlist, items, basePath, options.relativePaths)
        break
      case 'json':
        content = this.generateJSON(playlist, items, options.includeMetadata)
        break
      case 'csv':
        content = this.generateCSV(playlist, items)
        break
    }

    fs.writeFileSync(destination, content, 'utf8')

    return {
      success: true,
      exported: items.length,
      failed: 0,
      totalBytes: Buffer.byteLength(content),
      destinationPath: destination,
      errors: [],
      duration: Date.now() - startTime
    }
  }

  /**
   * Export library metadata
   */
  async exportLibraryData(destination: string, options?: {
    includeMedia?: boolean
    includePlaylists?: boolean
    includeTags?: boolean
    includePerformers?: boolean
    includeCollections?: boolean
    includeStats?: boolean
  }): Promise<ExportResult> {
    const startTime = Date.now()
    const data: any = {
      exportDate: new Date().toISOString(),
      version: '2.1.5'
    }

    if (options?.includeMedia !== false) {
      data.media = this.db.raw.prepare('SELECT * FROM media').all()
    }

    if (options?.includePlaylists !== false) {
      data.playlists = this.db.raw.prepare('SELECT * FROM playlists').all()
      data.playlistMedia = this.db.raw.prepare('SELECT * FROM playlist_media').all()
    }

    if (options?.includeTags !== false) {
      data.tags = this.db.raw.prepare('SELECT * FROM tags').all()
      data.mediaTags = this.db.raw.prepare('SELECT * FROM media_tags').all()
    }

    if (options?.includeStats !== false) {
      data.mediaStats = this.db.raw.prepare('SELECT * FROM media_stats').all()
    }

    // Try to include optional tables
    try {
      if (options?.includePerformers !== false) {
        data.performers = this.db.raw.prepare('SELECT * FROM performers').all()
        data.performerMedia = this.db.raw.prepare('SELECT * FROM performer_media').all()
      }
    } catch { /* Table might not exist */ }

    try {
      if (options?.includeCollections !== false) {
        data.collections = this.db.raw.prepare('SELECT * FROM collections').all()
        data.collectionMedia = this.db.raw.prepare('SELECT * FROM collection_media').all()
      }
    } catch { /* Table might not exist */ }

    const content = JSON.stringify(data, null, 2)
    fs.writeFileSync(destination, content, 'utf8')

    return {
      success: true,
      exported: Object.keys(data).length,
      failed: 0,
      totalBytes: Buffer.byteLength(content),
      destinationPath: destination,
      errors: [],
      duration: Date.now() - startTime
    }
  }

  /**
   * Cancel ongoing export
   */
  cancel(): void {
    this.shouldCancel = true
  }

  /**
   * Check if export is in progress
   */
  isInProgress(): boolean {
    return this.isExporting
  }

  /**
   * Get current progress
   */
  getProgress(): ExportProgress {
    return { ...this.progress }
  }

  private getDestinationPath(media: any, options: ExportOptions, index: number): string {
    let filename = media.filename
    let subdir = ''

    // Apply rename pattern
    if (options.renamePattern) {
      const date = new Date(media.addedAt)
      filename = options.renamePattern
        .replace('{index}', String(index + 1).padStart(4, '0'))
        .replace('{filename}', path.parse(media.filename).name)
        .replace('{ext}', path.parse(media.filename).ext)
        .replace('{date}', date.toISOString().slice(0, 10))
        .replace('{year}', String(date.getFullYear()))
        .replace('{month}', String(date.getMonth() + 1).padStart(2, '0'))
        .replace('{rating}', String(media.rating || 0))
        .replace('{type}', media.type)

      // Add extension if not in pattern
      if (!filename.includes('.')) {
        filename += path.extname(media.filename)
      }
    }

    // Organize by type
    if (options.organizeByType) {
      subdir = path.join(subdir, media.type)
    }

    // Organize by date
    if (options.organizeByDate) {
      const date = new Date(media.addedAt)
      subdir = path.join(subdir, `${date.getFullYear()}`, `${date.getMonth() + 1}`.padStart(2, '0'))
    }

    // Truncate filename if needed
    if (options.maxFilenameLength) {
      const ext = path.extname(filename)
      const name = path.parse(filename).name
      if (name.length > options.maxFilenameLength) {
        filename = name.slice(0, options.maxFilenameLength) + ext
      }
    }

    return path.join(options.destination, subdir, filename)
  }

  private async copyFile(src: string, dest: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const readStream = fs.createReadStream(src)
      const writeStream = fs.createWriteStream(dest)

      readStream.on('error', reject)
      writeStream.on('error', reject)
      writeStream.on('finish', resolve)

      readStream.pipe(writeStream)
    })
  }

  private async moveFile(src: string, dest: string): Promise<void> {
    try {
      // Try rename first (faster if same drive)
      fs.renameSync(src, dest)
    } catch {
      // Fall back to copy + delete
      await this.copyFile(src, dest)
      fs.unlinkSync(src)
    }
  }

  private generateM3U(playlist: any, items: any[], basePath: string, relativePaths?: boolean): string {
    let content = '#EXTM3U\n'
    content += `#PLAYLIST:${playlist.name}\n`

    for (const item of items) {
      const duration = item.durationSec || -1
      content += `#EXTINF:${duration},${item.filename}\n`
      content += relativePaths ? path.relative(basePath, item.path) : item.path
      content += '\n'
    }

    return content
  }

  private generatePLS(playlist: any, items: any[], basePath: string, relativePaths?: boolean): string {
    let content = '[playlist]\n'
    content += `PlaylistName=${playlist.name}\n`

    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      const num = i + 1
      content += `File${num}=${relativePaths ? path.relative(basePath, item.path) : item.path}\n`
      content += `Title${num}=${item.filename}\n`
      content += `Length${num}=${item.durationSec || -1}\n`
    }

    content += `NumberOfEntries=${items.length}\n`
    content += 'Version=2\n'

    return content
  }

  private generateJSON(playlist: any, items: any[], includeMetadata?: boolean): string {
    const data = {
      name: playlist.name,
      description: playlist.description,
      createdAt: playlist.createdAt,
      items: items.map(item => {
        const base: any = {
          filename: item.filename,
          path: item.path
        }

        if (includeMetadata) {
          base.type = item.type
          base.size = item.size
          base.duration = item.durationSec
          base.width = item.width
          base.height = item.height
          base.addedAt = item.addedAt
        }

        return base
      })
    }

    return JSON.stringify(data, null, 2)
  }

  private generateCSV(playlist: any, items: any[]): string {
    let content = 'Position,Filename,Path,Type,Size,Duration\n'

    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      const row = [
        i + 1,
        `"${item.filename.replace(/"/g, '""')}"`,
        `"${item.path.replace(/"/g, '""')}"`,
        item.type,
        item.size,
        item.durationSec || ''
      ]
      content += row.join(',') + '\n'
    }

    return content
  }

  private async generateReport(
    destination: string,
    items: any[],
    errors: Array<{ file: string; error: string }>,
    stats: { exported: number; totalBytes: number; duration: number }
  ): Promise<string> {
    const reportPath = path.join(destination, 'export-report.html')

    const html = `<!DOCTYPE html>
<html>
<head>
  <title>Export Report</title>
  <style>
    body { font-family: sans-serif; margin: 40px; background: #1a1a1a; color: #fff; }
    h1 { color: #ec4899; }
    .stats { display: flex; gap: 20px; margin: 20px 0; }
    .stat { background: #2a2a2a; padding: 20px; border-radius: 8px; }
    .stat-value { font-size: 2em; font-weight: bold; color: #ec4899; }
    .stat-label { color: #888; }
    table { width: 100%; border-collapse: collapse; margin-top: 20px; }
    th, td { padding: 10px; text-align: left; border-bottom: 1px solid #333; }
    th { background: #2a2a2a; }
    .error { color: #ef4444; }
    .success { color: #10b981; }
  </style>
</head>
<body>
  <h1>Export Report</h1>
  <div class="stats">
    <div class="stat">
      <div class="stat-value">${stats.exported}</div>
      <div class="stat-label">Files Exported</div>
    </div>
    <div class="stat">
      <div class="stat-value">${this.formatBytes(stats.totalBytes)}</div>
      <div class="stat-label">Total Size</div>
    </div>
    <div class="stat">
      <div class="stat-value">${(stats.duration / 1000).toFixed(1)}s</div>
      <div class="stat-label">Duration</div>
    </div>
    <div class="stat">
      <div class="stat-value ${errors.length > 0 ? 'error' : 'success'}">${errors.length}</div>
      <div class="stat-label">Errors</div>
    </div>
  </div>

  ${errors.length > 0 ? `
  <h2>Errors</h2>
  <table>
    <tr><th>File</th><th>Error</th></tr>
    ${errors.map(e => `<tr><td>${e.file}</td><td class="error">${e.error}</td></tr>`).join('')}
  </table>
  ` : ''}

  <h2>Exported Files</h2>
  <table>
    <tr><th>#</th><th>Filename</th><th>Type</th><th>Size</th></tr>
    ${items.slice(0, 100).map((item, i) => `
      <tr>
        <td>${i + 1}</td>
        <td>${item.filename}</td>
        <td>${item.type}</td>
        <td>${this.formatBytes(item.size)}</td>
      </tr>
    `).join('')}
    ${items.length > 100 ? `<tr><td colspan="4">...and ${items.length - 100} more</td></tr>` : ''}
  </table>

  <p style="color: #666; margin-top: 40px;">Generated by Vault v2.1.5 on ${new Date().toLocaleString()}</p>
</body>
</html>`

    fs.writeFileSync(reportPath, html, 'utf8')
    return reportPath
  }

  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }
}

// Singleton
let instance: ExportService | null = null

export function getExportService(db: DB): ExportService {
  if (!instance) {
    instance = new ExportService(db)
  }
  return instance
}
