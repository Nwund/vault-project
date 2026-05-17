// File: src/main/services/syncthing-client.ts
//
// #269 C-45 — Syncthing REST control plane. Talks to a locally-running
// Syncthing daemon's HTTP API (default http://127.0.0.1:8384). Lets
// Vault list/configure shared folders, devices, and trigger
// scans / restarts without spinning up our own sync stack.
//
// Auth is via the X-API-Key header. The user copies the API key from
// their Syncthing Web UI (Settings → API Key) into Vault settings;
// stored in safeStorage like other credentials.

import { safeStorage } from 'electron'
import * as fs from 'node:fs'
import * as path from 'node:path'

const CONFIG_FILE = path.join(process.env.APPDATA ?? '', 'vault', 'syncthing-config.json')

export interface SyncthingConfig {
  baseUrl: string                // http://127.0.0.1:8384
  apiKeyEnc: string              // base64(safeStorage)
}

export function loadConfig(): SyncthingConfig | null {
  if (!fs.existsSync(CONFIG_FILE)) return null
  try { return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')) as SyncthingConfig }
  catch { return null }
}

export function saveConfig(baseUrl: string, apiKey?: string): void {
  const existing = loadConfig()
  let apiKeyEnc = existing?.apiKeyEnc ?? ''
  if (apiKey) apiKeyEnc = safeStorage.encryptString(apiKey).toString('base64')
  fs.mkdirSync(path.dirname(CONFIG_FILE), { recursive: true })
  fs.writeFileSync(CONFIG_FILE, JSON.stringify({ baseUrl, apiKeyEnc }, null, 2), 'utf8')
}

function decryptKey(enc: string): string | null {
  if (!enc) return null
  try { return safeStorage.decryptString(Buffer.from(enc, 'base64')) }
  catch { return null }
}

async function req(method: string, endpoint: string, body?: any): Promise<{ ok: boolean; status: number; data?: any; error?: string }> {
  const cfg = loadConfig()
  if (!cfg) return { ok: false, status: 0, error: 'syncthing not configured' }
  const key = decryptKey(cfg.apiKeyEnc)
  if (!key) return { ok: false, status: 0, error: 'api key could not be decrypted' }
  try {
    const res = await fetch(`${cfg.baseUrl}${endpoint}`, {
      method,
      headers: {
        'X-API-Key': key,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    })
    const text = await res.text()
    let data: any = text
    try { data = JSON.parse(text) } catch { /* leave as text */ }
    return { ok: res.ok, status: res.status, data }
  } catch (err: any) {
    return { ok: false, status: 0, error: String(err?.message ?? err) }
  }
}

export const syncthing = {
  ping: () => req('GET', '/rest/system/ping'),
  systemStatus: () => req('GET', '/rest/system/status'),
  systemVersion: () => req('GET', '/rest/system/version'),
  config: () => req('GET', '/rest/config'),
  folders: () => req('GET', '/rest/config/folders'),
  devices: () => req('GET', '/rest/config/devices'),
  folderStatus: (folderId: string) => req('GET', `/rest/db/status?folder=${encodeURIComponent(folderId)}`),
  scanFolder: (folderId: string) => req('POST', `/rest/db/scan?folder=${encodeURIComponent(folderId)}`),
  pauseFolder: (folderId: string) => req('POST', `/rest/system/pause?folder=${encodeURIComponent(folderId)}`),
  resumeFolder: (folderId: string) => req('POST', `/rest/system/resume?folder=${encodeURIComponent(folderId)}`),
  restart: () => req('POST', '/rest/system/restart'),
  shutdown: () => req('POST', '/rest/system/shutdown'),
  upsertFolder: (folder: any) => req('PUT', '/rest/config/folders', folder),
  upsertDevice: (device: any) => req('PUT', '/rest/config/devices', device),
}
