// File: src/renderer/hooks/useVadVoice.ts
//
// #177 — Silero-VAD-gated always-listening for hands-free voice
// commands. Replaces the existing push-to-talk webkitSpeechRecognition
// pattern. The mic stays open all the time; Silero VAD (running as a
// WASM model in-renderer) detects when the user starts/stops speaking
// and emits the captured audio segment. Caller pipes the segment to
// transcription (whisper.cpp / WhisperX) + command parser.
//
// Uses @ricky0123/vad-web which loads Silero-VAD + ONNX runtime web
// + WebRTC VAD fallback. Lazy-imports on connect() to avoid pulling
// ~3 MB into the initial bundle.

import { useCallback, useEffect, useRef, useState } from 'react'

export interface VadState {
  state: 'idle' | 'loading' | 'listening' | 'error'
  isSpeaking: boolean
  error: string | null
  start: () => Promise<void>
  stop: () => Promise<void>
}

export interface UseVadOptions {
  /** Called when VAD detects a complete speech segment (Float32Array of mono 16k PCM). */
  onSpeechEnd: (audio: Float32Array) => void
  /** Optional: fires when speech is detected (no audio yet). */
  onSpeechStart?: () => void
  /** Optional: fires when speech is interrupted before completion. */
  onVadMisfire?: () => void
}

export function useVadVoice(opts: UseVadOptions): VadState {
  const [state, setState] = useState<VadState['state']>('idle')
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const vadRef = useRef<any>(null)
  const optsRef = useRef(opts)
  useEffect(() => { optsRef.current = opts }, [opts])

  const start = useCallback(async () => {
    if (vadRef.current) return
    setError(null)
    setState('loading')
    try {
      // Lazy-import so the VAD bundle isn't pulled into the initial
      // chunk for users who don't use voice commands.
      const { MicVAD } = await import('@ricky0123/vad-web') as any
      const vad = await MicVAD.new({
        onSpeechStart: () => {
          setIsSpeaking(true)
          optsRef.current.onSpeechStart?.()
        },
        onSpeechEnd: (audio: Float32Array) => {
          setIsSpeaking(false)
          optsRef.current.onSpeechEnd(audio)
        },
        onVADMisfire: () => {
          setIsSpeaking(false)
          optsRef.current.onVadMisfire?.()
        },
        positiveSpeechThreshold: 0.5,
        negativeSpeechThreshold: 0.35,
        // 500ms pre-roll buffer so the start of speech isn't clipped
        preSpeechPadFrames: 16,
        minSpeechFrames: 3,
      })
      await vad.start()
      vadRef.current = vad
      setState('listening')
    } catch (err: any) {
      setError(err?.message ?? 'VAD failed to start')
      setState('error')
    }
  }, [])

  const stop = useCallback(async () => {
    if (!vadRef.current) return
    try { await vadRef.current.pause() } catch { /* noop */ }
    try { await vadRef.current.destroy() } catch { /* noop */ }
    vadRef.current = null
    setState('idle')
    setIsSpeaking(false)
  }, [])

  // Auto-cleanup on unmount
  useEffect(() => () => { void stop() }, [stop])

  return { state, isSpeaking, error, start, stop }
}
