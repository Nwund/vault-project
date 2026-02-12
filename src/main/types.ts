// ===============================
// File: src/main/types.ts
// ===============================
export type MediaType = 'video' | 'image' | 'gif'

export type MediaRow = {
  id: string
  type: MediaType
  path: string
  filename: string
  ext: string
  size: number
  mtimeMs: number
  addedAt: number
  durationSec: number | null
  thumbPath: string | null
  width: number | null
  height: number | null
  hashSha256: string | null
  phash: string | null
  analyzeError?: number
  transcodedPath?: string | null
  loudnessPeakTime?: number | null
}

export type TagRow = { id: string; name: string }

export type MarkerRow = {
  id: string
  mediaId: string
  timeSec: number
  title: string
  createdAt: number
}

export type JobStatus = 'queued' | 'running' | 'done' | 'error' | 'canceled'

export type JobRow = {
  id: string
  type: string
  status: JobStatus
  priority: number
  payloadJson: string
  error: string | null
  createdAt: number
  startedAt: number | null
  finishedAt: number | null
}

export type MediaStatsRow = {
  mediaId: string
  views: number
  lastViewedAt: number | null
  rating: number
  oCount: number
  updatedAt: number
}

export type PlaylistRow = {
  id: string
  name: string
  createdAt: number
  updatedAt: number
  isSmart?: number
  rulesJson?: string | null
  lastRefreshed?: number | null
}

// Smart playlist rules
export type SmartPlaylistRules = {
  // Tags to include (OR logic - media must have ANY of these)
  includeTags?: string[]
  // Tags to exclude (media must NOT have any of these)
  excludeTags?: string[]
  // Media type filter
  type?: 'video' | 'image' | 'gif' | ''
  // Minimum rating (1-5)
  minRating?: number
  // Maximum results
  limit?: number
  // Sort by
  sortBy?: 'addedAt' | 'rating' | 'views' | 'random'
  // Sort direction
  sortDir?: 'asc' | 'desc'
}

export type PlaylistItemRow = {
  id: string
  playlistId: string
  mediaId: string
  position: number
  addedAt: number
}

export type DaylistRow = {
  id: string
  dayKey: string
  name: string
  createdAt: number
}