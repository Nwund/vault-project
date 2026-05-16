// File: src/main/services/watermark-cropper.ts
//
// #120 — Watermark/banner crop heuristic. Used after a bulk save from
// tubes / Reddit. Analyzes the top + bottom 15% of an image, computes
// per-row variance + brightness, decides whether those bands are
// watermark/banner content vs natural image content. When they are,
// crops them off + writes the cropped version back to the same path.
//
// Heuristics (per band):
//   1. Solid-color test  — variance across rows < threshold → uniform
//      bar (e.g. black letterbox, white footer)
//   2. Brightness-contrast test — band mean brightness very different
//      from main image mean (e.g. white banner over dark photo)
//   3. Row-uniformity — most rows within band have similar pixel means
//      (banner pattern repeats horizontally)
//
// Bands that fail all three tests are kept; bands that pass any one
// of them are cropped. Conservative — false negatives are preferred
// over chopping into actual content.

import fs from 'node:fs'
import sharp from 'sharp'

interface CropDecision {
  cropTop: number      // pixels to crop from top
  cropBottom: number   // pixels to crop from bottom
  rationale: string
}

const BAND_RATIO = 0.15        // top/bottom 15% candidate band
const VARIANCE_THRESHOLD = 8   // per-row variance below this = uniform bar
const BRIGHTNESS_DELTA = 60    // mean-luma delta vs image mean

/** Returns the cropping decision based on band analysis. */
async function analyze(buf: Buffer): Promise<{ width: number; height: number; decision: CropDecision }> {
  const meta = await sharp(buf).metadata()
  const w = meta.width ?? 0
  const h = meta.height ?? 0
  if (w === 0 || h === 0 || h < 200) {
    return { width: w, height: h, decision: { cropTop: 0, cropBottom: 0, rationale: 'too small' } }
  }
  // Downscale to a manageable size for variance math.
  const scaledW = Math.min(256, w)
  const scaledH = Math.round((h / w) * scaledW)
  const raw = await sharp(buf)
    .resize(scaledW, scaledH, { fit: 'fill' })
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true })
  const pixels = new Uint8Array(raw.data)
  const bandSize = Math.floor(scaledH * BAND_RATIO)
  // Compute per-row mean + variance
  const rowMeans = new Float32Array(scaledH)
  const rowVars = new Float32Array(scaledH)
  for (let y = 0; y < scaledH; y++) {
    let sum = 0
    for (let x = 0; x < scaledW; x++) sum += pixels[y * scaledW + x]
    const mean = sum / scaledW
    rowMeans[y] = mean
    let v = 0
    for (let x = 0; x < scaledW; x++) {
      const d = pixels[y * scaledW + x] - mean
      v += d * d
    }
    rowVars[y] = v / scaledW
  }
  // Overall image mean (excluding bands)
  let bodySum = 0, bodyN = 0
  for (let y = bandSize; y < scaledH - bandSize; y++) {
    bodySum += rowMeans[y]; bodyN++
  }
  const bodyMean = bodyN > 0 ? bodySum / bodyN : 128
  // Test each band — start from outside, peel rows until one fails
  const isWatermarkRow = (y: number): boolean => {
    const variance = rowVars[y]
    if (variance < VARIANCE_THRESHOLD) return true  // uniform bar
    const brightDelta = Math.abs(rowMeans[y] - bodyMean)
    if (brightDelta > BRIGHTNESS_DELTA) return true  // wildly different brightness
    return false
  }
  let topCrop = 0
  for (let y = 0; y < bandSize; y++) {
    if (isWatermarkRow(y)) topCrop = y + 1
    else break
  }
  let bottomCrop = 0
  for (let y = 0; y < bandSize; y++) {
    const rowIdx = scaledH - 1 - y
    if (isWatermarkRow(rowIdx)) bottomCrop = y + 1
    else break
  }
  const scaleBack = h / scaledH
  const cropTopPx = Math.round(topCrop * scaleBack)
  const cropBottomPx = Math.round(bottomCrop * scaleBack)
  const rationale = [
    cropTopPx > 0 ? `top ${cropTopPx}px (watermark band)` : '',
    cropBottomPx > 0 ? `bottom ${cropBottomPx}px (watermark band)` : '',
  ].filter(Boolean).join(', ') || 'no crop'
  return { width: w, height: h, decision: { cropTop: cropTopPx, cropBottom: cropBottomPx, rationale } }
}

/**
 * In-place watermark crop. Analyzes the image, crops top/bottom
 * watermark bands when detected, writes back to the same path
 * (preserving original ext via sharp format auto-detection).
 * Returns the decision so the caller can log / report.
 */
export async function cropWatermarksInPlace(filePath: string): Promise<{
  ok: boolean
  cropped: boolean
  width?: number
  height?: number
  decision?: CropDecision
  error?: string
}> {
  try {
    if (!fs.existsSync(filePath)) return { ok: false, cropped: false, error: 'File does not exist' }
    const buf = fs.readFileSync(filePath)
    const { width, height, decision } = await analyze(buf)
    if (decision.cropTop === 0 && decision.cropBottom === 0) {
      return { ok: true, cropped: false, width, height, decision }
    }
    const newHeight = height - decision.cropTop - decision.cropBottom
    if (newHeight < 50) {
      return { ok: true, cropped: false, width, height, decision: { ...decision, rationale: 'crop would leave <50px' } }
    }
    const cropped = await sharp(buf)
      .extract({ left: 0, top: decision.cropTop, width, height: newHeight })
      .toBuffer()
    fs.writeFileSync(filePath, cropped)
    return { ok: true, cropped: true, width, height: newHeight, decision }
  } catch (err: any) {
    return { ok: false, cropped: false, error: err?.message ?? String(err) }
  }
}
