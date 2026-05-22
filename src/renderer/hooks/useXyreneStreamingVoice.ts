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
  // Cached expression so post-line audio effects (vocal fry tail)
  // can decide whether to fire when the stream ends.
  expression?: string
  // Per-utterance EQ — applied to every chunk before reverb.
  eq?: { warmth?: number; brightness?: number }
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
      /** Per-utterance EQ shaping applied AFTER TTS, BEFORE reverb.
       *  Adjusts the frequency character of her voice based on context
       *  (warm/intimate vs bright/peak). Optional — undefined = flat. */
      eq?: {
        /** Low-shelf boost/cut in dB. Negative = warmer, positive =
         *  thinner. Operates at ~400Hz cutoff. */
        warmth?: number
        /** High-shelf boost/cut in dB at ~3kHz. Positive = brighter,
         *  more "edge"; negative = softer. */
        brightness?: number
      }
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
  /** Start the ambient room-tone loop — extremely quiet pink noise that
   *  makes silences feel like a real space instead of dead air. */
  startRoomTone: () => void
  /** Stop the ambient room-tone loop. */
  stopRoomTone: () => void
  /** Synthesize a soft wet-mouth / tongue-lip sound — used as a
   *  pause-filler between consecutive sentences so the inter-sentence
   *  gap doesn't sound mechanical. Returns the duration scheduled. */
  playWetMouth: () => number
  /** Synthesize a soft sniffle (high-pass-filtered nasal intake). */
  playSniffle: () => number
  /** Synthesize a low throat-clear rumble. */
  playThroatClear: () => number
  /** Synthesize a saliva swallow (descending throat-formant pulse). */
  playSwallow: () => number
  /** Get the AnalyserNode tapped off the master bus for visualization.
   *  Returns null if the AudioContext hasn't been created yet. */
  getAnalyser: () => AnalyserNode | null
}

let streamIdSeq = 0

export function useXyreneStreamingVoice(): UseXyreneStreamingVoice {
  const ctxRef = useRef<AudioContext | null>(null)
  const gainRef = useRef<GainNode | null>(null)
  const streamsRef = useRef<Map<string, StreamState>>(new Map())
  // Reverb chain — a small-room impulse response convolved with the
  // voice path adds spatial presence so her voice sounds like it's IN
  // a real space, not floating in a dry studio mix. The dry path
  // dominates (default ~85%) so intelligibility stays intact; the wet
  // path adds a tail (~15%) that the ear reads as a room.
  const convolverRef = useRef<ConvolverNode | null>(null)
  const wetGainRef = useRef<GainNode | null>(null)
  const dryGainRef = useRef<GainNode | null>(null)
  // AnalyserNode tap on the master bus so the HUD can render a live
  // waveform / VU meter visualization of her voice activity.
  const analyserRef = useRef<AnalyserNode | null>(null)

  // Generate a small-room impulse response: exponentially-decaying
  // filtered noise. Larger rooms = longer decay, smaller = shorter.
  // 380ms decay with bandpass filtering ≈ a bedroom-sized space.
  const buildReverbIR = useCallback((ctx: AudioContext): AudioBuffer => {
    const lengthMs = 380
    const sampleCount = Math.floor((ctx.sampleRate * lengthMs) / 1000)
    const buf = ctx.createBuffer(2, sampleCount, ctx.sampleRate)
    for (let ch = 0; ch < 2; ch++) {
      const data = buf.getChannelData(ch)
      let prev = 0
      for (let i = 0; i < sampleCount; i++) {
        const t = i / sampleCount
        // Exponential decay envelope.
        const envelope = Math.pow(1 - t, 2.2)
        // Low-pass filtered noise (simple one-pole IIR) — gives the
        // reverb a softer, warmer character vs raw white noise.
        const raw = (Math.random() * 2 - 1) * envelope
        prev = prev * 0.85 + raw * 0.15
        // Stereo decorrelation — channel 1 lags slightly + has its own
        // filter state so left/right aren't identical.
        if (ch === 1 && i > 12) {
          data[i] = prev * 0.9 + buf.getChannelData(0)[i - 12] * 0.1
        } else {
          data[i] = prev
        }
      }
    }
    return buf
  }, [])

  // Lazy-create the AudioContext so we don't trigger autoplay warnings
  // before the user has interacted. Audio graph layout:
  //
  //   source → masterGain → destination
  //   source → convolver(IR) → wetGain → masterGain → destination
  //
  // Sources connect to `gainRef.current` (master). When a source wants
  // reverb (voice / breath), the caller ALSO connects through the
  // convolver path. Mouth-click / wet-mouth / ambient room tone go to
  // master directly so they don't get drowned in their own reverb.
  const getCtx = useCallback(() => {
    if (!ctxRef.current) {
      try {
        const Ctor = window.AudioContext || (window as any).webkitAudioContext
        const ctx: AudioContext = new Ctor({ sampleRate: 24000 })
        // Master output — soft-knee compressor → makeup gain → destination.
        // The compressor tames peaks so transient synth artifacts (mouth
        // clicks, climax voice) don't hit clipping; threshold + ratio
        // tuned to feel like a gentle natural-loudness curve, not
        // squashed studio compression.
        const compressor = ctx.createDynamicsCompressor()
        compressor.threshold.value = -18    // dB; starts compressing past quiet speech
        compressor.knee.value = 6           // soft knee — gentle onset
        compressor.ratio.value = 3          // 3:1 — gentle limiting
        compressor.attack.value = 0.003     // 3ms — catches transients
        compressor.release.value = 0.25     // smooth release
        const makeup = ctx.createGain()
        makeup.gain.value = 1.4             // recover lost level from compression
        compressor.connect(makeup).connect(ctx.destination)
        const master = ctx.createGain()
        master.gain.value = 1
        master.connect(compressor)
        // Analyser tap on master — used for the HUD waveform display.
        // Doesn't affect audio output (just a passive observer).
        const analyser = ctx.createAnalyser()
        analyser.fftSize = 256
        analyser.smoothingTimeConstant = 0.6
        master.connect(analyser)
        analyserRef.current = analyser
        // Build the reverb chain — convolver + wet gain into master.
        const convolver = ctx.createConvolver()
        convolver.buffer = buildReverbIR(ctx)
        const wetGain = ctx.createGain()
        wetGain.gain.value = 0.16   // ~16% wet; subtle, room-like
        const dryGain = ctx.createGain()
        dryGain.gain.value = 0.92   // dry path slightly attenuated to make headroom
        convolver.connect(wetGain).connect(master)
        dryGain.connect(master)
        ctxRef.current = ctx
        gainRef.current = master
        convolverRef.current = convolver
        wetGainRef.current = wetGain
        dryGainRef.current = dryGain
      } catch (err) {
        console.warn('[useXyreneStreamingVoice] AudioContext create failed:', err)
        return null
      }
    }
    return ctxRef.current
  }, [buildReverbIR])

  // Helper to connect a per-utterance audio node to both the dry path
  // AND the reverb path. Use for voice-relevant sources (TTS chunks,
  // intake breath, vocal fry). Non-vocal artifacts that should stay
  // dry (mouth click, ambient room tone) connect directly to gainRef.
  const connectThroughReverb = useCallback((node: AudioNode) => {
    if (dryGainRef.current) node.connect(dryGainRef.current)
    if (convolverRef.current) node.connect(convolverRef.current)
  }, [])

  /**
   * Synthesize a soft mouth-click / lip-smack sound. Real human
   * speech has small percussive mouth sounds at word boundaries
   * (especially after silence). AI synthesis is sterile — adding
   * these makes the voice path read as biological.
   *
   * Very short (15-30ms) bandpass-filtered impulse. Returns the
   * duration scheduled so callers can offset their TTS start.
   */
  const playMouthClick = useCallback((): number => {
    const ctx = getCtx()
    if (!ctx) return 0
    if (Math.random() < 0.55) return 0  // only ~45% of the time
    const now = ctx.currentTime
    const dur = (15 + Math.random() * 20) / 1000
    const sampleCount = Math.floor(ctx.sampleRate * dur)
    const buf = ctx.createBuffer(1, sampleCount, ctx.sampleRate)
    const data = buf.getChannelData(0)
    for (let i = 0; i < sampleCount; i++) {
      // Sharp exponential decay impulse — sounds like a tongue click.
      const t = i / sampleCount
      data[i] = (Math.random() * 2 - 1) * Math.exp(-t * 8)
    }
    const src = ctx.createBufferSource()
    src.buffer = buf
    const filter = ctx.createBiquadFilter()
    filter.type = 'bandpass'
    // Mouth-click formants sit around 2-3kHz.
    filter.frequency.value = 2200 + Math.random() * 800
    filter.Q.value = 1.2
    const gain = ctx.createGain()
    gain.gain.value = 0.035 + Math.random() * 0.02  // very quiet, percussive
    src.connect(filter).connect(gain).connect(gainRef.current ?? ctx.destination)
    src.start(now)
    src.stop(now + dur + 0.005)
    return Math.round(dur * 1000)
  }, [getCtx])

  /**
   * Synthesize a soft sniffle — a quick nasal intake. ~150ms of
   * high-pass-filtered noise simulating sniff. Used as an idle
   * non-vocal sound to maintain presence between utterances.
   */
  const playSniffle = useCallback((): number => {
    const ctx = getCtx()
    if (!ctx) return 0
    const now = ctx.currentTime
    const dur = (130 + Math.random() * 70) / 1000
    const sampleCount = Math.floor(ctx.sampleRate * dur)
    const buf = ctx.createBuffer(1, sampleCount, ctx.sampleRate)
    const data = buf.getChannelData(0)
    for (let i = 0; i < sampleCount; i++) data[i] = Math.random() * 2 - 1
    const src = ctx.createBufferSource()
    src.buffer = buf
    const filter = ctx.createBiquadFilter()
    filter.type = 'bandpass'
    filter.frequency.value = 1800 + Math.random() * 400 // higher than breath = nasal
    filter.Q.value = 1.5
    const gain = ctx.createGain()
    // Inhale envelope: faster attack than breath, snap decay.
    const peak = 0.05 + Math.random() * 0.02
    gain.gain.setValueAtTime(0.0001, now)
    gain.gain.exponentialRampToValueAtTime(peak, now + dur * 0.25)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + dur)
    src.connect(filter).connect(gain)
    connectThroughReverb(gain)
    src.start(now)
    src.stop(now + dur + 0.01)
    return Math.round(dur * 1000)
  }, [getCtx, connectThroughReverb])

  /**
   * Synthesize a saliva swallow — a quick descending glottal sound.
   * Real speech has occasional swallows between thoughts; this adds
   * one to the audio path. ~90-130ms of low-frequency tone with
   * descending pitch and wet-formant filtering.
   */
  const playSwallow = useCallback((): number => {
    const ctx = getCtx()
    if (!ctx) return 0
    const now = ctx.currentTime
    const dur = (90 + Math.random() * 40) / 1000
    const sampleCount = Math.floor(ctx.sampleRate * dur)
    const buf = ctx.createBuffer(1, sampleCount, ctx.sampleRate)
    const data = buf.getChannelData(0)
    // Descending pitch from ~150Hz to ~80Hz = the "gulp" character.
    for (let i = 0; i < sampleCount; i++) {
      const t = i / sampleCount
      const freq = 150 - 70 * t
      const phase = (i / ctx.sampleRate) * freq * 2 * Math.PI
      const env = Math.sin(Math.PI * t) * Math.pow(1 - t, 0.5)
      // Tone + slight noise for wet quality.
      data[i] = (Math.sin(phase) * 0.7 + (Math.random() * 2 - 1) * 0.3) * env * 0.5
    }
    const src = ctx.createBufferSource()
    src.buffer = buf
    const filter = ctx.createBiquadFilter()
    filter.type = 'bandpass'
    filter.frequency.value = 600   // wet/throat formant
    filter.Q.value = 1.2
    const gain = ctx.createGain()
    gain.gain.value = 0.04
    src.connect(filter).connect(gain)
    connectThroughReverb(gain)
    src.start(now)
    src.stop(now + dur + 0.01)
    return Math.round(dur * 1000)
  }, [getCtx, connectThroughReverb])

  /**
   * Synthesize a soft throat-clear — low-frequency rumble. Adds
   * physical presence between utterances.
   */
  const playThroatClear = useCallback((): number => {
    const ctx = getCtx()
    if (!ctx) return 0
    const now = ctx.currentTime
    const dur = (180 + Math.random() * 120) / 1000
    const sampleCount = Math.floor(ctx.sampleRate * dur)
    const buf = ctx.createBuffer(1, sampleCount, ctx.sampleRate)
    const data = buf.getChannelData(0)
    // Low-frequency pulsing oscillator + noise = throat sound
    for (let i = 0; i < sampleCount; i++) {
      const t = i / ctx.sampleRate
      const tone = Math.sin(t * 110 * 2 * Math.PI + (Math.random() - 0.5) * 0.5)
      const noise = (Math.random() * 2 - 1) * 0.3
      const env = Math.sin(Math.PI * (t / dur))  // arc-shape
      data[i] = (tone * 0.5 + noise) * env * 0.4
    }
    const src = ctx.createBufferSource()
    src.buffer = buf
    const filter = ctx.createBiquadFilter()
    filter.type = 'bandpass'
    filter.frequency.value = 350
    filter.Q.value = 0.8
    const gain = ctx.createGain()
    gain.gain.value = 0.045
    src.connect(filter).connect(gain)
    connectThroughReverb(gain)
    src.start(now)
    src.stop(now + dur + 0.01)
    return Math.round(dur * 1000)
  }, [getCtx, connectThroughReverb])

  /**
   * Synthesize a wet-mouth / tongue-lip sound. Real human speech
   * between sentences has soft saliva/tongue movement audible — a
   * brief moist click distinct from a dry tongue click. Used as a
   * pause-filler when multiple sentences queue back-to-back.
   *
   * Two stacked short impulses with bandpass filtering at 1.5-2kHz.
   * Quieter than the dry click; more "wet" texture.
   */
  const playWetMouth = useCallback((): number => {
    const ctx = getCtx()
    if (!ctx) return 0
    if (Math.random() < 0.55) return 0  // ~45% of pauses
    const now = ctx.currentTime
    // Two impulses ~30ms apart
    for (let p = 0; p < 2; p++) {
      const startAt = now + p * 0.03
      const dur = 0.012 + Math.random() * 0.008
      const sampleCount = Math.max(1, Math.floor(ctx.sampleRate * dur))
      const buf = ctx.createBuffer(1, sampleCount, ctx.sampleRate)
      const data = buf.getChannelData(0)
      for (let i = 0; i < sampleCount; i++) {
        const t = i / sampleCount
        data[i] = (Math.random() * 2 - 1) * Math.exp(-t * 6) * 0.6
      }
      const src = ctx.createBufferSource()
      src.buffer = buf
      const filter = ctx.createBiquadFilter()
      filter.type = 'bandpass'
      filter.frequency.value = 1500 + Math.random() * 500
      filter.Q.value = 1.5
      const gain = ctx.createGain()
      gain.gain.value = 0.022 - p * 0.005  // second pulse softer
      src.connect(filter).connect(gain).connect(gainRef.current ?? ctx.destination)
      src.start(startAt)
      src.stop(startAt + dur + 0.005)
    }
    return 60  // ~60ms total
  }, [getCtx])

  /**
   * Synthesize a vocal-fry / creaky-voice tail. Real humans at peak
   * arousal often end words with a low-register creaky growl that
   * pure TTS can't produce. ~150-280ms of low-frequency irregular
   * oscillation panned through a narrow bandpass for that "creak"
   * texture.
   *
   * Only fired for moaned/desperate expressions — sounds wrong on
   * neutral or commanded lines.
   */
  const playVocalFry = useCallback((): number => {
    const ctx = getCtx()
    if (!ctx) return 0
    if (Math.random() < 0.6) return 0  // only ~40% of qualifying lines
    const now = ctx.currentTime
    const dur = (150 + Math.random() * 130) / 1000
    const sampleCount = Math.floor(ctx.sampleRate * dur)
    const buf = ctx.createBuffer(1, sampleCount, ctx.sampleRate)
    const data = buf.getChannelData(0)
    // Synthesize a low-register pulse train with irregular spacing —
    // that's what vocal fry actually IS biologically.
    const baseFreq = 65 + Math.random() * 25  // 65-90Hz = creaky range
    for (let i = 0; i < sampleCount; i++) {
      const t = i / ctx.sampleRate
      const phase = t * baseFreq * 2 * Math.PI
      // Add slight irregularity — fry isn't perfectly periodic.
      const jitter = (Math.random() - 0.5) * 0.3
      const env = Math.exp(-t * 5)  // decay envelope
      data[i] = (Math.sin(phase + jitter) + Math.sin(phase * 2 + jitter) * 0.3) * 0.5 * env
    }
    const src = ctx.createBufferSource()
    src.buffer = buf
    const filter = ctx.createBiquadFilter()
    filter.type = 'bandpass'
    filter.frequency.value = 200 + Math.random() * 200
    filter.Q.value = 0.8
    const gain = ctx.createGain()
    gain.gain.value = 0.06
    src.connect(filter).connect(gain)
    connectThroughReverb(gain)
    src.start(now)
    src.stop(now + dur + 0.01)
    return Math.round(dur * 1000)
  }, [getCtx, connectThroughReverb])

  /**
   * Synthesize a short soft laugh — two quick exponentially-decaying
   * pulses with breath-formant filtering. Used when the LLM text
   * contains laughter markers ("ha", "lol", "lmao"). Far better than
   * having XTTS try to pronounce "ha ha" literally.
   */
  const playLaugh = useCallback((): number => {
    const ctx = getCtx()
    if (!ctx) return 0
    const now = ctx.currentTime
    const totalDur = 400  // ~400ms total
    // Three short pulses: "ah ah ah"
    for (let p = 0; p < 3; p++) {
      const pulseStart = now + (p * 0.13)
      const pulseDur = 0.09
      const sampleCount = Math.floor(ctx.sampleRate * pulseDur)
      const buf = ctx.createBuffer(1, sampleCount, ctx.sampleRate)
      const data = buf.getChannelData(0)
      for (let i = 0; i < sampleCount; i++) {
        const t = i / sampleCount
        const envelope = Math.sin(Math.PI * t) // arc-shaped pulse
        data[i] = (Math.random() * 2 - 1) * envelope * 0.6
      }
      const src = ctx.createBufferSource()
      src.buffer = buf
      const filter = ctx.createBiquadFilter()
      filter.type = 'bandpass'
      filter.frequency.value = 700 - p * 100  // descending pitch
      filter.Q.value = 1.8
      const gain = ctx.createGain()
      gain.gain.value = 0.08 - p * 0.02
      src.connect(filter).connect(gain)
      connectThroughReverb(gain)
      src.start(pulseStart)
      src.stop(pulseStart + pulseDur + 0.01)
    }
    return totalDur
  }, [getCtx, connectThroughReverb])

  /**
   * Synthesize a soft pre-speech intake breath using filtered white
   * noise. Humans always breathe before speaking; AI doesn't — adding
   * a quick intake makes her sound startlingly more present.
   *
   * Variations:
   *   - Sometimes a quick gasp (60-100ms, climactic context)
   *   - Sometimes a long intake (180-280ms, intimate/breathy)
   *   - Sometimes no breath at all (humans don't always)
   *
   * Duration / volume / filter pass-band randomized per call so two
   * breaths never sound identical.
   */
  const playPreBreath = useCallback((opts: { intensity?: number; voicedAfter?: boolean } = {}): number => {
    const ctx = getCtx()
    if (!ctx) return 0
    // 30% of the time no breath — humans aren't always audible.
    if (Math.random() < 0.3) return 0
    const now = ctx.currentTime
    const intensity = Math.max(0, Math.min(1, opts.intensity ?? 0.5))
    // Higher intensity = shorter, faster intake (gasp); lower = longer
    // and softer (intimate/breathy).
    const durationMs = intensity > 0.7
      ? 60 + Math.random() * 60   // 60-120ms gasp
      : 160 + Math.random() * 140 // 160-300ms intake
    const dur = durationMs / 1000
    // Build a white-noise buffer. Filter it through a bandpass
    // centered around the breath formant range (~600-1400Hz) so
    // it reads as a real inhale, not just hiss.
    const sampleCount = Math.floor(ctx.sampleRate * dur)
    const noiseBuf = ctx.createBuffer(1, sampleCount, ctx.sampleRate)
    const noiseData = noiseBuf.getChannelData(0)
    for (let i = 0; i < sampleCount; i++) {
      noiseData[i] = Math.random() * 2 - 1
    }
    const src = ctx.createBufferSource()
    src.buffer = noiseBuf
    const filter = ctx.createBiquadFilter()
    filter.type = 'bandpass'
    // Center freq jitters per call so each breath has its own character.
    filter.frequency.value = 800 + Math.random() * 600
    filter.Q.value = 0.7 + Math.random() * 0.6
    const breathGain = ctx.createGain()
    // Inhale envelope — sharp attack, quick decay (sucking in then
    // the lips close as she starts to speak).
    const peakVol = (0.04 + 0.06 * intensity) * (Math.random() * 0.4 + 0.8) // small base + jitter
    breathGain.gain.setValueAtTime(0.0001, now)
    breathGain.gain.exponentialRampToValueAtTime(peakVol, now + dur * 0.35)
    breathGain.gain.exponentialRampToValueAtTime(0.0001, now + dur)
    src.connect(filter).connect(breathGain)
    connectThroughReverb(breathGain)
    src.start(now)
    src.stop(now + dur + 0.02)
    return durationMs
  }, [getCtx, connectThroughReverb])

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
        // Voice chunks route through the reverb chain so her speech
        // sounds spatial. Non-vocal artifacts (mouth click, room tone)
        // connect directly to master via gainRef. When per-utterance
        // EQ is set, insert low/high-shelf filters before reverb.
        if (state.eq && (state.eq.warmth || state.eq.brightness)) {
          let lastNode: AudioNode = src
          if (typeof state.eq.warmth === 'number' && state.eq.warmth !== 0) {
            const low = ctx.createBiquadFilter()
            low.type = 'lowshelf'
            low.frequency.value = 400
            low.gain.value = state.eq.warmth
            lastNode.connect(low)
            lastNode = low
          }
          if (typeof state.eq.brightness === 'number' && state.eq.brightness !== 0) {
            const high = ctx.createBiquadFilter()
            high.type = 'highshelf'
            high.frequency.value = 3000
            high.gain.value = state.eq.brightness
            lastNode.connect(high)
            lastNode = high
          }
          connectThroughReverb(lastNode)
        } else {
          connectThroughReverb(src)
        }
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
          // fire vocal-fry tail (if applicable) and the user's onEnd.
          // Defensive against race where :end fires before the last
          // chunk finishes playing.
          if (state.done && state.liveChunks <= 0) {
            if (state.expression === 'moaned' || state.expression === 'desperate') {
              try { playVocalFry() } catch { /* ignore */ }
            }
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
        // Fire vocal fry + onEnd immediately so callers can clean up.
        if (state.expression === 'moaned' || state.expression === 'desperate') {
          try { playVocalFry() } catch { /* ignore */ }
        }
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
      // Stop room tone if running.
      try { roomToneSrcRef.current?.stop() } catch { /* ignore */ }
      roomToneSrcRef.current = null
      roomToneGainRef.current = null
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
    // Pre-speech mouth click (~45% chance) — small percussive sound
    // that real human speech has at word boundaries after silence.
    const clickMs = playMouthClick()
    // Pre-speech intake breath — humans inhale before speaking. Use
    // expression hint to decide intensity (climax = gasp, breathy =
    // long intake). Variable per-call so two breaths never match.
    const breathIntensity = options.expression === 'moaned' || options.expression === 'desperate' ? 0.85
      : options.expression === 'commanded' || options.expression === 'commanding' ? 0.5
      : options.expression === 'breathy' || options.expression === 'whispered' ? 0.3
      : 0.4
    const breathMs = playPreBreath({ intensity: breathIntensity })
    // After-breath: brief micro-pause (40-90ms) before the TTS audio
    // starts — that lip-close pause between intake and first syllable.
    const postBreathPad = breathMs > 0 ? 40 + Math.random() * 50 : 0
    // Synthesized laughter — if the text starts with or contains a
    // laughter marker (lol/lmao/ha ha/hehe), play a soft laugh INSTEAD
    // of having XTTS try to pronounce "ha ha" literally. Strips the
    // marker from the text passed to the server.
    let cleanedText = text
    let laughMs = 0
    const laughMatch = text.match(/^\s*(lol|lmao|ha ha+|hehe|haha+|heh)\b[,\s]*/i)
    if (laughMatch) {
      laughMs = playLaugh()
      cleanedText = text.slice(laughMatch[0].length).trim()
      // If only the laugh marker was present, fire onStart/onEnd
      // synthetically and return — no TTS needed.
      if (!cleanedText) {
        const id2 = `xs-${Date.now()}-${++streamIdSeq}`
        try { options.onStart?.() } catch { /* ignore */ }
        window.setTimeout(() => {
          try { options.onEnd?.() } catch { /* ignore */ }
        }, laughMs + 50)
        return {
          id: id2,
          isActive: () => false,
          cancel: () => { /* noop — laugh is fire-and-forget */ },
        }
      }
    }
    const state: StreamState = {
      id,
      sampleRate: 24000,
      // Reserve audio slot just after all preamble sounds (click +
      // breath + breath pad + laugh) so chunks line up cleanly.
      nextStartTime: ctx.currentTime + (clickMs + breathMs + postBreathPad + laughMs) / 1000,
      done: false,
      sources: new Set(),
      liveChunks: 0,
      onStart: options.onStart,
      onEnd: options.onEnd,
      hasStarted: false,
      expression: options.expression,
      eq: options.eq,
    }
    streamsRef.current.set(id, state)
    // Fire the IPC. The handler will start sending chunk events as the
    // server produces them. speed/pitch/expression are forwarded only
    // when set so older XTTS servers don't choke on unknown fields.
    void window.api.ai.xyreneSpeakStream({
      text: cleanedText,
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

  // Ambient "room tone" loop — extremely quiet (-45dB) pink-noise-ish
  // background that makes the audio feel like it's coming from a
  // real space, not a sterile synthesis pipe. Real recordings always
  // have room tone; perfect silence between utterances is a major
  // "AI" tell.
  const roomToneSrcRef = useRef<AudioBufferSourceNode | null>(null)
  const roomToneGainRef = useRef<GainNode | null>(null)
  const startRoomTone = useCallback(() => {
    const ctx = getCtx()
    if (!ctx || roomToneSrcRef.current) return
    // 8-second loop of softly-filtered pink noise. Filter centered
    // around the 200-1500Hz "room" range with very low Q so it sounds
    // like ambient air, not a tone.
    const seconds = 8
    const sampleCount = ctx.sampleRate * seconds
    const buf = ctx.createBuffer(1, sampleCount, ctx.sampleRate)
    const data = buf.getChannelData(0)
    // Pink noise via Voss-McCartney approximation (cheaper than FFT).
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0
    for (let i = 0; i < sampleCount; i++) {
      const white = Math.random() * 2 - 1
      b0 = 0.99886 * b0 + white * 0.0555179
      b1 = 0.99332 * b1 + white * 0.0750759
      b2 = 0.96900 * b2 + white * 0.1538520
      b3 = 0.86650 * b3 + white * 0.3104856
      b4 = 0.55000 * b4 + white * 0.5329522
      b5 = -0.7616 * b5 - white * 0.0168980
      const pink = b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362
      b6 = white * 0.115926
      data[i] = pink * 0.11
    }
    const src = ctx.createBufferSource()
    src.buffer = buf
    src.loop = true
    const filter = ctx.createBiquadFilter()
    filter.type = 'bandpass'
    filter.frequency.value = 600
    filter.Q.value = 0.3
    const gain = ctx.createGain()
    // -45dB ish — barely audible but absolutely there. Subjective
    // floor that makes silence "alive" without being intrusive.
    gain.gain.value = 0.0055
    src.connect(filter).connect(gain).connect(gainRef.current ?? ctx.destination)
    src.start()
    roomToneSrcRef.current = src
    roomToneGainRef.current = gain
  }, [getCtx])
  const stopRoomTone = useCallback(() => {
    try { roomToneSrcRef.current?.stop() } catch { /* ignore */ }
    roomToneSrcRef.current = null
    roomToneGainRef.current = null
  }, [])

  const isAnyActive = useCallback(() => {
    for (const state of streamsRef.current.values()) {
      if (!state.done || state.liveChunks > 0) return true
    }
    return false
  }, [])

  const getAnalyser = useCallback(() => analyserRef.current, [])

  return {
    speakStreaming,
    cancelAll,
    isAnyActive,
    startRoomTone,
    stopRoomTone,
    playWetMouth,
    playSniffle,
    playThroatClear,
    playSwallow,
    getAnalyser,
  }
}
