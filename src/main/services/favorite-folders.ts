// File: src/main/services/favorite-folders.ts
// Quick access to favorite directories

import type { DB } from '../db'
import fs from 'node:fs'
import path from 'node:path'

export interface FavoriteFolder {
  id: string
  path: string
  name: string
  icon?: string
  color?: string
  sortOrder: number
  mediaCount: number
  lastAccessed: number
  createdAt: number
}

export interface FolderStats {
  totalFiles: number
  videoCount: number
  imageCount: number
  gifCount: number
  totalSize: number
  newestFile: number
}

export class FavoriteFoldersService {
  constructor(private db: DB) {
    this.ensureTable()
  }

  private ensureTable(): void {
    this.db.raw.exec(`
      CREATE TABLE IF NOT EXISTS favorite_folders (
        id TEXT PRIMARY KEY,
        path TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        icon TEXT,
        color TEXT,
        sortOrder INTEGER DEFAULT 0,
        accessCount INTEGER DEFAULT 0,
        lastAccessed INTEGER,
        createdAt INTEGER NOT NULL
      )
    `)
  }

  /**
   * Add a favorite folder
   */
  addFolder(folderPath: string, name?: string, options?: {
    icon?: string
    color?: string
  }): FavoriteFolder {
    const normalizedPath = path.normalize(folderPath)

    // Verify folder exists
    if (!fs.existsSync(normalizedPath) || !fs.statSync(normalizedPath).isDirectory()) {
      throw new Error('Path is not a valid directory')
    }

    const id = this.generateId()
    const now = Date.now()
    const folderName = name || path.basename(normalizedPath)

    // Get max sort order
    const maxOrder = this.db.raw.prepare('SELECT MAX(sortOrder) as max FROM favorite_folders').get() as { max: number | null }

    this.db.raw.prepare(`
      INSERT INTO favorite_folders (id, path, name, icon, color, sortOrder, createdAt)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      normalizedPath,
      folderName,
      options?.icon || null,
      options?.color || null,
      (maxOrder.max || 0) + 1,
      now
    )

    return this.getFolder(id)!
  }

  /**
   * Remove a favorite folder
   */
  removeFolder(folderId: string): boolean {
    const result = this.db.raw.prepare('DELETE FROM favorite_folders WHERE id = ?').run(folderId)
    return result.changes > 0
  }

  /**
   * Remove by path
   */
  removeFolderByPath(folderPath: string): boolean {
    const normalizedPath = path.normalize(folderPath)
    const result = this.db.raw.prepare('DELETE FROM favorite_folders WHERE path = ?').run(normalizedPath)
    return result.changes > 0
  }

  /**
   * Check if folder is favorite
   */
  isFavorite(folderPath: string): boolean {
    const normalizedPath = path.normalize(folderPath)
    const row = this.db.raw.prepare('SELECT id FROM favorite_folders WHERE path = ?').get(normalizedPath)
    return !!row
  }

  /**
   * Get folder by ID
   */
  getFolder(folderId: string): FavoriteFolder | null {
    const row = this.db.raw.prepare('SELECT * FROM favorite_folders WHERE id = ?').get(folderId) as any
    if (!row) return null

    return this.rowToFolder(row)
  }

  /**
   * Get folder by path
   */
  getFolderByPath(folderPath: string): FavoriteFolder | null {
    const normalizedPath = path.normalize(folderPath)
    const row = this.db.raw.prepare('SELECT * FROM favorite_folders WHERE path = ?').get(normalizedPath) as any
    if (!row) return null

    return this.rowToFolder(row)
  }

  /**
   * Get all favorite folders
   */
  getFolders(): FavoriteFolder[] {
    const rows = this.db.raw.prepare(`
      SELECT * FROM favorite_folders
      ORDER BY sortOrder ASC, name ASC
    `).all() as any[]

    return rows.map(row => this.rowToFolder(row))
  }

  /**
   * Get recent folders (by access)
   */
  getRecentFolders(limit = 10): FavoriteFolder[] {
    const rows = this.db.raw.prepare(`
      SELECT * FROM favorite_folders
      WHERE lastAccessed IS NOT NULL
      ORDER BY lastAccessed DESC
      LIMIT ?
    `).all(limit) as any[]

    return rows.map(row => this.rowToFolder(row))
  }

  /**
   * Update a folder
   */
  updateFolder(folderId: string, updates: Partial<Pick<FavoriteFolder, 'name' | 'icon' | 'color'>>): FavoriteFolder | null {
    const setClauses: string[] = []
    const values: any[] = []

    if (updates.name !== undefined) {
      setClauses.push('name = ?')
      values.push(updates.name)
    }
    if (updates.icon !== undefined) {
      setClauses.push('icon = ?')
      values.push(updates.icon)
    }
    if (updates.color !== undefined) {
      setClauses.push('color = ?')
      values.push(updates.color)
    }

    if (setClauses.length === 0) return this.getFolder(folderId)

    values.push(folderId)
    this.db.raw.prepare(`UPDATE favorite_folders SET ${setClauses.join(', ')} WHERE id = ?`).run(...values)

    return this.getFolder(folderId)
  }

  /**
   * Record folder access
   */
  recordAccess(folderId: string): void {
    this.db.raw.prepare(`
      UPDATE favorite_folders
      SET lastAccessed = ?, accessCount = accessCount + 1
      WHERE id = ?
    `).run(Date.now(), folderId)
  }

  /**
   * Reorder folders
   */
  reorderFolders(orderedIds: string[]): void {
    for (let i = 0; i < orderedIds.length; i++) {
      this.db.raw.prepare('UPDATE favorite_folders SET sortOrder = ? WHERE id = ?').run(i, orderedIds[i])
    }
  }

  /**
   * Get folder statistics
   */
  getFolderStats(folderId: string): FolderStats | null {
    const folder = this.getFolder(folderId)
    if (!folder) return null

    // Get stats from media table for this folder's path
    const stats = this.db.raw.prepare(`
      SELECT
        COUNT(*) as totalFiles,
        SUM(CASE WHEN type = 'video' THEN 1 ELSE 0 END) as videoCount,
        SUM(CASE WHEN type = 'image' THEN 1 ELSE 0 END) as imageCount,
        SUM(CASE WHEN type = 'gif' THEN 1 ELSE 0 END) as gifCount,
        COALESCE(SUM(size), 0) as totalSize,
        MAX(addedAt) as newestFile
      FROM media
      WHERE path LIKE ?
    `).get(`${folder.path}%`) as any

    return {
      totalFiles: stats.totalFiles || 0,
      videoCount: stats.videoCount || 0,
      imageCount: stats.imageCount || 0,
      gifCount: stats.gifCount || 0,
      totalSize: stats.totalSize || 0,
      newestFile: stats.newestFile || 0
    }
  }

  /**
   * Get media in folder
   */
  getMediaInFolder(folderId: string, limit = 100): string[] {
    const folder = this.getFolder(folderId)
    if (!folder) return []

    const rows = this.db.raw.prepare(`
      SELECT id FROM media
      WHERE path LIKE ?
      ORDER BY addedAt DESC
      LIMIT ?
    `).all(`${folder.path}%`, limit) as Array<{ id: string }>

    return rows.map(r => r.id)
  }

  /**
   * Get subfolders
   */
  getSubfolders(folderPath: string): Array<{ path: string; name: string; isFavorite: boolean }> {
    const normalizedPath = path.normalize(folderPath)

    try {
      const entries = fs.readdirSync(normalizedPath, { withFileTypes: true })
      const subfolders: Array<{ path: string; name: string; isFavorite: boolean }> = []

      for (const entry of entries) {
        if (entry.isDirectory() && !entry.name.startsWith('.')) {
          const fullPath = path.join(normalizedPath, entry.name)
          subfolders.push({
            path: fullPath,
            name: entry.name,
            isFavorite: this.isFavorite(fullPath)
          })
        }
      }

      return subfolders.sort((a, b) => a.name.localeCompare(b.name))
    } catch {
      return []
    }
  }

  /**
   * Toggle favorite status
   */
  toggleFavorite(folderPath: string, name?: string): { added: boolean; folder: FavoriteFolder | null } {
    if (this.isFavorite(folderPath)) {
      this.removeFolderByPath(folderPath)
      return { added: false, folder: null }
    } else {
      const folder = this.addFolder(folderPath, name)
      return { added: true, folder }
    }
  }

  /**
   * Validate all folders (check if they still exist)
   */
  validateFolders(): { valid: FavoriteFolder[]; invalid: FavoriteFolder[] } {
    const folders = this.getFolders()
    const valid: FavoriteFolder[] = []
    const invalid: FavoriteFolder[] = []

    for (const folder of folders) {
      if (fs.existsSync(folder.path) && fs.statSync(folder.path).isDirectory()) {
        valid.push(folder)
      } else {
        invalid.push(folder)
      }
    }

    return { valid, invalid }
  }

  /**
   * Remove invalid folders
   */
  removeInvalidFolders(): number {
    const { invalid } = this.validateFolders()
    for (const folder of invalid) {
      this.removeFolder(folder.id)
    }
    return invalid.length
  }

  /**
   * Get most accessed folders
   */
  getMostAccessed(limit = 10): FavoriteFolder[] {
    const rows = this.db.raw.prepare(`
      SELECT * FROM favorite_folders
      WHERE accessCount > 0
      ORDER BY accessCount DESC
      LIMIT ?
    `).all(limit) as any[]

    return rows.map(row => this.rowToFolder(row))
  }

  /**
   * Search folders by name
   */
  searchFolders(query: string): FavoriteFolder[] {
    const rows = this.db.raw.prepare(`
      SELECT * FROM favorite_folders
      WHERE name LIKE ? OR path LIKE ?
      ORDER BY name ASC
    `).all(`%${query}%`, `%${query}%`) as any[]

    return rows.map(row => this.rowToFolder(row))
  }

  /**
   * Export favorites
   */
  exportFavorites(): string {
    const folders = this.getFolders()
    return JSON.stringify(folders, null, 2)
  }

  /**
   * Import favorites
   */
  importFavorites(json: string): { imported: number; skipped: number } {
    const folders = JSON.parse(json) as FavoriteFolder[]
    let imported = 0
    let skipped = 0

    for (const folder of folders) {
      try {
        if (!this.isFavorite(folder.path)) {
          this.addFolder(folder.path, folder.name, {
            icon: folder.icon,
            color: folder.color
          })
          imported++
        } else {
          skipped++
        }
      } catch {
        skipped++
      }
    }

    return { imported, skipped }
  }

  private rowToFolder(row: any): FavoriteFolder {
    // Get media count for this folder
    const countRow = this.db.raw.prepare(`
      SELECT COUNT(*) as count FROM media WHERE path LIKE ?
    `).get(`${row.path}%`) as { count: number }

    return {
      id: row.id,
      path: row.path,
      name: row.name,
      icon: row.icon,
      color: row.color,
      sortOrder: row.sortOrder,
      mediaCount: countRow.count,
      lastAccessed: row.lastAccessed || 0,
      createdAt: row.createdAt
    }
  }

  private generateId(): string {
    return `folder-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
  }
}

// Singleton
let instance: FavoriteFoldersService | null = null

export function getFavoriteFoldersService(db: DB): FavoriteFoldersService {
  if (!instance) {
    instance = new FavoriteFoldersService(db)
  }
  return instance
}
