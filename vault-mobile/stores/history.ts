// File: vault-mobile/stores/history.ts
// Watch history state management with local persistence

import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import AsyncStorage from '@react-native-async-storage/async-storage'

export interface HistoryItem {
  id: string
  filename: string
  type: 'video' | 'image' | 'gif'
  durationSec?: number
  hasThumb: boolean
  watchedAt: number
  progress?: number // 0-1 for videos (percentage watched)
}

interface HistoryState {
  items: HistoryItem[]
  maxItems: number

  // Actions
  addToHistory: (item: Omit<HistoryItem, 'watchedAt'>) => void
  updateProgress: (id: string, progress: number) => void
  removeFromHistory: (id: string) => void
  getItem: (id: string) => HistoryItem | undefined
  clearHistory: () => void
}

export const useHistoryStore = create<HistoryState>()(
  persist(
    (set, get) => ({
      items: [],
      maxItems: 100, // Keep last 100 items

      addToHistory: (item) => {
        const { items, maxItems } = get()

        // Remove existing entry if present (will re-add at top)
        const filtered = items.filter(h => h.id !== item.id)

        // Add to beginning, keeping max limit
        const updated = [
          { ...item, watchedAt: Date.now() },
          ...filtered,
        ].slice(0, maxItems)

        set({ items: updated })
      },

      updateProgress: (id, progress) => {
        set({
          items: get().items.map(item =>
            item.id === id ? { ...item, progress, watchedAt: Date.now() } : item
          ),
        })
      },

      removeFromHistory: (id) => {
        set({
          items: get().items.filter(item => item.id !== id),
        })
      },

      getItem: (id) => {
        return get().items.find(item => item.id === id)
      },

      clearHistory: () => {
        set({ items: [] })
      },
    }),
    {
      name: 'vault-history',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
)
