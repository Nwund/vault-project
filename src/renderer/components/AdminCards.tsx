// File: src/renderer/components/AdminCards.tsx
//
// Settings + AI Tools "admin"-style cards extracted from App.tsx as part
// of #48. Three components grouped because they share the same audience
// (settings panes) and same import set:
//
//   CrossDeviceCard   — Settings → Services, exposes mobile-sync server
//                       URLs categorized into LAN / Tailscale / Other.
//   UrlGroup          — internal helper for CrossDeviceCard's URL lists.
//   TaggerQualityCard — AI Tools → Utilities, library-wide consensus
//                       stats + re-analyze low-agreement videos.

import { useEffect, useState, useCallback } from 'react'
import { Loader2, RefreshCw, Plus, Activity } from 'lucide-react'
import { useToast } from '../contexts'
import { useVisibilityInterval } from '../hooks/useVisibilityInterval'

/**
 * Cross-device access card (#26). Reuses the existing mobile-sync HTTP
 * server (which already implements range streaming + auth) and surfaces
 * its bind addresses categorized by network type. Generates bearer
 * tokens on demand so the user can pair a PC client.
 *
 * Lives in Settings → Services. The user toggles the server on via the
 * Mobile Sync card directly below this one — when running, this card
 * shows where it's reachable from.
 */
export function CrossDeviceCard() {
  const { showToast } = useToast()
  const [info, setInfo] = useState<{ running: boolean; port: number; lan: string[]; tailscale: string[]; other: string[] } | null>(null)
  const [tokens, setTokens] = useState<Array<{ id: string; token: string; deviceId: string; label: string; ts: number }>>([])
  const [loading, setLoading] = useState(false)
  const [generating, setGenerating] = useState(false)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const r = await window.api.mobileSync.getAccessUrls?.()
      if (r) setInfo(r)
    } catch (err) {
      console.warn('[CrossDevice] fetch failed:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  // 5s poll while panel is open AND tab is visible — keeps the on/off
  // state from the adjacent Mobile Sync card in sync without burning
  // IPCs when the user has wandered to a different tab/app.
  useVisibilityInterval(refresh, 5000)

  const generate = async () => {
    setGenerating(true)
    try {
      const label = `Token ${new Date().toLocaleTimeString()}`
      const r = await window.api.mobileSync.generateAccessToken?.(label)
      if (r?.token) {
        setTokens((prev) => [{ ...r, label, ts: Date.now() }, ...prev].slice(0, 5))
        showToast?.('success', 'Token generated — copy it before closing this card')
      }
    } catch (err: any) {
      showToast?.('error', err?.message ?? 'Token generation failed')
    } finally {
      setGenerating(false)
    }
  }

  const copy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text)
      showToast?.('success', `${label} copied`)
    } catch {
      showToast?.('error', 'Clipboard write failed')
    }
  }

  return (
    <div className="rounded-3xl border border-[var(--border)] bg-black/20 p-5 mt-4">
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="text-sm font-semibold">Cross-Device Access</div>
          <div className="text-[11px] text-[var(--muted)] mt-0.5">
            Stream your library from another PC over LAN or Tailscale. Uses the same server as Mobile Sync.
          </div>
        </div>
        <button
          onClick={refresh}
          className="px-2 py-1 rounded text-xs bg-white/5 hover:bg-white/10 transition flex items-center gap-1"
          title="Refresh"
        >
          {loading ? <Loader2 size={11} className="animate-spin" /> : <RefreshCw size={11} />}
          Refresh
        </button>
      </div>

      {!info?.running ? (
        <div className="text-xs text-[var(--muted)] italic">
          Server is offline — turn it on in the Mobile Sync card below to expose access URLs.
        </div>
      ) : (
        <div className="space-y-3">
          {/* URL categories */}
          <div className="space-y-2">
            {info.tailscale.length > 0 && (
              <UrlGroup label="Tailscale" hint="works from any device on your tailnet" urls={info.tailscale} onCopy={(u) => copy(u, 'Tailscale URL')} accent="emerald" />
            )}
            {info.lan.length > 0 && (
              <UrlGroup label="LAN" hint="same network only" urls={info.lan} onCopy={(u) => copy(u, 'LAN URL')} accent="cyan" />
            )}
            {info.other.length > 0 && (
              <UrlGroup label="Other" hint="VPN / Docker / unknown" urls={info.other} onCopy={(u) => copy(u, 'URL')} accent="zinc" />
            )}
            {info.tailscale.length === 0 && info.lan.length === 0 && info.other.length === 0 && (
              <div className="text-xs text-amber-300">No external network interfaces detected.</div>
            )}
          </div>

          {/* Token generation */}
          <div className="pt-3 border-t border-white/5">
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs font-medium">Pairing tokens</div>
              <button
                onClick={generate}
                disabled={generating}
                className="px-3 py-1 rounded-md text-xs bg-fuchsia-500/20 hover:bg-fuchsia-500/30 text-fuchsia-200 border border-fuchsia-500/30 transition disabled:opacity-40 flex items-center gap-1.5"
              >
                {generating ? <Loader2 size={11} className="animate-spin" /> : <Plus size={11} />}
                Generate token
              </button>
            </div>
            {tokens.length === 0 ? (
              <div className="text-[11px] text-[var(--muted)] italic">
                No tokens issued. Generate one to authenticate a remote device.
              </div>
            ) : (
              <div className="space-y-1">
                {tokens.map((t) => (
                  <div key={t.deviceId} className="flex items-center gap-2 px-2 py-1.5 rounded bg-black/30 border border-white/5">
                    <div className="flex-1 min-w-0">
                      <div className="text-[11px] text-white/70 truncate">{t.label}</div>
                      <div className="text-[10px] font-mono text-white/40 truncate">{t.token}</div>
                    </div>
                    <button
                      onClick={() => copy(t.token, 'Token')}
                      className="px-2 py-0.5 rounded text-[10px] bg-white/5 hover:bg-white/10 transition"
                    >
                      Copy
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="text-[10px] text-[var(--muted)] mt-2 leading-relaxed">
              Use as <code className="bg-black/40 px-1 rounded">Authorization: Bearer &lt;token&gt;</code> on requests to <code className="bg-black/40 px-1 rounded">/api/*</code> endpoints. Tokens persist until app restart.
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * #189 — Cloudflare Tunnel one-click remote access. Spawns
 * `cloudflared tunnel --url http://127.0.0.1:<port>` and surfaces the
 * trycloudflare.com URL it prints. Requires the user to have installed
 * cloudflared (winget install Cloudflare.cloudflared).
 */
export function CloudflareTunnelCard() {
  const { showToast } = useToast()
  const [status, setStatus] = useState<{ running: boolean; url: string | null } | null>(null)
  const [busy, setBusy] = useState(false)

  const refresh = useCallback(async () => {
    try {
      const r = await window.api.network?.cloudflareTunnelStatus?.()
      setStatus(r ?? { running: false, url: null })
    } catch {
      setStatus({ running: false, url: null })
    }
  }, [])

  useEffect(() => { void refresh() }, [refresh])

  const start = async () => {
    setBusy(true)
    try {
      const r = await window.api.network?.cloudflareTunnelStart?.()
      if (r?.ok) {
        showToast?.('success', `Tunnel up: ${r.url}`)
        await refresh()
      } else {
        showToast?.('error', r?.error ?? 'Tunnel start failed')
      }
    } finally { setBusy(false) }
  }
  const stop = async () => {
    setBusy(true)
    try {
      await window.api.network?.cloudflareTunnelStop?.()
      showToast?.('info', 'Tunnel stopped')
      await refresh()
    } finally { setBusy(false) }
  }
  const copyUrl = async () => {
    if (!status?.url) return
    try {
      await navigator.clipboard.writeText(status.url)
      showToast?.('success', 'Tunnel URL copied')
    } catch { showToast?.('error', 'Clipboard write failed') }
  }

  return (
    <div className="rounded-3xl border border-[var(--border)] bg-black/20 p-5 mt-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="text-sm font-semibold">Cloudflare Tunnel</div>
          <div className="text-[11px] text-[var(--muted)] mt-0.5">
            One-click public HTTPS tunnel via cloudflared. No port forwarding, no Tailscale needed.
          </div>
        </div>
        <button
          onClick={refresh}
          className="px-2 py-1 rounded text-xs bg-white/5 hover:bg-white/10 transition flex items-center gap-1"
          title="Refresh"
        >
          <RefreshCw size={11} />
        </button>
      </div>
      {status === null ? (
        <div className="text-xs text-[var(--muted)] italic">Checking…</div>
      ) : !status.running ? (
        <div className="space-y-2">
          <div className="text-xs text-[var(--muted)]">
            Requires <code className="bg-black/40 px-1 rounded">cloudflared</code> on PATH.
            Install: <code className="bg-black/40 px-1 rounded">winget install Cloudflare.cloudflared</code>
          </div>
          <button
            disabled={busy}
            onClick={start}
            className="w-full px-3 py-2 rounded-lg bg-orange-500 hover:bg-orange-400 text-white text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
            {busy ? 'Starting tunnel…' : 'Start tunnel'}
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/30">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <code className="text-xs text-emerald-200 truncate flex-1" title={status.url ?? ''}>
              {status.url ?? '—'}
            </code>
            <button
              onClick={copyUrl}
              className="px-2 py-0.5 rounded text-[10px] bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-200"
            >
              Copy
            </button>
          </div>
          <button
            disabled={busy}
            onClick={stop}
            className="w-full px-3 py-1.5 rounded text-xs bg-red-500/20 hover:bg-red-500/30 text-red-300 transition disabled:opacity-50"
          >
            {busy ? 'Stopping…' : 'Stop tunnel'}
          </button>
          <div className="text-[10px] text-[var(--muted)]">
            Anyone with this URL can reach your Mobile Sync server. Pair with bearer-token auth from the card above.
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * #190 — ZeroTier orchestration. Detects locally installed ZeroTier
 * One client (reads authtoken.secret + queries the local API at
 * 127.0.0.1:9993) and surfaces the assigned 10.147.x.x addresses
 * alongside the existing Tailscale + LAN groups.
 */
export function ZeroTierCard() {
  const { showToast } = useToast()
  const [info, setInfo] = useState<{
    installed: boolean
    addresses: Array<{ ip: string; network: string; networkName: string }>
  } | null>(null)

  const refresh = useCallback(async () => {
    try {
      const r = await window.api.network?.zerotierStatus?.()
      setInfo({
        installed: !!r?.installed,
        addresses: Array.isArray(r?.addresses) ? r.addresses : [],
      })
    } catch {
      setInfo({ installed: false, addresses: [] })
    }
  }, [])

  useEffect(() => { void refresh() }, [refresh])

  const copy = async (ip: string) => {
    const port = 8765  // matches mobile sync default
    const url = `http://${ip}:${port}`
    try {
      await navigator.clipboard.writeText(url)
      showToast?.('success', `${url} copied`)
    } catch { showToast?.('error', 'Clipboard write failed') }
  }

  if (info === null) return null
  // Hide entirely when ZeroTier isn't installed — no value showing
  // an empty card to users who don't use ZeroTier.
  if (!info.installed && info.addresses.length === 0) return null

  return (
    <div className="rounded-3xl border border-[var(--border)] bg-black/20 p-5 mt-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="text-sm font-semibold">ZeroTier</div>
          <div className="text-[11px] text-[var(--muted)] mt-0.5">
            Reachable from any device on your ZeroTier networks (10.147.x.x).
          </div>
        </div>
        <button
          onClick={refresh}
          className="px-2 py-1 rounded text-xs bg-white/5 hover:bg-white/10 transition flex items-center gap-1"
        >
          <RefreshCw size={11} />
        </button>
      </div>
      {info.addresses.length === 0 ? (
        <div className="text-xs text-amber-300">
          ZeroTier installed but no networks joined. Run <code className="bg-black/40 px-1 rounded">zerotier-cli join &lt;networkId&gt;</code>.
        </div>
      ) : (
        <div className="space-y-1">
          {info.addresses.map(addr => (
            <button
              key={`${addr.network}-${addr.ip}`}
              onClick={() => copy(addr.ip)}
              className="w-full text-left flex items-center gap-2 px-3 py-2 rounded-lg bg-orange-500/10 border border-orange-500/30 hover:bg-orange-500/20 transition"
            >
              <code className="text-xs text-orange-200 font-mono flex-1">http://{addr.ip}:8765</code>
              <span className="text-[10px] text-orange-300/70 truncate max-w-[10rem]" title={addr.networkName}>
                {addr.networkName || addr.network.slice(0, 8)}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * #200 — Restic offsite backup card. Reads the configured repo URI
 * from settings.backup.resticRepo + password file path. Backup Now
 * spawns restic; the IPC parses the summary line for snapshot ID +
 * data-added. Snapshot history pulled via restic snapshots --json.
 */
export function ResticBackupCard() {
  const { showToast } = useToast()
  const [snapshots, setSnapshots] = useState<any[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [configured, setConfigured] = useState<boolean | null>(null)

  const refresh = useCallback(async () => {
    try {
      const r = await window.api.network?.resticSnapshots?.()
      if (r?.ok) {
        setSnapshots(r.snapshots)
        setConfigured(true)
      } else {
        setSnapshots([])
        // Probe whether the error is just "not configured" or a real fault
        setConfigured(!String(r?.error ?? '').toLowerCase().includes('not configured'))
      }
    } catch {
      setSnapshots([])
      setConfigured(false)
    }
  }, [])

  useEffect(() => { void refresh() }, [refresh])

  const backupNow = async () => {
    setBusy(true)
    try {
      const r = await window.api.network?.resticSnapshot?.({ tag: 'manual' })
      if (r?.ok) {
        showToast?.('success',
          `Snapshot ${r.snapshotId ?? ''} created · ${r.filesNew ?? '?'} new files · ${r.dataAdded ?? 'unknown size'}`)
        await refresh()
      } else {
        showToast?.('error', r?.error ?? 'Restic backup failed')
      }
    } finally { setBusy(false) }
  }

  return (
    <div className="rounded-3xl border border-[var(--border)] bg-black/20 p-5 mt-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="text-sm font-semibold">Restic Backup</div>
          <div className="text-[11px] text-[var(--muted)] mt-0.5">
            Encrypted, deduplicated offsite snapshots of <code className="bg-black/40 px-1 rounded text-[10px]">userData</code>.
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            disabled={busy || configured === false}
            onClick={backupNow}
            className="px-3 py-1.5 rounded text-xs bg-purple-600 hover:bg-purple-500 text-white transition disabled:opacity-40 flex items-center gap-1.5"
          >
            {busy ? <Loader2 size={11} className="animate-spin" /> : <Plus size={11} />}
            {busy ? 'Snapshotting…' : 'Backup now'}
          </button>
          <button onClick={refresh} className="px-2 py-1.5 rounded text-xs bg-white/5 hover:bg-white/10 transition">
            <RefreshCw size={11} />
          </button>
        </div>
      </div>
      {configured === false ? (
        <div className="text-xs text-amber-300 leading-relaxed">
          Restic isn't configured. Set <code className="bg-black/40 px-1 rounded">settings.backup.resticRepo</code> (e.g. <code className="bg-black/40 px-1 rounded">b2:my-bucket:vault</code>) and <code className="bg-black/40 px-1 rounded">settings.backup.resticPasswordFile</code> (absolute path to a file with the repo password). Then install the restic binary on PATH and click Backup Now.
        </div>
      ) : snapshots && snapshots.length === 0 ? (
        <div className="text-xs text-[var(--muted)] italic">
          No snapshots yet. Click Backup Now to create the first one.
        </div>
      ) : snapshots && snapshots.length > 0 ? (
        <div className="space-y-1 max-h-40 overflow-y-auto">
          {snapshots.slice(0, 10).map((s: any, i: number) => (
            <div key={s.id ?? i} className="flex items-center justify-between text-[11px] px-2 py-1 rounded bg-white/[0.03]">
              <code className="text-purple-300 font-mono">{String(s.short_id ?? s.id ?? '').slice(0, 8)}</code>
              <span className="text-[var(--muted)]">{s.time ? new Date(s.time).toLocaleString() : '—'}</span>
              <span className="text-white/60">{(s.tags ?? []).join(', ') || '—'}</span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}

/**
 * #181 — WebDAV server card. Lets any third-party file manager
 * (Windows Explorer, Finder, Infuse, VLC, Kodi) mount the Vault
 * library as a network drive. Bearer-token-auth via the existing
 * mobile-sync tokens.
 */
export function WebDavCard() {
  const { showToast } = useToast()
  const [status, setStatus] = useState<{ running: boolean; port: number | null } | null>(null)
  const [busy, setBusy] = useState(false)

  const refresh = useCallback(async () => {
    try {
      const r = await window.api.network?.webdavStatus?.()
      setStatus(r ?? { running: false, port: null })
    } catch {
      setStatus({ running: false, port: null })
    }
  }, [])

  useEffect(() => { void refresh() }, [refresh])

  const start = async () => {
    setBusy(true)
    try {
      const r = await window.api.network?.webdavStart?.({ port: 9997 })
      if (r?.ok) {
        showToast?.('success', `WebDAV server on port ${r.port}`)
        await refresh()
      } else {
        showToast?.('error', r?.error ?? 'WebDAV start failed')
      }
    } finally { setBusy(false) }
  }
  const stop = async () => {
    setBusy(true)
    try {
      await window.api.network?.webdavStop?.()
      showToast?.('info', 'WebDAV server stopped')
      await refresh()
    } finally { setBusy(false) }
  }

  if (status === null) return null

  return (
    <div className="rounded-3xl border border-[var(--border)] bg-black/20 p-5 mt-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="text-sm font-semibold">WebDAV Server</div>
          <div className="text-[11px] text-[var(--muted)] mt-0.5">
            Mount the library as a network drive in Explorer / Finder / VLC / Infuse / Kodi (read-only).
          </div>
        </div>
        {status.running ? (
          <button
            disabled={busy}
            onClick={stop}
            className="px-3 py-1.5 rounded text-xs bg-red-500/20 hover:bg-red-500/30 text-red-300 transition disabled:opacity-40"
          >
            {busy ? 'Stopping…' : 'Stop'}
          </button>
        ) : (
          <button
            disabled={busy}
            onClick={start}
            className="px-3 py-1.5 rounded text-xs bg-[var(--primary)] hover:opacity-90 text-white transition disabled:opacity-40 flex items-center gap-1.5"
          >
            {busy ? <Loader2 size={11} className="animate-spin" /> : <Plus size={11} />}
            Start on 9997
          </button>
        )}
      </div>
      {status.running ? (
        <div className="space-y-2">
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/30">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <code className="text-xs text-emerald-200 truncate flex-1">http://127.0.0.1:{status.port}/</code>
          </div>
          <div className="text-[10px] text-[var(--muted)] leading-relaxed">
            <strong>Windows:</strong> Map Network Drive → <code className="bg-black/40 px-1 rounded">http://127.0.0.1:{status.port}/</code> with a bearer token (generate one in Cross-Device Access) as the password. <strong>macOS:</strong> Finder → Go → Connect to Server.
          </div>
        </div>
      ) : (
        <div className="text-[11px] text-[var(--muted)]">
          Bearer-token auth — generate one in Cross-Device Access above first.
        </div>
      )}
    </div>
  )
}

function UrlGroup({ label, hint, urls, onCopy, accent }: {
  label: string; hint: string; urls: string[]; onCopy: (u: string) => void; accent: 'emerald' | 'cyan' | 'zinc'
}) {
  const accentClasses = accent === 'emerald'
    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
    : accent === 'cyan'
      ? 'border-cyan-500/30 bg-cyan-500/10 text-cyan-200'
      : 'border-white/10 bg-white/5 text-white/60'
  return (
    <div className={`rounded-lg border p-2 ${accentClasses}`}>
      <div className="flex items-center justify-between mb-1">
        <div className="text-[10px] font-mono uppercase tracking-wider">{label}</div>
        <div className="text-[10px] opacity-60">{hint}</div>
      </div>
      <div className="space-y-1">
        {urls.map((u) => (
          <div key={u} className="flex items-center gap-2 text-[11px]">
            <code className="flex-1 font-mono truncate">{u}</code>
            <button
              onClick={() => onCopy(u)}
              className="px-2 py-0.5 rounded bg-black/30 hover:bg-black/50 text-white/70 text-[10px]"
            >
              Copy
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

/**
 * Library-wide tagger-quality dashboard. Surfaces multi-frame consensus
 * stats so the user can see how confident the existing analyses are and
 * trigger a re-analysis pass on the weakest entries.
 *
 * Lives inside the AI Tools → Utilities tab. Self-contained — owns its
 * own data fetch and re-fetches on any action that changes the underlying
 * counts.
 */
export function TaggerQualityCard() {
  const { showToast } = useToast()
  const [stats, setStats] = useState<{
    total: number
    unanimousVideos: number
    lowAgreementVideos: number
    averageAgreement: number
    topDisagreedTags: Array<{ name: string; singletonRatio: number; total: number }>
    lowAgreementMediaIds: string[]
  } | null>(null)
  const [loading, setLoading] = useState(false)
  const [reanalyzing, setReanalyzing] = useState(false)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const s = await window.api.ai.getConsensusStats?.()
      if (s) setStats(s)
    } catch (err) {
      console.error('[TaggerQuality] fetch failed:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void refresh() }, [refresh])

  const handleReanalyze = async () => {
    if (!stats || stats.lowAgreementMediaIds.length === 0) return
    setReanalyzing(true)
    try {
      const r = await window.api.ai.reanalyzeBatch(stats.lowAgreementMediaIds)
      showToast?.('success', `Re-queued ${r.enqueued} videos for AI re-analysis`)
      // Stats update once the pipeline completes; the user can refresh later.
    } catch (err: any) {
      showToast?.('error', err?.message ?? 'Re-analysis failed')
    } finally {
      setReanalyzing(false)
    }
  }

  return (
    <div className="bg-[var(--panel)] rounded-xl border border-[var(--border)] p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Activity size={20} />
          Tagger Quality
        </h2>
        <button
          onClick={refresh}
          disabled={loading}
          className="px-2 py-1 rounded text-xs bg-white/5 hover:bg-white/10 transition disabled:opacity-50 flex items-center gap-1"
          title="Refresh stats"
        >
          {loading ? <Loader2 size={11} className="animate-spin" /> : <RefreshCw size={11} />}
          Refresh
        </button>
      </div>

      {!stats || stats.total === 0 ? (
        <p className="text-sm text-[var(--muted)]">
          {loading ? 'Loading…' : 'No multi-frame analyses yet. Stats appear once you\'ve tagged videos with 2+ frames.'}
        </p>
      ) : (
        <div className="space-y-4">
          <p className="text-xs text-[var(--muted)]">
            Multi-frame consensus across {stats.total} analyzed video{stats.total === 1 ? '' : 's'}. Higher agreement = AI is more confident in those tags.
          </p>

          {/* Stat grid */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-black/30 rounded-lg p-3 border border-white/5">
              <div className="text-[10px] uppercase tracking-wider text-[var(--muted)]">Avg agreement</div>
              <div className="text-2xl font-bold tabular-nums mt-1">
                {Math.round(stats.averageAgreement * 100)}<span className="text-sm text-white/40">%</span>
              </div>
            </div>
            <div className="bg-black/30 rounded-lg p-3 border border-emerald-500/20">
              <div className="text-[10px] uppercase tracking-wider text-emerald-300/70">High confidence</div>
              <div className="text-2xl font-bold tabular-nums mt-1 text-emerald-200">
                {stats.unanimousVideos}
              </div>
              <div className="text-[10px] text-white/40 mt-0.5">unanimous tags</div>
            </div>
            <div className="bg-black/30 rounded-lg p-3 border border-amber-500/20">
              <div className="text-[10px] uppercase tracking-wider text-amber-300/70">Low confidence</div>
              <div className="text-2xl font-bold tabular-nums mt-1 text-amber-200">
                {stats.lowAgreementVideos}
              </div>
              <div className="text-[10px] text-white/40 mt-0.5">avg &lt; 0.5</div>
            </div>
          </div>

          {/* Most-disagreed tags */}
          {stats.topDisagreedTags.length > 0 && (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-[var(--muted)] mb-2">
                Most-disagreed tags (highest singleton ratio)
              </div>
              <div className="flex flex-wrap gap-1.5">
                {stats.topDisagreedTags.map((t) => (
                  <span
                    key={t.name}
                    className="px-2 py-0.5 rounded bg-amber-500/15 text-amber-200 border border-amber-500/30 text-xs"
                    title={`${Math.round(t.singletonRatio * 100)}% singleton across ${t.total} appearances — Venice may be hallucinating this tag in single frames`}
                  >
                    {t.name} <span className="opacity-50 tabular-nums">{Math.round(t.singletonRatio * 100)}%</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Re-analyze action */}
          {stats.lowAgreementMediaIds.length > 0 && (
            <div className="pt-2 border-t border-white/5">
              <button
                onClick={handleReanalyze}
                disabled={reanalyzing}
                className="w-full px-4 py-2.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 border border-amber-500/30 text-sm font-medium transition disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {reanalyzing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                Re-analyze {stats.lowAgreementMediaIds.length} low-agreement video{stats.lowAgreementMediaIds.length === 1 ? '' : 's'}
              </button>
              <p className="text-[10px] text-[var(--muted)] mt-1.5 text-center">
                Re-runs Tier 2 with the latest prompt at priority 1 — they\'ll be next in the queue.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
