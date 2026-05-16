// File: src/main/services/tag-implications.ts
//
// Hydrus-style tag parent / implication graph (#103). When a child
// tag is added to media, every ancestor tag is also added. Storage:
// JSON file at <userData>/tag-implications.json with the simple shape
//
//   { "samus_aran": ["metroid", "series:nintendo"], ... }
//
// Cycles are detected at expand time (visited set). Self-implications
// are silently dropped. The graph is loaded lazily + cached; bump
// reload() after the JSON file is mutated from the UI.

import fs from 'node:fs'
import path from 'node:path'
import { app } from 'electron'

const FILE_NAME = 'tag-implications.json'

let cached: Map<string, string[]> | null = null

function getPath(): string {
  return path.join(app.getPath('userData'), FILE_NAME)
}

function load(): Map<string, string[]> {
  if (cached) return cached
  const p = getPath()
  const out = new Map<string, string[]>()
  try {
    if (fs.existsSync(p)) {
      const raw = fs.readFileSync(p, 'utf8')
      const parsed = JSON.parse(raw) as Record<string, unknown>
      for (const [k, v] of Object.entries(parsed)) {
        if (typeof k !== 'string' || !Array.isArray(v)) continue
        const list = v
          .map((x) => String(x).trim().toLowerCase())
          .filter((x) => x && x !== k.toLowerCase())
        if (list.length > 0) out.set(k.toLowerCase(), list)
      }
    }
  } catch (err) {
    console.warn('[TagImplications] load failed:', err)
  }
  cached = out
  return out
}

/** Re-read the JSON file on next call. Settings UI calls this after edit. */
export function reloadImplications(): void {
  cached = null
}

/** Persist a fresh implications map to disk + invalidate cache. */
export function saveImplications(map: Record<string, string[]>): { ok: boolean; error?: string } {
  try {
    fs.writeFileSync(getPath(), JSON.stringify(map, null, 2), 'utf8')
    cached = null
    return { ok: true }
  } catch (err: any) {
    return { ok: false, error: err?.message ?? String(err) }
  }
}

export function getImplications(): Record<string, string[]> {
  const m = load()
  return Object.fromEntries(m.entries())
}

/**
 * Walk the implications graph starting from `tagName` and return every
 * ancestor tag (in BFS order). Cycle-safe via visited set. The input
 * tag itself is NOT included in the output — only its parents.
 */
export function expandImplications(tagName: string): string[] {
  const map = load()
  const lower = tagName.toLowerCase()
  const visited = new Set<string>([lower])
  const queue: string[] = [...(map.get(lower) ?? [])]
  const out: string[] = []
  while (queue.length > 0) {
    const next = queue.shift()!
    if (visited.has(next)) continue
    visited.add(next)
    out.push(next)
    const parents = map.get(next) ?? []
    for (const p of parents) if (!visited.has(p)) queue.push(p)
  }
  return out
}
