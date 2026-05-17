// File: src/main/services/hls-on-demand.ts
//
// #234 A-10 — Adaptive HLS transcode-on-demand for remote streaming.
// Wraps ffmpeg's HLS muxer so a remote client (phone on cellular,
// VR headset over LAN) can stream a Vault video without us having
// the original file pre-encoded. On first request for a media id:
//
//   1. Spawn ffmpeg → temp dir, writing playlist.m3u8 + segment_*.ts
//   2. Serve files from that dir via the existing mobile-sync HTTP
//      server (or a dedicated port if mobile-sync isn't running)
//   3. Reuse the temp dir for 30 min, then GC
//
// Three preset ladders so client can switch quality:
//   - 480p @ 1 Mbps  (cellular)
//   - 720p @ 2.5 Mbps (LAN)
//   - 1080p @ 5 Mbps  (good LAN)
//
// All single-ladder HLS — full ABR (variants in master.m3u8) would
// double the encode cost; the renderer picks the right ladder by
// detecting bandwidth + asking us for that specific stream.

import { ChildProcess, spawn } from 'node:child_process'
import * as path from 'node:path'
import * as fs from 'node:fs'
import * as os from 'node:os'
import { promises as fsp } from 'node:fs'

export type HlsQuality = '480p' | '720p' | '1080p'

interface QualityPreset {
  width: number; height: number; vbitrate: string; abitrate: string
}
const PRESETS: Record<HlsQuality, QualityPreset> = {
  '480p': { width: 854, height: 480, vbitrate: '900k', abitrate: '96k' },
  '720p': { width: 1280, height: 720, vbitrate: '2200k', abitrate: '128k' },
  '1080p': { width: 1920, height: 1080, vbitrate: '4500k', abitrate: '160k' },
}

interface ActiveSession {
  mediaId: string
  quality: HlsQuality
  outDir: string
  playlistPath: string
  proc: ChildProcess | null
  startedAt: number
  lastTouched: number
  ready: boolean
  error: string | null
}

const SESSIONS = new Map<string, ActiveSession>()
const TTL_MS = 30 * 60_000
let gcTimer: NodeJS.Timeout | null = null

function sessionKey(mediaId: string, quality: HlsQuality): string {
  return `${mediaId}|${quality}`
}

function ensureGc(): void {
  if (gcTimer) return
  gcTimer = setInterval(() => {
    const now = Date.now()
    for (const [key, session] of SESSIONS.entries()) {
      if (now - session.lastTouched > TTL_MS) {
        try { session.proc?.kill('SIGKILL') } catch { /* ignore */ }
        try { fs.rmSync(session.outDir, { recursive: true, force: true }) } catch { /* ignore */ }
        SESSIONS.delete(key)
        console.log(`[hls] evicted session ${key}`)
      }
    }
  }, 60_000)
  gcTimer.unref?.()
}

export interface SessionInfo {
  ready: boolean
  playlistPath: string
  outDir: string
  startedAt: number
  error: string | null
}

export async function startHlsSession(
  ffmpegPath: string,
  mediaPath: string,
  mediaId: string,
  quality: HlsQuality = '720p',
): Promise<SessionInfo> {
  ensureGc()
  const key = sessionKey(mediaId, quality)
  const existing = SESSIONS.get(key)
  if (existing) {
    existing.lastTouched = Date.now()
    return {
      ready: existing.ready, playlistPath: existing.playlistPath,
      outDir: existing.outDir, startedAt: existing.startedAt,
      error: existing.error,
    }
  }
  const outDir = path.join(os.tmpdir(), `vault-hls-${mediaId.slice(0, 12)}-${quality}-${Date.now().toString(36)}`)
  await fsp.mkdir(outDir, { recursive: true })
  const playlistPath = path.join(outDir, 'playlist.m3u8')
  const preset = PRESETS[quality]
  const args = [
    '-hide_banner', '-y', '-loglevel', 'error',
    '-i', mediaPath,
    '-vf', `scale=${preset.width}:${preset.height}:force_original_aspect_ratio=decrease,pad=${preset.width}:${preset.height}:(ow-iw)/2:(oh-ih)/2`,
    '-c:v', 'libx264', '-preset', 'veryfast', '-b:v', preset.vbitrate,
    '-c:a', 'aac', '-b:a', preset.abitrate,
    '-hls_time', '6', '-hls_list_size', '0', '-hls_segment_filename', path.join(outDir, 'segment_%05d.ts'),
    '-f', 'hls', playlistPath,
  ]
  const proc = spawn(ffmpegPath, args, { windowsHide: true })
  const session: ActiveSession = {
    mediaId, quality, outDir, playlistPath, proc,
    startedAt: Date.now(), lastTouched: Date.now(),
    ready: false, error: null,
  }
  SESSIONS.set(key, session)
  let stderr = ''
  proc.stderr?.on('data', (d) => { stderr += d.toString('utf8') })
  proc.on('exit', (code) => {
    if (code !== 0 && code !== null) {
      session.error = `ffmpeg exit ${code}: ${stderr.split(/\r?\n/).slice(-3).join(' ')}`
    }
  })
  // Wait until the playlist file appears with at least one segment so
  // the client can start fetching. Then return the session info.
  await new Promise<void>((resolve) => {
    const start = Date.now()
    const tick = setInterval(() => {
      if (fs.existsSync(playlistPath) && fs.statSync(playlistPath).size > 100) {
        session.ready = true
        clearInterval(tick); resolve()
        return
      }
      if (Date.now() - start > 30_000) {  // 30s timeout to first segment
        session.error = session.error ?? 'first segment timeout'
        clearInterval(tick); resolve()
      }
    }, 250)
  })
  return {
    ready: session.ready, playlistPath, outDir,
    startedAt: session.startedAt, error: session.error,
  }
}

export function touchSession(mediaId: string, quality: HlsQuality): boolean {
  const key = sessionKey(mediaId, quality)
  const s = SESSIONS.get(key)
  if (!s) return false
  s.lastTouched = Date.now()
  return true
}

export function stopSession(mediaId: string, quality: HlsQuality): void {
  const key = sessionKey(mediaId, quality)
  const s = SESSIONS.get(key)
  if (!s) return
  try { s.proc?.kill('SIGKILL') } catch { /* ignore */ }
  try { fs.rmSync(s.outDir, { recursive: true, force: true }) } catch { /* ignore */ }
  SESSIONS.delete(key)
}

export function listSessions(): Array<{ mediaId: string; quality: HlsQuality; ready: boolean; ageMs: number; outDir: string }> {
  const now = Date.now()
  return Array.from(SESSIONS.values()).map((s) => ({
    mediaId: s.mediaId, quality: s.quality, ready: s.ready,
    ageMs: now - s.startedAt, outDir: s.outDir,
  }))
}
