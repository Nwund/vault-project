// File: src/main/services/chapter-roundtrip.ts
//
// #233 — Read + write chapter metadata in MP4 / MKV files. Two formats:
//
//   - FFmetadata (embedded in the container)
//   - WebVTT chapter file (sidecar .vtt the player can load)
//
// Round-trip: extract chapters → user edits → write back via either
// the FFmetadata ingest (re-mux, no re-encode) or the sidecar VTT
// (no container touch). Most lossless tools (mkvtoolnix, MP4Box) do
// this; we do it via ffmpeg so we don't add a binary dependency.
//
// Public surface:
//   readChapters(ffprobePath, src)              → Chapter[]
//   writeChaptersFFMeta(ffmpegPath, src, dst, chapters)  → re-muxed file
//   exportChaptersAsVtt(chapters)               → VTT text
//   parseChaptersFromVtt(vttText, durationSec)  → Chapter[]

import { spawn } from 'node:child_process'
import { promises as fsp } from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import { nanoid } from 'nanoid'

export interface Chapter {
  startSec: number
  endSec: number
  title: string
}

// ──────────────────────────────────────────────────────────────────────
// Read
// ──────────────────────────────────────────────────────────────────────

export async function readChapters(ffprobePath: string, srcPath: string): Promise<Chapter[]> {
  // ffprobe -show_chapters -of json gives us start_time / end_time /
  // tags.title in one shot. We work in seconds; ffprobe emits both
  // raw timestamps and a *_time string version.
  const raw = await new Promise<string>((resolve, reject) => {
    const proc = spawn(ffprobePath, [
      '-hide_banner', '-loglevel', 'error',
      '-show_chapters',
      '-print_format', 'json',
      srcPath,
    ], { windowsHide: true })
    let buf = ''
    proc.stdout?.on('data', (d) => { buf += d.toString() })
    proc.on('error', reject)
    proc.on('close', (code) => code === 0 ? resolve(buf) : reject(new Error(`ffprobe exit ${code}`)))
  })
  let json: any
  try { json = JSON.parse(raw) } catch { return [] }
  const arr = Array.isArray(json?.chapters) ? json.chapters : []
  return arr.map((c: any, i: number) => ({
    startSec: Number(c.start_time ?? 0),
    endSec: Number(c.end_time ?? 0),
    title: String(c.tags?.title ?? `Chapter ${i + 1}`),
  })).filter((c: Chapter) => c.endSec > c.startSec)
}

// ──────────────────────────────────────────────────────────────────────
// Write via FFmetadata (re-mux, no re-encode)
// ──────────────────────────────────────────────────────────────────────

// FFmetadata format reference: https://ffmpeg.org/ffmpeg-formats.html#Metadata-2
// Header is `;FFMETADATA1\n`, then per-chapter blocks. TIMEBASE 1/1000
// lets us pass millisecond integers without floating-point rounding.
export function buildFFMetadata(chapters: Chapter[]): string {
  const lines: string[] = [';FFMETADATA1']
  for (const c of chapters) {
    const startMs = Math.round(c.startSec * 1000)
    const endMs = Math.round(c.endSec * 1000)
    lines.push(
      '[CHAPTER]',
      'TIMEBASE=1/1000',
      `START=${startMs}`,
      `END=${endMs}`,
      // Title goes through escape: '\\\\=', '\\\\;', '\\\\#', '\\\\\\n' per spec.
      `title=${c.title.replace(/[\\=;#\n]/g, (m) => '\\' + m)}`,
    )
  }
  return lines.join('\n') + '\n'
}

export async function writeChaptersFFMeta(
  ffmpegPath: string,
  srcPath: string,
  dstPath: string,
  chapters: Chapter[],
): Promise<{ ok: boolean; error?: string }> {
  const tmpDir = path.join(os.tmpdir(), 'vault-chapters')
  await fsp.mkdir(tmpDir, { recursive: true })
  const metaPath = path.join(tmpDir, `chapters-${nanoid(8)}.ffmeta`)
  await fsp.writeFile(metaPath, buildFFMetadata(chapters), 'utf8')
  try {
    return await new Promise((resolve) => {
      // -map_metadata 1 pulls chapter blocks from input #1 (the
      // FFmetadata file); -map_chapters 1 is the explicit chapter
      // routing. -c copy preserves audio + video bitstreams (no
      // re-encode). We strip any existing chapters from the input
      // via -map_metadata -1 on input #0 first.
      const proc = spawn(ffmpegPath, [
        '-hide_banner', '-y',
        '-i', srcPath,
        '-i', metaPath,
        '-map_metadata', '1',
        '-map_chapters', '1',
        '-c', 'copy',
        dstPath,
      ], { windowsHide: true })
      let stderr = ''
      proc.stderr?.on('data', (d) => { stderr += d.toString() })
      proc.on('error', (err) => resolve({ ok: false, error: err.message }))
      proc.on('close', (code) => {
        if (code === 0) resolve({ ok: true })
        else resolve({ ok: false, error: stderr.trim().split(/\r?\n/).slice(-5).join('\n') })
      })
    })
  } finally {
    try { await fsp.unlink(metaPath) } catch { /* ignore */ }
  }
}

// ──────────────────────────────────────────────────────────────────────
// WebVTT chapter sidecar
// ──────────────────────────────────────────────────────────────────────

function fmtVttTime(sec: number): string {
  const ms = Math.round(sec * 1000)
  const hh = String(Math.floor(ms / 3_600_000)).padStart(2, '0')
  const mm = String(Math.floor((ms % 3_600_000) / 60_000)).padStart(2, '0')
  const ss = String(Math.floor((ms % 60_000) / 1000)).padStart(2, '0')
  const mil = String(ms % 1000).padStart(3, '0')
  return `${hh}:${mm}:${ss}.${mil}`
}

export function exportChaptersAsVtt(chapters: Chapter[]): string {
  const lines: string[] = ['WEBVTT', '']
  for (let i = 0; i < chapters.length; i++) {
    const c = chapters[i]
    lines.push(
      `Chapter ${i + 1}`,
      `${fmtVttTime(c.startSec)} --> ${fmtVttTime(c.endSec)}`,
      c.title,
      '',
    )
  }
  return lines.join('\n')
}

const VTT_TIME_RE = /(\d{2}):(\d{2}):(\d{2})\.(\d{3})/
function parseVttTime(s: string): number {
  const m = VTT_TIME_RE.exec(s)
  if (!m) return 0
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) + Number(m[4]) / 1000
}

export function parseChaptersFromVtt(vttText: string, durationSec: number): Chapter[] {
  const out: Chapter[] = []
  const blocks = vttText.split(/\r?\n\r?\n/).map((b) => b.trim()).filter(Boolean)
  for (const block of blocks) {
    if (block.startsWith('WEBVTT')) continue
    const lines = block.split(/\r?\n/)
    // Find the cue line "HH:MM:SS.mmm --> HH:MM:SS.mmm"
    const cueIdx = lines.findIndex((l) => l.includes('-->'))
    if (cueIdx === -1) continue
    const cue = lines[cueIdx]
    const [startStr, endStr] = cue.split('-->').map((s) => s.trim())
    const start = parseVttTime(startStr)
    const end = parseVttTime(endStr)
    if (end <= start || end > durationSec + 1) continue
    const title = lines.slice(cueIdx + 1).join(' ').trim() || `Chapter ${out.length + 1}`
    out.push({ startSec: start, endSec: end, title })
  }
  return out
}
