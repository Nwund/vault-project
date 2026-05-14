// File: src/main/services/ai-intelligence/ai-image-detector.ts
//
// Image-level AI-generated content detector. Complements the
// face-level deepfake-detector (which scores face crops from YuNet).
// This module scores the WHOLE FRAME — useful for catching SD /
// Midjourney / Flux outputs where there's no face, or where the
// telltale is in hands / background artifacts / texture coherency
// rather than the face.
//
// Reference architecture: SigLIP-base / DINOv2-base backbone with a
// binary classifier head (real vs ai-generated). Both models export
// to ONNX; either works in this module's runtime — input shape is
// auto-detected from the loaded session.
//
// Manual install — drop ONNX at:
//   <userData>/models/ai-image-detector.onnx
//
// Expected model:
//   Input  : NCHW float32 RGB, ImageNet normalized.
//            SigLIP-base: 224×224. DINOv2-base: 224×224. Auto-detected.
//   Output : [1, 2] softmax over [real, ai] OR [1, 1] sigmoid P(ai).
//
// Auto-load pattern matches gender-classifier / deepfake-detector.
// Returns null on missing model.

import fs from 'node:fs'
import path from 'node:path'
import { app } from 'electron'

let ort: any = null
let sharp: any = null

let inputSize = 224
let outputIsSigmoid = false

const DEFAULT_AI_THRESHOLD = 0.7
const IMAGENET_MEAN = [0.485, 0.456, 0.406]
const IMAGENET_STD = [0.229, 0.224, 0.225]

let session: any = null
let initialized = false
let modelPath: string | null = null

function getModelPath(): string {
  return path.join(app.getPath('userData'), 'models', 'ai-image-detector.onnx')
}

export function isAiImageDetectorAvailable(): boolean {
  modelPath = getModelPath()
  return fs.existsSync(modelPath)
}

async function loadModel(): Promise<void> {
  if (initialized) return
  if (!isAiImageDetectorAvailable()) {
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
    try {
      const meta = session.inputMetadata?.[session.inputNames[0]]
      const dims: number[] | undefined = meta?.dimensions
      if (Array.isArray(dims) && dims.length >= 3) {
        const spatial = dims[dims.length - 1]
        if (typeof spatial === 'number' && spatial > 32 && spatial <= 512) {
          inputSize = spatial
        }
      }
    } catch { /* fall through to default 224 */ }
    console.log(`[AiImageDetector] Loaded ${modelPath} — ${inputSize}×${inputSize} RGB`)
  } catch (err) {
    console.warn('[AiImageDetector] Load failed:', err)
    session = null
  } finally {
    initialized = true
  }
}

export interface AiImageScore {
  /** 0..1, higher = more likely AI-generated. */
  ai: number
  /** 0..1, complement. */
  real: number
  /** True when ai ≥ threshold. */
  label: 'ai-generated' | 'real'
}

/**
 * Score an entire frame. Returns null when the model isn't installed
 * or sharp can't read the file.
 */
export async function scoreFrame(
  framePath: string,
  options?: { threshold?: number }
): Promise<AiImageScore | null> {
  await loadModel()
  if (!session || !fs.existsSync(framePath)) return null
  try {
    const buf = await sharp(framePath)
      .resize(inputSize, inputSize, { fit: 'cover' })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true })
    const rgb = buf.data as Buffer
    const planeSize = inputSize * inputSize
    if (rgb.length < planeSize * 3) return null

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

    let pred: any = null
    for (const name of session.outputNames) {
      const t = out[name]
      const last = t.dims[t.dims.length - 1]
      if (last === 2 || last === 1) { pred = t; break }
    }
    if (!pred) return null
    const data = pred.data as Float32Array

    let ai = 0
    if (data.length === 2) {
      outputIsSigmoid = false
      // Logits [real, ai]. Standard SigLIP/DINOv2 binary head order.
      const expR = Math.exp(data[0])
      const expA = Math.exp(data[1])
      const sum = expR + expA || 1
      ai = expA / sum
    } else if (data.length === 1) {
      outputIsSigmoid = true
      const v = data[0]
      ai = v >= 0 && v <= 1 ? v : 1 / (1 + Math.exp(-v))
    } else {
      return null
    }
    const real = 1 - ai
    const threshold = options?.threshold ?? DEFAULT_AI_THRESHOLD
    return { ai, real, label: ai >= threshold ? 'ai-generated' : 'real' }
  } catch (err) {
    console.warn('[AiImageDetector] Inference failed:', err)
    return null
  }
}

export interface AiImageTagPrior {
  name: string
  confidence: number
  source: 'ai-image'
}

/**
 * Multi-frame consensus: score each provided frame, take the median ai
 * probability (less noisy than max for short videos with one weird
 * frame). Emits tag priors when median crosses threshold.
 */
export async function aiImageTagPriorsForFrames(
  framePaths: string[],
  options?: { threshold?: number }
): Promise<AiImageTagPrior[]> {
  if (!isAiImageDetectorAvailable() || framePaths.length === 0) return []
  const scores: number[] = []
  for (const fp of framePaths) {
    const s = await scoreFrame(fp, options)
    if (s) scores.push(s.ai)
  }
  if (scores.length === 0) return []
  scores.sort((a, b) => a - b)
  const median = scores[Math.floor(scores.length / 2)]
  const threshold = options?.threshold ?? DEFAULT_AI_THRESHOLD
  if (median < threshold) return []
  return [
    { name: 'ai-generated', confidence: Math.min(0.95, median), source: 'ai-image' },
    // Common porn-site synonyms — canonical-tags normalizer collapses.
    { name: 'ai art', confidence: Math.min(0.9, median), source: 'ai-image' },
  ]
}

/** Status helper for the Setup tab card. */
export function getAiImageDetectorStatus(): {
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
