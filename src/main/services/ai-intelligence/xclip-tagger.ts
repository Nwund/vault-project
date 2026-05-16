// File: src/main/services/ai-intelligence/xclip-tagger.ts
//
// X-CLIP zero-shot video tagging (#20). Microsoft's video-CLIP
// extension — given a list of text prompts and a video clip, returns
// the per-prompt similarity score. User-extensible vocabulary maps
// cleanly onto Vault's tag-matcher idiom (we already build CLIP
// text-prompt sets; X-CLIP extends them to video).
//
// ACTIVATION:
//   1. Download from huggingface.co/microsoft/xclip-base-patch32
//   2. Convert to ONNX via optimum-cli (vision + text encoders).
//   3. Drop xclip-vision.onnx + xclip-text.onnx at <userData>/models/
//   4. Set settings.ai.useXClip = true.
//
// USAGE:
//   const labels = await xclip.classify(framePaths, ['kissing', 'cooking', 'driving'])
//   // returns [{label, confidence}, ...] sorted by similarity
//
// VS X-CLIP IMAGE: regular CLIP can already classify single frames.
// X-CLIP's value-add is temporal modeling — distinguishes "running"
// from "about to run" via 8/16-frame attention.

import fs from 'node:fs'
import type { ModelDownloader } from './model-downloader'

let ort: any = null

export interface XClipPrediction {
  label: string
  confidence: number
}

export class XClipTagger {
  private modelDownloader: ModelDownloader
  private visionSession: any = null
  private textSession: any = null
  private initialized = false

  constructor(modelDownloader: ModelDownloader) { this.modelDownloader = modelDownloader }

  async initialize(): Promise<boolean> {
    if (this.initialized) return true
    try { ort = require('onnxruntime-node') } catch { return false }
    const visionPath = this.modelDownloader.getModelPath('xclip-vision.onnx')
    const textPath = this.modelDownloader.getModelPath('xclip-text.onnx')
    if (!fs.existsSync(visionPath) || !fs.existsSync(textPath)) {
      console.log('[X-CLIP] Models missing — disabled')
      return false
    }
    try {
      this.visionSession = await ort.InferenceSession.create(visionPath, { executionProviders: ['cpu'] })
      this.textSession = await ort.InferenceSession.create(textPath, { executionProviders: ['cpu'] })
      this.initialized = true
      console.log('[X-CLIP] Loaded')
      return true
    } catch (err) {
      console.error('[X-CLIP] Load failed:', err)
      return false
    }
  }

  isReady(): boolean { return this.initialized }

  /**
   * Score a video clip (8 or 16 evenly-spaced frames) against a list
   * of candidate text labels. Returns sorted by cosine similarity.
   *
   * STUB: full implementation requires the model file present to
   * verify input/output shapes (frame count, embedding dim). Once a
   * model is dropped in, fill in preprocessing + cosine similarity.
   */
  async classify(_framePaths: string[], _candidateLabels: string[]): Promise<XClipPrediction[]> {
    if (!this.initialized && !(await this.initialize())) return []
    console.warn('[X-CLIP] classify() stub — fill in after dropping a real model')
    return []
  }
}
