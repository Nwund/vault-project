// File: src/main/services/ai-intelligence/face-detector.ts
//
// YuNet face detector wrapper. Complements MoveNet pose for performer-
// count tagging: faces detect reliably in close-ups (which are common
// in adult media), while pose needs visible shoulders + hips.
//
// YuNet's ONNX (face_detection_yunet_2023mar) emits three tensors:
//   loc  — [1, N, 14]: 4 bbox + 10 landmark coords per anchor
//   conf — [1, N, 2]:  background/face confidence per anchor
//   iou  — [1, N, 1]:  predicted IoU score per anchor
// where N is the total anchor count (depends on input size).
//
// Final score = sqrt(conf_face * iou). We then run NMS over the boxes
// to dedupe overlapping detections. Standard for SSD-style detectors.
//
// References:
//   https://github.com/opencv/opencv_zoo/tree/main/models/face_detection_yunet
//   https://github.com/ShiqiYu/libfacedetection

import fs from 'node:fs'
import path from 'node:path'
import { app } from 'electron'

// Lazy-load ONNX runtime + sharp — only when the model is available.
let ort: any = null
let sharp: any = null

// YuNet 2023mar: 640×640 input, 12 outputs (cls/obj/bbox/kps at strides
// 8/16/32). The model is fully convolutional so it works at any size,
// but the opencv_zoo release export bakes in 640 input shape.
const INPUT_SIZE = 640
const SCORE_THRESHOLD = 0.6  // gate on sqrt(cls * obj)
const NMS_IOU_THRESHOLD = 0.3

// Anchor layout for YuNet 2023mar at 640×640. Each level emits anchors
// at strides 8/16/32, with one anchor per cell:
//   (640/8)² + (640/16)² + (640/32)² = 6400 + 1600 + 400 = 8400 anchors.
const STRIDES = [8, 16, 32] as const

export interface FaceDetection {
  x: number       // normalized 0-1
  y: number
  w: number
  h: number
  score: number
}

export interface FaceFrameResult {
  faces: FaceDetection[]
}

export interface FaceTagPrior {
  name: string
  confidence: number
  source: 'face'
}

let session: any = null
let initialized = false
let modelPath: string | null = null

function getModelPath(): string {
  return path.join(app.getPath('userData'), 'models', 'face-detection-yunet.onnx')
}

export function isFaceDetectorAvailable(): boolean {
  modelPath = getModelPath()
  return fs.existsSync(modelPath)
}

async function loadModel(): Promise<void> {
  if (initialized) return
  if (!isFaceDetectorAvailable()) {
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
    console.log(`[FaceDetector] Loaded ${modelPath}`)
  } catch (err) {
    console.warn('[FaceDetector] Load failed:', err)
    session = null
  } finally {
    initialized = true
  }
}

// Anchors are computed inline per stride during inference now — no
// pre-cache needed since the loop is cheap and the per-stride layout
// is simpler than the flat combined layout the old parser used.

/** Standard IoU over normalized boxes. */
function iou(a: FaceDetection, b: FaceDetection): number {
  const x1 = Math.max(a.x, b.x)
  const y1 = Math.max(a.y, b.y)
  const x2 = Math.min(a.x + a.w, b.x + b.w)
  const y2 = Math.min(a.y + a.h, b.y + b.h)
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1)
  const ua = a.w * a.h + b.w * b.h - inter
  return ua <= 0 ? 0 : inter / ua
}

/** Greedy NMS — keeps highest-score box, suppresses overlapping ones. */
function nms(boxes: FaceDetection[], thr: number): FaceDetection[] {
  const sorted = boxes.slice().sort((a, b) => b.score - a.score)
  const kept: FaceDetection[] = []
  for (const box of sorted) {
    let keep = true
    for (const k of kept) {
      if (iou(box, k) > thr) { keep = false; break }
    }
    if (keep) kept.push(box)
  }
  return kept
}

/**
 * Run YuNet on a single frame. Returns normalized face boxes after
 * scoring + NMS. Pixel preprocessing follows opencv_zoo's reference:
 * BGR uint8 → float32 NCHW (no mean-subtract, no scaling).
 */
export async function detectFaces(framePath: string): Promise<FaceFrameResult | null> {
  await loadModel()
  if (!session || !fs.existsSync(framePath)) return null
  try {
    const buf = await sharp(framePath)
      .resize(INPUT_SIZE, INPUT_SIZE, { fit: 'fill' })
      .raw()
      .toBuffer({ resolveWithObject: true })
    const rgb = buf.data as Buffer
    const float = new Float32Array(3 * INPUT_SIZE * INPUT_SIZE)
    // BGR NCHW, no normalization. YuNet was trained on raw 0-255 BGR.
    for (let i = 0; i < INPUT_SIZE * INPUT_SIZE; i++) {
      const r = rgb[i * 3]
      const g = rgb[i * 3 + 1]
      const b = rgb[i * 3 + 2]
      float[0 * INPUT_SIZE * INPUT_SIZE + i] = b
      float[1 * INPUT_SIZE * INPUT_SIZE + i] = g
      float[2 * INPUT_SIZE * INPUT_SIZE + i] = r
    }
    const tensor = new ort.Tensor('float32', float, [1, 3, INPUT_SIZE, INPUT_SIZE])
    const feeds: Record<string, any> = {}
    feeds[session.inputNames[0]] = tensor
    const output = await session.run(feeds)

    // YuNet 2023mar splits its output across 12 tensors: cls/obj/bbox/kps
    // each at strides 8/16/32. Pick them up by name. Each stride has
    // a flat anchor list — for INPUT=640 that's 6400/1600/400 anchors.
    const candidates: FaceDetection[] = []
    for (const stride of STRIDES) {
      const clsTensor = output[`cls_${stride}`]
      const objTensor = output[`obj_${stride}`]
      const bboxTensor = output[`bbox_${stride}`]
      if (!clsTensor || !objTensor || !bboxTensor) {
        console.warn(`[FaceDetector] Missing output for stride ${stride}`)
        continue
      }
      const cls = clsTensor.data as Float32Array
      const obj = objTensor.data as Float32Array
      const bbox = bboxTensor.data as Float32Array
      const gridSize = INPUT_SIZE / stride
      const numAnchors = gridSize * gridSize
      if (cls.length !== numAnchors) {
        console.warn(`[FaceDetector] Anchor count mismatch at stride ${stride}: expected ${numAnchors}, got ${cls.length}`)
        continue
      }
      for (let i = 0; i < numAnchors; i++) {
        const score = Math.sqrt(Math.max(0, cls[i]) * Math.max(0, obj[i]))
        if (score < SCORE_THRESHOLD) continue
        // bbox is [cx_delta, cy_delta, log_w, log_h] in stride units.
        const cellY = Math.floor(i / gridSize)
        const cellX = i % gridSize
        const dcx = bbox[i * 4 + 0]
        const dcy = bbox[i * 4 + 1]
        const dw = bbox[i * 4 + 2]
        const dh = bbox[i * 4 + 3]
        const cx = (cellX + 0.5 + dcx) * stride
        const cy = (cellY + 0.5 + dcy) * stride
        const w = Math.exp(dw) * stride
        const h = Math.exp(dh) * stride
        const x = (cx - w / 2) / INPUT_SIZE
        const y = (cy - h / 2) / INPUT_SIZE
        candidates.push({
          x: Math.max(0, Math.min(1, x)),
          y: Math.max(0, Math.min(1, y)),
          w: Math.max(0, Math.min(1, w / INPUT_SIZE)),
          h: Math.max(0, Math.min(1, h / INPUT_SIZE)),
          score,
        })
      }
    }

    const faces = nms(candidates, NMS_IOU_THRESHOLD)
      // Drop sub-pixel-sized garbage detections.
      .filter((f) => f.w >= 0.015 && f.h >= 0.015)
    return { faces }
  } catch (err) {
    console.warn('[FaceDetector] Inference failed:', err)
    return null
  }
}

/**
 * Run face detection across a set of frames and emit performer-count
 * priors. Same voting + confidence pattern as the pose detector but
 * with a different signal floor — face count gives higher precision
 * than skeleton count in close-ups but worse recall in long shots.
 */
export async function detectFacesAcrossFrames(framePaths: string[]): Promise<FaceTagPrior[]> {
  if (framePaths.length === 0) return []
  await loadModel()
  if (!session) return []

  const sample = framePaths.slice(0, 8)
  const countVotes = new Map<number, number>()
  let framesAnalyzed = 0
  for (const fp of sample) {
    const r = await detectFaces(fp)
    if (!r) continue
    framesAnalyzed += 1
    // Cap at 6 — anything higher is almost certainly noise (extras,
    // mirrors, posters in the background).
    const n = Math.min(6, r.faces.length)
    countVotes.set(n, (countVotes.get(n) ?? 0) + 1)
  }
  if (framesAnalyzed === 0) return []

  // Modal vote across frames.
  let modalCount = 0
  let modalVotes = 0
  for (const [count, votes] of countVotes.entries()) {
    if (votes > modalVotes) { modalCount = count; modalVotes = votes }
  }
  const agreement = modalVotes / framesAnalyzed
  // Face count is a more precise signal than pose count for low-N
  // (close-ups, talking-head intros), so we floor confidence slightly
  // higher than pose's 0.45.
  const baseConf = Math.min(0.7, 0.5 + agreement * 0.2)

  const priors: FaceTagPrior[] = []
  if (modalCount === 0) {
    // No faces detected — could be all-body shots / extreme close-ups
    // / abstract content. Don't emit a tag here; the absence isn't a
    // positive signal.
  } else if (modalCount === 1) {
    priors.push({ name: 'solo', confidence: baseConf, source: 'face' })
  } else if (modalCount === 2) {
    priors.push({ name: 'couple', confidence: baseConf, source: 'face' })
    priors.push({ name: 'two people', confidence: baseConf - 0.05, source: 'face' })
  } else if (modalCount === 3) {
    priors.push({ name: 'threesome', confidence: baseConf - 0.05, source: 'face' })
    priors.push({ name: 'group', confidence: baseConf - 0.1, source: 'face' })
  } else {
    priors.push({ name: 'group', confidence: baseConf - 0.05, source: 'face' })
  }

  console.log(
    `[FaceDetector] ${framesAnalyzed}/${sample.length} frames analyzed; ` +
    `modal face count=${modalCount} (${modalVotes}/${framesAnalyzed})`
  )
  return priors
}
