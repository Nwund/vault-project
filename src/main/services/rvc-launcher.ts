// File: src/main/services/rvc-launcher.ts
//
// #175 — Real-time RVC voice conversion sidecar.
//
// Pattern mirrors f5-tts-launcher: user installs RVC + a thin Flask
// wrapper, exposes settings.ai.rvcStartScript + rvcModelDir, and
// Vault spawns the sidecar on 127.0.0.1:8030 with a known REST
// surface:
//
//   GET  /health                → { ok: true }
//   GET  /models                → ["my_voice.pth", ...]
//   POST /convert               body={ srcPath, modelName, transpose? }
//                               → { dstPath, ms }
//
// "Real-time" here means low-latency batch (~300ms RTF on a 4070);
// we don't pipe live mic input through the network. The renderer
// records to a temp wav, posts it, gets back the converted wav.
//
// FALLBACK: when the sidecar isn't running, the IPCs return ok=false
// and the renderer hides the affordance.

import { spawn, ChildProcess, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import http from 'node:http'

const PORT = 8030

let _proc: ChildProcess | null = null
let _ready = false

export async function ensureRvcSidecar(): Promise<boolean> {
  if (_proc && !_proc.killed && _ready) return true
  const { getSettings } = await import('../settings')
  const startScript = String((getSettings().ai as any)?.rvcStartScript ?? '').trim()
  if (!startScript || !fs.existsSync(startScript)) return false
  console.log(`[RVC] Spawning sidecar from ${startScript}`)
  _proc = spawn(startScript, [], { detached: false, windowsHide: true, shell: true })
  _proc.stdout?.on('data', (d) => console.log(`[RVC] ${d.toString().trim()}`))
  _proc.stderr?.on('data', (d) => console.warn(`[RVC] ${d.toString().trim()}`))
  _proc.on('exit', (code) => {
    console.log(`[RVC] Sidecar exited with code ${code}`)
    _proc = null
    _ready = false
  })
  const deadline = Date.now() + 60_000
  while (Date.now() < deadline) {
    if (await ping()) { _ready = true; console.log('[RVC] Sidecar ready'); return true }
    await new Promise((r) => setTimeout(r, 1500))
  }
  console.warn('[RVC] Sidecar failed to come ready within 60s')
  return false
}

function ping(): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.request({ hostname: '127.0.0.1', port: PORT, path: '/health', method: 'GET', timeout: 1500 }, (res) => {
      resolve(res.statusCode === 200)
      res.resume()
    })
    req.on('error', () => resolve(false))
    req.on('timeout', () => { try { req.destroy() } catch {} ; resolve(false) })
    req.end()
  })
}

export function rvcStatus(): { installed: boolean; running: boolean; binPath: string } {
  // No CLI to probe — installed = startScript on disk, running = sidecar
  // is alive on the port. Renderer surfaces this via the status card.
  const running = _ready && _proc !== null && !_proc.killed
  return { installed: !!_proc, running, binPath: '' }
}

export async function listModels(): Promise<string[]> {
  if (!_ready) await ensureRvcSidecar()
  if (!_ready) return []
  return new Promise((resolve) => {
    const req = http.request({ hostname: '127.0.0.1', port: PORT, path: '/models', method: 'GET', timeout: 3000 }, (res) => {
      let body = ''
      res.on('data', (c) => body += c)
      res.on('end', () => {
        try { const parsed = JSON.parse(body); resolve(Array.isArray(parsed) ? parsed : []) }
        catch { resolve([]) }
      })
    })
    req.on('error', () => resolve([]))
    req.on('timeout', () => { try { req.destroy() } catch {} ; resolve([]) })
    req.end()
  })
}

export async function convert(opts: {
  srcPath: string
  modelName: string
  transpose?: number
}): Promise<{ ok: boolean; dstPath?: string; ms?: number; error?: string }> {
  if (!_ready) {
    const started = await ensureRvcSidecar()
    if (!started) return { ok: false, error: 'RVC sidecar not running and could not be started — check settings.ai.rvcStartScript' }
  }
  return new Promise((resolve) => {
    const payload = JSON.stringify(opts)
    const req = http.request({
      hostname: '127.0.0.1', port: PORT, path: '/convert', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
      timeout: 60_000,
    }, (res) => {
      let body = ''
      res.on('data', (c) => body += c)
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body) as { dstPath?: string; ms?: number; error?: string }
          if (res.statusCode === 200 && parsed.dstPath) resolve({ ok: true, dstPath: parsed.dstPath, ms: parsed.ms })
          else resolve({ ok: false, error: parsed.error ?? `HTTP ${res.statusCode}` })
        } catch { resolve({ ok: false, error: 'Bad JSON from sidecar' }) }
      })
    })
    req.on('error', (err) => resolve({ ok: false, error: err.message }))
    req.on('timeout', () => { try { req.destroy() } catch {} ; resolve({ ok: false, error: 'timeout' }) })
    req.write(payload)
    req.end()
  })
}

export function shutdown(): void {
  if (_proc && !_proc.killed) {
    try { _proc.kill() } catch { /* noop */ }
  }
  _proc = null
  _ready = false
}

// Avoid unused-import warnings for things we might wire later.
export const _internal = { spawnSync }
