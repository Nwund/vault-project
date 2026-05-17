// File: src/main/services/ai-intelligence/auto-trim.ts
//
// #237 — Detect leading/trailing silence + black frames in a video and
// emit "virtual trim points" the user can review and (optionally)
// commit via a re-encode. Two stages:
//
//   1. Detection: ffmpeg silencedetect + blackdetect filters run in
//      one pass. Parse stderr for `silence_start/silence_end` and
//      `black_start/black_end` event pairs. Returns candidate trim
//      ranges with confidence (longer + earlier = higher).
//
//   2. (Optional) Apply: ffmpeg -ss IN -to OUT -c copy stream-copy
//      to write a new file with the dead air shaved off. Caller
//      decides whether to overwrite or save-as.
//
// Detection is non-destructive — we never touch the original unless
// the apply step is explicitly invoked.

import { spawn } from 'node:child_process'

export interface SilencePeriod {
  startSec: number
  endSec: number
  durationSec: number
}

export interface BlackPeriod {
  startSec: number
  endSec: number
  durationSec: number
}

export interface AutoTrimReport {
  durationSec: number
  silences: SilencePeriod[]
  blacks: BlackPeriod[]
  // Recommended trim window: skip leading dead air, stop before
  // trailing dead air. Set to null when the file is too short or
  // has nothing worth trimming.
  recommendation: { startSec: number; endSec: number; savedSec: number } | null
}

const SILENCE_THRESH_DB = -45
const SILENCE_MIN_DUR = 0.5
const BLACK_PIX_THRESH = 0.10
const BLACK_MIN_DUR = 0.5

export async function analyzeAutoTrim(ffmpegPath: string, videoPath: string): Promise<AutoTrimReport> {
  const stderr = await runDetect(ffmpegPath, videoPath)
  const duration = parseDuration(stderr)
  const silences = parseSilences(stderr)
  const blacks = parseBlacks(stderr)
  const recommendation = recommendTrim(duration, silences, blacks)
  return { durationSec: duration, silences, blacks, recommendation }
}

function runDetect(ffmpegPath: string, videoPath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpegPath, [
      '-hide_banner', '-nostats',
      '-i', videoPath,
      '-vf', `blackdetect=d=${BLACK_MIN_DUR}:pix_th=${BLACK_PIX_THRESH}`,
      '-af', `silencedetect=noise=${SILENCE_THRESH_DB}dB:d=${SILENCE_MIN_DUR}`,
      '-f', 'null', '-',
    ], { windowsHide: true })
    let buf = ''
    proc.stderr?.on('data', (d) => { buf += d.toString() })
    proc.on('error', reject)
    proc.on('close', () => resolve(buf))
  })
}

function parseDuration(stderr: string): number {
  // "Duration: 01:23:45.67"
  const m = /Duration:\s*(\d+):(\d+):(\d+\.\d+)/.exec(stderr)
  if (!m) return 0
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3])
}

function parseSilences(stderr: string): SilencePeriod[] {
  const out: SilencePeriod[] = []
  // silencedetect emits pairs:
  //  [silencedetect @ ..] silence_start: 12.345
  //  [silencedetect @ ..] silence_end: 18.901 | silence_duration: 6.556
  const startRe = /silence_start:\s*([\d.]+)/g
  const endRe = /silence_end:\s*([\d.]+)\s*\|\s*silence_duration:\s*([\d.]+)/g
  const starts: number[] = []
  let m: RegExpExecArray | null
  while ((m = startRe.exec(stderr)) !== null) starts.push(Number(m[1]))
  let idx = 0
  while ((m = endRe.exec(stderr)) !== null) {
    const end = Number(m[1])
    const dur = Number(m[2])
    const start = starts[idx++] ?? end - dur
    out.push({ startSec: start, endSec: end, durationSec: dur })
  }
  return out
}

function parseBlacks(stderr: string): BlackPeriod[] {
  const out: BlackPeriod[] = []
  // blackdetect emits one line per period:
  //  [blackdetect @ ..] black_start:12.34 black_end:14.56 black_duration:2.22
  const re = /black_start:([\d.]+)\s+black_end:([\d.]+)\s+black_duration:([\d.]+)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(stderr)) !== null) {
    out.push({ startSec: Number(m[1]), endSec: Number(m[2]), durationSec: Number(m[3]) })
  }
  return out
}

// Walk silences + blacks; if both agree on a leading dead-air period
// (start ≈ 0) or a trailing one (end ≈ duration), recommend trimming.
function recommendTrim(duration: number, silences: SilencePeriod[], blacks: BlackPeriod[]): AutoTrimReport['recommendation'] {
  if (duration < 5) return null
  let trimStart = 0
  let trimEnd = duration
  const leadSilence = silences.find((s) => s.startSec < 1.0)
  const leadBlack = blacks.find((b) => b.startSec < 1.0)
  if (leadSilence && leadBlack) {
    trimStart = Math.max(0, Math.min(leadSilence.endSec, leadBlack.endSec) - 0.2)
  } else if (leadSilence && leadSilence.durationSec > 2) {
    trimStart = Math.max(0, leadSilence.endSec - 0.2)
  } else if (leadBlack && leadBlack.durationSec > 1) {
    trimStart = Math.max(0, leadBlack.endSec - 0.1)
  }
  const tailSilence = [...silences].reverse().find((s) => duration - s.endSec < 1.0)
  const tailBlack = [...blacks].reverse().find((b) => duration - b.endSec < 1.0)
  if (tailSilence && tailBlack) {
    trimEnd = Math.max(tailSilence.startSec, tailBlack.startSec) + 0.2
  } else if (tailSilence && tailSilence.durationSec > 2) {
    trimEnd = tailSilence.startSec + 0.2
  } else if (tailBlack && tailBlack.durationSec > 1) {
    trimEnd = tailBlack.startSec + 0.1
  }
  const saved = (trimStart - 0) + (duration - trimEnd)
  if (saved < 1.0) return null
  return { startSec: trimStart, endSec: trimEnd, savedSec: saved }
}

// Stream-copy the trimmed range to a new file. Fast (no re-encode);
// keyframe-aligned cuts only. Caller picks the dst path.
export function applyTrim(
  ffmpegPath: string,
  srcPath: string,
  dstPath: string,
  startSec: number,
  endSec: number,
): Promise<{ ok: boolean; error?: string }> {
  return new Promise((resolve) => {
    const proc = spawn(ffmpegPath, [
      '-hide_banner', '-loglevel', 'error',
      '-ss', startSec.toFixed(3),
      '-to', endSec.toFixed(3),
      '-i', srcPath,
      '-c', 'copy',
      '-avoid_negative_ts', 'make_zero',
      dstPath,
    ], { windowsHide: true })
    let stderr = ''
    proc.stderr?.on('data', (d) => { stderr += d.toString() })
    proc.on('error', (err) => resolve({ ok: false, error: err.message }))
    proc.on('close', (code) => {
      if (code === 0) resolve({ ok: true })
      else resolve({ ok: false, error: stderr.trim() || `ffmpeg exit ${code}` })
    })
  })
}
