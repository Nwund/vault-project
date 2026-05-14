// File: src/main/services/ai-intelligence/aesthetic-predictor.ts
//
// LAION aesthetic-predictor — a linear / small-MLP head on CLIP image
// embeddings that scores images 1-10 on perceived aesthetic quality.
// Reference: github.com/LAION-AI/aesthetic-predictor (MIT).
//
// Vault produces CLIP-ViT image embeddings as part of Tier 1 ONNX
// tagging. This module reuses that embedding — near-zero added cost
// (one MLP forward pass per frame) — and returns a 0-10 score.
//
// Use cases:
//   - Rank media by aesthetic quality (e.g. "show me my best 100")
//   - Promote high-aesthetic thumbnails on the home page
//   - Surface "best of this performer" in cluster panels
//   - De-prioritize low-quality dupes during dedup review
//
// Activation: drop weights JSON at <userData>/models/aesthetic-linear.json
//
//   {
//     "version": 1,
//     "layers": [
//       { "weight": [[...], [...], ...], "bias": [...] },
//       { "weight": [[...]], "bias": [0.0] }
//     ]
//   }
//
// Each layer entry has weight (out_dim × in_dim matrix) and bias
// (out_dim vector). ReLU activation between layers, none at the
// output. The LAION sac-logos-ava1-l14-linearMSE weights are 1-layer
// (just a linear regression on the 768-D CLIP-L/14 embedding). The
// 5-layer MLP variant is also supported via the same format.
//
// When no weights file is present, predictAesthetic() returns null and
// callers fall through to whatever-they-do-now.

import fs from 'node:fs'
import path from 'node:path'
import { app } from 'electron'

interface AestheticLayer {
  weight: number[][]  // [out_dim][in_dim]
  bias: number[]      // [out_dim]
}
interface AestheticModel {
  version: 1
  layers: AestheticLayer[]
}

let _model: AestheticModel | null = null
let _loadAttempted = false

function getWeightsPath(): string {
  return path.join(app.getPath('userData'), 'models', 'aesthetic-linear.json')
}

export function isAestheticPredictorAvailable(): boolean {
  try { return fs.existsSync(getWeightsPath()) } catch { return false }
}

function loadModel(): AestheticModel | null {
  if (_model) return _model
  if (_loadAttempted) return null
  _loadAttempted = true
  const p = getWeightsPath()
  if (!fs.existsSync(p)) {
    console.log(`[Aesthetic] No weights at ${p} — scorer disabled. Drop LAION/aesthetic-predictor JSON to enable.`)
    return null
  }
  try {
    const raw = fs.readFileSync(p, 'utf8')
    const parsed = JSON.parse(raw) as AestheticModel
    if (parsed?.version !== 1 || !Array.isArray(parsed.layers)) {
      console.warn('[Aesthetic] Weights file present but malformed; expected {version:1, layers:[...]}')
      return null
    }
    // Sanity-check shapes match across layers.
    for (let i = 0; i < parsed.layers.length; i++) {
      const L = parsed.layers[i]
      if (!Array.isArray(L.weight) || !Array.isArray(L.bias)) {
        console.warn(`[Aesthetic] Layer ${i} malformed; aborting load.`)
        return null
      }
      if (L.weight.length !== L.bias.length) {
        console.warn(`[Aesthetic] Layer ${i} weight/bias dim mismatch.`)
        return null
      }
    }
    _model = parsed
    const inDim = parsed.layers[0]?.weight[0]?.length ?? 'unknown'
    const outDim = parsed.layers[parsed.layers.length - 1]?.bias.length ?? 'unknown'
    console.log(`[Aesthetic] Loaded ${parsed.layers.length}-layer model (in=${inDim}, out=${outDim})`)
    return parsed
  } catch (err) {
    console.warn('[Aesthetic] Weights load failed:', err)
    return null
  }
}

/**
 * Score a CLIP image embedding. Returns a 0-10 number, or null when
 * weights aren't installed.
 *
 * Embedding dim must match the model's input layer in_dim — typically
 * 768 for CLIP-ViT-L/14, 512 for ViT-B/32. Mismatched dims return
 * null + log; caller should fall through.
 */
export function predictAesthetic(embedding: Float32Array | number[]): number | null {
  const m = loadModel()
  if (!m) return null
  if (m.layers.length === 0) return null

  const inDim = m.layers[0].weight[0].length
  if (embedding.length !== inDim) {
    console.warn(`[Aesthetic] embedding dim ${embedding.length} != model in_dim ${inDim} — skipping`)
    return null
  }

  let h: number[] = Array.from(embedding)
  for (let li = 0; li < m.layers.length; li++) {
    const L = m.layers[li]
    const outDim = L.bias.length
    const next = new Array(outDim).fill(0)
    for (let i = 0; i < outDim; i++) {
      const wi = L.weight[i]
      let s = L.bias[i]
      const len = Math.min(h.length, wi.length)
      for (let j = 0; j < len; j++) s += h[j] * wi[j]
      // ReLU on hidden layers, linear on output.
      next[i] = li < m.layers.length - 1 ? Math.max(0, s) : s
    }
    h = next
  }

  // Output is scalar (regression head). Clamp to a sane 0-10 range
  // since the LAION head technically extrapolates.
  const raw = h[0]
  if (typeof raw !== 'number' || !isFinite(raw)) return null
  return Math.max(0, Math.min(10, raw))
}

/** Status helper for the Setup tab card. */
export function getAestheticPredictorStatus(): {
  installed: boolean
  expectedPath: string
  layerCount: number | null
  inputDim: number | null
} {
  const installed = isAestheticPredictorAvailable()
  const m = installed ? loadModel() : null
  return {
    installed,
    expectedPath: getWeightsPath(),
    layerCount: m?.layers.length ?? null,
    inputDim: m?.layers[0]?.weight[0]?.length ?? null,
  }
}
