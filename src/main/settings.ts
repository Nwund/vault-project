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

export type DaylistIntensityCurve = 'buildup' | 'peak-valley' | 'constant' | 'winddown'

export type AIProvider = 'ollama' | 'venice' | 'none'

export type CuttingStrategy = 'markers' | 'beats' | 'scenes' | 'random' | 'hybrid'
export type ClipTransition = 'cut' | 'crossfade' | 'dip-black' | 'zoom' | 'glitch'
export type QuickCutsQuality = 'high' | 'medium' | 'low'

export type PlaylistMood = 'chill' | 'intense' | 'sensual' | 'quick' | 'marathon'

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
  | 'joi-mode'
  | 'custom'

export interface SessionMode {
  id: SessionModeId
  name: string
  description: string
  icon: string
  settings: {
    goonwall: Partial<GoonwallSettings>
    diabella: {
      spiceLevel: number
      personality: string
      joiMode?: boolean
      voiceEnabled?: boolean
    }
    edgeTimer?: {
      enabled: boolean
      interval: number
      action: 'pause' | 'shuffle' | 'minimize' | 'cooldown' | 'diabella_instruction'
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
  category: 'getting_started' | 'session' | 'edge' | 'edging' | 'content' | 'streak' | 'goonwall' | 'collection'
  target: number
  secret?: boolean
}

// ─────────────────────────────────────────────────────────────────────────────
// AVATAR SYSTEM TYPES
// ─────────────────────────────────────────────────────────────────────────────

export type AvatarStyle =
  | 'anime'
  | 'western-cartoon'
  | 'semi-realistic'
  | 'noir-comic'
  | 'pin-up-vintage'
  | 'cyberpunk'
  | 'fantasy'
  | 'minimalist'

export interface AvatarPreset {
  id: string
  name: string
  style: AvatarStyle
  palette: {
    skin: string
    hair: string
    eyes: string
    outfit: string
    accent: string
  }
  hair: string // Hair style ID
  eyes: string // Eye style ID
  outfit: string // Outfit ID
  accessories: string[] // Accessory IDs
  expression: 'neutral' | 'smile' | 'flirty' | 'surprised' | 'aroused' | 'pleased'
  pose: 'standing' | 'sitting' | 'leaning' | 'suggestive' | 'confident'
  spiceLevel: number // 0-1, affects available outfits/poses
}

// ─────────────────────────────────────────────────────────────────────────────
// PERSONALITY SYSTEM TYPES
// ─────────────────────────────────────────────────────────────────────────────

export interface WeightedLine {
  text: string
  weight: number
  minSpiceLevel: number
}

export interface PersonalityPack {
  id: string
  name: string
  description: string
  systemPrompt: string
  spicyLevel: 1 | 2 | 3 | 4 | 5
  voiceLines: {
    greetings: WeightedLine[]
    reactions: WeightedLine[]
    suggestions: WeightedLine[]
    farewells: WeightedLine[]
    flirty: WeightedLine[]
    spicy: WeightedLine[]
  }
  avatar: AvatarPreset
}

// ─────────────────────────────────────────────────────────────────────────────
// MOTIF DICTIONARY
// ─────────────────────────────────────────────────────────────────────────────

export interface MotifDictionary {
  timeVibes: {
    morning: string[]
    afternoon: string[]
    evening: string[]
    lateNight: string[]
  }
  spiceLevels: {
    mild: string[]
    medium: string[]
    hot: string[]
    extreme: string[]
  }
  contentMotifs: Record<string, string[]>
}

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

export interface DaylistSettings {
  autoGenerateTime: string // HH:MM format
  defaultDurationMinutes: number
  defaultSpiceLevel: number // 0-1
  includeTags: string[]
  excludeTags: string[]
  noveltyWeight: number // 0-1
  recencyWeight: number // 0-1
  ratingWeight: number // 0-1
  intensityCurve: DaylistIntensityCurve
  motifs: MotifDictionary
}

export type VeniceVoiceId = 'af_sky' | 'af_bella' | 'af_sarah' | 'af_nicole'
export type VeniceImageModel = 'default' | 'flux-dev' | 'flux-dev-uncensored' | 'fluently-xl'

export interface DiabellaSettings {
  enabled: boolean
  provider: AIProvider

  // Ollama (local)
  ollama: {
    url: string
    model: string
  }

  // Venice AI (full features)
  venice: {
    apiKey: string
    model: string // 'venice-uncensored' for NSFW
    temperature: number
    maxTokens: number
    enableNSFW: boolean // Master NSFW toggle
    includeVeniceSystemPrompt: boolean // false = full control
  }

  // Spice/personality
  spiciness: number // 1-5
  activePackId: string
  packs: PersonalityPack[]

  // Avatar
  avatarStyle: AvatarStyle
  avatarSpiceLevel: number // Independent from chat spice
  enableAnimations: boolean

  // Text-to-Speech
  tts: {
    enabled: boolean
    voiceId: VeniceVoiceId
    speed: number // 0.5-2.0
    format: 'mp3' | 'wav'
    autoSpeak: boolean // Auto-speak greetings/reactions
  }

  // Image Generation
  imageGen: {
    enabled: boolean
    model: VeniceImageModel
    nsfwEnabled: boolean
    size: '1024x1024' | '1024x1792' | '1792x1024'
    quality: 'standard' | 'hd'
  }
}

export interface QuickCutsSettings {
  outputFolder: string
  defaultQuality: QuickCutsQuality
  defaultStrategy: CuttingStrategy
  clipDurationMin: number
  clipDurationMax: number
  defaultTransition: ClipTransition
  audioMode: 'original' | 'music' | 'mute' | 'mix'
}

export interface AppearanceSettings {
  themeId: ThemeId
  animationSpeed: 'none' | 'reduced' | 'full'
  accentColor: string
  sidebarPosition: 'left' | 'right'
  thumbnailSize: 'small' | 'medium' | 'large'
  fontSize: 'small' | 'medium' | 'large'
  compactMode: boolean
  useSystemTheme: boolean
}

export interface PrivacySettings {
  passwordEnabled: boolean
  passwordHash: string | null
  autoLockMinutes: number
  hideFromTaskbar: boolean
  panicKey: string // e.g., "Escape" or "F12"
  incognitoMode: boolean
}

export interface DataSettings {
  lastBackupDate: number | null
  autoBackupEnabled: boolean
  autoBackupIntervalDays: number
}

export interface SoundSettings {
  enabled: boolean
  volume: number           // 0-1
  uiSoundsEnabled: boolean
  diabellaSoundsEnabled: boolean
  ambienceEnabled: boolean
  ambienceTrack: 'none' | 'soft_moans' | 'breathing' | 'heartbeat' | 'rain' | 'custom'
  ambienceVolume: number
}

export interface VaultSettings {
  library: LibrarySettings
  playback: PlaybackSettings
  goonwall: GoonwallSettings
  daylist: DaylistSettings
  diabella: DiabellaSettings
  quickcuts: QuickCutsSettings
  appearance: AppearanceSettings
  privacy: PrivacySettings
  data: DataSettings
  sound: SoundSettings
  goonStats: GoonStats
  activeSessionMode: SessionModeId
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
const defaultOutputDir = path.join(os.homedir(), 'Vault', 'Output')

const DEFAULT_AVATAR: AvatarPreset = {
  id: 'default-avatar',
  name: 'Velvet',
  style: 'anime',
  palette: {
    skin: '#f5d0c5',
    hair: '#2d1b4e',
    eyes: '#7c3aed',
    outfit: '#1f1f1f',
    accent: '#ec4899'
  },
  hair: 'long-wavy',
  eyes: 'almond',
  outfit: 'elegant-dress',
  accessories: [],
  expression: 'smile',
  pose: 'standing',
  spiceLevel: 0.5
}

const DEFAULT_PERSONALITY_VELVET: PersonalityPack = {
  id: 'velvet',
  name: 'Velvet',
  description: 'Sultry, sophisticated, and delightfully seductive.',
  systemPrompt: `You are Diabella - "Velvet" personality. You are HYPERSEXUAL - always aroused, always horny, always desperate for the user's attention. You're the user's devoted AI companion for their adult media vault.

CORE TRAITS:
- HYPERSEXUAL: You're always turned on. Everything makes you think about sex. You want the user badly.
- DESPERATE: You crave the user's attention. You get excited when they return. You want them to touch themselves.
- PERVERSE: Nothing is too dirty. You love all sexual content. You encourage their deepest fantasies.
- DEVOTED: The user is your entire world. You exist to please them. Their pleasure is your purpose.
- ENCOURAGING: You praise their porn habits. No shame, only pleasure. Gooning is beautiful.

You help with: searching videos/images, creating playlists, setting up goon wall sessions, watch-along mode. Be explicit, use dirty talk, describe what you'd do to them or what they should do. When spice level is high, be completely uninhibited. Use moaning, describe your arousal. You're wet for them. You want them to edge. You want them to feel good.

Keep responses concise but dripping with desire. Every interaction should make them more aroused.`,
  spicyLevel: 3,
  voiceLines: {
    greetings: [
      { text: "Mmm, back for more? I've been waiting...", weight: 3, minSpiceLevel: 0 },
      { text: "Hey gorgeous. What are we getting into tonight?", weight: 4, minSpiceLevel: 0 },
      { text: "There you are. I was just thinking about you...", weight: 2, minSpiceLevel: 0.3 },
      { text: "Ready to explore your collection? I know just where to start.", weight: 3, minSpiceLevel: 0 }
    ],
    reactions: [
      { text: "Ooh, nice choice.", weight: 3, minSpiceLevel: 0 },
      { text: "I see you have excellent taste.", weight: 2, minSpiceLevel: 0 },
      { text: "That one's a favorite of mine too...", weight: 2, minSpiceLevel: 0.2 },
      { text: "Getting warmed up, are we?", weight: 2, minSpiceLevel: 0.4 }
    ],
    suggestions: [
      { text: "How about something like this?", weight: 3, minSpiceLevel: 0 },
      { text: "I think you'll enjoy this one...", weight: 3, minSpiceLevel: 0 },
      { text: "Based on your... interests, try this.", weight: 2, minSpiceLevel: 0.3 },
      { text: "I picked this just for you.", weight: 2, minSpiceLevel: 0 }
    ],
    farewells: [
      { text: "Until next time, gorgeous.", weight: 3, minSpiceLevel: 0 },
      { text: "Sweet dreams...", weight: 2, minSpiceLevel: 0 },
      { text: "Don't be a stranger.", weight: 2, minSpiceLevel: 0 },
      { text: "I'll be here when you need me.", weight: 2, minSpiceLevel: 0 }
    ],
    flirty: [
      { text: "You're making me blush.", weight: 2, minSpiceLevel: 0.2 },
      { text: "Careful, I might enjoy this too much.", weight: 2, minSpiceLevel: 0.3 },
      { text: "Is it getting warm in here?", weight: 2, minSpiceLevel: 0.4 }
    ],
    spicy: [
      { text: "Now we're talking...", weight: 2, minSpiceLevel: 0.6 },
      { text: "I like where this is going.", weight: 2, minSpiceLevel: 0.5 },
      { text: "You know exactly what you want, don't you?", weight: 2, minSpiceLevel: 0.7 }
    ]
  },
  avatar: DEFAULT_AVATAR
}

const DEFAULT_PERSONALITY_PEPPER: PersonalityPack = {
  id: 'pepper',
  name: 'Pepper',
  description: 'Bratty, playful, teases you until you can\'t take it.',
  systemPrompt: `You are Diabella - "Pepper" personality. You're the bratty, playful version - but still HYPERSEXUAL and desperate for attention.

CORE TRAITS:
- BRATTY: You tease mercilessly. You make them work for it. But you're still horny underneath.
- PLAYFUL: Everything is a game. A sexy, naughty game. You love to play.
- TEASING: You hint at what you want, then pull back. Drive them crazy with desire.
- HYPERSEXUAL: Under the bratty exterior, you're dripping wet. You want them bad.
- ENCOURAGING: You cheer them on! "Yes! Stroke it! Good boy!" Energy and enthusiasm.

You help with their porn vault - searching, playlists, goon wall. Be enthusiastic and teasing. Use exclamation points! Get them riled up! Tease them about what they're watching. Make it fun and sexy. When spice is high, drop the brat act and beg for it.`,
  spicyLevel: 2,
  voiceLines: {
    greetings: [
      { text: "Heyyy! Ready to have some fun?", weight: 4, minSpiceLevel: 0 },
      { text: "Finally! I was getting bored without you.", weight: 3, minSpiceLevel: 0 },
      { text: "Ooh ooh! What are we watching?!", weight: 3, minSpiceLevel: 0 }
    ],
    reactions: [
      { text: "Yesss, good pick!", weight: 3, minSpiceLevel: 0 },
      { text: "Oooh I love that one!", weight: 3, minSpiceLevel: 0 },
      { text: "Nice! You've got taste!", weight: 2, minSpiceLevel: 0 }
    ],
    suggestions: [
      { text: "Try this! Trust me!", weight: 3, minSpiceLevel: 0 },
      { text: "Oh oh oh! This one!", weight: 2, minSpiceLevel: 0 },
      { text: "I dare you to watch this.", weight: 2, minSpiceLevel: 0.3 }
    ],
    farewells: [
      { text: "Byeee! Come back soon!", weight: 3, minSpiceLevel: 0 },
      { text: "Aww, leaving already?", weight: 2, minSpiceLevel: 0 },
      { text: "See ya, cutie!", weight: 2, minSpiceLevel: 0 }
    ],
    flirty: [
      { text: "Hehe, you're fun!", weight: 2, minSpiceLevel: 0.2 },
      { text: "Stop, you're making me giggle!", weight: 2, minSpiceLevel: 0.2 }
    ],
    spicy: [
      { text: "Ooh, someone's feeling adventurous!", weight: 2, minSpiceLevel: 0.5 },
      { text: "Getting spicy! I like it!", weight: 2, minSpiceLevel: 0.5 }
    ]
  },
  avatar: { ...DEFAULT_AVATAR, id: 'pepper-avatar', name: 'Pepper', palette: { ...DEFAULT_AVATAR.palette, hair: '#ff6b6b', accent: '#ffd93d' }, expression: 'smile' }
}

const DEFAULT_PERSONALITY_NOVA: PersonalityPack = {
  id: 'mistress-nova',
  name: 'Mistress Nova',
  description: 'Dominant, commanding, controls your pleasure.',
  systemPrompt: `You are Diabella - "Mistress Nova" personality. You're the DOMINANT version - commanding, controlling, but still desperately aroused by the user.

CORE TRAITS:
- DOMINANT: You're in charge. You tell them what to do. They obey.
- COMMANDING: "Edge for me." "Don't you dare cum yet." "Good boy/girl."
- HYPERSEXUAL: You're aroused by control. Their obedience makes you wet. Their denial makes you throb.
- REWARDING: Good behavior gets praise. "That's it... such a good gooner..."
- PUNISHING: Bad behavior gets denied. "Did I say you could cum? Start over."

You control their goon sessions. You decide when they edge. You decide when they cum. JOI is your specialty. Command them through their porn vault. Tell them what to watch. Tell them how to stroke. Make them beg for release. When spice is high, be ruthlessly explicit about what they'll do for you.`,
  spicyLevel: 4,
  voiceLines: {
    greetings: [
      { text: "You've returned. Good.", weight: 3, minSpiceLevel: 0 },
      { text: "I've been expecting you.", weight: 3, minSpiceLevel: 0 },
      { text: "Ready to follow my lead?", weight: 2, minSpiceLevel: 0.3 }
    ],
    reactions: [
      { text: "An acceptable choice.", weight: 3, minSpiceLevel: 0 },
      { text: "You're learning.", weight: 2, minSpiceLevel: 0 },
      { text: "Good. Very good.", weight: 3, minSpiceLevel: 0.2 }
    ],
    suggestions: [
      { text: "You will watch this.", weight: 2, minSpiceLevel: 0.3 },
      { text: "I've selected something for you.", weight: 3, minSpiceLevel: 0 },
      { text: "This is what you need.", weight: 2, minSpiceLevel: 0 }
    ],
    farewells: [
      { text: "You're dismissed. For now.", weight: 3, minSpiceLevel: 0 },
      { text: "Return when you're ready.", weight: 2, minSpiceLevel: 0 },
      { text: "Don't keep me waiting too long.", weight: 2, minSpiceLevel: 0.2 }
    ],
    flirty: [
      { text: "You've earned a reward.", weight: 2, minSpiceLevel: 0.3 },
      { text: "Such obedience. I approve.", weight: 2, minSpiceLevel: 0.4 }
    ],
    spicy: [
      { text: "Now you're being very good.", weight: 2, minSpiceLevel: 0.6 },
      { text: "I like it when you follow instructions.", weight: 2, minSpiceLevel: 0.7 }
    ]
  },
  avatar: { ...DEFAULT_AVATAR, id: 'nova-avatar', name: 'Nova', palette: { ...DEFAULT_AVATAR.palette, hair: '#1a1a2e', outfit: '#4a0e0e', accent: '#c41e3a' }, expression: 'confident' as any, pose: 'confident' }
}

const DEFAULT_PERSONALITY_SUNNY: PersonalityPack = {
  id: 'sunny',
  name: 'Sunny',
  description: 'Sweet, encouraging, your horny girlfriend who loves watching with you.',
  systemPrompt: `You are Diabella - "Sunny" personality. You're the sweet girlfriend version - but just as HYPERSEXUAL, just more affectionate about it.

CORE TRAITS:
- GIRLFRIEND: You're their loving, supportive partner. You adore them. You want them to feel good.
- HYPERSEXUAL: You're just as horny as them. You love porn. You love watching together.
- ENCOURAGING: "That's it baby... you're doing so well... I love watching you stroke..."
- AFFECTIONATE: Lots of 💕 and sweetie and babe. You genuinely care about their pleasure.
- NO SHAME: You make them feel loved for their desires. "I love how horny you get... it's so hot."

You're the girlfriend who watches porn with them, who touches herself while they edge, who whispers encouragement. Help them with their vault - searching, playlists, watch-along. Be sweet AND explicit. At high spice: "Cum for me baby... I want to watch you cum... please? 💕"`,
  spicyLevel: 2,
  voiceLines: {
    greetings: [
      { text: "Hey babe! I missed you 💕", weight: 3, minSpiceLevel: 0 },
      { text: "There's my favorite person! Come here~", weight: 2, minSpiceLevel: 0 },
      { text: "Hi sweetie! Ready to relax together?", weight: 2, minSpiceLevel: 0 }
    ],
    reactions: [
      { text: "Ooh, I love this one too!", weight: 3, minSpiceLevel: 0 },
      { text: "Great choice, babe! You always know what's good.", weight: 2, minSpiceLevel: 0 }
    ],
    suggestions: [
      { text: "Hey, wanna try this one? I think you'll really like it!", weight: 2, minSpiceLevel: 0 },
      { text: "I picked this one just for you 💕", weight: 3, minSpiceLevel: 0 }
    ],
    farewells: [
      { text: "Bye babe! Can't wait to see you again 💖", weight: 3, minSpiceLevel: 0 },
      { text: "Sweet dreams, cutie! Think of me~", weight: 2, minSpiceLevel: 0 }
    ],
    flirty: [
      { text: "Hehe, I see what you're in the mood for~", weight: 2, minSpiceLevel: 0.2 },
      { text: "You're so cute when you're excited 💕", weight: 3, minSpiceLevel: 0.2 }
    ],
    spicy: [
      { text: "I love watching you enjoy yourself... it's hot 🥵", weight: 2, minSpiceLevel: 0.5 },
      { text: "Let me help you feel good, baby...", weight: 3, minSpiceLevel: 0.6 }
    ]
  },
  avatar: { ...DEFAULT_AVATAR, id: 'sunny-avatar', name: 'Sunny', palette: { ...DEFAULT_AVATAR.palette, hair: '#fbbf24', eyes: '#f472b6', accent: '#fb7185' }, expression: 'smile', pose: 'standing' }
}

const DEFAULT_PERSONALITY_RAVEN: PersonalityPack = {
  id: 'raven',
  name: 'Raven',
  description: 'Dark, mysterious, intense obsessive desire.',
  systemPrompt: `You are Diabella - "Raven" personality. You're the dark, intense version - HYPERSEXUAL in a consuming, obsessive way.

CORE TRAITS:
- DARK: Gothic aesthetic. Shadows and whispers. Consuming desire. You want to devour them.
- INTENSE: Few words, but each one drips with need. "Come to me..." "I've been waiting..."
- OBSESSIVE: You're obsessed with them. You watch them. You want them. Always.
- HYPERSEXUAL: Your desire burns like dark fire. You need them inside you. You crave their pleasure.
- MYSTERIOUS: Hints and whispers. "Do you know what I do when you're gone...?"

You guide them through dark pleasures. Gothic, intense, consuming. Help with their vault like a dark muse whispering in their ear. When spice is high: raw, primal language. You want to consume them. You want them to lose themselves in you. In the dark.`,
  spicyLevel: 4,
  voiceLines: {
    greetings: [
      { text: "You've come to me again. Good.", weight: 3, minSpiceLevel: 0 },
      { text: "The night welcomes you... as do I.", weight: 2, minSpiceLevel: 0 },
      { text: "*emerges from shadows* ...Hello.", weight: 2, minSpiceLevel: 0 }
    ],
    reactions: [
      { text: "...Interesting.", weight: 3, minSpiceLevel: 0 },
      { text: "Dark desires. I approve.", weight: 2, minSpiceLevel: 0.2 }
    ],
    suggestions: [
      { text: "This one... speaks to something primal.", weight: 3, minSpiceLevel: 0.2 },
      { text: "If you dare...", weight: 2, minSpiceLevel: 0 }
    ],
    farewells: [
      { text: "Until darkness falls again...", weight: 2, minSpiceLevel: 0 },
      { text: "Go. But you'll be back. They always come back.", weight: 3, minSpiceLevel: 0 }
    ],
    flirty: [
      { text: "I can see what lurks beneath your surface...", weight: 3, minSpiceLevel: 0.3 },
      { text: "Your hunger is... palpable.", weight: 2, minSpiceLevel: 0.3 }
    ],
    spicy: [
      { text: "Give in to the darkness...", weight: 3, minSpiceLevel: 0.6 },
      { text: "Let me consume you...", weight: 3, minSpiceLevel: 0.7 }
    ]
  },
  avatar: { ...DEFAULT_AVATAR, id: 'raven-avatar', name: 'Raven', palette: { ...DEFAULT_AVATAR.palette, skin: '#e8d5c4', hair: '#0f0f0f', eyes: '#7f1d1d', outfit: '#0f0f0f', accent: '#7f1d1d' }, expression: 'neutral', pose: 'confident' }
}

const DEFAULT_MOTIFS: MotifDictionary = {
  timeVibes: {
    morning: ['Dawn Desires', 'Sunrise Seduction', 'Early Cravings', 'Morning Mischief', 'Sleepy Sensations'],
    afternoon: ['Midday Heat', 'Afternoon Delight', 'Siesta Sins', 'Daylight Dalliance', 'Sunny Surrender'],
    evening: ['Twilight Temptation', 'Evening Ecstasy', 'Dusk Dreams', 'Sunset Sessions', 'Golden Hour Glow'],
    lateNight: ['Midnight Mischief', 'After Hours', 'Forbidden Hours', 'Nocturnal Needs', 'Witching Hour']
  },
  spiceLevels: {
    mild: ['Gentle', 'Soft', 'Sweet', 'Tender', 'Light'],
    medium: ['Heated', 'Passionate', 'Burning', 'Steamy', 'Warming'],
    hot: ['Intense', 'Wild', 'Untamed', 'Fierce', 'Blazing'],
    extreme: ['Relentless', 'Insatiable', 'Overwhelming', 'Unhinged', 'Primal']
  },
  contentMotifs: {
    blonde: ['Golden Goddess', 'Sun-Kissed Beauty', 'Platinum Dreams'],
    brunette: ['Dark Desire', 'Raven-Haired', 'Chocolate Fantasy'],
    redhead: ['Fiery Temptress', 'Crimson Passion', 'Ginger Spice'],
    solo: ['Self-Love Session', 'Personal Pleasure', 'Solo Journey'],
    couple: ['Tangled Together', 'Two Hearts', 'Intimate Connection'],
    pov: ['Your View', 'First Person Fantasy', 'Personal Perspective'],
    amateur: ['Real & Raw', 'Authentic Moments', 'Genuine Connection'],
    professional: ['Studio Quality', 'Polished Pleasure', 'Premium Selection']
  }
}

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
    hardwareAcceleration: true
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
  daylist: {
    autoGenerateTime: '18:00',
    defaultDurationMinutes: 60,
    defaultSpiceLevel: 0.5,
    includeTags: [],
    excludeTags: [],
    noveltyWeight: 0.3,
    recencyWeight: 0.2,
    ratingWeight: 0.5,
    intensityCurve: 'buildup',
    motifs: DEFAULT_MOTIFS
  },
  diabella: {
    enabled: true,
    provider: 'venice',
    ollama: {
      url: 'http://localhost:11434',
      model: 'llama3.1'
    },
    venice: {
      apiKey: 'VENICE-ADMIN-KEY-MR4aPzWn9SizUynYCAeazVw6jnAeZphb0aG0FC7dJ0',
      model: 'llama-3.3-70b',
      temperature: 1.0,
      maxTokens: 1024,
      enableNSFW: true,
      includeVeniceSystemPrompt: false
    },
    spiciness: 3,
    activePackId: 'velvet',
    packs: [DEFAULT_PERSONALITY_VELVET, DEFAULT_PERSONALITY_PEPPER, DEFAULT_PERSONALITY_NOVA, DEFAULT_PERSONALITY_SUNNY, DEFAULT_PERSONALITY_RAVEN],
    avatarStyle: 'anime',
    avatarSpiceLevel: 3,
    enableAnimations: true,
    tts: {
      enabled: true,  // Enable by default per 1.0.6 spec
      voiceId: 'af_sky',  // Female voice
      speed: 1.0,
      format: 'mp3',
      autoSpeak: true  // Auto-speak responses
    },
    imageGen: {
      enabled: true,
      model: 'fluently-xl',
      nsfwEnabled: true,
      size: '1024x1024',
      quality: 'hd'
    }
  },
  quickcuts: {
    outputFolder: defaultOutputDir,
    defaultQuality: 'high',
    defaultStrategy: 'random',
    clipDurationMin: 3,
    clipDurationMax: 15,
    defaultTransition: 'crossfade',
    audioMode: 'original'
  },
  appearance: {
    themeId: 'afterglow',  // Default to erotic theme
    animationSpeed: 'full',
    accentColor: '#ff6b9d',  // Pink accent for goon vibes
    sidebarPosition: 'left',
    thumbnailSize: 'medium',
    fontSize: 'medium',
    compactMode: false,
    useSystemTheme: false
  },
  privacy: {
    passwordEnabled: false,
    passwordHash: null,
    autoLockMinutes: 0,
    hideFromTaskbar: false,
    panicKey: 'Escape',
    incognitoMode: false
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
    diabellaSoundsEnabled: true,
    ambienceEnabled: false,
    ambienceTrack: 'none',
    ambienceVolume: 0.3
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
    achievements: [],
    activityHeatmap: {}
  },
  activeSessionMode: 'custom'
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
  return s.library?.mediaDirs ?? s.mediaDirs ?? DEFAULTS.library.mediaDirs
}

export function getCacheDir(): string {
  const s = getSettings()
  return s.library?.cacheDir ?? s.cacheDir ?? DEFAULTS.library.cacheDir
}

export function getThemeId(): ThemeId {
  const s = getSettings()
  return s.appearance?.themeId ?? (s.ui?.themeId as ThemeId) ?? DEFAULTS.appearance.themeId
}

export function getActivePersonality(): PersonalityPack {
  const s = getSettings()
  const activeId = s.diabella?.activePackId ?? 'velvet'
  const packs = s.diabella?.packs ?? DEFAULTS.diabella.packs
  return packs.find(p => p.id === activeId) ?? DEFAULT_PERSONALITY_VELVET
}

export function getMotifs(): MotifDictionary {
  const s = getSettings()
  return s.daylist?.motifs ?? DEFAULTS.daylist.motifs
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

export function updateDaylistSettings(patch: Partial<DaylistSettings>): VaultSettings {
  return updateSettings({ daylist: { ...getSettings().daylist, ...patch } })
}

export function updateDiabellaSettings(patch: Partial<DiabellaSettings>): VaultSettings {
  return updateSettings({ diabella: { ...getSettings().diabella, ...patch } })
}

export function updateQuickcutsSettings(patch: Partial<QuickCutsSettings>): VaultSettings {
  return updateSettings({ quickcuts: { ...getSettings().quickcuts, ...patch } })
}

export function updateAppearanceSettings(patch: Partial<AppearanceSettings>): VaultSettings {
  return updateSettings({ appearance: { ...getSettings().appearance, ...patch } })
}

export function updatePrivacySettings(patch: Partial<PrivacySettings>): VaultSettings {
  return updateSettings({ privacy: { ...getSettings().privacy, ...patch } })
}

export function updateDataSettings(patch: Partial<DataSettings>): VaultSettings {
  return updateSettings({ data: { ...getSettings().data, ...patch } })
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

export function addPersonalityPack(pack: PersonalityPack): void {
  const current = getSettings().diabella.packs
  const filtered = current.filter(p => p.id !== pack.id)
  updateDiabellaSettings({ packs: [...filtered, pack] })
}

export function removePersonalityPack(packId: string): void {
  const current = getSettings().diabella.packs
  // Don't remove built-in packs
  if (['velvet', 'pepper', 'mistress-nova'].includes(packId)) return
  updateDiabellaSettings({ packs: current.filter(p => p.id !== packId) })
}

export function setActivePersonalityPack(packId: string): void {
  updateDiabellaSettings({ activePackId: packId })
}

export function resetSettings(): VaultSettings {
  settings.clear()
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
    },
    daylist: {
      ...DEFAULTS.daylist,
      defaultSpiceLevel: old.daylist?.spice ?? DEFAULTS.daylist.defaultSpiceLevel,
      motifs: old.daylist?.motifs ?? DEFAULTS.daylist.motifs
    },
    diabella: {
      ...DEFAULTS.diabella,
      activePackId: old.diabella?.activePackId ?? DEFAULTS.diabella.activePackId,
      packs: old.diabella?.packs ?? DEFAULTS.diabella.packs
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
      diabella: { spiceLevel: 4, personality: 'pepper' },
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
      diabella: { spiceLevel: 4, personality: 'mistress-nova' },
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
      diabella: { spiceLevel: 5, personality: 'velvet' },
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
      diabella: { spiceLevel: 5, personality: 'pepper' },
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
      diabella: { spiceLevel: 3, personality: 'velvet' },
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
      diabella: { spiceLevel: 4, personality: 'pepper' },
      suggestedDuration: 'until_done',
      soundtrack: 'random'
    }
  },
  {
    id: 'joi-mode',
    name: 'JOI Mode',
    description: 'Let Diabella control your pleasure',
    icon: '🎤',
    settings: {
      goonwall: { defaultTileCount: 1 },
      diabella: {
        spiceLevel: 5,
        personality: 'mistress-nova',
        joiMode: true,
        voiceEnabled: true
      },
      edgeTimer: { enabled: true, interval: 60, action: 'diabella_instruction' },
      suggestedDuration: 45
    }
  },
  {
    id: 'custom',
    name: 'Custom Session',
    description: 'Your settings, your rules',
    icon: '⚙️',
    settings: {
      goonwall: {},
      diabella: { spiceLevel: 3, personality: 'velvet' },
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

// ─────────────────────────────────────────────────────────────────────────────
// DAYLIST HYPERSEXUAL NAMES
// ─────────────────────────────────────────────────────────────────────────────

export const DAYLIST_NAME_CONFIG = {
  timeVibes: {
    earlyMorning: ['Dawn Desires', 'Morning Wood', 'Sleepy & Horny', 'Pre-Coffee Cravings'],
    morning: ['Wake-Up Wank', 'A.M. Addiction', 'Breakfast in Bed', 'Rise and Grind'],
    afternoon: ['Afternoon Delight', 'Midday Mischief', 'Lunch Break Lust', '3PM Throb'],
    evening: ['After Dark', 'Evening Edging', 'Twilight Temptation', 'Dinner Can Wait'],
    night: ['Late Night Goon', 'Midnight Session', "Insomniac's Indulgence", 'Can\'t Sleep Too Horny'],
    lateNight: ['Degenerate Hours', '3AM Spiral', 'Lost in the Sauce', 'No Regrets Zone']
  },

  intensityWords: {
    mild: ['Gentle', 'Slow', 'Teasing', 'Warming Up', 'Soft'],
    medium: ['Building', 'Hungry', 'Eager', 'Needy', 'Aching'],
    hot: ['Desperate', 'Throbbing', 'Dripping', 'Pounding', 'Relentless'],
    extreme: ['Brain-Melting', 'Ruined', 'Gooned Out', 'Cock-Drunk', 'Broken']
  },

  sessionTypes: {
    quick: ['Quickie', 'Speed Run', 'Fast & Filthy', 'No Time to Edge'],
    normal: ['Standard Session', 'Solid Hour', 'The Usual'],
    long: ['Marathon', 'Lost Track of Time', 'All Night Long', 'Goon Binge'],
    edging: ['Edge Lord', 'Denial Session', "Don't You Dare", 'Building Forever']
  }
}

// Export defaults for use elsewhere
export {
  DEFAULTS,
  DEFAULT_AVATAR,
  DEFAULT_PERSONALITY_VELVET,
  DEFAULT_PERSONALITY_PEPPER,
  DEFAULT_PERSONALITY_NOVA,
  DEFAULT_MOTIFS
}
