'use memo'
// Reusable shell for the v2.7 network / sharing service cards under
// Settings → Services. Each specialized card (Iroh, Hyperswarm, Helia,
// Veilid, Tor, etc.) wraps this shell and supplies its own body.
//
// Design contract:
//   - Icon + title + short description on the left of the header.
//   - Status pill on the right that animates color/text on state change.
//   - Body section animates expand/collapse via AnimatePresence.
//   - "Configure" + "Start/Stop" action row at the bottom (optional).
//
// The shell intentionally exposes className passthrough so cards can
// add accent gradients without forking the whole layout.

import { useState, ReactNode, useId } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { ChevronDown, AlertTriangle } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { SPRINGS, FADE_SLIDE, STATE_COLORS, type ServiceState } from './motion-tokens'

export interface NetworkServiceCardProps {
  Icon: LucideIcon
  title: string
  description: string
  state: ServiceState
  statusLabel?: string
  /** Tailwind gradient classes like "from-cyan-500 to-blue-600" applied to the icon tile */
  accent?: string
  /** Initial expansion state; defaults to collapsed when idle, expanded when running/error */
  defaultExpanded?: boolean
  /** Error message shown in a warning box at the top of the body */
  error?: string | null
  /** Body content — kept inside the animated expand area */
  children: ReactNode
}

export function NetworkServiceCard({
  Icon,
  title,
  description,
  state,
  statusLabel,
  accent = 'from-zinc-700 to-zinc-800',
  defaultExpanded,
  error,
  children,
}: NetworkServiceCardProps) {
  const [expanded, setExpanded] = useState(
    defaultExpanded ?? (state === 'running' || state === 'error'),
  )
  const colors = STATE_COLORS[state]
  const bodyId = useId()

  const effectiveStatus = statusLabel
    ?? (state === 'idle' ? 'Idle'
      : state === 'starting' ? 'Starting…'
      : state === 'running' ? 'Running'
      : 'Error')

  return (
    <motion.div
      layout="position"
      transition={SPRINGS.standard}
      className="rounded-3xl border border-[var(--border)] bg-black/20 p-5 mt-4 overflow-hidden"
    >
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        aria-controls={bodyId}
        className="w-full flex items-center justify-between gap-3 group"
      >
        <div className="flex items-center gap-3 text-left">
          <div className={`size-9 rounded-2xl bg-gradient-to-br ${accent} grid place-items-center shadow-md shadow-black/40 ring-1 ${colors.ring}`}>
            <Icon size={16} className="text-white drop-shadow" />
          </div>
          <div>
            <div className="text-sm font-semibold">{title}</div>
            <div className="text-[11px] text-[var(--muted)] mt-0.5 line-clamp-2 max-w-md">
              {description}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <motion.div
            key={state}
            initial={{ scale: 0.85, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={SPRINGS.snappy}
            className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] font-medium ${colors.pill}`}
          >
            <span className={`size-1.5 rounded-full ${colors.dot}`} />
            {effectiveStatus}
          </motion.div>
          <motion.div
            animate={{ rotate: expanded ? 180 : 0 }}
            transition={SPRINGS.snappy}
            className="text-[var(--muted)] group-hover:text-white"
          >
            <ChevronDown size={16} />
          </motion.div>
        </div>
      </button>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            id={bodyId}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.24, ease: [0.22, 0.61, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div className="pt-4 space-y-3">
              {error && (
                <motion.div
                  {...FADE_SLIDE}
                  className="flex items-start gap-2 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/30"
                >
                  <AlertTriangle size={12} className="text-red-400 mt-0.5 flex-shrink-0" />
                  <div className="text-[11px] text-red-200 leading-relaxed">{error}</div>
                </motion.div>
              )}
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

// ─── Action row helper ────────────────────────────────────────────────────

export function NetworkActionRow({ children }: { children: ReactNode }) {
  return <div className="flex items-center gap-2 pt-1">{children}</div>
}

// ─── Button helpers — match Btn but scoped to the card vocabulary ─────────

export function NetworkPrimaryBtn({
  onClick,
  disabled,
  children,
  accent = 'bg-emerald-600/30 hover:bg-emerald-600/40 text-emerald-100',
}: {
  onClick: () => void
  disabled?: boolean
  children: ReactNode
  accent?: string
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex-1 px-3 py-2 rounded-lg ${accent} text-sm transition flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed`}
    >
      {children}
    </button>
  )
}

export function NetworkGhostBtn({
  onClick,
  disabled,
  children,
}: {
  onClick: () => void
  disabled?: boolean
  children: ReactNode
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-[var(--muted)] hover:text-white text-sm transition flex items-center justify-center gap-2 disabled:opacity-40"
    >
      {children}
    </button>
  )
}
