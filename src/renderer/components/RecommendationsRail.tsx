// File: src/renderer/components/RecommendationsRail.tsx
//
// #137 + #138 — Personalized "Recommended for you" strip on the
// Library home. Pulls from two backend recommenders and blends:
//   - reco:moreLikeThis     (co-watch similarity — collab signal)
//   - reco:tagAffinity      (tag overlap with view history — content
//                            signal, picks up items not yet co-watched)
//
// Why both? Co-watch alone misses items the user has never paired
// with anything (e.g. a brand-new import that matches the tag
// profile). Tag-affinity alone over-recommends the same heavy hitters
// from the user's library every time. Blending lets fresh content
// surface alongside what the user reliably watches.
//
// Renders a horizontal scroll row that hides itself if no
// recommendations exist (fresh install, no view history). One render
// pass; refreshes on vault:changed broadcast so a few watch sessions
// add items to the rail without a page reload.

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Sparkles } from 'lucide-react'
import { toFileUrlCached } from '../hooks/usePerformance'

interface Hit {
  mediaId: string
  filename: string
  thumbPath: string | null
  /** Either co-watch similarity or tag-affinity score; never zero on a hit. */
  score: number
  /** Where the recommendation came from — colored chip on the card. */
  source: 'cowatch' | 'tagaff'
}

interface Props {
  onPlay: (mediaId: string) => void
  /** Optional: limit how many cards the rail shows. Default 12. */
  limit?: number
  className?: string
}

export function RecommendationsRail({ onPlay, limit = 12, className }: Props) {
  const [hits, setHits] = useState<Hit[]>([])
  const [thumbUrls, setThumbUrls] = useState<Record<string, string>>({})

  const load = useCallback(async () => {
    const api: any = (window as any).api
    if (!api?.recoTagAffinity && !api?.recoTodaysPicks) return
    try {
      // Pull both signals in parallel.
      const [tagRes, picksRes] = await Promise.all([
        api.recoTagAffinity?.({ limit: limit * 2 }).catch(() => ({ ok: false, items: [] })),
        api.recoTodaysPicks?.(limit * 2).catch(() => ({ ok: false, items: [] })),
      ])
      const tagItems: Hit[] = ((tagRes?.items ?? []) as any[]).map((i) => ({
        mediaId: i.mediaId,
        filename: String(i.filename ?? ''),
        thumbPath: i.thumbPath ?? null,
        score: Number(i.score) || 0,
        source: 'tagaff',
      }))
      const cowatchItems: Hit[] = ((picksRes?.items ?? []) as any[]).map((i) => ({
        mediaId: i.mediaId,
        filename: String(i.filename ?? ''),
        thumbPath: i.thumbPath ?? null,
        score: Number(i.similarity) || 0,
        source: 'cowatch',
      }))
      // Interleave: take 1 cowatch, 1 tagaff, 1 cowatch, ... so the
      // user sees both signals up-front. Dedup by mediaId.
      const seen = new Set<string>()
      const blended: Hit[] = []
      const maxLen = Math.max(cowatchItems.length, tagItems.length)
      for (let i = 0; i < maxLen && blended.length < limit; i++) {
        const c = cowatchItems[i]
        if (c && !seen.has(c.mediaId)) { blended.push(c); seen.add(c.mediaId) }
        const t = tagItems[i]
        if (t && !seen.has(t.mediaId)) { blended.push(t); seen.add(t.mediaId) }
      }
      setHits(blended.slice(0, limit))
    } catch { /* IPC missing — hide the rail */ }
  }, [limit])

  useEffect(() => {
    void load()
    const api: any = (window as any).api
    const off = api?.events?.onVaultChanged?.(() => { void load() })
    return () => { try { off?.() } catch {} }
  }, [load])

  // Resolve thumbnail URLs lazily.
  useEffect(() => {
    let cancelled = false
    void (async () => {
      const urls: Record<string, string> = {}
      for (const h of hits) {
        if (!h.thumbPath) continue
        try {
          const u = await toFileUrlCached(h.thumbPath)
          if (u) urls[h.mediaId] = u
        } catch { /* skip */ }
      }
      if (!cancelled) setThumbUrls(urls)
    })()
    return () => { cancelled = true }
  }, [hits])

  const visible = useMemo(() => hits.filter((h) => !!thumbUrls[h.mediaId] || true), [hits, thumbUrls])
  if (visible.length === 0) return null

  return (
    <div className={`mb-4 ${className ?? ''}`}>
      <div className="flex items-center gap-2 mb-2 px-1">
        <Sparkles size={14} className="text-[var(--primary)]" />
        <div className="text-xs uppercase tracking-wide text-zinc-400 font-semibold">Recommended for you</div>
        <div className="text-[10px] text-zinc-600">
          blended from co-watch + tag affinity
        </div>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1">
        {visible.map((h) => (
          <button
            key={h.mediaId}
            onClick={() => onPlay(h.mediaId)}
            className="relative flex-shrink-0 w-32 h-20 rounded-lg overflow-hidden bg-zinc-900 border border-zinc-800 hover:border-[var(--primary)]/60 group transition"
            title={h.filename || h.mediaId}
          >
            {thumbUrls[h.mediaId] ? (
              <img
                src={thumbUrls[h.mediaId]}
                alt=""
                className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                loading="lazy"
              />
            ) : (
              <div className="absolute inset-0 grid place-items-center text-zinc-700">…</div>
            )}
            <div className="absolute inset-x-0 bottom-0 p-1 bg-gradient-to-t from-black/90 to-transparent">
              <div className="text-[10px] truncate text-white">{h.filename || h.mediaId}</div>
            </div>
            <div
              className={
                'absolute top-1 left-1 px-1 py-0.5 rounded text-[8px] uppercase tracking-wider text-white ' +
                (h.source === 'cowatch' ? 'bg-emerald-500/85' : 'bg-[var(--primary)]/85')
              }
              title={h.source === 'cowatch' ? 'Often watched with' : 'Matches your taste'}
            >
              {h.source === 'cowatch' ? 'co-watch' : 'taste'}
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}
