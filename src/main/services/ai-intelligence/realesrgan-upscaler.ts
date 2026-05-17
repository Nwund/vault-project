// File: src/main/services/ai-intelligence/realesrgan-upscaler.ts
//
// #B-32 — Real-ESRGAN x4plus upscaler. 4× super-resolution for images +
// per-frame for video sequences. Uses the ONNX-converted weights at
// <userData>/models/real_esrgan_x4plus.onnx (with external-data
// real_esrgan_x4plus.data sibling — onnxruntime-node loads them
// together automatically when both live in the same directory).
//
// Input  : RGB image, any size (gets tiled internally if very large).
// Output : RGB image, 4× upscaled.
//
// Tiling: the model's max input depends on VRAM. 256×256 tiles with
// 16 px overlap is the safe default; bigger tiles = fewer seams but
// risk OOM on 4GB GPUs. Overlap-then-blend hides seam discontinuity.
//
// Activation: drop the ONNX + .data file at the expected path. No
// per-user config needed; the wrapper auto-detects.

import * as path from 'node:path'
import * as fs from 'node:fs'
import { app } from 'electron'

let ort: any = null
let sharp: any = null

interface Session {
  session: any
  inputName: string
  outputName: string
  inputDims: number[]  // [-1, 3, -1, -1] usually
}

let cached: Session | null = null
let initFailed = false

function getModelPath(): string {
  return path.join(app.getPath('userData'), 'models', 'real_esrgan_x4plus.onnx')
}

export function isAvailable(): boolean {
  try { return fs.existsSync(getModelPath()) } catch { return false }
}

async function initialize(): Promise<Session | null> {
  if (cached) return cached
  if (initFailed) return null
  if (!isAvailable()) return null
  try {
    if (!ort) ort = require('onnxruntime-node')
    if (!sharp) sharp = require('sharp')
    const modelPath = getModelPath()
    // Try CUDA first; fall back to CPU. ONNX runtime probes both.
    const providers = ['cuda', 'cpu']
    const session = await ort.InferenceSession.create(modelPath, {
      executionProviders: providers,
      graphOptimizationLevel: 'all',
    })
    const inputName = session.inputNames[0]
    const outputName = session.outputNames[0]
    cached = { session, inputName, outputName, inputDims: [-1, 3, -1, -1] }
    console.log(`[Real-ESRGAN] loaded (input=${inputName}, output=${outputName})`)
    return cached
  } catch (err) {
    console.error('[Real-ESRGAN] init failed:', err)
    initFailed = true
    return null
  }
}

const TILE = 256
const OVERLAP = 16
const SCALE = 4

// HWC uint8 → CHW float32 [0,1], wrapped in an ORT tensor of shape [1,3,H,W].
function hwcToTensor(buf: Buffer, w: number, h: number): any {
  const out = new Float32Array(3 * w * h)
  const plane = w * h
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const src = (y * w + x) * 3
      const dst = y * w + x
      out[dst] = buf[src] / 255
      out[dst + plane] = buf[src + 1] / 255
      out[dst + 2 * plane] = buf[src + 2] / 255
    }
  }
  return new ort.Tensor('float32', out, [1, 3, h, w])
}

// CHW float32 [0,1] tensor → HWC uint8 buffer.
function tensorToHwc(tensor: any, w: number, h: number): Buffer {
  const data = tensor.data as Float32Array
  const plane = w * h
  const buf = Buffer.alloc(w * h * 3)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const src = y * w + x
      const dst = (y * w + x) * 3
      buf[dst] = Math.max(0, Math.min(255, Math.round(data[src] * 255)))
      buf[dst + 1] = Math.max(0, Math.min(255, Math.round(data[src + plane] * 255)))
      buf[dst + 2] = Math.max(0, Math.min(255, Math.round(data[src + 2 * plane] * 255)))
    }
  }
  return buf
}

// Upscale a single tile through the model (no tiling, must fit in VRAM).
async function upscaleTile(rgb: Buffer, w: number, h: number): Promise<Buffer> {
  const ctx = await initialize()
  if (!ctx) throw new Error('Real-ESRGAN not initialized')
  const input = hwcToTensor(rgb, w, h)
  const feeds: Record<string, any> = {}
  feeds[ctx.inputName] = input
  const out = await ctx.session.run(feeds)
  const outTensor = out[ctx.outputName]
  return tensorToHwc(outTensor, w * SCALE, h * SCALE)
}

export interface UpscaleOptions {
  /** Override tile size. Larger = fewer seams, more VRAM. */
  tileSize?: number
  /** Output format. JPG = smaller, PNG = lossless. */
  format?: 'png' | 'jpg' | 'webp'
  /** Output quality (JPG/WebP only, 0..100). */
  quality?: number
}

// Upscale an image file by 4×. Tiles internally to stay under VRAM
// limits; output written to dstPath (or src + '.x4' suffix if omitted).
export async function upscaleImage(
  srcPath: string,
  dstPath?: string,
  options: UpscaleOptions = {},
): Promise<{ ok: boolean; dstPath?: string; error?: string }> {
  try {
    const ctx = await initialize()
    if (!ctx) return { ok: false, error: 'Real-ESRGAN model not installed' }
    if (!sharp) sharp = require('sharp')

    const tile = options.tileSize ?? TILE
    const fmt = options.format ?? 'png'
    const quality = options.quality ?? 92

    const img = sharp(srcPath).removeAlpha()
    const meta = await img.metadata()
    const W = meta.width!
    const H = meta.height!
    const rgb = await img.raw().toBuffer()

    // Output canvas — full image upscaled by SCALE.
    const outW = W * SCALE
    const outH = H * SCALE
    const out = Buffer.alloc(outW * outH * 3)

    // Tile loop with overlap.
    for (let ty = 0; ty < H; ty += tile - OVERLAP) {
      for (let tx = 0; tx < W; tx += tile - OVERLAP) {
        const tw = Math.min(tile, W - tx)
        const th = Math.min(tile, H - ty)
        // Extract tile from input RGB.
        const tileBuf = Buffer.alloc(tw * th * 3)
        for (let y = 0; y < th; y++) {
          const srcOff = ((ty + y) * W + tx) * 3
          const dstOff = (y * tw) * 3
          rgb.copy(tileBuf, dstOff, srcOff, srcOff + tw * 3)
        }
        // Upscale.
        const upBuf = await upscaleTile(tileBuf, tw, th)
        // Paste into output canvas. Skip the overlap region on inner
        // tiles (use only the central portion) to hide seam jumps.
        const skipL = tx > 0 ? OVERLAP / 2 * SCALE : 0
        const skipT = ty > 0 ? OVERLAP / 2 * SCALE : 0
        const dstX = tx * SCALE + skipL
        const dstY = ty * SCALE + skipT
        for (let y = skipT; y < th * SCALE; y++) {
          const srcOff = (y * tw * SCALE + skipL) * 3
          const dstOff = ((dstY + y - skipT) * outW + dstX) * 3
          const copyLen = (tw * SCALE - skipL) * 3
          upBuf.copy(out, dstOff, srcOff, srcOff + copyLen)
        }
      }
    }

    const finalDst = dstPath ?? srcPath.replace(/(\.\w+)$/, `.x4.${fmt}`)
    let pipeline = sharp(out, { raw: { width: outW, height: outH, channels: 3 } })
    if (fmt === 'jpg') pipeline = pipeline.jpeg({ quality })
    else if (fmt === 'webp') pipeline = pipeline.webp({ quality })
    else pipeline = pipeline.png({ compressionLevel: 6 })
    await pipeline.toFile(finalDst)
    return { ok: true, dstPath: finalDst }
  } catch (err: any) {
    return { ok: false, error: err?.message ?? String(err) }
  }
}

export function getStatus(): { available: boolean; loaded: boolean; modelPath: string } {
  return {
    available: isAvailable(),
    loaded: cached !== null,
    modelPath: getModelPath(),
  }
}
