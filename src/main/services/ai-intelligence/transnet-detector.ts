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
//   Input:  [1, N, 27, 48, 3] — N consecutive 27×48 RGB frames as
//           uint8 (TransNet V2's reference impl normalizes internally;
//           we pass raw 0-255 byte values via Int32Array since onnxruntime-
//           node doesn't ship a uint8 tensor for 5-D shapes on Windows).
//   Output: First tensor is [1, N, 1] sigmoid scores — peaks above
//           threshold indicate shot boundaries.
//
// SLIDING WINDOW: TransNet V2's reference uses 100-frame windows with
// a 25-frame overlap on each side (so each window's middle 50 frames
// are the authoritative predictions; the edge frames are discarded
// because they have less context). We follow the same convention.
//
// FALLBACK: when this module's initialize() returns false, the caller
// should keep using ffmpeg scdet. No-op when model is absent.

import fs from 'node:fs'
import type { ModelDownloader } from './model-downloader'

let ort: any = null
let sharp: any = null

const FRAME_W = 48
const FRAME_H = 27
const FRAME_C = 3
const PIXELS_PER_FRAME = FRAME_W * FRAME_H * FRAME_C
const WINDOW_FRAMES = 100
const WINDOW_OVERLAP = 25  // discard this many frames from each edge of a window

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
    try { sharp = require('sharp') } catch { return false }
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
   * (use ffmpeg `scale=48:27,format=rgb24` to feed this directly).
   * Returns shot boundaries with per-frame confidence.
   *
   * Sliding-window strategy (matches TransNetV2 reference impl):
   * - 100-frame windows, stride 50.
   * - Discard 25 frames from each edge of each window's predictions
   *   (insufficient context). Only the middle 50 frames of each
   *   window contribute to the final scores.
   * - First and last 25 frames of the input use their nearest
   *   non-edge prediction (no leading/trailing windows to overlap).
   */
  async detectBoundaries(framePaths: string[], threshold = 0.5): Promise<ShotBoundary[]> {
    if (!this.initialized && !(await this.initialize())) return []
    if (framePaths.length === 0) return []

    // Per-frame sigmoid scores aggregated across windows.
    const scores = new Float32Array(framePaths.length)
    const counts = new Uint16Array(framePaths.length)

    // Sliding window: stride = WINDOW_FRAMES - 2*WINDOW_OVERLAP = 50.
    const stride = WINDOW_FRAMES - 2 * WINDOW_OVERLAP
    for (let start = 0; start < framePaths.length; start += stride) {
      const end = Math.min(start + WINDOW_FRAMES, framePaths.length)
      const windowSize = end - start
      if (windowSize === 0) break

      // Pad short windows by repeating the last frame so the model
      // gets its expected 100-frame input.
      const padded = windowSize < WINDOW_FRAMES ? WINDOW_FRAMES : windowSize
      const tensorData = new Uint8Array(padded * PIXELS_PER_FRAME)
      for (let i = 0; i < padded; i++) {
        const srcIdx = i < windowSize ? start + i : end - 1  // pad with last frame
        try {
          const buf = await sharp(framePaths[srcIdx])
            .resize(FRAME_W, FRAME_H, { fit: 'fill' })
            .removeAlpha()
            .raw()
            .toBuffer()
          tensorData.set(buf, i * PIXELS_PER_FRAME)
        } catch (err) {
          console.warn(`[TransNet] frame ${srcIdx} read failed:`, err)
          // Leave that frame zero-filled — model will see a black frame.
        }
      }

      try {
        const tensor = new ort.Tensor('uint8', tensorData, [1, padded, FRAME_H, FRAME_W, FRAME_C])
        const feeds: Record<string, any> = {}
        feeds[this.inputName] = tensor
        const out = await this.session.run(feeds)
        // The first output is the per-frame transition score.
        const outTensor = Object.values(out)[0] as any
        const data = outTensor.data as Float32Array
        // Aggregate ONLY the central WINDOW_FRAMES - 2*WINDOW_OVERLAP
        // (50) frames; edge frames have insufficient context.
        const startKeep = start === 0 ? 0 : WINDOW_OVERLAP
        const endKeep = end === framePaths.length ? padded : WINDOW_FRAMES - WINDOW_OVERLAP
        for (let i = startKeep; i < Math.min(endKeep, windowSize); i++) {
          const globalIdx = start + i
          if (globalIdx >= framePaths.length) break
          // Apply sigmoid in case the model emits raw logits — TransNetV2's
          // output head is already sigmoid-squashed in the reference impl,
          // but tf2onnx conversion sometimes drops the activation.
          const raw = data[i] ?? 0
          const sig = raw < -50 ? 0 : raw > 50 ? 1 : (raw >= 0 && raw <= 1 ? raw : 1 / (1 + Math.exp(-raw)))
          scores[globalIdx] += sig
          counts[globalIdx] += 1
        }
      } catch (err) {
        console.warn(`[TransNet] window @${start} inference failed:`, err)
      }
    }

    // Average the aggregated scores per frame, then peak-pick above
    // threshold. A "boundary" is a local maximum that exceeds
    // `threshold` AND is at least as high as both immediate neighbors —
    // this avoids double-counting plateaus from the sigmoid output.
    const meanScores = new Float32Array(framePaths.length)
    for (let i = 0; i < framePaths.length; i++) {
      meanScores[i] = counts[i] > 0 ? scores[i] / counts[i] : 0
    }
    const boundaries: ShotBoundary[] = []
    for (let i = 0; i < meanScores.length; i++) {
      const s = meanScores[i]
      if (s < threshold) continue
      const prev = i > 0 ? meanScores[i - 1] : -1
      const next = i < meanScores.length - 1 ? meanScores[i + 1] : -1
      if (s >= prev && s >= next) {
        boundaries.push({ frameIndex: i, confidence: s })
      }
    }
    return boundaries
  }
}
