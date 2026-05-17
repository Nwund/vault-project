// File: src/main/services/ai-intelligence/vault-ml-client.ts
//
// Typed HTTP client for the vault-ml-sidecar (server.py). One client
// per model_id; each method routes to the right /vl, /embed, /classify
// endpoint with the right model_id baked in. Lazy-loads via /load on
// first call; the sidecar handles model resident-in-VRAM lifecycle.

import * as http from 'node:http'
import { ensureVaultMlSidecar } from './vault-ml-launcher'

const HOST = '127.0.0.1'
const PORT = 8060
const DEFAULT_TIMEOUT_MS = 120_000  // VL inference can take 30-90s on first call

interface RequestOptions {
  timeoutMs?: number
}

function postJson<T>(path: string, body: any, opts: RequestOptions = {}): Promise<T> {
  return new Promise((resolve, reject) => {
    const data = Buffer.from(JSON.stringify(body), 'utf8')
    const req = http.request(
      {
        hostname: HOST,
        port: PORT,
        path,
        method: 'POST',
        timeout: opts.timeoutMs ?? DEFAULT_TIMEOUT_MS,
        headers: { 'Content-Type': 'application/json', 'Content-Length': data.length },
      },
      (res) => {
        const chunks: Buffer[] = []
        res.on('data', (c) => chunks.push(c))
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8')
          if (res.statusCode && res.statusCode >= 400) {
            reject(new Error(`HTTP ${res.statusCode}: ${text.slice(0, 200)}`))
            return
          }
          try { resolve(JSON.parse(text) as T) } catch (e: any) {
            reject(new Error(`Bad JSON: ${e.message}`))
          }
        })
      }
    )
    req.on('error', reject)
    req.on('timeout', () => { req.destroy(); reject(new Error('vault-ml request timeout')) })
    req.write(data)
    req.end()
  })
}

function getJson<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { hostname: HOST, port: PORT, path, method: 'GET', timeout: opts.timeoutMs ?? 5_000 },
      (res) => {
        const chunks: Buffer[] = []
        res.on('data', (c) => chunks.push(c))
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8')
          if (res.statusCode && res.statusCode >= 400) {
            reject(new Error(`HTTP ${res.statusCode}: ${text}`))
            return
          }
          try { resolve(JSON.parse(text) as T) } catch (e: any) {
            reject(new Error(`Bad JSON: ${e.message}`))
          }
        })
      }
    )
    req.on('error', reject)
    req.on('timeout', () => { req.destroy(); reject(new Error('vault-ml health timeout')) })
    req.end()
  })
}

// ─── public API ────────────────────────────────────────────────────────

export interface VaultMlHealth {
  status: string
  device: string
  dtype: string
  models_dir: string
  models_dir_exists: boolean
  loaded: string[]
  available_loaders: string[]
}

export interface FlorenceParsed {
  // Florence-2's post-processed output is task-shaped. Keys vary by task:
  //   <CAPTION>: { '<CAPTION>': 'a cat sitting...' }
  //   <OD>:      { '<OD>': { bboxes: [[x1,y1,x2,y2],...], labels: ['cat',...] } }
  //   <OCR>:     { '<OCR>': 'detected text' }
  //   etc.
  [key: string]: any
}

export interface FlorenceResponse {
  ok: boolean
  task: string
  raw: string
  parsed: FlorenceParsed
}

export interface EmbedResponse {
  ok: boolean
  model_id: string
  embedding: number[]
  dim: number
}

export interface ClassifyResponse {
  ok: boolean
  model_id: string
  predictions: Array<{ label: string; score: number }>
}

export interface AudioEmotionResponse {
  ok: boolean
  model_id: string
  scores: number[]
  labels: string[]
}

export class VaultMlClient {
  /** GET /health — also auto-launches the sidecar if not running. */
  async health(autoStart = true): Promise<VaultMlHealth | null> {
    try {
      return await getJson<VaultMlHealth>('/health')
    } catch {
      if (!autoStart) return null
      const ok = await ensureVaultMlSidecar()
      if (!ok) return null
      try { return await getJson<VaultMlHealth>('/health') } catch { return null }
    }
  }

  /** POST /load/{id} — preload a specific model (no-op if already loaded). */
  async load(modelId: string): Promise<boolean> {
    try {
      await postJson(`/load/${modelId}`, {}, { timeoutMs: 5 * 60_000 })
      return true
    } catch {
      return false
    }
  }

  async unload(modelId: string): Promise<boolean> {
    try {
      await postJson(`/unload/${modelId}`, {})
      return true
    } catch {
      return false
    }
  }

  // ─── Florence-2 ──────────────────────────────────────────────────────

  /**
   * Florence-2 multi-task call. `task` is one of the Florence-2 task
   * tokens (defaults to <CAPTION>). For grounding/referring tasks,
   * pass `text_input` (e.g. text_input="cat" with task="<CAPTION_TO_PHRASE_GROUNDING>").
   *
   * Image must be a server-readable file path OR base64-encoded bytes.
   */
  async florence(args: {
    imagePath?: string
    imageBase64?: string
    task?: string
    text_input?: string
    maxNewTokens?: number
  }): Promise<FlorenceResponse> {
    return postJson<FlorenceResponse>('/vl/florence', {
      image: { path: args.imagePath, base64: args.imageBase64 },
      task: args.task ?? '<CAPTION>',
      text_input: args.text_input,
      max_new_tokens: args.maxNewTokens ?? 1024,
    })
  }

  // ─── Embedding ───────────────────────────────────────────────────────

  /** Encode an image via a vision backbone (default: DINOv3-L). */
  async embedImage(args: {
    imagePath?: string
    imageBase64?: string
    modelId?: 'dinov3-vit-l' | 'metaclip-h14'
  }): Promise<EmbedResponse> {
    return postJson<EmbedResponse>('/embed/image', {
      image: { path: args.imagePath, base64: args.imageBase64 },
      model_id: args.modelId ?? 'dinov3-vit-l',
    })
  }

  // ─── Classification ─────────────────────────────────────────────────

  /** Run an image classifier (default: SigLIP2 age classifier). */
  async classifyImage(args: {
    imagePath?: string
    imageBase64?: string
    modelId?: 'siglip2-age'
    topK?: number
  }): Promise<ClassifyResponse> {
    return postJson<ClassifyResponse>('/classify/image', {
      image: { path: args.imagePath, base64: args.imageBase64 },
      model_id: args.modelId ?? 'siglip2-age',
      top_k: args.topK ?? 5,
    })
  }

  /** Audio → continuous emotion scores [arousal, dominance, valence]. */
  async classifyAudioEmotion(args: {
    audioPath?: string
    audioBase64?: string
  }): Promise<AudioEmotionResponse> {
    return postJson<AudioEmotionResponse>('/classify/audio', {
      audio: { path: args.audioPath, base64: args.audioBase64 },
      model_id: 'w2v2-l-emotion',
    })
  }

  // ─── SAM2 segmentation (#B-22) ─────────────────────────────────────
  async sam2Segment(args: {
    imagePath?: string
    imageBase64?: string
    points?: Array<[number, number]>
    pointLabels?: number[]  // 1 = foreground, 0 = background
    box?: [number, number, number, number]
    multimaskOutput?: boolean
  }): Promise<{
    ok: boolean
    masks?: Array<{ score: number; shape: number[]; mask_base64: string }>
    error?: string
  }> {
    return postJson('/segment/sam2', {
      image: { path: args.imagePath, base64: args.imageBase64 },
      points: args.points,
      point_labels: args.pointLabels,
      box: args.box,
      multimask_output: args.multimaskOutput ?? true,
    })
  }

  // ─── Demucs source separation (#B-29) ──────────────────────────────
  async demucsSeparate(args: {
    audioPath?: string
    audioBase64?: string
    dstDir: string
  }): Promise<{
    ok: boolean
    stems?: Record<string, string>
    sample_rate?: number
    error?: string
  }> {
    return postJson('/separate/demucs', {
      audio: { path: args.audioPath, base64: args.audioBase64 },
      dst_dir: args.dstDir,
    }, { timeoutMs: 10 * 60_000 })  // long-running, give it 10 min
  }

  // ─── MS-CLAP cross-modal embed (#B-37) ─────────────────────────────
  async msclapEmbed(args: {
    kind: 'audio' | 'text'
    audioPath?: string
    text?: string[]
  }): Promise<{
    ok: boolean
    embeddings?: number[][]
    shape?: number[]
    error?: string
  }> {
    return postJson('/embed/msclap', {
      kind: args.kind,
      audio: args.audioPath ? { path: args.audioPath } : undefined,
      text: args.text,
    })
  }

  // ─── CodeFormer face restoration (#B-33) ───────────────────────────
  async codeformerRestore(args: {
    imagePath?: string
    imageBase64?: string
    dstPath: string
    fidelity?: number  // 0..1 (0.7 default)
  }): Promise<{
    ok: boolean
    dst_path?: string
    faces_restored?: number
    error?: string
  }> {
    return postJson('/restore/codeformer', {
      image: { path: args.imagePath, base64: args.imageBase64 },
      dst_path: args.dstPath,
      fidelity: args.fidelity ?? 0.7,
    }, { timeoutMs: 5 * 60_000 })
  }

  // ─── Depth Anything V2 (#B-23) ────────────────────────────────────
  async depthAnythingV2(args: {
    imagePath?: string
    imageBase64?: string
  }): Promise<{
    ok: boolean
    width?: number
    height?: number
    min_depth?: number
    max_depth?: number
    depth_png_base64?: string
    error?: string
  }> {
    return postJson('/depth/anything-v2', {
      image: { path: args.imagePath, base64: args.imageBase64 },
    })
  }

  // ─── MusicGen kink-mood bed (#H-148) ──────────────────────────────
  async musicgenGenerate(args: {
    prompts: string[]
    durationSec?: number
    dstDir: string
  }): Promise<{
    ok: boolean
    files?: string[]
    sample_rate?: number
    error?: string
  }> {
    return postJson('/generate/musicgen', {
      prompts: args.prompts,
      duration_sec: args.durationSec ?? 8,
      dst_dir: args.dstDir,
    }, { timeoutMs: 10 * 60_000 })
  }

  // ─── BLIP captioning (tagger pipeline) ─────────────────────────────
  async blipCaption(args: {
    imagePath?: string
    imageBase64?: string
    conditionalPrompt?: string
    maxNewTokens?: number
  }): Promise<{ ok: boolean; caption?: string; error?: string }> {
    return postJson('/caption/blip', {
      image: { path: args.imagePath, base64: args.imageBase64 },
      conditional_prompt: args.conditionalPrompt,
      max_new_tokens: args.maxNewTokens ?? 80,
    })
  }

  // ─── Mel-Roformer vocal isolation (#B-30) ──────────────────────────
  async melRoformerSeparate(args: {
    audioPath?: string
    audioBase64?: string
    dstPath: string
  }): Promise<{
    ok: boolean
    dst_path?: string
    sample_rate?: number
    error?: string
  }> {
    return postJson('/separate/mel-roformer', {
      audio: { path: args.audioPath, base64: args.audioBase64 },
      dst_path: args.dstPath,
    }, { timeoutMs: 15 * 60_000 })
  }
}

let singleton: VaultMlClient | null = null
export function getVaultMlClient(): VaultMlClient {
  if (!singleton) singleton = new VaultMlClient()
  return singleton
}
