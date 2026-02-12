// File: src/main/services/slideshow.ts
// Slideshow mode service - auto-advancing media viewer with effects

import type { DB } from '../db'

export interface SlideshowConfig {
  // Timing
  imageInterval: number       // Seconds to show each image
  videoMode: 'full' | 'clip' | 'skip'  // How to handle videos
  clipDuration: number        // Seconds per video clip
  clipCount: number           // Number of clips from each video

  // Transitions
  transition: 'fade' | 'slide' | 'zoom' | 'blur' | 'none'
  transitionDuration: number  // Milliseconds

  // Content
  shuffle: boolean
  loop: boolean
  includeImages: boolean
  includeGifs: boolean
  includeVideos: boolean

  // Filters
  minRating: number
  tags: string[]
  excludeTags: string[]

  // Effects
  kenBurns: boolean           // Pan/zoom effect on images
  autoHideUI: boolean         // Hide UI during playback
  showCaptions: boolean       // Show captions if available
  showFilename: boolean       // Show filename overlay
}

export interface SlideshowState {
  isPlaying: boolean
  isPaused: boolean
  currentIndex: number
  totalItems: number
  currentMediaId: string | null
  elapsedTime: number
  remainingTime: number
}

export const DEFAULT_SLIDESHOW_CONFIG: SlideshowConfig = {
  imageInterval: 5,
  videoMode: 'clip',
  clipDuration: 10,
  clipCount: 3,
  transition: 'fade',
  transitionDuration: 500,
  shuffle: true,
  loop: true,
  includeImages: true,
  includeGifs: true,
  includeVideos: true,
  minRating: 0,
  tags: [],
  excludeTags: [],
  kenBurns: true,
  autoHideUI: true,
  showCaptions: false,
  showFilename: false
}

export class SlideshowService {
  private config: SlideshowConfig = { ...DEFAULT_SLIDESHOW_CONFIG }
  private playlist: string[] = []
  private currentIndex = 0
  private isPlaying = false
  private isPaused = false

  constructor(private db: DB) {}

  /**
   * Configure slideshow settings
   */
  configure(config: Partial<SlideshowConfig>): SlideshowConfig {
    this.config = { ...this.config, ...config }
    return this.config
  }

  /**
   * Get current configuration
   */
  getConfig(): SlideshowConfig {
    return { ...this.config }
  }

  /**
   * Build playlist based on current config
   */
  buildPlaylist(options?: {
    mediaIds?: string[]
    playlistId?: string
    collectionId?: string
    tag?: string
  }): string[] {
    let mediaIds: string[] = []

    if (options?.mediaIds && options.mediaIds.length > 0) {
      // Use provided media IDs
      mediaIds = [...options.mediaIds]
    } else if (options?.playlistId) {
      // Get from playlist
      const rows = this.db.raw.prepare(`
        SELECT mediaId FROM playlist_items WHERE playlistId = ? ORDER BY position
      `).all(options.playlistId) as { mediaId: string }[]
      mediaIds = rows.map(r => r.mediaId)
    } else if (options?.collectionId) {
      // Get from collection
      const rows = this.db.raw.prepare(`
        SELECT mediaId FROM collection_items WHERE collectionId = ? ORDER BY position
      `).all(options.collectionId) as { mediaId: string }[]
      mediaIds = rows.map(r => r.mediaId)
    } else if (options?.tag) {
      // Get by tag
      const rows = this.db.raw.prepare(`
        SELECT m.id FROM media m
        JOIN media_tags mt ON m.id = mt.mediaId
        JOIN tags t ON mt.tagId = t.id
        WHERE t.name = ?
      `).all(options.tag) as { id: string }[]
      mediaIds = rows.map(r => r.id)
    } else {
      // Get all media based on filters
      mediaIds = this.queryMediaByConfig()
    }

    // Filter by type
    if (!this.config.includeImages || !this.config.includeGifs || !this.config.includeVideos) {
      const types: string[] = []
      if (this.config.includeImages) types.push('image')
      if (this.config.includeGifs) types.push('gif')
      if (this.config.includeVideos) types.push('video')

      if (types.length > 0 && mediaIds.length > 0) {
        const placeholders = mediaIds.map(() => '?').join(',')
        const typePlaceholders = types.map(() => '?').join(',')
        const rows = this.db.raw.prepare(`
          SELECT id FROM media WHERE id IN (${placeholders}) AND type IN (${typePlaceholders})
        `).all(...mediaIds, ...types) as { id: string }[]
        mediaIds = rows.map(r => r.id)
      }
    }

    // Filter by rating
    if (this.config.minRating > 0 && mediaIds.length > 0) {
      const placeholders = mediaIds.map(() => '?').join(',')
      const rows = this.db.raw.prepare(`
        SELECT m.id FROM media m
        LEFT JOIN media_stats s ON m.id = s.mediaId
        WHERE m.id IN (${placeholders}) AND COALESCE(s.rating, 0) >= ?
      `).all(...mediaIds, this.config.minRating) as { id: string }[]
      mediaIds = rows.map(r => r.id)
    }

    // Filter by tags
    if (this.config.tags.length > 0 && mediaIds.length > 0) {
      const mediaPh = mediaIds.map(() => '?').join(',')
      const tagPh = this.config.tags.map(() => '?').join(',')
      const rows = this.db.raw.prepare(`
        SELECT DISTINCT m.id FROM media m
        JOIN media_tags mt ON m.id = mt.mediaId
        JOIN tags t ON mt.tagId = t.id
        WHERE m.id IN (${mediaPh}) AND t.name IN (${tagPh})
      `).all(...mediaIds, ...this.config.tags) as { id: string }[]
      mediaIds = rows.map(r => r.id)
    }

    // Exclude tags
    if (this.config.excludeTags.length > 0 && mediaIds.length > 0) {
      const mediaPh = mediaIds.map(() => '?').join(',')
      const tagPh = this.config.excludeTags.map(() => '?').join(',')
      const excluded = this.db.raw.prepare(`
        SELECT DISTINCT mt.mediaId FROM media_tags mt
        JOIN tags t ON mt.tagId = t.id
        WHERE mt.mediaId IN (${mediaPh}) AND t.name IN (${tagPh})
      `).all(...mediaIds, ...this.config.excludeTags) as { mediaId: string }[]
      const excludedSet = new Set(excluded.map(r => r.mediaId))
      mediaIds = mediaIds.filter(id => !excludedSet.has(id))
    }

    // Shuffle if enabled
    if (this.config.shuffle) {
      mediaIds = this.shuffleArray(mediaIds)
    }

    this.playlist = mediaIds
    this.currentIndex = 0

    return mediaIds
  }

  private queryMediaByConfig(): string[] {
    const types: string[] = []
    if (this.config.includeImages) types.push('image')
    if (this.config.includeGifs) types.push('gif')
    if (this.config.includeVideos) types.push('video')

    if (types.length === 0) return []

    const typePlaceholders = types.map(() => '?').join(',')
    const rows = this.db.raw.prepare(`
      SELECT m.id FROM media m
      LEFT JOIN media_stats s ON m.id = s.mediaId
      WHERE m.type IN (${typePlaceholders})
      ${this.config.minRating > 0 ? 'AND COALESCE(s.rating, 0) >= ?' : ''}
      ORDER BY RANDOM()
      LIMIT 500
    `).all(...types, ...(this.config.minRating > 0 ? [this.config.minRating] : [])) as { id: string }[]

    return rows.map(r => r.id)
  }

  private shuffleArray<T>(array: T[]): T[] {
    const shuffled = [...array]
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
    }
    return shuffled
  }

  /**
   * Get current playlist
   */
  getPlaylist(): string[] {
    return [...this.playlist]
  }

  /**
   * Get current state
   */
  getState(): SlideshowState {
    return {
      isPlaying: this.isPlaying,
      isPaused: this.isPaused,
      currentIndex: this.currentIndex,
      totalItems: this.playlist.length,
      currentMediaId: this.playlist[this.currentIndex] || null,
      elapsedTime: 0,  // Tracked on frontend
      remainingTime: 0
    }
  }

  /**
   * Start slideshow
   */
  start(): SlideshowState {
    this.isPlaying = true
    this.isPaused = false
    return this.getState()
  }

  /**
   * Pause slideshow
   */
  pause(): SlideshowState {
    this.isPaused = true
    return this.getState()
  }

  /**
   * Resume slideshow
   */
  resume(): SlideshowState {
    this.isPaused = false
    return this.getState()
  }

  /**
   * Stop slideshow
   */
  stop(): SlideshowState {
    this.isPlaying = false
    this.isPaused = false
    this.currentIndex = 0
    return this.getState()
  }

  /**
   * Go to next item
   */
  next(): SlideshowState {
    if (this.playlist.length === 0) return this.getState()

    this.currentIndex++
    if (this.currentIndex >= this.playlist.length) {
      if (this.config.loop) {
        this.currentIndex = 0
        if (this.config.shuffle) {
          this.playlist = this.shuffleArray(this.playlist)
        }
      } else {
        this.currentIndex = this.playlist.length - 1
        this.isPlaying = false
      }
    }

    return this.getState()
  }

  /**
   * Go to previous item
   */
  previous(): SlideshowState {
    if (this.playlist.length === 0) return this.getState()

    this.currentIndex--
    if (this.currentIndex < 0) {
      if (this.config.loop) {
        this.currentIndex = this.playlist.length - 1
      } else {
        this.currentIndex = 0
      }
    }

    return this.getState()
  }

  /**
   * Jump to specific index
   */
  goTo(index: number): SlideshowState {
    if (index >= 0 && index < this.playlist.length) {
      this.currentIndex = index
    }
    return this.getState()
  }

  /**
   * Get timing info for current item
   */
  getTimingForCurrent(): { duration: number; isVideo: boolean; clipTimes?: number[] } {
    const mediaId = this.playlist[this.currentIndex]
    if (!mediaId) {
      return { duration: this.config.imageInterval * 1000, isVideo: false }
    }

    const media = this.db.raw.prepare('SELECT type, durationSec FROM media WHERE id = ?').get(mediaId) as { type: string; durationSec: number | null } | undefined

    if (!media) {
      return { duration: this.config.imageInterval * 1000, isVideo: false }
    }

    if (media.type === 'video') {
      const videoDuration = media.durationSec || 60

      if (this.config.videoMode === 'full') {
        return { duration: videoDuration * 1000, isVideo: true }
      } else if (this.config.videoMode === 'clip') {
        // Generate clip start times
        const clipTimes: number[] = []
        const usableDuration = videoDuration * 0.8  // Use middle 80%
        const startOffset = videoDuration * 0.1
        for (let i = 0; i < this.config.clipCount; i++) {
          clipTimes.push(startOffset + (usableDuration / this.config.clipCount) * i)
        }
        return {
          duration: this.config.clipDuration * this.config.clipCount * 1000,
          isVideo: true,
          clipTimes
        }
      } else {
        // Skip videos
        return { duration: 0, isVideo: true }
      }
    }

    // Image or GIF
    return { duration: this.config.imageInterval * 1000, isVideo: false }
  }
}

// Singleton
let instance: SlideshowService | null = null

export function getSlideshowService(db: DB): SlideshowService {
  if (!instance) {
    instance = new SlideshowService(db)
  }
  return instance
}

// Preset slideshow configurations
export const SLIDESHOW_PRESETS = {
  relaxed: {
    name: 'Relaxed',
    config: {
      imageInterval: 8,
      videoMode: 'clip' as const,
      clipDuration: 15,
      transition: 'fade' as const,
      transitionDuration: 1000,
      kenBurns: true
    }
  },
  fast: {
    name: 'Fast',
    config: {
      imageInterval: 3,
      videoMode: 'clip' as const,
      clipDuration: 5,
      clipCount: 2,
      transition: 'slide' as const,
      transitionDuration: 300,
      kenBurns: false
    }
  },
  imagesOnly: {
    name: 'Images Only',
    config: {
      imageInterval: 5,
      includeVideos: false,
      transition: 'zoom' as const,
      kenBurns: true
    }
  },
  videosOnly: {
    name: 'Videos Only',
    config: {
      videoMode: 'full' as const,
      includeImages: false,
      includeGifs: false,
      transition: 'fade' as const
    }
  },
  favorites: {
    name: 'Favorites',
    config: {
      imageInterval: 6,
      minRating: 4,
      transition: 'fade' as const,
      kenBurns: true
    }
  }
}
