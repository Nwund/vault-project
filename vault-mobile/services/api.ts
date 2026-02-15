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
    options: RequestInit = {}
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

    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      ...options,
      headers,
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({}))
      throw new Error(error.error || `Request failed: ${response.status}`)
    }

    return response.json()
  }

  // Pairing (no auth required)
  async pair(
    serverUrl: string,
    code: string,
    deviceName: string
  ): Promise<{ success: boolean; deviceId?: string; token?: string; error?: string }> {
    const response = await fetch(`${serverUrl}/api/pair`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, deviceName, platform: 'mobile' }),
    })

    return response.json()
  }

  // Ping server (health check)
  async ping(): Promise<{ status: string; version: string }> {
    return this.request('/api/ping')
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
}

export const api = new VaultAPI()
