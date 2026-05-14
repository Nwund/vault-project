// File: src/main/services/ai-intelligence/gender-classifier.ts
//
// Tiny gender classifier that runs on each face crop from YuNet.
// Output goes into the queue's rich_tag pool as composition priors:
//   - all female faces → "lesbian" (when face count ≥ 2)
//   - all male faces → "gay" (when face count ≥ 2)
//   - mixed F+M → "straight" / "MMF threesome" / "MFF threesome" / etc.
//
// Manual install — the canonical Intel age-gender-recognition-retail
// model ships as OpenVINO IR, not ONNX. Community conversions exist
// but mirrors are unreliable (same problem as miles-deep / NudeNet).
// User drops the ONNX at:
//   <userData>/models/gender-classifier.onnx
//
// Expected model: 62×62 BGR input, NCHW float32, single output tensor
// shape [1, 2] (softmax: [P(female), P(male)]). The Intel model uses
// this layout — community ONNX exports preserve it. If your model
// returns [1, 1] (sigmoid: P(male)), the wrapper handles that too.

import fs from 'node:fs'
import path from 'node:path'
import { app } from 'electron'
import type { FaceDetection } from './face-detector'

let ort: any = null
let sharp: any = null

// Two supported model families:
//   Intel age-gender-recognition-retail-0013 → 62×62 BGR, [1,2] sigmoid
//   HuggingFace ViT gender classifier        → 224×224 RGB ImageNet, [1,2] softmax
// Format auto-detected from the loaded session's input name +
// dimensions. ViT uses `pixel_values` (HF naming convention).
let inputSize = 62
let useViTPreprocessing = false  // true → HF ViT (RGB normalized), false → Intel (BGR raw)
let outputIsSoftmax = true  // true → softmax to female/male, false → sigmoid (assumes [P(female), P(male)] or [P(male)])

const FEMALE_THRESHOLD = 0.6
const MALE_THRESHOLD = 0.6
// HuggingFace ViT image preprocessing constants (ImageNet defaults).
const IMAGENET_MEAN = [0.485, 0.456, 0.406]
const IMAGENET_STD = [0.229, 0.224, 0.225]

let session: any = null
let initialized = false
let modelPath: string | null = null

function getModelPath(): string {
  return path.join(app.getPath('userData'), 'models', 'gender-classifier.onnx')
}

export function isGenderClassifierAvailable(): boolean {
  modelPath = getModelPath()
  return fs.existsSync(modelPath)
}

async function loadModel(): Promise<void> {
  if (initialized) return
  if (!isGenderClassifierAvailable()) {
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
    // Auto-detect model format by input name. HuggingFace ViT models
    // use 'pixel_values'; Intel age-gender-retail uses 'data' or similar.
    const inputName = session.inputNames[0]
    if (inputName === 'pixel_values') {
      useViTPreprocessing = true
      inputSize = 224  // ViT-base standard
      outputIsSoftmax = true
      console.log(`[GenderClassifier] Loaded ${modelPath} — HF ViT format (224×224 RGB)`)
    } else {
      useViTPreprocessing = false
      inputSize = 62
      outputIsSoftmax = false
      console.log(`[GenderClassifier] Loaded ${modelPath} — Intel format (62×62 BGR)`)
    }
  } catch (err) {
    console.warn('[GenderClassifier] Load failed:', err)
    session = null
  } finally {
    initialized = true
  }
}

export interface FaceGender {
  /** 'female' / 'male' / null when both probs are below threshold. */
  label: 'female' | 'male' | null
  female: number  // 0-1
  male: number    // 0-1
}

/**
 * Classify a single face crop. Takes the original frame + a face
 * bounding box (normalized 0-1) and runs the classifier on the
 * cropped + resized region.
 */
export async function classifyFace(
  framePath: string,
  bbox: { x: number; y: number; w: number; h: number }
): Promise<FaceGender | null> {
  await loadModel()
  if (!session || !fs.existsSync(framePath)) return null
  try {
    const meta = await sharp(framePath).metadata()
    const srcW = meta.width ?? 0
    const srcH = meta.height ?? 0
    if (srcW < 16 || srcH < 16) return null
    const left = Math.max(0, Math.floor(bbox.x * srcW))
    const top = Math.max(0, Math.floor(bbox.y * srcH))
    const cropW = Math.max(8, Math.min(srcW - left, Math.floor(bbox.w * srcW)))
    const cropH = Math.max(8, Math.min(srcH - top, Math.floor(bbox.h * srcH)))
    const buf = await sharp(framePath)
      .extract({ left, top, width: cropW, height: cropH })
      .resize(inputSize, inputSize, { fit: 'fill' })
      .raw()
      .toBuffer({ resolveWithObject: true })
    const rgb = buf.data as Buffer
    const float = new Float32Array(3 * inputSize * inputSize)
    if (useViTPreprocessing) {
      // HuggingFace ViT — RGB normalized with ImageNet mean/std,
      // NCHW float32, values in roughly [-2, +2] range.
      for (let i = 0; i < inputSize * inputSize; i++) {
        const r = rgb[i * 3] / 255
        const g = rgb[i * 3 + 1] / 255
        const b = rgb[i * 3 + 2] / 255
        float[0 * inputSize * inputSize + i] = (r - IMAGENET_MEAN[0]) / IMAGENET_STD[0]
        float[1 * inputSize * inputSize + i] = (g - IMAGENET_MEAN[1]) / IMAGENET_STD[1]
        float[2 * inputSize * inputSize + i] = (b - IMAGENET_MEAN[2]) / IMAGENET_STD[2]
      }
    } else {
      // Intel model — BGR uint8 as float32, no normalization.
      for (let i = 0; i < inputSize * inputSize; i++) {
        const r = rgb[i * 3]
        const g = rgb[i * 3 + 1]
        const b = rgb[i * 3 + 2]
        float[0 * inputSize * inputSize + i] = b
        float[1 * inputSize * inputSize + i] = g
        float[2 * inputSize * inputSize + i] = r
      }
    }
    const tensor = new ort.Tensor('float32', float, [1, 3, inputSize, inputSize])
    const feeds: Record<string, any> = {}
    feeds[session.inputNames[0]] = tensor
    const output = await session.run(feeds)
    // Find the gender tensor — Intel's model emits two outputs (age, gender).
    // Gender is the one with last-dim 2 (or 1 for sigmoid variants).
    let genderTensor: any = null
    for (const name of session.outputNames) {
      const t = output[name]
      const last = t.dims[t.dims.length - 1]
      if (last === 2 || last === 1) { genderTensor = t; break }
    }
    if (!genderTensor) return null
    const data = genderTensor.data as Float32Array
    let female = 0
    let male = 0
    if (data.length === 2) {
      if (outputIsSoftmax) {
        // HuggingFace ViT emits logits — apply softmax. Label order
        // for onnx-community/gender-classification-ONNX: [Female, Male]
        // (id2label: 0=Female, 1=Male per the upstream HF config).
        const expF = Math.exp(data[0])
        const expM = Math.exp(data[1])
        const sum = expF + expM || 1
        female = expF / sum
        male = expM / sum
      } else {
        // Intel sigmoid output — probabilities directly.
        female = data[0]
        male = data[1]
      }
    } else if (data.length === 1) {
      male = data[0]
      female = 1 - data[0]
    } else {
      return null
    }
    let label: FaceGender['label'] = null
    if (female >= FEMALE_THRESHOLD && female > male) label = 'female'
    else if (male >= MALE_THRESHOLD && male > female) label = 'male'
    return { label, female, male }
  } catch (err) {
    console.warn('[GenderClassifier] Inference failed:', err)
    return null
  }
}

export interface GenderTagPrior {
  name: string
  confidence: number
  source: 'gender'
}

/**
 * Classify every face detected in every frame, vote on the modal
 * composition, emit composition priors. Same voting + confidence
 * pattern as the pose / face count detectors.
 *
 * Composition tags:
 *   - 1F  → "solo female"
 *   - 1M  → "solo male"
 *   - 2F  → "lesbian" + "couple"
 *   - 2M  → "gay" + "couple"
 *   - 1F+1M → "straight" + "couple"
 *   - mixed 3+ → "MFF" / "MMF" / "FFF" / "MMM" + group/threesome
 */
export async function classifyFacesAcrossFrames(
  framePaths: string[],
  frameDetections: Array<{ framePath: string; faces: FaceDetection[] }>
): Promise<GenderTagPrior[]> {
  if (frameDetections.length === 0) return []
  await loadModel()
  if (!session) return []

  const compositionVotes = new Map<string, number>()
  let framesAnalyzed = 0

  for (const fd of frameDetections.slice(0, 6)) {
    if (fd.faces.length === 0) continue
    framesAnalyzed += 1
    const labels: Array<FaceGender['label']> = []
    for (const face of fd.faces) {
      const r = await classifyFace(fd.framePath, face)
      labels.push(r?.label ?? null)
    }
    const fCount = labels.filter((l) => l === 'female').length
    const mCount = labels.filter((l) => l === 'male').length
    const composition = `${fCount}F${mCount}M`
    compositionVotes.set(composition, (compositionVotes.get(composition) ?? 0) + 1)
  }
  if (framesAnalyzed === 0) return []

  let modal = ''
  let modalVotes = 0
  for (const [comp, votes] of compositionVotes.entries()) {
    if (votes > modalVotes) { modal = comp; modalVotes = votes }
  }
  const agreement = modalVotes / framesAnalyzed
  const baseConf = Math.min(0.7, 0.45 + agreement * 0.25)

  const m = modal.match(/^(\d+)F(\d+)M$/)
  if (!m) return []
  const f = Number(m[1])
  const mc = Number(m[2])

  const priors: GenderTagPrior[] = []
  const push = (name: string, confDelta: number = 0) => {
    priors.push({ name, confidence: Math.max(0.4, baseConf + confDelta), source: 'gender' })
  }

  if (f === 1 && mc === 0) push('solo female')
  else if (f === 0 && mc === 1) push('solo male')
  else if (f === 2 && mc === 0) { push('lesbian'); push('couple', -0.05) }
  else if (f === 0 && mc === 2) { push('gay'); push('couple', -0.05) }
  else if (f === 1 && mc === 1) { push('straight', -0.05); push('couple', -0.05) }
  else if (f >= 2 && mc === 1) push('MFF threesome')
  else if (f === 1 && mc >= 2) push('MMF threesome')
  else if (f >= 3 && mc === 0) { push('lesbian'); push('group', -0.05) }
  else if (f === 0 && mc >= 3) { push('gay'); push('group', -0.05) }
  else if (f + mc >= 3) push('group', -0.05)

  console.log(
    `[GenderClassifier] ${framesAnalyzed} frames analyzed; ` +
    `modal composition=${modal} (${modalVotes}/${framesAnalyzed}); ` +
    `priors=[${priors.map((p) => `${p.name}=${p.confidence.toFixed(2)}`).join(', ')}]`
  )
  return priors
}
