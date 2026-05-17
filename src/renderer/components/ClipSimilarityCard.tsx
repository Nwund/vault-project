'use memo'
// File: src/renderer/components/ClipSimilarityCard.tsx
//
// #230 A-06 — CLIP visual-similarity "more like this". Pick a media
// row from the library by typing a media-id, fetch top-N nearest
// neighbors by CLIP cosine distance.
//
// UI surface for the `media.clipSimilarity.findByMedia` IPC bridge
// that had no consumer.

import { useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { Sparkles, Loader2, ImagePlus } from 'lucide-react'
import { SPRINGS, FADE_SLIDE } from './network/motion-tokens'

interface SimilarItem {
  mediaId: string
  filename: string
  thumbPath: string | null
  durationSec: number | null
  similarity: number
}

export function ClipSimilarityCard({ onToast }: { onToast?: (type: 'success' | 'error' | 'info', msg: string) => void }) {
  const [seedId, setSeedId] = useState('')
  const [limit, setLimit] = useState(12)
  const [minSim, setMinSim] = useState(0.55)
  const [items, setItems] = useState<SimilarItem[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const onFind = useCallback(async () => {
    if (!seedId.trim()) return
    setBusy(true)
    setError(null)
    try {
      const res = await window.api.tags.clipSimilarity.findByMedia({
        mediaId: seedId.trim(),
        limit,
        minSimilarity: minSim,
      })
      if (!res.ok) throw new Error(res.error ?? 'Lookup failed')
      setItems(res.items ?? [])
      if ((res.items ?? []).length === 0) onToast?.('info', 'No neighbors above threshold')
    } catch (e: any) {
      setError(e?.message ?? String(e))
    } finally {
      setBusy(false)
    }
  }, [seedId, limit, minSim, onToast])

  return (
    <div className="rounded-2xl bg-black/30 border border-[var(--border)] p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Sparkles size={14} className="text-violet-400" />
        <span className="text-sm font-semibold">Clip similarity (CLIP)</span>
      </div>
      <p className="text-[11px] text-[var(--muted)] leading-relaxed">
        Top-N nearest neighbors by CLIP cosine distance. Useful for "more like this".
      </p>

      <div className="space-y-2">
        <label className="space-y-1 block">
          <span className="text-[10px] uppercase tracking-wider text-[var(--muted)]">Seed media ID</span>
          <input
            value={seedId}
            onChange={(e) => setSeedId(e.target.value)}
            placeholder="paste media ID"
            className="w-full px-2 py-1.5 rounded-lg bg-black/30 border border-white/10 text-xs font-mono outline-none focus:border-[var(--primary)]/50"
          />
        </label>
        <div className="grid grid-cols-2 gap-2 items-end">
          <label className="space-y-1">
            <span className="text-[10px] uppercase tracking-wider text-[var(--muted)]">Limit</span>
            <input
              type="number"
              value={limit}
              onChange={(e) => setLimit(Math.max(1, Number(e.target.value) || 1))}
              className="w-full px-2 py-1.5 rounded-lg bg-black/30 border border-white/10 text-xs font-mono outline-none focus:border-[var(--primary)]/50"
            />
          </label>
          <label className="space-y-1">
            <span className="text-[10px] uppercase tracking-wider text-[var(--muted)]">
              Min similarity <span className="text-zinc-500 normal-case">({minSim.toFixed(2)})</span>
            </span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={minSim}
              onChange={(e) => setMinSim(Number(e.target.value))}
              className="w-full accent-violet-500"
            />
          </label>
        </div>
        <button
          onClick={onFind}
          disabled={busy || !seedId.trim()}
          className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-violet-600/30 hover:bg-violet-600/40 text-violet-100 text-xs transition disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {busy ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
          {busy ? 'Searching…' : 'Find similar'}
        </button>
      </div>

      <AnimatePresence>
        {error && (
          <motion.div {...FADE_SLIDE} className="text-[11px] text-red-300 px-2 py-1.5 rounded bg-red-500/10 border border-red-500/20">
            {error}
          </motion.div>
        )}
        {items.length > 0 && (
          <motion.div
            {...FADE_SLIDE}
            className="grid grid-cols-3 gap-1.5 max-h-72 overflow-y-auto pr-1"
          >
            {items.map((it) => (
              <motion.div
                key={it.mediaId}
                layout
                transition={SPRINGS.snappy}
                className="rounded-lg bg-white/[0.03] border border-white/5 overflow-hidden"
              >
                {it.thumbPath ? (
                  <img
                    src={`vault://thumb/${encodeURIComponent(it.thumbPath)}`}
                    alt=""
                    className="w-full aspect-video object-cover"
                    loading="lazy"
                  />
                ) : (
                  <div className="aspect-video grid place-items-center bg-black/30">
                    <ImagePlus size={20} className="text-white/20" />
                  </div>
                )}
                <div className="px-1.5 py-1">
                  <div className="text-[10px] truncate" title={it.filename}>{it.filename}</div>
                  <div className="text-[9px] text-violet-300 tabular-nums">
                    {(it.similarity * 100).toFixed(1)}%
                  </div>
                </div>
              </motion.div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
