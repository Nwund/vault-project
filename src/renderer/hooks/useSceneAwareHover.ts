// File: src/renderer/hooks/useSceneAwareHover.ts
//
// #201 — Scene-aware hover preview (replaces #147).
//
// Upgrade to useVideoPreview: instead of looping evenly-spaced clips,
// preview clips align to detected shot boundaries (TransNet V2 when
// installed, evenly-spaced when not). This means the 4-clip hover
// loop actually spans 4 DIFFERENT scenes instead of 4 random offsets
// that may all be the same shot.
//
// Architecture:
//   1. Hook calls media:shotBoundaries(mediaId).
//   2. If the TransNet wrapper has a cached boundary list, we get
//      timestamps back. Otherwise we get null and fall back to
//      evenly-spaced sampling.
//   3. Bias selection toward the longest shots (highest "interestingness"
//      proxy in the absence of a real aesthetic score per shot).
//   4. Return an ordered timestamp list the caller's <video> seeks
//      through on a 1.5s/clip cycle.
//
// Caller integrates with the existing useVideoPreview pattern:
//   - Subscribe to the timestamps array
//   - When entering hover, set video.currentTime to first one
//   - On a setInterval, advance to the next timestamp
//   - On leave, pause + reset

import { useCallback, useEffect, useState } from 'react'

interface ShotBoundary {
  startSec: number
  endSec: number
}

interface Options {
  mediaId: string
  durationSec: number
  enabled?: boolean
  /** Number of preview clips. Default 4. */
  clipCount?: number
}

export function useSceneAwareHover(opts: Options): {
  timestamps: number[]
  loading: boolean
  fromShots: boolean
} {
  const { mediaId, durationSec, enabled = true, clipCount = 4 } = opts
  const [timestamps, setTimestamps] = useState<number[]>([])
  const [loading, setLoading] = useState(true)
  const [fromShots, setFromShots] = useState(false)

  const evenlySpaced = useCallback((): number[] => {
    if (durationSec < 4) return [Math.max(0, durationSec / 2)]
    const usableStart = durationSec * 0.1
    const usableEnd = durationSec * 0.9
    const span = usableEnd - usableStart
    return Array.from({ length: clipCount }, (_, i) =>
      usableStart + ((i + 0.5) / clipCount) * span,
    )
  }, [durationSec, clipCount])

  useEffect(() => {
    if (!enabled) { setTimestamps([]); return }
    let cancelled = false
    setLoading(true)

    ;(async () => {
      // Try to get cached shot boundaries from the TransNet wrapper.
      // The IPC may not exist yet (wrapper still scaffold); treat any
      // failure as "no shots, fall back to even spacing".
      let shots: ShotBoundary[] | null = null
      try {
        const api: any = (window as any).api
        const res = await api?.invoke?.('media:shotBoundaries', mediaId)
        if (res?.ok && Array.isArray(res.shots)) shots = res.shots as ShotBoundary[]
      } catch { /* IPC missing or failed */ }

      if (cancelled) return

      if (shots && shots.length >= clipCount) {
        // Pick the N longest shots (longest = most likely meaningful
        // content rather than transition/title cards).
        const ranked = [...shots]
          .filter((s) => s.endSec - s.startSec >= 1.5)
          .sort((a, b) => (b.endSec - b.startSec) - (a.endSec - a.startSec))
          .slice(0, clipCount)
        // Re-sort chronologically so the preview plays forward.
        ranked.sort((a, b) => a.startSec - b.startSec)
        // Sample mid-shot for each (avoids the transition frames).
        const ts = ranked.map((s) => s.startSec + (s.endSec - s.startSec) * 0.5)
        setTimestamps(ts)
        setFromShots(true)
      } else {
        setTimestamps(evenlySpaced())
        setFromShots(false)
      }
      setLoading(false)
    })()

    return () => { cancelled = true }
  }, [mediaId, enabled, clipCount, evenlySpaced])

  return { timestamps, loading, fromShots }
}
