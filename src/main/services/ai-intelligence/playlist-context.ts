// Shared builder for the "playlist context" soft-prior prompt block.
//
// When the user has manually filed a media item into one or more NAMED
// (manual) playlists, those groupings are a strong, human-curated signal
// about the theme/subject. We surface the playlist name(s), the most
// common tags across the sibling videos in those playlists, and a few
// example sibling titles, so Tier 2 (Venice) can keep tags/title/
// description/filename consistent within a collection.
//
// Smart/auto playlists (isSmart=1) are excluded — their membership is
// rule-derived, not curation. Returns '' when the media is in no named
// playlist, so appending the block to any prompt is a no-op then.
//
// Used by both the main analysis queue (processing-queue.ts) and the
// one-off regenerate-title / regenerate-description IPCs (index.ts).

// Minimal structural type so this module doesn't depend on better-sqlite3
// typings — every caller passes a real better-sqlite3 Database.
type RawDb = { prepare(sql: string): { all(...params: any[]): any[] } }

export function buildPlaylistContextBlock(rawDb: RawDb, mediaId: string): string {
  try {
    const playlists = rawDb.prepare(`
      SELECT p.id AS id, p.name AS name
      FROM playlists p
      JOIN playlist_items pi ON pi.playlistId = p.id
      WHERE pi.mediaId = ? AND COALESCE(p.isSmart, 0) = 0
    `).all(mediaId) as Array<{ id: string; name: string }>

    const names = playlists.map(p => p.name).filter(n => n && n.trim())
    if (names.length === 0) return ''

    const playlistIds = playlists.map(p => p.id)
    const ph = playlistIds.map(() => '?').join(',')

    // Most common tags across sibling videos in the same playlist(s).
    let tagList: string[] = []
    try {
      const rows = rawDb.prepare(`
        SELECT t.name AS name, COUNT(*) AS c
        FROM playlist_items pi
        JOIN media_tags mt ON mt.mediaId = pi.mediaId
        JOIN tags t ON t.id = mt.tagId
        WHERE pi.playlistId IN (${ph}) AND pi.mediaId != ?
        GROUP BY t.id
        ORDER BY c DESC
        LIMIT 20
      `).all(...playlistIds, mediaId) as Array<{ name: string; c: number }>
      tagList = rows.map(r => r.name).filter(Boolean)
    } catch { /* tags optional */ }

    // A few sibling titles for thematic grounding — prefer the
    // user-approved title, fall back to the AI-suggested one.
    let titleList: string[] = []
    try {
      const rows = rawDb.prepare(`
        SELECT COALESCE(ar.approved_title, ar.suggested_title) AS title
        FROM playlist_items pi
        JOIN ai_analysis_results ar ON ar.media_id = pi.mediaId
        WHERE pi.playlistId IN (${ph}) AND pi.mediaId != ?
          AND TRIM(COALESCE(ar.approved_title, ar.suggested_title, '')) != ''
        GROUP BY title
        LIMIT 6
      `).all(...playlistIds, mediaId) as Array<{ title: string }>
      titleList = rows.map(r => r.title).filter(Boolean)
    } catch { /* titles optional */ }

    const quoted = names.map(n => `"${n}"`).join(', ')
    let block = `\n\nPLAYLIST CONTEXT — the user manually filed this media into ${names.length === 1 ? 'the playlist' : 'playlists'}: ${quoted}. This is a strong, human-curated signal about the theme/subject. Use the playlist name(s) as a soft prior for the tags, title, and description — but override it if the frames clearly disagree.`
    if (tagList.length) {
      block += ` Sibling videos in the same playlist are commonly tagged: [${tagList.join(', ')}]. Prefer these tags when the frames support them.`
    }
    if (titleList.length) {
      block += ` Example titles of sibling videos: ${titleList.map(t => `"${t}"`).join('; ')}.`
    }
    return block
  } catch (err) {
    console.warn('[PlaylistContext] lookup failed:', err)
    return ''
  }
}
