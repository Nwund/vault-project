// File: src/renderer/hooks/useRovingTabIndex.ts
//
// #342 F-118 — WAI-ARIA roving tabindex for grid surfaces.
// Implements the standard pattern:
//
//   - Container has role="grid"
//   - One cell carries tabIndex=0; the rest carry tabIndex=-1
//   - Arrow keys move focus + roll the "0" with the active cell
//   - Home/End jump to row start/end, Ctrl+Home/End to the whole grid
//
// Caller wires the cell map by passing a count + cols and getting back
// a getCellProps(index) factory:
//
//   const grid = useRovingTabIndex({ count, cols })
//   <div role="grid">
//     {items.map((it, i) => (
//       <div role="gridcell" {...grid.getCellProps(i)}>...</div>
//     ))}
//   </div>

import { useCallback, useEffect, useRef, useState } from 'react'

export interface UseRovingTabIndexOptions {
  count: number
  cols: number
  /** Optional starting focus index. Default 0. */
  initial?: number
}

export function useRovingTabIndex(opts: UseRovingTabIndexOptions): {
  active: number
  setActive: (i: number) => void
  getCellProps: (index: number) => {
    tabIndex: number
    onKeyDown: (e: React.KeyboardEvent<HTMLElement>) => void
    onFocus: () => void
    role: 'gridcell'
    'aria-rowindex': number
    'aria-colindex': number
    ref: (el: HTMLElement | null) => void
  }
} {
  const [active, setActive] = useState(opts.initial ?? 0)
  const cellsRef = useRef<Map<number, HTMLElement>>(new Map())

  const move = useCallback((next: number) => {
    const clamped = Math.max(0, Math.min(opts.count - 1, next))
    setActive(clamped)
    cellsRef.current.get(clamped)?.focus()
  }, [opts.count])

  const onKey = useCallback((index: number, e: React.KeyboardEvent<HTMLElement>) => {
    const row = Math.floor(index / opts.cols)
    const col = index % opts.cols
    const rowStart = row * opts.cols
    const rowEnd = Math.min(rowStart + opts.cols - 1, opts.count - 1)
    switch (e.key) {
      case 'ArrowRight': e.preventDefault(); move(index + 1); break
      case 'ArrowLeft':  e.preventDefault(); move(index - 1); break
      case 'ArrowDown':  e.preventDefault(); move(index + opts.cols); break
      case 'ArrowUp':    e.preventDefault(); move(index - opts.cols); break
      case 'Home':       e.preventDefault(); move(e.ctrlKey ? 0 : rowStart); break
      case 'End':        e.preventDefault(); move(e.ctrlKey ? opts.count - 1 : rowEnd); break
      case 'PageUp':     e.preventDefault(); move(index - opts.cols * 5); break
      case 'PageDown':   e.preventDefault(); move(index + opts.cols * 5); break
    }
  }, [opts.cols, opts.count, move])

  useEffect(() => {
    if (active >= opts.count && opts.count > 0) setActive(opts.count - 1)
  }, [active, opts.count])

  const getCellProps = useCallback((index: number) => ({
    tabIndex: index === active ? 0 : -1,
    onKeyDown: (e: React.KeyboardEvent<HTMLElement>) => onKey(index, e),
    onFocus: () => setActive(index),
    role: 'gridcell' as const,
    'aria-rowindex': Math.floor(index / opts.cols) + 1,
    'aria-colindex': (index % opts.cols) + 1,
    ref: (el: HTMLElement | null) => {
      if (el) cellsRef.current.set(index, el); else cellsRef.current.delete(index)
    },
  }), [active, onKey, opts.cols])

  return { active, setActive, getCellProps }
}
