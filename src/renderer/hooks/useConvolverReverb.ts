// File: src/renderer/hooks/useConvolverReverb.ts
//
// #174 — Web Audio ConvolverNode wrapper for adding reverb to any
// AudioBufferSourceNode / MediaElementAudioSourceNode. The IRs are
// synthesized in code (exponential-decay noise) so there's no IR file
// to ship + no licensing concerns. Quality is fine for VO immersion;
// users who want real recorded IRs can swap in their own .wav via
// a follow-on setting.

import { useCallback, useEffect, useRef } from 'react'

export type ReverbPreset = 'dry' | 'small_room' | 'medium_hall' | 'large_cathedral' | 'telephone'

interface PresetSpec {
  durationSec: number
  decay: number       // exponent: higher = sharper decay
  preDelayMs: number  // time before reverb starts
  highFreqRolloff: number  // 0-1, 1 = no rolloff
}

const PRESETS: Record<ReverbPreset, PresetSpec> = {
  dry:              { durationSec: 0,    decay: 1,   preDelayMs: 0,  highFreqRolloff: 1.0 },
  small_room:       { durationSec: 0.4,  decay: 4,   preDelayMs: 5,  highFreqRolloff: 0.9 },
  medium_hall:      { durationSec: 1.8,  decay: 2.5, preDelayMs: 20, highFreqRolloff: 0.75 },
  large_cathedral:  { durationSec: 4.5,  decay: 1.8, preDelayMs: 35, highFreqRolloff: 0.6 },
  telephone:        { durationSec: 0.15, decay: 8,   preDelayMs: 0,  highFreqRolloff: 0.3 },
}

function synthesizeIR(ctx: AudioContext, preset: PresetSpec): AudioBuffer {
  const sampleRate = ctx.sampleRate
  const length = Math.max(1, Math.floor(preset.durationSec * sampleRate))
  if (length === 0) {
    // 1-sample dry buffer (passthrough)
    const buf = ctx.createBuffer(2, 1, sampleRate)
    buf.getChannelData(0)[0] = 1
    buf.getChannelData(1)[0] = 1
    return buf
  }
  const preDelaySamples = Math.floor((preset.preDelayMs / 1000) * sampleRate)
  const totalLen = length + preDelaySamples
  const buf = ctx.createBuffer(2, totalLen, sampleRate)
  for (let ch = 0; ch < 2; ch++) {
    const data = buf.getChannelData(ch)
    // Silence during pre-delay
    for (let i = 0; i < preDelaySamples; i++) data[i] = 0
    // Exponentially decaying noise
    let smoothed = 0
    for (let i = preDelaySamples; i < totalLen; i++) {
      const t = (i - preDelaySamples) / length
      const envelope = Math.pow(1 - t, preset.decay)
      const noise = Math.random() * 2 - 1
      // Single-pole low-pass for high-frequency rolloff
      smoothed = smoothed * (1 - preset.highFreqRolloff) + noise * preset.highFreqRolloff
      data[i] = smoothed * envelope
    }
  }
  return buf
}

export interface ReverbController {
  /** Lazily creates the AudioContext + ConvolverNode chain. */
  ensureContext: () => AudioContext
  /** Switch the active IR preset. */
  setPreset: (preset: ReverbPreset) => void
  /** Wet/dry mix 0-1. 0 = dry, 1 = 100% reverb. */
  setWet: (wet: number) => void
  /** Connect an HTMLAudioElement / HTMLVideoElement to the reverb chain. */
  attachMedia: (el: HTMLMediaElement) => void
  /** Detach + close. */
  destroy: () => void
}

export function useConvolverReverb(): ReverbController {
  const ctxRef = useRef<AudioContext | null>(null)
  const convolverRef = useRef<ConvolverNode | null>(null)
  const dryGainRef = useRef<GainNode | null>(null)
  const wetGainRef = useRef<GainNode | null>(null)
  const presetRef = useRef<ReverbPreset>('dry')
  const wetRef = useRef<number>(0.3)
  const attachedRef = useRef<MediaElementAudioSourceNode | null>(null)

  const ensureContext = useCallback((): AudioContext => {
    if (ctxRef.current) return ctxRef.current
    const ctx = new AudioContext()
    const convolver = ctx.createConvolver()
    convolver.buffer = synthesizeIR(ctx, PRESETS[presetRef.current])
    const dry = ctx.createGain()
    dry.gain.value = 1 - wetRef.current
    const wet = ctx.createGain()
    wet.gain.value = wetRef.current
    convolver.connect(wet).connect(ctx.destination)
    dry.connect(ctx.destination)
    ctxRef.current = ctx
    convolverRef.current = convolver
    dryGainRef.current = dry
    wetGainRef.current = wet
    return ctx
  }, [])

  const setPreset = useCallback((preset: ReverbPreset) => {
    presetRef.current = preset
    const ctx = ctxRef.current
    if (!ctx || !convolverRef.current) return
    convolverRef.current.buffer = synthesizeIR(ctx, PRESETS[preset])
  }, [])

  const setWet = useCallback((wet: number) => {
    const clamped = Math.max(0, Math.min(1, wet))
    wetRef.current = clamped
    if (dryGainRef.current) dryGainRef.current.gain.value = 1 - clamped
    if (wetGainRef.current) wetGainRef.current.gain.value = clamped
  }, [])

  const attachMedia = useCallback((el: HTMLMediaElement) => {
    const ctx = ensureContext()
    if (attachedRef.current) {
      try { attachedRef.current.disconnect() } catch { /* noop */ }
    }
    try {
      const src = ctx.createMediaElementSource(el)
      src.connect(dryGainRef.current!)
      src.connect(convolverRef.current!)
      attachedRef.current = src
    } catch (err) {
      // Most common cause: el already attached to another MediaElementSource
      console.warn('[Reverb] attachMedia failed:', err)
    }
  }, [ensureContext])

  const destroy = useCallback(() => {
    if (attachedRef.current) try { attachedRef.current.disconnect() } catch { /* noop */ }
    if (ctxRef.current) try { void ctxRef.current.close() } catch { /* noop */ }
    ctxRef.current = null
    convolverRef.current = null
    dryGainRef.current = null
    wetGainRef.current = null
    attachedRef.current = null
  }, [])

  // Cleanup on unmount.
  useEffect(() => destroy, [destroy])

  return { ensureContext, setPreset, setWet, attachMedia, destroy }
}

export const REVERB_PRESETS: ReverbPreset[] = ['dry', 'small_room', 'medium_hall', 'large_cathedral', 'telephone']
