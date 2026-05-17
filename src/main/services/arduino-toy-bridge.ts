// File: src/main/services/arduino-toy-bridge.ts
//
// #375 H-151 — Arduino / DIY-toy serial bridge. Wraps node-serialport
// to talk to a user's Arduino-class device on a COM/tty port. The
// firmware sketch we target (lives in arduino-firmware/, separate
// repo) reads newline-terminated commands:
//
//   S<intensity>\n     set steady intensity 0-100
//   P<pattern-bytes>\n play pattern (compact)
//   X\n                stop / zero intensity
//   ?\n                request "ready" handshake
//
// Two layers:
//   - listPorts()      → enumerate serial devices
//   - openBridge(path) → keep a persistent connection + send commands
//
// We expose a high-level API that other services (#345 heart-rate,
// #346 climax verifier) can drive without reaching into serialport.

import type { SerialPort as SerialPortType } from 'serialport'

let port: SerialPortType | null = null
let portPath = ''
let ready = false
let lastError: string | null = null

export async function listPorts(): Promise<Array<{ path: string; manufacturer?: string; productId?: string }>> {
  const { SerialPort } = await import('serialport')
  return SerialPort.list() as any
}

export async function openBridge(path: string, baudRate = 115200): Promise<{ ok: boolean; error?: string }> {
  if (port?.isOpen) { try { await port.close() } catch { /* ignore */ } }
  try {
    const { SerialPort } = await import('serialport')
    port = new SerialPort({ path, baudRate, autoOpen: false })
    portPath = path
    await new Promise<void>((resolve, reject) => {
      port!.open((err: Error | null | undefined) => err ? reject(err) : resolve())
    })
    // Wait for "READY\n" from the sketch.
    let buf = ''
    port.on('data', (chunk: Buffer) => {
      buf += chunk.toString('utf8')
      const nl = buf.indexOf('\n')
      while (nl >= 0) {
        const line = buf.slice(0, nl).trim()
        buf = buf.slice(nl + 1)
        if (line === 'READY') ready = true
      }
    })
    port.write('?\n')
    return { ok: true }
  } catch (err: any) {
    lastError = String(err?.message ?? err)
    return { ok: false, error: lastError ?? undefined }
  }
}

export async function setIntensity(level: number): Promise<{ ok: boolean; error?: string }> {
  if (!port?.isOpen) return { ok: false, error: 'not connected' }
  const v = Math.max(0, Math.min(100, Math.round(level)))
  return new Promise((resolve) => {
    port!.write(`S${v}\n`, (err: any) => {
      if (err) resolve({ ok: false, error: String(err?.message ?? err) })
      else resolve({ ok: true })
    })
  })
}

export async function playPattern(pattern: Array<[intensity: number, ms: number]>): Promise<{ ok: boolean; error?: string }> {
  if (!port?.isOpen) return { ok: false, error: 'not connected' }
  // Compact encoding: P<count><i,ms16><i,ms16>...\n where each tuple
  // is 3 bytes (intensity byte + 16-bit ms big-endian).
  const bytes: number[] = ['P'.charCodeAt(0), pattern.length & 0xff]
  for (const [i, ms] of pattern) {
    const v = Math.max(0, Math.min(255, Math.round(i)))
    const msc = Math.max(0, Math.min(65535, Math.round(ms)))
    bytes.push(v, (msc >> 8) & 0xff, msc & 0xff)
  }
  bytes.push(0x0a)
  return new Promise((resolve) => {
    port!.write(Buffer.from(bytes), (err: any) => {
      if (err) resolve({ ok: false, error: String(err?.message ?? err) })
      else resolve({ ok: true })
    })
  })
}

export async function stop(): Promise<{ ok: boolean }> {
  if (!port?.isOpen) return { ok: true }
  return new Promise((resolve) => {
    port!.write('X\n', () => resolve({ ok: true }))
  })
}

export async function closeBridge(): Promise<void> {
  if (!port?.isOpen) return
  try { await port.close() } catch { /* ignore */ }
  port = null
  portPath = ''
  ready = false
}

export function status(): { connected: boolean; path: string; ready: boolean; lastError: string | null } {
  return { connected: !!port?.isOpen, path: portPath, ready, lastError }
}
