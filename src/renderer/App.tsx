// File: src/renderer/App.tsx
// ============================================
// MAINTENANCE FLAGS - Set to true to disable features
// ============================================
const THEMES_DISABLED = true           // Disable theme switching, use default obsidian
const APPEARANCE_DISABLED = true       // Disable all appearance settings (pixel bg, cursors, effects)
// ============================================

import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import {
  themes,
  THEME_LIST,
  applyTheme as applyThemeCSS,
  injectEroticAnimations,
  isGoonTheme,
  GOON_THEME_LIST,
  type ThemeId
} from './styles/themes'
import { useDebounce, toFileUrlCached } from './hooks/usePerformance'
import { DiabellaAvatar } from './components/DiabellaAvatar'
import { TagSelector } from './components/TagSelector'
// Overlays disabled for cleaner look - keeping pixel background only
import { useHeatLevel } from './components/HeatOverlay'
// import { ArousalEffects } from './components/VisualStimulants'
import { PixelBackground, type PixelTheme, clearPixelThemeColors, THEME_COLORS } from './components/PixelBackground'

// Import pixel cursors
import cursorDefault from './assets/cursors/cursor.png'
import cursorPointer from './assets/cursors/pointer.png'
import cursorGrab from './assets/cursors/grab.png'
import { ErrorBoundary } from './components/ErrorBoundary'
import { fisherYatesShuffle, shuffleTake, randomPick } from './utils/shuffle'
import { cleanupVideo, useVideoPool, videoPool } from './hooks/useVideoCleanup'
import { LoginPage } from './pages/LoginPage'
import { FloatingVideoPlayer } from './components/FloatingVideoPlayer'
import {
  Library,
  Repeat,
  LayoutGrid,
  Flame,
  ListMusic,
  BarChart3,
  Heart,
  Settings,
  RefreshCw,
  Search,
  Play,
  Pause,
  Volume2,
  VolumeX,
  Shuffle,
  Eye,
  Star,
  Clock,
  Plus,
  Trash2,
  X,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Info,
  Crown,
  Zap,
  Wrench,
  Construction
} from 'lucide-react'
import { playGreeting, playSoundFromCategory, playClimaxForType, hasSounds } from './utils/soundPlayer'

type MediaType = 'video' | 'image' | 'gif'

type MediaRow = {
  id: string
  path: string
  type: MediaType
  filename?: string
  ext?: string
  size?: number          // File size in bytes
  mtimeMs?: number       // File modification time
  addedAt?: number       // When added to vault
  durationSec?: number | null
  thumbPath?: string | null
  width?: number | null
  height?: number | null
  hashSha256?: string | null
  phash?: string | null
}

type TagRow = { id: string; name: string }

type MarkerRow = {
  id: string
  mediaId: string
  timeSec: number
  title: string
}

type PlaylistRow = { id: string; name: string; createdAt?: number }
type PlaylistItemRow = { id: string; playlistId: string; mediaId: string; pos: number; addedAt?: number }

type MediaStatsRow = {
  mediaId: string
  rating?: number | null
  viewCount?: number
  oCount?: number
  lastViewedAt?: number | null
  progressSec?: number | null
}

type VaultSettings = {
  mediaDirs: string[]
  cacheDir: string
  ui: {
    themeId: string
    animations: boolean
  }
  goonwall?: {
    tileCount?: number
    tileMinPx?: number
    layout?: 'mosaic' | 'columns' | 'grid'
    intervalSec?: 20 | 30 | 45 | 60 | 90 | 120
    muted?: boolean
    showHud?: boolean
  }
  daylist?: {
    spice?: number
    motifs?: Record<string, string>
  }
  diabella?: {
    activePackId?: string
    packs?: any[]
  }
}

declare global {
  interface Window {
    api: any
    vaultDiagnostics?: any
  }
}

function cn(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(' ')
}

function formatBytes(n: number) {
  if (!Number.isFinite(n)) return ''
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let v = n
  let i = 0
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i += 1
  }
  return `${v.toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}

function formatDuration(sec: number | null | undefined) {
  if (!sec || sec <= 0) return ''
  const s = Math.floor(sec)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const r = s % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`
  return `${m}:${String(r).padStart(2, '0')}`
}

// Use themes from our theme system
const THEMES = THEME_LIST.map(t => ({ id: t.id, name: t.name }))

// Features under maintenance - set to true to disable
const MAINTENANCE_MODE = {
  diabella: true,
  playlists: true, // Sessions
  stats: true
}

const NAV = [
  { id: 'library', name: 'Library' },
  { id: 'goonwall', name: 'Goon Wall' },
  { id: 'daylist', name: "Today's Mix" },
  { id: 'playlists', name: 'Sessions', maintenance: MAINTENANCE_MODE.playlists },
  { id: 'stats', name: 'Stats', maintenance: MAINTENANCE_MODE.stats },
  { id: 'diabella', name: 'Diabella', maintenance: MAINTENANCE_MODE.diabella },
  { id: 'settings', name: 'Settings' },
  { id: 'about', name: 'About' }
] as const

// Map nav IDs to Lucide icons
const NavIcon: React.FC<{ id: string; active?: boolean }> = ({ id, active }) => {
  const iconProps = { size: 18, strokeWidth: active ? 2 : 1.5 }
  switch (id) {
    case 'library': return <Library {...iconProps} />
    case 'goonwall': return <LayoutGrid {...iconProps} />
    case 'daylist': return <Flame {...iconProps} />
    case 'playlists': return <ListMusic {...iconProps} />
    case 'stats': return <BarChart3 {...iconProps} />
    case 'diabella': return <Heart {...iconProps} />
    case 'settings': return <Settings {...iconProps} />
    case 'about': return <Info {...iconProps} />
    default: return null
  }
}

type NavId = (typeof NAV)[number]['id']

export default function App() {
  const [page, setPage] = useState<NavId>('library')
  const [settings, setSettings] = useState<VaultSettings | null>(null)
  const [sessionActive, setSessionActive] = useState(false)
  const [visualEffectsEnabled, setVisualEffectsEnabled] = useState(true)
  const [ambientHeatLevel, setAmbientHeatLevel] = useState(3) // Manual heat level for ambient effects
  const [goonModeEnabled, setGoonModeEnabled] = useState(false) // Floating text mode
  const [climaxTrigger, setClimaxTrigger] = useState(0) // Increment to trigger climax effect
  const [climaxType, setClimaxType] = useState<'cum' | 'squirt' | 'orgasm'>('orgasm')
  const [randomClimaxEnabled, setRandomClimaxEnabled] = useState(false) // Auto-trigger climax randomly
  const [screenShake, setScreenShake] = useState(0) // Screen shake intensity (0-10)

  // Ambient overlay toggles
  const [sparklesEnabled, setSparklesEnabled] = useState(true) // Sparkle/glitter
  const [bokehEnabled, setBokehEnabled] = useState(false) // Soft light circles
  const [starfieldEnabled, setStarfieldEnabled] = useState(false) // Twinkling stars
  const [filmGrainEnabled, setFilmGrainEnabled] = useState(false) // Vintage film grain
  const [dreamyHazeEnabled, setDreamyHazeEnabled] = useState(false) // Soft dreamy haze

  // Pixel background settings (simplified - just parallax)
  const [pixelTheme, setPixelTheme] = useState<PixelTheme | 'none'>('cityLights')
  const [pixelBackgroundEnabled, setPixelBackgroundEnabled] = useState(true)
  const [pixelParallaxStrength, setPixelParallaxStrength] = useState(35)
  const [pixelOpacity, setPixelOpacity] = useState(40)
  const [pixelCursorEnabled, setPixelCursorEnabled] = useState(true)

  // Track heat level based on session duration
  const sessionHeatLevel = useHeatLevel(sessionActive)

  // Use ambient level when not in session, session level when active
  const heatLevel = sessionActive ? sessionHeatLevel : ambientHeatLevel

  // Trigger climax effect with sound and screen shake
  const triggerClimax = useCallback((type: 'cum' | 'squirt' | 'orgasm' = 'orgasm') => {
    setClimaxType(type)
    setClimaxTrigger(prev => prev + 1)
    // Screen shake based on heat level (more intense at higher heat)
    const shakeIntensity = Math.min(10, heatLevel + 3)
    setScreenShake(shakeIntensity)
    setTimeout(() => setScreenShake(0), 800) // Shake for 800ms
    // Play climax/orgasm sound from NSFW Soundpack
    playClimaxForType(type, { volume: 0.85 })
  }, [heatLevel])

  // Random climax trigger effect
  useEffect(() => {
    if (!randomClimaxEnabled) return

    // Random interval between 30-90 seconds based on heat level
    const getRandomInterval = () => {
      const baseMin = 60000 - (heatLevel * 3000) // 60s at heat 0, 30s at heat 10
      const baseMax = 120000 - (heatLevel * 5000) // 120s at heat 0, 70s at heat 10
      return Math.random() * (baseMax - baseMin) + baseMin
    }

    const scheduleNextClimax = () => {
      const interval = getRandomInterval()
      return setTimeout(() => {
        // Randomly pick climax type
        const types: Array<'cum' | 'squirt' | 'orgasm'> = ['cum', 'squirt', 'orgasm']
        const randomType = types[Math.floor(Math.random() * types.length)]
        triggerClimax(randomType)
        // Schedule next one
        if (randomClimaxEnabled) {
          timerId = scheduleNextClimax()
        }
      }, interval)
    }

    let timerId = scheduleNextClimax()
    return () => clearTimeout(timerId)
  }, [randomClimaxEnabled, heatLevel, triggerClimax])

  const [selected, setSelected] = useState<string[]>([])

  useEffect(() => {
    // Inject sensual animations CSS
    injectEroticAnimations()

    let alive = true
    ;(async () => {
      const s = await window.api.settings.get()
      if (!alive) return
      setSettings(s)
    })()
    return () => {
      alive = false
    }
  }, [])

  // Apply theme using our theme system
  useEffect(() => {
    // MAINTENANCE: Themes disabled, always use obsidian
    if (THEMES_DISABLED) {
      applyThemeCSS('obsidian')
      return
    }
    // Try new settings structure first, fall back to legacy
    const themeId = (settings as any)?.appearance?.themeId ?? settings?.ui?.themeId ?? 'obsidian'
    // Only apply CSS theme if pixel background is disabled
    if (!pixelBackgroundEnabled || pixelTheme === 'none') {
      applyThemeCSS(themeId as ThemeId)
      clearPixelThemeColors()
    }
  }, [(settings as any)?.appearance?.themeId, settings?.ui?.themeId, pixelBackgroundEnabled, pixelTheme])

  const patchSettings = async (patch: Partial<VaultSettings>) => {
    const next = await window.api.settings.patch(patch)
    setSettings(next)
  }

  // Screen shake CSS
  const shakeStyle = screenShake > 0 ? {
    animation: `screenShake 0.1s ease-in-out infinite`,
    ['--shake-intensity' as string]: `${screenShake * 0.5}px`
  } : {}

  return (
    <div
      className="h-screen w-screen overflow-hidden"
      style={{ background: 'var(--bg)', ...shakeStyle }}
    >
      {/* Screen shake keyframes */}
      {screenShake > 0 && (
        <style>{`
          @keyframes screenShake {
            0%, 100% { transform: translate(0, 0) rotate(0deg); }
            10% { transform: translate(calc(var(--shake-intensity) * -1), var(--shake-intensity)) rotate(-0.5deg); }
            20% { transform: translate(var(--shake-intensity), calc(var(--shake-intensity) * -1)) rotate(0.5deg); }
            30% { transform: translate(calc(var(--shake-intensity) * -1), 0) rotate(0deg); }
            40% { transform: translate(var(--shake-intensity), var(--shake-intensity)) rotate(-0.3deg); }
            50% { transform: translate(0, calc(var(--shake-intensity) * -1)) rotate(0.3deg); }
            60% { transform: translate(calc(var(--shake-intensity) * -0.5), var(--shake-intensity)) rotate(0deg); }
            70% { transform: translate(var(--shake-intensity), 0) rotate(-0.2deg); }
            80% { transform: translate(calc(var(--shake-intensity) * -1), calc(var(--shake-intensity) * -0.5)) rotate(0.2deg); }
            90% { transform: translate(0, var(--shake-intensity)) rotate(0deg); }
          }
        `}</style>
      )}

      {/* Pixel Cursor CSS - disabled during maintenance */}
      {!APPEARANCE_DISABLED && pixelCursorEnabled && (
        <style>{`
          * { cursor: url(${cursorDefault}) 0 0, auto !important; }
          a, button, [role="button"], input[type="submit"], input[type="button"],
          .cursor-pointer, [onclick], select, label[for] {
            cursor: url(${cursorPointer}) 6 0, pointer !important;
          }
          .cursor-grab, [draggable="true"] { cursor: url(${cursorGrab}) 8 8, grab !important; }
          .cursor-grabbing { cursor: url(${cursorGrab}) 8 8, grabbing !important; }
        `}</style>
      )}

      {/* Pixel Art Background Layer - disabled during maintenance */}
      {!APPEARANCE_DISABLED && pixelBackgroundEnabled && pixelTheme !== 'none' && (
        <PixelBackground
          theme={pixelTheme}
          parallaxStrength={pixelParallaxStrength}
          opacity={pixelOpacity}
        />
      )}

      {/* Visual Effects Overlays - DISABLED for cleaner look */}
      {/* Keep pixel background only, no goon overlays */}

      <div className="h-full w-full flex">
        <aside className="w-[240px] shrink-0 border-r border-[var(--border)] bg-[var(--panel)]">
          <div className="p-5">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-2xl bg-gradient-to-br from-[var(--primary)] to-[var(--secondary)] flex items-center justify-center">
                <Sparkles size={20} className="text-white" />
              </div>
              <div>
                <div className="text-sm font-semibold">Vault</div>
                <div className="text-xs text-[var(--muted)]">1.0.5</div>
              </div>
            </div>
          </div>

          <nav className="px-3 pb-4">
            {NAV.map((n) => {
              const isActive = page === n.id
              const isMaintenance = 'maintenance' in n && n.maintenance
              return (
                <button
                  key={n.id}
                  onClick={() => setPage(n.id)}
                  className={cn(
                    'w-full text-left px-3 py-2.5 rounded-xl text-sm transition border flex items-center gap-3',
                    isActive
                      ? 'bg-[var(--primary)]/15 border-[var(--primary)]/30 text-[var(--primary)]'
                      : isMaintenance
                        ? 'bg-transparent border-transparent hover:bg-amber-500/5 hover:border-amber-500/10 text-white/40'
                        : 'bg-transparent border-transparent hover:bg-white/5 hover:border-white/10 text-[var(--text)]'
                  )}
                >
                  <NavIcon id={n.id} active={isActive} />
                  <span className="flex-1">{n.name}</span>
                  {isMaintenance && (
                    <Wrench size={12} className="text-amber-500/60" />
                  )}
                </button>
              )
            })}
          </nav>

          {/* Quick Actions */}
          <div className="px-4 pb-4 mt-auto">
            <div className="p-3 rounded-xl bg-black/20 border border-[var(--border)]">
              <div className="text-xs text-[var(--muted)] mb-2">Quick Actions</div>
              <div className="flex flex-col gap-2">
                <button
                  onClick={() => setPage('goonwall')}
                  className="w-full px-3 py-2 rounded-lg text-xs bg-[var(--primary)]/20 border border-[var(--primary)]/30 hover:bg-[var(--primary)]/30 transition text-left flex items-center gap-2"
                >
                  <Flame size={14} />
                  Start Goon Wall
                </button>
                <button
                  onClick={() => setPage('daylist')}
                  className="w-full px-3 py-2 rounded-lg text-xs bg-black/20 border border-[var(--border)] hover:border-white/15 transition text-left flex items-center gap-2"
                >
                  <Sparkles size={14} />
                  Today's Mix
                </button>
              </div>
            </div>
          </div>
        </aside>

        <main className="flex-1 min-w-0">
          {page === 'library' ? (
            <ErrorBoundary pageName="Library">
              <LibraryPage settings={settings} selected={selected} setSelected={setSelected} />
            </ErrorBoundary>
          ) : page === 'goonwall' ? (
            <ErrorBoundary pageName="Goon Wall">
              <GoonWallPage
                settings={settings}
                heatLevel={ambientHeatLevel}
                onHeatChange={setAmbientHeatLevel}
                goonMode={goonModeEnabled}
                onGoonModeChange={setGoonModeEnabled}
                randomClimax={randomClimaxEnabled}
                onRandomClimaxChange={setRandomClimaxEnabled}
                onClimax={triggerClimax}
                overlays={{
                  sparkles: sparklesEnabled,
                  bokeh: bokehEnabled,
                  starfield: starfieldEnabled,
                  filmGrain: filmGrainEnabled,
                  dreamyHaze: dreamyHazeEnabled,
                }}
                onOverlayToggle={(overlay) => {
                  switch (overlay) {
                    case 'sparkles': setSparklesEnabled(v => !v); break
                    case 'bokeh': setBokehEnabled(v => !v); break
                    case 'starfield': setStarfieldEnabled(v => !v); break
                    case 'filmGrain': setFilmGrainEnabled(v => !v); break
                    case 'dreamyHaze': setDreamyHazeEnabled(v => !v); break
                  }
                }}
              />
            </ErrorBoundary>
          ) : page === 'daylist' ? (
            <ErrorBoundary pageName="Today's Mix">
              <DaylistPage />
            </ErrorBoundary>
          ) : page === 'playlists' ? (
            MAINTENANCE_MODE.playlists ? <MaintenancePage featureName="Sessions" /> : <PlaylistsPage />
          ) : page === 'stats' ? (
            MAINTENANCE_MODE.stats ? <MaintenancePage featureName="Stats" /> : <StatsPage />
          ) : page === 'diabella' ? (
            MAINTENANCE_MODE.diabella ? <MaintenancePage featureName="Diabella AI Companion" /> : (
              <ErrorBoundary pageName="Diabella">
                <DiabellaPage />
              </ErrorBoundary>
            )
          ) : page === 'settings' ? (
            <SettingsPage
              settings={settings}
              patchSettings={patchSettings}
              visualEffectsEnabled={visualEffectsEnabled}
              setVisualEffectsEnabled={setVisualEffectsEnabled}
              ambientHeatLevel={ambientHeatLevel}
              setAmbientHeatLevel={setAmbientHeatLevel}
              sparklesEnabled={sparklesEnabled}
              setSparklesEnabled={setSparklesEnabled}
              bokehEnabled={bokehEnabled}
              setBokehEnabled={setBokehEnabled}
              starfieldEnabled={starfieldEnabled}
              setStarfieldEnabled={setStarfieldEnabled}
              filmGrainEnabled={filmGrainEnabled}
              setFilmGrainEnabled={setFilmGrainEnabled}
              dreamyHazeEnabled={dreamyHazeEnabled}
              setDreamyHazeEnabled={setDreamyHazeEnabled}
              pixelBackgroundEnabled={pixelBackgroundEnabled}
              setPixelBackgroundEnabled={setPixelBackgroundEnabled}
              pixelTheme={pixelTheme}
              setPixelTheme={setPixelTheme}
              pixelParallaxStrength={pixelParallaxStrength}
              setPixelParallaxStrength={setPixelParallaxStrength}
              pixelOpacity={pixelOpacity}
              setPixelOpacity={setPixelOpacity}
              pixelCursorEnabled={pixelCursorEnabled}
              setPixelCursorEnabled={setPixelCursorEnabled}
            />
          ) : page === 'about' ? (
            <AboutPage />
          ) : null}
        </main>
      </div>
    </div>
  )
}

function TopBar(props: { title: string; right?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="px-6 py-5 border-b border-[var(--border)] bg-[var(--panel)]">
      <div className="flex items-center justify-between">
        <div className="text-lg font-semibold">{props.title}</div>
        <div className="flex items-center gap-2">{props.right}</div>
      </div>
      {props.children ? <div className="mt-4">{props.children}</div> : null}
    </div>
  )
}

// Maintenance placeholder for features under development
function MaintenancePage({ featureName }: { featureName: string }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
      <div className="relative mb-6">
        <div className="w-24 h-24 rounded-full bg-gradient-to-br from-amber-500/20 to-orange-600/20 flex items-center justify-center border border-amber-500/30">
          <Construction size={40} className="text-amber-500" />
        </div>
        <div className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full bg-[var(--bg)] border border-amber-500/30 flex items-center justify-center">
          <Wrench size={14} className="text-amber-400" />
        </div>
      </div>

      <h2 className="text-2xl font-bold mb-2 bg-gradient-to-r from-amber-400 to-orange-500 bg-clip-text text-transparent">
        Under Maintenance
      </h2>

      <p className="text-white/60 max-w-md mb-6">
        <span className="font-semibold text-white/80">{featureName}</span> is temporarily unavailable while we work on improvements and new features.
      </p>

      <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-500/10 border border-amber-500/20">
        <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
        <span className="text-sm text-amber-400">Development in progress</span>
      </div>

      <div className="mt-8 text-xs text-white/40">
        Check back soon for updates
      </div>
    </div>
  )
}

function Btn(props: React.ButtonHTMLAttributes<HTMLButtonElement> & { tone?: 'primary' | 'ghost' | 'danger' }) {
  const tone = props.tone ?? 'ghost'
  const cls =
    tone === 'primary'
      ? 'bg-white/15 hover:bg-white/20 border-white/20'
      : tone === 'danger'
        ? 'bg-red-500/10 hover:bg-red-500/15 border-red-500/20'
        : 'bg-black/20 hover:bg-white/5 border-[var(--border)] hover:border-white/15'
  const { className, ...rest } = props
  return (
    <button
      {...rest}
      className={cn(
        'px-3 py-2 rounded-xl text-xs border transition disabled:opacity-50 disabled:cursor-not-allowed',
        cls,
        className
      )}
    />
  )
}

type SortOption = 'newest' | 'oldest' | 'name' | 'rating' | 'views' | 'ocount' | 'duration' | 'type' | 'size' | 'random'
type LayoutOption = 'grid' | 'compact' | 'large' | 'fit'

const MAX_FLOATING_PLAYERS = 4

const ITEMS_PER_PAGE = 60

function LibraryPage(props: { settings: VaultSettings | null; selected: string[]; setSelected: (ids: string[]) => void }) {
  const [media, setMedia] = useState<MediaRow[]>([])
  const [tags, setTags] = useState<TagRow[]>([])
  const [query, setQuery] = useState<string>('')
  const [activeTags, setActiveTags] = useState<string[]>([])
  const [typeFilter, setTypeFilter] = useState<MediaType | 'all'>('all')
  const [sortBy, setSortBy] = useState<SortOption>('newest')
  const [layout, setLayout] = useState<LayoutOption>('grid')
  const [openIds, setOpenIds] = useState<string[]>([]) // Support up to 4 floating players
  const [playerBounds, setPlayerBounds] = useState<Map<string, { x: number; y: number; width: number; height: number }>>(new Map())
  const [isLoading, setIsLoading] = useState(false)
  const [mediaStats, setMediaStats] = useState<Map<string, { rating: number; viewCount: number; oCount: number }>>(new Map())
  const [randomQuickTags, setRandomQuickTags] = useState<TagRow[]>([])
  const [displayLimit, setDisplayLimit] = useState(ITEMS_PER_PAGE)
  const [totalCount, setTotalCount] = useState(0)
  const [typeCounts, setTypeCounts] = useState<{ video: number; image: number; gif: number }>({ video: 0, image: 0, gif: 0 })
  const [randomSeed, setRandomSeed] = useState(0) // Used to trigger re-shuffle

  // Add a video to floating players (max 4) - STRICT: no duplicates, no exceeding max
  const addFloatingPlayer = useCallback((mediaId: string) => {
    setOpenIds(prev => {
      // Already open - do nothing
      if (prev.includes(mediaId)) return prev
      // At max capacity - do nothing (don't replace)
      if (prev.length >= MAX_FLOATING_PLAYERS) return prev
      // Add new player
      return [...prev, mediaId]
    })
  }, [])

  // Change media in a specific player slot (for skip/prev/next)
  const changeFloatingPlayerMedia = useCallback((oldMediaId: string, newMediaId: string) => {
    setOpenIds(prev => {
      // If new media is already open in another player, don't change
      if (prev.includes(newMediaId)) return prev
      // Replace the old ID with new ID in the same position
      return prev.map(id => id === oldMediaId ? newMediaId : id)
    })
  }, [])

  // Close a specific floating player
  const closeFloatingPlayer = useCallback((mediaId: string) => {
    setOpenIds(prev => prev.filter(id => id !== mediaId))
    setPlayerBounds(prev => {
      const next = new Map(prev)
      next.delete(mediaId)
      return next
    })
  }, [])

  // Update player bounds for collision detection
  const updatePlayerBounds = useCallback((mediaId: string, bounds: { x: number; y: number; width: number; height: number }) => {
    setPlayerBounds(prev => {
      const next = new Map(prev)
      next.set(mediaId, bounds)
      return next
    })
  }, [])

  // Close all floating players
  const closeAllFloatingPlayers = useCallback(() => {
    setOpenIds([])
  }, [])

  // Debounce search query to prevent excessive API calls
  const debouncedQuery = useDebounce(query, 300)

  // Randomize quick tags on mount and when tags change
  useEffect(() => {
    if (tags.length > 0) {
      const shuffled = [...tags].sort(() => Math.random() - 0.5)
      setRandomQuickTags(shuffled.slice(0, 10))
    }
  }, [tags])

  const refreshQuickTags = () => {
    if (tags.length > 0) {
      const shuffled = [...tags].sort(() => Math.random() - 0.5)
      setRandomQuickTags(shuffled.slice(0, 10))
    }
  }

  // Keyboard navigation state
  const [focusedIndex, setFocusedIndex] = useState(-1)
  const gridRef = useRef<HTMLDivElement>(null)

  // Calculate columns for keyboard navigation
  const getColumnsCount = useCallback(() => {
    if (!gridRef.current) return 4
    const gridWidth = gridRef.current.offsetWidth
    const minItemWidth = layout === 'compact' ? 160 : layout === 'large' ? 300 : 220
    return Math.floor(gridWidth / minItemWidth) || 1
  }, [layout])

  // Sort media based on selected option - MUST be before keyboard handler
  const sortedMedia = useMemo(() => {
    const sorted = [...media]
    switch (sortBy) {
      case 'newest':
        return sorted.sort((a, b) => (b.addedAt ?? 0) - (a.addedAt ?? 0))
      case 'oldest':
        return sorted.sort((a, b) => (a.addedAt ?? 0) - (b.addedAt ?? 0))
      case 'name':
        return sorted.sort((a, b) => (a.filename ?? a.path).localeCompare(b.filename ?? b.path))
      case 'rating':
        return sorted.sort((a, b) => (mediaStats.get(b.id)?.rating ?? 0) - (mediaStats.get(a.id)?.rating ?? 0))
      case 'views':
        return sorted.sort((a, b) => (mediaStats.get(b.id)?.viewCount ?? 0) - (mediaStats.get(a.id)?.viewCount ?? 0))
      case 'ocount':
        return sorted.sort((a, b) => (mediaStats.get(b.id)?.oCount ?? 0) - (mediaStats.get(a.id)?.oCount ?? 0))
      case 'duration':
        return sorted.sort((a, b) => (b.durationSec ?? 0) - (a.durationSec ?? 0))
      case 'type':
        const typeOrder: Record<string, number> = { video: 0, gif: 1, image: 2 }
        return sorted.sort((a, b) => {
          const aOrder = typeOrder[a.type] ?? 3
          const bOrder = typeOrder[b.type] ?? 3
          if (aOrder !== bOrder) return aOrder - bOrder
          return (b.addedAt ?? 0) - (a.addedAt ?? 0)
        })
      case 'size':
        return sorted.sort((a, b) => (b.size ?? 0) - (a.size ?? 0))
      case 'random':
        let seed = randomSeed || Date.now()
        const seededRandom = () => {
          seed = (seed * 9301 + 49297) % 233280
          return seed / 233280
        }
        for (let i = sorted.length - 1; i > 0; i--) {
          const j = Math.floor(seededRandom() * (i + 1))
          ;[sorted[i], sorted[j]] = [sorted[j], sorted[i]]
        }
        return sorted
      default:
        return sorted
    }
  }, [media, sortBy, mediaStats, randomSeed])

  // Keyboard navigation handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't handle if typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return

      const cols = getColumnsCount()
      const maxIndex = Math.min(displayLimit, sortedMedia.length) - 1

      switch (e.key) {
        case 'ArrowRight':
          e.preventDefault()
          setFocusedIndex(prev => Math.min(prev + 1, maxIndex))
          break
        case 'ArrowLeft':
          e.preventDefault()
          setFocusedIndex(prev => Math.max(prev - 1, 0))
          break
        case 'ArrowDown':
          e.preventDefault()
          setFocusedIndex(prev => Math.min(prev + cols, maxIndex))
          break
        case 'ArrowUp':
          e.preventDefault()
          setFocusedIndex(prev => Math.max(prev - cols, 0))
          break
        case 'Enter':
        case ' ':
          if (focusedIndex >= 0 && focusedIndex < sortedMedia.length) {
            e.preventDefault()
            const m = sortedMedia[focusedIndex]
            if (openIds.length < MAX_FLOATING_PLAYERS && !openIds.includes(m.id)) {
              addFloatingPlayer(m.id)
            }
          }
          break
        case 'Escape':
          setFocusedIndex(-1)
          break
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [focusedIndex, sortedMedia, displayLimit, getColumnsCount, openIds, addFloatingPlayer])

  // Reset focus when media changes
  useEffect(() => {
    setFocusedIndex(-1)
  }, [media])

  // Scroll focused item into view
  useEffect(() => {
    if (focusedIndex >= 0 && gridRef.current) {
      const items = gridRef.current.children
      if (items[focusedIndex]) {
        (items[focusedIndex] as HTMLElement).scrollIntoView({
          behavior: 'smooth',
          block: 'nearest'
        })
      }
    }
  }, [focusedIndex])

  const refresh = useCallback(async () => {
    setIsLoading(true)
    try {
      console.log('[Library] Refreshing media...')
      const m = await window.api.media.search({
        q: debouncedQuery,
        type: typeFilter === 'all' ? undefined : typeFilter,
        tags: activeTags
      })
      console.log('[Library] Raw response:', m)
      const items: MediaRow[] = Array.isArray(m) ? m : (m as any)?.items ?? (m as any)?.media ?? []
      console.log('[Library] Loaded items:', items.length)

      // Compute type counts
      const counts = { video: 0, image: 0, gif: 0 }
      for (const item of items) {
        if (item.type === 'video') counts.video++
        else if (item.type === 'image') counts.image++
        else if (item.type === 'gif') counts.gif++
      }
      setTypeCounts(counts)
      setTotalCount(items.length)

      // Fetch stats for sorting by rating/views/ocount
      if (sortBy === 'rating' || sortBy === 'views' || sortBy === 'ocount') {
        const statsMap = new Map<string, { rating: number; viewCount: number; oCount: number }>()
        await Promise.all(
          items.slice(0, 200).map(async (item) => {
            try {
              const stats = await window.api.media.getStats(item.id)
              if (stats) {
                statsMap.set(item.id, {
                  rating: stats.rating ?? 0,
                  viewCount: stats.viewCount ?? 0,
                  oCount: stats.oCount ?? 0
                })
              }
            } catch {}
          })
        )
        setMediaStats(statsMap)
      }

      setMedia(items)
    } finally {
      setIsLoading(false)
    }
  }, [debouncedQuery, typeFilter, activeTags, sortBy])

  useEffect(() => {
    let alive = true
    ;(async () => {
      const t = await window.api.tags.list()
      if (!alive) return
      setTags(t)
      await refresh()
    })()
    const unsub = window.api.events?.onVaultChanged?.(() => void refresh())
    return () => {
      alive = false
      unsub?.()
    }
  }, [])

  useEffect(() => {
    setDisplayLimit(ITEMS_PER_PAGE) // Reset pagination when filters change
    void refresh()
  }, [debouncedQuery, activeTags.join('|'), typeFilter, sortBy])

  const toggleSelect = (id: string) => {
    const s = new Set(props.selected)
    if (s.has(id)) s.delete(id)
    else s.add(id)
    props.setSelected(Array.from(s))
  }

  const toggleTag = (name: string) => {
    setActiveTags((prev) => (prev.includes(name) ? prev.filter((x) => x !== name) : [...prev, name]))
  }

  // Get grid style based on layout
  const getGridStyle = (): React.CSSProperties => {
    switch (layout) {
      case 'compact':
        return { gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '8px' }
      case 'large':
        return { gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '16px' }
      case 'fit':
        return { gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '12px' }
      default:
        return { gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '16px' }
    }
  }

  return (
    <>
      <TopBar
        title="Library"
        right={
          <div className="flex items-center gap-2">
            {/* Layout selector */}
            <div className="flex items-center gap-1 bg-black/20 rounded-lg p-0.5">
              {(['grid', 'compact', 'large', 'fit'] as LayoutOption[]).map((l) => (
                <button
                  key={l}
                  onClick={() => setLayout(l)}
                  className={cn(
                    'px-2 py-1 rounded text-xs capitalize transition',
                    layout === l ? 'bg-white/20' : 'hover:bg-white/10'
                  )}
                  title={l === 'fit' ? 'Fit to video size' : l}
                >
                  {l === 'fit' ? '⊞' : l === 'compact' ? '▦' : l === 'large' ? '▣' : '▤'}
                </button>
              ))}
            </div>

            {/* Active players indicator */}
            {openIds.length > 0 && (
              <div className="flex items-center gap-1 px-2 py-1 rounded-lg bg-[var(--primary)]/20 border border-[var(--primary)]/30">
                <Play size={12} className="text-[var(--primary)]" />
                <span className="text-xs text-[var(--primary)]">{openIds.length}/{MAX_FLOATING_PLAYERS}</span>
                <button
                  onClick={closeAllFloatingPlayers}
                  className="ml-1 p-0.5 hover:bg-white/20 rounded"
                  title="Close all players"
                >
                  <X size={10} />
                </button>
              </div>
            )}

            <Btn onClick={() => void refresh()} className="flex items-center gap-2">
              <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
            </Btn>
          </div>
        }
      >
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search..."
              className="w-full pl-10 pr-3 py-2 rounded-xl bg-black/20 border border-[var(--border)] outline-none focus:border-[var(--primary)]/50 text-sm"
            />
            {isLoading && (
              <RefreshCw size={14} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-[var(--muted)]" />
            )}
          </div>

          {/* Content Type Filter */}
          <div className="relative">
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as MediaType | 'all')}
              className="appearance-none px-3 py-2 pr-7 rounded-xl bg-black/20 border border-[var(--border)] text-sm cursor-pointer hover:border-[var(--primary)]/40 outline-none"
            >
              <option value="all">All</option>
              <option value="video">Videos</option>
              <option value="image">Images</option>
              <option value="gif">GIFs</option>
            </select>
            <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-[var(--muted)]" />
          </div>

          {/* Sort By */}
          <div className="flex items-center gap-1">
            <div className="relative">
              <select
                value={sortBy}
                onChange={(e) => {
                  const newSort = e.target.value as SortOption
                  setSortBy(newSort)
                  if (newSort === 'random') setRandomSeed(Date.now())
                }}
                className="appearance-none px-3 py-2 pr-7 rounded-xl bg-black/20 border border-[var(--border)] text-sm cursor-pointer hover:border-[var(--primary)]/40 outline-none"
              >
                <option value="newest">Newest</option>
                <option value="oldest">Oldest</option>
                <option value="name">Name</option>
                <option value="type">Type</option>
                <option value="size">Size</option>
                <option value="duration">Duration</option>
                <option value="rating">★ Rating</option>
                <option value="views">Views</option>
                <option value="ocount">O Count</option>
                <option value="random">🎲 Random</option>
              </select>
              <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-[var(--muted)]" />
            </div>
            {/* Reshuffle button for random sort */}
            {sortBy === 'random' && (
              <button
                onClick={() => setRandomSeed(Date.now())}
                className="p-2 rounded-xl bg-[var(--primary)]/20 hover:bg-[var(--primary)]/30 border border-[var(--primary)]/30 transition-all hover:scale-105"
                title="Reshuffle"
              >
                <Shuffle size={14} className="text-[var(--primary)]" />
              </button>
            )}
          </div>

          {/* Keyboard hint */}
          {focusedIndex >= 0 && (
            <div className="text-[10px] text-[var(--muted)] flex items-center gap-2 px-2 py-1 rounded-lg bg-black/20">
              <span>↑↓←→</span>
              <span className="text-white/30">|</span>
              <span>Enter to open</span>
              <span className="text-white/30">|</span>
              <span>Esc to deselect</span>
            </div>
          )}
        </div>
      </TopBar>

      <div className="h-[calc(100vh-110px)] flex min-w-0">
        {/* Thinner tag sidebar */}
        <div className="w-[180px] shrink-0 border-r border-[var(--border)] bg-[var(--panel2)] overflow-auto">
          <div className="p-3">
            <TagSelector
              tags={tags}
              selectedTags={activeTags}
              onTagsChange={setActiveTags}
              onCreateTag={async (name) => {
                await window.api.tags.create(name)
                const t = await window.api.tags.list()
                setTags(t)
              }}
              placeholder="Tags..."
              className="mb-3"
            />

            {/* Randomized Quick Tags with visual effects */}
            {randomQuickTags.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] text-[var(--muted)] flex items-center gap-1">
                    <Sparkles size={10} className="text-[var(--primary)]" />
                    Quick
                  </span>
                  <button
                    onClick={refreshQuickTags}
                    className="p-1 rounded hover:bg-white/10 transition-all duration-200 group"
                    title="Shuffle tags"
                  >
                    <Shuffle size={12} className="text-[var(--muted)] group-hover:text-[var(--primary)] group-hover:rotate-180 transition-all duration-300" />
                  </button>
                </div>
                <div className="flex flex-wrap gap-1">
                  {randomQuickTags.map((t, index) => {
                    const active = activeTags.includes(t.name)
                    return (
                      <button
                        key={t.id}
                        onClick={() => toggleTag(t.name)}
                        className={cn(
                          'px-2 py-1 rounded text-[10px] truncate max-w-full',
                          'transition-all duration-200 transform hover:scale-105',
                          active
                            ? 'bg-[var(--primary)]/25 text-[var(--primary)] border border-[var(--primary)]/40 shadow-[0_0_10px_rgba(var(--primary-rgb),0.3)]'
                            : 'bg-black/30 border border-[var(--border)] hover:border-[var(--primary)]/30 hover:bg-[var(--primary)]/10'
                        )}
                        style={{
                          animationDelay: `${index * 50}ms`,
                        }}
                        title={t.name}
                      >
                        {t.name}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Active filters with glow effects */}
            {activeTags.length > 0 && (
              <div className="mt-3 pt-3 border-t border-[var(--border)]">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] text-[var(--primary)] flex items-center gap-1">
                    <Zap size={10} />
                    Active ({activeTags.length})
                  </span>
                  <button
                    onClick={() => setActiveTags([])}
                    className="text-[10px] text-red-400 hover:text-red-300 hover:bg-red-500/10 px-1.5 py-0.5 rounded transition-all"
                  >
                    Clear all
                  </button>
                </div>
                <div className="flex flex-wrap gap-1">
                  {activeTags.map((name, index) => (
                    <button
                      key={name}
                      onClick={() => toggleTag(name)}
                      className={cn(
                        'px-2 py-1 rounded text-[10px] flex items-center gap-1',
                        'bg-[var(--primary)]/30 text-[var(--primary)] border border-[var(--primary)]/40',
                        'transition-all duration-200 hover:bg-red-500/30 hover:border-red-500/40 hover:text-red-300',
                        'shadow-[0_0_8px_rgba(var(--primary-rgb),0.2)]'
                      )}
                      style={{
                        animation: 'tagPulse 2s ease-in-out infinite',
                        animationDelay: `${index * 200}ms`
                      }}
                    >
                      {name}
                      <X size={10} className="opacity-60 group-hover:opacity-100" />
                    </button>
                  ))}
                </div>
                <style>{`
                  @keyframes tagPulse {
                    0%, 100% { box-shadow: 0 0 8px rgba(var(--primary-rgb), 0.2); }
                    50% { box-shadow: 0 0 15px rgba(var(--primary-rgb), 0.4); }
                  }
                `}</style>
              </div>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-auto p-4">
          {/* Results count with type breakdown */}
          <div className="text-xs text-[var(--muted)] mb-3 flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="tabular-nums font-medium text-white">{sortedMedia.length}</span>
              <span>items</span>
              {isLoading && (
                <span className="inline-flex gap-1">
                  <span className="w-1 h-1 bg-[var(--primary)] rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-1 h-1 bg-[var(--primary)] rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-1 h-1 bg-[var(--primary)] rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </span>
              )}
            </div>
            {/* Type breakdown badges */}
            {typeFilter === 'all' && totalCount > 0 && (
              <div className="flex items-center gap-1.5">
                <span className="text-white/30">•</span>
                {typeCounts.video > 0 && (
                  <button
                    onClick={() => setTypeFilter('video')}
                    className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 transition"
                  >
                    <Play size={10} className="fill-current" />
                    <span className="tabular-nums">{typeCounts.video}</span>
                  </button>
                )}
                {typeCounts.gif > 0 && (
                  <button
                    onClick={() => setTypeFilter('gif')}
                    className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 transition"
                  >
                    <Repeat size={10} />
                    <span className="tabular-nums">{typeCounts.gif}</span>
                  </button>
                )}
                {typeCounts.image > 0 && (
                  <button
                    onClick={() => setTypeFilter('image')}
                    className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-green-500/20 hover:bg-green-500/30 text-green-300 transition"
                  >
                    <Eye size={10} />
                    <span className="tabular-nums">{typeCounts.image}</span>
                  </button>
                )}
              </div>
            )}
            {/* Showing X of Y when paginated */}
            {sortedMedia.length > displayLimit && (
              <span className="text-white/40">
                showing {Math.min(displayLimit, sortedMedia.length)} of {sortedMedia.length}
              </span>
            )}
          </div>

          <div ref={gridRef} className="grid" style={getGridStyle()}>
            {sortedMedia.slice(0, displayLimit).map((m, index) => {
              const isPlaying = openIds.includes(m.id)
              const canAddMore = openIds.length < MAX_FLOATING_PLAYERS
              const canOpen = isPlaying || canAddMore
              const isFocused = focusedIndex === index
              return (
                <div
                  key={m.id}
                  className={cn('animate-fadeInUp', isFocused && 'ring-2 ring-[var(--primary)] ring-offset-2 ring-offset-[var(--bg)] rounded-xl')}
                  style={{
                    animationDelay: `${Math.min(index * 30, 500)}ms`,
                    animationFillMode: 'backwards'
                  }}
                >
                  <MediaTile
                    media={m}
                    selected={isPlaying}
                    onClick={() => {
                      console.log('[Library] Tile clicked:', m.id, 'canOpen:', canOpen, 'openIds:', openIds.length)
                      setFocusedIndex(index)
                      canOpen && addFloatingPlayer(m.id)
                    }}
                    onToggleSelect={() => canOpen && addFloatingPlayer(m.id)}
                    compact={layout === 'compact'}
                    disabled={!canOpen}
                    showStats={sortBy === 'rating' || sortBy === 'views' || sortBy === 'ocount'}
                    stats={mediaStats.get(m.id)}
                  />
                </div>
              )
            })}
          </div>

          {/* Load More Button */}
          {sortedMedia.length > displayLimit && (
            <div className="mt-6 flex justify-center">
              <button
                onClick={() => setDisplayLimit(prev => prev + ITEMS_PER_PAGE)}
                className="px-6 py-2.5 rounded-xl bg-[var(--primary)]/20 hover:bg-[var(--primary)]/30 border border-[var(--primary)]/30 text-sm font-medium transition-all hover:scale-105 flex items-center gap-2"
              >
                <ChevronDown size={16} />
                Load More ({sortedMedia.length - displayLimit} remaining)
              </button>
            </div>
          )}

          {/* Show All Button when fully paginated */}
          {sortedMedia.length > ITEMS_PER_PAGE && displayLimit >= sortedMedia.length && (
            <div className="mt-4 flex justify-center">
              <button
                onClick={() => setDisplayLimit(ITEMS_PER_PAGE)}
                className="px-4 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-xs text-[var(--muted)] transition"
              >
                <ChevronUp size={12} className="inline mr-1" />
                Show Less
              </button>
            </div>
          )}

          {!sortedMedia.length && !isLoading && (
            <div className="mt-10 text-sm text-[var(--muted)] text-center flex flex-col items-center gap-3">
              <div className="text-5xl opacity-30">
                {query || activeTags.length > 0 || typeFilter !== 'all' ? '🔍' : '📁'}
              </div>
              <div className="font-medium">
                {query || activeTags.length > 0 || typeFilter !== 'all' ? 'No results found' : 'Library is empty'}
              </div>
              {!(query || activeTags.length > 0 || typeFilter !== 'all') && (
                <div className="text-xs text-white/40 max-w-xs">
                  Add a media folder in Settings to start building your collection
                </div>
              )}
              {(query || activeTags.length > 0 || typeFilter !== 'all') && (
                <button
                  onClick={() => { setQuery(''); setActiveTags([]); setTypeFilter('all') }}
                  className="mt-2 px-3 py-1.5 rounded-lg text-xs bg-white/10 hover:bg-white/20 transition"
                >
                  Clear filters
                </button>
              )}
            </div>
          )}

          {/* CSS for staggered fade-in animation */}
          <style>{`
            @keyframes fadeInUp {
              from {
                opacity: 0;
                transform: translateY(20px) scale(0.95);
              }
              to {
                opacity: 1;
                transform: translateY(0) scale(1);
              }
            }
            .animate-fadeInUp {
              animation: fadeInUp 0.4s ease-out;
            }
          `}</style>
        </div>
      </div>

      {/* Multiple Floating PiP Video Players (up to 4) */}
      {openIds.length > 0 && media.length > 0 && (
        <>
          {/* Close all button when multiple players open */}
          {openIds.length > 1 && (
            <button
              onClick={closeAllFloatingPlayers}
              className="fixed top-3 right-3 z-[101] px-3 py-1.5 rounded-lg text-xs bg-red-500/80 hover:bg-red-500 transition shadow-lg"
              title="Close all players"
            >
              Close All ({openIds.length})
            </button>
          )}
          {openIds.map((id, index) => {
            const openMedia = media.find(m => m.id === id)
            if (!openMedia) return null
            // Get bounds of OTHER players for collision detection
            const otherBounds = Array.from(playerBounds.entries())
              .filter(([playerId]) => playerId !== id)
              .map(([, bounds]) => bounds)
            return (
              <FloatingVideoPlayer
                key={`player-${index}-${id}`}
                media={openMedia}
                mediaList={media.filter(m => !openIds.includes(m.id) || m.id === id)} // Exclude other open videos from navigation
                onClose={() => closeFloatingPlayer(id)}
                onMediaChange={(newId) => changeFloatingPlayerMedia(id, newId)}
                instanceIndex={index}
                initialPosition={{
                  x: 20 + index * 60,
                  y: window.innerHeight - 350 - index * 50
                }}
                otherPlayerBounds={otherBounds}
                onBoundsChange={(bounds) => updatePlayerBounds(id, bounds)}
              />
            )
          })}
        </>
      )}
    </>
  )
}

function MediaTile(props: {
  media: MediaRow
  selected: boolean
  onClick: () => void
  onToggleSelect: () => void
  compact?: boolean
  disabled?: boolean
  showStats?: boolean
  stats?: { rating: number; viewCount: number; oCount: number }
}) {
  const { media, compact, disabled, showStats, stats } = props
  const [thumbUrl, setThumbUrl] = useState<string>('')
  const [isLoaded, setIsLoaded] = useState(false)
  const [isHovered, setIsHovered] = useState(false)
  const [thumbError, setThumbError] = useState(false)
  const [renameStatus, setRenameStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')

  useEffect(() => {
    let alive = true
    setIsLoaded(false)
    setThumbError(false)
    ;(async () => {
      const p = media.thumbPath
      if (!p) {
        setThumbUrl('')
        return
      }
      try {
        const u = await toFileUrlCached(p)
        if (!alive) return
        setThumbUrl(u)
      } catch (err) {
        if (!alive) return
        console.warn('[MediaTile] Failed to load thumb:', media.id, err)
        setThumbError(true)
      }
    })()
    return () => {
      alive = false
    }
  }, [media.id, media.thumbPath])

  return (
    <div
      onClick={disabled ? undefined : props.onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={cn(
        'text-left border bg-black/20 overflow-hidden relative group',
        'transition-all duration-300 ease-out',
        disabled
          ? 'cursor-not-allowed opacity-50'
          : 'cursor-pointer hover:scale-[1.02] hover:z-10',
        props.selected
          ? 'border-[var(--primary)]/50 shadow-[0_0_20px_rgba(var(--primary-rgb),0.3)]'
          : disabled
            ? 'border-[var(--border)]'
            : 'border-[var(--border)] hover:border-[var(--primary)]/30',
        compact ? 'rounded-lg' : 'rounded-xl',
        isHovered && !disabled && 'shadow-xl shadow-black/40'
      )}
      style={{
        boxShadow: isHovered && !disabled
          ? '0 10px 40px -10px rgba(0,0,0,0.5), 0 0 20px -5px var(--primary)'
          : undefined
      }}
    >
      {/* Animated glow border on hover */}
      <div
        className={cn(
          'absolute -inset-[1px] rounded-xl opacity-0 transition-opacity duration-300 pointer-events-none',
          isHovered && 'opacity-100'
        )}
        style={{
          background: 'linear-gradient(135deg, var(--primary), var(--secondary), var(--primary))',
          backgroundSize: '200% 200%',
          animation: isHovered ? 'gradientShift 2s ease infinite' : 'none',
          zIndex: -1,
          filter: 'blur(2px)'
        }}
      />

      <div className={cn('bg-black/25 relative overflow-hidden', compact ? 'aspect-[16/9]' : 'aspect-[16/10]')}>
        {/* Loading shimmer */}
        {!isLoaded && thumbUrl && (
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent animate-shimmer" />
        )}

        {thumbUrl && !thumbError ? (
          <img
            src={thumbUrl}
            alt=""
            className={cn(
              'w-full h-full object-cover transition-all duration-500',
              isLoaded ? 'opacity-100 scale-100' : 'opacity-0 scale-105',
              isHovered && 'scale-110'
            )}
            onLoad={() => setIsLoaded(true)}
            onError={() => setThumbError(true)}
          />
        ) : thumbError ? (
          <div className="w-full h-full bg-gradient-to-br from-red-900/20 to-black/60 flex items-center justify-center">
            <div className="text-white/30 text-xs">No preview</div>
          </div>
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-black/40 to-black/60 flex items-center justify-center">
            <div className="w-6 h-6 border-2 border-white/20 border-t-white/60 rounded-full animate-spin" />
          </div>
        )}

        {/* Gradient overlay that intensifies on hover */}
        <div
          className={cn(
            'absolute inset-0 transition-opacity duration-300',
            'bg-gradient-to-t from-black/80 via-transparent to-transparent',
            isHovered ? 'opacity-100' : 'opacity-60'
          )}
        />

        {/* Type Badge with glow */}
        <div className={cn(
          'absolute top-1.5 right-1.5 flex items-center gap-1 px-1.5 py-0.5 rounded backdrop-blur-sm',
          'bg-black/60 border border-white/10 transition-all duration-200',
          compact ? 'text-[8px]' : 'text-[10px]',
          isHovered && 'bg-black/80 border-white/20 shadow-lg'
        )}>
          {media.type === 'video' && <Play size={compact ? 8 : 10} className="fill-current" />}
          {media.type === 'gif' && <Repeat size={compact ? 8 : 10} />}
          {media.type === 'image' && <Eye size={compact ? 8 : 10} />}
        </div>

        {/* Duration badge for videos with glow effect */}
        {media.type === 'video' && media.durationSec ? (
          <div className={cn(
            'absolute bottom-1.5 right-1.5 px-1.5 py-0.5 rounded backdrop-blur-sm transition-all duration-200',
            'bg-black/70 border border-white/10',
            compact ? 'text-[8px]' : 'text-[10px]',
            isHovered && 'bg-[var(--primary)]/80 border-[var(--primary)]/50 shadow-[0_0_10px_var(--primary)]'
          )}>
            {formatDuration(media.durationSec)}
          </div>
        ) : null}

        {/* Stats badges when sorting by stats */}
        {showStats && stats && (
          <div className="absolute bottom-1.5 left-1.5 flex items-center gap-1">
            {stats.rating > 0 && (
              <div className={cn(
                'px-1.5 py-0.5 rounded text-[9px] font-medium flex items-center gap-0.5 transition-all duration-200',
                'bg-yellow-500/80',
                isHovered && 'bg-yellow-400 shadow-[0_0_10px_rgba(234,179,8,0.5)] scale-105'
              )}>
                <Star size={8} className="fill-current" /> {stats.rating}
              </div>
            )}
            {stats.viewCount > 0 && (
              <div className={cn(
                'px-1.5 py-0.5 rounded text-[9px] font-medium flex items-center gap-0.5 transition-all duration-200',
                'bg-blue-500/80',
                isHovered && 'bg-blue-400 shadow-[0_0_10px_rgba(59,130,246,0.5)] scale-105'
              )}>
                <Eye size={8} /> {stats.viewCount}
              </div>
            )}
            {stats.oCount > 0 && (
              <div className={cn(
                'px-1.5 py-0.5 rounded text-[9px] font-medium transition-all duration-200',
                'bg-pink-500/80',
                isHovered && 'bg-pink-400 shadow-[0_0_10px_rgba(236,72,153,0.5)] scale-105'
              )}>
                O:{stats.oCount}
              </div>
            )}
          </div>
        )}

        {/* Playing indicator (always visible when playing) or Add button (show on hover) */}
        {!compact && (
          <div className={cn(
            'absolute top-1.5 left-1.5 transition-all duration-200',
            props.selected
              ? 'opacity-100 translate-y-0' // Always visible when playing
              : 'opacity-0 -translate-y-2 group-hover:opacity-100 group-hover:translate-y-0'
          )}>
            <button
              onClick={(e) => {
                e.stopPropagation()
                props.onToggleSelect()
              }}
              className={cn(
                'px-2 py-1 rounded text-[10px] transition-all duration-200 backdrop-blur-sm flex items-center gap-1',
                props.selected
                  ? 'bg-green-500 text-white shadow-[0_0_15px_rgba(34,197,94,0.6)] animate-pulse'
                  : 'bg-black/60 hover:bg-[var(--primary)]/80 hover:shadow-[0_0_10px_var(--primary)]'
              )}
            >
              {props.selected ? (
                <>
                  <span className="w-1.5 h-1.5 bg-white rounded-full animate-ping" />
                  Playing
                </>
              ) : '+'}
            </button>
          </div>
        )}

        {/* Hover overlay with play button animation */}
        <div className={cn(
          'absolute inset-0 flex items-center justify-center transition-all duration-300',
          'bg-gradient-to-t from-black/60 via-black/20 to-transparent',
          'opacity-0 group-hover:opacity-100'
        )}>
          <div className={cn(
            'p-3 rounded-full transition-all duration-300 transform',
            'bg-white/20 backdrop-blur-sm border border-white/30',
            'scale-75 group-hover:scale-100',
            'shadow-[0_0_30px_rgba(255,255,255,0.3)]'
          )}>
            <Play size={compact ? 18 : 24} className="fill-current ml-0.5" />
          </div>
        </div>
      </div>

      {!compact && (
        <div className={cn(
          'p-2 transition-all duration-200',
          isHovered && 'bg-white/5'
        )}>
          <div className="flex items-center gap-1">
            <div
              className="text-xs font-medium truncate flex-1 cursor-default"
              title={media.filename || media.path.split(/[/\\]/).pop()}
            >
              {media.filename || media.path.split(/[/\\]/).pop()}
            </div>
            {/* Auto-optimize name button - shows on hover */}
            <button
              onClick={async (e) => {
                e.stopPropagation()
                if (renameStatus === 'loading') return
                setRenameStatus('loading')
                try {
                  const result = await window.api.media.optimizeName(media.id)
                  if (result.success) {
                    console.log('[MediaTile] Renamed:', result.oldName, '->', result.newName)
                    setRenameStatus('success')
                    setTimeout(() => setRenameStatus('idle'), 2000)
                  } else {
                    setRenameStatus('error')
                    setTimeout(() => setRenameStatus('idle'), 2000)
                  }
                } catch (err) {
                  console.warn('[MediaTile] Rename failed:', err)
                  setRenameStatus('error')
                  setTimeout(() => setRenameStatus('idle'), 2000)
                }
              }}
              disabled={renameStatus === 'loading'}
              className={cn(
                'p-1 rounded text-[10px] transition-all duration-200 flex-shrink-0',
                renameStatus === 'idle' && 'opacity-0 group-hover:opacity-100 bg-white/10 hover:bg-[var(--primary)]/60 hover:text-white',
                renameStatus === 'loading' && 'opacity-100 bg-blue-500/30 cursor-wait',
                renameStatus === 'success' && 'opacity-100 bg-green-500/50 text-green-200',
                renameStatus === 'error' && 'opacity-100 bg-red-500/50 text-red-200'
              )}
              title="Optimize filename"
            >
              {renameStatus === 'loading' ? '...' : renameStatus === 'success' ? '✓' : renameStatus === 'error' ? '✗' : '✨'}
            </button>
          </div>
          <div className="mt-0.5 text-[10px] text-[var(--muted)] flex items-center justify-between">
            <span className={cn(
              'capitalize px-1.5 py-0.5 rounded transition-colors',
              isHovered && 'bg-[var(--primary)]/20 text-[var(--primary)]',
              media.type === 'video' && isHovered && 'bg-blue-500/20 text-blue-300',
              media.type === 'gif' && isHovered && 'bg-purple-500/20 text-purple-300',
              media.type === 'image' && isHovered && 'bg-green-500/20 text-green-300'
            )}>
              {media.type}
            </span>
            <div className="flex items-center gap-2">
              {media.width && media.height && (
                <span className={cn('transition-opacity', isHovered ? 'opacity-100' : 'opacity-0')}>
                  {media.width}×{media.height}
                </span>
              )}
              {typeof media.size === 'number' && <span>{formatBytes(media.size)}</span>}
            </div>
          </div>
        </div>
      )}

      {/* CSS for gradient animation and shimmer */}
      <style>{`
        @keyframes gradientShift {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
        @keyframes shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
        .animate-shimmer {
          animation: shimmer 1.5s infinite;
        }
      `}</style>
    </div>
  )
}

function MediaViewer(props: {
  mediaId: string
  onClose: () => void
  mediaList?: MediaRow[]  // Optional list for prev/next navigation
  onMediaChange?: (mediaId: string) => void
}) {
  const [media, setMedia] = useState<MediaRow | null>(null)
  const [markers, setMarkers] = useState<MarkerRow[]>([])
  const [tags, setTags] = useState<string[]>([])
  const [playlists, setPlaylists] = useState<PlaylistRow[]>([])
  const [stats, setStats] = useState<MediaStatsRow | null>(null)

  const [pickOpen, setPickOpen] = useState<boolean>(false)

  const videoRef = useRef<HTMLVideoElement | null>(null)
  const [url, setUrl] = useState<string>('')

  // Navigation state
  const currentIndex = props.mediaList?.findIndex(m => m.id === props.mediaId) ?? -1
  const hasPrev = currentIndex > 0
  const hasNext = props.mediaList ? currentIndex < props.mediaList.length - 1 : false

  const goToPrev = useCallback(() => {
    if (hasPrev && props.mediaList && props.onMediaChange) {
      props.onMediaChange(props.mediaList[currentIndex - 1].id)
    }
  }, [currentIndex, hasPrev, props.mediaList, props.onMediaChange])

  const goToNext = useCallback(() => {
    if (hasNext && props.mediaList && props.onMediaChange) {
      props.onMediaChange(props.mediaList[currentIndex + 1].id)
    }
  }, [currentIndex, hasNext, props.mediaList, props.onMediaChange])

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
        goToPrev()
      } else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
        goToNext()
      } else if (e.key === 'Escape') {
        props.onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [goToPrev, goToNext, props.onClose])

  const refresh = async (id: string) => {
    const m = await window.api.media.getById(id)
    setMedia(m)
    const mk = await window.api.markers.list(id)
    setMarkers(mk)
    const tg = await window.api.tags.listForMedia(id)
    setTags(tg.map((t: any) => t.name))
    const st = await window.api.media.getStats(id)
    setStats(st)
    if (m) {
      const p = m.path
      const u = await toFileUrlCached(p)
      setUrl(u)
    }
  }

  useEffect(() => {
    void refresh(props.mediaId)
  }, [props.mediaId])

  useEffect(() => {
    let alive = true
    ;(async () => {
      const pls = await window.api.playlists.list()
      if (!alive) return
      setPlaylists(pls)
    })()
    return () => {
      alive = false
    }
  }, [])

  if (!media) return null

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="w-[min(1100px,92vw)] h-[min(760px,88vh)] rounded-3xl border border-white/10 bg-[var(--panel)] overflow-hidden shadow-2xl">
        <div className="px-6 py-4 border-b border-[var(--border)] flex items-center justify-between">
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold truncate">{media.path}</div>
            <div className="text-xs text-[var(--muted)] mt-1 flex items-center gap-3">
              <span>{media.type.toUpperCase()}</span>
              {media.durationSec ? <span>{formatDuration(media.durationSec)}</span> : null}
              {typeof media.sizeBytes === 'number' ? <span>{formatBytes(media.sizeBytes)}</span> : null}
              {props.mediaList && (
                <span className="text-white/40">
                  {currentIndex + 1} / {props.mediaList.length}
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Btn onClick={() => setPickOpen(true)}>Add to Playlist</Btn>
            <Btn onClick={props.onClose}>Close</Btn>
          </div>
        </div>

        <div className="h-[calc(100%-64px)] flex relative">
          {/* Previous button */}
          {props.mediaList && (
            <button
              onClick={goToPrev}
              disabled={!hasPrev}
              className={`absolute left-4 top-1/2 -translate-y-1/2 z-10 p-3 rounded-full transition ${
                hasPrev
                  ? 'bg-black/60 hover:bg-black/80 text-white'
                  : 'bg-black/20 text-white/30 cursor-not-allowed'
              }`}
              title="Previous (A / ←)"
            >
              <ChevronLeft size={24} />
            </button>
          )}

          {/* Next button */}
          {props.mediaList && (
            <button
              onClick={goToNext}
              disabled={!hasNext}
              className={`absolute right-[340px] top-1/2 -translate-y-1/2 z-10 p-3 rounded-full transition ${
                hasNext
                  ? 'bg-black/60 hover:bg-black/80 text-white'
                  : 'bg-black/20 text-white/30 cursor-not-allowed'
              }`}
              title="Next (D / →)"
            >
              <ChevronRight size={24} />
            </button>
          )}

          <div className="flex-1 bg-black/20 flex items-center justify-center px-16">
            {media.type === 'video' ? (
              <video
                ref={videoRef}
                src={url}
                controls
                autoPlay
                className="max-w-full max-h-full rounded-2xl border border-white/10"
              />
            ) : (
              <img src={url} className="max-w-full max-h-full rounded-2xl border border-white/10 object-contain" />
            )}
          </div>

          <div className="w-[320px] shrink-0 border-l border-[var(--border)] bg-[var(--panel2)] overflow-auto">
            <div className="p-4">
              <div className="text-xs text-[var(--muted)] mb-2">Tags</div>
              <div className="flex flex-wrap gap-2">
                {tags.map((t) => (
                  <span key={t} className="px-3 py-2 rounded-xl text-xs border border-[var(--border)] bg-black/20">
                    {t}
                  </span>
                ))}
                {!tags.length ? <div className="text-xs text-[var(--muted)]">No tags.</div> : null}
              </div>

              <div className="mt-6 text-xs text-[var(--muted)] mb-2">Markers</div>
              <div className="space-y-2">
                {markers.map((m) => (
                  <div key={m.id} className="p-3 rounded-2xl border border-[var(--border)] bg-black/20">
                    <div className="text-xs font-medium">{formatDuration(m.timeSec)}</div>
                    <div className="text-xs text-[var(--muted)] mt-1">{m.title}</div>
                  </div>
                ))}
                {!markers.length ? <div className="text-xs text-[var(--muted)]">No markers.</div> : null}
              </div>

              <div className="mt-6 text-xs text-[var(--muted)] mb-2">Stats</div>
              <div className="space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-[var(--muted)]">Views</span>
                  <span>{stats?.viewCount ?? 0}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[var(--muted)]">O</span>
                  <span>{stats?.oCount ?? 0}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[var(--muted)]">Rating</span>
                  <span>{stats?.rating ?? 0}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {pickOpen ? (
          <PlaylistPicker
            playlists={playlists}
            onClose={() => setPickOpen(false)}
            onPick={async (plId) => {
              await window.api.playlists.addItems(plId, [media.id])
              setPickOpen(false)
            }}
          />
        ) : null}
      </div>
    </div>
  )
}

function PlaylistPicker(props: {
  playlists: PlaylistRow[]
  onClose: () => void
  onPick: (playlistId: string) => void
}) {
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[60]">
      <div className="w-[520px] rounded-3xl border border-white/10 bg-[var(--panel)] overflow-hidden shadow-2xl">
        <div className="px-6 py-4 border-b border-[var(--border)] flex items-center justify-between">
          <div className="text-sm font-semibold">Add to Playlist</div>
          <Btn onClick={props.onClose}>Close</Btn>
        </div>
        <div className="p-4 space-y-2 max-h-[60vh] overflow-auto">
          {props.playlists.map((p) => (
            <button
              key={p.id}
              onClick={() => props.onPick(p.id)}
              className="w-full text-left px-4 py-3 rounded-2xl border border-[var(--border)] bg-black/20 hover:border-white/15 transition"
            >
              <div className="text-sm font-medium">{p.name}</div>
            </button>
          ))}
          {!props.playlists.length ? <div className="text-xs text-[var(--muted)]">No playlists yet.</div> : null}
        </div>
      </div>
    </div>
  )
}

type GoonWallLayout = 'grid' | 'columns' | 'mosaic'
type ShuffleInterval = 20 | 30 | 45 | 60 | 90 | 120

function GoonWallPage(props: {
  settings: VaultSettings | null
  heatLevel: number
  onHeatChange: (level: number) => void
  goonMode: boolean
  onGoonModeChange: (enabled: boolean) => void
  randomClimax: boolean
  onRandomClimaxChange: (enabled: boolean) => void
  onClimax: (type: 'cum' | 'squirt' | 'orgasm') => void
  overlays: {
    sparkles: boolean
    bokeh: boolean
    starfield: boolean
    filmGrain: boolean
    dreamyHaze: boolean
  }
  onOverlayToggle: (overlay: 'sparkles' | 'bokeh' | 'starfield' | 'filmGrain' | 'dreamyHaze') => void
}) {
  const [videos, setVideos] = useState<MediaRow[]>([])
  const [tiles, setTiles] = useState<MediaRow[]>([])
  const [tileCount, setTileCount] = useState(9)
  const [layout, setLayout] = useState<GoonWallLayout>('grid')
  const [intervalSec, setIntervalSec] = useState<ShuffleInterval>(45)
  const [isPlaying, setIsPlaying] = useState(false)
  const [muted, setMuted] = useState(true)
  const [showHud, setShowHud] = useState(true)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Load settings from props
  useEffect(() => {
    const gw = props.settings?.goonwall
    if (gw) {
      if (gw.tileCount) setTileCount(gw.tileCount)
      if (gw.layout) setLayout(gw.layout)
      if (gw.intervalSec) setIntervalSec(gw.intervalSec)
      if (gw.muted !== undefined) setMuted(gw.muted)
      if (gw.showHud !== undefined) setShowHud(gw.showHud)
    }
  }, [props.settings?.goonwall])

  // Save settings when they change
  const saveSettings = useCallback(async (patch: Partial<{ tileCount: number; layout: string; intervalSec: number; muted: boolean; showHud: boolean }>) => {
    try {
      await window.api.settings.goonwall?.update?.(patch)
    } catch (e) {
      console.warn('[GoonWall] Failed to save settings:', e)
    }
  }, [])

  const loadVideos = async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await window.api.media.randomByTags([], { limit: 200 })
      const vids = (Array.isArray(result) ? result : []).filter((m: any) => m.type === 'video')
      if (vids.length === 0) {
        setError('No videos found. Add some videos to your library first.')
        setVideos([])
        setTiles([])
      } else {
        setVideos(vids)
        shuffleTiles(vids)
      }
    } catch (e: any) {
      console.error('[GoonWall] Failed to load videos:', e)
      setError(e.message || 'Failed to load videos')
    } finally {
      setLoading(false)
    }
  }

  // Fullscreen toggle
  const toggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen()
        setIsFullscreen(true)
      } else {
        await document.exitFullscreen()
        setIsFullscreen(false)
      }
    } catch (e) {
      console.warn('[GoonWall] Fullscreen error:', e)
    }
  }

  const shuffleTiles = (pool?: MediaRow[]) => {
    const source = pool ?? videos
    if (source.length === 0) return

    // Use proper Fisher-Yates shuffle instead of biased sort
    const shuffled = shuffleTake(source, tileCount)
    setTiles(shuffled)

    // Track shuffle for achievements
    window.api.goonwall?.shuffle?.()
  }

  const shuffleSingleTile = (idx: number) => {
    if (videos.length === 0) return
    const currentIds = new Set(tiles.map(t => t.id))
    const available = videos.filter(v => !currentIds.has(v.id))
    if (available.length === 0) return

    const newVideo = available[Math.floor(Math.random() * available.length)]
    setTiles(prev => {
      const next = [...prev]
      next[idx] = newVideo
      return next
    })

    // Track shuffle for achievements
    window.api.goonwall?.shuffle?.()
  }

  useEffect(() => {
    void loadVideos()
    // Track goon wall session start
    window.api.goonwall?.startSession?.(tileCount)

    // Subscribe to vault changes (file additions/deletions)
    const unsub = window.api.events?.onVaultChanged?.(() => {
      console.log('[GoonWall] Vault changed, reloading videos...')
      void loadVideos()
    })

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
      unsub?.()
    }
  }, [])

  // Keyboard shortcuts for GoonWall
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return

      switch (e.key.toLowerCase()) {
        case ' ': // Space - toggle play/stop
          e.preventDefault()
          setIsPlaying(prev => !prev)
          break
        case 's': // S - shuffle all
          shuffleTiles()
          break
        case 'm': // M - toggle mute
          setMuted(prev => {
            saveSettings({ muted: !prev })
            return !prev
          })
          break
        case 'f': // F - toggle fullscreen
          toggleFullscreen()
          break
        case 'arrowup': // Arrow up - increase heat
          props.onHeatChange(Math.min(10, props.heatLevel + 1))
          break
        case 'arrowdown': // Arrow down - decrease heat
          props.onHeatChange(Math.max(0, props.heatLevel - 1))
          break
        case 'h': // H - toggle HUD
          setShowHud(prev => {
            saveSettings({ showHud: !prev })
            return !prev
          })
          break
        case 'g': // G - toggle Goon Mode
          props.onGoonModeChange(!props.goonMode)
          break
        case 'escape': // Escape - exit fullscreen
          if (document.fullscreenElement) {
            document.exitFullscreen()
            setIsFullscreen(false)
          }
          break
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [props.heatLevel, props.onHeatChange])

  useEffect(() => {
    shuffleTiles()
  }, [tileCount, videos])

  useEffect(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }

    if (isPlaying && intervalSec > 0) {
      // Active session: use configured interval
      intervalRef.current = setInterval(() => {
        const idx = Math.floor(Math.random() * tiles.length)
        shuffleSingleTile(idx)
      }, intervalSec * 1000)
    } else if (!isPlaying && tiles.length > 0 && videos.length > 0) {
      // Passive mode: slow ambient tile changes (every 45-90 seconds)
      intervalRef.current = setInterval(() => {
        const idx = Math.floor(Math.random() * tiles.length)
        shuffleSingleTile(idx)
      }, 45000 + Math.random() * 45000) // Random 45-90 seconds
    }

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [isPlaying, intervalSec, tiles.length, videos.length])

  const getGridStyle = (): React.CSSProperties => {
    const cols = Math.ceil(Math.sqrt(tileCount))
    const rows = Math.ceil(tileCount / cols)

    if (layout === 'grid') {
      return {
        display: 'grid',
        gridTemplateColumns: `repeat(${cols}, 1fr)`,
        gridTemplateRows: `repeat(${rows}, 1fr)`,
        gap: '2px'
      }
    }

    if (layout === 'columns') {
      return {
        display: 'grid',
        gridTemplateColumns: `repeat(${cols}, 1fr)`,
        gridAutoRows: '1fr',
        gap: '2px'
      }
    }

    // Mosaic - varied sizes
    return {
      display: 'grid',
      gridTemplateColumns: 'repeat(4, 1fr)',
      gridAutoRows: '150px',
      gap: '2px'
    }
  }

  const getTileStyle = (idx: number): React.CSSProperties => {
    if (layout !== 'mosaic') return {}

    // Create varied tile sizes for mosaic
    const patterns = [
      { gridColumn: 'span 2', gridRow: 'span 2' },
      { gridColumn: 'span 1', gridRow: 'span 1' },
      { gridColumn: 'span 1', gridRow: 'span 2' },
      { gridColumn: 'span 2', gridRow: 'span 1' },
    ]
    return patterns[idx % patterns.length]
  }

  return (
    <div className="h-screen w-full flex flex-col bg-black relative overflow-hidden">
      {/* Condensed HUD Controls - Centered bar with slide animation */}
      <div
        className={cn(
          'absolute top-3 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 bg-gradient-to-b from-gray-900/95 to-gray-800/90 backdrop-blur-md rounded-xl px-4 py-2.5 border border-white/30 shadow-xl shadow-black/70 transition-all duration-300 ease-in-out',
          showHud ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-full pointer-events-none'
        )}
      >
          {/* Play/Stop */}
          <button
            onClick={() => setIsPlaying(!isPlaying)}
            className={cn(
              'px-3 py-1.5 rounded-lg text-xs font-medium transition',
              isPlaying ? 'bg-red-500/80 hover:bg-red-500' : 'bg-green-500/80 hover:bg-green-500'
            )}
          >
            {isPlaying ? '■ Stop' : '▶ Start'}
          </button>

          <div className="w-px h-6 bg-white/20" />

          {/* Shuffle */}
          <button
            onClick={() => shuffleTiles()}
            className="px-2 py-1.5 rounded-lg text-xs bg-white/10 hover:bg-white/20 transition"
            title="Shuffle All"
          >
            🔀
          </button>

          <div className="w-px h-6 bg-white/20" />

          {/* Tile count */}
          <div className="flex items-center gap-1">
            {[4, 6, 9, 12, 16].map((n) => (
              <button
                key={n}
                onClick={() => {
                  setTileCount(n)
                  saveSettings({ tileCount: n })
                }}
                className={cn(
                  'w-6 h-6 rounded text-[10px] font-medium transition',
                  tileCount === n ? 'bg-white/25 text-white' : 'bg-white/5 text-white/60 hover:bg-white/15'
                )}
              >
                {n}
              </button>
            ))}
          </div>

          <div className="w-px h-6 bg-white/20" />

          {/* Layout */}
          <div className="flex items-center gap-1">
            {(['grid', 'columns', 'mosaic'] as GoonWallLayout[]).map((l) => (
              <button
                key={l}
                onClick={() => {
                  setLayout(l)
                  saveSettings({ layout: l })
                }}
                className={cn(
                  'px-2 py-1 rounded text-[10px] transition',
                  layout === l ? 'bg-white/25 text-white' : 'bg-white/5 text-white/60 hover:bg-white/15'
                )}
                title={l}
              >
                {l === 'grid' ? '▦' : l === 'columns' ? '▥' : '▧'}
              </button>
            ))}
          </div>

          <div className="w-px h-6 bg-white/20" />

          {/* Interval */}
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-white/40">⏱</span>
            {([30, 45, 60, 90] as ShuffleInterval[]).map((s) => (
              <button
                key={s}
                onClick={() => {
                  setIntervalSec(s)
                  saveSettings({ intervalSec: s })
                }}
                className={cn(
                  'px-1.5 py-1 rounded text-[10px] transition',
                  intervalSec === s ? 'bg-white/25 text-white' : 'bg-white/5 text-white/60 hover:bg-white/15'
                )}
              >
                {s}
              </button>
            ))}
          </div>

          <div className="w-px h-6 bg-white/20" />

          {/* Mute */}
          <button
            onClick={() => {
              setMuted(!muted)
              saveSettings({ muted: !muted })
            }}
            className={cn(
              'w-7 h-7 rounded-lg text-sm transition flex items-center justify-center',
              muted ? 'bg-white/5 text-white/60' : 'bg-white/20 text-white'
            )}
            title={muted ? 'Unmute' : 'Mute'}
          >
            {muted ? '🔇' : '🔊'}
          </button>

          <div className="w-px h-6 bg-white/20" />

          {/* Heat Level / Visual Effects Intensity */}
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-white/40">🔥</span>
            <input
              type="range"
              min="0"
              max="10"
              step="1"
              value={props.heatLevel}
              onChange={(e) => props.onHeatChange(Number(e.target.value))}
              className="w-16 h-1 rounded-full appearance-none bg-white/20 cursor-pointer accent-pink-500"
              title={`Visual effects intensity: ${props.heatLevel}/10`}
            />
            <span className="text-[10px] text-white/60 w-4">{props.heatLevel}</span>
          </div>

          <div className="w-px h-6 bg-white/20" />

          {/* Goon Mode Toggle */}
          <button
            onClick={() => props.onGoonModeChange(!props.goonMode)}
            className={cn(
              'px-2 py-1.5 rounded-lg text-[10px] font-medium transition',
              props.goonMode
                ? 'bg-pink-500/80 text-white shadow-[0_0_15px_rgba(236,72,153,0.5)]'
                : 'bg-white/10 text-white/60 hover:bg-white/20'
            )}
            title="Toggle Goon Mode - Floating text prompts"
          >
            GOON
          </button>

          {/* Fullscreen */}
          <button
            onClick={toggleFullscreen}
            className="w-7 h-7 rounded-lg text-sm bg-white/5 hover:bg-white/15 transition flex items-center justify-center"
            title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
          >
            {isFullscreen ? '⤓' : '⤢'}
          </button>
        </div>

      {/* Toggle HUD button - smaller, top right */}
      <button
        onClick={() => {
          setShowHud(!showHud)
          saveSettings({ showHud: !showHud })
        }}
        className="absolute top-3 right-3 z-50 w-8 h-8 rounded-lg text-xs bg-gray-800/90 hover:bg-gray-700/90 border border-white/20 flex items-center justify-center transition group"
        title={showHud ? 'Hide HUD (H)' : 'Show HUD (H)'}
      >
        {showHud ? '👁' : '👁‍🗨'}
      </button>

      {/* Keyboard shortcuts hint - bottom left with slide animation */}
      <div
        className={cn(
          'absolute bottom-3 left-3 z-50 transition-all duration-300 ease-in-out',
          showHud ? 'opacity-0 hover:opacity-100 translate-x-0' : 'opacity-0 -translate-x-full pointer-events-none'
        )}
      >
        <div className="text-[10px] text-white/40 bg-black/60 rounded-lg px-3 py-2 border border-white/10 space-y-0.5">
          <div><span className="text-white/60">Space</span> Play/Stop</div>
          <div><span className="text-white/60">S</span> Shuffle</div>
          <div><span className="text-white/60">M</span> Mute</div>
          <div><span className="text-white/60">F</span> Fullscreen</div>
          <div><span className="text-white/60">H</span> Toggle HUD</div>
          <div><span className="text-white/60">↑/↓</span> Heat level</div>
          <div><span className="text-pink-400">G</span> Goon Mode</div>
        </div>
      </div>

      {/* Loading state */}
      {loading && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black">
          <div className="w-12 h-12 border-4 border-white/20 border-t-white/80 rounded-full animate-spin mb-4" />
          <div className="text-white/60">Loading videos...</div>
        </div>
      )}

      {/* Error state */}
      {error && !loading && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black">
          <div className="text-6xl mb-4">⚠️</div>
          <div className="text-lg font-medium text-red-400 mb-2">Error</div>
          <div className="text-sm text-white/60 mb-4 max-w-md text-center">{error}</div>
          <Btn onClick={() => loadVideos()}>Retry</Btn>
        </div>
      )}

      {/* Video Grid */}
      {!loading && !error && tiles.length > 0 && (
        <div className="flex-1 w-full h-full overflow-hidden" style={getGridStyle()}>
          {tiles.map((media, idx) => (
            <GoonTile
              key={`${media.id}-${idx}`}
              media={media}
              muted={muted}
              style={getTileStyle(idx)}
              onShuffle={() => shuffleSingleTile(idx)}
              loadDelay={idx * 50} // Stagger loading by 50ms per tile
            />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && tiles.length === 0 && (
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <div className="text-6xl mb-4 opacity-30">🎬</div>
          <div className="text-lg font-medium text-white/60">No videos found</div>
          <div className="text-sm text-white/40 mt-2">Add some videos to your library first</div>
        </div>
      )}
    </div>
  )
}

function GoonTile(props: { media: MediaRow; muted: boolean; style?: React.CSSProperties; onShuffle: () => void; loadDelay?: number }) {
  const { media, muted, style, onShuffle, loadDelay = 0 } = props
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(true)
  const [hasError, setHasError] = useState(false)
  const [retryCount, setRetryCount] = useState(0)
  const [hasSlot, setHasSlot] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)

  // Use video pool to manage decoder slots - prevents black screens from decoder exhaustion
  useVideoPool(media.id, videoRef, hasSlot && !!url && !hasError)

  // Load video URL with staggered delay
  useEffect(() => {
    let alive = true
    setLoading(true)
    setHasError(false)
    setHasSlot(false)

    const loadVideo = async () => {
      // Stagger loading to prevent overwhelming decoders
      if (loadDelay > 0) {
        await new Promise(r => setTimeout(r, loadDelay))
      }
      if (!alive) return

      const u = await toFileUrlCached(media.path)
      if (alive && u) {
        setUrl(u)
        // Additional small delay
        await new Promise(r => setTimeout(r, 50))
        if (alive) setHasSlot(true)
      } else if (alive) {
        console.warn('[GoonTile] Failed to get URL for:', media.path)
        setHasError(true)
        setLoading(false)
      }
    }

    loadVideo()
    return () => {
      alive = false
    }
  }, [media.id, media.path, retryCount, loadDelay])

  // Loading timeout - if video doesn't load within 8 seconds, show error
  useEffect(() => {
    if (!loading || hasError) return
    const timeout = setTimeout(() => {
      if (loading && !hasError && url) {
        console.warn('[GoonTile] Loading timeout:', media.path)
        setHasError(true)
        setLoading(false)
      }
    }, 8000)
    return () => clearTimeout(timeout)
  }, [loading, hasError, url, media.path])

  // Critical: Cleanup video on unmount to release decoder
  useEffect(() => {
    return () => {
      const video = videoRef.current
      if (video) {
        cleanupVideo(video)
      }
    }
  }, [])

  // Handle mute state changes
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.muted = muted
    }
  }, [muted])

  // Ensure video plays when loaded
  const handleCanPlay = useCallback(() => {
    setLoading(false)
    setHasError(false)
    const video = videoRef.current
    if (video && video.paused) {
      video.play().catch(err => {
        console.warn('[GoonTile] Autoplay blocked:', err.message)
      })
    }
  }, [])

  // Handle video errors with detailed logging - auto-shuffle on codec errors or missing files
  const handleError = useCallback((e: React.SyntheticEvent<HTMLVideoElement>) => {
    const video = e.currentTarget
    const error = video.error
    const isCodecError = error?.code === 4 // SRC_NOT_SUPPORTED = codec issue
    const isNetworkError = error?.code === 2 // NETWORK = file not found/deleted

    if (error) {
      console.warn('[GoonTile] Video error:', {
        path: media.path,
        code: error.code,
        message: error.message,
        errorType: ['', 'ABORTED', 'NETWORK', 'DECODE', 'SRC_NOT_SUPPORTED'][error.code] || 'UNKNOWN'
      })
    } else {
      console.warn('[GoonTile] Video error (no details):', media.path)
    }

    // Auto-shuffle to next video on codec errors (unsupported format) or network errors (file deleted/missing)
    if (isCodecError || isNetworkError) {
      setTimeout(() => onShuffle(), 300) // Small delay before shuffling
      return
    }

    setHasError(true)
    setLoading(false)
  }, [media.path, onShuffle])

  // Retry loading the video
  const handleRetry = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    setRetryCount(c => c + 1)
    setUrl('')
    setHasError(false)
    setLoading(true)
  }, [])

  // Get filename from path
  const filename = media.path.split(/[/\\]/).pop() || 'Unknown'

  return (
    <div
      className="relative overflow-hidden bg-black group cursor-pointer"
      style={style}
      onClick={hasError ? handleRetry : onShuffle}
    >
      {/* Loading indicator */}
      {loading && !hasError && (
        <div className="absolute inset-0 flex items-center justify-center bg-black z-10">
          <div className="w-8 h-8 border-2 border-white/20 border-t-white/60 rounded-full animate-spin" />
        </div>
      )}

      {/* Error state */}
      {hasError && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/90 z-10">
          <div className="text-2xl mb-1">⚠️</div>
          <div className="text-[10px] text-white/60 mb-2">Failed to load</div>
          <div className="flex gap-2">
            <button
              onClick={handleRetry}
              className="px-2 py-1 text-[10px] bg-white/20 rounded hover:bg-white/30 transition"
            >
              Retry
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onShuffle() }}
              className="px-2 py-1 text-[10px] bg-[var(--primary)]/50 rounded hover:bg-[var(--primary)]/70 transition"
            >
              Skip
            </button>
          </div>
        </div>
      )}

      {url && !hasError && (
        <video
          ref={videoRef}
          src={url}
          autoPlay
          loop
          muted={muted}
          playsInline
          preload="auto"
          className="w-full h-full object-cover"
          onCanPlay={handleCanPlay}
          onLoadedMetadata={() => console.log('[GoonTile] Metadata loaded:', media.path.split(/[/\\]/).pop())}
          onError={handleError}
          onStalled={() => console.warn('[GoonTile] Stalled:', media.path.split(/[/\\]/).pop())}
          onWaiting={() => setLoading(true)}
          onPlaying={() => setLoading(false)}
        />
      )}

      {/* Hover overlay - only show when not in error state */}
      {!hasError && (
        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center">
          <div className="text-xs text-white/80 text-center p-2 truncate max-w-full">
            {filename}
          </div>
          <div className="text-[10px] text-white/50">Click to shuffle</div>
        </div>
      )}
    </div>
  )
}

function DaylistPage() {
  const [daylist, setDaylist] = useState<{ daylist: any; items: MediaRow[] } | null>(null)
  const [loading, setLoading] = useState(false)
  const [motifName, setMotifName] = useState('')
  const [openId, setOpenId] = useState<string | null>(null)

  const generateMotifName = () => {
    const hour = new Date().getHours()
    const pick = <T extends unknown>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)]

    // Time-based prefixes
    const timeVibe = hour >= 0 && hour < 5 ? pick(['3AM Goon Session', 'Midnight Edging', 'Late Night Stroke', 'Insomniac\'s Fap'])
      : hour >= 5 && hour < 9 ? pick(['Morning Wood', 'Dawn Goon', 'Early Bird Edge', 'Wake & Stroke'])
      : hour >= 9 && hour < 12 ? pick(['Mid-Morning Filth', 'Workday Goon Break', 'Secret Session'])
      : hour >= 12 && hour < 17 ? pick(['Afternoon Delight', 'Lunch Break Lust', 'Midday Melt'])
      : hour >= 17 && hour < 21 ? pick(['Evening Edge', 'Sunset Stroke', 'Twilight Goon'])
      : pick(['Nighttime Nasty', 'Bedtime Binge', 'After Dark Session'])

    // Explicit body part / act themes
    const themes = [
      'Thick Ass Overload', 'Juicy Tits Marathon', 'Brain-Melting Creampie',
      'Slutty Blowjob Mix', 'Wet Pussy Worship', 'Deepthroat Dreams',
      'Big Booty Bonanza', 'Cum Compilation', 'Anal Adventures',
      'MILF Madness', 'Teen Temptation', 'Gangbang Gallery',
      'Facial Fest', 'Squirt Special', 'Hardcore Heaven',
      'POV Paradise', 'Threesome Thrills', 'Lesbian Lust',
      'Riding Collection', 'Doggystyle Delights', 'Cowgirl Compilation',
      'Titfuck Tuesday', 'Prone Bone Picks', 'Standing Sex Spectacle'
    ]

    // Emojis for extra spice
    const emojis = ['🔥', '💦', '🍑', '😈', '🥵', '🍆', '💋', '🫦', '😩', '🤤']

    const emoji = pick(emojis)
    const theme = pick(themes)

    return `${emoji} ${timeVibe}: ${theme}`
  }

  const loadDaylist = async () => {
    setLoading(true)
    try {
      const result = await window.api.daylist.getToday({ limit: 50 })
      setDaylist(result)
      setMotifName(generateMotifName())
    } finally {
      setLoading(false)
    }
  }

  const regenerate = async () => {
    setLoading(true)
    try {
      const result = await window.api.daylist.regenerate({ limit: 50 })
      setDaylist(result)
      setMotifName(generateMotifName())
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadDaylist()
  }, [])

  const items = daylist?.items ?? []

  // Calculate intensity curve visualization
  const intensityCurve = useMemo(() => {
    if (items.length === 0) return []
    // Simulate a buildup curve
    return items.map((_, i) => {
      const progress = i / Math.max(items.length - 1, 1)
      // Buildup pattern: starts low, peaks around 70%, tapers slightly
      if (progress < 0.3) return 0.3 + progress * 1.5
      if (progress < 0.7) return 0.75 + (progress - 0.3) * 0.6
      return 0.9 - (progress - 0.7) * 0.3
    })
  }, [items.length])

  return (
    <>
      <TopBar
        title={motifName || 'Today\'s Daylist'}
        right={
          <div className="flex items-center gap-2">
            <Btn onClick={regenerate} disabled={loading}>
              {loading ? 'Generating...' : 'Regenerate'}
            </Btn>
          </div>
        }
      >
        {/* Intensity curve visualization */}
        <div className="mt-4">
          <div className="text-xs text-[var(--muted)] mb-2">Intensity Curve</div>
          <div className="flex items-end gap-0.5 h-8">
            {intensityCurve.map((intensity, i) => (
              <div
                key={i}
                className="flex-1 rounded-t transition-all"
                style={{
                  height: `${intensity * 100}%`,
                  background: `linear-gradient(to top, var(--primary), var(--secondary))`,
                  opacity: 0.3 + intensity * 0.7
                }}
              />
            ))}
          </div>
          <div className="flex justify-between text-[10px] text-[var(--muted)] mt-1">
            <span>Warmup</span>
            <span>Peak</span>
            <span>Cooldown</span>
          </div>
        </div>
      </TopBar>

      <div className="h-[calc(100vh-180px)] overflow-auto p-6">
        {loading && items.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full">
            <div className="animate-pulse text-4xl mb-4">🔥</div>
            <div className="text-sm text-[var(--muted)]">Curating your selection...</div>
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="text-6xl mb-4 opacity-30">📅</div>
            <div className="text-lg font-medium text-[var(--muted)]">No daylist yet</div>
            <div className="text-sm text-[var(--text-subtle)] mt-1 mb-4">
              Generate a personalized selection for today
            </div>
            <Btn tone="primary" onClick={regenerate}>Generate Daylist</Btn>
          </div>
        ) : (
          <>
            {/* Stats */}
            <div className="grid grid-cols-3 gap-4 mb-6">
              <div className="rounded-2xl border border-[var(--border)] bg-black/20 p-4 text-center">
                <div className="text-2xl font-bold">{items.length}</div>
                <div className="text-xs text-[var(--muted)] mt-1">Items</div>
              </div>
              <div className="rounded-2xl border border-[var(--border)] bg-black/20 p-4 text-center">
                <div className="text-2xl font-bold">
                  {formatDuration(items.reduce((sum, m) => sum + (m.durationSec || 0), 0))}
                </div>
                <div className="text-xs text-[var(--muted)] mt-1">Total Duration</div>
              </div>
              <div className="rounded-2xl border border-[var(--border)] bg-black/20 p-4 text-center">
                <div className="text-2xl font-bold">
                  {items.filter(m => m.type === 'video').length}
                </div>
                <div className="text-xs text-[var(--muted)] mt-1">Videos</div>
              </div>
            </div>

            {/* Grid */}
            <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}>
              {items.map((item, idx) => (
                <DaylistItem
                  key={item.id}
                  media={item}
                  index={idx}
                  intensity={intensityCurve[idx] ?? 0.5}
                  onClick={() => setOpenId(item.id)}
                />
              ))}
            </div>
          </>
        )}
      </div>

      {openId && (
        <MediaViewer
          mediaId={openId}
          onClose={() => setOpenId(null)}
          mediaList={items}
          onMediaChange={(newId) => setOpenId(newId)}
        />
      )}
    </>
  )
}

function DaylistItem(props: { media: MediaRow; index: number; intensity: number; onClick: () => void }) {
  const { media, index, intensity, onClick } = props
  const [thumbUrl, setThumbUrl] = useState('')

  useEffect(() => {
    let alive = true
    ;(async () => {
      if (media.thumbPath) {
        const u = await toFileUrlCached(media.thumbPath)
        if (alive) setThumbUrl(u)
      }
    })()
    return () => {
      alive = false
    }
  }, [media.id, media.thumbPath])

  return (
    <div
      onClick={onClick}
      className="rounded-2xl border border-[var(--border)] bg-black/20 overflow-hidden hover:border-[var(--primary)] transition cursor-pointer group"
    >
      {/* Thumbnail */}
      <div className="aspect-video relative overflow-hidden bg-black/30">
        {thumbUrl ? (
          <img src={thumbUrl} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-2xl opacity-30">🎬</div>
        )}

        {/* Index badge */}
        <div className="absolute top-2 left-2 px-2 py-1 rounded-lg bg-black/60 border border-white/10 text-xs font-medium">
          #{index + 1}
        </div>

        {/* Duration */}
        {media.durationSec && (
          <div className="absolute bottom-2 right-2 px-2 py-1 rounded-lg bg-black/60 border border-white/10 text-[10px]">
            {formatDuration(media.durationSec)}
          </div>
        )}

        {/* Intensity indicator */}
        <div
          className="absolute bottom-0 left-0 h-1"
          style={{
            width: `${intensity * 100}%`,
            background: 'linear-gradient(to right, var(--primary), var(--secondary))'
          }}
        />
      </div>

      {/* Info */}
      <div className="p-3">
        <div className="text-sm font-medium truncate">{media.filename}</div>
        <div className="text-xs text-[var(--muted)] mt-1">
          {media.type.toUpperCase()}
        </div>
      </div>
    </div>
  )
}

type PlaylistMood = 'chill' | 'intense' | 'sensual' | 'quick' | 'marathon' | null

const MOOD_CONFIG: Record<Exclude<PlaylistMood, null>, { name: string; icon: string; color: string }> = {
  chill: { name: 'Chill', icon: '🌙', color: '#60a5fa' },
  intense: { name: 'Intense', icon: '🔥', color: '#ef4444' },
  sensual: { name: 'Sensual', icon: '💜', color: '#a855f7' },
  quick: { name: 'Quick', icon: '⚡', color: '#fbbf24' },
  marathon: { name: 'Marathon', icon: '🏃', color: '#22c55e' }
}

function PlaylistsPage() {
  const [playlists, setPlaylists] = useState<PlaylistRow[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [items, setItems] = useState<any[]>([])
  const [newName, setNewName] = useState('')
  const [renaming, setRenaming] = useState<string | null>(null)
  const [renamingValue, setRenamingValue] = useState('')
  const [dragIdx, setDragIdx] = useState<number | null>(null)

  const refresh = async () => {
    const pls = await window.api.playlists.list()
    setPlaylists(pls)
  }

  const loadItems = async (id: string) => {
    const its = await window.api.playlists.getItems(id)
    setItems(its)
  }

  useEffect(() => {
    void refresh()
    const unsub = window.api.events?.onVaultChanged?.(() => {
      void refresh()
      if (selectedId) void loadItems(selectedId)
    })
    return () => unsub?.()
  }, [])

  useEffect(() => {
    if (selectedId) void loadItems(selectedId)
    else setItems([])
  }, [selectedId])

  const createPlaylist = async () => {
    if (!newName.trim()) return
    await window.api.playlists.create(newName.trim())
    setNewName('')
    await refresh()
  }

  const deletePlaylist = async (id: string) => {
    await window.api.playlists.delete(id)
    if (selectedId === id) setSelectedId(null)
    await refresh()
  }

  const renamePlaylist = async (id: string) => {
    if (!renamingValue.trim()) return
    await window.api.playlists.rename(id, renamingValue.trim())
    setRenaming(null)
    await refresh()
  }

  const duplicatePlaylist = async (id: string) => {
    await window.api.playlists.duplicate(id)
    await refresh()
  }

  const exportM3U = async (id: string) => {
    const path = await window.api.playlists.exportM3U(id)
    if (path) {
      window.api.shell?.showItemInFolder?.(path)
    }
  }

  const removeItem = async (playlistItemId: string) => {
    if (!selectedId) return
    await window.api.playlists.removeItem(selectedId, playlistItemId)
    await loadItems(selectedId)
  }

  const handleDragStart = (idx: number) => {
    setDragIdx(idx)
  }

  const handleDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault()
    if (dragIdx === null || dragIdx === idx) return
  }

  const handleDrop = async (e: React.DragEvent, targetIdx: number) => {
    e.preventDefault()
    if (dragIdx === null || dragIdx === targetIdx || !selectedId) {
      setDragIdx(null)
      return
    }

    const newOrder = [...items]
    const [moved] = newOrder.splice(dragIdx, 1)
    newOrder.splice(targetIdx, 0, moved)

    const itemIds = newOrder.map((i: any) => i.playlistItemId)
    await window.api.playlists.reorder(selectedId, itemIds)
    await loadItems(selectedId)
    setDragIdx(null)
  }

  const selectedPlaylist = playlists.find(p => p.id === selectedId)

  return (
    <>
      <TopBar
        title="Playlists"
        right={
          selectedId && (
            <div className="flex items-center gap-2">
              <Btn onClick={() => duplicatePlaylist(selectedId)}>Duplicate</Btn>
              <Btn onClick={() => exportM3U(selectedId)}>Export M3U</Btn>
              <Btn tone="danger" onClick={() => deletePlaylist(selectedId)}>Delete</Btn>
            </div>
          )
        }
      />

      <div className="h-[calc(100vh-80px)] flex">
        {/* Playlist sidebar */}
        <div className="w-[280px] shrink-0 border-r border-[var(--border)] bg-[var(--panel2)] overflow-auto">
          <div className="p-4">
            {/* Create new */}
            <div className="flex gap-2 mb-4">
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && createPlaylist()}
                placeholder="New playlist..."
                className="flex-1 px-3 py-2 rounded-xl bg-black/20 border border-[var(--border)] outline-none focus:border-white/15 text-sm"
              />
              <Btn tone="primary" onClick={createPlaylist}>+</Btn>
            </div>

            {/* Playlist list */}
            <div className="space-y-1">
              {playlists.map((p) => (
                <div
                  key={p.id}
                  onClick={() => setSelectedId(p.id)}
                  className={cn(
                    'px-3 py-2.5 rounded-xl cursor-pointer transition border',
                    selectedId === p.id
                      ? 'bg-white/10 border-white/15'
                      : 'border-transparent hover:bg-white/5'
                  )}
                >
                  {renaming === p.id ? (
                    <input
                      autoFocus
                      value={renamingValue}
                      onChange={(e) => setRenamingValue(e.target.value)}
                      onBlur={() => renamePlaylist(p.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') renamePlaylist(p.id)
                        if (e.key === 'Escape') setRenaming(null)
                      }}
                      onClick={(e) => e.stopPropagation()}
                      className="w-full px-2 py-1 rounded bg-black/30 border border-white/20 text-sm outline-none"
                    />
                  ) : (
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium truncate">{p.name}</span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          setRenaming(p.id)
                          setRenamingValue(p.name)
                        }}
                        className="text-xs text-[var(--muted)] hover:text-white opacity-0 group-hover:opacity-100"
                      >
                        ✏️
                      </button>
                    </div>
                  )}
                </div>
              ))}
              {playlists.length === 0 && (
                <div className="text-xs text-[var(--muted)] text-center py-4">
                  No playlists yet. Create one above.
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Playlist content */}
        <div className="flex-1 overflow-auto">
          {selectedPlaylist ? (
            <div className="p-6">
              {/* Header */}
              <div className="mb-6">
                <h2 className="text-2xl font-bold">{selectedPlaylist.name}</h2>
                <div className="text-sm text-[var(--muted)] mt-1">
                  {items.length} {items.length === 1 ? 'item' : 'items'}
                </div>
              </div>

              {/* Mood selector */}
              <div className="mb-6">
                <div className="text-xs text-[var(--muted)] mb-2">Mood</div>
                <div className="flex gap-2">
                  {(Object.keys(MOOD_CONFIG) as Array<Exclude<PlaylistMood, null>>).map((mood) => {
                    const config = MOOD_CONFIG[mood]
                    return (
                      <button
                        key={mood}
                        className="px-3 py-2 rounded-xl text-xs border border-[var(--border)] hover:border-white/20 transition flex items-center gap-2"
                        style={{ backgroundColor: `${config.color}20` }}
                      >
                        <span>{config.icon}</span>
                        <span>{config.name}</span>
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Items list */}
              <div className="space-y-2">
                {items.map((item: any, idx: number) => (
                  <div
                    key={item.playlistItemId}
                    draggable
                    onDragStart={() => handleDragStart(idx)}
                    onDragOver={(e) => handleDragOver(e, idx)}
                    onDrop={(e) => handleDrop(e, idx)}
                    className={cn(
                      'flex items-center gap-4 p-3 rounded-xl border border-[var(--border)] bg-black/20 hover:border-white/15 transition cursor-grab active:cursor-grabbing',
                      dragIdx === idx && 'opacity-50'
                    )}
                  >
                    {/* Drag handle */}
                    <div className="text-[var(--muted)] select-none">⋮⋮</div>

                    {/* Position */}
                    <div className="w-6 text-center text-xs text-[var(--muted)]">{idx + 1}</div>

                    {/* Thumbnail */}
                    <PlaylistItemThumb item={item} />

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{item.media?.filename ?? item.filename ?? 'Unknown'}</div>
                      <div className="text-xs text-[var(--muted)] flex items-center gap-2 mt-0.5">
                        <span>{(item.media?.type ?? item.type ?? '').toUpperCase()}</span>
                        {(item.media?.durationSec ?? item.durationSec) && (
                          <span>{formatDuration(item.media?.durationSec ?? item.durationSec)}</span>
                        )}
                      </div>
                    </div>

                    {/* Remove */}
                    <Btn tone="danger" onClick={() => removeItem(item.playlistItemId)}>
                      Remove
                    </Btn>
                  </div>
                ))}

                {items.length === 0 && (
                  <div className="text-center py-12">
                    <div className="text-4xl mb-3 opacity-30">📋</div>
                    <div className="text-sm text-[var(--muted)]">This playlist is empty</div>
                    <div className="text-xs text-[var(--text-subtle)] mt-1">
                      Add items from the Library view
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-center p-6">
              <div className="text-6xl mb-4 opacity-30">📋</div>
              <div className="text-lg font-medium text-[var(--muted)]">Select a playlist</div>
              <div className="text-sm text-[var(--text-subtle)] mt-1">
                Choose a playlist from the sidebar or create a new one
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  )
}

function PlaylistItemThumb(props: { item: any }) {
  const [url, setUrl] = useState('')
  const item = props.item

  useEffect(() => {
    let alive = true
    ;(async () => {
      const thumbPath = item.media?.thumbPath ?? item.thumbPath
      if (thumbPath) {
        const u = await toFileUrlCached(thumbPath)
        if (alive) setUrl(u)
      }
    })()
    return () => {
      alive = false
    }
  }, [item])

  return (
    <div className="w-16 h-10 rounded-lg bg-black/30 overflow-hidden flex-shrink-0">
      {url ? (
        <img src={url} alt="" className="w-full h-full object-cover" />
      ) : (
        <div className="w-full h-full flex items-center justify-center text-xs text-[var(--muted)]">
          🎬
        </div>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// GOON STATS PAGE - Track your pleasure journey
// ═══════════════════════════════════════════════════════════════════════════

type GoonStats = {
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
  achievements: string[]
  activityHeatmap: Record<string, number>
}

type Achievement = {
  id: string
  name: string
  description: string
  icon: string
  category: string
  target: number
  secret?: boolean
}

function StatsPage() {
  const [stats, setStats] = useState<GoonStats | null>(null)
  const [achievements, setAchievements] = useState<Achievement[]>([])
  const [loading, setLoading] = useState(true)
  const [sessionActive, setSessionActive] = useState(false)
  const [sessionStart, setSessionStart] = useState<number | null>(null)
  const [sessionTime, setSessionTime] = useState(0)

  useEffect(() => {
    loadStats()
    loadAchievements()

    // Listen for stats changes
    const unsubStats = window.api.events.onGoonStatsChanged?.((s: GoonStats) => setStats(s))
    const unsubAchievement = window.api.events.onAchievementUnlocked?.((ids: string[]) => {
      // Could show a toast here
      console.log('Achievements unlocked:', ids)
    })

    return () => {
      unsubStats?.()
      unsubAchievement?.()
    }
  }, [])

  // Session timer
  useEffect(() => {
    if (!sessionActive || !sessionStart) return
    const interval = setInterval(() => {
      setSessionTime(Math.floor((Date.now() - sessionStart) / 1000))
    }, 1000)
    return () => clearInterval(interval)
  }, [sessionActive, sessionStart])

  const loadStats = async () => {
    try {
      const s = await window.api.goon.getStats()
      setStats(s)
    } catch (e) {
      console.error('Failed to load stats:', e)
    } finally {
      setLoading(false)
    }
  }

  const loadAchievements = async () => {
    try {
      const a = await window.api.goon.getAchievements()
      setAchievements(a)
    } catch (e) {
      console.error('Failed to load achievements:', e)
    }
  }

  const startSession = async () => {
    setSessionActive(true)
    setSessionStart(Date.now())
    setSessionTime(0)
    await window.api.goon.startSession()
  }

  const endSession = async () => {
    const minutes = Math.floor(sessionTime / 60)
    await window.api.goon.endSession(minutes)
    setSessionActive(false)
    setSessionStart(null)
    setSessionTime(0)
    loadStats()
  }

  const recordEdge = async () => {
    const result = await window.api.goon.recordEdge()
    setStats(result.stats)
  }

  const recordOrgasm = async (ruined = false) => {
    const result = await window.api.goon.recordOrgasm(ruined)
    setStats(result.stats)
    endSession()
  }

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    const s = seconds % 60
    if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    return `${m}:${String(s).padStart(2, '0')}`
  }

  const formatHours = (minutes: number) => {
    const h = Math.floor(minutes / 60)
    const m = minutes % 60
    if (h === 0) return `${m}m`
    return `${h}h ${m}m`
  }

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-[var(--muted)] animate-pulse-subtle">Loading your stats...</div>
      </div>
    )
  }

  const unlockedAchievements = achievements.filter(a => stats?.achievements.includes(a.id))
  const lockedAchievements = achievements.filter(a => !stats?.achievements.includes(a.id) && !a.secret)

  return (
    <div className="h-full flex flex-col">
      <TopBar title="🔥 Your Goon Stats" right={
        <div className="flex gap-2">
          {!sessionActive ? (
            <Btn tone="primary" onClick={startSession} className="animate-breathe">
              🎬 Start Session
            </Btn>
          ) : (
            <>
              <div className="px-4 py-2 bg-[var(--primary)]/20 rounded-xl text-sm font-mono animate-throb">
                {formatTime(sessionTime)}
              </div>
              <Btn onClick={recordEdge}>🔥 Edge</Btn>
              <Btn onClick={() => recordOrgasm(false)}>💦 Cum</Btn>
              <Btn onClick={() => recordOrgasm(true)} tone="danger">😵 Ruined</Btn>
              <Btn tone="ghost" onClick={endSession}>⏹️ End</Btn>
            </>
          )}
        </div>
      } />

      <div className="flex-1 overflow-auto p-6">
        {/* Diabella Commentary */}
        <div className="mb-6 p-4 bg-[var(--primary)]/10 rounded-2xl border border-[var(--primary)]/20">
          <div className="text-sm italic text-[var(--muted)]">
            {stats && stats.totalTimeGooning > 6000
              ? "You absolute degenerate... I love it 😏 You've spent over 100 hours gooning. I'm impressed."
              : stats && stats.totalTimeGooning > 1000
                ? "Mmm, you're becoming quite the dedicated gooner. I've been watching... 👀"
                : stats && stats.totalSessions > 10
                  ? "You keep coming back for more. I knew you would. Let me help you feel even better..."
                  : "Welcome to your pleasure palace. Let's track your journey together, gorgeous..."}
          </div>
        </div>

        {/* Main Stats Grid */}
        <div className="grid grid-cols-4 gap-4 mb-8">
          <div className="p-4 bg-white/5 rounded-2xl border border-white/10 sensual-hover">
            <div className="text-3xl font-bold text-[var(--primary)] mb-1">
              {formatHours(stats?.totalTimeGooning ?? 0)}
            </div>
            <div className="text-xs text-[var(--muted)]">Total Time Gooning</div>
          </div>

          <div className="p-4 bg-white/5 rounded-2xl border border-white/10 sensual-hover">
            <div className="text-3xl font-bold text-red-400 mb-1">
              {stats?.totalEdges ?? 0}
            </div>
            <div className="text-xs text-[var(--muted)]">Total Edges</div>
          </div>

          <div className="p-4 bg-white/5 rounded-2xl border border-white/10 sensual-hover">
            <div className="text-3xl font-bold text-pink-400 mb-1">
              💦 {stats?.totalOrgasms ?? 0}
            </div>
            <div className="text-xs text-[var(--muted)]">Times You Came</div>
          </div>

          <div className="p-4 bg-white/5 rounded-2xl border border-white/10 sensual-hover">
            <div className="text-3xl font-bold text-amber-400 mb-1">
              🔥 {stats?.currentStreak ?? 0}
            </div>
            <div className="text-xs text-[var(--muted)]">Day Streak</div>
          </div>
        </div>

        {/* Secondary Stats */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          <div className="p-4 bg-white/5 rounded-xl border border-white/10">
            <div className="text-xl font-semibold mb-1">{stats?.totalSessions ?? 0}</div>
            <div className="text-xs text-[var(--muted)]">Total Sessions</div>
          </div>
          <div className="p-4 bg-white/5 rounded-xl border border-white/10">
            <div className="text-xl font-semibold mb-1">{stats?.longestSession ?? 0}m</div>
            <div className="text-xs text-[var(--muted)]">Longest Session</div>
          </div>
          <div className="p-4 bg-white/5 rounded-xl border border-white/10">
            <div className="text-xl font-semibold mb-1">{stats?.averageSessionLength ?? 0}m</div>
            <div className="text-xs text-[var(--muted)]">Average Session</div>
          </div>
          <div className="p-4 bg-white/5 rounded-xl border border-white/10">
            <div className="text-xl font-semibold mb-1">{stats?.totalVideosWatched ?? 0}</div>
            <div className="text-xs text-[var(--muted)]">Videos Enjoyed</div>
          </div>
          <div className="p-4 bg-white/5 rounded-xl border border-white/10">
            <div className="text-xl font-semibold mb-1">{stats?.longestStreak ?? 0}</div>
            <div className="text-xs text-[var(--muted)]">Longest Streak</div>
          </div>
          <div className="p-4 bg-white/5 rounded-xl border border-white/10">
            <div className="text-xl font-semibold mb-1">{stats?.ruinedOrgasms ?? 0}</div>
            <div className="text-xs text-[var(--muted)]">Ruined Orgasms</div>
          </div>
        </div>

        {/* Achievements */}
        <div className="mb-8">
          <div className="text-lg font-semibold mb-4">🏆 Achievements Unlocked ({unlockedAchievements.length}/{achievements.length})</div>
          <div className="grid grid-cols-4 gap-3">
            {unlockedAchievements.map(a => (
              <div key={a.id} className="p-3 bg-[var(--primary)]/10 rounded-xl border border-[var(--primary)]/30 sensual-hover">
                <div className="text-2xl mb-1">{a.icon}</div>
                <div className="text-sm font-medium">{a.name}</div>
                <div className="text-xs text-[var(--muted)]">{a.description}</div>
              </div>
            ))}
            {lockedAchievements.slice(0, 8).map(a => (
              <div key={a.id} className="p-3 bg-white/5 rounded-xl border border-white/10 opacity-50">
                <div className="text-2xl mb-1 grayscale">🔒</div>
                <div className="text-sm font-medium">{a.name}</div>
                <div className="text-xs text-[var(--muted)]">{a.description}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Streak Banner */}
        {stats && stats.currentStreak > 0 && (
          <div className="p-4 bg-gradient-to-r from-[var(--primary)]/20 to-[var(--secondary)]/20 rounded-2xl border border-[var(--primary)]/30 text-center animate-breathe">
            <div className="text-4xl mb-2">{'🔥'.repeat(Math.min(stats.currentStreak, 10))}</div>
            <div className="text-xl font-bold">{stats.currentStreak} Day Streak!</div>
            <div className="text-sm text-[var(--muted)]">
              {stats.currentStreak >= 30
                ? "You're a goon legend! Don't break the chain!"
                : stats.currentStreak >= 7
                  ? "A whole week! Your dedication is... admirable 😏"
                  : "Keep going... build that streak, gooner."}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

type ChatMessage = {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: number
}

function DiabellaPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [connected, setConnected] = useState<boolean | null>(null)
  const [personality, setPersonality] = useState<any>(null)
  const [greeting, setGreeting] = useState('')
  const [avatarImage, setAvatarImage] = useState<string | null>(null)
  const [generatingAvatar, setGeneratingAvatar] = useState(false)
  const [ttsEnabled, setTtsEnabled] = useState(false)
  const [speaking, setSpeaking] = useState(false)
  const [spiceLevel, setSpiceLevel] = useState(3)
  const [showSettings, setShowSettings] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const checkConnection = async () => {
    try {
      const result = await window.api.ai.ping()
      setConnected(result?.ok ?? false)
    } catch {
      setConnected(false)
    }
  }

  const loadPersonality = async () => {
    try {
      const p = await window.api.settings.personality?.getActive?.()
      setPersonality(p)
    } catch {
      // Settings API might not have this method yet
    }
  }

  const loadGreeting = async () => {
    try {
      const line = await window.api.ai.getVoiceLine('greetings')
      if (line) setGreeting(line)
    } catch {
      setGreeting("Hey there... ready to explore?")
    }
  }

  const loadSettings = async () => {
    try {
      const settings = await window.api.settings.get() as any
      if (settings?.diabella) {
        setTtsEnabled(settings.diabella.tts?.enabled ?? false)
        setSpiceLevel(settings.diabella.spiciness ?? 3)
      }
    } catch {}
  }

  // Load saved avatar or generate new one
  const loadOrGenerateAvatar = async () => {
    // Try to load from localStorage first
    const savedAvatar = localStorage.getItem('diabella-avatar')
    if (savedAvatar) {
      setAvatarImage(savedAvatar)
      return
    }

    // Auto-generate avatar on first load
    setGeneratingAvatar(true)
    try {
      const result = await window.api.ai.generateAvatar()
      if (result?.image) {
        const dataUrl = `data:image/png;base64,${result.image}`
        setAvatarImage(dataUrl)
        localStorage.setItem('diabella-avatar', dataUrl)
      }
    } catch (e) {
      console.warn('[Diabella] Failed to generate avatar:', e)
    }
    setGeneratingAvatar(false)
  }

  useEffect(() => {
    void checkConnection()
    void loadPersonality()
    void loadGreeting()
    void loadSettings()
    void loadOrGenerateAvatar()

    // Play greeting sound if available
    hasSounds().then(has => {
      if (has) {
        void playGreeting({ volume: 0.6 })
      }
    })
  }, [])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Speak text using TTS
  const speakText = async (text: string) => {
    if (!ttsEnabled || speaking) return

    setSpeaking(true)
    try {
      const result = await window.api.ai.speak(text)
      if (result?.audio) {
        const audio = new Audio(`data:audio/mp3;base64,${result.audio}`)
        audioRef.current = audio
        audio.onended = () => setSpeaking(false)
        await audio.play()
      }
    } catch {
      setSpeaking(false)
    }
  }

  const stopSpeaking = () => {
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current = null
    }
    setSpeaking(false)
  }

  // Generate avatar image with Venice AI
  const generateAvatar = async () => {
    setGeneratingAvatar(true)
    try {
      const result = await window.api.ai.generateAvatar()
      if (result?.image) {
        const dataUrl = `data:image/png;base64,${result.image}`
        setAvatarImage(dataUrl)
        localStorage.setItem('diabella-avatar', dataUrl)
      }
    } catch (e) {
      console.warn('[Diabella] Failed to generate avatar:', e)
    }
    setGeneratingAvatar(false)
  }

  const sendMessage = async () => {
    if (!input.trim() || loading) return

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: input.trim(),
      timestamp: Date.now()
    }

    setMessages((prev) => [...prev, userMessage])
    setInput('')
    setLoading(true)

    try {
      const chatMessages = [...messages, userMessage].map((m) => ({
        role: m.role,
        content: m.content
      }))

      const result = await window.api.ai.chat({ messages: chatMessages })

      const responseText = result?.response || result?.error || "I couldn't process that. Try again?"

      const assistantMessage: ChatMessage = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: responseText,
        timestamp: Date.now()
      }

      setMessages((prev) => [...prev, assistantMessage])

      // Auto-speak response if TTS is enabled
      if (ttsEnabled && result?.response) {
        void speakText(result.response)
      }
    } catch (e: any) {
      const errorMessage: ChatMessage = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: `Oops, something went wrong: ${e.message || 'Unknown error'}`,
        timestamp: Date.now()
      }
      setMessages((prev) => [...prev, errorMessage])
    } finally {
      setLoading(false)
    }
  }

  const clearChat = () => {
    setMessages([])
    void loadGreeting()
  }

  return (
    <>
      <TopBar
        title="Diabella"
        right={
          <div className="flex items-center gap-3">
            {/* Connection status */}
            <div className="flex items-center gap-2">
              <div
                className={cn(
                  'w-2 h-2 rounded-full',
                  connected === null ? 'bg-yellow-500 animate-pulse' : connected ? 'bg-green-500' : 'bg-red-500'
                )}
              />
              <span className="text-xs text-[var(--muted)]">
                {connected === null ? 'Checking...' : connected ? 'Connected' : 'Offline'}
              </span>
            </div>
            <Btn onClick={clearChat}>Clear Chat</Btn>
          </div>
        }
      />

      {/* SIDE-BY-SIDE LAYOUT - Large avatar panel + Chat */}
      <div className="h-[calc(100vh-80px)] flex">
        {/* LEFT: DIABELLA FULL BODY PANEL - 40% width */}
        <div className="w-[40%] min-w-[350px] max-w-[500px] shrink-0 border-r border-[var(--border)] relative bg-black flex flex-col">
          {/* Full body image - no blur, no filters */}
          <div className="flex-1 relative overflow-hidden">
            <DiabellaAvatar speaking={speaking} />
          </div>

          {/* Bottom controls overlay */}
          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black via-black/80 to-transparent p-4">
            {/* Name and status */}
            <div className="flex items-center justify-between mb-3">
              <div>
                <div className="text-xl font-bold text-white">{personality?.name || 'Diabella'}</div>
                <div className="text-xs text-pink-300">{personality?.description || 'Your sultry AI companion'}</div>
              </div>
              <div className="flex items-center gap-2">
                <div className={cn(
                  'w-2 h-2 rounded-full',
                  connected === null ? 'bg-yellow-500 animate-pulse' : connected ? 'bg-green-500' : 'bg-red-500'
                )} />
                <span className="text-xs text-white/60">
                  {connected === null ? '...' : connected ? 'Online' : 'Offline'}
                </span>
              </div>
            </div>

            {/* Speaking indicator */}
            {speaking && (
              <div className="flex items-center gap-2 text-green-400 mb-3">
                <span className="animate-pulse">🔊</span>
                <span className="text-sm">Speaking...</span>
                <button onClick={stopSpeaking} className="text-xs text-white/60 hover:text-white underline ml-2">Stop</button>
              </div>
            )}

            {/* Controls row */}
            <div className="flex items-center gap-4 flex-wrap">
              {/* TTS Toggle */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-white/60">Voice</span>
                <button
                  onClick={async () => {
                    const newValue = !ttsEnabled
                    setTtsEnabled(newValue)
                    await window.api.settings.diabella?.update?.({ tts: { enabled: newValue } })
                  }}
                  className={cn(
                    'w-10 h-5 rounded-full relative transition',
                    ttsEnabled ? 'bg-pink-500' : 'bg-white/20'
                  )}
                >
                  <div className={cn(
                    'absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform',
                    ttsEnabled ? 'translate-x-5' : 'translate-x-0.5'
                  )} />
                </button>
              </div>

              {/* Spice Level */}
              <div className="flex items-center gap-1">
                <span className="text-xs text-white/60 mr-1">Spice:</span>
                {[1, 2, 3, 4, 5].map((level) => (
                  <button
                    key={level}
                    onClick={async () => {
                      setSpiceLevel(level)
                      await window.api.settings.diabella?.update?.({ spiciness: level })
                    }}
                    className={cn(
                      'w-6 h-6 rounded text-xs font-bold transition',
                      level <= spiceLevel ? 'bg-pink-600 text-white' : 'bg-white/20 text-white/50 hover:bg-white/30'
                    )}
                  >
                    {level}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT: CHAT AREA */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Messages */}
          <div className="flex-1 overflow-auto p-6 space-y-4">
            {/* Welcome when no messages */}
            {messages.length === 0 && (
              <div className="max-w-lg mx-auto mt-8">
                <div className="text-lg italic text-center text-pink-300 mb-6">"{greeting}"</div>
                <div className="text-sm text-[var(--muted)] mb-4 text-center">Start a conversation with Diabella</div>
                <div className="grid grid-cols-2 gap-3">
                  <SuggestionBtn onClick={() => setInput('Show me something new')}>
                    Show me something new
                  </SuggestionBtn>
                  <SuggestionBtn onClick={() => setInput("What's popular?")}>
                    What's popular?
                  </SuggestionBtn>
                  <SuggestionBtn onClick={() => setInput('Create a playlist for me')}>
                    Create a playlist for me
                  </SuggestionBtn>
                  <SuggestionBtn onClick={() => setInput('Surprise me')}>
                    Surprise me
                  </SuggestionBtn>
                </div>
              </div>
            )}

            {/* Message list */}
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={cn(
                  'max-w-[85%] rounded-2xl p-4 group',
                  msg.role === 'user'
                    ? 'ml-auto bg-[var(--primary)] text-white'
                    : 'mr-auto bg-black/30 border border-[var(--border)]'
                )}
              >
                <div className="text-sm whitespace-pre-wrap">{msg.content}</div>
                <div className="flex items-center justify-between mt-2">
                  <div className="text-[10px] opacity-50">
                    {new Date(msg.timestamp).toLocaleTimeString()}
                  </div>
                  {msg.role === 'assistant' && (
                    <button
                      onClick={() => speakText(msg.content)}
                      disabled={speaking}
                      className="opacity-0 group-hover:opacity-100 text-xs text-[var(--muted)] hover:text-[var(--primary)] transition"
                    >
                      {speaking ? '...' : '🔊'}
                    </button>
                  )}
                </div>
              </div>
            ))}

            {/* Loading */}
            {loading && (
              <div className="mr-auto bg-black/30 border border-[var(--border)] rounded-2xl p-4 max-w-[85%]">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-pink-500 animate-bounce" />
                  <div className="w-2 h-2 rounded-full bg-pink-500 animate-bounce" style={{ animationDelay: '0.1s' }} />
                  <div className="w-2 h-2 rounded-full bg-pink-500 animate-bounce" style={{ animationDelay: '0.2s' }} />
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="p-4 border-t border-[var(--border)] bg-[var(--panel)]">
            <div className="flex gap-3">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && sendMessage()}
                placeholder="Ask Diabella anything..."
                disabled={loading}
                className="flex-1 px-4 py-3 rounded-xl bg-black/20 border border-[var(--border)] outline-none focus:border-pink-500 text-sm disabled:opacity-50"
              />
              <Btn tone="primary" onClick={sendMessage} disabled={loading || !input.trim()}>
                Send
              </Btn>
            </div>
            {!connected && (
              <div className="text-xs text-[var(--warning)] mt-2">
                AI not connected. Configure in Settings.
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  )
}

function SuggestionBtn(props: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      onClick={props.onClick}
      className="px-4 py-3 rounded-xl border border-[var(--border)] bg-black/20 hover:border-[var(--primary)] transition text-sm text-left"
    >
      {props.children}
    </button>
  )
}

function QuickPhrase(props: { text: string; onSpeak?: (text: string) => void }) {
  return (
    <div className="text-xs text-[var(--muted)] italic p-3 rounded-xl bg-black/20 border border-[var(--border)] flex items-start justify-between gap-2 group">
      <span>"{props.text}"</span>
      {props.onSpeak && (
        <button
          onClick={() => props.onSpeak?.(props.text)}
          className="opacity-0 group-hover:opacity-100 text-[var(--primary)] hover:text-white transition flex-shrink-0"
        >
          🔊
        </button>
      )}
    </div>
  )
}

function GIFPage() {
  const [gifs, setGifs] = useState<MediaRow[]>([])
  const [query, setQuery] = useState('')
  const [tags, setTags] = useState<TagRow[]>([])
  const [activeTags, setActiveTags] = useState<string[]>([])
  const [previewId, setPreviewId] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<'grid' | 'mosaic'>('grid')

  const refresh = async () => {
    const result = await window.api.media.list({
      q: query,
      type: 'gif',
      tags: activeTags,
      limit: 500
    })
    const items = Array.isArray(result) ? result : result?.items ?? []
    setGifs(items)
  }

  useEffect(() => {
    let alive = true
    ;(async () => {
      const t = await window.api.tags.list()
      if (!alive) return
      setTags(t)
      await refresh()
    })()
    const unsub = window.api.events?.onVaultChanged?.(() => void refresh())
    return () => {
      alive = false
      unsub?.()
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [query, activeTags.join('|')])

  const toggleTag = (name: string) => {
    setActiveTags((prev) => (prev.includes(name) ? prev.filter((x) => x !== name) : [...prev, name]))
  }

  return (
    <>
      <TopBar
        title="GIFs"
        right={
          <div className="flex items-center gap-2">
            <Btn tone={viewMode === 'grid' ? 'primary' : 'ghost'} onClick={() => setViewMode('grid')}>
              Grid
            </Btn>
            <Btn tone={viewMode === 'mosaic' ? 'primary' : 'ghost'} onClick={() => setViewMode('mosaic')}>
              Mosaic
            </Btn>
            <Btn onClick={() => void refresh()}>Refresh</Btn>
          </div>
        }
      >
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search GIFs..."
          className="w-full px-4 py-2.5 rounded-xl bg-black/20 border border-[var(--border)] outline-none focus:border-white/15 text-sm"
        />
      </TopBar>

      <div className="h-[calc(100vh-130px)] flex">
        {/* Tags sidebar */}
        <div className="w-[200px] shrink-0 border-r border-[var(--border)] bg-[var(--panel2)] overflow-auto">
          <div className="p-4">
            <div className="text-xs text-[var(--muted)] mb-3 font-medium">Filter by Tag</div>
            <div className="space-y-1">
              {tags.map((t) => {
                const active = activeTags.includes(t.name)
                return (
                  <button
                    key={t.id}
                    onClick={() => toggleTag(t.name)}
                    className={cn(
                      'w-full text-left px-3 py-2 rounded-lg text-xs transition',
                      active
                        ? 'bg-[var(--primary-muted)] text-[var(--primary)]'
                        : 'hover:bg-white/5'
                    )}
                  >
                    {t.name}
                  </button>
                )
              })}
              {!tags.length && <div className="text-xs text-[var(--muted)]">No tags yet</div>}
            </div>
          </div>
        </div>

        {/* GIF Grid */}
        <div className="flex-1 overflow-auto p-4">
          {gifs.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <div className="text-6xl mb-4 opacity-30">🎞️</div>
              <div className="text-lg font-medium text-[var(--muted)]">No GIFs found</div>
              <div className="text-sm text-[var(--text-subtle)] mt-1">
                Add some GIFs to your media folders to see them here
              </div>
            </div>
          ) : (
            <div
              className={cn(
                'gap-3',
                viewMode === 'grid'
                  ? 'grid'
                  : 'columns-2 sm:columns-3 md:columns-4 lg:columns-5 xl:columns-6 space-y-3'
              )}
              style={viewMode === 'grid' ? { gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))' } : undefined}
            >
              {gifs.map((gif) => (
                <GIFTile
                  key={gif.id}
                  gif={gif}
                  isPreview={previewId === gif.id}
                  onHover={() => setPreviewId(gif.id)}
                  onLeave={() => setPreviewId(null)}
                  viewMode={viewMode}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  )
}

function GIFTile(props: {
  gif: MediaRow
  isPreview: boolean
  onHover: () => void
  onLeave: () => void
  viewMode: 'grid' | 'mosaic'
}) {
  const { gif, isPreview, onHover, onLeave, viewMode } = props
  const [url, setUrl] = useState('')
  const [thumbUrl, setThumbUrl] = useState('')

  useEffect(() => {
    let alive = true
    ;(async () => {
      // Get both thumb and full URL
      if (gif.thumbPath) {
        const t = await toFileUrlCached(gif.thumbPath)
        if (alive) setThumbUrl(t)
      }
      const u = await toFileUrlCached(gif.path)
      if (alive) setUrl(u)
    })()
    return () => {
      alive = false
    }
  }, [gif.id, gif.path, gif.thumbPath])

  return (
    <div
      onMouseEnter={onHover}
      onMouseLeave={onLeave}
      className={cn(
        'relative group rounded-xl overflow-hidden border border-[var(--border)] hover:border-[var(--primary)] transition-all cursor-pointer',
        viewMode === 'mosaic' ? 'break-inside-avoid mb-3' : ''
      )}
    >
      <div className={cn(viewMode === 'grid' ? 'aspect-square' : '')}>
        {/* Show animated GIF on hover, static thumb otherwise */}
        <img
          src={isPreview ? url : (thumbUrl || url)}
          alt={gif.filename}
          className="w-full h-full object-cover"
          loading="lazy"
        />
      </div>

      {/* Overlay on hover */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
        <div className="absolute bottom-0 left-0 right-0 p-3">
          <div className="text-xs font-medium truncate">{gif.filename}</div>
          {gif.width && gif.height && (
            <div className="text-[10px] text-[var(--muted)] mt-0.5">
              {gif.width} × {gif.height}
            </div>
          )}
        </div>
      </div>

      {/* Playing indicator */}
      {isPreview && (
        <div className="absolute top-2 right-2 px-2 py-1 rounded-full bg-[var(--primary)] text-[10px] font-medium">
          Playing
        </div>
      )}
    </div>
  )
}

function SettingsPage(props: {
  settings: VaultSettings | null
  patchSettings: (p: Partial<VaultSettings>) => void
  visualEffectsEnabled: boolean
  setVisualEffectsEnabled: (v: boolean) => void
  ambientHeatLevel: number
  setAmbientHeatLevel: (v: number) => void
  // Overlay states
  sparklesEnabled: boolean
  setSparklesEnabled: (v: boolean) => void
  bokehEnabled: boolean
  setBokehEnabled: (v: boolean) => void
  starfieldEnabled: boolean
  setStarfieldEnabled: (v: boolean) => void
  filmGrainEnabled: boolean
  setFilmGrainEnabled: (v: boolean) => void
  dreamyHazeEnabled: boolean
  setDreamyHazeEnabled: (v: boolean) => void
  // Pixel background
  pixelBackgroundEnabled: boolean
  setPixelBackgroundEnabled: (v: boolean) => void
  pixelTheme: PixelTheme | 'none'
  setPixelTheme: (v: PixelTheme | 'none') => void
  pixelParallaxStrength: number
  setPixelParallaxStrength: (v: number) => void
  pixelOpacity: number
  setPixelOpacity: (v: number) => void
  pixelCursorEnabled: boolean
  setPixelCursorEnabled: (v: boolean) => void
}) {
  const {
    visualEffectsEnabled, setVisualEffectsEnabled,
    ambientHeatLevel, setAmbientHeatLevel,
    sparklesEnabled, setSparklesEnabled,
    bokehEnabled, setBokehEnabled,
    starfieldEnabled, setStarfieldEnabled,
    filmGrainEnabled, setFilmGrainEnabled,
    dreamyHazeEnabled, setDreamyHazeEnabled,
    pixelBackgroundEnabled, setPixelBackgroundEnabled,
    pixelTheme, setPixelTheme,
    pixelParallaxStrength, setPixelParallaxStrength,
    pixelOpacity, setPixelOpacity,
    pixelCursorEnabled, setPixelCursorEnabled
  } = props
  const s = props.settings as any
  const [activeTab, setActiveTab] = useState<'library' | 'diabella' | 'appearance' | 'privacy' | 'playback'>('library')
  const [isPremium, setIsPremium] = useState(false)

  useEffect(() => {
    window.api.license?.isPremium?.().then((p: any) => setIsPremium(!!p))
  }, [])

  // Support both new and legacy settings structure
  const mediaDirs = s?.library?.mediaDirs ?? s?.mediaDirs ?? []
  const cacheDir = s?.library?.cacheDir ?? s?.cacheDir ?? ''
  const diabellaSettings = s?.diabella ?? {}
  const privacySettings = s?.privacy ?? {}
  const playbackSettings = s?.playback ?? {}

  const tabs = [
    { id: 'library', name: 'Library', icon: Library },
    { id: 'diabella', name: 'Diabella', icon: Heart },
    { id: 'appearance', name: 'Appearance', icon: Sparkles },
    { id: 'playback', name: 'Playback', icon: Play },
    { id: 'privacy', name: 'Privacy', icon: Eye },
  ] as const

  return (
    <>
      <TopBar title="Settings" />
      <div className="flex">
        {/* Settings Tabs */}
        <div className="w-48 p-4 border-r border-[var(--border)]">
          {tabs.map((tab) => {
            const Icon = tab.icon
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  'w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left text-sm transition',
                  activeTab === tab.id
                    ? 'bg-[var(--primary)]/20 text-[var(--primary)]'
                    : 'text-[var(--muted)] hover:text-white hover:bg-white/5'
                )}
              >
                <Icon size={18} />
                {tab.name}
              </button>
            )
          })}
        </div>

        {/* Settings Content */}
        <div className="flex-1 p-6 space-y-6 overflow-y-auto max-h-[calc(100vh-80px)]">
          {/* Library Tab */}
          {activeTab === 'library' && (
            <>
              <div className="rounded-3xl border border-[var(--border)] bg-black/20 p-5">
                <div className="text-sm font-semibold">Media folders</div>
                <div className="mt-3 space-y-2">
                  {mediaDirs.map((d: string) => (
                    <div key={d} className="flex items-center justify-between gap-3">
                      <div className="text-xs text-[var(--muted)] truncate">{d}</div>
                      <Btn
                        tone="danger"
                        onClick={async () => {
                          const next = await window.api.settings.removeMediaDir(d)
                          props.patchSettings(next)
                        }}
                      >
                        Remove
                      </Btn>
                    </div>
                  ))}
                  <Btn
                    onClick={async () => {
                      const nextDir = await window.api.settings.chooseMediaDir()
                      if (!nextDir) return
                      const next = await window.api.settings.get()
                      props.patchSettings(next)
                    }}
                  >
                    Add folder
                  </Btn>
                </div>
              </div>

              <div className="rounded-3xl border border-[var(--border)] bg-black/20 p-5">
                <div className="text-sm font-semibold">Cache folder</div>
                <div className="mt-2 text-xs text-[var(--muted)] truncate">{cacheDir}</div>
                <div className="mt-3">
                  <Btn
                    onClick={async () => {
                      const nextDir = await window.api.settings.chooseCacheDir()
                      if (!nextDir) return
                      const next = await window.api.settings.get()
                      props.patchSettings(next)
                    }}
                  >
                    Choose cache folder
                  </Btn>
                </div>
              </div>

              {/* Library Tools - Smart Tagging */}
              <LibraryToolsSection />
            </>
          )}

          {/* Diabella Tab */}
          {activeTab === 'diabella' && (
            MAINTENANCE_MODE.diabella ? (
              <div className="rounded-3xl border border-amber-500/30 bg-amber-500/5 p-6 flex flex-col items-center text-center">
                <Construction size={32} className="text-amber-500 mb-3" />
                <div className="text-sm font-semibold mb-2">Under Maintenance</div>
                <div className="text-xs text-white/60">
                  Diabella settings are temporarily unavailable while we work on improvements.
                </div>
              </div>
            ) : (
            <>
              <div className="rounded-3xl border border-[var(--border)] bg-black/20 p-5">
                <div className="text-sm font-semibold mb-4 flex items-center gap-2">
                  <Heart size={18} className="text-[var(--primary)]" />
                  AI Companion
                  {!isPremium && (
                    <span className="ml-auto text-xs bg-[var(--primary)]/20 text-[var(--primary)] px-2 py-1 rounded-full">
                      Premium
                    </span>
                  )}
                </div>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm">Enable Diabella</div>
                      <div className="text-xs text-[var(--muted)]">Your AI companion for sessions</div>
                    </div>
                    <ToggleSwitch
                      checked={diabellaSettings.enabled ?? true}
                      onChange={async (v) => {
                        await window.api.settings.diabella?.update?.({ enabled: v })
                        const next = await window.api.settings.get()
                        props.patchSettings(next)
                      }}
                      disabled={!isPremium}
                    />
                  </div>

                  <div>
                    <div className="text-sm mb-2">Spice Level</div>
                    <div className="text-xs text-[var(--muted)] mb-3">How explicit should Diabella be?</div>
                    <div className="flex gap-2">
                      {[1, 2, 3, 4, 5].map((level) => (
                        <button
                          key={level}
                          onClick={async () => {
                            await window.api.settings.diabella?.update?.({ spiciness: level })
                            const next = await window.api.settings.get()
                            props.patchSettings(next)
                          }}
                          disabled={!isPremium}
                          className={cn(
                            'flex-1 py-2 rounded-lg text-sm transition',
                            (diabellaSettings.spiciness ?? 3) === level
                              ? 'bg-[var(--primary)] text-white'
                              : 'bg-black/20 border border-[var(--border)] hover:border-[var(--primary)]/40',
                            !isPremium && 'opacity-50 cursor-not-allowed'
                          )}
                        >
                          {level}
                        </button>
                      ))}
                    </div>
                    <div className="text-xs text-[var(--muted)] mt-2 text-center">
                      {diabellaSettings.spiciness === 1 && 'Subtle flirting'}
                      {diabellaSettings.spiciness === 2 && 'Playful teasing'}
                      {diabellaSettings.spiciness === 3 && 'Sensual & suggestive'}
                      {diabellaSettings.spiciness === 4 && 'Explicit dirty talk'}
                      {diabellaSettings.spiciness === 5 && 'Maximum filth'}
                      {!diabellaSettings.spiciness && 'Sensual & suggestive'}
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-3xl border border-[var(--border)] bg-black/20 p-5">
                <div className="text-sm font-semibold mb-4">Voice & TTS</div>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm">Enable Voice</div>
                      <div className="text-xs text-[var(--muted)]">Let Diabella speak to you</div>
                    </div>
                    <ToggleSwitch
                      checked={diabellaSettings.tts?.enabled ?? false}
                      onChange={async (v) => {
                        await window.api.settings.diabella?.update?.({ tts: { ...diabellaSettings.tts, enabled: v } })
                        const next = await window.api.settings.get()
                        props.patchSettings(next)
                      }}
                      disabled={!isPremium}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm">Moans & Sounds</div>
                      <div className="text-xs text-[var(--muted)]">Audio reactions during sessions</div>
                    </div>
                    <ToggleSwitch
                      checked={diabellaSettings.moansEnabled ?? false}
                      onChange={async (v) => {
                        await window.api.settings.diabella?.update?.({ moansEnabled: v })
                        const next = await window.api.settings.get()
                        props.patchSettings(next)
                      }}
                      disabled={!isPremium}
                    />
                  </div>
                </div>
              </div>
            </>
            )
          )}

          {/* Appearance Tab */}
          {activeTab === 'appearance' && (
            <div className="rounded-3xl border border-[var(--border)] bg-black/20 p-5">
              <div className="text-sm font-semibold mb-4">Appearance</div>

              {/* Appearance disabled notice */}
              {APPEARANCE_DISABLED && (
                <div className="p-4 rounded-xl bg-yellow-500/10 border border-yellow-500/30 text-yellow-200 text-sm">
                  <div className="font-medium mb-1">Appearance Settings Disabled</div>
                  <div className="text-xs text-yellow-200/70">All appearance features (themes, pixel backgrounds, visual effects) are disabled for maintenance. Focus is on framework, UI, and functionality improvements.</div>
                </div>
              )}

              {/* Theme Selectors - hidden when THEMES_DISABLED */}
              {!THEMES_DISABLED && (
                <>
                  {/* Goon Themes */}
                  <div className="mb-6">
                    <div className="text-xs text-[var(--muted)] mb-3 flex items-center gap-2">
                      <Flame size={14} /> Goon Vibes
                    </div>
                    <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))' }}>
                      {GOON_THEME_LIST.map((goonTheme) => {
                        const currentTheme = s?.appearance?.themeId ?? s?.ui?.themeId ?? 'obsidian'
                        const active = currentTheme === goonTheme.id
                        const themeColors = themes[goonTheme.id as ThemeId]?.colors
                        return (
                          <button
                            key={goonTheme.id}
                            onClick={async () => {
                              if (window.api.settings.setTheme) {
                                await window.api.settings.setTheme(goonTheme.id)
                                const next = await window.api.settings.get()
                                props.patchSettings(next)
                              }
                            }}
                            title={goonTheme.vibe}
                            className={cn(
                              'p-4 rounded-2xl border transition text-left sensual-hover',
                              active
                                ? 'bg-[var(--primary)]/20 border-[var(--primary)] ring-2 ring-[var(--primary)]/30'
                                : 'bg-black/20 border-[var(--border)] hover:border-[var(--primary)]/40'
                            )}
                          >
                            <div
                              className="w-full h-8 rounded-lg mb-2"
                              style={{ background: themeColors?.gradient || 'linear-gradient(to right, var(--primary), var(--secondary))' }}
                            />
                            <div className="text-sm font-medium">{goonTheme.name}</div>
                            <div className="text-xs text-[var(--muted)] mt-1 truncate">{goonTheme.vibe}</div>
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  {/* Classic Themes */}
                  <div>
                    <div className="text-xs text-[var(--muted)] mb-3">Classic</div>
                    <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))' }}>
                      {THEME_LIST.filter(t => !isGoonTheme(t.id as ThemeId)).map((classicTheme) => {
                        const currentTheme = s?.appearance?.themeId ?? s?.ui?.themeId ?? 'obsidian'
                        const active = currentTheme === classicTheme.id
                        return (
                          <button
                            key={classicTheme.id}
                            onClick={async () => {
                              if (window.api.settings.setTheme) {
                                await window.api.settings.setTheme(classicTheme.id)
                                const next = await window.api.settings.get()
                                props.patchSettings(next)
                              }
                            }}
                            className={cn(
                              'p-4 rounded-2xl border transition text-left',
                              active
                                ? 'bg-white/15 border-white/25'
                                : 'bg-black/20 border-[var(--border)] hover:border-white/15'
                            )}
                          >
                            <div
                              className="w-full h-8 rounded-lg mb-2"
                              style={{ background: classicTheme.colors?.gradient || 'linear-gradient(to right, var(--primary), var(--secondary))' }}
                            />
                            <div className="text-sm font-medium">{classicTheme.name}</div>
                            <div className="text-xs text-[var(--muted)] mt-1">{classicTheme.isDark ? 'Dark' : 'Light'}</div>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                </>
              )}

              {/* Pixel Art Background - hidden during maintenance */}
              {!APPEARANCE_DISABLED && <div className="mt-6 pt-6 border-t border-[var(--border)]">
                <div className="text-xs text-[var(--muted)] mb-3 flex items-center gap-2">
                  <Star size={14} className="text-cyan-400" /> Pixel Art Background
                </div>
                <div className="space-y-3">
                  <div className="flex items-center justify-between p-3 rounded-xl bg-black/20 border border-[var(--border)]">
                    <div>
                      <div className="text-sm">Enable Pixel Background</div>
                      <div className="text-xs text-[var(--muted)]">Parallax pixel art with theme colors</div>
                    </div>
                    <ToggleSwitch
                      checked={pixelBackgroundEnabled}
                      onChange={(v) => setPixelBackgroundEnabled(v)}
                    />
                  </div>

                  <div className="flex items-center justify-between p-3 rounded-xl bg-black/20 border border-[var(--border)]">
                    <div>
                      <div className="text-sm">Pixel Cursor</div>
                      <div className="text-xs text-[var(--muted)]">Custom pixel art cursor</div>
                    </div>
                    <ToggleSwitch
                      checked={pixelCursorEnabled}
                      onChange={(v) => setPixelCursorEnabled(v)}
                    />
                  </div>

                  {pixelBackgroundEnabled && (
                    <>
                      {/* Theme Selector */}
                      <div className="p-3 rounded-xl bg-black/20 border border-[var(--border)]">
                        <div className="text-sm mb-3">Theme (overrides app colors)</div>
                        <div className="grid grid-cols-5 gap-2">
                          {([
                            { id: 'cityLights', name: 'City Lights', color: 'from-orange-500 to-purple-700' },
                            { id: 'neonCity', name: 'Neon City', color: 'from-pink-500 to-cyan-500' },
                            { id: 'neonCity2', name: 'Neon District', color: 'from-violet-500 to-fuchsia-500' },
                            { id: 'nightSky', name: 'Night Sky', color: 'from-indigo-600 to-purple-800' },
                            { id: 'sunset', name: 'Sunset', color: 'from-orange-400 to-rose-500' },
                            { id: 'clouds', name: 'Clouds', color: 'from-sky-300 to-blue-400' },
                            { id: 'cloudsDrift', name: 'Drifting', color: 'from-slate-400 to-sky-500' },
                            { id: 'daySky', name: 'Day Sky', color: 'from-sky-400 to-blue-500' },
                            { id: 'cityReflection', name: 'Reflection', color: 'from-slate-700 to-purple-900' },
                            { id: 'pixelCity', name: 'Pixel City', color: 'from-amber-400 to-orange-500' },
                          ] as const).map((theme) => (
                            <button
                              key={theme.id}
                              onClick={() => setPixelTheme(theme.id)}
                              className={cn(
                                'p-2 rounded-lg border transition text-center',
                                pixelTheme === theme.id
                                  ? 'bg-cyan-500/20 border-cyan-500/50 ring-1 ring-cyan-400'
                                  : 'bg-black/20 border-[var(--border)] hover:border-white/20'
                              )}
                            >
                              <div className={cn('w-full h-5 rounded mb-1 bg-gradient-to-r', theme.color)} />
                              <div className="text-[9px] truncate">{theme.name}</div>
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Sliders */}
                      <div className="p-3 rounded-xl bg-black/20 border border-[var(--border)]">
                        <div className="space-y-4">
                          <div>
                            <div className="flex justify-between text-xs mb-1">
                              <span className="text-[var(--muted)]">Background Opacity</span>
                              <span className="text-cyan-400">{pixelOpacity}%</span>
                            </div>
                            <input
                              type="range" min="20" max="70" step="5"
                              value={pixelOpacity}
                              onChange={(e) => setPixelOpacity(Number(e.target.value))}
                              className="w-full h-1.5 rounded-full appearance-none bg-white/10 cursor-pointer accent-cyan-500"
                            />
                          </div>
                          <div>
                            <div className="flex justify-between text-xs mb-1">
                              <span className="text-[var(--muted)]">Parallax Strength</span>
                              <span className="text-cyan-400">{pixelParallaxStrength}%</span>
                            </div>
                            <input
                              type="range" min="0" max="60" step="5"
                              value={pixelParallaxStrength}
                              onChange={(e) => setPixelParallaxStrength(Number(e.target.value))}
                              className="w-full h-1.5 rounded-full appearance-none bg-white/10 cursor-pointer accent-cyan-500"
                            />
                          </div>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>}

              {/* Visual Effects - hidden during maintenance */}
              {!APPEARANCE_DISABLED && <div className="mt-6 pt-6 border-t border-[var(--border)]">
                <div className="text-xs text-[var(--muted)] mb-3 flex items-center gap-2">
                  <Sparkles size={14} className="text-pink-500" /> Visual Effects
                </div>
                <div className="space-y-3">
                  <div className="flex items-center justify-between p-3 rounded-xl bg-black/20 border border-[var(--border)]">
                    <div>
                      <div className="text-sm">Enable Overlays</div>
                      <div className="text-xs text-[var(--muted)]">Particles, glow, heat effects</div>
                    </div>
                    <ToggleSwitch
                      checked={visualEffectsEnabled}
                      onChange={(v) => setVisualEffectsEnabled(v)}
                    />
                  </div>
                  <div className="p-3 rounded-xl bg-black/20 border border-[var(--border)]">
                    <div className="flex items-center justify-between mb-2">
                      <div className="text-sm">Ambient Heat Level</div>
                      <span className="text-xs text-pink-400 font-medium">{ambientHeatLevel}/10</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="10"
                      step="1"
                      value={ambientHeatLevel}
                      onChange={(e) => setAmbientHeatLevel(Number(e.target.value))}
                      className="w-full h-2 rounded-full appearance-none bg-white/10 cursor-pointer accent-pink-500"
                    />
                    <div className="flex justify-between text-[10px] text-[var(--muted)] mt-1">
                      <span>Off</span>
                      <span>Subtle</span>
                      <span>Intense</span>
                    </div>
                  </div>

                  {/* Overlay Effects */}
                  <div className="p-3 rounded-xl bg-black/20 border border-[var(--border)]">
                    <div className="text-sm mb-3">Overlay Effects</div>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => setSparklesEnabled(!sparklesEnabled)}
                        className={cn(
                          'p-3 rounded-xl border transition text-left',
                          sparklesEnabled
                            ? 'bg-yellow-500/20 border-yellow-500/50'
                            : 'bg-black/20 border-[var(--border)] hover:border-white/20'
                        )}
                      >
                        <div className="text-lg mb-1">✨</div>
                        <div className="text-xs">Sparkles</div>
                      </button>
                      <button
                        onClick={() => setBokehEnabled(!bokehEnabled)}
                        className={cn(
                          'p-3 rounded-xl border transition text-left',
                          bokehEnabled
                            ? 'bg-pink-500/20 border-pink-500/50'
                            : 'bg-black/20 border-[var(--border)] hover:border-white/20'
                        )}
                      >
                        <div className="text-lg mb-1">○</div>
                        <div className="text-xs">Bokeh</div>
                      </button>
                      <button
                        onClick={() => setStarfieldEnabled(!starfieldEnabled)}
                        className={cn(
                          'p-3 rounded-xl border transition text-left',
                          starfieldEnabled
                            ? 'bg-blue-500/20 border-blue-500/50'
                            : 'bg-black/20 border-[var(--border)] hover:border-white/20'
                        )}
                      >
                        <div className="text-lg mb-1">★</div>
                        <div className="text-xs">Starfield</div>
                      </button>
                      <button
                        onClick={() => setFilmGrainEnabled(!filmGrainEnabled)}
                        className={cn(
                          'p-3 rounded-xl border transition text-left',
                          filmGrainEnabled
                            ? 'bg-amber-500/20 border-amber-500/50'
                            : 'bg-black/20 border-[var(--border)] hover:border-white/20'
                        )}
                      >
                        <div className="text-lg mb-1">▓</div>
                        <div className="text-xs">Film Grain</div>
                      </button>
                      <button
                        onClick={() => setDreamyHazeEnabled(!dreamyHazeEnabled)}
                        className={cn(
                          'p-3 rounded-xl border transition text-left col-span-2',
                          dreamyHazeEnabled
                            ? 'bg-purple-500/20 border-purple-500/50'
                            : 'bg-black/20 border-[var(--border)] hover:border-white/20'
                        )}
                      >
                        <div className="text-lg mb-1">☁</div>
                        <div className="text-xs">Dreamy Haze</div>
                      </button>
                    </div>
                  </div>
                </div>
              </div>}
            </div>
          )}

          {/* Playback Tab */}
          {activeTab === 'playback' && (
            <div className="rounded-3xl border border-[var(--border)] bg-black/20 p-5">
              <div className="text-sm font-semibold mb-4">Playback Settings</div>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm">Autoplay</div>
                    <div className="text-xs text-[var(--muted)]">Automatically play next item</div>
                  </div>
                  <ToggleSwitch
                    checked={playbackSettings.autoplay ?? true}
                    onChange={async (v) => {
                      await window.api.settings.playback?.update?.({ autoplay: v })
                      const next = await window.api.settings.get()
                      props.patchSettings(next)
                    }}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm">Loop Videos</div>
                    <div className="text-xs text-[var(--muted)]">Loop videos by default</div>
                  </div>
                  <ToggleSwitch
                    checked={playbackSettings.loop ?? true}
                    onChange={async (v) => {
                      await window.api.settings.playback?.update?.({ loop: v })
                      const next = await window.api.settings.get()
                      props.patchSettings(next)
                    }}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm">Mute by Default</div>
                    <div className="text-xs text-[var(--muted)]">Start videos muted</div>
                  </div>
                  <ToggleSwitch
                    checked={playbackSettings.muteByDefault ?? false}
                    onChange={async (v) => {
                      await window.api.settings.playback?.update?.({ muteByDefault: v })
                      const next = await window.api.settings.get()
                      props.patchSettings(next)
                    }}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Privacy Tab */}
          {activeTab === 'privacy' && (
            <div className="rounded-3xl border border-[var(--border)] bg-black/20 p-5">
              <div className="text-sm font-semibold mb-4">Privacy & Security</div>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm">Panic Key</div>
                    <div className="text-xs text-[var(--muted)]">Press ESC 3x to minimize</div>
                  </div>
                  <ToggleSwitch
                    checked={privacySettings.panicKeyEnabled ?? true}
                    onChange={async (v) => {
                      await window.api.settings.privacy?.update?.({ panicKeyEnabled: v })
                      const next = await window.api.settings.get()
                      props.patchSettings(next)
                    }}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm">Clear on Exit</div>
                    <div className="text-xs text-[var(--muted)]">Clear history when closing</div>
                  </div>
                  <ToggleSwitch
                    checked={privacySettings.clearOnExit ?? false}
                    onChange={async (v) => {
                      await window.api.settings.privacy?.update?.({ clearOnExit: v })
                      const next = await window.api.settings.get()
                      props.patchSettings(next)
                    }}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm">Incognito Mode</div>
                    <div className="text-xs text-[var(--muted)]">Don't track history</div>
                  </div>
                  <ToggleSwitch
                    checked={privacySettings.incognitoMode ?? false}
                    onChange={async (v) => {
                      await window.api.settings.privacy?.update?.({ incognitoMode: v })
                      const next = await window.api.settings.get()
                      props.patchSettings(next)
                    }}
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  )
}

// Library Tools Section - Smart Tagging & Cleanup
function LibraryToolsSection() {
  const [isAutoTagging, setIsAutoTagging] = useState(false)
  const [isCleaning, setIsCleaning] = useState(false)
  const [tagProgress, setTagProgress] = useState<{ processed: number; total: number; tagged: number } | null>(null)
  const [results, setResults] = useState<{ type: 'tag' | 'clean'; message: string } | null>(null)

  const handleAutoTag = async () => {
    setIsAutoTagging(true)
    setResults(null)
    setTagProgress({ processed: 0, total: 0, tagged: 0 })

    try {
      const result = await window.api.smartTag.autoTagAll({ minConfidence: 0.65 })
      if (result.success) {
        setResults({
          type: 'tag',
          message: `Tagged ${result.tagged} of ${result.processed} files with smart tags`
        })
      } else {
        setResults({ type: 'tag', message: `Error: ${result.error}` })
      }
    } catch (e: any) {
      setResults({ type: 'tag', message: `Error: ${e.message}` })
    } finally {
      setIsAutoTagging(false)
      setTagProgress(null)
    }
  }

  const handleCleanTags = async () => {
    setIsCleaning(true)
    setResults(null)

    try {
      const result = await window.api.tags.cleanup()
      if (result.success) {
        setResults({
          type: 'clean',
          message: result.removedCount > 0
            ? `Removed ${result.removedCount} inappropriate tags: ${result.removedTags.slice(0, 5).join(', ')}${result.removedTags.length > 5 ? '...' : ''}`
            : 'No inappropriate tags found'
        })
      } else {
        setResults({ type: 'clean', message: `Error: ${result.error}` })
      }
    } catch (e: any) {
      setResults({ type: 'clean', message: `Error: ${e.message}` })
    } finally {
      setIsCleaning(false)
    }
  }

  // Listen for progress events
  useEffect(() => {
    const unsub = window.api.events?.onSmartTagProgress?.((progress: { processed: number; total: number; tagged: number }) => {
      setTagProgress(progress)
    })
    return () => unsub?.()
  }, [])

  return (
    <div className="rounded-3xl border border-[var(--border)] bg-black/20 p-5">
      <div className="text-sm font-semibold mb-1 flex items-center gap-2">
        <Zap size={16} className="text-amber-400" />
        Library Tools
      </div>
      <div className="text-xs text-[var(--muted)] mb-4">
        Automatically organize and tag your content
      </div>

      <div className="space-y-3">
        {/* Auto-Tag Button */}
        <div className="flex items-center justify-between p-3 rounded-xl bg-black/20 border border-[var(--border)]">
          <div>
            <div className="text-sm">Smart Auto-Tag</div>
            <div className="text-xs text-[var(--muted)]">
              Analyze filenames and apply relevant tags
            </div>
          </div>
          <button
            onClick={handleAutoTag}
            disabled={isAutoTagging}
            className={cn(
              'px-4 py-2 rounded-lg text-xs font-medium transition',
              isAutoTagging
                ? 'bg-amber-500/20 text-amber-400 cursor-wait'
                : 'bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 border border-amber-500/30'
            )}
          >
            {isAutoTagging ? (
              <span className="flex items-center gap-2">
                <RefreshCw size={12} className="animate-spin" />
                {tagProgress ? `${tagProgress.processed}/${tagProgress.total}` : 'Scanning...'}
              </span>
            ) : (
              'Auto-Tag All'
            )}
          </button>
        </div>

        {/* Clean Tags Button */}
        <div className="flex items-center justify-between p-3 rounded-xl bg-black/20 border border-[var(--border)]">
          <div>
            <div className="text-sm">Clean Up Tags</div>
            <div className="text-xs text-[var(--muted)]">
              Remove inappropriate or weird tags
            </div>
          </div>
          <button
            onClick={handleCleanTags}
            disabled={isCleaning}
            className={cn(
              'px-4 py-2 rounded-lg text-xs font-medium transition',
              isCleaning
                ? 'bg-red-500/20 text-red-400 cursor-wait'
                : 'bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/30'
            )}
          >
            {isCleaning ? (
              <span className="flex items-center gap-2">
                <RefreshCw size={12} className="animate-spin" />
                Cleaning...
              </span>
            ) : (
              'Clean Tags'
            )}
          </button>
        </div>

        {/* Rescan Library */}
        <div className="flex items-center justify-between p-3 rounded-xl bg-black/20 border border-[var(--border)]">
          <div>
            <div className="text-sm">Rescan Library</div>
            <div className="text-xs text-[var(--muted)]">
              Re-index all media folders
            </div>
          </div>
          <button
            onClick={async () => {
              await window.api.vault.rescan()
              setResults({ type: 'tag', message: 'Library rescan started' })
            }}
            className="px-4 py-2 rounded-lg text-xs font-medium bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 border border-blue-500/30 transition"
          >
            Rescan
          </button>
        </div>

        {/* Results Message */}
        {results && (
          <div className={cn(
            'p-3 rounded-xl text-xs',
            results.type === 'clean'
              ? 'bg-red-500/10 border border-red-500/20 text-red-300'
              : 'bg-green-500/10 border border-green-500/20 text-green-300'
          )}>
            {results.message}
          </div>
        )}
      </div>
    </div>
  )
}

// Toggle Switch Component
function ToggleSwitch({ checked, onChange, disabled }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      onClick={() => !disabled && onChange(!checked)}
      className={cn(
        'w-11 h-6 rounded-full transition-colors relative',
        checked ? 'bg-[var(--primary)]' : 'bg-white/20',
        disabled && 'opacity-50 cursor-not-allowed'
      )}
    >
      <div
        className={cn(
          'w-4 h-4 rounded-full bg-white absolute top-1 transition-transform',
          checked ? 'translate-x-6' : 'translate-x-1'
        )}
      />
    </button>
  )
}

function AboutPage() {
  const [tier, setTier] = useState<string>('free')
  const [cacheStats, setCacheStats] = useState<any>(null)
  const [vaultStats, setVaultStats] = useState<any>(null)

  useEffect(() => {
    // Load license tier
    window.api.license?.getTier?.().then((t: any) => setTier(t || 'free'))
    // Load cache stats
    window.api.aiCache?.getStats?.().then((s: any) => setCacheStats(s))
    // Load vault stats
    window.api.vault?.getStats?.().then((s: any) => setVaultStats(s))
  }, [])

  const clearCache = async (namespace?: string) => {
    await window.api.aiCache?.clear?.(namespace)
    const stats = await window.api.aiCache?.getStats?.()
    setCacheStats(stats)
  }

  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  return (
    <>
      <TopBar title="About Vault" />
      <div className="p-6 space-y-6 max-w-3xl">
        {/* App Info */}
        <div className="rounded-3xl border border-[var(--border)] bg-gradient-to-br from-[var(--primary-muted)] to-transparent p-6 text-center">
          <div className="w-20 h-20 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-[var(--primary)] to-[var(--secondary)] flex items-center justify-center">
            <Sparkles size={40} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold">Vault</h1>
          <p className="text-[var(--muted)] mt-1">Version 1.0.5 "First Light"</p>
          <div className="mt-4 flex items-center justify-center gap-2">
            <span
              className={cn(
                'px-3 py-1 rounded-full text-xs font-medium',
                tier === 'owner' ? 'bg-yellow-500/20 text-yellow-400' :
                tier === 'premium' ? 'bg-[var(--primary)]/20 text-[var(--primary)]' :
                'bg-white/10 text-[var(--muted)]'
              )}
            >
              {tier === 'owner' ? (
                <span className="flex items-center gap-1"><Crown size={12} /> Owner</span>
              ) : tier === 'premium' ? (
                <span className="flex items-center gap-1"><Zap size={12} /> Premium</span>
              ) : (
                'Free'
              )}
            </span>
          </div>
        </div>

        {/* Vault Stats */}
        {vaultStats && (
          <div className="rounded-3xl border border-[var(--border)] bg-black/20 p-5">
            <div className="text-sm font-semibold mb-4">Your Vault</div>
            <div className="grid grid-cols-2 gap-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-[var(--primary)]">{vaultStats.totalMedia}</div>
                <div className="text-xs text-[var(--muted)]">Total Files</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-[var(--primary)]">{vaultStats.videoCount}</div>
                <div className="text-xs text-[var(--muted)]">Videos</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-[var(--primary)]">{vaultStats.imageCount}</div>
                <div className="text-xs text-[var(--muted)]">Images</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-[var(--primary)]">{vaultStats.tagCount}</div>
                <div className="text-xs text-[var(--muted)]">Tags</div>
              </div>
            </div>
          </div>
        )}

        {/* AI Cache Stats */}
        {cacheStats && (
          <div className="rounded-3xl border border-[var(--border)] bg-black/20 p-5">
            <div className="text-sm font-semibold mb-4">AI Cache</div>
            <div className="grid grid-cols-3 gap-4 mb-4">
              <div className="text-center">
                <div className="text-xl font-bold">{cacheStats.totalEntries}</div>
                <div className="text-xs text-[var(--muted)]">Entries</div>
              </div>
              <div className="text-center">
                <div className="text-xl font-bold">{formatBytes(cacheStats.cacheSize)}</div>
                <div className="text-xs text-[var(--muted)]">Size</div>
              </div>
              <div className="text-center">
                <div className="text-xl font-bold">{(cacheStats.hitRate * 100).toFixed(0)}%</div>
                <div className="text-xs text-[var(--muted)]">Hit Rate</div>
              </div>
            </div>
            <div className="flex gap-2 flex-wrap">
              <Btn tone="subtle" onClick={() => clearCache('chat')}>Clear Chat</Btn>
              <Btn tone="subtle" onClick={() => clearCache('tts')}>Clear TTS</Btn>
              <Btn tone="subtle" onClick={() => clearCache('image')}>Clear Images</Btn>
              <Btn tone="danger" onClick={() => clearCache()}>Clear All</Btn>
            </div>
          </div>
        )}

        {/* Credits */}
        <div className="rounded-3xl border border-[var(--border)] bg-black/20 p-5">
          <div className="text-sm font-semibold mb-4">Credits</div>
          <div className="space-y-2 text-sm text-[var(--muted)]">
            <p>Built with Electron, React, and Venice AI</p>
            <p>Icons by Lucide</p>
            <p>Made with passion for passionate people</p>
          </div>
        </div>

        {/* Legal */}
        <div className="rounded-3xl border border-[var(--border)] bg-black/20 p-5">
          <div className="text-sm font-semibold mb-4">Legal</div>
          <div className="space-y-3 text-xs text-[var(--muted)]">
            <p>
              Vault is designed for personal use with your own media collection.
              Users are responsible for ensuring they have the rights to any content in their vault.
            </p>
            <p>
              By using this software, you agree that you are of legal adult age in your jurisdiction.
            </p>
            <p className="opacity-60">
              All AI features powered by Venice AI. Image generation may produce adult content
              when enabled in settings.
            </p>
          </div>
        </div>

        {/* Links */}
        <div className="flex gap-4 justify-center text-sm">
          <button
            onClick={() => window.api?.shell?.openExternal?.('https://vault.app')}
            className="text-[var(--primary)] hover:underline"
          >
            Website
          </button>
          <button
            onClick={() => window.api?.shell?.openExternal?.('https://vault.app/support')}
            className="text-[var(--primary)] hover:underline"
          >
            Support
          </button>
          <button
            onClick={() => window.api?.shell?.openExternal?.('https://vault.app/privacy')}
            className="text-[var(--primary)] hover:underline"
          >
            Privacy
          </button>
        </div>
      </div>
    </>
  )
}
