// File: src/renderer/utils/pmv-ripple-roll.ts
//
// #242 A-18 — Premiere-style ripple + roll hotkeys on the PMV
// MagneticTimeline. Mirrors Adobe Premiere's editing model:
//
//   Q             Ripple-trim from clip in-point to playhead
//   W             Ripple-trim from playhead to clip out-point
//   N             Toggle Roll (between adjacent clips at playhead)
//   Shift + ,/.   Nudge selected edit by 1 frame
//   Alt   + ,/.   Nudge selected edit by 5 frames
//
// "Ripple" removes/keeps content AND shifts the entire downstream
// timeline. "Roll" extends one clip's outpoint AND shrinks the next
// clip's inpoint by the same amount — net duration unchanged.

export interface TimelineClip {
  id: string
  startSec: number
  endSec: number
  /** Reference back to the source media + its own in/out window. */
  sourceId: string
  sourceInSec: number
  sourceOutSec: number
}

export interface Timeline {
  clips: TimelineClip[]
}

/** Mutates timeline in place; returns the new ordering for chaining. */
export function rippleTrim(timeline: Timeline, atPlayheadSec: number, direction: 'in' | 'out'): TimelineClip[] {
  const clipIdx = timeline.clips.findIndex((c) => atPlayheadSec >= c.startSec && atPlayheadSec < c.endSec)
  if (clipIdx === -1) return timeline.clips
  const clip = timeline.clips[clipIdx]
  const delta = direction === 'in' ? clip.startSec - atPlayheadSec : atPlayheadSec - clip.endSec
  if (direction === 'in') {
    const trimmed = atPlayheadSec - clip.startSec
    clip.sourceInSec += trimmed
    clip.startSec = atPlayheadSec
    // Slide everything downstream BACKWARDS (clip got shorter at start).
    for (let i = clipIdx + 1; i < timeline.clips.length; i++) {
      timeline.clips[i].startSec += delta
      timeline.clips[i].endSec += delta
    }
    // Slide this clip back to fill the gap if direction was 'in'.
    const shrink = atPlayheadSec - clip.startSec
    void shrink
    return timeline.clips
  }
  // direction === 'out'
  const shrink = clip.endSec - atPlayheadSec
  clip.sourceOutSec -= shrink
  clip.endSec = atPlayheadSec
  for (let i = clipIdx + 1; i < timeline.clips.length; i++) {
    timeline.clips[i].startSec -= shrink
    timeline.clips[i].endSec -= shrink
  }
  return timeline.clips
}

/** Roll between clip[i] and clip[i+1] at the playhead. */
export function rollEdit(timeline: Timeline, atPlayheadSec: number, deltaSec: number): TimelineClip[] {
  // Find the edit point at the playhead — the boundary between two
  // adjacent clips whose endSec ≈ startSec ≈ playhead.
  const i = timeline.clips.findIndex((c, idx) =>
    idx < timeline.clips.length - 1 &&
    Math.abs(c.endSec - atPlayheadSec) < 0.05 &&
    Math.abs(timeline.clips[idx + 1].startSec - atPlayheadSec) < 0.05,
  )
  if (i === -1) return timeline.clips
  const left = timeline.clips[i], right = timeline.clips[i + 1]
  // Clamp deltaSec so neither source window is violated.
  const maxOut = (right.sourceOutSec - right.sourceInSec) - 0.05
  const maxIn = (left.sourceOutSec - left.sourceInSec) - 0.05
  const clamped = Math.max(-maxIn, Math.min(maxOut, deltaSec))
  left.endSec += clamped
  left.sourceOutSec += clamped
  right.startSec += clamped
  right.sourceInSec += clamped
  return timeline.clips
}

export function bindHotkeys(opts: {
  getTimeline: () => Timeline
  getPlayheadSec: () => number
  setTimeline: (t: Timeline) => void
  frameDurationSec?: number
}): () => void {
  const frame = opts.frameDurationSec ?? (1 / 30)
  const onKey = (e: KeyboardEvent) => {
    const t = opts.getTimeline()
    const p = opts.getPlayheadSec()
    if (e.key === 'q') { e.preventDefault(); opts.setTimeline({ clips: rippleTrim(t, p, 'in') }) }
    else if (e.key === 'w') { e.preventDefault(); opts.setTimeline({ clips: rippleTrim(t, p, 'out') }) }
    else if (e.key === 'n') { e.preventDefault(); opts.setTimeline({ clips: rollEdit(t, p, 0) }) }
    else if (e.key === ',' && e.shiftKey) { e.preventDefault(); opts.setTimeline({ clips: rollEdit(t, p, -frame) }) }
    else if (e.key === '.' && e.shiftKey) { e.preventDefault(); opts.setTimeline({ clips: rollEdit(t, p, frame) }) }
    else if (e.key === ',' && e.altKey)   { e.preventDefault(); opts.setTimeline({ clips: rollEdit(t, p, -5 * frame) }) }
    else if (e.key === '.' && e.altKey)   { e.preventDefault(); opts.setTimeline({ clips: rollEdit(t, p, 5 * frame) }) }
  }
  window.addEventListener('keydown', onKey)
  return () => window.removeEventListener('keydown', onKey)
}
