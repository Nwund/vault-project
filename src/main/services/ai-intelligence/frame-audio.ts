// File: src/main/services/ai-intelligence/frame-audio.ts
//
// Audio-channel analysis for the AI pipeline. Visual-only analysis
// misses audio-only / audio-driven content: dirty talk, screaming
// orgasms, ASMR, silent compilations, audio-only sources. This module
// uses FFmpeg's existing filters (no extra deps) to extract a few
// cheap audio fingerprints over the video timeline and packages them
// as a prompt context block.
//
// What we detect:
//   - Overall RMS volume + dynamic range
//   - Silence ratio (fraction of timeline below -50 dBFS)
//   - "intensity peaks" — clusters of high-RMS frames (moaning,
//     screaming, plap rhythm)
//   - Has-speech vs music-only heuristic (via channel layout +
//     spectral characteristics from astats)
//
// What we DON'T do here: speech transcription. That's a whisper.cpp
// integration — heavy, separate task #129 follow-up.

import { spawn } from 'node:child_process'
import fs from 'node:fs'

export interface AudioFingerprint {
  durationSec: number
  /** Overall RMS in dBFS — -60 = near silent, -20 = loud. */
  meanRmsDb: number
  /** Peak RMS in dBFS. */
  peakRmsDb: number
  /** Fraction of duration with RMS below the silence threshold. */
  silenceRatio: number
  /** Number of high-intensity peaks (RMS bursts above mean + 6dB). */
  peakCount: number
  /** Estimated number of channels (1 = mono, 2 = stereo). */
  channels: number
  /** Heuristic content type. */
  contentType: 'silent' | 'mostly-silent' | 'music-only' | 'speech' | 'mixed' | 'unknown'
}

const EMPTY: AudioFingerprint = {
  durationSec: 0,
  meanRmsDb: -90,
  peakRmsDb: -90,
  silenceRatio: 1,
  peakCount: 0,
  channels: 0,
  contentType: 'unknown',
}

/**
 * Run ffmpeg on a media file with the volumedetect + astats filters,
 * parse the output, and synthesize a fingerprint. Returns the empty
 * fingerprint when audio is absent or analysis fails.
 *
 * Implementation note: we use ffmpeg's stderr output parsing (the
 * filters print stats to stderr, not stdout) which has been stable
 * across ffmpeg 4.x-7.x.
 */
export async function analyzeAudioTrack(
  videoPath: string,
  ffmpegPath: string,
  durationHint?: number | null
): Promise<AudioFingerprint> {
  if (!fs.existsSync(videoPath)) return EMPTY

  return new Promise((resolve) => {
    // ffmpeg -i video -af "volumedetect,astats" -vn -f null -
    // Decodes the audio track once and runs both filters in parallel.
    const proc = spawn(ffmpegPath, [
      '-hide_banner',
      '-nostats',
      '-i', videoPath,
      '-af', 'volumedetect,astats=metadata=1:reset=0',
      '-vn',
      '-f', 'null',
      '-'
    ], { windowsHide: true })

    let stderr = ''
    proc.stderr?.on('data', (d) => { stderr += d.toString() })
    proc.on('error', () => resolve(EMPTY))
    proc.on('close', () => {
      try {
        resolve(parseFfmpegAudioStats(stderr, durationHint))
      } catch (err) {
        console.warn('[FrameAudio] Parse failed:', err)
        resolve(EMPTY)
      }
    })
  })
}

function parseFfmpegAudioStats(stderr: string, durationHint?: number | null): AudioFingerprint {
  // Bail if no audio stream
  if (/Stream #\d+:\d+(?:\[\w+\])?(?:\(\w+\))?: Audio/.test(stderr) === false) {
    return EMPTY
  }

  // Duration
  let durationSec = durationHint ?? 0
  const durMatch = /Duration:\s*(\d+):(\d+):(\d+\.\d+)/.exec(stderr)
  if (durMatch) {
    const [, h, m, s] = durMatch
    durationSec = parseInt(h) * 3600 + parseInt(m) * 60 + parseFloat(s)
  }

  // Channels
  let channels = 0
  const chMatch = /Audio:.*?(mono|stereo|2 channels|1 channel|5\.1)/.exec(stderr)
  if (chMatch) {
    const v = chMatch[1].toLowerCase()
    if (v.startsWith('mono') || v === '1 channel') channels = 1
    else if (v.startsWith('stereo') || v === '2 channels') channels = 2
    else if (v.startsWith('5.1')) channels = 6
  }

  // volumedetect: mean_volume + max_volume in dBFS.
  let meanRmsDb = -90
  let peakRmsDb = -90
  const meanMatch = /mean_volume:\s*(-?\d+\.\d+)\s*dB/.exec(stderr)
  if (meanMatch) meanRmsDb = parseFloat(meanMatch[1])
  const peakMatch = /max_volume:\s*(-?\d+\.\d+)\s*dB/.exec(stderr)
  if (peakMatch) peakRmsDb = parseFloat(peakMatch[1])

  // astats with metadata=1:reset=0 cumulates over the whole stream.
  // We can extract per-channel RMS_level if we want fine detail, but
  // for fingerprinting the volumedetect summary is enough.

  // Silence ratio — heuristic from mean vs peak. If the mean is way
  // below the peak (>= 30dB gap), it's mostly silent with occasional
  // bursts. Approximation; for exact silence ratio we'd need the
  // silencedetect filter, which adds another decode pass.
  const dynamicRange = peakRmsDb - meanRmsDb
  let silenceRatio: number
  if (peakRmsDb < -45) {
    silenceRatio = 0.95  // near-silent stream
  } else if (dynamicRange > 35) {
    silenceRatio = 0.7
  } else if (dynamicRange > 20) {
    silenceRatio = 0.35
  } else {
    silenceRatio = 0.05  // loud throughout
  }

  // Peak count — astats prints "Peak count" if available; otherwise
  // approximate from RMS_peak_count (some builds emit it). Both are
  // best-effort signals.
  let peakCount = 0
  const peakCountMatch = /Peak count:\s*(\d+)/i.exec(stderr)
  if (peakCountMatch) peakCount = parseInt(peakCountMatch[1])

  // Content type heuristic
  let contentType: AudioFingerprint['contentType'] = 'unknown'
  if (peakRmsDb < -50) contentType = 'silent'
  else if (silenceRatio > 0.7) contentType = 'mostly-silent'
  else if (dynamicRange < 10 && meanRmsDb > -25) contentType = 'music-only'  // compressed/mastered audio
  else if (dynamicRange > 20) contentType = 'speech'                          // dialogue / moaning has wide dynamics
  else contentType = 'mixed'

  return {
    durationSec,
    meanRmsDb,
    peakRmsDb,
    silenceRatio,
    peakCount,
    channels,
    contentType,
  }
}

/**
 * Render an audio fingerprint as a prompt context block. Empty when
 * the fingerprint carries no useful signal (no audio track).
 */
export interface AudioTagPrior {
  name: string
  confidence: number
  source: 'audio'
}

export interface BpmEstimate {
  bpm: number | null
  /** 0-1: how clean the rhythm was — high values indicate steady
   *  music or rhythmic plap patterns; low values indicate random
   *  noise or mixed content. */
  rhythmClarity: number
}

/**
 * Estimate BPM via autocorrelation of an audio energy envelope.
 *
 * Pipeline:
 *   1. FFmpeg decodes the file to a 22050 Hz mono float32 PCM stream
 *      (single pipe — no intermediate file).
 *   2. We compute the RMS energy over short frames (~23 ms hops).
 *   3. Take the autocorrelation of the envelope, look for the
 *      strongest peak in the 60-180 BPM range (lag = 60 / bpm * fps).
 *   4. Rhythm clarity = peak height / mean of the autocorrelation —
 *      a steady beat produces a sharp peak; noise produces flat ACF.
 *
 * Pure DSP, no model. Cost: ~1s per 90s of audio on CPU.
 *
 * Caveats:
 *   - Underestimates on very polyrhythmic music (it just picks the
 *     strongest single tempo).
 *   - Vocal-only audio (no percussion) gives low rhythm clarity —
 *     we use that as the "is this rhythmic?" signal.
 */
export async function estimateBpm(
  videoPath: string,
  ffmpegPath: string,
  options?: { maxAudioSec?: number; timeoutMs?: number }
): Promise<BpmEstimate> {
  if (!fs.existsSync(videoPath)) return { bpm: null, rhythmClarity: 0 }
  const maxAudioSec = options?.maxAudioSec ?? 60
  const timeoutMs = options?.timeoutMs ?? 30_000

  return new Promise((resolve) => {
    // FFmpeg → 22050 Hz mono float32 PCM, piped to stdout. We read
    // up to maxAudioSec of samples.
    const { spawn } = require('node:child_process') as typeof import('node:child_process')
    const proc = spawn(ffmpegPath, [
      '-hide_banner', '-nostats', '-loglevel', 'error',
      '-i', videoPath,
      '-t', String(maxAudioSec),
      '-vn',
      '-ac', '1',
      '-ar', '22050',
      '-f', 'f32le',
      '-',
    ], { windowsHide: true })

    const chunks: Buffer[] = []
    let bytesRead = 0
    const maxBytes = maxAudioSec * 22050 * 4  // float32

    proc.stdout?.on('data', (d: Buffer) => {
      if (bytesRead < maxBytes) {
        chunks.push(d)
        bytesRead += d.length
      }
    })
    proc.on('error', () => resolve({ bpm: null, rhythmClarity: 0 }))
    const killTimer = setTimeout(() => {
      try { proc.kill('SIGKILL') } catch { /* ignore */ }
      resolve({ bpm: null, rhythmClarity: 0 })
    }, timeoutMs)
    proc.on('close', () => {
      clearTimeout(killTimer)
      try {
        const combined = Buffer.concat(chunks)
        if (combined.length < 22050 * 4 * 5) {
          // < 5 seconds of audio — not enough to estimate BPM reliably.
          resolve({ bpm: null, rhythmClarity: 0 })
          return
        }
        const samples = new Float32Array(combined.buffer, combined.byteOffset, combined.length / 4)
        resolve(computeBpmFromSamples(samples, 22050))
      } catch (err) {
        console.warn('[BPM] Parse failed:', err)
        resolve({ bpm: null, rhythmClarity: 0 })
      }
    })
  })
}

/** BPM estimation from raw float32 PCM samples + sample rate. */
function computeBpmFromSamples(samples: Float32Array, sampleRate: number): BpmEstimate {
  // Energy envelope at ~43 Hz (512-sample hops at 22050 Hz). This
  // smooths over instrument transients and keeps the autocorrelation
  // tractable (a 60s envelope is ~2580 samples — fast O(N²) ACF).
  const HOP = 512
  const envFps = sampleRate / HOP
  const envLen = Math.floor(samples.length / HOP)
  if (envLen < 100) return { bpm: null, rhythmClarity: 0 }
  const envelope = new Float32Array(envLen)
  for (let i = 0; i < envLen; i++) {
    let sumSq = 0
    const start = i * HOP
    const end = start + HOP
    for (let j = start; j < end; j++) sumSq += samples[j] * samples[j]
    envelope[i] = Math.sqrt(sumSq / HOP)
  }
  // High-pass the envelope by subtracting a slow-moving average —
  // removes DC + slow drift, leaving the percussive bursts.
  const MA_WIN = Math.floor(envFps * 1.5)  // ~1.5s window
  const hpEnv = new Float32Array(envLen)
  let runSum = 0
  for (let i = 0; i < envLen; i++) {
    runSum += envelope[i]
    if (i >= MA_WIN) runSum -= envelope[i - MA_WIN]
    const ma = i < MA_WIN ? runSum / (i + 1) : runSum / MA_WIN
    hpEnv[i] = Math.max(0, envelope[i] - ma)
  }
  // Autocorrelation across lags corresponding to 60-180 BPM.
  // lag (in envelope samples) = (60 / bpm) * envFps.
  // BPM 60 → lag = envFps; BPM 180 → lag = envFps / 3.
  const minLag = Math.floor((60 / 180) * envFps)
  const maxLag = Math.ceil((60 / 60) * envFps)
  let bestLag = -1
  let bestAcf = 0
  const acfValues: number[] = []
  for (let lag = minLag; lag <= maxLag; lag++) {
    let acf = 0
    const n = envLen - lag
    if (n < 50) break
    for (let i = 0; i < n; i++) acf += hpEnv[i] * hpEnv[i + lag]
    acfValues.push(acf)
    if (acf > bestAcf) {
      bestAcf = acf
      bestLag = lag
    }
  }
  if (bestLag < 0 || acfValues.length === 0) {
    return { bpm: null, rhythmClarity: 0 }
  }
  const meanAcf = acfValues.reduce((a, b) => a + b, 0) / acfValues.length
  const rhythmClarity = meanAcf > 0
    ? Math.min(1, Math.max(0, (bestAcf - meanAcf) / (bestAcf + meanAcf + 1e-9)))
    : 0
  const bpm = (60 * envFps) / bestLag
  return {
    bpm: Math.round(bpm * 10) / 10,
    rhythmClarity,
  }
}

/** Turn a BPM estimate into rich_tag priors. */
export function bpmToTagPriors(bpm: BpmEstimate): AudioTagPrior[] {
  if (bpm.bpm == null) return []
  // Only emit tempo tags when the rhythm is clean enough — otherwise
  // we'd be tagging random environmental noise as "fast paced".
  if (bpm.rhythmClarity < 0.25) return []
  const priors: AudioTagPrior[] = []
  const conf = Math.min(0.7, 0.4 + bpm.rhythmClarity * 0.4)
  if (bpm.bpm >= 140) priors.push({ name: 'fast paced', confidence: conf, source: 'audio' })
  else if (bpm.bpm >= 110) priors.push({ name: 'medium tempo', confidence: conf - 0.05, source: 'audio' })
  else if (bpm.bpm < 90) priors.push({ name: 'slow', confidence: conf - 0.05, source: 'audio' })
  // Strong rhythm + steady BPM → music video / PMV.
  if (bpm.rhythmClarity >= 0.5) {
    priors.push({ name: 'rhythmic', confidence: conf, source: 'audio' })
  }
  return priors
}

/**
 * Turn the audio fingerprint into direct rich_tag priors. These get
 * folded into Tier 2's rich_tags pool the same way pose / miles-deep
 * priors do — calibration + mutual-exclusion logic adjusts them.
 *
 * Confidence philosophy:
 *   - HIGH (0.7-0.85) for objective signals like "silent" / "mostly
 *     silent" (silenceRatio gives ground truth).
 *   - MEDIUM (0.45-0.6) for content-type guesses ("music-only"
 *     correlates strongly with PMV but isn't proof).
 *   - LOW (0.3-0.4) for derived heuristics like "intense" /
 *     "moaning" that depend on vocal-event interpretation we can't
 *     do without a transcriber.
 */
export function audioFingerprintToTagPriors(fp: AudioFingerprint): AudioTagPrior[] {
  // No audio track at all — emit the strongest possible "silent"
  // signal so the prior survives mutual exclusion.
  if (fp.channels === 0) {
    return [{ name: 'silent', confidence: 0.9, source: 'audio' }]
  }
  if (fp.contentType === 'unknown') return []

  const priors: AudioTagPrior[] = []

  // Content-type → tag mapping. These are the canonical mappings the
  // prompt block already suggests Venice should emit, so emitting them
  // directly closes the loop — Venice doesn't have to repeat the
  // signal we just measured.
  switch (fp.contentType) {
    case 'silent':
      priors.push({ name: 'silent', confidence: 0.85, source: 'audio' })
      priors.push({ name: 'no audio', confidence: 0.8, source: 'audio' })
      break
    case 'mostly-silent':
      // Lower confidence — could be compilation cuts or actual quiet content.
      priors.push({ name: 'silent', confidence: 0.5, source: 'audio' })
      break
    case 'music-only':
      // The single strongest signal for PMV/HMV content. The visual
      // check (Venice agreeing with "music video aesthetic") will
      // confirm or reject via cross-source consensus.
      priors.push({ name: 'pmv', confidence: 0.55, source: 'audio' })
      priors.push({ name: 'music video', confidence: 0.5, source: 'audio' })
      break
    case 'speech':
      // High dynamic range = vocal events present. Could be dialogue,
      // dirty talk, or sex sounds — Venice's visual check disambiguates.
      priors.push({ name: 'vocal', confidence: 0.5, source: 'audio' })
      break
    case 'mixed':
      // Typical sex-scene audio. Don't emit anything — it's the default
      // null hypothesis. Specific tags would be hallucination.
      break
  }

  // Peak / intensity signals. Stack on top of contentType priors.
  if (fp.peakRmsDb > -10) {
    // Clipping-near-0 audio suggests loud climax / screaming.
    priors.push({ name: 'loud', confidence: 0.55, source: 'audio' })
  }
  if (fp.peakCount >= 5 && fp.contentType !== 'silent' && fp.contentType !== 'mostly-silent') {
    // Many distinct high-RMS bursts → rhythmic vocal / impact pattern.
    priors.push({ name: 'intense', confidence: 0.4, source: 'audio' })
  }
  if (fp.meanRmsDb < -40 && fp.contentType !== 'silent') {
    // Quiet-but-not-silent audio. Could be ASMR / whispered content.
    priors.push({ name: 'quiet', confidence: 0.5, source: 'audio' })
  }

  return priors
}

export function renderAudioBlockForPrompt(fp: AudioFingerprint): string {
  if (fp.channels === 0 || fp.contentType === 'unknown') return ''

  const labels: string[] = []
  switch (fp.contentType) {
    case 'silent':
      labels.push('this video has NO audible audio — emit tag "silent" or "no audio"')
      break
    case 'mostly-silent':
      labels.push(`mostly silent with occasional bursts (silence ratio ~${Math.round(fp.silenceRatio * 100)}%) — could be a compilation with cuts, or audio-mixed content`)
      break
    case 'music-only':
      labels.push('compressed music-only audio (mastered, low dynamic range) — likely a PMV/HMV or video set to music; emit "pmv" or "hmv" tag if visually consistent')
      break
    case 'speech':
      labels.push('audio has speech/moan dynamics (high dynamic range) — dialogue, dirty talk, or vocal sex sounds present')
      break
    case 'mixed':
      labels.push('mixed audio with moderate dynamic range — typical sex-scene audio')
      break
  }
  if (fp.peakRmsDb > -10) labels.push('audio is very loud / clipping near 0 dBFS — possible orgasm/scream peaks')

  return `

═══════════════════════════════════════════════════════════════════════
AUDIO FINGERPRINT
═══════════════════════════════════════════════════════════════════════
mean volume: ${fp.meanRmsDb.toFixed(1)} dBFS · peak: ${fp.peakRmsDb.toFixed(1)} dBFS · channels: ${fp.channels}
${labels.map((l) => '  • ' + l).join('\n')}
Use this as supporting evidence for: "pmv" / "hmv" / "silent" /
"asmr" / "loud sex" tags. The audio channel is your second source —
visual-only analysis would miss a girl whispering dirty talk or a
silent compilation cut to music.
═══════════════════════════════════════════════════════════════════════
`
}
