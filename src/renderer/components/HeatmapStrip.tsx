'use memo'
// File: src/renderer/components/HeatmapStrip.tsx
//
// #369 H-145 — Body-part heatmap timeline. Builds a per-bucket
// dominant-class strip across the video duration from
// `tags.heatmap.build`. Renders as a thin horizontal strip at the
// bottom of the player; click any segment to seek there.

import { useState, useEffect, useCallback, RefObject } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { Loader2 } from 'lucide-react'
import { SPRINGS, FADE_SLIDE } from './network/motion-tokens'

interface Bucket {
  timeSec: number
  classes: Record<string, number>
  dominantClass: string | null
  dominantScore: number
}

interface HeatmapData {
  durationSec: number
  bucketSec: number
  buckets: Bucket[]
  classTotals: Record<string, number>
}

const CLASS_COLORS: Record<string, string> = {
  // NudeNet v3 class labels (rough mapping; unknown classes fall through to zinc)
  breasts_exposed: 'rgb(244, 114, 182)',         // pink-400
  breasts_covered: 'rgb(244, 114, 182, 0.4)',
  female_breast_exposed: 'rgb(244, 114, 182)',
  female_breast_covered: 'rgb(244, 114, 182, 0.4)',
  buttocks_exposed: 'rgb(251, 146, 60)',         // orange-400
  buttocks_covered: 'rgb(251, 146, 60, 0.4)',
  ass_exposed: 'rgb(251, 146, 60)',
  female_genitalia_exposed: 'rgb(225, 29, 72)',  // rose-600
  female_genitalia_covered: 'rgb(225, 29, 72, 0.4)',
  male_genitalia_exposed: 'rgb(59, 130, 246)',   // blue-500
  face_female: 'rgb(52, 211, 153)',              // emerald-400
  face_male: 'rgb(52, 211, 153)',
  feet_exposed: 'rgb(217, 70, 239)',             // fuchsia-500
  belly_exposed: 'rgb(250, 204, 21)',            // yellow-400
  armpits_exposed: 'rgb(250, 204, 21)',
}

function colorFor(cls: string | null): string {
  if (!cls) return 'rgb(63, 63, 70)' // zinc-700
  return CLASS_COLORS[cls] ?? 'rgb(82, 82, 91)' // zinc-600
}

export function HeatmapStrip({
  mediaId,
  duration,
  videoRef,
  active,
}: {
  mediaId: string
  duration: number
  videoRef: RefObject<HTMLVideoElement | null>
  active: boolean
}) {
  const [data, setData] = useState<HeatmapData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hoverBucket, setHoverBucket] = useState<Bucket | null>(null)
  // Class filter — when set, buckets that don't have this class as
  // dominant render dimmed. Click a legend chip to focus.
  const [focusClass, setFocusClass] = useState<string | null>(null)

  const build = useCallback(async () => {
    if (!mediaId || duration <= 0) return
    setLoading(true)
    setError(null)
    try {
      const res = await window.api.tags.heatmap.build({
        mediaId,
        durationSec: duration,
        bucketSec: Math.max(1, Math.floor(duration / 120)), // ~120 buckets max
      })
      if (!res.ok || !res.heatmap) throw new Error(res.error ?? 'Heatmap build failed')
      setData(res.heatmap)
    } catch (e: any) {
      setError(e?.message ?? String(e))
    } finally {
      setLoading(false)
    }
  }, [mediaId, duration])

  // Auto-build when activated and not already built
  useEffect(() => {
    if (active && !data && !loading && !error) {
      build()
    }
  }, [active, data, loading, error, build])

  if (!active) return null

  return (
    <AnimatePresence>
      <motion.div
        {...FADE_SLIDE}
        className="absolute bottom-2 left-4 right-4 z-30 pointer-events-auto"
      >
        <div className="rounded-xl bg-black/70 backdrop-blur-md border border-white/10 p-2 space-y-1">
          <div className="flex items-center justify-between text-[9px] uppercase tracking-wider">
            <span className="text-rose-300 flex items-center gap-1">
              {loading && <Loader2 size={9} className="animate-spin" />}
              Body-part heatmap
            </span>
            {data && (
              <span className="text-white/40 tabular-nums">
                {data.buckets.length} buckets · {data.bucketSec}s each
              </span>
            )}
            {error && <span className="text-red-300">{error}</span>}
          </div>

          {data && (
            <div
              className="relative h-3 rounded overflow-hidden flex bg-black/40"
              onMouseLeave={() => setHoverBucket(null)}
            >
              {data.buckets.map((b, i) => {
                const color = colorFor(b.dominantClass)
                let opacity = b.dominantScore > 0 ? 0.55 + b.dominantScore * 0.45 : 0.2
                // When a class focus is active, dim buckets that don't
                // have it as the dominant class so the user can spot
                // the timeline of one specific body part.
                if (focusClass && b.dominantClass !== focusClass) opacity *= 0.15
                return (
                  <motion.button
                    key={i}
                    layout
                    transition={SPRINGS.snappy}
                    onClick={() => {
                      if (videoRef.current) videoRef.current.currentTime = b.timeSec
                    }}
                    onMouseEnter={() => setHoverBucket(b)}
                    className="flex-1 h-full hover:scale-y-150 transition-transform origin-center"
                    style={{ background: color, opacity }}
                    aria-label={`Bucket at ${b.timeSec.toFixed(0)}s`}
                  />
                )
              })}
            </div>
          )}

          {/* Class totals legend (top 4) — click a chip to focus that
              class on the timeline; click again to clear. */}
          {data && (
            <div className="flex items-center gap-2 flex-wrap text-[9px] text-white/60">
              {Object.entries(data.classTotals)
                .sort(([, a], [, b]) => b - a)
                .slice(0, 6)
                .map(([cls, n]) => {
                  const focused = focusClass === cls
                  return (
                    <button
                      key={cls}
                      onClick={() => setFocusClass(focused ? null : cls)}
                      className={`flex items-center gap-1 rounded px-1.5 py-0.5 transition ${focused ? 'bg-white/15 ring-1 ring-white/25' : 'hover:bg-white/5'}`}
                      title={focused ? 'Click to clear filter' : 'Click to focus this class'}
                    >
                      <span
                        className="inline-block size-2 rounded-sm"
                        style={{ background: colorFor(cls) }}
                      />
                      <span className="font-mono">{cls.replace(/_/g, ' ')}</span>
                      <span className="text-white/30 tabular-nums">{n}</span>
                    </button>
                  )
                })}
              {focusClass && (
                <button
                  onClick={() => setFocusClass(null)}
                  className="text-white/40 hover:text-white text-[9px] underline ml-1"
                >
                  clear
                </button>
              )}
            </div>
          )}

          {/* Hovered bucket detail */}
          {hoverBucket && (
            <motion.div
              {...FADE_SLIDE}
              className="text-[10px] text-white/80 flex items-center gap-2 tabular-nums"
            >
              <span className="text-rose-300">{hoverBucket.timeSec.toFixed(1)}s</span>
              <span className="text-white/30">·</span>
              <span>{hoverBucket.dominantClass?.replace(/_/g, ' ') ?? '(none)'}</span>
              <span className="text-white/40">{(hoverBucket.dominantScore * 100).toFixed(0)}%</span>
            </motion.div>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  )
}
