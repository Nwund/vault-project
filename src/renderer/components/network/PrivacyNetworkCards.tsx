'use memo'
// File: src/renderer/components/network/PrivacyNetworkCards.tsx
//
// Four v2.7 privacy / anonymizing network cards under Settings → Services:
//   - VeilidCard       (#268) — JSON-RPC bridge to an external veilid-server
//   - TorOnionCard     (#283) — Wrap a Tor binary, expose an onion URL
//   - WebTransportCard (#276) — HTTP/3 server with self-signed fingerprint
//   - NostrSignerCard  (#282) — NIP-46 remote-signer bunker URI
//
// All four share the NetworkServiceCard shell. Status polling is local
// to each card (different IPCs, different state shapes).

import { useState, useEffect, useCallback } from 'react'
import {
  ShieldCheck,
  Network,
  Globe,
  KeyRound,
  Loader2,
  Copy,
  Check,
  RefreshCw,
  Folder,
} from 'lucide-react'
import { motion, AnimatePresence } from 'motion/react'
import { useToast } from '../../contexts'
import {
  NetworkServiceCard,
  NetworkActionRow,
  NetworkPrimaryBtn,
  NetworkGhostBtn,
} from './NetworkServiceCard'
import { FADE_SLIDE, type ServiceState } from './motion-tokens'

// ═══════════════════════════════════════════════════════════════════════════
// Veilid private routing
// ═══════════════════════════════════════════════════════════════════════════

export function VeilidCard() {
  const { showToast } = useToast()
  const [endpoint, setEndpoint] = useState('http://127.0.0.1:5959')
  const [status, setStatus] = useState<{ reachable: boolean; publicInternetReady: boolean; nodeId?: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      const s = await window.api.veilid.status()
      setStatus(s)
      if (s.error) setError(s.error)
      else setError(null)
    } catch (e: any) {
      setError(e?.message ?? String(e))
    }
  }, [])

  useEffect(() => { refresh() }, [refresh])

  const state: ServiceState = error
    ? 'error'
    : busy
      ? 'starting'
      : status?.publicInternetReady
        ? 'running'
        : status?.reachable
          ? 'starting'
          : 'idle'

  const onSave = useCallback(async () => {
    setBusy(true)
    try {
      await window.api.veilid.setEndpoint(endpoint)
      await refresh()
      showToast?.('success', 'Veilid endpoint saved')
    } finally {
      setBusy(false)
    }
  }, [endpoint, refresh, showToast])

  const onNewRoute = useCallback(async () => {
    setBusy(true)
    try {
      const res = await window.api.veilid.newPrivateRoute()
      if (res.ok && res.routeId) {
        showToast?.('success', `Route created · ${res.routeId.slice(0, 10)}…`)
      } else {
        setError(res.error ?? 'Failed to create route')
      }
    } finally {
      setBusy(false)
    }
  }, [showToast])

  return (
    <NetworkServiceCard
      Icon={ShieldCheck}
      title="Veilid private routing"
      description="Bridge to an external veilid-server for anonymized private routes. Useful when paired with the Iroh share card for sender anonymity."
      state={state}
      statusLabel={status?.publicInternetReady ? 'Public ready' : status?.reachable ? 'Reachable' : undefined}
      accent="from-teal-500 to-emerald-600"
      error={error}
    >
      <label className="space-y-1 block">
        <span className="text-[10px] uppercase tracking-wider text-[var(--muted)]">Veilid server endpoint</span>
        <input
          value={endpoint}
          onChange={(e) => setEndpoint(e.target.value)}
          placeholder="http://127.0.0.1:5959"
          className="w-full px-2 py-1.5 rounded-lg bg-black/30 border border-white/10 text-xs font-mono outline-none focus:border-[var(--primary)]/50"
        />
      </label>
      <NetworkActionRow>
        <NetworkPrimaryBtn onClick={onSave} disabled={busy} accent="bg-teal-600/30 hover:bg-teal-600/40 text-teal-100">
          {busy ? <Loader2 size={14} className="animate-spin" /> : null} Save endpoint
        </NetworkPrimaryBtn>
        <NetworkGhostBtn onClick={refresh}><RefreshCw size={14} /> Refresh</NetworkGhostBtn>
        <NetworkGhostBtn onClick={onNewRoute} disabled={!status?.reachable}>New route</NetworkGhostBtn>
      </NetworkActionRow>
      {status?.nodeId && (
        <div className="text-[10px] font-mono text-[var(--muted)] truncate">
          Node · {status.nodeId}
        </div>
      )}
    </NetworkServiceCard>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// Tor onion service
// ═══════════════════════════════════════════════════════════════════════════

export function TorOnionCard() {
  const { showToast } = useToast()
  const [torBin, setTorBin] = useState('')
  const [httpPort, setHttpPort] = useState(8765)
  const [status, setStatus] = useState<{ running: boolean; onion: string | null; lastError: string | null } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const refresh = useCallback(async () => {
    const s = await window.api.tor.status()
    setStatus(s)
    if (s.lastError) setError(s.lastError)
  }, [])

  useEffect(() => { refresh() }, [refresh])

  const state: ServiceState = error ? 'error' : busy ? 'starting' : status?.running ? 'running' : 'idle'

  const onPickBin = useCallback(async () => {
    const filePath = await window.api.dialogOpenFile({
      title: 'Locate tor.exe',
      filters: [{ name: 'Tor binary', extensions: ['exe', ''] }],
    })
    if (filePath) setTorBin(filePath)
  }, [])

  const onStart = useCallback(async () => {
    if (!torBin) return setError('Pick a tor binary first')
    setError(null)
    setBusy(true)
    try {
      const res = await window.api.tor.start(torBin, httpPort)
      if (!res.ok) throw new Error(res.error ?? 'Tor failed to start')
      await refresh()
      showToast?.('success', 'Tor onion service started')
    } catch (e: any) {
      setError(e?.message ?? String(e))
    } finally {
      setBusy(false)
    }
  }, [torBin, httpPort, refresh, showToast])

  const onStop = useCallback(async () => {
    setBusy(true)
    try {
      await window.api.tor.stop()
      await refresh()
    } finally {
      setBusy(false)
    }
  }, [refresh])

  const onCopy = useCallback(() => {
    if (!status?.onion) return
    navigator.clipboard.writeText(status.onion).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1400)
    })
  }, [status?.onion])

  return (
    <NetworkServiceCard
      Icon={Network}
      title="Tor onion service"
      description="Wraps an external Tor binary and exposes the Vault mobile-sync HTTP server as a .onion address — accessible from any Tor-enabled client."
      state={state}
      statusLabel={status?.running ? 'Onion live' : undefined}
      accent="from-purple-500 to-fuchsia-600"
      error={error}
    >
      <div className="grid grid-cols-[1fr_auto_auto] gap-2 items-end">
        <label className="space-y-1 col-span-1">
          <span className="text-[10px] uppercase tracking-wider text-[var(--muted)]">tor binary path</span>
          <input
            value={torBin}
            onChange={(e) => setTorBin(e.target.value)}
            placeholder="C:\Tor\tor.exe"
            className="w-full px-2 py-1.5 rounded-lg bg-black/30 border border-white/10 text-xs font-mono outline-none focus:border-[var(--primary)]/50"
          />
        </label>
        <button
          onClick={onPickBin}
          className="px-2 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-xs flex items-center gap-1.5 self-end h-[30px]"
        >
          <Folder size={12} /> Pick
        </button>
        <label className="space-y-1 w-24">
          <span className="text-[10px] uppercase tracking-wider text-[var(--muted)]">HTTP port</span>
          <input
            type="number"
            value={httpPort}
            onChange={(e) => setHttpPort(Number(e.target.value) || 0)}
            className="w-full px-2 py-1.5 rounded-lg bg-black/30 border border-white/10 text-xs font-mono outline-none focus:border-[var(--primary)]/50"
          />
        </label>
      </div>

      <NetworkActionRow>
        {!status?.running ? (
          <NetworkPrimaryBtn onClick={onStart} disabled={busy || !torBin} accent="bg-purple-600/30 hover:bg-purple-600/40 text-purple-100">
            {busy ? <Loader2 size={14} className="animate-spin" /> : null} Start tor
          </NetworkPrimaryBtn>
        ) : (
          <NetworkPrimaryBtn onClick={onStop} disabled={busy} accent="bg-red-600/30 hover:bg-red-600/40 text-red-100">
            {busy ? <Loader2 size={14} className="animate-spin" /> : null} Stop tor
          </NetworkPrimaryBtn>
        )}
        <NetworkGhostBtn onClick={refresh}><RefreshCw size={14} /></NetworkGhostBtn>
      </NetworkActionRow>

      <AnimatePresence>
        {status?.onion && (
          <motion.div {...FADE_SLIDE} className="rounded-2xl bg-black/40 border border-purple-500/20 p-3 space-y-1">
            <div className="text-[10px] uppercase tracking-wider text-purple-300">.onion address</div>
            <code className="block text-[11px] font-mono text-zinc-200 break-all">{status.onion}</code>
            <button onClick={onCopy} className="text-[11px] flex items-center gap-1.5 px-2 py-1 rounded bg-white/5 hover:bg-white/10 transition">
              {copied ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} />}
              {copied ? 'Copied' : 'Copy URL'}
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </NetworkServiceCard>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// WebTransport HTTP/3 server
// ═══════════════════════════════════════════════════════════════════════════

export function WebTransportCard() {
  const { showToast } = useToast()
  const [port, setPort] = useState(4433)
  const [bearer, setBearer] = useState('')
  const [status, setStatus] = useState<{ running: boolean; port: number; fingerprintHex: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const refresh = useCallback(async () => {
    const s = await window.api.wt.status()
    setStatus(s)
  }, [])

  useEffect(() => { refresh() }, [refresh])

  const state: ServiceState = error ? 'error' : busy ? 'starting' : status?.running ? 'running' : 'idle'

  const onStart = useCallback(async () => {
    setError(null)
    setBusy(true)
    try {
      const token = bearer || Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2)
      const res = await window.api.wt.start(port, token)
      if (!res.ok) throw new Error(res.error ?? 'WebTransport failed to start')
      setBearer(token)
      await refresh()
      showToast?.('success', `HTTP/3 server live on :${res.port ?? port}`)
    } catch (e: any) {
      setError(e?.message ?? String(e))
    } finally {
      setBusy(false)
    }
  }, [port, bearer, refresh, showToast])

  const onStop = useCallback(async () => {
    setBusy(true)
    try {
      await window.api.wt.stop()
      await refresh()
    } finally {
      setBusy(false)
    }
  }, [refresh])

  const onCopyFp = useCallback(() => {
    if (!status?.fingerprintHex) return
    navigator.clipboard.writeText(status.fingerprintHex).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1400)
    })
  }, [status?.fingerprintHex])

  return (
    <NetworkServiceCard
      Icon={Globe}
      title="WebTransport HTTP/3"
      description="Self-signed HTTP/3 server for low-latency QUIC streaming to companion apps. Clients pin to the certificate fingerprint shown below."
      state={state}
      statusLabel={status?.running ? `:${status.port}` : undefined}
      accent="from-sky-500 to-cyan-600"
      error={error}
    >
      <div className="grid grid-cols-[120px_1fr] gap-2 items-end">
        <label className="space-y-1">
          <span className="text-[10px] uppercase tracking-wider text-[var(--muted)]">Port</span>
          <input
            type="number"
            value={port}
            onChange={(e) => setPort(Number(e.target.value) || 0)}
            className="w-full px-2 py-1.5 rounded-lg bg-black/30 border border-white/10 text-xs font-mono outline-none focus:border-[var(--primary)]/50"
          />
        </label>
        <label className="space-y-1">
          <span className="text-[10px] uppercase tracking-wider text-[var(--muted)]">Bearer token (optional — auto-generated)</span>
          <input
            value={bearer}
            onChange={(e) => setBearer(e.target.value)}
            placeholder="auto"
            className="w-full px-2 py-1.5 rounded-lg bg-black/30 border border-white/10 text-xs font-mono outline-none focus:border-[var(--primary)]/50"
          />
        </label>
      </div>

      <NetworkActionRow>
        {!status?.running ? (
          <NetworkPrimaryBtn onClick={onStart} disabled={busy} accent="bg-sky-600/30 hover:bg-sky-600/40 text-sky-100">
            {busy ? <Loader2 size={14} className="animate-spin" /> : null} Start
          </NetworkPrimaryBtn>
        ) : (
          <NetworkPrimaryBtn onClick={onStop} disabled={busy} accent="bg-red-600/30 hover:bg-red-600/40 text-red-100">
            {busy ? <Loader2 size={14} className="animate-spin" /> : null} Stop
          </NetworkPrimaryBtn>
        )}
        <NetworkGhostBtn onClick={refresh}><RefreshCw size={14} /></NetworkGhostBtn>
      </NetworkActionRow>

      <AnimatePresence>
        {status?.running && status.fingerprintHex && (
          <motion.div {...FADE_SLIDE} className="rounded-2xl bg-black/40 border border-sky-500/20 p-3 space-y-1">
            <div className="text-[10px] uppercase tracking-wider text-sky-300">Certificate fingerprint</div>
            <code className="block text-[10px] font-mono text-zinc-200 break-all">{status.fingerprintHex}</code>
            <button onClick={onCopyFp} className="text-[11px] flex items-center gap-1.5 px-2 py-1 rounded bg-white/5 hover:bg-white/10 transition">
              {copied ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} />}
              {copied ? 'Copied' : 'Copy fingerprint'}
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </NetworkServiceCard>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// Nostr NIP-46 remote signer
// ═══════════════════════════════════════════════════════════════════════════

export function NostrSignerCard() {
  const { showToast } = useToast()
  const [config, setConfig] = useState<{ pubkeyHex: string; defaultRelay: string; trustedClients: string[] } | null>(null)
  const [bunker, setBunker] = useState<{ uri: string; secret: string } | null>(null)
  const [defaultRelay, setDefaultRelay] = useState('wss://relay.damus.io')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [trustInput, setTrustInput] = useState('')

  useEffect(() => {
    window.api.nostr.loadConfig().then((c: { pubkeyHex: string; defaultRelay: string; trustedClients: string[] } | null) => {
      setConfig(c)
      if (c?.defaultRelay) setDefaultRelay(c.defaultRelay)
    }).catch(() => {})
  }, [])

  const state: ServiceState = error ? 'error' : busy ? 'starting' : config?.pubkeyHex ? 'running' : 'idle'

  const onGenerate = useCallback(async () => {
    setError(null)
    setBusy(true)
    try {
      const c = await window.api.nostr.generateKeypair(defaultRelay)
      setConfig({ pubkeyHex: c.pubkeyHex, defaultRelay: c.defaultRelay, trustedClients: [] })
      const b = await window.api.nostr.bunkerUri()
      setBunker(b)
      showToast?.('success', 'Keypair generated, bunker URI created')
    } catch (e: any) {
      setError(e?.message ?? String(e))
    } finally {
      setBusy(false)
    }
  }, [defaultRelay, showToast])

  const onShowBunker = useCallback(async () => {
    try {
      const b = await window.api.nostr.bunkerUri()
      setBunker(b)
    } catch (e: any) {
      setError(e?.message ?? String(e))
    }
  }, [])

  const onTrust = useCallback(async () => {
    if (!trustInput.trim()) return
    await window.api.nostr.trust(trustInput.trim())
    const c = await window.api.nostr.loadConfig()
    setConfig(c)
    setTrustInput('')
    showToast?.('success', 'Client trusted')
  }, [trustInput, showToast])

  const onRevoke = useCallback(async (pk: string) => {
    await window.api.nostr.revoke(pk)
    const c = await window.api.nostr.loadConfig()
    setConfig(c)
  }, [])

  const onCopyBunker = useCallback(() => {
    if (!bunker?.uri) return
    navigator.clipboard.writeText(bunker.uri).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1400)
    })
  }, [bunker?.uri])

  return (
    <NetworkServiceCard
      Icon={KeyRound}
      title="Nostr remote signer (NIP-46)"
      description="Vault holds your Nostr private key. Other clients connect via the bunker URI for sign-event permission grants — your key never leaves this machine."
      state={state}
      statusLabel={config?.pubkeyHex ? `${config.trustedClients.length} trusted` : undefined}
      accent="from-amber-500 to-orange-600"
      error={error}
    >
      <label className="space-y-1 block">
        <span className="text-[10px] uppercase tracking-wider text-[var(--muted)]">Default relay</span>
        <input
          value={defaultRelay}
          onChange={(e) => setDefaultRelay(e.target.value)}
          placeholder="wss://relay.damus.io"
          className="w-full px-2 py-1.5 rounded-lg bg-black/30 border border-white/10 text-xs font-mono outline-none focus:border-[var(--primary)]/50"
        />
      </label>

      <NetworkActionRow>
        <NetworkPrimaryBtn
          onClick={onGenerate}
          disabled={busy}
          accent="bg-amber-600/30 hover:bg-amber-600/40 text-amber-100"
        >
          {busy ? <Loader2 size={14} className="animate-spin" /> : <KeyRound size={14} />}
          {config?.pubkeyHex ? 'Regenerate keypair' : 'Generate keypair'}
        </NetworkPrimaryBtn>
        {config?.pubkeyHex && (
          <NetworkGhostBtn onClick={onShowBunker}>Show bunker URI</NetworkGhostBtn>
        )}
      </NetworkActionRow>

      {config?.pubkeyHex && (
        <div className="text-[10px] font-mono text-[var(--muted)] truncate">
          npub · {config.pubkeyHex}
        </div>
      )}

      <AnimatePresence>
        {bunker && (
          <motion.div {...FADE_SLIDE} className="rounded-2xl bg-black/40 border border-amber-500/20 p-3 space-y-1">
            <div className="text-[10px] uppercase tracking-wider text-amber-300">Bunker URI</div>
            <code className="block text-[10px] font-mono text-zinc-200 break-all leading-tight">{bunker.uri}</code>
            <button onClick={onCopyBunker} className="text-[11px] flex items-center gap-1.5 px-2 py-1 rounded bg-white/5 hover:bg-white/10 transition">
              {copied ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} />}
              {copied ? 'Copied' : 'Copy bunker URI'}
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {config?.pubkeyHex && (
        <div className="space-y-2">
          <div className="text-[10px] uppercase tracking-wider text-[var(--muted)]">Trusted clients</div>
          <div className="flex gap-2">
            <input
              value={trustInput}
              onChange={(e) => setTrustInput(e.target.value)}
              placeholder="Client pubkey (hex)"
              className="flex-1 px-2 py-1.5 rounded-lg bg-black/30 border border-white/10 text-xs font-mono outline-none focus:border-[var(--primary)]/50"
            />
            <NetworkGhostBtn onClick={onTrust} disabled={!trustInput.trim()}>Trust</NetworkGhostBtn>
          </div>
          {config.trustedClients.length > 0 && (
            <div className="space-y-1 max-h-32 overflow-y-auto">
              {config.trustedClients.map((pk) => (
                <div key={pk} className="flex items-center justify-between gap-2 p-2 rounded-lg bg-white/[0.03]">
                  <code className="text-[10px] font-mono text-zinc-300 truncate">{pk}</code>
                  <button onClick={() => onRevoke(pk)} className="text-[var(--muted)] hover:text-red-300 transition text-[10px]">
                    Revoke
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </NetworkServiceCard>
  )
}
