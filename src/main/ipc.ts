// ===============================
// File: src/main/ipc.ts
// IPC handlers for main process
// ===============================
import { IpcMain, dialog, shell, BrowserWindow, app } from 'electron'
import fs from 'node:fs'
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

// Auto-detect and organize NSFW Soundpack folder
async function autoOrganizeSoundpack(): Promise<void> {
  const commonPaths = [
    path.join(process.cwd(), 'NSFW Soundpack'),
    path.join(app.getPath('userData'), 'NSFW Soundpack'),
    path.join(app.getPath('documents'), 'NSFW Soundpack'),
    path.join(app.getPath('home'), 'Downloads', 'NSFW Soundpack')
  ]

  for (const sourcePath of commonPaths) {
    if (fs.existsSync(sourcePath)) {
      console.log('[Audio] Found NSFW Soundpack at:', sourcePath)
      try {
        const targetDir = path.join(app.getPath('userData'), 'audio', 'voice')
        const organizer = new SoundOrganizer(sourcePath, targetDir)
        const files = await organizer.organize()
        const manifest = organizer.generateManifest(files)
        organizer.saveManifest(manifest)
        console.log(`[Audio] Organized ${files.length} sound files`)

        // Reload voice line service
        const vls = getVoiceLineService()
        await vls.reload()
      } catch (e) {
        console.error('[Audio] Failed to organize sound pack:', e)
      }
      break
    }
  }
}

function getNSFWTagger(): NSFWTagger {
  if (!nsfwTagger) {
    nsfwTagger = new NSFWTagger()
  }
  return nsfwTagger
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
    return db.captionUpsert(mediaId, topText, bottomText, presetId, customStyle)
  })

  ipcMain.handle('captions:delete', async (_ev, mediaId: string) => {
    db.captionDelete(mediaId)
    return true
  })

  ipcMain.handle('captions:listCaptioned', async () => {
    return db.captionListCaptioned()
  })

  ipcMain.handle('captions:templates:list', async () => {
    return db.captionTemplateList()
  })

  ipcMain.handle('captions:templates:add', async (_ev, topText: string | null, bottomText: string | null, category?: string) => {
    return db.captionTemplateAdd(topText, bottomText, category)
  })

  ipcMain.handle('captions:templates:delete', async (_ev, id: string) => {
    db.captionTemplateDelete(id)
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
      console.error('[Captions] Export failed:', err)
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
    const result = db.listMedia({ q, type, tag, limit, offset, sortBy })
    return applyBlacklist(result.items)
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
        console.error(`[Import] Failed to import ${filePath}:`, err)
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
    return result
  })

  // Bulk set rating for multiple media items
  ipcMain.handle('media:bulkSetRating', async (_ev, mediaIds: string[], rating: number) => {
    let updated = 0
    for (const mediaId of mediaIds) {
      try {
        db.statsSetRating(mediaId, rating)
        updated++
      } catch (err) {
        console.error(`[Media] Failed to set rating for ${mediaId}:`, err)
      }
    }
    if (updated > 0) {
      recordRatingGiven()
      checkAchievements()
    }
    return { updated, total: mediaIds.length }
  })

  ipcMain.handle('media:incO', async (_ev, mediaId: string) => {
    return db.statsIncO(mediaId)
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
      console.error('[Media] Failed to move broken file:', err)
      return { success: false, error: err.message }
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
      }
      return thumbPath
    } catch (err: any) {
      console.error('[IPC] generateThumb failed:', mediaId, err?.message)
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

  // Delete media from library (soft delete - file stays on disk)
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

      // Delete from database (file stays on disk)
      db.deleteMediaById(mediaId)
      broadcast('vault:changed')

      return { success: true, deletedMedia: { id: mediaId, path: media.path, filename: media.filename } }
    } catch (err: any) {
      console.error('[IPC] media:delete error:', err?.message)
      return { success: false, error: err?.message }
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
    db.addTagToMedia(mediaId, tagName)
    recordTagAssigned()  // Track for achievements
    checkAchievements()  // Check 'tagged' achievement
    broadcast('vault:changed')
    return db.listMediaTags(mediaId)
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

  // ═══════════════════════════════════════════════════════════════════════════
  // PMV EDITOR - Music video compilation tools
  // ═══════════════════════════════════════════════════════════════════════════

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
      console.error('[PMV Export] Error:', err?.message)
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
  // AI - Deprecated Diabella handlers (return disabled status)
  // ═══════════════════════════════════════════════════════════════════════════
  ipcMain.handle('ai:chat', async () => {
    return {
      response: "AI chat is not available. Diabella was removed in v2.1.5.",
      error: 'disabled'
    }
  })

  ipcMain.handle('ai:summarize', async () => {
    return { summary: '', error: 'AI features disabled' }
  })

  ipcMain.handle('ai:getVoiceLine', async () => {
    return null // Voice lines disabled
  })

  ipcMain.handle('ai:ping', async () => {
    return { ok: false, provider: 'none', error: 'AI disabled in v2.1.5' }
  })

  ipcMain.handle('ai:speak', async () => {
    return { audio: null, error: 'TTS disabled - will be replaced with local TTS' }
  })

  ipcMain.handle('ai:generateImage', async () => {
    return { image: null, error: 'Image generation disabled' }
  })

  ipcMain.handle('ai:generateAvatar', async () => {
    return { success: false, error: 'Feature removed' }
  })

  ipcMain.handle('ai:clearAvatarCache', async () => {
    return { success: true }
  })

  ipcMain.handle('ai:getAvatarOptions', async () => {
    return { styles: [], outfits: [], expressions: [] }
  })

  // Get available TTS voices
  ipcMain.handle('ai:getVoices', async () => {
    return [
      { id: 'af_sky', name: 'Sky', description: 'Soft, breathy, intimate' },
      { id: 'af_bella', name: 'Bella', description: 'Confident, warm, alluring' },
      { id: 'af_sarah', name: 'Sarah', description: 'Mature, commanding' },
      { id: 'af_nicole', name: 'Nicole', description: 'Sultry, mysterious' }
    ]
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
    let topTags: Array<{ name: string; count: number }> = []
    let recentlyAdded = 0
    let avgRating = 0
    let favoritesCount = 0
    try {
      const sizeRow = db.raw.prepare('SELECT COALESCE(SUM(size), 0) as total FROM media').get() as { total: number }
      totalSizeBytes = sizeRow?.total ?? 0

      const durationRow = db.raw.prepare('SELECT COALESCE(SUM(durationSec), 0) as total FROM media WHERE type = ?').get('video') as { total: number }
      totalDurationSec = durationRow?.total ?? 0

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
      mediaDirs: getMediaDirs().length,
      cacheDir: getCacheDir(),
      topTags,
      recentlyAdded,
      avgRating,
      favoritesCount
    }
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
        SELECT DISTINCT media_id FROM watch_history
      `).all().map((r: any) => r.media_id)

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
        SELECT media_id as id, COUNT(*) as recentViews
        FROM watch_history
        WHERE last_watched > ?
        GROUP BY media_id
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
      dlna.setQueue(items)
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
      dlna.addToQueue(item)
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
    return service.setActivePreset(id)
  })

  ipcMain.handle('viewPresets:create', async (_ev, preset: any) => {
    const service = getViewPresetsService(db)
    return service.createPreset(preset)
  })

  ipcMain.handle('viewPresets:update', async (_ev, id: string, updates: any) => {
    const service = getViewPresetsService(db)
    return service.updatePreset(id, updates)
  })

  ipcMain.handle('viewPresets:delete', async (_ev, id: string) => {
    const service = getViewPresetsService(db)
    return service.deletePreset(id)
  })

  ipcMain.handle('viewPresets:duplicate', async (_ev, id: string, newName?: string) => {
    const service = getViewPresetsService(db)
    return service.duplicatePreset(id, newName)
  })

  ipcMain.handle('viewPresets:saveCurrent', async (_ev, name: string, sort: any, filters: ViewFilters, view: ViewConfig) => {
    const service = getViewPresetsService(db)
    return service.saveCurrentAsPreset(name, sort, filters, view)
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
    return service.addBookmark(mediaId, timestamp, title, options)
  })

  ipcMain.handle('bookmarks:quickAdd', async (_ev, mediaId: string, timestamp: number) => {
    const service = getVideoBookmarksService(db)
    return service.quickBookmark(mediaId, timestamp)
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
    return service.updateBookmark(bookmarkId, updates)
  })

  ipcMain.handle('bookmarks:delete', async (_ev, bookmarkId: string) => {
    const service = getVideoBookmarksService(db)
    return service.deleteBookmark(bookmarkId)
  })

  ipcMain.handle('bookmarks:deleteAllForMedia', async (_ev, mediaId: string) => {
    const service = getVideoBookmarksService(db)
    return service.deleteAllForMedia(mediaId)
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
    return service.createCategory(name, options)
  })

  ipcMain.handle('tagCategories:update', async (_ev, categoryId: string, updates: Partial<Pick<TagCategory, 'name' | 'description' | 'color' | 'icon' | 'parentId' | 'sortOrder'>>) => {
    const service = getTagCategoriesService(db)
    return service.updateCategory(categoryId, updates)
  })

  ipcMain.handle('tagCategories:delete', async (_ev, categoryId: string) => {
    const service = getTagCategoriesService(db)
    return service.deleteCategory(categoryId)
  })

  ipcMain.handle('tagCategories:assignTag', async (_ev, tagId: string, categoryId: string | null) => {
    const service = getTagCategoriesService(db)
    return service.assignTagToCategory(tagId, categoryId)
  })

  ipcMain.handle('tagCategories:bulkAssignTags', async (_ev, tagIds: string[], categoryId: string | null) => {
    const service = getTagCategoriesService(db)
    return service.bulkAssignTags(tagIds, categoryId)
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
    return service.autoCategorize()
  })

  ipcMain.handle('tagCategories:getStats', async () => {
    const service = getTagCategoriesService(db)
    return service.getStats()
  })

  ipcMain.handle('tagCategories:reorder', async (_ev, orderedIds: string[]) => {
    const service = getTagCategoriesService(db)
    service.reorderCategories(orderedIds)
    return { success: true }
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // MEDIA RELATIONSHIPS
  // ═══════════════════════════════════════════════════════════════════════════

  ipcMain.handle('relationships:create', async (_ev, sourceId: string, targetId: string, type: RelationshipType, options?: { bidirectional?: boolean; note?: string }) => {
    const service = getMediaRelationshipsService(db)
    return service.createRelationship(sourceId, targetId, type, options)
  })

  ipcMain.handle('relationships:linkAsSequel', async (_ev, earlierId: string, laterId: string, note?: string) => {
    const service = getMediaRelationshipsService(db)
    return service.linkAsSequel(earlierId, laterId, note)
  })

  ipcMain.handle('relationships:linkAsRelated', async (_ev, id1: string, id2: string, note?: string) => {
    const service = getMediaRelationshipsService(db)
    return service.linkAsRelated(id1, id2, note)
  })

  ipcMain.handle('relationships:linkAsAlternate', async (_ev, id1: string, id2: string, note?: string) => {
    const service = getMediaRelationshipsService(db)
    return service.linkAsAlternate(id1, id2, note)
  })

  ipcMain.handle('relationships:linkAsSeries', async (_ev, mediaIds: string[], seriesNote?: string) => {
    const service = getMediaRelationshipsService(db)
    return service.linkAsSeries(mediaIds, seriesNote)
  })

  ipcMain.handle('relationships:markAsDuplicates', async (_ev, id1: string, id2: string, note?: string) => {
    const service = getMediaRelationshipsService(db)
    return service.markAsDuplicates(id1, id2, note)
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
    return service.updateRelationship(relationshipId, updates)
  })

  ipcMain.handle('relationships:delete', async (_ev, relationshipId: string) => {
    const service = getMediaRelationshipsService(db)
    return service.deleteRelationship(relationshipId)
  })

  ipcMain.handle('relationships:deleteAllForMedia', async (_ev, mediaId: string) => {
    const service = getMediaRelationshipsService(db)
    return service.deleteAllForMedia(mediaId)
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
    return service.addNote(mediaId, content, options)
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
    return service.updateNote(noteId, updates)
  })

  ipcMain.handle('notes:delete', async (_ev, noteId: string) => {
    const service = getMediaNotesService(db)
    return service.deleteNote(noteId)
  })

  ipcMain.handle('notes:deleteAllForMedia', async (_ev, mediaId: string) => {
    const service = getMediaNotesService(db)
    return service.deleteAllForMedia(mediaId)
  })

  ipcMain.handle('notes:togglePin', async (_ev, noteId: string) => {
    const service = getMediaNotesService(db)
    return service.togglePin(noteId)
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
    return service.createFilter(name, conditions, options)
  })

  ipcMain.handle('customFilters:update', async (_ev, filterId: string, updates: any) => {
    const service = getCustomFiltersService(db)
    return service.updateFilter(filterId, updates)
  })

  ipcMain.handle('customFilters:delete', async (_ev, filterId: string) => {
    const service = getCustomFiltersService(db)
    return service.deleteFilter(filterId)
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
    return service.toggleQuickAccess(filterId)
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
}

