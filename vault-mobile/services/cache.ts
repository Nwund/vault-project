// File: vault-mobile/services/cache.ts
// Cache management service for thumbnails and media

import * as FileSystem from 'expo-file-system/legacy'

interface CacheStats {
  thumbCacheSize: number
  shareCacheSize: number
  totalSize: number
}

class CacheService {
  private thumbCacheDir = FileSystem.cacheDirectory ? `${FileSystem.cacheDirectory}thumbnails/` : ''
  private shareCacheDir = FileSystem.cacheDirectory ? `${FileSystem.cacheDirectory}share/` : ''

  async initialize(): Promise<void> {
    try {
      // Ensure directories exist
      await this.ensureDir(this.thumbCacheDir)
      await this.ensureDir(this.shareCacheDir)
    } catch (err) {
      console.error('Failed to initialize cache service:', err)
    }
  }

  private async ensureDir(dir: string): Promise<void> {
    const info = await FileSystem.getInfoAsync(dir)
    if (!info.exists) {
      await FileSystem.makeDirectoryAsync(dir, { intermediates: true })
    }
  }

  async getCacheStats(): Promise<CacheStats> {
    const thumbCacheSize = await this.getDirectorySize(this.thumbCacheDir)
    const shareCacheSize = await this.getDirectorySize(this.shareCacheDir)

    return {
      thumbCacheSize,
      shareCacheSize,
      totalSize: thumbCacheSize + shareCacheSize,
    }
  }

  private async getDirectorySize(dir: string): Promise<number> {
    try {
      const info = await FileSystem.getInfoAsync(dir)
      if (!info.exists) return 0

      const files = await FileSystem.readDirectoryAsync(dir)
      let totalSize = 0

      for (const file of files) {
        const fileInfo = await FileSystem.getInfoAsync(`${dir}${file}`)
        if (fileInfo.exists && 'size' in fileInfo && fileInfo.size) {
          totalSize += fileInfo.size
        }
      }

      return totalSize
    } catch {
      return 0
    }
  }

  async clearThumbCache(): Promise<void> {
    await this.clearDirectory(this.thumbCacheDir)
  }

  async clearShareCache(): Promise<void> {
    await this.clearDirectory(this.shareCacheDir)
  }

  async clearAllCaches(): Promise<void> {
    await Promise.all([
      this.clearThumbCache(),
      this.clearShareCache(),
    ])
  }

  private async clearDirectory(dir: string): Promise<void> {
    try {
      const info = await FileSystem.getInfoAsync(dir)
      if (info.exists) {
        await FileSystem.deleteAsync(dir, { idempotent: true })
        await this.ensureDir(dir)
      }
    } catch (err) {
      console.error('Failed to clear directory:', err)
    }
  }

  // Prune old cache files (older than specified days)
  async pruneOldCache(days: number = 7): Promise<number> {
    const cutoffTime = Date.now() - days * 24 * 60 * 60 * 1000
    let prunedSize = 0

    for (const dir of [this.thumbCacheDir, this.shareCacheDir]) {
      try {
        const info = await FileSystem.getInfoAsync(dir)
        if (!info.exists) continue

        const files = await FileSystem.readDirectoryAsync(dir)

        for (const file of files) {
          const filePath = `${dir}${file}`
          const fileInfo = await FileSystem.getInfoAsync(filePath)

          if (fileInfo.exists && 'modificationTime' in fileInfo) {
            const modTime = (fileInfo.modificationTime || 0) * 1000

            if (modTime < cutoffTime) {
              const size = 'size' in fileInfo ? (fileInfo.size || 0) : 0
              await FileSystem.deleteAsync(filePath, { idempotent: true })
              prunedSize += size
            }
          }
        }
      } catch (err) {
        console.error('Failed to prune cache:', err)
      }
    }

    return prunedSize
  }

  formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
  }

  // Get path to cached thumbnail (returns null if not cached)
  async getCachedThumbPath(mediaId: string): Promise<string | null> {
    const cachedPath = `${this.thumbCacheDir}${mediaId}.jpg`
    try {
      const info = await FileSystem.getInfoAsync(cachedPath)
      if (info.exists) {
        return cachedPath
      }
    } catch {
      // Ignore errors
    }
    return null
  }

  // Cache a thumbnail from remote URL, returns local path
  async cacheThumb(mediaId: string, remoteUrl: string): Promise<string | null> {
    const cachedPath = `${this.thumbCacheDir}${mediaId}.jpg`

    try {
      // Check if already cached
      const existing = await FileSystem.getInfoAsync(cachedPath)
      if (existing.exists) {
        return cachedPath
      }

      // Ensure directory exists
      await this.ensureDir(this.thumbCacheDir)

      // Download the thumbnail
      const downloadResult = await FileSystem.downloadAsync(remoteUrl, cachedPath)

      if (downloadResult.status === 200) {
        return cachedPath
      } else {
        // Clean up failed download
        await FileSystem.deleteAsync(cachedPath, { idempotent: true })
        return null
      }
    } catch (err) {
      console.error('Failed to cache thumbnail:', err)
      return null
    }
  }

  // Get cached thumb URI or remote URL (for Image component)
  async getThumbUri(mediaId: string, remoteUrl: string): Promise<string> {
    const cached = await this.getCachedThumbPath(mediaId)
    if (cached) {
      return cached
    }
    // Return remote URL, but also trigger background caching
    this.cacheThumb(mediaId, remoteUrl).catch(() => {})
    return remoteUrl
  }
}

export const cacheService = new CacheService()
