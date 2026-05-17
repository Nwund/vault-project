// File: src/renderer/utils/cock-hero.ts
//
// #352 G-128 — Cock-Hero beatmap generator. Takes a video's audio
// track, detects beats via the existing BPM detector, returns a
// playable beatmap the player overlay can render as falling stroke
// arrows / pulse rings / instruction text.
//
// The "Cock-Hero" pattern (named after the video genre): falling
// markers cue stroke direction + speed; user matches the rhythm.
// Each accent beat (top 20% intensity) gets a special "HIT" marker.
//
// This module is renderer-only — uses Web Audio API for decode + the
// renderer-side BPM detector. No main-process or sidecar dep.

import { detectBeatsFromBuffer, type BeatEvent } from './bpm-detector'

export interface CockHeroBeatmap {
  durationSec: number
  bpm: number
  confidence: number
  beats: BeatEvent[]
  patternSummary: {
    totalBeats: number
    accentCount: number
    averageInterval: number  // seconds between beats
    intensityArc: 'rising' | 'falling' | 'flat'  // overall trajectory
  }
}

/**
 * Decode a video file's audio track via the offline Web Audio API,
 * then run beat detection. Returns null if the file can't be decoded
 * or has no audio.
 *
 * `srcUrl` should be a vault://, file://, or blob: URL pointing at
 * the video. We fetch the bytes, decode the first channel, and pass
 * it to the BPM detector.
 */
export async function generateCockHeroBeatmap(srcUrl: string, options: { maxAnalyzeSec?: number } = {}): Promise<CockHeroBeatmap | null> {
  const maxSec = options.maxAnalyzeSec ?? 120
  try {
    const resp = await fetch(srcUrl)
    if (!resp.ok) return null
    const buf = await resp.arrayBuffer()
    // Use an OfflineAudioContext so we don't actually play anything.
    // We need the audio to be decodable as a media file (mp4/webm).
    // browsers will route through their audio demuxer.
    const ac = new (window.AudioContext || (window as any).webkitAudioContext)()
    let decoded: AudioBuffer
    try {
      decoded = await ac.decodeAudioData(buf.slice(0))
    } finally {
      try { await ac.close() } catch { /* ignore */ }
    }
    const channel = decoded.getChannelData(0)
    const slice = channel.length > maxSec * decoded.sampleRate
      ? channel.slice(0, maxSec * decoded.sampleRate)
      : channel
    const { beats, bpm, confidence } = detectBeatsFromBuffer(slice, decoded.sampleRate)
    if (beats.length === 0) return null
    const accentCount = beats.filter((b) => b.isAccent).length
    const intervals: number[] = []
    for (let i = 1; i < beats.length; i++) intervals.push(beats[i].timeSec - beats[i - 1].timeSec)
    const averageInterval = intervals.length > 0 ? intervals.reduce((a, b) => a + b, 0) / intervals.length : 0
    // Intensity arc: compare mean intensity in first vs last third.
    const third = Math.floor(beats.length / 3)
    const firstMean = beats.slice(0, third).reduce((s, b) => s + b.intensity, 0) / (third || 1)
    const lastMean = beats.slice(-third).reduce((s, b) => s + b.intensity, 0) / (third || 1)
    const delta = lastMean - firstMean
    const arc: 'rising' | 'falling' | 'flat' = delta > 0.08 ? 'rising' : delta < -0.08 ? 'falling' : 'flat'
    return {
      durationSec: Math.min(maxSec, decoded.duration),
      bpm,
      confidence,
      beats,
      patternSummary: {
        totalBeats: beats.length,
        accentCount,
        averageInterval,
        intensityArc: arc,
      },
    }
  } catch (err) {
    console.warn('[cock-hero] beatmap gen failed:', err)
    return null
  }
}

/**
 * Emit a JOI-style script from a beatmap (so the JOI player can
 * read this back as voiced stroke instructions). Each accent beat
 * becomes a vocal cue; ordinary beats become silent ticks.
 */
export function beatmapToJoiScript(beatmap: CockHeroBeatmap): string {
  const lines: string[] = [
    `# Cock-Hero beatmap (${beatmap.bpm} BPM, ${beatmap.beats.length} beats, ${beatmap.patternSummary.intensityArc})`,
    `[pause:2]`,
    `Match my pace.`,
  ]
  let cursor = 0
  for (const b of beatmap.beats) {
    const gap = b.timeSec - cursor
    if (gap > 0.3) lines.push(`[pause:${gap.toFixed(1)}]`)
    if (b.isAccent) lines.push(b.stroke === 'down' ? 'Stroke down hard.' : 'Stroke up.')
    cursor = b.timeSec
  }
  lines.push(`[pause:2]`, `Hold there.`)
  return lines.join('\n')
}
