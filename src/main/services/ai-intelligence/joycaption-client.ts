// File: src/main/services/ai-intelligence/joycaption-client.ts
//
// JoyCaption is Apache-2.0 LLaVA-on-Llama-3.1 VLM specifically trained
// for SFW + NSFW image captioning (no euphemisms, no refusals).
// HuggingFace: fancyfeast/llama-joycaption-beta-one-hf-llava
//
// Integration approach: optional Python sidecar (same pattern as
// xyrene-portable XTTS server). The sidecar runs a small FastAPI / vLLM
// server bound to localhost; this module is the HTTP client. If the
// sidecar isn't running we degrade gracefully and Vault keeps using
// Venice only.
//
// User's explicit preference (2026-05-12): "if Venice vision goes
// offline no other llm should be used" for TAGGING. So JoyCaption is
// wired as a SUPPLEMENTARY description source — its output feeds the
// description-tag-extractor as another vote, but doesn't replace
// Venice as the primary tagger. When Venice is unavailable, the queue
// still pauses with the retry-timer banner.

import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const DEFAULT_HOST = '127.0.0.1'
const DEFAULT_PORT = 8030

export interface JoyCaptionConfig {
  /** Override the host/port. Defaults to localhost:8030. */
  host?: string
  port?: number
  /** Path to the Python sidecar directory. Auto-detected if absent. */
  sidecarPath?: string
  /** Caption style. JoyCaption supports many; we default to
   *  "descriptive" since that aligns with Venice's description style.
   *  Other modes useful in Vault:
   *    - "tags-danbooru" — emits a flat tag list (booru-style)
   *    - "tags-e621"     — same but with e621 vocab (furry/anthro)
   *    - "straightforward" — concrete, objective description */
  defaultStyle?: 'descriptive' | 'descriptive-casual' | 'straightforward' | 'tags-danbooru' | 'tags-e621' | 'tags-rule34'
}

export interface JoyCaptionResult {
  /** The generated caption text. Empty string if generation produced nothing. */
  caption: string
  /** Style that was used. */
  style: string
  /** Local inference latency in ms. */
  latencyMs: number
  /** Estimated VRAM in GB (reported by the sidecar). */
  vramGb?: number
}

/**
 * Find an installed JoyCaption sidecar. Checks (in order):
 *   1. user-supplied path
 *   2. ~/joycaption-sidecar/
 *   3. <vault-data>/joycaption-sidecar/
 *   4. C:\dev\joycaption-sidecar\ (dev convenience)
 *
 * "Installed" means: a directory containing a python entry script
 * (server.py or main.py) AND a venv. Same pattern as the XTTS auto-
 * detection we already use for xyrene-portable.
 */
export function findJoyCaptionSidecar(override?: string | null): string | null {
  const candidates = [
    override,
    path.join(os.homedir(), 'joycaption-sidecar'),
    path.join(os.homedir(), 'Documents', 'Desktop', 'joycaption-sidecar'),
    'C:\\dev\\joycaption-sidecar',
  ].filter((p): p is string => !!p)
  for (const dir of candidates) {
    try {
      const entry = path.join(dir, 'server.py')
      const venv = path.join(dir, 'venv')
      if (fs.existsSync(entry) && fs.existsSync(venv)) return dir
    } catch { /* ignore */ }
  }
  return null
}

function postJson<T>(host: string, port: number, route: string, body: any, timeoutMs = 60000): Promise<T> {
  return new Promise((resolve, reject) => {
    const payload = Buffer.from(JSON.stringify(body), 'utf8')
    const req = http.request(
      {
        hostname: host,
        port,
        path: route,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': payload.length,
        },
        timeout: timeoutMs,
      },
      (res) => {
        const chunks: Buffer[] = []
        res.on('data', (c: Buffer) => chunks.push(c))
        res.on('end', () => {
          const data = Buffer.concat(chunks)
          if (res.statusCode !== 200) {
            reject(new Error(`JoyCaption ${route} returned ${res.statusCode}: ${data.toString('utf8').slice(0, 200)}`))
            return
          }
          try {
            resolve(JSON.parse(data.toString('utf8')) as T)
          } catch (err) {
            reject(new Error(`JoyCaption ${route} returned non-JSON`))
          }
        })
      }
    )
    req.on('error', reject)
    req.on('timeout', () => req.destroy(new Error(`JoyCaption ${route} timed out after ${timeoutMs}ms`)))
    req.write(payload)
    req.end()
  })
}

function getJson<T>(host: string, port: number, route: string, timeoutMs = 3000): Promise<T> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { hostname: host, port, path: route, method: 'GET', timeout: timeoutMs },
      (res) => {
        const chunks: Buffer[] = []
        res.on('data', (c: Buffer) => chunks.push(c))
        res.on('end', () => {
          const data = Buffer.concat(chunks).toString('utf8')
          if (res.statusCode !== 200) {
            reject(new Error(`JoyCaption ${route} returned ${res.statusCode}`))
            return
          }
          try { resolve(JSON.parse(data) as T) }
          catch (err) { reject(err) }
        })
      }
    )
    req.on('error', reject)
    req.on('timeout', () => req.destroy(new Error(`JoyCaption ${route} timed out`)))
    req.end()
  })
}

export class JoyCaptionClient {
  private cfg: Required<JoyCaptionConfig>
  constructor(cfg?: JoyCaptionConfig) {
    this.cfg = {
      host: cfg?.host ?? DEFAULT_HOST,
      port: cfg?.port ?? DEFAULT_PORT,
      sidecarPath: cfg?.sidecarPath ?? findJoyCaptionSidecar() ?? '',
      defaultStyle: cfg?.defaultStyle ?? 'descriptive',
    }
  }

  /** Health probe. Returns null when the sidecar isn't running. */
  async health(): Promise<{ status: string; model: string; device: string; vramGb?: number } | null> {
    try {
      return await getJson(this.cfg.host, this.cfg.port, '/health', 1500)
    } catch {
      return null
    }
  }

  /** True iff a sidecar install path is detected on disk. The server
   *  itself may not be running — call health() to confirm. */
  isInstalled(): boolean {
    return !!this.cfg.sidecarPath
  }

  /**
   * Caption a single image. Returns null when the sidecar is offline
   * (caller should fall through silently — JoyCaption is supplementary).
   */
  async caption(
    imagePath: string,
    options?: { style?: JoyCaptionConfig['defaultStyle']; maxTokens?: number; timeoutMs?: number }
  ): Promise<JoyCaptionResult | null> {
    if (!fs.existsSync(imagePath)) {
      console.warn(`[JoyCaption] caption: file does not exist: ${imagePath}`)
      return null
    }
    const start = Date.now()
    let buf: Buffer
    try {
      buf = fs.readFileSync(imagePath)
    } catch (err) {
      console.warn(`[JoyCaption] caption: read failed for ${imagePath}:`, err)
      return null
    }
    if (buf.length === 0) {
      console.warn(`[JoyCaption] caption: empty file at ${imagePath}`)
      return null
    }
    try {
      const result = await postJson<{ caption: string; vram_gb?: number; error?: string }>(
        this.cfg.host,
        this.cfg.port,
        '/caption',
        {
          image_b64: buf.toString('base64'),
          style: options?.style ?? this.cfg.defaultStyle,
          max_tokens: options?.maxTokens ?? 256,
        },
        options?.timeoutMs ?? 60_000
      )
      if (result?.error) {
        console.warn(`[JoyCaption] sidecar returned error for ${imagePath}:`, result.error)
        return null
      }
      if (typeof result?.caption !== 'string') {
        console.warn(`[JoyCaption] sidecar response missing caption field for ${imagePath}:`, result)
        return null
      }
      return {
        caption: result.caption,
        style: options?.style ?? this.cfg.defaultStyle,
        latencyMs: Date.now() - start,
        vramGb: result.vram_gb,
      }
    } catch (err: any) {
      // Surface enough context to triage from logs without leaking
      // the full base64 payload: error code, message, and the path.
      const msg = err?.message ?? String(err)
      console.warn(`[JoyCaption] HTTP call failed for ${imagePath}: ${msg}`)
      return null
    }
  }

  /**
   * Caption multiple frames in one round-trip (faster than serial
   * single calls — the sidecar can keep the model warm + batch on the
   * GPU). Returns array of results parallel to input (null entries
   * where individual captions failed).
   */
  async captionBatch(
    imagePaths: string[],
    options?: { style?: JoyCaptionConfig['defaultStyle']; maxTokens?: number; timeoutMs?: number }
  ): Promise<Array<JoyCaptionResult | null>> {
    const valid = imagePaths.filter((p) => fs.existsSync(p))
    if (valid.length === 0) return imagePaths.map(() => null)
    const start = Date.now()
    try {
      const payload = valid.map((p) => fs.readFileSync(p).toString('base64'))
      const result = await postJson<{ captions: Array<{ caption: string }> }>(
        this.cfg.host,
        this.cfg.port,
        '/caption/batch',
        {
          images_b64: payload,
          style: options?.style ?? this.cfg.defaultStyle,
          max_tokens: options?.maxTokens ?? 256,
        },
        options?.timeoutMs ?? 120_000
      )
      const elapsed = Date.now() - start
      return result.captions.map((c) => ({
        caption: c.caption ?? '',
        style: options?.style ?? this.cfg.defaultStyle,
        latencyMs: elapsed / valid.length,
      }))
    } catch (err) {
      console.warn('[JoyCaption] batch caption failed:', err)
      return imagePaths.map(() => null)
    }
  }
}

let singleton: JoyCaptionClient | null = null
export function getJoyCaptionClient(): JoyCaptionClient {
  if (!singleton) singleton = new JoyCaptionClient()
  return singleton
}
