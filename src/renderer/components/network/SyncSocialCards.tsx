'use memo'
// File: src/renderer/components/network/SyncSocialCards.tsx
//
// Four v2.7 sync / social / inbox cards under Settings → Services:
//   - SyncthingCard      (#269) — REST control plane for syncthing
//   - BlueskyLabelerCard (#273) — ATProto labeler HTTP server
//   - UnifiedPushCard    (#275) — UnifiedPush distributor (push notifications)
//   - ImapWatcherCard    (#313) — IMAP inbox auto-import watcher
//
// Same shell + tokens as the peer-to-peer and privacy card batches.

import { useState, useEffect, useCallback } from 'react'
import {
  RefreshCw,
  Loader2,
  AtSign,
  FolderSync,
  BellRing,
  Mail,
  Trash2,
  Send,
  TestTube,
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
// Syncthing REST bridge
// ═══════════════════════════════════════════════════════════════════════════

export function SyncthingCard() {
  const { showToast } = useToast()
  const [baseUrl, setBaseUrl] = useState('http://127.0.0.1:8384')
  const [apiKey, setApiKey] = useState('')
  const [hasKey, setHasKey] = useState(false)
  const [pingOk, setPingOk] = useState<boolean | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    window.api.syncthing.loadConfig().then((c: { baseUrl: string; hasKey: boolean } | null) => {
      if (c) {
        setBaseUrl(c.baseUrl)
        setHasKey(c.hasKey)
      }
    }).catch(() => {})
  }, [])

  const state: ServiceState = error
    ? 'error'
    : busy
      ? 'starting'
      : pingOk
        ? 'running'
        : hasKey
          ? 'idle'
          : 'idle'

  const onSave = useCallback(async () => {
    setError(null)
    setBusy(true)
    try {
      await window.api.syncthing.saveConfig(baseUrl, apiKey || undefined)
      if (apiKey) setHasKey(true)
      setApiKey('')
      showToast?.('success', 'Syncthing config saved')
    } catch (e: any) {
      setError(e?.message ?? String(e))
    } finally {
      setBusy(false)
    }
  }, [baseUrl, apiKey, showToast])

  const onPing = useCallback(async () => {
    setBusy(true)
    setError(null)
    try {
      const res = await window.api.syncthing.call('system/ping')
      setPingOk(res.ok)
      if (!res.ok) setError(res.error ?? `HTTP ${res.status}`)
      else showToast?.('success', 'Syncthing reachable')
    } catch (e: any) {
      setError(e?.message ?? String(e))
    } finally {
      setBusy(false)
    }
  }, [showToast])

  return (
    <NetworkServiceCard
      Icon={FolderSync}
      title="Syncthing control"
      description="Talk to a running Syncthing instance over its REST API. Vault can pause/resume folders, list devices, and inspect transfer state."
      state={state}
      statusLabel={pingOk ? 'Pong' : hasKey ? 'Configured' : undefined}
      accent="from-emerald-500 to-green-600"
      error={error}
    >
      <div className="grid grid-cols-[1fr_180px] gap-2">
        <label className="space-y-1">
          <span className="text-[10px] uppercase tracking-wider text-[var(--muted)]">REST base URL</span>
          <input
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder="http://127.0.0.1:8384"
            className="w-full px-2 py-1.5 rounded-lg bg-black/30 border border-white/10 text-xs font-mono outline-none focus:border-[var(--primary)]/50"
          />
        </label>
        <label className="space-y-1">
          <span className="text-[10px] uppercase tracking-wider text-[var(--muted)]">
            API key {hasKey && <span className="text-emerald-400">· saved</span>}
          </span>
          <input
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={hasKey ? '·····' : 'paste key'}
            type="password"
            className="w-full px-2 py-1.5 rounded-lg bg-black/30 border border-white/10 text-xs font-mono outline-none focus:border-[var(--primary)]/50"
          />
        </label>
      </div>
      <NetworkActionRow>
        <NetworkPrimaryBtn onClick={onSave} disabled={busy} accent="bg-emerald-600/30 hover:bg-emerald-600/40 text-emerald-100">
          {busy ? <Loader2 size={14} className="animate-spin" /> : null} Save
        </NetworkPrimaryBtn>
        <NetworkGhostBtn onClick={onPing} disabled={busy || !hasKey}>
          <TestTube size={14} /> Ping
        </NetworkGhostBtn>
      </NetworkActionRow>
    </NetworkServiceCard>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// Bluesky ATProto labeler
// ═══════════════════════════════════════════════════════════════════════════

export function BlueskyLabelerCard() {
  const { showToast } = useToast()
  const [port, setPort] = useState(2470)
  const [labelerPort, setLabelerPort] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [recent, setRecent] = useState<Array<{ uri: string; val: string; src: string; cts: number }>>([])

  const refreshList = useCallback(async () => {
    try {
      const items = await window.api.bskyLabeler.list()
      setRecent(items.slice(0, 20))
    } catch {
      /* labeler not running yet */
    }
  }, [])

  const state: ServiceState = error ? 'error' : busy ? 'starting' : labelerPort != null ? 'running' : 'idle'

  const onStart = useCallback(async () => {
    setError(null)
    setBusy(true)
    try {
      const res = await window.api.bskyLabeler.start(port)
      if (!res.ok) throw new Error(res.error ?? 'Labeler failed to start')
      setLabelerPort(res.port ?? port)
      await refreshList()
      showToast?.('success', `Labeler live on :${res.port ?? port}`)
    } catch (e: any) {
      setError(e?.message ?? String(e))
    } finally {
      setBusy(false)
    }
  }, [port, refreshList, showToast])

  const onStop = useCallback(async () => {
    setBusy(true)
    try {
      await window.api.bskyLabeler.stop()
      setLabelerPort(null)
      setRecent([])
    } finally {
      setBusy(false)
    }
  }, [])

  return (
    <NetworkServiceCard
      Icon={AtSign}
      title="Bluesky labeler"
      description="Self-hosted ATProto labeler. Issue content labels (custom NSFW tags, performer markers, etc.) on Bluesky posts — labels show on any client that subscribes."
      state={state}
      statusLabel={labelerPort ? `:${labelerPort}` : undefined}
      accent="from-blue-500 to-indigo-600"
      error={error}
    >
      <label className="space-y-1 block w-32">
        <span className="text-[10px] uppercase tracking-wider text-[var(--muted)]">Port</span>
        <input
          type="number"
          value={port}
          onChange={(e) => setPort(Number(e.target.value) || 0)}
          disabled={!!labelerPort}
          className="w-full px-2 py-1.5 rounded-lg bg-black/30 border border-white/10 text-xs font-mono outline-none focus:border-[var(--primary)]/50 disabled:opacity-50"
        />
      </label>

      <NetworkActionRow>
        {!labelerPort ? (
          <NetworkPrimaryBtn onClick={onStart} disabled={busy} accent="bg-blue-600/30 hover:bg-blue-600/40 text-blue-100">
            {busy ? <Loader2 size={14} className="animate-spin" /> : null} Start labeler
          </NetworkPrimaryBtn>
        ) : (
          <NetworkPrimaryBtn onClick={onStop} disabled={busy} accent="bg-red-600/30 hover:bg-red-600/40 text-red-100">
            {busy ? <Loader2 size={14} className="animate-spin" /> : null} Stop labeler
          </NetworkPrimaryBtn>
        )}
        <NetworkGhostBtn onClick={refreshList}><RefreshCw size={14} /></NetworkGhostBtn>
      </NetworkActionRow>

      <AnimatePresence>
        {recent.length > 0 && (
          <motion.div {...FADE_SLIDE} className="space-y-1">
            <div className="text-[10px] uppercase tracking-wider text-[var(--muted)]">Recent labels</div>
            <div className="max-h-40 overflow-y-auto space-y-1 pr-1">
              {recent.map((r, i) => (
                <motion.div
                  key={`${r.uri}-${i}`}
                  layout
                  transition={SPRINGS.snappy}
                  className="p-2 rounded-lg bg-white/[0.03] border border-white/5"
                >
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-blue-300 font-medium">{r.val}</span>
                    <span className="text-[10px] text-[var(--muted)]">
                      {new Date(r.cts).toLocaleTimeString()}
                    </span>
                  </div>
                  <code className="text-[10px] font-mono text-zinc-500 truncate block">{r.uri}</code>
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </NetworkServiceCard>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// UnifiedPush distributor
// ═══════════════════════════════════════════════════════════════════════════

export function UnifiedPushCard() {
  const { showToast } = useToast()
  const [registrations, setRegistrations] = useState<Array<{ appId: string; endpoint: string; deviceName?: string; registeredAt: number }>>([])
  const [broadcastText, setBroadcastText] = useState('Vault test push')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      const list = await window.api.up.list()
      setRegistrations(list)
    } catch (e: any) {
      setError(e?.message ?? String(e))
    }
  }, [])

  useEffect(() => { refresh() }, [refresh])

  const state: ServiceState = error ? 'error' : registrations.length > 0 ? 'running' : 'idle'

  const onUnregister = useCallback(async (appId: string) => {
    await window.api.up.unregister(appId)
    refresh()
  }, [refresh])

  const onBroadcast = useCallback(async () => {
    setBusy(true)
    try {
      const res = await window.api.up.broadcast(broadcastText)
      showToast?.('success', `Delivered ${res.delivered}, failed ${res.failed}`)
    } finally {
      setBusy(false)
    }
  }, [broadcastText, showToast])

  return (
    <NetworkServiceCard
      Icon={BellRing}
      title="UnifiedPush distributor"
      description="Open-source alternative to Google FCM. Companion apps register an endpoint; Vault pushes notifications without going through proprietary services."
      state={state}
      statusLabel={registrations.length > 0 ? `${registrations.length} apps` : undefined}
      accent="from-rose-500 to-pink-600"
      error={error}
    >
      <div className="space-y-2">
        <div className="text-[10px] uppercase tracking-wider text-[var(--muted)]">Broadcast test</div>
        <div className="flex gap-2">
          <input
            value={broadcastText}
            onChange={(e) => setBroadcastText(e.target.value)}
            placeholder="Message…"
            className="flex-1 px-2 py-1.5 rounded-lg bg-black/30 border border-white/10 text-xs outline-none focus:border-[var(--primary)]/50"
          />
          <NetworkPrimaryBtn
            onClick={onBroadcast}
            disabled={busy || registrations.length === 0}
            accent="bg-rose-600/30 hover:bg-rose-600/40 text-rose-100"
          >
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} Broadcast
          </NetworkPrimaryBtn>
        </div>
      </div>

      <NetworkActionRow>
        <NetworkGhostBtn onClick={refresh}><RefreshCw size={14} /> Refresh</NetworkGhostBtn>
      </NetworkActionRow>

      <AnimatePresence>
        {registrations.length > 0 && (
          <motion.div {...FADE_SLIDE} className="space-y-1">
            <div className="text-[10px] uppercase tracking-wider text-[var(--muted)]">Registered apps</div>
            <div className="space-y-1 max-h-40 overflow-y-auto pr-1">
              {registrations.map((r) => (
                <motion.div
                  key={r.appId}
                  layout
                  transition={SPRINGS.snappy}
                  className="flex items-center justify-between gap-2 p-2 rounded-lg bg-white/[0.03] border border-white/5"
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-sm truncate">{r.deviceName || r.appId}</div>
                    <code className="text-[10px] font-mono text-[var(--muted)] truncate block">{r.endpoint}</code>
                  </div>
                  <button
                    onClick={() => onUnregister(r.appId)}
                    className="text-[var(--muted)] hover:text-red-300 transition"
                    aria-label="Unregister"
                  >
                    <Trash2 size={12} />
                  </button>
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </NetworkServiceCard>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// IMAP inbox watcher
// ═══════════════════════════════════════════════════════════════════════════

interface ImapConfig {
  host: string
  port: number
  secure: boolean
  user: string
  pass?: string
  mailbox?: string
  matchSubject?: string
}

const DEFAULT_IMAP: ImapConfig = {
  host: 'imap.fastmail.com',
  port: 993,
  secure: true,
  user: '',
  pass: '',
  mailbox: 'INBOX',
  matchSubject: 'Vault import',
}

export function ImapWatcherCard() {
  const { showToast } = useToast()
  const [config, setConfig] = useState<ImapConfig>(DEFAULT_IMAP)
  const [status, setStatus] = useState<{ running: boolean } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    window.api.imap.loadConfig().then((c: ImapConfig | null) => {
      if (c) setConfig({ ...DEFAULT_IMAP, ...c, pass: '' })
    }).catch(() => {})
    window.api.imap.status().then(setStatus).catch(() => {})
  }, [])

  const state: ServiceState = error ? 'error' : busy ? 'starting' : status?.running ? 'running' : 'idle'

  const onSave = useCallback(async () => {
    setBusy(true)
    setError(null)
    try {
      await window.api.imap.saveConfig(config)
      showToast?.('success', 'IMAP config saved')
    } finally {
      setBusy(false)
    }
  }, [config, showToast])

  const onStart = useCallback(async () => {
    setError(null)
    setBusy(true)
    try {
      const res = await window.api.imap.start()
      if (!res.ok) throw new Error(res.error ?? 'IMAP start failed')
      setStatus({ running: true })
      showToast?.('success', 'IMAP watcher started')
    } catch (e: any) {
      setError(e?.message ?? String(e))
    } finally {
      setBusy(false)
    }
  }, [showToast])

  const onStop = useCallback(async () => {
    setBusy(true)
    try {
      await window.api.imap.stop()
      setStatus({ running: false })
    } finally {
      setBusy(false)
    }
  }, [])

  return (
    <NetworkServiceCard
      Icon={Mail}
      title="IMAP inbox watcher"
      description="Auto-import media attachments from an IMAP mailbox. Filter by subject — useful for piping shares from other devices straight to your library."
      state={state}
      statusLabel={status?.running ? 'Watching' : undefined}
      accent="from-yellow-500 to-amber-600"
      error={error}
    >
      <div className="grid grid-cols-[1fr_120px_auto] gap-2">
        <label className="space-y-1">
          <span className="text-[10px] uppercase tracking-wider text-[var(--muted)]">Host</span>
          <input
            value={config.host}
            onChange={(e) => setConfig({ ...config, host: e.target.value })}
            className="w-full px-2 py-1.5 rounded-lg bg-black/30 border border-white/10 text-xs font-mono outline-none focus:border-[var(--primary)]/50"
          />
        </label>
        <label className="space-y-1">
          <span className="text-[10px] uppercase tracking-wider text-[var(--muted)]">Port</span>
          <input
            type="number"
            value={config.port}
            onChange={(e) => setConfig({ ...config, port: Number(e.target.value) || 0 })}
            className="w-full px-2 py-1.5 rounded-lg bg-black/30 border border-white/10 text-xs font-mono outline-none focus:border-[var(--primary)]/50"
          />
        </label>
        <label className="flex items-center gap-1.5 self-end text-xs pb-1.5">
          <input
            type="checkbox"
            checked={config.secure}
            onChange={(e) => setConfig({ ...config, secure: e.target.checked })}
            className="accent-yellow-500"
          />
          TLS
        </label>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <label className="space-y-1">
          <span className="text-[10px] uppercase tracking-wider text-[var(--muted)]">User</span>
          <input
            value={config.user}
            onChange={(e) => setConfig({ ...config, user: e.target.value })}
            className="w-full px-2 py-1.5 rounded-lg bg-black/30 border border-white/10 text-xs outline-none focus:border-[var(--primary)]/50"
          />
        </label>
        <label className="space-y-1">
          <span className="text-[10px] uppercase tracking-wider text-[var(--muted)]">Password / app password</span>
          <input
            type="password"
            value={config.pass ?? ''}
            onChange={(e) => setConfig({ ...config, pass: e.target.value })}
            placeholder="(unchanged)"
            className="w-full px-2 py-1.5 rounded-lg bg-black/30 border border-white/10 text-xs outline-none focus:border-[var(--primary)]/50"
          />
        </label>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <label className="space-y-1">
          <span className="text-[10px] uppercase tracking-wider text-[var(--muted)]">Mailbox</span>
          <input
            value={config.mailbox ?? ''}
            onChange={(e) => setConfig({ ...config, mailbox: e.target.value })}
            placeholder="INBOX"
            className="w-full px-2 py-1.5 rounded-lg bg-black/30 border border-white/10 text-xs outline-none focus:border-[var(--primary)]/50"
          />
        </label>
        <label className="space-y-1">
          <span className="text-[10px] uppercase tracking-wider text-[var(--muted)]">Subject contains</span>
          <input
            value={config.matchSubject ?? ''}
            onChange={(e) => setConfig({ ...config, matchSubject: e.target.value })}
            placeholder="Vault import"
            className="w-full px-2 py-1.5 rounded-lg bg-black/30 border border-white/10 text-xs outline-none focus:border-[var(--primary)]/50"
          />
        </label>
      </div>

      <NetworkActionRow>
        <NetworkGhostBtn onClick={onSave} disabled={busy}>Save config</NetworkGhostBtn>
        {!status?.running ? (
          <NetworkPrimaryBtn onClick={onStart} disabled={busy || !config.user} accent="bg-yellow-600/30 hover:bg-yellow-600/40 text-yellow-100">
            {busy ? <Loader2 size={14} className="animate-spin" /> : null} Start watcher
          </NetworkPrimaryBtn>
        ) : (
          <NetworkPrimaryBtn onClick={onStop} disabled={busy} accent="bg-red-600/30 hover:bg-red-600/40 text-red-100">
            {busy ? <Loader2 size={14} className="animate-spin" /> : null} Stop
          </NetworkPrimaryBtn>
        )}
      </NetworkActionRow>
    </NetworkServiceCard>
  )
}
