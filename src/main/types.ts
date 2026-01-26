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