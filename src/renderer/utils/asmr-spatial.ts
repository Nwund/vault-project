// File: src/renderer/utils/asmr-spatial.ts
//
// #356 G-132 — ASMR ear-licking spatial audio (HRTF). Wraps an
// AudioBuffer / HTMLMediaElement / fetched URL through Web Audio's
// PannerNode in HRTF mode + a position-trajectory animator. The
// classic ASMR "L → R → L" ear-licking effect is just a Panner
// whose X coordinate sweeps -1 to +1 over a configurable cycle.
//
// HRTF panning sounds dramatically more 3D than equal-power stereo
// — the browser convolves with measured head-related impulse
// responses, so a sound at (-0.8, 0, 0.1) actually feels like it's
// near your left ear, not just louder in the left channel.

export type ASMRTrajectory =
  | { kind: 'ear-lick'; cycleSec: number; intensity: number }   // L↔R sweep at user-set tempo
  | { kind: 'circle';   cycleSec: number; radius: number }      // around head
  | { kind: 'in-out';   cycleSec: number; depth: number }       // forward/back
  | { kind: 'static';   x: number; y: number; z: number }       // fixed point

export interface ASMRPlayHandle {
  pause: () => void
  resume: () => void
  stop: () => Promise<void>
  setTrajectory: (t: ASMRTrajectory) => void
  setGain: (g: number) => void
  isPlaying: () => boolean
}

let sharedCtx: AudioContext | null = null
function ctx(): AudioContext {
  if (!sharedCtx || sharedCtx.state === 'closed') {
    sharedCtx = new (window.AudioContext || (window as any).webkitAudioContext)()
  }
  return sharedCtx
}

interface InternalState {
  audioCtx: AudioContext
  source: AudioBufferSourceNode | MediaElementAudioSourceNode
  panner: PannerNode
  master: GainNode
  trajectory: ASMRTrajectory
  startTimeMs: number
  rafId: number | null
  stopped: boolean
  loop: boolean
  mediaEl?: HTMLMediaElement
}

function applyTrajectory(state: InternalState): void {
  if (state.stopped) return
  const c = state.audioCtx
  const elapsedSec = (performance.now() - state.startTimeMs) / 1000
  const t = state.trajectory
  let x = 0, y = 0, z = 1
  if (t.kind === 'ear-lick') {
    const phase = (elapsedSec / t.cycleSec) * Math.PI * 2
    x = Math.sin(phase) * t.intensity
    z = 0.2  // very close to ear
  } else if (t.kind === 'circle') {
    const phase = (elapsedSec / t.cycleSec) * Math.PI * 2
    x = Math.cos(phase) * t.radius
    z = Math.sin(phase) * t.radius
  } else if (t.kind === 'in-out') {
    const phase = (elapsedSec / t.cycleSec) * Math.PI * 2
    z = (Math.sin(phase) * 0.5 + 0.5) * t.depth + 0.2
  } else {
    x = t.x; y = t.y; z = t.z
  }
  // PannerNode.positionX/Y/Z are AudioParam — automate so the position
  // smooths between RAF ticks instead of stepping.
  const now = c.currentTime
  state.panner.positionX.setTargetAtTime(x, now, 0.02)
  state.panner.positionY.setTargetAtTime(y, now, 0.02)
  state.panner.positionZ.setTargetAtTime(z, now, 0.02)
  state.rafId = requestAnimationFrame(() => applyTrajectory(state))
}

function configurePanner(panner: PannerNode): void {
  panner.panningModel = 'HRTF'
  panner.distanceModel = 'inverse'
  panner.refDistance = 1
  panner.maxDistance = 10
  panner.rolloffFactor = 1
  panner.coneInnerAngle = 360
  panner.coneOuterAngle = 0
  panner.coneOuterGain = 0
}

// Play from a URL via offline decode + buffer source (looped option).
export async function playASMRFromUrl(url: string, options: { trajectory: ASMRTrajectory; gain?: number; loop?: boolean } = { trajectory: { kind: 'ear-lick', cycleSec: 4, intensity: 0.85 } }): Promise<ASMRPlayHandle> {
  const c = ctx()
  if (c.state === 'suspended') await c.resume()
  const resp = await fetch(url)
  const buf = await resp.arrayBuffer()
  const decoded = await c.decodeAudioData(buf)
  const source = c.createBufferSource()
  source.buffer = decoded
  source.loop = !!options.loop
  const panner = c.createPanner()
  configurePanner(panner)
  const master = c.createGain()
  master.gain.value = options.gain ?? 1
  source.connect(panner).connect(master).connect(c.destination)
  source.start()
  const state: InternalState = {
    audioCtx: c,
    source, panner, master,
    trajectory: options.trajectory,
    startTimeMs: performance.now(),
    rafId: null, stopped: false, loop: !!options.loop,
  }
  applyTrajectory(state)
  return makeHandle(state)
}

// Bind to an existing HTML <audio> or <video> element. Useful when
// the user wants to add spatial panning to a player already running.
export function bindASMRToElement(el: HTMLMediaElement, options: { trajectory: ASMRTrajectory; gain?: number } = { trajectory: { kind: 'ear-lick', cycleSec: 4, intensity: 0.85 } }): ASMRPlayHandle {
  const c = ctx()
  if (c.state === 'suspended') void c.resume()
  const source = c.createMediaElementSource(el)
  const panner = c.createPanner()
  configurePanner(panner)
  const master = c.createGain()
  master.gain.value = options.gain ?? 1
  source.connect(panner).connect(master).connect(c.destination)
  const state: InternalState = {
    audioCtx: c, source, panner, master,
    trajectory: options.trajectory,
    startTimeMs: performance.now(),
    rafId: null, stopped: false, loop: false, mediaEl: el,
  }
  applyTrajectory(state)
  return makeHandle(state)
}

function makeHandle(state: InternalState): ASMRPlayHandle {
  return {
    pause: () => {
      if (state.source instanceof AudioBufferSourceNode) {
        // BufferSourceNode can't pause natively — disconnect+reconnect on resume.
        try { state.source.stop() } catch { /* ignore */ }
      } else if (state.mediaEl) {
        state.mediaEl.pause()
      }
    },
    resume: () => {
      if (state.mediaEl) void state.mediaEl.play()
    },
    stop: async () => {
      if (state.stopped) return
      state.stopped = true
      if (state.rafId !== null) cancelAnimationFrame(state.rafId)
      try { if (state.source instanceof AudioBufferSourceNode) state.source.stop() } catch { /* ignore */ }
      try { state.panner.disconnect(); state.master.disconnect() } catch { /* ignore */ }
    },
    setTrajectory: (t) => {
      state.trajectory = t
      state.startTimeMs = performance.now()
    },
    setGain: (g) => {
      const safe = Math.max(0, Math.min(2, g))
      state.master.gain.setTargetAtTime(safe, state.audioCtx.currentTime, 0.05)
    },
    isPlaying: () => !state.stopped,
  }
}
