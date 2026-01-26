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
import { diabella, initDiabellaService } from './services/diabella'
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
  updateDiabellaSettings,
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
  recordDiabellaConversation,
  recordDiabellaTime,
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
    checkAndUnlockAchievements()
    return true
  })

  ipcMain.handle('goonwall:recordTime', async (_ev, minutes: number) => {
    recordGoonWallTime(minutes)
    checkAndUnlockAchievements()
    return true
  })

  ipcMain.handle('goonwall:shuffle', async () => {
    recordGoonWallShuffle()
    checkAndUnlockAchievements()
    return true
  })

  ipcMain.handle('settings:daylist:update', async (_ev, patch: any) => {
    const next = updateDaylistSettings(patch)
    broadcast('settings:changed', next)
    return next
  })

  ipcMain.handle('settings:diabella:update', async (_ev, patch: any) => {
    const next = updateDiabellaSettings(patch)
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
    const limit = opts?.limit ?? 200
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
    checkAndUnlockAchievements()  // Check 'rated' achievement
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

  // ═══════════════════════════════════════════════════════════════════════════
  // TAGS
  // ═══════════════════════════════════════════════════════════════════════════
  ipcMain.handle('tags:list', async () => {
    return db.listTags()
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
    checkAndUnlockAchievements()  // Check 'tagged' achievement
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
    checkAndUnlockAchievements()  // Check 'organized' achievement
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
      const media = db.getMedia(item.mediaId)
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
    return db.daylistGenerateToday(limit)
  })

  ipcMain.handle('daylist:generateToday', async (_ev, opts?: any) => {
    const limit = opts?.limit ?? 50
    return db.daylistGenerateToday(limit)
  })

  ipcMain.handle('daylist:regenerate', async (_ev, opts?: any) => {
    const limit = opts?.limit ?? 50
    return db.daylistGenerateToday(limit)
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
    return true
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

    // Track Diabella conversation for achievements
    recordDiabellaConversation()
    checkAndUnlockAchievements()

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

  // Generate Diabella Avatar using dedicated service
  ipcMain.handle('ai:generateAvatar', async (_ev, options?: {
    style?: string
    outfit?: string
    expression?: string
    pose?: string
    arousalLevel?: number
    regenerate?: boolean
  }) => {
    try {
      const service = diabella.avatar
      const result = await service.generate({
        style: (options?.style || 'anime') as any,
        outfit: options?.outfit || 'elegant-dress',
        expression: options?.expression || 'flirty',
        pose: options?.pose || 'standing',
        arousalLevel: options?.arousalLevel || 1,
        regenerate: options?.regenerate || false
      })

      if (result.success && result.path) {
        return { success: true, path: result.path }
      } else {
        return { success: false, error: result.error || 'Failed to generate avatar' }
      }
    } catch (error: any) {
      console.error('[IPC] Avatar generation failed:', error)
      return { success: false, error: error.message || 'Unknown error' }
    }
  })

  // Clear Diabella avatar cache
  ipcMain.handle('ai:clearAvatarCache', async () => {
    try {
      diabella.avatar.clearCache()
      return { success: true }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  // Get avatar customization options
  ipcMain.handle('ai:getAvatarOptions', async () => {
    const service = diabella.avatar
    return {
      styles: service.getStyleOptions(),
      outfits: service.getOutfitOptions(),
      expressions: service.getExpressionOptions(),
    }
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // DIABELLA - Chat Service
  // ═══════════════════════════════════════════════════════════════════════════
  ipcMain.handle('diabella:chat', async (_ev, message: string, context?: any) => {
    try {
      const result = await diabella.chat.chat(message, context)
      return { success: true, ...result }
    } catch (error: any) {
      console.error('[IPC] Diabella chat error:', error)
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('diabella:greeting', async () => {
    try {
      const result = await diabella.chat.getGreeting()
      return { success: true, ...result }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('diabella:resetChat', async () => {
    try {
      diabella.chat.reset()
      return { success: true }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('diabella:getVideoReaction', async (_ev, tags: string[]) => {
    try {
      const reaction = diabella.chat.getVideoReaction(tags)
      return { success: true, message: reaction }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('diabella:getMemory', async () => {
    return diabella.chat.getMemory()
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // DIABELLA - Voice Service
  // ═══════════════════════════════════════════════════════════════════════════
  ipcMain.handle('diabella:speak', async (_ev, text: string) => {
    try {
      const result = await diabella.voice.speak(text)
      return result
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('diabella:setVoicePreset', async (_ev, preset: string) => {
    diabella.voice.setPreset(preset)
    return { success: true, preset }
  })

  ipcMain.handle('diabella:getVoicePresets', async () => {
    return diabella.voice.getPresets()
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // DIABELLA - Sound Service
  // ═══════════════════════════════════════════════════════════════════════════
  ipcMain.handle('diabella:getSound', async (_ev, event: string) => {
    try {
      const soundPath = diabella.sounds.getSoundForEvent(event)
      return { success: true, path: soundPath }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('diabella:getSoundStats', async () => {
    return diabella.sounds.getStats()
  })

  ipcMain.handle('diabella:rescanSounds', async () => {
    diabella.sounds.scanSounds()
    return { success: true, stats: diabella.sounds.getStats() }
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // DIABELLA - Settings
  // ═══════════════════════════════════════════════════════════════════════════
  ipcMain.handle('diabella:getServiceSettings', async () => {
    return diabella.instance.getSettings()
  })

  ipcMain.handle('diabella:updateServiceSettings', async (_ev, updates: any) => {
    return diabella.instance.updateSettings(updates)
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
  ipcMain.handle('vault:rescan', async () => {
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

  // Diabella video recommendations - returns random/popular videos for AI to suggest
  ipcMain.handle('recommend:forDiabella', async (_ev, limit?: number) => {
    const n = limit ?? 5
    // Get a mix of popular and random videos
    const videos = db.listMedia({ q: '', type: 'video', tag: '', limit: 50, offset: 0 })
    if (!videos.items.length) return []

    // Shuffle and return random selection
    const shuffled = videos.items.sort(() => Math.random() - 0.5)
    return shuffled.slice(0, n).map(v => ({
      id: v.id,
      filename: v.filename,
      path: v.path,
      durationSec: v.durationSec
    }))
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
    const newAchievements = checkAndUnlockAchievements()
    broadcast('goon:statsChanged', stats)
    if (newAchievements.length > 0) {
      broadcast('goon:achievementUnlocked', newAchievements)
    }
    return { stats, newAchievements }
  })

  ipcMain.handle('goon:recordOrgasm', async (_ev, ruined?: boolean) => {
    const stats = recordOrgasm(ruined ?? false)
    const newAchievements = checkAndUnlockAchievements()
    broadcast('goon:statsChanged', stats)
    if (newAchievements.length > 0) {
      broadcast('goon:achievementUnlocked', newAchievements)
    }
    return { stats, newAchievements }
  })

  ipcMain.handle('goon:startSession', async () => {
    const stats = startSession()
    const newAchievements = checkAndUnlockAchievements()
    broadcast('goon:statsChanged', stats)
    broadcast('goon:sessionStarted', stats)
    return { stats, newAchievements }
  })

  ipcMain.handle('goon:endSession', async (_ev, durationMinutes: number) => {
    const stats = endSession(durationMinutes)
    const newAchievements = checkAndUnlockAchievements()
    broadcast('goon:statsChanged', stats)
    broadcast('goon:sessionEnded', stats)
    return { stats, newAchievements }
  })

  ipcMain.handle('goon:getAchievements', async () => {
    return ACHIEVEMENTS
  })

  ipcMain.handle('goon:checkAchievements', async () => {
    const newAchievements = checkAndUnlockAchievements()
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
        personality: settings.diabella.activePersonalityPack
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
        personality: settings.diabella.activePersonalityPack
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
