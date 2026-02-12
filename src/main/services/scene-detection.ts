// File: src/main/services/scene-detection.ts
// Detect scene changes and generate chapters for videos

import { spawn } from 'child_process'
import type { DB } from '../db'
import fs from 'fs'
import path from 'path'

export interface Scene {
  index: number
  startTime: number
  endTime: number
  duration: number
  startTimecode: string
  endTimecode: string
  thumbnailPath?: string
  confidence?: number
}

export interface Chapter {
  index: number
  title: string
  startTime: number
  endTime: number
  thumbnailPath?: string
}

export interface SceneDetectionResult {
  mediaId: string
  scenes: Scene[]
  totalScenes: number
  avgSceneDuration: number
  shortestScene: number
  longestScene: number
  detectionTime: number
}

export interface SceneDetectionOptions {
  threshold?: number       // Scene change threshold (0.0-1.0, default 0.3)
  minSceneLength?: number  // Minimum scene length in seconds (default 2)
  generateThumbnails?: boolean
  thumbnailDir?: string
  maxScenes?: number      // Cap number of scenes detected
}

export class SceneDetectionService {
  private ffmpegPath: string = 'ffmpeg'
  private ffprobePath: string = 'ffprobe'
  private detecting: Set<string> = new Set()

  constructor(private db: DB) {}

  /**
   * Set custom ffmpeg/ffprobe paths
   */
  setPaths(ffmpeg: string, ffprobe: string): void {
    this.ffmpegPath = ffmpeg
    this.ffprobePath = ffprobe
  }

  /**
   * Detect scenes in a video file
   */
  async detectScenes(filePath: string, options?: SceneDetectionOptions): Promise<SceneDetectionResult | null> {
    if (!fs.existsSync(filePath)) {
      return null
    }

    const threshold = options?.threshold ?? 0.3
    const minSceneLength = options?.minSceneLength ?? 2
    const maxScenes = options?.maxScenes ?? 100

    const startTime = Date.now()

    // Get video duration first
    const duration = await this.getVideoDuration(filePath)
    if (!duration) return null

    try {
      // Use ffmpeg scene detection
      const sceneChanges = await this.runSceneDetection(filePath, threshold)

      // Convert scene changes to scenes
      const scenes: Scene[] = []
      let sceneStart = 0

      for (let i = 0; i < sceneChanges.length && scenes.length < maxScenes; i++) {
        const changeTime = sceneChanges[i]

        // Skip if scene is too short
        if (changeTime - sceneStart < minSceneLength && i > 0) {
          continue
        }

        if (sceneStart > 0 || i > 0) {
          scenes.push({
            index: scenes.length,
            startTime: sceneStart,
            endTime: changeTime,
            duration: changeTime - sceneStart,
            startTimecode: this.formatTimecode(sceneStart),
            endTimecode: this.formatTimecode(changeTime)
          })
        }

        sceneStart = changeTime
      }

      // Add final scene
      if (sceneStart < duration - minSceneLength) {
        scenes.push({
          index: scenes.length,
          startTime: sceneStart,
          endTime: duration,
          duration: duration - sceneStart,
          startTimecode: this.formatTimecode(sceneStart),
          endTimecode: this.formatTimecode(duration)
        })
      }

      // Generate thumbnails if requested
      if (options?.generateThumbnails && options.thumbnailDir) {
        await this.generateSceneThumbnails(filePath, scenes, options.thumbnailDir)
      }

      // Calculate stats
      const durations = scenes.map(s => s.duration)
      const avgDuration = durations.reduce((a, b) => a + b, 0) / scenes.length || 0

      return {
        mediaId: '', // Will be set by caller
        scenes,
        totalScenes: scenes.length,
        avgSceneDuration: avgDuration,
        shortestScene: Math.min(...durations),
        longestScene: Math.max(...durations),
        detectionTime: Date.now() - startTime
      }
    } catch (e: any) {
      console.error('[SceneDetection] Failed:', e.message)
      return null
    }
  }

  /**
   * Detect scenes for a media item by ID
   */
  async detectScenesById(mediaId: string, options?: SceneDetectionOptions): Promise<SceneDetectionResult | null> {
    if (this.detecting.has(mediaId)) {
      return null // Already detecting
    }

    const media = this.db.raw.prepare('SELECT path, type FROM media WHERE id = ?')
      .get(mediaId) as { path: string; type: string } | undefined

    if (!media || media.type !== 'video') {
      return null
    }

    this.detecting.add(mediaId)

    try {
      const result = await this.detectScenes(media.path, options)
      if (result) {
        result.mediaId = mediaId
      }
      return result
    } finally {
      this.detecting.delete(mediaId)
    }
  }

  /**
   * Convert scenes to chapters
   */
  scenesToChapters(scenes: Scene[], namePattern: string = 'Scene {n}'): Chapter[] {
    return scenes.map((scene, index) => ({
      index,
      title: namePattern.replace('{n}', String(index + 1)),
      startTime: scene.startTime,
      endTime: scene.endTime,
      thumbnailPath: scene.thumbnailPath
    }))
  }

  /**
   * Generate chapter metadata file (for muxing)
   */
  generateChapterFile(chapters: Chapter[], outputPath: string, format: 'ffmpeg' | 'ogm' = 'ffmpeg'): void {
    let content = ''

    if (format === 'ffmpeg') {
      content = ';FFMETADATA1\n'
      for (const chapter of chapters) {
        content += '[CHAPTER]\n'
        content += 'TIMEBASE=1/1000\n'
        content += `START=${Math.floor(chapter.startTime * 1000)}\n`
        content += `END=${Math.floor(chapter.endTime * 1000)}\n`
        content += `title=${chapter.title}\n`
      }
    } else if (format === 'ogm') {
      for (const chapter of chapters) {
        const time = this.formatTimecodeOGM(chapter.startTime)
        content += `CHAPTER${String(chapter.index + 1).padStart(2, '0')}=${time}\n`
        content += `CHAPTER${String(chapter.index + 1).padStart(2, '0')}NAME=${chapter.title}\n`
      }
    }

    fs.writeFileSync(outputPath, content, 'utf8')
  }

  /**
   * Get quick scene count estimate (faster than full detection)
   */
  async estimateSceneCount(filePath: string, sampleDuration: number = 60): Promise<number> {
    const duration = await this.getVideoDuration(filePath)
    if (!duration) return 0

    // Sample a portion of the video
    const sampleSeconds = Math.min(sampleDuration, duration)
    const sceneChanges = await this.runSceneDetection(filePath, 0.3, sampleSeconds)

    // Extrapolate to full duration
    const scenesPerSecond = sceneChanges.length / sampleSeconds
    return Math.round(scenesPerSecond * duration)
  }

  /**
   * Check if detection is in progress
   */
  isDetecting(mediaId: string): boolean {
    return this.detecting.has(mediaId)
  }

  /**
   * Generate timeline visualization data
   */
  getTimelineData(scenes: Scene[], width: number = 1000): Array<{
    x: number
    width: number
    scene: Scene
  }> {
    if (scenes.length === 0) return []

    const totalDuration = scenes[scenes.length - 1].endTime
    const pixelsPerSecond = width / totalDuration

    return scenes.map(scene => ({
      x: Math.floor(scene.startTime * pixelsPerSecond),
      width: Math.floor(scene.duration * pixelsPerSecond),
      scene
    }))
  }

  private async runSceneDetection(filePath: string, threshold: number, maxDuration?: number): Promise<number[]> {
    return new Promise((resolve, reject) => {
      const args = [
        '-i', filePath,
        '-filter:v', `select='gt(scene,${threshold})',showinfo`,
        '-f', 'null',
        '-'
      ]

      if (maxDuration) {
        args.splice(2, 0, '-t', String(maxDuration))
      }

      const proc = spawn(this.ffmpegPath, args)
      let stderr = ''

      proc.stderr.on('data', (data) => {
        stderr += data.toString()
      })

      proc.on('close', (code) => {
        // Parse scene change times from ffmpeg output
        const times: number[] = []
        const regex = /pts_time:(\d+\.?\d*)/g
        let match

        while ((match = regex.exec(stderr)) !== null) {
          times.push(parseFloat(match[1]))
        }

        resolve(times)
      })

      proc.on('error', (err) => {
        reject(err)
      })

      // Timeout after 5 minutes
      setTimeout(() => {
        proc.kill()
        reject(new Error('Scene detection timeout'))
      }, 5 * 60 * 1000)
    })
  }

  private async getVideoDuration(filePath: string): Promise<number | null> {
    return new Promise((resolve) => {
      const args = [
        '-v', 'quiet',
        '-print_format', 'json',
        '-show_format',
        filePath
      ]

      const proc = spawn(this.ffprobePath, args)
      let stdout = ''

      proc.stdout.on('data', (data) => {
        stdout += data.toString()
      })

      proc.on('close', () => {
        try {
          const data = JSON.parse(stdout)
          resolve(parseFloat(data.format?.duration) || null)
        } catch {
          resolve(null)
        }
      })

      proc.on('error', () => resolve(null))
    })
  }

  private async generateSceneThumbnails(filePath: string, scenes: Scene[], outputDir: string): Promise<void> {
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true })
    }

    for (const scene of scenes) {
      const thumbPath = path.join(outputDir, `scene_${scene.index.toString().padStart(3, '0')}.jpg`)

      // Take thumbnail from 1 second into the scene
      const thumbTime = scene.startTime + 1

      await new Promise<void>((resolve) => {
        const args = [
          '-ss', String(thumbTime),
          '-i', filePath,
          '-frames:v', '1',
          '-q:v', '2',
          '-y',
          thumbPath
        ]

        const proc = spawn(this.ffmpegPath, args)
        proc.on('close', () => {
          if (fs.existsSync(thumbPath)) {
            scene.thumbnailPath = thumbPath
          }
          resolve()
        })
        proc.on('error', () => resolve())
      })
    }
  }

  private formatTimecode(seconds: number): string {
    const h = Math.floor(seconds / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    const s = Math.floor(seconds % 60)
    const ms = Math.floor((seconds % 1) * 1000)

    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`
  }

  private formatTimecodeOGM(seconds: number): string {
    const h = Math.floor(seconds / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    const s = Math.floor(seconds % 60)
    const ms = Math.floor((seconds % 1) * 1000)

    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`
  }
}

// Singleton
let instance: SceneDetectionService | null = null

export function getSceneDetectionService(db: DB): SceneDetectionService {
  if (!instance) {
    instance = new SceneDetectionService(db)
  }
  return instance
}
