// File: src/main/services/nostr-remote-signer.ts
//
// #282 C-58 — NIP-46 Nostr remote signer (Amber bunker). Generates an
// Amber-style bunker URI:
//
//   bunker://<remote-pubkey-hex>?relay=wss://relay.example&secret=<token>
//
// The Nostr client (Amber, nostore, etc.) connects to the relay and
// posts NIP-46 "connect" requests. We sign with the user's stored
// (encrypted) Nostr private key.
//
// Auth flow: the bunker URI's secret token must match on the first
// "connect" request; we then store the requesting app's pubkey as
// trusted (until revoked).
//
// Uses nostr-tools for keypair / signing.

import { safeStorage } from 'electron'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as crypto from 'node:crypto'

const CONFIG_FILE = path.join(process.env.APPDATA ?? '', 'vault', 'nostr-config.json')

interface NostrConfig {
  privkeyEnc: string             // base64(safeStorage(hex))
  pubkeyHex: string
  defaultRelay: string           // wss://relay.damus.io
  trustedClients: string[]       // hex pubkeys allowed without re-pairing
}

export function loadConfig(): NostrConfig | null {
  if (!fs.existsSync(CONFIG_FILE)) return null
  try { return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')) as NostrConfig }
  catch { return null }
}

function saveConfig(cfg: NostrConfig): void {
  fs.mkdirSync(path.dirname(CONFIG_FILE), { recursive: true })
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2), 'utf8')
}

export async function generateKeypair(defaultRelay = 'wss://relay.damus.io'): Promise<NostrConfig> {
  const nt = await import('nostr-tools')
  const privBytes = (nt as any).generateSecretKey()
  const privHex = Buffer.from(privBytes).toString('hex')
  const pubHex = (nt as any).getPublicKey(privBytes)
  const enc = safeStorage.encryptString(privHex).toString('base64')
  const cfg: NostrConfig = {
    privkeyEnc: enc,
    pubkeyHex: pubHex,
    defaultRelay,
    trustedClients: [],
  }
  saveConfig(cfg)
  return cfg
}

export function buildBunkerUri(): { uri: string; secret: string } | null {
  const cfg = loadConfig()
  if (!cfg) return null
  const secret = crypto.randomBytes(12).toString('base64url')
  const uri = `bunker://${cfg.pubkeyHex}?relay=${encodeURIComponent(cfg.defaultRelay)}&secret=${secret}`
  return { uri, secret }
}

export function trustClient(clientPubkeyHex: string): void {
  const cfg = loadConfig(); if (!cfg) return
  if (!cfg.trustedClients.includes(clientPubkeyHex)) cfg.trustedClients.push(clientPubkeyHex)
  saveConfig(cfg)
}

export function revokeClient(clientPubkeyHex: string): void {
  const cfg = loadConfig(); if (!cfg) return
  cfg.trustedClients = cfg.trustedClients.filter((c) => c !== clientPubkeyHex)
  saveConfig(cfg)
}

/** Sign an unsigned event with the stored privkey. Used by the bunker's
 *  WS handler when a trusted client requests signing. */
export async function signEvent(unsignedEvent: any): Promise<any | null> {
  const cfg = loadConfig(); if (!cfg) return null
  const privHex = safeStorage.decryptString(Buffer.from(cfg.privkeyEnc, 'base64'))
  const privBytes = Buffer.from(privHex, 'hex')
  const nt = await import('nostr-tools')
  const event = { ...unsignedEvent, pubkey: cfg.pubkeyHex }
  return (nt as any).finalizeEvent(event, privBytes)
}
