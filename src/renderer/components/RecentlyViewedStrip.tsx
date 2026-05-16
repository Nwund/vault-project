// File: src/renderer/components/RecentlyViewedStrip.tsx
//
// Horizontal strip of the last N opened videos for the Library home.
// Brings the most-common re-entry point to the front door instead of
// hiding it inside the dedicated Watch History tab.
//
// Pulls from the same watchHistory:list IPC the timeline uses; dedupes
// by mediaId so re-watching the same clip doesn't fill the strip.
// Each tile shows thumbnail + filename + relative time + a Play button
// overlay that fires onPlay() with the mediaId.

import { useEffect, useState, useMemo, useCallback } from 'react'
import { Clock, Play, ChevronRight } from 'lucide-react'
import { toFileUrlCached } from '../hooks/usePerformance'

interface WatchHistoryItem {
  id: string
  mediaId: string
  filename: string
  thumbPath: string | null
  type: string
  viewedAt: number
  watchDuration?: number
}

interface ResolvedItem extends WatchHistoryItem {
  resolvedThumbUrl: string | null
}

interface Props {
  /** Click handler — opens the media. */
  onPlay: (mediaId: string) => void
  /** Optional click handler for "View all" → switches to Watch History tab. */
  onViewAll?: () => void
  /** Max tiles. Default 12. */
  limit?: number
  className?: string
}

function relativeTime(ts: number): string {
  const diff = Date.now() - ts
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 7) return `${days}d ago`
  const weeks = Math.floor(days / 7)
  if (weeks < 4) return `${weeks}w ago`
  return new Date(ts).toLocaleDateString()
}

export function RecentlyViewedStrip({ onPlay, onViewAll, limit = 12, className }: Props) {
  const [items, setItems] = useState<ResolvedItem[] | null>(null)

  const load = useCallback(async () => {
    try {
      const result = await window.api.invoke('watchHistory:list', {
        limit: limit * 4,  // fetch 4x to allow dedup tail
      }) as WatchHistoryItem[]
      const arr = Array.isArray(result) ? result : []
      // toFileUrlCached returns Promise<string>; resolve all in parallel
      // before rendering so the JSX stays sync.
      const resolved = await Promise.all(
        arr.map(async (it): Promise<ResolvedItem> => ({
          ...it,
          resolvedThumbUrl: it.thumbPath
            ? await toFileUrlCached(it.thumbPath).catch(() => null)
            : null,
        }))
      )
      setItems(resolved)
    } catch (err) {
      console.warn('[RecentlyViewedStrip] load failed:', err)
      setItems([])
    }
  }, [limit])

  useEffect(() => { void load() }, [load])

  // Dedupe by mediaId (most-recent wins), cap at limit.
  const deduped = useMemo(() => {
    if (!items) return null
    const seen = new Set<string>()
    const out: ResolvedItem[] = []
    for (const it of items) {
      if (seen.has(it.mediaId)) continue
      seen.add(it.mediaId)
      out.push(it)
      if (out.length >= limit) break
    }
    return out
  }, [items, limit])

  // Hide entirely until loaded — no skeleton, this is a header strip
  // that should disappear cleanly when there's no history yet.
  if (deduped === null) return null
  if (deduped.length === 0) return null

  return (
    <div className={className}>
      <div className="flex items-center justify-between mb-2 px-1">
        <div className="flex items-center gap-2 text-xs font-medium text-[var(--muted)]">
          <Clock size={12} />
          Recently viewed
        </div>
        {onViewAll && (
          <button
            onClick={onViewAll}
            className="text-[11px] text-[var(--muted)] hover:text-white transition flex items-center gap-0.5"
            title="Open Watch History"
          >
            View all <ChevronRight size={10} />
          </button>
        )}
      </div>
      <div
        className="flex gap-2 overflow-x-auto pb-2 scrollbar-thin"
        style={{ scrollbarWidth: 'thin' }}
      >
        {deduped.map((it) => (
          <button
            key={it.id}
            onClick={() => onPlay(it.mediaId)}
            className="group relative flex-shrink-0 w-44 aspect-video rounded-md overflow-hidden bg-black/40 border border-[var(--border)] hover:border-[var(--primary)]/60 transition"
            title={it.filename}
          >
            {it.resolvedThumbUrl ? (
              <img
                src={it.resolvedThumbUrl}
                alt=""
                className="absolute inset-0 w-full h-full object-cover"
                loading="lazy"
              />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center text-[var(--muted)] text-xs">
                no thumb
              </div>
            )}
            {/* Hover play overlay */}
            <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/30 transition pointer-events-none">
              <div className="opacity-0 group-hover:opacity-100 transition rounded-full bg-black/70 p-2 backdrop-blur-sm">
                <Play size={16} className="fill-white text-white" />
              </div>
            </div>
            {/* Bottom bar with filename + relative time */}
            <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/85 to-transparent p-1.5">
              <div className="text-[10px] text-white truncate text-left" title={it.filename}>
                {it.filename}
              </div>
              <div className="text-[9px] text-white/60 text-left mt-0.5">
                {relativeTime(it.viewedAt)}
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}
