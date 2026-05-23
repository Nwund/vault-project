// File: src/renderer/components/HostsBlocklistCard.tsx
//
// #222 / #223 / #224 — StevenBlack porn-only hosts blocklist surface.
//
// Three features in one card:
//   1. Cache management — refresh from raw.githubusercontent + show
//      domain count + fetched-at timestamp.
//   2. Source discovery — list blocklist domains we DON'T already
//      have a Browse adapter for, categorized (tube/cam/cdn/...).
//   3. Panic mode — write the entire list to System32\drivers\etc\hosts
//      via UAC-elevated PowerShell. Toggle off to remove our block.
//
// Auto-NSFW tagging (#224) needs no UI — it runs at download:completed
// time in ipc.ts, gated on whether the cache exists. Refreshing the
// list here is what enables auto-tagging for new downloads.

import React, { useCallback, useEffect, useState } from 'react'
import { Shield, RefreshCw, AlertTriangle, Loader2, Search, Power, PowerOff, Check } from 'lucide-react'
import { formatBytes } from '../utils/formatters'

interface Meta { url: string; fetchedAt: string; domainCount: number; bytes: number }
interface DiscoveryCandidate { domain: string; category: 'tube' | 'cam' | 'cdn' | 'gallery' | 'other' }

export function HostsBlocklistCard(): React.JSX.Element {
  const [cached, setCached] = useState(false)
  const [meta, setMeta] = useState<Meta | null>(null)
  const [panicActive, setPanicActive] = useState(false)
  const [busy, setBusy] = useState<'refresh' | 'discover' | 'panicOn' | 'panicOff' | null>(null)
  const [candidates, setCandidates] = useState<DiscoveryCandidate[] | null>(null)
  const [filter, setFilter] = useState<'all' | DiscoveryCandidate['category']>('tube')
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  const refreshStatus = useCallback(async () => {
    try {
      const api: any = (window as any).api
      const r = await api.hostsBlocklistStatus()
      if (r?.ok) {
        setCached(!!r.cached)
        setMeta(r.meta ?? null)
        setPanicActive(!!r.panicModeActive)
      }
    } catch (err: any) {
      setError(err?.message ?? String(err))
    }
  }, [])

  useEffect(() => { void refreshStatus() }, [refreshStatus])

  const onRefresh = useCallback(async () => {
    setBusy('refresh'); setError(null); setInfo(null)
    try {
      const api: any = (window as any).api
      if (typeof api?.hostsBlocklistRefresh !== 'function') {
        setError('IPC unavailable — restart Vault so the main process picks up the latest handlers.')
        return
      }
      console.log('[HostsBlocklist] Fetching StevenBlack list…')
      const r = await api.hostsBlocklistRefresh()
      console.log('[HostsBlocklist] refresh result:', r)
      if (r?.ok && r.meta) {
        setInfo(`Cached ${r.meta.domainCount.toLocaleString()} domains (${formatBytes(r.meta.bytes)})`)
        await refreshStatus()
      } else {
        setError(r?.error ?? 'Refresh failed (empty response from main process)')
      }
    } catch (err: any) {
      console.error('[HostsBlocklist] refresh threw:', err)
      setError(`Refresh threw: ${err?.message ?? String(err)}`)
    } finally {
      setBusy(null)
    }
  }, [refreshStatus])

  const onDiscover = useCallback(async () => {
    setBusy('discover'); setError(null); setInfo(null)
    try {
      const api: any = (window as any).api
      const r = await api.hostsBlocklistDiscover({ limit: 200 })
      if (r?.ok) {
        setCandidates(r.candidates ?? [])
        setInfo(`${(r.candidates ?? []).length} candidate domains (not yet adapted)`)
      } else {
        setError(r?.error ?? 'Discover failed')
      }
    } finally {
      setBusy(null)
    }
  }, [])

  const onPanicOn = useCallback(async () => {
    setBusy('panicOn'); setError(null); setInfo(null)
    try {
      const api: any = (window as any).api
      const r = await api.hostsBlocklistPanicOn()
      if (r?.ok) {
        setInfo('Panic mode active. DNS cache flushed.')
        await refreshStatus()
      } else {
        setError(r?.error ?? 'Activation failed')
      }
    } finally {
      setBusy(null)
    }
  }, [refreshStatus])

  const onPanicOff = useCallback(async () => {
    setBusy('panicOff'); setError(null); setInfo(null)
    try {
      const api: any = (window as any).api
      const r = await api.hostsBlocklistPanicOff()
      if (r?.ok) {
        setInfo('Panic mode deactivated. Hosts file restored.')
        await refreshStatus()
      } else {
        setError(r?.error ?? 'Deactivation failed')
      }
    } finally {
      setBusy(null)
    }
  }, [refreshStatus])

  const visibleCandidates = (candidates ?? []).filter((c) => filter === 'all' || c.category === filter)

  return (
    <div className="rounded-3xl border border-[var(--border)] bg-black/20 p-5 mt-4">
      <div className="flex items-center gap-2 mb-4">
        <Shield size={16} className="text-emerald-300" />
        <div className="text-sm font-semibold">Adult-site Blocklist (StevenBlack)</div>
        {panicActive && (
          <span className="ml-auto px-2 py-0.5 rounded-full bg-red-500/20 border border-red-500/40 text-red-200 text-[10px]">PANIC MODE ACTIVE</span>
        )}
      </div>

      <p className="text-[11px] text-[var(--muted)] mb-3 max-w-xl">
        Caches the StevenBlack porn-extension hosts list (~76k domains). Enables auto-NSFW tagging on URL downloads and unlocks "panic mode" — a one-button OS-level DNS block.
      </p>

      {/* Cache status + refresh */}
      <div className="flex items-center gap-3 mb-3">
        {cached && meta ? (
          <div className="text-[11px] text-emerald-300">
            ✓ Cached · {meta.domainCount.toLocaleString()} domains · fetched {new Date(meta.fetchedAt).toLocaleString()}
          </div>
        ) : (
          <div className="text-[11px] text-amber-300">Not cached. Refresh to enable auto-NSFW + panic mode.</div>
        )}
        <button
          onClick={onRefresh}
          disabled={busy !== null}
          className="ml-auto px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-[11px] flex items-center gap-1.5 transition disabled:opacity-40"
        >
          {busy === 'refresh' ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
          {cached ? 'Re-fetch' : 'Fetch list'}
        </button>
      </div>

      {/* Panic mode toggle */}
      <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-3 mb-3">
        <div className="flex items-start gap-3">
          <AlertTriangle size={14} className="text-red-300 mt-0.5 shrink-0" />
          <div className="flex-1">
            <div className="text-[12px] font-semibold text-red-200">Nuclear panic mode (Windows only)</div>
            <div className="text-[11px] text-red-200/70 mt-1">
              Writes the blocklist into <span className="font-mono">System32\drivers\etc\hosts</span>. Requires UAC. Every porn domain resolves to 0.0.0.0 system-wide — affects all browsers + apps. Toggle off to restore.
            </div>
            <div className="flex gap-2 mt-2">
              {!panicActive ? (
                <button
                  onClick={onPanicOn}
                  disabled={!cached || busy !== null}
                  className="px-3 py-1.5 rounded bg-red-500/20 hover:bg-red-500/30 border border-red-500/40 text-red-100 text-[11px] flex items-center gap-1.5 transition disabled:opacity-40"
                >
                  {busy === 'panicOn' ? <Loader2 size={12} className="animate-spin" /> : <Power size={12} />}
                  Activate panic mode
                </button>
              ) : (
                <button
                  onClick={onPanicOff}
                  disabled={busy !== null}
                  className="px-3 py-1.5 rounded bg-white/5 hover:bg-white/10 border border-white/10 text-[11px] flex items-center gap-1.5 transition disabled:opacity-40"
                >
                  {busy === 'panicOff' ? <Loader2 size={12} className="animate-spin" /> : <PowerOff size={12} />}
                  Deactivate
                </button>
              )}
              {!cached && (
                <span className="text-[10px] text-amber-300 self-center">Cache the list first ↑</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Source discovery */}
      <div className="rounded-lg border border-white/10 p-3">
        <div className="flex items-center gap-2 mb-2">
          <Search size={12} className="text-blue-300" />
          <div className="text-[12px] font-semibold">Source discovery</div>
          <button
            onClick={onDiscover}
            disabled={!cached || busy !== null}
            className="ml-auto px-2 py-1 rounded bg-white/5 hover:bg-white/10 border border-white/10 text-[10px] flex items-center gap-1.5 transition disabled:opacity-40"
          >
            {busy === 'discover' ? <Loader2 size={10} className="animate-spin" /> : <Check size={10} />}
            Scan
          </button>
        </div>
        <div className="text-[10px] text-[var(--muted)] mb-2">
          Domains in the blocklist that don't yet have a Browse adapter — candidates for new tube/cam integrations.
        </div>
        {candidates && candidates.length > 0 && (
          <>
            <div className="flex gap-1 mb-2 text-[10px]">
              {(['tube', 'cam', 'cdn', 'gallery', 'other', 'all'] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`px-2 py-0.5 rounded capitalize transition border ${
                    filter === f
                      ? 'bg-blue-500/20 border-blue-500/40 text-blue-200'
                      : 'bg-black/20 border-white/10 text-white/50 hover:bg-white/5'
                  }`}
                >
                  {f} ({f === 'all' ? candidates.length : candidates.filter((c) => c.category === f).length})
                </button>
              ))}
            </div>
            <div className="max-h-48 overflow-y-auto bg-black/30 rounded border border-white/5 p-2 font-mono text-[10px] space-y-0.5">
              {visibleCandidates.slice(0, 100).map((c) => (
                <div key={c.domain} className="flex items-center gap-2">
                  <span className="text-white/70">{c.domain}</span>
                  <span className="ml-auto text-white/30">{c.category}</span>
                </div>
              ))}
              {visibleCandidates.length > 100 && (
                <div className="text-white/30 text-center pt-1">…+{visibleCandidates.length - 100} more</div>
              )}
            </div>
          </>
        )}
        {candidates && candidates.length === 0 && (
          <div className="text-[10px] text-emerald-300">No unmatched domains — adapters cover everything in this list.</div>
        )}
      </div>

      {error && <div className="mt-2 text-[10px] text-red-300">{error}</div>}
      {info && <div className="mt-2 text-[10px] text-emerald-300">{info}</div>}
    </div>
  )
}
