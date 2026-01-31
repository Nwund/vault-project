// File: src/renderer/App.tsx

import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import {
  themes,
  THEME_LIST,
  DARK_THEME_LIST,
  LIGHT_THEME_LIST,
  applyTheme as applyThemeCSS,
  injectEroticAnimations,
  isGoonTheme,
  GOON_THEME_LIST,
  type ThemeId
} from './styles/themes'
import { useDebounce, toFileUrlCached } from './hooks/usePerformance'
import { useVideoPreview } from './hooks/useVideoPreview'

import { TagSelector } from './components/TagSelector'
import { useHeatLevel } from './components/HeatOverlay'
import { ErrorBoundary } from './components/ErrorBoundary'
import { fisherYatesShuffle, shuffleTake, randomPick } from './utils/shuffle'
import { cleanupVideo, useVideoPool, videoPool } from './hooks/useVideoCleanup'
import { useAnime } from './hooks/useAnime'
import { useConfetti } from './hooks/useConfetti'
import { useUiSounds } from './hooks/useUiSounds'
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
  Maximize2,
  Tag
} from 'lucide-react'
import { playGreeting, playSoundFromCategory, playClimaxForType, hasSounds } from './utils/soundPlayer'

//
// GLOBAL TASK CONTEXT - Track running background tasks across the app
//
type GlobalTask = {
  id: string
  name: string
  progress: number // 0-100
  status: string
  startedAt: number
}

const GlobalTaskContext = React.createContext<{
  tasks: GlobalTask[]
  addTask: (task: Omit<GlobalTask, 'startedAt'>) => void
  updateTask: (id: string, updates: Partial<GlobalTask>) => void
  removeTask: (id: string) => void
}>({
  tasks: [],
  addTask: () => {},
  updateTask: () => {},
  removeTask: () => {}
})

export function useGlobalTasks() {
  return React.useContext(GlobalTaskContext)
}

// Global Progress Bar Component - Always visible at bottom when tasks are running
function GlobalProgressBar() {
  const { tasks, removeTask } = useGlobalTasks()

  if (tasks.length === 0) return null

  return (
    <div className="fixed bottom-0 left-0 right-0 z-[100] bg-black/95 border-t border-purple-500/30 backdrop-blur-sm">
      <div className="max-w-screen-xl mx-auto px-4 py-2">
        {tasks.map(task => (
          <div key={task.id} className="flex items-center gap-4">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <Sparkles size={14} className="text-purple-400 animate-pulse flex-shrink-0" />
              <span className="text-sm text-white font-medium truncate">{task.name}</span>
              <span className="text-xs text-white/60 truncate">{task.status}</span>
            </div>
            <div className="flex items-center gap-3 flex-shrink-0">
              <div className="w-48 h-2 bg-white/10 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-purple-500 to-pink-500 transition-all duration-300"
                  style={{ width: `${task.progress}%` }}
                />
              </div>
              <span className="text-xs text-white/60 w-10 text-right">{task.progress}%</span>
              {task.progress >= 100 && (
                <button
                  onClick={() => removeTask(task.id)}
                  className="p-1 hover:bg-white/10 rounded transition"
                >
                  <X size={12} className="text-white/60" />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

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
  uiSoundsEnabled?: boolean
  ui: {
    themeId: string
    animations: boolean
  }
  goonwall?: {
    tileCount?: number
    tileMinPx?: number
    layout?: 'mosaic' | 'grid'
    intervalSec?: 20 | 30 | 45 | 60 | 90 | 120
    muted?: boolean
    showHud?: boolean
  }
  daylist?: {
    spice?: number
    motifs?: Record<string, string>
  }
}

declare global {
  interface Window {
    api: any
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

const NAV = [
  { id: 'library', name: 'Library' },
  { id: 'goonwall', name: 'Goon Wall' },
  { id: 'feed', name: 'Feed' },
  { id: 'daylist', name: 'Quick Mix' },
  { id: 'playlists', name: 'Sessions' },
  { id: 'stats', name: 'Stats' },
  { id: 'settings', name: 'Settings' },
  { id: 'about', name: 'About' }
] as const

// Map nav IDs to Lucide icons
const NavIcon: React.FC<{ id: string; active?: boolean }> = ({ id, active }) => {
  const iconProps = { size: 18, strokeWidth: active ? 2 : 1.5 }
  switch (id) {
    case 'library': return <Library {...iconProps} />
    case 'goonwall': return <LayoutGrid {...iconProps} />
    case 'feed': return <Flame {...iconProps} />
    case 'playlists': return <ListMusic {...iconProps} />
    case 'stats': return <BarChart3 {...iconProps} />
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
  const [leftSidebarOpen, setLeftSidebarOpen] = useState(true)
  const [leftSidebarHover, setLeftSidebarHover] = useState(false)
  const [leftSidebarMouseY, setLeftSidebarMouseY] = useState(0)
  const [tagBarOpen, setTagBarOpen] = useState(true) // Lifted to App for coordination
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


  // Global task tracking state
  const [globalTasks, setGlobalTasks] = useState<GlobalTask[]>([])

  const addGlobalTask = useCallback((task: Omit<GlobalTask, 'startedAt'>) => {
    setGlobalTasks(prev => [...prev.filter(t => t.id !== task.id), { ...task, startedAt: Date.now() }])
  }, [])

  const updateGlobalTask = useCallback((id: string, updates: Partial<GlobalTask>) => {
    setGlobalTasks(prev => prev.map(t => t.id === id ? { ...t, ...updates } : t))
  }, [])

  const removeGlobalTask = useCallback((id: string) => {
    setGlobalTasks(prev => prev.filter(t => t.id !== id))
  }, [])

  const globalTaskContextValue = useMemo(() => ({
    tasks: globalTasks,
    addTask: addGlobalTask,
    updateTask: updateGlobalTask,
    removeTask: removeGlobalTask
  }), [globalTasks, addGlobalTask, updateGlobalTask, removeGlobalTask])

  // Animation hooks for visual effects
  const anime = useAnime()
  const confetti = useConfetti()
  useUiSounds(settings?.uiSoundsEnabled ?? true)
  const mainContentRef = useRef<HTMLElement>(null)
  const prevPageRef = useRef<string>(page)

  // Page transition animation
  useEffect(() => {
    if (prevPageRef.current !== page && mainContentRef.current) {
      anime.fadeIn(mainContentRef.current, 200)
      prevPageRef.current = page
    }
  }, [page, anime])

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
    // Celebration effect!
    confetti.fireworks()
  }, [heatLevel, confetti])

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
      // Auto-start session for streak tracking on app launch
      try { await window.api.goon.startSession() } catch {}
    })()
    return () => {
      alive = false
    }
  }, [])

  // Apply theme using our theme system
  useEffect(() => {
    // Try new settings structure first, fall back to legacy
    const themeId = (settings as any)?.appearance?.themeId ?? settings?.ui?.themeId ?? 'obsidian'
    applyThemeCSS(themeId as ThemeId)
  }, [(settings as any)?.appearance?.themeId, settings?.ui?.themeId])

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
    <GlobalTaskContext.Provider value={globalTaskContextValue}>
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
      <div className="h-full w-full flex relative">
        {/* Left Sidebar Edge Hover Zone */}
        <div
          className="absolute top-0 bottom-0 w-5 z-50 cursor-pointer"
          style={{ left: leftSidebarOpen ? '240px' : '0px', transition: 'left 0.3s ease-in-out' }}
          onMouseEnter={() => setLeftSidebarHover(true)}
          onMouseLeave={() => setLeftSidebarHover(false)}
          onMouseMove={(e) => setLeftSidebarMouseY(e.clientY)}
          onClick={() => {
            if (!leftSidebarOpen) {
              // Opening: if both are collapsed, open both
              setLeftSidebarOpen(true)
              if (!tagBarOpen) setTagBarOpen(true)
            } else {
              // Closing: just close left sidebar
              setLeftSidebarOpen(false)
            }
          }}
        >
          {/* Toggle arrow follows cursor */}
          <div
            className={cn(
              'absolute left-0 py-3 px-1.5 rounded-r-md pointer-events-none',
              'bg-[var(--panel)] border border-l-0 border-[var(--border)]',
              'shadow-lg transition-opacity duration-150',
              leftSidebarHover ? 'opacity-100' : 'opacity-0'
            )}
            style={{ top: Math.max(10, leftSidebarMouseY - 24) }}
          >
            <ChevronLeft size={14} className={cn(
              'transition-transform duration-300 text-[var(--primary)]',
              !leftSidebarOpen && 'rotate-180'
            )} />
          </div>
        </div>

        <aside className={cn(
          'shrink-0 border-r border-[var(--border)] bg-[var(--panel)]',
          'transition-all duration-300 ease-in-out overflow-hidden',
          leftSidebarOpen ? 'w-[240px]' : 'w-0'
        )}>
          <div className="w-[240px] p-5">
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
              return (
                <button
                  key={n.id}
                  onClick={(e) => {
                    anime.pulse(e.currentTarget, 1.05)
                    setPage(n.id)
                  }}
                  className={cn(
                    'w-full text-left px-3 py-2.5 rounded-xl text-sm transition border flex items-center gap-3',
                    isActive
                      ? 'bg-[var(--primary)]/15 border-[var(--primary)]/30 text-[var(--primary)]'
                      : 'bg-transparent border-transparent hover:bg-white/5 hover:border-white/10 text-[var(--text)]'
                  )}
                >
                  <NavIcon id={n.id} active={isActive} />
                  <span className="flex-1">{n.name}</span>
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
                  onClick={(e) => {
                    anime.bounce(e.currentTarget)
                    setPage('goonwall')
                  }}
                  className="w-full px-3 py-2 rounded-lg text-xs bg-[var(--primary)]/20 border border-[var(--primary)]/30 hover:bg-[var(--primary)]/30 transition text-left flex items-center gap-2"
                >
                  <Flame size={14} />
                  Start Goon Wall
                </button>
                <button
                  onClick={(e) => {
                    anime.wiggle(e.currentTarget)
                    confetti.burst()
                    setPage('daylist')
                  }}
                  className="w-full px-3 py-2 rounded-lg text-xs bg-black/20 border border-[var(--border)] hover:border-white/15 transition text-left flex items-center gap-2"
                >
                  <Sparkles size={14} />
                  Quick Mix
                </button>
              </div>
            </div>
          </div>
        </aside>

        <main ref={mainContentRef} className="flex-1 min-w-0 transition-all duration-300 ease-in-out">
          {page === 'library' ? (
            <ErrorBoundary pageName="Library">
              <LibraryPage settings={settings} selected={selected} setSelected={setSelected} tagBarOpen={tagBarOpen} setTagBarOpen={setTagBarOpen} confetti={confetti} anime={anime} />
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
          ) : page === 'feed' ? (
            <ErrorBoundary pageName="Feed">
              <FeedPage />
            </ErrorBoundary>
          ) : page === 'playlists' ? (
            <ErrorBoundary pageName="Sessions"><PlaylistsPage /></ErrorBoundary>
          ) : page === 'stats' ? (
            <StatsPage confetti={confetti} anime={anime} />
          ) : page === 'settings' ? (
            <SettingsPage
              settings={settings}
              patchSettings={patchSettings}
              onThemeChange={(id: string) => {
                applyThemeCSS(id as ThemeId)
                window.api.settings.setTheme(id).then((next: any) => {
                  if (next) setSettings(next as any)
                })
              }}
            />
          ) : page === 'about' ? (
            <AboutPage />
          ) : null}
        </main>
      </div>

      {/* Global Progress Bar - Shows at bottom when tasks are running */}
      <GlobalProgressBar />
    </div>
    </GlobalTaskContext.Provider>
  )
}

function TopBar(props: { title: string; right?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="px-3 sm:px-6 py-3 sm:py-5 border-b border-[var(--border)] bg-[var(--panel)]">
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm sm:text-lg font-semibold shrink-0">{props.title}</div>
        <div className="flex items-center gap-1 sm:gap-2 flex-wrap justify-end">{props.right}</div>
      </div>
      {props.children ? <div className="mt-2 sm:mt-4">{props.children}</div> : null}
    </div>
  )
}

// Maintenance placeholder for features under development

function Btn(props: React.ButtonHTMLAttributes<HTMLButtonElement> & { tone?: 'primary' | 'ghost' | 'danger' | 'subtle' }) {
  const tone = props.tone ?? 'ghost'
  const cls =
    tone === 'primary'
      ? 'bg-white/15 hover:bg-white/20 border-white/20'
      : tone === 'danger'
        ? 'bg-red-500/10 hover:bg-red-500/15 border-red-500/20'
        : tone === 'subtle'
          ? 'bg-white/5 hover:bg-white/10 border-white/10'
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

// Custom styled dropdown to replace native select (which can't be styled on Windows)
function Dropdown<T extends string>(props: {
  value: T
  onChange: (value: T) => void
  options: { value: T; label: string }[]
  className?: string
}) {
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const selectedOption = props.options.find(o => o.value === props.value)

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <div ref={dropdownRef} className={cn('relative', props.className)}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-[#1a1a1c] border border-[var(--border)] text-sm text-white cursor-pointer hover:border-[var(--primary)]/40 outline-none min-w-[100px]"
      >
        <span>{selectedOption?.label ?? 'Select...'}</span>
        <ChevronDown size={12} className={cn('transition-transform', isOpen && 'rotate-180')} />
      </button>
      {isOpen && (
        <div className="absolute top-full left-0 mt-1 w-full min-w-[120px] rounded-xl bg-[#1a1a1c] border border-[var(--border)] shadow-xl z-50 overflow-hidden">
          {props.options.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => {
                props.onChange(option.value)
                setIsOpen(false)
              }}
              className={cn(
                'w-full text-left px-3 py-2 text-sm transition-colors',
                option.value === props.value
                  ? 'bg-[var(--primary)]/20 text-[var(--primary)]'
                  : 'text-white hover:bg-white/10'
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

type SortOption = 'newest' | 'oldest' | 'name' | 'views' | 'duration' | 'type' | 'size' | 'random'
type LayoutOption = 'mosaic' | 'grid'

const MAX_FLOATING_PLAYERS = 10

function LibraryPage(props: { settings: VaultSettings | null; selected: string[]; setSelected: (ids: string[]) => void; tagBarOpen: boolean; setTagBarOpen: (open: boolean | ((prev: boolean) => boolean)) => void; confetti?: ReturnType<typeof useConfetti>; anime?: ReturnType<typeof useAnime> }) {
  const { confetti, anime } = props
  const { tagBarOpen, setTagBarOpen } = props
  const [media, setMedia] = useState<MediaRow[]>([])
  const [tags, setTags] = useState<TagRow[]>([])
  const [query, setQuery] = useState<string>('')
  const [activeTags, setActiveTags] = useState<string[]>([])
  const [typeFilter, setTypeFilter] = useState<MediaType | 'all'>('all')
  const [sortBy, setSortBy] = useState<SortOption>('newest')
  const [layout, setLayout] = useState<LayoutOption>('mosaic')
  const [tileSize, setTileSize] = useState(200) // Grid mode: tile width in px
  const [mosaicCols, setMosaicCols] = useState(4) // Mosaic mode: number of columns
  const [openIds, setOpenIds] = useState<string[]>([]) // Support up to 10 floating players
  const [playerBounds, setPlayerBounds] = useState<Map<string, { x: number; y: number; width: number; height: number }>>(new Map())
  const [isLoading, setIsLoading] = useState(false)
  const [mediaStats, setMediaStats] = useState<Map<string, { rating: number; viewCount: number; oCount: number }>>(new Map())
  const [randomQuickTags, setRandomQuickTags] = useState<TagRow[]>([])
  const [currentPage, setCurrentPage] = useState(1)
  const [totalCount, setTotalCount] = useState(0)
  const [typeCounts, setTypeCounts] = useState<{ video: number; image: number; gif: number }>({ video: 0, image: 0, gif: 0 })
  const [randomSeed, setRandomSeed] = useState(0) // Used to trigger re-shuffle
  const [tagBarHover, setTagBarHover] = useState(false)
  const [tagBarMouseY, setTagBarMouseY] = useState(0)
  const [previewMuted, setPreviewMuted] = useState(true) // Mute state for video previews
  const [tagDropdownOpen, setTagDropdownOpen] = useState(false) // Track when tag selector dropdown is open
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set()) // Track liked media
  const [selectionMode, setSelectionMode] = useState(false) // Bulk selection mode
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set()) // Selected media IDs for bulk actions
  const [showPlaylistPicker, setShowPlaylistPicker] = useState(false) // Show playlist picker for bulk add
  const [bulkPlaylists, setBulkPlaylists] = useState<PlaylistRow[]>([]) // Playlists for picker

  // Add a video to floating players (max 4) - STRICT: no duplicates, no exceeding max
  const addFloatingPlayer = useCallback((mediaId: string) => {
    setOpenIds(prev => {
      // Already open - do nothing
      if (prev.includes(mediaId)) return prev
      // At max capacity - do nothing (don't replace)
      if (prev.length >= MAX_FLOATING_PLAYERS) return prev
      // Track the watch
      window.api.goon?.recordWatch?.(mediaId).catch(() => {})
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
  const contentRef = useRef<HTMLDivElement>(null)

  // Track content area dimensions for responsive layout
  const [contentWidth, setContentWidth] = useState(0)
  const [contentHeight, setContentHeight] = useState(0)
  useEffect(() => {
    const el = contentRef.current
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContentWidth(entry.contentRect.width)
        setContentHeight(entry.contentRect.height)
      }
    })
    ro.observe(el)
    setContentWidth(el.clientWidth)
    setContentHeight(el.clientHeight)
    return () => ro.disconnect()
  }, [])

  // Grid: compute how many columns fit at current tile size
  const gridColumns = useMemo(() => {
    if (contentWidth <= 0) return Math.max(1, Math.floor(1200 / tileSize))
    return Math.max(1, Math.floor((contentWidth + 12) / (tileSize + 12)))
  }, [contentWidth, tileSize])

  const actualColumns = layout === 'mosaic' ? mosaicCols : gridColumns

  // Calculate columns for keyboard navigation
  const getColumnsCount = useCallback(() => {
    return actualColumns
  }, [actualColumns])

  // Page size: mosaic shows a manageable batch, grid scrolls through more
  const effectivePageSize = 200

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
      case 'views':
        return sorted.sort((a, b) => (mediaStats.get(b.id)?.viewCount ?? 0) - (mediaStats.get(a.id)?.viewCount ?? 0))
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
      const startIndex = (currentPage - 1) * effectivePageSize
      const endIndex = Math.min(startIndex + effectivePageSize, sortedMedia.length)
      const maxIndex = endIndex - startIndex - 1

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
  }, [focusedIndex, sortedMedia, effectivePageSize, currentPage, getColumnsCount, openIds, addFloatingPlayer])

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

  // Toggle like on a media item (uses rating: 5 = liked, 0 = unliked)
  const toggleLike = useCallback(async (mediaId: string, event?: React.MouseEvent) => {
    const isLiked = likedIds.has(mediaId)
    const newRating = isLiked ? 0 : 5
    // Optimistic UI update
    setLikedIds(prev => {
      const next = new Set(prev)
      if (isLiked) next.delete(mediaId)
      else next.add(mediaId)
      return next
    })
    // Celebration animation when liking
    if (!isLiked) {
      confetti?.hearts()
      if (event?.currentTarget) {
        anime?.pulse(event.currentTarget as Element, 1.3)
      }
    }
    try {
      await window.api.media.setRating(mediaId, newRating)
    } catch (err) {
      console.error('[Like] Failed to set rating:', err)
      // Revert on failure
      setLikedIds(prev => {
        const next = new Set(prev)
        if (isLiked) next.add(mediaId)
        else next.delete(mediaId)
        return next
      })
    }
  }, [likedIds, confetti, anime])

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

      // Fetch stats for all items to get liked status and sorting data
      const statsMap = new Map<string, { rating: number; viewCount: number; oCount: number }>()
      const newLikedIds = new Set<string>()
      await Promise.all(
        items.map(async (item) => {
          try {
            const stats = await window.api.media.getStats(item.id)
            if (stats) {
              statsMap.set(item.id, {
                rating: stats.rating ?? 0,
                viewCount: stats.viewCount ?? 0,
                oCount: stats.oCount ?? 0
              })
              // Rating 5 = liked
              if ((stats.rating ?? 0) >= 5) {
                newLikedIds.add(item.id)
              }
            }
          } catch {}
        })
      )
      setMediaStats(statsMap)
      setLikedIds(newLikedIds)

      setMedia(items)
    } finally {
      setIsLoading(false)
    }
  }, [debouncedQuery, typeFilter, activeTags])

  useEffect(() => {
    let alive = true
    ;(async () => {
      // Use listWithCounts and filter out tags with no media attached
      const t = await window.api.tags.listWithCounts?.() ?? await window.api.tags.list()
      if (!alive) return
      // Filter to only show tags that have at least 1 media item
      const filtered = Array.isArray(t) ? t.filter((tag: any) => tag.count === undefined || tag.count > 0) : t
      setTags(filtered)
      await refresh()
    })()
    const unsub = window.api.events?.onVaultChanged?.(() => void refresh())
    return () => {
      alive = false
      unsub?.()
    }
  }, [])

  useEffect(() => {
    setCurrentPage(1) // Reset to first page when filters change
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

  // Get grid/mosaic style based on layout mode
  const getGridStyle = (): React.CSSProperties => {
    if (layout === 'mosaic') {
      const gap = mosaicCols >= 7 ? 4 : mosaicCols >= 5 ? 6 : 8
      return {
        columns: mosaicCols,
        columnGap: `${gap}px`,
      }
    }
    return {
      display: 'grid',
      gridTemplateColumns: `repeat(auto-fill, minmax(${tileSize}px, 1fr))`,
      gap: '12px'
    }
  }

  return (
    <>
      <TopBar
        title="Library"
        right={
          <div className="flex items-center gap-2">
            {/* Layout toggle: Mosaic / Grid */}
            <div className="flex items-center bg-black/20 rounded-lg overflow-hidden">
              <button
                onClick={() => setLayout('mosaic')}
                className={cn(
                  'px-2.5 py-1.5 text-[10px] font-medium transition',
                  layout === 'mosaic' ? 'bg-[var(--primary)]/30 text-white' : 'text-white/50 hover:text-white/80'
                )}
              >
                Mosaic
              </button>
              <button
                onClick={() => setLayout('grid')}
                className={cn(
                  'px-2.5 py-1.5 text-[10px] font-medium transition',
                  layout === 'grid' ? 'bg-[var(--primary)]/30 text-white' : 'text-white/50 hover:text-white/80'
                )}
              >
                Grid
              </button>
            </div>

            {/* Layout-specific slider */}
            {layout === 'mosaic' ? (
              <div className="flex items-center gap-2 bg-black/20 rounded-lg px-3 py-1.5">
                <span className="text-[10px] text-[var(--muted)]">Cols</span>
                <input
                  type="range"
                  min={1}
                  max={12}
                  step={1}
                  value={mosaicCols}
                  onChange={(e) => { setMosaicCols(Number(e.target.value)) }}
                  className="w-20 h-1 accent-[var(--primary)] cursor-pointer"
                  title={`${mosaicCols} columns`}
                />
                <span className="text-[10px] text-[var(--muted)] w-4 text-center">{mosaicCols}</span>
              </div>
            ) : (
              <div className="flex items-center gap-2 bg-black/20 rounded-lg px-3 py-1.5">
                <span className="text-[10px] text-[var(--muted)]">Size</span>
                <input
                  type="range"
                  min={80}
                  max={500}
                  step={10}
                  value={tileSize}
                  onChange={(e) => { setTileSize(Number(e.target.value)) }}
                  className="w-20 h-1 accent-[var(--primary)] cursor-pointer"
                  title={`${tileSize}px tiles`}
                />
                <span className="text-[10px] text-[var(--muted)] w-8 text-center">{tileSize}px</span>
              </div>
            )}

            {/* Preview volume toggle */}
            <button
              onClick={() => setPreviewMuted(!previewMuted)}
              className={cn(
                'p-2 rounded-lg transition-all',
                previewMuted ? 'bg-white/5 text-white/50' : 'bg-[var(--primary)]/20 text-[var(--primary)]'
              )}
              title={previewMuted ? 'Unmute previews' : 'Mute previews'}
            >
              {previewMuted ? <VolumeX size={14} /> : <Volume2 size={14} />}
            </button>

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

            {/* Bulk select toggle */}
            <Btn
              tone={selectionMode ? 'primary' : 'ghost'}
              onClick={() => {
                setSelectionMode(prev => !prev)
                setSelectedIds(new Set())
              }}
              className="flex items-center gap-1.5"
            >
              {selectionMode ? <X size={14} /> : <LayoutGrid size={14} />}
              <span className="text-xs">{selectionMode ? 'Cancel' : 'Select'}</span>
            </Btn>

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
          <Dropdown
            value={typeFilter}
            onChange={(v) => setTypeFilter(v as MediaType | 'all')}
            options={[
              { value: 'all', label: 'All' },
              { value: 'video', label: 'Videos' },
              { value: 'image', label: 'Images' },
              { value: 'gif', label: 'GIFs' },
            ]}
          />

          {/* Sort By */}
          <div className="flex items-center gap-1">
            <Dropdown
              value={sortBy}
              onChange={(v) => {
                setSortBy(v as SortOption)
                if (v === 'random') setRandomSeed(Date.now())
              }}
              options={[
                { value: 'newest', label: 'Newest' },
                { value: 'oldest', label: 'Oldest' },
                { value: 'name', label: 'Name' },
                { value: 'type', label: 'Type' },
                { value: 'size', label: 'Size' },
                { value: 'duration', label: 'Duration' },
                { value: 'views', label: 'Views' },
                { value: 'random', label: '🎲 Random' },
              ]}
            />
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

      <div className="h-[calc(100vh-110px)] flex min-w-0 relative">
        {/* Tag Sidebar Edge Hover Zone - always at left edge of this container */}
        <div
          className="absolute top-0 bottom-0 w-5 z-40 cursor-pointer"
          style={{ left: tagBarOpen ? '180px' : '0px', transition: 'left 0.3s ease-in-out' }}
          onMouseEnter={() => setTagBarHover(true)}
          onMouseLeave={() => setTagBarHover(false)}
          onMouseMove={(e) => setTagBarMouseY(e.nativeEvent.offsetY)}
          onClick={() => setTagBarOpen(prev => !prev)}
        >
          {/* Toggle arrow follows cursor */}
          <div
            className={cn(
              'absolute left-0 py-3 px-1.5 rounded-r-md pointer-events-none',
              'bg-[var(--panel2)] border border-l-0 border-[var(--border)]',
              'shadow-lg transition-opacity duration-150',
              tagBarHover ? 'opacity-100' : 'opacity-0'
            )}
            style={{ top: Math.max(10, Math.min(tagBarMouseY - 20, 500)) }}
          >
            <ChevronLeft size={14} className={cn(
              'transition-transform duration-300 text-[var(--primary)]',
              !tagBarOpen && 'rotate-180'
            )} />
          </div>
        </div>

        {/* Collapsible tag sidebar */}
        <div className={cn(
          'shrink-0 border-r border-[var(--border)] bg-[var(--panel2)] overflow-hidden',
          'transition-all duration-300 ease-in-out',
          tagBarOpen ? 'w-[180px]' : 'w-0'
        )}>
          <div className="w-[180px] overflow-auto h-full p-3">
            <TagSelector
              tags={tags}
              selectedTags={activeTags}
              onTagsChange={setActiveTags}
              onOpenChange={setTagDropdownOpen}
              onCreateTag={async (name) => {
                await window.api.tags.create(name)
                const t = await window.api.tags.list()
                setTags(t)
              }}
              placeholder="Tags..."
              className="mb-3"
            />

            {/* Randomized Quick Tags with visual effects - hidden when dropdown is open */}
            {randomQuickTags.length > 0 && !tagDropdownOpen && (
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

        <div ref={contentRef} className="flex-1 overflow-auto p-4 transition-all duration-300 ease-in-out">
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
            {/* Total count */}
            <span className="text-white/40">
              {sortedMedia.length} items
            </span>
          </div>

          {/* Pagination Controls */}
          <div className="flex items-center justify-end mb-4 px-1">
            {sortedMedia.length > effectivePageSize && (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="px-2 py-1 rounded text-xs bg-white/5 hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  ← Prev
                </button>
                <span className="text-xs text-white/60">
                  Page {currentPage} of {Math.ceil(sortedMedia.length / effectivePageSize)}
                </span>
                <button
                  onClick={() => setCurrentPage(p => Math.min(Math.ceil(sortedMedia.length / effectivePageSize), p + 1))}
                  disabled={currentPage >= Math.ceil(sortedMedia.length / effectivePageSize)}
                  className="px-2 py-1 rounded text-xs bg-white/5 hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  Next →
                </button>
              </div>
            )}
          </div>

          <div ref={gridRef} style={getGridStyle()}>
            {sortedMedia.slice((currentPage - 1) * effectivePageSize, currentPage * effectivePageSize).map((m, index) => {
              const isPlaying = openIds.includes(m.id)
              const canAddMore = openIds.length < MAX_FLOATING_PLAYERS
              const canOpen = isPlaying || canAddMore
              const isFocused = focusedIndex === index
              const mosaicGap = mosaicCols >= 7 ? 4 : mosaicCols >= 5 ? 6 : 8
              return (
                <div
                  key={m.id}
                  className={cn(
                    'animate-fadeInUp',
                    isFocused && 'ring-2 ring-[var(--primary)] ring-offset-2 ring-offset-[var(--bg)] rounded-xl'
                  )}
                  style={{
                    animationDelay: `${Math.min(index * 30, 500)}ms`,
                    animationFillMode: 'backwards',
                    ...(layout === 'mosaic' ? { breakInside: 'avoid', marginBottom: `${mosaicGap}px` } : {})
                  }}
                >
                  <MediaTile
                    media={m}
                    selected={selectionMode ? selectedIds.has(m.id) : isPlaying}
                    onClick={() => {
                      if (selectionMode) {
                        setSelectedIds(prev => {
                          const next = new Set(prev)
                          if (next.has(m.id)) next.delete(m.id)
                          else next.add(m.id)
                          return next
                        })
                      } else {
                        console.log('[Library] Tile clicked:', m.id, 'canOpen:', canOpen, 'openIds:', openIds.length)
                        setFocusedIndex(index)
                        canOpen && addFloatingPlayer(m.id)
                      }
                    }}
                    onToggleSelect={() => {
                      if (selectionMode) {
                        setSelectedIds(prev => {
                          const next = new Set(prev)
                          if (next.has(m.id)) next.delete(m.id)
                          else next.add(m.id)
                          return next
                        })
                      } else {
                        canOpen && addFloatingPlayer(m.id)
                      }
                    }}
                    compact={layout === 'mosaic' && mosaicCols >= 6}
                    layout={layout}
                    disabled={selectionMode ? false : !canOpen}
                    showStats={sortBy === 'views'}
                    stats={mediaStats.get(m.id)}
                    previewMuted={previewMuted}
                    liked={likedIds.has(m.id)}
                    onToggleLike={() => toggleLike(m.id)}
                    selectionMode={selectionMode}
                  />
                </div>
              )
            })}
          </div>

          {/* Bottom Pagination */}
          {sortedMedia.length > effectivePageSize && (
            <div className="mt-6 flex justify-center items-center gap-4">
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="px-3 py-1.5 rounded-lg text-sm bg-white/5 hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition"
              >
                ← Previous
              </button>
              <span className="text-sm text-white/60">
                Page {currentPage} of {Math.ceil(sortedMedia.length / effectivePageSize)}
              </span>
              <button
                onClick={() => setCurrentPage(p => Math.min(Math.ceil(sortedMedia.length / effectivePageSize), p + 1))}
                disabled={currentPage >= Math.ceil(sortedMedia.length / effectivePageSize)}
                className="px-3 py-1.5 rounded-lg text-sm bg-white/5 hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition"
              >
                Next →
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
                key={`player-slot-${index}`}
                media={openMedia}
                mediaList={sortedMedia.filter(m => !openIds.includes(m.id) || m.id === id)} // Use sorted order for navigation
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

      {/* Bulk selection floating action bar */}
      {selectionMode && selectedIds.size > 0 && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[90] flex items-center gap-3 px-5 py-3 rounded-2xl bg-black/90 border border-[var(--primary)]/30 backdrop-blur-sm shadow-2xl">
          <span className="text-sm text-white/80">{selectedIds.size} selected</span>
          <Btn tone="primary" onClick={async () => {
            try {
              const pls = await window.api.playlists.list()
              setBulkPlaylists(pls)
              setShowPlaylistPicker(true)
            } catch (err) {
              console.error('[Library] Failed to load playlists:', err)
            }
          }} className="flex items-center gap-1.5">
            <Plus size={14} />
            <span>Add to Playlist</span>
          </Btn>
          <Btn onClick={() => setSelectedIds(new Set())}>Clear</Btn>
        </div>
      )}

      {/* Playlist picker modal for bulk add */}
      {showPlaylistPicker && (
        <PlaylistPicker
          playlists={bulkPlaylists}
          onClose={() => setShowPlaylistPicker(false)}
          onPick={async (plId) => {
            try {
              await window.api.playlists.addItems(plId, [...selectedIds])
              setShowPlaylistPicker(false)
              setSelectedIds(new Set())
              setSelectionMode(false)
            } catch (err) {
              console.error('[Library] Failed to add items to playlist:', err)
            }
          }}
        />
      )}
    </>
  )
}

const MediaTile = React.memo(function MediaTile(props: {
  media: MediaRow
  selected: boolean
  onClick: () => void
  onToggleSelect: () => void
  compact?: boolean
  layout?: LayoutOption
  disabled?: boolean
  showStats?: boolean
  stats?: { rating: number; viewCount: number; oCount: number }
  previewMuted?: boolean
  liked?: boolean
  onToggleLike?: () => void
  selectionMode?: boolean
}) {
  const { media, compact, layout, disabled, showStats, stats, previewMuted = true, liked, onToggleLike } = props
  const [showPlaylistPopup, setShowPlaylistPopup] = useState(false)
  const playlistBtnRef = useRef<HTMLButtonElement>(null)
  const [thumbUrl, setThumbUrl] = useState<string>('')
  const [videoUrl, setVideoUrl] = useState<string>('')
  const [isLoaded, setIsLoaded] = useState(false)
  const [isHovered, setIsHovered] = useState(false)
  const [thumbError, setThumbError] = useState(false)
  const [renameStatus, setRenameStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [thumbAspect, setThumbAspect] = useState<number | null>(null)

  // Video preview on hover - 2 second delay, quick clips
  const isVideo = media.type === 'video'
  const { videoRef, isWaiting: isPreviewWaiting, isPlaying: isPreviewPlaying, handleMouseEnter: startPreview, handleMouseLeave: stopPreview } = useVideoPreview({
    clipDuration: 1.5,
    clipCount: 4,
    hoverDelay: 2000, // 2 second delay
    muted: previewMuted // Pass mute state to hook
  })

  // Show HUD when: not hovering OR hovering but still in 2 second intro
  // Hide HUD when: preview is actually playing
  const showHud = !isPreviewPlaying

  // Load thumbnail — if no thumbPath, request on-demand generation
  useEffect(() => {
    let alive = true
    setIsLoaded(false)
    setThumbError(false)
    setThumbUrl('')
    ;(async () => {
      const p = media.thumbPath
      if (p) {
        try {
          const u = await toFileUrlCached(p)
          if (!alive) return
          setThumbUrl(u)
          return
        } catch (err) {
          if (!alive) return
          console.warn('[MediaTile] Failed to load thumb:', media.id, err)
        }
      }
      // No thumbPath — request on-demand thumbnail generation
      try {
        const generatedPath = await window.api.media.generateThumb(media.id)
        if (!alive) return
        if (generatedPath) {
          const u = await toFileUrlCached(generatedPath as string)
          if (!alive) return
          setThumbUrl(u)
          return
        }
      } catch (err) {
        if (!alive) return
        console.warn('[MediaTile] On-demand thumb gen failed:', media.id, err)
      }
      // Generation failed — show fallback
      if (alive) setThumbError(true)
    })()
    return () => {
      alive = false
    }
  }, [media.id, media.thumbPath])

  // Load video URL for preview
  useEffect(() => {
    if (!isVideo) return
    let alive = true
    ;(async () => {
      try {
        const u = await toFileUrlCached(media.path)
        if (alive) setVideoUrl(u)
      } catch {}
    })()
    return () => { alive = false }
  }, [media.path, isVideo])

  const handleMouseEnter = useCallback(() => {
    setIsHovered(true)
    if (isVideo && videoUrl && !disabled) {
      startPreview(videoUrl, media.durationSec ?? undefined)
    }
  }, [isVideo, videoUrl, disabled, startPreview, media.durationSec])

  const handleMouseLeave = useCallback(() => {
    setIsHovered(false)
    if (isVideo) {
      stopPreview()
    }
  }, [isVideo, stopPreview])

  return (
    <div
      onClick={disabled ? undefined : props.onClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
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

      <div
        className="bg-black/25 relative overflow-hidden"
        style={{
          aspectRatio: layout === 'mosaic'
            ? (thumbAspect ? `${thumbAspect}` : '16 / 10')
            : (compact ? '16 / 9' : '16 / 10')
        }}
      >
        {/* Loading shimmer */}
        {!isLoaded && thumbUrl && (
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent animate-shimmer" />
        )}

        {thumbUrl && !thumbError ? (
          <>
            <img
              src={thumbUrl}
              alt=""
              className={cn(
                'w-full h-full object-contain transition-all duration-500',
                isLoaded ? 'opacity-100 scale-100' : 'opacity-0 scale-105',
                isHovered && !isPreviewPlaying && 'scale-110',
                isPreviewPlaying && 'opacity-0'
              )}
              onLoad={(e) => {
                setIsLoaded(true)
                // Capture thumbnail aspect ratio for "fit" layout
                const img = e.currentTarget
                if (img.naturalWidth && img.naturalHeight) {
                  setThumbAspect(img.naturalWidth / img.naturalHeight)
                }
              }}
              onError={() => setThumbError(true)}
            />
            {/* Video preview overlay */}
            {isVideo && (
              <video
                ref={videoRef}
                className={cn(
                  'absolute inset-0 w-full h-full object-contain transition-opacity duration-300',
                  isPreviewPlaying ? 'opacity-100' : 'opacity-0 pointer-events-none'
                )}
                muted={previewMuted}
                playsInline
                loop
              />
            )}
          </>
        ) : thumbError ? (
          <div className="w-full h-full bg-gradient-to-br from-white/5 to-black/60 flex flex-col items-center justify-center gap-1">
            <Play size={24} className="text-white/20" />
            <div className="text-white/20 text-[10px]">{media.type === 'video' ? 'Video' : media.type === 'gif' ? 'GIF' : 'Image'}</div>
          </div>
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-black/40 to-black/60 flex items-center justify-center">
            <div className="w-6 h-6 border-2 border-white/20 border-t-white/60 rounded-full animate-spin" />
          </div>
        )}

        {/* Gradient overlay that intensifies on hover - hidden during preview */}
        <div
          className={cn(
            'absolute inset-0 transition-opacity duration-300',
            'bg-gradient-to-t from-black/80 via-transparent to-transparent',
            isHovered && showHud ? 'opacity-100' : showHud ? 'opacity-60' : 'opacity-0'
          )}
        />

        {/* Type Badge with glow - hidden during preview */}
        <div className={cn(
          'absolute top-1.5 right-1.5 flex items-center gap-1 px-1.5 py-0.5 rounded backdrop-blur-sm',
          'bg-black/60 border border-white/10 transition-all duration-200',
          compact ? 'text-[8px]' : 'text-[10px]',
          isHovered && showHud && 'bg-black/80 border-white/20 shadow-lg',
          !showHud && 'opacity-0 pointer-events-none'
        )}>
          {media.type === 'video' && <Play size={compact ? 8 : 10} className="fill-current" />}
          {media.type === 'gif' && <Repeat size={compact ? 8 : 10} />}
          {media.type === 'image' && <Eye size={compact ? 8 : 10} />}
        </div>

        {/* Duration badge for videos with glow effect - hidden during preview */}
        {media.type === 'video' && media.durationSec ? (
          <div className={cn(
            'absolute bottom-1.5 right-1.5 px-1.5 py-0.5 rounded backdrop-blur-sm transition-all duration-200',
            'bg-black/70 border border-white/10',
            compact ? 'text-[8px]' : 'text-[10px]',
            isHovered && showHud && 'bg-[var(--primary)]/80 border-[var(--primary)]/50 shadow-[0_0_10px_var(--primary)]',
            !showHud && 'opacity-0 pointer-events-none'
          )}>
            {formatDuration(media.durationSec)}
          </div>
        ) : null}

        {/* Stats badges when sorting by stats - hidden during preview */}
        {showStats && stats && showHud && (
          <div className="absolute bottom-1.5 left-1.5 flex items-center gap-1">
            {stats.viewCount > 0 && (
              <div className={cn(
                'px-1.5 py-0.5 rounded text-[9px] font-medium flex items-center gap-0.5 transition-all duration-200',
                'bg-blue-500/80',
                isHovered && 'bg-blue-400 shadow-[0_0_10px_rgba(59,130,246,0.5)] scale-105'
              )}>
                <Eye size={8} /> {stats.viewCount}
              </div>
            )}
          </div>
        )}

        {/* Add to playlist button + Like (top-left, hover only) */}
        {!compact && (
          <div className={cn(
            'absolute top-1.5 left-1.5 flex items-center gap-1 transition-all duration-200',
            liked
              ? 'opacity-100 translate-y-0'
              : 'opacity-0 -translate-y-2 group-hover:opacity-100 group-hover:translate-y-0'
          )}>
            <div className="relative">
              <button
                ref={playlistBtnRef}
                onClick={(e) => {
                  e.stopPropagation()
                  if (props.selectionMode) {
                    props.onToggleSelect()
                  } else {
                    setShowPlaylistPopup(prev => !prev)
                  }
                }}
                className="px-2 py-1 rounded text-[10px] transition-all duration-200 backdrop-blur-sm flex items-center gap-1 bg-black/60 hover:bg-[var(--primary)]/80 hover:shadow-[0_0_10px_var(--primary)]"
              >
                +
              </button>
              {showPlaylistPopup && (
                <AddToPlaylistPopup
                  mediaId={media.id}
                  onClose={() => setShowPlaylistPopup(false)}
                  anchorRef={playlistBtnRef}
                />
              )}
            </div>
            {/* Like/Heart button */}
            {onToggleLike && (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onToggleLike()
                }}
                className={cn(
                  'p-1.5 rounded transition-all duration-200 backdrop-blur-sm',
                  liked
                    ? 'bg-pink-500/80 text-white shadow-[0_0_15px_rgba(236,72,153,0.6)]'
                    : 'bg-black/60 hover:bg-pink-500/60 text-white/70 hover:text-white'
                )}
                title={liked ? 'Unlike' : 'Like'}
              >
                <Heart size={12} className={liked ? 'fill-current' : ''} />
              </button>
            )}
          </div>
        )}

        {/* Now Playing indicator (bottom-left, always visible when selected) */}
        {!compact && props.selected && (
          <div className="absolute bottom-1.5 left-1.5 transition-all duration-200">
            <div className="px-2 py-1 rounded text-[10px] backdrop-blur-sm flex items-center gap-1 bg-green-500 text-white shadow-[0_0_15px_rgba(34,197,94,0.6)] animate-pulse">
              <span className="w-1.5 h-1.5 bg-white rounded-full animate-ping" />
              Playing
            </div>
          </div>
        )}

        {/* Hover overlay with play button animation - hidden during preview */}
        {showHud && (
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
        )}
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
})

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
      try {
        const u = await window.api.media.getPlayableUrl(m.id)
        if (u) { setUrl(u as string); return }
      } catch {}
      // Fallback to direct file URL
      const u = await toFileUrlCached(m.path)
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
    <div className="fixed inset-0 bg-black/90 backdrop-blur-md-sm flex items-center justify-center z-50">
      <div className="w-[min(1100px,92vw)] h-[min(760px,88vh)] rounded-3xl border border-white/10 bg-[var(--panel)] overflow-hidden shadow-2xl">
        <div className="px-6 py-4 border-b border-[var(--border)] flex items-center justify-between">
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold truncate">{media.path}</div>
            <div className="text-xs text-[var(--muted)] mt-1 flex items-center gap-3">
              <span>{media.type.toUpperCase()}</span>
              {media.durationSec ? <span>{formatDuration(media.durationSec)}</span> : null}
              {typeof (media as any).sizeBytes === 'number' ? <span>{formatBytes((media as any).sizeBytes)}</span> : null}
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
    <div className="fixed inset-0 bg-black/90 backdrop-blur-md-sm flex items-center justify-center z-[60]">
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

function AddToPlaylistPopup(props: {
  mediaId: string
  onClose: () => void
  anchorRef?: React.RefObject<HTMLElement | null>
}) {
  const [playlists, setPlaylists] = useState<PlaylistRow[]>([])
  const [containingIds, setContainingIds] = useState<Set<string>>(new Set())
  const [newName, setNewName] = useState('')
  const [loading, setLoading] = useState(true)
  const popupRef = useRef<HTMLDivElement>(null)

  // Calculate fixed position synchronously from anchor element
  const getPos = (): { top: number; left: number } => {
    if (props.anchorRef?.current) {
      const rect = props.anchorRef.current.getBoundingClientRect()
      const popupWidth = 256
      const popupHeight = 300
      let top = rect.bottom + 4
      let left = rect.left
      if (left + popupWidth > window.innerWidth) {
        left = window.innerWidth - popupWidth - 8
      }
      if (left < 8) left = 8
      if (top + popupHeight > window.innerHeight) {
        top = rect.top - popupHeight - 4
      }
      if (top < 8) top = 8
      return { top, left }
    }
    return { top: 100, left: 100 }
  }
  const [pos] = useState(getPos)

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const pls = await window.api.playlists.list()
        if (!alive) return
        setPlaylists(pls)
        // Check which playlists contain this media
        const containing = new Set<string>()
        await Promise.all(pls.map(async (pl: PlaylistRow) => {
          try {
            const items = await window.api.playlists.getItems(pl.id)
            if (items.some((item: any) => (item.media?.id ?? item.mediaId) === props.mediaId)) {
              containing.add(pl.id)
            }
          } catch {}
        }))
        if (alive) setContainingIds(containing)
      } catch (e) {
        console.error('[AddToPlaylistPopup] Failed to load playlists:', e)
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => { alive = false }
  }, [props.mediaId])

  // Close on outside click or Escape (delayed to avoid catching the opening click)
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      // Don't close if clicking the anchor button that opens this popup
      if (props.anchorRef?.current?.contains(e.target as Node)) return
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) {
        props.onClose()
      }
    }
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') props.onClose()
    }
    // Delay listener registration to avoid catching the opening click
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClick)
      document.addEventListener('keydown', handleKey)
    }, 0)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKey)
    }
  }, [props.onClose, props.anchorRef])

  const handleAdd = async (playlistId: string) => {
    try {
      await window.api.playlists.addItems(playlistId, [props.mediaId])
      props.onClose()
    } catch (e) {
      console.error('[AddToPlaylistPopup] Failed to add:', e)
    }
  }

  const handleCreate = async () => {
    if (!newName.trim()) return
    try {
      const created = await window.api.playlists.create(newName.trim())
      setNewName('')
      if (created?.id) {
        await window.api.playlists.addItems(created.id, [props.mediaId])
      }
      props.onClose()
    } catch (e) {
      console.error('[AddToPlaylistPopup] Failed to create playlist:', e)
    }
  }


  const popup = (
    <div
      ref={popupRef}
      className="w-64 rounded-xl border border-white/15 bg-[var(--panel)] shadow-2xl overflow-hidden backdrop-blur-xl"
      style={{ position: 'fixed', top: pos.top, left: pos.left, zIndex: 99999 }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="px-3 py-2 border-b border-[var(--border)] text-xs font-semibold text-[var(--muted)]">
        Add to Playlist
      </div>
      {/* Create new */}
      <div className="px-3 py-2 border-b border-[var(--border)] flex gap-1">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
          placeholder="New playlist..."
          className="flex-1 px-2 py-1 rounded-lg bg-black/20 border border-[var(--border)] outline-none focus:border-white/15 text-xs"
          onClick={(e) => e.stopPropagation()}
        />
        <button
          onClick={handleCreate}
          className="px-2 py-1 rounded-lg bg-[var(--primary)] text-white text-xs hover:opacity-90 transition"
        >
          +
        </button>
      </div>
      {/* Playlist list */}
      <div className="max-h-48 overflow-auto">
        {loading ? (
          <div className="px-3 py-4 text-center text-xs text-[var(--muted)]">Loading...</div>
        ) : playlists.length === 0 ? (
          <div className="px-3 py-4 text-center text-xs text-[var(--muted)]">No playlists yet</div>
        ) : (
          playlists.map((pl) => {
            const isIn = containingIds.has(pl.id)
            return (
              <button
                key={pl.id}
                onClick={() => !isIn && handleAdd(pl.id)}
                className={cn(
                  'w-full text-left px-3 py-2 text-xs hover:bg-white/5 transition flex items-center justify-between',
                  isIn && 'opacity-60'
                )}
              >
                <span className="truncate">{pl.name}</span>
                {isIn && <span className="text-green-400 flex-shrink-0 ml-2">✓</span>}
              </button>
            )
          })
        )}
      </div>
    </div>
  )

  return createPortal(popup, document.body)
}

type GoonWallLayout = 'grid' | 'mosaic'

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
  const brokenIdsRef = useRef<Set<string>>(new Set()) // Track broken/unplayable videos
  const [muted, setMuted] = useState(true)
  const [showHud, setShowHud] = useState(true)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [layout, setLayout] = useState<GoonWallLayout>('mosaic')

  // Load settings from props
  useEffect(() => {
    const gw = props.settings?.goonwall
    if (gw) {
      if (gw.tileCount) setTileCount(Math.min(gw.tileCount, 30))
      if (gw.muted !== undefined) setMuted(gw.muted)
      if (gw.showHud !== undefined) setShowHud(gw.showHud)
      if (gw.layout) setLayout(gw.layout)
    }
  }, [props.settings?.goonwall])

  // Save settings when they change
  const saveSettings = useCallback(async (patch: Partial<{ tileCount: number; muted: boolean; showHud: boolean; layout: GoonWallLayout }>) => {
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

  // Mark a video as broken so it's excluded from future shuffles
  const markBroken = useCallback((mediaId: string) => {
    brokenIdsRef.current.add(mediaId)
  }, [])

  const getUsableVideos = useCallback((pool?: MediaRow[]) => {
    const source = pool ?? videos
    return source.filter(v => !brokenIdsRef.current.has(v.id))
  }, [videos])

  const shuffleTiles = (pool?: MediaRow[]) => {
    const source = getUsableVideos(pool)
    if (source.length === 0) return

    const shuffled = shuffleTake(source, tileCount)
    setTiles(shuffled)

    window.api.goonwall?.shuffle?.()
  }

  const shuffleSingleTile = (idx: number) => {
    const usable = getUsableVideos()
    if (usable.length === 0) return
    const currentIds = new Set(tiles.map(t => t.id))
    const available = usable.filter(v => !currentIds.has(v.id))
    if (available.length === 0) return

    const newVideo = available[Math.floor(Math.random() * available.length)]
    setTiles(prev => {
      const next = [...prev]
      next[idx] = newVideo
      return next
    })

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
      unsub?.()
    }
  }, [])

  // Keyboard shortcuts for GoonWall
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return

      switch (e.key.toLowerCase()) {
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

  // Mosaic: row-packing layout using real aspect ratios
  // Packs videos into rows that fill viewport width, then scales rows to fill height.
  // Overlaps only as a last resort to eliminate black gaps.
  const mosaicTileStyles = useMemo(() => {
    if (layout !== 'mosaic' || tiles.length === 0) return [] as React.CSSProperties[]

    const VW = 100 // work in percent
    const VH = 100

    // Get aspect ratio for each tile (fallback 16:9 if unknown)
    const aspects = tiles.map(t => {
      const w = t.width ?? 0
      const h = t.height ?? 0
      return (w > 0 && h > 0) ? w / h : 16 / 9
    })

    // Pack tiles into rows using a "linear partition" greedy approach:
    // Target a number of rows, assign tiles to rows, then compute sizes.
    const targetRows = Math.max(1, Math.round(Math.sqrt(tiles.length / 1.6)))

    // Distribute tiles into rows as evenly as possible
    const tilesPerRow: number[] = []
    const base = Math.floor(tiles.length / targetRows)
    const extra = tiles.length % targetRows
    for (let r = 0; r < targetRows; r++) {
      tilesPerRow.push(base + (r < extra ? 1 : 0))
    }

    // For each row, compute tile widths proportional to aspect ratios
    // so they fill 100% of viewport width, then compute the row height.
    type Rect = { left: number; top: number; width: number; height: number }
    const rects: Rect[] = []
    let tileIdx = 0
    const rowHeights: number[] = []

    for (let r = 0; r < tilesPerRow.length; r++) {
      const count = tilesPerRow[r]
      const rowAspects = aspects.slice(tileIdx, tileIdx + count)
      const totalAspect = rowAspects.reduce((a, b) => a + b, 0)

      // Row height = VW / totalAspect (all tiles fill the row width)
      const rowH = VW / totalAspect
      rowHeights.push(rowH)

      let x = 0
      for (let c = 0; c < count; c++) {
        const tileW = (rowAspects[c] / totalAspect) * VW
        rects.push({ left: x, top: 0, width: tileW, height: rowH }) // top set later
        x += tileW
      }
      tileIdx += count
    }

    // Total natural height of all rows
    const totalNaturalH = rowHeights.reduce((a, b) => a + b, 0)

    // Scale all rows uniformly to fill the viewport height
    const scale = VH / totalNaturalH

    // Apply scaling and compute final top positions
    let yOffset = 0
    tileIdx = 0
    for (let r = 0; r < tilesPerRow.length; r++) {
      const count = tilesPerRow[r]
      const scaledRowH = rowHeights[r] * scale
      for (let c = 0; c < count; c++) {
        const rect = rects[tileIdx + c]
        rect.top = yOffset
        rect.width *= scale > 1 ? 1 : 1 // width stays at VW proportion
        rect.height = scaledRowH
        // Scale width too if we're stretching vertically — keep aspect by widening proportionally
        // Actually: we scale row height, so to maintain the tile's aspect ratio,
        // we need to widen the tile. But tiles must still fill the row exactly.
        // Solution: let tiles fill their cell and use object-cover sparingly,
        // OR accept slight aspect stretch for gap-free coverage.
        // Best approach: keep proportional widths, accept that scaling height
        // effectively just makes tiles a bit taller/shorter. object-cover in the
        // video element handles the rest.
      }
      yOffset += scaledRowH
      tileIdx += count
    }

    // If there's any remaining gap at the bottom (rounding), stretch the last row
    if (yOffset < VH && tilesPerRow.length > 0) {
      const lastRowStart = rects.length - tilesPerRow[tilesPerRow.length - 1]
      const gap = VH - yOffset
      for (let c = lastRowStart; c < rects.length; c++) {
        rects[c].height += gap
      }
    }

    // Convert to CSS
    return rects.map(r => ({
      position: 'absolute' as const,
      left: `${r.left}%`,
      top: `${r.top}%`,
      width: `${r.width}%`,
      height: `${r.height}%`,
    }))
  }, [layout, tiles])

  const cols = Math.ceil(Math.sqrt(tileCount * 1.6))

  const getGridStyle = (): React.CSSProperties => {
    if (layout === 'grid') {
      return {
        display: 'grid',
        gridTemplateColumns: `repeat(${cols}, 1fr)`,
        width: '100%',
        height: '100%',
        overflow: 'hidden',
      }
    }
    return {
      position: 'relative',
      width: '100%',
      height: '100%',
      overflow: 'hidden',
    }
  }

  const getTileStyle = (idx: number): React.CSSProperties => {
    if (layout === 'grid') return {}
    return mosaicTileStyles[idx] ?? {}
  }

  return (
    <div className="h-full w-full flex flex-col bg-black relative overflow-hidden">
      {/* Condensed HUD Controls - Centered bar with slide animation */}
      <div
        className={cn(
          'absolute top-2 sm:top-3 left-1/2 -translate-x-1/2 z-50 flex items-center gap-1 sm:gap-2 bg-gradient-to-b from-gray-900/95 to-gray-800/90 backdrop-blur-md rounded-xl px-2 sm:px-4 py-1.5 sm:py-2.5 border border-white/30 shadow-xl shadow-black/70 transition-all duration-300 ease-in-out max-w-[95vw] overflow-x-auto',
          showHud ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-full pointer-events-none'
        )}
      >
          {/* Video count slider */}
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-white/40">Small</span>
            <input
              type="range"
              min={2}
              max={30}
              value={tileCount}
              onChange={(e) => {
                const v = Number(e.target.value)
                setTileCount(v)
                saveSettings({ tileCount: v })
              }}
              className="w-28 h-1.5 rounded-full appearance-none bg-white/20 cursor-pointer accent-pink-500"
              title={`Tiles: ${tileCount}`}
            />
            <span className="text-[10px] text-white/40">XLarge</span>
            <span className="text-[10px] text-pink-400 font-medium w-5 text-center">{tileCount}</span>
          </div>

          <div className="w-px h-6 bg-white/20" />

          {/* Shuffle */}
          <button
            onClick={() => shuffleTiles()}
            className="px-2 py-1.5 rounded-lg text-xs bg-white/10 hover:bg-white/20 transition"
            title="Shuffle All (S)"
          >

          </button>

          <div className="w-px h-6 bg-white/20" />

          {/* Layout toggle */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => { setLayout('grid'); saveSettings({ layout: 'grid' }) }}
              className={cn(
                'w-7 h-7 rounded-lg text-sm transition flex items-center justify-center',
                layout === 'grid' ? 'bg-white/20 text-white' : 'bg-white/5 text-white/60 hover:bg-white/10'
              )}
              title="Grid layout"
            >

            </button>
            <button
              onClick={() => { setLayout('mosaic'); saveSettings({ layout: 'mosaic' }) }}
              className={cn(
                'w-7 h-7 rounded-lg text-sm transition flex items-center justify-center',
                layout === 'mosaic' ? 'bg-white/20 text-white' : 'bg-white/5 text-white/60 hover:bg-white/10'
              )}
              title="Mosaic layout"
            >

            </button>
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
            title={muted ? 'Unmute (M)' : 'Mute (M)'}
          >
            {muted ? '🔇' : '🔊'}
          </button>

          <div className="w-px h-6 bg-white/20" />

          {/* Fullscreen */}
          <button
            onClick={toggleFullscreen}
            className="w-7 h-7 rounded-lg text-sm bg-white/5 hover:bg-white/15 transition flex items-center justify-center"
            title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen (F)'}
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
          <div><span className="text-white/60">S</span> Shuffle All</div>
          <div><span className="text-white/60">M</span> Mute</div>
          <div><span className="text-white/60">F</span> Fullscreen</div>
          <div><span className="text-white/60">H</span> Toggle HUD</div>
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
        <div className="absolute inset-0 overflow-hidden" style={getGridStyle()}>
          {tiles.map((media, idx) => (
            <GoonTile
              key={`${media.id}-${idx}`}
              media={media}
              muted={muted}
              style={getTileStyle(idx)}
              onShuffle={() => shuffleSingleTile(idx)}
              index={idx}
              tileCount={tileCount}
              onBroken={markBroken}
              layout={layout}
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

const GoonTile = React.memo(function GoonTile(props: {
  media: MediaRow
  muted: boolean
  style?: React.CSSProperties
  onShuffle: () => void
  index: number
  tileCount: number
  onBroken: (id: string) => void
  layout: GoonWallLayout
}) {
  const { media, muted, style, onShuffle, index, tileCount, onBroken, layout } = props
  const isMosaic = layout === 'mosaic'
  const [url, setUrl] = useState('')
  const [retried, setRetried] = useState(false)
  const [ready, setReady] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)

  // Right-click to seek to a random timestamp
  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    const video = videoRef.current
    if (!video || !video.duration || video.duration < 2) return
    video.currentTime = (0.1 + Math.random() * 0.8) * video.duration
  }, [])

  // Load video URL with staggered delay based on tile index to avoid overwhelming the system
  useEffect(() => {
    let alive = true
    setRetried(false)
    setReady(false)
    setUrl('')

    // Stagger tile loads: first 4 immediate, rest delayed by 100ms per tile
    const delay = index < 4 ? 0 : (index - 4) * 100
    const timer = setTimeout(() => {
      if (!alive) return

      // For 9+ tiles, try low-res first for faster loading
      if (tileCount >= 9 && window.api.media.getLowResUrl) {
        const maxH = tileCount > 16 ? 360 : 480
        window.api.media.getLowResUrl(media.id, maxH).then((lowU: any) => {
          if (alive && lowU) setUrl(lowU as string)
          else if (alive) {
            // Fallback to full-res
            window.api.media.getPlayableUrl(media.id).then((u: any) => {
              if (alive && u) setUrl(u as string)
              else if (alive) onShuffle()
            }).catch(() => { if (alive) onShuffle() })
          }
        }).catch(() => {
          if (!alive) return
          window.api.media.getPlayableUrl(media.id).then((u: any) => {
            if (alive && u) setUrl(u as string)
            else if (alive) onShuffle()
          }).catch(() => { if (alive) onShuffle() })
        })
      } else {
        window.api.media.getPlayableUrl(media.id).then((u: any) => {
          if (alive && u) setUrl(u as string)
          else if (alive) onShuffle()
        }).catch(() => { if (alive) onShuffle() })
      }
    }, delay)

    return () => { alive = false; clearTimeout(timer) }
  }, [media.id, media.path, onShuffle, tileCount, index])

  // Cleanup video on unmount
  useEffect(() => {
    return () => {
      const video = videoRef.current
      if (video) cleanupVideo(video)
    }
  }, [])

  // Mute sync
  useEffect(() => {
    if (videoRef.current) videoRef.current.muted = muted
  }, [muted])

  // Seek to random position on metadata load
  const handleLoadedMetadata = useCallback(() => {
    const video = videoRef.current
    if (!video || !video.duration || video.duration < 2) return
    video.currentTime = (0.1 + Math.random() * 0.8) * video.duration
    setReady(true)
  }, [])

  // Handle errors — force transcode on first error, skip on second
  const handleError = useCallback((e: React.SyntheticEvent<HTMLVideoElement>) => {
    const error = e.currentTarget.error
    const errorType = error ? ['', 'ABORTED', 'NETWORK', 'DECODE', 'SRC_NOT_SUPPORTED'][error.code] || 'UNKNOWN' : 'UNKNOWN'

    if (!retried) {
      console.warn('[GoonTile] Error, force transcoding:', media.path, errorType)
      setRetried(true)
      window.api.media.getPlayableUrl(media.id, true).then((u: any) => {
        if (u) setUrl(u as string)
        else onShuffle()
      }).catch(() => onShuffle())
      return
    }
    console.warn('[GoonTile] Error after transcode, marking broken & skipping:', media.path, errorType)
    onBroken(media.id)
    onShuffle()
  }, [media.id, media.path, onShuffle, onBroken, retried])

  // Poster thumbnail URL
  const [poster, setPoster] = useState('')
  useEffect(() => {
    if (media.thumbPath) {
      toFileUrlCached(media.thumbPath).then(u => setPoster(u)).catch(() => {})
    }
  }, [media.thumbPath])

  return (
    <div
      className="relative overflow-hidden bg-black group cursor-pointer"
      style={{ ...style, contain: 'strict' }}
      onClick={onShuffle}
      onContextMenu={handleContextMenu}
    >
      {/* Show thumbnail poster while video loads */}
      {poster && !ready && (
        <img
          src={poster}
          className="absolute inset-0 w-full h-full object-cover"
          alt=""
        />
      )}

      {url && (
        <video
          ref={videoRef}
          src={url}
          autoPlay
          loop
          muted={muted}
          playsInline
          preload="metadata"
          className={`w-full h-full ${isMosaic ? 'object-cover' : 'object-contain'}`}
          style={{ opacity: ready ? 1 : 0 }}
          onLoadedMetadata={handleLoadedMetadata}
          onCanPlay={() => setReady(true)}
          onError={handleError}
        />
      )}

      {/* Loading shimmer when no poster and not ready */}
      {!poster && !ready && (
        <div className="absolute inset-0 bg-gray-900 animate-pulse" />
      )}

      {/* Hover overlay */}
      <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center">
        <div className="text-xs text-white/80 text-center p-2 truncate max-w-full">
          {media.path.split(/[/\\]/).pop() || 'Unknown'}
        </div>
        <div className="text-[10px] text-white/50">Click to shuffle | Right-click to skip</div>
      </div>
    </div>
  )
})


// TikTok-style vertical swipe feed
type FeedSortMode = 'random' | 'liked' | 'newest' | 'views'

function FeedPage() {
  const [videos, setVideos] = useState<MediaRow[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [loading, setLoading] = useState(true)
  const [isMuted, setIsMuted] = useState(false)
  const [showHud, setShowHud] = useState(true)
  const [showTagPanel, setShowTagPanel] = useState(false)
  const [allTags, setAllTags] = useState<Array<{ id: string; name: string; videoCount: number }>>([])
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [recommendedTags, setRecommendedTags] = useState<string[]>([]) // Tags to "keep seeing"
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set())
  const [sortMode, setSortMode] = useState<FeedSortMode>('random')
  const containerRef = useRef<HTMLDivElement>(null)
  const videoRefs = useRef<Map<number, HTMLVideoElement>>(new Map())
  const hudTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Suggested tags = tags that have at least 1 video, sorted by video count
  const suggestedTags = useMemo(() => {
    return allTags.filter(t => t.videoCount > 0).slice(0, 20)
  }, [allTags])

  // Load tags with counts on mount
  useEffect(() => {
    window.api.tags.listWithCounts().then(setAllTags)
  }, [])

  // Load videos based on sort mode and selected tags
  const loadVideos = useCallback(async (tags: string[] = []) => {
    setLoading(true)
    try {
      let vids: MediaRow[] = []
      const combinedTags = [...new Set([...tags, ...recommendedTags])]

      if (sortMode === 'random') {
        const result = await window.api.media.randomByTags(combinedTags, { limit: 50 })
        vids = (Array.isArray(result) ? result : []).filter((m: any) => m.type === 'video')
      } else if (sortMode === 'liked') {
        const result = await window.api.media.randomByTags(combinedTags, { limit: 200 })
        const allVids = (Array.isArray(result) ? result : []).filter((m: any) => m.type === 'video')
        // Filter to only liked (rating >= 5)
        const likedVids: MediaRow[] = []
        await Promise.all(allVids.map(async (v: MediaRow) => {
          try {
            const stats = await window.api.media.getStats(v.id)
            if (stats && (stats.rating ?? 0) >= 5) likedVids.push(v)
          } catch {}
        }))
        vids = likedVids.slice(0, 50)
      } else if (sortMode === 'newest') {
        try {
          const result = await window.api.media.list({ sort: 'newest', limit: 50, type: 'video' })
          vids = (Array.isArray(result) ? result : result?.items ?? []).filter((m: any) => m.type === 'video')
        } catch {
          // Fallback to random if list with sort not supported
          const result = await window.api.media.randomByTags(combinedTags, { limit: 50 })
          vids = (Array.isArray(result) ? result : []).filter((m: any) => m.type === 'video')
        }
      } else if (sortMode === 'views') {
        try {
          const result = await window.api.media.list({ sort: 'views', limit: 50, type: 'video' })
          vids = (Array.isArray(result) ? result : result?.items ?? []).filter((m: any) => m.type === 'video')
        } catch {
          const result = await window.api.media.randomByTags(combinedTags, { limit: 50 })
          vids = (Array.isArray(result) ? result : []).filter((m: any) => m.type === 'video')
        }
      }

      setVideos(vids)

      // Load liked status for these videos
      const newLikedIds = new Set<string>()
      await Promise.all(vids.slice(0, 50).map(async (v: MediaRow) => {
        try {
          const stats = await window.api.media.getStats(v.id)
          if (stats && (stats.rating ?? 0) >= 5) {
            newLikedIds.add(v.id)
          }
        } catch {}
      }))
      setLikedIds(newLikedIds)
    } catch (e) {
      console.error('[Feed] Failed to load videos:', e)
    } finally {
      setLoading(false)
    }
  }, [recommendedTags, sortMode])

  // Initial load & reload on sort mode change
  useEffect(() => {
    loadVideos(selectedTags)
  }, [sortMode]) // eslint-disable-line

  // Keyboard navigation: Up/Down = scroll videos, Left/Right = seek in current video
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return

      if (e.key === 'ArrowDown' || e.key === ' ' || e.key === 'j') {
        e.preventDefault()
        setCurrentIndex(prev => Math.min(prev + 1, videos.length - 1))
      } else if (e.key === 'ArrowUp' || e.key === 'k') {
        e.preventDefault()
        setCurrentIndex(prev => Math.max(prev - 1, 0))
      } else if (e.key === 'ArrowRight' || e.key === 'l') {
        // Skip forward 5 seconds in the current video
        e.preventDefault()
        const video = videoRefs.current.get(currentIndex)
        if (video && video.duration) {
          video.currentTime = Math.min(video.currentTime + 5, video.duration)
        }
      } else if (e.key === 'ArrowLeft' || e.key === 'h') {
        // Skip backward 5 seconds in the current video
        e.preventDefault()
        const video = videoRefs.current.get(currentIndex)
        if (video) {
          video.currentTime = Math.max(video.currentTime - 5, 0)
        }
      } else if (e.key === 'm') {
        // Toggle mute
        e.preventDefault()
        setIsMuted(prev => !prev)
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [videos.length, currentIndex])

  // Play/pause based on current index
  useEffect(() => {
    videoRefs.current.forEach((video, idx) => {
      if (idx === currentIndex) {
        video.play().catch(() => {})
      } else {
        video.pause()
      }
    })
  }, [currentIndex])

  // Mouse wheel scrolling — debounced to one video per scroll gesture
  const wheelCooldownRef = useRef(false)
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault()
      if (wheelCooldownRef.current) return
      if (Math.abs(e.deltaY) < 30) return // ignore tiny scroll events
      wheelCooldownRef.current = true
      if (e.deltaY > 0) {
        setCurrentIndex(prev => Math.min(prev + 1, videos.length - 1))
      } else {
        setCurrentIndex(prev => Math.max(prev - 1, 0))
      }
      setTimeout(() => { wheelCooldownRef.current = false }, 400)
    }
    el.addEventListener('wheel', handleWheel, { passive: false })
    return () => el.removeEventListener('wheel', handleWheel)
  }, [videos.length])

  // Auto-hide HUD after inactivity
  const resetHudTimeout = useCallback(() => {
    setShowHud(true)
    if (hudTimeoutRef.current) clearTimeout(hudTimeoutRef.current)
    hudTimeoutRef.current = setTimeout(() => setShowHud(false), 3000)
  }, [])

  useEffect(() => {
    const handleMove = () => resetHudTimeout()
    window.addEventListener('mousemove', handleMove)
    resetHudTimeout()
    return () => {
      window.removeEventListener('mousemove', handleMove)
      if (hudTimeoutRef.current) clearTimeout(hudTimeoutRef.current)
    }
  }, [resetHudTimeout])

  // Toggle mute on current video
  useEffect(() => {
    videoRefs.current.forEach((video, idx) => {
      video.muted = idx !== currentIndex || isMuted
    })
  }, [currentIndex, isMuted])

  // Shuffle/refresh feed
  const shuffleFeed = useCallback(async () => {
    setCurrentIndex(0)
    if (containerRef.current) {
      containerRef.current.scrollTo({ top: 0, behavior: 'auto' })
    }
    await loadVideos(selectedTags)
  }, [loadVideos, selectedTags])

  // Toggle like for current video
  const toggleLike = useCallback(async (mediaId: string) => {
    const isLiked = likedIds.has(mediaId)
    const newRating = isLiked ? 0 : 5
    // Optimistic UI update
    setLikedIds(prev => {
      const next = new Set(prev)
      if (isLiked) next.delete(mediaId)
      else next.add(mediaId)
      return next
    })
    try {
      await window.api.media.setRating(mediaId, newRating)
    } catch (err) {
      console.error('[Like] Failed to set rating:', err)
      // Revert on failure
      setLikedIds(prev => {
        const next = new Set(prev)
        if (isLiked) next.add(mediaId)
        else next.delete(mediaId)
        return next
      })
    }
  }, [likedIds])

  // Toggle tag selection
  const toggleTag = useCallback((tagName: string) => {
    setSelectedTags(prev =>
      prev.includes(tagName) ? prev.filter(t => t !== tagName) : [...prev, tagName]
    )
  }, [])

  // Add tag to recommended (keep seeing)
  const addToRecommended = useCallback((tagName: string) => {
    setRecommendedTags(prev =>
      prev.includes(tagName) ? prev : [...prev, tagName]
    )
  }, [])

  // Remove from recommended
  const removeFromRecommended = useCallback((tagName: string) => {
    setRecommendedTags(prev => prev.filter(t => t !== tagName))
  }, [])

  // Apply tag filters
  const applyFilters = useCallback(() => {
    setCurrentIndex(0)
    if (containerRef.current) {
      containerRef.current.scrollTo({ top: 0, behavior: 'auto' })
    }
    loadVideos(selectedTags)
    setShowTagPanel(false)
  }, [loadVideos, selectedTags])

  // Skip to next video (used by FeedItem shuffle button)
  const skipToNext = useCallback(() => {
    if (currentIndex < videos.length - 1) {
      setCurrentIndex(currentIndex + 1)
    } else {
      // At end, shuffle new feed
      shuffleFeed()
    }
  }, [currentIndex, videos.length, shuffleFeed])

  // Open current video in main player
  const openInPlayer = useCallback(() => {
    if (videos[currentIndex]) {
      window.dispatchEvent(new CustomEvent('vault-open-video', { detail: videos[currentIndex] }))
    }
  }, [videos, currentIndex])

  if (loading) {
    return (
      <div className="h-full flex flex-col items-center justify-center bg-black">
        <div className="w-12 h-12 border-4 border-white/20 border-t-white/80 rounded-full animate-spin mb-4" />
        <div className="text-white/60">Loading feed...</div>
      </div>
    )
  }

  if (videos.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center bg-black text-center p-8">
            <div className="text-6xl mb-4 opacity-30">📅</div>
        <div className="text-lg font-medium text-white/60">No videos found</div>
        <div className="text-sm text-white/40 mt-2">Add some videos to your library first</div>
      </div>
    )
  }

  return (
    <div className="h-full w-full bg-black relative" onMouseMove={resetHudTimeout}>
      {/* HUD Controls - compact top-right floating bar */}
      <div
        className={`absolute top-2 sm:top-4 right-2 sm:right-4 z-50 flex items-center gap-1 sm:gap-2 transition-opacity duration-300 ${showHud ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
      >
        {/* Sort pills */}
        <div className="flex items-center gap-1 bg-black/90 backdrop-blur-md rounded-full px-2 py-1">
          {(['random', 'liked', 'newest', 'views'] as FeedSortMode[]).map((mode) => (
            <button
              key={mode}
              onClick={() => {
                setSortMode(mode)
                setCurrentIndex(0)
                if (containerRef.current) containerRef.current.scrollTo({ top: 0, behavior: 'auto' })
              }}
              className={cn(
                'px-2.5 py-1 rounded-full text-xs transition',
                sortMode === mode
                  ? 'bg-white/20 text-white font-medium'
                  : 'text-white/60 hover:text-white hover:bg-white/10'
              )}
            >
              {mode.charAt(0).toUpperCase() + mode.slice(1)}
            </button>
          ))}
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-1 bg-black/90 backdrop-blur-md rounded-full px-2 py-1">
          <button
            onClick={() => setShowTagPanel(!showTagPanel)}
            className={cn(
              "w-8 h-8 rounded-full flex items-center justify-center hover:bg-white/10 transition",
              showTagPanel || selectedTags.length > 0 || recommendedTags.length > 0
                ? "text-[var(--primary)]"
                : "text-white/70 hover:text-white"
            )}
            title="Tag filters"
          >
            <Tag size={16} />
          </button>
          <button
            onClick={() => setIsMuted(!isMuted)}
            className="w-8 h-8 rounded-full flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10 transition"
            title={isMuted ? 'Unmute' : 'Mute'}
          >
            {isMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
          </button>
          <button
            onClick={shuffleFeed}
            className="w-8 h-8 rounded-full flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10 transition"
            title="Shuffle feed"
          >
            <Shuffle size={16} />
          </button>
        </div>
      </div>

      {/* Subtle counter - bottom left */}
      <div
        className={`absolute bottom-4 left-4 z-50 text-xs text-white/40 transition-opacity duration-300 ${showHud ? 'opacity-100' : 'opacity-0'}`}
      >
        {currentIndex + 1} / {videos.length}
      </div>

      {/* Tag Panel */}
      {showTagPanel && (
        <div className="absolute top-16 right-4 z-50 w-80 bg-black/90 backdrop-blur-xl rounded-2xl border border-white/10 overflow-hidden">
          <div className="p-4 border-b border-white/10">
            <h3 className="text-sm font-semibold text-white">Filter by Tags</h3>
            <p className="text-xs text-white/50 mt-1">Select tags to filter your feed</p>
          </div>

          {/* Selected Tags */}
          {selectedTags.length > 0 && (
            <div className="p-3 border-b border-white/5">
              <div className="text-xs text-white/40 mb-2">Active Filters</div>
              <div className="flex flex-wrap gap-1">
                {selectedTags.map(tag => (
                  <span
                    key={tag}
                    onClick={() => toggleTag(tag)}
                    className="px-2 py-1 text-xs rounded-full bg-[var(--primary)] text-white cursor-pointer hover:opacity-80"
                  >
                    {tag} ×
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Recommended Tags */}
          {recommendedTags.length > 0 && (
            <div className="p-3 border-b border-white/5">
              <div className="text-xs text-white/40 mb-2">Keep Seeing (Recommended)</div>
              <div className="flex flex-wrap gap-1">
                {recommendedTags.map(tag => (
                  <span
                    key={tag}
                    onClick={() => removeFromRecommended(tag)}
                    className="px-2 py-1 text-xs rounded-full bg-green-600/80 text-white cursor-pointer hover:opacity-80"
                  >
                    {tag} ×
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Suggested Tags (tags with videos) */}
          {suggestedTags.length > 0 && (
            <div className="p-3 border-b border-white/5">
              <div className="text-xs text-white/40 mb-2 flex items-center gap-1">
                <Sparkles size={12} />
                Suggested Tags
              </div>
              <div className="flex flex-wrap gap-1">
                {suggestedTags.map(tag => {
                  const isSelected = selectedTags.includes(tag.name)
                  const isRecommended = recommendedTags.includes(tag.name)
                  return (
                    <div key={tag.id} className="relative group">
                      <span
                        onClick={() => toggleTag(tag.name)}
                        className={cn(
                          "px-2 py-1 text-xs rounded-full cursor-pointer transition inline-flex items-center gap-1",
                          isSelected
                            ? "bg-[var(--primary)] text-white"
                            : isRecommended
                              ? "bg-green-600/40 text-green-300"
                              : "bg-gradient-to-r from-purple-600/30 to-pink-600/30 text-white/90 hover:from-purple-600/50 hover:to-pink-600/50"
                        )}
                      >
                        {tag.name}
                        <span className="text-[10px] opacity-60">({tag.videoCount})</span>
                      </span>
                      {!isRecommended && (
                        <button
                          onClick={(e) => { e.stopPropagation(); addToRecommended(tag.name) }}
                          className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-green-600 text-white text-[10px] opacity-0 group-hover:opacity-100 transition flex items-center justify-center"
                          title="Keep seeing this tag"
                        >
                          +
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* All Tags */}
          <div className="p-3 max-h-48 overflow-y-auto">
            <div className="text-xs text-white/40 mb-2">All Tags ({allTags.length})</div>
            <div className="flex flex-wrap gap-1">
              {allTags.map(tag => {
                const isSelected = selectedTags.includes(tag.name)
                const isRecommended = recommendedTags.includes(tag.name)
                return (
                  <div key={tag.id} className="relative group">
                    <span
                      onClick={() => toggleTag(tag.name)}
                      className={cn(
                        "px-2 py-1 text-xs rounded-full cursor-pointer transition inline-flex items-center gap-1",
                        isSelected
                          ? "bg-[var(--primary)] text-white"
                          : isRecommended
                            ? "bg-green-600/40 text-green-300"
                            : tag.videoCount > 0
                              ? "bg-white/10 text-white/70 hover:bg-white/20"
                              : "bg-white/5 text-white/40 hover:bg-white/10"
                      )}
                    >
                      {tag.name}
                      {tag.videoCount > 0 && (
                        <span className="text-[10px] opacity-50">({tag.videoCount})</span>
                      )}
                    </span>
                    {!isRecommended && (
                      <button
                        onClick={(e) => { e.stopPropagation(); addToRecommended(tag.name) }}
                        className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-green-600 text-white text-[10px] opacity-0 group-hover:opacity-100 transition flex items-center justify-center"
                        title="Keep seeing this tag"
                      >
                        +
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {/* Actions */}
          <div className="p-3 border-t border-white/10 flex gap-2">
            <button
              onClick={() => { setSelectedTags([]); setRecommendedTags([]) }}
              className="flex-1 px-3 py-2 text-xs rounded-lg bg-white/10 text-white/70 hover:bg-white/20 transition"
            >
              Clear All
            </button>
            <button
              onClick={applyFilters}
              className="flex-1 px-3 py-2 text-xs rounded-lg bg-[var(--primary)] text-white hover:opacity-90 transition"
            >
              Apply Filters
            </button>
          </div>
        </div>
      )}

      {/* Video container - render current + adjacent for preloading */}
      <div ref={containerRef} className="h-full w-full relative">
        {videos.map((video, index) => {
          // Only render current and +/- 1 for preloading
          const offset = index - currentIndex
          if (Math.abs(offset) > 1) return null
          return (
            <div
              key={video.id}
              className="absolute inset-0"
              style={{
                zIndex: offset === 0 ? 10 : 1,
                opacity: offset === 0 ? 1 : 0,
                pointerEvents: offset === 0 ? 'auto' : 'none',
              }}
            >
              <FeedItem
                video={video}
                index={index}
                isActive={index === currentIndex}
                onVideoRef={(el) => {
                  if (el) videoRefs.current.set(index, el)
                  else videoRefs.current.delete(index)
                }}
                isLiked={likedIds.has(video.id)}
                onToggleLike={() => toggleLike(video.id)}
                onSkip={skipToNext}
                onOpenInPlayer={openInPlayer}
              />
            </div>
          )
        })}
      </div>

      {/* Side navigation */}
      <div className="absolute right-2 sm:right-4 top-1/2 -translate-y-1/2 z-50 flex flex-col gap-2">
        <button
          onClick={() => setCurrentIndex(prev => Math.max(prev - 1, 0))}
          disabled={currentIndex === 0}
          className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-black/85 backdrop-blur-md flex items-center justify-center text-white/60 hover:text-white hover:bg-black/70 disabled:opacity-30 disabled:cursor-not-allowed transition"
        >
          <ChevronUp className="w-4 h-4 sm:w-5 sm:h-5" />
        </button>
        <button
          onClick={() => setCurrentIndex(prev => Math.min(prev + 1, videos.length - 1))}
          disabled={currentIndex === videos.length - 1}
          className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-black/85 backdrop-blur-md flex items-center justify-center text-white/60 hover:text-white hover:bg-black/70 disabled:opacity-30 disabled:cursor-not-allowed transition"
        >
          <ChevronDown className="w-4 h-4 sm:w-5 sm:h-5" />
        </button>
      </div>
    </div>
  )
}

// Individual feed item
const FeedItem = React.memo(function FeedItem(props: {
  video: MediaRow
  index: number
  isActive: boolean
  onVideoRef: (el: HTMLVideoElement | null) => void
  isLiked: boolean
  onToggleLike: () => void
  onSkip: () => void
  onOpenInPlayer?: () => void
}) {
  const { video, isActive, onVideoRef, isLiked, onToggleLike, onSkip, onOpenInPlayer } = props
  const [showPlaylistPopup, setShowPlaylistPopup] = useState(false)
  const feedPlaylistBtnRef = useRef<HTMLButtonElement>(null)
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(true)
  const [transcodeRetried, setTranscodeRetried] = useState(false)

  useEffect(() => {
    let alive = true
    setTranscodeRetried(false)
    ;(async () => {
      try {
        const u = await window.api.media.getPlayableUrl(video.id)
        if (alive && u) { setUrl(u as string); return }
      } catch {}
      // Fallback to direct file URL
      const u = await toFileUrlCached(video.path)
      if (alive) setUrl(u)
    })()
    return () => { alive = false }
  }, [video.id, video.path])

  const filename = video.filename || video.path.split(/[/\\]/).pop() || 'Unknown'

  return (
    <div className="h-full w-full flex items-center justify-center bg-black relative">
      {/* Video - fill height, maintain aspect ratio */}
      {url && (
        <video
          ref={onVideoRef}
          src={url}
          className="h-full w-full object-contain"
          autoPlay={isActive}
          muted={!isActive}
          loop
          playsInline
          preload={isActive ? 'auto' : 'metadata'}
          onCanPlay={() => setLoading(false)}
          onError={() => {
            // Retry with force transcode before skipping
            if (!transcodeRetried) {
              setTranscodeRetried(true)
              window.api.media.getPlayableUrl(video.id, true).then((u: any) => {
                if (u) setUrl(u as string)
                else { setLoading(false); onSkip() }
              }).catch(() => { setLoading(false); onSkip() })
              return
            }
            setLoading(false)
            onSkip()
          }}
        />
      )}

      {/* Loading state */}
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-white/20 border-t-white/60 rounded-full animate-spin" />
        </div>
      )}

      {/* Video info overlay */}
      <div className="absolute bottom-12 sm:bottom-20 left-3 sm:left-4 right-16 sm:right-20 text-white">
        <p className="font-semibold text-sm sm:text-lg truncate">{filename}</p>
        {video.durationSec && (
          <p className="text-xs sm:text-sm text-white/60">{formatDuration(video.durationSec)}</p>
        )}
      </div>

      {/* Side actions (TikTok-style) */}
      <div className="absolute right-2 sm:right-4 bottom-16 sm:bottom-32 flex flex-col gap-2 sm:gap-3">
        <button
          onClick={onToggleLike}
          className={cn(
            "w-9 h-9 sm:w-12 sm:h-12 rounded-full bg-black/85 backdrop-blur-md flex items-center justify-center hover:bg-black/60 transition",
            isLiked ? "text-red-500" : "text-white/80 hover:text-white"
          )}
          title={isLiked ? "Unlike" : "Like"}
        >
          <Heart className="w-4 h-4 sm:w-6 sm:h-6" fill={isLiked ? "currentColor" : "none"} />
        </button>
        <div className="relative">
          <button
            ref={feedPlaylistBtnRef}
            onClick={() => setShowPlaylistPopup(prev => !prev)}
            className="w-9 h-9 sm:w-12 sm:h-12 rounded-full bg-black/85 backdrop-blur-md flex items-center justify-center text-white/80 hover:text-white hover:bg-black/60 transition"
            title="Add to playlist"
          >
            <Plus className="w-4 h-4 sm:w-6 sm:h-6" />
          </button>
          {showPlaylistPopup && (
            <AddToPlaylistPopup
              mediaId={video.id}
              onClose={() => setShowPlaylistPopup(false)}
              anchorRef={feedPlaylistBtnRef}
            />
          )}
        </div>
        <button
          onClick={onSkip}
          className="w-9 h-9 sm:w-12 sm:h-12 rounded-full bg-black/85 backdrop-blur-md flex items-center justify-center text-white/80 hover:text-white hover:bg-black/60 transition"
          title="Shuffle / Next"
        >
          <Shuffle className="w-4 h-4 sm:w-6 sm:h-6" />
        </button>
        {onOpenInPlayer && (
          <button
            onClick={onOpenInPlayer}
            className="w-9 h-9 sm:w-12 sm:h-12 rounded-full bg-black/85 backdrop-blur-md flex items-center justify-center text-white/80 hover:text-white hover:bg-black/60 transition"
            title="Open in Player"
          >
            <Maximize2 className="w-4 h-4 sm:w-6 sm:h-6" />
          </button>
        )}
      </div>
    </div>
  )
})

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

type PlaylistSortBy = 'manual' | 'name' | 'duration' | 'added' | 'random'

function PlaylistsPage() {
  const [playlists, setPlaylists] = useState<PlaylistRow[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [items, setItems] = useState<any[]>([])
  const [newName, setNewName] = useState('')
  const [renaming, setRenaming] = useState<string | null>(null)
  const [renamingValue, setRenamingValue] = useState('')
  const [dragIdx, setDragIdx] = useState<number | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [openMediaId, setOpenMediaId] = useState<string | null>(null)
  const [sortBy, setSortBy] = useState<PlaylistSortBy>('manual')
  const [typeFilter, setTypeFilter] = useState<'all' | 'video' | 'image' | 'gif'>('all')
  const [showAddMedia, setShowAddMedia] = useState(false)
  const [allMedia, setAllMedia] = useState<MediaRow[]>([])
  const [mediaSearch, setMediaSearch] = useState('')
  const [addingMedia, setAddingMedia] = useState(false)

  const refresh = async () => {
    try {
      setIsLoading(true)
      setError(null)
      const pls = await window.api.playlists.list()
      setPlaylists(pls)
    } catch (err: any) {
      console.error('[PlaylistsPage] Failed to load playlists:', err)
      setError(err?.message ?? 'Failed to load playlists')
    } finally {
      setIsLoading(false)
    }
  }

  const loadItems = async (id: string) => {
    try {
      const its = await window.api.playlists.getItems(id)
      setItems(its)
    } catch (err: any) {
      console.error('[PlaylistsPage] Failed to load items:', err)
      setError(err?.message ?? 'Failed to load playlist items')
    }
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
    try {
      const created = await window.api.playlists.create(newName.trim())
      setNewName('')
      await refresh()
      if (created?.id) setSelectedId(created.id)
    } catch (err: any) {
      console.error('[PlaylistsPage] Failed to create playlist:', err)
      setError(err?.message ?? 'Failed to create playlist')
    }
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

  const openAddMedia = async () => {
    try {
      const media = await window.api.media.list({ limit: 500 })
      setAllMedia(media)
      setShowAddMedia(true)
      setMediaSearch('')
    } catch (err: any) {
      console.error('[PlaylistsPage] Failed to load media:', err)
    }
  }

  const addMediaToPlaylist = async (mediaId: string) => {
    if (!selectedId || addingMedia) return
    setAddingMedia(true)
    try {
      await window.api.playlists.addItems(selectedId, [mediaId])
      await loadItems(selectedId)
    } catch (err: any) {
      console.error('[PlaylistsPage] Failed to add media:', err)
    } finally {
      setAddingMedia(false)
    }
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

  // Sort items based on sortBy
  const sortedItems = useMemo(() => {
    // Apply type filter first
    let filtered = items
    if (typeFilter !== 'all') {
      filtered = items.filter((item: any) => {
        const t = (item.media?.type ?? item.type ?? '').toLowerCase()
        return t === typeFilter
      })
    }
    if (sortBy === 'manual') return filtered
    const sorted = [...filtered]
    switch (sortBy) {
      case 'name':
        sorted.sort((a: any, b: any) => {
          const nameA = (a.media?.filename ?? a.filename ?? '').toLowerCase()
          const nameB = (b.media?.filename ?? b.filename ?? '').toLowerCase()
          return nameA.localeCompare(nameB)
        })
        break
      case 'duration':
        sorted.sort((a: any, b: any) => {
          const durA = a.media?.durationSec ?? a.durationSec ?? 0
          const durB = b.media?.durationSec ?? b.durationSec ?? 0
          return durB - durA
        })
        break
      case 'added':
        sorted.sort((a: any, b: any) => {
          const addedA = a.addedAt ?? 0
          const addedB = b.addedAt ?? 0
          return addedB - addedA
        })
        break
      case 'random': {
        for (let i = sorted.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1))
          ;[sorted[i], sorted[j]] = [sorted[j], sorted[i]]
        }
        break
      }
    }
    return sorted
  }, [items, sortBy, typeFilter])

  // Build media list for the FloatingVideoPlayer from playlist items
  const playlistMediaList: MediaRow[] = sortedItems
    .filter((item: any) => item.media || item.path)
    .map((item: any) => ({
      id: item.media?.id ?? item.mediaId ?? item.id,
      path: item.media?.path ?? item.path ?? '',
      type: (item.media?.type ?? item.type ?? 'video') as MediaType,
      filename: item.media?.filename ?? item.filename,
      ext: item.media?.ext ?? item.ext,
      size: item.media?.size ?? item.size,
      durationSec: item.media?.durationSec ?? item.durationSec,
      thumbPath: item.media?.thumbPath ?? item.thumbPath,
      width: item.media?.width ?? item.width,
      height: item.media?.height ?? item.height,
    }))
  const currentMedia = playlistMediaList.find(m => m.id === openMediaId)

  if (isLoading && playlists.length === 0) {
    return (
      <div className="h-full flex items-center justify-center">
        <RefreshCw size={24} className="animate-spin text-[var(--muted)]" />
      </div>
    )
  }

  if (error && playlists.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4">
        <div className="text-sm text-red-400">{error}</div>
        <Btn onClick={() => void refresh()}>Retry</Btn>
      </div>
    )
  }

  return (
    <>
      <TopBar
        title="Sessions"
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
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-bold">{selectedPlaylist.name}</h2>
                  <div className="text-sm text-[var(--muted)] mt-1">
                    {items.length} {items.length === 1 ? 'item' : 'items'}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {/* Type filter buttons */}
                  <div className="flex gap-1">
                    {(['all', 'video', 'image', 'gif'] as const).map((t) => (
                      <button
                        key={t}
                        onClick={() => setTypeFilter(t)}
                        className={cn(
                          'px-2.5 py-1.5 rounded-lg text-xs border transition',
                          typeFilter === t
                            ? 'bg-white/10 border-white/20 text-white font-medium'
                            : 'border-[var(--border)] text-[var(--muted)] hover:border-white/15 hover:text-white'
                        )}
                      >
                        {t === 'all' ? 'All' : t === 'video' ? 'Videos' : t === 'image' ? 'Images' : 'GIFs'}
                      </button>
                    ))}
                  </div>
                  {/* Sort buttons */}
                  <div className="flex gap-1">
                    {(['manual', 'name', 'duration', 'added', 'random'] as PlaylistSortBy[]).map((s) => (
                      <button
                        key={s}
                        onClick={() => setSortBy(s)}
                        className={cn(
                          'px-2.5 py-1.5 rounded-lg text-xs border transition',
                          sortBy === s
                            ? 'bg-white/10 border-white/20 text-white font-medium'
                            : 'border-[var(--border)] text-[var(--muted)] hover:border-white/15 hover:text-white'
                        )}
                      >
                        {s.charAt(0).toUpperCase() + s.slice(1)}
                      </button>
                    ))}
                  </div>
                  <Btn tone="primary" onClick={openAddMedia} className="flex items-center gap-1.5">
                    <Plus size={14} />
                    Add Videos
                  </Btn>
                </div>
              </div>

              {/* Mosaic grid */}
              <div
                className="grid"
                style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '12px' }}
              >
                {sortedItems.map((item: any, idx: number) => {
                  const mediaId = item.media?.id ?? item.mediaId
                  const isPlaying = openMediaId === mediaId
                  return (
                    <div
                      key={item.playlistItemId}
                      draggable={sortBy === 'manual'}
                      onDragStart={sortBy === 'manual' ? () => handleDragStart(idx) : undefined}
                      onDragOver={sortBy === 'manual' ? (e) => { e.preventDefault(); handleDragOver(e, idx) } : undefined}
                      onDrop={sortBy === 'manual' ? (e) => handleDrop(e, idx) : undefined}
                      onClick={() => { if (mediaId) setOpenMediaId(mediaId) }}
                      className={cn(
                        'relative rounded-xl border bg-black/20 overflow-hidden group cursor-pointer transition-all duration-200',
                        'hover:scale-[1.02] hover:z-10 hover:shadow-xl hover:shadow-black/40',
                        dragIdx === idx && 'opacity-50 scale-95',
                        isPlaying
                          ? 'border-[var(--primary)]/50 shadow-[0_0_20px_rgba(var(--primary-rgb),0.3)]'
                          : 'border-[var(--border)] hover:border-[var(--primary)]/30'
                      )}
                    >
                      {/* Thumbnail */}
                      <PlaylistGridThumb item={item} />

                      {/* Position badge */}
                      <div className="absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded bg-black/60 backdrop-blur-sm text-[10px] text-white/70">
                        {idx + 1}
                      </div>

                      {/* Drag handle (manual sort only) */}
                      {sortBy === 'manual' && (
                        <div className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded bg-black/60 backdrop-blur-sm text-[10px] text-white/50 cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-100 transition">

                        </div>
                      )}

                      {/* Remove button (hover) */}
                      <button
                        onClick={(e) => { e.stopPropagation(); removeItem(item.playlistItemId) }}
                        className="absolute top-1.5 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition px-2 py-1 rounded bg-red-500/80 backdrop-blur-sm text-[10px] text-white hover:bg-red-500"
                      >
                        <Trash2 size={12} />
                      </button>

                      {/* Now playing indicator */}
                      {isPlaying && (
                        <div className="absolute bottom-12 left-1.5">
                          <div className="px-2 py-1 rounded text-[10px] backdrop-blur-sm flex items-center gap-1 bg-green-500 text-white shadow-[0_0_15px_rgba(34,197,94,0.6)] animate-pulse">
                            <span className="w-1.5 h-1.5 bg-white rounded-full animate-ping" />
                            Playing
                          </div>
                        </div>
                      )}

                      {/* Info bar */}
                      <div className="px-3 py-2">
                        <div className="text-xs font-medium truncate">{item.media?.filename ?? item.filename ?? 'Unknown'}</div>
                        <div className="text-[10px] text-[var(--muted)] flex items-center gap-2 mt-0.5">
                          <span>{(item.media?.type ?? item.type ?? '').toUpperCase()}</span>
                          {(item.media?.durationSec ?? item.durationSec) ? (
                            <span>{formatDuration(item.media?.durationSec ?? item.durationSec)}</span>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>

              {items.length === 0 && (
                <div className="text-center py-12">
                    <div className="text-4xl mb-3 opacity-30">📋</div>
                  <div className="text-sm text-[var(--muted)]">This playlist is empty</div>
                  <Btn tone="primary" onClick={openAddMedia} className="mt-4 flex items-center gap-1.5 mx-auto">
                    <Plus size={14} />
                    Add Videos
                  </Btn>
                </div>
              )}
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-center p-6">
        <div className="text-6xl mb-4 opacity-30">🎬</div>
              <div className="text-lg font-medium text-[var(--muted)]">Select a playlist</div>
              <div className="text-sm text-[var(--text-subtle)] mt-1">
                Choose a playlist from the sidebar or create a new one
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Add Videos Modal */}
      {showAddMedia && selectedId && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-sm flex items-center justify-center z-[60]">
          <div className="w-[700px] max-h-[80vh] rounded-3xl border border-white/10 bg-[var(--panel)] overflow-hidden shadow-2xl flex flex-col">
            <div className="px-6 py-4 border-b border-[var(--border)] flex items-center justify-between shrink-0">
              <div className="text-sm font-semibold">Add Videos to Playlist</div>
              <div className="flex items-center gap-3">
                <input
                  value={mediaSearch}
                  onChange={(e) => setMediaSearch(e.target.value)}
                  placeholder="Search..."
                  className="px-3 py-1.5 rounded-xl bg-black/20 border border-[var(--border)] outline-none focus:border-white/15 text-xs w-48"
                />
                <Btn onClick={() => setShowAddMedia(false)}>Done</Btn>
              </div>
            </div>
            <div className="flex-1 overflow-auto p-4">
              <div className="grid grid-cols-3 gap-3">
                {allMedia
                  .filter((m) => {
                    if (!mediaSearch.trim()) return true
                    return (m.filename ?? '').toLowerCase().includes(mediaSearch.toLowerCase())
                  })
                  .map((m) => {
                    const alreadyAdded = items.some((item: any) => (item.media?.id ?? item.mediaId) === m.id)
                    return (
                      <div
                        key={m.id}
                        onClick={() => !alreadyAdded && addMediaToPlaylist(m.id)}
                        className={cn(
                          'rounded-xl border overflow-hidden cursor-pointer transition group',
                          alreadyAdded
                            ? 'border-green-500/30 opacity-60 cursor-default'
                            : 'border-[var(--border)] hover:border-white/20'
                        )}
                      >
                        <SessionMediaThumb media={m} />
                        <div className="px-3 py-2 flex items-center justify-between">
                          <span className="text-xs truncate flex-1">{m.filename ?? 'Unknown'}</span>
                          {alreadyAdded ? (
                            <span className="text-green-400 text-xs ml-2 shrink-0">Added</span>
                          ) : (
                            <Plus size={14} className="text-[var(--muted)] group-hover:text-white ml-2 shrink-0" />
                          )}
                        </div>
                      </div>
                    )
                  })}
              </div>
              {allMedia.length === 0 && (
                <div className="text-center py-12 text-sm text-[var(--muted)]">No media found in library</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Floating Video Player for playlist playback */}
      {openMediaId && currentMedia && (
        <FloatingVideoPlayer
          media={currentMedia}
          mediaList={playlistMediaList}
          onClose={() => setOpenMediaId(null)}
          onMediaChange={(newId) => setOpenMediaId(newId)}
        />
      )}
    </>
  )
}

function SessionMediaThumb(props: { media: MediaRow }) {
  const [url, setUrl] = useState('')
  useEffect(() => {
    let alive = true
    const thumbPath = props.media.thumbPath
    if (thumbPath) {
      toFileUrlCached(thumbPath).then(u => { if (alive) setUrl(u) }).catch(() => {})
    }
    return () => { alive = false }
  }, [props.media.thumbPath])

  return (
    <div className="aspect-video bg-black/30">
      {url ? (
        <img src={url} alt="" className="w-full h-full object-cover" />
      ) : (
        <div className="w-full h-full flex items-center justify-center text-xs text-[var(--muted)]">No thumb</div>
      )}
    </div>
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

        </div>
      )}
    </div>
  )
}

function PlaylistGridThumb(props: { item: any }) {
  const [url, setUrl] = useState('')
  const item = props.item

  useEffect(() => {
    let alive = true
    const thumbPath = item.media?.thumbPath ?? item.thumbPath
    if (thumbPath) {
      toFileUrlCached(thumbPath).then(u => { if (alive) setUrl(u) }).catch(() => {})
    }
    return () => { alive = false }
  }, [item.media?.thumbPath, item.thumbPath])

  return (
    <div className="bg-black/30 overflow-hidden" style={{ aspectRatio: '16 / 10' }}>
      {url ? (
        <img src={url} alt="" className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-110" />
      ) : (
          <div className="w-full h-full flex items-center justify-center text-2xl opacity-30">🎬</div>
      )}
    </div>
  )
}

//
// GOON STATS PAGE - Track your pleasure journey
//

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

type Achievement = {
  id: string
  name: string
  description: string
  icon: string
  category: string
  target: number
  secret?: boolean
}

function StatsPage({ confetti, anime }: { confetti?: ReturnType<typeof useConfetti>; anime?: ReturnType<typeof useAnime> }) {
  const [goonStats, setGoonStats] = useState<GoonStats | null>(null)
  const [vaultStats, setVaultStats] = useState<any>(null)
  const [achievements, setAchievements] = useState<Achievement[]>([])
  const [loading, setLoading] = useState(true)
  const [achievementTab, setAchievementTab] = useState<string>('all')

  useEffect(() => {
    loadAllStats()
    const unsubStats = window.api.events.onGoonStatsChanged?.((s: GoonStats) => setGoonStats(s))
    const unsubAchievement = window.api.events.onAchievementUnlocked?.((ids: string[]) => {
      console.log('Achievements unlocked:', ids)
      confetti?.achievement()
      loadAllStats()
    })
    return () => { unsubStats?.(); unsubAchievement?.() }
  }, [])

  const loadAllStats = async () => {
    try {
      const [gs, vs] = await Promise.all([
        window.api.goon.getStats(),
        window.api.vault.getStats()
      ])
      setGoonStats(gs)
      setVaultStats(vs)
      const a = await window.api.goon.getAchievements()
      setAchievements(a)
    } catch (e) {
      console.error('Failed to load stats:', e)
    } finally {
      setLoading(false)
    }
  }

  const fmt = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n)
  const fmtTime = (minutes: number) => {
    if (minutes < 60) return `${minutes}m`
    const h = Math.floor(minutes / 60)
    return h >= 24 ? `${(h / 24).toFixed(1)}d` : `${h}h ${minutes % 60}m`
  }

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-[var(--muted)] animate-pulse-subtle">Loading stats...</div>
      </div>
    )
  }

  const gs = goonStats
  const vs = vaultStats
  const unlockedIds = new Set(gs?.achievements ?? [])
  const unlockedCount = achievements.filter(a => unlockedIds.has(a.id)).length
  const categories = [...new Set(achievements.map(a => a.category))]
  const filteredAchievements = achievementTab === 'all'
    ? achievements.filter(a => !a.secret || unlockedIds.has(a.id))
    : achievements.filter(a => a.category === achievementTab && (!a.secret || unlockedIds.has(a.id)))

  // Compute progress for each achievement
  const getProgress = (a: Achievement): number => {
    if (!gs) return 0
    const s = gs
    const v = vs
    switch (a.id) {
      case 'first_import': return Math.min(1, s.totalVideosWatched + s.uniqueVideosWatched > 0 ? 1 : 0)
      case 'building_collection': return Math.min(1, (v?.totalMedia ?? 0) / 100)
      case 'organized': return Math.min(1, s.playlistsCreated)
      case 'tagged': return Math.min(1, s.tagsAssigned / 10)
      case 'rated': return Math.min(1, s.ratingsGiven / 10)
      case 'night_owl': return Math.min(1, s.nightOwlSessions)
      case 'early_bird': return Math.min(1, s.earlyBirdSessions)
      case 'weekend_warrior': return Math.min(1, s.weekendSessionsThisWeekend / 5)
      case 'marathon': return Math.min(1, s.longestSession / 120)
      case 'quick_release': return s.averageSessionLength > 0 && s.averageSessionLength <= 5 ? 1 : 0
      case 'first_edge': return Math.min(1, s.totalEdges)
      case 'edge_apprentice': return Math.min(1, s.totalEdges / 10)
      case 'edge_journeyman': return Math.min(1, s.totalEdges / 50)
      case 'edge_master': return Math.min(1, s.totalEdges / 100)
      case 'edge_god': return Math.min(1, s.edgesThisSession / 100)
      case 'denial': return Math.min(1, s.longestEdge / 30)
      case 'denial_king': return Math.min(1, s.longestEdge / 60)
      case 'edge_marathon': return Math.min(1, s.edgesThisSession / 10)
      case 'precision': return s.longestEdge === 69 ? 1 : 0
      case 'control_freak': return s.edgesThisSession >= 20 && s.orgasmsThisWeek === 0 ? 1 : 0
      case 'dedicated': return Math.min(1, s.totalSessions / 10)
      case 'regular': return Math.min(1, s.totalSessions / 50)
      case 'devoted': return Math.min(1, s.totalSessions / 100)
      case 'obsessed': return Math.min(1, s.totalSessions / 500)
      case 'transcendent': return Math.min(1, s.totalTimeGooning / 60000)
      case 'iron_will': return Math.min(1, s.currentStreak / 7)
      case 'committed': return Math.min(1, s.currentStreak / 30)
      case 'nice': return Math.min(1, s.currentStreak / 69)
      case 'legendary': return Math.min(1, s.currentStreak / 100)
      case 'stamina': return Math.min(1, s.longestSession / 300)
      case 'wall_activated': return Math.min(1, s.goonWallSessions)
      case 'multi_tasker': return Math.min(1, s.goonWallMaxTiles / 4)
      case 'overload': return Math.min(1, s.goonWallMaxTiles / 9)
      case 'maximum': return Math.min(1, s.goonWallMaxTiles / 16)
      case 'hypnotized': return Math.min(1, s.goonWallTimeMinutes / 30)
      case 'wall_walker': return Math.min(1, s.goonWallSessions / 100)
      case 'shuffle_master': return Math.min(1, s.goonWallShuffles / 50)
      case 'audio_bliss': return Math.min(1, s.goonWallSessions)
      case 'the_zone': return Math.min(1, s.goonWallTimeMinutes / 60)
      case 'chaos_lover': return s.goonWallMaxTiles >= 12 ? Math.min(1, s.goonWallSessions / 10) : 0
      case 'hoarder': return Math.min(1, (v?.totalMedia ?? 0) / 500)
      case 'archivist': return Math.min(1, (v?.totalMedia ?? 0) / 1000)
      case 'mega_library': return Math.min(1, (v?.totalMedia ?? 0) / 5000)
      case 'playlist_pro': return Math.min(1, (v?.playlistCount ?? s.playlistsCreated) / 5)
      case 'tag_enthusiast': return Math.min(1, s.tagsAssigned / 50)
      case 'tag_master': return Math.min(1, s.tagsAssigned / 200)
      case 'critic': return Math.min(1, s.ratingsGiven / 50)
      case 'connoisseur': return Math.min(1, s.uniqueVideosWatched / 500)
      case 'binge_watcher': return Math.min(1, s.totalVideosWatched / 100)
      case 'explorer': return Math.min(1, s.totalVideosWatched / 1000)
      default: return 0
    }
  }

  const categoryLabels: Record<string, string> = {
    getting_started: 'Getting Started',
    edging: 'Edging',
    session: 'Sessions',
    goonwall: 'Goon Wall',
    collection: 'Collection'
  }

  return (
    <div className="h-full flex flex-col">
      <TopBar title="Stats" />

      <div className="flex-1 overflow-auto p-4 sm:p-6">
        {/* Streak Banner at top */}
        {gs && gs.currentStreak > 0 && (
          <div className="mb-6 p-4 bg-gradient-to-r from-[var(--primary)]/20 to-[var(--secondary)]/20 rounded-2xl border border-[var(--primary)]/30 flex items-center gap-4">
            <div className="text-4xl font-bold text-[var(--primary)]">{gs.currentStreak}</div>
            <div>
              <div className="text-sm font-semibold">Day Streak</div>
              <div className="text-xs text-[var(--muted)]">
                {gs.currentStreak >= 30 ? 'Legendary consistency' : gs.currentStreak >= 7 ? 'On a roll' : 'Keep it going'}
                {gs.longestStreak > gs.currentStreak && ` \u00b7 Best: ${gs.longestStreak} days`}
              </div>
            </div>
          </div>
        )}

        {/* Stat cards — 2 rows */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          {[
            { label: 'Total Media', value: fmt(vs?.totalMedia ?? 0), color: 'text-[var(--primary)]' },
            { label: 'Videos', value: fmt(vs?.videoCount ?? 0), color: 'text-blue-400' },
            { label: 'Images', value: fmt(vs?.imageCount ?? 0), color: 'text-green-400' },
            { label: 'Tags', value: fmt(vs?.tagCount ?? 0), color: 'text-amber-400' },
            { label: 'Videos Watched', value: fmt(gs?.totalVideosWatched ?? 0), color: 'text-pink-400' },
            { label: 'Unique Watched', value: fmt(gs?.uniqueVideosWatched ?? 0), color: 'text-purple-400' },
            { label: 'Playlists', value: fmt(vs?.playlistCount ?? 0), color: 'text-cyan-400' },
            { label: 'Sessions', value: fmt(gs?.totalSessions ?? 0), color: 'text-orange-400' },
          ].map((s, i) => (
            <div key={i} className="p-3 sm:p-4 bg-white/5 rounded-xl border border-white/10">
              <div className={`text-xl sm:text-2xl font-bold ${s.color} mb-0.5`}>{s.value}</div>
              <div className="text-[10px] sm:text-xs text-[var(--muted)]">{s.label}</div>
            </div>
          ))}
        </div>

        {/* Activity row */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          <div className="p-3 bg-white/5 rounded-xl border border-white/10">
            <div className="text-lg font-semibold">{gs?.goonWallSessions ?? 0}</div>
            <div className="text-[10px] text-[var(--muted)]">Wall Sessions</div>
          </div>
          <div className="p-3 bg-white/5 rounded-xl border border-white/10">
            <div className="text-lg font-semibold">{fmtTime(gs?.goonWallTimeMinutes ?? 0)}</div>
            <div className="text-[10px] text-[var(--muted)]">Wall Time</div>
          </div>
          <div className="p-3 bg-white/5 rounded-xl border border-white/10">
            <div className="text-lg font-semibold">{gs?.goonWallShuffles ?? 0}</div>
            <div className="text-[10px] text-[var(--muted)]">Shuffles</div>
          </div>
        </div>

        {/* Achievements section */}
        <div className="mb-4 flex items-center justify-between">
          <div className="text-sm font-semibold text-[var(--muted)]">
            Achievements <span className="text-[var(--primary)]">{unlockedCount}</span>/{achievements.filter(a => !a.secret).length}
          </div>
        </div>

        {/* Category tabs */}
        <div className="flex gap-1 mb-4 flex-wrap">
          <button
            onClick={() => setAchievementTab('all')}
            className={cn(
              'px-2.5 py-1 rounded-lg text-xs transition',
              achievementTab === 'all' ? 'bg-[var(--primary)]/20 text-white font-medium' : 'bg-white/5 text-white/50 hover:text-white/80'
            )}
          >All</button>
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => setAchievementTab(cat)}
              className={cn(
                'px-2.5 py-1 rounded-lg text-xs transition',
                achievementTab === cat ? 'bg-[var(--primary)]/20 text-white font-medium' : 'bg-white/5 text-white/50 hover:text-white/80'
              )}
            >{categoryLabels[cat] ?? cat}</button>
          ))}
        </div>

        {/* Achievement grid with progress */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {filteredAchievements.map(a => {
            const unlocked = unlockedIds.has(a.id)
            const progress = unlocked ? 1 : getProgress(a)
            const pct = Math.round(progress * 100)
            return (
              <div
                key={a.id}
                className={cn(
                  'p-3 rounded-xl border transition',
                  unlocked
                    ? 'bg-[var(--primary)]/10 border-[var(--primary)]/30'
                    : 'bg-white/5 border-white/10 opacity-60'
                )}
              >
                <div className="flex items-start gap-2 mb-2">
                  <div className={cn('text-xl', !unlocked && 'grayscale opacity-50')}>{unlocked ? a.icon : '🔒'}</div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium truncate">{a.name}</div>
                    <div className="text-[10px] text-[var(--muted)] leading-tight">{a.description}</div>
                  </div>
                </div>
                {/* Progress bar */}
                {!unlocked && (
                  <div className="h-1 bg-white/10 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[var(--primary)] rounded-full transition-all duration-500"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                )}
                {!unlocked && pct > 0 && (
                  <div className="text-[9px] text-[var(--muted)] mt-1">{pct}%</div>
                )}
                {unlocked && (
                  <div className="text-[9px] text-[var(--primary)] font-medium mt-1">Unlocked</div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
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
  onThemeChange: (themeId: string) => void
}) {
  const s = props.settings as any
  const [activeTab, setActiveTab] = useState<'library' | 'appearance' | 'privacy' | 'playback'>('library')
  const [isPremium, setIsPremium] = useState(false)

  useEffect(() => {
    window.api.license?.isPremium?.().then((p: any) => setIsPremium(!!p))
  }, [])

  // Support both new and legacy settings structure
  const mediaDirs = s?.library?.mediaDirs ?? s?.mediaDirs ?? []
  const cacheDir = s?.library?.cacheDir ?? s?.cacheDir ?? ''
  const privacySettings = s?.privacy ?? {}
  const playbackSettings = s?.playback ?? {}

  const tabs = [
    { id: 'library', name: 'Library', icon: Library },
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


          {/* Appearance Tab */}
          {activeTab === 'appearance' && (
            <div className="rounded-3xl border border-[var(--border)] bg-black/20 p-5">
              <div className="text-sm font-semibold mb-4">Appearance</div>

              {/* Theme Selectors */}
              {(() => {
                const currentTheme = s?.appearance?.themeId ?? s?.ui?.themeId ?? 'obsidian'
                const goonThemes = GOON_THEME_LIST.map(g => ({ id: g.id, name: g.name, subtitle: g.vibe, colors: themes[g.id as ThemeId]?.colors }))
                const darkThemes = DARK_THEME_LIST.map(t => ({ id: t.id, name: t.name, subtitle: t.description, colors: t.colors }))
                const lightThemes = LIGHT_THEME_LIST.map(t => ({ id: t.id, name: t.name, subtitle: t.description, colors: t.colors }))
                const renderGrid = (items: Array<{ id: string; name: string; subtitle: string; colors: any }>) => (
                  <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))' }}>
                    {items.map((t) => {
                      const active = currentTheme === t.id
                      const primary = t.colors?.primary || '#8b5cf6'
                      const gradient = t.colors?.gradient || `linear-gradient(135deg, ${primary}, ${t.colors?.secondary || '#ec4899'})`
                      return (
                        <button
                          key={t.id}
                          onClick={() => props.onThemeChange(t.id)}
                          className="group relative rounded-xl overflow-hidden transition-transform hover:scale-105"
                          style={{
                            border: active ? `2px solid ${primary}` : '2px solid rgba(255,255,255,0.08)',
                            boxShadow: active ? `0 0 12px ${primary}40` : 'none'
                          }}
                        >
                          <div className="h-16 w-full" style={{ background: gradient }} />
                          <div className="px-2.5 py-2 bg-black/80">
                            <div className="text-xs font-medium text-white/90 truncate">{t.name}</div>
                          </div>
                          {active && (
                            <div className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full flex items-center justify-center text-white text-[10px] font-bold" style={{ background: primary }}>

                            </div>
                          )}
                        </button>
                      )
                    })}
                  </div>
                )
                return (
                  <div className="space-y-4">
                    <div>
                      <div className="text-xs text-[var(--text-muted)] uppercase tracking-wider mb-2 font-semibold">Goon Themes</div>
                      {renderGrid(goonThemes)}
                    </div>
                    <div>
                      <div className="text-xs text-[var(--text-muted)] uppercase tracking-wider mb-2 font-semibold">Dark Themes</div>
                      {renderGrid(darkThemes)}
                    </div>
                    {lightThemes.length > 0 && (
                      <div>
                        <div className="text-xs text-[var(--text-muted)] uppercase tracking-wider mb-2 font-semibold">Light Themes</div>
                        {renderGrid(lightThemes)}
                      </div>
                    )}
                  </div>
                )
              })()}
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
  const { addTask, updateTask, removeTask } = useGlobalTasks()
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [isCleaning, setIsCleaning] = useState(false)
  const [isCleaningNames, setIsCleaningNames] = useState(false)
  const [analysisProgress, setAnalysisProgress] = useState<{ stage: string; current: number; total: number } | null>(null)
  const [ollamaAvailable, setOllamaAvailable] = useState<boolean | null>(null)
  const [results, setResults] = useState<{ type: 'ai' | 'clean' | 'names'; message: string } | null>(null)

  // Check if Ollama is available on mount
  useEffect(() => {
    window.api.hybridTag?.isVisionAvailable?.().then((available: any) => {
      setOllamaAvailable(available)
      console.log('[LibraryTools] Ollama available:', available)
    }).catch(() => setOllamaAvailable(false))
  }, [])

  // Unified AI analysis - does everything
  const handleAiAnalyzeAll = async () => {
    const taskId = 'ai-analyze-all'
    setIsAnalyzing(true)
    setResults(null)
    setAnalysisProgress({ stage: 'Starting...', current: 0, total: 100 })
    addTask({ id: taskId, name: 'AI Library Analysis', progress: 0, status: 'Starting...' })

    // Set up progress listeners
    const unsubHybrid = window.api.events?.onHybridTagProgress?.((progress: any) => {
      const percent = Math.round(10 + (progress.processed / progress.total) * 55)
      const status = `AI tagging... ${progress.processed}/${progress.total} (${progress.tagged} tagged)`
      setAnalysisProgress({ stage: status, current: Math.min(65, percent), total: 100 })
      updateTask(taskId, { progress: Math.min(65, percent), status })
    })

    const unsubDeep = window.api.events?.onVideoAnalysisBatchProgress?.((progress: any) => {
      const percent = Math.round(65 + (progress.current / progress.total) * 30)
      const status = `Deep analysis... ${progress.current}/${progress.total}`
      setAnalysisProgress({ stage: status, current: Math.min(95, percent), total: 100 })
      updateTask(taskId, { progress: Math.min(95, percent), status })
    })

    try {
      let totalTagged = 0
      let totalProcessed = 0
      const methods: string[] = []

      // Stage 1: Smart tagging (filename-based) - fast, free
      setAnalysisProgress({ stage: 'Smart tagging (filenames)...', current: 5, total: 100 })
      updateTask(taskId, { progress: 5, status: 'Smart tagging (filenames)...' })
      try {
        const smartResult = await window.api.smartTag.autoTagAll({ minConfidence: 0.6 })
        if (smartResult.success) {
          totalTagged += smartResult.tagged
          totalProcessed += smartResult.processed
          methods.push('filename')
        }
      } catch (e) {
        console.error('[AI] Smart tagging failed:', e)
      }

      // Stage 2: Filename-based tagging (fast, no AI vision)
      setAnalysisProgress({ stage: 'Pattern matching all files...', current: 10, total: 100 })
      updateTask(taskId, { progress: 10, status: 'Pattern matching all files...' })
      try {
        const hybridResult = await window.api.hybridTag.autoTagAll({
          onlyUntagged: false,
          maxItems: 10000,
          useVision: false  // No vision for large batches - too slow
        })
        if (hybridResult.success) {
          totalTagged += hybridResult.tagged
          totalProcessed = Math.max(totalProcessed, hybridResult.processed)
          methods.push('patterns')
        }
      } catch (e) {
        console.error('[AI] Pattern tagging failed:', e)
      }

      // Stage 3: AI Vision on small sample (only 20 items with no tags)
      setAnalysisProgress({ stage: 'AI vision sample (20 items)...', current: 50, total: 100 })
      updateTask(taskId, { progress: 50, status: 'AI vision sample (20 items)...' })
      try {
        const visionResult = await window.api.hybridTag.autoTagAll({
          onlyUntagged: true,
          maxItems: 20,  // Only 20 items with vision - takes ~10 minutes
          useVision: true
        })
        if (visionResult.success && visionResult.tagged > 0) {
          totalTagged += visionResult.tagged
          methods.push('AI vision')
        }
      } catch (e) {
        console.error('[AI] Vision tagging failed:', e)
      }

      // Stage 4: Deep analysis for a few videos
      setAnalysisProgress({ stage: 'Deep analysis (10 videos)...', current: 75, total: 100 })
      updateTask(taskId, { progress: 75, status: 'Deep analysis (10 videos)...' })
      try {
        const deepResult = await window.api.videoAnalysis.analyzeBatch({
          limit: 10,  // Only 10 videos for deep analysis
          onlyUnanalyzed: true
        })
        if (deepResult.success && deepResult.analyzed > 0) {
          methods.push('deep analysis')
        }
      } catch (e) {
        console.error('[AI] Deep analysis failed:', e)
      }

      setAnalysisProgress({ stage: 'Complete!', current: 100, total: 100 })
      updateTask(taskId, { progress: 100, status: 'Complete!' })

      const methodStr = methods.length > 0 ? methods.join(' + ') : 'filename patterns'
      setResults({
        type: 'ai',
        message: `AI analyzed ${totalProcessed} items, applied ${totalTagged} tags using ${methodStr}`
      })
      // Auto-remove task after 3 seconds
      setTimeout(() => removeTask(taskId), 3000)
    } catch (e: any) {
      setResults({ type: 'ai', message: `Error: ${e.message}` })
      updateTask(taskId, { progress: 100, status: `Error: ${e.message}` })
      setTimeout(() => removeTask(taskId), 5000)
    } finally {
      // Clean up listeners
      unsubHybrid?.()
      unsubDeep?.()
      setIsAnalyzing(false)
      setAnalysisProgress(null)
    }
  }

  // AI-powered tag cleanup - merge similar, fix typos, normalize
  const handleCleanTags = async () => {
    const taskId = 'ai-clean-tags'
    setIsCleaning(true)
    setResults(null)
    setAnalysisProgress({ stage: 'AI analyzing tags...', current: 0, total: 100 })
    addTask({ id: taskId, name: 'AI Tag Cleanup', progress: 0, status: 'Analyzing tags...' })

    try {
      updateTask(taskId, { progress: 30, status: 'AI analyzing tag patterns...' })
      // Use AI-powered cleanup
      const result = await window.api.aiTools.cleanupTags()
      if (result.success) {
        const actions = []
        if (result.merged > 0) actions.push(`${result.merged} merged`)
        if (result.renamed > 0) actions.push(`${result.renamed} renamed`)
        if (result.deleted > 0) actions.push(`${result.deleted} deleted`)

        const message = result.applied > 0
          ? `AI cleaned ${result.analyzed} tags: ${actions.join(', ')}`
          : `AI analyzed ${result.analyzed} tags - all look good!`
        setResults({ type: 'clean', message })
        updateTask(taskId, { progress: 100, status: 'Complete!' })
      } else {
        // Fallback to basic cleanup
        updateTask(taskId, { progress: 60, status: 'Running basic cleanup...' })
        const fallbackResult = await window.api.tags.cleanup()
        const message = fallbackResult.removedCount > 0
          ? `Removed ${fallbackResult.removedCount} inappropriate tags`
          : 'No inappropriate tags found'
        setResults({ type: 'clean', message })
        updateTask(taskId, { progress: 100, status: 'Complete!' })
      }
      setTimeout(() => removeTask(taskId), 3000)
    } catch (e: any) {
      setResults({ type: 'clean', message: `Error: ${e.message}` })
      updateTask(taskId, { progress: 100, status: `Error: ${e.message}` })
      setTimeout(() => removeTask(taskId), 5000)
    } finally {
      setIsCleaning(false)
      setAnalysisProgress(null)
    }
  }

  // AI-powered tag creation for entire library
  const handleCreateTags = async () => {
    const taskId = 'ai-create-tags'
    setIsCleaning(true)
    setResults(null)
    setAnalysisProgress({ stage: 'AI generating new tags...', current: 0, total: 100 })
    addTask({ id: taskId, name: 'AI Tag Creation', progress: 0, status: 'Generating tags...' })

    try {
      updateTask(taskId, { progress: 20, status: 'Analyzing content...' })
      const result = await window.api.aiTools.generateTagsAll({ maxItems: 500, onlyUntagged: false })
      if (result.success) {
        const message = `AI processed ${result.processed} items: ${result.tagsApplied} tags applied, ${result.newTagsCreated} new tags created`
        setResults({ type: 'clean', message })
        updateTask(taskId, { progress: 100, status: 'Complete!' })
      } else {
        setResults({ type: 'clean', message: `Error: ${result.error}` })
        updateTask(taskId, { progress: 100, status: `Error: ${result.error}` })
      }
      setTimeout(() => removeTask(taskId), 3000)
    } catch (e: any) {
      setResults({ type: 'clean', message: `Error: ${e.message}` })
      updateTask(taskId, { progress: 100, status: `Error: ${e.message}` })
      setTimeout(() => removeTask(taskId), 5000)
    } finally {
      setIsCleaning(false)
      setAnalysisProgress(null)
    }
  }

  // AI-powered file renaming based on video content
  const handleCleanNames = async () => {
    const taskId = 'ai-rename-files'
    setIsCleaningNames(true)
    setResults(null)
    setAnalysisProgress({ stage: 'AI renaming files...', current: 0, total: 100 })
    addTask({ id: taskId, name: 'AI File Renaming', progress: 0, status: 'Analyzing files...' })

    try {
      updateTask(taskId, { progress: 20, status: 'AI analyzing content...' })
      // Use AI-powered renaming
      const result = await window.api.aiTools.renameAll({ maxItems: 500 })
      if (result.success) {
        let message = `AI renamed ${result.renamed} files`
        if (result.skipped > 0) message += ` (${result.skipped} skipped)`
        if (result.failed > 0) message += ` (${result.failed} failed)`
        setResults({ type: 'names', message })
        updateTask(taskId, { progress: 100, status: 'Complete!' })
      } else {
        // Fallback to basic cleanup
        updateTask(taskId, { progress: 60, status: 'Running pattern cleanup...' })
        const fallbackResult = await window.api.media.optimizeAllNames()
        setResults({
          type: 'names',
          message: `Pattern-cleaned ${fallbackResult.optimized} filenames`
        })
        updateTask(taskId, { progress: 100, status: 'Complete!' })
      }
      setTimeout(() => removeTask(taskId), 3000)
    } catch (e: any) {
      setResults({ type: 'names', message: `Error: ${e.message}` })
      updateTask(taskId, { progress: 100, status: `Error: ${e.message}` })
      setTimeout(() => removeTask(taskId), 5000)
    } finally {
      setIsCleaningNames(false)
      setAnalysisProgress(null)
    }
  }

  // Listen for progress events (optional, main progress is tracked locally)
  useEffect(() => {
    const unsubs: Array<(() => void) | undefined> = []
    unsubs.push(window.api.events?.onSmartTagProgress?.(() => {}))
    unsubs.push(window.api.events?.onHybridTagProgress?.(() => {}))
    unsubs.push(window.api.events?.onVideoAnalysisBatchProgress?.(() => {}))
    return () => unsubs.forEach(u => u?.())
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
        {/* Unified AI Analyze Button */}
        <div className="p-4 rounded-xl bg-gradient-to-br from-purple-900/30 to-pink-900/30 border border-purple-500/30">
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="text-sm font-semibold flex items-center gap-2">
                AI Analyze Entire Library
                <span className="px-2 py-0.5 text-[10px] rounded-full bg-green-500/30 text-green-400 border border-green-500/30">
                  AI Powered
                </span>
              </div>
              <div className="text-xs text-[var(--muted)] mt-1">
                Filename patterns + AI vision + scene detection + auto-tagging
              </div>
            </div>
            <button
              onClick={handleAiAnalyzeAll}
              disabled={isAnalyzing}
              className={cn(
                'px-5 py-2.5 rounded-xl text-sm font-semibold transition',
                isAnalyzing
                  ? 'bg-purple-500/30 text-purple-300 cursor-wait'
                  : 'bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white shadow-lg shadow-purple-500/25'
              )}
            >
              {isAnalyzing ? (
                <span className="flex items-center gap-2">
                  <RefreshCw size={14} className="animate-spin" />
                  Analyzing...
                </span>
              ) : (
                'Analyze All'
              )}
            </button>
          </div>

          {/* Progress bar */}
          {analysisProgress && (
            <div className="mt-3">
              <div className="flex justify-between text-xs text-[var(--muted)] mb-1">
                <span>{analysisProgress.stage}</span>
                <span>{analysisProgress.current}%</span>
              </div>
              <div className="h-2 bg-black/30 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-purple-500 to-pink-500 transition-all duration-300"
                  style={{ width: `${analysisProgress.current}%` }}
                />
              </div>
            </div>
          )}

          {/* What it does */}
          <div className="mt-3 text-[10px] text-[var(--muted)] grid grid-cols-3 gap-2">
            <div className="flex items-center gap-1">
              <span className="text-green-400">✓</span> Smart filename tags
            </div>
            <div className="flex items-center gap-1">
              <span className="text-green-400">✓</span> AI vision analysis
            </div>
            <div className="flex items-center gap-1">
              <span className="text-green-400">✓</span> Scene detection
            </div>
          </div>
        </div>

        {/* AI Clean Tags Button */}
        <div className="flex items-center justify-between p-3 rounded-xl bg-black/20 border border-[var(--border)]">
          <div>
            <div className="text-sm flex items-center gap-2">
              AI Clean Tags
              <span className="px-1.5 py-0.5 text-[9px] rounded bg-purple-500/30 text-purple-300">AI</span>
            </div>
            <div className="text-xs text-[var(--muted)]">
              Merge similar, fix typos, normalize naming
            </div>
          </div>
          <button
            onClick={handleCleanTags}
            disabled={isCleaning}
            className={cn(
              'px-4 py-2 rounded-lg text-xs font-medium transition',
              isCleaning
                ? 'bg-purple-500/20 text-purple-400 cursor-wait'
                : 'bg-purple-500/20 hover:bg-purple-500/30 text-purple-400 border border-purple-500/30'
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

        {/* AI Create Tags Button */}
        <div className="flex items-center justify-between p-3 rounded-xl bg-black/20 border border-[var(--border)]">
          <div>
            <div className="text-sm flex items-center gap-2">
              AI Create Tags
              <span className="px-1.5 py-0.5 text-[9px] rounded bg-green-500/30 text-green-300">AI</span>
            </div>
            <div className="text-xs text-[var(--muted)]">
              Generate new descriptive tags from video content
            </div>
          </div>
          <button
            onClick={handleCreateTags}
            disabled={isCleaning}
            className={cn(
              'px-4 py-2 rounded-lg text-xs font-medium transition',
              isCleaning
                ? 'bg-green-500/20 text-green-400 cursor-wait'
                : 'bg-green-500/20 hover:bg-green-500/30 text-green-400 border border-green-500/30'
            )}
          >
            {isCleaning ? (
              <span className="flex items-center gap-2">
                <RefreshCw size={12} className="animate-spin" />
                Creating...
              </span>
            ) : (
              'Create Tags'
            )}
          </button>
        </div>

        {/* AI Rename Files */}
        <div className="flex items-center justify-between p-3 rounded-xl bg-black/20 border border-[var(--border)]">
          <div>
            <div className="text-sm flex items-center gap-2">
              AI Rename Files
              <span className="px-1.5 py-0.5 text-[9px] rounded bg-blue-500/30 text-blue-300">AI</span>
            </div>
            <div className="text-xs text-[var(--muted)]">
              Generate clean, descriptive filenames from content
            </div>
          </div>
          <button
            onClick={handleCleanNames}
            disabled={isCleaningNames}
            className={cn(
              'px-4 py-2 rounded-lg text-xs font-medium transition',
              isCleaningNames
                ? 'bg-blue-500/20 text-blue-400 cursor-wait'
                : 'bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 border border-blue-500/30'
            )}
          >
            {isCleaningNames ? (
              <span className="flex items-center gap-2">
                <RefreshCw size={12} className="animate-spin" />
                Renaming...
              </span>
            ) : (
              'Rename All'
            )}
          </button>
        </div>

        {/* Cleanup & Rescan */}
        <div className="flex items-center justify-between p-3 rounded-xl bg-black/20 border border-[var(--border)]">
          <div>
            <div className="text-sm">Cleanup & Rescan</div>
            <div className="text-xs text-[var(--muted)]">
              Remove deleted files, re-index folders
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={async () => {
                const result = await window.api.vault.cleanup()
                if (result.success) {
                  setResults({ type: 'clean', message: `Removed ${result.removed} stale entries from ${result.checked} checked` })
                }
              }}
              className="px-3 py-2 rounded-lg text-xs font-medium bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/30 transition"
            >
              Cleanup
            </button>
            <button
              onClick={async () => {
                setResults({ type: 'ai', message: 'Cleaning up & rescanning...' })
                await window.api.vault.rescan()
                setResults({ type: 'ai', message: 'Library cleanup & rescan complete!' })
              }}
              className="px-3 py-2 rounded-lg text-xs font-medium bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 border border-blue-500/30 transition"
            >
              Rescan
            </button>
          </div>
        </div>

        {/* Results Message */}
        {results && (
          <div className={cn(
            'p-3 rounded-xl text-xs',
            results.type === 'clean'
              ? 'bg-red-500/10 border border-red-500/20 text-red-300'
              : results.type === 'names'
                ? 'bg-purple-500/10 border border-purple-500/20 text-purple-300'
                : 'bg-gradient-to-r from-purple-500/10 to-pink-500/10 border border-purple-500/20 text-purple-300'
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
    <div className="h-full flex flex-col">
      <div className="flex-1 overflow-auto p-6 space-y-6 max-w-3xl">
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
    </div>
  )
}
