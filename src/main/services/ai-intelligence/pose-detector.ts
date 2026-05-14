// File: src/main/services/ai-intelligence/pose-detector.ts
//
// MoveNet MultiPose Lightning wrapper. Detects up to 6 people per
// frame and emits 17 COCO keypoints per person:
//   0 nose,    1 leftEye,  2 rightEye, 3 leftEar,   4 rightEar,
//   5 leftSh,  6 rightSh,  7 leftEl,   8 rightEl,   9 leftWr,
//   10 rightWr,11 leftHip, 12 rightHip,13 leftKnee, 14 rightKnee,
//   15 leftAnk,16 rightAnk
//
// From those keypoints we derive two cheap heuristics:
//   1. PERSON COUNT — number of skeletons that clear the confidence
//      gate. Maps to solo / couple / threesome / group with rapidly-
//      decaying confidence (3+ people is a noisy signal — bystanders).
//   2. BODY ORIENTATION (per person, top-confidence subject only):
//        standing  — shoulders above hips, hips above knees, knees above ankles
//        kneeling  — knees above ankles, hips above knees, hip y close to knee y
//        sitting   — hips at knee level, ankles below knees
//        lying     — shoulders, hips, knees roughly on one horizontal line
//      Maps to plain English tags ("standing", "lying down", "kneeling").
//
// Neither heuristic claims sex-act semantics — those need pair-wise
// interaction analysis (out of scope). The output is fed as low-
// confidence priors (0.4-0.55) into Tier 2's rich_tags pool where the
// existing calibration + mutual-exclusion logic adjusts them.

import fs from 'node:fs'
import path from 'node:path'
import { app } from 'electron'

// Lazy-load ONNX runtime + sharp — only when the model is available.
let ort: any = null
let sharp: any = null

const KEYPOINT_NAMES = [
  'nose', 'leftEye', 'rightEye', 'leftEar', 'rightEar',
  'leftShoulder', 'rightShoulder', 'leftElbow', 'rightElbow',
  'leftWrist', 'rightWrist', 'leftHip', 'rightHip',
  'leftKnee', 'rightKnee', 'leftAnkle', 'rightAnkle',
] as const

// MoveNet MultiPose Lightning expects 256×256 RGB uint8 NHWC.
// Output shape: [1, 6, 56] — up to 6 detections, each row is
//   [y0,x0,score0, y1,x1,score1, ..., y16,x16,score16, ymin,xmin,ymax,xmax,score]
// = 17 * 3 + 5 = 56.
const MODEL_INPUT_SIZE = 256
const MAX_INSTANCES = 6
const ROW_STRIDE = 56  // 17*3 + 5 bbox fields
const KEYPOINT_THRESHOLD = 0.3  // per-keypoint confidence gate
const PERSON_THRESHOLD = 0.25   // overall detection score gate

export interface Keypoint {
  name: typeof KEYPOINT_NAMES[number]
  x: number  // normalized 0-1
  y: number  // normalized 0-1
  score: number
}

export interface PoseDetection {
  /** 17 keypoints in COCO order — see KEYPOINT_NAMES. */
  keypoints: Keypoint[]
  /** Overall detection score, gates whether this skeleton is reliable. */
  score: number
  /** Bounding box, normalized. */
  bbox: { x: number; y: number; w: number; h: number }
}

export interface PoseFrameResult {
  detections: PoseDetection[]
  /** Inferred orientation of the highest-scoring person ('unknown' if
   *  the relevant keypoints didn't clear the threshold). */
  primaryOrientation: 'standing' | 'lying' | 'kneeling' | 'sitting' | 'unknown'
}

export interface PoseTagPrior {
  name: string
  confidence: number
  /** Always 'pose' for this source — Tier 2's voting groups by source. */
  source: 'pose'
}

let session: any = null
let initialized = false
let modelPath: string | null = null

function getModelPath(): string {
  return path.join(app.getPath('userData'), 'models', 'movenet-multipose-lightning.onnx')
}

export function isPoseDetectorAvailable(): boolean {
  modelPath = getModelPath()
  return fs.existsSync(modelPath)
}

async function loadModel(): Promise<void> {
  if (initialized) return
  if (!isPoseDetectorAvailable()) {
    initialized = true
    return
  }
  try {
    if (!ort) ort = await import('onnxruntime-node')
    if (!sharp) sharp = require('sharp')
    session = await ort.InferenceSession.create(modelPath!, {
      executionProviders: ['cpu'],
      graphOptimizationLevel: 'all',
    })
    console.log(`[PoseDetector] Loaded ${modelPath}`)
  } catch (err) {
    console.warn('[PoseDetector] Load failed:', err)
    session = null
  } finally {
    initialized = true
  }
}

/**
 * Run MoveNet on a single frame. Returns detections with normalized
 * keypoints + inferred body orientation for the top subject.
 */
export async function detectPose(framePath: string): Promise<PoseFrameResult | null> {
  await loadModel()
  if (!session || !fs.existsSync(framePath)) return null
  try {
    // Resize to 256×256, keep aspect via fit:'fill' (MoveNet handles
    // non-square inputs fine because its bbox normalization is on the
    // resized canvas — we just lose absolute pixel scale).
    const buf = await sharp(framePath)
      .resize(MODEL_INPUT_SIZE, MODEL_INPUT_SIZE, { fit: 'fill' })
      .raw()
      .toBuffer({ resolveWithObject: true })
    const rgb = buf.data as Buffer
    // MoveNet wants int32 NHWC uint8 values (yes, int32 tensor of
    // uint8 values per the TF Hub spec). Some ONNX conversions take
    // float32 instead — we send int32 which matches the canonical
    // PINTO conversion used by atlasUnified.
    const input = new Int32Array(MODEL_INPUT_SIZE * MODEL_INPUT_SIZE * 3)
    for (let i = 0; i < input.length; i++) input[i] = rgb[i]
    const tensor = new ort.Tensor('int32', input, [1, MODEL_INPUT_SIZE, MODEL_INPUT_SIZE, 3])
    const feeds: Record<string, any> = {}
    feeds[session.inputNames[0]] = tensor
    const output = await session.run(feeds)
    const out = output[session.outputNames[0]]
    const data = out.data as Float32Array
    // Parse [1, 6, 56].
    const detections: PoseDetection[] = []
    for (let i = 0; i < MAX_INSTANCES; i++) {
      const base = i * ROW_STRIDE
      const overallScore = data[base + 55]
      if (overallScore < PERSON_THRESHOLD) continue
      const keypoints: Keypoint[] = []
      for (let k = 0; k < 17; k++) {
        const y = data[base + k * 3 + 0]
        const x = data[base + k * 3 + 1]
        const s = data[base + k * 3 + 2]
        keypoints.push({ name: KEYPOINT_NAMES[k], x, y, score: s })
      }
      const ymin = data[base + 51]
      const xmin = data[base + 52]
      const ymax = data[base + 53]
      const xmax = data[base + 54]
      detections.push({
        keypoints,
        score: overallScore,
        bbox: { x: xmin, y: ymin, w: xmax - xmin, h: ymax - ymin },
      })
    }
    detections.sort((a, b) => b.score - a.score)
    return {
      detections,
      primaryOrientation: detections[0] ? inferOrientation(detections[0]) : 'unknown',
    }
  } catch (err) {
    console.warn('[PoseDetector] Inference failed:', err)
    return null
  }
}

/**
 * Body-orientation heuristic on a single skeleton. Falls back to
 * 'unknown' when the load-bearing keypoints (shoulders / hips / knees /
 * ankles) didn't clear the per-keypoint threshold.
 */
function inferOrientation(det: PoseDetection): PoseFrameResult['primaryOrientation'] {
  const kp = Object.fromEntries(det.keypoints.map((k) => [k.name, k])) as Record<string, Keypoint>
  const confidentAvgY = (...names: string[]): number | null => {
    const valid = names.map((n) => kp[n]).filter((k) => k && k.score >= KEYPOINT_THRESHOLD)
    if (valid.length === 0) return null
    return valid.reduce((s, k) => s + k.y, 0) / valid.length
  }
  const sy = confidentAvgY('leftShoulder', 'rightShoulder')
  const hy = confidentAvgY('leftHip', 'rightHip')
  const ky = confidentAvgY('leftKnee', 'rightKnee')
  const ay = confidentAvgY('leftAnkle', 'rightAnkle')

  // Standing: shoulders < hips < knees < ankles, vertical spread > 0.4
  if (sy != null && hy != null && ky != null && ay != null) {
    if (sy < hy && hy < ky && ky < ay && ay - sy > 0.4) return 'standing'
    // Lying: shoulders, hips, knees within a tight vertical band (<15% of
    // frame height) — body is horizontal.
    const ys = [sy, hy, ky, ay]
    const spread = Math.max(...ys) - Math.min(...ys)
    if (spread < 0.15) return 'lying'
    // Sitting: hips and knees at similar y; ankles below.
    if (Math.abs(hy - ky) < 0.08 && ay > ky) return 'sitting'
    // Kneeling: knees and ankles at similar y; hips above.
    if (Math.abs(ky - ay) < 0.08 && hy < ky) return 'kneeling'
  } else if (sy != null && hy != null && ky != null) {
    // Same logic minus ankles (often occluded in close-ups).
    if (sy < hy && hy < ky && ky - sy > 0.35) return 'standing'
    const spread = Math.max(sy, hy, ky) - Math.min(sy, hy, ky)
    if (spread < 0.12) return 'lying'
    if (Math.abs(hy - ky) < 0.08) return 'sitting'
  }
  return 'unknown'
}

/**
 * Run pose detection across a set of frames and aggregate into
 * confidence-tagged priors. Each prior takes the MAX confidence
 * across frames it appeared in (matches the miles-deep pattern).
 *
 * Confidence floors:
 *   - performer count tags (solo / couple / group): 0.5 base, +up to
 *     0.15 boost when ≥4 frames agree.
 *   - orientation tags: 0.45 base — these are weaker signals than
 *     skeleton count and shouldn't auto-approve without Tier 2
 *     corroboration.
 */
export async function detectPoseAcrossFrames(framePaths: string[]): Promise<PoseTagPrior[]> {
  if (framePaths.length === 0) return []
  await loadModel()
  if (!session) return []

  // Up to 8 frames — 8 × ~150ms on CPU ≈ 1.2s, fits in the existing
  // queue cadence between Tier 1 and Tier 2.
  const sample = framePaths.slice(0, 8)
  const countVotes = new Map<number, number>()  // person count → frame count
  const orientVotes = new Map<string, number>() // orientation → frame count
  let framesAnalyzed = 0

  for (const fp of sample) {
    const r = await detectPose(fp)
    if (!r) continue
    framesAnalyzed += 1
    const personCount = r.detections.length
    countVotes.set(personCount, (countVotes.get(personCount) ?? 0) + 1)
    if (r.primaryOrientation !== 'unknown') {
      orientVotes.set(r.primaryOrientation, (orientVotes.get(r.primaryOrientation) ?? 0) + 1)
    }
  }
  if (framesAnalyzed === 0) return []

  const priors: PoseTagPrior[] = []

  // Person count → tag mapping. Picks the modal count across frames.
  let modalCount = 0
  let modalVotes = 0
  for (const [count, votes] of countVotes.entries()) {
    if (votes > modalVotes) { modalCount = count; modalVotes = votes }
  }
  const agreement = modalVotes / framesAnalyzed
  const countConfidence = Math.min(0.7, 0.45 + agreement * 0.2)
  if (modalCount === 1) {
    priors.push({ name: 'solo', confidence: countConfidence, source: 'pose' })
  } else if (modalCount === 2) {
    priors.push({ name: 'couple', confidence: countConfidence, source: 'pose' })
    priors.push({ name: 'two people', confidence: countConfidence - 0.05, source: 'pose' })
  } else if (modalCount === 3) {
    priors.push({ name: 'threesome', confidence: countConfidence - 0.1, source: 'pose' })
    priors.push({ name: 'group', confidence: countConfidence - 0.05, source: 'pose' })
  } else if (modalCount >= 4) {
    priors.push({ name: 'group', confidence: countConfidence - 0.05, source: 'pose' })
  }

  // Orientation: only emit if the top orientation appeared in ≥40% of
  // frames where pose was detected. Otherwise it's just noise from a
  // dynamic scene with shifting positions.
  let topOrient: string | null = null
  let topOrientVotes = 0
  for (const [orient, votes] of orientVotes.entries()) {
    if (votes > topOrientVotes) { topOrient = orient; topOrientVotes = votes }
  }
  if (topOrient && topOrientVotes / framesAnalyzed >= 0.4) {
    const orientConfidence = Math.min(0.6, 0.4 + (topOrientVotes / framesAnalyzed) * 0.2)
    const tagName = topOrient === 'lying' ? 'lying down' : topOrient
    priors.push({ name: tagName, confidence: orientConfidence, source: 'pose' })
  }

  console.log(
    `[PoseDetector] ${framesAnalyzed}/${sample.length} frames analyzed; ` +
    `modal count=${modalCount} (${modalVotes}/${framesAnalyzed}); ` +
    `top orientation=${topOrient ?? 'none'} (${topOrientVotes}/${framesAnalyzed})`
  )
  return priors
}
