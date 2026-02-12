// File: src/main/services/query-cache.ts
// In-memory query cache for hot data to reduce database load

interface CacheEntry<T> {
  data: T
  timestamp: number
  hitCount: number
}

interface CacheStats {
  hits: number
  misses: number
  evictions: number
  size: number
}

export class QueryCache<T = any> {
  private cache: Map<string, CacheEntry<T>> = new Map()
  private maxSize: number
  private ttl: number
  private stats: CacheStats = { hits: 0, misses: 0, evictions: 0, size: 0 }
  private cleanupInterval: NodeJS.Timeout | null = null

  constructor(options: { maxSize?: number; ttlMs?: number; cleanupIntervalMs?: number } = {}) {
    this.maxSize = options.maxSize ?? 1000
    this.ttl = options.ttlMs ?? 30000 // 30 seconds default

    // Start periodic cleanup
    const cleanupMs = options.cleanupIntervalMs ?? 60000
    this.cleanupInterval = setInterval(() => this.cleanup(), cleanupMs)
  }

  /**
   * Get cached value or execute query
   */
  async getOrFetch<R extends T>(
    key: string,
    fetchFn: () => R | Promise<R>,
    options?: { ttl?: number }
  ): Promise<R> {
    const cached = this.get(key)
    if (cached !== undefined) {
      return cached as R
    }

    const result = await fetchFn()
    this.set(key, result, options?.ttl)
    return result
  }

  /**
   * Get value from cache
   */
  get(key: string): T | undefined {
    const entry = this.cache.get(key)
    if (!entry) {
      this.stats.misses++
      return undefined
    }

    // Check TTL
    if (Date.now() - entry.timestamp > this.ttl) {
      this.cache.delete(key)
      this.stats.misses++
      return undefined
    }

    entry.hitCount++
    this.stats.hits++
    return entry.data
  }

  /**
   * Set value in cache
   */
  set(key: string, data: T, ttl?: number): void {
    // Evict if at capacity
    if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
      this.evictLRU()
    }

    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      hitCount: 0
    })
    this.stats.size = this.cache.size
  }

  /**
   * Invalidate a specific key
   */
  invalidate(key: string): boolean {
    return this.cache.delete(key)
  }

  /**
   * Invalidate all keys matching a prefix
   */
  invalidatePrefix(prefix: string): number {
    let count = 0
    for (const key of this.cache.keys()) {
      if (key.startsWith(prefix)) {
        this.cache.delete(key)
        count++
      }
    }
    return count
  }

  /**
   * Invalidate all keys matching a pattern
   */
  invalidatePattern(pattern: RegExp): number {
    let count = 0
    for (const key of this.cache.keys()) {
      if (pattern.test(key)) {
        this.cache.delete(key)
        count++
      }
    }
    return count
  }

  /**
   * Clear entire cache
   */
  clear(): void {
    this.cache.clear()
    this.stats.size = 0
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats & { hitRate: number } {
    const total = this.stats.hits + this.stats.misses
    return {
      ...this.stats,
      hitRate: total > 0 ? this.stats.hits / total : 0
    }
  }

  /**
   * Cleanup expired entries
   */
  private cleanup(): void {
    const now = Date.now()
    for (const [key, entry] of this.cache) {
      if (now - entry.timestamp > this.ttl) {
        this.cache.delete(key)
      }
    }
    this.stats.size = this.cache.size
  }

  /**
   * Evict least recently used entry
   */
  private evictLRU(): void {
    let oldest: string | null = null
    let oldestTime = Infinity
    let lowestHits = Infinity

    for (const [key, entry] of this.cache) {
      // Prefer evicting entries with low hit counts
      if (entry.hitCount < lowestHits ||
          (entry.hitCount === lowestHits && entry.timestamp < oldestTime)) {
        oldest = key
        oldestTime = entry.timestamp
        lowestHits = entry.hitCount
      }
    }

    if (oldest) {
      this.cache.delete(oldest)
      this.stats.evictions++
    }
  }

  /**
   * Stop cleanup interval
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval)
      this.cleanupInterval = null
    }
    this.cache.clear()
  }
}

// Specialized caches for different data types
export const mediaCache = new QueryCache<any>({
  maxSize: 500,
  ttlMs: 60000  // 1 minute for media queries
})

export const tagCache = new QueryCache<any>({
  maxSize: 200,
  ttlMs: 120000  // 2 minutes for tags (change less frequently)
})

export const statsCache = new QueryCache<any>({
  maxSize: 50,
  ttlMs: 30000  // 30 seconds for stats
})

// Cache key generators
export const cacheKeys = {
  media: (id: string) => `media:${id}`,
  mediaList: (params: { q?: string; type?: string; tag?: string; limit: number; offset: number }) =>
    `mediaList:${params.q || ''}:${params.type || ''}:${params.tag || ''}:${params.limit}:${params.offset}`,
  mediaCount: (params: { q?: string; type?: string; tag?: string }) =>
    `mediaCount:${params.q || ''}:${params.type || ''}:${params.tag || ''}`,
  tags: () => 'tags:all',
  tagCounts: () => 'tags:counts',
  stats: () => 'stats:global',
  recentMedia: (limit: number) => `recent:${limit}`,
  topRated: (limit: number) => `topRated:${limit}`,
  playlistMedia: (playlistId: string) => `playlist:${playlistId}:media`
}

// Invalidation helpers
export function invalidateMediaCaches(): void {
  mediaCache.invalidatePrefix('media')
  mediaCache.invalidatePrefix('recent')
  mediaCache.invalidatePrefix('topRated')
  statsCache.clear()
}

export function invalidateTagCaches(): void {
  tagCache.clear()
}

export function invalidatePlaylistCaches(playlistId?: string): void {
  if (playlistId) {
    mediaCache.invalidate(cacheKeys.playlistMedia(playlistId))
  } else {
    mediaCache.invalidatePrefix('playlist:')
  }
}
