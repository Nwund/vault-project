// File: src/main/services/view-presets.ts
// Save and restore view/filter presets

import type { DB } from '../db'

export type SortField = 'addedAt' | 'filename' | 'size' | 'duration' | 'rating' | 'viewCount' | 'random'
export type SortOrder = 'asc' | 'desc'
export type ViewMode = 'grid' | 'list' | 'compact' | 'detail'

export interface ViewFilters {
  types?: ('video' | 'image' | 'gif')[]
  tags?: string[]                    // Tag IDs to include
  excludeTags?: string[]             // Tag IDs to exclude
  minRating?: number
  maxRating?: number
  minDuration?: number               // Seconds
  maxDuration?: number
  minSize?: number                   // Bytes
  maxSize?: number
  resolution?: ('sd' | 'hd' | '4k')[]
  addedAfter?: number                // Timestamp
  addedBefore?: number
  hasAudio?: boolean
  isFavorite?: boolean
  untagged?: boolean
  unwatched?: boolean
  inPlaylist?: string                // Playlist ID
  notInPlaylist?: string
  performer?: string                 // Performer ID
  collection?: string                // Collection ID
  search?: string                    // Text search
}

export interface ViewConfig {
  mode: ViewMode
  columns?: number                   // For grid view
  thumbnailSize?: 'small' | 'medium' | 'large'
  showInfo?: boolean
  showRating?: boolean
  showDuration?: boolean
  autoplay?: boolean
  loop?: boolean
}

export interface ViewPreset {
  id: string
  name: string
  description?: string
  icon?: string
  color?: string
  sort: {
    field: SortField
    order: SortOrder
  }
  filters: ViewFilters
  view: ViewConfig
  isBuiltin: boolean
  createdAt: number
  updatedAt: number
}

const BUILTIN_PRESETS: Omit<ViewPreset, 'createdAt' | 'updatedAt'>[] = [
  {
    id: 'all-media',
    name: 'All Media',
    description: 'Show everything',
    icon: 'grid',
    isBuiltin: true,
    sort: { field: 'addedAt', order: 'desc' },
    filters: {},
    view: { mode: 'grid', columns: 4, showInfo: true }
  },
  {
    id: 'recent',
    name: 'Recently Added',
    description: 'Newest items first',
    icon: 'clock',
    isBuiltin: true,
    sort: { field: 'addedAt', order: 'desc' },
    filters: {},
    view: { mode: 'grid', columns: 4, showInfo: true }
  },
  {
    id: 'favorites',
    name: 'Favorites',
    description: '5-star rated items',
    icon: 'heart',
    color: '#ef4444',
    isBuiltin: true,
    sort: { field: 'rating', order: 'desc' },
    filters: { minRating: 5 },
    view: { mode: 'grid', columns: 4 }
  },
  {
    id: 'top-rated',
    name: 'Top Rated',
    description: '4+ star items',
    icon: 'star',
    color: '#f59e0b',
    isBuiltin: true,
    sort: { field: 'rating', order: 'desc' },
    filters: { minRating: 4 },
    view: { mode: 'grid', columns: 4 }
  },
  {
    id: 'videos-only',
    name: 'Videos Only',
    description: 'Just video files',
    icon: 'video',
    color: '#3b82f6',
    isBuiltin: true,
    sort: { field: 'addedAt', order: 'desc' },
    filters: { types: ['video'] },
    view: { mode: 'grid', columns: 3 }
  },
  {
    id: 'images-only',
    name: 'Images Only',
    description: 'Just images and GIFs',
    icon: 'image',
    color: '#10b981',
    isBuiltin: true,
    sort: { field: 'addedAt', order: 'desc' },
    filters: { types: ['image', 'gif'] },
    view: { mode: 'grid', columns: 5 }
  },
  {
    id: 'long-videos',
    name: 'Long Videos',
    description: '15+ minutes',
    icon: 'film',
    isBuiltin: true,
    sort: { field: 'duration', order: 'desc' },
    filters: { types: ['video'], minDuration: 900 },
    view: { mode: 'grid', columns: 3 }
  },
  {
    id: 'quick-clips',
    name: 'Quick Clips',
    description: 'Under 2 minutes',
    icon: 'zap',
    isBuiltin: true,
    sort: { field: 'duration', order: 'asc' },
    filters: { types: ['video'], maxDuration: 120 },
    view: { mode: 'grid', columns: 4 }
  },
  {
    id: 'untagged',
    name: 'Untagged',
    description: 'Items needing tags',
    icon: 'tag',
    color: '#6366f1',
    isBuiltin: true,
    sort: { field: 'addedAt', order: 'desc' },
    filters: { untagged: true },
    view: { mode: 'grid', columns: 4 }
  },
  {
    id: 'unwatched',
    name: 'Unwatched',
    description: 'Never viewed items',
    icon: 'eye-off',
    isBuiltin: true,
    sort: { field: 'addedAt', order: 'desc' },
    filters: { unwatched: true },
    view: { mode: 'grid', columns: 4 }
  },
  {
    id: 'most-watched',
    name: 'Most Watched',
    description: 'By view count',
    icon: 'trending-up',
    color: '#ec4899',
    isBuiltin: true,
    sort: { field: 'viewCount', order: 'desc' },
    filters: {},
    view: { mode: 'grid', columns: 4 }
  },
  {
    id: 'largest',
    name: 'Largest Files',
    description: 'By file size',
    icon: 'database',
    isBuiltin: true,
    sort: { field: 'size', order: 'desc' },
    filters: {},
    view: { mode: 'list', showInfo: true }
  },
  {
    id: 'hd-content',
    name: 'HD Content',
    description: '720p and above',
    icon: 'monitor',
    isBuiltin: true,
    sort: { field: 'addedAt', order: 'desc' },
    filters: { types: ['video'], resolution: ['hd', '4k'] },
    view: { mode: 'grid', columns: 3 }
  },
  {
    id: '4k-content',
    name: '4K Content',
    description: 'Ultra HD only',
    icon: 'monitor',
    color: '#8b5cf6',
    isBuiltin: true,
    sort: { field: 'addedAt', order: 'desc' },
    filters: { types: ['video'], resolution: ['4k'] },
    view: { mode: 'grid', columns: 3 }
  },
  {
    id: 'random',
    name: 'Random',
    description: 'Shuffle everything',
    icon: 'shuffle',
    isBuiltin: true,
    sort: { field: 'random', order: 'desc' },
    filters: {},
    view: { mode: 'grid', columns: 4 }
  }
]

export class ViewPresetsService {
  private presets: Map<string, ViewPreset> = new Map()
  private activePresetId: string | null = null

  constructor(private db: DB) {
    this.loadBuiltinPresets()
    this.loadCustomPresets()
  }

  private loadBuiltinPresets(): void {
    const now = Date.now()
    for (const preset of BUILTIN_PRESETS) {
      this.presets.set(preset.id, {
        ...preset,
        createdAt: now,
        updatedAt: now
      })
    }
  }

  private loadCustomPresets(): void {
    try {
      const rows = this.db.raw.prepare(`
        SELECT * FROM view_presets ORDER BY name
      `).all() as any[]

      for (const row of rows) {
        const preset: ViewPreset = {
          id: row.id,
          name: row.name,
          description: row.description,
          icon: row.icon,
          color: row.color,
          sort: JSON.parse(row.sortConfig || '{"field":"addedAt","order":"desc"}'),
          filters: JSON.parse(row.filters || '{}'),
          view: JSON.parse(row.viewConfig || '{"mode":"grid"}'),
          isBuiltin: false,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt
        }
        this.presets.set(preset.id, preset)
      }
    } catch (e) {
      // Table might not exist yet
      this.createTable()
    }
  }

  private createTable(): void {
    this.db.raw.exec(`
      CREATE TABLE IF NOT EXISTS view_presets (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        icon TEXT,
        color TEXT,
        sortConfig TEXT,
        filters TEXT,
        viewConfig TEXT,
        createdAt INTEGER NOT NULL,
        updatedAt INTEGER NOT NULL
      )
    `)
  }

  /**
   * Get all presets
   */
  getPresets(): ViewPreset[] {
    return Array.from(this.presets.values())
  }

  /**
   * Get builtin presets only
   */
  getBuiltinPresets(): ViewPreset[] {
    return Array.from(this.presets.values()).filter(p => p.isBuiltin)
  }

  /**
   * Get custom presets only
   */
  getCustomPresets(): ViewPreset[] {
    return Array.from(this.presets.values()).filter(p => !p.isBuiltin)
  }

  /**
   * Get a specific preset
   */
  getPreset(id: string): ViewPreset | null {
    return this.presets.get(id) || null
  }

  /**
   * Get active preset
   */
  getActivePreset(): ViewPreset | null {
    if (!this.activePresetId) return null
    return this.presets.get(this.activePresetId) || null
  }

  /**
   * Set active preset
   */
  setActivePreset(id: string | null): ViewPreset | null {
    this.activePresetId = id
    if (!id) return null
    return this.presets.get(id) || null
  }

  /**
   * Create a new preset
   */
  createPreset(preset: Omit<ViewPreset, 'id' | 'isBuiltin' | 'createdAt' | 'updatedAt'>): ViewPreset {
    const id = `preset-${Date.now()}`
    const now = Date.now()

    const newPreset: ViewPreset = {
      ...preset,
      id,
      isBuiltin: false,
      createdAt: now,
      updatedAt: now
    }

    this.presets.set(id, newPreset)
    this.savePreset(newPreset)

    return newPreset
  }

  /**
   * Update a preset
   */
  updatePreset(id: string, updates: Partial<ViewPreset>): ViewPreset | null {
    const preset = this.presets.get(id)
    if (!preset || preset.isBuiltin) return null

    Object.assign(preset, updates, {
      id,
      isBuiltin: false,
      updatedAt: Date.now()
    })

    this.savePreset(preset)
    return preset
  }

  /**
   * Delete a preset
   */
  deletePreset(id: string): boolean {
    const preset = this.presets.get(id)
    if (!preset || preset.isBuiltin) return false

    this.presets.delete(id)

    try {
      this.db.raw.prepare('DELETE FROM view_presets WHERE id = ?').run(id)
    } catch {
      // Ignore DB errors
    }

    if (this.activePresetId === id) {
      this.activePresetId = null
    }

    return true
  }

  /**
   * Duplicate a preset
   */
  duplicatePreset(id: string, newName?: string): ViewPreset | null {
    const original = this.presets.get(id)
    if (!original) return null

    return this.createPreset({
      name: newName || `${original.name} (Copy)`,
      description: original.description,
      icon: original.icon,
      color: original.color,
      sort: { ...original.sort },
      filters: { ...original.filters },
      view: { ...original.view }
    })
  }

  /**
   * Save current view state as a preset
   */
  saveCurrentAsPreset(
    name: string,
    sort: ViewPreset['sort'],
    filters: ViewFilters,
    view: ViewConfig
  ): ViewPreset {
    return this.createPreset({
      name,
      sort,
      filters,
      view
    })
  }

  private savePreset(preset: ViewPreset): void {
    try {
      this.db.raw.prepare(`
        INSERT OR REPLACE INTO view_presets
        (id, name, description, icon, color, sortConfig, filters, viewConfig, createdAt, updatedAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        preset.id,
        preset.name,
        preset.description || null,
        preset.icon || null,
        preset.color || null,
        JSON.stringify(preset.sort),
        JSON.stringify(preset.filters),
        JSON.stringify(preset.view),
        preset.createdAt,
        preset.updatedAt
      )
    } catch (e) {
      console.error('[ViewPresets] Failed to save preset:', e)
    }
  }

  /**
   * Get media count for a preset
   */
  getPresetCount(id: string): number {
    const preset = this.presets.get(id)
    if (!preset) return 0

    return this.countMediaForFilters(preset.filters)
  }

  /**
   * Count media matching filters
   */
  private countMediaForFilters(filters: ViewFilters): number {
    let query = 'SELECT COUNT(*) as count FROM media m'
    const joins: string[] = []
    const where: string[] = []
    const params: any[] = []

    // Type filter
    if (filters.types && filters.types.length > 0) {
      const placeholders = filters.types.map(() => '?').join(',')
      where.push(`m.type IN (${placeholders})`)
      params.push(...filters.types)
    }

    // Rating filter
    if (filters.minRating !== undefined || filters.maxRating !== undefined) {
      joins.push('LEFT JOIN media_stats ms ON m.id = ms.mediaId')
      if (filters.minRating !== undefined) {
        where.push('ms.rating >= ?')
        params.push(filters.minRating)
      }
      if (filters.maxRating !== undefined) {
        where.push('ms.rating <= ?')
        params.push(filters.maxRating)
      }
    }

    // Duration filter
    if (filters.minDuration !== undefined) {
      where.push('m.durationSec >= ?')
      params.push(filters.minDuration)
    }
    if (filters.maxDuration !== undefined) {
      where.push('m.durationSec <= ?')
      params.push(filters.maxDuration)
    }

    // Untagged filter
    if (filters.untagged) {
      where.push('NOT EXISTS (SELECT 1 FROM media_tags mt WHERE mt.mediaId = m.id)')
    }

    // Unwatched filter
    if (filters.unwatched) {
      joins.push('LEFT JOIN media_stats ms2 ON m.id = ms2.mediaId')
      where.push('(ms2.viewCount IS NULL OR ms2.viewCount = 0)')
    }

    // Resolution filter
    if (filters.resolution && filters.resolution.length > 0) {
      const resConds: string[] = []
      if (filters.resolution.includes('4k')) {
        resConds.push('m.height >= 2160')
      }
      if (filters.resolution.includes('hd')) {
        resConds.push('(m.height >= 720 AND m.height < 2160)')
      }
      if (filters.resolution.includes('sd')) {
        resConds.push('m.height < 720')
      }
      if (resConds.length > 0) {
        where.push(`(${resConds.join(' OR ')})`)
      }
    }

    // Build query
    query += joins.length > 0 ? ' ' + joins.join(' ') : ''
    query += where.length > 0 ? ' WHERE ' + where.join(' AND ') : ''

    try {
      const result = this.db.raw.prepare(query).get(...params) as { count: number }
      return result.count
    } catch {
      return 0
    }
  }

  /**
   * Export presets
   */
  exportPresets(): ViewPreset[] {
    return this.getCustomPresets()
  }

  /**
   * Import presets
   */
  importPresets(presets: ViewPreset[], overwrite = false): number {
    let imported = 0

    for (const preset of presets) {
      const existing = this.presets.get(preset.id)
      if (existing && !overwrite) continue

      const newPreset = this.createPreset({
        name: preset.name,
        description: preset.description,
        icon: preset.icon,
        color: preset.color,
        sort: preset.sort,
        filters: preset.filters,
        view: preset.view
      })

      if (newPreset) imported++
    }

    return imported
  }
}

// Singleton
let instance: ViewPresetsService | null = null

export function getViewPresetsService(db: DB): ViewPresetsService {
  if (!instance) {
    instance = new ViewPresetsService(db)
  }
  return instance
}
