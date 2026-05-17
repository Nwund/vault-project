// File: src/renderer/hooks/useXyreneStreamingTTS.ts
//
// Streaming TTS for Xyrene. Calls the main process's xyrene:speakStream
// IPC and decodes the PCM chunks (s16 mono @ 24kHz) via Web Audio as
// they arrive. First-audio latency drops from ~1.5-3s (full buffered
// /tts) to ~300-600ms (first chunk back).
//
// Usage:
//   const { speak, stop, isPlaying } = useXyreneStreamingTTS()
//   await speak("mmm hi baby")  // resolves when playback finishes
//
// Implementation notes:
//   - We accumulate small chunks before scheduling because Web Audio has
//     real overhead per AudioBuffer (and the server can fire chunks every
//     few hundred bytes). Targeting ~50ms minimum lets the audio thread
//     stay efficient without sacrificing perceived latency.
//   - PCM is little-endian s16 mono, which converts to Float32 in [-1,1]
//     by dividing by 32768.
//   - We schedule each chunk back-to-back with a small lookahead so a
//     slow chunk doesn't produce a glitch at the seam.

import { useCallback, useEffect, useRef, useState } from 'react'

const SAMPLE_RATE = 24000
// Minimum samples per scheduled buffer. 24000 * 0.05s = 1200 samples =
// 2400 bytes of s16. Smaller chunks get coalesced; larger pass through.
const MIN_SAMPLES_PER_SCHEDULE = 1200

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

function s16leToFloat32(bytes: Uint8Array): Float32Array {
  // bytes.length must be even; truncate the last byte if not.
  const sampleCount = bytes.length >> 1
  const out = new Float32Array(sampleCount)
  const view = new DataView(bytes.buffer, bytes.byteOffset, sampleCount * 2)
  for (let i = 0; i < sampleCount; i++) {
    out[i] = view.getInt16(i * 2, true) / 32768
  }
  return out
}

// #207 — Split a prompt into ordered TTS clauses. We dispatch each in
// parallel to the server (so the model starts generating clause N+1 the
// moment we hand the renderer clause N) but play them back in order.
// Clauses are pruned to drop pure-whitespace or pure-punctuation pieces.
function splitIntoClauses(text: string): string[] {
  const out: string[] = []
  // Capture each clause + the punctuation/whitespace that terminated it
  // so we keep "hi baby," not "hi baby" — the trailing comma cues the
  // model to use a slight rising intonation at the boundary.
  const re = /[^.,;:!?\n]+[.,;:!?\n]?/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    const piece = m[0].trim()
    if (piece && /[A-Za-z0-9]/.test(piece)) out.push(piece)
  }
  return out.length > 0 ? out : (text.trim() ? [text.trim()] : [])
}

export function useXyreneStreamingTTS() {
  const [isPlaying, setIsPlaying] = useState(false)
  const ctxRef = useRef<AudioContext | null>(null)
  const nextStartTimeRef = useRef(0)
  // Streams in flight keyed by streamId. Each holds the resolve/reject
  // for the speak() promise plus a leftover-bytes buffer (s16 chunks may
  // arrive misaligned at the byte level when the network splits the
  // response between samples).
  //
  // For chunked speak (#207) each entry also carries a clause group id
  // and clause index so we can hold back later-clause audio until the
  // earlier clause has finished scheduling all its chunks.
  const inFlightRef = useRef<Map<string, {
    resolve: () => void
    reject: (err: Error) => void
    leftoverByte: number | null
    pendingFloats: Float32Array[]
    pendingSampleCount: number
    lastSourceEndTime: number
    groupId?: string
    clauseIdx?: number
  }>>(new Map())
  // Per-group cursor: which clause is currently allowed to schedule
  // chunks onto the audio output. Out-of-order arrivals get held in
  // pendingFloats until their turn.
  const groupCursorRef = useRef<Map<string, number>>(new Map())

  // Ensure AudioContext exists (must be lazy because some browsers
  // require a user gesture for the first AudioContext).
  const getCtx = useCallback((): AudioContext => {
    let ctx = ctxRef.current
    if (!ctx || ctx.state === 'closed') {
      ctx = new AudioContext({ sampleRate: SAMPLE_RATE })
      ctxRef.current = ctx
    }
    if (ctx.state === 'suspended') void ctx.resume()
    return ctx
  }, [])

  // Flush any accumulated floats for this stream into a scheduled
  // AudioBufferSourceNode. force=true means schedule whatever's pending
  // even if it's below the threshold (called on stream end).
  //
  // For grouped streams (#207 chunked speak), only the clause whose
  // index matches the group cursor is eligible to schedule. Later-
  // clause chunks accumulate in pendingFloats until the cursor reaches
  // them.
  const flush = useCallback((streamId: string, force: boolean) => {
    const state = inFlightRef.current.get(streamId)
    if (!state) return
    if (!force && state.pendingSampleCount < MIN_SAMPLES_PER_SCHEDULE) return
    if (state.pendingSampleCount === 0) return
    if (state.groupId !== undefined && state.clauseIdx !== undefined) {
      const cursor = groupCursorRef.current.get(state.groupId) ?? 0
      if (state.clauseIdx !== cursor) return // hold back until our turn
    }

    const ctx = getCtx()
    const buffer = ctx.createBuffer(1, state.pendingSampleCount, SAMPLE_RATE)
    const channel = buffer.getChannelData(0)
    let offset = 0
    for (const f32 of state.pendingFloats) {
      channel.set(f32, offset)
      offset += f32.length
    }
    state.pendingFloats = []
    state.pendingSampleCount = 0

    const source = ctx.createBufferSource()
    source.buffer = buffer
    source.connect(ctx.destination)
    const now = ctx.currentTime
    // Start ASAP but no earlier than the end of the last scheduled
    // chunk — keeps consecutive buffers seamless. For grouped speak,
    // the previous clause's lastSourceEndTime gets carried forward
    // through nextStartTimeRef so clause boundaries are also seamless.
    const earliest = state.groupId !== undefined
      ? Math.max(nextStartTimeRef.current || 0, state.lastSourceEndTime || 0, now + 0.01)
      : Math.max(now + 0.01, state.lastSourceEndTime || (now + 0.01))
    source.start(earliest)
    state.lastSourceEndTime = earliest + buffer.duration
    nextStartTimeRef.current = state.lastSourceEndTime
  }, [getCtx])

  useEffect(() => {
    const offChunk = window.api.events.onXyreneSpeakChunk?.((data: { streamId: string; b64: string }) => {
      const state = inFlightRef.current.get(data.streamId)
      if (!state) return
      let bytes = b64ToBytes(data.b64)
      // Handle byte-misaligned chunks: prepend any leftover byte from
      // the previous chunk to keep s16 samples whole.
      if (state.leftoverByte !== null) {
        const merged = new Uint8Array(bytes.length + 1)
        merged[0] = state.leftoverByte
        merged.set(bytes, 1)
        bytes = merged
        state.leftoverByte = null
      }
      if (bytes.length % 2 === 1) {
        state.leftoverByte = bytes[bytes.length - 1]
        bytes = bytes.subarray(0, bytes.length - 1)
      }
      const f32 = s16leToFloat32(bytes)
      state.pendingFloats.push(f32)
      state.pendingSampleCount += f32.length
      flush(data.streamId, false)
    })

    const offEnd = window.api.events.onXyreneSpeakEnd?.((data: { streamId: string; sampleRate: number; ok: boolean }) => {
      const state = inFlightRef.current.get(data.streamId)
      if (!state) return
      flush(data.streamId, true)
      const ctx = getCtx()
      // Resolve after the last scheduled chunk has played so callers
      // can chain "say A then say B" without overlap. Use the audio
      // clock for accuracy.
      const remaining = Math.max(0, state.lastSourceEndTime - ctx.currentTime)
      setTimeout(() => {
        state.resolve()
        inFlightRef.current.delete(data.streamId)
        // If this stream was part of a chunked group, advance the cursor
        // and try to flush whichever clause now owns the slot.
        if (state.groupId !== undefined && state.clauseIdx !== undefined) {
          const groupId = state.groupId
          const nextIdx = state.clauseIdx + 1
          groupCursorRef.current.set(groupId, nextIdx)
          for (const [sid, st] of inFlightRef.current) {
            if (st.groupId === groupId && st.clauseIdx === nextIdx) {
              flush(sid, false)
            }
          }
          // If no in-flight stream has the next clauseIdx anymore, the
          // group is done — drop the cursor.
          const stillActive = Array.from(inFlightRef.current.values()).some(
            (st) => st.groupId === groupId,
          )
          if (!stillActive) groupCursorRef.current.delete(groupId)
        }
        if (inFlightRef.current.size === 0) setIsPlaying(false)
      }, remaining * 1000)
    })

    const offError = window.api.events.onXyreneSpeakError?.((data: { streamId: string; message: string }) => {
      const state = inFlightRef.current.get(data.streamId)
      if (!state) return
      state.reject(new Error(data.message))
      inFlightRef.current.delete(data.streamId)
      if (inFlightRef.current.size === 0) setIsPlaying(false)
    })

    return () => {
      try { offChunk?.() } catch {}
      try { offEnd?.() } catch {}
      try { offError?.() } catch {}
    }
  }, [flush, getCtx])

  const speak = useCallback(async (text: string, options?: { voice?: string; language?: string }) => {
    if (!text || !text.trim()) return
    const streamId = `xy-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    setIsPlaying(true)
    nextStartTimeRef.current = getCtx().currentTime + 0.05

    return new Promise<void>((resolve, reject) => {
      inFlightRef.current.set(streamId, {
        resolve,
        reject,
        leftoverByte: null,
        pendingFloats: [],
        pendingSampleCount: 0,
        lastSourceEndTime: 0,
      })
      window.api.xyreneSpeakStream({ text, streamId, voice: options?.voice, language: options?.language })
        .catch((err: Error) => {
          // The IPC promise rejects on transport errors; the per-stream
          // error event handles XTTS-side failures. If both fire we
          // tolerate the double-reject because we delete on first.
          const state = inFlightRef.current.get(streamId)
          if (state) {
            state.reject(err)
            inFlightRef.current.delete(streamId)
            if (inFlightRef.current.size === 0) setIsPlaying(false)
          }
        })
    })
  }, [getCtx])

  // #207 — Parallel-dispatch, in-order playback. Splits the prompt into
  // clauses and fires every TTS call immediately so the model starts
  // generating clause N+1 while clause N is still streaming. The flush
  // logic gates by clauseIdx so we never play out of order; the seam
  // between clauses uses the shared nextStartTimeRef so playback is
  // continuous.
  //
  // Returns a Promise that resolves after the last clause has played.
  const speakChunked = useCallback(async (text: string, options?: { voice?: string; language?: string }) => {
    const clauses = splitIntoClauses(text)
    if (clauses.length === 0) return
    if (clauses.length === 1) return speak(clauses[0], options)

    const groupId = `xy-grp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    groupCursorRef.current.set(groupId, 0)
    setIsPlaying(true)
    nextStartTimeRef.current = getCtx().currentTime + 0.05

    const clausePromises = clauses.map((clauseText, clauseIdx) => {
      const streamId = `${groupId}-${clauseIdx}`
      return new Promise<void>((resolve, reject) => {
        inFlightRef.current.set(streamId, {
          resolve,
          reject,
          leftoverByte: null,
          pendingFloats: [],
          pendingSampleCount: 0,
          lastSourceEndTime: 0,
          groupId,
          clauseIdx,
        })
        window.api.xyreneSpeakStream({
          text: clauseText,
          streamId,
          voice: options?.voice,
          language: options?.language,
        }).catch((err: Error) => {
          const state = inFlightRef.current.get(streamId)
          if (state) {
            state.reject(err)
            inFlightRef.current.delete(streamId)
          }
        })
      })
    })

    try {
      await Promise.all(clausePromises)
    } finally {
      groupCursorRef.current.delete(groupId)
      if (inFlightRef.current.size === 0) setIsPlaying(false)
    }
  }, [getCtx, speak])

  const stop = useCallback(() => {
    // Best-effort cancel: close the AudioContext (drops scheduled buffers),
    // then resolve every pending speak() so callers don't hang.
    try { ctxRef.current?.close() } catch {}
    ctxRef.current = null
    for (const [, state] of inFlightRef.current) {
      try { state.resolve() } catch {}
    }
    inFlightRef.current.clear()
    groupCursorRef.current.clear()
    setIsPlaying(false)
  }, [])

  return { speak, speakChunked, stop, isPlaying }
}
