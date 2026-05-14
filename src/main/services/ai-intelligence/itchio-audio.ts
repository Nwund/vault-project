// File: src/main/services/ai-intelligence/itchio-audio.ts
//
// itch.io NSFW audio scraper (#73). itch.io hosts hundreds of free
// + paid NSFW soundpacks (ASMR creators, hentai voice clips, foley
// for animators). They publish a "NSFW Sounds & Music" collection
// at /c/3415447/nsfw-sounds-and-music that we scrape for the user
// to import into the Xyrene soundpack library.
//
// itch.io has TWO useful endpoints we exploit:
//
//   1. Collection JSON feed:
//      https://itch.io/c/3415447/nsfw-sounds-and-music.json
//      Returns JSON with `content` HTML embedded, plus pagination.
//
//   2. Tag-search HTML page:
//      https://itch.io/games/tag-audio?nsfw=on&page=N
//      Returns HTML cards we regex-extract.
//
// We prefer (1) — JSON is more stable than HTML scraping. (2) is a
// fallback for free-text search the collection doesn't cover.
//
// We DON'T attempt to download the actual audio files here — itch.io
// downloads require either purchase or page-level "free download"
// detection. This module just surfaces the LIST of soundpacks; the
// user clicks Open to handle the actual download manually.

import https from 'node:https'

export interface ItchioGame {
  id: string
  title: string
  shortDescription: string | null
  url: string
  thumbUrl: string | null
  authorName: string | null
  priceLabel: string | null   // "Free", "$2.50", "Name your own price", etc.
}

interface ItchioCollectionJSON {
  content?: string
  num_items?: number
  page?: number
}

function fetchHtml(host: string, urlPath: string): Promise<string> {
  return new Promise((resolve) => {
    const req = https.request({
      hostname: host,
      port: 443,
      path: urlPath,
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        Accept: 'text/html,application/json',
      },
      timeout: 15_000,
    }, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        const loc = res.headers.location
        try {
          const next = loc.startsWith('http') ? new URL(loc) : new URL(loc, `https://${host}${urlPath}`)
          res.resume()
          fetchHtml(next.hostname, next.pathname + next.search).then(resolve)
          return
        } catch { resolve(''); return }
      }
      const chunks: Buffer[] = []
      res.on('data', (c: Buffer) => chunks.push(c))
      res.on('end', () => {
        if (!res.statusCode || res.statusCode >= 400) { resolve(''); return }
        resolve(Buffer.concat(chunks).toString('utf8'))
      })
    })
    req.on('error', () => resolve(''))
    req.on('timeout', () => { try { req.destroy() } catch { /* ignore */ }; resolve('') })
    req.end()
  })
}

/**
 * Parse itch.io game cards out of an HTML chunk. Used by both the
 * collection-JSON path (which embeds card HTML in a `content` field)
 * and the tag-search HTML page path.
 *
 * Cards in itch.io look like:
 *   <div class="game_cell" data-game_id="123456">
 *     <a class="thumb_link" href="https://user.itch.io/slug">
 *       <div class="thumb_image_holder" ...>
 *         <img class="lazy_loaded" data-lazy_src="https://...">
 *       <div class="game_cell_data">
 *         <div class="game_title"><a class="title game_link">Title</a></div>
 *         <div class="game_text">Short description</div>
 *         <div class="game_author">by <a>Author</a></div>
 *         <div class="price_value">Free / $X.XX / etc</div>
 *
 * Each capture is best-effort; missing fields fall through as null.
 */
function parseItchCards(html: string): ItchioGame[] {
  const games: ItchioGame[] = []
  const cardRe = /<div[^>]+class="[^"]*game_cell[^"]*"[\s\S]*?(?=<div[^>]+class="[^"]*game_cell|<\/(?:div|section)>\s*<\/(?:div|section)>|$)/g
  let m: RegExpExecArray | null
  while ((m = cardRe.exec(html)) !== null) {
    const card = m[0]
    const idMatch = /data-game_id="(\d+)"/.exec(card)
    const linkMatch = /<a[^>]+class="[^"]*(?:thumb_link|game_link|title)[^"]*"[^>]+href="([^"]+)"/.exec(card)
    const titleMatch = /<a[^>]+class="[^"]*title[^"]*"[^>]*>([^<]+)</.exec(card)
                    ?? /<div[^>]+class="[^"]*game_title[^"]*"[^>]*>\s*(?:<a[^>]*>)?([^<]+)/.exec(card)
    const thumbMatch = /(?:data-lazy_src|data-original|src)="(https:\/\/img\.itch\.zone\/[^"]+)"/.exec(card)
    const authorMatch = /<a[^>]+class="[^"]*game_author[^"]*"[^>]*>([^<]+)</.exec(card)
                     ?? /<div[^>]+class="[^"]*game_author[^"]*"[^>]*>(?:[^<]*<a[^>]*>)?([^<]+)/.exec(card)
    const priceMatch = /<div[^>]+class="[^"]*price_value[^"]*"[^>]*>([^<]+)</.exec(card)
    const descMatch = /<div[^>]+class="[^"]*game_text[^"]*"[^>]*>([^<]+)</.exec(card)
    if (!idMatch || !linkMatch) continue
    games.push({
      id: idMatch[1],
      title: titleMatch?.[1]?.trim() ?? 'untitled',
      shortDescription: descMatch?.[1]?.trim() ?? null,
      url: linkMatch[1],
      thumbUrl: thumbMatch?.[1] ?? null,
      authorName: authorMatch?.[1]?.trim() ?? null,
      priceLabel: priceMatch?.[1]?.trim() ?? null,
    })
  }
  return games
}

/**
 * Fetch one page of the NSFW Sounds & Music collection from itch.io.
 * Returns up to ~30 games per page (server-controlled).
 *
 * The collection id (3415447) is hardcoded — itch.io collection URLs
 * are stable so this stays valid unless the collection is deleted.
 */
export async function fetchItchioNsfwAudioCollection(
  page: number = 1
): Promise<{ ok: boolean; games: ItchioGame[]; hasMore: boolean; error?: string }> {
  const urlPath = `/c/3415447/nsfw-sounds-and-music.json?page=${Math.max(1, page)}`
  const body = await fetchHtml('itch.io', urlPath)
  if (!body) return { ok: false, games: [], hasMore: false, error: 'fetch failed' }
  let parsed: ItchioCollectionJSON
  try {
    parsed = JSON.parse(body)
  } catch {
    // itch.io occasionally returns plain HTML on JSON paths during
    // outages — fall back to HTML parsing of the wrapper page.
    const games = parseItchCards(body)
    return { ok: games.length > 0, games, hasMore: games.length >= 20 }
  }
  const content = parsed.content ?? ''
  const games = parseItchCards(content)
  return {
    ok: true,
    games,
    hasMore: games.length >= 20,  // itch.io serves ~36 per page; <20 → near end
  }
}

/**
 * Free-text search across itch.io games tagged "audio" with NSFW
 * filter enabled. Used when the user wants something more specific
 * than the curated collection (e.g. "tentacle asmr" or "femdom voice").
 */
export async function searchItchioNsfwAudio(
  query: string,
  page: number = 1
): Promise<{ ok: boolean; games: ItchioGame[]; hasMore: boolean; error?: string }> {
  const q = query.trim()
  if (!q) {
    return fetchItchioNsfwAudioCollection(page)
  }
  const urlPath = `/games/tag-audio?nsfw=on&q=${encodeURIComponent(q)}&page=${Math.max(1, page)}`
  const body = await fetchHtml('itch.io', urlPath)
  if (!body) return { ok: false, games: [], hasMore: false, error: 'fetch failed' }
  const games = parseItchCards(body)
  return {
    ok: true,
    games,
    hasMore: games.length >= 20,
  }
}
