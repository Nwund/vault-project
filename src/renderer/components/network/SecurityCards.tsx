'use memo'
// File: src/renderer/components/network/SecurityCards.tsx
//
// Three v2.7 security / notification cards under Settings → Services:
//   - WebAuthnCard  (#281) — FIDO2 / passkey-backed vault unlock
//   - ShamirCard    (#284) — Secret-sharing key recovery
//   - NtfyCard      (#274) — ntfy.sh push gateway for long-job notifications
//
// All three consume preload bridges that previously had no UI.

import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import {
  KeyRound,
  Fingerprint,
  Trash2,
  Loader2,
  Plus,
  RefreshCw,
  Bell,
  ShieldCheck,
  Copy,
  Check,
  Combine,
} from 'lucide-react'
import { useToast } from '../../contexts'
import {
  NetworkServiceCard,
  NetworkActionRow,
  NetworkPrimaryBtn,
  NetworkGhostBtn,
} from './NetworkServiceCard'
import { FADE_SLIDE, SPRINGS, type ServiceState } from './motion-tokens'

// ═══════════════════════════════════════════════════════════════════════════
// WebAuthn — passkey / FIDO2 vault unlock
// ═══════════════════════════════════════════════════════════════════════════

interface PasskeyCred {
  id: string
  deviceLabel: string
  registeredAt: number
  counter: number
}

export function WebAuthnCard() {
  const { showToast } = useToast()
  const [creds, setCreds] = useState<PasskeyCred[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [newLabel, setNewLabel] = useState('Vault desktop')

  const refresh = useCallback(async () => {
    try {
      const res = await window.api.tags.webauthn.listCredentials()
      if (res.ok) setCreds(res.credentials ?? [])
    } catch (e: any) {
      setError(e?.message ?? String(e))
    }
  }, [])

  useEffect(() => { refresh() }, [refresh])

  const state: ServiceState = error ? 'error' : busy ? 'starting' : creds.length > 0 ? 'running' : 'idle'

  // Helper: base64url → ArrayBuffer
  const b64uToBuf = (s: string): ArrayBuffer => {
    const b64 = s.replace(/-/g, '+').replace(/_/g, '/').padEnd(s.length + (4 - s.length % 4) % 4, '=')
    const bin = atob(b64)
    const arr = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i)
    return arr.buffer
  }
  const bufToB64u = (b: ArrayBuffer): string => {
    const bytes = new Uint8Array(b)
    let bin = ''
    for (let i = 0; i < bytes.byteLength; i++) bin += String.fromCharCode(bytes[i])
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  }

  const onRegister = useCallback(async () => {
    if (!newLabel.trim() || !window.PublicKeyCredential) return
    setBusy(true); setError(null)
    try {
      const res = await window.api.tags.webauthn.registerStart(newLabel.trim())
      if (!res.ok || !res.options) throw new Error(res.error ?? 'registerStart failed')
      // Browsers need the raw challenge/userId as ArrayBuffers
      const opts = res.options
      opts.challenge = b64uToBuf(opts.challenge)
      opts.user.id = b64uToBuf(opts.user.id)
      if (opts.excludeCredentials) {
        opts.excludeCredentials = opts.excludeCredentials.map((c: any) => ({ ...c, id: b64uToBuf(c.id) }))
      }
      const cred = await navigator.credentials.create({ publicKey: opts }) as any
      const finish = await window.api.tags.webauthn.registerFinish({
        deviceLabel: newLabel.trim(),
        response: {
          id: cred.id,
          rawId: bufToB64u(cred.rawId),
          type: cred.type,
          response: {
            attestationObject: bufToB64u(cred.response.attestationObject),
            clientDataJSON: bufToB64u(cred.response.clientDataJSON),
          },
        },
      })
      if (!finish.ok) throw new Error(finish.error ?? 'registerFinish failed')
      showToast?.('success', `Registered "${newLabel.trim()}"`)
      setNewLabel('Vault desktop')
      refresh()
    } catch (e: any) {
      setError(e?.message ?? String(e))
    } finally {
      setBusy(false)
    }
  }, [newLabel, refresh, showToast])

  const onRemove = useCallback(async (id: string) => {
    await window.api.tags.webauthn.removeCredential(id)
    refresh()
  }, [refresh])

  return (
    <NetworkServiceCard
      Icon={Fingerprint}
      title="WebAuthn / passkeys"
      description="FIDO2 passkey-backed vault unlock. Register a hardware key (YubiKey, Windows Hello, Touch ID) so vault can ask for biometric/hardware auth at startup."
      state={state}
      statusLabel={creds.length > 0 ? `${creds.length} passkey${creds.length === 1 ? '' : 's'}` : undefined}
      accent="from-violet-500 to-purple-600"
      error={error}
    >
      <div className="flex gap-2 items-end">
        <label className="space-y-1 flex-1">
          <span className="text-[10px] uppercase tracking-wider text-[var(--muted)]">Device label</span>
          <input
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            placeholder="Vault desktop"
            className="w-full px-2 py-1.5 rounded-lg bg-black/30 border border-white/10 text-xs outline-none focus:border-[var(--primary)]/50"
          />
        </label>
        <NetworkPrimaryBtn
          onClick={onRegister}
          disabled={busy || !newLabel.trim()}
          accent="bg-violet-600/30 hover:bg-violet-600/40 text-violet-100"
        >
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
          Register passkey
        </NetworkPrimaryBtn>
      </div>

      <AnimatePresence>
        {creds.length > 0 && (
          <motion.div {...FADE_SLIDE} className="space-y-1">
            <div className="text-[10px] uppercase tracking-wider text-[var(--muted)]">Registered keys</div>
            <div className="space-y-1 max-h-40 overflow-y-auto pr-1">
              {creds.map((c) => (
                <motion.div
                  key={c.id}
                  layout
                  transition={SPRINGS.snappy}
                  className="flex items-center justify-between gap-2 p-2 rounded-lg bg-white/[0.03] border border-white/5"
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-sm truncate">{c.deviceLabel}</div>
                    <div className="text-[10px] text-[var(--muted)] tabular-nums">
                      {new Date(c.registeredAt).toLocaleString()} · used {c.counter}×
                    </div>
                  </div>
                  <button
                    onClick={() => onRemove(c.id)}
                    className="text-[var(--muted)] hover:text-red-300 transition"
                    aria-label="Remove"
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
// Shamir Secret Sharing — split/combine vault key
// ═══════════════════════════════════════════════════════════════════════════

export function ShamirCard() {
  const { showToast } = useToast()
  const [mode, setMode] = useState<'split' | 'combine'>('split')
  const [secret, setSecret] = useState('')
  const [totalShares, setTotalShares] = useState(5)
  const [threshold, setThreshold] = useState(3)
  const [shares, setShares] = useState<Array<{ index: number; base32: string }> | null>(null)
  const [combineInput, setCombineInput] = useState('')
  const [combined, setCombined] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null)

  const state: ServiceState = error ? 'error' : busy ? 'starting' : (shares || combined) ? 'running' : 'idle'

  const onSplit = useCallback(async () => {
    if (!secret.trim()) return
    setBusy(true); setError(null); setShares(null)
    try {
      const res = await window.api.tags.shamir.split({
        secret: secret.trim(),
        shares: totalShares,
        threshold,
      })
      if (!res.ok || !res.shares) throw new Error(res.error ?? 'Split failed')
      setShares(res.shares.map((s: any) => ({ index: s.index, base32: s.base32 })))
      showToast?.('success', `Split into ${totalShares} shares (threshold ${threshold})`)
    } catch (e: any) {
      setError(e?.message ?? String(e))
    } finally {
      setBusy(false)
    }
  }, [secret, totalShares, threshold, showToast])

  const onCombine = useCallback(async () => {
    const lines = combineInput.split('\n').map((l) => l.trim()).filter(Boolean)
    if (lines.length === 0) return
    setBusy(true); setError(null); setCombined(null)
    try {
      const res = await window.api.tags.shamir.combine({
        shareStrings: lines,
        encoding: 'base32',
      })
      if (!res.ok || !res.secret) throw new Error(res.error ?? 'Combine failed')
      setCombined(res.secret)
      showToast?.('success', 'Secret recovered')
    } catch (e: any) {
      setError(e?.message ?? String(e))
    } finally {
      setBusy(false)
    }
  }, [combineInput, showToast])

  const onCopyShare = useCallback((idx: number, value: string) => {
    navigator.clipboard.writeText(value).then(() => {
      setCopiedIdx(idx)
      setTimeout(() => setCopiedIdx(null), 1400)
    })
  }, [])

  return (
    <NetworkServiceCard
      Icon={ShieldCheck}
      title="Shamir Secret Sharing"
      description="Split your vault recovery passphrase into N shares; any K of them can reconstruct it. Distribute across trusted parties or backup locations."
      state={state}
      accent="from-rose-500 to-red-600"
      error={error}
    >
      <div className="flex gap-1.5 p-1 rounded-lg bg-black/30 border border-white/5">
        <button
          onClick={() => setMode('split')}
          className={`flex-1 px-2 py-1 rounded text-[11px] transition ${
            mode === 'split' ? 'bg-rose-600/30 text-rose-100' : 'text-[var(--muted)] hover:text-white'
          }`}
        >
          Split
        </button>
        <button
          onClick={() => setMode('combine')}
          className={`flex-1 px-2 py-1 rounded text-[11px] transition ${
            mode === 'combine' ? 'bg-rose-600/30 text-rose-100' : 'text-[var(--muted)] hover:text-white'
          }`}
        >
          Combine
        </button>
      </div>

      {mode === 'split' && (
        <>
          <label className="space-y-1 block">
            <span className="text-[10px] uppercase tracking-wider text-[var(--muted)]">Secret to split</span>
            <input
              type="password"
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              placeholder="Recovery passphrase"
              className="w-full px-2 py-1.5 rounded-lg bg-black/30 border border-white/10 text-xs font-mono outline-none focus:border-[var(--primary)]/50"
            />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="space-y-1">
              <span className="text-[10px] uppercase tracking-wider text-[var(--muted)]">Total shares (N)</span>
              <input
                type="number"
                min={2}
                max={32}
                value={totalShares}
                onChange={(e) => setTotalShares(Math.max(2, Math.min(32, Number(e.target.value) || 2)))}
                className="w-full px-2 py-1.5 rounded-lg bg-black/30 border border-white/10 text-xs font-mono outline-none focus:border-[var(--primary)]/50"
              />
            </label>
            <label className="space-y-1">
              <span className="text-[10px] uppercase tracking-wider text-[var(--muted)]">Threshold (K)</span>
              <input
                type="number"
                min={2}
                max={totalShares}
                value={threshold}
                onChange={(e) => setThreshold(Math.max(2, Math.min(totalShares, Number(e.target.value) || 2)))}
                className="w-full px-2 py-1.5 rounded-lg bg-black/30 border border-white/10 text-xs font-mono outline-none focus:border-[var(--primary)]/50"
              />
            </label>
          </div>
          <NetworkActionRow>
            <NetworkPrimaryBtn
              onClick={onSplit}
              disabled={busy || !secret.trim()}
              accent="bg-rose-600/30 hover:bg-rose-600/40 text-rose-100"
            >
              {busy ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />}
              Split secret
            </NetworkPrimaryBtn>
          </NetworkActionRow>

          <AnimatePresence>
            {shares && (
              <motion.div {...FADE_SLIDE} className="space-y-1">
                <div className="text-[10px] uppercase tracking-wider text-[var(--muted)]">
                  Share strings (any {threshold} can recover)
                </div>
                <div className="space-y-1 max-h-40 overflow-y-auto pr-1">
                  {shares.map((s) => (
                    <motion.div
                      key={s.index}
                      layout
                      transition={SPRINGS.snappy}
                      className="flex items-center gap-2 p-1.5 rounded-lg bg-white/[0.03] border border-white/5"
                    >
                      <span className="text-[10px] font-bold text-rose-300 tabular-nums w-6">#{s.index}</span>
                      <code className="text-[9px] font-mono text-zinc-300 truncate flex-1" title={s.base32}>
                        {s.base32}
                      </code>
                      <button
                        onClick={() => onCopyShare(s.index, s.base32)}
                        className="text-[var(--muted)] hover:text-white transition"
                        aria-label="Copy"
                      >
                        {copiedIdx === s.index ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} />}
                      </button>
                    </motion.div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </>
      )}

      {mode === 'combine' && (
        <>
          <label className="space-y-1 block">
            <span className="text-[10px] uppercase tracking-wider text-[var(--muted)]">
              Paste {threshold}+ share strings (one per line)
            </span>
            <textarea
              value={combineInput}
              onChange={(e) => setCombineInput(e.target.value)}
              rows={4}
              placeholder="share1...&#10;share2...&#10;share3..."
              className="w-full px-2 py-1.5 rounded-lg bg-black/30 border border-white/10 text-xs font-mono outline-none focus:border-[var(--primary)]/50 resize-none"
            />
          </label>
          <NetworkActionRow>
            <NetworkPrimaryBtn
              onClick={onCombine}
              disabled={busy || !combineInput.trim()}
              accent="bg-rose-600/30 hover:bg-rose-600/40 text-rose-100"
            >
              {busy ? <Loader2 size={14} className="animate-spin" /> : <Combine size={14} />}
              Combine
            </NetworkPrimaryBtn>
          </NetworkActionRow>

          <AnimatePresence>
            {combined && (
              <motion.div {...FADE_SLIDE} className="rounded-2xl bg-emerald-500/10 border border-emerald-500/20 p-3 space-y-1">
                <div className="text-[10px] uppercase tracking-wider text-emerald-300">Recovered secret</div>
                <code className="block text-[11px] font-mono text-emerald-100 break-all">{combined}</code>
              </motion.div>
            )}
          </AnimatePresence>
        </>
      )}
    </NetworkServiceCard>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// ntfy.sh push gateway
// ═══════════════════════════════════════════════════════════════════════════

const NTFY_EVENTS = [
  'import.complete', 'transcode.complete', 'export.complete',
  'tagger.batch.done', 'browse.scrape.done', 'system.error',
] as const

interface NtfyConfig {
  server: string
  topic: string
  enabled: boolean
  allowedEvents: string[]
  priority?: number
  authToken?: string
}

export function NtfyCard() {
  const { showToast } = useToast()
  const [config, setConfig] = useState<NtfyConfig>({
    server: 'https://ntfy.sh',
    topic: '',
    enabled: false,
    allowedEvents: [...NTFY_EVENTS],
    priority: 3,
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [testStatus, setTestStatus] = useState<number | null>(null)

  useEffect(() => {
    window.api.tags.ntfy.config().then((res: any) => {
      if (res?.ok && res.config) setConfig({ ...config, ...res.config, authToken: '' })
    }).catch(() => {})
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const state: ServiceState = error ? 'error' : busy ? 'starting' : config.enabled && config.topic ? 'running' : 'idle'

  const onSave = useCallback(async () => {
    setBusy(true); setError(null)
    try {
      const patch: any = { ...config }
      if (!patch.authToken) delete patch.authToken
      const res = await window.api.tags.ntfy.save(patch)
      if (!res.ok) throw new Error(res.error ?? 'Save failed')
      showToast?.('success', 'ntfy config saved')
    } catch (e: any) {
      setError(e?.message ?? String(e))
    } finally {
      setBusy(false)
    }
  }, [config, showToast])

  const onTest = useCallback(async () => {
    setBusy(true); setError(null); setTestStatus(null)
    try {
      const res = await window.api.tags.ntfy.push({
        event: 'system.test',
        title: 'Vault test push',
        message: 'If you see this, ntfy is wired correctly.',
        tags: ['white_check_mark'],
        priority: 3,
      })
      setTestStatus(res.status ?? null)
      if (res.ok) showToast?.('success', `Push sent (HTTP ${res.status})`)
      else setError(res.error ?? 'Push failed')
    } catch (e: any) {
      setError(e?.message ?? String(e))
    } finally {
      setBusy(false)
    }
  }, [showToast])

  const toggleEvent = useCallback((ev: string) => {
    setConfig((c) => ({
      ...c,
      allowedEvents: c.allowedEvents.includes(ev)
        ? c.allowedEvents.filter((x) => x !== ev)
        : [...c.allowedEvents, ev],
    }))
  }, [])

  return (
    <NetworkServiceCard
      Icon={Bell}
      title="ntfy.sh push gateway"
      description="Get push notifications on your phone when long-running vault jobs complete (transcode, batch tagger, export, etc.). Free public ntfy.sh works out of the box, or self-host."
      state={state}
      statusLabel={config.topic ? `→ ${config.topic}` : undefined}
      accent="from-orange-500 to-amber-600"
      error={error}
    >
      <div className="grid grid-cols-[1fr_1fr_auto] gap-2 items-end">
        <label className="space-y-1">
          <span className="text-[10px] uppercase tracking-wider text-[var(--muted)]">Server</span>
          <input
            value={config.server}
            onChange={(e) => setConfig({ ...config, server: e.target.value })}
            placeholder="https://ntfy.sh"
            className="w-full px-2 py-1.5 rounded-lg bg-black/30 border border-white/10 text-xs font-mono outline-none focus:border-[var(--primary)]/50"
          />
        </label>
        <label className="space-y-1">
          <span className="text-[10px] uppercase tracking-wider text-[var(--muted)]">Topic</span>
          <input
            value={config.topic}
            onChange={(e) => setConfig({ ...config, topic: e.target.value })}
            placeholder="vault-noah-xyz"
            className="w-full px-2 py-1.5 rounded-lg bg-black/30 border border-white/10 text-xs font-mono outline-none focus:border-[var(--primary)]/50"
          />
        </label>
        <label className="flex items-center gap-1.5 text-[11px] cursor-pointer self-end pb-2">
          <input
            type="checkbox"
            checked={config.enabled}
            onChange={(e) => setConfig({ ...config, enabled: e.target.checked })}
            className="accent-orange-500"
          />
          Enabled
        </label>
      </div>

      <label className="space-y-1 block">
        <span className="text-[10px] uppercase tracking-wider text-[var(--muted)]">
          Auth token (optional — for protected topics)
        </span>
        <input
          type="password"
          value={config.authToken ?? ''}
          onChange={(e) => setConfig({ ...config, authToken: e.target.value })}
          placeholder="(unchanged)"
          className="w-full px-2 py-1.5 rounded-lg bg-black/30 border border-white/10 text-xs font-mono outline-none focus:border-[var(--primary)]/50"
        />
      </label>

      <div className="space-y-1">
        <div className="text-[10px] uppercase tracking-wider text-[var(--muted)]">Events to notify on</div>
        <div className="flex flex-wrap gap-1">
          {NTFY_EVENTS.map((ev) => {
            const active = config.allowedEvents.includes(ev)
            return (
              <button
                key={ev}
                onClick={() => toggleEvent(ev)}
                className={`px-1.5 py-0.5 rounded text-[10px] font-mono border transition ${
                  active
                    ? 'bg-orange-500/20 border-orange-500/30 text-orange-100'
                    : 'bg-white/[0.03] border-white/10 text-zinc-500 hover:text-zinc-300'
                }`}
              >
                {ev}
              </button>
            )
          })}
        </div>
      </div>

      <NetworkActionRow>
        <NetworkPrimaryBtn
          onClick={onSave}
          disabled={busy}
          accent="bg-orange-600/30 hover:bg-orange-600/40 text-orange-100"
        >
          {busy ? <Loader2 size={14} className="animate-spin" /> : null} Save
        </NetworkPrimaryBtn>
        <NetworkGhostBtn onClick={onTest} disabled={busy || !config.enabled || !config.topic}>
          <RefreshCw size={14} /> Test push
        </NetworkGhostBtn>
      </NetworkActionRow>

      {testStatus != null && (
        <div className="text-[10px] text-orange-300">Last push: HTTP {testStatus}</div>
      )}
    </NetworkServiceCard>
  )
}
