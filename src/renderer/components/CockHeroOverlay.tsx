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

import { useCallback, useEffect, useRef, useState, RefObject } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import type { CockHeroBeatmap } from '../utils/cock-hero'
import { SPRINGS } from './network/motion-tokens'

interface CockHeroOverlayProps {
  videoRef: RefObject<HTMLVideoElement | null>
  beatmap: CockHeroBeatmap | null
  active: boolean
  /** When true, play a short synthesized click on every beat. Accent
   *  beats use a higher pitch + slightly louder gain. */
  audioClick?: boolean
}

const HIT_WINDOW_MS = 120
const VISIBLE_AFTER_HIT_MS = 350

export function CockHeroOverlay({ videoRef, beatmap, active, audioClick = false }: CockHeroOverlayProps) {
  const [hits, setHits] = useState<Array<{ id: number; isAccent: boolean; intensity: number }>>([])
  const [stats, setStats] = useState({ hit: 0, miss: 0, combo: 0, bestCombo: 0 })
  const lastBeatIndexRef = useRef<number>(-1)
  const hitIdRef = useRef(0)

  // Shared AudioContext for beat clicks. Lazy-created on first use so
  // we don't trip the "AudioContext was not allowed to start" warning
  // until the user has interacted (they have, by toggling).
  const audioCtxRef = useRef<AudioContext | null>(null)
  const getAudioCtx = useCallback(() => {
    if (!audioCtxRef.current) {
      try {
        const Ctx = window.AudioContext || (window as any).webkitAudioContext
        audioCtxRef.current = new Ctx()
      } catch { return null }
    }
    return audioCtxRef.current
  }, [])
  // Tear down on unmount so we don't leak audio graphs across mounts.
  useEffect(() => () => {
    audioCtxRef.current?.close().catch(() => {})
    audioCtxRef.current = null
  }, [])

  const playClick = useCallback((isAccent: boolean, intensity: number) => {
    const ctx = getAudioCtx()
    if (!ctx) return
    const now = ctx.currentTime
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    // Accent: bright high tick. Normal: lower, more woody tick.
    osc.type = 'triangle'
    osc.frequency.value = isAccent ? 1800 : 1100
    // Quick exponential decay — ~80ms tick.
    const peak = (isAccent ? 0.22 : 0.13) * (0.6 + intensity * 0.4)
    gain.gain.setValueAtTime(0.0001, now)
    gain.gain.exponentialRampToValueAtTime(peak, now + 0.005)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.09)
    osc.connect(gain).connect(ctx.destination)
    osc.start(now)
    osc.stop(now + 0.12)
  }, [getAudioCtx])

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
          if (audioClick) playClick(b.isAccent, b.intensity)
          // Haptic bus dispatch — any active Intiface connection picks
          // this up via the vault:haptic-pulse listener in
          // useIntifaceClient. Accent beats get a stronger pulse; the
          // intensity scaler keeps the haptic in line with the beat's
          // detected loudness.
          try {
            const haptic = b.isAccent ? 0.55 + b.intensity * 0.45 : 0.25 + b.intensity * 0.35
            const durMs = b.isAccent ? 220 : 110
            window.dispatchEvent(new CustomEvent('vault:haptic-pulse', {
              detail: { intensity: haptic, durationMs: durMs },
            }))
          } catch { /* SSR / older runtimes — ignore */ }
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
  }, [active, beatmap, videoRef, audioClick, playClick])

  if (!active || !beatmap) return null

  // Most recent accent-hit timestamp drives the screen-edge vignette
  // pulse. Whenever an accent fires we reset the key so the framer
  // animation replays from scratch.
  const lastAccent = hits.filter((h) => h.isAccent).slice(-1)[0]

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

      {/* Accent-only full-frame vignette pulse — fires on downbeats so
          the rhythm is felt at the periphery, not just at the player
          center. Pink, fades quickly to avoid eye fatigue. */}
      <AnimatePresence>
        {lastAccent && (
          <motion.div
            key={lastAccent.id}
            initial={{ opacity: 0.7 }}
            animate={{ opacity: 0 }}
            transition={{ duration: 0.45, ease: 'easeOut' }}
            className="absolute inset-0 pointer-events-none z-10"
            style={{
              background: `radial-gradient(ellipse at center, transparent 40%, rgba(244,114,182,${0.35 + lastAccent.intensity * 0.4}) 100%)`,
              mixBlendMode: 'screen',
            }}
          />
        )}
      </AnimatePresence>

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
