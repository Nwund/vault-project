// File: vault-mobile/constants/index.ts
// Export all constants

export { colors, type ColorKey } from './colors'
export { spacing, type SpacingKey } from './spacing'

// App configuration
export const config = {
  // API
  defaultTimeout: 10000,
  maxRetries: 3,

  // Pagination
  defaultPageSize: 50,
  maxPageSize: 100,

  // Cache
  thumbCacheMaxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  shareCacheMaxAge: 24 * 60 * 60 * 1000, // 1 day

  // UI
  debounceDelay: 300,
  animationDuration: 200,
  longPressDuration: 300,

  // History
  maxHistoryItems: 100,

  // Search
  minSearchLength: 2,
  maxSearchHistory: 10,

  // Downloads
  maxConcurrentDownloads: 2,

  // Version
  version: '1.0.0',
  buildDate: '2026-02-14',
} as const
