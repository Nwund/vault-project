// File: src/main/services/message-port-bus.ts
//
// #331 F-107 — MessagePort bus for hot IPC channels. ipcRenderer.invoke
// goes through the main process event loop; for channels that fire
// at video-frame rate (scrub-thumbnail-preview, haptic-pulse,
// audio-meter), the cost adds up. MessagePort sits on a direct
// renderer↔main duplex pipe that bypasses the standard event loop.
//
// Usage:
//   1. Renderer calls `messagePort:open` with a channel name.
//   2. Main creates a {port1, port2} pair; ships port2 to renderer
//      via webContents.postMessage(channel, null, [port2]).
//   3. Renderer wires `port.onmessage` handlers.
//   4. Both sides postMessage() without going through the standard
//      IPC marshalling.
//
// Currently exposes:
//   "scrub-thumbs" — renderer requests a thumbnail at time T; main
//                    shells ffmpeg with -ss <T> -frames:v 1 -s 160x90
//                    and posts back a base64 JPEG. Disk-cached in
//                    %APPDATA%/vault/thumbs/scrub/ keyed by
//                    {sha1(path)}-{bucket(time)}.jpg so seek-scrubbing
//                    a video is instant after the first pass.
//   "haptic"       — renderer pushes per-frame intensity floats; main
//                    forwards to whichever haptic device is connected.
//   "audio-meter"  — main pushes per-frame audio-meter values; renderer
//                    paints them.

import { MessageChannelMain, MessagePortMain, WebContents, app } from 'electron'
import { spawn } from 'node:child_process'
import * as path from 'node:path'
import * as fs from 'node:fs'
import * as crypto from 'node:crypto'
import { ffmpegBin } from '../ffpaths'

type ChannelName = 'scrub-thumbs' | 'haptic' | 'audio-meter'

interface ChannelHandlers {
  onMessage: (port: MessagePortMain, message: any) => void
}

// ────────────────────────────────────────────────────────────────────────
// Scrub-thumb implementation: ffmpeg single-frame extract + on-disk cache
// ────────────────────────────────────────────────────────────────────────

// Bucket the requested time to 1-second granularity so cache hits dominate
// after the first seek-scroll. (Seek scrubbing fires hundreds of events.)
function bucketTime(timeSec: number): number {
  return Math.max(0, Math.floor(timeSec))
}

function getScrubCacheDir(): string {
  const dir = path.join(app.getPath('userData'), 'thumbs', 'scrub')
  try { fs.mkdirSync(dir, { recursive: true }) } catch { /* ignore */ }
  return dir
}

function cachePathFor(videoPath: string, bucket: number): string {
  const hash = crypto.createHash('sha1').update(videoPath).digest('hex').slice(0, 16)
  return path.join(getScrubCacheDir(), `${hash}-${bucket}.jpg`)
}

const inflight = new Map<string, Promise<string | null>>()

async function extractFrame(videoPath: string, timeSec: number, outPath: string): Promise<boolean> {
  const bin = ffmpegBin
  if (!bin) return false
  return new Promise<boolean>((resolve) => {
    const args = [
      '-ss', String(timeSec),
      '-i', videoPath,
      '-frames:v', '1',
      '-vf', 'scale=160:-2',
      '-q:v', '5',          // JPEG quality 1-31; 5 is high-ish, ~10KB per thumb
      '-y',
      outPath,
    ]
    const proc = spawn(bin, args, { stdio: 'ignore' as const })
    proc.on('exit', (code: number | null) => resolve(code === 0))
    proc.on('error', () => resolve(false))
  })
}

async function getScrubThumb(videoPath: string, timeSec: number): Promise<string | null> {
  const bucket = bucketTime(timeSec)
  const outPath = cachePathFor(videoPath, bucket)
  // Cache hit
  if (fs.existsSync(outPath)) {
    try {
      const b = fs.readFileSync(outPath)
      return `data:image/jpeg;base64,${b.toString('base64')}`
    } catch { /* fall through */ }
  }
  // De-dupe concurrent requests for the same bucket
  const key = `${videoPath}\0${bucket}`
  if (inflight.has(key)) return inflight.get(key)!
  const promise = (async () => {
    try {
      const ok = await extractFrame(videoPath, bucket, outPath)
      if (!ok) return null
      const b = fs.readFileSync(outPath)
      return `data:image/jpeg;base64,${b.toString('base64')}`
    } catch {
      return null
    } finally {
      inflight.delete(key)
    }
  })()
  inflight.set(key, promise)
  return promise
}

// ────────────────────────────────────────────────────────────────────────
// Channel handlers
// ────────────────────────────────────────────────────────────────────────

const handlers: Record<ChannelName, ChannelHandlers> = {
  'scrub-thumbs': {
    onMessage: async (port, message) => {
      // Expected shape: { requestId: string, videoPath: string, timeSec: number }
      const { requestId, videoPath, timeSec } = message ?? {}
      if (typeof videoPath !== 'string' || typeof timeSec !== 'number') {
        port.postMessage({ kind: 'thumb-reply', requestId, dataUrl: null, error: 'bad-args' })
        return
      }
      const dataUrl = await getScrubThumb(videoPath, timeSec)
      port.postMessage({ kind: 'thumb-reply', requestId, dataUrl, timeSec, bucket: bucketTime(timeSec) })
    },
  },
  'haptic': {
    onMessage: (port, message) => {
      // Stub: forward to whichever haptic bridge (ESP32 / Arduino /
      // Apple Watch) is currently the user's active device. Wired up
      // by the consuming service.
      void port; void message
    },
  },
  'audio-meter': {
    onMessage: (port, message) => {
      void port; void message
    },
  },
}

export function openChannel(webContents: WebContents, channel: ChannelName): void {
  const { port1, port2 } = new MessageChannelMain()
  port1.on('message', (e) => {
    try { handlers[channel].onMessage(port1, e.data) }
    catch (err) { console.error('[mpb]', channel, err) }
  })
  port1.start()
  webContents.postMessage(`mpb:${channel}`, null, [port2])
}

export function registerChannelHandler(channel: ChannelName, handler: (port: MessagePortMain, message: any) => void): void {
  handlers[channel].onMessage = handler
}
