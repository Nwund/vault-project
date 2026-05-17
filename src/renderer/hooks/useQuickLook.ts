// File: src/renderer/hooks/useQuickLook.ts
//
// #291 D-67 — Raycast-style Quick Look. Hold Space on a focused tile
// to pop up a centered, larger preview that stays open while Space
// is held. Release Space to close.
//
// Designed to work with the roving-tabindex grid (#342): the active
// cell determines the preview content. State is local to the
// container, not the tile — caller installs the hook once at the
// Library / Browse page level.

import { useEffect, useState, useCallback } from 'react'

export interface QuickLookState<T> {
  visible: boolean
  /** The item currently being previewed. */
  item: T | null
  /** True while Space is held; false otherwise. */
  isHolding: boolean
}

export function useQuickLook<T>(
  resolveItemFromFocus: () => T | null,
  options: { holdMs?: number } = {},
): {
  state: QuickLookState<T>
  /** Mount this on the container element to scope the hotkey. */
  containerProps: {
    onKeyDown: (e: React.KeyboardEvent<HTMLElement>) => void
    onKeyUp: (e: React.KeyboardEvent<HTMLElement>) => void
  }
  /** Explicit close (e.g. clicking elsewhere). */
  close: () => void
} {
  const holdMs = options.holdMs ?? 250
  const [state, setState] = useState<QuickLookState<T>>({ visible: false, item: null, isHolding: false })
  const holdTimer = { current: 0 as number | 0 }

  const close = useCallback(() => setState({ visible: false, item: null, isHolding: false }), [])

  const onKeyDown = useCallback((e: React.KeyboardEvent<HTMLElement>) => {
    if (e.code !== 'Space') return
    if (state.isHolding) return
    setState((s) => ({ ...s, isHolding: true }))
    e.preventDefault()
    holdTimer.current = window.setTimeout(() => {
      const item = resolveItemFromFocus()
      if (item) setState({ visible: true, item, isHolding: true })
    }, holdMs)
  }, [state.isHolding, resolveItemFromFocus, holdMs])

  const onKeyUp = useCallback((e: React.KeyboardEvent<HTMLElement>) => {
    if (e.code !== 'Space') return
    clearTimeout(holdTimer.current)
    setState({ visible: false, item: null, isHolding: false })
  }, [])

  useEffect(() => () => clearTimeout(holdTimer.current), [])

  return { state, containerProps: { onKeyDown, onKeyUp }, close }
}
