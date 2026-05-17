// File: src/main/services/ai-intelligence/panns-segmenter.ts
//
// #122 — PANNs CNN14 music vs speech vs SFX segmenter.
//
// Lightweight (~80 MB) framework-level AudioSet classifier we run
// alongside BEATs. PANNs is faster and gives smoother frame-level
// probability tracks, which we collapse into "music" / "speech" /
// "sfx" / "ambient" segments stored in a new audio_segments table.
//
// Two downstream uses:
//   - "Skip to dialogue" / "skip to action" scrubber overlays.
//   - Chapter detection: when the speech/music ratio flips for >5s,
//     mark a chapter boundary.
//
// ACTIVATION: drop ONNX at <userData>/models/panns-cnn14.onnx.

import fs from 'node:fs'
import path from 'node:path'
import { app } from 'electron'

let ort: any = null
let session: any = null
let _loadAttempted = false

const TARGET_SR = 32_000  // PANNs trained on 32kHz
const FRAME_SAMPLES = 32_000  // 1s frames

function modelPath(): string {
  return path.join(app.getPath('userData'), 'models', 'panns-cnn14.onnx')
}

export function isPannsAvailable(): boolean {
  try { return fs.existsSync(modelPath()) } catch { return false }
}

async function loadModel(): Promise<boolean> {
  if (session) return true
  if (_loadAttempted) return false
  _loadAttempted = true
  if (!isPannsAvailable()) {
    console.log(`[PANNs] No model at ${modelPath()} — segmenter disabled.`)
    return false
  }
  try {
    if (!ort) ort = require('onnxruntime-node')
    session = await ort.InferenceSession.create(modelPath(), { executionProviders: ['cpu'] })
    console.log('[PANNs] Loaded CNN14 segmenter')
    return true
  } catch (err) {
    console.warn('[PANNs] Failed to load:', err)
    return false
  }
}

export type SegmentKind = 'music' | 'speech' | 'sfx' | 'ambient'

export interface SegmentSpan {
  startSec: number
  endSec: number
  kind: SegmentKind
  confidence: number
}

/**
 * Take 1-second mono float32 frames at 32kHz, return PANNs class
 * probabilities collapsed into our 4-bucket taxonomy.
 *
 * Returns null when model unavailable.
 */
export async function classifyFrame(samples: Float32Array): Promise<{ kind: SegmentKind; confidence: number } | null> {
  if (!session && !(await loadModel())) return null
  if (samples.length !== FRAME_SAMPLES) {
    console.warn(`[PANNs] expected ${FRAME_SAMPLES} samples per frame, got ${samples.length}`)
    return null
  }
  try {
    const input = new ort.Tensor('float32', samples, [1, FRAME_SAMPLES])
    const feeds: Record<string, any> = {}
    feeds[session.inputNames?.[0] ?? 'waveform'] = input
    const output = await session.run(feeds)
    const logits = new Float32Array((Object.values(output)[0] as any).data)
    return collapseTo4Bucket(logits)
  } catch (err) {
    console.warn('[PANNs] inference failed:', err)
    return null
  }
}

/**
 * Run classifyFrame() over N consecutive frames and collapse into
 * contiguous segments. Smooths with a 3-frame median so isolated
 * mis-classifications don't create 1s segments.
 */
export async function segmentFrames(framesPerSec: Float32Array[]): Promise<SegmentSpan[]> {
  if (framesPerSec.length === 0) return []
  const labels: Array<{ kind: SegmentKind; confidence: number }> = []
  for (const f of framesPerSec) {
    const r = await classifyFrame(f)
    if (r) labels.push(r)
    else labels.push({ kind: 'ambient', confidence: 0.5 })
  }
  // 3-frame median smoothing on the kind.
  const smoothed = labels.map((_, i) => {
    if (i === 0 || i === labels.length - 1) return labels[i].kind
    const counts: Record<string, number> = {}
    for (let k = i - 1; k <= i + 1; k++) counts[labels[k].kind] = (counts[labels[k].kind] ?? 0) + 1
    const best = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]
    return best[0] as SegmentKind
  })
  // Collapse runs of identical labels into segments.
  const out: SegmentSpan[] = []
  let runStart = 0
  for (let i = 1; i <= smoothed.length; i++) {
    if (i === smoothed.length || smoothed[i] !== smoothed[runStart]) {
      const confSum = labels.slice(runStart, i).reduce((s, l) => s + l.confidence, 0)
      out.push({
        startSec: runStart,
        endSec: i,
        kind: smoothed[runStart],
        confidence: confSum / (i - runStart),
      })
      runStart = i
    }
  }
  return out
}

// Map the 527 AudioSet logits into our 4-bucket taxonomy. The exact
// indices live in the class-map CSV; rather than hardcoding all 527,
// we use index ranges that ROUGHLY correspond to each bucket
// (verified from PANNs paper table 1). Caller can tune via the
// indices.json companion file in a future iteration.
function collapseTo4Bucket(logits: Float32Array): { kind: SegmentKind; confidence: number } {
  // Apply sigmoid (PANNs uses BCE not softmax).
  const probs = new Float32Array(logits.length)
  for (let i = 0; i < logits.length; i++) probs[i] = 1 / (1 + Math.exp(-logits[i]))
  // Rough AudioSet index buckets (the actual classes are sorted by
  // ontology in the published class-map):
  //   Speech-related: 0-71  (Human voice)
  //   Music-related:  137-282 (Music)
  //   Animals/SFX:    72-136 + 327-460
  //   Ambient:        everything else
  const sumRange = (lo: number, hi: number) => {
    let s = 0
    for (let i = lo; i < Math.min(hi, probs.length); i++) s += probs[i]
    return s
  }
  const speech = sumRange(0, 72)
  const music = sumRange(137, 283)
  const sfx = sumRange(72, 137) + sumRange(327, 461)
  const ambient = sumRange(283, 327) + sumRange(461, probs.length)
  const buckets: Array<[SegmentKind, number]> = [
    ['speech', speech],
    ['music', music],
    ['sfx', sfx],
    ['ambient', ambient],
  ]
  buckets.sort((a, b) => b[1] - a[1])
  const total = buckets.reduce((s, b) => s + b[1], 0) || 1
  return { kind: buckets[0][0], confidence: buckets[0][1] / total }
}

export function getPannsStatus(): {
  installed: boolean
  expectedPath: string
  sessionLoaded: boolean
  targetSampleRate: number
} {
  return {
    installed: isPannsAvailable(),
    expectedPath: modelPath(),
    sessionLoaded: session !== null,
    targetSampleRate: TARGET_SR,
  }
}
