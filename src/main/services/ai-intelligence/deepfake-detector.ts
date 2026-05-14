// File: src/main/services/ai-intelligence/deepfake-detector.ts
//
// Deepfake / AI-generated-face detector. Pairs with the OpenFake-2024
// research line (synthetic-face binary classifier trained on a mix of
// SD/Midjourney/DALL-E + real photos). The detector runs on each face
// crop from YuNet and emits a "deepfake" / "ai-generated" tag prior
// when the model's fake probability crosses the threshold.
//
// Manual install — no canonical OpenFake checkpoint ships with Vault.
// Drop an ONNX at:
//   <userData>/models/deepfake-detector.onnx
//
// Expected model shapes (auto-detected via input/output dim):
//   - Input  : NCHW float32 RGB 224×224 (ImageNet normalized) — typical
//              for OpenFake / Xception variants. We also support 299×299
//              when the loaded session reports `dims[2] === 299`.
//   - Output : either [1, 2] softmax (logits) over [real, fake], OR
//              [1, 1] sigmoid scalar P(fake). Both layouts auto-detected.
//
// Same auto-load pattern as gender-classifier — null on missing model,
// caller falls through.

import fs from 'node:fs'
import path from 'node:path'
import { app } from 'electron'
import type { FaceDetection } from './face-detector'

let ort: any = null
let sharp: any = null

// Auto-detected from the loaded session.
let inputSize = 224
let outputIsSigmoid = false  // true → [1,1] P(fake), false → [1,2] softmax [P(real), P(fake)]

// Tag confidence threshold — face-level P(fake) must clear this to
// emit a "deepfake" prior. The model has well-known false-positive
// modes on heavy-makeup / heavy-filtered photos; default 0.75 keeps
// precision high. User can tune via settings.ai.deepfakeThreshold.
const DEFAULT_FAKE_THRESHOLD = 0.75
const IMAGENET_MEAN = [0.485, 0.456, 0.406]
const IMAGENET_STD = [0.229, 0.224, 0.225]

let session: any = null
let initialized = false
let modelPath: string | null = null

function getModelPath(): string {
  return path.join(app.getPath('userData'), 'models', 'deepfake-detector.onnx')
}

export function isDeepfakeDetectorAvailable(): boolean {
  modelPath = getModelPath()
  return fs.existsSync(modelPath)
}

async function loadModel(): Promise<void> {
  if (initialized) return
  if (!isDeepfakeDetectorAvailable()) {
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
    // Pick up the model's expected input spatial dim if it's an Xception
    // variant (299×299). Default stays at 224 for ViT/MobileNet variants.
    try {
      const meta = session.inputMetadata?.[session.inputNames[0]]
      const dims: number[] | undefined = meta?.dimensions
      if (Array.isArray(dims) && dims.length >= 3) {
        const spatial = dims[dims.length - 1]
        if (typeof spatial === 'number' && spatial > 32 && spatial <= 512) {
          inputSize = spatial
        }
      }
    } catch { /* metadata not always present; keep default */ }
    console.log(`[DeepfakeDetector] Loaded ${modelPath} — ${inputSize}×${inputSize} RGB`)
  } catch (err) {
    console.warn('[DeepfakeDetector] Load failed:', err)
    session = null
  } finally {
    initialized = true
  }
}

export interface DeepfakeScore {
  /** 0..1, higher = more likely AI-generated / deepfaked. */
  fake: number
  /** 0..1, complement; included for caller convenience. */
  real: number
  /** True when fake ≥ threshold. */
  label: 'fake' | 'real'
}

/**
 * Score a single face crop. Returns null when the model isn't
 * installed or the crop is too small to be meaningful.
 */
export async function scoreFace(
  framePath: string,
  bbox: { x: number; y: number; w: number; h: number },
  options?: { threshold?: number }
): Promise<DeepfakeScore | null> {
  await loadModel()
  if (!session || !fs.existsSync(framePath)) return null
  try {
    const meta = await sharp(framePath).metadata()
    const srcW = meta.width ?? 0
    const srcH = meta.height ?? 0
    if (srcW < 32 || srcH < 32) return null
    const left = Math.max(0, Math.floor(bbox.x * srcW))
    const top = Math.max(0, Math.floor(bbox.y * srcH))
    const cropW = Math.max(16, Math.min(srcW - left, Math.floor(bbox.w * srcW)))
    const cropH = Math.max(16, Math.min(srcH - top, Math.floor(bbox.h * srcH)))
    const buf = await sharp(framePath)
      .extract({ left, top, width: cropW, height: cropH })
      .resize(inputSize, inputSize, { fit: 'fill' })
      .raw()
      .toBuffer({ resolveWithObject: true })
    const rgb = buf.data as Buffer

    const planeSize = inputSize * inputSize
    const float = new Float32Array(3 * planeSize)
    for (let i = 0; i < planeSize; i++) {
      const r = rgb[i * 3] / 255
      const g = rgb[i * 3 + 1] / 255
      const b = rgb[i * 3 + 2] / 255
      float[0 * planeSize + i] = (r - IMAGENET_MEAN[0]) / IMAGENET_STD[0]
      float[1 * planeSize + i] = (g - IMAGENET_MEAN[1]) / IMAGENET_STD[1]
      float[2 * planeSize + i] = (b - IMAGENET_MEAN[2]) / IMAGENET_STD[2]
    }
    const tensor = new ort.Tensor('float32', float, [1, 3, inputSize, inputSize])
    const feeds: Record<string, any> = {}
    feeds[session.inputNames[0]] = tensor
    const out = await session.run(feeds)

    // Find the prediction tensor. Two common shapes:
    //   [1, 2] → softmax over [real, fake]
    //   [1, 1] → sigmoid P(fake)
    let pred: any = null
    for (const name of session.outputNames) {
      const t = out[name]
      const last = t.dims[t.dims.length - 1]
      if (last === 2 || last === 1) { pred = t; break }
    }
    if (!pred) return null
    const data = pred.data as Float32Array

    let fake = 0
    if (data.length === 2) {
      outputIsSigmoid = false
      // Softmax over logits. Label order: [real, fake]. The OpenFake
      // checkpoint uses this layout; if the user dropped a model with
      // reversed order, they should rename the file to deepfake-detector-flip.onnx
      // and we'd need a settings flag — keeping that simple for now.
      const expR = Math.exp(data[0])
      const expF = Math.exp(data[1])
      const sum = expR + expF || 1
      fake = expF / sum
    } else if (data.length === 1) {
      outputIsSigmoid = true
      // Sigmoid output. If model was trained with logit output, run
      // sigmoid; if it's already 0..1, value passes through unchanged.
      const v = data[0]
      fake = v >= 0 && v <= 1 ? v : 1 / (1 + Math.exp(-v))
    } else {
      return null
    }
    const real = 1 - fake
    const threshold = options?.threshold ?? DEFAULT_FAKE_THRESHOLD
    return { fake, real, label: fake >= threshold ? 'fake' : 'real' }
  } catch (err) {
    console.warn('[DeepfakeDetector] Inference failed:', err)
    return null
  }
}

export interface DeepfakeTagPrior {
  name: string
  confidence: number
  source: 'deepfake'
}

/**
 * Run the detector across every face in a frame and aggregate into a
 * single tag prior. Returns null when no faces clear the threshold.
 *
 * Aggregation rule: take the MAX fake score across all detected
 * faces. One unambiguously fake face in a multi-face frame is enough
 * to flag the whole image as AI-generated content.
 */
export async function deepfakeTagPriorsForFrame(
  framePath: string,
  faces: FaceDetection[],
  options?: { threshold?: number }
): Promise<DeepfakeTagPrior[]> {
  if (!isDeepfakeDetectorAvailable() || faces.length === 0) return []
  const threshold = options?.threshold ?? DEFAULT_FAKE_THRESHOLD
  let maxFake = 0
  for (const f of faces) {
    const score = await scoreFace(framePath, { x: f.x, y: f.y, w: f.w, h: f.h }, { threshold })
    if (score && score.fake > maxFake) maxFake = score.fake
  }
  if (maxFake < threshold) return []
  // Emit both "deepfake" (which is the porn-site filter category) AND
  // "ai-generated" (broader umbrella that covers SD/Midjourney outputs).
  // Pick whichever the user has in their library; the canonical-tags
  // normalizer collapses synonyms.
  return [
    { name: 'deepfake', confidence: Math.min(0.95, maxFake), source: 'deepfake' },
    { name: 'ai-generated', confidence: Math.min(0.9, maxFake), source: 'deepfake' },
  ]
}

/** Status helper for the Setup tab card. */
export function getDeepfakeDetectorStatus(): {
  installed: boolean
  expectedPath: string
  sizeBytes: number
  inputSize: number
  outputShape: 'softmax-2' | 'sigmoid-1' | 'unknown'
} {
  const expectedPath = getModelPath()
  let installed = false
  let sizeBytes = 0
  try {
    const stat = fs.statSync(expectedPath)
    installed = stat.isFile()
    sizeBytes = stat.size
  } catch { /* not installed */ }
  return {
    installed,
    expectedPath,
    sizeBytes,
    inputSize: installed ? inputSize : 0,
    outputShape: installed
      ? (initialized ? (outputIsSigmoid ? 'sigmoid-1' : 'softmax-2') : 'unknown')
      : 'unknown',
  }
}
