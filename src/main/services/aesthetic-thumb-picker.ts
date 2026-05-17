// File: src/main/services/aesthetic-thumb-picker.ts
//
// #135 — Aesthetic-aware thumbnail/poster ranker.
//
// Wires together the existing pieces:
//   1. ffmpeg samples N candidate frames at evenly-spaced timestamps.
//   2. Tier1OnnxTagger.embedImage() pulls the CLIP-image embedding
//      from each frame.
//   3. predictAesthetic() scores each embedding via the LAION
//      aesthetic linear/MLP head.
//   4. Pick the frame with the highest score, re-encode at that
//      timestamp as the canonical thumb.
//
// Skipped gracefully when:
//   - sharp isn't available (no preprocessing path)
//   - CLIP vision session isn't loaded (no embeddings)
//   - aesthetic predictor weights aren't installed (no scoring)
//
// All three are user-installable; the renderer status card (#134
// surfaced this in ExtraDetectorsCard) tells the user what's needed.

import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { app } from 'electron'

export interface AestheticPickResult {
  bestTimestampSec: number
  bestScore: number
  candidates: Array<{ timestampSec: number; score: number }>
  /** Will be set when at least one candidate scored. False otherwise. */
  ok: boolean
}

/**
 * Run the aesthetic ranker over N candidate frames. Returns the
 * best timestamp + score, plus the full candidate list so the
 * caller can show a "why this thumb?" debug view.
 */
export async function pickAestheticThumb(
  videoPath: string,
  ffmpegPath: string,
  durationSec: number,
  options: { sampleCount?: number } = {},
): Promise<AestheticPickResult | null> {
  if (!fs.existsSync(videoPath) || durationSec < 1) return null
  const sampleCount = Math.max(3, Math.min(16, options.sampleCount ?? 8))

  // Lazy-imported so a renderer triggering this pays the load cost
  // exactly once instead of pulling tier1 into the import graph for
  // every code path that imports this file.
  const tier1Mod = await import('./ai-intelligence').catch(() => null)
  const tier1 = tier1Mod?.getTier1Instance?.() ?? null
  const aestheticMod = await import('./ai-intelligence/aesthetic-predictor')
  if (!tier1 || typeof (tier1 as any).embedImage !== 'function') return null
  if (!aestheticMod.isAestheticPredictorAvailable()) return null

  // Sample frames into a tmp dir.
  const tmpDir = path.join(app.getPath('userData'), '.aesthetic-tmp', `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`)
  fs.mkdirSync(tmpDir, { recursive: true })

  const usableStart = durationSec * 0.05
  const usableEnd = durationSec * 0.95
  const usableSpan = usableEnd - usableStart
  const timestamps: number[] = []
  for (let i = 0; i < sampleCount; i++) {
    timestamps.push(usableStart + ((i + 0.5) / sampleCount) * usableSpan)
  }

  try {
    const framePaths: Array<{ t: number; path: string }> = []
    for (let i = 0; i < timestamps.length; i++) {
      const t = timestamps[i]
      const out = path.join(tmpDir, `frame-${i}.jpg`)
      await new Promise<void>((resolve) => {
        const proc = spawn(ffmpegPath, [
          '-y', '-ss', t.toFixed(3), '-i', videoPath,
          '-frames:v', '1', '-q:v', '3',
          out,
        ], { windowsHide: true })
        proc.on('close', () => resolve())
        proc.on('error', () => resolve())
      })
      if (fs.existsSync(out)) framePaths.push({ t, path: out })
    }

    if (framePaths.length === 0) return { ok: false, bestTimestampSec: 0, bestScore: 0, candidates: [] }

    const candidates: Array<{ timestampSec: number; score: number }> = []
    for (const f of framePaths) {
      const emb = await (tier1 as any).embedImage(f.path) as Float32Array | null
      if (!emb) continue
      const score = aestheticMod.predictAesthetic(emb)
      if (typeof score === 'number') candidates.push({ timestampSec: f.t, score })
    }

    if (candidates.length === 0) return { ok: false, bestTimestampSec: 0, bestScore: 0, candidates: [] }

    candidates.sort((a, b) => b.score - a.score)
    return {
      ok: true,
      bestTimestampSec: candidates[0].timestampSec,
      bestScore: candidates[0].score,
      candidates,
    }
  } finally {
    // Cleanup tmp frames; best-effort.
    try {
      for (const f of fs.readdirSync(tmpDir)) {
        try { fs.unlinkSync(path.join(tmpDir, f)) } catch { /* noop */ }
      }
      fs.rmdirSync(tmpDir)
    } catch { /* noop */ }
  }
}

/**
 * One-shot: pick the best frame AND re-encode it as the media's
 * canonical thumb. Returns the new thumb path on success.
 */
export async function regenerateAestheticThumb(
  videoPath: string,
  ffmpegPath: string,
  mediaId: string,
  mtimeMs: number,
  durationSec: number,
): Promise<{ ok: boolean; thumbPath?: string; pick?: AestheticPickResult; error?: string }> {
  const pick = await pickAestheticThumb(videoPath, ffmpegPath, durationSec)
  if (!pick || !pick.ok) {
    return { ok: false, pick: pick ?? undefined, error: 'No aesthetic candidates produced — install CLIP + aesthetic weights' }
  }
  const thumbsRoot = path.join(app.getPath('userData'), 'thumbs')
  if (!fs.existsSync(thumbsRoot)) fs.mkdirSync(thumbsRoot, { recursive: true })
  const outName = `${mediaId}-${mtimeMs}-aesthetic.jpg`
  const outPath = path.join(thumbsRoot, outName)
  const ok = await new Promise<boolean>((resolve) => {
    const proc = spawn(ffmpegPath, [
      '-y', '-ss', pick.bestTimestampSec.toFixed(3), '-i', videoPath,
      '-frames:v', '1', '-vf', 'scale=480:-2', '-q:v', '3',
      outPath,
    ], { windowsHide: true })
    proc.on('close', (code) => resolve(code === 0 && fs.existsSync(outPath)))
    proc.on('error', () => resolve(false))
  })
  if (!ok) return { ok: false, pick, error: 'FFmpeg failed at chosen timestamp' }
  return { ok: true, thumbPath: outPath, pick }
}
