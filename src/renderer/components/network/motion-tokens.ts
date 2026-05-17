// Shared spring + easing presets used across the v2.7 integration surfaces
// (network/sharing cards, library overlays, player overlays, sessions tab).
// Centralizing these keeps the animation language consistent — when something
// pops in or out of view it should always feel like the same app.
//
// Import: `import { SPRINGS, EASINGS, FADE_SLIDE } from '../network/motion-tokens'`

import type { Transition } from 'motion/react'

export const SPRINGS = {
  // Snappy — pill nav indicators, status pill flicker
  snappy: { type: 'spring', stiffness: 350, damping: 30 } as Transition,
  // Standard — card expand/collapse, modal entrance
  standard: { type: 'spring', stiffness: 240, damping: 26 } as Transition,
  // Soft — large element layout shifts, page transitions
  soft: { type: 'spring', stiffness: 180, damping: 24 } as Transition,
  // Bouncy — celebratory micro-interactions (status flip to connected)
  bouncy: { type: 'spring', stiffness: 280, damping: 18 } as Transition,
} as const

export const EASINGS = {
  // Standard cubic for non-spring transitions
  standard: [0.22, 0.61, 0.36, 1] as [number, number, number, number],
  // Quick in, slow out — fade-in cues
  emphasized: [0.16, 1, 0.3, 1] as [number, number, number, number],
} as const

export const FADE_SLIDE = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8 },
  transition: { duration: 0.22, ease: EASINGS.standard },
} as const

export const SCALE_IN = {
  initial: { opacity: 0, scale: 0.92 },
  animate: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 0.96 },
  transition: SPRINGS.standard,
} as const

export type ServiceState = 'idle' | 'starting' | 'running' | 'error'

export const STATE_COLORS: Record<ServiceState, { pill: string; dot: string; ring: string }> = {
  idle: {
    pill: 'bg-zinc-700/40 text-zinc-300',
    dot: 'bg-zinc-500',
    ring: 'ring-zinc-500/20',
  },
  starting: {
    pill: 'bg-amber-500/20 text-amber-200',
    dot: 'bg-amber-400 animate-pulse',
    ring: 'ring-amber-400/30',
  },
  running: {
    pill: 'bg-emerald-500/20 text-emerald-200',
    dot: 'bg-emerald-400',
    ring: 'ring-emerald-400/30',
  },
  error: {
    pill: 'bg-red-500/20 text-red-300',
    dot: 'bg-red-400',
    ring: 'ring-red-400/30',
  },
}
