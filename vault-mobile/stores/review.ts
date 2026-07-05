// File: vault-mobile/stores/review.ts
// AI tagging review state — mirrors the desktop AI Review, driven over the
// mobile-sync HTTP API. Holds the current tab's list plus a byId cache so
// the detail screen can look an item up without a separate fetch.

import { create } from 'zustand'
import { api, type ReviewItem, type QueueStatus } from '@/services/api'
import { getErrorMessage } from '@/utils'

export type ReviewStatus = 'pending' | 'approved' | 'rejected'

interface ReviewState {
  status: ReviewStatus
  items: ReviewItem[]
  total: number
  isLoading: boolean
  error: string | null
  byId: Record<string, ReviewItem>

  setStatus: (s: ReviewStatus) => void
  fetch: () => Promise<void>
  getItem: (mediaId: string) => ReviewItem | undefined
  // Patch a cached item in place (e.g. after regenerate updates the title).
  patchItem: (mediaId: string, patch: Partial<ReviewItem>) => void
  approve: (
    mediaId: string,
    edits: {
      selectedTagIds?: string[]
      newTags?: string[]
      editedTitle?: string
      editedDescription?: string
      originalTitle?: string | null
      originalDescription?: string | null
    }
  ) => Promise<void>
  reject: (mediaId: string) => Promise<void>
  regenerate: (mediaId: string, field: 'title' | 'description') => Promise<string | null>
  // Remove a tag that's actually on the media (the "On this media" chips).
  removeAppliedTag: (mediaId: string, tag: string) => Promise<void>

  // AI scan queue
  queueStatus: QueueStatus | null
  fetchQueueStatus: () => Promise<void>
  scanUntagged: () => Promise<number>
  enqueue: (mediaIds: string[]) => Promise<number>
  startScan: () => Promise<void>
  stopScan: () => Promise<void>
  setVenice: (enabled: boolean) => Promise<void>
}

export const useReviewStore = create<ReviewState>((set, get) => ({
  status: 'pending',
  items: [],
  total: 0,
  isLoading: false,
  error: null,
  byId: {},

  setStatus: (s) => set({ status: s }),

  fetch: async () => {
    set({ isLoading: true, error: null })
    try {
      const { items, total } = await api.getReviewItems(get().status, { limit: 100 })
      const byId = { ...get().byId }
      for (const it of items) byId[it.mediaId] = it
      set({ items, total, byId, isLoading: false })
    } catch (err) {
      set({ error: getErrorMessage(err), isLoading: false })
    }
  },

  getItem: (mediaId) => get().byId[mediaId],

  patchItem: (mediaId, patch) => {
    const cur = get().byId[mediaId]
    if (!cur) return
    const next = { ...cur, ...patch }
    set({
      byId: { ...get().byId, [mediaId]: next },
      items: get().items.map((it) => (it.mediaId === mediaId ? next : it)),
    })
  },

  approve: async (mediaId, edits) => {
    await api.approveReview(mediaId, edits)
    // Reflect the edits in the cache so re-opening the item (e.g. from the
    // Approved tab) shows the new title/description immediately.
    get().patchItem(mediaId, {
      reviewStatus: 'approved',
      ...(edits.editedTitle ? { suggestedTitle: edits.editedTitle, approvedTitle: edits.editedTitle } : {}),
      ...(edits.editedDescription !== undefined ? { description: edits.editedDescription } : {}),
    })
    // Item left the current tab (now approved) — drop it from the list.
    set({
      items: get().items.filter((it) => it.mediaId !== mediaId),
      total: Math.max(0, get().total - 1),
    })
  },

  reject: async (mediaId) => {
    await api.rejectReview(mediaId)
    set({
      items: get().items.filter((it) => it.mediaId !== mediaId),
      total: Math.max(0, get().total - 1),
    })
  },

  regenerate: async (mediaId, field) => {
    const res = await api.regenerateReviewField(mediaId, field)
    const value = res?.value ?? null
    if (value != null) {
      get().patchItem(mediaId, field === 'title' ? { suggestedTitle: value } : { description: value })
    }
    return value
  },

  removeAppliedTag: async (mediaId, tag) => {
    const res = await api.removeMediaTag(mediaId, tag)
    // Trust the server's updated tag list when present; else drop locally.
    const nextApplied = Array.isArray(res?.tags)
      ? res.tags
      : (get().byId[mediaId]?.appliedTags || []).filter((t) => t !== tag)
    get().patchItem(mediaId, { appliedTags: nextApplied })
  },

  // ── AI scan queue ──
  queueStatus: null,
  fetchQueueStatus: async () => {
    try {
      const st = await api.getQueueStatus()
      set({ queueStatus: st })
    } catch { /* leave stale */ }
  },
  scanUntagged: async () => {
    const st = await api.enqueueUntagged()
    set({ queueStatus: st })
    return st?.queued ?? 0
  },
  enqueue: async (mediaIds) => {
    const st = await api.enqueueMedia(mediaIds)
    set({ queueStatus: st })
    return st?.queued ?? 0
  },
  startScan: async () => {
    const st = await api.startQueue()
    set({ queueStatus: st })
  },
  stopScan: async () => {
    const st = await api.stopQueue()
    set({ queueStatus: st })
  },
  setVenice: async (enabled) => {
    await api.setVenice(enabled)
    const cur = get().queueStatus
    if (cur) set({ queueStatus: { ...cur, tier2Enabled: enabled } })
  },
}))
