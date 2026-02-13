// Shared URL caching utility - consolidated from multiple implementations

// Global cache for file URLs to avoid repeated API calls
const fileUrlCache = new Map<string, string>()

// Cache size limit to prevent memory bloat
const MAX_CACHE_SIZE = 2000

/**
 * Convert an absolute file path to a URL, with caching
 * Uses the API's thumbs.getUrl method for proper file:// URL handling
 */
export async function toFileUrlCached(absPath: string): Promise<string> {
  // Return cached URL if available
  if (fileUrlCache.has(absPath)) {
    return fileUrlCache.get(absPath)!
  }

  // Evict old entries if cache is full (simple LRU-ish behavior)
  if (fileUrlCache.size >= MAX_CACHE_SIZE) {
    const firstKey = fileUrlCache.keys().next().value
    if (firstKey) fileUrlCache.delete(firstKey)
  }

  // Get URL from API and cache it
  const url = await window.api.thumbs.getUrl(absPath)
  fileUrlCache.set(absPath, url)
  return url
}

/**
 * Clear all cached URLs (useful for memory cleanup)
 */
export function clearUrlCache(): void {
  fileUrlCache.clear()
}

/**
 * Get current cache size
 */
export function getUrlCacheSize(): number {
  return fileUrlCache.size
}

/**
 * Remove a specific path from cache (useful when file changes)
 */
export function invalidateUrl(absPath: string): void {
  fileUrlCache.delete(absPath)
}
