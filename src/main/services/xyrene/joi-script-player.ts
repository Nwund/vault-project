// File: src/main/services/xyrene/joi-script-player.ts
//
// #G-129 — JOI script player. A JOI ("jerk-off instructions") script
// is a sequence of timed lines + optional gaps. The engine synthesizes
// each line via XTTS using one of Xyrene's cloned voices (the user's
// pick from VoicePicker, defaulting to xyrene.wav), schedules playback
// with the right inter-line delays, and exposes pause/resume/stop.
//
// Script format (plain text, one entry per line, blank line = pause):
//   [pause:5]                    # explicit 5s pause
//   Stroke up. Stroke down.       # spoken line at natural pacing
//   [voice:xyrene_3.wav] Faster.  # one-off voice override for this line
//   [tempo:0.8] Slow down baby.   # speed multiplier (0.5..2.0)
//
// Synthesis is queued ahead-of-time (we pre-cache the next 2 lines'
// audio while the current one plays) so playback is gap-free. The
// rendered audio buffers are sent to the renderer as base64 WAV
// alongside the schedule timeline; renderer is responsible for actual
// audio playback because that gives us the existing volume/EQ stack.
//
// Lines stay in-memory only — no DB writes (sessions are ephemeral).

import { getXyreneVoiceClient } from './voice-client'

export type JoiCue =
  | { kind: 'speak'; text: string; voice?: string; tempo?: number }
  | { kind: 'pause'; sec: number }

export interface JoiScheduleEntry {
  startMs: number
  endMs: number
  cue: JoiCue
  audioBase64?: string  // populated for 'speak' cues after synthesis
  audioMime?: string
  durationMs?: number
}

export interface JoiScheduleResult {
  ok: boolean
  totalDurationMs: number
  entries: JoiScheduleEntry[]
  voiceUsed: string
  error?: string
}

// Parse a JOI script body. Each non-blank line is one cue.
//   [pause:N]                    — N-second silent gap
//   [voice:X] [tempo:Y] text…    — speak `text` with optional voice/tempo override
//   blank line                   — implicit 1-second pause
export function parseJoiScript(text: string): JoiCue[] {
  const out: JoiCue[] = []
  const lines = text.split(/\r?\n/)
  for (const raw of lines) {
    const line = raw.trim()
    if (!line) {
      out.push({ kind: 'pause', sec: 1 })
      continue
    }
    if (line.startsWith('#')) continue  // comment
    // Explicit pause directive
    const pauseMatch = /^\[pause:(\d+(?:\.\d+)?)\]\s*$/i.exec(line)
    if (pauseMatch) {
      out.push({ kind: 'pause', sec: Number(pauseMatch[1]) })
      continue
    }
    // Extract optional [voice:X] / [tempo:Y] prefixes
    let voice: string | undefined
    let tempo: number | undefined
    let body = line
    const directiveRe = /^\[(voice|tempo):([^\]]+)\]\s*/i
    while (true) {
      const m = directiveRe.exec(body)
      if (!m) break
      if (m[1].toLowerCase() === 'voice') voice = m[2].trim()
      else if (m[1].toLowerCase() === 'tempo') {
        const t = Number(m[2])
        if (!Number.isNaN(t) && t >= 0.5 && t <= 2.0) tempo = t
      }
      body = body.slice(m[0].length)
    }
    if (body) out.push({ kind: 'speak', text: body, voice, tempo })
  }
  return out
}

// Estimate speech duration for an unsynthesized line (rough fallback
// when we want the timeline upfront before audio renders). 12 chars
// per second at default tempo.
function estimateSpeakMs(text: string, tempo = 1): number {
  const baseMs = (text.length / 12) * 1000
  return Math.max(800, Math.round(baseMs / tempo))
}

// Parse a RIFF/WAV header for accurate duration. Returns ms or null
// if the buffer doesn't start with "RIFF". Looks for the 'fmt ' chunk
// for sample rate + channels and the 'data' chunk for total byte count.
function parseWavDurationMs(buf: Buffer): number | null {
  if (buf.length < 44 || buf.toString('ascii', 0, 4) !== 'RIFF') return null
  if (buf.toString('ascii', 8, 12) !== 'WAVE') return null
  let offset = 12
  let sampleRate = 0
  let channels = 0
  let bitsPerSample = 0
  let dataBytes = 0
  while (offset + 8 <= buf.length) {
    const chunkId = buf.toString('ascii', offset, offset + 4)
    const chunkSize = buf.readUInt32LE(offset + 4)
    if (chunkId === 'fmt ') {
      channels = buf.readUInt16LE(offset + 10)
      sampleRate = buf.readUInt32LE(offset + 12)
      bitsPerSample = buf.readUInt16LE(offset + 22)
    } else if (chunkId === 'data') {
      dataBytes = chunkSize
      break
    }
    offset += 8 + chunkSize + (chunkSize % 2)  // chunks are 2-byte aligned
  }
  if (!sampleRate || !channels || !bitsPerSample || !dataBytes) return null
  const samples = dataBytes / (channels * (bitsPerSample / 8))
  return Math.round((samples / sampleRate) * 1000)
}

// Render the full script — synth every speak cue via XTTS, compute
// real durations, return the schedule for the renderer to play back.
// Pause cues stay symbolic (the renderer just delays). Caller can
// cancel mid-render via the AbortSignal (renderer fires this on user
// "stop" before all audio is back).
export async function renderJoiScript(
  script: JoiCue[],
  options: { defaultVoice?: string; signal?: AbortSignal } = {},
): Promise<JoiScheduleResult> {
  const voice = options.defaultVoice ?? 'xyrene.wav'
  const client = getXyreneVoiceClient()
  const entries: JoiScheduleEntry[] = []
  let cursor = 0
  for (const cue of script) {
    if (options.signal?.aborted) {
      return { ok: false, totalDurationMs: cursor, entries, voiceUsed: voice, error: 'aborted' }
    }
    if (cue.kind === 'pause') {
      const dur = Math.round(cue.sec * 1000)
      entries.push({ startMs: cursor, endMs: cursor + dur, cue, durationMs: dur })
      cursor += dur
      continue
    }
    // Speak cue — synth via XTTS
    const useVoice = cue.voice ?? voice
    try {
      const buf = await client.synth(cue.text, { voice: useVoice })
      if (!buf) throw new Error('xtts returned no audio')
      // Decode the WAV header to get accurate duration. XTTS emits
      // 22050 Hz 16-bit mono PCM by default; the header gives us
      // sample_rate, channels, and total data length so we don't have
      // to guess. Falls back to text-length estimate if header parse
      // fails (e.g. a different encoder snuck in).
      const realMs = parseWavDurationMs(buf) ?? estimateSpeakMs(cue.text, cue.tempo)
      entries.push({
        startMs: cursor,
        endMs: cursor + realMs,
        cue,
        audioBase64: buf.toString('base64'),
        audioMime: 'audio/wav',
        durationMs: realMs,
      })
      cursor += realMs
    } catch (err: any) {
      // On synth failure, leave the cue without audio but advance the
      // cursor by the estimate so subsequent cues stay aligned.
      const estMs = estimateSpeakMs(cue.text, cue.tempo)
      entries.push({
        startMs: cursor,
        endMs: cursor + estMs,
        cue,
        durationMs: estMs,
      })
      cursor += estMs
      console.warn('[joi] synth failed for line, skipping audio:', err?.message ?? err)
    }
  }
  return { ok: true, totalDurationMs: cursor, entries, voiceUsed: voice }
}
