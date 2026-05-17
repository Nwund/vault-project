// File: src/renderer/components/PostNutLockoutOverlay.tsx
//
// #347 — Full-window clarity overlay shown while the post-nut
// refractory lockout is active. Lives at the App root so it covers
// every page including the detached player.
//
// Behavior:
//   - Polls main on a 5s tick + listens for `lockout:changed`
//     events for immediate updates.
//   - Renders only when state.active === true.
//   - Shows a countdown (mm:ss), a soft "step away" message, and
//     a "Cancel lockout" button that immediately unlocks (because
//     trapping the user defeats the consent / self-control framing).
//   - Click-through blocking via pointer-events: auto on the
//     overlay itself; the underlying app is fully covered.

import React, { useCallback, useEffect, useState } from 'react'
import { ShieldCheck, X } from 'lucide-react'

interface LockoutState {
  enabled: boolean
  durationMin: number
  lockedUntilTs: number | null
  remainingMs: number
  active: boolean
}

function fmtRemaining(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const mm = String(Math.floor(total / 60)).padStart(2, '0')
  const ss = String(total % 60).padStart(2, '0')
  return `${mm}:${ss}`
}

export function PostNutLockoutOverlay(): React.JSX.Element | null {
  const [state, setState] = useState<LockoutState | null>(null)
  const [now, setNow] = useState(Date.now())

  const refresh = useCallback(async () => {
    try {
      const api: any = (window as any).api
      const r = await api?.lockout?.status?.()
      if (r?.ok && r.state) setState(r.state)
    } catch { /* ignore */ }
  }, [])

  useEffect(() => {
    void refresh()
    const off = (window.api as any).on?.('lockout:changed', (payload: LockoutState) => {
      setState(payload)
    })
    const tick = setInterval(() => setNow(Date.now()), 1000)
    const poll = setInterval(() => { void refresh() }, 30_000)
    return () => {
      try { off?.() } catch { /* ignore */ }
      clearInterval(tick)
      clearInterval(poll)
    }
  }, [refresh])

  const cancel = useCallback(async () => {
    try {
      const api: any = (window as any).api
      const r = await api?.lockout?.cancel?.()
      if (r?.ok && r.state) setState(r.state)
    } catch { /* ignore */ }
  }, [])

  if (!state?.active) return null
  const remainingMs = state.lockedUntilTs ? state.lockedUntilTs - now : 0
  if (remainingMs <= 0) return null

  return (
    <div
      className="fixed inset-0 z-[99999] flex items-center justify-center"
      style={{
        background: 'radial-gradient(circle at center, rgba(8,12,30,0.92) 0%, rgba(0,0,0,0.98) 80%)',
        backdropFilter: 'blur(40px)',
        WebkitBackdropFilter: 'blur(40px)',
      }}
    >
      <div className="text-center px-8 py-12 max-w-md">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-emerald-500/15 border border-emerald-500/30 mb-6">
          <ShieldCheck size={32} className="text-emerald-300" />
        </div>
        <h2 className="text-3xl font-light text-white mb-2 tracking-wide">Clarity break</h2>
        <p className="text-sm text-white/60 leading-relaxed mb-8">
          You're in a refractory cool-down. Step away, hydrate, stretch — the goon will be here when you get back.
        </p>
        <div className="text-6xl font-mono font-light text-white mb-1 tabular-nums">
          {fmtRemaining(remainingMs)}
        </div>
        <p className="text-xs text-white/40 mb-10">until {new Date(state.lockedUntilTs!).toLocaleTimeString()}</p>
        <button
          onClick={cancel}
          className="px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/15 text-[12px] text-white/60 hover:text-white/90 transition inline-flex items-center gap-2"
        >
          <X size={14} />
          Cancel lockout
        </button>
        <p className="text-[10px] text-white/30 mt-3">No judgment — the lockout exists for you, not against you.</p>
      </div>
    </div>
  )
}
