// File: src/main/services/ai-intelligence/whisper-transcriber.ts
//
// Whisper.cpp integration for audio transcription. Detects an external
// whisper-cli.exe binary + ggml-tiny.en.bin model in known paths,
// extracts a 16kHz mono WAV via FFmpeg, runs transcription, and parses
// the transcript into keyword-based rich_tag priors.
//
// Why external binary instead of bundled transformers.js Whisper:
//   - whisper.cpp is ~25× faster on CPU (real-time on tiny.en)
//   - No 75MB+ JS bundle bloat
//   - User can pick model size (tiny / base / small / medium) without
//     us redownloading anything
//   - Same pattern as Xyrene's XTTS sidecar — separation of concerns
//
// Install paths checked (priority order):
//   1. C:\dev\whisper-cpp\
//   2. <userData>/whisper-cpp/
//   3. ~/whisper-cpp/
//
// Required files in the install dir:
//   - whisper-cli.exe  (or main.exe on older builds)
//   - models/ggml-tiny.en.bin  (or any ggml-*.bin — we pick the first)
//
// The transcription is treated as a SUPPLEMENTARY signal — Vault still
// runs without it. When the binary is missing the queue silently skips
// this step (logs at debug level).

import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { app } from 'electron'

const CANDIDATE_DIRS = (): string[] => [
  'C:\\dev\\whisper-cpp',
  path.join(app.getPath('userData'), 'whisper-cpp'),
  path.join(os.homedir(), 'whisper-cpp'),
]

const BINARY_CANDIDATES = ['whisper-cli.exe', 'main.exe', 'whisper.exe']
// Distil-Whisper variants take priority when installed — they're 6× faster
// than equivalent vanilla Whisper at ~similar WER on dialog. Drop the file
// at <userData>/whisper-cpp/models/ggml-distil-*.bin to activate.
// Order: prefer distil-medium-en (best accuracy/speed combo), then
// distil-small-en (smallest), then standard tiny/base.
const MODEL_GLOB_PRIORITY = [
  'ggml-distil-medium.en.bin',
  'ggml-distil-small.en.bin',
  'ggml-distil-large-v3.bin',
  'ggml-tiny.en.bin',
  'ggml-base.en.bin',
  'ggml-tiny.bin',
  'ggml-base.bin',
]

export interface WhisperInstall {
  installDir: string
  binaryPath: string
  modelPath: string
  modelName: string
}

/** Locate a whisper.cpp install on disk. Returns null if none found. */
export function findWhisperInstall(): WhisperInstall | null {
  for (const dir of CANDIDATE_DIRS()) {
    if (!fs.existsSync(dir)) continue
    // Find a binary in the install dir.
    let binaryPath: string | null = null
    for (const bin of BINARY_CANDIDATES) {
      const p = path.join(dir, bin)
      if (fs.existsSync(p)) { binaryPath = p; break }
    }
    if (!binaryPath) continue
    // Find a model. Prefer the priority list; fall back to any
    // ggml-*.bin in the dir or its models/ subdir.
    const modelDirs = [path.join(dir, 'models'), dir]
    let modelPath: string | null = null
    let modelName = ''
    outer: for (const md of modelDirs) {
      if (!fs.existsSync(md)) continue
      for (const m of MODEL_GLOB_PRIORITY) {
        const p = path.join(md, m)
        if (fs.existsSync(p)) { modelPath = p; modelName = m; break outer }
      }
      // Fallback — first ggml-*.bin we find.
      try {
        const files = fs.readdirSync(md).filter((f) => /^ggml-.+\.bin$/i.test(f))
        if (files.length > 0) {
          modelPath = path.join(md, files[0])
          modelName = files[0]
          break
        }
      } catch { /* ignore */ }
    }
    if (!modelPath) continue
    return { installDir: dir, binaryPath, modelPath, modelName }
  }
  return null
}

export interface WhisperTranscript {
  text: string
  /** Transcription wall time in ms. */
  durationMs: number
  installDir: string
}

/**
 * Extract a 16kHz mono PCM WAV from the source video via FFmpeg, run
 * whisper.cpp on it, parse the plaintext output. Returns null if the
 * whisper install is missing or anything in the pipeline fails.
 *
 * Speed: tiny.en on CPU is ~0.5× realtime → a 60s clip transcribes in
 * ~30s. base.en is ~1× realtime. We cap the audio sample at 90s
 * (first 90 seconds of the video) so even base.en stays under 90s
 * transcription time for any video length.
 */
export async function transcribeAudio(
  videoPath: string,
  ffmpegPath: string,
  options?: { maxAudioSec?: number; timeoutMs?: number }
): Promise<WhisperTranscript | null> {
  // Prefer the WhisperX sidecar when it's running — it gives us
  // word-level + speaker-diarized segments. Caller only consumes the
  // flat text; word-level/speaker data is preserved on the returned
  // object for callers that want it (cast to WhisperTranscript & {
  // segments?: WhisperXSegment[] }).
  // Side-effect-free probe — does NOT spawn the sidecar. The sidecar
  // is auto-started at app boot when settings.ai.whisperxAutoStart
  // is true; otherwise this falls through to whisper.cpp.
  try {
    const { isWhisperXReady, whisperxTranscribe } = await import('./whisperx-launcher')
    if (isWhisperXReady()) {
      const t0 = Date.now()
      const segments = await whisperxTranscribe(videoPath)
      if (segments && segments.length > 0) {
        const text = segments.map((s) => s.text.trim()).filter(Boolean).join(' ').trim()
        if (text) {
          return {
            text,
            durationMs: Date.now() - t0,
            installDir: 'whisperx-sidecar',
            // Stash the rich segments on the result so downstream
            // consumers (SFX-on-word triggers, diarized speaker UI)
            // can access them without re-running transcription.
            segments,
          } as WhisperTranscript & { segments: typeof segments }
        }
      }
    }
  } catch { /* fall through to whisper.cpp */ }

  const install = findWhisperInstall()
  if (!install) return null
  if (!fs.existsSync(videoPath)) return null

  const maxAudioSec = options?.maxAudioSec ?? 90
  const timeoutMs = options?.timeoutMs ?? 120_000
  const start = Date.now()

  // Stage 1: extract 16kHz mono WAV to a temp file.
  const tmpWav = path.join(
    app.getPath('temp'),
    `vault-whisper-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.wav`
  )
  try {
    // Preprocess: silenceremove strips silent stretches (cuts whisper
    // runtime on videos with long quiet sections — common in adult
    // content with non-vocal music). loudnorm normalizes RMS so quiet
    // breath / dirty-talk frames stay above whisper's confidence floor.
    // Both are pure ffmpeg filters — no extra deps.
    const wavOk = await new Promise<boolean>((resolve) => {
      const proc = spawn(ffmpegPath, [
        '-y', '-hide_banner', '-loglevel', 'error',
        '-i', videoPath,
        '-t', String(maxAudioSec),
        '-vn',
        '-ac', '1',          // mono
        '-ar', '16000',      // 16kHz — whisper.cpp expects this
        '-af', [
          // -50dB / 0.5s threshold — drops dead air without chopping
          // soft moans (which sit around -40 to -25 dB peak).
          'silenceremove=stop_periods=-1:stop_duration=0.5:stop_threshold=-50dB',
          // EBU R128 single-pass loudness normalize. Targets -16 LUFS
          // integrated (typical podcast / dialogue target). The
          // measure→reapply two-pass is more accurate but doubles
          // ffmpeg cost; single-pass is good enough for ASR input.
          'loudnorm=I=-16:LRA=11:TP=-1.5',
        ].join(','),
        '-f', 'wav',
        tmpWav,
      ], { windowsHide: true })
      proc.on('error', () => resolve(false))
      proc.on('close', (code) => resolve(code === 0 && fs.existsSync(tmpWav)))
    })
    if (!wavOk) return null

    // Stage 2: run whisper-cli with --no-prints --no-timestamps. Output
    // plaintext to stdout. Cap with timeout in case the model hangs.
    const text = await new Promise<string | null>((resolve) => {
      const proc = spawn(install.binaryPath, [
        '-m', install.modelPath,
        '-f', tmpWav,
        '--no-prints',
        '--no-timestamps',
        '-l', 'en',
        '-otxt', '-of', '-',  // write text format to stdout
        '--threads', String(Math.max(2, Math.floor((os.cpus()?.length ?? 4) / 2))),
      ], { windowsHide: true })
      let stdout = ''
      let stderr = ''
      proc.stdout?.on('data', (d) => { stdout += d.toString('utf8') })
      proc.stderr?.on('data', (d) => { stderr += d.toString('utf8') })
      const killTimer = setTimeout(() => {
        try { proc.kill('SIGKILL') } catch { /* ignore */ }
        resolve(null)
      }, timeoutMs)
      proc.on('error', () => { clearTimeout(killTimer); resolve(null) })
      proc.on('close', (code) => {
        clearTimeout(killTimer)
        if (code !== 0) {
          console.warn(`[Whisper] Exit ${code}: ${stderr.slice(-300)}`)
          resolve(null)
        } else {
          resolve(stdout.trim())
        }
      })
    })

    if (!text) return null
    return {
      text,
      durationMs: Date.now() - start,
      installDir: install.installDir,
    }
  } finally {
    try { fs.unlinkSync(tmpWav) } catch { /* ignore */ }
  }
}

export interface TranscriptTagPrior {
  name: string
  confidence: number
  source: 'transcript'
  /** The phrase from the transcript that matched. Logged for debugging. */
  matchedPhrase?: string
}

// Keyword → tag mapping. Each entry: regex (case-insensitive,
// word-boundary) → tag name + base confidence. The keyword list
// stays intentionally conservative — we want PRECISION over recall
// because false-positive tags from misheard transcripts are painful
// to clean up.
//
// IMPORTANT: this list MUST respect feedback_tag_quality_rules.md —
// no "fellatio" / "vaginal sex" output. Use canonical lay terms:
// "blowjob" / "sex" / etc.
const KEYWORD_RULES: Array<{ re: RegExp; tag: string; conf: number; reason?: string }> = [
  // Sex acts — canonical lay terms only (no clinical vocab per user pref).
  { re: /\b(suck(ing)? (your |my |his )?(cock|dick)|blowjob|give head|deepthroat)\b/i, tag: 'blowjob', conf: 0.6 },
  { re: /\beat(ing)? (your |my |her )?pussy\b/i, tag: 'cunnilingus', conf: 0.6 },
  { re: /\b(handjob|jerk(ing)? (your |me |him )?off|jerking it)\b/i, tag: 'handjob', conf: 0.6 },
  { re: /\b(titty fuck|titjob|tit(ty)? job|fucking (your |my |her )?tits)\b/i, tag: 'titjob', conf: 0.55 },
  { re: /\b(rim(ming|job))\b/i, tag: 'rimming', conf: 0.55 },
  { re: /\b(footjob|foot job)\b/i, tag: 'footjob', conf: 0.6 },
  // Positions — accept "doing X" / "in X" patterns.
  { re: /\b(doggy(style)?|from behind)\b/i, tag: 'doggystyle', conf: 0.5 },
  { re: /\b(missionary)\b/i, tag: 'missionary', conf: 0.5 },
  { re: /\b(cowgirl|riding (your |my |his )?(cock|dick))\b/i, tag: 'cowgirl', conf: 0.5 },
  { re: /\b(reverse cowgirl)\b/i, tag: 'reverse cowgirl', conf: 0.55 },
  // Climax / cumshot signals.
  { re: /\b(cumming|i'?m gonna cum|gonna cum|about to cum|i'?m close)\b/i, tag: 'orgasm', conf: 0.55 },
  { re: /\b(cum on (my |your |her )?(face|tits|ass|pussy))\b/i, tag: 'cumshot', conf: 0.55 },
  { re: /\b(creampie|inside me|cum inside)\b/i, tag: 'creampie', conf: 0.5 },
  // Dynamics / character.
  { re: /\b(daddy|good girl|good slut|fuck me harder|harder daddy)\b/i, tag: 'dirty talk', conf: 0.55 },
  { re: /\b(mommy|step ?(mom|sister|brother|dad)|step-(mom|sister|brother|dad))\b/i, tag: 'taboo', conf: 0.5 },
  { re: /\b(joi|jerk[\- ]?off instructions)\b/i, tag: 'joi', conf: 0.7 },
  { re: /\b(asmr|whisper(ing)?)\b/i, tag: 'asmr', conf: 0.55 },
  { re: /\b(role[\- ]?play|pretend (i'?m|you'?re))\b/i, tag: 'roleplay', conf: 0.5 },
  // Identifiers.
  { re: /\b(pov|point of view)\b/i, tag: 'pov', conf: 0.6 },
  { re: /\b(amateur|home (made|video))\b/i, tag: 'amateur', conf: 0.45 },
]

/**
 * Scan a transcript for keywords and emit tag priors. Each tag is
 * emitted at most once per transcript (the strongest match wins).
 *
 * Confidence ceiling is the rule's base confidence — we don't boost
 * based on multiple matches because that would over-weight chatty
 * transcripts. The cross-source agreement bonus in the queue handles
 * the "Venice ALSO said this" case.
 */
export function transcriptToTagPriors(transcript: string): TranscriptTagPrior[] {
  if (!transcript || transcript.length < 4) return []
  const emitted = new Map<string, TranscriptTagPrior>()
  for (const rule of KEYWORD_RULES) {
    const match = transcript.match(rule.re)
    if (!match) continue
    const existing = emitted.get(rule.tag)
    if (existing && existing.confidence >= rule.conf) continue
    emitted.set(rule.tag, {
      name: rule.tag,
      confidence: rule.conf,
      source: 'transcript',
      matchedPhrase: match[0],
    })
  }
  return Array.from(emitted.values())
}
