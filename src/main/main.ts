// File: src/main/main.ts
import { app, BrowserWindow, globalShortcut, ipcMain, Menu, screen } from 'electron'
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
import { makeImageThumb, makeVideoThumb, makeGifThumb, probeVideoDurationSec, probeMediaDimensions } from './thumbs'

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

  // Sit inside the OS work area on first launch so the bottom of the window
  // never extends behind the Windows taskbar. workAreaSize already excludes
  // taskbar height; pin the position to the work area's origin too in case the
  // primary display has a top/left taskbar.
  const primary = screen.getPrimaryDisplay()
  const wa = primary.workArea
  const initialWidth = Math.min(1200, wa.width)
  const initialHeight = Math.min(800, wa.height)

  const win = new BrowserWindow({
    width: initialWidth,
    height: initialHeight,
    x: wa.x + Math.max(0, Math.floor((wa.width - initialWidth) / 2)),
    y: wa.y + Math.max(0, Math.floor((wa.height - initialHeight) / 2)),
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

  // Per-host Referer / Origin injection for hotlink-protected CDNs.
  // Some image hosts (pixiv's i.pximg.net most notably) reject any
  // request that doesn't carry the right Referer. Browsers can't fake
  // Referer client-side, but Electron's webRequest can rewrite headers
  // before the request goes out — letting us load these images
  // transparently in the renderer's <img> tags.
  // Add new entries here when we hit a new hotlink-protected source.
  // `referer` set: rewrite. `stripReferer: true`: delete (used for CDNs
  // that 403 cross-origin <video> playback when our `app://` Referer
  // leaks — booru-host videos in the Browse lightbox were the original
  // bug, "gray video frame, 0-byte fetch").
  const REFERER_OVERRIDES: Array<{ hostMatch: RegExp; referer?: string; origin?: string; stripReferer?: boolean }> = [
    { hostMatch: /(^|\.)pximg\.net$/i, referer: 'https://www.pixiv.net/', origin: 'https://www.pixiv.net' },
    { hostMatch: /(^|\.)pixiv\.net$/i, referer: 'https://www.pixiv.net/', origin: 'https://www.pixiv.net' },
    // Booru video CDNs that 403 with cross-origin Referer.
    { hostMatch: /(^|\.)xbooru\.com$/i, stripReferer: true },
    { hostMatch: /(^|\.)gelbooru\.com$/i, stripReferer: true },
    { hostMatch: /(^|\.)realbooru\.com$/i, stripReferer: true },
    { hostMatch: /(^|\.)tbib\.org$/i, stripReferer: true },
    { hostMatch: /(^|\.)hypnohub\.net$/i, stripReferer: true },
    { hostMatch: /(^|\.)paheal\.net$/i, stripReferer: true },
  ]
  win.webContents.session.webRequest.onBeforeSendHeaders((details, callback) => {
    try {
      const u = new URL(details.url)
      const override = REFERER_OVERRIDES.find((r) => r.hostMatch.test(u.hostname))
      if (override) {
        if (override.stripReferer) {
          delete details.requestHeaders['Referer']
          delete details.requestHeaders['Origin']
        } else if (override.referer) {
          details.requestHeaders['Referer'] = override.referer
          if (override.origin) details.requestHeaders['Origin'] = override.origin
        }
      }
    } catch { /* malformed URL — pass through unchanged */ }
    callback({ requestHeaders: details.requestHeaders })
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
          type: 'video' | 'image' | 'gif'
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
        } else if (p.type === 'gif') {
          // GIFs: Use dedicated handler with video-then-image fallback
          const durationSec = await probeVideoDurationSec(p.path)
          const dimensions = await probeMediaDimensions(p.path)
          const thumbPath = await makeGifThumb({
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
            console.warn(`[Thumbs] GIF thumb returned null for ${p.path}`)
            throw new Error(`Thumbnail generation failed for GIF: ${p.path}`)
          }
        } else {
          // Images: standard static image handling
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

    // Background: kick off XTTS server auto-start. Fire-and-forget so it
    // doesn't block app startup; the server itself takes 15-60s to load
    // the model. If xyrene-portable isn't installed at a known path,
    // findXttsServerDir returns null and we skip silently. If it IS
    // installed, the server warms up while the user is loading the UI.
    //
    // Using console.log here so the dev terminal shows what happened.
    // logMain only goes to the in-app diagnostics overlay, which is no
    // help when triaging "why didn't the server start".
    void (async () => {
      try {
        const { startXttsServer, findXttsServerDir } = await import('./services/xyrene/server-launcher')
        const dir = findXttsServerDir(null)
        if (!dir) {
          console.log('[XTTS auto-start] skipped — xyrene-portable not found at known paths')
          return
        }
        console.log(`[XTTS auto-start] launching server from ${dir}`)
        const ok = await startXttsServer({ maxWaitMs: 120000 })
        console.log(`[XTTS auto-start] ${ok ? 'ready' : 'failed (see python console)'}`)
      } catch (err) {
        console.warn('[XTTS auto-start] threw (non-fatal):', err)
      }
    })()

    // JoyCaption auto-start. Same pattern as XTTS — if the sidecar dir
    // is installed AND the user hasn't explicitly disabled auto-start
    // (settings.ai.joycaptionAutoStart, default true), spawn the
    // sidecar so it's warming the model while the UI loads. Skipped
    // silently when not installed. First /caption request triggers
    // the actual model load (~30-60s), so getting the process up
    // early is a real UX win — but starting the model load with
    // mode=bf16 takes 8-12GB of VRAM, so we let the user opt out.
    void (async () => {
      try {
        const { getAISettings } = await import('./settings')
        const aiSettings = getAISettings() as any
        const autoStart = aiSettings?.joycaptionAutoStart !== false  // default true
        if (!autoStart) {
          console.log('[JoyCaption auto-start] skipped — user opted out (settings.ai.joycaptionAutoStart)')
          return
        }
        const { startJoyCaptionSidecar, findJoyCaptionSidecarDir } = await import(
          './services/ai-intelligence/joycaption-launcher'
        )
        const dir = findJoyCaptionSidecarDir(null)
        if (!dir) {
          console.log('[JoyCaption auto-start] skipped — joycaption-sidecar not found at known paths')
          return
        }
        const mode = (aiSettings?.joycaptionMode === '4bit' ? '4bit' : 'bf16') as 'bf16' | '4bit'
        console.log(`[JoyCaption auto-start] launching sidecar from ${dir} (mode=${mode})`)
        const ok = await startJoyCaptionSidecar({ mode, maxWaitMs: 180000 })
        console.log(`[JoyCaption auto-start] ${ok ? 'ready' : 'failed (see python console)'}`)
      } catch (err) {
        console.warn('[JoyCaption auto-start] threw (non-fatal):', err)
      }
    })()

    // WhisperX auto-start. Same pattern, opt-in via settings.ai.whisperxAutoStart.
    // Heavy load (faster-whisper + wav2vec2 + pyannote diarization), so default off
    // — user explicitly enables when they want word-level + speaker timestamps.
    // Honors settings.ai.whisperxStartScript (path to start.bat that activates the
    // sidecar venv and runs server.py on port 8031).
    void (async () => {
      try {
        const { getAISettings } = await import('./settings')
        const aiSettings = getAISettings() as any
        if (!aiSettings?.whisperxAutoStart) return
        if (!aiSettings?.whisperxStartScript) {
          console.log('[WhisperX auto-start] skipped — settings.ai.whisperxStartScript not configured')
          return
        }
        const { ensureWhisperXSidecar } = await import('./services/ai-intelligence/whisperx-launcher')
        console.log('[WhisperX auto-start] launching sidecar')
        const ok = await ensureWhisperXSidecar()
        console.log(`[WhisperX auto-start] ${ok ? 'ready' : 'failed (see python console)'}`)
      } catch (err) {
        console.warn('[WhisperX auto-start] threw (non-fatal):', err)
      }
    })()

    // F5-TTS auto-start. Opt-in via settings.ai.f5ttsAutoStart. Required when
    // settings.ai.xyreneVoiceBackend = 'f5tts' so the engine doesn't have to
    // wait through a 90s sidecar boot on first synth. Default off (XTTS is the
    // shipping backend).
    void (async () => {
      try {
        const { getAISettings } = await import('./settings')
        const aiSettings = getAISettings() as any
        if (!aiSettings?.f5ttsAutoStart) return
        if (!aiSettings?.f5ttsStartScript) {
          console.log('[F5-TTS auto-start] skipped — settings.ai.f5ttsStartScript not configured')
          return
        }
        const { ensureF5TtsSidecar } = await import('./services/ai-intelligence/f5-tts-launcher')
        console.log('[F5-TTS auto-start] launching sidecar')
        const ok = await ensureF5TtsSidecar()
        console.log(`[F5-TTS auto-start] ${ok ? 'ready' : 'failed (see python console)'}`)
      } catch (err) {
        console.warn('[F5-TTS auto-start] threw (non-fatal):', err)
      }
    })()
  } else {
    logMain('warn', 'FFmpeg not found, AI Intelligence system disabled')
    errorLogger.warn('Main', 'FFmpeg not found - AI features disabled')
  }

  // DeoVR / HereSphere catalog server auto-start (#119). Only fires
  // when the user explicitly enables settings.ai.deovrServerEnabled —
  // default off because the server is NO AUTH and binds to 0.0.0.0
  // (so VR headsets on the LAN can reach it). User picks port via
  // settings.ai.deovrServerPort, default 9999.
  void (async () => {
    try {
      const { getAISettings } = await import('./settings')
      const aiSettings = getAISettings() as any
      if (!aiSettings?.deovrServerEnabled) return
      const port = Number(aiSettings?.deovrServerPort) || 9999
      const { deovrServer } = await import('./services/deovr-server')
      // Wire the library accessors. Identical to ipc.ts's deovr:start
      // handler — duplicated so the auto-start path doesn't depend on
      // IPC being invoked first.
      if (!deovrServer.listVideos) {
        deovrServer.listVideos = async () => {
          const rows = db.raw.prepare(`
            SELECT m.id, m.filename, m.path, m.durationSec, m.thumbPath, m.width, m.height,
                   ar.approved_title AS title
            FROM media m
            LEFT JOIN ai_analysis_results ar ON ar.media_id = m.id
            WHERE m.type = 'video'
            ORDER BY m.addedAt DESC
            LIMIT 500
          `).all() as any[]
          return rows
        }
      }
      if (!deovrServer.getVideo) {
        deovrServer.getVideo = async (id: string) => {
          const row = db.raw.prepare(`
            SELECT m.id, m.filename, m.path, m.durationSec, m.thumbPath, m.width, m.height,
                   ar.approved_title AS title
            FROM media m
            LEFT JOIN ai_analysis_results ar ON ar.media_id = m.id
            WHERE m.id = ? AND m.type = 'video' LIMIT 1
          `).get(id) as any
          return row ?? null
        }
      }
      const result = await deovrServer.start({ port })
      if (result.success) {
        console.log(`[DeoVR auto-start] catalog ready at ${result.addresses?.[0] ?? `http://localhost:${port}/deovr/`}`)
      } else {
        console.warn('[DeoVR auto-start] failed:', result.error)
      }
    } catch (err) {
      console.warn('[DeoVR auto-start] threw (non-fatal):', err)
    }
  })()

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
    // Best-effort: stop any XTTS server WE launched. If the user started
    // it manually, isManagingServer() returns false and stopXttsServer
    // no-ops, leaving their process alone.
    try {
      // Synchronous require to avoid awaiting in before-quit (electron
      // kills the event loop quickly once this returns).
      const { stopXttsServer } = require('./services/xyrene/server-launcher')
      stopXttsServer()
    } catch { /* ignore — already torn down */ }
    // Same pattern for JoyCaption — no-ops if the user started it manually.
    try {
      const { stopJoyCaptionSidecar } = require('./services/ai-intelligence/joycaption-launcher')
      stopJoyCaptionSidecar()
    } catch { /* ignore — already torn down */ }
  })
}

// Initialize error logging and global error handlers
errorLogger.initialize()
setupGlobalErrorHandlers()

// Fix GPU cache access denied errors by setting a custom cache directory.
// MUST be done before app.whenReady().
//
// CRITICAL: setPath('cache', ...) causes Electron to re-derive userData from
// the cache path's parent + appName on subsequent app.getPath('userData')
// calls. That made everything we write to userData (ai-models, audio/voice,
// xyrene_curated, etc.) land at <userData>/GPUCache/vault/ instead of
// <userData>/. Pinning userData explicitly AFTER the cache change keeps
// path resolution honest.
try {
  const correctUserData = app.getPath('userData')
  const customCachePath = path.join(correctUserData, 'GPUCache')
  if (!fs.existsSync(customCachePath)) {
    fs.mkdirSync(customCachePath, { recursive: true })
  }
  app.setPath('cache', customCachePath)
  app.setPath('userData', correctUserData)

  // One-time migration: prior versions wrote into <userData>/GPUCache/vault/
  // due to the bug above. Move those subtrees up so existing curated sounds,
  // models, and voice samples are visible at the correct path.
  const pollutedRoot = path.join(customCachePath, 'vault')
  if (fs.existsSync(pollutedRoot)) {
    try {
      const entries = fs.readdirSync(pollutedRoot)
      for (const entry of entries) {
        const src = path.join(pollutedRoot, entry)
        const dest = path.join(correctUserData, entry)
        if (fs.existsSync(dest)) {
          // Destination already exists — merge directory contents shallowly
          // (only top-level files/folders that don't collide). Skip rather
          // than overwrite so we never clobber freshly-written data.
          try {
            const srcStat = fs.statSync(src)
            if (!srcStat.isDirectory()) continue
            const subEntries = fs.readdirSync(src)
            for (const sub of subEntries) {
              const srcSub = path.join(src, sub)
              const destSub = path.join(dest, sub)
              if (!fs.existsSync(destSub)) {
                try { fs.renameSync(srcSub, destSub) } catch { /* ignore */ }
              }
            }
          } catch { /* ignore */ }
        } else {
          try { fs.renameSync(src, dest) } catch { /* ignore */ }
        }
      }
      // Best-effort cleanup of empty polluted root
      try { fs.rmdirSync(pollutedRoot) } catch { /* dir may still have leftovers — leave alone */ }
    } catch (mErr) {
      errorLogger.warn('Main', 'userData migration: scan failed', { error: String(mErr) })
    }
  }
} catch (err) {
  errorLogger.warn('Main', 'Failed to set custom cache path', { error: String(err) })
}

// Disable autofill features to suppress "Autofill.enable" DevTools errors
// These errors are cosmetic (CDP protocol) and don't affect app functionality
app.commandLine.appendSwitch('disable-features', 'AutofillServerCommunication,Autofill,AutofillCreditCardAuthentication,AutofillEnableAccountWalletStorage')
app.commandLine.appendSwitch('disable-blink-features', 'AutofillAddress,AutofillCreditCard,AutofillAddressDetails,AutofillUploadOnFormSubmission')
app.commandLine.appendSwitch('disable-component-update')

app.whenReady().then(() => void main())

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
})