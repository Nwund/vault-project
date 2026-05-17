// File: src/main/services/ai-intelligence/joytag-tagger.ts
//
// JoyTag — purpose-built adult-content tagger (better recall than
// WD-Tagger on porn-specific labels). 366 MB ONNX, runs on CPU or
// CUDA via onnxruntime-node. No sidecar dependency.
//
// Activation: drop joytag.onnx + joytag-top-tags.txt at
// <userData>/models/. The model expects 448×448 RGB normalized to
// [-1, 1]; output is a single 8 800-class sigmoid head where each
// dim corresponds to a tag in top_tags.txt.
//
// Threshold: 0.4 default (lower than WD-Tagger because JoyTag is
// trained for higher recall). Caller can pass `threshold` to tune.

import * as path from 'node:path'
import * as fs from 'node:fs'
import { app } from 'electron'

let ort: any = null
let sharp: any = null

interface State {
  session: any
  inputName: string
  outputName: string
  tags: string[]
}

let cached: State | null = null
let initFailed = false

const MODEL_FILE = 'joytag.onnx'
const TAGS_FILE = 'joytag-top-tags.txt'
const INPUT_SIZE = 448
const DEFAULT_THRESHOLD = 0.4

function getModelPath(): string {
  return path.join(app.getPath('userData'), 'models', MODEL_FILE)
}

function getTagsPath(): string {
  return path.join(app.getPath('userData'), 'models', TAGS_FILE)
}

export function isAvailable(): boolean {
  try { return fs.existsSync(getModelPath()) && fs.existsSync(getTagsPath()) } catch { return false }
}

async function initialize(): Promise<State | null> {
  if (cached) return cached
  if (initFailed) return null
  if (!isAvailable()) return null
  try {
    if (!ort) ort = require('onnxruntime-node')
    if (!sharp) sharp = require('sharp')
    const session = await ort.InferenceSession.create(getModelPath(), {
      executionProviders: ['cuda', 'cpu'],
      graphOptimizationLevel: 'all',
    })
    const tags = fs.readFileSync(getTagsPath(), 'utf8')
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)
    cached = {
      session,
      inputName: session.inputNames[0],
      outputName: session.outputNames[0],
      tags,
    }
    console.log(`[JoyTag] loaded (${tags.length} tags, input=${cached.inputName})`)
    return cached
  } catch (err) {
    console.error('[JoyTag] init failed:', err)
    initFailed = true
    return null
  }
}

export interface JoyTagResult {
  tag: string
  score: number
}

export async function tagImage(imagePath: string, options: { threshold?: number; topK?: number } = {}): Promise<JoyTagResult[]> {
  const ctx = await initialize()
  if (!ctx) return []
  const threshold = options.threshold ?? DEFAULT_THRESHOLD
  const topK = options.topK ?? 50

  // Preprocess: center-crop + resize to 448, normalize to [-1, 1].
  const raw = await sharp(imagePath)
    .removeAlpha()
    .resize(INPUT_SIZE, INPUT_SIZE, { fit: 'cover', position: 'centre' })
    .raw()
    .toBuffer()
  const tensor = new Float32Array(3 * INPUT_SIZE * INPUT_SIZE)
  // HWC uint8 → CHW float32, normalize.
  const plane = INPUT_SIZE * INPUT_SIZE
  for (let y = 0; y < INPUT_SIZE; y++) {
    for (let x = 0; x < INPUT_SIZE; x++) {
      const src = (y * INPUT_SIZE + x) * 3
      const dst = y * INPUT_SIZE + x
      tensor[dst] = (raw[src] / 127.5) - 1
      tensor[dst + plane] = (raw[src + 1] / 127.5) - 1
      tensor[dst + 2 * plane] = (raw[src + 2] / 127.5) - 1
    }
  }
  const input = new ort.Tensor('float32', tensor, [1, 3, INPUT_SIZE, INPUT_SIZE])
  const feeds: Record<string, any> = {}
  feeds[ctx.inputName] = input
  const out = await ctx.session.run(feeds)
  const outTensor = out[ctx.outputName]
  const data = outTensor.data as Float32Array

  // Sigmoid is applied in some exports, raw logits in others — detect.
  // If max > 1 we treat as logits and apply sigmoid; else as probs.
  let maxVal = -Infinity
  for (let i = 0; i < data.length; i++) if (data[i] > maxVal) maxVal = data[i]
  const probs = maxVal > 1
    ? Array.from(data, (x) => 1 / (1 + Math.exp(-x)))
    : Array.from(data)

  const results: JoyTagResult[] = []
  for (let i = 0; i < probs.length && i < ctx.tags.length; i++) {
    if (probs[i] >= threshold) {
      results.push({ tag: ctx.tags[i], score: probs[i] })
    }
  }
  results.sort((a, b) => b.score - a.score)
  return results.slice(0, topK)
}

export function getStatus(): { available: boolean; loaded: boolean; modelPath: string; tagsPath: string; tagCount: number } {
  return {
    available: isAvailable(),
    loaded: cached !== null,
    modelPath: getModelPath(),
    tagsPath: getTagsPath(),
    tagCount: cached?.tags.length ?? 0,
  }
}
