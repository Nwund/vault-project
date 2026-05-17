// File: src/renderer/hooks/useSpriteHoverScrub.ts
//
// #146 — Hover-scrub preview from a pre-generated 6×6 sprite sheet.
//
// Usage on a video card:
//   const { containerRef, style, ready, ensure } = useSpriteHoverScrub({
//     mediaId,
//     enabled: isVideo,
//   })
//   <div ref={containerRef} onMouseEnter={ensure} style={ready ? style : undefined} ... />
//
// The hook lazily fetches the sprite-sheet path the first time the
// card is hovered (so we don't burn an IPC per row in a 60-row
// library). If the sheet doesn't exist yet, `ensure()` kicks off the
// ffmpeg generation; once the path resolves, mouse-move updates the
// background-position to the slice corresponding to the cursor's x
// fraction across the card.
//
// We honor `prefers-reduced-motion` by leaving the static thumbnail
// in place — the user's existing thumbPath remains the unscrubbed
// visual.

import { useCallback, useEffect, useRef, useState } from 'react'
import { toFileUrlCached } from './usePerformance'

interface UseSpriteHoverScrubOptions {
  mediaId: string
  enabled?: boolean
  /** 'scrub' = 6×6 (default), 'hover' = 4×1 (faster gen, coarser). */
  preset?: 'scrub' | 'hover'
}

interface SpriteHoverScrubResult {
  containerRef: React.RefObject<HTMLDivElement | null>
  style: React.CSSProperties | undefined
  ready: boolean
  generating: boolean
  ensure: () => void
}

export function useSpriteHoverScrub(opts: UseSpriteHoverScrubOptions): SpriteHoverScrubResult {
  const { mediaId, enabled = true, preset = 'scrub' } = opts
  const containerRef = useRef<HTMLDivElement>(null)
  const [sheetUrl, setSheetUrl] = useState<string | null>(null)
  const [cols, setCols] = useState(6)
  const [rows, setRows] = useState(6)
  const [generating, setGenerating] = useState(false)
  const [tileIdx, setTileIdx] = useState(0)
  const triggeredRef = useRef(false)
  const reducedMotion = useRef(false)

  useEffect(() => {
    const mql = window.matchMedia?.('(prefers-reduced-motion: reduce)')
    reducedMotion.current = !!mql?.matches
    const onChange = () => { reducedMotion.current = !!mql?.matches }
    mql?.addEventListener?.('change', onChange)
    return () => mql?.removeEventListener?.('change', onChange)
  }, [])

  // Cache the sheet path lookup so successive hovers don't re-IPC.
  const lookupOrGenerate = useCallback(async () => {
    if (!enabled || !mediaId) return
    if (triggeredRef.current) return
    triggeredRef.current = true
    const api: any = (window as any).api
    if (!api?.mediaSpriteSheetPath) return
    try {
      const lookup = await api.mediaSpriteSheetPath({ mediaId, preset })
      if (lookup?.path) {
        const url = await toFileUrlCached(lookup.path)
        setSheetUrl(url)
        if (lookup.cols) setCols(lookup.cols)
        if (lookup.rows) setRows(lookup.rows)
        return
      }
      // Not generated yet — kick off generation. This may take a few
      // seconds; we leave the static thumb in place until it finishes.
      setGenerating(true)
      const gen = await api.mediaEnsureSpriteSheet({ mediaId, preset })
      if (gen?.ok && gen.path) {
        const url = await toFileUrlCached(gen.path)
        setSheetUrl(url)
        if (gen.cols) setCols(gen.cols)
        if (gen.rows) setRows(gen.rows)
      }
    } catch {
      // Generation failures are fine — the existing thumb stays
      // visible, the user just doesn't get the scrub overlay.
    } finally {
      setGenerating(false)
    }
  }, [mediaId, enabled, preset])

  // Track cursor position relative to the card and pick a tile.
  useEffect(() => {
    if (!sheetUrl || reducedMotion.current) return
    const el = containerRef.current
    if (!el) return
    const totalTiles = cols * rows
    const onMove = (e: MouseEvent) => {
      const rect = el.getBoundingClientRect()
      const xFraction = Math.min(1, Math.max(0, (e.clientX - rect.left) / Math.max(1, rect.width)))
      const idx = Math.min(totalTiles - 1, Math.floor(xFraction * totalTiles))
      setTileIdx(idx)
    }
    const onLeave = () => setTileIdx(0)
    el.addEventListener('mousemove', onMove)
    el.addEventListener('mouseleave', onLeave)
    return () => {
      el.removeEventListener('mousemove', onMove)
      el.removeEventListener('mouseleave', onLeave)
    }
  }, [sheetUrl, cols, rows])

  // Compute the background-position. The sheet has cols*rows tiles
  // each of equal size — position by tile-row,tile-col within a
  // background-size of (cols * 100%) × (rows * 100%).
  const style: React.CSSProperties | undefined = sheetUrl
    ? {
        backgroundImage: `url('${sheetUrl}')`,
        backgroundSize: `${cols * 100}% ${rows * 100}%`,
        backgroundPosition: `${(tileIdx % cols) * (100 / Math.max(1, cols - 1))}% ${Math.floor(tileIdx / cols) * (100 / Math.max(1, rows - 1))}%`,
        backgroundRepeat: 'no-repeat',
        transition: 'background-position 50ms linear',
      }
    : undefined

  return {
    containerRef,
    style,
    ready: !!sheetUrl,
    generating,
    ensure: lookupOrGenerate,
  }
}
