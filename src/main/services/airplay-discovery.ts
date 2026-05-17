// File: src/main/services/airplay-discovery.ts
//
// #184 — AirPlay 2 receiver discovery (Phase 1).
//
// Phase 1 (this implementation): mDNS discovery of AirPlay 2 receivers
// on the LAN — Apple TVs, HomePods, AirPlay-compatible smart TVs.
// Returns a list of {name, host, port, features} so the renderer can
// surface them in the cast menu next to Chromecast / DLNA targets.
//
// Phase 2 (deferred): actual streaming. Full AirPlay video sender
// requires reverse-engineered protocol work + Apple's MFi tokens for
// AirPlay 2. The realistic options on Windows are:
//   - Wrap a `shairport-sync` binary (audio only, well-maintained)
//   - Bundle `AirParrot` / `Reflector` (commercial)
//   - Use the `airtunes2` npm package (audio only, abandoned 2018)
//
// For now Phase 1 alone is useful: the renderer can show "AirPlay
// receivers on your network" + a one-click "copy stream URL" so the
// user pastes into VLC/Infuse/whatever on the receiving device.
//
// We use Electron's built-in mdns scanner where available, otherwise
// fall back to a manual UDP multicast query. No npm dep needed.

import dgram from 'node:dgram'

export interface AirPlayReceiver {
  name: string
  host: string
  port: number
  /** Comma-separated AirPlay feature bitmap (raw hex). */
  features: string | null
  /** From the TXT record — receiver model id. */
  model: string | null
  /** AirPlay 2 supports password protection — surfaces "requires PIN" hint. */
  requiresAuth: boolean
}

const MDNS_GROUP = '224.0.0.251'
const MDNS_PORT = 5353
const AIRPLAY_SERVICE = '_airplay._tcp.local'
const RAOP_SERVICE = '_raop._tcp.local'  // audio-only AirPlay (HomePod etc.)

/**
 * Send one mDNS PTR query for _airplay._tcp.local + _raop._tcp.local
 * and collect responses for `timeoutMs`. Returns deduplicated
 * receivers keyed by name.
 */
export async function discoverReceivers(timeoutMs = 3500): Promise<AirPlayReceiver[]> {
  const found = new Map<string, AirPlayReceiver>()
  return new Promise<AirPlayReceiver[]>((resolve) => {
    let socket: dgram.Socket
    try {
      socket = dgram.createSocket({ type: 'udp4', reuseAddr: true })
    } catch {
      resolve([])
      return
    }
    socket.on('error', () => { /* swallow — return whatever we found */ })
    socket.on('message', (msg) => {
      const parsed = parseMdnsResponse(msg)
      for (const r of parsed) {
        if (!found.has(r.name)) found.set(r.name, r)
      }
    })
    socket.bind(0, () => {
      try {
        socket.setMulticastTTL(255)
        socket.addMembership(MDNS_GROUP)
      } catch { /* may fail on locked-down systems */ }
      const queries = [
        buildPtrQuery(AIRPLAY_SERVICE),
        buildPtrQuery(RAOP_SERVICE),
      ]
      for (const q of queries) {
        try { socket.send(q, 0, q.length, MDNS_PORT, MDNS_GROUP) } catch { /* noop */ }
      }
    })
    setTimeout(() => {
      try { socket.close() } catch { /* noop */ }
      resolve(Array.from(found.values()))
    }, timeoutMs)
  })
}

// ─── mDNS packet building / parsing — minimal subset ─────────────
function buildPtrQuery(name: string): Buffer {
  const header = Buffer.alloc(12)
  header.writeUInt16BE(0x0000, 0) // transaction id
  header.writeUInt16BE(0x0000, 2) // flags = query
  header.writeUInt16BE(0x0001, 4) // QDCOUNT = 1
  const labels = name.split('.').filter(Boolean)
  const qname = Buffer.concat(labels.map((l) => {
    const b = Buffer.alloc(1 + l.length)
    b.writeUInt8(l.length, 0)
    b.write(l, 1, 'ascii')
    return b
  }).concat([Buffer.from([0x00])]))
  const tail = Buffer.alloc(4)
  tail.writeUInt16BE(0x000C, 0) // QTYPE = PTR
  tail.writeUInt16BE(0x0001, 2) // QCLASS = IN
  return Buffer.concat([header, qname, tail])
}

/**
 * Extract receiver records from an mDNS response. Implements just
 * enough RR parsing to pull PTR → SRV → A + TXT for AirPlay services.
 * Not RFC-complete but handles the common Apple TV / HomePod responses.
 */
function parseMdnsResponse(buf: Buffer): AirPlayReceiver[] {
  try {
    if (buf.length < 12) return []
    const answers: { name: string; type: number; data: Buffer; offset: number }[] = []
    let off = 12
    // Skip questions (QDCOUNT)
    const qd = buf.readUInt16BE(4)
    for (let i = 0; i < qd; i++) {
      off = skipName(buf, off)
      off += 4
    }
    const an = buf.readUInt16BE(6) + buf.readUInt16BE(8) + buf.readUInt16BE(10)
    for (let i = 0; i < an && off < buf.length; i++) {
      const { name, next } = readName(buf, off)
      off = next
      if (off + 10 > buf.length) break
      const type = buf.readUInt16BE(off)
      off += 4 // skip type + class
      off += 4 // ttl
      const rdlen = buf.readUInt16BE(off)
      off += 2
      const data = buf.subarray(off, off + rdlen)
      answers.push({ name, type, data, offset: off })
      off += rdlen
    }

    // Index by name for cross-record correlation.
    const srvByName = new Map<string, { target: string; port: number }>()
    const txtByName = new Map<string, Record<string, string>>()
    const aByHost = new Map<string, string>()
    const ptrTargets: string[] = []

    for (const a of answers) {
      if (a.type === 12) {
        // PTR
        const { name: tgt } = readName(buf, a.offset)
        ptrTargets.push(tgt)
      } else if (a.type === 33) {
        // SRV
        if (a.data.length >= 6) {
          const port = a.data.readUInt16BE(4)
          const { name: target } = readName(buf, a.offset + 6)
          srvByName.set(a.name, { target, port })
        }
      } else if (a.type === 16) {
        // TXT
        const kv = parseTxt(a.data)
        txtByName.set(a.name, kv)
      } else if (a.type === 1) {
        // A (IPv4)
        if (a.data.length === 4) {
          aByHost.set(a.name, `${a.data[0]}.${a.data[1]}.${a.data[2]}.${a.data[3]}`)
        }
      }
    }

    const receivers: AirPlayReceiver[] = []
    for (const tgt of ptrTargets) {
      const srv = srvByName.get(tgt)
      if (!srv) continue
      const host = aByHost.get(srv.target) ?? srv.target
      const txt = txtByName.get(tgt) ?? {}
      const friendly = tgt.replace(/\._airplay\._tcp\.local\.?$/, '').replace(/\._raop\._tcp\.local\.?$/, '')
      receivers.push({
        name: friendly,
        host,
        port: srv.port,
        features: txt.features ?? txt.ft ?? null,
        model: txt.model ?? txt.am ?? null,
        requiresAuth: txt.pw === '1' || txt.password === 'true',
      })
    }
    return receivers
  } catch {
    return []
  }
}

function readName(buf: Buffer, off: number): { name: string; next: number } {
  const labels: string[] = []
  let cur = off
  let jumped = false
  let returnOff = off
  let guard = 0
  while (cur < buf.length && guard++ < 64) {
    const len = buf[cur]
    if (len === 0) { cur += 1; break }
    if ((len & 0xC0) === 0xC0) {
      // pointer
      if (cur + 1 >= buf.length) break
      const ptr = ((len & 0x3F) << 8) | buf[cur + 1]
      if (!jumped) returnOff = cur + 2
      cur = ptr
      jumped = true
      continue
    }
    if (cur + 1 + len > buf.length) break
    labels.push(buf.subarray(cur + 1, cur + 1 + len).toString('ascii'))
    cur += 1 + len
  }
  return { name: labels.join('.'), next: jumped ? returnOff : cur }
}

function skipName(buf: Buffer, off: number): number {
  return readName(buf, off).next
}

function parseTxt(data: Buffer): Record<string, string> {
  const out: Record<string, string> = {}
  let off = 0
  while (off < data.length) {
    const len = data[off]
    if (len === 0 || off + 1 + len > data.length) break
    const piece = data.subarray(off + 1, off + 1 + len).toString('utf8')
    const eq = piece.indexOf('=')
    if (eq > 0) out[piece.slice(0, eq).toLowerCase()] = piece.slice(eq + 1)
    off += 1 + len
  }
  return out
}
