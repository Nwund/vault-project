// File: src/renderer/components/SubscriptionsPanel.tsx
//
// #113 — UI for the #101 saved-subscription poller. Lists the user's
// pinned (source, query) tuples, shows last-run time + any error,
// lets them edit interval / enable / disable / delete, and renders
// the inbox of newly-discovered posts with "save" + "dismiss"
// affordances per item.
//
// Mounts inside the Browse tab as a side panel. Subscribes to the
// vault:changed broadcast so new inbox arrivals from the background
// poller show up without a refresh.

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useConfirm } from './ConfirmDialog'
import {
  Bell, Plus, Trash2, RefreshCw, Pause, Play, Save, X as XIcon,
  AlertTriangle, Clock,
} from 'lucide-react'

interface Subscription {
  id: string
  name: string
  source: string
  query: string
  intervalMinutes: number
  lastRunAt: number | null
  lastError: string | null
  enabled: boolean
  createdAt: number
}

interface InboxItem {
  id: string
  subscriptionId: string
  postId: string
  thumbUrl: string | null
  fullUrl: string | null
  sourcePageUrl: string | null
  discoveredAt: number
  dismissedAt: number | null
  savedAt: number | null
}

interface Props {
  /** Sources the user can choose from when creating a subscription
   *  (passed in so this stays decoupled from Rule34Page's source list). */
  availableSources: Array<{ id: string; label: string }>
  /** Save a single inbox item into the local library. The parent owns
   *  the Save-to-Library route since it already lives in Rule34Page. */
  onSaveToLibrary?: (item: InboxItem) => Promise<void> | void
  className?: string
}

function relTime(ts: number | null): string {
  if (!ts) return 'never'
  const delta = Date.now() - ts
  const m = Math.floor(delta / 60_000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  return `${d}d ago`
}

export function SubscriptionsPanel({ availableSources, onSaveToLibrary, className }: Props) {
  const confirm = useConfirm()
  const [subs, setSubs] = useState<Subscription[]>([])
  const [inbox, setInbox] = useState<InboxItem[]>([])
  const [creating, setCreating] = useState(false)
  const [draftName, setDraftName] = useState('')
  const [draftSource, setDraftSource] = useState(availableSources[0]?.id ?? '')
  const [draftQuery, setDraftQuery] = useState('')
  const [draftInterval, setDraftInterval] = useState(360) // 6h default
  const [busy, setBusy] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    const api: any = (window as any).api
    if (!api?.subscriptionsList) return
    try {
      const [s, i] = await Promise.all([
        api.subscriptionsList(),
        api.subscriptionsInbox({ pendingOnly: true, limit: 100 }),
      ])
      setSubs(s?.items ?? [])
      setInbox(i?.items ?? [])
    } catch { /* network/IPC blip — leave previous state */ }
  }, [])

  useEffect(() => {
    void refresh()
    const api: any = (window as any).api
    const off = api?.events?.onVaultChanged?.(() => { void refresh() })
    return () => { try { off?.() } catch {} }
  }, [refresh])

  const create = useCallback(async () => {
    if (!draftName.trim() || !draftSource || !draftQuery.trim()) return
    setBusy('create')
    try {
      const api: any = (window as any).api
      await api.subscriptionsCreate({
        name: draftName.trim(),
        source: draftSource,
        query: draftQuery.trim(),
        intervalMinutes: draftInterval,
      })
      setDraftName('')
      setDraftQuery('')
      setCreating(false)
      await refresh()
    } finally { setBusy(null) }
  }, [draftName, draftSource, draftQuery, draftInterval, refresh])

  const runNow = useCallback(async (id: string) => {
    setBusy(id)
    try {
      const api: any = (window as any).api
      await api.subscriptionsRunNow(id)
      await refresh()
    } finally { setBusy(null) }
  }, [refresh])

  const toggleEnabled = useCallback(async (s: Subscription) => {
    const api: any = (window as any).api
    await api.subscriptionsUpdate(s.id, { enabled: !s.enabled })
    await refresh()
  }, [refresh])

  const deleteSub = useCallback(async (id: string) => {
    const ok = await confirm({
      title: 'Delete this subscription?',
      body: 'Also deletes all its inbox items.',
      confirmLabel: 'Delete',
      danger: true,
    })
    if (!ok) return
    const api: any = (window as any).api
    await api.subscriptionsDelete(id)
    await refresh()
  }, [confirm, refresh])

  const dismiss = useCallback(async (inboxId: string) => {
    const api: any = (window as any).api
    await api.subscriptionsDismiss(inboxId)
    setInbox((cur) => cur.filter((i) => i.id !== inboxId))
  }, [])

  const save = useCallback(async (item: InboxItem) => {
    if (!onSaveToLibrary) return
    await onSaveToLibrary(item)
    const api: any = (window as any).api
    await api.subscriptionsMarkSaved(item.id)
    setInbox((cur) => cur.filter((i) => i.id !== item.id))
  }, [onSaveToLibrary])

  const groupedInbox = useMemo(() => {
    const map = new Map<string, InboxItem[]>()
    for (const i of inbox) {
      if (!map.has(i.subscriptionId)) map.set(i.subscriptionId, [])
      map.get(i.subscriptionId)!.push(i)
    }
    return map
  }, [inbox])

  return (
    <div className={`rounded-2xl border border-zinc-800 bg-black/30 p-4 ${className ?? ''}`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Bell size={16} className="text-[var(--primary)]" />
          <div className="text-sm font-semibold">Subscriptions</div>
          {inbox.length > 0 && (
            <span className="ml-1 text-[10px] px-1.5 py-0.5 rounded-full bg-[var(--primary)] text-white">
              {inbox.length} new
            </span>
          )}
        </div>
        <button
          onClick={() => setCreating((v) => !v)}
          className="flex items-center gap-1 text-xs px-2 py-1 rounded-md bg-zinc-800 hover:bg-zinc-700 text-zinc-200"
        >
          <Plus size={12} /> New
        </button>
      </div>

      {creating && (
        <div className="mb-4 rounded-lg border border-zinc-800 bg-zinc-900/60 p-3 space-y-2">
          <input
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            placeholder="Name (e.g. 'My favorite artist')"
            className="w-full bg-zinc-900 border border-[var(--border)] rounded px-2 py-1 text-sm"
          />
          <div className="flex gap-2">
            <select
              value={draftSource}
              onChange={(e) => setDraftSource(e.target.value)}
              className="flex-1 bg-zinc-900 border border-[var(--border)] rounded px-2 py-1 text-sm"
            >
              {availableSources.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
            <input
              value={draftQuery}
              onChange={(e) => setDraftQuery(e.target.value)}
              placeholder="tags (e.g. artist_name rating:e)"
              className="flex-[2] bg-zinc-900 border border-[var(--border)] rounded px-2 py-1 text-sm"
            />
          </div>
          <div className="flex items-center gap-2 text-xs text-zinc-400">
            <Clock size={12} />
            <span>Run every</span>
            <input
              type="number"
              min={15}
              value={draftInterval}
              onChange={(e) => setDraftInterval(Math.max(15, Number(e.target.value) || 360))}
              className="w-20 bg-zinc-900 border border-[var(--border)] rounded px-1 py-0.5 text-xs"
            />
            <span>minutes (min 15)</span>
          </div>
          <div className="flex justify-end gap-2">
            <button
              onClick={() => { setCreating(false); setDraftName(''); setDraftQuery('') }}
              className="text-xs px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300"
            >
              Cancel
            </button>
            <button
              onClick={create}
              disabled={busy === 'create' || !draftName.trim() || !draftQuery.trim()}
              className="text-xs px-2 py-1 rounded bg-[var(--primary)] text-white hover:opacity-90 disabled:opacity-40"
            >
              Save subscription
            </button>
          </div>
        </div>
      )}

      {subs.length === 0 && !creating && (
        <div className="text-xs text-zinc-500 py-4 text-center">
          No subscriptions yet. Pin a (source, query) combo to auto-watch for new posts.
        </div>
      )}

      <div className="space-y-3">
        {subs.map((s) => {
          const pending = groupedInbox.get(s.id) ?? []
          return (
            <div key={s.id} className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className={`w-1.5 h-1.5 rounded-full ${s.enabled ? 'bg-emerald-400' : 'bg-zinc-600'}`} />
                    <span className="text-sm font-medium truncate">{s.name}</span>
                    {pending.length > 0 && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[var(--primary)]/30 text-[var(--primary)]">
                        {pending.length} new
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-zinc-400 truncate mt-0.5">
                    {s.source} · {s.query}
                  </div>
                  <div className="text-[10px] text-zinc-500 mt-0.5">
                    Every {s.intervalMinutes}m · last run {relTime(s.lastRunAt)}
                  </div>
                  {s.lastError && (
                    <div className="mt-1 text-[10px] text-amber-400 flex items-center gap-1">
                      <AlertTriangle size={10} />
                      {s.lastError.slice(0, 80)}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => runNow(s.id)}
                    disabled={busy === s.id}
                    className="p-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-white"
                    title="Run now"
                  >
                    <RefreshCw size={12} className={busy === s.id ? 'animate-spin' : ''} />
                  </button>
                  <button
                    onClick={() => toggleEnabled(s)}
                    className="p-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-white"
                    title={s.enabled ? 'Pause' : 'Resume'}
                  >
                    {s.enabled ? <Pause size={12} /> : <Play size={12} />}
                  </button>
                  <button
                    onClick={() => deleteSub(s.id)}
                    className="p-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-red-300"
                    title="Delete"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>

              {pending.length > 0 && (
                <div className="mt-2 -mx-1 px-1 flex gap-1.5 overflow-x-auto">
                  {pending.map((item) => (
                    <div key={item.id} className="relative group flex-shrink-0 w-20">
                      {item.thumbUrl ? (
                        <img
                          src={item.thumbUrl}
                          alt={item.postId}
                          referrerPolicy="no-referrer"
                          className="w-20 h-20 object-cover rounded border border-zinc-800"
                          loading="lazy"
                        />
                      ) : (
                        <div className="w-20 h-20 rounded border border-zinc-800 bg-zinc-900 grid place-items-center text-[10px] text-zinc-600">
                          no thumb
                        </div>
                      )}
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/60 flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100 transition rounded">
                        {onSaveToLibrary && (
                          <button
                            onClick={() => save(item)}
                            className="p-1 rounded bg-[var(--primary)] text-white"
                            title="Save to library"
                          >
                            <Save size={11} />
                          </button>
                        )}
                        <button
                          onClick={() => dismiss(item.id)}
                          className="p-1 rounded bg-zinc-800 text-zinc-200"
                          title="Dismiss"
                        >
                          <XIcon size={11} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
