// File: src/main/services/rss-importer.ts
//
// #312 E-88 — RSS/Atom subscription importer. Polls each configured
// feed on an interval, enqueues any new <enclosure> or <media:content>
// URLs to the url-downloader, then marks the GUID seen so we don't
// re-import.
//
// Feed list lives in settings.rssFeeds: [{id, url, label, intervalMin,
// urlFilter?, lastPolledAt, lastError?}]. Seen-GUIDs live in
// settings.rssSeenGuids: { [feedId]: string[] } — capped to 1000 per
// feed (rolling) so we don't accumulate forever.

import Parser from 'rss-parser'
import { getSettings, updateSettings } from '../settings'
import { getUrlDownloaderService } from './url-downloader-service'

const SEEN_CAP_PER_FEED = 1000
const parser = new Parser({ timeout: 20_000 })

export interface RssFeed {
  id: string
  url: string
  label: string
  intervalMin: number    // poll cadence
  urlFilter?: string     // optional regex applied to item links; only matches imported
  lastPolledAt?: number
  lastError?: string | null
  enabled: boolean
}

export interface PollResult {
  feedId: string
  feedLabel: string
  newItems: number
  skippedSeen: number
  skippedFiltered: number
  errors: string[]
}

let pollTimer: NodeJS.Timeout | null = null

function readFeeds(): RssFeed[] {
  const s = getSettings() as any
  return Array.isArray(s.rssFeeds) ? s.rssFeeds : []
}

function readSeen(feedId: string): Set<string> {
  const s = getSettings() as any
  const seen = s.rssSeenGuids ?? {}
  return new Set(seen[feedId] ?? [])
}

function writeSeen(feedId: string, set: Set<string>): void {
  const s = getSettings() as any
  const seen = { ...(s.rssSeenGuids ?? {}) }
  // Cap to most recent N — sets preserve insertion order in JS so
  // .slice on the array form keeps the freshest entries.
  const arr = Array.from(set)
  seen[feedId] = arr.slice(Math.max(0, arr.length - SEEN_CAP_PER_FEED))
  updateSettings({ rssSeenGuids: seen } as any)
}

function writeFeed(updated: RssFeed): void {
  const feeds = readFeeds().map((f) => f.id === updated.id ? updated : f)
  updateSettings({ rssFeeds: feeds } as any)
}

export function listFeeds(): RssFeed[] {
  return readFeeds()
}

export function addFeed(args: { url: string; label?: string; intervalMin?: number; urlFilter?: string }): RssFeed {
  const feed: RssFeed = {
    id: `rss-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    url: args.url,
    label: args.label ?? args.url,
    intervalMin: Math.max(5, args.intervalMin ?? 60),
    urlFilter: args.urlFilter,
    enabled: true,
  }
  const feeds = [...readFeeds(), feed]
  updateSettings({ rssFeeds: feeds } as any)
  return feed
}

export function removeFeed(id: string): void {
  const feeds = readFeeds().filter((f) => f.id !== id)
  updateSettings({ rssFeeds: feeds } as any)
  // Also drop seen-guids for the removed feed.
  const s = getSettings() as any
  const seen = { ...(s.rssSeenGuids ?? {}) }
  delete seen[id]
  updateSettings({ rssSeenGuids: seen } as any)
}

export function setFeedEnabled(id: string, enabled: boolean): void {
  const feeds = readFeeds().map((f) => f.id === id ? { ...f, enabled } : f)
  updateSettings({ rssFeeds: feeds } as any)
}

export async function pollFeed(feed: RssFeed): Promise<PollResult> {
  const result: PollResult = {
    feedId: feed.id, feedLabel: feed.label,
    newItems: 0, skippedSeen: 0, skippedFiltered: 0, errors: [],
  }
  if (!feed.enabled) return result
  const seen = readSeen(feed.id)
  const filter = feed.urlFilter ? new RegExp(feed.urlFilter, 'i') : null
  try {
    const parsed = await parser.parseURL(feed.url)
    for (const item of parsed.items ?? []) {
      const guid = String(item.guid ?? item.id ?? item.link ?? item.title ?? '')
      if (!guid) continue
      if (seen.has(guid)) { result.skippedSeen++; continue }
      // Prefer enclosure URL (real media), fall back to link.
      const enclosureUrl = (item as any).enclosure?.url ?? null
      const url = enclosureUrl ?? item.link ?? ''
      if (!url) { seen.add(guid); continue }
      if (filter && !filter.test(url)) { result.skippedFiltered++; seen.add(guid); continue }
      try {
        await getUrlDownloaderService().addDownload(url, undefined, 'desktop')
        seen.add(guid)
        result.newItems++
      } catch (err: any) {
        result.errors.push(`${guid}: ${err?.message ?? String(err)}`)
      }
    }
    writeSeen(feed.id, seen)
    writeFeed({ ...feed, lastPolledAt: Date.now(), lastError: null })
  } catch (err: any) {
    result.errors.push(String(err?.message ?? err))
    writeFeed({ ...feed, lastPolledAt: Date.now(), lastError: String(err?.message ?? err) })
  }
  return result
}

export async function pollAllNow(): Promise<PollResult[]> {
  const feeds = readFeeds()
  const out: PollResult[] = []
  for (const f of feeds) {
    out.push(await pollFeed(f))
  }
  return out
}

// Background scheduler — wakes every 60s, polls feeds whose
// (lastPolledAt + intervalMin) is overdue.
export function startScheduler(): void {
  if (pollTimer) return
  pollTimer = setInterval(() => {
    const feeds = readFeeds()
    const now = Date.now()
    for (const f of feeds) {
      if (!f.enabled) continue
      const due = (f.lastPolledAt ?? 0) + f.intervalMin * 60_000
      if (now >= due) {
        void pollFeed(f).catch(() => { /* swallow */ })
      }
    }
  }, 60_000)
  pollTimer.unref?.()
}

export function stopScheduler(): void {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
}
