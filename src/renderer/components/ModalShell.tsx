// File: src/renderer/components/ModalShell.tsx
//
// Shared modal shell used by v2.7 modals. Captures the repeated
// "fixed inset-0 backdrop · scale-in card · Esc closes · click-outside
// closes" pattern so future modals don't re-invent it.
//
// Animations come from motion-tokens (FADE_SLIDE for the backdrop,
// SCALE_IN for the card). Esc handling delegates to useEscapeClose.
//
// Usage:
//   <ModalShell open={open} onClose={onClose} maxWidth="2xl">
//     <header>…</header>
//     <main>…</main>
//     <footer>…</footer>
//   </ModalShell>

import React from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { useEscapeClose } from '../hooks/useEscapeClose'
import { FADE_SLIDE, SCALE_IN } from './network/motion-tokens'

const MAX_WIDTH_CLASS: Record<string, string> = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl',
  '2xl': 'max-w-2xl',
  '3xl': 'max-w-3xl',
  '4xl': 'max-w-4xl',
  '5xl': 'max-w-5xl',
}

export interface ModalShellProps {
  open: boolean
  onClose: () => void
  children: React.ReactNode
  /** Tailwind max-width key ('sm' through '5xl'). Default '2xl'. */
  maxWidth?: keyof typeof MAX_WIDTH_CLASS
  /** Override the card height cap. Default 'max-h-[90vh]'. */
  maxHeight?: string
  /** Set to false to disable click-outside-to-close. Default true. */
  closeOnBackdrop?: boolean
  /** z-index for the backdrop. Default 200 (above ContextMenu @ 9999 is `[300]`). */
  zIndex?: number
  /** Extra classes appended to the card. */
  cardClassName?: string
}

export function ModalShell({
  open,
  onClose,
  children,
  maxWidth = '2xl',
  maxHeight = 'max-h-[90vh]',
  closeOnBackdrop = true,
  zIndex = 200,
  cardClassName = '',
}: ModalShellProps) {
  useEscapeClose(open, onClose)

  return (
    <AnimatePresence mode="wait">
      {open && (
        <motion.div
          {...FADE_SLIDE}
          className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
          style={{ zIndex }}
          onClick={closeOnBackdrop ? onClose : undefined}
          role="presentation"
        >
          <motion.div
            {...SCALE_IN}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            className={`w-full ${MAX_WIDTH_CLASS[maxWidth] ?? MAX_WIDTH_CLASS['2xl']} ${maxHeight} bg-zinc-950/95 border border-[var(--border)] rounded-3xl shadow-2xl shadow-black/60 flex flex-col overflow-hidden ${cardClassName}`}
          >
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
