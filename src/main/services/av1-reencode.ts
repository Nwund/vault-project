// File: src/main/services/av1-reencode.ts
//
// AV1 archival re-encode batch operation. Iterates a media filter
// set, transcodes each video to AV1 (SVT-AV1 on CPU or NVENC AV1 on
// RTX 40-series+), and replaces the source file in-place. Typical
// savings vs H.264: 50-60%. vs HEVC: 30-40%.
//
// Settings the user can configure:
//   - target CRF (default 30; SVT-AV1 sweet spot for archival)
//   - preset (default 8; balances quality and speed)
//   - prefer GPU when available
//   - keep original (writes alongside, doesn't replace)
//
// Per-file flow:
//   1. Compute source size + duration
//   2. Run ffmpeg with libsvtav1 (or h264_nvenc/hevc_nvenc/av1_nvenc) into a temp .mp4
//   3. On success: compare sizes. If output ≥ source × 0.9, skip
//      replacement (transcoded version not meaningfully smaller — saves
//      churn on already-efficient sources).
//   4. Replace source (or keep-aside, depending on settings).
//   5. Update media row: new size, new mtime.

import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import type { DB } from '../db'

export interface ReencodeOptions {
  crf?: number          // SVT-AV1 quality 0-63 (default 30)
  preset?: number       // SVT-AV1 preset 0-13 (default 8)
  preferGpu?: boolean   // try av1_nvenc first (default true)
  keepOriginal?: boolean // false: replace; true: write .av1.mp4 alongside
  minSavingsRatio?: number  // skip replace if output >= source × this (default 0.9)
  maxDurationSec?: number   // skip files longer than N seconds (default no cap)
}

export interface ReencodeResult {
  mediaId: string
  fromPath: string
  toPath: string
  fromBytes: number
  toBytes: number
  savedBytes: number
  savedPct: number
  durationMs: number
  status: 'ok' | 'skipped-small-savings' | 'skipped-not-video' | 'skipped-missing' | 'failed'
  error?: string
}

export interface BatchReencodeProgress {
  processed: number
  total: number
  currentFile: string
  cumulativeSavedBytes: number
}

/**
 * Re-encode one video to AV1 with the configured CRF/preset. Returns
 * a ReencodeResult describing what happened.
 */
export async function reencodeOne(
  ffmpegPath: string,
  mediaPath: string,
  mediaId: string,
  options: ReencodeOptions = {}
): Promise<ReencodeResult> {
  const start = Date.now()
  const empty = (status: ReencodeResult['status'], error?: string): ReencodeResult => ({
    mediaId,
    fromPath: mediaPath,
    toPath: mediaPath,
    fromBytes: 0,
    toBytes: 0,
    savedBytes: 0,
    savedPct: 0,
    durationMs: Date.now() - start,
    status,
    error,
  })

  if (!fs.existsSync(mediaPath)) return empty('skipped-missing')

  const fromBytes = (() => { try { return fs.statSync(mediaPath).size } catch { return 0 } })()
  if (fromBytes <= 0) return empty('skipped-missing')

  const crf = options.crf ?? 30
  const preset = options.preset ?? 8
  const preferGpu = options.preferGpu !== false
  const minSavings = options.minSavingsRatio ?? 0.9
  const keepOriginal = options.keepOriginal === true

  // Build the output path. We always write to a temp file first so a
  // crash mid-encode doesn't corrupt the source.
  const ext = '.mp4'  // AV1 in MP4 container — most universal
  const dir = path.dirname(mediaPath)
  const base = path.basename(mediaPath, path.extname(mediaPath))
  const tmpPath = path.join(dir, `${base}.av1.tmp${ext}`)
  const finalPath = keepOriginal
    ? path.join(dir, `${base}.av1${ext}`)
    : path.join(dir, `${base}${ext}`)  // replace, even if ext changed

  // Pick encoder. Try GPU first if requested; fall back to SVT-AV1 CPU.
  // detectHwAccelCaps is from ffpaths — async, called once.
  let encoderArgs: string[]
  let encoderName: string
  if (preferGpu) {
    try {
      const { detectHwAccelCaps } = await import('../ffpaths')
      const caps = await detectHwAccelCaps()
      // av1_nvenc only on RTX 40+, but the encoder list reports it
      // regardless. Try it; fall back if ffmpeg complains.
      if (caps.cudaEncode) {
        encoderName = 'av1_nvenc'
        encoderArgs = ['-c:v', 'av1_nvenc', '-cq', String(crf), '-preset', 'p5', '-tune', 'hq']
      } else if (caps.qsvEncode) {
        encoderName = 'av1_qsv'
        encoderArgs = ['-c:v', 'av1_qsv', '-global_quality', String(crf), '-preset', 'medium']
      } else {
        encoderName = 'libsvtav1'
        encoderArgs = ['-c:v', 'libsvtav1', '-crf', String(crf), '-preset', String(preset), '-svtav1-params', 'tune=0']
      }
    } catch {
      encoderName = 'libsvtav1'
      encoderArgs = ['-c:v', 'libsvtav1', '-crf', String(crf), '-preset', String(preset)]
    }
  } else {
    encoderName = 'libsvtav1'
    encoderArgs = ['-c:v', 'libsvtav1', '-crf', String(crf), '-preset', String(preset)]
  }

  console.log(`[AV1 Re-encode] ${path.basename(mediaPath)} via ${encoderName} crf=${crf}`)

  const encodeOk = await new Promise<boolean>((resolve) => {
    try {
      const proc = spawn(ffmpegPath, [
        '-y', '-hide_banner', '-loglevel', 'error',
        '-i', mediaPath,
        ...encoderArgs,
        // Preserve audio with re-mux (don't re-encode unless container
        // demands it). Opus is universally accepted in MP4; copy
        // works for AAC/Opus already in the source.
        '-c:a', 'copy',
        // -movflags +faststart so the output streams from byte 0 even
        // for partial-download playback.
        '-movflags', '+faststart',
        tmpPath,
      ], { windowsHide: true })
      proc.on('error', () => resolve(false))
      proc.on('close', (code) => resolve(code === 0 && fs.existsSync(tmpPath)))
    } catch { resolve(false) }
  })

  if (!encodeOk) {
    try { fs.unlinkSync(tmpPath) } catch { /* ignore */ }
    return empty('failed', `ffmpeg encode failed via ${encoderName}`)
  }

  const toBytes = (() => { try { return fs.statSync(tmpPath).size } catch { return 0 } })()
  const savedBytes = fromBytes - toBytes
  const savedPct = fromBytes > 0 ? savedBytes / fromBytes : 0

  // Skip replace when savings are marginal (e.g. source already AV1).
  if (toBytes >= fromBytes * minSavings) {
    try { fs.unlinkSync(tmpPath) } catch { /* ignore */ }
    return {
      mediaId,
      fromPath: mediaPath,
      toPath: mediaPath,
      fromBytes,
      toBytes,
      savedBytes,
      savedPct,
      durationMs: Date.now() - start,
      status: 'skipped-small-savings',
    }
  }

  // Move tmp → final. If keepOriginal, source stays put. Otherwise
  // remove the source first so the rename succeeds even when the
  // tmp filename collides (after the .av1.tmp → .mp4 swap).
  try {
    if (!keepOriginal && fs.existsSync(mediaPath) && mediaPath !== finalPath) {
      fs.unlinkSync(mediaPath)
    }
    fs.renameSync(tmpPath, finalPath)
  } catch (err: any) {
    return empty('failed', `replace failed: ${err?.message ?? String(err)}`)
  }

  return {
    mediaId,
    fromPath: mediaPath,
    toPath: finalPath,
    fromBytes,
    toBytes,
    savedBytes,
    savedPct,
    durationMs: Date.now() - start,
    status: 'ok',
  }
}

/**
 * Batch re-encode a set of media IDs. Calls onProgress between files
 * so the UI can show "N of M, saved X MB so far". Stops on `abort`.
 */
export async function batchReencode(
  db: DB,
  ffmpegPath: string,
  mediaIds: string[],
  options: ReencodeOptions = {},
  onProgress?: (p: BatchReencodeProgress) => void,
  abortSignal?: { aborted: boolean }
): Promise<{ results: ReencodeResult[]; totalSavedBytes: number; aborted: boolean }> {
  const results: ReencodeResult[] = []
  let cumulativeSavedBytes = 0

  for (let i = 0; i < mediaIds.length; i++) {
    if (abortSignal?.aborted) {
      return { results, totalSavedBytes: cumulativeSavedBytes, aborted: true }
    }
    const id = mediaIds[i]
    let media: any
    try { media = (db as any).getMedia?.(id) } catch { /* ignore */ }
    if (!media?.path || media.type !== 'video') {
      results.push({
        mediaId: id,
        fromPath: media?.path ?? '',
        toPath: media?.path ?? '',
        fromBytes: 0, toBytes: 0, savedBytes: 0, savedPct: 0,
        durationMs: 0,
        status: 'skipped-not-video',
      })
      continue
    }
    if (options.maxDurationSec && media.durationSec && media.durationSec > options.maxDurationSec) {
      results.push({
        mediaId: id, fromPath: media.path, toPath: media.path,
        fromBytes: media.size ?? 0, toBytes: media.size ?? 0,
        savedBytes: 0, savedPct: 0, durationMs: 0,
        status: 'skipped-small-savings',
        error: `duration ${media.durationSec}s > cap ${options.maxDurationSec}s`,
      })
      continue
    }

    const result = await reencodeOne(ffmpegPath, media.path, id, options)
    results.push(result)
    if (result.status === 'ok') {
      cumulativeSavedBytes += result.savedBytes
      // Update media row to reflect new path/size/mtime.
      try {
        const stat = fs.statSync(result.toPath)
        ;(db as any).raw?.prepare?.(`
          UPDATE media SET path = ?, filename = ?, size = ?, mtimeMs = ?, ext = ?
          WHERE id = ?
        `).run(
          result.toPath,
          path.basename(result.toPath),
          stat.size,
          stat.mtimeMs,
          path.extname(result.toPath),
          id,
        )
      } catch (err) {
        console.warn('[AV1 Re-encode] media row update failed:', err)
      }
    }

    onProgress?.({
      processed: i + 1,
      total: mediaIds.length,
      currentFile: path.basename(media.path),
      cumulativeSavedBytes,
    })
  }

  return { results, totalSavedBytes: cumulativeSavedBytes, aborted: false }
}
