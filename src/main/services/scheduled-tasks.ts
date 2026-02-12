// File: src/main/services/scheduled-tasks.ts
// Scheduled tasks system - auto-scan, auto-backup, cleanup on schedule

import type { DB } from '../db'
import { EventEmitter } from 'events'

export type TaskType = 'scan' | 'backup' | 'cleanup' | 'refresh-smart-playlists' | 'generate-thumbnails' | 'custom'

export interface ScheduledTask {
  id: string
  name: string
  type: TaskType
  enabled: boolean
  schedule: {
    type: 'interval' | 'daily' | 'weekly' | 'startup'
    intervalMinutes?: number    // For interval type
    timeOfDay?: string          // HH:MM for daily/weekly
    dayOfWeek?: number          // 0-6 for weekly (0 = Sunday)
  }
  lastRun: number | null
  nextRun: number | null
  config: Record<string, any>   // Task-specific config
  createdAt: number
}

export interface TaskRunResult {
  taskId: string
  success: boolean
  startedAt: number
  completedAt: number
  result?: any
  error?: string
}

export class ScheduledTasksService extends EventEmitter {
  private tasks: Map<string, ScheduledTask> = new Map()
  private timers: Map<string, NodeJS.Timeout> = new Map()
  private running: Set<string> = new Set()
  private history: TaskRunResult[] = []

  constructor(private db: DB) {
    super()
    this.loadTasks()
  }

  private loadTasks(): void {
    // Load from settings or use defaults
    const defaultTasks: ScheduledTask[] = [
      {
        id: 'auto-scan',
        name: 'Auto Scan Media Directories',
        type: 'scan',
        enabled: false,
        schedule: { type: 'interval', intervalMinutes: 60 },
        lastRun: null,
        nextRun: null,
        config: {},
        createdAt: Date.now()
      },
      {
        id: 'auto-backup',
        name: 'Auto Backup Database',
        type: 'backup',
        enabled: false,
        schedule: { type: 'daily', timeOfDay: '03:00' },
        lastRun: null,
        nextRun: null,
        config: { keepCount: 7 },
        createdAt: Date.now()
      },
      {
        id: 'cleanup-cache',
        name: 'Cleanup Old Cache Files',
        type: 'cleanup',
        enabled: false,
        schedule: { type: 'weekly', timeOfDay: '04:00', dayOfWeek: 0 },
        lastRun: null,
        nextRun: null,
        config: { maxAgeDays: 30 },
        createdAt: Date.now()
      },
      {
        id: 'refresh-playlists',
        name: 'Refresh Smart Playlists',
        type: 'refresh-smart-playlists',
        enabled: true,
        schedule: { type: 'startup' },
        lastRun: null,
        nextRun: null,
        config: {},
        createdAt: Date.now()
      }
    ]

    for (const task of defaultTasks) {
      this.tasks.set(task.id, task)
    }
  }

  /**
   * Start the scheduler
   */
  start(): void {
    console.log('[Scheduler] Starting scheduled tasks service')

    for (const [id, task] of this.tasks) {
      if (task.enabled) {
        this.scheduleTask(id)

        // Run startup tasks immediately
        if (task.schedule.type === 'startup') {
          this.runTask(id)
        }
      }
    }
  }

  /**
   * Stop the scheduler
   */
  stop(): void {
    for (const timer of this.timers.values()) {
      clearTimeout(timer)
    }
    this.timers.clear()
    console.log('[Scheduler] Stopped all scheduled tasks')
  }

  /**
   * Schedule a task based on its configuration
   */
  private scheduleTask(taskId: string): void {
    const task = this.tasks.get(taskId)
    if (!task || !task.enabled) return

    // Clear existing timer
    const existingTimer = this.timers.get(taskId)
    if (existingTimer) {
      clearTimeout(existingTimer)
    }

    let delayMs: number

    switch (task.schedule.type) {
      case 'interval':
        delayMs = (task.schedule.intervalMinutes || 60) * 60 * 1000
        break

      case 'daily':
        delayMs = this.getDelayUntilTime(task.schedule.timeOfDay || '00:00')
        break

      case 'weekly':
        delayMs = this.getDelayUntilWeekly(
          task.schedule.dayOfWeek || 0,
          task.schedule.timeOfDay || '00:00'
        )
        break

      case 'startup':
        // Don't schedule recurring - only runs on startup
        return

      default:
        return
    }

    task.nextRun = Date.now() + delayMs

    const timer = setTimeout(() => {
      this.runTask(taskId)
      // Reschedule for next run
      this.scheduleTask(taskId)
    }, delayMs)

    this.timers.set(taskId, timer)
    console.log(`[Scheduler] Task "${task.name}" scheduled for ${new Date(task.nextRun).toLocaleString()}`)
  }

  private getDelayUntilTime(timeOfDay: string): number {
    const [hours, minutes] = timeOfDay.split(':').map(Number)
    const now = new Date()
    const target = new Date()
    target.setHours(hours, minutes, 0, 0)

    if (target <= now) {
      target.setDate(target.getDate() + 1)
    }

    return target.getTime() - now.getTime()
  }

  private getDelayUntilWeekly(dayOfWeek: number, timeOfDay: string): number {
    const [hours, minutes] = timeOfDay.split(':').map(Number)
    const now = new Date()
    const target = new Date()
    target.setHours(hours, minutes, 0, 0)

    const currentDay = now.getDay()
    let daysUntil = dayOfWeek - currentDay

    if (daysUntil < 0 || (daysUntil === 0 && target <= now)) {
      daysUntil += 7
    }

    target.setDate(target.getDate() + daysUntil)
    return target.getTime() - now.getTime()
  }

  /**
   * Run a task immediately
   */
  async runTask(taskId: string): Promise<TaskRunResult> {
    const task = this.tasks.get(taskId)
    if (!task) {
      return {
        taskId,
        success: false,
        startedAt: Date.now(),
        completedAt: Date.now(),
        error: 'Task not found'
      }
    }

    if (this.running.has(taskId)) {
      return {
        taskId,
        success: false,
        startedAt: Date.now(),
        completedAt: Date.now(),
        error: 'Task already running'
      }
    }

    this.running.add(taskId)
    const startedAt = Date.now()
    this.emit('taskStarted', { taskId, task })

    console.log(`[Scheduler] Running task: ${task.name}`)

    let result: TaskRunResult

    try {
      const taskResult = await this.executeTask(task)
      task.lastRun = Date.now()

      result = {
        taskId,
        success: true,
        startedAt,
        completedAt: Date.now(),
        result: taskResult
      }
    } catch (e: any) {
      result = {
        taskId,
        success: false,
        startedAt,
        completedAt: Date.now(),
        error: e.message
      }
      console.error(`[Scheduler] Task "${task.name}" failed:`, e)
    }

    this.running.delete(taskId)
    this.history.unshift(result)
    if (this.history.length > 100) {
      this.history = this.history.slice(0, 100)
    }

    this.emit('taskCompleted', result)
    return result
  }

  private async executeTask(task: ScheduledTask): Promise<any> {
    switch (task.type) {
      case 'scan':
        return this.executeScanTask(task)

      case 'backup':
        return this.executeBackupTask(task)

      case 'cleanup':
        return this.executeCleanupTask(task)

      case 'refresh-smart-playlists':
        return this.executeRefreshPlaylistsTask(task)

      case 'generate-thumbnails':
        return this.executeGenerateThumbnailsTask(task)

      default:
        throw new Error(`Unknown task type: ${task.type}`)
    }
  }

  private async executeScanTask(_task: ScheduledTask): Promise<any> {
    // This would trigger the scanner - simplified for now
    console.log('[Scheduler] Scan task executed')
    return { scanned: true }
  }

  private async executeBackupTask(task: ScheduledTask): Promise<any> {
    const { getBackupRestoreService } = require('./backup-restore')
    const service = getBackupRestoreService(this.db)

    const backup = await service.createBackup()

    // Cleanup old backups
    const keepCount = task.config.keepCount || 7
    service.cleanupOldBackups(keepCount)

    return { backup: backup.filename }
  }

  private async executeCleanupTask(task: ScheduledTask): Promise<any> {
    const fs = require('fs')
    const path = require('path')
    const { app } = require('electron')

    const cacheDir = path.join(app.getPath('userData'), 'Cache')
    const maxAgeDays = task.config.maxAgeDays || 30
    const maxAgeMs = maxAgeDays * 24 * 60 * 60 * 1000
    const now = Date.now()
    let deleted = 0

    if (fs.existsSync(cacheDir)) {
      const files = fs.readdirSync(cacheDir)
      for (const file of files) {
        const filePath = path.join(cacheDir, file)
        try {
          const stats = fs.statSync(filePath)
          if (now - stats.mtimeMs > maxAgeMs) {
            fs.unlinkSync(filePath)
            deleted++
          }
        } catch {
          // Ignore individual file errors
        }
      }
    }

    return { deletedFiles: deleted }
  }

  private async executeRefreshPlaylistsTask(_task: ScheduledTask): Promise<any> {
    const { getSmartPlaylistService } = require('./smart-playlists')
    const service = getSmartPlaylistService(this.db)
    return service.refreshStale()
  }

  private async executeGenerateThumbnailsTask(_task: ScheduledTask): Promise<any> {
    // Get media without thumbnails
    const rows = this.db.raw.prepare(`
      SELECT id FROM media WHERE thumbPath IS NULL OR thumbPath = '' LIMIT 50
    `).all() as { id: string }[]

    return { queued: rows.length }
  }

  /**
   * Get all tasks
   */
  getTasks(): ScheduledTask[] {
    return Array.from(this.tasks.values())
  }

  /**
   * Get task by ID
   */
  getTask(taskId: string): ScheduledTask | null {
    return this.tasks.get(taskId) || null
  }

  /**
   * Update task configuration
   */
  updateTask(taskId: string, updates: Partial<ScheduledTask>): ScheduledTask | null {
    const task = this.tasks.get(taskId)
    if (!task) return null

    Object.assign(task, updates, { id: taskId })

    // Reschedule if enabled status or schedule changed
    if ('enabled' in updates || 'schedule' in updates) {
      const timer = this.timers.get(taskId)
      if (timer) {
        clearTimeout(timer)
        this.timers.delete(taskId)
      }

      if (task.enabled) {
        this.scheduleTask(taskId)
      }
    }

    return task
  }

  /**
   * Create a new custom task
   */
  createTask(task: Omit<ScheduledTask, 'id' | 'createdAt'>): ScheduledTask {
    const id = `custom-${Date.now()}`
    const newTask: ScheduledTask = {
      ...task,
      id,
      createdAt: Date.now()
    }

    this.tasks.set(id, newTask)

    if (newTask.enabled) {
      this.scheduleTask(id)
    }

    return newTask
  }

  /**
   * Delete a task
   */
  deleteTask(taskId: string): boolean {
    const timer = this.timers.get(taskId)
    if (timer) {
      clearTimeout(timer)
      this.timers.delete(taskId)
    }

    return this.tasks.delete(taskId)
  }

  /**
   * Get task run history
   */
  getHistory(limit = 50): TaskRunResult[] {
    return this.history.slice(0, limit)
  }

  /**
   * Check if a task is running
   */
  isRunning(taskId: string): boolean {
    return this.running.has(taskId)
  }
}

// Singleton
let instance: ScheduledTasksService | null = null

export function getScheduledTasksService(db: DB): ScheduledTasksService {
  if (!instance) {
    instance = new ScheduledTasksService(db)
  }
  return instance
}
