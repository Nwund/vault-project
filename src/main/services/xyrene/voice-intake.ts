// File: src/main/services/xyrene/voice-intake.ts
//
// Voice intake pipeline for new Xyrene voices.
//
// Workflow (per file dropped into the intake folder):
//   1. Probe via ffprobe — must be audio, duration ≥ 3s.
//   2. Detect silence boundaries with ffmpeg silencedetect.
//   3. Run the chosen cleanup chain:
//      - conservative: trim head/tail silence, light high/low-pass
//      - standard (default): + afftdn denoise + loudnorm to -16 LUFS
//      - aggressive: + deesser + secondary spectral cleanup
//   4. Validate output (still ≥ 3s, not pure silence).
//   5. Copy cleaned WAV to <xtts-server>/voice_samples/<slug>.wav.
//   6. Persist display-name + description metadata to settings.
//   7. Trigger XTTS /cache_voice so first synth is instant.
//
// Chokidar watcher mode auto-processes anything written to the
// intake folder; the one-shot IPC variant processes a specified file.

import { spawn, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import chokidar from 'chokidar'
import { findXttsServerDir } from './server-launcher'
import { getXyreneVoiceClient } from './voice-client'

export type CleanupMode = 'conservative' | 'standard' | 'aggressive'

export interface VoiceMetadata {
  displayName: string
  description: string
  language: string
}

export interface IntakeResult {
  ok: boolean
  outputPath?: string
  durationSec?: number
  trimmedSec?: number
  registered?: boolean
  error?: string
}

export interface ProcessOptions {
  cleanup?: CleanupMode
  displayName?: string
  description?: string
  language?: string
  /** Optional override for output filename (slug.wav). Else derived from input. */
  outputSlug?: string
}

const DEFAULT_SAMPLE_RATE = 22050  // XTTS prefers 22050 mono per training data
const MIN_VALID_DURATION_SEC = 3

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/\.[^.]+$/, '')          // drop extension
    .replace(/[^a-z0-9]+/g, '_')      // collapse non-alnum
    .replace(/^_+|_+$/g, '')          // trim underscores
    .slice(0, 60) || 'voice'
}

function getFfmpegBin(): string {
  try {
    const ff = require('../../ffpaths') as typeof import('../../ffpaths')
    return ff.ffmpegBin ?? 'ffmpeg'
  } catch { return 'ffmpeg' }
}

function getFfprobeBin(): string {
  try {
    const ff = require('../../ffpaths') as typeof import('../../ffpaths')
    return ff.ffprobeBin ?? 'ffprobe'
  } catch { return 'ffprobe' }
}

function probeDuration(filePath: string): number | null {
  const r = spawnSync(getFfprobeBin(), [
    '-v', 'error',
    '-show_entries', 'format=duration',
    '-of', 'default=noprint_wrappers=1:nokey=1',
    filePath,
  ], { encoding: 'utf8', windowsHide: true })
  if (r.status !== 0) return null
  const d = Number(r.stdout.trim())
  return Number.isFinite(d) && d > 0 ? d : null
}

// Returns the ffmpeg -af filter chain string for a given cleanup mode.
// The order matters: silence-trim BEFORE denoise so we don't waste
// cycles denoising silence; loudnorm LAST so its measurement window
// covers the final dynamic range.
function buildFilterChain(mode: CleanupMode): string {
  const chains: Record<CleanupMode, string[]> = {
    conservative: [
      // Trim leading silence under -50 dB
      'silenceremove=start_periods=1:start_duration=0:start_threshold=-50dB',
      // Trim trailing silence (reverse the stream, trim head, reverse back)
      'areverse',
      'silenceremove=start_periods=1:start_duration=0:start_threshold=-50dB',
      'areverse',
      // Gentle band-pass to drop hum + cymbal noise outside speech range
      'highpass=80',
      'lowpass=12000',
    ],
    standard: [
      'silenceremove=start_periods=1:start_duration=0:start_threshold=-50dB',
      'areverse',
      'silenceremove=start_periods=1:start_duration=0:start_threshold=-50dB',
      'areverse',
      'highpass=80',
      'lowpass=12000',
      // afftdn = noise reduction in frequency domain
      'afftdn=nf=-25',
      // EBU R128 loudness normalization, two-pass via single-pass
      // approximation (good enough for 1-2 min voice clips)
      'loudnorm=I=-16:TP=-1.5:LRA=11',
    ],
    aggressive: [
      'silenceremove=start_periods=1:start_duration=0:start_threshold=-50dB',
      'areverse',
      'silenceremove=start_periods=1:start_duration=0:start_threshold=-50dB',
      'areverse',
      'highpass=80',
      'lowpass=12000',
      'afftdn=nf=-30',
      // De-essing (knock down 5-8 kHz sibilance)
      'deesser',
      // Subtle compression to even out levels before loudnorm
      'compand=attacks=0.05:decays=0.5:points=-90/-90|-30/-15|0/-3:soft-knee=4',
      'loudnorm=I=-16:TP=-1.5:LRA=8',
    ],
  }
  return chains[mode].join(',')
}

/**
 * Run the full intake pipeline on a single source audio file.
 * Returns the destination path on success.
 */
export async function processVoiceFile(
  srcPath: string,
  options: ProcessOptions = {},
): Promise<IntakeResult> {
  if (!fs.existsSync(srcPath)) return { ok: false, error: 'Source file missing' }

  const mode = options.cleanup ?? 'standard'
  const srcDuration = probeDuration(srcPath)
  if (!srcDuration || srcDuration < MIN_VALID_DURATION_SEC) {
    return { ok: false, error: `Source too short (${srcDuration?.toFixed(1) ?? '?'}s) — XTTS needs ≥${MIN_VALID_DURATION_SEC}s of clean speech` }
  }

  // Resolve XTTS voice_samples/ destination. The XTTS server actually
  // reads from `xyrene-portable/dev/voice_samples/` (parent of the
  // xtts-server dir), not its own subdir — verified via server log
  // "Voice samples dir: …/dev/voice_samples" and the /voices endpoint.
  const serverDir = findXttsServerDir(null)
  if (!serverDir) {
    return { ok: false, error: 'xyrene-portable / xtts-server not found at known paths — install it first' }
  }
  // Prefer the sibling `dev/voice_samples` if it exists (the path the
  // running XTTS server actually scans); fall back to xtts-server's
  // own voice_samples/ for forward compat.
  const portableDir = path.dirname(serverDir)
  const devVoiceSamples = path.join(portableDir, 'dev', 'voice_samples')
  const localVoiceSamples = path.join(serverDir, 'voice_samples')
  const voiceSamplesDir = fs.existsSync(devVoiceSamples) ? devVoiceSamples : localVoiceSamples
  await fsp.mkdir(voiceSamplesDir, { recursive: true })

  const slug = slugify(options.outputSlug ?? path.basename(srcPath))
  const outPath = path.join(voiceSamplesDir, `${slug}.wav`)

  // Avoid clobbering: if name already exists, append numeric suffix.
  let finalOut = outPath
  for (let i = 2; fs.existsSync(finalOut); i++) {
    finalOut = path.join(voiceSamplesDir, `${slug}_${i}.wav`)
    if (i > 99) break
  }

  // Run ffmpeg cleanup pipeline. Output: 22050 Hz mono WAV.
  const filterChain = buildFilterChain(mode)
  const ffmpeg = getFfmpegBin()
  const args = [
    '-y',
    '-i', srcPath,
    '-vn',                           // strip any video stream defensively
    '-ac', '1',                      // mono
    '-ar', String(DEFAULT_SAMPLE_RATE),
    '-af', filterChain,
    '-acodec', 'pcm_s16le',
    finalOut,
  ]

  const runResult = await new Promise<{ code: number; stderr: string }>((resolve) => {
    let stderr = ''
    const proc = spawn(ffmpeg, args, { windowsHide: true })
    proc.stderr?.on('data', (d) => { stderr += d.toString() })
    proc.on('error', (err) => resolve({ code: -1, stderr: err.message }))
    proc.on('close', (code) => resolve({ code: code ?? -1, stderr }))
  })

  if (runResult.code !== 0 || !fs.existsSync(finalOut)) {
    return { ok: false, error: `ffmpeg failed (exit ${runResult.code}): ${runResult.stderr.slice(-300)}` }
  }

  const outDuration = probeDuration(finalOut)
  if (!outDuration || outDuration < MIN_VALID_DURATION_SEC) {
    try { await fsp.unlink(finalOut) } catch { /* noop */ }
    return { ok: false, error: `Output too short after silence-trim (${outDuration?.toFixed(1) ?? '?'}s) — was source mostly silent?` }
  }

  // Persist metadata so the renderer voice picker can show display
  // names + descriptions (not just bare filenames).
  let registered = false
  try {
    const { getSettings, updateSettings } = await import('../../settings')
    const s = getSettings() as any
    const meta = { ...(s.xyreneVoiceMetadata ?? {}) }
    meta[path.basename(finalOut)] = {
      displayName: options.displayName ?? slug.replace(/_/g, ' '),
      description: options.description ?? '',
      language: options.language ?? 'en',
    } as VoiceMetadata
    updateSettings({ xyreneVoiceMetadata: meta } as any)
    registered = true
  } catch (err) {
    console.warn('[VoiceIntake] settings write failed:', err)
  }

  // Pre-warm the voice embedding so the first /tts call is instant.
  try {
    await getXyreneVoiceClient().cacheVoice(path.basename(finalOut))
  } catch { /* server may not be running yet — caching can happen later */ }

  return {
    ok: true,
    outputPath: finalOut,
    durationSec: outDuration,
    trimmedSec: srcDuration - outDuration,
    registered,
  }
}

// ─── Folder-watcher mode ──────────────────────────────────────────────

let watcher: chokidar.FSWatcher | null = null
let watchedFolder: string | null = null
const inFlight = new Set<string>()

export interface WatchHandler {
  onProcessed?(srcPath: string, result: IntakeResult): void
}

export async function startIntakeWatcher(
  folder: string,
  handler: WatchHandler,
  options: { cleanup?: CleanupMode } = {},
): Promise<{ ok: boolean; error?: string }> {
  await fsp.mkdir(folder, { recursive: true })
  if (watcher) {
    if (watchedFolder === folder) return { ok: true }
    try { await watcher.close() } catch { /* noop */ }
    watcher = null
  }
  watchedFolder = folder
  watcher = chokidar.watch(folder, {
    ignoreInitial: false,
    awaitWriteFinish: { stabilityThreshold: 1500, pollInterval: 400 },
    depth: 0,
  })
  watcher.on('add', async (filePath) => {
    if (inFlight.has(filePath)) return
    if (!/\.(wav|mp3|m4a|ogg|flac|aac|opus)$/i.test(filePath)) return
    inFlight.add(filePath)
    try {
      const result = await processVoiceFile(filePath, { cleanup: options.cleanup })
      handler.onProcessed?.(filePath, result)
      // Move the source to a `_done/` sibling so the watcher doesn't
      // re-pick it up on restart. Keep the original (don't delete) so
      // the user can re-process with a different cleanup mode later.
      if (result.ok) {
        const doneDir = path.join(folder, '_done')
        try {
          await fsp.mkdir(doneDir, { recursive: true })
          await fsp.rename(filePath, path.join(doneDir, path.basename(filePath)))
        } catch (err) {
          console.warn('[VoiceIntake] move-to-_done failed:', err)
        }
      } else {
        // On failure, move to `_failed/` with the error written next to it.
        const failedDir = path.join(folder, '_failed')
        try {
          await fsp.mkdir(failedDir, { recursive: true })
          const dst = path.join(failedDir, path.basename(filePath))
          await fsp.rename(filePath, dst)
          await fsp.writeFile(dst + '.error.txt', result.error ?? 'unknown error', 'utf8')
        } catch { /* noop */ }
      }
    } finally {
      inFlight.delete(filePath)
    }
  })
  return { ok: true }
}

export async function stopIntakeWatcher(): Promise<void> {
  if (watcher) {
    try { await watcher.close() } catch { /* noop */ }
  }
  watcher = null
  watchedFolder = null
}

export function getIntakeStatus(): { watching: boolean; folder: string | null; inFlight: number } {
  return { watching: !!watcher, folder: watchedFolder, inFlight: inFlight.size }
}
