// File: src/main/services/task-wheel.ts
//
// #358 G-134 — Tease & denial task wheel. Random task picker with
// weighted probabilities. The wheel fires every N minutes during an
// active edging session (or on demand). Each task has a category
// (edge / pause / reverse / position / sensation), a weight, and an
// optional duration that the UI can countdown.
//
// Task pool is persisted in settings.taskWheelPool. Defaults to a
// 24-task starter pool covering common edging/denial directives.
// Per-task `weight` defaults to 1; categories can be muted via
// settings.taskWheelDisabledCategories.

import { getSettings, updateSettings } from '../settings'

export type TaskCategory = 'edge' | 'pause' | 'reverse' | 'position' | 'sensation' | 'denial'

export interface WheelTask {
  id: string
  text: string
  category: TaskCategory
  weight: number          // higher = more likely (default 1)
  durationSec?: number    // optional UI countdown
  intensity?: 1 | 2 | 3 | 4 | 5  // 1 = mild, 5 = brutal
}

const DEFAULT_POOL: WheelTask[] = [
  // Edge (most common — base of the activity)
  { id: 'edge-30', text: 'Edge for 30 seconds. Stop right before.', category: 'edge', weight: 3, durationSec: 30, intensity: 3 },
  { id: 'edge-60', text: 'Edge for a full minute. No release.', category: 'edge', weight: 2, durationSec: 60, intensity: 4 },
  { id: 'edge-90', text: 'Edge for 90 seconds. Right at the line, hold it.', category: 'edge', weight: 1, durationSec: 90, intensity: 5 },
  { id: 'edge-3x', text: 'Edge 3 times in a row. Stop fully between each.', category: 'edge', weight: 2, intensity: 4 },
  // Pause (reset)
  { id: 'pause-60', text: 'Hands off for 60 seconds.', category: 'pause', weight: 2, durationSec: 60, intensity: 2 },
  { id: 'pause-180', text: 'Hands off for 3 minutes. Watch only.', category: 'pause', weight: 1, durationSec: 180, intensity: 3 },
  { id: 'pause-cold', text: 'Hands off until you feel cold air for a beat.', category: 'pause', weight: 1, intensity: 2 },
  // Reverse / switch
  { id: 'rev-hand', text: 'Switch hands for the next 2 minutes.', category: 'reverse', weight: 2, durationSec: 120, intensity: 2 },
  { id: 'rev-grip', text: 'Reverse grip for the next 2 minutes.', category: 'reverse', weight: 2, durationSec: 120, intensity: 3 },
  { id: 'rev-slow', text: 'Quarter your speed for the next minute.', category: 'reverse', weight: 2, durationSec: 60, intensity: 2 },
  { id: 'rev-tip', text: 'Tip only for the next 60 seconds.', category: 'reverse', weight: 2, durationSec: 60, intensity: 3 },
  // Position
  { id: 'pos-stand', text: 'Stand up for the next 60 seconds.', category: 'position', weight: 1, durationSec: 60, intensity: 2 },
  { id: 'pos-kneel', text: 'Kneel for the next 60 seconds.', category: 'position', weight: 1, durationSec: 60, intensity: 2 },
  { id: 'pos-face', text: 'Face the wall for the next 30 seconds.', category: 'position', weight: 1, durationSec: 30, intensity: 2 },
  { id: 'pos-pillow', text: 'Stroke through a pillow for the next 90 seconds.', category: 'position', weight: 1, durationSec: 90, intensity: 3 },
  // Sensation
  { id: 'sens-spit', text: 'Spit in your hand. Use it.', category: 'sensation', weight: 2, intensity: 2 },
  { id: 'sens-lube', text: 'Add more lube. Slow strokes.', category: 'sensation', weight: 2, intensity: 2 },
  { id: 'sens-vib', text: 'Use a vibrator on your perineum for 60 seconds.', category: 'sensation', weight: 1, durationSec: 60, intensity: 4 },
  { id: 'sens-cold', text: 'Run cold water over your dick. 10 seconds.', category: 'sensation', weight: 1, durationSec: 10, intensity: 3 },
  { id: 'sens-ass', text: 'Add one finger in your ass.', category: 'sensation', weight: 1, intensity: 4 },
  // Denial (hard mode)
  { id: 'den-noend', text: 'No climax for the next 15 minutes.', category: 'denial', weight: 1, durationSec: 900, intensity: 5 },
  { id: 'den-ruin', text: 'Push to the edge, then RUIN it.', category: 'denial', weight: 1, intensity: 5 },
  { id: 'den-beg', text: 'Beg out loud for permission to come. Then deny yourself.', category: 'denial', weight: 1, intensity: 4 },
  { id: 'den-stop', text: 'End the session right now with no climax.', category: 'denial', weight: 1, intensity: 5 },
]

export function getDefaultPool(): WheelTask[] {
  return DEFAULT_POOL.map((t) => ({ ...t }))
}

export function getActivePool(): WheelTask[] {
  const s = getSettings() as any
  const pool: WheelTask[] = Array.isArray(s.taskWheelPool) && s.taskWheelPool.length > 0
    ? s.taskWheelPool
    : getDefaultPool()
  const muted: TaskCategory[] = Array.isArray(s.taskWheelDisabledCategories) ? s.taskWheelDisabledCategories : []
  return pool.filter((t) => !muted.includes(t.category))
}

export function setPool(pool: WheelTask[]): void {
  updateSettings({ taskWheelPool: pool } as any)
}

export function setDisabledCategories(cats: TaskCategory[]): void {
  updateSettings({ taskWheelDisabledCategories: cats } as any)
}

export function pickTask(opts: { maxIntensity?: 1 | 2 | 3 | 4 | 5; excludeIds?: string[] } = {}): WheelTask | null {
  const pool = getActivePool()
  const filtered = pool.filter((t) => {
    if (opts.maxIntensity && (t.intensity ?? 3) > opts.maxIntensity) return false
    if (opts.excludeIds && opts.excludeIds.includes(t.id)) return false
    return true
  })
  if (filtered.length === 0) return null
  const totalWeight = filtered.reduce((s, t) => s + t.weight, 0)
  let r = Math.random() * totalWeight
  for (const t of filtered) {
    r -= t.weight
    if (r <= 0) return t
  }
  return filtered[filtered.length - 1]
}
