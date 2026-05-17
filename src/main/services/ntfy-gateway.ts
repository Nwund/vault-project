// File: src/main/services/ntfy-gateway.ts
//
// #274 C-50 — ntfy.sh self-hosted push gateway. The user confirmed
// they want public ntfy.sh with topic `vault-johndoe1827`. We push
// notifications for things like: download complete, lockout starting,
// new media imported, panic mode armed, etc.
//
// Topic + server live in settings.ntfy = { server, topic, enabled,
// allowedEvents[] }. By default we wire 4 event types but each can
// be muted individually.

import { net } from 'electron'
import { getSettings, updateSettings } from '../settings'

export type NtfyEvent =
  | 'download_complete'
  | 'download_failed'
  | 'lockout_started'
  | 'panic_mode_armed'
  | 'media_imported'
  | 'session_ended'
  | 'budget_relapse'
  | 'custom'

export interface NtfyConfig {
  server: string         // e.g. "https://ntfy.sh"
  topic: string          // e.g. "vault-johndoe1827"
  enabled: boolean
  allowedEvents: NtfyEvent[]
  priority?: 1 | 2 | 3 | 4 | 5  // ntfy priority (3 = default)
  // Optional bearer token for self-hosted ntfy servers w/ auth.
  authToken?: string
}

const DEFAULTS: NtfyConfig = {
  server: 'https://ntfy.sh',
  topic: 'vault-johndoe1827',
  enabled: false,
  allowedEvents: ['download_complete', 'lockout_started', 'panic_mode_armed', 'budget_relapse'],
  priority: 3,
}

export function getConfig(): NtfyConfig {
  const s = getSettings() as any
  return { ...DEFAULTS, ...(s.ntfy ?? {}) }
}

export function saveConfig(patch: Partial<NtfyConfig>): NtfyConfig {
  const merged = { ...getConfig(), ...patch }
  updateSettings({ ntfy: merged } as any)
  return merged
}

export interface PushArgs {
  event: NtfyEvent
  title: string
  message: string
  // Optional: tags shown as emoji badges in the notification UI.
  tags?: string[]
  // Optional click-through URL.
  clickUrl?: string
  // Optional attached image URL.
  attachUrl?: string
  // Override config priority just for this push.
  priority?: 1 | 2 | 3 | 4 | 5
}

export async function push(args: PushArgs): Promise<{ ok: boolean; status?: number; error?: string }> {
  const cfg = getConfig()
  if (!cfg.enabled) return { ok: false, error: 'ntfy disabled' }
  if (!cfg.topic) return { ok: false, error: 'ntfy topic not set' }
  if (args.event !== 'custom' && !cfg.allowedEvents.includes(args.event)) {
    return { ok: false, error: `event '${args.event}' not in allowedEvents` }
  }
  const url = `${cfg.server.replace(/\/$/, '')}/${encodeURIComponent(cfg.topic)}`
  const headers: Record<string, string> = {
    'Content-Type': 'text/plain; charset=utf-8',
    'Title': args.title,
    'Priority': String(args.priority ?? cfg.priority ?? 3),
  }
  if (args.tags && args.tags.length > 0) headers['Tags'] = args.tags.join(',')
  if (args.clickUrl) headers['Click'] = args.clickUrl
  if (args.attachUrl) headers['Attach'] = args.attachUrl
  if (cfg.authToken) headers['Authorization'] = `Bearer ${cfg.authToken}`
  return await new Promise((resolve) => {
    const req = net.request({ method: 'POST', url, redirect: 'follow' })
    for (const [k, v] of Object.entries(headers)) req.setHeader(k, v)
    let body = ''
    req.on('response', (res) => {
      res.on('data', (c: Buffer) => { body += c.toString('utf8') })
      res.on('end', () => {
        if (res.statusCode && res.statusCode < 400) resolve({ ok: true, status: res.statusCode })
        else resolve({ ok: false, status: res.statusCode, error: body.slice(0, 200) })
      })
    })
    req.on('error', (err) => resolve({ ok: false, error: err.message }))
    req.write(args.message)
    req.end()
  })
}

// Convenience: fire a notification for a known event with stock copy.
export async function notifyEvent(event: NtfyEvent, payload: Record<string, any> = {}): Promise<void> {
  if (event === 'custom') return  // custom events must use push() directly with explicit copy
  const copy = STOCK_COPY[event]
  if (!copy) return
  void push({
    event,
    title: copy.title(payload),
    message: copy.message(payload),
    tags: copy.tags,
    priority: copy.priority,
  })
}

const STOCK_COPY: Record<Exclude<NtfyEvent, 'custom'>, {
  title: (p: any) => string
  message: (p: any) => string
  tags: string[]
  priority?: 1 | 2 | 3 | 4 | 5
}> = {
  download_complete: {
    title: () => 'Vault download complete',
    message: (p) => p.filename ? `${p.filename}` : 'A new file landed in your library.',
    tags: ['inbox_tray'],
  },
  download_failed: {
    title: () => 'Vault download failed',
    message: (p) => `${p.url ?? 'A URL'} couldn't be fetched: ${p.error ?? 'unknown error'}`,
    tags: ['warning'],
    priority: 4,
  },
  lockout_started: {
    title: () => 'Lockout active',
    message: (p) => `Refractory window: ${p.minutes ?? 30} min. Step away from Vault.`,
    tags: ['shield'],
  },
  panic_mode_armed: {
    title: () => 'Panic mode active',
    message: () => 'StevenBlack hosts list now blocks adult domains system-wide.',
    tags: ['rotating_light'],
    priority: 5,
  },
  media_imported: {
    title: () => 'New media imported',
    message: (p) => `${p.count ?? 1} new item(s) in your library.`,
    tags: ['file_folder'],
  },
  session_ended: {
    title: () => 'Edging session ended',
    message: (p) => `${p.outcome ?? 'session'} — +${p.xp ?? 0} XP, ${p.streak ?? 0} streak.`,
    tags: ['flame'],
  },
  budget_relapse: {
    title: () => 'Orgasm budget exceeded',
    message: (p) => `You're ${p.over ?? 1} past this month's budget.`,
    tags: ['exclamation'],
    priority: 4,
  },
}
