// File: src/main/services/ai-intelligence/beats-tagger.ts
//
// #121 — BEATs audio tagger (Microsoft, 527-class AudioSet).
//
// BEATs is a transformer-based self-supervised audio encoder + linear
// classification head, exported to ONNX it weighs ~90 MB. We use it as
// a complement to the existing whisper.cpp pipeline: while Whisper
// covers speech-as-text, BEATs labels NON-speech events (moans,
// slaps, applause, glass-break, motorcycle, etc) using the 527 named
// classes from AudioSet.
//
// Pipeline integration:
//   - Run on the same 10s audio windows the audio-peak-detector
//     already extracts.
//   - Emit tags into a new `audio_event:<label>` namespace.
//   - Tier 2 prompt-builder reads the top-3 audio events as soft
//     priors so dialogue-heavy clips get different captions than
//     pure-vocal clips.
//
// ACTIVATION: drop ONNX at <userData>/models/beats-iter3-plus.onnx
// (plus class-map CSV). See extra-model-status registry entry.
//
// Status helpers + lazy-load follow the same pattern as
// deepfake-detector / aesthetic-predictor.

import fs from 'node:fs'
import path from 'node:path'
import { app } from 'electron'

let ort: any = null
let session: any = null
let classNames: string[] = []
let _loadAttempted = false

const TARGET_SR = 16_000     // BEATs expects 16kHz mono
const WINDOW_SAMPLES = 16_000 * 10  // 10s windows

function modelPath(): string {
  return path.join(app.getPath('userData'), 'models', 'beats-iter3-plus.onnx')
}

function classMapPath(): string {
  return path.join(app.getPath('userData'), 'models', 'beats-class-map.csv')
}

export function isBeatsAvailable(): boolean {
  try { return fs.existsSync(modelPath()) } catch { return false }
}

async function loadModel(): Promise<boolean> {
  if (session) return true
  if (_loadAttempted) return false
  _loadAttempted = true
  if (!isBeatsAvailable()) {
    console.log(`[BEATs] No model at ${modelPath()} — tagger disabled.`)
    return false
  }
  try {
    if (!ort) ort = require('onnxruntime-node')
    session = await ort.InferenceSession.create(modelPath(), {
      executionProviders: ['cpu'],
    })
    // Class names — one label per line. Fallback to `class_N` when missing.
    try {
      const csv = fs.readFileSync(classMapPath(), 'utf8')
      classNames = csv.split('\n').map((l) => l.trim()).filter(Boolean)
    } catch {
      classNames = Array.from({ length: 527 }, (_, i) => `audio_class_${i}`)
    }
    console.log(`[BEATs] Loaded model, ${classNames.length} classes`)
    return true
  } catch (err) {
    console.warn('[BEATs] Failed to load:', err)
    return false
  }
}

/**
 * Score a single audio window. Caller is responsible for decoding
 * the source file to mono 16kHz Float32 (the existing audio-peak
 * pipeline already does this via ffmpeg).
 *
 * Returns the top-K labels by probability or null when model isn't
 * loaded. Probabilities are softmax over the 527 classes.
 */
export async function tagAudioWindow(
  samples: Float32Array,
  topK = 5,
): Promise<Array<{ label: string; confidence: number }> | null> {
  if (!session && !(await loadModel())) return null
  if (samples.length !== WINDOW_SAMPLES) {
    console.warn(`[BEATs] expected ${WINDOW_SAMPLES} samples (10s @ 16kHz), got ${samples.length} — skipping`)
    return null
  }
  try {
    const input = new ort.Tensor('float32', samples, [1, WINDOW_SAMPLES])
    const feeds: Record<string, any> = {}
    // BEATs ONNX exports name the input either "input_values" or
    // "waveform" depending on the conversion script. Pick whichever
    // the session reports.
    const inputName = session.inputNames?.[0] ?? 'waveform'
    feeds[inputName] = input
    const output = await session.run(feeds)
    const logits = new Float32Array((Object.values(output)[0] as any).data)
    // Softmax for normalized probs (loses no information but easier
    // for the renderer to display as 0-100%).
    const max = Math.max(...logits)
    const exps = new Float32Array(logits.length)
    let sum = 0
    for (let i = 0; i < logits.length; i++) {
      exps[i] = Math.exp(logits[i] - max)
      sum += exps[i]
    }
    const scored: Array<{ label: string; confidence: number }> = []
    for (let i = 0; i < classNames.length && i < exps.length; i++) {
      scored.push({ label: classNames[i], confidence: exps[i] / sum })
    }
    scored.sort((a, b) => b.confidence - a.confidence)
    return scored.slice(0, topK)
  } catch (err) {
    console.warn('[BEATs] inference failed:', err)
    return null
  }
}

export function getBeatsStatus(): {
  installed: boolean
  expectedPath: string
  classMapInstalled: boolean
  sessionLoaded: boolean
  numClasses: number
} {
  return {
    installed: isBeatsAvailable(),
    expectedPath: modelPath(),
    classMapInstalled: (() => { try { return fs.statSync(classMapPath()).isFile() } catch { return false } })(),
    sessionLoaded: session !== null,
    numClasses: classNames.length,
  }
}
