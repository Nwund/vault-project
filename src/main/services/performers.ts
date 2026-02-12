// File: src/main/services/performers.ts
// Performer/Actor tracking and management system

import type { DB } from '../db'
import { nanoid } from 'nanoid'
import path from 'path'
import fs from 'fs'

export interface Performer {
  id: string
  name: string
  aliases: string[]
  gender: 'female' | 'male' | 'trans' | 'other' | null
  birthDate: string | null
  ethnicity: string | null
  hairColor: string | null
  eyeColor: string | null
  height: number | null  // in cm
  weight: number | null  // in kg
  measurements: string | null
  bio: string | null
  photoPath: string | null
  socialLinks: Record<string, string>
  tags: string[]
  isFavorite: boolean
  rating: number
  createdAt: number
  updatedAt: number
}

export interface PerformerStats {
  totalMedia: number
  totalVideos: number
  totalImages: number
  totalWatchTime: number
  averageRating: number
  firstAppearance: number | null
  lastAppearance: number | null
}

export class PerformerService {
  constructor(private db: DB) {
    this.ensureTables()
  }

  private ensureTables(): void {
    this.db.raw.exec(`
      CREATE TABLE IF NOT EXISTS performers (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        aliasesJson TEXT,
        gender TEXT,
        birthDate TEXT,
        ethnicity TEXT,
        hairColor TEXT,
        eyeColor TEXT,
        height INTEGER,
        weight INTEGER,
        measurements TEXT,
        bio TEXT,
        photoPath TEXT,
        socialLinksJson TEXT,
        tagsJson TEXT,
        isFavorite INTEGER NOT NULL DEFAULT 0,
        rating INTEGER NOT NULL DEFAULT 0,
        createdAt REAL NOT NULL,
        updatedAt REAL NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_performers_name ON performers(name);
      CREATE INDEX IF NOT EXISTS idx_performers_favorite ON performers(isFavorite);
      CREATE INDEX IF NOT EXISTS idx_performers_rating ON performers(rating);

      CREATE TABLE IF NOT EXISTS media_performers (
        mediaId TEXT NOT NULL,
        performerId TEXT NOT NULL,
        role TEXT,
        PRIMARY KEY (mediaId, performerId)
      );

      CREATE INDEX IF NOT EXISTS idx_media_performers_media ON media_performers(mediaId);
      CREATE INDEX IF NOT EXISTS idx_media_performers_performer ON media_performers(performerId);
    `)
  }

  /**
   * Create a new performer
   */
  create(data: Partial<Performer>): Performer {
    const id = nanoid()
    const now = Date.now()

    const performer: Performer = {
      id,
      name: data.name || 'Unknown',
      aliases: data.aliases || [],
      gender: data.gender || null,
      birthDate: data.birthDate || null,
      ethnicity: data.ethnicity || null,
      hairColor: data.hairColor || null,
      eyeColor: data.eyeColor || null,
      height: data.height || null,
      weight: data.weight || null,
      measurements: data.measurements || null,
      bio: data.bio || null,
      photoPath: data.photoPath || null,
      socialLinks: data.socialLinks || {},
      tags: data.tags || [],
      isFavorite: data.isFavorite || false,
      rating: data.rating || 0,
      createdAt: now,
      updatedAt: now
    }

    this.db.raw.prepare(`
      INSERT INTO performers (id, name, aliasesJson, gender, birthDate, ethnicity, hairColor, eyeColor, height, weight, measurements, bio, photoPath, socialLinksJson, tagsJson, isFavorite, rating, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, performer.name, JSON.stringify(performer.aliases), performer.gender,
      performer.birthDate, performer.ethnicity, performer.hairColor, performer.eyeColor,
      performer.height, performer.weight, performer.measurements, performer.bio,
      performer.photoPath, JSON.stringify(performer.socialLinks), JSON.stringify(performer.tags),
      performer.isFavorite ? 1 : 0, performer.rating, now, now
    )

    return performer
  }

  /**
   * Update a performer
   */
  update(id: string, data: Partial<Performer>): Performer | null {
    const existing = this.getById(id)
    if (!existing) return null

    const updated: Performer = {
      ...existing,
      ...data,
      id, // Ensure ID doesn't change
      updatedAt: Date.now()
    }

    this.db.raw.prepare(`
      UPDATE performers SET
        name = ?, aliasesJson = ?, gender = ?, birthDate = ?, ethnicity = ?,
        hairColor = ?, eyeColor = ?, height = ?, weight = ?, measurements = ?,
        bio = ?, photoPath = ?, socialLinksJson = ?, tagsJson = ?,
        isFavorite = ?, rating = ?, updatedAt = ?
      WHERE id = ?
    `).run(
      updated.name, JSON.stringify(updated.aliases), updated.gender,
      updated.birthDate, updated.ethnicity, updated.hairColor, updated.eyeColor,
      updated.height, updated.weight, updated.measurements, updated.bio,
      updated.photoPath, JSON.stringify(updated.socialLinks), JSON.stringify(updated.tags),
      updated.isFavorite ? 1 : 0, updated.rating, updated.updatedAt, id
    )

    return updated
  }

  /**
   * Delete a performer
   */
  delete(id: string): boolean {
    this.db.raw.prepare('DELETE FROM media_performers WHERE performerId = ?').run(id)
    const result = this.db.raw.prepare('DELETE FROM performers WHERE id = ?').run(id)
    return result.changes > 0
  }

  /**
   * Get performer by ID
   */
  getById(id: string): Performer | null {
    const row = this.db.raw.prepare('SELECT * FROM performers WHERE id = ?').get(id) as any
    return row ? this.rowToPerformer(row) : null
  }

  /**
   * Get performer by name (case-insensitive)
   */
  getByName(name: string): Performer | null {
    const row = this.db.raw.prepare('SELECT * FROM performers WHERE LOWER(name) = LOWER(?)').get(name) as any
    return row ? this.rowToPerformer(row) : null
  }

  /**
   * Search performers
   */
  search(query: string, limit = 50): Performer[] {
    const rows = this.db.raw.prepare(`
      SELECT * FROM performers
      WHERE name LIKE ? OR aliasesJson LIKE ?
      ORDER BY isFavorite DESC, rating DESC, name ASC
      LIMIT ?
    `).all(`%${query}%`, `%${query}%`, limit) as any[]

    return rows.map(r => this.rowToPerformer(r))
  }

  /**
   * Get all performers
   */
  getAll(options?: { sortBy?: string; limit?: number; offset?: number }): Performer[] {
    const sortBy = options?.sortBy || 'name'
    const limit = options?.limit || 100
    const offset = options?.offset || 0

    const sortMap: Record<string, string> = {
      name: 'name ASC',
      rating: 'rating DESC, name ASC',
      recent: 'updatedAt DESC',
      mediaCount: '(SELECT COUNT(*) FROM media_performers mp WHERE mp.performerId = performers.id) DESC'
    }

    const rows = this.db.raw.prepare(`
      SELECT * FROM performers
      ORDER BY isFavorite DESC, ${sortMap[sortBy] || 'name ASC'}
      LIMIT ? OFFSET ?
    `).all(limit, offset) as any[]

    return rows.map(r => this.rowToPerformer(r))
  }

  /**
   * Get favorites
   */
  getFavorites(): Performer[] {
    const rows = this.db.raw.prepare(`
      SELECT * FROM performers WHERE isFavorite = 1 ORDER BY rating DESC, name ASC
    `).all() as any[]

    return rows.map(r => this.rowToPerformer(r))
  }

  /**
   * Link performer to media
   */
  linkToMedia(performerId: string, mediaId: string, role?: string): void {
    this.db.raw.prepare(`
      INSERT OR REPLACE INTO media_performers (mediaId, performerId, role)
      VALUES (?, ?, ?)
    `).run(mediaId, performerId, role || null)
  }

  /**
   * Unlink performer from media
   */
  unlinkFromMedia(performerId: string, mediaId: string): void {
    this.db.raw.prepare(`
      DELETE FROM media_performers WHERE mediaId = ? AND performerId = ?
    `).run(mediaId, performerId)
  }

  /**
   * Get performers for a media item
   */
  getForMedia(mediaId: string): Performer[] {
    const rows = this.db.raw.prepare(`
      SELECT p.* FROM performers p
      JOIN media_performers mp ON p.id = mp.performerId
      WHERE mp.mediaId = ?
      ORDER BY p.name
    `).all(mediaId) as any[]

    return rows.map(r => this.rowToPerformer(r))
  }

  /**
   * Get media for a performer
   */
  getMediaIds(performerId: string): string[] {
    const rows = this.db.raw.prepare(`
      SELECT mediaId FROM media_performers WHERE performerId = ?
    `).all(performerId) as { mediaId: string }[]

    return rows.map(r => r.mediaId)
  }

  /**
   * Get performer stats
   */
  getStats(performerId: string): PerformerStats {
    const mediaIds = this.getMediaIds(performerId)

    if (mediaIds.length === 0) {
      return {
        totalMedia: 0,
        totalVideos: 0,
        totalImages: 0,
        totalWatchTime: 0,
        averageRating: 0,
        firstAppearance: null,
        lastAppearance: null
      }
    }

    const placeholders = mediaIds.map(() => '?').join(',')

    const countRow = this.db.raw.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN type = 'video' THEN 1 ELSE 0 END) as videos,
        SUM(CASE WHEN type IN ('image', 'gif') THEN 1 ELSE 0 END) as images,
        MIN(addedAt) as firstAdded,
        MAX(addedAt) as lastAdded
      FROM media WHERE id IN (${placeholders})
    `).get(...mediaIds) as any

    const ratingRow = this.db.raw.prepare(`
      SELECT AVG(rating) as avgRating FROM media_stats WHERE mediaId IN (${placeholders}) AND rating > 0
    `).get(...mediaIds) as any

    const watchRow = this.db.raw.prepare(`
      SELECT SUM(watchedSeconds) as totalWatch FROM watch_sessions WHERE mediaId IN (${placeholders})
    `).get(...mediaIds) as any

    return {
      totalMedia: countRow?.total || 0,
      totalVideos: countRow?.videos || 0,
      totalImages: countRow?.images || 0,
      totalWatchTime: watchRow?.totalWatch || 0,
      averageRating: ratingRow?.avgRating || 0,
      firstAppearance: countRow?.firstAdded || null,
      lastAppearance: countRow?.lastAdded || null
    }
  }

  /**
   * Auto-detect performers from filename
   */
  detectFromFilename(filename: string): Performer[] {
    const performers: Performer[] = []
    const allPerformers = this.getAll({ limit: 1000 })

    const lowerFilename = filename.toLowerCase()

    for (const performer of allPerformers) {
      // Check name
      if (lowerFilename.includes(performer.name.toLowerCase())) {
        performers.push(performer)
        continue
      }

      // Check aliases
      for (const alias of performer.aliases) {
        if (lowerFilename.includes(alias.toLowerCase())) {
          performers.push(performer)
          break
        }
      }
    }

    return performers
  }

  /**
   * Merge two performers (combine into one)
   */
  merge(keepId: string, mergeId: string): boolean {
    const keep = this.getById(keepId)
    const merge = this.getById(mergeId)

    if (!keep || !merge) return false

    // Transfer all media links
    this.db.raw.prepare(`
      UPDATE OR IGNORE media_performers SET performerId = ? WHERE performerId = ?
    `).run(keepId, mergeId)

    // Combine aliases
    const allAliases = new Set([...keep.aliases, ...merge.aliases, merge.name])
    allAliases.delete(keep.name)

    this.update(keepId, {
      aliases: Array.from(allAliases),
      // Keep higher rating
      rating: Math.max(keep.rating, merge.rating),
      // Keep favorite if either was
      isFavorite: keep.isFavorite || merge.isFavorite
    })

    // Delete merged performer
    this.delete(mergeId)

    return true
  }

  private rowToPerformer(row: any): Performer {
    return {
      id: row.id,
      name: row.name,
      aliases: row.aliasesJson ? JSON.parse(row.aliasesJson) : [],
      gender: row.gender,
      birthDate: row.birthDate,
      ethnicity: row.ethnicity,
      hairColor: row.hairColor,
      eyeColor: row.eyeColor,
      height: row.height,
      weight: row.weight,
      measurements: row.measurements,
      bio: row.bio,
      photoPath: row.photoPath,
      socialLinks: row.socialLinksJson ? JSON.parse(row.socialLinksJson) : {},
      tags: row.tagsJson ? JSON.parse(row.tagsJson) : [],
      isFavorite: row.isFavorite === 1,
      rating: row.rating,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt
    }
  }
}

// Singleton
let instance: PerformerService | null = null

export function getPerformerService(db: DB): PerformerService {
  if (!instance) {
    instance = new PerformerService(db)
  }
  return instance
}
