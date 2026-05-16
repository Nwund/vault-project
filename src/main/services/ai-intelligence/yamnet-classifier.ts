// File: src/main/services/ai-intelligence/yamnet-classifier.ts
//
// YAMNet 521-class audio event classifier (#23). Google's AudioSet
// model — labels every 0.96-second audio window with one of 521
// classes (speech / music / silence / sigh / moan / etc). Used as
// a cheap pre-filter before more expensive analysis (CLAP, Whisper).
//
// ACTIVATION:
//   1. Download YAMNet TF SavedModel from tfhub.dev/google/yamnet/1
//   2. Convert to ONNX with tf2onnx (model is small, ~17MB)
//   3. Drop yamnet.onnx at <userData>/models/yamnet.onnx
//   4. Drop yamnet-class-map.csv at <userData>/models/yamnet-class-map.csv
//      (521-row label list from the YAMNet repo).
//   5. Optionally set settings.ai.useYamnet = true to enable as a
//      processing-queue step.
//
// MODEL EXPECTATIONS:
//   Input:  [N] mono float32 PCM at 16kHz (any length; usually 0.96s
//           windows so N = 15360 per inference call).
//   Output: [frames, 521] sigmoid scores per class per ~960ms frame.
//
// PIPELINE: caller is responsible for extracting raw 16kHz mono PCM
// via ffmpeg (`-ar 16000 -ac 1 -f f32le`). The wrapper then chunks
// into windows and aggregates predictions.

import fs from 'node:fs'
import path from 'node:path'
import type { ModelDownloader } from './model-downloader'

let ort: any = null

export interface YamnetPrediction {
  label: string
  /** Average sigmoid confidence across all windows in the input. 0..1. */
  confidence: number
}

export class YamnetClassifier {
  private modelDownloader: ModelDownloader
  private session: any = null
  private inputName: string = 'waveform'
  private labels: string[] = []
  private initialized = false

  constructor(modelDownloader: ModelDownloader) {
    this.modelDownloader = modelDownloader
  }

  async initialize(): Promise<boolean> {
    if (this.initialized) return true
    try { ort = require('onnxruntime-node') } catch { return false }
    const modelPath = this.modelDownloader.getModelPath('yamnet.onnx')
    const labelsPath = this.modelDownloader.getModelPath('yamnet-class-map.csv')
    if (!fs.existsSync(modelPath) || !fs.existsSync(labelsPath)) {
      console.log('[YAMNet] Model or labels missing — disabled')
      return false
    }
    try {
      this.session = await ort.InferenceSession.create(modelPath, {
        executionProviders: ['cpu'],
        graphOptimizationLevel: 'all',
      })
      this.inputName = this.session.inputNames[0] || 'waveform'
      // Parse class-map CSV: first row is header, then `index,mid,display_name`.
      const csv = fs.readFileSync(labelsPath, 'utf8')
      this.labels = csv.split(/\r?\n/).slice(1)
        .map((line) => line.split(',').slice(2).join(',').replace(/^"|"$/g, '').trim())
        .filter(Boolean)
      this.initialized = true
      console.log(`[YAMNet] Loaded (${this.labels.length} classes)`)
      return true
    } catch (err) {
      console.error('[YAMNet] Load failed:', err)
      return false
    }
  }

  isReady(): boolean { return this.initialized }

  /**
   * Classify a raw 16kHz mono float32 audio buffer. Returns top-N
   * labels by average confidence across all detected frames.
   */
  async classify(pcm16kMono: Float32Array, topN = 10): Promise<YamnetPrediction[]> {
    if (!this.initialized && !(await this.initialize())) return []
    try {
      const tensor = new ort.Tensor('float32', pcm16kMono, [pcm16kMono.length])
      const feeds: Record<string, any> = {}
      feeds[this.inputName] = tensor
      const out = await this.session.run(feeds)
      // Output is [frames, 521]; average across frames.
      const scoresTensor = Object.values(out)[0] as any
      const scores = scoresTensor.data as Float32Array
      const dims = scoresTensor.dims as number[]
      const numFrames = dims[0]
      const numClasses = dims[1]
      const avg = new Float32Array(numClasses)
      for (let f = 0; f < numFrames; f++) {
        for (let c = 0; c < numClasses; c++) {
          avg[c] += scores[f * numClasses + c]
        }
      }
      for (let c = 0; c < numClasses; c++) avg[c] /= numFrames
      // Top-N by average score.
      return Array.from(avg)
        .map((conf, idx) => ({ label: this.labels[idx] ?? `class-${idx}`, confidence: conf }))
        .sort((a, b) => b.confidence - a.confidence)
        .slice(0, topN)
    } catch (err) {
      console.warn('[YAMNet] classify() failed:', err)
      return []
    }
  }
}
