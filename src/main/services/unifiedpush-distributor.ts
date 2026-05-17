// File: src/main/services/unifiedpush-distributor.ts
//
// #275 C-51 — UnifiedPush distributor support. UnifiedPush is an open
// push standard that lets users plug their own push provider (ntfy,
// NextPush, Gotify, …) into compatible Android apps. Vault hosts a
// minimal "distributor" surface: it can push messages to subscribed
// UnifiedPush endpoints registered by paired mobile clients.
//
// In practice: the mobile client gives us an https push URL (e.g.
// ntfy.sh topic URL); we keep that URL keyed by app-id, and call
// notify(app, payload) → HTTPS POST to that URL.
//
// Not a full distributor — does not interface with FCM/UnifiedPush
// upstreams. It's a lightweight bridge that gets Vault's notifications
// onto mobile screens via existing UP-compatible apps.

import * as fs from 'node:fs'
import * as path from 'node:path'

const ENDPOINTS_FILE = path.join(process.env.APPDATA ?? '', 'vault', 'unifiedpush-endpoints.json')

export interface UpEndpoint {
  appId: string                   // e.g. "vault-android-2026-05-16"
  endpoint: string                // https push URL
  deviceName?: string
  registeredAt: number
}

export function loadEndpoints(): UpEndpoint[] {
  if (!fs.existsSync(ENDPOINTS_FILE)) return []
  try { return JSON.parse(fs.readFileSync(ENDPOINTS_FILE, 'utf8')) as UpEndpoint[] }
  catch { return [] }
}

function saveEndpoints(eps: UpEndpoint[]): void {
  fs.mkdirSync(path.dirname(ENDPOINTS_FILE), { recursive: true })
  fs.writeFileSync(ENDPOINTS_FILE, JSON.stringify(eps, null, 2), 'utf8')
}

export function register(endpoint: Omit<UpEndpoint, 'registeredAt'>): void {
  const all = loadEndpoints().filter((e) => e.appId !== endpoint.appId)
  all.push({ ...endpoint, registeredAt: Date.now() })
  saveEndpoints(all)
}

export function unregister(appId: string): void {
  const all = loadEndpoints().filter((e) => e.appId !== appId)
  saveEndpoints(all)
}

export async function notify(appId: string, payload: string | Buffer): Promise<{ ok: boolean; error?: string }> {
  const all = loadEndpoints()
  const e = all.find((x) => x.appId === appId)
  if (!e) return { ok: false, error: 'no endpoint for appId' }
  try {
    const body = typeof payload === 'string' ? payload : payload.toString('utf8')
    const res = await fetch(e.endpoint, { method: 'POST', body })
    return { ok: res.ok, error: res.ok ? undefined : `${res.status} ${res.statusText}` }
  } catch (err: any) {
    return { ok: false, error: String(err?.message ?? err) }
  }
}

export async function broadcast(payload: string | Buffer): Promise<{ delivered: number; failed: number }> {
  const all = loadEndpoints()
  let delivered = 0, failed = 0
  for (const e of all) {
    const r = await notify(e.appId, payload)
    if (r.ok) delivered++; else failed++
  }
  return { delivered, failed }
}
