'use memo'
// File: src/renderer/components/network/PeerToPeerCards.tsx
//
// Three v2.7 peer-to-peer / decentralized-storage cards under Settings → Services:
//   - IrohShareCard      (#265) — share local file as a ticket + QR
//   - HyperswarmMeshCard (#266) — trusted-device mesh topic discovery
//   - HeliaIpfsCard      (#267) — pin to local Helia node, copy gateway URL
//
// All three use the shared NetworkServiceCard shell + motion tokens so the
// expand/collapse, status pill animation, and accent ring stay consistent
// with every other card in the Services tab.

import { useState, useEffect, useCallback } from 'react'
import {
  Share2,
  Wifi,
  HardDrive,
  Loader2,
  RefreshCw,
  Plus,
  Copy,
  Trash2,
  QrCode,
  Check,
} from 'lucide-react'
import { motion, AnimatePresence } from 'motion/react'
import { useToast } from '../../contexts'
import {
  NetworkServiceCard,
  NetworkActionRow,
  NetworkPrimaryBtn,
  NetworkGhostBtn,
} from './NetworkServiceCard'
import { FADE_SLIDE, SPRINGS, type ServiceState } from './motion-tokens'

// ═══════════════════════════════════════════════════════════════════════════
// Iroh blob share — pick a file, get a ticket + QR code
// ═══════════════════════════════════════════════════════════════════════════

export function IrohShareCard() {
  const { showToast } = useToast()
  const [ticket, setTicket] = useState<string | null>(null)
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const state: ServiceState = error ? 'error' : busy ? 'starting' : ticket ? 'running' : 'idle'

  const onShare = useCallback(async () => {
    setError(null)
    setBusy(true)
    try {
      const filePath = await window.api.dialogOpenFile({ title: 'Pick file to share via Iroh' })
      if (!filePath) return
      const res = await window.api.iroh.share(filePath)
      setTicket(res.ticket)
      setQrDataUrl(res.qrDataUrl)
      showToast?.('success', 'Ticket generated · share the QR or string')
    } catch (e: any) {
      setError(e?.message ?? String(e))
    } finally {
      setBusy(false)
    }
  }, [showToast])

  const onCopy = useCallback(() => {
    if (!ticket) return
    navigator.clipboard.writeText(ticket).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1400)
    })
  }, [ticket])

  return (
    <NetworkServiceCard
      Icon={Share2}
      title="Iroh blob share"
      description="Share a file as a content-addressed ticket. Receiver pastes the ticket to download — no server, end-to-end encrypted."
      state={state}
      statusLabel={ticket ? 'Ticket ready' : undefined}
      accent="from-fuchsia-500 to-purple-600"
      error={error}
    >
      <NetworkActionRow>
        <NetworkPrimaryBtn
          onClick={onShare}
          disabled={busy}
          accent="bg-fuchsia-600/30 hover:bg-fuchsia-600/40 text-fuchsia-100"
        >
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Share2 size={14} />}
          {busy ? 'Generating…' : 'Pick file & share'}
        </NetworkPrimaryBtn>
        {ticket && (
          <NetworkGhostBtn onClick={() => { setTicket(null); setQrDataUrl(null) }}>
            <Trash2 size={14} /> Reset
          </NetworkGhostBtn>
        )}
      </NetworkActionRow>

      <AnimatePresence>
        {ticket && (
          <motion.div
            {...FADE_SLIDE}
            className="rounded-2xl bg-black/40 border border-white/5 p-3 mt-1 flex gap-3 items-center"
          >
            {qrDataUrl && (
              <img
                src={qrDataUrl}
                alt="Iroh ticket QR"
                className="size-24 rounded-lg bg-white p-1"
              />
            )}
            <div className="flex-1 min-w-0 space-y-2">
              <div className="flex items-center gap-1.5 text-[10px] text-fuchsia-300 uppercase tracking-wider">
                <QrCode size={10} /> Ticket
              </div>
              <code className="block text-[10px] font-mono text-zinc-300 break-all line-clamp-3 leading-tight">
                {ticket}
              </code>
              <button
                onClick={onCopy}
                className="text-[11px] flex items-center gap-1.5 px-2 py-1 rounded bg-white/5 hover:bg-white/10 transition"
              >
                {copied ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} />}
                {copied ? 'Copied' : 'Copy ticket'}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </NetworkServiceCard>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// Hyperswarm trusted-device mesh — DHT topic discovery
// ═══════════════════════════════════════════════════════════════════════════

interface MeshState {
  topic: string
  deviceName: string
  trustedFingerprints: string[]
}

export function HyperswarmMeshCard() {
  const { showToast } = useToast()
  const [mesh, setMesh] = useState<MeshState | null>(null)
  const [peers, setPeers] = useState<Array<{ fingerprint: string; deviceName: string }>>([])
  const [running, setRunning] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    window.api.mesh.loadState().then((s: MeshState) => setMesh(s)).catch(() => {})
  }, [])

  useEffect(() => {
    if (!running) return
    const id = window.setInterval(() => {
      window.api.mesh.peers().then(setPeers).catch(() => {})
    }, 4000)
    return () => clearInterval(id)
  }, [running])

  const state: ServiceState = error ? 'error' : busy ? 'starting' : running ? 'running' : 'idle'

  const onStart = useCallback(async () => {
    if (!mesh) return
    setError(null)
    setBusy(true)
    try {
      const res = await window.api.mesh.start(mesh)
      if (!res.ok) throw new Error(res.error ?? 'Start failed')
      setRunning(true)
      const initial = await window.api.mesh.peers()
      setPeers(initial)
      showToast?.('success', `Mesh joined · topic ${mesh.topic.slice(0, 8)}…`)
    } catch (e: any) {
      setError(e?.message ?? String(e))
    } finally {
      setBusy(false)
    }
  }, [mesh, showToast])

  const onStop = useCallback(async () => {
    setBusy(true)
    try {
      await window.api.mesh.stop()
      setRunning(false)
      setPeers([])
    } finally {
      setBusy(false)
    }
  }, [])

  const onSaveTopic = useCallback(async () => {
    if (!mesh) return
    await window.api.mesh.saveState(mesh)
    showToast?.('success', 'Saved mesh config')
  }, [mesh, showToast])

  return (
    <NetworkServiceCard
      Icon={Wifi}
      title="Hyperswarm device mesh"
      description="DHT-based peer discovery on a shared topic. Trusted devices announcing the same topic find each other — no central server."
      state={state}
      statusLabel={running ? `${peers.length} peer${peers.length === 1 ? '' : 's'}` : undefined}
      accent="from-cyan-500 to-blue-600"
      error={error}
    >
      {mesh && (
        <div className="grid grid-cols-2 gap-2">
          <label className="space-y-1">
            <span className="text-[10px] uppercase tracking-wider text-[var(--muted)]">Topic</span>
            <input
              value={mesh.topic}
              onChange={(e) => setMesh({ ...mesh, topic: e.target.value })}
              placeholder="vault-mesh-default"
              className="w-full px-2 py-1.5 rounded-lg bg-black/30 border border-white/10 text-xs font-mono outline-none focus:border-[var(--primary)]/50"
            />
          </label>
          <label className="space-y-1">
            <span className="text-[10px] uppercase tracking-wider text-[var(--muted)]">Device name</span>
            <input
              value={mesh.deviceName}
              onChange={(e) => setMesh({ ...mesh, deviceName: e.target.value })}
              className="w-full px-2 py-1.5 rounded-lg bg-black/30 border border-white/10 text-xs outline-none focus:border-[var(--primary)]/50"
            />
          </label>
        </div>
      )}

      <NetworkActionRow>
        {!running ? (
          <NetworkPrimaryBtn
            onClick={onStart}
            disabled={busy || !mesh?.topic}
            accent="bg-cyan-600/30 hover:bg-cyan-600/40 text-cyan-100"
          >
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Wifi size={14} />}
            {busy ? 'Joining…' : 'Join mesh'}
          </NetworkPrimaryBtn>
        ) : (
          <NetworkPrimaryBtn
            onClick={onStop}
            disabled={busy}
            accent="bg-red-600/30 hover:bg-red-600/40 text-red-100"
          >
            {busy ? <Loader2 size={14} className="animate-spin" /> : null} Leave mesh
          </NetworkPrimaryBtn>
        )}
        <NetworkGhostBtn onClick={onSaveTopic} disabled={!mesh}>
          Save config
        </NetworkGhostBtn>
      </NetworkActionRow>

      <AnimatePresence>
        {running && peers.length > 0 && (
          <motion.div {...FADE_SLIDE} className="space-y-1">
            <div className="text-[10px] uppercase tracking-wider text-[var(--muted)]">
              Trusted peers
            </div>
            {peers.map((p) => (
              <motion.div
                key={p.fingerprint}
                layout
                transition={SPRINGS.snappy}
                className="flex items-center justify-between gap-2 p-2 rounded-lg bg-white/[0.03] border border-white/5"
              >
                <span className="text-sm">{p.deviceName || 'unknown'}</span>
                <code className="text-[10px] text-[var(--muted)] font-mono">
                  {p.fingerprint.slice(0, 12)}…
                </code>
              </motion.div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </NetworkServiceCard>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// Helia IPFS pinning — pin a file, get a CID + gateway URL
// ═══════════════════════════════════════════════════════════════════════════

export function HeliaIpfsCard() {
  const { showToast } = useToast()
  const [pinned, setPinned] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastResult, setLastResult] = useState<{ cid: string; gatewayUrl: string } | null>(null)

  const refresh = useCallback(() => {
    window.api.helia.list().then(setPinned).catch(() => {})
  }, [])

  useEffect(() => { refresh() }, [refresh])

  const state: ServiceState = error
    ? 'error'
    : busy
      ? 'starting'
      : pinned.length > 0
        ? 'running'
        : 'idle'

  const onPin = useCallback(async () => {
    setError(null)
    setBusy(true)
    try {
      const filePath = await window.api.dialogOpenFile({ title: 'Pick file to pin to IPFS' })
      if (!filePath) return
      const res = await window.api.helia.pin(filePath)
      if (!res.ok || !res.cid) throw new Error(res.error ?? 'Pin failed')
      setLastResult({ cid: res.cid, gatewayUrl: res.gatewayUrl ?? '' })
      refresh()
      showToast?.('success', `Pinned · ${res.cid.slice(0, 14)}…`)
    } catch (e: any) {
      setError(e?.message ?? String(e))
    } finally {
      setBusy(false)
    }
  }, [refresh, showToast])

  const onUnpin = useCallback(async (cid: string) => {
    await window.api.helia.unpin(cid)
    refresh()
  }, [refresh])

  return (
    <NetworkServiceCard
      Icon={HardDrive}
      title="Helia IPFS pin"
      description="Pin files to the local Helia node. Content is fetched by CID over IPFS gateways — survives across machines without a server."
      state={state}
      statusLabel={pinned.length > 0 ? `${pinned.length} pinned` : undefined}
      accent="from-violet-500 to-indigo-600"
      error={error}
    >
      <NetworkActionRow>
        <NetworkPrimaryBtn
          onClick={onPin}
          disabled={busy}
          accent="bg-violet-600/30 hover:bg-violet-600/40 text-violet-100"
        >
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
          {busy ? 'Pinning…' : 'Pick & pin file'}
        </NetworkPrimaryBtn>
        <NetworkGhostBtn onClick={refresh}>
          <RefreshCw size={14} /> Refresh
        </NetworkGhostBtn>
      </NetworkActionRow>

      <AnimatePresence>
        {lastResult && (
          <motion.div
            {...FADE_SLIDE}
            className="rounded-2xl bg-black/30 border border-white/5 p-3 space-y-1"
          >
            <div className="text-[10px] uppercase tracking-wider text-violet-300">Last pinned</div>
            <code className="block text-[10px] font-mono text-zinc-300 break-all">{lastResult.cid}</code>
            {lastResult.gatewayUrl && (
              <a
                href={lastResult.gatewayUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[11px] text-violet-300 hover:underline"
              >
                Open in gateway →
              </a>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {pinned.length > 0 && (
        <div className="space-y-1">
          <div className="text-[10px] uppercase tracking-wider text-[var(--muted)]">All pins</div>
          <div className="max-h-40 overflow-y-auto space-y-1 pr-1">
            {pinned.map((cid) => (
              <motion.div
                key={cid}
                layout
                transition={SPRINGS.snappy}
                className="flex items-center justify-between gap-2 p-2 rounded-lg bg-white/[0.03] border border-white/5"
              >
                <code className="text-[10px] font-mono text-zinc-300 truncate">{cid}</code>
                <button
                  onClick={() => onUnpin(cid)}
                  className="text-[var(--muted)] hover:text-red-300 transition"
                  aria-label="Unpin"
                >
                  <Trash2 size={12} />
                </button>
              </motion.div>
            ))}
          </div>
        </div>
      )}
    </NetworkServiceCard>
  )
}
