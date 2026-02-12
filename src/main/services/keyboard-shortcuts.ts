// File: src/main/services/keyboard-shortcuts.ts
// Global keyboard shortcuts system

import { globalShortcut, BrowserWindow, app } from 'electron'
import { EventEmitter } from 'events'

export interface ShortcutAction {
  id: string
  name: string
  description: string
  category: 'playback' | 'navigation' | 'media' | 'app' | 'custom'
  defaultKey: string
  currentKey: string
  enabled: boolean
}

export interface ShortcutConfig {
  shortcuts: ShortcutAction[]
  globalEnabled: boolean
}

const DEFAULT_SHORTCUTS: ShortcutAction[] = [
  // Playback
  { id: 'play-pause', name: 'Play/Pause', description: 'Toggle video playback', category: 'playback', defaultKey: 'Space', currentKey: 'Space', enabled: true },
  { id: 'volume-up', name: 'Volume Up', description: 'Increase volume by 10%', category: 'playback', defaultKey: 'Up', currentKey: 'Up', enabled: true },
  { id: 'volume-down', name: 'Volume Down', description: 'Decrease volume by 10%', category: 'playback', defaultKey: 'Down', currentKey: 'Down', enabled: true },
  { id: 'mute', name: 'Mute', description: 'Toggle mute', category: 'playback', defaultKey: 'M', currentKey: 'M', enabled: true },
  { id: 'seek-forward', name: 'Seek Forward', description: 'Skip forward 10 seconds', category: 'playback', defaultKey: 'Right', currentKey: 'Right', enabled: true },
  { id: 'seek-back', name: 'Seek Back', description: 'Skip back 10 seconds', category: 'playback', defaultKey: 'Left', currentKey: 'Left', enabled: true },
  { id: 'seek-forward-long', name: 'Seek Forward (Long)', description: 'Skip forward 30 seconds', category: 'playback', defaultKey: 'Shift+Right', currentKey: 'Shift+Right', enabled: true },
  { id: 'seek-back-long', name: 'Seek Back (Long)', description: 'Skip back 30 seconds', category: 'playback', defaultKey: 'Shift+Left', currentKey: 'Shift+Left', enabled: true },
  { id: 'fullscreen', name: 'Fullscreen', description: 'Toggle fullscreen mode', category: 'playback', defaultKey: 'F', currentKey: 'F', enabled: true },
  { id: 'speed-up', name: 'Speed Up', description: 'Increase playback speed', category: 'playback', defaultKey: ']', currentKey: ']', enabled: true },
  { id: 'speed-down', name: 'Speed Down', description: 'Decrease playback speed', category: 'playback', defaultKey: '[', currentKey: '[', enabled: true },
  { id: 'speed-reset', name: 'Reset Speed', description: 'Reset playback speed to 1x', category: 'playback', defaultKey: '\\', currentKey: '\\', enabled: true },

  // Navigation
  { id: 'next-media', name: 'Next Media', description: 'Go to next item', category: 'navigation', defaultKey: 'N', currentKey: 'N', enabled: true },
  { id: 'prev-media', name: 'Previous Media', description: 'Go to previous item', category: 'navigation', defaultKey: 'P', currentKey: 'P', enabled: true },
  { id: 'random', name: 'Random', description: 'Jump to random item', category: 'navigation', defaultKey: 'R', currentKey: 'R', enabled: true },
  { id: 'go-home', name: 'Go Home', description: 'Navigate to home page', category: 'navigation', defaultKey: 'CommandOrControl+H', currentKey: 'CommandOrControl+H', enabled: true },
  { id: 'go-library', name: 'Go to Library', description: 'Navigate to library', category: 'navigation', defaultKey: 'CommandOrControl+L', currentKey: 'CommandOrControl+L', enabled: true },
  { id: 'go-goonwall', name: 'Go to GoonWall', description: 'Navigate to GoonWall', category: 'navigation', defaultKey: 'CommandOrControl+G', currentKey: 'CommandOrControl+G', enabled: true },
  { id: 'search-focus', name: 'Focus Search', description: 'Focus search bar', category: 'navigation', defaultKey: 'CommandOrControl+K', currentKey: 'CommandOrControl+K', enabled: true },
  { id: 'escape', name: 'Escape', description: 'Close modal/exit fullscreen', category: 'navigation', defaultKey: 'Escape', currentKey: 'Escape', enabled: true },

  // Media actions
  { id: 'favorite', name: 'Favorite', description: 'Toggle favorite on current item', category: 'media', defaultKey: 'CommandOrControl+D', currentKey: 'CommandOrControl+D', enabled: true },
  { id: 'rate-1', name: 'Rate 1 Star', description: 'Set 1-star rating', category: 'media', defaultKey: '1', currentKey: '1', enabled: true },
  { id: 'rate-2', name: 'Rate 2 Stars', description: 'Set 2-star rating', category: 'media', defaultKey: '2', currentKey: '2', enabled: true },
  { id: 'rate-3', name: 'Rate 3 Stars', description: 'Set 3-star rating', category: 'media', defaultKey: '3', currentKey: '3', enabled: true },
  { id: 'rate-4', name: 'Rate 4 Stars', description: 'Set 4-star rating', category: 'media', defaultKey: '4', currentKey: '4', enabled: true },
  { id: 'rate-5', name: 'Rate 5 Stars', description: 'Set 5-star rating', category: 'media', defaultKey: '5', currentKey: '5', enabled: true },
  { id: 'add-tag', name: 'Add Tag', description: 'Open tag dialog', category: 'media', defaultKey: 'T', currentKey: 'T', enabled: true },
  { id: 'edit-media', name: 'Edit Media', description: 'Open edit dialog', category: 'media', defaultKey: 'E', currentKey: 'E', enabled: true },
  { id: 'delete-media', name: 'Delete Media', description: 'Delete current media', category: 'media', defaultKey: 'Delete', currentKey: 'Delete', enabled: true },
  { id: 'show-info', name: 'Show Info', description: 'Show media info panel', category: 'media', defaultKey: 'I', currentKey: 'I', enabled: true },

  // App actions
  { id: 'toggle-sidebar', name: 'Toggle Sidebar', description: 'Show/hide sidebar', category: 'app', defaultKey: 'CommandOrControl+B', currentKey: 'CommandOrControl+B', enabled: true },
  { id: 'toggle-theater', name: 'Theater Mode', description: 'Toggle theater mode', category: 'app', defaultKey: 'CommandOrControl+T', currentKey: 'CommandOrControl+T', enabled: true },
  { id: 'settings', name: 'Settings', description: 'Open settings', category: 'app', defaultKey: 'CommandOrControl+,', currentKey: 'CommandOrControl+,', enabled: true },
  { id: 'refresh', name: 'Refresh', description: 'Refresh current view', category: 'app', defaultKey: 'CommandOrControl+R', currentKey: 'CommandOrControl+R', enabled: true },
  { id: 'dev-tools', name: 'Dev Tools', description: 'Toggle developer tools', category: 'app', defaultKey: 'CommandOrControl+Shift+I', currentKey: 'CommandOrControl+Shift+I', enabled: true },
  { id: 'quit', name: 'Quit', description: 'Quit application', category: 'app', defaultKey: 'CommandOrControl+Q', currentKey: 'CommandOrControl+Q', enabled: true },
]

export class KeyboardShortcutsService extends EventEmitter {
  private config: ShortcutConfig
  private registeredShortcuts: Set<string> = new Set()

  constructor() {
    super()
    this.config = {
      shortcuts: [...DEFAULT_SHORTCUTS],
      globalEnabled: false
    }
  }

  /**
   * Get all shortcuts
   */
  getShortcuts(): ShortcutAction[] {
    return this.config.shortcuts
  }

  /**
   * Get shortcuts by category
   */
  getShortcutsByCategory(category: ShortcutAction['category']): ShortcutAction[] {
    return this.config.shortcuts.filter(s => s.category === category)
  }

  /**
   * Get a specific shortcut
   */
  getShortcut(id: string): ShortcutAction | null {
    return this.config.shortcuts.find(s => s.id === id) || null
  }

  /**
   * Update a shortcut's key binding
   */
  updateShortcut(id: string, newKey: string): ShortcutAction | null {
    const shortcut = this.config.shortcuts.find(s => s.id === id)
    if (!shortcut) return null

    // Check for conflicts
    const conflict = this.config.shortcuts.find(s =>
      s.id !== id && s.currentKey === newKey && s.enabled
    )
    if (conflict) {
      throw new Error(`Key "${newKey}" is already assigned to "${conflict.name}"`)
    }

    // Unregister old global shortcut if enabled
    if (this.config.globalEnabled && this.registeredShortcuts.has(shortcut.currentKey)) {
      globalShortcut.unregister(this.electronKey(shortcut.currentKey))
      this.registeredShortcuts.delete(shortcut.currentKey)
    }

    shortcut.currentKey = newKey

    // Register new global shortcut if enabled
    if (this.config.globalEnabled && shortcut.enabled) {
      this.registerGlobalShortcut(shortcut)
    }

    this.emit('shortcutChanged', shortcut)
    return shortcut
  }

  /**
   * Toggle a shortcut on/off
   */
  toggleShortcut(id: string, enabled: boolean): ShortcutAction | null {
    const shortcut = this.config.shortcuts.find(s => s.id === id)
    if (!shortcut) return null

    shortcut.enabled = enabled

    if (this.config.globalEnabled) {
      if (enabled) {
        this.registerGlobalShortcut(shortcut)
      } else {
        this.unregisterGlobalShortcut(shortcut)
      }
    }

    return shortcut
  }

  /**
   * Reset a shortcut to default
   */
  resetShortcut(id: string): ShortcutAction | null {
    const shortcut = this.config.shortcuts.find(s => s.id === id)
    if (!shortcut) return null

    this.unregisterGlobalShortcut(shortcut)
    shortcut.currentKey = shortcut.defaultKey
    shortcut.enabled = true

    if (this.config.globalEnabled) {
      this.registerGlobalShortcut(shortcut)
    }

    return shortcut
  }

  /**
   * Reset all shortcuts to defaults
   */
  resetAll(): void {
    this.unregisterAll()
    this.config.shortcuts = [...DEFAULT_SHORTCUTS]

    if (this.config.globalEnabled) {
      this.registerAllGlobal()
    }

    this.emit('shortcutsReset')
  }

  /**
   * Enable/disable global shortcuts (work even when app not focused)
   */
  setGlobalEnabled(enabled: boolean): void {
    if (enabled === this.config.globalEnabled) return

    this.config.globalEnabled = enabled

    if (enabled) {
      this.registerAllGlobal()
    } else {
      this.unregisterAll()
    }

    this.emit('globalToggled', enabled)
  }

  /**
   * Check if global shortcuts are enabled
   */
  isGlobalEnabled(): boolean {
    return this.config.globalEnabled
  }

  /**
   * Get a keyboard map for the renderer
   */
  getKeyboardMap(): Record<string, string> {
    const map: Record<string, string> = {}
    for (const shortcut of this.config.shortcuts) {
      if (shortcut.enabled) {
        map[shortcut.currentKey] = shortcut.id
      }
    }
    return map
  }

  /**
   * Find which action a key triggers
   */
  getActionForKey(key: string): string | null {
    const shortcut = this.config.shortcuts.find(
      s => s.enabled && s.currentKey === key
    )
    return shortcut?.id || null
  }

  /**
   * Convert to Electron accelerator format
   */
  private electronKey(key: string): string {
    return key
      .replace('CommandOrControl', process.platform === 'darwin' ? 'Command' : 'Control')
  }

  private registerGlobalShortcut(shortcut: ShortcutAction): void {
    if (!shortcut.enabled || this.registeredShortcuts.has(shortcut.currentKey)) {
      return
    }

    const electronKey = this.electronKey(shortcut.currentKey)

    // Skip certain keys that shouldn't be global (single letters, etc.)
    if (!shortcut.currentKey.includes('CommandOrControl') &&
        !shortcut.currentKey.includes('Alt') &&
        shortcut.currentKey.length <= 1) {
      return
    }

    try {
      const registered = globalShortcut.register(electronKey, () => {
        this.emit('shortcutTriggered', shortcut.id)
        this.sendToRenderer(shortcut.id)
      })

      if (registered) {
        this.registeredShortcuts.add(shortcut.currentKey)
      }
    } catch (e) {
      console.warn(`[Shortcuts] Failed to register global shortcut: ${shortcut.currentKey}`)
    }
  }

  private unregisterGlobalShortcut(shortcut: ShortcutAction): void {
    if (!this.registeredShortcuts.has(shortcut.currentKey)) return

    try {
      globalShortcut.unregister(this.electronKey(shortcut.currentKey))
      this.registeredShortcuts.delete(shortcut.currentKey)
    } catch {
      // Ignore unregister errors
    }
  }

  private registerAllGlobal(): void {
    for (const shortcut of this.config.shortcuts) {
      if (shortcut.enabled) {
        this.registerGlobalShortcut(shortcut)
      }
    }
  }

  private unregisterAll(): void {
    globalShortcut.unregisterAll()
    this.registeredShortcuts.clear()
  }

  private sendToRenderer(actionId: string): void {
    const windows = BrowserWindow.getAllWindows()
    for (const win of windows) {
      win.webContents.send('shortcut:triggered', actionId)
    }
  }

  /**
   * Export shortcuts config
   */
  exportConfig(): ShortcutConfig {
    return { ...this.config }
  }

  /**
   * Import shortcuts config
   */
  importConfig(config: Partial<ShortcutConfig>): void {
    if (config.shortcuts) {
      this.unregisterAll()
      this.config.shortcuts = config.shortcuts
    }
    if (typeof config.globalEnabled === 'boolean') {
      this.config.globalEnabled = config.globalEnabled
    }

    if (this.config.globalEnabled) {
      this.registerAllGlobal()
    }

    this.emit('configImported')
  }

  /**
   * Cleanup on app quit
   */
  cleanup(): void {
    this.unregisterAll()
  }
}

// Singleton
let instance: KeyboardShortcutsService | null = null

export function getKeyboardShortcutsService(): KeyboardShortcutsService {
  if (!instance) {
    instance = new KeyboardShortcutsService()

    // Cleanup on app quit
    app.on('will-quit', () => {
      instance?.cleanup()
    })
  }
  return instance
}
