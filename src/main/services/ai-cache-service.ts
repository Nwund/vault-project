// File: src/main/services/ai-cache-service.ts
// AI response caching for cost control - caches Venice AI responses

import * as crypto from 'crypto'
import * as fs from 'fs'
import * as path from 'path'
import { app } from 'electron'

export interface CacheEntry<T = any> {
  value: T
  timestamp: number
  hits: number
  promptHash: string
}

export interface CacheStats {
  totalEntries: number
  totalHits: number
  totalMisses: number
  hitRate: number
  oldestEntry: number | null
  newestEntry: number | null
  cacheSize: number // bytes
}

export interface CacheOptions {
  ttlMs?: number // Time to live in milliseconds
  maxEntries?: number // Maximum cache entries
  namespace?: string // Cache namespace (chat, image, voice)
}

// Default TTLs by type
const DEFAULT_TTL = {
  chat: 24 * 60 * 60 * 1000, // 24 hours for chat responses
  image: 7 * 24 * 60 * 60 * 1000, // 7 days for generated images
  voice: 7 * 24 * 60 * 60 * 1000, // 7 days for voice lines
  tts: 30 * 24 * 60 * 60 * 1000, // 30 days for TTS audio
}

const MAX_ENTRIES = {
  chat: 500,
  image: 100,
  voice: 200,
  tts: 300,
}

class AICacheService {
  private cacheDir: string
  private stats: {
    hits: number
    misses: number
  } = { hits: 0, misses: 0 }

  constructor() {
    this.cacheDir = path.join(app.getPath('userData'), 'ai-cache')
    this.ensureCacheDir()
    console.log('[AICache] Initialized at:', this.cacheDir)
  }

  private ensureCacheDir(): void {
    const namespaces = ['chat', 'image', 'voice', 'tts']
    for (const ns of namespaces) {
      const dir = path.join(this.cacheDir, ns)
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
      }
    }
  }

  /**
   * Generate a hash for the cache key
   */
  private hashKey(key: string): string {
    return crypto.createHash('sha256').update(key).digest('hex').slice(0, 32)
  }

  /**
   * Get the cache file path for a key
   */
  private getCachePath(namespace: string, keyHash: string): string {
    return path.join(this.cacheDir, namespace, `${keyHash}.json`)
  }

  /**
   * Get a cached value
   */
  get<T>(namespace: string, key: string, options: CacheOptions = {}): T | null {
    const keyHash = this.hashKey(key)
    const cachePath = this.getCachePath(namespace, keyHash)

    try {
      if (!fs.existsSync(cachePath)) {
        this.stats.misses++
        return null
      }

      const data = JSON.parse(fs.readFileSync(cachePath, 'utf-8')) as CacheEntry<T>
      const ttl = options.ttlMs ?? DEFAULT_TTL[namespace as keyof typeof DEFAULT_TTL] ?? DEFAULT_TTL.chat
      const age = Date.now() - data.timestamp

      // Check if expired
      if (age > ttl) {
        this.stats.misses++
        this.delete(namespace, key)
        return null
      }

      // Update hit count
      data.hits++
      fs.writeFileSync(cachePath, JSON.stringify(data, null, 2))

      this.stats.hits++
      console.log(`[AICache] HIT: ${namespace}/${keyHash.slice(0, 8)}... (${data.hits} hits)`)
      return data.value
    } catch (err) {
      this.stats.misses++
      return null
    }
  }

  /**
   * Set a cached value
   */
  set<T>(namespace: string, key: string, value: T, options: CacheOptions = {}): void {
    const keyHash = this.hashKey(key)
    const cachePath = this.getCachePath(namespace, keyHash)

    const entry: CacheEntry<T> = {
      value,
      timestamp: Date.now(),
      hits: 0,
      promptHash: keyHash,
    }

    try {
      fs.writeFileSync(cachePath, JSON.stringify(entry, null, 2))
      console.log(`[AICache] SET: ${namespace}/${keyHash.slice(0, 8)}...`)

      // Enforce max entries
      const maxEntries = options.maxEntries ?? MAX_ENTRIES[namespace as keyof typeof MAX_ENTRIES] ?? 500
      this.enforceMaxEntries(namespace, maxEntries)
    } catch (err) {
      console.error('[AICache] Failed to set cache:', err)
    }
  }

  /**
   * Delete a cached value
   */
  delete(namespace: string, key: string): boolean {
    const keyHash = this.hashKey(key)
    const cachePath = this.getCachePath(namespace, keyHash)

    try {
      if (fs.existsSync(cachePath)) {
        fs.unlinkSync(cachePath)
        return true
      }
    } catch {
      // Ignore
    }
    return false
  }

  /**
   * Clear all cache for a namespace
   */
  clearNamespace(namespace: string): number {
    const dir = path.join(this.cacheDir, namespace)
    let count = 0

    try {
      if (fs.existsSync(dir)) {
        const files = fs.readdirSync(dir)
        for (const file of files) {
          if (file.endsWith('.json')) {
            fs.unlinkSync(path.join(dir, file))
            count++
          }
        }
      }
    } catch (err) {
      console.error('[AICache] Failed to clear namespace:', err)
    }

    console.log(`[AICache] Cleared ${count} entries from ${namespace}`)
    return count
  }

  /**
   * Clear all cache
   */
  clearAll(): number {
    let total = 0
    for (const ns of ['chat', 'image', 'voice', 'tts']) {
      total += this.clearNamespace(ns)
    }
    this.stats = { hits: 0, misses: 0 }
    return total
  }

  /**
   * Enforce maximum entries by removing oldest
   */
  private enforceMaxEntries(namespace: string, maxEntries: number): void {
    const dir = path.join(this.cacheDir, namespace)

    try {
      const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json'))

      if (files.length <= maxEntries) return

      // Get all entries with timestamps
      const entries: Array<{ file: string; timestamp: number }> = []
      for (const file of files) {
        try {
          const data = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf-8'))
          entries.push({ file, timestamp: data.timestamp || 0 })
        } catch {
          // Remove corrupt entries
          fs.unlinkSync(path.join(dir, file))
        }
      }

      // Sort by timestamp (oldest first)
      entries.sort((a, b) => a.timestamp - b.timestamp)

      // Remove oldest entries
      const toRemove = entries.slice(0, entries.length - maxEntries)
      for (const entry of toRemove) {
        fs.unlinkSync(path.join(dir, entry.file))
      }

      if (toRemove.length > 0) {
        console.log(`[AICache] Evicted ${toRemove.length} old entries from ${namespace}`)
      }
    } catch (err) {
      console.error('[AICache] Failed to enforce max entries:', err)
    }
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    let totalEntries = 0
    let cacheSize = 0
    let oldestEntry: number | null = null
    let newestEntry: number | null = null

    for (const ns of ['chat', 'image', 'voice', 'tts']) {
      const dir = path.join(this.cacheDir, ns)
      try {
        if (fs.existsSync(dir)) {
          const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json'))
          totalEntries += files.length

          for (const file of files) {
            const filepath = path.join(dir, file)
            const stat = fs.statSync(filepath)
            cacheSize += stat.size

            try {
              const data = JSON.parse(fs.readFileSync(filepath, 'utf-8'))
              const ts = data.timestamp || 0
              if (oldestEntry === null || ts < oldestEntry) oldestEntry = ts
              if (newestEntry === null || ts > newestEntry) newestEntry = ts
            } catch {
              // Ignore
            }
          }
        }
      } catch {
        // Ignore
      }
    }

    const total = this.stats.hits + this.stats.misses
    const hitRate = total > 0 ? this.stats.hits / total : 0

    return {
      totalEntries,
      totalHits: this.stats.hits,
      totalMisses: this.stats.misses,
      hitRate,
      oldestEntry,
      newestEntry,
      cacheSize,
    }
  }

  /**
   * Get or set with async generator function
   */
  async getOrSet<T>(
    namespace: string,
    key: string,
    generator: () => Promise<T>,
    options: CacheOptions = {}
  ): Promise<T> {
    // Try cache first
    const cached = this.get<T>(namespace, key, options)
    if (cached !== null) {
      return cached
    }

    // Generate new value
    const value = await generator()

    // Cache it
    this.set(namespace, key, value, options)

    return value
  }

  /**
   * Create a cache key for chat messages
   */
  createChatKey(messages: Array<{ role: string; content: string }>, spiceLevel?: number): string {
    const normalized = messages.map((m) => `${m.role}:${m.content}`).join('|')
    return `chat:${spiceLevel ?? 0}:${normalized}`
  }

  /**
   * Create a cache key for image generation
   */
  createImageKey(prompt: string, options?: { nsfw?: boolean; style?: string }): string {
    return `image:${options?.nsfw ?? false}:${options?.style ?? 'default'}:${prompt}`
  }

  /**
   * Create a cache key for TTS
   */
  createTTSKey(text: string, voice?: string): string {
    return `tts:${voice ?? 'default'}:${text}`
  }

  /**
   * Create a cache key for voice lines
   */
  createVoiceKey(category: string, subcategory?: string): string {
    return `voice:${category}:${subcategory ?? 'general'}`
  }
}

// Singleton instance
let aiCacheService: AICacheService | null = null

export function getAICacheService(): AICacheService {
  if (!aiCacheService) {
    aiCacheService = new AICacheService()
  }
  return aiCacheService
}

export default AICacheService
