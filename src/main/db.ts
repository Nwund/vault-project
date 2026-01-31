// ===============================
// File: src/main/db.ts
// ===============================
import Database from 'better-sqlite3'
import { app } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import { nanoid } from 'nanoid'
import { runMigrations } from './migrations'
import type {
  DaylistRow,
  JobRow,
  MarkerRow,
  MediaRow,
  MediaStatsRow,
  MediaType,
  PlaylistRow,
  TagRow
} from './types'

export type DB = ReturnType<typeof createDb>

function ensureDir(p: string): void {
  fs.mkdirSync(p, { recursive: true })
}

function clampInt(n: number, min: number, max: number) {
  const x = Math.trunc(n)
  return Math.max(min, Math.min(max, x))
}

export function createDb() {
  const dir = path.join(app.getPath('userData'), 'db')
  ensureDir(dir)
  const dbPath = path.join(dir, 'vault.sqlite3')
  const db = new (Database as any)(dbPath)
  db.pragma('journal_mode = WAL')
  runMigrations(db)

  const stmts = {
    upsertMedia: db.prepare(`
      INSERT INTO media (id, type, path, filename, ext, size, mtimeMs, addedAt, durationSec, thumbPath, width, height, hashSha256, phash)
      VALUES (@id, @type, @path, @filename, @ext, @size, @mtimeMs, @addedAt, @durationSec, @thumbPath, @width, @height, @hashSha256, @phash)
      ON CONFLICT(path) DO UPDATE SET
        type=excluded.type,
        filename=excluded.filename,
        ext=excluded.ext,
        size=excluded.size,
        mtimeMs=excluded.mtimeMs,
        durationSec=excluded.durationSec,
        thumbPath=excluded.thumbPath,
        width=excluded.width,
        height=excluded.height,
        hashSha256=excluded.hashSha256,
        phash=excluded.phash
      RETURNING *;
    `),
    getMediaByPath: db.prepare(`SELECT * FROM media WHERE path = ? LIMIT 1;`),
    updateMediaById: db.prepare(`
      UPDATE media SET
        type=@type, path=@path, filename=@filename, ext=@ext, size=@size,
        mtimeMs=@mtimeMs, durationSec=@durationSec, thumbPath=@thumbPath,
        width=@width, height=@height, hashSha256=@hashSha256, phash=@phash
      WHERE id=@id;
    `),
    getMediaById: db.prepare(`SELECT * FROM media WHERE id = ? LIMIT 1;`),
    listMedia: db.prepare(`
      SELECT DISTINCT m.*
      FROM media m
      LEFT JOIN media_tags mt ON mt.mediaId = m.id
      LEFT JOIN tags t ON t.id = mt.tagId
      WHERE
        (@q = '' OR m.filename LIKE '%' || @q || '%')
        AND (@type = '' OR m.type = @type)
        AND (@tag = '' OR t.name = @tag)
        AND m.analyzeError = 0
      ORDER BY m.addedAt DESC
      LIMIT @limit OFFSET @offset;
    `),
    countMedia: db.prepare(`
      SELECT COUNT(DISTINCT m.id) as n
      FROM media m
      LEFT JOIN media_tags mt ON mt.mediaId = m.id
      LEFT JOIN tags t ON t.id = mt.tagId
      WHERE
        (@q = '' OR m.filename LIKE '%' || @q || '%')
        AND (@type = '' OR m.type = @type)
        AND (@tag = '' OR t.name = @tag)
        AND m.analyzeError = 0;
    `),
    getMedia: db.prepare(`SELECT * FROM media WHERE id = ? LIMIT 1;`),
    updateMediaPath: db.prepare(`UPDATE media SET path = ?, filename = ? WHERE id = ?;`),
    deleteMediaByPath: db.prepare(`DELETE FROM media WHERE path = ?;`),
    deleteMediaById: db.prepare(`DELETE FROM media WHERE id = ?;`),
    listAllMediaPaths: db.prepare(`SELECT id, path FROM media;`),

    listTags: db.prepare(`SELECT * FROM tags ORDER BY name ASC;`),
    getTagByName: db.prepare(`SELECT * FROM tags WHERE name = ? LIMIT 1;`),
    insertTag: db.prepare(`INSERT INTO tags (id, name) VALUES (?, ?);`),
    linkTag: db.prepare(`INSERT OR IGNORE INTO media_tags (mediaId, tagId) VALUES (?, ?);`),
    unlinkTag: db.prepare(`
      DELETE FROM media_tags
      WHERE mediaId = ? AND tagId = (SELECT id FROM tags WHERE name = ? LIMIT 1);
    `),
    listMediaTags: db.prepare(`
      SELECT t.*
      FROM tags t
      JOIN media_tags mt ON mt.tagId = t.id
      WHERE mt.mediaId = ?
      ORDER BY t.name ASC;
    `),

    listMarkers: db.prepare(`SELECT * FROM markers WHERE mediaId = ? ORDER BY timeSec ASC;`),
    insertMarker: db.prepare(`INSERT INTO markers (id, mediaId, timeSec, title, createdAt) VALUES (?, ?, ?, ?, ?);`),
    updateMarker: db.prepare(`UPDATE markers SET title = ?, timeSec = ? WHERE id = ?;`),
    deleteMarker: db.prepare(`DELETE FROM markers WHERE id = ?;`),

    enqueueJob: db.prepare(`
      INSERT INTO jobs (id, type, status, priority, payloadJson, error, createdAt, startedAt, finishedAt)
      VALUES (?, ?, 'queued', ?, ?, NULL, ?, NULL, NULL);
    `),
    claimNextJob: db.prepare(`
      SELECT * FROM jobs
      WHERE status='queued'
      ORDER BY priority DESC, createdAt ASC
      LIMIT 1;
    `),
    markJobRunning: db.prepare(`UPDATE jobs SET status='running', startedAt=? WHERE id=?;`),
    markJobDone: db.prepare(`UPDATE jobs SET status='done', finishedAt=? WHERE id=?;`),
    markJobError: db.prepare(`UPDATE jobs SET status='error', error=?, finishedAt=? WHERE id=?;`),
    listJobs: db.prepare(`SELECT * FROM jobs ORDER BY createdAt DESC LIMIT 200;`),
    hasQueuedJobForMedia: db.prepare(`
      SELECT 1 FROM jobs
      WHERE type='media:analyze' AND status='queued' AND payloadJson LIKE '%' || ? || '%'
      LIMIT 1;
    `),
    resetStaleRunningJobs: db.prepare(`
      UPDATE jobs SET status='queued', startedAt=NULL
      WHERE status='running' AND startedAt < ?;
    `),
    clearThumbPath: db.prepare(`UPDATE media SET thumbPath=NULL WHERE id=?;`),
    markAnalyzeError: db.prepare(`UPDATE media SET analyzeError=1 WHERE id=?;`),
    clearAnalyzeError: db.prepare(`UPDATE media SET analyzeError=0 WHERE id=?;`),
    setTranscodedPath: db.prepare(`UPDATE media SET transcodedPath=? WHERE id=?;`),
    setLoudnessPeakTime: db.prepare(`UPDATE media SET loudnessPeakTime=? WHERE id=?;`),
    getLoudnessPeakTime: db.prepare(`SELECT loudnessPeakTime FROM media WHERE id=? LIMIT 1;`),

    // stats
    getStats: db.prepare(`SELECT * FROM media_stats WHERE mediaId=? LIMIT 1;`),
    upsertStats: db.prepare(`
      INSERT INTO media_stats(mediaId, views, lastViewedAt, rating, oCount, updatedAt)
      VALUES(?, ?, ?, ?, ?, ?)
      ON CONFLICT(mediaId) DO UPDATE SET
        views=excluded.views,
        lastViewedAt=excluded.lastViewedAt,
        rating=excluded.rating,
        oCount=excluded.oCount,
        updatedAt=excluded.updatedAt
      RETURNING *;
    `),
    recordView: db.prepare(`
      INSERT INTO media_stats(mediaId, views, lastViewedAt, rating, oCount, updatedAt)
      VALUES(?, 1, ?, 0, 0, ?)
      ON CONFLICT(mediaId) DO UPDATE SET
        views=views+1,
        lastViewedAt=excluded.lastViewedAt,
        updatedAt=excluded.updatedAt
      RETURNING *;
    `),
    setRating: db.prepare(`
      INSERT INTO media_stats(mediaId, views, lastViewedAt, rating, oCount, updatedAt)
      VALUES(?, 0, NULL, ?, 0, ?)
      ON CONFLICT(mediaId) DO UPDATE SET
        rating=excluded.rating,
        updatedAt=excluded.updatedAt
      RETURNING *;
    `),
    incO: db.prepare(`
      INSERT INTO media_stats(mediaId, views, lastViewedAt, rating, oCount, updatedAt)
      VALUES(?, 0, NULL, 0, 1, ?)
      ON CONFLICT(mediaId) DO UPDATE SET
        oCount=oCount+1,
        updatedAt=excluded.updatedAt
      RETURNING *;
    `),

    // playlists
    listPlaylists: db.prepare(`SELECT * FROM playlists ORDER BY updatedAt DESC;`),
    createPlaylist: db.prepare(`INSERT INTO playlists(id, name, createdAt, updatedAt) VALUES(?, ?, ?, ?);`),
    renamePlaylist: db.prepare(`UPDATE playlists SET name=?, updatedAt=? WHERE id=?;`),
    deletePlaylist: db.prepare(`DELETE FROM playlists WHERE id=?;`),
    deletePlaylistItems: db.prepare(`DELETE FROM playlist_items WHERE playlistId=?;`),
    getPlaylist: db.prepare(`SELECT * FROM playlists WHERE id=? LIMIT 1;`),
    maxPlaylistPos: db.prepare(`SELECT COALESCE(MAX(position), -1) as m FROM playlist_items WHERE playlistId=?;`),
    addPlaylistItem: db.prepare(`INSERT INTO playlist_items(id, playlistId, mediaId, position, addedAt) VALUES(?, ?, ?, ?, ?);`),
    listPlaylistItems: db.prepare(`
      SELECT pi.id as playlistItemId, pi.position, pi.addedAt, m.*
      FROM playlist_items pi
      JOIN media m ON m.id = pi.mediaId
      WHERE pi.playlistId=?
      ORDER BY pi.position ASC;
    `),
    removePlaylistItem: db.prepare(`DELETE FROM playlist_items WHERE id=?;`),
    updatePlaylistItemPos: db.prepare(`UPDATE playlist_items SET position=? WHERE id=?;`),
    touchPlaylist: db.prepare(`UPDATE playlists SET updatedAt=? WHERE id=?;`),

    // search history
    insertSearch: db.prepare(`INSERT INTO search_history(id, query, createdAt) VALUES(?, ?, ?);`),
    listRecentSearches: db.prepare(`SELECT query FROM search_history ORDER BY createdAt DESC LIMIT 50;`),
    suggestFromFilenames: db.prepare(`
      SELECT filename as s FROM media
      WHERE filename LIKE '%' || ? || '%'
      ORDER BY addedAt DESC
      LIMIT 20;
    `),
    suggestFromTags: db.prepare(`
      SELECT name as s FROM tags
      WHERE name LIKE '%' || ? || '%'
      ORDER BY name ASC
      LIMIT 20;
    `),

    // daylists
    getDaylistByKey: db.prepare(`SELECT * FROM daylists WHERE dayKey=? LIMIT 1;`),
    createDaylist: db.prepare(`INSERT INTO daylists(id, dayKey, name, createdAt) VALUES(?, ?, ?, ?);`),
    listDaylists: db.prepare(`SELECT * FROM daylists ORDER BY createdAt DESC LIMIT 30;`),
    deleteDaylistItems: db.prepare(`DELETE FROM daylist_items WHERE daylistId=?;`),
    addDaylistItem: db.prepare(`INSERT INTO daylist_items(id, daylistId, mediaId, position) VALUES(?, ?, ?, ?);`),
    listDaylistItems: db.prepare(`
      SELECT di.position, m.*
      FROM daylist_items di
      JOIN media m ON m.id = di.mediaId
      WHERE di.daylistId=?
      ORDER BY di.position ASC;
    `),

    // recommendations (heuristic support)
    listTopRated: db.prepare(`
      SELECT m.*
      FROM media m
      JOIN media_stats ms ON ms.mediaId=m.id
      WHERE m.type='video'
      ORDER BY ms.rating DESC, ms.views DESC
      LIMIT 200;
    `),
    listMostViewed: db.prepare(`
      SELECT m.*
      FROM media m
      JOIN media_stats ms ON ms.mediaId=m.id
      WHERE m.type='video'
      ORDER BY ms.views DESC
      LIMIT 200;
    `),
    listRecentlyViewed: db.prepare(`
      SELECT m.*
      FROM media m
      JOIN media_stats ms ON ms.mediaId=m.id
      WHERE m.type='video' AND ms.lastViewedAt IS NOT NULL
      ORDER BY ms.lastViewedAt DESC
      LIMIT 200;
    `),
    listMediaWithTag: db.prepare(`
      SELECT m.*
      FROM media m
      JOIN media_tags mt ON mt.mediaId=m.id
      JOIN tags t ON t.id=mt.tagId
      WHERE m.type='video' AND t.name=?
      ORDER BY m.addedAt DESC
      LIMIT 400;
    `)
  }

  function upsertMedia(input: Omit<MediaRow, 'id' | 'addedAt'> & Partial<Pick<MediaRow, 'id' | 'addedAt'>>): MediaRow {
    const now = Date.now()
    const params = {
      id: input.id ?? nanoid(),
      type: input.type,
      path: path.resolve(input.path),
      filename: input.filename,
      ext: input.ext,
      size: input.size,
      mtimeMs: input.mtimeMs,
      addedAt: input.addedAt ?? now,
      durationSec: input.durationSec ?? null,
      thumbPath: input.thumbPath ?? null,
      width: input.width ?? null,
      height: input.height ?? null,
      hashSha256: input.hashSha256 ?? null,
      phash: input.phash ?? null
    }
    try {
      return stmts.upsertMedia.get(params) as MediaRow
    } catch (e: any) {
      if (e.message?.includes('UNIQUE constraint failed: media.id')) {
        // id already exists at a different path — update existing record by id
        stmts.updateMediaById.run(params)
        return stmts.getMediaById.get(params.id) as MediaRow
      }
      throw e
    }
  }

  function listMedia(args: { q?: string; type?: MediaType | ''; tag?: string; limit?: number; offset?: number }) {
    const q = args.q ?? ''
    const type = args.type ?? ''
    const tag = args.tag ?? ''
    const limit = args.limit ?? 50000 // Allow large libraries
    const offset = args.offset ?? 0
    const items = stmts.listMedia.all({ q, type, tag, limit, offset }) as MediaRow[]
    const total = (stmts.countMedia.get({ q, type, tag }) as { n: number }).n
    return { items, total }
  }

  function countMedia(args: { q?: string; type?: string; tag?: string }): number {
    const q = args.q ?? ''
    const type = args.type ?? ''
    const tag = args.tag ?? ''
    return (stmts.countMedia.get({ q, type, tag }) as { n: number }).n
  }

  function ensureTag(name: string): TagRow {
    const existing = stmts.getTagByName.get(name) as TagRow | undefined
    if (existing) return existing
    const id = nanoid()
    stmts.insertTag.run(id, name)
    return { id, name }
  }

  function addTagToMedia(mediaId: string, tagName: string): void {
    const t = ensureTag(tagName.trim())
    stmts.linkTag.run(mediaId, t.id)
  }

  function statsGet(mediaId: string): MediaStatsRow {
    const now = Date.now()
    const row = stmts.getStats.get(mediaId) as MediaStatsRow | undefined
    if (row) return row
    return stmts.upsertStats.get(mediaId, 0, null, 0, 0, now) as MediaStatsRow
  }

  function statsRecordView(mediaId: string): MediaStatsRow {
    const now = Date.now()
    return stmts.recordView.get(mediaId, now, now) as MediaStatsRow
  }

  function statsSetRating(mediaId: string, rating: number): MediaStatsRow {
    const now = Date.now()
    const r = clampInt(rating, 0, 5)
    return stmts.setRating.get(mediaId, r, now) as MediaStatsRow
  }

  function statsIncO(mediaId: string): MediaStatsRow {
    const now = Date.now()
    return stmts.incO.get(mediaId, now) as MediaStatsRow
  }

  function playlistList(): PlaylistRow[] {
    return stmts.listPlaylists.all() as PlaylistRow[]
  }

  function playlistCreate(name: string): PlaylistRow {
    const now = Date.now()
    const row: PlaylistRow = { id: nanoid(), name: name.trim() || 'New Playlist', createdAt: now, updatedAt: now }
    stmts.createPlaylist.run(row.id, row.name, row.createdAt, row.updatedAt)
    return row
  }

  function playlistRename(id: string, name: string): void {
    stmts.renamePlaylist.run(name.trim() || 'Playlist', Date.now(), id)
  }

  function playlistDelete(id: string): void {
    db.transaction(() => {
      stmts.deletePlaylistItems.run(id)
      stmts.deletePlaylist.run(id)
    })()
  }

  function playlistItems(playlistId: string): Array<{ playlistItemId: string; position: number; addedAt: number; media: MediaRow }> {
    const rows = stmts.listPlaylistItems.all(playlistId) as any[]
    return rows.map((r) => {
      const { playlistItemId, position, addedAt, ...m } = r
      return { playlistItemId, position, addedAt, media: m as MediaRow }
    })
  }

  function playlistAddItems(playlistId: string, mediaIds: string[]): void {
    const now = Date.now()
    const max = (stmts.maxPlaylistPos.get(playlistId) as { m: number }).m
    let pos = Number.isFinite(max) ? max + 1 : 0
    db.transaction(() => {
      for (const mid of mediaIds) {
        stmts.addPlaylistItem.run(nanoid(), playlistId, mid, pos++, now)
      }
      stmts.touchPlaylist.run(Date.now(), playlistId)
    })()
  }

  function playlistRemoveItem(playlistItemId: string): void {
    stmts.removePlaylistItem.run(playlistItemId)
  }

  function playlistMoveItem(playlistId: string, playlistItemId: string, newPos: number): void {
    const items = playlistItems(playlistId)
    const idx = items.findIndex((x) => x.playlistItemId === playlistItemId)
    if (idx < 0) return
    const moving = items[idx]
    const rest = items.filter((x) => x.playlistItemId !== playlistItemId)
    const pos = clampInt(newPos, 0, rest.length)
    rest.splice(pos, 0, moving)

    db.transaction(() => {
      for (let i = 0; i < rest.length; i++) stmts.updatePlaylistItemPos.run(i, rest[i].playlistItemId)
      stmts.touchPlaylist.run(Date.now(), playlistId)
    })()
  }

  function playlistReorder(playlistId: string, itemIds: string[]): void {
    db.transaction(() => {
      for (let i = 0; i < itemIds.length; i++) {
        stmts.updatePlaylistItemPos.run(i, itemIds[i])
      }
      stmts.touchPlaylist.run(Date.now(), playlistId)
    })()
  }

  function searchRecord(query: string): void {
    const q = query.trim()
    if (!q) return
    stmts.insertSearch.run(nanoid(), q.slice(0, 200), Date.now())
  }

  function searchSuggest(query: string): string[] {
    const q = query.trim()
    if (!q) return []
    const out: string[] = []
    const seen = new Set<string>()

    const recent = stmts.listRecentSearches.all() as Array<{ query: string }>
    for (const r of recent) {
      const s = r.query
      if (!s.toLowerCase().includes(q.toLowerCase())) continue
      const key = s.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      out.push(s)
      if (out.length >= 8) return out
    }

    const tags = stmts.suggestFromTags.all(q) as Array<{ s: string }>
    for (const r of tags) {
      const key = r.s.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      out.push(r.s)
      if (out.length >= 12) return out
    }

    const files = stmts.suggestFromFilenames.all(q) as Array<{ s: string }>
    for (const r of files) {
      const key = r.s.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      out.push(r.s)
      if (out.length >= 16) return out
    }

    return out
  }

  function dayKeyNow(): string {
    const d = new Date()
    const yyyy = d.getFullYear()
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const dd = String(d.getDate()).padStart(2, '0')
    return `${yyyy}-${mm}-${dd}`
  }

  function daylistGetOrCreateToday(): DaylistRow {
    const key = dayKeyNow()
    const existing = stmts.getDaylistByKey.get(key) as DaylistRow | undefined
    if (existing) return existing
    const now = Date.now()
    const row: DaylistRow = { id: nanoid(), dayKey: key, name: `Daylist • ${key}`, createdAt: now }
    stmts.createDaylist.run(row.id, row.dayKey, row.name, row.createdAt)
    return row
  }

  function daylistGenerateToday(limit: number, intensity: number = 3): { daylist: DaylistRow; items: MediaRow[] } {
    const daylist = daylistGetOrCreateToday()
    const n = clampInt(limit, 10, 200)
    const intensityLevel = clampInt(intensity, 1, 5)

    // Taste profile: recently viewed + top rated + most viewed
    const recent = stmts.listRecentlyViewed.all() as MediaRow[]
    const rated = stmts.listTopRated.all() as MediaRow[]
    const viewed = stmts.listMostViewed.all() as MediaRow[]

    // Intensity affects how much we weight taste profile vs random
    // 1 (Mild) = 20% taste, 80% random variety
    // 3 (Medium) = 60% taste, 40% random
    // 5 (Extreme) = 100% taste, heavily favor top rated
    const tasteWeight = 0.2 + (intensityLevel - 1) * 0.2 // 0.2 to 1.0
    const tasteSlice = Math.floor(80 * tasteWeight)

    const pool: MediaRow[] = []
    const pushUniq = (arr: MediaRow[], weight: number = 1) => {
      const seen = new Set(pool.map((x) => x.id))
      for (const m of arr) {
        if (seen.has(m.id)) continue
        seen.add(m.id)
        // At higher intensity, duplicate entries for top rated/viewed for weighted selection
        const copies = intensityLevel >= 4 && weight > 1 ? Math.ceil(weight) : 1
        for (let c = 0; c < copies; c++) pool.push(m)
      }
    }

    // Higher intensity = more emphasis on rated content
    if (intensityLevel >= 4) {
      pushUniq(rated.slice(0, tasteSlice), 3) // Triple weight for top rated at high intensity
      pushUniq(viewed.slice(0, tasteSlice), 2)
      pushUniq(recent.slice(0, tasteSlice), 1)
    } else {
      pushUniq(recent.slice(0, tasteSlice))
      pushUniq(rated.slice(0, tasteSlice))
      pushUniq(viewed.slice(0, tasteSlice))
    }

    // Fill with random content based on intensity (lower intensity = more random)
    const randomSlice = Math.floor(500 * (1 - tasteWeight + 0.2))
    if (pool.length < n || intensityLevel <= 2) {
      const all = listMedia({ q: '', type: 'video', tag: '', limit: randomSlice, offset: 0 }).items
      pushUniq(all)
    }

    // shuffle
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[pool[i], pool[j]] = [pool[j], pool[i]]
    }

    // Dedupe after shuffle (weighted entries may have duplicates)
    const uniquePicks: MediaRow[] = []
    const seenIds = new Set<string>()
    for (const m of pool) {
      if (seenIds.has(m.id)) continue
      seenIds.add(m.id)
      uniquePicks.push(m)
      if (uniquePicks.length >= n) break
    }

    const picks = uniquePicks

    db.transaction(() => {
      stmts.deleteDaylistItems.run(daylist.id)
      for (let i = 0; i < picks.length; i++) stmts.addDaylistItem.run(nanoid(), daylist.id, picks[i].id, i)
    })()

    return { daylist, items: picks }
  }

  function daylistList(): DaylistRow[] {
    return stmts.listDaylists.all() as DaylistRow[]
  }

  function daylistItems(daylistId: string): MediaRow[] {
    const rows = stmts.listDaylistItems.all(daylistId) as any[]
    return rows.map((r) => {
      const { position, ...m } = r
      void position
      return m as MediaRow
    })
  }

  function recommendForMedia(mediaId: string, limit: number): MediaRow[] {
    const n = clampInt(limit, 6, 60)
    const tags = (stmts.listMediaTags.all(mediaId) as TagRow[]).map((t) => t.name)
    const seen = new Set<string>([mediaId])
    const scored = new Map<string, { m: MediaRow; score: number }>()

    const bump = (m: MediaRow, s: number) => {
      if (seen.has(m.id)) return
      const cur = scored.get(m.id)
      if (!cur) scored.set(m.id, { m, score: s })
      else cur.score += s
    }

    // tag overlap (dominant)
    for (const t of tags.slice(0, 12)) {
      const list = stmts.listMediaWithTag.all(t) as MediaRow[]
      for (const m of list) bump(m, 10)
    }

    // plus taste profile
    const rated = stmts.listTopRated.all() as MediaRow[]
    for (const m of rated.slice(0, 120)) bump(m, 2)

    const recent = stmts.listRecentlyViewed.all() as MediaRow[]
    for (const m of recent.slice(0, 120)) bump(m, 1)

    const out = [...scored.values()]
      .sort((a, b) => b.score - a.score)
      .map((x) => x.m)
      .slice(0, n)

    // fallback
    if (out.length < n) {
      const all = listMedia({ q: '', type: 'video', tag: '', limit: 300, offset: 0 }).items
      for (const m of all) {
        if (out.length >= n) break
        if (seen.has(m.id)) continue
        if (out.some((x) => x.id === m.id)) continue
        out.push(m)
      }
    }

    return out
  }

  function hasQueuedJobForMedia(mediaId: string): boolean {
    return !!stmts.hasQueuedJobForMedia.get(mediaId)
  }

  function resetStaleRunningJobs(): number {
    const fiveMinAgo = Date.now() - 5 * 60 * 1000
    const result = stmts.resetStaleRunningJobs.run(fiveMinAgo)
    return result.changes
  }

  function clearThumbPath(mediaId: string): void {
    stmts.clearThumbPath.run(mediaId)
  }

  function markAnalyzeError(mediaId: string): void {
    stmts.markAnalyzeError.run(mediaId)
  }

  function clearAnalyzeError(mediaId: string): void {
    stmts.clearAnalyzeError.run(mediaId)
  }

  function enqueueJob(type: string, payload: unknown, priority = 0): string {
    const id = nanoid()
    stmts.enqueueJob.run(id, type, priority, JSON.stringify(payload), Date.now())
    return id
  }

  function claimNextJob(): JobRow | null {
    const j = stmts.claimNextJob.get() as JobRow | undefined
    return j ?? null
  }

  return {
    raw: db,

    upsertMedia,
    deleteMediaByPath: (p: string) => stmts.deleteMediaByPath.run(p),
    deleteMediaById: (id: string) => stmts.deleteMediaById.run(id),
    updateMediaPath: (id: string, newPath: string, newFilename: string) => stmts.updateMediaPath.run(newPath, newFilename, id),
    getMediaByPath: (p: string) => (stmts.getMediaByPath.get(p) as MediaRow | undefined) ?? null,
    listAllMediaPaths: () => stmts.listAllMediaPaths.all() as Array<{ id: string; path: string }>,
    listMedia,
    countMedia,
    getMedia: (id: string) => (stmts.getMedia.get(id) as MediaRow | undefined) ?? null,

    listTags: () => stmts.listTags.all() as TagRow[],
    addTagToMedia,
    removeTagFromMedia: (mediaId: string, tagName: string) => stmts.unlinkTag.run(mediaId, tagName.trim()),
    listMediaTags: (mediaId: string) => stmts.listMediaTags.all(mediaId) as TagRow[],

    listMarkers: (mediaId: string) => stmts.listMarkers.all(mediaId) as MarkerRow[],
    addMarker: (mediaId: string, timeSec: number, title: string) => {
      const row: MarkerRow = {
        id: nanoid(),
        mediaId,
        timeSec,
        title: title.trim() || `Marker @ ${timeSec.toFixed(1)}s`,
        createdAt: Date.now()
      }
      stmts.insertMarker.run(row.id, row.mediaId, row.timeSec, row.title, row.createdAt)
      return row
    },
    updateMarker: (markerId: string, timeSec: number, title: string) => stmts.updateMarker.run(title.trim(), timeSec, markerId),
    deleteMarker: (markerId: string) => stmts.deleteMarker.run(markerId),

    enqueueJob,
    claimNextJob,
    hasQueuedJobForMedia,
    resetStaleRunningJobs,
    clearThumbPath,
    markAnalyzeError,
    clearAnalyzeError,
    setTranscodedPath: (mediaId: string, transcodedPath: string) => stmts.setTranscodedPath.run(transcodedPath, mediaId),
    setLoudnessPeakTime: (mediaId: string, peakTime: number) => stmts.setLoudnessPeakTime.run(peakTime, mediaId),
    getLoudnessPeakTime: (mediaId: string) => {
      const row = stmts.getLoudnessPeakTime.get(mediaId) as { loudnessPeakTime: number | null } | undefined
      return row?.loudnessPeakTime ?? null
    },
    markJobRunning: (id: string) => stmts.markJobRunning.run(Date.now(), id),
    markJobDone: (id: string) => stmts.markJobDone.run(Date.now(), id),
    markJobError: (id: string, err: string) => stmts.markJobError.run(err, Date.now(), id),
    listJobs: () => stmts.listJobs.all() as JobRow[],

    // new
    statsGet,
    statsRecordView,
    statsSetRating,
    statsIncO,

    playlistList,
    playlistCreate,
    playlistRename,
    playlistDelete,
    playlistItems,
    playlistAddItems,
    playlistRemoveItem,
    playlistMoveItem,
    playlistReorder,

    searchRecord,
    searchSuggest,

    daylistGenerateToday,
    daylistList,
    daylistItems,

    recommendForMedia
  }
}
