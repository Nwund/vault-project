// File: src/renderer/components/HueCard.tsx
//
// #202 — Settings card for Phillips Hue cinema-mode dimming.
//
// Flow:
//   1. Discover button → calls hue:discover (meethue.com/api/nupnp)
//      and lists bridges. User picks one.
//   2. Pair button → calls hue:pair which fires the bridge's pairing
//      handshake. User must press the physical link button within
//      30 seconds. On success we get an opaque username we persist
//      in settings.hue.username.
//   3. Once paired, list lights and let the user check which ones
//      should be cinema-dimmable.
//   4. "Test dim" button → cinemaDim(targetBri); "Test restore" →
//      cinemaRestore. Confirms the wiring works before relying on
//      auto-trigger from fullscreen.

import React, { useCallback, useEffect, useState } from 'react'
import { Lightbulb, RefreshCw, Check, AlertTriangle, Play, RotateCcw } from 'lucide-react'

interface Bridge { id: string; ip: string }
interface Light { id: string; name: string; on: boolean; brightness: number; reachable: boolean }

export function HueCard(): React.JSX.Element {
  const [bridges, setBridges] = useState<Bridge[]>([])
  const [discovering, setDiscovering] = useState(false)
  const [pairing, setPairing] = useState(false)
  const [bridgeIp, setBridgeIp] = useState<string>('')
  const [username, setUsername] = useState<string>('')
  const [lights, setLights] = useState<Light[]>([])
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [targetBri, setTargetBri] = useState(30)
  const [autoDimOnFullscreen, setAutoDimOnFullscreen] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  // Load persisted bridge config + light selection.
  useEffect(() => {
    void (async () => {
      const api: any = (window as any).api
      try {
        const s = await api.settings.get()
        const hue = s?.hue ?? {}
        if (hue.bridgeIp) setBridgeIp(hue.bridgeIp)
        if (hue.username) setUsername(hue.username)
        if (Array.isArray(hue.cinemaLightIds)) setSelectedIds(new Set(hue.cinemaLightIds))
        if (typeof hue.cinemaTargetBri === 'number') setTargetBri(hue.cinemaTargetBri)
        if (typeof hue.autoDimOnFullscreen === 'boolean') setAutoDimOnFullscreen(hue.autoDimOnFullscreen)
      } catch { /* settings missing */ }
    })()
  }, [])

  // Once we have bridgeIp + username, list lights.
  useEffect(() => {
    if (!bridgeIp || !username) return
    const api: any = (window as any).api
    api.hueLights({ bridgeIp, username }).then((r: any) => {
      if (r?.ok) setLights(r.lights ?? [])
    }).catch(() => { /* offline */ })
  }, [bridgeIp, username])

  const persist = useCallback(async (patch: Record<string, unknown>) => {
    const api: any = (window as any).api
    try {
      const s = await api.settings.get()
      await api.settings.update({ ...s, hue: { ...(s.hue ?? {}), ...patch } })
    } catch { /* noop */ }
  }, [])

  const discover = useCallback(async () => {
    setDiscovering(true)
    setError(null)
    try {
      const api: any = (window as any).api
      const r = await api.hueDiscover()
      if (r?.ok) {
        setBridges(r.bridges ?? [])
        if ((r.bridges ?? []).length === 0) setInfo('No Hue bridges found on the LAN. Make sure your bridge is powered on and on the same network.')
        else setInfo(null)
      } else {
        setError(r?.error ?? 'Discovery failed')
      }
    } finally {
      setDiscovering(false)
    }
  }, [])

  const pair = useCallback(async (ip: string) => {
    setPairing(true)
    setError(null)
    setInfo('Press the physical link button on top of your Hue bridge within 30 seconds.')
    try {
      const api: any = (window as any).api
      // Poll up to 30 times (30s) so user has time to walk to the bridge.
      for (let i = 0; i < 30; i++) {
        const r = await api.huePair(ip)
        if (r?.ok && r.username) {
          setBridgeIp(ip)
          setUsername(r.username)
          await persist({ bridgeIp: ip, username: r.username })
          setInfo('Paired! Pick which lights to dim during cinema mode below.')
          return
        }
        if (r?.error && !r.error.toLowerCase().includes('link button')) {
          setError(r.error)
          return
        }
        await new Promise((res) => setTimeout(res, 1000))
      }
      setError('Pairing timed out — the link button must be pressed within 30s of clicking Pair.')
    } finally {
      setPairing(false)
    }
  }, [persist])

  const toggleLight = useCallback((id: string) => {
    setSelectedIds((cur) => {
      const next = new Set(cur)
      if (next.has(id)) next.delete(id); else next.add(id)
      void persist({ cinemaLightIds: Array.from(next) })
      return next
    })
  }, [persist])

  const testDim = useCallback(async () => {
    setError(null)
    setInfo('Dimming…')
    const api: any = (window as any).api
    const r = await api.hueCinemaDim({ bridgeIp, username, lightIds: Array.from(selectedIds), targetBri })
    if (r?.ok) setInfo(`Dimmed ${r.dimmed} lights, ${r.failed} failed.`)
    else setError(r?.error ?? 'Dim failed')
  }, [bridgeIp, username, selectedIds, targetBri])

  const testRestore = useCallback(async () => {
    setError(null)
    setInfo('Restoring…')
    const api: any = (window as any).api
    const r = await api.hueCinemaRestore({ bridgeIp, username, lightIds: Array.from(selectedIds) })
    if (r?.ok) setInfo(`Restored ${r.restored} lights, ${r.failed} failed.`)
    else setError(r?.error ?? 'Restore failed')
  }, [bridgeIp, username, selectedIds])

  return (
    <div className="rounded-3xl border border-[var(--border)] bg-black/20 p-5 mt-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Lightbulb size={16} className="text-[var(--primary)]" />
          <div className="text-sm font-semibold">Phillips Hue cinema mode</div>
        </div>
        {username && (
          <span className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300">
            <Check size={10} /> Paired
          </span>
        )}
      </div>

      {!username && (
        <div className="space-y-3">
          <div className="text-xs text-[var(--muted)]">
            Pair a Hue bridge to auto-dim lights when you go fullscreen.
          </div>
          <button
            onClick={discover}
            disabled={discovering}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md bg-zinc-800 hover:bg-zinc-700 text-zinc-200 disabled:opacity-50"
          >
            <RefreshCw size={12} className={discovering ? 'animate-spin' : ''} />
            {discovering ? 'Searching…' : 'Discover bridges'}
          </button>
          {bridges.length > 0 && (
            <div className="space-y-1.5">
              {bridges.map((b) => (
                <div key={b.id} className="flex items-center gap-2 p-2 rounded-md bg-zinc-900/40 border border-zinc-800">
                  <div className="flex-1">
                    <div className="text-sm font-mono">{b.ip}</div>
                    <div className="text-[10px] text-zinc-500">{b.id}</div>
                  </div>
                  <button
                    onClick={() => pair(b.ip)}
                    disabled={pairing}
                    className="text-xs px-2 py-1 rounded bg-[var(--primary)] text-white disabled:opacity-50"
                  >
                    {pairing ? 'Pairing…' : 'Pair'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {username && (
        <div className="space-y-3">
          <div className="text-[11px] text-zinc-400 font-mono truncate">
            {bridgeIp} · {username.slice(0, 8)}…
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-wide text-zinc-500 mb-1.5">
              Cinema lights ({selectedIds.size} of {lights.length} selected)
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5 max-h-48 overflow-y-auto">
              {lights.map((l) => {
                const on = selectedIds.has(l.id)
                return (
                  <label
                    key={l.id}
                    className={`flex items-center gap-2 p-2 rounded-md text-sm cursor-pointer border transition ${
                      on ? 'bg-[var(--primary)]/15 border-[var(--primary)]/40' : 'bg-zinc-900/40 border-zinc-800 hover:border-[var(--border)]'
                    } ${!l.reachable ? 'opacity-50' : ''}`}
                  >
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={() => toggleLight(l.id)}
                      className="accent-[var(--primary)]"
                    />
                    <span className="flex-1 truncate">{l.name}</span>
                    {!l.reachable && <span className="text-[9px] text-amber-400">unreachable</span>}
                  </label>
                )
              })}
            </div>
          </div>

          <div className="flex items-center gap-3 pt-1">
            <span className="text-xs text-zinc-400">Dim to</span>
            <input
              type="range"
              min={10}
              max={254}
              value={targetBri}
              onChange={(e) => {
                const v = Number(e.target.value)
                setTargetBri(v)
                void persist({ cinemaTargetBri: v })
              }}
              className="flex-1 accent-[var(--primary)]"
            />
            <span className="text-xs text-zinc-500 w-12 tabular-nums">{Math.round((targetBri / 254) * 100)}%</span>
          </div>

          <label className="flex items-center gap-2 text-xs text-zinc-300 cursor-pointer">
            <input
              type="checkbox"
              checked={autoDimOnFullscreen}
              onChange={(e) => {
                setAutoDimOnFullscreen(e.target.checked)
                void persist({ autoDimOnFullscreen: e.target.checked })
              }}
              className="accent-[var(--primary)]"
            />
            Auto-dim when fullscreen player opens
          </label>

          <div className="flex gap-2 pt-1">
            <button
              onClick={testDim}
              disabled={selectedIds.size === 0}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md bg-[var(--primary)] text-white disabled:opacity-50"
            >
              <Play size={11} /> Test dim
            </button>
            <button
              onClick={testRestore}
              disabled={selectedIds.size === 0}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md bg-zinc-800 hover:bg-zinc-700 text-zinc-200 disabled:opacity-50"
            >
              <RotateCcw size={11} /> Restore
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className="mt-3 flex items-start gap-1.5 text-[11px] text-amber-400">
          <AlertTriangle size={12} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}
      {info && !error && (
        <div className="mt-3 text-[11px] text-zinc-400">{info}</div>
      )}
    </div>
  )
}
