// File: src/main/services/auto-organize.ts
// Auto-organize media files based on rules

import type { DB } from '../db'
import path from 'node:path'
import fs from 'node:fs'

export type OrganizeBy = 'type' | 'tag' | 'rating' | 'date' | 'resolution' | 'duration'

export interface OrganizeRule {
  by: OrganizeBy
  tagName?: string          // For tag-based organization
  subfolders?: boolean      // Create subfolders for each value
  prefix?: string           // Prefix for folder names
}

export interface OrganizePreview {
  source: string
  destination: string
  mediaId: string
  action: 'move' | 'skip' | 'conflict'
  reason?: string
}

export interface OrganizeResult {
  moved: number
  skipped: number
  errors: number
  errorDetails: string[]
}

export class AutoOrganizeService {
  constructor(private db: DB) {}

  /**
   * Preview what would happen if we organized with given rules
   */
  previewOrganize(
    targetDir: string,
    rules: OrganizeRule[],
    mediaIds?: string[]
  ): OrganizePreview[] {
    const previews: OrganizePreview[] = []

    // Get media to organize
    let mediaQuery = 'SELECT * FROM media'
    let params: any[] = []

    if (mediaIds && mediaIds.length > 0) {
      const placeholders = mediaIds.map(() => '?').join(',')
      mediaQuery += ` WHERE id IN (${placeholders})`
      params = mediaIds
    }

    const media = this.db.raw.prepare(mediaQuery).all(...params) as any[]

    for (const item of media) {
      const subPath = this.buildSubPath(item, rules)
      const destDir = path.join(targetDir, subPath)
      const destPath = path.join(destDir, item.filename)

      if (destPath === item.path) {
        previews.push({
          source: item.path,
          destination: destPath,
          mediaId: item.id,
          action: 'skip',
          reason: 'Already in correct location'
        })
      } else if (fs.existsSync(destPath)) {
        previews.push({
          source: item.path,
          destination: destPath,
          mediaId: item.id,
          action: 'conflict',
          reason: 'File already exists at destination'
        })
      } else {
        previews.push({
          source: item.path,
          destination: destPath,
          mediaId: item.id,
          action: 'move'
        })
      }
    }

    return previews
  }

  /**
   * Build the subfolder path for a media item based on rules
   */
  private buildSubPath(media: any, rules: OrganizeRule[]): string {
    const parts: string[] = []

    for (const rule of rules) {
      const value = this.getValueForRule(media, rule)
      if (value) {
        parts.push(rule.prefix ? `${rule.prefix}${value}` : value)
      }
    }

    return parts.join(path.sep)
  }

  /**
   * Get the folder name value for a rule
   */
  private getValueForRule(media: any, rule: OrganizeRule): string | null {
    switch (rule.by) {
      case 'type':
        return media.type // 'video', 'image', 'gif'

      case 'tag':
        if (rule.tagName) {
          // Check if media has specific tag
          const hasTag = this.db.raw.prepare(`
            SELECT 1 FROM media_tags mt
            JOIN tags t ON mt.tagId = t.id
            WHERE mt.mediaId = ? AND t.name = ?
          `).get(media.id, rule.tagName)
          return hasTag ? rule.tagName : null
        }
        // Get primary tag (most specific/first assigned)
        const tag = this.db.raw.prepare(`
          SELECT t.name FROM tags t
          JOIN media_tags mt ON t.id = mt.tagId
          WHERE mt.mediaId = ?
          ORDER BY t.name
          LIMIT 1
        `).get(media.id) as { name: string } | undefined
        return tag?.name || 'untagged'

      case 'rating':
        const stats = this.db.raw.prepare(`
          SELECT rating FROM media_stats WHERE mediaId = ?
        `).get(media.id) as { rating: number } | undefined
        const rating = stats?.rating || 0
        if (rating >= 5) return '5-star'
        if (rating >= 4) return '4-star'
        if (rating >= 3) return '3-star'
        if (rating >= 1) return 'rated'
        return 'unrated'

      case 'date':
        const date = new Date(media.addedAt)
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`

      case 'resolution':
        const height = media.height || 0
        if (height >= 2160) return '4K'
        if (height >= 1080) return '1080p'
        if (height >= 720) return '720p'
        if (height >= 480) return '480p'
        return 'SD'

      case 'duration':
        const duration = media.durationSec || 0
        if (media.type !== 'video') return null
        if (duration >= 3600) return 'long-1h+'
        if (duration >= 1200) return 'medium-20-60m'
        if (duration >= 300) return 'short-5-20m'
        return 'clips-under-5m'

      default:
        return null
    }
  }

  /**
   * Execute organization based on preview
   */
  async executeOrganize(
    previews: OrganizePreview[],
    onProgress?: (current: number, total: number) => void
  ): Promise<OrganizeResult> {
    let moved = 0
    let skipped = 0
    let errors = 0
    const errorDetails: string[] = []

    const moveable = previews.filter(p => p.action === 'move')

    for (let i = 0; i < moveable.length; i++) {
      const preview = moveable[i]
      onProgress?.(i + 1, moveable.length)

      try {
        // Ensure destination directory exists
        const destDir = path.dirname(preview.destination)
        if (!fs.existsSync(destDir)) {
          fs.mkdirSync(destDir, { recursive: true })
        }

        // Move the file
        fs.renameSync(preview.source, preview.destination)

        // Update database
        this.db.raw.prepare(`
          UPDATE media SET path = ?, filename = ? WHERE id = ?
        `).run(preview.destination, path.basename(preview.destination), preview.mediaId)

        moved++
      } catch (e: any) {
        errors++
        errorDetails.push(`${preview.source}: ${e.message}`)
      }
    }

    skipped = previews.filter(p => p.action !== 'move').length

    return { moved, skipped, errors, errorDetails }
  }

  /**
   * Organize by multiple tags (creates folder per tag combination)
   */
  organizeByTags(
    targetDir: string,
    primaryTags: string[],
    mediaIds?: string[]
  ): OrganizePreview[] {
    const previews: OrganizePreview[] = []

    let mediaQuery = `
      SELECT m.*, GROUP_CONCAT(t.name, ', ') as tags
      FROM media m
      LEFT JOIN media_tags mt ON m.id = mt.mediaId
      LEFT JOIN tags t ON mt.tagId = t.id
    `
    const params: any[] = []

    if (mediaIds && mediaIds.length > 0) {
      const placeholders = mediaIds.map(() => '?').join(',')
      mediaQuery += ` WHERE m.id IN (${placeholders})`
      params.push(...mediaIds)
    }

    mediaQuery += ' GROUP BY m.id'

    const media = this.db.raw.prepare(mediaQuery).all(...params) as any[]

    for (const item of media) {
      const itemTags = (item.tags || '').split(', ').filter(Boolean)

      // Find first matching primary tag
      let folder = 'other'
      for (const primaryTag of primaryTags) {
        if (itemTags.some((t: string) => t.toLowerCase() === primaryTag.toLowerCase())) {
          folder = primaryTag.toLowerCase().replace(/\s+/g, '-')
          break
        }
      }

      const destDir = path.join(targetDir, folder)
      const destPath = path.join(destDir, item.filename)

      if (destPath === item.path) {
        previews.push({
          source: item.path,
          destination: destPath,
          mediaId: item.id,
          action: 'skip',
          reason: 'Already in correct location'
        })
      } else if (fs.existsSync(destPath)) {
        previews.push({
          source: item.path,
          destination: destPath,
          mediaId: item.id,
          action: 'conflict',
          reason: 'File already exists'
        })
      } else {
        previews.push({
          source: item.path,
          destination: destPath,
          mediaId: item.id,
          action: 'move'
        })
      }
    }

    return previews
  }

  /**
   * Flatten organization - move all files to single directory
   */
  flattenTo(targetDir: string, mediaIds?: string[]): OrganizePreview[] {
    const previews: OrganizePreview[] = []

    let mediaQuery = 'SELECT * FROM media'
    let params: any[] = []

    if (mediaIds && mediaIds.length > 0) {
      const placeholders = mediaIds.map(() => '?').join(',')
      mediaQuery += ` WHERE id IN (${placeholders})`
      params = mediaIds
    }

    const media = this.db.raw.prepare(mediaQuery).all(...params) as any[]

    const usedNames = new Set<string>()

    for (const item of media) {
      let destName = item.filename

      // Handle duplicates
      if (usedNames.has(destName.toLowerCase())) {
        const ext = path.extname(destName)
        const base = path.basename(destName, ext)
        let counter = 1
        while (usedNames.has(`${base}_${counter}${ext}`.toLowerCase())) {
          counter++
        }
        destName = `${base}_${counter}${ext}`
      }
      usedNames.add(destName.toLowerCase())

      const destPath = path.join(targetDir, destName)

      if (destPath === item.path) {
        previews.push({
          source: item.path,
          destination: destPath,
          mediaId: item.id,
          action: 'skip',
          reason: 'Already in target directory'
        })
      } else {
        previews.push({
          source: item.path,
          destination: destPath,
          mediaId: item.id,
          action: 'move'
        })
      }
    }

    return previews
  }

  /**
   * Find orphaned files (in media directories but not in database)
   */
  findOrphans(directories: string[]): string[] {
    const orphans: string[] = []
    const dbPaths = new Set<string>()

    // Get all paths in database
    const rows = this.db.raw.prepare('SELECT path FROM media').all() as { path: string }[]
    rows.forEach(r => dbPaths.add(r.path.toLowerCase()))

    // Scan directories
    const extensions = ['.mp4', '.mkv', '.avi', '.mov', '.webm', '.wmv', '.flv', '.m4v',
                        '.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp']

    for (const dir of directories) {
      if (!fs.existsSync(dir)) continue

      const scanDir = (currentDir: string) => {
        const entries = fs.readdirSync(currentDir, { withFileTypes: true })
        for (const entry of entries) {
          const fullPath = path.join(currentDir, entry.name)
          if (entry.isDirectory()) {
            scanDir(fullPath)
          } else if (entry.isFile()) {
            const ext = path.extname(entry.name).toLowerCase()
            if (extensions.includes(ext) && !dbPaths.has(fullPath.toLowerCase())) {
              orphans.push(fullPath)
            }
          }
        }
      }

      scanDir(dir)
    }

    return orphans
  }
}

// Singleton
let instance: AutoOrganizeService | null = null

export function getAutoOrganizeService(db: DB): AutoOrganizeService {
  if (!instance) {
    instance = new AutoOrganizeService(db)
  }
  return instance
}

// Preset organization schemes
export const ORGANIZE_PRESETS = {
  byType: {
    name: 'By Media Type',
    rules: [{ by: 'type' as OrganizeBy }]
  },
  byRating: {
    name: 'By Rating',
    rules: [{ by: 'rating' as OrganizeBy }]
  },
  byDate: {
    name: 'By Date Added',
    rules: [{ by: 'date' as OrganizeBy }]
  },
  byResolution: {
    name: 'By Resolution',
    rules: [{ by: 'resolution' as OrganizeBy }]
  },
  byTypeAndRating: {
    name: 'By Type, then Rating',
    rules: [
      { by: 'type' as OrganizeBy },
      { by: 'rating' as OrganizeBy }
    ]
  },
  byTypeAndDate: {
    name: 'By Type, then Date',
    rules: [
      { by: 'type' as OrganizeBy },
      { by: 'date' as OrganizeBy }
    ]
  }
}
