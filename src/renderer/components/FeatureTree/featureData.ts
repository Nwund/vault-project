// File: src/renderer/components/FeatureTree/featureData.ts
// Complete feature definitions for the interactive project roadmap
// Verified against actual codebase: 2026-01-26

export type FeatureStatus =
  | 'active'        // Working and enabled
  | 'disabled'      // Working but maintenance mode
  | 'in-progress'   // Being worked on
  | 'planned'       // Discussed but not started
  | 'broken'        // Has known issues
  | 'idea'          // Just an idea/suggestion

export type FeatureCategory =
  | 'core'          // Essential functionality
  | 'ui'            // User interface
  | 'ai'            // AI/Diabella features
  | 'media'         // Media handling
  | 'social'        // Stats, achievements
  | 'settings'      // Configuration
  | 'experimental'  // New/testing

export interface FeatureNode {
  id: string
  name: string
  description: string
  status: FeatureStatus
  category: FeatureCategory
  progress: number // 0-100
  parentId: string | null // For hierarchy
  children: string[] // Child feature IDs
  dependencies: string[] // Required features
  notes: string
  addedDate: string
  lastUpdated: string
  codeLocations: string[]
  discussedIn: string[]
  tags: string[]
  position?: { x: number; y: number }
  pinned?: boolean
}

// Status colors for visualization
export const STATUS_COLORS: Record<FeatureStatus, string> = {
  'active': '#10b981',
  'disabled': '#f59e0b',
  'in-progress': '#3b82f6',
  'planned': '#8b5cf6',
  'broken': '#ef4444',
  'idea': '#ec4899'
}

// Category colors
export const CATEGORY_COLORS: Record<FeatureCategory, string> = {
  'core': '#ec4899',
  'ui': '#06b6d4',
  'ai': '#8b5cf6',
  'media': '#f97316',
  'social': '#10b981',
  'settings': '#6366f1',
  'experimental': '#f43f5e'
}

// Position clusters for organized layout
const CLUSTERS = {
  center: { x: 500, y: 400 },
  library: { x: 200, y: 200 },
  goonwall: { x: 800, y: 200 },
  quickmix: { x: 200, y: 600 },
  ai: { x: 800, y: 600 },
  media: { x: 500, y: 150 },
  settings: { x: 500, y: 650 },
  social: { x: 1100, y: 400 }
}

export const INITIAL_FEATURES: FeatureNode[] = [
  // ═══════════════════════════════════════════════════════════════════════════
  // VAULT CORE - Center of everything
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'vault-core',
    name: 'Vault Core',
    description: 'Electron + React + TypeScript + SQLite foundation',
    status: 'active',
    category: 'core',
    progress: 100,
    parentId: null,
    children: ['library', 'goon-wall', 'quick-mix', 'feed', 'diabella', 'playlists', 'settings', 'media-system', 'stats-system'],
    dependencies: [],
    notes: 'Rock solid foundation - all systems operational',
    addedDate: '2024-01-01',
    lastUpdated: '2026-01-26',
    codeLocations: ['src/main/main.ts', 'src/renderer/App.tsx', 'src/main/db.ts'],
    discussedIn: [],
    tags: ['foundation', 'electron', 'react', 'sqlite'],
    position: CLUSTERS.center,
    pinned: true
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // LIBRARY - Top Left Cluster
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'library',
    name: 'Library',
    description: 'Media library with grid, search, filtering, and floating players',
    status: 'active',
    category: 'core',
    progress: 100,
    parentId: 'vault-core',
    children: ['library-grid', 'library-search', 'library-tags', 'floating-players', 'hover-preview'],
    dependencies: ['media-system'],
    notes: 'Fully functional - 3 layouts, pagination, keyboard nav',
    addedDate: '2024-01-01',
    lastUpdated: '2026-01-26',
    codeLocations: ['src/renderer/App.tsx'],
    discussedIn: [],
    tags: ['ui', 'media', 'core'],
    position: { x: CLUSTERS.library.x, y: CLUSTERS.library.y }
  },
  {
    id: 'library-grid',
    name: 'Media Grid',
    description: 'Virtualized grid with react-window, 3 layout modes',
    status: 'active',
    category: 'ui',
    progress: 100,
    parentId: 'library',
    children: [],
    dependencies: [],
    notes: 'Grid/Compact/Large modes, pagination 20-500 items',
    addedDate: '2024-01-01',
    lastUpdated: '2026-01-26',
    codeLocations: ['src/renderer/App.tsx'],
    discussedIn: [],
    tags: ['virtualization', 'performance'],
    position: { x: CLUSTERS.library.x - 100, y: CLUSTERS.library.y - 80 }
  },
  {
    id: 'library-search',
    name: 'Search & Filter',
    description: 'Text search, type filters, tag filters with autocomplete',
    status: 'active',
    category: 'ui',
    progress: 100,
    parentId: 'library',
    children: [],
    dependencies: [],
    notes: 'Debounced search, history, tag suggestions',
    addedDate: '2024-01-01',
    lastUpdated: '2026-01-26',
    codeLocations: ['src/renderer/App.tsx', 'src/main/db.ts'],
    discussedIn: [],
    tags: ['search', 'autocomplete'],
    position: { x: CLUSTERS.library.x + 100, y: CLUSTERS.library.y - 80 }
  },
  {
    id: 'library-tags',
    name: 'Tag System',
    description: 'Full tag CRUD, visibility control, quick refresh',
    status: 'active',
    category: 'ui',
    progress: 100,
    parentId: 'library',
    children: [],
    dependencies: [],
    notes: 'Tag selector, hide/show, bulk assignment',
    addedDate: '2024-01-01',
    lastUpdated: '2026-01-26',
    codeLocations: ['src/main/db.ts', 'src/renderer/App.tsx'],
    discussedIn: [],
    tags: ['tags', 'organization'],
    position: { x: CLUSTERS.library.x - 100, y: CLUSTERS.library.y + 80 }
  },
  {
    id: 'floating-players',
    name: 'Floating Players',
    description: 'Up to 4 simultaneous floating video players',
    status: 'active',
    category: 'ui',
    progress: 100,
    parentId: 'library',
    children: [],
    dependencies: [],
    notes: 'Drag-drop, collision detection, no duplicates',
    addedDate: '2024-01-10',
    lastUpdated: '2026-01-26',
    codeLocations: ['src/renderer/App.tsx'],
    discussedIn: [],
    tags: ['video', 'pip', 'multitask'],
    position: { x: CLUSTERS.library.x + 100, y: CLUSTERS.library.y + 80 }
  },
  {
    id: 'hover-preview',
    name: 'Hover Preview',
    description: 'Video preview on thumbnail hover',
    status: 'active',
    category: 'ui',
    progress: 100,
    parentId: 'library',
    children: [],
    dependencies: [],
    notes: 'Muted preview with audio toggle option',
    addedDate: '2024-01-15',
    lastUpdated: '2026-01-26',
    codeLocations: ['src/renderer/App.tsx'],
    discussedIn: [],
    tags: ['preview', 'ux'],
    position: { x: CLUSTERS.library.x, y: CLUSTERS.library.y + 120 }
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // GOON WALL - Top Right Cluster
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'goon-wall',
    name: 'Goon Wall',
    description: 'Multi-tile video wall with intensity-based shuffling',
    status: 'active',
    category: 'core',
    progress: 100,
    parentId: 'vault-core',
    children: ['goon-tiles', 'goon-layouts', 'goon-shuffle', 'goon-effects'],
    dependencies: ['media-system'],
    notes: 'Fully featured - 4-16 tiles, 4 layouts, visual effects',
    addedDate: '2024-01-01',
    lastUpdated: '2026-01-26',
    codeLocations: ['src/renderer/pages/GoonWallPage.tsx'],
    discussedIn: [],
    tags: ['goon', 'tiles', 'shuffle'],
    position: { x: CLUSTERS.goonwall.x, y: CLUSTERS.goonwall.y }
  },
  {
    id: 'goon-tiles',
    name: 'Tile System',
    description: 'Configurable 4-16 tiles with individual controls',
    status: 'active',
    category: 'ui',
    progress: 100,
    parentId: 'goon-wall',
    children: [],
    dependencies: [],
    notes: 'Independent refresh, audio toggle per tile',
    addedDate: '2024-01-01',
    lastUpdated: '2026-01-26',
    codeLocations: ['src/renderer/pages/GoonWallPage.tsx'],
    discussedIn: [],
    tags: ['tiles', 'config'],
    position: { x: CLUSTERS.goonwall.x - 100, y: CLUSTERS.goonwall.y - 80 }
  },
  {
    id: 'goon-layouts',
    name: 'Layout Modes',
    description: 'Grid, Columns, Mosaic, Chaos layouts',
    status: 'active',
    category: 'ui',
    progress: 100,
    parentId: 'goon-wall',
    children: [],
    dependencies: [],
    notes: '4 unique layouts for variety',
    addedDate: '2024-01-05',
    lastUpdated: '2026-01-26',
    codeLocations: ['src/renderer/pages/GoonWallPage.tsx'],
    discussedIn: [],
    tags: ['layouts', 'variety'],
    position: { x: CLUSTERS.goonwall.x + 100, y: CLUSTERS.goonwall.y - 80 }
  },
  {
    id: 'goon-shuffle',
    name: 'Intensity Shuffle',
    description: 'Intensity 1-10 controls shuffle speed (30s to 2s)',
    status: 'active',
    category: 'core',
    progress: 100,
    parentId: 'goon-wall',
    children: [],
    dependencies: [],
    notes: 'Fisher-Yates shuffle, no duplicate tiles',
    addedDate: '2024-01-01',
    lastUpdated: '2026-01-26',
    codeLocations: ['src/renderer/pages/GoonWallPage.tsx'],
    discussedIn: [],
    tags: ['shuffle', 'intensity'],
    position: { x: CLUSTERS.goonwall.x - 100, y: CLUSTERS.goonwall.y + 80 }
  },
  {
    id: 'goon-effects',
    name: 'Visual Effects',
    description: 'Sparkles, Bokeh, Starfield, Film Grain, Dreamy Haze',
    status: 'active',
    category: 'ui',
    progress: 100,
    parentId: 'goon-wall',
    children: [],
    dependencies: [],
    notes: 'Toggle overlays for enhanced experience',
    addedDate: '2024-01-10',
    lastUpdated: '2026-01-26',
    codeLocations: ['src/renderer/pages/GoonWallPage.tsx'],
    discussedIn: [],
    tags: ['effects', 'visual', 'aesthetic'],
    position: { x: CLUSTERS.goonwall.x + 100, y: CLUSTERS.goonwall.y + 80 }
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // QUICK MIX (DAYLIST) - Bottom Left Cluster
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'quick-mix',
    name: 'Quick Mix',
    description: 'Daily smart playlist with intensity curve',
    status: 'active',
    category: 'core',
    progress: 100,
    parentId: 'vault-core',
    children: ['daylist-generation', 'daylist-motif', 'daylist-intensity'],
    dependencies: ['media-system'],
    notes: 'Taste-based generation, procedural naming',
    addedDate: '2024-01-01',
    lastUpdated: '2026-01-26',
    codeLocations: ['src/renderer/pages/DaylistPage.tsx'],
    discussedIn: [],
    tags: ['daylist', 'smart', 'playlist'],
    position: { x: CLUSTERS.quickmix.x, y: CLUSTERS.quickmix.y }
  },
  {
    id: 'daylist-generation',
    name: 'Smart Generation',
    description: 'Taste profile-based selection with intensity weighting',
    status: 'active',
    category: 'ai',
    progress: 100,
    parentId: 'quick-mix',
    children: [],
    dependencies: [],
    notes: 'Uses recently viewed, top rated, most viewed',
    addedDate: '2024-01-01',
    lastUpdated: '2026-01-26',
    codeLocations: ['src/renderer/pages/DaylistPage.tsx'],
    discussedIn: [],
    tags: ['algorithm', 'smart'],
    position: { x: CLUSTERS.quickmix.x - 80, y: CLUSTERS.quickmix.y - 80 }
  },
  {
    id: 'daylist-motif',
    name: 'Procedural Naming',
    description: 'Time-based motif generation with emoji',
    status: 'active',
    category: 'ui',
    progress: 100,
    parentId: 'quick-mix',
    children: [],
    dependencies: [],
    notes: '25 themes, 6 time categories, emoji spice',
    addedDate: '2024-01-05',
    lastUpdated: '2026-01-26',
    codeLocations: ['src/renderer/pages/DaylistPage.tsx'],
    discussedIn: [],
    tags: ['naming', 'fun'],
    position: { x: CLUSTERS.quickmix.x + 80, y: CLUSTERS.quickmix.y - 80 }
  },
  {
    id: 'daylist-intensity',
    name: 'Intensity Curve',
    description: 'Visual intensity progression display',
    status: 'active',
    category: 'ui',
    progress: 100,
    parentId: 'quick-mix',
    children: [],
    dependencies: [],
    notes: 'Dynamic bars showing buildup/peak',
    addedDate: '2024-01-10',
    lastUpdated: '2026-01-26',
    codeLocations: ['src/renderer/pages/DaylistPage.tsx'],
    discussedIn: [],
    tags: ['visualization', 'curve'],
    position: { x: CLUSTERS.quickmix.x, y: CLUSTERS.quickmix.y + 80 }
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // FEED - Between Library and Quick Mix
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'feed',
    name: 'Feed',
    description: 'TikTok-style vertical scrolling video feed',
    status: 'active',
    category: 'core',
    progress: 100,
    parentId: 'vault-core',
    children: [],
    dependencies: ['media-system'],
    notes: 'Keyboard nav, tag filtering, like system',
    addedDate: '2024-01-15',
    lastUpdated: '2026-01-26',
    codeLocations: ['src/renderer/pages/FeedPage.tsx'],
    discussedIn: [],
    tags: ['feed', 'tiktok', 'scroll'],
    position: { x: 100, y: 400 }
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // PLAYLISTS - Near Settings
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'playlists',
    name: 'Playlists',
    description: 'Custom playlists with drag-drop reordering',
    status: 'active',
    category: 'core',
    progress: 100,
    parentId: 'vault-core',
    children: [],
    dependencies: ['media-system'],
    notes: 'CRUD, reorder, duplicate, M3U export',
    addedDate: '2024-01-01',
    lastUpdated: '2026-01-26',
    codeLocations: ['src/renderer/pages/PlaylistsPage.tsx', 'src/main/db.ts'],
    discussedIn: [],
    tags: ['playlist', 'organize'],
    position: { x: 350, y: 550 }
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // DIABELLA AI - Bottom Right Cluster
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'diabella',
    name: 'Diabella AI',
    description: 'AI companion with chat, voice, and avatar',
    status: 'disabled',
    category: 'ai',
    progress: 95,
    parentId: 'vault-core',
    children: ['diabella-chat', 'diabella-voice', 'diabella-avatar', 'diabella-personality'],
    dependencies: [],
    notes: 'Backend complete - disabled for UI polish',
    addedDate: '2024-01-01',
    lastUpdated: '2026-01-26',
    codeLocations: ['src/renderer/pages/DiabellaPage.tsx', 'src/main/services/'],
    discussedIn: [],
    tags: ['ai', 'companion', 'chat'],
    position: { x: CLUSTERS.ai.x, y: CLUSTERS.ai.y }
  },
  {
    id: 'diabella-chat',
    name: 'Chat Engine',
    description: 'Venice AI uncensored chat with memory',
    status: 'disabled',
    category: 'ai',
    progress: 100,
    parentId: 'diabella',
    children: [],
    dependencies: [],
    notes: 'Full implementation, context-aware responses',
    addedDate: '2024-01-01',
    lastUpdated: '2026-01-26',
    codeLocations: ['src/main/services/ChatEngine.ts'],
    discussedIn: [],
    tags: ['chat', 'venice'],
    position: { x: CLUSTERS.ai.x - 100, y: CLUSTERS.ai.y - 80 }
  },
  {
    id: 'diabella-voice',
    name: 'Voice System',
    description: 'TTS synthesis with 4 voice options',
    status: 'disabled',
    category: 'ai',
    progress: 100,
    parentId: 'diabella',
    children: [],
    dependencies: [],
    notes: 'af_sky, af_bella, af_sarah, af_nicole',
    addedDate: '2024-01-05',
    lastUpdated: '2026-01-26',
    codeLocations: ['src/main/services/VoiceEngine.ts'],
    discussedIn: [],
    tags: ['voice', 'tts'],
    position: { x: CLUSTERS.ai.x + 100, y: CLUSTERS.ai.y - 80 }
  },
  {
    id: 'diabella-avatar',
    name: 'Avatar Generator',
    description: '8 art styles with full customization',
    status: 'disabled',
    category: 'ai',
    progress: 100,
    parentId: 'diabella',
    children: [],
    dependencies: [],
    notes: 'Anime, western, semi-realistic, noir, pin-up, cyberpunk, fantasy, minimalist',
    addedDate: '2024-01-10',
    lastUpdated: '2026-01-26',
    codeLocations: ['src/main/services/AvatarGenerator.ts'],
    discussedIn: [],
    tags: ['avatar', 'art'],
    position: { x: CLUSTERS.ai.x - 100, y: CLUSTERS.ai.y + 80 }
  },
  {
    id: 'diabella-personality',
    name: 'Personality Packs',
    description: 'Swappable personality with voice lines',
    status: 'disabled',
    category: 'ai',
    progress: 95,
    parentId: 'diabella',
    children: [],
    dependencies: [],
    notes: 'System prompts, weighted voice lines, spice levels',
    addedDate: '2024-01-15',
    lastUpdated: '2026-01-26',
    codeLocations: ['src/main/services/PersonalityPacks.ts'],
    discussedIn: [],
    tags: ['personality', 'customization'],
    position: { x: CLUSTERS.ai.x + 100, y: CLUSTERS.ai.y + 80 }
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // MEDIA SYSTEM - Top Center Cluster
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'media-system',
    name: 'Media System',
    description: 'Scanner, thumbnails, analysis, and metadata',
    status: 'active',
    category: 'media',
    progress: 100,
    parentId: 'vault-core',
    children: ['media-scanner', 'thumbnails', 'media-analysis', 'ai-tagging'],
    dependencies: [],
    notes: 'Complete media pipeline - 47+ formats supported',
    addedDate: '2024-01-01',
    lastUpdated: '2026-01-26',
    codeLocations: ['src/main/media-utils.ts', 'src/main/db.ts'],
    discussedIn: [],
    tags: ['media', 'ffmpeg'],
    position: { x: CLUSTERS.media.x, y: CLUSTERS.media.y }
  },
  {
    id: 'media-scanner',
    name: 'File Scanner',
    description: 'Recursive scanning with 47+ format support',
    status: 'active',
    category: 'media',
    progress: 100,
    parentId: 'media-system',
    children: [],
    dependencies: [],
    notes: 'Videos, images, GIFs - symlink support',
    addedDate: '2024-01-01',
    lastUpdated: '2026-01-26',
    codeLocations: ['src/main/media-utils.ts'],
    discussedIn: [],
    tags: ['scanner', 'import'],
    position: { x: CLUSTERS.media.x - 120, y: CLUSTERS.media.y - 80 }
  },
  {
    id: 'thumbnails',
    name: 'Thumbnails',
    description: 'FFmpeg thumbnail extraction with caching',
    status: 'active',
    category: 'media',
    progress: 100,
    parentId: 'media-system',
    children: [],
    dependencies: [],
    notes: '480px width, stable cache naming',
    addedDate: '2024-01-01',
    lastUpdated: '2026-01-26',
    codeLocations: ['src/main/media-utils.ts'],
    discussedIn: [],
    tags: ['thumbnails', 'cache'],
    position: { x: CLUSTERS.media.x + 120, y: CLUSTERS.media.y - 80 }
  },
  {
    id: 'media-analysis',
    name: 'Media Analysis',
    description: 'Duration, dimensions, format metadata',
    status: 'active',
    category: 'media',
    progress: 100,
    parentId: 'media-system',
    children: [],
    dependencies: [],
    notes: 'FFprobe analysis with job queue',
    addedDate: '2024-01-05',
    lastUpdated: '2026-01-26',
    codeLocations: ['src/main/media-utils.ts'],
    discussedIn: [],
    tags: ['analysis', 'metadata'],
    position: { x: CLUSTERS.media.x - 120, y: CLUSTERS.media.y + 60 }
  },
  {
    id: 'ai-tagging',
    name: 'AI Tagging',
    description: 'NSFW, Smart, and Hybrid taggers',
    status: 'active',
    category: 'ai',
    progress: 100,
    parentId: 'media-system',
    children: [],
    dependencies: [],
    notes: 'ML-based classification, batch processing',
    addedDate: '2024-01-10',
    lastUpdated: '2026-01-26',
    codeLocations: ['src/main/services/NSFWTagger.ts', 'src/main/services/SmartTagger.ts'],
    discussedIn: [],
    tags: ['ai', 'tagging', 'ml'],
    position: { x: CLUSTERS.media.x + 120, y: CLUSTERS.media.y + 60 }
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // STATS SYSTEM - Right Side Cluster
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'stats-system',
    name: 'Stats & Achievements',
    description: 'Comprehensive tracking with 50+ achievements',
    status: 'disabled',
    category: 'social',
    progress: 95,
    parentId: 'vault-core',
    children: ['stats-tracking', 'achievements', 'session-modes'],
    dependencies: [],
    notes: 'Backend complete - disabled for heatmap viz',
    addedDate: '2024-01-01',
    lastUpdated: '2026-01-26',
    codeLocations: ['src/main/db.ts', 'src/main/ipc.ts'],
    discussedIn: [],
    tags: ['stats', 'tracking'],
    position: { x: CLUSTERS.social.x, y: CLUSTERS.social.y }
  },
  {
    id: 'stats-tracking',
    name: 'Usage Tracking',
    description: '20+ metrics tracked in real-time',
    status: 'disabled',
    category: 'social',
    progress: 100,
    parentId: 'stats-system',
    children: [],
    dependencies: [],
    notes: 'Sessions, time, edges, orgasms, streaks',
    addedDate: '2024-01-01',
    lastUpdated: '2026-01-26',
    codeLocations: ['src/main/db.ts'],
    discussedIn: [],
    tags: ['metrics', 'tracking'],
    position: { x: CLUSTERS.social.x - 80, y: CLUSTERS.social.y - 80 }
  },
  {
    id: 'achievements',
    name: 'Achievement System',
    description: '50+ achievements across 5 categories',
    status: 'disabled',
    category: 'social',
    progress: 100,
    parentId: 'stats-system',
    children: [],
    dependencies: [],
    notes: 'Getting Started, Edging, Sessions, Goon Wall, Diabella + secrets',
    addedDate: '2024-01-05',
    lastUpdated: '2026-01-26',
    codeLocations: ['src/main/ipc.ts'],
    discussedIn: [],
    tags: ['achievements', 'gamification'],
    position: { x: CLUSTERS.social.x + 80, y: CLUSTERS.social.y - 80 }
  },
  {
    id: 'session-modes',
    name: 'Session Modes',
    description: '8 preset modes with customized settings',
    status: 'disabled',
    category: 'social',
    progress: 100,
    parentId: 'stats-system',
    children: [],
    dependencies: [],
    notes: 'Quick Release, Edge Training, Hypno Goon, Sensory Overload, etc.',
    addedDate: '2024-01-10',
    lastUpdated: '2026-01-26',
    codeLocations: ['src/main/ipc.ts'],
    discussedIn: [],
    tags: ['modes', 'presets'],
    position: { x: CLUSTERS.social.x, y: CLUSTERS.social.y + 80 }
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // SETTINGS - Bottom Center Cluster
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'settings',
    name: 'Settings',
    description: 'Comprehensive settings with 50+ options',
    status: 'active',
    category: 'settings',
    progress: 100,
    parentId: 'vault-core',
    children: ['settings-library', 'settings-playback', 'settings-goonwall', 'settings-appearance', 'settings-themes'],
    dependencies: [],
    notes: '7 categories, persistent storage',
    addedDate: '2024-01-01',
    lastUpdated: '2026-01-26',
    codeLocations: ['src/main/settings.ts', 'src/renderer/pages/SettingsPage.tsx'],
    discussedIn: [],
    tags: ['settings', 'config'],
    position: { x: CLUSTERS.settings.x, y: CLUSTERS.settings.y }
  },
  {
    id: 'settings-library',
    name: 'Library Settings',
    description: 'Directories, cache, scan options',
    status: 'active',
    category: 'settings',
    progress: 100,
    parentId: 'settings',
    children: [],
    dependencies: [],
    notes: 'Add/remove dirs, cache location, auto-scan',
    addedDate: '2024-01-01',
    lastUpdated: '2026-01-26',
    codeLocations: ['src/main/settings.ts'],
    discussedIn: [],
    tags: ['library', 'config'],
    position: { x: CLUSTERS.settings.x - 150, y: CLUSTERS.settings.y - 60 }
  },
  {
    id: 'settings-playback',
    name: 'Playback Settings',
    description: 'Volume, autoplay, loop, speed options',
    status: 'active',
    category: 'settings',
    progress: 100,
    parentId: 'settings',
    children: [],
    dependencies: [],
    notes: 'Hardware acceleration, skip intro',
    addedDate: '2024-01-01',
    lastUpdated: '2026-01-26',
    codeLocations: ['src/main/settings.ts'],
    discussedIn: [],
    tags: ['playback', 'video'],
    position: { x: CLUSTERS.settings.x + 150, y: CLUSTERS.settings.y - 60 }
  },
  {
    id: 'settings-goonwall',
    name: 'Goon Wall Settings',
    description: 'Tiles, layout, interval, hypno mode, effects',
    status: 'active',
    category: 'settings',
    progress: 100,
    parentId: 'settings',
    children: [],
    dependencies: [],
    notes: 'Comprehensive goon wall customization',
    addedDate: '2024-01-05',
    lastUpdated: '2026-01-26',
    codeLocations: ['src/main/settings.ts'],
    discussedIn: [],
    tags: ['goonwall', 'config'],
    position: { x: CLUSTERS.settings.x - 150, y: CLUSTERS.settings.y + 60 }
  },
  {
    id: 'settings-appearance',
    name: 'Appearance Settings',
    description: 'Pixel background, cursor, particles, effects',
    status: 'active',
    category: 'settings',
    progress: 100,
    parentId: 'settings',
    children: [],
    dependencies: [],
    notes: 'Visual customization options',
    addedDate: '2024-01-10',
    lastUpdated: '2026-01-26',
    codeLocations: ['src/main/settings.ts'],
    discussedIn: [],
    tags: ['appearance', 'visual'],
    position: { x: CLUSTERS.settings.x + 150, y: CLUSTERS.settings.y + 60 }
  },
  {
    id: 'settings-themes',
    name: 'Theme System',
    description: '20 themes (10 classic + 10 goon)',
    status: 'disabled',
    category: 'settings',
    progress: 100,
    parentId: 'settings',
    children: [],
    dependencies: [],
    notes: 'Full implementation - switching disabled for UX',
    addedDate: '2024-01-15',
    lastUpdated: '2026-01-26',
    codeLocations: ['src/main/settings.ts', 'src/renderer/index.css'],
    discussedIn: [],
    tags: ['themes', 'colors'],
    position: { x: CLUSTERS.settings.x, y: CLUSTERS.settings.y + 120 }
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // ROADMAP/FEATURE TREE - Self Reference
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'feature-tree',
    name: 'Feature Tree',
    description: 'This interactive roadmap visualization',
    status: 'active',
    category: 'ui',
    progress: 100,
    parentId: null,
    children: [],
    dependencies: [],
    notes: 'Physics simulation, particles, clustering',
    addedDate: '2024-01-20',
    lastUpdated: '2026-01-26',
    codeLocations: ['src/renderer/components/FeatureTree/'],
    discussedIn: [],
    tags: ['meta', 'roadmap', 'visualization'],
    position: { x: 900, y: 400 }
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // PLANNED FEATURES - Ideas Cluster
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'ideas',
    name: 'Future Ideas',
    description: 'Features being considered',
    status: 'idea',
    category: 'experimental',
    progress: 0,
    parentId: null,
    children: ['idea-social', 'idea-mobile', 'idea-plugins', 'idea-cloud'],
    dependencies: [],
    notes: 'Brainstorm area',
    addedDate: '2024-01-26',
    lastUpdated: '2026-01-26',
    codeLocations: [],
    discussedIn: [],
    tags: ['ideas', 'future'],
    position: { x: 1200, y: 200 }
  },
  {
    id: 'idea-social',
    name: 'Social Features',
    description: 'Sharing, profiles, community',
    status: 'idea',
    category: 'social',
    progress: 0,
    parentId: 'ideas',
    children: [],
    dependencies: [],
    notes: 'Community sharing ideas',
    addedDate: '2024-01-26',
    lastUpdated: '2026-01-26',
    codeLocations: [],
    discussedIn: [],
    tags: ['social', 'community'],
    position: { x: 1150, y: 120 }
  },
  {
    id: 'idea-mobile',
    name: 'Mobile App',
    description: 'React Native companion app',
    status: 'idea',
    category: 'experimental',
    progress: 0,
    parentId: 'ideas',
    children: [],
    dependencies: [],
    notes: 'Remote control, sync',
    addedDate: '2024-01-26',
    lastUpdated: '2026-01-26',
    codeLocations: [],
    discussedIn: [],
    tags: ['mobile', 'app'],
    position: { x: 1250, y: 120 }
  },
  {
    id: 'idea-plugins',
    name: 'Plugin System',
    description: 'Extensible plugin architecture',
    status: 'idea',
    category: 'experimental',
    progress: 0,
    parentId: 'ideas',
    children: [],
    dependencies: [],
    notes: 'Custom themes, features, integrations',
    addedDate: '2024-01-26',
    lastUpdated: '2026-01-26',
    codeLocations: [],
    discussedIn: [],
    tags: ['plugins', 'extensibility'],
    position: { x: 1150, y: 280 }
  },
  {
    id: 'idea-cloud',
    name: 'Cloud Sync',
    description: 'Settings and metadata sync',
    status: 'idea',
    category: 'experimental',
    progress: 0,
    parentId: 'ideas',
    children: [],
    dependencies: [],
    notes: 'Cross-device synchronization',
    addedDate: '2024-01-26',
    lastUpdated: '2026-01-26',
    codeLocations: [],
    discussedIn: [],
    tags: ['cloud', 'sync'],
    position: { x: 1250, y: 280 }
  }
]
