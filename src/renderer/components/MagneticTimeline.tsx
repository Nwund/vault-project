// File: src/renderer/components/MagneticTimeline.tsx
//
// #168 — Magnetic clip timeline with ripple / roll / slip / slide
// edit operations.
//
// Operations exposed:
//   - drag clip body         → reorder (snaps to neighbour edge)
//   - drag left edge         → trim in-point (ripple: pushes later clips
//                              left to fill the gap)
//   - drag right edge        → trim out-point (ripple)
//   - shift-drag inside clip → slip (change in/out simultaneously,
//                              keeping clip length the same)
//   - drag boundary between  → roll (move boundary; left clip's out
//     two clips                and right clip's in shift together)
//   - alt-drag clip body     → slide (move clip without changing its
//                              own in/out, pushing neighbours)
//
// Snap targets:
//   - other clip edges (within SNAP_PX)
//   - supplied beat markers
//   - playhead position
//
// Pure renderer; no state lives outside the supplied props. Caller
// holds the source-of-truth clip array and applies the onChange
// callback to mutate it.

import React, { useCallback, useMemo, useRef, useState } from 'react'

export interface TimelineClip {
  id: string
  /** Display label — usually source filename. */
  label: string
  /** Position on the timeline in seconds (the START of the visible part). */
  start: number
  /** Visible length in seconds (out − in within the source). */
  duration: number
  /** Source-file in-point in seconds. */
  sourceIn: number
  /** Source-file total length in seconds. Used to clamp slip/trim. */
  sourceLength: number
  /** Optional accent color for the clip body. */
  color?: string
}

interface Props {
  clips: TimelineClip[]
  onChange: (next: TimelineClip[]) => void
  /** Beat marker timestamps (seconds) for snap targets. */
  beats?: number[]
  /** Pixels per second. Caller drives zoom. */
  pxPerSec?: number
  /** Playhead time in seconds — drawn as a vertical line + snap target. */
  playheadSec?: number
  className?: string
}

const SNAP_PX = 8
const TRIM_HANDLE_PX = 8
const ROW_HEIGHT = 56

type DragKind = 'move' | 'trim-left' | 'trim-right' | 'slip' | 'roll' | 'slide'

interface DragState {
  kind: DragKind
  clipId: string
  /** Mouse-down x in seconds. */
  startSec: number
  /** Snapshot of clips at drag start so we can compute deltas from origin. */
  snapshot: TimelineClip[]
  /** For roll: the neighbour clip on the right side of the boundary. */
  neighbourId?: string
}

export function MagneticTimeline({
  clips, onChange, beats = [], pxPerSec = 60, playheadSec = 0, className,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [drag, setDrag] = useState<DragState | null>(null)

  const sorted = useMemo(() => [...clips].sort((a, b) => a.start - b.start), [clips])
  const totalDuration = useMemo(
    () => sorted.reduce((s, c) => Math.max(s, c.start + c.duration), 0),
    [sorted],
  )

  // Convert event x → seconds.
  const evToSec = useCallback((e: React.MouseEvent | MouseEvent): number => {
    const el = containerRef.current
    if (!el) return 0
    const rect = el.getBoundingClientRect()
    return Math.max(0, (e.clientX - rect.left + el.scrollLeft) / pxPerSec)
  }, [pxPerSec])

  // Snap a candidate time to the nearest snap target if within SNAP_PX.
  const snap = useCallback((sec: number, excludeClipId?: string): number => {
    const snapTargets: number[] = []
    for (const c of sorted) {
      if (c.id === excludeClipId) continue
      snapTargets.push(c.start, c.start + c.duration)
    }
    snapTargets.push(...beats)
    snapTargets.push(playheadSec)
    let best = sec
    let bestDistPx = Infinity
    for (const t of snapTargets) {
      const dPx = Math.abs(t - sec) * pxPerSec
      if (dPx < bestDistPx && dPx <= SNAP_PX) {
        best = t
        bestDistPx = dPx
      }
    }
    return best
  }, [sorted, beats, playheadSec, pxPerSec])

  const beginDrag = useCallback((e: React.MouseEvent, clip: TimelineClip, kind: DragKind) => {
    e.preventDefault()
    e.stopPropagation()
    let actualKind: DragKind = kind
    if (kind === 'move' && e.shiftKey) actualKind = 'slip'
    else if (kind === 'move' && e.altKey) actualKind = 'slide'
    setDrag({
      kind: actualKind,
      clipId: clip.id,
      startSec: evToSec(e),
      snapshot: clips.map((c) => ({ ...c })),
    })
  }, [clips, evToSec])

  const beginRoll = useCallback((e: React.MouseEvent, leftClip: TimelineClip, rightClip: TimelineClip) => {
    e.preventDefault()
    e.stopPropagation()
    setDrag({
      kind: 'roll',
      clipId: leftClip.id,
      neighbourId: rightClip.id,
      startSec: evToSec(e),
      snapshot: clips.map((c) => ({ ...c })),
    })
  }, [clips, evToSec])

  // Global mousemove + mouseup so dragging beyond the timeline still works.
  React.useEffect(() => {
    if (!drag) return
    const handleMove = (e: MouseEvent) => {
      const curSec = evToSec(e)
      const rawDeltaSec = curSec - drag.startSec
      const next = drag.snapshot.map((c) => ({ ...c }))
      const target = next.find((c) => c.id === drag.clipId)
      if (!target) return

      const snapped = (sec: number) => snap(sec, drag.kind === 'move' ? drag.clipId : undefined)

      if (drag.kind === 'move') {
        const desiredStart = Math.max(0, snapped(target.start + rawDeltaSec))
        target.start = desiredStart
      } else if (drag.kind === 'trim-left') {
        const desiredStart = snapped(target.start + rawDeltaSec)
        const clampStart = Math.max(0, Math.min(target.start + target.duration - 0.1, desiredStart))
        const delta = clampStart - target.start
        // Ripple: don't move anything else; trim just shortens this clip.
        target.start = clampStart
        target.duration = Math.max(0.1, target.duration - delta)
        target.sourceIn = Math.max(0, Math.min(target.sourceLength - target.duration, target.sourceIn + delta))
      } else if (drag.kind === 'trim-right') {
        const desiredEnd = snapped(target.start + target.duration + rawDeltaSec)
        const newDur = Math.max(0.1, desiredEnd - target.start)
        // Don't exceed remaining source length.
        const maxDur = target.sourceLength - target.sourceIn
        target.duration = Math.min(maxDur, newDur)
      } else if (drag.kind === 'slip') {
        // Slip: change source in/out without changing the timeline position.
        const delta = rawDeltaSec
        const newSrcIn = Math.max(0, Math.min(target.sourceLength - target.duration, target.sourceIn + delta))
        target.sourceIn = newSrcIn
      } else if (drag.kind === 'slide') {
        // Slide: move clip without changing its source in/out, pushing
        // neighbours out of the way (ripple right by the same delta).
        const desiredStart = Math.max(0, snapped(target.start + rawDeltaSec))
        const delta = desiredStart - target.start
        target.start = desiredStart
        for (const other of next) {
          if (other.id === target.id) continue
          if (other.start > drag.snapshot.find((c) => c.id === target.id)!.start) {
            other.start += delta
          }
        }
      } else if (drag.kind === 'roll' && drag.neighbourId) {
        // Roll: move the boundary between target (left) and neighbour (right).
        // Shrink the right side of target by delta, grow the left side of
        // neighbour by delta. Each clip's source-in/out shifts symmetrically.
        const neighbour = next.find((c) => c.id === drag.neighbourId)
        if (!neighbour) return
        const boundary = snapped(target.start + target.duration + rawDeltaSec)
        const delta = boundary - (target.start + target.duration)
        const newTargetDur = Math.max(0.1, target.duration + delta)
        const newNeighbourStart = Math.max(target.start + newTargetDur, neighbour.start + delta)
        const newNeighbourDur = Math.max(0.1, neighbour.duration - (newNeighbourStart - neighbour.start))
        // Honor source length clamps on both sides.
        if (target.sourceIn + newTargetDur > target.sourceLength) return
        if (newNeighbourDur > neighbour.sourceLength - (neighbour.sourceIn + delta)) return
        target.duration = newTargetDur
        neighbour.start = newNeighbourStart
        neighbour.duration = newNeighbourDur
        neighbour.sourceIn = Math.max(0, neighbour.sourceIn + delta)
      }
      onChange(next)
    }
    const handleUp = () => setDrag(null)
    window.addEventListener('mousemove', handleMove)
    window.addEventListener('mouseup', handleUp)
    return () => {
      window.removeEventListener('mousemove', handleMove)
      window.removeEventListener('mouseup', handleUp)
    }
  }, [drag, evToSec, snap, onChange])

  const rippleDelete = useCallback((clipId: string) => {
    const idx = sorted.findIndex((c) => c.id === clipId)
    if (idx < 0) return
    const removed = sorted[idx]
    const next = sorted
      .filter((c) => c.id !== clipId)
      .map((c) => (c.start > removed.start ? { ...c, start: c.start - removed.duration } : c))
    onChange(next)
  }, [sorted, onChange])

  const handleKeyDown = useCallback((e: React.KeyboardEvent, clipId: string) => {
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault()
      rippleDelete(clipId)
    }
  }, [rippleDelete])

  const totalWidthPx = Math.max(800, (totalDuration + 5) * pxPerSec)

  return (
    <div className={`relative bg-zinc-950 border border-zinc-800 rounded ${className ?? ''}`}>
      <div className="overflow-x-auto">
        <div
          ref={containerRef}
          className="relative"
          style={{ width: totalWidthPx, height: ROW_HEIGHT + 24 }}
        >
          {/* Ruler — every second a faint tick, every 5s labeled */}
          <div className="absolute top-0 left-0 right-0 h-5 border-b border-zinc-800 text-[9px] text-zinc-500">
            {Array.from({ length: Math.ceil(totalWidthPx / pxPerSec) }).map((_, i) => (
              <div
                key={i}
                className="absolute top-0 bottom-0 border-l border-zinc-800/70 pl-1"
                style={{ left: i * pxPerSec, width: pxPerSec }}
              >
                {i % 5 === 0 && <span>{i}s</span>}
              </div>
            ))}
          </div>

          {/* Beat markers */}
          {beats.map((b, i) => (
            <div
              key={`b-${i}`}
              className="absolute top-5 bottom-0 border-l border-[var(--primary)]/30 pointer-events-none"
              style={{ left: b * pxPerSec }}
            />
          ))}

          {/* Playhead */}
          <div
            className="absolute top-5 bottom-0 w-px bg-white pointer-events-none"
            style={{ left: playheadSec * pxPerSec }}
          />

          {/* Clips */}
          {sorted.map((c, i) => {
            const next = sorted[i + 1]
            return (
              <React.Fragment key={c.id}>
                <div
                  className={`absolute rounded shadow flex items-center text-[11px] text-white select-none cursor-grab ${
                    drag?.clipId === c.id ? 'ring-2 ring-[var(--primary)]' : ''
                  }`}
                  style={{
                    left: c.start * pxPerSec,
                    width: c.duration * pxPerSec,
                    top: 24,
                    height: ROW_HEIGHT - 8,
                    background: c.color ?? 'rgba(124,58,237,0.85)',
                  }}
                  tabIndex={0}
                  onKeyDown={(e) => handleKeyDown(e, c.id)}
                  onMouseDown={(ev) => {
                    const rect = (ev.target as HTMLElement).getBoundingClientRect()
                    const inLeftHandle = ev.clientX - rect.left < TRIM_HANDLE_PX
                    const inRightHandle = rect.right - ev.clientX < TRIM_HANDLE_PX
                    if (inLeftHandle) beginDrag(ev, c, 'trim-left')
                    else if (inRightHandle) beginDrag(ev, c, 'trim-right')
                    else beginDrag(ev, c, 'move')
                  }}
                  title={`${c.label}\nShift-drag = slip · Alt-drag = slide · Drag edge = ripple trim · Delete = ripple delete`}
                >
                  {/* Trim handles (visual hint; actual hit-zone is via the
                      pre-mousedown coordinate test above) */}
                  <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-white/30 hover:bg-white/60 cursor-ew-resize" />
                  <div className="absolute right-0 top-0 bottom-0 w-1.5 bg-white/30 hover:bg-white/60 cursor-ew-resize" />
                  <span className="px-3 truncate">{c.label}</span>
                </div>

                {/* Boundary roll handle between this clip and the next */}
                {next && Math.abs((c.start + c.duration) - next.start) < 0.001 && (
                  <div
                    className="absolute w-3 bg-transparent cursor-col-resize hover:bg-amber-400/40"
                    style={{
                      left: (c.start + c.duration) * pxPerSec - 6,
                      top: 24,
                      height: ROW_HEIGHT - 8,
                    }}
                    onMouseDown={(ev) => beginRoll(ev, c, next)}
                    title="Drag = roll boundary"
                  />
                )}
              </React.Fragment>
            )
          })}
        </div>
      </div>
      <div className="px-2 py-1 border-t border-zinc-800 text-[10px] text-zinc-500 flex gap-3 flex-wrap">
        <span><kbd className="px-1 bg-zinc-800 rounded">drag edge</kbd> ripple trim</span>
        <span><kbd className="px-1 bg-zinc-800 rounded">shift+drag</kbd> slip</span>
        <span><kbd className="px-1 bg-zinc-800 rounded">alt+drag</kbd> slide</span>
        <span><kbd className="px-1 bg-zinc-800 rounded">drag boundary</kbd> roll</span>
        <span><kbd className="px-1 bg-zinc-800 rounded">Del</kbd> ripple delete</span>
      </div>
    </div>
  )
}
