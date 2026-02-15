// File: vault-mobile/stores/favorites.ts
// Favorites state management with local persistence

import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import AsyncStorage from '@react-native-async-storage/async-storage'

export interface FavoriteItem {
  id: string
  filename: string
  type: 'video' | 'image' | 'gif'
  durationSec?: number
  hasThumb: boolean
  addedAt: number
}

interface FavoritesState {
  items: FavoriteItem[]

  // Actions
  addFavorite: (item: Omit<FavoriteItem, 'addedAt'>) => void
  removeFavorite: (id: string) => void
  isFavorite: (id: string) => boolean
  toggleFavorite: (item: Omit<FavoriteItem, 'addedAt'>) => boolean
  clearAll: () => void
}

export const useFavoritesStore = create<FavoritesState>()(
  persist(
    (set, get) => ({
      items: [],

      addFavorite: (item) => {
        const { items } = get()
        if (items.some(f => f.id === item.id)) return

        set({
          items: [
            { ...item, addedAt: Date.now() },
            ...items,
          ],
        })
      },

      removeFavorite: (id) => {
        set({
          items: get().items.filter(item => item.id !== id),
        })
      },

      isFavorite: (id) => {
        return get().items.some(item => item.id === id)
      },

      toggleFavorite: (item) => {
        const { items, addFavorite, removeFavorite } = get()
        const isFav = items.some(f => f.id === item.id)

        if (isFav) {
          removeFavorite(item.id)
          return false
        } else {
          addFavorite(item)
          return true
        }
      },

      clearAll: () => {
        set({ items: [] })
      },
    }),
    {
      name: 'vault-favorites',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
)
