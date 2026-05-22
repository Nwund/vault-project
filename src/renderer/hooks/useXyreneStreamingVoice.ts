// File: src/renderer/hooks/useXyreneStreamingVoice.ts
//
// WebAudio scheduler that consumes the xyrene:speakStream IPC chunks
// (s16 mono PCM at 24kHz) and plays them as they arrive — typically
// sub-second latency vs 1.5-3s for the buffered /tts path.
//
// Each call to speakStreaming() returns a handle the caller can use to
// interrupt the current utterance (e.g. when the user starts speaking
// or paused playback). Multiple concurrent streams are supported via
// unique streamIds.
//
// Audio is rendered into a per-hook AudioContext so the host component
// gets clean lifecycle (closes on unmount). The scheduler maintains a
// running playhead and queues each chunk at the next available slot,
// so a stream that produces chunks every 200ms plays as a continuous
// audio with no gaps.

import { useCallback, useEffect, useRef } from 'react'

interface StreamHandle {
  id: string
  /** True while the stream is producing chunks or has unplayed audio queued. */
  isActive: () => boolean
  /** Cancel playback + drop pending chunks. Safe to call multiple times. */
  cancel: () => void
}

interface StreamState {
  id: string
  // Sample rate is reported on :end but we know XTTS always emits 24000.
  sampleRate: number
  // Tracks when the next scheduled AudioBufferSourceNode should start.
  // Initialized lazily on first chunk so latency isn't paid until then.
  nextStartTime: number
  // True until either :end fires or the user calls cancel().
  done: boolean
  // Active sources so we can stop them on cancel.
  sources: Set<AudioBufferSourceNode>
  // Number of chunks still playing/queued; flips isActive() to false when 0.
  liveChunks: number
  // User-supplied callbacks
  onStart?: () => void
  onEnd?: () => void
  hasStarted: boolean
}

// Decode int16 PCM chunk into Float32 in [-1, 1].
function decodePcmChunk(b64: string): Float32Array {
  const bin = atob(b64)
  const len = bin.length
  const bytes = new Uint8Array(len)
  for (let i = 0; i < len; i++) bytes[i] = bin.charCodeAt(i)
  // s16le PCM — interpret as Int16Array
  const i16 = new Int16Array(bytes.buffer, bytes.byteOffset, len >> 1)
  const out = new Float32Array(i16.length)
  for (let i = 0; i < i16.length; i++) out[i] = i16[i] / 32768
  return out
}

export interface UseXyreneStreamingVoice {
  /** Start a streamed synth. Returns a handle the caller can cancel. */
  speakStreaming: (
    text: string,
    options?: {
      voice?: string
      language?: string
      /** Output gain 0-1; multiplied by master if provided. */
      volume?: number
      /** Playback speed multiplier; forwarded to XTTS server. */
      speed?: number
      /** Pitch shift in semitones; forwarded to XTTS server. */
      pitch?: number
      /** Expression hint forwarded to XTTS server. */
      expression?: string
      /** Called when the first chunk plays (i.e. she's audibly speaking). */
      onStart?: () => void
      /** Called when stream end has fired AND all queued chunks finished. */
      onEnd?: () => void
    }
  ) => StreamHandle
  /** Cancel every active stream. Useful when the user interrupts. */
  cancelAll: () => void
  /** True if any stream is currently producing or playing audio. */
  isAnyActive: () => boolean
}

let streamIdSeq = 0

export function useXyreneStreamingVoice(): UseXyreneStreamingVoice {
  const ctxRef = useRef<AudioContext | null>(null)
  const gainRef = useRef<GainNode | null>(null)
  const streamsRef = useRef<Map<string, StreamState>>(new Map())

  // Lazy-create the AudioContext so we don't trigger autoplay warnings
  // before the user has interacted.
  const getCtx = useCallback(() => {
    if (!ctxRef.current) {
      try {
        const Ctor = window.AudioContext || (window as any).webkitAudioContext
        const ctx: AudioContext = new Ctor({ sampleRate: 24000 })
        const gain = ctx.createGain()
        gain.gain.value = 1
        gain.connect(ctx.destination)
        ctxRef.current = ctx
        gainRef.current = gain
      } catch (err) {
        console.warn('[useXyreneStreamingVoice] AudioContext create failed:', err)
        return null
      }
    }
    return ctxRef.current
  }, [])

  // Subscribe to IPC events once. Dispatches each chunk to its stream's
  // scheduler. Cleanup on unmount tears down listeners + context.
  useEffect(() => {
    const offChunk = window.api.events.onXyreneSpeakChunk(({ streamId, b64 }: { streamId: string; b64: string }) => {
      const state = streamsRef.current.get(streamId)
      if (!state) return
      const ctx = getCtx()
      if (!ctx) return
      try {
        const float = decodePcmChunk(b64)
        if (float.length === 0) return
        const audioBuf = ctx.createBuffer(1, float.length, state.sampleRate)
        // copyToChannel accepts Float32Array; TS lib types are conservative
        // about ArrayBufferLike vs ArrayBuffer in newer typescript releases.
        audioBuf.copyToChannel(float as any, 0)
        const src = ctx.createBufferSource()
        src.buffer = audioBuf
        src.connect(gainRef.current ?? ctx.destination)
        // Schedule at the running playhead. First chunk starts ~now;
        // subsequent chunks chain off the previous end so playback is
        // gapless even if the IPC drip isn't perfectly even.
        const startAt = Math.max(ctx.currentTime, state.nextStartTime)
        if (!state.hasStarted) {
          state.hasStarted = true
          try { state.onStart?.() } catch { /* ignore */ }
        }
        src.start(startAt)
        state.nextStartTime = startAt + audioBuf.duration
        state.sources.add(src)
        state.liveChunks++
        src.onended = () => {
          state.sources.delete(src)
          state.liveChunks--
          // If the stream end has fired AND this was the last chunk,
          // fire the user's onEnd. Defensive against race where
          // :end fires before the last chunk finishes playing.
          if (state.done && state.liveChunks <= 0) {
            try { state.onEnd?.() } catch { /* ignore */ }
            streamsRef.current.delete(state.id)
          }
        }
      } catch (err) {
        console.warn('[useXyreneStreamingVoice] chunk play failed:', err)
      }
    })
    const offEnd = window.api.events.onXyreneSpeakEnd(({ streamId, sampleRate }: { streamId: string; sampleRate: number; ok: boolean }) => {
      const state = streamsRef.current.get(streamId)
      if (!state) return
      state.done = true
      if (sampleRate && sampleRate > 0) state.sampleRate = sampleRate
      if (state.liveChunks <= 0) {
        // No chunks were actually queued (or all already finished).
        // Fire onEnd immediately so callers can clean up.
        try { state.onEnd?.() } catch { /* ignore */ }
        streamsRef.current.delete(state.id)
      }
    })
    const offError = window.api.events.onXyreneSpeakError(({ streamId, message }: { streamId: string; message: string }) => {
      const state = streamsRef.current.get(streamId)
      if (!state) return
      console.warn('[useXyreneStreamingVoice] stream error:', message)
      // Stop sources + cleanup as if cancelled
      for (const src of state.sources) {
        try { src.stop() } catch { /* ignore */ }
      }
      state.sources.clear()
      state.done = true
      state.liveChunks = 0
      try { state.onEnd?.() } catch { /* ignore */ }
      streamsRef.current.delete(state.id)
    })
    return () => {
      try { offChunk?.() } catch { /* ignore */ }
      try { offEnd?.() } catch { /* ignore */ }
      try { offError?.() } catch { /* ignore */ }
      // Cancel any in-flight streams on unmount.
      for (const state of streamsRef.current.values()) {
        for (const src of state.sources) {
          try { src.stop() } catch { /* ignore */ }
        }
      }
      streamsRef.current.clear()
      if (ctxRef.current) {
        try { ctxRef.current.close() } catch { /* ignore */ }
        ctxRef.current = null
        gainRef.current = null
      }
    }
  }, [getCtx])

  const speakStreaming = useCallback<UseXyreneStreamingVoice['speakStreaming']>((text, options = {}) => {
    const id = `xs-${Date.now()}-${++streamIdSeq}`
    const ctx = getCtx()
    if (!ctx) {
      // Synth-not-available — return a stub handle that no-ops.
      return {
        id,
        isActive: () => false,
        cancel: () => { /* noop */ },
      }
    }
    // Resume if suspended (first-interaction case after Electron focus).
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => { /* ignore */ })
    }
    // Apply per-call volume by adjusting the shared gain. Simple but
    // works since we don't typically run overlapping streams at
    // different volumes.
    if (gainRef.current && typeof options.volume === 'number') {
      gainRef.current.gain.value = Math.max(0, Math.min(1, options.volume))
    }
    const state: StreamState = {
      id,
      sampleRate: 24000,
      nextStartTime: 0,
      done: false,
      sources: new Set(),
      liveChunks: 0,
      onStart: options.onStart,
      onEnd: options.onEnd,
      hasStarted: false,
    }
    streamsRef.current.set(id, state)
    // Fire the IPC. The handler will start sending chunk events as the
    // server produces them. speed/pitch/expression are forwarded only
    // when set so older XTTS servers don't choke on unknown fields.
    void window.api.ai.xyreneSpeakStream({
      text,
      streamId: id,
      voice: options.voice,
      language: options.language,
      ...(typeof options.speed === 'number' ? { speed: options.speed } : {}),
      ...(typeof options.pitch === 'number' ? { pitch: options.pitch } : {}),
      ...(options.expression ? { expression: options.expression } : {}),
    } as any).catch((err: any) => {
      console.warn('[useXyreneStreamingVoice] speakStream invoke failed:', err)
      // Schedule onEnd so callers don't hang waiting for it.
      state.done = true
      try { state.onEnd?.() } catch { /* ignore */ }
      streamsRef.current.delete(id)
    })
    return {
      id,
      isActive: () => {
        const s = streamsRef.current.get(id)
        return !!s && (!s.done || s.liveChunks > 0)
      },
      cancel: () => {
        const s = streamsRef.current.get(id)
        if (!s) return
        for (const src of s.sources) {
          try { src.stop() } catch { /* ignore */ }
        }
        s.sources.clear()
        s.liveChunks = 0
        s.done = true
        try { s.onEnd?.() } catch { /* ignore */ }
        streamsRef.current.delete(id)
      },
    }
  }, [getCtx])

  const cancelAll = useCallback(() => {
    for (const state of streamsRef.current.values()) {
      for (const src of state.sources) {
        try { src.stop() } catch { /* ignore */ }
      }
      state.sources.clear()
      state.liveChunks = 0
      state.done = true
      try { state.onEnd?.() } catch { /* ignore */ }
    }
    streamsRef.current.clear()
  }, [])

  const isAnyActive = useCallback(() => {
    for (const state of streamsRef.current.values()) {
      if (!state.done || state.liveChunks > 0) return true
    }
    return false
  }, [])

  return { speakStreaming, cancelAll, isAnyActive }
}
