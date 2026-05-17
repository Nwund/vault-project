'use memo'
// File: src/renderer/components/network/CoomerArchiveCard.tsx
//
// #384 H-160 — Coomer/Kemono creator-archive importer. Pulls a creator's
// public archive from coomer.su / kemono.su (the legal alternative to
// scraping live OnlyFans/Patreon etc.) and queues every attachment
// into vault's URL downloader.
//
// UI for `media.coomerArchive.run(...)` — pick a service, paste a
// userId, set a post cap, watch progress per-page.

import { useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { Archive, Loader2, ExternalLink } from 'lucide-react'
import { useToast } from '../../contexts'
import {
  NetworkServiceCard,
  NetworkActionRow,
  NetworkPrimaryBtn,
} from './NetworkServiceCard'
import { FADE_SLIDE, type ServiceState } from './motion-tokens'

type Service =
  | 'onlyfans'
  | 'fansly'
  | 'candfans'
  | 'patreon'
  | 'fanbox'
  | 'gumroad'
  | 'subscribestar'

const SERVICES: Array<{ id: Service; label: string }> = [
  { id: 'onlyfans', label: 'OnlyFans' },
  { id: 'fansly', label: 'Fansly' },
  { id: 'candfans', label: 'CandFans' },
  { id: 'patreon', label: 'Patreon' },
  { id: 'fanbox', label: 'Fanbox' },
  { id: 'gumroad', label: 'Gumroad' },
  { id: 'subscribestar', label: 'SubscribeStar' },
]

const DEFAULT_EXTS = ['mp4', 'mov', 'webm', 'jpg', 'jpeg', 'png', 'webp', 'gif']

export function CoomerArchiveCard() {
  const { showToast } = useToast()
  const [service, setService] = useState<Service>('onlyfans')
  const [userId, setUserId] = useState('')
  const [maxPosts, setMaxPosts] = useState(200)
  const [extInput, setExtInput] = useState(DEFAULT_EXTS.join(','))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{
    postsFetched: number
    attachmentsQueued: number
    pageOffset: number
    done: boolean
  } | null>(null)

  const state: ServiceState = error ? 'error' : busy ? 'starting' : result ? 'running' : 'idle'

  const onRun = useCallback(async () => {
    if (!userId.trim()) return
    setBusy(true)
    setError(null)
    setResult(null)
    try {
      const exts = extInput
        .split(/[,\s]+/)
        .map((s) => s.trim().replace(/^\./, '').toLowerCase())
        .filter(Boolean)
      const res = await window.api.tags.coomerArchive.run({
        service,
        userId: userId.trim(),
        maxPosts,
        mediaExtensions: exts.length > 0 ? exts : undefined,
      })
      if (!res.ok) throw new Error(res.error ?? 'Archive run failed')
      setResult(res.result ?? null)
      if (res.result) {
        showToast?.(
          'success',
          `Queued ${res.result.attachmentsQueued} attachment${res.result.attachmentsQueued === 1 ? '' : 's'} (${res.result.postsFetched} posts)`,
        )
      }
    } catch (e: any) {
      setError(e?.message ?? String(e))
    } finally {
      setBusy(false)
    }
  }, [service, userId, maxPosts, extInput, showToast])

  return (
    <NetworkServiceCard
      Icon={Archive}
      title="Coomer / Kemono archive importer"
      description="Bulk-import a creator's public archive from coomer.su / kemono.su (the legal mirror). Attachments queue through Vault's URL downloader."
      state={state}
      statusLabel={result ? `${result.attachmentsQueued} queued` : undefined}
      accent="from-orange-600 to-red-600"
      error={error}
    >
      <div className="grid grid-cols-[1fr_2fr] gap-2">
        <label className="space-y-1">
          <span className="text-[10px] uppercase tracking-wider text-[var(--muted)]">Service</span>
          <select
            value={service}
            onChange={(e) => setService(e.target.value as Service)}
            className="w-full px-2 py-1.5 rounded-lg bg-black/30 border border-white/10 text-xs outline-none focus:border-[var(--primary)]/50"
          >
            {SERVICES.map((s) => (
              <option key={s.id} value={s.id}>{s.label}</option>
            ))}
          </select>
        </label>
        <label className="space-y-1">
          <span className="text-[10px] uppercase tracking-wider text-[var(--muted)]">User ID / handle</span>
          <input
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            placeholder="numeric id or handle"
            className="w-full px-2 py-1.5 rounded-lg bg-black/30 border border-white/10 text-xs font-mono outline-none focus:border-[var(--primary)]/50"
          />
        </label>
      </div>

      <div className="grid grid-cols-[120px_1fr] gap-2">
        <label className="space-y-1">
          <span className="text-[10px] uppercase tracking-wider text-[var(--muted)]">Max posts</span>
          <input
            type="number"
            min={1}
            max={10000}
            value={maxPosts}
            onChange={(e) => setMaxPosts(Math.max(1, Number(e.target.value) || 1))}
            className="w-full px-2 py-1.5 rounded-lg bg-black/30 border border-white/10 text-xs font-mono outline-none focus:border-[var(--primary)]/50"
          />
        </label>
        <label className="space-y-1">
          <span className="text-[10px] uppercase tracking-wider text-[var(--muted)]">
            Media extensions (comma-separated)
          </span>
          <input
            value={extInput}
            onChange={(e) => setExtInput(e.target.value)}
            placeholder={DEFAULT_EXTS.join(',')}
            className="w-full px-2 py-1.5 rounded-lg bg-black/30 border border-white/10 text-xs font-mono outline-none focus:border-[var(--primary)]/50"
          />
        </label>
      </div>

      <NetworkActionRow>
        <NetworkPrimaryBtn
          onClick={onRun}
          disabled={busy || !userId.trim()}
          accent="bg-orange-600/30 hover:bg-orange-600/40 text-orange-100"
        >
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Archive size={14} />}
          {busy ? 'Fetching…' : 'Run import'}
        </NetworkPrimaryBtn>
      </NetworkActionRow>

      <AnimatePresence>
        {result && (
          <motion.div
            {...FADE_SLIDE}
            className="rounded-2xl bg-orange-500/10 border border-orange-500/20 p-3 space-y-1"
          >
            <div className="text-xs font-medium text-orange-200">
              {result.done ? 'Archive complete' : 'Stopped at page offset'}
            </div>
            <div className="text-[11px] text-orange-100 tabular-nums">
              {result.postsFetched} posts · {result.attachmentsQueued} attachments queued
              {!result.done && ` · resume from offset ${result.pageOffset}`}
            </div>
            <a
              href={`https://coomer.su/${service}/user/${encodeURIComponent(userId)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[10px] text-orange-300 hover:underline inline-flex items-center gap-0.5"
            >
              View archive on coomer.su <ExternalLink size={9} />
            </a>
          </motion.div>
        )}
      </AnimatePresence>

      <p className="text-[10px] text-[var(--muted)] leading-relaxed">
        Coomer/Kemono only mirror content publicly posted via creator's public RSS feeds — no
        DRM bypass and no paywall scraping. Items go to Vault's URL downloader queue.
      </p>
    </NetworkServiceCard>
  )
}
