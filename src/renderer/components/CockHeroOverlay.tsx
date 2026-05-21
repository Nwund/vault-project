'use memo'
// File: src/renderer/components/CockHeroOverlay.tsx
//
// #352 G-128 — Cock-Hero beat overlay. Reads a CockHeroBeatmap, tracks
// the host video's currentTime, and pulses a marker for each beat
// firing within a ±100ms window. Accent beats render larger with a
// hotter color.
//
// Renders as a transparent layer over the FloatingVideoPlayer. Beat
// generation happens on demand (analyzes audio via OfflineAudioContext).

import { useEffect, useRef, useState, RefObject } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import type { CockHeroBeatmap } from '../utils/cock-hero'
import { SPRINGS } from './network/motion-tokens'

interface CockHeroOverlayProps {
  videoRef: RefObject<HTMLVideoElement | null>
  beatmap: CockHeroBeatmap | null
  active: boolean
}

const HIT_WINDOW_MS = 120
const VISIBLE_AFTER_HIT_MS = 350

export function CockHeroOverlay({ videoRef, beatmap, active }: CockHeroOverlayProps) {
  const [hits, setHits] = useState<Array<{ id: number; isAccent: boolean; intensity: number }>>([])
  const [stats, setStats] = useState({ hit: 0, miss: 0, combo: 0, bestCombo: 0 })
  const lastBeatIndexRef = useRef<number>(-1)
  const hitIdRef = useRef(0)

  // Reset on beatmap change / toggle
  useEffect(() => {
    setHits([])
    setStats({ hit: 0, miss: 0, combo: 0, bestCombo: 0 })
    lastBeatIndexRef.current = -1
  }, [beatmap, active])

  // Tick: poll currentTime every animationFrame while active
  useEffect(() => {
    if (!active || !beatmap || !videoRef.current) return
    let raf: number = 0
    const tick = () => {
      const v = videoRef.current
      if (v && !v.paused) {
        const t = v.currentTime
        // Find next beat at-or-after the last-fired index
        for (let i = lastBeatIndexRef.current + 1; i < beatmap.beats.length; i++) {
          const b = beatmap.beats[i]
          const delta = (t - b.timeSec) * 1000
          if (delta < -HIT_WINDOW_MS) break // not yet
          if (delta > HIT_WINDOW_MS) {
            // Missed this beat — combo resets
            lastBeatIndexRef.current = i
            setStats((prev) => ({ ...prev, miss: prev.miss + 1, combo: 0 }))
            continue
          }
          // Fire!
          lastBeatIndexRef.current = i
          const id = hitIdRef.current++
          setHits((prev) => [...prev, { id, isAccent: b.isAccent, intensity: b.intensity }])
          setStats((prev) => {
            const combo = prev.combo + 1
            return { ...prev, hit: prev.hit + 1, combo, bestCombo: Math.max(prev.bestCombo, combo) }
          })
          setTimeout(() => {
            setHits((prev) => prev.filter((h) => h.id !== id))
          }, VISIBLE_AFTER_HIT_MS)
          break
        }
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [active, beatmap, videoRef])

  if (!active || !beatmap) return null

  return (
    <>
      {/* Pulse rings stack — center of player */}
      <div className="absolute inset-0 pointer-events-none grid place-items-center z-20">
        <AnimatePresence>
          {hits.map((hit) => (
            <motion.div
              key={hit.id}
              initial={{ scale: hit.isAccent ? 0.6 : 0.5, opacity: 0.9 }}
              animate={{ scale: hit.isAccent ? 2.4 : 1.6, opacity: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: VISIBLE_AFTER_HIT_MS / 1000, ease: 'easeOut' }}
              className={`absolute size-32 rounded-full border-4 ${
                hit.isAccent ? 'border-pink-400' : 'border-cyan-300/70'
              }`}
              style={{
                boxShadow: hit.isAccent
                  ? `0 0 32px rgba(244,114,182,${0.4 + hit.intensity * 0.3})`
                  : `0 0 16px rgba(103,232,249,${0.25 + hit.intensity * 0.25})`,
              }}
            />
          ))}
        </AnimatePresence>
      </div>

      {/* Top-left HUD — beatmap stats */}
      <motion.div
        initial={{ x: -10, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={SPRINGS.standard}
        className="absolute top-3 left-3 z-30 rounded-xl bg-black/60 backdrop-blur-md border border-white/10 px-2.5 py-1.5 text-[10px] flex items-center gap-2 pointer-events-none"
      >
        <span className="text-pink-300 font-bold tabular-nums">{beatmap.bpm}</span>
        <span className="text-white/40">BPM</span>
        <span className="text-white/30">·</span>
        <span className="text-cyan-300 tabular-nums">{beatmap.beats.length}</span>
        <span className="text-white/40">beats</span>
        <span className="text-white/30">·</span>
        <span
          className={`uppercase tracking-wider text-[9px] font-medium ${
            beatmap.patternSummary.intensityArc === 'rising' ? 'text-emerald-300'
            : beatmap.patternSummary.intensityArc === 'falling' ? 'text-amber-300'
            : 'text-white/60'
          }`}
        >
          {beatmap.patternSummary.intensityArc}
        </span>
      </motion.div>

      {/* Top-right HUD — live combo + hit/miss counter */}
      {(stats.hit > 0 || stats.miss > 0) && (
        <motion.div
          initial={{ x: 10, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={SPRINGS.standard}
          className="absolute top-3 right-3 z-30 rounded-xl bg-black/60 backdrop-blur-md border border-white/10 px-2.5 py-1.5 text-[10px] flex items-center gap-2 pointer-events-none tabular-nums"
        >
          <span className="text-emerald-300">{stats.hit}</span>
          <span className="text-white/40">hit</span>
          <span className="text-white/30">·</span>
          <span className="text-red-300">{stats.miss}</span>
          <span className="text-white/40">miss</span>
          {stats.combo > 1 && (
            <>
              <span className="text-white/30">·</span>
              <span className="text-amber-300 font-bold">{stats.combo}×</span>
            </>
          )}
          {stats.bestCombo > 3 && stats.bestCombo > stats.combo && (
            <>
              <span className="text-white/30">·</span>
              <span className="text-white/50 text-[9px]">best {stats.bestCombo}</span>
            </>
          )}
        </motion.div>
      )}
    </>
  )
}
