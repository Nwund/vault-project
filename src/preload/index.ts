// ===============================
// File: src/preload/index.ts
// Secure bridge between renderer and main process
// ===============================
import { contextBridge, ipcRenderer, shell } from 'electron'

/**
 * Safe invoke wrapper - keeps renderer stable even if handlers temporarily missing.
 */
function invoke<T = unknown>(channel: string, ...args: any[]): Promise<T> {
  return ipcRenderer.invoke(channel, ...args) as Promise<T>
}

/**
 * Subscribe to IPC events from main process.
 */
function on<T = unknown>(channel: string, cb: (payload: T) => void) {
  const listener = (_ev: Electron.IpcRendererEvent, payload: T) => cb(payload)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

// ─────────────────────────────────────────────────────────────────────────────
// API exposed to renderer via window.api
// ─────────────────────────────────────────────────────────────────────────────

const api = {
  // ═══════════════════════════════════════════════════════════════════════════
  // SETTINGS - General
  // ═══════════════════════════════════════════════════════════════════════════
  settings: {
    get: () => invoke('settings:get'),
    patch: (patch: any) => invoke('settings:patch', patch),
    update: (patch: any) => invoke('settings:update', patch),
    reset: () => invoke('settings:reset'),

    // Category-specific updates
    library: {
      update: (patch: any) => invoke('settings:library:update', patch),
    },
    playback: {
      update: (patch: any) => invoke('settings:playback:update', patch),
    },
    goonwall: {
      update: (patch: any) => invoke('settings:goonwall:update', patch),
    },
    daylist: {
      update: (patch: any) => invoke('settings:daylist:update', patch),
    },
    diabella: {
      update: (patch: any) => invoke('settings:diabella:update', patch),
    },
    quickcuts: {
      update: (patch: any) => invoke('settings:quickcuts:update', patch),
    },
    appearance: {
      update: (patch: any) => invoke('settings:appearance:update', patch),
    },
    privacy: {
      update: (patch: any) => invoke('settings:privacy:update', patch),
    },
    data: {
      update: (patch: any) => invoke('settings:data:update', patch),
    },

    // Theme
    setTheme: (themeId: string) => invoke('settings:setTheme', themeId),

    // Personality packs
    personality: {
      add: (pack: any) => invoke('settings:personality:add', pack),
      remove: (packId: string) => invoke('settings:personality:remove', packId),
      setActive: (packId: string) => invoke('settings:personality:setActive', packId),
      getActive: () => invoke('settings:personality:getActive'),
    },

    // Motifs dictionary
    motifs: {
      get: () => invoke('settings:motifs:get'),
    },

    // Folder pickers for settings page
    chooseMediaDir: () => invoke('settings:chooseMediaDir'),
    removeMediaDir: (dir: string) => invoke('settings:removeMediaDir', dir),
    chooseCacheDir: () => invoke('settings:chooseCacheDir'),
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // MEDIA
  // ═══════════════════════════════════════════════════════════════════════════
  media: {
    search: (opts: any) => invoke('media:search', opts),
    list: (opts?: any) => invoke('media:list', opts),
    getById: (id: string) => invoke('media:getById', id),
    randomByTags: (tags: string[], opts?: any) => invoke('media:randomByTags', tags, opts),
    rescan: () => invoke('media:rescan'),
    count: (opts?: any) => invoke('media:count', opts),
    // Stats
    getStats: (mediaId: string) => invoke('media:getStats', mediaId),
    recordView: (mediaId: string) => invoke('media:recordView', mediaId),
    setRating: (mediaId: string, rating: number) => invoke('media:setRating', mediaId, rating),
    incO: (mediaId: string) => invoke('media:incO', mediaId),
    // Name optimization
    optimizeName: (mediaId: string) => invoke('media:optimizeName', mediaId),
    optimizeAllNames: () => invoke('media:optimizeAllNames'),
    // Move broken/corrupted files
    moveBroken: (mediaId: string, reason?: string) => invoke('media:moveBroken', mediaId, reason),
    // Transcode & playback
    getPlayableUrl: (mediaId: string) => invoke<string | null>('media:getPlayableUrl', mediaId),
    getLoudnessPeak: (mediaId: string) => invoke<number | null>('media:getLoudnessPeak', mediaId),
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // TAGS
  // ═══════════════════════════════════════════════════════════════════════════
  tags: {
    list: () => invoke('tags:list'),
    listWithCounts: () => invoke('tags:listWithCounts'),
    forMedia: (mediaId: string) => invoke('tags:forMedia', mediaId),
    listForMedia: (mediaId: string) => invoke('tags:listForMedia', mediaId),
    setForMedia: (mediaId: string, tags: string[]) => invoke('tags:setForMedia', mediaId, tags),
    addToMedia: (mediaId: string, tag: string) => invoke('tags:addToMedia', mediaId, tag),
    removeFromMedia: (mediaId: string, tag: string) => invoke('tags:removeFromMedia', mediaId, tag),
    ensure: (tag: string) => invoke('tags:ensure', tag),
    create: (tagName: string) => invoke('tags:create', tagName),
    delete: (tagName: string) => invoke('tags:delete', tagName),
    // Cleanup inappropriate/weird tags
    cleanup: (options?: { patterns?: string[] }) => invoke('tags:cleanup', options),
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // PLAYLISTS (Enhanced)
  // ═══════════════════════════════════════════════════════════════════════════
  playlists: {
    list: () => invoke('playlists:list'),
    create: (name: string) => invoke('playlists:create', name),
    rename: (id: string, name: string) => invoke('playlists:rename', id, name),
    delete: (id: string) => invoke('playlists:delete', id),
    getItems: (id: string) => invoke('playlists:getItems', id),
    addItems: (id: string, mediaIds: string[]) => invoke('playlists:addItems', id, mediaIds),
    removeItem: (id: string, mediaId: string) => invoke('playlists:removeItem', id, mediaId),
    // New enhanced features
    reorder: (id: string, itemIds: string[]) => invoke('playlists:reorder', id, itemIds),
    duplicate: (id: string) => invoke('playlists:duplicate', id),
    exportM3U: (id: string) => invoke('playlists:exportM3U', id),
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // MARKERS
  // ═══════════════════════════════════════════════════════════════════════════
  markers: {
    listForMedia: (mediaId: string) => invoke('markers:listForMedia', mediaId),
    list: (mediaId: string) => invoke('markers:list', mediaId),
    upsert: (marker: any) => invoke('markers:upsert', marker),
    delete: (id: string) => invoke('markers:delete', id),
    clearForMedia: (mediaId: string) => invoke('markers:clearForMedia', mediaId),
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // DAYLIST
  // ═══════════════════════════════════════════════════════════════════════════
  daylist: {
    getToday: (opts?: any) => invoke('daylist:getToday', opts),
    generateToday: (opts?: any) => invoke('daylist:generateToday', opts),
    regenerate: (opts?: any) => invoke('daylist:regenerate', opts),
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // THUMBNAILS / FILE URLS
  // ═══════════════════════════════════════════════════════════════════════════
  thumbs: {
    getUrl: (absPath: string) => invoke('thumbs:getUrl', absPath),
    getStatus: () => invoke('thumbs:getStatus'),
    rebuildAll: () => invoke('thumbs:rebuildAll'),
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // FILE SYSTEM HELPERS (Enhanced)
  // ═══════════════════════════════════════════════════════════════════════════
  fs: {
    toFileUrl: (absPath: string) => invoke('fs:toFileUrl', absPath),
    exists: (absPath: string) => invoke('fs:exists', absPath),
    readFileBase64: (absPath: string) => invoke('fs:readFileBase64', absPath),
    tempDir: () => invoke('fs:tempDir'),
    // New file/folder pickers
    chooseFile: (opts?: { filters?: any[]; title?: string }) => invoke('fs:chooseFile', opts),
    chooseFolder: (opts?: { title?: string }) => invoke('fs:chooseFolder', opts),
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // AI (Diabella) - Full Venice AI Integration
  // ═══════════════════════════════════════════════════════════════════════════
  ai: {
    // Chat
    chat: (payload: any) => invoke('ai:chat', payload),
    summarize: (payload: any) => invoke('ai:summarize', payload),
    getVoiceLine: (category: string) => invoke('ai:getVoiceLine', category),
    ping: () => invoke('ai:ping'),

    // Text-to-Speech
    speak: (text: string) => invoke('ai:speak', text),
    getVoices: () => invoke('ai:getVoices'),

    // Image Generation
    generateImage: (prompt: string, options?: { nsfw?: boolean }) =>
      invoke('ai:generateImage', prompt, options),
    generateAvatar: (options?: {
      style?: string
      outfit?: string
      expression?: string
      pose?: string
      arousalLevel?: number
      regenerate?: boolean
    }) => invoke('ai:generateAvatar', options),
    clearAvatarCache: () => invoke('ai:clearAvatarCache'),
    getAvatarOptions: () => invoke('ai:getAvatarOptions'),
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // DIABELLA - Direct Service Access
  // ═══════════════════════════════════════════════════════════════════════════
  diabella: {
    // Chat
    chat: (message: string, context?: any) => invoke('diabella:chat', message, context),
    greeting: () => invoke('diabella:greeting'),
    resetChat: () => invoke('diabella:resetChat'),
    getVideoReaction: (tags: string[]) => invoke('diabella:getVideoReaction', tags),
    getMemory: () => invoke('diabella:getMemory'),

    // Voice
    speak: (text: string) => invoke('diabella:speak', text),
    setVoicePreset: (preset: string) => invoke('diabella:setVoicePreset', preset),
    getVoicePresets: () => invoke('diabella:getVoicePresets'),

    // Sounds
    getSound: (event: string) => invoke('diabella:getSound', event),
    getSoundStats: () => invoke('diabella:getSoundStats'),
    rescanSounds: () => invoke('diabella:rescanSounds'),

    // Settings
    getSettings: () => invoke('diabella:getServiceSettings'),
    updateSettings: (updates: any) => invoke('diabella:updateServiceSettings', updates),
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // AUDIO - Sound Packs & Voice Lines
  // ═══════════════════════════════════════════════════════════════════════════
  audio: {
    organizeSoundPack: (sourceDir: string) => invoke('audio:organizeSoundPack', sourceDir),
    getVoiceLine: (category: string, subcategory?: string) =>
      invoke('audio:getVoiceLine', category, subcategory),
    getVoiceLineSequence: (categories: Array<{ category: string; subcategory?: string }>) =>
      invoke('audio:getVoiceLineSequence', categories),
    getStats: () => invoke('audio:getStats'),
    reloadVoiceLines: () => invoke('audio:reloadVoiceLines'),
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // TAGGING - NSFW Auto-Tagging
  // ═══════════════════════════════════════════════════════════════════════════
  tagging: {
    isAvailable: () => invoke('tagging:isAvailable'),
    tagFile: (filePath: string) => invoke('tagging:tagFile', filePath),
    tagDirectory: (dirPath: string, options?: { recursive?: boolean }) =>
      invoke('tagging:tagDirectory', dirPath, options),
    applyTags: (mediaId: string, tags: string[]) => invoke('tagging:applyTags', mediaId, tags),
    autoTagMedia: (mediaId: string) => invoke('tagging:autoTagMedia', mediaId),
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // SMART TAGGING - Intelligent filename-based tagging
  // ═══════════════════════════════════════════════════════════════════════════
  smartTag: {
    // Analyze a file and get tag suggestions
    analyze: (filePath: string) => invoke('smartTag:analyze', filePath),
    // Analyze a media item by ID
    analyzeMedia: (mediaId: string) => invoke('smartTag:analyzeMedia', mediaId),
    // Get tag suggestions for a media item
    getSuggestions: (mediaId: string, minConfidence?: number) =>
      invoke('smartTag:getSuggestions', mediaId, minConfidence),
    // Apply smart tags to a media item
    applyToMedia: (mediaId: string, minConfidence?: number) =>
      invoke('smartTag:applyToMedia', mediaId, minConfidence),
    // Get clean name suggestion
    suggestCleanName: (mediaId: string) => invoke('smartTag:suggestCleanName', mediaId),
    // Get all known tags
    getAllKnownTags: () => invoke('smartTag:getAllKnownTags'),
    // Get tag categories
    getCategories: () => invoke('smartTag:getCategories'),
    // Get excluded tags
    getExcludedTags: () => invoke('smartTag:getExcludedTags'),
    // Auto-tag all media in library
    autoTagAll: (options?: { minConfidence?: number }) =>
      invoke('smartTag:autoTagAll', options),
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // HYBRID TAGGING - AI-powered multi-tier tagging
  // ═══════════════════════════════════════════════════════════════════════════
  hybridTag: {
    // Check if Ollama vision is available
    isVisionAvailable: () => invoke('hybridTag:isVisionAvailable'),
    // Tag a single media item with hybrid approach
    tagMedia: (mediaId: string) => invoke('hybridTag:tagMedia', mediaId),
    // Apply hybrid tags to a media item
    applyToMedia: (mediaId: string) => invoke('hybridTag:applyToMedia', mediaId),
    // Get tag suggestions without applying
    getSuggestions: (mediaId: string) => invoke('hybridTag:getSuggestions', mediaId),
    // Auto-tag all untagged media
    autoTagAll: (options?: { onlyUntagged?: boolean; maxItems?: number; useVision?: boolean }) =>
      invoke('hybridTag:autoTagAll', options),
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // VIDEO ANALYSIS - AI scene detection, tagging, summaries
  // ═══════════════════════════════════════════════════════════════════════════
  videoAnalysis: {
    // Check if analyzer is available
    isAvailable: () => invoke('videoAnalysis:isAvailable'),
    // Analyze a single video (deep analysis with scenes, summary, highlights)
    analyze: (mediaId: string) => invoke('videoAnalysis:analyze', mediaId),
    // Get existing analysis for a video
    get: (mediaId: string) => invoke('videoAnalysis:get', mediaId),
    // Batch analyze multiple videos
    analyzeBatch: (options?: { limit?: number; onlyUnanalyzed?: boolean }) =>
      invoke('videoAnalysis:analyzeBatch', options),
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // TAGS EXTENDED - Visibility and AI-generated tags
  // ═══════════════════════════════════════════════════════════════════════════
  tagsExtended: {
    // Get tags with visibility and count info
    listWithVisibility: () => invoke('tags:listWithVisibility'),
    // Toggle tag visibility
    setVisibility: (tagName: string, isHidden: boolean) => invoke('tags:setVisibility', tagName, isHidden),
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // AI LIBRARY TOOLS - Tag cleaning, tag creation, AI file renaming
  // ═══════════════════════════════════════════════════════════════════════════
  aiTools: {
    // Check if AI is available
    isAvailable: () => invoke('aiTools:isAvailable'),
    // AI-powered tag cleanup (merge similar, fix typos, normalize)
    cleanupTags: () => invoke('aiTools:cleanupTags'),
    // AI-powered tag generation for a single media item
    generateTags: (mediaId: string) => invoke('aiTools:generateTags', mediaId),
    // AI-powered tag generation for entire library
    generateTagsAll: (options?: { maxItems?: number; onlyUntagged?: boolean }) =>
      invoke('aiTools:generateTagsAll', options),
    // AI-powered filename suggestion
    suggestFilename: (mediaId: string) => invoke('aiTools:suggestFilename', mediaId),
    // AI-powered batch file renaming
    renameAll: (options?: { maxItems?: number }) => invoke('aiTools:renameAll', options),
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // RECOMMENDATIONS
  // ═══════════════════════════════════════════════════════════════════════════
  recommend: {
    forMedia: (mediaId: string, limit?: number) => invoke('recommend:forMedia', mediaId, limit),
    forDiabella: (limit?: number) => invoke('recommend:forDiabella', limit),
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // SEARCH
  // ═══════════════════════════════════════════════════════════════════════════
  search: {
    suggest: (query: string) => invoke('search:suggest', query),
    record: (query: string) => invoke('search:record', query),
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // VAULT / MISC (Enhanced)
  // ═══════════════════════════════════════════════════════════════════════════
  vault: {
    rescan: () => invoke('vault:rescan'),
    cleanup: () => invoke('vault:cleanup'),
    pickFolder: () => invoke('vault:pickFolder'),
    getStats: () => invoke('vault:getStats'),
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // DATA EXPORT/IMPORT
  // ═══════════════════════════════════════════════════════════════════════════
  data: {
    exportSettings: () => invoke('data:exportSettings'),
    importSettings: () => invoke('data:importSettings'),
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // GOON STATS - Session tracking & achievements
  // ═══════════════════════════════════════════════════════════════════════════
  goon: {
    getStats: () => invoke('goon:getStats'),
    updateStats: (patch: any) => invoke('goon:updateStats', patch),
    recordEdge: () => invoke('goon:recordEdge'),
    recordOrgasm: (ruined?: boolean) => invoke('goon:recordOrgasm', ruined),
    startSession: () => invoke('goon:startSession'),
    endSession: (durationMinutes: number) => invoke('goon:endSession', durationMinutes),
    getAchievements: () => invoke('goon:getAchievements'),
    checkAchievements: () => invoke('goon:checkAchievements'),
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // GOON WALL - Session tracking
  // ═══════════════════════════════════════════════════════════════════════════
  goonwall: {
    startSession: (tileCount: number) => invoke('goonwall:startSession', tileCount),
    recordTime: (minutes: number) => invoke('goonwall:recordTime', minutes),
    shuffle: () => invoke('goonwall:shuffle'),
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // SESSION MODES
  // ═══════════════════════════════════════════════════════════════════════════
  session: {
    getModes: () => invoke('session:getModes'),
    getActive: () => invoke('session:getActive'),
    setMode: (modeId: string) => invoke('session:setMode', modeId),
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // GOON THEMES & VOCABULARY
  // ═══════════════════════════════════════════════════════════════════════════
  themes: {
    getGoonThemes: () => invoke('themes:getGoonThemes'),
    getGoonTheme: (themeId: string) => invoke('themes:getGoonTheme', themeId),
  },

  vocabulary: {
    get: () => invoke('vocabulary:get'),
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // EVENTS
  // ═══════════════════════════════════════════════════════════════════════════
  events: {
    onVaultChanged: (cb: () => void) => on('vault:changed', cb),
    onJobsChanged: (cb: () => void) => on('vault:jobsChanged', cb),
    onSettingsChanged: (cb: (settings: any) => void) => on('settings:changed', cb),
    onTaggingProgress: (cb: (progress: { current: number; total: number; file: string }) => void) =>
      on('tagging:progress', cb),
    onSmartTagProgress: (cb: (progress: { processed: number; total: number; tagged: number }) => void) =>
      on('smartTag:progress', cb),
    onHybridTagProgress: (cb: (progress: { processed: number; total: number; tagged: number }) => void) =>
      on('hybridTag:progress', cb),
    onVideoAnalysisProgress: (cb: (progress: { mediaId: string; stage: string; current: number; total: number; message: string }) => void) =>
      on('videoAnalysis:progress', cb),
    onVideoAnalysisBatchProgress: (cb: (progress: { current: number; total: number; currentVideo: string }) => void) =>
      on('videoAnalysis:batchProgress', cb),
    // AI Library Tools events
    onAiTagCleanupProgress: (cb: (progress: { current: number; total: number; tag: string }) => void) =>
      on('aiTools:tagCleanupProgress', cb),
    onAiGenerateTagsProgress: (cb: (progress: { current: number; total: number; filename: string }) => void) =>
      on('aiTools:generateTagsProgress', cb),
    onAiRenameProgress: (cb: (progress: { current: number; total: number; filename: string }) => void) =>
      on('aiTools:renameProgress', cb),
    // Goon events
    onGoonStatsChanged: (cb: (stats: any) => void) => on('goon:statsChanged', cb),
    onAchievementUnlocked: (cb: (achievements: string[]) => void) => on('goon:achievementUnlocked', cb),
    onSessionStarted: (cb: (stats: any) => void) => on('goon:sessionStarted', cb),
    onSessionEnded: (cb: (stats: any) => void) => on('goon:sessionEnded', cb),
    onSessionModeChanged: (cb: (mode: any) => void) => on('session:modeChanged', cb),
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // LICENSE & TIER MANAGEMENT
  // ═══════════════════════════════════════════════════════════════════════════
  license: {
    getTier: () => invoke('license:getTier'),
    getLimits: () => invoke('license:getLimits'),
    getInfo: () => invoke('license:getInfo'),
    isPremium: () => invoke('license:isPremium'),
    activate: (key: string) => invoke('license:activate', key),
    hasFeature: (feature: string) => invoke('license:hasFeature', feature),
    getLimit: (feature: string) => invoke('license:getLimit', feature),
    getMachineId: () => invoke('license:getMachineId'),
    generateKey: () => invoke('license:generateKey'),
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // AI CACHE MANAGEMENT
  // ═══════════════════════════════════════════════════════════════════════════
  aiCache: {
    getStats: () => invoke('aiCache:getStats'),
    clear: (namespace?: string) => invoke('aiCache:clear', namespace),
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // SHELL
  // ═══════════════════════════════════════════════════════════════════════════
  shell: {
    openExternal: (url: string) => shell.openExternal(url),
    openPath: (p: string) => shell.openPath(p),
    showItemInFolder: (p: string) => shell.showItemInFolder(p),
  },
}

// Expose API to renderer
contextBridge.exposeInMainWorld('api', api)

// ─────────────────────────────────────────────────────────────────────────────
// DIAGNOSTICS BRIDGE
// Renderer expects window.vaultDiagnostics.{getSnapshot,onEvent,onToggle,log}
// ─────────────────────────────────────────────────────────────────────────────

contextBridge.exposeInMainWorld('vaultDiagnostics', {
  getSnapshot: () => invoke('diagnostics:getSnapshot'),
  onEvent: (cb: (ev: any) => void) => on('diagnostics:event', cb),
  onToggle: (cb: (enabled: boolean) => void) => on('diagnostics:toggle', cb),
  log: (level: 'info' | 'warn' | 'error', message: string, meta?: any) =>
    invoke('diagnostics:log', { level, message, meta }),
})

// ─────────────────────────────────────────────────────────────────────────────
// TYPE EXPORT
// ─────────────────────────────────────────────────────────────────────────────

export type Api = typeof api
