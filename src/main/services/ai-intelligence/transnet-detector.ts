// File: src/main/services/ai-intelligence/transnet-detector.ts
//
// TransNet V2 shot-boundary detector (#18). 3D-CNN trained on
// IACC.3 / RAI / BBC for high-precision scene splits. Better than
// ffmpeg's `scdet` heuristic on slow zooms, fades, and gradual cuts.
//
// ACTIVATION:
//   1. Download from github.com/soCzech/TransNetV2/releases
//   2. Convert to ONNX (the repo ships TF SavedModel; tf2onnx
//      conversion: tf2onnx.convert.from_saved_model with opset 13).
//   3. Drop transnet-v2.onnx at <userData>/models/transnet-v2.onnx
//   4. Set settings.ai.useTransNet = true (default false). When
//      true, frame-extractor.ts:detectSceneChanges() routes through
//      this module instead of the ffmpeg scdet path.
//
// MODEL EXPECTATIONS:
//   Input:  [1, N, 27, 48, 3] — N consecutive 27×48 RGB frames
//           (N typically 100; the model processes them in a sliding
//           window with 25-frame overlap).
//   Output: [1, N, 1] sigmoid scores — peaks indicate shot boundaries.
//
// FALLBACK: when this module's initialize() returns false, the caller
// should keep using ffmpeg scdet. No-op when model is absent.

import fs from 'node:fs'
import { spawn } from 'node:child_process'
import path from 'node:path'
import type { ModelDownloader } from './model-downloader'

let ort: any = null

export interface ShotBoundary {
  /** Frame index where the new shot starts (relative to extracted sequence). */
  frameIndex: number
  /** Sigmoid confidence 0..1. Threshold at 0.5 for hard cuts. */
  confidence: number
}

export class TransNetDetector {
  private modelDownloader: ModelDownloader
  private session: any = null
  private inputName: string = 'frames'
  private initialized = false

  constructor(modelDownloader: ModelDownloader) {
    this.modelDownloader = modelDownloader
  }

  async initialize(): Promise<boolean> {
    if (this.initialized) return true
    try { ort = require('onnxruntime-node') } catch { return false }
    const modelPath = this.modelDownloader.getModelPath('transnet-v2.onnx')
    if (!fs.existsSync(modelPath)) {
      console.log('[TransNet] Model not present — falling back to ffmpeg scdet')
      return false
    }
    try {
      this.session = await ort.InferenceSession.create(modelPath, {
        executionProviders: ['cpu'],
        graphOptimizationLevel: 'all',
      })
      this.inputName = this.session.inputNames[0] || 'frames'
      this.initialized = true
      console.log(`[TransNet] Loaded (input: ${this.inputName})`)
      return true
    } catch (err) {
      console.error('[TransNet] Load failed:', err)
      return false
    }
  }

  isReady(): boolean { return this.initialized }

  /**
   * Process a sequence of frames already extracted at low resolution
   * (recommended: 27×48 RGB via ffmpeg `scale=48:27`). Returns shot
   * boundaries with per-frame confidence. Uses 100-frame batches with
   * 25-frame overlap to handle long videos.
   */
  async detectBoundaries(framePaths: string[], threshold = 0.5): Promise<ShotBoundary[]> {
    if (!this.initialized && !(await this.initialize())) return []
    if (framePaths.length === 0) return []
    // Stub: full implementation would load each frame via sharp,
    // batch into 100-frame windows, run inference, post-process the
    // sigmoid outputs to find peaks above threshold. Left as a TODO
    // because full implementation needs a prebuilt model file to
    // verify the input/output shapes — couldn't validate against a
    // hypothetical model.
    console.warn('[TransNet] detectBoundaries() stub — fill in after dropping a real model')
    return []
  }
}
