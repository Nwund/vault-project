// File: src/renderer/components/XyreneSettings.tsx
//
// Settings panel for Watch With Xyrene + the planned sound-engine. Exposes:
//   - Health row (XTTS server + character bible reachability)
//   - Cadence slider (seconds between vision calls)
//   - Arousal sensitivity slider
//   - GoonWall masturbation mode + voice-commands toggles
//   - Character bible directory (path + reload)
//   - Six sound-slot sections (plaps / wet / moans / climax / masturbation / extras)
//
// Sound flow per user spec (2026-05-09):
//   1. User opens an "Add" picker for a slot.
//   2. Picker shows the available files in the soundpack manifest, filtered
//      by the slot's expected category keywords.
//   3. On select: file is auto-PLAYED for preview AND copied into
//      `userData/xyrene_curated/<cat>/` with a renamed filename like
//      `xyreneplap1.wav`. The renamed path is added to the slot's array.
//   4. The original soundpack file is left untouched.

import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { Volume2, X, Plus, RefreshCw, Sparkles, AlertCircle, Loader2, Mic, Brain, Save, Check, Wand2, Play, Square, FolderOpen, Upload, FileAudio } from 'lucide-react'
import { useToast } from '../contexts'

// ─── Session preview engine ─────────────────────────────────────────────────
//
// Schedules a 30-second timeline of overlapping audio events that mirrors
// what a real Xyrene play session sounds like with the user's picks. Acts
// as both a usability check ("does my picked plap actually sound right?")
// AND the prototype for the full sound-layering engine (task #38).
//
// Phase plan (in seconds):
//   0.0 – 4.0   Intro      kiss / giggle / heavy_breathing
//   4.0 – 14.0  Body       plap+wet rhythm OR vibrator loop (mutex rule)
//                          + scattered moans
//  14.0 – 22.0  Build-up   accelerating rhythm + build_up + long_moan
//  22.0 – 26.0  Climax     climax + squirt + long_moan peak
//  26.0 – 30.0  Cooldown   post_climax + heavy_breathing + giggle
//
// Mutex rules:
//   - vibrator enabled  → bias body to 80% vibrator / 20% plap+fingering
//   - vibrator disabled → body uses plaps + fingering_long + masturbation
//   - fingering pattern uses BOTH plaps and fingering_long for variety
//
// Slots that are muted (soundsEnabled[slot] === false) OR empty
// (sounds[slot].length === 0) get skipped entirely — no random fallback.
//
// Returned controller exposes stop(); the engine cleans up Audio elements
// on stop(), end-of-timeline, or unmount.

interface PreviewEvent {
  startMs: number
  url: string
  volume?: number
  rate?: number
  slot: string
}

interface PreviewController {
  stop: () => void
  durationMs: number
}

interface SoundMeta {
  rmsDb: number
  peakDb: number
  durationSec: number
  intensity: number  // 0-1
}

function pickOne<T>(arr: T[]): T | null {
  return arr.length === 0 ? null : arr[Math.floor(Math.random() * arr.length)]
}

// ─── Plap rhythm patterns ──────────────────────────────────────────────────
//
// Real masturbation isn't metronomic — someone naturally varies pace: a
// steady stroke, then a short burst, then a pause, then a roll into faster
// strokes, then edging slowdown. Each pattern below is a list of beat
// offsets (seconds) relative to its own start. The scheduler chains them
// back-to-back through the body / build-up phases, with small randomised
// gaps between patterns.
//
// Pattern selection is weighted per phase: body prefers slow/steady/rolling,
// build-up prefers fast/burst/build. Plaps are sampled with strong priority
// — fingering_long and masturbation only get ~15% of beats for texture.

interface RhythmPattern {
  name: string
  beats: number[]    // offset seconds for each hit (first beat at 0)
  duration: number   // total span (last beat + tail)
  intensity: number  // 0-1 sample intensity target for this pattern
}

const PLAP_PATTERNS_BODY: RhythmPattern[] = [
  { name: 'edging',       beats: [0, 1.4, 2.7, 3.9],                                        duration: 4.4, intensity: 0.4 },
  { name: 'steady_slow',  beats: [0, 0.8, 1.6, 2.4, 3.2],                                   duration: 3.6, intensity: 0.45 },
  { name: 'rolling',      beats: [0, 0.7, 1.3, 1.7, 2.0, 2.4, 3.0],                         duration: 3.4, intensity: 0.55 },
  { name: 'burst_3',      beats: [0, 0.18, 0.36],                                           duration: 0.6, intensity: 0.65 },
  { name: 'erratic',      beats: [0, 0.5, 0.7, 1.5, 1.7, 1.9, 2.6, 2.8],                    duration: 3.2, intensity: 0.55 },
  { name: 'steady_med',   beats: [0, 0.55, 1.1, 1.65, 2.2, 2.75],                           duration: 3.0, intensity: 0.55 },
]

const PLAP_PATTERNS_BUILDUP: RhythmPattern[] = [
  { name: 'build_accel',  beats: [0, 0.6, 1.1, 1.5, 1.85, 2.15, 2.4, 2.6, 2.78, 2.94, 3.08], duration: 3.3, intensity: 0.7 },
  { name: 'burst_5',      beats: [0, 0.16, 0.32, 0.48, 0.64],                               duration: 0.85, intensity: 0.75 },
  { name: 'steady_fast',  beats: [0, 0.32, 0.64, 0.96, 1.28, 1.6, 1.92, 2.24, 2.56],        duration: 2.8, intensity: 0.7 },
  { name: 'pause_burst',  beats: [0, 0.18, 0.34, 0.5, 1.6, 1.78, 1.94, 2.1, 2.26],          duration: 2.5, intensity: 0.78 },
  { name: 'rapid_roll',   beats: [0, 0.22, 0.44, 0.66, 0.88, 1.1, 1.32, 1.54, 1.76, 1.98],  duration: 2.2, intensity: 0.75 },
]

function pickPattern(pool: RhythmPattern[]): RhythmPattern {
  return pool[Math.floor(Math.random() * pool.length)]
}

// Intensity-aware picker. Given a list of filenames and a target intensity
// (0-1), prefer files whose measured intensity is close to the target.
// Falls back to pure-random when no meta is available for ANY of the files.
//
// Sampling: take the 3 closest matches and pick one at random from those —
// keeps variety while respecting the target. With <3 candidates, just pick
// the closest.
function pickByIntensity(
  filenames: string[],
  metaMap: Map<string, SoundMeta>,
  target: number,
): string | null {
  if (filenames.length === 0) return null
  if (filenames.length === 1) return filenames[0]
  const withMeta = filenames.filter((f) => metaMap.has(f))
  if (withMeta.length === 0) {
    // No measurements yet — random fallback.
    return pickOne(filenames)
  }
  // Score = distance from target. Lower is better.
  const ranked = withMeta
    .map((f) => ({ f, dist: Math.abs((metaMap.get(f) as SoundMeta).intensity - target) }))
    .sort((a, b) => a.dist - b.dist)
  const top = ranked.slice(0, Math.min(3, ranked.length))
  return top[Math.floor(Math.random() * top.length)].f
}

async function startSessionPreview(
  settings: XyreneSettingsState,
  resolveUrl: (filename: string) => Promise<string | null>,
  resolveMeta: (slot: SoundCategoryName, filename: string) => Promise<SoundMeta | null>,
  onEnd: () => void,
): Promise<PreviewController> {
  // Resolve which slots actually contribute (enabled AND non-empty).
  const live = (slot: SoundCategoryName): string[] => {
    if (!(settings.soundsEnabled?.[slot] ?? true)) return []
    return settings.sounds[slot] ?? []
  }

  // Resolve meta for every live filename in parallel. Failures (missing
  // sidecar JSON) just leave that filename out of metaMap — picker falls
  // back to random for those.
  const metaMap = new Map<string, SoundMeta>()
  await Promise.all(
    SLOT_ORDER.flatMap((slot) =>
      live(slot).map(async (filename) => {
        try {
          const meta = await resolveMeta(slot, filename)
          if (meta && typeof meta.intensity === 'number') metaMap.set(filename, meta)
        } catch { /* leave out */ }
      }),
    ),
  )

  // Wrapper for the picker — takes a slot's filenames and a target.
  const pickI = (filenames: string[], target: number) => pickByIntensity(filenames, metaMap, target)

  const useVibrator = live('vibrator').length > 0
  const plapPool = live('plaps')
  const fingeringFallback = [...live('fingering_long'), ...live('masturbation')]
  const fingeringPlayChance = useVibrator ? 0.2 : 1.0  // mutex bias

  // Plap-priority beat sampler. Defaults to plaps; only dips into
  // fingering_long / masturbation ~15% of the time for texture, AND only
  // when plaps actually exist. Returns the chosen sample plus its true
  // slot (so the volume-correction lookup uses the right meta).
  const pickBeat = (intensity: number): { sample: string | null; slot: SoundCategoryName } => {
    const useFingering = plapPool.length === 0
      || (Math.random() < 0.15 && fingeringFallback.length > 0)
    const pool = useFingering ? fingeringFallback : plapPool
    const sample = pickByIntensity(pool, metaMap, intensity)
    if (!sample) return { sample: null, slot: 'plaps' }
    const slot: SoundCategoryName =
      live('fingering_long').includes(sample) ? 'fingering_long'
      : live('masturbation').includes(sample) ? 'masturbation'
      : 'plaps'
    return { sample, slot }
  }

  // Schedule a sequence of rhythm patterns over the [start, end] window.
  // Patterns get chained back-to-back with a small randomised gap. When
  // mutex is biased (vibrator on), the loop occasionally skips a whole
  // pattern instead of playing it — simulates "she's mostly using the
  // toy with the occasional fingering reach-around".
  const schedulePatterns = (
    start: number,
    end: number,
    pool: RhythmPattern[],
    options: { phaseVolume?: number; pitchJitter?: number; skipChance?: number } = {},
  ) => {
    const phaseVolume = options.phaseVolume ?? 0.6
    const pitchJitter = options.pitchJitter ?? 0.2
    const skipChance = options.skipChance ?? 0
    let t = start
    while (t < end) {
      const pat = pickPattern(pool)
      // Skip this pattern slot entirely (mutex bias when vibrator's on)
      if (skipChance > 0 && Math.random() < skipChance) {
        t += pat.duration + 0.3 + Math.random() * 0.6
        continue
      }
      for (const offset of pat.beats) {
        const beatT = t + offset
        if (beatT >= end) break
        const { sample, slot } = pickBeat(pat.intensity)
        if (sample) {
          push(
            beatT,
            slot,
            sample,
            targetVolume(sample, phaseVolume),
            1 - pitchJitter / 2 + Math.random() * pitchJitter,
          )
        }
      }
      // Natural gap between patterns: 0.2-0.6s
      t += pat.duration + 0.2 + Math.random() * 0.4
    }
  }

  const events: Array<Omit<PreviewEvent, 'url'> & { filename: string }> = []
  const push = (t: number, slot: SoundCategoryName, filename: string, volume = 0.55, rate = 1) => {
    events.push({ startMs: Math.round(t * 1000), slot, filename, volume, rate })
  }
  // Compensate for measured loudness — quiet samples get boosted toward
  // the slot's intended phase volume, loud ones get pulled back. Keeps a
  // peaky climax sample from blowing speakers vs. a soft moan getting lost.
  const targetVolume = (filename: string, phaseVolume: number): number => {
    const m = metaMap.get(filename)
    if (!m) return phaseVolume
    // Aim for a perceived level that scales with phaseVolume. A sample at
    // intensity 0.5 plays at exactly phaseVolume; intensity 1.0 gets cut
    // by ~30%, intensity 0.0 gets boosted by ~30% (capped at 1.0).
    const adjust = 1 + (0.5 - m.intensity) * 0.6
    return Math.max(0.05, Math.min(1, phaseVolume * adjust))
  }

  // Phase intensity targets (target sample intensity per phase):
  //   intro   0.20  — quiet, soft, intimate
  //   body    0.50  — moderate, sustainable
  //   build   0.75  — louder, urgent
  //   climax  0.95  — peak intensity samples preferred
  //   cooldown 0.25 — soft, breathy, settling

  // ── Intro 0-4s ─────────────────────────────────────────────────────────
  const giggleSample = pickI(live('giggle'), 0.2)
  if (giggleSample) push(0.2, 'giggle', giggleSample, targetVolume(giggleSample, 0.5))
  const kissSample = pickI(live('kiss'), 0.25)
  if (kissSample) push(1.6, 'kiss', kissSample, targetVolume(kissSample, 0.55))
  const breathSample = pickI(live('heavy_breathing'), 0.2)
  if (breathSample) push(2.5, 'heavy_breathing', breathSample, targetVolume(breathSample, 0.4))

  // ── Body 4-14s ─────────────────────────────────────────────────────────
  if (useVibrator) {
    const vibStart = pickI(live('vibrator_start'), 0.5)
    if (vibStart) push(4.0, 'vibrator_start', vibStart, targetVolume(vibStart, 0.55))
    const vibBase = 4.2
    let t = vibBase
    while (t < 13.5) {
      const v = pickI(live('vibrator'), 0.5)
      if (v) push(t, 'vibrator', v, targetVolume(v, 0.4))
      t += 1.8 + Math.random() * 0.6
    }
  }

  // Plap rhythm patterns through the body. Skip-chance kicks in when
  // vibrator is active (she's mostly using the toy).
  if (plapPool.length > 0 || fingeringFallback.length > 0) {
    schedulePatterns(
      useVibrator ? 5.5 : 4.5,
      14,
      PLAP_PATTERNS_BODY,
      { phaseVolume: 0.6, pitchJitter: 0.2, skipChance: useVibrator ? 0.7 : 0 },
    )
  }

  // Wet sounds woven through the body
  for (let i = 0; i < 3; i++) {
    const w = pickI(live('wet'), 0.5)
    if (w) push(5 + i * 3 + Math.random(), 'wet', w, targetVolume(w, 0.45))
  }

  // Scattered long moans through the body — body intensity ~0.5
  const longMoans = live('long_moan')
  for (let i = 0; i < 2; i++) {
    const m = pickI(longMoans, 0.5)
    if (m) push(6 + i * 4 + Math.random(), 'long_moan', m, targetVolume(m, 0.55))
  }

  // ── Build-up 14-22s ────────────────────────────────────────────────────
  const buildUpSamples = live('build_up')
  for (let i = 0; i < 3; i++) {
    const buildIntensity = 0.6 + i * 0.1  // ramps 0.6 → 0.8
    const pool = buildUpSamples.length > 0 ? buildUpSamples : longMoans
    const b = pickI(pool, buildIntensity)
    if (b) push(14.5 + i * 2.5, 'build_up', b, targetVolume(b, 0.6 + i * 0.05))
  }
  // Accelerated rhythm: vibrator stays in continuous loop, plaps switch
  // to the buildup pattern pool (faster bursts, build_accel, rapid_roll).
  if (useVibrator) {
    let t = 14.5
    while (t < 22) {
      const v = pickI(live('vibrator'), 0.7)
      if (v) push(t, 'vibrator', v, targetVolume(v, 0.5))
      t += 1.2
    }
  } else if (plapPool.length > 0 || fingeringFallback.length > 0) {
    schedulePatterns(14.5, 22, PLAP_PATTERNS_BUILDUP, { phaseVolume: 0.7, pitchJitter: 0.18 })
  }
  const gaspSample = pickI(live('gasp'), 0.85)
  if (gaspSample) push(21.5, 'gasp', gaspSample, targetVolume(gaspSample, 0.7))

  // ── Climax 22-26s ──────────────────────────────────────────────────────
  const climaxSample = pickI(live('climax'), 0.95)
  if (climaxSample) push(22.0, 'climax', climaxSample, targetVolume(climaxSample, 0.85))
  const squirtSample = pickI(live('squirt'), 0.85)
  if (squirtSample) push(22.6, 'squirt', squirtSample, targetVolume(squirtSample, 0.65))
  const peakMoan = pickI(longMoans, 0.9)
  if (peakMoan) push(22.3, 'long_moan', peakMoan, targetVolume(peakMoan, 0.7))
  if (useVibrator) {
    const vibStop = pickI(live('vibrator_stop'), 0.5)
    if (vibStop) push(25.0, 'vibrator_stop', vibStop, targetVolume(vibStop, 0.5))
  }

  // ── Cooldown 26-30s ────────────────────────────────────────────────────
  const postClimaxSample = pickI(live('post_climax'), 0.3)
  if (postClimaxSample) push(26.5, 'post_climax', postClimaxSample, targetVolume(postClimaxSample, 0.55))
  const cooldownBreath = pickI(live('heavy_breathing'), 0.25)
  if (cooldownBreath) push(27.5, 'heavy_breathing', cooldownBreath, targetVolume(cooldownBreath, 0.4))
  const cooldownGiggle = pickI(live('giggle'), 0.2)
  if (cooldownGiggle) push(28.8, 'giggle', cooldownGiggle, targetVolume(cooldownGiggle, 0.45))

  // Resolve URLs for every event (parallel). Filter out the ones whose
  // resolver returned null — keeps the timeline clean if a curated file
  // got moved/deleted.
  const resolved: PreviewEvent[] = []
  await Promise.all(
    events.map(async (ev) => {
      const url = await resolveUrl(ev.filename)
      if (url) resolved.push({ startMs: ev.startMs, url, volume: ev.volume, rate: ev.rate, slot: ev.slot })
    }),
  )

  // Schedule playback. Each event spawns a fresh Audio element so they can
  // overlap freely. Tracked so we can stop() everything mid-flight.
  const audios: HTMLAudioElement[] = []
  const timers: ReturnType<typeof setTimeout>[] = []
  let stopped = false
  for (const ev of resolved) {
    const t = setTimeout(() => {
      if (stopped) return
      const a = new Audio(ev.url)
      a.volume = ev.volume ?? 0.6
      a.playbackRate = ev.rate ?? 1
      a.onended = () => { try { a.removeAttribute('src'); a.load() } catch { /* ignore */ } }
      a.play().catch(() => { /* ignore — autoplay quirks */ })
      audios.push(a)
    }, ev.startMs)
    timers.push(t)
  }

  const TOTAL_MS = 30_000
  const endTimer = setTimeout(() => { stop() }, TOTAL_MS + 500)
  timers.push(endTimer)

  function stop() {
    if (stopped) return
    stopped = true
    timers.forEach(clearTimeout)
    for (const a of audios) {
      try { a.pause(); a.removeAttribute('src'); a.load() } catch { /* ignore */ }
    }
    onEnd()
  }

  return { stop, durationMs: TOTAL_MS }
}

type SoundCategoryName =
  | 'plaps' | 'wet' | 'climax' | 'masturbation' | 'fingering_long'
  | 'spank' | 'squirt' | 'vibrator' | 'vibrator_start' | 'vibrator_stop'
  | 'gasp' | 'heavy_breathing' | 'kiss' | 'giggle' | 'long_moan'
  | 'build_up' | 'post_climax' | 'extras'

// Ordered loosely by where in a session they fire — playful → arousal → toy
// loops → escalation → climax → cooldown — so the panel reads top-to-bottom
// like a play arc.
const SLOT_ORDER: SoundCategoryName[] = [
  'giggle', 'kiss', 'gasp',
  'plaps', 'wet', 'spank',
  'masturbation', 'fingering_long', 'vibrator', 'vibrator_start', 'vibrator_stop',
  'long_moan', 'heavy_breathing', 'build_up',
  'climax', 'squirt',
  'post_climax',
  'extras',
]

interface XyreneSettingsState {
  charactersDir: string
  cadenceSec: number
  voiceSample: string
  arousalSensitivity: number
  goonWallMasturbationMode: boolean
  voiceCommandsEnabled: boolean
  sounds: Record<SoundCategoryName, string[]>
  soundsEnabled: Record<SoundCategoryName, boolean>
  climaxVoice?: {
    enabled: boolean
    lines: string[]
  }
}

interface SoundFile {
  filename: string
  intensity: number
  tags: string[]
  subcategory: string | null
  /** Set when the file represents a deduped group; tells the UI how many
   *  near-duplicate variants got folded into this representative. */
  variants?: number
  /** Absolute disk path. Backend resolver prefers this over filename so we
   *  pick the EXACT file the user clicked on (not just the first match by
   *  basename across multiple soundpacks). */
  absolutePath?: string
}

interface SoundCategory {
  name: string
  total: number
  rawTotal?: number
  files: SoundFile[]
}

// Maps Xyrene's category slots → which soundpack categories likely contain
// matching files. The pickers prioritize these but also show "all files"
// if nothing matches (organizer's keyword auto-categorization isn't perfect).
const SLOT_TO_PACK_CATEGORY: Record<SoundCategoryName, string[]> = {
  plaps: ['Plaps', 'Slaps & Impacts', 'Skin Slides', 'Sliding In & Out'],
  wet: ['Wet Sounds', 'Squish & Knots'],
  climax: ['climax', 'Cum'],
  masturbation: ['Fingering & Grinding', 'Handjob & Rubbing'],
  fingering_long: ['Fingering & Grinding', 'Wet Sounds', 'Squish & Knots'],
  spank: ['Slaps & Impacts', 'Spank', 'Whip'],
  squirt: ['Squirt', 'Cum', 'Wet Sounds'],
  vibrator: ['Sex Toys', 'Vibrator', 'Toy'],
  vibrator_start: ['Sex Toys', 'Vibrator', 'Click', 'Mechanical'],
  vibrator_stop: ['Sex Toys', 'Vibrator', 'Click', 'Mechanical'],
  gasp: ['breathing', 'reactions', 'Bodily Functions & Noises'],
  heavy_breathing: ['breathing', 'Bodily Functions & Noises', 'reactions'],
  kiss: ['Oral - Mouth', 'Kiss', 'Suction'],
  giggle: ['reactions', 'Laugh', 'Giggle', 'moans'],
  long_moan: ['moans', 'reactions', 'Oral - Mouth'],
  build_up: ['moans', 'reactions', 'Oral - Mouth'],
  post_climax: ['breathing', 'moans', 'reactions', 'Bodily Functions & Noises'],
  extras: ['Bodily Functions & Noises', 'breathing', 'Furniture & Fabric', 'Music', 'Miscellaneous'],
}

const SLOT_LABELS: Record<SoundCategoryName, string> = {
  plaps: 'Plap Sounds (layer 3 for realism)',
  wet: 'Wet Sounds',
  climax: 'Climax / Orgasm',
  masturbation: 'Masturbation Acts (short / staccato)',
  fingering_long: 'Fingering Long (sustained wet rubbing)',
  spank: 'Spank / Slap',
  squirt: 'Squirt',
  vibrator: 'Vibrator / Wand (continuous)',
  vibrator_start: 'Vibrator Start (motor click + ramp on)',
  vibrator_stop: 'Vibrator Stop (ramp off + click)',
  gasp: 'Gasp / Breath Catch',
  heavy_breathing: 'Heavy Long Breathing',
  kiss: 'Kiss / Smooch',
  giggle: 'Giggle / Playful Laugh',
  long_moan: 'Long Moan (sustained)',
  build_up: 'Build-Up (escalation before climax)',
  post_climax: 'Post-Climax Cooldown',
  extras: 'Extras (cleanup / ambience / props)',
}

const SLOT_HINTS: Record<SoundCategoryName, string> = {
  plaps: 'Pick 3+ samples and the engine layers them at varying tempo so it sounds like real impact, not a single looped slap.',
  wet: 'Friction / squelch sounds woven under the plap rhythm.',
  climax: 'Fired during the climax build. Loudest moan samples land best here.',
  masturbation: 'Short / staccato hand + fingering hits. Engine layers these into the plap rhythm during solo scenes.',
  fingering_long: 'Sustained fingering / wet rubbing samples. Engine pulls from these AND plaps to build the fingering pattern. When vibrator is also enabled, fingering plays less frequently (the two are usually mutually exclusive in real scenes).',
  spank: 'Sharp slaps — distinct from sex-impact plaps. Used during punishment / play moments.',
  squirt: 'Female ejaculation — fired around climax peaks for split-second emphasis.',
  vibrator: 'Continuous toy buzz. The engine loops the cleanest sample under solo / toy scenes.',
  vibrator_start: 'Played once when toy use begins. Mechanical click + motor ramp-on if available.',
  vibrator_stop: 'Played once when toy use ends. Ramp-down + click.',
  gasp: 'Sudden inhales / breath catches during intensity spikes.',
  heavy_breathing: 'Sustained heavy breaths. Loops under longer scenes to keep ambient presence alive between vocal hits.',
  kiss: 'Smooches and suction. Used during oral / intimate close-up moments.',
  giggle: 'Playful laughs / teasing chuckles. Fired during light flirty moments and after surprises.',
  long_moan: 'Drawn-out sustained moans. ALSO used as XTTS reference audio — the engine slices these clips and clones Xyrene\'s voice from them, so any moan she synthesizes matches the timbre + cadence of the samples you pick here. Choose 3-5 of your favourites.',
  build_up: 'Escalating moans / quickening breath. Layered as the engine senses tension rising toward climax.',
  post_climax: 'Cooldown — soft moans, heavy breath, aftercare sounds. Fades the session out instead of cutting silent.',
  extras: 'Catch-all — anything that doesn’t fit a slot above.',
}

// One-shot button that launches the local XTTS server and waits for
// /health to respond. First launch can take 30-60s while Coqui loads
// the XTTS v2 model into VRAM, so the button stays in "starting…" state
// the whole time. `onStarted` runs after the server comes up so the
// parent can re-fetch health and flip the row to green.
function StartXttsButton({ onStarted, showToast }: {
  onStarted: () => void
  showToast: (kind: 'success' | 'error' | 'info' | 'warning', message: string) => void
}) {
  const [busy, setBusy] = useState(false)
  return (
    <button
      onClick={async () => {
        if (busy) return
        setBusy(true)
        showToast('info', 'Starting XTTS server (30-60s on first launch)…')
        try {
          const result = await (window.api as any).xyreneStartServer?.()
          if (result?.ok) {
            showToast('success', 'XTTS server is online')
            onStarted()
          } else if (result?.reason === 'install_not_found') {
            showToast('error', 'xyrene-portable install not found at known paths')
          } else {
            showToast('error', result?.message ?? 'Failed to start XTTS server — check the python console window')
          }
        } catch (err: any) {
          console.error('[XyreneSettings] startServer threw:', err)
          showToast('error', 'Failed to start XTTS server: ' + (err?.message ?? err))
        } finally {
          setBusy(false)
        }
      }}
      disabled={busy}
      className="mt-2 px-3 py-1.5 rounded-md bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-200 text-[11px] font-medium transition disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-1.5"
      title="Launch xyrene-portable/xtts-server/server.py. First launch can take 30-60s to load the model."
    >
      {busy ? <Loader2 size={11} className="animate-spin" /> : <Play size={11} />}
      {busy ? 'Starting server…' : 'Start server'}
    </button>
  )
}

export function XyreneSettings() {
  const { showToast } = useToast()
  const [settings, setSettings] = useState<XyreneSettingsState | null>(null)
  const [sounds, setSounds] = useState<{
    categories: SoundCategory[]
    totalFiles?: number
    totalReturned?: number
    totalFiltered?: number
    totalDeduped?: number
  } | null>(null)
  const [showJunk, setShowJunk] = useState(false)
  const [showVariants, setShowVariants] = useState(false)
  const [health, setHealth] = useState<{ voiceServerOnline: boolean; characterFound: boolean; characterDir: string } | null>(null)
  const [loading, setLoading] = useState(true)
  const [savingPath, setSavingPath] = useState(false)
  const [openPicker, setOpenPicker] = useState<SoundCategoryName | null>(null)
  const [pickerSearch, setPickerSearch] = useState('')
  // Default to "all" so the user sees the full soundpack by default
  // (~32k files across categories). They can narrow to "relevant" or to
  // a specific pack via the dropdown.
  const [pickerCategoryFilter, setPickerCategoryFilter] = useState<string>('all')
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [previewingPath, setPreviewingPath] = useState<string | null>(null)
  // Test-session preview controller. Held in a ref so the unmount cleanup
  // can call .stop() even when state has churned.
  const sessionPreviewRef = useRef<PreviewController | null>(null)
  const [sessionPlaying, setSessionPlaying] = useState(false)
  // Progressive disclosure for the file picker — start at 500 visible,
  // user can click "Show more" to expand. Avoids dumping 35k DOM nodes
  // up front (kills scroll perf) while letting the user reach all files.
  const [pickerLimit, setPickerLimit] = useState(500)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const [s, snd, h] = await Promise.all([
        window.api.ai.xyreneGetSettings(),
        window.api.ai.xyreneListSounds({ dedupe: !showVariants, includeJunk: showJunk }),
        window.api.ai.xyreneHealth(),
      ])
      setSettings(s as XyreneSettingsState)
      setSounds(snd as any)
      setHealth(h)
    } catch (err) {
      console.error('[XyreneSettings] refresh failed:', err)
    } finally {
      setLoading(false)
    }
  }, [showJunk, showVariants])

  useEffect(() => { refresh() }, [refresh])

  // Cleanup audio on unmount.
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current.src = ''
      }
      // Tear down any in-flight session preview on unmount.
      sessionPreviewRef.current?.stop()
      sessionPreviewRef.current = null
    }
  }, [])

  const stopSessionPreview = useCallback(() => {
    sessionPreviewRef.current?.stop()
    sessionPreviewRef.current = null
    setSessionPlaying(false)
  }, [])

  // Reverse map: filename → slot it lives in. The meta-resolver IPC needs
  // the category (subfolder) to find the sidecar JSON. Built fresh per
  // session-start since picks change.
  const buildFilenameToSlot = useCallback((s: XyreneSettingsState): Map<string, SoundCategoryName> => {
    const m = new Map<string, SoundCategoryName>()
    for (const slot of SLOT_ORDER) {
      for (const f of s.sounds[slot] ?? []) m.set(f, slot)
    }
    return m
  }, [])

  const startTestSession = useCallback(async () => {
    if (!settings) return
    if (audioRef.current) {
      try { audioRef.current.pause() } catch { /* ignore */ }
      setPreviewingPath(null)
    }
    sessionPreviewRef.current?.stop()
    setSessionPlaying(true)
    const filenameToSlot = buildFilenameToSlot(settings)
    try {
      const ctrl = await startSessionPreview(
        settings,
        (filename) => window.api.ai.xyrenePreviewSoundUrl(filename),
        async (slot, filename) => {
          // The slot passed by the engine is the slot it's drawing FROM.
          // For shared pools (fingering uses plaps + fingering_long +
          // masturbation), the meta still lives in the file's actual
          // slot folder — use the reverse map.
          const realSlot = filenameToSlot.get(filename) ?? slot
          try {
            return await window.api.ai.xyreneGetSoundMeta({ curatedFilename: filename, category: realSlot })
          } catch { return null }
        },
        () => { sessionPreviewRef.current = null; setSessionPlaying(false) },
      )
      sessionPreviewRef.current = ctrl
    } catch (err) {
      console.error('[XyreneSettings] test session failed:', err)
      setSessionPlaying(false)
    }
  }, [settings, buildFilenameToSlot])

  // Bulk loudness analysis. Walks every curated file lacking a sidecar
  // .meta.json and runs ffmpeg volumedetect on it. Sequential so we don't
  // saturate CPU when there are hundreds of clips.
  const [analyzingAll, setAnalyzingAll] = useState(false)
  const [lastAnalyzeResult, setLastAnalyzeResult] = useState<{ analyzed: number; skipped: number; failed: number } | null>(null)
  // metaCache maps "<slot>::<filename>" → SoundMeta for quick badge lookup
  // in the slot chip list.
  const [metaCache, setMetaCache] = useState<Map<string, SoundMeta>>(new Map())
  const loadMetaForVisible = useCallback(async (s: XyreneSettingsState) => {
    const next = new Map<string, SoundMeta>()
    await Promise.all(
      SLOT_ORDER.flatMap((slot) =>
        (s.sounds[slot] ?? []).map(async (f) => {
          try {
            const m = await window.api.ai.xyreneGetSoundMeta({ curatedFilename: f, category: slot })
            if (m && typeof m.intensity === 'number') next.set(`${slot}::${f}`, m as SoundMeta)
          } catch { /* ignore */ }
        }),
      ),
    )
    setMetaCache(next)
  }, [])

  // Load meta whenever settings change (new pick added → new badge appears
  // once the analyzer auto-runs after curate).
  useEffect(() => {
    if (settings) void loadMetaForVisible(settings)
  }, [settings, loadMetaForVisible])

  const analyzeAll = useCallback(async (force = false) => {
    setAnalyzingAll(true)
    try {
      const res = await window.api.ai.xyreneAnalyzeAllSounds({ force })
      setLastAnalyzeResult(res)
      // Refresh badges after backfill completes
      if (settings) await loadMetaForVisible(settings)
    } catch (err) {
      console.error('[XyreneSettings] analyzeAll failed:', err)
    } finally {
      setAnalyzingAll(false)
    }
  }, [settings, loadMetaForVisible])

  const playPreview = useCallback(async (soundPath: string) => {
    try {
      const url = await window.api.ai.xyrenePreviewSoundUrl(soundPath)
      if (!url) return
      if (!audioRef.current) audioRef.current = new Audio()
      audioRef.current.pause()
      audioRef.current.src = url
      audioRef.current.currentTime = 0
      setPreviewingPath(soundPath)
      audioRef.current.onended = () => setPreviewingPath(null)
      audioRef.current.onerror = () => setPreviewingPath(null)
      await audioRef.current.play()
    } catch (err) {
      console.warn('[XyreneSettings] preview failed:', err)
      setPreviewingPath(null)
    }
  }, [])

  const savePatch = useCallback(async (patch: Partial<XyreneSettingsState>) => {
    try {
      const result: any = await window.api.ai.xyreneSetSettings(patch)
      if (result?.settings) setSettings(result.settings as XyreneSettingsState)
    } catch (err) {
      console.error('[XyreneSettings] save failed:', err)
    }
  }, [])

  const addSoundToSlot = useCallback(async (slot: SoundCategoryName, filename: string) => {
    try {
      const result: any = await window.api.ai.xyreneCurateSound({ sourcePath: filename, category: slot })
      const curatedFilename: string = result?.curatedFilename
      if (!curatedFilename || !settings) return

      // Defensive: the on-disk settings.json may have been written before
      // a new slot existed, so settings.sounds[slot] can be undefined here.
      // Fall back to [] so we don't blow up trying to spread undefined.
      const existing = settings.sounds[slot] ?? []
      const next = {
        ...settings.sounds,
        [slot]: [...existing, curatedFilename],
      }
      await savePatch({ sounds: next })
      // Preview the curated copy so the user immediately hears what was added.
      await playPreview(curatedFilename)
    } catch (err: any) {
      console.error('[XyreneSettings] addSoundToSlot failed:', err)
    }
  }, [settings, savePatch, playPreview])

  const removeFromSlot = useCallback(async (slot: SoundCategoryName, curatedFilename: string) => {
    try {
      await window.api.ai.xyreneUncurateSound({ curatedFilename, category: slot })
      // Refresh settings since the IPC edited them server-side.
      await refresh()
    } catch (err) {
      console.error('[XyreneSettings] removeFromSlot failed:', err)
    }
  }, [refresh])

  // Files filtered for the open picker.
  const filteredFiles = useMemo(() => {
    if (!openPicker || !sounds) return []
    const slot = openPicker
    const relevantCats = new Set(SLOT_TO_PACK_CATEGORY[slot].map((s) => s.toLowerCase()))
    let pool: Array<{ filename: string; pack: string; sub: string | null; intensity: number; tags: string[]; variants?: number; absolutePath?: string }> = []
    for (const cat of sounds.categories) {
      const isRelevant = relevantCats.has(cat.name.toLowerCase()) ||
        cat.name.toLowerCase().includes(slot)
      if (pickerCategoryFilter === 'all' || (pickerCategoryFilter === 'relevant' && isRelevant) || pickerCategoryFilter === cat.name) {
        for (const f of cat.files) pool.push({ filename: f.filename, pack: cat.name, sub: f.subcategory, intensity: f.intensity, tags: f.tags, variants: f.variants, absolutePath: f.absolutePath })
      }
    }
    if (pickerSearch.trim()) {
      const q = pickerSearch.trim().toLowerCase()
      pool = pool.filter((p) => p.filename.toLowerCase().includes(q) || (p.sub ?? '').toLowerCase().includes(q))
    }
    // Sort: filename ascending.
    pool.sort((a, b) => a.filename.localeCompare(b.filename))
    return pool
  }, [openPicker, sounds, pickerSearch, pickerCategoryFilter])

  const visibleFiles = useMemo(() => filteredFiles.slice(0, pickerLimit), [filteredFiles, pickerLimit])
  // Reset the cap whenever search or category filter changes so the user
  // gets a fresh 500-window per filter, not a stale "show all" from before.
  useEffect(() => { setPickerLimit(500) }, [pickerSearch, pickerCategoryFilter, openPicker])

  if (loading || !settings) {
    return (
      <div className="bg-[var(--panel)] rounded-xl border border-[var(--border)] p-6">
        <div className="flex items-center gap-2 text-[var(--muted)]">
          <Loader2 size={14} className="animate-spin" />
          Loading Xyrene settings…
        </div>
      </div>
    )
  }

  const totalCurated = (Object.keys(settings.sounds) as SoundCategoryName[])
    .reduce((acc, k) => acc + (settings.sounds[k]?.length ?? 0), 0)

  return (
    <div className="bg-[var(--panel)] rounded-xl border border-[var(--border)] p-6 space-y-6">
      <div className="flex items-center gap-2">
        <Sparkles size={18} className="text-pink-400" />
        <h2 className="text-lg font-semibold">Xyrene</h2>
        <span className="text-xs text-[var(--muted)] ml-auto">{totalCurated} sounds curated · {sounds?.totalFiles ?? 0} available</span>
      </div>

      {/* Health row */}
      <div className="grid grid-cols-2 gap-3">
        <div className={`p-3 rounded-lg border ${health?.voiceServerOnline ? 'bg-green-500/10 border-green-500/30 text-green-300' : 'bg-amber-500/10 border-amber-500/30 text-amber-300'}`}>
          <div className="flex items-center gap-2 text-xs font-medium">
            {health?.voiceServerOnline ? <Volume2 size={12} /> : <AlertCircle size={12} />}
            XTTS Voice Server
          </div>
          <div className="text-[11px] opacity-80 mt-1">
            {health?.voiceServerOnline ? 'Online · 127.0.0.1:8020' : 'Offline — start xyrene-portable\'s xtts-server'}
          </div>
          {!health?.voiceServerOnline && (
            <StartXttsButton onStarted={() => refresh()} showToast={showToast} />
          )}
        </div>
        <div className={`p-3 rounded-lg border ${health?.characterFound ? 'bg-green-500/10 border-green-500/30 text-green-300' : 'bg-amber-500/10 border-amber-500/30 text-amber-300'}`}>
          <div className="flex items-center gap-2 text-xs font-medium">
            {health?.characterFound ? <Mic size={12} /> : <AlertCircle size={12} />}
            Character Bible
          </div>
          <div className="text-[11px] opacity-80 mt-1 break-all">
            {health?.characterFound ? health.characterDir : `Not found (looking at ${health?.characterDir})`}
          </div>
        </div>
      </div>

      {/* Character dir override */}
      <div>
        <label className="block text-xs text-[var(--muted)] mb-1">Character bible folder (PERSONALITY.md location)</label>
        <div className="flex gap-2">
          <input
            type="text"
            value={settings.charactersDir}
            onChange={(e) => setSettings({ ...settings, charactersDir: e.target.value })}
            placeholder="(auto-detected)"
            className="flex-1 px-3 py-2 rounded-lg bg-white/5 border border-[var(--border)] text-sm focus:outline-none focus:border-pink-400/50"
          />
          <button
            onClick={async () => { setSavingPath(true); await savePatch({ charactersDir: settings.charactersDir }); await refresh(); setSavingPath(false) }}
            disabled={savingPath}
            className="px-3 py-2 rounded-lg bg-pink-500/20 hover:bg-pink-500/30 text-pink-200 text-sm transition disabled:opacity-50"
          >
            {savingPath ? <Loader2 size={14} className="animate-spin" /> : 'Apply'}
          </button>
        </div>
      </div>

      {/* Sliders + toggles */}
      <div className="grid grid-cols-2 gap-4">
        <SliderRow
          label={`Comment cadence (${settings.cadenceSec}s)`}
          hint="How often Xy speaks during watch-along."
          value={settings.cadenceSec}
          min={3} max={30} step={1}
          onChange={(v) => savePatch({ cadenceSec: v })}
        />
        <SliderRow
          label={`Arousal sensitivity (${(settings.arousalSensitivity * 100).toFixed(0)}%)`}
          hint="How quickly her commentary + sound rhythm escalates."
          value={settings.arousalSensitivity}
          min={0} max={1} step={0.05}
          onChange={(v) => savePatch({ arousalSensitivity: v })}
        />
        <ToggleRow
          label="Masturbation mode (any video)"
          hint="Anywhere video plays (Library popup, Feed, GoonWall): blend her commentary with rhythmic plap+moan layering."
          checked={settings.goonWallMasturbationMode}
          onChange={(v) => savePatch({ goonWallMasturbationMode: v })}
        />
        <ToggleRow
          label="Listen for voice commands"
          hint='Respect "keep going", "faster", "finger that pussy" etc. (requires STT — task #41).'
          checked={settings.voiceCommandsEnabled}
          onChange={(v) => savePatch({ voiceCommandsEnabled: v })}
        />
      </div>

      {/* Voice picker — XTTS server already has Xyrene's cloned voice
          (and any variants). This dropdown just lets the user pick which
          one to use + preview it with a fixed test phrase. */}
      <VoicePicker
        currentVoice={settings.voiceSample}
        onChange={(v) => savePatch({ voiceSample: v })}
      />

      {/* Voice intake — drop .wav/.mp3 into a watched folder OR pick a
          file; service silence-trims + denoises + loudness-normalizes,
          copies to xyrene-portable voice_samples/, pre-warms XTTS via
          /cache_voice, and registers metadata. */}
      <VoiceIntakeCard />

      {/* Climax voice — when enabled, the engine overlays an XTTS synth
          in her cloned voice on top of the climax sample burst. User
          edits the line pool below; engine picks one at random per fire. */}
      <ClimaxVoiceEditor
        config={settings.climaxVoice}
        onChange={(cv) => savePatch({ climaxVoice: cv } as any)}
      />

      {/* Her Brain — editable simplified personality files */}
      <BrainEditor />

      {/* Sound slots */}
      <div className="space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-[var(--muted)] uppercase tracking-wider">Sound Library</h3>
            <p className="text-[11px] text-[var(--muted)] mt-1 max-w-xl">
              Test session: plays a 30-second stoppable preview using your picks — intro → plap/vibrator pattern → build-up → climax → cooldown.
              When vibrator is enabled, fingering plays less often (real scenes use one or the other).
            </p>
          </div>
          <div className="flex flex-col items-end gap-2 shrink-0">
            <button
              onClick={sessionPlaying ? stopSessionPreview : startTestSession}
              data-no-ui-sound
              className={`px-4 py-2 rounded-lg text-sm flex items-center gap-2 transition border ${
                sessionPlaying
                  ? 'bg-red-500/20 hover:bg-red-500/30 text-red-200 border-red-400/30'
                  : 'bg-pink-500/20 hover:bg-pink-500/30 text-pink-200 border-pink-400/30'
              }`}
            >
              {sessionPlaying ? <><Square size={14} /> Stop test (30s)</> : <><Play size={14} /> Test session (30s)</>}
            </button>
            <button
              onClick={() => analyzeAll(false)}
              disabled={analyzingAll}
              data-no-ui-sound
              title="Measure loudness/intensity of every curated sound. Engine uses these scores to pick the right sample for each phase."
              className="px-3 py-1.5 rounded-md text-[11px] flex items-center gap-2 transition border bg-white/5 hover:bg-white/10 text-white/70 border-white/10 disabled:opacity-50"
            >
              {analyzingAll ? <><Loader2 size={11} className="animate-spin" /> Analyzing…</> : <><Sparkles size={11} /> Analyze loudness of picks</>}
            </button>
            {lastAnalyzeResult && (
              <span className="text-[10px] text-[var(--muted)]">
                Last: {lastAnalyzeResult.analyzed} analyzed · {lastAnalyzeResult.skipped} cached · {lastAnalyzeResult.failed} failed
              </span>
            )}
          </div>
        </div>
        {SLOT_ORDER.map((slot) => {
          const items = settings.sounds[slot] ?? []
          // Default-on for any slot the persisted settings file doesn't yet
          // know about (older save files won't have the soundsEnabled tree).
          const isEnabled = settings.soundsEnabled?.[slot] ?? true
          const toggleEnabled = () => {
            const nextMap = { ...(settings.soundsEnabled ?? {}), [slot]: !isEnabled } as Record<SoundCategoryName, boolean>
            void savePatch({ soundsEnabled: nextMap })
          }
          return (
            <div key={slot} className={`bg-white/5 rounded-lg border p-4 transition ${isEnabled ? 'border-white/10' : 'border-white/5 opacity-60'}`}>
              <div className="flex items-center justify-between mb-1 gap-3">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium flex items-center gap-2">
                    {SLOT_LABELS[slot]}
                    {!isEnabled && <span className="text-[10px] uppercase tracking-wider text-[var(--muted)] bg-white/5 px-1.5 py-0.5 rounded">muted</span>}
                  </div>
                  <div className="text-[11px] text-[var(--muted)]">{SLOT_HINTS[slot]}</div>
                </div>
                <div className="flex items-center gap-2">
                  {/* On/off switch — when off, engine never plays this slot
                      regardless of how many sounds the user has picked. */}
                  <button
                    onClick={toggleEnabled}
                    title={isEnabled ? 'Mute this category' : 'Unmute this category'}
                    className={`relative inline-flex h-5 w-9 items-center rounded-full transition ${isEnabled ? 'bg-pink-500/70' : 'bg-white/10'}`}
                    data-no-ui-sound
                  >
                    <span className={`inline-block h-3 w-3 transform rounded-full bg-white transition ${isEnabled ? 'translate-x-5' : 'translate-x-1'}`} />
                  </button>
                  <button
                    onClick={() => { setOpenPicker(slot); setPickerSearch(''); setPickerCategoryFilter('all') }}
                    className="px-3 py-1.5 rounded-lg bg-pink-500/20 hover:bg-pink-500/30 text-pink-200 text-xs flex items-center gap-1 transition"
                  >
                    <Plus size={12} /> Add sound
                  </button>
                </div>
              </div>
              <div className="flex flex-wrap gap-2 mt-3">
                {items.length === 0 ? (
                  <span className="text-[11px] text-[var(--muted)] opacity-60 italic">
                    {isEnabled
                      ? 'Empty — engine stays silent for this category until you add a sound.'
                      : 'Muted — engine will skip this category entirely.'}
                  </span>
                ) : (
                  items.map((curatedFilename) => {
                    const meta = metaCache.get(`${slot}::${curatedFilename}`)
                    // Color band: red ≥ 0.7, yellow 0.4-0.7, green < 0.4. Mirrors
                    // how the engine reads the score — red = climax-grade, green
                    // = intro/cooldown-grade.
                    const intensityBadge = meta
                      ? (meta.intensity >= 0.7
                          ? { color: 'bg-red-500/30 text-red-200 border-red-400/30', label: 'loud' }
                          : meta.intensity >= 0.4
                            ? { color: 'bg-yellow-500/25 text-yellow-200 border-yellow-400/30', label: 'med' }
                            : { color: 'bg-emerald-500/25 text-emerald-200 border-emerald-400/30', label: 'soft' })
                      : null
                    return (
                    <div key={curatedFilename} className="flex items-center gap-1 bg-black/30 rounded-md px-2 py-1 border border-white/10" data-no-ui-sound>
                      <button
                        onClick={() => playPreview(curatedFilename)}
                        title="Preview"
                        className="p-0.5 rounded hover:bg-white/10 transition"
                      >
                        <Volume2 size={11} className={previewingPath === curatedFilename ? 'text-pink-400 animate-pulse' : 'text-white/70'} />
                      </button>
                      <span className="text-[11px] font-mono">{curatedFilename}</span>
                      {intensityBadge && (
                        <span
                          className={`text-[9px] font-mono uppercase tracking-wider px-1 rounded border ${intensityBadge.color}`}
                          title={`Measured intensity ${meta!.intensity.toFixed(2)} · peak ${meta!.peakDb.toFixed(1)}dB · ${meta!.durationSec.toFixed(2)}s`}
                        >
                          {intensityBadge.label} {meta!.intensity.toFixed(2)}
                        </span>
                      )}
                      <button
                        onClick={() => removeFromSlot(slot, curatedFilename)}
                        title="Remove"
                        className="p-0.5 rounded hover:bg-red-500/20 transition text-white/50 hover:text-red-300"
                      >
                        <X size={11} />
                      </button>
                    </div>
                  )
                  })
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Soundpack picker modal — data-no-ui-sound suppresses the global
          click chime so the actual preview audio is what the user hears. */}
      {openPicker && sounds && (
        <div
          className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={() => setOpenPicker(null)}
          data-no-ui-sound
        >
          <div
            className="bg-[var(--panel)] rounded-xl border border-[var(--border)] max-w-2xl w-full max-h-[80vh] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b border-white/10">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold">Pick a sound for: <span className="text-pink-300">{SLOT_LABELS[openPicker]}</span></h3>
                <button onClick={() => setOpenPicker(null)} className="p-1.5 rounded hover:bg-white/10"><X size={16} /></button>
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={pickerSearch}
                  onChange={(e) => setPickerSearch(e.target.value)}
                  placeholder="Search filenames or tags…"
                  autoFocus
                  className="flex-1 px-3 py-2 rounded-lg bg-white/5 border border-[var(--border)] text-sm focus:outline-none focus:border-pink-400/50"
                />
                <select
                  value={pickerCategoryFilter}
                  onChange={(e) => setPickerCategoryFilter(e.target.value)}
                  className="px-3 py-2 rounded-lg bg-white/5 border border-[var(--border)] text-sm"
                >
                  <option value="relevant">Relevant categories only</option>
                  <option value="all">All categories</option>
                  {sounds.categories.map((c) => <option key={c.name} value={c.name}>{c.name} ({c.total})</option>)}
                </select>
                <button onClick={refresh} title="Re-scan soundpacks" className="px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 transition">
                  <RefreshCw size={14} />
                </button>
              </div>
              <div className="flex items-center justify-between flex-wrap gap-2 mt-2">
                <div className="text-[11px] text-[var(--muted)]">
                  {filteredFiles.length} match{filteredFiles.length === 1 ? '' : 'es'} · showing first {Math.min(pickerLimit, filteredFiles.length)}
                  {sounds?.totalDeduped ? ` · ${sounds.totalDeduped} variants folded` : ''}
                  {sounds?.totalFiltered ? ` · ${sounds.totalFiltered} junk filtered` : ''}
                </div>
                <div className="flex items-center gap-3 text-[11px]">
                  <label className="flex items-center gap-1 cursor-pointer select-none" title="Show every variant separately instead of folding plap_01/plap_02/plap_03 into one entry">
                    <input
                      type="checkbox"
                      checked={showVariants}
                      onChange={(e) => setShowVariants(e.target.checked)}
                      className="accent-pink-400"
                    />
                    Variants
                  </label>
                  <label className="flex items-center gap-1 cursor-pointer select-none" title="Include Music / Furniture / Wood-impact / Door-slam / etc. that the filter normally hides">
                    <input
                      type="checkbox"
                      checked={showJunk}
                      onChange={(e) => setShowJunk(e.target.checked)}
                      className="accent-pink-400"
                    />
                    Show junk
                  </label>
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-2">
              {filteredFiles.length === 0 ? (
                <div className="p-8 text-center text-[var(--muted)] text-sm">
                  No matching files. Try "All categories" or a different search.
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-1">
                  {visibleFiles.map((f) => {
                    // Prefer absolute path so the right file plays even when
                    // basenames collide across packs (plap_01.wav exists in
                    // both Shinlalala and OpenNSFW SFX).
                    const lookupPath = f.absolutePath || f.filename
                    return (
                      <div key={`${f.pack}/${lookupPath}`} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-white/5 group">
                        <button
                          onClick={() => playPreview(lookupPath)}
                          title="Preview"
                          className="p-1 rounded hover:bg-white/10 transition"
                        >
                          <Volume2 size={12} className={previewingPath === lookupPath ? 'text-pink-400 animate-pulse' : 'text-white/60'} />
                        </button>
                        <span className="text-xs font-mono flex-1 truncate" title={lookupPath}>{f.filename}</span>
                        {f.variants && f.variants > 1 && (
                          <span
                            className="text-[10px] px-1.5 py-0.5 rounded bg-pink-500/20 text-pink-200"
                            title={`${f.variants} near-duplicate files folded into this entry. Toggle "Variants" to see them all separately.`}
                          >
                            +{f.variants - 1} variants
                          </span>
                        )}
                        <span className="text-[10px] text-[var(--muted)] opacity-60">{f.pack}{f.sub ? ` · ${f.sub}` : ''}</span>
                        <button
                          onClick={async () => {
                            await addSoundToSlot(openPicker!, lookupPath)
                            setOpenPicker(null)
                          }}
                          className="px-2 py-1 rounded bg-pink-500/20 hover:bg-pink-500/30 text-pink-200 text-[11px] opacity-0 group-hover:opacity-100 transition"
                        >
                          Add
                        </button>
                      </div>
                    )
                  })}
                  {/* Progressive disclosure — bumping the cap rather than
                      rendering 35k buttons keeps scroll snappy. */}
                  {filteredFiles.length > visibleFiles.length && (
                    <div className="flex items-center justify-center gap-2 py-3">
                      <span className="text-[11px] text-[var(--muted)]">
                        {filteredFiles.length - visibleFiles.length} more — try search to narrow down
                      </span>
                      <button
                        onClick={() => setPickerLimit(l => l + 1500)}
                        className="px-3 py-1 rounded text-[11px] bg-white/5 hover:bg-white/10 transition"
                      >
                        Show {Math.min(1500, filteredFiles.length - visibleFiles.length)} more
                      </button>
                      <button
                        onClick={() => setPickerLimit(filteredFiles.length)}
                        className="px-3 py-1 rounded text-[11px] bg-white/5 hover:bg-white/10 transition"
                      >
                        Show all ({filteredFiles.length})
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

interface BrainEntry {
  id: string
  label: string
  placeholder: string
  content: string
  exists: boolean
  updatedAt: string | null
  path: string
}

/**
 * Editable simplified personality files. One markdown file per category
 * under userData/xyrene_brain/. Each textarea autosaves on blur (and a
 * manual Save button for the impatient). User-written content is sacred —
 * the auto-append path (#44) only appends below a separator marker.
 */
// Voice picker — lists the XTTS server's cloned voice samples and lets
// the user pick + preview. Cloning happens upstream in xyrene-portable;
// this is purely a selector with a synth-and-play preview button.
function VoicePicker({ currentVoice, onChange }: { currentVoice: string; onChange: (v: string) => void }) {
  const [voices, setVoices] = useState<string[] | null>(null)
  const [previewing, setPreviewing] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [metadata, setMetadata] = useState<Record<string, { displayName?: string; description?: string; durationSec?: number | null; source?: string }>>({})
  const audioRef = useRef<HTMLAudioElement | null>(null)

  useEffect(() => {
    let alive = true
    void (async () => {
      try {
        const [list, meta] = await Promise.all([
          window.api.ai.xyreneListVoices(),
          (window.api.ai as any).xyreneVoiceMetadata?.() ?? Promise.resolve({}),
        ])
        if (!alive) return
        setVoices(list)
        setMetadata(meta ?? {})
      } catch (err) {
        if (!alive) return
        setError('XTTS server not reachable — start xyrene-portable first.')
        setVoices([])
      }
    })()
    // Refresh when intake processes a new file.
    const off = (window.api as any).on?.('xyrene:intakeProcessed', async () => {
      try {
        const [list, meta] = await Promise.all([
          window.api.ai.xyreneListVoices(),
          (window.api.ai as any).xyreneVoiceMetadata?.() ?? Promise.resolve({}),
        ])
        if (!alive) return
        setVoices(list)
        setMetadata(meta ?? {})
      } catch { /* ignore */ }
    })
    return () => { alive = false; try { off?.() } catch { /* ignore */ } }
  }, [])

  // Cleanup preview on unmount.
  useEffect(() => () => {
    if (audioRef.current) {
      try { audioRef.current.pause(); audioRef.current.removeAttribute('src'); audioRef.current.load() } catch { /* ignore */ }
    }
  }, [])

  const previewVoice = useCallback(async (voice: string) => {
    setPreviewing(voice)
    setError(null)
    try {
      const result = await window.api.ai.xyrenePreviewVoice({ voice })
      if (!result?.base64) throw new Error('no audio returned')
      const url = `data:${result.mime};base64,${result.base64}`
      if (!audioRef.current) audioRef.current = new Audio()
      audioRef.current.pause()
      audioRef.current.src = url
      audioRef.current.currentTime = 0
      audioRef.current.onended = () => setPreviewing(null)
      audioRef.current.onerror = () => { setPreviewing(null); setError('preview playback failed') }
      await audioRef.current.play()
    } catch (err: any) {
      console.warn('[VoicePicker] preview failed:', err)
      setError(err?.message ?? 'preview failed')
      setPreviewing(null)
    }
  }, [])

  return (
    <div className="bg-white/5 rounded-lg border border-white/10 p-4 space-y-3" data-no-ui-sound>
      <div className="flex items-center gap-2">
        <Mic size={14} className="text-pink-300" />
        <h3 className="text-sm font-semibold text-[var(--muted)] uppercase tracking-wider">Her Voice</h3>
        <span className="text-[10px] text-[var(--muted)] opacity-60 ml-auto">cloned upstream in xyrene-portable</span>
      </div>
      {voices === null ? (
        <div className="text-[11px] text-[var(--muted)] flex items-center gap-2">
          <Loader2 size={11} className="animate-spin" /> Probing XTTS server…
        </div>
      ) : voices.length === 0 ? (
        <div className="text-[11px] text-amber-300">
          {error ?? 'No voice samples found on the XTTS server.'}
        </div>
      ) : (
        <div className="space-y-1.5">
          {voices.map((v) => {
            const isSelected = v === currentVoice
            const isPreviewing = previewing === v
            const meta = metadata[v]
            const display = meta?.displayName?.trim() || v.replace(/\.wav$/i, '')
            const dur = meta?.durationSec
            return (
              <div
                key={v}
                className={`flex items-center gap-2 p-2 rounded-md border transition cursor-pointer ${
                  isSelected
                    ? 'bg-pink-500/15 border-pink-500/40'
                    : 'bg-black/20 border-white/5 hover:bg-white/5'
                }`}
                onClick={() => onChange(v)}
                title={meta?.description ? `${v} — ${meta.description}` : v}
              >
                <div className={`w-3.5 h-3.5 rounded-full border-2 shrink-0 ${isSelected ? 'border-pink-300 bg-pink-400' : 'border-white/30'}`} />
                <div className="flex-1 min-w-0">
                  <div className="text-[12px] font-medium truncate">{display}</div>
                  <div className="text-[10px] text-white/40 font-mono truncate">
                    {v}{typeof dur === 'number' ? ` · ${dur.toFixed(1)}s` : ''}{meta?.source === 'intake' ? ' · intake' : ''}
                  </div>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); void previewVoice(v) }}
                  disabled={isPreviewing}
                  title="Synthesize a test line in this voice"
                  className="p-1 rounded hover:bg-white/10 transition disabled:opacity-40"
                >
                  {isPreviewing
                    ? <Loader2 size={12} className="animate-spin text-pink-300" />
                    : <Volume2 size={12} className="text-white/70" />}
                </button>
              </div>
            )
          })}
        </div>
      )}
      {error && voices && voices.length > 0 && (
        <div className="text-[10px] text-amber-300">{error}</div>
      )}
    </div>
  )
}

// Climax voice editor — toggle + line list. Each saved line gets a
// preview button that synths it via XTTS so the user can audition the
// vibe before committing. Edits go through a textarea below; saving
// commits to settings.
function ClimaxVoiceEditor({ config, onChange }: {
  config: { enabled: boolean; lines: string[] } | undefined
  onChange: (cv: { enabled: boolean; lines: string[] }) => void
}) {
  const enabled = config?.enabled ?? false
  const lines = config?.lines ?? []
  const linesText = useMemo(() => lines.join('\n'), [lines])
  const [draft, setDraft] = useState(linesText)
  useEffect(() => { setDraft(linesText) }, [linesText])
  const dirty = draft !== linesText

  // Preview state — one line at a time. Audio held in ref for cleanup.
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [previewing, setPreviewing] = useState<number | null>(null)
  useEffect(() => () => {
    if (audioRef.current) {
      try { audioRef.current.pause(); audioRef.current.removeAttribute('src'); audioRef.current.load() } catch { /* ignore */ }
    }
  }, [])

  const previewLine = useCallback(async (idx: number, text: string) => {
    if (!text.trim()) return
    setPreviewing(idx)
    try {
      // Use the user's currently-selected voice sample.
      const settings = await window.api.ai.xyreneGetSettings()
      const voice = (settings as any)?.voiceSample || 'xyrene.wav'
      const result = await window.api.ai.xyrenePreviewVoice({ voice, text })
      if (!result?.base64) throw new Error('no audio returned')
      const url = `data:${result.mime};base64,${result.base64}`
      if (!audioRef.current) audioRef.current = new Audio()
      audioRef.current.pause()
      audioRef.current.src = url
      audioRef.current.currentTime = 0
      audioRef.current.onended = () => setPreviewing(null)
      audioRef.current.onerror = () => setPreviewing(null)
      await audioRef.current.play()
    } catch (err) {
      console.warn('[ClimaxVoiceEditor] preview failed:', err)
      setPreviewing(null)
    }
  }, [])

  const save = () => {
    const newLines = draft.split('\n').map((l) => l.trim()).filter((l) => l.length > 0)
    onChange({ enabled, lines: newLines })
  }

  return (
    <div className="bg-white/5 rounded-lg border border-white/10 p-4 space-y-3" data-no-ui-sound>
      <div className="flex items-center gap-2">
        <Sparkles size={14} className="text-pink-300" />
        <h3 className="text-sm font-semibold text-[var(--muted)] uppercase tracking-wider">Climax Voice</h3>
        <button
          onClick={() => onChange({ enabled: !enabled, lines })}
          className={`ml-auto relative inline-flex h-5 w-9 items-center rounded-full transition ${enabled ? 'bg-pink-500/70' : 'bg-white/10'}`}
          title={enabled ? 'Disable climax voice synth' : 'Enable climax voice synth'}
        >
          <span className={`inline-block h-3 w-3 transform rounded-full bg-white transition ${enabled ? 'translate-x-5' : 'translate-x-1'}`} />
        </button>
      </div>
      <div className="text-[11px] text-[var(--muted)]">
        When the engine fires a climax burst, it synthesizes ONE of these lines via XTTS in her cloned voice and overlays it on the sample layers.
      </div>

      {/* Saved lines — preview each. Empty list nudges user to add one. */}
      {lines.length > 0 ? (
        <div className="space-y-1">
          {lines.map((line, i) => (
            <div key={`${line}-${i}`} className="flex items-center gap-2 px-2 py-1 rounded-md bg-black/30 border border-white/5">
              <button
                onClick={() => void previewLine(i, line)}
                disabled={previewing !== null}
                title="Preview in her voice"
                className="p-0.5 rounded hover:bg-white/10 transition disabled:opacity-40"
              >
                {previewing === i
                  ? <Loader2 size={12} className="animate-spin text-pink-300" />
                  : <Volume2 size={12} className="text-white/70" />}
              </button>
              <span className="text-[11px] font-mono flex-1 truncate" title={line}>{line}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-[11px] text-[var(--muted)] italic px-2">No saved lines yet — add some below and save.</div>
      )}

      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        rows={6}
        spellCheck={false}
        className="w-full px-3 py-2 rounded-md bg-black/40 border border-white/10 text-[12px] font-mono resize-y focus:outline-none focus:border-pink-500/40"
        placeholder="One line per row..."
      />
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-[var(--muted)]">{lines.length} active line{lines.length === 1 ? '' : 's'}{dirty ? ' · unsaved' : ''}</span>
        <button
          onClick={save}
          disabled={!dirty}
          className="px-3 py-1 rounded-md bg-pink-500/15 hover:bg-pink-500/25 text-pink-200 text-xs transition disabled:opacity-30 flex items-center gap-1.5"
        >
          <Save size={11} />
          Save lines
        </button>
      </div>
    </div>
  )
}

interface SessionLearningEntry {
  ts: string
  durationSec: number
  mediaCount: number
  commentCount: number
  appended: number
  perCategory: Record<string, number>
}

function BrainEditor() {
  const [entries, setEntries] = useState<BrainEntry[] | null>(null)
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [savingId, setSavingId] = useState<string | null>(null)
  const [savedFlash, setSavedFlash] = useState<string | null>(null)
  const [bootstrapping, setBootstrapping] = useState(false)
  const [bootstrapMsg, setBootstrapMsg] = useState<string | null>(null)
  // Session-learning history. Loaded once + on user-triggered refresh —
  // doesn't auto-poll because nothing else in the renderer changes it.
  const [learningLog, setLearningLog] = useState<SessionLearningEntry[] | null>(null)
  const [showLearningLog, setShowLearningLog] = useState(false)

  const refresh = useCallback(async () => {
    try {
      const list = await window.api.ai.xyreneListBrain() as BrainEntry[]
      setEntries(list)
      const initialDrafts: Record<string, string> = {}
      for (const e of list) initialDrafts[e.id] = e.content
      setDrafts(initialDrafts)
    } catch (err) {
      console.error('[BrainEditor] load failed:', err)
    }
  }, [])

  const refreshLearningLog = useCallback(async () => {
    try {
      const log = await window.api.ai.xyreneListSessionLearnings({ limit: 20 })
      setLearningLog(log as SessionLearningEntry[])
    } catch (err) {
      console.warn('[BrainEditor] learning log load failed:', err)
      setLearningLog([])
    }
  }, [])

  useEffect(() => { refresh() }, [refresh])
  useEffect(() => { refreshLearningLog() }, [refreshLearningLog])

  const save = useCallback(async (id: string) => {
    const content = drafts[id] ?? ''
    setSavingId(id)
    try {
      await window.api.ai.xyreneWriteBrain({ id, content })
      setSavedFlash(id)
      setTimeout(() => setSavedFlash((curr) => (curr === id ? null : curr)), 1200)
      // Refresh to pick up the new updatedAt and exists flag.
      await refresh()
    } catch (err) {
      console.error('[BrainEditor] save failed:', err)
    } finally {
      setSavingId(null)
    }
  }, [drafts, refresh])

  if (!entries) {
    return (
      <div className="bg-white/5 rounded-lg border border-white/10 p-4 text-[var(--muted)] text-xs flex items-center gap-2">
        <Loader2 size={12} className="animate-spin" /> Loading her brain…
      </div>
    )
  }

  const allEmpty = entries.every(e => !e.content.trim())
  const someExisting = entries.some(e => e.content.trim().length > 0)

  const runBootstrap = async (preserveExisting: boolean) => {
    setBootstrapping(true)
    setBootstrapMsg(null)
    try {
      const result: any = await window.api.ai.xyreneBootstrapBrain({ preserveExisting })
      const filled = Object.values(result.perCategory).filter((c: any) => c.written).length
      setBootstrapMsg(`Pre-populated ${filled}/5 categories from ${result.sourceFiles} bible files. Edit them as you like — they take effect on her next comment.`)
      await refresh()
    } catch (err: any) {
      setBootstrapMsg(`Bootstrap failed: ${err?.message ?? err}`)
    } finally {
      setBootstrapping(false)
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="text-sm font-semibold text-[var(--muted)] uppercase tracking-wider flex items-center gap-2">
          <Brain size={14} /> Her Brain
        </h3>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => {
              if (someExisting && !confirm('Some categories already have content. Overwrite with bibles? Click Cancel to APPEND below your existing text instead.')) {
                runBootstrap(true)
              } else {
                runBootstrap(false)
              }
            }}
            disabled={bootstrapping}
            title="Read xyrene-portable's bibles, distill the sex-relevant bits into simplified bullets per category. Editable after."
            className="px-2.5 py-1 rounded-md text-xs bg-pink-500/15 hover:bg-pink-500/25 text-pink-200 border border-pink-500/30 transition disabled:opacity-50 flex items-center gap-1.5"
          >
            {bootstrapping ? <Loader2 size={11} className="animate-spin" /> : <Wand2 size={11} />}
            {bootstrapping ? 'Reading her bibles…' : (allEmpty ? 'Pre-populate from her bibles' : 'Re-pull from bibles')}
          </button>
          <span className="text-[10px] text-[var(--muted)] opacity-60">
            edits are sacred · auto-learnings append below
          </span>
        </div>
      </div>
      {bootstrapMsg && (
        <div className="text-[11px] px-3 py-2 rounded-md bg-pink-500/10 border border-pink-500/30 text-pink-200">{bootstrapMsg}</div>
      )}

      {/* Recent Learnings — collapsible. Shows the last N session-end
          learning events so the user can see WHEN bullets were added
          and WHICH categories they landed in. Helps debug "is the
          extractor actually running" without grepping the log file. */}
      <div className="bg-black/30 rounded-lg border border-white/10">
        <button
          onClick={() => {
            setShowLearningLog((v) => !v)
            if (!showLearningLog) void refreshLearningLog()
          }}
          className="w-full flex items-center justify-between px-3 py-2 text-xs hover:bg-white/5 transition rounded-lg"
        >
          <span className="flex items-center gap-2 text-white/70">
            <RefreshCw size={11} />
            Recent learnings
            {learningLog && learningLog.length > 0 && (
              <span className="text-[10px] text-white/40">
                · last: {new Date(learningLog[0].ts).toLocaleString()} (+{learningLog[0].appended})
              </span>
            )}
          </span>
          <span className="text-[10px] text-white/40">{showLearningLog ? '▴' : '▾'}</span>
        </button>
        {showLearningLog && (
          <div className="px-3 pb-3 pt-1 space-y-1.5">
            {learningLog === null ? (
              <div className="text-[11px] text-[var(--muted)] flex items-center gap-1.5">
                <Loader2 size={10} className="animate-spin" /> Loading…
              </div>
            ) : learningLog.length === 0 ? (
              <div className="text-[11px] text-[var(--muted)] italic">
                No learnings recorded yet. Watch a video with Xyrene enabled for at least 60 seconds and she'll start journaling.
              </div>
            ) : (
              learningLog.map((entry, i) => {
                const date = new Date(entry.ts)
                const cats = Object.entries(entry.perCategory).filter(([, n]) => n > 0)
                return (
                  <div key={`${entry.ts}-${i}`} className="bg-white/5 rounded-md px-2.5 py-1.5 text-[11px] flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-white/60 tabular-nums shrink-0">{date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>
                      <span className="text-[10px] text-white/40 truncate">
                        {Math.round(entry.durationSec / 60)}m · {entry.mediaCount} videos · {entry.commentCount} reactions
                      </span>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {entry.appended === 0 ? (
                        <span className="text-[10px] text-white/30 italic">no new bullets</span>
                      ) : (
                        cats.map(([cat, n]) => (
                          <span key={cat} className="text-[10px] px-1 py-0.5 rounded bg-pink-500/20 text-pink-200 border border-pink-500/30">
                            {cat.replace(/_/g, ' ')} +{n}
                          </span>
                        ))
                      )}
                    </div>
                  </div>
                )
              })
            )}
            {learningLog && learningLog.length > 0 && (
              <button
                onClick={refreshLearningLog}
                className="text-[10px] text-white/40 hover:text-white/70 transition"
              >
                refresh
              </button>
            )}
          </div>
        )}
      </div>

      {entries.map((e) => {
        const draft = drafts[e.id] ?? ''
        const dirty = draft !== e.content
        return (
          <div key={e.id} className="bg-white/5 rounded-lg border border-white/10 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium">{e.label}</label>
              <div className="flex items-center gap-2 text-[10px] text-[var(--muted)] opacity-60">
                {e.updatedAt && <span>updated {new Date(e.updatedAt).toLocaleDateString()}</span>}
                {dirty && <span className="text-amber-300">unsaved</span>}
                <button
                  onClick={() => save(e.id)}
                  disabled={savingId === e.id || !dirty}
                  className="flex items-center gap-1 px-2 py-0.5 rounded bg-pink-500/15 hover:bg-pink-500/25 text-pink-200 transition disabled:opacity-30"
                >
                  {savingId === e.id ? <Loader2 size={10} className="animate-spin" /> :
                   savedFlash === e.id ? <Check size={10} /> :
                   <Save size={10} />}
                  Save
                </button>
              </div>
            </div>
            <textarea
              value={draft}
              onChange={(ev) => setDrafts({ ...drafts, [e.id]: ev.target.value })}
              onBlur={() => { if (dirty) save(e.id) }}
              placeholder={e.placeholder}
              rows={5}
              className="w-full px-3 py-2 rounded bg-black/30 border border-white/10 text-xs font-mono leading-relaxed resize-y focus:outline-none focus:border-pink-400/50"
            />
          </div>
        )
      })}
    </div>
  )
}

function SliderRow({ label, hint, value, min, max, step, onChange }: { label: string; hint: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void }) {
  return (
    <div className="bg-white/5 rounded-lg p-3 border border-white/10">
      <div className="text-xs font-medium mb-1">{label}</div>
      <div className="text-[10px] text-[var(--muted)] mb-2">{hint}</div>
      <input
        type="range"
        value={value} min={min} max={max} step={step}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-pink-400"
      />
    </div>
  )
}

function ToggleRow({ label, hint, checked, onChange }: { label: string; hint: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="bg-white/5 rounded-lg p-3 border border-white/10 flex items-center justify-between gap-3">
      <div className="flex-1">
        <div className="text-xs font-medium">{label}</div>
        <div className="text-[10px] text-[var(--muted)]">{hint}</div>
      </div>
      <button
        onClick={() => onChange(!checked)}
        className={`relative w-10 h-5 rounded-full transition ${checked ? 'bg-pink-500' : 'bg-white/15'}`}
      >
        <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition ${checked ? 'left-5' : 'left-0.5'}`} />
      </button>
    </div>
  )
}

// Voice intake card — watch folder + manual file picker + cleanup-mode
// selector + editable display-name/description per cached voice. Status
// row shows running state, queue depth, processed count, last error.
function VoiceIntakeCard() {
  const { showToast } = useToast()
  const [status, setStatus] = useState<{
    running: boolean
    folder: string | null
    cleanupMode: 'conservative' | 'standard' | 'aggressive'
    queueDepth: number
    processedCount: number
    failedCount: number
    lastError: string | null
    voiceSamplesDir: string
  } | null>(null)
  const [metadata, setMetadata] = useState<Record<string, { displayName?: string; description?: string; durationSec?: number | null; source?: string; addedAt?: string }>>({})
  const [voices, setVoices] = useState<string[]>([])
  const [busy, setBusy] = useState<'start' | 'stop' | 'pick' | null>(null)
  const [folderDraft, setFolderDraft] = useState('')
  const [cleanup, setCleanup] = useState<'conservative' | 'standard' | 'aggressive'>('standard')
  const [editingVoice, setEditingVoice] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState<{ displayName: string; description: string }>({ displayName: '', description: '' })

  const refresh = useCallback(async () => {
    try {
      const [st, meta, list] = await Promise.all([
        (window.api.ai as any).xyreneIntakeStatus?.() ?? Promise.resolve(null),
        (window.api.ai as any).xyreneVoiceMetadata?.() ?? Promise.resolve({}),
        window.api.ai.xyreneListVoices().catch(() => [] as string[]),
      ])
      if (st) {
        setStatus(st)
        setFolderDraft(st.folder ?? '')
        setCleanup(st.cleanupMode ?? 'standard')
      }
      setMetadata(meta ?? {})
      setVoices(list ?? [])
    } catch (err: any) {
      console.warn('[VoiceIntakeCard] refresh failed:', err)
    }
  }, [])

  useEffect(() => {
    void refresh()
    const off = (window.api as any).on?.('xyrene:intakeProcessed', () => { void refresh() })
    const t = setInterval(() => { void refresh() }, 4000)
    return () => {
      try { off?.() } catch { /* ignore */ }
      clearInterval(t)
    }
  }, [refresh])

  const pickFolder = useCallback(async () => {
    setBusy('pick')
    try {
      const folder = await (window.api as any).dialogOpenFolder?.({ title: 'Pick voice intake folder' })
      if (folder) setFolderDraft(folder)
    } finally {
      setBusy(null)
    }
  }, [])

  const startWatcher = useCallback(async () => {
    if (!folderDraft.trim()) {
      showToast('error', 'Pick a folder first.')
      return
    }
    setBusy('start')
    try {
      const r = await (window.api.ai as any).xyreneIntakeStart?.({ folder: folderDraft.trim(), cleanup })
      if (r?.ok) {
        showToast('success', `Watching ${r.folder ?? folderDraft}`)
        await refresh()
      } else {
        showToast('error', r?.error ?? 'Failed to start watcher')
      }
    } finally {
      setBusy(null)
    }
  }, [folderDraft, cleanup, refresh, showToast])

  const stopWatcher = useCallback(async () => {
    setBusy('stop')
    try {
      await (window.api.ai as any).xyreneIntakeStop?.()
      await refresh()
    } finally {
      setBusy(null)
    }
  }, [refresh])

  const processFile = useCallback(async () => {
    const src = await (window.api as any).dialogOpenFile?.({
      title: 'Pick voice sample (wav/mp3/m4a/ogg/flac)',
      filters: [{ name: 'Audio', extensions: ['wav', 'mp3', 'm4a', 'ogg', 'flac'] }],
    })
    if (!src) return
    showToast('info', `Processing ${src.split(/[\\\/]/).pop()}…`)
    const r = await (window.api.ai as any).xyreneIntakeProcess?.({ srcPath: src, cleanup })
    if (r?.ok) {
      showToast('success', `Cached ${r.voiceFilename} (${r.durationSec?.toFixed?.(1)}s)`)
      await refresh()
    } else {
      showToast('error', r?.error ?? 'Processing failed')
    }
  }, [cleanup, refresh, showToast])

  const startEdit = useCallback((voice: string) => {
    const m = metadata[voice]
    setEditingVoice(voice)
    setEditDraft({
      displayName: m?.displayName ?? voice.replace(/\.wav$/i, ''),
      description: m?.description ?? '',
    })
  }, [metadata])

  const saveEdit = useCallback(async () => {
    if (!editingVoice) return
    const r = await (window.api.ai as any).xyreneVoiceMetadataSet?.({
      filename: editingVoice,
      displayName: editDraft.displayName.trim() || editingVoice.replace(/\.wav$/i, ''),
      description: editDraft.description.trim(),
    })
    if (r?.ok) {
      setEditingVoice(null)
      await refresh()
    } else {
      showToast('error', r?.error ?? 'Save failed')
    }
  }, [editingVoice, editDraft, refresh, showToast])

  const running = status?.running ?? false

  return (
    <div className="bg-white/5 rounded-lg border border-white/10 p-4 space-y-3" data-no-ui-sound>
      <div className="flex items-center gap-2">
        <FileAudio size={14} className="text-pink-300" />
        <h3 className="text-sm font-semibold text-[var(--muted)] uppercase tracking-wider">Voice Intake</h3>
        <span className="text-[10px] text-[var(--muted)] opacity-60 ml-auto">
          drop wav/mp3/m4a → cleanup → XTTS clone
        </span>
      </div>

      {/* Status row */}
      <div className="flex items-center gap-3 text-[11px]">
        <span className={`px-2 py-0.5 rounded-full ${running ? 'bg-green-500/15 text-green-300 border border-green-500/30' : 'bg-white/5 text-white/50 border border-white/10'}`}>
          {running ? '● Watching' : '○ Stopped'}
        </span>
        {status && status.queueDepth > 0 && (
          <span className="text-amber-300">queue: {status.queueDepth}</span>
        )}
        {status && (
          <span className="text-white/40">
            {status.processedCount} done · {status.failedCount} failed
          </span>
        )}
      </div>

      {status?.lastError && (
        <div className="text-[10px] text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded px-2 py-1">
          {status.lastError}
        </div>
      )}

      {/* Folder picker */}
      <div className="space-y-1.5">
        <label className="text-[10px] uppercase tracking-wider text-[var(--muted)]">Watch folder</label>
        <div className="flex gap-2">
          <input
            type="text"
            value={folderDraft}
            onChange={(e) => setFolderDraft(e.target.value)}
            placeholder="C:\Users\you\Documents\Vault\xyrene_voice_intake"
            className="flex-1 px-2 py-1.5 rounded bg-black/40 border border-white/10 text-[11px] font-mono text-white/80 focus:outline-none focus:border-pink-500/40"
          />
          <button
            onClick={pickFolder}
            disabled={busy !== null}
            className="px-2 py-1.5 rounded bg-white/5 border border-white/10 hover:bg-white/10 transition flex items-center gap-1.5 text-[11px] disabled:opacity-40"
          >
            <FolderOpen size={12} /> Browse
          </button>
        </div>
      </div>

      {/* Cleanup mode */}
      <div className="space-y-1.5">
        <label className="text-[10px] uppercase tracking-wider text-[var(--muted)]">Cleanup intensity</label>
        <div className="flex gap-1">
          {(['conservative', 'standard', 'aggressive'] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => setCleanup(mode)}
              className={`flex-1 px-2 py-1.5 rounded text-[11px] capitalize transition border ${
                cleanup === mode
                  ? 'bg-pink-500/15 border-pink-500/40 text-pink-200'
                  : 'bg-black/20 border-white/10 text-white/60 hover:bg-white/5'
              }`}
              title={
                mode === 'conservative' ? 'Trim leading/trailing silence only'
                : mode === 'standard' ? 'Trim silence + denoise + loudness-normalize (recommended)'
                : 'Standard + stronger denoise + de-essing (use for harsh source)'
              }
            >
              {mode}
            </button>
          ))}
        </div>
      </div>

      {/* Controls */}
      <div className="flex gap-2">
        {!running ? (
          <button
            onClick={startWatcher}
            disabled={busy !== null || !folderDraft.trim()}
            className="flex-1 px-3 py-1.5 rounded bg-pink-500/20 hover:bg-pink-500/30 border border-pink-500/40 text-pink-100 text-[11px] flex items-center justify-center gap-2 transition disabled:opacity-40"
          >
            {busy === 'start' ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />}
            Start watching
          </button>
        ) : (
          <button
            onClick={stopWatcher}
            disabled={busy !== null}
            className="flex-1 px-3 py-1.5 rounded bg-white/5 hover:bg-white/10 border border-white/10 text-[11px] flex items-center justify-center gap-2 transition disabled:opacity-40"
          >
            {busy === 'stop' ? <Loader2 size={12} className="animate-spin" /> : <Square size={12} />}
            Stop
          </button>
        )}
        <button
          onClick={processFile}
          disabled={busy !== null}
          className="px-3 py-1.5 rounded bg-white/5 hover:bg-white/10 border border-white/10 text-[11px] flex items-center gap-2 transition disabled:opacity-40"
          title="Pick a file and run cleanup + clone immediately"
        >
          <Upload size={12} /> Process file…
        </button>
      </div>

      {status?.voiceSamplesDir && (
        <div className="text-[10px] text-white/40 font-mono break-all">
          → {status.voiceSamplesDir}
        </div>
      )}

      {/* Cached voices with editable metadata */}
      {voices.length > 0 && (
        <div className="space-y-1.5 pt-2 border-t border-white/5">
          <div className="text-[10px] uppercase tracking-wider text-[var(--muted)]">
            Cached voices ({voices.length})
          </div>
          {voices.map((v) => {
            const m = metadata[v]
            const isEditing = editingVoice === v
            return (
              <div key={v} className="rounded border border-white/5 bg-black/20 p-2">
                {isEditing ? (
                  <div className="space-y-1.5">
                    <input
                      type="text"
                      value={editDraft.displayName}
                      onChange={(e) => setEditDraft((d) => ({ ...d, displayName: e.target.value }))}
                      placeholder="Display name"
                      className="w-full px-2 py-1 rounded bg-black/40 border border-white/10 text-[11px]"
                    />
                    <input
                      type="text"
                      value={editDraft.description}
                      onChange={(e) => setEditDraft((d) => ({ ...d, description: e.target.value }))}
                      placeholder="Description (e.g. soft, breathy, dommy)"
                      className="w-full px-2 py-1 rounded bg-black/40 border border-white/10 text-[10px] text-white/70"
                    />
                    <div className="flex gap-1.5">
                      <button
                        onClick={saveEdit}
                        className="px-2 py-1 rounded bg-pink-500/20 hover:bg-pink-500/30 border border-pink-500/40 text-[10px] flex items-center gap-1"
                      >
                        <Save size={10} /> Save
                      </button>
                      <button
                        onClick={() => setEditingVoice(null)}
                        className="px-2 py-1 rounded bg-white/5 hover:bg-white/10 border border-white/10 text-[10px]"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="text-[11px] font-medium truncate">{m?.displayName ?? v.replace(/\.wav$/i, '')}</div>
                      <div className="text-[10px] text-white/40 font-mono truncate">
                        {v}{typeof m?.durationSec === 'number' ? ` · ${m.durationSec.toFixed(1)}s` : ''}
                      </div>
                      {m?.description && <div className="text-[10px] text-white/50 italic truncate">{m.description}</div>}
                    </div>
                    <button
                      onClick={() => startEdit(v)}
                      className="p-1 rounded hover:bg-white/10 text-white/50"
                      title="Edit display name + description"
                    >
                      <Wand2 size={11} />
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      <button
        onClick={() => { void refresh() }}
        className="text-[10px] text-white/40 hover:text-white/70 flex items-center gap-1 mx-auto transition"
      >
        <RefreshCw size={10} /> Refresh
      </button>
    </div>
  )
}

export default XyreneSettings
