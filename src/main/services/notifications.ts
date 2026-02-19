// File: src/main/services/notifications.ts
// System notifications service

import { Notification, app, BrowserWindow } from 'electron'
import path from 'path'
import { EventEmitter } from 'events'

export type NotificationType = 'info' | 'success' | 'warning' | 'error' | 'achievement'

export interface NotificationConfig {
  title: string
  body: string
  type?: NotificationType
  icon?: string
  silent?: boolean
  timeout?: number
  action?: {
    label: string
    callback: string  // IPC event to trigger
    data?: any
  }
  persistent?: boolean
}

export interface NotificationSettings {
  enabled: boolean
  soundEnabled: boolean
  importComplete: boolean
  scanComplete: boolean
  exportComplete: boolean
  backupComplete: boolean
  downloadComplete: boolean
  achievementUnlocked: boolean
  errorAlerts: boolean
  dailyReminder: boolean
  reminderTime?: string
}

const DEFAULT_SETTINGS: NotificationSettings = {
  enabled: true,
  soundEnabled: true,
  importComplete: true,
  scanComplete: true,
  exportComplete: true,
  backupComplete: true,
  downloadComplete: true,
  achievementUnlocked: true,
  errorAlerts: true,
  dailyReminder: false
}

export class NotificationsService extends EventEmitter {
  private settings: NotificationSettings = { ...DEFAULT_SETTINGS }
  private notificationHistory: Array<{
    id: string
    config: NotificationConfig
    timestamp: number
    read: boolean
  }> = []
  private iconPath: string | null = null

  constructor() {
    super()
    this.initIcon()
  }

  private initIcon(): void {
    try {
      // Try to get app icon
      const iconName = process.platform === 'win32' ? 'icon.ico' : 'icon.png'
      const possiblePaths = [
        path.join(__dirname, '..', '..', 'resources', iconName),
        path.join(app.getAppPath(), 'resources', iconName),
        path.join(__dirname, iconName)
      ]

      for (const p of possiblePaths) {
        try {
          if (require('fs').existsSync(p)) {
            this.iconPath = p
            break
          }
        } catch (e) {
          // Icon check failed - continue to next path
        }
      }
    } catch (e) {
      console.warn('[Notifications] Icon path initialization failed (non-critical):', (e as Error).message)
    }
  }

  /**
   * Show a notification
   */
  show(config: NotificationConfig): string {
    if (!this.settings.enabled) {
      return ''
    }

    const id = this.generateId()

    // Store in history
    this.notificationHistory.unshift({
      id,
      config,
      timestamp: Date.now(),
      read: false
    })

    // Trim history
    if (this.notificationHistory.length > 100) {
      this.notificationHistory = this.notificationHistory.slice(0, 100)
    }

    // Show system notification
    if (Notification.isSupported()) {
      const notification = new Notification({
        title: config.title,
        body: config.body,
        silent: config.silent ?? !this.settings.soundEnabled,
        icon: config.icon || this.iconPath || undefined,
        timeoutType: config.persistent ? 'never' : 'default'
      })

      notification.on('click', () => {
        this.emit('notificationClicked', { id, config })

        // Focus app window
        const windows = BrowserWindow.getAllWindows()
        if (windows[0]) {
          if (windows[0].isMinimized()) windows[0].restore()
          windows[0].focus()
        }

        // Trigger action if specified
        if (config.action) {
          this.emit('actionTriggered', {
            id,
            action: config.action.callback,
            data: config.action.data
          })
        }
      })

      notification.show()
    }

    this.emit('notificationShown', { id, config })
    return id
  }

  /**
   * Show info notification
   */
  info(title: string, body: string): string {
    return this.show({ title, body, type: 'info' })
  }

  /**
   * Show success notification
   */
  success(title: string, body: string): string {
    return this.show({ title, body, type: 'success' })
  }

  /**
   * Show warning notification
   */
  warning(title: string, body: string): string {
    return this.show({ title, body, type: 'warning' })
  }

  /**
   * Show error notification
   */
  error(title: string, body: string): string {
    if (!this.settings.errorAlerts) return ''
    return this.show({ title, body, type: 'error' })
  }

  /**
   * Show achievement notification
   */
  achievement(achievementName: string, description: string): string {
    if (!this.settings.achievementUnlocked) return ''
    return this.show({
      title: `Achievement Unlocked! 🏆`,
      body: `${achievementName}\n${description}`,
      type: 'achievement',
      silent: false
    })
  }

  /**
   * Notify import complete
   */
  importComplete(imported: number, failed: number): string {
    if (!this.settings.importComplete) return ''
    const body = failed > 0
      ? `Imported ${imported} files, ${failed} failed`
      : `Successfully imported ${imported} files`
    return this.show({
      title: 'Import Complete',
      body,
      type: failed > 0 ? 'warning' : 'success'
    })
  }

  /**
   * Notify scan complete
   */
  scanComplete(added: number, total: number): string {
    if (!this.settings.scanComplete) return ''
    return this.show({
      title: 'Scan Complete',
      body: `Found ${total} files, added ${added} new items`,
      type: 'success'
    })
  }

  /**
   * Notify export complete
   */
  exportComplete(exported: number, destination: string): string {
    if (!this.settings.exportComplete) return ''
    return this.show({
      title: 'Export Complete',
      body: `Exported ${exported} files to ${path.basename(destination)}`,
      type: 'success',
      action: {
        label: 'Open Folder',
        callback: 'openExportFolder',
        data: { path: destination }
      }
    })
  }

  /**
   * Notify backup complete
   */
  backupComplete(filename: string): string {
    if (!this.settings.backupComplete) return ''
    return this.show({
      title: 'Backup Complete',
      body: `Created backup: ${filename}`,
      type: 'success'
    })
  }

  /**
   * Notify download complete
   */
  downloadComplete(title: string, source: 'desktop' | 'mobile' = 'desktop'): string {
    if (!this.settings.downloadComplete) return ''
    const sourceLabel = source === 'mobile' ? ' (from mobile)' : ''
    return this.show({
      title: 'Download Complete',
      body: `${title}${sourceLabel}`,
      type: 'success',
      action: {
        label: 'View Downloads',
        callback: 'openUrlDownloader',
        data: {}
      }
    })
  }

  /**
   * Notify download failed
   */
  downloadFailed(title: string, error: string): string {
    if (!this.settings.errorAlerts) return ''
    return this.show({
      title: 'Download Failed',
      body: `${title}: ${error}`,
      type: 'error'
    })
  }

  /**
   * Get notification history
   */
  getHistory(limit = 50): typeof this.notificationHistory {
    return this.notificationHistory.slice(0, limit)
  }

  /**
   * Get unread count
   */
  getUnreadCount(): number {
    return this.notificationHistory.filter(n => !n.read).length
  }

  /**
   * Mark notification as read
   */
  markAsRead(id: string): void {
    const notification = this.notificationHistory.find(n => n.id === id)
    if (notification) {
      notification.read = true
    }
  }

  /**
   * Mark all as read
   */
  markAllAsRead(): void {
    for (const n of this.notificationHistory) {
      n.read = true
    }
  }

  /**
   * Clear history
   */
  clearHistory(): void {
    this.notificationHistory = []
  }

  /**
   * Get settings
   */
  getSettings(): NotificationSettings {
    return { ...this.settings }
  }

  /**
   * Update settings
   */
  updateSettings(updates: Partial<NotificationSettings>): NotificationSettings {
    this.settings = { ...this.settings, ...updates }
    return this.settings
  }

  /**
   * Reset settings
   */
  resetSettings(): void {
    this.settings = { ...DEFAULT_SETTINGS }
  }

  /**
   * Check if notifications are supported
   */
  isSupported(): boolean {
    return Notification.isSupported()
  }

  /**
   * Request permission (macOS)
   */
  async requestPermission(): Promise<boolean> {
    // On macOS, we need to check/request permission
    if (process.platform === 'darwin') {
      // Electron handles this automatically when showing first notification
      return true
    }
    return Notification.isSupported()
  }

  private generateId(): string {
    return `notif-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
  }
}

// Singleton
let instance: NotificationsService | null = null

export function getNotificationsService(): NotificationsService {
  if (!instance) {
    instance = new NotificationsService()
  }
  return instance
}
