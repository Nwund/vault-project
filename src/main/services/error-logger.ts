// ===============================
// Error Logger Service
// Persists errors to a rotating log file for debugging
// ===============================

import { app } from 'electron'
import fs from 'node:fs'
import path from 'node:path'

const MAX_LOG_SIZE_BYTES = 5 * 1024 * 1024 // 5MB per log file
const MAX_LOG_FILES = 3 // Keep last 3 log files

export interface LogEntry {
  timestamp: string
  level: 'info' | 'warn' | 'error'
  source: string
  message: string
  stack?: string
  meta?: Record<string, unknown>
}

class ErrorLoggerService {
  private logDir: string
  private currentLogPath: string
  private initialized = false

  constructor() {
    this.logDir = path.join(app.getPath('userData'), 'logs')
    this.currentLogPath = path.join(this.logDir, 'vault.log')
  }

  /**
   * Initialize the logger - creates log directory if needed
   */
  initialize(): void {
    if (this.initialized) return

    try {
      if (!fs.existsSync(this.logDir)) {
        fs.mkdirSync(this.logDir, { recursive: true })
      }
      this.initialized = true
      this.rotateLogsIfNeeded()
      this.info('ErrorLogger', 'Logging initialized', { logPath: this.currentLogPath })
    } catch (err) {
      console.error('[ErrorLogger] Failed to initialize:', err)
    }
  }

  /**
   * Log an info message
   */
  info(source: string, message: string, meta?: Record<string, unknown>): void {
    this.log('info', source, message, undefined, meta)
  }

  /**
   * Log a warning
   */
  warn(source: string, message: string, meta?: Record<string, unknown>): void {
    this.log('warn', source, message, undefined, meta)
  }

  /**
   * Log an error
   */
  error(source: string, message: string, error?: Error | unknown, meta?: Record<string, unknown>): void {
    const stack = error instanceof Error ? error.stack : undefined
    const errorMsg = error instanceof Error ? error.message : String(error || '')
    this.log('error', source, `${message}: ${errorMsg}`, stack, meta)
  }

  /**
   * Core logging function
   */
  private log(
    level: 'info' | 'warn' | 'error',
    source: string,
    message: string,
    stack?: string,
    meta?: Record<string, unknown>
  ): void {
    if (!this.initialized) {
      this.initialize()
    }

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      source,
      message,
      stack,
      meta
    }

    // Also log to console
    const consoleMsg = `[${entry.timestamp}] [${level.toUpperCase()}] [${source}] ${message}`
    if (level === 'error') {
      console.error(consoleMsg, meta || '')
      if (stack) console.error(stack)
    } else if (level === 'warn') {
      console.warn(consoleMsg, meta || '')
    } else {
      console.log(consoleMsg, meta || '')
    }

    // Write to file
    try {
      const line = JSON.stringify(entry) + '\n'
      fs.appendFileSync(this.currentLogPath, line)
      this.rotateLogsIfNeeded()
    } catch (err) {
      console.error('[ErrorLogger] Failed to write log:', err)
    }
  }

  /**
   * Rotate logs if current file is too large
   */
  private rotateLogsIfNeeded(): void {
    try {
      if (!fs.existsSync(this.currentLogPath)) return

      const stats = fs.statSync(this.currentLogPath)
      if (stats.size < MAX_LOG_SIZE_BYTES) return

      // Rotate existing logs
      for (let i = MAX_LOG_FILES - 1; i >= 1; i--) {
        const oldPath = path.join(this.logDir, `vault.${i}.log`)
        const newPath = path.join(this.logDir, `vault.${i + 1}.log`)
        if (fs.existsSync(oldPath)) {
          if (i === MAX_LOG_FILES - 1) {
            fs.unlinkSync(oldPath) // Delete oldest
          } else {
            fs.renameSync(oldPath, newPath)
          }
        }
      }

      // Move current to .1
      fs.renameSync(this.currentLogPath, path.join(this.logDir, 'vault.1.log'))
    } catch (err) {
      console.error('[ErrorLogger] Failed to rotate logs:', err)
    }
  }

  /**
   * Get recent log entries
   */
  getRecentLogs(limit = 100): LogEntry[] {
    try {
      if (!fs.existsSync(this.currentLogPath)) return []

      const content = fs.readFileSync(this.currentLogPath, 'utf-8')
      const lines = content.trim().split('\n').filter(Boolean)
      const entries: LogEntry[] = []

      // Read from end (most recent first)
      for (let i = lines.length - 1; i >= 0 && entries.length < limit; i--) {
        try {
          entries.push(JSON.parse(lines[i]))
        } catch {
          // Skip malformed lines
        }
      }

      return entries
    } catch (err) {
      console.error('[ErrorLogger] Failed to read logs:', err)
      return []
    }
  }

  /**
   * Get recent error entries only
   */
  getRecentErrors(limit = 50): LogEntry[] {
    return this.getRecentLogs(limit * 3).filter(e => e.level === 'error').slice(0, limit)
  }

  /**
   * Get the full log file content for bug reports
   */
  getLogFileContent(): string {
    try {
      if (!fs.existsSync(this.currentLogPath)) return ''
      return fs.readFileSync(this.currentLogPath, 'utf-8')
    } catch (err) {
      console.error('[ErrorLogger] Failed to read log file:', err)
      return ''
    }
  }

  /**
   * Get the log file path
   */
  getLogFilePath(): string {
    return this.currentLogPath
  }

  /**
   * Clear all logs
   */
  clearLogs(): { success: boolean; error?: string } {
    try {
      const logFiles = fs.readdirSync(this.logDir).filter(f => f.endsWith('.log'))
      for (const file of logFiles) {
        fs.unlinkSync(path.join(this.logDir, file))
      }
      return { success: true }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  }
}

// Singleton instance
export const errorLogger = new ErrorLoggerService()

// Global error handlers for uncaught exceptions
export function setupGlobalErrorHandlers(): void {
  process.on('uncaughtException', (error) => {
    errorLogger.error('Process', 'Uncaught exception', error)
  })

  process.on('unhandledRejection', (reason) => {
    errorLogger.error('Process', 'Unhandled promise rejection', reason as Error)
  })
}
