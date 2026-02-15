// ===============================
// File: src/main/settings.ts
// Comprehensive Settings System
// ===============================
import Store from 'electron-store'
import os from 'node:os'
import path from 'node:path'

// ─────────────────────────────────────────────────────────────────────────────
// TYPE DEFINITIONS
// ─────────────────────────────────────────────────────────────────────────────

// Original themes
export type ClassicThemeId =
  | 'obsidian'
  | 'moonlight'
  | 'ember'
  | 'velvet'
  | 'noir'
  | 'neon-dreams'
  | 'champagne'
  | 'rose-gold'
  | 'midnight-garden'
  | 'sapphire'

// Hypersexual goon themes
export type GoonThemeId =
  | 'afterglow'      // Post-orgasm bliss - warm pinks
  | 'edgelands'      // Perpetual almost-there - throbbing purple
  | 'red-room'       // Dominant, intense - crimson
  | 'midnight-velvet' // Luxurious darkness - deep plum
  | 'neon-lust'      // Cyberpunk brothel - hot pink/cyan
  | 'honeypot'       // Sweet, sticky, addictive - gold
  | 'sinners-paradise' // Hellfire and pleasure - orange/red
  | 'wet-dreams'     // Dreamy, fluid, surreal - indigo
  | 'flesh'          // Raw, primal, carnal - skin tones
  | 'void'           // Total focus - pure black

export type ThemeId = ClassicThemeId | GoonThemeId

export type GoonWallLayout = 'grid' | 'mosaic'
export type GoonWallTransition = 'crossfade' | 'cut' | 'slide' | 'zoom' | 'glitch' | 'melt' | 'swipe'
export type ShuffleInterval = 10 | 20 | 30 | 40 | 50 | 60


// ─────────────────────────────────────────────────────────────────────────────
// SESSION MODES
// ─────────────────────────────────────────────────────────────────────────────

export type SessionModeId =
  | 'quick-release'
  | 'edge-training'
  | 'hypno-goon'
  | 'sensory-overload'
  | 'slow-burn'
  | 'porn-roulette'
  | 'custom'

export interface SessionMode {
  id: SessionModeId
  name: string
  description: string
  icon: string
  settings: {
    goonwall: Partial<GoonwallSettings>
    edgeTimer?: {
      enabled: boolean
      interval: number
      action: 'pause' | 'shuffle' | 'minimize' | 'cooldown'
    }
    visualEffects?: {
      bloom?: number
      vignette?: number
      saturation?: number
      contrast?: number
    }
    suggestedDuration: number | 'until_done'
    soundtrack?: string
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GOON STATS & ACHIEVEMENTS
// ─────────────────────────────────────────────────────────────────────────────

export interface GoonStats {
  // Session stats
  totalSessions: number
  totalTimeGooning: number        // minutes
  longestSession: number          // minutes
  averageSessionLength: number

  // Edge stats
  totalEdges: number
  edgesThisSession: number
  longestEdge: number             // seconds held
  averageEdgeTime: number

  // Orgasm stats
  totalOrgasms: number
  orgasmsThisWeek: number
  orgasmsThisMonth: number
  ruinedOrgasms: number

  // Content stats
  totalVideosWatched: number
  uniqueVideosWatched: number
  favoriteCategory: string
  mostWatchedVideoId: string | null
  totalWatchTime: number

  // Streak stats
  currentStreak: number
  longestStreak: number
  lastSessionDate: number | null  // timestamp

  // Achievement tracking
  playlistsCreated: number
  tagsAssigned: number
  ratingsGiven: number
  nightOwlSessions: number        // sessions started between 00:00-05:00
  earlyBirdSessions: number       // sessions started between 05:00-06:00
  weekendSessionsThisWeekend: number
  goonWallSessions: number
  goonWallMaxTiles: number
  goonWallTimeMinutes: number
  goonWallShuffles: number
  // Watched video tracking
  watchedVideoIds: string[]

  // Feature usage tracking
  dlnaCastsCount: number
  dlnaDevicesUsed: string[]
  hardwareEncoderEnabled: boolean
  commandPaletteUsed: number
  doubleTapLikes: number
  feedSwipes: number
  overlaysEnabled: string[]
  sceneMarkersCreated: number
  captionsCreated: number
  playlistsExported: number
  playlistsImported: number

  // Achievement IDs unlocked
  achievements: string[]

  // Activity heatmap (date string -> intensity 0-4)
  activityHeatmap: Record<string, number>
}

export interface Achievement {
  id: string
  name: string
  description: string
  icon: string
  category: 'getting_started' | 'session' | 'edge' | 'edging' | 'content' | 'streak' | 'goonwall' | 'collection' | 'features' | 'social'
  target: number
  secret?: boolean
}

// ─────────────────────────────────────────────────────────────────────────────
// DAILY CHALLENGES
// ─────────────────────────────────────────────────────────────────────────────

export type DailyChallengeType =
  | 'watch_videos'      // Watch X videos
  | 'rate_items'        // Rate X items
  | 'tag_items'         // Tag X items
  | 'create_playlist'   // Create a playlist
  | 'goonwall_time'     // Spend X minutes in Goon Wall
  | 'edge_count'        // Edge X times
  | 'unique_videos'     // Watch X unique videos
  | 'add_to_playlist'   // Add X items to playlists

export interface DailyChallenge {
  id: string
  type: DailyChallengeType
  title: string
  description: string
  icon: string
  target: number
  progress: number
  completed: boolean
  rewardXp: number
}

export interface DailyChallengeState {
  date: string  // YYYY-MM-DD format
  challenges: DailyChallenge[]
  completedCount: number
  totalXp: number
  streak: number  // Days in a row completing all challenges
}

// Challenge templates - these define possible daily challenges
export const CHALLENGE_TEMPLATES: Omit<DailyChallenge, 'id' | 'progress' | 'completed'>[] = [
  { type: 'watch_videos', title: 'Video Viewer', description: 'Watch {target} videos', icon: '🎬', target: 5, rewardXp: 50 },
  { type: 'watch_videos', title: 'Binge Watcher', description: 'Watch {target} videos', icon: '📺', target: 10, rewardXp: 100 },
  { type: 'rate_items', title: 'Critic', description: 'Rate {target} items', icon: '⭐', target: 5, rewardXp: 40 },
  { type: 'rate_items', title: 'Reviewer', description: 'Rate {target} items', icon: '🌟', target: 10, rewardXp: 80 },
  { type: 'tag_items', title: 'Organizer', description: 'Tag {target} items', icon: '🏷️', target: 5, rewardXp: 40 },
  { type: 'tag_items', title: 'Curator', description: 'Tag {target} items', icon: '📋', target: 10, rewardXp: 80 },
  { type: 'create_playlist', title: 'Playlist Creator', description: 'Create a new playlist', icon: '📝', target: 1, rewardXp: 60 },
  { type: 'goonwall_time', title: 'Wall Watcher', description: 'Spend {target} minutes in Goon Wall', icon: '🧱', target: 10, rewardXp: 50 },
  { type: 'goonwall_time', title: 'Immersed', description: 'Spend {target} minutes in Goon Wall', icon: '🔥', target: 30, rewardXp: 100 },
  { type: 'edge_count', title: 'Edge Explorer', description: 'Edge {target} times', icon: '💫', target: 3, rewardXp: 60 },
  { type: 'edge_count', title: 'Edge Master', description: 'Edge {target} times', icon: '✨', target: 10, rewardXp: 120 },
  { type: 'unique_videos', title: 'Explorer', description: 'Watch {target} unique videos', icon: '🔍', target: 3, rewardXp: 40 },
  { type: 'add_to_playlist', title: 'Collector', description: 'Add {target} items to playlists', icon: '➕', target: 5, rewardXp: 50 },
]


// ─────────────────────────────────────────────────────────────────────────────
// SETTINGS STRUCTURE
// ─────────────────────────────────────────────────────────────────────────────

export interface LibrarySettings {
  mediaDirs: string[]
  cacheDir: string
  scanOnStartup: boolean
  watchForNewFiles: boolean
  thumbnailQuality: 'low' | 'medium' | 'high'
  cacheSizeLimitMB: number
}

export interface PlaybackSettings {
  defaultVolume: number // 0-1
  autoplayNext: boolean
  loopSingle: boolean
  skipIntroSeconds: number
  defaultPlaybackSpeed: number
  hardwareAcceleration: boolean
  muteByDefault: boolean
  lowQualityMode: boolean
  defaultResolution: 'original' | '1080p' | '720p' | '480p' | '360p'
  lowQualityIntensity: number // 1-5
}

export interface GoonwallSettings {
  defaultTileCount: number
  defaultLayout: GoonWallLayout
  defaultIntervalSec: ShuffleInterval
  audioLimit: number // How many tiles can play audio
  transitionStyle: GoonWallTransition
  transitionDurationMs: number
  preloadTiles: number
  maxResolution: '480p' | '720p' | '1080p' | 'source'
  showHud: boolean
  muteByDefault: boolean
  randomClimax: boolean // Auto-trigger climax randomly
  countdownDuration: number // Default countdown duration in seconds

  // Hypersexual enhancements
  overloadMode: {
    enabled: boolean
    intensity: 1 | 2 | 3 | 4 | 5  // How chaotic
  }

  hypnoMode: {
    enabled: boolean
    spiralOverlay: boolean
    pulseSync: boolean
    subliminalText: string[]
    textFrequency: number  // seconds between flashes
  }

  edgeTimer: {
    enabled: boolean
    interval: number  // seconds
    warningTime: number  // seconds before to warn
    action: 'pause' | 'shuffle' | 'minimize' | 'cooldown'
  }

  visualEffects: {
    vignetteIntensity: number  // 0-1
    bloomIntensity: number     // 0-1
    saturationBoost: number    // 0-2
    contrastBoost: number      // 0-2
    heatOverlay: boolean       // Glows redder the longer you watch
  }

  audioMix: {
    tilesWithAudio: number
    crossfade: boolean
    ambienceEnabled: boolean
    ambienceTrack: 'none' | 'soft_moans' | 'breathing' | 'heartbeat' | 'rain' | 'custom'
    ambienceVolume: number  // 0-1
  }
}


export type ColorBlindMode = 'none' | 'protanopia' | 'deuteranopia' | 'tritanopia' | 'high-contrast'

export type FontStyle = 'default' | 'degrading' | '80s-hacker' | 'perverse' | 'neon' | 'retro' | 'gothic'

export interface AppearanceSettings {
  themeId: ThemeId
  animationSpeed: 'none' | 'reduced' | 'full'
  accentColor: string
  sidebarPosition: 'left' | 'right'
  thumbnailSize: 'small' | 'medium' | 'large'
  fontSize: 'small' | 'medium' | 'large'
  fontStyle: FontStyle
  compactMode: boolean
  useSystemTheme: boolean
  colorBlindMode: ColorBlindMode
}

export interface PrivacySettings {
  passwordEnabled: boolean
  passwordHash: string | null
  autoLockMinutes: number
  hideFromTaskbar: boolean
  panicKey: string // e.g., "Escape" or "F12"
  panicKeyEnabled: boolean
  incognitoMode: boolean
  clearOnExit: boolean
}

export interface BlacklistSettings {
  enabled: boolean
  tags: string[] // Tags to hide content for
  mediaIds: string[] // Specific media IDs to blacklist
}

// Caption/Meme System Settings
export interface CaptionPreset {
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
  backgroundColor: string // for caption bars
  backgroundOpacity: number
  textTransform: 'none' | 'uppercase' | 'lowercase'
  position: 'top' | 'bottom' | 'both'
}

export interface CaptionSettings {
  enabled: boolean // Master caption mode toggle
  defaultPresetId: string | null
  presets: CaptionPreset[]
  customFonts: string[] // Imported font file paths
  showCaptionBars: boolean // Classic meme-style caption bars
  barStyle: 'solid' | 'gradient' | 'transparent'
}

export interface DataSettings {
  lastBackupDate: number | null
  autoBackupEnabled: boolean
  autoBackupIntervalDays: number
}

export interface PerformanceSettings {
  maxMemoryMB: number           // Max memory usage in MB (512, 1024, 2048, 4096)
  thumbnailCacheSize: number    // Number of thumbnails to cache (500, 1000, 2000, 5000)
  videoConcurrency: number      // Max concurrent video loads (1, 2, 4, 8)
  lowMemoryMode: boolean        // Reduce memory usage at cost of performance
}

export interface AISettings {
  veniceApiKey: string
  tier2Enabled: boolean
  protectedTags: string[]  // Tags that should never be deleted during cleanup
}

export interface SoundSettings {
  enabled: boolean
  volume: number           // 0-1
  uiSoundsEnabled: boolean
  voiceSoundsEnabled: boolean
  ambienceEnabled: boolean
  ambienceTrack: 'none' | 'soft_moans' | 'breathing' | 'heartbeat' | 'rain' | 'custom'
  ambienceVolume: number
}

export type GoonWordPackId = 'praise' | 'humiliation' | 'insult' | 'kink' | 'goon' | 'mommy' | 'brat' | 'pervert' | 'seduction' | 'dirty' | 'worship' | 'denial' | 'encouragement'

export interface GoonWordsSettings {
  enabled: boolean
  enabledPacks: GoonWordPackId[]
  customWords: string[]
  fontSize: number // 16-48
  fontFamily: string
  fontColor: string
  glowColor: string
  frequency: number // 1-10 (seconds between words)
  duration: number // 1-5 (seconds word is visible)
  randomRotation: boolean
  intensity: number // 0-10
}

export interface VisualEffectsSettings {
  enabled: boolean
  sparkles: boolean
  bokeh: boolean
  starfield: boolean
  filmGrain: boolean
  dreamyHaze: boolean
  crtCurve: boolean
  crtIntensity: number // 0-10 curve intensity
  crtRgbSubpixels: boolean // RGB subpixel simulation
  crtChromaticAberration: boolean // Color separation at edges
  crtScreenFlicker: boolean // Random brightness flicker
  heatLevel: number // 0-10 ambient heat level
  goonWords: GoonWordsSettings
  // New ambient overlays
  hearts: boolean
  rain: boolean
  glitch: boolean
  bubbles: boolean
  matrix: boolean
  confetti: boolean
}

// Mobile Sync Settings
export interface MobileSyncSettings {
  serverEnabled: boolean  // Auto-start sync server on app launch
  port: number            // Server port (default 8765)
}

export interface VaultSettings {
  library: LibrarySettings
  playback: PlaybackSettings
  goonwall: GoonwallSettings
  appearance: AppearanceSettings
  privacy: PrivacySettings
  blacklist: BlacklistSettings
  captions: CaptionSettings
  data: DataSettings
  sound: SoundSettings
  visualEffects: VisualEffectsSettings
  goonStats: GoonStats
  activeSessionMode: SessionModeId
  ai: AISettings  // AI Intelligence settings (Venice API, protected tags, etc.)
  performance: PerformanceSettings  // Memory and performance tuning
  mobileSync: MobileSyncSettings  // Mobile sync server settings
  hasSeenWelcome: boolean  // First-time welcome tutorial completed
  // Legacy support
  mediaDirs?: string[]
  cacheDir?: string
  ui?: { themeId?: string; animations?: boolean }
}

// ─────────────────────────────────────────────────────────────────────────────
// DEFAULT VALUES
// ─────────────────────────────────────────────────────────────────────────────

const defaultMediaDir = path.join(os.homedir(), 'Vault', 'Drop')
const defaultCacheDir = path.join(os.homedir(), 'Vault', 'Cache')

const DEFAULTS: VaultSettings = {
  library: {
    mediaDirs: [defaultMediaDir],
    cacheDir: defaultCacheDir,
    scanOnStartup: true,
    watchForNewFiles: true,
    thumbnailQuality: 'medium',
    cacheSizeLimitMB: 5000
  },
  playback: {
    defaultVolume: 0.7,
    autoplayNext: false,
    loopSingle: false,
    skipIntroSeconds: 0,
    defaultPlaybackSpeed: 1.0,
    hardwareAcceleration: true,
    muteByDefault: false,
    lowQualityMode: false,
    defaultResolution: 'original',
    lowQualityIntensity: 3
  },
  goonwall: {
    defaultTileCount: 9,
    defaultLayout: 'grid',
    defaultIntervalSec: 20,
    audioLimit: 2,
    transitionStyle: 'crossfade',
    transitionDurationMs: 500,
    preloadTiles: 3,
    maxResolution: '720p',
    showHud: true,
    muteByDefault: true,
    randomClimax: false,
    countdownDuration: 60,
    // Hypersexual enhancements
    overloadMode: {
      enabled: false,
      intensity: 3
    },
    hypnoMode: {
      enabled: false,
      spiralOverlay: false,
      pulseSync: false,
      subliminalText: ['GOON', 'EDGE', 'DEEPER', 'STROKE', 'LEAK', 'OBEY', 'SUBMIT'],
      textFrequency: 5
    },
    edgeTimer: {
      enabled: false,
      interval: 120,
      warningTime: 10,
      action: 'pause'
    },
    visualEffects: {
      vignetteIntensity: 0.3,
      bloomIntensity: 0.1,
      saturationBoost: 1.1,
      contrastBoost: 1.0,
      heatOverlay: true
    },
    audioMix: {
      tilesWithAudio: 2,
      crossfade: true,
      ambienceEnabled: false,
      ambienceTrack: 'none',
      ambienceVolume: 0.3
    }
  },
  // AI Intelligence settings
  ai: {
    veniceApiKey: '',
    tier2Enabled: false,
    protectedTags: [],  // Tags that should never be deleted during cleanup
  } as AISettings,
  appearance: {
    themeId: 'afterglow',  // Default to erotic theme
    animationSpeed: 'full',
    accentColor: '#ff6b9d',  // Pink accent for goon vibes
    sidebarPosition: 'left',
    thumbnailSize: 'medium',
    fontSize: 'medium',
    fontStyle: 'default',  // Options: default, degrading, 80s-hacker, perverse, neon, retro, gothic
    compactMode: false,
    useSystemTheme: false,
    colorBlindMode: 'none'  // Options: none, protanopia, deuteranopia, tritanopia, high-contrast
  },
  privacy: {
    passwordEnabled: false,
    passwordHash: null,
    autoLockMinutes: 0,
    hideFromTaskbar: false,
    panicKey: 'Escape',
    panicKeyEnabled: true,
    incognitoMode: false,
    clearOnExit: false
  },
  blacklist: {
    enabled: true,
    tags: [],
    mediaIds: []
  },
  captions: {
    enabled: false,
    defaultPresetId: 'default',
    presets: [
      {
        id: 'default',
        name: 'Classic Meme',
        fontFamily: 'Impact',
        fontSize: 48,
        fontColor: '#ffffff',
        fontWeight: 'bold',
        textShadow: false,
        shadowColor: '#000000',
        strokeEnabled: true,
        strokeColor: '#000000',
        strokeWidth: 2,
        backgroundColor: 'transparent',
        backgroundOpacity: 0,
        textTransform: 'uppercase',
        position: 'both'
      },
      {
        id: 'sissy',
        name: 'Sissy Pink',
        fontFamily: 'Arial',
        fontSize: 36,
        fontColor: '#ff69b4',
        fontWeight: 'bold',
        textShadow: true,
        shadowColor: '#000000',
        strokeEnabled: true,
        strokeColor: '#ffffff',
        strokeWidth: 1,
        backgroundColor: 'transparent',
        backgroundOpacity: 0,
        textTransform: 'none',
        position: 'both'
      },
      {
        id: 'degrading',
        name: 'Degrading',
        fontFamily: 'Arial Black',
        fontSize: 42,
        fontColor: '#ff0000',
        fontWeight: 'bolder',
        textShadow: true,
        shadowColor: '#000000',
        strokeEnabled: true,
        strokeColor: '#000000',
        strokeWidth: 2,
        backgroundColor: 'transparent',
        backgroundOpacity: 0,
        textTransform: 'uppercase',
        position: 'both'
      },
      {
        id: 'neon',
        name: 'Neon Glow',
        fontFamily: 'Arial',
        fontSize: 40,
        fontColor: '#00ffff',
        fontWeight: 'bold',
        textShadow: true,
        shadowColor: '#00ffff',
        strokeEnabled: true,
        strokeColor: '#ff00ff',
        strokeWidth: 2,
        backgroundColor: 'transparent',
        backgroundOpacity: 0,
        textTransform: 'uppercase',
        position: 'both'
      },
      {
        id: 'hypno',
        name: 'Hypno',
        fontFamily: 'Times New Roman',
        fontSize: 44,
        fontColor: '#9400d3',
        fontWeight: 'bold',
        textShadow: true,
        shadowColor: '#ff00ff',
        strokeEnabled: true,
        strokeColor: '#ffffff',
        strokeWidth: 1,
        backgroundColor: 'transparent',
        backgroundOpacity: 0,
        textTransform: 'lowercase',
        position: 'both'
      },
      {
        id: 'bimbo',
        name: 'Bimbo',
        fontFamily: 'Comic Sans MS',
        fontSize: 38,
        fontColor: '#ff1493',
        fontWeight: 'bold',
        textShadow: true,
        shadowColor: '#ffb6c1',
        strokeEnabled: true,
        strokeColor: '#ffffff',
        strokeWidth: 2,
        backgroundColor: 'transparent',
        backgroundOpacity: 0,
        textTransform: 'none',
        position: 'both'
      },
      {
        id: 'domme',
        name: 'Domme',
        fontFamily: 'Georgia',
        fontSize: 36,
        fontColor: '#8b0000',
        fontWeight: 'bold',
        textShadow: true,
        shadowColor: '#000000',
        strokeEnabled: true,
        strokeColor: '#ffd700',
        strokeWidth: 1,
        backgroundColor: 'transparent',
        backgroundOpacity: 0,
        textTransform: 'uppercase',
        position: 'both'
      },
      {
        id: 'edging',
        name: 'Edge Mode',
        fontFamily: 'Impact',
        fontSize: 46,
        fontColor: '#ff4500',
        fontWeight: 'bold',
        textShadow: true,
        shadowColor: '#ff0000',
        strokeEnabled: true,
        strokeColor: '#000000',
        strokeWidth: 3,
        backgroundColor: 'transparent',
        backgroundOpacity: 0,
        textTransform: 'uppercase',
        position: 'both'
      },
      {
        id: 'subliminal',
        name: 'Subliminal',
        fontFamily: 'Arial',
        fontSize: 28,
        fontColor: 'rgba(255,255,255,0.3)',
        fontWeight: 'normal',
        textShadow: false,
        shadowColor: 'transparent',
        strokeEnabled: false,
        strokeColor: 'transparent',
        strokeWidth: 0,
        backgroundColor: 'transparent',
        backgroundOpacity: 0,
        textTransform: 'lowercase',
        position: 'both'
      },
      {
        id: 'glitch',
        name: 'Glitch',
        fontFamily: 'Courier New',
        fontSize: 40,
        fontColor: '#00ff00',
        fontWeight: 'bold',
        textShadow: true,
        shadowColor: '#ff0000',
        strokeEnabled: true,
        strokeColor: '#0000ff',
        strokeWidth: 2,
        backgroundColor: 'transparent',
        backgroundOpacity: 0,
        textTransform: 'uppercase',
        position: 'both'
      },
      {
        id: 'retro',
        name: 'Retro 80s',
        fontFamily: 'Arial Black',
        fontSize: 44,
        fontColor: '#ff00ff',
        fontWeight: 'bold',
        textShadow: true,
        shadowColor: '#00ffff',
        strokeEnabled: true,
        strokeColor: '#ffff00',
        strokeWidth: 3,
        backgroundColor: 'transparent',
        backgroundOpacity: 0,
        textTransform: 'uppercase',
        position: 'both'
      },
      {
        id: 'elegant',
        name: 'Elegant',
        fontFamily: 'Georgia',
        fontSize: 36,
        fontColor: '#ffd700',
        fontWeight: 'normal',
        textShadow: true,
        shadowColor: '#000000',
        strokeEnabled: false,
        strokeColor: 'transparent',
        strokeWidth: 0,
        backgroundColor: 'transparent',
        backgroundOpacity: 0,
        textTransform: 'none',
        position: 'both'
      },
      {
        id: 'brutal',
        name: 'Brutal',
        fontFamily: 'Impact',
        fontSize: 52,
        fontColor: '#ff0000',
        fontWeight: 'bold',
        textShadow: true,
        shadowColor: '#000000',
        strokeEnabled: true,
        strokeColor: '#ffffff',
        strokeWidth: 4,
        backgroundColor: 'transparent',
        backgroundOpacity: 0,
        textTransform: 'uppercase',
        position: 'both'
      },
      {
        id: 'cute',
        name: 'Cute',
        fontFamily: 'Comic Sans MS',
        fontSize: 34,
        fontColor: '#ffb6c1',
        fontWeight: 'bold',
        textShadow: true,
        shadowColor: '#ff69b4',
        strokeEnabled: true,
        strokeColor: '#ffffff',
        strokeWidth: 2,
        backgroundColor: 'transparent',
        backgroundOpacity: 0,
        textTransform: 'none',
        position: 'both'
      },
      {
        id: 'dark',
        name: 'Dark Mode',
        fontFamily: 'Arial',
        fontSize: 38,
        fontColor: '#333333',
        fontWeight: 'bold',
        textShadow: true,
        shadowColor: '#000000',
        strokeEnabled: true,
        strokeColor: '#666666',
        strokeWidth: 2,
        backgroundColor: 'transparent',
        backgroundOpacity: 0,
        textTransform: 'uppercase',
        position: 'both'
      },
      {
        id: 'anime',
        name: 'Anime',
        fontFamily: 'Arial',
        fontSize: 36,
        fontColor: '#ffffff',
        fontWeight: 'bold',
        textShadow: true,
        shadowColor: '#ff69b4',
        strokeEnabled: true,
        strokeColor: '#000000',
        strokeWidth: 3,
        backgroundColor: 'transparent',
        backgroundOpacity: 0,
        textTransform: 'none',
        position: 'both'
      },
      {
        id: 'hentai',
        name: 'Hentai',
        fontFamily: 'Arial Black',
        fontSize: 40,
        fontColor: '#ff1493',
        fontWeight: 'bold',
        textShadow: true,
        shadowColor: '#9400d3',
        strokeEnabled: true,
        strokeColor: '#ffffff',
        strokeWidth: 2,
        backgroundColor: 'transparent',
        backgroundOpacity: 0,
        textTransform: 'uppercase',
        position: 'both'
      }
    ],
    customFonts: [],
    showCaptionBars: false,
    barStyle: 'solid'
  },
  data: {
    lastBackupDate: null,
    autoBackupEnabled: false,
    autoBackupIntervalDays: 7
  },
  sound: {
    enabled: true,
    volume: 0.5,
    uiSoundsEnabled: true,
    voiceSoundsEnabled: true,
    ambienceEnabled: false,
    ambienceTrack: 'none',
    ambienceVolume: 0.3
  },
  visualEffects: {
    enabled: true,
    sparkles: true,
    bokeh: false,
    starfield: false,
    filmGrain: false,
    dreamyHaze: false,
    crtCurve: false,
    crtIntensity: 5,
    crtRgbSubpixels: true,
    crtChromaticAberration: true,
    crtScreenFlicker: true,
    heatLevel: 0,
    goonWords: {
      enabled: false,
      enabledPacks: ['goon', 'kink'],
      customWords: [],
      fontSize: 32,
      fontFamily: 'system-ui',
      fontColor: '#ffffff',
      glowColor: '#ff6b9d',
      frequency: 5,
      duration: 3,
      randomRotation: true,
      intensity: 5
    },
    // New ambient overlays
    hearts: false,
    rain: false,
    glitch: false,
    bubbles: false,
    matrix: false,
    confetti: false
  },
  goonStats: {
    totalSessions: 0,
    totalTimeGooning: 0,
    longestSession: 0,
    averageSessionLength: 0,
    totalEdges: 0,
    edgesThisSession: 0,
    longestEdge: 0,
    averageEdgeTime: 0,
    totalOrgasms: 0,
    orgasmsThisWeek: 0,
    orgasmsThisMonth: 0,
    ruinedOrgasms: 0,
    totalVideosWatched: 0,
    uniqueVideosWatched: 0,
    favoriteCategory: '',
    mostWatchedVideoId: null,
    totalWatchTime: 0,
    currentStreak: 0,
    longestStreak: 0,
    lastSessionDate: null,
    playlistsCreated: 0,
    tagsAssigned: 0,
    ratingsGiven: 0,
    nightOwlSessions: 0,
    earlyBirdSessions: 0,
    weekendSessionsThisWeekend: 0,
    goonWallSessions: 0,
    goonWallMaxTiles: 0,
    goonWallTimeMinutes: 0,
    goonWallShuffles: 0,
    watchedVideoIds: [],
    // Feature usage tracking
    dlnaCastsCount: 0,
    dlnaDevicesUsed: [],
    hardwareEncoderEnabled: false,
    commandPaletteUsed: 0,
    doubleTapLikes: 0,
    feedSwipes: 0,
    overlaysEnabled: [],
    sceneMarkersCreated: 0,
    captionsCreated: 0,
    playlistsExported: 0,
    playlistsImported: 0,
    achievements: [],
    activityHeatmap: {}
  },
  activeSessionMode: 'custom',
  hasSeenWelcome: false,  // Show welcome tutorial on first launch
  performance: {
    maxMemoryMB: 2048,
    thumbnailCacheSize: 2000,
    videoConcurrency: 4,
    lowMemoryMode: false
  },
  mobileSync: {
    serverEnabled: false,  // Don't auto-start by default
    port: 8765
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// STORE INSTANCE
// ─────────────────────────────────────────────────────────────────────────────

export const settings = new Store<VaultSettings>({
  name: 'settings',
  defaults: DEFAULTS
})

// ─────────────────────────────────────────────────────────────────────────────
// GETTERS
// ─────────────────────────────────────────────────────────────────────────────

export function getSettings(): VaultSettings {
  const stored = settings.store as any

  // Migrate from old format if needed
  if (stored.mediaDirs && !stored.library) {
    return migrateOldSettings(stored)
  }

  // Deep merge with defaults to ensure all fields exist
  return deepMerge(DEFAULTS, stored) as VaultSettings
}

export function getMediaDirs(): string[] {
  const s = getSettings()
  return s.library?.mediaDirs ?? DEFAULTS.library.mediaDirs
}

export function getCacheDir(): string {
  const s = getSettings()
  return s.library?.cacheDir ?? DEFAULTS.library.cacheDir
}

export function getThemeId(): ThemeId {
  const s = getSettings()
  return s.appearance?.themeId ?? DEFAULTS.appearance.themeId
}

// ─────────────────────────────────────────────────────────────────────────────
// SETTERS
// ─────────────────────────────────────────────────────────────────────────────

export function updateSettings(patch: Partial<VaultSettings>): VaultSettings {
  const current = getSettings()
  const next = deepMerge(current, patch) as VaultSettings
  settings.store = next
  return next
}

export function updateLibrarySettings(patch: Partial<LibrarySettings>): VaultSettings {
  return updateSettings({ library: { ...getSettings().library, ...patch } })
}

export function updatePlaybackSettings(patch: Partial<PlaybackSettings>): VaultSettings {
  return updateSettings({ playback: { ...getSettings().playback, ...patch } })
}

export function updateGoonwallSettings(patch: Partial<GoonwallSettings>): VaultSettings {
  return updateSettings({ goonwall: { ...getSettings().goonwall, ...patch } })
}

export function updateAppearanceSettings(patch: Partial<AppearanceSettings>): VaultSettings {
  return updateSettings({ appearance: { ...getSettings().appearance, ...patch } })
}

export function updatePrivacySettings(patch: Partial<PrivacySettings>): VaultSettings {
  return updateSettings({ privacy: { ...getSettings().privacy, ...patch } })
}

export function updateBlacklistSettings(patch: Partial<BlacklistSettings>): VaultSettings {
  return updateSettings({ blacklist: { ...getSettings().blacklist, ...patch } })
}

export function addBlacklistTag(tag: string): VaultSettings {
  const current = getSettings().blacklist
  if (current.tags.includes(tag)) return getSettings()
  return updateSettings({ blacklist: { ...current, tags: [...current.tags, tag] } })
}

export function removeBlacklistTag(tag: string): VaultSettings {
  const current = getSettings().blacklist
  return updateSettings({ blacklist: { ...current, tags: current.tags.filter(t => t !== tag) } })
}

export function addBlacklistMedia(mediaId: string): VaultSettings {
  const current = getSettings().blacklist
  if (current.mediaIds.includes(mediaId)) return getSettings()
  return updateSettings({ blacklist: { ...current, mediaIds: [...current.mediaIds, mediaId] } })
}

export function removeBlacklistMedia(mediaId: string): VaultSettings {
  const current = getSettings().blacklist
  return updateSettings({ blacklist: { ...current, mediaIds: current.mediaIds.filter(id => id !== mediaId) } })
}

export function updateCaptionSettings(patch: Partial<CaptionSettings>): VaultSettings {
  return updateSettings({ captions: { ...getSettings().captions, ...patch } })
}

export function addCaptionPreset(preset: CaptionPreset): VaultSettings {
  const current = getSettings().captions
  // Remove existing preset with same ID if exists
  const filteredPresets = current.presets.filter(p => p.id !== preset.id)
  return updateSettings({ captions: { ...current, presets: [...filteredPresets, preset] } })
}

export function removeCaptionPreset(presetId: string): VaultSettings {
  const current = getSettings().captions
  // Don't allow removing the default preset
  if (presetId === 'default') return getSettings()
  return updateSettings({ captions: { ...current, presets: current.presets.filter(p => p.id !== presetId) } })
}

// Export caption presets as JSON
export function exportCaptionPresets(): { version: number; presets: CaptionPreset[]; exportedAt: string } {
  const settings = getSettings()
  return {
    version: 1,
    presets: settings.captions.presets,
    exportedAt: new Date().toISOString()
  }
}

// Import caption presets from JSON
export function importCaptionPresets(
  data: { version?: number; presets: CaptionPreset[] },
  mode: 'merge' | 'replace' = 'merge'
): { imported: number; total: number } {
  if (!data.presets || !Array.isArray(data.presets)) {
    throw new Error('Invalid preset data: missing presets array')
  }

  const current = getSettings().captions
  let newPresets: CaptionPreset[]

  if (mode === 'replace') {
    // Keep default preset, replace all others
    const defaultPreset = current.presets.find(p => p.id === 'default')
    newPresets = defaultPreset ? [defaultPreset, ...data.presets.filter(p => p.id !== 'default')] : data.presets
  } else {
    // Merge: add new presets, update existing ones (by ID)
    const presetMap = new Map(current.presets.map(p => [p.id, p]))
    for (const preset of data.presets) {
      presetMap.set(preset.id, preset)
    }
    newPresets = Array.from(presetMap.values())
  }

  updateSettings({ captions: { ...current, presets: newPresets } })

  return {
    imported: data.presets.length,
    total: newPresets.length
  }
}

export function updateDataSettings(patch: Partial<DataSettings>): VaultSettings {
  return updateSettings({ data: { ...getSettings().data, ...patch } })
}

export function updateAISettings(patch: Partial<AISettings>): VaultSettings {
  return updateSettings({ ai: { ...getSettings().ai, ...patch } })
}

export function getAISettings(): AISettings {
  return getSettings().ai
}

export function updateVisualEffectsSettings(patch: Partial<VisualEffectsSettings>): VaultSettings {
  return updateSettings({ visualEffects: { ...getSettings().visualEffects, ...patch } })
}

export function updateMobileSyncSettings(patch: Partial<MobileSyncSettings>): VaultSettings {
  return updateSettings({ mobileSync: { ...getSettings().mobileSync, ...patch } })
}

export function getMobileSyncSettings(): MobileSyncSettings {
  const s = getSettings()
  return s.mobileSync ?? { serverEnabled: false, port: 8765 }
}

export function setHasSeenWelcome(seen: boolean): VaultSettings {
  return updateSettings({ hasSeenWelcome: seen })
}

// Specific setters for common operations
export function setMediaDirs(dirs: string[]): void {
  updateLibrarySettings({ mediaDirs: [...new Set(dirs.filter(Boolean))] })
}

export function addMediaDir(dir: string): void {
  const current = getMediaDirs()
  if (!current.includes(dir)) {
    setMediaDirs([...current, dir])
  }
}

export function removeMediaDir(dir: string): void {
  const current = getMediaDirs()
  setMediaDirs(current.filter(d => d !== dir))
}

export function setCacheDir(dir: string): void {
  updateLibrarySettings({ cacheDir: dir })
}

export function setTheme(themeId: ThemeId): void {
  updateAppearanceSettings({ themeId })
}

export function resetSettings(): VaultSettings {
  settings.clear()
  return getSettings()
}

// Reset a specific settings section to defaults
export function resetSettingsSection(section: keyof VaultSettings): VaultSettings {
  const defaults = { ...DEFAULTS }
  if (section in defaults) {
    updateSettings({ [section]: (defaults as any)[section] })
  }
  return getSettings()
}

// ─────────────────────────────────────────────────────────────────────────────
// GOON STATS HELPERS
// ─────────────────────────────────────────────────────────────────────────────

export function getGoonStats(): GoonStats {
  return getSettings().goonStats
}

export function updateGoonStats(patch: Partial<GoonStats>): GoonStats {
  const current = getGoonStats()
  const next = { ...current, ...patch }
  updateSettings({ goonStats: next })
  return next
}

export function recordEdge(): GoonStats {
  const stats = getGoonStats()
  return updateGoonStats({
    totalEdges: stats.totalEdges + 1,
    edgesThisSession: stats.edgesThisSession + 1
  })
}

export function recordOrgasm(ruined: boolean = false): GoonStats {
  const stats = getGoonStats()
  const now = new Date()
  const dateKey = now.toISOString().split('T')[0]

  return updateGoonStats({
    totalOrgasms: stats.totalOrgasms + 1,
    orgasmsThisWeek: stats.orgasmsThisWeek + 1,
    orgasmsThisMonth: stats.orgasmsThisMonth + 1,
    ruinedOrgasms: ruined ? stats.ruinedOrgasms + 1 : stats.ruinedOrgasms,
    edgesThisSession: 0,  // Reset edges after orgasm
    activityHeatmap: {
      ...stats.activityHeatmap,
      [dateKey]: Math.min(4, (stats.activityHeatmap[dateKey] || 0) + 1)
    }
  })
}

export function startSession(): GoonStats {
  const stats = getGoonStats()
  const now = Date.now()
  const date = new Date(now)
  const hour = date.getHours()
  const dayOfWeek = date.getDay()
  const dateKey = date.toISOString().split('T')[0]

  // Calculate streak
  let newStreak = 1
  if (stats.lastSessionDate) {
    const lastDate = new Date(stats.lastSessionDate).toISOString().split('T')[0]
    const yesterday = new Date(now - 86400000).toISOString().split('T')[0]
    if (lastDate === yesterday) {
      newStreak = stats.currentStreak + 1
    } else if (lastDate === dateKey) {
      newStreak = stats.currentStreak  // Same day, keep streak
    }
  }

  // Track time-based sessions
  const isNightOwl = hour >= 0 && hour < 5
  const isEarlyBird = hour >= 5 && hour < 6
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6

  return updateGoonStats({
    totalSessions: stats.totalSessions + 1,
    edgesThisSession: 0,
    currentStreak: newStreak,
    longestStreak: Math.max(stats.longestStreak, newStreak),
    lastSessionDate: now,
    nightOwlSessions: stats.nightOwlSessions + (isNightOwl ? 1 : 0),
    earlyBirdSessions: stats.earlyBirdSessions + (isEarlyBird ? 1 : 0),
    weekendSessionsThisWeekend: isWeekend ? stats.weekendSessionsThisWeekend + 1 : stats.weekendSessionsThisWeekend,
    activityHeatmap: {
      ...stats.activityHeatmap,
      [dateKey]: Math.min(4, (stats.activityHeatmap[dateKey] || 0) + 1)
    }
  })
}

export function endSession(durationMinutes: number): GoonStats {
  const stats = getGoonStats()
  const newTotal = stats.totalTimeGooning + durationMinutes
  const newAverage = newTotal / stats.totalSessions

  return updateGoonStats({
    totalTimeGooning: newTotal,
    longestSession: Math.max(stats.longestSession, durationMinutes),
    averageSessionLength: Math.round(newAverage)
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// ACHIEVEMENT EVENT TRACKING
// ─────────────────────────────────────────────────────────────────────────────

export function recordPlaylistCreated(): GoonStats {
  const stats = getGoonStats()
  return updateGoonStats({
    playlistsCreated: stats.playlistsCreated + 1
  })
}

export function recordTagAssigned(): GoonStats {
  const stats = getGoonStats()
  return updateGoonStats({
    tagsAssigned: stats.tagsAssigned + 1
  })
}

export function recordRatingGiven(): GoonStats {
  const stats = getGoonStats()
  return updateGoonStats({
    ratingsGiven: stats.ratingsGiven + 1
  })
}

export function recordGoonWallSession(tileCount: number): GoonStats {
  const stats = getGoonStats()
  return updateGoonStats({
    goonWallSessions: stats.goonWallSessions + 1,
    goonWallMaxTiles: Math.max(stats.goonWallMaxTiles, tileCount)
  })
}

export function recordGoonWallTime(minutes: number): GoonStats {
  const stats = getGoonStats()
  return updateGoonStats({
    goonWallTimeMinutes: stats.goonWallTimeMinutes + minutes
  })
}

export function recordGoonWallShuffle(): GoonStats {
  const stats = getGoonStats()
  return updateGoonStats({
    goonWallShuffles: stats.goonWallShuffles + 1
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// STREAK PROTECTION
// ─────────────────────────────────────────────────────────────────────────────

export interface StreakStatus {
  currentStreak: number
  atRisk: boolean  // True if streak will be lost if no session today
  hoursRemaining: number  // Hours until streak is lost
  lastSessionDate: number | null
  hasSessionToday: boolean
}

export function getStreakStatus(): StreakStatus {
  const stats = getGoonStats()
  const now = Date.now()
  const today = new Date(now).toISOString().split('T')[0]

  // Check if user has had a session today
  let hasSessionToday = false
  if (stats.lastSessionDate) {
    const lastDate = new Date(stats.lastSessionDate).toISOString().split('T')[0]
    hasSessionToday = lastDate === today
  }

  // Calculate hours until midnight (when streak would be lost)
  const midnight = new Date(now)
  midnight.setHours(24, 0, 0, 0)
  const msUntilMidnight = midnight.getTime() - now
  const hoursRemaining = Math.max(0, msUntilMidnight / (1000 * 60 * 60))

  // Streak is at risk if:
  // 1. User has a streak > 0
  // 2. User hasn't had a session today
  // 3. Less than 4 hours until midnight (configurable warning window)
  const warningWindowHours = 4
  const atRisk = stats.currentStreak > 0 && !hasSessionToday && hoursRemaining <= warningWindowHours

  return {
    currentStreak: stats.currentStreak,
    atRisk,
    hoursRemaining: Math.round(hoursRemaining * 10) / 10,  // Round to 1 decimal
    lastSessionDate: stats.lastSessionDate,
    hasSessionToday
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PERSONAL RECORDS / LEADERBOARD
// ─────────────────────────────────────────────────────────────────────────────

export interface PersonalRecord {
  name: string
  value: number
  unit: string
  formattedValue: string
  icon: string
  achievedAt?: string  // Date string when record was set
}

export interface PersonalRecords {
  records: PersonalRecord[]
  weeklyStats: {
    sessionsThisWeek: number
    videosWatchedThisWeek: number
    edgesThisWeek: number
    timeThisWeek: number  // minutes
  }
}

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${Math.round(minutes)} min`
  const hours = Math.floor(minutes / 60)
  const mins = Math.round(minutes % 60)
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`
}

export function getPersonalRecords(): PersonalRecords {
  const stats = getGoonStats()

  const records: PersonalRecord[] = [
    {
      name: 'Longest Session',
      value: stats.longestSession,
      unit: 'minutes',
      formattedValue: formatDuration(stats.longestSession),
      icon: '⏱️'
    },
    {
      name: 'Longest Streak',
      value: stats.longestStreak,
      unit: 'days',
      formattedValue: `${stats.longestStreak} days`,
      icon: '🔥'
    },
    {
      name: 'Most Edges in Session',
      value: stats.longestEdge,
      unit: 'edges',
      formattedValue: `${stats.longestEdge}`,
      icon: '✨'
    },
    {
      name: 'Total Watch Time',
      value: stats.totalWatchTime,
      unit: 'minutes',
      formattedValue: formatDuration(stats.totalWatchTime),
      icon: '📺'
    },
    {
      name: 'Unique Videos Watched',
      value: stats.uniqueVideosWatched,
      unit: 'videos',
      formattedValue: `${stats.uniqueVideosWatched}`,
      icon: '🎬'
    },
    {
      name: 'Total Sessions',
      value: stats.totalSessions,
      unit: 'sessions',
      formattedValue: `${stats.totalSessions}`,
      icon: '🎯'
    },
    {
      name: 'Total Edges',
      value: stats.totalEdges,
      unit: 'edges',
      formattedValue: `${stats.totalEdges}`,
      icon: '💫'
    },
    {
      name: 'GoonWall Max Tiles',
      value: stats.goonWallMaxTiles,
      unit: 'tiles',
      formattedValue: `${stats.goonWallMaxTiles}`,
      icon: '🧱'
    }
  ]

  // Calculate weekly stats (based on activity heatmap)
  const now = new Date()
  const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
  let weeklyActivity = 0

  for (const [dateStr, intensity] of Object.entries(stats.activityHeatmap)) {
    const date = new Date(dateStr)
    if (date >= oneWeekAgo && date <= now) {
      weeklyActivity += intensity
    }
  }

  // Weekly stats are approximations based on available data
  const weeklyStats = {
    sessionsThisWeek: Math.min(stats.totalSessions, Math.ceil(weeklyActivity * 1.5)),
    videosWatchedThisWeek: Math.min(stats.totalVideosWatched, Math.ceil(weeklyActivity * 5)),
    edgesThisWeek: Math.min(stats.totalEdges, Math.ceil(weeklyActivity * 3)),
    timeThisWeek: Math.min(stats.totalTimeGooning, Math.ceil(weeklyActivity * 30))
  }

  return { records, weeklyStats }
}

export function checkAndUnlockAchievements(vaultStats?: { totalMedia?: number; playlistCount?: number; tagCount?: number }): string[] {
  const stats = getGoonStats()
  const newlyUnlocked: string[] = []

  for (const achievement of ACHIEVEMENTS) {
    if (stats.achievements.includes(achievement.id)) continue

    let unlocked = false

    switch (achievement.id) {
      // Getting Started (10)
      case 'first_import':
        unlocked = stats.totalVideosWatched >= 1 || stats.uniqueVideosWatched >= 1
        break
      case 'building_collection':
        unlocked = stats.uniqueVideosWatched >= 100
        break
      case 'organized':
        unlocked = stats.playlistsCreated >= 1
        break
      case 'tagged':
        unlocked = stats.tagsAssigned >= 10
        break
      case 'rated':
        unlocked = stats.ratingsGiven >= 10
        break
      case 'night_owl':
        unlocked = stats.nightOwlSessions >= 1
        break
      case 'early_bird':
        unlocked = stats.earlyBirdSessions >= 1
        break
      case 'weekend_warrior':
        unlocked = stats.weekendSessionsThisWeekend >= 5
        break
      case 'marathon':
        unlocked = stats.longestSession >= 120
        break
      case 'quick_release':
        unlocked = stats.averageSessionLength > 0 && stats.averageSessionLength <= 5
        break

      // Edging Mastery (10)
      case 'first_edge':
        unlocked = stats.totalEdges >= 1
        break
      case 'edge_apprentice':
        unlocked = stats.totalEdges >= 10
        break
      case 'edge_journeyman':
        unlocked = stats.totalEdges >= 50
        break
      case 'edge_master':
        unlocked = stats.totalEdges >= 100
        break
      case 'edge_god':
        unlocked = stats.edgesThisSession >= 100
        break
      case 'denial':
        unlocked = stats.longestEdge >= 30
        break
      case 'denial_king':
        unlocked = stats.longestEdge >= 60
        break
      case 'edge_marathon':
        unlocked = stats.edgesThisSession >= 10
        break
      case 'precision':
        unlocked = stats.longestEdge === 69
        break
      case 'control_freak':
        unlocked = stats.edgesThisSession >= 20 && stats.orgasmsThisWeek === 0
        break

      // Session Records (10)
      case 'dedicated':
        unlocked = stats.totalSessions >= 10
        break
      case 'regular':
        unlocked = stats.totalSessions >= 50
        break
      case 'devoted':
        unlocked = stats.totalSessions >= 100
        break
      case 'obsessed':
        unlocked = stats.totalSessions >= 500
        break
      case 'transcendent':
        unlocked = stats.totalTimeGooning >= 60000
        break
      case 'iron_will':
        unlocked = stats.currentStreak >= 7
        break
      case 'committed':
        unlocked = stats.currentStreak >= 30
        break
      case 'nice':
        unlocked = stats.currentStreak >= 69
        break
      case 'legendary':
        unlocked = stats.currentStreak >= 100
        break
      case 'stamina':
        unlocked = stats.longestSession >= 300
        break

      // Goon Wall (10)
      case 'wall_activated':
        unlocked = stats.goonWallSessions >= 1
        break
      case 'multi_tasker':
        unlocked = stats.goonWallMaxTiles >= 4
        break
      case 'overload':
        unlocked = stats.goonWallMaxTiles >= 9
        break
      case 'maximum':
        unlocked = stats.goonWallMaxTiles >= 16
        break
      case 'hypnotized':
        unlocked = stats.goonWallTimeMinutes >= 30
        break
      case 'wall_walker':
        unlocked = stats.goonWallSessions >= 100
        break
      case 'shuffle_master':
        unlocked = stats.goonWallShuffles >= 50
        break
      case 'audio_bliss':
        unlocked = stats.goonWallSessions >= 1 // Will be tracked when audio is enabled
        break
      case 'the_zone':
        unlocked = stats.goonWallTimeMinutes >= 60
        break
      case 'chaos_lover':
        unlocked = stats.goonWallMaxTiles >= 12 && stats.goonWallSessions >= 10
        break

      // Collection (10)
      case 'hoarder':
        unlocked = (vaultStats?.totalMedia ?? 0) >= 500
        break
      case 'archivist':
        unlocked = (vaultStats?.totalMedia ?? 0) >= 1000
        break
      case 'mega_library':
        unlocked = (vaultStats?.totalMedia ?? 0) >= 5000
        break
      case 'playlist_pro':
        unlocked = (vaultStats?.playlistCount ?? stats.playlistsCreated) >= 5
        break
      case 'tag_enthusiast':
        unlocked = stats.tagsAssigned >= 50
        break
      case 'tag_master':
        unlocked = stats.tagsAssigned >= 200
        break
      case 'critic':
        unlocked = stats.ratingsGiven >= 50
        break
      case 'connoisseur':
        unlocked = stats.uniqueVideosWatched >= 500
        break
      case 'binge_watcher':
        unlocked = stats.totalVideosWatched >= 100
        break
      case 'explorer':
        unlocked = stats.totalVideosWatched >= 1000
        break

      // Feature Discovery
      case 'tv_caster':
        unlocked = stats.dlnaCastsCount >= 1
        break
      case 'home_theater':
        unlocked = stats.dlnaCastsCount >= 10
        break
      case 'gpu_master':
        unlocked = stats.hardwareEncoderEnabled === true
        break
      case 'command_ninja':
        unlocked = stats.commandPaletteUsed >= 1
        break
      case 'power_user':
        unlocked = stats.commandPaletteUsed >= 50
        break
      case 'heart_giver':
        unlocked = stats.doubleTapLikes >= 1
        break
      case 'swipe_master':
        unlocked = stats.feedSwipes >= 100
        break
      case 'ambiance_lover':
        unlocked = (stats.overlaysEnabled?.length ?? 0) >= 3
        break
      case 'visual_artist':
        unlocked = (stats.overlaysEnabled?.length ?? 0) >= 6
        break
      case 'matrix_mode':
        unlocked = stats.overlaysEnabled?.includes?.('matrix') ?? false
        break

      // Social & Sharing
      case 'playlist_sharer':
        unlocked = stats.playlistsExported >= 1
        break
      case 'collector':
        unlocked = stats.playlistsImported >= 1
        break
      case 'cast_party':
        unlocked = (stats.dlnaDevicesUsed?.length ?? 0) >= 3
        break
      case 'scene_director':
        unlocked = stats.sceneMarkersCreated >= 10
        break
      case 'caption_creator':
        unlocked = stats.captionsCreated >= 5
        break
    }

    if (unlocked) {
      newlyUnlocked.push(achievement.id)
    }
  }

  if (newlyUnlocked.length > 0) {
    updateGoonStats({
      achievements: [...stats.achievements, ...newlyUnlocked]
    })
  }

  return newlyUnlocked
}

// ─────────────────────────────────────────────────────────────────────────────
// DAILY CHALLENGES FUNCTIONS
// ─────────────────────────────────────────────────────────────────────────────

const dailyChallengesStore = new Store<{ challenges: DailyChallengeState | null }>({
  name: 'daily-challenges',
  defaults: { challenges: null }
})

function getTodayDateString(): string {
  return new Date().toISOString().split('T')[0]
}

function generateDailyChallenges(): DailyChallenge[] {
  // Pick 3 random challenges from templates
  const shuffled = [...CHALLENGE_TEMPLATES].sort(() => Math.random() - 0.5)
  const selected = shuffled.slice(0, 3)

  return selected.map((template, i) => ({
    ...template,
    id: `daily-${getTodayDateString()}-${i}`,
    description: template.description.replace('{target}', String(template.target)),
    progress: 0,
    completed: false
  }))
}

export function getDailyChallenges(): DailyChallengeState {
  const stored = dailyChallengesStore.get('challenges')
  const today = getTodayDateString()

  // Check if we need to generate new challenges (new day or no challenges)
  if (!stored || stored.date !== today) {
    const previousStreak = stored?.completedCount === stored?.challenges?.length ? (stored?.streak || 0) : 0
    const newState: DailyChallengeState = {
      date: today,
      challenges: generateDailyChallenges(),
      completedCount: 0,
      totalXp: stored?.totalXp ?? 0,
      streak: previousStreak
    }
    dailyChallengesStore.set('challenges', newState)
    return newState
  }

  return stored
}

export function updateChallengeProgress(
  type: DailyChallengeType,
  increment: number = 1
): { updated: DailyChallengeState; newlyCompleted: DailyChallenge[] } {
  const state = getDailyChallenges()
  const newlyCompleted: DailyChallenge[] = []

  const updatedChallenges = state.challenges.map(challenge => {
    if (challenge.type !== type || challenge.completed) {
      return challenge
    }

    const newProgress = Math.min(challenge.progress + increment, challenge.target)
    const isNowCompleted = newProgress >= challenge.target

    if (isNowCompleted && !challenge.completed) {
      newlyCompleted.push({ ...challenge, progress: newProgress, completed: true })
    }

    return {
      ...challenge,
      progress: newProgress,
      completed: isNowCompleted
    }
  })

  const completedCount = updatedChallenges.filter(c => c.completed).length
  const xpEarned = newlyCompleted.reduce((sum, c) => sum + c.rewardXp, 0)

  // Update streak if all challenges completed
  const allCompleted = completedCount === updatedChallenges.length
  const wasAllCompleted = state.completedCount === state.challenges.length

  const updatedState: DailyChallengeState = {
    ...state,
    challenges: updatedChallenges,
    completedCount,
    totalXp: state.totalXp + xpEarned,
    streak: allCompleted && !wasAllCompleted ? state.streak + 1 : state.streak
  }

  dailyChallengesStore.set('challenges', updatedState)

  return { updated: updatedState, newlyCompleted }
}

export function resetDailyChallenges(): DailyChallengeState {
  const today = getTodayDateString()
  const newState: DailyChallengeState = {
    date: today,
    challenges: generateDailyChallenges(),
    completedCount: 0,
    totalXp: 0,
    streak: 0
  }
  dailyChallengesStore.set('challenges', newState)
  return newState
}

export function getGoonTheme(themeId: ThemeId): GoonTheme | null {
  if (themeId in GOON_THEMES) {
    return GOON_THEMES[themeId as GoonThemeId]
  }
  return null
}

export function setSessionMode(modeId: SessionModeId): VaultSettings {
  return updateSettings({ activeSessionMode: modeId })
}

export function getSessionMode(): SessionMode {
  const modeId = getSettings().activeSessionMode
  return SESSION_MODES.find(m => m.id === modeId) || SESSION_MODES[SESSION_MODES.length - 1]
}

// ─────────────────────────────────────────────────────────────────────────────
// UTILITIES
// ─────────────────────────────────────────────────────────────────────────────

function deepMerge(target: any, source: any): any {
  if (!source) return target
  if (!target) return source

  const result = { ...target }

  for (const key of Object.keys(source)) {
    const sourceValue = source[key]
    const targetValue = target[key]

    if (sourceValue === null || sourceValue === undefined) {
      continue
    }

    if (Array.isArray(sourceValue)) {
      result[key] = sourceValue
    } else if (typeof sourceValue === 'object' && typeof targetValue === 'object') {
      result[key] = deepMerge(targetValue, sourceValue)
    } else {
      result[key] = sourceValue
    }
  }

  return result
}

function migrateOldSettings(old: any): VaultSettings {
  const migrated: VaultSettings = {
    ...DEFAULTS,
    library: {
      ...DEFAULTS.library,
      mediaDirs: old.mediaDirs ?? DEFAULTS.library.mediaDirs,
      cacheDir: old.cacheDir ?? DEFAULTS.library.cacheDir
    },
    appearance: {
      ...DEFAULTS.appearance,
      themeId: (old.ui?.themeId ?? DEFAULTS.appearance.themeId) as ThemeId,
      animationSpeed: old.ui?.animations === false ? 'none' : 'full'
    },
    goonwall: {
      ...DEFAULTS.goonwall,
      ...old.goonwall
    }
  }

  // Save migrated settings
  settings.store = migrated
  return migrated
}

// ─────────────────────────────────────────────────────────────────────────────
// GOON THEMES
// ─────────────────────────────────────────────────────────────────────────────

export interface ThemeColors {
  background: string
  surface: string
  primary: string
  accent: string
  text: string
  textMuted: string
  glow?: string
  pulse?: string
  secondary?: string
}

export interface GoonTheme {
  id: GoonThemeId
  name: string
  description: string
  colors: ThemeColors
  vibe: string
}

export const GOON_THEMES: Record<GoonThemeId, GoonTheme> = {
  'afterglow': {
    id: 'afterglow',
    name: 'Afterglow',
    description: 'Warm, satisfied, basking in pleasure',
    colors: {
      background: '#1A0A14',
      surface: '#2D1420',
      primary: '#FF6B9D',
      accent: '#FFB4D1',
      text: '#FFE4EC',
      textMuted: '#CC8FA3',
      glow: 'rgba(255,107,157,0.4)'
    },
    vibe: 'satisfied'
  },
  'edgelands': {
    id: 'edgelands',
    name: 'Edgelands',
    description: 'Throbbing, desperate, on the edge',
    colors: {
      background: '#0D0511',
      surface: '#1A0B22',
      primary: '#9D4EDD',
      accent: '#E040FB',
      text: '#F3E5F5',
      textMuted: '#B388FF',
      pulse: 'rgba(224,64,251,0.5)'
    },
    vibe: 'desperate'
  },
  'red-room': {
    id: 'red-room',
    name: 'Red Room',
    description: 'Powerful, commanding, intense',
    colors: {
      background: '#0A0000',
      surface: '#1A0505',
      primary: '#DC143C',
      accent: '#FF2D2D',
      text: '#FFEBEE',
      textMuted: '#EF9A9A',
      glow: 'rgba(220,20,60,0.6)'
    },
    vibe: 'dominant'
  },
  'midnight-velvet': {
    id: 'midnight-velvet',
    name: 'Midnight Velvet',
    description: 'Rich, indulgent, sinfully soft',
    colors: {
      background: '#0A0510',
      surface: '#150A1A',
      primary: '#8E4585',
      accent: '#DA70D6',
      text: '#F8E8F8',
      textMuted: '#C9A0C9',
      glow: 'rgba(142,69,133,0.4)'
    },
    vibe: 'luxurious'
  },
  'neon-lust': {
    id: 'neon-lust',
    name: 'Neon Lust',
    description: 'Electric, dirty, cyberpunk desire',
    colors: {
      background: '#0A0A0F',
      surface: '#12121A',
      primary: '#FF00FF',
      secondary: '#00FFFF',
      accent: '#FF1493',
      text: '#FFFFFF',
      textMuted: '#B0B0B0',
      glow: 'rgba(255,0,255,0.6)'
    },
    vibe: 'electric'
  },
  'honeypot': {
    id: 'honeypot',
    name: 'Honeypot',
    description: 'Sweet, golden, irresistibly sticky',
    colors: {
      background: '#0F0A05',
      surface: '#1A1408',
      primary: '#FFB300',
      accent: '#FFD54F',
      text: '#FFF8E1',
      textMuted: '#FFCC80',
      glow: 'rgba(255,179,0,0.5)'
    },
    vibe: 'addictive'
  },
  'sinners-paradise': {
    id: 'sinners-paradise',
    name: "Sinner's Paradise",
    description: 'Hellfire and heavenly pleasure',
    colors: {
      background: '#0D0000',
      surface: '#1A0808',
      primary: '#FF4500',
      accent: '#FF8C00',
      text: '#FFF5EE',
      textMuted: '#FFAB91',
      glow: 'rgba(255,69,0,0.5)'
    },
    vibe: 'sinful'
  },
  'wet-dreams': {
    id: 'wet-dreams',
    name: 'Wet Dreams',
    description: 'Fluid, dreamy, surreal pleasure',
    colors: {
      background: '#050510',
      surface: '#0A0A1A',
      primary: '#5C6BC0',
      accent: '#7986CB',
      text: '#E8EAF6',
      textMuted: '#9FA8DA',
      glow: 'rgba(92,107,192,0.4)'
    },
    vibe: 'dreamy'
  },
  'flesh': {
    id: 'flesh',
    name: 'Flesh',
    description: 'Raw, primal, nothing but skin',
    colors: {
      background: '#0F0808',
      surface: '#1A1010',
      primary: '#E8A598',
      accent: '#FFAB91',
      text: '#FFF5F0',
      textMuted: '#FFCCBC',
      glow: 'rgba(232,165,152,0.4)'
    },
    vibe: 'primal'
  },
  'void': {
    id: 'void',
    name: 'Void',
    description: 'Nothing but you and the content',
    colors: {
      background: '#000000',
      surface: '#0A0A0A',
      primary: '#FFFFFF',
      accent: '#888888',
      text: '#FFFFFF',
      textMuted: '#666666',
      glow: 'rgba(255,255,255,0.1)'
    },
    vibe: 'focused'
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ACHIEVEMENTS
// ─────────────────────────────────────────────────────────────────────────────

export const ACHIEVEMENTS: Achievement[] = [
  // ═══════════════════════════════════════════════════════════════════════════
  // GETTING STARTED (10)
  // ═══════════════════════════════════════════════════════════════════════════
  { id: 'first_import', name: 'First Import', description: 'Add your first video to the vault', icon: '📥', category: 'getting_started', target: 1 },
  { id: 'building_collection', name: 'Building Collection', description: 'Have 100 items in your library', icon: '📚', category: 'getting_started', target: 100 },
  { id: 'organized', name: 'Organized', description: 'Create your first playlist', icon: '📋', category: 'getting_started', target: 1 },
  { id: 'tagged', name: 'Tagged', description: 'Add tags to 10 items', icon: '🏷️', category: 'getting_started', target: 10 },
  { id: 'rated', name: 'Rated', description: 'Rate 10 items', icon: '⭐', category: 'getting_started', target: 10 },
  { id: 'night_owl', name: 'Night Owl', description: 'Start a session after midnight', icon: '🦉', category: 'getting_started', target: 1 },
  { id: 'early_bird', name: 'Early Bird', description: 'Start a session before 6am', icon: '🌅', category: 'getting_started', target: 1 },
  { id: 'weekend_warrior', name: 'Weekend Warrior', description: 'Have 5 sessions in one weekend', icon: '🗓️', category: 'getting_started', target: 5 },
  { id: 'marathon', name: 'Marathon', description: 'Have a 2+ hour session', icon: '🏃', category: 'getting_started', target: 120 },
  { id: 'quick_release', name: 'Quick Release', description: 'Finish a session under 5 minutes', icon: '⚡', category: 'getting_started', target: 1 },

  // ═══════════════════════════════════════════════════════════════════════════
  // EDGING MASTERY (10)
  // ═══════════════════════════════════════════════════════════════════════════
  { id: 'first_edge', name: 'First Edge', description: 'Edge for the first time', icon: '🔥', category: 'edging', target: 1 },
  { id: 'edge_apprentice', name: 'Edge Apprentice', description: 'Total 10 lifetime edges', icon: '🔥', category: 'edging', target: 10 },
  { id: 'edge_journeyman', name: 'Edge Journeyman', description: 'Total 50 lifetime edges', icon: '🔥', category: 'edging', target: 50 },
  { id: 'edge_master', name: 'Edge Master', description: 'Total 100 lifetime edges', icon: '🔥', category: 'edging', target: 100 },
  { id: 'edge_god', name: 'Edge God', description: 'Edge 100 times in ONE session', icon: '👑', category: 'edging', target: 100 },
  { id: 'denial', name: 'Denial', description: 'Edge for 30 minutes without cumming', icon: '⛔', category: 'edging', target: 30 },
  { id: 'denial_king', name: 'Denial King', description: 'Edge for 60 minutes without cumming', icon: '👑', category: 'edging', target: 60 },
  { id: 'edge_marathon', name: 'Edge Marathon', description: '10 edges in one session', icon: '🏃', category: 'edging', target: 10 },
  { id: 'precision', name: 'Precision', description: 'Edge for exactly 69 seconds', icon: '🎯', category: 'edging', target: 69, secret: true },
  { id: 'control_freak', name: 'Control Freak', description: '20 edges without cumming', icon: '🧠', category: 'edging', target: 20 },

  // ═══════════════════════════════════════════════════════════════════════════
  // SESSION RECORDS (10)
  // ═══════════════════════════════════════════════════════════════════════════
  { id: 'dedicated', name: 'Dedicated', description: 'Complete 10 sessions', icon: '💪', category: 'session', target: 10 },
  { id: 'regular', name: 'Regular', description: 'Complete 50 sessions', icon: '📊', category: 'session', target: 50 },
  { id: 'devoted', name: 'Devoted', description: 'Complete 100 sessions', icon: '🙏', category: 'session', target: 100 },
  { id: 'obsessed', name: 'Obsessed', description: 'Complete 500 sessions', icon: '🤯', category: 'session', target: 500 },
  { id: 'transcendent', name: 'Transcendent', description: '1000 total hours gooning', icon: '🌟', category: 'session', target: 60000 },
  { id: 'iron_will', name: 'Iron Will', description: '7 day streak', icon: '💎', category: 'session', target: 7 },
  { id: 'committed', name: 'Committed', description: '30 day streak', icon: '📅', category: 'session', target: 30 },
  { id: 'nice', name: 'Nice.', description: '69 day streak', icon: '😏', category: 'session', target: 69, secret: true },
  { id: 'legendary', name: 'Legendary', description: '100 day streak', icon: '🏆', category: 'session', target: 100 },
  { id: 'stamina', name: 'Stamina', description: '5 hour single session', icon: '💦', category: 'session', target: 300 },

  // ═══════════════════════════════════════════════════════════════════════════
  // GOON WALL (10)
  // ═══════════════════════════════════════════════════════════════════════════
  { id: 'wall_activated', name: 'Wall Activated', description: 'Start your first Goon Wall session', icon: '🖥️', category: 'goonwall', target: 1 },
  { id: 'multi_tasker', name: 'Multi-Tasker', description: 'Run 4 tiles at once', icon: '📺', category: 'goonwall', target: 4 },
  { id: 'overload', name: 'Overload', description: 'Run 9 tiles at once', icon: '🌀', category: 'goonwall', target: 9 },
  { id: 'maximum', name: 'Maximum', description: 'Run 16 tiles at once', icon: '🤯', category: 'goonwall', target: 16 },
  { id: 'hypnotized', name: 'Hypnotized', description: '30 minutes in Goon Wall', icon: '🎯', category: 'goonwall', target: 30 },
  { id: 'wall_walker', name: 'Wall Walker', description: '100 Goon Wall sessions', icon: '🚶', category: 'goonwall', target: 100 },
  { id: 'shuffle_master', name: 'Shuffle Master', description: '50 shuffles in one session', icon: '🔀', category: 'goonwall', target: 50 },
  { id: 'audio_bliss', name: 'Audio Bliss', description: 'Watch with audio enabled', icon: '🔊', category: 'goonwall', target: 1 },
  { id: 'the_zone', name: 'The Zone', description: '1 hour Goon Wall session', icon: '🧘', category: 'goonwall', target: 60 },
  { id: 'chaos_lover', name: 'Chaos Lover', description: 'Use all tiles for 30 minutes', icon: '🌪️', category: 'goonwall', target: 30 },

  // ═══════════════════════════════════════════════════════════════════════════
  // COLLECTION (10)
  // ═══════════════════════════════════════════════════════════════════════════
  { id: 'hoarder', name: 'Hoarder', description: 'Have 500 items in your library', icon: '📦', category: 'collection', target: 500 },
  { id: 'archivist', name: 'Archivist', description: 'Have 1000 items in your library', icon: '🗄️', category: 'collection', target: 1000 },
  { id: 'mega_library', name: 'Mega Library', description: 'Have 5000 items in your library', icon: '🏛️', category: 'collection', target: 5000 },
  { id: 'playlist_pro', name: 'Playlist Pro', description: 'Create 5 playlists', icon: '📋', category: 'collection', target: 5 },
  { id: 'tag_enthusiast', name: 'Tag Enthusiast', description: 'Add tags to 50 items', icon: '🏷️', category: 'collection', target: 50 },
  { id: 'tag_master', name: 'Tag Master', description: 'Add tags to 200 items', icon: '🏷️', category: 'collection', target: 200 },
  { id: 'critic', name: 'Critic', description: 'Rate 50 items', icon: '⭐', category: 'collection', target: 50 },
  { id: 'connoisseur', name: 'Connoisseur', description: 'Watch 500 unique videos', icon: '🎬', category: 'collection', target: 500 },
  { id: 'binge_watcher', name: 'Binge Watcher', description: 'Watch 100 videos total', icon: '📺', category: 'collection', target: 100 },
  { id: 'explorer', name: 'Explorer', description: 'Watch 1000 videos total', icon: '🌍', category: 'collection', target: 1000 },

  // ═══════════════════════════════════════════════════════════════════════════
  // FEATURE DISCOVERY (10)
  // ═══════════════════════════════════════════════════════════════════════════
  { id: 'tv_caster', name: 'TV Caster', description: 'Cast media to a TV using DLNA', icon: '📺', category: 'features', target: 1 },
  { id: 'home_theater', name: 'Home Theater', description: 'Cast 10 videos to your TV', icon: '🎬', category: 'features', target: 10 },
  { id: 'gpu_master', name: 'GPU Master', description: 'Enable hardware-accelerated encoding', icon: '🖥️', category: 'features', target: 1 },
  { id: 'command_ninja', name: 'Command Ninja', description: 'Use the Command Palette (Ctrl+K)', icon: '⌨️', category: 'features', target: 1 },
  { id: 'power_user', name: 'Power User', description: 'Use Command Palette 50 times', icon: '🚀', category: 'features', target: 50 },
  { id: 'heart_giver', name: 'Heart Giver', description: 'Double-tap to like a video', icon: '💕', category: 'features', target: 1 },
  { id: 'swipe_master', name: 'Swipe Master', description: 'Swipe through 100 videos in Feed', icon: '👆', category: 'features', target: 100 },
  { id: 'ambiance_lover', name: 'Ambiance Lover', description: 'Enable 3 different ambient overlays', icon: '✨', category: 'features', target: 3 },
  { id: 'visual_artist', name: 'Visual Artist', description: 'Try all 6 new ambient effects', icon: '🎨', category: 'features', target: 6 },
  { id: 'matrix_mode', name: 'Matrix Mode', description: 'Enable the Matrix Rain overlay', icon: '🖥️', category: 'features', target: 1, secret: true },

  // ═══════════════════════════════════════════════════════════════════════════
  // SOCIAL & SHARING (5)
  // ═══════════════════════════════════════════════════════════════════════════
  { id: 'playlist_sharer', name: 'Playlist Sharer', description: 'Export a playlist', icon: '📤', category: 'social', target: 1 },
  { id: 'collector', name: 'Collector', description: 'Import a playlist', icon: '📥', category: 'social', target: 1 },
  { id: 'cast_party', name: 'Cast Party', description: 'Cast to 3 different devices', icon: '🎉', category: 'social', target: 3 },
  { id: 'scene_director', name: 'Scene Director', description: 'Create 10 scene markers', icon: '🎬', category: 'social', target: 10 },
  { id: 'caption_creator', name: 'Caption Creator', description: 'Create 5 captioned images', icon: '💬', category: 'social', target: 5 },
]

// ─────────────────────────────────────────────────────────────────────────────
// SESSION MODES PRESETS
// ─────────────────────────────────────────────────────────────────────────────

export const SESSION_MODES: SessionMode[] = [
  {
    id: 'quick-release',
    name: 'Quick Release',
    description: 'Fast, intense, get it done',
    icon: '⚡',
    settings: {
      goonwall: { defaultTileCount: 4, defaultIntervalSec: 10 },
            suggestedDuration: 15,
      soundtrack: 'intense_beats'
    }
  },
  {
    id: 'edge-training',
    name: 'Edge Training',
    description: "Build your endurance, don't you dare cum",
    icon: '🎯',
    settings: {
      goonwall: { defaultTileCount: 6, defaultIntervalSec: 30 },
            edgeTimer: { enabled: true, interval: 120, action: 'pause' },
      suggestedDuration: 60,
      soundtrack: 'building_tension'
    }
  },
  {
    id: 'hypno-goon',
    name: 'Hypno Goon',
    description: 'Let go, sink deep, goon forever',
    icon: '🌀',
    settings: {
      goonwall: { defaultTileCount: 9, defaultIntervalSec: 20 },
            visualEffects: { bloom: 0.3, vignette: 0.5 },
      suggestedDuration: 120,
      soundtrack: 'hypnotic_drone'
    }
  },
  {
    id: 'sensory-overload',
    name: 'Sensory Overload',
    description: 'Maximum stimulation, overwhelm yourself',
    icon: '🤯',
    settings: {
      goonwall: { defaultTileCount: 16, defaultIntervalSec: 10 },
      visualEffects: { saturation: 1.2, contrast: 1.1 },
      suggestedDuration: 30,
      soundtrack: 'chaos'
    }
  },
  {
    id: 'slow-burn',
    name: 'Slow Burn',
    description: 'Take your time, savor every moment',
    icon: '🕯️',
    settings: {
      goonwall: { defaultTileCount: 1, defaultIntervalSec: 60 },
            visualEffects: { vignette: 0.3 },
      suggestedDuration: 90,
      soundtrack: 'sensual_ambient'
    }
  },
  {
    id: 'porn-roulette',
    name: 'Porn Roulette',
    description: 'Random everything, embrace chaos',
    icon: '🎰',
    settings: {
      goonwall: { defaultTileCount: 6, defaultIntervalSec: 20, defaultLayout: 'mosaic' },
            suggestedDuration: 'until_done',
      soundtrack: 'random'
    }
  },
  {
    id: 'custom',
    name: 'Custom Session',
    description: 'Your settings, your rules',
    icon: '⚙️',
    settings: {
      goonwall: {},
            suggestedDuration: 'until_done'
    }
  }
]

// ─────────────────────────────────────────────────────────────────────────────
// GOON VOCABULARY - Sensual language replacements
// ─────────────────────────────────────────────────────────────────────────────

export const GOON_VOCABULARY: Record<string, string> = {
  // Navigation
  'Home': 'Your Den',
  'Library': 'Stash',
  'Browse': 'Explore Desires',
  'Search': 'Find Cravings',
  'Settings': 'Customize Pleasure',

  // Actions
  'Play': 'Indulge',
  'Pause': 'Edge',
  'Stop': 'Cool Down',
  'Next': 'More...',
  'Previous': 'Again...',
  'Shuffle': 'Surprise Me',
  'Loop': "Don't Stop",
  'Add to playlist': 'Save for Later',
  'Remove': 'Had Enough',
  'Delete': 'Release',

  // Content
  'Videos': 'Videos',
  'Images': 'Eye Candy',
  'GIFs': 'Loops of Lust',
  'Favorites': 'Obsessions',
  'Recently Watched': 'Fresh in Memory',
  'Most Viewed': "Can't Get Enough",
  'Top Rated': 'Peak Pleasure',
  'New': 'Fresh Meat',

  // Playlists
  'Playlist': 'Session',
  'Create Playlist': 'Plan Session',
  'Quick Playlist': 'Quickie',
  'Long Playlist': 'Marathon',

  // Stats
  'Views': 'Times Enjoyed',
  'Rating': 'How Good It Felt',
  'Duration': 'How Long You Lasted',
  'Last Watched': 'Last Indulgence',

  // Goonwall
  'Goonwall': 'Goon Wall',
  'Tiles': 'Panels of Pleasure',
  'Grid': 'Overwhelming Grid',
  'Mosaic': 'Mosaic of Desire',

  // Daylist
  'Daylist': "Today's Temptations",
  'Generate': 'Seduce Me',
  'Regenerate': 'Tempt Me Again',

  // General
  'Loading': 'Getting Ready...',
  'Saving': 'Remembering...',
  'Success': 'Mmm, Perfect',
  'Error': 'Ugh, Interrupted',
  'Empty': 'Nothing Here Yet... Fill Me Up',
  'No Results': "Couldn't Find That Craving",
}

// Export defaults for use elsewhere
export { DEFAULTS }

// ─────────────────────────────────────────────────────────────────────────────
// SETTINGS PROFILES
// ─────────────────────────────────────────────────────────────────────────────

export interface SettingsProfile {
  id: string
  name: string
  description?: string
  createdAt: number
  updatedAt: number
  // Stores a subset of settings that can be switched
  settings: {
    appearance?: Partial<AppearanceSettings>
    playback?: Partial<PlaybackSettings>
    goonwall?: Partial<GoonwallSettings>
    visualEffects?: Partial<VisualEffectsSettings>
    sound?: Partial<SoundSettings>
  }
}

// Separate store for profiles to keep them independent
const profilesStore = new Store<{ profiles: SettingsProfile[]; activeProfileId: string | null }>({
  name: 'settings-profiles',
  defaults: {
    profiles: [],
    activeProfileId: null
  }
})

export function listProfiles(): SettingsProfile[] {
  return profilesStore.get('profiles') || []
}

export function getActiveProfileId(): string | null {
  return profilesStore.get('activeProfileId') || null
}

export function getProfile(profileId: string): SettingsProfile | null {
  const profiles = listProfiles()
  return profiles.find(p => p.id === profileId) || null
}

export function createProfile(name: string, description?: string): SettingsProfile {
  const current = getSettings()
  const now = Date.now()
  const id = `profile_${now}_${Math.random().toString(36).slice(2, 8)}`

  const profile: SettingsProfile = {
    id,
    name: name.trim() || 'New Profile',
    description: description?.trim(),
    createdAt: now,
    updatedAt: now,
    settings: {
      appearance: { ...current.appearance },
      playback: { ...current.playback },
      goonwall: { ...current.goonwall },
      visualEffects: { ...current.visualEffects },
      sound: { ...current.sound }
    }
  }

  const profiles = listProfiles()
  profilesStore.set('profiles', [...profiles, profile])

  return profile
}

export function saveCurrentToProfile(profileId: string): SettingsProfile | null {
  const profiles = listProfiles()
  const index = profiles.findIndex(p => p.id === profileId)
  if (index < 0) return null

  const current = getSettings()
  const updated: SettingsProfile = {
    ...profiles[index],
    updatedAt: Date.now(),
    settings: {
      appearance: { ...current.appearance },
      playback: { ...current.playback },
      goonwall: { ...current.goonwall },
      visualEffects: { ...current.visualEffects },
      sound: { ...current.sound }
    }
  }

  profiles[index] = updated
  profilesStore.set('profiles', profiles)

  return updated
}

export function loadProfile(profileId: string): VaultSettings | null {
  const profile = getProfile(profileId)
  if (!profile) return null

  // Apply profile settings
  const current = getSettings()
  const merged: Partial<VaultSettings> = {}

  if (profile.settings.appearance) {
    merged.appearance = { ...current.appearance, ...profile.settings.appearance }
  }
  if (profile.settings.playback) {
    merged.playback = { ...current.playback, ...profile.settings.playback }
  }
  if (profile.settings.goonwall) {
    merged.goonwall = { ...current.goonwall, ...profile.settings.goonwall }
  }
  if (profile.settings.visualEffects) {
    merged.visualEffects = { ...current.visualEffects, ...profile.settings.visualEffects }
  }
  if (profile.settings.sound) {
    merged.sound = { ...current.sound, ...profile.settings.sound }
  }

  const updated = updateSettings(merged)
  profilesStore.set('activeProfileId', profileId)

  return updated
}

export function renameProfile(profileId: string, name: string, description?: string): SettingsProfile | null {
  const profiles = listProfiles()
  const index = profiles.findIndex(p => p.id === profileId)
  if (index < 0) return null

  profiles[index] = {
    ...profiles[index],
    name: name.trim() || profiles[index].name,
    description: description?.trim(),
    updatedAt: Date.now()
  }

  profilesStore.set('profiles', profiles)
  return profiles[index]
}

export function deleteProfile(profileId: string): boolean {
  const profiles = listProfiles()
  const filtered = profiles.filter(p => p.id !== profileId)

  if (filtered.length === profiles.length) return false

  profilesStore.set('profiles', filtered)

  // If this was the active profile, clear it
  if (getActiveProfileId() === profileId) {
    profilesStore.set('activeProfileId', null)
  }

  return true
}

export function clearActiveProfile(): void {
  profilesStore.set('activeProfileId', null)
}
