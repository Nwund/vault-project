// File: src/main/services/hyperswarm-mesh.ts
//
// #266 C-42 — Hyperswarm DHT trusted-device mesh. Each Vault instance
// generates a 32-byte topic key (the "mesh ID") that's shared between
// trusted devices via QR / secure-channel. Joining the swarm on that
// topic gives every device a direct peer-to-peer connection over UDP
// hole-punching; no signaling server needed.
//
// Once connected, each peer announces its capabilities (sync-ready,
// device-name, fingerprint). The renderer subscribes to peer events
// via the `hyperswarm:peer` IPC channel.
//
// This service is the transport ONLY — application protocols (file
// sync, vault-state replication) ride on top via the duplex socket
// the swarm exposes.

import { safeStorage } from 'electron'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as crypto from 'node:crypto'

const STATE_FILE = path.join(process.env.APPDATA ?? '', 'vault', 'mesh-state.json')

export interface MeshState {
  topic: string                  // hex 32-byte topic id
  deviceName: string
  trustedFingerprints: string[]
}

interface ActivePeer {
  fingerprint: string
  deviceName: string
  socket: any
}

let swarm: any | null = null
let peers: Map<string, ActivePeer> = new Map()
const listeners: Array<(ev: { kind: 'join' | 'leave'; fingerprint: string; deviceName: string }) => void> = []

export function loadState(): MeshState | null {
  if (!fs.existsSync(STATE_FILE)) return null
  try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')) as MeshState }
  catch { return null }
}

export function saveState(state: MeshState): void {
  fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true })
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf8')
}

export function generateTopic(): string {
  return crypto.randomBytes(32).toString('hex')
}

export function deviceFingerprint(): string {
  if (!safeStorage.isEncryptionAvailable()) return crypto.randomBytes(16).toString('hex')
  // Stable per-machine fingerprint via safeStorage round-trip.
  const probe = safeStorage.encryptString('vault-mesh-fp-v1')
  return crypto.createHash('sha256').update(probe).digest('hex').slice(0, 32)
}

export async function startMesh(state: MeshState): Promise<{ ok: boolean; error?: string }> {
  if (swarm) return { ok: true }
  try {
    // @ts-ignore — no upstream types for hyperswarm
    const HyperswarmMod = await import('hyperswarm')
    const Hyperswarm = (HyperswarmMod as any).default ?? HyperswarmMod
    swarm = new Hyperswarm()
    const topic = Buffer.from(state.topic, 'hex')
    const fp = deviceFingerprint()
    swarm.on('connection', (socket: any, info: any) => {
      const peerFp = info?.publicKey?.toString('hex') ?? crypto.randomBytes(8).toString('hex')
      // Each peer sends a hello frame: \x01<deviceName-utf8>\n
      socket.write(Buffer.from(`\x01${state.deviceName}\n`, 'utf8'))
      let buf = Buffer.alloc(0)
      socket.on('data', (chunk: Buffer) => {
        buf = Buffer.concat([buf, chunk])
        const nl = buf.indexOf(0x0a)
        if (nl > 0 && buf[0] === 0x01) {
          const name = buf.slice(1, nl).toString('utf8')
          peers.set(peerFp, { fingerprint: peerFp, deviceName: name, socket })
          for (const l of listeners) l({ kind: 'join', fingerprint: peerFp, deviceName: name })
          buf = buf.slice(nl + 1)
        }
      })
      socket.on('close', () => {
        const p = peers.get(peerFp)
        peers.delete(peerFp)
        if (p) for (const l of listeners) l({ kind: 'leave', fingerprint: peerFp, deviceName: p.deviceName })
      })
    })
    const discovery = swarm.join(topic, { server: true, client: true })
    await discovery.flushed()
    return { ok: true }
  } catch (err: any) {
    return { ok: false, error: String(err?.message ?? err) }
  }
}

export async function stopMesh(): Promise<void> {
  if (!swarm) return
  try { await swarm.destroy() } catch { /* ignore */ }
  swarm = null
  peers.clear()
}

export function listPeers(): Array<{ fingerprint: string; deviceName: string }> {
  return [...peers.values()].map((p) => ({ fingerprint: p.fingerprint, deviceName: p.deviceName }))
}

export function onPeerEvent(cb: (ev: { kind: 'join' | 'leave'; fingerprint: string; deviceName: string }) => void): () => void {
  listeners.push(cb)
  return () => {
    const i = listeners.indexOf(cb)
    if (i >= 0) listeners.splice(i, 1)
  }
}

/** Broadcast a frame (\x02<json-utf8>\n) to all connected peers. */
export function broadcast(message: Record<string, any>): void {
  const frame = Buffer.from(`\x02${JSON.stringify(message)}\n`, 'utf8')
  for (const p of peers.values()) {
    try { p.socket.write(frame) } catch { /* ignore */ }
  }
}
