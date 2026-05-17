// File: src/main/services/funscript-editor.ts
//
// #351 G-127 — Multi-axis Funscript editor backend. Funscript files
// are JSON describing stroke patterns for haptic toys (Handy, Kiiroo,
// OSR2, SR6 multi-axis). Vault already has an Intiface integration
// (#196 IntifaceCard); this is the SCRIPT side — edit/generate/save
// the timing data that drives the toy.
//
// Funscript v2 spec (multi-axis):
//   {
//     "version": "1.0",
//     "metadata": { ... },
//     "actions": [{ "at": <ms>, "pos": 0..100 }],         // single-axis (Handy)
//     "axes": {
//       "stroke":  [{ "at": ms, "pos": 0..100 }],         // OSR2/SR6 R0
//       "surge":   [{ ... }],                              // R1 forward/back
//       "sway":    [{ ... }],                              // R2 side/side
//       "twist":   [{ ... }],                              // L0 rotation
//       "roll":    [{ ... }],                              // L1
//       "pitch":   [{ ... }],                              // L2
//       "vibe0":   [{ ... }],
//       "suck":    [{ ... }]
//     }
//   }
//
// We persist edits to ScriptPath.funscript next to the media (or to
// a userData/funscripts/ folder if write-next-to is denied). The
// existing Intiface integration auto-discovers scripts in those
// locations.

import { promises as fsp } from 'node:fs'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { app } from 'electron'

export type FunscriptAxis = 'stroke' | 'surge' | 'sway' | 'twist' | 'roll' | 'pitch' | 'vibe0' | 'suck'

export interface FunscriptAction {
  at: number    // milliseconds from start
  pos: number   // 0..100
}

export interface Funscript {
  version: string
  metadata?: Record<string, any>
  // v1 single-axis (Handy):
  actions?: FunscriptAction[]
  // v2 multi-axis (OSR2/SR6):
  axes?: Partial<Record<FunscriptAxis, FunscriptAction[]>>
}

function fallbackPath(mediaId: string): string {
  return path.join(app.getPath('userData'), 'funscripts', `${mediaId}.funscript`)
}

function siblingPath(mediaPath: string): string {
  const ext = path.extname(mediaPath)
  return mediaPath.slice(0, mediaPath.length - ext.length) + '.funscript'
}

export async function load(mediaPath: string, mediaId: string): Promise<Funscript | null> {
  const candidates = [siblingPath(mediaPath), fallbackPath(mediaId)]
  for (const p of candidates) {
    try {
      if (!fs.existsSync(p)) continue
      const raw = await fsp.readFile(p, 'utf8')
      const parsed = JSON.parse(raw)
      return normalize(parsed)
    } catch (err) {
      console.warn(`[funscript] failed to read ${p}:`, err)
    }
  }
  return null
}

export async function save(mediaPath: string, mediaId: string, script: Funscript): Promise<string> {
  const normalized = normalize(script)
  // Try sibling first; fall back to userData on permission failure.
  const sib = siblingPath(mediaPath)
  try {
    await fsp.writeFile(sib, JSON.stringify(normalized, null, 2), 'utf8')
    return sib
  } catch {
    const fb = fallbackPath(mediaId)
    await fsp.mkdir(path.dirname(fb), { recursive: true })
    await fsp.writeFile(fb, JSON.stringify(normalized, null, 2), 'utf8')
    return fb
  }
}

function normalize(script: any): Funscript {
  // Sort actions per axis + clamp pos to [0,100]. Round timestamps
  // to nearest ms.
  const clean = (arr: any[]): FunscriptAction[] => {
    if (!Array.isArray(arr)) return []
    return arr.map((a) => ({
      at: Math.max(0, Math.round(Number(a.at) || 0)),
      pos: Math.max(0, Math.min(100, Math.round(Number(a.pos) || 0))),
    })).sort((a, b) => a.at - b.at)
  }
  const out: Funscript = { version: script.version ?? '1.0', metadata: script.metadata }
  if (Array.isArray(script.actions)) out.actions = clean(script.actions)
  if (script.axes && typeof script.axes === 'object') {
    out.axes = {}
    for (const ax of Object.keys(script.axes)) {
      out.axes[ax as FunscriptAxis] = clean(script.axes[ax])
    }
  }
  return out
}

// Generate a synthetic funscript from a Cock-Hero beatmap (#352).
// Down-stroke beats → pos 100→0 fall; up-strokes → 0→100 rise.
export function fromBeatmap(beats: Array<{ timeSec: number; stroke: 'up' | 'down'; intensity: number }>, options: { axis?: FunscriptAxis; baseDepth?: number } = {}): Funscript {
  const axis = options.axis ?? 'stroke'
  const baseDepth = Math.max(20, Math.min(100, options.baseDepth ?? 60))
  const actions: FunscriptAction[] = []
  for (const b of beats) {
    // Accent beats go deeper; ordinary beats stay at baseDepth.
    const depth = Math.round(baseDepth + (b.intensity - 0.5) * 40)
    const pos = b.stroke === 'down' ? Math.max(0, 100 - depth) : Math.min(100, depth + 20)
    actions.push({ at: Math.round(b.timeSec * 1000), pos })
  }
  return { version: '1.0', actions: axis === 'stroke' ? actions : undefined, axes: axis === 'stroke' ? undefined : { [axis]: actions } as any }
}

// Apply a global gain/depth scaling to all actions (0.5x = halve, 2x = double).
export function scaleDepth(script: Funscript, factor: number, center = 50): Funscript {
  const f = Math.max(0, Math.min(3, factor))
  const apply = (a: FunscriptAction): FunscriptAction => ({
    at: a.at,
    pos: Math.max(0, Math.min(100, Math.round((a.pos - center) * f + center))),
  })
  const out: Funscript = { version: script.version, metadata: script.metadata }
  if (script.actions) out.actions = script.actions.map(apply)
  if (script.axes) {
    out.axes = {}
    for (const [ax, arr] of Object.entries(script.axes)) {
      out.axes[ax as FunscriptAxis] = arr!.map(apply)
    }
  }
  return out
}

// Time-shift all actions by `offsetMs` (positive = later, negative = earlier).
export function timeShift(script: Funscript, offsetMs: number): Funscript {
  const apply = (a: FunscriptAction): FunscriptAction => ({ at: Math.max(0, a.at + offsetMs), pos: a.pos })
  const out: Funscript = { version: script.version, metadata: script.metadata }
  if (script.actions) out.actions = script.actions.map(apply)
  if (script.axes) {
    out.axes = {}
    for (const [ax, arr] of Object.entries(script.axes)) {
      out.axes[ax as FunscriptAxis] = arr!.map(apply)
    }
  }
  return out
}
