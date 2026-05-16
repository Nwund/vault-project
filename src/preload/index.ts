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
  // GENERIC INVOKE - For new IPC handlers not yet added to typed API
  // ═══════════════════════════════════════════════════════════════════════════
  invoke: <T = unknown>(channel: string, ...args: any[]): Promise<T> => invoke<T>(channel, ...args),

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
      exportPresets: () => invoke<{ success: boolean; cancelled?: boolean; path?: string; count?: number }>('settings:captions:exportPresets'),
      importPresets: (mode?: 'merge' | 'replace') => invoke<{ success: boolean; cancelled?: boolean; imported?: number; total?: number; error?: string }>('settings:captions:importPresets', mode),
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
    // Alias - several components (HomeDashboard, Detached, RelatedMediaPanel)
    // were calling media.get(id) before getById was the canonical name. Keep
    // .get as a passthrough so they keep working without touching every site.
    get: (id: string) => invoke('media:getById', id),
    randomByTags: (tags: string[], opts?: any) => invoke('media:randomByTags', tags, opts),
    rescan: () => invoke('media:rescan'),
    importFiles: (filePaths: string[]) => invoke<{ success: boolean; imported?: number; failed?: number; error?: string }>('media:importFiles', filePaths),
    count: (opts?: any) => invoke('media:count', opts),
    // Stats
    getStats: (mediaId: string) => invoke('media:getStats', mediaId),
    getStatsBatch: (mediaIds: string[]) => invoke<Record<string, { rating: number; viewCount: number; oCount: number }>>('media:getStatsBatch', mediaIds),
    recordView: (mediaId: string) => invoke('media:recordView', mediaId),
    setRating: (mediaId: string, rating: number) => invoke('media:setRating', mediaId, rating),
    setTitle: (mediaId: string, title: string) => invoke<{ success: boolean; error?: string }>('media:setTitle', mediaId, title),
    setDescription: (mediaId: string, description: string) => invoke<{ success: boolean; error?: string }>('media:setDescription', mediaId, description),
    getDescription: (mediaId: string) => invoke<string | null>('media:getDescription', mediaId),
    bulkSetRating: (mediaIds: string[], rating: number) => invoke<{ updated: number; total: number }>('media:bulkSetRating', mediaIds, rating),
    incO: (mediaId: string) => invoke('media:incO', mediaId),
    // Name optimization
    optimizeName: (mediaId: string) => invoke('media:optimizeName', mediaId),
    optimizeAllNames: () => invoke('media:optimizeAllNames'),
    optimizeNames: (mediaIds: string[]) => invoke<{ success: boolean; optimized: number; skipped: number; failed: number; total: number; errors?: string[] }>('media:optimizeNames', mediaIds),
    // Anitomy-style structured filename parse — returns extension /
    // title / studio / performers / date / year / resolution + the
    // full element table. Pure function, no DB hit. Useful for
    // bulk-rename UI to preview what template variables will resolve to.
    parseFilename: (filename: string) =>
      invoke<{
        ok: boolean
        error?: string
        parsed?: {
          extension: string | null
          elements: Array<{ kind: string; value: string; span?: { start: number; end: number } }>
          title: string | null
          studio: string | null
          performers: string[]
          date: string | null
          year: number | null
          resolution: string | null
        }
      }>('media:parse-filename', filename),
    // Audio-peak highlight detector — finds the loudest/most-intense
    // moments in a video using ffmpeg astats over windowed RMS.
    // Pass autoApplyMarkers:true to also insert them as markers.
    // Whisparr-style performer watchlist (#56). User flags
    // performers; a periodic poll surfaces new uploads from configured
    // Browse sources as pending hits the user can approve / dismiss /
    // queue-for-download.
    watchlistAdd: (opts: {
      performerName: string
      faceClusterId?: string | null
      sources?: string[]
      pollIntervalHours?: number
      notes?: string
    }) =>
      invoke<{ ok: boolean; error?: string; entry?: any }>('watchlist:add', opts),
    watchlistList: (opts?: { enabledOnly?: boolean }) =>
      invoke<Array<{
        performerName: string
        faceClusterId: string | null
        sources: string[]
        enabled: boolean
        lastPolledAt: number | null
        nextPollAt: number | null
        pollIntervalHours: number
        addedAt: number
        notes: string | null
      }>>('watchlist:list', opts),
    watchlistRemove: (performerName: string) =>
      invoke<{ ok: boolean }>('watchlist:remove', performerName),
    watchlistSetEnabled: (opts: { performerName: string; enabled: boolean }) =>
      invoke<{ ok: boolean }>('watchlist:set-enabled', opts),
    watchlistHits: (opts?: {
      performerName?: string
      status?: 'pending' | 'queued' | 'dismissed' | 'downloaded'
      limit?: number
      offset?: number
    }) =>
      invoke<Array<{
        id: string
        performerName: string
        sourceName: string
        sourceId: string | null
        url: string
        title: string | null
        thumbUrl: string | null
        releasedAt: number | null
        discoveredAt: number
        status: 'pending' | 'queued' | 'dismissed' | 'downloaded'
        notes: string | null
      }>>('watchlist:hits', opts),
    watchlistHitStatus: (opts: {
      hitId: string
      status: 'pending' | 'queued' | 'dismissed' | 'downloaded'
    }) =>
      invoke<{ ok: boolean }>('watchlist:hit-status', opts),
    watchlistPollNow: (opts?: { maxPerformers?: number }) =>
      invoke<{
        performersPolled: number
        hitsRecorded: number
        hitsAlreadyKnown: number
        sourceErrors: number
        attemptedSources: Record<string, number>
      }>('watchlist:poll-now', opts),
    audioHighlights: (opts: {
      mediaId: string
      topN?: number
      minZ?: number
      maxLenSec?: number
      windowSec?: number
      autoApplyMarkers?: boolean
    }) =>
      invoke<{
        ok: boolean
        error?: string
        candidates: Array<{
          startSec: number
          endSec: number
          score: number
          rmsDb: number
        }>
        markersAdded?: number
      }>('media:audio-highlights', opts),
    // Studio recognizer — PhoenixAdult-style URL-pattern matcher.
    // Pass any URL (scene page, studio domain, tube URL); returns the
    // canonical studio name + parent network + scene id when capturable.
    // Used by Browse-save flows to auto-emit studio:NAME / network:NAME
    // tags when the source URL is known.
    recognizeStudio: (url: string) =>
      invoke<{
        ok: boolean
        error?: string
        match?: {
          studio: string
          network?: string
          hasIdentifier: boolean
          identifier?: string
        } | null
        tagNames?: string[]
      }>('media:recognize-studio', url),
    sceneMetadataLookup: (ctx: {
      filename?: string
      title?: string
      hash?: string
      hashType?: 'phash' | 'oshash' | 'md5' | 'sha256' | 'crc32'
      knownPerformers?: string[]
      knownStudio?: string
    }) =>
      invoke<{
        match: {
          title: string
          description: string | null
          releaseDate: string | null
          durationSec: number | null
          sourceUrl: string | null
          studio: string | null
          network: string | null
          performers: string[]
          tags: string[]
          sourceName: string
          sourceId: string
          confidence: number
        } | null
        attempted: string[]
        skipped: string[]
      }>('scene-metadata:lookup', ctx),
    sceneMetadataSources: () =>
      invoke<Array<{ name: string; available: boolean }>>('scene-metadata:list-sources'),
    // TpDB-bootstrapped face clusters — download performer photos
    // from TpDB, detect faces with YuNet, embed with ArcFace/SFace,
    // average into a centroid + create/update the named face_clusters
    // row. Hard prereqs: TpDB API key + YuNet ONNX + face-recognition
    // ONNX (any of ArcFace/AdaFace/SFace).
    // DeoVR / HereSphere catalog server (#119). Read-only HTTP
    // endpoint that exposes the library as a DeoVR JSON catalog so
    // VR headsets on the LAN can browse + stream straight from
    // Vault. NO AUTH — toggle off when not actively casting.
    deovrStart: (port?: number) =>
      invoke<{ success: boolean; port?: number; addresses?: string[]; error?: string }>(
        'deovr:start',
        port !== undefined ? { port } : undefined,
      ),
    deovrStop: () => invoke<{ ok: boolean }>('deovr:stop'),
    deovrStatus: () =>
      invoke<{
        running: boolean
        port: number
        addresses: string[]
        catalogUrl: string | null
      }>('deovr:status'),
    stashShimStart: (port?: number) =>
      invoke<{ success: boolean; port?: number; addresses?: string[]; error?: string }>(
        'stash:start',
        port !== undefined ? { port } : undefined,
      ),
    stashShimStop: () => invoke<{ ok: boolean }>('stash:stop'),
    stashShimStatus: () =>
      invoke<{
        running: boolean
        port: number
        addresses: string[]
        graphqlUrl: string | null
      }>('stash:status'),
    itchioAudioSearch: (opts?: { query?: string; page?: number }) =>
      invoke<{
        ok: boolean
        error?: string
        games: Array<{
          id: string
          title: string
          shortDescription: string | null
          url: string
          thumbUrl: string | null
          authorName: string | null
          priceLabel: string | null
        }>
        hasMore: boolean
      }>('foley:itchio-search', opts ?? {}),
    findThePart: (opts: {
      query: string
      perSourceLimit?: number
      limit?: number
      includeClipSearch?: boolean
    }) =>
      invoke<{
        query: string
        moments: Array<{
          mediaId: string
          filename: string | null
          thumbPath: string | null
          startSec: number
          endSec: number
          precision: 'frame' | 'second' | 'video'
          score: number
          source: 'transcript' | 'marker' | 'chapter' | 'clip-search'
          excerpt: string | null
        }>
        attempted: string[]
        skipped: string[]
      }>('ai:find-the-part', opts),
    tpdbImportPerformerFaces: (req: {
      performerName: string
      performerId?: string
      maxPhotos?: number
    }) =>
      invoke<{
        ok: boolean
        error?: string
        performerName: string
        performerId?: string
        photosFetched: number
        photosWithFace: number
        embeddingsExtracted: number
        clusterId?: string
        clusterCreated?: boolean
        warnings: string[]
      }>('ai:tpdb-import-performer-faces', req),
    stashdbImportPerformerFaces: (req: {
      performerName: string
      performerId?: string
      maxPhotos?: number
    }) =>
      invoke<{
        ok: boolean
        error?: string
        performerName: string
        performerId?: string
        photosFetched: number
        photosWithFace: number
        embeddingsExtracted: number
        clusterId?: string
        clusterCreated?: boolean
        warnings: string[]
      }>('ai:stashdb-import-performer-faces', req),
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
    allHashes: () => invoke<string[]>('media:allHashes'),
    deleteDuplicates: (options?: { dryRun?: boolean }) => invoke<{ deletedCount: number; freedBytes: number; deleted: string[]; dryRun: boolean }>('media:deleteDuplicates', options),
    // Delete from library (soft delete - removes from DB, file stays on disk)
    delete: (mediaId: string) => invoke<{ success: boolean; deletedMedia?: any; error?: string }>('media:delete', mediaId),
    // Undo last delete (restores media to library if file still exists)
    undoDelete: () => invoke<{ success: boolean; restoredId?: string; error?: string }>('media:undoDelete'),
    // Persistent trash (30-day retention) — separate from the in-memory
    // undo stack. Settings → Trash UI consumes these.
    trashList: () => invoke<{
      ok: boolean
      items: Array<{
        id: string
        original_path: string
        filename: string
        type: string
        size_bytes: number | null
        duration_sec: number | null
        thumb_path: string | null
        deleted_at: number
        purge_at: number
      }>
      error?: string
    }>('media:trash:list'),
    trashRestore: (trashId: string) =>
      invoke<{ ok: boolean; restoredId?: string; path?: string; error?: string }>('media:trash:restore', trashId),
    trashPurgeOne: (trashId: string) =>
      invoke<{ ok: boolean; removed?: number; error?: string }>('media:trash:purgeOne', trashId),
    trashPurgeAll: () =>
      invoke<{ ok: boolean; removed?: number; error?: string }>('media:trash:purgeAll'),
    trashAutoPurgeExpired: () =>
      invoke<{ ok: boolean; removed?: number; error?: string }>('media:trash:autoPurgeExpired'),
    // GIF creation from video
    createGif: (options: {
      mediaId: string
      startTime: number
      endTime: number
      fps?: number
      width?: number
      quality?: 'low' | 'medium' | 'high'
    }) => invoke<{ success: boolean; gifPath?: string; error?: string }>('media:createGif', options),
    saveGif: (gifPath: string) => invoke<{ success: boolean; savedPath?: string; error?: string }>('media:saveGif', gifPath),
    addGifToLibrary: (gifPath: string) => invoke<{ success: boolean; mediaId?: string; error?: string }>('media:addGifToLibrary', gifPath),
    renameGif: (gifPath: string, newName: string) => invoke<{ success: boolean; newPath?: string; error?: string }>('media:renameGif', gifPath, newName),
    // Video trimming
    trimVideo: (options: {
      mediaId: string
      startTime: number
      endTime: number
      outputName?: string
    }) => invoke<{ success: boolean; outputPath?: string; error?: string }>('media:trimVideo', options),
    saveTrimmedVideo: (trimmedPath: string) => invoke<{ success: boolean; savedPath?: string; error?: string }>('media:saveTrimmedVideo', trimmedPath),
    addTrimmedToLibrary: (trimmedPath: string) => invoke<{ success: boolean; mediaId?: string; error?: string }>('media:addTrimmedToLibrary', trimmedPath),
    // Phase E: rename a library file in place — used by AI Review when Tier 2
    // suggests a clean filename for gibberish-named items.
    rename: (mediaId: string, newBaseName: string) => invoke<{ success: boolean; renamed?: boolean; newPath?: string; newFilename?: string; error?: string }>('media:rename', mediaId, newBaseName),
    rejectRenameSuggestion: (mediaId: string) => invoke<{ success: boolean; error?: string }>('media:rejectRenameSuggestion', mediaId),
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
    // Two-level taxonomy — returns CATEGORY_META plus the tag list +
    // total media count for each category. Used by Library's category-
    // grouped sidebar (FAP.Organizer-style two-tier UX).
    categoriesWithCounts: () => invoke<Array<{
      id: string
      label: string
      color: string
      description: string
      tags: Array<{ name: string; count: number }>
      totalMedia: number
    }>>('tags:categories-with-counts'),

    // User-directed merge — re-links all media tagged with `source` to
    // `target`, then deletes `source`. Target is auto-created if it
    // doesn't yet exist. Returns counts for the success toast.
    merge: (source: string, target: string) => invoke<
      | { ok: false; error: string }
      | { ok: true; moved: number; duplicatesCollapsed: number; sourceName: string; targetName: string }
    >('tags:merge', { source, target }),
    // Dry-run the merge — returns how many items would be moved + how
    // many already have both tags (collapse as duplicates). Used by
    // the UI to preview impact before the irreversible action.
    mergePreview: (source: string, target: string) => invoke<
      | { ok: false; error: string }
      | { ok: true; sourceCount: number; targetCount: number; overlap: number; moved: number; targetExists: boolean }
    >('tags:merge-preview', { source, target }),
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
    rebuildMissing: () => invoke<{ enqueued: number; alreadyOk: number }>('thumbs:rebuildMissing'),
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
    saveFile: (opts?: { defaultPath?: string; filters?: any[]; title?: string }) => invoke<string | null>('fs:saveFile', opts),
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
    backfillDurations: () => invoke('vault:backfillDurations'),
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
    getStreakStatus: () => invoke<{
      currentStreak: number
      atRisk: boolean
      hoursRemaining: number
      lastSessionDate: number | null
      hasSessionToday: boolean
    }>('goon:getStreakStatus'),
    getPersonalRecords: () => invoke<{
      records: Array<{
        name: string
        value: number
        unit: string
        formattedValue: string
        icon: string
        achievedAt?: string
      }>
      weeklyStats: {
        sessionsThisWeek: number
        videosWatchedThisWeek: number
        edgesThisWeek: number
        timeThisWeek: number
      }
    }>('goon:getPersonalRecords'),
    // Feature tracking for achievements
    trackDlnaCast: (deviceId: string) => invoke('goon:trackDlnaCast', deviceId),
    trackHardwareEncoder: () => invoke('goon:trackHardwareEncoder'),
    trackCommandPalette: () => invoke('goon:trackCommandPalette'),
    trackDoubleTapLike: () => invoke('goon:trackDoubleTapLike'),
    trackFeedSwipe: () => invoke('goon:trackFeedSwipe'),
    trackOverlayEnabled: (overlayId: string) => invoke('goon:trackOverlayEnabled', overlayId),
    trackSceneMarker: () => invoke('goon:trackSceneMarker'),
    trackCaptionCreated: () => invoke('goon:trackCaptionCreated'),
    trackPlaylistExport: () => invoke('goon:trackPlaylistExport'),
    trackPlaylistImport: () => invoke('goon:trackPlaylistImport'),
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
    onAiProgress: (cb: (data: { mediaId: string; stage: string; percent: number; processingTime?: number; error?: string; framesExtracted?: number; tier1Tags?: number; tier2Frame?: number; tier2Total?: number }) => void) => on('ai:progress', cb),
    // Duration-weighted queue progress: emitted whenever an item completes.
    // percent = completedSec / totalSec (items with unknown duration count
    // as a 60s median).
    onAiQueueProgress: (cb: (data: { completedCount: number; totalCount: number; completedSec: number; totalSec: number; percent: number }) => void) => on('ai:queue-progress', cb),
    onAiModelDownload: (cb: (data: { model: string; percent: number; bytesDownloaded: number; bytesTotal: number }) => void) => on('ai:model-download', cb),
    // Venice failure event — fires when rate-limited / unreachable / auth
    // fails. UI should show error + retry countdown using retryAfterSec.
    onVeniceError: (cb: (data: { code: 'VENICE_RATE_LIMITED' | 'VENICE_UNREACHABLE' | 'VENICE_AUTH_FAILED' | 'VENICE_API_ERROR'; message: string; retryAfterSec: number | null; httpStatus: number | null; mediaId: string }) => void) =>
      on('ai:venice-error', cb),
    // Xyrene TTS streaming — receives PCM chunks (s16 mono @ 24kHz, b64
    // encoded) followed by an end or error event. The streamId echoes
    // the value the renderer supplied to xyreneSpeakStream so concurrent
    // streams stay separate.
    onXyreneSpeakChunk: (cb: (data: { streamId: string; b64: string }) => void) => on('xyrene:speakStream:chunk', cb),
    onXyreneSpeakEnd: (cb: (data: { streamId: string; sampleRate: number; ok: boolean }) => void) => on('xyrene:speakStream:end', cb),
    onXyreneSpeakError: (cb: (data: { streamId: string; message: string }) => void) => on('xyrene:speakStream:error', cb),
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
    configureTier2: (config: { apiKey?: string }) => invoke<{ saved: boolean; encrypted: boolean }>('ai:configure-tier2', config),
    // One-shot re-import from C:\dev\.api-keys.env. Useful when the user
    // adds/rotates the key after vault is already running.
    reloadKeysFromFile: () => invoke<{
      ok: boolean
      reason?: string
      message?: string
      saved?: boolean
      encrypted?: boolean
      preview?: string
      tier2Enabled?: boolean
    }>('ai:reload-keys-from-file'),
    getTier2Config: () => invoke<{ configured: boolean; preview: string; encrypted: boolean; tier2Enabled: boolean; disableTier1Tags: boolean }>('ai:get-tier2-config'),
    setDisableTier1Tags: (disabled: boolean) => invoke<{ ok: boolean; disabled: boolean }>('ai:set-disable-tier1-tags', disabled),
    clearTier2: () => invoke<{ cleared: boolean }>('ai:clear-tier2'),

    // Queue management
    queueUntagged: () => invoke('ai:queue-untagged'),
    queueSpecific: (mediaIds: string[]) => invoke('ai:queue-specific', mediaIds),
    queueAll: () => invoke('ai:queue-all'),
    requeueSpecific: (mediaIds: string[]) => invoke<{ requeued: number }>('ai:requeue-specific', mediaIds),
    requeueAll: (args?: { includeApproved?: boolean }) =>
      invoke<{ requeued: number; skippedApproved: number }>('ai:requeue-all', args ?? {}),
    getQueueStatus: () => invoke('ai:queue-status'),

    // Processing control
    start: (options?: { enableTier2?: boolean; concurrency?: number; autoApproveThreshold?: number; batchLimit?: number }) => invoke('ai:start', options),
    pause: () => invoke('ai:pause'),
    resume: () => invoke('ai:resume'),
    stop: () => invoke('ai:stop'),

    // Review queue
    getReviewList: (options?: { limit?: number; offset?: number; status?: 'pending' | 'approved' | 'rejected' | 'all'; sort?: 'newest' | 'uncertainty' }) => invoke('ai:review-list', options),
    approve: (mediaId: string) => invoke('ai:approve', mediaId),
    approveEdited: (mediaId: string, edits: {
      selectedTagIds?: Array<string | number>
      editedTitle?: string
      editedDescription?: string
      originalTitle?: string | null
      originalDescription?: string | null
      newTags?: string[]
    }) => invoke('ai:approve-edited', mediaId, edits),
    reject: (mediaId: string) => invoke('ai:reject', mediaId),
    // Filename ML classifier — bag-of-tokens learned from user's
    // approved-media history. Retrain triggers a full pass over
    // approved rows; status reads the cached model metadata.
    filenameClassifierRetrain: () => invoke<{
      ok: boolean
      samples: number
      tokens: number
      tags: number
    }>('ai:filename-classifier-retrain'),
    filenameClassifierStatus: () => invoke<{
      samples: number
      tokens: number
      tags: number
      trainedAt: string
    }>('ai:filename-classifier-status'),

    // Single-level undo for the most recent approve/reject. Restores
    // the review row + tag links to their pre-decision state. Use
    // undoStatus() to check whether anything can be undone first.
    undoLastReview: () => invoke<{ ok: boolean; mediaId?: string; error?: string }>('ai:undo-last-review'),
    undoStatus: () => invoke<{
      available: boolean
      mediaId?: string
      decisionType?: 'approve' | 'approve-edited' | 'reject'
      ageMs?: number
    }>('ai:undo-status'),
    bulkApprove: () => invoke('ai:bulk-approve'),
    bulkReject: () => invoke<{ rejected: number }>('ai:bulk-reject'),

    // Stats
    getStats: () => invoke('ai:get-stats'),

    // Failed items management
    clearFailed: () => invoke<{ cleared: number }>('ai:clear-failed'),
    retryFailed: () => invoke<{ retried: number }>('ai:retry-failed'),
    // Drop queue rows pointing to deleted media (fixes "queue says 4534
    // but library is 700" inflation).
    purgeOrphans: () => invoke<{ purged: number }>('ai:purge-orphans'),
    // Nuke the entire queue. Use sparingly.
    clearQueue: () => invoke<{ cleared: number }>('ai:clear-queue'),

    // Tag cleanup — three passes: (1) migrate redirects (trans woman → mtf,
    // self-pleasure → masturbation, teen girl → teen+female) preserving
    // media_tag links, (2) delete remaining junk, (3) strip review-cache JSON.
    cleanupTags: () => invoke<{
      removed: number
      removedTags: number
      migratedTags: number
      migratedLinks: number
      cleanedReviews: number
      strippedTagEntries: number
    }>('ai:cleanup-tags'),
    // Re-run Venice on existing frames to produce a fresh title/description
    // without re-extracting frames or re-running tier1. Used by the Review
    // tab "Regenerate" buttons.
    regenerateTitle: (mediaId: string) => invoke<string | null>('ai:regenerate-title', mediaId),
    regenerateDescription: (mediaId: string) => invoke<string | null>('ai:regenerate-description', mediaId),

    // Streaming regen — kicks off an SSE stream from Venice and emits
    // `ai:venice-chunk` IPC events as each token slice arrives. The
    // renderer attaches an `onVeniceChunk` listener (below) and a
    // matching `onVeniceStreamEnd` to drive the typewriter UI.
    regenerateFieldStream: (mediaId: string, field: 'title' | 'description') =>
      invoke<{ streamId: string; result: string | null }>('ai:regenerate-field-stream', { mediaId, field }),
    onVeniceChunk: (cb: (payload: { streamId: string; mediaId: string; field: 'title' | 'description'; delta: string; accumulated: string }) => void) => {
      const handler = (_ev: any, payload: any) => cb(payload)
      ipcRenderer.on('ai:venice-chunk', handler)
      return () => ipcRenderer.removeListener('ai:venice-chunk', handler)
    },
    onVeniceStreamEnd: (cb: (payload: { streamId: string; mediaId: string; field: 'title' | 'description'; result: string | null }) => void) => {
      const handler = (_ev: any, payload: any) => cb(payload)
      ipcRenderer.on('ai:venice-stream-end', handler)
      return () => ipcRenderer.removeListener('ai:venice-stream-end', handler)
    },
    generateCaptions: (args?: { theme?: string; count?: number }) =>
      invoke<Array<{ topText: string; bottomText: string; category: string }>>('ai:generate-captions', args ?? {}),
    suggestPlaylists: (args?: { count?: number }) =>
      invoke<Array<{ name: string; description: string; tagFilters: string[] }>>('ai:suggest-playlists', args ?? {}),
    // Library-wide tagger quality stats — multi-frame consensus health.
    getConsensusStats: () => invoke<{
      total: number
      unanimousVideos: number
      lowAgreementVideos: number
      averageAgreement: number
      topDisagreedTags: Array<{ name: string; singletonRatio: number; total: number }>
      lowAgreementMediaIds: string[]
    }>('ai:get-consensus-stats'),
    // Re-enqueue specific media for AI re-analysis. Used by the "re-analyze
    // low-agreement" action — feeds the IDs from getConsensusStats back
    // through the pipeline at priority 1.
    reanalyzeBatch: (mediaIds: string[]) =>
      invoke<{ enqueued: number }>('ai:reanalyze-batch', mediaIds),
    // Library-wide rejection patterns — what the user has been rejecting
    // most often across all videos. Already injected into the Tier 2
    // prompt as a soft prior; this IPC is for UI display.
    getRejectionPatterns: () => invoke<{
      totalEvents: number
      rejectedTags: Array<{ name: string; count: number }>
      hotRejections: string[]
    }>('ai:get-rejection-patterns'),
    // Spotify-style "today's mix" — time-of-day-aware auto-playlist.
    // Returns 20-30 picks biased toward mood tags appropriate for the
    // current hour. No persistence — fresh on each call.
    dailyMix: (opts?: { hour?: number; targetCount?: number }) => invoke<{
      label: string
      vibe: string
      hour: number
      tagBias: string[]
      items: any[]
    }>('ai:daily-mix', opts ?? {}),

    // Protected tags management
    getProtectedTags: () => invoke<string[]>('ai:get-protected-tags'),
    setProtectedTags: (tags: string[]) => invoke<{ success: boolean }>('ai:set-protected-tags', tags),
    addProtectedTag: (tag: string) => invoke<{ success: boolean }>('ai:add-protected-tag', tag),
    removeProtectedTag: (tag: string) => invoke<{ success: boolean }>('ai:remove-protected-tag', tag),

    // Caption generation - analyze image and suggest captions
    analyzeForCaption: (mediaId: string) => invoke<{ topText: string | null; bottomText: string | null; category: string } | null>('ai:analyze-for-caption', mediaId),

    // Venice AI caption generation (when configured)
    veniceCaption: (mediaId: string, style?: string) => invoke<{ topText: string | null; bottomText: string | null; source?: string; error?: string }>('ai:venice-caption', mediaId, style),
    veniceStatus: () => invoke<{ configured: boolean }>('ai:venice-status'),
    // AI similarity recommender — "More like this" using rich_tag cosine similarity.
    similar: (params: { mediaId: string; limit?: number; matchType?: 'video' | 'image' | 'gif' | 'any' }) =>
      invoke<{
        items: Array<{
          mediaId: string
          filename: string
          thumbPath: string | null
          type: string
          durationSec: number | null
          similarity: number
          sharedTags: string[]
          matchCount: number
        }>
        cachedCount: number
      }>('ai:similar', params),
    similarRefresh: () => invoke<{ success: boolean }>('ai:similar-refresh'),

    // Auto-approve histogram — count of pending review items at each
    // candidate threshold (0.50 → 0.95). Lets the Queue tab show a
    // live "≈X of Y items at this threshold" preview under the slider.
    autoApprovePreview: () => invoke<{
      total: number
      histogram: Array<{ threshold: number; count: number }>
    }>('ai:auto-approve-preview'),

    // miles-deep model presence check — returns whether the 6-class
    // sex-act ONNX classifier file exists at the expected path. The
    // model isn't downloadable (Caffe-origin, no public ONNX), so this
    // is pure status display + install guidance.
    milesDeepStatus: () => invoke<{
      installed: boolean
      expectedPath: string
      sizeBytes: number
    }>('ai:miles-deep-status'),

    // Whisper.cpp transcriber status. Reports install location +
    // user-opt-in flag. Used by the Setup tab to show a badge with
    // toggle. When `enabled` is false the queue skips transcription
    // even when a binary is detected.
    whisperStatus: () => invoke<{
      installed: boolean
      enabled: boolean
      installDir: string | null
      binaryPath: string | null
      modelPath: string | null
      modelName: string | null
    }>('ai:whisper-status'),
    whisperSetEnabled: (enabled: boolean) => invoke<{
      ok: boolean
      enabled: boolean
    }>('ai:whisper-set-enabled', enabled),

    // MoveNet pose detector status. Same shape as miles-deep but the
    // model IS in the standard download list (kicked off by the
    // "Download AI Models" button), so the UI doesn't show install
    // instructions — just the badge.
    poseDetectorStatus: () => invoke<{
      installed: boolean
      expectedPath: string
      sizeBytes: number
    }>('ai:pose-detector-status'),

    // YuNet face detector status. Like pose, this ships through the
    // standard model downloader. Tiny (~340KB) so it's always cheap
    // to keep around.
    faceDetectorStatus: () => invoke<{
      installed: boolean
      expectedPath: string
      sizeBytes: number
    }>('ai:face-detector-status'),

    // NudeNet v3 detector status. Manual install only — the user
    // drops the ONNX at the expected path (mirrors keep moving).
    nudenetStatus: () => invoke<{
      installed: boolean
      expectedPath: string
      sizeBytes: number
    }>('ai:nudenet-status'),
    nudenetDownload: (opts?: { variant?: 'nano' | 'medium' }) => invoke<{
      ok: boolean
      alreadyPresent?: boolean
      sizeBytes?: number
      path?: string
      variant?: 'nano' | 'medium'
      error?: string
    }>('ai:nudenet-download', opts),

    // Gender classifier status (manual install — see Setup card).
    genderClassifierStatus: () => invoke<{
      installed: boolean
      expectedPath: string
      sizeBytes: number
    }>('ai:gender-classifier-status'),

    // Person ReID status (body-feature recognition).
    personReidStatus: () => invoke<{
      installed: boolean
      expectedPath: string
      sizeBytes: number
    }>('ai:person-reid-status'),

    // SFace face recognition status + cluster management.
    sfaceStatus: () => invoke<{
      installed: boolean
      expectedPath: string
      sizeBytes: number
    }>('ai:sface-status'),
    sfaceDownload: () => invoke<{
      ok: boolean
      alreadyPresent?: boolean
      sizeBytes?: number
      path?: string
      error?: string
    }>('ai:sface-download'),
    fpcalcDownload: () => invoke<{
      ok: boolean
      alreadyPresent?: boolean
      sizeBytes?: number
      path?: string
      error?: string
    }>('ai:fpcalc-download'),
    clipBpeStatus: () => invoke<{
      available: boolean
      expectedPath: string
      vocabSize: number | null
    }>('ai:clip-bpe-status'),
    clipBpeDownload: () => invoke<{
      ok: boolean
      alreadyPresent?: boolean
      sizeBytes?: number
      path?: string
      error?: string
    }>('ai:clip-bpe-download'),
    dbCrnnStatus: () => invoke<{
      available: boolean
      detectorPath: string
      recognizerPath: string
      detectorSize: number
      recognizerSize: number
    }>('ai:db-crnn-status'),
    aestheticStatus: () => invoke<{
      installed: boolean
      expectedPath: string
      layerCount: number | null
      inputDim: number | null
    }>('ai:aesthetic-status'),
    deepfakeStatus: () => invoke<{
      installed: boolean
      expectedPath: string
      sizeBytes: number
      inputSize: number
      outputShape: 'softmax-2' | 'sigmoid-1' | 'unknown'
    }>('ai:deepfake-status'),
    aiImageStatus: () => invoke<{
      installed: boolean
      expectedPath: string
      sizeBytes: number
      inputSize: number
      outputShape: 'softmax-2' | 'sigmoid-1' | 'unknown'
    }>('ai:ai-image-status'),
    chromaprintStatus: () => invoke<{
      installed: boolean
      bundled: boolean
      expectedPath: string
      sizeBytes: number
    }>('ai:chromaprint-status'),
    whisperxStatus: () => invoke<{
      configured: boolean
      scriptExists: boolean
      ready: boolean
      startScript: string | null
      autoStart: boolean
      port: number
    }>('ai:whisperx-status'),
    f5ttsStatus: () => invoke<{
      configured: boolean
      scriptExists: boolean
      ready: boolean
      startScript: string | null
      autoStart: boolean
      backend: 'xtts' | 'f5tts'
      port: number
    }>('ai:f5tts-status'),
    extraModelStatus: (kind?: string) => invoke<Array<{
      kind: string
      label: string
      description: string
      stage: 'vision' | 'audio' | 'video' | 'text'
      installed: boolean
      expectedPath: string
      sizeBytes: number
      companions: Array<{ filename: string; installed: boolean; expectedPath: string }>
    }> | {
      kind: string
      label: string
      description: string
      stage: 'vision' | 'audio' | 'video' | 'text'
      installed: boolean
      expectedPath: string
      sizeBytes: number
      companions: Array<{ filename: string; installed: boolean; expectedPath: string }>
    } | null>('ai:extra-model-status', kind),

    // CLIP natural-language media search. Encodes the query through
    // CLIP's text encoder, cosine-matches against every stored image
    // embedding. Empty list when CLIP BPE vocab isn't installed
    // (the placeholder text tokenizer doesn't produce useful rankings).
    clipSearch: (opts: { query: string; limit?: number; minSimilarity?: number }) =>
      invoke<{
        ok: boolean
        error?: string
        hits: Array<{
          mediaId: string
          filename: string | null
          thumbPath: string | null
          similarity: number
          model: string
        }>
      }>('ai:clip-search', opts),
    clipEmbeddingCoverage: () => invoke<{
      stored: number
      total: number
      perModel: Record<string, number>
    }>('ai:clip-embedding-coverage'),
    faceClustersList: (opts?: { onlyUnnamed?: boolean; minSamples?: number; limit?: number }) =>
      invoke<Array<{
        id: string
        name: string | null
        sampleCount: number
        mediaCount: number
        representativeMediaId: string | null
        representativeBbox: string | null
        createdAt: number
        updatedAt: number
      }>>('ai:face-clusters-list', opts ?? {}),
    faceClusterRename: (clusterId: string, name: string) =>
      invoke<{ ok: boolean }>('ai:face-cluster-rename', clusterId, name),
    faceClusterMerge: (fromId: string, intoId: string) =>
      invoke<{ ok: boolean }>('ai:face-cluster-merge', fromId, intoId),
    faceClusterDelete: (clusterId: string) =>
      invoke<{ ok: boolean }>('ai:face-cluster-delete', clusterId),
    faceClusterMedia: (clusterId: string) =>
      invoke<Array<{
        mediaId: string
        filename: string
        thumbPath: string | null
        bbox: { x: number; y: number; w: number; h: number } | null
      }>>('ai:face-cluster-media', clusterId),

    // Body cluster bridge — Person ReID body embeddings cluster
    // separately from faces. These IPCs surface them on the Performers
    // page (bodies tab).
    bodyStats: () => invoke<{
      totalBodies: number
      linkedBodies: number
      unlinkedBodies: number
      distinctVideos: number
      distinctLinkedVideos: number
      distinctUnlinkedVideos: number
    }>('ai:body-stats'),
    bodyClusterCoverage: () => invoke<Array<{
      clusterId: string
      name: string | null
      faceSampleCount: number
      bodyCount: number
      bodyMediaCount: number
    }>>('ai:body-cluster-coverage'),
    bodyUnlinkedList: (opts?: { limit?: number; offset?: number }) =>
      invoke<Array<{
        id: string
        mediaId: string
        frameIdx: number
        bbox: { x: number; y: number; w: number; h: number } | null
        detectionScore: number
        filename: string
        thumbPath: string | null
        createdAt: number
      }>>('ai:body-unlinked-list', opts ?? {}),
    bodyClusterUnlinked: (opts?: { threshold?: number; maxBodies?: number }) =>
      invoke<{
        groups: Array<{
          groupId: string
          size: number
          members: Array<{
            embId: string
            mediaId: string
            frameIdx: number
            bbox: { x: number; y: number; w: number; h: number } | null
            score: number
            filename: string
            thumbPath: string | null
          }>
        }>
        threshold: number
        totalBodies: number
        groupedBodies: number
        singletonCount: number
      }>('ai:body-cluster-unlinked', opts ?? {}),
    bodyLinkToCluster: (opts: { embeddingIds: string[]; targetClusterId?: string | null; newClusterName?: string | null }) =>
      invoke<{ ok: boolean; clusterId?: string; linked?: number; error?: string }>('ai:body-link-to-cluster', opts),
    bodyClusterAutoPersist: (opts?: { threshold?: number; minSize?: number; minMeanSim?: number; maxBodies?: number }) =>
      invoke<{
        ok: boolean
        createdClusters: number
        linkedBodies: number
        totalConsidered: number
        candidatesBelowThreshold?: number
        error?: string
      }>('ai:body-cluster-auto-persist', opts ?? {}),

    // WD Tagger variant — picks which v3 model variant Tier 1 loads
    // (SwinV2 default 467MB / ViT 343MB, comparable accuracy).
    // Takes effect on next Tier 1 init (restart).
    wdVariantGet: () => invoke<'swinv2' | 'vit' | 'pixai' | 'joytag' | 'idolsankaku'>('ai:wd-variant-get'),
    wdVariantSet: (v: 'swinv2' | 'vit' | 'pixai' | 'joytag' | 'idolsankaku') =>
      invoke<{ ok: boolean; variant: 'swinv2' | 'vit' | 'pixai' | 'joytag' | 'idolsankaku' }>('ai:wd-variant-set', v),

    // Multi-hypothesis Venice sampling. 1 = current behavior (single
    // analyze pass), 2-3 = N independent passes that get voted on.
    // Cuts hallucination at N× Venice cost.
    veniceMultiSampleGet: () => invoke<number>('ai:venice-multi-sample-get'),
    veniceMultiSampleSet: (n: number) => invoke<{ ok: boolean; count: number }>('ai:venice-multi-sample-set', n),

    // TpDB (ThePornDB) API key management. Mirrors Venice's IPC shape:
    // getConfig returns a masked preview (never the plaintext), configure
    // accepts a raw key + encrypts it, clear nukes the entry, and the
    // reload-from-file path re-reads C:\dev\.api-keys.env without restart.
    tpdbGetConfig: () => invoke<{
      configured: boolean
      preview: string
      encrypted: boolean
    }>('ai:tpdb-get-config'),
    tpdbConfigure: (config: { apiKey: string }) => invoke<{
      ok: boolean
      saved?: boolean
      encrypted?: boolean
      preview?: string
      error?: string
    }>('ai:tpdb-configure', config),
    tpdbClear: () => invoke<{ cleared: boolean }>('ai:tpdb-clear'),
    tpdbReloadFromFile: () => invoke<{
      ok: boolean
      reason?: string
      message?: string
      saved?: boolean
      encrypted?: boolean
      preview?: string
    }>('ai:tpdb-reload-from-file'),
    // TpDB lookup IPCs — health probe + free-text search + hash lookup.
    // search/find return canonical TpDB scene metadata (performers,
    // studio, tags, etc.) that the Review/Performer UI can use to
    // short-circuit Venice for commercial content.
    tpdbHealth: () => invoke<{ ok: boolean; reason?: string; endpoint?: string }>('ai:tpdb-health'),
    tpdbSearch: (query: string) => invoke<{
      ok: boolean
      reason?: string
      error?: string
      results: any[]
    }>('ai:tpdb-search', query),
    tpdbFindByHash: (hash: string) => invoke<{
      ok: boolean
      reason?: string
      error?: string
      scene?: any
    }>('ai:tpdb-find-by-hash', hash),
    tpdbSearchPerformers: (query: string) => invoke<{
      ok: boolean
      reason?: string
      error?: string
      performers: any[]
    }>('ai:tpdb-search-performers', query),
    tpdbGetPerformer: (id: string) => invoke<{
      ok: boolean
      reason?: string
      error?: string
      performer?: any
    }>('ai:tpdb-get-performer', id),

    // e621 credentials. Needs BOTH api key AND username (Basic auth).
    e621GetConfig: () => invoke<{
      configured: boolean
      hasKey: boolean
      hasUsername: boolean
      preview: string
      username: string
      encrypted: boolean
    }>('ai:e621-get-config'),
    e621Configure: (config: { apiKey?: string; username?: string }) =>
      invoke<{ ok: boolean; preview: string; username: string }>('ai:e621-configure', config),
    e621Clear: () => invoke<{ cleared: boolean }>('ai:e621-clear'),
    e621ReloadFromFile: () => invoke<{
      ok: boolean
      reason?: string
      message?: string
      preview?: string
      username?: string
      encrypted?: boolean
    }>('ai:e621-reload-from-file'),

    // Auto-start / stop the JoyCaption Python sidecar. Idempotent —
    // calling start() while the sidecar is already up just returns
    // ok:true. Mode picks bf16 (default, ~17GB VRAM) vs 4-bit quant
    // (~6-8GB VRAM). Resolves once /health responds.
    joycaptionStart: (args?: { mode?: 'bf16' | '4bit' }) => invoke<{
      ok: boolean
      installPath?: string
      reason?: 'install_not_found' | 'launch_failed'
      message?: string
    }>('ai:joycaption-start', args ?? {}),
    joycaptionStop: () => invoke<{ ok: boolean; wasManaging: boolean }>('ai:joycaption-stop'),

    // JoyCaption status — install detection + /health probe of the sidecar.
    // Used by the AI Tools setup tab to show a badge ("online" / "installed,
    // offline" / "not installed"). JoyCaption supplements Venice's
    // description with a second uncensored caption + booru tag list; it is
    // NOT a Venice fallback (which the user explicitly disallows).
    joycaptionStatus: () => invoke<{
      installed: boolean
      installPath: string | null
      online: boolean
      model?: string
      device?: string
      vramGb?: number
    }>('ai:joycaption-status'),

    // Contact-sheet path for a media item — returns the absolute path of
    // the pre-generated 4×3 frame grid PNG (or null if not yet generated).
    // Auto-fires non-blocking after Tier 2 in the queue.
    contactSheetPath: (mediaId: string) => invoke<string | null>('ai:contact-sheet-path', mediaId),

    // Backfill contact sheets for every video that doesn't yet have one.
    // Returns final stats; progress is streamed via the event below.
    contactSheetBackfill: () => invoke<{
      ok: boolean
      canceled?: boolean
      error?: string
      total: number
      generated: number
      skipped: number
      failed: number
    }>('ai:contact-sheet-backfill'),
    contactSheetBackfillCancel: () => invoke<{ ok: boolean }>('ai:contact-sheet-backfill-cancel'),
    onContactSheetBackfillProgress: (cb: (data: {
      processed: number
      total: number
      generated: number
      skipped: number
      failed: number
      currentId: string
    }) => void) => on('ai:contact-sheet-backfill-progress', cb),

    // One-shot JoyCaption smoke test — caption a single image so the
    // user can verify the sidecar install on the Setup tab. Returns
    // the caption + latency, or an error explaining what's wrong.
    joycaptionTest: (args: { imagePath: string; style?: string }) => invoke<{
      ok: boolean
      caption?: string
      style?: string
      latencyMs?: number
      vramGb?: number
      device?: string
      model?: string
      error?: string
    }>('ai:joycaption-test', args),

    // Load a user-supplied porn-domains blocklist (e.g. Bon-Appetit list).
    // Adds to the bundled set used for filename platform tagging.
    loadDomainsList: (filePath: string) => invoke<{
      loaded: number
      bundled: number
      user: number
      total: number
      userPath: string | null
    }>('ai:load-domains-list', filePath),

    // Current domain-detector counts. Used by the Utilities UI to show
    // the active state without forcing a re-upload.
    domainsStatus: () => invoke<{
      bundled: number
      user: number
      total: number
      userPath: string | null
    }>('ai:domains-status'),

    // Combined file-picker + load — opens the OS file dialog, then
    // ingests the picked file. Returns { canceled: true } if the user
    // closed the dialog without picking anything.
    uploadDomainsList: () => invoke<
      | { canceled: true }
      | {
          canceled: false
          loaded: number
          bundled: number
          user: number
          total: number
          userPath: string | null
        }
    >('ai:upload-domains-list'),

    // Tag category metadata — buckets like action / position / performer /
    // body / kink / camera etc. Used by the Review pane to group suggested
    // tags by semantic category instead of by source model.
    tagCategories: () => invoke<Array<{
      id: string
      label: string
      color: string
      description: string
    }>>('ai:tag-categories'),
    tagCategory: (tagName: string) => invoke<string>('ai:tag-category', tagName),

    // Xyrene watch-along — vision-grounded commentary with TTS in her voice.
    xyreneHealth: () =>
      invoke<{
        voiceServerOnline: boolean
        voiceServerInfo: { status: string; device: string; voices: string[]; cached_voices: string[] } | null
        characterFound: boolean
        characterDir: string
      }>('xyrene:health'),
    xyreneSetCharacterDir: (dir: string) => invoke<{ success: boolean }>('xyrene:setCharacterDir', dir),
    xyreneCacheVoice: () => invoke<{ ok: boolean }>('xyrene:cacheVoice'),
    // Auto-start the local XTTS server (xyrene-portable/xtts-server).
    // Idempotent: returns ok:true if already reachable. Resolves only
    // after /health responds (or times out — first launch can take 30-60s
    // to load the XTTS v2 model).
    xyreneStartServer: (args?: { overrideDir?: string }) =>
      invoke<{ ok: boolean; reason?: 'install_not_found' | 'launch_failed'; message?: string; serverDir?: string }>(
        'xyrene:startServer', args ?? {}
      ),
    xyreneStopServer: () => invoke<{ ok: boolean; wasManaging: boolean }>('xyrene:stopServer'),
    // Voice picker — XTTS server returns the .wav filenames of the voice
    // samples it can clone from. The cloning was already done upstream
    // in xyrene-portable; vault is just letting the user pick which one.
    xyreneListVoices: () => invoke<string[]>('xyrene:listVoices'),
    xyrenePreviewVoice: (args: { voice: string; text?: string }) =>
      invoke<{ base64: string; mime: string }>('xyrene:previewVoice', args),
    // Soundpack browser for the Xyrene Settings panel. Defaults: dedupe
    // sequential variants ("plap_01" / "plap_02" / "plap_03" → one entry
    // with `variants: 3`), filter out junk packs (Music) and junk
    // subcategories (wood / door / glass impacts). Pass {includeJunk:true}
    // or {dedupe:false} to opt out.
    xyreneListSounds: (opts?: { dedupe?: boolean; includeJunk?: boolean }) => invoke<{
      version?: string
      totalFiles?: number
      totalReturned?: number
      totalFiltered?: number
      totalDeduped?: number
      categories: Array<{
        name: string
        total: number
        rawTotal?: number
        files: Array<{
          filename: string
          intensity: number
          tags: string[]
          subcategory: string | null
          variants?: number
        }>
      }>
      meta?: { dedupe: boolean; includeJunk: boolean; junkPacks: string[]; junkSubstrings: string[] }
    }>('xyrene:listSounds', opts ?? {}),
    xyreneGetSettings: () => invoke<{
      charactersDir: string
      cadenceSec: number
      voiceSample: string
      arousalSensitivity: number
      goonWallMasturbationMode: boolean
      voiceCommandsEnabled: boolean
      sounds: Record<string, string[]>
      soundsEnabled: Record<string, boolean>
    }>('xyrene:getSettings'),
    xyreneSetSettings: (patch: any) => invoke<{ success: boolean; settings: any }>('xyrene:setSettings', patch),
    // Copy a soundpack file into Xyrene's curated folder under a renamed
    // canonical filename like `xyreneplap1.wav`. Returns the new path.
    xyreneCurateSound: (args: { sourcePath: string; category: string }) =>
      invoke<{ curatedPath: string; curatedFilename: string; category: string; sourcePath: string }>('xyrene:curateSound', args),
    // Get a file:// URL for a curated sound or soundpack file (settings panel preview).
    xyrenePreviewSoundUrl: (soundPath: string) =>
      invoke<string | null>('xyrene:previewSoundUrl', soundPath),
    // Remove a curated sound + scrub from settings.
    xyreneUncurateSound: (args: { curatedFilename: string; category: string }) =>
      invoke<{ success: boolean }>('xyrene:uncurateSound', args),
    // Loudness/intensity analysis. Curate runs this automatically; the
    // backfill IPC scans every curated folder and analyzes anything missing
    // a sidecar JSON.
    xyreneAnalyzeSound: (args: { curatedFilename: string; category: string }) =>
      invoke<{ rmsDb: number; peakDb: number; durationSec: number; intensity: number; analyzedAt: string }>('xyrene:analyzeSound', args),
    xyreneGetSoundMeta: (args: { curatedFilename: string; category: string }) =>
      invoke<{ rmsDb: number; peakDb: number; durationSec: number; intensity: number; analyzedAt: string } | null>('xyrene:getSoundMeta', args),
    xyreneAnalyzeAllSounds: (opts?: { force?: boolean }) =>
      invoke<{ analyzed: number; skipped: number; failed: number }>('xyrene:analyzeAllSounds', opts),
    // Editable simplified personality files ("her brain"). Sex-focused
    // categories only. User edits are sacred — auto-append (#44) only
    // appends below a marker, never overwrites user-written sections.
    xyreneListBrain: () => invoke<Array<{
      id: string
      label: string
      placeholder: string
      content: string
      exists: boolean
      updatedAt: string | null
      path: string
    }>>('xyrene:listBrain'),
    xyreneWriteBrain: (args: { id: string; content: string }) =>
      invoke<{ success: boolean; path: string; updatedAt: string }>('xyrene:writeBrain', args),
    // Auto-append session learnings to brain files. Caller passes session
    // summary; main process calls Venice for ≤5 short bullets and APPENDS
    // them below an auto-managed separator (user content above stays
    // untouched). Returns count by category.
    xyreneAppendSessionLearnings: (args: {
      mediaIds: string[]
      xyComments: string[]
      userVoiceLines?: string[]
      durationSec: number
    }) => invoke<{ appended: number; perCategory: Record<string, number>; skipped?: string; error?: string }>(
      'xyrene:appendSessionLearnings', args
    ),
    // Read the most-recent session-learning log entries. Each entry has
    // ts, durationSec, mediaCount, commentCount, appended, perCategory.
    xyreneListSessionLearnings: (opts?: { limit?: number }) => invoke<Array<{
      ts: string
      durationSec: number
      mediaCount: number
      commentCount: number
      appended: number
      perCategory: Record<string, number>
    }>>('xyrene:listSessionLearnings', opts ?? {}),
    // One-time bootstrap: extract sex-relevant content from xyrene-portable
    // bibles into the 5 brain categories. Overwrites unless preserveExisting=true.
    xyreneBootstrapBrain: (args?: { preserveExisting?: boolean }) =>
      invoke<{
        success: boolean
        sourceFiles: number
        perCategory: Record<string, { written: boolean; bulletCount: number; preserved: boolean }>
      }>('xyrene:bootstrapBrain', args ?? {}),
    xyreneComment: (args: {
      mediaId: string
      currentTimeSec: number
      durationSec?: number | null
      frameDataUrl: string
      recentComments?: string[]
      speak?: boolean
    }) => invoke<{
      text: string | null
      audioBase64: string | null
      audioMime: string | null
    }>('xyrene:comment', args),

    // Streaming TTS — kicks off /tts_stream. The renderer subscribes to
    // 'xyrene:speakStream:chunk' / ':end' / ':error' via window.api.events
    // to receive PCM chunks tagged with the matching streamId.
    xyreneSpeakStream: (args: { text: string; streamId: string; voice?: string; language?: string }) =>
      invoke<{ ok: boolean; sampleRate: number }>('xyrene:speakStream', args),

    // Calibration learning summary — what the AI has picked up from your review decisions.
    calibrationSummary: () => invoke<{
      summary: { tagsTracked: number; totalSamples: number; totalApproved: number; totalRejected: number }
      topApproved: Array<{
        tagName: string; source: string;
        sampleCount: number; meanConfidence: number;
        approvedCount: number; rejectedCount: number; approvalRatio: number; lastSeen: string
      }>
      topRejected: Array<{
        tagName: string; source: string;
        sampleCount: number; meanConfidence: number;
        approvedCount: number; rejectedCount: number; approvalRatio: number; lastSeen: string
      }>
    }>('ai:calibration-summary'),

    // Co-occurrence suggestions — "tags you might also want" based on
    // which tags co-occur with the current selection in approved media.
    cooccurrenceSuggest: (args: { selected: string[]; exclude?: string[]; limit?: number }) =>
      invoke<Array<{ name: string; probability: number; jointCount: number; totalCount: number }>>(
        'ai:cooccurrence-suggest', args
      ),

    // Tags rejected ≥N times with 0 approvals — candidates for protected list.
    protectCandidates: (args?: { minRejections?: number }) =>
      invoke<Array<{
        tagName: string; source: string;
        approvedCount: number; rejectedCount: number; approvalRatio: number; sampleCount: number; meanConfidence: number; lastSeen: string
      }>>('ai:protect-candidates', args ?? {}),

    // Per-source rejection rates for the confidence histogram widget.
    sourceRejectionRates: () =>
      invoke<Array<{ source: string; approved: number; rejected: number; ratio: number }>>('ai:source-rejection-rates'),

    // Backfill calibration from existing ai_analysis_results history.
    // Use when calibration summary shows 0 stats despite having
    // reviewed items (e.g. recovering from a bug that lost samples).
    backfillCalibration: () => invoke<{
      before: { tagsTracked: number; totalSamples: number; totalApproved: number; totalRejected: number }
      after: { tagsTracked: number; totalSamples: number; totalApproved: number; totalRejected: number }
      rowsProcessed: number
      samplesRecorded: number
      approvalsRecorded: number
      rejectionsRecorded: number
    }>('ai:backfill-calibration'),
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // DLNA TV STREAMING
  // ═══════════════════════════════════════════════════════════════════════════
  dlna: {
    // Device discovery
    startDiscovery: () => invoke<{ success: boolean; error?: string }>('dlna:startDiscovery'),
    stopDiscovery: () => invoke<{ success: boolean; error?: string }>('dlna:stopDiscovery'),
    getDevices: () => invoke<Array<{
      id: string
      name: string
      host: string
      type: 'dlna' | 'chromecast'
      status: 'idle' | 'playing' | 'paused' | 'buffering'
    }>>('dlna:getDevices'),

    // Manual connection by IP
    connectManual: (ip: string) => invoke<boolean>('dlna:connectManual', ip),

    // Select device (set as active without casting)
    selectDevice: (deviceId: string) => invoke<boolean>('dlna:selectDevice', deviceId),

    // Casting
    cast: (deviceId: string, mediaPath: string, options?: {
      title?: string
      type?: 'video' | 'image'
      autoplay?: boolean
      startPosition?: number
    }) => invoke<{ success: boolean; error?: string }>('dlna:cast', deviceId, mediaPath, options),

    // Playback controls
    play: () => invoke<{ success: boolean; error?: string }>('dlna:play'),
    pause: () => invoke<{ success: boolean; error?: string }>('dlna:pause'),
    stop: () => invoke<{ success: boolean; error?: string }>('dlna:stop'),
    seek: (position: number) => invoke<{ success: boolean; error?: string }>('dlna:seek', position),
    setVolume: (volume: number) => invoke<{ success: boolean; error?: string }>('dlna:setVolume', volume),

    // Status
    getStatus: () => invoke<{
      deviceId: string
      state: 'idle' | 'playing' | 'paused' | 'buffering' | 'stopped'
      currentTime: number
      duration: number
      volume: number
      muted: boolean
      mediaPath: string | null
    }>('dlna:getStatus'),
    isCasting: () => invoke<boolean>('dlna:isCasting'),
    getActiveDevice: () => invoke<{
      id: string
      name: string
      host: string
      type: 'dlna' | 'chromecast'
      status: 'idle' | 'playing' | 'paused' | 'buffering'
    } | null>('dlna:getActiveDevice'),

    // Queue management
    setQueue: (items: Array<{
      mediaId: string
      path: string
      title: string
      duration?: number
    }>) => invoke<{ success: boolean; error?: string }>('dlna:setQueue', items),
    addToQueue: (item: {
      mediaId: string
      path: string
      title: string
      duration?: number
    }) => invoke<{ success: boolean; error?: string }>('dlna:addToQueue', item),
    clearQueue: () => invoke<{ success: boolean; error?: string }>('dlna:clearQueue'),
    getQueue: () => invoke<{
      items: Array<{
        mediaId: string
        path: string
        title: string
        duration?: number
      }>
      currentIndex: number
      shuffleEnabled: boolean
      repeatMode: 'none' | 'one' | 'all'
      currentItem: {
        mediaId: string
        path: string
        title: string
        duration?: number
      } | null
    }>('dlna:getQueue'),
    playNext: () => invoke<{ success: boolean; error?: string }>('dlna:playNext'),
    playPrevious: () => invoke<{ success: boolean; error?: string }>('dlna:playPrevious'),
    playAtIndex: (index: number) => invoke<{ success: boolean; error?: string }>('dlna:playAtIndex', index),
    setShuffle: (enabled: boolean) => invoke<{ success: boolean; error?: string }>('dlna:setShuffle', enabled),
    setRepeat: (mode: 'none' | 'one' | 'all') => invoke<{ success: boolean; error?: string }>('dlna:setRepeat', mode),
    reorderQueue: (fromIndex: number, toIndex: number) => invoke<{ success: boolean; error?: string }>('dlna:reorderQueue', fromIndex, toIndex),
    removeFromQueue: (index: number) => invoke<{ success: boolean; error?: string }>('dlna:removeFromQueue', index),

    // Event subscriptions
    onDeviceFound: (cb: (device: any) => void) => on('dlna:deviceFound', cb),
    onStatusUpdate: (cb: (status: any) => void) => on('dlna:statusUpdate', cb),
    onDiscoveryStarted: (cb: () => void) => on('dlna:discoveryStarted', cb),
    onDiscoveryStopped: (cb: () => void) => on('dlna:discoveryStopped', cb),
    onQueueUpdated: (cb: (queue: any) => void) => on('dlna:queueUpdated', cb),
    onQueueEnded: (cb: () => void) => on('dlna:queueEnded', cb),
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // HARDWARE ENCODER - GPU-accelerated video encoding
  // ═══════════════════════════════════════════════════════════════════════════
  encoder: {
    // Detect available hardware encoders (NVENC, QSV, VAAPI, AMF)
    detect: () => invoke<{
      success: boolean
      error?: string
      encoders: Array<{
        id: string
        name: string
        available: boolean
        description: string
      }>
    }>('encoder:detect'),

    // Get cached list of encoders
    getEncoders: () => invoke<Array<{
      id: string
      name: string
      available: boolean
      description: string
    }>>('encoder:getEncoders'),

    // Get/set preferred encoder
    getPreferred: () => invoke<string>('encoder:getPreferred'),
    setPreferred: (encoder: string) => invoke<{ success: boolean; error?: string }>('encoder:setPreferred', encoder),
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // SHELL
  // ═══════════════════════════════════════════════════════════════════════════
  shell: {
    openExternal: (url: string) => shell.openExternal(url),
    openPath: (p: string) => invoke('shell:openPath', p),
    showItemInFolder: (p: string) => invoke('shell:showItemInFolder', p),
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // MOBILE SYNC SERVICE
  // ═══════════════════════════════════════════════════════════════════════════
  mobileSync: {
    // Server control
    start: (port?: number) => invoke<{
      success: boolean
      port?: number
      addresses?: string[]
      error?: string
    }>('mobileSync:start', port),
    stop: () => invoke<{ success: boolean; error?: string }>('mobileSync:stop'),
    getStatus: () => invoke<{
      running: boolean
      port: number
      addresses: string[]
      pairedDevices: number
    }>('mobileSync:getStatus'),

    // Cross-device access (#26) — same server, surfaced for PC-to-PC
    // streaming over LAN or Tailscale.
    getAccessUrls: () => invoke<{
      running: boolean
      port: number
      lan: string[]
      tailscale: string[]
      other: string[]
    }>('crossDevice:getAccessUrls'),
    generateAccessToken: (deviceLabel?: string) => invoke<{
      id: string
      token: string
      deviceId: string
    }>('crossDevice:generateToken', deviceLabel),

    // Device pairing
    generatePairingCode: () => invoke<{
      code: string
      expiresAt: number
      qrData: string
      error?: string
    }>('mobileSync:generatePairingCode'),
    getPairedDevices: () => invoke<Array<{
      id: string
      name: string
      platform: 'ios' | 'android'
      pairedAt: number
      lastSeen: number
    }>>('mobileSync:getPairedDevices'),
    unpairDevice: (deviceId: string) => invoke<{ success: boolean }>('mobileSync:unpairDevice', deviceId),

    // Event subscriptions
    onStarted: (cb: (data: { port: number; addresses: string[] }) => void) => on('mobileSync:started', cb),
    onStopped: (cb: () => void) => on('mobileSync:stopped', cb),
    onDevicePaired: (cb: (device: any) => void) => on('mobileSync:devicePaired', cb),
    onDeviceUnpaired: (cb: (device: any) => void) => on('mobileSync:deviceUnpaired', cb),
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // CLOUDFLARE TUNNEL — one-click NAT-traversal (#189)
  // ═══════════════════════════════════════════════════════════════════════════
  network: {
    cloudflareTunnelStart: (args?: { port?: number }) =>
      invoke<{ ok: boolean; alreadyRunning?: boolean; url?: string | null; port?: number; error?: string }>(
        'network:cloudflare-tunnel-start', args
      ),
    cloudflareTunnelStop: () =>
      invoke<{ ok: boolean; wasRunning?: boolean; error?: string }>('network:cloudflare-tunnel-stop'),
    cloudflareTunnelStatus: () =>
      invoke<{ running: boolean; url: string | null }>('network:cloudflare-tunnel-status'),
    zerotierStatus: () =>
      invoke<{
        installed: boolean
        networks: any[]
        addresses: Array<{ ip: string; network: string; networkName: string }>
        error?: string
      }>('network:zerotier-status'),
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // URL DOWNLOADER - Download videos from URLs (yt-dlp)
  // ═══════════════════════════════════════════════════════════════════════════
  urlDownloader: {
    checkAvailability: () => invoke<{ available: boolean; version?: string; error?: string }>('urlDownloader:checkAvailability'),
    addDownload: (url: string, options?: { quality?: string; audioOnly?: boolean }) => invoke<{
      success: boolean
      item?: {
        id: string
        url: string
        title: string
        status: string
      }
      error?: string
    }>('urlDownloader:addDownload', url, options),
    getDownloads: () => invoke<Array<{
      id: string
      url: string
      title: string
      status: 'queued' | 'downloading' | 'processing' | 'completed' | 'error'
      progress: number
      speed: string
      eta: string
      outputPath: string | null
      error: string | null
      thumbnailUrl: string | null
      fileSize: string | null
      duration: string | null
      createdAt: number
      source: 'desktop' | 'mobile'
    }>>('urlDownloader:getDownloads'),
    cancelDownload: (id: string) => invoke<{ success: boolean }>('urlDownloader:cancelDownload', id),
    removeDownload: (id: string) => invoke<{ success: boolean }>('urlDownloader:removeDownload', id),
    clearCompleted: () => invoke<{ cleared: number }>('urlDownloader:clearCompleted'),
    getDownloadDir: () => invoke<string>('urlDownloader:getDownloadDir'),
    setDownloadDir: (dir: string) => invoke<{ success: boolean }>('urlDownloader:setDownloadDir', dir),
    openDownload: (id: string) => invoke<{ success: boolean; error?: string }>('urlDownloader:openDownload', id),
    importToLibrary: (id: string) => invoke<{ success: boolean; mediaId?: string; error?: string }>('urlDownloader:importToLibrary', id),

    // Event subscriptions
    onAdded: (cb: (item: any) => void) => on('urlDownloader:added', cb),
    onStarted: (cb: (item: any) => void) => on('urlDownloader:started', cb),
    onProgress: (cb: (item: any) => void) => on('urlDownloader:progress', cb),
    onCompleted: (cb: (item: any) => void) => on('urlDownloader:completed', cb),
    onError: (cb: (item: any) => void) => on('urlDownloader:error', cb),
    onCancelled: (cb: (item: any) => void) => on('urlDownloader:cancelled', cb),
    // Called when notification action clicked to open URL downloader
    onOpenRequested: (cb: () => void) => on('vault-open-url-downloader', cb),
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // VISUAL SIMILARITY - Find similar content using perceptual hashing
  // ═══════════════════════════════════════════════════════════════════════════
  similar: {
    // Find similar media by perceptual hash
    find: (mediaId: string, options?: { minSimilarity?: number; limit?: number; sameTypeOnly?: boolean }) =>
      invoke<Array<{
        mediaId: string
        filename: string
        thumbPath: string | null
        type: string
        similarity: number
        matchType: 'exact' | 'very_similar' | 'similar' | 'somewhat_similar'
      }>>('similar:find', mediaId, options),

    // Find all groups of similar content
    findAllGroups: (options?: { minSimilarity?: number; minGroupSize?: number }) =>
      invoke<Array<{
        groupId: string
        items: Array<{
          mediaId: string
          filename: string
          thumbPath: string | null
          type: string
          similarity: number
        }>
        count: number
      }>>('similar:findAllGroups', options),

    // Visual (perceptual) duplicates — content_analyzer-style aHash. Catches
    // re-encodes, crops, watermarks. Separate from byte-hash duplicates.
    hashCoverage: () => invoke<{ hashed: number; total: number }>('visualDuplicates:hashCoverage'),
    computeAllHashes: (opts?: { onlyUnhashed?: boolean }) =>
      invoke<{ hashed: number; skipped: number }>('visualDuplicates:computeAllHashes', opts),
    abortHashing: () => invoke<{ ok: boolean }>('visualDuplicates:abort'),
    findVisualGroups: (opts?: { maxDistance?: number }) =>
      invoke<{
        maxDistance: number
        groups: Array<{
          representativeId: string
          members: Array<{
            mediaId: string
            filename: string
            thumbPath: string | null
            sizeBytes: number | null
            width: number | null
            height: number | null
            distance: number
          }>
        }>
      }>('visualDuplicates:findGroups', opts),
    hashOne: (mediaId: string) =>
      invoke<{ ok: boolean; phash?: string; error?: string }>('visualDuplicates:hashOne', mediaId),

    // Multi-frame video fingerprint — same surface as the single-frame
    // visual dedup above, but for videos that the keyframe phash misses
    // (re-encodes where the dominant frame shifted).
    mfCoverage: () => invoke<{ hashed: number; total: number }>('visualDuplicates:mfCoverage'),
    mfComputeAll: (opts?: { onlyUnhashed?: boolean }) =>
      invoke<{ hashed: number; skipped: number }>('visualDuplicates:mfComputeAll', opts),
    mfFindGroups: (opts?: { maxDistance?: number; minMatches?: number }) =>
      invoke<{
        maxDistance: number
        minMatches: number
        groups: Array<{
          representativeId: string
          members: Array<{
            mediaId: string
            filename: string
            thumbPath: string | null
            sizeBytes: number | null
            width: number | null
            height: number | null
            distance: number
          }>
        }>
      }>('visualDuplicates:mfFindGroups', opts),
    mfHashOne: (mediaId: string) =>
      invoke<{ ok: boolean; fingerprint?: { hashes: string[]; validFrameCount: number; timestampsPct: number[] }; error?: string }>('visualDuplicates:mfHashOne', mediaId),

    // Chromaprint audio-fingerprint dedup. Catches re-encodes that share
    // the audio track but differ visually. Requires fpcalc on PATH or in
    // resources/bin/.
    cpCoverage: () => invoke<{ hashed: number; total: number }>('visualDuplicates:cpCoverage'),
    cpComputeAll: (opts?: { onlyUnhashed?: boolean }) =>
      invoke<{ hashed: number; skipped: number }>('visualDuplicates:cpComputeAll', opts),
    cpFindGroups: (opts?: { threshold?: number }) =>
      invoke<{
        threshold: number
        groups: Array<{
          representativeId: string
          members: Array<{
            mediaId: string
            filename: string
            thumbPath: string | null
            sizeBytes: number | null
            width: number | null
            height: number | null
            distance: number
          }>
        }>
      }>('visualDuplicates:cpFindGroups', opts),
    cpHashOne: (mediaId: string) =>
      invoke<{ ok: boolean; fingerprint?: { d: number; f: string }; error?: string }>('visualDuplicates:cpHashOne', mediaId),

    // Find exact duplicates by file hash
    findDuplicates: () =>
      invoke<Array<{
        groupId: string
        items: Array<{
          mediaId: string
          filename: string
          thumbPath: string | null
          type: string
          similarity: number
        }>
        count: number
      }>>('similar:findDuplicates'),

    // Get "more like this" recommendations
    moreLikeThis: (mediaId: string, limit?: number) =>
      invoke<Array<{
        mediaId: string
        filename: string
        thumbPath: string | null
        type: string
        similarity: number
      }>>('similar:moreLikeThis', mediaId, limit),

    // Get duplicate statistics
    getStats: () =>
      invoke<{
        duplicateGroups: number
        totalDuplicates: number
        potentialSavingsBytes: number
      }>('similar:getStats'),

    // Compute hash for a single media item
    computeHash: (mediaId: string) =>
      invoke<string | null>('similar:computeHash', mediaId),

    // Batch compute hashes for unhashed media
    batchComputeHashes: (limit?: number) =>
      invoke<{ processed: number; failed: number }>('similar:batchComputeHashes', limit),

    // Get hash computation statistics
    getHashStats: () =>
      invoke<{
        totalMedia: number
        hashedMedia: number
        unhashed: number
        percentComplete: number
      }>('similar:getHashStats'),

    // Get list of unhashed media
    getUnhashed: (limit?: number) =>
      invoke<any[]>('similar:getUnhashed', limit),

    // Compare two specific media items
    compare: (mediaId1: string, mediaId2: string) =>
      invoke<{
        similar: boolean
        similarity: number
        distance: number
      } | null>('similar:compare', mediaId1, mediaId2),
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // PMV EDITOR - Music video compilation tools
  // ═══════════════════════════════════════════════════════════════════════════
  pmv: {
    // Auto-PMV: tag → AI-driven project. Returns ProjectClip-like list the editor loads.
    autoGenerate: (options: {
      tags: string[]
      targetDurationSec?: number
      bpm?: number
      beatsPerClip?: number
      maxClipSources?: number
      generateCaptions?: boolean
      videoActiveWindow?: number
    }) => invoke<{
      bpm: number
      beatsPerClip: number
      totalBeats: number
      totalDurationSec: number
      clips: Array<{
        mediaId: string
        filename: string
        path: string
        startSec: number
        endSec: number
        beatStart: number
        beatEnd: number
        reason: string
        caption: string | null
        score: number
      }>
      meta: {
        tags: string[]
        candidatesConsidered: number
        clipsGenerated: number
        captionsGenerated: number
        captionsRequested: number
        warnings: string[]
      }
    }>('pmv:autoGenerate', options),

    selectMusic: () => invoke<string | null>('pmv:selectMusic'),
    selectVideos: () => invoke<string[]>('pmv:selectVideos'),
    getVideoInfo: (path: string) => invoke<{ duration: number; width: number; height: number }>('pmv:getVideoInfo', path),
    getVideoThumb: (path: string) => invoke<string | null>('pmv:getVideoThumb', path),
    getAudioInfo: (path: string) => invoke<{ duration: number }>('pmv:getAudioInfo', path),
    // Audio Burner - extract audio from video
    selectVideoForAudio: () => invoke<string | null>('pmv:selectVideoForAudio'),
    extractAudio: (videoPath: string) => invoke<{ success: boolean; path?: string; duration?: number; error?: string }>('pmv:extractAudio', videoPath),
    export: (projectData: {
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
    }) => invoke<{ success: boolean; outputPath?: string; error?: string }>('pmv:export', projectData),
    cancelExport: () => invoke<{ success: boolean; error?: string }>('pmv:cancelExport'),
    onExportProgress: (cb: (progress: {
      status: 'idle' | 'preparing' | 'encoding' | 'finalizing' | 'complete' | 'error'
      progress: number
      currentStep?: string
      error?: string
      outputPath?: string
    }) => void) => on('pmv:exportProgress', cb),
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // STASH INTEROP
  // ═══════════════════════════════════════════════════════════════════════════
  stash: {
    /** Import every .stash.json sidecar found next to media files.
     *  Applies tags / performers (as performer:NAME tags) / studio
     *  (as studio:NAME tag). Idempotent. */
    importSidecars: () => invoke<{
      ok: boolean
      scanned: number
      matched: number
      tagsImported: number
      performersImported: number
      titlesSet: number
      descriptionsSet: number
      studiosSet: number
    }>('stash:import-sidecars'),

    /** Write a .stash.json sidecar next to every media file. */
    exportSidecars: () => invoke<{
      ok: boolean
      written: number
      failed: number
      total: number
    }>('stash:export-sidecars'),
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // NFO SIDECAR EXPORT (Kodi / Jellyfin / Emby compat)
  // ═══════════════════════════════════════════════════════════════════════════
  nfo: {
    /** Write a single <basename>.nfo next to one media file. */
    exportOne: (mediaId: string) =>
      invoke<{ ok: boolean; path?: string; error?: string }>('nfo:export-one', mediaId),
    /** Walk every media row and write NFO sidecars next to each file. */
    exportAll: () =>
      invoke<{
        scanned: number
        written: number
        failed: number
        skipped: number
        errors: string[]
      }>('nfo:export-all'),
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // BOORU (Rule 34 viewer)
  // ═══════════════════════════════════════════════════════════════════════════
  booru: {
    /** @deprecated Use search() — rule34.xxx now requires auth.
     *  Kept for back-compat with anyone who has an API key. */
    searchRule34: (args: { tags: string; perPage?: number; page?: number }) =>
      invoke<{
        ok: boolean
        error?: string
        posts: Array<any>
        hasMore: boolean
        page: number
      }>('booru:search-rule34', args),

    /** Single-source search. Pick which booru via `source`. e621 needs
     *  credentials (configured automatically from .api-keys.env);
     *  safebooru/yande.re/konachan work anonymously; rule34 needs
     *  auth (left in for when you add a key). */
    search: (args: {
      source: 'e621' | 'rule34' | 'safebooru' | 'yande.re' | 'konachan' | 'tbib' | 'xbooru' | 'hypnohub' | 'eporner' | 'redtube' | 'pornhub' | 'xnxx'
      tags: string
      perPage?: number
      page?: number
    }) => invoke<{
      ok: boolean
      error?: string
      posts: Array<{
        id: number
        file_url: string
        preview_url: string
        sample_url: string
        tags: string
        rating: string
        score: number
        source: string
        width: number
        height: number
      }>
      hasMore: boolean
      page: number
    }>('booru:search', args),

    /** Multi-source fan-out: query several boorus in parallel, merge
     *  + sort by score. Each post comes back tagged with source_booru
     *  so the UI can show a badge. */
    searchMulti: (args: {
      sources: Array<'e621' | 'rule34' | 'safebooru' | 'yande.re' | 'konachan' | 'tbib' | 'xbooru' | 'hypnohub' | 'eporner' | 'redtube' | 'pornhub' | 'xnxx'>
      tags: string
      perPage?: number
      page?: number
    }) => invoke<{
      ok: boolean
      posts: Array<any>
      errors: Array<{ source: string; error: string }>
      hasMore: boolean
      page: number
    }>('booru:search-multi', args),

    /** Resolve a pasted tube URL into a playable video (direct MP4 or
     *  embed URL). Returns { unresolved: true } when the URL isn't
     *  recognized — caller should fall through to yt-dlp. */
    resolveUrl: (url: string) => invoke<{
      unresolved?: boolean
      error?: string
      videoUrl?: string
      videoLowUrl?: string | null
      thumbUrl?: string | null
      source?: 'xnxx' | 'embed' | 'unknown'
      sourceUrl: string
    }>('booru:resolve-url', url),

    /** #119 — Civitai-only: pivot search by model / version ID. Returns
     *  results from the same /api/v1/images endpoint but filtered to a
     *  specific checkpoint or LoRA. Used by the lightbox "More from
     *  this model" action. */
    civitaiByModel: (args: {
      modelId?: number
      modelVersionId?: number
      perPage?: number
      page?: number
    }) =>
      invoke<{
        ok: boolean
        error?: string
        posts: any[]
        hasMore: boolean
        page: number
      }>('booru:civitai-by-model', args),

    /** Download a booru post to the user's first media directory.
     *  The scanner picks it up automatically within a few seconds. */
    downloadToLibrary: (post: any) =>
      invoke<{
        ok: boolean
        error?: string
        savedPath?: string
        filename?: string
        bytes?: number
      }>('booru:download-to-library', post),

    /** Walk every media dir for .boorutags.json sidecars and re-run
     *  tag normalization. Use after canonical-tags or Venice prompt
     *  changes — applies the latest rules to all past Browse saves. */
    backfillTags: (opts?: { limit?: number; useVenice?: boolean }) =>
      invoke<{
        ok: boolean
        scanned: number
        updated: number
        failed: number
        veniceCalls: number
      }>('booru:backfill-tags', opts ?? {}),
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
