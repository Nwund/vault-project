'use memo'
// File: src/renderer/components/StackModeOverlay.tsx
//
// #296 D-72 — Stack mode: TikTok-style vertical-swipe pager over the
// current library results. Click a tile → opens that media in the
// existing floating player. Swipe/wheel/arrow keys to advance.
//
// Driven by useStackMode (which handles snap/touch/wheel/threshold);
// this component just provides the visual shell and per-tile content.

import { useEffect } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { X, Heart, Play, ChevronUp, ChevronDown, Film, Image as ImageIcon } from 'lucide-react'
import type { MediaRow } from '../types'
import { formatBytes, formatDuration } from '../utils/formatters'
import { useStackMode } from '../hooks/useStackMode'
import { SPRINGS, FADE_SLIDE } from './network/motion-tokens'

export function StackModeOverlay({
  media,
  initialIndex = 0,
  open,
  onClose,
  onOpenMedia,
}: {
  media: MediaRow[]
  initialIndex?: number
  open: boolean
  onClose: () => void
  onOpenMedia?: (m: MediaRow) => void
}) {
  const { currentIndex, next, prev, jumpTo, pagerProps } = useStackMode({
    count: media.length,
    loop: false,
    onChange: () => {},
  })

  // Sync external initialIndex on open
  useEffect(() => {
    if (open) jumpTo(initialIndex)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialIndex])

  // Keyboard nav while open
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.code === 'ArrowDown' || e.code === 'KeyJ') { e.preventDefault(); next() }
      else if (e.code === 'ArrowUp' || e.code === 'KeyK') { e.preventDefault(); prev() }
      else if (e.code === 'Escape') onClose()
      else if (e.code === 'Enter' && media[currentIndex]) onOpenMedia?.(media[currentIndex])
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, next, prev, onClose, onOpenMedia, currentIndex, media])

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          {...FADE_SLIDE}
          className="fixed inset-0 z-[180] bg-black"
        >
          {/* Pager */}
          <div {...pagerProps} className="absolute inset-0">
            {media.map((m, i) => {
              // v2.7 — eagerly load the active tile + its two neighbors;
              // everything else lazy-loads as it comes into view. This
              // makes single-swipe transitions instant.
              const neighbor = Math.abs(i - currentIndex) <= 1
              return (
                <div
                  key={m.id}
                  className="w-full h-screen flex items-center justify-center"
                  style={{ scrollSnapAlign: 'start' }}
                >
                  <StackTile
                    media={m}
                    active={i === currentIndex}
                    eager={neighbor}
                    onOpen={() => onOpenMedia?.(m)}
                  />
                </div>
              )
            })}
          </div>

          {/* Top bar */}
          <div className="absolute top-0 left-0 right-0 px-4 py-3 flex items-center justify-between bg-gradient-to-b from-black/80 to-transparent z-10">
            <button
              onClick={onClose}
              className="p-2 rounded-xl bg-black/40 hover:bg-black/60 backdrop-blur-md border border-white/10 transition"
              aria-label="Close"
            >
              <X size={18} />
            </button>
            <div className="text-[11px] text-white/60 flex items-center gap-2 px-3 py-1.5 rounded-full bg-black/40 backdrop-blur-md border border-white/10">
              <span className="tabular-nums">{currentIndex + 1} / {media.length}</span>
              <span className="text-white/30">·</span>
              <span>Swipe / wheel / ↑↓ to navigate</span>
            </div>
          </div>

          {/* Right-side nav buttons */}
          <div className="absolute right-4 top-1/2 -translate-y-1/2 z-10 flex flex-col gap-2">
            <motion.button
              whileHover={{ scale: 1.08, y: -2 }}
              whileTap={{ scale: 0.94 }}
              onClick={prev}
              disabled={currentIndex === 0}
              className="size-11 rounded-2xl bg-black/40 hover:bg-black/60 backdrop-blur-md border border-white/10 grid place-items-center transition disabled:opacity-30"
              aria-label="Previous"
            >
              <ChevronUp size={18} />
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.08, y: 2 }}
              whileTap={{ scale: 0.94 }}
              onClick={next}
              disabled={currentIndex >= media.length - 1}
              className="size-11 rounded-2xl bg-black/40 hover:bg-black/60 backdrop-blur-md border border-white/10 grid place-items-center transition disabled:opacity-30"
              aria-label="Next"
            >
              <ChevronDown size={18} />
            </motion.button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function StackTile({
  media,
  active,
  eager,
  onOpen,
}: {
  media: MediaRow
  active: boolean
  eager?: boolean
  onOpen: () => void
}) {
  return (
    <motion.div
      animate={{
        scale: active ? 1 : 0.92,
        opacity: active ? 1 : 0.4,
      }}
      transition={SPRINGS.standard}
      className="relative w-full h-full flex items-center justify-center px-12"
    >
      <div className="relative max-w-3xl w-full aspect-video rounded-3xl overflow-hidden shadow-2xl shadow-black/60 bg-zinc-950 ring-1 ring-white/10">
        {media.thumbPath ? (
          <img
            src={`vault://thumb/${encodeURIComponent(media.thumbPath)}`}
            alt=""
            className="w-full h-full object-cover"
            loading={eager ? 'eager' : 'lazy'}
            fetchPriority={active ? 'high' : eager ? 'auto' : 'low'}
          />
        ) : (
          <div className="absolute inset-0 grid place-items-center bg-zinc-900">
            {media.type === 'video' ? <Film size={64} className="text-white/20" /> : <ImageIcon size={64} className="text-white/20" />}
          </div>
        )}

        {/* Play overlay */}
        <button
          onClick={onOpen}
          className="absolute inset-0 grid place-items-center group hover:bg-black/30 transition"
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0.85 }}
            whileHover={{ scale: 1.1, opacity: 1 }}
            whileTap={{ scale: 0.95 }}
            transition={SPRINGS.bouncy}
            className="size-20 rounded-full bg-white/10 backdrop-blur-md border border-white/20 grid place-items-center group-hover:bg-pink-500/30 group-hover:border-pink-300/60 transition-colors"
          >
            <Play size={32} className="text-white ml-1" />
          </motion.div>
        </button>

        {/* Bottom meta */}
        <div className="absolute bottom-0 left-0 right-0 p-5 bg-gradient-to-t from-black/95 via-black/60 to-transparent">
          <div className="text-sm font-medium text-white truncate" title={media.filename ?? ''}>
            {media.filename ?? media.path.split(/[/\\]/).pop()}
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-[11px] text-white/60">
            <span className="flex items-center gap-1 capitalize">
              {media.type === 'video' ? <Film size={11} /> : <ImageIcon size={11} />}
              {media.type}
            </span>
            {media.durationSec != null && (
              <span className="tabular-nums">{formatDuration(media.durationSec)}</span>
            )}
            {media.sizeBytes != null && (
              <span className="tabular-nums">{formatBytes(media.sizeBytes)}</span>
            )}
            {(media as any).rating != null && (media as any).rating > 0 && (
              <span className="text-amber-300 flex items-center gap-0.5">
                <Heart size={10} fill="currentColor" />
                {(media as any).rating as number}
              </span>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  )
}
