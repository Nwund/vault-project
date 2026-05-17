// File: src/renderer/components/SelfControlCard.tsx
//
// Combined Settings card for the three self-discipline features:
//
//   #347 — post-nut clarity lockout    (toggle + duration + trigger)
//   #348 — edging scoreboard           (current streak, XP, stats)
//   #363 — per-media denial cooldown   (no UI here; surfaced per-tile)
//
// One card so the related machinery lives in one mental model.

import React, { useCallback, useEffect, useState } from 'react'
import { ShieldCheck, Flame, Timer, Award, Play, Square, RefreshCw } from 'lucide-react'

interface LockoutState {
  enabled: boolean
  durationMin: number
  lockedUntilTs: number | null
  remainingMs: number
  active: boolean
}

interface EdgingStats {
  totalSessions: number
  totalDeniedSessions: number
  totalClimaxSessions: number
  currentDenialStreak: number
  longestDenialStreak: number
  totalXp: number
  longestSessionSec: number
  averageSessionSec: number
}

function fmtMs(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const mm = String(Math.floor(total / 60)).padStart(2, '0')
  const ss = String(total % 60).padStart(2, '0')
  return `${mm}:${ss}`
}

function fmtSec(s: number): string {
  if (s < 60) return `${s}s`
  if (s < 3600) return `${Math.floor(s / 60)}m ${s % 60}s`
  return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`
}

export function SelfControlCard(): React.JSX.Element {
  const [lockout, setLockout] = useState<LockoutState | null>(null)
  const [stats, setStats] = useState<EdgingStats | null>(null)
  const [openSession, setOpenSession] = useState<{ id: string; startedAt: number } | null>(null)
  const [duration, setDuration] = useState(30)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [now, setNow] = useState(Date.now())

  const refresh = useCallback(async () => {
    try {
      const api: any = (window as any).api
      const [l, s, recent] = await Promise.all([
        api?.lockout?.status?.(),
        api?.edging?.stats?.(),
        api?.edging?.recent?.(1),
      ])
      if (l?.ok && l.state) {
        setLockout(l.state)
        setDuration(l.state.durationMin)
      }
      if (s?.ok && s.stats) setStats(s.stats)
      const last = recent?.sessions?.[0]
      if (last && last.endedAt === null) setOpenSession({ id: last.id, startedAt: last.startedAt })
      else setOpenSession(null)
    } catch (err: any) {
      console.warn('[SelfControlCard] refresh failed:', err)
    }
  }, [])

  useEffect(() => {
    void refresh()
    const tick = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(tick)
  }, [refresh])

  const toggleEnabled = useCallback(async (enabled: boolean) => {
    setBusy('toggle')
    const api: any = (window as any).api
    try {
      const r = await api?.lockout?.setEnabled?.(enabled)
      if (r?.ok && r.state) setLockout(r.state)
    } finally { setBusy(null) }
  }, [])

  const saveDuration = useCallback(async (d: number) => {
    setBusy('duration')
    const api: any = (window as any).api
    try {
      const r = await api?.lockout?.setDuration?.(d)
      if (r?.ok && r.state) setLockout(r.state)
    } finally { setBusy(null) }
  }, [])

  const triggerLockout = useCallback(async () => {
    setBusy('trigger')
    setError(null); setInfo(null)
    const api: any = (window as any).api
    try {
      const r = await api?.lockout?.trigger?.({ durationMin: duration })
      if (r?.ok) {
        setInfo(`Lockout active for ${duration} min.`)
        await refresh()
      } else {
        setError(r?.error ?? 'Trigger failed')
      }
    } finally { setBusy(null) }
  }, [duration, refresh])

  const startSession = useCallback(async () => {
    setBusy('startSession')
    const api: any = (window as any).api
    try {
      const r = await api?.edging?.start?.()
      if (r?.ok) await refresh()
      else setError(r?.error ?? 'Start failed')
    } finally { setBusy(null) }
  }, [refresh])

  const endSession = useCallback(async (outcome: 'climax' | 'denied' | 'ruined') => {
    setBusy(outcome)
    const api: any = (window as any).api
    try {
      const r = await api?.edging?.end?.({ outcome })
      if (r?.ok) {
        const sess = r.session
        const xp = sess?.xpEarned ?? 0
        const dur = sess?.durationSec ?? 0
        setInfo(`+${xp} XP · ${fmtSec(dur)} (${outcome})`)
        // Auto-trigger lockout on climax (true climax — ruined doesn't trigger).
        if (outcome === 'climax' && lockout?.enabled) {
          await api?.lockout?.trigger?.({})
        }
        await refresh()
      } else {
        setError(r?.error ?? 'End failed')
      }
    } finally { setBusy(null) }
  }, [lockout?.enabled, refresh])

  const sessionElapsed = openSession ? now - openSession.startedAt : 0

  return (
    <div className="rounded-3xl border border-[var(--border)] bg-black/20 p-5 mt-4">
      <div className="flex items-center gap-2 mb-4">
        <ShieldCheck size={16} className="text-emerald-300" />
        <div className="text-sm font-semibold">Self-control</div>
        <span className="ml-auto text-[10px] text-[var(--muted)]">post-nut lockout + edging scoreboard</span>
      </div>

      {/* Active session badge */}
      {openSession && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 mb-3 flex items-center gap-3">
          <Flame size={16} className="text-amber-300" />
          <div className="flex-1">
            <div className="text-[12px] font-semibold text-amber-200">Session in progress</div>
            <div className="text-[10px] text-amber-200/70">Started {new Date(openSession.startedAt).toLocaleTimeString()} · elapsed {fmtMs(sessionElapsed)}</div>
          </div>
          <button
            onClick={() => endSession('denied')}
            disabled={busy !== null}
            className="px-3 py-1.5 rounded bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-emerald-100 text-[11px]"
            title="Stopped before climax — denial streak +1"
          >
            Denied
          </button>
          <button
            onClick={() => endSession('ruined')}
            disabled={busy !== null}
            className="px-3 py-1.5 rounded bg-purple-500/20 hover:bg-purple-500/30 border border-purple-500/40 text-purple-100 text-[11px]"
            title="Went past the edge but choked off completion — 2× XP + denial streak +1"
          >
            Ruined
          </button>
          <button
            onClick={() => endSession('climax')}
            disabled={busy !== null}
            className="px-3 py-1.5 rounded bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/40 text-rose-100 text-[11px]"
            title="Full climax — breaks denial streak, triggers post-nut lockout"
          >
            Climax
          </button>
        </div>
      )}
      {!openSession && (
        <button
          onClick={startSession}
          disabled={busy !== null}
          className="w-full mb-3 px-3 py-2 rounded-lg bg-pink-500/10 hover:bg-pink-500/15 border border-pink-500/30 text-pink-200 text-[12px] flex items-center justify-center gap-2"
        >
          <Play size={12} /> Start edging session
        </button>
      )}

      {/* Stats grid */}
      {stats && (
        <div className="grid grid-cols-4 gap-2 mb-3">
          <Stat icon={<Award size={11} />} label="Total XP" value={stats.totalXp.toLocaleString()} accent="text-amber-300" />
          <Stat icon={<Flame size={11} />} label="Streak" value={`${stats.currentDenialStreak}`} accent="text-orange-300" />
          <Stat icon={<Timer size={11} />} label="Longest" value={fmtSec(stats.longestSessionSec)} accent="text-blue-300" />
          <Stat icon={<ShieldCheck size={11} />} label="Sessions" value={`${stats.totalSessions}`} accent="text-emerald-300" />
        </div>
      )}

      {/* Lockout config */}
      <div className="rounded-lg border border-white/10 p-3 space-y-2">
        <div className="flex items-center gap-2">
          <div className="text-[12px] font-semibold">Post-nut lockout</div>
          {lockout?.active && (
            <span className="px-1.5 py-0.5 rounded bg-red-500/20 border border-red-500/40 text-red-200 text-[10px]">
              ACTIVE · {fmtMs(lockout.lockedUntilTs ? lockout.lockedUntilTs - now : 0)}
            </span>
          )}
          <label className="ml-auto flex items-center gap-2 text-[10px] cursor-pointer">
            <input
              type="checkbox"
              checked={!!lockout?.enabled}
              onChange={(e) => toggleEnabled(e.target.checked)}
              disabled={busy !== null}
              className="accent-emerald-500"
            />
            Enabled
          </label>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-[10px] text-[var(--muted)]">Duration:</label>
          <input
            type="range"
            min={5}
            max={240}
            step={5}
            value={duration}
            onChange={(e) => setDuration(Number(e.target.value))}
            onMouseUp={() => saveDuration(duration)}
            onTouchEnd={() => saveDuration(duration)}
            className="flex-1 accent-emerald-500"
          />
          <span className="text-[11px] font-mono w-12 text-right">{duration}m</span>
        </div>
        <div className="flex gap-2">
          <button
            onClick={triggerLockout}
            disabled={busy !== null}
            className="flex-1 px-2 py-1.5 rounded bg-white/5 hover:bg-white/10 border border-white/10 text-[11px] flex items-center justify-center gap-1.5 disabled:opacity-40"
          >
            Trigger now
          </button>
          <button
            onClick={() => void refresh()}
            className="px-2 py-1.5 rounded bg-white/5 hover:bg-white/10 border border-white/10 text-[10px] flex items-center gap-1"
          >
            <RefreshCw size={10} />
          </button>
        </div>
      </div>

      {error && <div className="mt-2 text-[10px] text-red-300">{error}</div>}
      {info && <div className="mt-2 text-[10px] text-emerald-300">{info}</div>}
    </div>
  )
}

function Stat({ icon, label, value, accent }: { icon: React.ReactNode; label: string; value: string; accent: string }): React.JSX.Element {
  return (
    <div className="rounded-lg bg-black/30 border border-white/5 p-2 text-center">
      <div className={`flex items-center justify-center gap-1 text-[9px] uppercase tracking-wider ${accent}`}>
        {icon}{label}
      </div>
      <div className="text-base font-mono mt-0.5">{value}</div>
    </div>
  )
}
