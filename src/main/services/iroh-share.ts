// File: src/main/services/iroh-share.ts
//
// #265 C-41 — Iroh blob ticket sharing. Wraps the @number0/iroh
// node-bindings to expose two simple operations:
//
//   shareFile(absPath) → BlobTicket string + a QR-code PNG (data:URL)
//   downloadByTicket(ticket, dstPath) → fetches the blob to dstPath
//
// Iroh is content-addressed P2P over QUIC; the ticket is a portable
// connection string that contains everything the receiver needs.
// Sharing without exposing the user's IP is handled by Iroh's relay
// network.
//
// Lifecycle: one shared Node instance per process. start() lazily
// boots the node; shutdown() drains it.

import * as path from 'node:path'
import * as fs from 'node:fs'

let node: any | null = null

async function ensureNode(): Promise<any> {
  if (node) return node
  const { Iroh } = await import('@number0/iroh')
  // Persist node identity under userData so addressbook + author stay stable.
  const dataDir = path.join(process.env.APPDATA ?? '', 'vault', 'iroh-node')
  fs.mkdirSync(dataDir, { recursive: true })
  node = await Iroh.persistent(dataDir)
  return node
}

export async function shareFile(absPath: string): Promise<{ ticket: string; qrDataUrl: string }> {
  const n = await ensureNode()
  const blob = await n.blobs.addFromPath(absPath, false, 'auto', 'natural')
  const ticket = await n.blobs.share(blob.hash, blob.format, 'RelayAndAddresses')
  // @ts-ignore — no upstream types for qrcode
  const QRCode = (await import('qrcode')).default
  const qrDataUrl = await QRCode.toDataURL(ticket, { errorCorrectionLevel: 'M', margin: 1, width: 360 })
  return { ticket, qrDataUrl }
}

export async function downloadByTicket(ticket: string, dstPath: string): Promise<{ ok: boolean; bytes?: number; error?: string }> {
  try {
    const n = await ensureNode()
    const { BlobTicket } = await import('@number0/iroh')
    const t: any = BlobTicket.fromString(ticket)
    fs.mkdirSync(path.dirname(dstPath), { recursive: true })
    const hash = (t.hashAndFormat?.hash) ?? t.hash
    const addr = (t.nodeAddr?.()) ?? t.nodeAddr
    await n.blobs.downloadHashSeq(hash, addr)
    await n.blobs.export(hash, dstPath, 'File', 'Copy')
    const stat = fs.statSync(dstPath)
    return { ok: true, bytes: stat.size }
  } catch (err: any) {
    return { ok: false, error: String(err?.message ?? err) }
  }
}

export async function shutdown(): Promise<void> {
  if (!node) return
  try { await node.node.shutdown() } catch { /* ignore */ }
  node = null
}
