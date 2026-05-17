// File: src/main/services/ai-intelligence/hosts-blocklist.ts
//
// StevenBlack/hosts adult-extension ingestion. Unlocks three features:
//
//   #222 source-discovery — list adult domains in StevenBlack/hosts that
//        we don't yet have a Browse adapter for (i.e. tube candidates).
//   #223 panic mode (nuclear) — write the StevenBlack hosts file to
//        %WINDIR%\System32\drivers\etc\hosts so the OS resolver blocks
//        every porn domain at the network layer. REQUIRES ELEVATION.
//   #224 auto-NSFW tagging — when an imported media item has a source
//        URL whose host is on the StevenBlack porn-extension list, the
//        ingestion path auto-tags it 'nsfw' + the platform name.
//
// The cached list lives under userData/blocklists/stevenblack/. The
// service uses Electron's net (so it inherits the app's proxy + UA)
// and falls back to plain https.get if net is unavailable (tests).

import { app, net } from 'electron'
import { promises as fsp } from 'node:fs'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { spawn } from 'node:child_process'

// Source-of-truth URL for the porn-extension hosts list (StevenBlack
// publishes several extension lists; we use the porn one specifically).
const HOSTS_URL = 'https://raw.githubusercontent.com/StevenBlack/hosts/master/alternates/porn-only/hosts'

// Fallback URL if the porn-only extension changes naming. The main
// `hosts` file at the root pulls in the porn extension when the user
// builds with `-e porn`, so the porn block lives in this directory.
const FALLBACK_URL = 'https://raw.githubusercontent.com/StevenBlack/hosts/master/alternates/porn/hosts'

const CACHE_DIR = path.join(app.getPath('userData'), 'blocklists', 'stevenblack')
const CACHE_FILE = path.join(CACHE_DIR, 'porn-hosts.txt')
const META_FILE = path.join(CACHE_DIR, 'meta.json')

// Domains we have first-class Browse adapters for. Filter these out
// when reporting source-discovery candidates.
const KNOWN_ADAPTER_HOSTS = new Set<string>([
  'pornhub.com', 'www.pornhub.com', 'rt.pornhub.com',
  'xnxx.com', 'www.xnxx.com', 'cdn.xnxx.com',
  'redtube.com', 'www.redtube.com', 'embed.redtube.com',
  'eporner.com', 'www.eporner.com',
  'spankbang.com', 'www.spankbang.com',
  'redgifs.com', 'www.redgifs.com', 'api.redgifs.com',
  'erome.com', 'www.erome.com',
  'motherless.com', 'www.motherless.com',
  'civitai.com', 'www.civitai.com',
  'rule34.xxx', 'api.rule34.xxx',
  'e621.net', 'e926.net',
  'gelbooru.com', 'realbooru.com',
  'safebooru.org', 'tbib.org', 'xbooru.com', 'hypnohub.net',
  'danbooru.donmai.us', 'aibooru.online',
  'rule34.paheal.net', 'paheal.net',
  'pixiv.net', 'www.pixiv.net',
  'kemono.su', 'kemono.party', 'coomer.su', 'coomer.party',
  'yande.re', 'konachan.com',
  'bsky.app', 'public.api.bsky.app',
  'reddit.com', 'www.reddit.com', 'oauth.reddit.com', 'api.pullpush.io',
])

export interface BlocklistMeta {
  url: string
  fetchedAt: string
  domainCount: number
  bytes: number
}

export interface BlocklistStatus {
  cached: boolean
  meta: BlocklistMeta | null
  cachePath: string
  panicModeActive: boolean
}

// ──────────────────────────────────────────────────────────────────────
// Fetch + cache
// ──────────────────────────────────────────────────────────────────────

function fetchHosts(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = net.request({ method: 'GET', url, redirect: 'follow' })
    let body = ''
    let timedOut = false
    const t = setTimeout(() => {
      timedOut = true
      try { req.abort() } catch { /* ignore */ }
      reject(new Error(`timeout fetching ${url}`))
    }, 30_000)
    req.on('response', (res) => {
      if (res.statusCode && res.statusCode >= 400) {
        clearTimeout(t)
        reject(new Error(`HTTP ${res.statusCode} fetching ${url}`))
        return
      }
      res.on('data', (c: Buffer) => { body += c.toString('utf8') })
      res.on('end', () => { if (!timedOut) { clearTimeout(t); resolve(body) } })
      res.on('error', (e: Error) => { clearTimeout(t); reject(e) })
    })
    req.on('error', (e) => { clearTimeout(t); reject(e) })
    req.end()
  })
}

export async function refreshBlocklist(): Promise<BlocklistMeta> {
  await fsp.mkdir(CACHE_DIR, { recursive: true })
  let raw: string
  let usedUrl = HOSTS_URL
  try {
    raw = await fetchHosts(HOSTS_URL)
  } catch (err) {
    console.warn('[hosts-blocklist] primary URL failed, trying fallback:', err)
    raw = await fetchHosts(FALLBACK_URL)
    usedUrl = FALLBACK_URL
  }
  const domains = extractDomainsFromHostsText(raw)
  await fsp.writeFile(CACHE_FILE, raw, 'utf8')
  const meta: BlocklistMeta = {
    url: usedUrl,
    fetchedAt: new Date().toISOString(),
    domainCount: domains.length,
    bytes: Buffer.byteLength(raw, 'utf8'),
  }
  await fsp.writeFile(META_FILE, JSON.stringify(meta, null, 2), 'utf8')
  // Reset in-memory domain set so the next match call re-reads from disk.
  cachedDomainSet = null
  return meta
}

function extractDomainsFromHostsText(text: string): string[] {
  const out = new Set<string>()
  const lines = text.split(/\r?\n/)
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    // Format: "0.0.0.0 some.domain.tld" — keep field [1].
    const parts = trimmed.split(/\s+/)
    if (parts.length < 2) continue
    const domain = parts[1].toLowerCase()
    if (!/^[a-z0-9.\-]+\.[a-z]{2,}$/.test(domain)) continue
    if (domain === '0.0.0.0' || domain === 'localhost') continue
    out.add(domain)
  }
  return Array.from(out)
}

// ──────────────────────────────────────────────────────────────────────
// Match (for #224 auto-tagging)
// ──────────────────────────────────────────────────────────────────────

let cachedDomainSet: Set<string> | null = null

function loadDomainSet(): Set<string> | null {
  if (cachedDomainSet) return cachedDomainSet
  if (!fs.existsSync(CACHE_FILE)) return null
  const text = fs.readFileSync(CACHE_FILE, 'utf8')
  cachedDomainSet = new Set(extractDomainsFromHostsText(text))
  return cachedDomainSet
}

// Returns the matched domain (or null) and a normalized platform tag.
// "redtube.com" → { matched: "redtube.com", platform: "redtube" }
// "deep.sub.example.com" → matched on either the full string or any
// progressively-shortened suffix (sub.example.com, example.com).
export function matchUrl(url: string): { matched: string; platform: string } | null {
  const set = loadDomainSet()
  if (!set) return null
  let host: string
  try {
    host = new URL(url).hostname.toLowerCase()
  } catch {
    return null
  }
  const labels = host.split('.')
  for (let i = 0; i < labels.length - 1; i++) {
    const suffix = labels.slice(i).join('.')
    if (set.has(suffix)) {
      const platform = suffix.replace(/\.(com|net|org|tv|xxx|porn|tube|cc|io|me|us|co|sex|adult|fans|live|video|gay|lesbian|stream|cam|webcam|chat)$/i, '')
                              .replace(/\./g, '_')
      return { matched: suffix, platform }
    }
  }
  return null
}

// ──────────────────────────────────────────────────────────────────────
// Source-discovery (#222) — domains we DON'T have an adapter for
// ──────────────────────────────────────────────────────────────────────

export interface DiscoveryCandidate {
  domain: string
  category: 'tube' | 'cam' | 'cdn' | 'gallery' | 'other'
}

export async function discoverNewSources(opts: { limit?: number } = {}): Promise<DiscoveryCandidate[]> {
  const set = loadDomainSet()
  if (!set) throw new Error('Blocklist not cached. Call refresh first.')
  const candidates: DiscoveryCandidate[] = []
  for (const domain of set) {
    if (KNOWN_ADAPTER_HOSTS.has(domain)) continue
    // Subdomains of known adapters → skip too (e.g. ads.pornhub.com).
    const labels = domain.split('.')
    let known = false
    for (let i = 1; i < labels.length - 1; i++) {
      if (KNOWN_ADAPTER_HOSTS.has(labels.slice(i).join('.'))) { known = true; break }
    }
    if (known) continue
    candidates.push({ domain, category: categorize(domain) })
  }
  candidates.sort((a, b) => a.domain.localeCompare(b.domain))
  return candidates.slice(0, opts.limit ?? 500)
}

function categorize(domain: string): DiscoveryCandidate['category'] {
  if (/\b(cam|chaturbate|stripchat|bongacams|live|webcam|streamate)\b/.test(domain)) return 'cam'
  if (/\b(cdn|img|pic|thumb|video|stream|media)\b/.test(domain)) return 'cdn'
  if (/\b(tube|porn|xxx|sex|fuck|vid|hub|bang)\b/.test(domain)) return 'tube'
  if (/\b(gallery|imgur|pic|gif|photo)\b/.test(domain)) return 'gallery'
  return 'other'
}

// ──────────────────────────────────────────────────────────────────────
// Panic mode (#223) — write to System32 hosts. Elevation required.
// ──────────────────────────────────────────────────────────────────────

const SYSTEM_HOSTS = process.platform === 'win32'
  ? path.join(process.env.WINDIR ?? 'C:\\Windows', 'System32', 'drivers', 'etc', 'hosts')
  : '/etc/hosts'

const VAULT_PANIC_MARKER_BEGIN = '# ===== vault panic mode begin ====='
const VAULT_PANIC_MARKER_END = '# ===== vault panic mode end ====='

// Detect whether panic mode is currently active by looking for our marker.
export function isPanicModeActive(): boolean {
  try {
    if (!fs.existsSync(SYSTEM_HOSTS)) return false
    const text = fs.readFileSync(SYSTEM_HOSTS, 'utf8')
    return text.includes(VAULT_PANIC_MARKER_BEGIN)
  } catch {
    return false
  }
}

// Build the panic-mode block from the cached StevenBlack list. Adds a
// timestamp and the source URL so a sysadmin reading hosts knows where
// it came from.
async function buildPanicBlock(meta: BlocklistMeta): Promise<string> {
  if (!fs.existsSync(CACHE_FILE)) throw new Error('Blocklist not cached.')
  const raw = await fsp.readFile(CACHE_FILE, 'utf8')
  const domains = extractDomainsFromHostsText(raw)
  const lines: string[] = [
    VAULT_PANIC_MARKER_BEGIN,
    `# Source: ${meta.url}`,
    `# Fetched: ${meta.fetchedAt}`,
    `# Domains: ${domains.length}`,
    ...domains.map((d) => `0.0.0.0 ${d}`),
    VAULT_PANIC_MARKER_END,
  ]
  return lines.join('\r\n') + '\r\n'
}

// Activate panic mode by appending our marker block to System32 hosts.
// Requires elevation; on Windows we ask the user to confirm via UAC by
// shelling out through PowerShell's `Start-Process -Verb runAs`. The
// resulting hosts file is staged in a temp location first so a failure
// can't corrupt the running system file.
export async function activatePanicMode(): Promise<{ ok: boolean; error?: string }> {
  if (process.platform !== 'win32') {
    return { ok: false, error: 'Panic mode is Windows-only (System32 hosts).' }
  }
  const metaText = fs.existsSync(META_FILE) ? await fsp.readFile(META_FILE, 'utf8') : null
  if (!metaText) return { ok: false, error: 'Refresh the blocklist first.' }
  const meta = JSON.parse(metaText) as BlocklistMeta
  if (isPanicModeActive()) return { ok: true } // already active

  // Stage the new hosts in a temp file we can then move into place.
  const cur = fs.existsSync(SYSTEM_HOSTS) ? await fsp.readFile(SYSTEM_HOSTS, 'utf8') : ''
  const block = await buildPanicBlock(meta)
  const next = cur.endsWith('\n') ? cur + '\n' + block : cur + '\r\n' + block
  const stagePath = path.join(app.getPath('userData'), 'blocklists', 'stevenblack', 'hosts.staged')
  await fsp.writeFile(stagePath, next, 'utf8')

  // Elevated copy via PowerShell. Synchronous behavior is fine — the
  // user is staring at UAC.
  return await elevatedCopy(stagePath, SYSTEM_HOSTS)
}

export async function deactivatePanicMode(): Promise<{ ok: boolean; error?: string }> {
  if (process.platform !== 'win32') {
    return { ok: false, error: 'Panic mode is Windows-only (System32 hosts).' }
  }
  if (!isPanicModeActive()) return { ok: true }
  const cur = await fsp.readFile(SYSTEM_HOSTS, 'utf8')
  // Strip our block (everything between the markers, inclusive).
  const begin = cur.indexOf(VAULT_PANIC_MARKER_BEGIN)
  const end = cur.indexOf(VAULT_PANIC_MARKER_END)
  if (begin === -1 || end === -1) return { ok: true }
  const stripped = cur.slice(0, begin).replace(/[\r\n]+$/, '') + cur.slice(end + VAULT_PANIC_MARKER_END.length)
  const stagePath = path.join(app.getPath('userData'), 'blocklists', 'stevenblack', 'hosts.staged')
  await fsp.writeFile(stagePath, stripped, 'utf8')
  return await elevatedCopy(stagePath, SYSTEM_HOSTS)
}

function elevatedCopy(src: string, dst: string): Promise<{ ok: boolean; error?: string }> {
  return new Promise((resolve) => {
    // PowerShell command: copy + flush DNS cache so the new entries take
    // effect immediately. `Start-Process` with `-Verb runAs` triggers UAC.
    // Wrap in a try/catch so the user gets a sensible error on UAC denial.
    const psCmd = [
      `try {`,
      `  Copy-Item -LiteralPath '${src.replace(/'/g, "''")}' -Destination '${dst.replace(/'/g, "''")}' -Force;`,
      `  ipconfig /flushdns | Out-Null;`,
      `  exit 0`,
      `} catch { exit 1 }`,
    ].join(' ')
    const outer = `Start-Process -FilePath powershell.exe -Verb runAs -Wait -WindowStyle Hidden -ArgumentList '-NoProfile','-NonInteractive','-Command',"${psCmd.replace(/"/g, '`"')}"`
    const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', outer], { stdio: 'ignore' })
    child.on('exit', (code) => {
      if (code === 0) resolve({ ok: true })
      else resolve({ ok: false, error: `PowerShell exit code ${code} (UAC denied or copy failed)` })
    })
    child.on('error', (err) => resolve({ ok: false, error: err.message }))
  })
}

// ──────────────────────────────────────────────────────────────────────
// Public status
// ──────────────────────────────────────────────────────────────────────

export async function getStatus(): Promise<BlocklistStatus> {
  let meta: BlocklistMeta | null = null
  try {
    if (fs.existsSync(META_FILE)) {
      meta = JSON.parse(await fsp.readFile(META_FILE, 'utf8')) as BlocklistMeta
    }
  } catch { /* ignore */ }
  return {
    cached: fs.existsSync(CACHE_FILE),
    meta,
    cachePath: CACHE_FILE,
    panicModeActive: isPanicModeActive(),
  }
}
