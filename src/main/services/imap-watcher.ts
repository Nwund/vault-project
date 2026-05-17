// File: src/main/services/imap-watcher.ts
//
// #313 E-89 — IMAP inbox watcher. Connects to a user-configured IMAP
// account (Fastmail / Gmail-via-app-password / etc.) and watches a
// specific folder for new mail. When a new message arrives and either
// the subject contains a magic tag (default "[VAULT]") or the body
// contains a URL, the URL(s) are extracted and queued through the
// existing URL downloader.
//
// Reasoning:
//   - The user can email links to themselves from any phone / IM.
//   - Fastmail / iCloud / ProtonMail all support app-passwords.
//   - imapflow uses persistent IDLE — no polling cost when idle.
//
// Credentials live encrypted in safeStorage; never on disk in plain.
//
// Use mailparser to extract the plain-text body + subject; ignore
// HTML to avoid tracking-pixel noise.

import { safeStorage } from 'electron'
import type { ImapFlow as ImapFlowType } from 'imapflow'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import type { DB } from '../db'

const CONFIG_FILE = path.join(os.homedir(), 'AppData', 'Roaming', 'vault', 'imap-config.json')

export interface ImapConfig {
  enabled: boolean
  host: string                  // e.g. imap.fastmail.com
  port: number                  // 993
  secure: boolean               // true (TLS)
  user: string                  // full email
  passwordEnc: string           // safeStorage encrypted, base64
  folder: string                // "INBOX" or "[Vault]" if user has filters
  subjectTag?: string           // "[VAULT]" default; only watch matching subjects
  fromWhitelist?: string[]      // optional — only act on these senders
}

export function loadConfig(): ImapConfig | null {
  if (!fs.existsSync(CONFIG_FILE)) return null
  try { return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')) as ImapConfig }
  catch { return null }
}

export function saveConfig(config: Omit<ImapConfig, 'passwordEnc'> & { password?: string }): void {
  fs.mkdirSync(path.dirname(CONFIG_FILE), { recursive: true })
  const existing = loadConfig()
  let passwordEnc = existing?.passwordEnc ?? ''
  if (config.password) {
    passwordEnc = safeStorage.encryptString(config.password).toString('base64')
  }
  const { password, ...rest } = config
  const out: ImapConfig = { ...rest, passwordEnc }
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(out, null, 2), 'utf8')
}

function decryptPassword(passwordEnc: string): string | null {
  if (!passwordEnc) return null
  try { return safeStorage.decryptString(Buffer.from(passwordEnc, 'base64')) }
  catch { return null }
}

let watcher: { client: ImapFlowType; stop: () => Promise<void> } | null = null

const URL_RE = /(https?:\/\/[^\s<>"']+)/g

async function handleMessage(
  enqueueUrl: (url: string, source: string) => Promise<void>,
  rawMessage: Buffer,
  config: ImapConfig,
  subject: string,
  fromAddress: string,
): Promise<{ urls: string[] }> {
  const subjMatch = !config.subjectTag || subject.toUpperCase().includes(config.subjectTag.toUpperCase())
  if (!subjMatch) return { urls: [] }
  if (config.fromWhitelist && config.fromWhitelist.length > 0) {
    const fromLower = fromAddress.toLowerCase()
    if (!config.fromWhitelist.some((w) => fromLower.includes(w.toLowerCase()))) return { urls: [] }
  }
  const { simpleParser } = await import('mailparser')
  const parsed = await simpleParser(rawMessage)
  const body = (parsed.text ?? '') + '\n' + subject
  const urls = [...new Set([...body.matchAll(URL_RE)].map((m) => m[1]))]
  for (const url of urls) {
    try { await enqueueUrl(url, `imap:${fromAddress}`) }
    catch { /* ignore single-url enqueue failures */ }
  }
  return { urls }
}

export async function startWatcher(
  _db: DB,
  enqueueUrl: (url: string, source: string) => Promise<void>,
): Promise<{ ok: boolean; error?: string }> {
  const config = loadConfig()
  if (!config || !config.enabled) return { ok: false, error: 'IMAP not configured or disabled' }
  const password = decryptPassword(config.passwordEnc)
  if (!password) return { ok: false, error: 'password could not be decrypted' }
  const { ImapFlow } = await import('imapflow')
  const client = new ImapFlow({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: { user: config.user, pass: password },
    logger: false,
  })
  try {
    await client.connect()
    await client.mailboxOpen(config.folder)
    client.on('exists', async () => {
      try {
        const lock = await client.getMailboxLock(config.folder)
        try {
          for await (const msg of client.fetch({ seen: false }, { source: true, envelope: true })) {
            const subject = msg.envelope?.subject ?? ''
            const fromAddr = msg.envelope?.from?.[0]?.address ?? ''
            await handleMessage(enqueueUrl, msg.source as Buffer, config, subject, fromAddr)
            await client.messageFlagsAdd(msg.uid, ['\\Seen'], { uid: true })
          }
        } finally { lock.release() }
      } catch (err) {
        console.error('[imap-watcher] fetch error:', err)
      }
    })
    watcher = {
      client,
      stop: async () => {
        try { await client.logout() } catch { /* ignore */ }
        watcher = null
      },
    }
    return { ok: true }
  } catch (err: any) {
    return { ok: false, error: String(err?.message ?? err) }
  }
}

export async function stopWatcher(): Promise<void> {
  if (watcher) await watcher.stop()
}

export function statusWatcher(): { running: boolean } {
  return { running: !!watcher }
}
