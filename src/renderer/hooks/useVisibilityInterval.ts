// File: src/renderer/hooks/useVisibilityInterval.ts
//
// setInterval that pauses while the tab is hidden. Vault leaves the
// window open for hours with the user often off in another app —
// without this, every polling card (queue dashboard, sidecar status,
// home-assistant, sessions devices, etc.) keeps firing IPCs into a
// renderer no human is looking at, spiking CPU + locking up IO.
//
// Behavior:
//   - On mount: runs `cb()` once immediately, then every `ms` ms.
//   - When document becomes hidden: the timer is cleared.
//   - When visibility returns: fires `cb()` once (so the UI catches
//     up immediately) and resumes ticking.
//   - `ms = 0` disables the timer entirely.
//
// Drop-in replacement for the common pattern:
//   useEffect(() => { void cb(); const t = setInterval(cb, 5000); return () => clearInterval(t) }, [cb])

import { useEffect, useRef } from 'react'

export function useVisibilityInterval(cb: () => void | Promise<void>, ms: number): void {
  // Stash the latest callback in a ref so consumers don't have to
  // memoize it just to keep us from re-subscribing.
  const cbRef = useRef(cb)
  useEffect(() => { cbRef.current = cb }, [cb])

  useEffect(() => {
    if (!ms || ms <= 0) return
    let timer: ReturnType<typeof setInterval> | null = null
    let cancelled = false

    const tick = () => {
      if (cancelled) return
      try { void cbRef.current() } catch { /* swallow — caller's problem */ }
    }
    const start = () => {
      if (timer != null) return
      tick()
      timer = setInterval(tick, ms)
    }
    const stop = () => {
      if (timer != null) { clearInterval(timer); timer = null }
    }
    const onVisibility = () => {
      if (document.hidden) stop()
      else start()
    }

    if (!document.hidden) start()
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      cancelled = true
      stop()
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [ms])
}
