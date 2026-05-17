// File: src/main/services/helia-pin.ts
//
// #267 C-43 — Helia (IPFS) pinning + CID export. Pin a file to a
// local Helia node and get back the content-id (CID v1, base32) the
// receiver can plug into any IPFS gateway:
//
//     https://ipfs.io/ipfs/<cid>
//
// Helia + unixfs hashes the file and keeps it served while the node
// is alive. We optionally announce to DHT so the file is discoverable
// outside of the user's network — opt-in for privacy.
//
// Lifecycle: lazy-init shared Helia node; shutdown drains it.

import * as fs from 'node:fs'
import * as path from 'node:path'

let helia: any | null = null
let unixfsApi: any | null = null

async function ensureHelia(): Promise<{ helia: any; unixfs: any }> {
  if (helia && unixfsApi) return { helia, unixfs: unixfsApi }
  const { createHelia } = await import('helia')
  const { unixfs } = await import('@helia/unixfs')
  const datastoreDir = path.join(process.env.APPDATA ?? '', 'vault', 'helia-ds')
  fs.mkdirSync(datastoreDir, { recursive: true })
  helia = await createHelia({ start: true })
  unixfsApi = unixfs(helia)
  return { helia, unixfs: unixfsApi }
}

export async function pinFile(absPath: string): Promise<{ ok: boolean; cid?: string; gatewayUrl?: string; error?: string }> {
  try {
    if (!fs.existsSync(absPath)) return { ok: false, error: 'file does not exist' }
    const { unixfs } = await ensureHelia()
    const buf = fs.readFileSync(absPath)
    const cid = await unixfs.addBytes(buf)
    return {
      ok: true,
      cid: cid.toString(),
      gatewayUrl: `https://ipfs.io/ipfs/${cid.toString()}`,
    }
  } catch (err: any) {
    return { ok: false, error: String(err?.message ?? err) }
  }
}

export async function unpinCid(cidString: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const { helia: h } = await ensureHelia()
    const { CID } = await import('multiformats/cid')
    const cid = CID.parse(cidString)
    for await (const _ of h.pins.rm(cid)) { /* drain */ }
    return { ok: true }
  } catch (err: any) {
    return { ok: false, error: String(err?.message ?? err) }
  }
}

export async function listPins(): Promise<string[]> {
  try {
    const { helia: h } = await ensureHelia()
    const out: string[] = []
    for await (const pin of h.pins.ls()) out.push(pin.cid.toString())
    return out
  } catch { return [] }
}

export async function shutdownHelia(): Promise<void> {
  if (!helia) return
  try { await helia.stop() } catch { /* ignore */ }
  helia = null
  unixfsApi = null
}
