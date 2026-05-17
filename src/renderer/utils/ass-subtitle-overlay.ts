// File: src/renderer/utils/ass-subtitle-overlay.ts
//
// #239 A-15 — Karaoke-style ASS subtitle overlay via libass-wasm.
// Renders Advanced SubStation Alpha subtitle files (the standard for
// styled karaoke / anime subs) on top of a video element. Pure WASM
// renderer — no main-process hop.
//
// Three ways to load subs:
//   1. URL → fetch + parse
//   2. File path (vault://) → fetch + parse
//   3. Inline ASS text → parse directly
//
// libass-wasm needs three blob assets: subtitles-octopus-worker.js,
// subtitles-octopus.wasm, default.woff2 (the default font fallback).
// Package ships them; we just point libass at the package dist URL.

// libass-wasm has no upstream types; treat as `any`.
// @ts-ignore — runtime API: new SubtitlesOctopus({ video, subUrl, ... })
import SubtitlesOctopus from 'libass-wasm'

export interface AssOverlayHandle {
  destroy: () => void
  setSubUrl: (url: string) => void
  setSubContent: (text: string) => void
  setVisible: (visible: boolean) => void
}

const WORKER_URL = 'https://cdn.jsdelivr.net/npm/libass-wasm@4/dist/js/subtitles-octopus-worker.js'
const LEGACY_WORKER_URL = 'https://cdn.jsdelivr.net/npm/libass-wasm@4/dist/js/subtitles-octopus-worker-legacy.js'

export interface AttachOptions {
  /** Either a URL/path/blob: to an .ass file, OR the literal ASS text. */
  subUrl?: string
  subContent?: string
  /** Force a font file (URL or local path); ASCII fallback if not set. */
  fonts?: string[]
}

export function attachOverlay(video: HTMLVideoElement, options: AttachOptions): AssOverlayHandle {
  let instance: any = null
  try {
    instance = new (SubtitlesOctopus as any)({
      video,
      subUrl: options.subUrl,
      subContent: options.subContent,
      workerUrl: WORKER_URL,
      legacyWorkerUrl: LEGACY_WORKER_URL,
      fonts: options.fonts ?? [],
    })
  } catch (err) {
    console.error('[ass-overlay] init failed:', err)
  }

  return {
    destroy: () => {
      try { instance?.dispose?.() } catch { /* ignore */ }
      instance = null
    },
    setSubUrl: (url: string) => {
      try { instance?.setTrackByUrl?.(url) } catch { /* ignore */ }
    },
    setSubContent: (text: string) => {
      try { instance?.setTrack?.(text) } catch { /* ignore */ }
    },
    setVisible: (visible: boolean) => {
      if (!instance) return
      try {
        // Octopus uses an absolutely-positioned canvas; toggling
        // display on it is the cleanest hide.
        const canvas = (instance as any).canvas as HTMLCanvasElement | undefined
        if (canvas) canvas.style.display = visible ? '' : 'none'
      } catch { /* ignore */ }
    },
  }
}

// Tiny helper to convert WebVTT to ASS (so the existing whisper-VTT
// transcripts can ride this overlay with karaoke styling). The
// conversion is naive — strips VTT cues, wraps each in an ASS Dialogue
// line with a single Default style.
export function vttToAss(vtt: string, options: { fontName?: string; fontSize?: number; primaryColor?: string } = {}): string {
  const fontName = options.fontName ?? 'Arial'
  const fontSize = options.fontSize ?? 36
  const color = (options.primaryColor ?? '&H00FFFFFF&').replace(/^#/, '&H00').toUpperCase()
  const header = `[Script Info]
ScriptType: v4.00+
PlayResX: 1920
PlayResY: 1080
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,${fontName},${fontSize},${color},&H000000FF,&H00000000,&H64000000,0,0,0,0,100,100,0,0,1,2,1,2,40,40,40,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`
  const cueRe = /(\d{2}):(\d{2}):(\d{2})\.(\d{3})\s+-->\s+(\d{2}):(\d{2}):(\d{2})\.(\d{3})/
  const fmt = (h: number, m: number, s: number, ms: number) => `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(Math.floor(ms / 10)).padStart(2, '0')}`
  const dialogues: string[] = []
  for (const block of vtt.split(/\r?\n\r?\n/)) {
    const m = cueRe.exec(block)
    if (!m) continue
    const start = fmt(Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4]))
    const end = fmt(Number(m[5]), Number(m[6]), Number(m[7]), Number(m[8]))
    const lines = block.split(/\r?\n/)
    const tsIdx = lines.findIndex((l) => cueRe.test(l))
    const text = lines.slice(tsIdx + 1).join('\\N').trim()
    if (text) dialogues.push(`Dialogue: 0,${start},${end},Default,,0,0,0,,${text}`)
  }
  return header + dialogues.join('\n') + '\n'
}
