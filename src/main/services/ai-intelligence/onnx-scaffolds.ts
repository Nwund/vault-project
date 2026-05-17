// File: src/main/services/ai-intelligence/onnx-scaffolds.ts
//
// Thin scaffolds for the remaining ONNX wrappers from the 100-ideas
// backlog. Each entry exposes `is*Available()` / `get*Status()` and
// returns null on inference until the user drops the corresponding
// `.onnx` into <userData>/models/. The full inference code lands when
// the user actually installs the model — until then the renderer
// surfaces install status via these helpers + the extra-model-status
// registry.
//
// Pattern matches the BEATs / PANNs / AdaFace wrappers but collapsed
// into one file because each individual model just needs status +
// "model missing" return paths until inference is wired in.
//
// Covered tasks:
//   #123 Wav2Vec2-Large emotion classifier
//   #124 X-CLIP video-native CLIP
//   #125 VideoMAE-v2 Kinetics-710 actions
//   #126 InternVideo2-Stage2 1B distilled
//   #127 SOLIDER / TransReID-SSL body re-id
//   #129 NeuralFP background music ID
//   #130 MERT-v1-330M music understanding
//   #132 LongCLIP chapter labeling
//
// When you wire real inference for one of these, lift it into its own
// file (mirror beats-tagger.ts).

import fs from 'node:fs'
import path from 'node:path'
import { app } from 'electron'

interface ScaffoldStatus {
  installed: boolean
  expectedPath: string
  sessionLoaded: false
  /** True once `infer()` has been called with a missing model so the
   *  status card can show "loaded once, currently disabled". */
  warned: boolean
}

const warnedSet = new Set<string>()

function statusFor(filename: string): ScaffoldStatus {
  const p = path.join(app.getPath('userData'), 'models', filename)
  let installed = false
  try { installed = fs.statSync(p).isFile() } catch { /* missing */ }
  return {
    installed,
    expectedPath: p,
    sessionLoaded: false,
    warned: warnedSet.has(filename),
  }
}

function noteWarn(filename: string): null {
  if (!warnedSet.has(filename)) {
    console.log(`[ML scaffold] ${filename} not installed at ${path.join(app.getPath('userData'), 'models', filename)} — inference disabled.`)
    warnedSet.add(filename)
  }
  return null
}

// ─── #123 Wav2Vec2-Large emotion classifier ──────────────────────
export function getWav2Vec2EmotionStatus(): ScaffoldStatus { return statusFor('wav2vec2-emotion.onnx') }
export async function classifyEmotion(_samples16k: Float32Array): Promise<null | {
  valence: number; arousal: number; dominance: number
}> {
  if (!getWav2Vec2EmotionStatus().installed) return noteWarn('wav2vec2-emotion.onnx')
  // Real inference: 16kHz mono float32 → 3-D regression head. Stub
  // until weights land — return null so callers fall through.
  return null
}

// ─── #124 X-CLIP video-native CLIP ───────────────────────────────
export function getXClipStatus(): ScaffoldStatus { return statusFor('x-clip.onnx') }
export async function embedClipVideo(_framePathsFor8Frames: string[]): Promise<Float32Array | null> {
  if (!getXClipStatus().installed) return noteWarn('x-clip.onnx')
  return null
}

// ─── #125 VideoMAE-v2 ────────────────────────────────────────────
export function getVideoMaeV2Status(): ScaffoldStatus { return statusFor('videomae-v2.onnx') }
export async function classifyClipAction(_framePathsFor16Frames: string[]): Promise<Array<{ label: string; confidence: number }> | null> {
  if (!getVideoMaeV2Status().installed) return noteWarn('videomae-v2.onnx')
  return null
}

// ─── #126 InternVideo2-Stage2 ────────────────────────────────────
export function getInternVideo2Status(): ScaffoldStatus { return statusFor('internvideo2-stage2-1b-distilled.onnx') }
export async function embedSceneInternVideo2(_framePaths: string[]): Promise<Float32Array | null> {
  if (!getInternVideo2Status().installed) return noteWarn('internvideo2-stage2-1b-distilled.onnx')
  return null
}

// ─── #127 SOLIDER / TransReID-SSL ────────────────────────────────
export function getSoliderStatus(): ScaffoldStatus { return statusFor('solider-transreid-ssl.onnx') }
export async function embedBodySolider(_bodyCropPath: string): Promise<Float32Array | null> {
  if (!getSoliderStatus().installed) return noteWarn('solider-transreid-ssl.onnx')
  return null
}

// ─── #129 NeuralFP ────────────────────────────────────────────────
export function getNeuralFpStatus(): ScaffoldStatus { return statusFor('neuralfp.onnx') }
export async function fingerprintBgm(_samples16k: Float32Array): Promise<Float32Array | null> {
  if (!getNeuralFpStatus().installed) return noteWarn('neuralfp.onnx')
  return null
}

// ─── #130 MERT-v1-330M ────────────────────────────────────────────
export function getMertStatus(): ScaffoldStatus { return statusFor('mert-v1-330m.onnx') }
export async function embedMusicMert(_samples24k: Float32Array): Promise<Float32Array | null> {
  if (!getMertStatus().installed) return noteWarn('mert-v1-330m.onnx')
  return null
}

// ─── #132 LongCLIP ────────────────────────────────────────────────
export function getLongClipStatus(): ScaffoldStatus { return statusFor('longclip.onnx') }
export async function embedImageLongClip(_imagePath: string): Promise<Float32Array | null> {
  if (!getLongClipStatus().installed) return noteWarn('longclip.onnx')
  return null
}
export async function embedTextLongClip(_text: string): Promise<Float32Array | null> {
  if (!getLongClipStatus().installed) return noteWarn('longclip.onnx')
  return null
}
