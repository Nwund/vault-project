// File: src/main/services/media-info.ts
// Detailed media information extraction using ffprobe

import type { DB } from '../db'
import { spawn } from 'child_process'
import path from 'path'
import fs from 'fs'

export interface VideoStream {
  index: number
  codec: string
  profile?: string
  width: number
  height: number
  aspectRatio: string
  frameRate: number
  bitRate: number
  pixelFormat?: string
  colorSpace?: string
  hdr?: boolean
}

export interface AudioStream {
  index: number
  codec: string
  channels: number
  channelLayout?: string
  sampleRate: number
  bitRate: number
  language?: string
}

export interface SubtitleStream {
  index: number
  codec: string
  language?: string
  title?: string
  forced: boolean
}

export interface MediaInfo {
  // File info
  path: string
  filename: string
  size: number
  sizeFormatted: string
  format: string
  formatLong: string
  duration: number
  durationFormatted: string
  bitRate: number
  bitRateFormatted: string
  createdAt?: number
  modifiedAt: number

  // Streams
  videoStreams: VideoStream[]
  audioStreams: AudioStream[]
  subtitleStreams: SubtitleStream[]

  // Primary video info (convenience)
  resolution?: string
  codec?: string
  frameRate?: number
  isHD: boolean
  is4K: boolean
  isHDR: boolean

  // Metadata
  title?: string
  artist?: string
  album?: string
  date?: string
  comment?: string
  encoder?: string

  // Analysis
  hasAudio: boolean
  hasVideo: boolean
  hasSubtitles: boolean
  streamCount: number
}

export class MediaInfoService {
  private ffprobePath: string = 'ffprobe'

  constructor(private db: DB) {}

  /**
   * Set custom ffprobe path
   */
  setFfprobePath(ffprobePath: string): void {
    this.ffprobePath = ffprobePath
  }

  /**
   * Get detailed media information
   */
  async getInfo(filePath: string): Promise<MediaInfo | null> {
    if (!fs.existsSync(filePath)) {
      return null
    }

    const stats = fs.statSync(filePath)

    try {
      const probeData = await this.runFfprobe(filePath)
      return this.parseProbeData(filePath, stats, probeData)
    } catch (e: any) {
      console.error('[MediaInfo] Error probing file:', e.message)
      return this.getBasicInfo(filePath, stats)
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

      proc.on('error', (err) => {
        reject(err)
      })

      // Timeout after 30 seconds
      setTimeout(() => {
        proc.kill()
        reject(new Error('ffprobe timeout'))
      }, 30000)
    })
  }

  private parseProbeData(filePath: string, stats: fs.Stats, data: any): MediaInfo {
    const format = data.format || {}
    const streams = data.streams || []

    // Parse video streams
    const videoStreams: VideoStream[] = streams
      .filter((s: any) => s.codec_type === 'video')
      .map((s: any) => ({
        index: s.index,
        codec: s.codec_name,
        profile: s.profile,
        width: s.width,
        height: s.height,
        aspectRatio: s.display_aspect_ratio || `${s.width}:${s.height}`,
        frameRate: this.parseFrameRate(s.r_frame_rate || s.avg_frame_rate),
        bitRate: parseInt(s.bit_rate) || 0,
        pixelFormat: s.pix_fmt,
        colorSpace: s.color_space,
        hdr: this.isHDR(s)
      }))

    // Parse audio streams
    const audioStreams: AudioStream[] = streams
      .filter((s: any) => s.codec_type === 'audio')
      .map((s: any) => ({
        index: s.index,
        codec: s.codec_name,
        channels: s.channels,
        channelLayout: s.channel_layout,
        sampleRate: parseInt(s.sample_rate) || 0,
        bitRate: parseInt(s.bit_rate) || 0,
        language: s.tags?.language
      }))

    // Parse subtitle streams
    const subtitleStreams: SubtitleStream[] = streams
      .filter((s: any) => s.codec_type === 'subtitle')
      .map((s: any) => ({
        index: s.index,
        codec: s.codec_name,
        language: s.tags?.language,
        title: s.tags?.title,
        forced: s.disposition?.forced === 1
      }))

    const duration = parseFloat(format.duration) || 0
    const bitRate = parseInt(format.bit_rate) || 0
    const primaryVideo = videoStreams[0]

    const info: MediaInfo = {
      path: filePath,
      filename: path.basename(filePath),
      size: stats.size,
      sizeFormatted: this.formatBytes(stats.size),
      format: format.format_name || path.extname(filePath).slice(1),
      formatLong: format.format_long_name || '',
      duration,
      durationFormatted: this.formatDuration(duration),
      bitRate,
      bitRateFormatted: this.formatBitRate(bitRate),
      modifiedAt: stats.mtimeMs,

      videoStreams,
      audioStreams,
      subtitleStreams,

      hasAudio: audioStreams.length > 0,
      hasVideo: videoStreams.length > 0,
      hasSubtitles: subtitleStreams.length > 0,
      streamCount: streams.length,

      isHD: (primaryVideo?.height || 0) >= 720,
      is4K: (primaryVideo?.height || 0) >= 2160,
      isHDR: primaryVideo?.hdr || false
    }

    // Add primary video convenience properties
    if (primaryVideo) {
      info.resolution = `${primaryVideo.width}x${primaryVideo.height}`
      info.codec = primaryVideo.codec
      info.frameRate = primaryVideo.frameRate
    }

    // Add metadata
    if (format.tags) {
      info.title = format.tags.title
      info.artist = format.tags.artist
      info.album = format.tags.album
      info.date = format.tags.date || format.tags.creation_time
      info.comment = format.tags.comment
      info.encoder = format.tags.encoder
    }

    return info
  }

  private getBasicInfo(filePath: string, stats: fs.Stats): MediaInfo {
    const ext = path.extname(filePath).toLowerCase().slice(1)

    return {
      path: filePath,
      filename: path.basename(filePath),
      size: stats.size,
      sizeFormatted: this.formatBytes(stats.size),
      format: ext,
      formatLong: ext,
      duration: 0,
      durationFormatted: '0:00',
      bitRate: 0,
      bitRateFormatted: '0 kbps',
      modifiedAt: stats.mtimeMs,

      videoStreams: [],
      audioStreams: [],
      subtitleStreams: [],

      hasAudio: false,
      hasVideo: ['mp4', 'mkv', 'avi', 'mov', 'webm', 'wmv'].includes(ext),
      hasSubtitles: false,
      streamCount: 0,

      isHD: false,
      is4K: false,
      isHDR: false
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

  private isHDR(stream: any): boolean {
    const hdrIndicators = ['bt2020', 'smpte2084', 'arib-std-b67', 'hdr']
    const colorSpace = (stream.color_space || '').toLowerCase()
    const colorTransfer = (stream.color_transfer || '').toLowerCase()
    const colorPrimaries = (stream.color_primaries || '').toLowerCase()

    return hdrIndicators.some(ind =>
      colorSpace.includes(ind) ||
      colorTransfer.includes(ind) ||
      colorPrimaries.includes(ind)
    )
  }

  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  private formatDuration(seconds: number): string {
    if (!seconds) return '0:00'
    const h = Math.floor(seconds / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    const s = Math.floor(seconds % 60)

    if (h > 0) {
      return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
    }
    return `${m}:${s.toString().padStart(2, '0')}`
  }

  private formatBitRate(bps: number): string {
    if (bps === 0) return '0 kbps'
    if (bps >= 1000000) {
      return (bps / 1000000).toFixed(1) + ' Mbps'
    }
    return Math.round(bps / 1000) + ' kbps'
  }

  /**
   * Get info for a media item by ID
   */
  async getInfoById(mediaId: string): Promise<MediaInfo | null> {
    const media = this.db.raw.prepare('SELECT path FROM media WHERE id = ?').get(mediaId) as { path: string } | undefined
    if (!media) return null
    return this.getInfo(media.path)
  }

  /**
   * Batch get info for multiple items
   */
  async batchGetInfo(mediaIds: string[]): Promise<Map<string, MediaInfo | null>> {
    const results = new Map<string, MediaInfo | null>()

    for (const id of mediaIds) {
      results.set(id, await this.getInfoById(id))
    }

    return results
  }

  /**
   * Get library quality statistics
   */
  getQualityStats(): {
    total: number
    hd720: number
    hd1080: number
    uhd4k: number
    sd: number
    unknown: number
    hdr: number
    avgBitRate: number
  } {
    const rows = this.db.raw.prepare(`
      SELECT width, height FROM media WHERE type = 'video'
    `).all() as Array<{ width: number | null; height: number | null }>

    let hd720 = 0, hd1080 = 0, uhd4k = 0, sd = 0, unknown = 0

    for (const row of rows) {
      const h = row.height || 0
      if (h === 0) unknown++
      else if (h >= 2160) uhd4k++
      else if (h >= 1080) hd1080++
      else if (h >= 720) hd720++
      else sd++
    }

    return {
      total: rows.length,
      hd720,
      hd1080,
      uhd4k,
      sd,
      unknown,
      hdr: 0, // Would need to scan files
      avgBitRate: 0
    }
  }
}

// Singleton
let instance: MediaInfoService | null = null

export function getMediaInfoService(db: DB): MediaInfoService {
  if (!instance) {
    instance = new MediaInfoService(db)
  }
  return instance
}
