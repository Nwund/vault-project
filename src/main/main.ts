// File: src/main/main.ts
import { app, BrowserWindow, globalShortcut, ipcMain } from 'electron'
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
import { makeImageThumb, makeVideoThumb, probeVideoDurationSec } from './thumbs'
import { initDiabellaService } from './services/diabella'

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
  registerDiagnosticsIpc()
  registerVaultProtocol()

  // Initialize Diabella AI companion service
  initDiabellaService()
  logMain('info', 'Diabella service initialized')

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

  // Clean up database entries for files that no longer exist
  const removedCount = cleanupMissingFiles(db)
  if (removedCount > 0) {
    logMain('info', 'Cleaned up missing files', { count: removedCount })
  }

  await rescanAll(db, dirs)
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
          const thumbPath = await makeVideoThumb({
            mediaId: p.mediaId,
            filePath: p.path,
            mtimeMs: p.mtimeMs,
            durationSec
          })

          db2.upsertMedia({
            ...cur,
            durationSec: durationSec ?? cur.durationSec ?? null,
            thumbPath: thumbPath ?? cur.thumbPath ?? null
          })
        } else {
          const thumbPath = await makeImageThumb({
            mediaId: p.mediaId,
            filePath: p.path,
            mtimeMs: p.mtimeMs
          })

          db2.upsertMedia({
            ...cur,
            thumbPath: thumbPath ?? cur.thumbPath ?? null
          })
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

  await createMainWindow()

  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) await createMainWindow()
  })

  app.on('before-quit', () => {
    jobRunner.stop()
    closeAllWatchers(watchers)
  })
}

app.whenReady().then(() => void main())

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
})