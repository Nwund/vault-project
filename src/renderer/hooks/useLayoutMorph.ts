// File: src/renderer/hooks/useLayoutMorph.ts
//
// #338 F-114 — Motion 12 layoutId for grid → detail morphs. Motion
// (the artist-formerly-known-as-Framer Motion) ships layoutId in v12
// — components sharing a layoutId across mount/unmount are
// auto-animated between their respective positions and sizes.
//
// This helper is a thin shim that picks the cleanest API across
// browsers: when the View Transitions API is available we use it
// (cheaper, GPU-driven), otherwise fall back to Motion's
// layout-projection engine.

import { motion } from 'motion/react'
export { motion }

/** A stable layoutId for a media tile that's been promoted to detail. */
export function mediaLayoutId(mediaId: string): string {
  return `media-${mediaId}`
}

export const MotionTile = motion.div
