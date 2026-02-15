// File: src/main/services/quick-actions.ts
// Quick actions system for context menus and shortcuts

import type { DB } from '../db'
import { shell } from 'electron'
import fs from 'fs'

export type ActionTarget = 'single' | 'multiple' | 'both'
export type ActionType = 'media' | 'tag' | 'playlist' | 'performer' | 'collection'

export interface QuickAction {
  id: string
  name: string
  icon?: string
  shortcut?: string
  target: ActionTarget
  types: ActionType[]
  category: 'organize' | 'edit' | 'share' | 'view' | 'file' | 'custom'
  enabled: boolean
  builtin: boolean
  handler?: string // For custom actions, JS to execute
}

export interface ActionContext {
  mediaIds?: string[]
  tagIds?: string[]
  playlistIds?: string[]
  performerIds?: string[]
  collectionIds?: string[]
}

export interface ActionResult {
  success: boolean
  action: string
  affected: number
  error?: string
}

const BUILTIN_ACTIONS: QuickAction[] = [
  // Organize
  { id: 'add-to-playlist', name: 'Add to Playlist...', icon: 'playlist-add', target: 'both', types: ['media'], category: 'organize', enabled: true, builtin: true },
  { id: 'add-tags', name: 'Add Tags...', icon: 'tag', target: 'both', types: ['media'], category: 'organize', enabled: true, builtin: true },
  { id: 'set-rating', name: 'Set Rating...', icon: 'star', target: 'both', types: ['media'], category: 'organize', enabled: true, builtin: true },
  { id: 'add-to-collection', name: 'Add to Collection...', icon: 'folder', target: 'both', types: ['media'], category: 'organize', enabled: true, builtin: true },
  { id: 'link-performer', name: 'Link Performer...', icon: 'person', target: 'both', types: ['media'], category: 'organize', enabled: true, builtin: true },

  // Edit
  { id: 'rename', name: 'Rename', icon: 'edit', shortcut: 'F2', target: 'single', types: ['media', 'playlist', 'collection'], category: 'edit', enabled: true, builtin: true },
  { id: 'edit-details', name: 'Edit Details', icon: 'info', shortcut: 'E', target: 'single', types: ['media', 'performer'], category: 'edit', enabled: true, builtin: true },
  { id: 'remove-tags', name: 'Remove Tags...', icon: 'tag-remove', target: 'both', types: ['media'], category: 'edit', enabled: true, builtin: true },
  { id: 'clear-rating', name: 'Clear Rating', icon: 'star-outline', target: 'both', types: ['media'], category: 'edit', enabled: true, builtin: true },
  { id: 'regenerate-thumb', name: 'Regenerate Thumbnail', icon: 'image', target: 'both', types: ['media'], category: 'edit', enabled: true, builtin: true },

  // View
  { id: 'view-info', name: 'View Info', icon: 'info-circle', shortcut: 'I', target: 'single', types: ['media'], category: 'view', enabled: true, builtin: true },
  { id: 'find-similar', name: 'Find Similar', icon: 'search', target: 'single', types: ['media'], category: 'view', enabled: true, builtin: true },
  { id: 'compare', name: 'Compare Selected', icon: 'columns', target: 'multiple', types: ['media'], category: 'view', enabled: true, builtin: true },
  { id: 'slideshow', name: 'Start Slideshow', icon: 'play', target: 'both', types: ['media'], category: 'view', enabled: true, builtin: true },

  // File
  { id: 'show-in-folder', name: 'Show in Folder', icon: 'folder-open', target: 'single', types: ['media'], category: 'file', enabled: true, builtin: true },
  { id: 'copy-path', name: 'Copy Path', icon: 'clipboard', target: 'single', types: ['media'], category: 'file', enabled: true, builtin: true },
  { id: 'open-external', name: 'Open with Default App', icon: 'external-link', target: 'single', types: ['media'], category: 'file', enabled: true, builtin: true },
  { id: 'move-to', name: 'Move to...', icon: 'move', target: 'both', types: ['media'], category: 'file', enabled: true, builtin: true },
  { id: 'copy-to', name: 'Copy to...', icon: 'copy', target: 'both', types: ['media'], category: 'file', enabled: true, builtin: true },
  { id: 'delete', name: 'Delete', icon: 'trash', shortcut: 'Delete', target: 'both', types: ['media', 'playlist', 'collection', 'tag'], category: 'file', enabled: true, builtin: true },

  // Share
  { id: 'cast-dlna', name: 'Cast to TV', icon: 'tv', target: 'single', types: ['media'], category: 'share', enabled: true, builtin: true },
  { id: 'export', name: 'Export...', icon: 'download', target: 'both', types: ['media', 'playlist'], category: 'share', enabled: true, builtin: true },
]

export class QuickActionsService {
  private actions: Map<string, QuickAction> = new Map()
  private customActions: QuickAction[] = []

  constructor(private db: DB) {
    // Load builtin actions
    for (const action of BUILTIN_ACTIONS) {
      this.actions.set(action.id, action)
    }
  }

  /**
   * Get all available actions
   */
  getActions(): QuickAction[] {
    return Array.from(this.actions.values())
  }

  /**
   * Get actions for a specific context
   */
  getActionsForContext(context: {
    type: ActionType
    count: number
  }): QuickAction[] {
    const target: ActionTarget = context.count === 1 ? 'single' : 'multiple'

    return Array.from(this.actions.values())
      .filter(action => {
        if (!action.enabled) return false
        if (!action.types.includes(context.type)) return false
        if (action.target !== 'both' && action.target !== target) return false
        return true
      })
      .sort((a, b) => {
        // Sort by category, then by name
        const catOrder = ['organize', 'edit', 'view', 'file', 'share', 'custom']
        const catA = catOrder.indexOf(a.category)
        const catB = catOrder.indexOf(b.category)
        if (catA !== catB) return catA - catB
        return a.name.localeCompare(b.name)
      })
  }

  /**
   * Get actions by category
   */
  getActionsByCategory(category: QuickAction['category']): QuickAction[] {
    return Array.from(this.actions.values())
      .filter(a => a.category === category && a.enabled)
  }

  /**
   * Execute an action
   */
  async executeAction(actionId: string, context: ActionContext): Promise<ActionResult> {
    const action = this.actions.get(actionId)
    if (!action) {
      return { success: false, action: actionId, affected: 0, error: 'Action not found' }
    }

    if (!action.enabled) {
      return { success: false, action: actionId, affected: 0, error: 'Action is disabled' }
    }

    try {
      switch (actionId) {
        case 'show-in-folder':
          return this.showInFolder(context)

        case 'copy-path':
          return this.copyPath(context)

        case 'open-external':
          return this.openExternal(context)

        case 'delete':
          return this.deleteMedia(context)

        case 'clear-rating':
          return this.clearRating(context)

        case 'regenerate-thumb':
          return this.regenerateThumb(context)

        default:
          // For UI-handled actions, just return success
          return {
            success: true,
            action: actionId,
            affected: context.mediaIds?.length || 0
          }
      }
    } catch (error: any) {
      return {
        success: false,
        action: actionId,
        affected: 0,
        error: error?.message || 'Unknown error'
      }
    }
  }

  private async showInFolder(context: ActionContext): Promise<ActionResult> {
    if (!context.mediaIds?.[0]) {
      return { success: false, action: 'show-in-folder', affected: 0, error: 'No media selected' }
    }

    const media = this.db.raw.prepare('SELECT path FROM media WHERE id = ?')
      .get(context.mediaIds[0]) as { path: string } | undefined

    if (!media) {
      return { success: false, action: 'show-in-folder', affected: 0, error: 'Media not found' }
    }

    shell.showItemInFolder(media.path)
    return { success: true, action: 'show-in-folder', affected: 1 }
  }

  private async copyPath(context: ActionContext): Promise<ActionResult> {
    if (!context.mediaIds?.[0]) {
      return { success: false, action: 'copy-path', affected: 0, error: 'No media selected' }
    }

    const media = this.db.raw.prepare('SELECT path FROM media WHERE id = ?')
      .get(context.mediaIds[0]) as { path: string } | undefined

    if (!media) {
      return { success: false, action: 'copy-path', affected: 0, error: 'Media not found' }
    }

    const { clipboard } = require('electron')
    clipboard.writeText(media.path)
    return { success: true, action: 'copy-path', affected: 1 }
  }

  private async openExternal(context: ActionContext): Promise<ActionResult> {
    if (!context.mediaIds?.[0]) {
      return { success: false, action: 'open-external', affected: 0, error: 'No media selected' }
    }

    const media = this.db.raw.prepare('SELECT path FROM media WHERE id = ?')
      .get(context.mediaIds[0]) as { path: string } | undefined

    if (!media) {
      return { success: false, action: 'open-external', affected: 0, error: 'Media not found' }
    }

    await shell.openPath(media.path)
    return { success: true, action: 'open-external', affected: 1 }
  }

  private async deleteMedia(context: ActionContext): Promise<ActionResult> {
    const ids = context.mediaIds || []
    if (ids.length === 0) {
      return { success: false, action: 'delete', affected: 0, error: 'No media selected' }
    }

    let deleted = 0
    for (const id of ids) {
      try {
        // Get path first
        const media = this.db.raw.prepare('SELECT path, thumbPath FROM media WHERE id = ?')
          .get(id) as { path: string; thumbPath?: string } | undefined

        if (media) {
          // Delete from DB
          this.db.raw.prepare('DELETE FROM media WHERE id = ?').run(id)
          this.db.raw.prepare('DELETE FROM media_tags WHERE mediaId = ?').run(id)
          this.db.raw.prepare('DELETE FROM media_stats WHERE mediaId = ?').run(id)
          this.db.raw.prepare('DELETE FROM playlist_media WHERE mediaId = ?').run(id)

          // Delete thumb if exists
          if (media.thumbPath && fs.existsSync(media.thumbPath)) {
            fs.unlinkSync(media.thumbPath)
          }

          deleted++
        }
      } catch (e) {
        console.error(`[QuickActions] Failed to delete media ${id}:`, e)
      }
    }

    return { success: deleted > 0, action: 'delete', affected: deleted }
  }

  private async clearRating(context: ActionContext): Promise<ActionResult> {
    const ids = context.mediaIds || []
    if (ids.length === 0) {
      return { success: false, action: 'clear-rating', affected: 0, error: 'No media selected' }
    }

    const placeholders = ids.map(() => '?').join(',')
    const result = this.db.raw.prepare(`
      UPDATE media_stats SET rating = 0 WHERE mediaId IN (${placeholders})
    `).run(...ids)

    return {
      success: true,
      action: 'clear-rating',
      affected: result.changes
    }
  }

  private async regenerateThumb(context: ActionContext): Promise<ActionResult> {
    const ids = context.mediaIds || []
    if (ids.length === 0) {
      return { success: false, action: 'regenerate-thumb', affected: 0, error: 'No media selected' }
    }

    // Clear existing thumbnails
    const placeholders = ids.map(() => '?').join(',')
    this.db.raw.prepare(`
      UPDATE media SET thumbPath = NULL WHERE id IN (${placeholders})
    `).run(...ids)

    return {
      success: true,
      action: 'regenerate-thumb',
      affected: ids.length
    }
  }

  /**
   * Toggle action enabled state
   */
  toggleAction(actionId: string, enabled: boolean): QuickAction | null {
    const action = this.actions.get(actionId)
    if (!action) return null

    action.enabled = enabled
    return action
  }

  /**
   * Add a custom action
   */
  addCustomAction(action: Omit<QuickAction, 'id' | 'builtin'>): QuickAction {
    const id = `custom-${Date.now()}`
    const newAction: QuickAction = {
      ...action,
      id,
      builtin: false
    }

    this.actions.set(id, newAction)
    this.customActions.push(newAction)
    return newAction
  }

  /**
   * Remove a custom action
   */
  removeCustomAction(actionId: string): boolean {
    const action = this.actions.get(actionId)
    if (!action || action.builtin) return false

    this.actions.delete(actionId)
    this.customActions = this.customActions.filter(a => a.id !== actionId)
    return true
  }

  /**
   * Get keyboard shortcut mapping
   */
  getShortcutMap(): Record<string, string> {
    const map: Record<string, string> = {}
    for (const action of this.actions.values()) {
      if (action.shortcut && action.enabled) {
        map[action.shortcut] = action.id
      }
    }
    return map
  }
}

// Singleton
let instance: QuickActionsService | null = null

export function getQuickActionsService(db: DB): QuickActionsService {
  if (!instance) {
    instance = new QuickActionsService(db)
  }
  return instance
}
