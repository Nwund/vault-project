// File: src/renderer/utils/hand-landmarker.ts
//
// #B-40 / #264 — MediaPipe Hand Landmarker v2. 21-point 3D landmarks
// per hand, real-time on CPU. Runs entirely in the renderer (the
// hand_landmarker.task file is at <userData>/models/, served via the
// vault:// protocol).
//
// Use cases:
//   - Detect "stroking" gesture for hands-free pacing feedback
//   - Detect "stop" / "pause" hand sign for hands-free control
//   - Generic gesture recognition (peace sign, thumbs up, etc)
//
// Lazy-loaded: first detect() call constructs the runner.

import { FilesetResolver, HandLandmarker, type HandLandmarkerResult } from '@mediapipe/tasks-vision'

let runner: HandLandmarker | null = null
let initFailed = false

export interface HandPose {
  handedness: 'Left' | 'Right'
  score: number
  /** 21 landmarks in image-space coordinates [0,1] for x/y and metric meters for z (signed). */
  landmarks: Array<{ x: number; y: number; z: number }>
  /** Same shape but world coordinates (origin at wrist, meters). */
  worldLandmarks: Array<{ x: number; y: number; z: number }>
}

export interface DetectResult {
  hands: HandPose[]
}

async function initialize(modelUrl: string): Promise<HandLandmarker | null> {
  if (runner) return runner
  if (initFailed) return null
  try {
    // The WASM assets are bundled with the package; use the official
    // CDN as the FilesetResolver root unless the user has set up local
    // serving (which we don't bother with — these are tiny static files).
    const vision = await FilesetResolver.forVisionTasks(
      'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
    )
    runner = await HandLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetPath: modelUrl, delegate: 'GPU' },
      runningMode: 'VIDEO',
      numHands: 2,
      minHandDetectionConfidence: 0.5,
      minHandPresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
    })
    return runner
  } catch (err) {
    console.error('[hand-landmarker] init failed:', err)
    initFailed = true
    return null
  }
}

// Detect on a single frame source (video element, image, canvas).
// Caller is responsible for the cadence (a typical loop is requestAnimationFrame
// gated to 30fps so we don't burn cycles on every paint).
export async function detect(
  source: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement,
  modelUrl: string,
  videoTimestampMs?: number,
): Promise<DetectResult | null> {
  const r = await initialize(modelUrl)
  if (!r) return null
  let result: HandLandmarkerResult
  try {
    if (source instanceof HTMLVideoElement && typeof videoTimestampMs === 'number') {
      result = r.detectForVideo(source, videoTimestampMs)
    } else {
      result = r.detect(source as any)
    }
  } catch (err) {
    console.warn('[hand-landmarker] detect failed:', err)
    return null
  }
  const hands: HandPose[] = []
  for (let i = 0; i < (result.landmarks?.length ?? 0); i++) {
    const handed = result.handednesses?.[i]?.[0]
    hands.push({
      handedness: (handed?.categoryName as 'Left' | 'Right') ?? 'Right',
      score: handed?.score ?? 0,
      landmarks: result.landmarks[i].map((p) => ({ x: p.x, y: p.y, z: p.z })),
      worldLandmarks: result.worldLandmarks?.[i]?.map((p) => ({ x: p.x, y: p.y, z: p.z })) ?? [],
    })
  }
  return { hands }
}

// Convenience: classify a hand pose as one of a small gesture set.
// Heuristic — extension state per finger compared against known shapes.
export type Gesture = 'fist' | 'open-palm' | 'point' | 'peace' | 'thumbs-up' | 'rock' | 'ok' | 'unknown'

export function classifyGesture(pose: HandPose): Gesture {
  // MediaPipe landmark indices: 4=thumb_tip, 8=index_tip, 12=middle_tip,
  // 16=ring_tip, 20=pinky_tip. The MCP (knuckle) for each finger is
  // 5/9/13/17. A finger is "extended" if tip y is meaningfully above
  // (smaller y) its MCP in image space. For thumb we compare x because
  // the thumb articulates laterally.
  const lm = pose.landmarks
  if (lm.length < 21) return 'unknown'
  const extended = {
    thumb: pose.handedness === 'Right' ? lm[4].x < lm[3].x : lm[4].x > lm[3].x,
    index: lm[8].y < lm[6].y,
    middle: lm[12].y < lm[10].y,
    ring: lm[16].y < lm[14].y,
    pinky: lm[20].y < lm[18].y,
  }
  const flags = [extended.thumb, extended.index, extended.middle, extended.ring, extended.pinky]
  const count = flags.filter(Boolean).length
  if (count === 5) return 'open-palm'
  if (count === 0) return 'fist'
  if (extended.index && extended.middle && !extended.ring && !extended.pinky) return 'peace'
  if (extended.thumb && !extended.index && !extended.middle && !extended.ring && !extended.pinky) return 'thumbs-up'
  if (extended.index && !extended.middle && !extended.ring && !extended.pinky) return 'point'
  if (extended.index && extended.pinky && !extended.middle && !extended.ring) return 'rock'
  // OK sign: thumb and index touch (small distance) with others extended
  const thumbIdxDist = Math.hypot(lm[4].x - lm[8].x, lm[4].y - lm[8].y)
  if (thumbIdxDist < 0.05 && extended.middle && extended.ring && extended.pinky) return 'ok'
  return 'unknown'
}
