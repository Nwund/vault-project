// File: src/renderer/services/xyreneSoundEngine.ts
//
// Reusable Xyrene sound-layering engine. Two modes:
//
//   • preview     — schedules a fixed 30s timeline (intro → body → build →
//                   climax → cooldown) for the Settings page test button.
//   • continuous  — loops indefinitely, driven by an externally-set phase
//                   that the host (a video player) updates from video
//                   position / scene state. Used by FloatingVideoPlayer +
//                   future GoonWall / Brainwash players.
//
// Both modes share the same pattern library, plap-priority sample picker,
// and intensity-aware volume correction. Tests sound the same in preview
// as they do in real playback because there's only one engine.
//
// Sample resolution is delegated: callers provide a `resolveUrl(filename)`
// to get a vault:// URL and `resolveMeta(slot, filename)` to get the
// loudness sidecar JSON. That keeps the engine free of IPC plumbing.

export type SoundCategoryName =
  | 'plaps' | 'wet' | 'climax' | 'masturbation' | 'fingering_long'
  | 'spank' | 'squirt' | 'vibrator' | 'vibrator_start' | 'vibrator_stop'
  | 'gasp' | 'heavy_breathing' | 'kiss' | 'giggle' | 'long_moan'
  | 'build_up' | 'post_climax' | 'extras'

export const SLOT_ORDER: SoundCategoryName[] = [
  'giggle', 'kiss', 'gasp',
  'plaps', 'wet', 'spank',
  'masturbation', 'fingering_long', 'vibrator', 'vibrator_start', 'vibrator_stop',
  'long_moan', 'heavy_breathing', 'build_up',
  'climax', 'squirt',
  'post_climax',
  'extras',
]

export interface XyreneSettingsState {
  charactersDir?: string
  cadenceSec?: number
  voiceSample?: string
  arousalSensitivity?: number
  goonWallMasturbationMode?: boolean
  voiceCommandsEnabled?: boolean
  sounds: Record<SoundCategoryName, string[]>
  soundsEnabled?: Record<SoundCategoryName, boolean>
  climaxVoice?: {
    enabled: boolean
    lines: string[]
    /** Optional TTS tuning passed through to the XTTS server. Older
     *  servers ignore unknown fields, so leaving these undefined keeps
     *  the original behavior. Inflection cues let her sound less robotic
     *  — pitch -2 + expression "breathy" reads as sultry; pitch +1 +
     *  expression "moaned" reads as peak climax. */
    speed?: number
    pitch?: number
    expression?: string
  }
}

export interface SoundMeta {
  rmsDb: number
  peakDb: number
  durationSec: number
  intensity: number
}

export type Phase = 'intro' | 'body' | 'build' | 'climax' | 'cooldown'

export interface RhythmPattern {
  name: string
  beats: number[]
  duration: number
  intensity: number
}

export const PLAP_PATTERNS_BODY: RhythmPattern[] = [
  { name: 'edging',       beats: [0, 1.4, 2.7, 3.9],                                        duration: 4.4, intensity: 0.4 },
  { name: 'steady_slow',  beats: [0, 0.8, 1.6, 2.4, 3.2],                                   duration: 3.6, intensity: 0.45 },
  { name: 'rolling',      beats: [0, 0.7, 1.3, 1.7, 2.0, 2.4, 3.0],                         duration: 3.4, intensity: 0.55 },
  { name: 'burst_3',      beats: [0, 0.18, 0.36],                                           duration: 0.6, intensity: 0.65 },
  { name: 'erratic',      beats: [0, 0.5, 0.7, 1.5, 1.7, 1.9, 2.6, 2.8],                    duration: 3.2, intensity: 0.55 },
  { name: 'steady_med',   beats: [0, 0.55, 1.1, 1.65, 2.2, 2.75],                           duration: 3.0, intensity: 0.55 },
]

export const PLAP_PATTERNS_BUILDUP: RhythmPattern[] = [
  { name: 'build_accel',  beats: [0, 0.6, 1.1, 1.5, 1.85, 2.15, 2.4, 2.6, 2.78, 2.94, 3.08], duration: 3.3, intensity: 0.7 },
  { name: 'burst_5',      beats: [0, 0.16, 0.32, 0.48, 0.64],                                duration: 0.85, intensity: 0.75 },
  { name: 'steady_fast',  beats: [0, 0.32, 0.64, 0.96, 1.28, 1.6, 1.92, 2.24, 2.56],         duration: 2.8, intensity: 0.7 },
  { name: 'pause_burst',  beats: [0, 0.18, 0.34, 0.5, 1.6, 1.78, 1.94, 2.1, 2.26],           duration: 2.5, intensity: 0.78 },
  { name: 'rapid_roll',   beats: [0, 0.22, 0.44, 0.66, 0.88, 1.1, 1.32, 1.54, 1.76, 1.98],   duration: 2.2, intensity: 0.75 },
]

export function pickPattern(pool: RhythmPattern[]): RhythmPattern {
  return pool[Math.floor(Math.random() * pool.length)]
}

export function pickByIntensity(
  filenames: string[],
  metaMap: Map<string, SoundMeta>,
  target: number,
): string | null {
  if (filenames.length === 0) return null
  if (filenames.length === 1) return filenames[0]
  const withMeta = filenames.filter((f) => metaMap.has(f))
  if (withMeta.length === 0) {
    return filenames[Math.floor(Math.random() * filenames.length)]
  }
  const ranked = withMeta
    .map((f) => ({ f, dist: Math.abs((metaMap.get(f) as SoundMeta).intensity - target) }))
    .sort((a, b) => a.dist - b.dist)
  const top = ranked.slice(0, Math.min(3, ranked.length))
  return top[Math.floor(Math.random() * top.length)].f
}

// Phase → target intensity mapping. The picker biases sample selection
// toward samples with intensity close to this number.
const PHASE_INTENSITY: Record<Phase, number> = {
  intro: 0.20,
  body: 0.50,
  build: 0.75,
  climax: 0.95,
  cooldown: 0.25,
}

// Phase → base volume for plap pattern beats. Climax samples are the
// loudest by design; body/cooldown stay subdued.
const PHASE_PLAP_VOLUME: Record<Phase, number> = {
  intro: 0.35,
  body: 0.55,
  build: 0.7,
  climax: 0.85,
  cooldown: 0.3,
}

export interface EngineConfig {
  settings: XyreneSettingsState
  resolveUrl: (filename: string) => Promise<string | null>
  resolveMeta: (slot: SoundCategoryName, filename: string) => Promise<SoundMeta | null>
  // Optional: synthesize a voice line via XTTS in Xyrene's cloned voice.
  // When provided AND settings.climaxVoice.enabled is true, the climax
  // burst overlays a synthesized vocal on top of the sample layers.
  synthVoice?: (
    text: string,
    voiceSample: string,
    opts?: { speed?: number; pitch?: number; expression?: string }
  ) => Promise<{ base64: string; mime: string } | null>
  // Master volume (0-1). All event volumes get multiplied by this. Lets
  // the host duck the engine under TTS commentary if needed.
  masterVolume?: number
  // Called when the engine transitions phase OR finishes a one-shot
  // (climax burst, vibrator_stop). Lets the host mirror state in UI.
  onEvent?: (event: { type: 'phase' | 'climax-fired' | 'stopped'; phase?: Phase }) => void
}

export class XyreneSoundEngine {
  private config: EngineConfig
  private metaMap: Map<string, SoundMeta> = new Map()
  private filenameToSlot: Map<string, SoundCategoryName> = new Map()

  private currentPhase: Phase = 'intro'
  private running = false
  private paused = false

  // Outstanding scheduled callbacks + audio elements so we can tear
  // everything down on stop().
  private timers: Set<ReturnType<typeof setTimeout>> = new Set()
  private audios: Set<HTMLAudioElement> = new Set()

  // Per-loop intervals for accent layers (long_moan / wet / heavy_breathing).
  // Stored separately so phase changes can re-tune them.
  private accentTimers: Map<string, ReturnType<typeof setTimeout>> = new Map()

  // Vibrator continuous-loop scheduler.
  private vibratorTimer: ReturnType<typeof setTimeout> | null = null
  private vibratorActive = false

  constructor(config: EngineConfig) {
    this.config = config
  }

  async start(): Promise<void> {
    if (this.running) return
    this.running = true
    await this.loadMeta()
    this.buildFilenameToSlotMap()

    // Kick off the rhythm loop and accent layers. Each runs independently
    // so they overlap naturally. Layers cover ALL 18 SFX categories the
    // user toggles in Settings; the per-slot soundsEnabled flag in
    // `live()` skips slots with no picks or that the user turned off.
    this.loopPlapRhythm()
    this.loopAccent('long_moan', 5500, 11000, 0.6)
    this.loopAccent('wet', 6000, 12000, 0.5)
    this.loopAccent('heavy_breathing', 8000, 16000, 0.35)
    this.loopAccent('build_up', 18000, 30000, 0.6)   // sparse during body, denser via setPhase('build')
    this.loopAccent('gasp', 7000, 14000, 0.55)        // breath spike — common throughout
    this.loopAccent('spank', 12000, 24000, 0.7)       // sharp accent, sparse so it stays a punctuation
    this.loopAccent('kiss', 11000, 22000, 0.4)        // intimate, body/build phases mainly
    this.loopAccent('giggle', 15000, 30000, 0.35)     // wild-card playful color, very sparse
    this.loopAccent('extras', 22000, 45000, 0.5)      // user's custom catch-all bucket

    // If vibrator is enabled, start it.
    if ((this.config.settings.soundsEnabled?.vibrator ?? true)
      && (this.config.settings.sounds.vibrator?.length ?? 0) > 0) {
      this.startVibrator()
    }
  }

  stop(): void {
    if (!this.running) return
    this.running = false
    for (const t of this.timers) clearTimeout(t)
    this.timers.clear()
    for (const t of this.accentTimers.values()) clearTimeout(t)
    this.accentTimers.clear()
    if (this.vibratorTimer) { clearTimeout(this.vibratorTimer); this.vibratorTimer = null }
    this.vibratorActive = false
    for (const a of this.audios) {
      try { a.pause(); a.removeAttribute('src'); a.load() } catch { /* ignore */ }
    }
    this.audios.clear()
    this.config.onEvent?.({ type: 'stopped' })
  }

  pause(): void {
    if (!this.running || this.paused) return
    this.paused = true
    for (const a of this.audios) {
      try { a.pause() } catch { /* ignore */ }
    }
  }

  resume(): void {
    if (!this.running || !this.paused) return
    this.paused = false
    // In-flight Audio nodes have already played or finished; just keep
    // the scheduler running. New events will spawn fresh audios.
  }

  setPhase(phase: Phase): void {
    if (phase === this.currentPhase) return
    const prev = this.currentPhase
    this.currentPhase = phase
    this.config.onEvent?.({ type: 'phase', phase })

    // Climax fires a one-shot burst (climax + squirt + long_moan layered).
    if (phase === 'climax') this.fireClimaxBurst()
    // Cooldown stops the vibrator and starts post-climax aftercare bed.
    if (phase === 'cooldown') {
      if (this.vibratorActive) this.stopVibrator()
      if (prev !== 'cooldown') {
        const t = this.accentTimers.get('post_climax')
        if (t) clearTimeout(t)
        this.loopAccent('post_climax', 4000, 9000, 0.5)
      }
    } else if (prev === 'cooldown') {
      // Leaving cooldown — quiet the post-climax bed.
      const t = this.accentTimers.get('post_climax')
      if (t) { clearTimeout(t); this.accentTimers.delete('post_climax') }
    }
    // Build phase wakes up build_up samples more often.
    if (phase === 'build' && prev !== 'build') {
      const t = this.accentTimers.get('build_up')
      if (t) clearTimeout(t)
      this.loopAccent('build_up', 4500, 9000, 0.7)
    }
  }

  setMasterVolume(v: number): void {
    this.config.masterVolume = Math.max(0, Math.min(1, v))
  }

  dispose(): void {
    this.stop()
  }

  // ─── Internals ─────────────────────────────────────────────────────────

  private live(slot: SoundCategoryName): string[] {
    if (!(this.config.settings.soundsEnabled?.[slot] ?? true)) return []
    return this.config.settings.sounds[slot] ?? []
  }

  private buildFilenameToSlotMap(): void {
    this.filenameToSlot.clear()
    for (const slot of SLOT_ORDER) {
      for (const f of this.live(slot)) this.filenameToSlot.set(f, slot)
    }
  }

  private async loadMeta(): Promise<void> {
    this.metaMap.clear()
    await Promise.all(
      SLOT_ORDER.flatMap((slot) =>
        this.live(slot).map(async (filename) => {
          try {
            const m = await this.config.resolveMeta(slot, filename)
            if (m && typeof m.intensity === 'number') this.metaMap.set(filename, m)
          } catch { /* leave out */ }
        }),
      ),
    )
  }

  // Compensate for measured loudness so the per-phase volume target lands
  // consistently regardless of how loud or quiet the source sample is.
  private targetVolume(filename: string, phaseVolume: number): number {
    const m = this.metaMap.get(filename)
    const master = this.config.masterVolume ?? 1
    if (!m) return phaseVolume * master
    const adjust = 1 + (0.5 - m.intensity) * 0.6
    return Math.max(0.05, Math.min(1, phaseVolume * adjust)) * master
  }

  // ── Plap rhythm scheduler ─────────────────────────────────────────────
  private loopPlapRhythm = (): void => {
    if (!this.running) return
    const phase = this.currentPhase
    const useVibrator = this.vibratorActive
    const intensity = PHASE_INTENSITY[phase]
    const phaseVol = PHASE_PLAP_VOLUME[phase]

    const plapPool = this.live('plaps')
    const fingeringFallback = [...this.live('fingering_long'), ...this.live('masturbation')]
    if (plapPool.length === 0 && fingeringFallback.length === 0) {
      // Nothing to play — re-poll later in case the user adds picks.
      this.queueTimer(2000, this.loopPlapRhythm)
      return
    }

    const skipChance = useVibrator ? 0.7 : 0
    const patternPool = (phase === 'build' || phase === 'climax')
      ? PLAP_PATTERNS_BUILDUP
      : phase === 'cooldown'
        ? PLAP_PATTERNS_BODY  // body patterns at cooldown, but volumes are low
        : PLAP_PATTERNS_BODY

    if (Math.random() < skipChance) {
      // Skip this pattern — idle gap.
      this.queueTimer(800 + Math.random() * 600, this.loopPlapRhythm)
      return
    }

    const pat = pickPattern(patternPool)
    for (const offset of pat.beats) {
      this.queueTimer(offset * 1000, () => this.fireBeat(pat.intensity, phaseVol))
    }
    const tail = pat.duration + 0.2 + Math.random() * 0.4
    this.queueTimer(tail * 1000, this.loopPlapRhythm)
  }

  private fireBeat(targetIntensity: number, phaseVolume: number): void {
    if (!this.running || this.paused) return
    const plapPool = this.live('plaps')
    const fingeringFallback = [...this.live('fingering_long'), ...this.live('masturbation')]
    const useFingering = plapPool.length === 0
      || (Math.random() < 0.15 && fingeringFallback.length > 0)
    const pool = useFingering ? fingeringFallback : plapPool
    const sample = pickByIntensity(pool, this.metaMap, targetIntensity)
    if (!sample) return
    const slot = this.filenameToSlot.get(sample) ?? 'plaps'
    void this.playSample(sample, slot, this.targetVolume(sample, phaseVolume), 0.9 + Math.random() * 0.2)
  }

  // ── Accent layers (long_moan / wet / heavy_breathing / build_up + more) ──
  private loopAccent(slot: SoundCategoryName, minMs: number, maxMs: number, baseVolume: number): void {
    if (!this.running) return
    const items = this.live(slot)
    if (items.length === 0) {
      // Re-poll periodically; user may add picks mid-session.
      this.accentTimers.set(slot, setTimeout(() => this.loopAccent(slot, minMs, maxMs, baseVolume), 4000))
      return
    }
    const phase = this.currentPhase
    // Phase gates — keep sounds feeling natural to the moment.
    //   spank: rough body/build only; out of place in intro + cooldown
    //   kiss: intimate phases only — body / build
    //   giggle: playful early phases only (intro / body)
    //   gasp: any phase except cooldown
    //   extras: skip during climax to avoid stepping on the burst
    const phaseSkip =
      (slot === 'spank' && (phase === 'intro' || phase === 'cooldown')) ||
      (slot === 'kiss' && (phase === 'climax' || phase === 'cooldown')) ||
      (slot === 'giggle' && (phase === 'climax' || phase === 'cooldown')) ||
      (slot === 'gasp' && phase === 'cooldown') ||
      (slot === 'extras' && phase === 'climax')
    if (!phaseSkip) {
      const intensity = PHASE_INTENSITY[phase]
      const sample = pickByIntensity(items, this.metaMap, intensity)
      if (sample && !this.paused) {
        void this.playSample(sample, slot, this.targetVolume(sample, baseVolume), 0.95 + Math.random() * 0.1)
      }
    }
    const next = minMs + Math.random() * (maxMs - minMs)
    this.accentTimers.set(slot, setTimeout(() => this.loopAccent(slot, minMs, maxMs, baseVolume), next))
  }

  // ── Vibrator continuous loop ──────────────────────────────────────────
  private startVibrator(): void {
    if (this.vibratorActive) return
    this.vibratorActive = true
    const startSample = pickByIntensity(this.live('vibrator_start'), this.metaMap, 0.5)
    if (startSample) {
      void this.playSample(startSample, 'vibrator_start', this.targetVolume(startSample, 0.55), 1)
    }
    this.scheduleVibratorBeat()
  }

  private scheduleVibratorBeat(): void {
    if (!this.vibratorActive || !this.running) return
    const items = this.live('vibrator')
    if (items.length === 0) {
      this.vibratorActive = false
      return
    }
    if (!this.paused) {
      const v = pickByIntensity(items, this.metaMap, PHASE_INTENSITY[this.currentPhase])
      if (v) void this.playSample(v, 'vibrator', this.targetVolume(v, 0.4), 1)
    }
    const next = 1800 + Math.random() * 600
    this.vibratorTimer = setTimeout(() => this.scheduleVibratorBeat(), next)
  }

  private stopVibrator(): void {
    if (!this.vibratorActive) return
    this.vibratorActive = false
    if (this.vibratorTimer) { clearTimeout(this.vibratorTimer); this.vibratorTimer = null }
    const stopSample = pickByIntensity(this.live('vibrator_stop'), this.metaMap, 0.5)
    if (stopSample) {
      void this.playSample(stopSample, 'vibrator_stop', this.targetVolume(stopSample, 0.5), 1)
    }
  }

  // ── Climax one-shot ───────────────────────────────────────────────────
  private fireClimaxBurst(): void {
    const climaxSample = pickByIntensity(this.live('climax'), this.metaMap, 0.95)
    if (climaxSample) {
      void this.playSample(climaxSample, 'climax', this.targetVolume(climaxSample, 0.85), 1)
    }
    const squirtSample = pickByIntensity(this.live('squirt'), this.metaMap, 0.85)
    if (squirtSample) {
      this.queueTimer(600, () => {
        if (this.running) void this.playSample(squirtSample, 'squirt', this.targetVolume(squirtSample, 0.65), 1)
      })
    }
    const peakMoan = pickByIntensity(this.live('long_moan'), this.metaMap, 0.9)
    if (peakMoan) {
      this.queueTimer(300, () => {
        if (this.running) void this.playSample(peakMoan, 'long_moan', this.targetVolume(peakMoan, 0.75), 1)
      })
    }

    // Cloned-voice climax line — XTTS synth in Xyrene's cloned voice
    // overlaid on top of the sample bursts. Fires async so it doesn't
    // block the burst itself; the request takes 1-3s and the resulting
    // audio plays whenever it's ready (typically 1-2s into the burst).
    void this.maybeSynthesizeClimaxVoice()

    this.config.onEvent?.({ type: 'climax-fired' })
  }

  // Rolling cache of the last N climax lines fired so we don't say the
  // same thing twice in a row (or three times if a small pool). Kept
  // tight at 4 entries — large enough to cover any 5-line pool.
  private recentClimaxLines: string[] = []
  private readonly RECENT_CLIMAX_CAP = 4

  /**
   * Pick the next climax line, biased away from anything recently said.
   * If every remaining option has been used, fall back to a random pick
   * over the full pool so we don't deadlock on a tiny line list.
   */
  private pickClimaxLine(pool: string[]): string {
    const fresh = pool.filter((l) => !this.recentClimaxLines.includes(l))
    const choices = fresh.length > 0 ? fresh : pool
    const line = choices[Math.floor(Math.random() * choices.length)]
    this.recentClimaxLines.push(line)
    if (this.recentClimaxLines.length > this.RECENT_CLIMAX_CAP) {
      this.recentClimaxLines.shift()
    }
    return line
  }

  private async maybeSynthesizeClimaxVoice(): Promise<void> {
    const cv = this.config.settings.climaxVoice
    if (!cv?.enabled || !this.config.synthVoice) return
    const lines = cv.lines?.filter((l) => l && l.trim().length > 0) ?? []
    if (lines.length === 0) return
    const line = this.pickClimaxLine(lines)
    const voice = this.config.settings.voiceSample || 'xyrene.wav'
    // Phase-driven TTS tuning. If the user has set baseline tuning in
    // climaxVoice, layer phase-specific adjustments on top so her
    // delivery shifts from intimate (intro) to peak (climax) without
    // requiring manual line-pool segmentation.
    const baseSpeed = cv.speed ?? 1.0
    const basePitch = cv.pitch ?? 0
    const phaseSpeed = this.currentPhase === 'climax' ? 1.0
      : this.currentPhase === 'build' ? 0.97
      : this.currentPhase === 'body' ? 0.93
      : 0.9
    const phasePitch = this.currentPhase === 'climax' ? 1.0
      : this.currentPhase === 'build' ? 0.5
      : this.currentPhase === 'body' ? 0.0
      : -1.0
    const phaseExpr = cv.expression ?? (
      this.currentPhase === 'climax' ? 'moaned'
      : this.currentPhase === 'build' ? 'breathy'
      : 'sultry'
    )
    try {
      const result = await this.config.synthVoice(line, voice, {
        speed: baseSpeed * phaseSpeed,
        pitch: basePitch + phasePitch,
        expression: phaseExpr,
      })
      if (!result?.base64 || !this.running || this.paused) return
      const url = `data:${result.mime};base64,${result.base64}`
      const audio = new Audio(url)
      // Phase-scaled climax volume — when fired during 'climax' phase
      // (the normal case) it lands at full intensity; during earlier
      // phases the engine triggers from manual climax commands and the
      // voice rides lower so she doesn't blow out the mix. Multiplied
      // by master volume on top of that.
      const master = this.config.masterVolume ?? 1
      const phaseGain = this.currentPhase === 'climax' ? 1.0
        : this.currentPhase === 'build' ? 0.85
        : this.currentPhase === 'body' ? 0.7
        : 0.55
      const target = Math.max(0, Math.min(1, 0.95 * master * phaseGain))
      // Fade in from silence over ~280ms so her voice enters the burst
      // smoothly instead of slamming on. The first frame is ~silent;
      // subsequent frames ramp up linearly to the target.
      audio.volume = 0
      const FADE_MS = 280
      const startedAt = performance.now()
      const fade = () => {
        if (!this.running || this.paused) return
        const elapsed = performance.now() - startedAt
        const t = Math.min(1, elapsed / FADE_MS)
        // Ease-out for a softer attack
        const eased = 1 - Math.pow(1 - t, 2)
        audio.volume = Math.max(0, Math.min(1, target * eased))
        if (t < 1) requestAnimationFrame(fade)
      }
      requestAnimationFrame(fade)
      audio.onended = () => {
        try { audio.removeAttribute('src'); audio.load() } catch { /* ignore */ }
        this.audios.delete(audio)
      }
      this.audios.add(audio)
      await audio.play().catch(() => { /* autoplay quirks */ })
    } catch (err) {
      console.warn('[XyreneSoundEngine] climax voice synth failed:', err)
    }
  }

  // ── Plumbing ──────────────────────────────────────────────────────────
  private queueTimer(ms: number, fn: () => void): void {
    const t = setTimeout(() => {
      this.timers.delete(t)
      if (this.running) fn()
    }, ms)
    this.timers.add(t)
  }

  private async playSample(filename: string, _slot: SoundCategoryName, volume: number, rate: number): Promise<void> {
    if (this.paused) return
    const url = await this.config.resolveUrl(filename)
    if (!url || !this.running || this.paused) return
    try {
      const audio = new Audio(url)
      audio.volume = Math.max(0, Math.min(1, volume))
      audio.playbackRate = Math.max(0.5, Math.min(2, rate))
      audio.onended = () => {
        try { audio.removeAttribute('src'); audio.load() } catch { /* ignore */ }
        this.audios.delete(audio)
      }
      this.audios.add(audio)
      await audio.play().catch(() => { /* autoplay quirks */ })
    } catch { /* swallow */ }
  }
}
