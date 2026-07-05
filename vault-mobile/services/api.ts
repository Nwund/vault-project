// File: vault-mobile/services/api.ts
// API client for communicating with desktop Vault

// One item in the AI tagging review queue (mirrors the desktop ReviewItem,
// plus `appliedTags` = the media's real current tags, added server-side).
export interface ReviewTag {
  id: string
  name: string
  confidence?: number
}
export interface QueueStatus {
  isRunning: boolean
  isPaused?: boolean
  pending: number
  processing: number
  completed: number
  failed?: number
  total: number
  untagged?: number
  currentMediaId?: string | null
  tier2Enabled?: boolean
}
export interface ReviewItem {
  mediaId: string
  filename: string
  thumbPath?: string | null
  suggestedTitle?: string | null
  description?: string | null
  matchedTags: ReviewTag[]
  newTagSuggestions: Array<{ name: string; confidence?: number }>
  richTags?: Array<{ name: string; confidence?: number; source?: string }>
  reviewStatus: 'pending' | 'approved' | 'rejected'
  suggestedFilename?: string | null
  approvedTagIds?: string[]
  approvedTitle?: string | null
  appliedTags?: string[]
  createdAt?: string
}

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
      rating?: number
      viewCount?: number
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

  // ── AI Review (tagging) — drive the PC's review queue from the phone ──
  // List analyzed items awaiting/holding a review decision. Each item is
  // enriched server-side with `appliedTags` (the media's real current tags).
  async getReviewItems(
    status: 'pending' | 'approved' | 'rejected' = 'pending',
    opts?: { limit?: number; offset?: number }
  ): Promise<{ items: ReviewItem[]; total: number }> {
    const params = new URLSearchParams()
    params.set('status', status)
    if (opts?.limit) params.set('limit', String(opts.limit))
    if (opts?.offset) params.set('offset', String(opts.offset))
    return this.request(`/api/review?${params}`)
  }

  // Approve with edits. selectedTagIds = kept AI-matched tag ids; newTags =
  // tag NAMES the user added (created on the PC if they don't exist).
  async approveReview(
    mediaId: string,
    edits: {
      selectedTagIds?: string[]
      newTags?: string[]
      editedTitle?: string
      editedDescription?: string
      originalTitle?: string | null
      originalDescription?: string | null
    }
  ): Promise<{ success: boolean }> {
    return this.request(`/api/review/${mediaId}/approve`, { method: 'POST', body: JSON.stringify(edits) }, 20000)
  }

  async rejectReview(mediaId: string): Promise<{ success: boolean }> {
    return this.request(`/api/review/${mediaId}/reject`, { method: 'POST' }, 20000)
  }

  // Regenerate title/description via Venice on the PC — slow, so a long timeout.
  async regenerateReviewField(
    mediaId: string,
    field: 'title' | 'description'
  ): Promise<{ success: boolean; field: string; value: string | null }> {
    return this.request(`/api/review/${mediaId}/regenerate`, { method: 'POST', body: JSON.stringify({ field }) }, 90000)
  }

  // ── AI scan queue — queue videos from the phone; the PC analyzes them ──
  async getQueueStatus(): Promise<QueueStatus> {
    return this.request('/api/queue/status')
  }
  // Queue specific media (priority — scanned first). Auto-starts the scanner.
  async enqueueMedia(mediaIds: string[]): Promise<QueueStatus & { queued?: number }> {
    return this.request('/api/queue/enqueue', { method: 'POST', body: JSON.stringify({ mediaIds }) }, 20000)
  }
  // Queue every untagged video. Auto-starts the scanner.
  async enqueueUntagged(): Promise<QueueStatus & { queued?: number }> {
    return this.request('/api/queue/untagged', { method: 'POST' }, 30000)
  }
  async startQueue(): Promise<QueueStatus> {
    return this.request('/api/queue/start', { method: 'POST' }, 30000)
  }
  async stopQueue(): Promise<QueueStatus> {
    return this.request('/api/queue/stop', { method: 'POST' }, 15000)
  }
  // Toggle Venice (Tier 2) analysis for scans.
  async setVenice(enabled: boolean): Promise<{ tier2Enabled: boolean }> {
    return this.request('/api/queue/venice', { method: 'POST', body: JSON.stringify({ enabled }) }, 15000)
  }

  // Remove a single tag from a media item.
  async removeMediaTag(mediaId: string, tag: string): Promise<{ success: boolean; tags: string[] }> {
    return this.request(`/api/media/${mediaId}/tags/remove`, { method: 'POST', body: JSON.stringify({ tag }) }, 15000)
  }

  // Playlists
  async getPlaylists(): Promise<{
    items: Array<{
      id: string
      name: string
      itemCount: number
      isSmart: boolean
      thumbId?: string
    }>
  }> {
    return this.request('/api/playlists')
  }

  // Create a new (manual) playlist on the PC.
  async createPlaylist(name: string): Promise<{ success: boolean; playlist: { id: string; name: string } }> {
    return this.request('/api/playlists', { method: 'POST', body: JSON.stringify({ name }) })
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
