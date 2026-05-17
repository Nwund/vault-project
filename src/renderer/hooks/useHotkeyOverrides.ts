// File: src/renderer/hooks/useHotkeyOverrides.ts
//
// #204 — Customizable global hotkeys.
//
// Stores user-rebound shortcuts in localStorage under
// `vault.hotkeys.v1`. Shape: { [actionId]: chord }.
//
// `chord` is the canonical Vault chord-string format:
//   - modifiers in fixed order: Ctrl+Shift+Alt+Meta+<Key>
//   - <Key> is `event.key` (single chars uppercased; ' ' becomes 'Space';
//     'ArrowLeft' becomes '←' for display but stored as 'ArrowLeft')
//
// This is intentionally a renderer-only store — keypress handling
// stays where it already is (App.tsx + FloatingVideoPlayer.tsx etc.);
// they just call `getEffectiveChord(actionId, defaultChord)` to know
// what to match against.

import { useCallback, useEffect, useState } from 'react'

const STORAGE_KEY = 'vault.hotkeys.v1'

export type HotkeyMap = Record<string, string>

function readStore(): HotkeyMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? (parsed as HotkeyMap) : {}
  } catch {
    return {}
  }
}

function writeStore(map: HotkeyMap): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map))
    // Broadcast so other tabs / components see the update immediately.
    window.dispatchEvent(new CustomEvent('vault:hotkeys-changed'))
  } catch {
    /* quota or private-mode — non-fatal */
  }
}

// Normalize a KeyboardEvent into Vault's canonical chord string.
export function chordFromEvent(e: KeyboardEvent | React.KeyboardEvent): string | null {
  const k = e.key
  // Ignore pure modifier presses — we want the "real" key.
  if (k === 'Control' || k === 'Shift' || k === 'Alt' || k === 'Meta') return null
  const parts: string[] = []
  if (e.ctrlKey) parts.push('Ctrl')
  if (e.shiftKey) parts.push('Shift')
  if (e.altKey) parts.push('Alt')
  if (e.metaKey) parts.push('Meta')
  let label = k
  if (label === ' ') label = 'Space'
  else if (label.length === 1) label = label.toUpperCase()
  parts.push(label)
  return parts.join('+')
}

// Human-readable form for display in the recorder UI.
export function prettyChord(chord: string): string {
  return chord
    .replace(/\bArrowLeft\b/g, '←')
    .replace(/\bArrowRight\b/g, '→')
    .replace(/\bArrowUp\b/g, '↑')
    .replace(/\bArrowDown\b/g, '↓')
}

// Pure getter for non-React code paths. Falls back to the provided default.
export function getEffectiveChord(actionId: string, defaultChord: string): string {
  const map = readStore()
  return map[actionId] ?? defaultChord
}

// React-bound subscription so editor + HotkeyHelp update live.
export function useHotkeyOverrides(): {
  map: HotkeyMap
  set: (actionId: string, chord: string) => void
  clear: (actionId: string) => void
  resetAll: () => void
} {
  const [map, setMap] = useState<HotkeyMap>(() => readStore())

  useEffect(() => {
    const onChange = () => setMap(readStore())
    window.addEventListener('vault:hotkeys-changed', onChange)
    window.addEventListener('storage', onChange) // cross-window
    return () => {
      window.removeEventListener('vault:hotkeys-changed', onChange)
      window.removeEventListener('storage', onChange)
    }
  }, [])

  const set = useCallback((actionId: string, chord: string) => {
    const next = { ...readStore(), [actionId]: chord }
    writeStore(next)
    setMap(next)
  }, [])

  const clear = useCallback((actionId: string) => {
    const next = { ...readStore() }
    delete next[actionId]
    writeStore(next)
    setMap(next)
  }, [])

  const resetAll = useCallback(() => {
    writeStore({})
    setMap({})
  }, [])

  return { map, set, clear, resetAll }
}
