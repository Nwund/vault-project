// File: src/main/services/ai-intelligence/booru-client.ts
//
// Booru search + download client. Currently targets rule34.xxx; same
// API shape works for gelbooru / safebooru / hypnohub (they all
// inherit from the original Gelbooru codebase). Future: add adapters
// for danbooru and e621 (different schemas).
//
// API: https://api.rule34.xxx/index.php?page=dapi&s=post&q=index&json=1&tags=X&limit=N&pid=PAGE
//
// Returns: array of {id, file_url, preview_url, sample_url, tags,
// rating, score, source, width, height, dir, image}.
//
// Download flow: fetch file_url → save to temp → handed to
// media:importFiles for canonical import into the user's first media
// directory.

import https from 'node:https'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { URL } from 'node:url'

const RULE34_HOST = 'api.rule34.xxx'

export type BooruSource =
  // === Booru family (still-image / GIF-focused) ===
  | 'e621'        // NSFW furry, needs login (we have it)
  | 'rule34'      // NSFW general, needs api_key + user_id (we have it)
  | 'safebooru'   // SFW general, free
  | 'yande.re'    // NSFW anime, free (Moebooru schema)
  | 'konachan'    // NSFW anime, free (Moebooru schema)
  | 'tbib'        // The Big Imageboard — mixed, free
  | 'xbooru'      // NSFW general, free
  | 'hypnohub'    // NSFW hypno fetish, free
  // === Tube family (real-porn video aggregators, embed-based) ===
  | 'eporner'     // Eporner — free JSON API, returns embed URLs
  | 'redtube'     // RedTube — free JSON API, returns embed URLs
  | 'pornhub'     // PornHub — RapidAPI, paid (search + trending + download)
  | 'xnxx'        // xnxx.com — RapidAPI, paid (search + download)
  | 'redgifs'     // RedGifs — free temp-token, direct CDN MP4s (NSFW reddit GIF home)
  | 'e926'        // e926 — SFW twin of e621 (same API, rating:s locked)
  | 'gelbooru'    // gelbooru.com — needs api_key+user_id (free) since 2024
  | 'realbooru'   // realbooru.com — real-photo "booru", needs api_key
  | 'danbooru'    // danbooru.donmai.us — richest tag taxonomy; needs api_key
  | 'aibooru'     // aibooru.online — Danbooru-software clone for AI-anime
  | 'civitai'     // civitai.com — AI-image gallery with full prompt metadata
  | 'bluesky'     // public.api.bsky.app — labeled NSFW posts (porn/sexual)
  | 'reddit'      // oauth.reddit.com — curated NSFW subreddit crawler
  | 'paheal'      // rule34.paheal.net — Shimmie2 software, danbooru-XML API
  | 'spankbang'   // spankbang.com — HTML scrape of /s/<query>/ search page
  | 'erome'       // erome.com — HTML scrape of /search?q=<query>
  | 'motherless'  // motherless.com — HTML scrape of /term/videos/<query>
  | 'pixiv'       // pixiv.net — /ajax/search/illustrations + R-18 mode
  | 'pullpush'    // api.pullpush.io — Pushshift successor (Reddit archive). No auth required.
  // NOTE: rule34.us / XVideos / xHamster don't expose usable public
  // APIs — would need scraping. Add later if demand warrants.

const SOURCE_HOSTS: Record<BooruSource, string> = {
  e621: 'e621.net',
  rule34: 'api.rule34.xxx',
  safebooru: 'safebooru.org',
  'yande.re': 'yande.re',
  konachan: 'konachan.com',
  tbib: 'tbib.org',
  xbooru: 'xbooru.com',
  hypnohub: 'hypnohub.net',
  eporner: 'www.eporner.com',
  redtube: 'api.redtube.com',
  pornhub: 'pornhub-api-xnxx.p.rapidapi.com',
  xnxx: 'porn-xnxx-api-v2-sale.p.rapidapi.com',
  redgifs: 'api.redgifs.com',
  e926: 'e926.net',
  gelbooru: 'gelbooru.com',
  realbooru: 'realbooru.com',
  danbooru: 'danbooru.donmai.us',
  aibooru: 'aibooru.online',
  civitai: 'civitai.com',
  bluesky: 'public.api.bsky.app',
  reddit: 'oauth.reddit.com',
  paheal: 'rule34.paheal.net',
  spankbang: 'spankbang.com',
  erome: 'www.erome.com',
  motherless: 'motherless.com',
  pixiv: 'www.pixiv.net',
  pullpush: 'api.pullpush.io',
}

const SOURCE_FAMILY: Record<BooruSource, 'e621' | 'moebooru' | 'gelbooru' | 'eporner' | 'redtube' | 'pornhub' | 'xnxx' | 'redgifs' | 'e926' | 'danbooru' | 'civitai' | 'bluesky' | 'reddit' | 'paheal' | 'spankbang' | 'erome' | 'motherless' | 'pixiv' | 'pullpush'> = {
  e621: 'e621',
  'yande.re': 'moebooru',
  konachan: 'moebooru',
  rule34: 'gelbooru',
  safebooru: 'gelbooru',
  tbib: 'gelbooru',
  xbooru: 'gelbooru',
  hypnohub: 'gelbooru',
  eporner: 'eporner',
  redtube: 'redtube',
  pornhub: 'pornhub',
  xnxx: 'xnxx',
  redgifs: 'redgifs',
  e926: 'e926',
  gelbooru: 'gelbooru',
  realbooru: 'gelbooru',
  danbooru: 'danbooru',
  aibooru: 'danbooru',  // same software as danbooru.donmai.us
  civitai: 'civitai',
  bluesky: 'bluesky',
  reddit: 'reddit',
  paheal: 'paheal',
  spankbang: 'spankbang',
  erome: 'erome',
  motherless: 'motherless',
  pixiv: 'pixiv',
  pullpush: 'pullpush',
}

/** CDN base for URL reconstruction on gelbooru-style boorus. Most
 *  serve their own files from the same host, but rule34 splits files
 *  onto a CDN subdomain. */
const SOURCE_CDN: Record<string, string> = {
  'api.rule34.xxx': 'https://api-cdn.rule34.xxx',
  'safebooru.org': 'https://safebooru.org',
  'tbib.org': 'https://tbib.org',
  'xbooru.com': 'https://xbooru.com',
  'hypnohub.net': 'https://hypnohub.net',
}

export interface BooruPost {
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
  /** From the response — used to verify the file is reachable. */
  hash?: string
  /** Civitai-only: model + version anchors so the renderer can pivot
   *  to "More from this model / LoRA" without re-parsing the source URL. */
  civitaiModelId?: number
  civitaiModelVersionId?: number
}

// Legacy / XML-derived rule34 schema sometimes returns directory+image
// instead of pre-formed URLs. We patch results to always have file_url
// / preview_url / sample_url populated.
interface RawRule34Post extends Partial<BooruPost> {
  directory?: string
  image?: string
  hash?: string
}

function patchUrlsIfMissing(post: RawRule34Post): BooruPost {
  // Construct URLs from directory + image if pre-formed ones are missing.
  // Format used by rule34.xxx (and other gelbooru-derived sites):
  //   full:    https://api-cdn.rule34.xxx/images/<dir>/<image>
  //   sample:  https://api-cdn.rule34.xxx/samples/<dir>/sample_<hash>.jpg
  //   thumb:   https://api-cdn.rule34.xxx/thumbnails/<dir>/thumbnail_<hash>.jpg
  // The CDN domain changed a few times; api-cdn.rule34.xxx is current.
  const dir = post.directory ?? ''
  const img = post.image ?? ''
  const hash = post.hash ?? ''
  const fileUrl = post.file_url
    || (dir && img ? `https://api-cdn.rule34.xxx/images/${dir}/${img}` : '')
  const sampleUrl = post.sample_url
    || (dir && hash ? `https://api-cdn.rule34.xxx/samples/${dir}/sample_${hash}.jpg` : fileUrl)
  const previewUrl = post.preview_url
    || (dir && hash ? `https://api-cdn.rule34.xxx/thumbnails/${dir}/thumbnail_${hash}.jpg` : sampleUrl)
  return {
    id: Number(post.id ?? 0),
    file_url: fileUrl,
    preview_url: previewUrl,
    sample_url: sampleUrl,
    tags: post.tags ?? '',
    rating: post.rating ?? 'questionable',
    score: Number(post.score ?? 0),
    source: post.source ?? '',
    width: Number(post.width ?? 0),
    height: Number(post.height ?? 0),
    hash,
  }
}

export interface BooruSearchResult {
  posts: BooruPost[]
  hasMore: boolean
  page: number
}

const USER_AGENT = 'Vault/1.0 (private adult media library)'

function fetchJson(host: string, urlPath: string, basicAuth?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const headers: Record<string, string> = {
      'User-Agent': USER_AGENT,
      Accept: 'application/json',
    }
    if (basicAuth) {
      headers.Authorization = `Basic ${Buffer.from(basicAuth).toString('base64')}`
    }
    const req = https.request({
      hostname: host,
      port: 443,
      path: urlPath,
      method: 'GET',
      headers,
      timeout: 15_000,
    }, (res) => {
      const chunks: Buffer[] = []
      res.on('data', (c: Buffer) => chunks.push(c))
      res.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf8')
        if (!res.statusCode || res.statusCode >= 400) {
          reject(new Error(`Booru ${urlPath} → ${res.statusCode}: ${body.slice(0, 200)}`))
        } else {
          resolve(body)
        }
      })
    })
    req.on('error', reject)
    req.on('timeout', () => req.destroy(new Error('Booru request timed out')))
    req.end()
  })
}

/**
 * GET an HTML page. Used by the scrape-based source adapters
 * (SpankBang, Erome, Motherless) that don't expose JSON APIs.
 * Returns the body as a UTF-8 string, or an empty string on
 * non-2xx / network failure — the caller decides whether an empty
 * result is "no matches" or "error."
 */
function fetchHtml(host: string, urlPath: string, headers: Record<string, string> = {}): Promise<string> {
  return new Promise((resolve) => {
    const req = https.request({
      hostname: host,
      port: 443,
      path: urlPath,
      method: 'GET',
      headers: { 'User-Agent': USER_AGENT, Accept: 'text/html', ...headers },
      timeout: 15_000,
    }, (res) => {
      // Follow one redirect — many tube sites redirect /search → /s/.
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        const loc = res.headers.location
        try {
          const next = loc.startsWith('http') ? new URL(loc) : new URL(loc, `https://${host}${urlPath}`)
          res.resume()
          fetchHtml(next.hostname, next.pathname + next.search, headers).then(resolve)
          return
        } catch {
          resolve('')
          return
        }
      }
      const chunks: Buffer[] = []
      res.on('data', (c: Buffer) => chunks.push(c))
      res.on('end', () => {
        if (!res.statusCode || res.statusCode >= 400) {
          console.warn(`[fetchHtml] ${host}${urlPath} → ${res.statusCode}`)
          resolve('')
          return
        }
        resolve(Buffer.concat(chunks).toString('utf8'))
      })
    })
    req.on('error', (err) => {
      console.warn(`[fetchHtml] ${host}${urlPath} failed:`, err.message)
      resolve('')
    })
    req.on('timeout', () => { try { req.destroy() } catch { /* ignore */ }; resolve('') })
    req.end()
  })
}

function fetchBinary(fileUrl: string, outPath: string): Promise<{ bytes: number }> {
  return new Promise((resolve, reject) => {
    const url = new URL(fileUrl)
    const req = https.request({
      hostname: url.hostname,
      port: 443,
      path: url.pathname + url.search,
      method: 'GET',
      headers: { 'User-Agent': USER_AGENT },
      timeout: 30_000,
    }, (res) => {
      if (!res.statusCode || res.statusCode >= 400) {
        reject(new Error(`Download ${fileUrl} → ${res.statusCode}`))
        return
      }
      const stream = fs.createWriteStream(outPath)
      let bytes = 0
      res.on('data', (c: Buffer) => {
        bytes += c.length
      })
      res.pipe(stream)
      stream.on('finish', () => stream.close(() => resolve({ bytes })))
      stream.on('error', (err) => {
        try { fs.unlinkSync(outPath) } catch { /* ignore */ }
        reject(err)
      })
    })
    req.on('error', reject)
    req.on('timeout', () => req.destroy(new Error(`Download ${fileUrl} timed out`)))
    req.end()
  })
}

/**
 * Multi-source booru search. Routes to the right API per source:
 *   - e621      → /posts.json, HTTP Basic auth from settings
 *   - safebooru → gelbooru-style /index.php?page=dapi (SFW only)
 *   - yande.re  → /post.json (Moebooru schema)
 *   - konachan  → /post.json (same as yande.re)
 *   - rule34    → /index.php?page=dapi (currently requires auth — listed
 *                 for future-proofing when the user adds an API key)
 * Each source returns the canonical BooruPost shape after normalization.
 */
/** #119 — Civitai pivot search by model / version. Wraps the
 *  internal searchCivitai with the modelId/modelVersionId opts.
 *  Other booru clients don't have this concept; Civitai-only export. */
export async function searchCivitaiByModel(args: {
  modelId?: number
  modelVersionId?: number
  perPage?: number
  page?: number
}): Promise<BooruSearchResult> {
  return searchCivitai('', args.perPage ?? 30, args.page ?? 0, {
    modelId: args.modelId,
    modelVersionId: args.modelVersionId,
  })
}

export async function searchBooru(
  source: BooruSource,
  tags: string,
  options?: { perPage?: number; page?: number }
): Promise<BooruSearchResult> {
  const perPage = Math.min(100, Math.max(1, options?.perPage ?? 30))
  const page = Math.max(0, options?.page ?? 0)
  const host = SOURCE_HOSTS[source]
  if (!host) throw new Error(`Unknown booru source: ${source}`)

  const family = SOURCE_FAMILY[source]
  if (family === 'e621') return searchE621(tags, perPage, page)
  if (family === 'moebooru') return searchMoebooru(host, tags, perPage, page)
  if (family === 'eporner') return searchEporner(tags, perPage, page)
  if (family === 'redtube') return searchRedtube(tags, perPage, page)
  if (family === 'pornhub') return searchPornhub(tags, perPage, page)
  if (family === 'xnxx') return searchXnxx(tags, perPage, page)
  if (family === 'redgifs') return searchRedGifs(tags, perPage, page)
  // e926 = SFW e621 — same auth, same schema, force rating:s lock.
  if (family === 'e926') {
    const safeTags = tags.includes('rating:') ? tags : `${tags} rating:s`.trim()
    return searchE621(safeTags, perPage, page, 'e926.net')
  }
  if (family === 'danbooru') return searchDanbooru(tags, perPage, page, source === 'aibooru' ? 'aibooru.online' : 'danbooru.donmai.us')
  if (family === 'civitai') return searchCivitai(tags, perPage, page)
  if (family === 'bluesky') return searchBluesky(tags, perPage, page)
  if (family === 'reddit') return searchReddit(tags, perPage, page)
  if (family === 'paheal') return searchPaheal(tags, perPage, page)
  if (family === 'pullpush') return searchPullPush(tags, perPage, page)
  if (family === 'spankbang') return searchSpankBang(tags, perPage, page)
  if (family === 'erome') return searchErome(tags, perPage, page)
  if (family === 'motherless') return searchMotherless(tags, perPage, page)
  if (family === 'pixiv') return searchPixiv(tags, perPage, page)
  return searchGelbooruStyle(host, tags, perPage, page)
}

// ─── Pixiv R-18 ──────────────────────────────────────────────────
// Public Ajax JSON endpoint:
//   GET /ajax/search/illustrations/<keyword>?
//       word=<keyword>&order=date_d&mode=r18&p=<n>&s_mode=s_tag&type=illust_and_ugoira
// Requires:
//   - User-Agent header (Pixiv 403s requests without one)
//   - Referer: https://www.pixiv.net/
//   - For R-18: a logged-in session via the PHPSESSID cookie. Anonymous
//     queries get an empty result on r18 mode. The user supplies the
//     cookie via settings.ai.pixivSessionId.
async function searchPixiv(tags: string, perPage: number, page: number): Promise<BooruSearchResult> {
  void perPage  // Pixiv fixes page size at 60 server-side
  const q = tags.trim() || 'r-18'
  const urlPath = `/ajax/search/illustrations/${encodeURIComponent(q)}`
    + `?word=${encodeURIComponent(q)}`
    + `&order=date_d&mode=r18&p=${page + 1}`
    + `&s_mode=s_tag&type=illust_and_ugoira&lang=en`
  console.log(`[Pixiv] GET https://www.pixiv.net${urlPath}`)

  // Pull session cookie (optional but recommended).
  let cookie = ''
  try {
    const { getSettings } = await import('../../settings')
    const { decryptString } = await import('../secure-storage')
    const ai = (getSettings().ai as any) || {}
    const stored = String(ai.pixivSessionId ?? '')
    const plain = decryptString(stored) || stored
    if (plain) cookie = `PHPSESSID=${plain}`
  } catch { /* anonymous mode */ }

  const headers: Record<string, string> = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
    Accept: 'application/json',
    Referer: 'https://www.pixiv.net/',
    'Accept-Language': 'en-US,en;q=0.9',
  }
  if (cookie) headers.Cookie = cookie

  const body = await fetchJsonWithHeaders('www.pixiv.net', urlPath, headers).catch((err) => {
    console.warn('[Pixiv] fetch failed:', err)
    return ''
  })
  if (!body) return { posts: [], hasMore: false, page }
  let parsed: any
  try { parsed = JSON.parse(body) } catch { return { posts: [], hasMore: false, page } }
  if (parsed?.error || !parsed?.body) {
    if (parsed?.message) console.warn(`[Pixiv] API error: ${parsed.message}`)
    return { posts: [], hasMore: false, page }
  }
  const illusts: any[] = parsed.body.illustManga?.data
    ?? parsed.body.illust?.data
    ?? parsed.body.manga?.data
    ?? []
  const posts: BooruPost[] = []
  for (const it of illusts) {
    if (!it?.id) continue
    const id = String(it.id)
    // Pixiv image URLs need the i.pximg.net rewrite; the original
    // thumbnail comes pre-formed in `url` (small) and we construct
    // the regular size from the timestamp pattern when possible.
    const thumb = String(it.url ?? '')
    if (!thumb) continue
    // Original page URL — what we surface as the source.
    const pageUrl = `https://www.pixiv.net/en/artworks/${id}`
    // tags array
    const tagList: string[] = Array.isArray(it.tags)
      ? it.tags.map((t: any) => String(t).toLowerCase().replace(/\s+/g, '_'))
      : []
    posts.push({
      id: Number(id) || stringHash(id),
      // file_url points at the regular-size image. Pixiv serves
      // pximg with a strict Referer policy — yt-dlp / a browser
      // request needs Referer: https://www.pixiv.net/. We rely on
      // the existing fetchBinary path which sets that header for
      // pximg-hosted URLs (see fetchBinary edge case).
      file_url: thumb.replace('/c/250x250_80_a2/', '/c/600x600/').replace('_square1200.', '_master1200.'),
      preview_url: thumb,
      sample_url: thumb,
      tags: tagList.join(' '),
      rating: 'explicit',
      score: Number(it.bookmarkCount ?? it.likeCount ?? 0),
      source: pageUrl,
      width: Number(it.width ?? 0),
      height: Number(it.height ?? 0),
      hash: id,
    })
  }
  const total = Number(parsed.body.illustManga?.total ?? posts.length)
  const seen = (page + 1) * 60
  const hasMore = seen < total
  console.log(`[Pixiv] ${posts.length} illusts (page ${page + 1}/${Math.ceil(total / 60)})`)
  return { posts, hasMore, page }
}

// ─── SpankBang ───────────────────────────────────────────────────
// No public JSON API. Search results page at
//   https://spankbang.com/s/<query>/?p=<page>
// returns HTML with <div class="video-item" ...>. We regex-extract
// the embedded data-* attributes to build BooruPost records. yt-dlp
// (already bundled at resources/bin/yt-dlp.exe) handles the actual
// download from the resulting video URL.
async function searchSpankBang(tags: string, perPage: number, page: number): Promise<BooruSearchResult> {
  void perPage  // SpankBang fixes per-page server-side; the param is for caller compat
  const q = tags.trim()
  const urlPath = q
    ? `/s/${encodeURIComponent(q)}/?p=${page + 1}`
    : `/trending_videos/?p=${page + 1}`
  console.log(`[SpankBang] GET https://spankbang.com${urlPath}`)
  const html = await fetchHtml('spankbang.com', urlPath, {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    Accept: 'text/html,application/xhtml+xml',
  })
  if (!html) return { posts: [], hasMore: false, page }
  const posts: BooruPost[] = []
  // Each card looks like:
  //   <div class="video-item" data-id="ABC123" ...>
  //     <a href="/ABC123/video/...">
  //       <img class="cover" data-src="https://...jpg" ...>
  //   The title sits inside <span class="n">Title</span>.
  const cardRe = /<div[^>]+class="[^"]*video-item[^"]*"[\s\S]*?<\/div>\s*<\/div>/g
  const cards = html.match(cardRe) ?? []
  for (const card of cards) {
    const hrefMatch = /href="(\/[^"]+\/video\/[^"]+)"/.exec(card)
    if (!hrefMatch) continue
    const slug = hrefMatch[1]
    const idMatch = /\/([A-Za-z0-9]+)\/video\//.exec(slug)
    const rawId = idMatch?.[1] ?? slug
    const thumbMatch = /data-src="([^"]+)"|src="([^"]+\.jpg[^"]*)"/.exec(card)
    const thumb = thumbMatch?.[1] ?? thumbMatch?.[2] ?? ''
    const titleMatch = /<span[^>]+class="n"[^>]*>([^<]+)</.exec(card)
            ?? /title="([^"]+)"/.exec(card)
    const title = titleMatch?.[1]?.trim() ?? ''
    const fullUrl = `https://spankbang.com${slug}`
    posts.push({
      id: stringHash(rawId),
      file_url: fullUrl,            // yt-dlp accepts the page URL
      preview_url: thumb,
      sample_url: thumb,
      tags: title.toLowerCase(),
      rating: 'explicit',
      score: 0,
      source: fullUrl,
      width: 0,
      height: 0,
      hash: rawId,
    })
  }
  console.log(`[SpankBang] ${posts.length} posts (page ${page + 1})`)
  return { posts, hasMore: posts.length >= 10, page }
}

// ─── Erome ───────────────────────────────────────────────────────
// erome.com/search?q=<query>&page=<n> — HTML scrape. Erome posts
// can be IMAGE ALBUMS or VIDEOS; we surface both. Each result links
// to /a/<slug> (album page) which yt-dlp can also handle.
async function searchErome(tags: string, perPage: number, page: number): Promise<BooruSearchResult> {
  void perPage
  const q = tags.trim() || 'amateur'
  const urlPath = `/search?q=${encodeURIComponent(q)}&page=${page + 1}`
  console.log(`[Erome] GET https://www.erome.com${urlPath}`)
  const html = await fetchHtml('www.erome.com', urlPath, {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    Accept: 'text/html',
  })
  if (!html) return { posts: [], hasMore: false, page }
  const posts: BooruPost[] = []
  // Result cards: <a class="album-link" href="/a/SLUG"> ... <img src="https://...thumb.jpg">
  const cardRe = /<a[^>]+class="[^"]*album-link[^"]*"[^>]+href="(\/a\/[^"]+)"[\s\S]*?<\/a>/g
  let m: RegExpExecArray | null
  while ((m = cardRe.exec(html)) !== null) {
    const slug = m[1]
    const card = m[0]
    const thumbMatch = /<img[^>]+src="([^"]+)"/.exec(card)
    const titleMatch = /<div[^>]+class="[^"]*title[^"]*"[^>]*>([^<]+)</.exec(card)
                    ?? /alt="([^"]+)"/.exec(card)
    const thumb = thumbMatch?.[1] ?? ''
    const title = titleMatch?.[1]?.trim() ?? ''
    const rawId = slug.split('/').pop() ?? slug
    const fullUrl = `https://www.erome.com${slug}`
    posts.push({
      id: stringHash(rawId),
      file_url: fullUrl,
      preview_url: thumb,
      sample_url: thumb,
      tags: title.toLowerCase(),
      rating: 'explicit',
      score: 0,
      source: fullUrl,
      width: 0,
      height: 0,
      hash: rawId,
    })
  }
  console.log(`[Erome] ${posts.length} albums (page ${page + 1})`)
  return { posts, hasMore: posts.length >= 10, page }
}

// ─── Motherless ──────────────────────────────────────────────────
// motherless.com/term/videos/<query>?page=<n>. HTML scrape.
async function searchMotherless(tags: string, perPage: number, page: number): Promise<BooruSearchResult> {
  void perPage
  const q = tags.trim() || 'amateur'
  // Motherless URL-encodes spaces as "+" and lowercases the query.
  const slug = encodeURIComponent(q).replace(/%20/g, '+').toLowerCase()
  const urlPath = `/term/videos/${slug}?page=${page + 1}`
  console.log(`[Motherless] GET https://motherless.com${urlPath}`)
  const html = await fetchHtml('motherless.com', urlPath, {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    Accept: 'text/html',
  })
  if (!html) return { posts: [], hasMore: false, page }
  const posts: BooruPost[] = []
  // Cards: <div class="thumb-container"> wrapping
  //   <a href="/SLUG"><img class="thumb" data-strip-src="..." src="..." title="..."></a>
  const cardRe = /<div[^>]+class="[^"]*thumb-container[^"]*"[\s\S]*?<\/div>\s*(?=<div|$)/g
  const cards = html.match(cardRe) ?? []
  for (const card of cards) {
    const hrefMatch = /<a[^>]+href="(\/[A-F0-9]+)"/i.exec(card)
    if (!hrefMatch) continue
    const slugId = hrefMatch[1]
    const thumbMatch = /(?:data-strip-src|src)="([^"]+)"/.exec(card)
    const titleMatch = /title="([^"]+)"|alt="([^"]+)"/.exec(card)
    const thumb = thumbMatch?.[1] ?? ''
    const title = (titleMatch?.[1] ?? titleMatch?.[2] ?? '').trim()
    const rawId = slugId.replace(/^\//, '')
    const fullUrl = `https://motherless.com${slugId}`
    posts.push({
      id: stringHash(rawId),
      file_url: fullUrl,
      preview_url: thumb,
      sample_url: thumb,
      tags: title.toLowerCase(),
      rating: 'explicit',
      score: 0,
      source: fullUrl,
      width: 0,
      height: 0,
      hash: rawId,
    })
  }
  console.log(`[Motherless] ${posts.length} posts (page ${page + 1})`)
  return { posts, hasMore: posts.length >= 10, page }
}

// --- Paheal (rule34.paheal.net) — Shimmie2 software with a Danbooru-XML
// API endpoint. Newer Shimmie2 versions removed the legacy
// /api/danbooru/find_posts/index.xml route; the working endpoint is
// /api/danbooru/find_posts?tags=X&limit=N&page=N (Atom XML response).
// No auth required.
async function searchPaheal(tags: string, perPage: number, page: number): Promise<BooruSearchResult> {
  const tagsTrimmed = tags.trim()
  const tagsParam = tagsTrimmed ? `&tags=${encodeURIComponent(tagsTrimmed)}` : ''
  const urlPath = `/api/danbooru/find_posts?limit=${perPage}&page=${page + 1}${tagsParam}`
  console.log(`[Paheal] GET https://rule34.paheal.net${urlPath}`)
  let body = await fetchJson('rule34.paheal.net', urlPath)
  // Some Shimmie2 installs only serve the legacy /index.xml shape — try
  // the fallback before declaring failure.
  if (!body || !body.trim().startsWith('<')) {
    const legacyPath = `/api/danbooru/find_posts/index.xml?limit=${perPage}&page=${page + 1}${tagsParam}`
    console.log(`[Paheal] retry legacy ${legacyPath}`)
    body = await fetchJson('rule34.paheal.net', legacyPath).catch(() => '')
  }
  if (!body || !body.trim().startsWith('<')) {
    console.warn('[Paheal] non-XML response from both endpoints')
    return { posts: [], hasMore: false, page }
  }
  // Light-weight XML attribute extraction — no need for a full parser.
  // Each <post> line has attributes like:
  //   file_url="..." sample_url="..." preview_url="..." tags="..."
  //   id="123" score="5" rating="e" md5="..." width="640" height="480"
  const posts: BooruPost[] = []
  const postRegex = /<post\s+([^>]+)\/?>/g
  let match: RegExpExecArray | null
  const attrRegex = /(\w+)="([^"]*)"/g
  while ((match = postRegex.exec(body)) !== null) {
    const attrs: Record<string, string> = {}
    let am: RegExpExecArray | null
    while ((am = attrRegex.exec(match[1])) !== null) {
      attrs[am[1]] = am[2]
    }
    if (!attrs.file_url) continue
    posts.push({
      id: Number(attrs.id ?? 0),
      file_url: attrs.file_url,
      preview_url: attrs.preview_url || attrs.file_url,
      sample_url: attrs.sample_url || attrs.file_url,
      tags: (attrs.tags || '').toLowerCase(),
      rating: attrs.rating === 's' ? 'safe' : attrs.rating === 'q' ? 'questionable' : 'explicit',
      score: Number(attrs.score ?? 0),
      source: attrs.source || '',
      width: Number(attrs.width ?? 0),
      height: Number(attrs.height ?? 0),
      hash: attrs.md5 || '',
    })
  }
  console.log(`[Paheal] ${posts.length} posts for q="${tagsTrimmed}" page=${page + 1}`)
  return { posts, hasMore: posts.length === perPage, page }
}

// --- PullPush (Reddit archive successor) — no auth required ---
// PullPush is the spiritual successor to Pushshift; mirrors Reddit
// submissions into a public search-able archive. Vault uses it as a
// Reddit-source alternative since Reddit's official Data API now
// requires script-app OAuth and a Responsible Builder Policy
// acknowledgment that's been a UX nightmare for users to navigate.
//
// API: GET /reddit/search/submission/?subreddit=X&q=Y&size=N&over_18=true
// Returns { data: [submission, ...] } where each submission has the
// usual Reddit fields (id, title, url, thumbnail, subreddit, etc).
//
// Pagination: PullPush uses unix-time `before` for backward
// pagination instead of page numbers. We translate page index to
// `before` by tracking the oldest created_utc returned and using it
// as the next page's `before` cutoff.
const _pullpushPageCursors = new Map<string, number>()
async function searchPullPush(tags: string, perPage: number, page: number): Promise<BooruSearchResult> {
  const { pullpushSearchSubmissions } = await import('./pullpush-client')
  const trimmed = tags.trim()
  const cacheKey = trimmed
  // Page 0 resets the cursor; subsequent pages use the stored cutoff.
  let beforeCutoff: number | undefined
  if (page === 0) {
    _pullpushPageCursors.delete(cacheKey)
  } else {
    beforeCutoff = _pullpushPageCursors.get(cacheKey)
  }
  const r = await pullpushSearchSubmissions({
    query: trimmed || undefined,
    size: Math.min(100, Math.max(10, perPage)),
    before: beforeCutoff,
    over18Only: true,
  })
  if (!r.ok) {
    throw new Error(`PullPush: ${r.error ?? 'unknown error'}`)
  }
  const items = r.items
  // Track oldest created_utc for the next page's `before` cutoff.
  if (items.length > 0) {
    const oldest = Math.min(...items.map((x) => x.created_utc ?? Date.now() / 1000))
    _pullpushPageCursors.set(cacheKey, oldest)
  }
  // Map PullPush submissions → BooruPost. Filter out:
  //   - posts with no media URL
  //   - selftext-only posts (is_self === true) — they're text walls
  //   - removed/deleted thumbnails ("default", "self", "spoiler", "nsfw")
  //   - file URLs known to be deleted-image placeholders. PullPush's
  //     archive sometimes outlives the original media host; common
  //     placeholders include Imgur's `removed.png`, the redd.it 404,
  //     and various host-specific deleted indicators.
  const DEAD_URL_PATTERNS = [
    /imgur\.com\/removed\.(png|jpg)/i,
    /i\.imgur\.com\/[a-z0-9]{1,7}\.(png|jpg)$/i,  // imgur 7-char hashes are pre-modern, often dead
    /\/removed\.(png|jpg|webp|gif)/i,
    /\/deleted\.(png|jpg|webp|gif)/i,
    /\/404\.(png|jpg|webp|gif|html)/i,
    /not[-_]?found/i,
    /redgifs\.com\/ifr\/[^/]+\.(png|jpg)$/i,  // RedGifs removed-poster placeholder
    /imgur\.com\/(404|removed|gallery\/0)/i,
    /^https?:\/\/(www\.)?reddit\.com\/login/i,  // private/quarantined sub redirects
  ]
  const isDeadUrl = (url: string): boolean => {
    if (!url) return true
    return DEAD_URL_PATTERNS.some((re) => re.test(url))
  }
  // NSFW subreddit gate. Reddit's `over_18` post flag isn't reliable —
  // SFW subs often don't tag posts as over_18 even when content is
  // adult, and tame meme/news subs sometimes do. We require the
  // subreddit name itself to look NSFW. This catches:
  //   - r/gonewild, r/gonewildaudio, r/PetiteGoneWild, etc.
  //   - r/NSFW411, r/NSFW_GIF, r/NSFW_Korea, etc.
  //   - Anything with porn/nude/hentai/tits/ass/cum/fuck in the name
  //   - Body-part-specific subs (r/legs, r/hugeboobs, r/feet, etc.)
  // The list errs on the side of inclusion — adjust if too noisy.
  const NSFW_SUB_PATTERN = /^(gonewild|nsfw|hentai|porn|nude|nudes|cum|fuck|tits|ass|pussy|cock|dick|bbw|milf|bukkake|gangbang|petite|amateur|asian|asianporn|lesbian|teen|college|realgirls?|girlsfinishingthejob|chubby|pawg|thicc|legs|feet|boobs|hugeboobs|tinytits|onlyfans|altgonewild|barelylegalteens|adorableporn|womenofcolor|holdthemoan|public|publicflashing|squirting|squirt|anal|deepthroat|facefuck|bdsm|spitroast|creampie|breeding|edging|gooning|hentairule34|rule34|trapsgonewild|sissies|crossdressing|trans|futa|monstergirls)/i
  const posts: BooruPost[] = items
    .filter((s) => {
      if (!s.url || s.url.startsWith('https://www.reddit.com/')) return false  // self-post
      if (isDeadUrl(s.url)) return false
      const t = String(s.thumbnail ?? '').toLowerCase()
      if (['default', 'self', 'spoiler', 'nsfw', 'image', ''].includes(t) && !s.preview) return false
      // Thumbnail being a placeholder URL is also a strong signal the
      // source media is gone — drop these even if `url` looks ok.
      if (t.startsWith('http') && isDeadUrl(t)) return false
      // NSFW gate — drop posts from subs whose name doesn't match our
      // adult-content pattern. This is the heuristic that filters out
      // the SFW noise the user reported.
      const sub = String(s.subreddit ?? '')
      if (!NSFW_SUB_PATTERN.test(sub)) return false
      return true
    })
    .map((s) => {
      // Prefer high-res preview if available; fall back to thumbnail.
      const previewUrl = s.preview?.images?.[0]?.source?.url?.replace(/&amp;/g, '&')
        ?? s.thumbnail
        ?? s.url
      const tagsStr = [
        s.subreddit ? `r:${s.subreddit.toLowerCase()}` : '',
        ...(String(s.title ?? '').toLowerCase().split(/\W+/).filter((w) => w.length >= 3).slice(0, 8)),
      ].filter(Boolean).join(' ')
      return {
        id: stringHash(`pullpush-${s.id}`),
        file_url: s.url ?? '',
        preview_url: previewUrl,
        sample_url: previewUrl,
        tags: tagsStr,
        rating: s.over_18 ? 'explicit' : 'safe',
        score: Number(s.score ?? 0),
        source: s.permalink ? `https://reddit.com${s.permalink}` : (s.url ?? ''),
        width: Number(s.preview?.images?.[0]?.source?.width ?? 0),
        height: Number(s.preview?.images?.[0]?.source?.height ?? 0),
        hash: s.id,
      }
    })
  console.log(`[PullPush] ${posts.length}/${items.length} posts for q="${trimmed}" page=${page} before=${beforeCutoff ?? 'none'}`)
  return { posts, hasMore: items.length >= Math.min(100, perPage), page }
}

// --- Reddit (NSFW curated subs) — script-app OAuth ---
// User configures: clientId / clientSecret / username / password / subList.
// Settings stores credentials encrypted. Token cached 50min (Reddit
// tokens live 60min; refresh slightly early to avoid edge-of-expiry
// failures). Search interprets tags as a comma-separated subreddit
// allow-list ("milf,gonewild") or a free-text query against the union
// of subs in the configured list (when no comma is present).
let _redditToken: { token: string; expiresAt: number } | null = null

async function getRedditToken(): Promise<{ token: string; userAgent: string } | null> {
  const { getSettings } = await import('../../settings')
  const { decryptString } = await import('../secure-storage')
  const ai = (getSettings().ai as any) || {}
  const clientId = String(ai.redditClientId ?? '').trim()
  const clientSecret = decryptString(ai.redditClientSecret ?? '') ?? String(ai.redditClientSecret ?? '')
  const username = String(ai.redditUsername ?? '').trim()
  const password = decryptString(ai.redditPassword ?? '') ?? String(ai.redditPassword ?? '')
  if (!clientId || !clientSecret || !username || !password) {
    throw new Error('Reddit needs clientId / clientSecret / username / password (Settings → AI → Reddit). Create a "script" app at reddit.com/prefs/apps.')
  }
  const userAgent = `vault/1.0 (by /u/${username})`

  if (_redditToken && _redditToken.expiresAt > Date.now() + 60_000) {
    return { token: _redditToken.token, userAgent }
  }

  const body = `grant_type=password&username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`
  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')
  return new Promise((resolve) => {
    const req = https.request({
      hostname: 'www.reddit.com',
      port: 443,
      path: '/api/v1/access_token',
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(body),
        'User-Agent': userAgent,
      },
    }, (res) => {
      let data = ''
      res.on('data', (c) => data += c)
      res.on('end', () => {
        if ((res.statusCode ?? 0) >= 400) {
          console.warn(`[Reddit] token request failed: ${res.statusCode} ${data.slice(0, 200)}`)
          resolve(null)
          return
        }
        try {
          const parsed = JSON.parse(data)
          const token = String(parsed.access_token ?? '')
          if (!token) { resolve(null); return }
          // expires_in is in seconds; cache 50min to leave buffer.
          _redditToken = { token, expiresAt: Date.now() + 50 * 60 * 1000 }
          resolve({ token, userAgent })
        } catch (err) {
          console.warn('[Reddit] token parse failed:', err)
          resolve(null)
        }
      })
    })
    req.on('error', () => resolve(null))
    req.write(body)
    req.end()
  })
}

async function searchReddit(tags: string, perPage: number, page: number): Promise<BooruSearchResult> {
  const tok = await getRedditToken()
  if (!tok) throw new Error('Reddit auth failed — verify credentials in Settings → AI → Reddit')

  // Determine sub list and query mode.
  const { getSettings } = await import('../../settings')
  const ai = (getSettings().ai as any) || {}
  const configuredSubs: string[] = String(ai.redditSubList ?? '')
    .split(/[,\n]/).map((s: string) => s.trim()).filter(Boolean)
  // tags can override the configured list when comma-separated subnames.
  // If tags looks like sub names ("milf,gonewild"), treat as override.
  // Otherwise: free-text search across configured subs.
  let subs: string[] = configuredSubs
  let freeText: string | null = null
  if (tags.trim()) {
    if (tags.includes(',') || /^[a-z0-9_]+$/i.test(tags.trim())) {
      subs = tags.split(/[,\s]+/).map((s: string) => s.trim()).filter(Boolean)
    } else {
      freeText = tags.trim()
    }
  }
  if (subs.length === 0) {
    throw new Error('Reddit: no subreddits configured. Add a sub list in Settings → AI → Reddit (e.g. "gonewild,milf").')
  }

  // Fan-out across subs in parallel; concatenate.
  // /r/SUB/hot.json with after= cursor for pagination. We collapse the
  // page param into a per-sub limit (Reddit doesn't support page-N
  // numerically, just cursors).
  const limit = Math.min(100, Math.max(10, perPage))
  const promises = subs.slice(0, 8).map(async (sub: string) => {
    const path = freeText
      ? `/r/${encodeURIComponent(sub)}/search.json?q=${encodeURIComponent(freeText)}&restrict_sr=on&include_over_18=on&limit=${limit}&sort=hot`
      : `/r/${encodeURIComponent(sub)}/hot.json?limit=${limit}&include_over_18=on`
    return new Promise<any[]>((resolve) => {
      const req = https.request({
        hostname: 'oauth.reddit.com',
        port: 443,
        path,
        method: 'GET',
        headers: {
          Authorization: `Bearer ${tok.token}`,
          'User-Agent': tok.userAgent,
        },
      }, (res) => {
        let data = ''
        res.on('data', (c) => data += c)
        res.on('end', () => {
          if ((res.statusCode ?? 0) >= 400) {
            console.warn(`[Reddit /r/${sub}] ${res.statusCode}: ${data.slice(0, 200)}`)
            resolve([])
            return
          }
          try {
            const parsed = JSON.parse(data)
            resolve(parsed?.data?.children ?? [])
          } catch { resolve([]) }
        })
      })
      req.on('error', () => resolve([]))
      req.end()
    })
  })
  const groups = await Promise.all(promises)

  const posts: BooruPost[] = []
  for (const group of groups) {
    for (const child of group) {
      const post = child?.data
      if (!post || !post.over_18) continue
      // Prefer direct video (preview.reddit_video.fallback_url),
      // then redgifs URL, then preview image, then post.url (often
      // already a direct media URL like i.redd.it).
      let fileUrl = ''
      const videoFallback = post.media?.reddit_video?.fallback_url
        || post.preview?.reddit_video_preview?.fallback_url
      const previewImg = post.preview?.images?.[0]?.source?.url
      const directUrl = post.url
      if (typeof videoFallback === 'string') fileUrl = videoFallback
      else if (typeof directUrl === 'string' && /\.(mp4|gif|webm|jpg|jpeg|png|webp)(\?|$)/i.test(directUrl)) {
        fileUrl = directUrl
      } else if (typeof previewImg === 'string') {
        // Reddit HTML-escapes preview URLs.
        fileUrl = previewImg.replace(/&amp;/g, '&')
      } else if (typeof directUrl === 'string' && /redgifs\.com\/watch/i.test(directUrl)) {
        fileUrl = directUrl  // lightbox can resolve redgifs URLs later
      }
      if (!fileUrl) continue

      const thumb = post.thumbnail && /^https?:\/\//.test(post.thumbnail)
        ? post.thumbnail
        : (previewImg ? previewImg.replace(/&amp;/g, '&') : fileUrl)
      const tagBits: string[] = []
      tagBits.push(post.subreddit?.toLowerCase() ?? '')
      // post.link_flair_text often carries category hints.
      if (typeof post.link_flair_text === 'string') {
        for (const t of post.link_flair_text.split(/[\s,]+/)) {
          if (t.length >= 2) tagBits.push(t.toLowerCase().replace(/[^a-z0-9_]+/g, '_'))
        }
      }

      posts.push({
        id: stringHash(post.id ?? `${Date.now()}-${Math.random()}`),
        file_url: fileUrl,
        preview_url: thumb,
        sample_url: fileUrl,
        tags: tagBits.filter(Boolean).join(' '),
        rating: 'explicit',
        score: typeof post.score === 'number' ? post.score : 0,
        source: `https://www.reddit.com${post.permalink ?? ''}`,
        width: Number(post.preview?.images?.[0]?.source?.width ?? 0),
        height: Number(post.preview?.images?.[0]?.source?.height ?? 0),
        hash: String(post.id ?? ''),
      })
    }
  }

  // Sort by score (Reddit's natural rank). De-dupe by id since the
  // same post can appear across multiple subs in rare cases.
  const seen = new Set<number>()
  const unique = posts.filter((p) => {
    if (seen.has(p.id)) return false
    seen.add(p.id)
    return true
  })
  unique.sort((a, b) => b.score - a.score)
  console.log(`[Reddit] ${unique.length} NSFW posts across [${subs.slice(0, 8).join(', ')}]`)
  // Reddit pagination is cursor-based per sub; "hasMore" is roughly true if any sub returned `after`.
  return { posts: unique, hasMore: groups.some((g) => g.length >= limit), page }
}

// --- Bluesky public app-view — free, no key required. Search uses the
// app.bsky.feed.searchPosts xrpc method, filters to posts with image
// embeds and the `porn` / `sexual` label. The AT Protocol returns
// cursor-paginated results; we map page → cursor over a small in-mem
// cache so the user can scroll.
const _bskyCursors = new Map<string, string>()  // query → next cursor
// Cached AT Protocol session token. Created by bskyAuth() using the
// user's handle + app password. Bluesky's public.api.bsky.app started
// returning 403s on /xrpc/app.bsky.feed.searchPosts in 2025 for
// unauthenticated requests; bearer auth fixes it. Tokens last ~2h
// before refresh is needed; we just re-auth on 401/403.
let _bskySession: { accessJwt: string; did: string; expiresAt: number } | null = null

async function bskyAuth(handle: string, appPassword: string): Promise<string | null> {
  if (_bskySession && _bskySession.expiresAt > Date.now() + 60_000) {
    return _bskySession.accessJwt
  }
  return new Promise((resolve) => {
    const payload = Buffer.from(JSON.stringify({ identifier: handle, password: appPassword }), 'utf8')
    const req = https.request({
      hostname: 'bsky.social',
      port: 443,
      path: '/xrpc/com.atproto.server.createSession',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': payload.length,
        Accept: 'application/json',
      },
      timeout: 10_000,
    }, (res) => {
      let body = ''
      res.on('data', (c) => body += c)
      res.on('end', () => {
        if ((res.statusCode ?? 0) >= 400) {
          console.warn(`[Bluesky] auth failed: ${res.statusCode} ${body.slice(0, 200)}`)
          resolve(null)
          return
        }
        try {
          const parsed = JSON.parse(body)
          _bskySession = {
            accessJwt: String(parsed.accessJwt ?? ''),
            did: String(parsed.did ?? ''),
            // accessJwt is good for ~2h; cache 100 min to be safe.
            expiresAt: Date.now() + 100 * 60 * 1000,
          }
          console.log(`[Bluesky] auth ok, did=${_bskySession.did}`)
          resolve(_bskySession.accessJwt)
        } catch {
          resolve(null)
        }
      })
    })
    req.on('error', (err) => { console.warn('[Bluesky] auth request error:', err.message); resolve(null) })
    req.on('timeout', () => { try { req.destroy() } catch {} ; resolve(null) })
    req.write(payload)
    req.end()
  })
}

async function searchBluesky(tags: string, perPage: number, page: number): Promise<BooruSearchResult> {
  const q = tags.trim() || 'nsfw'  // empty query returns nothing; default to broad
  const cursorKey = `${q}|${page}`
  const cursor = page > 0 ? (_bskyCursors.get(`${q}|${page - 1}`) ?? '') : ''
  const params = [
    `q=${encodeURIComponent(q)}`,
    `limit=${Math.min(100, perPage)}`,
    cursor ? `cursor=${encodeURIComponent(cursor)}` : '',
  ].filter(Boolean).join('&')
  const urlPath = `/xrpc/app.bsky.feed.searchPosts?${params}`

  // Auth: pull handle + app password from settings; fetch a session
  // token if we don't have a fresh one. Falls through to unauthenticated
  // request if creds aren't configured (will likely 403 in 2025+).
  const { getSettings } = await import('../../settings')
  const ai = (getSettings().ai as any) || {}
  const handle = String(ai.blueskyHandle ?? '').trim()
  const appPassword = String(ai.blueskyAppPassword ?? '').trim()
  let bearer: string | null = null
  if (handle && appPassword) {
    bearer = await bskyAuth(handle, appPassword)
  }
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'User-Agent': 'vault/2.6.0',
  }
  if (bearer) headers.Authorization = `Bearer ${bearer}`

  // Authenticated requests must go to the user's PDS (bsky.social by
  // default), NOT public.api.bsky.app — the latter is the unauthenticated
  // appview and silently rejects bearer tokens with 403. Both expose the
  // same xrpc endpoints.
  const apiHost = bearer ? 'bsky.social' : 'public.api.bsky.app'
  console.log(`[Bluesky] GET https://${apiHost}${urlPath} (auth=${bearer ? 'bearer' : 'none'})`)
  const body = await new Promise<string>((resolve, reject) => {
    const req = https.request({
      hostname: apiHost,
      port: 443,
      path: urlPath,
      method: 'GET',
      headers,
    }, (res) => {
      let data = ''
      res.on('data', (c) => data += c)
      res.on('end', () => {
        if ((res.statusCode ?? 0) >= 400) {
          // 401/403 may mean expired token — clear cache so next attempt re-auths.
          if (res.statusCode === 401 || res.statusCode === 403) _bskySession = null
          reject(new Error(`Bluesky ${res.statusCode}: ${data.slice(0, 200)}`))
          return
        }
        resolve(data)
      })
    })
    req.on('error', reject)
    req.end()
  })

  let parsed: any
  try { parsed = JSON.parse(body) }
  catch { throw new Error('Bluesky returned non-JSON') }

  const posts: BooruPost[] = []
  for (const post of (parsed.posts ?? []) as any[]) {
    // Filter to NSFW-labeled posts only. Labels can be array of strings
    // or array of {val, src} objects depending on app-view version.
    const labelVals: string[] = Array.isArray(post.labels)
      ? post.labels.map((l: any) => typeof l === 'string' ? l : String(l?.val ?? '')).filter(Boolean)
      : []
    const isNsfw = labelVals.some((v) =>
      ['porn', 'sexual', 'nudity', 'graphic-media'].includes(v.toLowerCase()))
    if (!isNsfw) continue

    const embedImages: any[] = post.embed?.images ?? post.record?.embed?.images ?? []
    if (embedImages.length === 0) continue

    for (let i = 0; i < embedImages.length; i++) {
      const img = embedImages[i]
      const fullSize = String(img.fullsize ?? img.thumb ?? '')
      const thumb = String(img.thumb ?? img.fullsize ?? '')
      if (!fullSize) continue

      // Bluesky records expose hashtags via record.facets and record.text.
      const text = String(post.record?.text ?? '')
      const tagBits: string[] = []
      const hashRe = /#([a-z0-9_]{2,30})/gi
      let m: RegExpExecArray | null
      while ((m = hashRe.exec(text)) !== null) tagBits.push(m[1].toLowerCase())
      for (const l of labelVals) tagBits.push(l.toLowerCase().replace(/[^a-z0-9_]+/g, '_'))

      posts.push({
        id: stringHash(`${post.uri}-${i}`),
        file_url: fullSize,
        preview_url: thumb,
        sample_url: fullSize,
        tags: tagBits.join(' '),
        rating: 'explicit',
        score: typeof post.likeCount === 'number' ? post.likeCount : 0,
        source: `https://bsky.app/profile/${post.author?.handle ?? ''}/post/${String(post.uri ?? '').split('/').pop() ?? ''}`,
        width: Number(img.aspectRatio?.width ?? 0),
        height: Number(img.aspectRatio?.height ?? 0),
        hash: String(post.cid ?? ''),
      })
    }
  }

  // Stash cursor for next page.
  if (parsed.cursor) _bskyCursors.set(cursorKey, String(parsed.cursor))
  console.log(`[Bluesky] ${posts.length} NSFW posts for q="${q}" page=${page}`)
  return { posts, hasMore: !!parsed.cursor, page }
}

// --- Civitai — REST API at /api/v1/images. Returns AI-generated images
// with full prompt + model metadata. Free tier; API key optional but
// raises rate limits. NSFW filter: omit `nsfw=false`, supply explicit
// NsfwLevel — `nsfw=X` accepts None / Soft / Mature / X.
async function searchCivitai(
  tags: string,
  perPage: number,
  page: number,
  opts?: { modelId?: number; modelVersionId?: number }
): Promise<BooruSearchResult> {
  const { getSettings } = await import('../../settings')
  const { decryptString } = await import('../secure-storage')
  const aiSettings = (getSettings().ai as any) || {}
  const storedKey = String(aiSettings.civitaiApiKey ?? '')
  const apiKey = decryptString(storedKey) ?? storedKey
  const qTags = tags.trim()
  // Civitai's image search isn't full-text — it indexes by tag, model,
  // or prompt-substring. We map free-text into the `query` param which
  // hits prompt-substring search. When opts.modelId / modelVersionId
  // are set (#119 — "More from this model" pivot), filter by those
  // instead of free-text query.
  const params = [
    `limit=${perPage}`,
    `page=${page + 1}`,
    `nsfw=X`,  // include the highest tier; renderer can downgrade per-result
    opts?.modelVersionId ? `modelVersionId=${opts.modelVersionId}` : '',
    opts?.modelId && !opts?.modelVersionId ? `modelId=${opts.modelId}` : '',
    !opts?.modelId && !opts?.modelVersionId && qTags ? `query=${encodeURIComponent(qTags)}` : '',
    `sort=${encodeURIComponent('Most Reactions')}`,
  ].filter(Boolean).join('&')
  const urlPath = `/api/v1/images?${params}`
  console.log(`[Civitai] GET https://civitai.com${urlPath}`)
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`
  const body = await new Promise<string>((resolve, reject) => {
    const req = https.request({
      hostname: 'civitai.com',
      port: 443,
      path: urlPath,
      method: 'GET',
      headers,
    }, (res) => {
      let data = ''
      res.on('data', (c) => data += c)
      res.on('end', () => {
        if ((res.statusCode ?? 0) >= 400) {
          reject(new Error(`Civitai ${res.statusCode}: ${data.slice(0, 200)}`))
          return
        }
        resolve(data)
      })
    })
    req.on('error', reject)
    req.end()
  })

  let parsed: any
  try { parsed = JSON.parse(body) }
  catch { throw new Error('Civitai returned non-JSON') }
  const items: any[] = Array.isArray(parsed?.items) ? parsed.items : []
  const posts: BooruPost[] = items
    .filter((p) => p?.url)
    .map((p) => {
      // Tags here are inferred from prompt + meta.tags + model trigger words.
      const tagBits: string[] = []
      if (Array.isArray(p.tags)) {
        for (const t of p.tags) tagBits.push(String(t).toLowerCase().replace(/\s+/g, '_'))
      }
      if (typeof p.meta?.prompt === 'string') {
        // Extract LoRA/embedding triggers + comma-separated tokens.
        const prompt: string = p.meta.prompt
        for (const m of prompt.split(/[,\n]/).map((s: string) => s.trim()).slice(0, 30)) {
          if (m && m.length <= 30 && !m.startsWith('<')) tagBits.push(m.toLowerCase().replace(/\s+/g, '_'))
        }
      }
      // #119 — preserve Civitai model + version IDs from meta so the
      // lightbox can offer "More from this model / LoRA". meta.resources
      // is an array of { type: 'model'|'lora'|..., modelVersionId, ... }
      // — we surface the first model resource as the primary anchor.
      let civitaiModelId: number | undefined
      let civitaiModelVersionId: number | undefined
      if (Array.isArray(p.meta?.resources) && p.meta.resources.length > 0) {
        const primary = p.meta.resources.find((r: any) => r?.type === 'model')
          ?? p.meta.resources[0]
        if (primary?.modelVersionId) civitaiModelVersionId = Number(primary.modelVersionId)
        if (primary?.modelId) civitaiModelId = Number(primary.modelId)
      }
      return {
        id: Number(p.id ?? 0),
        file_url: String(p.url),
        preview_url: String(p.url),
        sample_url: String(p.url),
        tags: tagBits.join(' '),
        rating: p.nsfwLevel === 'None' ? 'safe' : p.nsfwLevel === 'Soft' ? 'questionable' : 'explicit',
        score: Number(p.stats?.likeCount ?? p.stats?.reactionCount ?? 0),
        source: `https://civitai.com/images/${p.id}`,
        width: Number(p.width ?? 0),
        height: Number(p.height ?? 0),
        hash: String(p.hash ?? ''),
        civitaiModelId,
        civitaiModelVersionId,
      } as BooruPost
    })
  console.log(`[Civitai] ${posts.length} posts for q="${qTags}" page=${page + 1}`)
  return { posts, hasMore: !!parsed.metadata?.nextPage, page }
}

// --- Danbooru — REST API, e621-fork schema with different auth model.
// /posts.json with limit + page + tags + login/api_key params. Rate
// limited to 10 req/s for authed users on the read API. Tags use
// underscore_separated, multi-tag URL-encoded as space-separated.
async function searchDanbooru(tags: string, perPage: number, page: number, host: string = 'danbooru.donmai.us'): Promise<BooruSearchResult> {
  const { getSettings } = await import('../../settings')
  const { decryptString } = await import('../secure-storage')
  const aiSettings = (getSettings().ai as any) || {}
  // aibooru uses its own credentials; danbooru.donmai.us uses the
  // danbooru* fields. Per-host so users can have separate accounts.
  const isAibooru = host === 'aibooru.online'
  const username = String(
    isAibooru ? (aiSettings.aibooruUsername ?? '') : (aiSettings.danbooruUsername ?? '')
  ).trim()
  const storedKey = String(
    isAibooru ? (aiSettings.aibooruApiKey ?? '') : (aiSettings.danbooruApiKey ?? '')
  )
  const apiKey = decryptString(storedKey) ?? storedKey
  if (!username || !apiKey) {
    throw new Error(`${host} requires login + api_key (set in AI Tools → Setup → API keys)`)
  }
  const tagsTrimmed = tags.trim()
  const tagsParam = tagsTrimmed ? `&tags=${encodeURIComponent(tagsTrimmed)}` : ''
  const urlPath = `/posts.json?limit=${perPage}&page=${page + 1}${tagsParam}&login=${encodeURIComponent(username)}&api_key=${encodeURIComponent(apiKey)}`
  console.log(`[${host}] GET https://${host}${urlPath.replace(/api_key=[^&]+/, 'api_key=***')}`)
  const body = await fetchJson(host, urlPath)
  let parsed: any[] = []
  try { parsed = JSON.parse(body) } catch {
    return { posts: [], hasMore: false, page }
  }
  if (!Array.isArray(parsed)) return { posts: [], hasMore: false, page }
  const posts: BooruPost[] = parsed
    .filter((p) => p?.file_url)
    .map((p) => ({
      id: Number(p.id ?? 0),
      file_url: String(p.file_url),
      preview_url: String(p.preview_file_url ?? p.large_file_url ?? p.file_url),
      sample_url: String(p.large_file_url ?? p.file_url),
      tags: [
        String(p.tag_string_general ?? ''),
        String(p.tag_string_character ?? ''),
        String(p.tag_string_artist ?? ''),
        String(p.tag_string_copyright ?? ''),
      ].filter(Boolean).join(' ').trim(),
      rating: p.rating === 's' ? 'safe' : p.rating === 'q' ? 'questionable' : p.rating === 'g' ? 'safe' : 'explicit',
      score: Number(p.score ?? 0),
      source: String(p.source ?? ''),
      width: Number(p.image_width ?? 0),
      height: Number(p.image_height ?? 0),
      hash: String(p.md5 ?? ''),
    }))
  console.log(`[Danbooru] ${posts.length} posts for q="${tagsTrimmed}" page=${page + 1}`)
  return { posts, hasMore: posts.length === perPage, page }
}

// --- RedGifs via free temp-token auth ---
// RedGifs is where ~90% of NSFW Reddit GIF traffic actually lives
// (gfycat folded into it in 2023). Auth is free and zero-friction:
// GET /v2/auth/temporary returns a short-lived bearer token; subsequent
// requests sign with it. No account, no API key — perfect for a Browse
// source. Each gif has multiple URL variants; we pick the highest-
// quality direct MP4 from .urls.hd / .urls.sd.
//
// The query maps to /v2/gifs/search?search_text=<tags>&order=trending&count=N&page=N+1.
// Empty queries fall through to /v2/gifs/trending.
let _redgifsToken: { token: string; expiresAt: number } | null = null

async function getRedGifsToken(): Promise<string | null> {
  if (_redgifsToken && _redgifsToken.expiresAt > Date.now() + 60_000) {
    return _redgifsToken.token
  }
  return new Promise((resolve) => {
    const req = https.request({
      hostname: 'api.redgifs.com',
      port: 443,
      path: '/v2/auth/temporary',
      method: 'GET',
      headers: { 'User-Agent': 'Vault/1.0 (https://example.invalid)', Accept: 'application/json' },
    }, (res) => {
      let body = ''
      res.on('data', (c) => body += c)
      res.on('end', () => {
        if ((res.statusCode ?? 0) >= 400) {
          console.warn(`[RedGifs] temp-token request failed: ${res.statusCode} ${body.slice(0, 200)}`)
          resolve(null)
          return
        }
        try {
          const parsed = JSON.parse(body)
          const token = String(parsed.token ?? '')
          if (!token) { resolve(null); return }
          // RedGifs temp tokens last ~24h; cache 23h to leave buffer.
          _redgifsToken = { token, expiresAt: Date.now() + 23 * 3600 * 1000 }
          resolve(token)
        } catch (err) {
          console.warn('[RedGifs] temp-token parse failed:', err)
          resolve(null)
        }
      })
    })
    req.on('error', () => resolve(null))
    req.end()
  })
}

async function searchRedGifs(tags: string, perPage: number, page: number): Promise<BooruSearchResult> {
  const token = await getRedGifsToken()
  if (!token) {
    throw new Error('RedGifs temp-token fetch failed — service unreachable or rate-limited')
  }
  const q = tags.trim()
  const count = Math.max(1, Math.min(100, perPage))
  const pageNum = page + 1  // RedGifs is 1-indexed
  // RedGifs deprecated `/v2/gifs/trending` (now 404 "GifNotFound" — they
  // treat it as a single-gif lookup with id="trending"). Trending is served
  // via `/v2/explore/trending-gifs` (no auth difference, still bearer).
  // Search remains `/v2/gifs/search?search_text=X&order=trending`.
  const pathQ = q
    ? `/v2/gifs/search?search_text=${encodeURIComponent(q)}&order=trending&count=${count}&page=${pageNum}`
    : `/v2/explore/trending-gifs?count=${count}&page=${pageNum}`

  const body = await new Promise<string>((resolve, reject) => {
    const req = https.request({
      hostname: 'api.redgifs.com',
      port: 443,
      path: pathQ,
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        'User-Agent': 'Vault/1.0 (https://example.invalid)',
        Accept: 'application/json',
      },
    }, (res) => {
      let data = ''
      res.on('data', (c) => data += c)
      res.on('end', () => {
        if ((res.statusCode ?? 0) >= 400) {
          reject(new Error(`RedGifs ${pathQ} → ${res.statusCode}: ${data.slice(0, 200)}`))
          return
        }
        resolve(data)
      })
    })
    req.on('error', reject)
    req.end()
  })

  let parsed: any
  try { parsed = JSON.parse(body) }
  catch { throw new Error('RedGifs returned non-JSON') }

  const gifs: any[] = parsed.gifs ?? []
  const posts: BooruPost[] = gifs.map((g) => {
    const urls = g.urls ?? {}
    const directMp4 = urls.hd || urls.sd || urls.silent || urls.mp4 || ''
    const preview = urls.poster || urls.thumbnail || urls.silent || ''
    const tagsStr = Array.isArray(g.tags)
      ? g.tags.map((t: any) => String(t).toLowerCase().replace(/\s+/g, '_')).join(' ')
      : ''
    return {
      id: stringHash(String(g.id ?? `${Date.now()}-${Math.random()}`)),
      file_url: directMp4,
      preview_url: preview,
      sample_url: preview,
      tags: tagsStr,
      rating: 'explicit',
      score: typeof g.likes === 'number' ? g.likes : (typeof g.views === 'number' ? g.views : 0),
      source: `https://www.redgifs.com/watch/${g.id}`,
      width: typeof g.width === 'number' ? g.width : 0,
      height: typeof g.height === 'number' ? g.height : 0,
      hash: String(g.id ?? ''),
    }
  }).filter((p) => p.file_url)

  console.log(`[RedGifs] ${posts.length} posts for q="${q}" page=${pageNum}`)
  return {
    posts,
    // RedGifs response includes total page count; report hasMore based on it.
    hasMore: typeof parsed.pages === 'number' && pageNum < parsed.pages,
    page,
  }
}

// --- xnxx via RapidAPI ---
// Three subscribed providers, three different endpoint conventions:
//   - pornhub-api-xnxx.p.rapidapi.com  POST /api/xnxx/search  {q, pages}   (combined PH+xnxx — also has /api/search but that's PH)
//                                       fallback: /api/search {q}          (rare older variant)
//   - porn-xnxx-api.p.rapidapi.com     POST /search           {q}
//   - porn-xnxx-api-v2-sale.p.rapidapi.com  POST /search      {q}
// Empirical mapping from 2026-05-14 attempts. Try configured host first.
async function searchXnxx(tags: string, _perPage: number, _page: number): Promise<BooruSearchResult> {
  const { getSettings } = await import('../../settings')
  const { decryptString } = await import('../secure-storage')
  const ai = (getSettings().ai as any) || {}
  const storedKey = String(ai.rapidApiKey ?? '')
  const apiKey = (decryptString(storedKey) ?? storedKey).trim()
  const configuredHost = String(ai.rapidApiXnxxHost ?? '').trim()
  if (!apiKey) {
    throw new Error('xnxx source needs a RapidAPI key (set RAPIDAPI_KEY in .api-keys.env)')
  }
  const q = tags.trim() || 'popular'
  type SP = { host: string; path: string; payload: Record<string, any> }
  const allProviders: SP[] = [
    { host: 'pornhub-api-xnxx.p.rapidapi.com',         path: '/api/xnxx/search', payload: { q, pages: 1 } },
    { host: 'porn-xnxx-api.p.rapidapi.com',            path: '/search',          payload: { q } },
    { host: 'porn-xnxx-api-v2-sale.p.rapidapi.com',    path: '/search',          payload: { q } },
  ]
  const providers = configuredHost
    ? [...allProviders.filter((p) => p.host === configuredHost), ...allProviders.filter((p) => p.host !== configuredHost)]
    : allProviders

  let body = ''
  const attempts: string[] = []
  for (const prov of providers) {
    let backoffMs = 800
    let succeeded = false
    for (let attempt429 = 0; attempt429 < 3; attempt429++) {
      try {
        body = await postJsonWithHeaders(prov.host, prov.path, prov.payload, {
          'x-rapidapi-host': prov.host,
          'x-rapidapi-key': apiKey,
          'Content-Type': 'application/json',
        })
        console.log(`[xnxx] search via ${prov.host}${prov.path}${attempt429 > 0 ? ` (after ${attempt429} retry)` : ''}`)
        succeeded = true
        break
      } catch (err: any) {
        const msg = String(err?.message ?? err)
        if (msg.includes('429') && attempt429 < 2) {
          await new Promise((r) => setTimeout(r, backoffMs))
          backoffMs *= 2
          continue
        }
        attempts.push(`${prov.host}${prov.path}: ${msg.slice(0, 100)}`)
        break
      }
    }
    if (succeeded) break
  }
  if (!body) {
    console.warn('[xnxx] search failed across all providers:')
    for (const a of attempts) console.warn(`  - ${a}`)
    throw new Error('xnxx API: no provider responded — check RapidAPI subscription status')
  }
  let arr: any[]
  try { arr = JSON.parse(body) } catch {
    throw new Error(`xnxx returned non-JSON: ${body.slice(0, 200)}`)
  }
  // pornhub-api-xnxx returns { videos: [...] } shape; the dedicated
  // xnxx APIs return a bare array. Normalize.
  if (!Array.isArray(arr) && Array.isArray((arr as any)?.videos)) {
    arr = (arr as any).videos
  }
  if (!Array.isArray(arr)) {
    console.warn('[xnxx] non-array response shape:', JSON.stringify(arr).slice(0, 200))
    return { posts: [], hasMore: false, page: 0 }
  }
  const posts: BooruPost[] = arr
    .map((v) => {
      // Field name varies across providers: dedicated xnxx APIs use
      // video_link; the combined PH+xnxx host may use url or link.
      const viewUrl = v?.video_link ?? v?.url ?? v?.link ?? v?.href ?? ''
      if (!viewUrl) return null
      const rawId = String(viewUrl).match(/video-(\w+)/)?.[1] ?? String(v.title ?? '')
      const thumb = v?.thumbnail ?? v?.thumb ?? v?.poster ?? v?.image ?? ''
      const title = v?.title ?? v?.name ?? ''
      const views = v?.views ?? v?.view_count ?? v?.viewCount ?? '0'
      return {
        id: rawId ? stringHash(rawId) : Date.now() + Math.floor(Math.random() * 1000),
        file_url: viewUrl,  // detected as tube embed via host regex
        preview_url: thumb,
        sample_url: thumb,
        tags: String(title).toLowerCase(),
        rating: 'explicit',
        score: parseViewsToScore(String(views)),
        source: viewUrl,
        width: 0,
        height: 0,
        hash: rawId,
      }
    })
    .filter(Boolean) as BooruPost[]
  console.log(`[xnxx] ${posts.length} posts for q="${q}"`)
  return { posts, hasMore: false, page: 0 }
}

/** Parse "797.4k" / "1.4M97%" / "9.6M99%" → numeric score for sorting. */
function parseViewsToScore(s: string): number {
  const m = s.match(/^([\d.]+)([KkMmBb]?)/)
  if (!m) return 0
  const n = parseFloat(m[1])
  const mult = m[2].toLowerCase() === 'k' ? 1000
    : m[2].toLowerCase() === 'm' ? 1_000_000
    : m[2].toLowerCase() === 'b' ? 1_000_000_000
    : 1
  return Math.round(n * mult)
}

/** Resolve an xnxx watch URL to a direct MP4 via one of three known
 *  RapidAPI xnxx providers. Each provider has a different host +
 *  endpoint path + request shape — we try them in priority order
 *  until one returns a direct URL. This way users who pay for any of
 *  the three subscriptions get working resolution without manual host
 *  config; users with all three get HD path preference automatically.
 *
 *  Provider matrix (researched 2026-05-13):
 *    1. pornhub-api-xnxx.p.rapidapi.com  POST /api/xnxx/download  {url}    — combined PH+xnxx; ULTRA tier supports HD
 *    2. porn-xnxx-api.p.rapidapi.com     POST /download           {video_link}  — dedicated xnxx; MEGA tier
 *    3. porn-xnxx-api-v2-sale.p.rapidapi.com POST /download       {video_link}  — clone of #2 on a discount listing
 *
 *  All three return ~the same shape: { video_high?, video_low? } or
 *  { hd?, sd?, url? }. We normalize to { directUrl, resolution }. */
export async function resolveXnxxDownload(viewUrl: string): Promise<{ directUrl: string; resolution: string } | null> {
  const { getSettings } = await import('../../settings')
  const { decryptString } = await import('../secure-storage')
  const ai = (getSettings().ai as any) || {}
  const storedKey = String(ai.rapidApiKey ?? '')
  const apiKey = (decryptString(storedKey) ?? storedKey).trim()
  if (!apiKey) return null

  // Empirical mapping (2026-05-14): /api/download on pornhub-api-xnxx
  // is the only working endpoint across the three subscribed xnxx APIs.
  // The other two return 403 for /download because that path doesn't
  // exist on their gateways. Same key works across all three.
  const configuredHost = String(ai.rapidApiXnxxHost ?? '').trim()
  type Provider = { host: string; path: string; payload: (u: string) => Record<string, string> }
  const allProviders: Provider[] = [
    {
      host: 'pornhub-api-xnxx.p.rapidapi.com',
      path: '/api/download',
      payload: (u) => ({ url: u }),
    },
    {
      host: 'porn-xnxx-api.p.rapidapi.com',
      path: '/download',
      payload: (u) => ({ video_link: u }),
    },
    {
      host: 'porn-xnxx-api-v2-sale.p.rapidapi.com',
      path: '/download',
      payload: (u) => ({ video_link: u }),
    },
  ]
  const providers: Provider[] = configuredHost
    ? [...allProviders.filter((p) => p.host === configuredHost), ...allProviders.filter((p) => p.host !== configuredHost)]
    : allProviders

  const attempts: string[] = []
  for (const prov of providers) {
    const pathToTry = prov.path
    // Up to 3 retries on 429 — PornHub trending shares this quota.
    let backoffMs = 800
    let lastError: string | null = null
    for (let attempt429 = 0; attempt429 < 3; attempt429++) {
      try {
        const body = await postJsonWithHeaders(prov.host, pathToTry, prov.payload(viewUrl), {
          'x-rapidapi-host': prov.host,
          'x-rapidapi-key': apiKey,
          'Content-Type': 'application/json',
        })
        let r: any
        try { r = JSON.parse(body) } catch {
          lastError = `non-JSON response: ${String(body).slice(0, 80)}`
          break
        }
        const direct: string | null =
          r?.video_high ?? r?.video_low ??
          r?.hd ?? r?.sd ??
          r?.url ??
          (Array.isArray(r?.formats) ? r.formats[0]?.url : null) ??
          null
        if (typeof direct === 'string' && direct.startsWith('http')) {
          const resolution =
            r?.video_high ? '360p' :
            r?.hd ? '720p' :
            r?.video_low ? '240p' :
            r?.sd ? '480p' :
            r?.quality ?? 'unknown'
          console.log(`[xnxx] resolved via ${prov.host}${pathToTry} → ${resolution}${attempt429 > 0 ? ` (after ${attempt429} retry)` : ''}`)
          return { directUrl: direct, resolution: String(resolution) }
        }
        lastError = `no direct URL in response (keys: ${Object.keys(r ?? {}).slice(0, 6).join(',')})`
        break
      } catch (err: any) {
        const msg = String(err?.message ?? err)
        lastError = msg.slice(0, 120)
        if (msg.includes('429') && attempt429 < 2) {
          console.log(`[xnxx] ${prov.host} rate-limited, retrying in ${backoffMs}ms`)
          await new Promise((r) => setTimeout(r, backoffMs))
          backoffMs *= 2
          continue
        }
        break
      }
    }
    if (lastError) attempts.push(`${prov.host}${pathToTry}: ${lastError}`)
  }
  console.warn('[xnxx] resolveXnxxDownload failed across all RapidAPI providers:')
  for (const a of attempts) console.warn(`  - ${a}`)
  // Final fallback: ask yt-dlp for the direct URL. Bundled at
  // resources/bin/yt-dlp.exe; ~1-2s spawn cost but reliable when
  // every paid RapidAPI provider 403s. Result quality may be higher
  // than the API's 360p cap since yt-dlp can pull all available
  // streams from the page directly.
  try {
    const { spawn } = await import('node:child_process')
    const path = await import('node:path')
    const fs = await import('node:fs')
    const os = await import('node:os')
    const isWin = os.platform() === 'win32'
    const exe = isWin ? 'yt-dlp.exe' : 'yt-dlp'
    const cwd = process.cwd()
    const candidates = [
      path.join(process.resourcesPath || '', 'bin', exe),
      path.join(cwd, 'resources', 'bin', exe),
      path.join(cwd, 'bin', exe),
    ]
    let bin = exe
    for (const c of candidates) {
      try { if (fs.existsSync(c)) { bin = c; break } } catch { /* noop */ }
    }
    const ytUrl = await new Promise<string | null>((resolve) => {
      let stdout = ''
      let stderr = ''
      const proc = spawn(bin, ['--get-url', '--no-warnings', '--no-playlist', '-f', 'best[ext=mp4]/best', viewUrl], { windowsHide: true })
      const timer = setTimeout(() => { try { proc.kill() } catch {} ; resolve(null) }, 15_000)
      proc.stdout?.on('data', (d) => { stdout += d.toString() })
      proc.stderr?.on('data', (d) => { stderr += d.toString() })
      proc.on('error', () => { clearTimeout(timer); resolve(null) })
      proc.on('close', (code) => {
        clearTimeout(timer)
        if (code !== 0) { console.warn(`[xnxx] yt-dlp exit ${code}: ${stderr.slice(-200)}`); resolve(null); return }
        const u = stdout.trim().split(/\r?\n/)[0]?.trim()
        resolve(u && u.startsWith('http') ? u : null)
      })
    })
    if (ytUrl) {
      console.log(`[xnxx] resolved via yt-dlp fallback`)
      return { directUrl: ytUrl, resolution: 'yt-dlp' }
    }
  } catch (err: any) {
    console.warn('[xnxx] yt-dlp fallback failed:', err?.message ?? err)
  }
  return null
}

// --- PornHub via RapidAPI ---
// Endpoints (from official docs at pornhub-api-xnxx.p.rapidapi.com):
//   POST /api/search    { q, pages }      → array of videos
//   POST /api/download  { url }           → array of formats (240p/hls)
//   GET  /api/trending?page=N             → array of videos
// When tags is empty we hit trending; when tags is non-empty we hit
// search. Both return the same shape so the post-mapping logic is shared.
async function searchPornhub(tags: string, perPage: number, page: number): Promise<BooruSearchResult> {
  const { getSettings } = await import('../../settings')
  const { decryptString } = await import('../secure-storage')
  const ai = (getSettings().ai as any) || {}
  const storedKey = String(ai.rapidApiKey ?? '')
  const apiKey = (decryptString(storedKey) ?? storedKey).trim()
  const apiHost = 'pornhub-api-xnxx.p.rapidapi.com'
  if (!apiKey) {
    throw new Error('PornHub source needs a RapidAPI key (set RAPIDAPI_KEY in .api-keys.env)')
  }
  const trimmed = tags.trim()
  let body: string
  try {
    if (trimmed) {
      // POST /api/search with JSON body {q, pages}.
      console.log(`[PornHub] POST search q="${trimmed}" page=${page + 1}`)
      body = await postJsonWithHeaders(apiHost, '/api/search', { q: trimmed, pages: page + 1 }, {
        'x-rapidapi-host': apiHost,
        'x-rapidapi-key': apiKey,
        'Content-Type': 'application/json',
      })
    } else {
      console.log(`[PornHub] GET trending page=${page + 1}`)
      body = await fetchJsonWithHeaders(apiHost, `/api/trending?page=${page + 1}`, {
        'x-rapidapi-host': apiHost,
        'x-rapidapi-key': apiKey,
      })
    }
  } catch (err: any) {
    const msg = err?.message ?? String(err)
    if (msg.includes('403')) {
      throw new Error('PornHub API requires a RapidAPI subscription — subscribe to "pornhub-api-xnxx" at rapidapi.com/hub')
    }
    if (msg.includes('429')) {
      throw new Error('PornHub API rate limit hit — wait a minute or upgrade your RapidAPI plan')
    }
    throw err
  }
  let parsed: any
  try { parsed = JSON.parse(body) } catch {
    throw new Error(`PornHub returned non-JSON: ${body.slice(0, 200)}`)
  }
  const vids: any[] = Array.isArray(parsed) ? parsed : []
  const posts: BooruPost[] = vids
    .map((v) => {
      // viewkey extraction → embed URL. PornHub view URLs:
      //   https://www.pornhub.com/view_video.php?viewkey=ABC123
      // Embed URL pattern:
      //   https://www.pornhub.com/embed/ABC123
      const viewMatch = String(v.url ?? '').match(/viewkey=(\w+)/)
      const viewKey = viewMatch?.[1] ?? ''
      const embedUrl = viewKey
        ? `https://www.pornhub.com/embed/${viewKey}`
        : (v.url ?? '')
      if (!embedUrl) return null
      const rawId = viewKey || String(v.url ?? '')
      const id = rawId ? stringHash(rawId) : Date.now() + Math.floor(Math.random() * 1000)
      return {
        id,
        file_url: embedUrl,
        preview_url: v.thumbnail ?? '',
        sample_url: v.thumbnail ?? '',
        tags: (v.title ?? '').toLowerCase(),
        rating: 'explicit',
        score: Number(String(v.views ?? '0').replace(/[^0-9]/g, '')) || 0,
        source: v.url ?? '',
        width: 0,
        height: 0,
        hash: rawId,
      }
    })
    .filter(Boolean) as BooruPost[]
  console.log(`[PornHub] ${posts.length} posts (page ${page + 1})`)
  return { posts, hasMore: posts.length === perPage || posts.length > 0, page }
}

/**
 * Resolve a PornHub view URL into a direct MP4 download URL via the
 * RapidAPI /api/download endpoint. The API initiates transcoding;
 * the returned URL becomes 200-OK after 20-300 seconds. This function
 * polls HEAD requests until the URL is ready (or maxWaitMs elapsed).
 *
 * Returns the best-resolution direct MP4 URL, or null on failure.
 */
export async function resolvePornhubDownload(
  viewUrl: string,
  options?: { preferResolution?: '240p' | '480p' | '720p' | '1080p' | 'best'; maxWaitMs?: number }
): Promise<{ directUrl: string; resolution: string; codec: string | null } | null> {
  const { getSettings } = await import('../../settings')
  const { decryptString } = await import('../secure-storage')
  const ai = (getSettings().ai as any) || {}
  const storedKey = String(ai.rapidApiKey ?? '')
  const apiKey = (decryptString(storedKey) ?? storedKey).trim()
  if (!apiKey) {
    console.warn('[PornHub] No RapidAPI key for download')
    return null
  }
  const apiHost = 'pornhub-api-xnxx.p.rapidapi.com'
  try {
    const body = await postJsonWithHeaders(apiHost, '/api/download', { url: viewUrl }, {
      'x-rapidapi-host': apiHost,
      'x-rapidapi-key': apiKey,
      'Content-Type': 'application/json',
    })
    const formats: any[] = JSON.parse(body)
    if (!Array.isArray(formats) || formats.length === 0) return null
    // Filter to MP4 formats only (skip HLS m3u8). Prefer highest
    // resolution that doesn't exceed the user's request.
    const pref = options?.preferResolution ?? 'best'
    const mp4 = formats
      .filter((f) => f.url && !String(f.url).includes('.m3u8'))
      .filter((f) => !String(f.id ?? '').startsWith('hls'))
    if (mp4.length === 0) {
      // Fall back to first HLS stream if no direct MP4 (rare).
      const hls = formats.find((f) => f.url)
      if (!hls) return null
      return { directUrl: hls.url, resolution: hls.resolution ?? 'unknown', codec: hls.vcodec ?? null }
    }
    // Sort by resolution height descending. Pull height from "WxH" string.
    mp4.sort((a, b) => {
      const ha = Number(String(a.resolution ?? '0x0').split('x').pop()) || 0
      const hb = Number(String(b.resolution ?? '0x0').split('x').pop()) || 0
      return hb - ha
    })
    let chosen = mp4[0]
    if (pref !== 'best') {
      const target = Number(pref.replace('p', ''))
      const match = mp4.find((f) => {
        const h = Number(String(f.resolution ?? '0x0').split('x').pop()) || 0
        return h <= target
      })
      if (match) chosen = match
    }
    // Poll until the URL is ready (HEAD returns 200). The API warns
    // 20-300 seconds; we poll every 5s up to maxWaitMs.
    const maxWaitMs = options?.maxWaitMs ?? 240_000  // 4 minutes default
    const deadline = Date.now() + maxWaitMs
    let ready = false
    while (Date.now() < deadline) {
      try {
        const headOk = await headOk200(chosen.url)
        if (headOk) { ready = true; break }
      } catch { /* keep polling */ }
      await new Promise((r) => setTimeout(r, 5_000))
    }
    if (!ready) {
      console.warn(`[PornHub] download URL didn't become ready within ${maxWaitMs}ms`)
      // Return the URL anyway — caller can retry.
    }
    return {
      directUrl: chosen.url,
      resolution: chosen.resolution ?? 'unknown',
      codec: chosen.vcodec ?? null,
    }
  } catch (err) {
    console.warn('[PornHub] resolvePornhubDownload failed:', err)
    return null
  }
}

function postJsonWithHeaders(host: string, urlPath: string, payload: any, headers: Record<string, string>): Promise<string> {
  return new Promise((resolve, reject) => {
    const body = Buffer.from(JSON.stringify(payload), 'utf8')
    const req = https.request({
      hostname: host,
      port: 443,
      path: urlPath,
      method: 'POST',
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'application/json',
        'Content-Length': body.length,
        ...headers,
      },
      timeout: 25_000,
    }, (res) => {
      const chunks: Buffer[] = []
      res.on('data', (c: Buffer) => chunks.push(c))
      res.on('end', () => {
        const data = Buffer.concat(chunks).toString('utf8')
        if (!res.statusCode || res.statusCode >= 400) {
          reject(new Error(`${host}${urlPath} → ${res.statusCode}: ${data.slice(0, 200)}`))
        } else {
          resolve(data)
        }
      })
    })
    req.on('error', reject)
    req.on('timeout', () => req.destroy(new Error(`${host}${urlPath} timed out`)))
    req.write(body)
    req.end()
  })
}

function headOk200(rawUrl: string): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      const url = new URL(rawUrl)
      const req = https.request({
        hostname: url.hostname,
        port: 443,
        path: url.pathname + url.search,
        method: 'HEAD',
        timeout: 5000,
      }, (res) => {
        resolve(res.statusCode === 200)
        res.resume()
      })
      req.on('error', () => resolve(false))
      req.on('timeout', () => { req.destroy(); resolve(false) })
      req.end()
    } catch { resolve(false) }
  })
}

// Like fetchJson but with custom headers — needed for RapidAPI auth.
function fetchJsonWithHeaders(host: string, urlPath: string, headers: Record<string, string>): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: host,
      port: 443,
      path: urlPath,
      method: 'GET',
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json', ...headers },
      timeout: 15_000,
    }, (res) => {
      const chunks: Buffer[] = []
      res.on('data', (c: Buffer) => chunks.push(c))
      res.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf8')
        if (!res.statusCode || res.statusCode >= 400) {
          reject(new Error(`${host}${urlPath} → ${res.statusCode}: ${body.slice(0, 200)}`))
        } else {
          resolve(body)
        }
      })
    })
    req.on('error', reject)
    req.on('timeout', () => req.destroy(new Error(`${host}${urlPath} timed out`)))
    req.end()
  })
}

// Stable hash of a string ID so alphanumeric IDs map to a unique
// numeric id without collisions. djb2 variant — good enough for our
// use (just needs to be unique-ish for React keys + display).
function stringHash(s: string): number {
  let h = 5381
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h + s.charCodeAt(i)) & 0x7fffffff
  }
  return h
}

// --- Eporner ---  /api/v2/video/search/?query=...&per_page=...&page=...
async function searchEporner(tags: string, perPage: number, page: number): Promise<BooruSearchResult> {
  const q = tags.trim() || 'recent'
  const urlPath = `/api/v2/video/search/?query=${encodeURIComponent(q)}&per_page=${perPage}&page=${page + 1}&thumbsize=big`
  console.log(`[Eporner] GET https://www.eporner.com${urlPath}`)
  const body = await fetchJson('www.eporner.com', urlPath)
  const parsed = JSON.parse(body)
  const vids: any[] = Array.isArray(parsed?.videos) ? parsed.videos : []
  const posts: BooruPost[] = vids
    .map((v) => {
      const thumb = v.default_thumb?.src ?? v.thumbs?.[0]?.src ?? ''
      const fileUrl = v.embed ?? v.url ?? ''
      if (!fileUrl) return null
      const rawId = String(v.id ?? '')
      return {
        id: rawId ? stringHash(rawId) : Date.now() + Math.floor(Math.random() * 1000),
        file_url: fileUrl,
        preview_url: thumb,
        sample_url: thumb,
        tags: (v.keywords ?? '').toString(),
        rating: 'explicit',
        score: Math.round(Number(v.rate ?? 0) * 100),
        source: v.url ?? '',
        width: 0,
        height: 0,
        hash: rawId,  // preserve raw id for "open original" link
      }
    })
    .filter(Boolean) as BooruPost[]
  console.log(`[Eporner] ${posts.length} posts`)
  return { posts, hasMore: vids.length === perPage, page }
}

// --- RedTube --- /?data=redtube.Videos.searchVideos&output=json
async function searchRedtube(tags: string, perPage: number, page: number): Promise<BooruSearchResult> {
  const q = tags.trim() || 'popular'
  const urlPath = `/?data=redtube.Videos.searchVideos&output=json&search=${encodeURIComponent(q)}&page=${page + 1}`
  console.log(`[RedTube] GET https://api.redtube.com${urlPath}`)
  const body = await fetchJson('api.redtube.com', urlPath)
  const parsed = JSON.parse(body)
  const vids: any[] = Array.isArray(parsed?.videos) ? parsed.videos.map((w: any) => w.video) : []
  const posts: BooruPost[] = vids
    .map((v) => {
      const thumb = v.default_thumb ?? v.thumb ?? v.thumbs?.[0]?.src ?? ''
      const fileUrl = v.embed_url ?? v.url ?? ''
      if (!fileUrl) return null
      const rawId = String(v.video_id ?? '')
      // RedTube video_ids are mostly numeric but treat as string for safety.
      const id = /^\d+$/.test(rawId) ? Number(rawId) : (rawId ? stringHash(rawId) : Date.now() + Math.floor(Math.random() * 1000))
      return {
        id,
        file_url: fileUrl,
        preview_url: thumb,
        sample_url: thumb,
        tags: (v.tags ?? []).map((t: any) => t.tag_name ?? t).join(' '),
        rating: 'explicit',
        score: Math.round(Number(v.rating ?? 0)),
        source: v.url ?? '',
        width: 0,
        height: 0,
        hash: rawId,
      }
    })
    .filter(Boolean) as BooruPost[]
  console.log(`[RedTube] ${posts.length} posts`)
  return { posts, hasMore: posts.length === perPage, page }
}

// --- e621 (Basic auth from settings) ---
async function searchE621(tags: string, perPage: number, page: number, hostOverride?: string): Promise<BooruSearchResult> {
  const { getSettings } = await import('../../settings')
  const { decryptString } = await import('../secure-storage')
  const aiSettings = (getSettings().ai as any) || {}
  const username = String(aiSettings.e621Username ?? '').trim()
  const apiKey = decryptString(aiSettings.e621ApiKey ?? '')
  if (!username || !apiKey) {
    throw new Error('e621 requires both username + API key (set in AI Tools → Setup → API keys)')
  }
  const host = hostOverride ?? 'e621.net'
  const tagsParam = tags.trim() ? `&tags=${encodeURIComponent(tags.trim())}` : ''
  const urlPath = `/posts.json?limit=${perPage}&page=${page + 1}${tagsParam}`
  console.log(`[${host}] GET https://${host}${urlPath}`)
  const body = await fetchJson(host, urlPath, `${username}:${apiKey}`)
  const parsed = JSON.parse(body)
  const arr: any[] = Array.isArray(parsed?.posts) ? parsed.posts : []
  const posts: BooruPost[] = arr
    .filter((p) => p?.file?.url)
    .map((p) => ({
      id: Number(p.id ?? 0),
      file_url: p.file.url,
      preview_url: p.preview?.url ?? p.sample?.url ?? p.file.url,
      sample_url: p.sample?.url ?? p.file.url,
      tags: [
        ...(p.tags?.general ?? []),
        ...(p.tags?.species ?? []),
        ...(p.tags?.character ?? []),
        ...(p.tags?.artist ?? []),
      ].join(' '),
      rating: p.rating === 's' ? 'safe' : p.rating === 'q' ? 'questionable' : 'explicit',
      score: Number(p.score?.total ?? 0),
      source: p.sources?.[0] ?? '',
      width: Number(p.file?.width ?? 0),
      height: Number(p.file?.height ?? 0),
      hash: p.file?.md5 ?? '',
    }))
  console.log(`[e621] ${posts.length} posts`)
  return { posts, hasMore: posts.length === perPage, page }
}

// --- Moebooru (yande.re, konachan): GET /post.json?tags=...&limit=...&page=... ---
async function searchMoebooru(host: string, tags: string, perPage: number, page: number): Promise<BooruSearchResult> {
  const tagsParam = tags.trim() ? `&tags=${encodeURIComponent(tags.trim())}` : ''
  const urlPath = `/post.json?limit=${perPage}&page=${page + 1}${tagsParam}`
  console.log(`[Moebooru ${host}] GET https://${host}${urlPath}`)
  const body = await fetchJson(host, urlPath)
  const arr: any[] = JSON.parse(body)
  const posts: BooruPost[] = (Array.isArray(arr) ? arr : []).map((p: any) => ({
    id: Number(p.id ?? 0),
    file_url: p.file_url ?? '',
    preview_url: p.preview_url ?? p.sample_url ?? p.file_url ?? '',
    sample_url: p.sample_url ?? p.file_url ?? '',
    tags: p.tags ?? '',
    rating: p.rating === 's' ? 'safe' : p.rating === 'q' ? 'questionable' : 'explicit',
    score: Number(p.score ?? 0),
    source: p.source ?? '',
    width: Number(p.width ?? 0),
    height: Number(p.height ?? 0),
    hash: p.md5 ?? '',
  })).filter((p) => p.file_url)
  console.log(`[Moebooru ${host}] ${posts.length} posts`)
  return { posts, hasMore: posts.length === perPage, page }
}

// --- Gelbooru-style (rule34, safebooru) — JSON dapi ---
async function searchGelbooruStyle(host: string, tags: string, perPage: number, page: number): Promise<BooruSearchResult> {
  const tagsTrimmed = tags.trim()
  const tagsParam = tagsTrimmed ? `&tags=${encodeURIComponent(tagsTrimmed)}` : ''
  // rule34.xxx auth — appended only when the api_key + user_id pair
  // is configured. Other gelbooru-family hosts ignore these params.
  // The stored key is encrypted (enc:v1:...) so we have to decrypt it
  // first — passing the ciphertext directly to rule34's API gives
  // 401-style empty responses, looks identical to "no results."
  let authParam = ''
  if (host === 'api.rule34.xxx') {
    try {
      const { getSettings } = await import('../../settings')
      const { decryptString } = await import('../secure-storage')
      const ai = (getSettings().ai as any) || {}
      const userId = String(ai.rule34UserId ?? '').trim()
      const storedKey = String(ai.rule34ApiKey ?? '')
      const apiKey = decryptString(storedKey) ?? storedKey
      if (userId && apiKey) {
        authParam = `&user_id=${encodeURIComponent(userId)}&api_key=${encodeURIComponent(apiKey)}`
      } else {
        console.warn('[rule34] credentials missing — userId:', !!userId, 'apiKey:', !!apiKey)
      }
    } catch (err) { console.warn('[rule34] auth lookup failed:', err) }
  }
  // gelbooru.com and realbooru.com now require api_key+user_id since
  // mid-2024 / early-2025 — unauth requests get a 401 returned as
  // empty JSON, indistinguishable from "no results." Stored under
  // separate settings keys: gelbooru{ApiKey,UserId} / realbooru…
  if (host === 'gelbooru.com') {
    try {
      const { getSettings } = await import('../../settings')
      const { decryptString } = await import('../secure-storage')
      const ai = (getSettings().ai as any) || {}
      const userId = String(ai.gelbooruUserId ?? '').trim()
      const storedKey = String(ai.gelbooruApiKey ?? '')
      const apiKey = decryptString(storedKey) ?? storedKey
      if (userId && apiKey) {
        authParam = `&user_id=${encodeURIComponent(userId)}&api_key=${encodeURIComponent(apiKey)}`
      }
    } catch (err) { console.warn('[gelbooru] auth lookup failed:', err) }
  }
  if (host === 'realbooru.com') {
    try {
      const { getSettings } = await import('../../settings')
      const { decryptString } = await import('../secure-storage')
      const ai = (getSettings().ai as any) || {}
      const userId = String(ai.realbooruUserId ?? '').trim()
      const storedKey = String(ai.realbooruApiKey ?? '')
      const apiKey = decryptString(storedKey) ?? storedKey
      if (userId && apiKey) {
        authParam = `&user_id=${encodeURIComponent(userId)}&api_key=${encodeURIComponent(apiKey)}`
      }
    } catch (err) { console.warn('[realbooru] auth lookup failed:', err) }
  }
  const urlPath = `/index.php?page=dapi&s=post&q=index&json=1&limit=${perPage}&pid=${page}${tagsParam}${authParam}`
  console.log(`[Gelbooru ${host}] GET https://${host}${urlPath.replace(/api_key=[^&]+/, 'api_key=***')}`)
  const body = await fetchJson(host, urlPath)
  // Some boorus return HTML or XML when their API is degraded — treat
  // that as "no results from this source" rather than throwing, so
  // multi-source searches don't abort on one bad sibling.
  if (!body || body.length === 0) {
    console.warn(`[${host}] Empty response`)
    return { posts: [], hasMore: false, page }
  }
  const trimmed = body.trim()
  if (trimmed.startsWith('<')) {
    // XML or HTML — extract the failure reason if it's there.
    const xmlReason = trimmed.match(/reason="([^"]+)"/)?.[1]
    console.warn(`[${host}] Non-JSON response${xmlReason ? `: ${xmlReason}` : ''}`)
    return { posts: [], hasMore: false, page }
  }
  let parsed: any
  try { parsed = JSON.parse(body) } catch (err) {
    console.warn(`[${host}] JSON parse failed: ${body.slice(0, 200)}`)
    return { posts: [], hasMore: false, page }
  }
  let rawPosts: RawRule34Post[]
  if (Array.isArray(parsed)) rawPosts = parsed
  else if (parsed && Array.isArray(parsed.post)) rawPosts = parsed.post
  else {
    console.warn(`[${host}] Non-array response`)
    return { posts: [], hasMore: false, page }
  }
  // CDN prefix for URL reconstruction.
  const cdn = SOURCE_CDN[host] ?? `https://${host}`
  const posts = rawPosts.map((p) => {
    const patched = patchUrlsIfMissing(p)
    // Patch CDN URLs if they came back relative or missing.
    if (!patched.file_url && p.directory && p.image) {
      patched.file_url = `${cdn}/images/${p.directory}/${p.image}`
    }
    return patched
  }).filter((p) => p.file_url)
  console.log(`[${host}] ${rawPosts.length} raw, ${posts.length} with URLs`)
  return { posts, hasMore: rawPosts.length === perPage, page }
}

/**
 * Legacy entry point retained for back-compat. New code should use
 * searchBooru(source, tags, options).
 *
 * @deprecated Use searchBooru instead.
 */
export async function searchRule34(
  tags: string,
  options?: { perPage?: number; page?: number }
): Promise<BooruSearchResult> {
  const perPage = Math.min(100, Math.max(1, options?.perPage ?? 30))
  const page = Math.max(0, options?.page ?? 0)
  // Empty tags → omit the param entirely. rule34.xxx returns recent
  // posts by default when no tags are specified. "tags=all" returns
  // nothing because "all" is treated as a literal tag.
  const tagsTrimmed = tags.trim()
  const tagsParam = tagsTrimmed ? `&tags=${encodeURIComponent(tagsTrimmed)}` : ''
  const urlPath = `/index.php?page=dapi&s=post&q=index&json=1&limit=${perPage}&pid=${page}${tagsParam}`
  console.log(`[Rule34] GET https://${RULE34_HOST}${urlPath}`)
  const body = await fetchJson(RULE34_HOST, urlPath)
  let parsed: any
  try {
    parsed = JSON.parse(body)
  } catch (err) {
    throw new Error(`rule34 returned non-JSON (${body.length} bytes): ${body.slice(0, 200)}`)
  }
  // rule34.xxx sometimes wraps the array in {@attributes, post: [...]}.
  // Handle both envelopes.
  let rawPosts: RawRule34Post[]
  if (Array.isArray(parsed)) {
    rawPosts = parsed as RawRule34Post[]
  } else if (parsed && Array.isArray(parsed.post)) {
    rawPosts = parsed.post as RawRule34Post[]
  } else if (parsed && Array.isArray(parsed['@attributes'])) {
    // Some variants nest. Fallback: scan for first array-valued property.
    const arrayProp = Object.values(parsed).find((v) => Array.isArray(v))
    rawPosts = (arrayProp as RawRule34Post[]) ?? []
  } else {
    console.warn('[Rule34] Non-array response shape:', JSON.stringify(parsed).slice(0, 200))
    return { posts: [], hasMore: false, page }
  }
  const posts = rawPosts.map(patchUrlsIfMissing).filter((p) => p.file_url)
  console.log(`[Rule34] Got ${rawPosts.length} raw posts, ${posts.length} with URLs`)
  if (posts.length === 0 && rawPosts.length > 0) {
    console.warn('[Rule34] First raw post for debugging:', JSON.stringify(rawPosts[0]).slice(0, 400))
  }
  return {
    posts,
    hasMore: rawPosts.length === perPage,
    page,
  }
}

/**
 * Download a single booru post to a temp file. Returns the temp path.
 * The caller should then hand it to media:importFiles for canonical
 * library import (which moves it to the user's media dir, scans
 * metadata, and enqueues AI tagging if enabled).
 */
export async function downloadBooruPost(post: BooruPost): Promise<{
  tmpPath: string
  bytes: number
  filename: string
}> {
  const url = post.file_url
  if (!url) throw new Error('Post has no file_url')
  const urlParsed = new URL(url)
  const origName = path.basename(urlParsed.pathname)
  const ext = path.extname(origName) || '.jpg'
  const safeId = String(post.id).replace(/[^a-z0-9]/gi, '')
  const filename = `rule34-${safeId}${ext}`
  const tmpPath = path.join(os.tmpdir(), `vault-r34-${Date.now()}-${safeId}${ext}`)
  const { bytes } = await fetchBinary(url, tmpPath)
  return { tmpPath, bytes, filename }
}
