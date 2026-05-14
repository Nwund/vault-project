// File: src/main/services/ai-intelligence/sface-recognizer.ts
//
// Face recognition. Pairs with YuNet — YuNet finds faces, this module
// turns each face crop into a feature embedding. Cosine similarity
// between two embeddings tells you if it's the same person.
//
// Use case in Vault: cluster faces across the library → "this face
// appears in 47 videos." Once the user names a cluster ("Mia Khalifa"),
// the queue emits performer:NAME tags for new videos containing that
// face — automatic performer tagging without LLM cost.
//
// Supported models (auto-picked by filename, first existing wins):
//   <userData>/models/face-recognition-arcface.onnx  (preferred)
//     → InsightFace ArcFace buffalo_l 512-D RGB normalized.
//       Best accuracy across pose / lighting variation. ~250MB.
//   <userData>/models/face-recognition-adaface.onnx
//     → AdaFace 512-D RGB normalized. Quality-adaptive (hard examples
//       get more loss weight during training) — robust to blurry / low-
//       light frames where ArcFace drifts. ~270MB.
//   <userData>/models/face-recognition-sface.onnx    (fallback)
//     → opencv_zoo SFace (face_recognition_sface_2021dec.onnx). 128-D
//       BGR raw. 38MB. Less accurate than ArcFace/AdaFace but tiny.
//
// Preprocessing + output dim are auto-detected per model file at load
// time. Mixing models within one library is fine — embeddings store
// with their dimensionality and cosineSimilarity refuses cross-dim
// matches (returns 0).
//
// Recognition threshold (opencv_zoo default): cosine ≥ 0.363 ⇒ match.
// We use 0.45 internally for cluster assignment to be conservative —
// false-merges are much worse than false-splits for performer tagging.
//
// Caveats:
//   - Best with aligned face crops (5-point landmark warp). Vault uses
//     simple bbox crop for v1 — accuracy ~85% of aligned, but it works.
//   - SFace is sensitive to extreme pose / lighting. Cluster centroids
//     drift over time as more samples join; we re-center per-cluster on
//     each merge.

import fs from 'node:fs'
import path from 'node:path'
import { app } from 'electron'

let ort: any = null
let sharp: any = null

const INPUT_SIZE = 112  // all supported recognizers use 112×112
// Minimum embedding length we'll accept from a model. SFace = 128,
// ArcFace/AdaFace = 512. Larger is fine — we just need at least this
// many dims to call the output "a face embedding."
const EMBEDDING_DIM = 128
/** Cosine similarity floor for "same person" assignment. Higher = more
 *  conservative (fewer false merges, more cluster fragmentation). */
export const CLUSTER_SIMILARITY_THRESHOLD = 0.45
/** Lower threshold for "this matches the user's named cluster" prior
 *  emission. We're more lenient here because the queue's cross-source
 *  agreement bonus will filter false positives. */
export const MATCH_SIMILARITY_THRESHOLD = 0.4

let session: any = null
let initialized = false
let modelPath: string | null = null

// Filename → preprocessing format. ArcFace + AdaFace both normalize
// RGB with (x/255 - 0.5)/0.5; SFace takes raw BGR uint8.
type FacePreprocessFormat = 'arcface' | 'sface'
let preprocessFormat: FacePreprocessFormat = 'sface'

const MODEL_CANDIDATES: Array<{ name: string; format: FacePreprocessFormat }> = [
  { name: 'face-recognition-arcface.onnx', format: 'arcface' },
  { name: 'face-recognition-adaface.onnx', format: 'arcface' }, // same preprocessing as ArcFace
  { name: 'face-recognition-sface.onnx',   format: 'sface' },
]

function getModelPath(): string {
  const modelsDir = path.join(app.getPath('userData'), 'models')
  for (const cand of MODEL_CANDIDATES) {
    const p = path.join(modelsDir, cand.name)
    if (fs.existsSync(p)) {
      preprocessFormat = cand.format
      return p
    }
  }
  // Fall back to canonical SFace path (may not exist; caller gates on existsSync).
  preprocessFormat = 'sface'
  return path.join(modelsDir, 'face-recognition-sface.onnx')
}

export function isSFaceAvailable(): boolean {
  modelPath = getModelPath()
  return fs.existsSync(modelPath)
}

async function loadModel(): Promise<void> {
  if (initialized) return
  if (!isSFaceAvailable()) { initialized = true; return }
  try {
    if (!ort) ort = await import('onnxruntime-node')
    if (!sharp) sharp = require('sharp')
    session = await ort.InferenceSession.create(modelPath!, {
      executionProviders: ['cpu'],
      graphOptimizationLevel: 'all',
    })
    console.log(`[FaceRecognition] Loaded ${modelPath} (format: ${preprocessFormat})`)
  } catch (err) {
    console.warn('[FaceRecognition] Load failed:', err)
    session = null
  } finally {
    initialized = true
  }
}

/**
 * Extract a 128-D embedding for one face. Takes the source frame +
 * a normalized bbox (0-1). Crops + resizes to 112×112, runs SFace,
 * returns the L2-normalized embedding (or null on failure).
 */
export async function extractEmbedding(
  framePath: string,
  bbox: { x: number; y: number; w: number; h: number }
): Promise<Float32Array | null> {
  await loadModel()
  if (!session || !fs.existsSync(framePath)) return null
  try {
    const meta = await sharp(framePath).metadata()
    const srcW = meta.width ?? 0
    const srcH = meta.height ?? 0
    if (srcW < 16 || srcH < 16) return null
    const left = Math.max(0, Math.floor(bbox.x * srcW))
    const top = Math.max(0, Math.floor(bbox.y * srcH))
    const cropW = Math.max(8, Math.min(srcW - left, Math.floor(bbox.w * srcW)))
    const cropH = Math.max(8, Math.min(srcH - top, Math.floor(bbox.h * srcH)))
    const buf = await sharp(framePath)
      .extract({ left, top, width: cropW, height: cropH })
      .resize(INPUT_SIZE, INPUT_SIZE, { fit: 'fill' })
      .raw()
      .toBuffer({ resolveWithObject: true })
    const rgb = buf.data as Buffer
    // Format branch:
    //   sface   → BGR uint8 (raw 0-255), opencv_zoo convention
    //   arcface → RGB normalized (x/255 - 0.5)/0.5 ∈ [-1, 1],
    //             InsightFace ArcFace / AdaFace convention
    const planeSize = INPUT_SIZE * INPUT_SIZE
    const float = new Float32Array(3 * planeSize)
    if (preprocessFormat === 'arcface') {
      for (let i = 0; i < planeSize; i++) {
        const r = (rgb[i * 3] / 255 - 0.5) / 0.5
        const g = (rgb[i * 3 + 1] / 255 - 0.5) / 0.5
        const b = (rgb[i * 3 + 2] / 255 - 0.5) / 0.5
        float[0 * planeSize + i] = r
        float[1 * planeSize + i] = g
        float[2 * planeSize + i] = b
      }
    } else {
      for (let i = 0; i < planeSize; i++) {
        const r = rgb[i * 3]
        const g = rgb[i * 3 + 1]
        const b = rgb[i * 3 + 2]
        float[0 * planeSize + i] = b
        float[1 * planeSize + i] = g
        float[2 * planeSize + i] = r
      }
    }
    const tensor = new ort.Tensor('float32', float, [1, 3, INPUT_SIZE, INPUT_SIZE])
    const feeds: Record<string, any> = {}
    feeds[session.inputNames[0]] = tensor
    const output = await session.run(feeds)
    const out = output[session.outputNames[0]]
    const raw = out.data as Float32Array
    if (raw.length < EMBEDDING_DIM) return null
    // L2 normalize so cosine similarity is just a dot product.
    let norm = 0
    for (let i = 0; i < raw.length; i++) norm += raw[i] * raw[i]
    norm = Math.sqrt(norm) || 1
    const normalized = new Float32Array(raw.length)
    for (let i = 0; i < raw.length; i++) normalized[i] = raw[i] / norm
    return normalized
  } catch (err) {
    console.warn('[SFace] extractEmbedding failed:', err)
    return null
  }
}

/** Cosine similarity for L2-normalized vectors (dot product). */
export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) return 0
  let dot = 0
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i]
  return dot
}

/** Serialize an embedding to a compact base64 string for DB storage. */
export function embeddingToBase64(e: Float32Array): string {
  return Buffer.from(e.buffer, e.byteOffset, e.byteLength).toString('base64')
}

/** Deserialize an embedding from base64. */
export function embeddingFromBase64(s: string): Float32Array {
  const buf = Buffer.from(s, 'base64')
  return new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4)
}
