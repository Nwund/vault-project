// ===============================
// File: src/main/services/xyrene/voice-client.ts
//
// HTTP client for the XTTS server at http://localhost:8020 that ships
// with the user's xyrene-portable project. Uses raw http (no fetch
// polyfill quirks) so it works in Electron's main process unchanged.
//
// XTTS server endpoints (verified at server.py:129-273):
//   GET  /health        → { status, model, device, voices, cached_voices }
//   GET  /voices        → { voices, cached }
//   POST /cache_voice   { voice }
//   POST /tts           { text, speaker_wav?, language? }   → audio/wav body
//   POST /tts_stream    { text, speaker_wav?, language? }   → s16 mono PCM, OUTPUT_SR=24000
// ===============================

import http from 'node:http'

const XTTS_HOST = '127.0.0.1'
const XTTS_PORT = 8020
const DEFAULT_VOICE = 'xyrene.wav'
const DEFAULT_LANG = 'en'

export interface XttsHealth {
  status: string
  model: string
  device: string
  voices: string[]
  cached_voices: string[]
}

function postJson<T>(path: string, body: any, opts?: { responseType?: 'json' | 'buffer'; timeoutMs?: number }): Promise<T> {
  const responseType = opts?.responseType ?? 'json'
  const timeoutMs = opts?.timeoutMs ?? 60000
  return new Promise((resolve, reject) => {
    const payload = Buffer.from(JSON.stringify(body), 'utf8')
    const req = http.request(
      {
        hostname: XTTS_HOST,
        port: XTTS_PORT,
        path,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': payload.length
        },
        timeout: timeoutMs
      },
      (res) => {
        const chunks: Buffer[] = []
        res.on('data', (c: Buffer) => chunks.push(c))
        res.on('end', () => {
          const data = Buffer.concat(chunks)
          if (res.statusCode !== 200) {
            reject(new Error(`XTTS ${path} returned ${res.statusCode}: ${data.toString('utf8').slice(0, 200)}`))
            return
          }
          if (responseType === 'json') {
            try {
              resolve(JSON.parse(data.toString('utf8')) as T)
            } catch (err) {
              reject(new Error(`XTTS ${path} returned non-JSON: ${data.toString('utf8').slice(0, 100)}`))
            }
          } else {
            resolve(data as unknown as T)
          }
        })
      }
    )
    req.on('error', reject)
    req.on('timeout', () => req.destroy(new Error(`XTTS ${path} timed out after ${timeoutMs}ms`)))
    req.write(payload)
    req.end()
  })
}

function getJson<T>(path: string, timeoutMs = 5000): Promise<T> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { hostname: XTTS_HOST, port: XTTS_PORT, path, method: 'GET', timeout: timeoutMs },
      (res) => {
        const chunks: Buffer[] = []
        res.on('data', (c: Buffer) => chunks.push(c))
        res.on('end', () => {
          const data = Buffer.concat(chunks).toString('utf8')
          if (res.statusCode !== 200) {
            reject(new Error(`XTTS ${path} returned ${res.statusCode}: ${data.slice(0, 200)}`))
            return
          }
          try { resolve(JSON.parse(data) as T) }
          catch (err) { reject(err) }
        })
      }
    )
    req.on('error', reject)
    req.on('timeout', () => req.destroy(new Error(`XTTS ${path} timed out`)))
    req.end()
  })
}

export class XyreneVoiceClient {
  /**
   * Fast probe — does the server respond? Used by the UI to show a connected/disconnected dot.
   * Returns null if unreachable rather than throwing, so callers don't have to wrap.
   */
  async health(): Promise<XttsHealth | null> {
    try {
      return await getJson<XttsHealth>('/health', 2000)
    } catch {
      return null
    }
  }

  async listVoices(): Promise<string[]> {
    try {
      const res = await getJson<{ voices: string[] }>('/voices', 3000)
      return res.voices ?? []
    } catch {
      return []
    }
  }

  /**
   * Synthesize speech as a complete WAV. Returns the raw bytes; the caller
   * decides whether to pipe them to the renderer (base64 over IPC) or save
   * to disk.
   *
   * Default voice = `xyrene.wav` (the user's cloned voice).
   */
  async synth(
    text: string,
    options?: {
      voice?: string
      language?: string
      timeoutMs?: number
      /** Playback speed multiplier; 1.0 = normal, 0.85 = breathy/slow,
       *  1.15 = urgent. The XTTS server applies this server-side when
       *  the `speed` field is present in the payload; older servers
       *  silently ignore it. */
      speed?: number
      /** Pitch shift in semitones; 0 = no change, -2 = lower/sultry,
       *  +2 = higher/playful. Same server-side opt-in handling. */
      pitch?: number
      /** Free-form emotion/expression hint forwarded to compatible
       *  XTTS builds ("breathy", "moaned", "commanded"). Server-side
       *  may either prepend an SSML cue or pass to a stylized voice
       *  variant. Ignored otherwise. */
      expression?: string
    }
  ): Promise<Buffer | null> {
    if (!text || !text.trim()) return null
    try {
      const payload: Record<string, any> = {
        text,
        speaker_wav: options?.voice ?? DEFAULT_VOICE,
        language: options?.language ?? DEFAULT_LANG,
      }
      // Only include the optional parameters when explicitly provided
      // so older XTTS servers don't choke on unknown fields.
      if (typeof options?.speed === 'number') payload.speed = options.speed
      if (typeof options?.pitch === 'number') payload.pitch = options.pitch
      if (typeof options?.expression === 'string' && options.expression.trim()) {
        payload.expression = options.expression.trim()
      }
      return await postJson<Buffer>(
        '/tts',
        payload,
        { responseType: 'buffer', timeoutMs: options?.timeoutMs ?? 90000 }
      )
    } catch (err) {
      console.warn('[XyreneVoice] synth failed:', err)
      return null
    }
  }

  /**
   * Pre-warm a voice embedding so the first /tts call doesn't pay the
   * 1-2s embedding cost. Worth calling once on app startup.
   */
  async cacheVoice(voice = DEFAULT_VOICE): Promise<boolean> {
    try {
      await postJson<{ status: string }>('/cache_voice', { voice }, { timeoutMs: 30000 })
      return true
    } catch {
      return false
    }
  }

  /**
   * Streaming synthesis — hits /tts_stream which returns s16 mono PCM at
   * 24kHz. We don't buffer the full response; instead we surface chunks
   * via onChunk() as they arrive so the caller can start playback before
   * the server is done. Returns when the stream ends or rejects on error.
   *
   * The sample rate is constant at the XTTS server's OUTPUT_SR=24000.
   * Caller is responsible for assembling the PCM into something the
   * renderer can play (Web Audio AudioBuffer at 24000Hz, mono).
   */
  async streamSynth(
    text: string,
    options: {
      voice?: string
      language?: string
      timeoutMs?: number
      /** Optional TTS tuning — same fields as synth(). Forwarded to
       *  /tts_stream; older servers ignore unknown fields. */
      speed?: number
      pitch?: number
      expression?: string
      onChunk: (pcmChunk: Buffer) => void
    }
  ): Promise<{ sampleRate: number; bytesStreamed: number } | null> {
    if (!text || !text.trim()) return null
    const timeoutMs = options.timeoutMs ?? 90000
    const payload: Record<string, any> = {
      text,
      speaker_wav: options.voice ?? DEFAULT_VOICE,
      language: options.language ?? DEFAULT_LANG,
    }
    if (typeof options.speed === 'number') payload.speed = options.speed
    if (typeof options.pitch === 'number') payload.pitch = options.pitch
    if (typeof options.expression === 'string' && options.expression.trim()) {
      payload.expression = options.expression.trim()
    }
    const body = Buffer.from(JSON.stringify(payload), 'utf8')

    return new Promise((resolve, reject) => {
      let bytesStreamed = 0
      const req = http.request(
        {
          hostname: XTTS_HOST,
          port: XTTS_PORT,
          path: '/tts_stream',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': body.length,
          },
          timeout: timeoutMs,
        },
        (res) => {
          if (res.statusCode !== 200) {
            const chunks: Buffer[] = []
            res.on('data', (c: Buffer) => chunks.push(c))
            res.on('end', () => {
              reject(new Error(`XTTS /tts_stream returned ${res.statusCode}: ${Buffer.concat(chunks).toString('utf8').slice(0, 200)}`))
            })
            return
          }
          res.on('data', (chunk: Buffer) => {
            bytesStreamed += chunk.length
            try {
              options.onChunk(chunk)
            } catch (err) {
              console.warn('[XyreneVoice] onChunk handler threw:', err)
            }
          })
          res.on('end', () => resolve({ sampleRate: 24000, bytesStreamed }))
          res.on('error', reject)
        }
      )
      req.on('error', reject)
      req.on('timeout', () => req.destroy(new Error(`XTTS /tts_stream timed out after ${timeoutMs}ms`)))
      req.write(body)
      req.end()
    })
  }
}

let singleton: XyreneVoiceClient | null = null
export function getXyreneVoiceClient(): XyreneVoiceClient {
  if (!singleton) singleton = new XyreneVoiceClient()
  return singleton
}
