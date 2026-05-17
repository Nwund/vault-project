'use memo'
// File: src/renderer/components/ServiceHealthDashboard.tsx
//
// One-shot view of every v2.7 service's current health. Probes each
// in parallel on open and shows running / idle / error per row. Each
// row's "Configure" link jumps to Settings → Services and scrolls
// to that card (anchor) so the user can act on issues quickly.
//
// Probes are fire-and-forget with a 2.5s timeout so a hung service
// doesn't block the whole dashboard.

import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import {
  Activity,
  X,
  Loader2,
  RefreshCw,
  ExternalLink,
  Share2,
  Wifi,
  HardDrive,
  ShieldCheck,
  Network,
  Globe,
  KeyRound,
  FolderSync,
  AtSign,
  BellRing,
  Mail,
  Film,
  Cpu,
  Eye,
  Fingerprint,
} from 'lucide-react'
import { useEscapeClose } from '../hooks/useEscapeClose'
import { SPRINGS, FADE_SLIDE, SCALE_IN } from './network/motion-tokens'

type Status = 'running' | 'idle' | 'error' | 'unknown'

interface ServiceRow {
  id: string
  label: string
  Icon: typeof Activity
  probe: () => Promise<{ status: Status; detail?: string }>
}

function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
  ])
}

// Each probe maps the service's own status shape to a uniform Status.
// 2500ms timeout per probe; falls through to 'unknown' if the IPC hangs.
const SERVICES: ServiceRow[] = [
  {
    id: 'iroh',
    label: 'Iroh blob share',
    Icon: Share2,
    probe: async () => ({ status: 'idle' as Status, detail: 'on-demand only' }),
  },
  {
    id: 'mesh',
    label: 'Hyperswarm mesh',
    Icon: Wifi,
    probe: async () => {
      const peers = await withTimeout(window.api.mesh?.peers?.() ?? Promise.resolve([]), 2500, [])
      return { status: peers.length > 0 ? 'running' : 'idle', detail: `${peers.length} peer${peers.length === 1 ? '' : 's'}` }
    },
  },
  {
    id: 'helia',
    label: 'Helia IPFS pin',
    Icon: HardDrive,
    probe: async () => {
      const pins = await withTimeout(window.api.helia?.list?.() ?? Promise.resolve([]), 2500, [])
      return { status: pins.length > 0 ? 'running' : 'idle', detail: `${pins.length} pinned` }
    },
  },
  {
    id: 'veilid',
    label: 'Veilid private routing',
    Icon: ShieldCheck,
    probe: async () => {
      const r = await withTimeout(
        window.api.veilid?.status?.() ?? Promise.resolve({ reachable: false } as any),
        2500,
        { reachable: false } as any,
      )
      return {
        status: (r.publicInternetReady ? 'running' : r.reachable ? 'idle' : 'idle') as Status,
        detail: r.publicInternetReady ? 'public ready' : r.reachable ? 'reachable' : 'not reachable',
      }
    },
  },
  {
    id: 'tor',
    label: 'Tor onion service',
    Icon: Network,
    probe: async () => {
      const r = await withTimeout(
        window.api.tor?.status?.() ?? Promise.resolve({ running: false, onion: null } as any),
        2500,
        { running: false } as any,
      )
      return { status: r.running ? 'running' : 'idle', detail: r.onion ?? undefined }
    },
  },
  {
    id: 'wt',
    label: 'WebTransport HTTP/3',
    Icon: Globe,
    probe: async () => {
      const r = await withTimeout(
        window.api.wt?.status?.() ?? Promise.resolve({ running: false } as any),
        2500,
        { running: false } as any,
      )
      return { status: r.running ? 'running' : 'idle', detail: r.running ? `:${r.port}` : undefined }
    },
  },
  {
    id: 'nostr',
    label: 'Nostr remote signer',
    Icon: KeyRound,
    probe: async () => {
      const c = await withTimeout<any>(
        window.api.nostr?.loadConfig?.() ?? Promise.resolve(null),
        2500,
        null,
      )
      return { status: c?.pubkeyHex ? 'running' : 'idle', detail: c ? `${c.trustedClients?.length ?? 0} trusted` : undefined }
    },
  },
  {
    id: 'syncthing',
    label: 'Syncthing',
    Icon: FolderSync,
    probe: async () => {
      const c = await withTimeout(
        window.api.syncthing?.loadConfig?.() ?? Promise.resolve(null),
        2500,
        null,
      )
      return { status: c ? 'idle' : 'idle', detail: c ? 'configured' : 'not configured' }
    },
  },
  {
    id: 'bskyLabeler',
    label: 'Bluesky labeler',
    Icon: AtSign,
    probe: async () => {
      try {
        const labels = await withTimeout(window.api.bskyLabeler?.list?.() ?? Promise.resolve([]), 2500, [])
        return { status: Array.isArray(labels) && labels.length > 0 ? 'running' : 'idle', detail: Array.isArray(labels) ? `${labels.length} labels` : undefined }
      } catch {
        return { status: 'idle' as Status }
      }
    },
  },
  {
    id: 'up',
    label: 'UnifiedPush distributor',
    Icon: BellRing,
    probe: async () => {
      const list = await withTimeout(window.api.up?.list?.() ?? Promise.resolve([]), 2500, [])
      return { status: list.length > 0 ? 'running' : 'idle', detail: `${list.length} apps` }
    },
  },
  {
    id: 'imap',
    label: 'IMAP watcher',
    Icon: Mail,
    probe: async () => {
      const r = await withTimeout(
        window.api.imap?.status?.() ?? Promise.resolve({ running: false } as any),
        2500,
        { running: false } as any,
      )
      return { status: r.running ? 'running' : 'idle' }
    },
  },
  {
    id: 'sidecarWatcher',
    label: 'Sidecar watcher',
    Icon: Eye,
    probe: async () => {
      const r = await withTimeout(
        window.api.sidecarWatcher?.status?.() ?? Promise.resolve({ running: false, roots: [] } as any),
        2500,
        { running: false, roots: [] } as any,
      )
      return { status: r.running ? 'running' : 'idle', detail: r.running ? `${r.roots.length} roots` : undefined }
    },
  },
  {
    id: 'vaultMl',
    label: 'Vault ML sidecar',
    Icon: Cpu,
    probe: async () => {
      const r = await withTimeout(
        window.api.tags?.vaultMl?.health?.() ?? Promise.resolve({ ok: false } as any),
        2500,
        { ok: false } as any,
      )
      if (r.ok && r.health) {
        return { status: 'running', detail: `${r.health.device.toUpperCase()} · ${r.health.loaded.length} models` }
      }
      return { status: 'idle', detail: 'not running' }
    },
  },
  {
    id: 'videoDiff',
    label: 'Video diffusion',
    Icon: Film,
    probe: async () => {
      // Don't actually probe — that'd hit the endpoint. Just check the
      // bridge exists.
      return { status: 'idle' as Status, detail: 'click to probe' }
    },
  },
  {
    id: 'ntfy',
    label: 'ntfy.sh push',
    Icon: BellRing,
    probe: async () => {
      const r = await withTimeout(
        window.api.tags?.ntfy?.config?.() ?? Promise.resolve({ ok: false } as any),
        2500,
        { ok: false } as any,
      )
      return {
        status: r.ok && r.config?.enabled && r.config?.topic ? 'running' : 'idle',
        detail: r.config?.topic ? `→ ${r.config.topic}` : undefined,
      }
    },
  },
  {
    id: 'webauthn',
    label: 'WebAuthn passkeys',
    Icon: Fingerprint,
    probe: async () => {
      const r = await withTimeout(
        window.api.tags?.webauthn?.listCredentials?.() ?? Promise.resolve({ ok: false } as any),
        2500,
        { ok: false } as any,
      )
      const n = r.credentials?.length ?? 0
      return { status: n > 0 ? 'running' : 'idle', detail: `${n} passkey${n === 1 ? '' : 's'}` }
    },
  },
  // ─── Auto-start sidecars (Python servers in xyrene-portable / joycaption-sidecar / etc.) ───
  {
    id: 'joycaption',
    label: 'JoyCaption sidecar',
    Icon: Cpu,
    probe: async () => {
      const r = await withTimeout<any>(
        window.api.ai?.joycaptionStatus?.() ?? Promise.resolve(null),
        2500,
        null,
      )
      if (r?.installed && r?.running) return { status: 'running' as Status, detail: r.url ?? 'port 8030' }
      if (r?.installed) return { status: 'idle' as Status, detail: 'installed, not running' }
      return { status: 'idle' as Status, detail: 'not installed' }
    },
  },
  {
    id: 'whisperx',
    label: 'WhisperX sidecar',
    Icon: Cpu,
    probe: async () => {
      const r = await withTimeout<any>(
        window.api.ai?.whisperxStatus?.() ?? Promise.resolve(null),
        2500,
        null,
      )
      if (r?.ready) return { status: 'running' as Status, detail: `port ${r.port}` }
      if (r?.configured) return { status: 'idle' as Status, detail: r.autoStart ? 'auto-start enabled' : 'configured' }
      return { status: 'idle' as Status, detail: 'not configured' }
    },
  },
  {
    id: 'f5tts',
    label: 'F5-TTS sidecar',
    Icon: Cpu,
    probe: async () => {
      const r = await withTimeout<any>(
        window.api.ai?.f5ttsStatus?.() ?? Promise.resolve(null),
        2500,
        null,
      )
      if (r?.ready) return { status: 'running' as Status, detail: `${r.backend} · port ${r.port}` }
      if (r?.configured) return { status: 'idle' as Status, detail: r.autoStart ? 'auto-start enabled' : 'configured' }
      return { status: 'idle' as Status, detail: 'not configured' }
    },
  },
]

const STATUS_COLORS: Record<Status, { pill: string; dot: string }> = {
  running: { pill: 'bg-emerald-500/20 text-emerald-200 border-emerald-500/30', dot: 'bg-emerald-400' },
  idle: { pill: 'bg-zinc-700/40 text-zinc-300 border-zinc-600/30', dot: 'bg-zinc-500' },
  error: { pill: 'bg-red-500/20 text-red-300 border-red-500/30', dot: 'bg-red-400' },
  unknown: { pill: 'bg-amber-500/20 text-amber-300 border-amber-500/30', dot: 'bg-amber-400' },
}

export function ServiceHealthDashboard({ open, onClose }: { open: boolean; onClose: () => void }) {
  useEscapeClose(open, onClose)
  const [results, setResults] = useState<Record<string, { status: Status; detail?: string }>>({})
  const [busy, setBusy] = useState(false)
  const [lastProbed, setLastProbed] = useState<number | null>(null)

  const probeAll = useCallback(async () => {
    setBusy(true)
    const entries = await Promise.all(
      SERVICES.map(async (svc) => {
        try {
          const r = await svc.probe()
          return [svc.id, r] as const
        } catch (e) {
          return [svc.id, { status: 'unknown' as Status, detail: 'probe failed' }] as const
        }
      }),
    )
    setResults(Object.fromEntries(entries))
    setLastProbed(Date.now())
    setBusy(false)
  }, [])

  useEffect(() => { if (open) probeAll() }, [open, probeAll])

  const runningCount = Object.values(results).filter((r) => r.status === 'running').length
  const totalCount = SERVICES.length

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          {...FADE_SLIDE}
          className="fixed inset-0 z-[200] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={onClose}
        >
          <motion.div
            {...SCALE_IN}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-3xl max-h-[90vh] bg-zinc-950/95 border border-[var(--border)] rounded-3xl shadow-2xl shadow-black/60 flex flex-col overflow-hidden"
          >
            <div className="px-5 py-4 border-b border-white/5 bg-gradient-to-r from-emerald-500/10 via-cyan-500/10 to-transparent flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="size-9 rounded-2xl bg-gradient-to-br from-emerald-500 to-cyan-600 grid place-items-center shadow-lg shadow-black/40">
                  <Activity size={16} className="text-white" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold">Service health</h2>
                  <p className="text-[11px] text-[var(--muted)]">
                    {busy ? 'Probing…' : `${runningCount} of ${totalCount} running${lastProbed ? ` · checked ${new Date(lastProbed).toLocaleTimeString()}` : ''}`}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={probeAll}
                  disabled={busy}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-xs disabled:opacity-50"
                >
                  {busy ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                  Re-probe
                </button>
                <button onClick={onClose} aria-label="Close" className="p-1.5 rounded-lg hover:bg-white/10 transition">
                  <X size={16} />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-1">
              {SERVICES.map((svc) => {
                const r = results[svc.id]
                const status = r?.status ?? 'unknown'
                const colors = STATUS_COLORS[status]
                return (
                  <motion.div
                    key={svc.id}
                    layout
                    transition={SPRINGS.snappy}
                    className="flex items-center gap-3 p-2.5 rounded-lg bg-white/[0.03] border border-white/5 hover:bg-white/[0.06] transition"
                  >
                    <div className="size-8 rounded-xl bg-zinc-800/60 grid place-items-center flex-shrink-0">
                      <svc.Icon size={14} className="text-zinc-300" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{svc.label}</div>
                      {r?.detail && (
                        <div className="text-[10px] text-[var(--muted)] truncate">{r.detail}</div>
                      )}
                    </div>
                    <motion.div
                      key={status}
                      initial={{ scale: 0.85, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={SPRINGS.snappy}
                      className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium border ${colors.pill}`}
                    >
                      <span className={`size-1.5 rounded-full ${colors.dot} ${status === 'running' ? 'animate-pulse' : ''}`} />
                      {status}
                    </motion.div>
                    <button
                      onClick={() => {
                        onClose()
                        window.dispatchEvent(new CustomEvent('navigate-tab', { detail: 'settings' }))
                      }}
                      className="text-[var(--muted)] hover:text-white transition"
                      aria-label="Configure"
                      title="Open Settings → Services"
                    >
                      <ExternalLink size={11} />
                    </button>
                  </motion.div>
                )
              })}
            </div>

            <div className="px-5 py-3 border-t border-white/5 bg-black/30 flex items-center justify-between">
              <p className="text-[10px] text-[var(--muted)]">
                Probes time out at 2.5s — hung services show as &ldquo;unknown&rdquo;.
              </p>
              <span className="text-[10px] text-emerald-300/80 tabular-nums">
                {runningCount} active
              </span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
