'use memo'
// File: src/renderer/components/DupTriageModal.tsx
//
// #349/#354 — Duplicate triage. Pulls the next pending duplicate pair
// from the dup_triage queue and shows them side-by-side, swipe to keep
// one or merge or delete-both. Resolves and auto-advances.

import { useState, useEffect, useCallback } from 'react'
import { motion } from 'motion/react'
import {
  X,
  Trash2,
  Check,
  Loader2,
  ArrowLeftRight,
  Layers,
  AlertCircle,
} from 'lucide-react'
import { useToast } from '../contexts'
import { SPRINGS, FADE_SLIDE } from './network/motion-tokens'
import { formatBytes } from '../utils/formatters'
import { ModalShell } from './ModalShell'

interface MediaPreview {
  id: string
  filename: string
  path: string
  thumbPath: string | null
  type: string
  durationSec: number | null
  sizeBytes: number | null
  width: number | null
  height: number | null
}

interface DupPair {
  a: MediaPreview
  b: MediaPreview
}

export function DupTriageModal({ open, onClose }: { open: boolean; onClose: () => void }) {

  const { showToast } = useToast()
  const [pair, setPair] = useState<DupPair | null>(null)
  const [pending, setPending] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchNext = useCallback(async () => {
    setBusy(true)
    setError(null)
    try {
      const res = await window.api.tags.dupTriage.nextPair()
      if (!res.ok) throw new Error(res.error ?? 'nextPair failed')
      setPair(res.pair ?? null)
      setPending(res.totalPending ?? 0)
    } catch (e: any) {
      setError(e?.message ?? String(e))
    } finally {
      setBusy(false)
    }
  }, [])

  useEffect(() => { if (open) fetchNext() }, [open, fetchNext])

  const resolve = useCallback(async (action: 'keep_a' | 'keep_b' | 'keep_both' | 'delete_both') => {
    if (!pair) return
    setBusy(true)
    try {
      const res = await window.api.tags.dupTriage.resolve({
        aId: pair.a.id,
        bId: pair.b.id,
        action,
      })
      if (!res.ok) {
        setError(res.error ?? 'Resolve failed')
        return
      }
      // Cohesion glue: after picking a survivor, kick the survivor into
      // the AI re-tag queue. It's now the canonical version of that
      // content; its tags may have been generated against the loser's
      // frames. Best-effort — failure here doesn't undo the triage.
      const survivorId =
        action === 'keep_a' ? pair.a.id
        : action === 'keep_b' ? pair.b.id
        : null
      if (survivorId) {
        try { await window.api.ai.reanalyzeBatch([survivorId]) } catch { /* ignore */ }
      }
      showToast?.('success',
        action === 'keep_a' ? `Kept ${pair.a.filename} · queued for re-tag`
        : action === 'keep_b' ? `Kept ${pair.b.filename} · queued for re-tag`
        : action === 'keep_both' ? 'Marked as different'
        : 'Both deleted',
      )
      await fetchNext()
    } catch (e: any) {
      setError(e?.message ?? String(e))
    } finally {
      setBusy(false)
    }
  }, [pair, fetchNext, showToast])

  return (
    <ModalShell open={open} onClose={onClose} maxWidth="5xl">
          <div className="flex flex-col h-full">
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/5 bg-gradient-to-r from-amber-500/10 via-orange-500/10 to-transparent">
              <div className="flex items-center gap-3">
                <div className="size-9 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 grid place-items-center shadow-lg shadow-black/40">
                  <Layers size={16} className="text-white" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold">Duplicate triage</h2>
                  <p className="text-[11px] text-[var(--muted)]">
                    {pending > 0 ? `${pending} pair${pending === 1 ? '' : 's'} pending` : 'Queue empty'}
                  </p>
                </div>
              </div>
              <button onClick={onClose} aria-label="Close" className="p-1.5 rounded-lg hover:bg-white/10 transition">
                <X size={16} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5">
              {error && (
                <motion.div
                  {...FADE_SLIDE}
                  className="rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2 mb-4 flex items-center gap-2 text-[11px] text-red-200"
                >
                  <AlertCircle size={12} />
                  {error}
                </motion.div>
              )}

              {busy && !pair ? (
                <div className="grid place-items-center py-20 text-[var(--muted)]">
                  <Loader2 className="animate-spin mb-2" />
                  <span className="text-xs">Loading next pair…</span>
                </div>
              ) : !pair ? (
                <div className="grid place-items-center py-20 text-center">
                  <Check size={32} className="text-emerald-400 mb-2" />
                  <span className="text-sm">No more duplicate pairs in queue.</span>
                  <span className="text-[11px] text-[var(--muted)] mt-1">
                    The dup-triage scanner finds new candidates as you add media.
                  </span>
                </div>
              ) : (
                <div className="grid grid-cols-[1fr_auto_1fr] gap-4 items-stretch">
                  <DupTile media={pair.a} accent="left" />
                  <div className="grid place-items-center px-2">
                    <ArrowLeftRight size={24} className="text-amber-400" />
                  </div>
                  <DupTile media={pair.b} accent="right" />
                </div>
              )}
            </div>

            {pair && (
              <div className="px-5 py-3 border-t border-white/5 bg-black/30 flex items-center justify-center gap-2 flex-wrap">
                <button
                  onClick={() => resolve('keep_a')}
                  disabled={busy}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-600/30 hover:bg-emerald-600/40 text-emerald-100 text-sm transition disabled:opacity-50"
                >
                  <Check size={13} /> Keep <strong className="font-mono text-[11px]">A</strong>
                </button>
                <button
                  onClick={() => resolve('keep_b')}
                  disabled={busy}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-600/30 hover:bg-emerald-600/40 text-emerald-100 text-sm transition disabled:opacity-50"
                >
                  <Check size={13} /> Keep <strong className="font-mono text-[11px]">B</strong>
                </button>
                <button
                  onClick={() => resolve('keep_both')}
                  disabled={busy}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-zinc-200 text-sm transition disabled:opacity-50"
                >
                  Not duplicates · keep both
                </button>
                <button
                  onClick={() => resolve('delete_both')}
                  disabled={busy}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-red-600/20 hover:bg-red-600/30 text-red-200 text-sm transition disabled:opacity-50"
                >
                  <Trash2 size={13} /> Delete both
                </button>
                <button
                  onClick={() => fetchNext()}
                  disabled={busy}
                  className="ml-auto text-[11px] text-[var(--muted)] hover:text-white"
                >
                  Skip → next
                </button>
              </div>
            )}
          </div>
    </ModalShell>
  )
}

function DupTile({ media, accent }: { media: MediaPreview; accent: 'left' | 'right' }) {
  const tone = accent === 'left' ? 'border-amber-500/30 bg-amber-500/5' : 'border-orange-500/30 bg-orange-500/5'
  const label = accent === 'left' ? 'A' : 'B'
  return (
    <motion.div
      layout
      transition={SPRINGS.standard}
      className={`rounded-2xl border ${tone} overflow-hidden flex flex-col`}
    >
      <div className="relative aspect-video bg-black/50">
        {media.thumbPath ? (
          <img
            src={`vault://thumb/${encodeURIComponent(media.thumbPath)}`}
            alt={media.filename}
            className="w-full h-full object-contain"
          />
        ) : (
          <div className="absolute inset-0 grid place-items-center text-white/30">No thumb</div>
        )}
        <div className="absolute top-2 left-2 size-7 rounded-full bg-black/60 backdrop-blur-md grid place-items-center text-sm font-bold text-amber-300">
          {label}
        </div>
      </div>
      <div className="p-3 space-y-1">
        <div className="text-sm truncate font-medium" title={media.filename}>{media.filename}</div>
        <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-[var(--muted)] tabular-nums">
          <span>{media.type}</span>
          {media.width && media.height && <span>{media.width}×{media.height}</span>}
          {media.durationSec != null && <span>{media.durationSec.toFixed(1)}s</span>}
          {media.sizeBytes != null && <span>{formatBytes(media.sizeBytes)}</span>}
        </div>
        <code className="block text-[9px] text-[var(--muted)] truncate font-mono" title={media.path}>
          {media.path}
        </code>
      </div>
    </motion.div>
  )
}
