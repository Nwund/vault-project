// File: src/main/services/ai-intelligence/miles-deep-classifier.ts
//
// Wrapper around ryanjay0/miles-deep ResNet50_1by2 for 6-class sex-act
// classification (~95.2% accuracy per author). Original model is Caffe;
// using here requires a manual ONNX conversion or a community ONNX
// drop in models/miles-deep.onnx. When the file is absent the
// classifier is a no-op — Vault continues using its other Tier 1
// signals.
//
// Classes (in the order the original model emits them):
//   0: blowjob/handjob
//   1: cunnilingus
//   2: other
//   3: sex_back
//   4: sex_front
//   5: titfuck
//
// Output is mapped onto Vault's tag vocab via CLASS_TO_TAGS below.
//
// To enable:
//   1. Convert the Caffe model: see ryanjay0/miles-deep README +
//      caffe2onnx, OR find a community ONNX upload.
//   2. Drop the file at <userData>/models/miles-deep.onnx
//   3. Restart Vault. The classifier auto-detects + uses the model.

import fs from 'node:fs'
import path from 'node:path'
import { app } from 'electron'

// Lazy-load ONNX runtime + sharp — only when the model file exists.
let ort: any = null
let sharp: any = null

const CLASS_LABELS = [
  'blowjob_handjob',
  'cunnilingus',
  'other',
  'sex_back',
  'sex_front',
  'titfuck',
] as const

// Map miles-deep's coarse classes onto Vault's canonical tag vocab.
// "sex_back" / "sex_front" describe camera angle relative to the
// performers — we emit both `sex` (always) plus angle-specific tags
// like `doggystyle` or `missionary` as priors when confidence is high.
const CLASS_TO_TAGS: Record<typeof CLASS_LABELS[number], string[]> = {
  blowjob_handjob: ['blowjob', 'handjob'],
  cunnilingus: ['cunnilingus', 'pussy eating'],
  other: [],
  sex_back: ['doggystyle', 'reverse cowgirl'],
  sex_front: ['missionary', 'cowgirl'],
  titfuck: ['titjob', 'titty fuck'],
}

let session: any = null
let initialized = false
let modelPath: string | null = null

function getModelPath(): string {
  return path.join(app.getPath('userData'), 'models', 'miles-deep.onnx')
}

export function isMilesDeepAvailable(): boolean {
  modelPath = getModelPath()
  return fs.existsSync(modelPath)
}

async function loadModel(): Promise<void> {
  if (initialized) return
  if (!isMilesDeepAvailable()) {
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
    console.log(`[MilesDeep] Loaded ${modelPath}`)
  } catch (err) {
    console.warn('[MilesDeep] Load failed:', err)
    session = null
  } finally {
    initialized = true
  }
}

export interface MilesDeepResult {
  classifications: Array<{ label: string; confidence: number }>
  /** Direct tag priors derived from the top class. */
  tagPriors: Array<{ name: string; confidence: number }>
}

/**
 * Classify a single frame. Returns null when the model isn't available
 * or inference fails.
 *
 * Input preprocessing: 224×224 center crop after 256×256 resize,
 * BGR (matching miles-deep's Caffe training), mean-subtract
 * [104, 117, 123]. This mirrors the original model's expectations.
 */
export async function classifyFrame(framePath: string): Promise<MilesDeepResult | null> {
  await loadModel()
  if (!session || !fs.existsSync(framePath)) return null
  try {
    // 256x256 resize → 224x224 center crop → BGR → float32 → mean-sub
    const buf = await sharp(framePath)
      .resize(256, 256, { fit: 'fill' })
      .extract({ left: 16, top: 16, width: 224, height: 224 })
      .raw()
      .toBuffer({ resolveWithObject: true })
    const rgb = buf.data as Buffer
    const float = new Float32Array(3 * 224 * 224)
    // NCHW layout, BGR channel order, mean-subtracted.
    const mean = [104, 117, 123]
    for (let i = 0; i < 224 * 224; i++) {
      const r = rgb[i * 3]
      const g = rgb[i * 3 + 1]
      const b = rgb[i * 3 + 2]
      float[0 * 224 * 224 + i] = b - mean[0]
      float[1 * 224 * 224 + i] = g - mean[1]
      float[2 * 224 * 224 + i] = r - mean[2]
    }
    const tensor = new ort.Tensor('float32', float, [1, 3, 224, 224])
    const feeds: Record<string, any> = {}
    feeds[session.inputNames[0]] = tensor
    const output = await session.run(feeds)
    const out = output[session.outputNames[0]]
    // Softmax over 6 logits.
    const logits = Array.from(out.data as Float32Array) as number[]
    const expVals = logits.map((v) => Math.exp(v))
    const sumExp = expVals.reduce((a, b) => a + b, 0) || 1
    const probs = expVals.map((v) => v / sumExp)
    const classifications = CLASS_LABELS.map((label, i) => ({
      label,
      confidence: probs[i],
    })).sort((a, b) => b.confidence - a.confidence)

    // Derive tag priors from the top class — but only if it cleared
    // a confidence floor + isn't the catch-all 'other'.
    const tagPriors: MilesDeepResult['tagPriors'] = []
    const top = classifications[0]
    if (top.label !== 'other' && top.confidence >= 0.5) {
      const tags = CLASS_TO_TAGS[top.label as keyof typeof CLASS_TO_TAGS] ?? []
      for (const t of tags) {
        tagPriors.push({ name: t, confidence: top.confidence })
      }
    }
    return { classifications, tagPriors }
  } catch (err) {
    console.warn('[MilesDeep] Inference failed:', err)
    return null
  }
}

/**
 * Classify a list of frames and aggregate. Each tag's confidence is
 * the MAX across frames that emitted it. Used by the queue to fold
 * miles-deep priors into Tier 2's rich_tags.
 */
export async function classifyFrames(framePaths: string[]): Promise<MilesDeepResult['tagPriors']> {
  const accum = new Map<string, number>()
  for (const f of framePaths.slice(0, 6)) {
    const r = await classifyFrame(f)
    if (!r) continue
    for (const p of r.tagPriors) {
      const cur = accum.get(p.name) ?? 0
      if (p.confidence > cur) accum.set(p.name, p.confidence)
    }
  }
  return Array.from(accum.entries()).map(([name, confidence]) => ({ name, confidence }))
}
