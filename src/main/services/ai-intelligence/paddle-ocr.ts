// File: src/main/services/ai-intelligence/paddle-ocr.ts
//
// PaddleOCR-style two-stage OCR: text-detection-db produces a per-pixel
// probability map of "is this text"; we threshold → connected-component
// label → bounding boxes. text-recognition-crnn then runs each box
// through a CRNN + CTC decoder to recover the string.
//
// Models (manual install at <userData>/models/):
//   - text-detection-db.onnx     — DB++ text region detector
//   - text-recognition-crnn.onnx — CRNN recognizer, 37-class charset
//
// Falls back to tesseract.js (frame-ocr.ts) when either model is
// missing. Activation is opt-in via settings.ai.useDbCrnnOcr.

import fs from 'node:fs'
import path from 'node:path'
import { app } from 'electron'

let ort: any = null
let sharp: any = null

// Lowercase Latin + digits + reserved blank for CTC. Many PaddleOCR
// CRNN exports use a richer charset (mixed case + punctuation), but
// the 36-symbol baseline catches the bulk of burned-in text and
// avoids charset-mismatch noise. We append the CTC blank at index 0.
const CHARSET = '_0123456789abcdefghijklmnopqrstuvwxyz'

const DB_INPUT_SIZE = 736 // multiple of 32; tradeoff: bigger = more accurate text boxes at small resolution
const DB_THRESHOLD = 0.3
const DB_BOX_MIN_AREA = 12
const DB_BOX_MIN_W = 4
const DB_BOX_MIN_H = 4
const DB_BOX_PADDING = 2

const CRNN_INPUT_HEIGHT = 32
const CRNN_INPUT_MAX_WIDTH = 320

let dbSession: any = null
let crnnSession: any = null
let initialized = false
let initFailed = false

function getDbModelPath(): string {
  return path.join(app.getPath('userData'), 'models', 'text-detection-db.onnx')
}
function getCrnnModelPath(): string {
  return path.join(app.getPath('userData'), 'models', 'text-recognition-crnn.onnx')
}

export function isDbCrnnOcrAvailable(): boolean {
  return fs.existsSync(getDbModelPath()) && fs.existsSync(getCrnnModelPath())
}

async function loadModels(): Promise<void> {
  if (initialized) return
  if (!isDbCrnnOcrAvailable()) { initialized = true; initFailed = true; return }
  try {
    if (!ort) ort = await import('onnxruntime-node')
    if (!sharp) sharp = require('sharp')
    dbSession = await ort.InferenceSession.create(getDbModelPath(), {
      executionProviders: ['cpu'],
      graphOptimizationLevel: 'all',
    })
    crnnSession = await ort.InferenceSession.create(getCrnnModelPath(), {
      executionProviders: ['cpu'],
      graphOptimizationLevel: 'all',
    })
    console.log('[PaddleOCR] DB + CRNN models loaded')
  } catch (err) {
    console.warn('[PaddleOCR] Load failed, falling back to tesseract:', err)
    initFailed = true
  } finally {
    initialized = true
  }
}

interface DetectionBox {
  x: number; y: number; w: number; h: number
  /** Mean DB probability inside the contour — keep > 0.4 as a quality gate. */
  meanProb: number
}

/**
 * Threshold DB output → 8-connected component label → axis-aligned
 * bounding boxes per blob. PaddleOCR's full DB post-processing uses
 * polygonal contours; for burned-in screen text (Snapchat handles,
 * username overlays), axis-aligned rects are fine and ~10× faster
 * to implement.
 */
function extractBoxes(
  probMap: Float32Array,
  mapW: number,
  mapH: number,
  origW: number,
  origH: number
): DetectionBox[] {
  const total = mapW * mapH
  const mask = new Uint8Array(total)
  for (let i = 0; i < total; i++) mask[i] = probMap[i] >= DB_THRESHOLD ? 1 : 0

  const labels = new Int32Array(total)
  const stack: number[] = []
  const boxes: DetectionBox[] = []
  let nextLabel = 1

  // Iterative flood fill — JS recursion would blow the stack on
  // larger maps. Each push is a pixel index; the eight neighbors get
  // checked + pushed when set in mask.
  for (let y = 0; y < mapH; y++) {
    for (let x = 0; x < mapW; x++) {
      const idx = y * mapW + x
      if (!mask[idx] || labels[idx]) continue

      const label = nextLabel++
      let minX = x, maxX = x, minY = y, maxY = y
      let area = 0
      let probSum = 0
      stack.length = 0
      stack.push(idx)
      labels[idx] = label

      while (stack.length > 0) {
        const cur = stack.pop()!
        const cy = (cur / mapW) | 0
        const cx = cur - cy * mapW
        area++
        probSum += probMap[cur]
        if (cx < minX) minX = cx
        if (cx > maxX) maxX = cx
        if (cy < minY) minY = cy
        if (cy > maxY) maxY = cy

        // 8-connected neighbors.
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue
            const ny = cy + dy
            const nx = cx + dx
            if (ny < 0 || ny >= mapH || nx < 0 || nx >= mapW) continue
            const nidx = ny * mapW + nx
            if (!mask[nidx] || labels[nidx]) continue
            labels[nidx] = label
            stack.push(nidx)
          }
        }
      }

      if (area < DB_BOX_MIN_AREA) continue
      const w = maxX - minX + 1
      const h = maxY - minY + 1
      if (w < DB_BOX_MIN_W || h < DB_BOX_MIN_H) continue

      // Map detection-map coords back to original image coords + pad.
      const scaleX = origW / mapW
      const scaleY = origH / mapH
      const ox = Math.max(0, Math.floor(minX * scaleX) - DB_BOX_PADDING)
      const oy = Math.max(0, Math.floor(minY * scaleY) - DB_BOX_PADDING)
      const ow = Math.min(origW - ox, Math.ceil(w * scaleX) + DB_BOX_PADDING * 2)
      const oh = Math.min(origH - oy, Math.ceil(h * scaleY) + DB_BOX_PADDING * 2)

      boxes.push({
        x: ox, y: oy, w: ow, h: oh,
        meanProb: probSum / area,
      })
    }
  }

  // Quality gate — drop low-confidence blobs.
  return boxes
    .filter((b) => b.meanProb > 0.4)
    .sort((a, b) => a.y - b.y || a.x - b.x)
}

/** Preprocess image for DB detector: resize to 736x736, normalize. */
async function preprocessForDb(imagePath: string): Promise<{
  tensor: any
  origW: number
  origH: number
}> {
  const meta = await sharp(imagePath).metadata()
  const origW = meta.width ?? DB_INPUT_SIZE
  const origH = meta.height ?? DB_INPUT_SIZE
  const { data } = await sharp(imagePath)
    .resize(DB_INPUT_SIZE, DB_INPUT_SIZE, { fit: 'fill' })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })

  // PaddleOCR DB normalization: subtract [123.675, 116.28, 103.53] / scale 1/58.39, 1/57.12, 1/57.38
  const mean = [123.675, 116.28, 103.53]
  const std = [58.395, 57.12, 57.375]
  const out = new Float32Array(1 * 3 * DB_INPUT_SIZE * DB_INPUT_SIZE)
  for (let c = 0; c < 3; c++) {
    for (let h = 0; h < DB_INPUT_SIZE; h++) {
      for (let w = 0; w < DB_INPUT_SIZE; w++) {
        const srcIdx = (h * DB_INPUT_SIZE + w) * 3 + c
        const dstIdx = c * DB_INPUT_SIZE * DB_INPUT_SIZE + h * DB_INPUT_SIZE + w
        out[dstIdx] = (data[srcIdx] - mean[c]) / std[c]
      }
    }
  }
  return {
    tensor: new ort.Tensor('float32', out, [1, 3, DB_INPUT_SIZE, DB_INPUT_SIZE]),
    origW,
    origH,
  }
}

/**
 * CTC greedy decode — pick argmax per timestep, then collapse
 * repeats and remove blanks (index 0).
 */
function ctcGreedyDecode(logits: Float32Array, T: number, C: number): string {
  let out = ''
  let prev = -1
  for (let t = 0; t < T; t++) {
    let best = 0
    let bestScore = -Infinity
    const base = t * C
    for (let c = 0; c < C; c++) {
      const v = logits[base + c]
      if (v > bestScore) { bestScore = v; best = c }
    }
    if (best !== prev && best !== 0 && best < CHARSET.length) {
      out += CHARSET[best]
    }
    prev = best
  }
  return out
}

/** Preprocess a single box crop for CRNN. */
async function preprocessForCrnn(
  imagePath: string,
  box: DetectionBox
): Promise<{ tensor: any; width: number } | null> {
  try {
    // Maintain aspect ratio at fixed CRNN_INPUT_HEIGHT, cap width.
    const aspect = box.w / box.h
    let targetW = Math.round(CRNN_INPUT_HEIGHT * aspect)
    targetW = Math.min(targetW, CRNN_INPUT_MAX_WIDTH)
    targetW = Math.max(targetW, 16)
    // CRNN input width must be multiple of 4 for many exports.
    targetW = Math.ceil(targetW / 4) * 4

    const { data } = await sharp(imagePath)
      .extract({ left: box.x, top: box.y, width: box.w, height: box.h })
      .resize(targetW, CRNN_INPUT_HEIGHT, { fit: 'fill' })
      .grayscale()
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true })

    // PaddleOCR CRNN normalization: (x / 255 - 0.5) / 0.5
    const out = new Float32Array(1 * 1 * CRNN_INPUT_HEIGHT * targetW)
    for (let i = 0; i < data.length; i++) {
      out[i] = (data[i] / 255 - 0.5) / 0.5
    }
    return {
      tensor: new ort.Tensor('float32', out, [1, 1, CRNN_INPUT_HEIGHT, targetW]),
      width: targetW,
    }
  } catch (err) {
    console.warn('[PaddleOCR] CRNN preprocess failed for box:', box, err)
    return null
  }
}

/**
 * Run the full DB → boxes → CRNN pipeline on a single image. Returns
 * recognized text strings, one per detected text region.
 */
export async function runDbCrnnOcr(imagePath: string): Promise<string[]> {
  await loadModels()
  if (initFailed || !dbSession || !crnnSession) return []
  if (!fs.existsSync(imagePath)) return []

  try {
    // ─── Stage 1: detection ────────────────────────────────────────────
    const { tensor: dbInput, origW, origH } = await preprocessForDb(imagePath)
    const dbInputName = dbSession.inputNames[0] ?? 'x'
    const dbOutput = await dbSession.run({ [dbInputName]: dbInput })
    const dbOutTensor: any = Object.values(dbOutput)[0]
    const dbDims = dbOutTensor.dims as number[]
    const probMap = dbOutTensor.data as Float32Array
    // Expect [1, 1, H, W] or [1, H, W]. Pick the last two as map dims.
    const mapH = dbDims[dbDims.length - 2]
    const mapW = dbDims[dbDims.length - 1]
    const boxes = extractBoxes(probMap, mapW, mapH, origW, origH)
    if (boxes.length === 0) return []

    // ─── Stage 2: per-box recognition ──────────────────────────────────
    const results: string[] = []
    const crnnInputName = crnnSession.inputNames[0] ?? 'x'
    // Cap the per-frame box count — heavy frames (full-screen subtitle
    // walls) would otherwise cause runaway CRNN cost.
    const limited = boxes.slice(0, 25)
    for (const box of limited) {
      const pre = await preprocessForCrnn(imagePath, box)
      if (!pre) continue
      try {
        const crnnOutput = await crnnSession.run({ [crnnInputName]: pre.tensor })
        const crnnOutTensor: any = Object.values(crnnOutput)[0]
        const outDims = crnnOutTensor.dims as number[]
        // Expect either [T, 1, C] or [1, T, C]. Normalize to (T, C).
        let T = 0, C = 0
        if (outDims.length === 3) {
          if (outDims[1] === 1) { T = outDims[0]; C = outDims[2] }
          else if (outDims[0] === 1) { T = outDims[1]; C = outDims[2] }
        }
        if (T === 0 || C === 0) continue
        const text = ctcGreedyDecode(crnnOutTensor.data as Float32Array, T, C).trim()
        if (text.length >= 2) results.push(text)
      } catch (err) {
        // Individual box recognition failures shouldn't kill the whole pass.
        console.warn('[PaddleOCR] CRNN inference failed for box:', err)
      }
    }
    return results
  } catch (err) {
    console.warn('[PaddleOCR] Pipeline failed:', err)
    return []
  }
}

export function getDbCrnnStatus(): {
  available: boolean
  detectorPath: string
  recognizerPath: string
  detectorSize: number
  recognizerSize: number
} {
  let detectorSize = 0
  let recognizerSize = 0
  try { detectorSize = fs.statSync(getDbModelPath()).size } catch { /* missing */ }
  try { recognizerSize = fs.statSync(getCrnnModelPath()).size } catch { /* missing */ }
  return {
    available: detectorSize > 0 && recognizerSize > 0,
    detectorPath: getDbModelPath(),
    recognizerPath: getCrnnModelPath(),
    detectorSize,
    recognizerSize,
  }
}
