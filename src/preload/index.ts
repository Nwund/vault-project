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
    resetSection: (section: string) => invoke('settings:resetSection', section),

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
    appearance: {
      update: (patch: any) => invoke('settings:appearance:update', patch),
    },
    privacy: {
      update: (patch: any) => invoke('settings:privacy:update', patch),
    },
    blacklist: {
      update: (patch: any) => invoke('settings:blacklist:update', patch),
      addTag: (tag: string) => invoke('settings:blacklist:addTag', tag),
      removeTag: (tag: string) => invoke('settings:blacklist:removeTag', tag),
      addMedia: (mediaId: string) => invoke('settings:blacklist:addMedia', mediaId),
      removeMedia: (mediaId: string) => invoke('settings:blacklist:removeMedia', mediaId),
    },
    captions: {
      update: (patch: any) => invoke('settings:captions:update', patch),
      addPreset: (preset: any) => invoke('settings:captions:addPreset', preset),
      removePreset: (presetId: string) => invoke('settings:captions:removePreset', presetId),
    },
    data: {
      update: (patch: any) => invoke('settings:data:update', patch),
    },
    visualEffects: {
      update: (patch: any) => invoke('settings:visualEffects:update', patch),
    },

    // Theme
    setTheme: (themeId: string) => invoke('settings:setTheme', themeId),


    // Folder pickers for settings page
    chooseMediaDir: () => invoke('settings:chooseMediaDir'),
    removeMediaDir: (dir: string) => invoke('settings:removeMediaDir', dir),
    chooseCacheDir: () => invoke('settings:chooseCacheDir'),
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // SETTINGS PROFILES
  // ═══════════════════════════════════════════════════════════════════════════
  profiles: {
    list: () => invoke<Array<{ id: string; name: string; description?: string; createdAt: number; updatedAt: number }>>('profiles:list'),
    get: (profileId: string) => invoke<any>('profiles:get', profileId),
    getActive: () => invoke<string | null>('profiles:getActive'),
    create: (name: string, description?: string) => invoke<any>('profiles:create', name, description),
    save: (profileId: string) => invoke<any>('profiles:save', profileId),
    load: (profileId: string) => invoke<any>('profiles:load', profileId),
    rename: (profileId: string, name: string, description?: string) => invoke<any>('profiles:rename', profileId, name, description),
    delete: (profileId: string) => invoke<boolean>('profiles:delete', profileId),
    clearActive: () => invoke<boolean>('profiles:clearActive'),
    // Event subscriptions
    onUpdated: (cb: (profile: any) => void) => on('profiles:updated', cb),
    onLoaded: (cb: (profileId: string) => void) => on('profiles:loaded', cb),
    onDeleted: (cb: (profileId: string) => void) => on('profiles:deleted', cb),
    onCleared: (cb: () => void) => on('profiles:cleared', cb),
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // DAILY CHALLENGES
  // ═══════════════════════════════════════════════════════════════════════════
  challenges: {
    get: () => invoke<{
      date: string
      challenges: Array<{
        id: string
        type: string
        title: string
        description: string
        icon: string
        target: number
        progress: number
        completed: boolean
        rewardXp: number
      }>
      completedCount: number
      totalXp: number
      streak: number
    }>('challenges:get'),
    updateProgress: (type: string, increment?: number) => invoke<any>('challenges:updateProgress', type, increment),
    reset: () => invoke<any>('challenges:reset'),
    // Event subscriptions
    onCompleted: (cb: (challenges: any[]) => void) => on('challenges:completed', cb),
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
    importFiles: (filePaths: string[]) => invoke<{ success: boolean; imported?: number; failed?: number; error?: string }>('media:importFiles', filePaths),
    count: (opts?: any) => invoke('media:count', opts),
    // Stats
    getStats: (mediaId: string) => invoke('media:getStats', mediaId),
    getStatsBatch: (mediaIds: string[]) => invoke<Record<string, { rating: number; viewCount: number; oCount: number }>>('media:getStatsBatch', mediaIds),
    recordView: (mediaId: string) => invoke('media:recordView', mediaId),
    setRating: (mediaId: string, rating: number) => invoke('media:setRating', mediaId, rating),
    bulkSetRating: (mediaIds: string[], rating: number) => invoke<{ updated: number; total: number }>('media:bulkSetRating', mediaIds, rating),
    incO: (mediaId: string) => invoke('media:incO', mediaId),
    // Name optimization
    optimizeName: (mediaId: string) => invoke('media:optimizeName', mediaId),
    optimizeAllNames: () => invoke('media:optimizeAllNames'),
    optimizeNames: (mediaIds: string[]) => invoke<{ success: boolean; optimized: number; skipped: number; failed: number; total: number; errors?: string[] }>('media:optimizeNames', mediaIds),
    // Move broken/corrupted files
    moveBroken: (mediaId: string, reason?: string) => invoke('media:moveBroken', mediaId, reason),
    // Transcode & playback
    getPlayableUrl: (mediaId: string, forceTranscode?: boolean) => invoke<string | null>('media:getPlayableUrl', mediaId, forceTranscode),
    getLowResUrl: (mediaId: string, maxHeight: number) => invoke<string | null>('media:getLowResUrl', mediaId, maxHeight),
    getLoudnessPeak: (mediaId: string) => invoke<number | null>('media:getLoudnessPeak', mediaId),
    // On-demand thumbnail generation
    generateThumb: (mediaId: string) => invoke<string | null>('media:generateThumb', mediaId),
    // Duplicate detection
    findDuplicates: () => invoke<Array<{ hash: string; count: number; ids: string[]; paths: string[] }>>('media:findDuplicates'),
    deleteDuplicates: (options?: { dryRun?: boolean }) => invoke<{ deletedCount: number; freedBytes: number; deleted: string[]; dryRun: boolean }>('media:deleteDuplicates', options),
    // Delete from library (soft delete - removes from DB, file stays on disk)
    delete: (mediaId: string) => invoke<{ success: boolean; deletedMedia?: any; error?: string }>('media:delete', mediaId),
    // Undo last delete (restores media to library if file still exists)
    undoDelete: () => invoke<{ success: boolean; restoredId?: string; error?: string }>('media:undoDelete'),
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
  // CAPTIONS
  // ═══════════════════════════════════════════════════════════════════════════
  captions: {
    get: (mediaId: string) => invoke('captions:get', mediaId),
    upsert: (mediaId: string, topText: string | null, bottomText: string | null, presetId?: string, customStyle?: string | null) =>
      invoke('captions:upsert', mediaId, topText, bottomText, presetId, customStyle),
    delete: (mediaId: string) => invoke('captions:delete', mediaId),
    listCaptioned: () => invoke('captions:listCaptioned'),
    templates: {
      list: () => invoke('captions:templates:list'),
      add: (topText: string | null, bottomText: string | null, category?: string) =>
        invoke('captions:templates:add', topText, bottomText, category),
      delete: (id: string) => invoke('captions:templates:delete', id),
    },
    // Export captioned image as new file
    export: (mediaId: string, options: {
      topText: string | null;
      bottomText: string | null;
      presetId: string;
      filters: Record<string, number>;
      captionBar: { color: 'black' | 'white'; size: number; position: 'top' | 'bottom' | 'both' } | null;
    }) => invoke('captions:export', mediaId, options),
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
    exportJSON: (id: string) => invoke<{ success: boolean; path?: string; error?: string }>('playlists:exportJSON', id),
    importJSON: () => invoke<{ success: boolean; playlist?: any; matched?: number; total?: number; error?: string }>('playlists:importJSON'),
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // SMART PLAYLISTS - Auto-updating playlists based on rules
  // ═══════════════════════════════════════════════════════════════════════════
  smartPlaylists: {
    create: (name: string, rules: {
      includeTags?: string[]
      excludeTags?: string[]
      type?: 'video' | 'image' | 'gif' | ''
      minRating?: number
      limit?: number
      sortBy?: 'addedAt' | 'rating' | 'views' | 'random'
      sortDir?: 'asc' | 'desc'
    }) => invoke('smartPlaylists:create', name, rules),
    updateRules: (playlistId: string, rules: {
      includeTags?: string[]
      excludeTags?: string[]
      type?: 'video' | 'image' | 'gif' | ''
      minRating?: number
      limit?: number
      sortBy?: 'addedAt' | 'rating' | 'views' | 'random'
      sortDir?: 'asc' | 'desc'
    }) => invoke('smartPlaylists:updateRules', playlistId, rules),
    getRules: (playlistId: string) => invoke<{
      includeTags?: string[]
      excludeTags?: string[]
      type?: 'video' | 'image' | 'gif' | ''
      minRating?: number
      limit?: number
      sortBy?: 'addedAt' | 'rating' | 'views' | 'random'
      sortDir?: 'asc' | 'desc'
    } | null>('smartPlaylists:getRules', playlistId),
    refresh: (playlistId: string) => invoke<{ updated: number }>('smartPlaylists:refresh', playlistId),
    refreshAll: () => invoke<{ refreshed: number; totalItems: number }>('smartPlaylists:refreshAll'),
    list: () => invoke('smartPlaylists:list'),
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
  // UI SOUNDS - Click sounds
  // ═══════════════════════════════════════════════════════════════════════════
  uiSounds: {
    list: () => invoke<string[]>('uiSounds:list'),
    getUrl: (filePath: string) => invoke<string>('uiSounds:getUrl', filePath),
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
    recordWatch: (mediaId: string) => invoke('goon:recordWatch', mediaId),
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
    // AI Intelligence events
    onAiStatus: (cb: (data: { status: string }) => void) => on('ai:status', cb),
    onAiProgress: (cb: (data: { mediaId: string; stage: string; percent: number; processingTime?: number; error?: string }) => void) => on('ai:progress', cb),
    onAiModelDownload: (cb: (data: { model: string; percent: number; bytesDownloaded: number; bytesTotal: number }) => void) => on('ai:model-download', cb),
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
  // CACHE MANAGEMENT - Thumbnails and other caches
  // ═══════════════════════════════════════════════════════════════════════════
  cache: {
    clearThumbnails: () => invoke<{ success: boolean; count?: number; freedBytes?: number; error?: string }>('cache:clearThumbnails'),
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // ERROR LOGGING - Persistent log management for debugging
  // ═══════════════════════════════════════════════════════════════════════════
  logs: {
    getRecent: (limit?: number) => invoke<Array<{
      timestamp: string
      level: 'info' | 'warn' | 'error'
      source: string
      message: string
      stack?: string
      meta?: Record<string, unknown>
    }>>('logs:getRecent', limit),
    getErrors: (limit?: number) => invoke<Array<{
      timestamp: string
      level: 'error'
      source: string
      message: string
      stack?: string
      meta?: Record<string, unknown>
    }>>('logs:getErrors', limit),
    getLogFilePath: () => invoke<string>('logs:getLogFilePath'),
    getContent: () => invoke<string>('logs:getContent'),
    clear: () => invoke<{ success: boolean; error?: string }>('logs:clear'),
    log: (level: 'info' | 'warn' | 'error', source: string, message: string, meta?: Record<string, unknown>) =>
      invoke<{ success: boolean }>('logs:log', level, source, message, meta),
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // AI INTELLIGENCE SYSTEM - Multi-tier AI analysis
  // ═══════════════════════════════════════════════════════════════════════════
  ai: {
    // Model management
    checkModels: () => invoke('ai:check-models'),
    downloadModels: () => invoke('ai:download-models'),
    configureTier2: (config: { apiKey?: string }) => invoke('ai:configure-tier2', config),
    getTier2Config: () => invoke<{ apiKey: string; configured: boolean }>('ai:get-tier2-config'),

    // Queue management
    queueUntagged: () => invoke('ai:queue-untagged'),
    queueSpecific: (mediaIds: string[]) => invoke('ai:queue-specific', mediaIds),
    queueAll: () => invoke('ai:queue-all'),
    getQueueStatus: () => invoke('ai:queue-status'),

    // Processing control
    start: (options?: { enableTier2?: boolean; concurrency?: number }) => invoke('ai:start', options),
    pause: () => invoke('ai:pause'),
    resume: () => invoke('ai:resume'),
    stop: () => invoke('ai:stop'),

    // Review queue
    getReviewList: (options?: { limit?: number; offset?: number }) => invoke('ai:review-list', options),
    approve: (mediaId: string) => invoke('ai:approve', mediaId),
    approveEdited: (mediaId: string, edits: {
      selectedTagIds?: number[]
      editedTitle?: string
      newTags?: string[]
    }) => invoke('ai:approve-edited', mediaId, edits),
    reject: (mediaId: string) => invoke('ai:reject', mediaId),
    bulkApprove: () => invoke('ai:bulk-approve'),
    bulkReject: () => invoke<{ rejected: number }>('ai:bulk-reject'),

    // Stats
    getStats: () => invoke('ai:get-stats'),

    // Failed items management
    clearFailed: () => invoke<{ cleared: number }>('ai:clear-failed'),
    retryFailed: () => invoke<{ retried: number }>('ai:retry-failed'),

    // Tag cleanup
    cleanupTags: () => invoke<{ removed: number }>('ai:cleanup-tags'),

    // Protected tags management
    getProtectedTags: () => invoke<string[]>('ai:get-protected-tags'),
    setProtectedTags: (tags: string[]) => invoke<{ success: boolean }>('ai:set-protected-tags', tags),
    addProtectedTag: (tag: string) => invoke<{ success: boolean }>('ai:add-protected-tag', tag),
    removeProtectedTag: (tag: string) => invoke<{ success: boolean }>('ai:remove-protected-tag', tag),

    // Caption generation - analyze image and suggest captions
    analyzeForCaption: (mediaId: string) => invoke<{ topText: string | null; bottomText: string | null; category: string } | null>('ai:analyze-for-caption', mediaId),
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // SHELL
  // ═══════════════════════════════════════════════════════════════════════════
  shell: {
    openExternal: (url: string) => shell.openExternal(url),
    openPath: (p: string) => invoke('shell:openPath', p),
    showItemInFolder: (p: string) => invoke('shell:showItemInFolder', p),
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
