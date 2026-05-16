// File: src/main/services/tag-siblings.ts
//
// Hydrus-style tag siblings / aliases (#102). Bidirectional equivalence
// classes — every alias normalizes to a canonical tag at write time
// AND at query-rewrite time (so searching for any alias returns matches
// for the canonical).
//
// Storage: <userData>/tag-siblings.json shape:
//
//   { "big_breasts": ["large_breasts", "huge_breasts", "tits_large"], ... }
//
// Each top-level key is the canonical; the array values are aliases that
// rewrite to it. canonicalize(alias) returns the canonical (or the input
// unchanged if no alias edge exists). All matching is case-insensitive.

import fs from 'node:fs'
import path from 'node:path'
import { app } from 'electron'

const FILE_NAME = 'tag-siblings.json'

interface SiblingMaps {
  /** Aliases → canonical lookup, populated at load. */
  aliasToCanon: Map<string, string>
  /** Canonical → alias list, for the editor UI. */
  canonToAliases: Map<string, string[]>
}

let cached: SiblingMaps | null = null

function getPath(): string {
  return path.join(app.getPath('userData'), FILE_NAME)
}

function load(): SiblingMaps {
  if (cached) return cached
  const out: SiblingMaps = { aliasToCanon: new Map(), canonToAliases: new Map() }
  try {
    const p = getPath()
    if (fs.existsSync(p)) {
      const raw = fs.readFileSync(p, 'utf8')
      const parsed = JSON.parse(raw) as Record<string, unknown>
      for (const [canon, aliases] of Object.entries(parsed)) {
        if (typeof canon !== 'string' || !Array.isArray(aliases)) continue
        const canonLower = canon.toLowerCase()
        const cleaned = aliases
          .map((x) => String(x).trim().toLowerCase())
          .filter((x) => x && x !== canonLower)
        if (cleaned.length === 0) continue
        out.canonToAliases.set(canonLower, cleaned)
        for (const a of cleaned) out.aliasToCanon.set(a, canonLower)
      }
    }
  } catch (err) {
    console.warn('[TagSiblings] load failed:', err)
  }
  cached = out
  return out
}

export function reloadSiblings(): void { cached = null }

export function saveSiblings(map: Record<string, string[]>): { ok: boolean; error?: string } {
  try {
    fs.writeFileSync(getPath(), JSON.stringify(map, null, 2), 'utf8')
    cached = null
    return { ok: true }
  } catch (err: any) {
    return { ok: false, error: err?.message ?? String(err) }
  }
}

export function getSiblings(): Record<string, string[]> {
  return Object.fromEntries(load().canonToAliases.entries())
}

/**
 * Canonicalize a tag name through the alias graph. Returns the canonical
 * form (lowercased) when an alias edge exists; otherwise the input
 * lowercased and trimmed. Used by tags:addToMedia to rewrite at write
 * time + by search-query rewriters to expand at read time.
 */
export function canonicalize(tagName: string): string {
  const lower = tagName.trim().toLowerCase()
  return load().aliasToCanon.get(lower) ?? lower
}

/** Reverse lookup: every alias that rewrites to this canonical (or [] if
 *  the input isn't a known canonical). For search-side query expansion. */
export function aliasesOf(canonical: string): string[] {
  return load().canonToAliases.get(canonical.toLowerCase()) ?? []
}
