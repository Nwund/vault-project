// File: src/renderer/components/TrashPanel.tsx
//
// Persistent recycle bin viewer. Lists everything in media_trash
// (the cross-session 30-day-retention trash table) and lets the user
// restore individual items, purge individual items, or empty the
// trash entirely.
//
// Independent from the in-memory undo stack that powers Ctrl+Z —
// that's instant-undo for the most-recent delete; this panel is the
// "I deleted that 5 days ago, get it back" affordance.

import { useEffect, useState, useCallback, useMemo } from 'react'
import { Trash2, RotateCcw, X, AlertTriangle, Loader2, Calendar, FileText } from 'lucide-react'
import { toFileUrlCached } from '../hooks/usePerformance'
import { formatBytes, formatDuration } from '../utils/formatters'

interface TrashItem {
  id: string
  original_path: string
  filename: string
  type: string
  size_bytes: number | null
  duration_sec: number | null
  thumb_path: string | null
  deleted_at: number  // unix seconds
  purge_at: number    // unix seconds
}

interface ResolvedTrashItem extends TrashItem {
  resolvedThumbUrl: string | null
}

interface Props {
  isOpen: boolean
  onClose: () => void
  showToast?: (kind: 'success' | 'error' | 'info', msg: string) => void
}

function relativeTimeFromSec(sec: number): string {
  const ms = sec * 1000
  const diff = Date.now() - ms
  const mins = Math.floor(diff / 60_000)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 30) return `${days}d ago`
  return new Date(ms).toLocaleDateString()
}

function daysUntil(sec: number): number {
  return Math.max(0, Math.ceil((sec * 1000 - Date.now()) / (24 * 60 * 60 * 1000)))
}

export function TrashPanel({ isOpen, onClose, showToast }: Props) {
  const [items, setItems] = useState<ResolvedTrashItem[] | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [confirmEmpty, setConfirmEmpty] = useState(false)

  const load = useCallback(async () => {
    setItems(null)
    try {
      const r = await (window.api as any).media?.trashList?.()
      if (!r?.ok) {
        setItems([])
        return
      }
      const arr = (r.items ?? []) as TrashItem[]
      const resolved = await Promise.all(
        arr.map(async (it): Promise<ResolvedTrashItem> => ({
          ...it,
          resolvedThumbUrl: it.thumb_path
            ? await toFileUrlCached(it.thumb_path).catch(() => null)
            : null,
        }))
      )
      setItems(resolved)
    } catch (err: any) {
      showToast?.('error', err?.message ?? 'Failed to load trash')
      setItems([])
    }
  }, [showToast])

  useEffect(() => {
    if (isOpen) void load()
  }, [isOpen, load])

  const totalSize = useMemo(
    () => (items ?? []).reduce((sum, it) => sum + (it.size_bytes ?? 0), 0),
    [items]
  )

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-[var(--panel)] rounded-xl border border-[var(--border)] max-w-3xl w-full max-h-[85vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Trash2 size={20} className="text-[var(--muted)]" />
            <div>
              <h3 className="font-semibold">Trash</h3>
              <p className="text-[11px] text-[var(--muted)]">
                Items here auto-purge after 30 days. {items && items.length > 0 && (
                  <span>{items.length} item{items.length === 1 ? '' : 's'} · {formatBytes(totalSize)}</span>
                )}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {items && items.length > 0 && !confirmEmpty && (
              <button
                onClick={() => setConfirmEmpty(true)}
                className="text-xs px-3 py-1.5 rounded bg-red-500/20 text-red-400 hover:bg-red-500/30 transition flex items-center gap-1.5"
              >
                <Trash2 size={12} />
                Empty trash
              </button>
            )}
            {confirmEmpty && (
              <div className="flex items-center gap-2 bg-red-500/20 px-2 py-1.5 rounded">
                <AlertTriangle size={12} className="text-red-400" />
                <span className="text-[11px] text-red-300">Permanently delete all?</span>
                <button
                  onClick={async () => {
                    setBusy('all')
                    try {
                      const r = await (window.api as any).media?.trashPurgeAll?.()
                      if (r?.ok) {
                        showToast?.('success', `Emptied ${r.removed ?? 0} item${r.removed === 1 ? '' : 's'}`)
                        await load()
                      } else {
                        showToast?.('error', r?.error ?? 'Empty failed')
                      }
                    } finally {
                      setBusy(null)
                      setConfirmEmpty(false)
                    }
                  }}
                  className="text-[11px] px-2 py-0.5 rounded bg-red-500 text-white"
                >
                  Yes
                </button>
                <button
                  onClick={() => setConfirmEmpty(false)}
                  className="text-[11px] px-2 py-0.5 rounded bg-white/10 text-white"
                >
                  Cancel
                </button>
              </div>
            )}
            <button onClick={onClose} className="p-1.5 rounded hover:bg-white/10">
              <X size={16} />
            </button>
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {items === null && (
            <div className="flex items-center justify-center p-8 text-[var(--muted)] text-sm">
              <Loader2 size={16} className="animate-spin mr-2" /> Loading trash…
            </div>
          )}
          {items && items.length === 0 && (
            <div className="flex flex-col items-center justify-center p-12 text-[var(--muted)]">
              <Trash2 size={48} className="mb-3 opacity-30" />
              <p className="text-sm">Trash is empty.</p>
              <p className="text-[11px] mt-1">Deleted items appear here for 30 days before being purged.</p>
            </div>
          )}
          {items && items.length > 0 && (
            <div className="divide-y divide-white/5">
              {items.map((it) => {
                const days = daysUntil(it.purge_at)
                return (
                  <div key={it.id} className="p-3 flex items-center gap-3 hover:bg-white/[0.02]">
                    <div className="w-20 h-12 flex-shrink-0 rounded overflow-hidden bg-black/40 relative">
                      {it.resolvedThumbUrl ? (
                        <img src={it.resolvedThumbUrl} alt="" className="absolute inset-0 w-full h-full object-cover" loading="lazy" />
                      ) : (
                        <div className="absolute inset-0 flex items-center justify-center text-[var(--muted)]">
                          <FileText size={16} />
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm truncate" title={it.filename}>{it.filename}</div>
                      <div className="text-[11px] text-[var(--muted)] flex items-center gap-2 mt-0.5">
                        <span>{it.type}</span>
                        {it.size_bytes && <span>· {formatBytes(it.size_bytes)}</span>}
                        {it.duration_sec && <span>· {formatDuration(it.duration_sec)}</span>}
                      </div>
                      <div className="text-[10px] text-[var(--muted)] flex items-center gap-2 mt-0.5">
                        <Calendar size={10} />
                        Deleted {relativeTimeFromSec(it.deleted_at)}
                        <span className={days <= 3 ? 'text-amber-400' : ''}>
                          · purges in {days}d
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <button
                        disabled={busy === it.id}
                        onClick={async () => {
                          setBusy(it.id)
                          try {
                            const r = await (window.api as any).media?.trashRestore?.(it.id)
                            if (r?.ok) {
                              showToast?.('success', `Restored ${it.filename}`)
                              await load()
                            } else {
                              showToast?.('error', r?.error ?? 'Restore failed')
                            }
                          } finally {
                            setBusy(null)
                          }
                        }}
                        className="text-[11px] px-2 py-1 rounded bg-[var(--primary)]/20 text-[var(--primary)] hover:bg-[var(--primary)]/30 transition flex items-center gap-1 disabled:opacity-50"
                        title="Restore to library"
                      >
                        <RotateCcw size={11} />
                        Restore
                      </button>
                      <button
                        disabled={busy === it.id}
                        onClick={async () => {
                          setBusy(it.id)
                          try {
                            const r = await (window.api as any).media?.trashPurgeOne?.(it.id)
                            if (r?.ok) {
                              showToast?.('success', `Purged ${it.filename}`)
                              await load()
                            } else {
                              showToast?.('error', r?.error ?? 'Purge failed')
                            }
                          } finally {
                            setBusy(null)
                          }
                        }}
                        className="text-[11px] p-1 rounded hover:bg-red-500/20 text-[var(--muted)] hover:text-red-400 transition disabled:opacity-50"
                        title="Permanently delete"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
