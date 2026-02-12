// File: src/main/ai.ts
import Store from 'electron-store'
import type { DB } from './db'

export type AiProvider = 'ollama' | 'none'

export type AiConfig = {
  enabled: boolean
  provider: AiProvider
  ollamaUrl: string
  ollamaModel: string
  minConfidence: number
  allowedTags: string[]
}

export type AiTagResult = {
  ok: boolean
  mediaId: string
  tagsAdded: string[]
  tagsSuggested: Array<{ name: string; score: number }>
  error?: string
}

export type AiBatchResult = {
  ok: boolean
  processed: number
  tagged: number
  errors: number
  error?: string
}

const DEFAULT_AI: AiConfig = {
  enabled: true,
  provider: 'ollama',
  ollamaUrl: 'http://localhost:11434',
  ollamaModel: 'llama3.1',
  minConfidence: 0.45,
  allowedTags: []
}

const aiStore = new Store<AiConfig>({
  name: 'ai',
  defaults: DEFAULT_AI
})

export function getAiConfig(): AiConfig {
  return { ...DEFAULT_AI, ...(aiStore.store as any) }
}

export function setAiConfig(patch: Partial<AiConfig>): AiConfig {
  const cur = getAiConfig()
  const next: AiConfig = { ...cur, ...patch }
  aiStore.store = next as any
  return next
}

function normalizeUrl(url: string): string {
  const u = (url || '').trim()
  if (!u) return DEFAULT_AI.ollamaUrl
  return u.endsWith('/') ? u.slice(0, -1) : u
}

async function fetchJson(url: string, init: RequestInit & { timeoutMs?: number } = {}) {
  const timeoutMs = init.timeoutMs ?? 6000
  const controller = new AbortController()
  const t = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, { ...init, signal: controller.signal })
    const text = await res.text()
    const data = text ? JSON.parse(text) : null
    return { ok: res.ok, status: res.status, data }
  } finally {
    clearTimeout(t)
  }
}

export async function aiPing(_db: DB): Promise<{ ok: boolean; error?: string }> {
  const cfg = getAiConfig()
  if (!cfg.enabled) return { ok: false, error: 'AI disabled' }
  if (cfg.provider === 'none') return { ok: false, error: 'Provider is none' }

  const base = normalizeUrl(cfg.ollamaUrl)
  try {
    const r = await fetchJson(`${base}/api/version`, { method: 'GET', timeoutMs: 3000 })
    if (!r.ok) return { ok: false, error: `Ollama HTTP ${r.status}` }
    return { ok: true }
  } catch (e: any) {
    return { ok: false, error: String(e?.message ?? e) }
  }
}

function tokenize(text: string): string[] {
  return (text || '')
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .map((t) => t.trim())
    .filter((t) => t.length >= 3)
    .slice(0, 24)
}

function scoreToken(t: string): number {
  if (t.length >= 10) return 0.9
  if (t.length >= 7) return 0.75
  if (t.length >= 5) return 0.6
  return 0.5
}

function applyAllowedTags(suggested: Array<{ name: string; score: number }>, allowed: string[]) {
  const allow = allowed.map((x) => x.trim().toLowerCase()).filter(Boolean)
  if (!allow.length) return suggested
  const allowSet = new Set(allow)
  return suggested.filter((s) => allowSet.has(s.name.toLowerCase()))
}

async function safeListMediaByQuery(db: any, q: string, limit: number) {
  try {
    if (typeof db.listMedia === 'function') {
      const res = await db.listMedia({ q, type: '', tag: '', limit, offset: 0 })
      return Array.isArray(res?.items) ? res.items : []
    }
  } catch {
    // ignore
  }

  try {
    if (db?.raw?.prepare) {
      const rows = db.raw
        .prepare(
          `
          SELECT *
          FROM media
          WHERE filename LIKE ? OR path LIKE ?
          ORDER BY mtimeMs DESC
          LIMIT ?
        `.trim()
        )
        .all(`%${q}%`, `%${q}%`, limit)
      return Array.isArray(rows) ? rows : []
    }
  } catch {
    // ignore
  }

  return []
}

async function ollamaChat(messages: Array<{ role: 'user' | 'assistant'; content: string }>): Promise<string | null> {
  const cfg = getAiConfig()
  if (!cfg.enabled || cfg.provider !== 'ollama') return null

  const base = normalizeUrl(cfg.ollamaUrl)

  const system = [
    'You are Vault AI Assistant.',
    'Tone: helpful, concise.',
    'You help with: search, playlists, daylists, goonwall presets, tags.',
    'Never mention illegal content. Keep it neutral and safe.',
    'Prefer short actionable suggestions.'
  ].join(' ')

  const payload = {
    model: cfg.ollamaModel,
    stream: false,
    messages: [{ role: 'system', content: system }, ...messages].map((m) => ({
      role: m.role,
      content: m.content
    }))
  }

  try {
    const r = await fetchJson(`${base}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      timeoutMs: 20000
    })
    if (!r.ok) return null
    const content = r.data?.message?.content
    return typeof content === 'string' ? content : null
  } catch {
    return null
  }
}

export async function vaultAiChat(
  db: DB,
  messages: Array<{ role: 'user' | 'assistant'; content: string }>,
  limit: number
): Promise<{ reply: string; mediaIds: string[] }> {
  const cfg = getAiConfig()
  const lastUser = [...messages].reverse().find((m) => m.role === 'user')?.content ?? ''
  const qTokens = tokenize(lastUser)
  const q = qTokens.join(' ').slice(0, 120) || lastUser.slice(0, 120)

  let reply =
    "Mm. Tell me what you want: *daylist*, *playlist*, or *goonwall*. Add a few tags or a vibe and I’ll shape it. (SFW.)"

  if (cfg.enabled && cfg.provider === 'ollama') {
    const text = await ollamaChat(messages)
    if (text) reply = text
  }

  const rows = await safeListMediaByQuery(db as any, qTokens[0] ?? q, clampInt(limit, 1, 60))
  const mediaIds = rows.map((r: any) => r.id).filter(Boolean).slice(0, clampInt(limit, 1, 60))

  if (!mediaIds.length && qTokens.length >= 2) {
    const rows2 = await safeListMediaByQuery(db as any, qTokens.slice(0, 2).join(' '), clampInt(limit, 1, 60))
    for (const r of rows2) {
      if (r?.id && !mediaIds.includes(r.id)) mediaIds.push(r.id)
      if (mediaIds.length >= clampInt(limit, 1, 60)) break
    }
  }

  return { reply, mediaIds }
}

export async function aiTagMedia(db: DB, mediaId: string): Promise<AiTagResult> {
  const cfg = getAiConfig()
  const tagsAdded: string[] = []
  const tagsSuggested: Array<{ name: string; score: number }> = []

  try {
    const m = (db as any).getMedia?.(mediaId)
    if (!m) return { ok: false, mediaId, tagsAdded, tagsSuggested, error: 'Media not found' }

    const baseTokens = tokenize(m.filename ?? '')
    for (const t of baseTokens) tagsSuggested.push({ name: t, score: scoreToken(t) })

    const filtered = applyAllowedTags(
      uniqSuggested(tagsSuggested).filter((x) => x.score >= cfg.minConfidence),
      cfg.allowedTags
    )

    for (const s of filtered.slice(0, 8)) {
      try {
        ;(db as any).addTagToMedia?.(mediaId, s.name)
        tagsAdded.push(s.name)
      } catch {
        // ignore per-tag
      }
    }

    return {
      ok: true,
      mediaId,
      tagsAdded: uniq(tagsAdded),
      tagsSuggested: filtered
    }
  } catch (e: any) {
    return { ok: false, mediaId, tagsAdded, tagsSuggested, error: String(e?.message ?? e) }
  }
}

export async function aiTagMissing(db: DB, limit: number): Promise<AiBatchResult> {
  const lim = clampInt(limit, 1, 500)
  let processed = 0
  let tagged = 0
  let errors = 0

  try {
    const ids: string[] = []

    try {
      const rows = (db as any).raw
        .prepare(
          `
          SELECT m.id
          FROM media m
          LEFT JOIN media_tags mt ON mt.mediaId = m.id
          WHERE mt.mediaId IS NULL
          ORDER BY m.addedAt DESC
          LIMIT ?
        `.trim()
        )
        .all(lim) as Array<{ id: string }>
      for (const r of rows) if (r?.id) ids.push(r.id)
    } catch {
      // fallback: just tag recent items if schema differs
      try {
        const rows2 = (db as any).raw
          .prepare(
            `
            SELECT id
            FROM media
            ORDER BY addedAt DESC
            LIMIT ?
          `.trim()
          )
          .all(lim) as Array<{ id: string }>
        for (const r of rows2) if (r?.id) ids.push(r.id)
      } catch {
        // ignore
      }
    }

    for (const id of ids.slice(0, lim)) {
      processed++
      // eslint-disable-next-line no-await-in-loop
      const r = await aiTagMedia(db, id)
      if (r.ok && r.tagsAdded.length) tagged++
      else if (!r.ok) errors++
    }

    return { ok: true, processed, tagged, errors }
  } catch (e: any) {
    return { ok: false, processed, tagged, errors, error: String(e?.message ?? e) }
  }
}

/* -------------------------
   tiny utils
------------------------- */

function clampInt(n: number, lo: number, hi: number) {
  const v = Math.trunc(Number.isFinite(n) ? n : lo)
  return Math.max(lo, Math.min(hi, v))
}

function uniq(xs: string[]) {
  return Array.from(new Set(xs))
}

function uniqSuggested(xs: Array<{ name: string; score: number }>) {
  const best = new Map<string, number>()
  for (const x of xs) {
    const k = x.name.toLowerCase()
    const prev = best.get(k)
    if (prev === undefined || x.score > prev) best.set(k, x.score)
  }
  return Array.from(best.entries()).map(([name, score]) => ({ name, score })).sort((a, b) => b.score - a.score)
}