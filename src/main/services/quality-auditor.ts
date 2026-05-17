// File: src/main/services/quality-auditor.ts
//
// #324 — Auto FFmpeg quality auditor. Runs on import (and on-demand
// from the Tools menu). Cheap-by-default: a single ffprobe to read
// stream metadata + a quick heuristic pass that flags obvious badness:
//
//   - missing video stream
//   - missing audio stream
//   - very low bitrate for the resolution
//   - unusual audio sample rate
//   - codec / container mismatch hint
//   - aspect ratio is non-standard
//
// Optional `deep: true` runs a full decode pass with -err_detect explode
// so the auditor sees frame-level corruption. ~30s per HD hour but
// catches truncated downloads that look fine on a thumbnail glance.

import { spawn } from 'node:child_process'

export interface QualityFinding {
  code: string
  severity: 'info' | 'warn' | 'error'
  message: string
}

export interface QualityReport {
  ok: boolean
  durationSec: number
  width: number | null
  height: number | null
  videoCodec: string | null
  audioCodec: string | null
  videoBitrateKbps: number | null
  audioBitrateKbps: number | null
  audioSampleRate: number | null
  audioChannels: number | null
  container: string | null
  findings: QualityFinding[]
}

interface ProbeResult {
  duration: number
  width: number | null
  height: number | null
  videoCodec: string | null
  audioCodec: string | null
  videoBitrateKbps: number | null
  audioBitrateKbps: number | null
  audioSampleRate: number | null
  audioChannels: number | null
  container: string | null
}

async function ffprobeJson(ffprobePath: string, videoPath: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const proc = spawn(ffprobePath, [
      '-hide_banner', '-loglevel', 'error',
      '-show_streams', '-show_format',
      '-print_format', 'json',
      videoPath,
    ], { windowsHide: true })
    let buf = ''
    proc.stdout?.on('data', (d) => { buf += d.toString() })
    proc.on('error', reject)
    proc.on('close', (code) => {
      if (code !== 0) reject(new Error(`ffprobe exit ${code}`))
      else { try { resolve(JSON.parse(buf)) } catch (err) { reject(err) } }
    })
  })
}

function parseProbe(json: any): ProbeResult {
  const streams = Array.isArray(json?.streams) ? json.streams : []
  const fmt = json?.format ?? {}
  const v = streams.find((s: any) => s.codec_type === 'video')
  const a = streams.find((s: any) => s.codec_type === 'audio')
  return {
    duration: Number(fmt.duration ?? v?.duration ?? a?.duration ?? 0),
    width: v?.width ?? null,
    height: v?.height ?? null,
    videoCodec: v?.codec_name ?? null,
    audioCodec: a?.codec_name ?? null,
    videoBitrateKbps: v?.bit_rate ? Math.round(Number(v.bit_rate) / 1000) : null,
    audioBitrateKbps: a?.bit_rate ? Math.round(Number(a.bit_rate) / 1000) : null,
    audioSampleRate: a?.sample_rate ? Number(a.sample_rate) : null,
    audioChannels: a?.channels ?? null,
    container: fmt.format_name ?? null,
  }
}

function findings(p: ProbeResult, sizeBytes: number | null): QualityFinding[] {
  const out: QualityFinding[] = []
  if (!p.videoCodec) out.push({ code: 'no-video', severity: 'error', message: 'No video stream found' })
  if (!p.audioCodec) out.push({ code: 'no-audio', severity: 'warn', message: 'No audio stream' })
  if (p.width && p.height) {
    const pixels = p.width * p.height
    // Bitrate heuristic: 1080p should be >1500 kbps for h264, 720p >800,
    // 480p >400. If file_size / duration gives us an effective bitrate
    // below this, flag it.
    const effectiveKbps = sizeBytes && p.duration > 0
      ? Math.round(((sizeBytes * 8) / p.duration) / 1000)
      : (p.videoBitrateKbps ?? 0) + (p.audioBitrateKbps ?? 0)
    let expected = 400
    if (pixels >= 1920 * 1080) expected = 1500
    else if (pixels >= 1280 * 720) expected = 800
    else if (pixels >= 854 * 480) expected = 500
    if (effectiveKbps < expected * 0.6) {
      out.push({
        code: 'low-bitrate',
        severity: 'warn',
        message: `Effective ${effectiveKbps} kbps below expected ~${expected} kbps for ${p.width}×${p.height}`,
      })
    }
  }
  if (p.audioSampleRate && p.audioSampleRate !== 44100 && p.audioSampleRate !== 48000 && p.audioSampleRate !== 32000 && p.audioSampleRate !== 96000) {
    out.push({
      code: 'unusual-sample-rate',
      severity: 'info',
      message: `Audio sampled at ${p.audioSampleRate} Hz (unusual; expect 44.1k / 48k)`,
    })
  }
  if (p.width && p.height) {
    const ratio = p.width / p.height
    const std = [16 / 9, 4 / 3, 21 / 9, 1, 9 / 16].some((r) => Math.abs(ratio - r) < 0.02)
    if (!std) {
      out.push({
        code: 'unusual-aspect',
        severity: 'info',
        message: `Aspect ratio ${ratio.toFixed(3)} (non-standard)`,
      })
    }
  }
  if (p.container && p.videoCodec) {
    // Quick mismatch hint: .mp4 with vp9, .webm with h264, etc.
    const containerHint: Record<string, string[]> = {
      'matroska,webm': ['vp8', 'vp9', 'av1', 'h264', 'hevc'],
      'mov,mp4,m4a,3gp,3g2,mj2': ['h264', 'hevc', 'av1'],
      'webm': ['vp8', 'vp9', 'av1'],
    }
    const allowed = containerHint[p.container]
    if (allowed && !allowed.includes(p.videoCodec)) {
      out.push({
        code: 'codec-container-mismatch',
        severity: 'info',
        message: `Container ${p.container} unusual for codec ${p.videoCodec}`,
      })
    }
  }
  if (p.duration < 1 && p.videoCodec) {
    out.push({ code: 'too-short', severity: 'warn', message: `Duration ${p.duration.toFixed(2)}s — header may be broken` })
  }
  return out
}

export async function auditVideo(
  ffprobePath: string,
  ffmpegPath: string,
  videoPath: string,
  options: { deep?: boolean; sizeBytes?: number | null } = {},
): Promise<QualityReport> {
  const json = await ffprobeJson(ffprobePath, videoPath)
  const probe = parseProbe(json)
  const f = findings(probe, options.sizeBytes ?? null)
  if (options.deep) {
    const deepFinding = await runDeepDecode(ffmpegPath, videoPath)
    if (deepFinding) f.push(deepFinding)
  }
  return {
    ok: f.every((x) => x.severity !== 'error'),
    durationSec: probe.duration,
    width: probe.width,
    height: probe.height,
    videoCodec: probe.videoCodec,
    audioCodec: probe.audioCodec,
    videoBitrateKbps: probe.videoBitrateKbps,
    audioBitrateKbps: probe.audioBitrateKbps,
    audioSampleRate: probe.audioSampleRate,
    audioChannels: probe.audioChannels,
    container: probe.container,
    findings: f,
  }
}

// Decode the whole file with -err_detect explode. If ffmpeg exits
// non-zero, the file has frame-level corruption. ~real-time decode
// speed for h264 on a modern CPU; faster on hwaccel.
async function runDeepDecode(ffmpegPath: string, videoPath: string): Promise<QualityFinding | null> {
  return new Promise((resolve) => {
    const proc = spawn(ffmpegPath, [
      '-hide_banner', '-loglevel', 'error',
      '-err_detect', 'explode',
      '-i', videoPath,
      '-f', 'null', '-',
    ], { windowsHide: true })
    let stderr = ''
    proc.stderr?.on('data', (d) => { stderr += d.toString() })
    proc.on('error', () => resolve({ code: 'deep-decode-failed', severity: 'error', message: 'ffmpeg failed to spawn' }))
    proc.on('close', (code) => {
      if (code === 0) resolve(null)
      else resolve({
        code: 'decode-error',
        severity: 'error',
        message: `Frame-level corruption detected: ${stderr.split(/\r?\n/).slice(0, 3).join(' ')}`,
      })
    })
  })
}
