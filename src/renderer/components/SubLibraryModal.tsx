'use memo'
// File: src/renderer/components/SubLibraryModal.tsx
//
// #378 H-154 — Hentai / Anime / Furry / Cartoon sub-library. Pulls
// from the dedicated subLibrary bridge (server-side query that filters
// by classifier output, not just tag string match). Modal grid with
// facet pill picker.

import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { Sparkles, X, Loader2, Film, Image as ImageIcon } from 'lucide-react'
import type { MediaRow } from '../types'
import { useEscapeClose } from '../hooks/useEscapeClose'
import { formatDuration } from '../utils/formatters'
import { SPRINGS, FADE_SLIDE, SCALE_IN } from './network/motion-tokens'

type Facet = 'all' | 'anime' | 'hentai' | 'furry' | 'cartoon'

interface FacetItem {
  id: string
  filename: string
  path: string
  thumbPath: string | null
  type: string
  durationSec: number | null
  addedAt: number
}

const FACETS: Array<{ id: Facet; label: string; tone: string }> = [
  { id: 'all', label: 'All animated', tone: 'from-zinc-500 to-zinc-600' },
  { id: 'hentai', label: 'Hentai', tone: 'from-pink-500 to-rose-600' },
  { id: 'anime', label: 'Anime', tone: 'from-cyan-500 to-blue-600' },
  { id: 'furry', label: 'Furry', tone: 'from-amber-500 to-orange-600' },
  { id: 'cartoon', label: 'Cartoon', tone: 'from-violet-500 to-purple-600' },
]

export function SubLibraryModal({
  open,
  onClose,
  onOpenMedia,
}: {
  open: boolean
  onClose: () => void
  onOpenMedia?: (m: MediaRow) => void
}) {
  useEscapeClose(open, onClose)

  const [facet, setFacet] = useState<Facet>('all')
  const [items, setItems] = useState<FacetItem[]>([])
  const [total, setTotal] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchFacet = useCallback(async () => {
    setBusy(true)
    setError(null)
    try {
      const res = await window.api.tags.subLibrary.hentai({ facet, limit: 200 })
      if (!res.ok) throw new Error(res.error ?? 'Lookup failed')
      setItems(res.items ?? [])
      setTotal(res.total ?? 0)
    } catch (e: any) {
      setError(e?.message ?? String(e))
    } finally {
      setBusy(false)
    }
  }, [facet])

  useEffect(() => { if (open) fetchFacet() }, [open, fetchFacet])

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
            className="w-full max-w-5xl max-h-[90vh] bg-zinc-950/95 border border-[var(--border)] rounded-3xl shadow-2xl shadow-black/60 flex flex-col overflow-hidden"
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/5 bg-gradient-to-r from-pink-500/10 via-violet-500/10 to-transparent">
              <div className="flex items-center gap-3">
                <div className="size-9 rounded-2xl bg-gradient-to-br from-pink-500 to-violet-600 grid place-items-center shadow-lg shadow-black/40">
                  <Sparkles size={16} className="text-white" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold">Animated sub-library</h2>
                  <p className="text-[11px] text-[var(--muted)]">
                    Filter by classifier output (anime/hentai/furry/cartoon)
                  </p>
                </div>
              </div>
              <button onClick={onClose} aria-label="Close" className="p-1.5 rounded-lg hover:bg-white/10 transition">
                <X size={16} />
              </button>
            </div>

            {/* Facet pill nav with layout-id animated indicator */}
            <div className="px-5 py-3 border-b border-white/5">
              <nav className="relative flex items-center gap-1 rounded-2xl bg-black/30 border border-white/5 p-1 backdrop-blur-xl w-fit">
                {FACETS.map((f) => {
                  const active = facet === f.id
                  return (
                    <button
                      key={f.id}
                      onClick={() => setFacet(f.id)}
                      className={`relative z-10 px-3 py-1.5 rounded-xl text-xs font-medium transition-colors ${
                        active ? 'text-white' : 'text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      {active && (
                        <motion.div
                          layoutId="sublibrary-pill"
                          className={`absolute inset-0 rounded-xl bg-gradient-to-br ${f.tone} -z-10 shadow-md`}
                          transition={SPRINGS.standard}
                        />
                      )}
                      {f.label}
                    </button>
                  )
                })}
              </nav>
            </div>

            <div className="flex-1 overflow-y-auto p-5">
              {error && (
                <div className="rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2 mb-4 text-[11px] text-red-200">
                  {error}
                </div>
              )}

              {busy ? (
                <div className="grid place-items-center py-20 text-[var(--muted)]">
                  <Loader2 className="animate-spin mb-2" />
                  <span className="text-xs">Loading {facet}…</span>
                </div>
              ) : items.length === 0 ? (
                <div className="grid place-items-center py-20 text-center">
                  <span className="text-sm">No {facet === 'all' ? 'animated' : facet} items yet.</span>
                  <span className="text-[11px] text-[var(--muted)] mt-1">
                    Items appear here once the animated-content classifier (Tier 1) tags them.
                  </span>
                </div>
              ) : (
                <>
                  <div className="text-[11px] text-[var(--muted)] mb-2 tabular-nums">
                    Showing {items.length} of {total}
                  </div>
                  <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 gap-2">
                    {items.map((m) => (
                      <motion.button
                        key={m.id}
                        layout
                        transition={SPRINGS.snappy}
                        whileHover={{ scale: 1.04, y: -2 }}
                        whileTap={{ scale: 0.96 }}
                        onClick={() => onOpenMedia?.(m as unknown as MediaRow)}
                        className="rounded-xl bg-white/[0.03] border border-white/5 hover:border-white/15 overflow-hidden text-left"
                      >
                        {m.thumbPath ? (
                          <img
                            src={`vault://thumb/${encodeURIComponent(m.thumbPath)}`}
                            alt=""
                            className="w-full aspect-video object-cover"
                            loading="lazy"
                          />
                        ) : (
                          <div className="aspect-video grid place-items-center bg-black/30">
                            {m.type === 'video' ? <Film size={24} className="text-white/20" /> : <ImageIcon size={24} className="text-white/20" />}
                          </div>
                        )}
                        <div className="px-2 py-1.5">
                          <div className="text-[11px] truncate">{m.filename}</div>
                          {m.durationSec != null && (
                            <div className="text-[10px] text-[var(--muted)] tabular-nums">
                              {formatDuration(m.durationSec)}
                            </div>
                          )}
                        </div>
                      </motion.button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
