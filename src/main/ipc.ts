// ===============================
// File: src/main/ipc.ts
// IPC handlers for main process
// ===============================
import { IpcMain, dialog, shell, BrowserWindow, app } from 'electron'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import type { DB } from './db'
import { SoundOrganizer } from './services/audio/sound-organizer'
import { VoiceLineService } from './services/audio/voice-line-service'
import { NSFWTagger } from './services/tagging/nsfw-tagger'
import { getSmartTagger } from './services/tagging/smart-tagger'
import { getHybridTagger } from './services/tagging/hybrid-tagger'
import { analyzeVideo, isAnalyzerAvailable } from './services/ai/video-analyzer'
import { aiCleanupTags, aiGenerateTags, aiSuggestFilename, aiBatchRename, isOllamaAvailable } from './services/ai/ai-library-tools'
import { getDLNAService } from './services/dlna-service'
import { getMobileSyncService } from './services/mobile-sync-service'
import { getSmartPlaylistService, SMART_PLAYLIST_PRESETS } from './services/smart-playlists'
import { getBatchOperationsService } from './services/batch-operations'
import { getGlobalSearchService, type SearchOptions } from './services/global-search'
import { getWatchHistoryService } from './services/watch-history'
import { getAutoOrganizeService, ORGANIZE_PRESETS, type OrganizeRule } from './services/auto-organize'
import { getPerformerService, type Performer } from './services/performers'
import { getCollectionService } from './services/collections'
import { getSlideshowService, SLIDESHOW_PRESETS, type SlideshowConfig } from './services/slideshow'
import { getBackupRestoreService, type BackupOptions, type RestoreOptions } from './services/backup-restore'
import { getScheduledTasksService, type ScheduledTask } from './services/scheduled-tasks'
import { getSimilarContentService } from './services/similar-content'
import { getMediaInfoService } from './services/media-info'
import { getKeyboardShortcutsService, type ShortcutAction, type ShortcutConfig } from './services/keyboard-shortcuts'
import { getFileWatcherService } from './services/file-watcher'
import { getAdvancedStatsService } from './services/advanced-stats'
import { getQuickActionsService, type ActionContext } from './services/quick-actions'
import { getViewPresetsService, type ViewFilters, type ViewConfig } from './services/view-presets'
import { getMediaCompareService, type CompareOptions } from './services/media-compare'
import { getExportService, type ExportOptions, type PlaylistExportOptions } from './services/export-service'
import { getMetadataExtractorService } from './services/metadata-extractor'
import { getSceneDetectionService, type SceneDetectionOptions } from './services/scene-detection'
import { getImportService, type ImportOptions } from './services/import-service'
import { getNotificationsService, type NotificationConfig, type NotificationSettings } from './services/notifications'
import { getAnalyticsService } from './services/analytics'
import { getVideoBookmarksService, type VideoBookmark } from './services/video-bookmarks'
import { getTagCategoriesService, type TagCategory } from './services/tag-categories'
import { getMediaRelationshipsService, type RelationshipType } from './services/media-relationships'
import { getMediaNotesService, type MediaNote } from './services/media-notes'
import { getWatchLaterService, type WatchLaterItem } from './services/watch-later'
import { getTagAliasesService } from './services/tag-aliases'
import { getRatingHistoryService } from './services/rating-history'
import { getCustomFiltersService, type FilterCondition } from './services/custom-filters'
import { getSessionHistoryService, type SessionAction } from './services/session-history'
import { getUrlDownloaderService } from './services/url-downloader-service'
import { getFavoriteFoldersService } from './services/favorite-folders'
import { getDuplicatesFinderService, type DuplicateResolution } from './services/duplicates-finder'
import { getVisualDuplicatesService } from './services/visual-duplicates-service'

import {
  getSettings,
  updateSettings,
  getMediaDirs,
  getCacheDir,
  setCacheDir,
  updateLibrarySettings,
  updatePlaybackSettings,
  updateGoonwallSettings,
  updateAppearanceSettings,
  updatePrivacySettings,
  updateBlacklistSettings,
  addBlacklistTag,
  removeBlacklistTag,
  addBlacklistMedia,
  removeBlacklistMedia,
  updateCaptionSettings,
  addCaptionPreset,
  removeCaptionPreset,
  exportCaptionPresets,
  importCaptionPresets,
  updateDataSettings,
  updateVisualEffectsSettings,
  updateMobileSyncSettings,
  getMobileSyncSettings,
  addMediaDir,
  removeMediaDir,
  setTheme,
  resetSettings,
  resetSettingsSection,
  // Goon stats & session modes
  getGoonStats,
  updateGoonStats,
  recordEdge,
  recordOrgasm,
  startSession,
  endSession,
  checkAndUnlockAchievements,
  getGoonTheme,
  setSessionMode,
  getSessionMode,
  // Achievement event tracking
  recordPlaylistCreated,
  recordTagAssigned,
  recordRatingGiven,
  recordGoonWallSession,
  recordGoonWallTime,
  recordGoonWallShuffle,
  getStreakStatus,
  getPersonalRecords,
  GOON_THEMES,
  SESSION_MODES,
  ACHIEVEMENTS,
  GOON_VOCABULARY,
  // Settings Profiles
  listProfiles,
  getActiveProfileId,
  getProfile,
  createProfile,
  saveCurrentToProfile,
  loadProfile,
  renameProfile,
  deleteProfile,
  clearActiveProfile,
  // Daily Challenges
  getDailyChallenges,
  updateChallengeProgress,
  resetDailyChallenges,
  type VaultSettings,
  type GoonStats,
  type SessionModeId,
  type DailyChallengeType,
  type ThemeId
} from './settings'
import { toVaultUrl } from './vaultProtocol'
import { getAICacheService } from './services/ai-cache-service'
import { getLicenseService, type TierLimits } from './services/license-service'
import { errorLogger } from './services/error-logger'
import { needsTranscode, transcodeToMp4, getTranscodedPath, transcodeLowRes, detectHardwareEncoders, getEncoders, getPreferredEncoder, setPreferredEncoder, type HardwareEncoder } from './services/transcode'
import { makeVideoThumb, makeImageThumb, makeGifThumb, probeVideoDurationSec } from './thumbs'
import ffmpeg from 'fluent-ffmpeg'
import { ffmpegBin, ffprobeBin } from './ffpaths'

// Configure ffmpeg paths for GIF creation
if (ffmpegBin) ffmpeg.setFfmpegPath(ffmpegBin)
if (ffprobeBin) ffmpeg.setFfprobePath(ffprobeBin)

type OnDirsChanged = (newDirs: string[]) => Promise<void>

function broadcast(channel: string, ...args: any[]) {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(channel, ...args)
  }
}

// Service instances (lazy initialized)
let voiceLineService: VoiceLineService | null = null
let nsfwTagger: NSFWTagger | null = null

function getVoiceLineService(): VoiceLineService {
  if (!voiceLineService) {
    const audioPath = path.join(app.getPath('userData'), 'audio', 'voice')
    voiceLineService = new VoiceLineService(audioPath)
  }
  return voiceLineService
}

// Auto-detect and organize NSFW Soundpack(s). Scans BOTH the in-tree
// `NSFW Soundpack/` folder AND the user's `~\Vault\Soundpacks\` data folder
// (where bigger packs like OpenNSFW SFX live out of the source tree). All
// matched sources are merged so multiple packs co-exist.
async function autoOrganizeSoundpack(): Promise<void> {
  // Single-folder candidates (look here for one classic NSFW Soundpack folder).
  const singleFolderCandidates = [
    path.join(process.cwd(), 'NSFW Soundpack'),
    path.join(app.getPath('userData'), 'NSFW Soundpack'),
    path.join(app.getPath('documents'), 'NSFW Soundpack'),
    path.join(app.getPath('home'), 'Downloads', 'NSFW Soundpack'),
  ]
  // Multi-pack containers — every subfolder here is treated as its own pack.
  // User's Vault data dir is the canonical home for big packs (OpenNSFW SFX
  // ~8GB lives here so it doesn't bloat the source tree).
  const packContainerCandidates = [
    path.join(app.getPath('home'), 'Vault', 'Soundpacks'),
    path.join(app.getPath('userData'), 'Soundpacks'),
  ]

  const sourcePaths: string[] = []
  for (const p of singleFolderCandidates) {
    if (fs.existsSync(p)) sourcePaths.push(p)
  }
  for (const container of packContainerCandidates) {
    if (!fs.existsSync(container)) continue
    try {
      const entries = fs.readdirSync(container)
      for (const entry of entries) {
        const full = path.join(container, entry)
        try {
          if (fs.statSync(full).isDirectory()) sourcePaths.push(full)
        } catch { /* skip */ }
      }
    } catch (e) {
      errorLogger.error('Audio', `Failed to read soundpack container ${container}`, e as Error)
    }
  }

  if (sourcePaths.length === 0) return

  const targetDir = path.join(app.getPath('userData'), 'audio', 'voice')
  let totalFiles = 0
  for (const sourcePath of sourcePaths) {
    console.log('[Audio] Found Soundpack at:', sourcePath)
    try {
      const organizer = new SoundOrganizer(sourcePath, targetDir)
      const files = await organizer.organize()
      const manifest = organizer.generateManifest(files)
      organizer.saveManifest(manifest)
      totalFiles += files.length
      console.log(`[Audio]  · organized ${files.length} files from ${path.basename(sourcePath)}`)
    } catch (e) {
      errorLogger.error('Audio', `Failed to organize sound pack at ${sourcePath}`, e as Error)
    }
  }
  console.log(`[Audio] Soundpack organization complete: ${totalFiles} total files across ${sourcePaths.length} pack(s)`)

  // Reload voice line service once after all packs are processed.
  try {
    const vls = getVoiceLineService()
    await vls.reload()
  } catch (e) {
    errorLogger.error('Audio', 'Failed to reload voice line service', e as Error)
  }
}

function getNSFWTagger(): NSFWTagger {
  if (!nsfwTagger) {
    nsfwTagger = new NSFWTagger()
  }
  return nsfwTagger
}

/**
 * Build accessor closures for the Stash shim server (#120). The shim
 * needs read-only library access; we map its expected shape onto
 * Vault's actual DB columns here so the shim stays DB-agnostic.
 */
function buildStashShimAccessors(db: DB): import('./services/stash-shim-server').StashShimAccessors {
  const sceneRowToShape = (row: any): any => ({
    id: row.id,
    title: row.approved_title ?? null,
    details: row.description ?? null,
    date: null,
    durationSec: row.durationSec ?? null,
    filePath: row.path,
    thumbPath: row.thumbPath ?? null,
    width: row.width ?? null,
    height: row.height ?? null,
    phash: row.phash ?? null,
    sha256: row.hashSha256 ?? null,
    performers: [] as string[],
    tags: [] as string[],
    studio: null as string | null,
  })

  const hydrateTagsPerformersStudio = (sceneId: string, base: any): any => {
    try {
      const tagRows = db.raw.prepare(`
        SELECT t.name FROM media_tags mt
        JOIN tags t ON t.id = mt.tagId
        WHERE mt.mediaId = ?
      `).all(sceneId) as Array<{ name: string }>
      for (const t of tagRows) {
        const n = t.name
        if (n.startsWith('performer:')) base.performers.push(n.slice('performer:'.length))
        else if (n.startsWith('studio:')) base.studio = n.slice('studio:'.length)
        else base.tags.push(n)
      }
    } catch { /* ignore */ }
    return base
  }

  return {
    listScenes: async ({ page, perPage, q }) => {
      const offset = (page - 1) * perPage
      const params: any[] = []
      let where = `WHERE m.type = 'video'`
      if (q && q.trim()) {
        where += ` AND (m.filename LIKE ? OR ar.approved_title LIKE ?)`
        const like = `%${q.trim()}%`
        params.push(like, like)
      }
      const rows = db.raw.prepare(`
        SELECT m.*, ar.approved_title, ar.description
        FROM media m
        LEFT JOIN ai_analysis_results ar ON ar.media_id = m.id
        ${where}
        ORDER BY m.addedAt DESC
        LIMIT ? OFFSET ?
      `).all(...params, perPage, offset) as any[]
      const count = (db.raw.prepare(`
        SELECT COUNT(*) as n FROM media m
        LEFT JOIN ai_analysis_results ar ON ar.media_id = m.id
        ${where}
      `).get(...params) as any).n as number
      const scenes = rows.map(sceneRowToShape).map((s) => hydrateTagsPerformersStudio(s.id, s))
      return { count, scenes }
    },

    getScene: async (id) => {
      const row = db.raw.prepare(`
        SELECT m.*, ar.approved_title, ar.description
        FROM media m
        LEFT JOIN ai_analysis_results ar ON ar.media_id = m.id
        WHERE m.id = ? AND m.type = 'video' LIMIT 1
      `).get(id) as any
      if (!row) return null
      return hydrateTagsPerformersStudio(id, sceneRowToShape(row))
    },

    findSceneByHash: async (algorithm, hash) => {
      const algo = algorithm.toUpperCase()
      const column = algo === 'PHASH' ? 'phash'
        : (algo === 'OSHASH' || algo === 'MD5' || algo === 'SHA256') ? 'hashSha256'
        : null
      if (!column) return null
      const row = db.raw.prepare(`
        SELECT m.*, ar.approved_title, ar.description
        FROM media m
        LEFT JOIN ai_analysis_results ar ON ar.media_id = m.id
        WHERE m.${column} = ? AND m.type = 'video' LIMIT 1
      `).get(hash) as any
      if (!row) return null
      return hydrateTagsPerformersStudio(row.id, sceneRowToShape(row))
    },

    allPerformers: async () => {
      // Pull `performer:` tags and count their media membership.
      const rows = db.raw.prepare(`
        SELECT t.name, COUNT(mt.mediaId) as n
        FROM tags t
        JOIN media_tags mt ON mt.tagId = t.id
        WHERE t.name LIKE 'performer:%'
        GROUP BY t.name
        ORDER BY n DESC
        LIMIT 1000
      `).all() as Array<{ name: string; n: number }>
      return rows.map((r) => ({
        id: `vault-perf-${r.name.slice('performer:'.length).replace(/\s+/g, '-').toLowerCase()}`,
        name: r.name.slice('performer:'.length),
        sampleCount: r.n,
      }))
    },

    findPerformer: async (id) => {
      const all = await (async () => {
        const rows = db.raw.prepare(`
          SELECT t.name, COUNT(mt.mediaId) as n FROM tags t
          JOIN media_tags mt ON mt.tagId = t.id
          WHERE t.name LIKE 'performer:%' GROUP BY t.name
        `).all() as Array<{ name: string; n: number }>
        return rows.map((r) => ({
          id: `vault-perf-${r.name.slice('performer:'.length).replace(/\s+/g, '-').toLowerCase()}`,
          name: r.name.slice('performer:'.length),
          sampleCount: r.n,
        }))
      })()
      return all.find((p) => p.id === id) ?? null
    },

    allStudios: async () => {
      const rows = db.raw.prepare(`
        SELECT DISTINCT t.name FROM tags t
        JOIN media_tags mt ON mt.tagId = t.id
        WHERE t.name LIKE 'studio:%'
        ORDER BY t.name
      `).all() as Array<{ name: string }>
      return rows.map((r) => ({
        id: `vault-studio-${r.name.slice('studio:'.length).replace(/\s+/g, '-').toLowerCase()}`,
        name: r.name.slice('studio:'.length),
      }))
    },

    findStudio: async (id) => {
      const all = await (async () => {
        const rows = db.raw.prepare(`
          SELECT DISTINCT t.name FROM tags t
          JOIN media_tags mt ON mt.tagId = t.id
          WHERE t.name LIKE 'studio:%'
        `).all() as Array<{ name: string }>
        return rows.map((r) => ({
          id: `vault-studio-${r.name.slice('studio:'.length).replace(/\s+/g, '-').toLowerCase()}`,
          name: r.name.slice('studio:'.length),
        }))
      })()
      return all.find((s) => s.id === id) ?? null
    },

    allTags: async () => {
      const rows = db.raw.prepare(`
        SELECT t.id, t.name, COUNT(mt.mediaId) as n
        FROM tags t
        LEFT JOIN media_tags mt ON mt.tagId = t.id
        WHERE t.name NOT LIKE 'performer:%' AND t.name NOT LIKE 'studio:%'
        GROUP BY t.id, t.name
        ORDER BY n DESC
        LIMIT 5000
      `).all() as Array<{ id: string; name: string; n: number }>
      return rows.map((r) => ({ id: r.id, name: r.name, count: r.n }))
    },

    stats: async () => {
      const sceneCount = (db.raw.prepare(`SELECT COUNT(*) as n FROM media WHERE type='video'`).get() as any).n
      const tagCount = (db.raw.prepare(`SELECT COUNT(*) as n FROM tags WHERE name NOT LIKE 'performer:%' AND name NOT LIKE 'studio:%'`).get() as any).n
      const performerCount = (db.raw.prepare(`SELECT COUNT(*) as n FROM tags WHERE name LIKE 'performer:%'`).get() as any).n
      const studioCount = (db.raw.prepare(`SELECT COUNT(*) as n FROM tags WHERE name LIKE 'studio:%'`).get() as any).n
      const durationRow = db.raw.prepare(`SELECT SUM(durationSec) as total FROM media WHERE type='video'`).get() as any
      return {
        scene_count: sceneCount,
        studio_count: studioCount,
        performer_count: performerCount,
        tag_count: tagCount,
        total_duration: Number(durationRow?.total ?? 0),
      }
    },
  }
}

export function registerIpc(ipcMain: IpcMain, db: DB, onDirsChanged: OnDirsChanged): void {
  // Helper: get vault stats and check achievements
  function checkAchievements() {
    const totalMedia = db.countMedia({ q: '', type: '', tag: '' })
    const playlistCount = db.playlistList().length
    const tagCount = db.listTags().length
    return checkAndUnlockAchievements({ totalMedia, playlistCount, tagCount })
  }

  // Helper: apply blacklist filtering to media items
  function applyBlacklist<T extends { id: string; tags?: string[] }>(items: T[]): T[] {
    const blacklist = getSettings().blacklist
    if (!blacklist?.enabled) return items

    const blacklistedTags = new Set(blacklist.tags || [])
    const blacklistedMediaIds = new Set(blacklist.mediaIds || [])

    return items.filter(item => {
      // Check if media ID is blacklisted
      if (blacklistedMediaIds.has(item.id)) return false

      // Check if any tag is blacklisted
      if (item.tags && item.tags.some(tag => blacklistedTags.has(tag))) return false

      return true
    })
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SETTINGS - General
  // ═══════════════════════════════════════════════════════════════════════════
  ipcMain.handle('settings:get', async () => {
    return getSettings()
  })

  ipcMain.handle('settings:patch', async (_ev, patch: Partial<VaultSettings>) => {
    const next = updateSettings(patch ?? {})
    if (patch?.library?.mediaDirs) {
      await onDirsChanged(next.library.mediaDirs)
    }
    broadcast('settings:changed', next)
    return next
  })

  ipcMain.handle('settings:update', async (_ev, patch: Partial<VaultSettings>) => {
    const next = updateSettings(patch ?? {})
    if (patch?.library?.mediaDirs) {
      await onDirsChanged(next.library.mediaDirs)
    }
    broadcast('settings:changed', next)
    return next
  })

  ipcMain.handle('settings:reset', async () => {
    const defaults = resetSettings()
    broadcast('settings:changed', defaults)
    return defaults
  })

  ipcMain.handle('settings:resetSection', async (_ev, section: string) => {
    const updated = resetSettingsSection(section as keyof VaultSettings)
    broadcast('settings:changed', updated)
    return updated
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // SETTINGS PROFILES
  // ═══════════════════════════════════════════════════════════════════════════
  ipcMain.handle('profiles:list', async () => {
    return listProfiles()
  })

  ipcMain.handle('profiles:get', async (_ev, profileId: string) => {
    return getProfile(profileId)
  })

  ipcMain.handle('profiles:getActive', async () => {
    return getActiveProfileId()
  })

  ipcMain.handle('profiles:create', async (_ev, name: string, description?: string) => {
    return createProfile(name, description)
  })

  ipcMain.handle('profiles:save', async (_ev, profileId: string) => {
    const profile = saveCurrentToProfile(profileId)
    if (profile) {
      broadcast('profiles:updated', profile)
    }
    return profile
  })

  ipcMain.handle('profiles:load', async (_ev, profileId: string) => {
    const settings = loadProfile(profileId)
    if (settings) {
      broadcast('settings:changed', settings)
      broadcast('profiles:loaded', profileId)
    }
    return settings
  })

  ipcMain.handle('profiles:rename', async (_ev, profileId: string, name: string, description?: string) => {
    const profile = renameProfile(profileId, name, description)
    if (profile) {
      broadcast('profiles:updated', profile)
    }
    return profile
  })

  ipcMain.handle('profiles:delete', async (_ev, profileId: string) => {
    const deleted = deleteProfile(profileId)
    if (deleted) {
      broadcast('profiles:deleted', profileId)
    }
    return deleted
  })

  ipcMain.handle('profiles:clearActive', async () => {
    clearActiveProfile()
    broadcast('profiles:cleared')
    return true
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // DAILY CHALLENGES
  // ═══════════════════════════════════════════════════════════════════════════
  ipcMain.handle('challenges:get', async () => {
    return getDailyChallenges()
  })

  ipcMain.handle('challenges:updateProgress', async (_ev, type: DailyChallengeType, increment: number = 1) => {
    const result = updateChallengeProgress(type, increment)
    if (result.newlyCompleted.length > 0) {
      broadcast('challenges:completed', result.newlyCompleted)
    }
    return result.updated
  })

  ipcMain.handle('challenges:reset', async () => {
    return resetDailyChallenges()
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // SETTINGS - Library
  // ═══════════════════════════════════════════════════════════════════════════
  ipcMain.handle('settings:library:update', async (_ev, patch: any) => {
    const next = updateLibrarySettings(patch)
    if (patch?.mediaDirs) {
      await onDirsChanged(next.library.mediaDirs)
    }
    broadcast('settings:changed', next)
    return next
  })

  ipcMain.handle('settings:chooseMediaDir', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory', 'createDirectory'],
      title: 'Select Media Folder'
    })
    if (result.canceled || !result.filePaths[0]) return null
    const dir = result.filePaths[0]
    addMediaDir(dir)
    await onDirsChanged(getMediaDirs())
    broadcast('settings:changed', getSettings())
    return dir
  })

  ipcMain.handle('settings:removeMediaDir', async (_ev, dir: string) => {
    removeMediaDir(dir)
    await onDirsChanged(getMediaDirs())
    const settings = getSettings()
    broadcast('settings:changed', settings)
    return settings
  })

  ipcMain.handle('settings:chooseCacheDir', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory', 'createDirectory'],
      title: 'Select Cache Folder'
    })
    if (result.canceled || !result.filePaths[0]) return null
    const dir = result.filePaths[0]
    setCacheDir(dir)
    broadcast('settings:changed', getSettings())
    return dir
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // SETTINGS - Category Updates
  // ═══════════════════════════════════════════════════════════════════════════
  ipcMain.handle('settings:playback:update', async (_ev, patch: any) => {
    const next = updatePlaybackSettings(patch)
    broadcast('settings:changed', next)
    return next
  })

  ipcMain.handle('settings:goonwall:update', async (_ev, patch: any) => {
    const next = updateGoonwallSettings(patch)
    broadcast('settings:changed', next)
    return next
  })

  // Goon Wall achievement tracking
  ipcMain.handle('goonwall:startSession', async (_ev, tileCount: number) => {
    recordGoonWallSession(tileCount)
    checkAchievements()
    return true
  })

  ipcMain.handle('goonwall:recordTime', async (_ev, minutes: number) => {
    recordGoonWallTime(minutes)
    checkAchievements()
    return true
  })

  ipcMain.handle('goonwall:shuffle', async () => {
    recordGoonWallShuffle()
    checkAchievements()
    return true
  })


  ipcMain.handle('settings:appearance:update', async (_ev, patch: any) => {
    const next = updateAppearanceSettings(patch)
    broadcast('settings:changed', next)
    return next
  })

  ipcMain.handle('settings:privacy:update', async (_ev, patch: any) => {
    const next = updatePrivacySettings(patch)
    broadcast('settings:changed', next)
    return next
  })

  ipcMain.handle('settings:blacklist:update', async (_ev, patch: any) => {
    const next = updateBlacklistSettings(patch)
    broadcast('settings:changed', next)
    return next
  })

  ipcMain.handle('settings:blacklist:addTag', async (_ev, tag: string) => {
    const next = addBlacklistTag(tag)
    broadcast('settings:changed', next)
    return next
  })

  ipcMain.handle('settings:blacklist:removeTag', async (_ev, tag: string) => {
    const next = removeBlacklistTag(tag)
    broadcast('settings:changed', next)
    return next
  })

  ipcMain.handle('settings:blacklist:addMedia', async (_ev, mediaId: string) => {
    const next = addBlacklistMedia(mediaId)
    broadcast('settings:changed', next)
    return next
  })

  ipcMain.handle('settings:blacklist:removeMedia', async (_ev, mediaId: string) => {
    const next = removeBlacklistMedia(mediaId)
    broadcast('settings:changed', next)
    return next
  })

  ipcMain.handle('settings:captions:update', async (_ev, patch: any) => {
    const next = updateCaptionSettings(patch)
    broadcast('settings:changed', next)
    return next
  })

  ipcMain.handle('settings:captions:addPreset', async (_ev, preset: any) => {
    const next = addCaptionPreset(preset)
    broadcast('settings:changed', next)
    return next
  })

  ipcMain.handle('settings:captions:removePreset', async (_ev, presetId: string) => {
    const next = removeCaptionPreset(presetId)
    broadcast('settings:changed', next)
    return next
  })

  // Export caption presets as JSON file
  ipcMain.handle('settings:captions:exportPresets', async () => {
    const data = exportCaptionPresets()
    const result = await dialog.showSaveDialog({
      title: 'Export Caption Presets',
      defaultPath: `vault-caption-presets-${new Date().toISOString().split('T')[0]}.json`,
      filters: [{ name: 'JSON Files', extensions: ['json'] }]
    })

    if (result.canceled || !result.filePath) return { success: false, cancelled: true }

    fs.writeFileSync(result.filePath, JSON.stringify(data, null, 2), 'utf8')
    return { success: true, path: result.filePath, count: data.presets.length }
  })

  // Import caption presets from JSON file
  ipcMain.handle('settings:captions:importPresets', async (_ev, mode: 'merge' | 'replace' = 'merge') => {
    const result = await dialog.showOpenDialog({
      title: 'Import Caption Presets',
      filters: [{ name: 'JSON Files', extensions: ['json'] }],
      properties: ['openFile']
    })

    if (result.canceled || !result.filePaths[0]) return { success: false, cancelled: true }

    try {
      const content = fs.readFileSync(result.filePaths[0], 'utf8')
      const data = JSON.parse(content)
      const stats = importCaptionPresets(data, mode)
      const settings = getSettings()
      broadcast('settings:changed', settings)
      return { success: true, ...stats }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  // Caption database operations
  ipcMain.handle('captions:get', async (_ev, mediaId: string) => {
    return db.captionGet(mediaId)
  })

  ipcMain.handle('captions:upsert', async (_ev, mediaId: string, topText: string | null, bottomText: string | null, presetId?: string, customStyle?: string | null) => {
    const result = db.captionUpsert(mediaId, topText, bottomText, presetId, customStyle)
    broadcast('vault:changed')
    return result
  })

  ipcMain.handle('captions:delete', async (_ev, mediaId: string) => {
    db.captionDelete(mediaId)
    broadcast('vault:changed')
    return true
  })

  ipcMain.handle('captions:listCaptioned', async () => {
    return db.captionListCaptioned()
  })

  ipcMain.handle('captions:templates:list', async () => {
    return db.captionTemplateList()
  })

  ipcMain.handle('captions:templates:add', async (_ev, topText: string | null, bottomText: string | null, category?: string) => {
    const result = db.captionTemplateAdd(topText, bottomText, category)
    broadcast('vault:changed')
    return result
  })

  ipcMain.handle('captions:templates:delete', async (_ev, id: string) => {
    db.captionTemplateDelete(id)
    broadcast('vault:changed')
    return true
  })

  // Export captioned image as new file
  ipcMain.handle('captions:export', async (_ev, mediaId: string, options: {
    topText: string | null;
    bottomText: string | null;
    presetId: string;
    filters: Record<string, number>;
    captionBar: { color: 'black' | 'white'; size: number; position: 'top' | 'bottom' | 'both' } | null;
  }) => {
    try {
      const sharp = require('sharp')
      const pathMod = require('path')
      const fsMod = require('fs')

      // Get original media
      const media = db.getMedia(mediaId)
      if (!media || !media.path) {
        return { success: false, error: 'Media not found' }
      }

      // Read the original image
      let image = sharp(media.path)
      const metadata = await image.metadata()
      const width = metadata.width || 800
      const height = metadata.height || 600

      // Apply filters
      if (options.filters) {
        const modulations: any = {}
        if (options.filters.brightness && options.filters.brightness !== 1) {
          modulations.brightness = options.filters.brightness
        }
        if (options.filters.saturate && options.filters.saturate !== 1) {
          modulations.saturation = options.filters.saturate
        }
        if (Object.keys(modulations).length > 0) {
          image = image.modulate(modulations)
        }
        if (options.filters.blur && options.filters.blur > 0) {
          image = image.blur(options.filters.blur)
        }
        if (options.filters.grayscale && options.filters.grayscale > 0) {
          image = image.grayscale()
        }
      }

      // Create output buffer
      const outputBuffer = await image.png().toBuffer()

      // Generate output filename
      const ext = pathMod.extname(media.path)
      const baseName = pathMod.basename(media.path, ext)
      const outputDir = pathMod.dirname(media.path)
      const timestamp = Date.now()
      const outputPath = pathMod.join(outputDir, `${baseName}_captioned_${timestamp}.png`)

      // Write the file
      fsMod.writeFileSync(outputPath, outputBuffer)

      // Add to database as new media
      db.upsertMedia({
        path: outputPath,
        filename: pathMod.basename(outputPath),
        type: 'image',
        ext: '.png',
        size: outputBuffer.length,
        mtimeMs: Date.now(),
        durationSec: null,
        width,
        height,
        thumbPath: null,
        hashSha256: null,
        phash: null
      })

      console.log(`[Captions] Exported captioned image to: ${outputPath}`)
      return { success: true, path: outputPath }
    } catch (err) {
      errorLogger.error('Captions', 'Export failed', err)
      return { success: false, error: String(err) }
    }
  })

  ipcMain.handle('settings:data:update', async (_ev, patch: any) => {
    const next = updateDataSettings(patch)
    broadcast('settings:changed', next)
    return next
  })

  ipcMain.handle('settings:visualEffects:update', async (_ev, patch: any) => {
    const next = updateVisualEffectsSettings(patch)
    broadcast('settings:changed', next)
    return next
  })

  ipcMain.handle('settings:setTheme', async (_ev, themeId: string) => {
    setTheme(themeId as ThemeId)
    const settings = getSettings()
    broadcast('settings:changed', settings)
    return settings
  })


  // ═══════════════════════════════════════════════════════════════════════════
  // MEDIA
  // ═══════════════════════════════════════════════════════════════════════════
  ipcMain.handle('media:search', async (_ev, opts: any) => {
    const q = opts?.q ?? opts?.query ?? ''
    const type = opts?.type ?? ''
    const tag = opts?.tags?.[0] ?? opts?.tag ?? ''
    const limit = opts?.limit ?? 10000 // Default to large number to get all
    const offset = opts?.offset ?? 0
    const sortBy = opts?.sortBy ?? 'newest'
    const blacklist = getSettings().blacklist
    const blacklistActive = !!blacklist?.enabled
      && ((blacklist?.tags?.length ?? 0) > 0 || (blacklist?.mediaIds?.length ?? 0) > 0)

    if (!blacklistActive) {
      const result = db.listMedia({ q, type, tag, limit, offset, sortBy })
      return { items: result.items, total: result.total }
    }

    // Blacklist is active — over-fetch unfiltered IDs, drop blacklisted
    // ones, then slice to the requested page. Total reflects the
    // post-filter count so the renderer's "N items" badge is accurate.
    // The unfiltered fetch costs us roughly N additional IDs over the
    // raw page size; at Vault's library scale (5-50k rows) this is
    // <100ms even with the LEFT JOINs.
    const blacklistedTags = new Set(blacklist?.tags ?? [])
    const blacklistedIds = new Set(blacklist?.mediaIds ?? [])
    const unpaginated = db.listMedia({ q, type, tag, limit: 1_000_000, offset: 0, sortBy })
    const filtered = unpaginated.items.filter((item: any) => {
      if (blacklistedIds.has(item.id)) return false
      if (item.tags && Array.isArray(item.tags)
          && item.tags.some((t: string) => blacklistedTags.has(t))) return false
      return true
    })
    const total = filtered.length
    const items = filtered.slice(offset, offset + limit)
    return { items, total }
  })

  ipcMain.handle('media:list', async (_ev, opts: any) => {
    const q = opts?.q ?? opts?.query ?? ''
    const type = opts?.type ?? ''
    const tag = opts?.tags?.[0] ?? opts?.tag ?? ''
    const limit = opts?.limit ?? 200
    const offset = opts?.offset ?? 0
    const sortBy = opts?.sortBy ?? 'newest'
    const liked = opts?.liked ?? false
    const result = db.listMedia({ q, type, tag, limit, offset, sortBy, liked })
    const filteredItems = applyBlacklist(result.items)
    return { ...result, items: filteredItems }
  })

  ipcMain.handle('media:getById', async (_ev, id: string) => {
    return db.getMedia(id)
  })

  // Return all file hashes (md5 / phash equivalents) currently in the
  // library. Browse uses this to flag posts that would be duplicate
  // saves. Cached at the db layer; this just dumps the column. Roughly
  // 30k rows in a heavy library — still single-digit ms via SQLite.
  ipcMain.handle('media:allHashes', async () => {
    try {
      const rows = (db as any).db
        ? (db as any).db.prepare(`SELECT md5 FROM media WHERE md5 IS NOT NULL AND md5 != ''`).all()
        : []
      return Array.isArray(rows) ? rows.map((r: any) => String(r.md5 ?? '').toLowerCase()).filter(Boolean) : []
    } catch (err) {
      console.warn('[media:allHashes] failed:', err)
      return []
    }
  })

  // ─────────────────────────────────────────────────────────────────────────
  //   Stacks / versions (#155) — group originals + derivative edits
  //   under a single grid card. Backed by media.stack_id + stack_role
  //   columns (migration v26). Two media in the same stack share a
  //   stack_id (the "original" item's id is the convention) so a stack
  //   has a stable identity even when the original is later removed.
  // ─────────────────────────────────────────────────────────────────────────

  ipcMain.handle('stacks:create', async (_ev, args: {
    originalId: string
    memberIds: string[]   // other items to add as 'edit'
  }) => {
    try {
      if (!args.originalId) return { ok: false, error: 'originalId required' }
      const stackId = args.originalId
      const stmt = db.raw.prepare(`UPDATE media SET stack_id = ?, stack_role = ? WHERE id = ?`)
      stmt.run(stackId, 'original', args.originalId)
      for (const mid of args.memberIds ?? []) {
        if (mid !== args.originalId) stmt.run(stackId, 'edit', mid)
      }
      broadcast('vault:changed')
      return { ok: true, stackId, memberCount: 1 + (args.memberIds?.length ?? 0) }
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })

  ipcMain.handle('stacks:add', async (_ev, args: { stackId: string; mediaIds: string[] }) => {
    try {
      const stmt = db.raw.prepare(`UPDATE media SET stack_id = ?, stack_role = ? WHERE id = ?`)
      for (const mid of args.mediaIds ?? []) stmt.run(args.stackId, 'edit', mid)
      broadcast('vault:changed')
      return { ok: true, added: args.mediaIds?.length ?? 0 }
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })

  ipcMain.handle('stacks:remove', async (_ev, mediaId: string) => {
    try {
      db.raw.prepare(`UPDATE media SET stack_id = NULL, stack_role = NULL WHERE id = ?`).run(mediaId)
      broadcast('vault:changed')
      return { ok: true }
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })

  ipcMain.handle('stacks:members', async (_ev, stackId: string) => {
    try {
      const rows = db.raw.prepare(`
        SELECT id, filename, thumbPath, type, durationSec, stack_role
        FROM media WHERE stack_id = ?
        ORDER BY CASE stack_role WHEN 'original' THEN 0 ELSE 1 END, addedAt DESC
      `).all(stackId) as Array<any>
      return { ok: true, members: rows }
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err), members: [] }
    }
  })

  // ─────────────────────────────────────────────────────────────────────────
  //   Loudness measurement (#164) — runs ffmpeg loudnorm in
  //   measurement mode (print_format=json), parses the integrated
  //   LUFS, caches in media.lufs_integrated. Player applies GainNode
  //   offset = (target_lufs - measured_lufs) so all clips hit -16 LUFS.
  // ─────────────────────────────────────────────────────────────────────────

  ipcMain.handle('media:measureLufs', async (_ev, mediaId: string) => {
    try {
      const m = db.getMedia(mediaId)
      if (!m) return { ok: false, error: 'Media not found' }
      if (m.type !== 'video') return { ok: false, error: 'Loudness only for videos' }
      if (!ffmpegBin) return { ok: false, error: 'ffmpeg not available' }
      const cached = (m as any).lufs_integrated
      if (typeof cached === 'number' && !Number.isNaN(cached)) {
        return { ok: true, lufs: cached, cached: true }
      }
      const { spawn } = await import('node:child_process')
      const args = [
        '-hide_banner', '-nostats',
        '-i', m.path,
        '-vn', '-af', 'loudnorm=print_format=json',
        '-f', 'null', '-',
      ]
      const proc = spawn(ffmpegBin, args, { windowsHide: true })
      let stderr = ''
      proc.stderr?.on('data', (c) => { stderr += c.toString('utf8') })
      const exit = await new Promise<number | null>((resolve) => {
        proc.on('error', () => resolve(-1))
        proc.on('close', (code) => resolve(code))
      })
      if (exit !== 0) return { ok: false, error: `ffmpeg loudnorm exit ${exit}` }
      // loudnorm prints a JSON block to stderr. Find the last {...} object.
      const lastBrace = stderr.lastIndexOf('}')
      const firstBrace = stderr.lastIndexOf('{', lastBrace)
      if (firstBrace < 0 || lastBrace < 0) return { ok: false, error: 'no loudnorm output' }
      let parsed: any
      try { parsed = JSON.parse(stderr.slice(firstBrace, lastBrace + 1)) }
      catch { return { ok: false, error: 'loudnorm JSON parse failed' } }
      const lufs = Number(parsed.input_i)
      if (!Number.isFinite(lufs)) return { ok: false, error: 'no input_i' }
      db.raw.prepare(`UPDATE media SET lufs_integrated = ? WHERE id = ?`).run(lufs, mediaId)
      return { ok: true, lufs, cached: false, full: parsed }
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })

  // Lightweight getter — Library can query for the cached value
  // without triggering a measurement.
  ipcMain.handle('media:getLufs', async (_ev, mediaId: string) => {
    try {
      const row = db.raw.prepare(`SELECT lufs_integrated FROM media WHERE id = ?`).get(mediaId) as { lufs_integrated: number | null } | undefined
      return { ok: true, lufs: row?.lufs_integrated ?? null }
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err), lufs: null }
    }
  })

  // ─────────────────────────────────────────────────────────────────────────
  //   Collections (#154) — first-class entities with custom cover art,
  //   description, color, ordering. Distinct from playlists (which are
  //   playback-ordered media sequences).
  // ─────────────────────────────────────────────────────────────────────────

  ipcMain.handle('collections:list', async () => {
    try {
      const rows = db.raw.prepare(`
        SELECT c.id, c.name, c.description, c.cover_path, c.color, c.position, c.parent_id,
               c.created_at, c.updated_at,
               (SELECT COUNT(*) FROM collection_members WHERE collection_id = c.id) AS item_count
        FROM collections c
        ORDER BY c.position ASC, c.name ASC
      `).all() as any[]
      return { ok: true, collections: rows }
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err), collections: [] }
    }
  })

  ipcMain.handle('collections:create', async (_ev, args: {
    name: string
    description?: string
    color?: string
    parentId?: string
  }) => {
    try {
      const id = `coll-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      const maxPos = (db.raw.prepare(`SELECT COALESCE(MAX(position), 0) + 1 AS p FROM collections`).get() as { p: number }).p
      db.raw.prepare(`
        INSERT INTO collections (id, name, description, color, position, parent_id)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(id, args.name, args.description ?? null, args.color ?? null, maxPos, args.parentId ?? null)
      broadcast('vault:changed')
      return { ok: true, id }
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })

  ipcMain.handle('collections:update', async (_ev, args: {
    id: string
    name?: string
    description?: string
    color?: string
    parentId?: string | null
  }) => {
    try {
      const sets: string[] = []
      const params: any[] = []
      for (const k of ['name', 'description', 'color'] as const) {
        if (args[k] !== undefined) { sets.push(`${k} = ?`); params.push(args[k]) }
      }
      if (args.parentId !== undefined) { sets.push(`parent_id = ?`); params.push(args.parentId) }
      if (sets.length === 0) return { ok: false, error: 'No fields to update' }
      sets.push(`updated_at = strftime('%s', 'now')`)
      params.push(args.id)
      db.raw.prepare(`UPDATE collections SET ${sets.join(', ')} WHERE id = ?`).run(...params)
      broadcast('vault:changed')
      return { ok: true }
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })

  // Reorder collections via drag-drop. Caller sends the full ordered id list.
  ipcMain.handle('collections:reorder', async (_ev, orderedIds: string[]) => {
    try {
      const stmt = db.raw.prepare(`UPDATE collections SET position = ? WHERE id = ?`)
      db.raw.transaction(() => {
        for (let i = 0; i < orderedIds.length; i++) stmt.run(i, orderedIds[i])
      })()
      broadcast('vault:changed')
      return { ok: true }
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })

  ipcMain.handle('collections:delete', async (_ev, id: string) => {
    try {
      db.raw.prepare(`DELETE FROM collections WHERE id = ?`).run(id)
      broadcast('vault:changed')
      return { ok: true }
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })

  ipcMain.handle('collections:addMedia', async (_ev, args: { collectionId: string; mediaIds: string[] }) => {
    try {
      const maxPosRow = db.raw.prepare(
        `SELECT COALESCE(MAX(position), 0) AS p FROM collection_members WHERE collection_id = ?`
      ).get(args.collectionId) as { p: number }
      let pos = maxPosRow.p
      const stmt = db.raw.prepare(`
        INSERT OR IGNORE INTO collection_members (collection_id, media_id, position) VALUES (?, ?, ?)
      `)
      db.raw.transaction(() => {
        for (const mid of args.mediaIds ?? []) stmt.run(args.collectionId, mid, ++pos)
      })()
      broadcast('vault:changed')
      return { ok: true, added: args.mediaIds?.length ?? 0 }
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })

  ipcMain.handle('collections:removeMedia', async (_ev, args: { collectionId: string; mediaIds: string[] }) => {
    try {
      const stmt = db.raw.prepare(`DELETE FROM collection_members WHERE collection_id = ? AND media_id = ?`)
      db.raw.transaction(() => {
        for (const mid of args.mediaIds ?? []) stmt.run(args.collectionId, mid)
      })()
      broadcast('vault:changed')
      return { ok: true, removed: args.mediaIds?.length ?? 0 }
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })

  ipcMain.handle('collections:members', async (_ev, collectionId: string) => {
    try {
      const rows = db.raw.prepare(`
        SELECT m.id, m.filename, m.thumbPath, m.type, m.durationSec, cm.position
        FROM collection_members cm
        JOIN media m ON m.id = cm.media_id
        WHERE cm.collection_id = ?
        ORDER BY cm.position ASC
      `).all(collectionId) as any[]
      return { ok: true, members: rows }
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err), members: [] }
    }
  })

  // Copy a user-picked image to <userData>/collection-covers/<id>.png
  // and persist the path on the collection row.
  ipcMain.handle('collections:setCover', async (_ev, args: { collectionId: string; sourcePath: string }) => {
    try {
      if (!fs.existsSync(args.sourcePath)) return { ok: false, error: 'Source image does not exist' }
      const coversDir = path.join(app.getPath('userData'), 'collection-covers')
      await fsp.mkdir(coversDir, { recursive: true })
      const ext = path.extname(args.sourcePath) || '.png'
      const dest = path.join(coversDir, `${args.collectionId}${ext}`)
      await fsp.copyFile(args.sourcePath, dest)
      db.raw.prepare(`UPDATE collections SET cover_path = ?, updated_at = strftime('%s', 'now') WHERE id = ?`)
        .run(dest, args.collectionId)
      broadcast('vault:changed')
      return { ok: true, coverPath: dest }
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })

  // ─────────────────────────────────────────────────────────────────────────
  //   Relationships graph (#156) — user-drawn or inferred parent/
  //   child/alt/companion links between distinct media items.
  // ─────────────────────────────────────────────────────────────────────────

  ipcMain.handle('relationships:list', async (_ev, mediaId: string) => {
    try {
      const outgoing = db.raw.prepare(`
        SELECT r.id, r.source_id, r.target_id, r.kind, r.notes, r.created_at,
               m.filename AS target_filename, m.thumbPath AS target_thumb, m.type AS target_type
        FROM media_relationships r
        JOIN media m ON m.id = r.target_id
        WHERE r.source_id = ?
        ORDER BY r.created_at DESC
      `).all(mediaId) as any[]
      const incoming = db.raw.prepare(`
        SELECT r.id, r.source_id, r.target_id, r.kind, r.notes, r.created_at,
               m.filename AS source_filename, m.thumbPath AS source_thumb, m.type AS source_type
        FROM media_relationships r
        JOIN media m ON m.id = r.source_id
        WHERE r.target_id = ?
        ORDER BY r.created_at DESC
      `).all(mediaId) as any[]
      return { ok: true, outgoing, incoming }
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err), outgoing: [], incoming: [] }
    }
  })

  // Note: `relationships:create` / `relationships:delete` are the
  // service-layer handlers registered later in this file (positional args
  // + RelationshipType). The graph UI consumes its own simple-kind
  // variants below to avoid IPC name collisions.
  ipcMain.handle('relationships:createSimple', async (_ev, args: {
    sourceId: string
    targetId: string
    kind: 'parent' | 'child' | 'alternate' | 'companion'
    notes?: string
  }) => {
    try {
      if (!args.sourceId || !args.targetId || args.sourceId === args.targetId) {
        return { ok: false, error: 'sourceId/targetId required + must differ' }
      }
      const id = `rel-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      db.raw.prepare(`
        INSERT OR IGNORE INTO media_relationships (id, source_id, target_id, kind, notes)
        VALUES (?, ?, ?, ?, ?)
      `).run(id, args.sourceId, args.targetId, args.kind, args.notes ?? null)
      broadcast('vault:changed')
      return { ok: true, id }
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })

  ipcMain.handle('relationships:deleteSimple', async (_ev, id: string) => {
    try {
      db.raw.prepare(`DELETE FROM media_relationships WHERE id = ?`).run(id)
      broadcast('vault:changed')
      return { ok: true }
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })

  /**
   * Auto-suggest related media for a given mediaId, based on:
   *   - shared performer:* tags
   *   - duration within ±10% (for videos)
   * Returns candidates the user can promote to real relationships.
   */
  ipcMain.handle('relationships:infer', async (_ev, mediaId: string) => {
    try {
      const me = db.getMedia(mediaId)
      if (!me) return { ok: false, error: 'Media not found', candidates: [] }
      const myTags = db.listMediaTags(mediaId).map(t => t.name.toLowerCase())
      const performerTags = myTags.filter(t => t.startsWith('performer:') || t.startsWith('artist:'))
      if (performerTags.length === 0 && !me.durationSec) {
        return { ok: true, candidates: [] }
      }
      const placeholders = performerTags.map(() => '?').join(',') || "''"
      // Pull every other media that shares ≥1 performer/artist tag
      const tagMatches = performerTags.length > 0 ? db.raw.prepare(`
        SELECT m.id, m.filename, m.thumbPath, m.type, m.durationSec, COUNT(DISTINCT t.name) AS shared
        FROM media m
        JOIN media_tags mt ON mt.mediaId = m.id
        JOIN tags t ON t.id = mt.tagId
        WHERE m.id != ? AND t.name IN (${placeholders})
        GROUP BY m.id
        ORDER BY shared DESC
        LIMIT 50
      `).all(mediaId, ...performerTags) as any[] : []
      // Re-rank by duration proximity if me.durationSec is set
      const out = tagMatches.map(t => {
        let durScore = 0
        if (me.durationSec && t.durationSec) {
          const ratio = Math.min(me.durationSec, t.durationSec) / Math.max(me.durationSec, t.durationSec)
          durScore = Math.max(0, (ratio - 0.9) * 10)  // 0 at 90% ratio, 1 at exact match
        }
        return { ...t, score: (t.shared as number) + durScore }
      }).sort((a, b) => b.score - a.score)
      return { ok: true, candidates: out.slice(0, 20) }
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err), candidates: [] }
    }
  })

  // #120 — Watermark crop heuristic. Single-file IPC the user can
  // wire to a post-save hook OR invoke ad-hoc from the right-click
  // menu on a media tile.
  ipcMain.handle('media:cropWatermarks', async (_ev, mediaId: string) => {
    try {
      const m = db.getMedia(mediaId)
      if (!m) return { ok: false, error: 'Media not found' }
      const { cropWatermarksInPlace } = await import('./services/watermark-cropper')
      const r = await cropWatermarksInPlace(m.path)
      if (r.ok && r.cropped) {
        // Re-stat to update size + height in the DB; cheap.
        try {
          const stat = fs.statSync(m.path)
          db.raw.prepare(`UPDATE media SET size = ?, height = ? WHERE id = ?`)
            .run(stat.size, r.height ?? m.height, mediaId)
        } catch { /* swallow */ }
        broadcast('vault:changed')
      }
      return r
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })

  // #110 — Batch MD5 backfill. Scans every media row missing an md5,
  // streams the file through crypto.createHash('md5'), persists. Used
  // by Browse to populate libraryHashes for the in-library-badge check
  // against booru-returned md5s. Idempotent — skips already-computed rows.
  ipcMain.handle('media:backfillMd5', async () => {
    try {
      const crypto = await import('node:crypto')
      const rows = db.raw.prepare(
        `SELECT id, path FROM media WHERE (md5 IS NULL OR md5 = '') LIMIT 5000`
      ).all() as Array<{ id: string; path: string }>
      const stmt = db.raw.prepare(`UPDATE media SET md5 = ? WHERE id = ?`)
      let hashed = 0
      let skipped = 0
      for (const r of rows) {
        try {
          if (!fs.existsSync(r.path)) { skipped++; continue }
          const md5 = await new Promise<string>((resolve, reject) => {
            const hash = crypto.createHash('md5')
            const stream = fs.createReadStream(r.path)
            stream.on('error', reject)
            stream.on('data', (chunk) => hash.update(chunk))
            stream.on('end', () => resolve(hash.digest('hex')))
          })
          stmt.run(md5, r.id)
          hashed++
        } catch (err) {
          skipped++
        }
      }
      return { ok: true, hashed, skipped, total: rows.length }
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })

  // #197 — Funscript sidecar lookup. Per Funscript convention, the
  // file lives next to the media as <basename>.funscript with JSON
  // payload {version, actions: [{at: ms, pos: 0-100}, ...]}. Vault
  // doesn't ship an editor yet — this is the read path for the
  // heatmap overlay on the seek bar.
  ipcMain.handle('media:loadFunscript', async (_ev, mediaId: string) => {
    try {
      const media = db.getMedia(mediaId)
      if (!media) return { ok: false, error: 'Media not found' }
      const ext = path.extname(media.path)
      const baseNoExt = media.path.slice(0, media.path.length - ext.length)
      const candidates = [
        `${baseNoExt}.funscript`,
        `${media.path}.funscript`,
      ]
      for (const fp of candidates) {
        try {
          if (!fs.existsSync(fp)) continue
          const raw = fs.readFileSync(fp, 'utf8')
          const parsed = JSON.parse(raw)
          if (Array.isArray(parsed?.actions)) {
            return {
              ok: true,
              path: fp,
              version: parsed.version ?? null,
              inverted: !!parsed.inverted,
              actionCount: parsed.actions.length,
              actions: parsed.actions as Array<{ at: number; pos: number }>,
            }
          }
        } catch { /* try next */ }
      }
      return { ok: false, error: 'No .funscript sidecar found' }
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })

  ipcMain.handle('media:randomByTags', async (_ev, tags: string[], opts?: any) => {
    const limit = opts?.limit ?? 50
    const typeFilter = opts?.type ?? 'video' // Default to video for Feed compatibility
    let items: any[] = []
    if (tags.length === 0) {
      items = db.listMedia({ q: '', type: typeFilter, tag: '', limit: 500, offset: 0 }).items
    } else {
      for (const tag of tags) {
        const result = db.listMedia({ q: '', type: typeFilter, tag, limit: 200, offset: 0 })
        items.push(...result.items)
      }
      const seen = new Set<string>()
      items = items.filter((m) => {
        if (seen.has(m.id)) return false
        seen.add(m.id)
        return true
      })
    }
    // Apply blacklist filtering
    items = applyBlacklist(items)
    // Shuffle
    for (let i = items.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[items[i], items[j]] = [items[j], items[i]]
    }
    return items.slice(0, limit)
  })

  ipcMain.handle('media:rescan', async () => {
    const dirs = getMediaDirs()
    await onDirsChanged(dirs)
    return true
  })

  // Import files by copying them to the first media directory
  ipcMain.handle('media:importFiles', async (_ev, filePaths: string[]) => {
    const dirs = getMediaDirs()
    if (!dirs.length) {
      return { success: false, error: 'No media directories configured' }
    }

    const targetDir = dirs[0]
    const imported: string[] = []
    const failed: string[] = []

    // Supported extensions
    const supportedExts = new Set(['.mp4', '.webm', '.mkv', '.avi', '.mov', '.wmv', '.flv', '.m4v', '.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'])

    for (const filePath of filePaths) {
      try {
        const ext = path.extname(filePath).toLowerCase()
        if (!supportedExts.has(ext)) {
          failed.push(filePath)
          continue
        }

        const fileName = path.basename(filePath)
        let targetPath = path.join(targetDir, fileName)

        // Handle duplicate filenames
        let counter = 1
        while (fs.existsSync(targetPath)) {
          const baseName = path.basename(fileName, ext)
          targetPath = path.join(targetDir, `${baseName}_${counter}${ext}`)
          counter++
        }

        // Copy the file
        fs.copyFileSync(filePath, targetPath)
        imported.push(targetPath)
      } catch (err) {
        errorLogger.error('Import', `Failed to import ${filePath}`, err)
        failed.push(filePath)
      }
    }

    // Trigger rescan to pick up new files
    if (imported.length > 0) {
      await onDirsChanged(dirs)
    }

    return { success: true, imported: imported.length, failed: failed.length }
  })

  ipcMain.handle('media:getStats', async (_ev, mediaId: string) => {
    return db.statsGet(mediaId)
  })

  // Batch fetch stats for multiple media items - major performance optimization
  ipcMain.handle('media:getStatsBatch', async (_ev, mediaIds: string[]) => {
    const statsMap = db.statsGetBatch(mediaIds)
    // Convert Map to object for IPC serialization
    const result: Record<string, { rating: number; viewCount: number; oCount: number }> = {}
    statsMap.forEach((value, key) => {
      result[key] = value
    })
    return result
  })

  ipcMain.handle('media:recordView', async (_ev, mediaId: string) => {
    return db.statsRecordView(mediaId)
  })

  ipcMain.handle('media:setRating', async (_ev, mediaId: string, rating: number) => {
    const result = db.statsSetRating(mediaId, rating)
    recordRatingGiven()  // Track for achievements
    checkAchievements()  // Check 'rated' achievement
    broadcast('vault:changed')
    return result
  })

  // Update title — direct mutate on the media table. Used by the Library
  // metadata editor + any manual rename flows that don't touch the
  // filesystem (separate from media:rename which renames the on-disk file).
  ipcMain.handle('media:setTitle', async (_ev, mediaId: string, title: string) => {
    try {
      db.raw.prepare(`UPDATE media SET title = ? WHERE id = ?`).run(title ?? null, mediaId)
      broadcast('vault:changed')
      return { success: true }
    } catch (err: any) {
      return { success: false, error: err?.message ?? String(err) }
    }
  })

  // Update description — stored in ai_analysis_results.description. We
  // create a stub row if none exists so manual descriptions persist even
  // for media that hasn't been AI-analyzed yet.
  ipcMain.handle('media:setDescription', async (_ev, mediaId: string, description: string) => {
    try {
      const existing = db.raw.prepare(`SELECT 1 FROM ai_analysis_results WHERE media_id = ?`).get(mediaId)
      if (existing) {
        db.raw.prepare(`UPDATE ai_analysis_results SET description = ? WHERE media_id = ?`).run(description ?? null, mediaId)
      } else {
        // Insert a manual-only row so the description sticks. review_status
        // 'approved' so it doesn't show up in the pending review queue.
        db.raw.prepare(`
          INSERT INTO ai_analysis_results (media_id, description, review_status, reviewed_at, created_at)
          VALUES (?, ?, 'approved', datetime('now'), datetime('now'))
        `).run(mediaId, description ?? null)
      }
      broadcast('vault:changed')
      return { success: true }
    } catch (err: any) {
      return { success: false, error: err?.message ?? String(err) }
    }
  })

  // Fetch the saved description for a media item (returns null if none).
  ipcMain.handle('media:getDescription', async (_ev, mediaId: string) => {
    try {
      const row = db.raw.prepare(`SELECT description FROM ai_analysis_results WHERE media_id = ?`).get(mediaId) as { description: string | null } | undefined
      return row?.description ?? null
    } catch {
      return null
    }
  })

  // Bulk set rating for multiple media items
  ipcMain.handle('media:bulkSetRating', async (_ev, mediaIds: string[], rating: number) => {
    let updated = 0
    for (const mediaId of mediaIds) {
      try {
        db.statsSetRating(mediaId, rating)
        updated++
      } catch (err) {
        errorLogger.error('Media', `Failed to set rating for ${mediaId}`, err)
      }
    }
    if (updated > 0) {
      recordRatingGiven()
      checkAchievements()
      broadcast('vault:changed')
    }
    return { updated, total: mediaIds.length }
  })

  ipcMain.handle('media:incO', async (_ev, mediaId: string) => {
    const result = db.statsIncO(mediaId)
    broadcast('vault:changed')
    return result
  })

  ipcMain.handle('media:count', async (_ev, opts?: any) => {
    const q = opts?.q ?? ''
    const type = opts?.type ?? ''
    const tag = opts?.tag ?? ''
    return db.countMedia({ q, type, tag })
  })

  // Move broken/corrupted media files to a separate folder
  ipcMain.handle('media:moveBroken', async (_ev, mediaId: string, reason?: string) => {
    try {
      const media = db.getMedia(mediaId)
      if (!media) return { success: false, error: 'Media not found' }

      // Create broken files folder on C: drive
      const brokenDir = 'C:\\VaultBrokenFiles'
      if (!fs.existsSync(brokenDir)) {
        fs.mkdirSync(brokenDir, { recursive: true })
      }

      const filename = path.basename(media.path)
      const destPath = path.join(brokenDir, filename)

      // Handle duplicate filenames
      let finalDest = destPath
      let counter = 1
      while (fs.existsSync(finalDest)) {
        const ext = path.extname(filename)
        const base = path.basename(filename, ext)
        finalDest = path.join(brokenDir, `${base}_${counter}${ext}`)
        counter++
      }

      // Move the file
      if (fs.existsSync(media.path)) {
        fs.renameSync(media.path, finalDest)
        console.log(`[Media] Moved broken file: ${media.path} -> ${finalDest} (reason: ${reason || 'unknown'})`)
      }

      // Remove from database
      db.deleteMediaById(mediaId)
      broadcast('vault:changed')

      return { success: true, movedTo: finalDest }
    } catch (err: any) {
      errorLogger.error('Media', 'Failed to move broken file', err)
      return { success: false, error: err.message }
    }
  })

  // Rename a media file on disk and update the DB. Used by the AI Review
  // pane to accept Tier 2's `suggested_filename` for gibberish-named files.
  ipcMain.handle('media:rename', async (_ev, mediaId: string, newBaseName: string) => {
    try {
      const media = db.getMedia(mediaId)
      if (!media) return { success: false, error: 'Media not found' }
      if (!fs.existsSync(media.path)) return { success: false, error: 'File missing on disk' }

      // Sanitize: strip path-like chars, collapse whitespace.
      const safe = String(newBaseName).trim().replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim()
      if (!safe) return { success: false, error: 'New name is empty after sanitization' }
      if (safe.length > 200) return { success: false, error: 'New name too long' }

      const dir = path.dirname(media.path)
      const ext = path.extname(media.path)
      let newFilename = `${safe}${ext}`
      let newPath = path.join(dir, newFilename)

      // Avoid collisions — append " (n)" if the target exists.
      let suffix = 1
      while (fs.existsSync(newPath) && newPath !== media.path) {
        newFilename = `${safe} (${suffix})${ext}`
        newPath = path.join(dir, newFilename)
        suffix += 1
        if (suffix > 50) return { success: false, error: 'Too many name collisions' }
      }

      if (newPath === media.path) {
        return { success: true, renamed: false, newPath }
      }

      fs.renameSync(media.path, newPath)
      db.updateMediaPath(mediaId, newPath, newFilename)

      // Clear the suggestion so the review item no longer shows the rename prompt.
      try {
        db.raw.prepare(`UPDATE ai_analysis_results SET suggested_filename = NULL WHERE media_id = ?`).run(mediaId)
      } catch {
        // Column may not exist on very old DBs — ignore.
      }

      console.log(`[Media] Renamed: ${media.path} -> ${newPath}`)
      broadcast('vault:changed')
      return { success: true, renamed: true, newPath, newFilename }
    } catch (err: any) {
      errorLogger.error('Media', 'Failed to rename media', err)
      return { success: false, error: err?.message ?? String(err) }
    }
  })

  // Reject a Tier 2 filename suggestion without renaming. Just clears the column
  // so the review UI stops nagging. Tags are still pending review separately.
  ipcMain.handle('media:rejectRenameSuggestion', async (_ev, mediaId: string) => {
    try {
      db.raw.prepare(`UPDATE ai_analysis_results SET suggested_filename = NULL WHERE media_id = ?`).run(mediaId)
      return { success: true }
    } catch (err: any) {
      return { success: false, error: err?.message ?? String(err) }
    }
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // MEDIA - Playable URL (transcode on demand)
  // ═══════════════════════════════════════════════════════════════════════════
  ipcMain.handle('media:getPlayableUrl', async (_ev, mediaId: string, forceTranscode?: boolean) => {
    const media = db.getMedia(mediaId)
    if (!media) return null
    const ext = path.extname(media.path).toLowerCase()

    // Determine if transcoding is needed: by extension or by force flag
    // Skip proactive codec probing for .mp4/.webm/.ogg/.ogv — they play natively 95%+ of the time
    // The error-retry-transcode path in the renderer handles rare HEVC/etc cases
    const shouldTranscode = forceTranscode || needsTranscode(ext)

    if (shouldTranscode) {
      // Check if already transcoded
      let tp = getTranscodedPath(mediaId)
      if (!tp) {
        tp = await transcodeToMp4(media.path, mediaId)
        db.setTranscodedPath(mediaId, tp)
      }
      return toVaultUrl(tp)
    }
    return toVaultUrl(media.path)
  })

  ipcMain.handle('media:getLowResUrl', async (_ev, mediaId: string, maxHeight: number) => {
    const media = db.getMedia(mediaId)
    if (!media) return null
    try {
      const tp = await transcodeLowRes(media.path, mediaId, maxHeight)
      return toVaultUrl(tp)
    } catch (e) {
      console.warn('[IPC] Low-res transcode failed, falling back to original:', e)
      return toVaultUrl(media.path)
    }
  })

  ipcMain.handle('media:getLoudnessPeak', async (_ev, mediaId: string) => {
    return db.getLoudnessPeakTime(mediaId)
  })

  // On-demand thumbnail generation — called when MediaTile has no thumb
  ipcMain.handle('media:generateThumb', async (_ev, mediaId: string) => {
    try {
      const media = db.getMedia(mediaId)
      if (!media) return null
      if (media.thumbPath && fs.existsSync(media.thumbPath)) {
        return media.thumbPath // Already has valid thumb
      }
      let thumbPath: string | null = null
      if (media.type === 'video') {
        const dur = media.durationSec ?? await probeVideoDurationSec(media.path)
        thumbPath = await makeVideoThumb({
          mediaId: media.id,
          filePath: media.path,
          mtimeMs: media.mtimeMs,
          durationSec: dur
        })
      } else if (media.type === 'gif') {
        // Use dedicated GIF handler with fallback
        const dur = media.durationSec ?? await probeVideoDurationSec(media.path)
        thumbPath = await makeGifThumb({
          mediaId: media.id,
          filePath: media.path,
          mtimeMs: media.mtimeMs,
          durationSec: dur
        })
      } else {
        thumbPath = await makeImageThumb({
          mediaId: media.id,
          filePath: media.path,
          mtimeMs: media.mtimeMs
        })
      }
      if (thumbPath) {
        // Update DB with thumb path
        db.raw.prepare('UPDATE media SET thumbPath=? WHERE id=?').run(thumbPath, mediaId)
        broadcast('vault:changed')
      }
      return thumbPath
    } catch (err: any) {
      errorLogger.error('IPC', `generateThumb failed for ${mediaId}`, err)
      return null
    }
  })

  // Find duplicate files by SHA-256 hash
  ipcMain.handle('media:findDuplicates', async () => {
    try {
      const rows = db.raw.prepare(`
        SELECT hashSha256, GROUP_CONCAT(id, '|') as ids, GROUP_CONCAT(path, '|') as paths, COUNT(*) as cnt
        FROM media
        WHERE hashSha256 IS NOT NULL AND hashSha256 != ''
        GROUP BY hashSha256
        HAVING cnt > 1
        ORDER BY cnt DESC
      `).all() as Array<{ hashSha256: string; ids: string; paths: string; cnt: number }>

      return rows.map(r => ({
        hash: r.hashSha256,
        count: r.cnt,
        ids: r.ids.split('|'),
        paths: r.paths.split('|')
      }))
    } catch (err: any) {
      console.error('[IPC] findDuplicates error:', err?.message)
      return []
    }
  })

  // Delete duplicate files, keeping the first one
  ipcMain.handle('media:deleteDuplicates', async (_ev, options?: { dryRun?: boolean }) => {
    try {
      const dryRun = options?.dryRun ?? false
      const rows = db.raw.prepare(`
        SELECT hashSha256, GROUP_CONCAT(id, '|') as ids, GROUP_CONCAT(path, '|') as paths, COUNT(*) as cnt
        FROM media
        WHERE hashSha256 IS NOT NULL AND hashSha256 != ''
        GROUP BY hashSha256
        HAVING cnt > 1
      `).all() as Array<{ hashSha256: string; ids: string; paths: string; cnt: number }>

      let deletedCount = 0
      let freedBytes = 0
      const deleted: string[] = []

      for (const r of rows) {
        const ids = r.ids.split('|')
        const paths = r.paths.split('|')
        // Keep the first, delete the rest
        for (let i = 1; i < ids.length; i++) {
          if (!dryRun) {
            try {
              if (fs.existsSync(paths[i])) {
                const stat = fs.statSync(paths[i])
                freedBytes += stat.size
                fs.unlinkSync(paths[i])
              }
              db.deleteMediaById(ids[i])
            } catch (e: any) {
              console.warn('[Dedup] Failed to delete:', paths[i], e?.message)
              continue
            }
          }
          deleted.push(paths[i])
          deletedCount++
        }
      }

      if (!dryRun && deletedCount > 0) {
        broadcast('vault:changed')
      }

      return { deletedCount, freedBytes, deleted, dryRun }
    } catch (err: any) {
      console.error('[IPC] deleteDuplicates error:', err?.message)
      return { deletedCount: 0, freedBytes: 0, deleted: [], dryRun: true, error: err?.message }
    }
  })

  // Undo stack for deleted media (stores last 10 deletions)
  const deletedMediaStack: Array<{
    id: string
    path: string
    filename: string
    ext: string
    type: string
    size: number
    mtimeMs: number
    durationSec: number | null
    thumbPath: string | null
    width: number | null
    height: number | null
    hashSha256: string | null
    phash: string | null
    tags: string[]
    deletedAt: number
  }> = []
  const MAX_UNDO_STACK = 10

  // Persistent trash retention window — items older than this auto-purge
  // at boot. 30 days matches the Trash bin convention in macOS / Windows
  // Recycle Bin / Google Drive.
  const TRASH_RETENTION_SECONDS = 30 * 24 * 60 * 60

  // Delete media from library (soft delete - file stays on disk).
  // Writes to BOTH the in-memory undo stack (for instant Ctrl+Z) AND the
  // persistent media_trash table (for cross-session restore up to 30
  // days). The two systems are independent — Ctrl+Z still pops the most
  // recent stack entry; the Settings → Trash UI lists from media_trash.
  ipcMain.handle('media:delete', async (_ev, mediaId: string) => {
    try {
      const media = db.getMedia(mediaId)
      if (!media) {
        return { success: false, error: 'Media not found' }
      }

      // Get tags before deletion for restoration
      const tags = db.listMediaTags(mediaId).map(t => t.name)

      // Store for undo
      deletedMediaStack.push({
        id: media.id,
        path: media.path,
        filename: media.filename,
        ext: media.ext,
        type: media.type,
        size: media.size,
        mtimeMs: media.mtimeMs,
        durationSec: media.durationSec,
        thumbPath: media.thumbPath,
        width: media.width,
        height: media.height,
        hashSha256: media.hashSha256,
        phash: media.phash,
        tags,
        deletedAt: Date.now()
      })

      // Keep stack size limited
      while (deletedMediaStack.length > MAX_UNDO_STACK) {
        deletedMediaStack.shift()
      }

      // Persist to media_trash for cross-session restore. Best-effort —
      // a write failure here is logged but doesn't block the delete
      // itself (the user explicitly asked to delete).
      try {
        const nowSec = Math.floor(Date.now() / 1000)
        const restorationData = JSON.stringify({
          id: media.id,
          path: media.path,
          filename: media.filename,
          ext: media.ext,
          type: media.type,
          size: media.size,
          mtimeMs: media.mtimeMs,
          durationSec: media.durationSec,
          thumbPath: media.thumbPath,
          width: media.width,
          height: media.height,
          hashSha256: media.hashSha256,
          phash: media.phash,
          tags,
        })
        db.raw.prepare(`
          INSERT OR REPLACE INTO media_trash
            (id, original_path, filename, type, size_bytes, duration_sec,
             thumb_path, deleted_at, purge_at, restoration_data)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          media.id,
          media.path,
          media.filename,
          media.type,
          media.size ?? null,
          media.durationSec ?? null,
          media.thumbPath ?? null,
          nowSec,
          nowSec + TRASH_RETENTION_SECONDS,
          restorationData,
        )
      } catch (err) {
        console.warn('[media:delete] media_trash insert failed (non-fatal):', err)
      }

      // Delete from database (file stays on disk)
      db.deleteMediaById(mediaId)
      broadcast('vault:changed')

      return { success: true, deletedMedia: { id: mediaId, path: media.path, filename: media.filename } }
    } catch (err: any) {
      errorLogger.error('IPC', 'media:delete error', err)
      return { success: false, error: err?.message }
    }
  })

  // List trash entries newest-first. Used by Settings → Trash panel.
  ipcMain.handle('media:trash:list', async () => {
    try {
      const rows = db.raw.prepare(`
        SELECT id, original_path, filename, type, size_bytes, duration_sec,
               thumb_path, deleted_at, purge_at
        FROM media_trash
        ORDER BY deleted_at DESC
        LIMIT 1000
      `).all() as Array<{
        id: string; original_path: string; filename: string; type: string
        size_bytes: number | null; duration_sec: number | null
        thumb_path: string | null; deleted_at: number; purge_at: number
      }>
      return { ok: true, items: rows }
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err), items: [] }
    }
  })

  // Restore a single trash entry back to the library. Re-upserts the
  // media row + reattaches tags from restoration_data, then drops the
  // trash entry. Errors if the file no longer exists on disk.
  ipcMain.handle('media:trash:restore', async (_ev, trashId: string) => {
    try {
      const row = db.raw.prepare(
        `SELECT restoration_data FROM media_trash WHERE id = ?`
      ).get(trashId) as { restoration_data: string } | undefined
      if (!row) return { ok: false, error: 'Trash entry not found' }
      const data = JSON.parse(row.restoration_data) as {
        id: string; path: string; filename: string; ext: string
        type: 'video' | 'image' | 'gif'
        size: number; mtimeMs: number
        durationSec: number | null; thumbPath: string | null
        width: number | null; height: number | null
        hashSha256: string | null; phash: string | null
        tags: string[]
      }
      if (!fs.existsSync(data.path)) {
        return { ok: false, error: 'File no longer exists on disk', path: data.path }
      }
      db.upsertMedia({
        id: data.id,
        path: data.path,
        filename: data.filename,
        ext: data.ext,
        type: data.type,
        size: data.size,
        mtimeMs: data.mtimeMs,
        durationSec: data.durationSec,
        thumbPath: data.thumbPath,
        width: data.width,
        height: data.height,
        hashSha256: data.hashSha256,
        phash: data.phash,
        addedAt: Date.now(),
      })
      for (const tagName of data.tags ?? []) {
        try {
          db.ensureTag(tagName)
          db.addTagToMedia(data.id, tagName)
        } catch { /* skip tag-restore errors per-tag */ }
      }
      db.raw.prepare(`DELETE FROM media_trash WHERE id = ?`).run(trashId)
      broadcast('vault:changed')
      return { ok: true, restoredId: data.id }
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })

  // Drop a trash entry without restoring (user manually purges).
  ipcMain.handle('media:trash:purgeOne', async (_ev, trashId: string) => {
    try {
      const r = db.raw.prepare(`DELETE FROM media_trash WHERE id = ?`).run(trashId)
      broadcast('vault:changed')
      return { ok: true, removed: r.changes }
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })

  // Drop ALL trash entries. Confirmation-gated in the UI.
  ipcMain.handle('media:trash:purgeAll', async () => {
    try {
      const r = db.raw.prepare(`DELETE FROM media_trash`).run()
      broadcast('vault:changed')
      return { ok: true, removed: r.changes }
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })

  // Boot-time auto-purge — drops any trash entry whose purge_at has
  // passed (default 30 days from soft-delete). Called once on startup
  // from main.ts; safe to invoke repeatedly.
  ipcMain.handle('media:trash:autoPurgeExpired', async () => {
    try {
      const nowSec = Math.floor(Date.now() / 1000)
      const r = db.raw.prepare(
        `DELETE FROM media_trash WHERE purge_at < ?`
      ).run(nowSec)
      if (r.changes > 0) {
        console.log(`[media:trash] Auto-purged ${r.changes} expired trash entries`)
      }
      return { ok: true, removed: r.changes }
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })

  // Undo last delete (restores media to library if file still exists)
  ipcMain.handle('media:undoDelete', async () => {
    try {
      if (deletedMediaStack.length === 0) {
        return { success: false, error: 'Nothing to undo' }
      }

      const lastDeleted = deletedMediaStack.pop()!

      // Check if file still exists
      if (!fs.existsSync(lastDeleted.path)) {
        return { success: false, error: 'File no longer exists on disk' }
      }

      // Re-add to database
      db.upsertMedia({
        id: lastDeleted.id,
        path: lastDeleted.path,
        filename: lastDeleted.filename,
        ext: lastDeleted.ext,
        type: lastDeleted.type as 'video' | 'image' | 'gif',
        size: lastDeleted.size,
        mtimeMs: lastDeleted.mtimeMs,
        durationSec: lastDeleted.durationSec,
        thumbPath: lastDeleted.thumbPath,
        width: lastDeleted.width,
        height: lastDeleted.height,
        hashSha256: lastDeleted.hashSha256,
        phash: lastDeleted.phash,
        addedAt: Date.now()
      })

      // Restore tags
      for (const tagName of lastDeleted.tags) {
        db.ensureTag(tagName)
        db.addTagToMedia(lastDeleted.id, tagName)
      }

      broadcast('vault:changed')

      return { success: true, restoredId: lastDeleted.id }
    } catch (err: any) {
      console.error('[IPC] media:undoDelete error:', err?.message)
      return { success: false, error: err?.message }
    }
  })

  // Create GIF from video segment
  ipcMain.handle('media:createGif', async (_ev, options: {
    mediaId: string
    startTime: number
    endTime: number
    fps?: number
    width?: number
    quality?: 'low' | 'medium' | 'high'
  }): Promise<{ success: boolean; gifPath?: string; error?: string }> => {
    try {
      const { mediaId, startTime, endTime, fps: userFps, width: _width = 480, quality = 'medium' } = options

      // Get media from database
      const media = db.getMedia(mediaId)
      if (!media) {
        return { success: false, error: 'Media not found' }
      }

      if (media.type !== 'video') {
        return { success: false, error: 'Can only create GIF from video files' }
      }

      // Validate time range
      const duration = endTime - startTime
      if (duration <= 0 || duration > 30) {
        return { success: false, error: 'GIF duration must be between 0 and 30 seconds' }
      }

      // Create output path in cache directory
      const cacheDir = getCacheDir()
      const gifDir = path.join(cacheDir, 'gifs')
      if (!fs.existsSync(gifDir)) {
        fs.mkdirSync(gifDir, { recursive: true })
      }

      const outputFilename = `${mediaId}_${startTime.toFixed(1)}-${endTime.toFixed(1)}_${Date.now()}.gif`
      const outputPath = path.join(gifDir, outputFilename)

      // Quality settings (scale and dither based on quality, fps from user selection)
      const qualitySettings = {
        low: { scale: 320, defaultFps: 10, dither: 'none' },
        medium: { scale: 480, defaultFps: 15, dither: 'bayer:bayer_scale=3' },
        high: { scale: 720, defaultFps: 20, dither: 'floyd_steinberg' }
      }
      const baseSettings = qualitySettings[quality]
      // Use user-specified FPS if provided, otherwise use quality default
      const settings = { ...baseSettings, fps: userFps || baseSettings.defaultFps }

      console.log(`[GIF] Creating GIF from ${media.filename}: ${startTime}s to ${endTime}s`)

      // Use fluent-ffmpeg to create the GIF with a palette for better quality
      return new Promise((resolve) => {
        // Two-pass approach for better quality:
        // Pass 1: Generate palette
        // Pass 2: Use palette to create GIF
        const tempPalette = path.join(gifDir, `palette_${Date.now()}.png`)

        // Generate palette
        ffmpeg(media.path)
          .setStartTime(startTime)
          .setDuration(duration)
          .outputOptions([
            `-vf`, `fps=${settings.fps},scale=${settings.scale}:-1:flags=lanczos,palettegen=stats_mode=diff`
          ])
          .output(tempPalette)
          .on('error', (err) => {
            console.error('[GIF] Palette generation error:', err.message)
            // Fallback: create GIF without palette
            ffmpeg(media.path)
              .setStartTime(startTime)
              .setDuration(duration)
              .outputOptions([
                `-vf`, `fps=${settings.fps},scale=${settings.scale}:-1:flags=lanczos`,
                `-loop`, `0`
              ])
              .output(outputPath)
              .on('error', (err2) => {
                console.error('[GIF] Creation error:', err2.message)
                resolve({ success: false, error: err2.message })
              })
              .on('end', () => {
                console.log('[GIF] Created (fallback):', outputPath)
                resolve({ success: true, gifPath: outputPath })
              })
              .run()
          })
          .on('end', () => {
            // Use palette to create GIF
            ffmpeg(media.path)
              .setStartTime(startTime)
              .setDuration(duration)
              .input(tempPalette)
              .complexFilter([
                `[0:v]fps=${settings.fps},scale=${settings.scale}:-1:flags=lanczos[x]`,
                `[x][1:v]paletteuse=dither=${settings.dither}`
              ])
              .outputOptions([`-loop`, `0`])
              .output(outputPath)
              .on('error', (err) => {
                console.error('[GIF] Creation error:', err.message)
                // Clean up temp palette
                try { fs.unlinkSync(tempPalette) } catch {}
                resolve({ success: false, error: err.message })
              })
              .on('end', () => {
                console.log('[GIF] Created:', outputPath)
                // Clean up temp palette
                try { fs.unlinkSync(tempPalette) } catch {}
                resolve({ success: true, gifPath: outputPath })
              })
              .run()
          })
          .run()
      })
    } catch (err: any) {
      console.error('[IPC] media:createGif error:', err?.message)
      return { success: false, error: err?.message }
    }
  })

  // Save GIF to user-selected folder
  ipcMain.handle('media:saveGif', async (_ev, gifPath: string): Promise<{ success: boolean; savedPath?: string; error?: string }> => {
    try {
      if (!fs.existsSync(gifPath)) {
        return { success: false, error: 'GIF file not found' }
      }

      const result = await dialog.showSaveDialog({
        title: 'Save GIF',
        defaultPath: path.basename(gifPath),
        filters: [{ name: 'GIF Image', extensions: ['gif'] }]
      })

      if (result.canceled || !result.filePath) {
        return { success: false, error: 'Save cancelled' }
      }

      fs.copyFileSync(gifPath, result.filePath)
      return { success: true, savedPath: result.filePath }
    } catch (err: any) {
      console.error('[IPC] media:saveGif error:', err?.message)
      return { success: false, error: err?.message }
    }
  })

  // Add GIF to library (copy to media directory)
  ipcMain.handle('media:addGifToLibrary', async (_ev, gifPath: string): Promise<{ success: boolean; mediaId?: string; error?: string }> => {
    try {
      if (!fs.existsSync(gifPath)) {
        return { success: false, error: 'GIF file not found' }
      }

      // Get first media directory
      const mediaDirs = getMediaDirs()
      if (mediaDirs.length === 0) {
        return { success: false, error: 'No media directories configured' }
      }

      // Copy to first media directory with unique name
      const filename = path.basename(gifPath)
      const destPath = path.join(mediaDirs[0], filename)
      fs.copyFileSync(gifPath, destPath)

      // Trigger rescan to add to library
      broadcast('vault:changed')

      return { success: true }
    } catch (err: any) {
      console.error('[IPC] media:addGifToLibrary error:', err?.message)
      return { success: false, error: err?.message }
    }
  })

  // Rename GIF file
  ipcMain.handle('media:renameGif', async (_ev, gifPath: string, newName: string): Promise<{ success: boolean; newPath?: string; error?: string }> => {
    try {
      if (!fs.existsSync(gifPath)) {
        return { success: false, error: 'GIF file not found' }
      }

      // Sanitize the new name
      const sanitizedName = newName.replace(/[<>:"/\\|?*]/g, '_').trim()
      if (!sanitizedName) {
        return { success: false, error: 'Invalid filename' }
      }

      // Ensure it ends with .gif
      const finalName = sanitizedName.endsWith('.gif') ? sanitizedName : `${sanitizedName}.gif`

      // Build new path
      const dir = path.dirname(gifPath)
      const newPath = path.join(dir, finalName)

      // Check if target already exists
      if (fs.existsSync(newPath) && newPath !== gifPath) {
        return { success: false, error: 'A file with that name already exists' }
      }

      // Rename the file
      fs.renameSync(gifPath, newPath)

      return { success: true, newPath }
    } catch (err: any) {
      console.error('[IPC] media:renameGif error:', err?.message)
      return { success: false, error: err?.message }
    }
  })

  // Trim video - cut a segment without re-encoding
  ipcMain.handle('media:trimVideo', async (_ev, options: {
    mediaId: string
    startTime: number
    endTime: number
    outputName?: string
  }): Promise<{ success: boolean; outputPath?: string; error?: string }> => {
    try {
      const { mediaId, startTime, endTime, outputName } = options

      // Get media from database
      const media = db.getMedia(mediaId)
      if (!media) {
        return { success: false, error: 'Media not found' }
      }

      if (media.type !== 'video') {
        return { success: false, error: 'Can only trim video files' }
      }

      // Validate time range
      const duration = endTime - startTime
      if (duration <= 0) {
        return { success: false, error: 'End time must be after start time' }
      }

      // Create output path in cache directory
      const cacheDir = getCacheDir()
      const trimDir = path.join(cacheDir, 'trims')
      if (!fs.existsSync(trimDir)) {
        fs.mkdirSync(trimDir, { recursive: true })
      }

      const ext = path.extname(media.path)
      const baseName = outputName || `${path.basename(media.path, ext)}_trimmed_${startTime.toFixed(1)}-${endTime.toFixed(1)}`
      const outputPath = path.join(trimDir, `${baseName}${ext}`)

      console.log(`[Trim] Trimming ${media.filename}: ${startTime}s to ${endTime}s`)

      // Use FFmpeg with copy codec for fast trimming without re-encoding
      return new Promise((resolve) => {
        ffmpeg(media.path)
          .setStartTime(startTime)
          .setDuration(duration)
          .outputOptions([
            '-c', 'copy',  // Copy codec - no re-encoding
            '-avoid_negative_ts', 'make_zero'
          ])
          .output(outputPath)
          .on('error', (err) => {
            console.error('[Trim] Error:', err.message)
            // Fallback: try with re-encoding if copy fails
            ffmpeg(media.path)
              .setStartTime(startTime)
              .setDuration(duration)
              .outputOptions([
                '-c:v', 'libx264',
                '-c:a', 'aac',
                '-preset', 'fast'
              ])
              .output(outputPath)
              .on('error', (err2) => {
                console.error('[Trim] Re-encode error:', err2.message)
                resolve({ success: false, error: err2.message })
              })
              .on('end', () => {
                console.log('[Trim] Complete (re-encoded):', outputPath)
                resolve({ success: true, outputPath })
              })
              .run()
          })
          .on('end', () => {
            console.log('[Trim] Complete:', outputPath)
            resolve({ success: true, outputPath })
          })
          .run()
      })
    } catch (err: any) {
      console.error('[IPC] media:trimVideo error:', err?.message)
      return { success: false, error: err?.message }
    }
  })

  // Save trimmed video to user-selected location
  ipcMain.handle('media:saveTrimmedVideo', async (_ev, trimmedPath: string): Promise<{ success: boolean; savedPath?: string; error?: string }> => {
    try {
      if (!fs.existsSync(trimmedPath)) {
        return { success: false, error: 'Trimmed video not found' }
      }

      const ext = path.extname(trimmedPath)
      const result = await dialog.showSaveDialog({
        title: 'Save Trimmed Video',
        defaultPath: path.basename(trimmedPath),
        filters: [{ name: 'Video', extensions: [ext.slice(1)] }]
      })

      if (result.canceled || !result.filePath) {
        return { success: false, error: 'Save cancelled' }
      }

      fs.copyFileSync(trimmedPath, result.filePath)
      return { success: true, savedPath: result.filePath }
    } catch (err: any) {
      console.error('[IPC] media:saveTrimmedVideo error:', err?.message)
      return { success: false, error: err?.message }
    }
  })

  // Add trimmed video to library
  ipcMain.handle('media:addTrimmedToLibrary', async (_ev, trimmedPath: string): Promise<{ success: boolean; mediaId?: string; error?: string }> => {
    try {
      if (!fs.existsSync(trimmedPath)) {
        return { success: false, error: 'Trimmed video not found' }
      }

      const mediaDirs = getMediaDirs()
      if (mediaDirs.length === 0) {
        return { success: false, error: 'No media directories configured' }
      }

      const filename = path.basename(trimmedPath)
      const destPath = path.join(mediaDirs[0], filename)
      fs.copyFileSync(trimmedPath, destPath)

      // Import to library using upsertMedia
      const stats = fs.statSync(destPath)
      const ext = path.extname(destPath).toLowerCase()
      const type = ['.mp4', '.mkv', '.avi', '.mov', '.wmv', '.webm', '.m4v', '.flv', '.ts'].includes(ext) ? 'video' : ext === '.gif' ? 'gif' : 'image'

      const imported = db.upsertMedia({
        path: destPath,
        filename,
        type: type as any,
        ext,
        size: stats.size,
        mtimeMs: stats.mtimeMs,
        durationSec: null,
        width: null,
        height: null,
        thumbPath: null,
        hashSha256: null,
        phash: null
      })

      if (imported?.id) {
        broadcast('vault:changed')
        return { success: true, mediaId: imported.id }
      }

      return { success: false, error: 'Failed to import to library' }
    } catch (err: any) {
      console.error('[IPC] media:addTrimmedToLibrary error:', err?.message)
      return { success: false, error: err?.message }
    }
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // TAGS
  // ═══════════════════════════════════════════════════════════════════════════
  ipcMain.handle('tags:list', async () => {
    return db.listTags()
  })

  // Get tags with media counts for filtering/suggestions
  ipcMain.handle('tags:listWithCounts', async () => {
    const result = db.raw.prepare(`
      SELECT t.id, t.name, COUNT(DISTINCT mt.mediaId) as count
      FROM tags t
      LEFT JOIN media_tags mt ON mt.tagId = t.id
      GROUP BY t.id, t.name
      ORDER BY count DESC, t.name ASC
    `).all() as Array<{ id: string; name: string; count: number }>
    return result
  })

  ipcMain.handle('tags:forMedia', async (_ev, mediaId: string) => {
    return db.listMediaTags(mediaId)
  })

  ipcMain.handle('tags:listForMedia', async (_ev, mediaId: string) => {
    return db.listMediaTags(mediaId)
  })

  ipcMain.handle('tags:setForMedia', async (_ev, mediaId: string, tagNames: string[]) => {
    const existing = db.listMediaTags(mediaId)
    for (const t of existing) {
      db.removeTagFromMedia(mediaId, t.name)
    }
    for (const name of tagNames) {
      db.addTagToMedia(mediaId, name)
    }
    broadcast('vault:changed')
    return db.listMediaTags(mediaId)
  })

  ipcMain.handle('tags:addToMedia', async (_ev, mediaId: string, tagName: string) => {
    // #102 — canonicalize through the user's tag-siblings (aliases)
    // graph FIRST so writes always land on the canonical form. If the
    // user adds "big_titties", and that's an alias for "big_breasts",
    // the row stores big_breasts. Idempotent when no alias edge exists.
    let effectiveTag = tagName
    try {
      const { canonicalize } = await import('./services/tag-siblings')
      effectiveTag = canonicalize(tagName)
    } catch (err) {
      console.warn('[tags:addToMedia] sibling canonicalize failed:', err)
    }
    db.addTagToMedia(mediaId, effectiveTag)
    // #103 — walk the user's tag-implications graph and add every
    // ancestor tag too. Cycle-safe via the service's visited set.
    // Best-effort: per-ancestor failures are swallowed so a broken
    // implication doesn't block the primary tag write.
    try {
      const { expandImplications } = await import('./services/tag-implications')
      for (const parent of expandImplications(effectiveTag)) {
        try { db.addTagToMedia(mediaId, parent) } catch { /* skip dup / invalid */ }
      }
    } catch (err) {
      console.warn('[tags:addToMedia] implication expansion failed:', err)
    }
    recordTagAssigned()  // Track for achievements
    checkAchievements()  // Check 'tagged' achievement
    broadcast('vault:changed')
    return db.listMediaTags(mediaId)
  })

  // #133 — Content-warning seed pack. Merges a curated set of
  // cw:* implication edges (blood → cw:violence, vomit → cw:disgust,
  // etc.) into the user's tag-implications.json. Non-destructive:
  // existing edges are preserved, new edges are added.
  ipcMain.handle('tags:loadDefaultCwImplications', async () => {
    try {
      const { getImplications, saveImplications } = await import('./services/tag-implications')
      const current = getImplications()
      const defaults: Record<string, string[]> = {
        // Violence + injury
        blood: ['cw:violence', 'cw:gore'],
        gore: ['cw:violence', 'cw:gore'],
        injury: ['cw:violence'],
        violence: ['cw:violence'],
        weapons: ['cw:weapons'],
        gun: ['cw:weapons'],
        knife: ['cw:weapons'],
        // Bodily fluids
        vomit: ['cw:bodily_fluids', 'cw:disgust'],
        feces: ['cw:bodily_fluids', 'cw:disgust'],
        urine: ['cw:bodily_fluids'],
        // Restraint without explicit consent context — user can add
        // 'consensual' to override per-video by NOT applying cw:
        bondage: ['cw:restraint'],
        gag: ['cw:restraint'],
        chains: ['cw:restraint'],
        rope: ['cw:restraint'],
        // Distress / non-consensual implications
        crying: ['cw:distress'],
        unconscious: ['cw:distress', 'cw:incapacitated'],
        // Animals — most users want a heads-up
        zoophilia: ['cw:animals'],
        bestiality: ['cw:animals'],
      }
      const merged = { ...current }
      let added = 0
      for (const [child, parents] of Object.entries(defaults)) {
        const existing = new Set((merged[child] ?? []).map(s => s.toLowerCase()))
        const next = [...(merged[child] ?? [])]
        for (const p of parents) {
          if (!existing.has(p.toLowerCase())) {
            next.push(p); existing.add(p.toLowerCase()); added++
          }
        }
        merged[child] = next
      }
      const r = saveImplications(merged)
      return { ok: r.ok, added, error: r.error }
    } catch (err: any) {
      return { ok: false, added: 0, error: err?.message ?? String(err) }
    }
  })

  // #102 — IPCs to read/write the tag-siblings JSON.
  ipcMain.handle('tags:siblingsGet', async () => {
    const { getSiblings } = await import('./services/tag-siblings')
    return getSiblings()
  })
  ipcMain.handle('tags:siblingsSave', async (_ev, map: Record<string, string[]>) => {
    const { saveSiblings } = await import('./services/tag-siblings')
    return saveSiblings(map)
  })

  // #103 — IPCs to read/write the tag-implications JSON. Settings UI
  // surfaces the editor; tag pickers can highlight implied parents.
  ipcMain.handle('tags:implicationsGet', async () => {
    const { getImplications } = await import('./services/tag-implications')
    return getImplications()
  })

  ipcMain.handle('tags:implicationsSave', async (_ev, map: Record<string, string[]>) => {
    const { saveImplications } = await import('./services/tag-implications')
    return saveImplications(map)
  })

  ipcMain.handle('tags:removeFromMedia', async (_ev, mediaId: string, tagName: string) => {
    db.removeTagFromMedia(mediaId, tagName)
    broadcast('vault:changed')
    return db.listMediaTags(mediaId)
  })

  ipcMain.handle('tags:ensure', async (_ev, tagName: string) => {
    db.addTagToMedia('__noop__', tagName)
    db.removeTagFromMedia('__noop__', tagName)
    return db.listTags()
  })

  ipcMain.handle('tags:create', async (_ev, tagName: string) => {
    db.addTagToMedia('__noop__', tagName)
    db.removeTagFromMedia('__noop__', tagName)
    return db.listTags()
  })

  ipcMain.handle('tags:delete', async (_ev, tagName: string) => {
    const media = db.listMedia({ q: '', type: '', tag: tagName, limit: 10000, offset: 0 })
    for (const m of media.items) {
      db.removeTagFromMedia(m.id, tagName)
    }
    broadcast('vault:changed')
    return db.listTags()
  })

  // Preview a tag merge — counts how many media items have the source
  // tag, how many have the target, and how many have both. Lets the
  // UI show "Will move N items (M overlap, dropped as duplicates)"
  // before the user clicks the irreversible Merge button.
  ipcMain.handle('tags:merge-preview', async (_ev, args: { source: string; target: string }) => {
    const source = (args?.source ?? '').trim()
    const target = (args?.target ?? '').trim()
    if (!source) return { ok: false as const, error: 'Source tag is required' }
    const tags = db.listTags() as Array<{ id: string; name: string }>
    const srcTag = tags.find((t) => t.name.toLowerCase() === source.toLowerCase())
    if (!srcTag) return { ok: false as const, error: `Source tag "${source}" not found` }
    const tgtTag = target
      ? tags.find((t) => t.name.toLowerCase() === target.toLowerCase()) ?? null
      : null
    const srcCount = (db.raw.prepare(
      `SELECT COUNT(*) AS n FROM media_tags WHERE tagId = ?`
    ).get(srcTag.id) as { n: number }).n
    let tgtCount = 0
    let overlap = 0
    if (tgtTag) {
      tgtCount = (db.raw.prepare(
        `SELECT COUNT(*) AS n FROM media_tags WHERE tagId = ?`
      ).get(tgtTag.id) as { n: number }).n
      overlap = (db.raw.prepare(`
        SELECT COUNT(*) AS n FROM media_tags a
        JOIN media_tags b ON a.mediaId = b.mediaId
        WHERE a.tagId = ? AND b.tagId = ?
      `).get(srcTag.id, tgtTag.id) as { n: number }).n
    }
    return {
      ok: true as const,
      sourceCount: srcCount,
      targetCount: tgtCount,
      overlap,
      // Items that will be newly linked to target (source-only, not already
      // tagged with target). The overlap entries collapse to a single link.
      moved: srcCount - overlap,
      targetExists: !!tgtTag,
    }
  })

  // Two-level taxonomy lookup — for the Library sidebar's category
  // group. Returns every category from tag-categories.ts annotated
  // with which tag names currently exist in the user's tag table and
  // their media counts.
  ipcMain.handle('tags:categories-with-counts', async () => {
    const { CATEGORY_META, categoryOf } = await import('./services/ai-intelligence/tag-categories')
    // Pull all tags with media counts via listWithCounts.
    const allTags = (db as any).listTagsWithCounts?.() as Array<{ name: string; mediaCount: number }> ?? []
    const byCategory = new Map<string, Array<{ name: string; count: number }>>()
    for (const cat of CATEGORY_META) {
      byCategory.set(cat.key, [])
    }
    for (const tag of allTags) {
      const cat = categoryOf(tag.name) || 'other'
      const bucket = byCategory.get(cat) ?? byCategory.get('other')!
      bucket.push({ name: tag.name, count: tag.mediaCount })
    }
    // Sort each bucket by count desc.
    for (const bucket of byCategory.values()) {
      bucket.sort((a, b) => b.count - a.count)
    }
    return CATEGORY_META.map((cat) => ({
      id: cat.key,
      label: cat.label,
      color: cat.color,
      description: cat.description,
      tags: byCategory.get(cat.key) ?? [],
      totalMedia: (byCategory.get(cat.key) ?? []).reduce((s, t) => s + t.count, 0),
    }))
  })

  // Stash interop — read .stash.json sidecars next to media files
  // and apply their tags / performers / studio to Vault. Scans every
  // media item; sidecars that aren't present are silently skipped.
  ipcMain.handle('stash:import-sidecars', async () => {
    const { importStashSidecar } = await import('./services/stash-interop')
    const allMedia = db.listMedia({ q: '', type: '', tag: '', limit: 100000, offset: 0 })
    let scanned = 0
    let matched = 0
    let totalTags = 0
    let totalPerformerTags = 0
    let titleSets = 0
    let descSets = 0
    let studioSets = 0
    for (const m of allMedia.items) {
      scanned++
      const result = importStashSidecar(db, m.id, m.path)
      if (result) {
        matched++
        totalTags += result.importedTags
        totalPerformerTags += result.importedPerformerTags
        if (result.setTitle) titleSets++
        if (result.setDescription) descSets++
        if (result.setStudio) studioSets++
      }
    }
    broadcast('vault:changed')
    return {
      ok: true, scanned, matched,
      tagsImported: totalTags, performersImported: totalPerformerTags,
      titlesSet: titleSets, descriptionsSet: descSets, studiosSet: studioSets,
    }
  })

  // NFO sidecar export — Kodi/Jellyfin/Emby compatibility. Writes
  // <basename>.nfo alongside each media file. tinyMediaManager-style
  // XML, accepted by all three players. Lets the user open the same
  // library in any of them without re-scraping.
  ipcMain.handle('nfo:export-one', async (_ev, mediaId: string) => {
    const { exportNfoSidecar } = await import('./services/nfo-export')
    return exportNfoSidecar(db, mediaId)
  })
  ipcMain.handle('nfo:export-all', async () => {
    const { exportAllNfoSidecars } = await import('./services/nfo-export')
    return exportAllNfoSidecars(db)
  })

  // XMP sidecar export — darktable / Lightroom / Immich. Writes
  // <path>.xmp with dc:subject + lr:hierarchicalSubject + digiKam:TagsList.
  ipcMain.handle('xmp:export-one', async (_ev, mediaId: string) => {
    const { exportXmpSidecar } = await import('./services/xmp-export')
    return exportXmpSidecar(db, mediaId)
  })
  ipcMain.handle('xmp:export-all', async () => {
    const { exportAllXmpSidecars } = await import('./services/xmp-export')
    return exportAllXmpSidecars(db)
  })

  // #331 — Open a MessagePort-bus channel for low-latency comms.
  ipcMain.handle('mpb:open', async (ev, channel: string) => {
    const { openChannel } = await import('./services/message-port-bus')
    openChannel(ev.sender, channel as any)
    return { ok: true }
  })

  // #227 / #255 — RIFE AI frame interpolation export.
  ipcMain.handle('rife:interpolate', async (_ev, srcPath: string, options: any) => {
    const { interpolate } = await import('./services/rife-interpolator')
    const s = getSettings()
    const ffmpegPath = (s as any).ffmpegPath ?? 'ffmpeg'
    return interpolate(srcPath, { ...options, ffmpegPath })
  })

  // #377 — Local video diffusion bridge (WAN / Hunyuan / CogVideoX).
  ipcMain.handle('videoDiff:setEndpoint', async (_ev, url: string) => {
    const { setEndpoint } = await import('./services/video-diffusion-bridge')
    setEndpoint(url); return { ok: true }
  })
  ipcMain.handle('videoDiff:probe', async () => {
    const { probe } = await import('./services/video-diffusion-bridge')
    return probe()
  })
  ipcMain.handle('videoDiff:generate', async (ev, req: any, importDir: string) => {
    const { generateAndImport } = await import('./services/video-diffusion-bridge')
    return generateAndImport(req, importDir, db, (p) => ev.sender.send('videoDiff:progress', { progress: p }))
  })

  // #375 — Arduino serial DIY-toy bridge.
  ipcMain.handle('arduinoToy:listPorts', async () => {
    const { listPorts } = await import('./services/arduino-toy-bridge')
    return listPorts()
  })
  ipcMain.handle('arduinoToy:open', async (_ev, path: string, baudRate?: number) => {
    const { openBridge } = await import('./services/arduino-toy-bridge')
    return openBridge(path, baudRate)
  })
  ipcMain.handle('arduinoToy:setIntensity', async (_ev, level: number) => {
    const { setIntensity } = await import('./services/arduino-toy-bridge')
    return setIntensity(level)
  })
  ipcMain.handle('arduinoToy:playPattern', async (_ev, pattern: Array<[number, number]>) => {
    const { playPattern } = await import('./services/arduino-toy-bridge')
    return playPattern(pattern)
  })
  ipcMain.handle('arduinoToy:stop', async () => {
    const { stop } = await import('./services/arduino-toy-bridge')
    return stop()
  })
  ipcMain.handle('arduinoToy:close', async () => {
    const { closeBridge } = await import('./services/arduino-toy-bridge')
    await closeBridge(); return { ok: true }
  })
  ipcMain.handle('arduinoToy:status', async () => {
    const { status } = await import('./services/arduino-toy-bridge')
    return status()
  })

  // #268 — Veilid private-routing bridge.
  ipcMain.handle('veilid:setEndpoint', async (_ev, url: string) => {
    const { setEndpoint } = await import('./services/veilid-bridge')
    setEndpoint(url); return { ok: true }
  })
  ipcMain.handle('veilid:status', async () => {
    const { status } = await import('./services/veilid-bridge')
    return status()
  })
  ipcMain.handle('veilid:newPrivateRoute', async () => {
    const { newPrivateRoute } = await import('./services/veilid-bridge')
    return newPrivateRoute()
  })
  ipcMain.handle('veilid:send', async (_ev, routeId: string, payloadB64: string) => {
    const { send } = await import('./services/veilid-bridge')
    return send(routeId, payloadB64)
  })

  // #273 — Bluesky labeler service.
  ipcMain.handle('bskyLabeler:start', async (_ev, port?: number) => {
    const { start } = await import('./services/bluesky-labeler')
    return start(db, port)
  })
  ipcMain.handle('bskyLabeler:stop', async () => {
    const { stop } = await import('./services/bluesky-labeler')
    stop(); return { ok: true }
  })
  ipcMain.handle('bskyLabeler:list', async (_ev, uri?: string) => {
    const { listLabels } = await import('./services/bluesky-labeler')
    return listLabels(db, uri)
  })

  // #282 — Nostr NIP-46 remote signer.
  ipcMain.handle('nostr:loadConfig', async () => {
    const { loadConfig } = await import('./services/nostr-remote-signer')
    const c = loadConfig()
    return c ? { pubkeyHex: c.pubkeyHex, defaultRelay: c.defaultRelay, trustedClients: c.trustedClients } : null
  })
  ipcMain.handle('nostr:generateKeypair', async (_ev, defaultRelay?: string) => {
    const { generateKeypair } = await import('./services/nostr-remote-signer')
    const c = await generateKeypair(defaultRelay)
    return { pubkeyHex: c.pubkeyHex, defaultRelay: c.defaultRelay }
  })
  ipcMain.handle('nostr:bunkerUri', async () => {
    const { buildBunkerUri } = await import('./services/nostr-remote-signer')
    return buildBunkerUri()
  })
  ipcMain.handle('nostr:trust', async (_ev, clientPubkeyHex: string) => {
    const { trustClient } = await import('./services/nostr-remote-signer')
    trustClient(clientPubkeyHex); return { ok: true }
  })
  ipcMain.handle('nostr:revoke', async (_ev, clientPubkeyHex: string) => {
    const { revokeClient } = await import('./services/nostr-remote-signer')
    revokeClient(clientPubkeyHex); return { ok: true }
  })

  // #283 — Tor onion service.
  ipcMain.handle('tor:start', async (_ev, torBinaryPath: string, httpPort: number) => {
    const { start } = await import('./services/tor-onion')
    return start(torBinaryPath, httpPort)
  })
  ipcMain.handle('tor:stop', async () => {
    const { stop } = await import('./services/tor-onion')
    stop(); return { ok: true }
  })
  ipcMain.handle('tor:status', async () => {
    const { status } = await import('./services/tor-onion')
    return status()
  })

  // #276 — WebTransport HTTP/3 server.
  ipcMain.handle('wt:start', async (_ev, port: number, bearerToken: string) => {
    const { startServer } = await import('./services/webtransport-server')
    return startServer(db, port, bearerToken)
  })
  ipcMain.handle('wt:stop', async () => {
    const { stopServer } = await import('./services/webtransport-server')
    await stopServer(); return { ok: true }
  })
  ipcMain.handle('wt:status', async () => {
    const { status } = await import('./services/webtransport-server')
    return status()
  })

  // #265 — Iroh blob ticket sharing.
  ipcMain.handle('iroh:share', async (_ev, absPath: string) => {
    const { shareFile } = await import('./services/iroh-share')
    return shareFile(absPath)
  })
  ipcMain.handle('iroh:download', async (_ev, ticket: string, dstPath: string) => {
    const { downloadByTicket } = await import('./services/iroh-share')
    return downloadByTicket(ticket, dstPath)
  })

  // #266 — Hyperswarm DHT trusted-device mesh.
  ipcMain.handle('mesh:loadState', async () => {
    const { loadState, generateTopic } = await import('./services/hyperswarm-mesh')
    const existing = loadState()
    return existing ?? { topic: generateTopic(), deviceName: '', trustedFingerprints: [] }
  })
  ipcMain.handle('mesh:saveState', async (_ev, state: any) => {
    const { saveState } = await import('./services/hyperswarm-mesh')
    saveState(state); return { ok: true }
  })
  ipcMain.handle('mesh:start', async (_ev, state: any) => {
    const { startMesh } = await import('./services/hyperswarm-mesh')
    return startMesh(state)
  })
  ipcMain.handle('mesh:stop', async () => {
    const { stopMesh } = await import('./services/hyperswarm-mesh')
    await stopMesh(); return { ok: true }
  })
  ipcMain.handle('mesh:peers', async () => {
    const { listPeers } = await import('./services/hyperswarm-mesh')
    return listPeers()
  })

  // #267 — Helia (IPFS) pinning.
  ipcMain.handle('helia:pin', async (_ev, absPath: string) => {
    const { pinFile } = await import('./services/helia-pin')
    return pinFile(absPath)
  })
  ipcMain.handle('helia:unpin', async (_ev, cid: string) => {
    const { unpinCid } = await import('./services/helia-pin')
    return unpinCid(cid)
  })
  ipcMain.handle('helia:list', async () => {
    const { listPins } = await import('./services/helia-pin')
    return listPins()
  })

  // #269 — Syncthing REST control plane.
  ipcMain.handle('syncthing:loadConfig', async () => {
    const { loadConfig } = await import('./services/syncthing-client')
    const c = loadConfig()
    if (!c) return null
    return { baseUrl: c.baseUrl, hasKey: !!c.apiKeyEnc }
  })
  ipcMain.handle('syncthing:saveConfig', async (_ev, baseUrl: string, apiKey?: string) => {
    const { saveConfig } = await import('./services/syncthing-client')
    saveConfig(baseUrl, apiKey); return { ok: true }
  })
  ipcMain.handle('syncthing:call', async (_ev, op: string, ...args: any[]) => {
    const { syncthing } = await import('./services/syncthing-client')
    const fn = (syncthing as any)[op]
    if (typeof fn !== 'function') return { ok: false, status: 0, error: `unknown op ${op}` }
    return fn(...args)
  })

  // #275 — UnifiedPush distributor.
  ipcMain.handle('up:register', async (_ev, endpoint: any) => {
    const { register } = await import('./services/unifiedpush-distributor')
    register(endpoint); return { ok: true }
  })
  ipcMain.handle('up:unregister', async (_ev, appId: string) => {
    const { unregister } = await import('./services/unifiedpush-distributor')
    unregister(appId); return { ok: true }
  })
  ipcMain.handle('up:list', async () => {
    const { loadEndpoints } = await import('./services/unifiedpush-distributor')
    return loadEndpoints()
  })
  ipcMain.handle('up:notify', async (_ev, appId: string, payload: string) => {
    const { notify } = await import('./services/unifiedpush-distributor')
    return notify(appId, payload)
  })
  ipcMain.handle('up:broadcast', async (_ev, payload: string) => {
    const { broadcast } = await import('./services/unifiedpush-distributor')
    return broadcast(payload)
  })

  // #277 — WebRTC signaling bridge (transport is in renderer).
  ipcMain.handle('webrtc:newSession', async () => {
    const { newSessionId } = await import('./services/webrtc-bridge')
    return newSessionId()
  })
  ipcMain.handle('webrtc:sendSignal', async (_ev, frame: any) => {
    const { sendSignalViaMesh } = await import('./services/webrtc-bridge')
    sendSignalViaMesh(frame); return { ok: true }
  })

  // #313 — IMAP inbox watcher ("email this link").
  ipcMain.handle('imap:loadConfig', async () => {
    const { loadConfig } = await import('./services/imap-watcher')
    const c = loadConfig()
    if (!c) return null
    const { passwordEnc, ...safe } = c
    return { ...safe, hasPassword: !!passwordEnc }
  })
  ipcMain.handle('imap:saveConfig', async (_ev, config: any) => {
    const { saveConfig } = await import('./services/imap-watcher')
    saveConfig(config); return { ok: true }
  })
  ipcMain.handle('imap:start', async () => {
    const { startWatcher } = await import('./services/imap-watcher')
    return startWatcher(db, async (url, _source) => {
      try {
        await getUrlDownloaderService().addDownload(url, {}, 'desktop')
      } catch (err) { console.error('[imap] enqueue failed', err) }
    })
  })
  ipcMain.handle('imap:stop', async () => {
    const { stopWatcher } = await import('./services/imap-watcher')
    await stopWatcher(); return { ok: true }
  })
  ipcMain.handle('imap:status', async () => {
    const { statusWatcher } = await import('./services/imap-watcher')
    return statusWatcher()
  })

  // #297 — Obsidian-style backlinks.
  ipcMain.handle('backlinks:find', async (_ev, mediaId: string, limit?: number) => {
    const { findBacklinks } = await import('./services/backlinks')
    return findBacklinks(db, mediaId, limit)
  })

  // #286 — Color palette index (Eagle-style filter).
  ipcMain.handle('palette:indexOne', async (_ev, mediaId: string) => {
    const { indexPalette } = await import('./services/color-palette')
    return { ok: await indexPalette(db, mediaId) }
  })
  ipcMain.handle('palette:indexAll', async (ev) => {
    const { indexAllPalettes } = await import('./services/color-palette')
    return indexAllPalettes(db, (done, total) => ev.sender.send('palette:progress', { done, total }))
  })
  ipcMain.handle('palette:filter', async (_ev, rgb: [number, number, number], tolerance?: number, limit?: number) => {
    const { filterByColor } = await import('./services/color-palette')
    return filterByColor(db, rgb, tolerance, limit)
  })
  ipcMain.handle('palette:get', async (_ev, mediaId: string) => {
    const { getPalette } = await import('./services/color-palette')
    return getPalette(db, mediaId)
  })

  // #322 — Export pipeline + rclone push.
  ipcMain.handle('exportPipeline:list', async () => {
    const { listRecipes } = await import('./services/export-pipeline')
    return listRecipes()
  })
  ipcMain.handle('exportPipeline:save', async (_ev, recipe: any) => {
    const { saveRecipe } = await import('./services/export-pipeline')
    saveRecipe(recipe); return { ok: true }
  })
  ipcMain.handle('exportPipeline:delete', async (_ev, name: string) => {
    const { deleteRecipe } = await import('./services/export-pipeline')
    deleteRecipe(name); return { ok: true }
  })
  ipcMain.handle('exportPipeline:run', async (ev, recipe: any) => {
    const { runPipeline } = await import('./services/export-pipeline')
    const s = getSettings()
    const ffmpegPath = (s as any).ffmpegPath ?? 'ffmpeg'
    const run = runPipeline(db, recipe, ffmpegPath)
    run.events.on('start', (p) => ev.sender.send('exportPipeline:event', { kind: 'start', ...p }))
    run.events.on('item-start', (p) => ev.sender.send('exportPipeline:event', { kind: 'item-start', ...p }))
    run.events.on('item-done', (p) => ev.sender.send('exportPipeline:event', { kind: 'item-done', ...p }))
    run.events.on('staging-done', (p) => ev.sender.send('exportPipeline:event', { kind: 'staging-done', ...p }))
    run.events.on('push-start', (p) => ev.sender.send('exportPipeline:event', { kind: 'push-start', ...p }))
    run.events.on('push-done', (p) => ev.sender.send('exportPipeline:event', { kind: 'push-done', ...p }))
    run.events.on('push-skipped', (p) => ev.sender.send('exportPipeline:event', { kind: 'push-skipped', ...p }))
    run.events.on('complete', (p) => ev.sender.send('exportPipeline:event', { kind: 'complete', ...p }))
    const results = await run.promise
    // Cohesion glue: pipeline may have produced sidecars (NFO, JSON,
    // stash.json) and tag mutations as part of the recipe. Broadcast
    // so LibraryPage + FeedPage + GoonWallPage refresh their grids.
    // SidecarWatcher (#323) also picks up any newly-written sidecars
    // independently — vault:changed just nudges the UI to redraw.
    broadcast('vault:changed')
    return { ok: true, results }
  })

  // #323 — Sidecar-aware metadata watcher (.xmp / .nfo / .stash.json).
  ipcMain.handle('sidecarWatcher:start', async (_ev, roots: string[]) => {
    const { startSidecarWatcher } = await import('./services/sidecar-watcher')
    if ((globalThis as any).__vaultSidecarWatcher) return { ok: true, alreadyRunning: true }
    ;(globalThis as any).__vaultSidecarWatcher = startSidecarWatcher(db, roots)
    return { ok: true }
  })
  ipcMain.handle('sidecarWatcher:stop', async () => {
    const h = (globalThis as any).__vaultSidecarWatcher
    if (!h) return { ok: true, wasRunning: false }
    await h.stop()
    delete (globalThis as any).__vaultSidecarWatcher
    return { ok: true, wasRunning: true }
  })
  ipcMain.handle('sidecarWatcher:status', () => {
    const h = (globalThis as any).__vaultSidecarWatcher
    return { running: !!h, roots: h ? h.listRoots() : [] }
  })
  ipcMain.handle('sidecarWatcher:addRoot', (_ev, root: string) => {
    const h = (globalThis as any).__vaultSidecarWatcher
    if (h) h.addRoot(root); return { ok: !!h }
  })

  // #331 — MessagePort bus open. Renderer calls this with a channel name;
  // we set up a MessageChannelMain pair and ship port2 to the renderer
  // via webContents.postMessage. The renderer's preload picks up the
  // port via ipcRenderer.on('mpb:<channel>', e => e.ports[0]).
  ipcMain.handle('messagePort:open', async (ev, channel: 'scrub-thumbs' | 'haptic' | 'audio-meter') => {
    const { openChannel } = await import('./services/message-port-bus')
    openChannel(ev.sender, channel)
    return { ok: true, channel }
  })

  // #243 / #309 — Full EXIF/XMP/IPTC read+write via exiftool-vendored.
  // Complements the schema-aware xmp-export above (which writes only
  // dc:subject + lr:hierarchicalSubject + digiKam:TagsList).
  ipcMain.handle('exif:read', async (_ev, filePath: string) => {
    const { readMetadata } = await import('./services/exif-sidecar')
    try { return { ok: true, tags: await readMetadata(filePath) } }
    catch (err: any) { return { ok: false, error: String(err?.message ?? err) } }
  })
  ipcMain.handle('exif:write', async (_ev, filePath: string, patch: Record<string, any>, options?: { sidecar?: boolean }) => {
    const { writeMetadata } = await import('./services/exif-sidecar')
    return writeMetadata(filePath, patch, options)
  })
  ipcMain.handle('exif:import-sidecar', async (_ev, filePath: string) => {
    const { importFromSidecar } = await import('./services/exif-sidecar')
    return importFromSidecar(filePath)
  })
  ipcMain.handle('exif:export-sidecar', async (_ev, filePath: string) => {
    const { exportToSidecar } = await import('./services/exif-sidecar')
    return exportToSidecar(filePath)
  })

  // Export every Vault media item as a .stash.json sidecar next to the
  // file. Re-runs are idempotent (overwrites existing sidecars).
  ipcMain.handle('stash:export-sidecars', async () => {
    const { exportToStashFormat } = await import('./services/stash-interop')
    const fsMod = await import('node:fs')
    const allMedia = db.listMedia({ q: '', type: '', tag: '', limit: 100000, offset: 0 })
    let written = 0
    let failed = 0
    for (const m of allMedia.items) {
      const scene = exportToStashFormat(db, m.id)
      if (!scene) { failed++; continue }
      const sidecarPath = `${m.path}.stash.json`
      try {
        fsMod.writeFileSync(sidecarPath, JSON.stringify(scene, null, 2), 'utf8')
        written++
      } catch (err) {
        console.warn('[StashInterop] Failed to write', sidecarPath, err)
        failed++
      }
    }
    return { ok: true, written, failed, total: allMedia.items.length }
  })

  // User-directed tag merge — re-link every media_tags row from
  // source → target, then delete the source tag. Used for collapsing
  // duplicates like "blowjob" + "blowjobs", "POV" + "pov", etc. The
  // existing tags:cleanup handles patterned junk; this one is the
  // explicit "I picked these two, merge them" path.
  ipcMain.handle('tags:merge', async (_ev, args: { source: string; target: string }) => {
    const source = (args?.source ?? '').trim()
    const target = (args?.target ?? '').trim()
    if (!source || !target) {
      return { ok: false, error: 'Source and target tag names are required' }
    }
    if (source.toLowerCase() === target.toLowerCase()) {
      return { ok: false, error: 'Source and target are the same tag' }
    }
    // Look up both tag IDs. Target is auto-created if missing so the
    // user can normalize toward a canonical name that doesn't yet exist.
    const tags = db.listTags() as Array<{ id: string; name: string }>
    const srcTag = tags.find((t) => t.name.toLowerCase() === source.toLowerCase())
    if (!srcTag) {
      return { ok: false, error: `Source tag "${source}" not found` }
    }
    let tgtTag = tags.find((t) => t.name.toLowerCase() === target.toLowerCase())
    if (!tgtTag) {
      // Create target tag by attaching+removing it from a sentinel id
      // (matches the tags:create pattern above).
      db.addTagToMedia('__noop__', target)
      db.removeTagFromMedia('__noop__', target)
      const refreshed = db.listTags() as Array<{ id: string; name: string }>
      tgtTag = refreshed.find((t) => t.name.toLowerCase() === target.toLowerCase())
      if (!tgtTag) {
        return { ok: false, error: 'Failed to create target tag' }
      }
    }
    // Re-link in two steps to honor the (mediaId, tagId) primary key:
    //   1. INSERT OR IGNORE — adds target to every media that had source
    //   2. DELETE source links
    // Net effect: every media that had source now has target, items that
    // already had both keep only target, source is empty.
    const txn = db.raw.transaction(() => {
      const linked = db.raw.prepare(`
        INSERT OR IGNORE INTO media_tags (mediaId, tagId)
        SELECT mediaId, ? FROM media_tags WHERE tagId = ?
      `).run(tgtTag!.id, srcTag.id)
      const removed = db.raw.prepare(`DELETE FROM media_tags WHERE tagId = ?`).run(srcTag.id)
      db.raw.prepare(`DELETE FROM tags WHERE id = ?`).run(srcTag.id)
      return { added: linked.changes, removed: removed.changes }
    })
    const stats = txn() as { added: number; removed: number }
    broadcast('vault:changed')
    return {
      ok: true,
      moved: stats.added,
      duplicatesCollapsed: stats.removed - stats.added,
      sourceName: srcTag.name,
      targetName: tgtTag.name,
    }
  })

  // Bulk delete tags matching patterns (for cleanup)
  ipcMain.handle('tags:cleanup', async (_ev, _options?: { patterns?: string[] }) => {
    const allTags = db.listTags()
    const tagger = getSmartTagger()

    const removedTags: string[] = []

    for (const tag of allTags) {
      // Use the improved isValidTag method which checks all patterns
      if (!tagger.isValidTag(tag.name)) {
        // Delete this tag from all media
        const media = db.listMedia({ q: '', type: '', tag: tag.name, limit: 10000, offset: 0 })
        for (const m of media.items) {
          db.removeTagFromMedia(m.id, tag.name)
        }
        removedTags.push(tag.name)
        console.log('[Tags] Removed invalid tag:', tag.name)
      }
    }

    if (removedTags.length > 0) {
      broadcast('vault:changed')
    }

    return {
      success: true,
      removedTags,
      removedCount: removedTags.length,
      remainingTags: db.listTags()
    }
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // PLAYLISTS
  // ═══════════════════════════════════════════════════════════════════════════
  ipcMain.handle('playlists:list', async () => {
    return db.playlistList()
  })

  ipcMain.handle('playlists:create', async (_ev, name: string) => {
    const playlist = db.playlistCreate(name)
    recordPlaylistCreated()  // Track for achievements
    checkAchievements()  // Check 'organized' achievement
    broadcast('vault:changed')
    return playlist
  })

  ipcMain.handle('playlists:rename', async (_ev, id: string, name: string) => {
    db.playlistRename(id, name)
    broadcast('vault:changed')
    return db.playlistList()
  })

  ipcMain.handle('playlists:delete', async (_ev, id: string) => {
    db.playlistDelete(id)
    broadcast('vault:changed')
    return db.playlistList()
  })

  ipcMain.handle('playlists:getItems', async (_ev, playlistId: string) => {
    return db.playlistItems(playlistId)
  })

  ipcMain.handle('playlists:addItems', async (_ev, playlistId: string, mediaIds: string[]) => {
    db.playlistAddItems(playlistId, mediaIds)
    broadcast('vault:changed')
    return db.playlistItems(playlistId)
  })

  ipcMain.handle('playlists:removeItem', async (_ev, playlistId: string, playlistItemId: string) => {
    db.playlistRemoveItem(playlistItemId)
    broadcast('vault:changed')
    return db.playlistItems(playlistId)
  })

  ipcMain.handle('playlists:reorder', async (_ev, playlistId: string, itemIds: string[]) => {
    db.playlistReorder(playlistId, itemIds)
    broadcast('vault:changed')
    return db.playlistItems(playlistId)
  })

  ipcMain.handle('playlists:duplicate', async (_ev, playlistId: string) => {
    const original = db.playlistList().find(p => p.id === playlistId)
    if (!original) return null
    const newPlaylist = db.playlistCreate(`${original.name} (Copy)`)
    const items = db.playlistItems(playlistId)
    const mediaIds = items.map(i => i.media.id)
    if (mediaIds.length > 0) {
      db.playlistAddItems(newPlaylist.id, mediaIds)
    }
    broadcast('vault:changed')
    return newPlaylist
  })

  ipcMain.handle('playlists:exportM3U', async (_ev, playlistId: string) => {
    const playlist = db.playlistList().find(p => p.id === playlistId)
    if (!playlist) return null
    const items = db.playlistItems(playlistId)

    const result = await dialog.showSaveDialog({
      title: 'Export Playlist',
      defaultPath: `${playlist.name}.m3u`,
      filters: [{ name: 'M3U Playlist', extensions: ['m3u'] }]
    })

    if (result.canceled || !result.filePath) return null

    let content = '#EXTM3U\n'
    for (const item of items) {
      // item.media is already populated by playlistItems()
      const media = item.media
      if (media) {
        content += `#EXTINF:-1,${media.filename}\n`
        content += `${media.path}\n`
      }
    }

    fs.writeFileSync(result.filePath, content, 'utf8')
    return result.filePath
  })

  // Export playlist as JSON (includes metadata for sharing/backup)
  ipcMain.handle('playlists:exportJSON', async (_ev, playlistId: string) => {
    const playlist = db.playlistList().find(p => p.id === playlistId)
    if (!playlist) return { success: false, error: 'Playlist not found' }

    const items = db.playlistItems(playlistId)
    const exportData = {
      version: 1,
      exportedAt: Date.now(),
      playlist: {
        name: playlist.name,
        createdAt: playlist.createdAt,
        itemCount: items.length
      },
      items: items.map((item: any) => {
        const media = db.getMedia(item.mediaId)
        return {
          filename: media?.filename || path.basename(item.mediaId),
          path: media?.path,
          type: media?.type,
          durationSec: media?.durationSec
        }
      })
    }

    const result = await dialog.showSaveDialog({
      title: 'Export Playlist',
      defaultPath: `${playlist.name}.vault-playlist.json`,
      filters: [{ name: 'Vault Playlist', extensions: ['json'] }]
    })

    if (result.canceled || !result.filePath) return { success: false }

    fs.writeFileSync(result.filePath, JSON.stringify(exportData, null, 2), 'utf8')
    return { success: true, path: result.filePath }
  })

  // Import playlist from JSON
  ipcMain.handle('playlists:importJSON', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Import Playlist',
      filters: [{ name: 'Vault Playlist', extensions: ['json'] }],
      properties: ['openFile']
    })

    if (result.canceled || !result.filePaths[0]) return { success: false }

    try {
      const content = fs.readFileSync(result.filePaths[0], 'utf8')
      const data = JSON.parse(content)

      if (!data.playlist?.name || !data.items) {
        return { success: false, error: 'Invalid playlist file format' }
      }

      // Create the playlist
      const newPlaylist = db.playlistCreate(data.playlist.name)

      // Try to match items by filename
      const { items: allMedia } = db.listMedia({ sortBy: 'newest', limit: 100000 })
      const matched: string[] = []

      for (const item of data.items) {
        // Try to find media by filename
        const found = allMedia.find((m) =>
          m.filename === item.filename ||
          m.path === item.path ||
          (m.path && item.filename && m.path.endsWith(item.filename))
        )
        if (found) {
          matched.push(found.id)
        }
      }

      // Add matched items to playlist
      if (matched.length > 0) {
        db.playlistAddItems(newPlaylist.id, matched)
      }

      broadcast('vault:changed')
      return {
        success: true,
        playlist: newPlaylist,
        matched: matched.length,
        total: data.items.length
      }
    } catch (err) {
      console.error('[Playlist Import] Failed:', err)
      return { success: false, error: 'Failed to parse playlist file' }
    }
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // SMART PLAYLISTS - Auto-updating playlists based on rules
  // ═══════════════════════════════════════════════════════════════════════════
  ipcMain.handle('smartPlaylists:create', async (_ev, name: string, rules: {
    includeTags?: string[]
    excludeTags?: string[]
    type?: 'video' | 'image' | 'gif' | ''
    minRating?: number
    limit?: number
    sortBy?: 'addedAt' | 'rating' | 'views' | 'random'
    sortDir?: 'asc' | 'desc'
  }) => {
    const playlist = db.smartPlaylistCreate(name, rules)
    recordPlaylistCreated()
    checkAchievements()
    broadcast('vault:changed')
    return playlist
  })

  ipcMain.handle('smartPlaylists:updateRules', async (_ev, playlistId: string, rules: {
    includeTags?: string[]
    excludeTags?: string[]
    type?: 'video' | 'image' | 'gif' | ''
    minRating?: number
    limit?: number
    sortBy?: 'addedAt' | 'rating' | 'views' | 'random'
    sortDir?: 'asc' | 'desc'
  }) => {
    db.smartPlaylistUpdateRules(playlistId, rules)
    broadcast('vault:changed')
    return db.smartPlaylistGetRules(playlistId)
  })

  ipcMain.handle('smartPlaylists:getRules', async (_ev, playlistId: string) => {
    return db.smartPlaylistGetRules(playlistId)
  })

  ipcMain.handle('smartPlaylists:refresh', async (_ev, playlistId: string) => {
    const result = db.smartPlaylistRefresh(playlistId)
    broadcast('vault:changed')
    return result
  })

  ipcMain.handle('smartPlaylists:refreshAll', async () => {
    const result = db.smartPlaylistRefreshAll()
    broadcast('vault:changed')
    return result
  })

  ipcMain.handle('smartPlaylists:list', async () => {
    return db.smartPlaylistList()
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // MARKERS
  // ═══════════════════════════════════════════════════════════════════════════
  ipcMain.handle('markers:listForMedia', async (_ev, mediaId: string) => {
    return db.listMarkers(mediaId)
  })

  ipcMain.handle('markers:list', async (_ev, mediaId: string) => {
    return db.listMarkers(mediaId)
  })

  ipcMain.handle('markers:upsert', async (_ev, marker: any) => {
    if (marker.id) {
      db.updateMarker(marker.id, marker.timeSec, marker.title)
    } else {
      db.addMarker(marker.mediaId, marker.timeSec, marker.title)
    }
    broadcast('vault:changed')
    return db.listMarkers(marker.mediaId)
  })

  ipcMain.handle('markers:delete', async (_ev, markerId: string) => {
    db.deleteMarker(markerId)
    broadcast('vault:changed')
    return true
  })

  ipcMain.handle('markers:clearForMedia', async (_ev, mediaId: string) => {
    const markers = db.listMarkers(mediaId)
    for (const m of markers) {
      db.deleteMarker(m.id)
    }
    broadcast('vault:changed')
    return []
  })


  // ═══════════════════════════════════════════════════════════════════════════
  // THUMBNAILS / FILE URLS
  // ═══════════════════════════════════════════════════════════════════════════
  ipcMain.handle('thumbs:getUrl', async (_ev, absPath: string) => {
    return toVaultUrl(absPath)
  })

  ipcMain.handle('thumbs:getStatus', async () => {
    const jobs = db.listJobs()
    const pending = jobs.filter((j) => j.status === 'queued' && j.type === 'media:analyze').length
    const running = jobs.filter((j) => j.status === 'running' && j.type === 'media:analyze').length
    return { pending, running }
  })

  ipcMain.handle('thumbs:rebuildAll', async () => {
    // Re-enqueue all media for analysis to capture dimensions
    const allMedia = db.listMedia({ limit: 100000, offset: 0 })
    let enqueued = 0
    for (const m of allMedia.items) {
      db.enqueueJob('media:analyze', {
        mediaId: m.id,
        path: m.path,
        type: m.type,
        mtimeMs: m.mtimeMs,
        size: m.size
      }, 0)
      enqueued++
    }
    return { enqueued }
  })

  // Targeted rebuild — only media with NO thumb_path or whose thumb file
  // is missing on disk. Cheap when the library is healthy (re-enqueues
  // few or none), expensive only when there's actual damage. Use case:
  // after a thumb-generation improvement (e.g. the thumbnail-filter
  // fallback) lands, this lets the user retroactively fix old failures
  // without re-processing every healthy thumb.
  ipcMain.handle('thumbs:rebuildMissing', async () => {
    const allMedia = db.listMedia({ limit: 100000, offset: 0 })
    let enqueued = 0
    let alreadyOk = 0
    for (const m of allMedia.items) {
      const path = (m as any).thumbPath as string | null | undefined
      const exists = path && fs.existsSync(path)
      if (exists) { alreadyOk++; continue }
      db.enqueueJob('media:analyze', {
        mediaId: m.id,
        path: m.path,
        type: m.type,
        mtimeMs: m.mtimeMs,
        size: m.size
      }, 0)
      enqueued++
    }
    console.log(`[Thumbs] rebuildMissing: enqueued=${enqueued} alreadyOk=${alreadyOk}`)
    return { enqueued, alreadyOk }
  })

  // Persist a user-chosen custom thumbnail (data URL → disk file → DB).
  // Used by ThumbnailSelector in the Library tool dropdown to swap a
  // generated frame or uploaded image into the media's thumbPath slot.
  ipcMain.handle('thumbs:setCustom', async (_ev, mediaId: string, dataUrl: string) => {
    try {
      const m = db.getMedia(mediaId)
      if (!m) return { ok: false, error: 'media not found' }
      // Data URL: 'data:image/<ext>;base64,<payload>'
      const match = /^data:image\/(jpe?g|png|webp);base64,(.+)$/i.exec(dataUrl)
      if (!match) return { ok: false, error: 'unsupported data URL format' }
      const ext = match[1].toLowerCase().replace('jpeg', 'jpg')
      const payload = match[2]
      const thumbsDir = path.join(app.getPath('userData'), 'thumbs', 'custom')
      try { fs.mkdirSync(thumbsDir, { recursive: true }) } catch { /* ignore */ }
      const dst = path.join(thumbsDir, `${mediaId}.${ext}`)
      fs.writeFileSync(dst, Buffer.from(payload, 'base64'))
      db.raw.prepare(`UPDATE media SET thumbPath = ? WHERE id = ?`).run(dst, mediaId)
      broadcast('vault:changed')
      return { ok: true, thumbPath: dst }
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // FILE SYSTEM HELPERS
  // ═══════════════════════════════════════════════════════════════════════════
  ipcMain.handle('fs:toFileUrl', async (_ev, absPath: string) => {
    return toVaultUrl(absPath)
  })

  ipcMain.handle('fs:exists', async (_ev, absPath: string) => {
    try {
      return fs.existsSync(absPath)
    } catch {
      return false
    }
  })

  ipcMain.handle('fs:readFileBase64', async (_ev, absPath: string) => {
    try {
      const buf = fs.readFileSync(absPath)
      return buf.toString('base64')
    } catch {
      return ''
    }
  })

  // Write a UTF-8 text file at the given absolute path. Used by the
  // subtitle editor in the Library tool dropdown to save .srt sidecars
  // next to the source media.
  ipcMain.handle('fs:writeText', async (_ev, absPath: string, content: string) => {
    try {
      fs.writeFileSync(absPath, content, 'utf8')
      return { ok: true }
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })

  ipcMain.handle('fs:tempDir', async () => {
    const os = await import('node:os')
    return os.tmpdir()
  })

  ipcMain.handle('fs:chooseFile', async (_ev, opts?: { filters?: any[]; title?: string }) => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      title: opts?.title ?? 'Select File',
      filters: opts?.filters
    })
    if (result.canceled || !result.filePaths[0]) return null
    return result.filePaths[0]
  })

  ipcMain.handle('fs:chooseFolder', async (_ev, opts?: { title?: string }) => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory', 'createDirectory'],
      title: opts?.title ?? 'Select Folder'
    })
    if (result.canceled || !result.filePaths[0]) return null
    return result.filePaths[0]
  })

  ipcMain.handle('fs:saveFile', async (_ev, opts?: { defaultPath?: string; filters?: any[]; title?: string }) => {
    const result = await dialog.showSaveDialog({
      title: opts?.title ?? 'Save File',
      defaultPath: opts?.defaultPath,
      filters: opts?.filters
    })
    if (result.canceled || !result.filePath) return null
    return result.filePath
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // PMV EDITOR - Music video compilation tools
  // ═══════════════════════════════════════════════════════════════════════════

  // Auto-PMV: tag-driven generator. Returns a pre-built project the editor can load.
  ipcMain.handle('pmv:autoGenerate', async (_ev, options: {
    tags: string[]
    targetDurationSec?: number
    bpm?: number
    beatsPerClip?: number
    maxClipSources?: number
    generateCaptions?: boolean
    videoActiveWindow?: number
  }) => {
    const { getAutoPmvService } = await import('./services/pmv/auto-pmv-service')
    const { getTier2VisionInstance, getFrameExtractorInstance } = await import('./services/ai-intelligence')
    const tier2 = getTier2VisionInstance()
    const frameExtractor = getFrameExtractorInstance()
    const svc = getAutoPmvService(db)
    return svc.generate(
      options,
      tier2 && tier2.isEnabled() ? tier2 : null,
      frameExtractor
    )
  })

  // #178 — Auto-PMV from one folder + one song. Skips the tag-ranker
  // entirely so the user can drop a folder of clips + a track and get
  // a beat-locked edit back. BPM is detected client-side via
  // bpm-detector and passed in.
  ipcMain.handle('pmv:autoGenerateFromFolder', async (_ev, options: {
    folderPath: string
    bpm: number
    targetDurationSec?: number
    beatsPerClip?: number
    maxClipSources?: number
    generateCaptions?: boolean
    videoActiveWindow?: number
  }) => {
    const { getAutoPmvService } = await import('./services/pmv/auto-pmv-service')
    const { getTier2VisionInstance, getFrameExtractorInstance } = await import('./services/ai-intelligence')
    const tier2 = getTier2VisionInstance()
    const frameExtractor = getFrameExtractorInstance()
    const svc = getAutoPmvService(db)
    return svc.generateFromFolder(
      options,
      tier2 && tier2.isEnabled() ? tier2 : null,
      frameExtractor,
    )
  })

  // Sibling to pmv:selectMusic — folder picker for the #178 flow.
  ipcMain.handle('pmv:selectFolder', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Select folder of clips for PMV',
      properties: ['openDirectory'],
    })
    return result.filePaths[0] || null
  })

  // Select music file for PMV project
  ipcMain.handle('pmv:selectMusic', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Select Music Track',
      filters: [
        { name: 'Audio Files', extensions: ['mp3', 'wav', 'flac', 'm4a', 'ogg', 'aac', 'wma'] }
      ],
      properties: ['openFile']
    })
    return result.filePaths[0] || null
  })

  // Select video files for PMV project (multiple)
  ipcMain.handle('pmv:selectVideos', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Select Videos for PMV',
      filters: [
        { name: 'Video Files', extensions: ['mp4', 'mkv', 'avi', 'mov', 'webm', 'wmv', 'flv', 'm4v'] }
      ],
      properties: ['openFile', 'multiSelections']
    })
    return result.filePaths || []
  })

  // Get video metadata (duration, resolution)
  ipcMain.handle('pmv:getVideoInfo', async (_ev, filePath: string) => {
    try {
      const duration = await probeVideoDurationSec(filePath)
      // Get dimensions using ffprobe
      return new Promise<{ duration: number; width: number; height: number }>((resolve, reject) => {
        ffmpeg.ffprobe(filePath, (err, metadata) => {
          if (err) {
            reject(err)
            return
          }
          const videoStream = metadata.streams.find(s => s.codec_type === 'video')
          resolve({
            duration: duration ?? metadata.format.duration ?? 0,
            width: videoStream?.width ?? 0,
            height: videoStream?.height ?? 0
          })
        })
      })
    } catch (err: any) {
      console.error('[PMV] getVideoInfo failed:', filePath, err?.message)
      return { duration: 0, width: 0, height: 0 }
    }
  })

  // Generate video thumbnail for PMV
  ipcMain.handle('pmv:getVideoThumb', async (_ev, filePath: string) => {
    try {
      const duration = await probeVideoDurationSec(filePath)
      // Generate a temp thumbnail
      const tempDir = app.getPath('temp')
      const thumbName = `pmv-thumb-${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`
      const thumbPath = path.join(tempDir, thumbName)

      return new Promise<string | null>((resolve) => {
        const seekTime = Math.min(duration ? duration * 0.1 : 1, 5) // 10% in or 5s max
        ffmpeg(filePath)
          .seekInput(seekTime)
          .frames(1)
          .outputOptions(['-vf', 'scale=320:-1'])
          .output(thumbPath)
          .on('end', () => resolve(thumbPath))
          .on('error', (err) => {
            console.error('[PMV] getVideoThumb failed:', err?.message)
            resolve(null)
          })
          .run()
      })
    } catch (err: any) {
      console.error('[PMV] getVideoThumb error:', err?.message)
      return null
    }
  })

  // Get audio file info (duration)
  ipcMain.handle('pmv:getAudioInfo', async (_ev, filePath: string) => {
    try {
      return new Promise<{ duration: number }>((resolve, reject) => {
        ffmpeg.ffprobe(filePath, (err, metadata) => {
          if (err) {
            reject(err)
            return
          }
          resolve({
            duration: metadata.format.duration ?? 0
          })
        })
      })
    } catch (err: any) {
      console.error('[PMV] getAudioInfo failed:', filePath, err?.message)
      return { duration: 0 }
    }
  })

  // Extract audio from video file (Audio Burner)
  ipcMain.handle('pmv:extractAudio', async (_ev, videoPath: string) => {
    try {
      const fs = await import('fs')
      const path = await import('path')
      const os = await import('os')

      // Create output path in temp directory
      const tempDir = path.join(os.tmpdir(), 'vault-pmv-audio')
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true })
      }

      const basename = path.basename(videoPath, path.extname(videoPath))
      const outputPath = path.join(tempDir, `${basename}_${Date.now()}.mp3`)

      if (!ffmpegBin || !ffprobeBin) {
        return { success: false, error: 'FFmpeg not found' }
      }

      // Capture after null check for TypeScript
      const ffmpegPath = ffmpegBin
      const ffprobePath = ffprobeBin

      return new Promise<{ success: boolean; path?: string; duration?: number; error?: string }>((resolve, reject) => {
        ffmpeg(videoPath)
          .setFfmpegPath(ffmpegPath)
          .setFfprobePath(ffprobePath)
          .noVideo()
          .audioCodec('libmp3lame')
          .audioBitrate('192k')
          .output(outputPath)
          .on('end', () => {
            // Get audio duration
            ffmpeg.ffprobe(outputPath, (err, metadata) => {
              if (err) {
                resolve({ success: true, path: outputPath, duration: 0 })
                return
              }
              const duration = metadata.format?.duration || 0
              resolve({ success: true, path: outputPath, duration })
            })
          })
          .on('error', (err) => {
            console.error('[PMV] Audio extraction failed:', err.message)
            resolve({ success: false, error: err.message })
          })
          .run()
      })
    } catch (err: any) {
      console.error('[PMV] extractAudio failed:', err?.message)
      return { success: false, error: err?.message || 'Unknown error' }
    }
  })

  // Select video file for audio extraction (single file)
  ipcMain.handle('pmv:selectVideoForAudio', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Select Video to Extract Audio From',
      filters: [
        { name: 'Video Files', extensions: ['mp4', 'webm', 'mkv', 'avi', 'mov', 'wmv', 'flv'] }
      ],
      properties: ['openFile']
    })
    return result.canceled ? null : result.filePaths[0]
  })

  // PMV export progress event
  let pmvExportAbortController: AbortController | null = null

  // Export PMV project to video file
  ipcMain.handle('pmv:export', async (
    _ev,
    projectData: {
      videos: Array<{ id: string; path: string; filename: string; duration: number; width: number; height: number }>
      music: { path: string; filename: string; duration: number }
      clips: Array<{
        id: string
        videoId: string
        videoIndex: number
        startTime: number
        endTime: number
        duration: number
      }>
      effects: {
        transitionType: string
        transitionDuration: number
        videoEffect: string
        effectIntensity: number
        colorGrade: string
      }
      audio: {
        musicVolume: number
        keepOriginalAudio: boolean
        originalAudioVolume: number
        mixMode: 'music' | 'video' | 'mix'
        fadeInDuration: number
        fadeOutDuration: number
      }
      export: {
        format: 'mp4' | 'webm' | 'gif'
        quality: 'draft' | 'standard' | 'high' | '4k'
        destination: 'file' | 'library' | 'playlist'
        filename: string
      }
    }
  ): Promise<{ success: boolean; outputPath?: string; error?: string }> => {
    const { videos, music, clips, effects, audio, export: exportSettings } = projectData

    try {
      console.log('[PMV Export] Starting export:', {
        clipCount: clips.length,
        musicDuration: music.duration,
        format: exportSettings.format,
        quality: exportSettings.quality
      })

      // Create abort controller for cancellation
      pmvExportAbortController = new AbortController()
      const signal = pmvExportAbortController.signal

      // Quality settings
      const qualityPresets: Record<string, { width: number; bitrate: string; audioBitrate: string }> = {
        draft: { width: 720, bitrate: '2M', audioBitrate: '128k' },
        standard: { width: 1080, bitrate: '5M', audioBitrate: '192k' },
        high: { width: 1080, bitrate: '10M', audioBitrate: '320k' },
        '4k': { width: 2160, bitrate: '25M', audioBitrate: '320k' }
      }
      const quality = qualityPresets[exportSettings.quality]

      // Output path
      const tempDir = app.getPath('temp')
      const outputExt = exportSettings.format === 'gif' ? '.gif' : exportSettings.format === 'webm' ? '.webm' : '.mp4'
      const outputFilename = `${exportSettings.filename.replace(/[<>:"/\\|?*]/g, '_')}${outputExt}`
      let outputPath: string

      if (exportSettings.destination === 'file') {
        // Ask user where to save
        const result = await dialog.showSaveDialog({
          title: 'Save PMV',
          defaultPath: outputFilename,
          filters: [
            exportSettings.format === 'gif'
              ? { name: 'GIF', extensions: ['gif'] }
              : exportSettings.format === 'webm'
              ? { name: 'WebM Video', extensions: ['webm'] }
              : { name: 'MP4 Video', extensions: ['mp4'] }
          ]
        })
        if (result.canceled || !result.filePath) {
          return { success: false, error: 'Export cancelled' }
        }
        outputPath = result.filePath
      } else if (exportSettings.destination === 'library') {
        // Save to first media directory
        const mediaDirs = getMediaDirs()
        if (mediaDirs.length === 0) {
          return { success: false, error: 'No media directories configured' }
        }
        outputPath = path.join(mediaDirs[0], outputFilename)
      } else {
        // Temp path for playlist destination - will be copied later
        outputPath = path.join(tempDir, outputFilename)
      }

      // Send initial progress
      broadcast('pmv:exportProgress', { status: 'preparing', progress: 5, currentStep: 'Preparing clips...' })

      // Create clip list file for FFmpeg concat
      const clipListPath = path.join(tempDir, `pmv-clips-${Date.now()}.txt`)
      const clipSegments: string[] = []

      // First, extract each clip segment to temp files
      broadcast('pmv:exportProgress', { status: 'preparing', progress: 10, currentStep: 'Extracting clip segments...' })

      const segmentPaths: string[] = []
      for (let i = 0; i < clips.length; i++) {
        if (signal.aborted) {
          // Cleanup temp files
          segmentPaths.forEach(p => { try { fs.unlinkSync(p) } catch {} })
          return { success: false, error: 'Export cancelled' }
        }

        const clip = clips[i]
        const video = videos[clip.videoIndex]
        const segmentPath = path.join(tempDir, `pmv-segment-${Date.now()}-${i}.ts`)
        segmentPaths.push(segmentPath)

        // Extract segment from source video
        await new Promise<void>((resolve, reject) => {
          ffmpeg(video.path)
            .setStartTime(clip.startTime)
            .setDuration(clip.duration)
            .outputOptions([
              '-c:v', 'libx264',
              '-preset', 'ultrafast',
              '-crf', '18',
              '-an', // No audio for intermediate segments
              '-vf', `scale=${quality.width}:-2:flags=lanczos`,
              '-f', 'mpegts'
            ])
            .output(segmentPath)
            .on('end', () => resolve())
            .on('error', (err) => reject(err))
            .run()
        })

        clipSegments.push(`file '${segmentPath.replace(/\\/g, '/')}'`)

        // Update progress (10-50% during clip extraction)
        const extractProgress = 10 + (40 * (i + 1) / clips.length)
        broadcast('pmv:exportProgress', {
          status: 'encoding',
          progress: Math.round(extractProgress),
          currentStep: `Extracting clip ${i + 1} of ${clips.length}...`
        })
      }

      // Write concat file
      fs.writeFileSync(clipListPath, clipSegments.join('\n'))

      broadcast('pmv:exportProgress', { status: 'encoding', progress: 55, currentStep: 'Concatenating clips...' })

      // Concatenate all segments
      const concatPath = path.join(tempDir, `pmv-concat-${Date.now()}.mp4`)
      await new Promise<void>((resolve, reject) => {
        ffmpeg()
          .input(clipListPath)
          .inputOptions(['-f', 'concat', '-safe', '0'])
          .outputOptions([
            '-c:v', 'libx264',
            '-preset', 'medium',
            '-crf', exportSettings.quality === 'draft' ? '23' : exportSettings.quality === '4k' ? '15' : '18',
            '-pix_fmt', 'yuv420p'
          ])
          .output(concatPath)
          .on('end', () => resolve())
          .on('error', (err) => reject(err))
          .run()
      })

      // Clean up segment files
      segmentPaths.forEach(p => { try { fs.unlinkSync(p) } catch {} })
      try { fs.unlinkSync(clipListPath) } catch {}

      if (signal.aborted) {
        try { fs.unlinkSync(concatPath) } catch {}
        return { success: false, error: 'Export cancelled' }
      }

      broadcast('pmv:exportProgress', { status: 'encoding', progress: 70, currentStep: 'Adding music track...' })

      // Add music track
      const finalPath = exportSettings.format === 'gif' ? concatPath : outputPath

      if (exportSettings.format !== 'gif') {
        // Combine video with music
        await new Promise<void>((resolve, reject) => {
          const cmd = ffmpeg()
            .input(concatPath)
            .input(music.path)
            .outputOptions([
              '-c:v', 'copy',
              '-c:a', 'aac',
              '-b:a', quality.audioBitrate,
              '-map', '0:v:0',
              '-map', '1:a:0',
              '-shortest'
            ])

          // Apply music volume
          if (audio.musicVolume !== 1) {
            cmd.audioFilters(`volume=${audio.musicVolume}`)
          }

          // Apply fade in/out
          const filters: string[] = []
          if (audio.fadeInDuration > 0) {
            filters.push(`afade=t=in:st=0:d=${audio.fadeInDuration / 1000}`)
          }
          if (audio.fadeOutDuration > 0) {
            const fadeOutStart = music.duration - (audio.fadeOutDuration / 1000)
            filters.push(`afade=t=out:st=${fadeOutStart}:d=${audio.fadeOutDuration / 1000}`)
          }
          if (filters.length > 0) {
            cmd.audioFilters(filters.join(','))
          }

          cmd.output(outputPath)
            .on('end', () => resolve())
            .on('error', (err) => reject(err))
            .run()
        })

        // Clean up concat file
        try { fs.unlinkSync(concatPath) } catch {}
      } else {
        // For GIF, generate from concat video with palette
        broadcast('pmv:exportProgress', { status: 'encoding', progress: 80, currentStep: 'Generating GIF...' })

        const palettePath = path.join(tempDir, `pmv-palette-${Date.now()}.png`)
        const gifScale = quality.width > 480 ? 480 : quality.width

        // Generate palette
        await new Promise<void>((resolve, reject) => {
          ffmpeg(concatPath)
            .outputOptions(['-vf', `fps=15,scale=${gifScale}:-1:flags=lanczos,palettegen=stats_mode=diff`])
            .output(palettePath)
            .on('end', () => resolve())
            .on('error', (err) => reject(err))
            .run()
        })

        // Create GIF with palette
        await new Promise<void>((resolve, reject) => {
          ffmpeg(concatPath)
            .input(palettePath)
            .complexFilter([
              `[0:v]fps=15,scale=${gifScale}:-1:flags=lanczos[x]`,
              `[x][1:v]paletteuse=dither=floyd_steinberg`
            ])
            .outputOptions(['-loop', '0'])
            .output(outputPath)
            .on('end', () => resolve())
            .on('error', (err) => reject(err))
            .run()
        })

        // Cleanup
        try { fs.unlinkSync(palettePath) } catch {}
        try { fs.unlinkSync(concatPath) } catch {}
      }

      broadcast('pmv:exportProgress', { status: 'finalizing', progress: 95, currentStep: 'Finalizing...' })

      // If destination is library, trigger rescan
      if (exportSettings.destination === 'library') {
        broadcast('vault:changed')
      }

      broadcast('pmv:exportProgress', {
        status: 'complete',
        progress: 100,
        currentStep: 'Export complete!',
        outputPath
      })

      console.log('[PMV Export] Complete:', outputPath)
      pmvExportAbortController = null

      return { success: true, outputPath }
    } catch (err: any) {
      errorLogger.error('PMV Export', 'Export failed', err)
      broadcast('pmv:exportProgress', {
        status: 'error',
        progress: 0,
        error: err?.message || 'Export failed'
      })
      pmvExportAbortController = null
      return { success: false, error: err?.message || 'Export failed' }
    }
  })

  // Cancel ongoing PMV export
  ipcMain.handle('pmv:cancelExport', async () => {
    if (pmvExportAbortController) {
      pmvExportAbortController.abort()
      pmvExportAbortController = null
      broadcast('pmv:exportProgress', { status: 'idle', progress: 0 })
      return { success: true }
    }
    return { success: false, error: 'No export in progress' }
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // VAULT / MISC
  // ═══════════════════════════════════════════════════════════════════════════

  // Clean up stale database entries (files that no longer exist)
  ipcMain.handle('vault:cleanup', async () => {
    try {
      const allMedia = db.listMedia({ limit: 100000 }).items
      let removed = 0
      let checked = 0
      const missing: string[] = []

      console.log(`[Cleanup] Checking ${allMedia.length} media entries...`)

      // Show first few paths for debugging
      if (allMedia.length > 0) {
        console.log(`[Cleanup] Sample paths:`)
        for (let i = 0; i < Math.min(3, allMedia.length); i++) {
          const exists = fs.existsSync(allMedia[i].path)
          console.log(`  ${allMedia[i].path} -> exists: ${exists}`)
        }
      }

      for (const media of allMedia) {
        checked++
        // Normalize path for Windows
        const normalizedPath = media.path.replace(/\//g, '\\')
        const exists = fs.existsSync(normalizedPath) || fs.existsSync(media.path)

        if (!exists) {
          // File no longer exists - remove from database
          db.deleteMediaById(media.id)
          removed++
          if (missing.length < 10) {
            missing.push(`${media.filename} (${media.path})`)
          }
          if (removed <= 5) {
            console.log(`[Cleanup] Removing: ${media.path}`)
          }
        }

        // Log progress every 500 items
        if (checked % 500 === 0) {
          console.log(`[Cleanup] Checked ${checked}/${allMedia.length}, removed ${removed}`)
        }
      }

      console.log(`[Cleanup] Done! Removed ${removed} stale entries from ${checked} total`)
      if (removed > 0) {
        broadcast('vault:changed')
      }

      return {
        success: true,
        checked: allMedia.length,
        removed,
        examples: missing
      }
    } catch (e: any) {
      console.error('[Cleanup] Error:', e)
      return { success: false, error: e.message }
    }
  })

  ipcMain.handle('vault:rescan', async () => {
    // First clean up stale entries
    const allMedia = db.listMedia({ limit: 100000 }).items
    let removed = 0
    for (const media of allMedia) {
      if (!fs.existsSync(media.path)) {
        db.deleteMediaById(media.id)
        removed++
      }
    }
    if (removed > 0) {
      console.log(`[Rescan] Cleaned up ${removed} stale entries`)
    }

    // Then rescan directories
    const dirs = getMediaDirs()
    await onDirsChanged(dirs)
    return true
  })

  ipcMain.handle('vault:pickFolder', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory', 'createDirectory'],
      title: 'Select Folder'
    })
    if (result.canceled || !result.filePaths[0]) return null
    return result.filePaths[0]
  })

  ipcMain.handle('vault:getStats', async () => {
    const totalMedia = db.countMedia({ q: '', type: '', tag: '' })
    const videoCount = db.countMedia({ q: '', type: 'video', tag: '' })
    const imageCount = db.countMedia({ q: '', type: 'image', tag: '' })
    const gifCount = db.countMedia({ q: '', type: 'gif', tag: '' })
    const tagCount = db.listTags().length
    const playlistCount = db.playlistList().length

    // Get total file size and duration using raw SQL
    let totalSizeBytes = 0
    let totalDurationSec = 0
    let videosMissingDuration = 0
    let topTags: Array<{ name: string; count: number }> = []
    let recentlyAdded = 0
    let avgRating = 0
    let favoritesCount = 0
    try {
      const sizeRow = db.raw.prepare('SELECT COALESCE(SUM(size), 0) as total FROM media').get() as { total: number }
      totalSizeBytes = sizeRow?.total ?? 0

      // Sum durations across all moving-image content (video + gif). Filter
      // explicitly to non-null positive durations so corrupted/unscanned rows
      // don't poison the SUM, then separately count how many rows STILL need
      // a duration scan so the UI can surface a "backfill" affordance.
      const durationRow = db.raw.prepare(`
        SELECT COALESCE(SUM(durationSec), 0) as total
        FROM media
        WHERE type IN ('video', 'gif')
          AND durationSec IS NOT NULL
          AND durationSec > 0
      `).get() as { total: number }
      totalDurationSec = durationRow?.total ?? 0

      const missingRow = db.raw.prepare(`
        SELECT COUNT(*) as count
        FROM media
        WHERE type IN ('video', 'gif')
          AND (durationSec IS NULL OR durationSec = 0)
      `).get() as { count: number }
      videosMissingDuration = missingRow?.count ?? 0

      // Get top 10 most used tags
      topTags = db.raw.prepare(`
        SELECT t.name, COUNT(mt.mediaId) as count
        FROM tags t
        JOIN media_tags mt ON t.id = mt.tagId
        GROUP BY t.id
        ORDER BY count DESC
        LIMIT 10
      `).all() as Array<{ name: string; count: number }>

      // Get recently added (last 7 days)
      const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000
      const recentRow = db.raw.prepare('SELECT COUNT(*) as count FROM media WHERE addedAt > ?').get(weekAgo) as { count: number }
      recentlyAdded = recentRow?.count ?? 0

      // Get average rating and favorites count (ratings stored in media_stats table)
      const ratingRow = db.raw.prepare('SELECT AVG(rating) as avg, COUNT(*) as favCount FROM media_stats WHERE rating > 0').get() as { avg: number; favCount: number }
      avgRating = ratingRow?.avg ?? 0
      const favRow = db.raw.prepare('SELECT COUNT(*) as count FROM media_stats WHERE rating >= 5').get() as { count: number }
      favoritesCount = favRow?.count ?? 0
    } catch (e) {
      console.error('[vault:getStats] Failed to get size/duration:', e)
    }

    return {
      totalMedia,
      videoCount,
      imageCount,
      gifCount,
      tagCount,
      playlistCount,
      totalSizeBytes,
      totalDurationSec,
      videosMissingDuration,
      mediaDirs: getMediaDirs().length,
      cacheDir: getCacheDir(),
      topTags,
      recentlyAdded,
      avgRating,
      favoritesCount
    }
  })

  // Re-enqueue any video/gif rows whose durationSec is null or zero. This is
  // the recovery path when an older scan left durations unpopulated and Stats
  // ends up summing to 0. Cheap to run — analyze-job dedupe handles repeats.
  ipcMain.handle('vault:backfillDurations', async () => {
    const rows = db.raw.prepare(`
      SELECT id, path, type, mtimeMs, size FROM media
      WHERE type IN ('video', 'gif')
        AND (durationSec IS NULL OR durationSec = 0)
        AND analyzeError = 0
    `).all() as Array<{ id: string; path: string; type: 'video' | 'gif'; mtimeMs: number; size: number }>

    let enqueued = 0
    for (const row of rows) {
      db.enqueueJob('media:analyze', {
        mediaId: row.id,
        path: row.path,
        type: row.type,
        mtimeMs: row.mtimeMs,
        size: row.size
      }, 1)
      enqueued++
    }
    return { enqueued, total: rows.length }
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // SHELL
  // ═══════════════════════════════════════════════════════════════════════════
  ipcMain.handle('shell:openExternal', async (_ev, url: string) => {
    await shell.openExternal(url)
    return true
  })

  ipcMain.handle('shell:openPath', async (_ev, p: string) => {
    await shell.openPath(p)
    return true
  })

  ipcMain.handle('shell:showItemInFolder', async (_ev, p: string) => {
    shell.showItemInFolder(p)
    return true
  })


  // ═══════════════════════════════════════════════════════════════════════════
  // SEARCH SUGGESTIONS
  // ═══════════════════════════════════════════════════════════════════════════
  ipcMain.handle('search:suggest', async (_ev, query: string) => {
    return db.searchSuggest(query)
  })

  ipcMain.handle('search:record', async (_ev, query: string) => {
    db.searchRecord(query)
    return true
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // DATA EXPORT/IMPORT
  // ═══════════════════════════════════════════════════════════════════════════
  ipcMain.handle('data:exportSettings', async () => {
    const result = await dialog.showSaveDialog({
      title: 'Export Settings',
      defaultPath: 'vault-settings.json',
      filters: [{ name: 'JSON', extensions: ['json'] }]
    })
    if (result.canceled || !result.filePath) return null

    const settings = getSettings()
    fs.writeFileSync(result.filePath, JSON.stringify(settings, null, 2), 'utf8')
    return result.filePath
  })

  ipcMain.handle('data:importSettings', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Import Settings',
      filters: [{ name: 'JSON', extensions: ['json'] }],
      properties: ['openFile']
    })
    if (result.canceled || !result.filePaths[0]) return null

    try {
      const content = fs.readFileSync(result.filePaths[0], 'utf8')
      const imported = JSON.parse(content)
      updateSettings(imported)
      broadcast('settings:changed', getSettings())
      return true
    } catch (e) {
      return false
    }
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // CACHE MANAGEMENT
  // ═══════════════════════════════════════════════════════════════════════════
  ipcMain.handle('cache:clearThumbnails', async () => {
    try {
      const cacheDir = getCacheDir()
      const thumbsDir = path.join(cacheDir, 'thumbs')
      if (!fs.existsSync(thumbsDir)) {
        return { success: true, count: 0, freedBytes: 0 }
      }
      const files = fs.readdirSync(thumbsDir)
      let freedBytes = 0
      let count = 0
      for (const file of files) {
        try {
          const filePath = path.join(thumbsDir, file)
          const stat = fs.statSync(filePath)
          freedBytes += stat.size
          fs.unlinkSync(filePath)
          count++
        } catch {}
      }
      return { success: true, count, freedBytes }
    } catch (e: any) {
      console.error('[IPC] Failed to clear thumbnail cache:', e)
      return { success: false, error: e?.message ?? 'Unknown error' }
    }
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // GOON STATS - Session tracking & achievements
  // ═══════════════════════════════════════════════════════════════════════════
  ipcMain.handle('goon:getStats', async () => {
    // Sync totalWatchTime from watch history before returning stats
    try {
      const history = getWatchHistoryService(db)
      const watchStats = history.getStats()
      updateGoonStats({ totalWatchTime: watchStats.totalWatchTime })
    } catch (e) {
      // Ignore sync errors, return stats anyway
    }
    return getGoonStats()
  })

  ipcMain.handle('goon:updateStats', async (_ev, patch: Partial<GoonStats>) => {
    return updateGoonStats(patch)
  })

  ipcMain.handle('goon:recordEdge', async () => {
    const stats = recordEdge()
    const newAchievements = checkAchievements()
    broadcast('goon:statsChanged', stats)
    if (newAchievements.length > 0) {
      broadcast('goon:achievementUnlocked', newAchievements)
    }
    return { stats, newAchievements }
  })

  ipcMain.handle('goon:recordOrgasm', async (_ev, ruined?: boolean) => {
    const stats = recordOrgasm(ruined ?? false)
    const newAchievements = checkAchievements()
    broadcast('goon:statsChanged', stats)
    if (newAchievements.length > 0) {
      broadcast('goon:achievementUnlocked', newAchievements)
    }
    return { stats, newAchievements }
  })

  ipcMain.handle('goon:startSession', async () => {
    const stats = startSession()
    const newAchievements = checkAchievements()
    broadcast('goon:statsChanged', stats)
    broadcast('goon:sessionStarted', stats)
    return { stats, newAchievements }
  })

  ipcMain.handle('goon:endSession', async (_ev, durationMinutes: number) => {
    const stats = endSession(durationMinutes)
    const newAchievements = checkAchievements()
    broadcast('goon:statsChanged', stats)
    broadcast('goon:sessionEnded', stats)
    return { stats, newAchievements }
  })

  // Get streak protection status
  ipcMain.handle('goon:getStreakStatus', async () => {
    return getStreakStatus()
  })

  // Get personal records / leaderboard
  ipcMain.handle('goon:getPersonalRecords', async () => {
    return getPersonalRecords()
  })

  // Record a video watch (called when user opens a video)
  ipcMain.handle('goon:recordWatch', async (_ev, mediaId: string) => {
    const stats = getGoonStats()
    const watchedSet = new Set(stats.watchedVideoIds ?? [])
    const isNew = !watchedSet.has(mediaId)
    if (isNew) watchedSet.add(mediaId)
    const updated = updateGoonStats({
      totalVideosWatched: stats.totalVideosWatched + 1,
      uniqueVideosWatched: isNew ? stats.uniqueVideosWatched + 1 : stats.uniqueVideosWatched,
      watchedVideoIds: Array.from(watchedSet)
    })
    const newAchievements = checkAchievements()
    broadcast('goon:statsChanged', updated)
    if (newAchievements.length > 0) {
      broadcast('goon:achievementUnlocked', newAchievements)
    }
    return updated
  })

  ipcMain.handle('goon:getAchievements', async () => {
    return ACHIEVEMENTS
  })

  ipcMain.handle('goon:checkAchievements', async () => {
    const newAchievements = checkAchievements()
    if (newAchievements.length > 0) {
      broadcast('goon:achievementUnlocked', newAchievements)
    }
    return newAchievements
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // FEATURE USAGE TRACKING (for achievements)
  // ═══════════════════════════════════════════════════════════════════════════

  // Track DLNA cast
  ipcMain.handle('goon:trackDlnaCast', async (_ev, deviceId: string) => {
    const stats = getGoonStats()
    const devices = new Set(stats.dlnaDevicesUsed ?? [])
    devices.add(deviceId)
    const updated = updateGoonStats({
      dlnaCastsCount: (stats.dlnaCastsCount ?? 0) + 1,
      dlnaDevicesUsed: Array.from(devices)
    })
    const newAchievements = checkAchievements()
    if (newAchievements.length > 0) broadcast('goon:achievementUnlocked', newAchievements)
    return updated
  })

  // Track hardware encoder enabled
  ipcMain.handle('goon:trackHardwareEncoder', async () => {
    const updated = updateGoonStats({ hardwareEncoderEnabled: true })
    const newAchievements = checkAchievements()
    if (newAchievements.length > 0) broadcast('goon:achievementUnlocked', newAchievements)
    return updated
  })

  // Track command palette usage
  ipcMain.handle('goon:trackCommandPalette', async () => {
    const stats = getGoonStats()
    const updated = updateGoonStats({ commandPaletteUsed: (stats.commandPaletteUsed ?? 0) + 1 })
    const newAchievements = checkAchievements()
    if (newAchievements.length > 0) broadcast('goon:achievementUnlocked', newAchievements)
    return updated
  })

  // Track double-tap like
  ipcMain.handle('goon:trackDoubleTapLike', async () => {
    const stats = getGoonStats()
    const updated = updateGoonStats({ doubleTapLikes: (stats.doubleTapLikes ?? 0) + 1 })
    const newAchievements = checkAchievements()
    if (newAchievements.length > 0) broadcast('goon:achievementUnlocked', newAchievements)
    return updated
  })

  // Track feed swipe
  ipcMain.handle('goon:trackFeedSwipe', async () => {
    const stats = getGoonStats()
    const updated = updateGoonStats({ feedSwipes: (stats.feedSwipes ?? 0) + 1 })
    const newAchievements = checkAchievements()
    if (newAchievements.length > 0) broadcast('goon:achievementUnlocked', newAchievements)
    return updated
  })

  // Track overlay enabled
  ipcMain.handle('goon:trackOverlayEnabled', async (_ev, overlayId: string) => {
    const stats = getGoonStats()
    const overlays = new Set(stats.overlaysEnabled ?? [])
    overlays.add(overlayId)
    const updated = updateGoonStats({ overlaysEnabled: Array.from(overlays) })
    const newAchievements = checkAchievements()
    if (newAchievements.length > 0) broadcast('goon:achievementUnlocked', newAchievements)
    return updated
  })

  // Track scene marker created
  ipcMain.handle('goon:trackSceneMarker', async () => {
    const stats = getGoonStats()
    const updated = updateGoonStats({ sceneMarkersCreated: (stats.sceneMarkersCreated ?? 0) + 1 })
    const newAchievements = checkAchievements()
    if (newAchievements.length > 0) broadcast('goon:achievementUnlocked', newAchievements)
    return updated
  })

  // Track caption created
  ipcMain.handle('goon:trackCaptionCreated', async () => {
    const stats = getGoonStats()
    const updated = updateGoonStats({ captionsCreated: (stats.captionsCreated ?? 0) + 1 })
    const newAchievements = checkAchievements()
    if (newAchievements.length > 0) broadcast('goon:achievementUnlocked', newAchievements)
    return updated
  })

  // Track playlist export
  ipcMain.handle('goon:trackPlaylistExport', async () => {
    const stats = getGoonStats()
    const updated = updateGoonStats({ playlistsExported: (stats.playlistsExported ?? 0) + 1 })
    const newAchievements = checkAchievements()
    if (newAchievements.length > 0) broadcast('goon:achievementUnlocked', newAchievements)
    return updated
  })

  // Track playlist import
  ipcMain.handle('goon:trackPlaylistImport', async () => {
    const stats = getGoonStats()
    const updated = updateGoonStats({ playlistsImported: (stats.playlistsImported ?? 0) + 1 })
    const newAchievements = checkAchievements()
    if (newAchievements.length > 0) broadcast('goon:achievementUnlocked', newAchievements)
    return updated
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // SESSION MODES
  // ═══════════════════════════════════════════════════════════════════════════
  ipcMain.handle('session:getModes', async () => {
    return SESSION_MODES
  })

  ipcMain.handle('session:getActive', async () => {
    return getSessionMode()
  })

  ipcMain.handle('session:setMode', async (_ev, modeId: SessionModeId) => {
    const settings = setSessionMode(modeId)
    broadcast('settings:changed', settings)
    broadcast('session:modeChanged', getSessionMode())
    return getSessionMode()
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // GOON THEMES & VOCABULARY
  // ═══════════════════════════════════════════════════════════════════════════
  ipcMain.handle('themes:getGoonThemes', async () => {
    return GOON_THEMES
  })

  ipcMain.handle('themes:getGoonTheme', async (_ev, themeId: string) => {
    return getGoonTheme(themeId as ThemeId)
  })

  ipcMain.handle('vocabulary:get', async () => {
    return GOON_VOCABULARY
  })


  // ═══════════════════════════════════════════════════════════════════════════
  // AUDIO - Sound Pack Organization & Voice Lines
  // ═══════════════════════════════════════════════════════════════════════════
  ipcMain.handle('audio:organizeSoundPack', async (_ev, sourceDir: string) => {
    try {
      const targetDir = path.join(app.getPath('userData'), 'audio', 'voice')
      const organizer = new SoundOrganizer(sourceDir, targetDir)
      const files = await organizer.organize()
      const manifest = organizer.generateManifest(files)
      organizer.saveManifest(manifest)

      // Reload voice line service
      const vls = getVoiceLineService()
      await vls.reload()

      return {
        success: true,
        organized: files.length,
        manifest,
        targetDir
      }
    } catch (e: any) {
      return {
        success: false,
        error: e.message || 'Failed to organize sound pack'
      }
    }
  })

  ipcMain.handle('audio:getVoiceLine', async (_ev, category: string, subcategory?: string) => {
    try {
      const vls = getVoiceLineService()
      await vls.initialize()

      const options = {
        spiceLevel: 3, // Default spice level
        personality: 'default'
      }

      const line = vls.getVoiceLine(category, subcategory, options)
      if (!line) return null

      const audio = await vls.getAudioBase64(line)
      return {
        ...line,
        audioBase64: audio
      }
    } catch (e: any) {
      console.error('Error getting voice line:', e)
      return null
    }
  })

  ipcMain.handle('audio:getVoiceLineSequence', async (_ev, categories: Array<{ category: string; subcategory?: string }>) => {
    try {
      const vls = getVoiceLineService()
      await vls.initialize()

      const options = {
        spiceLevel: 3,
        personality: 'default'
      }

      const sequence = vls.getVoiceLineSequence(categories, options)
      const results = []

      for (const line of sequence) {
        const audio = await vls.getAudioBase64(line)
        results.push({
          ...line,
          audioBase64: audio
        })
      }

      return results
    } catch (e: any) {
      console.error('Error getting voice line sequence:', e)
      return []
    }
  })

  ipcMain.handle('audio:getStats', async () => {
    try {
      const vls = getVoiceLineService()
      await vls.initialize()
      return {
        ...vls.getStats(),
        categories: vls.getCategories(),
        hasVoiceLines: vls.hasVoiceLines()
      }
    } catch (e) {
      return {
        total: 0,
        byCategory: {},
        categories: [],
        hasVoiceLines: false
      }
    }
  })

  ipcMain.handle('audio:reloadVoiceLines', async () => {
    try {
      const vls = getVoiceLineService()
      await vls.reload()
      return { success: true }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // UI SOUNDS - Click sounds from "UI Sound Effects" folder
  // ═══════════════════════════════════════════════════════════════════════════
  let uiSoundFiles: string[] | null = null

  ipcMain.handle('uiSounds:list', async () => {
    if (uiSoundFiles) return uiSoundFiles
    const dir = path.join(app.getAppPath(), 'UI Sound Effects')
    // Also check project root (dev mode)
    const devDir = path.join(process.cwd(), 'UI Sound Effects')
    const checkDir = fs.existsSync(dir) ? dir : fs.existsSync(devDir) ? devDir : null
    if (!checkDir) return []
    try {
      const files = fs.readdirSync(checkDir)
        .filter(f => /\.(wav|mp3|ogg|m4a)$/i.test(f))
        .map(f => path.join(checkDir, f))
      uiSoundFiles = files
      return files
    } catch {
      return []
    }
  })

  ipcMain.handle('uiSounds:getUrl', async (_ev, filePath: string) => {
    // Return vault:// protocol URL for the sound file (must match protocol handler format)
    return `vault://media?path=${encodeURIComponent(filePath)}`
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // TAGGING - NSFW Auto-Tagging (optional tensorflow)
  // ═══════════════════════════════════════════════════════════════════════════
  ipcMain.handle('tagging:isAvailable', async () => {
    const tagger = getNSFWTagger()
    return tagger.isAvailable()
  })

  ipcMain.handle('tagging:tagFile', async (_ev, filePath: string) => {
    try {
      const tagger = getNSFWTagger()
      if (!tagger.isAvailable()) {
        return {
          filePath,
          predictions: [],
          primaryTag: 'unknown',
          confidence: 0,
          suggestedTags: [],
          error: 'NSFWJS not available. Install with: npm install nsfwjs @tensorflow/tfjs-node'
        }
      }

      const ext = path.extname(filePath).toLowerCase()
      const videoExtensions = ['.mp4', '.webm', '.avi', '.mov', '.mkv']

      if (videoExtensions.includes(ext)) {
        return await tagger.tagVideo(filePath)
      } else {
        return await tagger.tagImage(filePath)
      }
    } catch (e: any) {
      return {
        filePath,
        predictions: [],
        primaryTag: 'unknown',
        confidence: 0,
        suggestedTags: [],
        error: e.message || 'Failed to tag file'
      }
    }
  })

  ipcMain.handle('tagging:tagDirectory', async (_ev, dirPath: string, options?: { recursive?: boolean }) => {
    try {
      const tagger = getNSFWTagger()
      if (!tagger.isAvailable()) {
        return {
          success: false,
          results: [],
          error: 'NSFWJS not available. Install with: npm install nsfwjs @tensorflow/tfjs-node'
        }
      }

      const results = await tagger.tagDirectory(dirPath, {
        recursive: options?.recursive ?? true,
        onProgress: (current, total, file) => {
          broadcast('tagging:progress', { current, total, file })
        }
      })

      return {
        success: true,
        results,
        total: results.length
      }
    } catch (e: any) {
      return {
        success: false,
        results: [],
        error: e.message || 'Failed to tag directory'
      }
    }
  })

  ipcMain.handle('tagging:applyTags', async (_ev, mediaId: string, tags: string[]) => {
    try {
      for (const tag of tags) {
        db.addTagToMedia(mediaId, tag)
      }
      broadcast('vault:changed')
      return { success: true, tags: db.listMediaTags(mediaId) }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  })

  ipcMain.handle('tagging:autoTagMedia', async (_ev, mediaId: string) => {
    try {
      const media = db.getMedia(mediaId)
      if (!media) {
        return { success: false, error: 'Media not found' }
      }

      const tagger = getNSFWTagger()
      if (!tagger.isAvailable()) {
        return { success: false, error: 'NSFWJS not available' }
      }

      const ext = path.extname(media.path).toLowerCase()
      const videoExtensions = ['.mp4', '.webm', '.avi', '.mov', '.mkv']
      const result = videoExtensions.includes(ext)
        ? await tagger.tagVideo(media.path)
        : await tagger.tagImage(media.path)

      if (result.error) {
        return { success: false, error: result.error }
      }

      // Apply suggested tags
      for (const tag of result.suggestedTags) {
        db.addTagToMedia(mediaId, tag)
      }
      broadcast('vault:changed')

      return {
        success: true,
        result,
        appliedTags: result.suggestedTags
      }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // SMART TAGGING - Filename-based intelligent tagging
  // ═══════════════════════════════════════════════════════════════════════════
  ipcMain.handle('smartTag:analyze', async (_ev, filePath: string) => {
    const tagger = getSmartTagger()
    return tagger.analyzeFilename(filePath)
  })

  ipcMain.handle('smartTag:analyzeMedia', async (_ev, mediaId: string) => {
    const media = db.getMedia(mediaId)
    if (!media) return { success: false, error: 'Media not found' }

    const tagger = getSmartTagger()
    const result = tagger.analyzeFilename(media.path)

    return {
      success: true,
      mediaId,
      ...result
    }
  })

  ipcMain.handle('smartTag:getSuggestions', async (_ev, mediaId: string, minConfidence?: number) => {
    const media = db.getMedia(mediaId)
    if (!media) return []

    const tagger = getSmartTagger()
    return tagger.getSuggestedTags(media.path, minConfidence ?? 0.6)
  })

  ipcMain.handle('smartTag:applyToMedia', async (_ev, mediaId: string, minConfidence?: number) => {
    try {
      const media = db.getMedia(mediaId)
      if (!media) return { success: false, error: 'Media not found' }

      const tagger = getSmartTagger()
      const tags = tagger.getSuggestedTags(media.path, minConfidence ?? 0.6)

      // Apply each suggested tag
      for (const tag of tags) {
        db.addTagToMedia(mediaId, tag)
      }

      broadcast('vault:changed')
      return {
        success: true,
        appliedTags: tags,
        currentTags: db.listMediaTags(mediaId)
      }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  })

  ipcMain.handle('smartTag:suggestCleanName', async (_ev, mediaId: string) => {
    const media = db.getMedia(mediaId)
    if (!media) return { success: false, error: 'Media not found' }

    const tagger = getSmartTagger()
    const cleanName = tagger.suggestCleanName(media.path)

    return {
      success: true,
      originalName: media.filename,
      suggestedName: cleanName
    }
  })

  ipcMain.handle('smartTag:getAllKnownTags', async () => {
    const tagger = getSmartTagger()
    return tagger.getAllKnownTags()
  })

  ipcMain.handle('smartTag:getCategories', async () => {
    const tagger = getSmartTagger()
    return tagger.getCategories()
  })

  ipcMain.handle('smartTag:getExcludedTags', async () => {
    const tagger = getSmartTagger()
    return tagger.getExcludedTags()
  })

  // Auto-tag all media with smart suggestions
  ipcMain.handle('smartTag:autoTagAll', async (_ev, options?: { minConfidence?: number }) => {
    try {
      const tagger = getSmartTagger()
      const minConfidence = options?.minConfidence ?? 0.7
      const allMedia = db.listMedia({ q: '', type: '', tag: '', limit: 10000, offset: 0 })

      let processed = 0
      let tagged = 0
      const results: Array<{ mediaId: string; filename: string; appliedTags: string[] }> = []

      for (const media of allMedia.items) {
        const tags = tagger.getSuggestedTags(media.path, minConfidence)
        if (tags.length > 0) {
          for (const tag of tags) {
            db.addTagToMedia(media.id, tag)
          }
          results.push({
            mediaId: media.id,
            filename: media.filename,
            appliedTags: tags
          })
          tagged++
        }
        processed++

        // Broadcast progress every 50 items
        if (processed % 50 === 0) {
          broadcast('smartTag:progress', {
            processed,
            total: allMedia.items.length,
            tagged
          })
        }
      }

      broadcast('vault:changed')
      return {
        success: true,
        processed,
        tagged,
        results: results.slice(0, 100) // Only return first 100 for display
      }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // HYBRID TAGGING - AI-powered multi-tier tagging
  // ═══════════════════════════════════════════════════════════════════════════

  // Check if vision AI is available (Ollama running)
  ipcMain.handle('hybridTag:isVisionAvailable', async () => {
    const tagger = getHybridTagger()
    return tagger.isVisionAvailable()
  })

  // Tag a single media item with hybrid approach
  ipcMain.handle('hybridTag:tagMedia', async (_ev, mediaId: string) => {
    try {
      const media = db.getMedia(mediaId)
      if (!media) return { success: false, error: 'Media not found' }

      const tagger = getHybridTagger()
      const result = await tagger.tagMedia(media)

      return { success: true, result }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  })

  // Apply hybrid tags to a media item
  ipcMain.handle('hybridTag:applyToMedia', async (_ev, mediaId: string) => {
    try {
      const media = db.getMedia(mediaId)
      if (!media) return { success: false, error: 'Media not found' }

      const tagger = getHybridTagger()
      const result = await tagger.tagMedia(media)

      // Apply the tags
      for (const tag of result.tags) {
        db.addTagToMedia(mediaId, tag.name)
      }

      broadcast('vault:changed')
      return {
        success: true,
        appliedTags: result.tags.map(t => t.name),
        result
      }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  })

  // Auto-tag all untagged media using hybrid approach
  ipcMain.handle('hybridTag:autoTagAll', async (_ev, options?: {
    onlyUntagged?: boolean
    maxItems?: number
    useVision?: boolean
  }) => {
    try {
      const onlyUntagged = options?.onlyUntagged ?? true
      const maxItems = options?.maxItems ?? 10000
      const useVision = options?.useVision ?? true

      const tagger = getHybridTagger({ useVision })

      // Get all media to process (videos and images)
      const allMedia = db.listMedia({ q: '', type: '', tag: '', limit: maxItems, offset: 0 })
      let toProcess = allMedia.items.filter(m => m.type === 'video' || m.type === 'image' || m.type === 'gif')

      console.log(`[HybridTag] Found ${toProcess.length} media items total`)

      if (onlyUntagged) {
        // Filter to only items with no tags
        toProcess = toProcess.filter(m => {
          const tags = db.listMediaTags(m.id)
          return tags.length === 0
        })
        console.log(`[HybridTag] ${toProcess.length} videos have no tags`)
      }

      toProcess = toProcess.slice(0, maxItems)
      console.log(`[HybridTag] Processing ${toProcess.length} videos`)

      let processed = 0
      let tagged = 0
      const results: Array<{ mediaId: string; filename: string; tags: string[]; methods: string[] }> = []

      // Broadcast initial progress
      broadcast('hybridTag:progress', { processed: 0, total: toProcess.length, tagged: 0 })

      for (const media of toProcess) {
        console.log(`[HybridTag] ${processed + 1}/${toProcess.length}: ${media.filename}`)

        try {
          const result = await tagger.tagMedia(media)

          if (result.tags.length > 0) {
            for (const tag of result.tags) {
              db.addTagToMedia(media.id, tag.name)
            }
            results.push({
              mediaId: media.id,
              filename: media.filename,
              tags: result.tags.map(t => t.name),
              methods: result.methodsUsed
            })
            tagged++
            console.log(`[HybridTag] Tagged with: ${result.tags.map(t => t.name).join(', ')}`)
          }
        } catch (e: any) {
          console.error(`[HybridTag] Failed: ${e.message}`)
        }

        processed++

        // Broadcast progress on every item
        broadcast('hybridTag:progress', {
          processed,
          total: toProcess.length,
          tagged
        })
      }

      broadcast('vault:changed')
      return {
        success: true,
        processed,
        tagged,
        results: results.slice(0, 50) // Return first 50 for display
      }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  })

  // Get tag suggestions for a media item (without applying)
  ipcMain.handle('hybridTag:getSuggestions', async (_ev, mediaId: string) => {
    try {
      const media = db.getMedia(mediaId)
      if (!media) return { success: false, error: 'Media not found' }

      const existingTags = db.listMediaTags(mediaId).map(t => t.name)
      const tagger = getHybridTagger()
      const suggestions = await tagger.getSuggestionsForMedia(media, existingTags)

      return { success: true, suggestions }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // AI VIDEO ANALYSIS - Scene detection, tagging, summaries, highlights
  // ═══════════════════════════════════════════════════════════════════════════

  // Check if video analyzer is available
  ipcMain.handle('videoAnalysis:isAvailable', async () => {
    return isAnalyzerAvailable()
  })

  // Analyze a single video
  ipcMain.handle('videoAnalysis:analyze', async (_ev, mediaId: string) => {
    try {
      const media = db.getMedia(mediaId)
      if (!media) return { success: false, error: 'Media not found' }
      if (media.type !== 'video') return { success: false, error: 'Not a video' }

      const existingTags = db.listTags().map(t => t.name)

      const analysis = await analyzeVideo(
        media.path,
        mediaId,
        existingTags,
        (progress) => {
          broadcast('videoAnalysis:progress', { mediaId, ...progress })
        }
      )

      // Save analysis to database
      const id = `analysis_${mediaId}`
      db.raw.prepare(`
        INSERT INTO video_analyses (id, mediaId, duration, summary, scenesJson, tagsJson, highlightsJson, bestThumbnailTime, analyzedAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(mediaId) DO UPDATE SET
          duration=excluded.duration,
          summary=excluded.summary,
          scenesJson=excluded.scenesJson,
          tagsJson=excluded.tagsJson,
          highlightsJson=excluded.highlightsJson,
          bestThumbnailTime=excluded.bestThumbnailTime,
          analyzedAt=excluded.analyzedAt
      `).run(
        id,
        mediaId,
        analysis.duration,
        analysis.summary,
        JSON.stringify(analysis.scenes),
        JSON.stringify(analysis.tags),
        JSON.stringify(analysis.highlights),
        analysis.bestThumbnailTime,
        analysis.analyzedAt
      )

      // Apply discovered tags to the media
      for (const tag of analysis.tags) {
        if (tag.confidence >= 0.5) {
          db.addTagToMedia(mediaId, tag.name)

          // Mark new AI-generated tags
          if (tag.isNew) {
            db.raw.prepare(`UPDATE tags SET isAiGenerated = 1 WHERE name = ?`).run(tag.name)
          }
        }
      }

      broadcast('vault:changed')
      return { success: true, analysis }
    } catch (e: any) {
      console.error('[VideoAnalysis] Failed:', e)
      return { success: false, error: e.message }
    }
  })

  // Get analysis for a video
  ipcMain.handle('videoAnalysis:get', async (_ev, mediaId: string) => {
    try {
      const row = db.raw.prepare(`
        SELECT * FROM video_analyses WHERE mediaId = ? LIMIT 1
      `).get(mediaId) as any

      if (!row) return { success: false, error: 'No analysis found' }

      return {
        success: true,
        analysis: {
          mediaId: row.mediaId,
          duration: row.duration,
          summary: row.summary,
          scenes: JSON.parse(row.scenesJson || '[]'),
          tags: JSON.parse(row.tagsJson || '[]'),
          highlights: JSON.parse(row.highlightsJson || '[]'),
          bestThumbnailTime: row.bestThumbnailTime,
          analyzedAt: row.analyzedAt
        }
      }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  })

  // Batch analyze videos
  ipcMain.handle('videoAnalysis:analyzeBatch', async (_ev, options?: { limit?: number; onlyUnanalyzed?: boolean }) => {
    try {
      const limit = options?.limit ?? 10
      const onlyUnanalyzed = options?.onlyUnanalyzed ?? true

      const allVideos = db.listMedia({ q: '', type: 'video', tag: '', limit: limit * 2, offset: 0 }).items

      let toAnalyze = allVideos

      if (onlyUnanalyzed) {
        const analyzedIds = new Set(
          (db.raw.prepare(`SELECT mediaId FROM video_analyses`).all() as Array<{ mediaId: string }>)
            .map(r => r.mediaId)
        )
        toAnalyze = allVideos.filter(v => !analyzedIds.has(v.id))
      }

      toAnalyze = toAnalyze.slice(0, limit)

      const existingTags = db.listTags().map(t => t.name)
      const results: Array<{ mediaId: string; success: boolean; tagsFound: number }> = []

      for (let i = 0; i < toAnalyze.length; i++) {
        const video = toAnalyze[i]
        broadcast('videoAnalysis:batchProgress', {
          current: i + 1,
          total: toAnalyze.length,
          currentVideo: video.filename
        })

        try {
          const analysis = await analyzeVideo(video.path, video.id, existingTags)

          // Save to database
          const id = `analysis_${video.id}`
          db.raw.prepare(`
            INSERT INTO video_analyses (id, mediaId, duration, summary, scenesJson, tagsJson, highlightsJson, bestThumbnailTime, analyzedAt)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(mediaId) DO UPDATE SET
              duration=excluded.duration,
              summary=excluded.summary,
              scenesJson=excluded.scenesJson,
              tagsJson=excluded.tagsJson,
              highlightsJson=excluded.highlightsJson,
              bestThumbnailTime=excluded.bestThumbnailTime,
              analyzedAt=excluded.analyzedAt
          `).run(
            id,
            video.id,
            analysis.duration,
            analysis.summary,
            JSON.stringify(analysis.scenes),
            JSON.stringify(analysis.tags),
            JSON.stringify(analysis.highlights),
            analysis.bestThumbnailTime,
            analysis.analyzedAt
          )

          // Apply tags
          for (const tag of analysis.tags) {
            if (tag.confidence >= 0.5) {
              db.addTagToMedia(video.id, tag.name)
            }
          }

          results.push({ mediaId: video.id, success: true, tagsFound: analysis.tags.length })
        } catch (e) {
          console.error(`[VideoAnalysis] Failed for ${video.filename}:`, e)
          results.push({ mediaId: video.id, success: false, tagsFound: 0 })
        }
      }

      broadcast('vault:changed')
      return { success: true, analyzed: results.filter(r => r.success).length, results }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  })

  // Get tags with visibility info
  ipcMain.handle('tags:listWithVisibility', async () => {
    const tags = db.raw.prepare(`
      SELECT t.*, COUNT(mt.mediaId) as mediaCount
      FROM tags t
      LEFT JOIN media_tags mt ON mt.tagId = t.id
      GROUP BY t.id
      ORDER BY mediaCount DESC, t.name ASC
    `).all() as Array<{ id: string; name: string; isHidden: number; isAiGenerated: number; mediaCount: number }>

    return tags.map(t => ({
      ...t,
      isHidden: t.isHidden === 1,
      isAiGenerated: t.isAiGenerated === 1
    }))
  })

  // Toggle tag visibility
  ipcMain.handle('tags:setVisibility', async (_ev, tagName: string, isHidden: boolean) => {
    db.raw.prepare(`UPDATE tags SET isHidden = ? WHERE name = ?`).run(isHidden ? 1 : 0, tagName)
    broadcast('vault:changed')
    return { success: true }
  })

  // Optimize/clean up media filename
  ipcMain.handle('media:optimizeName', async (_ev, mediaId: string) => {
    try {
      const media = db.getMedia(mediaId)
      if (!media) {
        return { success: false, error: 'Media not found' }
      }

      const oldPath = media.path
      const dir = path.dirname(oldPath)
      const ext = path.extname(oldPath)
      const oldName = path.basename(oldPath, ext)

      // Clean up the filename
      let newName = oldName
        // Remove common URL/platform prefixes
        .replace(/^(https?_|www_|xvideos_|pornhub_|xnxx_|xhamster_|redtube_|spankbang_|youporn_|join_us_|more_at_)/gi, '')
        // Remove Telegram/social handles
        .replace(/(@\w+|telegram[_\s]?\d*|\d{3,}$)/gi, '')
        // Convert underscores to spaces
        .replace(/_/g, ' ')
        // Remove HD/quality indicators at end
        .replace(/[\s_-]*(HD|1080p|720p|480p|4K|UHD|HQ)$/gi, '')
        // Clean up multiple spaces
        .replace(/\s+/g, ' ')
        // Trim
        .trim()

      // If name is now empty or too short, keep original
      if (newName.length < 3) {
        return { success: false, error: 'Could not generate a better name' }
      }

      // Capitalize first letter of each word
      newName = newName
        .split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(' ')

      const newPath = path.join(dir, newName + ext)

      // Check if new path already exists
      if (fs.existsSync(newPath) && newPath !== oldPath) {
        return { success: false, error: 'A file with that name already exists' }
      }

      // Rename the file
      if (newPath !== oldPath) {
        fs.renameSync(oldPath, newPath)
        // Update database
        db.updateMediaPath(mediaId, newPath, newName)
        broadcast('vault:changed')
      }

      return {
        success: true,
        oldName,
        newName,
        newPath
      }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  })

  // Batch optimize all filenames
  ipcMain.handle('media:optimizeAllNames', async () => {
    try {
      const { items: allMedia } = db.listMedia({ limit: 50000 })
      let optimized = 0
      let skipped = 0
      let failed = 0
      const errors: string[] = []

      for (const media of allMedia) {
        try {
          const oldPath = media.path

          // Check if file exists first
          if (!fs.existsSync(oldPath)) {
            skipped++
            continue
          }

          const dir = path.dirname(oldPath)
          const ext = path.extname(oldPath)
          const oldName = path.basename(oldPath, ext)

          // Clean up the filename
          let newName = oldName
            // Remove common URL/platform prefixes
            .replace(/^(https?_|www_|xvideos_|pornhub_|xnxx_|xhamster_|redtube_|spankbang_|youporn_|join_us_|more_at_)/gi, '')
            // Remove Telegram/social handles
            .replace(/(@\w+|telegram[_\s]?\d*|\d{3,}$)/gi, '')
            // Convert underscores to spaces
            .replace(/_/g, ' ')
            // Remove HD/quality indicators at end
            .replace(/[\s_-]*(HD|1080p|720p|480p|4K|UHD|HQ)$/gi, '')
            // Remove common gibberish patterns (random hex strings, video IDs)
            .replace(/[_-]?[a-f0-9]{24,}/gi, '')
            .replace(/[-_]?video[-_]?\d{6,}/gi, '')
            // Remove Windows-invalid characters
            .replace(/[<>:"/\\|?*]/g, '')
            // Clean up multiple spaces
            .replace(/\s+/g, ' ')
            // Trim
            .trim()

          // If name is unchanged or too short, skip
          if (newName === oldName || newName.length < 3) {
            skipped++
            continue
          }

          // Capitalize first letter of each word
          newName = newName
            .split(' ')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
            .join(' ')

          const newPath = path.join(dir, newName + ext)

          // Check if new path already exists
          if (fs.existsSync(newPath) && newPath.toLowerCase() !== oldPath.toLowerCase()) {
            skipped++
            continue
          }

          // Rename the file
          if (newPath !== oldPath) {
            fs.renameSync(oldPath, newPath)
            // Update database
            db.updateMediaPath(media.id, newPath, newName)
            optimized++
            console.log(`[OptimizeNames] Renamed: ${oldName} -> ${newName}`)
          }
        } catch (e: any) {
          failed++
          if (errors.length < 5) {
            errors.push(`${media.filename || media.path}: ${e.message}`)
          }
        }
      }

      broadcast('vault:changed')
      return {
        success: true,
        optimized,
        skipped,
        failed,
        total: allMedia.length,
        errors: errors.length > 0 ? errors : undefined
      }
    } catch (e: any) {
      console.error('[OptimizeNames] Error:', e)
      return { success: false, error: e.message }
    }
  })

  // Optimize filenames for specific media IDs (bulk selection)
  ipcMain.handle('media:optimizeNames', async (_ev, mediaIds: string[]) => {
    try {
      let optimized = 0
      let skipped = 0
      let failed = 0
      const errors: string[] = []

      for (const mediaId of mediaIds) {
        try {
          const media = db.getMedia(mediaId)
          if (!media) {
            skipped++
            continue
          }

          const oldPath = media.path
          if (!fs.existsSync(oldPath)) {
            skipped++
            continue
          }

          const dir = path.dirname(oldPath)
          const ext = path.extname(oldPath)
          const oldName = path.basename(oldPath, ext)

          // Clean up the filename (same logic as optimizeAllNames)
          let newName = oldName
            .replace(/^(https?_|www_|xvideos_|pornhub_|xnxx_|xhamster_|redtube_|spankbang_|youporn_|join_us_|more_at_)/gi, '')
            .replace(/(@\w+|telegram[_\s]?\d*|\d{3,}$)/gi, '')
            .replace(/_/g, ' ')
            .replace(/[\s_-]*(HD|1080p|720p|480p|4K|UHD|HQ)$/gi, '')
            .replace(/[_-]?[a-f0-9]{24,}/gi, '')
            .replace(/[-_]?video[-_]?\d{6,}/gi, '')
            .replace(/[<>:"/\\|?*]/g, '')
            .replace(/\s+/g, ' ')
            .trim()

          if (newName === oldName || newName.length < 3) {
            skipped++
            continue
          }

          newName = newName
            .split(' ')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
            .join(' ')

          const newPath = path.join(dir, newName + ext)

          if (fs.existsSync(newPath) && newPath.toLowerCase() !== oldPath.toLowerCase()) {
            skipped++
            continue
          }

          if (newPath !== oldPath) {
            fs.renameSync(oldPath, newPath)
            db.updateMediaPath(media.id, newPath, newName)
            optimized++
            console.log(`[OptimizeNames] Renamed: ${oldName} -> ${newName}`)
          }
        } catch (e: any) {
          failed++
          if (errors.length < 5) {
            errors.push(`${mediaId}: ${e.message}`)
          }
        }
      }

      broadcast('vault:changed')
      return {
        success: true,
        optimized,
        skipped,
        failed,
        total: mediaIds.length,
        errors: errors.length > 0 ? errors : undefined
      }
    } catch (e: any) {
      console.error('[OptimizeNames] Error:', e)
      return { success: false, error: e.message }
    }
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // AI LIBRARY TOOLS - Tag cleaning, tag creation, AI file renaming
  // ═══════════════════════════════════════════════════════════════════════════

  // Check if AI is available
  ipcMain.handle('aiTools:isAvailable', async () => {
    return isOllamaAvailable()
  })

  // AI-powered tag cleanup - merge similar, fix typos, normalize
  ipcMain.handle('aiTools:cleanupTags', async () => {
    try {
      const allTags = db.listTags()
      const tagsWithCounts = allTags.map(t => {
        const count = db.listMedia({ q: '', type: '', tag: t.name, limit: 1, offset: 0 }).total
        return { name: t.name, count }
      })

      console.log(`[AI Tags] Starting cleanup of ${tagsWithCounts.length} tags`)

      const result = await aiCleanupTags(tagsWithCounts, (current, total, tag) => {
        broadcast('aiTools:tagCleanupProgress', { current, total, tag })
      })

      if (!result.success) {
        return { success: false, error: 'AI not available' }
      }

      // Apply the changes
      let applied = 0
      for (const r of result.results) {
        if (r.action === 'delete') {
          // Remove tag from all media
          const media = db.listMedia({ q: '', type: '', tag: r.original, limit: 10000, offset: 0 })
          for (const m of media.items) {
            db.removeTagFromMedia(m.id, r.original)
          }
          console.log(`[AI Tags] Deleted: ${r.original} (${r.reason})`)
          applied++
        } else if (r.action === 'rename' && r.cleaned !== r.original) {
          // Rename tag on all media
          const media = db.listMedia({ q: '', type: '', tag: r.original, limit: 10000, offset: 0 })
          for (const m of media.items) {
            db.removeTagFromMedia(m.id, r.original)
            db.addTagToMedia(m.id, r.cleaned)
          }
          console.log(`[AI Tags] Renamed: ${r.original} -> ${r.cleaned} (${r.reason})`)
          applied++
        } else if (r.action === 'merge' && r.mergeInto) {
          // Merge tag into another
          const media = db.listMedia({ q: '', type: '', tag: r.original, limit: 10000, offset: 0 })
          for (const m of media.items) {
            db.removeTagFromMedia(m.id, r.original)
            db.addTagToMedia(m.id, r.mergeInto)
          }
          console.log(`[AI Tags] Merged: ${r.original} -> ${r.mergeInto} (${r.reason})`)
          applied++
        }
      }

      broadcast('vault:changed')
      return {
        success: true,
        analyzed: result.results.length,
        merged: result.merged,
        renamed: result.renamed,
        deleted: result.deleted,
        applied
      }
    } catch (e: any) {
      console.error('[AI Tags] Cleanup error:', e)
      return { success: false, error: e.message }
    }
  })

  // AI-powered tag generation - creates new tags dynamically
  ipcMain.handle('aiTools:generateTags', async (_ev, mediaId: string) => {
    try {
      const media = db.getMedia(mediaId)
      if (!media) return { success: false, error: 'Media not found' }

      const existingTags = db.listMediaTags(mediaId).map(t => t.name)
      const allLibraryTags = db.listTags().map(t => t.name)

      const result = await aiGenerateTags(media, existingTags, allLibraryTags)

      if (!result.success) {
        return { success: false, error: 'AI not available or failed' }
      }

      // Apply the new tags
      let applied = 0
      for (const tag of result.tags) {
        if (tag.confidence >= 0.4) {
          db.addTagToMedia(mediaId, tag.name)
          applied++

          // Mark as AI-generated if new
          if (tag.isNew) {
            db.raw.prepare(`UPDATE tags SET isAiGenerated = 1 WHERE name = ?`).run(tag.name)
          }
        }
      }

      broadcast('vault:changed')
      return {
        success: true,
        tags: result.tags,
        applied,
        newTagsCreated: result.tags.filter(t => t.isNew).length
      }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  })

  // AI-powered batch tag generation for entire library
  ipcMain.handle('aiTools:generateTagsAll', async (_ev, options?: { maxItems?: number; onlyUntagged?: boolean }) => {
    try {
      const maxItems = options?.maxItems ?? 500
      const onlyUntagged = options?.onlyUntagged ?? false

      let allMedia = db.listMedia({ limit: maxItems * 2 }).items

      if (onlyUntagged) {
        allMedia = allMedia.filter(m => {
          const tags = db.listMediaTags(m.id)
          return tags.length === 0
        })
      }

      allMedia = allMedia.slice(0, maxItems)
      const allLibraryTags = db.listTags().map(t => t.name)

      let totalApplied = 0
      let totalNewTags = 0
      let processed = 0

      for (const media of allMedia) {
        broadcast('aiTools:generateTagsProgress', {
          current: processed + 1,
          total: allMedia.length,
          filename: media.filename
        })

        try {
          const existingTags = db.listMediaTags(media.id).map(t => t.name)
          const result = await aiGenerateTags(media, existingTags, allLibraryTags)

          if (result.success) {
            for (const tag of result.tags) {
              if (tag.confidence >= 0.4) {
                db.addTagToMedia(media.id, tag.name)
                totalApplied++

                if (tag.isNew) {
                  db.raw.prepare(`UPDATE tags SET isAiGenerated = 1 WHERE name = ?`).run(tag.name)
                  totalNewTags++
                  // Add to library tags so subsequent items can use it
                  allLibraryTags.push(tag.name)
                }
              }
            }
          }
        } catch (e) {
          console.error(`[AI Tags] Failed for ${media.filename}:`, e)
        }

        processed++
      }

      broadcast('vault:changed')
      return {
        success: true,
        processed,
        tagsApplied: totalApplied,
        newTagsCreated: totalNewTags
      }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  })

  // AI-powered filename suggestion
  ipcMain.handle('aiTools:suggestFilename', async (_ev, mediaId: string) => {
    try {
      const media = db.getMedia(mediaId)
      if (!media) return { success: false, error: 'Media not found' }

      const tags = db.listMediaTags(mediaId).map(t => t.name)
      const result = await aiSuggestFilename(media, tags)

      return {
        success: result.success,
        currentName: media.filename,
        suggestedName: result.suggestedName,
        reason: result.reason
      }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  })

  // AI-powered batch file renaming
  ipcMain.handle('aiTools:renameAll', async (_ev, options?: { maxItems?: number }) => {
    try {
      const maxItems = options?.maxItems ?? 500
      const allMedia = db.listMedia({ limit: maxItems }).items

      console.log(`[AI Rename] Starting AI rename for ${allMedia.length} items`)

      const result = await aiBatchRename(
        allMedia,
        (mediaId) => db.listMediaTags(mediaId).map(t => t.name),
        async (mediaId, newName) => {
          const media = db.getMedia(mediaId)
          if (!media) {
            console.log(`[AI Rename] Media not found: ${mediaId}`)
            return false
          }

          const oldPath = media.path
          const dir = path.dirname(oldPath)
          const newPath = path.join(dir, newName)

          // Check if file exists
          if (!fs.existsSync(oldPath)) {
            console.log(`[AI Rename] File not found: ${oldPath}`)
            return false
          }

          // Check if new path already exists
          if (fs.existsSync(newPath) && newPath.toLowerCase() !== oldPath.toLowerCase()) {
            console.log(`[AI Rename] Target already exists: ${newPath}`)
            return false
          }

          // Rename the actual file on disk
          console.log(`[AI Rename] RENAMING FILE: ${oldPath} -> ${newPath}`)
          fs.renameSync(oldPath, newPath)

          // Update database with new path and filename
          const newFilename = path.basename(newPath, path.extname(newPath))
          db.updateMediaPath(mediaId, newPath, newFilename)
          console.log(`[AI Rename] SUCCESS: ${media.filename} -> ${newFilename}`)
          return true
        },
        (current, total, filename) => {
          broadcast('aiTools:renameProgress', { current, total, filename })
        }
      )

      broadcast('vault:changed')
      return {
        success: true,
        renamed: result.renamed,
        skipped: result.skipped,
        failed: result.failed,
        errors: result.errors.length > 0 ? result.errors : undefined
      }
    } catch (e: any) {
      console.error('[AI Rename] Error:', e)
      return { success: false, error: e.message }
    }
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // LICENSE & TIER MANAGEMENT
  // ═══════════════════════════════════════════════════════════════════════════
  ipcMain.handle('license:getTier', async () => {
    return getLicenseService().getTier()
  })

  ipcMain.handle('license:getLimits', async () => {
    return getLicenseService().getLimits()
  })

  ipcMain.handle('license:getInfo', async () => {
    return getLicenseService().getLicenseInfo()
  })

  ipcMain.handle('license:isPremium', async () => {
    return getLicenseService().isPremium()
  })

  ipcMain.handle('license:activate', async (_ev, key: string) => {
    const service = getLicenseService()
    const success = service.activateLicense(key)
    if (success) {
      broadcast('license:changed', service.getLicenseInfo())
    }
    return { success, tier: service.getTier() }
  })

  ipcMain.handle('license:hasFeature', async (_ev, feature: string) => {
    return getLicenseService().hasFeature(feature as keyof TierLimits)
  })

  ipcMain.handle('license:getLimit', async (_ev, feature: string) => {
    return getLicenseService().getLimit(feature as 'playlists' | 'goonWallTiles')
  })

  // Get machine ID for owner setup
  ipcMain.handle('license:getMachineId', async () => {
    return getLicenseService().getMyMachineId()
  })

  // Generate license keys (owner only)
  ipcMain.handle('license:generateKey', async () => {
    const service = getLicenseService()
    if (!service.isOwner()) {
      return { key: null, error: 'Not authorized' }
    }
    return { key: service.generateLicenseKey(), error: null }
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // AI CACHE MANAGEMENT
  // ═══════════════════════════════════════════════════════════════════════════
  ipcMain.handle('aiCache:getStats', async () => {
    const cache = getAICacheService()
    return cache.getStats()
  })

  ipcMain.handle('aiCache:clear', async (_ev, namespace?: string) => {
    const cache = getAICacheService()
    if (namespace) {
      return { cleared: cache.clearNamespace(namespace), namespace }
    }
    return { cleared: cache.clearAll(), namespace: 'all' }
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // SMART PLAYLISTS
  // ═══════════════════════════════════════════════════════════════════════════

  ipcMain.handle('smart-playlist:create', async (_ev, name: string, rules: any) => {
    try {
      const service = getSmartPlaylistService(db)
      const playlist = service.createSmartPlaylist(name, rules)
      const result = service.refreshPlaylist(playlist.id)
      return { ...playlist, itemCount: result.count }
    } catch (e: any) {
      console.error('[SmartPlaylist] Create error:', e)
      throw e
    }
  })

  ipcMain.handle('smart-playlist:update-rules', async (_ev, playlistId: string, rules: any) => {
    try {
      const service = getSmartPlaylistService(db)
      service.updateRules(playlistId, rules)
      return service.refreshPlaylist(playlistId)
    } catch (e: any) {
      console.error('[SmartPlaylist] Update rules error:', e)
      throw e
    }
  })

  ipcMain.handle('smart-playlist:refresh', async (_ev, playlistId: string) => {
    try {
      const service = getSmartPlaylistService(db)
      return service.refreshPlaylist(playlistId)
    } catch (e: any) {
      console.error('[SmartPlaylist] Refresh error:', e)
      throw e
    }
  })

  ipcMain.handle('smart-playlist:get-all', async () => {
    try {
      const service = getSmartPlaylistService(db)
      return service.getSmartPlaylists()
    } catch (e: any) {
      console.error('[SmartPlaylist] Get all error:', e)
      return []
    }
  })

  ipcMain.handle('smart-playlist:convert-to-smart', async (_ev, playlistId: string, rules: any) => {
    try {
      const service = getSmartPlaylistService(db)
      service.convertToSmart(playlistId, rules)
      return service.refreshPlaylist(playlistId)
    } catch (e: any) {
      console.error('[SmartPlaylist] Convert to smart error:', e)
      throw e
    }
  })

  ipcMain.handle('smart-playlist:convert-to-regular', async (_ev, playlistId: string) => {
    try {
      const service = getSmartPlaylistService(db)
      service.convertToRegular(playlistId)
      return { success: true }
    } catch (e: any) {
      console.error('[SmartPlaylist] Convert to regular error:', e)
      throw e
    }
  })

  ipcMain.handle('smart-playlist:get-presets', async () => {
    return SMART_PLAYLIST_PRESETS
  })

  ipcMain.handle('smart-playlist:create-from-preset', async (_ev, presetKey: string) => {
    try {
      const preset = SMART_PLAYLIST_PRESETS[presetKey as keyof typeof SMART_PLAYLIST_PRESETS]
      if (!preset) throw new Error(`Unknown preset: ${presetKey}`)
      const service = getSmartPlaylistService(db)
      const playlist = service.createSmartPlaylist(preset.name, preset.rules)
      const result = service.refreshPlaylist(playlist.id)
      return { ...playlist, itemCount: result.count }
    } catch (e: any) {
      console.error('[SmartPlaylist] Create from preset error:', e)
      throw e
    }
  })

  ipcMain.handle('smart-playlist:refresh-stale', async () => {
    try {
      const service = getSmartPlaylistService(db)
      return service.refreshStale()
    } catch (e: any) {
      console.error('[SmartPlaylist] Refresh stale error:', e)
      return { refreshed: 0, total: 0 }
    }
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // GLOBAL SEARCH
  // ═══════════════════════════════════════════════════════════════════════════

  ipcMain.handle('search:global', async (_ev, options: SearchOptions) => {
    try {
      const search = getGlobalSearchService(db)
      const results = search.search(options)
      // Save to history if it's a meaningful query
      if (options.query && options.query.length >= 3) {
        search.saveToHistory(options.query)
      }
      return results
    } catch (e: any) {
      console.error('[Search] Global search error:', e)
      return []
    }
  })

  ipcMain.handle('search:suggestions', async (_ev, query: string) => {
    try {
      const search = getGlobalSearchService(db)
      return search.getSuggestions(query)
    } catch (e: any) {
      console.error('[Search] Suggestions error:', e)
      return []
    }
  })

  ipcMain.handle('search:recent', async (_ev, limit?: number) => {
    try {
      const search = getGlobalSearchService(db)
      return search.getRecentSearches(limit)
    } catch (e: any) {
      console.error('[Search] Recent searches error:', e)
      return []
    }
  })

  ipcMain.handle('search:clear-history', async () => {
    try {
      const search = getGlobalSearchService(db)
      search.clearHistory()
      return { success: true }
    } catch (e: any) {
      console.error('[Search] Clear history error:', e)
      return { success: false }
    }
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // BATCH OPERATIONS
  // ═══════════════════════════════════════════════════════════════════════════

  ipcMain.handle('batch:add-tags', async (_ev, mediaIds: string[], tagNames: string[]) => {
    try {
      const batch = getBatchOperationsService(db)
      return batch.batchAddTags(mediaIds, tagNames, (progress) => {
        broadcast('batch:progress', progress)
      })
    } catch (e: any) {
      console.error('[Batch] Add tags error:', e)
      throw e
    }
  })

  ipcMain.handle('batch:remove-tags', async (_ev, mediaIds: string[], tagNames: string[]) => {
    try {
      const batch = getBatchOperationsService(db)
      return batch.batchRemoveTags(mediaIds, tagNames, (progress) => {
        broadcast('batch:progress', progress)
      })
    } catch (e: any) {
      console.error('[Batch] Remove tags error:', e)
      throw e
    }
  })

  ipcMain.handle('batch:set-rating', async (_ev, mediaIds: string[], rating: number) => {
    try {
      const batch = getBatchOperationsService(db)
      return batch.batchSetRating(mediaIds, rating, (progress) => {
        broadcast('batch:progress', progress)
      })
    } catch (e: any) {
      console.error('[Batch] Set rating error:', e)
      throw e
    }
  })

  ipcMain.handle('batch:delete', async (_ev, mediaIds: string[], deleteFiles: boolean) => {
    try {
      const batch = getBatchOperationsService(db)
      return batch.batchDelete(mediaIds, deleteFiles, (progress) => {
        broadcast('batch:progress', progress)
      })
    } catch (e: any) {
      console.error('[Batch] Delete error:', e)
      throw e
    }
  })

  ipcMain.handle('batch:add-to-playlist', async (_ev, mediaIds: string[], playlistId: string) => {
    try {
      const batch = getBatchOperationsService(db)
      return batch.batchAddToPlaylist(mediaIds, playlistId, (progress) => {
        broadcast('batch:progress', progress)
      })
    } catch (e: any) {
      console.error('[Batch] Add to playlist error:', e)
      throw e
    }
  })

  ipcMain.handle('batch:remove-from-playlist', async (_ev, mediaIds: string[], playlistId: string) => {
    try {
      const batch = getBatchOperationsService(db)
      return batch.batchRemoveFromPlaylist(mediaIds, playlistId, (progress) => {
        broadcast('batch:progress', progress)
      })
    } catch (e: any) {
      console.error('[Batch] Remove from playlist error:', e)
      throw e
    }
  })

  ipcMain.handle('batch:rename', async (_ev, mediaIds: string[], pattern: string) => {
    try {
      const batch = getBatchOperationsService(db)
      return batch.batchRename(mediaIds, pattern, (progress) => {
        broadcast('batch:progress', progress)
      })
    } catch (e: any) {
      console.error('[Batch] Rename error:', e)
      throw e
    }
  })

  ipcMain.handle('batch:move', async (_ev, mediaIds: string[], targetDir: string) => {
    try {
      const batch = getBatchOperationsService(db)
      return batch.batchMove(mediaIds, targetDir, (progress) => {
        broadcast('batch:progress', progress)
      })
    } catch (e: any) {
      console.error('[Batch] Move error:', e)
      throw e
    }
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // WATCH HISTORY & RECOMMENDATIONS
  // ═══════════════════════════════════════════════════════════════════════════

  ipcMain.handle('watch:start-session', async (_ev, mediaId: string) => {
    try {
      const history = getWatchHistoryService(db)
      return history.startSession(mediaId)
    } catch (e: any) {
      console.error('[Watch] Start session error:', e)
      throw e
    }
  })

  // Track last time we synced watch time to goon stats
  let lastWatchTimeSync = 0
  ipcMain.handle('watch:update-session', async (_ev, mediaId: string, currentTime: number, duration: number) => {
    try {
      const history = getWatchHistoryService(db)
      history.updateSession(mediaId, currentTime, duration)
      // Sync total watch time to goon stats every 60 seconds
      const now = Date.now()
      if (now - lastWatchTimeSync > 60000) {
        lastWatchTimeSync = now
        const watchStats = history.getStats()
        updateGoonStats({ totalWatchTime: watchStats.totalWatchTime })
      }
      return { success: true }
    } catch (e: any) {
      return { success: false }
    }
  })

  ipcMain.handle('watch:end-session', async (_ev, mediaId: string) => {
    try {
      const history = getWatchHistoryService(db)
      history.endSession(mediaId)
      // Update goon stats with total watch time from database
      const watchStats = history.getStats()
      updateGoonStats({ totalWatchTime: watchStats.totalWatchTime })
      return { success: true }
    } catch (e: any) {
      console.error('[Watch] End session error:', e)
      return { success: false }
    }
  })

  ipcMain.handle('watch:get-resume-position', async (_ev, mediaId: string) => {
    try {
      const history = getWatchHistoryService(db)
      return history.getResumePosition(mediaId)
    } catch (e: any) {
      return 0
    }
  })

  ipcMain.handle('watch:get-history', async (_ev, limit?: number) => {
    try {
      const history = getWatchHistoryService(db)
      return history.getRecentHistory(limit)
    } catch (e: any) {
      console.error('[Watch] Get history error:', e)
      return []
    }
  })

  // Rich variant used by RecentlyViewedStrip + WatchHistoryTimeline.
  // Returns media-joined rows so the renderer doesn't have to fan out.
  ipcMain.handle('watchHistory:list', async (_ev, opts?: { limit?: number; since?: number }) => {
    try {
      const history = getWatchHistoryService(db)
      return history.listWithMedia(opts ?? {})
    } catch (e: any) {
      console.error('[Watch] listWithMedia error:', e)
      return []
    }
  })

  ipcMain.handle('watch:get-stats', async () => {
    try {
      const history = getWatchHistoryService(db)
      return history.getStats()
    } catch (e: any) {
      console.error('[Watch] Get stats error:', e)
      return null
    }
  })

  ipcMain.handle('watch:get-recommendations', async (_ev, limit?: number) => {
    try {
      const history = getWatchHistoryService(db)
      return history.getRecommendations(limit)
    } catch (e: any) {
      console.error('[Watch] Get recommendations error:', e)
      return []
    }
  })

  ipcMain.handle('watch:get-continue-watching', async (_ev, limit?: number) => {
    try {
      const history = getWatchHistoryService(db)
      return history.getContinueWatching(limit)
    } catch (e: any) {
      console.error('[Watch] Get continue watching error:', e)
      return []
    }
  })

  ipcMain.handle('watch:clear-history', async (_ev, olderThanDays?: number) => {
    try {
      const history = getWatchHistoryService(db)
      const deleted = history.clearHistory(olderThanDays)
      return { success: true, deleted }
    } catch (e: any) {
      console.error('[Watch] Clear history error:', e)
      return { success: false, deleted: 0 }
    }
  })

  ipcMain.handle('watch:get-most-viewed', async (_ev, limit?: number) => {
    try {
      const history = getWatchHistoryService(db)
      return history.getMostViewed(limit)
    } catch (e: any) {
      console.error('[Watch] Get most viewed error:', e)
      return []
    }
  })

  // Get unwatched media - videos that haven't been viewed yet
  ipcMain.handle('watch:get-unwatched', async (_ev, options?: { limit?: number; type?: string }) => {
    try {
      const limit = options?.limit || 12
      const type = options?.type || 'video'
      // Get all media IDs that have watch history
      const watchedIds = db.raw.prepare(`
        SELECT DISTINCT mediaId FROM watch_sessions
      `).all().map((r: any) => r.mediaId)

      // Get media that hasn't been watched
      const query = type
        ? `SELECT * FROM media WHERE id NOT IN (${watchedIds.length > 0 ? watchedIds.map(() => '?').join(',') : "''"}) AND type = ? ORDER BY addedAt DESC LIMIT ?`
        : `SELECT * FROM media WHERE id NOT IN (${watchedIds.length > 0 ? watchedIds.map(() => '?').join(',') : "''"}) ORDER BY addedAt DESC LIMIT ?`

      const params = type ? [...watchedIds, type, limit] : [...watchedIds, limit]
      const rows = db.raw.prepare(query).all(...params)
      return rows
    } catch (e: any) {
      console.error('[Watch] Get unwatched error:', e)
      return []
    }
  })

  // Get daily picks - random selection that stays consistent for the day
  ipcMain.handle('watch:get-daily-picks', async (_ev, options?: { date?: string; limit?: number }) => {
    try {
      const date = options?.date || new Date().toISOString().split('T')[0]
      const limit = options?.limit || 8
      // Use date string as seed for deterministic random
      const seed = date.split('-').reduce((a, b) => a + parseInt(b), 0)

      // Get all video media
      const allMedia = db.raw.prepare(`
        SELECT * FROM media WHERE type = 'video' ORDER BY id
      `).all()

      if (allMedia.length === 0) return []

      // Seeded random shuffle
      const shuffled = [...allMedia]
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(((seed * (i + 1)) % 1000) / 1000 * (i + 1))
        ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
      }

      return shuffled.slice(0, limit)
    } catch (e: any) {
      console.error('[Watch] Get daily picks error:', e)
      return []
    }
  })

  // Get trending - most watched in the past N days
  ipcMain.handle('watch:get-trending', async (_ev, options?: { days?: number; limit?: number }) => {
    try {
      const days = options?.days || 7
      const limit = options?.limit || 12
      const cutoff = Date.now() - (days * 24 * 60 * 60 * 1000)

      const rows = db.raw.prepare(`
        SELECT mediaId as id, COUNT(*) as recentViews
        FROM watch_sessions
        WHERE startedAt > ?
        GROUP BY mediaId
        ORDER BY recentViews DESC
        LIMIT ?
      `).all(cutoff, limit)

      return rows
    } catch (e: any) {
      console.error('[Watch] Get trending error:', e)
      return []
    }
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // AUTO-ORGANIZE
  // ═══════════════════════════════════════════════════════════════════════════

  ipcMain.handle('organize:preview', async (_ev, targetDir: string, rules: OrganizeRule[], mediaIds?: string[]) => {
    try {
      const organize = getAutoOrganizeService(db)
      return organize.previewOrganize(targetDir, rules, mediaIds)
    } catch (e: any) {
      console.error('[Organize] Preview error:', e)
      throw e
    }
  })

  ipcMain.handle('organize:execute', async (_ev, previews: any[]) => {
    try {
      const organize = getAutoOrganizeService(db)
      return organize.executeOrganize(previews, (current, total) => {
        broadcast('organize:progress', { current, total })
      })
    } catch (e: any) {
      console.error('[Organize] Execute error:', e)
      throw e
    }
  })

  ipcMain.handle('organize:by-tags', async (_ev, targetDir: string, primaryTags: string[], mediaIds?: string[]) => {
    try {
      const organize = getAutoOrganizeService(db)
      return organize.organizeByTags(targetDir, primaryTags, mediaIds)
    } catch (e: any) {
      console.error('[Organize] By tags error:', e)
      throw e
    }
  })

  ipcMain.handle('organize:flatten', async (_ev, targetDir: string, mediaIds?: string[]) => {
    try {
      const organize = getAutoOrganizeService(db)
      return organize.flattenTo(targetDir, mediaIds)
    } catch (e: any) {
      console.error('[Organize] Flatten error:', e)
      throw e
    }
  })

  ipcMain.handle('organize:find-orphans', async (_ev, directories: string[]) => {
    try {
      const organize = getAutoOrganizeService(db)
      return organize.findOrphans(directories)
    } catch (e: any) {
      console.error('[Organize] Find orphans error:', e)
      return []
    }
  })

  ipcMain.handle('organize:get-presets', async () => {
    return ORGANIZE_PRESETS
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // PERFORMERS
  // ═══════════════════════════════════════════════════════════════════════════

  ipcMain.handle('performer:create', async (_ev, data: Partial<Performer>) => {
    try {
      const service = getPerformerService(db)
      return service.create(data)
    } catch (e: any) {
      console.error('[Performer] Create error:', e)
      throw e
    }
  })

  ipcMain.handle('performer:update', async (_ev, id: string, data: Partial<Performer>) => {
    try {
      const service = getPerformerService(db)
      return service.update(id, data)
    } catch (e: any) {
      console.error('[Performer] Update error:', e)
      throw e
    }
  })

  ipcMain.handle('performer:delete', async (_ev, id: string) => {
    try {
      const service = getPerformerService(db)
      return service.delete(id)
    } catch (e: any) {
      console.error('[Performer] Delete error:', e)
      throw e
    }
  })

  ipcMain.handle('performer:get', async (_ev, id: string) => {
    try {
      const service = getPerformerService(db)
      return service.getById(id)
    } catch (e: any) {
      return null
    }
  })

  ipcMain.handle('performer:search', async (_ev, query: string, limit?: number) => {
    try {
      const service = getPerformerService(db)
      return service.search(query, limit)
    } catch (e: any) {
      return []
    }
  })

  ipcMain.handle('performer:get-all', async (_ev, options?: any) => {
    try {
      const service = getPerformerService(db)
      return service.getAll(options)
    } catch (e: any) {
      return []
    }
  })

  ipcMain.handle('performer:get-favorites', async () => {
    try {
      const service = getPerformerService(db)
      return service.getFavorites()
    } catch (e: any) {
      return []
    }
  })

  ipcMain.handle('performer:link-media', async (_ev, performerId: string, mediaId: string, role?: string) => {
    try {
      const service = getPerformerService(db)
      service.linkToMedia(performerId, mediaId, role)
      return { success: true }
    } catch (e: any) {
      return { success: false }
    }
  })

  ipcMain.handle('performer:unlink-media', async (_ev, performerId: string, mediaId: string) => {
    try {
      const service = getPerformerService(db)
      service.unlinkFromMedia(performerId, mediaId)
      return { success: true }
    } catch (e: any) {
      return { success: false }
    }
  })

  ipcMain.handle('performer:get-for-media', async (_ev, mediaId: string) => {
    try {
      const service = getPerformerService(db)
      return service.getForMedia(mediaId)
    } catch (e: any) {
      return []
    }
  })

  ipcMain.handle('performer:get-media', async (_ev, performerId: string) => {
    try {
      const service = getPerformerService(db)
      return service.getMediaIds(performerId)
    } catch (e: any) {
      return []
    }
  })

  ipcMain.handle('performer:get-stats', async (_ev, performerId: string) => {
    try {
      const service = getPerformerService(db)
      return service.getStats(performerId)
    } catch (e: any) {
      return null
    }
  })

  ipcMain.handle('performer:detect-from-filename', async (_ev, filename: string) => {
    try {
      const service = getPerformerService(db)
      return service.detectFromFilename(filename)
    } catch (e: any) {
      return []
    }
  })

  ipcMain.handle('performer:merge', async (_ev, keepId: string, mergeId: string) => {
    try {
      const service = getPerformerService(db)
      return service.merge(keepId, mergeId)
    } catch (e: any) {
      return false
    }
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // COLLECTIONS
  // ═══════════════════════════════════════════════════════════════════════════

  ipcMain.handle('collection:create', async (_ev, data: any) => {
    try {
      const service = getCollectionService(db)
      return service.create(data)
    } catch (e: any) {
      console.error('[Collection] Create error:', e)
      throw e
    }
  })

  ipcMain.handle('collection:update', async (_ev, id: string, data: any) => {
    try {
      const service = getCollectionService(db)
      return service.update(id, data)
    } catch (e: any) {
      throw e
    }
  })

  ipcMain.handle('collection:delete', async (_ev, id: string) => {
    try {
      const service = getCollectionService(db)
      return service.delete(id)
    } catch (e: any) {
      return false
    }
  })

  ipcMain.handle('collection:get', async (_ev, id: string) => {
    try {
      const service = getCollectionService(db)
      return service.getById(id)
    } catch (e: any) {
      return null
    }
  })

  ipcMain.handle('collection:get-all', async (_ev, includePrivate?: boolean) => {
    try {
      const service = getCollectionService(db)
      return service.getAll(includePrivate ?? true)
    } catch (e: any) {
      return []
    }
  })

  ipcMain.handle('collection:add-media', async (_ev, collectionId: string, mediaIds: string[]) => {
    try {
      const service = getCollectionService(db)
      return service.addMedia(collectionId, mediaIds)
    } catch (e: any) {
      return 0
    }
  })

  ipcMain.handle('collection:remove-media', async (_ev, collectionId: string, mediaIds: string[]) => {
    try {
      const service = getCollectionService(db)
      return service.removeMedia(collectionId, mediaIds)
    } catch (e: any) {
      return 0
    }
  })

  ipcMain.handle('collection:get-media', async (_ev, collectionId: string) => {
    try {
      const service = getCollectionService(db)
      return service.getMediaIds(collectionId)
    } catch (e: any) {
      return []
    }
  })

  ipcMain.handle('collection:get-for-media', async (_ev, mediaId: string) => {
    try {
      const service = getCollectionService(db)
      return service.getCollectionsForMedia(mediaId)
    } catch (e: any) {
      return []
    }
  })

  ipcMain.handle('collection:reorder-items', async (_ev, collectionId: string, mediaIds: string[]) => {
    try {
      const service = getCollectionService(db)
      service.reorderItems(collectionId, mediaIds)
      return { success: true }
    } catch (e: any) {
      return { success: false }
    }
  })

  ipcMain.handle('collection:duplicate', async (_ev, id: string, newName?: string) => {
    try {
      const service = getCollectionService(db)
      return service.duplicate(id, newName)
    } catch (e: any) {
      return null
    }
  })

  ipcMain.handle('collection:merge', async (_ev, targetId: string, sourceId: string, deleteSource?: boolean) => {
    try {
      const service = getCollectionService(db)
      return service.merge(targetId, sourceId, deleteSource)
    } catch (e: any) {
      return false
    }
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // SLIDESHOW
  // ═══════════════════════════════════════════════════════════════════════════

  ipcMain.handle('slideshow:configure', async (_ev, config: Partial<SlideshowConfig>) => {
    try {
      const service = getSlideshowService(db)
      return service.configure(config)
    } catch (e: any) {
      throw e
    }
  })

  ipcMain.handle('slideshow:get-config', async () => {
    try {
      const service = getSlideshowService(db)
      return service.getConfig()
    } catch (e: any) {
      return null
    }
  })

  ipcMain.handle('slideshow:build-playlist', async (_ev, options?: any) => {
    try {
      const service = getSlideshowService(db)
      return service.buildPlaylist(options)
    } catch (e: any) {
      return []
    }
  })

  ipcMain.handle('slideshow:get-state', async () => {
    try {
      const service = getSlideshowService(db)
      return service.getState()
    } catch (e: any) {
      return null
    }
  })

  ipcMain.handle('slideshow:start', async () => {
    try {
      const service = getSlideshowService(db)
      return service.start()
    } catch (e: any) {
      return null
    }
  })

  ipcMain.handle('slideshow:pause', async () => {
    try {
      const service = getSlideshowService(db)
      return service.pause()
    } catch (e: any) {
      return null
    }
  })

  ipcMain.handle('slideshow:resume', async () => {
    try {
      const service = getSlideshowService(db)
      return service.resume()
    } catch (e: any) {
      return null
    }
  })

  ipcMain.handle('slideshow:stop', async () => {
    try {
      const service = getSlideshowService(db)
      return service.stop()
    } catch (e: any) {
      return null
    }
  })

  ipcMain.handle('slideshow:next', async () => {
    try {
      const service = getSlideshowService(db)
      return service.next()
    } catch (e: any) {
      return null
    }
  })

  ipcMain.handle('slideshow:previous', async () => {
    try {
      const service = getSlideshowService(db)
      return service.previous()
    } catch (e: any) {
      return null
    }
  })

  ipcMain.handle('slideshow:go-to', async (_ev, index: number) => {
    try {
      const service = getSlideshowService(db)
      return service.goTo(index)
    } catch (e: any) {
      return null
    }
  })

  ipcMain.handle('slideshow:get-timing', async () => {
    try {
      const service = getSlideshowService(db)
      return service.getTimingForCurrent()
    } catch (e: any) {
      return null
    }
  })

  ipcMain.handle('slideshow:get-presets', async () => {
    return SLIDESHOW_PRESETS
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // BACKUP & RESTORE
  // ═══════════════════════════════════════════════════════════════════════════

  ipcMain.handle('backup:create', async (_ev, options?: Partial<BackupOptions>) => {
    try {
      const service = getBackupRestoreService(db)
      return service.createBackup(options)
    } catch (e: any) {
      console.error('[Backup] Create error:', e)
      throw e
    }
  })

  ipcMain.handle('backup:list', async () => {
    try {
      const service = getBackupRestoreService(db)
      return service.listBackups()
    } catch (e: any) {
      return []
    }
  })

  ipcMain.handle('backup:restore', async (_ev, backupPath: string, options?: Partial<RestoreOptions>) => {
    try {
      const service = getBackupRestoreService(db)
      return service.restoreBackup(backupPath, options)
    } catch (e: any) {
      console.error('[Backup] Restore error:', e)
      return { success: false, restored: { media: 0, tags: 0, playlists: 0 }, errors: [e.message] }
    }
  })

  ipcMain.handle('backup:delete', async (_ev, backupPath: string) => {
    try {
      const service = getBackupRestoreService(db)
      return service.deleteBackup(backupPath)
    } catch (e: any) {
      return false
    }
  })

  ipcMain.handle('backup:export', async (_ev, exportPath: string, options?: Partial<BackupOptions>) => {
    try {
      const service = getBackupRestoreService(db)
      return service.exportTo(exportPath, options)
    } catch (e: any) {
      throw e
    }
  })

  ipcMain.handle('backup:import', async (_ev, importPath: string, options?: Partial<RestoreOptions>) => {
    try {
      const service = getBackupRestoreService(db)
      return service.importFrom(importPath, options)
    } catch (e: any) {
      return { success: false, restored: { media: 0, tags: 0, playlists: 0 }, errors: [e.message] }
    }
  })

  ipcMain.handle('backup:get-dir', async () => {
    try {
      const service = getBackupRestoreService(db)
      return service.getBackupDir()
    } catch (e: any) {
      return null
    }
  })

  ipcMain.handle('backup:cleanup', async (_ev, keepCount?: number) => {
    try {
      const service = getBackupRestoreService(db)
      return service.cleanupOldBackups(keepCount)
    } catch (e: any) {
      return 0
    }
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // DLNA TV STREAMING
  // ═══════════════════════════════════════════════════════════════════════════

  // Start scanning for DLNA devices
  ipcMain.handle('dlna:startDiscovery', async () => {
    try {
      const dlna = getDLNAService()
      await dlna.startDiscovery()
      return { success: true }
    } catch (e: any) {
      console.error('[DLNA] Discovery error:', e)
      return { success: false, error: e.message }
    }
  })

  // Stop scanning
  ipcMain.handle('dlna:stopDiscovery', async () => {
    try {
      const dlna = getDLNAService()
      dlna.stopDiscovery()
      return { success: true }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  })

  // Get discovered devices
  ipcMain.handle('dlna:getDevices', async () => {
    try {
      const dlna = getDLNAService()
      return dlna.getDevices()
    } catch (e: any) {
      console.error('[DLNA] Get devices error:', e)
      return []
    }
  })

  // Connect to device manually by IP
  ipcMain.handle('dlna:connectManual', async (_ev, ip: string) => {
    try {
      const dlna = getDLNAService()
      return await dlna.connectManual(ip)
    } catch (e: any) {
      console.error('[DLNA] Manual connect error:', e)
      return false
    }
  })

  // Select a device (set as active without casting)
  ipcMain.handle('dlna:selectDevice', async (_ev, deviceId: string) => {
    try {
      const dlna = getDLNAService()
      return dlna.selectDevice(deviceId)
    } catch (e: any) {
      console.error('[DLNA] Select device error:', e)
      return false
    }
  })

  // Cast media to device
  ipcMain.handle('dlna:cast', async (_ev, deviceId: string, mediaPath: string, options?: {
    title?: string
    type?: 'video' | 'image'
    autoplay?: boolean
    startPosition?: number
  }) => {
    try {
      const dlna = getDLNAService()
      await dlna.cast(deviceId, mediaPath, options)
      return { success: true }
    } catch (e: any) {
      console.error('[DLNA] Cast error:', e)
      return { success: false, error: e.message }
    }
  })

  // Playback controls
  ipcMain.handle('dlna:play', async () => {
    try {
      const dlna = getDLNAService()
      await dlna.play()
      return { success: true }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  })

  ipcMain.handle('dlna:pause', async () => {
    try {
      const dlna = getDLNAService()
      await dlna.pause()
      return { success: true }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  })

  ipcMain.handle('dlna:stop', async () => {
    try {
      const dlna = getDLNAService()
      await dlna.stop()
      return { success: true }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  })

  ipcMain.handle('dlna:seek', async (_ev, position: number) => {
    try {
      const dlna = getDLNAService()
      await dlna.seek(position)
      return { success: true }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  })

  ipcMain.handle('dlna:setVolume', async (_ev, volume: number) => {
    try {
      const dlna = getDLNAService()
      await dlna.setVolume(volume)
      return { success: true }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  })

  // Get playback status
  ipcMain.handle('dlna:getStatus', async () => {
    try {
      const dlna = getDLNAService()
      return await dlna.getPlaybackStatus()
    } catch (e: any) {
      return {
        deviceId: '',
        state: 'idle' as const,
        currentTime: 0,
        duration: 0,
        volume: 1,
        muted: false,
        mediaPath: null
      }
    }
  })

  // Check if currently casting
  ipcMain.handle('dlna:isCasting', async () => {
    try {
      const dlna = getDLNAService()
      return dlna.isCasting()
    } catch {
      return false
    }
  })

  // Get active device
  ipcMain.handle('dlna:getActiveDevice', async () => {
    try {
      const dlna = getDLNAService()
      return dlna.getActiveDevice()
    } catch {
      return null
    }
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // DLNA QUEUE MANAGEMENT
  // ═══════════════════════════════════════════════════════════════════════════

  // Set entire queue
  ipcMain.handle('dlna:setQueue', async (_ev, items: Array<{
    mediaId: string
    path: string
    title: string
    duration?: number
  }>) => {
    try {
      const dlna = getDLNAService()
      await dlna.setQueue(items)
      return { success: true }
    } catch (e: any) {
      console.error('[DLNA] Set queue error:', e)
      return { success: false, error: e.message }
    }
  })

  // Add item to queue
  ipcMain.handle('dlna:addToQueue', async (_ev, item: {
    mediaId: string
    path: string
    title: string
    duration?: number
  }) => {
    try {
      const dlna = getDLNAService()
      await dlna.addToQueue(item)
      return { success: true }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  })

  // Clear queue
  ipcMain.handle('dlna:clearQueue', async () => {
    try {
      const dlna = getDLNAService()
      dlna.clearQueue()
      return { success: true }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  })

  // Get queue state
  ipcMain.handle('dlna:getQueue', async () => {
    try {
      const dlna = getDLNAService()
      return dlna.getQueueState()
    } catch (e: any) {
      console.error('[DLNA] Get queue error:', e)
      return {
        items: [],
        currentIndex: -1,
        shuffleEnabled: false,
        repeatMode: 'none',
        originalOrder: [],
        currentItem: null
      }
    }
  })

  // Play next item
  ipcMain.handle('dlna:playNext', async () => {
    try {
      const dlna = getDLNAService()
      const success = await dlna.playNext()
      return { success }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  })

  // Play previous item
  ipcMain.handle('dlna:playPrevious', async () => {
    try {
      const dlna = getDLNAService()
      const success = await dlna.playPrevious()
      return { success }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  })

  // Play at specific index
  ipcMain.handle('dlna:playAtIndex', async (_ev, index: number) => {
    try {
      const dlna = getDLNAService()
      const success = await dlna.playAtIndex(index)
      return { success }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  })

  // Toggle shuffle
  ipcMain.handle('dlna:setShuffle', async (_ev, enabled: boolean) => {
    try {
      const dlna = getDLNAService()
      dlna.setShuffle(enabled)
      return { success: true }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  })

  // Set repeat mode
  ipcMain.handle('dlna:setRepeat', async (_ev, mode: 'none' | 'one' | 'all') => {
    try {
      const dlna = getDLNAService()
      dlna.setRepeat(mode)
      return { success: true }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  })

  // Reorder queue
  ipcMain.handle('dlna:reorderQueue', async (_ev, fromIndex: number, toIndex: number) => {
    try {
      const dlna = getDLNAService()
      dlna.reorderQueue(fromIndex, toIndex)
      return { success: true }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  })

  // Remove from queue
  ipcMain.handle('dlna:removeFromQueue', async (_ev, index: number) => {
    try {
      const dlna = getDLNAService()
      dlna.removeFromQueue(index)
      return { success: true }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  })

  // Set up DLNA event forwarding to renderer
  try {
    const dlnaService = getDLNAService()
    dlnaService.on('deviceFound', (device: any) => {
      broadcast('dlna:deviceFound', device)
    })
    dlnaService.on('statusUpdate', (status: any) => {
      broadcast('dlna:statusUpdate', status)
    })
    dlnaService.on('discoveryStarted', () => {
      broadcast('dlna:discoveryStarted')
    })
    dlnaService.on('discoveryStopped', () => {
      broadcast('dlna:discoveryStopped')
    })
    dlnaService.on('queueUpdated', (queue: any) => {
      broadcast('dlna:queueUpdated', queue)
    })
    dlnaService.on('queueEnded', () => {
      broadcast('dlna:queueEnded')
    })
  } catch (e) {
    console.warn('[DLNA] Failed to set up event listeners:', e)
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // HARDWARE ENCODER DETECTION & SETTINGS
  // ═══════════════════════════════════════════════════════════════════════════

  // Detect available hardware encoders
  ipcMain.handle('encoder:detect', async () => {
    try {
      const encoders = await detectHardwareEncoders()
      return { success: true, encoders }
    } catch (error: any) {
      console.error('[Encoder] Detection failed:', error)
      return { success: false, error: error?.message, encoders: [] }
    }
  })

  // Get cached encoder list
  ipcMain.handle('encoder:getEncoders', async () => {
    return getEncoders()
  })

  // Get preferred encoder
  ipcMain.handle('encoder:getPreferred', async () => {
    return getPreferredEncoder()
  })

  // Set preferred encoder
  ipcMain.handle('encoder:setPreferred', async (_ev, encoder: HardwareEncoder) => {
    try {
      setPreferredEncoder(encoder)
      return { success: true }
    } catch (error: any) {
      return { success: false, error: error?.message }
    }
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // ERROR LOGGING - Persistent log management
  // ═══════════════════════════════════════════════════════════════════════════
  ipcMain.handle('logs:getRecent', async (_ev, limit?: number) => {
    return errorLogger.getRecentLogs(limit ?? 100)
  })

  ipcMain.handle('logs:getErrors', async (_ev, limit?: number) => {
    return errorLogger.getRecentErrors(limit ?? 50)
  })

  ipcMain.handle('logs:getLogFilePath', async () => {
    return errorLogger.getLogFilePath()
  })

  ipcMain.handle('logs:getContent', async () => {
    return errorLogger.getLogFileContent()
  })

  ipcMain.handle('logs:clear', async () => {
    return errorLogger.clearLogs()
  })

  ipcMain.handle('logs:log', async (_ev, level: 'info' | 'warn' | 'error', source: string, message: string, meta?: Record<string, unknown>) => {
    if (level === 'error') {
      errorLogger.error(source, message, undefined, meta)
    } else if (level === 'warn') {
      errorLogger.warn(source, message, meta)
    } else {
      errorLogger.info(source, message, meta)
    }
    return { success: true }
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // SCHEDULED TASKS - Auto-scan, auto-backup, cleanup scheduling
  // ═══════════════════════════════════════════════════════════════════════════
  ipcMain.handle('scheduler:getTasks', async () => {
    const service = getScheduledTasksService(db)
    return service.getTasks()
  })

  ipcMain.handle('scheduler:getTask', async (_ev, taskId: string) => {
    const service = getScheduledTasksService(db)
    return service.getTask(taskId)
  })

  ipcMain.handle('scheduler:updateTask', async (_ev, taskId: string, updates: Partial<ScheduledTask>) => {
    const service = getScheduledTasksService(db)
    return service.updateTask(taskId, updates)
  })

  ipcMain.handle('scheduler:createTask', async (_ev, task: Omit<ScheduledTask, 'id' | 'createdAt'>) => {
    const service = getScheduledTasksService(db)
    return service.createTask(task)
  })

  ipcMain.handle('scheduler:deleteTask', async (_ev, taskId: string) => {
    const service = getScheduledTasksService(db)
    return service.deleteTask(taskId)
  })

  ipcMain.handle('scheduler:runTask', async (_ev, taskId: string) => {
    const service = getScheduledTasksService(db)
    return service.runTask(taskId)
  })

  ipcMain.handle('scheduler:isRunning', async (_ev, taskId: string) => {
    const service = getScheduledTasksService(db)
    return service.isRunning(taskId)
  })

  ipcMain.handle('scheduler:getHistory', async (_ev, limit?: number) => {
    const service = getScheduledTasksService(db)
    return service.getHistory(limit)
  })

  ipcMain.handle('scheduler:start', async () => {
    const service = getScheduledTasksService(db)
    service.start()
    return { success: true }
  })

  ipcMain.handle('scheduler:stop', async () => {
    const service = getScheduledTasksService(db)
    service.stop()
    return { success: true }
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // SIMILAR CONTENT - Perceptual hashing & duplicate detection
  // ═══════════════════════════════════════════════════════════════════════════
  ipcMain.handle('similar:find', async (_ev, mediaId: string, options?: { minSimilarity?: number; limit?: number; sameTypeOnly?: boolean }) => {
    const service = getSimilarContentService(db)
    return service.findSimilar(mediaId, options)
  })

  ipcMain.handle('similar:findAllGroups', async (_ev, options?: { minSimilarity?: number; minGroupSize?: number }) => {
    const service = getSimilarContentService(db)
    return service.findAllSimilarGroups(options)
  })

  ipcMain.handle('similar:findDuplicates', async () => {
    const service = getSimilarContentService(db)
    return service.findExactDuplicates()
  })

  ipcMain.handle('similar:moreLikeThis', async (_ev, mediaId: string, limit?: number) => {
    const service = getSimilarContentService(db)
    return service.getMoreLikeThis(mediaId, limit)
  })

  ipcMain.handle('similar:getStats', async () => {
    const service = getSimilarContentService(db)
    return service.getDuplicateStats()
  })

  // Visual similarity hash computation
  ipcMain.handle('similar:computeHash', async (_ev, mediaId: string) => {
    const { getVisualSimilarityService } = await import('./services/visual-similarity')
    const service = getVisualSimilarityService(db)
    return service.updateHash(mediaId)
  })

  ipcMain.handle('similar:batchComputeHashes', async (_ev, limit?: number) => {
    const { getVisualSimilarityService } = await import('./services/visual-similarity')
    const service = getVisualSimilarityService(db)
    return service.batchComputeHashes(limit ?? 50)
  })

  ipcMain.handle('similar:getHashStats', async () => {
    const { getVisualSimilarityService } = await import('./services/visual-similarity')
    const service = getVisualSimilarityService(db)
    return service.getStats()
  })

  ipcMain.handle('similar:getUnhashed', async (_ev, limit?: number) => {
    const { getVisualSimilarityService } = await import('./services/visual-similarity')
    const service = getVisualSimilarityService(db)
    return service.getUnhashed(limit ?? 100)
  })

  ipcMain.handle('similar:compare', async (_ev, mediaId1: string, mediaId2: string) => {
    const { getVisualSimilarityService } = await import('./services/visual-similarity')
    const service = getVisualSimilarityService(db)
    return service.compareMedia(mediaId1, mediaId2)
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // MEDIA INFO - Detailed ffprobe analysis
  // ═══════════════════════════════════════════════════════════════════════════
  ipcMain.handle('mediaInfo:get', async (_ev, filePath: string) => {
    const service = getMediaInfoService(db)
    return service.getInfo(filePath)
  })

  ipcMain.handle('mediaInfo:getById', async (_ev, mediaId: string) => {
    const service = getMediaInfoService(db)
    return service.getInfoById(mediaId)
  })

  ipcMain.handle('mediaInfo:batchGet', async (_ev, mediaIds: string[]) => {
    const service = getMediaInfoService(db)
    const result = await service.batchGetInfo(mediaIds)
    // Convert Map to object for IPC
    return Object.fromEntries(result)
  })

  ipcMain.handle('mediaInfo:getQualityStats', async () => {
    const service = getMediaInfoService(db)
    return service.getQualityStats()
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // KEYBOARD SHORTCUTS - Global hotkey management
  // ═══════════════════════════════════════════════════════════════════════════
  ipcMain.handle('shortcuts:getAll', async () => {
    const service = getKeyboardShortcutsService()
    return service.getShortcuts()
  })

  ipcMain.handle('shortcuts:getByCategory', async (_ev, category: ShortcutAction['category']) => {
    const service = getKeyboardShortcutsService()
    return service.getShortcutsByCategory(category)
  })

  ipcMain.handle('shortcuts:get', async (_ev, id: string) => {
    const service = getKeyboardShortcutsService()
    return service.getShortcut(id)
  })

  ipcMain.handle('shortcuts:update', async (_ev, id: string, newKey: string) => {
    const service = getKeyboardShortcutsService()
    try {
      const result = service.updateShortcut(id, newKey)
      return { success: true, shortcut: result }
    } catch (error: any) {
      return { success: false, error: error?.message }
    }
  })

  ipcMain.handle('shortcuts:toggle', async (_ev, id: string, enabled: boolean) => {
    const service = getKeyboardShortcutsService()
    return service.toggleShortcut(id, enabled)
  })

  ipcMain.handle('shortcuts:reset', async (_ev, id: string) => {
    const service = getKeyboardShortcutsService()
    return service.resetShortcut(id)
  })

  ipcMain.handle('shortcuts:resetAll', async () => {
    const service = getKeyboardShortcutsService()
    service.resetAll()
    return { success: true }
  })

  ipcMain.handle('shortcuts:setGlobalEnabled', async (_ev, enabled: boolean) => {
    const service = getKeyboardShortcutsService()
    service.setGlobalEnabled(enabled)
    return { success: true }
  })

  ipcMain.handle('shortcuts:isGlobalEnabled', async () => {
    const service = getKeyboardShortcutsService()
    return service.isGlobalEnabled()
  })

  ipcMain.handle('shortcuts:getKeyboardMap', async () => {
    const service = getKeyboardShortcutsService()
    return service.getKeyboardMap()
  })

  ipcMain.handle('shortcuts:export', async () => {
    const service = getKeyboardShortcutsService()
    return service.exportConfig()
  })

  ipcMain.handle('shortcuts:import', async (_ev, config: Partial<ShortcutConfig>) => {
    const service = getKeyboardShortcutsService()
    service.importConfig(config)
    return { success: true }
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // FILE WATCHER - Real-time directory monitoring
  // ═══════════════════════════════════════════════════════════════════════════
  ipcMain.handle('watcher:watchDirectory', async (_ev, dirPath: string, options?: { recursive?: boolean; autoImport?: boolean }) => {
    const service = getFileWatcherService()
    const result = service.watchDirectory(dirPath, options)
    return result
  })

  ipcMain.handle('watcher:unwatchDirectory', async (_ev, dirPath: string) => {
    const service = getFileWatcherService()
    return service.unwatchDirectory(dirPath)
  })

  ipcMain.handle('watcher:toggleDirectory', async (_ev, dirPath: string, enabled: boolean) => {
    const service = getFileWatcherService()
    return service.toggleDirectory(dirPath, enabled)
  })

  ipcMain.handle('watcher:getWatchedDirectories', async () => {
    const service = getFileWatcherService()
    return service.getWatchedDirectories()
  })

  ipcMain.handle('watcher:isWatching', async (_ev, dirPath: string) => {
    const service = getFileWatcherService()
    return service.isWatching(dirPath)
  })

  ipcMain.handle('watcher:scanDirectory', async (_ev, dirPath: string) => {
    const service = getFileWatcherService()
    return service.scanDirectory(dirPath)
  })

  ipcMain.handle('watcher:getStats', async () => {
    const service = getFileWatcherService()
    return service.getStats()
  })

  ipcMain.handle('watcher:stopAll', async () => {
    const service = getFileWatcherService()
    service.stopAll()
    return { success: true }
  })

  ipcMain.handle('watcher:restartAll', async () => {
    const service = getFileWatcherService()
    service.restartAll()
    return { success: true }
  })

  // Set up file watcher event forwarding
  const fileWatcher = getFileWatcherService()
  fileWatcher.on('newMediaFile', (event: any) => {
    broadcast('watcher:newFile', event)
  })
  fileWatcher.on('mediaFileRemoved', (event: any) => {
    broadcast('watcher:fileRemoved', event)
  })
  fileWatcher.on('filesChanged', (events: any[]) => {
    broadcast('watcher:filesChanged', events)
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // ADVANCED STATS - Deep analytics and insights
  // ═══════════════════════════════════════════════════════════════════════════
  ipcMain.handle('advancedStats:getStorage', async () => {
    const service = getAdvancedStatsService(db)
    return service.getStorageStats()
  })

  ipcMain.handle('advancedStats:getQuality', async () => {
    const service = getAdvancedStatsService(db)
    return service.getQualityBreakdown()
  })

  ipcMain.handle('advancedStats:getDuration', async () => {
    const service = getAdvancedStatsService(db)
    return service.getDurationStats()
  })

  ipcMain.handle('advancedStats:getTags', async () => {
    const service = getAdvancedStatsService(db)
    return service.getTagStats()
  })

  ipcMain.handle('advancedStats:getActivity', async () => {
    const service = getAdvancedStatsService(db)
    return service.getActivityStats()
  })

  ipcMain.handle('advancedStats:getGrowth', async () => {
    const service = getAdvancedStatsService(db)
    return service.getGrowthStats()
  })

  ipcMain.handle('advancedStats:getHealth', async () => {
    const service = getAdvancedStatsService(db)
    return service.getLibraryHealth()
  })

  ipcMain.handle('advancedStats:getDashboard', async () => {
    const service = getAdvancedStatsService(db)
    return service.getDashboardStats()
  })

  ipcMain.handle('advancedStats:getTimeRange', async (_ev, startDate: number, endDate: number) => {
    const service = getAdvancedStatsService(db)
    return service.getTimeRangeStats(startDate, endDate)
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // QUICK ACTIONS - Context menu actions
  // ═══════════════════════════════════════════════════════════════════════════
  ipcMain.handle('quickActions:getAll', async () => {
    const service = getQuickActionsService(db)
    return service.getActions()
  })

  ipcMain.handle('quickActions:getForContext', async (_ev, context: { type: string; count: number }) => {
    const service = getQuickActionsService(db)
    return service.getActionsForContext(context as any)
  })

  ipcMain.handle('quickActions:getByCategory', async (_ev, category: string) => {
    const service = getQuickActionsService(db)
    return service.getActionsByCategory(category as any)
  })

  ipcMain.handle('quickActions:execute', async (_ev, actionId: string, context: ActionContext) => {
    const service = getQuickActionsService(db)
    return service.executeAction(actionId, context)
  })

  ipcMain.handle('quickActions:toggle', async (_ev, actionId: string, enabled: boolean) => {
    const service = getQuickActionsService(db)
    return service.toggleAction(actionId, enabled)
  })

  ipcMain.handle('quickActions:addCustom', async (_ev, action: any) => {
    const service = getQuickActionsService(db)
    return service.addCustomAction(action)
  })

  ipcMain.handle('quickActions:removeCustom', async (_ev, actionId: string) => {
    const service = getQuickActionsService(db)
    return service.removeCustomAction(actionId)
  })

  ipcMain.handle('quickActions:getShortcutMap', async () => {
    const service = getQuickActionsService(db)
    return service.getShortcutMap()
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // VIEW PRESETS - Save and load view configurations
  // ═══════════════════════════════════════════════════════════════════════════
  ipcMain.handle('viewPresets:getAll', async () => {
    const service = getViewPresetsService(db)
    return service.getPresets()
  })

  ipcMain.handle('viewPresets:getBuiltin', async () => {
    const service = getViewPresetsService(db)
    return service.getBuiltinPresets()
  })

  ipcMain.handle('viewPresets:getCustom', async () => {
    const service = getViewPresetsService(db)
    return service.getCustomPresets()
  })

  ipcMain.handle('viewPresets:get', async (_ev, id: string) => {
    const service = getViewPresetsService(db)
    return service.getPreset(id)
  })

  ipcMain.handle('viewPresets:getActive', async () => {
    const service = getViewPresetsService(db)
    return service.getActivePreset()
  })

  ipcMain.handle('viewPresets:setActive', async (_ev, id: string | null) => {
    const service = getViewPresetsService(db)
    const result = service.setActivePreset(id)
    broadcast('vault:changed')
    return result
  })

  ipcMain.handle('viewPresets:create', async (_ev, preset: any) => {
    const service = getViewPresetsService(db)
    const result = service.createPreset(preset)
    broadcast('vault:changed')
    return result
  })

  ipcMain.handle('viewPresets:update', async (_ev, id: string, updates: any) => {
    const service = getViewPresetsService(db)
    const result = service.updatePreset(id, updates)
    broadcast('vault:changed')
    return result
  })

  ipcMain.handle('viewPresets:delete', async (_ev, id: string) => {
    const service = getViewPresetsService(db)
    const result = service.deletePreset(id)
    broadcast('vault:changed')
    return result
  })

  ipcMain.handle('viewPresets:duplicate', async (_ev, id: string, newName?: string) => {
    const service = getViewPresetsService(db)
    const result = service.duplicatePreset(id, newName)
    broadcast('vault:changed')
    return result
  })

  ipcMain.handle('viewPresets:saveCurrent', async (_ev, name: string, sort: any, filters: ViewFilters, view: ViewConfig) => {
    const service = getViewPresetsService(db)
    const result = service.saveCurrentAsPreset(name, sort, filters, view)
    broadcast('vault:changed')
    return result
  })

  ipcMain.handle('viewPresets:getCount', async (_ev, id: string) => {
    const service = getViewPresetsService(db)
    return service.getPresetCount(id)
  })

  ipcMain.handle('viewPresets:export', async () => {
    const service = getViewPresetsService(db)
    return service.exportPresets()
  })

  ipcMain.handle('viewPresets:import', async (_ev, presets: any[], overwrite?: boolean) => {
    const service = getViewPresetsService(db)
    return service.importPresets(presets, overwrite)
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // MEDIA COMPARE - Side-by-side comparison
  // ═══════════════════════════════════════════════════════════════════════════
  ipcMain.handle('mediaCompare:compare', async (_ev, mediaIds: string[], options?: CompareOptions) => {
    const service = getMediaCompareService(db)
    return service.compare(mediaIds, options)
  })

  ipcMain.handle('mediaCompare:quick', async (_ev, id1: string, id2: string) => {
    const service = getMediaCompareService(db)
    return service.quickCompare(id1, id2)
  })

  ipcMain.handle('mediaCompare:findDuplicates', async (_ev, mediaId: string, limit?: number) => {
    const service = getMediaCompareService(db)
    return service.findDuplicateCandidates(mediaId, limit)
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // EXPORT SERVICE - Export media and playlists
  // ═══════════════════════════════════════════════════════════════════════════
  ipcMain.handle('export:media', async (_ev, mediaIds: string[], options: ExportOptions) => {
    const service = getExportService(db)
    return service.exportMedia(mediaIds, options)
  })

  ipcMain.handle('export:playlist', async (_ev, playlistId: string, options: PlaylistExportOptions, destination: string) => {
    const service = getExportService(db)
    return service.exportPlaylist(playlistId, options, destination)
  })

  ipcMain.handle('export:libraryData', async (_ev, destination: string, options?: any) => {
    const service = getExportService(db)
    return service.exportLibraryData(destination, options)
  })

  ipcMain.handle('export:cancel', async () => {
    const service = getExportService(db)
    service.cancel()
    return { success: true }
  })

  ipcMain.handle('export:isInProgress', async () => {
    const service = getExportService(db)
    return service.isInProgress()
  })

  ipcMain.handle('export:getProgress', async () => {
    const service = getExportService(db)
    return service.getProgress()
  })

  // Set up export event forwarding
  const exportService = getExportService(db)
  exportService.on('progress', (progress: any) => {
    broadcast('export:progress', progress)
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // METADATA EXTRACTOR - Extract and analyze file metadata
  // ═══════════════════════════════════════════════════════════════════════════
  ipcMain.handle('metadata:extractVideo', async (_ev, filePath: string) => {
    const service = getMetadataExtractorService(db)
    return service.extractVideoMetadata(filePath)
  })

  ipcMain.handle('metadata:extractImage', async (_ev, filePath: string) => {
    const service = getMetadataExtractorService(db)
    return service.extractImageMetadata(filePath)
  })

  ipcMain.handle('metadata:extract', async (_ev, filePath: string) => {
    const service = getMetadataExtractorService(db)
    return service.extractMetadata(filePath)
  })

  ipcMain.handle('metadata:getById', async (_ev, mediaId: string) => {
    const service = getMetadataExtractorService(db)
    return service.getMetadataById(mediaId)
  })

  ipcMain.handle('metadata:syncToDb', async (_ev, mediaId: string) => {
    const service = getMetadataExtractorService(db)
    return service.syncToDatabase(mediaId)
  })

  ipcMain.handle('metadata:batchSync', async (_ev, mediaIds: string[]) => {
    const service = getMetadataExtractorService(db)
    return service.batchSync(mediaIds)
  })

  ipcMain.handle('metadata:getMissing', async () => {
    const service = getMetadataExtractorService(db)
    return service.getMissingMetadata()
  })

  ipcMain.handle('metadata:getCodecInfo', async (_ev, codec: string) => {
    const service = getMetadataExtractorService(db)
    return service.getCodecInfo(codec)
  })

  ipcMain.handle('metadata:calculateQuality', async (_ev, mediaId: string) => {
    const service = getMetadataExtractorService(db)
    const metadata = await service.extractVideoMetadata(
      (db.raw.prepare('SELECT path FROM media WHERE id = ?').get(mediaId) as any)?.path
    )
    if (!metadata) return null
    return service.calculateQualityScore(metadata)
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // SCENE DETECTION - Detect scene changes and generate chapters
  // ═══════════════════════════════════════════════════════════════════════════
  ipcMain.handle('scenes:detect', async (_ev, filePath: string, options?: SceneDetectionOptions) => {
    const service = getSceneDetectionService(db)
    return service.detectScenes(filePath, options)
  })

  ipcMain.handle('scenes:detectById', async (_ev, mediaId: string, options?: SceneDetectionOptions) => {
    const service = getSceneDetectionService(db)
    return service.detectScenesById(mediaId, options)
  })

  ipcMain.handle('scenes:estimate', async (_ev, filePath: string, sampleDuration?: number) => {
    const service = getSceneDetectionService(db)
    return service.estimateSceneCount(filePath, sampleDuration)
  })

  ipcMain.handle('scenes:isDetecting', async (_ev, mediaId: string) => {
    const service = getSceneDetectionService(db)
    return service.isDetecting(mediaId)
  })

  ipcMain.handle('scenes:generateChapterFile', async (_ev, chapters: any[], outputPath: string, format?: 'ffmpeg' | 'ogm') => {
    const service = getSceneDetectionService(db)
    service.generateChapterFile(chapters, outputPath, format)
    return { success: true, path: outputPath }
  })

  ipcMain.handle('scenes:getTimeline', async (_ev, scenes: any[], width?: number) => {
    const service = getSceneDetectionService(db)
    return service.getTimelineData(scenes, width)
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // IMPORT SERVICE - Import media from external sources
  // ═══════════════════════════════════════════════════════════════════════════
  ipcMain.handle('import:folder', async (_ev, folderPath: string, options?: ImportOptions) => {
    const service = getImportService(db)
    return service.importFolder(folderPath, options)
  })

  ipcMain.handle('import:playlist', async (_ev, playlistPath: string, options?: ImportOptions) => {
    const service = getImportService(db)
    return service.importPlaylist(playlistPath, options)
  })

  ipcMain.handle('import:libraryData', async (_ev, jsonPath: string, options?: any) => {
    const service = getImportService(db)
    return service.importLibraryData(jsonPath, options)
  })

  ipcMain.handle('import:cancel', async () => {
    const service = getImportService(db)
    service.cancel()
    return { success: true }
  })

  ipcMain.handle('import:isInProgress', async () => {
    const service = getImportService(db)
    return service.isInProgress()
  })

  ipcMain.handle('import:getProgress', async () => {
    const service = getImportService(db)
    return service.getProgress()
  })

  // Set up import event forwarding
  const importService = getImportService(db)
  importService.on('progress', (progress: any) => {
    broadcast('import:progress', progress)
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // NOTIFICATIONS - System notifications
  // ═══════════════════════════════════════════════════════════════════════════
  ipcMain.handle('notifications:show', async (_ev, config: NotificationConfig) => {
    const service = getNotificationsService()
    return service.show(config)
  })

  ipcMain.handle('notifications:info', async (_ev, title: string, body: string) => {
    const service = getNotificationsService()
    return service.info(title, body)
  })

  ipcMain.handle('notifications:success', async (_ev, title: string, body: string) => {
    const service = getNotificationsService()
    return service.success(title, body)
  })

  ipcMain.handle('notifications:error', async (_ev, title: string, body: string) => {
    const service = getNotificationsService()
    return service.error(title, body)
  })

  ipcMain.handle('notifications:achievement', async (_ev, name: string, description: string) => {
    const service = getNotificationsService()
    return service.achievement(name, description)
  })

  ipcMain.handle('notifications:getHistory', async (_ev, limit?: number) => {
    const service = getNotificationsService()
    return service.getHistory(limit)
  })

  ipcMain.handle('notifications:getUnreadCount', async () => {
    const service = getNotificationsService()
    return service.getUnreadCount()
  })

  ipcMain.handle('notifications:markAsRead', async (_ev, id: string) => {
    const service = getNotificationsService()
    service.markAsRead(id)
    return { success: true }
  })

  ipcMain.handle('notifications:markAllAsRead', async () => {
    const service = getNotificationsService()
    service.markAllAsRead()
    return { success: true }
  })

  ipcMain.handle('notifications:clearHistory', async () => {
    const service = getNotificationsService()
    service.clearHistory()
    return { success: true }
  })

  ipcMain.handle('notifications:getSettings', async () => {
    const service = getNotificationsService()
    return service.getSettings()
  })

  ipcMain.handle('notifications:updateSettings', async (_ev, updates: Partial<NotificationSettings>) => {
    const service = getNotificationsService()
    return service.updateSettings(updates)
  })

  ipcMain.handle('notifications:isSupported', async () => {
    const service = getNotificationsService()
    return service.isSupported()
  })

  // Handle notification action clicks
  const notificationsService = getNotificationsService()
  notificationsService.on('actionTriggered', ({ action, data }) => {
    switch (action) {
      case 'openUrlDownloader':
        broadcast('vault-open-url-downloader')
        break
      case 'openExportFolder':
        if (data?.path) {
          import('electron').then(({ shell }) => {
            shell.openPath(data.path)
          })
        }
        break
    }
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // ANALYTICS - Internal usage tracking
  // ═══════════════════════════════════════════════════════════════════════════
  ipcMain.handle('analytics:startSession', async () => {
    const service = getAnalyticsService(db)
    return service.startSession()
  })

  ipcMain.handle('analytics:endSession', async () => {
    const service = getAnalyticsService(db)
    return service.endSession()
  })

  ipcMain.handle('analytics:trackPageView', async (_ev, page: string) => {
    const service = getAnalyticsService(db)
    service.trackPageView(page)
    return { success: true }
  })

  ipcMain.handle('analytics:trackAction', async (_ev, action: string, target?: string) => {
    const service = getAnalyticsService(db)
    service.trackAction(action, target)
    return { success: true }
  })

  ipcMain.handle('analytics:trackMediaView', async (_ev, mediaId: string, duration: number) => {
    const service = getAnalyticsService(db)
    service.trackMediaView(mediaId, duration)
    return { success: true }
  })

  ipcMain.handle('analytics:trackFeature', async (_ev, feature: string) => {
    const service = getAnalyticsService(db)
    service.trackFeature(feature)
    return { success: true }
  })

  ipcMain.handle('analytics:getUsageStats', async () => {
    const service = getAnalyticsService(db)
    return service.getUsageStats()
  })

  ipcMain.handle('analytics:getFeatureUsage', async () => {
    const service = getAnalyticsService(db)
    return service.getFeatureUsage()
  })

  ipcMain.handle('analytics:getRecentEvents', async (_ev, limit?: number) => {
    const service = getAnalyticsService(db)
    return service.getRecentEvents(limit)
  })

  ipcMain.handle('analytics:getPeakHours', async () => {
    const service = getAnalyticsService(db)
    return service.getPeakHours()
  })

  ipcMain.handle('analytics:getUsageHeatmap', async (_ev, days?: number) => {
    const service = getAnalyticsService(db)
    return service.getUsageHeatmap(days)
  })

  ipcMain.handle('analytics:clearData', async () => {
    const service = getAnalyticsService(db)
    service.clearData()
    return { success: true }
  })

  ipcMain.handle('analytics:exportData', async () => {
    const service = getAnalyticsService(db)
    return service.exportData()
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // VIDEO BOOKMARKS
  // ═══════════════════════════════════════════════════════════════════════════

  ipcMain.handle('bookmarks:add', async (_ev, mediaId: string, timestamp: number, title: string, options?: { description?: string; thumbnailPath?: string; color?: string }) => {
    const service = getVideoBookmarksService(db)
    const result = service.addBookmark(mediaId, timestamp, title, options)
    broadcast('vault:changed')
    return result
  })

  ipcMain.handle('bookmarks:quickAdd', async (_ev, mediaId: string, timestamp: number) => {
    const service = getVideoBookmarksService(db)
    const result = service.quickBookmark(mediaId, timestamp)
    broadcast('vault:changed')
    return result
  })

  ipcMain.handle('bookmarks:getForMedia', async (_ev, mediaId: string) => {
    const service = getVideoBookmarksService(db)
    return service.getBookmarksForMedia(mediaId)
  })

  ipcMain.handle('bookmarks:get', async (_ev, bookmarkId: string) => {
    const service = getVideoBookmarksService(db)
    return service.getBookmark(bookmarkId)
  })

  ipcMain.handle('bookmarks:update', async (_ev, bookmarkId: string, updates: Partial<Pick<VideoBookmark, 'title' | 'description' | 'color' | 'timestamp'>>) => {
    const service = getVideoBookmarksService(db)
    const result = service.updateBookmark(bookmarkId, updates)
    broadcast('vault:changed')
    return result
  })

  ipcMain.handle('bookmarks:delete', async (_ev, bookmarkId: string) => {
    const service = getVideoBookmarksService(db)
    const result = service.deleteBookmark(bookmarkId)
    broadcast('vault:changed')
    return result
  })

  ipcMain.handle('bookmarks:deleteAllForMedia', async (_ev, mediaId: string) => {
    const service = getVideoBookmarksService(db)
    const result = service.deleteAllForMedia(mediaId)
    broadcast('vault:changed')
    return result
  })

  ipcMain.handle('bookmarks:getBookmarkedVideos', async () => {
    const service = getVideoBookmarksService(db)
    return service.getBookmarkedVideos()
  })

  ipcMain.handle('bookmarks:getRecent', async (_ev, limit?: number) => {
    const service = getVideoBookmarksService(db)
    return service.getRecentBookmarks(limit)
  })

  ipcMain.handle('bookmarks:findNearest', async (_ev, mediaId: string, timestamp: number) => {
    const service = getVideoBookmarksService(db)
    return service.findNearestBookmark(mediaId, timestamp)
  })

  ipcMain.handle('bookmarks:getNext', async (_ev, mediaId: string, timestamp: number) => {
    const service = getVideoBookmarksService(db)
    return service.getNextBookmark(mediaId, timestamp)
  })

  ipcMain.handle('bookmarks:getPrevious', async (_ev, mediaId: string, timestamp: number) => {
    const service = getVideoBookmarksService(db)
    return service.getPreviousBookmark(mediaId, timestamp)
  })

  ipcMain.handle('bookmarks:getStats', async () => {
    const service = getVideoBookmarksService(db)
    return service.getStats()
  })

  ipcMain.handle('bookmarks:export', async (_ev, mediaId: string, format?: 'json' | 'chapters') => {
    const service = getVideoBookmarksService(db)
    return service.exportBookmarks(mediaId, format)
  })

  ipcMain.handle('bookmarks:import', async (_ev, mediaId: string, json: string) => {
    const service = getVideoBookmarksService(db)
    return service.importBookmarks(mediaId, json)
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // TAG CATEGORIES
  // ═══════════════════════════════════════════════════════════════════════════

  ipcMain.handle('tagCategories:getAll', async () => {
    const service = getTagCategoriesService(db)
    return service.getCategories()
  })

  ipcMain.handle('tagCategories:getTree', async () => {
    const service = getTagCategoriesService(db)
    return service.getCategoryTree()
  })

  ipcMain.handle('tagCategories:get', async (_ev, categoryId: string) => {
    const service = getTagCategoriesService(db)
    return service.getCategory(categoryId)
  })

  ipcMain.handle('tagCategories:create', async (_ev, name: string, options?: { description?: string; color?: string; icon?: string; parentId?: string }) => {
    const service = getTagCategoriesService(db)
    const result = service.createCategory(name, options)
    broadcast('vault:changed')
    return result
  })

  ipcMain.handle('tagCategories:update', async (_ev, categoryId: string, updates: Partial<Pick<TagCategory, 'name' | 'description' | 'color' | 'icon' | 'parentId' | 'sortOrder'>>) => {
    const service = getTagCategoriesService(db)
    const result = service.updateCategory(categoryId, updates)
    broadcast('vault:changed')
    return result
  })

  ipcMain.handle('tagCategories:delete', async (_ev, categoryId: string) => {
    const service = getTagCategoriesService(db)
    const result = service.deleteCategory(categoryId)
    broadcast('vault:changed')
    return result
  })

  ipcMain.handle('tagCategories:assignTag', async (_ev, tagId: string, categoryId: string | null) => {
    const service = getTagCategoriesService(db)
    const result = service.assignTagToCategory(tagId, categoryId)
    broadcast('vault:changed')
    return result
  })

  ipcMain.handle('tagCategories:bulkAssignTags', async (_ev, tagIds: string[], categoryId: string | null) => {
    const service = getTagCategoriesService(db)
    const result = service.bulkAssignTags(tagIds, categoryId)
    broadcast('vault:changed')
    return result
  })

  ipcMain.handle('tagCategories:getTagsInCategory', async (_ev, categoryId: string | null) => {
    const service = getTagCategoriesService(db)
    return service.getTagsInCategory(categoryId)
  })

  ipcMain.handle('tagCategories:getUncategorized', async () => {
    const service = getTagCategoriesService(db)
    return service.getUncategorizedTags()
  })

  ipcMain.handle('tagCategories:autoCategorize', async () => {
    const service = getTagCategoriesService(db)
    const result = service.autoCategorize()
    broadcast('vault:changed')
    return result
  })

  ipcMain.handle('tagCategories:getStats', async () => {
    const service = getTagCategoriesService(db)
    return service.getStats()
  })

  ipcMain.handle('tagCategories:reorder', async (_ev, orderedIds: string[]) => {
    const service = getTagCategoriesService(db)
    service.reorderCategories(orderedIds)
    broadcast('vault:changed')
    return { success: true }
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // MEDIA RELATIONSHIPS
  // ═══════════════════════════════════════════════════════════════════════════

  ipcMain.handle('relationships:create', async (_ev, sourceId: string, targetId: string, type: RelationshipType, options?: { bidirectional?: boolean; note?: string }) => {
    const service = getMediaRelationshipsService(db)
    const result = service.createRelationship(sourceId, targetId, type, options)
    broadcast('vault:changed')
    return result
  })

  ipcMain.handle('relationships:linkAsSequel', async (_ev, earlierId: string, laterId: string, note?: string) => {
    const service = getMediaRelationshipsService(db)
    const result = service.linkAsSequel(earlierId, laterId, note)
    broadcast('vault:changed')
    return result
  })

  ipcMain.handle('relationships:linkAsRelated', async (_ev, id1: string, id2: string, note?: string) => {
    const service = getMediaRelationshipsService(db)
    const result = service.linkAsRelated(id1, id2, note)
    broadcast('vault:changed')
    return result
  })

  ipcMain.handle('relationships:linkAsAlternate', async (_ev, id1: string, id2: string, note?: string) => {
    const service = getMediaRelationshipsService(db)
    const result = service.linkAsAlternate(id1, id2, note)
    broadcast('vault:changed')
    return result
  })

  ipcMain.handle('relationships:linkAsSeries', async (_ev, mediaIds: string[], seriesNote?: string) => {
    const service = getMediaRelationshipsService(db)
    const result = service.linkAsSeries(mediaIds, seriesNote)
    broadcast('vault:changed')
    return result
  })

  ipcMain.handle('relationships:markAsDuplicates', async (_ev, id1: string, id2: string, note?: string) => {
    const service = getMediaRelationshipsService(db)
    const result = service.markAsDuplicates(id1, id2, note)
    broadcast('vault:changed')
    return result
  })

  ipcMain.handle('relationships:get', async (_ev, relationshipId: string) => {
    const service = getMediaRelationshipsService(db)
    return service.getRelationship(relationshipId)
  })

  ipcMain.handle('relationships:getForMedia', async (_ev, mediaId: string) => {
    const service = getMediaRelationshipsService(db)
    return service.getRelationships(mediaId)
  })

  ipcMain.handle('relationships:getByType', async (_ev, mediaId: string, type: RelationshipType) => {
    const service = getMediaRelationshipsService(db)
    return service.getRelatedByType(mediaId, type)
  })

  ipcMain.handle('relationships:getSequels', async (_ev, mediaId: string) => {
    const service = getMediaRelationshipsService(db)
    return service.getSequels(mediaId)
  })

  ipcMain.handle('relationships:getPrequels', async (_ev, mediaId: string) => {
    const service = getMediaRelationshipsService(db)
    return service.getPrequels(mediaId)
  })

  ipcMain.handle('relationships:getDuplicates', async (_ev, mediaId: string) => {
    const service = getMediaRelationshipsService(db)
    return service.getDuplicates(mediaId)
  })

  ipcMain.handle('relationships:update', async (_ev, relationshipId: string, updates: Partial<{ type: RelationshipType; note: string; bidirectional: boolean }>) => {
    const service = getMediaRelationshipsService(db)
    const result = service.updateRelationship(relationshipId, updates)
    broadcast('vault:changed')
    return result
  })

  ipcMain.handle('relationships:delete', async (_ev, relationshipId: string) => {
    const service = getMediaRelationshipsService(db)
    const result = service.deleteRelationship(relationshipId)
    broadcast('vault:changed')
    return result
  })

  ipcMain.handle('relationships:deleteAllForMedia', async (_ev, mediaId: string) => {
    const service = getMediaRelationshipsService(db)
    const result = service.deleteAllForMedia(mediaId)
    broadcast('vault:changed')
    return result
  })

  ipcMain.handle('relationships:areRelated', async (_ev, id1: string, id2: string) => {
    const service = getMediaRelationshipsService(db)
    return service.areRelated(id1, id2)
  })

  ipcMain.handle('relationships:getBetween', async (_ev, id1: string, id2: string) => {
    const service = getMediaRelationshipsService(db)
    return service.getRelationshipBetween(id1, id2)
  })

  ipcMain.handle('relationships:findSeries', async (_ev, mediaId: string) => {
    const service = getMediaRelationshipsService(db)
    return service.findSeries(mediaId)
  })

  ipcMain.handle('relationships:getMediaWithRelationships', async () => {
    const service = getMediaRelationshipsService(db)
    return service.getMediaWithRelationships()
  })

  ipcMain.handle('relationships:getStats', async () => {
    const service = getMediaRelationshipsService(db)
    return service.getStats()
  })

  ipcMain.handle('relationships:suggestRelationships', async (_ev, mediaId: string, limit?: number) => {
    const service = getMediaRelationshipsService(db)
    return service.suggestRelationships(mediaId, limit)
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // MEDIA NOTES
  // ═══════════════════════════════════════════════════════════════════════════

  ipcMain.handle('notes:add', async (_ev, mediaId: string, content: string, options?: { isPinned?: boolean; color?: string }) => {
    const service = getMediaNotesService(db)
    const result = service.addNote(mediaId, content, options)
    broadcast('vault:changed')
    return result
  })

  ipcMain.handle('notes:getForMedia', async (_ev, mediaId: string) => {
    const service = getMediaNotesService(db)
    return service.getNotesForMedia(mediaId)
  })

  ipcMain.handle('notes:get', async (_ev, noteId: string) => {
    const service = getMediaNotesService(db)
    return service.getNote(noteId)
  })

  ipcMain.handle('notes:update', async (_ev, noteId: string, updates: Partial<Pick<MediaNote, 'content' | 'isPinned' | 'color'>>) => {
    const service = getMediaNotesService(db)
    const result = service.updateNote(noteId, updates)
    broadcast('vault:changed')
    return result
  })

  ipcMain.handle('notes:delete', async (_ev, noteId: string) => {
    const service = getMediaNotesService(db)
    const result = service.deleteNote(noteId)
    broadcast('vault:changed')
    return result
  })

  ipcMain.handle('notes:deleteAllForMedia', async (_ev, mediaId: string) => {
    const service = getMediaNotesService(db)
    const result = service.deleteAllForMedia(mediaId)
    broadcast('vault:changed')
    return result
  })

  ipcMain.handle('notes:togglePin', async (_ev, noteId: string) => {
    const service = getMediaNotesService(db)
    const result = service.togglePin(noteId)
    broadcast('vault:changed')
    return result
  })

  ipcMain.handle('notes:search', async (_ev, query: string, limit?: number) => {
    const service = getMediaNotesService(db)
    return service.searchNotes(query, limit)
  })

  ipcMain.handle('notes:getMediaWithNotes', async () => {
    const service = getMediaNotesService(db)
    return service.getMediaWithNotes()
  })

  ipcMain.handle('notes:getRecent', async (_ev, limit?: number) => {
    const service = getMediaNotesService(db)
    return service.getRecentNotes(limit)
  })

  ipcMain.handle('notes:getPinned', async () => {
    const service = getMediaNotesService(db)
    return service.getPinnedNotes()
  })

  ipcMain.handle('notes:getStats', async () => {
    const service = getMediaNotesService(db)
    return service.getStats()
  })

  ipcMain.handle('notes:export', async (_ev, mediaId: string) => {
    const service = getMediaNotesService(db)
    return service.exportNotes(mediaId)
  })

  ipcMain.handle('notes:import', async (_ev, mediaId: string, json: string) => {
    const service = getMediaNotesService(db)
    return service.importNotes(mediaId, json)
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // WATCH LATER QUEUE
  // ═══════════════════════════════════════════════════════════════════════════

  ipcMain.handle('watchLater:add', async (_ev, mediaId: string, options?: { priority?: number; note?: string; reminderAt?: number }) => {
    const service = getWatchLaterService(db)
    return service.add(mediaId, options)
  })

  ipcMain.handle('watchLater:remove', async (_ev, mediaId: string) => {
    const service = getWatchLaterService(db)
    return service.remove(mediaId)
  })

  ipcMain.handle('watchLater:isInQueue', async (_ev, mediaId: string) => {
    const service = getWatchLaterService(db)
    return service.isInQueue(mediaId)
  })

  ipcMain.handle('watchLater:getQueue', async (_ev, options?: { limit?: number; offset?: number; sortBy?: 'priority' | 'addedAt' | 'reminderAt' }) => {
    const service = getWatchLaterService(db)
    return service.getQueue(options)
  })

  ipcMain.handle('watchLater:getCount', async () => {
    const service = getWatchLaterService(db)
    return service.getCount()
  })

  ipcMain.handle('watchLater:update', async (_ev, id: string, updates: Partial<Pick<WatchLaterItem, 'priority' | 'note' | 'reminderAt'>>) => {
    const service = getWatchLaterService(db)
    return service.update(id, updates)
  })

  ipcMain.handle('watchLater:setPriority', async (_ev, mediaId: string, priority: number) => {
    const service = getWatchLaterService(db)
    return service.setPriority(mediaId, priority)
  })

  ipcMain.handle('watchLater:bumpPriority', async (_ev, mediaId: string) => {
    const service = getWatchLaterService(db)
    return service.bumpPriority(mediaId)
  })

  ipcMain.handle('watchLater:getNext', async () => {
    const service = getWatchLaterService(db)
    return service.getNext()
  })

  ipcMain.handle('watchLater:popNext', async () => {
    const service = getWatchLaterService(db)
    return service.popNext()
  })

  ipcMain.handle('watchLater:getDueReminders', async () => {
    const service = getWatchLaterService(db)
    return service.getDueReminders()
  })

  ipcMain.handle('watchLater:clearQueue', async () => {
    const service = getWatchLaterService(db)
    return service.clearQueue()
  })

  ipcMain.handle('watchLater:reorder', async (_ev, orderedMediaIds: string[]) => {
    const service = getWatchLaterService(db)
    service.reorder(orderedMediaIds)
    return { success: true }
  })

  ipcMain.handle('watchLater:shuffle', async () => {
    const service = getWatchLaterService(db)
    service.shuffle()
    return { success: true }
  })

  ipcMain.handle('watchLater:addMultiple', async (_ev, mediaIds: string[], priority?: number) => {
    const service = getWatchLaterService(db)
    return service.addMultiple(mediaIds, priority)
  })

  ipcMain.handle('watchLater:getStats', async () => {
    const service = getWatchLaterService(db)
    return service.getStats()
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // TAG ALIASES
  // ═══════════════════════════════════════════════════════════════════════════

  ipcMain.handle('tagAliases:add', async (_ev, tagId: string, alias: string) => {
    const service = getTagAliasesService(db)
    return service.addAlias(tagId, alias)
  })

  ipcMain.handle('tagAliases:remove', async (_ev, aliasId: string) => {
    const service = getTagAliasesService(db)
    return service.removeAlias(aliasId)
  })

  ipcMain.handle('tagAliases:getForTag', async (_ev, tagId: string) => {
    const service = getTagAliasesService(db)
    return service.getAliasesForTag(tagId)
  })

  ipcMain.handle('tagAliases:resolve', async (_ev, alias: string) => {
    const service = getTagAliasesService(db)
    return service.resolveAlias(alias)
  })

  ipcMain.handle('tagAliases:resolveMultiple', async (_ev, aliases: string[]) => {
    const service = getTagAliasesService(db)
    return service.resolveAliases(aliases)
  })

  ipcMain.handle('tagAliases:getAllWithAliases', async () => {
    const service = getTagAliasesService(db)
    return service.getAllTagsWithAliases()
  })

  ipcMain.handle('tagAliases:search', async (_ev, query: string, limit?: number) => {
    const service = getTagAliasesService(db)
    return service.search(query, limit)
  })

  ipcMain.handle('tagAliases:suggest', async (_ev, tagName: string) => {
    const service = getTagAliasesService(db)
    return service.suggestAliases(tagName)
  })

  ipcMain.handle('tagAliases:getStats', async () => {
    const service = getTagAliasesService(db)
    return service.getStats()
  })

  ipcMain.handle('tagAliases:export', async () => {
    const service = getTagAliasesService(db)
    return service.exportAliases()
  })

  ipcMain.handle('tagAliases:import', async (_ev, data: Record<string, string[]>) => {
    const service = getTagAliasesService(db)
    return service.importAliases(data)
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // RATING HISTORY
  // ═══════════════════════════════════════════════════════════════════════════

  ipcMain.handle('ratingHistory:record', async (_ev, mediaId: string, oldRating: number | null, newRating: number, sessionId?: string) => {
    const service = getRatingHistoryService(db)
    return service.recordChange(mediaId, oldRating, newRating, sessionId)
  })

  ipcMain.handle('ratingHistory:getHistory', async (_ev, mediaId: string, limit?: number) => {
    const service = getRatingHistoryService(db)
    return service.getHistory(mediaId, limit)
  })

  ipcMain.handle('ratingHistory:getInitialRating', async (_ev, mediaId: string) => {
    const service = getRatingHistoryService(db)
    return service.getInitialRating(mediaId)
  })

  ipcMain.handle('ratingHistory:getChangesInRange', async (_ev, startTime: number, endTime: number) => {
    const service = getRatingHistoryService(db)
    return service.getChangesInRange(startTime, endTime)
  })

  ipcMain.handle('ratingHistory:getTrends', async (_ev, minChanges?: number) => {
    const service = getRatingHistoryService(db)
    return service.getTrends(minChanges)
  })

  ipcMain.handle('ratingHistory:getRisingStars', async (_ev, limit?: number) => {
    const service = getRatingHistoryService(db)
    return service.getRisingStars(limit)
  })

  ipcMain.handle('ratingHistory:getFallingStars', async (_ev, limit?: number) => {
    const service = getRatingHistoryService(db)
    return service.getFallingStars(limit)
  })

  ipcMain.handle('ratingHistory:getMostVolatile', async (_ev, limit?: number) => {
    const service = getRatingHistoryService(db)
    return service.getMostVolatile(limit)
  })

  ipcMain.handle('ratingHistory:getRecentlyRated', async (_ev, limit?: number) => {
    const service = getRatingHistoryService(db)
    return service.getRecentlyRated(limit)
  })

  ipcMain.handle('ratingHistory:undoLastChange', async (_ev, mediaId: string) => {
    const service = getRatingHistoryService(db)
    return service.undoLastChange(mediaId)
  })

  ipcMain.handle('ratingHistory:getStats', async () => {
    const service = getRatingHistoryService(db)
    return service.getStats()
  })

  ipcMain.handle('ratingHistory:cleanup', async (_ev, keepPerMedia?: number) => {
    const service = getRatingHistoryService(db)
    return service.cleanup(keepPerMedia)
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // CUSTOM FILTERS
  // ═══════════════════════════════════════════════════════════════════════════

  ipcMain.handle('customFilters:getAll', async (_ev, includePresets?: boolean) => {
    const service = getCustomFiltersService(db)
    return service.getFilters(includePresets)
  })

  ipcMain.handle('customFilters:getQuickAccess', async () => {
    const service = getCustomFiltersService(db)
    return service.getQuickAccessFilters()
  })

  ipcMain.handle('customFilters:get', async (_ev, filterId: string) => {
    const service = getCustomFiltersService(db)
    return service.getFilter(filterId)
  })

  ipcMain.handle('customFilters:create', async (_ev, name: string, conditions: FilterCondition[], options?: any) => {
    const service = getCustomFiltersService(db)
    const result = service.createFilter(name, conditions, options)
    broadcast('vault:changed')
    return result
  })

  ipcMain.handle('customFilters:update', async (_ev, filterId: string, updates: any) => {
    const service = getCustomFiltersService(db)
    const result = service.updateFilter(filterId, updates)
    broadcast('vault:changed')
    return result
  })

  ipcMain.handle('customFilters:delete', async (_ev, filterId: string) => {
    const service = getCustomFiltersService(db)
    const result = service.deleteFilter(filterId)
    broadcast('vault:changed')
    return result
  })

  ipcMain.handle('customFilters:execute', async (_ev, filterId: string) => {
    const service = getCustomFiltersService(db)
    return service.executeFilter(filterId)
  })

  ipcMain.handle('customFilters:executeConditions', async (_ev, conditions: FilterCondition[], combineMode: 'and' | 'or', sortBy?: string, sortOrder?: 'asc' | 'desc') => {
    const service = getCustomFiltersService(db)
    return service.executeConditions(conditions, combineMode, sortBy, sortOrder)
  })

  ipcMain.handle('customFilters:preview', async (_ev, conditions: FilterCondition[], combineMode: 'and' | 'or') => {
    const service = getCustomFiltersService(db)
    return service.previewFilter(conditions, combineMode)
  })

  ipcMain.handle('customFilters:duplicate', async (_ev, filterId: string, newName?: string) => {
    const service = getCustomFiltersService(db)
    return service.duplicateFilter(filterId, newName)
  })

  ipcMain.handle('customFilters:toggleQuickAccess', async (_ev, filterId: string) => {
    const service = getCustomFiltersService(db)
    const result = service.toggleQuickAccess(filterId)
    broadcast('vault:changed')
    return result
  })

  ipcMain.handle('customFilters:getStats', async () => {
    const service = getCustomFiltersService(db)
    return service.getStats()
  })

  ipcMain.handle('customFilters:export', async () => {
    const service = getCustomFiltersService(db)
    return service.exportFilters()
  })

  ipcMain.handle('customFilters:import', async (_ev, json: string) => {
    const service = getCustomFiltersService(db)
    return service.importFilters(json)
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // SESSION HISTORY
  // ═══════════════════════════════════════════════════════════════════════════

  ipcMain.handle('sessionHistory:start', async (_ev, mood?: string) => {
    const service = getSessionHistoryService(db)
    return service.startSession(mood)
  })

  ipcMain.handle('sessionHistory:end', async (_ev, notes?: string) => {
    const service = getSessionHistoryService(db)
    return service.endSession(notes)
  })

  ipcMain.handle('sessionHistory:getCurrent', async () => {
    const service = getSessionHistoryService(db)
    return service.getCurrentSession()
  })

  ipcMain.handle('sessionHistory:recordMediaView', async (_ev, mediaId: string) => {
    const service = getSessionHistoryService(db)
    service.recordMediaView(mediaId)
    return { success: true }
  })

  ipcMain.handle('sessionHistory:recordAction', async (_ev, type: SessionAction['type'], mediaId?: string, data?: any) => {
    const service = getSessionHistoryService(db)
    service.recordAction(type, mediaId, data)
    return { success: true }
  })

  ipcMain.handle('sessionHistory:get', async (_ev, sessionId: string) => {
    const service = getSessionHistoryService(db)
    return service.getSession(sessionId)
  })

  ipcMain.handle('sessionHistory:getRecent', async (_ev, limit?: number) => {
    const service = getSessionHistoryService(db)
    return service.getRecentSessions(limit)
  })

  ipcMain.handle('sessionHistory:getToday', async () => {
    const service = getSessionHistoryService(db)
    return service.getTodaySessions()
  })

  ipcMain.handle('sessionHistory:getWeek', async () => {
    const service = getSessionHistoryService(db)
    return service.getWeekSessions()
  })

  ipcMain.handle('sessionHistory:getAnalytics', async (_ev, days?: number) => {
    const service = getSessionHistoryService(db)
    return service.getAnalytics(days)
  })

  ipcMain.handle('sessionHistory:getFrequentlyViewedTogether', async (_ev, mediaId: string, limit?: number) => {
    const service = getSessionHistoryService(db)
    return service.getFrequentlyViewedTogether(mediaId, limit)
  })

  ipcMain.handle('sessionHistory:getTagTrends', async (_ev, days?: number) => {
    const service = getSessionHistoryService(db)
    return service.getTagTrends(days)
  })

  ipcMain.handle('sessionHistory:delete', async (_ev, sessionId: string) => {
    const service = getSessionHistoryService(db)
    return service.deleteSession(sessionId)
  })

  ipcMain.handle('sessionHistory:deleteOld', async (_ev, keepDays?: number) => {
    const service = getSessionHistoryService(db)
    return service.deleteOldSessions(keepDays)
  })

  ipcMain.handle('sessionHistory:export', async (_ev, days?: number) => {
    const service = getSessionHistoryService(db)
    return service.exportSessions(days)
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // FAVORITE FOLDERS
  // ═══════════════════════════════════════════════════════════════════════════

  ipcMain.handle('favoriteFolders:add', async (_ev, folderPath: string, name?: string, options?: { icon?: string; color?: string }) => {
    const service = getFavoriteFoldersService(db)
    return service.addFolder(folderPath, name, options)
  })

  ipcMain.handle('favoriteFolders:remove', async (_ev, folderId: string) => {
    const service = getFavoriteFoldersService(db)
    return service.removeFolder(folderId)
  })

  ipcMain.handle('favoriteFolders:isFavorite', async (_ev, folderPath: string) => {
    const service = getFavoriteFoldersService(db)
    return service.isFavorite(folderPath)
  })

  ipcMain.handle('favoriteFolders:get', async (_ev, folderId: string) => {
    const service = getFavoriteFoldersService(db)
    return service.getFolder(folderId)
  })

  ipcMain.handle('favoriteFolders:getAll', async () => {
    const service = getFavoriteFoldersService(db)
    return service.getFolders()
  })

  ipcMain.handle('favoriteFolders:getRecent', async (_ev, limit?: number) => {
    const service = getFavoriteFoldersService(db)
    return service.getRecentFolders(limit)
  })

  ipcMain.handle('favoriteFolders:update', async (_ev, folderId: string, updates: any) => {
    const service = getFavoriteFoldersService(db)
    return service.updateFolder(folderId, updates)
  })

  ipcMain.handle('favoriteFolders:recordAccess', async (_ev, folderId: string) => {
    const service = getFavoriteFoldersService(db)
    service.recordAccess(folderId)
    return { success: true }
  })

  ipcMain.handle('favoriteFolders:reorder', async (_ev, orderedIds: string[]) => {
    const service = getFavoriteFoldersService(db)
    service.reorderFolders(orderedIds)
    return { success: true }
  })

  ipcMain.handle('favoriteFolders:getStats', async (_ev, folderId: string) => {
    const service = getFavoriteFoldersService(db)
    return service.getFolderStats(folderId)
  })

  ipcMain.handle('favoriteFolders:getMedia', async (_ev, folderId: string, limit?: number) => {
    const service = getFavoriteFoldersService(db)
    return service.getMediaInFolder(folderId, limit)
  })

  ipcMain.handle('favoriteFolders:getSubfolders', async (_ev, folderPath: string) => {
    const service = getFavoriteFoldersService(db)
    return service.getSubfolders(folderPath)
  })

  ipcMain.handle('favoriteFolders:toggle', async (_ev, folderPath: string, name?: string) => {
    const service = getFavoriteFoldersService(db)
    return service.toggleFavorite(folderPath, name)
  })

  ipcMain.handle('favoriteFolders:validate', async () => {
    const service = getFavoriteFoldersService(db)
    return service.validateFolders()
  })

  ipcMain.handle('favoriteFolders:removeInvalid', async () => {
    const service = getFavoriteFoldersService(db)
    return service.removeInvalidFolders()
  })

  ipcMain.handle('favoriteFolders:getMostAccessed', async (_ev, limit?: number) => {
    const service = getFavoriteFoldersService(db)
    return service.getMostAccessed(limit)
  })

  ipcMain.handle('favoriteFolders:search', async (_ev, query: string) => {
    const service = getFavoriteFoldersService(db)
    return service.searchFolders(query)
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // DUPLICATES FINDER
  // ═══════════════════════════════════════════════════════════════════════════

  ipcMain.handle('duplicates:findExact', async () => {
    const service = getDuplicatesFinderService(db)
    return service.findExactDuplicates()
  })

  ipcMain.handle('duplicates:findBySize', async () => {
    const service = getDuplicatesFinderService(db)
    return service.findSizeDuplicates()
  })

  // Soundpack chromaprint dedup. Walks every audio file in the
  // configured soundpack roots, fingerprints with ffmpeg's chromaprint
  // muxer, groups by similarity. Caches results in
  // <userData>/chromaprint-cache.json so re-runs skip already-hashed
  // files. Returns clusters of duplicate files — caller decides what
  // to do (typically delete all but one per group).
  let _chromaprintAbort: { aborted: boolean } | null = null
  ipcMain.handle('soundpack:chromaprint-dedup', async (_ev, opts?: { soundpackRoots?: string[] }) => {
    if (!ffmpegBin) return { ok: false, error: 'ffmpeg not available' }
    const { clusterByFingerprint, loadFingerprintCache, saveFingerprintCache } = await import('./services/audio/chromaprint-dedup')
    const { app } = await import('electron')
    const pathMod = await import('node:path')
    const fsMod = await import('node:fs')

    // Walk soundpack roots — default to userData/audio/voice/ and
    // ~/Vault/Soundpacks/ (the two known soundpack roots per
    // settings.ts / CLAUDE.md).
    const roots: string[] = opts?.soundpackRoots ?? [
      pathMod.join(app.getPath('userData'), 'audio', 'voice'),
      pathMod.join(app.getPath('home'), 'Vault', 'Soundpacks'),
      pathMod.join('C:', 'dev', 'vault', 'NSFW Soundpack'),
    ]

    const audioExts = new Set(['.mp3', '.wav', '.ogg', '.m4a', '.flac', '.aac', '.opus'])
    function* walk(dir: string): Generator<string> {
      let entries: import('node:fs').Dirent[]
      try { entries = fsMod.readdirSync(dir, { withFileTypes: true }) }
      catch { return }
      for (const entry of entries) {
        const full = pathMod.join(dir, entry.name)
        if (entry.isDirectory()) yield* walk(full)
        else if (entry.isFile() && audioExts.has(pathMod.extname(entry.name).toLowerCase())) {
          yield full
        }
      }
    }

    const files: string[] = []
    for (const root of roots) {
      if (!fsMod.existsSync(root)) continue
      for (const f of walk(root)) files.push(f)
    }
    console.log(`[Chromaprint Dedup] Found ${files.length} audio files across ${roots.length} roots`)

    const cachePath = pathMod.join(app.getPath('userData'), 'chromaprint-cache.json')
    const cache = loadFingerprintCache(cachePath)
    _chromaprintAbort = { aborted: false }

    const result = await clusterByFingerprint(
      ffmpegBin,
      files,
      (done, total, currentFile) => {
        try {
          const win = BrowserWindow.getAllWindows()[0]
          win?.webContents.send('soundpack:chromaprint-progress', { done, total, currentFile })
        } catch { /* ignore */ }
      },
      { concurrency: 4, existingFingerprints: cache },
    )

    // Persist updated fingerprint cache for next run.
    saveFingerprintCache(cachePath, result.fingerprints)

    let totalFiles = 0
    let dupesIfReduced = 0
    for (const g of result.groups) {
      totalFiles += g.length
      dupesIfReduced += g.length - 1
    }
    _chromaprintAbort = null

    return {
      ok: true,
      scanned: files.length,
      uniqueGroups: result.groups.length,
      duplicateFiles: totalFiles,
      reducibleTo: result.groups.length,
      filesIfReduced: files.length - dupesIfReduced,
      groups: result.groups.slice(0, 200),  // cap response size
    }
  })

  // AV1 archival re-encode. Batch operation that transcodes a set of
  // videos to AV1 (SVT-AV1 on CPU, av1_nvenc on RTX 40+). Replaces
  // sources in-place by default; pass keepOriginal=true to write
  // alongside instead. Typical savings: 50-60% vs H.264, 30-40% vs HEVC.
  let _av1AbortSignal: { aborted: boolean } | null = null
  ipcMain.handle('av1:reencode-batch', async (_ev, opts: {
    mediaIds: string[]
    crf?: number
    preset?: number
    preferGpu?: boolean
    keepOriginal?: boolean
    minSavingsRatio?: number
    maxDurationSec?: number
  }) => {
    if (!ffmpegBin) return { ok: false, error: 'ffmpeg not available' }
    if (!Array.isArray(opts?.mediaIds) || opts.mediaIds.length === 0) {
      return { ok: false, error: 'mediaIds required' }
    }
    const { batchReencode } = await import('./services/av1-reencode')
    _av1AbortSignal = { aborted: false }
    const result = await batchReencode(
      db, ffmpegBin, opts.mediaIds,
      {
        crf: opts.crf,
        preset: opts.preset,
        preferGpu: opts.preferGpu,
        keepOriginal: opts.keepOriginal,
        minSavingsRatio: opts.minSavingsRatio,
        maxDurationSec: opts.maxDurationSec,
      },
      (p) => {
        try {
          const win = BrowserWindow.getAllWindows()[0]
          win?.webContents.send('av1:progress', p)
        } catch { /* sender gone */ }
      },
      _av1AbortSignal,
    )
    _av1AbortSignal = null
    return { ok: true, ...result }
  })
  ipcMain.handle('av1:abort', async () => {
    if (_av1AbortSignal) _av1AbortSignal.aborted = true
    return { ok: true }
  })

  // Bulk rename with template DSL + dry-run preview. Pattern from
  // mnamer — single template applies to a filter set, preview shows
  // collisions before commit, apply path appends _2/_3 on collision.
  ipcMain.handle('media:bulk-rename-preview', async (_ev, opts: { mediaIds: string[]; template: string }) => {
    const { previewBulkRename } = await import('./services/bulk-rename')
    if (!Array.isArray(opts?.mediaIds) || !opts.template) return { ok: false, error: 'mediaIds + template required', rows: [] }
    return { ok: true, rows: previewBulkRename(db, opts.mediaIds, opts.template) }
  })
  ipcMain.handle('media:bulk-rename-apply', async (_ev, opts: { mediaIds: string[]; template: string }) => {
    const { applyBulkRename } = await import('./services/bulk-rename')
    if (!Array.isArray(opts?.mediaIds) || !opts.template) return { ok: false, error: 'mediaIds + template required' }
    const result = applyBulkRename(db, opts.mediaIds, opts.template)
    return { ok: true, ...result }
  })
  // #315 — undo + list undo logs
  ipcMain.handle('media:bulk-rename-undo', async (_ev, undoId: string) => {
    try {
      const { undoBulkRename } = await import('./services/bulk-rename')
      return { ok: true, ...(await undoBulkRename(db, undoId)) }
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })
  ipcMain.handle('media:bulk-rename-undo-list', async () => {
    try {
      const { listUndoLogs } = await import('./services/bulk-rename')
      return { ok: true, logs: await listUndoLogs() }
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })

  // ─── DeoVR / HereSphere catalog server (#119) ──────────────────
  // Optional read-only HTTP endpoint that exposes the library to VR
  // players in DeoVR's JSON catalog format. NO AUTH — user toggles
  // it on/off via settings.ai.deovrServerEnabled + deovrServerPort.
  ipcMain.handle('deovr:start', async (_ev, opts?: { port?: number }) => {
    const { deovrServer } = await import('./services/deovr-server')
    // Wire the library accessors so the server can fetch its data.
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
        `).all() as Array<{
          id: string; filename: string; path: string; durationSec: number | null
          thumbPath: string | null; width: number | null; height: number | null
          title: string | null
        }>
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
          WHERE m.id = ? AND m.type = 'video'
          LIMIT 1
        `).get(id) as any
        return row ?? null
      }
    }
    const { getSettings } = await import('./settings')
    const aiSettings = (getSettings().ai as any) || {}
    const port = opts?.port ?? aiSettings.deovrServerPort ?? 9999
    return await deovrServer.start({ port })
  })
  ipcMain.handle('deovr:stop', async () => {
    const { deovrServer } = await import('./services/deovr-server')
    await deovrServer.stop()
    return { ok: true }
  })
  ipcMain.handle('deovr:status', async () => {
    const { deovrServer } = await import('./services/deovr-server')
    return deovrServer.getStatus()
  })

  // ─── Stash plugin-API GraphQL shim (#120) ──────────────────────
  // Read-only POST /graphql endpoint exposing a small subset of
  // Stash's GraphQL API so Stash plugins can browse Vault's library.
  // NO AUTH. User toggles via settings.ai.stashShimEnabled.
  ipcMain.handle('stash:start', async (_ev, opts?: { port?: number }) => {
    const { stashShimServer } = await import('./services/stash-shim-server')
    if (!stashShimServer.accessors) {
      stashShimServer.accessors = buildStashShimAccessors(db)
    }
    const { getSettings } = await import('./settings')
    const aiSettings = (getSettings().ai as any) || {}
    const port = opts?.port ?? aiSettings.stashShimPort ?? 9998
    return await stashShimServer.start({ port })
  })
  ipcMain.handle('stash:stop', async () => {
    const { stashShimServer } = await import('./services/stash-shim-server')
    await stashShimServer.stop()
    return { ok: true }
  })
  ipcMain.handle('stash:status', async () => {
    const { stashShimServer } = await import('./services/stash-shim-server')
    return stashShimServer.getStatus()
  })

  // ─── Performer watchlist (#56) ─────────────────────────────────
  // Whisparr-style: user flags performers, periodic poll surfaces new
  // uploads as pending hits. CRUD handlers below; the actual polling
  // is triggered manually for now (a future cron job will tick it).
  ipcMain.handle('watchlist:add', async (_ev, opts: {
    performerName: string
    faceClusterId?: string | null
    sources?: string[]
    pollIntervalHours?: number
    notes?: string
  }) => {
    const { addWatchlistEntry } = await import('./services/performer-watchlist')
    try {
      const entry = addWatchlistEntry(db, opts as any)
      return { ok: true, entry }
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })
  ipcMain.handle('watchlist:list', async (_ev, opts?: { enabledOnly?: boolean }) => {
    const { listWatchlistEntries } = await import('./services/performer-watchlist')
    return listWatchlistEntries(db, opts)
  })
  ipcMain.handle('watchlist:remove', async (_ev, performerName: string) => {
    const { removeWatchlistEntry } = await import('./services/performer-watchlist')
    removeWatchlistEntry(db, performerName)
    return { ok: true }
  })
  ipcMain.handle('watchlist:set-enabled', async (_ev, opts: { performerName: string; enabled: boolean }) => {
    const { setWatchlistEnabled } = await import('./services/performer-watchlist')
    setWatchlistEnabled(db, opts.performerName, opts.enabled)
    return { ok: true }
  })
  ipcMain.handle('watchlist:hits', async (_ev, opts?: {
    performerName?: string
    status?: 'pending' | 'queued' | 'dismissed' | 'downloaded'
    limit?: number
    offset?: number
  }) => {
    const { listHits } = await import('./services/performer-watchlist')
    return listHits(db, opts)
  })
  ipcMain.handle('watchlist:hit-status', async (_ev, opts: {
    hitId: string
    status: 'pending' | 'queued' | 'dismissed' | 'downloaded'
  }) => {
    const { setHitStatus } = await import('./services/performer-watchlist')
    setHitStatus(db, opts.hitId, opts.status)
    return { ok: true }
  })
  // Trigger an immediate poll cycle. The dispatcher is a thin
  // closure that maps each source name onto the existing Browse
  // adapters in ai-intelligence/index.ts. Returns stats so the user
  // can see "we tried Reddit, found 3 new posts" feedback.
  ipcMain.handle('watchlist:poll-now', async (_ev, opts?: { maxPerformers?: number }) => {
    const { runPollCycle } = await import('./services/performer-watchlist')
    return runPollCycle(db, async (entry, source) => {
      // Dispatcher routes each (entry, source) pair to the matching
      // Browse-source adapter. Returns Omit<WatchlistHit, 'id' |
      // 'discoveredAt' | 'status'>[] — the caller persists with
      // status='pending'. Unimplemented sources return [] silently.
      const sinceSec = entry.lastPolledAt ?? (Date.now() / 1000 - 30 * 86400)
      switch (source) {
        case 'reddit': {
          const { pullpushSearchSubmissions } = await import('./services/ai-intelligence/pullpush-client')
          const res = await pullpushSearchSubmissions({
            query: entry.performerName,
            after: Math.floor(sinceSec),
            size: 100,
            over18Only: true,
          })
          if (!res.ok) return []
          return res.items
            .filter((it) => it.url && (it.over_18 ?? true))
            .map((it) => ({
              performerName: entry.performerName,
              sourceName: 'reddit',
              sourceId: it.id,
              url: it.url ?? `https://www.reddit.com${it.permalink ?? ''}`,
              title: it.title ?? null,
              thumbUrl: (it.thumbnail && it.thumbnail !== 'nsfw' && it.thumbnail !== 'self')
                ? it.thumbnail : null,
              releasedAt: it.created_utc ?? null,
              notes: it.subreddit ? `r/${it.subreddit}` : null,
            }))
        }
        case 'tpdb': {
          const { getTpDBClient } = await import('./services/ai-intelligence/tpdb-client')
          const client = await getTpDBClient()
          if (!client) return []
          const scenes = await client.searchScenesByPerformer(entry.performerName, {
            perPage: 50,
            dateFromUnix: Math.floor(sinceSec),
          })
          return scenes
            .filter((s) => s.url || s.id)
            .map((s) => ({
              performerName: entry.performerName,
              sourceName: 'tpdb',
              sourceId: s.id,
              url: s.url ?? `https://theporndb.net/scenes/${s.id}`,
              title: s.title ?? null,
              thumbUrl: null,
              releasedAt: s.date ? Date.parse(s.date) / 1000 : null,
              notes: s.site?.name ? `studio:${s.site.name.toLowerCase()}` : null,
            }))
        }
        case 'bluesky': {
          const { searchBlueskyForWatchlist } = await import('./services/ai-intelligence/bluesky-watchlist')
          const hits = await searchBlueskyForWatchlist(entry.performerName, {
            sinceUnix: Math.floor(sinceSec),
            limit: 50,
          })
          return hits
            .filter((h) => h.url)
            .map((h) => ({
              performerName: entry.performerName,
              sourceName: 'bluesky',
              sourceId: h.sourceId,
              url: h.url,
              title: h.title,
              thumbUrl: h.thumbUrl,
              releasedAt: h.releasedAt,
              notes: null,
            }))
        }
        case 'redgifs':
        case 'e621':
        case 'danbooru':
        case 'gelbooru': {
          // Booru sources don't expose date filters in their search
          // APIs, so we rely on the hits table's unique index
          // (performer, source, sourceId) to dedup against past polls.
          // The user sees only NEW posts despite the absence of a
          // server-side `since` filter.
          const { searchBooru } = await import('./services/ai-intelligence/booru-client')
          const sourceMap = {
            redgifs: 'redgifs', e621: 'e621',
            danbooru: 'danbooru', gelbooru: 'gelbooru',
          } as const
          const booruSource = (sourceMap as any)[source]
          if (!booruSource) return []
          try {
            const result = await searchBooru(booruSource, entry.performerName, { perPage: 30, page: 0 })
            return result.posts.map((p) => ({
              performerName: entry.performerName,
              sourceName: source,
              sourceId: String(p.id ?? p.hash ?? p.file_url),
              url: p.source || p.file_url,
              title: null,
              thumbUrl: p.preview_url ?? p.sample_url ?? null,
              releasedAt: null,
              notes: p.tags ? p.tags.split(/\s+/).slice(0, 8).join(' ') : null,
            }))
          } catch (err) {
            console.warn(`[watchlist:${source}] search failed:`, err)
            return []
          }
        }
      }
    }, opts)
  })

  // Audio-peak highlight detector. Runs ffmpeg with astats over
  // 5-second windows, computes per-window z-score relative to the
  // video's own RMS distribution, merges adjacent peaks into runs,
  // returns the top N highlight candidates. Minimum-viable version
  // of #62 — no ML model required, works on any video with an audio
  // track. With autoApplyMarkers=true the highlights get inserted
  // into the markers table so they show up on the timeline.
  ipcMain.handle('media:audio-highlights', async (_ev, opts: {
    mediaId: string
    topN?: number
    minZ?: number
    maxLenSec?: number
    windowSec?: number
    autoApplyMarkers?: boolean
  }) => {
    if (!opts?.mediaId) return { ok: false, error: 'mediaId required', candidates: [] }
    if (!ffmpegBin) return { ok: false, error: 'ffmpeg not available', candidates: [] }
    let media: any
    try { media = (db as any).getMedia?.(opts.mediaId) } catch { /* ignore */ }
    if (!media?.path) return { ok: false, error: 'media not found', candidates: [] }
    const { detectHighlightsFromAudio } = await import('./services/ai-intelligence/audio-peak-detector')
    const candidates = await detectHighlightsFromAudio(media.path, ffmpegBin, {
      topN: opts.topN,
      minZ: opts.minZ,
      maxLenSec: opts.maxLenSec,
      windowSec: opts.windowSec,
    })
    let markersAdded = 0
    if (opts.autoApplyMarkers && candidates.length > 0) {
      for (let i = 0; i < candidates.length; i++) {
        const c = candidates[i]
        try {
          db.addMarker(
            opts.mediaId,
            c.startSec,
            `Highlight ${i + 1} (${(c.score * 100).toFixed(0)}%)`
          )
          markersAdded++
        } catch (err) {
          console.warn('[AudioHighlights] addMarker failed:', err)
        }
      }
      broadcast('vault:changed')
    }
    return { ok: true, candidates, markersAdded }
  })

  // Anitomy-style filename inspector. Exposes the structured parse
  // (studio / performers / date / resolution / codec / title / etc.)
  // so the UI can show "we'll resolve {performer} to X, {date} to Y"
  // before the user commits a bulk-rename template.
  ipcMain.handle('media:parse-filename', async (_ev, filename: string) => {
    if (typeof filename !== 'string' || filename.length === 0) {
      return { ok: false, error: 'filename required' }
    }
    const { parseFilename } = await import('./services/ai-intelligence/filename-tokenizer')
    try {
      const parsed = parseFilename(filename)
      // Strip rawTokens before returning — internal tokenizer state,
      // not useful to the renderer and adds payload weight.
      const { rawTokens, ...lean } = parsed
      void rawTokens
      return { ok: true, parsed: lean }
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })

  // Transcript FTS search — find videos whose whisper transcript
  // contains a phrase. Uses the FTS5 virtual table created in
  // migration v21. Empty query returns the most-recently-transcribed
  // items (handy for "show me what was just transcribed").
  ipcMain.handle('transcripts:search', async (_ev, opts: { query: string; limit?: number }) => {
    const query = String(opts?.query ?? '').trim()
    const limit = Math.max(1, Math.min(500, opts?.limit ?? 50))
    try {
      if (!query) {
        const rows = db.raw.prepare(`
          SELECT mt.media_id, mt.text, mt.language, mt.created_at,
                 m.filename, m.thumbPath
          FROM media_transcripts mt
          INNER JOIN media m ON m.id = mt.media_id
          ORDER BY mt.created_at DESC
          LIMIT ?
        `).all(limit) as any[]
        return { ok: true, items: rows, total: rows.length }
      }
      // FTS5 MATCH with phrase quoting; let SQLite's tokenizer split.
      // Escape any quote chars that would break the MATCH literal.
      const ftsQuery = `"${query.replace(/"/g, '""')}"`
      const rows = db.raw.prepare(`
        SELECT mt.media_id, mt.text, mt.language, mt.created_at,
               m.filename, m.thumbPath,
               snippet(media_transcripts_fts, 0, '<mark>', '</mark>', '…', 24) AS snippet
        FROM media_transcripts_fts fts
        INNER JOIN media_transcripts mt ON mt.rowid = fts.rowid
        INNER JOIN media m ON m.id = mt.media_id
        WHERE media_transcripts_fts MATCH ?
        ORDER BY rank
        LIMIT ?
      `).all(ftsQuery, limit) as any[]
      return { ok: true, items: rows, total: rows.length }
    } catch (err: any) {
      console.warn('[transcripts:search] failed:', err)
      return { ok: false, error: err?.message ?? String(err), items: [], total: 0 }
    }
  })

  ipcMain.handle('transcripts:get-for-media', async (_ev, mediaId: string) => {
    try {
      const row = db.raw.prepare(`
        SELECT text, language, source, created_at FROM media_transcripts WHERE media_id = ?
      `).get(mediaId) as any
      return { ok: !!row, transcript: row ?? null }
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err), transcript: null }
    }
  })

  // Czkawka-style staged scan — runs size → name → exact stages in
  // sequence, emitting `duplicates:stage` per stage so the renderer
  // can show progress + partial results without waiting for the slow
  // exact-hash pass at the end.
  ipcMain.handle('duplicates:stagedScan', async () => {
    const service = getDuplicatesFinderService(db)
    return service.stagedScan((stage) => {
      try {
        const win = BrowserWindow.getAllWindows()[0]
        win?.webContents.send('duplicates:stage', stage)
      } catch { /* sender gone */ }
    })
  })

  ipcMain.handle('duplicates:findByName', async () => {
    const service = getDuplicatesFinderService(db)
    return service.findNameDuplicates()
  })

  ipcMain.handle('duplicates:getGroupDetails', async (_ev, mediaIds: string[]) => {
    const service = getDuplicatesFinderService(db)
    return service.getDuplicateGroupDetails(mediaIds)
  })

  ipcMain.handle('duplicates:resolve', async (_ev, resolution: DuplicateResolution) => {
    const service = getDuplicatesFinderService(db)
    return service.resolveDuplicates(resolution)
  })

  ipcMain.handle('duplicates:suggestKeep', async (_ev, mediaIds: string[]) => {
    const service = getDuplicatesFinderService(db)
    return service.suggestKeep(mediaIds)
  })

  ipcMain.handle('duplicates:getStats', async () => {
    const service = getDuplicatesFinderService(db)
    return service.getStats()
  })

  ipcMain.handle('duplicates:computeHash', async (_ev, mediaId: string) => {
    const service = getDuplicatesFinderService(db)
    return service.computeFileHash(mediaId)
  })

  ipcMain.handle('duplicates:clearHashes', async () => {
    const service = getDuplicatesFinderService(db)
    return service.clearHashes()
  })

  ipcMain.handle('duplicates:findSimilarTo', async (_ev, mediaId: string) => {
    const service = getDuplicatesFinderService(db)
    return service.findSimilarTo(mediaId)
  })

  // Visual (perceptual) duplicates — uses 8x8 aHash on thumbnails to find
  // re-encodes / cropped / re-bitrated copies that byte-hash misses. Ported
  // from content_analyzer/advanced_features.py:VisualDuplicateScanner.
  ipcMain.handle('visualDuplicates:hashCoverage', async () => {
    return getVisualDuplicatesService(db).getHashCoverage()
  })

  ipcMain.handle('visualDuplicates:computeAllHashes', async (_ev, opts?: { onlyUnhashed?: boolean }) => {
    const service = getVisualDuplicatesService(db)
    return service.computeAllHashes(
      (p) => {
        try {
          const win = BrowserWindow.getAllWindows()[0]
          win?.webContents.send('visualDuplicates:progress', p)
        } catch {}
      },
      opts
    )
  })

  ipcMain.handle('visualDuplicates:abort', async () => {
    getVisualDuplicatesService(db).abort()
    return { ok: true }
  })

  ipcMain.handle('visualDuplicates:findGroups', async (_ev, opts?: { maxDistance?: number }) => {
    const service = getVisualDuplicatesService(db)
    const maxDistance = Math.max(0, Math.min(20, opts?.maxDistance ?? 5))
    return { groups: service.findVisualGroups(maxDistance), maxDistance }
  })

  ipcMain.handle('visualDuplicates:hashOne', async (_ev, mediaId: string) => {
    const row = db.raw.prepare(`SELECT thumbPath, path, type FROM media WHERE id = ?`).get(mediaId) as
      { thumbPath: string | null; path: string; type: string } | undefined
    if (!row) return { ok: false, error: 'Media not found' }
    const target = row.thumbPath && fs.existsSync(row.thumbPath)
      ? row.thumbPath
      : (row.type === 'image' ? row.path : null)
    if (!target) return { ok: false, error: 'No thumbnail or image to hash' }
    const service = getVisualDuplicatesService(db)
    const hash = await service.computePerceptualHash(target)
    if (!hash) return { ok: false, error: 'Hash computation failed' }
    db.raw.prepare(`UPDATE media SET phash = ? WHERE id = ?`).run(hash, mediaId)
    return { ok: true, phash: hash }
  })

  // Multi-frame video fingerprint — 5 evenly-spaced pHashes per video,
  // matched best-of-N. Catches re-encodes where the single-keyframe phash
  // above doesn't because the dominant keyframe shifted. Video-only by
  // design (image/gif covered by single-frame aHash).
  ipcMain.handle('visualDuplicates:mfCoverage', async () => {
    return getVisualDuplicatesService(db).getMultiFrameCoverage()
  })

  ipcMain.handle('visualDuplicates:mfComputeAll', async (_ev, opts?: { onlyUnhashed?: boolean }) => {
    if (!ffmpegBin) return { hashed: 0, skipped: 0, error: 'ffmpeg not available' }
    const service = getVisualDuplicatesService(db)
    return service.computeAllMultiFrameHashes(
      ffmpegBin,
      (p) => {
        try {
          const win = BrowserWindow.getAllWindows()[0]
          win?.webContents.send('visualDuplicates:mfProgress', p)
        } catch {}
      },
      opts
    )
  })

  ipcMain.handle('visualDuplicates:mfFindGroups', async (_ev, opts?: { maxDistance?: number; minMatches?: number }) => {
    const service = getVisualDuplicatesService(db)
    const maxDistance = Math.max(0, Math.min(20, opts?.maxDistance ?? 5))
    const minMatches = Math.max(1, Math.min(10, opts?.minMatches ?? 3))
    return { groups: service.findMultiFrameGroups(maxDistance, minMatches), maxDistance, minMatches }
  })

  ipcMain.handle('visualDuplicates:mfHashOne', async (_ev, mediaId: string) => {
    if (!ffmpegBin) return { ok: false, error: 'ffmpeg not available' }
    const service = getVisualDuplicatesService(db)
    const fp = await service.computeMultiFrameHash(mediaId, ffmpegBin)
    if (!fp) return { ok: false, error: 'Fingerprint failed (no duration / not a video / extraction error)' }
    return { ok: true, fingerprint: fp }
  })

  // Chromaprint audio-fingerprint dedup. Catches re-encodes that share
  // the audio track but differ visually (cropped / watermarked / re-encoded
  // codec). Requires fpcalc.exe — the IPCs return null/skip when missing.
  ipcMain.handle('visualDuplicates:cpCoverage', async () => {
    return getVisualDuplicatesService(db).getChromaprintCoverage()
  })

  ipcMain.handle('visualDuplicates:cpComputeAll', async (_ev, opts?: { onlyUnhashed?: boolean }) => {
    const service = getVisualDuplicatesService(db)
    return service.computeAllChromaprints(
      (p) => {
        try {
          const win = BrowserWindow.getAllWindows()[0]
          win?.webContents.send('visualDuplicates:cpProgress', p)
        } catch {}
      },
      opts
    )
  })

  ipcMain.handle('visualDuplicates:cpFindGroups', async (_ev, opts?: { threshold?: number }) => {
    const service = getVisualDuplicatesService(db)
    const threshold = Math.max(0.5, Math.min(0.99, opts?.threshold ?? 0.85))
    return { groups: await service.findChromaprintGroups(threshold), threshold }
  })

  ipcMain.handle('visualDuplicates:cpHashOne', async (_ev, mediaId: string) => {
    const service = getVisualDuplicatesService(db)
    const env = await service.computeChromaprint(mediaId)
    if (!env) return { ok: false, error: 'Chromaprint failed (no fpcalc / no audio / not a video)' }
    return { ok: true, fingerprint: env }
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // MOBILE SYNC SERVICE
  // ═══════════════════════════════════════════════════════════════════════════

  // Initialize mobile sync service dependencies
  const mobileSyncService = getMobileSyncService()
  mobileSyncService.getMediaList = async (opts) => {
    // Build sort clause
    let orderBy = 'addedAt DESC'
    switch (opts?.sort) {
      case 'oldest': orderBy = 'addedAt ASC'; break
      case 'name': orderBy = 'filename ASC'; break
      case 'size': orderBy = 'size DESC'; break
      case 'duration': orderBy = 'durationSec DESC NULLS LAST'; break
      case 'random': orderBy = 'RANDOM()'; break
      default: orderBy = 'addedAt DESC'
    }

    // Mobile-compatible formats - expanded for Android support
    // iOS: mp4, mov, m4v, webm (partial), heic
    // Android: mp4, mov, m4v, webm, mkv, avi (with codecs)
    // Build WHERE clause
    const conditions: string[] = []
    // Check file extension - most common playable video and image formats
    conditions.push(`(
      LOWER(SUBSTR(filename, -4)) IN ('.mp4', '.mov', '.m4v', '.mkv', '.avi', '.jpg', '.png', '.gif', '.bmp') OR
      LOWER(SUBSTR(filename, -5)) IN ('.jpeg', '.webp', '.heic', '.webm', '.avif') OR
      LOWER(SUBSTR(filename, -6)) IN ('.heics')
    )`)
    if (opts?.type) {
      conditions.push('type = @type')
    }

    const whereClause = conditions.length > 0 ? `WHERE (${conditions.join(') AND (')})` : ''

    const rows = db.raw.prepare(`
      SELECT id, path, filename, type, durationSec, size as sizeBytes, width, height, addedAt, thumbPath
      FROM media
      ${whereClause}
      ORDER BY ${orderBy}
      ${opts?.limit ? 'LIMIT @limit' : ''}
      ${opts?.offset ? 'OFFSET @offset' : ''}
    `).all(opts || {}) as any[]
    return rows
  }
  mobileSyncService.getMediaCount = async () => {
    // Count mobile-compatible media files
    const result = db.raw.prepare(`
      SELECT COUNT(*) as count FROM media
      WHERE (
        LOWER(SUBSTR(filename, -4)) IN ('.mp4', '.mov', '.m4v', '.mkv', '.avi', '.jpg', '.png', '.gif', '.bmp') OR
        LOWER(SUBSTR(filename, -5)) IN ('.jpeg', '.webp', '.heic', '.webm', '.avif') OR
        LOWER(SUBSTR(filename, -6)) IN ('.heics')
      )
    `).get() as { count: number }
    return result?.count || 0
  }
  mobileSyncService.getMediaById = async (id) => {
    return db.raw.prepare('SELECT * FROM media WHERE id = ?').get(id) as any
  }
  mobileSyncService.getPlaylists = async () => {
    return db.raw.prepare('SELECT * FROM playlists ORDER BY createdAt DESC').all() as any[]
  }
  mobileSyncService.getPlaylistItems = async (id) => {
    return db.raw.prepare(`
      SELECT m.id, m.filename, m.type, m.durationSec, m.thumbPath
      FROM playlist_items pi
      JOIN media m ON pi.mediaId = m.id
      WHERE pi.playlistId = ?
      ORDER BY pi.position ASC
    `).all(id) as any[]
  }
  mobileSyncService.addPlaylistItems = async (playlistId, mediaIds) => {
    db.playlistAddItems(playlistId, mediaIds)
    broadcast('vault:changed')
  }
  mobileSyncService.getTags = async () => {
    const rows = db.raw.prepare('SELECT name FROM tags ORDER BY name').all() as any[]
    return rows.map((r: any) => r.name)
  }
  mobileSyncService.getThumbPath = async (mediaPath) => {
    const row = db.raw.prepare('SELECT thumbPath FROM media WHERE path = ?').get(mediaPath) as any
    return row?.thumbPath || null
  }

  // Generate thumbnail on-demand for mobile
  mobileSyncService.generateThumb = async (mediaId) => {
    try {
      const media = db.getMedia(mediaId)
      if (!media) return null
      if (media.thumbPath && fs.existsSync(media.thumbPath)) {
        return media.thumbPath
      }
      let thumbPath: string | null = null
      if (media.type === 'video') {
        const dur = media.durationSec ?? await probeVideoDurationSec(media.path)
        thumbPath = await makeVideoThumb({
          mediaId,
          filePath: media.path,
          mtimeMs: media.mtimeMs,
          durationSec: dur
        })
      } else if (media.type === 'gif') {
        thumbPath = await makeGifThumb({
          mediaId,
          filePath: media.path,
          mtimeMs: media.mtimeMs,
          durationSec: null
        })
      } else if (media.type === 'image') {
        thumbPath = await makeImageThumb({
          mediaId,
          filePath: media.path,
          mtimeMs: media.mtimeMs
        })
      }
      if (thumbPath) {
        db.raw.prepare('UPDATE media SET thumbPath=? WHERE id=?').run(thumbPath, mediaId)
      }
      return thumbPath
    } catch (err: any) {
      console.error('[MobileSync] generateThumb failed:', mediaId, err?.message)
      return null
    }
  }

  // Stats & ratings for mobile
  mobileSyncService.setRating = async (mediaId, rating) => {
    const stats = db.statsSetRating(mediaId, rating)
    broadcast('vault:changed')
    return stats
  }

  mobileSyncService.recordView = async (mediaId) => {
    const stats = db.statsRecordView(mediaId)
    broadcast('vault:changed')
    return stats
  }

  mobileSyncService.getStats = async (mediaId) => {
    return db.statsGet(mediaId)
  }

  mobileSyncService.getAllRatings = async () => {
    // Get all media stats with rating > 0 or views > 0
    const rows = db.raw.prepare(`
      SELECT mediaId, rating, views
      FROM media_stats
      WHERE rating > 0 OR views > 0
      ORDER BY rating DESC, views DESC
    `).all() as Array<{ mediaId: string; rating: number; views: number }>
    return rows
  }

  mobileSyncService.bulkRecordViews = async (views) => {
    // Bulk record views from mobile
    let recorded = 0
    db.raw.transaction(() => {
      for (const v of views) {
        if (v.mediaId) {
          db.statsRecordView(v.mediaId)
          recorded++
        }
      }
    })()
    if (recorded > 0) {
      broadcast('vault:changed')
    }
    return recorded
  }

  // Markers/bookmarks for mobile
  mobileSyncService.getMarkers = async (mediaId) => {
    return db.listMarkers(mediaId)
  }

  mobileSyncService.addMarker = async (mediaId, timeSec, title) => {
    const marker = db.addMarker(mediaId, timeSec, title)
    broadcast('vault:changed')
    return marker
  }

  // Start mobile sync server
  ipcMain.handle('mobileSync:start', async (_ev, port?: number) => {
    try {
      const syncSettings = getMobileSyncSettings()
      const serverPort = port || syncSettings.port || 8765
      const result = await mobileSyncService.start(serverPort)
      if (result.success) {
        // Remember that sync server should be enabled on next app launch
        updateMobileSyncSettings({ serverEnabled: true, port: serverPort })
      }
      return result
    } catch (e: any) {
      console.error('[MobileSync] Start error:', e)
      return { success: false, error: e.message }
    }
  })

  // Stop mobile sync server
  ipcMain.handle('mobileSync:stop', async () => {
    try {
      await mobileSyncService.stop()
      // Remember that sync server should be disabled on next app launch
      updateMobileSyncSettings({ serverEnabled: false })
      return { success: true }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  })

  // Get server status
  ipcMain.handle('mobileSync:getStatus', async () => {
    return mobileSyncService.getStatus()
  })

  // Cross-device access URLs (#26). Categorizes the running server's
  // bind addresses into LAN / Tailscale / other so the user can pick
  // the right one to share with another device. Also generates pairing
  // tokens on demand for cross-device clients (the existing pairing-
  // CODE flow is mobile-only; tokens here are for any HTTP client).
  ipcMain.handle('crossDevice:getAccessUrls', async () => {
    return (mobileSyncService as any).getAccessUrls?.() ?? { running: false, port: 8765, lan: [], tailscale: [], other: [] }
  })
  ipcMain.handle('crossDevice:generateToken', async (_ev, deviceLabel?: string) => {
    return (mobileSyncService as any).generatePairingToken?.(deviceLabel ?? 'Cross-device client')
      ?? { id: '', token: '', deviceId: '' }
  })

  // Generate pairing code
  ipcMain.handle('mobileSync:generatePairingCode', async () => {
    try {
      return mobileSyncService.generatePairingCode()
    } catch (e: any) {
      return { code: '', expiresAt: 0, qrData: '', error: e.message }
    }
  })

  // Get paired devices
  ipcMain.handle('mobileSync:getPairedDevices', async () => {
    return mobileSyncService.getPairedDevices()
  })

  // Unpair a device
  ipcMain.handle('mobileSync:unpairDevice', async (_ev, deviceId: string) => {
    return { success: mobileSyncService.unpairDevice(deviceId) }
  })

  // Set up mobile sync event forwarding
  mobileSyncService.on('started', (data: any) => {
    broadcast('mobileSync:started', data)
  })
  mobileSyncService.on('stopped', () => {
    broadcast('mobileSync:stopped')
  })
  mobileSyncService.on('devicePaired', (device: any) => {
    broadcast('mobileSync:devicePaired', device)
  })
  mobileSyncService.on('deviceUnpaired', (device: any) => {
    broadcast('mobileSync:deviceUnpaired', device)
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // URL DOWNLOADER SERVICE
  // ═══════════════════════════════════════════════════════════════════════════

  const urlDownloader = getUrlDownloaderService()

  // Check if yt-dlp is available
  ipcMain.handle('urlDownloader:checkAvailability', async () => {
    return urlDownloader.checkAvailability()
  })

  // Add a URL to download queue
  ipcMain.handle('urlDownloader:addDownload', async (_ev, url: string, options?: any) => {
    try {
      const item = await urlDownloader.addDownload(url, options, 'desktop')
      return { success: true, item }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  // Get all downloads
  ipcMain.handle('urlDownloader:getDownloads', async () => {
    return urlDownloader.getDownloads()
  })

  // Cancel a download
  ipcMain.handle('urlDownloader:cancelDownload', async (_ev, id: string) => {
    return { success: urlDownloader.cancelDownload(id) }
  })

  // Remove a download from history
  ipcMain.handle('urlDownloader:removeDownload', async (_ev, id: string) => {
    return { success: urlDownloader.removeDownload(id) }
  })

  // Clear completed downloads
  ipcMain.handle('urlDownloader:clearCompleted', async () => {
    return { cleared: urlDownloader.clearCompleted() }
  })

  // Get/set download directory
  ipcMain.handle('urlDownloader:getDownloadDir', async () => {
    return urlDownloader.getDownloadDir()
  })

  ipcMain.handle('urlDownloader:setDownloadDir', async (_ev, dir: string) => {
    urlDownloader.setDownloadDir(dir)
    return { success: true }
  })

  // Open download in file explorer
  ipcMain.handle('urlDownloader:openDownload', async (_ev, id: string) => {
    const item = urlDownloader.getDownload(id)
    if (item?.outputPath && fs.existsSync(item.outputPath)) {
      const { shell } = await import('electron')
      shell.showItemInFolder(item.outputPath)
      return { success: true }
    }
    return { success: false, error: 'File not found' }
  })

  // Import completed download to library
  ipcMain.handle('urlDownloader:importToLibrary', async (_ev, id: string) => {
    const item = urlDownloader.getDownload(id)
    if (!item?.outputPath || !fs.existsSync(item.outputPath)) {
      return { success: false, error: 'File not found' }
    }

    try {
      // Import the downloaded file to library
      const fileStat = fs.statSync(item.outputPath)
      const media = db.upsertMedia({
        type: 'video',
        path: item.outputPath,
        filename: path.basename(item.outputPath),
        ext: path.extname(item.outputPath).toLowerCase().slice(1),
        size: fileStat.size,
        mtimeMs: fileStat.mtimeMs,
        durationSec: null,
        thumbPath: null,
        width: null,
        height: null,
        hashSha256: null,
        phash: null
      })

      // Queue for analysis (thumbnail, duration, etc.)
      db.enqueueJob('media:analyze', { mediaId: media.id }, 5)

      broadcast('vault:changed')
      return { success: true, mediaId: media.id }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  // Forward URL downloader events to renderer
  urlDownloader.on('download:added', (item: any) => {
    broadcast('urlDownloader:added', item)
  })
  urlDownloader.on('download:started', (item: any) => {
    broadcast('urlDownloader:started', item)
  })
  urlDownloader.on('download:progress', (item: any) => {
    broadcast('urlDownloader:progress', item)
  })
  urlDownloader.on('download:completed', (item: any) => {
    broadcast('urlDownloader:completed', item)
    // Show native notification
    const notifications = getNotificationsService()
    notifications.downloadComplete(item.title || 'Video', item.source)
    // #274 ntfy fan-out
    void (async () => {
      try {
        const { notifyEvent } = await import('./services/ntfy-gateway')
        await notifyEvent('download_complete', { filename: item.title || item.url })
      } catch { /* ignore */ }
    })()
    // #224 Auto-NSFW tagging — if the source URL host is on the
    // StevenBlack porn-only list, tag the media as `nsfw` + platform
    // name once the scanner ingests it (poll up to 30s).
    void (async () => {
      try {
        if (!item?.url || !item?.outputPath) return
        const { matchUrl } = await import('./services/ai-intelligence/hosts-blocklist')
        const match = matchUrl(item.url)
        if (!match) return
        const deadline = Date.now() + 30_000
        let mediaRow: any = null
        while (Date.now() < deadline) {
          mediaRow = db.raw.prepare('SELECT id FROM media WHERE path = ? LIMIT 1').get(item.outputPath)
          if (mediaRow?.id) break
          await new Promise((r) => setTimeout(r, 1500))
        }
        if (!mediaRow?.id) return
        db.addTagToMedia(mediaRow.id, 'nsfw')
        if (match.platform) db.addTagToMedia(mediaRow.id, `platform:${match.platform}`)
        console.log(`[hosts-blocklist] auto-tagged ${mediaRow.id} as nsfw + platform:${match.platform} (matched ${match.matched})`)
      } catch (err) {
        console.warn('[hosts-blocklist] auto-tag failed (non-fatal):', err)
      }
    })()
  })
  urlDownloader.on('download:error', (item: any) => {
    broadcast('urlDownloader:error', item)
    // Show native notification for errors
    const notifications = getNotificationsService()
    notifications.downloadFailed(item.title || 'Video', item.error || 'Unknown error')
  })
  urlDownloader.on('download:cancelled', (item: any) => {
    broadcast('urlDownloader:cancelled', item)
  })

  // Add REST API endpoint for mobile to trigger downloads
  mobileSyncService.addDownloadFromUrl = async (url: string, source: 'desktop' | 'mobile' = 'mobile') => {
    const item = await urlDownloader.addDownload(url, undefined, source)
    return item
  }

  // ─────────────────────────────────────────────────────────────────────────
  // BIDIRECTIONAL SYNC DEPENDENCIES
  // ─────────────────────────────────────────────────────────────────────────

  // Get all favorites (items with rating >= 4 or rating = 5 specifically)
  mobileSyncService.getFavorites = async () => {
    const rows = db.raw.prepare(`
      SELECT ms.mediaId, ms.rating
      FROM media_stats ms
      WHERE ms.rating >= 4
      ORDER BY ms.rating DESC, ms.updatedAt DESC
    `).all() as Array<{ mediaId: string; rating: number }>
    return rows
  }

  // Sync favorites from mobile (rating 5 = favorite, rating < 5 = unfavorited)
  mobileSyncService.syncFavorites = async (items) => {
    let synced = 0
    db.raw.transaction(() => {
      for (const item of items) {
        if (item.isFavorite) {
          // Set rating to 5 (favorite)
          db.statsSetRating(item.mediaId, 5)
        } else {
          // If currently 5, set to 0 (unfavorite)
          const current = db.statsGet(item.mediaId)
          if (current?.rating === 5) {
            db.statsSetRating(item.mediaId, 0)
          }
        }
        synced++
      }
    })()
    if (synced > 0) {
      broadcast('vault:changed')
    }
    return { synced }
  }

  // Get watch history since a timestamp
  mobileSyncService.getWatchHistory = async (since?: number) => {
    let query = `
      SELECT ms.mediaId, ms.views, ms.lastViewedAt
      FROM media_stats ms
      WHERE ms.lastViewedAt IS NOT NULL
    `
    if (since) {
      query += ` AND ms.lastViewedAt > ${since}`
    }
    query += ` ORDER BY ms.lastViewedAt DESC LIMIT 1000`

    const rows = db.raw.prepare(query).all() as Array<{ mediaId: string; views: number; lastViewedAt: number }>
    return rows
  }

  // Sync watch history from mobile
  mobileSyncService.syncWatchHistory = async (items) => {
    let synced = 0
    db.raw.transaction(() => {
      for (const item of items) {
        if (item.mediaId && item.viewedAt) {
          db.statsRecordView(item.mediaId)
          synced++
        }
      }
    })()
    if (synced > 0) {
      broadcast('vault:changed')
    }
    return { synced }
  }

  // Get sync state
  mobileSyncService.getSyncState = async () => {
    const mediaCount = db.countMedia({})
    const favoritesResult = db.raw.prepare(`
      SELECT COUNT(*) as count FROM media_stats WHERE rating >= 4
    `).get() as { count: number }

    return {
      lastSync: Date.now(),
      mediaCount,
      favoritesCount: favoritesResult?.count || 0
    }
  }

  // Auto-organize NSFW Soundpack on startup
  void autoOrganizeSoundpack()

  // Auto-start mobile sync server if enabled in settings
  const mobileSyncSettings = getMobileSyncSettings()
  if (mobileSyncSettings.serverEnabled) {
    console.log('[MobileSync] Auto-starting server (was enabled in previous session)')
    mobileSyncService.start(mobileSyncSettings.port).then(result => {
      if (result.success) {
        console.log('[MobileSync] Auto-start successful on port', result.port)
      } else {
        console.warn('[MobileSync] Auto-start failed:', result.error)
      }
    }).catch(err => {
      console.error('[MobileSync] Auto-start error:', err)
    })
  }

  // ─────────────────────────────────────────────────────────────────────────
  //   Cloudflare Tunnel (#189) — one-click NAT-traversal alternative to
  //   Tailscale. Spawns `cloudflared tunnel --url http://127.0.0.1:<port>`
  //   and parses stdout for the trycloudflare.com URL it prints. Process
  //   stays alive until tunnelStop is called or the app exits.
  // ─────────────────────────────────────────────────────────────────────────

  let cloudflaredProc: import('node:child_process').ChildProcess | null = null
  let cloudflaredUrl: string | null = null

  // ─────────────────────────────────────────────────────────────────────────
  //   Home Assistant MQTT integration (#185) — Vault publishes as a
  //   media_player entity via MQTT auto-discovery. HA-side users can
  //   automate around play/pause/idle state + send commands back.
  // ─────────────────────────────────────────────────────────────────────────

  ipcMain.handle('homeassistant:start', async (_ev, args: { brokerUrl: string; username?: string; password?: string }) => {
    try {
      const { startHaMqtt } = await import('./services/home-assistant-mqtt')
      return await startHaMqtt({
        ...args,
        onCommand: (cmd) => {
          try {
            const win = BrowserWindow.getAllWindows()[0]
            win?.webContents.send('homeassistant:command', cmd)
          } catch (err) {
            console.warn('[HA-MQTT] forward to renderer failed:', err)
          }
        },
      })
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })

  ipcMain.handle('homeassistant:stop', async () => {
    try {
      const { stopHaMqtt } = await import('./services/home-assistant-mqtt')
      await stopHaMqtt()
      return { ok: true }
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })

  ipcMain.handle('homeassistant:publishState', async (_ev, state: 'playing' | 'paused' | 'idle' | 'off') => {
    try {
      const { publishHaState } = await import('./services/home-assistant-mqtt')
      publishHaState(state)
      return { ok: true }
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })

  ipcMain.handle('homeassistant:status', async () => {
    try {
      const { isHaMqttConnected } = await import('./services/home-assistant-mqtt')
      return { connected: isHaMqttConnected() }
    } catch {
      return { connected: false }
    }
  })

  // ─────────────────────────────────────────────────────────────────────────
  //   Synology File Station integration (#187) — one-way push to a
  //   user-configured NAS folder. Auth via DSM credentials in
  //   settings.backup.synology* keys. Two-way sync + change-detection
  //   is a follow-on; this commit ships the auth + upload primitives
  //   so user-level scripts can compose a real sync.
  // ─────────────────────────────────────────────────────────────────────────

  let _synologySid: string | null = null
  let _synologyHost: string | null = null

  ipcMain.handle('synology:auth', async (_ev, args?: { host?: string; username?: string; password?: string }) => {
    try {
      const { getSettings } = await import('./settings')
      const s = getSettings() as any
      const host = args?.host ?? String(s?.backup?.synologyHost ?? '').trim()
      const user = args?.username ?? String(s?.backup?.synologyUsername ?? '').trim()
      const pass = args?.password ?? String(s?.backup?.synologyPassword ?? '').trim()
      if (!host || !user || !pass) return { ok: false, error: 'Synology host/user/password not configured' }
      const url = `${host.replace(/\/$/, '')}/webapi/auth.cgi?api=SYNO.API.Auth&method=login&version=3&account=${encodeURIComponent(user)}&passwd=${encodeURIComponent(pass)}&session=Vault&format=sid`
      const res = await fetch(url)
      if (!res.ok) return { ok: false, error: `Synology auth HTTP ${res.status}` }
      const json = await res.json() as any
      if (!json?.success || !json?.data?.sid) {
        return { ok: false, error: `Synology auth failed: ${JSON.stringify(json?.error ?? 'unknown')}` }
      }
      _synologySid = String(json.data.sid)
      _synologyHost = host
      return { ok: true, sid: _synologySid }
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })

  ipcMain.handle('synology:logout', async () => {
    if (!_synologySid || !_synologyHost) return { ok: true, wasLoggedIn: false }
    try {
      const url = `${_synologyHost}/webapi/auth.cgi?api=SYNO.API.Auth&method=logout&version=3&session=Vault`
      await fetch(url)
    } catch { /* best effort */ }
    _synologySid = null
    _synologyHost = null
    return { ok: true, wasLoggedIn: true }
  })

  ipcMain.handle('synology:listDir', async (_ev, args: { folderPath: string }) => {
    if (!_synologySid || !_synologyHost) return { ok: false, error: 'Not authenticated. Run synology:auth first.', files: [] }
    try {
      const url = `${_synologyHost}/webapi/entry.cgi?api=SYNO.FileStation.List&version=2&method=list&folder_path=${encodeURIComponent(args.folderPath)}&_sid=${_synologySid}`
      const res = await fetch(url)
      if (!res.ok) return { ok: false, error: `Synology list HTTP ${res.status}`, files: [] }
      const json = await res.json() as any
      if (!json?.success) return { ok: false, error: `Synology list error ${JSON.stringify(json?.error ?? 'unknown')}`, files: [] }
      return { ok: true, files: json?.data?.files ?? [] }
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err), files: [] }
    }
  })

  // upload IPC accepts a local path + the Synology destination dir;
  // streams the file via multipart POST to SYNO.FileStation.Upload.
  ipcMain.handle('synology:uploadFile', async (_ev, args: { localPath: string; remoteDir: string; overwrite?: boolean }) => {
    if (!_synologySid || !_synologyHost) return { ok: false, error: 'Not authenticated. Run synology:auth first.' }
    try {
      if (!fs.existsSync(args.localPath)) return { ok: false, error: 'localPath does not exist' }
      const boundary = `----vault-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      const filename = path.basename(args.localPath)
      const fileBuf = await fsp.readFile(args.localPath)
      const fields: Array<[string, string]> = [
        ['api', 'SYNO.FileStation.Upload'],
        ['version', '2'],
        ['method', 'upload'],
        ['path', args.remoteDir],
        ['create_parents', 'true'],
        ['overwrite', args.overwrite ? 'true' : 'false'],
      ]
      const parts: Buffer[] = []
      for (const [k, v] of fields) {
        parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`, 'utf8'))
      }
      parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: application/octet-stream\r\n\r\n`, 'utf8'))
      parts.push(fileBuf)
      parts.push(Buffer.from(`\r\n--${boundary}--\r\n`, 'utf8'))
      const body = Buffer.concat(parts)
      const url = `${_synologyHost}/webapi/entry.cgi?_sid=${_synologySid}`
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
        body,
      })
      if (!res.ok) return { ok: false, error: `Synology upload HTTP ${res.status}` }
      const json = await res.json() as any
      if (!json?.success) return { ok: false, error: `Synology upload error ${JSON.stringify(json?.error ?? 'unknown')}` }
      return { ok: true, bytes: fileBuf.length }
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })

  // ─────────────────────────────────────────────────────────────────────────
  //   Chromecast sender (#183) — discover Chromecast devices on the
  //   LAN via mDNS, push current media via the Default Media Receiver.
  // ─────────────────────────────────────────────────────────────────────────

  ipcMain.handle('chromecast:discover', async () => {
    try {
      const { discoverChromecasts } = await import('./services/chromecast-sender')
      const list = await discoverChromecasts()
      return { ok: true, devices: list }
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err), devices: [] }
    }
  })

  ipcMain.handle('chromecast:cast', async (_ev, args: {
    deviceName: string
    mediaUrl: string
    title?: string
    contentType?: string
  }) => {
    try {
      const { castToChromecast } = await import('./services/chromecast-sender')
      return await castToChromecast(args)
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })

  ipcMain.handle('chromecast:control', async (_ev, args: {
    deviceName: string
    action: 'pause' | 'resume' | 'stop' | 'seek'
    seekSeconds?: number
  }) => {
    try {
      const { chromecastControl } = await import('./services/chromecast-sender')
      return await chromecastControl(args)
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })

  ipcMain.handle('network:cloudflare-tunnel-start', async (_ev, args?: { port?: number }) => {
    const port = args?.port ?? mobileSyncService.getStatus().port ?? 8765
    if (cloudflaredProc && !cloudflaredProc.killed) {
      return { ok: true, alreadyRunning: true, url: cloudflaredUrl }
    }
    try {
      const { spawn } = await import('node:child_process')
      // Try cloudflared on PATH first; user installs it themselves
      // (one-line winget install Cloudflare.cloudflared).
      cloudflaredProc = spawn('cloudflared', [
        'tunnel', '--no-autoupdate', '--url', `http://127.0.0.1:${port}`,
      ], { windowsHide: true })
      cloudflaredUrl = null
      const url: string | null = await new Promise((resolve) => {
        let resolved = false
        const handler = (chunk: Buffer) => {
          const text = chunk.toString('utf8')
          // cloudflared logs the trycloudflare URL once on startup.
          const match = text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/i)
          if (match && !resolved) {
            resolved = true
            cloudflaredUrl = match[0]
            resolve(match[0])
          }
        }
        cloudflaredProc?.stdout?.on('data', handler)
        cloudflaredProc?.stderr?.on('data', handler)
        cloudflaredProc?.on('error', (err) => {
          if (!resolved) { resolved = true; resolve(null) }
          console.warn('[Cloudflared] spawn error:', err.message)
        })
        // 30s timeout — if no URL appears, the binary is missing or
        // the user's network is blocked.
        setTimeout(() => { if (!resolved) { resolved = true; resolve(null) } }, 30_000)
      })
      if (!url) {
        try { cloudflaredProc?.kill() } catch { /* noop */ }
        cloudflaredProc = null
        return { ok: false, error: 'cloudflared did not report a tunnel URL within 30s. Is the binary installed (winget install Cloudflare.cloudflared)?' }
      }
      return { ok: true, url, port }
    } catch (err: any) {
      cloudflaredProc = null
      return { ok: false, error: err?.message ?? String(err) }
    }
  })

  ipcMain.handle('network:cloudflare-tunnel-stop', async () => {
    if (!cloudflaredProc) return { ok: true, wasRunning: false }
    try {
      cloudflaredProc.kill()
      cloudflaredProc = null
      cloudflaredUrl = null
      return { ok: true, wasRunning: true }
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })

  ipcMain.handle('network:cloudflare-tunnel-status', async () => {
    return {
      running: !!(cloudflaredProc && !cloudflaredProc.killed),
      url: cloudflaredUrl,
    }
  })

  // ─────────────────────────────────────────────────────────────────────────
  //   ZeroTier (#190) — detect locally installed ZeroTier One client, list
  //   joined networks, surface the assigned 10.147.x.x / fd80::* addresses
  //   alongside the existing Tailscale 100.64/10 detection. Local API at
  //   127.0.0.1:9993 with bearer auth from the on-disk authtoken.secret.
  // ─────────────────────────────────────────────────────────────────────────

  // ─────────────────────────────────────────────────────────────────────────
  //   Restic backup (#200) — wraps the user's installed restic binary
  //   to push encrypted dedup snapshots of <userData> + selected media
  //   dirs to a B2/S3/SFTP/rclone target. Settings supply the repo URI,
  //   password file, and optional paths to include/exclude.
  // ─────────────────────────────────────────────────────────────────────────

  // ─────────────────────────────────────────────────────────────────────────
  //   WebDAV server (#181) — mounts the library as a network drive.
  //   Reuses mobileSyncService's token store so the same bearer tokens
  //   authorize WebDAV requests.
  // ─────────────────────────────────────────────────────────────────────────

  ipcMain.handle('webdav:start', async (_ev, args?: { port?: number }) => {
    const port = args?.port ?? 9997
    try {
      const { startWebDavServer } = await import('./services/webdav-server')
      const r = await startWebDavServer(port, {
        db,
        validToken: (token: string) => {
          // Accept tokens from the mobile-sync token store. The
          // CrossDeviceCard generates these.
          try {
            const allTokens = (mobileSyncService as any).getAllTokens?.() ?? []
            return Array.isArray(allTokens) && allTokens.some((t: any) => t?.token === token)
          } catch {
            return false
          }
        },
      })
      return { ok: true, port: r.port }
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })

  ipcMain.handle('webdav:stop', async () => {
    const { stopWebDavServer } = await import('./services/webdav-server')
    await stopWebDavServer()
    return { ok: true }
  })

  ipcMain.handle('webdav:status', async () => {
    const { getWebDavStatus } = await import('./services/webdav-server')
    return getWebDavStatus()
  })

  ipcMain.handle('backup:restic-snapshot', async (_ev, args?: {
    extraPaths?: string[]   // additional source dirs beyond <userData>
    tag?: string            // restic --tag for organization
  }) => {
    try {
      const { getSettings } = await import('./settings')
      const s = getSettings() as any
      const repo = String(s?.backup?.resticRepo ?? '').trim()
      const pwFile = String(s?.backup?.resticPasswordFile ?? '').trim()
      if (!repo) return { ok: false, error: 'settings.backup.resticRepo not configured' }
      if (!pwFile || !fs.existsSync(pwFile)) {
        return { ok: false, error: 'settings.backup.resticPasswordFile missing or path does not exist' }
      }
      const paths = [
        app.getPath('userData'),
        ...(Array.isArray(args?.extraPaths) ? args!.extraPaths : []),
      ].filter(p => p && fs.existsSync(p))
      if (paths.length === 0) return { ok: false, error: 'No valid source paths to back up' }

      const { spawn } = await import('node:child_process')
      const tagArgs = args?.tag ? ['--tag', args.tag] : []
      const cliArgs = ['backup', ...tagArgs, ...paths]
      console.log(`[Restic] running: restic ${cliArgs.join(' ')}`)
      const proc = spawn('restic', cliArgs, {
        env: {
          ...process.env,
          RESTIC_REPOSITORY: repo,
          RESTIC_PASSWORD_FILE: pwFile,
        },
        windowsHide: true,
      })
      let stdout = ''
      let stderr = ''
      proc.stdout?.on('data', (c) => { stdout += c.toString('utf8') })
      proc.stderr?.on('data', (c) => { stderr += c.toString('utf8') })
      const exit = await new Promise<number | null>((resolve) => {
        proc.on('error', () => resolve(-1))
        proc.on('close', (code) => resolve(code))
      })
      if (exit !== 0) {
        return { ok: false, error: `restic exit ${exit}: ${stderr.slice(-500)}` }
      }
      // Parse the summary line restic prints at the end.
      const filesNew = (stdout.match(/Files:\s+(\d+) new/) ?? [])[1]
      const dataAdded = (stdout.match(/Added to the repository:\s+([^\s]+ \w+)/) ?? [])[1]
      const snapshotId = (stdout.match(/snapshot ([a-f0-9]{8})/) ?? [])[1]
      return {
        ok: true,
        snapshotId: snapshotId ?? null,
        filesNew: filesNew ? Number(filesNew) : null,
        dataAdded: dataAdded ?? null,
        tail: stdout.slice(-1000),
      }
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })

  ipcMain.handle('backup:restic-snapshots', async () => {
    try {
      const { getSettings } = await import('./settings')
      const s = getSettings() as any
      const repo = String(s?.backup?.resticRepo ?? '').trim()
      const pwFile = String(s?.backup?.resticPasswordFile ?? '').trim()
      if (!repo || !pwFile) return { ok: false, error: 'Restic not configured', snapshots: [] }
      const { spawn } = await import('node:child_process')
      const proc = spawn('restic', ['snapshots', '--json', '--latest', '20'], {
        env: { ...process.env, RESTIC_REPOSITORY: repo, RESTIC_PASSWORD_FILE: pwFile },
        windowsHide: true,
      })
      let stdout = ''
      proc.stdout?.on('data', (c) => { stdout += c.toString('utf8') })
      const exit = await new Promise<number | null>((resolve) => {
        proc.on('error', () => resolve(-1))
        proc.on('close', (code) => resolve(code))
      })
      if (exit !== 0) return { ok: false, error: `restic snapshots exit ${exit}`, snapshots: [] }
      try {
        const parsed = JSON.parse(stdout)
        return { ok: true, snapshots: Array.isArray(parsed) ? parsed : [] }
      } catch {
        return { ok: false, error: 'restic snapshots: non-JSON output', snapshots: [] }
      }
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err), snapshots: [] }
    }
  })

  // ─────────────────────────────────────────────────────────────────────────
  //   Panic webhook receiver (#186) — listens for POST hits from
  //   Frigate / Home Assistant / any HTTP source. On hit, broadcasts
  //   'system:panic' to the renderer which can wire its UI hide /
  //   incognito-on response.
  // ─────────────────────────────────────────────────────────────────────────

  let panicHttp: import('node:http').Server | null = null
  ipcMain.handle('network:panic-webhook-start', async (_ev, args?: { port?: number; secret?: string }) => {
    if (panicHttp) {
      try { panicHttp.close() } catch { /* noop */ }
      panicHttp = null
    }
    const port = args?.port ?? 8771
    const secret = args?.secret ?? ''
    try {
      const httpMod = await import('node:http')
      panicHttp = httpMod.createServer((req, res) => {
        if (req.method !== 'POST') {
          res.writeHead(405); res.end('POST only'); return
        }
        if (secret) {
          const hdr = String(req.headers['x-vault-secret'] ?? '')
          if (hdr !== secret) {
            res.writeHead(401); res.end('Unauthorized'); return
          }
        }
        // Trigger panic regardless of body content.
        try {
          const win = BrowserWindow.getAllWindows()[0]
          win?.webContents.send('system:panic', { source: req.headers['user-agent'] ?? 'webhook', at: Date.now() })
        } catch (err) {
          console.warn('[Panic webhook] broadcast failed:', err)
        }
        res.writeHead(204); res.end()
      })
      await new Promise<void>((resolve, reject) => {
        panicHttp!.once('error', reject)
        panicHttp!.listen(port, () => resolve())
      })
      console.log(`[Panic webhook] Listening on http://127.0.0.1:${port}/`)
      return { ok: true, port }
    } catch (err: any) {
      panicHttp = null
      return { ok: false, error: err?.message ?? String(err) }
    }
  })

  ipcMain.handle('network:panic-webhook-stop', async () => {
    if (!panicHttp) return { ok: true, wasRunning: false }
    await new Promise<void>((resolve) => panicHttp!.close(() => resolve()))
    panicHttp = null
    return { ok: true, wasRunning: true }
  })

  ipcMain.handle('network:panic-webhook-status', async () => {
    return { running: !!panicHttp }
  })

  ipcMain.handle('network:zerotier-status', async () => {
    try {
      const fsMod = await import('node:fs/promises')
      const pathMod = await import('node:path')
      // ZeroTier One install paths per platform.
      const candidates = process.platform === 'win32'
        ? [pathMod.join(process.env.PROGRAMDATA || 'C:\\ProgramData', 'ZeroTier', 'One', 'authtoken.secret')]
        : process.platform === 'darwin'
          ? ['/Library/Application Support/ZeroTier/One/authtoken.secret']
          : ['/var/lib/zerotier-one/authtoken.secret']

      let token: string | null = null
      for (const p of candidates) {
        try {
          token = (await fsMod.readFile(p, 'utf8')).trim()
          if (token) break
        } catch { /* try next */ }
      }
      if (!token) {
        return { installed: false, networks: [], addresses: [] }
      }
      // GET /network → array of joined networks
      const httpMod = await import('node:http')
      const networks = await new Promise<any[]>((resolve) => {
        const req = httpMod.request({
          hostname: '127.0.0.1', port: 9993, path: '/network', method: 'GET',
          headers: { 'X-ZT1-Auth': token! },
          timeout: 2000,
        }, (res) => {
          let body = ''
          res.on('data', c => body += c)
          res.on('end', () => {
            try { resolve(JSON.parse(body)) } catch { resolve([]) }
          })
        })
        req.on('error', () => resolve([]))
        req.on('timeout', () => { try { req.destroy() } catch {} ; resolve([]) })
        req.end()
      })
      const addresses: Array<{ ip: string; network: string; networkName: string }> = []
      for (const n of networks ?? []) {
        const nName = String(n?.name ?? n?.id ?? '')
        const nId = String(n?.id ?? '')
        for (const ipCidr of (n?.assignedAddresses ?? []) as string[]) {
          const ip = String(ipCidr).split('/')[0]
          if (ip) addresses.push({ ip, network: nId, networkName: nName })
        }
      }
      return { installed: true, networks, addresses }
    } catch (err: any) {
      return { installed: false, networks: [], addresses: [], error: err?.message }
    }
  })

  // ─────────────────────────────────────────────────────────────────────────
  //   #208 — Browse-thumbnail phash background indexer + lookup.
  //   Renderer enqueues URLs after each search render, then asks the
  //   service whether any cached phash collides (within distance) with
  //   a local media row so the card can show a "you already have this"
  //   badge.
  // ─────────────────────────────────────────────────────────────────────────

  ipcMain.handle('browse:phash-enqueue', async (_ev, urls: string[]) => {
    try {
      const { getBrowsePhashIndexer } = await import('./services/browse-phash-indexer')
      return getBrowsePhashIndexer(db).enqueue(Array.isArray(urls) ? urls : [])
    } catch (err: any) {
      return { queued: 0, alreadyCached: 0, error: err?.message ?? String(err) }
    }
  })

  ipcMain.handle('browse:phash-lookup', async (_ev, urls: string[]) => {
    try {
      const { getBrowsePhashIndexer } = await import('./services/browse-phash-indexer')
      return getBrowsePhashIndexer(db).lookup(Array.isArray(urls) ? urls : [])
    } catch (err: any) {
      return {}
    }
  })

  ipcMain.handle('browse:phash-find-similar', async (_ev, phashes: string[], maxDist?: number) => {
    try {
      const { getBrowsePhashIndexer } = await import('./services/browse-phash-indexer')
      return getBrowsePhashIndexer(db).findSimilarLocal(Array.isArray(phashes) ? phashes : [], maxDist ?? 8)
    } catch (err: any) {
      return {}
    }
  })

  ipcMain.handle('browse:phash-stats', async () => {
    try {
      const { getBrowsePhashIndexer } = await import('./services/browse-phash-indexer')
      return getBrowsePhashIndexer(db).getStats()
    } catch {
      return { cachedUrls: 0, queueDepth: 0, inFlight: 0 }
    }
  })

  ipcMain.handle('browse:phash-set-enabled', async (_ev, enabled: boolean) => {
    try {
      const { getBrowsePhashIndexer } = await import('./services/browse-phash-indexer')
      getBrowsePhashIndexer(db).setEnabled(!!enabled)
      return { ok: true }
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })

  // ─────────────────────────────────────────────────────────────────────────
  //   #206 — DB-backed saved searches (pinned filter chips). Replaces the
  //   localStorage list so chips ride along with mobile-sync replication.
  // ─────────────────────────────────────────────────────────────────────────

  ipcMain.handle('savedSearches:list', async () => {
    try {
      const { getSavedSearchesService } = await import('./services/saved-searches-service')
      return { ok: true, items: getSavedSearchesService(db).list() }
    } catch (err: any) {
      return { ok: false, items: [], error: err?.message ?? String(err) }
    }
  })

  ipcMain.handle('savedSearches:create', async (_ev, args: { name: string; queryJson: string }) => {
    try {
      const { getSavedSearchesService } = await import('./services/saved-searches-service')
      const row = getSavedSearchesService(db).create(args.name, args.queryJson)
      broadcast('vault:changed')
      return { ok: true, item: row }
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })

  ipcMain.handle('savedSearches:update', async (_ev, args: { id: string; name?: string; queryJson?: string }) => {
    try {
      const { getSavedSearchesService } = await import('./services/saved-searches-service')
      getSavedSearchesService(db).update(args.id, { name: args.name, queryJson: args.queryJson })
      broadcast('vault:changed')
      return { ok: true }
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })

  ipcMain.handle('savedSearches:delete', async (_ev, id: string) => {
    try {
      const { getSavedSearchesService } = await import('./services/saved-searches-service')
      getSavedSearchesService(db).delete(id)
      broadcast('vault:changed')
      return { ok: true }
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })

  ipcMain.handle('savedSearches:reorder', async (_ev, orderedIds: string[]) => {
    try {
      const { getSavedSearchesService } = await import('./services/saved-searches-service')
      getSavedSearchesService(db).reorder(Array.isArray(orderedIds) ? orderedIds : [])
      broadcast('vault:changed')
      return { ok: true }
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })

  ipcMain.handle('savedSearches:importLegacy', async (_ev, entries: Array<{ id: string; name: string; queryJson: string; pinnedAt: number }>) => {
    try {
      const { getSavedSearchesService } = await import('./services/saved-searches-service')
      const imported = getSavedSearchesService(db).importLegacy(Array.isArray(entries) ? entries : [])
      if (imported > 0) broadcast('vault:changed')
      return { ok: true, imported }
    } catch (err: any) {
      return { ok: false, imported: 0, error: err?.message ?? String(err) }
    }
  })

  // ─────────────────────────────────────────────────────────────────────────
  //   #146 — Sprite-sheet hover scrub. Re-uses the contact-sheet
  //   generator with a dense 6×6 preset to produce a single PNG the
  //   renderer can slice via CSS background-position while the user
  //   moves the cursor across a card.
  // ─────────────────────────────────────────────────────────────────────────

  ipcMain.handle('media:spriteSheetPath', async (_ev, args: { mediaId: string; preset?: 'scrub' | 'hover' }) => {
    try {
      const { contactSheetPathFor } = await import('./services/ai-intelligence/contact-sheet')
      const preset = args.preset ?? 'scrub'
      const p = contactSheetPathFor(args.mediaId, preset)
      return { ok: true, path: p, cols: preset === 'scrub' ? 6 : 4, rows: preset === 'scrub' ? 6 : 1 }
    } catch (err: any) {
      return { ok: false, path: null, error: err?.message ?? String(err) }
    }
  })

  // ─────────────────────────────────────────────────────────────────────────
  //   #101 — Saved Subscriptions with delta sync. Each subscription is a
  //   (source, query) tuple that re-fetches on a schedule and routes
  //   any previously-unseen posts to subscription_inbox.
  // ─────────────────────────────────────────────────────────────────────────

  ipcMain.handle('subscriptions:list', async () => {
    try {
      const { getSubscriptionsService } = await import('./services/subscriptions-service')
      return { ok: true, items: getSubscriptionsService(db).list() }
    } catch (err: any) {
      return { ok: false, items: [], error: err?.message ?? String(err) }
    }
  })

  ipcMain.handle('subscriptions:create', async (_ev, args: { name: string; source: string; query: string; intervalMinutes?: number }) => {
    try {
      const { getSubscriptionsService } = await import('./services/subscriptions-service')
      const row = getSubscriptionsService(db).create(args)
      broadcast('vault:changed')
      return { ok: true, item: row }
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })

  ipcMain.handle('subscriptions:update', async (_ev, id: string, patch: { name?: string; query?: string; intervalMinutes?: number; enabled?: boolean }) => {
    try {
      const { getSubscriptionsService } = await import('./services/subscriptions-service')
      getSubscriptionsService(db).update(id, patch)
      broadcast('vault:changed')
      return { ok: true }
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })

  ipcMain.handle('subscriptions:delete', async (_ev, id: string) => {
    try {
      const { getSubscriptionsService } = await import('./services/subscriptions-service')
      getSubscriptionsService(db).delete(id)
      broadcast('vault:changed')
      return { ok: true }
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })

  ipcMain.handle('subscriptions:runNow', async (_ev, id: string) => {
    try {
      const { getSubscriptionsService } = await import('./services/subscriptions-service')
      const res = await getSubscriptionsService(db).runOne(id)
      broadcast('vault:changed')
      return { ok: true, ...res }
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })

  ipcMain.handle('subscriptions:inbox', async (_ev, opts?: { subscriptionId?: string; pendingOnly?: boolean; limit?: number }) => {
    try {
      const { getSubscriptionsService } = await import('./services/subscriptions-service')
      return { ok: true, items: getSubscriptionsService(db).inbox(opts) }
    } catch (err: any) {
      return { ok: false, items: [], error: err?.message ?? String(err) }
    }
  })

  ipcMain.handle('subscriptions:dismiss', async (_ev, inboxId: string) => {
    try {
      const { getSubscriptionsService } = await import('./services/subscriptions-service')
      getSubscriptionsService(db).dismissInbox(inboxId)
      broadcast('vault:changed')
      return { ok: true }
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })

  ipcMain.handle('subscriptions:markSaved', async (_ev, inboxId: string) => {
    try {
      const { getSubscriptionsService } = await import('./services/subscriptions-service')
      getSubscriptionsService(db).markSaved(inboxId)
      broadcast('vault:changed')
      return { ok: true }
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })

  // #179 — Auto-trailer generator. Produces a 30s highlight reel by
  // sampling 6 evenly-spaced 5s windows and crossfading them. Output
  // mp4 lands in userData/trailers/<mediaId>-trailer.mp4.
  ipcMain.handle('media:autoTrailerPath', async (_ev, mediaId: string) => {
    try {
      const { trailerPathFor } = await import('./services/auto-trailer-service')
      return { ok: true, path: trailerPathFor(mediaId) }
    } catch (err: any) {
      return { ok: false, path: null, error: err?.message ?? String(err) }
    }
  })

  ipcMain.handle('media:generateAutoTrailer', async (_ev, args: { mediaId: string; force?: boolean; useAudioPeaks?: boolean }) => {
    try {
      const { generateAutoTrailer, trailerPathFor } = await import('./services/auto-trailer-service')
      const ff = await import('./ffpaths')
      const ffmpegPath = ff.ffmpegBin ?? 'ffmpeg'
      if (!args.force) {
        const existing = trailerPathFor(args.mediaId)
        if (existing) return { ok: true, path: existing, alreadyExisted: true }
      }
      const media = db.getMedia(args.mediaId)
      if (!media) return { ok: false, error: 'Media not found' }
      if (media.type !== 'video') return { ok: false, error: 'Auto-trailer only applies to videos' }
      if (!media.durationSec || media.durationSec < 15) {
        return { ok: false, error: 'Source too short for a trailer (<15s)' }
      }
      const out = await generateAutoTrailer(media.path, ffmpegPath, args.mediaId, media.durationSec, {
        reuseExisting: !args.force,
        useAudioPeaks: args.useAudioPeaks,
      })
      if (!out) return { ok: false, error: 'FFmpeg failed to produce trailer' }
      return { ok: true, path: out, alreadyExisted: false }
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })

  // #106 — Stash-style local performers database. Holds canonical
  // performer bio + cross-source ids; renderer pulls scene counts
  // (derived from `performer:NAME` tag joins) for the detail page.
  ipcMain.handle('performersDb:list', async (_ev, opts?: { query?: string; limit?: number }) => {
    try {
      const { getPerformersDbService } = await import('./services/performers-db-service')
      return { ok: true, items: getPerformersDbService(db).list(opts) }
    } catch (err: any) {
      return { ok: false, items: [], error: err?.message ?? String(err) }
    }
  })

  ipcMain.handle('performersDb:get', async (_ev, id: string) => {
    try {
      const { getPerformersDbService } = await import('./services/performers-db-service')
      return { ok: true, item: getPerformersDbService(db).get(id) }
    } catch (err: any) {
      return { ok: false, item: null, error: err?.message ?? String(err) }
    }
  })

  ipcMain.handle('performersDb:create', async (_ev, args: any) => {
    try {
      const { getPerformersDbService } = await import('./services/performers-db-service')
      const item = getPerformersDbService(db).create(args)
      broadcast('vault:changed')
      return { ok: true, item }
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })

  ipcMain.handle('performersDb:update', async (_ev, id: string, patch: any) => {
    try {
      const { getPerformersDbService } = await import('./services/performers-db-service')
      getPerformersDbService(db).update(id, patch)
      broadcast('vault:changed')
      return { ok: true }
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })

  ipcMain.handle('performersDb:delete', async (_ev, id: string) => {
    try {
      const { getPerformersDbService } = await import('./services/performers-db-service')
      getPerformersDbService(db).delete(id)
      broadcast('vault:changed')
      return { ok: true }
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })

  // #195 — Multi-user profiles. Renderer surfaces a profile switcher;
  // new watch_sessions get tagged with whatever profile was active at
  // the time. Namespaced as userProfiles:* to avoid colliding with the
  // pre-existing settings-profiles namespace (above).
  ipcMain.handle('userProfiles:list', async () => {
    try {
      const { getProfilesService } = await import('./services/profiles-service')
      const svc = getProfilesService(db)
      await svc.initActive()
      return { ok: true, profiles: svc.list(), activeId: svc.getActive() }
    } catch (err: any) {
      return { ok: false, profiles: [], activeId: 'default', error: err?.message ?? String(err) }
    }
  })

  ipcMain.handle('userProfiles:create', async (_ev, args: { name: string; color?: string; avatarPath?: string }) => {
    try {
      const { getProfilesService } = await import('./services/profiles-service')
      const row = getProfilesService(db).create(args)
      broadcast('vault:changed')
      return { ok: true, profile: row }
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })

  ipcMain.handle('userProfiles:update', async (_ev, id: string, patch: { name?: string; color?: string | null; avatarPath?: string | null }) => {
    try {
      const { getProfilesService } = await import('./services/profiles-service')
      getProfilesService(db).update(id, patch)
      broadcast('vault:changed')
      return { ok: true }
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })

  ipcMain.handle('userProfiles:delete', async (_ev, id: string) => {
    try {
      const { getProfilesService } = await import('./services/profiles-service')
      getProfilesService(db).delete(id)
      broadcast('vault:changed')
      return { ok: true }
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })

  ipcMain.handle('userProfiles:setActive', async (_ev, id: string) => {
    try {
      const { getProfilesService } = await import('./services/profiles-service')
      await getProfilesService(db).setActive(id)
      broadcast('vault:changed')
      return { ok: true }
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })

  // #131 / #136 / #162 / #180 — generic Python ML sidecar launcher.
  // Each sidecar = (id, port). User installs the model + a Flask wrapper
  // exposing /health + per-sidecar endpoints; Vault spawns the script
  // on demand and forwards requests.
  ipcMain.handle('mlSidecar:status', async (_ev, id: 'videoLlama3' | 'animateDiff' | 'rife' | 'musicGen') => {
    try {
      const { getSidecarStatus } = await import('./services/ml-sidecar-launcher')
      return { ok: true, ...(await getSidecarStatus(id)) }
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })

  ipcMain.handle('mlSidecar:start', async (_ev, id: 'videoLlama3' | 'animateDiff' | 'rife' | 'musicGen') => {
    try {
      const { ensureSidecar } = await import('./services/ml-sidecar-launcher')
      return { ok: await ensureSidecar(id) }
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })

  ipcMain.handle('mlSidecar:post', async (_ev, args: { id: 'videoLlama3' | 'animateDiff' | 'rife' | 'musicGen'; path: string; body: unknown; timeoutMs?: number }) => {
    try {
      const { postJson } = await import('./services/ml-sidecar-launcher')
      return await postJson(args.id, args.path, args.body, args.timeoutMs)
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })

  // #385 — Xyrene voice intake pipeline. Drop a wav/mp3/m4a/ogg/flac
  // into the watched folder; service silence-trims, denoises,
  // loudness-normalizes, copies to xtts voice_samples/, registers
  // metadata, and pre-warms the embedding via /cache_voice.
  ipcMain.handle('xyrene:intakeStatus', async () => {
    try {
      const { getIntakeStatus } = await import('./services/xyrene/voice-intake')
      return { ok: true, ...getIntakeStatus() }
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })

  ipcMain.handle('xyrene:intakeProcess', async (_ev, args: { srcPath: string; cleanup?: 'conservative' | 'standard' | 'aggressive'; displayName?: string; description?: string; language?: string; outputSlug?: string }) => {
    try {
      const { processVoiceFile } = await import('./services/xyrene/voice-intake')
      return await processVoiceFile(args.srcPath, args)
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })

  ipcMain.handle('xyrene:intakeStart', async (ev, args?: { folder?: string; cleanup?: 'conservative' | 'standard' | 'aggressive' }) => {
    try {
      const { startIntakeWatcher } = await import('./services/xyrene/voice-intake')
      const { getSettings, updateSettings } = await import('./settings')
      const s = getSettings() as any
      const folder = args?.folder?.trim() || s.xyreneVoiceIntakeFolder || `${process.env.USERPROFILE || ''}\\Documents\\Vault\\xyrene_voice_intake`
      const cleanup = args?.cleanup ?? s.xyreneVoiceCleanupMode ?? 'standard'
      if (folder !== s.xyreneVoiceIntakeFolder || cleanup !== s.xyreneVoiceCleanupMode) {
        updateSettings({ xyreneVoiceIntakeFolder: folder, xyreneVoiceCleanupMode: cleanup } as any)
      }
      return await startIntakeWatcher(folder, {
        onProcessed(srcPath, result) {
          try {
            ev.sender.send('xyrene:intakeProcessed', { srcPath, result })
          } catch { /* renderer gone */ }
        },
      }, { cleanup })
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })

  ipcMain.handle('xyrene:intakeStop', async () => {
    try {
      const { stopIntakeWatcher } = await import('./services/xyrene/voice-intake')
      await stopIntakeWatcher()
      return { ok: true }
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })

  ipcMain.handle('xyrene:voiceMetadata', async () => {
    try {
      const { getSettings } = await import('./settings')
      return { ok: true, metadata: (getSettings() as any).xyreneVoiceMetadata ?? {} }
    } catch (err: any) {
      return { ok: false, metadata: {}, error: err?.message ?? String(err) }
    }
  })

  ipcMain.handle('xyrene:voiceMetadataSet', async (_ev, args: { filename: string; displayName?: string; description?: string; language?: string }) => {
    try {
      const { getSettings, updateSettings } = await import('./settings')
      const s = getSettings() as any
      const meta = { ...(s.xyreneVoiceMetadata ?? {}) }
      const cur = meta[args.filename] ?? { displayName: args.filename.replace(/\.wav$/i, ''), description: '', language: 'en' }
      meta[args.filename] = {
        displayName: args.displayName ?? cur.displayName,
        description: args.description ?? cur.description,
        language: args.language ?? cur.language,
      }
      updateSettings({ xyreneVoiceMetadata: meta } as any)
      return { ok: true }
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })

  // #222/223/224 — StevenBlack hosts blocklist (source-discovery, panic
  // mode, auto-NSFW tagging). All three share the same cached porn-only
  // hosts file under userData/blocklists/stevenblack/.
  ipcMain.handle('hostsBlocklist:status', async () => {
    try {
      const { getStatus } = await import('./services/ai-intelligence/hosts-blocklist')
      return { ok: true, ...(await getStatus()) }
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })
  ipcMain.handle('hostsBlocklist:refresh', async () => {
    try {
      const { refreshBlocklist } = await import('./services/ai-intelligence/hosts-blocklist')
      const meta = await refreshBlocklist()
      return { ok: true, meta }
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })
  ipcMain.handle('hostsBlocklist:discover', async (_ev, args?: { limit?: number }) => {
    try {
      const { discoverNewSources } = await import('./services/ai-intelligence/hosts-blocklist')
      const candidates = await discoverNewSources({ limit: args?.limit })
      return { ok: true, candidates }
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })
  ipcMain.handle('hostsBlocklist:panicOn', async () => {
    try {
      const { activatePanicMode } = await import('./services/ai-intelligence/hosts-blocklist')
      return await activatePanicMode()
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })
  ipcMain.handle('hostsBlocklist:panicOff', async () => {
    try {
      const { deactivatePanicMode } = await import('./services/ai-intelligence/hosts-blocklist')
      return await deactivatePanicMode()
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })
  ipcMain.handle('hostsBlocklist:matchUrl', async (_ev, url: string) => {
    try {
      const { matchUrl } = await import('./services/ai-intelligence/hosts-blocklist')
      return { ok: true, match: matchUrl(url) }
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })

  // #379 — Stealth mode: swap the window title (and optionally the
  // taskbar app-user-model-id) so a casual over-the-shoulder glance
  // reads "Microsoft Excel" or "Outlook" instead of "Vault". Cosmetic
  // only — does not actually disguise the executable. Pairs with the
  // StevenBlack panic mode for layered "boss coming" defense.
  const STEALTH_PROFILES: Record<string, { title: string; aumid?: string }> = {
    excel: { title: 'Book1 - Excel', aumid: 'Microsoft.Office.Excel' },
    sheets: { title: 'Untitled spreadsheet - Google Sheets - Google Chrome', aumid: 'Google Chrome' },
    teams: { title: 'Microsoft Teams', aumid: 'Microsoft.Teams' },
    outlook: { title: 'Inbox - Outlook', aumid: 'Microsoft.Office.Outlook' },
    word: { title: 'Document1 - Word', aumid: 'Microsoft.Office.Winword' },
    code: { title: 'Visual Studio Code', aumid: 'Microsoft.VisualStudio.Code' },
    notepad: { title: 'Untitled - Notepad' },
    chrome: { title: 'New Tab - Google Chrome', aumid: 'Google Chrome' },
  }
  ipcMain.handle('stealth:status', async () => {
    try {
      const { getSettings } = await import('./settings')
      const s = getSettings() as any
      return { ok: true, active: !!s.stealthProfile, profile: s.stealthProfile ?? null, profiles: Object.keys(STEALTH_PROFILES) }
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })
  ipcMain.handle('stealth:enable', async (_ev, profile: string) => {
    try {
      const p = STEALTH_PROFILES[profile]
      if (!p) return { ok: false, error: `Unknown profile: ${profile}` }
      const { BrowserWindow } = await import('electron')
      for (const w of BrowserWindow.getAllWindows()) {
        try { w.setTitle(p.title) } catch { /* ignore */ }
      }
      if (process.platform === 'win32' && p.aumid) {
        try { (require('electron').app).setAppUserModelId(p.aumid) } catch { /* ignore */ }
      }
      const { updateSettings } = await import('./settings')
      updateSettings({ stealthProfile: profile } as any)
      return { ok: true }
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })
  // #348 — edging scoreboard. Sessions tracked in edging_sessions
  // table; XP rewards denial heavily. Start/end + stats + history.
  ipcMain.handle('edging:start', async () => {
    try {
      const { startEdgingSession } = await import('./services/edging-tracker')
      return { ok: true, session: startEdgingSession(db.raw as any) }
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })
  ipcMain.handle('edging:end', async (_ev, args: { outcome?: 'climax' | 'denied' | 'ruined'; climaxed?: boolean; notes?: string | null }) => {
    try {
      const { endEdgingSession } = await import('./services/edging-tracker')
      return { ok: true, session: endEdgingSession(db.raw as any, args) }
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })
  ipcMain.handle('edging:stats', async () => {
    try {
      const { getEdgingStats } = await import('./services/edging-tracker')
      return { ok: true, stats: getEdgingStats(db.raw as any) }
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })
  ipcMain.handle('edging:recent', async (_ev, limit?: number) => {
    try {
      const { getRecentSessions } = await import('./services/edging-tracker')
      return { ok: true, sessions: getRecentSessions(db.raw as any, limit ?? 50) }
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })

  // #358 G-134 — tease & denial task wheel. Picks a weighted-random
  // task from the pool (default 24 tasks across edge / pause /
  // reverse / position / sensation / denial categories).
  ipcMain.handle('taskWheel:pool', async () => {
    try {
      const { getActivePool } = await import('./services/task-wheel')
      return { ok: true, pool: getActivePool() }
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })
  ipcMain.handle('taskWheel:pick', async (_ev, args?: { maxIntensity?: 1 | 2 | 3 | 4 | 5; excludeIds?: string[] }) => {
    try {
      const { pickTask } = await import('./services/task-wheel')
      const task = pickTask(args ?? {})
      return { ok: true, task }
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })
  ipcMain.handle('taskWheel:setPool', async (_ev, pool: any[]) => {
    try {
      const { setPool } = await import('./services/task-wheel')
      setPool(pool)
      return { ok: true }
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })
  ipcMain.handle('taskWheel:setDisabledCategories', async (_ev, cats: any[]) => {
    try {
      const { setDisabledCategories } = await import('./services/task-wheel')
      setDisabledCategories(cats)
      return { ok: true }
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })
  ipcMain.handle('taskWheel:resetDefaults', async () => {
    try {
      const { getDefaultPool, setPool } = await import('./services/task-wheel')
      setPool(getDefaultPool())
      return { ok: true }
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })

  // #376 H-152 — orgasm budget + relapse ledger
  ipcMain.handle('budget:status', async () => {
    try {
      const { getOrgasmBudget } = await import('./services/edging-tracker')
      const { getSettings } = await import('./settings')
      const s = getSettings() as any
      const configured = typeof s.orgasmBudgetPerMonth === 'number' ? s.orgasmBudgetPerMonth : undefined
      return { ok: true, status: getOrgasmBudget(db.raw as any, configured) }
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })
  ipcMain.handle('budget:history', async (_ev, monthsBack?: number) => {
    try {
      const { getBudgetHistory } = await import('./services/edging-tracker')
      const { getSettings } = await import('./settings')
      const s = getSettings() as any
      const budget = typeof s.orgasmBudgetPerMonth === 'number' ? s.orgasmBudgetPerMonth : 8
      return { ok: true, history: getBudgetHistory(db.raw as any, budget, monthsBack ?? 6) }
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })
  ipcMain.handle('budget:setLimit', async (_ev, perMonth: number) => {
    try {
      const { updateSettings } = await import('./settings')
      updateSettings({ orgasmBudgetPerMonth: Math.max(1, Math.min(60, Math.round(perMonth))) } as any)
      return { ok: true }
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })

  // #363 — per-media denial cooldown.
  ipcMain.handle('denial:set', async (_ev, args: { mediaId: string; durationMin: number }) => {
    try {
      const { setDenialCooldown } = await import('./services/edging-tracker')
      return { ok: true, ...setDenialCooldown(db.raw as any, args.mediaId, args.durationMin) }
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })
  ipcMain.handle('denial:clear', async (_ev, mediaId: string) => {
    try {
      const { clearDenialCooldown } = await import('./services/edging-tracker')
      clearDenialCooldown(db.raw as any, mediaId)
      return { ok: true }
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })
  ipcMain.handle('denial:status', async (_ev, mediaId: string) => {
    try {
      const { getDenialStatus } = await import('./services/edging-tracker')
      return { ok: true, status: getDenialStatus(db.raw as any, mediaId) }
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })

  // #294 — Apple Photos "Feature less" suppression. Sets/clears the
  // boolean on media_stats; the recommender consults this when
  // building daily-mix / suggestions to weight these items down.
  ipcMain.handle('media:setFeatureLess', async (_ev, args: { mediaId: string; value: boolean }) => {
    try {
      const now = Date.now()
      db.raw.prepare(`
        INSERT INTO media_stats (mediaId, views, lastViewedAt, rating, oCount, updatedAt, featureLess)
        VALUES (?, 0, NULL, 0, 0, ?, ?)
        ON CONFLICT(mediaId) DO UPDATE SET featureLess = excluded.featureLess, updatedAt = excluded.updatedAt
      `).run(args.mediaId, now, args.value ? 1 : 0)
      return { ok: true }
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })
  ipcMain.handle('media:getFeatureLess', async (_ev, mediaId: string) => {
    try {
      const row = db.raw.prepare(`SELECT featureLess FROM media_stats WHERE mediaId = ?`).get(mediaId) as { featureLess: number } | undefined
      return { ok: true, value: row?.featureLess === 1 }
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })
  ipcMain.handle('media:listFeatureLess', async () => {
    try {
      const rows = db.raw.prepare(`SELECT mediaId FROM media_stats WHERE featureLess = 1`).all() as Array<{ mediaId: string }>
      return { ok: true, mediaIds: rows.map((r) => r.mediaId) }
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })

  // #347 — post-nut clarity blocker (refractory lockout).
  ipcMain.handle('lockout:status', async () => {
    try {
      const { getLockoutState } = await import('./services/post-nut-lockout')
      return { ok: true, state: getLockoutState() }
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })
  ipcMain.handle('lockout:trigger', async (_ev, args?: { durationMin?: number }) => {
    try {
      const { triggerLockout } = await import('./services/post-nut-lockout')
      return { ok: true, state: triggerLockout(args ?? {}) }
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })
  ipcMain.handle('lockout:cancel', async () => {
    try {
      const { cancelLockout } = await import('./services/post-nut-lockout')
      return { ok: true, state: cancelLockout() }
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })
  ipcMain.handle('lockout:setEnabled', async (_ev, enabled: boolean) => {
    try {
      const { setEnabled } = await import('./services/post-nut-lockout')
      return { ok: true, state: setEnabled(enabled) }
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })
  ipcMain.handle('lockout:setDuration', async (_ev, durationMin: number) => {
    try {
      const { setDuration } = await import('./services/post-nut-lockout')
      return { ok: true, state: setDuration(durationMin) }
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })

  // #G-129 — JOI script player. Render a JOI script (timed text +
  // pause directives) into an audio schedule the renderer can play
  // back. Each speak cue is synthesized via XTTS in the user's chosen
  // voice. The renderer is responsible for actual playback so the
  // audio runs through the existing volume / EQ stack.
  ipcMain.handle('joi:parse', async (_ev, text: string) => {
    try {
      const { parseJoiScript } = await import('./services/xyrene/joi-script-player')
      return { ok: true, cues: parseJoiScript(text) }
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })
  ipcMain.handle('joi:render', async (_ev, args: { text?: string; cues?: any[]; voice?: string }) => {
    try {
      const { parseJoiScript, renderJoiScript } = await import('./services/xyrene/joi-script-player')
      const cues = args.cues ?? (args.text ? parseJoiScript(args.text) : [])
      if (cues.length === 0) return { ok: false, error: 'Empty script' }
      return await renderJoiScript(cues, { defaultVoice: args.voice })
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })

  // Generic ML sidecar (vault-ml-sidecar) — covers Florence-2,
  // DINOv3-L, MetaCLIP-H, SigLIP2-age, Wav2Vec2-emotion (more on demand).
  ipcMain.handle('vaultMl:health', async () => {
    try {
      const { getVaultMlClient } = await import('./services/ai-intelligence/vault-ml-client')
      const h = await getVaultMlClient().health(false)
      return { ok: true, health: h }
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })
  ipcMain.handle('vaultMl:start', async () => {
    try {
      const { ensureVaultMlSidecar } = await import('./services/ai-intelligence/vault-ml-launcher')
      const ok = await ensureVaultMlSidecar()
      return { ok }
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })
  ipcMain.handle('vaultMl:stop', async () => {
    try {
      const { stopVaultMlSidecar } = await import('./services/ai-intelligence/vault-ml-launcher')
      await stopVaultMlSidecar()
      return { ok: true }
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })
  ipcMain.handle('vaultMl:loadModel', async (_ev, modelId: string) => {
    try {
      const { getVaultMlClient } = await import('./services/ai-intelligence/vault-ml-client')
      const ok = await getVaultMlClient().load(modelId)
      return { ok }
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })
  ipcMain.handle('vaultMl:unloadModel', async (_ev, modelId: string) => {
    try {
      const { getVaultMlClient } = await import('./services/ai-intelligence/vault-ml-client')
      const ok = await getVaultMlClient().unload(modelId)
      return { ok }
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })

  // Florence-2 #B-34 — primary VL interface (caption, OD, OCR, grounding)
  ipcMain.handle('vaultMl:florence', async (_ev, args: { imagePath?: string; imageBase64?: string; task?: string; text_input?: string; maxNewTokens?: number }) => {
    try {
      const { getVaultMlClient } = await import('./services/ai-intelligence/vault-ml-client')
      const r = await getVaultMlClient().florence(args)
      return r  // already has ok:true and the relevant fields
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })

  ipcMain.handle('vaultMl:embedImage', async (_ev, args: { imagePath?: string; imageBase64?: string; modelId?: 'dinov3-vit-l' | 'metaclip-h14' }) => {
    try {
      const { getVaultMlClient } = await import('./services/ai-intelligence/vault-ml-client')
      const r = await getVaultMlClient().embedImage(args)
      return r
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })

  ipcMain.handle('vaultMl:classifyImage', async (_ev, args: { imagePath?: string; imageBase64?: string; modelId?: 'siglip2-age'; topK?: number }) => {
    try {
      const { getVaultMlClient } = await import('./services/ai-intelligence/vault-ml-client')
      const r = await getVaultMlClient().classifyImage(args)
      return r
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })

  ipcMain.handle('vaultMl:classifyAudioEmotion', async (_ev, args: { audioPath?: string; audioBase64?: string }) => {
    try {
      const { getVaultMlClient } = await import('./services/ai-intelligence/vault-ml-client')
      const r = await getVaultMlClient().classifyAudioEmotion(args)
      return r
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })

  // #B-22 SAM2 promptable segmentation
  ipcMain.handle('vaultMl:sam2Segment', async (_ev, args: any) => {
    try {
      const { getVaultMlClient } = await import('./services/ai-intelligence/vault-ml-client')
      return await getVaultMlClient().sam2Segment(args)
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })

  // #B-29 Demucs source separation
  ipcMain.handle('vaultMl:demucsSeparate', async (_ev, args: any) => {
    try {
      const { getVaultMlClient } = await import('./services/ai-intelligence/vault-ml-client')
      return await getVaultMlClient().demucsSeparate(args)
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })

  // #B-37 MS-CLAP cross-modal audio↔text embed
  ipcMain.handle('vaultMl:msclapEmbed', async (_ev, args: any) => {
    try {
      const { getVaultMlClient } = await import('./services/ai-intelligence/vault-ml-client')
      return await getVaultMlClient().msclapEmbed(args)
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })

  // #B-33 CodeFormer face restoration
  ipcMain.handle('vaultMl:codeformerRestore', async (_ev, args: any) => {
    try {
      const { getVaultMlClient } = await import('./services/ai-intelligence/vault-ml-client')
      return await getVaultMlClient().codeformerRestore(args)
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })

  // #308 E-84 — Beets-style smart-collection query language. Parses
  // "rating:>=4 tag:milf NOT tag:asian" → SQL WHERE + bind params.
  // Used by smart playlists / virtual libraries / advanced search.
  ipcMain.handle('smartQuery:compile', async (_ev, query: string) => {
    try {
      const { compileQuery } = await import('./services/smart-query')
      return { ok: true, ...compileQuery(query) }
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })
  ipcMain.handle('smartQuery:run', async (_ev, args: { query: string; limit?: number; offset?: number; sort?: string }) => {
    try {
      const { compileQuery } = await import('./services/smart-query')
      const compiled = compileQuery(args.query)
      const limit = Math.max(1, Math.min(args.limit ?? 60, 500))
      const offset = Math.max(0, args.offset ?? 0)
      const sortMap: Record<string, string> = {
        newest: 'm.addedAt DESC',
        oldest: 'm.addedAt ASC',
        rating: 's.rating DESC, m.addedAt DESC',
        views: 's.views DESC, m.addedAt DESC',
        random: 'RANDOM()',
        longest: 'm.durationSec DESC',
        shortest: 'm.durationSec ASC',
      }
      const sort = sortMap[args.sort ?? 'newest'] ?? sortMap.newest
      // Always LEFT JOIN media_stats so rating-based sort works.
      const joins = new Set([...compiled.joinedClauses, 'LEFT JOIN media_stats s ON s.mediaId = m.id'])
      const sql = `
        SELECT m.id, m.filename, m.path, m.thumbPath, m.type, m.durationSec, m.width, m.height, m.addedAt,
               COALESCE(s.rating, 0) AS rating, COALESCE(s.views, 0) AS views
        FROM media m
        ${[...joins].join(' ')}
        WHERE COALESCE(m.triage_status, 'active') = 'active'
          AND (${compiled.sql})
        ORDER BY ${sort}
        LIMIT ? OFFSET ?
      `
      const items = db.raw.prepare(sql).all(...compiled.params, limit, offset)
      const countSql = `SELECT COUNT(*) AS n FROM media m ${[...joins].join(' ')} WHERE COALESCE(m.triage_status, 'active') = 'active' AND (${compiled.sql})`
      const total = (db.raw.prepare(countSql).get(...compiled.params) as { n: number }).n
      return { ok: true, items, total, compiled: { sql: compiled.sql, paramCount: compiled.params.length } }
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })

  // #317 E-93 — Hydrus PTR / Danbooru CSV tag-implication import.
  // Caller passes the CSV text (renderer reads file via dialog +
  // FileReader); we parse + merge into the existing implications
  // JSON store.
  ipcMain.handle('tagImplications:importCsv', async (_ev, csvText: string) => {
    try {
      const { importImplicationsCsv } = await import('./services/tag-implications')
      return { ok: true, ...importImplicationsCsv(csvText) }
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })
  ipcMain.handle('tagImplications:importCsvFile', async (_ev, filePath: string) => {
    try {
      const fs = await import('node:fs/promises')
      const text = await fs.readFile(filePath, 'utf8')
      const { importImplicationsCsv } = await import('./services/tag-implications')
      return { ok: true, ...importImplicationsCsv(text) }
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })

  // #321 E-97 — Folder Action preset library. Per-folder rule bundles
  // that fire when a file lands (e.g. "auto-tag as 'amateur', enqueue
  // CodeFormer restoration, send to /import-url webhook").
  ipcMain.handle('folderActions:list', async () => {
    try {
      const { getSettings } = await import('./settings')
      const s = getSettings() as any
      const presets = Array.isArray(s.folderActionPresets) ? s.folderActionPresets : []
      return { ok: true, presets }
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })
  ipcMain.handle('folderActions:save', async (_ev, args: { id?: string; name: string; folderPath: string; actions: Array<{ kind: string; args?: any }>; enabled?: boolean }) => {
    try {
      const { getSettings, updateSettings } = await import('./settings')
      const { nanoid } = await import('nanoid')
      const s = getSettings() as any
      const presets = Array.isArray(s.folderActionPresets) ? [...s.folderActionPresets] : []
      const id = args.id ?? nanoid()
      const entry = {
        id, name: args.name, folderPath: args.folderPath,
        actions: args.actions, enabled: args.enabled !== false,
        createdAt: Date.now(),
      }
      const idx = presets.findIndex((p: any) => p.id === id)
      if (idx >= 0) presets[idx] = { ...presets[idx], ...entry }
      else presets.push(entry)
      updateSettings({ folderActionPresets: presets } as any)
      return { ok: true, id }
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })
  ipcMain.handle('folderActions:delete', async (_ev, id: string) => {
    try {
      const { getSettings, updateSettings } = await import('./settings')
      const s = getSettings() as any
      const presets = Array.isArray(s.folderActionPresets) ? s.folderActionPresets.filter((p: any) => p.id !== id) : []
      updateSettings({ folderActionPresets: presets } as any)
      return { ok: true }
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })
  ipcMain.handle('folderActions:setEnabled', async (_ev, args: { id: string; enabled: boolean }) => {
    try {
      const { getSettings, updateSettings } = await import('./settings')
      const s = getSettings() as any
      const presets = Array.isArray(s.folderActionPresets)
        ? s.folderActionPresets.map((p: any) => p.id === args.id ? { ...p, enabled: args.enabled } : p)
        : []
      updateSettings({ folderActionPresets: presets } as any)
      return { ok: true }
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })

  // #349 G-125 — tease auto-cut compiler. NudeNet-driven peek-a-boo
  // supercut that cuts away right before each exposure.
  ipcMain.handle('teaseCut:events', async (_ev, args: { mediaId: string; threshold?: number }) => {
    try {
      const { getCachedExposureEvents } = await import('./services/tease-cut-compiler')
      return { ok: true, events: getCachedExposureEvents(db.raw as any, args.mediaId, args.threshold ?? 0.6) }
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })
  ipcMain.handle('teaseCut:compile', async (_ev, args: { mediaPath: string; events: any[]; dstPath: string; threshold?: number; leadInSec?: number; cutawaySec?: number; maxClips?: number; videoCodec?: string; width?: number; height?: number; fps?: number }) => {
    try {
      const { compileTeaseSupercut } = await import('./services/tease-cut-compiler')
      const { ffmpegBin } = await import('./ffpaths')
      if (!ffmpegBin) return { ok: false, error: 'ffmpeg not found' }
      return await compileTeaseSupercut(ffmpegBin, args.mediaPath, args.events, args.dstPath, args)
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })

  // Default caption pools for #365 — kept inline so the IPC handler
  // can fall back to them when settings.captionPools is empty.
  const defaultCaptionPools = (): Record<string, string[]> => ({
    sissy: [
      'Good girl.', 'Stroke for daddy.', 'You\'re such a slut.', 'On your knees.',
      'Show me how you take it.', 'Be a good little princess.', 'Smile for me.',
    ],
    denial: [
      'Don\'t you dare come.', 'Edge again.', 'Hold it.', 'Not yet.',
      'You don\'t deserve it.', 'Stop right there.', 'Get back to the edge.',
    ],
    praise: [
      'Good boy.', 'That\'s perfect.', 'Just like that.', 'I\'m proud of you.',
      'You\'re doing so well.', 'Such a good pet.',
    ],
    humiliation: [
      'Look how desperate you are.', 'Pathetic.', 'You can\'t even hold back.',
      'Useless.', 'Beg for it.', 'You\'ll never last.',
    ],
    feminization: [
      'You belong in panties.', 'Such a pretty girl.', 'Get on your knees, sissy.',
      'Show me how feminine you are.', 'Cross your ankles.',
    ],
  })

  // #351 G-127 — Funscript editor (multi-axis OSR2/SR6)
  ipcMain.handle('funscript:load', async (_ev, args: { mediaPath: string; mediaId: string }) => {
    try {
      const { load } = await import('./services/funscript-editor')
      return { ok: true, script: await load(args.mediaPath, args.mediaId) }
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })
  ipcMain.handle('funscript:save', async (_ev, args: { mediaPath: string; mediaId: string; script: any }) => {
    try {
      const { save } = await import('./services/funscript-editor')
      return { ok: true, savedTo: await save(args.mediaPath, args.mediaId, args.script) }
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })
  ipcMain.handle('funscript:fromBeatmap', async (_ev, args: { beats: any[]; axis?: string; baseDepth?: number }) => {
    try {
      const { fromBeatmap } = await import('./services/funscript-editor')
      return { ok: true, script: fromBeatmap(args.beats, { axis: args.axis as any, baseDepth: args.baseDepth }) }
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })
  ipcMain.handle('funscript:scale', async (_ev, args: { script: any; factor: number; center?: number }) => {
    try {
      const { scaleDepth } = await import('./services/funscript-editor')
      return { ok: true, script: scaleDepth(args.script, args.factor, args.center ?? 50) }
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })
  ipcMain.handle('funscript:shift', async (_ev, args: { script: any; offsetMs: number }) => {
    try {
      const { timeShift } = await import('./services/funscript-editor')
      return { ok: true, script: timeShift(args.script, args.offsetMs) }
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })

  // #274 C-50 — ntfy.sh self-hosted push gateway
  ipcMain.handle('ntfy:config', async () => {
    try {
      const { getConfig } = await import('./services/ntfy-gateway')
      return { ok: true, config: getConfig() }
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })
  ipcMain.handle('ntfy:save', async (_ev, patch: any) => {
    try {
      const { saveConfig } = await import('./services/ntfy-gateway')
      return { ok: true, config: saveConfig(patch) }
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })
  ipcMain.handle('ntfy:push', async (_ev, args: any) => {
    try {
      const { push } = await import('./services/ntfy-gateway')
      return await push(args)
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })
  ipcMain.handle('ntfy:notifyEvent', async (_ev, args: { event: string; payload?: any }) => {
    try {
      const { notifyEvent } = await import('./services/ntfy-gateway')
      await notifyEvent(args.event as any, args.payload ?? {})
      return { ok: true }
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })

  // #234 A-10 — HLS transcode-on-demand for remote streaming
  ipcMain.handle('hls:start', async (_ev, args: { mediaPath: string; mediaId: string; quality?: '480p' | '720p' | '1080p' }) => {
    try {
      const { startHlsSession } = await import('./services/hls-on-demand')
      const { ffmpegBin } = await import('./ffpaths')
      if (!ffmpegBin) return { ok: false, error: 'ffmpeg not found' }
      return { ok: true, ...(await startHlsSession(ffmpegBin, args.mediaPath, args.mediaId, args.quality ?? '720p')) }
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })
  ipcMain.handle('hls:touch', async (_ev, args: { mediaId: string; quality: '480p' | '720p' | '1080p' }) => {
    try {
      const { touchSession } = await import('./services/hls-on-demand')
      return { ok: touchSession(args.mediaId, args.quality) }
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })
  ipcMain.handle('hls:stop', async (_ev, args: { mediaId: string; quality: '480p' | '720p' | '1080p' }) => {
    try {
      const { stopSession } = await import('./services/hls-on-demand')
      stopSession(args.mediaId, args.quality)
      return { ok: true }
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })
  ipcMain.handle('hls:list', async () => {
    try {
      const { listSessions } = await import('./services/hls-on-demand')
      return { ok: true, sessions: listSessions() }
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })

  // #230 A-06 — CLIP visual-similarity "more like this"
  ipcMain.handle('clipSimilarity:findByMedia', async (_ev, args: { mediaId: string; limit?: number; minSimilarity?: number; onlyActiveTriage?: boolean }) => {
    try {
      const { findSimilarToMedia } = await import('./services/clip-similarity')
      return { ok: true, items: findSimilarToMedia(db.raw as any, args.mediaId, args) }
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })
  ipcMain.handle('clipSimilarity:findByMultiple', async (_ev, args: { mediaIds: string[]; limit?: number; minSimilarity?: number }) => {
    try {
      const { findSimilarToMultiple } = await import('./services/clip-similarity')
      return { ok: true, items: findSimilarToMultiple(db.raw as any, args.mediaIds, args) }
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })

  // #300 D-76 — Mylio-style face-cluster drag-merge. Existing
  // mergeClusters() does the heavy lifting; just expose via IPC so
  // the renderer's drag handler can call it.
  ipcMain.handle('faceClusters:merge', async (_ev, args: { fromId: string; intoId: string }) => {
    try {
      const { mergeClusters } = await import('./services/ai-intelligence/face-cluster-service')
      mergeClusters(db, args.fromId, args.intoId)
      return { ok: true }
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })

  // #365 H-141 — sissy-training caption overlay pool. Renderer
  // randomly picks a caption from the active pool at the configured
  // interval and overlays it on the player. Per-category pools so
  // users can mix-and-match ("sissy", "feminization", "denial",
  // "praise", "humiliation" — or fully custom).
  ipcMain.handle('captionPool:list', async () => {
    try {
      const { getSettings } = await import('./settings')
      const s = getSettings() as any
      const pools = s.captionPools ?? defaultCaptionPools()
      return { ok: true, pools, intervalSec: s.captionIntervalSec ?? 15, fontFamily: s.captionFontFamily ?? 'Georgia', activeCategories: s.captionActiveCategories ?? ['sissy', 'denial', 'praise'] }
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })
  ipcMain.handle('captionPool:save', async (_ev, args: { pools?: Record<string, string[]>; intervalSec?: number; fontFamily?: string; activeCategories?: string[] }) => {
    try {
      const { getSettings, updateSettings } = await import('./settings')
      const s = getSettings() as any
      const patch: any = {}
      if (args.pools) patch.captionPools = args.pools
      if (typeof args.intervalSec === 'number') patch.captionIntervalSec = Math.max(2, Math.min(120, args.intervalSec))
      if (typeof args.fontFamily === 'string') patch.captionFontFamily = args.fontFamily
      if (Array.isArray(args.activeCategories)) patch.captionActiveCategories = args.activeCategories
      updateSettings(patch)
      return { ok: true }
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })

  // #281 C-57 — WebAuthn / passkey vault unlock
  ipcMain.handle('webauthn:registerStart', async (_ev, deviceLabel: string) => {
    try {
      const { registerStart } = await import('./services/webauthn-vault-unlock')
      return { ok: true, ...(await registerStart(deviceLabel)) }
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })
  ipcMain.handle('webauthn:registerFinish', async (_ev, args: { response: any; deviceLabel: string }) => {
    try {
      const { registerFinish } = await import('./services/webauthn-vault-unlock')
      return await registerFinish(args)
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })
  ipcMain.handle('webauthn:authStart', async () => {
    try {
      const { authStart } = await import('./services/webauthn-vault-unlock')
      return { ok: true, ...(await authStart()) }
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })
  ipcMain.handle('webauthn:authFinish', async (_ev, args: { response: any }) => {
    try {
      const { authFinish } = await import('./services/webauthn-vault-unlock')
      return await authFinish(args)
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })
  ipcMain.handle('webauthn:listCredentials', async () => {
    try {
      const { listCredentials } = await import('./services/webauthn-vault-unlock')
      return { ok: true, credentials: listCredentials() }
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })
  ipcMain.handle('webauthn:removeCredential', async (_ev, id: string) => {
    try {
      const { removeCredential } = await import('./services/webauthn-vault-unlock')
      return { ok: removeCredential(id) }
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })

  // #284 C-60 — Shamir Secret Sharing for vault key recovery
  ipcMain.handle('shamir:split', async (_ev, args: { secret: string; shares: number; threshold: number }) => {
    try {
      const { splitSecret, shareToBase32 } = await import('./services/shamir-key-split')
      const r = splitSecret(args.secret, { shares: args.shares, threshold: args.threshold })
      return {
        ok: true,
        threshold: r.threshold,
        totalShares: r.totalShares,
        shares: r.shares.map((s, i) => ({
          index: i + 1,
          base64: s,
          base32: shareToBase32(s),
        })),
      }
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })
  ipcMain.handle('shamir:combine', async (_ev, args: { shareStrings: string[]; encoding?: 'base64' | 'base32' }) => {
    try {
      const { combineShares, shareFromBase32 } = await import('./services/shamir-key-split')
      const inputs = args.encoding === 'base32'
        ? args.shareStrings.map(shareFromBase32)
        : args.shareStrings
      const secret = combineShares(inputs)
      return { ok: true, secret }
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })

  // #367 H-143 — audio-erotica importer (Quinn/Dipsea LRC + VTT)
  ipcMain.handle('audioErotica:importFile', async (_ev, filePath: string) => {
    try {
      const { importFromFile } = await import('./services/audio-erotica-importer')
      return await importFromFile(filePath)
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err), cues: [] }
    }
  })
  ipcMain.handle('audioErotica:importText', async (_ev, text: string) => {
    try {
      const { importFromText } = await import('./services/audio-erotica-importer')
      return importFromText(text)
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err), cues: [] }
    }
  })
  ipcMain.handle('audioErotica:toJoiScript', async (_ev, args: { imp: any; voice?: string }) => {
    try {
      const { importToJoiScript } = await import('./services/audio-erotica-importer')
      return { ok: true, script: importToJoiScript(args.imp, { voice: args.voice }) }
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })

  // #384 H-160 — OnlyFans/Fansly/Patreon creator archive importer
  // via the coomer.su/kemono.su JSON API. Walks paginated posts +
  // queues all media attachments into the URL downloader.
  ipcMain.handle('coomerArchive:run', async (ev, args: { service: string; userId: string; maxPosts?: number; mediaExtensions?: string[] }) => {
    try {
      const { archiveCreator } = await import('./services/coomer-archive')
      const result = await archiveCreator({
        service: args.service as any,
        userId: args.userId,
        maxPosts: args.maxPosts,
        mediaExtensions: args.mediaExtensions,
        onProgress: (p) => {
          try { ev.sender.send('coomerArchive:progress', p) } catch { /* renderer gone */ }
        },
      })
      return { ok: true, result }
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })

  // #316 E-92 — sprite-sheet chapter editor backend
  ipcMain.handle('spriteSheet:generate', async (_ev, args: { srcPath: string; durationSec: number; cells?: number; cols?: number; thumbWidth?: number; thumbHeight?: number; dstPath?: string }) => {
    try {
      const { generateSpriteSheet } = await import('./services/sprite-sheet-chapters')
      const { ffmpegBin } = await import('./ffpaths')
      if (!ffmpegBin) return { ok: false, error: 'ffmpeg not found' }
      return await generateSpriteSheet(ffmpegBin, args.srcPath, args.durationSec, args)
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })
  ipcMain.handle('spriteSheet:picksToChapters', async (_ev, args: { picks: Array<{ cellIdx: number; title: string; timeSec: number }>; durationSec: number }) => {
    try {
      const { buildChaptersFromPicks } = await import('./services/sprite-sheet-chapters')
      return { ok: true, chapters: buildChaptersFromPicks(args.picks, args.durationSec) }
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })

  // #307 E-83 — yt-dlp postprocessor profile editor. Named presets
  // for yt-dlp option strings ("--format bestvideo[height<=1080]+
  // bestaudio --merge-output-format mp4 --embed-subs --embed-chapters").
  // Each download can pick a profile; default = current behavior.
  ipcMain.handle('ytdlpProfiles:list', async () => {
    try {
      const { getSettings } = await import('./settings')
      const s = getSettings() as any
      const profiles = Array.isArray(s.ytdlpProfiles) && s.ytdlpProfiles.length > 0
        ? s.ytdlpProfiles
        : [
          { id: 'default', name: 'Default (best 1080p + audio)', argsArray: ['-f', 'bestvideo[height<=1080]+bestaudio/best', '--merge-output-format', 'mp4'], isBuiltin: true },
          { id: '4k', name: '4K (best video + audio)', argsArray: ['-f', 'bestvideo+bestaudio/best', '--merge-output-format', 'mp4'], isBuiltin: true },
          { id: 'audio', name: 'Audio only (best MP3)', argsArray: ['-x', '--audio-format', 'mp3', '--audio-quality', '0'], isBuiltin: true },
          { id: 'embed-meta', name: 'Embed subs + chapters + thumbnail', argsArray: ['-f', 'bestvideo[height<=1080]+bestaudio/best', '--merge-output-format', 'mp4', '--embed-subs', '--embed-chapters', '--embed-thumbnail', '--write-info-json'], isBuiltin: true },
        ]
      return { ok: true, profiles }
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })
  ipcMain.handle('ytdlpProfiles:save', async (_ev, args: { id?: string; name: string; argsArray: string[]; isDefault?: boolean }) => {
    try {
      const { getSettings, updateSettings } = await import('./settings')
      const { nanoid } = await import('nanoid')
      const s = getSettings() as any
      const profiles = Array.isArray(s.ytdlpProfiles) ? [...s.ytdlpProfiles] : []
      const id = args.id ?? nanoid()
      const entry = { id, name: args.name, argsArray: args.argsArray, isBuiltin: false }
      const idx = profiles.findIndex((p: any) => p.id === id)
      if (idx >= 0) profiles[idx] = entry
      else profiles.push(entry)
      const patch: any = { ytdlpProfiles: profiles }
      if (args.isDefault) patch.ytdlpDefaultProfileId = id
      updateSettings(patch)
      return { ok: true, id }
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })
  ipcMain.handle('ytdlpProfiles:delete', async (_ev, id: string) => {
    try {
      const { getSettings, updateSettings } = await import('./settings')
      const s = getSettings() as any
      const profiles = Array.isArray(s.ytdlpProfiles) ? s.ytdlpProfiles.filter((p: any) => p.id !== id && !p.isBuiltin) : []
      updateSettings({ ytdlpProfiles: profiles } as any)
      return { ok: true }
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })
  ipcMain.handle('ytdlpProfiles:setDefault', async (_ev, id: string) => {
    try {
      const { updateSettings } = await import('./settings')
      updateSettings({ ytdlpDefaultProfileId: id } as any)
      return { ok: true }
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })

  // #285 D-61 — Hydrus duplicate-pair triage queue. Walks the
  // existing duplicate-pair detection results pair-by-pair: returns
  // the next un-resolved pair so the user can pick keep/discard.
  // Resolution stored in settings.duplicatePairResolutions (JSON
  // dict keyed by canonical pair id).
  ipcMain.handle('dupTriage:nextPair', async () => {
    try {
      const { getSettings } = await import('./settings')
      const s = getSettings() as any
      const resolved: Record<string, string> = s.duplicatePairResolutions ?? {}
      // Existing duplicate detection writes to visualDuplicates table in
      // some installs, hash-collision pairs in others. We try the most
      // common ones and stop at first hit.
      const tryQueries = [
        `SELECT id_a AS a, id_b AS b FROM media_duplicates WHERE resolved = 0 ORDER BY similarity DESC LIMIT 50`,
        `SELECT mediaId_a AS a, mediaId_b AS b FROM visual_duplicates WHERE 1=1 ORDER BY distance ASC LIMIT 50`,
      ]
      let pairs: Array<{ a: string; b: string }> = []
      for (const q of tryQueries) {
        try { pairs = db.raw.prepare(q).all() as any[]; break } catch { /* ignore */ }
      }
      // Filter out resolved pairs.
      const unresolved = pairs.filter((p) => {
        const key = [p.a, p.b].sort().join(':')
        return !(key in resolved)
      })
      if (unresolved.length === 0) return { ok: true, pair: null, totalPending: 0 }
      const next = unresolved[0]
      const aRow = db.raw.prepare(`SELECT id, filename, path, thumbPath, durationSec, size, width, height, addedAt FROM media WHERE id = ?`).get(next.a)
      const bRow = db.raw.prepare(`SELECT id, filename, path, thumbPath, durationSec, size, width, height, addedAt FROM media WHERE id = ?`).get(next.b)
      return { ok: true, pair: { a: aRow, b: bRow }, totalPending: unresolved.length }
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })
  ipcMain.handle('dupTriage:resolve', async (_ev, args: { aId: string; bId: string; action: 'keep_a' | 'keep_b' | 'keep_both' | 'delete_both' }) => {
    try {
      const { getSettings, updateSettings } = await import('./settings')
      const s = getSettings() as any
      const resolved = { ...(s.duplicatePairResolutions ?? {}) }
      const key = [args.aId, args.bId].sort().join(':')
      resolved[key] = args.action
      updateSettings({ duplicatePairResolutions: resolved } as any)
      // If the user picked keep_a or keep_b, mark the OTHER for deletion.
      // We don't actually delete here — caller can invoke media:delete
      // separately — but we return the decision so the renderer can do
      // the right next step.
      const toDelete = args.action === 'keep_a' ? args.bId
                    : args.action === 'keep_b' ? args.aId
                    : args.action === 'delete_both' ? [args.aId, args.bId].join(',')
                    : null
      return { ok: true, toDelete }
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })

  // #378 H-154 — hentai / anime / furry sub-library facet.
  // Returns media filtered to a species/style facet via tag prefix
  // matching (e.g. species:furry, style:anime, style:hentai). The
  // sidebar can show this as a permanent virtual library.
  ipcMain.handle('subLibrary:hentai', async (_ev, args?: { facet?: 'anime' | 'hentai' | 'furry' | 'cartoon' | 'all'; limit?: number; offset?: number }) => {
    try {
      const facet = args?.facet ?? 'all'
      const limit = Math.max(1, Math.min(args?.limit ?? 60, 500))
      const offset = Math.max(0, args?.offset ?? 0)
      // Tag patterns per facet.
      const patterns: Record<string, string[]> = {
        anime: ['anime', 'style:anime', '1girl', 'manga'],
        hentai: ['hentai', 'style:hentai', 'doujin'],
        furry: ['furry', 'species:furry', 'anthro', 'kemono', 'fursuit'],
        cartoon: ['cartoon', 'style:cartoon', 'rule34'],
        all: ['anime', 'hentai', 'furry', 'cartoon', 'doujin', 'anthro'],
      }
      const tags = patterns[facet] ?? patterns.all
      const placeholders = tags.map(() => '?').join(',')
      const rows = db.raw.prepare(`
        SELECT DISTINCT m.id, m.filename, m.path, m.thumbPath, m.type, m.durationSec, m.addedAt
        FROM media m
        JOIN media_tags mt ON mt.mediaId = m.id
        JOIN tags t ON t.id = mt.tagId
        WHERE lower(t.name) IN (${placeholders})
          AND COALESCE(m.triage_status, 'active') = 'active'
        ORDER BY m.addedAt DESC
        LIMIT ? OFFSET ?
      `).all(...tags.map((t) => t.toLowerCase()), limit, offset)
      const total = db.raw.prepare(`
        SELECT COUNT(DISTINCT m.id) AS n
        FROM media m JOIN media_tags mt ON mt.mediaId = m.id JOIN tags t ON t.id = mt.tagId
        WHERE lower(t.name) IN (${placeholders})
      `).get(...tags.map((t) => t.toLowerCase())) as { n: number }
      return { ok: true, items: rows, total: total.n, facet }
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })

  // #369 H-145 — body-part heatmap indexer
  ipcMain.handle('heatmap:build', async (_ev, args: { mediaId: string; durationSec: number; bucketSec?: number }) => {
    try {
      const { buildHeatmap } = await import('./services/body-part-heatmap')
      return { ok: true, heatmap: buildHeatmap(db.raw as any, args.mediaId, args.durationSec, args.bucketSec ?? 2) }
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })
  ipcMain.handle('heatmap:classJumps', async (_ev, args: { mediaId: string; targetClass: string; threshold?: number }) => {
    try {
      const { findClassTimestamps } = await import('./services/body-part-heatmap')
      return { ok: true, timestamps: findClassTimestamps(db.raw as any, args.mediaId, args.targetClass, args.threshold ?? 0.5) }
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })

  // #383 + #370 — LLM-driven narrative engine (text-adventure + CYOA)
  ipcMain.handle('narrative:turn', async (_ev, ctx: any) => {
    try {
      const { generateTurn } = await import('./services/llm-narrative')
      return { ok: true, turn: await generateTurn(ctx) }
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })

  // #304 D-80 — Notion-style import templates. Each template has a
  // filename-regex match, a tag set to apply, an optional rating /
  // category / studio / triage-status override. On import, scanner
  // walks the active templates in priority order; first match wins.
  ipcMain.handle('importTemplates:list', async () => {
    try {
      const { getSettings } = await import('./settings')
      const s = getSettings() as any
      return { ok: true, templates: Array.isArray(s.importTemplates) ? s.importTemplates : [] }
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })
  ipcMain.handle('importTemplates:save', async (_ev, args: { id?: string; name: string; filenamePattern: string; tags?: string[]; category?: string; rating?: number; studio?: string; triageStatus?: string; priority?: number; enabled?: boolean }) => {
    try {
      const { getSettings, updateSettings } = await import('./settings')
      const { nanoid } = await import('nanoid')
      const s = getSettings() as any
      const templates = Array.isArray(s.importTemplates) ? [...s.importTemplates] : []
      const id = args.id ?? nanoid()
      const entry = {
        id, name: args.name, filenamePattern: args.filenamePattern,
        tags: args.tags ?? [], category: args.category ?? null,
        rating: typeof args.rating === 'number' ? args.rating : null,
        studio: args.studio ?? null, triageStatus: args.triageStatus ?? null,
        priority: args.priority ?? 0, enabled: args.enabled !== false,
      }
      const idx = templates.findIndex((t: any) => t.id === id)
      if (idx >= 0) templates[idx] = entry
      else templates.push(entry)
      // Sort by descending priority so first-match-wins works.
      templates.sort((a: any, b: any) => (b.priority ?? 0) - (a.priority ?? 0))
      updateSettings({ importTemplates: templates } as any)
      return { ok: true, id }
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })
  ipcMain.handle('importTemplates:delete', async (_ev, id: string) => {
    try {
      const { getSettings, updateSettings } = await import('./settings')
      const s = getSettings() as any
      const templates = Array.isArray(s.importTemplates) ? s.importTemplates.filter((t: any) => t.id !== id) : []
      updateSettings({ importTemplates: templates } as any)
      return { ok: true }
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })

  // #319 E-95 — action recorder / macro system. Renderer calls
  // macro:startRecord to begin capturing user actions (button
  // clicks, IPC invocations from renderer-side handlers); the
  // record loop ends with macro:stopRecord and the captured
  // sequence is persisted as a named macro that the user can
  // replay with macro:run.
  ipcMain.handle('macro:list', async () => {
    try {
      const { getSettings } = await import('./settings')
      const s = getSettings() as any
      return { ok: true, macros: Array.isArray(s.macros) ? s.macros : [] }
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })
  ipcMain.handle('macro:save', async (_ev, args: { id?: string; name: string; steps: Array<{ kind: 'ipc' | 'wait'; channel?: string; args?: any; ms?: number }>; hotkey?: string }) => {
    try {
      const { getSettings, updateSettings } = await import('./settings')
      const { nanoid } = await import('nanoid')
      const s = getSettings() as any
      const macros = Array.isArray(s.macros) ? [...s.macros] : []
      const id = args.id ?? nanoid()
      const entry = { id, name: args.name, steps: args.steps, hotkey: args.hotkey ?? null, createdAt: Date.now() }
      const idx = macros.findIndex((m: any) => m.id === id)
      if (idx >= 0) macros[idx] = entry
      else macros.push(entry)
      updateSettings({ macros } as any)
      return { ok: true, id }
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })
  ipcMain.handle('macro:delete', async (_ev, id: string) => {
    try {
      const { getSettings, updateSettings } = await import('./settings')
      const s = getSettings() as any
      const macros = Array.isArray(s.macros) ? s.macros.filter((m: any) => m.id !== id) : []
      updateSettings({ macros } as any)
      return { ok: true }
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })
  // Replay a macro server-side. Each 'ipc' step is dispatched via the
  // renderer's webContents.send so the recorded IPCs (most of which
  // were renderer-originated) go to the right place.
  ipcMain.handle('macro:run', async (ev, id: string) => {
    try {
      const { getSettings } = await import('./settings')
      const s = getSettings() as any
      const macros = Array.isArray(s.macros) ? s.macros : []
      const macro = macros.find((m: any) => m.id === id)
      if (!macro) return { ok: false, error: `Macro ${id} not found` }
      for (const step of macro.steps as any[]) {
        if (step.kind === 'wait') {
          await new Promise((r) => setTimeout(r, Math.max(0, Math.min(60_000, step.ms ?? 100))))
          continue
        }
        if (step.kind === 'ipc' && step.channel) {
          try { ev.sender.send('macro:dispatch', { channel: step.channel, args: step.args }) } catch { /* ignore */ }
        }
      }
      return { ok: true, stepsRan: macro.steps.length }
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })

  // #310 E-86 + #311 E-87 — user-script sandbox + scraper recipes
  ipcMain.handle('userScript:run', async (_ev, args: { source: string; timeoutMs?: number; maxLogLines?: number; args?: any }) => {
    try {
      const { runScript } = await import('./services/user-script-sandbox')
      return await runScript(args.source, args)
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err), logs: [], durationMs: 0 }
    }
  })
  ipcMain.handle('scraperRecipes:list', async () => {
    try {
      const { getSettings } = await import('./settings')
      const s = getSettings() as any
      return { ok: true, recipes: Array.isArray(s.scraperRecipes) ? s.scraperRecipes : [] }
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })
  ipcMain.handle('scraperRecipes:save', async (_ev, args: { id?: string; name: string; source: string; enabled?: boolean }) => {
    try {
      const { getSettings, updateSettings } = await import('./settings')
      const { nanoid } = await import('nanoid')
      const s = getSettings() as any
      const recipes = Array.isArray(s.scraperRecipes) ? [...s.scraperRecipes] : []
      const id = args.id ?? nanoid()
      const entry = { id, name: args.name, source: args.source, enabled: args.enabled !== false }
      const idx = recipes.findIndex((r: any) => r.id === id)
      if (idx >= 0) recipes[idx] = entry
      else recipes.push(entry)
      updateSettings({ scraperRecipes: recipes } as any)
      return { ok: true, id }
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })
  ipcMain.handle('scraperRecipes:delete', async (_ev, id: string) => {
    try {
      const { getSettings, updateSettings } = await import('./settings')
      const s = getSettings() as any
      const recipes = Array.isArray(s.scraperRecipes) ? s.scraperRecipes.filter((r: any) => r.id !== id) : []
      updateSettings({ scraperRecipes: recipes } as any)
      return { ok: true }
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })
  ipcMain.handle('scraperRecipes:run', async (_ev, args: { id: string; args?: any }) => {
    try {
      const { getSettings } = await import('./settings')
      const { runRecipe } = await import('./services/user-script-sandbox')
      const s = getSettings() as any
      const recipes = Array.isArray(s.scraperRecipes) ? s.scraperRecipes : []
      const recipe = recipes.find((r: any) => r.id === args.id)
      if (!recipe) return { ok: false, error: `Recipe ${args.id} not found`, logs: [], durationMs: 0 }
      return await runRecipe(recipe, args.args ?? {})
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err), logs: [], durationMs: 0 }
    }
  })

  // #312 E-88 — RSS/Atom subscription importer
  ipcMain.handle('rss:list', async () => {
    try {
      const { listFeeds } = await import('./services/rss-importer')
      return { ok: true, feeds: listFeeds() }
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })
  ipcMain.handle('rss:add', async (_ev, args: { url: string; label?: string; intervalMin?: number; urlFilter?: string }) => {
    try {
      const { addFeed } = await import('./services/rss-importer')
      return { ok: true, feed: addFeed(args) }
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })
  ipcMain.handle('rss:remove', async (_ev, id: string) => {
    try {
      const { removeFeed } = await import('./services/rss-importer')
      removeFeed(id)
      return { ok: true }
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })
  ipcMain.handle('rss:setEnabled', async (_ev, args: { id: string; enabled: boolean }) => {
    try {
      const { setFeedEnabled } = await import('./services/rss-importer')
      setFeedEnabled(args.id, args.enabled)
      return { ok: true }
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })
  ipcMain.handle('rss:pollNow', async () => {
    try {
      const { pollAllNow } = await import('./services/rss-importer')
      return { ok: true, results: await pollAllNow() }
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })

  // #318 E-94 — cron-syntax job scheduler
  ipcMain.handle('cron:validate', async (_ev, expression: string) => {
    try {
      const { validateExpression } = await import('./services/cron-scheduler')
      return validateExpression(expression)  // already returns { ok, nextRunAt?, error? }
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })
  ipcMain.handle('cron:list', async () => {
    try {
      const { listJobs } = await import('./services/cron-scheduler')
      return { ok: true, jobs: listJobs() }
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })
  ipcMain.handle('cron:add', async (_ev, args: { name: string; expression: string; action: any; enabled?: boolean }) => {
    try {
      const { addJob } = await import('./services/cron-scheduler')
      return { ok: true, job: addJob(args) }
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })
  ipcMain.handle('cron:update', async (_ev, args: { id: string; patch: any }) => {
    try {
      const { updateJob } = await import('./services/cron-scheduler')
      return { ok: true, job: updateJob(args.id, args.patch) }
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })
  ipcMain.handle('cron:remove', async (_ev, id: string) => {
    try {
      const { removeJob } = await import('./services/cron-scheduler')
      removeJob(id)
      return { ok: true }
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })

  // #292 D-68 — Strava-style yearly goal ring. User sets a goal
  // ("watch 200 hours" / "rate 500 items" / "deny 80 sessions"); we
  // compute progress for the calendar year.
  ipcMain.handle('yearlyGoal:get', async () => {
    try {
      const { getSettings } = await import('./settings')
      const s = getSettings() as any
      const goal = s.yearlyGoal ?? { metric: 'hours_watched', target: 200 }
      const yearStart = new Date(new Date().getFullYear(), 0, 1).getTime()
      let progress = 0
      if (goal.metric === 'hours_watched') {
        const rows = db.raw.prepare(`
          SELECT SUM(s.views * m.durationSec) AS sec
          FROM media_stats s JOIN media m ON m.id = s.mediaId
          WHERE s.lastViewedAt >= ?
        `).get(yearStart) as { sec: number | null }
        progress = Math.round(((rows.sec ?? 0) / 3600) * 10) / 10
      } else if (goal.metric === 'items_rated') {
        const rows = db.raw.prepare(`SELECT COUNT(*) AS n FROM media_stats WHERE rating > 0 AND lastViewedAt >= ?`).get(yearStart) as { n: number }
        progress = rows.n
      } else if (goal.metric === 'climaxes') {
        const rows = db.raw.prepare(`SELECT COUNT(*) AS n FROM edging_sessions WHERE climaxed = 1 AND endedAt >= ?`).get(yearStart) as { n: number }
        progress = rows.n
      } else if (goal.metric === 'denials') {
        const rows = db.raw.prepare(`SELECT COUNT(*) AS n FROM edging_sessions WHERE climaxed = 0 AND endedAt >= ?`).get(yearStart) as { n: number }
        progress = rows.n
      }
      const dayOfYear = Math.floor((Date.now() - yearStart) / 86_400_000) + 1
      const onPace = goal.target > 0 ? (goal.target * (dayOfYear / 365)) : 0
      return {
        ok: true, goal, progress, dayOfYear,
        pct: goal.target > 0 ? Math.min(1, progress / goal.target) : 0,
        onPaceProgress: onPace,
        aheadOfPace: progress > onPace,
      }
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })
  ipcMain.handle('yearlyGoal:set', async (_ev, args: { metric: 'hours_watched' | 'items_rated' | 'climaxes' | 'denials'; target: number }) => {
    try {
      const { updateSettings } = await import('./settings')
      updateSettings({ yearlyGoal: { metric: args.metric, target: Math.max(1, args.target) } } as any)
      return { ok: true }
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })

  // #301 D-77 — Goodreads-style "Currently Watching" shelves.
  // Returns media with watch progress > 5% but not yet finished,
  // touched in the last 30 days.
  ipcMain.handle('currentlyWatching:list', async (_ev, args?: { daysBack?: number; limit?: number }) => {
    try {
      const daysBack = args?.daysBack ?? 30
      const limit = Math.max(1, Math.min(args?.limit ?? 50, 200))
      const cutoff = Date.now() - daysBack * 86_400_000
      const rows = db.raw.prepare(`
        SELECT m.id AS mediaId, m.filename, m.thumbPath, m.durationSec,
               s.views, s.rating, s.lastViewedAt, wh.progressSec
        FROM media m
        JOIN media_stats s ON s.mediaId = m.id
        LEFT JOIN watch_history wh ON wh.mediaId = m.id
        WHERE s.lastViewedAt >= ?
          AND m.durationSec > 60
          AND wh.progressSec IS NOT NULL
          AND wh.progressSec > 30
          AND wh.progressSec < (m.durationSec * 0.92)
        ORDER BY s.lastViewedAt DESC
        LIMIT ?
      `).all(cutoff, limit) as any[]
      const items = rows.map((r) => ({
        mediaId: r.mediaId,
        filename: r.filename,
        thumbPath: r.thumbPath,
        durationSec: r.durationSec,
        progressSec: r.progressSec,
        progressPct: r.progressSec / r.durationSec,
        rating: r.rating,
        lastViewedAt: r.lastViewedAt,
      }))
      return { ok: true, items }
    } catch (err: any) {
      // watch_history table may not exist — degrade gracefully.
      return { ok: false, error: err?.message ?? String(err), items: [] }
    }
  })

  // #295 D-71 — Letterboxd-style watch diary calendar. Returns a
  // 365-day grid of viewing activity: per-day count + total minutes.
  ipcMain.handle('watchDiary:days', async (_ev, args?: { daysBack?: number }) => {
    try {
      const daysBack = Math.max(7, Math.min(args?.daysBack ?? 365, 365 * 3))
      const cutoff = Date.now() - daysBack * 86_400_000
      const rows = db.raw.prepare(`
        SELECT s.lastViewedAt AS ts, s.views, m.durationSec
        FROM media_stats s JOIN media m ON m.id = s.mediaId
        WHERE s.lastViewedAt >= ?
      `).all(cutoff) as Array<{ ts: number; views: number; durationSec: number | null }>
      // Bucket by day key (YYYY-MM-DD local).
      const days = new Map<string, { itemsTouched: number; minutes: number }>()
      for (const r of rows) {
        const d = new Date(r.ts)
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
        const cur = days.get(key) ?? { itemsTouched: 0, minutes: 0 }
        cur.itemsTouched += 1
        cur.minutes += ((r.views || 0) * (r.durationSec || 0)) / 60
        days.set(key, cur)
      }
      const out = Array.from(days.entries()).map(([day, v]) => ({
        day, itemsTouched: v.itemsTouched, minutes: Math.round(v.minutes),
      })).sort((a, b) => a.day.localeCompare(b.day))
      return { ok: true, days: out }
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })

  // #288 D-64 — Daylist auto-retitling. 4h-rotating title that the
  // UI displays above the daily-mix card.
  ipcMain.handle('daylist:title', async () => {
    try {
      const { getOrRefreshDaylistTitle } = await import('./services/daylist-titler')
      return { ok: true, ...getOrRefreshDaylistTitle() }
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })
  ipcMain.handle('daylist:regenerate', async () => {
    try {
      const { forceRegenerateDaylistTitle } = await import('./services/daylist-titler')
      return { ok: true, ...forceRegenerateDaylistTitle() }
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })

  // #303 D-79 — Spotify-style Recap cards. Monthly / mid-year /
  // yearly aggregator over watch history + tags + performers + studios.
  ipcMain.handle('recap:monthly', async (_ev, args?: { year?: number; month0?: number }) => {
    try {
      const { getMonthlyRecap } = await import('./services/recap-stats')
      return { ok: true, recap: getMonthlyRecap(db.raw as any, args?.year, args?.month0) }
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })
  ipcMain.handle('recap:halfYear', async (_ev, args?: { year?: number; half?: 1 | 2 }) => {
    try {
      const { getHalfYearRecap } = await import('./services/recap-stats')
      return { ok: true, recap: getHalfYearRecap(db.raw as any, args?.year, args?.half) }
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })
  ipcMain.handle('recap:yearly', async (_ev, args?: { year?: number }) => {
    try {
      const { getYearlyRecap } = await import('./services/recap-stats')
      return { ok: true, recap: getYearlyRecap(db.raw as any, args?.year) }
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })

  // #289 D-65 — Calibre-style Virtual Libraries. Named filter sets
  // saved to settings; sidebar exposes them as one-click lenses
  // ("My favorites under 5 min", "Performer:X + tag:y", etc).
  ipcMain.handle('virtualLibs:list', async () => {
    try {
      const { getSettings } = await import('./settings')
      const s = getSettings() as any
      const libs = Array.isArray(s.virtualLibraries) ? s.virtualLibraries : []
      return { ok: true, libraries: libs }
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })
  ipcMain.handle('virtualLibs:save', async (_ev, args: { id?: string; name: string; query: any; color?: string; icon?: string }) => {
    try {
      const { getSettings, updateSettings } = await import('./settings')
      const { nanoid } = await import('nanoid')
      const s = getSettings() as any
      const libs = Array.isArray(s.virtualLibraries) ? [...s.virtualLibraries] : []
      const id = args.id ?? nanoid()
      const entry = { id, name: args.name, query: args.query, color: args.color ?? null, icon: args.icon ?? null, createdAt: Date.now() }
      const idx = libs.findIndex((l: any) => l.id === id)
      if (idx >= 0) libs[idx] = { ...libs[idx], ...entry }
      else libs.push(entry)
      updateSettings({ virtualLibraries: libs } as any)
      return { ok: true, id }
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })
  ipcMain.handle('virtualLibs:delete', async (_ev, id: string) => {
    try {
      const { getSettings, updateSettings } = await import('./settings')
      const s = getSettings() as any
      const libs = Array.isArray(s.virtualLibraries) ? s.virtualLibraries.filter((l: any) => l.id !== id) : []
      updateSettings({ virtualLibraries: libs } as any)
      return { ok: true }
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })
  ipcMain.handle('virtualLibs:reorder', async (_ev, orderedIds: string[]) => {
    try {
      const { getSettings, updateSettings } = await import('./settings')
      const s = getSettings() as any
      const libs = Array.isArray(s.virtualLibraries) ? s.virtualLibraries : []
      const map = new Map(libs.map((l: any) => [l.id, l]))
      const reordered = orderedIds.map((id) => map.get(id)).filter(Boolean)
      // Append any libs not in orderedIds (just-created, etc).
      for (const l of libs) if (!orderedIds.includes(l.id)) reordered.push(l)
      updateSettings({ virtualLibraries: reordered } as any)
      return { ok: true }
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })

  // #293 D-69 — Anki FSRS-lite rediscovery queue. Surfaces watched
  // items currently in the spaced-repetition sweet spot.
  ipcMain.handle('rediscovery:queue', async (_ev, args?: { limit?: number; minDaysSinceView?: number }) => {
    try {
      const { getRediscoveryQueue } = await import('./services/rediscovery-queue')
      return { ok: true, items: getRediscoveryQueue(db.raw as any, args ?? {}) }
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })

  // #368 H-144 — BDSM contract & negotiation form. CRUD + sign +
  // a render-ready context block consumed by the Mistress persona.
  ipcMain.handle('contract:get', async () => {
    try {
      const { loadContract } = await import('./services/bdsm-contract')
      return { ok: true, contract: loadContract() }
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })
  ipcMain.handle('contract:save', async (_ev, contract: any) => {
    try {
      const { saveContract } = await import('./services/bdsm-contract')
      saveContract(contract)
      return { ok: true }
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })
  ipcMain.handle('contract:sign', async () => {
    try {
      const { signContract } = await import('./services/bdsm-contract')
      return { ok: true, contract: signContract() }
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })
  ipcMain.handle('contract:reset', async () => {
    try {
      const { getDefaultContract, saveContract } = await import('./services/bdsm-contract')
      const fresh = getDefaultContract()
      saveContract(fresh)
      return { ok: true, contract: fresh }
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })

  // #361 G-137 — kink-discovery recommender via latent kink map.
  // Clusters high-rated media's CLIP embeddings; recommends unrated
  // media nearest to each cluster centroid.
  ipcMain.handle('kinkDiscovery:run', async (_ev, args?: { k?: number; ratingMin?: number; recsPerCluster?: number }) => {
    try {
      const { discoverKinks } = await import('./services/kink-discovery')
      return { ok: true, ...discoverKinks(db.raw as any, args ?? {}) }
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })

  // #298 D-74 — Linear-style triage inbox. List pending items, mark
  // approved/rejected/archived, and toggle whether new scans default
  // to pending. When enabled, scanner sets new media to 'pending';
  // when disabled (default), new media is 'active' immediately.
  ipcMain.handle('triage:list', async (_ev, args?: { status?: 'pending' | 'active' | 'archived' | 'rejected'; limit?: number; offset?: number }) => {
    try {
      const status = args?.status ?? 'pending'
      const limit = Math.max(1, Math.min(args?.limit ?? 100, 500))
      const offset = Math.max(0, args?.offset ?? 0)
      const rows = db.raw.prepare(`
        SELECT id, filename, path, thumbPath, type, durationSec, addedAt, triage_status AS triageStatus
        FROM media
        WHERE triage_status = ?
        ORDER BY addedAt DESC
        LIMIT ? OFFSET ?
      `).all(status, limit, offset)
      const total = db.raw.prepare(`SELECT COUNT(*) AS n FROM media WHERE triage_status = ?`).get(status) as { n: number }
      return { ok: true, items: rows, total: total.n }
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })
  ipcMain.handle('triage:setStatus', async (_ev, args: { mediaIds: string[]; status: 'pending' | 'active' | 'archived' | 'rejected' }) => {
    try {
      const stmt = db.raw.prepare(`UPDATE media SET triage_status = ? WHERE id = ?`)
      const tx = db.raw.transaction((ids: string[], s: string) => { for (const id of ids) stmt.run(s, id) })
      tx(args.mediaIds, args.status)
      broadcast('vault:changed')
      return { ok: true, updated: args.mediaIds.length }
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })
  ipcMain.handle('triage:setInboxEnabled', async (_ev, enabled: boolean) => {
    try {
      const { updateSettings } = await import('./settings')
      updateSettings({ triageInboxEnabled: !!enabled } as any)
      return { ok: true }
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })
  ipcMain.handle('triage:getInboxEnabled', async () => {
    try {
      const { getSettings } = await import('./settings')
      const s = getSettings() as any
      return { ok: true, enabled: !!s.triageInboxEnabled }
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })

  // #299 D-75 — Stash Studios entity. CRUD + assign performers/media.
  // Each studio is a parent grouping (Brazzers / Vixen / etc) with
  // logo/website/alias metadata. Performers and media have nullable
  // studio_id FKs so a studio change cascades cleanly.
  ipcMain.handle('studios:list', async () => {
    try {
      const rows = db.raw.prepare(`
        SELECT s.*,
               (SELECT COUNT(*) FROM performers_db p WHERE p.studio_id = s.id) AS performer_count,
               (SELECT COUNT(*) FROM media m WHERE m.studio_id = s.id) AS media_count
        FROM studios s
        ORDER BY s.name COLLATE NOCASE
      `).all() as any[]
      return { ok: true, studios: rows.map((r) => ({ ...r, aliases: r.aliases ? JSON.parse(r.aliases) : [], url_patterns: r.url_patterns ? JSON.parse(r.url_patterns) : [] })) }
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })
  ipcMain.handle('studios:create', async (_ev, args: { name: string; aliases?: string[]; logo_path?: string; parent_company?: string; website?: string; url_patterns?: string[] }) => {
    try {
      const { nanoid } = await import('nanoid')
      const id = nanoid()
      const now = Date.now()
      db.raw.prepare(`
        INSERT INTO studios (id, name, aliases, logo_path, parent_company, website, url_patterns, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id, args.name,
        args.aliases ? JSON.stringify(args.aliases) : null,
        args.logo_path ?? null,
        args.parent_company ?? null,
        args.website ?? null,
        args.url_patterns ? JSON.stringify(args.url_patterns) : null,
        now, now,
      )
      return { ok: true, id }
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })
  ipcMain.handle('studios:update', async (_ev, args: { id: string; name?: string; aliases?: string[]; logo_path?: string; parent_company?: string; website?: string; url_patterns?: string[] }) => {
    try {
      const sets: string[] = []
      const params: any[] = []
      const map: Record<string, any> = {
        name: args.name,
        aliases: args.aliases !== undefined ? JSON.stringify(args.aliases) : undefined,
        logo_path: args.logo_path,
        parent_company: args.parent_company,
        website: args.website,
        url_patterns: args.url_patterns !== undefined ? JSON.stringify(args.url_patterns) : undefined,
      }
      for (const [k, v] of Object.entries(map)) {
        if (v !== undefined) { sets.push(`${k} = ?`); params.push(v) }
      }
      if (sets.length === 0) return { ok: true }
      sets.push(`updated_at = ?`)
      params.push(Date.now(), args.id)
      db.raw.prepare(`UPDATE studios SET ${sets.join(', ')} WHERE id = ?`).run(...params)
      broadcast('vault:changed')
      return { ok: true }
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })
  ipcMain.handle('studios:delete', async (_ev, id: string) => {
    try {
      db.raw.prepare(`DELETE FROM studios WHERE id = ?`).run(id)
      broadcast('vault:changed')
      return { ok: true }
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })
  ipcMain.handle('studios:assignPerformer', async (_ev, args: { performerId: string; studioId: string | null }) => {
    try {
      db.raw.prepare(`UPDATE performers_db SET studio_id = ?, updated_at = ? WHERE id = ?`)
        .run(args.studioId, Date.now(), args.performerId)
      broadcast('vault:changed')
      return { ok: true }
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })
  ipcMain.handle('studios:assignMedia', async (_ev, args: { mediaId: string; studioId: string | null }) => {
    try {
      db.raw.prepare(`UPDATE media SET studio_id = ? WHERE id = ?`).run(args.studioId, args.mediaId)
      broadcast('vault:changed')
      return { ok: true }
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })
  ipcMain.handle('studios:mediaForStudio', async (_ev, studioId: string) => {
    try {
      const rows = db.raw.prepare(`SELECT id, filename, path, thumbPath, durationSec FROM media WHERE studio_id = ? ORDER BY addedAt DESC LIMIT 500`).all(studioId)
      return { ok: true, media: rows }
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })

  // #306 E-82 — inbound webhook receiver. Loopback HTTP server with
  // HMAC-SHA256-signed routes. Useful for n8n / Make / Zapier
  // automations that need to fire Vault actions externally.
  ipcMain.handle('webhook:status', async () => {
    try {
      const { getStatus } = await import('./services/webhook-receiver')
      return { ok: true, ...getStatus() }
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })
  ipcMain.handle('webhook:start', async (_ev, args?: { port?: number; bindHost?: string }) => {
    try {
      const { startWebhookServer, listRoutes } = await import('./services/webhook-receiver')
      const { getSettings } = await import('./settings')
      const s = getSettings() as any
      const initial = Array.isArray(s.webhookRoutes) ? s.webhookRoutes : []
      const r = await startWebhookServer({ port: args?.port, bindHost: args?.bindHost, initialRoutes: initial })
      return { ...r, routes: listRoutes() }
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })
  ipcMain.handle('webhook:stop', async () => {
    try {
      const { stopWebhookServer } = await import('./services/webhook-receiver')
      await stopWebhookServer()
      return { ok: true }
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })
  ipcMain.handle('webhook:listRoutes', async () => {
    try {
      const { listRoutes } = await import('./services/webhook-receiver')
      return { ok: true, routes: listRoutes() }
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })
  ipcMain.handle('webhook:addRoute', async (_ev, args: { path: string; secret?: string; description?: string }) => {
    try {
      const { addRoute } = await import('./services/webhook-receiver')
      const { updateSettings, getSettings } = await import('./settings')
      const route = addRoute(args.path, args)
      const s = getSettings() as any
      const routes = Array.isArray(s.webhookRoutes) ? s.webhookRoutes : []
      updateSettings({ webhookRoutes: [...routes, route] } as any)
      return { ok: true, route }
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })
  ipcMain.handle('webhook:removeRoute', async (_ev, id: string) => {
    try {
      const { removeRoute } = await import('./services/webhook-receiver')
      const { updateSettings, getSettings } = await import('./settings')
      const removed = removeRoute(id)
      const s = getSettings() as any
      const routes = Array.isArray(s.webhookRoutes) ? s.webhookRoutes : []
      updateSettings({ webhookRoutes: routes.filter((r: any) => r.id !== id) } as any)
      return { ok: removed }
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })

  // #B-23 Depth Anything V2 monocular depth
  ipcMain.handle('vaultMl:depthAnythingV2', async (_ev, args: any) => {
    try {
      const { getVaultMlClient } = await import('./services/ai-intelligence/vault-ml-client')
      return await getVaultMlClient().depthAnythingV2(args)
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })
  // #H-148 MusicGen kink-mood audio bed generation
  ipcMain.handle('vaultMl:musicgenGenerate', async (_ev, args: any) => {
    try {
      const { getVaultMlClient } = await import('./services/ai-intelligence/vault-ml-client')
      return await getVaultMlClient().musicgenGenerate(args)
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })
  // BLIP captioning (tagger pipeline)
  ipcMain.handle('vaultMl:blipCaption', async (_ev, args: any) => {
    try {
      const { getVaultMlClient } = await import('./services/ai-intelligence/vault-ml-client')
      return await getVaultMlClient().blipCaption(args)
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })

  // #B-30 Mel-Roformer vocal isolation
  ipcMain.handle('vaultMl:melRoformerSeparate', async (_ev, args: any) => {
    try {
      const { getVaultMlClient } = await import('./services/ai-intelligence/vault-ml-client')
      return await getVaultMlClient().melRoformerSeparate(args)
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })

  // JoyTag — pure ONNX adult-tagger (no sidecar needed)
  ipcMain.handle('joytag:status', async () => {
    try {
      const { getStatus } = await import('./services/ai-intelligence/joytag-tagger')
      return { ok: true, ...getStatus() }
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })
  ipcMain.handle('joytag:tagImage', async (_ev, args: { imagePath: string; threshold?: number; topK?: number }) => {
    try {
      const { tagImage } = await import('./services/ai-intelligence/joytag-tagger')
      const tags = await tagImage(args.imagePath, args)
      return { ok: true, tags }
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })

  // #B-32 — Real-ESRGAN x4 upscaler. Loads ONNX from
  // userData/models/real_esrgan_x4plus.onnx + .data sibling.
  ipcMain.handle('upscaler:status', async () => {
    try {
      const { getStatus } = await import('./services/ai-intelligence/realesrgan-upscaler')
      return { ok: true, ...getStatus() }
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })
  ipcMain.handle('upscaler:upscaleImage', async (_ev, args: { srcPath: string; dstPath?: string; tileSize?: number; format?: 'png' | 'jpg' | 'webp'; quality?: number }) => {
    try {
      const { upscaleImage } = await import('./services/ai-intelligence/realesrgan-upscaler')
      return await upscaleImage(args.srcPath, args.dstPath, args)
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })

  // #324 — auto FFmpeg quality auditor. Fast probe + heuristic
  // findings by default; deep:true adds a full decode pass.
  ipcMain.handle('quality:audit', async (_ev, args: { videoPath: string; deep?: boolean; sizeBytes?: number | null }) => {
    try {
      const { auditVideo } = await import('./services/quality-auditor')
      const { ffprobeBin, ffmpegBin } = await import('./ffpaths')
      if (!ffprobeBin || !ffmpegBin) return { ok: false, error: 'ffmpeg/ffprobe not found' }
      const report = await auditVideo(ffprobeBin, ffmpegBin, args.videoPath, { deep: args.deep, sizeBytes: args.sizeBytes })
      return { ok: true, report }
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })

  // #290 D-66 — Stash-style scene markers — already shipped via the
  // existing bookmarks system (`bookmarks:*` IPCs + B-key in the
  // player). The v37 migration's `scene_markers` table is unused;
  // leaving it as a no-op for back-compat in case third-party tooling
  // expects the column. New work goes through bookmarks instead.

  // #380 H-156 — phrase-triggered supercut compiler. Three IPCs:
  // search-phrase (FTS5 lookup), persist-segments (cache VTT output),
  // and compile (ffmpeg concat + encode of the matched clips).
  ipcMain.handle('supercut:persistSegments', async (_ev, args: { mediaId: string; segments: Array<{ startSec: number; endSec: number; text: string }> }) => {
    try {
      const { persistSegments } = await import('./services/phrase-supercut')
      persistSegments(db.raw as any, args.mediaId, args.segments)
      return { ok: true, count: args.segments.length }
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })
  ipcMain.handle('supercut:search', async (_ev, args: { phrase: string; limit?: number; mediaIdFilter?: string[] }) => {
    try {
      const { searchPhrase } = await import('./services/phrase-supercut')
      const hits = searchPhrase(db.raw as any, args.phrase, { limit: args.limit, mediaIdFilter: args.mediaIdFilter })
      return { ok: true, hits }
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })
  ipcMain.handle('supercut:compile', async (_ev, args: { hits: any[]; dstPath: string; padBeforeSec?: number; padAfterSec?: number; videoCodec?: string; width?: number; height?: number; fps?: number; maxClips?: number }) => {
    try {
      const { compileSupercut } = await import('./services/phrase-supercut')
      const { ffmpegBin } = await import('./ffpaths')
      if (!ffmpegBin) return { ok: false, error: 'ffmpeg not found' }
      return await compileSupercut(ffmpegBin, args.hits, args.dstPath, args)
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })

  // #229 — local Whisper word-level VTT transcript. Uses the existing
  // whisper.cpp binary; emits WebVTT cues with HH:MM:SS.mmm timestamps
  // that the renderer can hand to `<track>` or feed into the
  // phrase-triggered supercut compiler (#H-156).
  ipcMain.handle('whisper:transcribeVtt', async (_ev, args: { videoPath: string; maxAudioSec?: number; maxLenTokens?: number }) => {
    try {
      const { transcribeAudioToVtt } = await import('./services/ai-intelligence/whisper-transcriber')
      const { ffmpegBin } = await import('./ffpaths')
      if (!ffmpegBin) return { ok: false, error: 'ffmpeg not found' }
      const r = await transcribeAudioToVtt(args.videoPath, ffmpegBin, {
        maxAudioSec: args.maxAudioSec,
        maxLenTokens: args.maxLenTokens,
      })
      if (!r) return { ok: false, error: 'transcription failed (whisper not installed?)' }
      return { ok: true, ...r }
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })

  // #233 — chapter round-trip. Read existing chapters from the
  // container, export as WebVTT sidecar, accept user-edited chapter
  // list back via FFmetadata re-mux.
  ipcMain.handle('chapters:read', async (_ev, srcPath: string) => {
    try {
      const { readChapters } = await import('./services/chapter-roundtrip')
      const { ffprobeBin } = await import('./ffpaths')
      if (!ffprobeBin) return { ok: false, error: 'ffprobe not found' }
      const chapters = await readChapters(ffprobeBin, srcPath)
      return { ok: true, chapters }
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })
  ipcMain.handle('chapters:writeFFMeta', async (_ev, args: { srcPath: string; dstPath: string; chapters: Array<{ startSec: number; endSec: number; title: string }> }) => {
    try {
      const { writeChaptersFFMeta } = await import('./services/chapter-roundtrip')
      const { ffmpegBin } = await import('./ffpaths')
      if (!ffmpegBin) return { ok: false, error: 'ffmpeg not found' }
      return await writeChaptersFFMeta(ffmpegBin, args.srcPath, args.dstPath, args.chapters)
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })
  ipcMain.handle('chapters:exportVtt', async (_ev, args: { chapters: Array<{ startSec: number; endSec: number; title: string }>; dstPath: string }) => {
    try {
      const { exportChaptersAsVtt } = await import('./services/chapter-roundtrip')
      const fs = await import('node:fs/promises')
      const vtt = exportChaptersAsVtt(args.chapters)
      await fs.writeFile(args.dstPath, vtt, 'utf8')
      return { ok: true, dstPath: args.dstPath }
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })
  ipcMain.handle('chapters:parseVtt', async (_ev, args: { vttText: string; durationSec: number }) => {
    try {
      const { parseChaptersFromVtt } = await import('./services/chapter-roundtrip')
      return { ok: true, chapters: parseChaptersFromVtt(args.vttText, args.durationSec) }
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })

  // #225 / #235 / #238 — ffmpeg post-processing helpers (HDR tone-map,
  // audio mastering, hqdn3d denoise+grain restore). All non-destructive
  // by default: write a sibling file with a suffix unless dstPath is set.
  ipcMain.handle('postProc:toneMapHDR', async (_ev, args: { srcPath: string; dstPath?: string; tonemap?: 'hable' | 'mobius' | 'reinhard'; peak?: number; videoCodec?: string; crf?: number }) => {
    try {
      const { toneMapHDR } = await import('./services/video-post-processing')
      const { ffmpegBin } = await import('./ffpaths')
      if (!ffmpegBin) return { ok: false, error: 'ffmpeg not found' }
      return await toneMapHDR(ffmpegBin, args.srcPath, args)
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })
  ipcMain.handle('postProc:masterAudio', async (_ev, args: { srcPath: string; dstPath?: string; targetLufs?: number; truePeakDb?: number; lra?: number }) => {
    try {
      const { masterAudio } = await import('./services/video-post-processing')
      const { ffmpegBin } = await import('./ffpaths')
      if (!ffmpegBin) return { ok: false, error: 'ffmpeg not found' }
      return await masterAudio(ffmpegBin, args.srcPath, args)
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })
  ipcMain.handle('postProc:denoise', async (_ev, args: { srcPath: string; dstPath?: string; strength?: 'light' | 'medium' | 'heavy'; grain?: number; videoCodec?: string; crf?: number }) => {
    try {
      const { denoiseAndGrain } = await import('./services/video-post-processing')
      const { ffmpegBin } = await import('./ffpaths')
      if (!ffmpegBin) return { ok: false, error: 'ffmpeg not found' }
      return await denoiseAndGrain(ffmpegBin, args.srcPath, args)
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })
  // #231 — ffmpeg vidstab two-pass deshake
  ipcMain.handle('postProc:deshake', async (_ev, args: { srcPath: string; dstPath?: string; shakiness?: number; accuracy?: number; smoothing?: number; crop?: 'black' | 'keep'; videoCodec?: string; crf?: number }) => {
    try {
      const { deshake } = await import('./services/video-post-processing')
      const { ffmpegBin } = await import('./ffpaths')
      if (!ffmpegBin) return { ok: false, error: 'ffmpeg not found' }
      return await deshake(ffmpegBin, args.srcPath, args)
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })

  // Media tool dialogs — backends for MediaExporter, MediaMerger,
  // MediaRotator, WatermarkAdder. Previously these tool dialogs in
  // LibraryPage just toasted on submit; now they actually run ffmpeg.
  ipcMain.handle('mediaTools:export', async (_ev, args: { srcPath: string; dstPath: string; options: any }) => {
    try {
      const { exportMedia } = await import('./services/media-tools')
      const { ffmpegBin } = await import('./ffpaths')
      if (!ffmpegBin) return { ok: false, error: 'ffmpeg not found' }
      return await exportMedia(ffmpegBin, args.srcPath, args.dstPath, args.options)
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })
  ipcMain.handle('mediaTools:merge', async (_ev, args: { srcPaths: string[]; dstPath: string; options?: any }) => {
    try {
      const { mergeVideos } = await import('./services/media-tools')
      const { ffmpegBin } = await import('./ffpaths')
      if (!ffmpegBin) return { ok: false, error: 'ffmpeg not found' }
      return await mergeVideos(ffmpegBin, args.srcPaths, args.dstPath, args.options ?? {})
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })
  ipcMain.handle('mediaTools:rotate', async (_ev, args: { srcPath: string; dstPath: string; options: any }) => {
    try {
      const { rotateMedia } = await import('./services/media-tools')
      const { ffmpegBin } = await import('./ffpaths')
      if (!ffmpegBin) return { ok: false, error: 'ffmpeg not found' }
      return await rotateMedia(ffmpegBin, args.srcPath, args.dstPath, args.options)
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })
  ipcMain.handle('mediaTools:watermark', async (_ev, args: { srcPath: string; dstPath: string; options: any }) => {
    try {
      const { applyWatermark } = await import('./services/media-tools')
      const { ffmpegBin } = await import('./ffpaths')
      if (!ffmpegBin) return { ok: false, error: 'ffmpeg not found' }
      return await applyWatermark(ffmpegBin, args.srcPath, args.dstPath, args.options)
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })
  ipcMain.handle('mediaTools:extractFrames', async (_ev, args: { srcPath: string; options: any }) => {
    try {
      const { extractFrames } = await import('./services/media-tools')
      const { ffmpegBin } = await import('./ffpaths')
      if (!ffmpegBin) return { ok: false, error: 'ffmpeg not found' }
      return await extractFrames(ffmpegBin, args.srcPath, args.options)
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })

  // #237 — silence + black-frame auto-trim. Analyze gives a dry-run
  // report (silences/blacks/recommendation), apply does the actual
  // ffmpeg stream-copy with the chosen [start, end].
  ipcMain.handle('autoTrim:analyze', async (_ev, videoPath: string) => {
    try {
      const { analyzeAutoTrim } = await import('./services/ai-intelligence/auto-trim')
      const { ffmpegBin } = await import('./ffpaths')
      const ffmpeg = ffmpegBin
      if (!ffmpeg) return { ok: false, error: 'ffmpeg not found' }
      const report = await analyzeAutoTrim(ffmpeg, videoPath)
      return { ok: true, report }
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })
  ipcMain.handle('autoTrim:apply', async (_ev, args: { srcPath: string; dstPath: string; startSec: number; endSec: number }) => {
    try {
      const { applyTrim } = await import('./services/ai-intelligence/auto-trim')
      const { ffmpegBin } = await import('./ffpaths')
      const ffmpeg = ffmpegBin
      if (!ffmpeg) return { ok: false, error: 'ffmpeg not found' }
      return await applyTrim(ffmpeg, args.srcPath, args.dstPath, args.startSec, args.endSec)
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })

  // #244 — moment-capture sink. Renderer hands us a WebP buffer; we
  // write to userData/moments/<filename>. Idempotent (overwrite on
  // duplicate timestamp — the renderer prevents collisions with ms).
  ipcMain.handle('moments:save', async (_ev, args: { filename: string; data: number[] }) => {
    try {
      const fs = await import('node:fs/promises')
      const path = await import('node:path')
      const { app } = await import('electron')
      const dir = path.join(app.getPath('userData'), 'moments')
      await fs.mkdir(dir, { recursive: true })
      const safe = args.filename.replace(/[^a-zA-Z0-9._-]/g, '_')
      const dest = path.join(dir, safe)
      await fs.writeFile(dest, Buffer.from(args.data))
      return { ok: true, path: dest }
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })

  ipcMain.handle('stealth:disable', async () => {
    try {
      const { BrowserWindow } = await import('electron')
      for (const w of BrowserWindow.getAllWindows()) {
        try { w.setTitle('Vault') } catch { /* ignore */ }
      }
      if (process.platform === 'win32') {
        try { (require('electron').app).setAppUserModelId('com.vault.desktop') } catch { /* ignore */ }
      }
      const { updateSettings } = await import('./settings')
      updateSettings({ stealthProfile: null } as any)
      return { ok: true }
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })

  // #175 — Real-time RVC voice conversion. Same sidecar pattern as
  // F5-TTS / WhisperX — user installs RVC + a thin Flask wrapper
  // and points settings.ai.rvcStartScript at the launch script.
  ipcMain.handle('rvc:status', async () => {
    try {
      const { rvcStatus } = await import('./services/rvc-launcher')
      return { ok: true, ...rvcStatus() }
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })

  ipcMain.handle('rvc:start', async () => {
    try {
      const { ensureRvcSidecar } = await import('./services/rvc-launcher')
      const started = await ensureRvcSidecar()
      return { ok: started }
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })

  ipcMain.handle('rvc:listModels', async () => {
    try {
      const { listModels } = await import('./services/rvc-launcher')
      return { ok: true, models: await listModels() }
    } catch (err: any) {
      return { ok: false, models: [], error: err?.message ?? String(err) }
    }
  })

  ipcMain.handle('rvc:convert', async (_ev, args: { srcPath: string; modelName: string; transpose?: number }) => {
    try {
      const { convert } = await import('./services/rvc-launcher')
      return await convert(args)
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })

  // #173 — Demucs stem separation. Shells out to the `demucs` CLI
  // (pip install demucs) and writes vocal/drums/bass/other stems
  // into userData/stems/<model>/<basename>/. Two-stem mode collapses
  // to vocals + accompaniment.
  ipcMain.handle('demucs:status', async (_ev, args?: { binPath?: string }) => {
    try {
      const { demucsStatus } = await import('./services/demucs-launcher')
      return { ok: true, ...demucsStatus(args) }
    } catch (err: any) {
      return { ok: false, installed: false, error: err?.message ?? String(err) }
    }
  })

  ipcMain.handle('demucs:separate', async (ev, args: { srcPath: string; model?: string; twoStem?: boolean; binPath?: string }) => {
    try {
      const { separateStems } = await import('./services/demucs-launcher')
      const result = await separateStems(args.srcPath, {
        binPath: args.binPath,
        model: args.model,
        twoStem: args.twoStem,
        onProgress: (pct, line) => {
          try { ev.sender.send('demucs:progress', { srcPath: args.srcPath, pct, line }) } catch { /* sender gone */ }
        },
      })
      return result
    } catch (err: any) {
      return { ok: false, outputDir: '', stemPaths: {}, error: err?.message ?? String(err) }
    }
  })

  // #191 — age-encrypted backups. Shells out to the `age` CLI which
  // the user installs via their package manager; supports hardware-key
  // recipients (YubiKey) via age-plugin-yubikey identity strings.
  ipcMain.handle('age:status', async () => {
    try {
      const { ageStatus } = await import('./services/age-backup-service')
      return { ok: true, ...ageStatus() }
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })

  ipcMain.handle('age:encryptFile', async (_ev, args: { srcPath: string; dstPath: string; recipients: string[] }) => {
    try {
      const { ageEncryptFile } = await import('./services/age-backup-service')
      return await ageEncryptFile(args)
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })

  ipcMain.handle('age:decryptFile', async (_ev, args: { srcPath: string; dstPath: string; identityPaths: string[] }) => {
    try {
      const { ageDecryptFile } = await import('./services/age-backup-service')
      return await ageDecryptFile(args)
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })

  // #193 — Per-file envelope encryption (streaming AES-GCM).
  // The renderer triggers encrypt/decrypt explicitly; auto-integration
  // with the scanner / vaultProtocol is a follow-up step. Passphrase
  // is required per call so it never sits in memory between ops.
  ipcMain.handle('crypto:envelope-encrypt', async (_ev, args: { srcPath: string; dstPath: string; passphrase: string }) => {
    try {
      const { encryptFile } = await import('./services/envelope-encryption')
      await encryptFile(args.srcPath, args.dstPath, args.passphrase)
      return { ok: true }
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })

  ipcMain.handle('crypto:envelope-decrypt', async (_ev, args: { srcPath: string; dstPath: string; passphrase: string }) => {
    try {
      const { decryptFile } = await import('./services/envelope-encryption')
      await decryptFile(args.srcPath, args.dstPath, args.passphrase)
      return { ok: true }
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })

  ipcMain.handle('crypto:envelope-plaintextSize', async (_ev, args: { srcPath: string; passphrase: string }) => {
    try {
      const { plaintextSize } = await import('./services/envelope-encryption')
      return { ok: true, size: plaintextSize(args.srcPath, args.passphrase) }
    } catch (err: any) {
      return { ok: false, size: 0, error: err?.message ?? String(err) }
    }
  })

  ipcMain.handle('crypto:envelope-isEnvelope', async (_ev, srcPath: string) => {
    try {
      const { isEnvelope } = await import('./services/envelope-encryption')
      return { ok: true, isEnvelope: isEnvelope(srcPath) }
    } catch (err: any) {
      return { ok: false, isEnvelope: false, error: err?.message ?? String(err) }
    }
  })

  // #192 — SQLCipher migration helper. Feasibility check + dry-run
  // migrator that produces an encrypted COPY of vault.sqlite3 without
  // touching the original. Real cut-over is documented but kept
  // manual so a misclick can't lock the user out of their catalog.
  ipcMain.handle('sqlcipher:feasibility', async () => {
    try {
      const { checkSqlcipherFeasibility } = await import('./services/sqlcipher-migrator')
      return { ok: true, ...checkSqlcipherFeasibility() }
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })

  ipcMain.handle('sqlcipher:dryRun', async (_ev, passphrase: string) => {
    try {
      const { dryRunMigration } = await import('./services/sqlcipher-migrator')
      return await dryRunMigration(passphrase)
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })

  // Generic file / folder pickers for renderer components that need
  // them (age backup card, etc). Returns null when the user cancels.
  ipcMain.handle('dialog:openFile', async (_ev, opts?: { title?: string; filters?: Array<{ name: string; extensions: string[] }> }) => {
    const r = await dialog.showOpenDialog({
      title: opts?.title ?? 'Select file',
      properties: ['openFile'],
      filters: opts?.filters,
    })
    return r.filePaths[0] || null
  })

  ipcMain.handle('dialog:openFolder', async (_ev, opts?: { title?: string }) => {
    const r = await dialog.showOpenDialog({
      title: opts?.title ?? 'Select folder',
      properties: ['openDirectory'],
    })
    return r.filePaths[0] || null
  })

  ipcMain.handle('dialog:saveFile', async (_ev, opts?: { title?: string; defaultPath?: string; filters?: Array<{ name: string; extensions: string[] }> }) => {
    const r = await dialog.showSaveDialog({
      title: opts?.title ?? 'Save as',
      defaultPath: opts?.defaultPath,
      filters: opts?.filters,
    })
    return r.filePath || null
  })

  // #182 — SMB share helper (routes through native OS SMB; no
  // bundled Node SMB server). Windows = `net share` wrapper that
  // surfaces existing shares + lets the user create/remove ones
  // (requires admin). macOS / Linux = status-only with instructions.
  ipcMain.handle('smb:status', async () => {
    try {
      const { getSmbStatus } = await import('./services/smb-share-helper')
      return { ok: true, ...getSmbStatus() }
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })

  ipcMain.handle('smb:create', async (_ev, args: { name: string; path: string; description?: string; readOnly?: boolean }) => {
    try {
      const { createWindowsShare } = await import('./services/smb-share-helper')
      return createWindowsShare(args)
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })

  ipcMain.handle('smb:remove', async (_ev, name: string) => {
    try {
      const { removeWindowsShare } = await import('./services/smb-share-helper')
      return removeWindowsShare(name)
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })

  // #184 — AirPlay 2 receiver discovery (Phase 1). mDNS scan for
  // Apple TVs / HomePods / AirPlay TVs on the LAN. Returns the
  // receiver list so the renderer cast menu can show them next to
  // Chromecast / DLNA targets. Actual streaming (Phase 2) needs a
  // protocol implementation or third-party binary.
  ipcMain.handle('airplay:discover', async (_ev, timeoutMs?: number) => {
    try {
      const { discoverReceivers } = await import('./services/airplay-discovery')
      return { ok: true, receivers: await discoverReceivers(timeoutMs ?? 3500) }
    } catch (err: any) {
      return { ok: false, receivers: [], error: err?.message ?? String(err) }
    }
  })

  // #202 — Phillips Hue Bridge LAN integration for cinema-mode dimming.
  // Renderer triggers dim/restore around fullscreen toggles; the bulbs
  // selected here become "cinema lights" the user has wired up.
  ipcMain.handle('hue:discover', async () => {
    try {
      const { discoverBridges } = await import('./services/hue-client')
      return { ok: true, bridges: await discoverBridges() }
    } catch (err: any) {
      return { ok: false, bridges: [], error: err?.message ?? String(err) }
    }
  })

  ipcMain.handle('hue:pair', async (_ev, bridgeIp: string) => {
    try {
      const { pairBridge } = await import('./services/hue-client')
      return await pairBridge(bridgeIp)
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })

  ipcMain.handle('hue:lights', async (_ev, args: { bridgeIp: string; username: string }) => {
    try {
      const { listLights } = await import('./services/hue-client')
      return { ok: true, lights: await listLights(args.bridgeIp, args.username) }
    } catch (err: any) {
      return { ok: false, lights: [], error: err?.message ?? String(err) }
    }
  })

  ipcMain.handle('hue:cinemaDim', async (_ev, args: { bridgeIp: string; username: string; lightIds: string[]; targetBri?: number }) => {
    try {
      const { cinemaDim } = await import('./services/hue-client')
      return { ok: true, ...(await cinemaDim(args.bridgeIp, args.username, args.lightIds, args.targetBri)) }
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })

  ipcMain.handle('hue:cinemaRestore', async (_ev, args: { bridgeIp: string; username: string; lightIds: string[] }) => {
    try {
      const { cinemaRestore } = await import('./services/hue-client')
      return { ok: true, ...(await cinemaRestore(args.bridgeIp, args.username, args.lightIds)) }
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })

  // #135 — Aesthetic-aware thumbnail picker. Samples 8 frames,
  // embeds each via CLIP, scores via the LAION aesthetic predictor,
  // and re-encodes the highest-scoring frame as the canonical thumb.
  ipcMain.handle('media:pickAestheticThumb', async (_ev, args: { mediaId: string; sampleCount?: number }) => {
    try {
      const { pickAestheticThumb } = await import('./services/aesthetic-thumb-picker')
      const ff = await import('./ffpaths')
      const ffmpegPath = ff.ffmpegBin ?? 'ffmpeg'
      const media = db.getMedia(args.mediaId)
      if (!media) return { ok: false, error: 'Media not found' }
      if (media.type !== 'video') return { ok: false, error: 'Aesthetic thumb only applies to videos' }
      if (!media.durationSec || media.durationSec < 1) return { ok: false, error: 'Source duration unknown' }
      const result = await pickAestheticThumb(media.path, ffmpegPath, media.durationSec, {
        sampleCount: args.sampleCount,
      })
      if (!result) return { ok: false, error: 'Aesthetic predictor or CLIP not available — see Extra Detectors card' }
      return { ...result, ok: result.ok }
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })

  ipcMain.handle('media:regenerateAestheticThumb', async (_ev, args: { mediaId: string }) => {
    try {
      const { regenerateAestheticThumb } = await import('./services/aesthetic-thumb-picker')
      const ff = await import('./ffpaths')
      const ffmpegPath = ff.ffmpegBin ?? 'ffmpeg'
      const media = db.getMedia(args.mediaId)
      if (!media) return { ok: false, error: 'Media not found' }
      if (media.type !== 'video') return { ok: false, error: 'Aesthetic thumb only applies to videos' }
      if (!media.durationSec || media.durationSec < 1) return { ok: false, error: 'Source duration unknown' }
      const result = await regenerateAestheticThumb(
        media.path, ffmpegPath, args.mediaId,
        media.mtimeMs ?? 0, media.durationSec,
      )
      if (result.ok && result.thumbPath) {
        // Persist new thumb on the media row + broadcast so cards refresh.
        db.raw.prepare(`UPDATE media SET thumbPath = ? WHERE id = ?`).run(result.thumbPath, args.mediaId)
        broadcast('vault:changed')
      }
      return result
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })

  // #169 — Auto-reframe to a target aspect ratio (vertical / square /
  // 4:5) using face-detection to pick the crop center.
  ipcMain.handle('media:autoReframePath', async (_ev, args: { mediaId: string; aspectRatio: '9:16' | '1:1' | '4:5' }) => {
    try {
      const { reframedPathFor } = await import('./services/auto-reframe-service')
      return { ok: true, path: reframedPathFor(args.mediaId, args.aspectRatio) }
    } catch (err: any) {
      return { ok: false, path: null, error: err?.message ?? String(err) }
    }
  })

  ipcMain.handle('media:generateAutoReframe', async (_ev, args: { mediaId: string; aspectRatio: '9:16' | '1:1' | '4:5'; force?: boolean }) => {
    try {
      const { autoReframe } = await import('./services/auto-reframe-service')
      const ff = await import('./ffpaths')
      const ffmpegPath = ff.ffmpegBin ?? 'ffmpeg'
      const ffprobePath = ff.ffprobeBin ?? null
      const media = db.getMedia(args.mediaId)
      if (!media) return { ok: false, error: 'Media not found' }
      if (media.type !== 'video') return { ok: false, error: 'Auto-reframe only applies to videos' }
      const out = await autoReframe(media.path, ffmpegPath, ffprobePath, args.mediaId, {
        aspectRatio: args.aspectRatio,
        reuseExisting: !args.force,
      })
      if (!out) return { ok: false, error: 'FFmpeg failed to produce reframed output' }
      return { ok: true, path: out }
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })

  // #137 — Co-watch similarity recommender. Single-user collab filter
  // approximation: items that the user reliably starts watching in the
  // same window as a seed item.
  ipcMain.handle('reco:moreLikeThis', async (_ev, args: { mediaId: string; limit?: number }) => {
    try {
      const { getCoWatchRecommender } = await import('./services/cowatch-recommender')
      return { ok: true, items: getCoWatchRecommender(db).recommendFor(args.mediaId, args.limit ?? 12) }
    } catch (err: any) {
      return { ok: false, items: [], error: err?.message ?? String(err) }
    }
  })

  ipcMain.handle('reco:todaysPicks', async (_ev, limit?: number) => {
    try {
      const { getCoWatchRecommender } = await import('./services/cowatch-recommender')
      return { ok: true, items: getCoWatchRecommender(db).todaysPicks(limit ?? 12) }
    } catch (err: any) {
      return { ok: false, items: [], error: err?.message ?? String(err) }
    }
  })

  // #138 — Tag-affinity / two-tower content recommender. Complements
  // #137: this one scores by tag overlap with the user's view-history
  // affinity vector instead of co-watch correlation.
  ipcMain.handle('reco:tagAffinity', async (_ev, args: { limit?: number; excludeMediaIds?: string[] }) => {
    try {
      const { getTagAffinityRecommender } = await import('./services/tag-affinity-recommender')
      return { ok: true, items: getTagAffinityRecommender(db).recommend(args.limit ?? 20, args.excludeMediaIds ?? []) }
    } catch (err: any) {
      return { ok: false, items: [], error: err?.message ?? String(err) }
    }
  })

  ipcMain.handle('reco:invalidate', async () => {
    try {
      const { getTagAffinityRecommender } = await import('./services/tag-affinity-recommender')
      getTagAffinityRecommender(db).invalidate()
      return { ok: true }
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })

  // #104 — Pool / set aggregation. Resolves an e621 or Danbooru pool
  // id to its full ordered post list so the lightbox can offer a
  // "Save entire pool (N items)" action.
  ipcMain.handle('booru:pool', async (_ev, args: { source: string; poolId: string | number }) => {
    try {
      const booru = await import('./services/ai-intelligence/booru-client')
      const res = await booru.fetchPool(args.source as any, args.poolId)
      return { ok: true, posts: res.posts, poolName: (res as any).poolName ?? null }
    } catch (err: any) {
      return { ok: false, posts: [], error: err?.message ?? String(err) }
    }
  })

  ipcMain.handle('media:ensureSpriteSheet', async (_ev, args: { mediaId: string; preset?: 'scrub' | 'hover' }) => {
    try {
      const { contactSheetPathFor, generateContactSheet } = await import('./services/ai-intelligence/contact-sheet')
      const preset = args.preset ?? 'scrub'
      const existing = contactSheetPathFor(args.mediaId, preset)
      if (existing) {
        return { ok: true, path: existing, alreadyExisted: true, cols: preset === 'scrub' ? 6 : 4, rows: preset === 'scrub' ? 6 : 1 }
      }
      const media = db.getMedia(args.mediaId)
      if (!media) return { ok: false, error: 'Media not found' }
      if (media.type !== 'video') return { ok: false, error: 'Sprite scrub only applies to videos' }
      const ff = await import('./ffpaths')
      const ffmpegPath = ff.ffmpegBin ?? 'ffmpeg'
      const out = await generateContactSheet(media.path, ffmpegPath, args.mediaId, {
        preset,
        durationSec: media.durationSec ?? null,
        dedupFrames: false, // we WANT evenly-spaced frames for scrubbing
      })
      if (!out) return { ok: false, error: 'Failed to generate sprite sheet' }
      return { ok: true, path: out, alreadyExisted: false, cols: preset === 'scrub' ? 6 : 4, rows: preset === 'scrub' ? 6 : 1 }
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })
}

