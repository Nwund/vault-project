// File: src/main/services/phrase-supercut.ts
//
// #380 H-156 — Phrase-triggered supercut compiler. Given a query
// phrase ("oh god", "fuck me", performer name, etc.), find every
// transcript segment that matches across the library and stitch the
// matched clips into a single supercut video.
//
// Pipeline:
//   1. FTS5 search media_transcript_segments for the phrase
//   2. For each hit: (media_id, start_sec, end_sec, text)
//   3. Build an ffmpeg concat list with pre/post padding
//   4. Encode to dst via concat filter (handles mixed codecs/resolutions
//      better than stream-copy demuxer)
//
// Caching: transcribe-on-demand cost is high (~1× realtime), so the
// service refuses to operate on media without cached segments. Caller
// should batch-transcribe first via the whisper:transcribeVtt IPC
// then call persistSegments() to write them to the table.

import { spawn } from 'node:child_process'
import { promises as fsp } from 'node:fs'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import { nanoid } from 'nanoid'
import type Database from 'better-sqlite3'

type Raw = Database.Database

export interface SupercutHit {
  mediaId: string
  segmentIdx: number
  startSec: number
  endSec: number
  text: string
  mediaPath: string
  mediaFilename: string
}

/**
 * Persist whisper VTT segments to the search table. Call once per media
 * after whisper:transcribeVtt completes. Idempotent — re-running deletes
 * the prior segments first.
 */
export function persistSegments(
  db: Raw,
  mediaId: string,
  segments: Array<{ startSec: number; endSec: number; text: string }>,
): void {
  const tx = db.transaction((mid: string, segs: typeof segments) => {
    db.prepare(`DELETE FROM media_transcript_segments WHERE media_id = ?`).run(mid)
    const ins = db.prepare(`INSERT INTO media_transcript_segments (media_id, idx, start_sec, end_sec, text) VALUES (?, ?, ?, ?, ?)`)
    for (let i = 0; i < segs.length; i++) {
      ins.run(mid, i, segs[i].startSec, segs[i].endSec, segs[i].text)
    }
  })
  tx(mediaId, segments)
}

/**
 * FTS5 search for a phrase. Returns hits with their media paths so the
 * compiler can read the source files. `phrase` accepts FTS5 syntax
 * (quoted phrase, AND/OR/NOT, *, etc.).
 */
export function searchPhrase(db: Raw, phrase: string, opts: { limit?: number; mediaIdFilter?: string[] } = {}): SupercutHit[] {
  const limit = Math.max(1, Math.min(opts.limit ?? 500, 5000))
  // Sanitize for FTS5: wrap unquoted single-word queries in quotes; pass
  // quoted/multi-word queries through verbatim so the user can use
  // advanced syntax intentionally.
  const ftsQuery = /^[\w\s]+$/.test(phrase.trim()) ? `"${phrase.trim()}"` : phrase.trim()
  // FTS5 join → segments → media for path lookup.
  const rows = db.prepare(`
    SELECT s.media_id AS mediaId, s.idx AS segmentIdx, s.start_sec AS startSec, s.end_sec AS endSec, s.text AS text,
           m.path AS mediaPath, m.filename AS mediaFilename
    FROM media_transcript_segments_fts f
    JOIN media_transcript_segments s ON s.id = f.rowid
    JOIN media m ON m.id = s.media_id
    WHERE media_transcript_segments_fts MATCH ?
    ORDER BY s.media_id, s.idx
    LIMIT ?
  `).all(ftsQuery, limit) as any[]
  if (opts.mediaIdFilter) {
    const set = new Set(opts.mediaIdFilter)
    return rows.filter((r) => set.has(r.mediaId))
  }
  return rows
}

export interface CompileOptions {
  /** Seconds of context before each cue. Default 1. */
  padBeforeSec?: number
  /** Seconds of context after each cue. Default 1. */
  padAfterSec?: number
  /** Output container/codec. Default mp4/h264. */
  videoCodec?: string
  /** Force resolution + framerate normalization for the concat filter
   *  (otherwise mixed source resolutions confuse the encoder). */
  width?: number
  height?: number
  fps?: number
  /** Hard cap on number of clips concatenated. Default 60. */
  maxClips?: number
}

/**
 * Compile a supercut from hits. Each hit becomes a [start-pad, end+pad]
 * clip; clips are concat-filter joined into dstPath. Returns the
 * actual hit count used (may be smaller than input if maxClips truncates).
 */
export async function compileSupercut(
  ffmpegPath: string,
  hits: SupercutHit[],
  dstPath: string,
  options: CompileOptions = {},
): Promise<{ ok: boolean; clipsUsed: number; durationSec: number; error?: string }> {
  const padBefore = options.padBeforeSec ?? 1
  const padAfter = options.padAfterSec ?? 1
  const maxClips = options.maxClips ?? 60
  const w = options.width ?? 1280
  const h = options.height ?? 720
  const fps = options.fps ?? 30
  const vcodec = options.videoCodec ?? 'libx264'

  const useHits = hits.slice(0, maxClips)
  if (useHits.length === 0) return { ok: false, clipsUsed: 0, durationSec: 0, error: 'No hits' }

  // Build per-clip [-i src -ss start -t dur] + complex filter that
  // normalizes each input then concats them. Each input needs scale +
  // pad + setsar + fps so the concat filter sees uniform streams.
  const args: string[] = ['-hide_banner', '-y']
  const filterParts: string[] = []
  let inputIdx = 0
  let totalDur = 0
  for (const hit of useHits) {
    if (!fs.existsSync(hit.mediaPath)) continue
    const clipStart = Math.max(0, hit.startSec - padBefore)
    const clipDur = (hit.endSec - hit.startSec) + padBefore + padAfter
    args.push('-ss', clipStart.toFixed(3), '-t', clipDur.toFixed(3), '-i', hit.mediaPath)
    filterParts.push(
      `[${inputIdx}:v]scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=${fps}[v${inputIdx}];` +
      `[${inputIdx}:a]aresample=async=1[a${inputIdx}]`
    )
    inputIdx++
    totalDur += clipDur
  }
  if (inputIdx === 0) return { ok: false, clipsUsed: 0, durationSec: 0, error: 'No readable source files' }

  // Concat label: [v0][a0][v1][a1]…concat=n=N:v=1:a=1[vout][aout]
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

  return await new Promise((resolve) => {
    const proc = spawn(ffmpegPath, args, { windowsHide: true })
    let stderr = ''
    proc.stderr?.on('data', (d) => { stderr += d.toString('utf8') })
    proc.on('error', (err) => resolve({ ok: false, clipsUsed: inputIdx, durationSec: totalDur, error: err.message }))
    proc.on('close', (code) => {
      if (code === 0) resolve({ ok: true, clipsUsed: inputIdx, durationSec: totalDur })
      else resolve({ ok: false, clipsUsed: inputIdx, durationSec: totalDur, error: stderr.trim().split(/\r?\n/).slice(-5).join('\n') })
    })
  })
}
