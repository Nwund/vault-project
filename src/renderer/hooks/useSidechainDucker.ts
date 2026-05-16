// File: src/renderer/hooks/useSidechainDucker.ts
//
// #172 — Sidechain ducking for VO over music. When Xyrene speaks (or
// any "trigger" audio source plays), background music dips
// automatically; when speech ends, music returns to full volume.
//
// Standard broadcast technique. Pure Web Audio — no deps.
//
// Architecture:
//   musicSource ──> musicGain (.gain) ──> destination
//   triggerSource ──> analyser ──> RAF-driven gain ramp on musicGain
//
// We don't use DynamicsCompressorNode in true sidechain mode because
// Web Audio doesn't expose external sidechain routing. Instead we
// poll the trigger's RMS and ramp musicGain.gain accordingly.

import { useCallback, useEffect, useRef } from 'react'

export interface DuckerOptions {
  /** Max amount to dip in dB. -12 to -24 typical. */
  duckDb: number
  /** Time to dip in seconds when trigger fires. */
  attackSec: number
  /** Time to recover when trigger ends. */
  releaseSec: number
  /** RMS threshold below which trigger is considered silent. */
  silenceThreshold: number
}

export const DEFAULT_DUCKER: DuckerOptions = {
  duckDb: -12,
  attackSec: 0.05,
  releaseSec: 0.4,
  silenceThreshold: 0.01,
}

export interface DuckerController {
  /** Wire the music source. Call once with the music's MediaElement. */
  attachMusic: (el: HTMLMediaElement) => void
  /** Wire the trigger source (e.g. TTS playback). */
  attachTrigger: (el: HTMLMediaElement) => void
  start: () => void
  stop: () => void
  setOptions: (opts: Partial<DuckerOptions>) => void
  destroy: () => void
}

export function useSidechainDucker(initialOpts?: Partial<DuckerOptions>): DuckerController {
  const ctxRef = useRef<AudioContext | null>(null)
  const musicGainRef = useRef<GainNode | null>(null)
  const triggerAnalyserRef = useRef<AnalyserNode | null>(null)
  const musicSrcRef = useRef<MediaElementAudioSourceNode | null>(null)
  const triggerSrcRef = useRef<MediaElementAudioSourceNode | null>(null)
  const optsRef = useRef<DuckerOptions>({ ...DEFAULT_DUCKER, ...(initialOpts ?? {}) })
  const rafRef = useRef<number>(0)
  const runningRef = useRef<boolean>(false)

  const ensureContext = useCallback(() => {
    if (ctxRef.current) return ctxRef.current
    const ctx = new AudioContext()
    const musicGain = ctx.createGain()
    musicGain.gain.value = 1
    musicGain.connect(ctx.destination)
    const analyser = ctx.createAnalyser()
    analyser.fftSize = 1024
    analyser.smoothingTimeConstant = 0.2
    // Trigger output ALSO goes to destination so Xyrene's voice plays
    // through the speakers — the analyser is on a parallel tap.
    analyser.connect(ctx.destination)
    ctxRef.current = ctx
    musicGainRef.current = musicGain
    triggerAnalyserRef.current = analyser
    return ctx
  }, [])

  const attachMusic = useCallback((el: HTMLMediaElement) => {
    const ctx = ensureContext()
    if (musicSrcRef.current) try { musicSrcRef.current.disconnect() } catch { /* noop */ }
    try {
      const src = ctx.createMediaElementSource(el)
      src.connect(musicGainRef.current!)
      musicSrcRef.current = src
    } catch (err) {
      console.warn('[Ducker] attachMusic failed:', err)
    }
  }, [ensureContext])

  const attachTrigger = useCallback((el: HTMLMediaElement) => {
    const ctx = ensureContext()
    if (triggerSrcRef.current) try { triggerSrcRef.current.disconnect() } catch { /* noop */ }
    try {
      const src = ctx.createMediaElementSource(el)
      src.connect(triggerAnalyserRef.current!)
      triggerSrcRef.current = src
    } catch (err) {
      console.warn('[Ducker] attachTrigger failed:', err)
    }
  }, [ensureContext])

  const tick = useCallback(() => {
    if (!runningRef.current) return
    const analyser = triggerAnalyserRef.current
    const gainNode = musicGainRef.current
    const ctx = ctxRef.current
    if (!analyser || !gainNode || !ctx) {
      rafRef.current = requestAnimationFrame(tick)
      return
    }
    // Read time-domain data + compute RMS
    const N = analyser.fftSize
    const data = new Float32Array(N)
    analyser.getFloatTimeDomainData(data)
    let sumSq = 0
    for (let i = 0; i < N; i++) sumSq += data[i] * data[i]
    const rms = Math.sqrt(sumSq / N)
    const isSpeaking = rms > optsRef.current.silenceThreshold
    const targetGain = isSpeaking ? Math.pow(10, optsRef.current.duckDb / 20) : 1
    const now = ctx.currentTime
    const rampTime = isSpeaking ? optsRef.current.attackSec : optsRef.current.releaseSec
    // setTargetAtTime uses an exponential ramp — natural-sounding for
    // ducking. timeConstant is the ramp time / 3 for ~95% target.
    gainNode.gain.setTargetAtTime(targetGain, now, Math.max(0.001, rampTime / 3))
    rafRef.current = requestAnimationFrame(tick)
  }, [])

  const start = useCallback(() => {
    runningRef.current = true
    rafRef.current = requestAnimationFrame(tick)
  }, [tick])

  const stop = useCallback(() => {
    runningRef.current = false
    cancelAnimationFrame(rafRef.current)
    // Restore music to full volume on stop.
    if (musicGainRef.current && ctxRef.current) {
      musicGainRef.current.gain.setTargetAtTime(1, ctxRef.current.currentTime, 0.1)
    }
  }, [])

  const setOptions = useCallback((opts: Partial<DuckerOptions>) => {
    optsRef.current = { ...optsRef.current, ...opts }
  }, [])

  const destroy = useCallback(() => {
    runningRef.current = false
    cancelAnimationFrame(rafRef.current)
    if (musicSrcRef.current) try { musicSrcRef.current.disconnect() } catch { /* noop */ }
    if (triggerSrcRef.current) try { triggerSrcRef.current.disconnect() } catch { /* noop */ }
    if (ctxRef.current) try { void ctxRef.current.close() } catch { /* noop */ }
    ctxRef.current = null
    musicGainRef.current = null
    triggerAnalyserRef.current = null
    musicSrcRef.current = null
    triggerSrcRef.current = null
  }, [])

  // Cleanup on unmount.
  useEffect(() => destroy, [destroy])

  return { attachMusic, attachTrigger, start, stop, setOptions, destroy }
}
