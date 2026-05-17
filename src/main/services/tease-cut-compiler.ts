// File: src/main/services/tease-cut-compiler.ts
//
// #349 G-125 — Tease auto-cut compiler. Scans a video via NudeNet
// (or whatever per-frame nudity probability data we have cached),
// identifies frames just BEFORE nudity exposure, builds a supercut
// that always cuts away right before the reveal — peek-a-boo style.
//
// Pipeline:
//   1. Pull or compute per-frame nudity scores. We can read from
//      ai_analysis_results.nudity_score JSON (if NudeNet has scanned
//      the video) OR fall back to a fresh on-the-fly NudeNet pass
//      via the existing nudenet-detector wrapper.
//   2. Find "exposure events" — local peaks above threshold.
//   3. For each event, take a clip ending PAD seconds BEFORE the peak
//      (the build-up) and skip the actual exposure frames.
//   4. Concat the clips into a tease supercut via phrase-supercut's
//      ffmpeg concat engine (reused).
//
// Settings:
//   - threshold (0..1): how exposed before cutting (default 0.6)
//   - leadInSec: seconds of build-up to include before each event (3)
//   - cutawaySec: seconds we skip after each event start (4)
//   - maxClips: cap concat clip count (40)

import { spawn } from 'node:child_process'
import * as path from 'node:path'
import * as fs from 'node:fs'
import * as os from 'node:os'
import { nanoid } from 'nanoid'
import type Database from 'better-sqlite3'

type Raw = Database.Database

export interface ExposureEvent {
  startSec: number
  score: number
}

export interface TeaseCompileResult {
  ok: boolean
  clipsUsed?: number
  durationSec?: number
  events?: ExposureEvent[]
  error?: string
}

// Read per-frame nudity events from cached ai_analysis_results. The
// existing tier-1 NudeNet wrapper writes per-second bbox arrays into
// nudity_frames (JSON: [{ts, scoresByClass}]). Falls back to empty
// if the column isn't populated for this media.
export function getCachedExposureEvents(db: Raw, mediaId: string, threshold = 0.6): ExposureEvent[] {
  try {
    const row = db.prepare(`SELECT rich_tags FROM ai_analysis_results WHERE media_id = ?`).get(mediaId) as { rich_tags: string | null } | undefined
    if (!row?.rich_tags) return []
    const rich = JSON.parse(row.rich_tags)
    const frames: Array<{ ts: number; nudityScore?: number; classes?: Record<string, number> }> = rich.nudityFrames ?? rich.frames ?? []
    const peaks: ExposureEvent[] = []
    let lastPeakTs = -10
    for (const f of frames) {
      const score = f.nudityScore ?? Object.values(f.classes ?? {}).reduce((m, v) => Math.max(m, v), 0)
      if (score >= threshold && (f.ts - lastPeakTs) > 5) {
        peaks.push({ startSec: f.ts, score })
        lastPeakTs = f.ts
      }
    }
    return peaks
  } catch {
    return []
  }
}

export interface CompileTeaseOptions {
  threshold?: number      // 0..1 nudity probability that triggers a cut
  leadInSec?: number      // seconds of build-up to keep before each event
  cutawaySec?: number     // seconds skipped at each event (the part we hide)
  maxClips?: number
  videoCodec?: string
  width?: number
  height?: number
  fps?: number
}

export async function compileTeaseSupercut(
  ffmpegPath: string,
  mediaPath: string,
  events: ExposureEvent[],
  dstPath: string,
  options: CompileTeaseOptions = {},
): Promise<TeaseCompileResult> {
  const leadIn = options.leadInSec ?? 3
  const cutaway = options.cutawaySec ?? 4
  const maxClips = options.maxClips ?? 40
  const w = options.width ?? 1280
  const h = options.height ?? 720
  const fps = options.fps ?? 30
  const vcodec = options.videoCodec ?? 'libx264'

  const useEvents = events.slice(0, maxClips)
  if (useEvents.length === 0) return { ok: false, error: 'No exposure events to tease', events: [] }
  if (!fs.existsSync(mediaPath)) return { ok: false, error: `Source not found: ${mediaPath}` }

  // Build per-clip [-ss start -t lead] + complex filter that
  // normalizes each input then concats them.
  const args: string[] = ['-hide_banner', '-y']
  const filterParts: string[] = []
  let inputIdx = 0
  let totalDur = 0
  // Sort events ascending. Build clips that END at (event - 0.1s) to
  // avoid even a single frame of exposure leaking through.
  const sorted = [...useEvents].sort((a, b) => a.startSec - b.startSec)
  let lastClipEnd = -Infinity
  for (const ev of sorted) {
    const clipEnd = Math.max(0, ev.startSec - 0.1)
    const clipStart = Math.max(0, clipEnd - leadIn)
    if (clipEnd <= lastClipEnd) continue  // overlapping with previous build-up; skip
    const clipDur = clipEnd - clipStart
    if (clipDur < 0.5) continue
    args.push('-ss', clipStart.toFixed(3), '-t', clipDur.toFixed(3), '-i', mediaPath)
    filterParts.push(
      `[${inputIdx}:v]scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=${fps}[v${inputIdx}];` +
      `[${inputIdx}:a]aresample=async=1[a${inputIdx}]`
    )
    inputIdx++
    totalDur += clipDur
    lastClipEnd = ev.startSec + cutaway
  }
  if (inputIdx === 0) return { ok: false, error: 'No usable clips after dedup' }

  const concatLabels: string[] = []
  for (let i = 0; i < inputIdx; i++) concatLabels.push(`[v${i}][a${i}]`)
  const concat = `${concatLabels.join('')}concat=n=${inputIdx}:v=1:a=1[vout][aout]`
  const filterComplex = [...filterParts, concat].join(';')

  args.push(
    '-filter_complex', filterComplex,
    '-map', '[vout]', '-map', '[aout]',
    '-c:v', vcodec,
    ...(vcodec === 'libx264' ? ['-crf', '20', '-preset', 'medium'] : []),
    '-c:a', 'aac', '-b:a', '160k',
    dstPath,
  )

  return await new Promise<TeaseCompileResult>((resolve) => {
    const proc = spawn(ffmpegPath, args, { windowsHide: true })
    let stderr = ''
    proc.stderr?.on('data', (d) => { stderr += d.toString('utf8') })
    proc.on('error', (err) => resolve({ ok: false, clipsUsed: inputIdx, durationSec: totalDur, error: err.message, events: useEvents }))
    proc.on('close', (code) => {
      if (code === 0) resolve({ ok: true, clipsUsed: inputIdx, durationSec: totalDur, events: useEvents })
      else resolve({ ok: false, clipsUsed: inputIdx, durationSec: totalDur, error: stderr.trim().split(/\r?\n/).slice(-5).join('\n'), events: useEvents })
    })
  })
}
