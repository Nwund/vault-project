// File: src/renderer/components/FunscriptHeatmap.tsx
//
// Intensity heatmap rendered as a strip beneath / over the seek bar.
// Reads .funscript sidecar via media:loadFunscript IPC; bins the
// per-millisecond pos curve into N buckets and colorizes by intensity
// (green→yellow→red). When no sidecar exists, renders nothing.
//
// Pure renderer; no editor in this pass.

import { useEffect, useState, useMemo } from 'react'

interface FunscriptAction {
  at: number   // milliseconds
  pos: number  // 0-100
}

interface Props {
  mediaId: string
  durationMs: number  // total media duration; from <video>.duration * 1000
  /** Bucket count. Default 200 for a thin horizontal strip. */
  buckets?: number
  className?: string
  /** When provided, the heatmap becomes interactive — each bucket is
   *  clickable and seeks to its midpoint, and hover surfaces a small
   *  tooltip showing the timestamp + intensity %. When omitted, the
   *  strip stays purely decorative (pointer-events-none upstream). */
  onSeek?: (timeMs: number) => void
}

/**
 * Compute per-bucket intensity by sampling consecutive pairs of actions
 * and measuring (delta-pos / delta-time). Cleaner than just averaging
 * pos because it captures how *fast* the movement is, not its absolute
 * position.
 */
function computeIntensity(actions: FunscriptAction[], durationMs: number, buckets: number): Float32Array {
  const bucket = new Float32Array(buckets)
  if (!actions.length || durationMs <= 0) return bucket
  const bucketWidthMs = durationMs / buckets
  for (let i = 1; i < actions.length; i++) {
    const a = actions[i - 1]
    const b = actions[i]
    const dt = Math.max(1, b.at - a.at)
    const dp = Math.abs(b.pos - a.pos)
    const speed = (dp / dt) * 1000  // units per second
    const midMs = (a.at + b.at) / 2
    const idx = Math.min(buckets - 1, Math.max(0, Math.floor(midMs / bucketWidthMs)))
    if (speed > bucket[idx]) bucket[idx] = speed
  }
  // Normalize 0-1 against the 95th percentile so a single spike doesn't
  // wash out the rest of the curve.
  const sorted = Array.from(bucket).sort((a, b) => a - b)
  const p95 = sorted[Math.floor(sorted.length * 0.95)] || 1
  for (let i = 0; i < buckets; i++) {
    bucket[i] = Math.min(1, bucket[i] / p95)
  }
  return bucket
}

function intensityColor(v: number): string {
  // 0 → transparent dark, 0.5 → amber, 1 → red.
  if (v <= 0) return 'rgba(0,0,0,0)'
  if (v < 0.33) return `rgba(74, 222, 128, ${0.4 + v * 1.5})`   // green
  if (v < 0.66) return `rgba(250, 204, 21, ${0.5 + v * 0.8})`   // amber
  return `rgba(248, 113, 113, ${0.6 + v * 0.4})`                 // red
}

export function FunscriptHeatmap({ mediaId, durationMs, buckets = 200, className, onSeek }: Props) {
  const [actions, setActions] = useState<FunscriptAction[] | null>(null)
  const [hover, setHover] = useState<{ bucket: number; intensity: number; timeMs: number } | null>(null)

  useEffect(() => {
    let alive = true
    setActions(null)
    ;(async () => {
      try {
        const r = await window.api.media?.loadFunscript?.(mediaId)
        if (!alive) return
        if (r?.ok && Array.isArray(r.actions)) setActions(r.actions)
        else setActions([])
      } catch {
        if (alive) setActions([])
      }
    })()
    return () => { alive = false }
  }, [mediaId])

  const intensity = useMemo(
    () => (actions && actions.length > 0 ? computeIntensity(actions, durationMs, buckets) : null),
    [actions, durationMs, buckets]
  )

  // Hide completely when no funscript / no usable data — preserves
  // existing seek bar layout for users without Funscript sidecars.
  if (!intensity) return null

  const interactive = !!onSeek
  const bucketWidthMs = durationMs / buckets

  return (
    <div
      className={className}
      title={`Funscript intensity heatmap · ${actions?.length ?? 0} actions${interactive ? ' · click to seek' : ''}`}
      style={{
        display: 'flex',
        gap: 0,
        height: '100%',
        width: '100%',
        position: 'relative',
        // When interactive, the parent must let pointer events through
        // to the buckets themselves — overrides any wrapper opacity-60.
        pointerEvents: interactive ? 'auto' : undefined,
      }}
      onMouseLeave={() => setHover(null)}
    >
      {Array.from(intensity).map((v, i) => {
        const midMs = (i + 0.5) * bucketWidthMs
        return (
          <div
            key={i}
            onMouseEnter={interactive ? () => setHover({ bucket: i, intensity: v, timeMs: midMs }) : undefined}
            onClick={interactive ? (e) => {
              e.stopPropagation()
              onSeek!(midMs)
            } : undefined}
            style={{
              flex: 1,
              background: intensityColor(v),
              minWidth: 0,
              cursor: interactive ? 'pointer' : undefined,
              // Subtle highlight on hover so the user knows the bucket
              // is clickable and which bucket is under the cursor.
              outline: interactive && hover?.bucket === i ? '1px solid rgba(255,255,255,0.6)' : undefined,
              outlineOffset: -1,
            }}
          />
        )
      })}

      {interactive && hover && (
        <div
          style={{
            position: 'absolute',
            // Anchor at the bucket center; clamp so the tooltip stays inside.
            left: `${((hover.bucket + 0.5) / buckets) * 100}%`,
            bottom: '110%',
            transform: 'translateX(-50%)',
            background: 'rgba(0,0,0,0.85)',
            color: 'white',
            padding: '3px 6px',
            fontSize: 10,
            borderRadius: 4,
            border: '1px solid rgba(255,255,255,0.15)',
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
            fontFamily: 'monospace',
          }}
        >
          {formatMs(hover.timeMs)} · {(hover.intensity * 100).toFixed(0)}%
        </div>
      )}
    </div>
  )
}

function formatMs(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '0:00'
  const s = Math.floor(ms / 1000)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const r = s % 60
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${r.toString().padStart(2, '0')}`
  return `${m}:${r.toString().padStart(2, '0')}`
}
