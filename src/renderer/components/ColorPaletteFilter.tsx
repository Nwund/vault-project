'use memo'
// File: src/renderer/components/ColorPaletteFilter.tsx
//
// Discover-by-color filter (#286). Click a curated swatch → vault hits
// window.api.palette.filter(rgb, tolerance, limit) and dispatches a
// `vault:library:colorFilter` CustomEvent with the matching mediaIds.
// LibraryPage listens for the event and intersects with its query.
//
// Also exposes an "Index all" button + onProgress feed for first-run
// palette indexing across the library.

import { useState, useEffect, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { Palette, Loader2, X, Sparkles } from 'lucide-react'
import { SPRINGS, FADE_SLIDE } from './network/motion-tokens'

const CURATED_SWATCHES: Array<{ name: string; rgb: [number, number, number]; tone: string }> = [
  { name: 'Crimson',    rgb: [203, 41, 65],   tone: 'bg-red-500' },
  { name: 'Sunset',     rgb: [240, 138, 75],  tone: 'bg-orange-500' },
  { name: 'Amber',      rgb: [240, 196, 84],  tone: 'bg-amber-400' },
  { name: 'Olive',      rgb: [134, 142, 70],  tone: 'bg-lime-600' },
  { name: 'Emerald',    rgb: [62, 165, 105],  tone: 'bg-emerald-500' },
  { name: 'Teal',       rgb: [60, 152, 162],  tone: 'bg-teal-500' },
  { name: 'Sky',        rgb: [85, 159, 220],  tone: 'bg-sky-500' },
  { name: 'Indigo',     rgb: [97, 99, 184],   tone: 'bg-indigo-500' },
  { name: 'Violet',     rgb: [142, 92, 204],  tone: 'bg-violet-500' },
  { name: 'Magenta',    rgb: [201, 65, 165],  tone: 'bg-fuchsia-500' },
  { name: 'Pink',       rgb: [232, 134, 170], tone: 'bg-pink-400' },
  { name: 'Beige',      rgb: [220, 196, 158], tone: 'bg-amber-200' },
  { name: 'Mocha',      rgb: [132, 96, 76],   tone: 'bg-amber-800' },
  { name: 'Charcoal',   rgb: [70, 72, 80],    tone: 'bg-zinc-700' },
  { name: 'Snow',       rgb: [232, 232, 232], tone: 'bg-zinc-200' },
  { name: 'Pitch',      rgb: [16, 16, 20],    tone: 'bg-zinc-950' },
]

export interface ColorPaletteFilterEvent {
  rgb: [number, number, number] | null
  mediaIds: string[]
  swatchName: string | null
}

export const COLOR_FILTER_EVENT = 'vault:library:colorFilter'

export function ColorPaletteFilter({ tolerance = 32, limit = 500 }: { tolerance?: number; limit?: number }) {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState<{ name: string; rgb: [number, number, number] } | null>(null)
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [indexing, setIndexing] = useState<{ done: number; total: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const popoverRef = useRef<HTMLDivElement>(null)

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    window.addEventListener('mousedown', onDown)
    return () => window.removeEventListener('mousedown', onDown)
  }, [open])

  // Listen to indexing progress
  useEffect(() => {
    const cleanup = window.api.palette?.onProgress?.((p: { done: number; total: number }) => {
      setIndexing(p)
      if (p.done >= p.total && p.total > 0) {
        setTimeout(() => setIndexing(null), 1500)
      }
    })
    return cleanup
  }, [])

  const dispatchFilter = useCallback((ev: ColorPaletteFilterEvent) => {
    window.dispatchEvent(new CustomEvent<ColorPaletteFilterEvent>(COLOR_FILTER_EVENT, { detail: ev }))
  }, [])

  const onPick = useCallback(async (sw: typeof CURATED_SWATCHES[number]) => {
    setError(null)
    try {
      const ids = await window.api.palette.filter(sw.rgb, tolerance, limit)
      setCounts((c) => ({ ...c, [sw.name]: ids.length }))
      setActive({ name: sw.name, rgb: sw.rgb })
      dispatchFilter({ rgb: sw.rgb, mediaIds: ids, swatchName: sw.name })
    } catch (e: any) {
      setError(e?.message ?? String(e))
    }
  }, [tolerance, limit, dispatchFilter])

  const onClear = useCallback(() => {
    setActive(null)
    dispatchFilter({ rgb: null, mediaIds: [], swatchName: null })
  }, [dispatchFilter])

  const onIndexAll = useCallback(async () => {
    setIndexing({ done: 0, total: 0 })
    setError(null)
    try {
      const res = await window.api.palette.indexAll()
      setIndexing({ done: res.indexed + res.skipped + res.failed, total: res.indexed + res.skipped + res.failed })
      setTimeout(() => setIndexing(null), 1500)
    } catch (e: any) {
      setError(e?.message ?? String(e))
      setIndexing(null)
    }
  }, [])

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border transition-all hover:scale-105 ${
          active
            ? 'bg-fuchsia-500/20 border-fuchsia-500/40 text-fuchsia-200'
            : 'bg-black/20 border-[var(--border)] text-[var(--muted)] hover:text-white'
        }`}
        title="Filter library by dominant color"
      >
        <Palette size={12} />
        <span className="text-[10px] font-medium">
          {active ? active.name : 'Color'}
        </span>
        {active && (
          <span
            className="inline-block size-2.5 rounded-full ring-1 ring-white/30"
            style={{ background: `rgb(${active.rgb.join(',')})` }}
          />
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            ref={popoverRef}
            initial={{ opacity: 0, y: -4, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.96 }}
            transition={SPRINGS.standard}
            className="absolute z-50 top-[calc(100%+8px)] left-0 w-80 rounded-2xl border border-[var(--border)] bg-zinc-950/95 backdrop-blur-xl shadow-2xl shadow-black/40 p-3"
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5 text-xs">
                <Sparkles size={12} className="text-fuchsia-300" />
                <span className="font-semibold">Discover by color</span>
              </div>
              {active && (
                <button
                  onClick={onClear}
                  className="text-[10px] flex items-center gap-1 px-1.5 py-0.5 rounded text-[var(--muted)] hover:text-red-300 hover:bg-red-500/10"
                >
                  <X size={10} /> Clear
                </button>
              )}
            </div>

            <div className="grid grid-cols-8 gap-1.5">
              {CURATED_SWATCHES.map((sw) => {
                const isActive = active?.name === sw.name
                const count = counts[sw.name]
                return (
                  <motion.button
                    key={sw.name}
                    whileHover={{ scale: 1.12, y: -2 }}
                    whileTap={{ scale: 0.92 }}
                    onClick={() => onPick(sw)}
                    title={`${sw.name}${count != null ? ` · ${count} matches` : ''}`}
                    className={`size-8 rounded-lg ring-2 transition-shadow ${
                      isActive ? 'ring-white shadow-lg shadow-white/30' : 'ring-white/10 hover:ring-white/30'
                    }`}
                    style={{ background: `rgb(${sw.rgb.join(',')})` }}
                  >
                    {count != null && (
                      <span className="block text-[9px] font-bold tabular-nums leading-none text-white mix-blend-difference">
                        {count}
                      </span>
                    )}
                  </motion.button>
                )
              })}
            </div>

            <div className="mt-3 pt-3 border-t border-white/5 space-y-2">
              <button
                onClick={onIndexAll}
                disabled={indexing != null}
                className="w-full flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg bg-fuchsia-600/20 hover:bg-fuchsia-600/30 text-fuchsia-100 text-[11px] font-medium transition disabled:opacity-50"
              >
                {indexing ? (
                  <>
                    <Loader2 size={11} className="animate-spin" />
                    Indexing {indexing.done}/{indexing.total || '…'}
                  </>
                ) : (
                  'Index all media palettes'
                )}
              </button>
              {indexing && (
                <div className="h-1 rounded-full bg-white/5 overflow-hidden">
                  <motion.div
                    className="h-full bg-gradient-to-r from-fuchsia-500 to-pink-400"
                    initial={{ width: 0 }}
                    animate={{
                      width: indexing.total > 0
                        ? `${Math.min(100, (indexing.done / indexing.total) * 100)}%`
                        : '20%',
                    }}
                    transition={SPRINGS.soft}
                  />
                </div>
              )}
              <p className="text-[10px] text-[var(--muted)] leading-relaxed">
                Picks 6 dominant swatches per item via node-vibrant. First run
                takes a minute on a large library; result is cached in SQLite.
              </p>
              {error && (
                <motion.div
                  {...FADE_SLIDE}
                  className="text-[10px] text-red-300 px-2 py-1 rounded bg-red-500/10 border border-red-500/20"
                >
                  {error}
                </motion.div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
