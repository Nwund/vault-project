// File: src/renderer/utils/binaural-engine.ts
//
// #366 H-142 — Binaural beat / hypno carrier generator. Two oscillators
// detuned by N Hz, panned hard L/R, optionally layered over pink-noise
// or a user-supplied audio track. Lives in the renderer because it
// uses the Web Audio API directly (lower latency, no encode hop).
//
// Brainwave bands (approximate):
//   - delta (0.5-4 Hz)  → deep sleep, very deep relaxation
//   - theta (4-8 Hz)    → meditation, hypnotic trance
//   - alpha (8-13 Hz)   → relaxed wakefulness, light hypnosis
//   - beta  (13-30 Hz)  → alert focus, active concentration
//   - gamma (30-100 Hz) → high cognition, peak focus
//
// For hypno/brainwash use, theta (5-7 Hz) at a 200 Hz carrier is the
// canonical recipe. Alpha (10 Hz) for softer trance.

export type BinauralBand = 'delta' | 'theta' | 'alpha' | 'beta' | 'gamma'

export interface BinauralOptions {
  /** Carrier frequency (Hz). Default 200 — comfortable on most headphones. */
  carrier?: number
  /** Beat frequency (Hz) — the difference between L and R oscillator. */
  beat?: number
  /** Preset band; sets `beat` to that band's midpoint if not given. */
  band?: BinauralBand
  /** Layer pink noise underneath at this gain (0..1, default 0). */
  noise?: number
  /** Master gain (0..1, default 0.15 — these are headphone-only). */
  gain?: number
  /** Fade-in seconds when start() is called. Default 3. */
  fadeIn?: number
  /** Fade-out seconds when stop() is called. Default 3. */
  fadeOut?: number
}

const BAND_MIDPOINTS: Record<BinauralBand, number> = {
  delta: 2.5,
  theta: 6,
  alpha: 10,
  beta: 18,
  gamma: 40,
}

export interface BinauralHandle {
  stop: (fadeMs?: number) => Promise<void>
  setGain: (g: number) => void
  setBeat: (beatHz: number) => void
  context: AudioContext
  isPlaying: () => boolean
}

let activeHandle: BinauralHandle | null = null

// Reuse a single AudioContext across calls — browsers throttle creating
// new ones and a closed/suspended context can't be reused.
let sharedCtx: AudioContext | null = null
function ctx(): AudioContext {
  if (!sharedCtx || sharedCtx.state === 'closed') {
    sharedCtx = new (window.AudioContext || (window as any).webkitAudioContext)()
  }
  return sharedCtx
}

// Pink-noise generator via Voss-McCartney algorithm. Returns a
// looping AudioBuffer of N seconds. Memoized so we don't regenerate
// across calls.
let pinkBuffer: AudioBuffer | null = null
function pinkNoise(c: AudioContext, durationSec = 10): AudioBuffer {
  if (pinkBuffer && pinkBuffer.sampleRate === c.sampleRate) return pinkBuffer
  const len = durationSec * c.sampleRate
  const buffer = c.createBuffer(1, len, c.sampleRate)
  const data = buffer.getChannelData(0)
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0
  for (let i = 0; i < len; i++) {
    const white = Math.random() * 2 - 1
    b0 = 0.99886 * b0 + white * 0.0555179
    b1 = 0.99332 * b1 + white * 0.0750759
    b2 = 0.96900 * b2 + white * 0.1538520
    b3 = 0.86650 * b3 + white * 0.3104856
    b4 = 0.55000 * b4 + white * 0.5329522
    b5 = -0.7616 * b5 - white * 0.0168980
    data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11
    b6 = white * 0.115926
  }
  pinkBuffer = buffer
  return buffer
}

export function startBinaural(options: BinauralOptions = {}): BinauralHandle {
  if (activeHandle?.isPlaying()) {
    void activeHandle.stop(0)
    activeHandle = null
  }

  const c = ctx()
  if (c.state === 'suspended') void c.resume()

  const beat = options.beat ?? (options.band ? BAND_MIDPOINTS[options.band] : 6)
  const carrier = options.carrier ?? 200
  const baseGain = options.gain ?? 0.15
  const noiseGain = options.noise ?? 0
  const fadeInSec = options.fadeIn ?? 3
  const fadeOutSec = options.fadeOut ?? 3

  // Left + right oscillators detuned by `beat` Hz, hard-panned.
  const leftOsc = c.createOscillator()
  leftOsc.type = 'sine'
  leftOsc.frequency.value = carrier - beat / 2
  const rightOsc = c.createOscillator()
  rightOsc.type = 'sine'
  rightOsc.frequency.value = carrier + beat / 2

  const leftPanner = c.createStereoPanner()
  leftPanner.pan.value = -1
  const rightPanner = c.createStereoPanner()
  rightPanner.pan.value = 1

  // Per-osc gain so we can independently fade beat layer + noise layer.
  const beatGain = c.createGain()
  beatGain.gain.value = 0  // fade in below

  leftOsc.connect(leftPanner).connect(beatGain)
  rightOsc.connect(rightPanner).connect(beatGain)

  // Optional pink-noise carrier layer.
  let noiseSource: AudioBufferSourceNode | null = null
  let noiseGainNode: GainNode | null = null
  if (noiseGain > 0) {
    noiseGainNode = c.createGain()
    noiseGainNode.gain.value = 0
    noiseSource = c.createBufferSource()
    noiseSource.buffer = pinkNoise(c)
    noiseSource.loop = true
    noiseSource.connect(noiseGainNode)
  }

  // Master gain (the user-facing volume knob).
  const master = c.createGain()
  master.gain.value = baseGain
  beatGain.connect(master)
  noiseGainNode?.connect(master)
  master.connect(c.destination)

  const now = c.currentTime
  leftOsc.start(now)
  rightOsc.start(now)
  noiseSource?.start(now)

  // Fade in.
  beatGain.gain.setValueAtTime(0, now)
  beatGain.gain.linearRampToValueAtTime(1, now + fadeInSec)
  if (noiseGainNode) {
    noiseGainNode.gain.setValueAtTime(0, now)
    noiseGainNode.gain.linearRampToValueAtTime(noiseGain, now + fadeInSec)
  }

  let stopped = false
  const handle: BinauralHandle = {
    stop: async (fadeMs?: number) => {
      if (stopped) return
      stopped = true
      const dur = typeof fadeMs === 'number' ? fadeMs / 1000 : fadeOutSec
      const t = c.currentTime
      beatGain.gain.cancelScheduledValues(t)
      beatGain.gain.setValueAtTime(beatGain.gain.value, t)
      beatGain.gain.linearRampToValueAtTime(0, t + dur)
      if (noiseGainNode) {
        noiseGainNode.gain.cancelScheduledValues(t)
        noiseGainNode.gain.setValueAtTime(noiseGainNode.gain.value, t)
        noiseGainNode.gain.linearRampToValueAtTime(0, t + dur)
      }
      await new Promise((r) => setTimeout(r, Math.max(50, dur * 1000 + 50)))
      try { leftOsc.stop(); rightOsc.stop(); noiseSource?.stop() } catch { /* ignore */ }
      try { leftPanner.disconnect(); rightPanner.disconnect(); beatGain.disconnect(); noiseGainNode?.disconnect(); master.disconnect() } catch { /* ignore */ }
      if (activeHandle === handle) activeHandle = null
    },
    setGain: (g: number) => {
      const safe = Math.max(0, Math.min(1, g))
      master.gain.setTargetAtTime(safe, c.currentTime, 0.05)
    },
    setBeat: (beatHz: number) => {
      const safe = Math.max(0.5, Math.min(60, beatHz))
      leftOsc.frequency.setTargetAtTime(carrier - safe / 2, c.currentTime, 0.1)
      rightOsc.frequency.setTargetAtTime(carrier + safe / 2, c.currentTime, 0.1)
    },
    context: c,
    isPlaying: () => !stopped,
  }
  activeHandle = handle
  return handle
}

export function stopBinaural(fadeMs?: number): Promise<void> {
  if (!activeHandle) return Promise.resolve()
  return activeHandle.stop(fadeMs)
}

export function getBinauralHandle(): BinauralHandle | null {
  return activeHandle?.isPlaying() ? activeHandle : null
}
