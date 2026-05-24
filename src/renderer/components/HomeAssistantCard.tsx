// File: src/renderer/components/HomeAssistantCard.tsx
//
// #185 — Settings card for Home Assistant MQTT integration.
//
// Vault publishes as an HA `media_player` entity via MQTT
// auto-discovery so users can build automations like:
//   - "if motion in office after 11pm → pause Vault"
//   - "Vault state == playing → dim bedroom Hue to 20%"
//
// Card fields:
//   - Broker URL (e.g. mqtt://192.168.1.10:1883)
//   - Username + password (optional, depends on broker config)
//   - Start / Stop buttons
//   - Live connection status pill
//
// Persists credentials to settings.network.haBrokerUrl / haUsername /
// haPassword so the user doesn't have to re-enter on every Vault
// launch. Password is stored plaintext in settings.json — broker auth
// is usually low-risk on a LAN; users with real concerns can pin to
// an unprotected port restricted by firewall.

import React, { useCallback, useEffect, useState } from 'react'
import { Home, Play, Square, CheckCircle2, AlertTriangle, RefreshCw } from 'lucide-react'
import { useVisibilityInterval } from '../hooks/useVisibilityInterval'

export function HomeAssistantCard(): React.JSX.Element {
  const [brokerUrl, setBrokerUrl] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [connected, setConnected] = useState<boolean | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refreshStatus = useCallback(async () => {
    const api: any = (window as any).api
    if (!api?.network?.haStatus) return
    try {
      const r = await api.network.haStatus()
      setConnected(!!r?.connected)
    } catch { setConnected(false) }
  }, [])

  useEffect(() => {
    void (async () => {
      const api: any = (window as any).api
      try {
        const s = await api.settings.get()
        const net = s?.network ?? {}
        if (net.haBrokerUrl) setBrokerUrl(net.haBrokerUrl)
        if (net.haUsername) setUsername(net.haUsername)
        if (net.haPassword) setPassword(net.haPassword)
      } catch { /* settings missing */ }
    })()
  }, [])
  // 10s MQTT-status polling, paused while tab hidden.
  useVisibilityInterval(refreshStatus, 10_000)

  const persist = useCallback(async () => {
    const api: any = (window as any).api
    try {
      const s = await api.settings.get()
      await api.settings.update({
        ...s,
        network: {
          ...(s.network ?? {}),
          haBrokerUrl: brokerUrl,
          haUsername: username,
          haPassword: password,
        },
      })
    } catch { /* noop */ }
  }, [brokerUrl, username, password])

  const start = useCallback(async () => {
    setError(null)
    if (!brokerUrl.trim()) { setError('Broker URL is required'); return }
    setBusy(true)
    try {
      await persist()
      const api: any = (window as any).api
      const r = await api.network.haStart({
        brokerUrl: brokerUrl.trim(),
        username: username.trim() || undefined,
        password: password || undefined,
      })
      if (!r?.ok) setError(r?.error ?? 'Connect failed')
      await refreshStatus()
    } catch (err: any) {
      setError(err?.message ?? 'Connect failed')
    } finally { setBusy(false) }
  }, [brokerUrl, username, password, persist, refreshStatus])

  const stop = useCallback(async () => {
    setError(null)
    setBusy(true)
    try {
      const api: any = (window as any).api
      await api.network.haStop()
      await refreshStatus()
    } catch (err: any) {
      setError(err?.message ?? 'Disconnect failed')
    } finally { setBusy(false) }
  }, [refreshStatus])

  return (
    <div className="rounded-3xl border border-[var(--border)] bg-black/20 p-5 mt-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Home size={16} className="text-[var(--primary)]" />
          <div className="text-sm font-semibold">Home Assistant (MQTT)</div>
        </div>
        {connected !== null && (
          <span
            className={
              'flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full ' +
              (connected
                ? 'bg-emerald-500/15 text-emerald-300'
                : 'bg-zinc-700/60 text-zinc-400')
            }
          >
            {connected ? <CheckCircle2 size={10} /> : <RefreshCw size={10} />}
            {connected ? 'Connected' : 'Disconnected'}
          </span>
        )}
      </div>

      <div className="space-y-3">
        <div>
          <label className="text-[11px] text-zinc-400 uppercase tracking-wide block mb-1">Broker URL</label>
          <input
            value={brokerUrl}
            onChange={(e) => setBrokerUrl(e.target.value)}
            placeholder="mqtt://192.168.1.10:1883"
            className="w-full bg-zinc-900 border border-[var(--border)] rounded px-2 py-1.5 text-sm font-mono outline-none"
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[11px] text-zinc-400 uppercase tracking-wide block mb-1">Username (optional)</label>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="vault"
              className="w-full bg-zinc-900 border border-[var(--border)] rounded px-2 py-1.5 text-sm outline-none"
            />
          </div>
          <div>
            <label className="text-[11px] text-zinc-400 uppercase tracking-wide block mb-1">Password (optional)</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••"
              className="w-full bg-zinc-900 border border-[var(--border)] rounded px-2 py-1.5 text-sm outline-none"
            />
          </div>
        </div>

        <div className="flex gap-2 pt-1">
          {!connected ? (
            <button
              onClick={start}
              disabled={busy || !brokerUrl.trim()}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md bg-[var(--primary)] text-white disabled:opacity-50"
            >
              <Play size={11} />
              {busy ? 'Connecting…' : 'Connect'}
            </button>
          ) : (
            <button
              onClick={stop}
              disabled={busy}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md bg-zinc-800 hover:bg-zinc-700 text-zinc-200 disabled:opacity-50"
            >
              <Square size={11} />
              Disconnect
            </button>
          )}
        </div>

        <div className="text-[10px] text-zinc-500 mt-1">
          Vault auto-publishes a <code className="px-1 bg-zinc-900 rounded">media_player.vault</code> entity to HA via MQTT discovery. State updates on play/pause/stop; commands ride back via the <code className="px-1 bg-zinc-900 rounded">vault/cmd</code> topic.
        </div>
      </div>

      {error && (
        <div className="mt-3 flex items-start gap-1.5 text-[11px] text-amber-400">
          <AlertTriangle size={12} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}
    </div>
  )
}
