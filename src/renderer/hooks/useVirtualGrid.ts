// File: src/renderer/hooks/useVirtualGrid.ts
//
// #326 F-102 — TanStack react-virtual helper for grid surfaces.
// Browse / Library / Performers all paint thousands of tiles; without
// virtualization React + the GPU choke. This hook wraps useVirtualizer
// for a fixed-row, variable-column grid: caller passes the parent
// ref, total item count, and tile dimensions; it returns the absolute
// list of items currently in the viewport plus an offset to apply to
// the scroll container.
//
// Compatible with content-visibility:auto and View Transitions —
// emits the canonical inline transform (translate3d) so View
// Transitions can interpolate properly.

import { useMemo } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'

export interface VirtualGridOptions {
  parentRef: React.RefObject<HTMLElement>
  /** Total number of items being virtualized. */
  count: number
  /** Width of each tile (incl. gap) in px. */
  tileWidth: number
  /** Height of each tile (incl. gap) in px. */
  tileHeight: number
  /** Overscan rows below + above the viewport. Default 3. */
  overscan?: number
}

export interface VirtualGridItem {
  index: number
  /** translate3d transform string ready for the tile <div>. */
  transform: string
  /** Inline width / height that mirror tileWidth/tileHeight. */
  style: { width: number; height: number }
}

export function useVirtualGrid(opts: VirtualGridOptions): {
  /** Total height of the inner spacer. */
  totalSize: number
  /** Currently-visible items with their absolute transforms. */
  items: VirtualGridItem[]
  /** Number of columns the layout is using right now. */
  cols: number
} {
  const cols = useMemo(() => {
    const parent = opts.parentRef.current
    if (!parent) return 1
    const w = parent.clientWidth
    return Math.max(1, Math.floor(w / opts.tileWidth))
  }, [opts.parentRef.current?.clientWidth, opts.tileWidth])
  const rowCount = Math.ceil(opts.count / cols)
  const rowVirtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => opts.parentRef.current,
    estimateSize: () => opts.tileHeight,
    overscan: opts.overscan ?? 3,
  })
  const items: VirtualGridItem[] = []
  for (const v of rowVirtualizer.getVirtualItems()) {
    for (let c = 0; c < cols; c++) {
      const index = v.index * cols + c
      if (index >= opts.count) break
      items.push({
        index,
        transform: `translate3d(${c * opts.tileWidth}px, ${v.start}px, 0)`,
        style: { width: opts.tileWidth, height: opts.tileHeight },
      })
    }
  }
  return { totalSize: rowVirtualizer.getTotalSize(), items, cols }
}
