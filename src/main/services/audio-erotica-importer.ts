// File: src/main/services/audio-erotica-importer.ts
//
// #367 H-143 — Audio-erotica importer with cue extraction. Parses
// timed transcript files in three common formats:
//
//   1. LRC lyrics (Quinn / Dipsea / audio-erotica community):
//        [00:01.50] "Mmm, baby..."
//        [00:03.20] "Touch yourself for me."
//   2. Plain text with bracketed timestamps:
//        [01:23.45] cue text here
//        (1:23) cue text
//   3. WebVTT (already handled by whisper-vtt — reused here)
//
// Output: array of { timeSec, text } cues + an optional title /
// description / performer block scraped from the file header.
//
// The cues can be fed back into the JOI player (#G-129) so the user
// can play an imported erotica file with timed XTTS-Xyrene reads
// instead of the original creator's voice (if they want).

import { promises as fsp } from 'node:fs'

export interface AudioEroticaCue {
  timeSec: number
  text: string
}

export interface AudioEroticaImport {
  ok: boolean
  format?: 'lrc' | 'vtt' | 'bracketed' | 'unknown'
  title?: string
  performer?: string
  durationSec?: number  // last cue's timestamp
  cues: AudioEroticaCue[]
  error?: string
}

const LRC_HEADER_RE = /^\[(ti|ar|al|by|length|au):(.+?)\]\s*$/i
const LRC_CUE_RE = /^\[(\d+):(\d+)(?:\.(\d+))?\](.*)$/
const BRACKETED_CUE_RE = /^\s*[\[(]\s*(\d+):(\d+)(?:[.:](\d+))?\s*[\])]\s*(.+?)\s*$/

export async function importFromFile(filePath: string): Promise<AudioEroticaImport> {
  let text: string
  try {
    text = await fsp.readFile(filePath, 'utf8')
  } catch (err: any) {
    return { ok: false, cues: [], error: `read failed: ${err.message}` }
  }
  return importFromText(text)
}

export function importFromText(text: string): AudioEroticaImport {
  const lines = text.split(/\r?\n/)
  const cues: AudioEroticaCue[] = []
  let title: string | undefined
  let performer: string | undefined
  let format: AudioEroticaImport['format'] = 'unknown'

  // WebVTT detection — must start with "WEBVTT"
  if (lines[0]?.trim().startsWith('WEBVTT')) {
    return parseVtt(text)
  }

  for (const raw of lines) {
    const line = raw.replace(/^﻿/, '').trim()  // strip BOM
    if (!line) continue
    // LRC metadata header
    const meta = LRC_HEADER_RE.exec(line)
    if (meta) {
      const tag = meta[1].toLowerCase()
      const val = meta[2].trim()
      if (tag === 'ti') title = val
      else if (tag === 'ar' || tag === 'by' || tag === 'au') performer = val
      format = 'lrc'
      continue
    }
    // LRC cue ([mm:ss.xx]text)
    const lrc = LRC_CUE_RE.exec(line)
    if (lrc) {
      const min = Number(lrc[1])
      const sec = Number(lrc[2])
      const csec = lrc[3] ? Number(`0.${lrc[3]}`) : 0
      const text = lrc[4].trim().replace(/^"|"$/g, '')
      if (text) {
        cues.push({ timeSec: min * 60 + sec + csec, text })
        if (format === 'unknown') format = 'lrc'
      }
      continue
    }
    // Bracketed/parenthesized (1:23) text
    const bracket = BRACKETED_CUE_RE.exec(line)
    if (bracket) {
      const min = Number(bracket[1])
      const sec = Number(bracket[2])
      const csec = bracket[3] ? Number(`0.${bracket[3]}`) : 0
      const text = bracket[4].trim().replace(/^"|"$/g, '')
      if (text) {
        cues.push({ timeSec: min * 60 + sec + csec, text })
        if (format === 'unknown') format = 'bracketed'
      }
      continue
    }
  }

  cues.sort((a, b) => a.timeSec - b.timeSec)
  return {
    ok: cues.length > 0,
    format,
    title, performer,
    durationSec: cues.length > 0 ? cues[cues.length - 1].timeSec : 0,
    cues,
  }
}

function parseVtt(vtt: string): AudioEroticaImport {
  const cues: AudioEroticaCue[] = []
  const blocks = vtt.split(/\r?\n\r?\n/)
  const cueRe = /(\d{2}):(\d{2}):(\d{2})\.(\d{3})\s+-->\s+\d{2}:\d{2}:\d{2}\.\d{3}/
  let title: string | undefined
  let performer: string | undefined
  for (const block of blocks) {
    const noteMatch = /NOTE\s+(.+)/i.exec(block)
    if (noteMatch && !title) title = noteMatch[1].trim()
    const m = cueRe.exec(block)
    if (!m) continue
    const start = Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) + Number(m[4]) / 1000
    const linesInBlock = block.split(/\r?\n/)
    const tsIdx = linesInBlock.findIndex((l) => cueRe.test(l))
    const cueText = linesInBlock.slice(tsIdx + 1).join(' ').trim()
    if (cueText) cues.push({ timeSec: start, text: cueText })
  }
  return {
    ok: cues.length > 0,
    format: 'vtt',
    title, performer,
    durationSec: cues.length > 0 ? cues[cues.length - 1].timeSec : 0,
    cues,
  }
}

// Convert imported cues → a JOI-script string that the JOI player
// can consume directly (#G-129 / joi-script-player.ts). Each cue
// becomes either an explicit pause or a speak line.
export function importToJoiScript(imp: AudioEroticaImport, options: { voice?: string } = {}): string {
  const lines: string[] = []
  if (imp.title) lines.push(`# ${imp.title}`)
  if (imp.performer) lines.push(`# by ${imp.performer}`)
  if (options.voice) lines.push(`# voice: ${options.voice}`)
  let cursor = 0
  for (const cue of imp.cues) {
    const gap = cue.timeSec - cursor
    if (gap > 0.5) lines.push(`[pause:${gap.toFixed(1)}]`)
    if (options.voice) lines.push(`[voice:${options.voice}] ${cue.text}`)
    else lines.push(cue.text)
    cursor = cue.timeSec
  }
  return lines.join('\n')
}
