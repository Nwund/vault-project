// File: src/main/services/tag-categories.ts
// Organize tags into hierarchical categories

import type { DB } from '../db'

export interface TagCategory {
  id: string
  name: string
  description?: string
  color?: string
  icon?: string
  parentId: string | null
  sortOrder: number
  isSystem: boolean
  tagCount: number
  createdAt: number
}

export interface TagCategoryTree extends TagCategory {
  children: TagCategoryTree[]
  tags: Array<{ id: string; name: string; color?: string }>
}

export interface CategoryStats {
  totalCategories: number
  totalTags: number
  uncategorizedTags: number
  avgTagsPerCategory: number
}

const SYSTEM_CATEGORIES: Omit<TagCategory, 'tagCount' | 'createdAt'>[] = [
  { id: 'cat-content', name: 'Content Type', description: 'Type of content', color: '#3b82f6', icon: 'film', parentId: null, sortOrder: 0, isSystem: true },
  { id: 'cat-people', name: 'People', description: 'People and performers', color: '#ec4899', icon: 'users', parentId: null, sortOrder: 1, isSystem: true },
  { id: 'cat-actions', name: 'Actions', description: 'Activities and actions', color: '#f59e0b', icon: 'zap', parentId: null, sortOrder: 2, isSystem: true },
  { id: 'cat-setting', name: 'Setting', description: 'Location and environment', color: '#10b981', icon: 'map', parentId: null, sortOrder: 3, isSystem: true },
  { id: 'cat-style', name: 'Style', description: 'Visual style and aesthetics', color: '#8b5cf6', icon: 'palette', parentId: null, sortOrder: 4, isSystem: true },
  { id: 'cat-mood', name: 'Mood', description: 'Mood and atmosphere', color: '#ef4444', icon: 'heart', parentId: null, sortOrder: 5, isSystem: true },
  { id: 'cat-quality', name: 'Quality', description: 'Technical quality', color: '#06b6d4', icon: 'award', parentId: null, sortOrder: 6, isSystem: true },
  { id: 'cat-source', name: 'Source', description: 'Content source', color: '#64748b', icon: 'link', parentId: null, sortOrder: 7, isSystem: true },
]

export class TagCategoriesService {
  constructor(private db: DB) {
    this.ensureTable()
    this.ensureSystemCategories()
  }

  private ensureTable(): void {
    this.db.raw.exec(`
      CREATE TABLE IF NOT EXISTS tag_categories (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        color TEXT,
        icon TEXT,
        parentId TEXT,
        sortOrder INTEGER DEFAULT 0,
        isSystem INTEGER DEFAULT 0,
        createdAt INTEGER NOT NULL,
        FOREIGN KEY (parentId) REFERENCES tag_categories(id) ON DELETE SET NULL
      )
    `)

    // Add categoryId to tags if not exists
    try {
      this.db.raw.exec(`ALTER TABLE tags ADD COLUMN categoryId TEXT REFERENCES tag_categories(id)`)
    } catch {
      // Column already exists
    }
  }

  private ensureSystemCategories(): void {
    const now = Date.now()
    for (const cat of SYSTEM_CATEGORIES) {
      const existing = this.db.raw.prepare('SELECT id FROM tag_categories WHERE id = ?').get(cat.id)
      if (!existing) {
        this.db.raw.prepare(`
          INSERT INTO tag_categories (id, name, description, color, icon, parentId, sortOrder, isSystem, createdAt)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(cat.id, cat.name, cat.description, cat.color, cat.icon, cat.parentId, cat.sortOrder, cat.isSystem ? 1 : 0, now)
      }
    }
  }

  /**
   * Get all categories
   */
  getCategories(): TagCategory[] {
    const rows = this.db.raw.prepare(`
      SELECT tc.*, COUNT(t.id) as tagCount
      FROM tag_categories tc
      LEFT JOIN tags t ON t.categoryId = tc.id
      GROUP BY tc.id
      ORDER BY tc.sortOrder, tc.name
    `).all() as any[]

    return rows.map(row => ({
      id: row.id,
      name: row.name,
      description: row.description,
      color: row.color,
      icon: row.icon,
      parentId: row.parentId,
      sortOrder: row.sortOrder,
      isSystem: row.isSystem === 1,
      tagCount: row.tagCount,
      createdAt: row.createdAt
    }))
  }

  /**
   * Get category tree (hierarchical)
   */
  getCategoryTree(): TagCategoryTree[] {
    const categories = this.getCategories()
    const tagsMap = this.getTagsByCategory()

    const buildTree = (parentId: string | null): TagCategoryTree[] => {
      return categories
        .filter(c => c.parentId === parentId)
        .map(c => ({
          ...c,
          children: buildTree(c.id),
          tags: tagsMap.get(c.id) || []
        }))
    }

    return buildTree(null)
  }

  /**
   * Get a specific category
   */
  getCategory(categoryId: string): TagCategory | null {
    const row = this.db.raw.prepare(`
      SELECT tc.*, COUNT(t.id) as tagCount
      FROM tag_categories tc
      LEFT JOIN tags t ON t.categoryId = tc.id
      WHERE tc.id = ?
      GROUP BY tc.id
    `).get(categoryId) as any

    if (!row) return null

    return {
      id: row.id,
      name: row.name,
      description: row.description,
      color: row.color,
      icon: row.icon,
      parentId: row.parentId,
      sortOrder: row.sortOrder,
      isSystem: row.isSystem === 1,
      tagCount: row.tagCount,
      createdAt: row.createdAt
    }
  }

  /**
   * Create a new category
   */
  createCategory(name: string, options?: {
    description?: string
    color?: string
    icon?: string
    parentId?: string
  }): TagCategory {
    const id = this.generateId()
    const now = Date.now()

    // Get max sort order
    const maxOrder = this.db.raw.prepare(`
      SELECT MAX(sortOrder) as max FROM tag_categories WHERE parentId IS ?
    `).get(options?.parentId || null) as { max: number | null }

    this.db.raw.prepare(`
      INSERT INTO tag_categories (id, name, description, color, icon, parentId, sortOrder, isSystem, createdAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)
    `).run(
      id,
      name,
      options?.description || null,
      options?.color || null,
      options?.icon || null,
      options?.parentId || null,
      (maxOrder.max || 0) + 1,
      now
    )

    return this.getCategory(id)!
  }

  /**
   * Update a category
   */
  updateCategory(categoryId: string, updates: Partial<Pick<TagCategory, 'name' | 'description' | 'color' | 'icon' | 'parentId' | 'sortOrder'>>): TagCategory | null {
    const existing = this.getCategory(categoryId)
    if (!existing || existing.isSystem) return null

    const setClauses: string[] = []
    const values: any[] = []

    if (updates.name !== undefined) {
      setClauses.push('name = ?')
      values.push(updates.name)
    }
    if (updates.description !== undefined) {
      setClauses.push('description = ?')
      values.push(updates.description)
    }
    if (updates.color !== undefined) {
      setClauses.push('color = ?')
      values.push(updates.color)
    }
    if (updates.icon !== undefined) {
      setClauses.push('icon = ?')
      values.push(updates.icon)
    }
    if (updates.parentId !== undefined) {
      setClauses.push('parentId = ?')
      values.push(updates.parentId)
    }
    if (updates.sortOrder !== undefined) {
      setClauses.push('sortOrder = ?')
      values.push(updates.sortOrder)
    }

    if (setClauses.length === 0) return existing

    values.push(categoryId)
    this.db.raw.prepare(`UPDATE tag_categories SET ${setClauses.join(', ')} WHERE id = ?`).run(...values)

    return this.getCategory(categoryId)
  }

  /**
   * Delete a category
   */
  deleteCategory(categoryId: string): boolean {
    const existing = this.getCategory(categoryId)
    if (!existing || existing.isSystem) return false

    // Move child categories to parent
    this.db.raw.prepare('UPDATE tag_categories SET parentId = ? WHERE parentId = ?').run(existing.parentId, categoryId)

    // Uncategorize tags
    this.db.raw.prepare('UPDATE tags SET categoryId = NULL WHERE categoryId = ?').run(categoryId)

    // Delete category
    const result = this.db.raw.prepare('DELETE FROM tag_categories WHERE id = ?').run(categoryId)
    return result.changes > 0
  }

  /**
   * Assign tag to category
   */
  assignTagToCategory(tagId: string, categoryId: string | null): boolean {
    const result = this.db.raw.prepare('UPDATE tags SET categoryId = ? WHERE id = ?').run(categoryId, tagId)
    return result.changes > 0
  }

  /**
   * Bulk assign tags to category
   */
  bulkAssignTags(tagIds: string[], categoryId: string | null): number {
    const placeholders = tagIds.map(() => '?').join(',')
    const result = this.db.raw.prepare(`UPDATE tags SET categoryId = ? WHERE id IN (${placeholders})`).run(categoryId, ...tagIds)
    return result.changes
  }

  /**
   * Get tags in a category
   */
  getTagsInCategory(categoryId: string | null): Array<{ id: string; name: string; color?: string; mediaCount: number }> {
    const query = categoryId
      ? `SELECT t.id, t.name, t.color, COUNT(mt.mediaId) as mediaCount
         FROM tags t
         LEFT JOIN media_tags mt ON t.id = mt.tagId
         WHERE t.categoryId = ?
         GROUP BY t.id
         ORDER BY t.name`
      : `SELECT t.id, t.name, t.color, COUNT(mt.mediaId) as mediaCount
         FROM tags t
         LEFT JOIN media_tags mt ON t.id = mt.tagId
         WHERE t.categoryId IS NULL
         GROUP BY t.id
         ORDER BY t.name`

    const rows = categoryId
      ? this.db.raw.prepare(query).all(categoryId) as any[]
      : this.db.raw.prepare(query).all() as any[]

    return rows.map(row => ({
      id: row.id,
      name: row.name,
      color: row.color,
      mediaCount: row.mediaCount
    }))
  }

  /**
   * Get tags grouped by category
   */
  private getTagsByCategory(): Map<string, Array<{ id: string; name: string; color?: string }>> {
    const rows = this.db.raw.prepare(`
      SELECT id, name, color, categoryId FROM tags WHERE categoryId IS NOT NULL
    `).all() as any[]

    const map = new Map<string, Array<{ id: string; name: string; color?: string }>>()

    for (const row of rows) {
      const existing = map.get(row.categoryId) || []
      existing.push({ id: row.id, name: row.name, color: row.color })
      map.set(row.categoryId, existing)
    }

    return map
  }

  /**
   * Get uncategorized tags
   */
  getUncategorizedTags(): Array<{ id: string; name: string; color?: string; mediaCount: number }> {
    return this.getTagsInCategory(null)
  }

  /**
   * Auto-categorize tags based on patterns
   */
  autoCategorize(): { categorized: number; patterns: Array<{ pattern: string; category: string; count: number }> } {
    const patterns: Array<{ regex: RegExp; categoryId: string; name: string }> = [
      // Content type
      { regex: /^(video|image|gif|animation|clip|movie|scene)$/i, categoryId: 'cat-content', name: 'video/image type' },
      { regex: /^(pov|first.?person|third.?person)$/i, categoryId: 'cat-content', name: 'perspective' },

      // People
      { regex: /^(solo|duo|trio|group|couple|threesome|foursome|gangbang)$/i, categoryId: 'cat-people', name: 'group size' },
      { regex: /^(male|female|trans|futa|nb)$/i, categoryId: 'cat-people', name: 'gender' },
      { regex: /^(blonde|brunette|redhead|black.?hair|white.?hair)$/i, categoryId: 'cat-people', name: 'hair color' },

      // Setting
      { regex: /^(indoor|outdoor|bedroom|bathroom|kitchen|office|public)$/i, categoryId: 'cat-setting', name: 'location' },

      // Style
      { regex: /^(anime|hentai|3d|cgi|animated|drawn|realistic|cartoon)$/i, categoryId: 'cat-style', name: 'art style' },

      // Quality
      { regex: /^(hd|4k|1080p|720p|sd|hq|lq)$/i, categoryId: 'cat-quality', name: 'resolution' },

      // Source
      { regex: /^(onlyfans|pornhub|twitter|reddit|tiktok)$/i, categoryId: 'cat-source', name: 'platform' },
    ]

    const uncategorized = this.getUncategorizedTags()
    let totalCategorized = 0
    const patternCounts: Map<string, number> = new Map()

    for (const tag of uncategorized) {
      for (const pattern of patterns) {
        if (pattern.regex.test(tag.name)) {
          this.assignTagToCategory(tag.id, pattern.categoryId)
          totalCategorized++
          patternCounts.set(pattern.name, (patternCounts.get(pattern.name) || 0) + 1)
          break
        }
      }
    }

    return {
      categorized: totalCategorized,
      patterns: patterns.map(p => ({
        pattern: p.name,
        category: p.categoryId,
        count: patternCounts.get(p.name) || 0
      })).filter(p => p.count > 0)
    }
  }

  /**
   * Get category statistics
   */
  getStats(): CategoryStats {
    const categories = this.getCategories()
    const totalTags = this.db.raw.prepare('SELECT COUNT(*) as count FROM tags').get() as { count: number }
    const uncategorized = this.db.raw.prepare('SELECT COUNT(*) as count FROM tags WHERE categoryId IS NULL').get() as { count: number }

    const categorizedCount = totalTags.count - uncategorized.count

    return {
      totalCategories: categories.length,
      totalTags: totalTags.count,
      uncategorizedTags: uncategorized.count,
      avgTagsPerCategory: categories.length > 0 ? categorizedCount / categories.length : 0
    }
  }

  /**
   * Reorder categories
   */
  reorderCategories(orderedIds: string[]): void {
    for (let i = 0; i < orderedIds.length; i++) {
      this.db.raw.prepare('UPDATE tag_categories SET sortOrder = ? WHERE id = ?').run(i, orderedIds[i])
    }
  }

  private generateId(): string {
    return `cat-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
  }
}

// Singleton
let instance: TagCategoriesService | null = null

export function getTagCategoriesService(db: DB): TagCategoriesService {
  if (!instance) {
    instance = new TagCategoriesService(db)
  }
  return instance
}
