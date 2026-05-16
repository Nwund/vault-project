// File: src/main/services/ai-intelligence/pullpush-client.ts
//
// Thin wrapper around the PullPush API (Pushshift successor for
// historical Reddit search). Used by:
//   - reddit:pullpush-search IPC (existing Browse-tab feature)
//   - the performer watchlist poller (#56), which calls this with
//     the performer name to find new posts
//
// We split this out of ai-intelligence/index.ts so the watchlist
// poller can import it without dragging in the entire ai-intelligence
// module's init cost.

import https from 'node:https'

export interface PullPushSubmission {
  id: string
  title: string
  selftext?: string
  author?: string
  subreddit?: string
  permalink?: string
  url?: string
  thumbnail?: string
  preview?: any
  is_video?: boolean
  over_18?: boolean
  created_utc?: number
  num_comments?: number
  score?: number
}

export interface PullPushSearchOptions {
  query?: string
  subreddit?: string
  after?: number   // unix seconds
  before?: number  // unix seconds
  size?: number    // max 500
  /** When set, restricts to over_18 posts only. Default true. */
  over18Only?: boolean
  /** #108 — author filter. Maps to PullPush's native `author=` param. */
  author?: string
  /** #108 — minimum score threshold. PullPush native `score>N`. */
  minScore?: number
}

export async function pullpushSearchSubmissions(
  opts: PullPushSearchOptions
): Promise<{ ok: boolean; error?: string; items: PullPushSubmission[]; total: number }> {
  const params: string[] = []
  if (opts.query) params.push(`q=${encodeURIComponent(opts.query)}`)
  if (opts.subreddit) params.push(`subreddit=${encodeURIComponent(opts.subreddit)}`)
  if (opts.after) params.push(`after=${opts.after}`)
  if (opts.before) params.push(`before=${opts.before}`)
  params.push(`size=${Math.max(1, Math.min(500, opts.size ?? 50))}`)
  if (opts.over18Only !== false) params.push('over_18=true')
  if (opts.author) params.push(`author=${encodeURIComponent(opts.author)}`)
  if (typeof opts.minScore === 'number') params.push(`score=%3E${opts.minScore}`)  // score>N URL-encoded
  const urlPath = `/reddit/search/submission/?${params.join('&')}`
  return new Promise((resolve) => {
    const req = https.request({
      hostname: 'api.pullpush.io',
      port: 443,
      path: urlPath,
      method: 'GET',
      headers: { 'User-Agent': 'vault/1.0', Accept: 'application/json' },
      timeout: 15_000,
    }, (res) => {
      let body = ''
      res.on('data', (c) => body += c)
      res.on('end', () => {
        if ((res.statusCode ?? 0) >= 400) {
          resolve({ ok: false, error: `PullPush ${res.statusCode}: ${body.slice(0, 200)}`, items: [], total: 0 })
          return
        }
        try {
          const parsed = JSON.parse(body)
          const items = (parsed?.data ?? []) as PullPushSubmission[]
          resolve({ ok: true, items, total: items.length })
        } catch (err: any) {
          resolve({ ok: false, error: err?.message ?? 'parse failed', items: [], total: 0 })
        }
      })
    })
    req.on('error', (err) => resolve({ ok: false, error: err.message, items: [], total: 0 }))
    req.on('timeout', () => {
      try { req.destroy() } catch { /* ignore */ }
      resolve({ ok: false, error: 'PullPush timeout', items: [], total: 0 })
    })
    req.end()
  })
}
