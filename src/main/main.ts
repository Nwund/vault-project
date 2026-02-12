// File: src/main/main.ts
import { app, BrowserWindow, globalShortcut, ipcMain, Menu } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { FSWatcher } from 'chokidar'

import { createDb } from './db'
import { registerIpc } from './ipc'
import { getMediaDirs } from './settings'
import { scanAndUpsertAll, cleanupMissingFiles } from './scanner'
import { startWatcher } from './watcher'
import { startJobRunner } from './jobs'
import { broadcastToggle, logMain, registerDiagnosticsIpc } from './diagnostics'
import { registerVaultProtocol } from './vaultProtocol'
import { makeImageThumb, makeVideoThumb, probeVideoDurationSec, probeMediaDimensions } from './thumbs'

import { analyzeLoudness } from './services/loudness'
import { initializeAiIntelligence } from './services/ai-intelligence'
import { ffmpegBin } from './ffpaths'
import { errorLogger, setupGlobalErrorHandlers } from './services/error-logger'

const DEFAULT_DEV_SERVER_URL = 'http://localhost:5173/'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

function ensureTrailingSlash(url: string): string {
  return url.endsWith('/') ? url : `${url}/`
}

function isDevMode(): boolean {
  return !app.isPackaged
}

function resolveViteDevServerUrl(): string {
  const fromEnv = process.env.VITE_DEV_SERVER_URL?.trim()
  return ensureTrailingSlash(fromEnv || DEFAULT_DEV_SERVER_URL)
}

function broadcast(channel: string) {
  for (const win of BrowserWindow.getAllWindows()) win.webContents.send(channel)
}

function resolvePreloadPath(): string {
  const candidates = [
    path.join(__dirname, '../preload/index.js'),
    path.join(__dirname, '../preload/index.mjs'),
    path.join(__dirname, 'preload.js'),
    path.join(__dirname, 'preload.mjs')
  ]
  const found = candidates.find((p) => fs.existsSync(p))
  if (!found) {
    logMain('error', 'Preload not found', { candidates })
    return candidates[0]
  }
  return found
}

async function createMainWindow(): Promise<BrowserWindow> {
  const preloadPath = resolvePreloadPath()

  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false,
    backgroundColor: '#0B0B0C',
    titleBarStyle: 'hiddenInset',
    autoHideMenuBar: true,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  win.once('ready-to-show', () => win.show())

  if (isDevMode()) {
    const devUrl = resolveViteDevServerUrl()
    process.env.VITE_DEV_SERVER_URL = devUrl
    logMain('info', 'Resolved Vite dev server URL', { devUrl, preloadPath })
    await win.loadURL(devUrl)
    win.webContents.openDevTools({ mode: 'detach' })
  } else {
    const indexHtmlPath = path.join(__dirname, '../renderer/index.html')
    logMain('info', 'Loading packaged renderer', { indexHtmlPath, preloadPath })
    await win.loadFile(indexHtmlPath)
  }

  return win
}

async function rescanAll(db: ReturnType<typeof createDb>, dirs: string[]) {
  for (const dir of dirs) {
    try {
      await scanAndUpsertAll(db, dir)
    } catch (e: any) {
      logMain('error', 'Scan failed', { dir, error: String(e?.message ?? e) })
    }
  }
  broadcast('vault:changed')
}

function closeAllWatchers(watchers: FSWatcher[]) {
  for (const w of watchers) {
    try {
      void w.close()
    } catch {
      // ignore
    }
  }
}

async function main() {
  Menu.setApplicationMenu(null)
  registerDiagnosticsIpc()
  registerVaultProtocol()

  const db = createDb()

  let watchers: FSWatcher[] = []
  const startWatchersForDirs = (dirs: string[]) => {
    closeAllWatchers(watchers)
    watchers = dirs.map((dir) =>
      startWatcher(db, dir, () => {
        broadcast('vault:changed')
      })
    )
  }

  const dirs = getMediaDirs()
  logMain('info', 'Media dirs', { dirs })

  // Start watchers immediately (lightweight)
  startWatchersForDirs(dirs)

  const jobRunner = startJobRunner(
    db,
    {
      'media:analyze': async (db2, payload) => {
        const p = payload as {
          mediaId: string
          path: string
          type: 'video' | 'image'
          mtimeMs: number
          size: number
        }

        const cur = db2.getMedia(p.mediaId)
        if (!cur) return
        if (cur.path !== p.path) return
        if (cur.mtimeMs !== p.mtimeMs || cur.size !== p.size) return

        if (p.type === 'video') {
          const durationSec = await probeVideoDurationSec(p.path)
          const dimensions = await probeMediaDimensions(p.path)
          const thumbPath = await makeVideoThumb({
            mediaId: p.mediaId,
            filePath: p.path,
            mtimeMs: p.mtimeMs,
            durationSec
          })

          // Save dimensions/duration even if thumb fails
          db2.upsertMedia({
            ...cur,
            durationSec: durationSec ?? cur.durationSec ?? null,
            thumbPath: thumbPath ?? cur.thumbPath ?? null,
            width: dimensions?.width ?? cur.width ?? null,
            height: dimensions?.height ?? cur.height ?? null
          })

          if (!thumbPath && !cur.thumbPath) {
            console.warn(`[Thumbs] Video thumb returned null for ${p.path}`)
            throw new Error(`Thumbnail generation failed for video: ${p.path}`)
          }

          // Run loudness analysis (non-blocking — failure doesn't break the job)
          try {
            const loudness = await analyzeLoudness(p.path, durationSec)
            if (loudness?.peakTime != null) {
              db2.setLoudnessPeakTime(p.mediaId, loudness.peakTime)
            }
          } catch (e: any) {
            console.warn(`[Loudness] Analysis failed for ${p.path}:`, e?.message)
          }
        } else {
          const dimensions = await probeMediaDimensions(p.path)
          const thumbPath = await makeImageThumb({
            mediaId: p.mediaId,
            filePath: p.path,
            mtimeMs: p.mtimeMs
          })

          // Save dimensions even if thumb fails
          db2.upsertMedia({
            ...cur,
            thumbPath: thumbPath ?? cur.thumbPath ?? null,
            width: dimensions?.width ?? cur.width ?? null,
            height: dimensions?.height ?? cur.height ?? null
          })

          if (!thumbPath && !cur.thumbPath) {
            console.warn(`[Thumbs] Image thumb returned null for ${p.path}`)
            throw new Error(`Thumbnail generation failed for image: ${p.path}`)
          }
        }

        broadcast('vault:changed')
      }
    },
    () => broadcast('vault:jobsChanged')
  )

  registerIpc(ipcMain, db, async (newDirs) => {
    await rescanAll(db, newDirs)
    startWatchersForDirs(newDirs)
    jobRunner.poke()
  })

  globalShortcut.register('CommandOrControl+Shift+D', () => {
    broadcastToggle()
    logMain('info', 'Toggled diagnostics overlay (hotkey)')
  })

  const mainWindow = await createMainWindow()

  // Initialize AI Intelligence system with graceful degradation
  if (ffmpegBin) {
    try {
      initializeAiIntelligence(db, ffmpegBin, mainWindow)
      logMain('info', 'AI Intelligence system initialized')
      errorLogger.info('Main', 'AI Intelligence system initialized successfully')
    } catch (err) {
      // Graceful degradation - app continues without AI if initialization fails
      logMain('error', 'AI Intelligence initialization failed - continuing without AI', { error: String(err) })
      errorLogger.error('Main', 'AI Intelligence initialization failed - app will continue without AI features', err)
    }
  } else {
    logMain('warn', 'FFmpeg not found, AI Intelligence system disabled')
    errorLogger.warn('Main', 'FFmpeg not found - AI features disabled')
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // DEFERRED STARTUP OPERATIONS
  // These run AFTER the window is shown to improve perceived startup time
  // ═══════════════════════════════════════════════════════════════════════════
  setImmediate(async () => {
    logMain('info', 'Starting deferred startup operations...')
    const deferredStart = Date.now()

    try {
      // 1. Clean up database entries for files that no longer exist
      const removedCount = cleanupMissingFiles(db, dirs)
      if (removedCount > 0) {
        logMain('info', 'Cleaned up missing files', { count: removedCount })
      }

      // 2. Clean up stale thumbnails and analyzeError flags
      const allMedia = db.listAllMediaPaths()
      let staleThumbs = 0
      let clearedErrors = 0
      for (const { id } of allMedia) {
        const row = db.getMedia(id)
        if (!row) continue
        if (row.thumbPath && !fs.existsSync(row.thumbPath)) {
          db.clearThumbPath(id)
          staleThumbs++
        }
        if (row.analyzeError) {
          db.clearAnalyzeError(id)
          clearedErrors++
        }
      }
      if (staleThumbs > 0) logMain('info', 'Cleared stale thumb paths', { count: staleThumbs })
      if (clearedErrors > 0) logMain('info', 'Cleared stale analyzeError flags', { count: clearedErrors })

      // 3. Scan media directories for new files
      await rescanAll(db, dirs)

      // 4. Deduplicate DB entries (different path styles for same file)
      const dbPaths = db.listAllMediaPaths()
      const pathMap = new Map<string, string[]>()
      for (const p of dbPaths) {
        const normalized = path.resolve(p.path).toLowerCase()
        if (!pathMap.has(normalized)) pathMap.set(normalized, [])
        pathMap.get(normalized)!.push(p.id)
      }
      let removedDupes = 0
      for (const [, ids] of pathMap) {
        for (let i = 1; i < ids.length; i++) {
          db.deleteMediaById(ids[i])
          removedDupes++
        }
      }
      if (removedDupes > 0) {
        logMain('info', 'Removed duplicate DB entries', { count: removedDupes })
      }

      // 5. Poke job runner to process any pending thumbnail jobs
      jobRunner.poke()

      const elapsed = Date.now() - deferredStart
      logMain('info', 'Deferred startup operations completed', { elapsedMs: elapsed })
    } catch (err) {
      logMain('error', 'Deferred startup operations failed', { error: String(err) })
      errorLogger.error('Main', 'Deferred startup operations failed', err)
    }
  })

  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) await createMainWindow()
  })

  app.on('before-quit', () => {
    jobRunner.stop()
    closeAllWatchers(watchers)
  })
}

// Initialize error logging and global error handlers
errorLogger.initialize()
setupGlobalErrorHandlers()

// Fix GPU cache access denied errors by setting a custom cache directory
// This must be done before app.whenReady()
try {
  const customCachePath = path.join(app.getPath('userData'), 'GPUCache')
  if (!fs.existsSync(customCachePath)) {
    fs.mkdirSync(customCachePath, { recursive: true })
  }
  app.setPath('cache', customCachePath)
} catch (err) {
  errorLogger.warn('Main', 'Failed to set custom cache path', { error: String(err) })
}

// Disable autofill feature to suppress "Autofill.enable" DevTools errors
app.commandLine.appendSwitch('disable-features', 'AutofillServerCommunication')

app.whenReady().then(() => void main())

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
})