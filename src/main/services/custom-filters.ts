// File: src/main/services/custom-filters.ts
// Save and manage custom filter presets

import type { DB } from '../db'

export interface FilterCondition {
  field: 'type' | 'tags' | 'rating' | 'duration' | 'resolution' | 'size' | 'addedAt' | 'viewCount' | 'filename' | 'path' | 'favorite'
  operator: 'equals' | 'notEquals' | 'contains' | 'notContains' | 'greaterThan' | 'lessThan' | 'between' | 'in' | 'notIn' | 'exists' | 'notExists'
  value: any
  value2?: any // For 'between' operator
}

export interface CustomFilter {
  id: string
  name: string
  description?: string
  conditions: FilterCondition[]
  combineMode: 'and' | 'or'
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
  icon?: string
  color?: string
  isQuickAccess: boolean
  useCount: number
  createdAt: number
  updatedAt: number
}

export interface FilterResult {
  mediaIds: string[]
  totalCount: number
  executionTime: number
}

const PRESET_FILTERS: Omit<CustomFilter, 'id' | 'useCount' | 'createdAt' | 'updatedAt'>[] = [
  {
    name: 'Recently Added',
    description: 'Media added in the last 7 days',
    conditions: [{ field: 'addedAt', operator: 'greaterThan', value: -7 * 24 * 60 * 60 * 1000 }],
    combineMode: 'and',
    sortBy: 'addedAt',
    sortOrder: 'desc',
    icon: 'clock',
    isQuickAccess: true
  },
  {
    name: 'Highly Rated',
    description: 'Media rated 4 stars or higher',
    conditions: [{ field: 'rating', operator: 'greaterThan', value: 3.5 }],
    combineMode: 'and',
    sortBy: 'rating',
    sortOrder: 'desc',
    icon: 'star',
    isQuickAccess: true
  },
  {
    name: 'Unwatched',
    description: 'Media never viewed',
    conditions: [{ field: 'viewCount', operator: 'equals', value: 0 }],
    combineMode: 'and',
    sortBy: 'addedAt',
    sortOrder: 'desc',
    icon: 'eye-off',
    isQuickAccess: true
  },
  {
    name: 'Long Videos',
    description: 'Videos over 30 minutes',
    conditions: [
      { field: 'type', operator: 'equals', value: 'video' },
      { field: 'duration', operator: 'greaterThan', value: 1800 }
    ],
    combineMode: 'and',
    sortBy: 'duration',
    sortOrder: 'desc',
    icon: 'film',
    isQuickAccess: false
  },
  {
    name: 'Short Clips',
    description: 'Videos under 5 minutes',
    conditions: [
      { field: 'type', operator: 'equals', value: 'video' },
      { field: 'duration', operator: 'lessThan', value: 300 }
    ],
    combineMode: 'and',
    sortBy: 'duration',
    sortOrder: 'asc',
    icon: 'zap',
    isQuickAccess: false
  },
  {
    name: 'HD Content',
    description: '1080p and higher resolution',
    conditions: [{ field: 'resolution', operator: 'greaterThan', value: 1079 }],
    combineMode: 'and',
    sortBy: 'resolution',
    sortOrder: 'desc',
    icon: 'monitor',
    isQuickAccess: false
  },
  {
    name: 'Most Watched',
    description: 'Frequently viewed media',
    conditions: [{ field: 'viewCount', operator: 'greaterThan', value: 5 }],
    combineMode: 'and',
    sortBy: 'viewCount',
    sortOrder: 'desc',
    icon: 'trending-up',
    isQuickAccess: true
  },
  {
    name: 'Large Files',
    description: 'Files over 500MB',
    conditions: [{ field: 'size', operator: 'greaterThan', value: 500 * 1024 * 1024 }],
    combineMode: 'and',
    sortBy: 'size',
    sortOrder: 'desc',
    icon: 'hard-drive',
    isQuickAccess: false
  }
]

export class CustomFiltersService {
  constructor(private db: DB) {
    this.ensureTable()
    this.loadPresets()
  }

  private ensureTable(): void {
    this.db.raw.exec(`
      CREATE TABLE IF NOT EXISTS custom_filters (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        conditions TEXT NOT NULL,
        combineMode TEXT DEFAULT 'and',
        sortBy TEXT,
        sortOrder TEXT,
        icon TEXT,
        color TEXT,
        isQuickAccess INTEGER DEFAULT 0,
        isPreset INTEGER DEFAULT 0,
        useCount INTEGER DEFAULT 0,
        createdAt INTEGER NOT NULL,
        updatedAt INTEGER NOT NULL
      )
    `)
  }

  private loadPresets(): void {
    const existingPresets = this.db.raw.prepare('SELECT COUNT(*) as count FROM custom_filters WHERE isPreset = 1').get() as { count: number }
    if (existingPresets.count > 0) return

    const now = Date.now()
    for (const preset of PRESET_FILTERS) {
      const id = `preset-${preset.name.toLowerCase().replace(/\s+/g, '-')}`
      this.db.raw.prepare(`
        INSERT INTO custom_filters (id, name, description, conditions, combineMode, sortBy, sortOrder, icon, color, isQuickAccess, isPreset, useCount, createdAt, updatedAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0, ?, ?)
      `).run(
        id,
        preset.name,
        preset.description || null,
        JSON.stringify(preset.conditions),
        preset.combineMode,
        preset.sortBy || null,
        preset.sortOrder || null,
        preset.icon || null,
        preset.color || null,
        preset.isQuickAccess ? 1 : 0,
        now,
        now
      )
    }
  }

  /**
   * Get all filters
   */
  getFilters(includePresets = true): CustomFilter[] {
    const whereClause = includePresets ? '' : 'WHERE isPreset = 0'
    const rows = this.db.raw.prepare(`
      SELECT * FROM custom_filters ${whereClause}
      ORDER BY useCount DESC, name ASC
    `).all() as any[]

    return rows.map(row => this.rowToFilter(row))
  }

  /**
   * Get quick access filters
   */
  getQuickAccessFilters(): CustomFilter[] {
    const rows = this.db.raw.prepare(`
      SELECT * FROM custom_filters
      WHERE isQuickAccess = 1
      ORDER BY useCount DESC
    `).all() as any[]

    return rows.map(row => this.rowToFilter(row))
  }

  /**
   * Get a specific filter
   */
  getFilter(filterId: string): CustomFilter | null {
    const row = this.db.raw.prepare('SELECT * FROM custom_filters WHERE id = ?').get(filterId) as any
    if (!row) return null
    return this.rowToFilter(row)
  }

  /**
   * Create a new filter
   */
  createFilter(name: string, conditions: FilterCondition[], options?: {
    description?: string
    combineMode?: 'and' | 'or'
    sortBy?: string
    sortOrder?: 'asc' | 'desc'
    icon?: string
    color?: string
    isQuickAccess?: boolean
  }): CustomFilter {
    const id = this.generateId()
    const now = Date.now()

    this.db.raw.prepare(`
      INSERT INTO custom_filters (id, name, description, conditions, combineMode, sortBy, sortOrder, icon, color, isQuickAccess, isPreset, useCount, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?)
    `).run(
      id,
      name,
      options?.description || null,
      JSON.stringify(conditions),
      options?.combineMode || 'and',
      options?.sortBy || null,
      options?.sortOrder || null,
      options?.icon || null,
      options?.color || null,
      options?.isQuickAccess ? 1 : 0,
      now,
      now
    )

    return this.getFilter(id)!
  }

  /**
   * Update a filter
   */
  updateFilter(filterId: string, updates: Partial<Omit<CustomFilter, 'id' | 'useCount' | 'createdAt' | 'updatedAt'>>): CustomFilter | null {
    const existing = this.getFilter(filterId)
    if (!existing) return null

    const setClauses: string[] = ['updatedAt = ?']
    const values: any[] = [Date.now()]

    if (updates.name !== undefined) {
      setClauses.push('name = ?')
      values.push(updates.name)
    }
    if (updates.description !== undefined) {
      setClauses.push('description = ?')
      values.push(updates.description)
    }
    if (updates.conditions !== undefined) {
      setClauses.push('conditions = ?')
      values.push(JSON.stringify(updates.conditions))
    }
    if (updates.combineMode !== undefined) {
      setClauses.push('combineMode = ?')
      values.push(updates.combineMode)
    }
    if (updates.sortBy !== undefined) {
      setClauses.push('sortBy = ?')
      values.push(updates.sortBy)
    }
    if (updates.sortOrder !== undefined) {
      setClauses.push('sortOrder = ?')
      values.push(updates.sortOrder)
    }
    if (updates.icon !== undefined) {
      setClauses.push('icon = ?')
      values.push(updates.icon)
    }
    if (updates.color !== undefined) {
      setClauses.push('color = ?')
      values.push(updates.color)
    }
    if (updates.isQuickAccess !== undefined) {
      setClauses.push('isQuickAccess = ?')
      values.push(updates.isQuickAccess ? 1 : 0)
    }

    values.push(filterId)
    this.db.raw.prepare(`UPDATE custom_filters SET ${setClauses.join(', ')} WHERE id = ?`).run(...values)

    return this.getFilter(filterId)
  }

  /**
   * Delete a filter
   */
  deleteFilter(filterId: string): boolean {
    const result = this.db.raw.prepare('DELETE FROM custom_filters WHERE id = ? AND isPreset = 0').run(filterId)
    return result.changes > 0
  }

  /**
   * Execute a filter
   */
  executeFilter(filterId: string): FilterResult {
    const filter = this.getFilter(filterId)
    if (!filter) {
      return { mediaIds: [], totalCount: 0, executionTime: 0 }
    }

    const startTime = Date.now()
    const result = this.executeConditions(filter.conditions, filter.combineMode, filter.sortBy, filter.sortOrder)
    const executionTime = Date.now() - startTime

    // Increment use count
    this.db.raw.prepare('UPDATE custom_filters SET useCount = useCount + 1 WHERE id = ?').run(filterId)

    return {
      mediaIds: result,
      totalCount: result.length,
      executionTime
    }
  }

  /**
   * Execute raw conditions
   */
  executeConditions(conditions: FilterCondition[], combineMode: 'and' | 'or', sortBy?: string, sortOrder?: 'asc' | 'desc'): string[] {
    if (conditions.length === 0) {
      return []
    }

    const whereClauses: string[] = []
    const values: any[] = []

    for (const condition of conditions) {
      const { clause, val } = this.buildConditionClause(condition)
      if (clause) {
        whereClauses.push(clause)
        if (Array.isArray(val)) {
          values.push(...val)
        } else if (val !== undefined) {
          values.push(val)
        }
      }
    }

    if (whereClauses.length === 0) {
      return []
    }

    const whereClause = whereClauses.join(combineMode === 'and' ? ' AND ' : ' OR ')
    let orderClause = ''
    if (sortBy) {
      const column = this.mapSortField(sortBy)
      orderClause = `ORDER BY ${column} ${sortOrder === 'asc' ? 'ASC' : 'DESC'}`
    }

    const query = `
      SELECT DISTINCT m.id
      FROM media m
      LEFT JOIN media_stats ms ON m.id = ms.mediaId
      LEFT JOIN media_tags mt ON m.id = mt.mediaId
      LEFT JOIN tags t ON mt.tagId = t.id
      WHERE ${whereClause}
      ${orderClause}
    `

    const rows = this.db.raw.prepare(query).all(...values) as Array<{ id: string }>
    return rows.map(r => r.id)
  }

  /**
   * Preview filter (get count without incrementing use)
   */
  previewFilter(conditions: FilterCondition[], combineMode: 'and' | 'or'): number {
    const result = this.executeConditions(conditions, combineMode)
    return result.length
  }

  /**
   * Duplicate a filter
   */
  duplicateFilter(filterId: string, newName?: string): CustomFilter | null {
    const original = this.getFilter(filterId)
    if (!original) return null

    return this.createFilter(
      newName || `${original.name} (Copy)`,
      original.conditions,
      {
        description: original.description,
        combineMode: original.combineMode,
        sortBy: original.sortBy,
        sortOrder: original.sortOrder,
        icon: original.icon,
        color: original.color,
        isQuickAccess: false
      }
    )
  }

  /**
   * Toggle quick access
   */
  toggleQuickAccess(filterId: string): CustomFilter | null {
    const filter = this.getFilter(filterId)
    if (!filter) return null

    return this.updateFilter(filterId, { isQuickAccess: !filter.isQuickAccess })
  }

  /**
   * Get statistics
   */
  getStats(): {
    totalFilters: number
    customFilters: number
    presetFilters: number
    quickAccessFilters: number
    mostUsed: { id: string; name: string; useCount: number } | null
  } {
    const total = this.db.raw.prepare('SELECT COUNT(*) as count FROM custom_filters').get() as { count: number }
    const custom = this.db.raw.prepare('SELECT COUNT(*) as count FROM custom_filters WHERE isPreset = 0').get() as { count: number }
    const presets = this.db.raw.prepare('SELECT COUNT(*) as count FROM custom_filters WHERE isPreset = 1').get() as { count: number }
    const quickAccess = this.db.raw.prepare('SELECT COUNT(*) as count FROM custom_filters WHERE isQuickAccess = 1').get() as { count: number }
    const mostUsed = this.db.raw.prepare('SELECT id, name, useCount FROM custom_filters ORDER BY useCount DESC LIMIT 1').get() as { id: string; name: string; useCount: number } | undefined

    return {
      totalFilters: total.count,
      customFilters: custom.count,
      presetFilters: presets.count,
      quickAccessFilters: quickAccess.count,
      mostUsed: mostUsed || null
    }
  }

  /**
   * Export filters
   */
  exportFilters(): string {
    const filters = this.getFilters(false) // Only custom, not presets
    return JSON.stringify(filters, null, 2)
  }

  /**
   * Import filters
   */
  importFilters(json: string): number {
    const filters = JSON.parse(json) as CustomFilter[]
    let imported = 0

    for (const filter of filters) {
      try {
        this.createFilter(filter.name, filter.conditions, {
          description: filter.description,
          combineMode: filter.combineMode,
          sortBy: filter.sortBy,
          sortOrder: filter.sortOrder,
          icon: filter.icon,
          color: filter.color,
          isQuickAccess: filter.isQuickAccess
        })
        imported++
      } catch {
        // Skip errors
      }
    }

    return imported
  }

  private buildConditionClause(condition: FilterCondition): { clause: string; val: any } {
    const { field, operator, value, value2 } = condition

    switch (field) {
      case 'type':
        return this.buildStringCondition('m.type', operator, value)
      case 'tags':
        return this.buildTagCondition(operator, value)
      case 'rating':
        return this.buildNumericCondition('COALESCE(ms.rating, 0)', operator, value, value2)
      case 'duration':
        return this.buildNumericCondition('COALESCE(m.durationSec, 0)', operator, value, value2)
      case 'resolution':
        return this.buildNumericCondition('COALESCE(m.height, 0)', operator, value, value2)
      case 'size':
        return this.buildNumericCondition('COALESCE(m.size, 0)', operator, value, value2)
      case 'addedAt':
        if (typeof value === 'number' && value < 0) {
          // Relative time (negative offset from now)
          return { clause: 'm.addedAt > ?', val: Date.now() + value }
        }
        return this.buildNumericCondition('m.addedAt', operator, value, value2)
      case 'viewCount':
        return this.buildNumericCondition('COALESCE(ms.playCount, 0)', operator, value, value2)
      case 'filename':
        return this.buildStringCondition('m.filename', operator, value)
      case 'path':
        return this.buildStringCondition('m.path', operator, value)
      case 'favorite':
        return { clause: value ? 'ms.rating >= 5' : 'COALESCE(ms.rating, 0) < 5', val: undefined }
      default:
        return { clause: '', val: undefined }
    }
  }

  private buildStringCondition(column: string, operator: string, value: any): { clause: string; val: any } {
    switch (operator) {
      case 'equals':
        return { clause: `${column} = ?`, val: value }
      case 'notEquals':
        return { clause: `${column} != ?`, val: value }
      case 'contains':
        return { clause: `${column} LIKE ?`, val: `%${value}%` }
      case 'notContains':
        return { clause: `${column} NOT LIKE ?`, val: `%${value}%` }
      default:
        return { clause: '', val: undefined }
    }
  }

  private buildNumericCondition(column: string, operator: string, value: any, value2?: any): { clause: string; val: any } {
    switch (operator) {
      case 'equals':
        return { clause: `${column} = ?`, val: value }
      case 'notEquals':
        return { clause: `${column} != ?`, val: value }
      case 'greaterThan':
        return { clause: `${column} > ?`, val: value }
      case 'lessThan':
        return { clause: `${column} < ?`, val: value }
      case 'between':
        return { clause: `${column} BETWEEN ? AND ?`, val: [value, value2] }
      default:
        return { clause: '', val: undefined }
    }
  }

  private buildTagCondition(operator: string, value: any): { clause: string; val: any } {
    const tags = Array.isArray(value) ? value : [value]
    const placeholders = tags.map(() => '?').join(',')

    switch (operator) {
      case 'in':
        return { clause: `t.name IN (${placeholders})`, val: tags }
      case 'notIn':
        return { clause: `m.id NOT IN (SELECT mediaId FROM media_tags mt2 JOIN tags t2 ON mt2.tagId = t2.id WHERE t2.name IN (${placeholders}))`, val: tags }
      case 'exists':
        return { clause: 'mt.tagId IS NOT NULL', val: undefined }
      case 'notExists':
        return { clause: 'm.id NOT IN (SELECT mediaId FROM media_tags)', val: undefined }
      default:
        return { clause: '', val: undefined }
    }
  }

  private mapSortField(field: string): string {
    const map: Record<string, string> = {
      addedAt: 'm.addedAt',
      rating: 'COALESCE(ms.rating, 0)',
      duration: 'COALESCE(m.durationSec, 0)',
      size: 'COALESCE(m.size, 0)',
      viewCount: 'COALESCE(ms.playCount, 0)',
      filename: 'm.filename',
      resolution: 'COALESCE(m.height, 0)'
    }
    return map[field] || 'm.addedAt'
  }

  private rowToFilter(row: any): CustomFilter {
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      conditions: JSON.parse(row.conditions),
      combineMode: row.combineMode,
      sortBy: row.sortBy,
      sortOrder: row.sortOrder,
      icon: row.icon,
      color: row.color,
      isQuickAccess: row.isQuickAccess === 1,
      useCount: row.useCount,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt
    }
  }

  private generateId(): string {
    return `filter-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
  }
}

// Singleton
let instance: CustomFiltersService | null = null

export function getCustomFiltersService(db: DB): CustomFiltersService {
  if (!instance) {
    instance = new CustomFiltersService(db)
  }
  return instance
}
