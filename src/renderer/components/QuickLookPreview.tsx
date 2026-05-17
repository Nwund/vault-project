'use memo'
// File: src/renderer/components/QuickLookPreview.tsx
//
// Raycast-style Quick Look (#291). Renders a centered, enlarged preview of
// the currently-focused media tile while Space is held. Closes on release.
//
// Used by LibraryPage — the page tracks the focused tile + Space-hold via
// a document-level key listener, and passes the resolved media row + open
// state in here for display.

import { motion, AnimatePresence } from 'motion/react'
import { Sparkles, Eye, Film, Image as ImageIcon, Clock } from 'lucide-react'
import type { MediaRow } from '../types'
import { formatBytes, formatDuration } from '../utils/formatters'
import { SPRINGS } from './network/motion-tokens'

export function QuickLookPreview({
  open,
  media,
}: {
  open: boolean
  media: MediaRow | null
}) {
  return (
    <AnimatePresence>
      {open && media && (
        <motion.div
          initial={{ opacity: 0, scale: 0.85, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: 10 }}
          transition={SPRINGS.bouncy}
          className="fixed inset-0 z-[150] pointer-events-none flex items-center justify-center"
        >
          {/* Backdrop tint */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="absolute inset-0 bg-black/70 backdrop-blur-md"
          />

          {/* Preview card */}
          <div className="relative z-10 max-w-[64vw] max-h-[80vh] rounded-3xl bg-zinc-950/90 border border-white/10 shadow-2xl shadow-black/60 overflow-hidden flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-white/5 bg-gradient-to-r from-fuchsia-500/10 via-pink-500/10 to-transparent">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Sparkles size={14} className="text-fuchsia-300" />
                Quick Look
              </div>
              <div className="text-[10px] text-white/40 flex items-center gap-1">
                <kbd className="px-1.5 py-0.5 rounded bg-white/10 font-mono">Space</kbd>
                <span>hold to preview · release to close</span>
              </div>
            </div>

            {/* Thumb */}
            <div className="flex-1 bg-black/40 grid place-items-center min-h-[400px]">
              {media.thumbPath ? (
                <img
                  src={`vault://thumb/${encodeURIComponent(media.thumbPath)}`}
                  alt=""
                  className="max-w-full max-h-[60vh] object-contain"
                />
              ) : (
                <div className="size-32 grid place-items-center bg-white/5 rounded-2xl">
                  {media.type === 'video' ? (
                    <Film size={48} className="text-white/30" />
                  ) : (
                    <ImageIcon size={48} className="text-white/30" />
                  )}
                </div>
              )}
            </div>

            {/* Meta */}
            <div className="px-5 py-3 border-t border-white/5 space-y-1.5">
              <div className="text-sm font-medium text-white truncate" title={media.filename ?? ''}>
                {media.filename ?? media.path.split(/[/\\]/).pop()}
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-white/60">
                <span className="flex items-center gap-1">
                  {media.type === 'video' ? <Film size={11} /> : media.type === 'gif' ? <Eye size={11} /> : <ImageIcon size={11} />}
                  {media.type}
                </span>
                {media.durationSec != null && (
                  <span className="flex items-center gap-1 tabular-nums">
                    <Clock size={11} /> {formatDuration(media.durationSec)}
                  </span>
                )}
                {media.sizeBytes != null && (
                  <span className="tabular-nums">{formatBytes(media.sizeBytes)}</span>
                )}
                {(media as any).rating != null && (media as any).rating > 0 && (
                  <span className="text-amber-300">
                    {'★'.repeat((media as any).rating as number)}
                  </span>
                )}
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
