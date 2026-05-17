// File: src/main/services/ml-sidecar-launcher.ts
//
// Generic Python ML-sidecar launcher. Models that need a Python
// runtime (PyTorch, diffusers, etc) instead of ONNX Runtime route
// through here so we don't write a separate launcher per model.
//
// Each sidecar = (id, startScript, port). The user installs the
// model + a thin Flask/FastAPI wrapper that exposes /health and
// per-sidecar endpoints; Vault spawns the script on demand.
//
// Currently used by:
//   #131  VideoLLaMA3 / Qwen2.5-VL-7B  (port 8040, settings.ai.videoLlama3StartScript)
//   #136  AnimateDiff-Lightning         (port 8041, settings.ai.animateDiffStartScript)
//   #162  RIFE optical-flow interp      (port 8042, settings.ai.rifeStartScript)
//   #180  MusicGen                      (port 8043, settings.ai.musicGenStartScript)
//
// Same lifecycle pattern as F5-TTS / RVC: spawn → poll /health →
// mark ready → expose IPC. Sidecars auto-exit when the main process
// exits because we don't pass `detached: true`.

import { spawn, ChildProcess } from 'node:child_process'
import fs from 'node:fs'
import http from 'node:http'

export type SidecarId = 'videoLlama3' | 'animateDiff' | 'rife' | 'musicGen'

interface SidecarConfig {
  id: SidecarId
  port: number
  startScriptKey: keyof any  // settings.ai.<key>
  description: string
  bootTimeoutMs: number
}

const REGISTRY: Record<SidecarId, SidecarConfig> = {
  videoLlama3: { id: 'videoLlama3', port: 8040, startScriptKey: 'videoLlama3StartScript', description: 'Local video QA (Qwen2.5-VL-7B / VideoLLaMA3)', bootTimeoutMs: 120_000 },
  animateDiff: { id: 'animateDiff', port: 8041, startScriptKey: 'animateDiffStartScript', description: 'AnimateDiff-Lightning animated thumbs',     bootTimeoutMs: 90_000 },
  rife:        { id: 'rife',        port: 8042, startScriptKey: 'rifeStartScript',        description: 'RIFE optical-flow slow-motion interp',     bootTimeoutMs: 60_000 },
  musicGen:    { id: 'musicGen',    port: 8043, startScriptKey: 'musicGenStartScript',    description: 'MusicGen backing-track generator',         bootTimeoutMs: 90_000 },
}

interface SidecarRuntime {
  proc: ChildProcess | null
  ready: boolean
}
const runtimes: Record<SidecarId, SidecarRuntime> = {
  videoLlama3: { proc: null, ready: false },
  animateDiff: { proc: null, ready: false },
  rife: { proc: null, ready: false },
  musicGen: { proc: null, ready: false },
}

export interface SidecarStatus {
  id: SidecarId
  installed: boolean         // start script exists
  running: boolean
  port: number
  startScript: string | null
  description: string
}

export async function getSidecarStatus(id: SidecarId): Promise<SidecarStatus> {
  const cfg = REGISTRY[id]
  const { getSettings } = await import('../settings')
  const aiSettings = (getSettings() as any).ai ?? {}
  const startScript = String(aiSettings[cfg.startScriptKey] ?? '').trim() || null
  const installed = !!(startScript && fs.existsSync(startScript))
  const rt = runtimes[id]
  return {
    id,
    installed,
    running: !!(rt.proc && !rt.proc.killed && rt.ready),
    port: cfg.port,
    startScript,
    description: cfg.description,
  }
}

export async function ensureSidecar(id: SidecarId): Promise<boolean> {
  const rt = runtimes[id]
  if (rt.proc && !rt.proc.killed && rt.ready) return true
  const status = await getSidecarStatus(id)
  if (!status.installed || !status.startScript) {
    console.log(`[ML Sidecar:${id}] no start script configured — skipping launch`)
    return false
  }
  console.log(`[ML Sidecar:${id}] spawning from ${status.startScript}`)
  rt.proc = spawn(status.startScript, [], { detached: false, windowsHide: true, shell: true })
  rt.proc.stdout?.on('data', (d) => console.log(`[ML Sidecar:${id}] ${d.toString().trim()}`))
  rt.proc.stderr?.on('data', (d) => console.warn(`[ML Sidecar:${id}] ${d.toString().trim()}`))
  rt.proc.on('exit', (code) => {
    console.log(`[ML Sidecar:${id}] exited with code ${code}`)
    rt.proc = null
    rt.ready = false
  })
  const cfg = REGISTRY[id]
  const deadline = Date.now() + cfg.bootTimeoutMs
  while (Date.now() < deadline) {
    if (await ping(cfg.port)) { rt.ready = true; console.log(`[ML Sidecar:${id}] ready`); return true }
    await new Promise((r) => setTimeout(r, 1500))
  }
  console.warn(`[ML Sidecar:${id}] failed to come ready within ${cfg.bootTimeoutMs}ms`)
  return false
}

function ping(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.request({ hostname: '127.0.0.1', port, path: '/health', method: 'GET', timeout: 1500 }, (res) => {
      resolve(res.statusCode === 200)
      res.resume()
    })
    req.on('error', () => resolve(false))
    req.on('timeout', () => { try { req.destroy() } catch {} ; resolve(false) })
    req.end()
  })
}

/** Forward an arbitrary POST to a sidecar's REST endpoint. */
export async function postJson<T = unknown>(
  id: SidecarId,
  pathName: string,
  body: unknown,
  timeoutMs = 60_000,
): Promise<{ ok: boolean; data?: T; error?: string }> {
  const status = await getSidecarStatus(id)
  if (!status.running) {
    const ok = await ensureSidecar(id)
    if (!ok) return { ok: false, error: 'Sidecar not running and could not be started' }
  }
  const cfg = REGISTRY[id]
  return new Promise((resolve) => {
    const payload = JSON.stringify(body)
    const req = http.request({
      hostname: '127.0.0.1', port: cfg.port, path: pathName, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
      timeout: timeoutMs,
    }, (res) => {
      let buf = ''
      res.on('data', (c) => buf += c)
      res.on('end', () => {
        try {
          const parsed = JSON.parse(buf)
          if (res.statusCode === 200) resolve({ ok: true, data: parsed })
          else resolve({ ok: false, error: parsed?.error ?? `HTTP ${res.statusCode}` })
        } catch { resolve({ ok: false, error: 'Bad JSON from sidecar' }) }
      })
    })
    req.on('error', (err) => resolve({ ok: false, error: err.message }))
    req.on('timeout', () => { try { req.destroy() } catch {} ; resolve({ ok: false, error: 'timeout' }) })
    req.write(payload)
    req.end()
  })
}

export function shutdownAll(): void {
  for (const id of Object.keys(runtimes) as SidecarId[]) {
    const rt = runtimes[id]
    if (rt.proc && !rt.proc.killed) {
      try { rt.proc.kill() } catch { /* noop */ }
    }
    rt.proc = null
    rt.ready = false
  }
}
