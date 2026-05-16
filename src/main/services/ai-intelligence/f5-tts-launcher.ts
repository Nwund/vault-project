// File: src/main/services/ai-intelligence/f5-tts-launcher.ts
//
// F5-TTS voice cloning sidecar (#27). Drop-in alternative to XTTS v2
// for the Xyrene voice path. Better subjective quality (Flow-Matching
// DiT, ~3 GB VRAM, RTF ~5x). Single biggest voice-cloning quality
// upgrade available in 2026.
//
// ARCHITECTURE: Python sidecar on 127.0.0.1:8021 (one port above
// XTTS). Same calling pattern as XTTS (POST /tts with text + voice).
// Vault's xyrene-voice-client.ts can be pointed at either backend
// via settings.ai.xyreneVoiceBackend = 'xtts' | 'f5tts'.
//
// ACTIVATION:
//   1. Clone github.com/SWivid/F5-TTS into C:\dev\f5-tts-sidecar\
//   2. Create venv, install per repo README (torch + the F5-TTS
//      package + whatever they ship as inference helpers).
//   3. Drop server.py wrapping their inference API as Flask/FastAPI
//      on port 8021. Mirror the XTTS endpoints (/health, /voices,
//      /tts, /tts_stream) so xyrene-voice-client doesn't need to
//      know which backend it's talking to.
//   4. Drop start.bat → activate venv + python server.py.
//   5. Set settings.ai.f5ttsStartScript = 'C:\\dev\\f5-tts-sidecar\\start.bat'
//   6. Set settings.ai.xyreneVoiceBackend = 'f5tts' to switch.
//
// FALLBACK: when F5-TTS sidecar isn't running, xyrene-voice-client
// falls back to XTTS automatically (existing behavior preserved).

import { spawn, ChildProcess } from 'node:child_process'
import fs from 'node:fs'
import http from 'node:http'

let _proc: ChildProcess | null = null
let _ready = false

export async function ensureF5TtsSidecar(): Promise<boolean> {
  if (_proc && !_proc.killed && _ready) return true
  const { getSettings } = await import('../../settings')
  const startScript = String((getSettings().ai as any)?.f5ttsStartScript ?? '').trim()
  if (!startScript || !fs.existsSync(startScript)) return false
  console.log(`[F5-TTS] Spawning sidecar from ${startScript}`)
  _proc = spawn(startScript, [], { detached: false, windowsHide: true, shell: true })
  _proc.stdout?.on('data', (d) => console.log(`[F5-TTS] ${d.toString().trim()}`))
  _proc.stderr?.on('data', (d) => console.warn(`[F5-TTS] ${d.toString().trim()}`))
  _proc.on('exit', (code) => {
    console.log(`[F5-TTS] Sidecar exited with code ${code}`)
    _proc = null
    _ready = false
  })
  const deadline = Date.now() + 90_000  // F5-TTS load is heavier than XTTS — give it longer
  while (Date.now() < deadline) {
    if (await ping()) { _ready = true; console.log('[F5-TTS] Sidecar ready'); return true }
    await new Promise((r) => setTimeout(r, 1500))
  }
  console.warn('[F5-TTS] Sidecar failed to come ready within 90s')
  return false
}

function ping(): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.request({ hostname: '127.0.0.1', port: 8021, path: '/health', method: 'GET', timeout: 1500 }, (res) => {
      resolve((res.statusCode ?? 500) < 400)
    })
    req.on('error', () => resolve(false))
    req.on('timeout', () => { try { req.destroy() } catch {} ; resolve(false) })
    req.end()
  })
}

/** Returns base URL when sidecar is up, null otherwise. xyrene-voice-client
 *  uses this for backend switching. */
export function getF5TtsBaseUrl(): string | null {
  return _ready ? 'http://127.0.0.1:8021' : null
}

/** Side-effect-free probe — true only when the sidecar has reported
 *  healthy at least once this process lifetime. Does NOT spawn. */
export function isF5TtsReady(): boolean {
  return _ready
}
