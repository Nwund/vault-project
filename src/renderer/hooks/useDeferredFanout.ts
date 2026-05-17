// File: src/renderer/hooks/useDeferredFanout.ts
//
// #334 F-110 — startTransition + useDeferredValue around tag fan-out.
// The tag picker dispatches an "active tag set" change that ripples
// through 5+ components (Library grid, Sidebar count, Browse filter,
// Feed planner, Tag implications resolver). Without deferral, every
// keystroke in the tag picker re-renders ~200 ms of synchronous work.
//
// This hook receives a "live" tag value and returns a deferred
// version PLUS a startTransition setter for any internal-state
// mutations callers need to gate.

import { useDeferredValue, useState, useTransition, useCallback } from 'react'

export function useDeferredFanout<T>(initial: T): {
  liveValue: T
  deferredValue: T
  isPending: boolean
  set: (v: T) => void
  setDeferred: (v: T) => void
} {
  const [live, setLive] = useState<T>(initial)
  const deferred = useDeferredValue(live)
  const [isPending, startTransition] = useTransition()
  const setDeferred = useCallback((v: T) => {
    startTransition(() => setLive(v))
  }, [])
  return {
    liveValue: live,
    deferredValue: deferred,
    isPending,
    set: setLive,
    setDeferred,
  }
}
