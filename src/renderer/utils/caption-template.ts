// File: src/renderer/utils/caption-template.ts
//
// Caption template variable expansion. Lets users write captions like
// "Watching {performer} for {duration}" and have placeholders replaced
// at render/export time. Unknown variables become empty strings; the
// surrounding whitespace is collapsed so "{performer} alone" → "alone"
// when no performer is known, instead of "  alone".

export interface CaptionContext {
  filename?: string | null
  title?: string | null
  durationSec?: number | null
  tags?: string[] | null
  performers?: string[] | null
  studio?: string | null
  rating?: number | null
  /** Optional override map for unrecognized variables. */
  extra?: Record<string, string | number | null | undefined>
}

function formatDuration(sec: number): string {
  if (!Number.isFinite(sec) || sec <= 0) return ''
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = Math.floor(sec % 60)
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
  return `${m}:${s.toString().padStart(2, '0')}`
}

function resolve(varName: string, ctx: CaptionContext): string {
  const v = varName.toLowerCase()
  // Performers list — first performer + count fallback
  if (v === 'performer' || v === 'performers') {
    const p = ctx.performers ?? []
    if (p.length === 0) return ''
    if (p.length === 1 || v === 'performer') return p[0]
    return p.join(', ')
  }
  if (v === 'duration') {
    return ctx.durationSec != null ? formatDuration(ctx.durationSec) : ''
  }
  if (v === 'minutes') {
    if (ctx.durationSec == null) return ''
    return Math.floor(ctx.durationSec / 60).toString()
  }
  if (v === 'tags') {
    return (ctx.tags ?? []).join(', ')
  }
  if (v === 'tag1' || v === 'firsttag') {
    return ctx.tags?.[0] ?? ''
  }
  if (v === 'title') return ctx.title ?? ''
  if (v === 'filename') {
    if (!ctx.filename) return ''
    return ctx.filename.replace(/\.[^.]+$/, '')
  }
  if (v === 'studio') return ctx.studio ?? ''
  if (v === 'rating') return ctx.rating != null ? `${ctx.rating}★` : ''
  // Fall through to user-supplied extras (case-insensitive).
  if (ctx.extra) {
    for (const k of Object.keys(ctx.extra)) {
      if (k.toLowerCase() === v) {
        const val = ctx.extra[k]
        return val == null ? '' : String(val)
      }
    }
  }
  return ''
}

export function expandCaptionTemplate(text: string | null | undefined, ctx: CaptionContext): string {
  if (!text) return ''
  if (text.indexOf('{') === -1) return text
  // Replace {varname} ignoring escaped \{ — keep parser lean.
  const expanded = text.replace(/\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g, (_m, name: string) => {
    return resolve(name, ctx)
  })
  // Collapse runs of whitespace introduced by empty replacements, and
  // trim leading/trailing whitespace per line so " hello" doesn't get
  // an awkward leading space when {tag} was empty.
  return expanded
    .split('\n')
    .map((line) => line.replace(/[ \t]{2,}/g, ' ').trim())
    .join('\n')
}

/** Known variable names — surfaced in UI hints so users discover them. */
export const KNOWN_CAPTION_VARIABLES = [
  'performer', 'performers', 'duration', 'minutes',
  'tags', 'tag1', 'title', 'filename', 'studio', 'rating',
] as const
