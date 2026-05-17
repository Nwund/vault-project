// File: src/renderer/hooks/useBrowsePhashBadges.ts
//
// #208 — Renderer-side glue for the background phash indexer.
//
// Usage on a results grid:
//   const badges = useBrowsePhashBadges(results.map(r => r.thumbUrl))
//   ...
//   {badges[r.thumbUrl] && <NearDupBadge distance={badges[r.thumbUrl]!.distance} />}
//
// Flow:
//   1. Enqueue every URL once on mount / when the list changes.
//   2. Poll the cache lookup every 2s while there are URLs without
//      a known phash, stopping once every URL has either a hash or
//      we've polled past the deadline.
//   3. As phashes arrive, batch them into one findSimilar call to
//      get the nearest-local-media badge per phash.

import { useEffect, useMemo, useRef, useState } from 'react'

const POLL_INTERVAL_MS = 2000
const POLL_DEADLINE_MS = 60_000
const DEFAULT_MAX_DIST = 8

export interface NearDupHit {
  mediaId: string
  distance: number
}

export function useBrowsePhashBadges(
  urls: string[],
  options?: { enabled?: boolean; maxDist?: number },
): Record<string, NearDupHit | null> {
  const enabled = options?.enabled ?? true
  const maxDist = options?.maxDist ?? DEFAULT_MAX_DIST

  const [phashByUrl, setPhashByUrl] = useState<Record<string, string | null>>({})
  const [matchByPhash, setMatchByPhash] = useState<Record<string, NearDupHit | null>>({})

  // Stable key so the effect doesn't restart when the array reference
  // changes but its content is the same.
  const urlsKey = useMemo(() => urls.slice().sort().join('|'), [urls])

  // Reset state when the URL set changes (avoid stale badges from a
  // previous search).
  useEffect(() => {
    setPhashByUrl({})
    setMatchByPhash({})
  }, [urlsKey])

  const startedAtRef = useRef(0)

  useEffect(() => {
    if (!enabled || urls.length === 0) return
    const api: any = (window as any).api
    if (!api?.browsePhashEnqueue) return
    startedAtRef.current = Date.now()

    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | null = null

    const tick = async () => {
      if (cancelled) return
      // Enqueue all known URLs; the service skips ones it already has.
      try { await api.browsePhashEnqueue(urls) } catch { /* noop */ }

      // Look up which URLs now have a phash cached.
      let lookup: Record<string, string | null> = {}
      try { lookup = await api.browsePhashLookup(urls) ?? {} } catch { /* noop */ }
      if (cancelled) return
      setPhashByUrl(lookup)

      // For any non-null phashes we haven't yet matched, fire one
      // batched findSimilar call.
      const phashesToMatch = Object.values(lookup)
        .filter((p): p is string => typeof p === 'string' && p.length === 16)
        .filter((p) => !(p in matchByPhash))
      if (phashesToMatch.length > 0) {
        try {
          const matches = await api.browsePhashFindSimilar(phashesToMatch, maxDist) ?? {}
          if (cancelled) return
          setMatchByPhash((cur) => ({ ...cur, ...matches }))
        } catch { /* noop */ }
      }

      // Decide whether to keep polling.
      const stillMissing = urls.some((u) => !(u in lookup) || lookup[u] === null)
      const elapsed = Date.now() - startedAtRef.current
      if (stillMissing && elapsed < POLL_DEADLINE_MS) {
        timer = setTimeout(tick, POLL_INTERVAL_MS)
      }
    }

    // Kick off immediately.
    tick()

    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlsKey, enabled, maxDist])

  return useMemo(() => {
    const out: Record<string, NearDupHit | null> = {}
    for (const url of urls) {
      const phash = phashByUrl[url]
      out[url] = phash ? (matchByPhash[phash] ?? null) : null
    }
    return out
  }, [urls, phashByUrl, matchByPhash])
}
