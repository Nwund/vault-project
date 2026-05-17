// File: src/main/services/coomer-archive.ts
//
// #384 H-160 — OnlyFans / Fansly creator archive importer via the
// coomer.su (and kemono.su sister) pattern. Coomer mirrors paywalled
// content via a JSON API:
//   https://coomer.su/api/v1/{service}/user/{userId}
// where service ∈ { onlyfans, fansly, candfans } and userId is the
// creator handle. Each post has attachments (file_url) we queue into
// the URL downloader.
//
// Paginated: 50 posts per page via `?o=N` offset. We walk forward
// until we hit a page shorter than 50 (last page) or hit maxPosts.

import { net } from 'electron'
import { getUrlDownloaderService } from './url-downloader-service'

export type CoomerService = 'onlyfans' | 'fansly' | 'candfans'

export interface ArchiveProgress {
  postsFetched: number
  attachmentsQueued: number
  pageOffset: number
  done: boolean
  error?: string
}

interface CoomerPost {
  id: string
  user: string
  service: string
  title?: string
  content?: string
  added?: string
  file?: { name?: string; path?: string }
  attachments?: Array<{ name?: string; path?: string }>
}

function fetchJson<T>(url: string, timeoutMs = 20_000): Promise<T> {
  return new Promise((resolve, reject) => {
    const req = net.request({ method: 'GET', url, redirect: 'follow' })
    let buf = ''
    const t = setTimeout(() => { try { req.abort() } catch { /* ignore */ }; reject(new Error('timeout')) }, timeoutMs)
    req.on('response', (res) => {
      if (res.statusCode && res.statusCode >= 400) {
        clearTimeout(t)
        reject(new Error(`HTTP ${res.statusCode}`))
        return
      }
      res.on('data', (c: Buffer) => { buf += c.toString('utf8') })
      res.on('end', () => {
        clearTimeout(t)
        try { resolve(JSON.parse(buf) as T) } catch (err: any) { reject(new Error(`JSON parse: ${err.message}`)) }
      })
    })
    req.on('error', (e) => { clearTimeout(t); reject(e) })
    req.end()
  })
}

const BASES: Record<string, string> = {
  onlyfans: 'https://coomer.su',
  fansly: 'https://coomer.su',
  candfans: 'https://coomer.su',
  // kemono.su handles patreon/fanbox/gumroad — same API shape.
  patreon: 'https://kemono.su',
  fanbox: 'https://kemono.su',
  gumroad: 'https://kemono.su',
  subscribestar: 'https://kemono.su',
}

export async function archiveCreator(args: {
  service: CoomerService | 'patreon' | 'fanbox' | 'gumroad' | 'subscribestar'
  userId: string
  maxPosts?: number
  onProgress?: (p: ArchiveProgress) => void
  mediaExtensions?: string[]  // default: all images + videos
}): Promise<ArchiveProgress> {
  const base = BASES[args.service]
  if (!base) throw new Error(`Unknown service: ${args.service}`)
  const maxPosts = args.maxPosts ?? 500
  const extensions = args.mediaExtensions ?? ['.mp4', '.m4v', '.mov', '.webm', '.gif', '.jpg', '.jpeg', '.png', '.webp']
  const progress: ArchiveProgress = { postsFetched: 0, attachmentsQueued: 0, pageOffset: 0, done: false }

  while (progress.postsFetched < maxPosts) {
    const url = `${base}/api/v1/${args.service}/user/${encodeURIComponent(args.userId)}?o=${progress.pageOffset}`
    let posts: CoomerPost[]
    try {
      posts = await fetchJson<CoomerPost[]>(url)
    } catch (err: any) {
      progress.error = err?.message ?? String(err)
      progress.done = true
      args.onProgress?.(progress)
      return progress
    }
    if (!Array.isArray(posts) || posts.length === 0) {
      progress.done = true
      args.onProgress?.(progress)
      return progress
    }
    for (const post of posts) {
      const attachments: Array<{ name?: string; path?: string }> = []
      if (post.file?.path) attachments.push(post.file)
      if (Array.isArray(post.attachments)) attachments.push(...post.attachments)
      for (const att of attachments) {
        if (!att.path) continue
        const lowerPath = att.path.toLowerCase()
        if (!extensions.some((ext) => lowerPath.endsWith(ext))) continue
        const fileUrl = att.path.startsWith('http') ? att.path : `${base}${att.path}`
        try {
          await getUrlDownloaderService().addDownload(fileUrl, undefined, 'desktop')
          progress.attachmentsQueued++
        } catch { /* skip — duplicate or other downloader error */ }
      }
      progress.postsFetched++
      if (progress.postsFetched >= maxPosts) break
    }
    args.onProgress?.(progress)
    if (posts.length < 50) {
      // Last page — coomer returns < 50 only at the tail.
      progress.done = true
      args.onProgress?.(progress)
      return progress
    }
    progress.pageOffset += 50
  }
  progress.done = true
  args.onProgress?.(progress)
  return progress
}
