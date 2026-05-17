// File: src/main/services/ai-intelligence/adaface-recognizer.ts
//
// #128 — AdaFace / TopoFR face recognition upgrade.
//
// Drop-in replacement for the existing SFace embedder. AdaFace
// (CVPR 2022) / TopoFR (NeurIPS 2024) handle low-quality crops 2-3%
// better on IJB-C than SFace, which matters for face_clusters when
// the source video has a lot of motion blur / off-axis angles.
//
// Output: a 512-D L2-normalized embedding per face crop, compatible
// with the existing face_cluster cosine-similarity pipeline. The
// switchover is a settings flag — keep SFace as the default until
// the user installs the AdaFace ONNX.
//
// ACTIVATION: drop ONNX at <userData>/models/adaface-topofr.onnx.

import fs from 'node:fs'
import path from 'node:path'
import { app } from 'electron'

let ort: any = null
let sharp: any = null
let session: any = null
let _loadAttempted = false

const INPUT_SIZE = 112  // ArcFace-family standard
const EMBED_DIM = 512

function modelPath(): string {
  return path.join(app.getPath('userData'), 'models', 'adaface-topofr.onnx')
}

export function isAdaFaceAvailable(): boolean {
  try { return fs.existsSync(modelPath()) } catch { return false }
}

async function loadModel(): Promise<boolean> {
  if (session) return true
  if (_loadAttempted) return false
  _loadAttempted = true
  if (!isAdaFaceAvailable()) {
    console.log(`[AdaFace] No model at ${modelPath()} — recognizer disabled.`)
    return false
  }
  try {
    if (!ort) ort = require('onnxruntime-node')
    if (!sharp) sharp = require('sharp')
    session = await ort.InferenceSession.create(modelPath(), { executionProviders: ['cpu'] })
    console.log(`[AdaFace] Loaded recognizer (input ${INPUT_SIZE}², output ${EMBED_DIM}-D)`)
    return true
  } catch (err) {
    console.warn('[AdaFace] Failed to load:', err)
    return false
  }
}

/**
 * Embed a face crop. Caller supplies the cropped image path (the
 * existing face-detector's bbox→crop pipeline already produces these).
 *
 * Returns 512-D L2-normalized Float32, or null if model missing.
 */
export async function embedFace(cropPath: string): Promise<Float32Array | null> {
  if (!session && !(await loadModel())) return null
  if (!fs.existsSync(cropPath)) return null
  try {
    const raw = await sharp(cropPath)
      .resize(INPUT_SIZE, INPUT_SIZE, { fit: 'fill' })
      .removeAlpha()
      .raw()
      .toBuffer()
    if (raw.length !== INPUT_SIZE * INPUT_SIZE * 3) return null
    // AdaFace expects RGB normalized to [-1, 1]. NCHW float32.
    const float32 = new Float32Array(1 * 3 * INPUT_SIZE * INPUT_SIZE)
    for (let c = 0; c < 3; c++) {
      for (let h = 0; h < INPUT_SIZE; h++) {
        for (let w = 0; w < INPUT_SIZE; w++) {
          const src = (h * INPUT_SIZE + w) * 3 + c
          const dst = c * INPUT_SIZE * INPUT_SIZE + h * INPUT_SIZE + w
          float32[dst] = (raw[src] / 127.5) - 1.0
        }
      }
    }
    const input = new ort.Tensor('float32', float32, [1, 3, INPUT_SIZE, INPUT_SIZE])
    const feeds: Record<string, any> = {}
    feeds[session.inputNames?.[0] ?? 'input'] = input
    const output = await session.run(feeds)
    const emb = new Float32Array((Object.values(output)[0] as any).data)
    // L2 normalize
    let sum = 0
    for (let i = 0; i < emb.length; i++) sum += emb[i] * emb[i]
    const norm = Math.sqrt(sum) || 1
    for (let i = 0; i < emb.length; i++) emb[i] /= norm
    return emb
  } catch (err) {
    console.warn('[AdaFace] inference failed:', err)
    return null
  }
}

export function getAdaFaceStatus(): {
  installed: boolean
  expectedPath: string
  sessionLoaded: boolean
  embedDim: number
  inputSize: number
} {
  return {
    installed: isAdaFaceAvailable(),
    expectedPath: modelPath(),
    sessionLoaded: session !== null,
    embedDim: EMBED_DIM,
    inputSize: INPUT_SIZE,
  }
}
