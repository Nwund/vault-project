// File: src/main/services/ai-intelligence/bluesky-watchlist.ts
//
// Slim Bluesky search wrapper specialized for the performer
// watchlist (#56). The main Bluesky client in booru-client.ts is
// optimized for the Browse-tab gallery — pages with cursor, returns
// BooruPost shape, no since-date filter.
//
// For the watchlist we want:
//   1. A single query by performer name.
//   2. Filter to over_18-labeled posts with image embeds.
//   3. Only return posts AFTER `sinceUnix` so the poller doesn't
//      re-surface the same hits forever.

import https from 'node:https'

export interface BlueskyWatchlistHit {
  sourceId: string         // post CID
  url: string              // bsky.app post URL
  title: string | null     // first 120 chars of post text
  thumbUrl: string | null
  releasedAt: number | null  // unix seconds
}

interface BskyPost {
  uri?: string
  cid?: string
  author?: { handle?: string }
  record?: { text?: string; createdAt?: string }
  embed?: { images?: Array<{ thumb?: string; fullsize?: string }> }
  labels?: Array<string | { val?: string }>
  indexedAt?: string
}

/**
 * Search Bluesky for posts mentioning `query`, filtered to over_18
 * labels with image embeds, optionally only AFTER sinceUnix.
 *
 * Uses public.api.bsky.app — no auth required for public data.
 * Returns at most `limit` hits, oldest-to-newest within the result.
 */
export async function searchBlueskyForWatchlist(
  query: string,
  options: { sinceUnix?: number; limit?: number } = {}
): Promise<BlueskyWatchlistHit[]> {
  const q = query.trim()
  if (!q) return []
  const limit = Math.max(1, Math.min(100, options.limit ?? 25))
  const params = [
    `q=${encodeURIComponent(q)}`,
    `limit=${limit}`,
  ]
  if (options.sinceUnix && options.sinceUnix > 0) {
    // AT Protocol `since` accepts ISO-8601 timestamps. Convert from
    // unix-seconds.
    const iso = new Date(options.sinceUnix * 1000).toISOString()
    params.push(`since=${encodeURIComponent(iso)}`)
  }
  const urlPath = `/xrpc/app.bsky.feed.searchPosts?${params.join('&')}`
  const body = await new Promise<string>((resolve, reject) => {
    const req = https.request({
      hostname: 'public.api.bsky.app',
      port: 443,
      path: urlPath,
      method: 'GET',
      headers: { Accept: 'application/json', 'User-Agent': 'vault/1.0' },
      timeout: 15_000,
    }, (res) => {
      let data = ''
      res.on('data', (c) => data += c)
      res.on('end', () => {
        if ((res.statusCode ?? 0) >= 400) {
          reject(new Error(`Bluesky ${res.statusCode}: ${data.slice(0, 200)}`))
          return
        }
        resolve(data)
      })
    })
    req.on('error', reject)
    req.on('timeout', () => { try { req.destroy() } catch { /* ignore */ }; reject(new Error('Bluesky timeout')) })
    req.end()
  }).catch((err) => {
    console.warn('[BlueskyWatchlist] search failed:', err)
    return ''
  })
  if (!body) return []
  let parsed: any
  try { parsed = JSON.parse(body) } catch { return [] }

  const out: BlueskyWatchlistHit[] = []
  for (const post of (parsed.posts ?? []) as BskyPost[]) {
    const labelVals: string[] = Array.isArray(post.labels)
      ? post.labels.map((l) => typeof l === 'string' ? l : String(l?.val ?? '')).filter(Boolean)
      : []
    const isNsfw = labelVals.some((v) =>
      ['porn', 'sexual', 'nudity', 'graphic-media'].includes(v.toLowerCase()))
    if (!isNsfw) continue
    const images = post.embed?.images ?? []
    if (images.length === 0) continue

    const text = String(post.record?.text ?? '')
    const handle = post.author?.handle ?? ''
    const postId = String(post.uri ?? '').split('/').pop() ?? ''
    const createdMs = post.record?.createdAt ? Date.parse(post.record.createdAt) : NaN
    out.push({
      sourceId: String(post.cid ?? post.uri ?? ''),
      url: handle && postId ? `https://bsky.app/profile/${handle}/post/${postId}` : '',
      title: text ? text.slice(0, 120) : null,
      thumbUrl: images[0].thumb ?? images[0].fullsize ?? null,
      releasedAt: isFinite(createdMs) ? createdMs / 1000 : null,
    })
  }
  // Sanity-filter: drop posts older than sinceUnix in case the server
  // didn't honor the filter (some AT Protocol relays ignore `since`).
  if (options.sinceUnix && options.sinceUnix > 0) {
    return out.filter((h) => !h.releasedAt || h.releasedAt >= options.sinceUnix!)
  }
  return out
}
