// File: src/main/services/ai-intelligence/arcface-recognizer.ts
//
// InsightFace ArcFace 512-D face embeddings (#16). Drop-in higher-
// accuracy replacement for SFace's 128-D embeddings. Used by Stash,
// Visage, and most production face-ID pipelines — the de-facto
// adult-industry standard for clustering performer faces across
// videos.
//
// ACTIVATION:
//   1. Download buffalo_l.zip from
//      github.com/deepinsight/insightface/tree/master/python-package
//   2. Extract det_10g.onnx + w600k_r50.onnx
//   3. Drop w600k_r50.onnx (the recognition model) at
//      <userData>/models/arcface-w600k.onnx
//   4. Set settings.ai.faceRecognitionModel = 'arcface' (default
//      'sface'). Falls back to SFace if ArcFace model missing.
//
// USAGE:
//   const r = new ArcFaceRecognizer(modelDownloader)
//   await r.initialize()
//   const embedding = await r.embed(faceCropPath)  // 512-D Float32Array
//
// COMPARE WITH SFACE:
//   - SFace: 128-D, smaller, faster, less accurate on profile / occluded faces.
//   - ArcFace: 512-D, ~10MB model, +5-15% accuracy on adult-video face matching.
//
// CLUSTERING: existing face_cluster_service.ts uses cosine similarity
// — works with 512-D out of the box. The bigger embedding gives better
// separation; tune the merge threshold up from 0.45 → 0.5 for ArcFace.

import fs from 'node:fs'
import path from 'node:path'
import type { ModelDownloader } from './model-downloader'

let ort: any = null
let sharp: any = null

export class ArcFaceRecognizer {
  private modelDownloader: ModelDownloader
  private session: any = null
  private inputName: string = 'input'
  private initialized = false

  constructor(modelDownloader: ModelDownloader) {
    this.modelDownloader = modelDownloader
  }

  /** Returns true if the ArcFace model is on disk and the session loaded. */
  async initialize(): Promise<boolean> {
    if (this.initialized) return true
    try {
      ort = require('onnxruntime-node')
      sharp = require('sharp')
    } catch (err) {
      console.warn('[ArcFace] onnxruntime-node / sharp not available:', err)
      return false
    }
    const modelPath = this.modelDownloader.getModelPath('arcface-w600k.onnx')
    if (!fs.existsSync(modelPath)) {
      console.log('[ArcFace] Model not present at', modelPath, '— falling back to SFace')
      return false
    }
    try {
      this.session = await ort.InferenceSession.create(modelPath, {
        executionProviders: ['cpu'],
        graphOptimizationLevel: 'all',
        intraOpNumThreads: 2,
      })
      this.inputName = this.session.inputNames[0] || 'input.1'
      this.initialized = true
      console.log(`[ArcFace] Loaded (input: ${this.inputName})`)
      return true
    } catch (err) {
      console.error('[ArcFace] Failed to load model:', err)
      return false
    }
  }

  isReady(): boolean { return this.initialized }

  /**
   * Compute a 512-D face embedding from an aligned face crop.
   * Caller is responsible for cropping the face (use YuNet's bbox)
   * and passing a tight crop. ArcFace expects ~112×112 aligned face.
   */
  async embed(faceCropPath: string): Promise<Float32Array | null> {
    if (!this.initialized && !(await this.initialize())) return null
    try {
      // Preprocess: resize to 112×112, RGB, normalize to [-1, 1].
      const buf = await sharp(faceCropPath)
        .resize(112, 112, { fit: 'fill' })
        .removeAlpha()
        .raw()
        .toBuffer()
      // RGB-uint8 → float32 NCHW [-1, 1]
      const tensorData = new Float32Array(3 * 112 * 112)
      for (let y = 0; y < 112; y++) {
        for (let x = 0; x < 112; x++) {
          const srcIdx = (y * 112 + x) * 3
          const dstIdx = y * 112 + x
          tensorData[dstIdx]                     = (buf[srcIdx]     / 127.5) - 1.0  // R
          tensorData[112 * 112 + dstIdx]         = (buf[srcIdx + 1] / 127.5) - 1.0  // G
          tensorData[2 * 112 * 112 + dstIdx]     = (buf[srcIdx + 2] / 127.5) - 1.0  // B
        }
      }
      const tensor = new ort.Tensor('float32', tensorData, [1, 3, 112, 112])
      const feeds: Record<string, any> = {}
      feeds[this.inputName] = tensor
      const output = await this.session.run(feeds)
      const outTensor = Object.values(output)[0] as any
      const raw = outTensor.data as Float32Array
      // L2 normalize for cosine-similarity compatibility.
      let norm = 0
      for (let i = 0; i < raw.length; i++) norm += raw[i] * raw[i]
      norm = Math.sqrt(norm) || 1
      const out = new Float32Array(raw.length)
      for (let i = 0; i < raw.length; i++) out[i] = raw[i] / norm
      return out
    } catch (err) {
      console.warn('[ArcFace] embed() failed:', err)
      return null
    }
  }
}
