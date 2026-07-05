// File: vault-mobile/stores/sync.ts
// Bidirectional sync state management

import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { api } from '@/services/api'
import { useFavoritesStore } from './favorites'
import { useConnectionStore } from './connection'

interface WatchHistoryItem {
  mediaId: string
  viewedAt: number
  synced: boolean
}

interface SyncState {
  // Sync timestamps
  lastFavoritesSync: number
  lastHistorySync: number
  lastFullSync: number

  // Pending items to sync
  pendingWatches: WatchHistoryItem[]
  pendingFavoriteChanges: Array<{ mediaId: string; isFavorite: boolean; timestamp: number }>

  // Sync status
  isSyncing: boolean
  syncError: string | null
  autoSyncEnabled: boolean

  // Actions
  recordWatch: (mediaId: string) => void
  recordFavoriteChange: (mediaId: string, isFavorite: boolean) => void
  syncFavorites: () => Promise<{ pulled: number; pushed: number }>
  syncWatchHistory: () => Promise<{ pulled: number; pushed: number }>
  syncAll: () => Promise<{ favorites: { pulled: number; pushed: number }; history: { pulled: number; pushed: number } }>
  clearPending: () => void
  setAutoSync: (enabled: boolean) => void
}

export const useSyncStore = create<SyncState>()(
  persist(
    (set, get) => ({
      lastFavoritesSync: 0,
      lastHistorySync: 0,
      lastFullSync: 0,
      pendingWatches: [],
      pendingFavoriteChanges: [],
      isSyncing: false,
      syncError: null,
      autoSyncEnabled: true,

      recordWatch: (mediaId: string) => {
        const { pendingWatches } = get()
        // Avoid duplicates within last 5 minutes
        const fiveMinAgo = Date.now() - 5 * 60 * 1000
        const hasRecent = pendingWatches.some(
          w => w.mediaId === mediaId && w.viewedAt > fiveMinAgo
        )
        if (!hasRecent) {
          set({
            pendingWatches: [
              ...pendingWatches,
              { mediaId, viewedAt: Date.now(), synced: false }
            ]
          })
        }
      },

      recordFavoriteChange: (mediaId: string, isFavorite: boolean) => {
        const { pendingFavoriteChanges } = get()
        // Remove any existing pending change for this media
        const filtered = pendingFavoriteChanges.filter(c => c.mediaId !== mediaId)
        set({
          pendingFavoriteChanges: [
            ...filtered,
            { mediaId, isFavorite, timestamp: Date.now() }
          ]
        })
      },

      syncFavorites: async () => {
        const { isConnected } = useConnectionStore.getState()
        if (!isConnected) {
          throw new Error('Not connected to desktop')
        }

        set({ isSyncing: true, syncError: null })
        let pulled = 0
        let pushed = 0

        try {
          // 1. Push pending favorite changes to desktop
          const { pendingFavoriteChanges } = get()
          if (pendingFavoriteChanges.length > 0) {
            const result = await api.syncFavoritesToDesktop(pendingFavoriteChanges)
            pushed = result.synced
            // Clear synced items
            set({ pendingFavoriteChanges: [] })
          }

          // 2. Pull favorites from desktop
          const desktopFavorites = await api.getDesktopFavorites()
          const favoritesStore = useFavoritesStore.getState()

          // Add desktop favorites to mobile (rating >= 4 considered favorite)
          for (const item of desktopFavorites.items) {
            if (item.rating >= 4 && !favoritesStore.isFavorite(item.mediaId)) {
              // We need media info to add to favorites - fetch it
              try {
                const mediaInfo = await api.getMediaById(item.mediaId)
                if (mediaInfo) {
                  favoritesStore.addFavorite({
                    id: mediaInfo.id,
                    filename: mediaInfo.filename,
                    type: mediaInfo.type,
                    durationSec: mediaInfo.durationSec,
                    hasThumb: mediaInfo.hasThumb,
                    tags: mediaInfo.tags
                  })
                  pulled++
                }
              } catch {
                // Skip if can't fetch media info
              }
            }
          }

          set({
            lastFavoritesSync: Date.now(),
            isSyncing: false
          })

          return { pulled, pushed }
        } catch (err: any) {
          set({ syncError: err.message, isSyncing: false })
          throw err
        }
      },

      syncWatchHistory: async () => {
        const { isConnected } = useConnectionStore.getState()
        if (!isConnected) {
          throw new Error('Not connected to desktop')
        }

        set({ isSyncing: true, syncError: null })
        let pulled = 0
        let pushed = 0

        try {
          // 1. Push pending watches to desktop
          const { pendingWatches, lastHistorySync } = get()
          const unsyncedWatches = pendingWatches.filter(w => !w.synced)

          if (unsyncedWatches.length > 0) {
            const result = await api.syncWatchHistoryToDesktop(
              unsyncedWatches.map(w => ({ mediaId: w.mediaId, viewedAt: w.viewedAt }))
            )
            pushed = result.synced

            // Mark as synced and clean up old entries
            const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000
            set({
              pendingWatches: pendingWatches
                .map(w => ({ ...w, synced: true }))
                .filter(w => w.viewedAt > oneDayAgo) // Keep only last 24 hours
            })
          }

          // 2. Pull watch history from desktop (since last sync)
          const desktopHistory = await api.getDesktopWatchHistory(lastHistorySync)
          pulled = desktopHistory.count

          set({
            lastHistorySync: Date.now(),
            isSyncing: false
          })

          return { pulled, pushed }
        } catch (err: any) {
          set({ syncError: err.message, isSyncing: false })
          throw err
        }
      },

      syncAll: async () => {
        const { syncFavorites, syncWatchHistory } = get()

        set({ isSyncing: true, syncError: null })

        try {
          const [favorites, history] = await Promise.all([
            syncFavorites().catch(err => ({ pulled: 0, pushed: 0, error: err.message })),
            syncWatchHistory().catch(err => ({ pulled: 0, pushed: 0, error: err.message }))
          ])

          set({
            lastFullSync: Date.now(),
            isSyncing: false
          })

          return { favorites, history }
        } catch (err: any) {
          set({ syncError: err.message, isSyncing: false })
          throw err
        }
      },

      clearPending: () => {
        set({
          pendingWatches: [],
          pendingFavoriteChanges: []
        })
      },

      setAutoSync: (enabled: boolean) => {
        set({ autoSyncEnabled: enabled })
      }
    }),
    {
      name: 'vault-sync',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        lastFavoritesSync: state.lastFavoritesSync,
        lastHistorySync: state.lastHistorySync,
        lastFullSync: state.lastFullSync,
        pendingWatches: state.pendingWatches,
        pendingFavoriteChanges: state.pendingFavoriteChanges,
        autoSyncEnabled: state.autoSyncEnabled
      })
    }
  )
)

// Auto-sync when connected
let syncInterval: ReturnType<typeof setInterval> | null = null

export function startAutoSync() {
  if (syncInterval) return

  syncInterval = setInterval(async () => {
    const { autoSyncEnabled, isSyncing, syncAll } = useSyncStore.getState()
    const { isConnected } = useConnectionStore.getState()

    if (autoSyncEnabled && isConnected && !isSyncing) {
      try {
        await syncAll()
        console.log('[Sync] Auto-sync completed')
      } catch (err) {
        console.warn('[Sync] Auto-sync failed:', err)
      }
    }
  }, 60000) // Sync every minute
}

export function stopAutoSync() {
  if (syncInterval) {
    clearInterval(syncInterval)
    syncInterval = null
  }
}
