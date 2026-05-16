// File: src/main/services/ai-intelligence/clap-audio-tagger.ts
// STATUS: scaffold — classify() returns []. See docs/ML_WRAPPER_BACKLOG.md.
//
// LAION CLAP zero-shot audio tagger (#24). CLIP-for-audio: given
// text prompts and an audio file, returns per-prompt similarity.
// Symmetric to Vault's existing CLIP image use — extends "natural-
// language search" to the audio modality ("find videos with female
// vocals", "videos with rhythmic plaps", etc.).
//
// ACTIVATION:
//   1. Download from github.com/LAION-AI/CLAP — the "music-trained"
//      checkpoint (better for vocal classification than the speech
//      one for adult-content use).
//   2. Convert to ONNX via the laion_clap.export_onnx() helper.
//   3. Drop clap-audio.onnx + clap-text.onnx at <userData>/models/
//   4. Set settings.ai.useClap = true.
//
// MODEL EXPECTATIONS:
//   Audio input:  16kHz mono Float32 PCM, any length (typically
//                 10-30s slices). Internal feature extraction
//                 produces 512-D embedding.
//   Text input:   tokenized prompts (CLIP-style BPE).
//   Outputs:      512-D embeddings — cosine similarity at the call site.
//
// PIPELINE: caller extracts audio via ffmpeg, passes raw float32.
// Use precomputed text embeddings for known label sets (Vault's
// xyrene categories, sound-engine prompts, etc.) to avoid re-encoding.

import fs from 'node:fs'
import type { ModelDownloader } from './model-downloader'

let ort: any = null

export interface ClapPrediction {
  label: string
  confidence: number
}

export class ClapAudioTagger {
  private modelDownloader: ModelDownloader
  private audioSession: any = null
  private textSession: any = null
  private initialized = false

  constructor(modelDownloader: ModelDownloader) { this.modelDownloader = modelDownloader }

  async initialize(): Promise<boolean> {
    if (this.initialized) return true
    try { ort = require('onnxruntime-node') } catch { return false }
    const audioPath = this.modelDownloader.getModelPath('clap-audio.onnx')
    const textPath = this.modelDownloader.getModelPath('clap-text.onnx')
    if (!fs.existsSync(audioPath) || !fs.existsSync(textPath)) {
      console.log('[CLAP] Models missing — disabled')
      return false
    }
    try {
      this.audioSession = await ort.InferenceSession.create(audioPath, { executionProviders: ['cpu'] })
      this.textSession = await ort.InferenceSession.create(textPath, { executionProviders: ['cpu'] })
      this.initialized = true
      console.log('[CLAP] Loaded')
      return true
    } catch (err) {
      console.error('[CLAP] Load failed:', err)
      return false
    }
  }

  isReady(): boolean { return this.initialized }

  /**
   * Score a 16kHz mono audio buffer against a list of candidate text
   * labels. Returns sorted by cosine similarity.
   *
   * STUB: full implementation requires the model + text-tokenizer
   * present to verify shapes. Fill in once a CLAP checkpoint is
   * exported.
   */
  async classify(_pcm16kMono: Float32Array, _candidateLabels: string[]): Promise<ClapPrediction[]> {
    if (!this.initialized && !(await this.initialize())) return []
    console.warn('[CLAP] classify() stub — fill in after dropping a real model + tokenizer')
    return []
  }
}
