// File: src/main/services/ai-intelligence/whisperx-launcher.ts
//
// WhisperX upgrade (#26) — replaces / supplements whisper.cpp with
// faster-whisper + wav2vec2 forced alignment + pyannote diarization.
// Adds:
//   - Word-level timestamps (currently we get utterance-level only).
//     Unlocks SFX-on-word triggers in the Xyrene engine ("fire spank
//     SFX exactly on the word 'fuck'").
//   - Speaker diarization — separates male / female voices in a
//     scene, even when overlapping.
//   - Better non-English accuracy (wav2vec2 alignment fixes the
//     drift that whisper.cpp shows on accented English).
//
// ARCHITECTURE: Python sidecar — same pattern as JoyCaption. Vault
// spawns a long-lived Python HTTP server on 127.0.0.1:8031; renderer
// posts audio paths and gets back JSON with word-level segments.
//
// ACTIVATION:
//   1. Create a Python 3.10+ venv at C:\dev\whisperx-sidecar\venv\
//   2. Activate, then: pip install whisperx
//   3. Drop a server.py at C:\dev\whisperx-sidecar\server.py wrapping
//      the WhisperX API as a Flask/FastAPI HTTP endpoint.
//   4. Drop start.bat with `venv\Scripts\activate && python server.py`.
//   5. Set settings.ai.whisperxStartScript = 'C:\\dev\\whisperx-sidecar\\start.bat'
//   6. The launcher below auto-spawns + supervises the sidecar.
//
// FALLBACK: when the sidecar isn't configured or fails to start,
// callers should keep using whisper.cpp via whisper-transcriber.ts.

import { spawn, ChildProcess } from 'node:child_process'
import fs from 'node:fs'
import http from 'node:http'

let _proc: ChildProcess | null = null
let _ready = false

export interface WhisperXSegment {
  start: number   // seconds
  end: number     // seconds
  text: string
  words?: Array<{ start: number; end: number; word: string; speaker?: string }>
}

/** Spawn the WhisperX Python sidecar if it's configured and not already running. */
export async function ensureWhisperXSidecar(): Promise<boolean> {
  if (_proc && !_proc.killed && _ready) return true
  const { getSettings } = await import('../../settings')
  const startScript = String((getSettings().ai as any)?.whisperxStartScript ?? '').trim()
  if (!startScript || !fs.existsSync(startScript)) {
    return false
  }
  console.log(`[WhisperX] Spawning sidecar from ${startScript}`)
  _proc = spawn(startScript, [], { detached: false, windowsHide: true, shell: true })
  _proc.stdout?.on('data', (d) => console.log(`[WhisperX] ${d.toString().trim()}`))
  _proc.stderr?.on('data', (d) => console.warn(`[WhisperX] ${d.toString().trim()}`))
  _proc.on('exit', (code) => {
    console.log(`[WhisperX] Sidecar exited with code ${code}`)
    _proc = null
    _ready = false
  })
  // Poll the health endpoint for up to 60s.
  const deadline = Date.now() + 60_000
  while (Date.now() < deadline) {
    if (await ping()) { _ready = true; console.log('[WhisperX] Sidecar ready'); return true }
    await new Promise((r) => setTimeout(r, 1000))
  }
  console.warn('[WhisperX] Sidecar failed to come ready within 60s')
  return false
}

/** Side-effect-free probe — returns true only if the sidecar has already
 *  reported healthy at least once this process lifetime. Callers that
 *  want auto-spawn should use ensureWhisperXSidecar instead. */
export function isWhisperXReady(): boolean {
  return _ready
}

function ping(): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.request({ hostname: '127.0.0.1', port: 8031, path: '/health', method: 'GET', timeout: 1000 }, (res) => {
      resolve((res.statusCode ?? 500) < 400)
    })
    req.on('error', () => resolve(false))
    req.on('timeout', () => { try { req.destroy() } catch {} ; resolve(false) })
    req.end()
  })
}

/**
 * Transcribe an audio file with word-level timestamps and speaker IDs.
 * Returns null if the sidecar isn't running.
 */
export async function whisperxTranscribe(audioPath: string): Promise<WhisperXSegment[] | null> {
  if (!_ready && !(await ensureWhisperXSidecar())) return null
  return new Promise((resolve) => {
    const payload = Buffer.from(JSON.stringify({ path: audioPath }), 'utf8')
    const req = http.request({
      hostname: '127.0.0.1', port: 8031, path: '/transcribe', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': payload.length },
      timeout: 600_000,
    }, (res) => {
      let body = ''
      res.on('data', (c) => body += c)
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body)
          resolve(Array.isArray(parsed.segments) ? parsed.segments : null)
        } catch { resolve(null) }
      })
    })
    req.on('error', () => resolve(null))
    req.on('timeout', () => { try { req.destroy() } catch {} ; resolve(null) })
    req.write(payload)
    req.end()
  })
}
