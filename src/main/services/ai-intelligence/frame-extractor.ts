// ===============================
// Frame Extractor - Extract keyframes from videos using FFmpeg
// ===============================

import { spawn } from 'child_process'
import path from 'path'
import fs from 'fs'
import os from 'os'
import { nanoid } from 'nanoid'
import { ffmpegHwAccelArgs } from '../../ffpaths'

export interface ExtractedFrame {
  path: string
  timestamp: number
}

export class FrameExtractor {
  private ffmpegPath: string
  private tempDir: string

  constructor(ffmpegPath: string) {
    this.ffmpegPath = ffmpegPath
    this.tempDir = path.join(os.tmpdir(), 'vault-ai-frames')

    // Ensure temp directory exists
    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true })
    }
  }

  /** Path to the ffmpeg binary this extractor was constructed with.
   *  Exposed so other services (audio analyzer, OCR pre-process) can
   *  reuse the same binary instead of resolving it again. */
  getFfmpegPath(): string {
    return this.ffmpegPath
  }

  /**
   * Extract frames from a media file
   * - Images: return the file directly
   * - GIFs: extract 1-2 frames
   * - Videos: extract keyframes based on duration
   */
  async extractFrames(
    mediaPath: string,
    mediaType: 'video' | 'image' | 'gif',
    durationSec?: number | null
  ): Promise<ExtractedFrame[]> {
    const mediaId = nanoid(8)
    const outputDir = path.join(this.tempDir, mediaId)

    // Create output directory
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true })
    }

    try {
      if (mediaType === 'image') {
        // For images, just return the original file
        return [{ path: mediaPath, timestamp: 0 }]
      }

      if (mediaType === 'gif') {
        // Extract 1-2 frames from GIF
        return this.extractGifFrames(mediaPath, outputDir)
      }

      // Video: extract keyframes based on duration
      return this.extractVideoFrames(mediaPath, outputDir, durationSec)
    } catch (error) {
      console.error('[FrameExtractor] Error extracting frames:', error)
      throw error
    }
  }

  private async extractGifFrames(gifPath: string, outputDir: string): Promise<ExtractedFrame[]> {
    const frames: ExtractedFrame[] = []

    // Extract first frame
    const frame1Path = path.join(outputDir, 'frame_0.jpg')
    await this.runFFmpeg([
      '-i', gifPath,
      '-vf', 'select=eq(n\\,0)',
      '-vframes', '1',
      '-q:v', '2',
      frame1Path
    ])

    if (fs.existsSync(frame1Path)) {
      frames.push({ path: frame1Path, timestamp: 0 })
    }

    // Try to extract a middle frame
    const frame2Path = path.join(outputDir, 'frame_1.jpg')
    await this.runFFmpeg([
      '-i', gifPath,
      '-vf', 'select=eq(n\\,5)',
      '-vframes', '1',
      '-q:v', '2',
      frame2Path
    ])

    if (fs.existsSync(frame2Path)) {
      frames.push({ path: frame2Path, timestamp: 0.5 })
    }

    return frames
  }

  /**
   * Pick the intro/outro skip percentages based on video length. Longer
   * videos get more aggressive skips because their intros/outros tend to
   * be longer (production logos, setup conversation, post-cumshot wind-down).
   */
  private computeUsableWindow(duration: number): { startSec: number; endSec: number } {
    let introPct: number, outroPct: number
    if (duration < 30) {
      introPct = 0.05; outroPct = 0.05
    } else if (duration < 120) {
      introPct = 0.10; outroPct = 0.10
    } else if (duration < 600) {
      introPct = 0.15; outroPct = 0.12
    } else {
      introPct = 0.20; outroPct = 0.15
    }
    return {
      startSec: duration * introPct,
      endSec: duration * (1 - outroPct),
    }
  }

  /**
   * #263 — TransNet V2 path. Extracts 27×48 frames at 12fps from
   * [startSec, endSec], feeds them through the TransNet model, and
   * maps boundary frame indices back to absolute timestamps.
   * Returns [] if the model isn't ready (caller falls back to scdet).
   */
  private async detectScenesViaTransNet(
    videoPath: string,
    startSec: number,
    endSec: number,
  ): Promise<number[]> {
    const FPS = 12
    const { ModelDownloader } = await import('./model-downloader')
    const { TransNetDetector } = await import('./transnet-detector')
    const downloader = new ModelDownloader()
    const detector = new TransNetDetector(downloader as any)
    const ok = await detector.initialize()
    if (!ok) return []
    // Stream low-res frames to a tmp dir for TransNet input.
    const dir = path.join(this.tempDir, `transnet-${nanoid(8)}`)
    fs.mkdirSync(dir, { recursive: true })
    try {
      await new Promise<void>((resolve, reject) => {
        const proc = spawn(this.ffmpegPath, [
          '-hide_banner', '-loglevel', 'error',
          '-ss', startSec.toFixed(2), '-to', endSec.toFixed(2),
          '-i', videoPath,
          '-vf', `fps=${FPS},scale=48:27`,
          '-an',
          path.join(dir, 'f_%06d.png'),
        ], { windowsHide: true })
        proc.on('error', reject)
        proc.on('close', (code) => code === 0 ? resolve() : reject(new Error(`ffmpeg exit ${code}`)))
      })
      const framePaths = fs.readdirSync(dir).filter((n) => n.endsWith('.png')).sort().map((n) => path.join(dir, n))
      if (framePaths.length === 0) return []
      const boundaries = await detector.detectBoundaries(framePaths, 0.5)
      return boundaries.map((b) => startSec + b.frameIndex / FPS).sort((a, b) => a - b)
    } finally {
      try { fs.rmSync(dir, { recursive: true, force: true }) } catch { /* ignore */ }
    }
  }

  /**
   * Detect scene-change timestamps via ffmpeg's `scdet` filter, restricted
   * to the [startSec, endSec] window. Returns an ascending list of
   * timestamps where significant motion / cuts happen — used to bias frame
   * selection toward action peaks on longer videos.
   *
   * Cheap-ish: ffmpeg streams the video once with no output (-f null) so
   * we only pay decode cost. For an hour-long 1080p video this is roughly
   * 30-60s of CPU on a modern box.
   */
  private async detectSceneChanges(
    videoPath: string,
    startSec: number,
    endSec: number,
    threshold = 12.0  // scdet threshold; higher = fewer (only big) cuts
  ): Promise<number[]> {
    return new Promise((resolve) => {
      const proc = spawn(this.ffmpegPath, [
        '-hide_banner',
        '-ss', startSec.toFixed(2),
        '-to', endSec.toFixed(2),
        '-i', videoPath,
        '-vf', `scdet=threshold=${threshold}`,
        '-an',
        '-f', 'null',
        '-'
      ], { windowsHide: true })
      let stderr = ''
      proc.stderr?.on('data', (d) => { stderr += d.toString() })
      proc.on('error', () => resolve([]))
      proc.on('close', () => {
        // scdet emits lines like:  [scdet @ 0x...] lavfi.scd.score: 23.45 lavfi.scd.time: 142.583
        const re = /lavfi\.scd\.time:\s*([\d.]+)/g
        const out: number[] = []
        let m: RegExpExecArray | null
        while ((m = re.exec(stderr)) !== null) {
          const t = parseFloat(m[1])
          if (!isNaN(t)) out.push(startSec + t)
        }
        out.sort((a, b) => a - b)
        resolve(out)
      })
    })
  }

  /**
   * Pick 12 timestamps for sampling. If we have N>=12 scene-change peaks,
   * we spread the picks across them (every floor(N/12)th). If 0<N<12 we
   * mix scene peaks with even-spacing fillers to reach 12. With 0 peaks
   * (short video, scene detection skipped) we just space evenly inside
   * the usable window.
   *
   * Always enforces a minimum gap between picks so we don't cluster two
   * frames within a single shot.
   */
  private pickFrameTimestamps(
    startSec: number,
    endSec: number,
    sceneTimes: number[],
    target: number
  ): number[] {
    const span = endSec - startSec
    if (span <= 0 || target <= 0) return []
    const minGap = Math.max(0.5, span / (target * 3))  // never closer than 1/3 of even spacing

    const evenly = (n: number): number[] => {
      const out: number[] = []
      if (n === 1) return [startSec + span / 2]
      for (let i = 0; i < n; i++) {
        out.push(startSec + (span * i) / (n - 1))
      }
      return out
    }

    if (sceneTimes.length === 0) {
      return evenly(target)
    }

    // Filter scene times to the usable window + dedupe by minGap.
    const inWindow = sceneTimes.filter(t => t >= startSec && t <= endSec)
    const deduped: number[] = []
    for (const t of inWindow) {
      if (deduped.length === 0 || t - deduped[deduped.length - 1] >= minGap) {
        deduped.push(t)
      }
    }

    if (deduped.length >= target) {
      // Spread picks across the deduped peaks
      const out: number[] = []
      for (let i = 0; i < target; i++) {
        const idx = Math.floor((deduped.length - 1) * (i / (target - 1)))
        out.push(deduped[idx])
      }
      return out
    }

    // Mix mode: use all peaks, fill remaining slots with even-spacing across
    // the gaps between them.
    const out = [...deduped]
    const remaining = target - deduped.length
    const fillers = evenly(remaining + 2).slice(1, -1)  // drop endpoints to avoid duplicating boundary peaks
    for (const t of fillers) {
      // Skip if too close to an existing pick
      if (out.every(x => Math.abs(x - t) >= minGap)) {
        out.push(t)
      }
    }
    out.sort((a, b) => a - b)
    return out.slice(0, target)
  }

  private async extractVideoFrames(
    videoPath: string,
    outputDir: string,
    durationSec?: number | null
  ): Promise<ExtractedFrame[]> {
    const duration = durationSec || 60 // Default to 60s if unknown
    const TARGET_FRAMES = 12

    // Dynamic intro/outro skip scaled by video length.
    const { startSec, endSec } = this.computeUsableWindow(duration)

    // For videos longer than 3 minutes, run scene-change detection to bias
    // sampling toward action peaks. Below that, even-spacing inside the
    // usable window is just as good and avoids the scene-detect latency.
    let sceneTimes: number[] = []
    if (duration > 180) {
      // #263 — TransNet V2 opt-in path. When settings.ai.useTransNet is
      // true AND the model file exists, use the 3D-CNN for higher
      // precision on gradual fades / slow zooms. Falls through to
      // ffmpeg scdet on any failure so this never regresses the
      // baseline detection.
      // Default: use TransNet when the model file is present. Falls
      // through to ffmpeg scdet when the model is missing OR when the
      // user explicitly disabled it via settings.ai.useTransNet=false.
      // (Task #244 — TransNet was already implemented behind an opt-in;
      // flipping the default to "use it if available" so the user
      // doesn't have to know about the setting.)
      let useTransNet = false
      try {
        const { getAISettings } = await import('../../settings')
        const aiSettings = getAISettings() as any
        if (typeof aiSettings?.useTransNet === 'boolean') {
          useTransNet = aiSettings.useTransNet
        } else {
          const { app } = await import('electron')
          const path = await import('node:path')
          const fs = await import('node:fs')
          const modelPath = path.join(app.getPath('userData'), 'models', 'transnet-v2.onnx')
          useTransNet = fs.existsSync(modelPath)
        }
      } catch { /* ignore */ }
      if (useTransNet) {
        try {
          sceneTimes = await this.detectScenesViaTransNet(videoPath, startSec, endSec)
          console.log(`[FrameExtractor] TransNet found ${sceneTimes.length} scene changes in [${startSec.toFixed(0)}, ${endSec.toFixed(0)}]`)
        } catch (err) {
          console.warn('[FrameExtractor] TransNet failed, falling back to scdet:', err)
        }
      }
      if (sceneTimes.length === 0) {
        try {
          sceneTimes = await this.detectSceneChanges(videoPath, startSec, endSec)
          console.log(`[FrameExtractor] Found ${sceneTimes.length} scene changes in [${startSec.toFixed(0)}, ${endSec.toFixed(0)}]`)
        } catch (err) {
          console.warn('[FrameExtractor] Scene detection failed, falling back to even sampling:', err)
        }
      }
    }

    const timestamps = this.pickFrameTimestamps(startSec, endSec, sceneTimes, TARGET_FRAMES)
    console.log(`[FrameExtractor] Sampling ${timestamps.length} frames at: ${timestamps.map(t => t.toFixed(1) + 's').join(', ')}`)

    // Parallel extraction: ffmpeg processes are CPU/IO-bound. Spawning
    // them in serial wastes ~3-4× the wall-time on multi-core boxes.
    // Concurrency=4 leaves headroom for the rest of the AI pipeline
    // (Tier 1 ONNX, sharp pHash, etc.) without saturating ffmpeg subprocess
    // count. Skip-nokey makes ffmpeg accept the nearest keyframe instead
    // of decoding to the exact PTS — perfectly fine for AI tagging where
    // frame-accurate seeking buys us nothing.
    const FRAME_EXTRACT_CONCURRENCY = 4
    // Detect HW accel once per extractFrames call (cached internally).
    // CUDA path keeps decoded frames on-GPU through scale — 2× speedup
    // on 1080p, ~10× on 4K vs CPU. scale_cuda replaces CPU scale when
    // CUDA is the output format. Falls back cleanly to CPU when no
    // accel is available.
    const hwArgs = await ffmpegHwAccelArgs()
    const usesCuda = hwArgs.includes('cuda') && hwArgs.includes('-hwaccel_output_format')
    const scaleFilter = usesCuda
      ? 'scale_cuda=min(1280\\,iw):-1,hwdownload,format=nv12'
      : 'scale=min(1280\\,iw):-1'
    const extractOne = async (i: number, timestamp: number): Promise<ExtractedFrame | null> => {
      const framePath = path.join(outputDir, `frame_${i}.jpg`)
      try {
        await this.runFFmpeg([
          ...hwArgs,
          '-skip_frame', 'nokey',
          '-ss', timestamp.toFixed(2),
          '-i', videoPath,
          '-vframes', '1',
          '-q:v', '2',
          '-vf', scaleFilter,
          framePath
        ])
        // Brief settle for Windows fs visibility.
        await new Promise(resolve => setTimeout(resolve, 30))
        if (fs.existsSync(framePath)) {
          const stats = fs.statSync(framePath)
          if (stats.size > 1024) return { path: framePath, timestamp }
          console.warn(`[FrameExtractor] Frame ${i} too small: ${stats.size} bytes`)
        }
      } catch (err) {
        console.warn(`[FrameExtractor] Failed to extract frame at ${timestamp}s:`, err)
      }
      return null
    }

    // Concurrency-limited Promise.all. Each "slot" picks the next
    // pending index until exhausted; preserves output order.
    const frames: ExtractedFrame[] = []
    const results: Array<ExtractedFrame | null> = new Array(timestamps.length).fill(null)
    let nextIdx = 0
    await Promise.all(
      Array.from({ length: Math.min(FRAME_EXTRACT_CONCURRENCY, timestamps.length) }, async () => {
        while (true) {
          const idx = nextIdx++
          if (idx >= timestamps.length) return
          results[idx] = await extractOne(idx, timestamps[idx])
        }
      })
    )
    for (const r of results) {
      if (r) frames.push(r)
    }

    console.log(`[FrameExtractor] Extracted ${frames.length}/${timestamps.length} frames for ${path.basename(videoPath)} (${duration.toFixed(0)}s)`)

    // Perceptual dedup pass. Two extracted frames sometimes land inside the
    // same shot (scene detection isn't perfect, especially with slow zooms
    // or static shots). Identical frames inflate the multi-frame consensus
    // and waste Venice API calls — drop near-duplicates.
    return await this.dedupeNearIdenticalFrames(frames)
  }

  /**
   * Compute a 64-bit average-hash (aHash) of an image: shrink to 8×8
   * grayscale, average the pixel values, emit one bit per pixel
   * (1 if pixel > average, else 0). Two frames within ≤5 bits Hamming
   * distance are treated as the same shot. Cheap (~3-5ms per frame on
   * a modern box via sharp) and good enough for "same shot or not".
   */
  private async computeAHash(framePath: string): Promise<bigint | null> {
    try {
      // Lazy load — sharp is heavy and not used everywhere in the extractor.
      const sharp = require('sharp')
      const buf = await sharp(framePath)
        .resize(8, 8, { fit: 'fill' })
        .grayscale()
        .raw()
        .toBuffer()
      if (buf.length !== 64) return null
      let sum = 0
      for (let i = 0; i < 64; i++) sum += buf[i]
      const avg = sum / 64
      let hash = 0n
      for (let i = 0; i < 64; i++) {
        if (buf[i] > avg) hash |= 1n << BigInt(i)
      }
      return hash
    } catch (err) {
      console.warn(`[FrameExtractor] aHash failed for ${path.basename(framePath)}:`, err)
      return null
    }
  }

  private hamming(a: bigint, b: bigint): number {
    let x = a ^ b
    let count = 0
    while (x !== 0n) {
      x &= x - 1n
      count++
    }
    return count
  }

  /**
   * Drop frames whose aHash is within DEDUP_THRESHOLD bits of an earlier
   * kept frame. Preserves ordering. Falls back gracefully — if hashing
   * fails the frame is kept (better to over-send to Venice than to drop
   * a unique frame on a hashing hiccup).
   */
  private async dedupeNearIdenticalFrames(frames: ExtractedFrame[]): Promise<ExtractedFrame[]> {
    if (frames.length <= 1) return frames
    // 5 of 64 bits ≈ 92% similarity — empirically catches static shots
    // and slow camera moves without collapsing distinct scenes that
    // happen to share a dominant color/lighting.
    const DEDUP_THRESHOLD = 5
    const hashes: Array<bigint | null> = []
    for (const f of frames) {
      hashes.push(await this.computeAHash(f.path))
    }

    const kept: ExtractedFrame[] = []
    const keptHashes: bigint[] = []
    for (let i = 0; i < frames.length; i++) {
      const h = hashes[i]
      if (h === null) {
        // Couldn't hash — keep it rather than risk dropping unique content.
        kept.push(frames[i])
        continue
      }
      const duplicate = keptHashes.some((kh) => this.hamming(h, kh) <= DEDUP_THRESHOLD)
      if (!duplicate) {
        kept.push(frames[i])
        keptHashes.push(h)
      }
    }

    if (kept.length < frames.length) {
      console.log(`[FrameExtractor] Deduped ${frames.length} → ${kept.length} frames (dropped ${frames.length - kept.length} near-duplicates)`)
    }
    return kept
  }

  private runFFmpeg(args: string[]): Promise<void> {
    return new Promise((resolve, reject) => {
      const proc = spawn(this.ffmpegPath, ['-y', ...args], {
        windowsHide: true
      })

      let stderr = ''
      proc.stderr?.on('data', (data) => {
        stderr += data.toString()
      })

      proc.on('error', reject)
      proc.on('close', (code) => {
        if (code === 0) {
          resolve()
        } else {
          reject(new Error(`FFmpeg exited with code ${code}: ${stderr.slice(-500)}`))
        }
      })
    })
  }

  /**
   * Clean up extracted frames for a media item
   */
  cleanup(mediaId: string): void {
    const dir = path.join(this.tempDir, mediaId)
    this.safeRemoveDir(dir)
  }

  /**
   * Clean up a specific frame directory (used by the processing queue to nuke
   * just THIS item's frames after analysis finishes — without touching the
   * frames of any other item that's currently being processed).
   *
   * Safety: refuses to delete anything outside this.tempDir to prevent the
   * caller from accidentally wiping unrelated paths.
   */
  cleanupDir(absDir: string): void {
    if (!absDir) return
    const resolved = path.resolve(absDir)
    const tempResolved = path.resolve(this.tempDir)
    if (!resolved.startsWith(tempResolved) || resolved === tempResolved) return
    this.safeRemoveDir(resolved)
  }

  /**
   * Clean up all temp frames
   */
  cleanupAll(): void {
    this.safeRemoveDir(this.tempDir)
    // Recreate the temp dir
    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true })
    }
  }

  /**
   * Safely remove directory with retry logic for Windows file locking
   */
  private safeRemoveDir(dir: string): void {
    if (!fs.existsSync(dir)) return

    // Try up to 3 times with increasing delays
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        fs.rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 })
        return
      } catch (err: any) {
        if (attempt < 2 && (err.code === 'EPERM' || err.code === 'EBUSY')) {
          // Wait before retry (100ms, 200ms)
          const delay = (attempt + 1) * 100
          const start = Date.now()
          while (Date.now() - start < delay) {
            // Busy wait
          }
        } else if (attempt === 2) {
          // Final attempt failed, log but don't throw
          console.warn(`[FrameExtractor] Failed to clean up ${dir}:`, err.message)
        }
      }
    }
  }

  /**
   * Validate that a frame file is usable (not empty/corrupt)
   */
  validateFrame(framePath: string): boolean {
    try {
      if (!fs.existsSync(framePath)) return false
      const stats = fs.statSync(framePath)
      // Frame should be at least 1KB (valid JPEG)
      return stats.size > 1024
    } catch {
      return false
    }
  }
}
