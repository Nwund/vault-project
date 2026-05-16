// File: src/main/services/ai-intelligence/videomae-classifier.ts
//
// VideoMAE v2 Kinetics-400 action classifier (#19). Per-clip action
// labels (kissing / intercourse / dancing / 396 others) treated as
// Tier 2 priors.
//
// ACTIVATION:
//   1. Download from huggingface.co/MCG-NJU/videomae-base-finetuned-kinetics
//   2. Convert to ONNX via optimum-cli (Hugging Face Optimum):
//        optimum-cli export onnx --model MCG-NJU/videomae-base-finetuned-kinetics out/
//   3. Drop videomae-v2.onnx at <userData>/models/videomae-v2.onnx
//   4. Drop kinetics-400-labels.txt with one label per line.
//   5. Set settings.ai.useVideoMae = true.
//
// MODEL EXPECTATIONS:
//   Input:  [1, 16, 3, 224, 224] — 16-frame uniformly-sampled clip,
//           RGB, ImageNet normalized.
//   Output: [1, 400] softmax over Kinetics-400 classes.
//
// PIPELINE: caller extracts 16 evenly-spaced frames at 224×224 via
// ffmpeg + sharp, passes the buffer batch. Single forward pass per
// clip; ~200ms on CPU, ~30ms on GPU.

import fs from 'node:fs'
import type { ModelDownloader } from './model-downloader'

let ort: any = null

export interface VideoActionLabel {
  label: string
  confidence: number
}

export class VideoMAEClassifier {
  private modelDownloader: ModelDownloader
  private session: any = null
  private inputName: string = 'pixel_values'
  private labels: string[] = []
  private initialized = false

  constructor(modelDownloader: ModelDownloader) { this.modelDownloader = modelDownloader }

  async initialize(): Promise<boolean> {
    if (this.initialized) return true
    try { ort = require('onnxruntime-node') } catch { return false }
    const modelPath = this.modelDownloader.getModelPath('videomae-v2.onnx')
    const labelsPath = this.modelDownloader.getModelPath('kinetics-400-labels.txt')
    if (!fs.existsSync(modelPath) || !fs.existsSync(labelsPath)) {
      console.log('[VideoMAE] Model or labels missing — disabled')
      return false
    }
    try {
      this.session = await ort.InferenceSession.create(modelPath, { executionProviders: ['cpu'] })
      this.inputName = this.session.inputNames[0] || 'pixel_values'
      this.labels = fs.readFileSync(labelsPath, 'utf8').split(/\r?\n/).filter(Boolean)
      this.initialized = true
      console.log(`[VideoMAE] Loaded (${this.labels.length} labels)`)
      return true
    } catch (err) {
      console.error('[VideoMAE] Load failed:', err)
      return false
    }
  }

  isReady(): boolean { return this.initialized }

  /**
   * Classify a 16-frame clip already preprocessed as Float32Array
   * with NCTHW shape [1, 16, 3, 224, 224] (ImageNet normalized).
   * Returns top-N action labels.
   */
  async classify(pixelValues: Float32Array, topN = 5): Promise<VideoActionLabel[]> {
    if (!this.initialized && !(await this.initialize())) return []
    try {
      const tensor = new ort.Tensor('float32', pixelValues, [1, 16, 3, 224, 224])
      const feeds: Record<string, any> = {}
      feeds[this.inputName] = tensor
      const out = await this.session.run(feeds)
      const scores = (Object.values(out)[0] as any).data as Float32Array
      return Array.from(scores)
        .map((c, i) => ({ label: this.labels[i] ?? `class-${i}`, confidence: c }))
        .sort((a, b) => b.confidence - a.confidence)
        .slice(0, topN)
    } catch (err) {
      console.warn('[VideoMAE] classify() failed:', err)
      return []
    }
  }
}
