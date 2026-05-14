// File: src/main/services/ai-intelligence/person-reid-recognizer.ts
//
// Person ReID complement to SFace. SFace clusters by face features;
// Person ReID clusters by full-body features — clothing, build,
// hairstyle visible at distance. Useful when:
//   - face isn't visible (back shots, occluded face, close crops)
//   - same person across scenes wearing different outfits
//
// We use MoveNet's person bboxes as the body crop source. Each pose
// detection gives a bbox covering the full skeleton, which is what
// ReID expects.
//
// Supported models (all share 256×128 RGB input, ImageNet normalized;
// embedding dim is read from the model output at runtime):
//   - opencv_zoo person_reid_youtu_2021nov.onnx  (768-D, default)
//   - fast-reid MGN multi-granularity            (2048-D, higher acc)
//   - fast-reid SBS / BoT variants               (2048-D)
//   - solider-reid variants                      (1024 / 2048-D)
//
// Manual install path priority — first existing wins:
//   <userData>/models/person-reid-mgn.onnx       (preferred if present)
//   <userData>/models/person-reid-fastreid.onnx
//   <userData>/models/person-reid.onnx           (canonical fallback)
//
// Mixing models within one library is fine — embeddings get stored
// with their dimensionality, and cosineSimilarity refuses cross-dim
// matches (returns 0), so MGN-tagged bodies cluster separately from
// 768-D bodies. To "upgrade" an existing library, drop the MGN model
// and re-run AI tagging; the queue's body extraction step rewrites
// embeddings on every pass.

import fs from 'node:fs'
import path from 'node:path'
import { app } from 'electron'
import type { PoseDetection } from './pose-detector'

let ort: any = null
let sharp: any = null

const INPUT_W = 128
const INPUT_H = 256
const EMBEDDING_DIM = 768
/** Cosine threshold for body re-id "same person" — looser than SFace
 *  because clothing/lighting drift adds noise. */
export const REID_CLUSTER_THRESHOLD = 0.55
export const REID_MATCH_THRESHOLD = 0.5

// ImageNet normalization (standard for ReID nets).
const MEAN = [0.485, 0.456, 0.406]
const STD = [0.229, 0.224, 0.225]

let session: any = null
let initialized = false
let modelPath: string | null = null

// Priority order: MGN > fast-reid > canonical. First file that exists
// wins. Letting MGN take precedence means users who install the
// higher-accuracy model don't have to manually swap names.
const MODEL_CANDIDATES = [
  'person-reid-mgn.onnx',
  'person-reid-fastreid.onnx',
  'person-reid.onnx',
] as const

function getModelPath(): string {
  const modelsDir = path.join(app.getPath('userData'), 'models')
  for (const name of MODEL_CANDIDATES) {
    const p = path.join(modelsDir, name)
    if (fs.existsSync(p)) return p
  }
  // Fall back to the canonical path even if missing — caller uses
  // existsSync() to gate, so a non-existent path is fine.
  return path.join(modelsDir, 'person-reid.onnx')
}

export function isPersonReidAvailable(): boolean {
  modelPath = getModelPath()
  return fs.existsSync(modelPath)
}

async function loadModel(): Promise<void> {
  if (initialized) return
  if (!isPersonReidAvailable()) { initialized = true; return }
  try {
    if (!ort) ort = await import('onnxruntime-node')
    if (!sharp) sharp = require('sharp')
    session = await ort.InferenceSession.create(modelPath!, {
      executionProviders: ['cpu'],
      graphOptimizationLevel: 'all',
    })
    console.log(`[PersonReID] Loaded ${modelPath}`)
  } catch (err) {
    console.warn('[PersonReID] Load failed:', err)
    session = null
  } finally {
    initialized = true
  }
}

/**
 * Extract a body-feature embedding for one person detection. Takes
 * the source frame + a MoveNet pose detection (uses pose.bbox).
 * Returns L2-normalized 768-D embedding or null.
 */
export async function extractBodyEmbedding(
  framePath: string,
  pose: PoseDetection
): Promise<Float32Array | null> {
  await loadModel()
  if (!session || !fs.existsSync(framePath)) return null
  try {
    const meta = await sharp(framePath).metadata()
    const srcW = meta.width ?? 0
    const srcH = meta.height ?? 0
    if (srcW < 32 || srcH < 32) return null
    // Pad bbox by 10% so we capture clothing context around the
    // skeleton extremes — pure bbox tends to crop tightly on the
    // skeleton mid-line and miss collar/shoes.
    const expand = 0.1
    const bx = Math.max(0, pose.bbox.x - pose.bbox.w * expand)
    const by = Math.max(0, pose.bbox.y - pose.bbox.h * expand)
    const bw = Math.min(1 - bx, pose.bbox.w * (1 + expand * 2))
    const bh = Math.min(1 - by, pose.bbox.h * (1 + expand * 2))
    const left = Math.max(0, Math.floor(bx * srcW))
    const top = Math.max(0, Math.floor(by * srcH))
    const cropW = Math.max(16, Math.min(srcW - left, Math.floor(bw * srcW)))
    const cropH = Math.max(16, Math.min(srcH - top, Math.floor(bh * srcH)))
    const buf = await sharp(framePath)
      .extract({ left, top, width: cropW, height: cropH })
      .resize(INPUT_W, INPUT_H, { fit: 'fill' })
      .raw()
      .toBuffer({ resolveWithObject: true })
    const rgb = buf.data as Buffer
    const float = new Float32Array(3 * INPUT_H * INPUT_W)
    for (let i = 0; i < INPUT_H * INPUT_W; i++) {
      const r = rgb[i * 3] / 255
      const g = rgb[i * 3 + 1] / 255
      const b = rgb[i * 3 + 2] / 255
      float[0 * INPUT_H * INPUT_W + i] = (r - MEAN[0]) / STD[0]
      float[1 * INPUT_H * INPUT_W + i] = (g - MEAN[1]) / STD[1]
      float[2 * INPUT_H * INPUT_W + i] = (b - MEAN[2]) / STD[2]
    }
    const tensor = new ort.Tensor('float32', float, [1, 3, INPUT_H, INPUT_W])
    const feeds: Record<string, any> = {}
    feeds[session.inputNames[0]] = tensor
    const output = await session.run(feeds)
    const out = output[session.outputNames[0]]
    const raw = out.data as Float32Array
    if (raw.length < EMBEDDING_DIM) return null
    // L2 normalize.
    let norm = 0
    for (let i = 0; i < raw.length; i++) norm += raw[i] * raw[i]
    norm = Math.sqrt(norm) || 1
    const normalized = new Float32Array(raw.length)
    for (let i = 0; i < raw.length; i++) normalized[i] = raw[i] / norm
    return normalized
  } catch (err) {
    console.warn('[PersonReID] extractBodyEmbedding failed:', err)
    return null
  }
}

export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) return 0
  let dot = 0
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i]
  return dot
}

export function embeddingToBase64(e: Float32Array): string {
  return Buffer.from(e.buffer, e.byteOffset, e.byteLength).toString('base64')
}

export function embeddingFromBase64(s: string): Float32Array {
  const buf = Buffer.from(s, 'base64')
  return new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4)
}
