// File: src/renderer/utils/stroke-tempo.ts
//
// #359 G-135 — Stroke-tempo metronome via optical-flow thrust detection.
// Watches the user's webcam (or the playing video) and uses sparse
// optical flow on hand/torso keypoints to estimate stroke frequency.
// Drives an audible metronome to help the user match a target BPM.
//
// Optical flow approach:
//   1. MediaPipe Hands → wrist landmark per frame (#264).
//   2. Track y-coordinate over a 2s sliding window.
//   3. Autocorrelation → dominant period → BPM.
//
// The result is a live BPM number. The metronome layer plays a click
// at every detected stroke (positive zero-crossing of the smoothed
// y-trace) and can be locked to a target tempo via simple PI ramp.

export interface TempoTrackerConfig {
  /** Source video (webcam) — must already have a media stream. */
  source: HTMLVideoElement
  /** Called every detection cycle with the smoothed BPM. */
  onBpm: (bpm: number) => void
  /** Called each detected stroke (zero-crossing). Click here for the
   *  metronome. */
  onStroke: () => void
}

const WINDOW_SEC = 4
const FPS = 30

export interface StrokeTempoOptions {
  /** URL of MediaPipe Hand Landmarker .task model. */
  modelUrl?: string
}

const DEFAULT_MODEL = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task'

export async function startStrokeTempo(config: TempoTrackerConfig, options: StrokeTempoOptions = {}): Promise<() => void> {
  const { detect } = await import('./hand-landmarker')
  const modelUrl = options.modelUrl ?? DEFAULT_MODEL
  const trace: Array<{ t: number; y: number }> = []
  let stopped = false
  let lastStrokeT = 0
  let detecting = false

  const tick = async (ts: number) => {
    if (stopped) return
    raf = requestAnimationFrame(tick)
    if (detecting) return
    detecting = true
    try {
      const result = await detect(config.source, modelUrl, ts)
      if (!result || result.hands.length === 0) return
      // Use the wrist landmark (index 0) of the first detected hand.
      const wrist = result.hands[0].landmarks[0]
      trace.push({ t: ts, y: wrist.y })
    const cutoff = ts - WINDOW_SEC * 1000
    while (trace.length > 0 && trace[0].t < cutoff) trace.shift()
    if (trace.length < FPS * 1) return  // need ≥1s of history

    // Smooth via 3-tap moving avg.
    const ys = trace.map((p) => p.y)
    const smooth: number[] = []
    for (let i = 0; i < ys.length; i++) {
      const a = ys[Math.max(0, i - 1)], b = ys[i], c = ys[Math.min(ys.length - 1, i + 1)]
      smooth.push((a + b + c) / 3)
    }
    // De-mean.
    const mean = smooth.reduce((s, v) => s + v, 0) / smooth.length
    const dem = smooth.map((v) => v - mean)
    // Autocorrelation; lag from 8 frames (~225 BPM) to 60 frames (~30 BPM).
    let bestLag = 0, bestVal = -Infinity
    for (let lag = 8; lag < 60 && lag < dem.length; lag++) {
      let s = 0
      for (let i = 0; i < dem.length - lag; i++) s += dem[i] * dem[i + lag]
      if (s > bestVal) { bestVal = s; bestLag = lag }
    }
    if (bestLag === 0) return
    const periodSec = bestLag / FPS
    const bpm = 60 / periodSec
    config.onBpm(bpm)
    // Detect last positive zero-cross since last stroke.
      for (let i = dem.length - 2; i > 0; i--) {
        const t = trace[i].t
        if (t <= lastStrokeT) break
        if (dem[i - 1] < 0 && dem[i] >= 0) {
          lastStrokeT = t
          config.onStroke()
          break
        }
      }
    } finally {
      detecting = false
    }
  }
  let raf = requestAnimationFrame(tick)

  return () => {
    stopped = true
    cancelAnimationFrame(raf)
  }
}
