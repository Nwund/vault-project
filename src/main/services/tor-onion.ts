// File: src/main/services/tor-onion.ts
//
// #283 C-59 — Tor v3 onion service via a bundled tor binary. Vault
// optionally exposes its mobile-sync HTTP server (port 8585) as a
// Tor hidden service so remote devices can reach it without port
// forwards, public IPs, or DNS records.
//
// The user supplies a path to a tor binary in Settings (we don't
// bundle one by default — distro packaging makes it expensive).
//
// Tor reads its config from a generated torrc that:
//   * Disables SOCKS proxy (we don't need outbound Tor — only the
//     hidden service)
//   * Defines one HiddenServiceDir + HiddenServicePort 80
//     127.0.0.1:8585
//   * Writes hostname + private key to userData/tor-hidden
//
// On first start tor generates a fresh v3 onion address; the hostname
// file appears within ~30s.

import { spawn, ChildProcess } from 'node:child_process'
import * as fs from 'node:fs'
import * as path from 'node:path'

const TOR_DIR = path.join(process.env.APPDATA ?? '', 'vault', 'tor-hidden')
const TORRC_PATH = path.join(TOR_DIR, 'torrc')
const HIDDEN_DIR = path.join(TOR_DIR, 'hidden')
const DATA_DIR = path.join(TOR_DIR, 'datadir')

let proc: ChildProcess | null = null
let lastError: string | null = null

function ensureLayout(): void {
  fs.mkdirSync(HIDDEN_DIR, { recursive: true, mode: 0o700 })
  fs.mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 })
}

function writeTorrc(httpPort: number): void {
  const lines = [
    'SocksPort 0',
    `DataDirectory ${DATA_DIR}`,
    `HiddenServiceDir ${HIDDEN_DIR}`,
    `HiddenServicePort 80 127.0.0.1:${httpPort}`,
    'Log notice file ' + path.join(TOR_DIR, 'tor.log'),
  ]
  fs.writeFileSync(TORRC_PATH, lines.join('\n') + '\n', 'utf8')
}

export interface TorStatus {
  running: boolean
  onion: string | null
  pid: number | null
  lastError: string | null
}

export function status(): TorStatus {
  const hostnameFile = path.join(HIDDEN_DIR, 'hostname')
  let onion: string | null = null
  if (fs.existsSync(hostnameFile)) {
    try { onion = fs.readFileSync(hostnameFile, 'utf8').trim() } catch { /* ignore */ }
  }
  return {
    running: !!proc && !proc.killed,
    onion,
    pid: proc?.pid ?? null,
    lastError,
  }
}

export function start(torBinaryPath: string, httpPort: number): { ok: boolean; error?: string } {
  if (proc) return { ok: true }
  if (!fs.existsSync(torBinaryPath)) return { ok: false, error: `tor binary not found at ${torBinaryPath}` }
  ensureLayout()
  writeTorrc(httpPort)
  try {
    proc = spawn(torBinaryPath, ['-f', TORRC_PATH], {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    proc.stderr?.on('data', (d) => { lastError = d.toString() })
    proc.on('exit', (code) => {
      if (code !== 0) lastError = `tor exited with code ${code}`
      proc = null
    })
    return { ok: true }
  } catch (err: any) {
    lastError = String(err?.message ?? err)
    proc = null
    return { ok: false, error: lastError ?? undefined }
  }
}

export function stop(): void {
  if (!proc) return
  try { proc.kill() } catch { /* ignore */ }
  proc = null
}
