// File: src/main/services/post-nut-lockout.ts
//
// #347 — Post-nut clarity blocker. After the user signals climax
// (single button in the player or a hotkey), Vault enters a
// refractory lockout for N minutes. During the lockout the renderer
// gates NSFW content behind a full-window "clarity" overlay with a
// countdown — gives the user a chance to step away from the
// dopamine cycle. Cancelable (so the lockout never traps them).
//
// State lives in settings.postNutLockout = {
//   enabled: boolean
//   durationMin: number    // default 30
//   lockedUntilTs: number | null   // epoch ms or null
//   bypassedAt: number | null      // last user-initiated bypass
// }
//
// The renderer polls status() on a 5s tick + listens for
// `lockout:changed` IPC events for immediate updates.

import { BrowserWindow } from 'electron'
import { getSettings, updateSettings } from '../settings'

export interface LockoutState {
  enabled: boolean
  durationMin: number
  lockedUntilTs: number | null
  remainingMs: number
  active: boolean
}

function broadcast(channel: string, payload: any): void {
  for (const w of BrowserWindow.getAllWindows()) {
    try { w.webContents.send(channel, payload) } catch { /* ignore */ }
  }
}

function read(): { enabled: boolean; durationMin: number; lockedUntilTs: number | null } {
  const s = getSettings() as any
  const raw = s?.postNutLockout ?? {}
  return {
    enabled: !!raw.enabled,
    durationMin: Math.max(1, Math.min(720, Number(raw.durationMin) || 30)),
    lockedUntilTs: typeof raw.lockedUntilTs === 'number' ? raw.lockedUntilTs : null,
  }
}

export function getLockoutState(): LockoutState {
  const r = read()
  const now = Date.now()
  const active = !!(r.lockedUntilTs && r.lockedUntilTs > now)
  return {
    enabled: r.enabled,
    durationMin: r.durationMin,
    lockedUntilTs: r.lockedUntilTs,
    remainingMs: active ? r.lockedUntilTs! - now : 0,
    active,
  }
}

// Trigger lockout. Pass durationMin to override the user's default
// (handy for "give me an hour this time" buttons).
export function triggerLockout(opts: { durationMin?: number } = {}): LockoutState {
  const r = read()
  const dur = Math.max(1, Math.min(720, opts.durationMin ?? r.durationMin))
  const until = Date.now() + dur * 60 * 1000
  updateSettings({
    postNutLockout: {
      ...(getSettings() as any)?.postNutLockout,
      enabled: true,
      durationMin: dur,
      lockedUntilTs: until,
    },
  } as any)
  const state = getLockoutState()
  broadcast('lockout:changed', state)
  return state
}

// Cancel the active lockout. Records bypassedAt for "how often did I
// break this" self-reflection in the future.
export function cancelLockout(): LockoutState {
  const cur = (getSettings() as any)?.postNutLockout ?? {}
  updateSettings({
    postNutLockout: { ...cur, lockedUntilTs: null, bypassedAt: Date.now() },
  } as any)
  const state = getLockoutState()
  broadcast('lockout:changed', state)
  return state
}

// Toggle the feature on/off without affecting an active lockout.
export function setEnabled(enabled: boolean): LockoutState {
  const cur = (getSettings() as any)?.postNutLockout ?? {}
  updateSettings({ postNutLockout: { ...cur, enabled } } as any)
  const state = getLockoutState()
  broadcast('lockout:changed', state)
  return state
}

export function setDuration(durationMin: number): LockoutState {
  const dur = Math.max(1, Math.min(720, Math.round(durationMin)))
  const cur = (getSettings() as any)?.postNutLockout ?? {}
  updateSettings({ postNutLockout: { ...cur, durationMin: dur } } as any)
  const state = getLockoutState()
  broadcast('lockout:changed', state)
  return state
}
