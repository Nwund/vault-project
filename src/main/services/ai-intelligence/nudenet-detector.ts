// File: src/main/services/ai-intelligence/nudenet-detector.ts
//
// NudeNet v3 detector wrapper. Replaces the old NudeNet classifier
// (whose canonical URL went 404 — see model-downloader.ts comment).
// The v3 detector emits bounding boxes for 18 body-part classes, much
// more useful than the old classifier's single-vector output.
//
// Manual install pattern (same as miles-deep): no auto-download
// because the canonical mirrors keep moving. User drops the ONNX
// at:
//   <userData>/models/nudenet-detector.onnx
// Get it from notAI-tech/NudeNet v3 release (`320n.onnx` for the
// nano variant ~3MB, or `640m.onnx` for medium ~14MB). The model
// auto-detects input size from the loaded session's shape.
//
// Output postprocessing: YOLOv5-style. Each anchor row is
//   [cx, cy, w, h, obj_conf, c0_prob, c1_prob, ..., c17_prob]
// score = obj_conf × max(class_probs). Standard NMS over per-class
// boxes.
//
// Tag emission: each detected class produces a tag prior with
// confidence equal to the max box-score across all frames it
// appeared in. Mutual-exclusion stays the responsibility of the
// existing rich_tags aggregator — no special-case logic here.

import fs from 'node:fs'
import path from 'node:path'
import { app } from 'electron'

let ort: any = null
let sharp: any = null

// NudeNet v3 class indices → readable tag names. Conservative mapping
// — we route boxes to existing canonical Vault tags (matches the
// pattern in tier1-onnx-tagger.ts's nudenetLabelToTag mapping) and
// SKIP categories that would generate junk ("armpits_covered" etc.).
const CLASS_TO_TAG: Record<number, string | null> = {
  0: null,                  // FEMALE_GENITALIA_COVERED — skip
  1: null,                  // FACE_FEMALE — handled by gender via face detector
  2: 'exposed ass',         // BUTTOCKS_EXPOSED
  3: 'exposed breasts',     // FEMALE_BREAST_EXPOSED
  4: 'exposed pussy',       // FEMALE_GENITALIA_EXPOSED
  5: null,                  // MALE_BREAST_EXPOSED — skip
  6: 'anal',                // ANUS_EXPOSED
  7: 'bare feet',           // FEET_EXPOSED
  8: null,                  // BELLY_COVERED — skip
  9: null,                  // FEET_COVERED — skip
  10: null,                 // ARMPITS_COVERED — skip
  11: 'armpits',            // ARMPITS_EXPOSED
  12: null,                 // FACE_MALE
  13: null,                 // BELLY_EXPOSED — generic, low value
  14: 'exposed penis',      // MALE_GENITALIA_EXPOSED
  15: null,                 // ANUS_COVERED — skip
  16: 'covered breasts',    // FEMALE_BREAST_COVERED
  17: null,                 // BUTTOCKS_COVERED — skip
}

const SCORE_THRESHOLD = 0.4   // YOLOv5 default
const NMS_IOU_THRESHOLD = 0.45

let session: any = null
let initialized = false
let modelPath: string | null = null
// Inferred from the loaded session's input shape — typically 320 or 640.
let modelInputSize: number = 320

// #259 — NudeNet v3 640m upgrade. Default is the v2 320 model
// (nudenet-detector.onnx); enabling settings.ai.useNudeNetV3 routes
// the loader to the v3 640m file (nudenet-v3-640m.onnx). The 640m
// model is significantly more accurate on small / occluded subjects
// at the cost of ~3-4× inference time. The shape-inferred
// modelInputSize logic below already adapts to either input size.
function getModelPath(): string {
  try {
    // Lazy-require to avoid forcing the settings module to load just
    // to compute the model path on every call.
    const { getAISettings } = require('../../settings') as { getAISettings: () => any }
    const ai = getAISettings()
    if (ai?.useNudeNetV3) {
      // Try the 640m variant first (higher accuracy), fall back to
      // 320n (faster, ~3-4× lower latency). Both are valid v3 ONNX
      // files; the input size differs and the wrapper auto-detects.
      const modelsDir = path.join(app.getPath('userData'), 'models')
      for (const name of ['nudenet-v3-640m.onnx', 'nudenet-v3-320n.onnx']) {
        const p = path.join(modelsDir, name)
        if (fs.existsSync(p)) return p
      }
      console.warn('[NudeNet] useNudeNetV3 enabled but no v3 model file present; falling back to v2')
    }
  } catch { /* settings not loaded yet, use default */ }
  return path.join(app.getPath('userData'), 'models', 'nudenet-detector.onnx')
}

export function isNudeNetDetectorAvailable(): boolean {
  modelPath = getModelPath()
  return fs.existsSync(modelPath)
}

async function loadModel(): Promise<void> {
  if (initialized) return
  if (!isNudeNetDetectorAvailable()) {
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
    // Sniff the input size from the session metadata. NudeNet ONNX
    // exports embed the input shape (1, 3, H, W) — H == W in practice.
    try {
      const inputMeta = session.inputMetadata?.[session.inputNames[0]]
                     ?? (session as any).inputs?.[0]
      const dims = inputMeta?.dims ?? inputMeta?.shape
      if (Array.isArray(dims) && dims.length === 4) {
        const h = Number(dims[2])
        if (Number.isFinite(h) && h >= 64) modelInputSize = h
      }
    } catch { /* keep default 320 */ }
    console.log(`[NudeNet] Loaded ${modelPath} (input ${modelInputSize}×${modelInputSize})`)
  } catch (err) {
    console.warn('[NudeNet] Load failed:', err)
    session = null
  } finally {
    initialized = true
  }
}

interface DetectedBox {
  classIdx: number
  score: number
  x: number  // normalized
  y: number
  w: number
  h: number
}

function iou(a: DetectedBox, b: DetectedBox): number {
  const x1 = Math.max(a.x, b.x)
  const y1 = Math.max(a.y, b.y)
  const x2 = Math.min(a.x + a.w, b.x + b.w)
  const y2 = Math.min(a.y + a.h, b.y + b.h)
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1)
  const ua = a.w * a.h + b.w * b.h - inter
  return ua <= 0 ? 0 : inter / ua
}

function nmsPerClass(boxes: DetectedBox[], thr: number): DetectedBox[] {
  // Group by class, NMS within each class.
  const byClass = new Map<number, DetectedBox[]>()
  for (const b of boxes) {
    if (!byClass.has(b.classIdx)) byClass.set(b.classIdx, [])
    byClass.get(b.classIdx)!.push(b)
  }
  const out: DetectedBox[] = []
  for (const group of byClass.values()) {
    const sorted = group.slice().sort((a, b) => b.score - a.score)
    const kept: DetectedBox[] = []
    for (const box of sorted) {
      let keep = true
      for (const k of kept) {
        if (iou(box, k) > thr) { keep = false; break }
      }
      if (keep) kept.push(box)
    }
    out.push(...kept)
  }
  return out
}

interface NudeNetDetectionResult {
  detections: DetectedBox[]
}

export async function detectNudity(framePath: string): Promise<NudeNetDetectionResult | null> {
  await loadModel()
  if (!session || !fs.existsSync(framePath)) return null
  try {
    // Standard YOLOv5 preprocessing: RGB, normalized to [0,1], NCHW.
    // We use fit:'contain' to letterbox the image instead of squashing
    // (which would distort body-part proportions). Pad with gray (114).
    const sharpImg = sharp(framePath)
    const meta = await sharpImg.metadata()
    const srcW = meta.width ?? modelInputSize
    const srcH = meta.height ?? modelInputSize
    const scale = Math.min(modelInputSize / srcW, modelInputSize / srcH)
    const newW = Math.round(srcW * scale)
    const newH = Math.round(srcH * scale)
    const padX = Math.floor((modelInputSize - newW) / 2)
    const padY = Math.floor((modelInputSize - newH) / 2)

    const buf = await sharpImg
      .resize(newW, newH, { fit: 'fill' })
      .extend({
        top: padY,
        bottom: modelInputSize - newH - padY,
        left: padX,
        right: modelInputSize - newW - padX,
        background: { r: 114, g: 114, b: 114 },
      })
      .raw()
      .toBuffer({ resolveWithObject: true })
    const rgb = buf.data as Buffer
    const float = new Float32Array(3 * modelInputSize * modelInputSize)
    for (let i = 0; i < modelInputSize * modelInputSize; i++) {
      float[0 * modelInputSize * modelInputSize + i] = rgb[i * 3 + 0] / 255
      float[1 * modelInputSize * modelInputSize + i] = rgb[i * 3 + 1] / 255
      float[2 * modelInputSize * modelInputSize + i] = rgb[i * 3 + 2] / 255
    }
    const tensor = new ort.Tensor('float32', float, [1, 3, modelInputSize, modelInputSize])
    const feeds: Record<string, any> = {}
    feeds[session.inputNames[0]] = tensor
    const output = await session.run(feeds)
    const out = output[session.outputNames[0]]
    const data = out.data as Float32Array
    const dims = out.dims as number[]
    // NudeNet ONNX comes in two layouts:
    //   YOLOv5 (320n): [1, anchors, 23] — 4 bbox + 1 obj_conf + 18 classes
    //   YOLOv8 (640m): [1, 22, anchors] — 4 bbox + 18 classes (no obj_conf,
    //                                    score = max class prob directly)
    // Detect which by checking the channel dimension.
    let numAnchors = 0
    let format: 'yolov5' | 'yolov8' = 'yolov5'
    let transposed = false
    if (dims.length === 3 && dims[2] === 23) {
      numAnchors = dims[1]; format = 'yolov5'
    } else if (dims.length === 3 && dims[1] === 23) {
      numAnchors = dims[2]; format = 'yolov5'; transposed = true
    } else if (dims.length === 3 && dims[1] === 22) {
      // YOLOv8 [1, 22, anchors] — channels-first layout
      numAnchors = dims[2]; format = 'yolov8'; transposed = true
    } else if (dims.length === 3 && dims[2] === 22) {
      numAnchors = dims[1]; format = 'yolov8'
    } else {
      console.warn(`[NudeNet] Unexpected output shape ${dims.join('×')}`)
      return { detections: [] }
    }
    const numClasses = format === 'yolov5' ? 18 : 18
    const candidates: DetectedBox[] = []
    for (let i = 0; i < numAnchors; i++) {
      const rowStride = format === 'yolov5' ? 23 : 22
      const get = (col: number) => transposed
        ? data[col * numAnchors + i]
        : data[i * rowStride + col]

      let bestCls = -1
      let bestProb = 0
      let score: number
      if (format === 'yolov5') {
        const objConf = get(4)
        if (objConf < SCORE_THRESHOLD) continue
        for (let c = 0; c < numClasses; c++) {
          const p = get(5 + c)
          if (p > bestProb) { bestProb = p; bestCls = c }
        }
        score = objConf * bestProb
      } else {
        // YOLOv8: no obj_conf; score is max class prob directly. Class
        // probs start at column 4 (after 4 bbox values).
        for (let c = 0; c < numClasses; c++) {
          const p = get(4 + c)
          if (p > bestProb) { bestProb = p; bestCls = c }
        }
        score = bestProb
      }
      if (score < SCORE_THRESHOLD) continue
      // bbox is in model input pixels (after letterbox). Convert back
      // to normalized source-image coords by reversing the letterbox.
      const cx = get(0)
      const cy = get(1)
      const w = get(2)
      const h = get(3)
      // De-letterbox to original image coords.
      const xMin = (cx - w / 2 - padX) / (newW)
      const yMin = (cy - h / 2 - padY) / (newH)
      const xMax = (cx + w / 2 - padX) / (newW)
      const yMax = (cy + h / 2 - padY) / (newH)
      candidates.push({
        classIdx: bestCls,
        score,
        x: Math.max(0, Math.min(1, xMin)),
        y: Math.max(0, Math.min(1, yMin)),
        w: Math.max(0, Math.min(1, xMax - xMin)),
        h: Math.max(0, Math.min(1, yMax - yMin)),
      })
    }
    const detections = nmsPerClass(candidates, NMS_IOU_THRESHOLD)
    return { detections }
  } catch (err) {
    console.warn('[NudeNet] Inference failed:', err)
    return null
  }
}

export interface NudeNetTagPrior {
  name: string
  confidence: number
  source: 'nudenet'
}

/**
 * Aggregate NudeNet detections across frames into rich_tag priors.
 * Per tag: max confidence across all frames it appeared in, scaled
 * mildly upward when ≥3 frames agreed (cross-frame consensus).
 *
 * Confidence floor of 0.5 because body-part detection is high
 * precision — a tagged "exposed breasts" detection isn't going to
 * be a false positive often.
 */
export async function detectNudityAcrossFrames(framePaths: string[]): Promise<NudeNetTagPrior[]> {
  if (framePaths.length === 0) return []
  await loadModel()
  if (!session) return []

  const sample = framePaths.slice(0, 6)
  // tagName → { maxScore, frameAppearances }
  const accum = new Map<string, { max: number; frames: number }>()
  let framesAnalyzed = 0
  for (const fp of sample) {
    const r = await detectNudity(fp)
    if (!r) continue
    framesAnalyzed += 1
    // Per frame, take the best detection per tag (otherwise multi-
    // detections of the same body part inflate the frame count).
    const perTag = new Map<string, number>()
    for (const det of r.detections) {
      const tag = CLASS_TO_TAG[det.classIdx]
      if (!tag) continue
      const cur = perTag.get(tag) ?? 0
      if (det.score > cur) perTag.set(tag, det.score)
    }
    for (const [tag, score] of perTag.entries()) {
      const entry = accum.get(tag) ?? { max: 0, frames: 0 }
      if (score > entry.max) entry.max = score
      entry.frames += 1
      accum.set(tag, entry)
    }
  }
  if (framesAnalyzed === 0) return []

  const priors: NudeNetTagPrior[] = []
  for (const [name, { max, frames }] of accum.entries()) {
    // Frame-consensus boost: tags seen in ≥3 frames get +0.08.
    const consensusBoost = frames >= 3 ? 0.08 : 0
    priors.push({
      name,
      confidence: Math.min(0.95, Math.max(0.5, max) + consensusBoost),
      source: 'nudenet',
    })
  }
  console.log(`[NudeNet] ${framesAnalyzed}/${sample.length} frames; ${priors.length} tags: [${priors.map((p) => `${p.name}=${p.confidence.toFixed(2)}`).join(', ')}]`)
  return priors
}
