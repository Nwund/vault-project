// ===============================
// Frame Extractor - Extract keyframes from videos using FFmpeg
// ===============================

import { spawn } from 'child_process'
import path from 'path'
import fs from 'fs'
import os from 'os'
import { nanoid } from 'nanoid'

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

  private async extractVideoFrames(
    videoPath: string,
    outputDir: string,
    durationSec?: number | null
  ): Promise<ExtractedFrame[]> {
    const duration = durationSec || 60 // Default to 60s if unknown

    // Determine number of frames based on duration
    let frameCount: number
    if (duration <= 10) {
      frameCount = 2
    } else if (duration <= 60) {
      frameCount = 4
    } else if (duration <= 300) { // 5 min
      frameCount = 6
    } else if (duration <= 900) { // 15 min
      frameCount = 8
    } else {
      frameCount = 10
    }

    // Skip first/last 5% of video
    const startPercent = 0.05
    const endPercent = 0.95
    const usableDuration = duration * (endPercent - startPercent)
    const startTime = duration * startPercent

    const frames: ExtractedFrame[] = []

    for (let i = 0; i < frameCount; i++) {
      const timestamp = startTime + (usableDuration * i) / (frameCount - 1 || 1)
      const framePath = path.join(outputDir, `frame_${i}.jpg`)

      try {
        await this.runFFmpeg([
          '-ss', timestamp.toFixed(2),
          '-i', videoPath,
          '-vframes', '1',
          '-q:v', '2',
          '-vf', 'scale=min(1280\\,iw):-1',
          framePath
        ])

        // Wait a moment for file to be fully written (Windows file system)
        await new Promise(resolve => setTimeout(resolve, 50))

        if (fs.existsSync(framePath)) {
          const stats = fs.statSync(framePath)
          if (stats.size > 1024) {
            frames.push({ path: framePath, timestamp })
            console.log(`[FrameExtractor] Extracted frame ${i}: ${stats.size} bytes`)
          } else {
            console.warn(`[FrameExtractor] Frame ${i} too small: ${stats.size} bytes`)
          }
        }
      } catch (err) {
        console.warn(`[FrameExtractor] Failed to extract frame at ${timestamp}s:`, err)
      }
    }

    return frames
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
