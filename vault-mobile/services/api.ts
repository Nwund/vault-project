// File: vault-mobile/services/api.ts
// API client for communicating with desktop Vault

class VaultAPI {
  private baseUrl: string | null = null
  private token: string | null = null

  configure(baseUrl: string | null | undefined, token: string | null | undefined) {
    this.baseUrl = baseUrl ?? null
    this.token = token ?? null
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {},
    timeoutMs: number = 10000
  ): Promise<T> {
    if (!this.baseUrl) {
      throw new Error('API not configured')
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    }

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`
    }

    // Add timeout to prevent hanging on unreachable servers
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

    try {
      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        ...options,
        headers,
        signal: controller.signal,
      })
      clearTimeout(timeoutId)

      if (!response.ok) {
        const error = await response.json().catch(() => ({}))
        throw new Error(error.error || `Request failed: ${response.status}`)
      }

      return response.json()
    } catch (err: any) {
      clearTimeout(timeoutId)
      if (err.name === 'AbortError') {
        throw new Error('Connection timed out - server unreachable')
      }
      throw err
    }
  }

  // Pairing (no auth required) - with timeout
  async pair(
    serverUrl: string,
    code: string,
    deviceName: string
  ): Promise<{ success: boolean; deviceId?: string; token?: string; error?: string }> {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 15000) // 15s timeout for pairing

    try {
      const response = await fetch(`${serverUrl}/api/pair`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, deviceName, platform: 'mobile' }),
        signal: controller.signal,
      })
      clearTimeout(timeoutId)

      if (!response.ok) {
        return { success: false, error: `Server error: ${response.status}` }
      }

      return response.json()
    } catch (err: any) {
      clearTimeout(timeoutId)
      if (err.name === 'AbortError') {
        return { success: false, error: 'Connection timed out - check server address' }
      }
      return { success: false, error: err.message || 'Failed to connect' }
    }
  }

  // Ping server (health check) - uses shorter timeout for quick fail
  async ping(): Promise<{ status: string; version: string }> {
    // Use 5 second timeout for ping to fail fast on unreachable servers
    return this.request('/api/ping', {}, 5000)
  }

  // Library
  async getLibrary(options?: {
    page?: number
    limit?: number
    type?: string
    tags?: string[]
    search?: string
    sort?: 'newest' | 'oldest' | 'name' | 'size' | 'duration' | 'random'
  }): Promise<{
    items: Array<{
      id: string
      filename: string
      type: 'video' | 'image' | 'gif'
      durationSec?: number
      sizeBytes?: number
      hasThumb: boolean
      tags?: string[]
    }>
    page: number
    limit: number
    hasMore: boolean
    totalCount?: number
  }> {
    const params = new URLSearchParams()
    if (options?.page) params.set('page', String(options.page))
    if (options?.limit) params.set('limit', String(options.limit))
    if (options?.type) params.set('type', options.type)
    if (options?.tags) params.set('tags', options.tags.join(','))
    if (options?.search) params.set('search', options.search)
    if (options?.sort) params.set('sort', options.sort)

    return this.request(`/api/library?${params}`)
  }

  // Get single media item
  async getMediaById(id: string): Promise<{
    id: string
    filename: string
    type: 'video' | 'image' | 'gif'
    durationSec?: number
    sizeBytes?: number
    hasThumb: boolean
    tags?: string[]
  } | null> {
    return this.request(`/api/library/${id}`)
  }

  // Get stream URL for media (includes token for mobile auth)
  getStreamUrl(id: string): string {
    if (!this.baseUrl) return ''
    const tokenParam = this.token ? `?token=${this.token}` : ''
    return `${this.baseUrl}/api/media/${id}/stream${tokenParam}`
  }

  // Get thumbnail URL for media (includes token for mobile auth)
  getThumbUrl(id: string): string {
    if (!this.baseUrl) return ''
    const tokenParam = this.token ? `?token=${this.token}` : ''
    return `${this.baseUrl}/api/media/${id}/thumb${tokenParam}`
  }

  // Get image URL (for displaying actual images, not just thumbs)
  getImageUrl(id: string): string {
    if (!this.baseUrl) return ''
    const tokenParam = this.token ? `?token=${this.token}` : ''
    return `${this.baseUrl}/api/media/${id}/stream${tokenParam}`
  }

  // Playlists
  async getPlaylists(): Promise<{
    items: Array<{
      id: string
      name: string
      itemCount: number
      isSmart: boolean
    }>
  }> {
    return this.request('/api/playlists')
  }

  // Get playlist items
  async getPlaylistItems(id: string): Promise<{
    id: string
    items: Array<{
      id: string
      filename: string
      type: 'video' | 'image' | 'gif'
      durationSec?: number
      hasThumb: boolean
    }>
  }> {
    return this.request(`/api/playlists/${id}`)
  }

  // Add items to playlist
  async addToPlaylist(playlistId: string, mediaIds: string[]): Promise<{
    success: boolean
    added: number
  }> {
    return this.request(`/api/playlists/${playlistId}/items`, {
      method: 'POST',
      body: JSON.stringify({ mediaIds }),
    })
  }

  // Tags
  async getTags(): Promise<{ tags: string[] }> {
    return this.request('/api/tags')
  }

  // Sync status
  async getSyncStatus(): Promise<{
    lastSync: number
    serverVersion: string
  }> {
    return this.request('/api/sync/status')
  }

  // Get recommendations based on favorite tags
  async getRecommendations(favoriteTags: string[], limit: number = 4): Promise<{
    items: Array<{
      id: string
      filename: string
      type: 'video' | 'image' | 'gif'
      durationSec?: number
      hasThumb: boolean
      tags?: string[]
    }>
  }> {
    // If we have favorite tags, try to find similar content
    if (favoriteTags.length > 0) {
      // Pick random subset of tags to search
      const searchTags = favoriteTags
        .sort(() => Math.random() - 0.5)
        .slice(0, 3)

      return this.request(`/api/library?limit=${limit}&tags=${searchTags.join(',')}&sort=random`)
    }

    // Fallback to random
    return this.request(`/api/library?limit=${limit}&type=video&sort=random`)
  }

  // ─────────────────────────────────────────────────────────────────────────
  // RATINGS & STATS
  // ─────────────────────────────────────────────────────────────────────────

  // Set rating for a media item (0-5)
  async setRating(mediaId: string, rating: number): Promise<{
    success: boolean
    mediaId: string
    rating: number
    views: number
  }> {
    return this.request(`/api/media/${mediaId}/rate`, {
      method: 'POST',
      body: JSON.stringify({ rating }),
    })
  }

  // Record a view for a media item
  async recordView(mediaId: string): Promise<{
    success: boolean
    mediaId: string
    views: number
    lastViewedAt: number
  }> {
    return this.request(`/api/media/${mediaId}/view`, {
      method: 'POST',
    })
  }

  // Get stats for a media item
  async getStats(mediaId: string): Promise<{
    mediaId: string
    rating: number
    views: number
    oCount: number
    lastViewedAt: number | null
  }> {
    return this.request(`/api/media/${mediaId}/stats`)
  }

  // Get all ratings for sync
  async getAllRatings(): Promise<{
    items: Array<{ mediaId: string; rating: number; views: number }>
    count: number
  }> {
    return this.request('/api/sync/ratings')
  }

  // Bulk sync watch history from mobile
  async bulkSyncWatches(views: Array<{ mediaId: string; viewedAt: number }>): Promise<{
    success: boolean
    recorded: number
  }> {
    return this.request('/api/sync/watches', {
      method: 'POST',
      body: JSON.stringify({ views }),
    })
  }

  // ─────────────────────────────────────────────────────────────────────────
  // MARKERS/BOOKMARKS
  // ─────────────────────────────────────────────────────────────────────────

  // Get markers/bookmarks for a media item
  async getMarkers(mediaId: string): Promise<{
    mediaId: string
    markers: Array<{
      id: string
      timeSec: number
      title: string
      createdAt: number
    }>
  }> {
    return this.request(`/api/media/${mediaId}/markers`)
  }

  // Add a marker/bookmark
  async addMarker(mediaId: string, timeSec: number, title?: string): Promise<{
    success: boolean
    marker: {
      id: string
      mediaId: string
      timeSec: number
      title: string
      createdAt: number
    }
  }> {
    return this.request(`/api/media/${mediaId}/markers`, {
      method: 'POST',
      body: JSON.stringify({ timeSec, title }),
    })
  }

  // ─────────────────────────────────────────────────────────────────────────
  // URL DOWNLOADER (sends to desktop)
  // ─────────────────────────────────────────────────────────────────────────

  // Send a URL to desktop for download
  async sendDownloadUrl(url: string): Promise<{
    success: boolean
    download?: {
      id: string
      url: string
      title: string
      status: string
    }
    error?: string
  }> {
    return this.request('/api/download', {
      method: 'POST',
      body: JSON.stringify({ url }),
    })
  }

  // ─────────────────────────────────────────────────────────────────────────
  // BIDIRECTIONAL SYNC
  // ─────────────────────────────────────────────────────────────────────────

  // Get favorites from desktop
  async getDesktopFavorites(): Promise<{
    items: Array<{ mediaId: string; rating: number }>
    count: number
    timestamp: number
  }> {
    return this.request('/api/sync/favorites')
  }

  // Push favorites to desktop
  async syncFavoritesToDesktop(items: Array<{ mediaId: string; isFavorite: boolean; timestamp: number }>): Promise<{
    success: boolean
    synced: number
  }> {
    return this.request('/api/sync/favorites', {
      method: 'POST',
      body: JSON.stringify({ items }),
    })
  }

  // Get watch history from desktop
  async getDesktopWatchHistory(since?: number): Promise<{
    items: Array<{ mediaId: string; views: number; lastViewedAt: number }>
    count: number
    timestamp: number
  }> {
    const params = since ? `?since=${since}` : ''
    return this.request(`/api/sync/history${params}`)
  }

  // Push watch history to desktop
  async syncWatchHistoryToDesktop(items: Array<{ mediaId: string; viewedAt: number }>): Promise<{
    success: boolean
    synced: number
  }> {
    return this.request('/api/sync/history', {
      method: 'POST',
      body: JSON.stringify({ items }),
    })
  }

  // Get sync state from desktop
  async getSyncState(): Promise<{
    lastSync: number
    mediaCount: number
    favoritesCount: number
  }> {
    return this.request('/api/sync/state')
  }
}

export const api = new VaultAPI()
