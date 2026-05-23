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

// v2.7 — Some channels (notably 'vault:changed') are broadcast from BOTH
// the main process (after a DB write) AND from the renderer itself (after
// a renderer-only state change like blacklist toggling, focus mode, etc.).
// `onBoth` listens to the IPC channel AND a parallel window CustomEvent
// of the same name so callers don't have to subscribe twice.
function onBoth<T = unknown>(channel: string, cb: (payload: T) => void) {
  const ipcListener = (_ev: Electron.IpcRendererEvent, payload: T) => cb(payload)
  ipcRenderer.on(channel, ipcListener)
  const winListener = (ev: Event) => cb((ev as CustomEvent<T>).detail as T)
  window.addEventListener(channel, winListener)
  return () => {
    ipcRenderer.removeListener(channel, ipcListener)
    window.removeEventListener(channel, winListener)
  }
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
    sound: {
      update: (patch: any) => invoke('settings:sound:update', patch),
    },
    xyrene: {
      update: (patch: any) => invoke('settings:xyrene:update', patch),
    },
    performance: {
      update: (patch: any) => invoke('settings:performance:update', patch),
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
    // Lightweight "ids only" search — used by Library's Select All
    // Matches so we don't ship 4,827 row payloads over IPC just to
    // pull out the id strings.
    ids: (opts: any) => invoke<{ ids: string[]; total: number }>('media:ids', opts),
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
    getPlayableUrlBatch: (mediaIds: string[], forceTranscode?: boolean) =>
      invoke<Record<string, string | null>>('media:getPlayableUrlBatch', mediaIds, forceTranscode),
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
    // Bulk operations — Library's "select all + tag / feature-less /
    // deny / delete" used to issue one IPC per id (4,800+ round trips on
    // the user's collection). These collapse it into a single call with
    // a SQL transaction on the main side.
    bulkAddTag: (mediaIds: string[], tag: string) =>
      invoke<{ ok: boolean; processed: number; errors: string[]; tag?: string }>('media:bulk-add-tag', { mediaIds, tag }),
    bulkFeatureLess: (mediaIds: string[], value: boolean) =>
      invoke<{ ok: boolean; processed: number; errors: string[]; value?: boolean }>('media:bulk-feature-less', { mediaIds, value }),
    bulkDenial: (mediaIds: string[], durationMin: number) =>
      invoke<{ ok: boolean; processed: number; errors: string[]; durationMin?: number }>('media:bulk-denial', { mediaIds, durationMin }),
    bulkDelete: (mediaIds: string[]) =>
      invoke<{ ok: boolean; processed: number; errors: string[] }>('media:bulk-delete', { mediaIds }),
    // "Mark all selected as watched" — bulk-record-view in one txn.
    bulkRecordView: (mediaIds: string[]) =>
      invoke<{ ok: boolean; processed: number; error?: string }>('media:bulk-record-view', { mediaIds }),
    topByAesthetic: (limit?: number) =>
      invoke<{
        ok: boolean
        items: Array<{ id: string; filename: string; thumbPath: string | null; type: string; aestheticScore: number }>
        error?: string
      }>('media:topByAesthetic', { limit }),
    scoreHistograms: () =>
      invoke<{
        ok: boolean
        aesthetic: number[] | null
        deepfake: number[] | null
        aiImage: number[] | null
        error?: string
      }>('media:scoreHistograms'),
    // Render the same proportional frame from a video (default 50%) —
    // used by the Duplicates panel so the user can visually verify that
    // two videos are actually duplicates instead of trusting their
    // (often very different) auto-generated thumbnails.
    extractFrameAt: (args: { mediaId: string; ratio?: number; timestampSec?: number; width?: number }) =>
      invoke<{ ok: boolean; path?: string; timestampSec?: number; error?: string }>('media:extractFrameAt', args),
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
    // #120 — Watermark crop heuristic. Analyzes top/bottom 15% bands,
    // crops uniform-color / high-contrast banner regions.
    cropWatermarks: (mediaId: string) =>
      invoke<{
        ok: boolean
        cropped: boolean
        width?: number
        height?: number
        decision?: { cropTop: number; cropBottom: number; rationale: string }
        error?: string
      }>('media:cropWatermarks', mediaId),

    // #110 — Batch MD5 backfill. Walks every media row missing md5,
    // streams the file through createHash, persists. Idempotent.
    backfillMd5: () =>
      invoke<{ ok: boolean; hashed?: number; skipped?: number; total?: number; error?: string }>('media:backfillMd5'),

    // #164 — Loudness measurement / cache. measureLufs is heavy
    // (5-30s ffmpeg pass); getLufs is a fast cached lookup.
    measureLufs: (mediaId: string) =>
      invoke<{ ok: boolean; lufs?: number; cached?: boolean; full?: any; error?: string }>('media:measureLufs', mediaId),
    getLufs: (mediaId: string) =>
      invoke<{ ok: boolean; lufs: number | null; error?: string }>('media:getLufs', mediaId),

    // #197 — Funscript sidecar lookup. Returns ok:false with no error
    // when the file simply isn't there; ok:true with actions[] when it is.
    loadFunscript: (mediaId: string) =>
      invoke<{
        ok: boolean
        path?: string
        version?: string | null
        inverted?: boolean
        actionCount?: number
        actions?: Array<{ at: number; pos: number }>
        error?: string
      }>('media:loadFunscript', mediaId),
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
    // Per-tag source/confidence derived from the staged AI analysis
    // row (tier1 ONNX / tier2 Venice / synonym match) — used by the
    // tag-source explainability tooltip in chips.
    getSources: (mediaId: string) => invoke<
      Record<string, { source: 'tier1' | 'tier2' | 'synonym' | 'user'; confidence?: number }>
    >('tags:getSources', mediaId),
    setForMedia: (mediaId: string, tags: string[]) => invoke('tags:setForMedia', mediaId, tags),
    addToMedia: (mediaId: string, tag: string) => invoke('tags:addToMedia', mediaId, tag),
    removeFromMedia: (mediaId: string, tag: string) => invoke('tags:removeFromMedia', mediaId, tag),
    ensure: (tag: string) => invoke('tags:ensure', tag),
    create: (tagName: string) => invoke('tags:create', tagName),
    delete: (tagName: string) => invoke('tags:delete', tagName),
    // #103 — Tag implications graph: ancestor tags auto-applied when
    // a child tag is added to media. Get returns the whole JSON map.
    implicationsGet: () => invoke<Record<string, string[]>>('tags:implicationsGet'),
    implicationsSave: (map: Record<string, string[]>) =>
      invoke<{ ok: boolean; error?: string }>('tags:implicationsSave', map),
    // #102 — Tag siblings (bidirectional aliases). Aliases get rewritten
    // to canonical at addToMedia time so the DB never stores duplicates.
    siblingsGet: () => invoke<Record<string, string[]>>('tags:siblingsGet'),
    siblingsSave: (map: Record<string, string[]>) =>
      invoke<{ ok: boolean; error?: string }>('tags:siblingsSave', map),
    // #133 — Merge a curated set of content-warning implication edges
    // (blood → cw:violence, etc.) into the user's tag-implications.json
    loadDefaultCwImplications: () =>
      invoke<{ ok: boolean; added: number; error?: string }>('tags:loadDefaultCwImplications'),
    // #155 — Stacks / versions IPC bridges
    stacksCreate: (args: { originalId: string; memberIds: string[] }) =>
      invoke<{ ok: boolean; stackId?: string; memberCount?: number; error?: string }>('stacks:create', args),
    stacksAdd: (args: { stackId: string; mediaIds: string[] }) =>
      invoke<{ ok: boolean; added?: number; error?: string }>('stacks:add', args),
    stacksRemove: (mediaId: string) =>
      invoke<{ ok: boolean; error?: string }>('stacks:remove', mediaId),
    stacksMembers: (stackId: string) =>
      invoke<{ ok: boolean; members: any[]; error?: string }>('stacks:members', stackId),
    // #156 — Relationships graph: user-drawn or inferred links between media
    relationshipsList: (mediaId: string) =>
      invoke<{ ok: boolean; outgoing: any[]; incoming: any[]; error?: string }>('relationships:list', mediaId),
    relationshipsCreate: (args: {
      sourceId: string
      targetId: string
      kind: 'parent' | 'child' | 'alternate' | 'companion'
      notes?: string
    }) => invoke<{ ok: boolean; id?: string; error?: string }>('relationships:createSimple', args),
    relationshipsDelete: (id: string) =>
      invoke<{ ok: boolean; error?: string }>('relationships:deleteSimple', id),
    relationshipsInfer: (mediaId: string) =>
      invoke<{ ok: boolean; candidates: any[]; error?: string }>('relationships:infer', mediaId),
    // #208 — Background pHash indexer for Browse-tab thumbnails
    browsePhashEnqueue: (urls: string[]) =>
      invoke<{ queued: number; alreadyCached: number }>('browse:phash-enqueue', urls),
    browsePhashLookup: (urls: string[]) =>
      invoke<Record<string, string | null>>('browse:phash-lookup', urls),
    browsePhashFindSimilar: (phashes: string[], maxDist?: number) =>
      invoke<Record<string, { mediaId: string; distance: number } | null>>('browse:phash-find-similar', phashes, maxDist),
    browsePhashStats: () =>
      invoke<{ cachedUrls: number; queueDepth: number; inFlight: number }>('browse:phash-stats'),
    browsePhashSetEnabled: (enabled: boolean) =>
      invoke<{ ok: boolean; error?: string }>('browse:phash-set-enabled', enabled),
    // #206 — DB-backed saved searches (pinned filter chips)
    savedSearchesList: () =>
      invoke<{ ok: boolean; items: Array<{ id: string; name: string; queryJson: string; position: number; createdAt: number; updatedAt: number }>; error?: string }>('savedSearches:list'),
    savedSearchesCreate: (args: { name: string; queryJson: string }) =>
      invoke<{ ok: boolean; item?: { id: string; name: string; queryJson: string; position: number; createdAt: number; updatedAt: number }; error?: string }>('savedSearches:create', args),
    savedSearchesUpdate: (args: { id: string; name?: string; queryJson?: string }) =>
      invoke<{ ok: boolean; error?: string }>('savedSearches:update', args),
    savedSearchesDelete: (id: string) =>
      invoke<{ ok: boolean; error?: string }>('savedSearches:delete', id),
    savedSearchesReorder: (orderedIds: string[]) =>
      invoke<{ ok: boolean; error?: string }>('savedSearches:reorder', orderedIds),
    savedSearchesImportLegacy: (entries: Array<{ id: string; name: string; queryJson: string; pinnedAt: number }>) =>
      invoke<{ ok: boolean; imported: number; error?: string }>('savedSearches:importLegacy', entries),
    // #146 — Sprite-sheet hover scrub
    mediaSpriteSheetPath: (args: { mediaId: string; preset?: 'scrub' | 'hover' }) =>
      invoke<{ ok: boolean; path: string | null; cols?: number; rows?: number; error?: string }>('media:spriteSheetPath', args),
    mediaEnsureSpriteSheet: (args: { mediaId: string; preset?: 'scrub' | 'hover' }) =>
      invoke<{ ok: boolean; path?: string; alreadyExisted?: boolean; cols?: number; rows?: number; error?: string }>('media:ensureSpriteSheet', args),
    // #101 — Saved Subscriptions with delta sync
    subscriptionsList: () =>
      invoke<{ ok: boolean; items: Array<{ id: string; name: string; source: string; query: string; intervalMinutes: number; lastRunAt: number | null; lastError: string | null; enabled: boolean; createdAt: number }>; error?: string }>('subscriptions:list'),
    subscriptionsCreate: (args: { name: string; source: string; query: string; intervalMinutes?: number }) =>
      invoke<{ ok: boolean; item?: any; error?: string }>('subscriptions:create', args),
    subscriptionsUpdate: (id: string, patch: { name?: string; query?: string; intervalMinutes?: number; enabled?: boolean }) =>
      invoke<{ ok: boolean; error?: string }>('subscriptions:update', id, patch),
    subscriptionsDelete: (id: string) =>
      invoke<{ ok: boolean; error?: string }>('subscriptions:delete', id),
    subscriptionsRunNow: (id: string) =>
      invoke<{ ok: boolean; added?: number; error?: string | null }>('subscriptions:runNow', id),
    subscriptionsInbox: (opts?: { subscriptionId?: string; pendingOnly?: boolean; limit?: number }) =>
      invoke<{ ok: boolean; items: Array<{ id: string; subscriptionId: string; postId: string; thumbUrl: string | null; fullUrl: string | null; sourcePageUrl: string | null; discoveredAt: number; dismissedAt: number | null; savedAt: number | null }>; error?: string }>('subscriptions:inbox', opts),
    subscriptionsDismiss: (inboxId: string) =>
      invoke<{ ok: boolean; error?: string }>('subscriptions:dismiss', inboxId),
    subscriptionsMarkSaved: (inboxId: string) =>
      invoke<{ ok: boolean; error?: string }>('subscriptions:markSaved', inboxId),
    // #104 — Pool / set aggregation
    booruPool: (args: { source: string; poolId: string | number }) =>
      invoke<{ ok: boolean; posts: any[]; poolName?: string | null; error?: string }>('booru:pool', args),
    // #106 — Stash-style local performers database
    performersDbList: (opts?: { query?: string; limit?: number }) =>
      invoke<{ ok: boolean; items: any[]; error?: string }>('performersDb:list', opts),
    performersDbGet: (id: string) =>
      invoke<{ ok: boolean; item: any; error?: string }>('performersDb:get', id),
    performersDbCreate: (args: any) =>
      invoke<{ ok: boolean; item?: any; error?: string }>('performersDb:create', args),
    performersDbUpdate: (id: string, patch: any) =>
      invoke<{ ok: boolean; error?: string }>('performersDb:update', id, patch),
    performersDbDelete: (id: string) =>
      invoke<{ ok: boolean; error?: string }>('performersDb:delete', id),
    // #195 — Multi-user profiles (userProfiles:* avoids the existing
    // settings-profiles namespace).
    userProfilesList: () =>
      invoke<{ ok: boolean; profiles: Array<{ id: string; name: string; color: string | null; avatarPath: string | null; createdAt: number; updatedAt: number }>; activeId: string; error?: string }>('userProfiles:list'),
    userProfilesCreate: (args: { name: string; color?: string; avatarPath?: string }) =>
      invoke<{ ok: boolean; profile?: any; error?: string }>('userProfiles:create', args),
    userProfilesUpdate: (id: string, patch: { name?: string; color?: string | null; avatarPath?: string | null }) =>
      invoke<{ ok: boolean; error?: string }>('userProfiles:update', id, patch),
    userProfilesDelete: (id: string) =>
      invoke<{ ok: boolean; error?: string }>('userProfiles:delete', id),
    userProfilesSetActive: (id: string) =>
      invoke<{ ok: boolean; error?: string }>('userProfiles:setActive', id),
    // #131 / #136 / #162 / #180 — Python ML sidecar launcher
    mlSidecarStatus: (id: 'videoLlama3' | 'animateDiff' | 'rife' | 'musicGen') =>
      invoke<{ ok: boolean; installed?: boolean; running?: boolean; port?: number; startScript?: string | null; description?: string; error?: string }>('mlSidecar:status', id),
    mlSidecarStart: (id: 'videoLlama3' | 'animateDiff' | 'rife' | 'musicGen') =>
      invoke<{ ok: boolean; error?: string }>('mlSidecar:start', id),
    mlSidecarPost: <T = unknown>(args: { id: 'videoLlama3' | 'animateDiff' | 'rife' | 'musicGen'; path: string; body: unknown; timeoutMs?: number }) =>
      invoke<{ ok: boolean; data?: T; error?: string }>('mlSidecar:post', args),
    // #175 — Real-time RVC voice conversion
    rvcStatus: () =>
      invoke<{ ok: boolean; installed: boolean; running: boolean; binPath: string; error?: string }>('rvc:status'),
    rvcStart: () =>
      invoke<{ ok: boolean; error?: string }>('rvc:start'),
    rvcListModels: () =>
      invoke<{ ok: boolean; models: string[]; error?: string }>('rvc:listModels'),
    rvcConvert: (args: { srcPath: string; modelName: string; transpose?: number }) =>
      invoke<{ ok: boolean; dstPath?: string; ms?: number; error?: string }>('rvc:convert', args),
    // #173 — Demucs stem separation
    demucsStatus: (args?: { binPath?: string }) =>
      invoke<{ ok: boolean; installed: boolean; version: string | null; binPath: string; defaultModel: string; outputDir: string; error?: string }>('demucs:status', args),
    demucsSeparate: (args: { srcPath: string; model?: string; twoStem?: boolean; binPath?: string }) =>
      invoke<{ ok: boolean; outputDir: string; stemPaths: Record<string, string>; error?: string }>('demucs:separate', args),
    // #191 — age-encrypted backups
    ageStatus: () =>
      invoke<{ ok: boolean; installed: boolean; version: string | null; binPath: string; error?: string }>('age:status'),
    ageEncryptFile: (args: { srcPath: string; dstPath: string; recipients: string[] }) =>
      invoke<{ ok: boolean; error?: string }>('age:encryptFile', args),
    ageDecryptFile: (args: { srcPath: string; dstPath: string; identityPaths: string[] }) =>
      invoke<{ ok: boolean; error?: string }>('age:decryptFile', args),
    // #193 — Per-file envelope encryption
    cryptoEnvelopeEncrypt: (args: { srcPath: string; dstPath: string; passphrase: string }) =>
      invoke<{ ok: boolean; error?: string }>('crypto:envelope-encrypt', args),
    cryptoEnvelopeDecrypt: (args: { srcPath: string; dstPath: string; passphrase: string }) =>
      invoke<{ ok: boolean; error?: string }>('crypto:envelope-decrypt', args),
    cryptoEnvelopePlaintextSize: (args: { srcPath: string; passphrase: string }) =>
      invoke<{ ok: boolean; size: number; error?: string }>('crypto:envelope-plaintextSize', args),
    cryptoEnvelopeIsEnvelope: (srcPath: string) =>
      invoke<{ ok: boolean; isEnvelope: boolean; error?: string }>('crypto:envelope-isEnvelope', srcPath),
    // #192 — SQLCipher migration helper (feasibility + dry-run)
    sqlcipherFeasibility: () =>
      invoke<{ ok: boolean; packageAvailable?: boolean; packageInstalled?: boolean; catalogPath?: string; catalogSizeBytes?: number; migrationSteps?: string[]; error?: string }>('sqlcipher:feasibility'),
    sqlcipherDryRun: (passphrase: string) =>
      invoke<{ ok: boolean; encryptedCopyPath?: string; copySizeBytes?: number; durationMs?: number; error?: string }>('sqlcipher:dryRun', passphrase),
    // Generic file / folder pickers
    dialogOpenFile: (opts?: { title?: string; filters?: Array<{ name: string; extensions: string[] }> }) =>
      invoke<string | null>('dialog:openFile', opts),
    dialogOpenFolder: (opts?: { title?: string }) =>
      invoke<string | null>('dialog:openFolder', opts),
    dialogSaveFile: (opts?: { title?: string; defaultPath?: string; filters?: Array<{ name: string; extensions: string[] }> }) =>
      invoke<string | null>('dialog:saveFile', opts),
    // #222/223/224 — StevenBlack hosts blocklist (porn-only extension).
    hostsBlocklistStatus: () =>
      invoke<{ ok: boolean; cached: boolean; meta: { url: string; fetchedAt: string; domainCount: number; bytes: number } | null; cachePath: string; panicModeActive: boolean; error?: string }>('hostsBlocklist:status'),
    hostsBlocklistRefresh: () =>
      invoke<{ ok: boolean; meta?: { url: string; fetchedAt: string; domainCount: number; bytes: number }; error?: string }>('hostsBlocklist:refresh'),
    hostsBlocklistDiscover: (args?: { limit?: number }) =>
      invoke<{ ok: boolean; candidates?: Array<{ domain: string; category: 'tube' | 'cam' | 'cdn' | 'gallery' | 'other' }>; error?: string }>('hostsBlocklist:discover', args ?? {}),
    hostsBlocklistPanicOn: () =>
      invoke<{ ok: boolean; error?: string }>('hostsBlocklist:panicOn'),
    hostsBlocklistPanicOff: () =>
      invoke<{ ok: boolean; error?: string }>('hostsBlocklist:panicOff'),
    hostsBlocklistMatchUrl: (url: string) =>
      invoke<{ ok: boolean; match: { matched: string; platform: string } | null; error?: string }>('hostsBlocklist:matchUrl', url),
    // #379 — stealth window-title swap
    stealthStatus: () =>
      invoke<{ ok: boolean; active: boolean; profile: string | null; profiles: string[]; error?: string }>('stealth:status'),
    stealthEnable: (profile: string) =>
      invoke<{ ok: boolean; error?: string }>('stealth:enable', profile),
    stealthDisable: () =>
      invoke<{ ok: boolean; error?: string }>('stealth:disable'),
    // #244 — moment-capture: renderer encodes WebP, main writes to userData/moments/
    moments: {
      save: (args: { filename: string; data: number[] }) =>
        invoke<{ ok: boolean; path?: string; error?: string }>('moments:save', args),
    },
    // #294 — Apple Photos "Feature less" entity suppression
    featureLess: {
      set: (args: { mediaId: string; value: boolean }) =>
        invoke<{ ok: boolean; error?: string }>('media:setFeatureLess', args),
      get: (mediaId: string) =>
        invoke<{ ok: boolean; value?: boolean; error?: string }>('media:getFeatureLess', mediaId),
      list: () =>
        invoke<{ ok: boolean; mediaIds?: string[]; error?: string }>('media:listFeatureLess'),
    },
    // #348 — edging scoreboard
    edging: {
      start: () => invoke<{ ok: boolean; session?: any; error?: string }>('edging:start'),
      end: (args: { outcome?: 'climax' | 'denied' | 'ruined'; climaxed?: boolean; notes?: string | null }) =>
        invoke<{ ok: boolean; session?: any; error?: string }>('edging:end', args),
      stats: () => invoke<{
        ok: boolean
        stats?: { totalSessions: number; totalDeniedSessions: number; totalClimaxSessions: number; currentDenialStreak: number; longestDenialStreak: number; totalXp: number; longestSessionSec: number; averageSessionSec: number }
        error?: string
      }>('edging:stats'),
      recent: (limit?: number) => invoke<{ ok: boolean; sessions?: any[]; error?: string }>('edging:recent', limit),
    },
    // #358 G-134 — tease & denial task wheel
    taskWheel: {
      pool: () => invoke<{
        ok: boolean
        pool?: Array<{ id: string; text: string; category: 'edge' | 'pause' | 'reverse' | 'position' | 'sensation' | 'denial'; weight: number; durationSec?: number; intensity?: 1 | 2 | 3 | 4 | 5 }>
        error?: string
      }>('taskWheel:pool'),
      pick: (args?: { maxIntensity?: 1 | 2 | 3 | 4 | 5; excludeIds?: string[] }) => invoke<{
        ok: boolean
        task?: { id: string; text: string; category: string; weight: number; durationSec?: number; intensity?: number } | null
        error?: string
      }>('taskWheel:pick', args),
      setPool: (pool: any[]) => invoke<{ ok: boolean; error?: string }>('taskWheel:setPool', pool),
      setDisabledCategories: (cats: string[]) => invoke<{ ok: boolean; error?: string }>('taskWheel:setDisabledCategories', cats),
      resetDefaults: () => invoke<{ ok: boolean; error?: string }>('taskWheel:resetDefaults'),
    },
    // #376 H-152 — orgasm budget & relapse ledger
    budget: {
      status: () => invoke<{
        ok: boolean
        status?: {
          budget: number
          monthStart: number
          climaxesThisMonth: number
          ruinedThisMonth: number
          remaining: number
          inRelapse: boolean
          relapseCount: number
          budgetHealthPct: number
        }
        error?: string
      }>('budget:status'),
      history: (monthsBack?: number) => invoke<{
        ok: boolean
        history?: Array<{ monthStart: number; monthLabel: string; climaxes: number; ruined: number; relapses: number }>
        error?: string
      }>('budget:history', monthsBack),
      setLimit: (perMonth: number) => invoke<{ ok: boolean; error?: string }>('budget:setLimit', perMonth),
    },
    // #363 — per-media denial cooldown
    denial: {
      set: (args: { mediaId: string; durationMin: number }) => invoke<{ ok: boolean; until?: number; error?: string }>('denial:set', args),
      clear: (mediaId: string) => invoke<{ ok: boolean; error?: string }>('denial:clear', mediaId),
      status: (mediaId: string) => invoke<{ ok: boolean; status?: { active: boolean; until: number | null; remainingMs: number }; error?: string }>('denial:status', mediaId),
      listActive: () => invoke<{ ok: boolean; items: Array<{ mediaId: string; until: number; remainingMs: number }>; error?: string }>('denial:listActive'),
    },
    // #347 — post-nut clarity lockout
    lockout: {
      status: () => invoke<{ ok: boolean; state?: { enabled: boolean; durationMin: number; lockedUntilTs: number | null; remainingMs: number; active: boolean }; error?: string }>('lockout:status'),
      trigger: (args?: { durationMin?: number }) => invoke<{ ok: boolean; state?: any; error?: string }>('lockout:trigger', args ?? {}),
      cancel: () => invoke<{ ok: boolean; state?: any; error?: string }>('lockout:cancel'),
      setEnabled: (enabled: boolean) => invoke<{ ok: boolean; state?: any; error?: string }>('lockout:setEnabled', enabled),
      setDuration: (durationMin: number) => invoke<{ ok: boolean; state?: any; error?: string }>('lockout:setDuration', durationMin),
    },
    // #G-129 — JOI script player (XTTS-driven domme line sequencer)
    joi: {
      parse: (text: string) =>
        invoke<{ ok: boolean; cues?: Array<{ kind: 'speak' | 'pause'; text?: string; voice?: string; tempo?: number; sec?: number }>; error?: string }>('joi:parse', text),
      render: (args: { text?: string; cues?: any[]; voice?: string }) =>
        invoke<{
          ok: boolean
          totalDurationMs?: number
          voiceUsed?: string
          entries?: Array<{
            startMs: number
            endMs: number
            cue: { kind: 'speak' | 'pause'; text?: string; voice?: string; tempo?: number; sec?: number }
            audioBase64?: string
            audioMime?: string
            durationMs?: number
          }>
          error?: string
        }>('joi:render', args),
    },
    // Generic ML sidecar — Florence-2 / DINOv3-L / MetaCLIP-H / SigLIP2-age / Wav2Vec2-emotion (and growing)
    vaultMl: {
      health: () => invoke<{ ok: boolean; health: { status: string; device: string; dtype: string; models_dir: string; models_dir_exists: boolean; loaded: string[]; available_loaders: string[] } | null; error?: string }>('vaultMl:health'),
      start: () => invoke<{ ok: boolean; error?: string }>('vaultMl:start'),
      stop: () => invoke<{ ok: boolean; error?: string }>('vaultMl:stop'),
      loadModel: (modelId: string) => invoke<{ ok: boolean; error?: string }>('vaultMl:loadModel', modelId),
      unloadModel: (modelId: string) => invoke<{ ok: boolean; error?: string }>('vaultMl:unloadModel', modelId),
      // Florence-2: caption / OD / OCR / grounding
      florence: (args: { imagePath?: string; imageBase64?: string; task?: string; text_input?: string; maxNewTokens?: number }) =>
        invoke<{ ok: boolean; task?: string; raw?: string; parsed?: any; error?: string }>('vaultMl:florence', args),
      embedImage: (args: { imagePath?: string; imageBase64?: string; modelId?: 'dinov3-vit-l' | 'metaclip-h14' }) =>
        invoke<{ ok: boolean; model_id?: string; embedding?: number[]; dim?: number; error?: string }>('vaultMl:embedImage', args),
      classifyImage: (args: { imagePath?: string; imageBase64?: string; modelId?: 'siglip2-age'; topK?: number }) =>
        invoke<{ ok: boolean; model_id?: string; predictions?: Array<{ label: string; score: number }>; error?: string }>('vaultMl:classifyImage', args),
      classifyAudioEmotion: (args: { audioPath?: string; audioBase64?: string }) =>
        invoke<{ ok: boolean; model_id?: string; scores?: number[]; labels?: string[]; error?: string }>('vaultMl:classifyAudioEmotion', args),
      sam2Segment: (args: { imagePath?: string; imageBase64?: string; points?: Array<[number, number]>; pointLabels?: number[]; box?: [number, number, number, number]; multimaskOutput?: boolean }) =>
        invoke<{ ok: boolean; masks?: Array<{ score: number; shape: number[]; mask_base64: string }>; error?: string }>('vaultMl:sam2Segment', args),
      demucsSeparate: (args: { audioPath?: string; audioBase64?: string; dstDir: string }) =>
        invoke<{ ok: boolean; stems?: Record<string, string>; sample_rate?: number; error?: string }>('vaultMl:demucsSeparate', args),
      msclapEmbed: (args: { kind: 'audio' | 'text'; audioPath?: string; text?: string[] }) =>
        invoke<{ ok: boolean; embeddings?: number[][]; shape?: number[]; error?: string }>('vaultMl:msclapEmbed', args),
      codeformerRestore: (args: { imagePath?: string; imageBase64?: string; dstPath: string; fidelity?: number }) =>
        invoke<{ ok: boolean; dst_path?: string; faces_restored?: number; error?: string }>('vaultMl:codeformerRestore', args),
      melRoformerSeparate: (args: { audioPath?: string; audioBase64?: string; dstPath: string }) =>
        invoke<{ ok: boolean; dst_path?: string; sample_rate?: number; error?: string }>('vaultMl:melRoformerSeparate', args),
      depthAnythingV2: (args: { imagePath?: string; imageBase64?: string }) =>
        invoke<{ ok: boolean; width?: number; height?: number; min_depth?: number; max_depth?: number; depth_png_base64?: string; error?: string }>('vaultMl:depthAnythingV2', args),
      blipCaption: (args: { imagePath?: string; imageBase64?: string; conditionalPrompt?: string; maxNewTokens?: number }) =>
        invoke<{ ok: boolean; caption?: string; error?: string }>('vaultMl:blipCaption', args),
      // #H-148 MusicGen — generate kink-mood audio beds from text prompts
      musicgenGenerate: (args: { prompts: string[]; durationSec?: number; dstDir: string }) =>
        invoke<{ ok: boolean; files?: string[]; sample_rate?: number; error?: string }>('vaultMl:musicgenGenerate', args),
    },
    // JoyTag — pure ONNX adult tagger (no sidecar needed)
    joytag: {
      status: () => invoke<{ ok: boolean; available?: boolean; loaded?: boolean; modelPath?: string; tagsPath?: string; tagCount?: number; error?: string }>('joytag:status'),
      tagImage: (args: { imagePath: string; threshold?: number; topK?: number }) =>
        invoke<{ ok: boolean; tags?: Array<{ tag: string; score: number }>; error?: string }>('joytag:tagImage', args),
    },
    // #B-32 — Real-ESRGAN x4 upscaler
    upscaler: {
      status: () => invoke<{ ok: boolean; available?: boolean; loaded?: boolean; modelPath?: string; error?: string }>('upscaler:status'),
      upscaleImage: (args: { srcPath: string; dstPath?: string; tileSize?: number; format?: 'png' | 'jpg' | 'webp'; quality?: number }) =>
        invoke<{ ok: boolean; dstPath?: string; error?: string }>('upscaler:upscaleImage', args),
    },
    // #324 — auto FFmpeg quality auditor
    quality: {
      audit: (args: { videoPath: string; deep?: boolean; sizeBytes?: number | null }) =>
        invoke<{
          ok: boolean
          report?: {
            ok: boolean
            durationSec: number
            width: number | null
            height: number | null
            videoCodec: string | null
            audioCodec: string | null
            videoBitrateKbps: number | null
            audioBitrateKbps: number | null
            audioSampleRate: number | null
            audioChannels: number | null
            container: string | null
            findings: Array<{ code: string; severity: 'info' | 'warn' | 'error'; message: string }>
          }
          error?: string
        }>('quality:audit', args),
    },
    // #308 E-84 — Beets-style smart-collection query language
    smartQuery: {
      compile: (query: string) =>
        invoke<{ ok: boolean; sql?: string; params?: any[]; joinedClauses?: string[]; error?: string }>('smartQuery:compile', query),
      run: (args: { query: string; limit?: number; offset?: number; sort?: 'newest' | 'oldest' | 'rating' | 'views' | 'random' | 'longest' | 'shortest' }) =>
        invoke<{ ok: boolean; items?: any[]; total?: number; compiled?: { sql: string; paramCount: number }; error?: string }>('smartQuery:run', args),
    },
    // #317 E-93 — Hydrus/Danbooru tag implication import
    tagImplications: {
      importCsv: (csvText: string) =>
        invoke<{ ok: boolean; inserted?: number; skipped?: number; errors?: string[]; error?: string }>('tagImplications:importCsv', csvText),
      importCsvFile: (filePath: string) =>
        invoke<{ ok: boolean; inserted?: number; skipped?: number; errors?: string[]; error?: string }>('tagImplications:importCsvFile', filePath),
    },
    // #321 E-97 — Folder Action preset library
    folderActions: {
      list: () => invoke<{
        ok: boolean
        presets?: Array<{ id: string; name: string; folderPath: string; actions: Array<{ kind: string; args?: any }>; enabled: boolean; createdAt: number }>
        error?: string
      }>('folderActions:list'),
      save: (args: { id?: string; name: string; folderPath: string; actions: Array<{ kind: string; args?: any }>; enabled?: boolean }) =>
        invoke<{ ok: boolean; id?: string; error?: string }>('folderActions:save', args),
      delete: (id: string) => invoke<{ ok: boolean; error?: string }>('folderActions:delete', id),
      setEnabled: (args: { id: string; enabled: boolean }) =>
        invoke<{ ok: boolean; error?: string }>('folderActions:setEnabled', args),
    },
    // #349 G-125 — tease auto-cut compiler (NudeNet-driven peek-a-boo)
    teaseCut: {
      events: (args: { mediaId: string; threshold?: number }) =>
        invoke<{ ok: boolean; events?: Array<{ startSec: number; score: number }>; error?: string }>('teaseCut:events', args),
      compile: (args: { mediaPath: string; events: any[]; dstPath: string; threshold?: number; leadInSec?: number; cutawaySec?: number; maxClips?: number; videoCodec?: string; width?: number; height?: number; fps?: number }) =>
        invoke<{ ok: boolean; clipsUsed?: number; durationSec?: number; events?: any[]; error?: string }>('teaseCut:compile', args),
    },
    // #351 G-127 — Funscript editor (multi-axis OSR2/SR6)
    funscript: {
      load: (args: { mediaPath: string; mediaId: string }) =>
        invoke<{ ok: boolean; script?: any; error?: string }>('funscript:load', args),
      save: (args: { mediaPath: string; mediaId: string; script: any }) =>
        invoke<{ ok: boolean; savedTo?: string; error?: string }>('funscript:save', args),
      fromBeatmap: (args: { beats: any[]; axis?: string; baseDepth?: number }) =>
        invoke<{ ok: boolean; script?: any; error?: string }>('funscript:fromBeatmap', args),
      scale: (args: { script: any; factor: number; center?: number }) =>
        invoke<{ ok: boolean; script?: any; error?: string }>('funscript:scale', args),
      shift: (args: { script: any; offsetMs: number }) =>
        invoke<{ ok: boolean; script?: any; error?: string }>('funscript:shift', args),
    },
    // #274 C-50 — ntfy.sh push gateway
    ntfy: {
      config: () => invoke<{
        ok: boolean
        config?: { server: string; topic: string; enabled: boolean; allowedEvents: string[]; priority?: number; authToken?: string }
        error?: string
      }>('ntfy:config'),
      save: (patch: { server?: string; topic?: string; enabled?: boolean; allowedEvents?: string[]; priority?: number; authToken?: string }) =>
        invoke<{ ok: boolean; config?: any; error?: string }>('ntfy:save', patch),
      push: (args: { event: string; title: string; message: string; tags?: string[]; clickUrl?: string; attachUrl?: string; priority?: number }) =>
        invoke<{ ok: boolean; status?: number; error?: string }>('ntfy:push', args),
      notifyEvent: (args: { event: string; payload?: any }) =>
        invoke<{ ok: boolean; error?: string }>('ntfy:notifyEvent', args),
    },
    // #234 A-10 — HLS transcode-on-demand for remote streaming
    hls: {
      start: (args: { mediaPath: string; mediaId: string; quality?: '480p' | '720p' | '1080p' }) =>
        invoke<{ ok: boolean; ready?: boolean; playlistPath?: string; outDir?: string; startedAt?: number; error?: string | null }>('hls:start', args),
      touch: (args: { mediaId: string; quality: '480p' | '720p' | '1080p' }) =>
        invoke<{ ok: boolean; error?: string }>('hls:touch', args),
      stop: (args: { mediaId: string; quality: '480p' | '720p' | '1080p' }) =>
        invoke<{ ok: boolean; error?: string }>('hls:stop', args),
      list: () => invoke<{ ok: boolean; sessions?: Array<{ mediaId: string; quality: string; ready: boolean; ageMs: number; outDir: string }>; error?: string }>('hls:list'),
    },
    // #230 A-06 — CLIP visual-similarity "more like this"
    clipSimilarity: {
      findByMedia: (args: { mediaId: string; limit?: number; minSimilarity?: number; onlyActiveTriage?: boolean }) =>
        invoke<{
          ok: boolean
          items?: Array<{ mediaId: string; filename: string; thumbPath: string | null; durationSec: number | null; similarity: number }>
          error?: string
        }>('clipSimilarity:findByMedia', args),
      findByMultiple: (args: { mediaIds: string[]; limit?: number; minSimilarity?: number }) =>
        invoke<{
          ok: boolean
          items?: Array<{ mediaId: string; filename: string; thumbPath: string | null; durationSec: number | null; similarity: number }>
          error?: string
        }>('clipSimilarity:findByMultiple', args),
    },
    // #365 H-141 — sissy-training caption overlay pool
    captionPool: {
      list: () => invoke<{
        ok: boolean
        pools?: Record<string, string[]>
        intervalSec?: number
        fontFamily?: string
        activeCategories?: string[]
        error?: string
      }>('captionPool:list'),
      save: (args: { pools?: Record<string, string[]>; intervalSec?: number; fontFamily?: string; activeCategories?: string[] }) =>
        invoke<{ ok: boolean; error?: string }>('captionPool:save', args),
    },
    // #281 C-57 — WebAuthn / passkey vault unlock
    webauthn: {
      registerStart: (deviceLabel: string) => invoke<{ ok: boolean; options?: any; deviceLabel?: string; error?: string }>('webauthn:registerStart', deviceLabel),
      registerFinish: (args: { response: any; deviceLabel: string }) =>
        invoke<{ ok: boolean; credentialId?: string; error?: string }>('webauthn:registerFinish', args),
      authStart: () => invoke<{ ok: boolean; options?: any; error?: string }>('webauthn:authStart'),
      authFinish: (args: { response: any }) =>
        invoke<{ ok: boolean; credentialId?: string; error?: string }>('webauthn:authFinish', args),
      listCredentials: () => invoke<{ ok: boolean; credentials?: Array<{ id: string; deviceLabel: string; registeredAt: number; counter: number }>; error?: string }>('webauthn:listCredentials'),
      removeCredential: (id: string) => invoke<{ ok: boolean; error?: string }>('webauthn:removeCredential', id),
    },
    // #284 C-60 — Shamir Secret Sharing for vault key recovery
    shamir: {
      split: (args: { secret: string; shares: number; threshold: number }) =>
        invoke<{
          ok: boolean
          threshold?: number; totalShares?: number
          shares?: Array<{ index: number; base64: string; base32: string }>
          error?: string
        }>('shamir:split', args),
      combine: (args: { shareStrings: string[]; encoding?: 'base64' | 'base32' }) =>
        invoke<{ ok: boolean; secret?: string; error?: string }>('shamir:combine', args),
    },
    // #367 H-143 — audio-erotica importer (LRC / bracketed / VTT)
    audioErotica: {
      importFile: (filePath: string) => invoke<{
        ok: boolean; format?: 'lrc' | 'vtt' | 'bracketed' | 'unknown'
        title?: string; performer?: string; durationSec?: number
        cues: Array<{ timeSec: number; text: string }>
        error?: string
      }>('audioErotica:importFile', filePath),
      importText: (text: string) => invoke<{
        ok: boolean; format?: 'lrc' | 'vtt' | 'bracketed' | 'unknown'
        title?: string; performer?: string; durationSec?: number
        cues: Array<{ timeSec: number; text: string }>
        error?: string
      }>('audioErotica:importText', text),
      toJoiScript: (args: { imp: any; voice?: string }) =>
        invoke<{ ok: boolean; script?: string; error?: string }>('audioErotica:toJoiScript', args),
    },
    // #384 H-160 — coomer/kemono creator archive importer
    coomerArchive: {
      run: (args: { service: 'onlyfans' | 'fansly' | 'candfans' | 'patreon' | 'fanbox' | 'gumroad' | 'subscribestar'; userId: string; maxPosts?: number; mediaExtensions?: string[] }) =>
        invoke<{
          ok: boolean
          result?: { postsFetched: number; attachmentsQueued: number; pageOffset: number; done: boolean; error?: string }
          error?: string
        }>('coomerArchive:run', args),
    },
    // #316 E-92 — sprite-sheet chapter editor backend
    spriteSheet: {
      generate: (args: { srcPath: string; durationSec: number; cells?: number; cols?: number; thumbWidth?: number; thumbHeight?: number; dstPath?: string }) =>
        invoke<{
          ok: boolean
          spritePath?: string; cols?: number; rows?: number; thumbWidth?: number; thumbHeight?: number
          cells?: Array<{ idx: number; timeSec: number; col: number; row: number }>
          error?: string
        }>('spriteSheet:generate', args),
      picksToChapters: (args: { picks: Array<{ cellIdx: number; title: string; timeSec: number }>; durationSec: number }) =>
        invoke<{ ok: boolean; chapters?: Array<{ startSec: number; endSec: number; title: string }>; error?: string }>('spriteSheet:picksToChapters', args),
    },
    // #307 E-83 — yt-dlp postprocessor profile editor
    ytdlpProfiles: {
      list: () => invoke<{ ok: boolean; profiles?: Array<{ id: string; name: string; argsArray: string[]; isBuiltin?: boolean }>; error?: string }>('ytdlpProfiles:list'),
      save: (args: { id?: string; name: string; argsArray: string[]; isDefault?: boolean }) =>
        invoke<{ ok: boolean; id?: string; error?: string }>('ytdlpProfiles:save', args),
      delete: (id: string) => invoke<{ ok: boolean; error?: string }>('ytdlpProfiles:delete', id),
      setDefault: (id: string) => invoke<{ ok: boolean; error?: string }>('ytdlpProfiles:setDefault', id),
    },
    // #285 D-61 — Hydrus duplicate-pair triage queue
    dupTriage: {
      nextPair: () => invoke<{
        ok: boolean
        pair?: { a: any; b: any } | null
        totalPending?: number
        error?: string
      }>('dupTriage:nextPair'),
      resolve: (args: { aId: string; bId: string; action: 'keep_a' | 'keep_b' | 'keep_both' | 'delete_both' }) =>
        invoke<{ ok: boolean; toDelete?: string | null; error?: string }>('dupTriage:resolve', args),
    },
    // #378 H-154 — hentai/anime/furry sub-library
    subLibrary: {
      hentai: (args?: { facet?: 'anime' | 'hentai' | 'furry' | 'cartoon' | 'all'; limit?: number; offset?: number }) =>
        invoke<{
          ok: boolean
          items?: Array<{ id: string; filename: string; path: string; thumbPath: string | null; type: string; durationSec: number | null; addedAt: number }>
          total?: number; facet?: string; error?: string
        }>('subLibrary:hentai', args),
    },
    // #369 H-145 — body-part heatmap indexer
    heatmap: {
      build: (args: { mediaId: string; durationSec: number; bucketSec?: number }) =>
        invoke<{
          ok: boolean
          heatmap?: {
            durationSec: number; bucketSec: number
            buckets: Array<{ timeSec: number; classes: Record<string, number>; dominantClass: string | null; dominantScore: number }>
            classTotals: Record<string, number>
          }
          error?: string
        }>('heatmap:build', args),
      classJumps: (args: { mediaId: string; targetClass: string; threshold?: number }) =>
        invoke<{ ok: boolean; timestamps?: number[]; error?: string }>('heatmap:classJumps', args),
    },
    // #383 + #370 — LLM narrative engine (text-adventure + CYOA)
    narrative: {
      turn: (ctx: {
        mode: 'text-adventure' | 'cyoa'
        seed: string
        history: Array<{ turn: any; chosenChoice: string }>
        videoFilename?: string
        videoTags?: string[]
        persona?: 'goonbud' | 'mistress' | 'stepsister' | 'boss' | 'cheerleader'
      }) => invoke<{
        ok: boolean
        turn?: { narrative: string; choices: Array<{ id: string; label: string }>; ended: boolean; endingType?: string }
        error?: string
      }>('narrative:turn', ctx),
    },
    // #304 D-80 — Notion-style import templates
    importTemplates: {
      list: () => invoke<{ ok: boolean; templates?: any[]; error?: string }>('importTemplates:list'),
      save: (args: { id?: string; name: string; filenamePattern: string; tags?: string[]; category?: string; rating?: number; studio?: string; triageStatus?: string; priority?: number; enabled?: boolean }) =>
        invoke<{ ok: boolean; id?: string; error?: string }>('importTemplates:save', args),
      delete: (id: string) => invoke<{ ok: boolean; error?: string }>('importTemplates:delete', id),
    },
    // #319 E-95 — action recorder / macro system
    macro: {
      list: () => invoke<{ ok: boolean; macros?: any[]; error?: string }>('macro:list'),
      save: (args: { id?: string; name: string; steps: Array<{ kind: 'ipc' | 'wait'; channel?: string; args?: any; ms?: number }>; hotkey?: string }) =>
        invoke<{ ok: boolean; id?: string; error?: string }>('macro:save', args),
      delete: (id: string) => invoke<{ ok: boolean; error?: string }>('macro:delete', id),
      run: (id: string) => invoke<{ ok: boolean; stepsRan?: number; error?: string }>('macro:run', id),
    },
    // #310 user-script sandbox + #311 scraper recipes
    userScript: {
      run: (args: { source: string; timeoutMs?: number; maxLogLines?: number; args?: any }) =>
        invoke<{ ok: boolean; result?: any; logs: Array<{ level: 'log' | 'warn' | 'error'; message: string }>; durationMs: number; error?: string }>('userScript:run', args),
    },
    scraperRecipes: {
      list: () => invoke<{ ok: boolean; recipes?: Array<{ id: string; name: string; source: string; enabled: boolean }>; error?: string }>('scraperRecipes:list'),
      save: (args: { id?: string; name: string; source: string; enabled?: boolean }) =>
        invoke<{ ok: boolean; id?: string; error?: string }>('scraperRecipes:save', args),
      delete: (id: string) => invoke<{ ok: boolean; error?: string }>('scraperRecipes:delete', id),
      run: (args: { id: string; args?: any }) =>
        invoke<{ ok: boolean; result?: any; logs: any[]; durationMs: number; error?: string }>('scraperRecipes:run', args),
    },
    // #312 E-88 — RSS importer
    rss: {
      list: () => invoke<{ ok: boolean; feeds?: Array<{ id: string; url: string; label: string; intervalMin: number; urlFilter?: string; lastPolledAt?: number; lastError?: string | null; enabled: boolean }>; error?: string }>('rss:list'),
      add: (args: { url: string; label?: string; intervalMin?: number; urlFilter?: string }) =>
        invoke<{ ok: boolean; feed?: any; error?: string }>('rss:add', args),
      remove: (id: string) => invoke<{ ok: boolean; error?: string }>('rss:remove', id),
      setEnabled: (args: { id: string; enabled: boolean }) => invoke<{ ok: boolean; error?: string }>('rss:setEnabled', args),
      pollNow: () => invoke<{ ok: boolean; results?: Array<{ feedId: string; feedLabel: string; newItems: number; skippedSeen: number; skippedFiltered: number; errors: string[] }>; error?: string }>('rss:pollNow'),
    },
    // #318 E-94 — cron-syntax job scheduler
    cron: {
      validate: (expression: string) => invoke<{ ok: boolean; nextRunAt?: number; error?: string }>('cron:validate', expression),
      list: () => invoke<{ ok: boolean; jobs?: any[]; error?: string }>('cron:list'),
      add: (args: { name: string; expression: string; action: any; enabled?: boolean }) =>
        invoke<{ ok: boolean; job?: any; error?: string }>('cron:add', args),
      update: (args: { id: string; patch: any }) => invoke<{ ok: boolean; job?: any; error?: string }>('cron:update', args),
      remove: (id: string) => invoke<{ ok: boolean; error?: string }>('cron:remove', id),
    },
    // #292 D-68 — Strava-style yearly goal ring
    yearlyGoal: {
      get: () => invoke<{
        ok: boolean
        goal?: { metric: 'hours_watched' | 'items_rated' | 'climaxes' | 'denials'; target: number }
        progress?: number
        dayOfYear?: number
        pct?: number
        onPaceProgress?: number
        aheadOfPace?: boolean
        error?: string
      }>('yearlyGoal:get'),
      set: (args: { metric: 'hours_watched' | 'items_rated' | 'climaxes' | 'denials'; target: number }) =>
        invoke<{ ok: boolean; error?: string }>('yearlyGoal:set', args),
    },
    // #301 D-77 — Currently Watching shelves
    currentlyWatching: {
      list: (args?: { daysBack?: number; limit?: number }) =>
        invoke<{
          ok: boolean
          items?: Array<{ mediaId: string; filename: string; thumbPath: string | null; durationSec: number | null; progressSec: number; progressPct: number; rating: number; lastViewedAt: number }>
          error?: string
        }>('currentlyWatching:list', args),
    },
    // #295 D-71 — Watch diary calendar
    watchDiary: {
      days: (args?: { daysBack?: number }) =>
        invoke<{ ok: boolean; days?: Array<{ day: string; itemsTouched: number; minutes: number }>; error?: string }>('watchDiary:days', args),
    },
    // #288 D-64 — Daylist auto-retitling (4h rotating evocative name)
    daylist: {
      title: () => invoke<{ ok: boolean; title?: string; generatedAt?: number; expiresAt?: number; hourBucket?: number; error?: string }>('daylist:title'),
      regenerate: () => invoke<{ ok: boolean; title?: string; generatedAt?: number; expiresAt?: number; hourBucket?: number; error?: string }>('daylist:regenerate'),
    },
    // #303 D-79 — Spotify-style Recap cards
    recap: {
      monthly: (args?: { year?: number; month0?: number }) =>
        invoke<{ ok: boolean; recap?: any; error?: string }>('recap:monthly', args),
      halfYear: (args?: { year?: number; half?: 1 | 2 }) =>
        invoke<{ ok: boolean; recap?: any; error?: string }>('recap:halfYear', args),
      yearly: (args?: { year?: number }) =>
        invoke<{ ok: boolean; recap?: any; error?: string }>('recap:yearly', args),
    },
    // #289 D-65 — Calibre Virtual Libraries (named filter sets)
    virtualLibs: {
      list: () => invoke<{
        ok: boolean
        libraries?: Array<{ id: string; name: string; query: any; color: string | null; icon: string | null; createdAt: number }>
        error?: string
      }>('virtualLibs:list'),
      save: (args: { id?: string; name: string; query: any; color?: string; icon?: string }) =>
        invoke<{ ok: boolean; id?: string; error?: string }>('virtualLibs:save', args),
      delete: (id: string) => invoke<{ ok: boolean; error?: string }>('virtualLibs:delete', id),
      reorder: (orderedIds: string[]) => invoke<{ ok: boolean; error?: string }>('virtualLibs:reorder', orderedIds),
    },
    // #293 D-69 — Anki FSRS-lite rediscovery queue
    rediscovery: {
      queue: (args?: { limit?: number; minDaysSinceView?: number }) =>
        invoke<{
          ok: boolean
          items?: Array<{ mediaId: string; filename: string; thumbPath: string | null; durationSec: number | null; views: number; rating: number; lastViewedAt: number; daysSinceLastView: number; score: number }>
          error?: string
        }>('rediscovery:queue', args),
    },
    // #368 H-144 — BDSM contract & negotiation form
    contract: {
      get: () => invoke<{ ok: boolean; contract?: any; error?: string }>('contract:get'),
      save: (contract: any) => invoke<{ ok: boolean; error?: string }>('contract:save', contract),
      sign: () => invoke<{ ok: boolean; contract?: any; error?: string }>('contract:sign'),
      reset: () => invoke<{ ok: boolean; contract?: any; error?: string }>('contract:reset'),
    },
    // #361 G-137 — kink-discovery recommender (latent kink map)
    kinkDiscovery: {
      run: (args?: { k?: number; ratingMin?: number; recsPerCluster?: number }) => invoke<{
        ok: boolean
        clusters?: Array<{ id: number; memberCount: number; exemplarMediaId: string; exemplarFilename: string; exemplarThumbPath: string | null }>
        recommendations?: Array<{ mediaId: string; filename: string; thumbPath: string | null; durationSec: number | null; clusterId: number; similarity: number }>
        error?: string
      }>('kinkDiscovery:run', args),
    },
    // #298 D-74 — Linear-style triage inbox
    triage: {
      list: (args?: { status?: 'pending' | 'active' | 'archived' | 'rejected'; limit?: number; offset?: number }) =>
        invoke<{
          ok: boolean
          items?: Array<{ id: string; filename: string; path: string; thumbPath: string | null; type: string; durationSec: number | null; addedAt: number; triageStatus: string }>
          total?: number
          error?: string
        }>('triage:list', args ?? {}),
      setStatus: (args: { mediaIds: string[]; status: 'pending' | 'active' | 'archived' | 'rejected' }) =>
        invoke<{ ok: boolean; updated?: number; error?: string }>('triage:setStatus', args),
      setInboxEnabled: (enabled: boolean) =>
        invoke<{ ok: boolean; error?: string }>('triage:setInboxEnabled', enabled),
      getInboxEnabled: () =>
        invoke<{ ok: boolean; enabled?: boolean; error?: string }>('triage:getInboxEnabled'),
    },
    // #299 D-75 — Stash Studios entity (parent of performers + media)
    studios: {
      list: () => invoke<{
        ok: boolean
        studios?: Array<{
          id: string; name: string; aliases: string[]; logo_path: string | null;
          parent_company: string | null; website: string | null; url_patterns: string[];
          created_at: number; updated_at: number; performer_count: number; media_count: number
        }>
        error?: string
      }>('studios:list'),
      create: (args: { name: string; aliases?: string[]; logo_path?: string; parent_company?: string; website?: string; url_patterns?: string[] }) =>
        invoke<{ ok: boolean; id?: string; error?: string }>('studios:create', args),
      update: (args: { id: string; name?: string; aliases?: string[]; logo_path?: string; parent_company?: string; website?: string; url_patterns?: string[] }) =>
        invoke<{ ok: boolean; error?: string }>('studios:update', args),
      delete: (id: string) => invoke<{ ok: boolean; error?: string }>('studios:delete', id),
      assignPerformer: (args: { performerId: string; studioId: string | null }) =>
        invoke<{ ok: boolean; error?: string }>('studios:assignPerformer', args),
      assignMedia: (args: { mediaId: string; studioId: string | null }) =>
        invoke<{ ok: boolean; error?: string }>('studios:assignMedia', args),
      mediaForStudio: (studioId: string) =>
        invoke<{ ok: boolean; media?: Array<{ id: string; filename: string; path: string; thumbPath: string | null; durationSec: number | null }>; error?: string }>('studios:mediaForStudio', studioId),
    },
    // #306 E-82 — inbound webhook receiver (HMAC-signed)
    webhook: {
      status: () => invoke<{ ok: boolean; running?: boolean; port?: number; bindHost?: string; routeCount?: number; error?: string }>('webhook:status'),
      start: (args?: { port?: number; bindHost?: string }) =>
        invoke<{ ok: boolean; port?: number; routes?: Array<{ id: string; path: string; secret: string; description?: string; createdAt: number }>; error?: string }>('webhook:start', args ?? {}),
      stop: () => invoke<{ ok: boolean; error?: string }>('webhook:stop'),
      listRoutes: () =>
        invoke<{ ok: boolean; routes?: Array<{ id: string; path: string; secret: string; description?: string; createdAt: number }>; error?: string }>('webhook:listRoutes'),
      addRoute: (args: { path: string; secret?: string; description?: string }) =>
        invoke<{ ok: boolean; route?: { id: string; path: string; secret: string; description?: string; createdAt: number }; error?: string }>('webhook:addRoute', args),
      removeRoute: (id: string) =>
        invoke<{ ok: boolean; error?: string }>('webhook:removeRoute', id),
    },
    // #380 H-156 — phrase-triggered supercut compiler
    supercut: {
      persistSegments: (args: { mediaId: string; segments: Array<{ startSec: number; endSec: number; text: string }> }) =>
        invoke<{ ok: boolean; count?: number; error?: string }>('supercut:persistSegments', args),
      search: (args: { phrase: string; limit?: number; mediaIdFilter?: string[] }) =>
        invoke<{
          ok: boolean
          hits?: Array<{ mediaId: string; segmentIdx: number; startSec: number; endSec: number; text: string; mediaPath: string; mediaFilename: string }>
          error?: string
        }>('supercut:search', args),
      compile: (args: { hits: any[]; dstPath: string; padBeforeSec?: number; padAfterSec?: number; videoCodec?: string; width?: number; height?: number; fps?: number; maxClips?: number }) =>
        invoke<{ ok: boolean; clipsUsed?: number; durationSec?: number; error?: string }>('supercut:compile', args),
    },
    // #229 — local Whisper word-level VTT
    whisperVtt: (args: { videoPath: string; maxAudioSec?: number; maxLenTokens?: number }) =>
      invoke<{
        ok: boolean
        text?: string
        vtt?: string
        segments?: Array<{ startSec: number; endSec: number; text: string }>
        durationMs?: number
        installDir?: string
        error?: string
      }>('whisper:transcribeVtt', args),
    // #233 — chapter round-trip
    chapters: {
      read: (srcPath: string) =>
        invoke<{ ok: boolean; chapters?: Array<{ startSec: number; endSec: number; title: string }>; error?: string }>('chapters:read', srcPath),
      writeFFMeta: (args: { srcPath: string; dstPath: string; chapters: Array<{ startSec: number; endSec: number; title: string }> }) =>
        invoke<{ ok: boolean; error?: string }>('chapters:writeFFMeta', args),
      exportVtt: (args: { chapters: Array<{ startSec: number; endSec: number; title: string }>; dstPath: string }) =>
        invoke<{ ok: boolean; dstPath?: string; error?: string }>('chapters:exportVtt', args),
      parseVtt: (args: { vttText: string; durationSec: number }) =>
        invoke<{ ok: boolean; chapters?: Array<{ startSec: number; endSec: number; title: string }>; error?: string }>('chapters:parseVtt', args),
    },
    // #225 / #235 / #238 — ffmpeg post-processing
    postProc: {
      toneMapHDR: (args: { srcPath: string; dstPath?: string; tonemap?: 'hable' | 'mobius' | 'reinhard'; peak?: number; videoCodec?: string; crf?: number }) =>
        invoke<{ ok: boolean; dstPath?: string; error?: string }>('postProc:toneMapHDR', args),
      masterAudio: (args: { srcPath: string; dstPath?: string; targetLufs?: number; truePeakDb?: number; lra?: number }) =>
        invoke<{ ok: boolean; dstPath?: string; measured?: any; error?: string }>('postProc:masterAudio', args),
      denoise: (args: { srcPath: string; dstPath?: string; strength?: 'light' | 'medium' | 'heavy'; grain?: number; videoCodec?: string; crf?: number }) =>
        invoke<{ ok: boolean; dstPath?: string; error?: string }>('postProc:denoise', args),
      // #231 vidstab two-pass deshake
      deshake: (args: { srcPath: string; dstPath?: string; shakiness?: number; accuracy?: number; smoothing?: number; crop?: 'black' | 'keep'; videoCodec?: string; crf?: number }) =>
        invoke<{ ok: boolean; dstPath?: string; error?: string }>('postProc:deshake', args),
    },
    // Media tool dialog backends (MediaExporter/Merger/Rotator/WatermarkAdder)
    mediaTools: {
      export: (args: { srcPath: string; dstPath: string; options: { format: string; quality: 'low' | 'medium' | 'high' | 'original'; resolution?: string; fps?: number; startSec?: number; endSec?: number; removeAudio?: boolean } }) =>
        invoke<{ ok: boolean; dstPath?: string; error?: string }>('mediaTools:export', args),
      merge: (args: { srcPaths: string[]; dstPath: string; options?: { outputFormat?: 'mp4' | 'webm' | 'mkv'; reencode?: boolean } }) =>
        invoke<{ ok: boolean; dstPath?: string; error?: string }>('mediaTools:merge', args),
      rotate: (args: { srcPath: string; dstPath: string; options: { rotation: 0 | 90 | 180 | 270; flipH?: boolean; flipV?: boolean } }) =>
        invoke<{ ok: boolean; dstPath?: string; error?: string }>('mediaTools:rotate', args),
      watermark: (args: { srcPath: string; dstPath: string; options: { text?: string; imagePath?: string; position?: 'tl' | 'tr' | 'bl' | 'br' | 'center'; opacity?: number; fontSize?: number; color?: string; imageScale?: number } }) =>
        invoke<{ ok: boolean; dstPath?: string; error?: string }>('mediaTools:watermark', args),
      extractFrames: (args: { srcPath: string; options: { intervalSec: number; outputDir: string; quality?: 'high' | 'medium' | 'low'; width?: number; count?: number } }) =>
        invoke<{ ok: boolean; frames?: Array<{ time: number; path: string }>; error?: string }>('mediaTools:extractFrames', args),
    },
    // #237 — silence + black-frame auto-trim
    autoTrim: {
      analyze: (videoPath: string) => invoke<{
        ok: boolean
        report?: {
          durationSec: number
          silences: Array<{ startSec: number; endSec: number; durationSec: number }>
          blacks: Array<{ startSec: number; endSec: number; durationSec: number }>
          recommendation: { startSec: number; endSec: number; savedSec: number } | null
        }
        error?: string
      }>('autoTrim:analyze', videoPath),
      apply: (args: { srcPath: string; dstPath: string; startSec: number; endSec: number }) =>
        invoke<{ ok: boolean; error?: string }>('autoTrim:apply', args),
    },
    // #182 — SMB share helper (native OS SMB wrapper)
    smbStatus: () =>
      invoke<{ ok: boolean; platform?: NodeJS.Platform; supported?: boolean; shares?: Array<{ name: string; path: string; description: string; ownedByVault: boolean }>; reason?: string | null; error?: string }>('smb:status'),
    smbCreate: (args: { name: string; path: string; description?: string; readOnly?: boolean }) =>
      invoke<{ ok: boolean; error?: string }>('smb:create', args),
    smbRemove: (name: string) =>
      invoke<{ ok: boolean; error?: string }>('smb:remove', name),
    // #184 — AirPlay 2 receiver discovery (Phase 1, discovery only)
    airplayDiscover: (timeoutMs?: number) =>
      invoke<{ ok: boolean; receivers: Array<{ name: string; host: string; port: number; features: string | null; model: string | null; requiresAuth: boolean }>; error?: string }>('airplay:discover', timeoutMs),
    // #202 — Phillips Hue cinema-mode dimming
    hueDiscover: () =>
      invoke<{ ok: boolean; bridges: Array<{ id: string; ip: string }>; error?: string }>('hue:discover'),
    huePair: (bridgeIp: string) =>
      invoke<{ ok: boolean; username?: string; error?: string }>('hue:pair', bridgeIp),
    hueLights: (args: { bridgeIp: string; username: string }) =>
      invoke<{ ok: boolean; lights: Array<{ id: string; name: string; on: boolean; brightness: number; reachable: boolean }>; error?: string }>('hue:lights', args),
    hueCinemaDim: (args: { bridgeIp: string; username: string; lightIds: string[]; targetBri?: number }) =>
      invoke<{ ok: boolean; dimmed?: number; failed?: number; error?: string }>('hue:cinemaDim', args),
    hueCinemaRestore: (args: { bridgeIp: string; username: string; lightIds: string[] }) =>
      invoke<{ ok: boolean; restored?: number; failed?: number; error?: string }>('hue:cinemaRestore', args),
    // #135 — Aesthetic-aware thumbnail picker
    mediaPickAestheticThumb: (args: { mediaId: string; sampleCount?: number }) =>
      invoke<{ ok: boolean; bestTimestampSec?: number; bestScore?: number; candidates?: Array<{ timestampSec: number; score: number }>; error?: string }>('media:pickAestheticThumb', args),
    mediaRegenerateAestheticThumb: (args: { mediaId: string }) =>
      invoke<{ ok: boolean; thumbPath?: string; pick?: any; error?: string }>('media:regenerateAestheticThumb', args),
    // #169 — Auto-reframe to 9:16 / 1:1 / 4:5
    mediaAutoReframePath: (args: { mediaId: string; aspectRatio: '9:16' | '1:1' | '4:5' }) =>
      invoke<{ ok: boolean; path: string | null; error?: string }>('media:autoReframePath', args),
    mediaGenerateAutoReframe: (args: { mediaId: string; aspectRatio: '9:16' | '1:1' | '4:5'; force?: boolean }) =>
      invoke<{ ok: boolean; path?: string; error?: string }>('media:generateAutoReframe', args),
    // #137 — Co-watch recommender (single-user collab filter)
    recoMoreLikeThis: (args: { mediaId: string; limit?: number }) =>
      invoke<{ ok: boolean; items: Array<{ mediaId: string; filename: string; thumbPath: string | null; similarity: number; coCount: number }>; error?: string }>('reco:moreLikeThis', args),
    recoTodaysPicks: (limit?: number) =>
      invoke<{ ok: boolean; items: Array<{ mediaId: string; filename: string; thumbPath: string | null; similarity: number; coCount: number }>; error?: string }>('reco:todaysPicks', limit),
    // #138 — Tag-affinity content recommender (two-tower style)
    recoTagAffinity: (args: { limit?: number; excludeMediaIds?: string[] }) =>
      invoke<{ ok: boolean; items: Array<{ mediaId: string; filename: string; thumbPath: string | null; score: number }>; error?: string }>('reco:tagAffinity', args),
    recoInvalidate: () =>
      invoke<{ ok: boolean; error?: string }>('reco:invalidate'),
    // #179 — Auto-trailer (30s highlight reel)
    mediaAutoTrailerPath: (mediaId: string) =>
      invoke<{ ok: boolean; path: string | null; error?: string }>('media:autoTrailerPath', mediaId),
    mediaGenerateAutoTrailer: (args: { mediaId: string; force?: boolean; useAudioPeaks?: boolean }) =>
      invoke<{ ok: boolean; path?: string; alreadyExisted?: boolean; error?: string }>('media:generateAutoTrailer', args),
    // #154 — Collections (first-class entities, cover art, ordering)
    collectionsList: () =>
      invoke<{ ok: boolean; collections: any[]; error?: string }>('collections:list'),
    collectionsCreate: (args: { name: string; description?: string; color?: string; parentId?: string }) =>
      invoke<{ ok: boolean; id?: string; error?: string }>('collections:create', args),
    collectionsUpdate: (args: { id: string; name?: string; description?: string; color?: string; parentId?: string | null }) =>
      invoke<{ ok: boolean; error?: string }>('collections:update', args),
    collectionsReorder: (orderedIds: string[]) =>
      invoke<{ ok: boolean; error?: string }>('collections:reorder', orderedIds),
    collectionsDelete: (id: string) =>
      invoke<{ ok: boolean; error?: string }>('collections:delete', id),
    collectionsAddMedia: (args: { collectionId: string; mediaIds: string[] }) =>
      invoke<{ ok: boolean; added?: number; error?: string }>('collections:addMedia', args),
    collectionsRemoveMedia: (args: { collectionId: string; mediaIds: string[] }) =>
      invoke<{ ok: boolean; removed?: number; error?: string }>('collections:removeMedia', args),
    collectionsMembers: (collectionId: string) =>
      invoke<{ ok: boolean; members: any[]; error?: string }>('collections:members', collectionId),
    collectionsSetCover: (args: { collectionId: string; sourcePath: string }) =>
      invoke<{ ok: boolean; coverPath?: string; error?: string }>('collections:setCover', args),
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
    getAllStats: () => invoke<{
      ok: boolean
      error?: string
      stats: Array<{ id: string; count: number; durationSec: number; thumbPath?: string }>
    }>('playlists:getAllStats'),
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
    setCustom: (mediaId: string, dataUrl: string) => invoke<{ ok: boolean; thumbPath?: string; error?: string }>('thumbs:setCustom', mediaId, dataUrl),
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
    writeText: (absPath: string, content: string) => invoke<{ ok: boolean; error?: string }>('fs:writeText', absPath, content),
  },

  watchHistory: {
    list: (opts?: { limit?: number; since?: number }) => invoke('watchHistory:list', opts),
    removeEntry: (mediaId: string) => invoke<{ ok: boolean; removed?: number; error?: string }>('watchHistory:removeEntry', mediaId),
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
    onVaultChanged: (cb: () => void) => onBoth('vault:changed', cb),
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
    // Post-nut lockout
    onLockoutChanged: (cb: (state: any) => void) => on('lockout:changed', cb),
    // Xyrene voice intake pipeline
    onXyreneIntakeProcessed: (cb: (payload: { srcPath: string; result: any }) => void) =>
      on('xyrene:intakeProcessed', cb),
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
    // Detector status probes the renderer needs but didn't have a bridge
    // for. Without these, ExtraDetectorsCard treats them as "IPC
    // unavailable" even though the handlers exist.
    beatsStatus: () => invoke<{ installed: boolean; expectedPath: string; sizeBytes?: number }>('ai:beats-status'),
    pannsStatus: () => invoke<{ installed: boolean; expectedPath: string; sizeBytes?: number }>('ai:panns-status'),
    scaffoldStatuses: () => invoke<Record<string, { installed: boolean; expectedPath: string }>>('ai:scaffold-statuses'),
    // Curated one-click ONNX downloader. Lists everything we know how to
    // fetch from permissively-licensed sources; downloadAll iterates and
    // emits per-model progress over ai:extra-download-progress.
    extraDownloadsList: () => invoke<Array<{
      kind: string
      label: string
      filename: string
      expectedPath: string
      installed: boolean
      sizeBytes: number
      expectedBytes: number | null
    }>>('ai:extra-downloads-list'),
    extraDownload: (kind: string) => invoke<{
      ok: boolean
      alreadyPresent?: boolean
      sizeBytes?: number
      path?: string
      kind?: string
      error?: string
    }>('ai:extra-download', { kind }),
    extraDownloadAll: () => invoke<{
      ok: boolean
      results: Array<{ kind: string; ok: boolean; alreadyPresent?: boolean; sizeBytes?: number; error?: string }>
    }>('ai:extra-download-all'),
    onExtraDownloadProgress: (cb: (data: { index: number; total: number; kind: string; label: string }) => void) =>
      on('ai:extra-download-progress', cb),
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
    xyreneCacheVoice: (args?: { voice?: string }) => invoke<{ ok: boolean }>('xyrene:cacheVoice', args),
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
    xyrenePreviewVoice: (args: {
      voice: string
      text?: string
      /** Playback speed multiplier (1.0 default, 0.85 breathy, 1.15 urgent). */
      speed?: number
      /** Pitch shift in semitones (0 default, -2 sultry, +2 playful). */
      pitch?: number
      /** Free-form expression hint forwarded to the XTTS server. */
      expression?: string
    }) =>
      invoke<{ base64: string; mime: string }>('xyrene:previewVoice', args),
    // Voice intake pipeline — user drops .wav/.mp3/.m4a into a watch
    // folder (or picks a file via processOne), service runs the ffmpeg
    // cleanup chain, copies to xyrene-portable voice_samples, pre-warms
    // XTTS embedding via /cache_voice, and writes display metadata.
    xyreneIntakeStatus: async () => {
      const r = await invoke<any>('xyrene:intakeStatus')
      // IPC returns { ok, ...status }; unwrap to just the status fields.
      const { ok: _ok, error: _err, ...status } = r ?? {}
      return status as {
        running: boolean
        folder: string | null
        cleanupMode: 'conservative' | 'standard' | 'aggressive'
        queueDepth: number
        processedCount: number
        failedCount: number
        lastError: string | null
        voiceSamplesDir: string
      }
    },
    xyreneIntakeProcess: (args: { srcPath: string; cleanup?: 'conservative' | 'standard' | 'aggressive'; displayName?: string; description?: string; language?: string; outputSlug?: string }) =>
      invoke<{ ok: boolean; voiceFilename?: string; outputPath?: string; durationSec?: number; cached?: boolean; error?: string }>(
        'xyrene:intakeProcess', args
      ),
    xyreneIntakeStart: (args?: { folder?: string; cleanup?: 'conservative' | 'standard' | 'aggressive' }) =>
      invoke<{ ok: boolean; folder?: string; error?: string }>('xyrene:intakeStart', args ?? {}),
    xyreneIntakeStop: () => invoke<{ ok: boolean }>('xyrene:intakeStop'),
    xyreneVoiceMetadata: async () => {
      const r = await invoke<{ ok: boolean; metadata: Record<string, any> }>('xyrene:voiceMetadata')
      return (r?.metadata ?? {}) as Record<string, {
        displayName?: string
        description?: string
        durationSec?: number | null
        cleanupMode?: 'conservative' | 'standard' | 'aggressive' | 'original'
        addedAt?: string
        source?: 'builtin' | 'intake' | 'manual'
        language?: string
      }>
    },
    xyreneVoiceMetadataSet: (args: { filename: string; displayName?: string; description?: string; language?: string }) =>
      invoke<{ ok: boolean }>('xyrene:voiceMetadataSet', args),
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
    // Soundpack dedup via chromaprint (#262). Scans the soundpack
    // roots, fingerprints each clip, clusters duplicates. Returns
    // groups of identical clips so the user can pick which copy to
    // keep / delete.
    soundpackDedup: (opts?: { soundpackRoots?: string[] }) =>
      invoke<{
        ok: boolean
        groups: Array<{ representative: string; duplicates: string[] }>
        totalScanned: number
        totalDuplicates: number
        error?: string
      }>('soundpack:chromaprint-dedup', opts ?? {}),
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
      /** A few of her past reactions to this same media (across prior
       *  sessions). Surfaced in the prompt with a "you've watched this
       *  before" hint so she can build continuity. */
      pastMemories?: string[]
      /** Cross-video memories — sampled from her global rolling log so
       *  she can reference earlier-today reactions to OTHER media.
       *  Each entry carries the filename + optional mood tag so she
       *  knows what she was feeling about each ("earlier you were
       *  peaking on that brunette"). */
      globalMemories?: Array<{ filename: string; line: string; mood?: string }>
      speak?: boolean
      /** Current XyreneSoundEngine phase; drives her arousal/engagement
       *  values in the prompt so commentary intensity tracks session
       *  escalation. Defaults to a flat 7/8 when omitted. */
      phase?: 'intro' | 'body' | 'build' | 'climax' | 'cooldown'
      /** Persona override — drives prompt framing (goonbud / mistress /
       *  stepsister / boss / cheerleader). Defaults to settings value
       *  or 'goonbud'. */
      persona?: 'goonbud' | 'mistress' | 'stepsister' | 'boss' | 'cheerleader'
      /** When true, the prompt instructs the LLM to OPEN with a
       *  recall-style reference to a past memory of this media. Used
       *  for the first comment after re-enabling on a known video. */
      recallMoment?: boolean
      /** Cheap visual intensity heuristics from a low-res sample of
       *  the frame. Helps the prompt nuance her tone without waiting
       *  for Venice's actual vision pass to complete. */
      sceneMetrics?: {
        brightness: number      // 0-1 avg luma
        skinSaturation: number  // 0-1 skin-tone density
        chaos: number           // 0-1 horizontal edge density
        intensity: number       // 0-1 composite "how intense"
      } | null
      /** Recent things the USER has said via STT voice commands.
       *  Surfaced to the prompt so she can respond to specific
       *  things they've said ("you said you loved this one"). */
      userSaid?: string[]
      /** Body parts she's been fixating on recently. The prompt
       *  surfaces this so she can either lean deeper into the same
       *  area or shift to broaden her commentary. */
      bodyFixation?: string[]
    }) => invoke<{
      text: string | null
      audioBase64: string | null
      audioMime: string | null
    }>('xyrene:comment', args),

    // Streaming TTS — kicks off /tts_stream. The renderer subscribes to
    // 'xyrene:speakStream:chunk' / ':end' / ':error' via window.api.events
    // to receive PCM chunks tagged with the matching streamId.
    xyreneSpeakStream: (args: {
      text: string
      streamId: string
      voice?: string
      language?: string
      speed?: number
      pitch?: number
      expression?: string
    }) =>
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
    /** #181 — WebDAV server wrappers. Mount the library as a network
     *  drive (read-only). Auth uses the same mobile-sync bearer tokens. */
    webdavStart: (args?: { port?: number }) =>
      invoke<{ ok: boolean; port?: number; error?: string }>('webdav:start', args),
    webdavStop: () => invoke<{ ok: boolean }>('webdav:stop'),
    webdavStatus: () => invoke<{ running: boolean; port: number | null }>('webdav:status'),

    /** #200 — Restic backup wrappers. Snapshot pushes a new backup;
     *  Snapshots lists recent ones. Requires settings.backup.resticRepo
     *  + settings.backup.resticPasswordFile configured. */
    resticSnapshot: (args?: { extraPaths?: string[]; tag?: string }) =>
      invoke<{
        ok: boolean
        snapshotId?: string | null
        filesNew?: number | null
        dataAdded?: string | null
        tail?: string
        error?: string
      }>('backup:restic-snapshot', args),
    resticSnapshots: () =>
      invoke<{ ok: boolean; snapshots: Array<any>; error?: string }>('backup:restic-snapshots'),
    /** #185 — Home Assistant MQTT integration. Vault publishes as a
     *  media_player entity via MQTT auto-discovery; HA can automate
     *  around the state + send back commands (play/pause/stop/etc). */
    haStart: (args: { brokerUrl: string; username?: string; password?: string }) =>
      invoke<{ ok: boolean; error?: string }>('homeassistant:start', args),
    haStop: () => invoke<{ ok: boolean; error?: string }>('homeassistant:stop'),
    haPublishState: (state: 'playing' | 'paused' | 'idle' | 'off') =>
      invoke<{ ok: boolean; error?: string }>('homeassistant:publishState', state),
    haStatus: () => invoke<{ connected: boolean }>('homeassistant:status'),

    /** #187 — Synology File Station auth + upload primitives. Two-way
     *  sync + change detection is a follow-on; this surface ships the
     *  primitives so user-level scripts / future cron jobs can compose. */
    synologyAuth: (args?: { host?: string; username?: string; password?: string }) =>
      invoke<{ ok: boolean; sid?: string; error?: string }>('synology:auth', args),
    synologyLogout: () =>
      invoke<{ ok: boolean; wasLoggedIn?: boolean }>('synology:logout'),
    synologyListDir: (args: { folderPath: string }) =>
      invoke<{ ok: boolean; files: any[]; error?: string }>('synology:listDir', args),
    synologyUploadFile: (args: { localPath: string; remoteDir: string; overwrite?: boolean }) =>
      invoke<{ ok: boolean; bytes?: number; error?: string }>('synology:uploadFile', args),

    /** #183 — Chromecast sender. Discovers via mDNS, casts via the
     *  Default Media Receiver. Pairs with the existing DLNA service. */
    chromecastDiscover: () =>
      invoke<{ ok: boolean; devices: Array<{ name: string; host: string }>; error?: string }>('chromecast:discover'),
    chromecastCast: (args: { deviceName: string; mediaUrl: string; title?: string; contentType?: string }) =>
      invoke<{ ok: boolean; error?: string }>('chromecast:cast', args),
    chromecastControl: (args: { deviceName: string; action: 'pause' | 'resume' | 'stop' | 'seek'; seekSeconds?: number }) =>
      invoke<{ ok: boolean; error?: string }>('chromecast:control', args),

    /** #186 — Panic webhook: HTTP POST listener for Frigate / Home
     *  Assistant / any source. On hit, broadcasts 'system:panic' to
     *  the renderer. Optional X-Vault-Secret header for auth. */
    panicWebhookStart: (args?: { port?: number; secret?: string }) =>
      invoke<{ ok: boolean; port?: number; error?: string }>('network:panic-webhook-start', args),
    panicWebhookStop: () =>
      invoke<{ ok: boolean; wasRunning?: boolean }>('network:panic-webhook-stop'),
    panicWebhookStatus: () =>
      invoke<{ running: boolean }>('network:panic-webhook-status'),

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
    // #178 — auto-PMV from one folder + one song
    selectFolder: () => invoke<string | null>('pmv:selectFolder'),
    autoGenerateFromFolder: (options: {
      folderPath: string
      bpm: number
      targetDurationSec?: number
      beatsPerClip?: number
      maxClipSources?: number
      generateCaptions?: boolean
      videoActiveWindow?: number
    }) => invoke<any>('pmv:autoGenerateFromFolder', options),
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
  // RIFE AI frame interpolation (#227 / #255)
  // ═══════════════════════════════════════════════════════════════════════════
  rife: {
    interpolate: (srcPath: string, options: any) => invoke<{ ok: boolean; dstPath?: string; error?: string }>('rife:interpolate', srcPath, options),
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // Video diffusion bridge (#377)
  // ═══════════════════════════════════════════════════════════════════════════
  videoDiff: {
    setEndpoint: (url: string) => invoke<{ ok: boolean }>('videoDiff:setEndpoint', url),
    probe: () => invoke<{ reachable: boolean; models?: string[]; error?: string }>('videoDiff:probe'),
    generate: (req: any, importDir: string) => invoke<{ ok: boolean; mediaId?: string; error?: string }>('videoDiff:generate', req, importDir),
    onProgress: (cb: (p: { progress: number }) => void) => {
      const h = (_e: any, p: any) => cb(p)
      ipcRenderer.on('videoDiff:progress', h)
      return () => ipcRenderer.removeListener('videoDiff:progress', h)
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // Arduino DIY-toy serial bridge (#375)
  // ═══════════════════════════════════════════════════════════════════════════
  arduinoToy: {
    listPorts: () => invoke<Array<{ path: string; manufacturer?: string; productId?: string }>>('arduinoToy:listPorts'),
    open: (path: string, baudRate?: number) => invoke<{ ok: boolean; error?: string }>('arduinoToy:open', path, baudRate),
    setIntensity: (level: number) => invoke<{ ok: boolean; error?: string }>('arduinoToy:setIntensity', level),
    playPattern: (pattern: Array<[number, number]>) => invoke<{ ok: boolean; error?: string }>('arduinoToy:playPattern', pattern),
    stop: () => invoke<{ ok: boolean }>('arduinoToy:stop'),
    close: () => invoke<{ ok: boolean }>('arduinoToy:close'),
    status: () => invoke<{ connected: boolean; path: string; ready: boolean; lastError: string | null }>('arduinoToy:status'),
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // Veilid private-routing bridge (#268)
  // ═══════════════════════════════════════════════════════════════════════════
  veilid: {
    setEndpoint: (url: string) => invoke<{ ok: boolean }>('veilid:setEndpoint', url),
    status: () => invoke<{ reachable: boolean; publicInternetReady: boolean; localNetworkReady: boolean; nodeId?: string; error?: string }>('veilid:status'),
    newPrivateRoute: () => invoke<{ ok: boolean; routeId?: string; error?: string }>('veilid:newPrivateRoute'),
    send: (routeId: string, payloadB64: string) => invoke<{ ok: boolean; error?: string }>('veilid:send', routeId, payloadB64),
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // Bluesky labeler (#273)
  // ═══════════════════════════════════════════════════════════════════════════
  bskyLabeler: {
    start: (port?: number) => invoke<{ ok: boolean; port?: number; error?: string }>('bskyLabeler:start', port),
    stop: () => invoke<{ ok: boolean }>('bskyLabeler:stop'),
    list: (uri?: string) => invoke<Array<{ uri: string; val: string; src: string; cts: number }>>('bskyLabeler:list', uri),
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // Nostr NIP-46 remote signer (#282)
  // ═══════════════════════════════════════════════════════════════════════════
  nostr: {
    loadConfig: () => invoke<{ pubkeyHex: string; defaultRelay: string; trustedClients: string[] } | null>('nostr:loadConfig'),
    generateKeypair: (defaultRelay?: string) => invoke<{ pubkeyHex: string; defaultRelay: string }>('nostr:generateKeypair', defaultRelay),
    bunkerUri: () => invoke<{ uri: string; secret: string } | null>('nostr:bunkerUri'),
    trust: (clientPubkeyHex: string) => invoke<{ ok: boolean }>('nostr:trust', clientPubkeyHex),
    revoke: (clientPubkeyHex: string) => invoke<{ ok: boolean }>('nostr:revoke', clientPubkeyHex),
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // Tor onion service (#283)
  // ═══════════════════════════════════════════════════════════════════════════
  tor: {
    start: (torBinaryPath: string, httpPort: number) => invoke<{ ok: boolean; error?: string }>('tor:start', torBinaryPath, httpPort),
    stop: () => invoke<{ ok: boolean }>('tor:stop'),
    status: () => invoke<{ running: boolean; onion: string | null; pid: number | null; lastError: string | null }>('tor:status'),
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // WebTransport HTTP/3 server (#276)
  // ═══════════════════════════════════════════════════════════════════════════
  wt: {
    start: (port: number, bearerToken: string) => invoke<{ ok: boolean; port?: number; fingerprintHex?: string; error?: string }>('wt:start', port, bearerToken),
    stop: () => invoke<{ ok: boolean }>('wt:stop'),
    status: () => invoke<{ running: boolean; port: number; fingerprintHex: string }>('wt:status'),
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // Iroh blob ticket sharing (#265)
  // ═══════════════════════════════════════════════════════════════════════════
  iroh: {
    share: (absPath: string) => invoke<{ ticket: string; qrDataUrl: string }>('iroh:share', absPath),
    download: (ticket: string, dstPath: string) => invoke<{ ok: boolean; bytes?: number; error?: string }>('iroh:download', ticket, dstPath),
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // Hyperswarm trusted-device mesh (#266)
  // ═══════════════════════════════════════════════════════════════════════════
  mesh: {
    loadState: () => invoke<{ topic: string; deviceName: string; trustedFingerprints: string[] }>('mesh:loadState'),
    saveState: (state: any) => invoke<{ ok: boolean }>('mesh:saveState', state),
    start: (state: any) => invoke<{ ok: boolean; error?: string }>('mesh:start', state),
    stop: () => invoke<{ ok: boolean }>('mesh:stop'),
    peers: () => invoke<Array<{ fingerprint: string; deviceName: string }>>('mesh:peers'),
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // Helia (IPFS) pinning (#267)
  // ═══════════════════════════════════════════════════════════════════════════
  helia: {
    pin: (absPath: string) => invoke<{ ok: boolean; cid?: string; gatewayUrl?: string; error?: string }>('helia:pin', absPath),
    unpin: (cid: string) => invoke<{ ok: boolean; error?: string }>('helia:unpin', cid),
    list: () => invoke<string[]>('helia:list'),
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // Syncthing REST control plane (#269)
  // ═══════════════════════════════════════════════════════════════════════════
  syncthing: {
    loadConfig: () => invoke<{ baseUrl: string; hasKey: boolean } | null>('syncthing:loadConfig'),
    saveConfig: (baseUrl: string, apiKey?: string) => invoke<{ ok: boolean }>('syncthing:saveConfig', baseUrl, apiKey),
    call: (op: string, ...args: any[]) => invoke<{ ok: boolean; status: number; data?: any; error?: string }>('syncthing:call', op, ...args),
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // UnifiedPush distributor (#275)
  // ═══════════════════════════════════════════════════════════════════════════
  up: {
    register: (endpoint: { appId: string; endpoint: string; deviceName?: string }) => invoke<{ ok: boolean }>('up:register', endpoint),
    unregister: (appId: string) => invoke<{ ok: boolean }>('up:unregister', appId),
    list: () => invoke<Array<{ appId: string; endpoint: string; deviceName?: string; registeredAt: number }>>('up:list'),
    notify: (appId: string, payload: string) => invoke<{ ok: boolean; error?: string }>('up:notify', appId, payload),
    broadcast: (payload: string) => invoke<{ delivered: number; failed: number }>('up:broadcast', payload),
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // WebRTC signaling bridge (#277)
  // ═══════════════════════════════════════════════════════════════════════════
  webrtc: {
    newSession: () => invoke<string>('webrtc:newSession'),
    sendSignal: (frame: any) => invoke<{ ok: boolean }>('webrtc:sendSignal', frame),
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // IMAP inbox watcher (#313)
  // ═══════════════════════════════════════════════════════════════════════════
  imap: {
    loadConfig: () => invoke<any>('imap:loadConfig'),
    saveConfig: (config: any) => invoke<{ ok: boolean }>('imap:saveConfig', config),
    start: () => invoke<{ ok: boolean; error?: string }>('imap:start'),
    stop: () => invoke<{ ok: boolean }>('imap:stop'),
    status: () => invoke<{ running: boolean }>('imap:status'),
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // Obsidian-style backlinks (#297)
  // ═══════════════════════════════════════════════════════════════════════════
  backlinks: {
    find: (mediaId: string, limit?: number) => invoke<{
      mediaId: string
      refs: Array<{
        mediaId: string
        filename: string | null
        thumbPath: string | null
        source: string
        detail: string
        score: number
      }>
    }>('backlinks:find', mediaId, limit),
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // Color palette index (#286)
  // ═══════════════════════════════════════════════════════════════════════════
  palette: {
    indexOne: (mediaId: string) => invoke<{ ok: boolean }>('palette:indexOne', mediaId),
    indexAll: () => invoke<{ indexed: number; skipped: number; failed: number }>('palette:indexAll'),
    filter: (rgb: [number, number, number], tolerance?: number, limit?: number) =>
      invoke<string[]>('palette:filter', rgb, tolerance, limit),
    get: (mediaId: string) => invoke<Array<{ name: string; rgb: [number, number, number]; population: number }> | null>('palette:get', mediaId),
    onProgress: (cb: (p: { done: number; total: number }) => void) => {
      const h = (_e: any, p: any) => cb(p)
      ipcRenderer.on('palette:progress', h)
      return () => ipcRenderer.removeListener('palette:progress', h)
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // Export pipeline + rclone push (#322)
  // ═══════════════════════════════════════════════════════════════════════════
  exportPipeline: {
    list: () => invoke<any[]>('exportPipeline:list'),
    save: (recipe: any) => invoke<{ ok: boolean }>('exportPipeline:save', recipe),
    delete: (name: string) => invoke<{ ok: boolean }>('exportPipeline:delete', name),
    run: (recipe: any) => invoke<{ ok: boolean; results: any[] }>('exportPipeline:run', recipe),
    onEvent: (cb: (ev: any) => void) => {
      const handler = (_e: any, payload: any) => cb(payload)
      ipcRenderer.on('exportPipeline:event', handler)
      return () => ipcRenderer.removeListener('exportPipeline:event', handler)
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // Sidecar-aware metadata watcher (#323)
  // ═══════════════════════════════════════════════════════════════════════════
  sidecarWatcher: {
    start: (roots: string[]) => invoke<{ ok: boolean; alreadyRunning?: boolean }>('sidecarWatcher:start', roots),
    stop: () => invoke<{ ok: boolean; wasRunning: boolean }>('sidecarWatcher:stop'),
    status: () => invoke<{ running: boolean; roots: string[] }>('sidecarWatcher:status'),
    addRoot: (root: string) => invoke<{ ok: boolean }>('sidecarWatcher:addRoot', root),
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // EXIF / XMP via exiftool-vendored (#243 / #309)
  // ═══════════════════════════════════════════════════════════════════════════
  exif: {
    read: (filePath: string) => invoke<{ ok: boolean; tags?: Record<string, any>; error?: string }>('exif:read', filePath),
    write: (filePath: string, patch: Record<string, any>, options?: { sidecar?: boolean }) =>
      invoke<{ ok: boolean; sidecarPath?: string; error?: string }>('exif:write', filePath, patch, options),
    importSidecar: (filePath: string) => invoke<{ ok: boolean; tags?: Record<string, any>; error?: string }>('exif:import-sidecar', filePath),
    exportSidecar: (filePath: string) => invoke<{ ok: boolean; sidecarPath?: string; error?: string }>('exif:export-sidecar', filePath),
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // #331 — MessagePort bus open. Returns a wrapped MessagePort-like
  // interface with post() + onMessage() + close(). Main process responds
  // to a `mpb:<channel>` postMessage with the actual MessagePort transfer.
  //
  // We can't expose MessagePort directly through contextBridge (structured
  // clone rejects it), so we wrap the port internally and re-expose POJO
  // methods. Each call returns a fresh port — close it when done.
  // ═══════════════════════════════════════════════════════════════════════════
  messagePort: {
    open: (channel: 'scrub-thumbs' | 'haptic' | 'audio-meter') => {
      return new Promise<{
        post: (msg: any) => void
        onMessage: (cb: (msg: any) => void) => () => void
        close: () => void
      }>((resolve, reject) => {
        const channelName = `mpb:${channel}`
        const portHandler = (event: Electron.IpcRendererEvent) => {
          ipcRenderer.removeListener(channelName, portHandler)
          const port = event.ports[0]
          if (!port) return reject(new Error('no port transferred'))
          const listeners = new Set<(msg: any) => void>()
          port.onmessage = (e: MessageEvent) => listeners.forEach((l) => { try { l(e.data) } catch { /* ignore */ } })
          port.start()
          resolve({
            post: (msg: any) => { try { port.postMessage(msg) } catch { /* ignore */ } },
            onMessage: (cb) => { listeners.add(cb); return () => listeners.delete(cb) },
            close: () => { try { port.close() } catch { /* ignore */ }; listeners.clear() },
          })
        }
        ipcRenderer.on(channelName, portHandler as any)
        ipcRenderer.invoke('messagePort:open', channel).catch((err) => {
          ipcRenderer.removeListener(channelName, portHandler)
          reject(err)
        })
      })
    },
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

    /** #107 — Bluesky custom feed (at:// URI). Hits feed-skeleton
     *  endpoint instead of global search. */
    blueskyFeed: (args: { feedAtUri: string; perPage?: number; page?: number }) =>
      invoke<{ ok: boolean; posts?: any[]; hasMore?: boolean; page?: number; error?: string }>(
        'booru:bluesky-feed', args
      ),

    /** #109 — Pixiv R-18 discovery modes (daily ranking / recommended) */
    pixivDiscover: (args: {
      mode: 'rankingDayR18' | 'recommended'
      perPage?: number
      page?: number
    }) => invoke<{ ok: boolean; posts?: any[]; hasMore?: boolean; page?: number; error?: string }>(
      'booru:pixiv-discover', args
    ),

    /** #205 — Native SauceNAO lookup. Returns results as Browse posts
     *  so the renderer can display them in the same grid as a normal
     *  search instead of opening a browser tab. */
    saucenaoSearch: (args: { imageUrl: string }) =>
      invoke<{ ok: boolean; posts?: any[]; hasMore?: boolean; page?: number; error?: string }>(
        'booru:saucenao-search', args
      ),

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
