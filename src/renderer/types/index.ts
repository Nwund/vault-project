// File: src/renderer/types/index.ts
// Shared type definitions for the Vault renderer

export type MediaType = 'video' | 'image' | 'gif'

export type MediaRow = {
  id: string
  path: string
  type: MediaType
  filename?: string
  ext?: string
  size?: number          // File size in bytes
  sizeBytes?: number     // Alias for size (used by some components)
  mtimeMs?: number       // File modification time
  addedAt?: number       // When added to vault
  durationSec?: number | null
  thumbPath?: string | null
  width?: number | null
  height?: number | null
  hashSha256?: string | null
  phash?: string | null
}

export type TagRow = { id: string; name: string; count?: number }

export type MarkerRow = {
  id: string
  mediaId: string
  timeSec: number
  title: string
}

export type PlaylistRow = { id: string; name: string; createdAt?: number; isSmart?: number }

export type MediaStatsRow = {
  mediaId: string
  rating?: number | null
  viewCount?: number
  oCount?: number
  lastViewedAt?: number | null
  progressSec?: number | null
}

export type CaptionPreset = {
  id: string
  name: string
  fontFamily: string
  fontSize: number
  fontColor: string
  fontWeight: 'normal' | 'bold' | 'bolder'
  textShadow: boolean
  shadowColor: string
  strokeEnabled: boolean
  strokeColor: string
  strokeWidth: number
  backgroundColor: string
  backgroundOpacity: number
  textTransform: 'none' | 'uppercase' | 'lowercase'
  position: 'top' | 'bottom' | 'both'
}

// Goon word pack types
export type GoonWordPackId = 'praise' | 'humiliation' | 'insult' | 'kink' | 'goon' | 'mommy' | 'brat' | 'pervert' | 'encouragement' | 'dirty' | 'denial' | 'worship' | 'seduction'

export interface GoonWordsSettings {
  enabled: boolean
  enabledPacks: GoonWordPackId[]
  customWords: string[]
  fontSize: number
  fontFamily: string
  fontColor: string
  glowColor: string
  frequency: number
  duration: number
  randomRotation: boolean
  intensity: number
}

export interface VisualEffectsSettings {
  enabled: boolean
  sparkles: boolean
  bokeh: boolean
  starfield: boolean
  filmGrain: boolean
  dreamyHaze: boolean
  crtCurve: boolean
  crtIntensity: number
  crtRgbSubpixels: boolean
  crtChromaticAberration: boolean
  crtScreenFlicker: boolean
  crtGlitchGif: number | null
  tvBorder: boolean
  tvBorderGlass: boolean
  tvBorderGlassOpacity: number
  tvBorderPadding: number
  tvBorderStyle: 'classic' | 'modern' | 'retro' | 'minimal'
  pipBoy: boolean
  pipBoyColor: 'green' | 'amber' | 'blue' | 'white'
  pipBoyIntensity: number
  heatLevel: number
  goonWords: GoonWordsSettings
  // New ambient overlays
  hearts: boolean
  rain: boolean
  glitch: boolean
  bubbles: boolean
  matrix: boolean
  confetti: boolean
}

export interface GoonStats {
  totalSessions: number
  totalTimeGooning: number
  longestSession: number
  averageSessionLength: number
  totalEdges: number
  edgesThisSession: number
  longestEdge: number
  averageEdgeTime: number
  totalOrgasms: number
  orgasmsThisWeek: number
  orgasmsThisMonth: number
  ruinedOrgasms: number
  totalVideosWatched: number
  uniqueVideosWatched: number
  favoriteCategory: string
  mostWatchedVideoId: string | null
  totalWatchTime: number
  currentStreak: number
  longestStreak: number
  lastSessionDate: number | null
  playlistsCreated: number
  tagsAssigned: number
  ratingsGiven: number
  nightOwlSessions: number
  earlyBirdSessions: number
  weekendSessionsThisWeekend: number
  goonWallSessions: number
  goonWallMaxTiles: number
  goonWallTimeMinutes: number
  goonWallShuffles: number
  watchedVideoIds: string[]
  achievements: string[]
  activityHeatmap: Record<string, number>
}

export interface SoundSettings {
  enabled: boolean
  volume: number
  uiSoundsEnabled: boolean
  voiceSoundsEnabled: boolean
  ambienceEnabled: boolean
  ambienceTrack: 'none' | 'soft_moans' | 'breathing' | 'heartbeat' | 'rain' | 'custom'
  ambienceVolume: number
}

// Session analytics returned from sessionHistory:getAnalytics
export type SessionAnalytics = {
  totalSessions: number
  totalDuration: number
  avgSessionDuration: number
  avgMediaPerSession: number
  mostActiveHour: number
  mostActiveDay: string
}

// Result from media.optimizeNames API
export type OptimizeNamesResult = {
  success: boolean
  optimized: number
  skipped: number
  failed: number
  error?: string
}

export type VaultSettings = {
  uiSoundsEnabled?: boolean
  hasSeenWelcome?: boolean
  library?: {
    mediaDirs?: string[]
    cacheDir?: string
    thumbnailQuality?: 'low' | 'medium' | 'high'
    previewQuality?: 'low' | 'medium' | 'high'
    scanOnStartup?: boolean
    watchForNewFiles?: boolean
    cacheSizeLimitMB?: number
    disableHoverPreviews?: boolean
    maxConcurrentVideos?: number
    memoryCacheSize?: number
    preloadMargin?: number
  }
  appearance?: {
    themeId?: string
    thumbnailSize?: 'small' | 'medium' | 'large'
    colorBlindMode?: 'none' | 'protanopia' | 'deuteranopia' | 'tritanopia' | 'highContrast'
    fontSize?: 'small' | 'medium' | 'large'
    fontStyle?: 'default' | 'degrading' | '80s-hacker' | 'perverse' | 'neon' | 'retro' | 'gothic'
    animationSpeed?: 'none' | 'reduced' | 'full'
    accentColor?: string
    compactMode?: boolean
    reduceAnimations?: boolean
  }
  playback?: {
    defaultVolume?: number
    autoplayNext?: boolean
    loopSingle?: boolean
    skipIntroSeconds?: number
    defaultPlaybackSpeed?: number
    hardwareAcceleration?: boolean
    muteByDefault?: boolean
    lowQualityMode?: boolean
    defaultResolution?: string
    lowQualityIntensity?: number
  }
  privacy?: {
    passwordEnabled?: boolean
    passwordHash?: string | null
    autoLockMinutes?: number
    hideFromTaskbar?: boolean
    panicKey?: string
    panicKeyEnabled?: boolean
    incognitoMode?: boolean
    clearOnExit?: boolean
  }
  ui?: {
    themeId?: string
    animations?: boolean
  }
  goonwall?: {
    tileCount?: number
    tileMinPx?: number
    layout?: 'mosaic' | 'grid'
    intervalSec?: 0 | 20 | 30 | 45 | 60 | 90 | 120 // 0 = disabled
    muted?: boolean
    showHud?: boolean
    randomClimax?: boolean
    countdownDuration?: number
    startAtClimaxPoint?: boolean // Start videos at 70-80% through
    visualEffects?: {
      vignetteIntensity?: number
      saturationBoost?: number
      contrastBoost?: number
      heatOverlay?: boolean
    }
  }
  captions?: {
    enabled: boolean
    defaultPresetId: string | null
    presets: CaptionPreset[]
    customFonts: string[]
    showCaptionBars: boolean
    barStyle: 'solid' | 'gradient' | 'transparent'
  }
  blacklist?: {
    enabled: boolean
    tags: string[]
    mediaIds: string[]
  }
  ai?: {
    veniceApiKey?: string
    tier2Enabled?: boolean
    protectedTags?: string[]
  }
  data?: {
    lastBackupDate?: number | null
    autoBackupEnabled?: boolean
    autoBackupIntervalDays?: number
  }
  visualEffects?: VisualEffectsSettings
  goonStats?: GoonStats
  sound?: SoundSettings
  performance?: {
    maxMemoryMB?: number
    thumbnailCacheSize?: number
    videoConcurrency?: number
    lowMemoryMode?: boolean
  }
}

// Global Task tracking
export type GlobalTask = {
  id: string
  name: string
  progress: number // 0-100
  status: string
  startedAt: number
}

// Toast notifications
export type ToastType = 'success' | 'error' | 'info' | 'warning'
export type Toast = {
  id: string
  type: ToastType
  message: string
  duration?: number
}

// Context menu state
export type ContextMenuState = {
  visible: boolean
  x: number
  y: number
  mediaId: string | null
  mediaPath: string | null
  mediaType: MediaType | null
  mediaData?: MediaRow | null
}

// API result type helper - handles both array and { items: T[] } responses
export type ApiListResult<T> = T[] | { items?: T[]; media?: T[] }

// Extract items from API response that may be array or object with items/media property
export function extractItems<T>(result: ApiListResult<T>): T[] {
  if (Array.isArray(result)) return result
  return (result as { items?: T[]; media?: T[] })?.items ?? (result as { items?: T[]; media?: T[] })?.media ?? []
}
