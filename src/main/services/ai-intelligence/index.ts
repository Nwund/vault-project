// ===============================
// AI Intelligence System - Main Entry Point
// ===============================

import { ipcMain, BrowserWindow, app } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import type { DB } from '../../db'
import { getSettings, updateSettings, type VaultSettings } from '../../settings'

import { FrameExtractor } from './frame-extractor'
import { ModelDownloader } from './model-downloader'
import { Tier1OnnxTagger } from './tier1-onnx-tagger'
import { Tier2VisionLLM } from './tier2-vision-llm'
import { Tier3TagMatcher } from './tier3-tag-matcher'
import { ProcessingQueue } from './processing-queue'
import {
  encryptString,
  decryptString,
  isCipherText,
  isSecureStorageAvailable,
  maskedPreview,
} from '../secure-storage'
import { isJunkTag, normalizeToCanonical } from './canonical-tags'
import { getTagRedirect } from './tier3-tag-matcher'
import { nanoid } from 'nanoid'
import { getSimilarityEngine, type SimilarMedia } from './similarity-engine'

// Look for VENICE_API_KEY in well-known locations. Returns the first
// non-empty match. Used only on first run to auto-import the key into
// the encrypted store; after that, the keychain copy wins.
function loadVeniceKeyFromDevEnv(): string | null {
  return loadDevEnvKey('VENICE_API_KEY')
}

// Same pattern for TpDB (ThePornDB) — scene-fingerprint API for
// commercial scene metadata. User saved key 2026-05-12.
function loadTpdbKeyFromDevEnv(): string | null {
  return loadDevEnvKey('TPDB_API_KEY')
}

// e621 credentials — Basic auth so we need BOTH key and username.
function loadE621KeyFromDevEnv(): string | null {
  return loadDevEnvKey('E621_API_KEY')
}
function loadE621UsernameFromDevEnv(): string | null {
  return loadDevEnvKey('E621_USERNAME')
}

// rule34.xxx — URL-param auth, key + user_id required.
function loadRule34KeyFromDevEnv(): string | null {
  return loadDevEnvKey('RULE34_API_KEY')
}
function loadRule34UserIdFromDevEnv(): string | null {
  return loadDevEnvKey('RULE34_USER_ID')
}

// RapidAPI shared key (paid endpoints like xnxx download, pornhub trending).
function loadRapidApiKeyFromDevEnv(): string | null {
  return loadDevEnvKey('RAPIDAPI_KEY')
}
function loadRapidApiXnxxHostFromDevEnv(): string | null {
  return loadDevEnvKey('RAPIDAPI_XNXX_HOST')
}

// Danbooru — Basic auth, needs username + API key.
function loadDanbooruUsernameFromDevEnv(): string | null {
  return loadDevEnvKey('DANBOORU_USERNAME')
}
function loadDanbooruKeyFromDevEnv(): string | null {
  return loadDevEnvKey('DANBOORU_API_KEY')
}

// AIBooru — separate Danbooru-software install, separate account.
function loadAibooruUsernameFromDevEnv(): string | null {
  return loadDevEnvKey('AIBOORU_USERNAME')
}
function loadAibooruKeyFromDevEnv(): string | null {
  return loadDevEnvKey('AIBOORU_API_KEY')
}

// Gelbooru — URL-param auth, key + numeric user_id.
function loadGelbooruKeyFromDevEnv(): string | null {
  return loadDevEnvKey('GELBOORU_API_KEY')
}
function loadGelbooruUserIdFromDevEnv(): string | null {
  return loadDevEnvKey('GELBOORU_USER_ID')
}

// Bluesky — handle + app password. Used for authenticated NSFW
// search on the AT Protocol API.
function loadBlueskyHandleFromDevEnv(): string | null {
  return loadDevEnvKey('BLUESKY_HANDLE')
}
function loadBlueskyAppPasswordFromDevEnv(): string | null {
  return loadDevEnvKey('BLUESKY_APP_PASSWORD')
}

/** Generic "look up a key by name across all well-known env stores".
 *  Search order (first non-empty wins):
 *    1. process.env (CI / explicit override)
 *    2. <vault-dir>/.api-keys.env   ← portable / laptop install — drop the
 *                                     file alongside package.json and it works
 *    3. C:\dev\.api-keys.env         ← original dev-machine location
 *    4. <home>/.vault-api-keys.env  ← per-user dotfile fallback
 */
function loadDevEnvKey(name: string): string | null {
  const candidates = [
    (process.env as any)[name],
    readEnvFile(path.join(app.getAppPath(), '.api-keys.env'))?.[name],
    readEnvFile('C:\\dev\\.api-keys.env')?.[name],
    readEnvFile(path.join(app.getPath('home'), '.vault-api-keys.env'))?.[name],
  ]
  for (const c of candidates) {
    if (c && c.trim()) return c.trim()
  }
  return null
}

function readEnvFile(filePath: string): Record<string, string> | null {
  try {
    if (!fs.existsSync(filePath)) return null
    const text = fs.readFileSync(filePath, 'utf8')
    const out: Record<string, string> = {}
    for (const rawLine of text.split(/\r?\n/)) {
      const line = rawLine.trim()
      if (!line || line.startsWith('#')) continue
      const eq = line.indexOf('=')
      if (eq < 1) continue
      const key = line.slice(0, eq).trim()
      let value = line.slice(eq + 1).trim()
      // Strip surrounding quotes if present.
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1)
      }
      if (key && value) out[key] = value
    }
    return out
  } catch (err) {
    console.warn(`[AI] Could not read env file ${filePath}:`, err)
    return null
  }
}

let frameExtractor: FrameExtractor | null = null
let modelDownloader: ModelDownloader | null = null
let tier1Tagger: Tier1OnnxTagger | null = null
let tier2Vision: Tier2VisionLLM | null = null
let tier3Matcher: Tier3TagMatcher | null = null
let processingQueue: ProcessingQueue | null = null

export function initializeAiIntelligence(
  db: DB,
  ffmpegPath: string,
  mainWindow: BrowserWindow | null
): void {
  frameExtractor = new FrameExtractor(ffmpegPath)
  modelDownloader = new ModelDownloader()
  tier1Tagger = new Tier1OnnxTagger(modelDownloader)
  tier2Vision = new Tier2VisionLLM()
  tier3Matcher = new Tier3TagMatcher(db)
  processingQueue = new ProcessingQueue(
    db,
    frameExtractor,
    tier1Tagger,
    tier2Vision,
    tier3Matcher,
    mainWindow
  )
  // Boot-time orphan purge — drops queue rows pointing to deleted
  // media. Without this, every restart inherits whatever inflation
  // happened from prior file moves / library re-org. Cheap (< 50ms
  // even on a 30k-row queue); safe to always run.
  try {
    const orphanResult = processingQueue.purgeOrphans()
    if (orphanResult.purged > 0) {
      console.log(`[AI] Startup orphan purge: dropped ${orphanResult.purged} queue rows pointing to missing media`)
    }
  } catch (err) {
    console.warn('[AI] Startup orphan purge failed:', err)
  }

  // Load saved Venice API key from settings. The stored value may be
  // ciphertext (`enc:v1:...`) or legacy plaintext from before the
  // safeStorage migration. `decryptString` handles both: legacy plaintext
  // round-trips unchanged so we can detect the case and migrate it.
  const savedSettings = getSettings() as VaultSettings
  const savedStored = savedSettings?.ai?.veniceApiKey || ''
  let decrypted = decryptString(savedStored)

  // Fallback — if nothing is in settings, look for a dev key file at
  // `C:\dev\.api-keys.env` (or the platform equivalent). First-run
  // convenience so the user doesn't have to paste their key on every
  // fresh install. The file is dev-only — never bundled in production
  // builds — but the lookup runs in both because it's a no-op if the
  // file is absent.
  console.log(`[AI] Venice key startup check: savedStored=${savedStored ? `(${savedStored.length} chars, ${isCipherText(savedStored) ? 'ciphertext' : 'plaintext'})` : 'empty'}, decrypted=${decrypted ? `(${decrypted.length} chars)` : 'null'}`)
  if (!decrypted) {
    const fileKey = loadVeniceKeyFromDevEnv()
    if (fileKey && tier2Vision) {
      decrypted = fileKey
      console.log(`[AI] Loaded Venice API key from dev .api-keys.env (${fileKey.length} chars, ends "${fileKey.slice(-4)}")`)
      // Persist into the encrypted store immediately so subsequent runs
      // pick it up from settings (and the masked preview shows up in UI).
      if (isSecureStorageAvailable()) {
        try {
          const cipher = encryptString(fileKey)
          const current = getSettings() as VaultSettings
          updateSettings({
            ai: { ...current.ai, veniceApiKey: cipher }
          } as Partial<VaultSettings>)
          console.log('[AI] Auto-imported Venice key into encrypted storage')
        } catch (err) {
          console.warn('[AI] Could not persist auto-imported Venice key:', err)
        }
      } else {
        console.warn('[AI] safeStorage unavailable — key configured for session but NOT persisted')
      }
    } else if (!fileKey) {
      console.log('[AI] No VENICE_API_KEY found in env vars or .api-keys.env files — Tier 2 will start disabled')
    }
  }

  if (decrypted && tier2Vision) {
    tier2Vision.configure({ apiKey: decrypted })
    console.log('[AI] Restored Venice API key from settings')

    // Auto-enable Tier 2 whenever a usable Venice key is present.
    // The user explicitly asked Vault to flip Tier 2 on by default
    // when the key auto-loads — saves them clicking the toggle on
    // every fresh install / migration.
    const current = getSettings() as VaultSettings
    if (!current.ai?.tier2Enabled) {
      updateSettings({
        ai: { ...current.ai, tier2Enabled: true }
      } as Partial<VaultSettings>)
      console.log('[AI] Tier 2 auto-enabled (Venice key present)')
    }

    // Migrate legacy plaintext → safeStorage ciphertext on first run after
    // upgrading. Only attempt if encryption is actually available; if not,
    // we leave the legacy value alone rather than nuke the user's key.
    if (savedStored && !isCipherText(savedStored) && isSecureStorageAvailable()) {
      try {
        const cipher = encryptString(decrypted)
        const cur2 = getSettings() as VaultSettings
        updateSettings({
          ai: { ...cur2.ai, veniceApiKey: cipher }
        } as Partial<VaultSettings>)
        console.log('[AI] Migrated Venice API key to encrypted storage')
      } catch (err) {
        console.warn('[AI] Could not migrate Venice key to safeStorage:', err)
      }
    }
  }

  // TpDB API key — mirrors the Venice auto-import pattern exactly.
  // Encrypted via safeStorage on first import; survives restarts.
  ;(() => {
    const savedTpdb = (savedSettings?.ai as any)?.tpdbApiKey || ''
    let decryptedTpdb = decryptString(savedTpdb)
    if (!decryptedTpdb) {
      const fileKey = loadTpdbKeyFromDevEnv()
      if (fileKey) {
        decryptedTpdb = fileKey
        console.log(`[AI] Loaded TpDB API key from dev .api-keys.env (${fileKey.length} chars, ends "${fileKey.slice(-4)}")`)
        if (isSecureStorageAvailable()) {
          try {
            const cipher = encryptString(fileKey)
            const current = getSettings() as VaultSettings
            updateSettings({
              ai: { ...(current.ai as any), tpdbApiKey: cipher } as any
            } as Partial<VaultSettings>)
            console.log('[AI] Auto-imported TpDB key into encrypted storage')
          } catch (err) {
            console.warn('[AI] Could not persist auto-imported TpDB key:', err)
          }
        }
      }
    } else if (savedTpdb && !isCipherText(savedTpdb) && isSecureStorageAvailable()) {
      // Legacy plaintext migration.
      try {
        const cipher = encryptString(decryptedTpdb)
        const current = getSettings() as VaultSettings
        updateSettings({
          ai: { ...(current.ai as any), tpdbApiKey: cipher } as any
        } as Partial<VaultSettings>)
        console.log('[AI] Migrated TpDB key to encrypted storage')
      } catch (err) {
        console.warn('[AI] Could not migrate TpDB key:', err)
      }
    }
    if (decryptedTpdb) {
      console.log(`[AI] TpDB key configured (ends "${decryptedTpdb.slice(-4)}")`)
    }
  })()

  // e621 credentials — needs key + username (Basic auth). Stored
  // separately: key encrypted via safeStorage, username plaintext.
  ;(() => {
    const savedE621Key = (savedSettings?.ai as any)?.e621ApiKey || ''
    let decryptedE621 = decryptString(savedE621Key)
    if (!decryptedE621) {
      const fileKey = loadE621KeyFromDevEnv()
      if (fileKey) {
        decryptedE621 = fileKey
        console.log(`[AI] Loaded e621 API key from dev .api-keys.env (${fileKey.length} chars, ends "${fileKey.slice(-4)}")`)
        if (isSecureStorageAvailable()) {
          try {
            const cipher = encryptString(fileKey)
            const current = getSettings() as VaultSettings
            updateSettings({
              ai: { ...(current.ai as any), e621ApiKey: cipher } as any
            } as Partial<VaultSettings>)
          } catch (err) {
            console.warn('[AI] Could not persist e621 key:', err)
          }
        }
      }
    } else if (savedE621Key && !isCipherText(savedE621Key) && isSecureStorageAvailable()) {
      try {
        const cipher = encryptString(decryptedE621)
        const current = getSettings() as VaultSettings
        updateSettings({
          ai: { ...(current.ai as any), e621ApiKey: cipher } as any
        } as Partial<VaultSettings>)
      } catch (err) {
        console.warn('[AI] Could not migrate e621 key:', err)
      }
    }

    // Username — plaintext, simple "first-run import from file".
    const currentUsername = (savedSettings?.ai as any)?.e621Username || ''
    if (!currentUsername) {
      const fileUsername = loadE621UsernameFromDevEnv()
      if (fileUsername) {
        const current = getSettings() as VaultSettings
        updateSettings({
          ai: { ...(current.ai as any), e621Username: fileUsername } as any
        } as Partial<VaultSettings>)
        console.log(`[AI] Loaded e621 username from dev .api-keys.env: ${fileUsername}`)
      }
    }
    if (decryptedE621) {
      console.log(`[AI] e621 key configured (ends "${decryptedE621.slice(-4)}")`)
    }
  })()

  // rule34.xxx credentials — URL-param auth pair.
  ;(() => {
    const savedRule34Key = (savedSettings?.ai as any)?.rule34ApiKey || ''
    let decryptedRule34 = decryptString(savedRule34Key)
    if (!decryptedRule34) {
      const fileKey = loadRule34KeyFromDevEnv()
      if (fileKey) {
        decryptedRule34 = fileKey
        if (isSecureStorageAvailable()) {
          try {
            const cipher = encryptString(fileKey)
            const current = getSettings() as VaultSettings
            updateSettings({
              ai: { ...(current.ai as any), rule34ApiKey: cipher } as any
            } as Partial<VaultSettings>)
            console.log(`[AI] Loaded rule34 API key from dev .api-keys.env (ends "${fileKey.slice(-4)}")`)
          } catch (err) {
            console.warn('[AI] Could not persist rule34 key:', err)
          }
        }
      }
    }
    const currentUserId = (savedSettings?.ai as any)?.rule34UserId || ''
    if (!currentUserId) {
      const fileUserId = loadRule34UserIdFromDevEnv()
      if (fileUserId) {
        const current = getSettings() as VaultSettings
        updateSettings({
          ai: { ...(current.ai as any), rule34UserId: fileUserId } as any
        } as Partial<VaultSettings>)
        console.log(`[AI] Loaded rule34 user_id from dev .api-keys.env: ${fileUserId}`)
      }
    }
    if (decryptedRule34) {
      console.log(`[AI] rule34 credentials configured (user_id=${currentUserId || (loadRule34UserIdFromDevEnv() ?? '?')})`)
    }
  })()

  // RapidAPI key + xnxx host. Used by the PornHub trending source and
  // by tube-url-resolver for xnxx /download lookups. The key is shared
  // across all RapidAPI endpoints subscribed under the user's account.
  ;(() => {
    const savedRapid = (savedSettings?.ai as any)?.rapidApiKey || ''
    let decryptedRapid = decryptString(savedRapid)
    if (!decryptedRapid) {
      const fileKey = loadRapidApiKeyFromDevEnv()
      if (fileKey) {
        decryptedRapid = fileKey
        if (isSecureStorageAvailable()) {
          try {
            const cipher = encryptString(fileKey)
            const current = getSettings() as VaultSettings
            updateSettings({
              ai: { ...(current.ai as any), rapidApiKey: cipher } as any
            } as Partial<VaultSettings>)
            console.log(`[AI] Loaded RapidAPI key from dev .api-keys.env (ends "${fileKey.slice(-4)}")`)
          } catch (err) {
            console.warn('[AI] Could not persist RapidAPI key:', err)
          }
        }
      }
    }
    // xnxx host override (plaintext). Always prefer the file value when
    // present and different from saved — editing .api-keys.env should
    // take effect on next restart without needing the in-app "Reload"
    // button. This matches the dev-loop the env-file is designed for.
    const currentXnxxHost = (savedSettings?.ai as any)?.rapidApiXnxxHost || ''
    const fileHost = loadRapidApiXnxxHostFromDevEnv()
    if (fileHost && fileHost !== currentXnxxHost) {
      const current = getSettings() as VaultSettings
      updateSettings({
        ai: { ...(current.ai as any), rapidApiXnxxHost: fileHost } as any
      } as Partial<VaultSettings>)
      console.log(`[AI] Loaded RapidAPI xnxx host from .api-keys.env: ${fileHost}${currentXnxxHost ? ` (was: ${currentXnxxHost})` : ''}`)
    }
    if (decryptedRapid) {
      // Set the decrypted key into the in-memory settings cache so
      // booru-client can read it directly via getSettings().ai.rapidApiKey
      // without round-tripping through decryptString every call.
      // Note: this MUTATES the cached settings object. Acceptable since
      // we only do it once at startup.
      try {
        const current = getSettings() as VaultSettings
        ;(current.ai as any).rapidApiKey = decryptedRapid
      } catch { /* ignore */ }
      console.log(`[AI] RapidAPI key configured (ends "${decryptedRapid.slice(-4)}")`)
    }
  })()

  // Danbooru / AIBooru / Gelbooru / Bluesky — auto-import from
  // .api-keys.env when settings don't already have credentials.
  // Each pair (username + key) is independent; missing one doesn't
  // block the others. All values are stored plaintext in settings —
  // they're not as sensitive as Venice / RapidAPI, and they need to
  // be sent in clear in HTTP basic auth headers anyway.
  ;(() => {
    const importPair = (
      siteName: string,
      settingsUserKey: string,
      settingsKeyKey: string,
      envUserLoader: () => string | null,
      envKeyLoader: () => string | null,
    ) => {
      const ai = (getSettings() as VaultSettings).ai as any
      if (ai?.[settingsUserKey] && ai?.[settingsKeyKey]) return  // already configured
      const user = envUserLoader()
      const key = envKeyLoader()
      if (!user || !key) return
      try {
        const current = (getSettings() as VaultSettings).ai as any
        updateSettings({
          ai: { ...current, [settingsUserKey]: user, [settingsKeyKey]: key } as any
        } as Partial<VaultSettings>)
        console.log(`[AI] ${siteName} credentials loaded from .api-keys.env (user=${user})`)
      } catch (err) {
        console.warn(`[AI] Could not persist ${siteName} credentials:`, err)
      }
    }
    importPair('Danbooru', 'danbooruUsername', 'danbooruApiKey',
      loadDanbooruUsernameFromDevEnv, loadDanbooruKeyFromDevEnv)
    importPair('AIBooru', 'aibooruUsername', 'aibooruApiKey',
      loadAibooruUsernameFromDevEnv, loadAibooruKeyFromDevEnv)
    importPair('Gelbooru', 'gelbooruUserId', 'gelbooruApiKey',
      loadGelbooruUserIdFromDevEnv, loadGelbooruKeyFromDevEnv)
    importPair('Bluesky', 'blueskyHandle', 'blueskyAppPassword',
      loadBlueskyHandleFromDevEnv, loadBlueskyAppPasswordFromDevEnv)
  })()

  // Auto-load the user's saved porn-domains blocklist from settings.
  // Without this, every restart drops the user's upload because the
  // domain-detector only holds it in module state. Sync import to
  // avoid races with the first batch of media that gets queued.
  ;(async () => {
    try {
      const { getSettings } = await import('../../settings')
      const aiSettings = getSettings().ai
      const savedPath = (aiSettings as any)?.userDomainsListPath
      if (savedPath && typeof savedPath === 'string') {
        const fs = await import('node:fs')
        if (fs.existsSync(savedPath)) {
          const { loadUserDomainsList } = await import('./domain-detector')
          const result = loadUserDomainsList(savedPath)
          console.log(`[DomainDetector] Auto-loaded ${result.loaded} domains from saved path on startup`)
        } else {
          console.warn(`[DomainDetector] Saved domains list path missing: ${savedPath}`)
        }
      }
    } catch (err) {
      console.warn('[DomainDetector] Auto-load failed:', err)
    }
  })()

  registerIpcHandlers(db, mainWindow)
}

function registerIpcHandlers(db: DB, mainWindow: BrowserWindow | null): void {
  // Check if ONNX models are downloaded
  ipcMain.handle('ai:check-models', async () => {
    if (!modelDownloader) return { all_ready: false, models: [] }
    return modelDownloader.checkModels()
  })

  // Download missing ONNX models
  ipcMain.handle('ai:download-models', async () => {
    if (!modelDownloader) throw new Error('Model downloader not initialized')
    return modelDownloader.downloadModels((progress) => {
      mainWindow?.webContents.send('ai:model-download', progress)
    })
  })

  // Manual re-trigger of the auto-import path. Useful when the user
  // added/changed the key in C:\dev\.api-keys.env AFTER vault started,
  // or when the auto-import on startup didn't fire (file added later,
  // permissions issue, etc.). Returns the masked preview on success so
  // the UI can confirm.
  ipcMain.handle('ai:reload-keys-from-file', async () => {
    const fileKey = loadVeniceKeyFromDevEnv()
    if (!fileKey) {
      return { ok: false, reason: 'no_key_in_file', message: 'No VENICE_API_KEY found in C:\\dev\\.api-keys.env (or fallback locations).' }
    }
    if (!tier2Vision) {
      return { ok: false, reason: 'tier2_not_initialized', message: 'AI subsystem not ready.' }
    }
    tier2Vision.configure({ apiKey: fileKey })
    let saved = false, encrypted = false
    if (isSecureStorageAvailable()) {
      try {
        const cipher = encryptString(fileKey)
        const current = getSettings() as VaultSettings
        updateSettings({
          ai: { ...current.ai, veniceApiKey: cipher, tier2Enabled: true }
        } as Partial<VaultSettings>)
        saved = true
        encrypted = true
      } catch (err) {
        console.warn('[AI] Could not persist reloaded key:', err)
      }
    }
    console.log('[AI] Reloaded Venice API key from .api-keys.env')
    return {
      ok: true,
      saved,
      encrypted,
      preview: maskedPreview(fileKey, 4),
      tier2Enabled: tier2Vision.isEnabled(),
    }
  })

  // Configure Tier 2 (Venice API key). Persists the key encrypted via
  // Electron's safeStorage (DPAPI on Windows / Keychain on macOS / libsecret
  // on Linux). If encryption isn't available we still configure the in-memory
  // session but refuse to persist — caller can re-enter on next launch.
  ipcMain.handle('ai:configure-tier2', async (_ev, config: { apiKey?: string }) => {
    if (!tier2Vision) throw new Error('Tier 2 not initialized')
    tier2Vision.configure(config)

    if (config.apiKey) {
      const current = getSettings() as VaultSettings
      let stored: string
      try {
        stored = encryptString(config.apiKey)
      } catch (err) {
        console.warn('[AI] safeStorage unavailable, NOT persisting key:', err)
        return { saved: false, encrypted: false }
      }
      updateSettings({
        ai: {
          ...current.ai,
          veniceApiKey: stored,
          tier2Enabled: true,
        }
      } as Partial<VaultSettings>)
      console.log('[AI] Venice API key saved (encrypted)')
      return { saved: true, encrypted: true }
    }
    return { saved: false, encrypted: false }
  })

  // Clear the saved Venice API key. Removes both ciphertext and any legacy
  // plaintext, and resets the in-memory session.
  ipcMain.handle('ai:clear-tier2', async () => {
    const current = getSettings() as VaultSettings
    updateSettings({
      ai: {
        ...current.ai,
        veniceApiKey: '',
        tier2Enabled: false,
      }
    } as Partial<VaultSettings>)
    if (tier2Vision) tier2Vision.configure({ apiKey: undefined })
    console.log('[AI] Venice API key cleared')
    return { cleared: true }
  })

  // Get Tier 2 configuration status. NEVER returns the plaintext key — only
  // a masked tail-preview the UI can display so the user can see "yes, the
  // right key is saved" without exposing it on screen.
  ipcMain.handle('ai:get-tier2-config', async () => {
    const savedSettings = getSettings() as VaultSettings
    const stored = savedSettings?.ai?.veniceApiKey || ''
    const plain = decryptString(stored)
    const configured = !!plain && (tier2Vision?.isEnabled() || false)
    return {
      configured,
      preview: plain ? maskedPreview(plain) : '',
      encrypted: isCipherText(stored),
      tier2Enabled: !!savedSettings?.ai?.tier2Enabled,
      disableTier1Tags: !!(savedSettings?.ai as any)?.disableTier1Tags,
    }
  })

  // TpDB API key configuration. Same shape as Venice — never returns
  // the raw key, only a masked tail preview. Encryption-aware.
  ipcMain.handle('ai:tpdb-get-config', async () => {
    const savedSettings = getSettings() as VaultSettings
    const stored = (savedSettings?.ai as any)?.tpdbApiKey || ''
    const plain = decryptString(stored)
    return {
      configured: !!plain,
      preview: plain ? maskedPreview(plain) : '',
      encrypted: isCipherText(stored),
    }
  })

  ipcMain.handle('ai:tpdb-configure', async (_ev, config: { apiKey?: string }) => {
    const apiKey = (config?.apiKey ?? '').trim()
    if (!apiKey) return { ok: false, error: 'API key is required' }
    let stored = apiKey
    let encrypted = false
    if (isSecureStorageAvailable()) {
      try {
        stored = encryptString(apiKey)
        encrypted = true
      } catch (err) {
        console.warn('[AI] Could not encrypt TpDB key:', err)
      }
    }
    const current = getSettings() as VaultSettings
    updateSettings({
      ai: { ...(current.ai as any), tpdbApiKey: stored } as any
    } as Partial<VaultSettings>)
    return { ok: true, saved: true, encrypted, preview: maskedPreview(apiKey) }
  })

  ipcMain.handle('ai:tpdb-clear', async () => {
    const current = getSettings() as VaultSettings
    updateSettings({
      ai: { ...(current.ai as any), tpdbApiKey: '' } as any
    } as Partial<VaultSettings>)
    return { cleared: true }
  })

  // Rule 34 booru search + download. Returns search hits as the
  // canonical Booru post shape; downloadPost fetches the file to a
  // temp path and immediately hands it to media:importFiles to land
  // in the user's library. No auth — rule34.xxx's public API is
  // open. Other booru engines can hook in later via additional
  // search* IPCs.
  ipcMain.handle('booru:search-rule34', async (_ev, args: { tags: string; perPage?: number; page?: number }) => {
    try {
      const { searchRule34 } = await import('./booru-client')
      const result = await searchRule34(args?.tags ?? '', {
        perPage: args?.perPage ?? 30,
        page: args?.page ?? 0,
      })
      return { ok: true, ...result }
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err), posts: [], hasMore: false, page: 0 }
    }
  })

  // Multi-source booru search. Source selects which API to hit.
  // e621 needs credentials (settings.ai.e621Username + e621ApiKey).
  // safebooru / yande.re / konachan work without auth.
  // rule34 currently 401s — listed for when you have a key.
  ipcMain.handle('booru:search', async (_ev, args: {
    source: 'e621' | 'rule34' | 'safebooru' | 'yande.re' | 'konachan' | 'tbib' | 'xbooru' | 'hypnohub' | 'eporner' | 'redtube' | 'pornhub' | 'xnxx'
    tags: string
    perPage?: number
    page?: number
  }) => {
    try {
      const { searchBooru } = await import('./booru-client')
      const result = await searchBooru(args.source, args?.tags ?? '', {
        perPage: args?.perPage ?? 30,
        page: args?.page ?? 0,
      })
      return { ok: true, ...result }
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err), posts: [], hasMore: false, page: 0 }
    }
  })

  // Mixed multi-source search — fan out to N sources, merge results,
  // sort by score desc. "all" mode lets the user search every source
  // they have credentials for in one shot.
  ipcMain.handle('booru:search-multi', async (_ev, args: {
    sources: Array<'e621' | 'rule34' | 'safebooru' | 'yande.re' | 'konachan' | 'tbib' | 'xbooru' | 'hypnohub' | 'eporner' | 'redtube' | 'pornhub' | 'xnxx'>
    tags: string
    perPage?: number
    page?: number
  }) => {
    const { searchBooru } = await import('./booru-client')
    const merged: any[] = []
    const errors: Array<{ source: string; error: string }> = []
    const sources = args?.sources ?? [
      'e621', 'rule34', 'safebooru', 'yande.re', 'konachan',
      'tbib', 'xbooru', 'hypnohub', 'eporner', 'redtube', 'pornhub', 'xnxx',
    ]
    // Each source gets a FULL per-source pull, then we merge. Was
    // splitting perPage across sources which gave 6/source on a 60-cap
    // — way too thin. Now: full perPage per source.
    const perSource = args?.perPage ?? 30
    const page = Math.max(0, Math.round(Number(args?.page) || 0))
    const perSourceCounts: Record<string, number> = {}
    await Promise.all(sources.map(async (source) => {
      try {
        const r = await searchBooru(source, args?.tags ?? '', { perPage: perSource, page })
        perSourceCounts[source] = r.posts.length
        for (const p of r.posts) {
          merged.push({ ...p, source_booru: source })
        }
      } catch (err: any) {
        perSourceCounts[source] = 0
        errors.push({ source, error: err?.message ?? String(err) })
      }
    }))
    merged.sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    // hasMore = true when at least one source filled its full per-source quota.
    const hasMore = Object.values(perSourceCounts).some((c) => c >= perSource)
    console.log(`[Booru multi] page=${page}, per-source counts:`, perSourceCounts)
    return { ok: true, posts: merged, errors, perSourceCounts, hasMore, page }
  })

  // Paste-URL resolver. Accepts any tube URL → returns either:
  //   - { source: 'xnxx',   videoUrl: <direct MP4>,    thumbUrl, ... }
  //   - { source: 'embed',  videoUrl: <embed iframe>, ... }
  //   - null when the URL isn't recognized (caller falls through to
  //     the existing yt-dlp Downloads tab).
  ipcMain.handle('booru:resolve-url', async (_ev, url: string) => {
    try {
      const { resolveTubeUrl } = await import('./tube-url-resolver')
      const result = await resolveTubeUrl(url)
      return result ?? { unresolved: true, sourceUrl: url }
    } catch (err: any) {
      return { error: err?.message ?? String(err), sourceUrl: url }
    }
  })

  ipcMain.handle('booru:download-to-library', async (_ev, post: any) => {
    try {
      // xnxx posts: route through the xnxx /download RapidAPI for the
      // real direct MP4. xnxx caps at 360p but it's still a clean
      // direct download (no HLS, no transcoding wait).
      const isXnxx = String(post?.source ?? '').includes('xnxx.com')
        || String(post?.file_url ?? '').includes('xnxx.com')
        || post?.source_booru === 'xnxx'
      if (isXnxx) {
        const { resolveXnxxDownload, downloadBooruPost } = await import('./booru-client')
        const viewUrl = post.source || post.file_url
        const resolved = await resolveXnxxDownload(viewUrl)
        if (!resolved) {
          return { ok: false, error: 'xnxx download lookup failed (check RapidAPI key/subscription)' }
        }
        const synthetic = { ...post, file_url: resolved.directUrl }
        const { tmpPath, bytes, filename } = await downloadBooruPost(synthetic)
        const { getMediaDirs } = await import('../../settings')
        const dirs = getMediaDirs()
        if (!dirs.length) {
          try { fs.unlinkSync(tmpPath) } catch { /* ignore */ }
          return { ok: false, error: 'No media directories configured' }
        }
        const path = await import('node:path')
        const xnxxRequested = typeof post?.targetDir === 'string' ? post.targetDir : ''
        const targetDir = (xnxxRequested && dirs.includes(xnxxRequested)) ? xnxxRequested : dirs[0]
        const idMatch = String(viewUrl).match(/video-(\w+)/)
        const id = idMatch?.[1] ?? 'video'
        const ext = path.extname(filename) || '.mp4'
        let targetPath = path.join(targetDir, `xnxx-${id}-${resolved.resolution}${ext}`)
        let counter = 1
        while (fs.existsSync(targetPath)) {
          targetPath = path.join(targetDir, `xnxx-${id}-${resolved.resolution}_${counter}${ext}`)
          counter++
        }
        try { fs.renameSync(tmpPath, targetPath) }
        catch {
          fs.copyFileSync(tmpPath, targetPath)
          try { fs.unlinkSync(tmpPath) } catch { /* ignore */ }
        }
        return { ok: true, savedPath: targetPath, bytes, filename: path.basename(targetPath) }
      }

      // PornHub posts have embed URLs as file_url — route through the
      // RapidAPI /api/download endpoint to get a real direct MP4 URL,
      // then download via the standard binary fetch. The API initiates
      // transcoding and warns 20-300s; we poll inside resolvePornhubDownload.
      const isPornhub = String(post?.source ?? '').includes('pornhub.com')
        || String(post?.file_url ?? '').includes('pornhub.com')
        || post?.source_booru === 'pornhub'
      if (isPornhub) {
        const { resolvePornhubDownload, downloadBooruPost } = await import('./booru-client')
        const viewUrl = post.source || post.file_url
        const resolved = await resolvePornhubDownload(viewUrl, { maxWaitMs: 240_000 })
        if (!resolved) {
          return { ok: false, error: 'PornHub download URL did not become ready (file may still be transcoding)' }
        }
        console.log(`[PornHub download] resolved ${resolved.resolution} (${resolved.codec ?? 'unknown codec'})`)
        // Reuse downloadBooruPost by passing a synthetic post with the
        // direct URL as file_url.
        const synthetic = { ...post, file_url: resolved.directUrl }
        const { tmpPath, bytes, filename } = await downloadBooruPost(synthetic)
        const { getMediaDirs } = await import('../../settings')
        const dirs = getMediaDirs()
        if (!dirs.length) {
          try { fs.unlinkSync(tmpPath) } catch { /* ignore */ }
          return { ok: false, error: 'No media directories configured' }
        }
        const path = await import('node:path')
        const phRequested = typeof post?.targetDir === 'string' ? post.targetDir : ''
        const targetDir = (phRequested && dirs.includes(phRequested)) ? phRequested : dirs[0]
        // Use a meaningful filename: pornhub-<viewkey>-<resolution>.mp4
        const viewkeyMatch = String(viewUrl).match(/viewkey=(\w+)/)
        const viewkey = viewkeyMatch?.[1] ?? 'video'
        const ext = path.extname(filename) || '.mp4'
        let targetPath = path.join(targetDir, `pornhub-${viewkey}-${resolved.resolution.replace('x', 'x')}${ext}`)
        let counter = 1
        while (fs.existsSync(targetPath)) {
          targetPath = path.join(targetDir, `pornhub-${viewkey}-${resolved.resolution}_${counter}${ext}`)
          counter++
        }
        try { fs.renameSync(tmpPath, targetPath) }
        catch {
          fs.copyFileSync(tmpPath, targetPath)
          try { fs.unlinkSync(tmpPath) } catch { /* ignore */ }
        }
        return { ok: true, savedPath: targetPath, bytes, filename: path.basename(targetPath) }
      }

      const { downloadBooruPost } = await import('./booru-client')
      const { tmpPath, bytes, filename } = await downloadBooruPost(post)
      // Hand the tmp file to the existing importFiles handler. We
      // invoke its logic via the same path the renderer uses so the
      // file lands in the canonical media dir + gets scanned + queued.
      const { getMediaDirs } = await import('../../settings')
      const dirs = getMediaDirs()
      if (!dirs.length) {
        try { fs.unlinkSync(tmpPath) } catch { /* ignore */ }
        return { ok: false, error: 'No media directories configured — add one in Settings first' }
      }
      const path = await import('node:path')
      // Honor a renderer-requested target directory when it's still a
      // valid media dir; otherwise fall back to dirs[0]. This lets the
      // Browse UI route saves to e.g. an AI-gen-specific folder.
      const requestedDir = typeof post?.targetDir === 'string' ? post.targetDir : ''
      const targetDir = (requestedDir && dirs.includes(requestedDir)) ? requestedDir : dirs[0]
      // Custom filename template substitution. Renderer passes
      // post.filenameTemplate with placeholders {source} {id} {topTags3}
      // {ext} {date}. Empty/missing means use the source default.
      const ext = path.extname(filename)
      let resolvedFilename = filename
      const tpl = typeof post?.filenameTemplate === 'string' ? post.filenameTemplate.trim() : ''
      if (tpl) {
        const topTags = String(post?.tags ?? '').split(/\s+/).filter(Boolean).slice(0, 3).join('_').replace(/[^A-Za-z0-9_-]/g, '_')
        const today = new Date()
        const ymd = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`
        let candidate = tpl
          .replace(/\{source\}/g, String(post?.source_booru ?? 'browse'))
          .replace(/\{id\}/g, String(post?.id ?? 'unknown'))
          .replace(/\{topTags3\}/g, topTags || 'untagged')
          .replace(/\{date\}/g, ymd)
          .replace(/\{ext\}/g, ext || '')
        // Strip illegal Windows path chars; ensure extension present.
        candidate = candidate.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').slice(0, 200)
        if (!candidate.toLowerCase().endsWith(ext.toLowerCase()) && ext) candidate += ext
        if (candidate) resolvedFilename = candidate
      }
      let targetPath = path.join(targetDir, resolvedFilename)
      let counter = 1
      const baseName = path.basename(resolvedFilename, ext)
      while (fs.existsSync(targetPath)) {
        targetPath = path.join(targetDir, `${baseName}_${counter}${ext}`)
        counter++
      }
      try {
        fs.renameSync(tmpPath, targetPath)
      } catch {
        // renameSync fails across devices — fall back to copy+unlink.
        fs.copyFileSync(tmpPath, targetPath)
        try { fs.unlinkSync(tmpPath) } catch { /* ignore */ }
      }
      // Synchronously ingest the new file so the media row exists
      // before we try to apply tags. The periodic scanner would catch
      // it eventually, but waiting on that race is the wrong default
      // when we have explicit per-file knowledge.
      try {
        const { upsertOne } = await import('../../scanner')
        await upsertOne(db, targetPath)
      } catch (err) {
        console.warn('[booru:download] eager upsert failed (scanner sweep will retry):', err)
      }

      // Auto-tag with provenance: every Browse-saved post gets
      // `source:browse` so the user can later filter their library by
      // "things I downloaded via Browse" and `source:<booru>` for the
      // specific source. Cheap addition; doesn't conflict with any
      // canonical-vocab rules because of the `source:` prefix.
      try {
        const mediaRow = db.getMediaByPath(targetPath)
        if (mediaRow) {
          try { db.addTagToMedia(mediaRow.id, 'source:browse') } catch { /* ignore dup */ }
          if (post?.source_booru) {
            try { db.addTagToMedia(mediaRow.id, `source:${String(post.source_booru).toLowerCase()}`) } catch { /* ignore */ }
          }
        }
      } catch (err) {
        console.warn('[booru:download] auto-provenance tags failed:', err)
      }

      // AI-normalize the source's raw tag string into Vault canonical
      // vocab. The cheap pass alone (canonical-tags rules) already
      // makes a big difference; Venice handles dialect mapping when
      // configured. Side-effect: writes a `.boorutags.json` sidecar
      // next to the saved file so a future backfill IPC can re-run
      // normalization without re-downloading.
      try {
        const sourceTags = String(post?.tags ?? '').trim()
        if (sourceTags) {
          const sidecarPath = targetPath + '.boorutags.json'
          try {
            fs.writeFileSync(sidecarPath, JSON.stringify({
              source: post?.source ?? null,
              source_booru: post?.source_booru ?? null,
              rawTags: sourceTags,
              postId: post?.id ?? null,
              savedAt: Date.now(),
            }, null, 2), 'utf8')
          } catch { /* sidecar is best-effort */ }

          const mediaRow = db.getMediaByPath(targetPath)
          if (mediaRow) {
            const { normalizeBooruTags } = await import('./booru-tag-normalizer')
            const existing = db.listMediaTags(mediaRow.id).map((t: any) => t.name)
            const result = await normalizeBooruTags(sourceTags, {
              useVenice: true,
              existingTags: existing,
            })
            // Remove superseded tags (legacy/junk forms displaced by
            // canonical equivalents).
            for (const name of result.remove) {
              try { db.removeTagFromMedia(mediaRow.id, name) } catch { /* ignore */ }
            }
            for (const name of result.tags) {
              try { db.addTagToMedia(mediaRow.id, name) } catch { /* ignore */ }
            }
            // Feed the (filename, normalized tags) pair to the
            // filename-classifier so future similar content (same
            // tokens, same source naming pattern) gets these tags as
            // priors automatically. This is the "AI learns from
            // media↔tag correlations" signal.
            if (result.tags.length > 0) {
              try {
                const { incrementWithSample } = await import('./filename-classifier')
                incrementWithSample(mediaRow.filename, result.tags)
              } catch (err) {
                console.warn('[booru:download] filename-classifier sample failed:', err)
              }
            }
            console.log(`[booru:download] tag normalize: ${result.tags.length} kept, ${result.dropped.length} dropped, ${result.remove.length} superseded (venice=${result.veniceUsed})`)
          }
        }
      } catch (err) {
        console.warn('[booru:download] tag normalize failed:', err)
      }

      return { ok: true, savedPath: targetPath, bytes, filename: path.basename(targetPath) }
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })

  // Backfill IPC: re-run booru tag normalization for every media file
  // that has a `.boorutags.json` sidecar. Useful after canonical-tags
  // is updated or Venice prompt is improved.
  ipcMain.handle('booru:backfill-tags', async (_ev, opts?: { limit?: number; useVenice?: boolean }) => {
    const { getMediaDirs } = await import('../../settings')
    const dirs = getMediaDirs()
    const limit = Math.max(1, Math.min(10000, opts?.limit ?? 5000))
    const useVenice = opts?.useVenice !== false

    const fsModule = await import('node:fs')
    const pathModule = await import('node:path')
    const { normalizeBooruTags } = await import('./booru-tag-normalizer')

    let scanned = 0
    let updated = 0
    let failed = 0
    let veniceCalls = 0

    function* walk(dir: string): Generator<string> {
      let entries: import('node:fs').Dirent[]
      try { entries = fsModule.readdirSync(dir, { withFileTypes: true }) }
      catch { return }
      for (const entry of entries) {
        const full = pathModule.join(dir, entry.name)
        if (entry.isDirectory()) yield* walk(full)
        else if (entry.isFile() && entry.name.endsWith('.boorutags.json')) yield full
      }
    }

    for (const dir of dirs) {
      for (const sidecarPath of walk(dir)) {
        if (scanned >= limit) break
        scanned++
        try {
          const sidecar = JSON.parse(fsModule.readFileSync(sidecarPath, 'utf8'))
          const mediaPath = sidecarPath.replace(/\.boorutags\.json$/, '')
          const mediaRow = db.getMediaByPath(mediaPath)
          if (!mediaRow) continue
          const existing = db.listMediaTags(mediaRow.id).map((t: any) => t.name)
          const result = await normalizeBooruTags(sidecar.rawTags ?? '', {
            useVenice,
            existingTags: existing,
          })
          if (result.veniceUsed) veniceCalls++
          for (const name of result.remove) {
            try { db.removeTagFromMedia(mediaRow.id, name) } catch { /* ignore */ }
          }
          for (const name of result.tags) {
            try { db.addTagToMedia(mediaRow.id, name) } catch { /* ignore */ }
          }
          updated++
        } catch (err) {
          failed++
          console.warn('[booru:backfill] failed for sidecar:', sidecarPath, err)
        }
      }
      if (scanned >= limit) break
    }

    return { ok: true, scanned, updated, failed, veniceCalls }
  })

  // TpDB lookup IPCs — health probe, free-text search, hash lookup.
  // Used by the future Performer Card / "match scene" UI.
  ipcMain.handle('ai:tpdb-health', async () => {
    const { getTpDBClient } = await import('./tpdb-client')
    const client = await getTpDBClient()
    if (!client) return { ok: false, reason: 'no_key' }
    const detail = await client.healthDetailed()
    return { ok: detail.ok, reason: detail.reason, endpoint: detail.endpoint }
  })
  ipcMain.handle('ai:tpdb-search', async (_ev, query: string) => {
    const { getTpDBClient } = await import('./tpdb-client')
    const client = await getTpDBClient()
    if (!client) return { ok: false, reason: 'no_key', results: [] }
    try {
      const results = await client.searchScenes(query, 10)
      return { ok: true, results }
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err), results: [] }
    }
  })
  ipcMain.handle('ai:tpdb-search-performers', async (_ev, query: string) => {
    const { getTpDBClient } = await import('./tpdb-client')
    const client = await getTpDBClient()
    if (!client) return { ok: false, reason: 'no_key', performers: [] }
    try {
      const performers = await client.searchPerformers(query, 12)
      return { ok: true, performers }
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err), performers: [] }
    }
  })
  ipcMain.handle('ai:tpdb-get-performer', async (_ev, id: string) => {
    const { getTpDBClient } = await import('./tpdb-client')
    const client = await getTpDBClient()
    if (!client) return { ok: false, reason: 'no_key' }
    try {
      const performer = await client.getPerformer(id)
      return { ok: true, performer }
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })

  ipcMain.handle('ai:tpdb-find-by-hash', async (_ev, hash: string) => {
    const { getTpDBClient } = await import('./tpdb-client')
    const client = await getTpDBClient()
    if (!client) return { ok: false, reason: 'no_key' }
    try {
      const scene = await client.findByHash(hash)
      return { ok: true, scene }
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })

  // e621 credentials IPCs. Same masked-preview pattern as Venice/TpDB
  // but with username as a separate plaintext field.
  ipcMain.handle('ai:e621-get-config', async () => {
    const savedSettings = getSettings() as VaultSettings
    const stored = ((savedSettings?.ai as any)?.e621ApiKey ?? '') as string
    const plain = decryptString(stored)
    const username = ((savedSettings?.ai as any)?.e621Username ?? '') as string
    return {
      configured: !!plain && !!username,
      hasKey: !!plain,
      hasUsername: !!username,
      preview: plain ? maskedPreview(plain) : '',
      username,
      encrypted: isCipherText(stored),
    }
  })
  ipcMain.handle('ai:e621-configure', async (_ev, config: { apiKey?: string; username?: string }) => {
    const current = getSettings() as VaultSettings
    const patch: any = { ...(current.ai as any) }
    if (typeof config?.apiKey === 'string' && config.apiKey.trim()) {
      let stored = config.apiKey.trim()
      if (isSecureStorageAvailable()) {
        try { stored = encryptString(stored) } catch { /* keep plaintext */ }
      }
      patch.e621ApiKey = stored
    }
    if (typeof config?.username === 'string') {
      patch.e621Username = config.username.trim()
    }
    updateSettings({ ai: patch } as Partial<VaultSettings>)
    const newPlain = decryptString(patch.e621ApiKey ?? '')
    return {
      ok: true,
      preview: newPlain ? maskedPreview(newPlain) : '',
      username: patch.e621Username ?? '',
    }
  })
  ipcMain.handle('ai:e621-clear', async () => {
    const current = getSettings() as VaultSettings
    updateSettings({
      ai: { ...(current.ai as any), e621ApiKey: '', e621Username: '' } as any
    } as Partial<VaultSettings>)
    return { cleared: true }
  })
  ipcMain.handle('ai:e621-reload-from-file', async () => {
    const fileKey = loadE621KeyFromDevEnv()
    const fileUsername = loadE621UsernameFromDevEnv()
    if (!fileKey) {
      return { ok: false, reason: 'no_key_in_file', message: 'No E621_API_KEY in C:\\dev\\.api-keys.env' }
    }
    let stored = fileKey
    let encrypted = false
    if (isSecureStorageAvailable()) {
      try {
        stored = encryptString(fileKey)
        encrypted = true
      } catch { /* fall through */ }
    }
    const current = getSettings() as VaultSettings
    updateSettings({
      ai: {
        ...(current.ai as any),
        e621ApiKey: stored,
        ...(fileUsername ? { e621Username: fileUsername } : {}),
      } as any
    } as Partial<VaultSettings>)
    return {
      ok: true,
      preview: maskedPreview(fileKey),
      username: fileUsername ?? ((current.ai as any)?.e621Username ?? ''),
      encrypted,
    }
  })

  ipcMain.handle('ai:tpdb-reload-from-file', async () => {
    const fileKey = loadTpdbKeyFromDevEnv()
    if (!fileKey) {
      return { ok: false, reason: 'no_key_in_file', message: 'No TPDB_API_KEY found in C:\\dev\\.api-keys.env' }
    }
    let stored = fileKey
    let encrypted = false
    if (isSecureStorageAvailable()) {
      try {
        stored = encryptString(fileKey)
        encrypted = true
      } catch { /* fall through with plaintext */ }
    }
    const current = getSettings() as VaultSettings
    updateSettings({
      ai: { ...(current.ai as any), tpdbApiKey: stored } as any
    } as Partial<VaultSettings>)
    return { ok: true, saved: true, encrypted, preview: maskedPreview(fileKey) }
  })

  // Toggle Tier 1 (ONNX) tag contribution to Tier 3. Doesn't disable Tier 1
  // entirely — content classification still runs. Just suppresses the WD
  // Tagger / NudeNet / CLIP tag list from reaching the matcher. User can
  // flip this when Tier 1 is producing more noise than signal.
  ipcMain.handle('ai:set-disable-tier1-tags', async (_ev, disabled: boolean) => {
    const current = getSettings() as VaultSettings
    updateSettings({
      ai: { ...(current.ai as any), disableTier1Tags: !!disabled }
    } as Partial<VaultSettings>)
    return { ok: true, disabled: !!disabled }
  })

  // Queue untagged media for processing
  ipcMain.handle('ai:queue-untagged', async () => {
    if (!processingQueue) throw new Error('Processing queue not initialized')
    return processingQueue.queueUntagged()
  })

  // Get count of untagged media (for UI badge)
  ipcMain.handle('ai:get-untagged-count', async () => {
    if (!processingQueue) return 0
    try {
      return processingQueue.getUntaggedCount()
    } catch {
      return 0
    }
  })

  // Queue specific media IDs
  ipcMain.handle('ai:queue-specific', async (_ev, mediaIds: string[]) => {
    if (!processingQueue) throw new Error('Processing queue not initialized')
    return processingQueue.queueSpecific(mediaIds)
  })

  // Queue entire library
  ipcMain.handle('ai:queue-all', async () => {
    if (!processingQueue) throw new Error('Processing queue not initialized')
    return processingQueue.queueAll()
  })

  // Re-queue specific media (resets queue state + clears prior analysis)
  ipcMain.handle('ai:requeue-specific', async (_ev, mediaIds: string[]) => {
    if (!processingQueue) throw new Error('Processing queue not initialized')
    return processingQueue.requeueMedia(mediaIds)
  })

  // Re-queue everything previously scanned (completed + failed).
  // By default we EXCLUDE items the user has already approved — re-queueing
  // those would wipe their review work. Pass { includeApproved: true } to
  // do a true library-wide reset.
  ipcMain.handle('ai:requeue-all', async (_ev, args?: { includeApproved?: boolean }) => {
    if (!processingQueue) throw new Error('Processing queue not initialized')
    return processingQueue.requeueAll(args)
  })

  // Get queue status
  ipcMain.handle('ai:queue-status', async () => {
    if (!processingQueue) throw new Error('Processing queue not initialized')
    return processingQueue.getStatus()
  })

  // Start processing
  ipcMain.handle('ai:start', async (_ev, options?: { enableTier2?: boolean; concurrency?: number; autoApproveThreshold?: number; batchLimit?: number }) => {
    if (!processingQueue) throw new Error('Processing queue not initialized')
    return processingQueue.start(options)
  })

  // Pause processing
  ipcMain.handle('ai:pause', async () => {
    if (!processingQueue) throw new Error('Processing queue not initialized')
    return processingQueue.pause()
  })

  // Resume processing
  ipcMain.handle('ai:resume', async () => {
    if (!processingQueue) throw new Error('Processing queue not initialized')
    return processingQueue.resume()
  })

  // Stop processing
  ipcMain.handle('ai:stop', async () => {
    if (!processingQueue) throw new Error('Processing queue not initialized')
    return processingQueue.stop()
  })

  // List items awaiting review
  ipcMain.handle('ai:review-list', async (_ev, options?: { limit?: number; offset?: number; status?: 'pending' | 'approved' | 'rejected' | 'all'; sort?: 'newest' | 'uncertainty' }) => {
    if (!processingQueue) throw new Error('Processing queue not initialized')
    return processingQueue.getReviewList(options)
  })

  // Approve all suggestions for a media item
  ipcMain.handle('ai:approve', async (_ev, mediaId: string) => {
    if (!processingQueue) throw new Error('Processing queue not initialized')
    return processingQueue.approve(mediaId)
  })

  // Approve with user modifications
  ipcMain.handle('ai:approve-edited', async (_ev, mediaId: string, edits: {
    selectedTagIds?: number[]
    editedTitle?: string
    newTags?: string[]
  }) => {
    if (!processingQueue) throw new Error('Processing queue not initialized')
    return processingQueue.approveEdited(mediaId, edits)
  })

  // Reject all suggestions for a media item
  ipcMain.handle('ai:reject', async (_ev, mediaId: string) => {
    if (!processingQueue) throw new Error('Processing queue not initialized')
    return processingQueue.reject(mediaId)
  })

  // Filename ML classifier — train/retrain on user's approved history.
  // Returns counts so the Utilities tab can show training status.
  ipcMain.handle('ai:filename-classifier-retrain', async () => {
    const { retrain, invalidateCache } = await import('./filename-classifier')
    invalidateCache()
    const stats = retrain(db)
    return { ok: true, ...stats }
  })
  ipcMain.handle('ai:filename-classifier-status', async () => {
    const { loadModel } = await import('./filename-classifier')
    const m = loadModel()
    return {
      samples: m.totalSamples,
      tokens: Object.keys(m.tokenCounts).length,
      tags: Object.keys(m.tagCounts).length,
      trainedAt: m.trainedAt,
    }
  })

  // Roll back the most recent approve/reject. Single-level undo —
  // captures the row + media_tags state before the decision and
  // restores both on undo. In-memory, doesn't survive restart.
  ipcMain.handle('ai:undo-last-review', async () => {
    if (!processingQueue) throw new Error('Processing queue not initialized')
    return processingQueue.undoLastReview()
  })
  ipcMain.handle('ai:undo-status', async () => {
    if (!processingQueue) return { available: false }
    return processingQueue.getUndoStatus()
  })

  // Bulk approve all pending
  ipcMain.handle('ai:bulk-approve', async () => {
    if (!processingQueue) throw new Error('Processing queue not initialized')
    return processingQueue.bulkApprove()
  })

  // Bulk reject all pending
  ipcMain.handle('ai:bulk-reject', async () => {
    if (!processingQueue) throw new Error('Processing queue not initialized')
    return processingQueue.bulkReject()
  })

  // Get processing stats
  ipcMain.handle('ai:get-stats', async () => {
    if (!processingQueue) throw new Error('Processing queue not initialized')
    return processingQueue.getStats()
  })

  // Clear all failed items
  ipcMain.handle('ai:clear-failed', async () => {
    if (!processingQueue) throw new Error('Processing queue not initialized')
    return processingQueue.clearFailed()
  })

  // Retry all failed items
  ipcMain.handle('ai:retry-failed', async () => {
    if (!processingQueue) throw new Error('Processing queue not initialized')
    return processingQueue.retryFailed()
  })

  // Purge orphan queue rows — entries pointing to deleted/missing media.
  // Fixes the "queue says 4534 but library is 700" inflation symptom.
  ipcMain.handle('ai:purge-orphans', async () => {
    if (!processingQueue) throw new Error('Processing queue not initialized')
    return processingQueue.purgeOrphans()
  })

  // Nuke the entire queue. Recovery hatch when the queue gets so out
  // of sync that selective fixes can't bring it back.
  ipcMain.handle('ai:clear-queue', async () => {
    if (!processingQueue) throw new Error('Processing queue not initialized')
    return processingQueue.clearAll()
  })

  // Re-generate just the title or description for an existing review item.
  // Uses the previously-extracted frames + tier1 tags as context. Cheaper
  // than a full re-analyze (single Venice call, no frame re-extraction)
  // and lets the user iterate on a bad title/description without
  // re-processing everything.
  const regenerateField = async (mediaId: string, field: 'title' | 'description'): Promise<string | null> => {
    if (!tier2Vision || !tier2Vision.isEnabled()) {
      throw new Error('Venice (Tier 2) not configured')
    }
    const rawDb = db.raw
    // Pull the stored analysis context — we need the frame dir, the existing
    // tier1 tags, and whatever we already had as title/description so the
    // model can iterate rather than start from scratch.
    const row = rawDb.prepare(`
      SELECT ar.suggested_title, ar.description, ar.tier1_raw_tags, ar.tier2_extra_tags,
             m.filename, m.path, m.type, m.durationSec
      FROM ai_analysis_results ar
      INNER JOIN media m ON ar.media_id = m.id
      WHERE ar.media_id = ?
    `).get(mediaId) as any
    if (!row) throw new Error('No analysis record found for this media')

    // Re-extract a small frame budget — 4 frames is enough for a fresh
    // title/description; saves API cost vs. the full 12.
    if (!frameExtractor) throw new Error('Frame extractor not initialized')
    const mediaType: 'video' | 'image' | 'gif' = row.type === 'video' ? 'video' : row.type === 'gif' ? 'gif' : 'image'
    const frames = await frameExtractor.extractFrames(row.path, mediaType, row.durationSec)
    const framePaths = frames.map(f => f.path).slice(0, 4)
    if (framePaths.length === 0) throw new Error('No frames could be extracted')

    // Existing tier1 tags become hints; existing other field stays as
    // anchor so the model iterates instead of contradicting prior work.
    let tier1Hints: string[] = []
    try {
      const parsed = JSON.parse(row.tier1_raw_tags || '[]')
      tier1Hints = Array.isArray(parsed) ? parsed.map((t: any) => t.label || t.name || String(t)).filter(Boolean) : []
    } catch {}

    const result = await tier2Vision.regenerateField({
      framePaths,
      mediaType,
      filename: row.filename,
      tier1Tags: tier1Hints,
      currentTitle: row.suggested_title,
      currentDescription: row.description,
      field,
    })

    // Persist the new value into ai_analysis_results.
    if (field === 'title') {
      rawDb.prepare('UPDATE ai_analysis_results SET suggested_title = ? WHERE media_id = ?').run(result, mediaId)
    } else {
      rawDb.prepare('UPDATE ai_analysis_results SET description = ? WHERE media_id = ?').run(result, mediaId)
    }
    // Cleanup re-extracted frames in the background.
    setTimeout(() => { try { frameExtractor?.cleanupAll() } catch {} }, 500)

    return result
  }

  ipcMain.handle('ai:regenerate-title', async (_ev, mediaId: string) => {
    return regenerateField(mediaId, 'title')
  })
  ipcMain.handle('ai:regenerate-description', async (_ev, mediaId: string) => {
    return regenerateField(mediaId, 'description')
  })

  // Streaming variants — emit `ai:venice-chunk` events for each token
  // slice so the renderer can show a typewriter effect on regenerate.
  // The event payload: { mediaId, field, delta, accumulated, streamId }.
  // A final `ai:venice-stream-end` event with the cleaned result fires
  // when the stream completes.
  ipcMain.handle('ai:regenerate-field-stream', async (ev, args: { mediaId: string; field: 'title' | 'description' }) => {
    if (!tier2Vision || !tier2Vision.isEnabled()) {
      throw new Error('Venice (Tier 2) not configured')
    }
    const { mediaId, field } = args
    const streamId = `${mediaId}-${field}-${Date.now()}`
    const rawDb = db.raw
    const row = rawDb.prepare(`
      SELECT ar.suggested_title, ar.description, ar.tier1_raw_tags, ar.tier2_extra_tags,
             m.filename, m.path, m.type, m.durationSec
      FROM ai_analysis_results ar
      INNER JOIN media m ON ar.media_id = m.id
      WHERE ar.media_id = ?
    `).get(mediaId) as any
    if (!row) throw new Error('No analysis record found for this media')
    if (!frameExtractor) throw new Error('Frame extractor not initialized')

    const mediaType: 'video' | 'image' | 'gif' = row.type === 'video' ? 'video' : row.type === 'gif' ? 'gif' : 'image'
    const frames = await frameExtractor.extractFrames(row.path, mediaType, row.durationSec)
    const framePaths = frames.map((f: any) => f.path).slice(0, 4)
    if (framePaths.length === 0) throw new Error('No frames could be extracted')

    let tier1Hints: string[] = []
    try {
      const parsed = JSON.parse(row.tier1_raw_tags || '[]')
      tier1Hints = Array.isArray(parsed) ? parsed.map((t: any) => t.label || t.name || String(t)).filter(Boolean) : []
    } catch { /* ignore */ }

    const result = await tier2Vision.regenerateFieldStream({
      framePaths,
      mediaType,
      filename: row.filename,
      tier1Tags: tier1Hints,
      currentTitle: row.suggested_title,
      currentDescription: row.description,
      field,
      onChunk: (delta, accumulated) => {
        try {
          ev.sender.send('ai:venice-chunk', { streamId, mediaId, field, delta, accumulated })
        } catch { /* sender gone */ }
      },
    })

    if (field === 'title') {
      rawDb.prepare('UPDATE ai_analysis_results SET suggested_title = ? WHERE media_id = ?').run(result, mediaId)
    } else {
      rawDb.prepare('UPDATE ai_analysis_results SET description = ? WHERE media_id = ?').run(result, mediaId)
    }
    setTimeout(() => { try { frameExtractor?.cleanupAll() } catch { /* ignore */ } }, 500)

    try {
      ev.sender.send('ai:venice-stream-end', { streamId, mediaId, field, result })
    } catch { /* sender gone */ }
    return { streamId, result }
  })

  // Generate caption template pairs via Venice. Returns an array of
  // { topText, bottomText, category } ready to insert into the captions
  // template store. Used by the Brainwash → Templates panel's "AI Generate"
  // button so the user can stock the library without hand-typing.
  //
  // Theme is a free-text seed ("dirty talk", "praise", "humiliation",
  // "denial", etc.) — the prompt steers Venice toward THAT vibe so the
  // user gets variety. Empty theme → mixed pack.
  // Library-wide consensus quality stats. Walks every ai_analysis_results
  // row, parses the rich_tags JSON, and reports how confident the multi-
  // frame analysis is. Lets the user see at-a-glance whether their library
  // is well-tagged or whether a re-analysis pass would help.
  //
  // Returns:
  //   total: rows analyzed (where rich_tags is populated)
  //   unanimousVideos: rows where ANY tag agreed across all frames
  //   lowAgreementVideos: rows where the average per-tag agreement is below 0.5
  //   averageAgreement: mean agreement across all tagged rows (0-1)
  //   topDisagreedTags: top 5 tag names with the highest singleton ratio
  //   lowAgreementMediaIds: ids of low-agreement rows so the renderer can
  //                         offer a "re-analyze these" action.
  ipcMain.handle('ai:get-consensus-stats', async () => {
    const rawDb = db.raw
    const rows = rawDb.prepare(`
      SELECT media_id, rich_tags FROM ai_analysis_results
      WHERE rich_tags IS NOT NULL AND rich_tags != ''
    `).all() as Array<{ media_id: string; rich_tags: string }>

    let total = 0
    let unanimousVideos = 0
    const lowAgreementMediaIds: string[] = []
    let agreementSum = 0
    let agreementSamples = 0
    // Per-tag stats: name → { singletons, totalAppearances }
    const perTag = new Map<string, { singletons: number; total: number }>()

    for (const row of rows) {
      let parsed: Array<{ name: string; frameCount?: number; totalFrames?: number }>
      try { parsed = JSON.parse(row.rich_tags) } catch { continue }
      if (!Array.isArray(parsed) || parsed.length === 0) continue

      // Skip single-frame analyses — no useful consensus signal there.
      const tagsWithAgreement = parsed.filter(
        (t) => typeof t.frameCount === 'number' && typeof t.totalFrames === 'number' && (t.totalFrames as number) > 1
      )
      if (tagsWithAgreement.length === 0) continue

      total++
      let videoAgreementSum = 0
      let hasUnanimous = false
      for (const t of tagsWithAgreement) {
        const agreement = (t.frameCount as number) / (t.totalFrames as number)
        videoAgreementSum += agreement
        if (agreement === 1) hasUnanimous = true
        const lower = String(t.name).toLowerCase()
        const stats = perTag.get(lower) ?? { singletons: 0, total: 0 }
        stats.total++
        if ((t.frameCount as number) === 1) stats.singletons++
        perTag.set(lower, stats)
      }
      const videoAvgAgreement = videoAgreementSum / tagsWithAgreement.length
      agreementSum += videoAvgAgreement
      agreementSamples++
      if (hasUnanimous) unanimousVideos++
      if (videoAvgAgreement < 0.5) lowAgreementMediaIds.push(row.media_id)
    }

    const averageAgreement = agreementSamples > 0
      ? Math.round((agreementSum / agreementSamples) * 100) / 100
      : 0

    const topDisagreedTags = [...perTag.entries()]
      .filter(([, s]) => s.total >= 3)  // need a minimum sample size
      .map(([name, s]) => ({ name, singletonRatio: s.singletons / s.total, total: s.total }))
      .sort((a, b) => b.singletonRatio - a.singletonRatio)
      .slice(0, 5)

    return {
      total,
      unanimousVideos,
      lowAgreementVideos: lowAgreementMediaIds.length,
      averageAgreement,
      topDisagreedTags,
      // Cap returned list at 200 so the renderer doesn't have to deal with
      // mass-IDs in payload. The user re-runs to keep going.
      lowAgreementMediaIds: lowAgreementMediaIds.slice(0, 200),
    }
  })

  // Spotify-style "today's mix" — time-of-day-aware playlist that auto-
  // generates a session based on the current hour + the user's tag
  // distribution. Closes #47.
  //
  // Hour buckets map to "moods" with soft tag biases. Picks happen via
  // the same randomByTags-style query (any-of match), then filtered to
  // the appropriate type, deduped, and shuffled. Returns 20-30 items
  // with a label + tag-bias summary so the UI can show context.
  //
  // No persistence — fresh on each call. Session feels different at
  // 9 AM vs 11 PM even with the same library.
  ipcMain.handle('ai:daily-mix', async (_ev, opts?: { hour?: number; targetCount?: number }) => {
    const hour = (opts?.hour ?? new Date().getHours()) % 24
    const targetCount = Math.min(Math.max(opts?.targetCount ?? 24, 6), 60)

    // Mood + tag-bias profile per hour bucket. Tags are SOFT priors —
    // any-of match against the library, not strict requirements. If
    // the user has nothing tagged that way the profile naturally falls
    // back to broader picks.
    interface MoodProfile {
      label: string
      vibe: string
      tags: string[]
      preferLong?: boolean
    }
    const profile: MoodProfile = (() => {
      if (hour >= 5 && hour < 9)   return { label: 'Morning Soft',     vibe: 'soft / sensual / slow start',                tags: ['solo', 'amateur', 'lesbian', 'tease', 'shower', 'morning'] }
      if (hour >= 9 && hour < 12)  return { label: 'Daytime Casual',   vibe: 'casual / variety / mid-energy',              tags: ['amateur', 'pov', 'casting', 'reality', 'public'] }
      if (hour >= 12 && hour < 17) return { label: 'Afternoon Mix',    vibe: 'mid-energy / mixed bag',                     tags: ['milf', 'big breasts', 'blonde', 'brunette', 'amateur'] }
      if (hour >= 17 && hour < 21) return { label: 'Primetime',        vibe: 'standout picks / library favorites',         tags: ['hardcore', 'creampie', 'rough sex', 'doggy style', 'cowgirl'], preferLong: true }
      if (hour >= 21 && hour < 1)  return { label: 'Late Night',       vibe: 'intensity / your most-watched directions',   tags: ['anal sex', 'gangbang', 'rough sex', 'bbc', 'creampie'], preferLong: true }
      return                              { label: 'Insomnia Hour',    vibe: 'compilations and longer scenes',             tags: ['compilation', 'milf', 'big breasts'], preferLong: true }
    })()

    // Query the library for any-of matches against the mood tags. Pull
    // a generous slice to allow type filtering + dedupe + shuffle.
    const seenIds = new Set<string>()
    const candidates: any[] = []
    for (const tag of profile.tags) {
      try {
        const result = db.listMedia({ q: '', type: 'video', tag, limit: 80, offset: 0 })
        for (const item of result.items) {
          if (seenIds.has(item.id)) continue
          seenIds.add(item.id)
          candidates.push(item)
        }
      } catch { /* ignore tag-miss */ }
    }

    // If the mood profile produced nothing (user's library doesn't have
    // those tags), fall back to a random video pull so the user still
    // sees a session.
    if (candidates.length === 0) {
      try {
        const fallback = db.listMedia({ q: '', type: 'video', tag: '', limit: 200, offset: 0, sortBy: 'random' })
        for (const item of fallback.items) {
          if (seenIds.has(item.id)) continue
          seenIds.add(item.id)
          candidates.push(item)
        }
      } catch { /* ignore */ }
    }

    // Long-bias mode: favor longer videos for evening/night profiles.
    // Otherwise shuffle.
    if (profile.preferLong) {
      candidates.sort((a, b) => (b.durationSec ?? 0) - (a.durationSec ?? 0))
    } else {
      for (let i = candidates.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[candidates[i], candidates[j]] = [candidates[j], candidates[i]]
      }
    }

    return {
      label: profile.label,
      vibe: profile.vibe,
      hour,
      tagBias: profile.tags,
      items: candidates.slice(0, targetCount),
    }
  })

  // Today's Mix with a block-and-schedule structure. Whereas the
  // basic daily-mix returns a flat list of items, this variant
  // produces a sequenced session with named blocks: a warmup block
  // (soft mood, short duration), main blocks (the user's primary
  // direction), and a cooldown block (afterglow / cuddly). Inspired
  // by ErsatzTV's block-and-schedule TV scheduler.
  ipcMain.handle('ai:block-schedule', async (_ev, opts?: {
    hour?: number
    targetDurationMinutes?: number
    blocks?: Array<{ name: string; tags: string[]; durationFrac: number; preferLong?: boolean }>
  }) => {
    const hour = (opts?.hour ?? new Date().getHours()) % 24
    const targetMinutes = Math.max(15, Math.min(240, opts?.targetDurationMinutes ?? 60))
    const targetSec = targetMinutes * 60

    // Default block sequence — user can override via `blocks`.
    // durationFrac sums to ~1.0; each block claims its share of total time.
    const defaultBlocks: Array<{ name: string; tags: string[]; durationFrac: number; preferLong?: boolean }> = (() => {
      if (hour >= 21 || hour < 5) {
        // Late night: longer warmup, main is intense, short cooldown.
        return [
          { name: 'Warmup',  tags: ['solo', 'tease', 'lingerie', 'striptease'], durationFrac: 0.2 },
          { name: 'Main',    tags: ['hardcore', 'anal sex', 'creampie', 'rough sex'], durationFrac: 0.65, preferLong: true },
          { name: 'Cooldown', tags: ['cuddling', 'post sex', 'afterglow', 'kissing'], durationFrac: 0.15 },
        ]
      }
      if (hour >= 17 && hour < 21) {
        // Primetime: balanced.
        return [
          { name: 'Warmup',  tags: ['kissing', 'foreplay', 'oral'], durationFrac: 0.25 },
          { name: 'Main',    tags: ['hardcore', 'cowgirl', 'doggy style'], durationFrac: 0.6, preferLong: true },
          { name: 'Cooldown', tags: ['cuddling', 'kissing'], durationFrac: 0.15 },
        ]
      }
      if (hour >= 5 && hour < 12) {
        // Morning: soft + casual.
        return [
          { name: 'Warmup',  tags: ['solo', 'shower', 'amateur'], durationFrac: 0.3 },
          { name: 'Main',    tags: ['amateur', 'pov', 'casting'], durationFrac: 0.55 },
          { name: 'Cooldown', tags: ['solo', 'tease'], durationFrac: 0.15 },
        ]
      }
      // Daytime / afternoon: variety.
      return [
        { name: 'Warmup',  tags: ['amateur', 'tease'], durationFrac: 0.25 },
        { name: 'Main',    tags: ['milf', 'big breasts', 'reality', 'casting'], durationFrac: 0.6 },
        { name: 'Cooldown', tags: ['solo', 'shower'], durationFrac: 0.15 },
      ]
    })()
    const blocks = opts?.blocks ?? defaultBlocks

    const seenIds = new Set<string>()
    const blockResults: Array<{
      name: string
      tagBias: string[]
      targetSec: number
      actualSec: number
      items: any[]
    }> = []

    for (const block of blocks) {
      const blockTargetSec = Math.floor(targetSec * block.durationFrac)
      const blockItems: any[] = []
      let actualSec = 0

      // Pull candidates for this block's tags.
      const candidates: any[] = []
      for (const tag of block.tags) {
        try {
          const result = db.listMedia({ q: '', type: 'video', tag, limit: 60, offset: 0 })
          for (const item of result.items) {
            if (!seenIds.has(item.id)) candidates.push(item)
          }
        } catch { /* skip tag-miss */ }
      }
      if (candidates.length === 0) {
        // Fall back to random pull for this block.
        try {
          const fallback = db.listMedia({ q: '', type: 'video', tag: '', limit: 100, offset: 0, sortBy: 'random' })
          for (const item of fallback.items) {
            if (!seenIds.has(item.id)) candidates.push(item)
          }
        } catch { /* ignore */ }
      }
      // Sort: longer first when preferLong, else random.
      if (block.preferLong) {
        candidates.sort((a, b) => (b.durationSec ?? 0) - (a.durationSec ?? 0))
      } else {
        for (let i = candidates.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1))
          ;[candidates[i], candidates[j]] = [candidates[j], candidates[i]]
        }
      }
      // Greedy fill until block target reached.
      for (const item of candidates) {
        if (actualSec >= blockTargetSec) break
        if (seenIds.has(item.id)) continue
        seenIds.add(item.id)
        blockItems.push(item)
        actualSec += item.durationSec ?? 60
      }
      blockResults.push({
        name: block.name,
        tagBias: block.tags,
        targetSec: blockTargetSec,
        actualSec,
        items: blockItems,
      })
    }

    return {
      hour,
      targetMinutes,
      blocks: blockResults,
      totalItems: blockResults.reduce((s, b) => s + b.items.length, 0),
      totalActualSec: blockResults.reduce((s, b) => s + b.actualSec, 0),
    }
  })

  // Library-wide rejection patterns — surfaces what the user is rejecting
  // most often across the whole library (not per-video). The Tier 2 prompt
  // already gets this as a soft prior; this IPC just exposes the same data
  // for UI display in the Tagger Quality card.
  ipcMain.handle('ai:get-rejection-patterns', async () => {
    const { aggregateRejectionPatterns } = await import('./rejection-patterns')
    return aggregateRejectionPatterns(db.raw)
  })

  // Re-enqueue specified media for AI re-analysis. Used by the "Re-analyze
  // low-agreement videos" action — feeds the IDs from get-consensus-stats
  // back through the pipeline so the user gets fresh Tier 2 output (which
  // benefits from any prompt improvements that landed since the original
  // run).
  ipcMain.handle('ai:reanalyze-batch', async (_ev, mediaIds: string[]) => {
    if (!Array.isArray(mediaIds) || mediaIds.length === 0) return { enqueued: 0 }
    let enqueued = 0
    for (const id of mediaIds) {
      try {
        const row = db.raw.prepare('SELECT id, path, type, mtimeMs, size FROM media WHERE id = ?').get(id) as
          | { id: string; path: string; type: string; mtimeMs: number; size: number }
          | undefined
        if (!row) continue
        db.enqueueJob('media:analyze', {
          mediaId: row.id, path: row.path, type: row.type, mtimeMs: row.mtimeMs, size: row.size,
        }, 1)  // priority 1 — same as rejection-requeue
        enqueued++
      } catch (err) {
        console.warn('[AI] reanalyze-batch enqueue failed for', id, err)
      }
    }
    console.log(`[AI] reanalyze-batch: enqueued ${enqueued}/${mediaIds.length}`)
    return { enqueued }
  })

  // Suggest playlist concepts based on the user's tag distribution.
  // Returns an array of { name, description, tagFilters[] } the renderer
  // can use to materialize playlists. Pulls top tags from the database
  // and asks Venice to riff on themes.
  ipcMain.handle('ai:suggest-playlists', async (_ev, args: { count?: number } = {}) => {
    if (!tier2Vision || !tier2Vision.isEnabled()) {
      throw new Error('Tier 2 not configured — set a Venice API key in AI Tools → Setup first.')
    }
    const count = Math.min(Math.max(args.count ?? 5, 1), 10)

    // Pull top tags by media count.
    const rawDb = db.raw
    const tagRows = rawDb.prepare(`
      SELECT t.name, COUNT(mt.media_id) AS n
      FROM tags t
      LEFT JOIN media_tags mt ON mt.tag_id = t.id
      GROUP BY t.id
      HAVING n > 0
      ORDER BY n DESC
      LIMIT 80
    `).all() as Array<{ name: string; n: number }>

    if (tagRows.length === 0) throw new Error('No tagged media — analyze some videos first so the AI has something to work with.')

    const tagCorpus = tagRows.map(r => `${r.name}(${r.n})`).join(', ')
    const sysPrompt = `You curate playlists from an adult video collection. Given the tag frequencies, suggest distinct playlist concepts. Each playlist has:
- name: short evocative title (3-6 words, no quotes)
- description: 1-sentence vibe (≤120 chars)
- tagFilters: 2-5 tag names from the corpus that define the playlist (must be exact matches from the corpus)

OUTPUT FORMAT — strict JSON array, nothing else:
[
  { "name": "...", "description": "...", "tagFilters": ["tag1","tag2"] },
  ...
]

RULES:
- Make the playlists DISTINCT — each should evoke a different mood/theme.
- Use only tags from the provided corpus, lowercase, exact spelling.
- Skip generic catchall titles ("Mixed", "Random"). Be specific.
- Vulgar OK; clinical NOT ok.`

    const userPrompt = `Top tags from the user's collection (tag(count)):\n${tagCorpus}\n\nGenerate ${count} playlist concepts. Return ONLY the JSON array.`

    let raw: string
    try {
      raw = await tier2Vision.callLLMText(sysPrompt, userPrompt, { temperature: 0.85, maxTokens: 1200 })
    } catch (err: any) {
      throw new Error(`Venice text generation failed: ${err?.message ?? err}`)
    }

    const cleaned = raw.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim()
    let parsed: any
    try {
      parsed = JSON.parse(cleaned)
    } catch {
      const match = cleaned.match(/\[[\s\S]*\]/)
      if (!match) throw new Error(`Venice returned non-JSON: ${raw.slice(0, 200)}`)
      parsed = JSON.parse(match[0])
    }

    if (!Array.isArray(parsed)) throw new Error('Venice did not return an array')
    const validTagSet = new Set(tagRows.map(r => r.name.toLowerCase()))
    return parsed
      .filter((p: any) => p && p.name && Array.isArray(p.tagFilters) && p.tagFilters.length > 0)
      .map((p: any) => ({
        name: String(p.name).trim(),
        description: String(p.description ?? '').trim(),
        // Drop any tag the model hallucinated that doesn't exist in the corpus.
        tagFilters: (p.tagFilters as string[])
          .map(t => String(t).toLowerCase().trim())
          .filter(t => validTagSet.has(t)),
      }))
      .filter((p: any) => p.tagFilters.length > 0)
  })

  ipcMain.handle('ai:generate-captions', async (_ev, args: { theme?: string; count?: number } = {}) => {
    if (!tier2Vision || !tier2Vision.isEnabled()) {
      throw new Error('Tier 2 not configured — set a Venice API key in AI Tools → Setup first.')
    }
    const count = Math.min(Math.max(args.count ?? 8, 1), 20)
    const theme = (args.theme ?? '').trim()
    const sysPrompt = `You generate caption pairs for adult content image overlays. Each caption is a TOP line + BOTTOM line, like a meme. Lines are short (2-7 words), punchy, and explicit/vulgar (this is adult content — no sanitizing). They should hit hard.

OUTPUT FORMAT — strict JSON array, nothing else:
[
  { "top": "TOP LINE", "bottom": "BOTTOM LINE", "category": "praise" },
  ...
]

Categories: praise, humiliation, denial, encouragement, dirty, kink, brat, mommy, worship, seduction, pervert, goon

Rules:
- Lines are uppercase or mixed-case as appropriate. No quotation marks inside lines.
- TOP and BOTTOM should connect (a setup + payoff, or a question + answer).
- Avoid generic stock phrases ("hot girl", "sexy babe"). Be specific, vivid, and direct.
- No hashtags, no emojis, no @mentions.`

    const userPrompt = theme
      ? `Generate ${count} caption pairs in the "${theme}" vibe. Mix subtle and graphic. Return ONLY the JSON array.`
      : `Generate ${count} caption pairs across at least 4 different categories. Mix subtle and graphic. Return ONLY the JSON array.`

    let raw: string
    try {
      raw = await tier2Vision.callLLMText(sysPrompt, userPrompt, { temperature: 0.85, maxTokens: 1200 })
    } catch (err: any) {
      throw new Error(`Venice text generation failed: ${err?.message ?? err}`)
    }

    // Try to parse — Venice sometimes wraps in markdown fences.
    const cleaned = raw.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim()
    let parsed: any
    try {
      parsed = JSON.parse(cleaned)
    } catch {
      // Fallback: extract first JSON-array-looking substring.
      const match = cleaned.match(/\[[\s\S]*\]/)
      if (!match) throw new Error(`Venice returned non-JSON: ${raw.slice(0, 200)}`)
      parsed = JSON.parse(match[0])
    }

    if (!Array.isArray(parsed)) throw new Error('Venice did not return an array')
    return parsed
      .filter((p: any) => p && (p.top || p.bottom))
      .map((p: any) => ({
        topText: String(p.top ?? '').trim(),
        bottomText: String(p.bottom ?? '').trim(),
        category: String(p.category ?? 'dirty').trim().toLowerCase(),
      }))
  })

  // Cleanup junk tags from BOTH the live tags table AND the review-cache JSON
  // columns in ai_analysis_results. Uses the same `isJunkTag` filter the
  // pipeline applies to new analyses so old data converges with new.
  //
  // Three passes:
  //   1. MIGRATE — for tags that have a canonical redirect target (e.g.
  //      "trans woman" → "mtf", "self-pleasure" → "masturbation",
  //      "teen girl" → ["teen", "female"]), find/create the target tag(s)
  //      and re-link media_tags rows to them. Then delete the source tag.
  //      User curation survives the rename.
  //   2. JUNK — anything left that isJunkTag flags gets deleted outright.
  //   3. REVIEW JSON — strip junk entries from ai_analysis_results JSON.
  ipcMain.handle('ai:cleanup-tags', async () => {
    const rawDb = db.raw
    const savedSettings = getSettings() as VaultSettings
    const protectedTags = new Set((savedSettings?.ai?.protectedTags || []).map((t: string) => t.toLowerCase()))

    // ── Pass 1: MIGRATE redirects ──────────────────────────────────────────
    // For each tag whose name has a canonical redirect target, re-link the
    // media_tags rows to the target(s) and delete the source tag.
    const allTags = rawDb.prepare('SELECT id, name, color, category FROM tags').all() as Array<{ id: string; name: string; color: string | null; category: string | null }>

    const findOrCreateTag = (name: string, sourceColor: string | null, sourceCategory: string | null): string => {
      const lower = name.toLowerCase()
      const existing = rawDb.prepare('SELECT id FROM tags WHERE LOWER(name) = ? LIMIT 1').get(lower) as { id: string } | undefined
      if (existing) return existing.id
      const id = nanoid(12)
      rawDb.prepare('INSERT INTO tags (id, name, color, category) VALUES (?, ?, ?, ?)').run(
        id, name, sourceColor, sourceCategory
      )
      return id
    }

    const insertMediaTag = rawDb.prepare('INSERT OR IGNORE INTO media_tags (mediaId, tagId) VALUES (?, ?)')
    const selectLinks = rawDb.prepare('SELECT mediaId FROM media_tags WHERE tagId = ?')
    const deleteLinks = rawDb.prepare('DELETE FROM media_tags WHERE tagId = ?')
    const deleteTag = rawDb.prepare('DELETE FROM tags WHERE id = ?')

    let migratedTags = 0
    let migratedLinks = 0

    rawDb.transaction(() => {
      for (const tag of allTags) {
        if (protectedTags.has(tag.name.toLowerCase())) continue
        const targets = getTagRedirect(tag.name)
        if (!targets || targets.length === 0) continue
        // Don't redirect a tag onto itself (e.g., normalized form equals source)
        if (targets.length === 1 && targets[0].toLowerCase() === tag.name.toLowerCase()) continue

        const links = selectLinks.all(tag.id) as Array<{ mediaId: string }>
        const targetTagIds = targets.map(t => findOrCreateTag(t, tag.color, tag.category))

        for (const link of links) {
          for (const targetId of targetTagIds) {
            insertMediaTag.run(link.mediaId, targetId)
          }
          migratedLinks++
        }

        deleteLinks.run(tag.id)
        deleteTag.run(tag.id)
        migratedTags++
      }
    })()

    if (migratedTags > 0) {
      console.log(`[AI] Cleanup: migrated ${migratedTags} tag(s) to canonical form, re-linked ${migratedLinks} media_tag entries`)
    }

    // ── Pass 2: JUNK — delete anything still failing isJunkTag ─────────────
    // Re-fetch since some tags may have been removed in pass 1.
    const remainingTags = rawDb.prepare('SELECT id, name FROM tags').all() as Array<{ id: string; name: string }>
    const tagsToRemove: string[] = []

    for (const tag of remainingTags) {
      if (protectedTags.has(tag.name.toLowerCase())) continue
      const normalized = normalizeToCanonical(tag.name)
      if (isJunkTag(normalized) || isJunkTag(tag.name)) {
        tagsToRemove.push(tag.id)
      }
    }

    let removedTags = 0
    if (tagsToRemove.length > 0) {
      const deleteMediaTags2 = rawDb.prepare('DELETE FROM media_tags WHERE tagId = ?')
      const deleteTag2 = rawDb.prepare('DELETE FROM tags WHERE id = ?')
      rawDb.transaction(() => {
        for (const tagId of tagsToRemove) {
          deleteMediaTags2.run(tagId)
          deleteTag2.run(tagId)
        }
      })()
      removedTags = tagsToRemove.length
      console.log(`[AI] Cleanup: removed ${removedTags} junk tags from tags table`)
    }

    // ── Pass 2: ai_analysis_results JSON columns ───────────────────────────
    // matched_tags / new_tag_suggestions are JSON arrays — strip junk entries
    // so the Review pane reflects the new filter without requiring re-scan.
    let cleanedReviews = 0
    let strippedTagEntries = 0

    try {
      const reviewRows = rawDb.prepare(`
        SELECT id, matched_tags, new_tag_suggestions
        FROM ai_analysis_results
        WHERE matched_tags IS NOT NULL OR new_tag_suggestions IS NOT NULL
      `).all() as Array<{ id: number; matched_tags: string | null; new_tag_suggestions: string | null }>

      const updateRow = rawDb.prepare(`
        UPDATE ai_analysis_results
        SET matched_tags = ?, new_tag_suggestions = ?
        WHERE id = ?
      `)

      const filterArr = (raw: string | null): { kept: any[]; stripped: number } => {
        if (!raw) return { kept: [], stripped: 0 }
        let arr: any[]
        try { arr = JSON.parse(raw) } catch { return { kept: [], stripped: 0 } }
        if (!Array.isArray(arr)) return { kept: [], stripped: 0 }
        const kept = arr.filter((entry) => {
          const name = entry?.name ?? entry?.label ?? entry
          if (typeof name !== 'string') return true
          if (protectedTags.has(name.toLowerCase())) return true
          const norm = normalizeToCanonical(name)
          return !isJunkTag(norm) && !isJunkTag(name)
        })
        return { kept, stripped: arr.length - kept.length }
      }

      rawDb.transaction(() => {
        for (const row of reviewRows) {
          const matched = filterArr(row.matched_tags)
          const suggestions = filterArr(row.new_tag_suggestions)
          if (matched.stripped + suggestions.stripped > 0) {
            updateRow.run(
              JSON.stringify(matched.kept),
              JSON.stringify(suggestions.kept),
              row.id
            )
            cleanedReviews++
            strippedTagEntries += matched.stripped + suggestions.stripped
          }
        }
      })()

      if (cleanedReviews > 0) {
        console.log(`[AI] Cleanup: stripped ${strippedTagEntries} junk entries from ${cleanedReviews} review records`)
      }
    } catch (err) {
      console.warn('[AI] Cleanup: ai_analysis_results pass failed:', err)
    }

    return {
      removed: removedTags,                // legacy field name; existing UI reads it
      removedTags,
      migratedTags,
      migratedLinks,
      cleanedReviews,
      strippedTagEntries,
    }
  })

  // Get protected tags
  ipcMain.handle('ai:get-protected-tags', async () => {
    const savedSettings = getSettings() as VaultSettings
    return savedSettings?.ai?.protectedTags || []
  })

  // Set protected tags
  ipcMain.handle('ai:set-protected-tags', async (_ev, tags: string[]) => {
    const current = getSettings() as VaultSettings
    updateSettings({
      ai: {
        ...current.ai,
        protectedTags: tags,
      }
    } as Partial<VaultSettings>)
    console.log(`[AI] Updated protected tags: ${tags.length} tags`)
    return { success: true }
  })

  // Add a protected tag
  ipcMain.handle('ai:add-protected-tag', async (_ev, tag: string) => {
    const current = getSettings() as VaultSettings
    const existing = current?.ai?.protectedTags || []
    if (!existing.includes(tag)) {
      updateSettings({
        ai: {
          ...current.ai,
          protectedTags: [...existing, tag],
        }
      } as Partial<VaultSettings>)
    }
    return { success: true }
  })

  // Remove a protected tag
  ipcMain.handle('ai:remove-protected-tag', async (_ev, tag: string) => {
    const current = getSettings() as VaultSettings
    const existing = current?.ai?.protectedTags || []
    updateSettings({
      ai: {
        ...current.ai,
        protectedTags: existing.filter((t: string) => t !== tag),
      }
    } as Partial<VaultSettings>)
    return { success: true }
  })

  // Analyze image for caption generation
  // Uses existing tags or generates captions based on content type
  ipcMain.handle('ai:analyze-for-caption', async (_ev, mediaId: string) => {
    try {
      // Get existing tags for this media
      const tags = db.raw.prepare('SELECT t.name FROM tags t JOIN media_tags mt ON t.id = mt.tagId JOIN media m ON m.id = mt.mediaId WHERE m.id = ?').all(mediaId) as { name: string }[]

      const tagNames = tags.map(t => t.name.toLowerCase())

      // Comprehensive caption templates based on detected content type
      const captionOptions = {
        goon: [
          { top: 'STROKE', bottom: 'EDGE' },
          { top: 'GOOD GOONER', bottom: 'KEEP PUMPING' },
          { top: 'PORN IS LIFE', bottom: 'EMBRACE IT' },
          { top: 'LEAK FOR ME', bottom: null },
          { top: 'MINDLESS', bottom: 'PUMPING' },
          { top: 'NO THOUGHTS', bottom: 'JUST STROKE' },
          { top: 'EDGE LONGER', bottom: null },
          { top: 'DEEPER', bottom: 'INTO THE SPIRAL' },
          { top: 'ADDICTED', bottom: "CAN'T STOP" },
          { top: 'GOOD BOY', bottom: 'PUMP HARDER' },
        ],
        degrading: [
          { top: 'LOOK AT THIS', bottom: 'YOU PATHETIC FUCK' },
          { top: 'YOU LOVE THIS', bottom: "DON'T YOU" },
          { top: 'PATHETIC', bottom: 'KEEP STROKING' },
          { top: "CAN'T HELP YOURSELF", bottom: null },
          { top: 'EXPOSED', bottom: 'AND HARD' },
          { top: 'SUCH A LOSER', bottom: null },
          { top: 'WEAK', bottom: 'FOR PORN' },
          { top: 'SHAMEFUL', bottom: 'KEEP GOING' },
        ],
        worship: [
          { top: 'WORSHIP', bottom: 'SUBMIT' },
          { top: 'PERFECT', bottom: 'DIVINE' },
          { top: 'GODDESS', bottom: null },
          { top: 'BOW DOWN', bottom: null },
          { top: 'SERVE', bottom: 'OBEY' },
          { top: 'BEAUTIFUL', bottom: 'WORSHIP HER' },
        ],
        hentai: [
          { top: 'ANIME BRAIN', bottom: 'ROT' },
          { top: '2D > 3D', bottom: null },
          { top: 'WAIFU', bottom: 'MATERIAL' },
          { top: 'DEGENERATE', bottom: 'WEEB' },
          { top: 'CULTURED', bottom: null },
          { top: 'HENTAI', bottom: 'ENJOYER' },
        ],
        ass: [
          { top: 'THAT ASS', bottom: 'IS PERFECT' },
          { top: 'WORSHIP IT', bottom: null },
          { top: 'THICC', bottom: null },
          { top: 'CAKE', bottom: 'FOR DAYS' },
          { top: 'BOOTY', bottom: 'HYPNOTIZED' },
        ],
        boobs: [
          { top: 'THOSE TITS', bottom: 'AMAZING' },
          { top: 'TITTY', bottom: 'HYPNOTIZED' },
          { top: 'BIG', bottom: 'BEAUTIFUL' },
          { top: 'MOMMY', bottom: 'MILKERS' },
          { top: 'STACKED', bottom: null },
        ],
        femdom: [
          { top: 'OBEY', bottom: 'YOUR GODDESS' },
          { top: 'KNEEL', bottom: null },
          { top: 'YES MISTRESS', bottom: null },
          { top: 'SUBMIT', bottom: 'TO HER' },
          { top: 'DOMINATED', bottom: null },
          { top: "SHE'S IN CHARGE", bottom: null },
        ],
        sissy: [
          { top: 'SISSY', bottom: 'BRAIN' },
          { top: 'PRETTY GIRL', bottom: null },
          { top: 'FEMINIZED', bottom: null },
          { top: 'GOOD GIRL', bottom: null },
          { top: 'SO PRETTY', bottom: 'SO HORNY' },
        ],
        denial: [
          { top: 'EDGE', bottom: "DON'T CUM" },
          { top: 'NOT YET', bottom: 'KEEP EDGING' },
          { top: 'DENIED', bottom: null },
          { top: 'HOLD IT', bottom: 'LONGER' },
          { top: 'SUFFER', bottom: 'FOR ME' },
        ],
        encouragement: [
          { top: 'SO CLOSE', bottom: 'KEEP GOING' },
          { top: 'ALMOST THERE', bottom: null },
          { top: "THAT'S IT", bottom: 'GOOD' },
          { top: 'PERFECT', bottom: null },
          { top: 'LET GO', bottom: null },
          { top: 'RELEASE', bottom: null },
        ],
        blowjob: [
          { top: 'SUCK IT', bottom: null },
          { top: 'DEEP', bottom: null },
          { top: 'THROAT IT', bottom: null },
          { top: 'GOOD GIRL', bottom: null },
          { top: 'DROOLING', bottom: null },
        ],
        pov: [
          { top: 'LOOK AT HER', bottom: null },
          { top: 'YOUR VIEW', bottom: null },
          { top: 'IMAGINE', bottom: null },
          { top: 'RIGHT THERE', bottom: null },
        ],
        milf: [
          { top: 'MOMMY', bottom: 'KNOWS BEST' },
          { top: 'EXPERIENCED', bottom: null },
          { top: 'MATURE', bottom: 'PERFECTION' },
        ],
        teen: [
          { top: 'SO YOUNG', bottom: 'SO HOT' },
          { top: 'FRESH', bottom: null },
          { top: 'CUTE', bottom: null },
        ],
        lesbian: [
          { top: 'GIRLS', bottom: 'PLAYING' },
          { top: 'SAPPHIC', bottom: 'BLISS' },
          { top: 'LICK', bottom: null },
        ],
        hardcore: [
          { top: 'FUCK', bottom: 'HARDER' },
          { top: 'POUND', bottom: 'IT' },
          { top: 'ROUGH', bottom: null },
          { top: 'DESTROY', bottom: 'HER' },
        ],
        creampie: [
          { top: 'FILL HER', bottom: null },
          { top: 'BREED', bottom: null },
          { top: 'INSIDE', bottom: null },
          { top: 'DRIPPING', bottom: null },
        ],
        facial: [
          { top: 'CUM', bottom: 'COVERED' },
          { top: 'GLAZED', bottom: null },
          { top: 'MESSY', bottom: null },
        ],
      }

      // Detect content type from tags
      const categoryMatchers: { category: string; keywords: string[] }[] = [
        { category: 'hentai', keywords: ['hentai', 'anime', '2d', 'animated', 'drawn', 'cartoon', 'manga'] },
        { category: 'femdom', keywords: ['femdom', 'dominatrix', 'mistress', 'domme', 'goddess', 'foot worship'] },
        { category: 'sissy', keywords: ['sissy', 'feminization', 'crossdress', 'trap', 'femboy'] },
        { category: 'ass', keywords: ['ass', 'butt', 'booty', 'anal', 'pawg', 'thicc'] },
        { category: 'boobs', keywords: ['tits', 'boobs', 'breasts', 'busty', 'big tits', 'huge tits'] },
        { category: 'denial', keywords: ['denial', 'edge', 'edging', 'tease', 'ruined'] },
        { category: 'blowjob', keywords: ['blowjob', 'bj', 'oral', 'deepthroat', 'suck'] },
        { category: 'pov', keywords: ['pov', 'point of view'] },
        { category: 'milf', keywords: ['milf', 'mature', 'cougar', 'mom'] },
        { category: 'teen', keywords: ['teen', 'young', 'petite', 'barely legal'] },
        { category: 'lesbian', keywords: ['lesbian', 'girl on girl', 'sapphic'] },
        { category: 'hardcore', keywords: ['hardcore', 'rough', 'hard fuck', 'pounding'] },
        { category: 'creampie', keywords: ['creampie', 'breeding', 'cum inside'] },
        { category: 'facial', keywords: ['facial', 'cumshot', 'bukkake'] },
        { category: 'worship', keywords: ['worship', 'divine', 'goddess', 'perfect body'] },
        { category: 'degrading', keywords: ['humiliation', 'degradation', 'pathetic', 'loser'] },
      ]

      // Find matching category
      let category = 'goon' // default
      for (const matcher of categoryMatchers) {
        if (tagNames.some(t => matcher.keywords.some(k => t.includes(k)))) {
          category = matcher.category
          break
        }
      }

      // If no tags but we still want to return something, pick from goon or encouragement randomly
      if (tags.length === 0) {
        const randomCategories = ['goon', 'encouragement', 'denial']
        category = randomCategories[Math.floor(Math.random() * randomCategories.length)]
      }

      // Pick random caption from category
      const options = captionOptions[category as keyof typeof captionOptions] || captionOptions.goon
      const selected = options[Math.floor(Math.random() * options.length)]

      return {
        topText: selected.top,
        bottomText: selected.bottom,
        category
      }
    } catch (err) {
      console.error('[AI] Caption analysis failed:', err)
      return null
    }
  })

  // Generate captions using Venice AI vision (when API key is configured)
  ipcMain.handle('ai:venice-caption', async (_ev, mediaId: string, style?: string) => {
    try {
      if (!tier2Vision?.isEnabled()) {
        return { error: 'Venice AI not configured', topText: null, bottomText: null }
      }

      // Get the media path from database
      const media = db.raw.prepare('SELECT path, thumbPath, type FROM media WHERE id = ?').get(mediaId) as {
        path: string
        thumbPath: string | null
        type: string
      } | undefined

      if (!media) {
        return { error: 'Media not found', topText: null, bottomText: null }
      }

      // Use thumbnail if available (smaller file), otherwise use original
      const imagePath = media.thumbPath || media.path
      const captionStyle = (style || 'generic') as 'goon' | 'degrading' | 'worship' | 'hentai' | 'generic'

      const result = await tier2Vision.generateCaptions(imagePath, captionStyle)
      return {
        topText: result.topText,
        bottomText: result.bottomText,
        source: 'venice'
      }
    } catch (err) {
      console.error('[AI] Venice caption generation failed:', err)
      return { error: String(err), topText: null, bottomText: null }
    }
  })

  // Check if Venice AI is configured
  ipcMain.handle('ai:venice-status', async () => {
    return {
      configured: tier2Vision?.isEnabled() ?? false
    }
  })

  // ─────────────────────────────────────────────────────────────────────────
  // AI similarity recommender — "More like this (AI)" panel
  // ─────────────────────────────────────────────────────────────────────────
  ipcMain.handle('ai:similar', async (_ev, raw: { mediaId: string; limit?: number; matchType?: 'video' | 'image' | 'gif' | 'any' }): Promise<{ items: SimilarMedia[]; cachedCount: number }> => {
    const engine = getSimilarityEngine(db)
    const items = engine.findSimilar(raw.mediaId, raw.limit ?? 12, {
      matchType: raw.matchType ?? undefined
    })
    return { items, cachedCount: engine.getCachedCount() }
  })

  ipcMain.handle('ai:similar-refresh', async () => {
    getSimilarityEngine(db).refresh()
    return { success: true }
  })

  // ─────────────────────────────────────────────────────────────────────────
  // XYRENE WATCH-ALONG — vision-grounded commentary in her voice + TTS audio.
  // The renderer captures a frame from the playing video, sends it here with
  // the media's metadata + recent comments, and we return text + WAV audio.
  // ─────────────────────────────────────────────────────────────────────────
  ipcMain.handle('xyrene:health', async () => {
    const { getXyreneVoiceClient } = await import('../xyrene/voice-client')
    const { getCharacterLoader } = await import('../xyrene/character-loader')
    const voice = getXyreneVoiceClient()
    const loader = getCharacterLoader()
    const [voiceHealth, char] = await Promise.all([
      voice.health(),
      Promise.resolve(loader.load())
    ])
    return {
      voiceServerOnline: voiceHealth !== null,
      voiceServerInfo: voiceHealth,
      characterFound: char.found,
      characterDir: loader.getDir()
    }
  })

  ipcMain.handle('xyrene:setCharacterDir', async (_ev, dir: string) => {
    const { getCharacterLoader } = await import('../xyrene/character-loader')
    getCharacterLoader().setDir(dir)
    return { success: true }
  })

  ipcMain.handle('xyrene:cacheVoice', async () => {
    const { getXyreneVoiceClient } = await import('../xyrene/voice-client')
    const ok = await getXyreneVoiceClient().cacheVoice()
    return { ok }
  })

  // Auto-start the XTTS server (xyrene-portable/xtts-server/server.py).
  // Idempotent — if the server is already reachable it returns ok:true
  // immediately. If the install path can't be found, returns
  // { ok: false, reason }. Resolves only after /health responds or the
  // launch times out (up to 2 minutes on first run for model load).
  ipcMain.handle('xyrene:startServer', async (_ev, args?: { overrideDir?: string }) => {
    const { startXttsServer, findXttsServerDir } = await import('../xyrene/server-launcher')
    const dir = findXttsServerDir(args?.overrideDir ?? null)
    if (!dir) {
      return {
        ok: false,
        reason: 'install_not_found',
        message: 'Could not find xyrene-portable/xtts-server. Run xyrene-portable/setup_new_pc.bat or set xyrene.xttsServerPath in settings.'
      }
    }
    const ok = await startXttsServer({ overrideDir: args?.overrideDir })
    return ok
      ? { ok: true, serverDir: dir }
      : { ok: false, reason: 'launch_failed', serverDir: dir, message: 'XTTS process launched but /health did not respond in time. Check the python console window for errors.' }
  })

  // Stop the XTTS server (only kills processes Vault launched — manual
  // launches are left alone). Used by app-quit hook + manual control.
  ipcMain.handle('xyrene:stopServer', async () => {
    const { stopXttsServer, isManagingServer } = await import('../xyrene/server-launcher')
    const wasManaging = isManagingServer()
    stopXttsServer()
    return { ok: true, wasManaging }
  })

  // List the voice samples available on the XTTS server. The server
  // exposes /voices which returns the .wav filenames in its
  // voice_samples/ folder. Renderer uses this to populate the voice
  // picker dropdown — Xyrene's clone exists upstream in xyrene-portable;
  // vault is just exposing what's already there.
  ipcMain.handle('xyrene:listVoices', async () => {
    const { getXyreneVoiceClient } = await import('../xyrene/voice-client')
    return await getXyreneVoiceClient().listVoices()
  })

  // Synthesize a fixed preview line in the requested voice and return
  // base64-encoded WAV bytes. The renderer plays the result via an
  // <audio> element. Used by the voice-picker preview button.
  ipcMain.handle('xyrene:previewVoice', async (_ev, args: { voice: string; text?: string }) => {
    const { getXyreneVoiceClient } = await import('../xyrene/voice-client')
    const text = args.text?.trim() || 'mmm hi baby... i was just thinking about you'
    const buf = await getXyreneVoiceClient().synth(text, { voice: args.voice, timeoutMs: 30000 })
    if (!buf) throw new Error('XTTS synth returned no audio (server offline?)')
    return { base64: buf.toString('base64'), mime: 'audio/wav' }
  })

  // List organized soundpack files grouped by category. Reads the manifest
  // produced by SoundOrganizer at userData/audio/voice/manifest.json. Used
  // by the Xyrene Settings panel to populate the sound-slot dropdowns.
  // Junk filter — top-level packs / subcategories that aren't actually
  // useful for Xyrene's sound engine. User flagged wood-impact / door /
  // music sounds 2026-05-09. Filter is opt-out (passing
  // `includeJunk: true` returns the unfiltered list).
  const JUNK_PACKS = new Set([
    'music', 'misc', 'miscellaneous',
  ])
  // Subcategory match is case-insensitive substring — catches things like
  // "Wood Impacts", "Door Slam", "Furniture Drop" inside larger packs.
  const JUNK_SUBSTRINGS = [
    'wood', 'door', 'metal', 'glass', 'paper', 'fabric',
    'furniture', 'drop', 'kick', 'punch', 'crash', 'thud',
  ]

  /**
   * Strip trailing variation suffixes from a filename so near-duplicates
   * fold to the same key. Examples:
   *   "plap_03.ogg"      → "plap"
   *   "plap (4).wav"     → "plap"
   *   "moanA.wav" "moanB.wav" → "moan"  (single trailing letter)
   *   "Wet Slap 02 of 5.ogg" → "Wet Slap"
   * The dedup is conservative — only collapses obvious sequence patterns
   * so files with semantically different names (e.g. "wet_pussy" vs
   * "dry_slap") stay distinct.
   */
  function dedupeKey(filename: string): string {
    let base = filename.toLowerCase().replace(/\.[^.]+$/, '')
    // Strip "(N)", " N of M", trailing _N / -N / N
    base = base
      .replace(/\s*\(\d+\)\s*$/, '')
      .replace(/\s+\d+\s+of\s+\d+\s*$/i, '')
      .replace(/[\-_\s]+v?\d+\s*$/, '')
      .replace(/[\-_\s]+\d+[a-z]?\s*$/i, '')
      .replace(/\s+\d+\s*$/, '')
    // Strip a single trailing letter when the base name is long enough
    // (avoids collapsing "a", "to", etc.). "moanA" / "moanB" → "moan".
    if (base.length > 4 && /[a-z]$/.test(base) && !/[\s\-_]/.test(base.slice(-2))) {
      base = base.replace(/[a-z]$/, '')
    }
    return base.trim() || filename.toLowerCase()
  }

  // Scan known soundpack roots directly, return categories that match the
  // user's actual folder structure (Plaps / Cum / Boobjob / Wet Sounds / etc.)
  // instead of the SoundOrganizer's keyword-derived buckets. The keyword
  // categories were too lossy — dumping 32k files into 9 buckets ("misc",
  // "moans", "climax", ...) hides the natural taxonomy OpenNSFW SFX
  // already has in its folder tree.
  //
  // Algorithm:
  //   1. Probe each known soundpack root.
  //   2. If the root has audio files at top level, emit the root itself
  //      as a category.
  //   3. For each immediate subfolder, recursively gather audio files and
  //      emit it as its own category. Subfolders deeper than that become
  //      subcategories within their parent.
  //   4. Apply the same dedupe + junk filter as before.
  const AUDIO_EXTS = new Set(['.mp3', '.wav', '.ogg', '.m4a', '.flac', '.aac', '.webm', '.opus'])
  const isAudioFile = (name: string): boolean => AUDIO_EXTS.has(path.extname(name).toLowerCase())

  type WalkedFile = { absolutePath: string; filename: string; subcategory: string | null }

  function walkAudioRecursive(dir: string, rootDir: string, maxDepth = 6): WalkedFile[] {
    const out: WalkedFile[] = []
    const stack: Array<[string, number]> = [[dir, 0]]
    while (stack.length > 0) {
      const [cur, depth] = stack.pop()!
      let entries: string[]
      try { entries = fs.readdirSync(cur) } catch { continue }
      for (const entry of entries) {
        const full = path.join(cur, entry)
        let stat: fs.Stats
        try { stat = fs.statSync(full) } catch { continue }
        if (stat.isDirectory()) {
          if (depth < maxDepth) stack.push([full, depth + 1])
        } else if (isAudioFile(entry)) {
          // Subcategory = the path between rootDir and the parent of the
          // file, joined by " / ". For files directly in rootDir the
          // subcategory is null.
          const rel = path.relative(rootDir, path.dirname(full))
          const subcategory = rel && rel !== '.' ? rel.split(/[\\/]/).join(' / ') : null
          out.push({ absolutePath: full, filename: entry, subcategory })
        }
      }
    }
    return out
  }

  ipcMain.handle('xyrene:listSounds', async (_ev, opts?: { dedupe?: boolean; includeJunk?: boolean }) => {
    const dedupe = opts?.dedupe ?? true
    const includeJunk = opts?.includeJunk ?? false
    try {
      const home = app.getPath('home')
      // Each root is `{ rootDir, label }` — the label is what shows in the
      // picker dropdown for files DIRECTLY at the root level.
      const probedRoots: Array<{ rootDir: string; label: string }> = []
      const candidates = [
        { rootDir: path.join(process.cwd(), 'NSFW Soundpack'), label: 'NSFW Soundpack' },
        { rootDir: path.join(app.getPath('userData'), 'NSFW Soundpack'), label: 'NSFW Soundpack' },
        { rootDir: path.join(home, 'Vault', 'Soundpacks'), label: 'Soundpacks' },
        { rootDir: path.join(app.getPath('userData'), 'Soundpacks'), label: 'Soundpacks' },
      ]
      for (const c of candidates) {
        if (fs.existsSync(c.rootDir)) probedRoots.push(c)
      }

      type FileRow = {
        filename: string
        intensity: number
        tags: string[]
        subcategory: string | null
        variants?: number
        absolutePath: string
      }
      type Category = { name: string; total: number; rawTotal?: number; files: FileRow[] }

      const isJunkSubcategory = (sub: string | null): boolean => {
        if (!sub || includeJunk) return false
        const lower = sub.toLowerCase()
        return JUNK_SUBSTRINGS.some((needle) => lower.includes(needle))
      }

      let totalReturned = 0
      let totalFiltered = 0
      let totalDeduped = 0
      const categoryMap = new Map<string, FileRow[]>()  // categoryName → files

      for (const { rootDir, label } of probedRoots) {
        // Files directly in rootDir → category = label
        // Each immediate subfolder → category = subfolder basename
        let entries: string[]
        try { entries = fs.readdirSync(rootDir) } catch { continue }

        const rootLevelFiles: WalkedFile[] = []
        for (const entry of entries) {
          const full = path.join(rootDir, entry)
          let stat: fs.Stats
          try { stat = fs.statSync(full) } catch { continue }
          if (stat.isDirectory()) {
            // Each immediate subfolder is its own category. Walk it
            // recursively; its sub-subfolders become subcategories.
            const walked = walkAudioRecursive(full, full)
            if (walked.length === 0) continue
            const catName = entry
            const arr = categoryMap.get(catName) ?? []
            for (const w of walked) {
              arr.push({
                filename: w.filename,
                absolutePath: w.absolutePath,
                subcategory: w.subcategory,
                intensity: 3,
                tags: [],
              })
            }
            categoryMap.set(catName, arr)
          } else if (isAudioFile(entry)) {
            rootLevelFiles.push({ absolutePath: full, filename: entry, subcategory: null })
          }
        }
        if (rootLevelFiles.length > 0) {
          const arr = categoryMap.get(label) ?? []
          for (const w of rootLevelFiles) {
            arr.push({
              filename: w.filename,
              absolutePath: w.absolutePath,
              subcategory: null,
              intensity: 3,
              tags: [],
            })
          }
          categoryMap.set(label, arr)
        }
      }

      const categories: Category[] = []
      for (const [name, allFiles] of categoryMap) {
        if (!includeJunk && JUNK_PACKS.has(name.toLowerCase())) {
          totalFiltered += allFiles.length
          continue
        }
        const cleaned = allFiles.filter(f => !isJunkSubcategory(f.subcategory))
        totalFiltered += allFiles.length - cleaned.length

        let files: FileRow[] = cleaned
        if (dedupe) {
          const groups = new Map<string, FileRow[]>()
          for (const f of cleaned) {
            const key = `${f.subcategory ?? ''}::${dedupeKey(f.filename)}`
            const a = groups.get(key)
            if (a) a.push(f)
            else groups.set(key, [f])
          }
          files = []
          for (const arr of groups.values()) {
            if (arr.length === 0) continue
            arr.sort((a, b) => a.filename.length - b.filename.length || a.filename.localeCompare(b.filename))
            const rep = arr[0]
            if (arr.length > 1) {
              rep.variants = arr.length
              totalDeduped += arr.length - 1
            }
            files.push(rep)
          }
        }
        totalReturned += files.length
        categories.push({ name, total: files.length, rawTotal: allFiles.length, files })
      }
      // Sort categories alphabetically for stable dropdown order.
      categories.sort((a, b) => a.name.localeCompare(b.name))

      const totalFiles = [...categoryMap.values()].reduce((acc, a) => acc + a.length, 0)

      return {
        version: '2',
        totalFiles,
        totalReturned,
        totalFiltered,
        totalDeduped,
        categories,
        meta: {
          dedupe,
          includeJunk,
          junkPacks: Array.from(JUNK_PACKS),
          junkSubstrings: JUNK_SUBSTRINGS,
          source: 'folder-scan',
        },
      }
    } catch (err) {
      console.warn('[Xyrene] listSounds failed:', err)
      return { categories: [] as Array<{ name: string; files: any[] }> }
    }
  })

  // Get / set xyrene settings (a thin wrapper over the unified VaultSettings
  // store so the renderer doesn't have to reach into the full settings tree).
  ipcMain.handle('xyrene:getSettings', async () => {
    const s = getSettings() as VaultSettings
    return s.xyrene
  })

  ipcMain.handle('xyrene:setSettings', async (_ev, patch: Partial<VaultSettings['xyrene']>) => {
    const current = getSettings() as VaultSettings
    const merged = {
      ...current.xyrene,
      ...patch,
      sounds: { ...current.xyrene.sounds, ...(patch.sounds ?? {}) },
      // Shallow-merge soundsEnabled the same way as sounds so partial
      // patches (e.g. toggling one slot) don't blow away the rest of the map.
      soundsEnabled: { ...(current.xyrene.soundsEnabled ?? {}), ...((patch as any).soundsEnabled ?? {}) },
    }
    updateSettings({ xyrene: merged } as Partial<VaultSettings>)
    // If charactersDir changed, push it to the loader immediately.
    if (typeof patch.charactersDir === 'string') {
      const { getCharacterLoader } = await import('../xyrene/character-loader')
      const dir = patch.charactersDir.trim()
      if (dir) getCharacterLoader().setDir(dir)
    }
    return { success: true, settings: merged }
  })

  // Curate a soundpack file into Xyrene's dedicated curated folder. Copies
  // the source file (NOT moves — original stays in the soundpack) into
  // `userData/xyrene_curated/<category>/` with an auto-renamed filename
  // like `xyreneplap1.wav`. Indexes incrementally — finds the lowest
  // unused index per category. Returns the curated absolute path.
  //
  // Source is searched relative to the soundpack roots so the renderer
  // doesn't need to know the underlying filesystem layout — it sends the
  // relative filename + category and the main process resolves it.
  ipcMain.handle('xyrene:curateSound', async (_ev, args: { sourcePath: string; category: string }) => {
    const { app } = await import('electron')
    const fs = await import('node:fs')
    const path = await import('node:path')

    // Allow underscores so multi-word categories like vibrator_start /
    // vibrator_stop survive intact. Strip everything else that isn't safe
    // for a filename.
    const cat = String(args.category || '').toLowerCase().replace(/[^a-z_]/g, '') || 'extra'
    const curatedRoot = path.join(app.getPath('userData'), 'xyrene_curated', cat)
    fs.mkdirSync(curatedRoot, { recursive: true })

    // Resolve source — accept absolute or relative path. If relative, probe
    // the same locations the SoundOrganizer scans so the renderer doesn't
    // need filesystem awareness.
    let resolvedSource: string | null = null
    const candidates: string[] = []
    if (path.isAbsolute(args.sourcePath) && fs.existsSync(args.sourcePath)) {
      resolvedSource = args.sourcePath
    } else {
      // Same probe order as autoOrganizeSoundpack
      const home = app.getPath('home')
      const roots = [
        path.join(process.cwd(), 'NSFW Soundpack'),
        path.join(app.getPath('userData'), 'NSFW Soundpack'),
        path.join(home, 'Vault', 'Soundpacks'),
        path.join(app.getPath('userData'), 'Soundpacks'),
        path.join(app.getPath('userData'), 'audio', 'voice'),
      ]
      for (const r of roots) {
        const p = path.join(r, args.sourcePath)
        candidates.push(p)
        if (fs.existsSync(p)) { resolvedSource = p; break }
      }
      // If not found at root level, try a recursive search by basename (slow,
      // but only triggered when the user picks a file we couldn't directly
      // locate). Capped at one level deep to keep latency bounded.
      if (!resolvedSource) {
        const basename = path.basename(args.sourcePath)
        for (const r of roots) {
          if (!fs.existsSync(r)) continue
          try {
            const sub = fs.readdirSync(r)
            for (const s of sub) {
              const subDir = path.join(r, s)
              try {
                if (!fs.statSync(subDir).isDirectory()) continue
              } catch { continue }
              const candidate = path.join(subDir, basename)
              if (fs.existsSync(candidate)) { resolvedSource = candidate; break }
            }
          } catch { /* ignore */ }
          if (resolvedSource) break
        }
      }
    }

    if (!resolvedSource) {
      throw new Error(`Source sound file not found: ${args.sourcePath}`)
    }

    // Find the lowest unused index for this category.
    const ext = path.extname(resolvedSource).toLowerCase() || '.wav'
    let n = 1
    let curatedPath: string
    while (true) {
      curatedPath = path.join(curatedRoot, `xyrene${cat}${n}${ext}`)
      if (!fs.existsSync(curatedPath)) break
      n++
      if (n > 999) throw new Error('Curated slot overflow — somehow you have 999+ sounds in one category')
    }

    fs.copyFileSync(resolvedSource, curatedPath)
    console.log(`[Xyrene] Curated ${path.basename(resolvedSource)} → ${path.basename(curatedPath)}`)

    // Best-effort: analyze loudness/intensity right after curate so the
    // sound has a sidecar meta JSON before the user even tries the test
    // session. Analysis failures are non-fatal — engine falls back to
    // neutral intensity 0.5 for any sound missing meta.
    try {
      await analyzeSoundFile(curatedPath).catch((e) => {
        console.warn(`[Xyrene] analyzeSoundFile failed for ${path.basename(curatedPath)}:`, e?.message ?? e)
      })
    } catch { /* swallow */ }

    return {
      curatedPath,
      curatedFilename: path.basename(curatedPath),
      category: cat,
      sourcePath: resolvedSource,
    }
  })

  // ─── Sound intensity analysis ──────────────────────────────────────────
  //
  // Per-sound loudness scoring so the playback engine can pick samples
  // matching the current scene intensity (quiet ASMR moans during slow
  // moments, peak climax moans during peaks). Analysis writes a sidecar
  // JSON next to each curated file at <file>.meta.json:
  //
  //   { "rmsDb": -23.4, "peakDb": -3.1, "durationSec": 1.7,
  //     "intensity": 0.62, "analyzedAt": "2026-05-09T..." }
  //
  // intensity = clamp(0.6 * peakNorm + 0.4 * meanNorm, 0, 1) where
  // norm = (db + 60) / 60 so -60dB → 0, 0dB → 1.
  async function runFfmpegVolumedetect(filePath: string): Promise<{ rmsDb: number; peakDb: number; durationSec: number }> {
    const { ffmpegBin } = await import('../../ffpaths')
    if (!ffmpegBin) throw new Error('ffmpeg binary not available')
    const { spawn } = await import('node:child_process')

    return new Promise((resolve, reject) => {
      const proc = spawn(ffmpegBin, [
        '-hide_banner',
        '-i', filePath,
        '-af', 'volumedetect',
        '-vn', '-sn', '-dn',
        '-f', 'null', '-',
      ], { windowsHide: true })

      let stderr = ''
      proc.stderr.on('data', (chunk) => { stderr += chunk.toString() })
      proc.on('error', (err) => reject(err))
      proc.on('close', () => {
        // Parse: "[Parsed_volumedetect ... ] mean_volume: -23.4 dB"
        //        "[Parsed_volumedetect ... ] max_volume: -3.1 dB"
        //        "Duration: 00:00:01.70, ..."
        const mean = /mean_volume:\s*(-?\d+(?:\.\d+)?)\s*dB/i.exec(stderr)
        const peak = /max_volume:\s*(-?\d+(?:\.\d+)?)\s*dB/i.exec(stderr)
        const dur = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/i.exec(stderr)
        const rmsDb = mean ? parseFloat(mean[1]) : -60
        const peakDb = peak ? parseFloat(peak[1]) : -60
        const durationSec = dur
          ? parseInt(dur[1], 10) * 3600 + parseInt(dur[2], 10) * 60 + parseFloat(dur[3])
          : 0
        if (!mean && !peak) {
          reject(new Error(`Could not parse volumedetect output: ${stderr.slice(-200)}`))
          return
        }
        resolve({ rmsDb, peakDb, durationSec })
      })
    })
  }

  function dbToNormalized(db: number): number {
    // -60dB → 0, 0dB → 1, clamped
    return Math.max(0, Math.min(1, (db + 60) / 60))
  }

  async function analyzeSoundFile(curatedPath: string): Promise<{
    rmsDb: number; peakDb: number; durationSec: number; intensity: number; analyzedAt: string
  }> {
    const { rmsDb, peakDb, durationSec } = await runFfmpegVolumedetect(curatedPath)
    // Peak-weighted because punchy short SFX (slaps, plaps) live more in
    // the peak than the mean. Long sustained moans get reasonable scores
    // either way.
    const intensity = 0.6 * dbToNormalized(peakDb) + 0.4 * dbToNormalized(rmsDb)
    const meta = { rmsDb, peakDb, durationSec, intensity, analyzedAt: new Date().toISOString() }
    const metaPath = curatedPath + '.meta.json'
    fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2), 'utf8')
    return meta
  }

  ipcMain.handle('xyrene:analyzeSound', async (_ev, args: { curatedFilename: string; category: string }) => {
    const cat = String(args.category || '').toLowerCase().replace(/[^a-z_]/g, '') || 'extra'
    const curatedRoot = path.join(app.getPath('userData'), 'xyrene_curated', cat)
    const curatedPath = path.join(curatedRoot, args.curatedFilename)
    if (!fs.existsSync(curatedPath)) throw new Error(`Curated file not found: ${args.curatedFilename}`)
    return await analyzeSoundFile(curatedPath)
  })

  ipcMain.handle('xyrene:getSoundMeta', async (_ev, args: { curatedFilename: string; category: string }) => {
    const cat = String(args.category || '').toLowerCase().replace(/[^a-z_]/g, '') || 'extra'
    const curatedRoot = path.join(app.getPath('userData'), 'xyrene_curated', cat)
    const metaPath = path.join(curatedRoot, args.curatedFilename + '.meta.json')
    if (!fs.existsSync(metaPath)) return null
    try { return JSON.parse(fs.readFileSync(metaPath, 'utf8')) } catch { return null }
  })

  // Bulk analyze: walks every curated category folder, runs the analyzer
  // on any file lacking a sidecar meta JSON. Sequential — concurrency is
  // bounded by ffmpeg startup cost, not parallelism.
  ipcMain.handle('xyrene:analyzeAllSounds', async (_ev, opts?: { force?: boolean }) => {
    const force = opts?.force ?? false
    const root = path.join(app.getPath('userData'), 'xyrene_curated')
    if (!fs.existsSync(root)) return { analyzed: 0, skipped: 0, failed: 0 }

    const cats = fs.readdirSync(root).filter((c) => {
      try { return fs.statSync(path.join(root, c)).isDirectory() } catch { return false }
    })

    let analyzed = 0
    let skipped = 0
    let failed = 0

    for (const cat of cats) {
      const catDir = path.join(root, cat)
      let files: string[]
      try { files = fs.readdirSync(catDir) } catch { continue }
      for (const f of files) {
        if (f.endsWith('.meta.json')) continue
        const full = path.join(catDir, f)
        const metaPath = full + '.meta.json'
        if (!force && fs.existsSync(metaPath)) { skipped++; continue }
        try {
          await analyzeSoundFile(full)
          analyzed++
        } catch (err) {
          console.warn(`[Xyrene] analyzeAllSounds: ${cat}/${f} failed:`, (err as any)?.message ?? err)
          failed++
        }
      }
    }
    console.log(`[Xyrene] analyzeAllSounds: analyzed=${analyzed} skipped=${skipped} failed=${failed}`)
    return { analyzed, skipped, failed }
  })

  // Resolve a playable file:// URL for a curated sound (or any soundpack
  // file). Used by the settings panel's preview-play button.
  //
  // Resolution order:
  //   1. absolute path → use directly
  //   2. relative path joined to each known root
  //   3. recursive search by basename through SoundOrganizer's category
  //      tree at userData/audio/voice/<category>/<basename> — the organizer
  //      ALWAYS copies files into category subfolders so a flat-name lookup
  //      from the renderer (which only has filename + pack from the
  //      manifest) needs to walk the tree to find the actual location.
  //      Capped at one level deep beyond each root for latency.
  ipcMain.handle('xyrene:previewSoundUrl', async (_ev, soundPath: string) => {
    const { toVaultUrl } = await import('../../vaultProtocol')

    let resolved: string | null = null
    if (path.isAbsolute(soundPath) && fs.existsSync(soundPath)) {
      resolved = soundPath
    } else {
      const home = app.getPath('home')
      const roots = [
        path.join(app.getPath('userData'), 'xyrene_curated'),
        path.join(app.getPath('userData'), 'audio', 'voice'),
        path.join(process.cwd(), 'NSFW Soundpack'),
        path.join(home, 'Vault', 'Soundpacks'),
      ]
      // Pass 1: literal join — fast path for already-located files.
      for (const r of roots) {
        const p = path.join(r, soundPath)
        if (fs.existsSync(p)) { resolved = p; break }
      }
      // Pass 2: BFS walk subfolders looking for the basename. Bounded by
      // depth (5 levels deep covers OpenNSFW SFX's Pack/Sub/file plus
      // headroom) and total visited count (10k dirs max — soundpacks have
      // hundreds of subfolders, never tens of thousands).
      if (!resolved) {
        const basename = path.basename(soundPath)
        for (const r of roots) {
          if (resolved) break
          if (!fs.existsSync(r)) continue
          try {
            // Each item: [dir, depth]
            const queue: Array<[string, number]> = [[r, 0]]
            let visited = 0
            while (queue.length > 0 && !resolved && visited < 10000) {
              const [dir, depth] = queue.shift()!
              visited++
              const candidate = path.join(dir, basename)
              if (fs.existsSync(candidate)) {
                try {
                  if (fs.statSync(candidate).isFile()) { resolved = candidate; break }
                } catch { /* ignore */ }
              }
              if (depth >= 5) continue
              try {
                const entries = fs.readdirSync(dir)
                for (const entry of entries) {
                  const full = path.join(dir, entry)
                  try {
                    if (fs.statSync(full).isDirectory()) queue.push([full, depth + 1])
                  } catch { /* ignore */ }
                }
              } catch { /* ignore */ }
            }
          } catch { /* ignore */ }
        }
      }
    }
    if (!resolved) {
      console.warn('[Xyrene] previewSoundUrl: file not found:', soundPath)
      return null
    }
    // Use vault:// (registered as a privileged scheme that bypasses
    // Electron's file:// renderer block) so the Audio element can actually
    // load the bytes. file:// URLs would be silently rejected by webSecurity.
    return toVaultUrl(resolved)
  })

  // ─────────────────────────────────────────────────────────────────────────
  // XYRENE BRAIN — editable simplified personality files. Stored in
  // `userData/xyrene_brain/<category>.md`. Categories are sex-focused only
  // (no general-life facts about user). Loaded into her system prompt at
  // commentary time. User edits never get overwritten by auto-appends — the
  // session-learner only appends new bullets with [learned] prefix below
  // a clearly-marked separator (task #44).
  // ─────────────────────────────────────────────────────────────────────────
  const BRAIN_CATEGORIES = [
    {
      id: 'about_you_sexually',
      label: 'What she knows about you sexually',
      placeholder: '(blank = she infers from your vault)\nExamples:\n- I edge for hours, hate quick finishes\n- Love being told I\'m pathetic\n- Into stepmom roleplay scenarios',
    },
    {
      id: 'her_kinks',
      label: 'Her kinks (what she leans into)',
      placeholder: 'Examples:\n- Loves squirting, especially when she gets to make herself do it\n- Praise kink — both giving and receiving\n- Nipple play, tits in general',
    },
    {
      id: 'her_limits',
      label: 'Her limits (hard nos)',
      placeholder: 'Examples:\n- Anything involving minors — instant out\n- No actual scat / vomit\n- Won\'t pretend to be a different person / cheat-on-her-bf scenes',
    },
    {
      id: 'what_she_likes',
      label: 'What she likes (favorite acts / videos / themes)',
      placeholder: 'Examples:\n- POV blowjobs where you can hear breathing\n- Long edging compilations\n- Thick latina pawg content',
    },
    {
      id: 'her_interests',
      label: 'Her sex-relevant interests',
      placeholder: 'Examples:\n- Toy reviews and recommendations\n- New positions she wants to try\n- Specific fetishes she\'s curious about',
    },
  ] as const

  function getBrainDir(): string {
    const dir = path.join(app.getPath('userData'), 'xyrene_brain')
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    return dir
  }

  ipcMain.handle('xyrene:listBrain', async () => {
    const dir = getBrainDir()
    return BRAIN_CATEGORIES.map((cat) => {
      const filePath = path.join(dir, `${cat.id}.md`)
      let content = ''
      let exists = false
      let updatedAt: string | null = null
      try {
        if (fs.existsSync(filePath)) {
          content = fs.readFileSync(filePath, 'utf8')
          exists = true
          updatedAt = fs.statSync(filePath).mtime.toISOString()
        }
      } catch (err) {
        console.warn(`[Xyrene] failed to read brain file ${cat.id}:`, err)
      }
      return {
        id: cat.id,
        label: cat.label,
        placeholder: cat.placeholder,
        content,
        exists,
        updatedAt,
        path: filePath,
      }
    })
  })

  ipcMain.handle('xyrene:writeBrain', async (_ev, args: { id: string; content: string }) => {
    const cat = BRAIN_CATEGORIES.find(c => c.id === args.id)
    if (!cat) throw new Error(`Unknown brain category: ${args.id}`)
    const dir = getBrainDir()
    const filePath = path.join(dir, `${cat.id}.md`)
    fs.writeFileSync(filePath, String(args.content ?? ''), 'utf8')
    return { success: true, path: filePath, updatedAt: new Date().toISOString() }
  })

  // Bootstrap her brain from the xyrene-portable bibles. Reads the
  // sex-relevant files, sends them to Venice with a simplification prompt,
  // writes ≤5 short bullets per brain category. Overwrites existing brain
  // files unless `preserveExisting` is true (in which case it appends to
  // any non-empty user content via the auto-separator path).
  //
  // Triggered by the "Pre-populate from her bibles" button.
  ipcMain.handle('xyrene:bootstrapBrain', async (_ev, args?: { preserveExisting?: boolean }) => {
    if (!tier2Vision || !tier2Vision.isEnabled()) {
      throw new Error('Venice (Tier 2) not configured — required for bootstrap')
    }
    const { getCharacterLoader } = await import('../xyrene/character-loader')
    const loader = getCharacterLoader()
    const docsDir = loader.getDir()
    if (!fs.existsSync(docsDir)) {
      throw new Error(`Character bible directory not found: ${docsDir}`)
    }

    // Read every sex-relevant bible. Skip the relationship / general-life
    // ones — those don't belong in the goon-bud brain.
    const SEX_RELEVANT_FILES = [
      'PERSONALITY.md',
      'SEX_LEXICON.md',
      'REACTIONS.md',
      'STAGE_PREFERENCES.md',
      'MOOD_LAYERING.md',
      'SLANG_GLOSSARY.md',
      'INSIDE_JOKES.md',
      'XYRENE_MASTER.md',
    ]
    const bibleChunks: string[] = []
    for (const f of SEX_RELEVANT_FILES) {
      const p = path.join(docsDir, f)
      if (!fs.existsSync(p)) continue
      try {
        const raw = fs.readFileSync(p, 'utf8')
        // Cap each file at 8KB so the bundled prompt stays under model limits.
        bibleChunks.push(`=== ${f} ===\n${raw.slice(0, 8000)}`)
      } catch (err) {
        console.warn(`[Xyrene bootstrap] failed to read ${f}:`, err)
      }
    }
    if (bibleChunks.length === 0) {
      throw new Error('No bible files found in character directory')
    }

    const corpus = bibleChunks.join('\n\n---\n\n')

    const systemPrompt = `You distill an adult AI character's bible into a SHORT user-facing profile across 5 sex-focused categories. Output JSON only — no preamble, no markdown fences.

Categories:
- about_you_sexually: things she'd assume / know about Noah's sexual preferences (write as if she's reflecting on him; if the bible says nothing about Noah specifically, leave empty)
- her_kinks: kinks she leans into / shows enthusiasm for
- her_limits: hard nos / things she balks at / things to avoid
- what_she_likes: favorite acts / video types / themes she's drawn to
- her_interests: sex-relevant interests (toys she's curious about, fetishes she wants to explore, etc.)

OUTPUT FORMAT — return ONLY this JSON:
{
  "about_you_sexually": ["...", "..."],
  "her_kinks": ["...", "..."],
  "her_limits": ["...", "..."],
  "what_she_likes": ["...", "..."],
  "her_interests": ["...", "..."]
}

RULES:
- 3-7 bullets per category. Each bullet ≤140 chars.
- Vulgar OK — porn-site vocabulary. NEVER hedge ("implied" / "appears to" forbidden).
- NO general-life facts (skip music taste, hobbies, day-to-day stuff). SEX ONLY.
- Plain English, NOT bible-jargon. If the bible says "she has a praise/punishment-loop axis", you write "Loves being told she's a good girl, even more loves being called a slut."
- Skip categories where the bible has no real signal (empty array OK).`

    let raw: string
    try {
      raw = await tier2Vision.callLLMText(systemPrompt, corpus, { temperature: 0.4, maxTokens: 1600 })
    } catch (err) {
      throw new Error(`Venice call failed: ${(err as Error).message}`)
    }

    let parsed: Record<string, string[]> = {}
    try {
      const m = raw.match(/\{[\s\S]*\}/)
      parsed = m ? JSON.parse(m[0]) : {}
    } catch (err) {
      console.warn('[Xyrene bootstrap] JSON parse failed:', err, 'raw:', raw.slice(0, 200))
      throw new Error('Venice returned non-JSON response')
    }

    const dir = getBrainDir()
    const today = new Date().toISOString().slice(0, 10)
    const result: Record<string, { written: boolean; bulletCount: number; preserved: boolean }> = {}

    for (const cat of BRAIN_CATEGORIES) {
      const bullets = Array.isArray(parsed[cat.id]) ? parsed[cat.id] : []
      const filePath = path.join(dir, `${cat.id}.md`)
      const exists = fs.existsSync(filePath) && fs.readFileSync(filePath, 'utf8').trim().length > 0

      if (bullets.length === 0) {
        result[cat.id] = { written: false, bulletCount: 0, preserved: exists }
        continue
      }

      const bulletText = bullets
        .map(b => `- ${String(b).trim().replace(/^[-*•]\s+/, '')}`)
        .join('\n')

      let content: string
      if (exists && args?.preserveExisting) {
        // Append below the auto separator so user-written content stays.
        const existing = fs.readFileSync(filePath, 'utf8')
        const sep = AUTO_SEPARATOR
        const dated = `<!-- bootstrapped ${today} -->\n${bulletText}`
        if (existing.includes(sep)) {
          content = existing.trimEnd() + '\n' + dated + '\n'
        } else {
          content = existing.trimEnd() + '\n\n' + sep + '\n' + dated + '\n'
        }
        result[cat.id] = { written: true, bulletCount: bullets.length, preserved: true }
      } else {
        content = `<!-- bootstrapped ${today} from xyrene-portable bibles · edit freely -->\n${bulletText}\n`
        result[cat.id] = { written: true, bulletCount: bullets.length, preserved: false }
      }
      fs.writeFileSync(filePath, content, 'utf8')
    }

    return { success: true, perCategory: result, sourceFiles: bibleChunks.length }
  })

  // After a Watch-With-Xy session, summarize what was watched + how Xyrene
  // reacted, then APPEND short learning bullets to the appropriate brain
  // category files. User-written content is sacred — appends land below an
  // auto-managed separator (created on first append). Each line gets a
  // [learned YYYY-MM-DD] prefix so the user can scan-edit them.
  //
  // Bullets are scoped: a learning ONLY appends to a category if Venice
  // returns content for that key. Empty array = no append.
  const AUTO_SEPARATOR = '<!-- AUTO-LEARNED BELOW THIS LINE — edit/delete freely -->'
  ipcMain.handle('xyrene:appendSessionLearnings', async (_ev, args: {
    mediaIds: string[]              // what was watched in this session
    xyComments: string[]            // her recent comments (last 12-ish)
    userVoiceLines?: string[]        // future STT input
    durationSec: number              // how long the session ran
  }) => {
    if (!tier2Vision || !tier2Vision.isEnabled()) return { appended: 0, perCategory: {} }
    if (args.durationSec < 60 && args.xyComments.length < 3) {
      return { appended: 0, perCategory: {}, skipped: 'session too short' }
    }

    // Collect per-media tag profiles to give Venice meaningful input.
    const tagFreq = new Map<string, number>()
    const titles: string[] = []
    for (const id of args.mediaIds.slice(0, 30)) {
      try {
        const row = db.raw.prepare(`
          SELECT m.filename, m.title, ar.matched_tags, ar.suggested_title
          FROM media m
          LEFT JOIN ai_analysis_results ar ON ar.media_id = m.id
          WHERE m.id = ?
        `).get(id) as any
        if (!row) continue
        titles.push(row.suggested_title || row.title || row.filename || '')
        if (row.matched_tags) {
          try {
            const tags = JSON.parse(row.matched_tags) as Array<{ name?: string }>
            for (const t of tags) {
              const n = String(t?.name ?? '').toLowerCase().trim()
              if (n) tagFreq.set(n, (tagFreq.get(n) ?? 0) + 1)
            }
          } catch { /* ignore */ }
        }
      } catch { /* ignore */ }
    }
    const topTags = [...tagFreq.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 30)
      .map(([name, count]) => `${name}(${count})`)

    const summary = `Session length: ${(args.durationSec / 60).toFixed(1)} min, ${args.mediaIds.length} videos, ${args.xyComments.length} reactions.

Top tags this session: ${topTags.join(', ') || '(none)'}
Sample video titles: ${titles.slice(0, 6).map(t => `"${t}"`).join(' / ')}
Xyrene reactions (sample): ${args.xyComments.slice(-6).map(c => `"${c.slice(0, 80)}"`).join(' / ')}
${args.userVoiceLines?.length ? `User voice lines: ${args.userVoiceLines.slice(-6).map(c => `"${c.slice(0, 80)}"`).join(' / ')}` : ''}`

    const systemPrompt = `You are an extractor that learns from a porn-watching session and produces VERY SHORT bullets to append to a curated profile. The profile has 5 sex-focused categories. Return JSON ONLY in the exact shape below. Each value is an array of zero or more bullets (≤140 chars each). Only emit a bullet if the session ACTUALLY supports it — empty arrays are fine.

Categories:
- about_you_sexually: things you learned about Noah's sexual preferences from his choices this session
- her_kinks: kinks Xyrene leaned into / showed enthusiasm for in her reactions
- her_limits: anything she balked at or that should be avoided
- what_she_likes: video categories / acts the session showed strong engagement with
- her_interests: sex-relevant interests surfaced by the content viewed

OUTPUT FORMAT — return ONLY this JSON, no preamble:
{
  "about_you_sexually": ["...", "..."],
  "her_kinks": ["...", "..."],
  "her_limits": [],
  "what_she_likes": ["...", "..."],
  "her_interests": []
}

RULES:
- ≤2 bullets per category. Quality over quantity.
- Each bullet a single short observation. No essays.
- Vulgar OK; clinical NOT ok.
- Skip categories with no real signal — empty array is correct, NOT a guess.
- NEVER repeat what's already in the user's existing profile (assume non-overlap; the writer dedupes).`

    let raw: string
    try {
      raw = await tier2Vision.callLLMText(systemPrompt, summary, { temperature: 0.5, maxTokens: 800 })
    } catch (err) {
      console.warn('[Xyrene] learning extraction failed:', err)
      return { appended: 0, perCategory: {}, error: String(err) }
    }

    let parsed: Record<string, string[]> = {}
    try {
      const m = raw.match(/\{[\s\S]*\}/)
      parsed = m ? JSON.parse(m[0]) : {}
    } catch (err) {
      console.warn('[Xyrene] learning JSON parse failed:', err, 'raw:', raw.slice(0, 200))
      return { appended: 0, perCategory: {}, error: 'parse failed' }
    }

    const dir = getBrainDir()
    const today = new Date().toISOString().slice(0, 10)
    const perCategory: Record<string, number> = {}
    let totalAppended = 0

    for (const cat of BRAIN_CATEGORIES) {
      const bullets = Array.isArray(parsed[cat.id]) ? parsed[cat.id].slice(0, 2) : []
      if (bullets.length === 0) continue
      const filePath = path.join(dir, `${cat.id}.md`)
      let existing = ''
      if (fs.existsSync(filePath)) existing = fs.readFileSync(filePath, 'utf8')

      // Ensure separator exists exactly once.
      if (!existing.includes(AUTO_SEPARATOR)) {
        existing = existing.trimEnd() + (existing.trim() ? '\n\n' : '') + AUTO_SEPARATOR + '\n'
      }

      // De-dupe: skip a bullet if its core text already appears in the file.
      const additions: string[] = []
      for (const b of bullets) {
        const trimmed = String(b).trim()
        if (!trimmed || trimmed.length < 4) continue
        // Strip leading "- " if model added it.
        const core = trimmed.replace(/^[-*•]\s+/, '').replace(/^\[learned[^\]]*\]\s*/i, '')
        if (existing.toLowerCase().includes(core.toLowerCase().slice(0, 40))) continue
        additions.push(`- [learned ${today}] ${core}`)
      }
      if (additions.length === 0) continue

      const updated = existing.trimEnd() + '\n' + additions.join('\n') + '\n'
      fs.writeFileSync(filePath, updated, 'utf8')
      perCategory[cat.id] = additions.length
      totalAppended += additions.length
    }

    if (totalAppended > 0) {
      console.log(`[Xyrene] appended ${totalAppended} learning bullet(s) across ${Object.keys(perCategory).length} categor(ies)`)
    }

    // Persist a session log entry so the user can SEE that learning is
    // happening over time. JSONL append-only — cheap to write, easy to
    // read back. Bounded by a soft trim policy (last 200 entries kept).
    try {
      const logPath = path.join(dir, '_session_log.jsonl')
      const entry = {
        ts: new Date().toISOString(),
        durationSec: Math.round(args.durationSec),
        mediaCount: args.mediaIds.length,
        commentCount: args.xyComments.length,
        appended: totalAppended,
        perCategory,
      }
      fs.appendFileSync(logPath, JSON.stringify(entry) + '\n', 'utf8')
      // Soft trim: when the file passes ~200 entries, keep only the
      // last 150 so we don't grow unbounded.
      try {
        const stat = fs.statSync(logPath)
        if (stat.size > 80_000) {
          const lines = fs.readFileSync(logPath, 'utf8').split('\n').filter(Boolean)
          if (lines.length > 200) {
            const kept = lines.slice(-150).join('\n') + '\n'
            fs.writeFileSync(logPath, kept, 'utf8')
          }
        }
      } catch { /* ignore trim errors */ }
    } catch (logErr) {
      console.warn('[Xyrene] session log write failed:', logErr)
    }

    return { appended: totalAppended, perCategory }
  })

  // Read the last N session-learning log entries (most recent first).
  // Used by the BrainEditor to surface "what she's learned recently".
  ipcMain.handle('xyrene:listSessionLearnings', async (_ev, opts?: { limit?: number }) => {
    const limit = Math.min(Math.max(opts?.limit ?? 20, 1), 200)
    const logPath = path.join(getBrainDir(), '_session_log.jsonl')
    if (!fs.existsSync(logPath)) return []
    try {
      const lines = fs.readFileSync(logPath, 'utf8').split('\n').filter(Boolean)
      const tail = lines.slice(-limit).reverse()
      return tail.map((l) => {
        try { return JSON.parse(l) } catch { return null }
      }).filter(Boolean)
    } catch (err) {
      console.warn('[Xyrene] listSessionLearnings read failed:', err)
      return []
    }
  })

  // Remove a curated sound — deletes the curated copy AND scrubs the
  // filename from xyrene.sounds.* arrays so it stops being played.
  ipcMain.handle('xyrene:uncurateSound', async (_ev, args: { curatedFilename: string; category: string }) => {
    const { app } = await import('electron')
    const fs = await import('node:fs')
    const path = await import('node:path')
    const cat = String(args.category || '').toLowerCase().replace(/[^a-z]/g, '') || 'extra'
    const file = path.join(app.getPath('userData'), 'xyrene_curated', cat, args.curatedFilename)
    if (fs.existsSync(file)) {
      try { fs.unlinkSync(file) } catch { /* ignore */ }
    }
    // Strip from settings
    const current = getSettings() as VaultSettings
    const slot = (current.xyrene.sounds as any)[cat] as string[] | undefined
    if (Array.isArray(slot)) {
      const next = slot.filter(p => path.basename(p) !== args.curatedFilename)
      updateSettings({
        xyrene: { ...current.xyrene, sounds: { ...current.xyrene.sounds, [cat]: next } }
      } as Partial<VaultSettings>)
    }
    return { success: true }
  })

  // Calibration summary — what the AI has learned from your review decisions.
  ipcMain.handle('ai:calibration-summary', async () => {
    const { getCalibrationService } = await import('./calibration-service')
    const svc = getCalibrationService(db)
    return {
      summary: svc.getSummary(),
      topApproved: svc.topByApproval(10, 3),
      // Tags the user keeps rejecting — surface so they can add to
      // protected/junk list or just understand AI weaknesses for their
      // collection.
      topRejected: svc.topByRejection(10, 3)
    }
  })

  // Co-occurrence suggestions — "tags you might also want" for the
  // review/edit UI. Builds a sparse cooccurrence matrix from approved
  // media, computes lift-score against the user's current selection.
  ipcMain.handle('ai:cooccurrence-suggest', async (_ev, args: {
    selected: string[]
    exclude?: string[]
    limit?: number
  }) => {
    const { suggestRelatedTags } = await import('./tag-cooccurrence')
    return suggestRelatedTags(
      db.raw,
      new Set((args.selected ?? []).map((s) => String(s).toLowerCase())),
      new Set((args.exclude ?? []).map((s) => String(s).toLowerCase())),
      args.limit ?? 8
    )
  })

  // Tags the user has rejected ≥N times with 0 approvals — surface as
  // candidates for auto-protection ("you've rejected `X` 12 times — add
  // to protected list so AI stops suggesting it?").
  ipcMain.handle('ai:protect-candidates', async (_ev, args?: { minRejections?: number }) => {
    const { getCalibrationService } = await import('./calibration-service')
    const svc = getCalibrationService(db)
    return svc.candidatesForAutoProtect(args?.minRejections ?? 10)
  })

  // Per-source rejection rates — "you reject 40% of `performer` tags".
  // Used to surface a confidence-histogram widget in the AI Tools tab.
  ipcMain.handle('ai:source-rejection-rates', async () => {
    const { getCalibrationService } = await import('./calibration-service')
    const svc = getCalibrationService(db)
    return svc.rejectionRatesBySource()
  })

  // Auto-start the JoyCaption Python sidecar — idempotent (returns
  // immediately if /health already responds). Mode picks bf16 or 4-bit
  // (the latter ~6-8GB VRAM vs ~17GB). Resolves once the sidecar
  // reports healthy, or fails fast if the install isn't there.
  ipcMain.handle('ai:joycaption-start', async (_ev, args?: { mode?: 'bf16' | '4bit' }) => {
    const { startJoyCaptionSidecar, findJoyCaptionSidecarDir } = await import('./joycaption-launcher')
    const installPath = findJoyCaptionSidecarDir()
    if (!installPath) {
      return {
        ok: false,
        reason: 'install_not_found' as const,
        message: 'No joycaption-sidecar directory found. Drop one at C:\\dev\\joycaption-sidecar and run setup.bat.',
      }
    }
    const ok = await startJoyCaptionSidecar({ mode: args?.mode ?? 'bf16' })
    return {
      ok,
      installPath,
      ...(ok ? {} : { reason: 'launch_failed' as const, message: 'Sidecar did not become healthy. Check the console window.' }),
    }
  })

  // Stop a sidecar Vault is currently managing. No-op when the user
  // started it manually.
  ipcMain.handle('ai:joycaption-stop', async () => {
    const { stopJoyCaptionSidecar, isManagingSidecar } = await import('./joycaption-launcher')
    const wasManaging = isManagingSidecar()
    stopJoyCaptionSidecar()
    return { ok: true, wasManaging }
  })

  // JoyCaption health + install detection. Returns:
  //   - installed: sidecar folder + venv detected
  //   - online: /health probe succeeded
  //   - model / device / vramGb when online
  ipcMain.handle('ai:joycaption-status', async () => {
    const { getJoyCaptionClient, findJoyCaptionSidecar } = await import('./joycaption-client')
    const installPath = findJoyCaptionSidecar()
    const client = getJoyCaptionClient()
    const health = await client.health()
    return {
      installed: !!installPath,
      installPath,
      online: !!health,
      ...(health ?? {}),
    }
  })

  // Contact-sheet file path for a media item (or null when missing).
  // Used by the AI Review pane to render the 4×3 frame grid.
  ipcMain.handle('ai:contact-sheet-path', async (_ev, mediaId: string) => {
    const { contactSheetPathFor } = await import('./contact-sheet')
    return contactSheetPathFor(mediaId)
  })

  // Histogram of pending review items by max rich_tag confidence. Used
  // by the Queue tab to preview "≈X of Y items would auto-apply at
  // this threshold" as the user moves the slider. Returns a 10-bucket
  // histogram from 0.50 → 0.95 (the slider's actual range).
  ipcMain.handle('ai:auto-approve-preview', async () => {
    const rows: Array<{ media_id: string; rich_tags: string | null }> = db.raw.prepare(`
      SELECT media_id, rich_tags
      FROM ai_analysis_results
      WHERE review_status = 'pending' AND rich_tags IS NOT NULL AND rich_tags != ''
    `).all() as any
    const maxConfs: number[] = []
    for (const r of rows) {
      if (!r.rich_tags) continue
      try {
        const arr = JSON.parse(r.rich_tags) as Array<{ confidence?: number }>
        let max = 0
        for (const t of arr) {
          if (typeof t.confidence === 'number' && t.confidence > max) max = t.confidence
        }
        if (max > 0) maxConfs.push(max)
      } catch { /* skip malformed */ }
    }
    const histogram: Array<{ threshold: number; count: number }> = []
    for (let t = 50; t <= 95; t += 5) {
      const tFloat = t / 100
      const count = maxConfs.filter((c) => c >= tFloat).length
      histogram.push({ threshold: tFloat, count })
    }
    return { total: maxConfs.length, histogram }
  })

  // Whisper.cpp transcriber status. Returns whether a usable install
  // is on disk (binary + model file) and whether the user has opted
  // in via settings. Used by the Setup tab to show a badge + toggle.
  ipcMain.handle('ai:whisper-status', async () => {
    const { findWhisperInstall } = await import('./whisper-transcriber')
    const { getSettings } = await import('../../settings')
    const install = findWhisperInstall()
    const enabled = !!(getSettings().ai as any)?.whisperEnabled
    return {
      installed: !!install,
      enabled,
      installDir: install?.installDir ?? null,
      binaryPath: install?.binaryPath ?? null,
      modelPath: install?.modelPath ?? null,
      modelName: install?.modelName ?? null,
    }
  })

  // Toggle the opt-in flag. The binary install is detected on disk;
  // this just controls whether the queue actually invokes transcription.
  ipcMain.handle('ai:whisper-set-enabled', async (_ev, enabled: boolean) => {
    const { updateAISettings, getAISettings } = await import('../../settings')
    updateAISettings({ ...getAISettings(), whisperEnabled: !!enabled } as any)
    return { ok: true, enabled: !!enabled }
  })

  // Person ReID status. Same install pattern as other detectors.
  ipcMain.handle('ai:person-reid-status', async () => {
    const fs = await import('node:fs')
    const path = await import('node:path')
    const { app } = await import('electron')
    const expectedPath = path.join(app.getPath('userData'), 'models', 'person-reid.onnx')
    let installed = false
    let sizeBytes = 0
    try {
      const stat = fs.statSync(expectedPath)
      installed = stat.isFile()
      sizeBytes = stat.size
    } catch { /* not installed */ }
    return { installed, expectedPath, sizeBytes }
  })

  // CLIP BPE tokenizer status — tells the renderer setup card whether
  // real BPE is active or the character-code fallback is in use. The
  // vocab file is a one-time drop at <userData>/models/clip-vocab.txt.gz
  // (Apache-2.0, from openai/CLIP repo).
  ipcMain.handle('ai:clip-bpe-status', async () => {
    const { getClipBpeStatus } = await import('./clip-bpe-tokenizer')
    return getClipBpeStatus()
  })

  // DB + CRNN OCR pipeline status. When both models are installed +
  // the user has opted in (settings.ai.useDbCrnnOcr), the queue's
  // OCR step uses the ONNX pipeline instead of tesseract.js.
  ipcMain.handle('ai:db-crnn-status', async () => {
    const { getDbCrnnStatus } = await import('./paddle-ocr')
    return getDbCrnnStatus()
  })

  // LAION aesthetic-predictor status. Linear/MLP head on Vault's
  // existing CLIP image embeddings — scores 0-10. Near-zero compute
  // cost once CLIP has run. Weights JSON drops at
  // <userData>/models/aesthetic-linear.json.
  ipcMain.handle('ai:aesthetic-status', async () => {
    const { getAestheticPredictorStatus } = await import('./aesthetic-predictor')
    return getAestheticPredictorStatus()
  })

  // Deepfake / AI-generated face detector status. ONNX binary classifier
  // on 224×224 face crops from YuNet. Drops at
  // <userData>/models/deepfake-detector.onnx. Paired with the OpenFake
  // research line; any face-classification ONNX with the same input
  // shape works.
  ipcMain.handle('ai:deepfake-status', async () => {
    const { getDeepfakeDetectorStatus } = await import('./deepfake-detector')
    return getDeepfakeDetectorStatus()
  })

  // Image-level AI-generated content detector (complements the
  // face-level deepfake detector). SigLIP / DINOv2 binary head on
  // the full frame. Drops at <userData>/models/ai-image-detector.onnx.
  ipcMain.handle('ai:ai-image-status', async () => {
    const { getAiImageDetectorStatus } = await import('./ai-image-detector')
    return getAiImageDetectorStatus()
  })

  // Registry of "optional ONNX you can drop in" models — TransNet,
  // VideoMAE, X-CLIP, TBT-Former, YAMNet, CLAP, Demucs, Essentia,
  // VideoChat-Flash. Returns one row per kind with installed flag +
  // expected path. Drives the Setup tab's "Extra models" gallery.
  ipcMain.handle('ai:extra-model-status', async (_ev, kind?: string) => {
    const { listExtraModelStatuses, getExtraModelStatus } = await import('./extra-model-status')
    if (typeof kind === 'string' && kind.length > 0) {
      return getExtraModelStatus(kind as any)
    }
    return listExtraModelStatuses()
  })

  // Studio recognizer — turn a source URL into a structured
  // {studio, network} match. Ported from PhoenixAdult's site-handler
  // list (~80 studios spanning Mindgeek / Vixen Media Group / Gamma /
  // Team Skeet / VR / JAV / amateur platforms). Used by Browse +
  // import flows to auto-tag `studio:NAME` / `network:NAME`.
  ipcMain.handle('media:recognize-studio', async (_ev, url: string) => {
    const { recognizeStudioFromUrl, studioMatchToTagNames } = await import('./studio-url-recognizer')
    if (typeof url !== 'string' || url.length === 0) return { ok: false, error: 'url required' }
    const match = recognizeStudioFromUrl(url)
    if (!match) return { ok: true, match: null, tagNames: [] }
    return { ok: true, match, tagNames: studioMatchToTagNames(match) }
  })

  // Multi-source scene metadata router. mdcx-style fallback chain:
  // tries TpDB first (hash lookup → free-text search), then StashDB
  // and FansDB-yaml as those sources get wired. Skipped sources
  // surface in the result so the UI can suggest "configure X to
  // improve coverage."
  ipcMain.handle('scene-metadata:lookup', async (_ev, ctx: {
    filename?: string
    title?: string
    hash?: string
    hashType?: 'phash' | 'oshash' | 'md5' | 'sha256' | 'crc32'
    knownPerformers?: string[]
    knownStudio?: string
  }) => {
    const { lookupSceneMetadata } = await import('./scene-metadata-router')
    return lookupSceneMetadata(ctx ?? {})
  })
  ipcMain.handle('scene-metadata:list-sources', async () => {
    const { listSceneSources } = await import('./scene-metadata-router')
    return listSceneSources()
  })

  // TpDB photos → ArcFace centroid importer (#23). Bootstraps a
  // named face cluster from a performer's TpDB photos so Tier 1 face
  // recognition can emit performer:NAME priors without waiting for
  // the user to manually name a cluster from face matches in their
  // own library. Returns a structured result with warnings — the UI
  // can show "12 photos, 11 had faces, 1 skipped (no face detected)."
  // "Find the part where X" — combines transcript FTS + marker /
  // chapter title search + CLIP image similarity into a unified
  // ranked moment list. Minimum-viable version of #102 that uses
  // only data Vault already stores; no per-frame embedding storage
  // needed. Precision varies per result: transcript / marker / chapter
  // give second-level locations, CLIP search gives video-level matches.
  ipcMain.handle('ai:find-the-part', async (_ev, opts: {
    query: string
    perSourceLimit?: number
    limit?: number
    includeClipSearch?: boolean
  }) => {
    const { findThePart } = await import('./find-the-part')
    const encodeText = (tier1Tagger && opts?.includeClipSearch !== false)
      ? async (text: string) => await (tier1Tagger as any).getClipTextEmbedding(text)
      : undefined
    return findThePart(db, { ...opts, encodeClipText: encodeText })
  })

  ipcMain.handle('ai:tpdb-import-performer-faces', async (_ev, req: {
    performerName: string
    performerId?: string
    maxPhotos?: number
  }) => {
    const { importTpDBPerformerFaces } = await import('./tpdb-face-importer')
    try {
      return await importTpDBPerformerFaces(db, req)
    } catch (err: any) {
      return {
        ok: false,
        error: err?.message ?? String(err),
        performerName: req?.performerName ?? '',
        photosFetched: 0, photosWithFace: 0, embeddingsExtracted: 0,
        warnings: [],
      }
    }
  })

  // StashDB twin of the TpDB face importer (#24). Same shape; users
  // pick whichever metadata source has the performer they're after.
  // StashDB has stricter editorial moderation but smaller coverage.
  ipcMain.handle('ai:stashdb-import-performer-faces', async (_ev, req: {
    performerName: string
    performerId?: string
    maxPhotos?: number
  }) => {
    const { importStashDBPerformerFaces } = await import('./stashdb-face-importer')
    try {
      return await importStashDBPerformerFaces(db, req)
    } catch (err: any) {
      return {
        ok: false,
        error: err?.message ?? String(err),
        performerName: req?.performerName ?? '',
        photosFetched: 0, photosWithFace: 0, embeddingsExtracted: 0,
        warnings: [],
      }
    }
  })

  // CLIP text search — encode query text via CLIP text encoder, cosine-
  // match against stored image embeddings, return top N. Falls back
  // to a no-results state when the CLIP BPE vocab isn't installed
  // (the character-code placeholder produces garbage rankings for
  // arbitrary text).
  ipcMain.handle('ai:clip-search', async (_ev, opts: { query: string; limit?: number; minSimilarity?: number }) => {
    const { searchClipByText } = await import('./clip-search')
    const query = String(opts?.query ?? '').trim()
    if (!query) return { ok: false, error: 'empty query', hits: [] }
    if (!tier1Tagger) return { ok: false, error: 'Tier 1 not initialized', hits: [] }
    try {
      // Inject the text-encoder closure so clip-search doesn't import
      // tier1 directly (would be a circular dep through index.ts).
      const encodeText = async (text: string) => {
        return await (tier1Tagger as any).getClipTextEmbedding(text)
      }
      const hits = await searchClipByText(db, query, encodeText, {
        limit: opts?.limit,
        minSimilarity: opts?.minSimilarity,
      })
      return { ok: true, hits }
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err), hits: [] }
    }
  })
  ipcMain.handle('ai:clip-embedding-coverage', async () => {
    const { getClipEmbeddingCoverage } = await import('./clip-search')
    return getClipEmbeddingCoverage(db)
  })

  // Freesound foley search. CC0/BY audio sourced from freesound.org's
  // REST API. Free, but the user needs to register an API key at
  // freesound.org/apiv2/apply (stored in settings.ai.freesoundApiKey).
  // Used as a Soundpack supplement — pulls CC0/BY kiss/gasp/wet/slap
  // foley directly into the picker without leaving Vault.
  // itch.io NSFW audio search (#73). Two modes:
  //   - empty query → curated NSFW Sounds & Music collection (c/3415447)
  //   - query → tag-audio search with nsfw=on filter
  // Returns metadata only (no downloads); user clicks Open on a hit
  // to handle the actual purchase / download on itch.io directly.
  ipcMain.handle('foley:itchio-search', async (_ev, opts: {
    query?: string
    page?: number
  }) => {
    const { fetchItchioNsfwAudioCollection, searchItchioNsfwAudio } = await import('./itchio-audio')
    const page = Math.max(1, opts?.page ?? 1)
    if (opts?.query && opts.query.trim()) {
      return await searchItchioNsfwAudio(opts.query, page)
    }
    return await fetchItchioNsfwAudioCollection(page)
  })

  ipcMain.handle('foley:freesound-search', async (_ev, opts: {
    query: string
    page?: number
    pageSize?: number
    license?: 'cc0' | 'by' | 'sampling+' | 'any'
    durationMax?: number  // cap to short clips (default 10s)
  }) => {
    const https = await import('node:https')
    const { getSettings } = await import('../../settings')
    const { decryptString } = await import('../secure-storage')
    const ai = (getSettings().ai as any) || {}
    const apiKey = decryptString(ai.freesoundApiKey ?? '') ?? String(ai.freesoundApiKey ?? '')
    if (!apiKey) return { ok: false, error: 'Freesound API key required (settings → AI → Freesound)', results: [] }

    const query = String(opts?.query ?? '').trim()
    if (!query) return { ok: false, error: 'empty query', results: [] }

    const page = Math.max(1, opts?.page ?? 1)
    const pageSize = Math.max(1, Math.min(150, opts?.pageSize ?? 30))
    const durationMax = opts?.durationMax ?? 10
    const license = opts?.license ?? 'cc0'

    // Filter by license + duration. Freesound query uses Lucene syntax.
    const licenseFilter = license === 'any' ? '' :
      license === 'cc0' ? ' license:"Creative Commons 0"' :
      license === 'by' ? ' license:"Attribution"' :
      ' license:"Attribution NonCommercial"'
    const filter = `duration:[0 TO ${durationMax}]` + licenseFilter

    const params = [
      `query=${encodeURIComponent(query)}`,
      `filter=${encodeURIComponent(filter)}`,
      `page=${page}`,
      `page_size=${pageSize}`,
      `fields=${encodeURIComponent('id,name,tags,description,duration,download,previews,license,username,created')}`,
      `token=${encodeURIComponent(apiKey)}`,
    ].join('&')

    return new Promise((resolve) => {
      const req = https.request({
        hostname: 'freesound.org',
        port: 443,
        path: `/apiv2/search/text/?${params}`,
        method: 'GET',
        headers: { 'User-Agent': 'vault/1.0', Accept: 'application/json' },
      }, (res) => {
        let body = ''
        res.on('data', (c) => body += c)
        res.on('end', () => {
          if ((res.statusCode ?? 0) >= 400) {
            resolve({ ok: false, error: `Freesound ${res.statusCode}: ${body.slice(0, 200)}`, results: [] })
            return
          }
          try {
            const parsed = JSON.parse(body)
            const results = (parsed?.results ?? []).map((r: any) => ({
              id: r.id,
              name: r.name,
              tags: r.tags ?? [],
              description: r.description ?? '',
              duration: r.duration,
              license: r.license,
              user: r.username,
              created: r.created,
              previewUrl: r.previews?.['preview-hq-mp3']
                ?? r.previews?.['preview-lq-mp3']
                ?? '',
            }))
            resolve({ ok: true, total: parsed?.count ?? results.length, results })
          } catch (err: any) {
            resolve({ ok: false, error: err?.message ?? 'parse failed', results: [] })
          }
        })
      })
      req.on('error', (err) => resolve({ ok: false, error: err.message, results: [] }))
      req.end()
    })
  })

  // Boobpedia performer metadata via MediaWiki API. Free, no auth.
  // Returns the wiki page content for a performer name; renderer
  // parses out infobox fields (measurements, birth date, ethnicity).
  // Free supplement to TpDB for performers TpDB doesn't have.
  ipcMain.handle('performer:boobpedia-search', async (_ev, query: string) => {
    const https = await import('node:https')
    if (!query?.trim()) return { ok: false, error: 'empty query', results: [] }
    const params = `action=query&list=search&srsearch=${encodeURIComponent(query.trim())}&format=json&srlimit=10`
    return new Promise((resolve) => {
      const req = https.request({
        hostname: 'www.boobpedia.com',
        port: 443,
        path: `/wiki/api.php?${params}`,
        method: 'GET',
        headers: { 'User-Agent': 'vault/1.0', Accept: 'application/json' },
      }, (res) => {
        let body = ''
        res.on('data', (c) => body += c)
        res.on('end', () => {
          try {
            const parsed = JSON.parse(body)
            const results = (parsed?.query?.search ?? []).map((r: any) => ({
              title: r.title,
              snippet: String(r.snippet ?? '').replace(/<[^>]+>/g, ''),
              pageUrl: `https://www.boobpedia.com/wiki/${encodeURIComponent(r.title.replace(/ /g, '_'))}`,
            }))
            resolve({ ok: true, results })
          } catch (err: any) {
            resolve({ ok: false, error: err?.message ?? 'parse failed', results: [] })
          }
        })
      })
      req.on('error', (err) => resolve({ ok: false, error: err.message, results: [] }))
      req.end()
    })
  })

  // Boobpedia page fetch — full performer page content. Caller
  // parses the wikitext infobox out of `revisions[0].slots.main['*']`.
  ipcMain.handle('performer:boobpedia-page', async (_ev, title: string) => {
    const https = await import('node:https')
    if (!title?.trim()) return { ok: false, error: 'empty title' }
    const params = `action=query&prop=revisions&titles=${encodeURIComponent(title.trim())}&rvprop=content&rvslots=main&format=json`
    return new Promise((resolve) => {
      const req = https.request({
        hostname: 'www.boobpedia.com',
        port: 443,
        path: `/wiki/api.php?${params}`,
        method: 'GET',
        headers: { 'User-Agent': 'vault/1.0', Accept: 'application/json' },
      }, (res) => {
        let body = ''
        res.on('data', (c) => body += c)
        res.on('end', () => {
          try {
            const parsed = JSON.parse(body)
            const pages = parsed?.query?.pages ?? {}
            const first = Object.values(pages)[0] as any
            const content = first?.revisions?.[0]?.slots?.main?.['*']
              ?? first?.revisions?.[0]?.['*']
              ?? ''
            resolve({ ok: true, title: first?.title ?? title, content })
          } catch (err: any) {
            resolve({ ok: false, error: err?.message ?? 'parse failed' })
          }
        })
      })
      req.on('error', (err) => resolve({ ok: false, error: err.message }))
      req.end()
    })
  })

  // PullPush — Pushshift successor for historical Reddit search.
  // Free, no auth. Useful for finding NSFW posts older than the
  // active subreddit's hot feed. Frozen cutoff ~May 2025; current
  // posts use the live Reddit API instead.
  ipcMain.handle('reddit:pullpush-search', async (_ev, opts: {
    query?: string
    subreddit?: string
    after?: number  // unix timestamp
    before?: number
    size?: number
  }) => {
    const https = await import('node:https')
    const params: string[] = []
    if (opts?.query) params.push(`q=${encodeURIComponent(opts.query)}`)
    if (opts?.subreddit) params.push(`subreddit=${encodeURIComponent(opts.subreddit)}`)
    if (opts?.after) params.push(`after=${opts.after}`)
    if (opts?.before) params.push(`before=${opts.before}`)
    params.push(`size=${Math.max(1, Math.min(500, opts?.size ?? 50))}`)
    params.push('over_18=true')
    const urlPath = `/reddit/search/submission/?${params.join('&')}`
    return new Promise((resolve) => {
      const req = https.request({
        hostname: 'api.pullpush.io',
        port: 443,
        path: urlPath,
        method: 'GET',
        headers: { 'User-Agent': 'vault/1.0', Accept: 'application/json' },
      }, (res) => {
        let body = ''
        res.on('data', (c) => body += c)
        res.on('end', () => {
          if ((res.statusCode ?? 0) >= 400) {
            resolve({ ok: false, error: `PullPush ${res.statusCode}: ${body.slice(0, 200)}`, items: [] })
            return
          }
          try {
            const parsed = JSON.parse(body)
            resolve({ ok: true, items: parsed?.data ?? [], total: (parsed?.data ?? []).length })
          } catch (err: any) {
            resolve({ ok: false, error: err?.message ?? 'parse failed', items: [] })
          }
        })
      })
      req.on('error', (err) => resolve({ ok: false, error: err.message, items: [] }))
      req.end()
    })
  })

  // SFace face recognition status. Manual install (drop ONNX at
  // userData/models/face-recognition-sface.onnx). When installed,
  // each face YuNet detects gets a 128-D embedding and clustered.
  ipcMain.handle('ai:sface-status', async () => {
    const fs = await import('node:fs')
    const path = await import('node:path')
    const { app } = await import('electron')
    const expectedPath = path.join(app.getPath('userData'), 'models', 'face-recognition-sface.onnx')
    let installed = false
    let sizeBytes = 0
    try {
      const stat = fs.statSync(expectedPath)
      installed = stat.isFile()
      sizeBytes = stat.size
    } catch { /* not installed */ }
    return { installed, expectedPath, sizeBytes }
  })

  // Cluster management IPCs — list, rename, merge, delete.
  ipcMain.handle('ai:face-clusters-list', async (_ev, opts?: { onlyUnnamed?: boolean; minSamples?: number; limit?: number }) => {
    const { listClustersForUI } = await import('./face-cluster-service')
    return listClustersForUI(db, opts ?? {})
  })
  ipcMain.handle('ai:face-cluster-rename', async (_ev, clusterId: string, newName: string) => {
    const { renameCluster } = await import('./face-cluster-service')
    renameCluster(db, clusterId, newName)
    // Notify the renderer that tags changed (since rename applies a
    // performer:NAME tag to every media item in the cluster).
    mainWindow?.webContents.send('vault:changed')
    return { ok: true }
  })
  ipcMain.handle('ai:face-cluster-merge', async (_ev, fromId: string, intoId: string) => {
    const { mergeClusters } = await import('./face-cluster-service')
    mergeClusters(db, fromId, intoId)
    return { ok: true }
  })
  ipcMain.handle('ai:face-cluster-delete', async (_ev, clusterId: string) => {
    const { deleteCluster } = await import('./face-cluster-service')
    deleteCluster(db, clusterId)
    return { ok: true }
  })
  // List media in a cluster for preview / verification.
  ipcMain.handle('ai:face-cluster-media', async (_ev, clusterId: string) => {
    const rows: Array<{ media_id: string; filename: string; thumb_path: string | null; bbox: string }> = db.raw.prepare(`
      SELECT DISTINCT fe.media_id, m.filename, m.thumbPath as thumb_path, fe.bbox
      FROM face_embeddings fe
      JOIN media m ON m.id = fe.media_id
      WHERE fe.cluster_id = ?
      LIMIT 100
    `).all(clusterId) as any
    return rows.map((r) => ({
      mediaId: r.media_id,
      filename: r.filename,
      thumbPath: r.thumb_path,
      bbox: r.bbox ? JSON.parse(r.bbox) : null,
    }))
  })

  // ─────────────────────────────────────────────────────────────────────────
  //   Body clusters — bridges SFace face clusters with Person ReID body
  //   embeddings. For the face-visible case, body_embeddings.face_cluster_id
  //   is populated when the same frame has a face match. The unlinked case
  //   (face not visible, body still detected) is what these IPCs surface.
  // ─────────────────────────────────────────────────────────────────────────

  // Overall body-embedding stats — for the Performers "Bodies" tab header.
  ipcMain.handle('ai:body-stats', async () => {
    const total = (db.raw.prepare(`SELECT COUNT(*) as n FROM body_embeddings`).get() as { n: number }).n
    const linked = (db.raw.prepare(
      `SELECT COUNT(*) as n FROM body_embeddings WHERE face_cluster_id IS NOT NULL`
    ).get() as { n: number }).n
    const distinctVideos = (db.raw.prepare(
      `SELECT COUNT(DISTINCT media_id) as n FROM body_embeddings`
    ).get() as { n: number }).n
    const distinctLinkedVideos = (db.raw.prepare(
      `SELECT COUNT(DISTINCT media_id) as n FROM body_embeddings WHERE face_cluster_id IS NOT NULL`
    ).get() as { n: number }).n
    return {
      totalBodies: total,
      linkedBodies: linked,
      unlinkedBodies: total - linked,
      distinctVideos,
      distinctLinkedVideos,
      distinctUnlinkedVideos: distinctVideos - distinctLinkedVideos,
    }
  })

  // Per face_cluster body coverage — how many bodies share a frame with
  // each named/unnamed cluster.
  ipcMain.handle('ai:body-cluster-coverage', async () => {
    const rows = db.raw.prepare(`
      SELECT c.id, c.name, c.sample_count,
             (SELECT COUNT(*) FROM body_embeddings WHERE face_cluster_id = c.id) AS body_count,
             (SELECT COUNT(DISTINCT media_id) FROM body_embeddings WHERE face_cluster_id = c.id) AS media_count
      FROM face_clusters c
      ORDER BY body_count DESC, c.sample_count DESC
      LIMIT 200
    `).all() as Array<{ id: string; name: string | null; sample_count: number; body_count: number; media_count: number }>
    return rows.map((r) => ({
      clusterId: r.id,
      name: r.name,
      faceSampleCount: r.sample_count,
      bodyCount: r.body_count,
      bodyMediaCount: r.media_count,
    }))
  })

  // Unlinked bodies — body embeddings whose frame had no face match.
  // Returns a sample list with thumbnails for visual triage.
  ipcMain.handle('ai:body-unlinked-list', async (_ev, opts?: { limit?: number; offset?: number }) => {
    const limit = Math.max(1, Math.min(500, opts?.limit ?? 200))
    const offset = Math.max(0, opts?.offset ?? 0)
    const rows = db.raw.prepare(`
      SELECT be.id, be.media_id, be.frame_idx, be.bbox, be.detection_score, be.created_at,
             m.filename, m.thumbPath
      FROM body_embeddings be
      JOIN media m ON m.id = be.media_id
      WHERE be.face_cluster_id IS NULL
      ORDER BY be.detection_score DESC, be.created_at DESC
      LIMIT ? OFFSET ?
    `).all(limit, offset) as Array<{
      id: string; media_id: string; frame_idx: number; bbox: string; detection_score: number;
      created_at: number; filename: string; thumbPath: string | null
    }>
    return rows.map((r) => ({
      id: r.id,
      mediaId: r.media_id,
      frameIdx: r.frame_idx,
      bbox: (() => { try { return JSON.parse(r.bbox) } catch { return null } })(),
      detectionScore: r.detection_score,
      filename: r.filename,
      thumbPath: r.thumbPath,
      createdAt: r.created_at,
    }))
  })

  // Cluster unlinked body embeddings by cosine similarity. Returns
  // in-memory groups (not persisted). The user can then "assign" a group
  // to an existing face cluster via ai:body-link-to-cluster.
  ipcMain.handle('ai:body-cluster-unlinked', async (_ev, opts?: { threshold?: number; maxBodies?: number }) => {
    const threshold = Math.max(0.3, Math.min(0.9, opts?.threshold ?? 0.55))
    const maxBodies = Math.max(50, Math.min(5000, opts?.maxBodies ?? 1000))
    const rows = db.raw.prepare(`
      SELECT be.id, be.media_id, be.frame_idx, be.bbox, be.embedding_b64, be.detection_score,
             m.filename, m.thumbPath
      FROM body_embeddings be
      JOIN media m ON m.id = be.media_id
      WHERE be.face_cluster_id IS NULL
      ORDER BY be.detection_score DESC
      LIMIT ?
    `).all(maxBodies) as Array<{
      id: string; media_id: string; frame_idx: number; bbox: string; embedding_b64: string;
      detection_score: number; filename: string; thumbPath: string | null
    }>

    // Decode embeddings to Float32Array. Copy into a fresh ArrayBuffer
    // (not the Node Buffer's backing SharedArrayBuffer) so subsequent
    // math is straightforward and the type narrows cleanly.
    type DecodedEmb = { row: typeof rows[0]; emb: Float32Array }
    const decoded: DecodedEmb[] = []
    for (const r of rows) {
      try {
        const buf = Buffer.from(r.embedding_b64, 'base64')
        const view = new Float32Array(buf.byteLength / 4)
        for (let i = 0; i < view.length; i++) {
          view[i] = buf.readFloatLE(i * 4)
        }
        decoded.push({ row: r, emb: view })
      } catch { /* skip malformed */ }
    }

    if (decoded.length === 0) return { groups: [], threshold, totalBodies: 0 }

    // Greedy single-pass incremental clustering — same approach as
    // face-cluster-service. Bodies are noisier than faces, hence the
    // looser threshold default. Each cluster keeps a running centroid.
    interface Group {
      centroid: Float32Array
      sampleCount: number
      members: Array<{
        embId: string; mediaId: string; frameIdx: number; bbox: string;
        score: number; filename: string; thumbPath: string | null
      }>
    }
    const groups: Group[] = []
    const dot = (a: Float32Array, b: Float32Array): number => {
      let s = 0
      const n = Math.min(a.length, b.length)
      for (let i = 0; i < n; i++) s += a[i] * b[i]
      return s
    }

    for (const { row, emb } of decoded) {
      let bestGroup: Group | null = null
      let bestSim = -1
      for (const g of groups) {
        const sim = dot(emb, g.centroid)
        if (sim > bestSim) { bestSim = sim; bestGroup = g }
      }
      if (bestGroup && bestSim >= threshold) {
        // Update centroid (running average over L2-normalized embeddings).
        const c = bestGroup.centroid
        const n = bestGroup.sampleCount
        for (let i = 0; i < c.length; i++) c[i] = (c[i] * n + emb[i]) / (n + 1)
        // Renormalize
        let mag = 0
        for (let i = 0; i < c.length; i++) mag += c[i] * c[i]
        mag = Math.sqrt(mag) || 1
        for (let i = 0; i < c.length; i++) c[i] /= mag
        bestGroup.sampleCount++
        bestGroup.members.push({
          embId: row.id, mediaId: row.media_id, frameIdx: row.frame_idx,
          bbox: row.bbox, score: row.detection_score,
          filename: row.filename, thumbPath: row.thumbPath,
        })
      } else {
        // Start a new group with a copy of this embedding as centroid.
        groups.push({
          centroid: new Float32Array(emb),
          sampleCount: 1,
          members: [{
            embId: row.id, mediaId: row.media_id, frameIdx: row.frame_idx,
            bbox: row.bbox, score: row.detection_score,
            filename: row.filename, thumbPath: row.thumbPath,
          }],
        })
      }
    }

    // Sort by size (largest first), drop singletons (noise), bbox JSON parse.
    const meaningful = groups.filter((g) => g.members.length >= 2)
      .sort((a, b) => b.members.length - a.members.length)
      .map((g, idx) => ({
        groupId: `body-${Date.now()}-${idx}`,
        size: g.members.length,
        members: g.members.map((m) => ({
          embId: m.embId,
          mediaId: m.mediaId,
          frameIdx: m.frameIdx,
          bbox: (() => { try { return JSON.parse(m.bbox) } catch { return null } })(),
          score: m.score,
          filename: m.filename,
          thumbPath: m.thumbPath,
        })),
      }))

    return {
      groups: meaningful.slice(0, 100),
      threshold,
      totalBodies: decoded.length,
      groupedBodies: meaningful.reduce((s, g) => s + g.size, 0),
      singletonCount: groups.filter((g) => g.members.length < 2).length,
    }
  })

  // Link a list of body embeddings to a face cluster. If no cluster id
  // is given, creates a body-only "performer" cluster (no face_embeddings
  // rows, just a face_clusters row to anchor the body group). Returns
  // the cluster id used.
  ipcMain.handle('ai:body-link-to-cluster', async (_ev, opts: {
    embeddingIds: string[]
    targetClusterId?: string | null
    newClusterName?: string | null
  }) => {
    if (!opts || !Array.isArray(opts.embeddingIds) || opts.embeddingIds.length === 0) {
      return { ok: false, error: 'No embeddings provided' }
    }
    let targetId = opts.targetClusterId ?? null
    if (!targetId) {
      // Create a new face_clusters row to anchor this body-only group.
      // centroid_b64 is empty because there's no face embedding — the
      // cluster is body-only. Face matching code already gates on the
      // centroid being non-empty (see face-cluster-service.ts), so this
      // row won't be picked up as a face candidate.
      const id = `body-cluster-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      const now = Date.now()
      const firstEmb = db.raw.prepare(
        `SELECT media_id, bbox FROM body_embeddings WHERE id = ? LIMIT 1`
      ).get(opts.embeddingIds[0]) as { media_id: string; bbox: string } | undefined
      db.raw.prepare(`
        INSERT INTO face_clusters (id, name, centroid_b64, sample_count, representative_media_id, representative_bbox, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        opts.newClusterName?.trim() || null,
        '', // empty centroid signals body-only cluster
        opts.embeddingIds.length,
        firstEmb?.media_id ?? null,
        firstEmb?.bbox ?? null,
        now,
        now,
      )
      targetId = id
    }
    // Bulk update.
    const placeholders = opts.embeddingIds.map(() => '?').join(',')
    db.raw.prepare(
      `UPDATE body_embeddings SET face_cluster_id = ? WHERE id IN (${placeholders})`
    ).run(targetId, ...opts.embeddingIds)
    return { ok: true, clusterId: targetId, linked: opts.embeddingIds.length }
  })

  // Auto-persist standalone body clusters. Runs the same cosine
  // clustering as ai:body-cluster-unlinked, but for any group that
  // passes the high-confidence gate (minSize members + meanSim above
  // the auto-persist threshold), creates a body-only face_clusters
  // row and links every member body_embedding to it. Lower-confidence
  // groups stay in-memory for manual review via the existing IPC.
  //
  // The face_clusters row uses empty centroid_b64 to mark it body-only —
  // face matching code in face-cluster-service.ts already gates on
  // non-empty centroids, so these rows never appear as face candidates.
  ipcMain.handle('ai:body-cluster-auto-persist', async (_ev, opts?: {
    threshold?: number
    minSize?: number
    minMeanSim?: number
    maxBodies?: number
  }) => {
    const threshold = Math.max(0.3, Math.min(0.9, opts?.threshold ?? 0.6))
    // Auto-persist threshold is tighter than the manual-review threshold;
    // we don't want to grow a cluster from one bad assignment.
    const minMeanSim = Math.max(0.4, Math.min(0.95, opts?.minMeanSim ?? 0.7))
    const minSize = Math.max(3, Math.min(50, opts?.minSize ?? 5))
    const maxBodies = Math.max(50, Math.min(10_000, opts?.maxBodies ?? 2000))

    const rows = db.raw.prepare(`
      SELECT be.id, be.media_id, be.frame_idx, be.bbox, be.embedding_b64, be.detection_score
      FROM body_embeddings be
      WHERE be.face_cluster_id IS NULL
      ORDER BY be.detection_score DESC
      LIMIT ?
    `).all(maxBodies) as Array<{
      id: string; media_id: string; frame_idx: number; bbox: string;
      embedding_b64: string; detection_score: number
    }>

    type DecodedEmb = { row: typeof rows[0]; emb: Float32Array }
    const decoded: DecodedEmb[] = []
    for (const r of rows) {
      try {
        const buf = Buffer.from(r.embedding_b64, 'base64')
        const view = new Float32Array(buf.byteLength / 4)
        for (let i = 0; i < view.length; i++) view[i] = buf.readFloatLE(i * 4)
        decoded.push({ row: r, emb: view })
      } catch { /* skip malformed */ }
    }
    if (decoded.length === 0) {
      return { ok: true, createdClusters: 0, linkedBodies: 0, totalConsidered: 0 }
    }

    const dot = (a: Float32Array, b: Float32Array): number => {
      let s = 0
      const n = Math.min(a.length, b.length)
      for (let i = 0; i < n; i++) s += a[i] * b[i]
      return s
    }

    interface Group {
      centroid: Float32Array
      members: Array<{ row: typeof rows[0]; emb: Float32Array; sim: number }>
    }
    const groups: Group[] = []
    for (const { row, emb } of decoded) {
      let best: Group | null = null
      let bestSim = -1
      for (const g of groups) {
        const sim = dot(emb, g.centroid)
        if (sim > bestSim) { bestSim = sim; best = g }
      }
      if (best && bestSim >= threshold) {
        const n = best.members.length
        const c = best.centroid
        for (let i = 0; i < c.length; i++) c[i] = (c[i] * n + emb[i]) / (n + 1)
        let mag = 0
        for (let i = 0; i < c.length; i++) mag += c[i] * c[i]
        mag = Math.sqrt(mag) || 1
        for (let i = 0; i < c.length; i++) c[i] /= mag
        best.members.push({ row, emb, sim: bestSim })
      } else {
        groups.push({ centroid: new Float32Array(emb), members: [{ row, emb, sim: 1 }] })
      }
    }

    // Filter groups for auto-persist: size gate + mean-sim gate.
    // Mean similarity is recomputed against the FINAL centroid to
    // catch drift cases where the first member set a bad direction.
    const persistable = groups
      .filter((g) => g.members.length >= minSize)
      .map((g) => {
        let meanSim = 0
        for (const m of g.members) meanSim += dot(m.emb, g.centroid)
        meanSim /= g.members.length
        return { group: g, meanSim }
      })
      .filter((x) => x.meanSim >= minMeanSim)
      .sort((a, b) => b.group.members.length - a.group.members.length)

    if (persistable.length === 0) {
      return {
        ok: true, createdClusters: 0, linkedBodies: 0,
        totalConsidered: decoded.length,
        candidatesBelowThreshold: groups.filter((g) => g.members.length >= minSize).length,
      }
    }

    let createdClusters = 0
    let linkedBodies = 0
    const now = Date.now()
    const insertClusterStmt = db.raw.prepare(`
      INSERT INTO face_clusters (id, name, centroid_b64, sample_count, representative_media_id, representative_bbox, created_at, updated_at)
      VALUES (?, NULL, ?, ?, ?, ?, ?, ?)
    `)
    const linkStmt = db.raw.prepare(
      `UPDATE body_embeddings SET face_cluster_id = ? WHERE id = ?`
    )
    db.raw.transaction(() => {
      for (const { group, meanSim } of persistable) {
        void meanSim
        const clusterId = `body-cluster-${now}-${createdClusters}-${Math.random().toString(36).slice(2, 6)}`
        // Pick the highest-scored member as the representative.
        const rep = group.members.slice().sort((a, b) =>
          (b.row.detection_score ?? 0) - (a.row.detection_score ?? 0)
        )[0]
        insertClusterStmt.run(
          clusterId,
          '',  // empty centroid_b64 — body-only flag
          group.members.length,
          rep.row.media_id,
          rep.row.bbox,
          now, now,
        )
        for (const m of group.members) {
          linkStmt.run(clusterId, m.row.id)
          linkedBodies++
        }
        createdClusters++
      }
    })()

    return {
      ok: true,
      createdClusters,
      linkedBodies,
      totalConsidered: decoded.length,
      candidatesBelowThreshold: groups.filter((g) => g.members.length >= minSize).length - persistable.length,
    }
  })

  // Gender classifier status (manual install).
  ipcMain.handle('ai:gender-classifier-status', async () => {
    const fs = await import('node:fs')
    const path = await import('node:path')
    const { app } = await import('electron')
    const expectedPath = path.join(app.getPath('userData'), 'models', 'gender-classifier.onnx')
    let installed = false
    let sizeBytes = 0
    try {
      const stat = fs.statSync(expectedPath)
      installed = stat.isFile()
      sizeBytes = stat.size
    } catch { /* not installed */ }
    return { installed, expectedPath, sizeBytes }
  })

  // WD Tagger variant getter/setter — flips between SwinV2 (default,
  // 467MB) and ViT (343MB, comparable accuracy). Takes effect after
  // restart since Tier 1 loads the model at init.
  ipcMain.handle('ai:wd-variant-get', async () => {
    const { getSettings } = await import('../../settings')
    return ((getSettings().ai as any)?.wdTaggerVariant ?? 'swinv2') as
      'swinv2' | 'vit' | 'pixai' | 'joytag' | 'idolsankaku'
  })
  ipcMain.handle('ai:wd-variant-set', async (_ev, variant: string) => {
    const { updateAISettings, getAISettings } = await import('../../settings')
    // Variants:
    //   swinv2      = WD Tagger v3 SwinV2 (467MB, default)
    //   vit         = WD Tagger v3 ViT (343MB, ~25% smaller)
    //   pixai       = PixAI v0.9 (anime/cosplay character specialist)
    //   joytag      = RedRocket JoyTag (NSFW-permissive general tagger)
    //   idolsankaku = idolsankaku-eva02 (alternate anime specialist)
    const allowed = new Set(['swinv2', 'vit', 'pixai', 'joytag', 'idolsankaku'])
    const v = allowed.has(variant) ? variant : 'swinv2'
    updateAISettings({ ...getAISettings(), wdTaggerVariant: v } as any)
    return { ok: true, variant: v }
  })

  // Multi-hypothesis Venice sampling — 1 / 2 / 3 runs per item.
  ipcMain.handle('ai:venice-multi-sample-get', async () => {
    const { getSettings } = await import('../../settings')
    const v = (getSettings().ai as any)?.veniceMultiSample
    return Math.max(1, Math.min(3, Math.round(Number(v) || 1)))
  })
  ipcMain.handle('ai:venice-multi-sample-set', async (_ev, n: number) => {
    const { updateAISettings, getAISettings } = await import('../../settings')
    const clamped = Math.max(1, Math.min(3, Math.round(Number(n) || 1)))
    updateAISettings({ ...getAISettings(), veniceMultiSample: clamped } as any)
    return { ok: true, count: clamped }
  })

  // NudeNet v3 detector status — manual install (same pattern as
  // miles-deep, no auto-download since mirrors are unreliable).
  ipcMain.handle('ai:nudenet-status', async () => {
    const fs = await import('node:fs')
    const path = await import('node:path')
    const { app } = await import('electron')
    const expectedPath = path.join(app.getPath('userData'), 'models', 'nudenet-detector.onnx')
    let installed = false
    let sizeBytes = 0
    try {
      const stat = fs.statSync(expectedPath)
      installed = stat.isFile()
      sizeBytes = stat.size
    } catch { /* not installed */ }
    return { installed, expectedPath, sizeBytes }
  })

  // YuNet face detector status. Bundled in the standard downloader
  // (it's tiny — ~340KB), so the UI just shows presence + size.
  ipcMain.handle('ai:face-detector-status', async () => {
    const fs = await import('node:fs')
    const path = await import('node:path')
    const { app } = await import('electron')
    const expectedPath = path.join(app.getPath('userData'), 'models', 'face-detection-yunet.onnx')
    let installed = false
    let sizeBytes = 0
    try {
      const stat = fs.statSync(expectedPath)
      installed = stat.isFile()
      sizeBytes = stat.size
    } catch { /* not installed */ }
    return { installed, expectedPath, sizeBytes }
  })

  // MoveNet pose detector status. Unlike miles-deep, MoveNet has a
  // canonical community ONNX (atlasUnified/movenet-multipose-lightning),
  // so the model-downloader handles it — this IPC just reports
  // presence + size so the Setup tab can show a badge.
  ipcMain.handle('ai:pose-detector-status', async () => {
    const fs = await import('node:fs')
    const path = await import('node:path')
    const { app } = await import('electron')
    const expectedPath = path.join(app.getPath('userData'), 'models', 'movenet-multipose-lightning.onnx')
    let installed = false
    let sizeBytes = 0
    try {
      const stat = fs.statSync(expectedPath)
      installed = stat.isFile()
      sizeBytes = stat.size
    } catch { /* not installed */ }
    return { installed, expectedPath, sizeBytes }
  })

  // miles-deep model presence check. No public ONNX exists upstream
  // (the original is Caffe), so install is manual — user converts the
  // model themselves and drops it at userData/models/miles-deep.onnx.
  // Pure status read: returns presence flag + expected path + size.
  ipcMain.handle('ai:miles-deep-status', async () => {
    const fs = await import('node:fs')
    const path = await import('node:path')
    const { app } = await import('electron')
    const expectedPath = path.join(app.getPath('userData'), 'models', 'miles-deep.onnx')
    let installed = false
    let sizeBytes = 0
    try {
      const stat = fs.statSync(expectedPath)
      installed = stat.isFile()
      sizeBytes = stat.size
    } catch { /* not installed */ }
    return { installed, expectedPath, sizeBytes }
  })

  // One-shot JoyCaption smoke test — caption a single image so the user
  // can verify the sidecar install before queuing real media. Returns
  // the caption + latency or an error message. NOT used by the queue;
  // pure setup-tab convenience.
  ipcMain.handle('ai:joycaption-test', async (_ev, args: { imagePath: string; style?: string }) => {
    try {
      if (!args?.imagePath) {
        return { ok: false, error: 'No image path provided' }
      }
      const { getJoyCaptionClient } = await import('./joycaption-client')
      const client = getJoyCaptionClient()
      const health = await client.health()
      if (!health) {
        return { ok: false, error: 'Sidecar offline — start.bat / start_4bit.bat not running' }
      }
      const result = await client.caption(args.imagePath, {
        style: (args.style as any) || 'descriptive',
        maxTokens: 200,
        timeoutMs: 45_000,
      })
      if (!result) return { ok: false, error: 'Caption returned null (image read or inference failed)' }
      return {
        ok: true,
        caption: result.caption,
        style: result.style,
        latencyMs: result.latencyMs,
        vramGb: result.vramGb,
        device: health.device,
        model: health.model,
      }
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })

  // Backfill contact sheets for every video that doesn't have one yet.
  // Streams progress via ai:contact-sheet-backfill-progress; returns
  // final stats. Serial generation (one FFmpeg invocation at a time) to
  // avoid GPU contention with the live tagger queue.
  let contactSheetBackfillCancel = false
  ipcMain.handle('ai:contact-sheet-backfill-cancel', async () => {
    contactSheetBackfillCancel = true
    return { ok: true }
  })
  ipcMain.handle('ai:contact-sheet-backfill', async () => {
    contactSheetBackfillCancel = false
    const { generateContactSheet, contactSheetPathFor } = await import('./contact-sheet')
    const { ffmpegBin } = await import('../../ffpaths')
    if (!ffmpegBin) {
      return { ok: false, error: 'ffmpeg not available', generated: 0, skipped: 0, failed: 0, total: 0 }
    }
    // Pull every video. durationSec lets the FFmpeg call use even-fps
    // sampling instead of every-Nth-frame fallback.
    const rows: Array<{ id: string; path: string; durationSec: number | null }> =
      db.raw.prepare(`SELECT id, path, durationSec FROM media WHERE type='video'`).all() as any
    let generated = 0
    let skipped = 0
    let failed = 0
    const total = rows.length
    for (let i = 0; i < rows.length; i++) {
      if (contactSheetBackfillCancel) break
      const row = rows[i]
      const existing = contactSheetPathFor(row.id)
      if (existing) {
        skipped += 1
      } else {
        try {
          const out = await generateContactSheet(row.path, ffmpegBin, row.id, {
            durationSec: row.durationSec ?? null,
          })
          if (out) generated += 1
          else failed += 1
        } catch {
          failed += 1
        }
      }
      // Emit progress every item — cheap and the renderer renders a
      // progress bar.
      mainWindow?.webContents.send('ai:contact-sheet-backfill-progress', {
        processed: i + 1,
        total,
        generated,
        skipped,
        failed,
        currentId: row.id,
      })
    }
    return {
      ok: true,
      canceled: contactSheetBackfillCancel,
      total,
      generated,
      skipped,
      failed,
    }
  })

  // Load a user-supplied porn-domains list (e.g. Bon-Appetit blocklist).
  // Takes an explicit file path. Used by tests or scripted setups.
  // Persists the path to settings so it auto-reloads on next startup.
  ipcMain.handle('ai:load-domains-list', async (_ev, filePath: string) => {
    const { loadUserDomainsList, getDomainStats } = await import('./domain-detector')
    const result = loadUserDomainsList(filePath)
    if (result.loaded > 0) {
      try {
        const { updateAISettings, getAISettings } = await import('../../settings')
        updateAISettings({ ...getAISettings(), userDomainsListPath: filePath })
      } catch (err) {
        console.warn('[DomainDetector] Could not persist domains list path:', err)
      }
    }
    return { ...result, ...getDomainStats() }
  })

  // Current domain-detector stats — bundled + user + total + userPath.
  // Used by the Utilities UI to render the current state of the
  // porn-domains list without forcing a re-upload.
  ipcMain.handle('ai:domains-status', async () => {
    const { getDomainStats } = await import('./domain-detector')
    return getDomainStats()
  })

  // Combined file-picker + load. Lets the renderer trigger the whole
  // flow in one IPC call without needing a generic dialog bridge.
  ipcMain.handle('ai:upload-domains-list', async () => {
    const { dialog } = await import('electron')
    const result = await dialog.showOpenDialog({
      title: 'Choose porn-domains blocklist',
      filters: [
        { name: 'Text / hosts / list', extensions: ['txt', 'list', 'hosts', 'csv'] },
        { name: 'All files', extensions: ['*'] },
      ],
      properties: ['openFile'],
    })
    if (result.canceled || !result.filePaths[0]) {
      return { canceled: true as const }
    }
    const filePath = result.filePaths[0]
    const { loadUserDomainsList, getDomainStats } = await import('./domain-detector')
    const loaded = loadUserDomainsList(filePath)
    if (loaded.loaded > 0) {
      try {
        const { updateAISettings, getAISettings } = await import('../../settings')
        updateAISettings({ ...getAISettings(), userDomainsListPath: filePath })
      } catch (err) {
        console.warn('[DomainDetector] Could not persist domains list path:', err)
      }
    }
    return { canceled: false as const, ...loaded, ...getDomainStats() }
  })

  // Tag categories — returns the CATEGORY_META for the renderer to
  // build a "group tags by category" picker UI.
  ipcMain.handle('ai:tag-categories', async () => {
    const { CATEGORY_META } = await import('./tag-categories')
    return CATEGORY_META
  })

  // Category for a single tag name.
  ipcMain.handle('ai:tag-category', async (_ev, tagName: string) => {
    const { categoryOf } = await import('./tag-categories')
    return categoryOf(tagName)
  })

  // Replay every prior approve/reject decision into the calibration
  // table. Used to recover from cases where the calibration table is
  // empty despite the user having reviewed thousands of items (e.g.
  // the require() bundler bug that ate samples up to 2026-05-12).
  // Idempotent — call it once after a fresh install or after a bug fix
  // that lost samples. Not auto-run because it double-counts if invoked
  // when calibration already has data.
  ipcMain.handle('ai:backfill-calibration', async () => {
    const { getCalibrationService } = await import('./calibration-service')
    const svc = getCalibrationService(db)
    const before = svc.getSummary()
    const result = svc.backfillFromHistory()
    const after = svc.getSummary()
    return { before, after, ...result }
  })

  ipcMain.handle('xyrene:comment', async (_ev, args: {
    mediaId: string
    currentTimeSec: number
    durationSec?: number | null
    frameDataUrl: string  // base64 PNG/JPEG from a <canvas>.toDataURL()
    recentComments?: string[]
    speak?: boolean
  }): Promise<{
    text: string | null
    audioBase64: string | null
    audioMime: string | null
  }> => {
    const { getCharacterLoader } = await import('../xyrene/character-loader')
    const { getXyreneVoiceClient } = await import('../xyrene/voice-client')
    if (!tier2Vision || !tier2Vision.isEnabled()) {
      return { text: null, audioBase64: null, audioMime: null }
    }

    // Pull media row + the AI analysis (if any) so we can hand Xyrene
    // existing tags + description as context.
    const mediaRow = db.raw.prepare(
      `SELECT id, filename, durationSec FROM media WHERE id = ?`
    ).get(args.mediaId) as { id: string; filename: string; durationSec: number | null } | undefined
    if (!mediaRow) return { text: null, audioBase64: null, audioMime: null }

    const analysisRow = db.raw.prepare(
      `SELECT description, tier2_extra_tags FROM ai_analysis_results WHERE media_id = ?`
    ).get(args.mediaId) as { description: string | null; tier2_extra_tags: string | null } | undefined

    let mediaTags: string[] = []
    if (analysisRow?.tier2_extra_tags) {
      try { mediaTags = JSON.parse(analysisRow.tier2_extra_tags) } catch {}
    }

    // Build the system prompt with vault-specific situational injections
    const loader = getCharacterLoader()
    const sysPrompt = loader.buildCommentarySystemPrompt({
      mediaFilename: mediaRow.filename,
      mediaTags,
      mediaDescription: analysisRow?.description ?? null,
      currentTimeSec: args.currentTimeSec,
      durationSec: args.durationSec ?? mediaRow.durationSec,
      recentXyComments: args.recentComments ?? []
    })

    // Generate the line via Venice
    let text: string | null = null
    try {
      text = await tier2Vision.generateCommentary(args.frameDataUrl, sysPrompt, { temperature: 0.85 })
    } catch (err) {
      console.warn('[Xyrene] Comment generation failed:', err)
    }
    if (!text) return { text: null, audioBase64: null, audioMime: null }

    // Optionally hit XTTS for audio. If the server's offline, return text-only.
    if (!args.speak) {
      return { text, audioBase64: null, audioMime: null }
    }

    let audioBase64: string | null = null
    try {
      const wav = await getXyreneVoiceClient().synth(text, { timeoutMs: 60000 })
      if (wav) audioBase64 = wav.toString('base64')
    } catch (err) {
      console.warn('[Xyrene] TTS failed (returning text only):', err)
    }

    return {
      text,
      audioBase64,
      audioMime: audioBase64 ? 'audio/wav' : null
    }
  })

  // Streaming variant of xyrene:speak — pushes PCM chunks back to the
  // renderer via webContents.send() as they arrive from /tts_stream. The
  // renderer plays them through Web Audio for snappier first-audio
  // latency (typically 300-600ms vs 1.5-3s for buffered /tts).
  //
  // Channel layout:
  //   - Renderer invokes 'xyrene:speakStream' with { text, streamId, voice? }
  //   - Main sends 'xyrene:speakStream:chunk' { streamId, b64 } per chunk
  //   - Main sends 'xyrene:speakStream:end'   { streamId, sampleRate, ok }
  //   - Main sends 'xyrene:speakStream:error' { streamId, message } on failure
  //
  // streamId is a renderer-supplied opaque token (nanoid) so multiple
  // concurrent streams can coexist without crossed wires.
  ipcMain.handle('xyrene:speakStream', async (ev, args: {
    text: string
    streamId: string
    voice?: string
    language?: string
  }): Promise<{ ok: boolean; sampleRate: number }> => {
    const { getXyreneVoiceClient } = await import('../xyrene/voice-client')
    const wc = ev.sender
    try {
      const result = await getXyreneVoiceClient().streamSynth(args.text, {
        voice: args.voice,
        language: args.language,
        timeoutMs: 90000,
        onChunk: (pcm) => {
          if (wc.isDestroyed()) return
          wc.send('xyrene:speakStream:chunk', { streamId: args.streamId, b64: pcm.toString('base64') })
        },
      })
      if (!wc.isDestroyed()) {
        wc.send('xyrene:speakStream:end', {
          streamId: args.streamId,
          sampleRate: result?.sampleRate ?? 24000,
          ok: !!result,
        })
      }
      return { ok: !!result, sampleRate: result?.sampleRate ?? 24000 }
    } catch (err: any) {
      if (!wc.isDestroyed()) {
        wc.send('xyrene:speakStream:error', { streamId: args.streamId, message: err?.message ?? String(err) })
      }
      return { ok: false, sampleRate: 24000 }
    }
  })
}

export { FrameExtractor, ModelDownloader, Tier1OnnxTagger, Tier2VisionLLM, Tier3TagMatcher, ProcessingQueue }

// Singleton getters for other services (auto-PMV, etc.) that need to reuse
// the already-initialized Tier 2 client and frame extractor without
// double-instantiating them.
export function getTier2VisionInstance(): Tier2VisionLLM | null {
  return tier2Vision
}
export function getFrameExtractorInstance(): FrameExtractor | null {
  return frameExtractor
}
