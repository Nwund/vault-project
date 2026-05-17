// File: src/main/services/video-diffusion-bridge.ts
//
// #377 H-153 — Local video diffusion bridge (WAN / Hunyuan / CogVideoX).
// These are 5-30 GB diffusion models that require their own runtime
// (ComfyUI / diffusers Python sidecar). Vault's job is to:
//
//   1. Discover whether a sidecar is reachable.
//   2. Translate a prompt + per-model knob set into the sidecar's
//      JSON API call.
//   3. Save the resulting MP4 into the user's library + tag it
//      ai-generated:<model>.
//
// We don't bundle any of these models — too large for an Electron
// dist. The user runs ComfyUI separately and points us at it. This
// matches our patterns for whisper.cpp / xtts-server / tor.
//
// Default sidecar contract (ComfyUI-shape, but with simplified inputs):
//
//   POST /generate
//     { model: "wan-1.3b" | "hunyuan-7b" | "cogvideox-5b",
//       prompt: string,
//       negativePrompt?: string,
//       frames?: number,           // 16..120
//       steps?: number,            // 25 default
//       cfgScale?: number,         // 7 default
//       seed?: number,
//       width?: number, height?: number }
//     → { ok: true, jobId: string }
//
//   GET /status/:jobId
//     → { state: "queued" | "running" | "done" | "error", progress?: 0..1,
//         outputPath?: string, error?: string }

import * as path from 'node:path'
import * as fs from 'node:fs'
import type { DB } from '../db'

let baseUrl = 'http://127.0.0.1:8188'

export function setEndpoint(url: string): void {
  baseUrl = url.replace(/\/$/, '')
}

export type Model = 'wan-1.3b' | 'wan-14b' | 'hunyuan-7b' | 'cogvideox-5b'

export interface GenerateRequest {
  model: Model
  prompt: string
  negativePrompt?: string
  frames?: number
  steps?: number
  cfgScale?: number
  seed?: number
  width?: number
  height?: number
}

export interface GenerateAck {
  ok: boolean
  jobId?: string
  error?: string
}

export interface GenerateStatus {
  state: 'queued' | 'running' | 'done' | 'error'
  progress?: number
  outputPath?: string
  error?: string
}

export async function probe(): Promise<{ reachable: boolean; models?: Model[]; error?: string }> {
  try {
    const res = await fetch(`${baseUrl}/models`)
    if (!res.ok) return { reachable: false, error: `${res.status}` }
    const data = await res.json() as { models: Model[] }
    return { reachable: true, models: data.models }
  } catch (err: any) {
    return { reachable: false, error: String(err?.message ?? err) }
  }
}

export async function generate(req: GenerateRequest): Promise<GenerateAck> {
  try {
    const res = await fetch(`${baseUrl}/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    })
    const data = await res.json() as GenerateAck
    return { ok: res.ok && data.ok, jobId: data.jobId, error: data.error }
  } catch (err: any) {
    return { ok: false, error: String(err?.message ?? err) }
  }
}

export async function status(jobId: string): Promise<GenerateStatus> {
  try {
    const res = await fetch(`${baseUrl}/status/${encodeURIComponent(jobId)}`)
    const data = await res.json() as GenerateStatus
    return data
  } catch (err: any) {
    return { state: 'error', error: String(err?.message ?? err) }
  }
}

/** Poll status, then move output into the user's media library. */
export async function generateAndImport(
  req: GenerateRequest,
  importDir: string,
  db: DB,
  onProgress?: (progress: number) => void,
): Promise<{ ok: boolean; mediaId?: string; error?: string }> {
  const ack = await generate(req)
  if (!ack.ok || !ack.jobId) return { ok: false, error: ack.error ?? 'generate failed' }
  const jobId = ack.jobId
  while (true) {
    const st = await status(jobId)
    if (st.state === 'error') return { ok: false, error: st.error ?? 'sidecar error' }
    if (st.state === 'done' && st.outputPath) {
      const dst = path.join(importDir, `vault-gen-${jobId}.mp4`)
      try {
        fs.mkdirSync(path.dirname(dst), { recursive: true })
        fs.copyFileSync(st.outputPath, dst)
      } catch (err: any) {
        return { ok: false, error: String(err?.message ?? err) }
      }
      const id = `gen-${jobId}`
      try {
        db.raw.prepare(`
          INSERT INTO media (id, type, path, filename, ext, size, mtimeMs, addedAt)
          VALUES (?, 'video', ?, ?, 'mp4', ?, ?, ?)
          ON CONFLICT(path) DO NOTHING
        `).run(id, dst, path.basename(dst), fs.statSync(dst).size, fs.statSync(dst).mtimeMs, Date.now())
        db.addTagToMedia(id, `ai-generated:${req.model}`)
      } catch { /* ignore — let the regular scanner pick it up */ }
      return { ok: true, mediaId: id }
    }
    if (typeof st.progress === 'number' && onProgress) onProgress(st.progress)
    await new Promise((r) => setTimeout(r, 1500))
  }
}
