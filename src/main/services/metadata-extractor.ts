// File: src/main/services/metadata-extractor.ts
// Extract and edit embedded metadata from media files

import { spawn } from 'child_process'
import path from 'path'
import fs from 'fs'
import type { DB } from '../db'

export interface VideoMetadata {
  title?: string
  artist?: string
  album?: string
  date?: string
  year?: number
  genre?: string
  comment?: string
  description?: string
  copyright?: string
  encoder?: string
  rating?: number

  // Technical
  duration: number
  bitRate: number
  codec: string
  width: number
  height: number
  frameRate: number
  pixelFormat?: string
  colorSpace?: string

  // Audio
  audioCodec?: string
  audioChannels?: number
  audioSampleRate?: number
  audioBitRate?: number

  // Location
  location?: { lat: number; lon: number }

  // Timestamps
  creationTime?: number
  modificationTime?: number

  // Custom tags
  customTags: Record<string, string>
}

export interface ImageMetadata {
  title?: string
  artist?: string
  copyright?: string
  comment?: string
  description?: string

  // Technical
  width: number
  height: number
  colorSpace?: string
  bitDepth?: number
  compression?: string

  // EXIF
  camera?: string
  lens?: string
  focalLength?: number
  aperture?: number
  iso?: number
  shutterSpeed?: string
  flash?: boolean
  orientation?: number

  // GPS
  location?: { lat: number; lon: number }
  altitude?: number

  // Timestamps
  dateTaken?: number
  dateModified?: number

  // Custom
  customTags: Record<string, string>
}

export interface MetadataWriteOptions {
  title?: string
  artist?: string
  album?: string
  date?: string
  genre?: string
  comment?: string
  description?: string
  rating?: number
  customTags?: Record<string, string>
}

export class MetadataExtractorService {
  private ffprobePath: string = 'ffprobe'

  constructor(private db: DB) {}

  /**
   * Set custom ffprobe path
   */
  setFfprobePath(path: string): void {
    this.ffprobePath = path
  }

  /**
   * Extract metadata from a video file
   */
  async extractVideoMetadata(filePath: string): Promise<VideoMetadata | null> {
    if (!fs.existsSync(filePath)) {
      return null
    }

    try {
      const data = await this.runFfprobe(filePath)
      return this.parseVideoMetadata(data)
    } catch (e: any) {
      console.error('[Metadata] Failed to extract video metadata:', e.message)
      return null
    }
  }

  /**
   * Extract metadata from an image file
   */
  async extractImageMetadata(filePath: string): Promise<ImageMetadata | null> {
    if (!fs.existsSync(filePath)) {
      return null
    }

    try {
      const data = await this.runFfprobe(filePath)
      return this.parseImageMetadata(data)
    } catch (e: any) {
      console.error('[Metadata] Failed to extract image metadata:', e.message)
      return null
    }
  }

  /**
   * Extract metadata from any media file
   */
  async extractMetadata(filePath: string): Promise<VideoMetadata | ImageMetadata | null> {
    const ext = path.extname(filePath).toLowerCase()
    const imageExts = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.tiff']

    if (imageExts.includes(ext)) {
      return this.extractImageMetadata(filePath)
    }
    return this.extractVideoMetadata(filePath)
  }

  /**
   * Get metadata for a media item by ID
   */
  async getMetadataById(mediaId: string): Promise<VideoMetadata | ImageMetadata | null> {
    const media = this.db.raw.prepare('SELECT path, type FROM media WHERE id = ?').get(mediaId) as { path: string; type: string } | undefined

    if (!media) return null

    if (media.type === 'image' || media.type === 'gif') {
      return this.extractImageMetadata(media.path)
    }
    return this.extractVideoMetadata(media.path)
  }

  /**
   * Sync metadata to database
   */
  async syncToDatabase(mediaId: string): Promise<boolean> {
    const media = this.db.raw.prepare('SELECT path, type FROM media WHERE id = ?').get(mediaId) as { path: string; type: string } | undefined

    if (!media) return false

    try {
      const metadata = await this.extractMetadata(media.path)
      if (!metadata) return false

      // Update media record with extracted metadata
      const updates: any = {}

      if ('duration' in metadata && metadata.duration) {
        updates.durationSec = metadata.duration
      }
      if ('width' in metadata && metadata.width) {
        updates.width = metadata.width
      }
      if ('height' in metadata && metadata.height) {
        updates.height = metadata.height
      }
      if ('codec' in metadata && metadata.codec) {
        updates.codec = metadata.codec
      }
      if ('frameRate' in metadata && metadata.frameRate) {
        updates.frameRate = metadata.frameRate
      }
      if ('bitRate' in metadata && metadata.bitRate) {
        updates.bitRate = metadata.bitRate
      }

      if (Object.keys(updates).length > 0) {
        const setClause = Object.keys(updates).map(k => `${k} = ?`).join(', ')
        const values = Object.values(updates)
        this.db.raw.prepare(`UPDATE media SET ${setClause} WHERE id = ?`).run(...values, mediaId)
      }

      return true
    } catch (e) {
      console.error('[Metadata] Sync failed:', e)
      return false
    }
  }

  /**
   * Batch sync metadata for multiple items
   */
  async batchSync(mediaIds: string[]): Promise<{ synced: number; failed: number }> {
    let synced = 0
    let failed = 0

    for (const id of mediaIds) {
      const success = await this.syncToDatabase(id)
      if (success) synced++
      else failed++
    }

    return { synced, failed }
  }

  /**
   * Get all items missing metadata
   */
  getMissingMetadata(): Array<{ id: string; filename: string; path: string; missing: string[] }> {
    const items = this.db.raw.prepare(`
      SELECT id, filename, path, type, width, height, durationSec, codec
      FROM media
    `).all() as any[]

    const results: Array<{ id: string; filename: string; path: string; missing: string[] }> = []

    for (const item of items) {
      const missing: string[] = []

      if (item.type === 'video') {
        if (!item.width || !item.height) missing.push('resolution')
        if (!item.durationSec) missing.push('duration')
        if (!item.codec) missing.push('codec')
      } else if (item.type === 'image' || item.type === 'gif') {
        if (!item.width || !item.height) missing.push('dimensions')
      }

      if (missing.length > 0) {
        results.push({
          id: item.id,
          filename: item.filename,
          path: item.path,
          missing
        })
      }
    }

    return results
  }

  /**
   * Extract embedded thumbnails from video
   */
  async extractEmbeddedThumbnail(videoPath: string, outputPath: string): Promise<boolean> {
    return new Promise((resolve) => {
      const args = [
        '-i', videoPath,
        '-an', '-vcodec', 'copy',
        '-map', '0:v:0',
        '-frames:v', '1',
        outputPath
      ]

      const proc = spawn('ffmpeg', args)
      proc.on('close', (code) => resolve(code === 0))
      proc.on('error', () => resolve(false))
    })
  }

  /**
   * Get codec information
   */
  getCodecInfo(codec: string): {
    name: string
    type: 'video' | 'audio'
    quality: 'low' | 'medium' | 'high' | 'premium'
    description: string
  } | null {
    const codecInfo: Record<string, any> = {
      'h264': { name: 'H.264 / AVC', type: 'video', quality: 'high', description: 'Most compatible video codec' },
      'hevc': { name: 'H.265 / HEVC', type: 'video', quality: 'premium', description: 'High efficiency, 50% smaller than H.264' },
      'av1': { name: 'AV1', type: 'video', quality: 'premium', description: 'Next-gen open codec, best compression' },
      'vp9': { name: 'VP9', type: 'video', quality: 'high', description: 'Google open codec, YouTube standard' },
      'vp8': { name: 'VP8', type: 'video', quality: 'medium', description: 'Older WebM codec' },
      'mpeg4': { name: 'MPEG-4', type: 'video', quality: 'medium', description: 'Legacy codec' },
      'mjpeg': { name: 'Motion JPEG', type: 'video', quality: 'low', description: 'Frame-by-frame JPEG' },
      'aac': { name: 'AAC', type: 'audio', quality: 'high', description: 'Standard audio codec' },
      'mp3': { name: 'MP3', type: 'audio', quality: 'medium', description: 'Legacy audio codec' },
      'opus': { name: 'Opus', type: 'audio', quality: 'premium', description: 'Best quality per bit' },
      'flac': { name: 'FLAC', type: 'audio', quality: 'premium', description: 'Lossless audio' },
      'ac3': { name: 'AC-3 / Dolby', type: 'audio', quality: 'high', description: 'Surround sound codec' },
      'eac3': { name: 'E-AC-3 / Dolby+', type: 'audio', quality: 'premium', description: 'Enhanced surround sound' },
    }

    const lower = codec.toLowerCase()
    return codecInfo[lower] || null
  }

  /**
   * Calculate quality score for a video
   */
  calculateQualityScore(metadata: VideoMetadata): {
    score: number
    breakdown: {
      resolution: number
      bitRate: number
      codec: number
      frameRate: number
    }
    rating: 'poor' | 'fair' | 'good' | 'excellent' | 'premium'
  } {
    let resScore = 0
    if (metadata.height >= 2160) resScore = 100
    else if (metadata.height >= 1440) resScore = 85
    else if (metadata.height >= 1080) resScore = 70
    else if (metadata.height >= 720) resScore = 50
    else if (metadata.height >= 480) resScore = 30
    else resScore = 15

    let bitrateScore = 0
    const kbps = metadata.bitRate / 1000
    if (kbps >= 20000) bitrateScore = 100
    else if (kbps >= 10000) bitrateScore = 80
    else if (kbps >= 5000) bitrateScore = 60
    else if (kbps >= 2000) bitrateScore = 40
    else bitrateScore = 20

    let codecScore = 50
    const codecLower = metadata.codec?.toLowerCase() || ''
    if (codecLower.includes('av1')) codecScore = 100
    else if (codecLower.includes('hevc') || codecLower.includes('h265')) codecScore = 90
    else if (codecLower.includes('h264') || codecLower.includes('avc')) codecScore = 70
    else if (codecLower.includes('vp9')) codecScore = 75

    let fpsScore = 50
    if (metadata.frameRate >= 60) fpsScore = 100
    else if (metadata.frameRate >= 50) fpsScore = 80
    else if (metadata.frameRate >= 30) fpsScore = 60
    else if (metadata.frameRate >= 24) fpsScore = 50

    const totalScore = Math.round(
      resScore * 0.4 +
      bitrateScore * 0.3 +
      codecScore * 0.15 +
      fpsScore * 0.15
    )

    let rating: 'poor' | 'fair' | 'good' | 'excellent' | 'premium'
    if (totalScore >= 85) rating = 'premium'
    else if (totalScore >= 70) rating = 'excellent'
    else if (totalScore >= 50) rating = 'good'
    else if (totalScore >= 30) rating = 'fair'
    else rating = 'poor'

    return {
      score: totalScore,
      breakdown: {
        resolution: resScore,
        bitRate: bitrateScore,
        codec: codecScore,
        frameRate: fpsScore
      },
      rating
    }
  }

  private runFfprobe(filePath: string): Promise<any> {
    return new Promise((resolve, reject) => {
      const args = [
        '-v', 'quiet',
        '-print_format', 'json',
        '-show_format',
        '-show_streams',
        filePath
      ]

      const proc = spawn(this.ffprobePath, args)
      let stdout = ''
      let stderr = ''

      proc.stdout.on('data', (data) => { stdout += data.toString() })
      proc.stderr.on('data', (data) => { stderr += data.toString() })

      proc.on('close', (code) => {
        if (code === 0) {
          try {
            resolve(JSON.parse(stdout))
          } catch {
            reject(new Error('Failed to parse ffprobe output'))
          }
        } else {
          reject(new Error(stderr || `ffprobe exited with code ${code}`))
        }
      })

      proc.on('error', reject)

      setTimeout(() => {
        proc.kill()
        reject(new Error('ffprobe timeout'))
      }, 30000)
    })
  }

  private parseVideoMetadata(data: any): VideoMetadata {
    const format = data.format || {}
    const streams = data.streams || []

    const videoStream = streams.find((s: any) => s.codec_type === 'video')
    const audioStream = streams.find((s: any) => s.codec_type === 'audio')

    const customTags: Record<string, string> = {}
    if (format.tags) {
      for (const [key, value] of Object.entries(format.tags)) {
        if (!['title', 'artist', 'album', 'date', 'genre', 'comment', 'description', 'encoder', 'copyright'].includes(key.toLowerCase())) {
          customTags[key] = String(value)
        }
      }
    }

    return {
      title: format.tags?.title,
      artist: format.tags?.artist,
      album: format.tags?.album,
      date: format.tags?.date || format.tags?.creation_time,
      year: format.tags?.date ? parseInt(format.tags.date.slice(0, 4)) : undefined,
      genre: format.tags?.genre,
      comment: format.tags?.comment,
      description: format.tags?.description,
      copyright: format.tags?.copyright,
      encoder: format.tags?.encoder,

      duration: parseFloat(format.duration) || 0,
      bitRate: parseInt(format.bit_rate) || 0,
      codec: videoStream?.codec_name || '',
      width: videoStream?.width || 0,
      height: videoStream?.height || 0,
      frameRate: this.parseFrameRate(videoStream?.r_frame_rate || videoStream?.avg_frame_rate),
      pixelFormat: videoStream?.pix_fmt,
      colorSpace: videoStream?.color_space,

      audioCodec: audioStream?.codec_name,
      audioChannels: audioStream?.channels,
      audioSampleRate: audioStream?.sample_rate ? parseInt(audioStream.sample_rate) : undefined,
      audioBitRate: audioStream?.bit_rate ? parseInt(audioStream.bit_rate) : undefined,

      creationTime: format.tags?.creation_time ? new Date(format.tags.creation_time).getTime() : undefined,

      customTags
    }
  }

  private parseImageMetadata(data: any): ImageMetadata {
    const format = data.format || {}
    const streams = data.streams || []
    const videoStream = streams.find((s: any) => s.codec_type === 'video')

    const customTags: Record<string, string> = {}
    if (format.tags) {
      for (const [key, value] of Object.entries(format.tags)) {
        customTags[key] = String(value)
      }
    }

    return {
      title: format.tags?.title,
      artist: format.tags?.artist,
      copyright: format.tags?.copyright,
      comment: format.tags?.comment,
      description: format.tags?.description,

      width: videoStream?.width || 0,
      height: videoStream?.height || 0,
      colorSpace: videoStream?.color_space,
      bitDepth: videoStream?.bits_per_raw_sample ? parseInt(videoStream.bits_per_raw_sample) : undefined,

      customTags
    }
  }

  private parseFrameRate(fps: string): number {
    if (!fps) return 0
    const parts = fps.split('/')
    if (parts.length === 2) {
      return Math.round(parseInt(parts[0]) / parseInt(parts[1]) * 100) / 100
    }
    return parseFloat(fps) || 0
  }
}

// Singleton
let instance: MetadataExtractorService | null = null

export function getMetadataExtractorService(db: DB): MetadataExtractorService {
  if (!instance) {
    instance = new MetadataExtractorService(db)
  }
  return instance
}
