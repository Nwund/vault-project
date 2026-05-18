// File: src/renderer/hooks/useLocalStorage.ts
//
// Shared hook for state mirrored to localStorage. Centralizes the
// try/catch + JSON-parse + default-fallback pattern that was duplicated
// across 8+ components in v2.7. Identical API to useState.
//
// Usage:
//   const [value, setValue] = useLocalStorage<string>('vault.focusMode', 'off')
//   const [obj, setObj]     = useLocalStorage<{a: number}>('vault.x', { a: 0 })
//
// Notes:
//   - String values stored verbatim (not JSON-wrapped) so plain string
//     keys remain compatible with code that reads them directly via
//     localStorage.getItem(). Non-string values go through JSON.stringify.
//   - All localStorage access is wrapped in try/catch — failures are
//     swallowed and return the default (Safari private mode, quota
//     exceeded, etc. shouldn't crash the UI).

import { useState, useCallback } from 'react'

function readKey<T>(key: string, defaultValue: T): T {
  try {
    const raw = localStorage.getItem(key)
    if (raw === null) return defaultValue
    if (typeof defaultValue === 'string') return raw as unknown as T
    try { return JSON.parse(raw) as T } catch { return defaultValue }
  } catch {
    return defaultValue
  }
}

function writeKey<T>(key: string, value: T): void {
  try {
    if (typeof value === 'string') {
      localStorage.setItem(key, value as unknown as string)
    } else {
      localStorage.setItem(key, JSON.stringify(value))
    }
  } catch {
    /* ignore — Safari private mode, quota, etc. */
  }
}

export function useLocalStorage<T>(key: string, defaultValue: T): [T, (v: T | ((prev: T) => T)) => void] {
  const [value, setValue] = useState<T>(() => readKey<T>(key, defaultValue))

  const set = useCallback((v: T | ((prev: T) => T)) => {
    setValue((prev) => {
      const next = typeof v === 'function' ? (v as (p: T) => T)(prev) : v
      writeKey(key, next)
      return next
    })
  }, [key])

  return [value, set]
}
