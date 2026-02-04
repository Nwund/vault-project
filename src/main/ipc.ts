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
import { analyzeVideo, isAnalyzerAvailable, type VideoAnalysis } from './services/ai/video-analyzer'
import { aiCleanupTags, aiGenerateTags, aiSuggestFilename, aiBatchRename, isOllamaAvailable } from './services/ai/ai-library-tools'

import {
  getSettings,
  updateSettings,
  getMediaDirs,
  setMediaDirs,
  getCacheDir,
  setCacheDir,
  updateLibrarySettings,
  updatePlaybackSettings,
  updateGoonwallSettings,
  updateDaylistSettings,
  updateQuickcutsSettings,
  updateAppearanceSettings,
  updatePrivacySettings,
  updateDataSettings,
  addMediaDir,
  removeMediaDir,
  setTheme,
  addPersonalityPack,
  removePersonalityPack,
  setActivePersonalityPack,
  resetSettings,
  getActivePersonality,
  getMotifs,
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
  GOON_THEMES,
  SESSION_MODES,
  ACHIEVEMENTS,
  GOON_VOCABULARY,
  DAYLIST_NAME_CONFIG,
  type VaultSettings,
  type PersonalityPack,
  type GoonStats,
  type SessionModeId
} from './settings'
import { toVaultUrl } from './vaultProtocol'
import { getAICacheService } from './services/ai-cache-service'
import { getLicenseService } from './services/license-service'
import { needsTranscode, probeNeedsTranscode, transcodeToMp4, getTranscodedPath, transcodeLowRes } from './services/transcode'
import { makeVideoThumb, makeImageThumb, probeVideoDurationSec } from './thumbs'

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
    const audioPath = path.join(app.getPath('userData'), 'audio', 'diabella')
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
        const targetDir = path.join(app.getPath('userData'), 'audio', 'diabella')
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

  ipcMain.handle('settings:daylist:update', async (_ev, patch: any) => {
    const next = updateDaylistSettings(patch)
    broadcast('settings:changed', next)
    return next
  })

  ipcMain.handle('settings:quickcuts:update', async (_ev, patch: any) => {
    const next = updateQuickcutsSettings(patch)
    broadcast('settings:changed', next)
    return next
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

  ipcMain.handle('settings:data:update', async (_ev, patch: any) => {
    const next = updateDataSettings(patch)
    broadcast('settings:changed', next)
    return next
  })

  ipcMain.handle('settings:setTheme', async (_ev, themeId: string) => {
    setTheme(themeId as any)
    const settings = getSettings()
    broadcast('settings:changed', settings)
    return settings
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // SETTINGS - Personality Packs
  // ═══════════════════════════════════════════════════════════════════════════
  ipcMain.handle('settings:personality:add', async (_ev, pack: PersonalityPack) => {
    addPersonalityPack(pack)
    return getSettings()
  })

  ipcMain.handle('settings:personality:remove', async (_ev, packId: string) => {
    removePersonalityPack(packId)
    return getSettings()
  })

  ipcMain.handle('settings:personality:setActive', async (_ev, packId: string) => {
    setActivePersonalityPack(packId)
    return getSettings()
  })

  ipcMain.handle('settings:personality:getActive', async () => {
    return getActivePersonality()
  })

  ipcMain.handle('settings:motifs:get', async () => {
    return getMotifs()
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
    const result = db.listMedia({ q, type, tag, limit, offset })
    return result.items
  })

  ipcMain.handle('media:list', async (_ev, opts: any) => {
    const q = opts?.q ?? opts?.query ?? ''
    const type = opts?.type ?? ''
    const tag = opts?.tags?.[0] ?? opts?.tag ?? ''
    const limit = opts?.limit ?? 200
    const offset = opts?.offset ?? 0
    return db.listMedia({ q, type, tag, limit, offset })
  })

  ipcMain.handle('media:getById', async (_ev, id: string) => {
    return db.getMedia(id)
  })

  ipcMain.handle('media:randomByTags', async (_ev, tags: string[], opts?: any) => {
    const limit = opts?.limit ?? 50
    let items: any[] = []
    if (tags.length === 0) {
      items = db.listMedia({ q: '', type: 'video', tag: '', limit: 500, offset: 0 }).items
    } else {
      for (const tag of tags) {
        const result = db.listMedia({ q: '', type: '', tag, limit: 200, offset: 0 })
        items.push(...result.items)
      }
      const seen = new Set<string>()
      items = items.filter((m) => {
        if (seen.has(m.id)) return false
        seen.add(m.id)
        return true
      })
    }
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

  ipcMain.handle('media:getStats', async (_ev, mediaId: string) => {
    return db.statsGet(mediaId)
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
      if (media.type === 'video' || media.type === 'gif') {
        const dur = media.durationSec ?? await probeVideoDurationSec(media.path)
        thumbPath = await makeVideoThumb({
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
    const mediaIds = items.map((i: any) => i.mediaId)
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
      const media = db.getMedia((item as any).mediaId ?? item.media?.id)
      if (media) {
        content += `#EXTINF:-1,${media.filename}\n`
        content += `${media.path}\n`
      }
    }

    fs.writeFileSync(result.filePath, content, 'utf8')
    return result.filePath
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
  // DAYLIST
  // ═══════════════════════════════════════════════════════════════════════════
  ipcMain.handle('daylist:getToday', async (_ev, opts?: any) => {
    const limit = opts?.limit ?? 50
    const intensity = opts?.intensity ?? 3
    return db.daylistGenerateToday(limit, intensity)
  })

  ipcMain.handle('daylist:generateToday', async (_ev, opts?: any) => {
    const limit = opts?.limit ?? 50
    const intensity = opts?.intensity ?? 3
    return db.daylistGenerateToday(limit, intensity)
  })

  ipcMain.handle('daylist:regenerate', async (_ev, opts?: any) => {
    const limit = opts?.limit ?? 50
    const intensity = opts?.intensity ?? 3
    return db.daylistGenerateToday(limit, intensity)
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
  // AI (Diabella) - Full Provider Support
  // ═══════════════════════════════════════════════════════════════════════════
  ipcMain.handle('ai:chat', async (_ev, payload: any) => {
    const settings = getSettings()
    const provider = settings.diabella.provider

    if (provider === 'none' || !settings.diabella.enabled) {
      return {
        response: "I'm not connected right now. Configure AI in Settings.",
        error: null
      }
    }

    checkAchievements()

    if (provider === 'ollama') {
      return handleOllamaChat(settings, payload)
    }

    if (provider === 'venice') {
      return handleVeniceChat(settings, payload, db)
    }

    return {
      response: "Unknown provider. Configure AI in Settings.",
      error: 'unknown_provider'
    }
  })

  ipcMain.handle('ai:summarize', async (_ev, payload: any) => {
    return {
      summary: '',
      error: 'AI summarization not yet implemented'
    }
  })

  ipcMain.handle('ai:getVoiceLine', async (_ev, category: string) => {
    const personality = getActivePersonality()
    const spiciness = getSettings().diabella.spiciness / 5

    const lines = personality.voiceLines[category as keyof typeof personality.voiceLines] || []
    const eligible = lines.filter(l => l.minSpiceLevel <= spiciness)

    if (eligible.length === 0) return null

    const totalWeight = eligible.reduce((sum, l) => sum + l.weight, 0)
    let random = Math.random() * totalWeight

    for (const line of eligible) {
      random -= line.weight
      if (random <= 0) return line.text
    }

    return eligible[eligible.length - 1].text
  })

  ipcMain.handle('ai:ping', async () => {
    const settings = getSettings()
    const provider = settings.diabella.provider

    if (provider === 'ollama') {
      try {
        const res = await fetch(`${settings.diabella.ollama.url}/api/version`, {
          method: 'GET',
          signal: AbortSignal.timeout(3000)
        })
        return { ok: res.ok, provider: 'ollama' }
      } catch (e: any) {
        return { ok: false, provider: 'ollama', error: e.message }
      }
    }

    if (provider === 'venice') {
      if (!settings.diabella.venice.apiKey) {
        return { ok: false, provider: 'venice', error: 'No API key configured' }
      }
      return { ok: true, provider: 'venice' }
    }

    return { ok: false, provider: 'none', error: 'No provider configured' }
  })

  // Text-to-Speech
  ipcMain.handle('ai:speak', async (_ev, text: string) => {
    const settings = getSettings()
    return handleVeniceTTS(settings, text)
  })

  // Image Generation
  ipcMain.handle('ai:generateImage', async (_ev, prompt: string, options?: { nsfw?: boolean }) => {
    const settings = getSettings()
    return handleVeniceImageGen(settings, prompt, options)
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
    const tagCount = db.listTags().length
    const playlistCount = db.playlistList().length

    return {
      totalMedia,
      videoCount,
      imageCount,
      tagCount,
      playlistCount,
      mediaDirs: getMediaDirs().length,
      cacheDir: getCacheDir()
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
  // RECOMMENDATIONS
  // ═══════════════════════════════════════════════════════════════════════════
  ipcMain.handle('recommend:forMedia', async (_ev, mediaId: string, limit?: number) => {
    return db.recommendForMedia(mediaId, limit ?? 20)
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
  // GOON STATS - Session tracking & achievements
  // ═══════════════════════════════════════════════════════════════════════════
  ipcMain.handle('goon:getStats', async () => {
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
    return getGoonTheme(themeId as any)
  })

  ipcMain.handle('vocabulary:get', async () => {
    return GOON_VOCABULARY
  })

  ipcMain.handle('daylist:getNameConfig', async () => {
    return DAYLIST_NAME_CONFIG
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // AUDIO - Sound Pack Organization & Voice Lines
  // ═══════════════════════════════════════════════════════════════════════════
  ipcMain.handle('audio:organizeSoundPack', async (_ev, sourceDir: string) => {
    try {
      const targetDir = path.join(app.getPath('userData'), 'audio', 'diabella')
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

      const settings = getSettings()
      const options = {
        spiceLevel: settings.diabella.spiciness,
        personality: (settings.diabella as any).activePersonalityPack ?? settings.diabella.activePackId
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

      const settings = getSettings()
      const options = {
        spiceLevel: settings.diabella.spiciness,
        personality: (settings.diabella as any).activePersonalityPack ?? settings.diabella.activePackId
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
    // Return vault:// protocol URL for the sound file
    return `vault://${encodeURIComponent(filePath)}`
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
    return getLicenseService().hasFeature(feature as any)
  })

  ipcMain.handle('license:getLimit', async (_ev, feature: string) => {
    return getLicenseService().getLimit(feature as any)
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

  // Auto-organize NSFW Soundpack on startup
  void autoOrganizeSoundpack()
}

// ═══════════════════════════════════════════════════════════════════════════
// AI PROVIDER HELPERS
// ═══════════════════════════════════════════════════════════════════════════

async function handleOllamaChat(settings: VaultSettings, payload: any) {
  const { ollama, spiciness } = settings.diabella
  const personality = getActivePersonality()

  const systemPrompt = personality.systemPrompt +
    `\n\nCurrent spice level: ${spiciness}/5. Adjust your flirtiness accordingly.`

  try {
    const messages = [
      { role: 'system', content: systemPrompt },
      ...(payload.messages || [])
    ]

    const res = await fetch(`${ollama.url}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: ollama.model,
        stream: false,
        messages
      }),
      signal: AbortSignal.timeout(30000)
    })

    if (!res.ok) {
      return { response: null, error: `Ollama error: ${res.status}` }
    }

    const data = await res.json()
    return {
      response: data.message?.content || 'No response',
      error: null
    }
  } catch (e: any) {
    return {
      response: null,
      error: e.message || 'Failed to connect to Ollama'
    }
  }
}

// Spice level to temperature mapping
const SPICE_TEMPERATURE: Record<number, number> = {
  1: 0.7,   // Mild - more predictable
  2: 0.85,
  3: 1.0,   // Medium - balanced
  4: 1.15,
  5: 1.3    // Extreme - very creative/explicit
}

// Spice level instructions
const SPICE_INSTRUCTIONS: Record<number, string> = {
  1: "Keep responses flirty but tasteful. Suggestive without being explicit.",
  2: "More openly flirtatious. Can use mild innuendo and suggestive language.",
  3: "Openly sexual tone. Can describe content and desires with moderate explicitness.",
  4: "Very explicit and direct. Enthusiastically discusses sexual content. Uses adult language freely.",
  5: "Completely uninhibited. Maximum explicitness. Dirty talk encouraged. No limits on sexual expression."
}

async function handleVeniceChat(settings: VaultSettings, payload: any, db: DB) {
  const { venice, spiciness } = settings.diabella
  const personality = getActivePersonality()
  const cache = getAICacheService()

  if (!venice.apiKey) {
    return { response: null, error: 'Venice API key not configured' }
  }

  // Get video recommendations from the library for context
  let videoContext = ''
  try {
    const videos = db.listMedia({ q: '', type: 'video', tag: '', limit: 10, offset: 0 })
    if (videos.items.length > 0) {
      const videoNames = videos.items.slice(0, 5).map(v => v.filename).join(', ')
      videoContext = `

AVAILABLE VIDEOS IN LIBRARY (suggest these when asked for recommendations):
${videoNames}

When the user asks for recommendations, suggestions, or what to watch, recommend videos from this library with enthusiasm. Be specific about the video names. Get excited about sharing them!`
    }
  } catch {
    // Continue without video context if db access fails
  }

  // Build enhanced system prompt
  const spiceInstruction = SPICE_INSTRUCTIONS[spiciness] || SPICE_INSTRUCTIONS[3]
  const systemPrompt = `${personality.systemPrompt}

CURRENT SPICE LEVEL: ${spiciness}/5
${spiceInstruction}
${videoContext}
Stay in character. Be helpful, flirty, and fun.`

  // Adjust temperature based on spice level
  const temperature = SPICE_TEMPERATURE[spiciness] || venice.temperature

  // Create cache key from user messages (excluding system prompt)
  const userMessages = payload.messages || []
  const cacheKey = cache.createChatKey(userMessages, spiciness)

  // Check cache first
  const cached = cache.get<{ response: string }>('chat', cacheKey)
  if (cached) {
    console.log('[AI] Cache hit for chat response')
    return { response: cached.response, error: null, cached: true }
  }

  try {
    const messages = [
      { role: 'system', content: systemPrompt },
      ...userMessages
    ]

    const res = await fetch('https://api.venice.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${venice.apiKey}`
      },
      body: JSON.stringify({
        model: venice.model,
        messages,
        temperature,
        max_tokens: venice.maxTokens,
        top_p: 0.95,
        venice_parameters: {
          include_venice_system_prompt: venice.includeVeniceSystemPrompt ?? false
        }
      }),
      signal: AbortSignal.timeout(30000)
    })

    if (!res.ok) {
      const errorText = await res.text()
      return { response: null, error: `Venice error: ${res.status} - ${errorText}` }
    }

    const data = await res.json()
    const response = data.choices?.[0]?.message?.content || null

    // Cache successful response
    if (response) {
      cache.set('chat', cacheKey, { response })
    }

    return { response, error: null, cached: false }

  } catch (e: any) {
    return {
      response: null,
      error: e.message || 'Failed to connect to Venice AI'
    }
  }
}

// Venice Text-to-Speech (with caching)
async function handleVeniceTTS(settings: VaultSettings, text: string): Promise<{ audio: string | null; error: string | null; cached?: boolean }> {
  const { venice, tts } = settings.diabella
  const cache = getAICacheService()

  if (!venice.apiKey) {
    return { audio: null, error: 'Venice API key not configured' }
  }

  if (!tts?.enabled) {
    return { audio: null, error: 'TTS is disabled' }
  }

  // Create cache key
  const voiceId = tts.voiceId || 'af_sky'
  const cacheKey = cache.createTTSKey(text, voiceId)

  // Check cache first (TTS is very expensive)
  const cached = cache.get<{ audio: string }>('tts', cacheKey)
  if (cached) {
    console.log('[AI] Cache hit for TTS response')
    return { audio: cached.audio, error: null, cached: true }
  }

  try {
    const res = await fetch('https://api.venice.ai/api/v1/audio/speech', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${venice.apiKey}`
      },
      body: JSON.stringify({
        input: text,
        model: 'tts-kokoro',
        voice: voiceId,
        response_format: tts.format || 'mp3',
        speed: tts.speed || 1.0,
        streaming: false
      }),
      signal: AbortSignal.timeout(30000)
    })

    if (!res.ok) {
      const errorText = await res.text()
      return { audio: null, error: `TTS error: ${res.status} - ${errorText}` }
    }

    const buffer = await res.arrayBuffer()
    const base64 = Buffer.from(buffer).toString('base64')

    // Cache the audio (TTS is expensive, cache for 30 days)
    cache.set('tts', cacheKey, { audio: base64 })
    console.log('[AI] Cached TTS response')

    return { audio: base64, error: null, cached: false }
  } catch (e: any) {
    return { audio: null, error: e.message || 'TTS failed' }
  }
}

// Venice Image Generation (with caching)
async function handleVeniceImageGen(
  settings: VaultSettings,
  prompt: string,
  options?: { nsfw?: boolean; skipCache?: boolean }
): Promise<{ image: string | null; error: string | null; cached?: boolean }> {
  const { venice, imageGen, spiciness } = settings.diabella
  const cache = getAICacheService()

  if (!venice.apiKey) {
    return { image: null, error: 'Venice API key not configured' }
  }

  if (!imageGen?.enabled) {
    return { image: null, error: 'Image generation is disabled' }
  }

  const useNsfw = (options?.nsfw ?? imageGen.nsfwEnabled) && spiciness >= 4

  // Create cache key
  const cacheKey = cache.createImageKey(prompt, { nsfw: useNsfw, style: imageGen.model })

  // Check cache first (unless explicitly skipped)
  if (!options?.skipCache) {
    const cached = cache.get<{ image: string }>('image', cacheKey)
    if (cached) {
      console.log('[AI] Cache hit for image')
      return { image: cached.image, error: null, cached: true }
    }
  }

  try {
    const res = await fetch('https://api.venice.ai/api/v1/images/generations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${venice.apiKey}`
      },
      body: JSON.stringify({
        prompt,
        model: useNsfw ? 'flux-dev-uncensored' : (imageGen.model || 'fluently-xl'),
        n: 1,
        size: imageGen.size || '1024x1024',
        quality: imageGen.quality || 'hd',
        style: 'vivid',
        response_format: 'b64_json',
        moderation: useNsfw ? 'none' : 'auto'
      }),
      signal: AbortSignal.timeout(60000)
    })

    if (!res.ok) {
      const errorText = await res.text()
      return { image: null, error: `Image gen error: ${res.status} - ${errorText}` }
    }

    const data = await res.json()
    const image = data.data?.[0]?.b64_json || null

    // Cache successful generation (images are expensive)
    if (image) {
      cache.set('image', cacheKey, { image })
      console.log('[AI] Cached generated image')
    }

    return { image, error: null, cached: false }
  } catch (e: any) {
    return { image: null, error: e.message || 'Image generation failed' }
  }
}
