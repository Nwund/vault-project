// File: vault-mobile/stores/library.ts
// Library state management

import { create } from 'zustand'
import { api } from '@/services/api'
import { getErrorMessage } from '@/utils'

interface MediaItem {
  id: string
  filename: string
  type: 'video' | 'image' | 'gif'
  durationSec?: number
  sizeBytes?: number
  hasThumb: boolean
  tags?: string[]
}

type SortOption = 'newest' | 'oldest' | 'name' | 'size' | 'duration' | 'random'

interface LibraryState {
  items: MediaItem[]
  isLoading: boolean
  hasMore: boolean
  page: number
  totalCount: number // Total items on server
  error: string | null

  // Filters
  searchQuery: string
  typeFilter: 'all' | 'video' | 'image' | 'gif'
  tagFilter: string[]
  sortBy: SortOption

  // Actions
  fetchLibrary: (page?: number) => Promise<void>
  refreshLibrary: () => Promise<void>
  setSearchQuery: (query: string) => void
  setTypeFilter: (type: 'all' | 'video' | 'image' | 'gif') => void
  setTagFilter: (tags: string[]) => void
  setSortBy: (sort: SortOption) => void
  clearFilters: () => void
  getItemIndex: (id: string) => number
  getAdjacentItems: (id: string) => { prev: MediaItem | null; next: MediaItem | null }
}

export const useLibraryStore = create<LibraryState>((set, get) => ({
  items: [],
  isLoading: false,
  hasMore: true,
  page: 1,
  totalCount: 0,
  error: null,

  searchQuery: '',
  typeFilter: 'all',
  tagFilter: [],
  sortBy: 'newest',

  fetchLibrary: async (page = 1) => {
    const { searchQuery, typeFilter, tagFilter, sortBy, items } = get()

    set({ isLoading: true, error: null })

    try {
      const result = await api.getLibrary({
        page,
        limit: 50,
        search: searchQuery || undefined,
        type: typeFilter !== 'all' ? typeFilter : undefined,
        tags: tagFilter.length > 0 ? tagFilter : undefined,
        sort: sortBy,
      })

      const newItems = result.items || []

      set({
        items: page === 1 ? newItems : [...items, ...newItems],
        page,
        hasMore: result.hasMore ?? newItems.length === 50,
        totalCount: result.totalCount ?? get().totalCount,
        isLoading: false,
      })
    } catch (err) {
      set({
        error: getErrorMessage(err),
        isLoading: false,
      })
    }
  },

  refreshLibrary: async () => {
    set({ page: 1, items: [], hasMore: true })
    await get().fetchLibrary(1)
  },

  setSearchQuery: (query) => {
    set({ searchQuery: query, page: 1, items: [], hasMore: true })
    get().fetchLibrary(1)
  },

  setTypeFilter: (type) => {
    set({ typeFilter: type, page: 1, items: [], hasMore: true })
    get().fetchLibrary(1)
  },

  setTagFilter: (tags) => {
    set({ tagFilter: tags, page: 1, items: [], hasMore: true })
    get().fetchLibrary(1)
  },

  setSortBy: (sort) => {
    set({ sortBy: sort, page: 1, items: [], hasMore: true })
    get().fetchLibrary(1)
  },

  clearFilters: () => {
    set({
      searchQuery: '',
      typeFilter: 'all',
      tagFilter: [],
      sortBy: 'newest',
      page: 1,
      items: [],
      hasMore: true,
    })
    get().fetchLibrary(1)
  },

  getItemIndex: (id) => {
    return get().items.findIndex(item => item.id === id)
  },

  getAdjacentItems: (id) => {
    const { items } = get()
    const index = items.findIndex(item => item.id === id)
    return {
      prev: index > 0 ? items[index - 1] : null,
      next: index < items.length - 1 ? items[index + 1] : null,
    }
  },
}))
