// File: src/renderer/App.tsx

import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import {
  themes,
  DARK_THEME_LIST,
  LIGHT_THEME_LIST,
  applyTheme as applyThemeCSS,
  injectEroticAnimations,
  GOON_THEME_LIST,
  type ThemeId
} from './styles/themes'
import { useDebounce, toFileUrlCached, useLazyLoad } from './hooks/usePerformance'
import { useVideoPreview } from './hooks/useVideoPreview'

import { TagSelector } from './components/TagSelector'
import { useHeatLevel } from './components/HeatOverlay'
import { ArousalEffects, CumCountdownOverlay, HeartsOverlay, RainOverlay, GlitchOverlay, BubblesOverlay, MatrixRainOverlay, ConfettiOverlay } from './components/VisualStimulants'
import { ErrorBoundary } from './components/ErrorBoundary'
import { shuffleTake } from './utils/shuffle'
import { formatDuration, formatBytes } from './utils/formatters'
import { cleanupVideo, videoPool } from './hooks/useVideoCleanup'
import { useAnime } from './hooks/useAnime'
import { useConfetti } from './hooks/useConfetti'
import { useUiSounds } from './hooks/useUiSounds'
import { useAmbienceAudio } from './hooks/useAmbienceAudio'
import { FloatingVideoPlayer } from './components/FloatingVideoPlayer'
import { WatchLaterPanel } from './components/WatchLaterPanel'
import { MediaNotesPanel } from './components/MediaNotesPanel'
import { UrlDownloaderPanel } from './components/UrlDownloaderPanel'
import { DuplicatesModal } from './components/DuplicatesModal'
import { HomeDashboard } from './components/HomeDashboard'
import { TVRemotePanel } from './components/TVRemotePanel'
import { PmvEditorPage } from './components/PmvEditor'
// v2.3.0 Components - Professional video editing and media management
import { SceneDetector } from './components/SceneDetector'
import { VideoChapters } from './components/VideoChapters'
import { ColorGrading } from './components/ColorGrading'
import { LoopRegion } from './components/LoopRegion'
import { BookmarkManager } from './components/BookmarkManager'
import { SubtitleEditor } from './components/SubtitleEditor'
import { ThumbnailStrip } from './components/ThumbnailStrip'
import { AudioVisualizer } from './components/AudioVisualizer'
import { PiPController } from './components/PiPController'
import { KeyframeExtractor } from './components/KeyframeExtractor'
import { VideoFilters } from './components/VideoFilters'
import { SplitScreen } from './components/SplitScreen'
import { SmartCrop } from './components/SmartCrop'
import { MetadataEditor } from './components/MetadataEditor'
import { PlaylistSorter } from './components/PlaylistSorter'
import { WatchProgress } from './components/WatchProgress'
import { MediaExporter } from './components/MediaExporter'
import { AITagger } from './components/AITagger'
import { ThumbnailSelector } from './components/ThumbnailSelector'
import { RelatedMedia } from './components/RelatedMedia'
import { MediaTimeline } from './components/MediaTimeline'
import { QuickNote } from './components/QuickNote'
import { ViewModeSelector } from './components/ViewModeSelector'
import { AutoPlaylist } from './components/AutoPlaylist'
import { MediaMerger } from './components/MediaMerger'
import { MediaRotator } from './components/MediaRotator'
import { WatermarkAdder } from './components/WatermarkAdder'
import { SpeedRamp } from './components/SpeedRamp'
import { MediaQueue } from './components/MediaQueue'
import { AspectRatioSwitcher } from './components/AspectRatioSwitcher'
import { QRCodeSVG } from 'qrcode.react'
import {
  Library,
  Home,
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
  ArrowUp,
  ArrowDown,
  Sparkles,
  Info,
  Crown,
  Zap,
  Cpu,
  Maximize2,
  Minimize2,
  EyeOff,
  Check,
  Tag,
  MessageSquare,
  Type,
  Image as ImageIcon,
  Brain,
  Download,
  AlertCircle,
  FileText,
  Shield,
  CheckCircle2,
  XCircle,
  Loader2,
  Timer,
  HardDrive,
  Bookmark,
  GripVertical,
  Copy,
  Folder,
  Save,
  Edit2,
  HelpCircle,
  FolderPlus,
  Github,
  MessageCircle,
  Code,
  Palette,
  Keyboard,
  Wand2,
  Command,
  MoreHorizontal,
  ScanLine,
  Tags,
  FileSearch,
  Ban,
  Dice5,
  Tv,
  AlertTriangle,
  Clapperboard,
  Link,
  Clipboard,
  FolderOpen,
  Wand,
  Layers,
  Film,
  Music,
  Crop,
  RotateCw,
  Scissors,
  Grid3X3,
  Calendar,
  ListVideo,
  Activity,
  PenTool,
  Sliders,
  Columns,
  Link2
} from 'lucide-react'
import { playClimaxForType } from './utils/soundPlayer'
import vaultLogo from './assets/vault-logo.png'

// CRT Overlay assets
import tvBorderSvg from './assets/overlays/tv-border.svg'
import thumbnailLoadingGif from './assets/overlays/thumbnail-loading.gif'
import glitchTv1 from './assets/overlays/glitch-tv-1.gif'
import glitchTv2 from './assets/overlays/glitch-tv-2.gif'
import glitchTv3 from './assets/overlays/glitch-tv-3.gif'

// Available CRT glitch GIF overlays
const CRT_GLITCH_GIFS = [glitchTv1, glitchTv2, glitchTv3]

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

// API result type helper - handles both array and { items: T[] } responses
type ApiListResult<T> = T[] | { items?: T[]; media?: T[] }

// Extract items from API response that may be array or object with items/media property
function extractItems<T>(result: ApiListResult<T>): T[] {
  if (Array.isArray(result)) return result
  return (result as { items?: T[]; media?: T[] })?.items ?? (result as { items?: T[]; media?: T[] })?.media ?? []
}

// Synchronous file path to URL conversion (for use in JSX where async isn't possible)
function toFileUrl(path: string): string {
  if (!path) return ''
  if (path.startsWith('file://')) return path
  if (path.startsWith('blob:')) return path
  // Convert Windows path to file URL
  return `file:///${path.replace(/\\/g, '/')}`
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
                  onClick={(e) => { e.stopPropagation(); removeTask(task.id) }}
                  className="p-1 hover:bg-white/10 rounded transition"
                  aria-label="Dismiss completed task"
                  title="Dismiss"
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

//
// TOAST NOTIFICATION SYSTEM - Global toast messages
//
type ToastType = 'success' | 'error' | 'info' | 'warning'
type Toast = {
  id: string
  type: ToastType
  message: string
  duration?: number
}

const ToastContext = React.createContext<{
  toasts: Toast[]
  showToast: (type: ToastType, message: string, duration?: number) => void
  dismissToast: (id: string) => void
}>({
  toasts: [],
  showToast: () => {},
  dismissToast: () => {}
})

export function useToast() {
  return React.useContext(ToastContext)
}

function ToastContainer() {
  const { toasts, dismissToast } = useToast()

  if (toasts.length === 0) return null

  const getToastStyles = (type: ToastType) => {
    switch (type) {
      case 'success': return 'bg-green-500/90 border-green-400'
      case 'error': return 'bg-red-500/90 border-red-400'
      case 'warning': return 'bg-yellow-500/90 border-yellow-400'
      case 'info': default: return 'bg-blue-500/90 border-blue-400'
    }
  }

  const getToastIcon = (type: ToastType) => {
    switch (type) {
      case 'success': return <CheckCircle2 size={16} />
      case 'error': return <XCircle size={16} />
      case 'warning': return <AlertCircle size={16} />
      case 'info': default: return <Info size={16} />
    }
  }

  return (
    <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-2 pointer-events-none">
      {toasts.map(toast => (
        <div
          key={toast.id}
          className={`pointer-events-auto flex items-center gap-2 px-4 py-3 rounded-xl border backdrop-blur-sm shadow-lg text-white text-sm animate-in slide-in-from-right duration-300 ${getToastStyles(toast.type)}`}
        >
          {getToastIcon(toast.type)}
          <span className="flex-1">{toast.message}</span>
          <button
            onClick={(e) => { e.stopPropagation(); dismissToast(toast.id) }}
            className="p-1 hover:bg-white/20 rounded transition"
            aria-label="Dismiss notification"
            title="Dismiss"
          >
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  )
}

//
// CONTEXT MENU - Right-click menu for media items
//
type ContextMenuState = {
  visible: boolean
  x: number
  y: number
  mediaId: string | null
  mediaPath: string | null
  mediaType: 'video' | 'image' | 'gif' | null
  mediaData?: MediaRow | null  // Full media object for info panel
}

const ContextMenuContext = React.createContext<{
  contextMenu: ContextMenuState
  showContextMenu: (media: MediaRow, x: number, y: number) => void
  hideContextMenu: () => void
}>({
  contextMenu: { visible: false, x: 0, y: 0, mediaId: null, mediaPath: null, mediaType: null, mediaData: null },
  showContextMenu: () => {},
  hideContextMenu: () => {}
})

export function useContextMenu() {
  return React.useContext(ContextMenuContext)
}

function ContextMenuOverlay({ onAddToPlaylist, onViewInfo }: { onAddToPlaylist?: (mediaId: string) => void; onViewInfo?: (media: MediaRow) => void }) {
  const { contextMenu, hideContextMenu } = useContextMenu()
  const { showToast } = useToast()
  const menuRef = React.useRef<HTMLDivElement>(null)

  // Close on click outside
  React.useEffect(() => {
    if (!contextMenu.visible) return

    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        hideContextMenu()
      }
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') hideContextMenu()
    }

    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [contextMenu.visible, hideContextMenu])

  if (!contextMenu.visible || !contextMenu.mediaId) return null

  // Adjust position to stay in viewport
  const menuWidth = 200
  const menuHeight = 280
  let x = contextMenu.x
  let y = contextMenu.y

  if (x + menuWidth > window.innerWidth) x = window.innerWidth - menuWidth - 10
  if (y + menuHeight > window.innerHeight) y = window.innerHeight - menuHeight - 10

  const menuItems = [
    {
      label: 'View Info',
      icon: <Info size={14} />,
      action: () => {
        if (contextMenu.mediaData && onViewInfo) {
          onViewInfo(contextMenu.mediaData)
        }
        hideContextMenu()
      }
    },
    {
      label: 'Add to Playlist',
      icon: <Plus size={14} />,
      action: () => {
        if (contextMenu.mediaId && onAddToPlaylist) {
          onAddToPlaylist(contextMenu.mediaId)
        }
        hideContextMenu()
      }
    },
    {
      label: 'Add to Watch Later',
      icon: <Clock size={14} />,
      action: async () => {
        if (contextMenu.mediaId) {
          try {
            await window.api.invoke('watchLater:add', contextMenu.mediaId)
            showToast('success', 'Added to Watch Later')
          } catch (e) {
            showToast('error', 'Failed to add to Watch Later')
          }
        }
        hideContextMenu()
      }
    },
    {
      label: 'Cast to TV',
      icon: <Tv size={14} />,
      action: async () => {
        if (contextMenu.mediaId && contextMenu.mediaData?.type === 'video' && contextMenu.mediaData?.path) {
          try {
            // Check if we have devices, start discovery if not
            const devices = await window.api.dlna?.getDevices?.() || []
            if (devices.length === 0) {
              await window.api.dlna?.startDiscovery?.()
              showToast('info', 'Scanning for TV devices...')
              // Wait a bit for devices
              await new Promise(r => setTimeout(r, 3000))
            }
            const updatedDevices = await window.api.dlna?.getDevices?.() || []
            if (updatedDevices.length === 0) {
              showToast('error', 'No TV devices found. Make sure your TV is on the same network.')
              return
            }
            // Cast to first device (or show picker in future)
            const device = updatedDevices[0]
            const result = await window.api.dlna?.cast?.(device.id, contextMenu.mediaData.path, {
              title: contextMenu.mediaData.filename || 'Vault Video',
              type: 'video',
              autoplay: true
            })
            if (result?.success) {
              showToast('success', `Casting to ${device.name}`)
            } else {
              showToast('error', result?.error || 'Failed to cast')
            }
          } catch (e: any) {
            showToast('error', e.message || 'Failed to cast')
          }
        } else {
          showToast('info', 'Cast is only available for videos')
        }
        hideContextMenu()
      }
    },
    {
      label: 'Add to TV Queue',
      icon: <Plus size={14} />,
      action: async () => {
        if (contextMenu.mediaId && contextMenu.mediaData?.type === 'video' && contextMenu.mediaData?.path) {
          try {
            await window.api.dlna?.addToQueue?.({
              mediaId: contextMenu.mediaId,
              path: contextMenu.mediaData.path,
              title: contextMenu.mediaData.filename || 'Vault Video',
              duration: contextMenu.mediaData.durationSec || undefined
            })
            showToast('success', 'Added to TV queue')
          } catch (e: any) {
            showToast('error', e.message || 'Failed to add to queue')
          }
        } else {
          showToast('info', 'TV queue is only available for videos')
        }
        hideContextMenu()
      }
    },
    {
      label: 'Quick Bookmark',
      icon: <Bookmark size={14} />,
      action: async () => {
        if (contextMenu.mediaId && contextMenu.mediaData?.type === 'video') {
          try {
            await window.api.invoke('bookmarks:quickAdd', contextMenu.mediaId, 0)
            showToast('success', 'Bookmarked at start')
          } catch (e) {
            showToast('error', 'Failed to add bookmark')
          }
        } else {
          showToast('info', 'Bookmarks are only available for videos')
        }
        hideContextMenu()
      }
    },
    {
      label: 'Add Note',
      icon: <MessageSquare size={14} />,
      action: async () => {
        if (contextMenu.mediaId) {
          const note = window.prompt('Enter a note for this media:')
          if (note && note.trim()) {
            try {
              await window.api.invoke('notes:add', contextMenu.mediaId, note.trim())
              showToast('success', 'Note added')
            } catch (e) {
              showToast('error', 'Failed to add note')
            }
          }
        }
        hideContextMenu()
      }
    },
    {
      label: 'Open File Location',
      icon: <HardDrive size={14} />,
      action: async () => {
        if (contextMenu.mediaPath) {
          await window.api.shell?.showItemInFolder?.(contextMenu.mediaPath)
        }
        hideContextMenu()
      }
    },
    {
      label: 'Copy Path',
      icon: <FileText size={14} />,
      action: async () => {
        if (contextMenu.mediaPath) {
          await navigator.clipboard.writeText(contextMenu.mediaPath)
          showToast('success', 'Path copied to clipboard')
        }
        hideContextMenu()
      }
    },
    {
      label: 'Rename',
      icon: <Edit2 size={14} />,
      action: async () => {
        if (contextMenu.mediaId && contextMenu.mediaData?.filename) {
          const currentName = contextMenu.mediaData.filename
          const newName = window.prompt('Enter new filename:', currentName)
          if (newName && newName.trim() && newName !== currentName) {
            try {
              await window.api.media?.rename?.(contextMenu.mediaId, newName.trim())
              showToast('success', 'Renamed successfully')
              window.dispatchEvent(new CustomEvent('media-renamed', { detail: { mediaId: contextMenu.mediaId } }))
            } catch (e: any) {
              showToast('error', e?.message || 'Failed to rename')
            }
          }
        }
        hideContextMenu()
      }
    },
    { type: 'separator' as const },
    {
      label: 'Rate 5 Stars',
      icon: <Star size={14} />,
      action: async () => {
        if (contextMenu.mediaId) {
          await window.api.media?.setRating?.(contextMenu.mediaId, 5)
          // Update daily challenge progress for rating items
          window.api.challenges?.updateProgress?.('rate_items', 1)
          showToast('success', 'Rated 5 stars')
        }
        hideContextMenu()
      }
    },
    {
      label: 'Toggle Favorite',
      icon: <Heart size={14} />,
      action: async () => {
        if (contextMenu.mediaId) {
          // Toggle favorite (rating 5 = favorite)
          const stats = await window.api.media?.getStats?.(contextMenu.mediaId)
          const currentRating = stats?.rating ?? 0
          const newRating = currentRating === 5 ? 0 : 5
          await window.api.media?.setRating?.(contextMenu.mediaId, newRating)
          // Update daily challenge progress for rating items
          window.api.challenges?.updateProgress?.('rate_items', 1)
          showToast('success', newRating === 5 ? 'Added to favorites' : 'Removed from favorites')
        }
        hideContextMenu()
      }
    },
    {
      label: 'Queue for AI Analysis',
      icon: <Sparkles size={14} />,
      action: async () => {
        if (contextMenu.mediaId && contextMenu.mediaData?.type === 'video') {
          try {
            await window.api.ai?.queueForAnalysis?.([contextMenu.mediaId])
            showToast('success', 'Added to AI analysis queue')
          } catch (e) {
            showToast('error', 'Failed to queue for analysis')
          }
        } else {
          showToast('info', 'AI analysis is only available for videos')
        }
        hideContextMenu()
      }
    },
    {
      label: 'Add to Blacklist',
      icon: <Ban size={14} />,
      action: async () => {
        if (contextMenu.mediaId) {
          try {
            const settings = await window.api.settings.get()
            const blacklist = settings?.blacklist ?? { enabled: true, tags: [], mediaIds: [] }
            if (!blacklist.mediaIds.includes(contextMenu.mediaId)) {
              blacklist.mediaIds.push(contextMenu.mediaId)
              await window.api.settings.update?.({ blacklist })
              showToast('success', 'Added to blacklist')
              // Trigger refresh
              window.dispatchEvent(new CustomEvent('media-blacklisted', { detail: { mediaId: contextMenu.mediaId } }))
            } else {
              showToast('info', 'Already in blacklist')
            }
          } catch (e) {
            showToast('error', 'Failed to add to blacklist')
          }
        }
        hideContextMenu()
      }
    },
    { type: 'separator' as const },
    {
      label: 'Edit Metadata',
      icon: <Edit2 size={14} />,
      action: () => {
        if (contextMenu.mediaData) {
          window.dispatchEvent(new CustomEvent('vault-open-tool', { detail: { tool: 'metadata', media: contextMenu.mediaData } }))
        }
        hideContextMenu()
      }
    },
    {
      label: 'AI Auto-Tag',
      icon: <Sparkles size={14} />,
      action: () => {
        if (contextMenu.mediaData) {
          window.dispatchEvent(new CustomEvent('vault-open-tool', { detail: { tool: 'ai-tagger', media: contextMenu.mediaData } }))
        }
        hideContextMenu()
      }
    },
    {
      label: 'Scene Detection',
      icon: <Zap size={14} />,
      action: () => {
        if (contextMenu.mediaData?.type === 'video') {
          window.dispatchEvent(new CustomEvent('vault-open-tool', { detail: { tool: 'scene-detector', media: contextMenu.mediaData } }))
        } else {
          showToast('info', 'Scene detection is only available for videos')
        }
        hideContextMenu()
      }
    },
    {
      label: 'Extract Keyframes',
      icon: <ImageIcon size={14} />,
      action: () => {
        if (contextMenu.mediaData?.type === 'video') {
          window.dispatchEvent(new CustomEvent('vault-open-tool', { detail: { tool: 'keyframe', media: contextMenu.mediaData } }))
        } else {
          showToast('info', 'Keyframe extraction is only available for videos')
        }
        hideContextMenu()
      }
    },
    {
      label: 'Export / Convert',
      icon: <Download size={14} />,
      action: () => {
        if (contextMenu.mediaData) {
          window.dispatchEvent(new CustomEvent('vault-open-tool', { detail: { tool: 'export', media: contextMenu.mediaData } }))
        }
        hideContextMenu()
      }
    },
    { type: 'separator' as const },
    {
      label: 'Delete from Library',
      icon: <Trash2 size={14} />,
      danger: true,
      action: async () => {
        if (contextMenu.mediaId) {
          const confirmed = window.confirm('Remove this item from your library? (File will not be deleted from disk)')
          if (confirmed) {
            const result = await window.api.media?.delete?.(contextMenu.mediaId)
            if (result?.success) {
              showToast('info', 'Removed from library (Ctrl+Z to undo)', 5000)
              // Trigger refresh
              window.dispatchEvent(new CustomEvent('media-deleted', { detail: { mediaId: contextMenu.mediaId } }))
            } else {
              showToast('error', result?.error || 'Failed to remove from library')
            }
          }
        }
        hideContextMenu()
      }
    }
  ]

  return (
    <div
      ref={menuRef}
      className="fixed z-[9999] bg-[var(--panel)] border border-[var(--border)] rounded-xl shadow-2xl overflow-hidden backdrop-blur-xl animate-in fade-in zoom-in-95 duration-150"
      style={{ left: x, top: y, minWidth: menuWidth }}
    >
      <div className="py-1">
        {menuItems.map((item, i) => {
          if (item.type === 'separator') {
            return <div key={i} className="my-1 border-t border-[var(--border)]" />
          }
          return (
            <button
              key={i}
              onClick={async (e) => {
                e.stopPropagation()
                try {
                  await item.action?.()
                } catch (err) {
                  console.error('[ContextMenu] Action failed:', err)
                }
              }}
              className={`w-full px-3 py-2 text-left text-sm flex items-center gap-2 transition ${
                item.danger
                  ? 'text-red-400 hover:bg-red-500/20'
                  : 'text-white/90 hover:bg-white/10'
              }`}
            >
              {item.icon}
              <span>{item.label}</span>
            </button>
          )
        })}
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

type TagRow = { id: string; name: string; count?: number }

type MarkerRow = {
  id: string
  mediaId: string
  timeSec: number
  title: string
}

type PlaylistRow = { id: string; name: string; createdAt?: number; isSmart?: number }

type MediaStatsRow = {
  mediaId: string
  rating?: number | null
  viewCount?: number
  oCount?: number
  lastViewedAt?: number | null
  progressSec?: number | null
}

type CaptionPreset = {
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
type GoonWordPackId = 'praise' | 'humiliation' | 'insult' | 'kink' | 'goon' | 'mommy' | 'brat' | 'pervert' | 'encouragement' | 'dirty' | 'denial' | 'worship' | 'seduction'

interface GoonWordsSettings {
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

interface VisualEffectsSettings {
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

interface GoonStats {
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

interface SoundSettings {
  enabled: boolean
  volume: number
  uiSoundsEnabled: boolean
  voiceSoundsEnabled: boolean
  ambienceEnabled: boolean
  ambienceTrack: 'none' | 'soft_moans' | 'breathing' | 'heartbeat' | 'rain' | 'custom'
  ambienceVolume: number
}

// Session analytics returned from sessionHistory:getAnalytics
type SessionAnalytics = {
  totalSessions: number
  totalDuration: number
  avgSessionDuration: number
  avgMediaPerSession: number
  mostActiveHour: number
  mostActiveDay: string
}

// Result from media.optimizeNames API
type OptimizeNamesResult = {
  success: boolean
  optimized: number
  skipped: number
  failed: number
  error?: string
}

type VaultSettings = {
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
      bloomIntensity?: number
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

declare global {
  interface Window {
    api: any
  }
}

function cn(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(' ')
}

// Animated counter component for visual interest
function AnimatedCounter({ value, duration = 1000, className = '' }: { value: number; duration?: number; className?: string }) {
  const [displayValue, setDisplayValue] = useState(0)
  const frameRef = useRef<number>(0)
  const prevValueRef = useRef(0)

  useEffect(() => {
    const startValue = prevValueRef.current
    const diff = value - startValue

    if (diff === 0) return

    const startTime = performance.now()

    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime
      const progress = Math.min(elapsed / duration, 1)

      // Ease out cubic for smooth deceleration
      const eased = 1 - Math.pow(1 - progress, 3)
      const current = Math.floor(startValue + diff * eased)

      setDisplayValue(current)

      if (progress < 1) {
        frameRef.current = requestAnimationFrame(animate)
      } else {
        prevValueRef.current = value
      }
    }

    frameRef.current = requestAnimationFrame(animate)

    return () => {
      if (frameRef.current) {
        cancelAnimationFrame(frameRef.current)
      }
    }
  }, [value, duration])

  return <span className={cn('count-up', className)}>{displayValue.toLocaleString()}</span>
}

// Use themes from our theme system
const NAV = [
  { id: 'home', name: 'Home', tip: 'Dashboard with continue watching and recommendations' },
  { id: 'library', name: 'Library', tip: 'Browse and manage your media collection' },
  { id: 'goonwall', name: 'Goon Wall', tip: 'Multi-tile video wall with immersive features' },
  { id: 'captions', name: 'Brainwash', tip: 'Add captions and filters to images' },
  { id: 'pmv', name: 'PMV Editor', tip: 'Create music video compilations with beat sync' },
  { id: 'ai', name: 'AI Tools', tip: 'AI-powered tagging and analysis' },
  { id: 'feed', name: 'Feed', tip: 'Endless scrolling feed of your media' },
  { id: 'playlists', name: 'Sessions', tip: 'Create and manage playlists' },
  { id: 'downloads', name: 'Downloads', tip: 'Download videos from URLs' },
  { id: 'stats', name: 'Stats', tip: 'View your usage statistics and achievements' },
  { id: 'settings', name: 'Settings', tip: 'Customize app appearance and behavior' },
  { id: 'about', name: 'About', tip: 'App info, version, and credits' }
] as const

// Map nav IDs to Lucide icons
const NavIcon: React.FC<{ id: string; active?: boolean }> = ({ id, active }) => {
  const iconProps = { size: 18, strokeWidth: active ? 2 : 1.5 }
  switch (id) {
    case 'home': return <Home {...iconProps} />
    case 'library': return <Library {...iconProps} />
    case 'goonwall': return <LayoutGrid {...iconProps} />
    case 'captions': return <MessageSquare {...iconProps} />
    case 'pmv': return <Clapperboard {...iconProps} />
    case 'ai': return <Brain {...iconProps} />
    case 'feed': return <Flame {...iconProps} />
    case 'playlists': return <ListMusic {...iconProps} />
    case 'downloads': return <Download {...iconProps} />
    case 'stats': return <BarChart3 {...iconProps} />
    case 'settings': return <Settings {...iconProps} />
    case 'about': return <Info {...iconProps} />
    default: return null
  }
}

type NavId = (typeof NAV)[number]['id']

export default function App() {
  const [page, setPage] = useState<NavId>('home')
  const [prevPage, setPrevPage] = useState<NavId>('home')
  const [pageTransition, setPageTransition] = useState<'enter' | 'exit' | null>(null)
  const [fabOpen, setFabOpen] = useState(false)
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
  const [crtCurveEnabled, setCrtCurveEnabled] = useState(false) // CRT curved screen effect
  const [crtIntensity, setCrtIntensity] = useState(5) // CRT curve intensity
  const [crtRgbSubpixels, setCrtRgbSubpixels] = useState(true) // RGB subpixel simulation
  const [crtChromaticAberration, setCrtChromaticAberration] = useState(true) // Color separation at edges
  const [crtScreenFlicker, setCrtScreenFlicker] = useState(true) // Random brightness flicker
  const [crtGlitchGifIndex, setCrtGlitchGifIndex] = useState<number | null>(null) // Active CRT glitch GIF (null = none)

  // Standalone TV Border with Glass
  const [tvBorderEnabled, setTvBorderEnabled] = useState(false)
  const [tvBorderGlass, setTvBorderGlass] = useState(true)
  const [tvBorderGlassOpacity, setTvBorderGlassOpacity] = useState(0.15)
  const [tvBorderPadding, setTvBorderPadding] = useState(3)
  const [tvBorderStyle, setTvBorderStyle] = useState<'classic' | 'modern' | 'retro' | 'minimal'>('classic')

  // Pip-Boy / Fallout style overlay
  const [pipBoyEnabled, setPipBoyEnabled] = useState(false)
  const [pipBoyColor, setPipBoyColor] = useState<'green' | 'amber' | 'blue' | 'white'>('green')
  const [pipBoyIntensity, setPipBoyIntensity] = useState(5)

  // New ambient overlays
  const [heartsEnabled, setHeartsEnabled] = useState(false) // Floating hearts
  const [rainEnabled, setRainEnabled] = useState(false) // Rain on glass
  const [glitchEnabled, setGlitchEnabled] = useState(false) // Glitch/RGB split
  const [bubblesEnabled, setBubblesEnabled] = useState(false) // Floating bubbles
  const [matrixEnabled, setMatrixEnabled] = useState(false) // Matrix rain
  const [confettiEnabled, setConfettiEnabled] = useState(false) // Confetti particles

  // Keyboard shortcuts help modal
  const [showShortcutsHelp, setShowShortcutsHelp] = useState(false)

  // Quick Actions panel state
  const [quickActionsOpen, setQuickActionsOpen] = useState(false)
  const [showKeybindsEditor, setShowKeybindsEditor] = useState(false)

  // Untagged media count for AI badge
  const [untaggedCount, setUntaggedCount] = useState(0)

  // Command Palette (Ctrl+K) - quick actions search
  const [showCommandPalette, setShowCommandPalette] = useState(false)
  const [commandSearch, setCommandSearch] = useState('')
  const commandInputRef = useRef<HTMLInputElement>(null)

  // Welcome tutorial modal for first-time users
  const [showWelcomeTutorial, setShowWelcomeTutorial] = useState(false)
  const [welcomeStep, setWelcomeStep] = useState(0)

  // Zen Mode - hide all UI for distraction-free viewing
  const [zenMode, setZenMode] = useState(false)
  const [zenModeEdgeActive, setZenModeEdgeActive] = useState(false)

  // Media Info Modal - show detailed metadata about a media item
  const [infoModalMedia, setInfoModalMedia] = useState<MediaRow | null>(null)

  // Global AI Processing Status - shows indicator in sidebar when AI is working
  const [globalAiStatus, setGlobalAiStatus] = useState<{
    isRunning: boolean
    pending: number
    processing: number
    completed: number
    total: number
  } | null>(null)

  // Playlist picker state (for context menu "Add to Playlist")
  const [showPlaylistPicker, setShowPlaylistPicker] = useState(false)
  const [bulkPlaylists, setBulkPlaylists] = useState<PlaylistRow[]>([])
  const [playlistPickerMediaId, setPlaylistPickerMediaId] = useState<string | null>(null)

  // Toast context for global notifications
  const { showToast: globalShowToast } = useToast()

  // Global keyboard shortcuts (? for help, Z for zen mode, Ctrl+Z for undo, Ctrl+K for command palette)
  useEffect(() => {
    const handleGlobalKeys = async (e: KeyboardEvent) => {
      // Ctrl+K opens command palette (works even in inputs)
      if (e.key === 'k' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault()
        setShowCommandPalette(prev => {
          if (!prev) window.api.goon?.trackCommandPalette?.() // Track for achievements
          return !prev
        })
        setCommandSearch('')
        return
      }

      // Don't trigger other shortcuts if typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return

      if (e.key === '?' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault()
        setShowShortcutsHelp(prev => !prev)
      }
      if (e.key === 'Escape') {
        if (showCommandPalette) {
          setShowCommandPalette(false)
        } else if (zenMode) {
          setZenMode(false)
        } else if (showShortcutsHelp) {
          setShowShortcutsHelp(false)
        }
      }
      // Z key toggles Zen Mode (without Ctrl)
      if ((e.key === 'z' || e.key === 'Z') && !e.ctrlKey && !e.metaKey) {
        e.preventDefault()
        setZenMode(prev => !prev)
      }
      // D key opens URL Downloader (without Ctrl)
      if ((e.key === 'd' || e.key === 'D') && !e.ctrlKey && !e.metaKey) {
        e.preventDefault()
        window.dispatchEvent(new CustomEvent('vault-open-url-downloader'))
      }
      // Ctrl+Z for undo delete
      if (e.key === 'z' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault()
        try {
          const result = await window.api.media?.undoDelete?.()
          if (result?.success) {
            globalShowToast('success', 'Restored deleted item')
            window.dispatchEvent(new CustomEvent('vault:changed'))
          } else if (result?.error === 'Nothing to undo') {
            globalShowToast('info', 'Nothing to undo')
          } else {
            globalShowToast('error', result?.error || 'Failed to undo')
          }
        } catch (err) {
          console.error('[Undo] Error:', err)
        }
      }
    }
    window.addEventListener('keydown', handleGlobalKeys)
    return () => window.removeEventListener('keydown', handleGlobalKeys)
  }, [showShortcutsHelp, showCommandPalette, zenMode, globalShowToast])

  // Zen mode edge detection - show UI when mouse near edges (throttled)
  useEffect(() => {
    if (!zenMode) {
      setZenModeEdgeActive(false)
      return
    }

    let lastRun = 0
    const throttleMs = 50 // Run at most every 50ms

    const handleMouseMove = (e: MouseEvent) => {
      const now = Date.now()
      if (now - lastRun < throttleMs) return
      lastRun = now

      const edgeThreshold = 60 // pixels from edge
      const nearEdge =
        e.clientX < edgeThreshold ||
        e.clientX > window.innerWidth - edgeThreshold ||
        e.clientY < edgeThreshold ||
        e.clientY > window.innerHeight - edgeThreshold
      setZenModeEdgeActive(nearEdge)
    }

    window.addEventListener('mousemove', handleMouseMove)
    return () => window.removeEventListener('mousemove', handleMouseMove)
  }, [zenMode])

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

  // Toast notification state with proper timer cleanup
  const [toasts, setToasts] = useState<Toast[]>([])
  const toastTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  const showToast = useCallback((type: ToastType, message: string, duration: number = 4000) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2)}`
    setToasts(prev => [...prev, { id, type, message, duration }])
    // Auto-dismiss with tracked timer
    if (duration > 0) {
      const timer = setTimeout(() => {
        toastTimersRef.current.delete(id)
        setToasts(prev => prev.filter(t => t.id !== id))
      }, duration)
      toastTimersRef.current.set(id, timer)
    }
  }, [])

  const dismissToast = useCallback((id: string) => {
    // Clear timer when manually dismissed
    const timer = toastTimersRef.current.get(id)
    if (timer) {
      clearTimeout(timer)
      toastTimersRef.current.delete(id)
    }
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  const toastContextValue = useMemo(() => ({
    toasts,
    showToast,
    dismissToast
  }), [toasts, showToast, dismissToast])

  // Context menu state
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({
    visible: false,
    x: 0,
    y: 0,
    mediaId: null,
    mediaPath: null,
    mediaType: null,
    mediaData: null
  })

  const showContextMenu = useCallback((media: MediaRow, x: number, y: number) => {
    setContextMenu({
      visible: true,
      x,
      y,
      mediaId: media.id,
      mediaPath: media.path,
      mediaType: media.type,
      mediaData: media
    })
  }, [])

  const hideContextMenu = useCallback(() => {
    setContextMenu(prev => ({ ...prev, visible: false }))
  }, [])

  const contextMenuValue = useMemo(() => ({
    contextMenu,
    showContextMenu,
    hideContextMenu
  }), [contextMenu, showContextMenu, hideContextMenu])

  // Animation hooks for visual effects
  const anime = useAnime()
  const confetti = useConfetti()
  useUiSounds(settings?.uiSoundsEnabled ?? true)

  // Ambient audio playback
  useAmbienceAudio(settings?.sound ? {
    enabled: settings.sound.ambienceEnabled ?? false,
    track: settings.sound.ambienceTrack ?? 'none',
    volume: settings.sound.ambienceVolume ?? 0.3
  } : null)

  const mainContentRef = useRef<HTMLElement>(null)
  const prevPageRef = useRef<string>(page)

  // Page transition animation - Opera-style slide + fade
  useEffect(() => {
    if (prevPageRef.current !== page && mainContentRef.current) {
      // Determine slide direction based on nav order
      const navOrder = ['library', 'goonwall', 'feed', 'playlists', 'stats', 'settings', 'about']
      const prevIndex = navOrder.indexOf(prevPageRef.current)
      const currentIndex = navOrder.indexOf(page)
      const slideDirection = currentIndex > prevIndex ? 'left' : 'right'

      // Smooth slide + fade transition
      anime.animate(mainContentRef.current, {
        opacity: [0, 1],
        translateX: [slideDirection === 'left' ? 30 : -30, 0],
        duration: 280,
        ease: 'outQuart'
      })
      prevPageRef.current = page
    }
  }, [page, anime])

  // Activate session when on GoonWall (for automatic heat level tracking)
  useEffect(() => {
    setSessionActive(page === 'goonwall')
  }, [page])

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

  // Aggressive video/audio cleanup helper - ensures all media stops immediately
  const stopAllMediaPlayback = useCallback(() => {
    // Stop all video elements - helper function for multiple passes
    const stopVideos = () => {
      document.querySelectorAll('video').forEach(v => {
        try {
          v.pause()
          v.muted = true
          v.volume = 0
          v.currentTime = 0
          v.removeAttribute('src')
          v.srcObject = null
          v.load()
        } catch (e) {
          // Ignore errors
        }
      })
    }

    // Stop all audio elements
    const stopAudios = () => {
      document.querySelectorAll('audio').forEach(a => {
        try {
          a.pause()
          a.muted = true
          a.volume = 0
          a.removeAttribute('src')
          a.srcObject = null
          a.load()
        } catch (e) {
          // Ignore errors
        }
      })
    }

    // Run immediately
    stopVideos()
    stopAudios()

    // Reset global video state
    videoPool.releaseAll()
    resetGoonSlots()

    // Run again after short delays to catch any stragglers created during cleanup
    setTimeout(() => { stopVideos(); stopAudios(); }, 100)
    setTimeout(() => { stopVideos(); stopAudios(); }, 500)
  }, [])

  // Stop all media when browser tab becomes hidden (user switches tabs or minimizes)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden && page === 'goonwall') {
        // Mute all videos when tab is hidden to stop audio
        document.querySelectorAll('video').forEach(v => {
          try {
            v.muted = true
            v.volume = 0
          } catch (e) {
            // Ignore
          }
        })
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [page])

  // Smooth page navigation with transition
  const navigateTo = useCallback((newPage: NavId) => {
    if (newPage === page) return

    // If leaving GoonWall, immediately stop all video/audio
    if (page === 'goonwall') {
      stopAllMediaPlayback()
    }

    setPrevPage(page)
    setPageTransition('exit')
    setTimeout(() => {
      setPage(newPage)
      // Second cleanup pass after page change to catch any stragglers
      if (page === 'goonwall') {
        stopAllMediaPlayback()
      }
      setPageTransition('enter')
      setTimeout(() => setPageTransition(null), 250)
    }, 150)
  }, [page, stopAllMediaPlayback])

  // Random climax trigger effect - use ref to properly track timer across recursive scheduling
  const climaxTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    // Clear any existing timer on re-run or disable
    if (climaxTimerRef.current) {
      clearTimeout(climaxTimerRef.current)
      climaxTimerRef.current = null
    }

    if (!randomClimaxEnabled) return

    // Random interval between 30-90 seconds based on heat level
    const getRandomInterval = () => {
      const baseMin = 60000 - (heatLevel * 3000) // 60s at heat 0, 30s at heat 10
      const baseMax = 120000 - (heatLevel * 5000) // 120s at heat 0, 70s at heat 10
      return Math.random() * (baseMax - baseMin) + baseMin
    }

    const scheduleNextClimax = () => {
      const interval = getRandomInterval()
      climaxTimerRef.current = setTimeout(() => {
        // Randomly pick climax type
        const types: Array<'cum' | 'squirt' | 'orgasm'> = ['cum', 'squirt', 'orgasm']
        const randomType = types[Math.floor(Math.random() * types.length)]
        triggerClimax(randomType)
        // Schedule next one
        scheduleNextClimax()
      }, interval)
    }

    scheduleNextClimax()
    return () => {
      if (climaxTimerRef.current) {
        clearTimeout(climaxTimerRef.current)
        climaxTimerRef.current = null
      }
    }
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

    // Subscribe to settings changes so UI updates when settings are modified
    const unsubSettings = window.api.events?.onSettingsChanged?.((newSettings: any) => {
      if (alive) setSettings(newSettings)
    })

    return () => {
      alive = false
      unsubSettings?.()
    }
  }, [])

  // Fetch untagged media count for AI badge
  useEffect(() => {
    const fetchUntaggedCount = async () => {
      try {
        const result = await window.api.invoke('ai:get-untagged-count')
        setUntaggedCount(typeof result === 'number' ? result : 0)
      } catch {
        // API might not exist, that's ok
      }
    }
    fetchUntaggedCount()
    // Refresh every 30 seconds
    const interval = setInterval(fetchUntaggedCount, 30000)
    return () => clearInterval(interval)
  }, [])

  // Apply theme using our theme system
  useEffect(() => {
    const themeId = settings?.appearance?.themeId ?? 'obsidian'
    applyThemeCSS(themeId as ThemeId)
  }, [settings?.appearance?.themeId])

  // Apply font style from settings
  useEffect(() => {
    const fontStyle = settings?.appearance?.fontStyle ?? 'default'
    document.documentElement.setAttribute('data-font-style', fontStyle)
  }, [settings?.appearance?.fontStyle])

  // Sync visual effects from settings
  useEffect(() => {
    const ve = settings?.visualEffects
    if (ve) {
      if (ve.enabled !== undefined) setVisualEffectsEnabled(ve.enabled)
      if (ve.sparkles !== undefined) setSparklesEnabled(ve.sparkles)
      if (ve.bokeh !== undefined) setBokehEnabled(ve.bokeh)
      if (ve.starfield !== undefined) setStarfieldEnabled(ve.starfield)
      if (ve.filmGrain !== undefined) setFilmGrainEnabled(ve.filmGrain)
      if (ve.dreamyHaze !== undefined) setDreamyHazeEnabled(ve.dreamyHaze)
      if (ve.crtCurve !== undefined) setCrtCurveEnabled(ve.crtCurve)
      if (ve.crtIntensity !== undefined) setCrtIntensity(ve.crtIntensity)
      if (ve.crtRgbSubpixels !== undefined) setCrtRgbSubpixels(ve.crtRgbSubpixels)
      if (ve.crtChromaticAberration !== undefined) setCrtChromaticAberration(ve.crtChromaticAberration)
      if (ve.crtScreenFlicker !== undefined) setCrtScreenFlicker(ve.crtScreenFlicker)
      if (ve.crtGlitchGif !== undefined) setCrtGlitchGifIndex(ve.crtGlitchGif)
      if (ve.heatLevel !== undefined) setAmbientHeatLevel(ve.heatLevel)
      if (ve.goonWords?.enabled !== undefined) setGoonModeEnabled(ve.goonWords.enabled)
      // New ambient overlays
      if (ve.hearts !== undefined) setHeartsEnabled(ve.hearts)
      if (ve.rain !== undefined) setRainEnabled(ve.rain)
      if (ve.glitch !== undefined) setGlitchEnabled(ve.glitch)
      if (ve.bubbles !== undefined) setBubblesEnabled(ve.bubbles)
      if (ve.matrix !== undefined) setMatrixEnabled(ve.matrix)
      if (ve.confetti !== undefined) setConfettiEnabled(ve.confetti)
    }
  }, [settings?.visualEffects])

  // Sync goonwall settings (randomClimax, countdownDuration)
  useEffect(() => {
    const gw = settings?.goonwall
    if (gw) {
      if (gw.randomClimax !== undefined) setRandomClimaxEnabled(gw.randomClimax)
    }
  }, [settings?.goonwall])

  // Show welcome tutorial for first-time users
  useEffect(() => {
    if (settings && !settings.hasSeenWelcome) {
      setShowWelcomeTutorial(true)
      setWelcomeStep(0)
    }
  }, [settings?.hasSeenWelcome])

  // Global AI processing status - poll every 5 seconds when on any page
  useEffect(() => {
    let alive = true
    const pollAiStatus = async () => {
      try {
        const status = await window.api.ai?.getQueueStatus?.()
        if (alive && status) {
          setGlobalAiStatus({
            isRunning: status.isRunning ?? false,
            pending: status.pending ?? 0,
            processing: status.processing ?? 0,
            completed: status.completed ?? 0,
            total: status.total ?? 0
          })
        }
      } catch {
        // AI system may not be initialized yet
      }
    }
    // Initial poll
    pollAiStatus()
    // Poll every 5 seconds
    const interval = setInterval(pollAiStatus, 5000)
    // Also subscribe to real-time AI status events
    const unsubStatus = window.api.events?.onAiStatus?.((data: { status: string }) => {
      if (data.status === 'started' || data.status === 'processing') {
        pollAiStatus() // Refresh immediately when processing starts
      }
    })
    return () => {
      alive = false
      clearInterval(interval)
      unsubStatus?.()
    }
  }, [])

  // Global achievement unlock notification
  useEffect(() => {
    const unsubAchievement = window.api.events.onAchievementUnlocked?.(async (ids: string[]) => {
      try {
        // Get achievement details to show names
        const allAchievements = await window.api.goon.getAchievements()
        const unlockedNames = ids.map(id => {
          const achievement = allAchievements.find((a: Achievement) => a.id === id)
          return achievement?.name || id
        })

        // Show toast notification for each achievement
        unlockedNames.forEach((name, i) => {
          setTimeout(() => {
            showToast('success', `Achievement Unlocked: ${name}`)
          }, i * 500) // Stagger toasts
        })

        // Trigger confetti
        confetti.achievement()
      } catch (e) {
        console.error('Failed to show achievement notification:', e)
      }
    })
    return () => { unsubAchievement?.() }
  }, [showToast, confetti])

  // Streak protection - warn users when they're about to lose their streak
  const [streakWarningShown, setStreakWarningShown] = useState(false)
  useEffect(() => {
    let alive = true
    const checkStreak = async () => {
      try {
        const status = await window.api.goon?.getStreakStatus?.()
        if (!alive || !status) return

        // Show warning if streak is at risk and we haven't shown it yet this session
        if (status.atRisk && !streakWarningShown && status.currentStreak >= 3) {
          setStreakWarningShown(true)
          showToast(
            'warning',
            `Your ${status.currentStreak}-day streak is at risk! Only ${status.hoursRemaining.toFixed(1)} hours left.`
          )
        }

        // Reset the warning flag if user has had a session today (streak saved)
        if (status.hasSessionToday) {
          setStreakWarningShown(false)
        }
      } catch {
        // Streak API may not be available
      }
    }

    // Check on mount and every 30 minutes
    checkStreak()
    const interval = setInterval(checkStreak, 30 * 60 * 1000)

    return () => {
      alive = false
      clearInterval(interval)
    }
  }, [showToast, streakWarningShown])

  // Apply appearance/display settings to CSS custom properties
  useEffect(() => {
    const appearance = settings?.appearance
    if (!appearance) return
    const root = document.documentElement

    // Font size - apply as CSS variable and class
    const fontSizeMap = { small: '13px', medium: '14px', large: '16px' }
    const baseFontSize = appearance.fontSize ? fontSizeMap[appearance.fontSize] ?? '14px' : '14px'
    root.style.setProperty('--base-font-size', baseFontSize)
    root.style.fontSize = baseFontSize

    // Thumbnail size - apply as CSS variable for grid sizing
    const thumbSizeMap = { small: '160px', medium: '220px', large: '300px' }
    const thumbMinSize = appearance.thumbnailSize ? thumbSizeMap[appearance.thumbnailSize] ?? '220px' : '220px'
    root.style.setProperty('--thumb-min-size', thumbMinSize)

    // Compact mode - reduce gaps/padding
    const appWithCompact = appearance as typeof appearance & { compactMode?: boolean; accentColor?: string }
    if (appWithCompact.compactMode) {
      root.classList.add('compact-mode')
      root.style.setProperty('--gap-scale', '0.6')
      root.style.setProperty('--padding-scale', '0.7')
    } else {
      root.classList.remove('compact-mode')
      root.style.setProperty('--gap-scale', '1')
      root.style.setProperty('--padding-scale', '1')
    }

    // Animation speed - control transition duration
    const animSpeedMap = { none: '0ms', reduced: '100ms', full: '200ms' }
    const animDuration = appearance.animationSpeed ? animSpeedMap[appearance.animationSpeed] ?? '200ms' : '200ms'
    root.style.setProperty('--animation-duration', animDuration)
    if (appearance.animationSpeed === 'none') {
      root.classList.add('reduce-motion')
    } else {
      root.classList.remove('reduce-motion')
    }

    // Accent color - set CSS variable (also set --primary for theme integration)
    if (appWithCompact.accentColor) {
      root.style.setProperty('--accent-color', appWithCompact.accentColor)
      root.style.setProperty('--primary', appWithCompact.accentColor)
    }

    // Color blind mode - apply accessibility filter class
    const colorBlindModes = ['protanopia', 'deuteranopia', 'tritanopia', 'high-contrast']
    colorBlindModes.forEach(mode => root.classList.remove(`color-blind-${mode}`))
    if (appearance.colorBlindMode && appearance.colorBlindMode !== 'none') {
      root.classList.add(`color-blind-${appearance.colorBlindMode}`)
    }
  }, [settings?.appearance])

  const patchSettings = async (patch: Partial<VaultSettings>) => {
    const next = await window.api.settings.patch(patch)
    setSettings(next)
  }

  // Screen shake CSS
  const shakeStyle = screenShake > 0 ? {
    animation: `screenShake 0.1s ease-in-out infinite`,
    ['--shake-intensity' as string]: `${screenShake * 0.5}px`
  } : {}

  // Handler for context menu add to playlist
  const handleContextMenuAddToPlaylist = useCallback(async (mediaId: string) => {
    try {
      const pls = await window.api.playlists.list()
      setBulkPlaylists(pls)
      setPlaylistPickerMediaId(mediaId)
      setShowPlaylistPicker(true)
    } catch (err) {
      console.error('[ContextMenu] Failed to load playlists:', err)
    }
  }, [])

  return (
    <ToastContext.Provider value={toastContextValue}>
    <ContextMenuContext.Provider value={contextMenuValue}>
    <GlobalTaskContext.Provider value={globalTaskContextValue}>
    <div
      className="h-screen w-screen overflow-hidden"
      style={{ background: 'var(--bg)', ...shakeStyle }}
    >
      {/* Color Blind Mode SVG Filters */}
      <svg className="hidden" aria-hidden="true">
        <defs>
          {/* Protanopia filter (red-blind) */}
          <filter id="protanopia-filter">
            <feColorMatrix type="matrix" values="
              0.567, 0.433, 0,     0, 0
              0.558, 0.442, 0,     0, 0
              0,     0.242, 0.758, 0, 0
              0,     0,     0,     1, 0
            "/>
          </filter>
          {/* Deuteranopia filter (green-blind) */}
          <filter id="deuteranopia-filter">
            <feColorMatrix type="matrix" values="
              0.625, 0.375, 0,     0, 0
              0.7,   0.3,   0,     0, 0
              0,     0.3,   0.7,   0, 0
              0,     0,     0,     1, 0
            "/>
          </filter>
          {/* Tritanopia filter (blue-blind) */}
          <filter id="tritanopia-filter">
            <feColorMatrix type="matrix" values="
              0.95, 0.05,  0,     0, 0
              0,    0.433, 0.567, 0, 0
              0,    0.475, 0.525, 0, 0
              0,    0,     0,     1, 0
            "/>
          </filter>
        </defs>
      </svg>

      {/* Toast Notifications */}
      <ToastContainer />

      {/* Floating Action Button */}
      {!zenMode && page !== 'goonwall' && page !== 'feed' && (
        <>
          {fabOpen && (
            <div className="fab-menu">
              <button
                className="fab-menu-item"
                onClick={() => {
                  // Play random video
                  window.api.media.getAll().then((all: any[]) => {
                    const videos = all.filter((m: any) => m.type === 'video')
                    if (videos.length > 0) {
                      const random = videos[Math.floor(Math.random() * videos.length)]
                      navigateTo('library')
                      setTimeout(() => {
                        sessionStorage.setItem('vault_pending_media', random.id)
                        window.dispatchEvent(new Event('vault_pending_media_check'))
                      }, 300)
                    }
                  })
                  setFabOpen(false)
                }}
                title="Play Random Video"
              >
                <Dice5 size={20} />
              </button>
              <button
                className="fab-menu-item"
                onClick={() => {
                  navigateTo('goonwall')
                  setFabOpen(false)
                }}
                title="Open Goon Wall"
              >
                <Tv size={20} />
              </button>
              <button
                className="fab-menu-item"
                onClick={() => {
                  navigateTo('feed')
                  setFabOpen(false)
                }}
                title="Open Feed"
              >
                <Flame size={20} />
              </button>
              <button
                className="fab-menu-item"
                onClick={() => {
                  // Navigate to library and signal to open Watch Later panel
                  sessionStorage.setItem('vault_open_watch_later', 'true')
                  navigateTo('library')
                  setFabOpen(false)
                }}
                title="Watch Later Queue"
              >
                <Clock size={20} />
              </button>
            </div>
          )}
          <button
            className="fab"
            onClick={() => setFabOpen(!fabOpen)}
            title="Quick Actions"
          >
            <Plus size={24} className={cn('transition-transform duration-300', fabOpen && 'rotate-45')} />
          </button>
        </>
      )}

      {/* Context Menu */}
      <ContextMenuOverlay
        onAddToPlaylist={handleContextMenuAddToPlaylist}
        onViewInfo={(media) => setInfoModalMedia(media)}
      />
      {/* Media Info Modal */}
      {infoModalMedia && (
        <MediaInfoModal
          media={infoModalMedia}
          onClose={() => setInfoModalMedia(null)}
        />
      )}
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

      {/* Global Visual Effects Overlay */}
      {visualEffectsEnabled && (
        <ArousalEffects
          heatLevel={heatLevel}
          particles={heatLevel >= 3}
          heartbeat={heatLevel >= 4}
          shimmer={heatLevel >= 5}
          ripples={heatLevel >= 6}
          trail={heatLevel >= 7}
          wave={heatLevel >= 8}
          sparkles={sparklesEnabled}
          bokeh={bokehEnabled}
          starfield={starfieldEnabled}
          filmGrain={filmGrainEnabled}
          dreamyHaze={dreamyHazeEnabled}
          crtCurve={crtCurveEnabled}
          crtIntensity={crtIntensity}
          crtRgbSubpixels={crtRgbSubpixels}
          crtChromaticAberration={crtChromaticAberration}
          crtScreenFlicker={crtScreenFlicker}
          crtTvBorderImage={tvBorderSvg}
          crtActiveGlitchGif={crtGlitchGifIndex !== null ? CRT_GLITCH_GIFS[crtGlitchGifIndex] : undefined}
          tvBorderEnabled={tvBorderEnabled}
          tvBorderImage={tvBorderSvg}
          tvBorderGlass={tvBorderGlass}
          tvBorderGlassOpacity={tvBorderGlassOpacity}
          tvBorderPadding={tvBorderPadding}
          tvBorderStyle={tvBorderStyle}
          pipBoyEnabled={pipBoyEnabled}
          pipBoyColor={pipBoyColor}
          pipBoyIntensity={pipBoyIntensity}
          goonMode={goonModeEnabled}
          goonWordsSettings={settings?.visualEffects?.goonWords}
          climaxTrigger={climaxTrigger}
          climaxType={climaxType}
          onClimaxComplete={() => setClimaxTrigger(0)}
        />
      )}

      {/* New Ambient Overlays */}
      {visualEffectsEnabled && heartsEnabled && <HeartsOverlay intensity={heatLevel} />}
      {visualEffectsEnabled && rainEnabled && <RainOverlay intensity={heatLevel} />}
      {visualEffectsEnabled && glitchEnabled && <GlitchOverlay intensity={heatLevel} />}
      {visualEffectsEnabled && bubblesEnabled && <BubblesOverlay intensity={heatLevel} />}
      {visualEffectsEnabled && matrixEnabled && <MatrixRainOverlay intensity={heatLevel} />}
      {visualEffectsEnabled && confettiEnabled && <ConfettiOverlay intensity={heatLevel} />}

      {/* Zen Mode Indicator - shows when near edges */}
      {zenMode && (
        <div className={cn(
          'fixed top-4 left-1/2 -translate-x-1/2 z-[200] px-4 py-2 rounded-xl',
          'bg-black/80 backdrop-blur-sm border border-white/20',
          'transition-all duration-300 ease-out',
          zenModeEdgeActive ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4 pointer-events-none'
        )}>
          <div className="flex items-center gap-3 text-white/80 text-sm">
            <EyeOff size={16} />
            <span>Zen Mode</span>
            <span className="text-white/40 text-xs">Press Z or Esc to exit</span>
          </div>
        </div>
      )}

      {/* Pixel Cursor CSS - disabled during maintenance */}
      <div className="h-full w-full flex relative overflow-hidden">
        {/* Animated Background Orbs - subtle visual interest */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden" style={{ zIndex: 0 }}>
          <div
            className="animated-bg-orb"
            style={{
              width: '400px',
              height: '400px',
              background: 'var(--primary)',
              top: '10%',
              left: '-5%',
              animationDelay: '0s'
            }}
          />
          <div
            className="animated-bg-orb"
            style={{
              width: '300px',
              height: '300px',
              background: 'var(--secondary)',
              top: '60%',
              right: '-5%',
              animationDelay: '-5s'
            }}
          />
          <div
            className="animated-bg-orb"
            style={{
              width: '250px',
              height: '250px',
              background: 'var(--primary)',
              bottom: '-5%',
              left: '30%',
              animationDelay: '-10s'
            }}
          />
        </div>

        {/* Left Sidebar Edge Hover Zone - hidden in Zen Mode */}
        <div
          className={cn(
            'absolute top-0 bottom-0 w-5 z-50 cursor-pointer transition-opacity duration-300',
            zenMode && !zenModeEdgeActive && 'opacity-0 pointer-events-none'
          )}
          style={{ left: leftSidebarOpen && !zenMode ? '240px' : '0px', transition: 'left 0.3s ease-in-out' }}
          onMouseEnter={() => setLeftSidebarHover(true)}
          onMouseLeave={() => setLeftSidebarHover(false)}
          onMouseMove={(e) => setLeftSidebarMouseY(e.clientY)}
          onClick={() => {
            if (zenMode) {
              setZenMode(false)
              return
            }
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
              leftSidebarHover && !zenMode ? 'opacity-100' : 'opacity-0'
            )}
            style={{ top: Math.max(10, leftSidebarMouseY - 24) }}
          >
            <ChevronLeft size={14} className={cn(
              'transition-transform duration-300 text-[var(--primary)]',
              !leftSidebarOpen && 'rotate-180'
            )} />
          </div>
        </div>

        <aside
          aria-label="Main navigation"
          className={cn(
            'shrink-0 border-r border-[var(--border)] glass',
            'transition-all duration-300 ease-in-out overflow-hidden',
            zenMode ? 'w-0' : leftSidebarOpen ? 'w-[240px]' : 'w-0'
          )}
        >
          <div className="w-[240px] p-5">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-2xl overflow-hidden idle-breathe">
                <img src={vaultLogo} alt="Vault logo" className="w-full h-full object-cover" />
              </div>
              <div>
                <div className="text-sm font-semibold">Vault</div>
                <div className="text-xs text-[var(--muted)]" aria-label="Version 2.1.5">2.1.5</div>
              </div>
            </div>
          </div>

          <nav className="px-3 pb-4" aria-label="Main menu">
            {NAV.map((n) => {
              const isActive = page === n.id
              return (
                <button
                  key={n.id}
                  onClick={(e) => {
                    anime.pulse(e.currentTarget, 1.05)
                    navigateTo(n.id)
                  }}
                  title={n.tip}
                  aria-label={`${n.name}${isActive ? ' (current page)' : ''}`}
                  aria-current={isActive ? 'page' : undefined}
                  className={cn(
                    'relative w-full text-left px-3 py-2.5 rounded-xl text-sm transition-all duration-200 border flex items-center gap-3',
                    isActive
                      ? 'bg-[var(--primary)]/15 border-[var(--primary)]/30 text-[var(--primary)] shadow-lg shadow-[var(--primary)]/10'
                      : 'bg-transparent border-transparent hover:bg-white/5 hover:border-white/10 text-[var(--text)] hover:translate-x-1'
                  )}
                >
                  {/* Active indicator bar */}
                  {isActive && (
                    <div className="nav-active-indicator" />
                  )}
                  <NavIcon id={n.id} active={isActive} />
                  <span className="flex-1">{n.name}</span>
                  {/* AI Processing indicator */}
                  {n.id === 'ai' && globalAiStatus?.isRunning && (
                    <span
                      className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-blue-500/20 text-blue-400 animate-pulse"
                      title={`Processing: ${globalAiStatus.processing} | Pending: ${globalAiStatus.pending} | Completed: ${globalAiStatus.completed}`}
                    >
                      <Loader2 size={10} className="animate-spin" />
                      {globalAiStatus.processing}
                    </span>
                  )}
                  {/* Untagged items badge */}
                  {n.id === 'ai' && !globalAiStatus?.isRunning && untaggedCount > 0 && (
                    <span
                      className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-400"
                      title={`${untaggedCount} untagged items`}
                    >
                      {untaggedCount > 99 ? '99+' : untaggedCount}
                    </span>
                  )}
                </button>
              )
            })}
          </nav>

          {/* Quick Actions Section - Bottom of Sidebar */}
          <div className="mt-auto px-3 pb-4 border-t border-[var(--border)] pt-3">
            <button
              onClick={() => setQuickActionsOpen(!quickActionsOpen)}
              className="w-full text-left px-3 py-2 rounded-xl text-sm transition flex items-center gap-2 bg-transparent border-transparent hover:bg-[var(--surface)] text-[var(--text-muted)]"
            >
              <MoreHorizontal size={16} />
              <span className="flex-1">Quick Actions</span>
              <ChevronDown size={14} className={cn('transition-transform', quickActionsOpen && 'rotate-180')} />
            </button>

            {quickActionsOpen && (
              <div className="mt-2 space-y-1 pl-2">
                {/* Theme Presets */}
                <button
                  onClick={() => {
                    const presets = ['obsidian', 'moonlight', 'neon-lust', 'arctic', 'void']
                    const current = settings?.appearance?.themeId ?? 'obsidian'
                    const idx = presets.indexOf(current)
                    const next = presets[(idx + 1) % presets.length]
                    window.api.settings.setTheme(next).then((s: VaultSettings | null) => {
                      if (s) setSettings(s)
                      applyThemeCSS(next as ThemeId)
                    })
                  }}
                  className="w-full text-left px-3 py-1.5 rounded-lg text-xs transition flex items-center gap-2 hover:bg-[var(--surface)] text-[var(--text-muted)] hover:text-[var(--text)]"
                >
                  <Palette size={14} />
                  <span>Cycle Theme</span>
                </button>

                {/* AI Quick Tools */}
                <button
                  onClick={() => setPage('ai')}
                  className="w-full text-left px-3 py-1.5 rounded-lg text-xs transition flex items-center gap-2 hover:bg-[var(--surface)] text-[var(--text-muted)] hover:text-[var(--text)]"
                >
                  <Wand2 size={14} />
                  <span>AI Tools</span>
                </button>

                {/* Rescan Library */}
                <button
                  onClick={() => {
                    window.api.vault.rescan()
                    globalShowToast?.('info', 'Rescanning library...')
                  }}
                  className="w-full text-left px-3 py-1.5 rounded-lg text-xs transition flex items-center gap-2 hover:bg-[var(--surface)] text-[var(--text-muted)] hover:text-[var(--text)]"
                >
                  <ScanLine size={14} />
                  <span>Rescan Library</span>
                </button>

                {/* Tag Manager */}
                <button
                  onClick={() => {
                    setPage('settings')
                    // Could scroll to tags section
                  }}
                  className="w-full text-left px-3 py-1.5 rounded-lg text-xs transition flex items-center gap-2 hover:bg-[var(--surface)] text-[var(--text-muted)] hover:text-[var(--text)]"
                >
                  <Tags size={14} />
                  <span>Manage Tags</span>
                </button>

                {/* Find Duplicates */}
                <button
                  onClick={() => {
                    setPage('library')
                    // Dispatch custom event to open duplicates modal after page loads
                    setTimeout(() => {
                      window.dispatchEvent(new CustomEvent('vault-open-duplicates'))
                    }, 100)
                  }}
                  className="w-full text-left px-3 py-1.5 rounded-lg text-xs transition flex items-center gap-2 hover:bg-[var(--surface)] text-[var(--text-muted)] hover:text-[var(--text)]"
                >
                  <FileSearch size={14} />
                  <span>Find Duplicates</span>
                </button>

                {/* URL Downloader */}
                <button
                  onClick={() => window.dispatchEvent(new CustomEvent('vault-open-url-downloader'))}
                  className="w-full text-left px-3 py-1.5 rounded-lg text-xs transition flex items-center gap-2 hover:bg-[var(--surface)] text-[var(--text-muted)] hover:text-[var(--text)]"
                >
                  <Download size={14} />
                  <span>Download from URL</span>
                  <span className="ml-auto text-[10px] opacity-50">D</span>
                </button>

                {/* Command Palette */}
                <button
                  onClick={() => setShowCommandPalette(true)}
                  className="w-full text-left px-3 py-1.5 rounded-lg text-xs transition flex items-center gap-2 hover:bg-[var(--surface)] text-[var(--text-muted)] hover:text-[var(--text)]"
                >
                  <Command size={14} />
                  <span>Command Palette</span>
                  <span className="ml-auto text-[10px] opacity-50">Ctrl+K</span>
                </button>

                {/* Keybinds */}
                <button
                  onClick={() => setShowKeybindsEditor(true)}
                  className="w-full text-left px-3 py-1.5 rounded-lg text-xs transition flex items-center gap-2 hover:bg-[var(--surface)] text-[var(--text-muted)] hover:text-[var(--text)]"
                >
                  <Keyboard size={14} />
                  <span>Keybinds</span>
                </button>
              </div>
            )}
          </div>

        </aside>

        <main
          ref={mainContentRef}
          role="main"
          aria-label="Main content"
          className={cn(
            'flex-1 min-w-0 min-h-0 h-full overflow-hidden transition-all duration-300 ease-in-out',
            pageTransition === 'enter' && 'page-transition-enter',
            pageTransition === 'exit' && 'page-transition-exit'
          )}
        >
          {page === 'home' ? (
            <ErrorBoundary pageName="Home">
              <HomeDashboard
                onPlayMedia={(mediaId) => {
                  // Navigate to library and set pending media to open
                  window.api.goon?.recordWatch?.(mediaId).catch(() => {})
                  sessionStorage.setItem('vault_pending_media', mediaId)
                  navigateTo('library')
                  // Dispatch event after navigation to ensure Library picks up the pending media
                  setTimeout(() => {
                    window.dispatchEvent(new Event('vault_pending_media_check'))
                  }, 300)
                }}
                onNavigateToLibrary={() => navigateTo('library')}
                onNavigateToFavorites={() => {
                  // Navigate to library with favorites filter active
                  sessionStorage.setItem('vault_library_filter', 'favorites')
                  navigateTo('library')
                }}
                onNavigateToStats={() => navigateTo('stats')}
              />
            </ErrorBoundary>
          ) : page === 'library' ? (
            <ErrorBoundary pageName="Library">
              <LibraryPage settings={settings} selected={selected} setSelected={setSelected} tagBarOpen={tagBarOpen} setTagBarOpen={setTagBarOpen} confetti={confetti} anime={anime} onNavigateToFeed={() => navigateTo('feed')} />
            </ErrorBoundary>
          ) : page === 'goonwall' ? (
            <ErrorBoundary pageName="Goon Wall">
              <GoonWallPage
                settings={settings}
                heatLevel={ambientHeatLevel}
                onHeatChange={(level) => {
                  setAmbientHeatLevel(level)
                  window.api.settings.visualEffects?.update?.({ heatLevel: level })
                }}
                goonMode={goonModeEnabled}
                onGoonModeChange={(enabled) => {
                  setGoonModeEnabled(enabled)
                  const current = settings?.visualEffects?.goonWords ?? {}
                  window.api.settings.visualEffects?.update?.({ goonWords: { ...current, enabled } })
                }}
                randomClimax={randomClimaxEnabled}
                onRandomClimaxChange={(enabled) => {
                  setRandomClimaxEnabled(enabled)
                  window.api.settings.goonwall?.update?.({ randomClimax: enabled })
                }}
                onClimax={triggerClimax}
                overlays={{
                  sparkles: sparklesEnabled,
                  bokeh: bokehEnabled,
                  starfield: starfieldEnabled,
                  filmGrain: filmGrainEnabled,
                  dreamyHaze: dreamyHazeEnabled,
                }}
                onOverlayToggle={async (overlay) => {
                  switch (overlay) {
                    case 'sparkles':
                      setSparklesEnabled(v => !v)
                      await window.api.settings.visualEffects?.update?.({ sparkles: !sparklesEnabled })
                      break
                    case 'bokeh':
                      setBokehEnabled(v => !v)
                      await window.api.settings.visualEffects?.update?.({ bokeh: !bokehEnabled })
                      break
                    case 'starfield':
                      setStarfieldEnabled(v => !v)
                      await window.api.settings.visualEffects?.update?.({ starfield: !starfieldEnabled })
                      break
                    case 'filmGrain':
                      setFilmGrainEnabled(v => !v)
                      await window.api.settings.visualEffects?.update?.({ filmGrain: !filmGrainEnabled })
                      break
                    case 'dreamyHaze':
                      setDreamyHazeEnabled(v => !v)
                      await window.api.settings.visualEffects?.update?.({ dreamyHaze: !dreamyHazeEnabled })
                      break
                  }
                }}
              />
            </ErrorBoundary>
          ) : page === 'captions' ? (
            <ErrorBoundary pageName="Brainwash">
              <CaptionsPage settings={settings} />
            </ErrorBoundary>
          ) : page === 'pmv' ? (
            <ErrorBoundary pageName="PMV Editor">
              <PmvEditorPage />
            </ErrorBoundary>
          ) : page === 'ai' ? (
            <ErrorBoundary pageName="AI Tools">
              <AiTaggerPage />
            </ErrorBoundary>
          ) : page === 'feed' ? (
            <ErrorBoundary pageName="Feed">
              <FeedPage />
            </ErrorBoundary>
          ) : page === 'playlists' ? (
            <ErrorBoundary pageName="Sessions"><PlaylistsPage /></ErrorBoundary>
          ) : page === 'downloads' ? (
            <ErrorBoundary pageName="Downloads"><DownloadsPage /></ErrorBoundary>
          ) : page === 'stats' ? (
            <StatsPage confetti={confetti} anime={anime} />
          ) : page === 'settings' ? (
            <SettingsPage
              settings={settings}
              patchSettings={patchSettings}
              onThemeChange={(id: string) => {
                applyThemeCSS(id as ThemeId)
                window.api.settings.setTheme(id).then((next: VaultSettings | null) => {
                  if (next) setSettings(next)
                })
              }}
              visualEffects={{
                enabled: visualEffectsEnabled,
                sparkles: sparklesEnabled,
                bokeh: bokehEnabled,
                starfield: starfieldEnabled,
                filmGrain: filmGrainEnabled,
                dreamyHaze: dreamyHazeEnabled,
                crtCurve: crtCurveEnabled,
                crtIntensity: crtIntensity,
                crtRgbSubpixels: crtRgbSubpixels,
                crtChromaticAberration: crtChromaticAberration,
                crtScreenFlicker: crtScreenFlicker,
                crtGlitchGif: crtGlitchGifIndex,
                tvBorder: tvBorderEnabled,
                tvBorderGlass: tvBorderGlass,
                tvBorderGlassOpacity: tvBorderGlassOpacity,
                tvBorderPadding: tvBorderPadding,
                tvBorderStyle: tvBorderStyle,
                pipBoy: pipBoyEnabled,
                pipBoyColor: pipBoyColor,
                pipBoyIntensity: pipBoyIntensity,
                heatLevel: ambientHeatLevel,
                hearts: heartsEnabled,
                rain: rainEnabled,
                glitch: glitchEnabled,
                bubbles: bubblesEnabled,
                matrix: matrixEnabled,
                confetti: confettiEnabled,
              }}
              onVisualEffectsChange={{
                setEnabled: (v) => {
                  setVisualEffectsEnabled(v)
                  window.api.settings.visualEffects?.update?.({ enabled: v })
                },
                setSparkles: (v) => {
                  setSparklesEnabled(v)
                  window.api.settings.visualEffects?.update?.({ sparkles: v })
                },
                setBokeh: (v) => {
                  setBokehEnabled(v)
                  window.api.settings.visualEffects?.update?.({ bokeh: v })
                },
                setStarfield: (v) => {
                  setStarfieldEnabled(v)
                  window.api.settings.visualEffects?.update?.({ starfield: v })
                },
                setFilmGrain: (v) => {
                  setFilmGrainEnabled(v)
                  window.api.settings.visualEffects?.update?.({ filmGrain: v })
                },
                setDreamyHaze: (v) => {
                  setDreamyHazeEnabled(v)
                  window.api.settings.visualEffects?.update?.({ dreamyHaze: v })
                },
                setCrtCurve: (v) => {
                  setCrtCurveEnabled(v)
                  window.api.settings.visualEffects?.update?.({ crtCurve: v })
                },
                setCrtIntensity: (v) => {
                  setCrtIntensity(v)
                  window.api.settings.visualEffects?.update?.({ crtIntensity: v })
                },
                setCrtRgbSubpixels: (v) => {
                  setCrtRgbSubpixels(v)
                  window.api.settings.visualEffects?.update?.({ crtRgbSubpixels: v })
                },
                setCrtChromaticAberration: (v) => {
                  setCrtChromaticAberration(v)
                  window.api.settings.visualEffects?.update?.({ crtChromaticAberration: v })
                },
                setCrtScreenFlicker: (v) => {
                  setCrtScreenFlicker(v)
                  window.api.settings.visualEffects?.update?.({ crtScreenFlicker: v })
                },
                setCrtGlitchGif: (v) => {
                  setCrtGlitchGifIndex(v)
                  window.api.settings.visualEffects?.update?.({ crtGlitchGif: v })
                },
                setTvBorder: (v) => {
                  setTvBorderEnabled(v)
                  window.api.settings.visualEffects?.update?.({ tvBorder: v })
                },
                setTvBorderGlass: (v) => {
                  setTvBorderGlass(v)
                  window.api.settings.visualEffects?.update?.({ tvBorderGlass: v })
                },
                setTvBorderGlassOpacity: (v) => {
                  setTvBorderGlassOpacity(v)
                  window.api.settings.visualEffects?.update?.({ tvBorderGlassOpacity: v })
                },
                setTvBorderPadding: (v) => {
                  setTvBorderPadding(v)
                  window.api.settings.visualEffects?.update?.({ tvBorderPadding: v })
                },
                setTvBorderStyle: (v) => {
                  setTvBorderStyle(v)
                  window.api.settings.visualEffects?.update?.({ tvBorderStyle: v })
                },
                setPipBoy: (v) => {
                  setPipBoyEnabled(v)
                  window.api.settings.visualEffects?.update?.({ pipBoy: v })
                },
                setPipBoyColor: (v) => {
                  setPipBoyColor(v)
                  window.api.settings.visualEffects?.update?.({ pipBoyColor: v })
                },
                setPipBoyIntensity: (v) => {
                  setPipBoyIntensity(v)
                  window.api.settings.visualEffects?.update?.({ pipBoyIntensity: v })
                },
                setHeatLevel: (v) => {
                  setAmbientHeatLevel(v)
                  window.api.settings.visualEffects?.update?.({ heatLevel: v })
                },
                setHearts: (v) => {
                  setHeartsEnabled(v)
                  window.api.settings.visualEffects?.update?.({ hearts: v })
                  if (v) window.api.goon?.trackOverlayEnabled?.('hearts')
                },
                setRain: (v) => {
                  setRainEnabled(v)
                  window.api.settings.visualEffects?.update?.({ rain: v })
                  if (v) window.api.goon?.trackOverlayEnabled?.('rain')
                },
                setGlitch: (v) => {
                  setGlitchEnabled(v)
                  window.api.settings.visualEffects?.update?.({ glitch: v })
                  if (v) window.api.goon?.trackOverlayEnabled?.('glitch')
                },
                setBubbles: (v) => {
                  setBubblesEnabled(v)
                  window.api.settings.visualEffects?.update?.({ bubbles: v })
                  if (v) window.api.goon?.trackOverlayEnabled?.('bubbles')
                },
                setMatrix: (v) => {
                  setMatrixEnabled(v)
                  window.api.settings.visualEffects?.update?.({ matrix: v })
                  if (v) window.api.goon?.trackOverlayEnabled?.('matrix')
                },
                setConfetti: (v) => {
                  setConfettiEnabled(v)
                  window.api.settings.visualEffects?.update?.({ confetti: v })
                  if (v) window.api.goon?.trackOverlayEnabled?.('confetti')
                },
              }}
            />
          ) : page === 'about' ? (
            <AboutPage />
          ) : null}
        </main>
      </div>

      {/* Global Progress Bar - Shows at bottom when tasks are running */}
      <GlobalProgressBar />

      {/* Keyboard Shortcuts Help Modal */}
      {showShortcutsHelp && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="shortcuts-help-title"
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 backdrop-blur-sm"
          onClick={() => setShowShortcutsHelp(false)}
        >
          <div
            className="bg-[var(--panel)] border border-[var(--border)] rounded-2xl p-6 max-w-lg w-full mx-4 shadow-2xl animate-scaleIn"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 id="shortcuts-help-title" className="text-lg font-semibold">Keyboard Shortcuts</h2>
              <button
                onClick={() => setShowShortcutsHelp(false)}
                aria-label="Close dialog"
                className="p-1 rounded-lg hover:bg-white/10 transition"
              >
                <X size={18} aria-hidden="true" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <h3 className="text-xs text-[var(--muted)] uppercase tracking-wider mb-2">Library</h3>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="flex items-center gap-2">
                    <kbd className="px-2 py-1 bg-black/30 rounded text-xs">Arrow Keys</kbd>
                    <span className="text-white/70">Navigate tiles</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <kbd className="px-2 py-1 bg-black/30 rounded text-xs">Enter</kbd>
                    <span className="text-white/70">Open video</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <kbd className="px-2 py-1 bg-black/30 rounded text-xs">Esc</kbd>
                    <span className="text-white/70">Deselect</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <kbd className="px-2 py-1 bg-black/30 rounded text-xs">W</kbd>
                    <span className="text-white/70">Add to Watch Later</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <kbd className="px-2 py-1 bg-black/30 rounded text-xs">L</kbd>
                    <span className="text-white/70">Open Watch Later</span>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-xs text-[var(--muted)] uppercase tracking-wider mb-2">Feed</h3>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="flex items-center gap-2">
                    <kbd className="px-2 py-1 bg-black/30 rounded text-xs">J / ↓ / Space</kbd>
                    <span className="text-white/70">Next video</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <kbd className="px-2 py-1 bg-black/30 rounded text-xs">K / ↑</kbd>
                    <span className="text-white/70">Previous video</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <kbd className="px-2 py-1 bg-black/30 rounded text-xs">L / →</kbd>
                    <span className="text-white/70">Skip +5 seconds</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <kbd className="px-2 py-1 bg-black/30 rounded text-xs">H / ←</kbd>
                    <span className="text-white/70">Skip -5 seconds</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <kbd className="px-2 py-1 bg-black/30 rounded text-xs">M</kbd>
                    <span className="text-white/70">Toggle mute</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <kbd className="px-2 py-1 bg-black/30 rounded text-xs">Shift+H</kbd>
                    <span className="text-white/70">Hide UI</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <kbd className="px-2 py-1 bg-black/30 rounded text-xs">B</kbd>
                    <span className="text-white/70">Quick Bookmark</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <kbd className="px-2 py-1 bg-black/30 rounded text-xs">W</kbd>
                    <span className="text-white/70">Watch Later</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <kbd className="px-2 py-1 bg-black/30 rounded text-xs">Swipe ↑↓</kbd>
                    <span className="text-white/70">Navigate (touch)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <kbd className="px-2 py-1 bg-black/30 rounded text-xs">Double-tap</kbd>
                    <span className="text-white/70">Like (touch)</span>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-xs text-[var(--muted)] uppercase tracking-wider mb-2">Goon Wall</h3>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="flex items-center gap-2">
                    <kbd className="px-2 py-1 bg-black/30 rounded text-xs">S</kbd>
                    <span className="text-white/70">Shuffle all</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <kbd className="px-2 py-1 bg-black/30 rounded text-xs">M</kbd>
                    <span className="text-white/70">Toggle mute</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <kbd className="px-2 py-1 bg-black/30 rounded text-xs">H</kbd>
                    <span className="text-white/70">Toggle HUD</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <kbd className="px-2 py-1 bg-black/30 rounded text-xs">+/-</kbd>
                    <span className="text-white/70">Heat level</span>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-xs text-[var(--muted)] uppercase tracking-wider mb-2">Sessions</h3>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="flex items-center gap-2">
                    <kbd className="px-2 py-1 bg-black/30 rounded text-xs">N</kbd>
                    <span className="text-white/70">New playlist</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <kbd className="px-2 py-1 bg-black/30 rounded text-xs">A</kbd>
                    <span className="text-white/70">Add videos</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <kbd className="px-2 py-1 bg-black/30 rounded text-xs">G</kbd>
                    <span className="text-white/70">AI generate</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <kbd className="px-2 py-1 bg-black/30 rounded text-xs">↑/↓</kbd>
                    <span className="text-white/70">Navigate playlists</span>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-xs text-[var(--muted)] uppercase tracking-wider mb-2">Video Player</h3>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="flex items-center gap-2">
                    <kbd className="px-2 py-1 bg-black/30 rounded text-xs">Space</kbd>
                    <span className="text-white/70">Play/Pause</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <kbd className="px-2 py-1 bg-black/30 rounded text-xs">F</kbd>
                    <span className="text-white/70">Fullscreen</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <kbd className="px-2 py-1 bg-black/30 rounded text-xs">B</kbd>
                    <span className="text-white/70">Quick Bookmark</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <kbd className="px-2 py-1 bg-black/30 rounded text-xs">Shift+B</kbd>
                    <span className="text-white/70">Bookmarks List</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <kbd className="px-2 py-1 bg-black/30 rounded text-xs">R</kbd>
                    <span className="text-white/70">Related Media</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <kbd className="px-2 py-1 bg-black/30 rounded text-xs">N</kbd>
                    <span className="text-white/70">Notes Panel</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <kbd className="px-2 py-1 bg-black/30 rounded text-xs">M</kbd>
                    <span className="text-white/70">Toggle Mute</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <kbd className="px-2 py-1 bg-black/30 rounded text-xs">L</kbd>
                    <span className="text-white/70">Like/Unlike</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <kbd className="px-2 py-1 bg-black/30 rounded text-xs">P</kbd>
                    <span className="text-white/70">Picture-in-Picture</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <kbd className="px-2 py-1 bg-black/30 rounded text-xs">A</kbd>
                    <span className="text-white/70">A-B Loop (tap twice)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <kbd className="px-2 py-1 bg-black/30 rounded text-xs">[ / ]</kbd>
                    <span className="text-white/70">Speed Down/Up</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <kbd className="px-2 py-1 bg-black/30 rounded text-xs">T</kbd>
                    <span className="text-white/70">Theater Mode</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <kbd className="px-2 py-1 bg-black/30 rounded text-xs">C</kbd>
                    <span className="text-white/70">Crop Video</span>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-xs text-[var(--muted)] uppercase tracking-wider mb-2">Global</h3>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="flex items-center gap-2">
                    <kbd className="px-2 py-1 bg-black/30 rounded text-xs">Ctrl+K</kbd>
                    <span className="text-white/70">Quick Actions</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <kbd className="px-2 py-1 bg-black/30 rounded text-xs">?</kbd>
                    <span className="text-white/70">Show this help</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <kbd className="px-2 py-1 bg-black/30 rounded text-xs">Z</kbd>
                    <span className="text-white/70">Zen Mode</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <kbd className="px-2 py-1 bg-black/30 rounded text-xs">D</kbd>
                    <span className="text-white/70">URL Downloader</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <kbd className="px-2 py-1 bg-black/30 rounded text-xs">Ctrl+Z</kbd>
                    <span className="text-white/70">Undo delete</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-6 pt-4 border-t border-[var(--border)] text-center">
              <p className="text-xs text-white/40">Press <kbd className="px-1.5 py-0.5 bg-black/30 rounded">Esc</kbd> or click outside to close</p>
            </div>
          </div>
        </div>
      )}

      {/* Command Palette (Ctrl+K) */}
      {showCommandPalette && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Quick Actions"
          className="fixed inset-0 z-[210] flex items-start justify-center pt-[15vh] bg-black/70 backdrop-blur-sm"
          onClick={() => setShowCommandPalette(false)}
        >
          <div
            className="bg-[var(--panel)] border border-[var(--border)] rounded-2xl w-full max-w-lg mx-4 shadow-2xl animate-scaleIn overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            {/* Search Input */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-[var(--border)]">
              <Search size={18} className="text-[var(--muted)]" />
              <input
                ref={commandInputRef}
                type="text"
                value={commandSearch}
                onChange={e => setCommandSearch(e.target.value)}
                placeholder="Type a command or search..."
                className="flex-1 bg-transparent outline-none text-white placeholder:text-[var(--muted)]"
                autoFocus
              />
              <kbd className="px-2 py-1 bg-black/30 rounded text-xs text-[var(--muted)]">Esc</kbd>
            </div>

            {/* Commands List */}
            <div className="max-h-[50vh] overflow-y-auto p-2">
              {(() => {
                const commands = [
                  { id: 'home', icon: Home, label: 'Go to Home', shortcut: '0', action: () => { setPage('home'); setShowCommandPalette(false) } },
                  { id: 'library', icon: Library, label: 'Go to Library', shortcut: '1', action: () => { setPage('library'); setShowCommandPalette(false) } },
                  { id: 'feed', icon: Play, label: 'Go to Feed', shortcut: '2', action: () => { setPage('feed'); setShowCommandPalette(false) } },
                  { id: 'goonwall', icon: LayoutGrid, label: 'Go to Goon Wall', shortcut: '3', action: () => { setPage('goonwall'); setShowCommandPalette(false) } },
                  { id: 'sessions', icon: ListMusic, label: 'Go to Sessions', shortcut: '4', action: () => { setPage('playlists'); setShowCommandPalette(false) } },
                  { id: 'brainwash', icon: Brain, label: 'Go to Brainwash', shortcut: '5', action: () => { setPage('captions'); setShowCommandPalette(false) } },
                  { id: 'stats', icon: BarChart3, label: 'Go to Stats', shortcut: '6', action: () => { setPage('stats'); setShowCommandPalette(false) } },
                  { id: 'settings', icon: Settings, label: 'Go to Settings', shortcut: ',', action: () => { setPage('settings'); setShowCommandPalette(false) } },
                  { id: 'divider1', divider: true },
                  { id: 'zen', icon: Eye, label: 'Toggle Zen Mode', shortcut: 'Z', action: () => { setZenMode(prev => !prev); setShowCommandPalette(false) } },
                  { id: 'shortcuts', icon: HelpCircle, label: 'Show Keyboard Shortcuts', shortcut: '?', action: () => { setShowShortcutsHelp(true); setShowCommandPalette(false) } },
                  { id: 'refresh', icon: RefreshCw, label: 'Refresh Library', action: async () => { await window.api.scanner?.rescan?.(); setShowCommandPalette(false); globalShowToast('info', 'Library scan started') } },
                  { id: 'divider2', divider: true },
                  { id: 'randomVideo', icon: Shuffle, label: 'Play Random Video', shortcut: 'R', action: async () => {
                    try {
                      const result = await window.api.media.list({ limit: 100, type: 'video' })
                      const items = extractItems<MediaRow>(result)
                      if (items.length > 0) {
                        const randomItem = items[Math.floor(Math.random() * items.length)]
                        window.dispatchEvent(new CustomEvent('vault-open-video', { detail: randomItem }))
                        setShowCommandPalette(false)
                      } else {
                        globalShowToast('info', 'No videos found')
                      }
                    } catch { globalShowToast('error', 'Failed to find videos') }
                  }},
                  { id: 'watchLater', icon: Clock, label: 'Open Watch Later', shortcut: 'L', action: () => { window.dispatchEvent(new CustomEvent('vault-open-watch-later')); setShowCommandPalette(false) } },
                  { id: 'tvRemote', icon: Tv, label: 'Open TV Remote', shortcut: 'T', action: () => { window.dispatchEvent(new CustomEvent('vault-open-tv-remote')); setShowCommandPalette(false) } },
                  { id: 'urlDownloader', icon: Download, label: 'Download from URL', shortcut: 'D', action: () => { window.dispatchEvent(new CustomEvent('vault-open-url-downloader')); setShowCommandPalette(false) } },
                  { id: 'fullscreen', icon: Maximize2, label: 'Toggle Fullscreen', shortcut: 'F11', action: () => { window.api.window?.toggleFullscreen?.(); setShowCommandPalette(false) } },
                  { id: 'divider3', divider: true },
                  // v2.3.0 Tools - Use custom events to communicate with LibraryPage component
                  { id: 'mediaTimeline', icon: Clock, label: 'Open Media Timeline', action: () => { window.dispatchEvent(new CustomEvent('vault-open-media-timeline')); setShowCommandPalette(false) } },
                  { id: 'watchProgress', icon: Play, label: 'Open Watch Progress', action: () => { window.dispatchEvent(new CustomEvent('vault-open-watch-progress')); setShowCommandPalette(false) } },
                  { id: 'mediaQueue', icon: ListMusic, label: 'Open Media Queue', action: () => { window.dispatchEvent(new CustomEvent('vault-open-media-queue')); setShowCommandPalette(false) } },
                  { id: 'viewModes', icon: LayoutGrid, label: 'Open View Mode Selector', action: () => { window.dispatchEvent(new CustomEvent('vault-open-view-modes')); setShowCommandPalette(false) } },
                  { id: 'autoPlaylists', icon: Sparkles, label: 'Open Auto Playlists', action: () => { window.dispatchEvent(new CustomEvent('vault-open-auto-playlists')); setShowCommandPalette(false) } },
                  { id: 'sceneDetector', icon: Film, label: 'Open Scene Detector', action: () => { window.dispatchEvent(new CustomEvent('vault-open-scene-detector')); setShowCommandPalette(false) } },
                  { id: 'aiTagger', icon: Brain, label: 'Open AI Tagger', action: () => { window.dispatchEvent(new CustomEvent('vault-open-ai-tagger')); setShowCommandPalette(false) } },
                  { id: 'bookmarkManager', icon: Bookmark, label: 'Open Bookmark Manager', action: () => { window.dispatchEvent(new CustomEvent('vault-open-bookmarks')); setShowCommandPalette(false) } },
                  { id: 'notesPanel', icon: FileText, label: 'Open Notes Panel', action: () => { window.dispatchEvent(new CustomEvent('vault-open-notes')); setShowCommandPalette(false) } },
                  { id: 'relatedMedia', icon: Link2, label: 'Open Related Media', action: () => { window.dispatchEvent(new CustomEvent('vault-open-related')); setShowCommandPalette(false) } },
                  { id: 'thumbnailSelector', icon: ImageIcon, label: 'Open Thumbnail Selector', action: () => { window.dispatchEvent(new CustomEvent('vault-open-thumbnail-selector')); setShowCommandPalette(false) } },
                  { id: 'exportManager', icon: Download, label: 'Open Export Manager', action: () => { window.dispatchEvent(new CustomEvent('vault-open-exporter')); setShowCommandPalette(false) } },
                  { id: 'pmvEditor', icon: Scissors, label: 'Open PMV Editor', action: () => { setPage('pmv'); setShowCommandPalette(false) } },
                  { id: 'divider4', divider: true },
                  { id: 'addFolder', icon: FolderPlus, label: 'Add Media Folder', action: async () => { await window.api.settings.chooseMediaDir?.(); setShowCommandPalette(false) } },
                  { id: 'clearThumbCache', icon: Trash2, label: 'Clear Thumbnail Cache', action: async () => { await window.api.thumbs?.clearCache?.(); globalShowToast('success', 'Thumbnail cache cleared'); setShowCommandPalette(false) } },
                  { id: 'exportSettings', icon: Download, label: 'Export Settings', action: async () => { await window.api.data?.exportSettings?.(); setShowCommandPalette(false) } },
                ]
                const searchLower = commandSearch.toLowerCase()
                const filtered = commands.filter(cmd =>
                  'divider' in cmd || cmd.label.toLowerCase().includes(searchLower)
                )
                // Remove dividers if they're at the start/end or consecutive
                const cleanedCommands = filtered.filter((cmd, i, arr) => {
                  if (!('divider' in cmd)) return true
                  const prevIsContent = i > 0 && !('divider' in arr[i - 1])
                  const nextIsContent = i < arr.length - 1 && !('divider' in arr[i + 1])
                  return prevIsContent && nextIsContent
                })

                if (cleanedCommands.length === 0) {
                  return (
                    <div className="text-center py-8 text-[var(--muted)]">
                      No commands found
                    </div>
                  )
                }

                return cleanedCommands.map((cmd, i) => {
                  if ('divider' in cmd) {
                    return <div key={cmd.id} className="h-px bg-[var(--border)] my-1" />
                  }
                  const Icon = cmd.icon
                  return (
                    <button
                      key={cmd.id}
                      onClick={cmd.action}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-white/10 transition text-left group"
                    >
                      <Icon size={18} className="text-[var(--muted)] group-hover:text-[var(--accent)]" />
                      <span className="flex-1">{cmd.label}</span>
                      {cmd.shortcut && (
                        <kbd className="px-2 py-1 bg-black/30 rounded text-xs text-[var(--muted)]">{cmd.shortcut}</kbd>
                      )}
                    </button>
                  )
                })
              })()}
            </div>

            {/* Footer */}
            <div className="px-4 py-2 border-t border-[var(--border)] bg-black/20">
              <div className="flex items-center justify-between text-xs text-[var(--muted)]">
                <span>Quick Actions</span>
                <div className="flex items-center gap-2">
                  <kbd className="px-1.5 py-0.5 bg-black/30 rounded">↑↓</kbd>
                  <span>navigate</span>
                  <kbd className="px-1.5 py-0.5 bg-black/30 rounded">Enter</kbd>
                  <span>select</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Welcome Tutorial Modal */}
      {showWelcomeTutorial && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Welcome to Vault tutorial"
          className="fixed inset-0 z-[250] flex items-center justify-center bg-black/80 backdrop-blur-md"
        >
          <div
            className="bg-gradient-to-br from-[var(--panel)] to-[var(--bg)] border border-[var(--accent)]/30 rounded-2xl p-8 max-w-xl w-full mx-4 shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            {/* Step indicators */}
            <div className="flex justify-center gap-2 mb-6">
              {[0, 1, 2, 3, 4].map(step => (
                <div
                  key={step}
                  className={`w-2 h-2 rounded-full transition-all duration-300 ${
                    step === welcomeStep
                      ? 'w-6 bg-[var(--accent)]'
                      : step < welcomeStep
                      ? 'bg-[var(--accent)]/50'
                      : 'bg-white/20'
                  }`}
                />
              ))}
            </div>

            {/* Step 0: Welcome */}
            {welcomeStep === 0 && (
              <div className="text-center animate-fadeIn">
                <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-gradient-to-br from-[var(--accent)] to-purple-600 flex items-center justify-center">
                  <Sparkles size={40} className="text-white" />
                </div>
                <h2 className="text-2xl font-bold mb-3 bg-gradient-to-r from-[var(--accent)] to-purple-400 bg-clip-text text-transparent">
                  Welcome to Vault
                </h2>
                <p className="text-white/70 mb-6 leading-relaxed">
                  Your personal media collection manager with powerful organization tools,
                  AI-powered tagging, and immersive viewing experiences.
                </p>
                <p className="text-sm text-white/50">
                  Let's take a quick tour of the key features.
                </p>
              </div>
            )}

            {/* Step 1: Library */}
            {welcomeStep === 1 && (
              <div className="text-center animate-fadeIn">
                <div className="w-16 h-16 mx-auto mb-4 rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center">
                  <Library size={32} className="text-white" />
                </div>
                <h2 className="text-xl font-bold mb-3">Library</h2>
                <p className="text-white/70 mb-4 leading-relaxed">
                  Browse your entire media collection in one place. Add folders in Settings,
                  and Vault will automatically organize your videos, images, and GIFs.
                </p>
                <div className="bg-black/30 rounded-lg p-4 text-left text-sm">
                  <div className="flex items-center gap-2 mb-2">
                    <Search size={14} className="text-[var(--accent)]" />
                    <span className="text-white/60">Search by filename or tags</span>
                  </div>
                  <div className="flex items-center gap-2 mb-2">
                    <Star size={14} className="text-yellow-400" />
                    <span className="text-white/60">Rate and favorite items</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Tag size={14} className="text-green-400" />
                    <span className="text-white/60">Organize with tags and playlists</span>
                  </div>
                </div>
              </div>
            )}

            {/* Step 2: Goon Wall */}
            {welcomeStep === 2 && (
              <div className="text-center animate-fadeIn">
                <div className="w-16 h-16 mx-auto mb-4 rounded-xl bg-gradient-to-br from-purple-500 to-pink-600 flex items-center justify-center">
                  <LayoutGrid size={32} className="text-white" />
                </div>
                <h2 className="text-xl font-bold mb-3">Goon Wall</h2>
                <p className="text-white/70 mb-4 leading-relaxed">
                  An immersive multi-tile video wall for the ultimate viewing experience.
                  Watch multiple videos simultaneously with customizable layouts and effects.
                </p>
                <div className="bg-black/30 rounded-lg p-4 text-left text-sm">
                  <div className="flex items-center gap-2 mb-2">
                    <Shuffle size={14} className="text-[var(--accent)]" />
                    <span className="text-white/60">Auto-shuffle tiles at intervals</span>
                  </div>
                  <div className="flex items-center gap-2 mb-2">
                    <Maximize2 size={14} className="text-cyan-400" />
                    <span className="text-white/60">1-16 tile layouts</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Zap size={14} className="text-yellow-400" />
                    <span className="text-white/60">Visual effects and transitions</span>
                  </div>
                </div>
              </div>
            )}

            {/* Step 3: Brainwash */}
            {welcomeStep === 3 && (
              <div className="text-center animate-fadeIn">
                <div className="w-16 h-16 mx-auto mb-4 rounded-xl bg-gradient-to-br from-pink-500 to-rose-600 flex items-center justify-center">
                  <MessageSquare size={32} className="text-white" />
                </div>
                <h2 className="text-xl font-bold mb-3">Brainwash</h2>
                <p className="text-white/70 mb-4 leading-relaxed">
                  Create captioned images with your photos. Add text overlays, apply filters,
                  crop images, and export your creations.
                </p>
                <div className="bg-black/30 rounded-lg p-4 text-left text-sm">
                  <div className="flex items-center gap-2 mb-2">
                    <Type size={14} className="text-[var(--accent)]" />
                    <span className="text-white/60">17 text style presets</span>
                  </div>
                  <div className="flex items-center gap-2 mb-2">
                    <ImageIcon size={14} className="text-blue-400" />
                    <span className="text-white/60">Filters: pixelate, blur, and more</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Brain size={14} className="text-purple-400" />
                    <span className="text-white/60">AI-generated captions</span>
                  </div>
                </div>
              </div>
            )}

            {/* Step 4: Shortcuts & Finish */}
            {welcomeStep === 4 && (
              <div className="text-center animate-fadeIn">
                <div className="w-16 h-16 mx-auto mb-4 rounded-xl bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center">
                  <Check size={32} className="text-white" />
                </div>
                <h2 className="text-xl font-bold mb-3">You're All Set!</h2>
                <p className="text-white/70 mb-4 leading-relaxed">
                  Explore the app and make it your own. Here are some helpful keyboard shortcuts:
                </p>
                <div className="bg-black/30 rounded-lg p-4 text-left text-sm grid grid-cols-2 gap-2">
                  <div className="flex items-center gap-2">
                    <kbd className="px-2 py-1 bg-black/50 rounded text-xs">?</kbd>
                    <span className="text-white/60">Show all shortcuts</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <kbd className="px-2 py-1 bg-black/50 rounded text-xs">Z</kbd>
                    <span className="text-white/60">Zen Mode</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <kbd className="px-2 py-1 bg-black/50 rounded text-xs">S</kbd>
                    <span className="text-white/60">Shuffle</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <kbd className="px-2 py-1 bg-black/50 rounded text-xs">Esc</kbd>
                    <span className="text-white/60">Close/Exit</span>
                  </div>
                </div>
                <p className="mt-4 text-sm text-white/50">
                  Add your media folders in Settings to get started!
                </p>
              </div>
            )}

            {/* Navigation buttons */}
            <div className="flex justify-between items-center mt-8">
              <button
                onClick={async () => {
                  setShowWelcomeTutorial(false)
                  try {
                    await window.api.settings.update({ hasSeenWelcome: true })
                  } catch (err) {
                    console.warn('[Welcome] Failed to save welcome state:', err)
                  }
                }}
                className="text-sm text-white/40 hover:text-white/70 transition"
              >
                Skip tutorial
              </button>

              <div className="flex gap-3">
                {welcomeStep > 0 && (
                  <button
                    onClick={() => setWelcomeStep(prev => prev - 1)}
                    className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 transition flex items-center gap-2"
                  >
                    <ChevronLeft size={16} />
                    Back
                  </button>
                )}

                {welcomeStep < 4 ? (
                  <button
                    onClick={() => setWelcomeStep(prev => prev + 1)}
                    className="px-5 py-2 rounded-lg bg-[var(--accent)] hover:opacity-90 transition font-medium flex items-center gap-2"
                  >
                    Next
                    <ChevronRight size={16} />
                  </button>
                ) : (
                  <button
                    onClick={async () => {
                      setShowWelcomeTutorial(false)
                      try {
                        await window.api.settings.update({ hasSeenWelcome: true })
                      } catch (err) {
                        console.warn('[Welcome] Failed to save welcome state:', err)
                      }
                      showToast('success', 'Welcome to Vault! Add folders in Settings to get started.')
                    }}
                    className="px-5 py-2 rounded-lg bg-gradient-to-r from-[var(--accent)] to-purple-500 hover:opacity-90 transition font-medium flex items-center gap-2"
                  >
                    Get Started
                    <Sparkles size={16} />
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Keybinds Editor Popup - Global */}
      {showKeybindsEditor && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowKeybindsEditor(false)}>
          <div className="bg-[var(--background)] border border-[var(--border)] rounded-2xl shadow-2xl w-full max-w-lg max-h-[80vh] overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)]">
              <div className="flex items-center gap-3">
                <Keyboard size={20} className="text-[var(--primary)]" />
                <h2 className="text-lg font-semibold">Keyboard Shortcuts</h2>
              </div>
              <button onClick={() => setShowKeybindsEditor(false)} className="p-1.5 rounded-lg hover:bg-[var(--surface)] transition">
                <X size={18} />
              </button>
            </div>
            <div className="p-5 overflow-y-auto max-h-[60vh] space-y-4">
              {/* Navigation */}
              <div>
                <h3 className="text-sm font-medium text-[var(--muted)] mb-2">Navigation</h3>
                <div className="space-y-1">
                  {[
                    { keys: 'Ctrl + K', action: 'Open Command Palette' },
                    { keys: 'Ctrl + ,', action: 'Open Settings' },
                    { keys: 'Escape', action: 'Close Modal / Exit Zen Mode' },
                    { keys: 'Z', action: 'Toggle Zen Mode' },
                    { keys: '1-9', action: 'Navigate to Page' },
                  ].map(k => (
                    <div key={k.keys} className="flex items-center justify-between py-1.5 px-3 rounded-lg hover:bg-[var(--surface)]">
                      <span className="text-sm">{k.action}</span>
                      <kbd className="px-2 py-0.5 bg-[var(--surface)] rounded text-xs font-mono">{k.keys}</kbd>
                    </div>
                  ))}
                </div>
              </div>

              {/* Playback */}
              <div>
                <h3 className="text-sm font-medium text-[var(--muted)] mb-2">Playback</h3>
                <div className="space-y-1">
                  {[
                    { keys: 'Space', action: 'Play / Pause' },
                    { keys: '← / →', action: 'Seek -10s / +10s' },
                    { keys: '↑ / ↓', action: 'Volume Up / Down' },
                    { keys: 'M', action: 'Mute / Unmute' },
                    { keys: 'F', action: 'Toggle Fullscreen' },
                    { keys: 'L', action: 'Toggle Loop' },
                    { keys: 'N', action: 'Next Media' },
                    { keys: 'P', action: 'Previous Media' },
                  ].map(k => (
                    <div key={k.keys} className="flex items-center justify-between py-1.5 px-3 rounded-lg hover:bg-[var(--surface)]">
                      <span className="text-sm">{k.action}</span>
                      <kbd className="px-2 py-0.5 bg-[var(--surface)] rounded text-xs font-mono">{k.keys}</kbd>
                    </div>
                  ))}
                </div>
              </div>

              {/* Library */}
              <div>
                <h3 className="text-sm font-medium text-[var(--muted)] mb-2">Library</h3>
                <div className="space-y-1">
                  {[
                    { keys: 'Ctrl + A', action: 'Select All' },
                    { keys: 'Ctrl + Shift + A', action: 'Deselect All' },
                    { keys: 'Delete', action: 'Remove Selected' },
                    { keys: 'Ctrl + F', action: 'Focus Search' },
                    { keys: 'R', action: 'Random Media' },
                  ].map(k => (
                    <div key={k.keys} className="flex items-center justify-between py-1.5 px-3 rounded-lg hover:bg-[var(--surface)]">
                      <span className="text-sm">{k.action}</span>
                      <kbd className="px-2 py-0.5 bg-[var(--surface)] rounded text-xs font-mono">{k.keys}</kbd>
                    </div>
                  ))}
                </div>
              </div>

              {/* Goon Wall */}
              <div>
                <h3 className="text-sm font-medium text-[var(--muted)] mb-2">Goon Wall</h3>
                <div className="space-y-1">
                  {[
                    { keys: 'S', action: 'Shuffle Tiles' },
                    { keys: 'G', action: 'Toggle Goon Mode' },
                    { keys: '+/-', action: 'Adjust Grid Size' },
                  ].map(k => (
                    <div key={k.keys} className="flex items-center justify-between py-1.5 px-3 rounded-lg hover:bg-[var(--surface)]">
                      <span className="text-sm">{k.action}</span>
                      <kbd className="px-2 py-0.5 bg-[var(--surface)] rounded text-xs font-mono">{k.keys}</kbd>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="px-5 py-3 border-t border-[var(--border)] text-xs text-[var(--muted)] text-center">
              Press <kbd className="px-1.5 py-0.5 bg-[var(--surface)] rounded font-mono">?</kbd> anytime to show shortcuts
            </div>
          </div>
        </div>
      )}
    </div>
    </GlobalTaskContext.Provider>
    </ContextMenuContext.Provider>
    </ToastContext.Provider>
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

function Btn(props: React.ButtonHTMLAttributes<HTMLButtonElement> & { tone?: 'primary' | 'ghost' | 'danger' | 'subtle' }) {
  const tone = props.tone ?? 'ghost'
  const cls =
    tone === 'primary'
      ? 'bg-[var(--primary)]/20 hover:bg-[var(--primary)]/30 border-[var(--primary)]/30'
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
        'px-3 py-2 rounded-xl text-xs border transition disabled:opacity-50 disabled:cursor-not-allowed focus-visible:ring-2 focus-visible:ring-[var(--primary)] focus-visible:ring-offset-1 active:scale-95',
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

type SortOption = 'newest' | 'oldest' | 'name' | 'views' | 'duration' | 'type' | 'size' | 'random' | 'recentlyViewed' | 'rating'

// Page size options for library
const PAGE_SIZE_OPTIONS = [
  { value: 20, label: '20' },
  { value: 40, label: '40' },
  { value: 60, label: '60' },
  { value: 100, label: '100' },
  { value: 200, label: '200' },
  { value: -1, label: 'All' },
] as const
type LayoutOption = 'mosaic' | 'grid' | 'wall'

const MAX_FLOATING_PLAYERS = 10
const DEFAULT_PAGE_SIZE = 60

// Helper to get persisted filter state from sessionStorage
function getPersistedFilters() {
  try {
    const saved = sessionStorage.getItem('vault_library_filters')
    if (saved) return JSON.parse(saved)
  } catch {}
  return null
}

function LibraryPage(props: { settings: VaultSettings | null; selected: string[]; setSelected: (ids: string[]) => void; tagBarOpen: boolean; setTagBarOpen: (open: boolean | ((prev: boolean) => boolean)) => void; confetti?: ReturnType<typeof useConfetti>; anime?: ReturnType<typeof useAnime>; onNavigateToFeed?: () => void }) {
  const { confetti, anime } = props
  const { tagBarOpen, setTagBarOpen } = props
  const { showToast } = useToast()
  const { showContextMenu } = useContextMenu()
  const [media, setMedia] = useState<MediaRow[]>([])
  const [tags, setTags] = useState<TagRow[]>([])

  // Restore persisted filter state on mount
  const persisted = useMemo(() => getPersistedFilters(), [])
  const [query, setQuery] = useState<string>(persisted?.query ?? '')
  const [activeTags, setActiveTags] = useState<string[]>(persisted?.activeTags ?? [])
  const [typeFilter, setTypeFilter] = useState<MediaType | 'all'>(persisted?.typeFilter ?? 'all')
  const [sortBy, setSortBy] = useState<SortOption>(persisted?.sortBy ?? 'newest')
  const [sortAscending, setSortAscending] = useState(persisted?.sortAscending ?? false)
  const [pageSize, setPageSize] = useState(persisted?.pageSize ?? DEFAULT_PAGE_SIZE)
  const [layout, setLayout] = useState<LayoutOption>(persisted?.layout ?? 'mosaic')
  // Grid mode: tile width in px - initialize from settings if available
  const initialTileSize = useMemo(() => {
    const thumbSize = props.settings?.appearance?.thumbnailSize
    const sizeMap = { small: 160, medium: 220, large: 300 }
    return thumbSize ? sizeMap[thumbSize] ?? 200 : 200
  }, [])
  const [tileSize, setTileSize] = useState(initialTileSize)
  const [mosaicCols, setMosaicCols] = useState(4) // Mosaic mode: number of columns
  const [openIds, setOpenIds] = useState<string[]>([]) // Support up to 10 floating players
  const [playerBounds, setPlayerBounds] = useState<Map<string, { x: number; y: number; width: number; height: number }>>(new Map())
  const [isLoading, setIsLoading] = useState(false)
  const [mediaStats, setMediaStats] = useState<Map<string, { rating: number; viewCount: number; oCount: number }>>(new Map())
  const [randomQuickTags, setRandomQuickTags] = useState<TagRow[]>([])
  const [allTagsForSearch, setAllTagsForSearch] = useState<Array<{ name: string; count: number }>>([]) // For search suggestions
  const [currentPage, setCurrentPage] = useState(1)
  const [totalCount, setTotalCount] = useState(0)
  const [typeCounts, setTypeCounts] = useState<{ video: number; image: number; gif: number }>({ video: 0, image: 0, gif: 0 })
  const [randomSeed, setRandomSeed] = useState(0) // Used to trigger re-shuffle
  const [tagBarHover, setTagBarHover] = useState(false)
  const [tagBarMouseY, setTagBarMouseY] = useState(0)
  const [previewMuted, setPreviewMuted] = useState(true) // Mute state for video previews
  const [tagDropdownOpen, setTagDropdownOpen] = useState(false) // Track when tag selector dropdown is open
  const [searchFocused, setSearchFocused] = useState(false) // Track search input focus
  const [searchHistory, setSearchHistory] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('vault_search_history')
      return saved ? JSON.parse(saved) : []
    } catch { return [] }
  })
  const [savedSearches, setSavedSearches] = useState<Array<{ name: string; query: string }>>(() => {
    try {
      const saved = localStorage.getItem('vault_saved_searches')
      return saved ? JSON.parse(saved) : []
    } catch { return [] }
  })
  const [showSaveSearchModal, setShowSaveSearchModal] = useState(false) // Save search modal
  const [saveSearchName, setSaveSearchName] = useState('') // Name for saving current search
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set()) // Track liked media
  const [selectionMode, setSelectionMode] = useState(false) // Bulk selection mode
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set()) // Selected media IDs for bulk actions
  const [showPlaylistPicker, setShowPlaylistPicker] = useState(false) // Show playlist picker for bulk add
  const [bulkPlaylists, setBulkPlaylists] = useState<PlaylistRow[]>([]) // Playlists for picker
  const [playlistPickerMediaId, setPlaylistPickerMediaId] = useState<string | null>(null) // Single media for playlist picker
  const [showCreatePlaylistModal, setShowCreatePlaylistModal] = useState(false) // Create new playlist modal
  const [newPlaylistName, setNewPlaylistName] = useState('') // New playlist name input
  const [bulkActionLoading, setBulkActionLoading] = useState<string | null>(null) // Track which bulk action is loading
  const [showDuplicatesModal, setShowDuplicatesModal] = useState(false) // Duplicate detection modal
  const [showWatchLaterPanel, setShowWatchLaterPanel] = useState(false) // Watch Later queue panel
  const [showTVRemotePanel, setShowTVRemotePanel] = useState(false) // TV Remote control panel
  const [showUrlDownloaderPanel, setShowUrlDownloaderPanel] = useState(false) // URL Downloader panel
  // v2.3.0 Panel states
  const [showSceneDetector, setShowSceneDetector] = useState(false)
  const [showVideoChapters, setShowVideoChapters] = useState(false)
  const [showColorGrading, setShowColorGrading] = useState(false)
  const [showLoopRegion, setShowLoopRegion] = useState(false)
  const [showBookmarkManager, setShowBookmarkManager] = useState(false)
  const [showSubtitleEditor, setShowSubtitleEditor] = useState(false)
  const [showAudioVisualizer, setShowAudioVisualizer] = useState(false)
  const [showKeyframeExtractor, setShowKeyframeExtractor] = useState(false)
  const [showVideoFilters, setShowVideoFilters] = useState(false)
  const [showSplitScreen, setShowSplitScreen] = useState(false)
  const [showSmartCrop, setShowSmartCrop] = useState(false)
  const [showMetadataEditor, setShowMetadataEditor] = useState(false)
  const [showPlaylistSorter, setShowPlaylistSorter] = useState(false)
  const [showWatchProgress, setShowWatchProgress] = useState(false)
  const [showMediaExporter, setShowMediaExporter] = useState(false)
  const [showAITagger, setShowAITagger] = useState(false)
  const [showThumbnailSelector, setShowThumbnailSelector] = useState(false)
  const [showRelatedMedia, setShowRelatedMedia] = useState(false)
  const [showMediaTimeline, setShowMediaTimeline] = useState(false)
  const [showQuickNote, setShowQuickNote] = useState(false)
  const [showViewModeSelector, setShowViewModeSelector] = useState(false)
  const [showAutoPlaylist, setShowAutoPlaylist] = useState(false)
  const [showMediaMerger, setShowMediaMerger] = useState(false)
  const [showMediaRotator, setShowMediaRotator] = useState(false)
  const [showWatermarkAdder, setShowWatermarkAdder] = useState(false)
  const [showSpeedRamp, setShowSpeedRamp] = useState(false)
  const [showMediaQueue, setShowMediaQueue] = useState(false)
  const [showAspectRatioSwitcher, setShowAspectRatioSwitcher] = useState(false)
  const [activeToolMedia, setActiveToolMedia] = useState<MediaRow | null>(null) // Media for tool panels
  const [videoFiltersStyle, setVideoFiltersStyle] = useState<string>('none') // Applied video filters (CSS filter string)
  const [colorGradingStyle, setColorGradingStyle] = useState<{ brightness: number; contrast: number; saturation: number; hue: number; temperature: number; tint: number; shadows: number; highlights: number; vibrance: number } | null>(null) // Applied color grading
  const [wallAutoScroll, setWallAutoScroll] = useState(false) // Wall mode autoscroll
  const [wallScrollSpeed, setWallScrollSpeed] = useState(30) // Autoscroll speed (pixels per second)
  const wallScrollRef = useRef<HTMLDivElement>(null)
  const wallScrollAnimRef = useRef<number | null>(null)
  const [isDraggingFiles, setIsDraggingFiles] = useState(false) // Track file drag over library

  // Sync tileSize with settings when thumbnailSize changes
  useEffect(() => {
    const thumbSize = props.settings?.appearance?.thumbnailSize
    if (!thumbSize) return
    const sizeMap = { small: 160, medium: 220, large: 300 }
    const newSize = sizeMap[thumbSize]
    if (newSize) setTileSize(newSize)
  }, [props.settings?.appearance?.thumbnailSize])

  // Check for pending Watch Later panel open from FAB
  useEffect(() => {
    const shouldOpenWatchLater = sessionStorage.getItem('vault_open_watch_later')
    if (shouldOpenWatchLater === 'true') {
      sessionStorage.removeItem('vault_open_watch_later')
      setShowWatchLaterPanel(true)
    }
  }, [])

  // Handle tool panel events from context menu
  useEffect(() => {
    const handleToolEvent = (e: CustomEvent<{ tool: string; media: MediaRow }>) => {
      const { tool, media } = e.detail
      setActiveToolMedia(media)
      switch (tool) {
        case 'metadata': setShowMetadataEditor(true); break
        case 'ai-tagger': setShowAITagger(true); break
        case 'scene-detector': setShowSceneDetector(true); break
        case 'keyframe': setShowKeyframeExtractor(true); break
        case 'export': setShowMediaExporter(true); break
        case 'color-grading': setShowColorGrading(true); break
        case 'video-filters': setShowVideoFilters(true); break
        case 'bookmarks': setShowBookmarkManager(true); break
        case 'subtitles': setShowSubtitleEditor(true); break
        case 'chapters': setShowVideoChapters(true); break
        case 'smart-crop': setShowSmartCrop(true); break
        case 'rotate': setShowMediaRotator(true); break
        case 'watermark': setShowWatermarkAdder(true); break
        case 'thumbnail': setShowThumbnailSelector(true); break
        case 'related': setShowRelatedMedia(true); break
        case 'note': setShowQuickNote(true); break
      }
    }
    window.addEventListener('vault-open-tool', handleToolEvent as EventListener)
    return () => window.removeEventListener('vault-open-tool', handleToolEvent as EventListener)
  }, [])

  // Persist filter state to sessionStorage when filters change
  useEffect(() => {
    const filters = { query, activeTags, typeFilter, sortBy, sortAscending, pageSize, layout }
    try {
      sessionStorage.setItem('vault_library_filters', JSON.stringify(filters))
    } catch {}
  }, [query, activeTags, typeFilter, sortBy, sortAscending, pageSize, layout])

  // Save search to history (debounced to avoid saving every keystroke)
  const addToSearchHistory = useCallback((term: string) => {
    if (!term.trim() || term.length < 2) return
    setSearchHistory(prev => {
      const filtered = prev.filter(s => s.toLowerCase() !== term.toLowerCase())
      const next = [term, ...filtered].slice(0, 10) // Keep last 10 searches
      try {
        localStorage.setItem('vault_search_history', JSON.stringify(next))
      } catch {}
      return next
    })
  }, [])

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

  // Auto-open media if coming from Home dashboard with pending media
  useEffect(() => {
    const checkPendingMedia = () => {
      const pendingMedia = sessionStorage.getItem('vault_pending_media')
      if (pendingMedia) {
        sessionStorage.removeItem('vault_pending_media')
        // Wait a bit for media to load, then open the floating player
        setTimeout(() => {
          addFloatingPlayer(pendingMedia)
        }, 500)
      }
    }

    // Check immediately on mount
    checkPendingMedia()

    // Also listen for the event in case media is set after mount
    window.addEventListener('vault_pending_media_check', checkPendingMedia)
    return () => {
      window.removeEventListener('vault_pending_media_check', checkPendingMedia)
    }
  }, [addFloatingPlayer])

  // Check for incoming filter from Home dashboard (e.g., favorites)
  useEffect(() => {
    const pendingFilter = sessionStorage.getItem('vault_library_filter')
    if (pendingFilter) {
      sessionStorage.removeItem('vault_library_filter')
      if (pendingFilter === 'favorites') {
        // Apply favorites filter (rating:5)
        setQuery('rating:5')
        setTypeFilter('all')
      }
    }
  }, [])

  // Listen for custom events from other parts of the app (e.g., Command Palette)
  useEffect(() => {
    const handleOpenVideo = (e: CustomEvent) => {
      const mediaItem = e.detail
      if (mediaItem?.id) {
        addFloatingPlayer(mediaItem.id)
      }
    }
    const handleOpenWatchLater = () => setShowWatchLaterPanel(true)
    const handleOpenDuplicates = () => setShowDuplicatesModal(true)
    const handleOpenTVRemote = () => setShowTVRemotePanel(true)
    const handleOpenUrlDownloader = () => setShowUrlDownloaderPanel(true)
    // v2.3.0 Tool handlers
    const handleOpenMediaTimeline = () => setShowMediaTimeline(true)
    const handleOpenWatchProgress = () => setShowWatchProgress(true)
    const handleOpenMediaQueue = () => setShowMediaQueue(true)
    const handleOpenViewModes = () => setShowViewModeSelector(true)
    const handleOpenAutoPlaylists = () => setShowAutoPlaylist(true)
    const handleOpenSceneDetector = () => setShowSceneDetector(true)
    const handleOpenAITagger = () => setShowAITagger(true)
    const handleOpenBookmarks = () => setShowBookmarkManager(true)
    const handleOpenNotes = () => setShowQuickNote(true)
    const handleOpenRelated = () => setShowRelatedMedia(true)
    const handleOpenThumbnailSelector = () => setShowThumbnailSelector(true)
    const handleOpenExporter = () => setShowMediaExporter(true)

    window.addEventListener('vault-open-video', handleOpenVideo as EventListener)
    window.addEventListener('vault-open-watch-later', handleOpenWatchLater)
    window.addEventListener('vault-open-duplicates', handleOpenDuplicates)
    window.addEventListener('vault-open-tv-remote', handleOpenTVRemote)
    window.addEventListener('vault-open-url-downloader', handleOpenUrlDownloader)
    // v2.3.0 Tool event listeners
    window.addEventListener('vault-open-media-timeline', handleOpenMediaTimeline)
    window.addEventListener('vault-open-watch-progress', handleOpenWatchProgress)
    window.addEventListener('vault-open-media-queue', handleOpenMediaQueue)
    window.addEventListener('vault-open-view-modes', handleOpenViewModes)
    window.addEventListener('vault-open-auto-playlists', handleOpenAutoPlaylists)
    window.addEventListener('vault-open-scene-detector', handleOpenSceneDetector)
    window.addEventListener('vault-open-ai-tagger', handleOpenAITagger)
    window.addEventListener('vault-open-bookmarks', handleOpenBookmarks)
    window.addEventListener('vault-open-notes', handleOpenNotes)
    window.addEventListener('vault-open-related', handleOpenRelated)
    window.addEventListener('vault-open-thumbnail-selector', handleOpenThumbnailSelector)
    window.addEventListener('vault-open-exporter', handleOpenExporter)
    // Also listen for IPC event from notification clicks
    const unsubUrlDownloader = window.api.urlDownloader?.onOpenRequested?.(() => {
      handleOpenUrlDownloader()
    })
    return () => {
      window.removeEventListener('vault-open-video', handleOpenVideo as EventListener)
      window.removeEventListener('vault-open-watch-later', handleOpenWatchLater)
      window.removeEventListener('vault-open-duplicates', handleOpenDuplicates)
      window.removeEventListener('vault-open-tv-remote', handleOpenTVRemote)
      window.removeEventListener('vault-open-url-downloader', handleOpenUrlDownloader)
      // v2.3.0 Tool cleanup
      window.removeEventListener('vault-open-media-timeline', handleOpenMediaTimeline)
      window.removeEventListener('vault-open-watch-progress', handleOpenWatchProgress)
      window.removeEventListener('vault-open-media-queue', handleOpenMediaQueue)
      window.removeEventListener('vault-open-view-modes', handleOpenViewModes)
      window.removeEventListener('vault-open-auto-playlists', handleOpenAutoPlaylists)
      window.removeEventListener('vault-open-scene-detector', handleOpenSceneDetector)
      window.removeEventListener('vault-open-ai-tagger', handleOpenAITagger)
      window.removeEventListener('vault-open-bookmarks', handleOpenBookmarks)
      window.removeEventListener('vault-open-notes', handleOpenNotes)
      window.removeEventListener('vault-open-related', handleOpenRelated)
      window.removeEventListener('vault-open-thumbnail-selector', handleOpenThumbnailSelector)
      window.removeEventListener('vault-open-exporter', handleOpenExporter)
      unsubUrlDownloader?.()
    }
  }, [addFloatingPlayer])

  // Wall autoscroll effect
  useEffect(() => {
    if (!wallAutoScroll || layout !== 'wall') {
      if (wallScrollAnimRef.current) {
        cancelAnimationFrame(wallScrollAnimRef.current)
        wallScrollAnimRef.current = null
      }
      return
    }

    let lastTime = performance.now()
    const scroll = (currentTime: number) => {
      const el = wallScrollRef.current
      if (!el) return
      const delta = (currentTime - lastTime) / 1000 // seconds
      lastTime = currentTime
      el.scrollTop += wallScrollSpeed * delta
      // Loop back to top when reaching bottom
      if (el.scrollTop >= el.scrollHeight - el.clientHeight) {
        el.scrollTop = 0
      }
      wallScrollAnimRef.current = requestAnimationFrame(scroll)
    }
    wallScrollAnimRef.current = requestAnimationFrame(scroll)

    return () => {
      if (wallScrollAnimRef.current) {
        cancelAnimationFrame(wallScrollAnimRef.current)
        wallScrollAnimRef.current = null
      }
    }
  }, [wallAutoScroll, wallScrollSpeed, layout])

  // Listen for show-add-to-playlist events from Brainwash page
  useEffect(() => {
    const handleShowPlaylistPicker = async (e: Event) => {
      const customEvent = e as CustomEvent<{ mediaId: string }>
      const mediaId = customEvent.detail?.mediaId
      if (!mediaId) return

      try {
        const pls = await window.api.playlists.list()
        setBulkPlaylists(pls)
        setPlaylistPickerMediaId(mediaId)
        setShowPlaylistPicker(true)
      } catch (err) {
        console.error('[Library] Failed to load playlists for picker:', err)
      }
    }

    window.addEventListener('show-add-to-playlist', handleShowPlaylistPicker)
    return () => window.removeEventListener('show-add-to-playlist', handleShowPlaylistPicker)
  }, [])

  // Debounce search query to prevent excessive API calls
  const debouncedQuery = useDebounce(query, 300)

  // Randomize quick tags on mount and when tags change
  useEffect(() => {
    if (tags.length > 0) {
      setRandomQuickTags(shuffleTake(tags, 10))
    }
  }, [tags])

  const refreshQuickTags = () => {
    if (tags.length > 0) {
      setRandomQuickTags(shuffleTake(tags, 10))
    }
  }

  // Load all tags for search suggestions
  useEffect(() => {
    window.api.tags.listWithCounts?.().then((t: any) => {
      if (Array.isArray(t)) {
        setAllTagsForSearch(t.map((tag: any) => ({ name: tag.name, count: tag.count || 0 })))
      }
    }).catch(() => {})
  }, [])

  // Compute search suggestions based on current query
  const searchSuggestions = useMemo(() => {
    if (!query || query.length < 2) return []
    const q = query.toLowerCase().trim()

    // If user is typing a tag: prefix, suggest matching tags
    if (q.startsWith('tag:')) {
      const tagQuery = q.slice(4).toLowerCase()
      if (!tagQuery) return []
      return allTagsForSearch
        .filter(t => t.name.toLowerCase().includes(tagQuery))
        .slice(0, 8)
        .map(t => ({ type: 'tag' as const, value: `tag:${t.name}`, display: t.name, count: t.count }))
    }

    // If user is typing type:, suggest type options
    if (q.startsWith('type:')) {
      const typeOptions = ['video', 'image', 'gif']
      const typeQuery = q.slice(5).toLowerCase()
      return typeOptions
        .filter(t => t.includes(typeQuery))
        .map(t => ({ type: 'type' as const, value: `type:${t}`, display: t.toUpperCase() }))
    }

    // If user is typing rating:, suggest rating options
    if (q.startsWith('rating:')) {
      return [
        { type: 'rating' as const, value: 'rating:5', display: '5 stars' },
        { type: 'rating' as const, value: 'rating:>=4', display: '4+ stars' },
        { type: 'rating' as const, value: 'rating:>=3', display: '3+ stars' },
      ]
    }

    // Otherwise, suggest matching tags and special commands
    const suggestions: Array<{ type: 'tag' | 'command' | 'type' | 'rating'; value: string; display: string; count?: number }> = []

    // Add matching tags (fuzzy match)
    const matchingTags = allTagsForSearch
      .filter(t => t.name.toLowerCase().includes(q))
      .slice(0, 5)
      .map(t => ({ type: 'tag' as const, value: `tag:${t.name}`, display: t.name, count: t.count }))
    suggestions.push(...matchingTags)

    // Add command hints if query starts with relevant letters
    if ('tag'.startsWith(q)) suggestions.push({ type: 'command' as const, value: 'tag:', display: 'Filter by tag...' })
    if ('type'.startsWith(q)) suggestions.push({ type: 'command' as const, value: 'type:', display: 'Filter by type...' })
    if ('rating'.startsWith(q)) suggestions.push({ type: 'command' as const, value: 'rating:', display: 'Filter by rating...' })

    return suggestions.slice(0, 8)
  }, [query, allTagsForSearch])

  // Keyboard navigation state
  const [focusedIndex, setFocusedIndex] = useState(-1)
  const gridRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)

  // Track content area width for responsive layout
  const [contentWidth, setContentWidth] = useState(0)
  useEffect(() => {
    const el = contentRef.current
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContentWidth(entry.contentRect.width)
      }
    })
    ro.observe(el)
    setContentWidth(el.clientWidth)
    return () => ro.disconnect()
  }, [])

  // Persist scroll position to sessionStorage
  useEffect(() => {
    const el = contentRef.current
    if (!el) return

    // Restore scroll position on mount
    const savedScroll = sessionStorage.getItem('vault_library_scroll')
    if (savedScroll) {
      const pos = parseInt(savedScroll, 10)
      if (!isNaN(pos)) {
        // Use requestAnimationFrame to ensure DOM is ready
        requestAnimationFrame(() => {
          el.scrollTop = pos
        })
      }
    }

    // Save scroll position on scroll (debounced)
    let scrollTimer: number | null = null
    const handleScroll = () => {
      if (scrollTimer) clearTimeout(scrollTimer)
      scrollTimer = window.setTimeout(() => {
        sessionStorage.setItem('vault_library_scroll', String(el.scrollTop))
      }, 100)
    }
    el.addEventListener('scroll', handleScroll, { passive: true })

    return () => {
      if (scrollTimer) clearTimeout(scrollTimer)
      el.removeEventListener('scroll', handleScroll)
    }
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

  // Sort media - most sorting handled by database, only 'type' sort done locally
  const sortedMedia = useMemo(() => {
    // Database handles: newest, oldest, name, views, duration, size, random
    // Only 'type' needs local sorting
    if (sortBy === 'type') {
      const sorted = [...media]
      const typeOrder: Record<string, number> = { video: 0, gif: 1, image: 2 }
      return sorted.sort((a, b) => {
        const aOrder = typeOrder[a.type] ?? 3
        const bOrder = typeOrder[b.type] ?? 3
        if (aOrder !== bOrder) return aOrder - bOrder
        return (b.addedAt ?? 0) - (a.addedAt ?? 0)
      })
    }
    // For all other sorts, database already sorted the data
    return media
  }, [media, sortBy])

  // Effective page size: -1 means show all
  const effectivePageSize = pageSize === -1 ? sortedMedia.length : pageSize
  const totalPages = effectivePageSize > 0 ? Math.ceil(sortedMedia.length / effectivePageSize) : 1
  const showPagination = pageSize !== -1 && sortedMedia.length > effectivePageSize

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
        case 'w':
        case 'W':
          // Add focused media to Watch Later
          if (focusedIndex >= 0 && focusedIndex <= maxIndex) {
            e.preventDefault()
            const m = sortedMedia[startIndex + focusedIndex]
            if (m) {
              window.api.invoke('watchLater:add', m.id)
                .then(() => showToast('success', 'Added to Watch Later'))
                .catch(() => showToast('error', 'Failed to add to Watch Later'))
            }
          }
          break
        case 'l':
        case 'L':
          // Open Watch Later panel
          e.preventDefault()
          setShowWatchLaterPanel(true)
          break
        case 'e':
        case 'E':
          // Edit metadata for focused item
          if (focusedIndex >= 0 && focusedIndex <= maxIndex) {
            e.preventDefault()
            const m = sortedMedia[startIndex + focusedIndex]
            if (m) {
              setActiveToolMedia(m)
              setShowMetadataEditor(true)
            }
          }
          break
        case 't':
        case 'T':
          // AI Tagger for focused item
          if (e.shiftKey && focusedIndex >= 0 && focusedIndex <= maxIndex) {
            e.preventDefault()
            const m = sortedMedia[startIndex + focusedIndex]
            if (m) {
              setActiveToolMedia(m)
              setShowAITagger(true)
            }
          } else if (!e.shiftKey) {
            // Open media timeline
            e.preventDefault()
            setShowMediaTimeline(true)
          }
          break
        case 'q':
        case 'Q':
          // Open media queue
          e.preventDefault()
          setShowMediaQueue(true)
          break
        case 'v':
        case 'V':
          // View mode selector
          e.preventDefault()
          setShowViewModeSelector(true)
          break
        case 'p':
        case 'P':
          // Continue watching / Watch progress
          e.preventDefault()
          setShowWatchProgress(true)
          break
        case 's':
        case 'S':
          // Scene detection for focused video
          if (e.shiftKey && focusedIndex >= 0 && focusedIndex <= maxIndex) {
            e.preventDefault()
            const m = sortedMedia[startIndex + focusedIndex]
            if (m && m.type === 'video') {
              setActiveToolMedia(m)
              setShowSceneDetector(true)
            }
          }
          break
        case 'n':
        case 'N':
          // Quick note for focused item
          if (focusedIndex >= 0 && focusedIndex <= maxIndex) {
            e.preventDefault()
            const m = sortedMedia[startIndex + focusedIndex]
            if (m) {
              setActiveToolMedia(m)
              setShowQuickNote(true)
            }
          }
          break
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [focusedIndex, sortedMedia, effectivePageSize, currentPage, getColumnsCount, openIds, addFloatingPlayer, showToast, setActiveToolMedia, setShowMetadataEditor, setShowAITagger, setShowMediaTimeline, setShowMediaQueue, setShowViewModeSelector, setShowWatchProgress, setShowSceneDetector, setShowQuickNote])

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
      // Update daily challenge progress for rating items
      window.api.challenges?.updateProgress?.('rate_items', 1)
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

  // Parse advanced search syntax (tag:xxx, type:video, rating:5)
  const parseAdvancedSearch = useCallback((query: string) => {
    const result = {
      text: '',
      tags: [] as string[],
      type: null as MediaType | null,
      rating: null as number | null,
      ratingOp: '=' as '=' | '>' | '<' | '>=' | '<='
    }

    // Extract special filters
    const parts: string[] = []
    const tokens = query.split(/\s+/)

    for (const token of tokens) {
      // tag:tagname
      if (token.toLowerCase().startsWith('tag:')) {
        const tagName = token.slice(4).trim()
        if (tagName) result.tags.push(tagName)
      }
      // type:video, type:image, type:gif
      else if (token.toLowerCase().startsWith('type:')) {
        const typeVal = token.slice(5).toLowerCase()
        if (typeVal === 'video' || typeVal === 'image' || typeVal === 'gif') {
          result.type = typeVal
        }
      }
      // rating:5, rating:>3, rating:>=4, rating:<3
      else if (token.toLowerCase().startsWith('rating:')) {
        const ratingPart = token.slice(7)
        const match = ratingPart.match(/^(>=|<=|>|<|=)?(\d+)$/)
        if (match) {
          const op = match[1] || '='
          result.ratingOp = op as '=' | '>' | '<' | '>=' | '<='
          result.rating = parseInt(match[2], 10)
        }
      }
      // Regular search term
      else {
        parts.push(token)
      }
    }

    result.text = parts.join(' ').trim()
    return result
  }, [])

  const refresh = useCallback(async () => {
    setIsLoading(true)
    try {
      // Parse advanced search syntax
      const parsed = parseAdvancedSearch(debouncedQuery)
      const effectiveTags = [...activeTags, ...parsed.tags]
      const effectiveType = parsed.type || (typeFilter === 'all' ? undefined : typeFilter)

      // Map frontend sort options to database sort options, respecting ascending/descending
      let dbSortBy: string = sortBy
      if (sortBy === 'type') {
        dbSortBy = 'newest' // 'type' is sorted locally
      } else if (sortBy === 'newest' || sortBy === 'oldest') {
        // Date sorts are already directional
        dbSortBy = sortAscending ? 'oldest' : 'newest'
      } else if (sortBy === 'name') {
        dbSortBy = sortAscending ? 'name' : 'name_desc'
      } else if (sortBy === 'views') {
        dbSortBy = sortAscending ? 'views_asc' : 'views'
      } else if (sortBy === 'size') {
        dbSortBy = sortAscending ? 'size_asc' : 'size'
      } else if (sortBy === 'duration') {
        dbSortBy = sortAscending ? 'duration_asc' : 'duration'
      } else if (sortBy === 'random') {
        dbSortBy = 'random' // Random has no direction
      } else if (sortBy === 'recentlyViewed') {
        dbSortBy = sortAscending ? 'lastViewed_asc' : 'lastViewed'
      } else if (sortBy === 'rating') {
        dbSortBy = sortAscending ? 'rating_asc' : 'rating'
      }
      const m = await window.api.media.search({
        q: parsed.text,
        type: effectiveType,
        tags: effectiveTags,
        sortBy: dbSortBy
      })
      let items: MediaRow[] = extractItems<MediaRow>(m)

      // Apply rating filter from advanced syntax
      if (parsed.rating !== null) {
        const ratings = new Map<string, number>()
        // Fetch ratings for all items
        for (const item of items) {
          try {
            const stats = await window.api.media?.getStats?.(item.id)
            if (stats?.rating) ratings.set(item.id, stats.rating)
          } catch {}
        }
        items = items.filter(item => {
          const itemRating = ratings.get(item.id) ?? 0
          switch (parsed.ratingOp) {
            case '>': return itemRating > parsed.rating!
            case '<': return itemRating < parsed.rating!
            case '>=': return itemRating >= parsed.rating!
            case '<=': return itemRating <= parsed.rating!
            default: return itemRating === parsed.rating!
          }
        })
      }

      // Apply blacklist filtering
      const blacklistSettings = props.settings?.blacklist
      if (blacklistSettings?.enabled) {
        const blacklistedTags = new Set(blacklistSettings.tags || [])
        const blacklistedIds = new Set(blacklistSettings.mediaIds || [])
        items = items.filter(item => {
          // Filter out blacklisted media IDs
          if (blacklistedIds.has(item.id)) return false
          // Filter out items with blacklisted tags (would need tag info on item)
          // For now, we'll rely on the mediaIds blacklist
          return true
        })
      }

      // Compute type counts
      const counts = { video: 0, image: 0, gif: 0 }
      for (const item of items) {
        if (item.type === 'video') counts.video++
        else if (item.type === 'image') counts.image++
        else if (item.type === 'gif') counts.gif++
      }
      setTypeCounts(counts)
      setTotalCount(items.length)

      // Fetch stats for all items in a single batch call (major performance optimization)
      const statsMap = new Map<string, { rating: number; viewCount: number; oCount: number }>()
      const newLikedIds = new Set<string>()
      try {
        const mediaIds = items.map(item => item.id)
        const batchStats = await window.api.media.getStatsBatch(mediaIds)
        for (const [id, stats] of Object.entries(batchStats) as [string, { rating: number; viewCount: number; oCount: number }][]) {
          statsMap.set(id, stats)
          if (stats.rating >= 5) {
            newLikedIds.add(id)
          }
        }
      } catch (err) {
        console.warn('[Library] Failed to fetch batch stats:', err)
      }
      setMediaStats(statsMap)
      setLikedIds(newLikedIds)

      setMedia(items)
    } finally {
      setIsLoading(false)
    }
  }, [debouncedQuery, typeFilter, activeTags, sortBy, sortAscending, parseAdvancedSearch])

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

    // Listen for media-deleted events (from context menu)
    const handleMediaDeleted = () => {
      void refresh()
    }
    window.addEventListener('media-deleted', handleMediaDeleted)

    return () => {
      alive = false
      unsub?.()
      window.removeEventListener('media-deleted', handleMediaDeleted)
    }
  }, [])

  useEffect(() => {
    setCurrentPage(1) // Reset to first page when filters change
    // Reset scroll to top when filters change
    if (contentRef.current) {
      contentRef.current.scrollTop = 0
      sessionStorage.setItem('vault_library_scroll', '0')
    }
    void refresh()
  }, [debouncedQuery, activeTags.join('|'), typeFilter, sortBy, sortAscending])

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
    if (layout === 'wall') {
      // Wall mode: masonry layout with ZERO gaps - items touch each other
      return {
        columnCount: mosaicCols,
        columnGap: '0px',
        width: '100%',
      }
    }
    if (layout === 'mosaic') {
      const gap = mosaicCols >= 7 ? 4 : mosaicCols >= 5 ? 6 : 8
      // Masonry-style column layout - fills top-to-bottom, then next column
      return {
        columnCount: mosaicCols,
        columnGap: `${gap}px`,
        width: '100%',
      }
    }
    return {
      display: 'grid',
      gridTemplateColumns: `repeat(auto-fill, minmax(${tileSize}px, 1fr))`,
      gap: '12px',
      width: '100%',
      minWidth: 0,
    }
  }

  return (
    <div className="h-full w-full flex flex-col overflow-hidden">
      <TopBar
        title="Library"
        right={
          <div className="flex items-center gap-2">
            {/* Layout toggle: Mosaic / Grid / Wall */}
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
              <button
                onClick={() => setLayout('wall')}
                className={cn(
                  'px-2.5 py-1.5 text-[10px] font-medium transition',
                  layout === 'wall' ? 'bg-[var(--primary)]/30 text-white' : 'text-white/50 hover:text-white/80'
                )}
                title="StashDB-style wall with auto-playing previews"
              >
                Wall
              </button>
            </div>

            {/* Layout-specific slider */}
            {layout === 'wall' ? (
              <>
                <div className="flex items-center gap-2 bg-black/20 rounded-lg px-3 py-1.5">
                  <span className="text-[10px] text-[var(--muted)]">Cols</span>
                  <input
                    type="range"
                    min={3}
                    max={10}
                    step={1}
                    value={mosaicCols}
                    onChange={(e) => { setMosaicCols(Number(e.target.value)) }}
                    className="w-20 h-1 accent-[var(--primary)] cursor-pointer"
                    title={`${mosaicCols} columns`}
                  />
                  <span className="text-[10px] text-[var(--muted)] w-4 text-center">{mosaicCols}</span>
                </div>
                {/* Autoscroll controls */}
                <button
                  onClick={() => setWallAutoScroll(!wallAutoScroll)}
                  className={cn(
                    'p-2 rounded-lg transition-all flex items-center gap-1',
                    wallAutoScroll ? 'bg-[var(--primary)]/20 text-[var(--primary)]' : 'bg-white/5 text-white/50'
                  )}
                  title={wallAutoScroll ? 'Stop autoscroll' : 'Start autoscroll'}
                >
                  {wallAutoScroll ? <Pause size={14} /> : <Play size={14} />}
                  <span className="text-[10px]">Auto</span>
                </button>
                {wallAutoScroll && (
                  <div className="flex items-center gap-2 bg-black/20 rounded-lg px-3 py-1.5">
                    <span className="text-[10px] text-[var(--muted)]">Speed</span>
                    <input
                      type="range"
                      min={10}
                      max={100}
                      step={5}
                      value={wallScrollSpeed}
                      onChange={(e) => setWallScrollSpeed(Number(e.target.value))}
                      className="w-16 h-1 accent-[var(--primary)] cursor-pointer"
                    />
                  </div>
                )}
              </>
            ) : layout === 'mosaic' ? (
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
              title={selectionMode ? 'Cancel selection mode' : 'Enable multi-select mode for bulk actions'}
              className="flex items-center gap-1.5"
            >
              {selectionMode ? <X size={14} /> : <LayoutGrid size={14} />}
              <span className="text-xs">{selectionMode ? 'Cancel' : 'Select'}</span>
            </Btn>

            <Btn onClick={() => void refresh()} title="Refresh library" className="flex items-center gap-2">
              <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
            </Btn>

            {/* Watch Later */}
            <Btn
              tone="ghost"
              onClick={() => setShowWatchLaterPanel(true)}
              className="flex items-center gap-1.5"
              title="Watch Later queue"
            >
              <Clock size={14} />
              <span className="text-xs hidden sm:inline">Watch Later</span>
            </Btn>

            {/* Find Duplicates */}
            <Btn
              tone="ghost"
              onClick={() => setShowDuplicatesModal(true)}
              className="flex items-center gap-1.5"
              title="Find duplicate files"
            >
              <AlertCircle size={14} />
              <span className="text-xs hidden sm:inline">Duplicates</span>
            </Btn>

            {/* TV Remote */}
            <Btn
              tone="ghost"
              onClick={() => setShowTVRemotePanel(true)}
              className="flex items-center gap-1.5"
              title="Open TV Remote - Cast media to your TV"
            >
              <Tv size={14} />
              <span className="text-xs hidden sm:inline">TV</span>
            </Btn>

            {/* URL Downloader */}
            <Btn
              tone="ghost"
              onClick={() => setShowUrlDownloaderPanel(true)}
              className="flex items-center gap-1.5"
              title="Download videos from URLs"
            >
              <Download size={14} />
              <span className="text-xs hidden sm:inline">Download</span>
            </Btn>

            {/* Advanced Tools Dropdown */}
            <div className="relative group">
              <Btn
                tone="ghost"
                className="flex items-center gap-1.5"
                title="Advanced Tools"
              >
                <Wand size={14} />
                <span className="text-xs hidden sm:inline">Tools</span>
                <ChevronDown size={12} />
              </Btn>
              <div className="absolute right-0 top-full mt-1 w-64 max-h-96 overflow-y-auto bg-[var(--panel)] border border-[var(--border)] rounded-xl shadow-2xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50">
                <div className="p-2 border-b border-[var(--border)]">
                  <span className="text-xs text-[var(--muted)] font-medium">Video Tools</span>
                </div>
                <div className="p-1">
                  <button onClick={() => { if (media[0]) { setActiveToolMedia(media[0]); setShowSceneDetector(true) }}} className="w-full flex items-center gap-2 px-3 py-2 hover:bg-[var(--primary)]/10 rounded-lg text-sm text-left"><Activity size={14} />Scene Detector</button>
                  <button onClick={() => { if (media[0]) { setActiveToolMedia(media[0]); setShowVideoChapters(true) }}} className="w-full flex items-center gap-2 px-3 py-2 hover:bg-[var(--primary)]/10 rounded-lg text-sm text-left"><ListVideo size={14} />Video Chapters</button>
                  <button onClick={() => { if (media[0]) { setActiveToolMedia(media[0]); setShowColorGrading(true) }}} className="w-full flex items-center gap-2 px-3 py-2 hover:bg-[var(--primary)]/10 rounded-lg text-sm text-left"><Sliders size={14} />Color Grading</button>
                  <button onClick={() => { if (media[0]) { setActiveToolMedia(media[0]); setShowVideoFilters(true) }}} className="w-full flex items-center gap-2 px-3 py-2 hover:bg-[var(--primary)]/10 rounded-lg text-sm text-left"><Sparkles size={14} />Video Filters</button>
                  <button onClick={() => setShowSplitScreen(true)} className="w-full flex items-center gap-2 px-3 py-2 hover:bg-[var(--primary)]/10 rounded-lg text-sm text-left"><Grid3X3 size={14} />Split Screen</button>
                  <button onClick={() => { if (media[0]) { setActiveToolMedia(media[0]); setShowKeyframeExtractor(true) }}} className="w-full flex items-center gap-2 px-3 py-2 hover:bg-[var(--primary)]/10 rounded-lg text-sm text-left"><Film size={14} />Keyframe Extractor</button>
                </div>
                <div className="p-2 border-t border-b border-[var(--border)]">
                  <span className="text-xs text-[var(--muted)] font-medium">Edit Tools</span>
                </div>
                <div className="p-1">
                  <button onClick={() => { if (media[0]) { setActiveToolMedia(media[0]); setShowSmartCrop(true) }}} className="w-full flex items-center gap-2 px-3 py-2 hover:bg-[var(--primary)]/10 rounded-lg text-sm text-left"><Crop size={14} />Smart Crop</button>
                  <button onClick={() => { if (media[0]) { setActiveToolMedia(media[0]); setShowMediaRotator(true) }}} className="w-full flex items-center gap-2 px-3 py-2 hover:bg-[var(--primary)]/10 rounded-lg text-sm text-left"><RotateCw size={14} />Rotate & Flip</button>
                  <button onClick={() => { if (media[0]) { setActiveToolMedia(media[0]); setShowWatermarkAdder(true) }}} className="w-full flex items-center gap-2 px-3 py-2 hover:bg-[var(--primary)]/10 rounded-lg text-sm text-left"><Type size={14} />Add Watermark</button>
                  <button onClick={() => { if (media[0]) { setActiveToolMedia(media[0]); setShowThumbnailSelector(true) }}} className="w-full flex items-center gap-2 px-3 py-2 hover:bg-[var(--primary)]/10 rounded-lg text-sm text-left"><ImageIcon size={14} />Thumbnail Selector</button>
                  <button onClick={() => setShowMediaMerger(true)} className="w-full flex items-center gap-2 px-3 py-2 hover:bg-[var(--primary)]/10 rounded-lg text-sm text-left"><Scissors size={14} />Merge Videos</button>
                  <button onClick={() => { if (media[0]) { setActiveToolMedia(media[0]); setShowMediaExporter(true) }}} className="w-full flex items-center gap-2 px-3 py-2 hover:bg-[var(--primary)]/10 rounded-lg text-sm text-left"><Download size={14} />Export Media</button>
                </div>
                <div className="p-2 border-t border-b border-[var(--border)]">
                  <span className="text-xs text-[var(--muted)] font-medium">Organization</span>
                </div>
                <div className="p-1">
                  <button onClick={() => { if (media[0]) { setActiveToolMedia(media[0]); setShowMetadataEditor(true) }}} className="w-full flex items-center gap-2 px-3 py-2 hover:bg-[var(--primary)]/10 rounded-lg text-sm text-left"><PenTool size={14} />Metadata Editor</button>
                  <button onClick={() => { if (media[0]) { setActiveToolMedia(media[0]); setShowAITagger(true) }}} className="w-full flex items-center gap-2 px-3 py-2 hover:bg-[var(--primary)]/10 rounded-lg text-sm text-left"><Brain size={14} />AI Auto-Tagger</button>
                  <button onClick={() => { if (media[0]) { setActiveToolMedia(media[0]); setShowBookmarkManager(true) }}} className="w-full flex items-center gap-2 px-3 py-2 hover:bg-[var(--primary)]/10 rounded-lg text-sm text-left"><Bookmark size={14} />Bookmark Manager</button>
                  <button onClick={() => { if (media[0]) { setActiveToolMedia(media[0]); setShowSubtitleEditor(true) }}} className="w-full flex items-center gap-2 px-3 py-2 hover:bg-[var(--primary)]/10 rounded-lg text-sm text-left"><MessageSquare size={14} />Subtitle Editor</button>
                  <button onClick={() => { if (media[0]) { setActiveToolMedia(media[0]); setShowQuickNote(true) }}} className="w-full flex items-center gap-2 px-3 py-2 hover:bg-[var(--primary)]/10 rounded-lg text-sm text-left"><FileText size={14} />Quick Note</button>
                </div>
                <div className="p-2 border-t border-b border-[var(--border)]">
                  <span className="text-xs text-[var(--muted)] font-medium">Views & Playlists</span>
                </div>
                <div className="p-1">
                  <button onClick={() => setShowViewModeSelector(true)} className="w-full flex items-center gap-2 px-3 py-2 hover:bg-[var(--primary)]/10 rounded-lg text-sm text-left"><LayoutGrid size={14} />View Modes</button>
                  <button onClick={() => setShowMediaTimeline(true)} className="w-full flex items-center gap-2 px-3 py-2 hover:bg-[var(--primary)]/10 rounded-lg text-sm text-left"><Calendar size={14} />Media Timeline</button>
                  <button onClick={() => setShowWatchProgress(true)} className="w-full flex items-center gap-2 px-3 py-2 hover:bg-[var(--primary)]/10 rounded-lg text-sm text-left"><Play size={14} />Continue Watching</button>
                  <button onClick={() => setShowAutoPlaylist(true)} className="w-full flex items-center gap-2 px-3 py-2 hover:bg-[var(--primary)]/10 rounded-lg text-sm text-left"><ListMusic size={14} />Auto Playlists</button>
                  <button onClick={() => setShowPlaylistSorter(true)} className="w-full flex items-center gap-2 px-3 py-2 hover:bg-[var(--primary)]/10 rounded-lg text-sm text-left"><Layers size={14} />Playlist Sorter</button>
                  <button onClick={() => setShowMediaQueue(true)} className="w-full flex items-center gap-2 px-3 py-2 hover:bg-[var(--primary)]/10 rounded-lg text-sm text-left"><ListVideo size={14} />Media Queue</button>
                  <button onClick={() => { if (media[0]) { setActiveToolMedia(media[0]); setShowRelatedMedia(true) }}} className="w-full flex items-center gap-2 px-3 py-2 hover:bg-[var(--primary)]/10 rounded-lg text-sm text-left"><Sparkles size={14} />Related Media</button>
                </div>
              </div>
            </div>
          </div>
        }
      >
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]" aria-hidden="true" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setTimeout(() => setSearchFocused(false), 200)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && query.trim()) {
                  addToSearchHistory(query.trim())
                }
              }}
              placeholder="Search..."
              aria-label="Search media library"
              aria-describedby="search-tips"
              role="searchbox"
              autoComplete="off"
              className="w-full pl-10 pr-3 py-2 rounded-xl bg-black/20 border border-[var(--border)] outline-none focus:border-[var(--primary)]/50 text-sm"
            />
            {isLoading && (
              <RefreshCw size={14} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-[var(--muted)]" />
            )}
            {/* Search history/saved dropdown */}
            {searchFocused && (
              <div className="absolute top-full left-0 right-0 mt-1 z-50 bg-[var(--panel)] border border-[var(--border)] rounded-xl shadow-lg overflow-hidden max-h-80 overflow-y-auto">
                {/* Saved Searches section */}
                {savedSearches.length > 0 && (
                  <>
                    <div className="px-3 py-1.5 text-[10px] text-[var(--muted)] uppercase tracking-wide border-b border-[var(--border)] flex items-center justify-between bg-[var(--primary)]/5">
                      <span className="flex items-center gap-1"><Bookmark size={10} /> Saved Searches</span>
                    </div>
                    {savedSearches.map((saved, i) => (
                      <div key={i} className="flex items-center group">
                        <button
                          onClick={() => {
                            setQuery(saved.query)
                            setSearchFocused(false)
                          }}
                          className="flex-1 px-3 py-2 text-left text-sm hover:bg-white/10 transition flex items-center gap-2"
                        >
                          <Bookmark size={12} className="text-[var(--primary)]" />
                          <span className="font-medium">{saved.name}</span>
                          <span className="text-[var(--muted)] text-xs truncate ml-1">{saved.query}</span>
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            const updated = savedSearches.filter((_, idx) => idx !== i)
                            setSavedSearches(updated)
                            localStorage.setItem('vault_saved_searches', JSON.stringify(updated))
                          }}
                          className="px-2 opacity-0 group-hover:opacity-100 text-[var(--muted)] hover:text-red-400 transition"
                        >
                          <X size={12} />
                        </button>
                      </div>
                    ))}
                  </>
                )}

                {/* Recent searches section - only when no query */}
                {!query && searchHistory.length > 0 && (
                  <>
                    <div className="px-3 py-1.5 text-[10px] text-[var(--muted)] uppercase tracking-wide border-b border-[var(--border)] flex items-center justify-between">
                      <span>Recent Searches</span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          setSearchHistory([])
                          localStorage.removeItem('vault_search_history')
                        }}
                        className="text-[var(--muted)] hover:text-white transition"
                      >
                        Clear
                      </button>
                    </div>
                    {searchHistory.map((term, i) => (
                      <button
                        key={i}
                        onClick={() => {
                          setQuery(term)
                          setSearchFocused(false)
                        }}
                        className="w-full px-3 py-2 text-left text-sm hover:bg-white/10 transition flex items-center gap-2"
                      >
                        <Clock size={12} className="text-[var(--muted)]" />
                        {term}
                      </button>
                    ))}
                  </>
                )}

                {/* Search suggestions - when query is not empty */}
                {query && searchSuggestions.length > 0 && (
                  <>
                    <div className="px-3 py-1.5 text-[10px] text-[var(--muted)] uppercase tracking-wide border-b border-[var(--border)] bg-black/20">
                      Suggestions
                    </div>
                    {searchSuggestions.map((suggestion, i) => (
                      <button
                        key={i}
                        onClick={() => {
                          if (suggestion.type === 'command') {
                            // For commands, just set the prefix
                            setQuery(suggestion.value)
                          } else {
                            // For actual values, set and search
                            setQuery(suggestion.value)
                            setSearchFocused(false)
                          }
                        }}
                        className="w-full px-3 py-2 text-left text-sm hover:bg-white/10 transition flex items-center gap-2"
                      >
                        {suggestion.type === 'tag' && <Tag size={12} className="text-blue-400" />}
                        {suggestion.type === 'type' && <Play size={12} className="text-green-400" />}
                        {suggestion.type === 'rating' && <Star size={12} className="text-yellow-400" />}
                        {suggestion.type === 'command' && <Search size={12} className="text-[var(--muted)]" />}
                        <span className={suggestion.type === 'command' ? 'text-[var(--muted)]' : ''}>
                          {suggestion.display}
                        </span>
                        {'count' in suggestion && suggestion.count !== undefined && (
                          <span className="text-[10px] text-[var(--muted)] ml-auto">({suggestion.count})</span>
                        )}
                      </button>
                    ))}
                  </>
                )}

                {/* Save current search button - when query is not empty */}
                {query && (
                  <div className="px-3 py-2 border-b border-[var(--border)]">
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        setShowSaveSearchModal(true)
                        setSaveSearchName('')
                      }}
                      className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-[var(--primary)]/20 text-sm text-[var(--primary)] transition"
                    >
                      <Bookmark size={14} />
                      Save this search
                    </button>
                  </div>
                )}

                {/* Search tips */}
                {!query && (
                  <div id="search-tips" className="px-3 py-2 border-t border-[var(--border)] bg-black/20">
                    <div className="text-[10px] text-[var(--muted)] uppercase tracking-wide mb-1.5">Search Tips</div>
                    <div className="text-[11px] text-white/60 space-y-1">
                      <div><code className="bg-white/10 px-1 rounded">tag:name</code> filter by tag</div>
                      <div><code className="bg-white/10 px-1 rounded">type:video</code> video/image/gif</div>
                      <div><code className="bg-white/10 px-1 rounded">rating:5</code> or <code className="bg-white/10 px-1 rounded">rating:&gt;3</code></div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Content Type Filter - Pill buttons */}
          <div className="flex items-center bg-black/20 rounded-lg overflow-hidden">
            <button
              onClick={() => setTypeFilter('all')}
              title="Show all media types"
              className={cn(
                'px-2.5 py-1.5 text-[10px] font-medium transition flex items-center gap-1',
                typeFilter === 'all' ? 'bg-white/20 text-white' : 'text-white/50 hover:text-white/80'
              )}
            >
              All
            </button>
            <button
              onClick={() => setTypeFilter('video')}
              title="Show only videos"
              className={cn(
                'px-2.5 py-1.5 text-[10px] font-medium transition flex items-center gap-1',
                typeFilter === 'video' ? 'bg-blue-500/30 text-blue-300' : 'text-white/50 hover:text-white/80'
              )}
            >
              <Play size={10} className="fill-current" />
              Videos
              {typeCounts.video > 0 && <span className="text-[9px] opacity-60">({typeCounts.video})</span>}
            </button>
            <button
              onClick={() => setTypeFilter('image')}
              title="Show only images"
              className={cn(
                'px-2.5 py-1.5 text-[10px] font-medium transition flex items-center gap-1',
                typeFilter === 'image' ? 'bg-green-500/30 text-green-300' : 'text-white/50 hover:text-white/80'
              )}
            >
              <Eye size={10} />
              Images
              {typeCounts.image > 0 && <span className="text-[9px] opacity-60">({typeCounts.image})</span>}
            </button>
            <button
              onClick={() => setTypeFilter('gif')}
              title="Show only animated GIFs"
              className={cn(
                'px-2.5 py-1.5 text-[10px] font-medium transition flex items-center gap-1',
                typeFilter === 'gif' ? 'bg-purple-500/30 text-purple-300' : 'text-white/50 hover:text-white/80'
              )}
            >
              <Repeat size={10} />
              GIFs
              {typeCounts.gif > 0 && <span className="text-[9px] opacity-60">({typeCounts.gif})</span>}
            </button>
          </div>

          {/* Sort By */}
          <div className="flex items-center gap-1">
            <Dropdown
              value={sortBy}
              onChange={(v) => {
                setSortBy(v as SortOption)
                if (v === 'random') setRandomSeed(Date.now())
              }}
              options={[
                { value: 'newest', label: 'Date Added' },
                { value: 'recentlyViewed', label: 'Recently Viewed' },
                { value: 'rating', label: 'Rating' },
                { value: 'name', label: 'Name' },
                { value: 'type', label: 'Type' },
                { value: 'size', label: 'Size' },
                { value: 'duration', label: 'Duration' },
                { value: 'views', label: 'Views' },
                { value: 'random', label: '🎲 Random' },
              ]}
            />
            {/* Sort direction toggle (not for random) */}
            {sortBy !== 'random' && (
              <button
                onClick={() => setSortAscending(!sortAscending)}
                className="p-2 rounded-xl bg-black/20 hover:bg-white/10 border border-[var(--border)] transition-all hover:scale-105"
                title={sortAscending ? 'Ascending (click for Descending)' : 'Descending (click for Ascending)'}
              >
                {sortAscending ? (
                  <ArrowUp size={14} className="text-[var(--primary)]" />
                ) : (
                  <ArrowDown size={14} className="text-[var(--primary)]" />
                )}
              </button>
            )}
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

          {/* Play Shuffled - opens Feed with random videos */}
          <button
            onClick={() => props.onNavigateToFeed?.()}
            className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-medium rounded-lg bg-gradient-to-r from-pink-500/20 to-orange-500/20 hover:from-pink-500/30 hover:to-orange-500/30 border border-pink-500/30 transition-all hover:scale-105"
            title="Play videos in Feed (shuffled)"
          >
            <Play size={12} className="text-pink-400" />
            <span className="text-pink-300">Play Shuffled</span>
          </button>

          {/* Items per page */}
          <Dropdown
            value={pageSize}
            onChange={(v) => {
              setPageSize(Number(v))
              setCurrentPage(1) // Reset to first page when changing page size
            }}
            options={PAGE_SIZE_OPTIONS.map(opt => ({
              value: opt.value,
              label: opt.value === -1 ? 'All' : `${opt.label}/page`
            }))}
          />

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

      {/* Quick Filters Bar - common filter presets */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-[var(--border)] bg-[var(--surface)]/30 overflow-x-auto">
        <span className="text-[10px] text-[var(--muted)] uppercase tracking-wide shrink-0">Quick:</span>
        <button
          onClick={() => {
            setSortBy('newest')
            setSortAscending(false)
            setTypeFilter('all')
            setActiveTags([])
          }}
          className={cn(
            'px-2.5 py-1 rounded-full text-[11px] font-medium transition shrink-0',
            sortBy === 'newest' && typeFilter === 'all' && activeTags.length === 0
              ? 'bg-[var(--primary)] text-white'
              : 'bg-white/5 text-[var(--text-muted)] hover:bg-white/10 hover:text-white'
          )}
        >
          Recent
        </button>
        <button
          onClick={() => {
            setTypeFilter('video')
            setActiveTags([])
          }}
          className={cn(
            'px-2.5 py-1 rounded-full text-[11px] font-medium transition shrink-0 flex items-center gap-1',
            typeFilter === 'video'
              ? 'bg-blue-500 text-white'
              : 'bg-white/5 text-[var(--text-muted)] hover:bg-white/10 hover:text-white'
          )}
        >
          <Play size={10} className="fill-current" /> Videos
        </button>
        <button
          onClick={() => {
            setTypeFilter('image')
            setActiveTags([])
          }}
          className={cn(
            'px-2.5 py-1 rounded-full text-[11px] font-medium transition shrink-0 flex items-center gap-1',
            typeFilter === 'image'
              ? 'bg-purple-500 text-white'
              : 'bg-white/5 text-[var(--text-muted)] hover:bg-white/10 hover:text-white'
          )}
        >
          <ImageIcon size={10} /> Images
        </button>
        <button
          onClick={() => {
            // Filter to favorites (rating:5)
            setQuery('rating:5')
            setTypeFilter('all')
          }}
          className={cn(
            'px-2.5 py-1 rounded-full text-[11px] font-medium transition shrink-0 flex items-center gap-1',
            query === 'rating:5'
              ? 'bg-red-500 text-white'
              : 'bg-white/5 text-[var(--text-muted)] hover:bg-white/10 hover:text-white'
          )}
        >
          <Heart size={10} className="fill-current" /> Favorites
        </button>
        <button
          onClick={() => {
            setSortBy('views')
            setSortAscending(false)
            setTypeFilter('all')
          }}
          className={cn(
            'px-2.5 py-1 rounded-full text-[11px] font-medium transition shrink-0 flex items-center gap-1',
            sortBy === 'views'
              ? 'bg-amber-500 text-white'
              : 'bg-white/5 text-[var(--text-muted)] hover:bg-white/10 hover:text-white'
          )}
        >
          <Eye size={10} /> Most Viewed
        </button>
        <button
          onClick={() => {
            setSortBy('duration')
            setSortAscending(false)
            setTypeFilter('video')
          }}
          className={cn(
            'px-2.5 py-1 rounded-full text-[11px] font-medium transition shrink-0 flex items-center gap-1',
            sortBy === 'duration'
              ? 'bg-cyan-500 text-white'
              : 'bg-white/5 text-[var(--text-muted)] hover:bg-white/10 hover:text-white'
          )}
        >
          <Clock size={10} /> Longest
        </button>
        <button
          onClick={() => {
            setTypeFilter('gif')
            setActiveTags([])
          }}
          className={cn(
            'px-2.5 py-1 rounded-full text-[11px] font-medium transition shrink-0 flex items-center gap-1',
            typeFilter === 'gif'
              ? 'bg-pink-500 text-white'
              : 'bg-white/5 text-[var(--text-muted)] hover:bg-white/10 hover:text-white'
          )}
        >
          <Sparkles size={10} /> GIFs
        </button>
        <button
          onClick={() => {
            setSortBy('random')
            setTypeFilter('all')
          }}
          className={cn(
            'px-2.5 py-1 rounded-full text-[11px] font-medium transition shrink-0 flex items-center gap-1',
            sortBy === 'random'
              ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white'
              : 'bg-white/5 text-[var(--text-muted)] hover:bg-white/10 hover:text-white'
          )}
        >
          <Shuffle size={10} /> Shuffle
        </button>
        {query && (
          <button
            onClick={() => {
              setQuery('')
              setTypeFilter('all')
              setActiveTags([])
              setSortBy('newest')
            }}
            className="px-2.5 py-1 rounded-full text-[11px] font-medium transition shrink-0 flex items-center gap-1 bg-red-500/20 text-red-400 hover:bg-red-500/30"
          >
            <X size={10} /> Clear
          </button>
        )}
      </div>

      <div className="flex-1 flex min-w-0 w-full relative overflow-hidden">
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
                const t = await window.api.tags.listWithCounts?.() ?? await window.api.tags.list()
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

            {/* ═══════════════════════════════════════════════════════════════
                Categories Section - AI-generated category tags (category:*)
                ═══════════════════════════════════════════════════════════════ */}
            {(() => {
              // Extract category tags from all tags
              const categoryTags = tags.filter(t => t.name.startsWith('category:'))
              if (categoryTags.length === 0) return null

              // Group categories by type
              const groups: Record<string, Array<{ name: string; display: string; count?: number }>> = {
                'Gender': [],
                'Subject': [],
                'Body': [],
                'Content': [],
                'Type': []
              }

              categoryTags.forEach(t => {
                const name = t.name
                const suffix = name.replace('category:', '')
                const display = suffix.replace(/-/g, ' ')
                const item = { name, display, count: t.count }

                if (['female', 'male'].includes(suffix)) {
                  groups['Gender'].push(item)
                } else if (['solo', 'couple', 'group'].includes(suffix)) {
                  groups['Subject'].push(item)
                } else if (['slim', 'athletic', 'curvy', 'plus-size'].includes(suffix)) {
                  groups['Body'].push(item)
                } else if (['sfw', 'suggestive', 'explicit'].includes(suffix)) {
                  groups['Content'].push(item)
                } else if (['animated', 'live-action'].includes(suffix)) {
                  groups['Type'].push(item)
                }
              })

              // Filter out empty groups
              const nonEmptyGroups = Object.entries(groups).filter(([_, items]) => items.length > 0)
              if (nonEmptyGroups.length === 0) return null

              return (
                <div className="mt-3 pt-3 border-t border-[var(--border)]">
                  <div className="flex items-center gap-1 mb-2">
                    <span className="text-[10px] text-[var(--muted)] flex items-center gap-1">
                      <Tag size={10} className="text-purple-400" />
                      Categories
                    </span>
                  </div>
                  <div className="space-y-2">
                    {nonEmptyGroups.map(([group, items]) => (
                      <div key={group}>
                        <div className="text-[8px] text-[var(--muted)] uppercase tracking-wider mb-1">{group}</div>
                        <div className="flex flex-wrap gap-1">
                          {items.map(item => {
                            const active = activeTags.includes(item.name)
                            return (
                              <button
                                key={item.name}
                                onClick={() => toggleTag(item.name)}
                                className={cn(
                                  'px-1.5 py-0.5 rounded text-[9px] truncate',
                                  'transition-all duration-200',
                                  active
                                    ? 'bg-purple-500/30 text-purple-300 border border-purple-500/50'
                                    : 'bg-black/30 text-[var(--muted)] border border-[var(--border)] hover:border-purple-500/30 hover:text-purple-300'
                                )}
                                title={`${item.display}${item.count ? ` (${item.count})` : ''}`}
                              >
                                {item.display}
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })()}
          </div>
        </div>

        <div
          ref={(el) => {
            (contentRef as React.MutableRefObject<HTMLDivElement | null>).current = el
            if (layout === 'wall') (wallScrollRef as React.MutableRefObject<HTMLDivElement | null>).current = el
          }}
          className={cn(
            "flex-1 min-w-0 overflow-auto transition-all duration-300 ease-in-out relative",
            layout === 'wall' ? 'p-0' : 'p-4'
          )}
          onDragOver={(e) => {
            e.preventDefault()
            e.stopPropagation()
            if (e.dataTransfer.types.includes('Files')) {
              setIsDraggingFiles(true)
            }
          }}
          onDragLeave={(e) => {
            e.preventDefault()
            e.stopPropagation()
            // Only hide if leaving the container entirely
            if (!e.currentTarget.contains(e.relatedTarget as Node)) {
              setIsDraggingFiles(false)
            }
          }}
          onDrop={async (e) => {
            e.preventDefault()
            e.stopPropagation()
            setIsDraggingFiles(false)

            const files = e.dataTransfer.files
            if (files.length === 0) return

            // Get file paths from dropped files
            const filePaths: string[] = []
            for (let i = 0; i < files.length; i++) {
              const file = files[i]
              // @ts-ignore - path is available in Electron
              if (file.path) filePaths.push(file.path)
            }

            if (filePaths.length === 0) return

            try {
              showToast('info', `Importing ${filePaths.length} file(s)...`)
              const result = await window.api.media?.importFiles?.(filePaths)
              if (result?.success) {
                showToast('success', `Imported ${result.imported} file(s)${result.failed ? `, ${result.failed} failed` : ''}`)
                await refresh()
              } else {
                showToast('error', result?.error || 'Import failed')
              }
            } catch (err) {
              showToast('error', 'Failed to import files')
            }
          }}
        >
          {/* Drop zone overlay */}
          {isDraggingFiles && (
            <div className="absolute inset-0 z-50 flex items-center justify-center bg-[var(--primary)]/20 border-2 border-dashed border-[var(--primary)] rounded-xl backdrop-blur-sm">
              <div className="text-center">
                <Download size={48} className="mx-auto mb-3 text-[var(--primary)]" />
                <div className="text-lg font-semibold text-white">Drop files to import</div>
                <div className="text-sm text-[var(--muted)] mt-1">Files will be copied to your media folder</div>
              </div>
            </div>
          )}

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
            {showPagination && (
              <div className="flex items-center gap-1.5 flex-wrap">
                {/* First page */}
                <button
                  onClick={() => setCurrentPage(1)}
                  disabled={currentPage === 1}
                  className="px-1.5 py-1 rounded text-xs bg-white/5 hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed"
                  title="First page"
                >
                  ««
                </button>
                {/* Jump back 10 */}
                {totalPages > 10 && (
                  <button
                    onClick={() => setCurrentPage(p => Math.max(1, p - 10))}
                    disabled={currentPage <= 10}
                    className="px-1.5 py-1 rounded text-xs bg-white/5 hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed"
                    title="Back 10 pages"
                  >
                    -10
                  </button>
                )}
                {/* Prev */}
                <button
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="px-2 py-1 rounded text-xs bg-white/5 hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  ←
                </button>
                {/* Page indicator with input */}
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    min={1}
                    max={totalPages}
                    value={currentPage}
                    onChange={(e) => {
                      const val = parseInt(e.target.value)
                      if (!isNaN(val) && val >= 1 && val <= totalPages) {
                        setCurrentPage(val)
                      }
                    }}
                    className="w-12 px-1 py-0.5 rounded text-xs bg-white/5 border border-white/10 text-center focus:outline-none focus:border-[var(--primary)]"
                  />
                  <span className="text-xs text-white/60">/ {totalPages}</span>
                </div>
                {/* Next */}
                <button
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage >= totalPages}
                  className="px-2 py-1 rounded text-xs bg-white/5 hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  →
                </button>
                {/* Jump forward 10 */}
                {totalPages > 10 && (
                  <button
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 10))}
                    disabled={currentPage > totalPages - 10}
                    className="px-1.5 py-1 rounded text-xs bg-white/5 hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed"
                    title="Forward 10 pages"
                  >
                    +10
                  </button>
                )}
                {/* Last page */}
                <button
                  onClick={() => setCurrentPage(totalPages)}
                  disabled={currentPage >= totalPages}
                  className="px-1.5 py-1 rounded text-xs bg-white/5 hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed"
                  title="Last page"
                >
                  »»
                </button>
              </div>
            )}
          </div>

          <div className="w-full min-w-0">
            <div ref={gridRef} className="w-full min-w-0" style={getGridStyle()}>
              {/* Loading skeleton grid */}
              {isLoading && sortedMedia.length === 0 && (
                Array.from({ length: effectivePageSize }).map((_, i) => (
                  <div
                    key={`skeleton-${i}`}
                    className={cn(
                      'animate-fadeInUp',
                      (layout === 'mosaic' || layout === 'wall') && 'break-inside-avoid',
                      layout === 'wall' ? 'mb-0' : layout === 'mosaic' ? 'mb-2' : ''
                    )}
                    style={{ animationDelay: `${Math.min(i * 30, 500)}ms`, animationFillMode: 'backwards' }}
                  >
                    <div className="relative group rounded-xl overflow-hidden bg-[var(--card)] border border-white/5">
                      <div className="aspect-video bg-white/5 sexy-shimmer" />
                      <div className="p-2 space-y-2">
                        <div className="h-3 bg-white/5 rounded sexy-shimmer w-4/5" />
                        <div className="h-2.5 bg-white/5 rounded sexy-shimmer w-3/5" />
                      </div>
                    </div>
                  </div>
                ))
              )}
              {sortedMedia.slice((currentPage - 1) * effectivePageSize, currentPage * effectivePageSize).map((m, index) => {
              const isPlaying = openIds.includes(m.id)
              const canAddMore = openIds.length < MAX_FLOATING_PLAYERS
              const canOpen = isPlaying || canAddMore
              const isFocused = focusedIndex === index
              return (
                <div
                  key={m.id}
                  className={cn(
                    'animate-fadeInUp',
                    // Column layouts (mosaic/wall) need break-inside-avoid to prevent items splitting across columns
                    (layout === 'mosaic' || layout === 'wall') && 'break-inside-avoid',
                    // Wall mode: no margin/spacing at all
                    layout === 'wall' ? 'mb-0' : layout === 'mosaic' ? 'mb-2' : '',
                    isFocused && 'ring-2 ring-[var(--primary)] ring-offset-2 ring-offset-[var(--bg)] rounded-xl'
                  )}
                  style={{
                    animationDelay: layout === 'wall' ? '0ms' : `${Math.min(index * 30, 500)}ms`,
                    animationFillMode: 'backwards'
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
                      } else if (canOpen) {
                        // Single-click: open in floating player directly (more intuitive)
                        addFloatingPlayer(m.id)
                      }
                    }}
                    onDoubleClick={() => {
                      // Double-click: also opens (for users who expect this behavior)
                      if (!selectionMode && canOpen) {
                        addFloatingPlayer(m.id)
                      }
                    }}
                    onContextMenu={(e) => {
                      e.preventDefault()
                      showContextMenu(m, e.clientX, e.clientY)
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
                    compact={(layout === 'mosaic' && mosaicCols >= 6) || layout === 'wall'}
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
          </div>

          {/* Bottom Pagination */}
          {showPagination && (
            <div className="mt-6 flex justify-center items-center gap-2 flex-wrap">
              {/* First page */}
              <button
                onClick={() => setCurrentPage(1)}
                disabled={currentPage === 1}
                className="px-2 py-1.5 rounded-lg text-sm bg-white/5 hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition"
                title="First page"
              >
                ««
              </button>
              {/* Jump back 10 */}
              {totalPages > 10 && (
                <button
                  onClick={() => setCurrentPage(p => Math.max(1, p - 10))}
                  disabled={currentPage <= 10}
                  className="px-2 py-1.5 rounded-lg text-sm bg-white/5 hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition"
                  title="Back 10 pages"
                >
                  -10
                </button>
              )}
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="px-3 py-1.5 rounded-lg text-sm bg-white/5 hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition"
              >
                ← Prev
              </button>
              <div className="flex items-center gap-1.5">
                <input
                  type="number"
                  min={1}
                  max={totalPages}
                  value={currentPage}
                  onChange={(e) => {
                    const val = parseInt(e.target.value)
                    if (!isNaN(val) && val >= 1 && val <= totalPages) {
                      setCurrentPage(val)
                    }
                  }}
                  className="w-14 px-2 py-1 rounded-lg text-sm bg-white/5 border border-white/10 text-center focus:outline-none focus:border-[var(--primary)]"
                />
                <span className="text-sm text-white/60">/ {totalPages}</span>
              </div>
              <button
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage >= totalPages}
                className="px-3 py-1.5 rounded-lg text-sm bg-white/5 hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition"
              >
                Next →
              </button>
              {/* Jump forward 10 */}
              {totalPages > 10 && (
                <button
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 10))}
                  disabled={currentPage > totalPages - 10}
                  className="px-2 py-1.5 rounded-lg text-sm bg-white/5 hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition"
                  title="Forward 10 pages"
                >
                  +10
                </button>
              )}
              {/* Last page */}
              <button
                onClick={() => setCurrentPage(totalPages)}
                disabled={currentPage >= totalPages}
                className="px-2 py-1.5 rounded-lg text-sm bg-white/5 hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition"
                title="Last page"
              >
                »»
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
                <>
                  <div className="text-xs text-white/40 max-w-xs">
                    Add a media folder in Settings to start building your collection
                  </div>
                  <div className="flex gap-2 mt-2">
                    <kbd className="px-2 py-1 rounded bg-white/10 text-[10px] font-mono">Ctrl+K</kbd>
                    <span className="text-xs text-white/30">Quick actions</span>
                  </div>
                </>
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
                  // Center the popup with slight offset for multiple players
                  x: Math.round((window.innerWidth - 480) / 2) + index * 40,
                  y: Math.round((window.innerHeight - 270) / 2) + index * 30
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
        <div
          role="toolbar"
          aria-label="Bulk selection actions"
          className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[90] flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-black/90 border border-[var(--primary)]/30 backdrop-blur-sm shadow-2xl"
        >
          <span className="text-sm text-white/80 mr-1" aria-live="polite">{selectedIds.size} selected</span>

          {/* Add to existing Playlist */}
          <Btn
            tone="ghost"
            title="Add selected items to an existing playlist"
            aria-label="Add selected items to an existing playlist"
            disabled={!!bulkActionLoading}
            onClick={async () => {
              try {
                setBulkActionLoading('playlist')
                const pls = await window.api.playlists.list()
                setBulkPlaylists(pls)
                setShowPlaylistPicker(true)
              } catch (err) {
                console.error('[Library] Failed to load playlists:', err)
                showToast('error', 'Failed to load playlists')
              } finally {
                setBulkActionLoading(null)
              }
            }}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs"
          >
            {bulkActionLoading === 'playlist' ? <RefreshCw size={12} className="animate-spin" /> : <Plus size={12} />}
            <span>Add to Playlist</span>
          </Btn>

          {/* Create New Playlist from selection */}
          <Btn
            tone="ghost"
            title="Create a new playlist from selected items"
            aria-label="Create a new playlist from selected items"
            disabled={!!bulkActionLoading}
            onClick={() => setShowCreatePlaylistModal(true)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs"
          >
            <ListMusic size={12} />
            <span>New Playlist</span>
          </Btn>

          {/* Add to Watch Later */}
          <Btn
            tone="ghost"
            title="Add selected items to Watch Later queue"
            aria-label="Add selected items to Watch Later queue"
            disabled={!!bulkActionLoading}
            onClick={async () => {
              try {
                setBulkActionLoading('watchLater')
                await window.api.invoke('watchLater:addMultiple', [...selectedIds])
                showToast('success', `Added ${selectedIds.size} items to Watch Later`)
              } catch (err) {
                console.error('[Library] Failed to add to Watch Later:', err)
                showToast('error', 'Failed to add items to Watch Later')
              } finally {
                setBulkActionLoading(null)
              }
            }}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs"
          >
            {bulkActionLoading === 'watchLater' ? <RefreshCw size={12} className="animate-spin" /> : <Clock size={12} />}
            <span>Watch Later</span>
          </Btn>

          {/* Cast to TV */}
          <Btn
            tone="ghost"
            title="Cast selected videos to TV"
            aria-label="Cast selected videos to TV"
            disabled={!!bulkActionLoading}
            onClick={async () => {
              try {
                setBulkActionLoading('cast')
                // Get selected media info
                const selectedMedia = sortedMedia.filter(m => selectedIds.has(m.id) && m.type === 'video')
                if (selectedMedia.length === 0) {
                  showToast('info', 'No videos selected. Cast is only available for videos.')
                  return
                }
                // Build queue items
                const queueItems = selectedMedia.map(m => ({
                  mediaId: m.id,
                  path: m.path,
                  title: m.filename || 'Vault Video',
                  duration: m.durationSec || undefined
                }))
                // Set queue
                await window.api.dlna?.setQueue?.(queueItems)
                showToast('success', `Added ${queueItems.length} videos to TV queue. Open TV Remote to start playing.`)
                setShowTVRemotePanel(true)
              } catch (err) {
                console.error('[Library] Failed to cast:', err)
                showToast('error', 'Failed to add items to TV queue')
              } finally {
                setBulkActionLoading(null)
              }
            }}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs"
          >
            {bulkActionLoading === 'cast' ? <RefreshCw size={12} className="animate-spin" /> : <Tv size={12} />}
            <span>Cast to TV</span>
          </Btn>

          {/* AI Analyze selected items */}
          <Btn
            tone="ghost"
            title="Queue selected items for AI tagging and analysis"
            aria-label="Queue selected items for AI tagging and analysis"
            disabled={!!bulkActionLoading}
            onClick={async () => {
              try {
                setBulkActionLoading('ai')
                await window.api.ai.queueSpecific([...selectedIds])
                // Update daily challenge progress for tagging items
                window.api.challenges?.updateProgress?.('tag_items', selectedIds.size)
                showToast('success', `Queued ${selectedIds.size} items for AI analysis`)
              } catch (err) {
                console.error('[Library] Failed to queue for AI:', err)
                showToast('error', 'Failed to queue items for AI analysis')
              } finally {
                setBulkActionLoading(null)
              }
            }}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs"
          >
            {bulkActionLoading === 'ai' ? <RefreshCw size={12} className="animate-spin" /> : <Brain size={12} />}
            <span>AI Tag</span>
          </Btn>

          {/* Bulk Rename */}
          <Btn
            tone="ghost"
            title="Clean up and optimize filenames"
            aria-label="Clean up and optimize filenames for selected items"
            disabled={!!bulkActionLoading}
            onClick={async () => {
              try {
                setBulkActionLoading('rename')
                const result = await window.api.media.optimizeNames([...selectedIds])
                if (result.success) {
                  showToast('success', `Renamed ${result.optimized} files (${result.skipped} skipped, ${result.failed} failed)`)
                  await refresh()
                } else {
                  showToast('error', 'Rename failed: ' + (result as OptimizeNamesResult).error)
                }
              } catch (err) {
                console.error('[Library] Failed to rename:', err)
                showToast('error', 'Failed to rename files')
              } finally {
                setBulkActionLoading(null)
              }
            }}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs"
          >
            {bulkActionLoading === 'rename' ? <RefreshCw size={12} className="animate-spin" /> : <FileText size={12} />}
            <span>Rename</span>
          </Btn>

          {/* Bulk Favorite (set rating to 5) */}
          <Btn
            tone="ghost"
            title="Mark all selected items as favorites (5 stars)"
            aria-label="Mark all selected items as favorites"
            disabled={!!bulkActionLoading}
            onClick={async () => {
              try {
                setBulkActionLoading('favorite')
                const result = await window.api.media.bulkSetRating([...selectedIds], 5)
                // Update daily challenge progress for rating items
                window.api.challenges?.updateProgress?.('rate_items', result.updated)
                showToast('success', `Favorited ${result.updated} items`)
                setSelectedIds(new Set())
                setSelectionMode(false)
              } catch (err) {
                console.error('[Library] Failed to favorite:', err)
                showToast('error', 'Failed to favorite items')
              } finally {
                setBulkActionLoading(null)
              }
            }}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-pink-400 hover:text-pink-300"
          >
            {bulkActionLoading === 'favorite' ? <RefreshCw size={12} className="animate-spin" /> : <Heart size={12} />}
          </Btn>

          {/* Clear selection */}
          <Btn tone="ghost" title="Clear selection" aria-label="Clear selection" onClick={() => setSelectedIds(new Set())} className="px-2.5 py-1.5 text-xs text-white/60 hover:text-white">
            <X size={12} />
          </Btn>
        </div>
      )}

      {/* Playlist picker modal for bulk add or single media */}
      {showPlaylistPicker && (
        <PlaylistPicker
          playlists={bulkPlaylists}
          onClose={() => {
            setShowPlaylistPicker(false)
            setPlaylistPickerMediaId(null)
          }}
          onPick={async (plId) => {
            try {
              // Check if we're adding a single media (from Brainwash) or bulk selection
              if (playlistPickerMediaId) {
                await window.api.playlists.addItems(plId, [playlistPickerMediaId])
                setPlaylistPickerMediaId(null)
                showToast('success', 'Added to playlist!')
                // Update daily challenge progress for adding to playlist
                window.api.challenges?.updateProgress?.('add_to_playlist', 1)
              } else {
                await window.api.playlists.addItems(plId, [...selectedIds])
                showToast('success', `Added ${selectedIds.size} items to playlist!`)
                // Update daily challenge progress for adding to playlist
                window.api.challenges?.updateProgress?.('add_to_playlist', selectedIds.size)
                setSelectedIds(new Set())
                setSelectionMode(false)
              }
              setShowPlaylistPicker(false)
            } catch (err) {
              console.error('[Library] Failed to add items to playlist:', err)
              showToast('error', 'Failed to add to playlist')
            }
          }}
        />
      )}

      {/* Create New Playlist modal */}
      {showCreatePlaylistModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="create-playlist-title"
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-sm"
          onClick={() => {
            setShowCreatePlaylistModal(false)
            setNewPlaylistName('')
          }}
        >
          <div
            className="bg-[var(--panel)] border border-[var(--border)] rounded-2xl p-6 w-full max-w-md mx-4 shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 id="create-playlist-title" className="text-lg font-semibold">Create New Playlist</h2>
              <button
                onClick={() => {
                  setShowCreatePlaylistModal(false)
                  setNewPlaylistName('')
                }}
                aria-label="Close dialog"
                className="p-1 hover:bg-white/10 rounded"
              >
                <X size={18} aria-hidden="true" />
              </button>
            </div>

            <p className="text-sm text-[var(--muted)] mb-4">
              Create a new playlist with {selectedIds.size} selected item{selectedIds.size !== 1 ? 's' : ''}.
            </p>

            <input
              type="text"
              value={newPlaylistName}
              onChange={e => setNewPlaylistName(e.target.value)}
              placeholder="Playlist name..."
              aria-label="Playlist name"
              className="w-full px-4 py-2.5 rounded-lg bg-black/30 border border-[var(--border)] text-white placeholder:text-white/40 focus:outline-none focus:border-[var(--primary)] mb-4"
              autoFocus
              disabled={!!bulkActionLoading}
              onKeyDown={async e => {
                if (e.key === 'Enter' && newPlaylistName.trim() && !bulkActionLoading) {
                  try {
                    setBulkActionLoading('create-playlist')
                    const pl = await window.api.playlists.create(newPlaylistName.trim())
                    await window.api.playlists.addItems(pl.id, [...selectedIds])
                    // Update daily challenge progress for creating playlist and adding items
                    window.api.challenges?.updateProgress?.('create_playlist', 1)
                    window.api.challenges?.updateProgress?.('add_to_playlist', selectedIds.size)
                    setShowCreatePlaylistModal(false)
                    setNewPlaylistName('')
                    setSelectedIds(new Set())
                    setSelectionMode(false)
                    showToast('success', `Created playlist "${newPlaylistName.trim()}" with ${selectedIds.size} items`)
                  } catch (err) {
                    console.error('[Library] Failed to create playlist:', err)
                    showToast('error', 'Failed to create playlist')
                  } finally {
                    setBulkActionLoading(null)
                  }
                }
              }}
            />

            <div className="flex justify-end gap-2">
              <Btn tone="ghost" disabled={!!bulkActionLoading} onClick={() => {
                setShowCreatePlaylistModal(false)
                setNewPlaylistName('')
              }}>
                Cancel
              </Btn>
              <Btn
                tone="primary"
                disabled={!newPlaylistName.trim() || !!bulkActionLoading}
                onClick={async () => {
                  if (!newPlaylistName.trim() || bulkActionLoading) return
                  try {
                    setBulkActionLoading('create-playlist')
                    const pl = await window.api.playlists.create(newPlaylistName.trim())
                    await window.api.playlists.addItems(pl.id, [...selectedIds])
                    // Update daily challenge progress for creating playlist and adding items
                    window.api.challenges?.updateProgress?.('create_playlist', 1)
                    window.api.challenges?.updateProgress?.('add_to_playlist', selectedIds.size)
                    setShowCreatePlaylistModal(false)
                    setNewPlaylistName('')
                    setSelectedIds(new Set())
                    setSelectionMode(false)
                    showToast('success', `Created playlist "${newPlaylistName.trim()}" with ${selectedIds.size} items`)
                  } catch (err) {
                    console.error('[Library] Failed to create playlist:', err)
                    showToast('error', 'Failed to create playlist')
                  } finally {
                    setBulkActionLoading(null)
                  }
                }}
              >
                {bulkActionLoading === 'create-playlist' ? (
                  <span className="flex items-center gap-2">
                    <RefreshCw size={14} className="animate-spin" />
                    Creating...
                  </span>
                ) : 'Create Playlist'}
              </Btn>
            </div>
          </div>
        </div>
      )}

      {/* Save Search modal */}
      {showSaveSearchModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="save-search-title"
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-sm"
          onClick={() => {
            setShowSaveSearchModal(false)
            setSaveSearchName('')
          }}
        >
          <div
            className="bg-[var(--panel)] border border-[var(--border)] rounded-2xl p-6 w-full max-w-md mx-4 shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 id="save-search-title" className="text-lg font-semibold flex items-center gap-2">
                <Bookmark size={18} className="text-[var(--primary)]" aria-hidden="true" />
                Save Search
              </h2>
              <button
                onClick={() => {
                  setShowSaveSearchModal(false)
                  setSaveSearchName('')
                }}
                aria-label="Close dialog"
                className="p-1 hover:bg-white/10 rounded"
              >
                <X size={18} aria-hidden="true" />
              </button>
            </div>

            <p className="text-sm text-[var(--muted)] mb-2">
              Save this search for quick access later:
            </p>
            <div className="px-3 py-2 mb-4 rounded-lg bg-black/30 border border-[var(--border)] text-sm text-white/80 font-mono">
              {query}
            </div>

            <input
              type="text"
              value={saveSearchName}
              onChange={e => setSaveSearchName(e.target.value)}
              placeholder="Search name (e.g., 'Favorite Videos')"
              className="w-full px-4 py-2.5 rounded-lg bg-black/30 border border-[var(--border)] text-white placeholder:text-white/40 focus:outline-none focus:border-[var(--primary)] mb-4"
              autoFocus
              onKeyDown={e => {
                if (e.key === 'Enter' && saveSearchName.trim() && query.trim()) {
                  const updated = [...savedSearches, { name: saveSearchName.trim(), query: query.trim() }]
                  setSavedSearches(updated)
                  localStorage.setItem('vault_saved_searches', JSON.stringify(updated))
                  setShowSaveSearchModal(false)
                  setSaveSearchName('')
                  setSearchFocused(false)
                  showToast('success', `Saved search "${saveSearchName.trim()}"`)
                }
              }}
            />

            <div className="flex justify-end gap-2">
              <Btn tone="ghost" onClick={() => {
                setShowSaveSearchModal(false)
                setSaveSearchName('')
              }}>
                Cancel
              </Btn>
              <Btn
                tone="primary"
                disabled={!saveSearchName.trim() || !query.trim()}
                onClick={() => {
                  if (!saveSearchName.trim() || !query.trim()) return
                  const updated = [...savedSearches, { name: saveSearchName.trim(), query: query.trim() }]
                  setSavedSearches(updated)
                  localStorage.setItem('vault_saved_searches', JSON.stringify(updated))
                  setShowSaveSearchModal(false)
                  setSaveSearchName('')
                  setSearchFocused(false)
                  showToast('success', `Saved search "${saveSearchName.trim()}"`)
                }}
              >
                Save Search
              </Btn>
            </div>
          </div>
        </div>
      )}

      {/* Advanced Duplicates Modal */}
      <DuplicatesModal
        isOpen={showDuplicatesModal}
        onClose={() => setShowDuplicatesModal(false)}
        onViewMedia={(mediaId) => addFloatingPlayer(mediaId)}
      />

      {/* Watch Later Panel */}
      <WatchLaterPanel
        isOpen={showWatchLaterPanel}
        onClose={() => setShowWatchLaterPanel(false)}
        onPlayMedia={(mediaId) => {
          addFloatingPlayer(mediaId)
          setShowWatchLaterPanel(false)
        }}
        selectedMediaIds={selectionMode ? Array.from(selectedIds) : []}
      />

      {/* TV Remote Control Panel */}
      <TVRemotePanel
        isOpen={showTVRemotePanel}
        onClose={() => setShowTVRemotePanel(false)}
        onAddMore={() => {
          // Close TV panel and let user select from library
          setShowTVRemotePanel(false)
        }}
      />

      {/* URL Downloader Panel */}
      <UrlDownloaderPanel
        isOpen={showUrlDownloaderPanel}
        onClose={() => setShowUrlDownloaderPanel(false)}
      />

      {/* v2.3.0 Tool Panels */}
      {showSceneDetector && activeToolMedia && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-sm" onClick={() => setShowSceneDetector(false)}>
          <div className="max-w-2xl w-full max-h-[90vh] overflow-auto" onClick={e => e.stopPropagation()}>
            <SceneDetector videoSrc={toFileUrl(activeToolMedia.path)} mediaId={activeToolMedia.id} duration={activeToolMedia.durationSec || 0} onSceneSelect={(time: number) => { showToast('info', `Scene at ${formatDuration(time)}`); setShowSceneDetector(false) }} className="m-4" />
          </div>
        </div>
      )}

      {showVideoChapters && activeToolMedia && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-sm" onClick={() => setShowVideoChapters(false)}>
          <div className="max-w-2xl w-full max-h-[90vh] overflow-auto" onClick={e => e.stopPropagation()}>
            <VideoChapters mediaId={activeToolMedia.id} duration={activeToolMedia.durationSec || 0} currentTime={0} onSeek={(time: number) => showToast('info', `Jump to ${formatDuration(time)}`)} className="m-4" />
          </div>
        </div>
      )}

      {showColorGrading && activeToolMedia && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-sm" onClick={() => setShowColorGrading(false)}>
          <div className="max-w-xl w-full max-h-[90vh] overflow-auto" onClick={e => e.stopPropagation()}>
            <ColorGrading settings={colorGradingStyle || { brightness: 100, contrast: 100, saturation: 100, hue: 0, temperature: 0, tint: 0, shadows: 0, highlights: 0, vibrance: 0 }} onChange={(s) => { setColorGradingStyle(s); showToast('success', 'Color grading applied') }} className="m-4" />
          </div>
        </div>
      )}

      {showBookmarkManager && activeToolMedia && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-sm" onClick={() => setShowBookmarkManager(false)}>
          <div className="max-w-2xl w-full max-h-[90vh] overflow-auto" onClick={e => e.stopPropagation()}>
            <BookmarkManager mediaId={activeToolMedia.id} duration={activeToolMedia.durationSec || 0} currentTime={0} onSeek={(time) => showToast('info', `Seek to ${formatDuration(time)}`)} className="m-4" />
          </div>
        </div>
      )}

      {showSubtitleEditor && activeToolMedia && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-sm" onClick={() => setShowSubtitleEditor(false)}>
          <div className="max-w-3xl w-full max-h-[90vh] overflow-auto" onClick={e => e.stopPropagation()}>
            <SubtitleEditor currentTime={0} duration={activeToolMedia.durationSec || 0} subtitles={[]} onChange={(subs) => { showToast('success', `Updated ${subs.length} subtitles`) }} onSeek={(time: number) => showToast('info', `Seek to ${formatDuration(time)}`)} className="m-4" />
          </div>
        </div>
      )}

      {showKeyframeExtractor && activeToolMedia && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-sm" onClick={() => setShowKeyframeExtractor(false)}>
          <div className="max-w-2xl w-full max-h-[90vh] overflow-auto" onClick={e => e.stopPropagation()}>
            <KeyframeExtractor videoRef={React.createRef<HTMLVideoElement>()} duration={activeToolMedia.durationSec || 0} onExtract={(frames) => { showToast('success', `Extracted ${frames.length} keyframes`); setShowKeyframeExtractor(false) }} className="m-4" />
          </div>
        </div>
      )}

      {showVideoFilters && activeToolMedia && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-sm" onClick={() => setShowVideoFilters(false)}>
          <div className="max-w-xl w-full max-h-[90vh] overflow-auto" onClick={e => e.stopPropagation()}>
            <VideoFilters onFilterChange={(filter: string) => { setVideoFiltersStyle(filter); showToast('success', 'Video filter applied') }} currentFilter={videoFiltersStyle || 'none'} className="m-4" />
          </div>
        </div>
      )}

      {showSplitScreen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-sm" onClick={() => setShowSplitScreen(false)}>
          <div className="max-w-4xl w-full max-h-[90vh] overflow-auto" onClick={e => e.stopPropagation()}>
            <SplitScreen availableMedia={media.filter((m: MediaRow) => m.type === 'video').slice(0, 20).map((m: MediaRow) => ({ id: m.id, path: m.path, thumbnail: m.thumbPath || undefined, title: m.filename || '' }))} className="m-4" />
          </div>
        </div>
      )}

      {showSmartCrop && activeToolMedia && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-sm" onClick={() => setShowSmartCrop(false)}>
          <div className="max-w-2xl w-full max-h-[90vh] overflow-auto" onClick={e => e.stopPropagation()}>
            <SmartCrop imageSrc={toFileUrl(activeToolMedia.thumbPath || activeToolMedia.path)} onCrop={(region, aspect) => { showToast('success', `Crop applied: ${Math.round(region.width)}x${Math.round(region.height)} (${aspect})`); setShowSmartCrop(false) }} className="m-4" />
          </div>
        </div>
      )}

      {showMetadataEditor && activeToolMedia && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-sm" onClick={() => setShowMetadataEditor(false)}>
          <div className="max-w-2xl w-full max-h-[90vh] overflow-auto" onClick={e => e.stopPropagation()}>
            <MetadataEditor media={{ id: activeToolMedia.id, title: activeToolMedia.filename || '', tags: [], performers: [], rating: 0, customFields: {} }} onSave={(data) => { showToast('success', 'Metadata saved'); setShowMetadataEditor(false) }} className="m-4" />
          </div>
        </div>
      )}

      {showPlaylistSorter && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-sm" onClick={() => setShowPlaylistSorter(false)}>
          <div className="max-w-2xl w-full max-h-[90vh] overflow-auto" onClick={e => e.stopPropagation()}>
            <PlaylistSorter items={media.slice(0, 20).map((m: MediaRow, i: number) => ({ id: m.id, title: m.filename || '', duration: m.durationSec || undefined, index: i }))} onSort={(sortedIds: string[]) => { showToast('success', `Sorted ${sortedIds.length} items`); setShowPlaylistSorter(false) }} className="m-4" />
          </div>
        </div>
      )}

      {showWatchProgress && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-sm" onClick={() => setShowWatchProgress(false)}>
          <div className="max-w-2xl w-full max-h-[90vh] overflow-auto" onClick={e => e.stopPropagation()}>
            <WatchProgress onResume={(id: string) => { addFloatingPlayer(id); setShowWatchProgress(false) }} onRemove={(id: string) => showToast('info', 'Removed from progress')} className="m-4" />
          </div>
        </div>
      )}

      {showMediaExporter && activeToolMedia && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-sm" onClick={() => setShowMediaExporter(false)}>
          <div className="max-w-xl w-full max-h-[90vh] overflow-auto" onClick={e => e.stopPropagation()}>
            <MediaExporter mediaType={activeToolMedia.type === 'video' ? 'video' : 'image'} mediaPath={activeToolMedia.path} duration={activeToolMedia.durationSec || undefined} onExport={async (settings, outputPath) => { showToast('success', `Exporting as ${settings.format} to ${outputPath}`); setShowMediaExporter(false) }} className="m-4" />
          </div>
        </div>
      )}

      {showAITagger && activeToolMedia && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-sm" onClick={() => setShowAITagger(false)}>
          <div className="max-w-xl w-full max-h-[90vh] overflow-auto" onClick={e => e.stopPropagation()}>
            <AITagger mediaId={activeToolMedia.id} mediaSrc={toFileUrl(activeToolMedia.path)} mediaType={activeToolMedia.type === 'video' ? 'video' : activeToolMedia.type === 'gif' ? 'gif' : 'image'} onApplyTags={(tags) => { showToast('success', `Applied ${tags.length} tags`); setShowAITagger(false) }} className="m-4" />
          </div>
        </div>
      )}

      {showThumbnailSelector && activeToolMedia && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-sm" onClick={() => setShowThumbnailSelector(false)}>
          <div className="max-w-2xl w-full max-h-[90vh] overflow-auto" onClick={e => e.stopPropagation()}>
            <ThumbnailSelector duration={activeToolMedia.durationSec || 0} currentThumbnail={activeToolMedia.thumbPath ? toFileUrl(activeToolMedia.thumbPath) : undefined} onSelect={(thumb: string) => { showToast('success', 'Thumbnail updated'); setShowThumbnailSelector(false) }} className="m-4" />
          </div>
        </div>
      )}

      {showRelatedMedia && activeToolMedia && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-sm" onClick={() => setShowRelatedMedia(false)}>
          <div className="max-w-2xl w-full max-h-[90vh] overflow-auto" onClick={e => e.stopPropagation()}>
            <RelatedMedia currentMediaId={activeToolMedia.id} onPlay={(id: string) => { addFloatingPlayer(id); setShowRelatedMedia(false) }} maxItems={12} className="m-4" />
          </div>
        </div>
      )}

      {showMediaTimeline && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-sm" onClick={() => setShowMediaTimeline(false)}>
          <div className="max-w-4xl w-full max-h-[90vh] overflow-auto" onClick={e => e.stopPropagation()}>
            <MediaTimeline onSelect={(id: string) => { addFloatingPlayer(id); setShowMediaTimeline(false) }} className="m-4" />
          </div>
        </div>
      )}

      {showQuickNote && activeToolMedia && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-sm" onClick={() => setShowQuickNote(false)}>
          <div className="max-w-md w-full" onClick={e => e.stopPropagation()}>
            <QuickNote mediaId={activeToolMedia.id} onChange={(notes) => { showToast('success', `${notes.length} notes`) }} className="m-4" />
          </div>
        </div>
      )}

      {showViewModeSelector && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-sm" onClick={() => setShowViewModeSelector(false)}>
          <div className="max-w-md w-full" onClick={e => e.stopPropagation()}>
            <ViewModeSelector mode="grid" config={{ columns: 4, showInfo: true, showThumbnails: true, cardSize: 'medium', aspectRatio: '16:9' }} onChange={(mode, config) => { setLayout(mode === 'masonry' ? 'wall' : 'grid'); showToast('success', `View: ${mode}`); setShowViewModeSelector(false) }} className="m-4" />
          </div>
        </div>
      )}

      {showAutoPlaylist && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-sm" onClick={() => setShowAutoPlaylist(false)}>
          <div className="max-w-2xl w-full max-h-[90vh] overflow-auto" onClick={e => e.stopPropagation()}>
            <AutoPlaylist onPlay={(items) => { if (items.length > 0) addFloatingPlayer(items[0].id); showToast('info', `Playing ${items.length} items`); setShowAutoPlaylist(false) }} onSave={(type, name, items) => { showToast('success', `Saved playlist: ${name} (${items.length} items)`); setShowAutoPlaylist(false) }} className="m-4" />
          </div>
        </div>
      )}

      {showMediaMerger && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-sm" onClick={() => setShowMediaMerger(false)}>
          <div className="max-w-3xl w-full max-h-[90vh] overflow-auto" onClick={e => e.stopPropagation()}>
            <MediaMerger onMerge={async (items, settings) => { showToast('success', `Merging ${items.length} videos as ${settings.outputFormat}`); setShowMediaMerger(false) }} onAddMedia={async () => { const videos = media.filter((m: MediaRow) => m.type === 'video'); if (videos.length === 0) return null; const m = videos[Math.floor(Math.random() * videos.length)]; return { id: m.id, path: m.path, title: m.filename || '', duration: m.durationSec || 0, thumbnail: m.thumbPath || undefined } }} className="m-4" />
          </div>
        </div>
      )}

      {showMediaRotator && activeToolMedia && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-sm" onClick={() => setShowMediaRotator(false)}>
          <div className="max-w-xl w-full max-h-[90vh] overflow-auto" onClick={e => e.stopPropagation()}>
            <MediaRotator src={toFileUrl(activeToolMedia.path)} type={activeToolMedia.type === 'video' ? 'video' : 'image'} onApply={(transform) => { showToast('success', `Applied: ${transform.rotation}° rotation`); setShowMediaRotator(false) }} className="m-4" />
          </div>
        </div>
      )}

      {showWatermarkAdder && activeToolMedia && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-sm" onClick={() => setShowWatermarkAdder(false)}>
          <div className="max-w-xl w-full max-h-[90vh] overflow-auto" onClick={e => e.stopPropagation()}>
            <WatermarkAdder mediaSrc={toFileUrl(activeToolMedia.path)} mediaType={activeToolMedia.type === 'video' ? 'video' : 'image'} onApply={(watermark) => { showToast('success', 'Watermark applied'); setShowWatermarkAdder(false) }} className="m-4" />
          </div>
        </div>
      )}

      {showMediaQueue && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-sm" onClick={() => setShowMediaQueue(false)}>
          <div className="max-w-md w-full max-h-[90vh] overflow-auto" onClick={e => e.stopPropagation()}>
            <MediaQueue onPlay={(i: number) => { const videos = media.filter((m: MediaRow) => m.type === 'video'); if (videos[i]) addFloatingPlayer(videos[i].id); setShowMediaQueue(false) }} className="m-4" />
          </div>
        </div>
      )}
    </div>
  )
}

const MediaTile = React.memo(function MediaTile(props: {
  media: MediaRow
  selected: boolean
  onClick: () => void
  onDoubleClick?: () => void
  onContextMenu?: (e: React.MouseEvent) => void
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

  // Lazy loading - only load thumbnail when tile is visible (200px margin for preloading)
  const [lazyRef, isVisible] = useLazyLoad('200px')

  // Video preview on hover - 2 second delay, quick clips
  // Wall mode: auto-play videos muted
  const isVideo = media.type === 'video'
  const isWallMode = layout === 'wall'
  const { videoRef, isWaiting: isPreviewWaiting, isPlaying: isPreviewPlaying, handleMouseEnter: startPreview, handleMouseLeave: stopPreview } = useVideoPreview({
    clipDuration: 1.5,
    clipCount: 4,
    hoverDelay: 2000, // 2 second delay
    muted: isWallMode ? true : previewMuted, // Wall mode always muted until clicked
    autoPlay: isWallMode && isVideo && isVisible && !!videoUrl, // Auto-play in wall mode when visible
    autoPlayUrl: isWallMode ? videoUrl : undefined,
    autoPlayDuration: media.durationSec ?? undefined,
    wallMode: isWallMode // Use continuous playback with slot limiting in wall mode
  })

  // Show HUD when: not hovering OR hovering but still in 2 second intro
  // Hide HUD when: preview is actually playing
  const showHud = !isPreviewPlaying

  // Load thumbnail — only when visible (lazy loading for performance)
  useEffect(() => {
    if (!isVisible) return // Don't load until visible

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
  }, [media.id, media.thumbPath, isVisible])

  // Load video URL for preview - only when visible
  useEffect(() => {
    if (!isVideo || !isVisible) return
    let alive = true
    ;(async () => {
      try {
        const u = await toFileUrlCached(media.path)
        if (alive) setVideoUrl(u)
      } catch {}
    })()
    return () => { alive = false }
  }, [media.path, isVideo, isVisible])

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
      ref={lazyRef}
      onClick={disabled ? undefined : props.onClick}
      onDoubleClick={disabled ? undefined : props.onDoubleClick}
      onContextMenu={props.onContextMenu}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className={cn(
        'text-left overflow-hidden relative group card-shine',
        'transition-all duration-300 ease-out',
        layout === 'wall' ? 'border-0 bg-black' : 'border bg-black/20',
        disabled
          ? 'cursor-not-allowed opacity-50'
          : layout === 'wall'
            ? 'cursor-pointer hover:z-10'
            : 'cursor-pointer hover:scale-[1.02] hover:z-10',
        props.selected
          ? 'border-[var(--primary)]/50 shadow-[0_0_20px_rgba(var(--primary-rgb),0.3)]'
          : disabled
            ? 'border-[var(--border)]'
            : layout === 'wall'
              ? 'border-transparent'
              : 'border-[var(--border)] hover:border-[var(--primary)]/30',
        layout === 'wall' ? 'rounded-none' : compact ? 'rounded-lg' : 'rounded-xl',
        isHovered && !disabled && layout !== 'wall' && 'shadow-xl shadow-black/40'
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
          // Wall mode: masonry-style with varied aspect ratios
          // Mosaic mode: use natural aspect ratio but clamp very tall thumbnails to prevent gaps
          // Grid mode: fixed aspect ratio for uniform appearance
          aspectRatio: layout === 'wall'
              ? (media.width && media.height
                  ? media.width / media.height
                  : (() => {
                      const hash = media.id.split('').reduce((a, c) => a + c.charCodeAt(0), 0)
                      const ratios = [1.78, 1.33, 1.0, 0.75, 0.56, 2.35, 0.8, 1.5]
                      return ratios[hash % ratios.length]
                    })())
              : layout === 'mosaic'
              ? (media.width && media.height
                  // Clamp aspect ratio: min 0.7 (not too tall), max 2.5 (not too wide)
                  // This prevents very tall thumbnails from creating huge gaps
                  ? Math.max(0.7, Math.min(2.5, media.width / media.height))
                  : (() => {
                      const hash = media.id.split('').reduce((a, c) => a + c.charCodeAt(0), 0)
                      // More balanced ratios for mosaic - no super tall ones
                      const ratios = [1.78, 1.33, 1.0, 0.8, 1.5, 1.2, 0.9, 1.1]
                      return ratios[hash % ratios.length]
                    })())
              : (compact ? 16/9 : 16/10)
        }}
      >
        {/* Sexy loading shimmer with loading GIF */}
        {!isLoaded && thumbUrl && (
          <div className="absolute inset-0 overflow-hidden">
            <img
              src={thumbnailLoadingGif}
              alt=""
              className="w-full h-full object-cover opacity-40"
            />
          </div>
        )}

        {thumbUrl && !thumbError ? (
          <>
            <img
              src={thumbUrl}
              alt=""
              className={cn(
                'w-full h-full transition-all duration-500',
                layout === 'mosaic' || layout === 'wall' ? 'object-cover' : 'object-contain', // Cover for mosaic/wall, contain for grid
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
            {/* Video preview overlay - match thumbnail sizing exactly */}
            {isVideo && (
              <video
                ref={videoRef}
                className={cn(
                  'absolute inset-0 w-full h-full transition-opacity duration-300',
                  // Match thumbnail sizing: cover for wall/mosaic, contain for grid
                  layout === 'mosaic' || layout === 'wall' ? 'object-cover' : 'object-contain',
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
          <div className="w-full h-full bg-gradient-to-br from-black/40 to-black/60 flex items-center justify-center overflow-hidden">
            <img
              src={thumbnailLoadingGif}
              alt=""
              className="w-full h-full object-cover opacity-60"
            />
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

        {/* Now Playing indicator (only when actually playing, not in selection mode) */}
        {!compact && props.selected && !props.selectionMode && (
          <div className="absolute bottom-1.5 left-1.5 transition-all duration-200">
            <div className="px-2 py-1 rounded text-[10px] backdrop-blur-sm flex items-center gap-1 bg-green-500 text-white shadow-[0_0_15px_rgba(34,197,94,0.6)] animate-pulse">
              <span className="w-1.5 h-1.5 bg-white rounded-full animate-ping" />
              Playing
            </div>
          </div>
        )}

        {/* Selection mode checkmark (when in selection mode and selected) */}
        {!compact && props.selected && props.selectionMode && (
          <div className="absolute bottom-1.5 left-1.5 transition-all duration-200">
            <div className="px-2 py-1 rounded text-[10px] backdrop-blur-sm flex items-center gap-1 bg-[var(--primary)] text-white shadow-[0_0_15px_rgba(var(--primary-rgb),0.6)]">
              <Check size={12} />
              Selected
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
              // Update daily challenge progress for adding to playlist
              window.api.challenges?.updateProgress?.('add_to_playlist', 1)
              setPickOpen(false)
            }}
          />
        ) : null}
      </div>
    </div>
  )
}

// Media Info Modal - Shows detailed metadata about a media item
function MediaInfoModal({ media, onClose }: { media: MediaRow; onClose: () => void }) {
  const [stats, setStats] = useState<MediaStatsRow | null>(null)
  const [tags, setTags] = useState<TagRow[]>([])

  useEffect(() => {
    // Fetch stats and tags for the media
    Promise.all([
      window.api.media?.getStats?.(media.id),
      window.api.tags?.getForMedia?.(media.id)
    ]).then(([s, t]) => {
      if (s) setStats(s as MediaStatsRow)
      if (t) setTags(t as TagRow[])
    })
  }, [media.id])

  // Format date (formatBytes and formatDuration imported from utils/formatters)
  const formatDate = (ms?: number | null) => {
    if (!ms) return '—'
    return new Date(ms).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const filename = media.path.split(/[/\\]/).pop() || media.path

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="media-info-title"
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-[var(--panel)] border border-[var(--border)] rounded-2xl w-full max-w-lg mx-4 shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)]">
          <div className="flex items-center gap-3">
            <Info size={18} className="text-[var(--primary)]" aria-hidden="true" />
            <h2 id="media-info-title" className="text-lg font-semibold">Media Info</h2>
          </div>
          <button
            onClick={onClose}
            aria-label="Close dialog"
            className="p-1.5 hover:bg-white/10 rounded-lg transition"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
          {/* Filename */}
          <div>
            <div className="text-xs text-[var(--muted)] uppercase tracking-wide mb-1">Filename</div>
            <div className="text-sm font-medium break-all">{filename}</div>
          </div>

          {/* Path */}
          <div>
            <div className="text-xs text-[var(--muted)] uppercase tracking-wide mb-1">Full Path</div>
            <div className="text-xs text-white/70 break-all font-mono bg-black/30 rounded-lg px-3 py-2">
              {media.path}
            </div>
          </div>

          {/* Grid of metadata */}
          <div className="grid grid-cols-2 gap-4">
            {/* Type */}
            <div>
              <div className="text-xs text-[var(--muted)] uppercase tracking-wide mb-1">Type</div>
              <div className="text-sm">{media.type.toUpperCase()}</div>
            </div>

            {/* File Size */}
            <div>
              <div className="text-xs text-[var(--muted)] uppercase tracking-wide mb-1">File Size</div>
              <div className="text-sm">{formatBytes(media.size)}</div>
            </div>

            {/* Resolution */}
            {(media.width || media.height) && (
              <div>
                <div className="text-xs text-[var(--muted)] uppercase tracking-wide mb-1">Resolution</div>
                <div className="text-sm">{media.width || '?'} × {media.height || '?'}</div>
              </div>
            )}

            {/* Duration (for videos) */}
            {media.type === 'video' && (
              <div>
                <div className="text-xs text-[var(--muted)] uppercase tracking-wide mb-1">Duration</div>
                <div className="text-sm">{formatDuration(media.durationSec)}</div>
              </div>
            )}

            {/* Date Added */}
            <div>
              <div className="text-xs text-[var(--muted)] uppercase tracking-wide mb-1">Date Added</div>
              <div className="text-sm">{formatDate(media.addedAt)}</div>
            </div>

            {/* File Modified */}
            <div>
              <div className="text-xs text-[var(--muted)] uppercase tracking-wide mb-1">File Modified</div>
              <div className="text-sm">{formatDate(media.mtimeMs)}</div>
            </div>
          </div>

          {/* Stats section */}
          {stats && (
            <div className="pt-3 border-t border-[var(--border)]">
              <div className="text-xs text-[var(--muted)] uppercase tracking-wide mb-3">Statistics</div>
              <div className="grid grid-cols-3 gap-4">
                {/* Rating */}
                <div className="flex flex-col items-center p-3 bg-black/20 rounded-xl">
                  <Star size={16} className={stats.rating ? 'text-yellow-400' : 'text-white/30'} />
                  <div className="text-lg font-semibold mt-1">{stats.rating || 0}</div>
                  <div className="text-xs text-[var(--muted)]">Rating</div>
                </div>

                {/* View Count */}
                <div className="flex flex-col items-center p-3 bg-black/20 rounded-xl">
                  <Eye size={16} className="text-blue-400" />
                  <div className="text-lg font-semibold mt-1">{stats.viewCount || 0}</div>
                  <div className="text-xs text-[var(--muted)]">Views</div>
                </div>

                {/* O Count */}
                <div className="flex flex-col items-center p-3 bg-black/20 rounded-xl">
                  <Heart size={16} className="text-pink-400" />
                  <div className="text-lg font-semibold mt-1">{stats.oCount || 0}</div>
                  <div className="text-xs text-[var(--muted)]">O's</div>
                </div>
              </div>

              {/* Last Viewed */}
              {stats.lastViewedAt && (
                <div className="mt-3 text-center">
                  <span className="text-xs text-[var(--muted)]">Last viewed: </span>
                  <span className="text-xs">{formatDate(stats.lastViewedAt)}</span>
                </div>
              )}
            </div>
          )}

          {/* Tags section */}
          {tags.length > 0 && (
            <div className="pt-3 border-t border-[var(--border)]">
              <div className="text-xs text-[var(--muted)] uppercase tracking-wide mb-2">Tags</div>
              <div className="flex flex-wrap gap-1.5">
                {tags.map(tag => (
                  <span
                    key={tag.id}
                    className="px-2 py-1 text-xs rounded-lg bg-[var(--primary)]/20 text-[var(--primary)] border border-[var(--primary)]/30"
                  >
                    {tag.name}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Hash (collapsible for technical users) */}
          {media.hashSha256 && (
            <div className="pt-3 border-t border-[var(--border)]">
              <div className="text-xs text-[var(--muted)] uppercase tracking-wide mb-1">SHA-256 Hash</div>
              <div className="text-[10px] text-white/50 break-all font-mono bg-black/30 rounded-lg px-3 py-2">
                {media.hashSha256}
              </div>
            </div>
          )}

          {/* Notes Panel */}
          <div className="pt-3 border-t border-[var(--border)]">
            <MediaNotesPanel mediaId={media.id} />
          </div>
        </div>
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
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="playlist-picker-title"
      className="fixed inset-0 bg-black/90 backdrop-blur-md-sm flex items-center justify-center z-[60]"
    >
      <div className="w-[520px] rounded-3xl border border-white/10 bg-[var(--panel)] overflow-hidden shadow-2xl">
        <div className="px-6 py-4 border-b border-[var(--border)] flex items-center justify-between">
          <div id="playlist-picker-title" className="text-sm font-semibold">Add to Playlist</div>
          <Btn onClick={props.onClose} aria-label="Close dialog">Close</Btn>
        </div>
        <div className="p-4 space-y-2 max-h-[60vh] overflow-auto" role="list" aria-label="Available playlists">
          {props.playlists.map((p) => (
            <button
              key={p.id}
              role="listitem"
              onClick={() => props.onPick(p.id)}
              aria-label={`Add to playlist: ${p.name}`}
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
      // Update daily challenge progress for adding to playlist
      window.api.challenges?.updateProgress?.('add_to_playlist', 1)
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
        // Update daily challenge progress for creating playlist and adding item
        window.api.challenges?.updateProgress?.('create_playlist', 1)
        window.api.challenges?.updateProgress?.('add_to_playlist', 1)
      }
      props.onClose()
    } catch (e) {
      console.error('[AddToPlaylistPopup] Failed to create playlist:', e)
    }
  }


  const popup = (
    <div
      ref={popupRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-to-playlist-title"
      className="w-64 rounded-xl border border-white/15 bg-[var(--panel)] shadow-2xl overflow-hidden backdrop-blur-xl"
      style={{ position: 'fixed', top: pos.top, left: pos.left, zIndex: 99999 }}
      onClick={(e) => e.stopPropagation()}
    >
      <div id="add-to-playlist-title" className="px-3 py-2 border-b border-[var(--border)] text-xs font-semibold text-[var(--muted)]">
        Add to Playlist
      </div>
      {/* Create new */}
      <div className="px-3 py-2 border-b border-[var(--border)] flex gap-1">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
          placeholder="New playlist..."
          aria-label="New playlist name"
          className="flex-1 px-2 py-1 rounded-lg bg-black/20 border border-[var(--border)] outline-none focus:border-white/15 text-xs"
          onClick={(e) => e.stopPropagation()}
        />
        <button
          onClick={handleCreate}
          aria-label="Create new playlist"
          className="px-2 py-1 rounded-lg bg-[var(--primary)] text-white text-xs hover:opacity-90 transition"
        >
          +
        </button>
      </div>
      {/* Playlist list */}
      <div className="max-h-48 overflow-auto" role="list" aria-label="Available playlists">
        {loading ? (
          <div className="px-3 py-4 text-center text-xs text-[var(--muted)]" aria-live="polite">Loading...</div>
        ) : playlists.length === 0 ? (
          <div className="px-3 py-4 text-center text-xs text-[var(--muted)]">No playlists yet</div>
        ) : (
          playlists.map((pl) => {
            const isIn = containingIds.has(pl.id)
            return (
              <button
                key={pl.id}
                role="listitem"
                onClick={() => !isIn && handleAdd(pl.id)}
                aria-label={isIn ? `${pl.name} - already added` : `Add to ${pl.name}`}
                aria-disabled={isIn}
                className={cn(
                  'w-full text-left px-3 py-2 text-xs hover:bg-white/5 transition flex items-center justify-between',
                  isIn && 'opacity-60'
                )}
              >
                <span className="truncate">{pl.name}</span>
                {isIn && <span className="text-green-400 flex-shrink-0 ml-2" aria-hidden="true">✓</span>}
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
  // Preload phase - preload video URLs before showing wall
  const [preloading, setPreloading] = useState(false)
  const [preloadProgress, setPreloadProgress] = useState(0)
  const [preloadTotal, setPreloadTotal] = useState(0)
  const [showPreloadOption, setShowPreloadOption] = useState(true) // Show preload screen initially
  const preloadedUrlsRef = useRef<Map<string, string>>(new Map()) // Cache preloaded URLs
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [layout, setLayout] = useState<GoonWallLayout>('mosaic')
  const [focusedTileIndex, setFocusedTileIndex] = useState<number | null>(null) // Focus mode: clicked tile expands
  const [edgeRevealMode, setEdgeRevealMode] = useState(false) // Controls only appear at edges
  const [edgeActive, setEdgeActive] = useState(false) // True when mouse near edge
  const [countdownActive, setCountdownActive] = useState(false) // Cum countdown active
  const [countdownDuration, setCountdownDuration] = useState(30) // Countdown duration in seconds
  const [showCountdownPicker, setShowCountdownPicker] = useState(false) // Show duration picker

  // Visual effects settings from goonwall settings
  const visualEffects = useMemo(() => {
    const ve = props.settings?.goonwall?.visualEffects ?? {}
    return {
      heatOverlay: ve.heatOverlay ?? true,
      vignetteIntensity: ve.vignetteIntensity ?? 0.3,
      bloomIntensity: ve.bloomIntensity ?? 0.1,
      saturationBoost: ve.saturationBoost ?? 1.1,
      contrastBoost: ve.contrastBoost ?? 1.0,
    }
  }, [props.settings?.goonwall])

  // Load settings from props
  useEffect(() => {
    const gw = props.settings?.goonwall
    if (gw) {
      if (gw.tileCount) {
        const count = Math.min(gw.tileCount, 30)
        setTileCount(count)
        updateGoonMaxVideos(count)
      }
      if (gw.muted !== undefined) setMuted(gw.muted)
      if (gw.showHud !== undefined) setShowHud(gw.showHud)
      if (gw.layout) setLayout(gw.layout)
      if (gw.countdownDuration !== undefined) setCountdownDuration(gw.countdownDuration)
    }
  }, [props.settings?.goonwall])

  // Update max concurrent videos when tile count changes
  useEffect(() => {
    updateGoonMaxVideos(tileCount)
  }, [tileCount])

  // Save settings when they change
  const saveSettings = useCallback(async (patch: Partial<{ tileCount: number; muted: boolean; showHud: boolean; layout: GoonWallLayout; countdownDuration: number }>) => {
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
      let vids = (Array.isArray(result) ? result : []).filter((m: any) => m.type === 'video')

      // Apply blacklist filtering
      const blacklistSettings = props.settings?.blacklist
      if (blacklistSettings?.enabled) {
        const blacklistedIds = new Set(blacklistSettings.mediaIds || [])
        vids = vids.filter(v => !blacklistedIds.has(v.id))
      }

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

  // Preload video URLs before showing the wall (optional)
  const preloadVideos = async (videosToPreload: MediaRow[]) => {
    setPreloading(true)
    setPreloadProgress(0)
    setPreloadTotal(videosToPreload.length)
    preloadedUrlsRef.current.clear()

    const batchSize = 5 // Load 5 at a time
    let loaded = 0

    for (let i = 0; i < videosToPreload.length; i += batchSize) {
      const batch = videosToPreload.slice(i, i + batchSize)
      await Promise.all(
        batch.map(async (video) => {
          try {
            // Try low-res first for faster preloading
            let url: string | null = null
            if (tileCount >= 9 && window.api.media.getLowResUrl) {
              const maxH = tileCount > 16 ? 360 : 480
              url = await window.api.media.getLowResUrl(video.id, maxH) as string
            }
            if (!url) {
              url = await window.api.media.getPlayableUrl(video.id) as string
            }
            if (url) {
              preloadedUrlsRef.current.set(video.id, url)
            }
          } catch {
            // Skip failed preloads
          }
          loaded++
          setPreloadProgress(loaded)
        })
      )
    }

    setPreloading(false)
    setShowPreloadOption(false)
  }

  // Start wall without preloading
  const startWithoutPreload = () => {
    setShowPreloadOption(false)
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

  // Cascade shuffle - tiles shuffle one by one in a wave pattern
  const [shufflingTiles, setShufflingTiles] = useState<Set<number>>(new Set())
  const cascadeShuffleRef = useRef<NodeJS.Timeout[]>([])

  const cascadeShuffle = useCallback(() => {
    // Clear any pending cascade
    cascadeShuffleRef.current.forEach(t => clearTimeout(t))
    cascadeShuffleRef.current = []

    const usable = getUsableVideos()
    if (usable.length === 0) return

    // Calculate grid layout to determine wave order
    const cols = Math.ceil(Math.sqrt(tileCount * 1.6))

    // Shuffle each tile with a delay based on position
    tiles.forEach((_, idx) => {
      const row = Math.floor(idx / cols)
      const col = idx % cols
      const delay = (row + col) * 100 // Wave from top-left to bottom-right

      const timeout = setTimeout(() => {
        setShufflingTiles(prev => new Set(prev).add(idx))

        const currentIds = new Set(tiles.map(t => t.id))
        const available = usable.filter(v => !currentIds.has(v.id))
        if (available.length > 0) {
          const newVideo = available[Math.floor(Math.random() * available.length)]
          setTiles(prev => {
            const next = [...prev]
            next[idx] = newVideo
            return next
          })
        }

        // Remove from shuffling set after animation
        setTimeout(() => {
          setShufflingTiles(prev => {
            const next = new Set(prev)
            next.delete(idx)
            return next
          })
        }, 300)
      }, delay)

      cascadeShuffleRef.current.push(timeout)
    })

    window.api.goonwall?.shuffle?.()
  }, [tiles, tileCount, getUsableVideos])

  // Cleanup cascade timeouts on unmount
  useEffect(() => {
    return () => {
      cascadeShuffleRef.current.forEach(t => clearTimeout(t))
    }
  }, [])

  useEffect(() => {
    void loadVideos()
    // Track goon wall session start
    window.api.goonwall?.startSession?.(tileCount)

    // Subscribe to vault changes (file additions/deletions)
    const unsub = window.api.events?.onVaultChanged?.(() => {
      void loadVideos()
    })

    return () => {
      unsub?.()
      // Force cleanup of all videos when leaving GoonWall
      // This ensures audio stops when navigating away
      videoPool.releaseAll()
      resetGoonSlots()
      // Aggressively stop all video and audio elements
      document.querySelectorAll('video').forEach(v => {
        try {
          v.pause()
          v.muted = true
          v.volume = 0
          v.removeAttribute('src')
          v.srcObject = null
          v.load()
        } catch (e) {
          // Ignore errors
        }
      })
      document.querySelectorAll('audio').forEach(a => {
        try {
          a.pause()
          a.muted = true
          a.volume = 0
        } catch (e) {
          // Ignore errors
        }
      })
    }
  }, [])

  // Keyboard shortcuts for GoonWall
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return

      switch (e.key.toLowerCase()) {
        case 's': // S - cascade shuffle all (wave effect)
          cascadeShuffle()
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
        case 'escape': // Escape - cancel countdown, exit focus mode, or fullscreen
          if (countdownActive) {
            setCountdownActive(false)
          } else if (showCountdownPicker) {
            setShowCountdownPicker(false)
          } else if (focusedTileIndex !== null) {
            setFocusedTileIndex(null)
          } else if (document.fullscreenElement) {
            document.exitFullscreen()
            setIsFullscreen(false)
          }
          break
        case 'c': // C - start countdown with last duration
          if (!countdownActive) {
            setCountdownActive(true)
            setShowCountdownPicker(false)
          }
          break
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [props.heatLevel, props.onHeatChange, focusedTileIndex, cascadeShuffle, countdownActive, showCountdownPicker])

  // Edge reveal detection - show controls when mouse near edges (throttled)
  useEffect(() => {
    if (!edgeRevealMode) {
      setEdgeActive(false)
      return
    }

    let lastRun = 0
    const throttleMs = 50

    const handleMouseMove = (e: MouseEvent) => {
      const now = Date.now()
      if (now - lastRun < throttleMs) return
      lastRun = now

      const edgeThreshold = 80
      const nearEdge =
        e.clientX < edgeThreshold ||
        e.clientX > window.innerWidth - edgeThreshold ||
        e.clientY < edgeThreshold ||
        e.clientY > window.innerHeight - edgeThreshold
      setEdgeActive(nearEdge)
    }

    window.addEventListener('mousemove', handleMouseMove)
    return () => window.removeEventListener('mousemove', handleMouseMove)
  }, [edgeRevealMode])

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

  // Calculate optimal grid dimensions for equal-sized tiles
  const rows = Math.ceil(tileCount / cols)

  const getGridStyle = (): React.CSSProperties => {
    if (layout === 'grid') {
      return {
        display: 'grid',
        gridTemplateColumns: `repeat(${cols}, 1fr)`,
        gridTemplateRows: `repeat(${rows}, 1fr)`,
        width: '100%',
        height: '100%',
        gap: '2px',
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
          (edgeRevealMode ? edgeActive : showHud) ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-full pointer-events-none'
        )}
      >
          {/* Video count slider */}
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-white/40">{tileCount}</span>
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
            <span className="text-[10px] text-white/40">max</span>
            <span className="text-[10px] text-pink-400 font-medium w-5 text-center">{tileCount}</span>
          </div>

          <div className="w-px h-6 bg-white/20" />

          {/* Shuffle buttons - instant and cascade */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => cascadeShuffle()}
              className="px-2 py-1.5 rounded-lg text-xs bg-white/10 hover:bg-white/20 transition flex items-center gap-1"
              title="Cascade Shuffle (S) - Wave effect"
            >
              <Shuffle size={14} />
              <Zap size={10} className="text-yellow-400" />
            </button>
            <button
              onClick={() => shuffleTiles()}
              className="px-2 py-1.5 rounded-lg text-xs bg-white/5 hover:bg-white/15 transition"
              title="Instant Shuffle"
            >
              <Shuffle size={14} />
            </button>
          </div>

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
              <LayoutGrid size={14} />
            </button>
            <button
              onClick={() => { setLayout('mosaic'); saveSettings({ layout: 'mosaic' }) }}
              className={cn(
                'w-7 h-7 rounded-lg text-sm transition flex items-center justify-center',
                layout === 'mosaic' ? 'bg-white/20 text-white' : 'bg-white/5 text-white/60 hover:bg-white/10'
              )}
              title="Mosaic layout"
            >
              <Sparkles size={14} />
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
            {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
          </button>

          <div className="w-px h-6 bg-white/20" />

          {/* Fullscreen */}
          <button
            onClick={toggleFullscreen}
            className="w-7 h-7 rounded-lg text-sm bg-white/5 hover:bg-white/15 transition flex items-center justify-center"
            title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen (F)'}
          >
            {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
          </button>

          <div className="w-px h-6 bg-white/20" />

          {/* Edge Reveal Mode */}
          <button
            onClick={() => setEdgeRevealMode(!edgeRevealMode)}
            className={cn(
              'w-7 h-7 rounded-lg text-sm transition flex items-center justify-center',
              edgeRevealMode ? 'bg-[var(--primary)]/30 text-[var(--primary)]' : 'bg-white/5 text-white/60 hover:bg-white/10'
            )}
            title={edgeRevealMode ? 'Edge Reveal Mode ON - Controls show at edges' : 'Edge Reveal Mode OFF'}
          >
            <EyeOff size={14} />
          </button>

          <div className="w-px h-6 bg-white/20" />

          {/* Cum Countdown */}
          <div className="relative">
            <button
              onClick={() => {
                if (countdownActive) {
                  setCountdownActive(false)
                } else {
                  setShowCountdownPicker(!showCountdownPicker)
                }
              }}
              className={cn(
                'px-3 py-1.5 rounded-lg text-xs font-medium transition flex items-center gap-1.5',
                countdownActive
                  ? 'bg-pink-600 text-white animate-pulse'
                  : 'bg-gradient-to-r from-pink-600 to-red-600 text-white hover:opacity-90'
              )}
              title={countdownActive ? 'Cancel Countdown' : 'Start Cum Countdown'}
            >
              <Timer size={14} />
              {countdownActive ? 'Cancel' : 'Countdown'}
            </button>

            {/* Duration picker dropdown */}
            {showCountdownPicker && !countdownActive && (
              <div className="absolute top-full mt-2 left-1/2 -translate-x-1/2 bg-gray-900/95 backdrop-blur-md rounded-xl border border-white/20 p-3 shadow-xl z-50 min-w-[160px]">
                <div className="text-xs text-white/60 mb-2 text-center">Select Duration</div>
                <div className="grid grid-cols-2 gap-2">
                  {[10, 30, 60, 120].map(sec => (
                    <button
                      key={sec}
                      onClick={() => {
                        setCountdownDuration(sec)
                        saveSettings({ countdownDuration: sec })
                        setShowCountdownPicker(false)
                        setCountdownActive(true)
                      }}
                      className={cn(
                        'px-3 py-2 rounded-lg text-sm font-medium transition',
                        countdownDuration === sec
                          ? 'bg-pink-600 text-white'
                          : 'bg-white/10 text-white hover:bg-white/20'
                      )}
                    >
                      {sec < 60 ? `${sec}s` : `${sec / 60}m`}
                    </button>
                  ))}
                </div>
                <div className="mt-2 pt-2 border-t border-white/10">
                  <input
                    type="number"
                    min={5}
                    max={300}
                    value={countdownDuration}
                    onChange={(e) => {
                      const val = Math.max(5, Math.min(300, Number(e.target.value)))
                      setCountdownDuration(val)
                      saveSettings({ countdownDuration: val })
                    }}
                    className="w-full px-3 py-2 rounded-lg bg-white/10 border border-white/20 text-white text-sm text-center"
                    placeholder="Custom (seconds)"
                  />
                  <button
                    onClick={() => {
                      setShowCountdownPicker(false)
                      setCountdownActive(true)
                    }}
                    className="w-full mt-2 px-3 py-2 rounded-lg bg-pink-600 text-white text-sm font-medium hover:bg-pink-700 transition"
                  >
                    Start
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

      {/* Toggle HUD button - smaller, top right (hidden in edge reveal mode) */}
      <button
        onClick={() => {
          if (edgeRevealMode) {
            setEdgeRevealMode(false)
          } else {
            setShowHud(!showHud)
            saveSettings({ showHud: !showHud })
          }
        }}
        className={cn(
          "absolute top-3 right-3 z-50 w-8 h-8 rounded-lg text-xs bg-gray-800/90 hover:bg-gray-700/90 border border-white/20 flex items-center justify-center transition group",
          edgeRevealMode && !edgeActive && "opacity-0 pointer-events-none"
        )}
        title={edgeRevealMode ? 'Exit Edge Reveal Mode' : showHud ? 'Hide HUD (H)' : 'Show HUD (H)'}
      >
        {edgeRevealMode ? <EyeOff size={16} className="text-[var(--primary)]" /> : showHud ? <Eye size={16} /> : <EyeOff size={16} />}
      </button>

      {/* Keyboard shortcuts hint - bottom left with slide animation */}
      <div
        className={cn(
          'absolute bottom-3 left-3 z-50 transition-all duration-300 ease-in-out',
          (edgeRevealMode ? edgeActive : showHud) ? 'opacity-0 hover:opacity-100 translate-x-0' : 'opacity-0 -translate-x-full pointer-events-none'
        )}
      >
        <div className="text-[10px] text-white/40 bg-black/60 rounded-lg px-3 py-2 border border-white/10 space-y-0.5">
          <div><span className="text-white/60">S</span> Cascade Shuffle</div>
          <div><span className="text-white/60">M</span> Mute</div>
          <div><span className="text-white/60">C</span> Countdown</div>
          <div><span className="text-white/60">F</span> Fullscreen</div>
          <div><span className="text-white/60">H</span> Toggle HUD</div>
          <div><span className="text-pink-400">G</span> Goon Mode</div>
          {edgeRevealMode && <div><span className="text-[var(--primary)]">Edge Reveal Active</span></div>}
        </div>
      </div>

      {/* Loading state */}
      {loading && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black">
          <div className="w-12 h-12 border-4 border-white/20 border-t-white/80 rounded-full animate-spin mb-4" />
          <div className="text-white/60">Loading videos...</div>
        </div>
      )}

      {/* Preload option screen */}
      {!loading && !error && showPreloadOption && videos.length > 0 && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black z-40">
          <div className="text-center max-w-md px-4">
            <div className="text-4xl mb-4">🎬</div>
            <div className="text-xl font-bold mb-2">GoonWall Ready</div>
            <div className="text-white/60 mb-6">
              {videos.length} videos available • {tileCount} tiles
            </div>

            {preloading ? (
              <div className="space-y-4">
                <div className="text-sm text-white/60">
                  Preloading videos for smooth playback...
                </div>
                <div className="w-64 h-2 bg-white/10 rounded-full overflow-hidden mx-auto">
                  <div
                    className="h-full bg-gradient-to-r from-pink-500 to-purple-500 transition-all duration-300"
                    style={{ width: `${(preloadProgress / preloadTotal) * 100}%` }}
                  />
                </div>
                <div className="text-sm text-white/40">
                  {preloadProgress} / {preloadTotal} videos preloaded
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <button
                  onClick={() => preloadVideos(tiles)}
                  className="w-full px-6 py-3 bg-gradient-to-r from-pink-600 to-purple-600 hover:from-pink-500 hover:to-purple-500 rounded-xl font-medium transition"
                >
                  Preload {tileCount} Videos First
                  <div className="text-xs text-white/60 mt-1">Smoother experience, takes a moment</div>
                </button>
                <button
                  onClick={startWithoutPreload}
                  className="w-full px-6 py-3 bg-white/10 hover:bg-white/20 rounded-xl font-medium transition"
                >
                  Start Immediately
                  <div className="text-xs text-white/60 mt-1">Videos load as they play</div>
                </button>
              </div>
            )}
          </div>
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
      {!loading && !error && !showPreloadOption && tiles.length > 0 && (
        <div
          className="absolute inset-0 overflow-hidden"
          style={{
            ...getGridStyle(),
            // Apply visual effects from settings
            filter: `saturate(${visualEffects.saturationBoost}) contrast(${visualEffects.contrastBoost})`,
          }}
        >
          {tiles.map((media, idx) => (
            <GoonTile
              key={`${media.id}-${idx}`}
              media={media}
              muted={focusedTileIndex !== null ? (idx !== focusedTileIndex) : muted}
              style={getTileStyle(idx)}
              onShuffle={() => shuffleSingleTile(idx)}
              index={idx}
              tileCount={tileCount}
              onBroken={markBroken}
              layout={layout}
              isFocused={focusedTileIndex === idx}
              isBlurred={focusedTileIndex !== null && focusedTileIndex !== idx}
              onFocus={() => setFocusedTileIndex(focusedTileIndex === idx ? null : idx)}
              isShuffling={shufflingTiles.has(idx)}
              shuffleInterval={props.settings?.goonwall?.intervalSec ?? 45}
              startAtClimaxPoint={props.settings?.goonwall?.startAtClimaxPoint ?? true}
              preloadedUrl={preloadedUrlsRef.current.get(media.id)}
            />
          ))}

          {/* Vignette Overlay */}
          {visualEffects.vignetteIntensity > 0 && (
            <div
              className="absolute inset-0 pointer-events-none z-10"
              style={{
                background: `radial-gradient(ellipse at center, transparent 30%, rgba(0,0,0,${visualEffects.vignetteIntensity}) 100%)`,
              }}
            />
          )}

          {/* Bloom/Glow Overlay */}
          {visualEffects.bloomIntensity > 0 && (
            <div
              className="absolute inset-0 pointer-events-none z-10 mix-blend-screen"
              style={{
                background: `radial-gradient(ellipse at center, rgba(255,100,150,${visualEffects.bloomIntensity * 0.15}) 0%, transparent 70%)`,
              }}
            />
          )}
        </div>
      )}

      {/* Focus Mode Overlay - click outside to exit */}
      {focusedTileIndex !== null && (
        <div
          className="absolute inset-0 z-40"
          onClick={() => setFocusedTileIndex(null)}
        />
      )}

      {/* Empty state */}
      {!loading && !error && tiles.length === 0 && (
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <div className="text-6xl mb-4 opacity-30">🎬</div>
          <div className="text-lg font-medium text-white/60">No videos found</div>
          <div className="text-sm text-white/40 mt-2">Add some videos to your library first</div>
        </div>
      )}

      {/* Cum Countdown Overlay */}
      <CumCountdownOverlay
        active={countdownActive}
        config={{
          duration: countdownDuration,
          onComplete: () => {
            setCountdownActive(false)
            props.onClimax('cum')
          },
          onCancel: () => setCountdownActive(false),
        }}
      />
    </div>
  )
}

// Global playback limiter for GoonWall - prevents Chrome from fighting over resources
let goonActiveVideos = 0
// Dynamic max based on tile count - fewer tiles = more videos can play each
// More tiles = show more as thumbnails to prevent GPU overload
const getGoonMaxVideos = (tileCount: number) => {
  if (tileCount <= 4) return tileCount
  if (tileCount <= 9) return 6
  if (tileCount <= 16) return 8
  if (tileCount <= 25) return 12
  return 15 // Increased max for better coverage
}
let GOON_MAX_VIDEOS = 8 // Default, updated dynamically
const goonVideoQueue: Array<{ start: () => void; id: string; priority: number }> = []

// Reset all goon slots - call when leaving GoonWall
function resetGoonSlots(): void {
  goonActiveVideos = 0
  goonVideoQueue.length = 0
  GOON_MAX_VIDEOS = 8 // Reset to default
}

// Update max videos based on tile count
function updateGoonMaxVideos(tileCount: number): void {
  GOON_MAX_VIDEOS = getGoonMaxVideos(tileCount)
  // Process queue if we now have more slots available
  while (goonActiveVideos < GOON_MAX_VIDEOS && goonVideoQueue.length > 0) {
    const next = goonVideoQueue.shift()
    if (next) {
      goonActiveVideos++
      next.start()
    }
  }
}

// Request a slot with priority (lower = higher priority, used for randomization)
function requestGoonSlot(id: string, onSlotAvailable: () => void, priority: number = 0): () => void {
  if (goonActiveVideos < GOON_MAX_VIDEOS) {
    goonActiveVideos++
    onSlotAvailable()
    return () => {
      goonActiveVideos--
      if (goonVideoQueue.length > 0) {
        const next = goonVideoQueue.shift()
        if (next) {
          goonActiveVideos++
          next.start()
        }
      }
    }
  } else {
    // Insert by priority (lower priority number = earlier in queue)
    const entry = { start: onSlotAvailable, id, priority }
    const insertIdx = goonVideoQueue.findIndex(q => q.priority > priority)
    if (insertIdx === -1) {
      goonVideoQueue.push(entry)
    } else {
      goonVideoQueue.splice(insertIdx, 0, entry)
    }
    return () => {
      const idx = goonVideoQueue.findIndex(q => q.id === id)
      if (idx !== -1) {
        goonVideoQueue.splice(idx, 1)
      } else {
        goonActiveVideos--
        if (goonVideoQueue.length > 0) {
          const next = goonVideoQueue.shift()
          if (next) {
            goonActiveVideos++
            next.start()
          }
        }
      }
    }
  }
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
  isFocused?: boolean
  isBlurred?: boolean
  onFocus?: () => void
  isShuffling?: boolean
  shuffleInterval?: number // seconds between auto-shuffles (0 = disabled)
  startAtClimaxPoint?: boolean // Start videos at 70-80% through (false = start from beginning)
  preloadedUrl?: string // URL preloaded by parent for faster startup
}) {
  const { media, muted, style, onShuffle, index, tileCount, onBroken, layout, isFocused, isBlurred, onFocus, isShuffling, shuffleInterval = 45, startAtClimaxPoint = true, preloadedUrl } = props
  const isMosaic = layout === 'mosaic'
  const [url, setUrl] = useState('')
  const [retried, setRetried] = useState(false)
  const [ready, setReady] = useState(false)
  const [hasSlot, setHasSlot] = useState(false) // Whether this tile has a playback slot
  const videoRef = useRef<HTMLVideoElement>(null)
  const autoShuffleRef = useRef<NodeJS.Timeout | null>(null)
  const releaseSlotRef = useRef<(() => void) | null>(null)
  const audioVolumeRef = useRef(0) // Use ref instead of state to avoid re-renders
  const fadeAnimationRef = useRef<number | null>(null)

  // Right-click to skip to next video
  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    onShuffle()
  }, [onShuffle])

  // Auto-shuffle timer - each tile has a randomized interval
  // shuffleInterval of 0 means disabled (no auto-shuffle)
  useEffect(() => {
    if (!ready || isFocused || shuffleInterval === 0) return

    // Randomize the shuffle interval per tile (shuffleInterval +/- 15 seconds)
    const randomizedInterval = (shuffleInterval + (Math.random() * 30 - 15)) * 1000

    autoShuffleRef.current = setTimeout(() => {
      onShuffle()
    }, randomizedInterval)

    return () => {
      if (autoShuffleRef.current) {
        clearTimeout(autoShuffleRef.current)
      }
    }
  }, [ready, isFocused, shuffleInterval, onShuffle, media.id])

  // PERFORMANCE OPTIMIZATION: Load URL first, then request slot when ready to play
  // This ensures slots are only used by tiles that can actually play
  // Random priority ensures different tiles get chances to play
  const urlReadyRef = useRef(false)
  const slotPriorityRef = useRef(Math.random()) // Random priority for fair distribution

  // Load video URL (happens regardless of slot availability)
  useEffect(() => {
    let alive = true
    setRetried(false)
    setReady(false)
    setUrl('')
    setHasSlot(false)
    urlReadyRef.current = false
    slotPriorityRef.current = Math.random() // New random priority for each video

    // Release any existing slot
    if (releaseSlotRef.current) {
      releaseSlotRef.current()
      releaseSlotRef.current = null
    }

    // If we have a preloaded URL, use it immediately
    if (preloadedUrl) {
      urlReadyRef.current = true
      setUrl(preloadedUrl)
      // Request slot immediately since URL is ready
      releaseSlotRef.current = requestGoonSlot(media.id, () => {
        if (!alive) return
        setHasSlot(true)
      }, slotPriorityRef.current)
      return () => {
        alive = false
        if (releaseSlotRef.current) {
          releaseSlotRef.current()
          releaseSlotRef.current = null
        }
      }
    }

    // Stagger URL loading: first 6 immediate, rest with small delay
    const delay = index < 6 ? 0 : Math.min((index - 6) * 30, 500)
    const timer = setTimeout(() => {
      if (!alive) return

      // Load the video URL first
      const loadUrl = async () => {
        try {
          let videoUrl: string | null = null

          // For many tiles, try low-res first for faster loading
          if (tileCount >= 9 && window.api.media.getLowResUrl) {
            const maxH = tileCount > 16 ? 360 : 480
            try {
              videoUrl = await window.api.media.getLowResUrl(media.id, maxH) as string
            } catch {
              // Fall through to full-res
            }
          }

          if (!videoUrl) {
            videoUrl = await window.api.media.getPlayableUrl(media.id) as string
          }

          if (!alive || !videoUrl) {
            if (alive) onShuffle()
            return
          }

          // URL is ready - now request a slot
          urlReadyRef.current = true
          setUrl(videoUrl)

          // Request slot with random priority so different tiles get chances
          releaseSlotRef.current = requestGoonSlot(media.id, () => {
            if (!alive) return
            setHasSlot(true)
          }, slotPriorityRef.current)

        } catch (err) {
          if (alive) onShuffle()
        }
      }

      loadUrl()
    }, delay)

    return () => {
      alive = false
      clearTimeout(timer)
      // Release slot on cleanup
      if (releaseSlotRef.current) {
        releaseSlotRef.current()
        releaseSlotRef.current = null
      }
    }
  }, [media.id, media.path, onShuffle, tileCount, index, preloadedUrl])

  // Track video element for cleanup - store reference that persists through unmount
  const videoElementRef = useRef<HTMLVideoElement | null>(null)
  useEffect(() => {
    videoElementRef.current = videoRef.current
  })

  // Cleanup video and fade animation on unmount
  // Note: slot is released in the main useEffect cleanup
  useEffect(() => {
    return () => {
      // Use stored ref since videoRef.current may be null during cleanup
      const videoElement = videoElementRef.current || videoRef.current
      if (videoElement) {
        try {
          videoElement.pause()
          videoElement.muted = true
          videoElement.volume = 0
          videoElement.removeAttribute('src')
          videoElement.srcObject = null
          videoElement.load()
        } catch (e) {
          // Ignore
        }
      }
      if (fadeAnimationRef.current) {
        cancelAnimationFrame(fadeAnimationRef.current)
        fadeAnimationRef.current = null
      }
    }
  }, [])

  // Mute sync
  useEffect(() => {
    if (videoRef.current) videoRef.current.muted = muted
  }, [muted])

  // Audio crossfade using requestAnimationFrame for smooth performance
  useEffect(() => {
    if (fadeAnimationRef.current) {
      cancelAnimationFrame(fadeAnimationRef.current)
      fadeAnimationRef.current = null
    }

    const video = videoRef.current
    if (!video) return

    const fadeAudio = (targetVolume: number, duration: number) => {
      const startVolume = audioVolumeRef.current
      const startTime = performance.now()

      const animate = (currentTime: number) => {
        const elapsed = currentTime - startTime
        const progress = Math.min(elapsed / duration, 1)
        const newVolume = startVolume + (targetVolume - startVolume) * progress

        const clampedVolume = Math.max(0, Math.min(1, newVolume))
        audioVolumeRef.current = clampedVolume
        if (video && !muted) video.volume = clampedVolume

        if (progress < 1) {
          fadeAnimationRef.current = requestAnimationFrame(animate)
        }
      }

      fadeAnimationRef.current = requestAnimationFrame(animate)
    }

    if (isShuffling) {
      fadeAudio(0, 200) // Fade out over 200ms
    } else if (ready && !muted) {
      fadeAudio(1, 300) // Fade in over 300ms
    }

    return () => {
      if (fadeAnimationRef.current) {
        cancelAnimationFrame(fadeAnimationRef.current)
        fadeAnimationRef.current = null
      }
    }
  }, [isShuffling, ready, muted])

  // Seek to "climax point" (70-80% through video) on metadata load if enabled
  const handleLoadedMetadata = useCallback(() => {
    const video = videoRef.current
    if (!video) return

    // Set the start position
    if (video.duration && video.duration >= 2 && startAtClimaxPoint) {
      const climaxPoint = 0.7 + Math.random() * 0.1
      video.currentTime = climaxPoint * video.duration
    }

    // Only play if we have a slot
    if (hasSlot) {
      setReady(true)
      video.play().catch(() => {})
    }
  }, [startAtClimaxPoint, hasSlot])

  // Start playing when slot becomes available (if video is already loaded)
  useEffect(() => {
    if (hasSlot && url && videoRef.current) {
      const video = videoRef.current
      // Check if video is ready to play
      if (video.readyState >= 2) {
        setReady(true)
        video.play().catch(() => {})
      }
    }
  }, [hasSlot, url])

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

  // Playback recovery - handle browser pausing/stalling videos due to resource limits
  // Use refs to avoid re-renders and prevent recovery loops

  // Let browser manage video playback naturally - no automatic recovery
  // This prevents fighting with browser resource management which causes stuttering

  // Poster thumbnail URL
  const [poster, setPoster] = useState('')
  useEffect(() => {
    if (media.thumbPath) {
      toFileUrlCached(media.thumbPath).then(u => setPoster(u)).catch(() => {})
    }
  }, [media.thumbPath])

  // Focus mode styles
  const focusStyles: React.CSSProperties = isFocused ? {
    position: 'fixed',
    left: '15%',
    top: '15%',
    width: '70%',
    height: '70%',
    zIndex: 50,
    borderRadius: '16px',
    boxShadow: '0 0 60px rgba(0,0,0,0.8), 0 0 100px rgba(var(--primary-rgb), 0.3)',
    transition: 'all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)',
  } : {}

  const blurStyles: React.CSSProperties = isBlurred ? {
    filter: 'blur(8px) brightness(0.4)',
    transform: 'scale(0.95)',
    transition: 'all 0.3s ease-out',
  } : {}

  // Cascade shuffle animation - use CSS classes for smooth dissolve/crossfade
  const shuffleClass = isShuffling ? 'tile-dissolve-out' : ''
  const enterClass = !isShuffling && ready ? 'tile-dissolve-in' : ''

  return (
    <div
      className={cn(
        "relative overflow-hidden bg-black group cursor-pointer",
        isFocused && "rounded-2xl border-2 border-[var(--primary)]/50",
        shuffleClass,
        enterClass
      )}
      style={{
        ...style,
        ...focusStyles,
        ...blurStyles,
        contain: isFocused ? undefined : 'strict',
        animationDelay: `${index * 50}ms`,
        animationFillMode: 'backwards',
        transformStyle: 'preserve-3d',
        perspective: '1000px',
      }}
      onClick={(e) => {
        e.stopPropagation()
        if (onFocus) {
          onFocus()
        } else {
          onShuffle()
        }
      }}
      onContextMenu={handleContextMenu}
    >
      {/* Show thumbnail poster while video loads */}
      {poster && !url && (
        <img
          src={poster}
          className="absolute inset-0 w-full h-full object-cover"
          alt=""
        />
      )}

      {/* Create video element when URL is available - plays when slot is granted */}
      {url && (
        <video
          ref={videoRef}
          src={url}
          loop
          muted={muted}
          playsInline
          preload="auto"
          className={`w-full h-full goon-video ${isFocused ? 'object-contain' : isMosaic ? 'object-cover' : 'object-contain'}`}
          style={{ opacity: ready ? 1 : 0 }}
          onLoadedMetadata={handleLoadedMetadata}
          onCanPlay={() => setReady(true)}
          onError={handleError}
        />
      )}

      {/* Poster overlay when video loaded but not ready/playing yet */}
      {poster && url && !ready && (
        <img
          src={poster}
          className="absolute inset-0 w-full h-full object-cover"
          alt=""
        />
      )}

      {/* Loading shimmer when no poster and not ready */}
      {!poster && !ready && (
        <div className="absolute inset-0 bg-gray-900 sexy-shimmer" />
      )}

      {/* Waiting for slot indicator */}
      {url && !hasSlot && (
        <div className="absolute bottom-2 right-2 px-2 py-1 bg-black/60 rounded-full flex items-center gap-1">
          <div className="w-3 h-3 border-2 border-white/30 border-t-white/70 rounded-full animate-spin" />
          <span className="text-[10px] text-white/60">queued</span>
        </div>
      )}

      {/* Hover overlay - not shown when focused */}
      {!isFocused && (
        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center">
          <div className="text-xs text-white/80 text-center p-2 truncate max-w-full">
            {media.path.split(/[/\\]/).pop() || 'Unknown'}
          </div>
          <div className="text-[10px] text-white/50">Click to focus | Right-click to skip</div>
        </div>
      )}

      {/* Focus mode close hint */}
      {isFocused && (
        <div className="absolute top-4 right-4 px-3 py-1.5 bg-black/80 rounded-full text-xs text-white/60 backdrop-blur-sm">
          Click to unfocus | Esc to exit
        </div>
      )}
    </div>
  )
})


// ═══════════════════════════════════════════════════════════════════════════
// CAPTIONS PAGE - "Brainwash" - Add captions to media
// ═══════════════════════════════════════════════════════════════════════════

interface CaptionedMedia {
  id: string
  mediaId: string
  topText: string | null
  bottomText: string | null
  presetId: string
  customStyle: string | null
  createdAt: number
  updatedAt: number
  path: string
  filename: string
  type: string
  thumbPath: string | null
}

interface CaptionTemplate {
  id: string
  topText: string | null
  bottomText: string | null
  category: string
  createdAt: number
}

// Example captions for inspiration
const EXAMPLE_CAPTIONS: Array<{ top: string | null; bottom: string | null; category: string }> = [
  // Mommy
  { top: "Mommy's throat is your cocksleeve", bottom: "Now fuck it like you hate me", category: "mommy" },
  { top: "MOMMY'S GOOD BOY", bottom: null, category: "mommy" },
  { top: "CUM FOR MOMMY", bottom: null, category: "mommy" },

  // Degrading
  { top: "You're just a set of holes for my cock", bottom: "And I'm going to ruin every single one", category: "degrading" },
  { top: "I'm daddy's good little cumdump", bottom: "Please pump my stomach full of your seed", category: "degrading" },
  { top: "Stare at my ass while I bounce on your dick", bottom: "Don't you dare look away, you pathetic fuck", category: "degrading" },
  { top: "I want you to ruin my makeup with your cum", bottom: "Cover my face until I'm unrecognizable", category: "degrading" },
  { top: "Choke me on your thick cock", bottom: "Make me gag and tear up like a good whore", category: "degrading" },
  { top: "I'm a worthless piece of fuckmeat", bottom: "Use me until I'm broken and discarded", category: "degrading" },

  // Goon
  { top: "Your mind is breaking and your cock is leaking", bottom: "Just let go and become a mindless gooner", category: "goon" },
  { top: "I'm a brainless gooner who needs porn", bottom: "Please melt my mind with your cock", category: "goon" },
  { top: null, bottom: "GOOD GOONER", category: "goon" },
  { top: null, bottom: "STROKE PUMP EDGE", category: "goon" },
  { top: null, bottom: "MINDLESS", category: "goon" },
  { top: null, bottom: "PORN IS LIFE", category: "goon" },
  { top: "I'm a mindless drone for your cock", bottom: "Please reprogram me to be your perfect slave", category: "goon" },

  // Bimbo
  { top: "Your cock is making me so stupid", bottom: "I can't think about anything but being fucked", category: "bimbo" },
  { top: "I'm a brainless bimbo fuckdoll", bottom: "My only purpose is to please your cock", category: "bimbo" },

  // Worship
  { top: "Your cock is my new religion", bottom: "I'm going to worship it every single day", category: "worship" },
  { top: "Beg for me to sit on your stupid face", bottom: "Smother you with this perfect ass", category: "worship" },

  // Cheating
  { top: "Your cock looks so much better than my husband's", bottom: "I'm going to drain your balls completely dry", category: "cheating" },
  { top: "I'm a cheating whore who loves big cock", bottom: "And I don't care who knows it", category: "cheating" },

  // Submissive
  { top: "Thank you for using my throat, sir", bottom: "I love being a worthless little cocksucker", category: "submissive" },
  { top: "My ass is yours to destroy", bottom: "Stretch me out until I'm gaping for you", category: "submissive" },
  { top: "I'm a public cumdump for anyone to use", bottom: "Please fill my holes with your hot load", category: "submissive" },
  { top: "I'm a submissive little puppy for my master", bottom: "Please train me to be the perfect pet", category: "submissive" },

  // Gangbang
  { top: "I'm a gangbang whore who loves being used", bottom: "Please pass me around to all your friends", category: "gangbang" },
]

// ═══════════════════════════════════════════════════════════════════════════
// AI TAGGER PAGE - Multi-tier AI analysis for auto-tagging
// ═══════════════════════════════════════════════════════════════════════════

interface ModelInfo {
  name: string
  filename: string
  size: number
  downloaded: boolean
}

interface QueueStatus {
  total: number
  pending: number
  processing: number
  completed: number
  failed: number
  isRunning: boolean
  isPaused: boolean
  currentMediaId: string | null
}

interface ReviewItem {
  mediaId: string
  filename: string
  thumbnailPath?: string
  suggestedTitle?: string
  description?: string
  matchedTags: Array<{ id: number; name: string; confidence: number }>
  newTagSuggestions: Array<{ name: string; confidence: number }>
  nsfwCategory?: string
  nsfwConfidence?: number
  reviewStatus: 'pending' | 'approved' | 'rejected'
  createdAt: string
}

function AiTaggerPage() {
  const { showToast } = useToast()

  // Model state
  const [models, setModels] = useState<ModelInfo[]>([])
  const [modelsReady, setModelsReady] = useState(false)
  const [downloadingModel, setDownloadingModel] = useState<string | null>(null)
  const [downloadProgress, setDownloadProgress] = useState(0)

  // Venice API state
  const [veniceApiKey, setVeniceApiKey] = useState('')
  const [tier2Configured, setTier2Configured] = useState(false)

  // Queue state
  const [queueStatus, setQueueStatus] = useState<QueueStatus | null>(null)
  const [processingProgress, setProcessingProgress] = useState<{ mediaId: string; stage: string; percent: number } | null>(null)

  // Review state
  const [reviewItems, setReviewItems] = useState<ReviewItem[]>([])
  const [reviewTotal, setReviewTotal] = useState(0)
  const [selectedReviewItem, setSelectedReviewItem] = useState<ReviewItem | null>(null)
  const [selectedTags, setSelectedTags] = useState<Set<number>>(new Set())
  const [newTagInput, setNewTagInput] = useState('')
  const [editedTitle, setEditedTitle] = useState('')

  // Protected tags state
  const [protectedTags, setProtectedTags] = useState<string[]>([])
  const [newProtectedTag, setNewProtectedTag] = useState('')

  // UI state
  const [activeTab, setActiveTab] = useState<'setup' | 'queue' | 'review' | 'tools'>('setup')
  const [tier2Enabled, setTier2Enabled] = useState(false)

  // Load protected tags
  async function loadProtectedTags() {
    try {
      const tags = await window.api.ai.getProtectedTags?.()
      setProtectedTags(tags || [])
    } catch (err) {
      console.error('[AI] Failed to load protected tags:', err)
    }
  }

  // Load initial state
  useEffect(() => {
    checkModels()
    refreshQueueStatus()
    loadReviewItems()
    loadProtectedTags()

    // Load saved Venice API key
    window.api.ai.getTier2Config?.().then((config: { apiKey: string; configured: boolean }) => {
      if (config?.apiKey) {
        setVeniceApiKey(config.apiKey)
        setTier2Configured(config.configured)
        console.log('[AI] Loaded saved Venice API key')
      }
    }).catch((err: any) => console.error('[AI] Failed to load Tier2 config:', err))

    // Subscribe to events
    const unsubStatus = window.api.events.onAiStatus?.((data: { status: string }) => {
      console.log('[AI] Status:', data.status)
      refreshQueueStatus()
    })

    const unsubProgress = window.api.events.onAiProgress?.((data: { mediaId: string; stage: string; percent: number }) => {
      setProcessingProgress(data)
      if (data.stage === 'completed' || data.stage === 'failed') {
        refreshQueueStatus()
        loadReviewItems()
      }
    })

    const unsubDownload = window.api.events.onAiModelDownload?.((data: { model: string; percent: number }) => {
      setDownloadingModel(data.model)
      setDownloadProgress(data.percent)
      if (data.percent >= 100) {
        setTimeout(() => {
          setDownloadingModel(null)
          checkModels()
        }, 500)
      }
    })

    return () => {
      unsubStatus?.()
      unsubProgress?.()
      unsubDownload?.()
    }
  }, [])

  async function checkModels() {
    try {
      const result = await window.api.ai.checkModels() as { all_ready: boolean; models: ModelInfo[] }
      setModels(result.models)
      setModelsReady(result.all_ready)
    } catch (err) {
      console.error('[AI] Failed to check models:', err)
    }
  }

  async function downloadModels() {
    try {
      setDownloadingModel('Starting...')
      await window.api.ai.downloadModels()
      await checkModels()
      showToast('success', 'Models downloaded successfully')
    } catch (err: any) {
      console.error('[AI] Failed to download models:', err)
      showToast('error', err?.message ?? 'Failed to download models')
      setDownloadingModel(null)
    }
  }

  async function configureVenice() {
    if (!veniceApiKey.trim()) return
    try {
      await window.api.ai.configureTier2({ apiKey: veniceApiKey.trim() })
      setTier2Configured(true)
      showToast('success', 'Venice API configured')
    } catch (err: any) {
      console.error('[AI] Failed to configure Venice:', err)
      showToast('error', err?.message ?? 'Failed to configure Venice API')
    }
  }

  async function refreshQueueStatus() {
    try {
      const status = await window.api.ai.getQueueStatus() as QueueStatus
      setQueueStatus(status)
    } catch (err) {
      console.error('[AI] Failed to get queue status:', err)
    }
  }

  async function loadReviewItems() {
    try {
      const result = await window.api.ai.getReviewList({ limit: 50 }) as { items: ReviewItem[]; total: number }
      setReviewItems(result.items)
      setReviewTotal(result.total)
    } catch (err) {
      console.error('[AI] Failed to load review items:', err)
    }
  }

  async function queueUntagged() {
    try {
      const result = await window.api.ai.queueUntagged() as { queued: number }
      showToast('success', `Queued ${result.queued} untagged items`)
      refreshQueueStatus()
    } catch (err: any) {
      console.error('[AI] Failed to queue untagged:', err)
      showToast('error', err?.message ?? 'Failed to queue untagged items')
    }
  }

  async function queueAll() {
    try {
      const result = await window.api.ai.queueAll() as { queued: number }
      showToast('success', `Queued ${result.queued} items for analysis`)
      refreshQueueStatus()
    } catch (err: any) {
      console.error('[AI] Failed to queue all:', err)
      showToast('error', err?.message ?? 'Failed to queue items')
    }
  }

  async function startProcessing() {
    try {
      await window.api.ai.start({ enableTier2: tier2Enabled && tier2Configured })
      showToast('success', 'AI processing started')
      refreshQueueStatus()
    } catch (err: any) {
      console.error('[AI] Failed to start processing:', err)
      showToast('error', err?.message ?? 'Failed to start processing')
    }
  }

  async function pauseProcessing() {
    try {
      await window.api.ai.pause()
      showToast('info', 'Processing paused')
      refreshQueueStatus()
    } catch (err: any) {
      console.error('[AI] Failed to pause:', err)
      showToast('error', err?.message ?? 'Failed to pause processing')
    }
  }

  async function resumeProcessing() {
    try {
      await window.api.ai.resume()
      showToast('info', 'Processing resumed')
      refreshQueueStatus()
    } catch (err: any) {
      console.error('[AI] Failed to resume:', err)
      showToast('error', err?.message ?? 'Failed to resume processing')
    }
  }

  async function stopProcessing() {
    try {
      await window.api.ai.stop()
      showToast('info', 'Processing stopped')
      refreshQueueStatus()
    } catch (err: any) {
      console.error('[AI] Failed to stop:', err)
      showToast('error', err?.message ?? 'Failed to stop processing')
    }
  }

  async function approveItem(mediaId: string) {
    try {
      await window.api.ai.approve(mediaId)
      loadReviewItems()
      if (selectedReviewItem?.mediaId === mediaId) {
        setSelectedReviewItem(null)
      }
    } catch (err: any) {
      console.error('[AI] Failed to approve:', err)
      showToast('error', err?.message ?? 'Failed to approve item')
    }
  }

  async function approveEditedItem() {
    if (!selectedReviewItem) return
    try {
      await window.api.ai.approveEdited(selectedReviewItem.mediaId, {
        selectedTagIds: Array.from(selectedTags),
        editedTitle: editedTitle || undefined,
        newTags: newTagInput ? newTagInput.split(',').map(t => t.trim()).filter(Boolean) : undefined
      })
      showToast('success', 'Item approved with edits')
      loadReviewItems()
      setSelectedReviewItem(null)
      setSelectedTags(new Set())
      setEditedTitle('')
      setNewTagInput('')
    } catch (err: any) {
      console.error('[AI] Failed to approve edited:', err)
      showToast('error', err?.message ?? 'Failed to approve edited item')
    }
  }

  async function rejectItem(mediaId: string) {
    try {
      await window.api.ai.reject(mediaId)
      loadReviewItems()
      if (selectedReviewItem?.mediaId === mediaId) {
        setSelectedReviewItem(null)
      }
    } catch (err: any) {
      console.error('[AI] Failed to reject:', err)
      showToast('error', err?.message ?? 'Failed to reject item')
    }
  }

  async function bulkApproveAll() {
    try {
      const result = await window.api.ai.bulkApprove() as { approved: number }
      showToast('success', `Approved ${result.approved} items`)
      loadReviewItems()
    } catch (err: any) {
      console.error('[AI] Failed to bulk approve:', err)
      showToast('error', err?.message ?? 'Failed to bulk approve')
    }
  }

  async function bulkRejectAll() {
    try {
      const result = await window.api.ai.bulkReject() as { rejected: number }
      showToast('success', `Rejected ${result.rejected} items`)
      loadReviewItems()
      setSelectedReviewItem(null)
    } catch (err: any) {
      console.error('[AI] Failed to bulk reject:', err)
      showToast('error', err?.message ?? 'Failed to bulk reject')
    }
  }

  async function clearAllFailed() {
    try {
      const result = await window.api.ai.clearFailed()
      showToast('success', `Cleared ${result.cleared} failed items`)
      refreshQueueStatus()
      loadReviewItems()
    } catch (err: any) {
      console.error('[AI] Failed to clear failed:', err)
      showToast('error', err?.message ?? 'Failed to clear failed items')
    }
  }

  function selectReviewItem(item: ReviewItem) {
    setSelectedReviewItem(item)
    setSelectedTags(new Set(item.matchedTags.map(t => t.id)))
    setEditedTitle(item.suggestedTitle || '')
    setNewTagInput('')
  }

  // formatBytes is imported from utils/formatters

  return (
    <div className="h-full flex flex-col bg-[var(--bg)]">
      {/* Header */}
      <div className="flex-none px-6 py-4 border-b border-[var(--border)]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Brain size={24} className="text-[var(--primary)]" />
            <div>
              <h1 className="text-xl font-semibold">AI Tools</h1>
              <p className="text-sm text-[var(--muted)]">AI-powered library management</p>
            </div>
          </div>

          {/* Tab navigation */}
          <div className="flex gap-2">
            {(['setup', 'queue', 'review', 'tools'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={cn(
                  'px-4 py-2 rounded-lg text-sm font-medium transition',
                  activeTab === tab
                    ? 'bg-[var(--primary)] text-white'
                    : 'bg-white/5 hover:bg-white/10 text-[var(--text)]'
                )}
              >
                {tab === 'setup' ? 'Setup' : tab === 'queue' ? 'Queue' : tab === 'review' ? 'Review' : 'Utilities'}
                {tab === 'review' && reviewTotal > 0 && (
                  <span className="ml-2 px-1.5 py-0.5 rounded-full bg-white/20 text-xs">{reviewTotal}</span>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {activeTab === 'setup' && (
          <div className="max-w-2xl mx-auto space-y-6">
            {/* Models Section */}
            <div className="bg-[var(--panel)] rounded-xl border border-[var(--border)] p-6">
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <Download size={20} />
                AI Models
              </h2>

              {models.length === 0 ? (
                <p className="text-[var(--muted)]">Loading model status...</p>
              ) : (
                <div className="space-y-3">
                  {models.map(model => (
                    <div key={model.filename} className="flex items-center justify-between p-3 bg-white/5 rounded-lg">
                      <div>
                        <div className="font-medium">{model.name}</div>
                        <div className="text-sm text-[var(--muted)]">{formatBytes(model.size)}</div>
                      </div>
                      {model.downloaded ? (
                        <CheckCircle2 size={20} className="text-green-500" />
                      ) : downloadingModel === model.name ? (
                        <div className="flex items-center gap-2 min-w-[120px]">
                          <div className="flex-1 h-2 bg-black/30 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-gradient-to-r from-[var(--primary)] to-purple-500 transition-all duration-300"
                              style={{ width: `${downloadProgress}%` }}
                            />
                          </div>
                          <span className="text-xs text-[var(--muted)] w-10 text-right">{downloadProgress}%</span>
                        </div>
                      ) : (
                        <XCircle size={20} className="text-red-500/50" />
                      )}
                    </div>
                  ))}

                  {!modelsReady && (
                    <div className="space-y-3">
                      <button
                        onClick={downloadModels}
                        disabled={!!downloadingModel}
                        className={cn(
                          'w-full py-3 rounded-lg font-medium transition',
                          downloadingModel
                            ? 'bg-white/10 text-[var(--muted)] cursor-not-allowed'
                            : 'bg-[var(--primary)] text-white hover:opacity-90'
                        )}
                      >
                        {downloadingModel ? (
                          <span className="flex items-center justify-center gap-2">
                            <Loader2 size={16} className="animate-spin" />
                            Downloading {downloadingModel}...
                          </span>
                        ) : (
                          'Download Missing Models'
                        )}
                      </button>
                      {downloadingModel && (
                        <div className="bg-black/20 rounded-lg p-3">
                          <div className="flex justify-between text-xs text-[var(--muted)] mb-2">
                            <span>Downloading: {downloadingModel}</span>
                            <span>{downloadProgress}%</span>
                          </div>
                          <div className="h-2 bg-black/30 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-gradient-to-r from-[var(--primary)] to-purple-500 transition-all duration-300"
                              style={{ width: `${downloadProgress}%` }}
                            />
                          </div>
                          <p className="text-xs text-[var(--muted)] mt-2 opacity-70">
                            Large models may take several minutes. Please keep this page open.
                          </p>
                        </div>
                      )}
                    </div>
                  )}

                  {modelsReady && (
                    <div className="flex items-center gap-2 text-green-500 text-sm">
                      <CheckCircle2 size={16} />
                      All models ready for Tier 1 analysis
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Venice API Section */}
            <div className="bg-[var(--panel)] rounded-xl border border-[var(--border)] p-6">
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <Sparkles size={20} />
                Venice AI (Tier 2) - Optional
              </h2>
              <p className="text-sm text-[var(--muted)] mb-4">
                Enable deep analysis with Venice AI's vision model for better titles, descriptions, and tags.
                Get an API key at <span className="text-[var(--primary)]">venice.ai</span>
              </p>

              <div className="flex gap-2">
                <input
                  type="password"
                  value={veniceApiKey}
                  onChange={(e) => setVeniceApiKey(e.target.value)}
                  placeholder="Enter Venice API key..."
                  className="flex-1 px-4 py-2 rounded-lg bg-white/5 border border-[var(--border)] focus:border-[var(--primary)] focus:outline-none"
                />
                <button
                  onClick={configureVenice}
                  disabled={!veniceApiKey.trim()}
                  className={cn(
                    'px-4 py-2 rounded-lg font-medium transition',
                    veniceApiKey.trim()
                      ? 'bg-[var(--primary)] text-white hover:opacity-90'
                      : 'bg-white/10 text-[var(--muted)] cursor-not-allowed'
                  )}
                >
                  Configure
                </button>
              </div>

              {tier2Configured && (
                <div className="flex items-center gap-2 text-green-500 text-sm mt-3">
                  <CheckCircle2 size={16} />
                  Venice AI configured
                </div>
              )}
            </div>

            {/* How it works */}
            <div className="bg-[var(--panel)] rounded-xl border border-[var(--border)] p-6">
              <h2 className="text-lg font-semibold mb-4">How It Works</h2>
              <div className="space-y-4 text-sm">
                <div className="flex gap-4">
                  <div className="w-8 h-8 rounded-full bg-[var(--primary)]/20 flex items-center justify-center text-[var(--primary)] font-bold">1</div>
                  <div>
                    <div className="font-medium">Tier 1: Local ONNX Analysis</div>
                    <div className="text-[var(--muted)]">Fast, offline NSFW classification and content tagging using WD Tagger</div>
                  </div>
                </div>
                <div className="flex gap-4">
                  <div className="w-8 h-8 rounded-full bg-[var(--secondary)]/20 flex items-center justify-center text-[var(--secondary)] font-bold">2</div>
                  <div>
                    <div className="font-medium">Tier 2: Venice AI Vision (Optional)</div>
                    <div className="text-[var(--muted)]">Deep analysis for titles, descriptions, and additional tags</div>
                  </div>
                </div>
                <div className="flex gap-4">
                  <div className="w-8 h-8 rounded-full bg-green-500/20 flex items-center justify-center text-green-500 font-bold">3</div>
                  <div>
                    <div className="font-medium">Tier 3: Tag Matching</div>
                    <div className="text-[var(--muted)]">Maps AI labels to your existing tags with synonym matching</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'queue' && (
          <div className="max-w-3xl mx-auto space-y-6">
            {/* Queue Status */}
            <div className="bg-[var(--panel)] rounded-xl border border-[var(--border)] p-6">
              <h2 className="text-lg font-semibold mb-4">Queue Status</h2>

              {queueStatus ? (
                <div className="grid grid-cols-5 gap-4 mb-6">
                  {[
                    { label: 'Total', value: queueStatus.total, color: 'text-[var(--text)]' },
                    { label: 'Pending', value: queueStatus.pending, color: 'text-yellow-500' },
                    { label: 'Processing', value: queueStatus.processing, color: 'text-blue-500' },
                    { label: 'Completed', value: queueStatus.completed, color: 'text-green-500' },
                    { label: 'Failed', value: queueStatus.failed, color: 'text-red-500' },
                  ].map(stat => (
                    <div key={stat.label} className="text-center p-3 bg-white/5 rounded-lg">
                      <div className={cn('text-2xl font-bold', stat.color)}>{stat.value}</div>
                      <div className="text-xs text-[var(--muted)]">{stat.label}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-[var(--muted)]">Loading queue status...</p>
              )}

              {/* Progress indicator */}
              {processingProgress && queueStatus?.isRunning && (
                <div className="mb-6 p-4 bg-white/5 rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium">Processing: {processingProgress.stage}</span>
                    <span className="text-sm text-[var(--muted)]">{processingProgress.percent}%</span>
                  </div>
                  <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-[var(--primary)] to-[var(--secondary)] transition-all duration-300 progress-striped"
                      style={{ width: `${processingProgress.percent}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Queue controls */}
              <div className="flex flex-wrap gap-3">
                <button
                  onClick={queueUntagged}
                  className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/15 transition text-sm"
                >
                  Queue Untagged
                </button>
                <button
                  onClick={queueAll}
                  className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/15 transition text-sm"
                >
                  Queue All
                </button>
                {(queueStatus?.failed ?? 0) > 0 && (
                  <>
                    <button
                      onClick={async () => {
                        const result = await window.api.ai.retryFailed()
                        console.log(`[AI] Retried ${result.retried} failed items`)
                        refreshQueueStatus()
                      }}
                      className="px-4 py-2 rounded-lg bg-yellow-600/20 hover:bg-yellow-600/30 text-yellow-400 transition text-sm"
                    >
                      Retry Failed ({queueStatus?.failed})
                    </button>
                    <button
                      onClick={async () => {
                        const result = await window.api.ai.clearFailed()
                        console.log(`[AI] Cleared ${result.cleared} failed items`)
                        refreshQueueStatus()
                      }}
                      className="px-4 py-2 rounded-lg bg-red-600/20 hover:bg-red-600/30 text-red-400 transition text-sm"
                    >
                      Clear Failed
                    </button>
                  </>
                )}
                <button
                  onClick={refreshQueueStatus}
                  className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/15 transition text-sm"
                >
                  <RefreshCw size={16} />
                </button>
              </div>
            </div>

            {/* Processing Controls */}
            <div className="bg-[var(--panel)] rounded-xl border border-[var(--border)] p-6">
              <h2 className="text-lg font-semibold mb-4">Processing Controls</h2>

              {/* Tier 2 toggle */}
              <div className="flex items-center justify-between mb-6 p-3 bg-white/5 rounded-lg">
                <div>
                  <div className="font-medium">Enable Tier 2 (Venice AI)</div>
                  <div className="text-sm text-[var(--muted)]">
                    {tier2Configured ? 'Uses Venice AI for deep analysis' : 'Configure API key in Setup tab first'}
                  </div>
                </div>
                <button
                  onClick={() => setTier2Enabled(!tier2Enabled)}
                  disabled={!tier2Configured}
                  className={cn(
                    'w-12 h-6 rounded-full transition relative',
                    tier2Enabled && tier2Configured ? 'bg-[var(--primary)]' : 'bg-white/20',
                    !tier2Configured && 'opacity-50 cursor-not-allowed'
                  )}
                >
                  <div className={cn(
                    'absolute top-1 w-4 h-4 rounded-full bg-white transition-all',
                    tier2Enabled && tier2Configured ? 'left-7' : 'left-1'
                  )} />
                </button>
              </div>

              <div className="flex gap-3">
                {!queueStatus?.isRunning ? (
                  <button
                    onClick={startProcessing}
                    disabled={!modelsReady || (queueStatus?.pending ?? 0) === 0}
                    className={cn(
                      'flex-1 py-3 rounded-lg font-medium transition flex items-center justify-center gap-2',
                      modelsReady && (queueStatus?.pending ?? 0) > 0
                        ? 'bg-green-600 text-white hover:bg-green-700'
                        : 'bg-white/10 text-[var(--muted)] cursor-not-allowed'
                    )}
                  >
                    <Play size={18} />
                    Start Processing
                  </button>
                ) : queueStatus?.isPaused ? (
                  <button
                    onClick={resumeProcessing}
                    className="flex-1 py-3 rounded-lg font-medium bg-green-600 text-white hover:bg-green-700 transition flex items-center justify-center gap-2"
                  >
                    <Play size={18} />
                    Resume
                  </button>
                ) : (
                  <button
                    onClick={pauseProcessing}
                    className="flex-1 py-3 rounded-lg font-medium bg-yellow-600 text-white hover:bg-yellow-700 transition flex items-center justify-center gap-2"
                  >
                    <Pause size={18} />
                    Pause
                  </button>
                )}

                {queueStatus?.isRunning && (
                  <button
                    onClick={stopProcessing}
                    className="px-6 py-3 rounded-lg font-medium bg-red-600 text-white hover:bg-red-700 transition flex items-center justify-center gap-2"
                  >
                    <X size={18} />
                    Stop
                  </button>
                )}
              </div>

              {!modelsReady && (
                <p className="mt-4 text-sm text-yellow-500 flex items-center gap-2">
                  <AlertCircle size={16} />
                  Download AI models in the Setup tab first
                </p>
              )}
            </div>
          </div>
        )}

        {activeTab === 'review' && (
          <div className="flex gap-6 h-full">
            {/* Review list */}
            <div className="w-80 flex-none space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">Pending Review ({reviewTotal})</h2>
                {reviewTotal > 0 && (
                  <div className="flex items-center gap-3">
                    <button
                      onClick={bulkApproveAll}
                      className="text-sm text-[var(--primary)] hover:underline"
                    >
                      Approve All
                    </button>
                    <button
                      onClick={bulkRejectAll}
                      className="text-sm text-red-400 hover:underline"
                    >
                      Clear All
                    </button>
                  </div>
                )}
              </div>
              {(queueStatus?.failed ?? 0) > 0 && (
                <button
                  onClick={clearAllFailed}
                  className="w-full text-sm text-orange-400 hover:underline py-1"
                >
                  Clear All Failed ({queueStatus?.failed})
                </button>
              )}

              {reviewItems.length === 0 ? (
                <div className="text-center py-12 text-[var(--muted)]">
                  <Brain size={48} className="mx-auto mb-4 opacity-50" />
                  <p>No items pending review</p>
                  <p className="text-sm mt-2">Process some media in the Queue tab</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-[calc(100vh-280px)] overflow-y-auto">
                  {reviewItems.map(item => (
                    <button
                      key={item.mediaId}
                      onClick={() => selectReviewItem(item)}
                      className={cn(
                        'w-full text-left p-3 rounded-lg transition border',
                        selectedReviewItem?.mediaId === item.mediaId
                          ? 'bg-[var(--primary)]/20 border-[var(--primary)]'
                          : 'bg-white/5 border-transparent hover:bg-white/10'
                      )}
                    >
                      <div className="font-medium truncate">{item.filename}</div>
                      <div className="text-sm text-[var(--muted)] truncate">
                        {item.matchedTags.length} tags matched
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Review detail */}
            <div className="flex-1 min-w-0">
              {selectedReviewItem ? (
                <div className="bg-[var(--panel)] rounded-xl border border-[var(--border)] p-6 space-y-6">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="text-lg font-semibold">{selectedReviewItem.filename}</h3>
                      {selectedReviewItem.nsfwCategory && (
                        <span className={cn(
                          'inline-block mt-1 px-2 py-0.5 rounded text-xs font-medium',
                          selectedReviewItem.nsfwCategory === 'porn' ? 'bg-red-500/20 text-red-400' :
                          selectedReviewItem.nsfwCategory === 'sexy' ? 'bg-orange-500/20 text-orange-400' :
                          selectedReviewItem.nsfwCategory === 'hentai' ? 'bg-purple-500/20 text-purple-400' :
                          'bg-white/10 text-[var(--muted)]'
                        )}>
                          {selectedReviewItem.nsfwCategory} ({Math.round((selectedReviewItem.nsfwConfidence || 0) * 100)}%)
                        </span>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => rejectItem(selectedReviewItem.mediaId)}
                        className="p-2 rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30 transition"
                      >
                        <XCircle size={20} />
                      </button>
                      <button
                        onClick={() => approveItem(selectedReviewItem.mediaId)}
                        className="p-2 rounded-lg bg-green-500/20 text-green-400 hover:bg-green-500/30 transition"
                      >
                        <CheckCircle2 size={20} />
                      </button>
                    </div>
                  </div>

                  {/* Suggested title */}
                  {selectedReviewItem.suggestedTitle && (
                    <div>
                      <label className="block text-sm font-medium mb-2">Suggested Title</label>
                      <input
                        type="text"
                        value={editedTitle}
                        onChange={(e) => setEditedTitle(e.target.value)}
                        className="w-full px-4 py-2 rounded-lg bg-white/5 border border-[var(--border)] focus:border-[var(--primary)] focus:outline-none"
                      />
                    </div>
                  )}

                  {/* Description */}
                  {selectedReviewItem.description && (
                    <div>
                      <label className="block text-sm font-medium mb-2">Description</label>
                      <p className="text-sm text-[var(--muted)] bg-white/5 p-3 rounded-lg">
                        {selectedReviewItem.description}
                      </p>
                    </div>
                  )}

                  {/* Matched tags */}
                  <div>
                    <label className="block text-sm font-medium mb-2">
                      Matched Tags ({selectedTags.size} selected)
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {selectedReviewItem.matchedTags.map(tag => (
                        <button
                          key={tag.id}
                          onClick={() => {
                            const next = new Set(selectedTags)
                            if (next.has(tag.id)) next.delete(tag.id)
                            else next.add(tag.id)
                            setSelectedTags(next)
                          }}
                          className={cn(
                            'px-3 py-1 rounded-full text-sm transition border',
                            selectedTags.has(tag.id)
                              ? 'bg-[var(--primary)] border-[var(--primary)] text-white'
                              : 'bg-white/5 border-white/10 hover:border-white/20'
                          )}
                        >
                          {tag.name}
                          <span className="ml-1 opacity-50">
                            {Math.round(tag.confidence * 100)}%
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* New tag suggestions */}
                  {selectedReviewItem.newTagSuggestions.length > 0 && (
                    <div>
                      <label className="block text-sm font-medium mb-2">New Tag Suggestions</label>
                      <div className="flex flex-wrap gap-2">
                        {selectedReviewItem.newTagSuggestions.map((tag, i) => (
                          <span
                            key={i}
                            className="px-3 py-1 rounded-full text-sm bg-[var(--secondary)]/20 border border-[var(--secondary)]/30"
                          >
                            {tag.name}
                            <span className="ml-1 opacity-50">
                              {Math.round(tag.confidence * 100)}%
                            </span>
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Add new tags */}
                  <div>
                    <label className="block text-sm font-medium mb-2">Add Custom Tags</label>
                    <input
                      type="text"
                      value={newTagInput}
                      onChange={(e) => setNewTagInput(e.target.value)}
                      placeholder="tag1, tag2, tag3..."
                      className="w-full px-4 py-2 rounded-lg bg-white/5 border border-[var(--border)] focus:border-[var(--primary)] focus:outline-none"
                    />
                  </div>

                  {/* Apply with edits button */}
                  <button
                    onClick={approveEditedItem}
                    className="w-full py-3 rounded-lg font-medium bg-[var(--primary)] text-white hover:opacity-90 transition"
                  >
                    Apply with Edits
                  </button>
                </div>
              ) : (
                <div className="h-full flex items-center justify-center text-[var(--muted)]">
                  <div className="text-center">
                    <Eye size={48} className="mx-auto mb-4 opacity-50" />
                    <p>Select an item to review</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'tools' && (
          <div className="max-w-2xl mx-auto space-y-6">
            {/* Tag Cleanup */}
            <div className="bg-[var(--panel)] rounded-xl border border-[var(--border)] p-6">
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <Sparkles size={20} />
                Tag Cleanup
              </h2>
              <p className="text-sm text-[var(--muted)] mb-4">
                Remove invalid, nonsensical, or AI-generated artifact tags from your library.
                This cleans up single letters, numbers, and common AI tagging errors.
                Tags are permanently deleted from your database.
              </p>
              <button
                onClick={async () => {
                  try {
                    const result = await window.api.ai?.cleanupTags?.()
                    if (result?.removed > 0) {
                      alert(`Cleaned up ${result.removed} invalid tags`)
                    } else {
                      alert('No invalid tags found')
                    }
                  } catch (err) {
                    console.error('Tag cleanup failed:', err)
                    alert('Tag cleanup failed - see console for details')
                  }
                }}
                className="px-6 py-3 rounded-xl bg-[var(--primary)] text-white font-medium hover:opacity-90 transition"
              >
                Clean Up Tags
              </button>
            </div>

            {/* Protected Tags */}
            <div className="bg-[var(--panel)] rounded-xl border border-[var(--border)] p-6">
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <Shield size={20} />
                Protected Tags
              </h2>
              <p className="text-sm text-[var(--muted)] mb-4">
                Tags added here will never be deleted during cleanup, even if they match
                patterns that would normally be removed.
              </p>

              {/* Current protected tags */}
              {protectedTags.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-4">
                  {protectedTags.map((tag) => (
                    <button
                      key={tag}
                      onClick={async () => {
                        try {
                          await window.api.ai.removeProtectedTag?.(tag)
                          loadProtectedTags()
                        } catch (err) {
                          console.error('[Settings] Failed to remove protected tag:', err)
                        }
                      }}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-green-500/20 border border-green-500/30 text-green-400 text-sm hover:bg-green-500/30 transition"
                    >
                      <span>{tag}</span>
                      <X size={12} />
                    </button>
                  ))}
                </div>
              )}

              {/* Add new protected tag */}
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newProtectedTag}
                  onChange={(e) => setNewProtectedTag(e.target.value)}
                  onKeyDown={async (e) => {
                    if (e.key === 'Enter' && newProtectedTag.trim()) {
                      try {
                        await window.api.ai.addProtectedTag?.(newProtectedTag.trim())
                        setNewProtectedTag('')
                        loadProtectedTags()
                      } catch (err) {
                        console.error('[Settings] Failed to add protected tag:', err)
                      }
                    }
                  }}
                  placeholder="Enter tag to protect..."
                  className="flex-1 px-4 py-2 rounded-xl bg-black/30 border border-[var(--border)] text-sm focus:outline-none focus:border-[var(--primary)]"
                />
                <button
                  onClick={async () => {
                    if (newProtectedTag.trim()) {
                      try {
                        await window.api.ai.addProtectedTag?.(newProtectedTag.trim())
                        setNewProtectedTag('')
                        loadProtectedTags()
                      } catch (err) {
                        console.error('[Settings] Failed to add protected tag:', err)
                      }
                    }
                  }}
                  className="px-4 py-2 rounded-xl bg-green-500/20 border border-green-500/30 text-green-400 text-sm hover:bg-green-500/30 transition"
                >
                  Add
                </button>
              </div>
            </div>

            {/* Bulk File Rename */}
            <div className="bg-[var(--panel)] rounded-xl border border-[var(--border)] p-6">
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <FileText size={20} />
                Bulk File Rename
              </h2>
              <p className="text-sm text-[var(--muted)] mb-4">
                Smart file renaming that cleans up messy filenames by removing random codes,
                underscores, and gibberish while preserving meaningful parts.
              </p>
              <button
                onClick={async () => {
                  if (!confirm('This will rename files with messy names to cleaner versions. Proceed?')) return
                  try {
                    const result = await window.api.media?.optimizeAllNames?.()
                    if (result?.optimized > 0) {
                      alert(`Renamed ${result.optimized} files. (${result.skipped} skipped, ${result.failed} failed)`)
                    } else {
                      alert('No files needed renaming')
                    }
                  } catch (err) {
                    console.error('Bulk rename failed:', err)
                    alert('Rename failed: ' + (err as Error).message)
                  }
                }}
                className="px-6 py-3 rounded-xl bg-[var(--primary)] text-white font-medium hover:opacity-90 transition"
              >
                Start Bulk Rename
              </button>
            </div>

            {/* Auto Tag with AI */}
            <div className="bg-[var(--panel)] rounded-xl border border-[var(--border)] p-6">
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <Tag size={20} />
                Queue All for AI Tagging
              </h2>
              <p className="text-sm text-[var(--muted)] mb-4">
                Add all untagged media to the AI processing queue. Items will be analyzed
                and tagged automatically using the Tier 1 AI models.
              </p>
              <button
                onClick={async () => {
                  try {
                    const result = await window.api.ai?.queueUntagged?.()
                    if (result?.queued > 0) {
                      alert(`Queued ${result.queued} items for AI analysis. Go to Queue tab to start processing.`)
                    } else {
                      alert('No untagged items found to queue')
                    }
                  } catch (err) {
                    console.error('Queue failed:', err)
                    alert('Queue failed: ' + (err as Error).message)
                  }
                }}
                disabled={!modelsReady}
                className={cn(
                  "px-6 py-3 rounded-xl font-medium transition",
                  modelsReady
                    ? "bg-[var(--primary)] text-white hover:opacity-90"
                    : "bg-white/10 text-[var(--muted)] cursor-not-allowed"
                )}
              >
                {modelsReady ? 'Queue Untagged Media' : 'Download Models First'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// Thumbnail component with on-demand generation for captioned media
// Uses IntersectionObserver for lazy loading to improve performance
// Memoized to prevent re-renders when parent state changes
const CaptionedThumb = React.memo(function CaptionedThumb({ mediaId, thumbPath, filename, filePath, className, style }: { mediaId: string; thumbPath: string | null; filename: string; filePath?: string | null; className?: string; style?: React.CSSProperties }) {
  const [thumbUrl, setThumbUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [isVisible, setIsVisible] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  // Lazy loading with IntersectionObserver
  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true)
          observer.disconnect()
        }
      },
      { rootMargin: '100px' } // Start loading 100px before visible
    )

    if (containerRef.current) {
      observer.observe(containerRef.current)
    }

    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!isVisible) return // Don't load until visible

    let cancelled = false
    async function loadThumb() {
      setLoading(true)
      try {
        // Always use thumbnail path first for performance
        if (thumbPath) {
          const url = await toFileUrlCached(thumbPath)
          if (!cancelled && url) {
            setThumbUrl(url)
            setLoading(false)
            return
          }
        }

        // Fall back to file path for images (only if no thumbnail)
        const ext = (filename || '').toLowerCase()
        const isImage = ext.endsWith('.png') || ext.endsWith('.jpg') || ext.endsWith('.jpeg') ||
                        ext.endsWith('.webp') || ext.endsWith('.bmp') || ext.endsWith('.gif')

        if (isImage && filePath) {
          const url = await toFileUrlCached(filePath)
          if (!cancelled && url) {
            setThumbUrl(url)
            setLoading(false)
            return
          }
        }

        // Last resort - request on-demand generation
        const generatedUrl = await window.api.media.generateThumb(mediaId)
        if (!cancelled && generatedUrl) {
          setThumbUrl(generatedUrl)
        }
      } catch (err) {
        console.error('[CaptionedThumb] Error loading thumbnail:', err)
      }
      if (!cancelled) setLoading(false)
    }
    loadThumb()
    return () => { cancelled = true }
  }, [mediaId, thumbPath, filePath, filename, isVisible])

  return (
    <div ref={containerRef} className={cn("w-full h-full relative", className)} style={style}>
      {!isVisible || (loading && !thumbUrl) ? (
        <div className="w-full h-full flex items-center justify-center bg-black/50">
          <img
            src={thumbnailLoadingGif}
            alt="Loading..."
            className="w-12 h-12 opacity-60"
          />
        </div>
      ) : !thumbUrl ? (
        <div className="w-full h-full flex items-center justify-center bg-black/30">
          <ImageIcon size={24} className="text-[var(--muted)]" />
        </div>
      ) : (
        <img
          src={thumbUrl}
          alt={filename}
          className="w-full h-full object-cover"
          loading="lazy"
          onError={(e) => {
            // If thumbnail fails to load, show placeholder
            e.currentTarget.style.display = 'none'
          }}
        />
      )}
    </div>
  )
})

// Image filter types for stacking
type ImageFilter = 'invert' | 'grayscale' | 'sepia' | 'saturate' | 'contrast' | 'brightness' | 'blur' | 'hueRotate' | 'pixelate' | 'lowQuality' | 'vignette'

const FILTER_PRESETS: { id: string; name: string; filters: ImageFilter[]; values?: Partial<Record<ImageFilter, number>> }[] = [
  { id: 'none', name: 'None', filters: [] },
  { id: 'retro', name: 'Retro VHS', filters: ['sepia', 'contrast', 'saturate'], values: { sepia: 0.3, contrast: 1.2, saturate: 1.3 } },
  { id: 'thermal', name: 'Thermal', filters: ['hueRotate', 'saturate', 'contrast'], values: { hueRotate: 180, saturate: 2, contrast: 1.3 } },
  { id: 'noir', name: 'Noir', filters: ['grayscale', 'contrast'], values: { grayscale: 1, contrast: 1.4 } },
  { id: 'dreamy', name: 'Dreamy', filters: ['blur', 'saturate', 'brightness'], values: { blur: 1, saturate: 1.5, brightness: 1.1 } },
  { id: 'negative', name: 'Negative', filters: ['invert'], values: { invert: 1 } },
  { id: 'intense', name: 'Intense', filters: ['saturate', 'contrast'], values: { saturate: 2, contrast: 1.5 } },
  { id: 'faded', name: 'Faded', filters: ['grayscale', 'brightness'], values: { grayscale: 0.5, brightness: 1.2 } },
  { id: 'psychedelic', name: 'Psychedelic', filters: ['hueRotate', 'saturate', 'invert'], values: { hueRotate: 90, saturate: 3, invert: 0.2 } },
  { id: 'pixelated', name: 'Pixelated', filters: ['pixelate'], values: { pixelate: 8 } },
  { id: 'lowquality', name: 'Low Quality', filters: ['lowQuality', 'contrast', 'blur'], values: { lowQuality: 5, contrast: 1.1, blur: 0.5 } },
  { id: 'corrupted', name: 'Corrupted', filters: ['pixelate', 'hueRotate', 'contrast'], values: { pixelate: 4, hueRotate: 30, contrast: 1.3 } },
  { id: 'vaporwave', name: 'Vaporwave', filters: ['saturate', 'hueRotate', 'contrast'], values: { saturate: 1.8, hueRotate: 280, contrast: 1.2 } },
  { id: 'cinematic', name: 'Cinematic', filters: ['vignette', 'contrast', 'saturate'], values: { vignette: 0.6, contrast: 1.2, saturate: 0.9 } },
  { id: 'dramatic', name: 'Dramatic', filters: ['vignette', 'contrast', 'brightness'], values: { vignette: 0.8, contrast: 1.4, brightness: 0.9 } },
  { id: 'moody', name: 'Moody', filters: ['vignette', 'grayscale', 'contrast'], values: { vignette: 0.7, grayscale: 0.3, contrast: 1.3 } },
]

function CaptionsPage({ settings }: { settings: VaultSettings | null }) {
  const { showToast } = useToast()
  const [captionedMedia, setCaptionedMedia] = useState<CaptionedMedia[]>([])
  const [templates, setTemplates] = useState<CaptionTemplate[]>([])
  const [allMedia, setAllMedia] = useState<MediaRow[]>([])
  const [selectedMedia, setSelectedMedia] = useState<MediaRow | null>(null)
  const [topText, setTopText] = useState('')
  const [bottomText, setBottomText] = useState('')
  const [selectedPreset, setSelectedPreset] = useState('default')
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [activeTab, setActiveTab] = useState<'editor' | 'captioned' | 'templates' | 'gifmaker'>('editor')
  const [captionModeEnabled, setCaptionModeEnabled] = useState(settings?.captions?.enabled ?? false)

  // New filter states
  const [activeFilters, setActiveFilters] = useState<ImageFilter[]>([])
  const [filterValues, setFilterValues] = useState<Record<ImageFilter, number>>({
    invert: 0, grayscale: 0, sepia: 0, saturate: 1, contrast: 1,
    brightness: 1, blur: 0, hueRotate: 0, pixelate: 0, lowQuality: 0, vignette: 0
  })

  // Caption bar settings
  const [showCaptionBar, setShowCaptionBar] = useState(false)
  const [captionBarColor, setCaptionBarColor] = useState<'black' | 'white'>('black')
  const [captionBarSize, setCaptionBarSize] = useState(60) // pixels
  const [captionBarPosition, setCaptionBarPosition] = useState<'top' | 'bottom' | 'both'>('both')

  // Text position (for draggable text)
  const [topTextY, setTopTextY] = useState(10) // percent from top
  const [bottomTextY, setBottomTextY] = useState(90) // percent from top
  const [isDraggingText, setIsDraggingText] = useState<'top' | 'bottom' | null>(null)
  const imageContainerRef = useRef<HTMLDivElement>(null)

  // Floating text labels
  type FloatingLabel = {
    id: string
    text: string
    x: number // percent
    y: number // percent
    fontSize: number
    color: string
    fontFamily: string
    shadow: boolean
    rotation: number
  }
  const [floatingLabels, setFloatingLabels] = useState<FloatingLabel[]>([])
  const [draggingLabelId, setDraggingLabelId] = useState<string | null>(null)
  const [editingLabelId, setEditingLabelId] = useState<string | null>(null)
  const labelDragOffset = useRef<{ x: number; y: number }>({ x: 0, y: 0 })

  // Crop functionality
  const [cropMode, setCropMode] = useState(false)
  const [cropSelection, setCropSelection] = useState<{ startX: number; startY: number; endX: number; endY: number } | null>(null)
  const [isCropping, setIsCropping] = useState(false)
  const [croppedImageUrl, setCroppedImageUrl] = useState<string | null>(null)
  const cropStartRef = useRef<{ x: number; y: number } | null>(null)

  // Preview URL - must be declared before crop handlers that use it
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)

  // Video frame capture state
  const [capturedFrameUrl, setCapturedFrameUrl] = useState<string | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const [videoUrl, setVideoUrl] = useState<string | null>(null)

  // Image loading error state for GIFs and images
  const [imageLoadError, setImageLoadError] = useState(false)
  const [imageRetryCount, setImageRetryCount] = useState(0)

  // GIF Maker state
  const [gifStartTime, setGifStartTime] = useState(0)
  const [gifEndTime, setGifEndTime] = useState(3)
  const [gifFps, setGifFps] = useState(15)
  const [gifQuality, setGifQuality] = useState<'low' | 'medium' | 'high'>('medium')
  const [gifGenerating, setGifGenerating] = useState(false)
  const [gifPreviewUrl, setGifPreviewUrl] = useState<string | null>(null)
  const [gifOutputPath, setGifOutputPath] = useState<string | null>(null)
  const [gifVideoUrl, setGifVideoUrl] = useState<string | null>(null)
  const [gifSelectedVideo, setGifSelectedVideo] = useState<MediaRow | null>(null)
  const gifVideoRef = useRef<HTMLVideoElement>(null)
  const [gifShuffledVideos, setGifShuffledVideos] = useState<MediaRow[]>([])
  const [gifSearchQuery, setGifSearchQuery] = useState('')
  const [gifRenameValue, setGifRenameValue] = useState('')

  // Edit captioned media
  const [editingCaption, setEditingCaption] = useState<CaptionedMedia | null>(null)
  const [editCaptionTop, setEditCaptionTop] = useState('')
  const [editCaptionBottom, setEditCaptionBottom] = useState('')

  // Handle text drag
  const handleTextDragStart = useCallback((which: 'top' | 'bottom') => (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDraggingText(which)
  }, [])

  const handleTextDrag = useCallback((e: MouseEvent) => {
    if (!isDraggingText || !imageContainerRef.current) return

    const rect = imageContainerRef.current.getBoundingClientRect()
    const relativeY = e.clientY - rect.top
    const percentY = Math.max(5, Math.min(95, (relativeY / rect.height) * 100))

    if (isDraggingText === 'top') {
      setTopTextY(Math.round(percentY))
    } else {
      setBottomTextY(Math.round(percentY))
    }
  }, [isDraggingText])

  const handleTextDragEnd = useCallback(() => {
    setIsDraggingText(null)
  }, [])

  // Global mouse handlers for drag
  useEffect(() => {
    if (isDraggingText) {
      document.addEventListener('mousemove', handleTextDrag)
      document.addEventListener('mouseup', handleTextDragEnd)
      return () => {
        document.removeEventListener('mousemove', handleTextDrag)
        document.removeEventListener('mouseup', handleTextDragEnd)
      }
    }
  }, [isDraggingText, handleTextDrag, handleTextDragEnd])

  // Floating label handlers
  const addFloatingLabel = useCallback(() => {
    const newLabel: FloatingLabel = {
      id: `label-${Date.now()}`,
      text: 'New Label',
      x: 50,
      y: 50,
      fontSize: 24,
      color: '#ffffff',
      fontFamily: 'Impact',
      shadow: true,
      rotation: 0
    }
    setFloatingLabels(prev => [...prev, newLabel])
    setEditingLabelId(newLabel.id)
  }, [])

  const updateFloatingLabel = useCallback((id: string, updates: Partial<FloatingLabel>) => {
    setFloatingLabels(prev => prev.map(label =>
      label.id === id ? { ...label, ...updates } : label
    ))
  }, [])

  const deleteFloatingLabel = useCallback((id: string) => {
    setFloatingLabels(prev => prev.filter(label => label.id !== id))
    if (editingLabelId === id) setEditingLabelId(null)
  }, [editingLabelId])

  const handleLabelDragStart = useCallback((id: string, e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (!imageContainerRef.current) return
    const rect = imageContainerRef.current.getBoundingClientRect()
    const label = floatingLabels.find(l => l.id === id)
    if (!label) return
    const labelX = (label.x / 100) * rect.width
    const labelY = (label.y / 100) * rect.height
    labelDragOffset.current = {
      x: e.clientX - rect.left - labelX,
      y: e.clientY - rect.top - labelY
    }
    setDraggingLabelId(id)
  }, [floatingLabels])

  const handleLabelDrag = useCallback((e: MouseEvent) => {
    if (!draggingLabelId || !imageContainerRef.current) return
    const rect = imageContainerRef.current.getBoundingClientRect()
    const x = Math.max(0, Math.min(100, ((e.clientX - rect.left - labelDragOffset.current.x) / rect.width) * 100))
    const y = Math.max(0, Math.min(100, ((e.clientY - rect.top - labelDragOffset.current.y) / rect.height) * 100))
    updateFloatingLabel(draggingLabelId, { x, y })
  }, [draggingLabelId, updateFloatingLabel])

  const handleLabelDragEnd = useCallback(() => {
    setDraggingLabelId(null)
  }, [])

  useEffect(() => {
    if (draggingLabelId) {
      document.addEventListener('mousemove', handleLabelDrag)
      document.addEventListener('mouseup', handleLabelDragEnd)
      return () => {
        document.removeEventListener('mousemove', handleLabelDrag)
        document.removeEventListener('mouseup', handleLabelDragEnd)
      }
    }
  }, [draggingLabelId, handleLabelDrag, handleLabelDragEnd])

  // Crop handlers
  const handleCropStart = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!cropMode || !imageContainerRef.current) return
    e.preventDefault()
    const rect = imageContainerRef.current.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / rect.width) * 100
    const y = ((e.clientY - rect.top) / rect.height) * 100
    cropStartRef.current = { x, y }
    setCropSelection({ startX: x, startY: y, endX: x, endY: y })
    setIsCropping(true)
  }, [cropMode])

  const handleCropMove = useCallback((e: MouseEvent) => {
    if (!isCropping || !cropStartRef.current || !imageContainerRef.current) return
    const rect = imageContainerRef.current.getBoundingClientRect()
    const x = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100))
    const y = Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100))
    setCropSelection({
      startX: cropStartRef.current.x,
      startY: cropStartRef.current.y,
      endX: x,
      endY: y
    })
  }, [isCropping])

  const handleCropEnd = useCallback(() => {
    setIsCropping(false)
    cropStartRef.current = null
  }, [])

  // Global handlers for crop dragging
  useEffect(() => {
    if (isCropping) {
      document.addEventListener('mousemove', handleCropMove)
      document.addEventListener('mouseup', handleCropEnd)
      return () => {
        document.removeEventListener('mousemove', handleCropMove)
        document.removeEventListener('mouseup', handleCropEnd)
      }
    }
  }, [isCropping, handleCropMove, handleCropEnd])

  // Check if selected media is a GIF
  const isSelectedGif = useMemo(() => {
    if (!selectedMedia) return false
    const filename = (selectedMedia.filename || selectedMedia.path || '').toLowerCase()
    return filename.endsWith('.gif') || selectedMedia.type === 'gif'
  }, [selectedMedia])

  // Apply crop to create a new cropped image
  const applyCrop = useCallback(async () => {
    if (!cropSelection || !previewUrl) return

    // Normalize coordinates (handle negative selections)
    const x1 = Math.min(cropSelection.startX, cropSelection.endX)
    const y1 = Math.min(cropSelection.startY, cropSelection.endY)
    const x2 = Math.max(cropSelection.startX, cropSelection.endX)
    const y2 = Math.max(cropSelection.startY, cropSelection.endY)

    // Skip if selection is too small
    if (x2 - x1 < 5 || y2 - y1 < 5) {
      showToast('warning', 'Selection too small. Draw a larger crop area.')
      return
    }

    try {
      // Load the image
      const img = new Image()
      img.crossOrigin = 'anonymous'
      await new Promise((resolve, reject) => {
        img.onload = resolve
        img.onerror = reject
        img.src = previewUrl
      })

      // Calculate actual pixel coordinates
      const cropX = Math.round((x1 / 100) * img.naturalWidth)
      const cropY = Math.round((y1 / 100) * img.naturalHeight)
      const cropW = Math.round(((x2 - x1) / 100) * img.naturalWidth)
      const cropH = Math.round(((y2 - y1) / 100) * img.naturalHeight)

      // Create canvas and crop
      const canvas = document.createElement('canvas')
      canvas.width = cropW
      canvas.height = cropH
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('Could not get canvas context')

      ctx.drawImage(img, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH)

      // Get data URL
      const dataUrl = canvas.toDataURL('image/png')
      setCroppedImageUrl(dataUrl)
      setCropSelection(null)
      setCropMode(false)

      // Show appropriate message
      if (isSelectedGif) {
        showToast('warning', 'GIF cropped as static image (animation not preserved)')
      } else {
        showToast('success', 'Image cropped successfully!')
      }
    } catch (err) {
      console.error('[Brainwash] Crop failed:', err)
      showToast('error', 'Failed to crop image')
    }
  }, [cropSelection, previewUrl, showToast, isSelectedGif])

  // Reset crop
  const resetCrop = useCallback(() => {
    setCroppedImageUrl(null)
    setCropSelection(null)
    setCropMode(false)
  }, [])

  // Capture current video frame
  const captureVideoFrame = useCallback(() => {
    if (!videoRef.current) {
      showToast('error', 'No video loaded')
      return
    }

    const video = videoRef.current
    if (video.readyState < 2) {
      showToast('warning', 'Video not ready yet. Please wait.')
      return
    }

    try {
      // Create canvas to capture frame
      const canvas = document.createElement('canvas')
      canvas.width = video.videoWidth
      canvas.height = video.videoHeight
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('Could not get canvas context')

      // Draw current video frame
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height)

      // Convert to data URL
      const dataUrl = canvas.toDataURL('image/png')
      setCapturedFrameUrl(dataUrl)
      setPreviewUrl(dataUrl) // Use captured frame as preview for captioning
      showToast('success', 'Frame captured! You can now add captions.')
    } catch (err) {
      console.error('[Brainwash] Frame capture failed:', err)
      showToast('error', 'Failed to capture frame')
    }
  }, [showToast])

  // Reset captured frame
  const resetCapturedFrame = useCallback(() => {
    setCapturedFrameUrl(null)
    setPreviewUrl(null)
  }, [])

  // Check if current media is a video
  const isSelectedVideo = useMemo(() => {
    if (!selectedMedia) return false
    return selectedMedia.type === 'video'
  }, [selectedMedia])

  // AI caption generation state
  const [generatingCaption, setGeneratingCaption] = useState(false)
  const [veniceConfigured, setVeniceConfigured] = useState(false)
  const [selectedFilterPreset, setSelectedFilterPreset] = useState('none')

  // Check Venice AI status on mount
  useEffect(() => {
    window.api.ai.veniceStatus?.().then((status: { configured: boolean } | null) => {
      setVeniceConfigured(status?.configured ?? false)
    }).catch(() => setVeniceConfigured(false))
  }, [])
  const [mediaTypeFilter, setMediaTypeFilter] = useState<'all' | 'image' | 'gif' | 'video'>('all')

  // Default caption presets (fallback if settings don't have them)
  const DEFAULT_PRESETS = [
    { id: 'default', name: 'Classic Meme', fontFamily: 'Impact', fontSize: 48, fontColor: '#ffffff', fontWeight: 'bold' as const, textShadow: false, shadowColor: '#000000', strokeEnabled: true, strokeColor: '#000000', strokeWidth: 2, backgroundColor: 'transparent', backgroundOpacity: 0, textTransform: 'uppercase' as const, position: 'both' as const },
    { id: 'sissy', name: 'Sissy Pink', fontFamily: 'Arial', fontSize: 36, fontColor: '#ff69b4', fontWeight: 'bold' as const, textShadow: true, shadowColor: '#000000', strokeEnabled: true, strokeColor: '#ffffff', strokeWidth: 1, backgroundColor: 'transparent', backgroundOpacity: 0, textTransform: 'none' as const, position: 'both' as const },
    { id: 'degrading', name: 'Degrading', fontFamily: 'Arial Black', fontSize: 42, fontColor: '#ff0000', fontWeight: 'bolder' as const, textShadow: true, shadowColor: '#000000', strokeEnabled: true, strokeColor: '#000000', strokeWidth: 2, backgroundColor: 'transparent', backgroundOpacity: 0, textTransform: 'uppercase' as const, position: 'both' as const },
    { id: 'neon', name: 'Neon Glow', fontFamily: 'Arial', fontSize: 40, fontColor: '#00ffff', fontWeight: 'bold' as const, textShadow: true, shadowColor: '#00ffff', strokeEnabled: true, strokeColor: '#ff00ff', strokeWidth: 2, backgroundColor: 'transparent', backgroundOpacity: 0, textTransform: 'uppercase' as const, position: 'both' as const },
    { id: 'hypno', name: 'Hypno', fontFamily: 'Times New Roman', fontSize: 44, fontColor: '#9400d3', fontWeight: 'bold' as const, textShadow: true, shadowColor: '#ff00ff', strokeEnabled: true, strokeColor: '#ffffff', strokeWidth: 1, backgroundColor: 'transparent', backgroundOpacity: 0, textTransform: 'lowercase' as const, position: 'both' as const },
    { id: 'bimbo', name: 'Bimbo', fontFamily: 'Comic Sans MS', fontSize: 38, fontColor: '#ff1493', fontWeight: 'bold' as const, textShadow: true, shadowColor: '#ffb6c1', strokeEnabled: true, strokeColor: '#ffffff', strokeWidth: 2, backgroundColor: 'transparent', backgroundOpacity: 0, textTransform: 'none' as const, position: 'both' as const },
    { id: 'domme', name: 'Domme', fontFamily: 'Georgia', fontSize: 36, fontColor: '#8b0000', fontWeight: 'bold' as const, textShadow: true, shadowColor: '#000000', strokeEnabled: true, strokeColor: '#ffd700', strokeWidth: 1, backgroundColor: 'transparent', backgroundOpacity: 0, textTransform: 'uppercase' as const, position: 'both' as const },
    { id: 'edging', name: 'Edge Mode', fontFamily: 'Impact', fontSize: 46, fontColor: '#ff4500', fontWeight: 'bold' as const, textShadow: true, shadowColor: '#ff0000', strokeEnabled: true, strokeColor: '#000000', strokeWidth: 3, backgroundColor: 'transparent', backgroundOpacity: 0, textTransform: 'uppercase' as const, position: 'both' as const },
    { id: 'subliminal', name: 'Subliminal', fontFamily: 'Arial', fontSize: 28, fontColor: 'rgba(255,255,255,0.3)', fontWeight: 'normal' as const, textShadow: false, shadowColor: 'transparent', strokeEnabled: false, strokeColor: 'transparent', strokeWidth: 0, backgroundColor: 'transparent', backgroundOpacity: 0, textTransform: 'lowercase' as const, position: 'both' as const },
    { id: 'glitch', name: 'Glitch', fontFamily: 'Courier New', fontSize: 40, fontColor: '#00ff00', fontWeight: 'bold' as const, textShadow: true, shadowColor: '#ff0000', strokeEnabled: true, strokeColor: '#0000ff', strokeWidth: 2, backgroundColor: 'transparent', backgroundOpacity: 0, textTransform: 'uppercase' as const, position: 'both' as const },
    { id: 'retro', name: 'Retro 80s', fontFamily: 'Arial Black', fontSize: 44, fontColor: '#ff00ff', fontWeight: 'bold' as const, textShadow: true, shadowColor: '#00ffff', strokeEnabled: true, strokeColor: '#ffff00', strokeWidth: 3, backgroundColor: 'transparent', backgroundOpacity: 0, textTransform: 'uppercase' as const, position: 'both' as const },
    { id: 'elegant', name: 'Elegant', fontFamily: 'Georgia', fontSize: 36, fontColor: '#ffd700', fontWeight: 'normal' as const, textShadow: true, shadowColor: '#000000', strokeEnabled: false, strokeColor: 'transparent', strokeWidth: 0, backgroundColor: 'transparent', backgroundOpacity: 0, textTransform: 'none' as const, position: 'both' as const },
    { id: 'brutal', name: 'Brutal', fontFamily: 'Impact', fontSize: 52, fontColor: '#ff0000', fontWeight: 'bold' as const, textShadow: true, shadowColor: '#000000', strokeEnabled: true, strokeColor: '#ffffff', strokeWidth: 4, backgroundColor: 'transparent', backgroundOpacity: 0, textTransform: 'uppercase' as const, position: 'both' as const },
    { id: 'cute', name: 'Cute', fontFamily: 'Comic Sans MS', fontSize: 34, fontColor: '#ffb6c1', fontWeight: 'bold' as const, textShadow: true, shadowColor: '#ff69b4', strokeEnabled: true, strokeColor: '#ffffff', strokeWidth: 2, backgroundColor: 'transparent', backgroundOpacity: 0, textTransform: 'none' as const, position: 'both' as const },
    { id: 'dark', name: 'Dark Mode', fontFamily: 'Arial', fontSize: 38, fontColor: '#333333', fontWeight: 'bold' as const, textShadow: true, shadowColor: '#000000', strokeEnabled: true, strokeColor: '#666666', strokeWidth: 2, backgroundColor: 'transparent', backgroundOpacity: 0, textTransform: 'uppercase' as const, position: 'both' as const },
    { id: 'anime', name: 'Anime', fontFamily: 'Arial', fontSize: 36, fontColor: '#ffffff', fontWeight: 'bold' as const, textShadow: true, shadowColor: '#ff69b4', strokeEnabled: true, strokeColor: '#000000', strokeWidth: 3, backgroundColor: 'transparent', backgroundOpacity: 0, textTransform: 'none' as const, position: 'both' as const },
    { id: 'hentai', name: 'Hentai', fontFamily: 'Arial Black', fontSize: 40, fontColor: '#ff1493', fontWeight: 'bold' as const, textShadow: true, shadowColor: '#9400d3', strokeEnabled: true, strokeColor: '#ffffff', strokeWidth: 2, backgroundColor: 'transparent', backgroundOpacity: 0, textTransform: 'uppercase' as const, position: 'both' as const },
    // New styles based on reference images
    { id: 'snapchat', name: 'Snapchat', fontFamily: 'Helvetica Neue, Arial', fontSize: 32, fontColor: '#00bfff', fontWeight: 'bold' as const, textShadow: false, shadowColor: 'transparent', strokeEnabled: false, strokeColor: 'transparent', strokeWidth: 0, backgroundColor: 'rgba(0,0,0,0.6)', backgroundOpacity: 0.6, textTransform: 'none' as const, position: 'center' as const },
    { id: 'story', name: 'Story Mode', fontFamily: 'Arial', fontSize: 28, fontColor: '#ffffff', fontWeight: 'normal' as const, textShadow: true, shadowColor: '#000000', strokeEnabled: false, strokeColor: 'transparent', strokeWidth: 0, backgroundColor: 'rgba(0,0,0,0.5)', backgroundOpacity: 0.5, textTransform: 'none' as const, position: 'center' as const },
    { id: 'tiktok', name: 'TikTok', fontFamily: 'Proxima Nova, Arial', fontSize: 36, fontColor: '#ffd700', fontWeight: 'bold' as const, textShadow: true, shadowColor: '#000000', strokeEnabled: true, strokeColor: '#000000', strokeWidth: 1, backgroundColor: 'transparent', backgroundOpacity: 0, textTransform: 'none' as const, position: 'bottom' as const },
    { id: 'category', name: 'Category Badge', fontFamily: 'Impact', fontSize: 56, fontColor: '#ffffff', fontWeight: 'bold' as const, textShadow: true, shadowColor: '#000000', strokeEnabled: true, strokeColor: '#000000', strokeWidth: 4, backgroundColor: 'transparent', backgroundOpacity: 0, textTransform: 'uppercase' as const, position: 'bottom' as const },
    { id: 'goon', name: 'Goon Mode', fontFamily: 'Impact', fontSize: 44, fontColor: '#ff00ff', fontWeight: 'bold' as const, textShadow: true, shadowColor: '#000000', strokeEnabled: true, strokeColor: '#ffffff', strokeWidth: 3, backgroundColor: 'transparent', backgroundOpacity: 0, textTransform: 'lowercase' as const, position: 'both' as const },
    { id: 'cuck', name: 'Cuck', fontFamily: 'Arial Black', fontSize: 38, fontColor: '#ffffff', fontWeight: 'bold' as const, textShadow: true, shadowColor: '#000000', strokeEnabled: true, strokeColor: '#000000', strokeWidth: 2, backgroundColor: 'transparent', backgroundOpacity: 0, textTransform: 'none' as const, position: 'top' as const },
  ]

  // Always use DEFAULT_PRESETS - they have all 17 built-in styles
  const presets = DEFAULT_PRESETS

  // Build CSS filter string from active filters
  const buildFilterCSS = useCallback(() => {
    const parts: string[] = []
    if (filterValues.invert > 0) parts.push(`invert(${filterValues.invert})`)
    if (filterValues.grayscale > 0) parts.push(`grayscale(${filterValues.grayscale})`)
    if (filterValues.sepia > 0) parts.push(`sepia(${filterValues.sepia})`)
    if (filterValues.saturate !== 1) parts.push(`saturate(${filterValues.saturate})`)
    if (filterValues.contrast !== 1) parts.push(`contrast(${filterValues.contrast})`)
    if (filterValues.brightness !== 1) parts.push(`brightness(${filterValues.brightness})`)
    if (filterValues.blur > 0) parts.push(`blur(${filterValues.blur}px)`)
    if (filterValues.hueRotate !== 0) parts.push(`hue-rotate(${filterValues.hueRotate}deg)`)
    // Low quality adds blur + contrast boost to simulate compression
    if (filterValues.lowQuality > 0) {
      parts.push(`blur(${filterValues.lowQuality * 0.2}px)`)
      parts.push(`contrast(${1 + filterValues.lowQuality * 0.05})`)
    }
    return parts.length > 0 ? parts.join(' ') : 'none'
  }, [filterValues])

  // Build pixelation style (uses CSS image-rendering)
  const getPixelateStyle = useCallback((): React.CSSProperties => {
    if (filterValues.pixelate <= 0) return {}
    const scale = Math.max(1, 100 / (filterValues.pixelate * 10))
    return {
      imageRendering: 'pixelated' as const,
      transform: `scale(${1 / scale})`,
      transformOrigin: 'center center',
    }
  }, [filterValues.pixelate])

  // Load preview URL for selected media (supports GIFs and videos)
  useEffect(() => {
    if (!selectedMedia) {
      setPreviewUrl(null)
      setVideoUrl(null)
      setCapturedFrameUrl(null)
      setImageLoadError(false)
      setImageRetryCount(0)
      return
    }

    let cancelled = false
    const loadPreview = async () => {
      // Reset error state when loading new media
      setImageLoadError(false)

      try {
        const filename = selectedMedia.filename?.toLowerCase() || ''
        const isGif = filename.endsWith('.gif')
        const isImageExt = filename.endsWith('.png') || filename.endsWith('.jpg') ||
          filename.endsWith('.jpeg') || filename.endsWith('.webp') || filename.endsWith('.bmp')
        const isImage = selectedMedia.type === 'image' || isGif || isImageExt
        const isVideo = selectedMedia.type === 'video'

        // Reset captured frame when changing media
        setCapturedFrameUrl(null)

        if (isVideo && selectedMedia.path) {
          // Load video URL for frame capture
          const url = await toFileUrlCached(selectedMedia.path)
          if (!cancelled && url) {
            setVideoUrl(url)
            setPreviewUrl(null) // Use video player instead of static preview
          }
        } else if (isImage && selectedMedia.path) {
          // For images (including GIFs), use direct file URL
          const url = await toFileUrlCached(selectedMedia.path)
          if (!cancelled && url) {
            // Log GIF loading for debugging
            if (isGif) {
              console.log('[Brainwash] Loading GIF:', selectedMedia.path, '-> URL:', url)
            }
            setPreviewUrl(url)
            setVideoUrl(null)
          }
        } else if (selectedMedia.thumbPath) {
          // Fallback to thumbnail
          const thumbUrl = await toFileUrlCached(selectedMedia.thumbPath)
          if (!cancelled && thumbUrl) {
            setPreviewUrl(thumbUrl)
            setVideoUrl(null)
          }
        } else {
          if (!cancelled) {
            setPreviewUrl(null)
            setVideoUrl(null)
          }
        }
      } catch (err) {
        console.warn('[Brainwash] Failed to load preview URL:', err)
        if (!cancelled) {
          setPreviewUrl(null)
          setVideoUrl(null)
          setImageLoadError(true)
          showToast('error', 'Failed to load media preview')
        }
      }
    }

    loadPreview()
    return () => { cancelled = true }
  }, [selectedMedia, showToast, imageRetryCount])

  // Load data - fetch ALL images and GIFs for brainwash editing
  useEffect(() => {
    const loadData = async () => {
      setLoading(true)
      try {
        const [captioned, templateList, mediaList] = await Promise.all([
          window.api.captions?.listCaptioned?.() ?? [],
          window.api.captions?.templates?.list?.() ?? [],
          // Fetch more media - 2000 items to ensure we get all images/GIFs
          window.api.media?.list?.({ limit: 2000, sortBy: 'newest' }) ?? { items: [] }
        ])
        setCaptionedMedia(captioned as CaptionedMedia[])
        // Deduplicate templates by topText+bottomText (in case old duplicates exist in DB)
        const seen = new Set<string>()
        const deduped = (templateList as CaptionTemplate[]).filter(t => {
          const key = `${t.topText ?? ''}|||${t.bottomText ?? ''}`
          if (seen.has(key)) return false
          seen.add(key)
          return true
        })
        setTemplates(deduped)

        // Include all media types - videos can have frames captured
        const allItems = extractItems<MediaRow>(mediaList)
        setAllMedia(allItems)
      } catch (err) {
        console.error('Failed to load captions data:', err)
      }
      setLoading(false)
    }
    loadData()
  }, [])

  // Filter media by search and type
  const filteredMedia = useMemo(() => {
    let filtered = allMedia
    // Type filter
    if (mediaTypeFilter === 'gif') {
      filtered = filtered.filter(m => m.type === 'gif' || m.filename?.toLowerCase().endsWith('.gif'))
    } else if (mediaTypeFilter === 'image') {
      filtered = filtered.filter(m => m.type === 'image' && !m.filename?.toLowerCase().endsWith('.gif'))
    } else if (mediaTypeFilter === 'video') {
      filtered = filtered.filter(m => m.type === 'video')
    }
    // Search filter
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      filtered = filtered.filter(m => (m.filename || '').toLowerCase().includes(q))
    }
    return filtered.slice(0, 150) // Reduced from 500 to 150 for better performance
  }, [allMedia, searchQuery, mediaTypeFilter])

  // Shuffle media for random selection
  const shuffleMedia = useCallback(() => {
    setAllMedia(prev => {
      const shuffled = [...prev]
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
      }
      return shuffled
    })
  }, [])

  // Pick random media
  const pickRandomMedia = useCallback(() => {
    if (filteredMedia.length === 0) return
    const randomIndex = Math.floor(Math.random() * filteredMedia.length)
    setSelectedMedia(filteredMedia[randomIndex])
  }, [filteredMedia])

  // GIF Maker - Shuffle videos
  const shuffleVideosForGif = useCallback(() => {
    const videos = allMedia.filter(m => m.type === 'video')
    const shuffled = [...videos]
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
    }
    setGifShuffledVideos(shuffled)
  }, [allMedia])

  // GIF Maker - Pick random video
  const pickRandomVideoForGif = useCallback(async () => {
    const videos = allMedia.filter(m => m.type === 'video')
    if (videos.length === 0) return
    const randomIndex = Math.floor(Math.random() * videos.length)
    const video = videos[randomIndex]
    setGifSelectedVideo(video)
    if (video.path) {
      const url = await toFileUrlCached(video.path)
      setGifVideoUrl(url)
      setGifPreviewUrl(null)
      setGifStartTime(0)
      setGifEndTime(Math.min(5, video.durationSec || 5))
    }
  }, [allMedia])

  // Apply filter preset
  const applyFilterPreset = useCallback((presetId: string) => {
    setSelectedFilterPreset(presetId)
    const preset = FILTER_PRESETS.find(p => p.id === presetId)
    if (!preset) return
    // Reset all filters first
    const newValues: Record<ImageFilter, number> = {
      invert: 0, grayscale: 0, sepia: 0, saturate: 1, contrast: 1,
      brightness: 1, blur: 0, hueRotate: 0, pixelate: 0, lowQuality: 0, vignette: 0
    }
    // Apply preset values
    if (preset.values) {
      Object.entries(preset.values).forEach(([key, val]) => {
        newValues[key as ImageFilter] = val as number
      })
    }
    setFilterValues(newValues)
    setActiveFilters(preset.filters)
  }, [])

  // Reset all filters
  const resetFilters = useCallback(() => {
    setFilterValues({
      invert: 0, grayscale: 0, sepia: 0, saturate: 1, contrast: 1,
      brightness: 1, blur: 0, hueRotate: 0, pixelate: 0, lowQuality: 0, vignette: 0
    })
    setActiveFilters([])
    setSelectedFilterPreset('none')
    setShowCaptionBar(false)
  }, [])

  const handleSaveCaption = async () => {
    if (!selectedMedia) return
    try {
      await window.api.captions?.upsert?.(
        selectedMedia.id,
        topText || null,
        bottomText || null,
        selectedPreset
      )
      // Refresh captioned list
      const updated = await window.api.captions?.listCaptioned?.() ?? []
      setCaptionedMedia(updated as CaptionedMedia[])
      // Clear form
      setTopText('')
      setBottomText('')
      setSelectedMedia(null)
    } catch (err) {
      console.error('Failed to save caption:', err)
    }
  }

  const handleDeleteCaption = async (mediaId: string) => {
    try {
      await window.api.captions?.delete?.(mediaId)
      setCaptionedMedia(prev => prev.filter(c => c.mediaId !== mediaId))
    } catch (err) {
      console.error('Failed to delete caption:', err)
    }
  }

  const handleEditCaption = (caption: CaptionedMedia) => {
    setEditingCaption(caption)
    setEditCaptionTop(caption.topText || '')
    setEditCaptionBottom(caption.bottomText || '')
  }

  const handleSaveEditedCaption = async () => {
    if (!editingCaption) return
    try {
      await window.api.captions?.upsert?.(
        editingCaption.mediaId,
        editCaptionTop || null,
        editCaptionBottom || null,
        editingCaption.presetId || 'default'
      )
      // Refresh captioned list
      const updated = await window.api.captions?.listCaptioned?.() ?? []
      setCaptionedMedia(updated as CaptionedMedia[])
      setEditingCaption(null)
      showToast('success', 'Caption updated!')
    } catch (err) {
      console.error('Failed to update caption:', err)
      showToast('error', 'Failed to update caption')
    }
  }

  const handleApplyTemplate = (template: { top: string | null; bottom: string | null }) => {
    setTopText(template.top || '')
    setBottomText(template.bottom || '')
  }

  const handleSeedExampleCaptions = async () => {
    try {
      for (const ex of EXAMPLE_CAPTIONS) {
        await window.api.captions?.templates?.add?.(ex.top, ex.bottom, ex.category)
      }
      const updated = await window.api.captions?.templates?.list?.() ?? []
      // Deduplicate templates
      const seen = new Set<string>()
      const deduped = (updated as CaptionTemplate[]).filter(t => {
        const key = `${t.topText ?? ''}|||${t.bottomText ?? ''}`
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })
      setTemplates(deduped)
    } catch (err) {
      console.error('Failed to seed example captions:', err)
    }
  }

  const handleClearAllTemplates = async () => {
    try {
      // Delete all templates
      for (const t of templates) {
        await window.api.captions?.templates?.delete?.(t.id)
      }
      setTemplates([])
    } catch (err) {
      console.error('Failed to clear templates:', err)
    }
  }

  const toggleCaptionMode = async (enabled: boolean) => {
    setCaptionModeEnabled(enabled)
    await window.api.settings.captions?.update?.({ enabled })
  }

  const currentPreset = presets.find(p => p.id === selectedPreset) || presets[0]

  return (
    <div className="h-full flex flex-col">
      {/* Top Bar */}
      <div className="shrink-0 h-14 flex items-center justify-between px-4 border-b border-[var(--border)] bg-[var(--panel)]">
        <div className="flex items-center gap-3">
          <MessageSquare size={20} className="text-[var(--primary)]" />
          <span className="font-semibold">Brainwash</span>
          <span className="text-xs text-[var(--muted)]">Caption & Meme Editor</span>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm">
            <span className="text-[var(--muted)]">Caption Mode</span>
            <button
              onClick={() => toggleCaptionMode(!captionModeEnabled)}
              className={cn(
                'w-11 h-6 rounded-full transition-colors relative',
                captionModeEnabled ? 'bg-[var(--primary)]' : 'bg-white/20'
              )}
            >
              <div className={cn(
                'w-4 h-4 rounded-full bg-white absolute top-1 transition-transform',
                captionModeEnabled ? 'translate-x-6' : 'translate-x-1'
              )} />
            </button>
          </label>
        </div>
      </div>

      {/* Tabs */}
      <div className="shrink-0 flex border-b border-[var(--border)] bg-[var(--panel)]">
        {(['editor', 'gifmaker', 'captioned', 'templates'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              'px-4 py-2.5 text-sm font-medium transition border-b-2',
              activeTab === tab
                ? 'border-[var(--primary)] text-[var(--primary)]'
                : 'border-transparent text-[var(--muted)] hover:text-white'
            )}
          >
            {tab === 'editor' ? 'Create Caption' : tab === 'gifmaker' ? '🎬 GIF Maker' : tab === 'captioned' ? 'Captioned Media' : 'Templates'}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-4">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <RefreshCw className="animate-spin text-[var(--primary)]" size={32} />
          </div>
        ) : activeTab === 'editor' ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Media Selection */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold">Select Media</div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={pickRandomMedia}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--primary)]/20 text-[var(--primary)] text-xs hover:bg-[var(--primary)]/30 transition"
                    title="Pick random media"
                  >
                    <Zap size={12} />
                    Random
                  </button>
                  <button
                    onClick={shuffleMedia}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 text-xs hover:bg-white/20 transition"
                    title="Shuffle all media"
                  >
                    <Shuffle size={12} />
                    Shuffle
                  </button>
                </div>
              </div>

              {/* Type Filter & Search */}
              <div className="flex gap-2">
                <div className="flex rounded-lg bg-black/30 border border-[var(--border)] p-0.5">
                  {(['all', 'image', 'gif', 'video'] as const).map(type => (
                    <button
                      key={type}
                      onClick={() => setMediaTypeFilter(type)}
                      className={cn(
                        'px-3 py-1 rounded-md text-xs transition',
                        mediaTypeFilter === type
                          ? 'bg-[var(--primary)] text-white'
                          : 'text-[var(--muted)] hover:text-white'
                      )}
                    >
                      {type === 'all' ? 'All' : type === 'gif' ? 'GIFs' : type === 'video' ? 'Videos' : 'Images'}
                    </button>
                  ))}
                </div>
                <div className="relative flex-1">
                  <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]" />
                  <input
                    type="text"
                    placeholder="Search media..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 rounded-xl bg-black/30 border border-[var(--border)] text-sm focus:outline-none focus:border-[var(--primary)]"
                  />
                </div>
              </div>

              <div className="text-xs text-[var(--muted)]">{filteredMedia.length} items</div>

              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 max-h-[400px] overflow-auto">
                {filteredMedia.map(media => {
                  const isGif = media.filename?.toLowerCase().endsWith('.gif')
                  return (
                    <button
                      key={media.id}
                      onClick={() => setSelectedMedia(media)}
                      className={cn(
                        'aspect-video rounded-lg overflow-hidden border-2 transition relative',
                        selectedMedia?.id === media.id
                          ? 'border-[var(--primary)] ring-2 ring-[var(--primary)]/50'
                          : 'border-transparent hover:border-white/30'
                      )}
                    >
                      <CaptionedThumb
                        mediaId={media.id}
                        thumbPath={media.thumbPath ?? null}
                        filename={media.filename ?? 'Unknown'}
                        filePath={media.path}
                      />
                      {isGif && (
                        <span className="absolute top-1 right-1 px-1.5 py-0.5 rounded text-[10px] bg-purple-500/80 text-white font-medium">
                          GIF
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Caption Editor */}
            <div className="space-y-4">
              <div className="text-sm font-semibold">Caption Editor</div>

              {selectedMedia ? (
                <div className="space-y-4">
                  {/* Preview with filters and caption bars */}
                  <div className="relative rounded-xl overflow-hidden bg-black/50 border border-[var(--border)]">
                    {/* Top caption bar */}
                    {showCaptionBar && (captionBarPosition === 'top' || captionBarPosition === 'both') && (
                      <div
                        className="w-full flex items-center justify-center"
                        style={{
                          height: `${captionBarSize}px`,
                          backgroundColor: captionBarColor === 'black' ? '#000000' : '#ffffff',
                        }}
                      >
                        {topText && (
                          <div
                            style={{
                              fontFamily: currentPreset?.fontFamily || 'Impact',
                              fontSize: `${(currentPreset?.fontSize || 48) / 2}px`,
                              color: captionBarColor === 'black' ? '#ffffff' : '#000000',
                              fontWeight: currentPreset?.fontWeight || 'bold',
                              textTransform: currentPreset?.textTransform || 'uppercase',
                            }}
                          >
                            {topText}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Image/Video area */}
                    <div
                      ref={imageContainerRef}
                      className={`relative aspect-video ${cropMode ? 'cursor-crosshair' : ''}`}
                      onMouseDown={cropMode ? handleCropStart : undefined}
                    >
                      {/* Video player for frame capture */}
                      {isSelectedVideo && videoUrl && !capturedFrameUrl ? (
                        <div className="w-full h-full relative">
                          <video
                            ref={videoRef}
                            src={videoUrl}
                            className="w-full h-full object-contain"
                            controls
                            muted
                          />
                          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2">
                            <button
                              onClick={captureVideoFrame}
                              className="px-4 py-2 rounded-lg bg-[var(--primary)] hover:opacity-90 text-white text-sm font-medium flex items-center gap-2 shadow-lg"
                            >
                              <ImageIcon size={16} />
                              Capture This Frame
                            </button>
                          </div>
                          <div className="absolute top-2 left-2 px-2 py-1 rounded bg-black/70 text-xs text-white">
                            Pause video and capture the perfect frame
                          </div>
                        </div>
                      ) : imageLoadError ? (
                        <div className="w-full h-full flex flex-col items-center justify-center gap-4 text-white/60">
                          <div className="text-4xl">⚠️</div>
                          <div className="text-sm">Failed to load image</div>
                          <div className="text-xs text-white/40 max-w-xs text-center">
                            The file may have been moved, deleted, or is in an unsupported format.
                          </div>
                          <div className="flex gap-2">
                            <button
                              onClick={() => setImageRetryCount(c => c + 1)}
                              className="px-3 py-1.5 rounded-lg bg-[var(--primary)] hover:opacity-90 text-white text-xs font-medium"
                            >
                              Retry
                            </button>
                            <button
                              onClick={() => setSelectedMedia(null)}
                              className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs"
                            >
                              Select Another
                            </button>
                          </div>
                        </div>
                      ) : (croppedImageUrl || capturedFrameUrl || previewUrl) ? (
                        <img
                          src={croppedImageUrl || capturedFrameUrl || previewUrl || ''}
                          alt={selectedMedia.filename}
                          className="w-full h-full object-contain"
                          style={{
                            filter: buildFilterCSS(),
                            imageRendering: filterValues.pixelate > 0 ? 'pixelated' : 'auto',
                            pointerEvents: cropMode ? 'none' : 'auto',
                          }}
                          onError={async (e) => {
                            const filename = selectedMedia.filename?.toLowerCase() || ''
                            const isGif = filename.endsWith('.gif')
                            console.error('[Brainwash] Image failed to load:', selectedMedia.path, isGif ? '(GIF)' : '')

                            // For GIFs, try fallback to thumbnail if available
                            if (isGif && selectedMedia.thumbPath && !croppedImageUrl && !capturedFrameUrl) {
                              try {
                                const thumbUrl = await toFileUrlCached(selectedMedia.thumbPath)
                                if (thumbUrl) {
                                  console.log('[Brainwash] GIF load failed, using thumbnail fallback')
                                  setPreviewUrl(thumbUrl)
                                  return // Don't set error state, we have a fallback
                                }
                              } catch {
                                // Thumbnail also failed
                              }
                            }
                            setImageLoadError(true)
                          }}
                          onLoad={() => {
                            // Clear error state on successful load
                            if (imageLoadError) setImageLoadError(false)
                          }}
                        />
                      ) : (
                        <CaptionedThumb
                          mediaId={selectedMedia.id}
                          thumbPath={selectedMedia.thumbPath ?? null}
                          filename={selectedMedia.filename ?? 'Unknown'}
                          className="object-contain"
                          style={{
                            filter: buildFilterCSS(),
                            imageRendering: filterValues.pixelate > 0 ? 'pixelated' : 'auto',
                          }}
                        />
                      )}

                      {/* Vignette overlay effect */}
                      {filterValues.vignette > 0 && (
                        <div
                          className="absolute inset-0 pointer-events-none"
                          style={{
                            background: `radial-gradient(ellipse at center, transparent 0%, transparent ${60 - filterValues.vignette * 40}%, rgba(0,0,0,${filterValues.vignette}) 100%)`,
                          }}
                        />
                      )}

                      {/* Floating Labels */}
                      {floatingLabels.map(label => (
                        <div
                          key={label.id}
                          className={cn(
                            'absolute cursor-move select-none transition-shadow',
                            editingLabelId === label.id && 'ring-2 ring-[var(--primary)] ring-offset-2 ring-offset-transparent',
                            draggingLabelId === label.id && 'opacity-80'
                          )}
                          style={{
                            left: `${label.x}%`,
                            top: `${label.y}%`,
                            transform: `translate(-50%, -50%) rotate(${label.rotation}deg)`,
                            fontSize: `${label.fontSize}px`,
                            fontFamily: label.fontFamily,
                            color: label.color,
                            textShadow: label.shadow ? '2px 2px 4px rgba(0,0,0,0.8), -1px -1px 2px rgba(0,0,0,0.5)' : 'none',
                            whiteSpace: 'nowrap',
                          }}
                          onMouseDown={(e) => handleLabelDragStart(label.id, e)}
                          onClick={(e) => { e.stopPropagation(); setEditingLabelId(label.id) }}
                        >
                          {label.text}
                        </div>
                      ))}

                      {/* Crop selection overlay */}
                      {cropMode && cropSelection && (
                        <div
                          className="absolute border-2 border-dashed border-white bg-black/30 pointer-events-none"
                          style={{
                            left: `${Math.min(cropSelection.startX, cropSelection.endX)}%`,
                            top: `${Math.min(cropSelection.startY, cropSelection.endY)}%`,
                            width: `${Math.abs(cropSelection.endX - cropSelection.startX)}%`,
                            height: `${Math.abs(cropSelection.endY - cropSelection.startY)}%`,
                          }}
                        >
                          {/* Corner handles */}
                          <div className="absolute -top-1 -left-1 w-2 h-2 bg-white rounded-full" />
                          <div className="absolute -top-1 -right-1 w-2 h-2 bg-white rounded-full" />
                          <div className="absolute -bottom-1 -left-1 w-2 h-2 bg-white rounded-full" />
                          <div className="absolute -bottom-1 -right-1 w-2 h-2 bg-white rounded-full" />
                        </div>
                      )}

                      {/* Crop mode overlay with dimmed areas */}
                      {cropMode && !cropSelection && (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/40 pointer-events-none">
                          <span className="text-white text-sm font-medium px-3 py-1.5 bg-black/50 rounded-lg">
                            Click and drag to select crop area
                          </span>
                        </div>
                      )}

                      {/* Caption overlay preview (when bars are off) - DRAGGABLE */}
                      {!showCaptionBar && !cropMode && topText && (
                        <div
                          onMouseDown={handleTextDragStart('top')}
                          className={`absolute left-0 right-0 text-center px-4 select-none ${
                            isDraggingText === 'top' ? 'cursor-grabbing' : 'cursor-grab'
                          }`}
                          style={{
                            top: `${topTextY}%`,
                            transform: 'translateY(-50%)',
                            fontFamily: currentPreset?.fontFamily || 'Impact',
                            fontSize: `${(currentPreset?.fontSize || 48) / 2}px`,
                            color: currentPreset?.fontColor || '#ffffff',
                            fontWeight: currentPreset?.fontWeight || 'bold',
                            textTransform: currentPreset?.textTransform || 'uppercase',
                            WebkitTextStroke: currentPreset?.strokeEnabled
                              ? `${currentPreset.strokeWidth || 2}px ${currentPreset.strokeColor || '#000000'}`
                              : 'none',
                            textShadow: currentPreset?.strokeEnabled
                              ? `0 0 8px ${currentPreset.strokeColor}, 2px 2px 4px rgba(0,0,0,0.8)`
                              : 'none',
                            paintOrder: 'stroke fill',
                            transition: isDraggingText === 'top' ? 'none' : 'top 0.1s ease-out',
                          }}
                          title="Drag to reposition"
                        >
                          {topText}
                        </div>
                      )}
                      {!showCaptionBar && !cropMode && bottomText && (
                        <div
                          onMouseDown={handleTextDragStart('bottom')}
                          className={`absolute left-0 right-0 text-center px-4 select-none ${
                            isDraggingText === 'bottom' ? 'cursor-grabbing' : 'cursor-grab'
                          }`}
                          style={{
                            top: `${bottomTextY}%`,
                            transform: 'translateY(-50%)',
                            fontFamily: currentPreset?.fontFamily || 'Impact',
                            fontSize: `${(currentPreset?.fontSize || 48) / 2}px`,
                            color: currentPreset?.fontColor || '#ffffff',
                            fontWeight: currentPreset?.fontWeight || 'bold',
                            textTransform: currentPreset?.textTransform || 'uppercase',
                            WebkitTextStroke: currentPreset?.strokeEnabled
                              ? `${currentPreset.strokeWidth || 2}px ${currentPreset.strokeColor || '#000000'}`
                              : 'none',
                            textShadow: currentPreset?.strokeEnabled
                              ? `0 0 8px ${currentPreset.strokeColor}, 2px 2px 4px rgba(0,0,0,0.8)`
                              : 'none',
                            paintOrder: 'stroke fill',
                            transition: isDraggingText === 'bottom' ? 'none' : 'top 0.1s ease-out',
                          }}
                          title="Drag to reposition"
                        >
                          {bottomText}
                        </div>
                      )}
                      {/* Media type badge */}
                      {selectedMedia.filename?.toLowerCase().endsWith('.gif') && (
                        <span className="absolute top-2 right-2 px-2 py-1 rounded text-xs bg-purple-500/80 text-white font-medium">
                          GIF (Animated)
                        </span>
                      )}
                    </div>

                    {/* Bottom caption bar */}
                    {showCaptionBar && (captionBarPosition === 'bottom' || captionBarPosition === 'both') && (
                      <div
                        className="w-full flex items-center justify-center"
                        style={{
                          height: `${captionBarSize}px`,
                          backgroundColor: captionBarColor === 'black' ? '#000000' : '#ffffff',
                        }}
                      >
                        {bottomText && (
                          <div
                            style={{
                              fontFamily: currentPreset?.fontFamily || 'Impact',
                              fontSize: `${(currentPreset?.fontSize || 48) / 2}px`,
                              color: captionBarColor === 'black' ? '#ffffff' : '#000000',
                              fontWeight: currentPreset?.fontWeight || 'bold',
                              textTransform: currentPreset?.textTransform || 'uppercase',
                            }}
                          >
                            {bottomText}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Video Frame Capture - Only show for videos */}
                  {isSelectedVideo && (
                    <div className="rounded-xl bg-black/30 border border-[var(--border)] p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="text-xs font-semibold text-[var(--muted)]">Video Frame</div>
                        {capturedFrameUrl && (
                          <button
                            onClick={resetCapturedFrame}
                            className="text-xs text-red-400 hover:text-red-300"
                            title="Recapture a different frame"
                          >
                            Recapture
                          </button>
                        )}
                      </div>
                      {!capturedFrameUrl ? (
                        <div className="text-[10px] text-white/60">
                          Use the video player above to pause at the desired frame, then click "Capture This Frame"
                        </div>
                      ) : (
                        <div className="text-[10px] text-green-400 flex items-center gap-1">
                          <CheckCircle2 size={10} />
                          Frame captured! Add captions below.
                        </div>
                      )}
                    </div>
                  )}

                  {/* Crop Tools - Only show for images/GIFs or captured frames */}
                  {(!isSelectedVideo || capturedFrameUrl) && (
                  <div className="rounded-xl bg-black/30 border border-[var(--border)] p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="text-xs font-semibold text-[var(--muted)]">Crop Image</div>
                      {croppedImageUrl && (
                        <button
                          onClick={resetCrop}
                          className="text-xs text-red-400 hover:text-red-300"
                          title="Reset to original image"
                        >
                          Reset Crop
                        </button>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          if (cropMode) {
                            setCropMode(false)
                            setCropSelection(null)
                          } else {
                            setCropMode(true)
                          }
                        }}
                        className={cn(
                          'flex-1 px-3 py-2 rounded-lg text-xs font-medium transition flex items-center justify-center gap-2',
                          cropMode
                            ? 'bg-[var(--primary)] text-white'
                            : 'bg-white/10 hover:bg-white/20 text-white'
                        )}
                        title={cropMode ? 'Cancel crop selection' : 'Enter crop mode to select area'}
                      >
                        <Maximize2 size={14} />
                        {cropMode ? 'Cancel' : 'Crop Mode'}
                      </button>
                      {cropMode && cropSelection && (
                        <button
                          onClick={applyCrop}
                          className="px-3 py-2 rounded-lg text-xs font-medium bg-green-500 hover:bg-green-600 text-white transition flex items-center gap-2"
                          title="Apply the crop to the image"
                        >
                          <Check size={14} />
                          Apply
                        </button>
                      )}
                    </div>
                    {isSelectedGif && cropMode && (
                      <div className="text-[10px] text-yellow-400 flex items-center gap-1">
                        <AlertCircle size={10} />
                        Warning: Cropping a GIF will convert it to a static image
                      </div>
                    )}
                    {croppedImageUrl && (
                      <div className="text-[10px] text-green-400 flex items-center gap-1">
                        <CheckCircle2 size={10} />
                        Image cropped. Captions will be added to cropped version.
                      </div>
                    )}
                  </div>
                  )}

                  {/* Image Filters */}
                  <div className="rounded-xl bg-black/30 border border-[var(--border)] p-3 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="text-xs font-semibold text-[var(--muted)]">Image Filters</div>
                      <button
                        onClick={resetFilters}
                        className="text-xs text-[var(--primary)] hover:underline"
                      >
                        Reset
                      </button>
                    </div>

                    {/* Filter Presets */}
                    <div className="flex flex-wrap gap-1.5">
                      {FILTER_PRESETS.map(preset => (
                        <button
                          key={preset.id}
                          onClick={() => applyFilterPreset(preset.id)}
                          className={cn(
                            'px-2 py-1 rounded text-xs transition',
                            selectedFilterPreset === preset.id
                              ? 'bg-[var(--primary)] text-white'
                              : 'bg-white/10 hover:bg-white/20'
                          )}
                        >
                          {preset.name}
                        </button>
                      ))}
                    </div>

                    {/* Individual Filter Sliders */}
                    <div className="grid grid-cols-2 gap-2 pt-2">
                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-[var(--muted)]">Brightness</span>
                          <span className="text-xs text-[var(--muted)]">{filterValues.brightness.toFixed(1)}</span>
                        </div>
                        <input
                          type="range" min="0.5" max="2" step="0.1"
                          value={filterValues.brightness}
                          onChange={(e) => setFilterValues(v => ({ ...v, brightness: parseFloat(e.target.value) }))}
                          className="w-full h-1 accent-[var(--primary)]"
                        />
                      </div>
                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-[var(--muted)]">Contrast</span>
                          <span className="text-xs text-[var(--muted)]">{filterValues.contrast.toFixed(1)}</span>
                        </div>
                        <input
                          type="range" min="0.5" max="2" step="0.1"
                          value={filterValues.contrast}
                          onChange={(e) => setFilterValues(v => ({ ...v, contrast: parseFloat(e.target.value) }))}
                          className="w-full h-1 accent-[var(--primary)]"
                        />
                      </div>
                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-[var(--muted)]">Saturation</span>
                          <span className="text-xs text-[var(--muted)]">{filterValues.saturate.toFixed(1)}</span>
                        </div>
                        <input
                          type="range" min="0" max="3" step="0.1"
                          value={filterValues.saturate}
                          onChange={(e) => setFilterValues(v => ({ ...v, saturate: parseFloat(e.target.value) }))}
                          className="w-full h-1 accent-[var(--primary)]"
                        />
                      </div>
                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-[var(--muted)]">Hue Rotate</span>
                          <span className="text-xs text-[var(--muted)]">{filterValues.hueRotate}°</span>
                        </div>
                        <input
                          type="range" min="0" max="360" step="10"
                          value={filterValues.hueRotate}
                          onChange={(e) => setFilterValues(v => ({ ...v, hueRotate: parseInt(e.target.value) }))}
                          className="w-full h-1 accent-[var(--primary)]"
                        />
                      </div>
                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-[var(--muted)]">Grayscale</span>
                          <span className="text-xs text-[var(--muted)]">{Math.round(filterValues.grayscale * 100)}%</span>
                        </div>
                        <input
                          type="range" min="0" max="1" step="0.1"
                          value={filterValues.grayscale}
                          onChange={(e) => setFilterValues(v => ({ ...v, grayscale: parseFloat(e.target.value) }))}
                          className="w-full h-1 accent-[var(--primary)]"
                        />
                      </div>
                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-[var(--muted)]">Sepia</span>
                          <span className="text-xs text-[var(--muted)]">{Math.round(filterValues.sepia * 100)}%</span>
                        </div>
                        <input
                          type="range" min="0" max="1" step="0.1"
                          value={filterValues.sepia}
                          onChange={(e) => setFilterValues(v => ({ ...v, sepia: parseFloat(e.target.value) }))}
                          className="w-full h-1 accent-[var(--primary)]"
                        />
                      </div>
                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-[var(--muted)]">Invert</span>
                          <span className="text-xs text-[var(--muted)]">{Math.round(filterValues.invert * 100)}%</span>
                        </div>
                        <input
                          type="range" min="0" max="1" step="0.1"
                          value={filterValues.invert}
                          onChange={(e) => setFilterValues(v => ({ ...v, invert: parseFloat(e.target.value) }))}
                          className="w-full h-1 accent-[var(--primary)]"
                        />
                      </div>
                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-[var(--muted)]">Blur</span>
                          <span className="text-xs text-[var(--muted)]">{filterValues.blur}px</span>
                        </div>
                        <input
                          type="range" min="0" max="10" step="0.5"
                          value={filterValues.blur}
                          onChange={(e) => setFilterValues(v => ({ ...v, blur: parseFloat(e.target.value) }))}
                          className="w-full h-1 accent-[var(--primary)]"
                        />
                      </div>
                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-[var(--muted)]">Pixelate</span>
                          <span className="text-xs text-[var(--muted)]">{filterValues.pixelate}</span>
                        </div>
                        <input
                          type="range" min="0" max="20" step="1"
                          value={filterValues.pixelate}
                          onChange={(e) => setFilterValues(v => ({ ...v, pixelate: parseInt(e.target.value) }))}
                          className="w-full h-1 accent-[var(--primary)]"
                        />
                      </div>
                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-[var(--muted)]">Low Quality</span>
                          <span className="text-xs text-[var(--muted)]">{filterValues.lowQuality}</span>
                        </div>
                        <input
                          type="range" min="0" max="10" step="1"
                          value={filterValues.lowQuality}
                          onChange={(e) => setFilterValues(v => ({ ...v, lowQuality: parseInt(e.target.value) }))}
                          className="w-full h-1 accent-[var(--primary)]"
                        />
                      </div>
                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-[var(--muted)]">Vignette</span>
                          <span className="text-xs text-[var(--muted)]">{Math.round(filterValues.vignette * 100)}%</span>
                        </div>
                        <input
                          type="range" min="0" max="1" step="0.05"
                          value={filterValues.vignette}
                          onChange={(e) => setFilterValues(v => ({ ...v, vignette: parseFloat(e.target.value) }))}
                          className="w-full h-1 accent-[var(--primary)]"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Caption Bars */}
                  <div className="rounded-xl bg-black/30 border border-[var(--border)] p-3 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="text-xs font-semibold text-[var(--muted)]">Caption Bars</div>
                      <button
                        onClick={() => setShowCaptionBar(!showCaptionBar)}
                        className={cn(
                          'px-2 py-1 rounded text-xs transition',
                          showCaptionBar ? 'bg-[var(--primary)] text-white' : 'bg-white/10 hover:bg-white/20'
                        )}
                      >
                        {showCaptionBar ? 'On' : 'Off'}
                      </button>
                    </div>
                    {showCaptionBar && (
                      <div className="space-y-2">
                        <div className="flex gap-2">
                          <button
                            onClick={() => setCaptionBarColor('black')}
                            className={cn('flex-1 px-2 py-1.5 rounded text-xs transition', captionBarColor === 'black' ? 'bg-black text-white border border-white/20' : 'bg-white/10')}
                          >
                            Black
                          </button>
                          <button
                            onClick={() => setCaptionBarColor('white')}
                            className={cn('flex-1 px-2 py-1.5 rounded text-xs transition', captionBarColor === 'white' ? 'bg-white text-black' : 'bg-white/10')}
                          >
                            White
                          </button>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => setCaptionBarPosition('top')}
                            className={cn('flex-1 px-2 py-1 rounded text-xs', captionBarPosition === 'top' ? 'bg-[var(--primary)] text-white' : 'bg-white/10')}
                          >
                            Top
                          </button>
                          <button
                            onClick={() => setCaptionBarPosition('bottom')}
                            className={cn('flex-1 px-2 py-1 rounded text-xs', captionBarPosition === 'bottom' ? 'bg-[var(--primary)] text-white' : 'bg-white/10')}
                          >
                            Bottom
                          </button>
                          <button
                            onClick={() => setCaptionBarPosition('both')}
                            className={cn('flex-1 px-2 py-1 rounded text-xs', captionBarPosition === 'both' ? 'bg-[var(--primary)] text-white' : 'bg-white/10')}
                          >
                            Both
                          </button>
                        </div>
                        <div className="space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-[var(--muted)]">Bar Height</span>
                            <span className="text-xs text-[var(--muted)]">{captionBarSize}px</span>
                          </div>
                          <input
                            type="range" min="30" max="120" step="5"
                            value={captionBarSize}
                            onChange={(e) => setCaptionBarSize(parseInt(e.target.value))}
                            className="w-full h-1 accent-[var(--primary)]"
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Floating Labels */}
                  <div className="rounded-xl bg-black/30 border border-[var(--border)] p-3 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="text-xs font-semibold text-[var(--muted)]">Floating Labels</div>
                      <button
                        onClick={addFloatingLabel}
                        className="px-2 py-1 rounded text-xs bg-[var(--primary)] text-white hover:bg-[var(--primary)]/80 transition"
                      >
                        + Add
                      </button>
                    </div>
                    {floatingLabels.length > 0 && (
                      <div className="space-y-2 max-h-48 overflow-y-auto">
                        {floatingLabels.map(label => (
                          <div
                            key={label.id}
                            className={cn(
                              'p-2 rounded-lg border transition cursor-pointer',
                              editingLabelId === label.id
                                ? 'bg-[var(--primary)]/20 border-[var(--primary)]'
                                : 'bg-black/20 border-[var(--border)] hover:border-[var(--primary)]/50'
                            )}
                            onClick={() => setEditingLabelId(editingLabelId === label.id ? null : label.id)}
                          >
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-xs truncate flex-1 mr-2">{label.text}</span>
                              <button
                                onClick={(e) => { e.stopPropagation(); deleteFloatingLabel(label.id) }}
                                className="text-red-400 hover:text-red-300 text-xs"
                              >
                                ✕
                              </button>
                            </div>
                            {editingLabelId === label.id && (
                              <div className="space-y-2 mt-2 pt-2 border-t border-[var(--border)]">
                                <input
                                  type="text"
                                  value={label.text}
                                  onChange={(e) => updateFloatingLabel(label.id, { text: e.target.value })}
                                  className="w-full px-2 py-1 text-xs rounded bg-black/30 border border-[var(--border)] focus:outline-none"
                                  onClick={(e) => e.stopPropagation()}
                                />
                                <div className="grid grid-cols-2 gap-2">
                                  <div>
                                    <span className="text-[10px] text-[var(--muted)]">Size</span>
                                    <input
                                      type="range" min="12" max="72" step="2"
                                      value={label.fontSize}
                                      onChange={(e) => updateFloatingLabel(label.id, { fontSize: parseInt(e.target.value) })}
                                      className="w-full h-1"
                                      onClick={(e) => e.stopPropagation()}
                                    />
                                  </div>
                                  <div>
                                    <span className="text-[10px] text-[var(--muted)]">Rotation</span>
                                    <input
                                      type="range" min="-45" max="45" step="5"
                                      value={label.rotation}
                                      onChange={(e) => updateFloatingLabel(label.id, { rotation: parseInt(e.target.value) })}
                                      className="w-full h-1"
                                      onClick={(e) => e.stopPropagation()}
                                    />
                                  </div>
                                </div>
                                <div className="flex gap-2">
                                  <input
                                    type="color"
                                    value={label.color}
                                    onChange={(e) => updateFloatingLabel(label.id, { color: e.target.value })}
                                    className="w-8 h-6 rounded cursor-pointer"
                                    onClick={(e) => e.stopPropagation()}
                                  />
                                  <select
                                    value={label.fontFamily}
                                    onChange={(e) => updateFloatingLabel(label.id, { fontFamily: e.target.value })}
                                    className="flex-1 text-xs px-1 py-0.5 rounded bg-black/30 border border-[var(--border)]"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <option value="Impact">Impact</option>
                                    <option value="Arial Black">Arial Black</option>
                                    <option value="Comic Sans MS">Comic Sans</option>
                                    <option value="Georgia">Georgia</option>
                                    <option value="Times New Roman">Times</option>
                                    <option value="Courier New">Courier</option>
                                  </select>
                                  <button
                                    onClick={(e) => { e.stopPropagation(); updateFloatingLabel(label.id, { shadow: !label.shadow }) }}
                                    className={cn('px-2 py-0.5 text-xs rounded', label.shadow ? 'bg-[var(--primary)]' : 'bg-white/10')}
                                  >
                                    Shadow
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                    {floatingLabels.length === 0 && (
                      <p className="text-[10px] text-[var(--muted)] text-center py-2">
                        Add floating labels that can be dragged anywhere on the image
                      </p>
                    )}
                  </div>

                  {/* Caption inputs */}
                  <div className="space-y-3">
                    <div>
                      <label className="text-xs text-[var(--muted)] block mb-1">Top Text</label>
                      <input
                        type="text"
                        value={topText}
                        onChange={(e) => setTopText(e.target.value)}
                        placeholder="Top caption..."
                        className="w-full px-3 py-2 rounded-xl bg-black/30 border border-[var(--border)] text-sm focus:outline-none focus:border-[var(--primary)]"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-[var(--muted)] block mb-1">Bottom Text</label>
                      <input
                        type="text"
                        value={bottomText}
                        onChange={(e) => setBottomText(e.target.value)}
                        placeholder="Bottom caption..."
                        className="w-full px-3 py-2 rounded-xl bg-black/30 border border-[var(--border)] text-sm focus:outline-none focus:border-[var(--primary)]"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-[var(--muted)] block mb-1">Text Style</label>
                      <select
                        value={selectedPreset}
                        onChange={(e) => setSelectedPreset(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl bg-black/30 border border-[var(--border)] text-sm focus:outline-none focus:border-[var(--primary)]"
                      >
                        {presets.map(p => (
                          <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Text Position Controls */}
                  {!showCaptionBar && (topText || bottomText) && (
                    <div className="rounded-xl bg-black/30 border border-[var(--border)] p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="text-xs font-semibold text-[var(--muted)]">Text Position</div>
                        <span className="text-[10px] text-[var(--muted)] italic">✋ Drag text on image</span>
                      </div>
                      {topText && (
                        <div className="space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-[var(--muted)]">Top Text Y</span>
                            <span className="text-xs text-[var(--muted)]">{topTextY}%</span>
                          </div>
                          <input
                            type="range" min="5" max="95" step="1"
                            value={topTextY}
                            onChange={(e) => setTopTextY(parseInt(e.target.value))}
                            className="w-full h-1 accent-[var(--primary)]"
                          />
                        </div>
                      )}
                      {bottomText && (
                        <div className="space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-[var(--muted)]">Bottom Text Y</span>
                            <span className="text-xs text-[var(--muted)]">{bottomTextY}%</span>
                          </div>
                          <input
                            type="range" min="5" max="95" step="1"
                            value={bottomTextY}
                            onChange={(e) => setBottomTextY(parseInt(e.target.value))}
                            className="w-full h-1 accent-[var(--primary)]"
                          />
                        </div>
                      )}
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex gap-2">
                    <button
                      onClick={handleSaveCaption}
                      disabled={!topText && !bottomText}
                      className="flex-1 px-4 py-2 rounded-xl bg-[var(--primary)] text-white font-medium text-sm hover:opacity-90 transition disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Save Caption
                    </button>
                    <button
                      onClick={pickRandomMedia}
                      className="px-4 py-2 rounded-xl bg-purple-500/20 text-purple-300 text-sm hover:bg-purple-500/30 transition"
                      title="Pick random media"
                    >
                      <Shuffle size={16} />
                    </button>
                    <button
                      onClick={() => {
                        setSelectedMedia(null)
                        setTopText('')
                        setBottomText('')
                        resetFilters()
                      }}
                      className="px-4 py-2 rounded-xl bg-white/10 text-sm hover:bg-white/20 transition"
                    >
                      Clear
                    </button>
                  </div>

                  {/* Secondary Actions */}
                  <div className="flex gap-2">
                    <button
                      onClick={async () => {
                        if (!selectedMedia) return
                        setGeneratingCaption(true)
                        try {
                          // Try Venice AI first if configured, then fall back to template-based
                          if (veniceConfigured) {
                            const veniceResult = await window.api.ai.veniceCaption?.(selectedMedia.id, 'generic')
                            if (veniceResult && !veniceResult.error && (veniceResult.topText || veniceResult.bottomText)) {
                              if (veniceResult.topText) setTopText(veniceResult.topText)
                              if (veniceResult.bottomText) setBottomText(veniceResult.bottomText)
                              showToast('success', 'Venice AI caption generated!')
                              return
                            }
                            // If Venice fails, fall through to template-based
                            console.log('[Brainwash] Venice AI failed, falling back to templates:', veniceResult?.error)
                          }

                          // Use template-based captions (analyzes tags)
                          const result = await window.api.ai.analyzeForCaption?.(selectedMedia.id)
                          if (result?.topText) setTopText(result.topText)
                          if (result?.bottomText) setBottomText(result.bottomText)
                          if (result?.topText || result?.bottomText) {
                            showToast('success', veniceConfigured ? 'Caption generated (fallback)' : 'AI caption generated!')
                          } else {
                            showToast('info', 'Using random caption')
                            // Fallback: pick a random caption from examples
                            const randomCaption = EXAMPLE_CAPTIONS[Math.floor(Math.random() * EXAMPLE_CAPTIONS.length)]
                            if (randomCaption.top) setTopText(randomCaption.top)
                            if (randomCaption.bottom) setBottomText(randomCaption.bottom)
                          }
                        } catch (err) {
                          console.error('AI caption generation failed:', err)
                          showToast('warning', 'AI failed, using random caption')
                          // Fallback: pick a random caption from examples
                          const randomCaption = EXAMPLE_CAPTIONS[Math.floor(Math.random() * EXAMPLE_CAPTIONS.length)]
                          if (randomCaption.top) setTopText(randomCaption.top)
                          if (randomCaption.bottom) setBottomText(randomCaption.bottom)
                        } finally {
                          setGeneratingCaption(false)
                        }
                      }}
                      disabled={generatingCaption || !selectedMedia}
                      className={`flex-1 px-3 py-2 rounded-xl text-xs transition flex items-center justify-center gap-1.5 disabled:opacity-50 ${
                        veniceConfigured
                          ? 'bg-gradient-to-r from-cyan-500/20 to-purple-500/20 text-cyan-300 hover:from-cyan-500/30 hover:to-purple-500/30'
                          : 'bg-gradient-to-r from-purple-500/20 to-pink-500/20 text-purple-300 hover:from-purple-500/30 hover:to-pink-500/30'
                      }`}
                      title={veniceConfigured ? 'Generate with Venice AI vision' : 'Generate from templates (configure Venice AI for smarter captions)'}
                    >
                      {generatingCaption ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <Sparkles size={14} />
                      )}
                      {veniceConfigured ? 'Venice AI' : 'AI Caption'}
                    </button>
                    <button
                      onClick={async () => {
                        if (!selectedMedia) return
                        try {
                          // Export the captioned image as a new file
                          const exported = await window.api.captions?.export?.(selectedMedia.id, {
                            topText: topText || null,
                            bottomText: bottomText || null,
                            presetId: selectedPreset,
                            filters: filterValues,
                            captionBar: showCaptionBar ? { color: captionBarColor, size: captionBarSize, position: captionBarPosition } : null,
                          })
                          if (exported) {
                            console.log('[Brainwash] Exported to:', exported)
                            showToast('success', 'Image exported successfully!')
                          }
                        } catch (err) {
                          console.error('[Brainwash] Export failed:', err)
                          showToast('error', 'Failed to export image')
                        }
                      }}
                      disabled={!selectedMedia}
                      className="flex-1 px-3 py-2 rounded-xl bg-green-500/20 text-green-300 text-xs hover:bg-green-500/30 transition flex items-center justify-center gap-1.5 disabled:opacity-50"
                      title="Export as new image"
                    >
                      <Download size={14} />
                      Export
                    </button>
                    <button
                      onClick={() => {
                        if (!selectedMedia) return
                        // Show add to playlist popup (reuse existing)
                        const event = new CustomEvent('show-add-to-playlist', { detail: { mediaId: selectedMedia.id } })
                        window.dispatchEvent(event)
                      }}
                      disabled={!selectedMedia}
                      className="px-3 py-2 rounded-xl bg-blue-500/20 text-blue-300 text-xs hover:bg-blue-500/30 transition disabled:opacity-50"
                      title="Add to playlist"
                    >
                      <Plus size={14} />
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <ImageIcon size={48} className="text-[var(--muted)] mb-4" />
                  <p className="text-[var(--muted)]">Select media to add captions</p>
                  <button
                    onClick={pickRandomMedia}
                    className="mt-4 flex items-center gap-2 px-4 py-2 rounded-xl bg-[var(--primary)] text-white text-sm hover:opacity-90 transition"
                  >
                    <Zap size={14} />
                    Pick Random
                  </button>
                </div>
              )}

              {/* Quick templates */}
              {templates.length > 0 && (
                <div className="mt-6">
                  <div className="text-xs text-[var(--muted)] mb-2">Quick Apply Template</div>
                  <div className="flex flex-wrap gap-2">
                    {templates.slice(0, 6).map(t => (
                      <button
                        key={t.id}
                        onClick={() => handleApplyTemplate({ top: t.topText, bottom: t.bottomText })}
                        className="px-3 py-1.5 rounded-lg bg-white/10 text-xs hover:bg-white/20 transition truncate max-w-[150px]"
                      >
                        {t.topText || t.bottomText}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : activeTab === 'gifmaker' ? (
          /* GIF Maker Tab - Create GIFs from video clips */
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Video Selection */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold">Select Video</div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={pickRandomVideoForGif}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--primary)]/20 text-[var(--primary)] text-xs hover:bg-[var(--primary)]/30 transition"
                    title="Pick random video"
                  >
                    <Zap size={12} />
                    Random
                  </button>
                  <button
                    onClick={shuffleVideosForGif}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 text-xs hover:bg-white/20 transition"
                    title="Shuffle all videos"
                  >
                    <Shuffle size={12} />
                    Shuffle
                  </button>
                </div>
              </div>

              {/* Search */}
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Search videos..."
                  value={gifSearchQuery}
                  onChange={e => setGifSearchQuery(e.target.value)}
                  className="flex-1 px-3 py-1.5 rounded-lg bg-[var(--surface)] border border-[var(--border)] text-sm"
                />
              </div>

              {/* Video Grid */}
              <div className="grid grid-cols-3 gap-2 max-h-[400px] overflow-y-auto">
                {(gifShuffledVideos.length > 0 ? gifShuffledVideos : allMedia.filter(m => m.type === 'video')).filter(m =>
                  !gifSearchQuery || (m.filename || '').toLowerCase().includes(gifSearchQuery.toLowerCase())
                ).slice(0, 150).map(m => (
                  <button
                    key={m.id}
                    onClick={async () => {
                      setGifSelectedVideo(m)
                      if (m.path) {
                        try {
                          const url = await toFileUrlCached(m.path)
                          setGifVideoUrl(url)
                          setGifPreviewUrl(null)
                          setGifStartTime(0)
                          setGifEndTime(Math.min(5, m.durationSec || 5))
                        } catch (err) {
                          console.error('[GifMaker] Failed to load video URL:', err)
                        }
                      }
                    }}
                    className={cn(
                      'aspect-video rounded-lg overflow-hidden border-2 transition relative',
                      gifSelectedVideo?.id === m.id ? 'border-[var(--primary)]' : 'border-transparent hover:border-white/20'
                    )}
                  >
                    <CaptionedThumb mediaId={m.id} thumbPath={m.thumbPath ?? null} filename={m.filename ?? ''} />
                    <div className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded bg-black/70 text-[10px]">
                      {m.durationSec ? `${Math.floor(m.durationSec / 60)}:${String(Math.floor(m.durationSec % 60)).padStart(2, '0')}` : '?'}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* GIF Preview & Controls */}
            <div className="space-y-4">
              {/* Video Preview */}
              <div className="aspect-video bg-black rounded-xl overflow-hidden relative">
                {gifVideoUrl ? (
                  <>
                    <video
                      ref={gifVideoRef}
                      src={gifVideoUrl}
                      className="w-full h-full object-contain"
                      controls
                      onLoadedMetadata={() => {
                        if (gifVideoRef.current && gifSelectedVideo?.durationSec) {
                          setGifEndTime(Math.min(5, gifSelectedVideo.durationSec))
                        }
                      }}
                    />
                    <div className="absolute top-2 left-2 px-2 py-1 rounded bg-black/70 text-xs">
                      {gifSelectedVideo?.filename || 'Video'}
                    </div>
                  </>
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center text-[var(--muted)]">
                    <Play size={48} className="mb-2 opacity-50" />
                    <p className="text-sm">Select a video to create a GIF</p>
                  </div>
                )}
              </div>

              {/* GIF Settings */}
              {gifVideoUrl && (
                <div className="bg-[var(--surface)] rounded-xl p-4 space-y-4">
                  <div className="text-sm font-semibold">GIF Settings</div>

                  {/* Time Range */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs text-[var(--muted)] block mb-1">Start Time (sec)</label>
                      <input
                        type="number"
                        min={0}
                        max={gifEndTime - 0.1}
                        step={0.1}
                        value={gifStartTime}
                        onChange={e => setGifStartTime(Number(e.target.value))}
                        className="w-full px-3 py-2 rounded-lg bg-[var(--background)] border border-[var(--border)] text-sm"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-[var(--muted)] block mb-1">End Time (sec)</label>
                      <input
                        type="number"
                        min={gifStartTime + 0.1}
                        max={gifSelectedVideo?.durationSec || 60}
                        step={0.1}
                        value={gifEndTime}
                        onChange={e => setGifEndTime(Number(e.target.value))}
                        className="w-full px-3 py-2 rounded-lg bg-[var(--background)] border border-[var(--border)] text-sm"
                      />
                    </div>
                  </div>

                  {/* Duration display */}
                  <div className="text-xs text-[var(--muted)]">
                    Duration: {(gifEndTime - gifStartTime).toFixed(1)} seconds
                    {gifEndTime - gifStartTime > 10 && (
                      <span className="text-yellow-500 ml-2">(Warning: Long GIFs will be large files)</span>
                    )}
                  </div>

                  {/* Quick set buttons */}
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        if (gifVideoRef.current) {
                          setGifStartTime(gifVideoRef.current.currentTime)
                        }
                      }}
                      className="px-3 py-1.5 rounded-lg bg-white/10 text-xs hover:bg-white/20 transition"
                    >
                      Set Start from Player
                    </button>
                    <button
                      onClick={() => {
                        if (gifVideoRef.current) {
                          setGifEndTime(gifVideoRef.current.currentTime)
                        }
                      }}
                      className="px-3 py-1.5 rounded-lg bg-white/10 text-xs hover:bg-white/20 transition"
                    >
                      Set End from Player
                    </button>
                  </div>

                  {/* FPS & Quality */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs text-[var(--muted)] block mb-1">Frame Rate (FPS)</label>
                      <select
                        value={gifFps}
                        onChange={e => setGifFps(Number(e.target.value))}
                        className="w-full px-3 py-2 rounded-lg bg-[var(--background)] border border-[var(--border)] text-sm"
                      >
                        <option value={10}>10 FPS (small file)</option>
                        <option value={15}>15 FPS (balanced)</option>
                        <option value={24}>24 FPS (smooth)</option>
                        <option value={30}>30 FPS (very smooth)</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-[var(--muted)] block mb-1">Quality</label>
                      <select
                        value={gifQuality}
                        onChange={e => setGifQuality(e.target.value as 'low' | 'medium' | 'high')}
                        className="w-full px-3 py-2 rounded-lg bg-[var(--background)] border border-[var(--border)] text-sm"
                      >
                        <option value="low">Low (320px, small file)</option>
                        <option value="medium">Medium (480px)</option>
                        <option value="high">High (720px, large file)</option>
                      </select>
                    </div>
                  </div>

                  {/* Generate Button */}
                  <button
                    onClick={async () => {
                      if (!gifSelectedVideo?.id) return
                      setGifGenerating(true)
                      try {
                        const result = await window.api.media?.createGif?.({
                          mediaId: gifSelectedVideo.id,
                          startTime: gifStartTime,
                          endTime: gifEndTime,
                          fps: gifFps,
                          quality: gifQuality
                        })
                        if (result?.success && result.gifPath) {
                          const url = await toFileUrlCached(result.gifPath)
                          setGifPreviewUrl(url)
                          // Store path for save operations
                          setGifOutputPath(result.gifPath)
                          showToast('success', 'GIF created successfully!')
                        } else {
                          showToast('error', result?.error || 'Failed to create GIF')
                        }
                      } catch (err: any) {
                        showToast('error', err?.message || 'Failed to create GIF')
                      }
                      setGifGenerating(false)
                    }}
                    disabled={gifGenerating || !gifSelectedVideo}
                    className="w-full py-3 rounded-xl bg-[var(--primary)] hover:opacity-90 disabled:opacity-50 text-white font-medium flex items-center justify-center gap-2"
                  >
                    {gifGenerating ? (
                      <>
                        <RefreshCw size={16} className="animate-spin" />
                        Creating GIF...
                      </>
                    ) : (
                      <>
                        <Sparkles size={16} />
                        Create GIF
                      </>
                    )}
                  </button>
                </div>
              )}

              {/* GIF Preview */}
              {gifPreviewUrl && gifOutputPath && (
                <div className="bg-[var(--surface)] rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-semibold">Preview</div>
                    <div className="text-xs text-[var(--muted)]">
                      {gifOutputPath.split(/[\\/]/).pop()}
                    </div>
                  </div>
                  <div className="aspect-video bg-black rounded-lg overflow-hidden">
                    <img src={gifPreviewUrl} alt="GIF Preview" className="w-full h-full object-contain" />
                  </div>

                  {/* Rename GIF */}
                  <div className="space-y-2">
                    <label className="text-xs text-[var(--muted)]">Rename GIF (optional)</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder="Enter new name..."
                        value={gifRenameValue}
                        onChange={e => setGifRenameValue(e.target.value)}
                        className="flex-1 px-3 py-2 rounded-lg bg-[var(--background)] border border-[var(--border)] text-sm"
                      />
                      <button
                        onClick={async () => {
                          if (!gifRenameValue.trim() || !gifOutputPath) return
                          try {
                            const result = await window.api.media?.renameGif?.(gifOutputPath, gifRenameValue.trim())
                            if (result?.success && result.newPath) {
                              setGifOutputPath(result.newPath)
                              const url = await toFileUrlCached(result.newPath)
                              setGifPreviewUrl(url)
                              setGifRenameValue('')
                              showToast('success', 'GIF renamed!')
                            } else {
                              showToast('error', result?.error || 'Failed to rename')
                            }
                          } catch {
                            showToast('error', 'Failed to rename GIF')
                          }
                        }}
                        disabled={!gifRenameValue.trim()}
                        className="px-4 py-2 rounded-lg bg-[var(--primary)]/20 text-[var(--primary)] text-sm hover:bg-[var(--primary)]/30 transition disabled:opacity-50"
                      >
                        <Edit2 size={14} />
                      </button>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={async () => {
                        try {
                          const result = await window.api.media?.addGifToLibrary?.(gifOutputPath)
                          if (result?.success) {
                            showToast('success', 'GIF added to library!')
                          } else {
                            showToast('error', result?.error || 'Failed to add to library')
                          }
                        } catch {
                          showToast('error', 'Failed to add to library')
                        }
                      }}
                      className="flex-1 py-2 rounded-lg bg-green-600 hover:bg-green-700 text-white text-sm font-medium"
                    >
                      Add to Library
                    </button>
                    <button
                      onClick={async () => {
                        try {
                          const result = await window.api.media?.saveGif?.(gifOutputPath)
                          if (result?.success) {
                            showToast('success', `GIF saved to ${result.savedPath}`)
                          } else if (result?.error !== 'Save cancelled') {
                            showToast('error', result?.error || 'Failed to save GIF')
                          }
                        } catch {
                          showToast('error', 'Failed to save GIF')
                        }
                      }}
                      className="flex-1 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white text-sm font-medium"
                    >
                      Save to Folder
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : activeTab === 'captioned' ? (
          <div className="space-y-4">
            <div className="text-sm font-semibold">Captioned Media ({captionedMedia.length})</div>

            {/* Edit Caption Modal */}
            {editingCaption && (
              <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
                <div className="bg-[var(--panel)] rounded-xl p-6 max-w-md w-full space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="text-lg font-semibold">Edit Caption</div>
                    <button
                      onClick={() => setEditingCaption(null)}
                      className="p-1 rounded-lg hover:bg-white/10"
                    >
                      <X size={20} />
                    </button>
                  </div>
                  <div className="text-xs text-[var(--muted)]">{editingCaption.filename}</div>
                  <div className="space-y-3">
                    <div>
                      <label className="text-xs text-[var(--muted)] block mb-1">Top Text</label>
                      <input
                        type="text"
                        value={editCaptionTop}
                        onChange={e => setEditCaptionTop(e.target.value)}
                        placeholder="Enter top caption..."
                        className="w-full px-3 py-2 rounded-lg bg-[var(--background)] border border-[var(--border)] text-sm"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-[var(--muted)] block mb-1">Bottom Text</label>
                      <input
                        type="text"
                        value={editCaptionBottom}
                        onChange={e => setEditCaptionBottom(e.target.value)}
                        placeholder="Enter bottom caption..."
                        className="w-full px-3 py-2 rounded-lg bg-[var(--background)] border border-[var(--border)] text-sm"
                      />
                    </div>
                  </div>
                  <div className="flex gap-2 pt-2">
                    <button
                      onClick={() => setEditingCaption(null)}
                      className="flex-1 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-sm"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSaveEditedCaption}
                      className="flex-1 py-2 rounded-lg bg-[var(--primary)] hover:opacity-90 text-white text-sm font-medium"
                    >
                      Save Changes
                    </button>
                  </div>
                </div>
              </div>
            )}

            {captionedMedia.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12">
                <MessageSquare size={48} className="text-[var(--muted)] mb-4" />
                <p className="text-[var(--muted)]">No captioned media yet</p>
                <p className="text-xs text-[var(--muted)] mt-1">Add captions in the editor tab</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                {captionedMedia.map(c => (
                  <div key={c.id} className="relative group">
                    <div className="aspect-video rounded-lg overflow-hidden bg-black/50 border border-[var(--border)]">
                      <CaptionedThumb
                        mediaId={c.mediaId}
                        thumbPath={c.thumbPath}
                        filename={c.filename}
                      />
                      {/* Caption preview */}
                      {c.topText && (
                        <div className="absolute top-1 left-0 right-0 text-center px-1 text-[10px] font-bold text-white drop-shadow-lg truncate">
                          {c.topText}
                        </div>
                      )}
                      {c.bottomText && (
                        <div className="absolute bottom-1 left-0 right-0 text-center px-1 text-[10px] font-bold text-white drop-shadow-lg truncate">
                          {c.bottomText}
                        </div>
                      )}
                    </div>
                    {/* Edit button */}
                    <button
                      onClick={() => handleEditCaption(c)}
                      className="absolute top-1 left-1 p-1 rounded-full bg-blue-500/80 opacity-0 group-hover:opacity-100 transition"
                      title="Edit caption"
                    >
                      <Edit2 size={12} />
                    </button>
                    {/* Delete button */}
                    <button
                      onClick={() => handleDeleteCaption(c.mediaId)}
                      className="absolute top-1 right-1 p-1 rounded-full bg-red-500/80 opacity-0 group-hover:opacity-100 transition"
                      title="Delete caption"
                    >
                      <X size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold">Caption Templates ({templates.length})</div>
              <div className="flex items-center gap-2">
                {templates.length > 0 && (
                  <button
                    onClick={handleClearAllTemplates}
                    className="px-3 py-1.5 rounded-lg bg-red-500/20 text-red-400 text-xs hover:bg-red-500/30 transition"
                  >
                    Clear All
                  </button>
                )}
                {templates.length === 0 && (
                  <button
                    onClick={handleSeedExampleCaptions}
                    className="px-3 py-1.5 rounded-lg bg-[var(--primary)]/20 text-[var(--primary)] text-xs hover:bg-[var(--primary)]/30 transition"
                  >
                    Load Example Captions
                  </button>
                )}
              </div>
            </div>
            {templates.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12">
                <Type size={48} className="text-[var(--muted)] mb-4" />
                <p className="text-[var(--muted)]">No templates yet</p>
                <p className="text-xs text-[var(--muted)] mt-1">Click "Load Example Captions" to get started</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {templates.map(t => (
                  <div
                    key={t.id}
                    className="p-4 rounded-xl bg-black/30 border border-[var(--border)] hover:border-[var(--primary)]/50 transition cursor-pointer group"
                    onClick={() => handleApplyTemplate({ top: t.topText, bottom: t.bottomText })}
                  >
                    <div className="space-y-2">
                      {t.topText && (
                        <p className="font-bold text-sm">{t.topText}</p>
                      )}
                      {t.bottomText && (
                        <p className="font-bold text-sm">{t.bottomText}</p>
                      )}
                    </div>
                    <div className="flex items-center justify-between mt-3">
                      <span className="text-xs text-[var(--muted)] bg-white/10 px-2 py-0.5 rounded">{t.category}</span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          window.api.captions?.templates?.delete?.(t.id)
                          setTemplates(prev => prev.filter(x => x.id !== t.id))
                        }}
                        className="p-1 rounded-full text-red-400 opacity-0 group-hover:opacity-100 hover:bg-red-500/20 transition"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// TikTok-style vertical swipe feed
type FeedSortMode = 'random' | 'liked' | 'newest' | 'views'

function FeedPage() {
  const { showToast } = useToast()
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
  const [infiniteMode, setInfiniteMode] = useState(false) // Auto-advance when video ends
  const [hideUI, setHideUI] = useState(false) // Hide all overlays (H key)
  const [edgeRevealMode, setEdgeRevealMode] = useState(false) // Controls only appear at edges
  const [edgeActive, setEdgeActive] = useState(false) // True when mouse near edge
  const [showSettings, setShowSettings] = useState(false) // Feed settings panel
  const [playbackSpeed, setPlaybackSpeed] = useState(1) // Video playback rate
  const [feedResolution, setFeedResolution] = useState<'original' | '720p' | '480p' | '360p'>(() => {
    const stored = localStorage.getItem('vault-feed-resolution')
    if (stored === '720p' || stored === '480p' || stored === '360p') return stored
    return 'original'
  })
  const containerRef = useRef<HTMLDivElement>(null)
  const videoRefs = useRef<Map<number, HTMLVideoElement>>(new Map())
  const hudTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const [preloadedUrls, setPreloadedUrls] = useState<Record<string, string>>({})
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 }) // Track size for windowed mode

  // ResizeObserver for windowed mode - ensures layout recalculates on resize
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect
        setContainerSize({ width, height })
      }
    })

    resizeObserver.observe(container)
    return () => resizeObserver.disconnect()
  }, [])

  // Preload URLs for the next 3 videos when current index changes (smoother playback)
  useEffect(() => {
    const preloadCount = 3
    const toPreload = videos.slice(currentIndex + 1, currentIndex + 1 + preloadCount)
      .filter(v => !preloadedUrls[v.id])

    toPreload.forEach(video => {
      window.api.media.getPlayableUrl(video.id).then((u: any) => {
        if (u) setPreloadedUrls(prev => ({ ...prev, [video.id]: u as string }))
      }).catch(() => {})
    })
  }, [currentIndex, videos]) // eslint-disable-line

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

      // Apply blacklist filtering
      try {
        const settings = await window.api.settings.get() as VaultSettings | null
        const blacklistSettings = settings?.blacklist
        if (blacklistSettings?.enabled) {
          const blacklistedIds = new Set(blacklistSettings.mediaIds || [])
          vids = vids.filter(v => !blacklistedIds.has(v.id))
        }
      } catch {}

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
      } else if (e.key === 'H' || (e.key === 'h' && e.shiftKey)) {
        // Toggle UI visibility (Shift+H)
        e.preventDefault()
        setHideUI(prev => !prev)
      } else if (e.key === 'b' || e.key === 'B') {
        // Quick bookmark at current position
        e.preventDefault()
        const video = videoRefs.current.get(currentIndex)
        const currentVideo = videos[currentIndex]
        if (video && currentVideo) {
          const time = video.currentTime
          const mins = Math.floor(time / 60)
          const secs = Math.floor(time % 60)
          window.api.invoke('bookmarks:quickAdd', currentVideo.id, time)
            .then(() => showToast('success', `Bookmarked at ${mins}:${secs.toString().padStart(2, '0')}`))
            .catch(() => showToast('error', 'Failed to add bookmark'))
        }
      } else if (e.key === 'w' || e.key === 'W') {
        // Add to Watch Later
        e.preventDefault()
        const currentVideo = videos[currentIndex]
        if (currentVideo) {
          window.api.invoke('watchLater:add', currentVideo.id)
            .then(() => showToast('success', 'Added to Watch Later'))
            .catch(() => showToast('error', 'Failed to add to Watch Later'))
        }
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [videos.length, currentIndex, videos])

  // Play/pause based on current index
  useEffect(() => {
    videoRefs.current.forEach((video, idx) => {
      if (idx === currentIndex) {
        video.playbackRate = playbackSpeed
        video.play().catch(() => {})
      } else {
        video.pause()
      }
    })
  }, [currentIndex, playbackSpeed])

  // Mouse wheel scrolling — debounced to one video per scroll gesture
  // Use capture phase to ensure we get the event before any child elements
  // Mousewheel navigation - scroll up/down to change videos
  const wheelCooldownRef = useRef(false)
  const wheelAccumulatorRef = useRef(0)
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault()
      e.stopPropagation()

      // Accumulate scroll delta for smoother trackpad support
      wheelAccumulatorRef.current += e.deltaY

      if (wheelCooldownRef.current) return

      // Lower threshold for better responsiveness (works with trackpads and scroll wheels)
      const threshold = 30
      if (Math.abs(wheelAccumulatorRef.current) < threshold) return

      wheelCooldownRef.current = true
      if (wheelAccumulatorRef.current > 0) {
        setCurrentIndex(prev => Math.min(prev + 1, videos.length - 1))
      } else {
        setCurrentIndex(prev => Math.max(prev - 1, 0))
      }
      wheelAccumulatorRef.current = 0 // Reset accumulator
      setTimeout(() => { wheelCooldownRef.current = false }, 250) // Snappier cooldown
    }
    // Use capture phase to catch events before they reach video elements
    el.addEventListener('wheel', handleWheel, { passive: false, capture: true })
    return () => el.removeEventListener('wheel', handleWheel, { capture: true })
  }, [videos.length])

  // Touch swipe navigation for mobile/tablet
  const touchStartRef = useRef<{ y: number; time: number } | null>(null)
  const touchCooldownRef = useRef(false)
  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 1) {
        touchStartRef.current = { y: e.touches[0].clientY, time: Date.now() }
      }
    }

    const handleTouchEnd = (e: TouchEvent) => {
      if (!touchStartRef.current || touchCooldownRef.current) return
      if (e.changedTouches.length !== 1) return

      const endY = e.changedTouches[0].clientY
      const deltaY = touchStartRef.current.y - endY
      const deltaTime = Date.now() - touchStartRef.current.time
      touchStartRef.current = null

      // Require minimum swipe distance (80px) and velocity
      const minSwipeDistance = 80
      const maxSwipeTime = 500 // ms

      if (Math.abs(deltaY) > minSwipeDistance && deltaTime < maxSwipeTime) {
        touchCooldownRef.current = true
        window.api.goon?.trackFeedSwipe?.() // Track for achievements
        if (deltaY > 0) {
          // Swipe up = next video
          setCurrentIndex(prev => Math.min(prev + 1, videos.length - 1))
        } else {
          // Swipe down = previous video
          setCurrentIndex(prev => Math.max(prev - 1, 0))
        }
        setTimeout(() => { touchCooldownRef.current = false }, 300)
      }
    }

    el.addEventListener('touchstart', handleTouchStart, { passive: true })
    el.addEventListener('touchend', handleTouchEnd, { passive: true })
    return () => {
      el.removeEventListener('touchstart', handleTouchStart)
      el.removeEventListener('touchend', handleTouchEnd)
    }
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

  // Edge reveal detection - show controls when mouse near edges (like GoonWall, throttled)
  // Uses container bounds instead of window bounds for proper windowed mode support
  useEffect(() => {
    if (!edgeRevealMode) {
      setEdgeActive(false)
      return
    }

    let lastRun = 0
    const throttleMs = 50

    const handleMouseMove = (e: MouseEvent) => {
      const now = Date.now()
      if (now - lastRun < throttleMs) return
      lastRun = now

      const edgeThreshold = 80
      const container = containerRef.current
      if (!container) {
        // Fallback to window dimensions
        const nearEdge =
          e.clientX < edgeThreshold ||
          e.clientX > window.innerWidth - edgeThreshold ||
          e.clientY < edgeThreshold ||
          e.clientY > window.innerHeight - edgeThreshold
        setEdgeActive(nearEdge)
        return
      }

      // Use container bounds for proper windowed mode support
      const rect = container.getBoundingClientRect()
      const relativeX = e.clientX - rect.left
      const relativeY = e.clientY - rect.top
      const nearEdge =
        relativeX < edgeThreshold ||
        relativeX > rect.width - edgeThreshold ||
        relativeY < edgeThreshold ||
        relativeY > rect.height - edgeThreshold
      setEdgeActive(nearEdge)
    }

    window.addEventListener('mousemove', handleMouseMove)
    return () => window.removeEventListener('mousemove', handleMouseMove)
  }, [edgeRevealMode])

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

  // Handle video ended - auto-advance if infinite mode is enabled
  const handleVideoEnded = useCallback(() => {
    // Update daily challenge progress for watching videos
    window.api.challenges?.updateProgress?.('watch_videos', 1)
    window.api.challenges?.updateProgress?.('unique_videos', 1)

    if (infiniteMode) {
      if (currentIndex < videos.length - 1) {
        setCurrentIndex(prev => prev + 1)
      } else {
        // Loop back to start or shuffle new feed
        shuffleFeed()
      }
    }
  }, [infiniteMode, currentIndex, videos.length, shuffleFeed])

  // Open current video in main player
  const openInPlayer = useCallback(() => {
    if (videos[currentIndex]) {
      window.dispatchEvent(new CustomEvent('vault-open-video', { detail: videos[currentIndex] }))
    }
  }, [videos, currentIndex])

  // Inline wheel handler for better event capture (must be before early returns)
  const handleWheelDirect = useCallback((e: React.WheelEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (wheelCooldownRef.current) return

    wheelAccumulatorRef.current += e.deltaY
    const threshold = 30
    if (Math.abs(wheelAccumulatorRef.current) < threshold) return

    wheelCooldownRef.current = true
    if (wheelAccumulatorRef.current > 0) {
      setCurrentIndex(prev => Math.min(prev + 1, videos.length - 1))
    } else {
      setCurrentIndex(prev => Math.max(prev - 1, 0))
    }
    wheelAccumulatorRef.current = 0
    setTimeout(() => { wheelCooldownRef.current = false }, 250)
  }, [videos.length])

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
    <div ref={containerRef} className="h-full w-full bg-black relative overflow-hidden" onMouseMove={resetHudTimeout} onWheel={handleWheelDirect}>
      {/* HUD Controls - compact top-right floating bar */}
      <div
        className={`absolute top-2 sm:top-4 right-2 sm:right-4 z-50 flex items-center gap-1 sm:gap-2 transition-opacity duration-300 ${(edgeRevealMode ? edgeActive : showHud) && !hideUI ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
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
            onClick={() => setInfiniteMode(!infiniteMode)}
            className={cn(
              "w-8 h-8 rounded-full flex items-center justify-center transition",
              infiniteMode
                ? "text-[var(--primary)] bg-[var(--primary)]/20 active-glow"
                : "text-white/70 hover:text-white hover:bg-white/10"
            )}
            title={infiniteMode ? 'Infinite Mode ON - Auto-advance when video ends' : 'Infinite Mode OFF'}
          >
            <Repeat size={16} />
          </button>
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
          <button
            onClick={() => setEdgeRevealMode(!edgeRevealMode)}
            className={cn(
              "w-8 h-8 rounded-full flex items-center justify-center transition",
              edgeRevealMode
                ? "text-[var(--primary)] bg-[var(--primary)]/20"
                : "text-white/70 hover:text-white hover:bg-white/10"
            )}
            title={edgeRevealMode ? 'Edge Reveal Mode ON - Controls show at edges' : 'Edge Reveal Mode OFF'}
          >
            <Eye size={16} />
          </button>
          <button
            onClick={() => setHideUI(true)}
            className="w-8 h-8 rounded-full flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10 transition"
            title="Hide UI (Shift+H to toggle)"
          >
            <EyeOff size={16} />
          </button>
          <button
            onClick={() => setShowSettings(!showSettings)}
            className={cn(
              "w-8 h-8 rounded-full flex items-center justify-center transition",
              showSettings
                ? "text-[var(--primary)] bg-[var(--primary)]/20"
                : "text-white/70 hover:text-white hover:bg-white/10"
            )}
            title="Settings"
          >
            <Settings size={16} />
          </button>
        </div>
      </div>

      {/* Subtle counter - bottom left */}
      <div
        className={`absolute bottom-4 left-4 z-50 flex items-center gap-2 transition-opacity duration-300 ${(edgeRevealMode ? edgeActive : showHud) && !hideUI ? 'opacity-100' : 'opacity-0'}`}
      >
        <span className="text-xs text-white/40">{currentIndex + 1} / {videos.length}</span>
        {infiniteMode && (
          <span className="text-xs text-[var(--primary)] flex items-center gap-1 active-glow px-2 py-0.5 rounded-full bg-[var(--primary)]/20">
            <Repeat size={10} />
            Infinite
          </span>
        )}
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

      {/* Settings Panel */}
      {showSettings && (
        <div className="absolute top-16 right-4 z-50 w-64 bg-black/90 backdrop-blur-xl rounded-2xl border border-white/10 overflow-hidden">
          <div className="p-4 border-b border-white/10">
            <h3 className="text-sm font-semibold text-white">Feed Settings</h3>
          </div>

          {/* Playback Speed */}
          <div className="p-4 space-y-4">
            <div>
              <div className="text-xs text-white/60 mb-2">Playback Speed</div>
              <div className="flex gap-1">
                {[0.5, 0.75, 1, 1.25, 1.5, 2].map((speed) => (
                  <button
                    key={speed}
                    onClick={() => {
                      setPlaybackSpeed(speed)
                      // Apply to current video
                      const video = videoRefs.current.get(currentIndex)
                      if (video) video.playbackRate = speed
                    }}
                    className={cn(
                      'flex-1 px-2 py-1.5 rounded text-xs transition',
                      playbackSpeed === speed
                        ? 'bg-[var(--primary)] text-white'
                        : 'bg-white/10 text-white/70 hover:bg-white/20'
                    )}
                  >
                    {speed}x
                  </button>
                ))}
              </div>
            </div>

            {/* Loop Mode Toggle */}
            <div className="flex items-center justify-between">
              <span className="text-xs text-white/60">Auto-advance</span>
              <button
                onClick={() => setInfiniteMode(!infiniteMode)}
                className={cn(
                  'w-10 h-5 rounded-full transition-colors relative',
                  infiniteMode ? 'bg-[var(--primary)]' : 'bg-white/20'
                )}
              >
                <div className={cn(
                  'absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform',
                  infiniteMode ? 'left-5' : 'left-0.5'
                )} />
              </button>
            </div>

            {/* Mute Toggle */}
            <div className="flex items-center justify-between">
              <span className="text-xs text-white/60">Muted</span>
              <button
                onClick={() => setIsMuted(!isMuted)}
                className={cn(
                  'w-10 h-5 rounded-full transition-colors relative',
                  isMuted ? 'bg-[var(--primary)]' : 'bg-white/20'
                )}
              >
                <div className={cn(
                  'absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform',
                  isMuted ? 'left-5' : 'left-0.5'
                )} />
              </button>
            </div>

            {/* Edge Reveal Mode Toggle */}
            <div className="flex items-center justify-between">
              <span className="text-xs text-white/60">Edge Reveal</span>
              <button
                onClick={() => setEdgeRevealMode(!edgeRevealMode)}
                className={cn(
                  'w-10 h-5 rounded-full transition-colors relative',
                  edgeRevealMode ? 'bg-[var(--primary)]' : 'bg-white/20'
                )}
                title="Show controls only when mouse is near screen edges"
              >
                <div className={cn(
                  'absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform',
                  edgeRevealMode ? 'left-5' : 'left-0.5'
                )} />
              </button>
            </div>

            {/* Resolution Selector */}
            <div>
              <div className="text-xs text-white/60 mb-2">Video Quality</div>
              <div className="flex gap-1">
                {(['original', '720p', '480p', '360p'] as const).map((res) => (
                  <button
                    key={res}
                    onClick={() => {
                      setFeedResolution(res)
                      localStorage.setItem('vault-feed-resolution', res)
                    }}
                    className={cn(
                      'flex-1 px-2 py-1.5 rounded text-xs transition',
                      feedResolution === res
                        ? 'bg-[var(--primary)] text-white'
                        : 'bg-white/10 text-white/70 hover:bg-white/20'
                    )}
                  >
                    {res === 'original' ? 'Full' : res}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Video container - render current + adjacent for preloading */}
      <div className="h-full w-full relative">
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
                preloadedUrl={preloadedUrls[video.id]}
                onVideoRef={(el) => {
                  if (el) videoRefs.current.set(index, el)
                  else videoRefs.current.delete(index)
                }}
                isLiked={likedIds.has(video.id)}
                onToggleLike={() => toggleLike(video.id)}
                onSkip={skipToNext}
                onOpenInPlayer={openInPlayer}
                infiniteMode={infiniteMode}
                onVideoEnded={handleVideoEnded}
                resolution={feedResolution}
              />
            </div>
          )
        })}
      </div>

      {/* Side navigation - left side to avoid overlap with action buttons */}
      <div className={`absolute left-2 sm:left-4 top-1/2 -translate-y-1/2 z-50 flex flex-col gap-2 transition-opacity duration-300 ${hideUI ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
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

      {/* Hidden UI indicator - click anywhere or press Shift+H to restore */}
      {hideUI && (
        <div
          className="absolute inset-0 z-40 cursor-pointer"
          onClick={() => setHideUI(false)}
        >
          <div className="absolute bottom-4 right-4 text-xs text-white/30 pointer-events-none">
            Click or Shift+H to show UI
          </div>
        </div>
      )}
    </div>
  )
}

// Individual feed item
const FeedItem = React.memo(function FeedItem(props: {
  video: MediaRow
  index: number
  isActive: boolean
  preloadedUrl?: string
  onVideoRef: (el: HTMLVideoElement | null) => void
  isLiked: boolean
  onToggleLike: () => void
  onSkip: () => void
  onOpenInPlayer?: () => void
  infiniteMode?: boolean
  onVideoEnded?: () => void
  resolution?: 'original' | '720p' | '480p' | '360p'
}) {
  const { video, isActive, preloadedUrl, onVideoRef, isLiked, onToggleLike, onSkip, onOpenInPlayer, infiniteMode, onVideoEnded, resolution = 'original' } = props
  const { showToast } = useToast()
  const [showPlaylistPopup, setShowPlaylistPopup] = useState(false)
  const feedPlaylistBtnRef = useRef<HTMLButtonElement>(null)
  const [url, setUrl] = useState(preloadedUrl || '')
  const [loading, setLoading] = useState(true)
  const [transcodeRetried, setTranscodeRetried] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [retryCount, setRetryCount] = useState(0)
  // Double-tap to like
  const [showHeartAnimation, setShowHeartAnimation] = useState(false)
  const lastTapRef = useRef<number>(0)
  const doubleTapTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  // Progress bar and bookmarks
  const [progress, setProgress] = useState(0)
  const [duration, setDuration] = useState(0)
  const [bookmarks, setBookmarks] = useState<Array<{ id: string; timestamp: number; title: string }>>([])
  const videoElementRef = useRef<HTMLVideoElement | null>(null)

  // Load bookmarks for this video
  useEffect(() => {
    window.api.invoke('bookmarks:getForMedia', video.id)
      .then((items: any) => setBookmarks(items || []))
      .catch(() => setBookmarks([]))
  }, [video.id])

  // Track video progress
  const handleTimeUpdate = useCallback(() => {
    if (videoElementRef.current) {
      setProgress(videoElementRef.current.currentTime)
      setDuration(videoElementRef.current.duration || 0)
    }
  }, [])

  // Enhanced video ref callback
  const handleVideoRef = useCallback((el: HTMLVideoElement | null) => {
    videoElementRef.current = el
    onVideoRef(el)
    if (el) {
      el.addEventListener('timeupdate', handleTimeUpdate)
      el.addEventListener('loadedmetadata', () => setDuration(el.duration || 0))
    }
  }, [onVideoRef, handleTimeUpdate])

  const handleDoubleTap = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    // Ignore if clicking on buttons or other interactive elements
    if ((e.target as HTMLElement).closest('button')) return

    const now = Date.now()
    const timeSinceLastTap = now - lastTapRef.current
    lastTapRef.current = now

    // Double tap detection (within 300ms)
    if (timeSinceLastTap < 300 && timeSinceLastTap > 0) {
      if (doubleTapTimeoutRef.current) clearTimeout(doubleTapTimeoutRef.current)

      // Show heart animation
      setShowHeartAnimation(true)
      setTimeout(() => setShowHeartAnimation(false), 800)

      // Track for achievements
      window.api.goon?.trackDoubleTapLike?.()

      // Like if not already liked
      if (!isLiked) {
        onToggleLike()
      }
    }
  }, [isLiked, onToggleLike])

  useEffect(() => {
    if (preloadedUrl && resolution === 'original') { setUrl(preloadedUrl); setLoadError(null); return }
    let alive = true
    setTranscodeRetried(false)
    setLoadError(null)
    ;(async () => {
      try {
        // Use lower resolution if specified
        if (resolution !== 'original') {
          const heightMap: Record<string, number> = { '720p': 720, '480p': 480, '360p': 360 }
          const targetHeight = heightMap[resolution] || 720
          const u = await window.api.media.getLowResUrl?.(video.id, targetHeight)
          if (alive && u) { setUrl(u as string); return }
        }
        // Original quality or fallback
        const u = await window.api.media.getPlayableUrl(video.id)
        if (alive && u) { setUrl(u as string); return }
      } catch (e) {
        console.error('[Feed] Failed to get playable URL:', video.id, e)
      }
      // Fallback to direct file URL
      const u = await toFileUrlCached(video.path)
      if (alive) setUrl(u)
    })()
    return () => { alive = false }
  }, [video.id, video.path, preloadedUrl, resolution, retryCount])

  const filename = video.filename || video.path.split(/[/\\]/).pop() || 'Unknown'

  return (
    <div
      className="h-full w-full flex items-center justify-center bg-black relative"
      onClick={handleDoubleTap}
      onTouchEnd={handleDoubleTap}
    >
      {/* Double-tap heart animation */}
      {showHeartAnimation && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-50">
          <Heart
            className="w-24 h-24 sm:w-32 sm:h-32 text-red-500 animate-heart-pop"
            fill="currentColor"
            style={{
              animation: 'heartPop 0.8s ease-out forwards',
            }}
          />
        </div>
      )}

      {/* Video - fill height, maintain aspect ratio */}
      {url && (
        <video
          ref={handleVideoRef}
          src={url}
          className="h-full w-full object-contain"
          autoPlay={isActive}
          muted={!isActive}
          loop={!infiniteMode}
          playsInline
          preload={isActive ? 'auto' : 'metadata'}
          onCanPlay={() => setLoading(false)}
          onEnded={() => {
            if (isActive && infiniteMode && onVideoEnded) {
              onVideoEnded()
            }
          }}
          onError={(e) => {
            console.error('[Feed] Video playback error:', video.id, video.filename, e)
            // Retry with force transcode before showing error
            if (!transcodeRetried) {
              setTranscodeRetried(true)
              window.api.media.getPlayableUrl(video.id, true).then((u: any) => {
                if (u) {
                  console.log('[Feed] Force transcode succeeded for', video.id)
                  setUrl(u as string)
                } else {
                  console.error('[Feed] Force transcode returned null for', video.id)
                  setLoading(false)
                  setLoadError('Video format not supported')
                }
              }).catch((err: unknown) => {
                console.error('[Feed] Force transcode failed:', video.id, err)
                setLoading(false)
                setLoadError('Failed to transcode video')
              })
              return
            }
            setLoading(false)
            setLoadError('Video failed to load')
          }}
        />
      )}

      {/* Progress bar with bookmark markers */}
      {isActive && duration > 0 && (
        <div
          className="absolute bottom-0 left-0 right-0 h-1 bg-white/20 cursor-pointer group z-20"
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect()
            const percent = (e.clientX - rect.left) / rect.width
            if (videoElementRef.current) {
              videoElementRef.current.currentTime = percent * duration
            }
          }}
        >
          {/* Progress fill */}
          <div
            className="h-full bg-[var(--primary)] transition-all duration-100"
            style={{ width: `${(progress / duration) * 100}%` }}
          />
          {/* Bookmark markers */}
          {bookmarks.map((bm) => (
            <div
              key={bm.id}
              className="absolute top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-yellow-400 cursor-pointer hover:scale-150 transition-transform"
              style={{ left: `${(bm.timestamp / duration) * 100}%` }}
              title={bm.title || `Bookmark at ${formatDuration(bm.timestamp)}`}
              onClick={(e) => {
                e.stopPropagation()
                if (videoElementRef.current) {
                  videoElementRef.current.currentTime = bm.timestamp
                }
              }}
            />
          ))}
          {/* Hover expand */}
          <div className="absolute inset-x-0 -top-2 h-5 group-hover:bg-black/20 transition-colors" />
        </div>
      )}

      {/* Loading state */}
      {loading && !loadError && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-white/20 border-t-white/60 rounded-full animate-spin" />
        </div>
      )}

      {/* Error state */}
      {loadError && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 text-center p-4">
          <AlertTriangle className="w-12 h-12 text-orange-400 mb-4" />
          <p className="text-white font-medium mb-2">{loadError}</p>
          <p className="text-white/60 text-sm mb-4 max-w-xs truncate">{filename}</p>
          <div className="flex gap-2">
            <button
              onClick={() => {
                setLoadError(null)
                setLoading(true)
                setTranscodeRetried(false)
                setRetryCount(prev => prev + 1)
              }}
              className="px-4 py-2 rounded-lg bg-[var(--primary)] text-white hover:opacity-90 transition flex items-center gap-2"
            >
              <RefreshCw size={16} />
              Retry
            </button>
            <button
              onClick={onSkip}
              className="px-4 py-2 rounded-lg bg-white/10 text-white hover:bg-white/20 transition"
            >
              Skip
            </button>
          </div>
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
        <button
          onClick={async () => {
            try {
              await window.api.invoke('watchLater:add', video.id)
              showToast('success', 'Added to Watch Later')
            } catch {
              showToast('error', 'Failed to add to Watch Later')
            }
          }}
          className="w-9 h-9 sm:w-12 sm:h-12 rounded-full bg-black/85 backdrop-blur-md flex items-center justify-center text-white/80 hover:text-white hover:bg-black/60 transition"
          title="Add to Watch Later (W)"
        >
          <Clock className="w-4 h-4 sm:w-6 sm:h-6" />
        </button>
        <button
          onClick={async () => {
            if (videoElementRef.current) {
              const time = videoElementRef.current.currentTime
              const mins = Math.floor(time / 60)
              const secs = Math.floor(time % 60)
              try {
                await window.api.invoke('bookmarks:quickAdd', video.id, time)
                // Reload bookmarks
                const items = await window.api.invoke('bookmarks:getForMedia', video.id)
                setBookmarks(items || [])
                showToast('success', `Bookmarked at ${mins}:${secs.toString().padStart(2, '0')}`)
              } catch {
                showToast('error', 'Failed to add bookmark')
              }
            }
          }}
          className="w-9 h-9 sm:w-12 sm:h-12 rounded-full bg-black/85 backdrop-blur-md flex items-center justify-center text-white/80 hover:text-white hover:bg-black/60 transition"
          title="Bookmark Current Position (B)"
        >
          <Bookmark className="w-4 h-4 sm:w-6 sm:h-6" />
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

// ═══════════════════════════════════════════════════════════════════════════
// DOWNLOADS PAGE - Full page URL downloader
// ═══════════════════════════════════════════════════════════════════════════

type VideoQualityOption = 'best' | '1080p' | '720p' | '480p' | 'audio'

interface DownloadItemType {
  id: string
  url: string
  title: string
  status: 'queued' | 'downloading' | 'processing' | 'completed' | 'error'
  progress: number
  speed: string
  eta: string
  outputPath: string | null
  error: string | null
  thumbnailUrl: string | null
  fileSize: string | null
  duration: string | null
  createdAt: number
  source: 'desktop' | 'mobile'
}

function DownloadsPage() {
  const { showToast } = useToast()
  const [downloads, setDownloads] = useState<DownloadItemType[]>([])
  const [urlInput, setUrlInput] = useState('')
  const [isAvailable, setIsAvailable] = useState<boolean | null>(null)
  const [ytdlpVersion, setYtdlpVersion] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [quality, setQuality] = useState<VideoQualityOption>('best')
  const [autoImport, setAutoImport] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const autoImportRef = useRef(autoImport)

  useEffect(() => { autoImportRef.current = autoImport }, [autoImport])

  // Check yt-dlp availability
  const checkAvailability = useCallback(async () => {
    try {
      const result = await window.api.urlDownloader.checkAvailability()
      setIsAvailable(result.available)
      setYtdlpVersion(result.version || null)
    } catch {
      setIsAvailable(false)
    }
  }, [])

  // Load downloads
  const loadDownloads = useCallback(async () => {
    try {
      const items = await window.api.urlDownloader.getDownloads()
      setDownloads(items)
    } catch (e) {
      console.error('Failed to load downloads:', e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    checkAvailability()
    loadDownloads()
    inputRef.current?.focus()
  }, [checkAvailability, loadDownloads])

  // Subscribe to events
  useEffect(() => {
    const unsubs = [
      window.api.urlDownloader.onAdded((item: DownloadItemType) => {
        setDownloads(prev => [item, ...prev])
      }),
      window.api.urlDownloader.onStarted((item: DownloadItemType) => {
        setDownloads(prev => prev.map(d => d.id === item.id ? item : d))
      }),
      window.api.urlDownloader.onProgress((item: DownloadItemType) => {
        setDownloads(prev => prev.map(d => d.id === item.id ? item : d))
      }),
      window.api.urlDownloader.onCompleted(async (item: DownloadItemType) => {
        setDownloads(prev => prev.map(d => d.id === item.id ? item : d))
        if (autoImportRef.current) {
          try {
            const result = await window.api.urlDownloader.importToLibrary(item.id)
            if (result.success) {
              showToast('success', `Auto-imported: ${item.title}`)
            }
          } catch (e) {
            console.error('Auto-import failed:', e)
          }
        }
      }),
      window.api.urlDownloader.onError((item: DownloadItemType) => {
        setDownloads(prev => prev.map(d => d.id === item.id ? item : d))
      }),
      window.api.urlDownloader.onCancelled((item: DownloadItemType) => {
        setDownloads(prev => prev.map(d => d.id === item.id ? item : d))
      }),
    ]
    return () => unsubs.forEach(fn => fn())
  }, [showToast])

  const handleAddDownload = async () => {
    const url = urlInput.trim()
    if (!url) return
    try { new URL(url) } catch { showToast('error', 'Please enter a valid URL'); return }

    setAdding(true)
    try {
      const result = await window.api.urlDownloader.addDownload(url, {
        quality: quality === 'audio' ? 'best' : quality,
        audioOnly: quality === 'audio'
      })
      if (result.success) {
        setUrlInput('')
        showToast('success', 'Download added to queue')
      } else {
        showToast('error', `Failed: ${result.error}`)
      }
    } catch (e: unknown) {
      showToast('error', (e as Error).message || 'Failed to add download')
    } finally {
      setAdding(false)
    }
  }

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText()
      if (text) { setUrlInput(text.trim()); inputRef.current?.focus(); showToast('info', 'Pasted from clipboard') }
    } catch { showToast('error', 'Clipboard access denied') }
  }

  const handleRemove = async (id: string) => {
    await window.api.urlDownloader.removeDownload(id)
    setDownloads(prev => prev.filter(d => d.id !== id))
  }

  const handleCancel = async (id: string) => {
    await window.api.urlDownloader.cancelDownload(id)
  }

  const handleOpenFolder = async (id: string) => {
    await window.api.urlDownloader.openDownload(id)
  }

  const handleImport = async (id: string) => {
    const result = await window.api.urlDownloader.importToLibrary(id)
    if (result.success) { showToast('success', 'Imported to library') }
    else { showToast('error', `Import failed: ${result.error}`) }
  }

  const handleClearCompleted = async () => {
    await window.api.urlDownloader.clearCompleted()
    loadDownloads()
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'queued': return <Clock className="w-5 h-5 text-gray-400" />
      case 'downloading':
      case 'processing': return <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />
      case 'completed': return <CheckCircle2 className="w-5 h-5 text-green-500" />
      case 'error': return <AlertCircle className="w-5 h-5 text-red-500" />
      default: return <Download className="w-5 h-5 text-gray-400" />
    }
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="p-6 border-b border-[var(--border)]">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <Download className="w-8 h-8 text-[var(--primary)]" />
            <div>
              <h1 className="text-2xl font-bold">Downloads</h1>
              <p className="text-sm text-[var(--muted)]">Download videos from URLs using yt-dlp</p>
            </div>
          </div>
          {ytdlpVersion && (
            <span className="text-xs text-[var(--muted)] bg-[var(--surface)] px-3 py-1 rounded-full">
              yt-dlp {ytdlpVersion}
            </span>
          )}
        </div>

        {isAvailable === false && (
          <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg flex items-center gap-2 text-red-400 text-sm">
            <AlertCircle className="w-4 h-4" />
            <span>yt-dlp not found. Please install it or check the bundled version.</span>
          </div>
        )}

        {/* URL Input */}
        <div className="flex gap-3">
          <div className="flex-1 relative">
            <Link className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[var(--muted)]" />
            <input
              ref={inputRef}
              type="text"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddDownload()}
              placeholder="Paste video URL here..."
              className="w-full pl-12 pr-4 py-3 bg-[var(--surface)] border border-[var(--border)] rounded-xl text-[var(--text)] placeholder-[var(--muted)] focus:outline-none focus:border-[var(--primary)]"
              disabled={!isAvailable}
            />
          </div>
          <select
            value={quality}
            onChange={(e) => setQuality(e.target.value as VideoQualityOption)}
            className="px-4 py-3 bg-[var(--surface)] border border-[var(--border)] rounded-xl text-[var(--text)] focus:outline-none focus:border-[var(--primary)] cursor-pointer"
          >
            <option value="best">Best Quality</option>
            <option value="1080p">1080p</option>
            <option value="720p">720p</option>
            <option value="480p">480p</option>
            <option value="audio">Audio Only</option>
          </select>
          <button
            onClick={handlePaste}
            className="px-4 py-3 bg-[var(--surface)] border border-[var(--border)] rounded-xl text-[var(--muted)] hover:text-[var(--text)] hover:border-[var(--primary)] transition-colors"
            title="Paste from clipboard"
          >
            <Clipboard className="w-5 h-5" />
          </button>
          <button
            onClick={handleAddDownload}
            disabled={!urlInput.trim() || adding || !isAvailable}
            className="px-6 py-3 bg-[var(--primary)] hover:bg-[var(--primary)]/80 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl text-white font-medium transition-colors flex items-center gap-2"
          >
            {adding ? <Loader2 className="w-5 h-5 animate-spin" /> : <Download className="w-5 h-5" />}
            <span>Download</span>
          </button>
        </div>

        {/* Options */}
        <div className="mt-3 flex items-center justify-between text-sm">
          <span className="text-[var(--muted)]">Supports 1000+ sites including Twitter/X, YouTube, and more</span>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={autoImport}
              onChange={(e) => setAutoImport(e.target.checked)}
              className="w-4 h-4 rounded border-[var(--border)] bg-[var(--surface)] text-[var(--primary)] focus:ring-[var(--primary)]"
            />
            <span className="text-[var(--muted)]">Auto-import to library</span>
          </label>
        </div>
      </div>

      {/* Downloads List */}
      <div className="flex-1 overflow-y-auto p-6">
        {loading ? (
          <div className="flex items-center justify-center h-48">
            <Loader2 className="w-8 h-8 text-[var(--muted)] animate-spin" />
          </div>
        ) : downloads.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-[var(--muted)]">
            <Download className="w-16 h-16 mb-4 opacity-30" />
            <p className="text-lg">No downloads yet</p>
            <p className="text-sm">Paste a URL above to start downloading</p>
          </div>
        ) : (
          <div className="space-y-3">
            {downloads.map((item) => (
              <div key={item.id} className="p-4 bg-[var(--surface)] border border-[var(--border)] rounded-xl hover:border-[var(--primary)]/30 transition-colors">
                <div className="flex items-start gap-4">
                  {/* Thumbnail or Status Icon */}
                  <div className="flex-shrink-0 w-24 h-16 bg-black/30 rounded-lg overflow-hidden flex items-center justify-center">
                    {item.thumbnailUrl ? (
                      <img src={item.thumbnailUrl} alt="" className="w-full h-full object-cover" />
                    ) : (
                      getStatusIcon(item.status)
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-medium text-[var(--text)] truncate" title={item.title}>
                        {item.title}
                      </h3>
                      {item.source === 'mobile' && (
                        <span className="px-2 py-0.5 bg-purple-500/20 text-purple-400 text-[10px] rounded-full">Mobile</span>
                      )}
                    </div>

                    {/* Progress Bar */}
                    {(item.status === 'downloading' || item.status === 'processing') && (
                      <div className="mt-2">
                        <div className="flex items-center justify-between text-xs text-[var(--muted)] mb-1">
                          <span>{item.progress.toFixed(1)}%</span>
                          <span>{item.speed && `${item.speed}`} {item.eta && `• ETA ${item.eta}`}</span>
                        </div>
                        <div className="h-2 bg-black/30 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-[var(--primary)] transition-all duration-300"
                            style={{ width: `${item.progress}%` }}
                          />
                        </div>
                      </div>
                    )}

                    {/* Info */}
                    <div className="mt-1 flex items-center gap-4 text-xs text-[var(--muted)]">
                      {item.fileSize && <span>{item.fileSize}</span>}
                      {item.duration && <span>{item.duration}</span>}
                      {item.status === 'error' && <span className="text-red-400">{item.error || 'Download failed'}</span>}
                      {item.status === 'completed' && <span className="text-green-400">Completed</span>}
                      {item.status === 'queued' && <span>Queued</span>}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2">
                    {item.status === 'completed' && (
                      <>
                        <button
                          onClick={() => handleOpenFolder(item.id)}
                          className="px-3 py-1.5 bg-[var(--surface)] hover:bg-[var(--border)] border border-[var(--border)] rounded-lg text-sm flex items-center gap-1.5"
                        >
                          <FolderOpen className="w-4 h-4" />
                          Open
                        </button>
                        <button
                          onClick={() => handleImport(item.id)}
                          className="px-3 py-1.5 bg-[var(--primary)]/20 hover:bg-[var(--primary)]/30 border border-[var(--primary)]/30 rounded-lg text-sm text-[var(--primary)] flex items-center gap-1.5"
                        >
                          <FolderPlus className="w-4 h-4" />
                          Import
                        </button>
                      </>
                    )}
                    {(item.status === 'downloading' || item.status === 'queued') && (
                      <button
                        onClick={() => handleCancel(item.id)}
                        className="px-3 py-1.5 bg-[var(--surface)] hover:bg-red-500/20 border border-[var(--border)] hover:border-red-500/30 rounded-lg text-sm text-[var(--muted)] hover:text-red-400"
                      >
                        Cancel
                      </button>
                    )}
                    <button
                      onClick={() => handleRemove(item.id)}
                      className="p-2 hover:bg-red-500/20 rounded-lg text-[var(--muted)] hover:text-red-400"
                      title="Remove"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      {downloads.some(d => d.status === 'completed' || d.status === 'error') && (
        <div className="p-4 border-t border-[var(--border)]">
          <button
            onClick={handleClearCompleted}
            className="w-full py-2 bg-[var(--surface)] hover:bg-[var(--border)] border border-[var(--border)] rounded-xl text-sm text-[var(--muted)] hover:text-[var(--text)] transition-colors"
          >
            Clear Completed
          </button>
        </div>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// PLAYLISTS PAGE
// ═══════════════════════════════════════════════════════════════════════════

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
  const { showToast } = useToast()
  const [playlists, setPlaylists] = useState<PlaylistRow[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [items, setItems] = useState<any[]>([])
  const [newName, setNewName] = useState('')
  const [renaming, setRenaming] = useState<string | null>(null)
  const [renamingValue, setRenamingValue] = useState('')
  const [dragIdx, setDragIdx] = useState<number | null>(null)
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null) // Visual feedback for drop target
  const [draggedMediaId, setDraggedMediaId] = useState<string | null>(null) // For dragging between playlists
  const [dropTargetPlaylistId, setDropTargetPlaylistId] = useState<string | null>(null) // Visual feedback for playlist drop target
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [openMediaId, setOpenMediaId] = useState<string | null>(null)
  const [sortBy, setSortBy] = useState<PlaylistSortBy>('manual')
  const [typeFilter, setTypeFilter] = useState<'all' | 'video' | 'image' | 'gif'>('all')
  const [showAddMedia, setShowAddMedia] = useState(false)
  const [allMedia, setAllMedia] = useState<MediaRow[]>([])
  const [mediaSearch, setMediaSearch] = useState('')
  const [addingMedia, setAddingMedia] = useState(false)
  // AI Playlist Generation
  const [showAiGenerator, setShowAiGenerator] = useState(false)
  const [aiTags, setAiTags] = useState<string[]>([])
  const [aiPrompt, setAiPrompt] = useState('')
  const [aiDuration, setAiDuration] = useState(30) // minutes
  const [aiIntensity, setAiIntensity] = useState<'chill' | 'medium' | 'intense'>('medium')
  const [aiGenerating, setAiGenerating] = useState(false)
  const [availableTags, setAvailableTags] = useState<Array<{ name: string; count: number }>>([])
  const [aiContentFilter, setAiContentFilter] = useState<'all' | 'video' | 'image' | 'gif'>('video')

  // Smart Playlist Creation
  const [showSmartPlaylistModal, setShowSmartPlaylistModal] = useState(false)
  const [smartName, setSmartName] = useState('')
  const [smartIncludeTags, setSmartIncludeTags] = useState<string[]>([])
  const [smartExcludeTags, setSmartExcludeTags] = useState<string[]>([])
  const [smartType, setSmartType] = useState<'video' | 'image' | 'gif' | ''>('')
  const [smartMinRating, setSmartMinRating] = useState(0)
  const [smartLimit, setSmartLimit] = useState(100)
  const [smartSortBy, setSmartSortBy] = useState<'addedAt' | 'rating' | 'views' | 'random'>('addedAt')
  const [smartSortDir, setSmartSortDir] = useState<'asc' | 'desc'>('desc')
  const [smartCreating, setSmartCreating] = useState(false)

  // Playlist statistics cache (item count, duration, thumbnail)
  const [playlistStats, setPlaylistStats] = useState<Map<string, { count: number; durationSec: number; thumbPath?: string }>>(new Map())

  // Session Templates
  const [showTemplates, setShowTemplates] = useState(false)
  const SESSION_TEMPLATES = [
    { id: 'quick', name: 'Quick Session', icon: '⚡', duration: 10, intensity: 'medium' as const, description: '10 min warm-up' },
    { id: 'chill', name: 'Chill Mode', icon: '🌙', duration: 30, intensity: 'chill' as const, description: 'Relaxed 30 min' },
    { id: 'intense', name: 'Intense', icon: '🔥', duration: 45, intensity: 'intense' as const, description: 'High energy 45 min' },
    { id: 'marathon', name: 'Marathon', icon: '🏃', duration: 90, intensity: 'medium' as const, description: 'Extended 90 min' },
    { id: 'edging', name: 'Edge Session', icon: '💜', duration: 60, intensity: 'intense' as const, description: '60 min edging focus' },
  ]

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

  // Load statistics for all playlists (count, duration, thumbnail)
  const loadPlaylistStats = async (playlistList: PlaylistRow[]) => {
    const stats = new Map<string, { count: number; durationSec: number; thumbPath?: string }>()
    await Promise.all(playlistList.map(async (pl) => {
      try {
        const its = await window.api.playlists.getItems(pl.id)
        const count = its.length
        const durationSec = its.reduce((sum: number, item: any) => {
          return sum + (item.media?.durationSec ?? item.durationSec ?? 0)
        }, 0)
        const firstItem = its[0]
        const thumbPath = firstItem?.media?.thumbPath ?? firstItem?.thumbPath
        stats.set(pl.id, { count, durationSec, thumbPath })
      } catch {
        stats.set(pl.id, { count: 0, durationSec: 0 })
      }
    }))
    setPlaylistStats(stats)
  }

  // Create playlist from template
  const createFromTemplate = async (template: typeof SESSION_TEMPLATES[0]) => {
    try {
      setAiDuration(template.duration)
      setAiIntensity(template.intensity)
      setShowTemplates(false)
      setShowAiGenerator(true)
    } catch (err: any) {
      showToast('error', err?.message ?? 'Failed to create from template')
    }
  }

  useEffect(() => {
    void refresh()
    // Load available tags for AI generator
    window.api.tags.listWithCounts().then((tags: any) => {
      setAvailableTags(tags?.filter?.((t: any) => t.videoCount > 0) || [])
    })
    const unsub = window.api.events?.onVaultChanged?.(() => {
      void refresh()
      if (selectedId) void loadItems(selectedId)
    })
    return () => unsub?.()
  }, [])

  // Load playlist stats when playlists change
  useEffect(() => {
    if (playlists.length > 0) {
      void loadPlaylistStats(playlists)
    }
  }, [playlists])

  useEffect(() => {
    if (selectedId) void loadItems(selectedId)
    else setItems([])
  }, [selectedId])

  // Keyboard shortcuts for playlist navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't handle shortcuts when typing in inputs
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return

      if (e.key === 'n' && !e.ctrlKey && !e.metaKey) {
        // 'n' for new playlist - focus the input
        const input = document.querySelector('input[placeholder="New playlist..."]') as HTMLInputElement
        if (input) {
          e.preventDefault()
          input.focus()
        }
      } else if (e.key === 'a' && !e.ctrlKey && !e.metaKey && selectedId) {
        // 'a' to add videos to selected playlist
        e.preventDefault()
        openAddMedia()
      } else if (e.key === 'g' && !e.ctrlKey && !e.metaKey) {
        // 'g' for AI generate
        e.preventDefault()
        setShowAiGenerator(true)
      } else if (e.key === 'ArrowUp' && playlists.length > 0) {
        // Arrow up to select previous playlist
        e.preventDefault()
        const currentIdx = playlists.findIndex(p => p.id === selectedId)
        const prevIdx = currentIdx <= 0 ? playlists.length - 1 : currentIdx - 1
        setSelectedId(playlists[prevIdx].id)
      } else if (e.key === 'ArrowDown' && playlists.length > 0) {
        // Arrow down to select next playlist
        e.preventDefault()
        const currentIdx = playlists.findIndex(p => p.id === selectedId)
        const nextIdx = currentIdx < 0 || currentIdx >= playlists.length - 1 ? 0 : currentIdx + 1
        setSelectedId(playlists[nextIdx].id)
      } else if (e.key === 'Delete' && selectedId && !e.ctrlKey && !e.metaKey) {
        // Delete to remove selected playlist (with confirmation)
        e.preventDefault()
        const playlist = playlists.find(p => p.id === selectedId)
        if (confirm(`Delete playlist "${playlist?.name}"?`)) {
          deletePlaylist(selectedId)
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [playlists, selectedId])

  const createPlaylist = async () => {
    if (!newName.trim()) return
    try {
      const created = await window.api.playlists.create(newName.trim())
      setNewName('')
      await refresh()
      if (created?.id) setSelectedId(created.id)
      // Update daily challenge progress for creating playlists
      window.api.challenges?.updateProgress?.('create_playlist', 1)
    } catch (err: any) {
      console.error('[PlaylistsPage] Failed to create playlist:', err)
      setError(err?.message ?? 'Failed to create playlist')
    }
  }

  const deletePlaylist = async (id: string) => {
    try {
      await window.api.playlists.delete(id)
      if (selectedId === id) setSelectedId(null)
      await refresh()
      showToast('success', 'Playlist deleted')
    } catch (err: any) {
      console.error('[PlaylistsPage] Failed to delete playlist:', err)
      showToast('error', err?.message ?? 'Failed to delete playlist')
    }
  }

  const renamePlaylist = async (id: string) => {
    if (!renamingValue.trim()) return
    try {
      await window.api.playlists.rename(id, renamingValue.trim())
      setRenaming(null)
      await refresh()
      showToast('success', 'Playlist renamed')
    } catch (err: any) {
      console.error('[PlaylistsPage] Failed to rename playlist:', err)
      showToast('error', err?.message ?? 'Failed to rename playlist')
    }
  }

  const duplicatePlaylist = async (id: string) => {
    try {
      await window.api.playlists.duplicate(id)
      await refresh()
      showToast('success', 'Playlist duplicated')
    } catch (err: any) {
      console.error('[PlaylistsPage] Failed to duplicate playlist:', err)
      showToast('error', err?.message ?? 'Failed to duplicate playlist')
    }
  }

  const exportM3U = async (id: string) => {
    try {
      const path = await window.api.playlists.exportM3U(id)
      if (path) {
        window.api.shell?.showItemInFolder?.(path)
        showToast('success', 'Playlist exported as M3U')
      }
    } catch (err: any) {
      console.error('[PlaylistsPage] Failed to export M3U:', err)
      showToast('error', err?.message ?? 'Failed to export playlist')
    }
  }

  const exportJSON = async (id: string) => {
    try {
      const result = await window.api.playlists.exportJSON?.(id)
      if (result?.success && result.path) {
        window.api.shell?.showItemInFolder?.(result.path)
        showToast('success', 'Playlist exported as JSON')
      }
    } catch (err: any) {
      console.error('[PlaylistsPage] Failed to export JSON:', err)
      showToast('error', err?.message ?? 'Failed to export playlist')
    }
  }

  const importPlaylist = async () => {
    const result = await window.api.playlists.importJSON?.()
    if (result?.success) {
      await refresh()
      if (result.playlist?.id) {
        setSelectedId(result.playlist.id)
      }
      alert(`Imported playlist! Matched ${result.matched} of ${result.total} items.`)
    } else if (result?.error) {
      alert(`Import failed: ${result.error}`)
    }
  }

  // Smart Playlist functions
  const createSmartPlaylist = async () => {
    if (!smartName.trim()) {
      showToast('error', 'Please enter a name for the smart playlist')
      return
    }
    if (smartIncludeTags.length === 0 && smartMinRating === 0 && !smartType) {
      showToast('error', 'Please add at least one rule (tags, rating, or type)')
      return
    }

    setSmartCreating(true)
    try {
      const rules = {
        includeTags: smartIncludeTags.length > 0 ? smartIncludeTags : undefined,
        excludeTags: smartExcludeTags.length > 0 ? smartExcludeTags : undefined,
        type: smartType || undefined,
        minRating: smartMinRating > 0 ? smartMinRating : undefined,
        limit: smartLimit,
        sortBy: smartSortBy,
        sortDir: smartSortDir
      }

      const playlist = await window.api.smartPlaylists?.create?.(smartName.trim(), rules)
      if (playlist?.id) {
        showToast('success', `Created smart playlist with ${playlist.itemCount || 0} items!`)
        setShowSmartPlaylistModal(false)
        setSmartName('')
        setSmartIncludeTags([])
        setSmartExcludeTags([])
        setSmartType('')
        setSmartMinRating(0)
        setSmartLimit(100)
        setSmartSortBy('addedAt')
        setSmartSortDir('desc')
        await refresh()
        setSelectedId(playlist.id)
      }
    } catch (err: any) {
      showToast('error', err?.message || 'Failed to create smart playlist')
    } finally {
      setSmartCreating(false)
    }
  }

  const refreshSmartPlaylist = async (playlistId: string) => {
    try {
      const result = await window.api.smartPlaylists?.refresh?.(playlistId)
      if (result) {
        showToast('success', `Refreshed! Now has ${result.updated} items`)
        await loadItems(playlistId)
      }
    } catch (err: any) {
      showToast('error', 'Failed to refresh smart playlist')
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
      // Update daily challenge progress for adding to playlist
      window.api.challenges?.updateProgress?.('add_to_playlist', 1)
      await loadItems(selectedId)
    } catch (err: any) {
      console.error('[PlaylistsPage] Failed to add media:', err)
    } finally {
      setAddingMedia(false)
    }
  }

  // AI Playlist Generation - creates playlist based on tags/prompt
  const generateAiPlaylist = async () => {
    if (aiGenerating) return
    setAiGenerating(true)
    try {
      // Calculate approximate video count based on duration
      // Assuming average video is ~3 minutes
      const targetCount = Math.ceil((aiDuration * 60) / 180)

      // Generate playlist name based on settings
      const intensityEmoji = aiIntensity === 'chill' ? '🌙' : aiIntensity === 'intense' ? '🔥' : '💜'
      const playlistName = aiPrompt?.trim()
        ? `${intensityEmoji} ${aiPrompt.trim().slice(0, 30)}`
        : aiTags.length > 0
          ? `${intensityEmoji} ${aiTags.slice(0, 2).join(' & ')} Mix`
          : `${intensityEmoji} ${aiDuration}min ${aiIntensity} session`

      // Create the playlist
      const created = await window.api.playlists.create(playlistName)
      if (!created?.id) throw new Error('Failed to create playlist')

      // Fetch media matching criteria
      let media: MediaRow[] = []
      if (aiTags.length > 0) {
        // Get media by tags
        const result = await window.api.media.randomByTags(aiTags, { limit: targetCount * 2 })
        media = (Array.isArray(result) ? result : [])
          .filter((m: any) => aiContentFilter === 'all' || m.type === aiContentFilter)
          .slice(0, targetCount)
      } else {
        // Random selection
        const result = await window.api.media.list({ limit: targetCount * 2, sortBy: 'random' })
        const items = extractItems<MediaRow>(result)
        media = items
          .filter((m: any) => aiContentFilter === 'all' || m.type === aiContentFilter)
          .slice(0, targetCount)
      }

      // Sort by intensity if specified
      if (aiIntensity === 'chill' && media.length > 1) {
        // Shorter videos first for chill
        media.sort((a, b) => (a.durationSec ?? 0) - (b.durationSec ?? 0))
      } else if (aiIntensity === 'intense' && media.length > 1) {
        // Longer videos for intense
        media.sort((a, b) => (b.durationSec ?? 0) - (a.durationSec ?? 0))
      }

      // Add media to playlist
      if (media.length > 0) {
        await window.api.playlists.addItems(created.id, media.map(m => m.id))
        // Update daily challenge progress for creating playlist and adding items
        window.api.challenges?.updateProgress?.('create_playlist', 1)
        window.api.challenges?.updateProgress?.('add_to_playlist', media.length)
      }

      // Refresh and select new playlist
      await refresh()
      setSelectedId(created.id)
      setShowAiGenerator(false)

      // Reset form
      setAiTags([])
      setAiPrompt('')
    } catch (err: any) {
      console.error('[PlaylistsPage] AI generation failed:', err)
      setError(err?.message ?? 'Failed to generate playlist')
    } finally {
      setAiGenerating(false)
    }
  }

  const toggleAiTag = (tagName: string) => {
    setAiTags(prev => prev.includes(tagName) ? prev.filter(t => t !== tagName) : [...prev, tagName])
  }

  const handleDragStart = (idx: number, mediaId: string) => {
    setDragIdx(idx)
    setDraggedMediaId(mediaId)
  }

  const handleDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault()
    if (dragIdx === null || dragIdx === idx) return
    setDragOverIdx(idx)
  }

  const handleDragLeave = () => {
    setDragOverIdx(null)
  }

  const handleDragEnd = () => {
    setDragIdx(null)
    setDragOverIdx(null)
    setDraggedMediaId(null)
    setDropTargetPlaylistId(null)
  }

  // Handlers for dragging items to other playlists
  const handlePlaylistDragOver = (e: React.DragEvent, playlistId: string) => {
    e.preventDefault()
    if (!draggedMediaId || playlistId === selectedId) return
    setDropTargetPlaylistId(playlistId)
  }

  const handlePlaylistDragLeave = () => {
    setDropTargetPlaylistId(null)
  }

  const handlePlaylistDrop = async (e: React.DragEvent, targetPlaylistId: string) => {
    e.preventDefault()
    setDropTargetPlaylistId(null)
    if (!draggedMediaId || targetPlaylistId === selectedId) {
      setDraggedMediaId(null)
      setDragIdx(null)
      return
    }
    // Add the dragged media to the target playlist
    try {
      await window.api.playlists.addItems(targetPlaylistId, [draggedMediaId])
      // Update daily challenge progress for adding to playlist
      window.api.challenges?.updateProgress?.('add_to_playlist', 1)
      // Show feedback - find playlist name
      const targetPlaylist = playlists.find(p => p.id === targetPlaylistId)
      if (targetPlaylist) {
        showToast('success', `Added to "${targetPlaylist.name}"`)
      }
    } catch (err) {
      console.error('[Playlists] Failed to add to playlist:', err)
      showToast('error', 'Failed to add to playlist')
    }
    setDraggedMediaId(null)
    setDragIdx(null)
  }

  const handleDrop = async (e: React.DragEvent, targetIdx: number) => {
    e.preventDefault()
    setDragOverIdx(null)
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
          <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap justify-end">
            <Btn onClick={importPlaylist} title="Import playlist">
              <ArrowUp size={14} />
              <span className="hidden sm:inline">Import</span>
            </Btn>
            {selectedId && (
              <>
                <Btn onClick={() => duplicatePlaylist(selectedId)} title="Duplicate playlist">
                  <span className="hidden sm:inline">Duplicate</span>
                  <span className="sm:hidden">Copy</span>
                </Btn>
                <Btn onClick={() => exportJSON(selectedId)} title="Export as JSON">
                  <Download size={14} />
                  <span className="hidden sm:inline">Export</span>
                </Btn>
                <Btn onClick={() => exportM3U(selectedId)} title="Export as M3U">M3U</Btn>
                <Btn
                  onClick={async () => {
                    // Get video items from current playlist
                    const videoItems = items
                      .filter((item: any) => (item.media?.type || item.type) === 'video')
                      .map((item: any) => ({
                        mediaId: item.media?.id || item.mediaId || item.id,
                        path: item.media?.path || item.path,
                        title: item.media?.filename || item.filename || 'Vault Video',
                        duration: item.media?.durationSec || item.durationSec
                      }))
                    if (videoItems.length === 0) {
                      showToast('info', 'No videos in this playlist')
                      return
                    }
                    await window.api.dlna?.setQueue?.(videoItems)
                    showToast('success', `Added ${videoItems.length} videos to TV queue`)
                    // Open TV Remote panel if available
                    window.dispatchEvent(new CustomEvent('vault-open-tv-remote'))
                  }}
                  title="Cast playlist to TV"
                >
                  <Tv size={14} />
                  <span className="hidden sm:inline">Cast</span>
                </Btn>
                <Btn tone="danger" onClick={() => deletePlaylist(selectedId)} title="Delete playlist">
                  <Trash2 size={14} className="sm:hidden" />
                  <span className="hidden sm:inline">Delete</span>
                </Btn>
              </>
            )}
          </div>
        }
      />

      <div className="flex-1 flex overflow-hidden min-h-0">
        {/* Playlist sidebar - responsive width */}
        <div className="w-[220px] sm:w-[260px] md:w-[280px] shrink-0 border-r border-[var(--border)] bg-[var(--panel2)] overflow-auto">
          <div className="p-4">
            {/* Create new */}
            <div className="flex gap-2 mb-3">
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && createPlaylist()}
                placeholder="New playlist..."
                className="flex-1 px-3 py-2 rounded-xl bg-black/20 border border-[var(--border)] outline-none focus:border-white/15 text-sm"
              />
              <Btn tone="primary" onClick={createPlaylist}>+</Btn>
            </div>

            {/* AI Generate and Smart Playlist Buttons */}
            <div className="space-y-2 mb-4">
              <button
                onClick={() => setShowAiGenerator(true)}
                className="w-full px-4 py-3 rounded-xl bg-gradient-to-r from-purple-500/20 to-pink-500/20 border border-purple-500/30 hover:border-purple-500/50 transition-all group"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
                    <Sparkles size={16} className="text-white" />
                  </div>
                  <div className="text-left flex-1">
                    <div className="text-sm font-medium text-white group-hover:text-purple-200 transition">AI Generate</div>
                    <div className="text-xs text-white/50">Create playlist from tags</div>
                  </div>
                </div>
              </button>

              <button
                onClick={() => setShowSmartPlaylistModal(true)}
                className="w-full px-4 py-3 rounded-xl bg-gradient-to-r from-cyan-500/20 to-blue-500/20 border border-cyan-500/30 hover:border-cyan-500/50 transition-all group"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-500 flex items-center justify-center">
                    <Zap size={16} className="text-white" />
                  </div>
                  <div className="text-left flex-1">
                    <div className="text-sm font-medium text-white group-hover:text-cyan-200 transition">Smart Playlist</div>
                    <div className="text-xs text-white/50">Auto-updates based on rules</div>
                  </div>
                </div>
              </button>
            </div>

            {/* Session Templates */}
            <div className="mb-4">
              <button
                onClick={() => setShowTemplates(!showTemplates)}
                className="w-full px-3 py-2 rounded-lg bg-black/20 border border-[var(--border)] hover:border-white/20 transition flex items-center justify-between"
              >
                <span className="text-xs text-[var(--muted)]">Quick Start Templates</span>
                <ChevronDown size={12} className={cn('text-[var(--muted)] transition-transform', showTemplates && 'rotate-180')} />
              </button>
              {showTemplates && (
                <div className="mt-2 grid grid-cols-2 gap-2">
                  {SESSION_TEMPLATES.map(t => (
                    <button
                      key={t.id}
                      onClick={() => createFromTemplate(t)}
                      className="p-2 rounded-lg bg-black/30 border border-[var(--border)] hover:border-white/20 transition text-left"
                    >
                      <div className="text-lg mb-1">{t.icon}</div>
                      <div className="text-xs font-medium">{t.name}</div>
                      <div className="text-[10px] text-[var(--muted)]">{t.description}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Playlist list */}
            <div className="space-y-1.5">
              {playlists.map((p) => {
                const stats = playlistStats.get(p.id)
                const duration = stats?.durationSec ?? 0
                const durationStr = duration > 0 ? formatDuration(duration) : ''
                return (
                <div
                  key={p.id}
                  onClick={() => setSelectedId(p.id)}
                  onDragOver={(e) => handlePlaylistDragOver(e, p.id)}
                  onDragLeave={handlePlaylistDragLeave}
                  onDrop={(e) => handlePlaylistDrop(e, p.id)}
                  className={cn(
                    'px-3 py-2.5 rounded-xl cursor-pointer transition border group',
                    selectedId === p.id
                      ? 'bg-white/10 border-white/15'
                      : 'border-transparent hover:bg-white/5',
                    dropTargetPlaylistId === p.id && p.id !== selectedId && 'ring-2 ring-green-500 bg-green-500/10 border-green-500/30'
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
                    <div className="flex items-center gap-3">
                      {/* Thumbnail preview */}
                      <div className="w-10 h-10 rounded-lg bg-black/40 overflow-hidden shrink-0 flex items-center justify-center">
                        {stats?.thumbPath ? (
                          <img
                            src={`vault://${stats.thumbPath}`}
                            alt=""
                            className="w-full h-full object-cover"
                            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                          />
                        ) : (
                          <ListMusic size={16} className="text-[var(--muted)]" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          {p.isSmart === 1 && (
                            <span title="Smart Playlist"><Zap size={10} className="text-cyan-400 shrink-0" /></span>
                          )}
                          <span className="text-sm font-medium truncate">{p.name}</span>
                        </div>
                        <div className="text-[10px] text-[var(--muted)] flex items-center gap-2">
                          <span>{stats?.count ?? 0} items</span>
                          {durationStr && <span>• {durationStr}</span>}
                        </div>
                      </div>
                      {dropTargetPlaylistId === p.id && p.id !== selectedId && (
                        <span className="text-xs text-green-400 flex items-center gap-1">
                          <Plus size={12} /> Add
                        </span>
                      )}
                      {p.isSmart === 1 && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            refreshSmartPlaylist(p.id)
                          }}
                          className="text-xs text-cyan-400 hover:text-cyan-200 p-1 opacity-0 group-hover:opacity-100"
                          title="Refresh smart playlist"
                        >
                          <RefreshCw size={12} />
                        </button>
                      )}
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          setRenaming(p.id)
                          setRenamingValue(p.name)
                        }}
                        className="text-xs text-[var(--muted)] hover:text-white opacity-0 group-hover:opacity-100 p-1"
                        title="Rename"
                      >
                        <Edit2 size={12} />
                      </button>
                    </div>
                  )}
                </div>
              )})}
              {playlists.length === 0 && (
                <div className="text-center py-8">
                  <ListMusic size={32} className="mx-auto mb-3 text-[var(--muted)] opacity-50" />
                  <div className="text-sm text-[var(--muted)] mb-2">No sessions yet</div>
                  <div className="text-xs text-white/30 mb-3">Create your first playlist or use a template</div>
                  <div className="flex justify-center gap-2">
                    <kbd className="px-2 py-1 rounded bg-white/10 text-[10px] font-mono">N</kbd>
                    <span className="text-xs text-white/30">New playlist</span>
                  </div>
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
              <div className="mb-4 flex flex-col gap-3">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="min-w-0">
                    <h2 className="text-xl sm:text-2xl font-bold flex items-center gap-2 truncate">
                      {selectedPlaylist.isSmart === 1 && <Zap size={20} className="text-cyan-400 shrink-0" />}
                      <span className="truncate">{selectedPlaylist.name}</span>
                    </h2>
                    <div className="text-sm text-[var(--muted)] mt-1 flex items-center gap-3 flex-wrap">
                      <span>{items.length} {items.length === 1 ? 'item' : 'items'}</span>
                      {(() => {
                        const totalDuration = items.reduce((sum: number, item: any) => {
                          return sum + (item.media?.durationSec ?? item.durationSec ?? 0)
                        }, 0)
                        return totalDuration > 0 ? <span>• {formatDuration(totalDuration)} total</span> : null
                      })()}
                      {selectedPlaylist.isSmart === 1 && <span className="text-cyan-400 text-xs">Smart Playlist</span>}
                    </div>
                  </div>
                </div>
                {/* Filters and actions row - wraps on narrow screens */}
                <div className="flex items-center gap-2 flex-wrap">
                  {/* Type filter buttons */}
                  <div className="flex gap-1 shrink-0">
                    {(['all', 'video', 'image', 'gif'] as const).map((t) => (
                      <button
                        key={t}
                        onClick={() => setTypeFilter(t)}
                        className={cn(
                          'px-2 py-1 sm:px-2.5 sm:py-1.5 rounded-lg text-[10px] sm:text-xs border transition',
                          typeFilter === t
                            ? 'bg-white/10 border-white/20 text-white font-medium'
                            : 'border-[var(--border)] text-[var(--muted)] hover:border-white/15 hover:text-white'
                        )}
                      >
                        {t === 'all' ? 'All' : t === 'video' ? 'Videos' : t === 'image' ? 'Images' : 'GIFs'}
                      </button>
                    ))}
                  </div>
                  <div className="w-px h-4 bg-[var(--border)] hidden sm:block" />
                  {/* Sort buttons */}
                  <div className="flex gap-1 shrink-0">
                    {(['manual', 'name', 'duration', 'added', 'random'] as PlaylistSortBy[]).map((s) => (
                      <button
                        key={s}
                        onClick={() => setSortBy(s)}
                        className={cn(
                          'px-2 py-1 sm:px-2.5 sm:py-1.5 rounded-lg text-[10px] sm:text-xs border transition',
                          sortBy === s
                            ? 'bg-white/10 border-white/20 text-white font-medium'
                            : 'border-[var(--border)] text-[var(--muted)] hover:border-white/15 hover:text-white'
                        )}
                      >
                        {s.charAt(0).toUpperCase() + s.slice(1)}
                      </button>
                    ))}
                  </div>
                  <div className="flex-1" />
                  {sortedItems.length > 0 && (
                    <>
                      <Btn
                        onClick={() => {
                          // Play the first video in the filtered/sorted list
                          const firstItem = sortedItems[0]
                          const mediaId = firstItem?.media?.id ?? firstItem?.mediaId
                          if (mediaId) setOpenMediaId(mediaId)
                        }}
                        className="flex items-center gap-1.5"
                        title="Play all videos in order"
                      >
                        <Play size={14} />
                        Play
                      </Btn>
                      <Btn
                        onClick={() => {
                          // Shuffle and play a random video
                          const randomIdx = Math.floor(Math.random() * sortedItems.length)
                          const randomItem = sortedItems[randomIdx]
                          const mediaId = randomItem?.media?.id ?? randomItem?.mediaId
                          if (mediaId) {
                            setSortBy('random') // Switch to random sort
                            setOpenMediaId(mediaId)
                          }
                        }}
                        className="flex items-center gap-1.5"
                        title="Shuffle and play"
                      >
                        <Shuffle size={14} />
                        Shuffle
                      </Btn>
                    </>
                  )}
                  <Btn tone="primary" onClick={openAddMedia} className="flex items-center gap-1.5">
                    <Plus size={14} />
                    Add Videos
                  </Btn>
                </div>
              </div>

              {/* Mosaic grid - responsive columns for narrow windows */}
              <div
                className="grid"
                style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(200px, 100%), 1fr))', gap: '12px' }}
              >
                {sortedItems.map((item: any, idx: number) => {
                  const mediaId = item.media?.id ?? item.mediaId
                  const isPlaying = openMediaId === mediaId
                  return (
                    <div
                      key={item.playlistItemId}
                      draggable={true}
                      onDragStart={() => handleDragStart(idx, mediaId)}
                      onDragOver={sortBy === 'manual' ? (e) => { e.preventDefault(); handleDragOver(e, idx) } : undefined}
                      onDragLeave={sortBy === 'manual' ? handleDragLeave : undefined}
                      onDragEnd={sortBy === 'manual' ? handleDragEnd : undefined}
                      onDrop={sortBy === 'manual' ? (e) => handleDrop(e, idx) : undefined}
                      onClick={() => { if (mediaId) setOpenMediaId(mediaId) }}
                      className={cn(
                        'relative rounded-xl border bg-black/20 overflow-hidden group cursor-pointer transition-all duration-200',
                        'hover:scale-[1.02] hover:z-10 hover:shadow-xl hover:shadow-black/40',
                        dragIdx === idx && 'opacity-50 scale-95 ring-2 ring-[var(--primary)]',
                        dragOverIdx === idx && dragIdx !== idx && 'ring-2 ring-green-500 ring-offset-2 ring-offset-black scale-[1.03]',
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
                        <div className="absolute top-1.5 left-1.5 p-1 rounded bg-black/60 backdrop-blur-sm text-white/50 cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-100 transition hover:text-white/80">
                          <GripVertical size={14} />
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
              <div className="text-lg font-medium text-[var(--muted)]">Select a session</div>
              <div className="text-sm text-[var(--text-subtle)] mt-2 max-w-xs">
                Choose a playlist from the sidebar or use a quick-start template
              </div>
              <div className="flex gap-4 mt-6 text-xs text-white/30">
                <div className="flex items-center gap-1.5">
                  <kbd className="px-1.5 py-0.5 rounded bg-white/10 font-mono text-[10px]">↑↓</kbd>
                  <span>Navigate</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <kbd className="px-1.5 py-0.5 rounded bg-white/10 font-mono text-[10px]">N</kbd>
                  <span>New</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <kbd className="px-1.5 py-0.5 rounded bg-white/10 font-mono text-[10px]">G</kbd>
                  <span>Generate</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Add Videos Modal */}
      {showAddMedia && selectedId && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
          <div className="w-full max-w-[700px] max-h-[80vh] rounded-3xl border border-white/10 bg-[var(--panel)] overflow-hidden shadow-2xl flex flex-col">
            <div className="px-4 sm:px-6 py-4 border-b border-[var(--border)] flex items-center justify-between gap-3 shrink-0 flex-wrap">
              <div className="text-sm font-semibold">Add Videos to Playlist</div>
              <div className="flex items-center gap-2 sm:gap-3 flex-1 sm:flex-none justify-end">
                <input
                  value={mediaSearch}
                  onChange={(e) => setMediaSearch(e.target.value)}
                  placeholder="Search..."
                  className="px-3 py-1.5 rounded-xl bg-black/20 border border-[var(--border)] outline-none focus:border-white/15 text-xs w-32 sm:w-48"
                />
                <Btn onClick={() => setShowAddMedia(false)}>Done</Btn>
              </div>
            </div>
            <div className="flex-1 overflow-auto p-3 sm:p-4">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-3">
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

      {/* AI Playlist Generator Modal */}
      {showAiGenerator && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
          <div className="w-full max-w-[600px] max-h-[85vh] rounded-3xl border border-purple-500/30 bg-[var(--panel)] overflow-hidden shadow-2xl flex flex-col">
            {/* Header */}
            <div className="px-6 py-4 border-b border-[var(--border)] bg-gradient-to-r from-purple-500/10 to-pink-500/10">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
                    <Sparkles size={20} className="text-white" />
                  </div>
                  <div>
                    <div className="font-semibold">AI Playlist Generator</div>
                    <div className="text-xs text-[var(--muted)]">Create a playlist based on your preferences</div>
                  </div>
                </div>
                <button
                  onClick={() => setShowAiGenerator(false)}
                  className="p-2 rounded-lg hover:bg-white/10 transition"
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-auto p-6 space-y-6">
              {/* Session Duration */}
              <div>
                <label className="text-sm font-medium mb-2 block">Session Duration</label>
                <div className="flex items-center gap-4">
                  <input
                    type="range"
                    min={10}
                    max={120}
                    step={5}
                    value={aiDuration}
                    onChange={(e) => setAiDuration(Number(e.target.value))}
                    className="flex-1 h-2 accent-purple-500 cursor-pointer"
                  />
                  <span className="text-sm font-medium w-20 text-right">{aiDuration} min</span>
                </div>
                <div className="flex justify-between mt-1 text-xs text-[var(--muted)]">
                  <span>Quick</span>
                  <span>Marathon</span>
                </div>
              </div>

              {/* Intensity */}
              <div>
                <label className="text-sm font-medium mb-2 block">Intensity</label>
                <div className="grid grid-cols-3 gap-2">
                  {(['chill', 'medium', 'intense'] as const).map(intensity => (
                    <button
                      key={intensity}
                      onClick={() => setAiIntensity(intensity)}
                      className={cn(
                        'py-3 rounded-xl border transition-all',
                        aiIntensity === intensity
                          ? intensity === 'chill' ? 'bg-blue-500/20 border-blue-500/50 text-blue-300'
                            : intensity === 'intense' ? 'bg-red-500/20 border-red-500/50 text-red-300'
                            : 'bg-purple-500/20 border-purple-500/50 text-purple-300'
                          : 'border-[var(--border)] hover:border-white/20'
                      )}
                    >
                      <div className="text-lg mb-1">
                        {intensity === 'chill' ? '🌙' : intensity === 'intense' ? '🔥' : '💜'}
                      </div>
                      <div className="text-xs font-medium capitalize">{intensity}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Content Type */}
              <div>
                <label className="text-sm font-medium mb-2 block">Content Type</label>
                <div className="flex gap-2">
                  {(['video', 'image', 'gif', 'all'] as const).map(type => (
                    <button
                      key={type}
                      onClick={() => setAiContentFilter(type)}
                      className={cn(
                        'px-4 py-2 rounded-lg border text-sm transition',
                        aiContentFilter === type
                          ? 'bg-white/10 border-white/20 text-white'
                          : 'border-[var(--border)] text-[var(--muted)] hover:border-white/15'
                      )}
                    >
                      {type === 'all' ? 'All' : type === 'video' ? 'Videos' : type === 'image' ? 'Images' : 'GIFs'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Tags Selection */}
              <div>
                <label className="text-sm font-medium mb-2 block">
                  Tags (Optional)
                  {aiTags.length > 0 && <span className="text-[var(--muted)] ml-2">({aiTags.length} selected)</span>}
                </label>
                <div className="max-h-40 overflow-auto rounded-xl border border-[var(--border)] bg-black/20 p-3">
                  <div className="flex flex-wrap gap-2">
                    {availableTags.slice(0, 50).map(tag => (
                      <button
                        key={tag.name}
                        onClick={() => toggleAiTag(tag.name)}
                        className={cn(
                          'px-3 py-1.5 rounded-lg text-xs transition',
                          aiTags.includes(tag.name)
                            ? 'bg-purple-500 text-white'
                            : 'bg-white/5 text-[var(--muted)] hover:bg-white/10'
                        )}
                      >
                        {tag.name}
                        <span className="ml-1 opacity-50">({tag.count})</span>
                      </button>
                    ))}
                    {availableTags.length === 0 && (
                      <div className="text-xs text-[var(--muted)] py-2">No tags available - add tags to your media first</div>
                    )}
                  </div>
                </div>
              </div>

              {/* Custom Prompt (Optional) */}
              <div>
                <label className="text-sm font-medium mb-2 block">Custom Name (Optional)</label>
                <input
                  type="text"
                  value={aiPrompt}
                  onChange={(e) => setAiPrompt(e.target.value)}
                  placeholder="e.g., Late Night Vibes, Sunday Funday..."
                  className="w-full px-4 py-3 rounded-xl bg-black/30 border border-[var(--border)] text-sm focus:outline-none focus:border-purple-500/50"
                />
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-[var(--border)] flex items-center justify-between">
              <button
                onClick={() => {
                  setAiTags([])
                  setAiPrompt('')
                  setAiDuration(30)
                  setAiIntensity('medium')
                }}
                className="text-sm text-[var(--muted)] hover:text-white transition"
              >
                Reset
              </button>
              <div className="flex gap-3">
                <Btn onClick={() => setShowAiGenerator(false)}>Cancel</Btn>
                <button
                  onClick={generateAiPlaylist}
                  disabled={aiGenerating}
                  className={cn(
                    'px-6 py-2.5 rounded-xl font-medium text-sm transition-all',
                    'bg-gradient-to-r from-purple-500 to-pink-500 text-white',
                    'hover:from-purple-400 hover:to-pink-400',
                    'disabled:opacity-50 disabled:cursor-not-allowed',
                    'flex items-center gap-2'
                  )}
                >
                  {aiGenerating ? (
                    <>
                      <RefreshCw size={16} className="animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <Sparkles size={16} />
                      Generate Playlist
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Smart Playlist Creation Modal */}
      {showSmartPlaylistModal && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
          <div className="w-full max-w-[550px] max-h-[85vh] rounded-3xl border border-cyan-500/30 bg-[var(--panel)] overflow-hidden shadow-2xl flex flex-col">
            {/* Header */}
            <div className="px-6 py-4 border-b border-[var(--border)] bg-gradient-to-r from-cyan-500/10 to-blue-500/10">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-500 flex items-center justify-center">
                    <Zap size={20} className="text-white" />
                  </div>
                  <div>
                    <div className="font-semibold">Smart Playlist</div>
                    <div className="text-xs text-[var(--muted)]">Auto-updates when library changes</div>
                  </div>
                </div>
                <button
                  onClick={() => setShowSmartPlaylistModal(false)}
                  className="p-2 rounded-lg hover:bg-white/10 transition"
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-auto p-6 space-y-5">
              {/* Name */}
              <div>
                <label className="text-sm font-medium mb-2 block">Playlist Name</label>
                <input
                  value={smartName}
                  onChange={(e) => setSmartName(e.target.value)}
                  placeholder="My Smart Playlist"
                  className="w-full px-4 py-2.5 rounded-xl bg-black/20 border border-[var(--border)] outline-none focus:border-cyan-500/50 text-sm"
                />
              </div>

              {/* Include Tags */}
              <div>
                <label className="text-sm font-medium mb-2 block">Include Tags (any of these)</label>
                <div className="flex flex-wrap gap-2 mb-2 min-h-[32px] p-2 rounded-xl bg-black/20 border border-[var(--border)]">
                  {smartIncludeTags.map(tag => (
                    <span key={tag} className="px-2 py-1 rounded bg-cyan-500/20 text-cyan-300 text-xs flex items-center gap-1">
                      {tag}
                      <button onClick={() => setSmartIncludeTags(t => t.filter(x => x !== tag))} className="hover:text-white">
                        <X size={12} />
                      </button>
                    </span>
                  ))}
                  {smartIncludeTags.length === 0 && <span className="text-xs text-[var(--muted)]">No tags selected</span>}
                </div>
                <div className="flex flex-wrap gap-1 max-h-32 overflow-auto">
                  {availableTags.filter(t => !smartIncludeTags.includes(t.name)).slice(0, 30).map(t => (
                    <button
                      key={t.name}
                      onClick={() => setSmartIncludeTags(prev => [...prev, t.name])}
                      className="px-2 py-1 rounded bg-black/30 text-xs hover:bg-white/10 transition"
                    >
                      {t.name}
                    </button>
                  ))}
                </div>
              </div>

              {/* Exclude Tags */}
              <div>
                <label className="text-sm font-medium mb-2 block">Exclude Tags (none of these)</label>
                <div className="flex flex-wrap gap-2 mb-2 min-h-[32px] p-2 rounded-xl bg-black/20 border border-[var(--border)]">
                  {smartExcludeTags.map(tag => (
                    <span key={tag} className="px-2 py-1 rounded bg-red-500/20 text-red-300 text-xs flex items-center gap-1">
                      {tag}
                      <button onClick={() => setSmartExcludeTags(t => t.filter(x => x !== tag))} className="hover:text-white">
                        <X size={12} />
                      </button>
                    </span>
                  ))}
                  {smartExcludeTags.length === 0 && <span className="text-xs text-[var(--muted)]">No exclusions</span>}
                </div>
                <div className="flex flex-wrap gap-1 max-h-24 overflow-auto">
                  {availableTags.filter(t => !smartExcludeTags.includes(t.name) && !smartIncludeTags.includes(t.name)).slice(0, 20).map(t => (
                    <button
                      key={t.name}
                      onClick={() => setSmartExcludeTags(prev => [...prev, t.name])}
                      className="px-2 py-1 rounded bg-black/30 text-xs hover:bg-red-500/20 transition"
                    >
                      {t.name}
                    </button>
                  ))}
                </div>
              </div>

              {/* Type Filter */}
              <div>
                <label className="text-sm font-medium mb-2 block">Media Type</label>
                <div className="flex gap-2">
                  {[{ value: '', label: 'All' }, { value: 'video', label: 'Videos' }, { value: 'image', label: 'Images' }, { value: 'gif', label: 'GIFs' }].map(opt => (
                    <button
                      key={opt.value}
                      onClick={() => setSmartType(opt.value as '' | 'video' | 'image' | 'gif')}
                      className={cn(
                        'px-4 py-2 rounded-lg border text-sm transition',
                        smartType === opt.value
                          ? 'bg-cyan-500/20 border-cyan-500/50 text-cyan-300'
                          : 'border-[var(--border)] text-[var(--muted)] hover:border-white/15'
                      )}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Min Rating */}
              <div>
                <label className="text-sm font-medium mb-2 block">Minimum Rating</label>
                <div className="flex items-center gap-3">
                  {[0, 1, 2, 3, 4, 5].map(r => (
                    <button
                      key={r}
                      onClick={() => setSmartMinRating(r)}
                      className={cn(
                        'px-3 py-1.5 rounded-lg border text-sm transition',
                        smartMinRating === r
                          ? 'bg-yellow-500/20 border-yellow-500/50 text-yellow-300'
                          : 'border-[var(--border)] text-[var(--muted)] hover:border-white/15'
                      )}
                    >
                      {r === 0 ? 'Any' : `${r}+`}
                    </button>
                  ))}
                </div>
              </div>

              {/* Sort & Limit */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium mb-2 block">Sort By</label>
                  <select
                    value={smartSortBy}
                    onChange={(e) => setSmartSortBy(e.target.value as 'addedAt' | 'rating' | 'views' | 'random')}
                    className="w-full px-3 py-2 rounded-xl bg-black/30 border border-[var(--border)] text-sm"
                  >
                    <option value="addedAt">Date Added</option>
                    <option value="rating">Rating</option>
                    <option value="views">Views</option>
                    <option value="random">Random</option>
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium mb-2 block">Max Items</label>
                  <select
                    value={smartLimit}
                    onChange={(e) => setSmartLimit(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-xl bg-black/30 border border-[var(--border)] text-sm"
                  >
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                    <option value={200}>200</option>
                    <option value={500}>500</option>
                    <option value={1000}>1000</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-[var(--border)] bg-black/20">
              <button
                onClick={createSmartPlaylist}
                disabled={smartCreating}
                className="w-full py-3 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-500 text-white font-medium hover:opacity-90 transition disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {smartCreating ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    <Zap size={16} />
                    Create Smart Playlist
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function SessionMediaThumb(props: { media: MediaRow }) {
  const [url, setUrl] = useState('')
  const [error, setError] = useState(false)
  const mediaId = props.media.id

  useEffect(() => {
    let alive = true
    setUrl('')
    setError(false)

    const thumbPath = props.media.thumbPath
    if (thumbPath) {
      toFileUrlCached(thumbPath)
        .then(u => { if (alive) setUrl(u) })
        .catch(() => { if (alive) setError(true) })
    } else if (mediaId) {
      // No thumbPath — request on-demand thumbnail generation
      window.api.media.generateThumb(mediaId)
        .then((generatedPath: string | null) => {
          if (!alive || !generatedPath) {
            if (alive) setError(true)
            return
          }
          return toFileUrlCached(generatedPath)
        })
        .then((u?: string) => { if (alive && u) setUrl(u) })
        .catch(() => { if (alive) setError(true) })
    } else {
      setError(true)
    }

    return () => { alive = false }
  }, [props.media.thumbPath, mediaId])

  return (
    <div className="aspect-video bg-black/30">
      {url ? (
        <img src={url} alt="" className="w-full h-full object-cover" />
      ) : error ? (
        <div className="w-full h-full flex items-center justify-center text-xs text-[var(--muted)]">No thumb</div>
      ) : (
        <div className="w-full h-full flex items-center justify-center">
          <div className="w-4 h-4 border-2 border-white/20 border-t-white/60 rounded-full animate-spin" />
        </div>
      )}
    </div>
  )
}

function PlaylistItemThumb(props: { item: any }) {
  const [url, setUrl] = useState('')
  const [error, setError] = useState(false)
  const item = props.item
  const mediaId = item.media?.id ?? item.mediaId ?? item.id

  useEffect(() => {
    let alive = true
    setUrl('')
    setError(false)

    const thumbPath = item.media?.thumbPath ?? item.thumbPath
    if (thumbPath) {
      toFileUrlCached(thumbPath)
        .then(u => { if (alive) setUrl(u) })
        .catch(() => { if (alive) setError(true) })
    } else if (mediaId) {
      // No thumbPath — request on-demand thumbnail generation
      window.api.media.generateThumb(mediaId)
        .then((generatedPath: string | null) => {
          if (!alive || !generatedPath) {
            if (alive) setError(true)
            return
          }
          return toFileUrlCached(generatedPath)
        })
        .then((u?: string) => { if (alive && u) setUrl(u) })
        .catch(() => { if (alive) setError(true) })
    } else {
      setError(true)
    }

    return () => { alive = false }
  }, [item.media?.thumbPath, item.thumbPath, mediaId])

  return (
    <div className="w-16 h-10 rounded-lg bg-black/30 overflow-hidden flex-shrink-0">
      {url ? (
        <img src={url} alt="" className="w-full h-full object-cover" />
      ) : error ? (
        <div className="w-full h-full flex items-center justify-center text-xs text-[var(--muted)]" />
      ) : (
        <div className="w-full h-full flex items-center justify-center">
          <div className="w-3 h-3 border border-white/20 border-t-white/60 rounded-full animate-spin" />
        </div>
      )}
    </div>
  )
}

function PlaylistGridThumb(props: { item: any }) {
  const [url, setUrl] = useState('')
  const [error, setError] = useState(false)
  const item = props.item
  const mediaId = item.media?.id ?? item.mediaId ?? item.id

  useEffect(() => {
    let alive = true
    setUrl('')
    setError(false)

    const thumbPath = item.media?.thumbPath ?? item.thumbPath
    if (thumbPath) {
      // Try to load existing thumbnail
      toFileUrlCached(thumbPath)
        .then(u => { if (alive) setUrl(u) })
        .catch(() => { if (alive) setError(true) })
    } else if (mediaId) {
      // No thumbPath — request on-demand thumbnail generation
      window.api.media.generateThumb(mediaId)
        .then((generatedPath: string | null) => {
          if (!alive || !generatedPath) {
            if (alive) setError(true)
            return
          }
          return toFileUrlCached(generatedPath)
        })
        .then((u?: string) => { if (alive && u) setUrl(u) })
        .catch(() => { if (alive) setError(true) })
    } else {
      setError(true)
    }

    return () => { alive = false }
  }, [item.media?.thumbPath, item.thumbPath, mediaId])

  return (
    <div className="bg-black/30 overflow-hidden" style={{ aspectRatio: '16 / 10' }}>
      {url ? (
        <img src={url} alt="" className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-110" />
      ) : error ? (
        <div className="w-full h-full flex items-center justify-center text-2xl opacity-30">🎬</div>
      ) : (
        <div className="w-full h-full flex items-center justify-center">
          <div className="w-6 h-6 border-2 border-white/20 border-t-white/60 rounded-full animate-spin" />
        </div>
      )}
    </div>
  )
}

//
// GOON STATS PAGE - Track your pleasure journey
//
// Note: GoonStats type is defined at the top of the file

type Achievement = {
  id: string
  name: string
  description: string
  icon: string
  category: string
  target: number
  secret?: boolean
}

// Daily challenge type for UI
type DailyChallengeUI = {
  id: string
  type: string
  title: string
  description: string
  icon: string
  target: number
  progress: number
  completed: boolean
  rewardXp: number
}

type DailyChallengeStateUI = {
  date: string
  challenges: DailyChallengeUI[]
  completedCount: number
  totalXp: number
  streak: number
}

// Format duration display - shows total video content duration
function DurationDisplay({ totalSeconds }: { totalSeconds: number }) {
  const days = Math.floor(totalSeconds / 86400)
  const hours = Math.floor((totalSeconds % 86400) / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)

  if (days > 0) {
    return (
      <span className="font-mono">
        <span className="text-white font-bold">{days}</span>
        <span className="text-[var(--muted)]">d </span>
        <span className="text-white font-bold">{hours.toString().padStart(2, '0')}</span>
        <span className="text-[var(--muted)]">h </span>
        <span className="text-white font-bold">{minutes.toString().padStart(2, '0')}</span>
        <span className="text-[var(--muted)]">m</span>
      </span>
    )
  }

  if (hours > 0) {
    return (
      <span className="font-mono">
        <span className="text-white font-bold">{hours}</span>
        <span className="text-[var(--muted)]">h </span>
        <span className="text-white font-bold">{minutes.toString().padStart(2, '0')}</span>
        <span className="text-[var(--muted)]">m</span>
      </span>
    )
  }

  return (
    <span className="font-mono">
      <span className="text-white font-bold">{minutes}</span>
      <span className="text-[var(--muted)]">m</span>
    </span>
  )
}

function StatsPage({ confetti, anime }: { confetti?: ReturnType<typeof useConfetti>; anime?: ReturnType<typeof useAnime> }) {
  const [goonStats, setGoonStats] = useState<GoonStats | null>(null)
  const [vaultStats, setVaultStats] = useState<any>(null)
  const [achievements, setAchievements] = useState<Achievement[]>([])
  const [loading, setLoading] = useState(true)
  const [achievementTab, setAchievementTab] = useState<string>('all')
  const [dailyChallenges, setDailyChallenges] = useState<DailyChallengeStateUI | null>(null)
  const [sessionAnalytics, setSessionAnalytics] = useState<SessionAnalytics | null>(null)
  const { showToast } = useToast()

  useEffect(() => {
    loadAllStats()
    loadDailyChallenges()
    const unsubStats = window.api.events.onGoonStatsChanged?.((s: GoonStats) => setGoonStats(s))
    const unsubAchievement = window.api.events.onAchievementUnlocked?.((ids: string[]) => {
      console.log('Achievements unlocked:', ids)
      confetti?.achievement()
      loadAllStats()
    })
    const unsubChallenge = window.api.challenges?.onCompleted?.((completed: any[]) => {
      completed.forEach(c => {
        showToast('success', `Challenge Complete: ${c.title} (+${c.rewardXp} XP)`)
      })
      confetti?.burst()
      loadDailyChallenges()
    })
    // Subscribe to vault changes to refresh stats when media is added/removed
    const unsubVault = window.api.events.onVaultChanged?.(() => {
      loadAllStats()  // Refresh all stats including totalDurationSec
    })
    return () => { unsubStats?.(); unsubAchievement?.(); unsubChallenge?.(); unsubVault?.() }
  }, [])

  const loadDailyChallenges = async () => {
    try {
      const state = await window.api.challenges?.get?.()
      if (state) setDailyChallenges(state)
    } catch (e) {
      console.error('Failed to load daily challenges:', e)
    }
  }

  const loadAllStats = async () => {
    try {
      const [gs, vs, sa] = await Promise.all([
        window.api.goon.getStats(),
        window.api.vault.getStats(),
        window.api.invoke('sessionHistory:getAnalytics', 30).catch(() => null)
      ])
      setGoonStats(gs)
      setVaultStats(vs)
      if (sa) setSessionAnalytics(sa as SessionAnalytics)
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
  const fmtSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    if (bytes < 1024 * 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
    return `${(bytes / (1024 * 1024 * 1024 * 1024)).toFixed(2)} TB`
  }
  const fmtDuration = (seconds: number) => {
    const h = Math.floor(seconds / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    if (h >= 24) return `${(h / 24).toFixed(1)} days`
    if (h > 0) return `${h}h ${m}m`
    return `${m}m`
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

        {/* Daily Challenges */}
        {dailyChallenges && (
          <div className="mb-6 p-4 bg-gradient-to-br from-amber-500/10 to-orange-500/10 rounded-2xl border border-amber-500/20">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="text-2xl">🎯</div>
                <div>
                  <div className="text-sm font-semibold">Daily Challenges</div>
                  <div className="text-xs text-[var(--muted)]">
                    {dailyChallenges.completedCount}/{dailyChallenges.challenges.length} completed
                    {dailyChallenges.streak > 0 && ` • ${dailyChallenges.streak} day streak`}
                  </div>
                </div>
              </div>
              <div className="text-right">
                <div className="text-lg font-bold text-amber-400">{dailyChallenges.totalXp.toLocaleString()} XP</div>
                <div className="text-xs text-[var(--muted)]">Total earned</div>
              </div>
            </div>

            <div className="space-y-2">
              {dailyChallenges.challenges.map(challenge => (
                <div
                  key={challenge.id}
                  className={cn(
                    'flex items-center gap-3 p-3 rounded-xl transition-all',
                    challenge.completed
                      ? 'bg-green-500/10 border border-green-500/30'
                      : 'bg-black/20 border border-white/5'
                  )}
                >
                  <div className="text-2xl">{challenge.icon}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={cn('text-sm font-medium', challenge.completed && 'line-through opacity-60')}>
                        {challenge.title}
                      </span>
                      {challenge.completed && (
                        <CheckCircle2 size={14} className="text-green-500 flex-shrink-0" />
                      )}
                    </div>
                    <div className="text-xs text-[var(--muted)]">{challenge.description}</div>
                    {!challenge.completed && (
                      <div className="mt-1.5 flex items-center gap-2">
                        <div className="flex-1 h-1.5 bg-black/30 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-amber-500 to-orange-500 transition-all duration-300"
                            style={{ width: `${(challenge.progress / challenge.target) * 100}%` }}
                          />
                        </div>
                        <span className="text-xs text-[var(--muted)] tabular-nums">
                          {challenge.progress}/{challenge.target}
                        </span>
                      </div>
                    )}
                  </div>
                  <div className={cn(
                    'text-xs font-medium px-2 py-1 rounded-lg',
                    challenge.completed ? 'bg-green-500/20 text-green-400' : 'bg-amber-500/20 text-amber-400'
                  )}>
                    +{challenge.rewardXp} XP
                  </div>
                </div>
              ))}
            </div>

            {dailyChallenges.completedCount === dailyChallenges.challenges.length && (
              <div className="mt-4 p-3 bg-green-500/10 rounded-xl border border-green-500/30 text-center">
                <div className="text-green-400 font-medium">All challenges complete!</div>
                <div className="text-xs text-[var(--muted)]">New challenges tomorrow</div>
              </div>
            )}
          </div>
        )}

        {/* Collection Overview - Big highlight card */}
        <div className="mb-6 p-4 bg-gradient-to-br from-[var(--primary)]/10 to-[var(--secondary)]/10 rounded-2xl border border-[var(--border)]">
          <div className="flex items-center gap-4 mb-3">
            <div className="text-3xl font-bold text-[var(--primary)]">{fmtSize(vs?.totalSizeBytes ?? 0)}</div>
            <div className="text-sm text-[var(--muted)]">Total Collection Size</div>
          </div>
          <div className="flex items-center gap-6 text-sm">
            <div className="flex items-center gap-1">
              <DurationDisplay totalSeconds={vs?.totalDurationSec ?? 0} />
              <span className="text-[var(--muted)]">of video</span>
            </div>
            <div><span className="text-white font-medium">{fmt(vs?.totalMedia ?? 0)}</span> <span className="text-[var(--muted)]">files</span></div>
          </div>
        </div>

        {/* Stat cards — 2 rows */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          {[
            { label: 'Videos', value: fmt(vs?.videoCount ?? 0), color: 'text-blue-400' },
            { label: 'Images', value: fmt(vs?.imageCount ?? 0), color: 'text-green-400' },
            { label: 'GIFs', value: fmt(vs?.gifCount ?? 0), color: 'text-purple-400' },
            { label: 'Tags', value: fmt(vs?.tagCount ?? 0), color: 'text-amber-400' },
            { label: 'Videos Watched', value: fmt(gs?.totalVideosWatched ?? 0), color: 'text-pink-400' },
            { label: 'Unique Watched', value: fmt(gs?.uniqueVideosWatched ?? 0), color: 'text-violet-400' },
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
        <div className="grid grid-cols-4 gap-3 mb-6">
          <div className="p-3 bg-gradient-to-br from-pink-500/10 to-rose-500/10 rounded-xl border border-pink-500/20">
            <div className="text-lg font-semibold text-pink-400">{fmtDuration(gs?.totalWatchTime ?? 0)}</div>
            <div className="text-[10px] text-[var(--muted)]">Total Watch Time</div>
          </div>
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

        {/* Session Analytics - 30 day insights */}
        {sessionAnalytics && (
          <div className="mb-6 p-4 bg-gradient-to-br from-violet-500/10 to-purple-600/10 rounded-2xl border border-violet-500/20">
            <div className="flex items-center gap-2 mb-4">
              <Clock size={16} className="text-violet-400" />
              <span className="text-sm font-semibold text-violet-300">Session Insights</span>
              <span className="text-[10px] text-[var(--muted)]">last 30 days</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              <div>
                <div className="text-2xl font-bold text-violet-400">
                  <AnimatedCounter value={sessionAnalytics.totalSessions} />
                </div>
                <div className="text-[10px] text-[var(--muted)]">Total Sessions</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-purple-400">{fmtDuration(sessionAnalytics.totalDuration)}</div>
                <div className="text-[10px] text-[var(--muted)]">Total Time</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-pink-400">{fmtDuration(sessionAnalytics.avgSessionDuration)}</div>
                <div className="text-[10px] text-[var(--muted)]">Avg Session</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-fuchsia-400 count-up">
                  {sessionAnalytics.avgMediaPerSession.toFixed(1)}
                </div>
                <div className="text-[10px] text-[var(--muted)]">Media/Session</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-indigo-400">
                  {sessionAnalytics.mostActiveHour === 0 ? '12 AM' :
                   sessionAnalytics.mostActiveHour < 12 ? `${sessionAnalytics.mostActiveHour} AM` :
                   sessionAnalytics.mostActiveHour === 12 ? '12 PM' :
                   `${sessionAnalytics.mostActiveHour - 12} PM`}
                </div>
                <div className="text-[10px] text-[var(--muted)]">Peak Hour</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-blue-400">{sessionAnalytics.mostActiveDay}</div>
                <div className="text-[10px] text-[var(--muted)]">Peak Day</div>
              </div>
            </div>
          </div>
        )}

        {/* Top Tags and Quick Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
          {/* Top Tags */}
          <div className="p-4 bg-white/5 rounded-xl border border-white/10">
            <div className="text-sm font-semibold text-[var(--muted)] mb-3">Top Tags</div>
            <div className="flex flex-wrap gap-1.5">
              {(vs?.topTags ?? []).slice(0, 8).map((tag: { name: string; count: number }, i: number) => (
                <div
                  key={tag.name}
                  className="px-2 py-1 rounded-lg text-xs bg-[var(--primary)]/20 text-[var(--primary)] flex items-center gap-1.5"
                  title={`Used on ${tag.count} items`}
                >
                  <span>{tag.name}</span>
                  <span className="text-[10px] text-[var(--muted)]">({tag.count})</span>
                </div>
              ))}
              {(!vs?.topTags || vs.topTags.length === 0) && (
                <div className="text-xs text-[var(--muted)]">No tags yet</div>
              )}
            </div>
          </div>

          {/* Quick Stats */}
          <div className="p-4 bg-white/5 rounded-xl border border-white/10">
            <div className="text-sm font-semibold text-[var(--muted)] mb-3">Library Health</div>
            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-[var(--muted)]">Added This Week</span>
                <span className="text-green-400 font-medium">+{vs?.recentlyAdded ?? 0}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[var(--muted)]">Favorites</span>
                <span className="text-pink-400 font-medium">{vs?.favoritesCount ?? 0}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[var(--muted)]">Avg Rating</span>
                <span className="text-amber-400 font-medium">{(vs?.avgRating ?? 0).toFixed(1)} <Star size={10} className="inline" /></span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[var(--muted)]">Media Folders</span>
                <span className="text-white">{vs?.mediaDirs ?? 0}</span>
              </div>
            </div>
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

// ═══════════════════════════════════════════════════════════════════════════
// HARDWARE ENCODER SETTINGS COMPONENT
// ═══════════════════════════════════════════════════════════════════════════
function HardwareEncoderSettings() {
  const { showToast } = useToast()
  const [encoders, setEncoders] = useState<Array<{
    id: string
    name: string
    available: boolean
    description: string
  }>>([])
  const [preferredEncoder, setPreferredEncoder] = useState<string>('libx264')
  const [detecting, setDetecting] = useState(false)
  const [hasDetected, setHasDetected] = useState(false)

  // Load encoder info on mount
  useEffect(() => {
    const loadEncoders = async () => {
      try {
        const list = await window.api.encoder?.getEncoders?.() ?? []
        if (list.length > 0) {
          setEncoders(list)
          setHasDetected(true)
        }
        const pref = await window.api.encoder?.getPreferred?.() ?? 'libx264'
        setPreferredEncoder(pref)
      } catch (err) {
        console.error('[HardwareEncoder] Failed to load encoders:', err)
      }
    }
    loadEncoders()
  }, [])

  const detectEncoders = async () => {
    setDetecting(true)
    try {
      const result = await window.api.encoder?.detect?.()
      if (result?.success && result.encoders) {
        setEncoders(result.encoders)
        setHasDetected(true)
        const available = result.encoders.filter((e: { available: boolean }) => e.available)
        if (available.length > 1) {
          showToast('success', `Found ${available.length} hardware encoders!`)
        } else {
          showToast('info', 'Only software encoder available')
        }
      } else {
        showToast('error', result?.error ?? 'Detection failed')
      }
    } catch (err: any) {
      showToast('error', err?.message ?? 'Failed to detect encoders')
    } finally {
      setDetecting(false)
    }
  }

  const setPreferred = async (encoderId: string) => {
    try {
      await window.api.encoder?.setPreferred?.(encoderId)
      setPreferredEncoder(encoderId)
      const encoder = encoders.find(e => e.id === encoderId)
      showToast('success', `Encoder set to ${encoder?.name ?? encoderId}`)
    } catch (err: any) {
      showToast('error', 'Failed to set encoder')
    }
  }

  const availableEncoders = encoders.filter(e => e.available)

  return (
    <div className="rounded-3xl border border-[var(--border)] bg-black/20 p-5 mt-4">
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="text-sm font-semibold">Hardware Acceleration</div>
          <div className="text-xs text-[var(--muted)]">GPU-accelerated video encoding for faster transcoding</div>
        </div>
        <button
          onClick={detectEncoders}
          disabled={detecting}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[var(--primary)]/20 hover:bg-[var(--primary)]/30 text-[var(--primary)] text-xs font-medium transition disabled:opacity-50"
        >
          {detecting ? (
            <>
              <Loader2 size={14} className="animate-spin" />
              Detecting...
            </>
          ) : (
            <>
              <Zap size={14} />
              Detect GPUs
            </>
          )}
        </button>
      </div>

      {!hasDetected ? (
        <div className="text-center py-8 text-[var(--muted)]">
          <Cpu size={32} className="mx-auto mb-3 opacity-50" />
          <p className="text-sm">Click "Detect GPUs" to scan for hardware encoders</p>
          <p className="text-xs mt-1">Supports NVIDIA NVENC, Intel Quick Sync, AMD AMF</p>
        </div>
      ) : (
        <div className="space-y-3">
          {encoders.map(encoder => (
            <div
              key={encoder.id}
              className={cn(
                'flex items-center justify-between p-3 rounded-xl border transition cursor-pointer',
                encoder.available
                  ? preferredEncoder === encoder.id
                    ? 'border-[var(--primary)] bg-[var(--primary)]/10'
                    : 'border-[var(--border)] hover:border-[var(--primary)]/50 hover:bg-white/5'
                  : 'border-[var(--border)] opacity-40 cursor-not-allowed'
              )}
              onClick={() => encoder.available && setPreferred(encoder.id)}
            >
              <div className="flex items-center gap-3">
                <div className={cn(
                  'w-8 h-8 rounded-lg flex items-center justify-center',
                  encoder.available ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
                )}>
                  {encoder.available ? <Check size={16} /> : <X size={16} />}
                </div>
                <div>
                  <div className="text-sm font-medium">{encoder.name}</div>
                  <div className="text-xs text-[var(--muted)]">{encoder.description}</div>
                </div>
              </div>
              {preferredEncoder === encoder.id && encoder.available && (
                <div className="px-2 py-1 rounded-full bg-[var(--primary)] text-[10px] font-medium">
                  Active
                </div>
              )}
            </div>
          ))}

          <div className="mt-4 pt-4 border-t border-[var(--border)]">
            <div className="text-xs text-[var(--muted)]">
              <strong>Tip:</strong> Hardware encoders (NVENC, QSV) are 3-10x faster than software encoding.
              If you have a compatible GPU, select it for faster video transcoding.
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function SettingsPage(props: {
  settings: VaultSettings | null
  patchSettings: (p: Partial<VaultSettings>) => void
  onThemeChange: (themeId: string) => void
  visualEffects: {
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
    hearts: boolean
    rain: boolean
    glitch: boolean
    bubbles: boolean
    matrix: boolean
    confetti: boolean
  }
  onVisualEffectsChange: {
    setEnabled: (v: boolean) => void
    setSparkles: (v: boolean) => void
    setBokeh: (v: boolean) => void
    setStarfield: (v: boolean) => void
    setFilmGrain: (v: boolean) => void
    setDreamyHaze: (v: boolean) => void
    setCrtCurve: (v: boolean) => void
    setCrtIntensity: (v: number) => void
    setCrtRgbSubpixels: (v: boolean) => void
    setCrtChromaticAberration: (v: boolean) => void
    setCrtScreenFlicker: (v: boolean) => void
    setCrtGlitchGif: (v: number | null) => void
    setTvBorder: (v: boolean) => void
    setTvBorderGlass: (v: boolean) => void
    setTvBorderGlassOpacity: (v: number) => void
    setTvBorderPadding: (v: number) => void
    setTvBorderStyle: (v: 'classic' | 'modern' | 'retro' | 'minimal') => void
    setPipBoy: (v: boolean) => void
    setPipBoyColor: (v: 'green' | 'amber' | 'blue' | 'white') => void
    setPipBoyIntensity: (v: number) => void
    setHeatLevel: (v: number) => void
    setHearts: (v: boolean) => void
    setRain: (v: boolean) => void
    setGlitch: (v: boolean) => void
    setBubbles: (v: boolean) => void
    setMatrix: (v: boolean) => void
    setConfetti: (v: boolean) => void
  }
}) {
  const s = props.settings
  const { showToast } = useToast()
  type SettingsTab = 'library' | 'appearance' | 'effects' | 'playback' | 'sound' | 'data' | 'services'
  const [activeTab, setActiveTab] = useState<SettingsTab>('library')
  const [isPremium, setIsPremium] = useState(false)
  const [allTags, setAllTags] = useState<string[]>([])
  const [settingsSearch, setSettingsSearch] = useState('')
  // Settings Profiles
  const [profiles, setProfiles] = useState<Array<{ id: string; name: string; description?: string; createdAt: number; updatedAt: number }>>([])
  const [activeProfileId, setActiveProfileId] = useState<string | null>(null)
  const [showCreateProfileModal, setShowCreateProfileModal] = useState(false)
  const [newProfileName, setNewProfileName] = useState('')
  const [newProfileDesc, setNewProfileDesc] = useState('')
  const [renamingProfileId, setRenamingProfileId] = useState<string | null>(null)
  const [renameProfileName, setRenameProfileName] = useState('')

  // Mobile Sync state
  const [mobileSyncStatus, setMobileSyncStatus] = useState<{
    running: boolean
    port: number
    addresses: string[]
    connectedDevices: number
  } | null>(null)
  const [mobilePairingCode, setMobilePairingCode] = useState<string | null>(null)
  const [mobilePairedDevices, setMobilePairedDevices] = useState<Array<{
    id: string
    name: string
    platform: string
    lastSeen: number
  }>>([])

  // Load profiles on mount
  const loadProfiles = async () => {
    const list = await window.api.profiles?.list?.() ?? []
    const active = await window.api.profiles?.getActive?.() ?? null
    setProfiles(list)
    setActiveProfileId(active)
  }

  useEffect(() => {
    window.api.license?.isPremium?.().then((p: any) => setIsPremium(!!p))
    // Load all tags for blacklist selection
    window.api.tags?.list?.().then((tags: any) => setAllTags(tags?.map?.((t: any) => t.name || t) || []))
    // Load settings profiles
    loadProfiles()
    // Load mobile sync status
    loadMobileSyncStatus()
  }, [])

  // Mobile sync functions
  const loadMobileSyncStatus = async () => {
    try {
      const status = await window.api.mobileSync?.getStatus?.()
      if (status) {
        setMobileSyncStatus(status)
      }
      const devices = await window.api.mobileSync?.getPairedDevices?.()
      if (devices) {
        setMobilePairedDevices(devices)
      }
    } catch (e) {
      // Mobile sync may not be available
    }
  }

  const toggleMobileSyncServer = async () => {
    try {
      if (mobileSyncStatus?.running) {
        await window.api.mobileSync?.stop?.()
      } else {
        await window.api.mobileSync?.start?.()
      }
      await loadMobileSyncStatus()
    } catch (e) {
      showToast('error', 'Failed to toggle mobile sync server')
    }
  }

  const generateMobilePairingCode = async () => {
    try {
      const result = await window.api.mobileSync?.generatePairingCode?.()
      if (result?.code) {
        setMobilePairingCode(result.code)
        // Code expires after 5 minutes
        setTimeout(() => setMobilePairingCode(null), 5 * 60 * 1000)
      } else {
        showToast('error', 'Failed to generate pairing code')
      }
    } catch (e) {
      showToast('error', 'Failed to generate pairing code')
    }
  }

  const unpairDevice = async (deviceId: string) => {
    try {
      await window.api.mobileSync?.unpairDevice?.(deviceId)
      await loadMobileSyncStatus()
      showToast('success', 'Device unpaired')
    } catch (e) {
      showToast('error', 'Failed to unpair device')
    }
  }

  // Define searchable settings for filtering
  const settingsIndex = useMemo(() => [
    { tab: 'library', keywords: ['media', 'folder', 'directory', 'path', 'cache', 'storage', 'scan'] },
    { tab: 'appearance', keywords: ['theme', 'color', 'dark', 'light', 'accent', 'font', 'size', 'compact', 'animation', 'thumbnail'] },
    { tab: 'effects', keywords: ['visual', 'sparkle', 'bokeh', 'starfield', 'grain', 'haze', 'crt', 'heat', 'goon', 'word'] },
    { tab: 'playback', keywords: ['video', 'autoplay', 'mute', 'loop', 'volume', 'speed'] },
    { tab: 'sound', keywords: ['audio', 'voice', 'sound', 'mute', 'volume', 'greeting', 'sfx'] },
    { tab: 'data', keywords: ['export', 'import', 'backup', 'restore', 'reset', 'privacy', 'blacklist', 'tag'] },
    { tab: 'services', keywords: ['mobile', 'sync', 'phone', 'device', 'pair', 'privacy', 'panic', 'incognito', 'blacklist'] },
  ] as const, [])

  // Find matching tabs based on search
  const matchingTabs = useMemo(() => {
    if (!settingsSearch.trim()) return null
    const q = settingsSearch.toLowerCase()
    return settingsIndex
      .filter(s => s.keywords.some(k => k.includes(q)))
      .map(s => s.tab)
  }, [settingsSearch, settingsIndex])

  // Auto-switch to matching tab if there's only one match
  useEffect(() => {
    if (matchingTabs && matchingTabs.length === 1) {
      setActiveTab(matchingTabs[0] as SettingsTab)
    }
  }, [matchingTabs])

  const mediaDirs = s?.library?.mediaDirs ?? []
  const cacheDir = s?.library?.cacheDir ?? ''
  const privacySettings = s?.privacy ?? {}
  const playbackSettings = s?.playback ?? {}

  const tabs = [
    { id: 'library', name: 'Library', icon: Library },
    { id: 'appearance', name: 'Appearance', icon: Sparkles },
    { id: 'effects', name: 'Effects', icon: Flame },
    { id: 'playback', name: 'Playback', icon: Play },
    { id: 'sound', name: 'Sound', icon: Volume2 },
    { id: 'data', name: 'Data', icon: HardDrive },
    { id: 'services', name: 'Services', icon: Shield },
  ] as const

  return (
    <>
      <TopBar title="Settings">
        {/* Settings search */}
        <div className="relative flex-1 max-w-xs">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--muted)]" />
          <input
            value={settingsSearch}
            onChange={(e) => setSettingsSearch(e.target.value)}
            placeholder="Search settings..."
            className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-white/10 border border-[var(--border)] outline-none focus:border-[var(--primary)]/50 text-sm"
          />
          {settingsSearch && (
            <button
              onClick={() => setSettingsSearch('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--muted)] hover:text-white"
            >
              <X size={12} />
            </button>
          )}
        </div>
      </TopBar>
      {/* Search hint - show matching tabs */}
      {matchingTabs && matchingTabs.length > 0 && (
        <div className="px-4 py-2 bg-[var(--primary)]/10 border-b border-[var(--primary)]/20 flex items-center gap-2">
          <span className="text-xs text-[var(--muted)]">Found in:</span>
          {matchingTabs.map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab as SettingsTab)}
              className={cn(
                'px-2 py-0.5 rounded text-xs transition',
                activeTab === tab ? 'bg-[var(--primary)] text-white' : 'bg-white/10 hover:bg-white/20'
              )}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>
      )}
      {/* Mobile tab bar */}
      <div className="flex sm:hidden overflow-x-auto border-b border-[var(--border)] bg-[var(--panel)]">
        {tabs.map((tab) => {
          const Icon = tab.icon
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'flex items-center gap-2 px-4 py-2.5 text-xs whitespace-nowrap transition border-b-2',
                activeTab === tab.id
                  ? 'border-[var(--primary)] text-[var(--primary)]'
                  : 'border-transparent text-[var(--muted)] hover:text-white'
              )}
            >
              <Icon size={14} />
              {tab.name}
            </button>
          )
        })}
      </div>

      <div className="flex h-[calc(100vh-56px)]">
        {/* Settings Tabs - desktop sidebar */}
        <div className="hidden sm:block w-48 p-4 border-r border-[var(--border)]">
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
                <span className="truncate">{tab.name}</span>
              </button>
            )
          })}
        </div>

        {/* Settings Content */}
        <div className="flex-1 p-6 space-y-6 overflow-y-auto" key={activeTab} style={{ animation: 'fadeIn 200ms ease' }}>
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
                        title="Remove this folder from library scan"
                        onClick={async () => {
                          try {
                            const next = await window.api.settings.removeMediaDir(d)
                            props.patchSettings(next)
                          } catch (err) {
                            console.error('[Settings] Failed to remove media dir:', err)
                          }
                        }}
                      >
                        Remove
                      </Btn>
                    </div>
                  ))}
                  <Btn
                    title="Add a new folder to scan for media files"
                    onClick={async () => {
                      try {
                        const nextDir = await window.api.settings.chooseMediaDir()
                        if (!nextDir) return
                        const next = await window.api.settings.get()
                        props.patchSettings(next)
                      } catch (err) {
                        console.error('[Settings] Failed to add media dir:', err)
                      }
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
                    title="Set folder for thumbnails and temporary files"
                    onClick={async () => {
                      try {
                        const nextDir = await window.api.settings.chooseCacheDir()
                        if (!nextDir) return
                        const next = await window.api.settings.get()
                        props.patchSettings(next)
                      } catch (err) {
                        console.error('[Settings] Failed to set cache dir:', err)
                      }
                    }}
                  >
                    Choose cache folder
                  </Btn>
                </div>
              </div>

              <div className="rounded-3xl border border-[var(--border)] bg-black/20 p-5">
                <div className="text-sm font-semibold mb-4">Thumbnail Quality</div>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm">Quality Level</div>
                      <div className="text-xs text-[var(--muted)]">Higher quality uses more disk space but looks better</div>
                    </div>
                    <select
                      value={s?.library?.thumbnailQuality ?? 'medium'}
                      onChange={async (e) => {
                        try {
                          await window.api.settings.library?.update?.({ thumbnailQuality: e.target.value as 'low' | 'medium' | 'high' })
                          const next = await window.api.settings.get()
                          props.patchSettings(next)
                        } catch (err) {
                          console.error('[Settings] Failed to update thumbnail quality:', err)
                        }
                      }}
                      className="px-3 py-1.5 rounded-lg bg-black/30 border border-[var(--border)] text-sm focus:outline-none focus:border-white/20"
                    >
                      <option value="low">Low (faster, smaller files)</option>
                      <option value="medium">Medium (balanced)</option>
                      <option value="high">High (best quality)</option>
                    </select>
                  </div>
                  <div className="text-xs text-[var(--muted)]">
                    Changes apply to newly generated thumbnails. Existing thumbnails can be regenerated via the Scan Library button.
                  </div>
                  <div className="mt-4 pt-4 border-t border-[var(--border)]">
                    <Btn
                      tone="danger"
                      onClick={async () => {
                        if (!confirm('Clear all cached thumbnails? They will be regenerated on next scan.')) return
                        try {
                          const result = await window.api.cache?.clearThumbnails?.()
                          if (result?.success) {
                            showToast('success', `Cleared ${result.count} thumbnails (${(result.freedBytes / 1024 / 1024).toFixed(1)} MB freed)`)
                          } else {
                            showToast('error', 'Failed to clear cache')
                          }
                        } catch (err) {
                          showToast('error', 'Failed to clear cache')
                        }
                      }}
                    >
                      Clear Thumbnail Cache
                    </Btn>
                  </div>
                </div>
              </div>

              {/* Performance Settings for Low-End PCs */}
              <div className="rounded-3xl border border-[var(--border)] bg-black/20 p-5">
                <div className="text-sm font-semibold mb-4">Performance (Low-End PC Options)</div>
                <div className="space-y-4">
                  {/* Video Preview Quality */}
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm">Video Preview Quality</div>
                      <div className="text-xs text-[var(--muted)]">Lower quality = faster hover preview loading</div>
                    </div>
                    <select
                      value={s?.library?.previewQuality ?? 'medium'}
                      onChange={async (e) => {
                        await window.api.settings.library?.update?.({ previewQuality: e.target.value as 'low' | 'medium' | 'high' })
                        const next = await window.api.settings.get()
                        props.patchSettings(next)
                      }}
                      className="px-3 py-1.5 rounded-lg bg-[var(--surface)] border border-[var(--border)] text-sm"
                    >
                      <option value="low">Low (360p, fastest)</option>
                      <option value="medium">Medium (480p)</option>
                      <option value="high">High (720p)</option>
                    </select>
                  </div>

                  {/* Disable Hover Previews */}
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm">Disable Hover Previews</div>
                      <div className="text-xs text-[var(--muted)]">Turn off video preview on hover (saves memory)</div>
                    </div>
                    <ToggleSwitch
                      checked={s?.library?.disableHoverPreviews ?? false}
                      onChange={async (v) => {
                        await window.api.settings.library?.update?.({ disableHoverPreviews: v })
                        const next = await window.api.settings.get()
                        props.patchSettings(next)
                      }}
                    />
                  </div>

                  {/* Reduce Animations */}
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm">Reduce Animations</div>
                      <div className="text-xs text-[var(--muted)]">Disable smooth transitions and effects</div>
                    </div>
                    <ToggleSwitch
                      checked={s?.appearance?.reduceAnimations ?? false}
                      onChange={async (v) => {
                        await window.api.settings.appearance?.update?.({ reduceAnimations: v })
                        const next = await window.api.settings.get()
                        props.patchSettings(next)
                        // Apply immediately
                        document.documentElement.setAttribute('data-reduce-motion', v ? 'true' : 'false')
                      }}
                    />
                  </div>

                  {/* Max Concurrent Videos */}
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm">Max Concurrent Videos</div>
                      <div className="text-xs text-[var(--muted)]">Limit videos playing at once (GoonWall)</div>
                    </div>
                    <select
                      value={s?.library?.maxConcurrentVideos ?? 9}
                      onChange={async (e) => {
                        await window.api.settings.library?.update?.({ maxConcurrentVideos: Number(e.target.value) })
                        const next = await window.api.settings.get()
                        props.patchSettings(next)
                      }}
                      className="px-3 py-1.5 rounded-lg bg-[var(--surface)] border border-[var(--border)] text-sm"
                    >
                      <option value="4">4 (low-end PC)</option>
                      <option value="6">6 (standard)</option>
                      <option value="9">9 (default)</option>
                      <option value="12">12 (high-end)</option>
                      <option value="16">16 (powerful PC)</option>
                    </select>
                  </div>

                  {/* Cache Size Limit */}
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm">Memory Cache Size</div>
                      <div className="text-xs text-[var(--muted)]">URL cache for faster thumbnail loading</div>
                    </div>
                    <select
                      value={s?.library?.memoryCacheSize ?? 2000}
                      onChange={async (e) => {
                        await window.api.settings.library?.update?.({ memoryCacheSize: Number(e.target.value) })
                        const next = await window.api.settings.get()
                        props.patchSettings(next)
                      }}
                      className="px-3 py-1.5 rounded-lg bg-[var(--surface)] border border-[var(--border)] text-sm"
                    >
                      <option value="500">500 (low memory)</option>
                      <option value="1000">1000 (standard)</option>
                      <option value="2000">2000 (default)</option>
                      <option value="5000">5000 (high memory)</option>
                    </select>
                  </div>

                  {/* Lazy Load Margin */}
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm">Preload Distance</div>
                      <div className="text-xs text-[var(--muted)]">How far ahead to preload thumbnails (pixels)</div>
                    </div>
                    <select
                      value={s?.library?.preloadMargin ?? 600}
                      onChange={async (e) => {
                        await window.api.settings.library?.update?.({ preloadMargin: Number(e.target.value) })
                        const next = await window.api.settings.get()
                        props.patchSettings(next)
                      }}
                      className="px-3 py-1.5 rounded-lg bg-[var(--surface)] border border-[var(--border)] text-sm"
                    >
                      <option value="200">200px (minimal preload)</option>
                      <option value="400">400px (low)</option>
                      <option value="600">600px (default)</option>
                      <option value="1000">1000px (aggressive)</option>
                    </select>
                  </div>
                </div>
              </div>

            </>
          )}


          {/* Appearance Tab */}
          {activeTab === 'appearance' && (
            <>
            <div className="rounded-3xl border border-[var(--border)] bg-black/20 p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="text-sm font-semibold">Appearance</div>
                <button
                  onClick={async () => {
                    if (confirm('Reset all Appearance settings to defaults?')) {
                      try {
                        const next = await window.api.settings.resetSection?.('appearance')
                        if (next) {
                          props.patchSettings(next)
                          showToast('success', 'Appearance settings reset')
                        }
                      } catch (err: any) {
                        console.error('Failed to reset appearance settings:', err)
                        showToast('error', err?.message ?? 'Failed to reset settings')
                      }
                    }
                  }}
                  className="text-xs px-2 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-[var(--muted)] hover:text-white transition"
                >
                  Reset to Defaults
                </button>
              </div>

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
                              <Check size={12} />
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

            {/* Additional Appearance Settings */}
            <div className="rounded-3xl border border-[var(--border)] bg-black/20 p-5 mt-4">
              <div className="text-sm font-semibold mb-4">Display Options</div>
              <div className="space-y-4">
                {/* Animation Speed */}
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm">Animation Speed</div>
                    <div className="text-xs text-[var(--muted)]">Controls UI animations</div>
                  </div>
                  <select
                    value={s?.appearance?.animationSpeed ?? 'full'}
                    onChange={async (e) => {
                      await window.api.settings.appearance?.update?.({ animationSpeed: e.target.value as 'none' | 'reduced' | 'full' })
                      const next = await window.api.settings.get()
                      props.patchSettings(next)
                    }}
                    className="bg-black/40 border border-[var(--border)] rounded-lg px-3 py-1.5 text-sm"
                  >
                    <option value="full">Full</option>
                    <option value="reduced">Reduced</option>
                    <option value="none">None</option>
                  </select>
                </div>

                {/* Font Size */}
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm">Font Size</div>
                    <div className="text-xs text-[var(--muted)]">Adjust text size</div>
                  </div>
                  <select
                    value={s?.appearance?.fontSize ?? 'medium'}
                    onChange={async (e) => {
                      await window.api.settings.appearance?.update?.({ fontSize: e.target.value as 'small' | 'medium' | 'large' })
                      const next = await window.api.settings.get()
                      props.patchSettings(next)
                    }}
                    className="bg-black/40 border border-[var(--border)] rounded-lg px-3 py-1.5 text-sm"
                  >
                    <option value="small">Small</option>
                    <option value="medium">Medium</option>
                    <option value="large">Large</option>
                  </select>
                </div>

                {/* Font Style */}
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm">Font Style</div>
                    <div className="text-xs text-[var(--muted)]">App-wide text style</div>
                  </div>
                  <select
                    value={s?.appearance?.fontStyle ?? 'default'}
                    onChange={async (e) => {
                      const style = e.target.value
                      await window.api.settings.appearance?.update?.({ fontStyle: style })
                      const next = await window.api.settings.get()
                      props.patchSettings(next)
                      // Apply font style to document
                      document.documentElement.setAttribute('data-font-style', style)
                    }}
                    className="bg-black/40 border border-[var(--border)] rounded-lg px-3 py-1.5 text-sm"
                  >
                    <option value="default">Default (System)</option>
                    <option value="degrading">Degrading (Bold Impact)</option>
                    <option value="80s-hacker">80s Hacker (Terminal)</option>
                    <option value="perverse">Perverse (Cursive)</option>
                    <option value="neon">Neon (Modern)</option>
                    <option value="retro">Retro (Typewriter)</option>
                    <option value="gothic">Gothic (Blackletter)</option>
                  </select>
                </div>

                {/* Color Blind Mode */}
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm">Color Blind Mode</div>
                    <div className="text-xs text-[var(--muted)]">Accessibility color adjustments</div>
                  </div>
                  <select
                    value={s?.appearance?.colorBlindMode ?? 'none'}
                    onChange={async (e) => {
                      await window.api.settings.appearance?.update?.({ colorBlindMode: e.target.value as 'none' | 'protanopia' | 'deuteranopia' | 'tritanopia' | 'high-contrast' })
                      const next = await window.api.settings.get()
                      props.patchSettings(next)
                    }}
                    className="bg-black/40 border border-[var(--border)] rounded-lg px-3 py-1.5 text-sm"
                  >
                    <option value="none">None</option>
                    <option value="protanopia">Protanopia (Red-blind)</option>
                    <option value="deuteranopia">Deuteranopia (Green-blind)</option>
                    <option value="tritanopia">Tritanopia (Blue-blind)</option>
                    <option value="high-contrast">High Contrast</option>
                  </select>
                </div>

                {/* Thumbnail Size */}
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm">Thumbnail Size</div>
                    <div className="text-xs text-[var(--muted)]">Default thumbnail display size</div>
                  </div>
                  <select
                    value={s?.appearance?.thumbnailSize ?? 'medium'}
                    onChange={async (e) => {
                      await window.api.settings.appearance?.update?.({ thumbnailSize: e.target.value as 'small' | 'medium' | 'large' })
                      const next = await window.api.settings.get()
                      props.patchSettings(next)
                    }}
                    className="bg-black/40 border border-[var(--border)] rounded-lg px-3 py-1.5 text-sm"
                  >
                    <option value="small">Small</option>
                    <option value="medium">Medium</option>
                    <option value="large">Large</option>
                  </select>
                </div>

                {/* Accent Color */}
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm">Accent Color</div>
                    <div className="text-xs text-[var(--muted)]">Custom accent highlight</div>
                  </div>
                  <input
                    type="color"
                    value={s?.appearance?.accentColor ?? '#ff6b9d'}
                    onChange={async (e) => {
                      await window.api.settings.appearance?.update?.({ accentColor: e.target.value })
                      const next = await window.api.settings.get()
                      props.patchSettings(next)
                    }}
                    className="w-10 h-8 rounded cursor-pointer border border-[var(--border)]"
                  />
                </div>

                {/* Compact Mode */}
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm">Compact Mode</div>
                    <div className="text-xs text-[var(--muted)]">Reduce spacing and padding</div>
                  </div>
                  <ToggleSwitch
                    checked={s?.appearance?.compactMode ?? false}
                    onChange={async (v) => {
                      await window.api.settings.appearance?.update?.({ compactMode: v })
                      const next = await window.api.settings.get()
                      props.patchSettings(next)
                    }}
                  />
                </div>
              </div>
            </div>
            </>
          )}

          {/* Visual Effects Tab */}
          {activeTab === 'effects' && (
            <>
            <div className="rounded-3xl border border-[var(--border)] bg-black/20 p-5">
              <div className="text-sm font-semibold mb-4">Visual Effects</div>
              <div className="space-y-4">
                {/* Master Toggle */}
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm">Enable Visual Effects</div>
                    <div className="text-xs text-[var(--muted)]">Master toggle for all overlays</div>
                  </div>
                  <ToggleSwitch
                    checked={props.visualEffects.enabled}
                    onChange={props.onVisualEffectsChange.setEnabled}
                  />
                </div>

                {/* Heat Level Slider */}
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm">Heat Level</div>
                    <div className="text-xs text-[var(--muted)]">Ambient arousal intensity (0-10)</div>
                  </div>
                  <div className="flex items-center gap-3">
                    <input
                      type="range"
                      min={0}
                      max={10}
                      step={1}
                      value={props.visualEffects.heatLevel}
                      onChange={(e) => props.onVisualEffectsChange.setHeatLevel(Number(e.target.value))}
                      className="w-24 h-1 accent-[var(--primary)] cursor-pointer"
                      disabled={!props.visualEffects.enabled}
                    />
                    <span className="text-xs text-[var(--muted)] w-6 text-right">{props.visualEffects.heatLevel}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-3xl border border-[var(--border)] bg-black/20 p-5 mt-4">
              <div className="text-sm font-semibold mb-4">Ambient Overlays</div>
              <div className="space-y-4">
                {/* Sparkles */}
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm">✨ Sparkles</div>
                    <div className="text-xs text-[var(--muted)]">Floating glitter particles</div>
                  </div>
                  <ToggleSwitch
                    checked={props.visualEffects.sparkles}
                    onChange={props.onVisualEffectsChange.setSparkles}
                  />
                </div>

                {/* Bokeh */}
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm">💫 Bokeh Lights</div>
                    <div className="text-xs text-[var(--muted)]">Soft, dreamy light circles</div>
                  </div>
                  <ToggleSwitch
                    checked={props.visualEffects.bokeh}
                    onChange={props.onVisualEffectsChange.setBokeh}
                  />
                </div>

                {/* Starfield */}
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm">⭐ Starfield</div>
                    <div className="text-xs text-[var(--muted)]">Twinkling stars in background</div>
                  </div>
                  <ToggleSwitch
                    checked={props.visualEffects.starfield}
                    onChange={props.onVisualEffectsChange.setStarfield}
                  />
                </div>

                {/* Film Grain */}
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm">🎞️ Film Grain</div>
                    <div className="text-xs text-[var(--muted)]">Vintage film texture overlay</div>
                  </div>
                  <ToggleSwitch
                    checked={props.visualEffects.filmGrain}
                    onChange={props.onVisualEffectsChange.setFilmGrain}
                  />
                </div>

                {/* Dreamy Haze */}
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm">🌫️ Dreamy Haze</div>
                    <div className="text-xs text-[var(--muted)]">Soft, ethereal blur effect</div>
                  </div>
                  <ToggleSwitch
                    checked={props.visualEffects.dreamyHaze}
                    onChange={props.onVisualEffectsChange.setDreamyHaze}
                  />
                </div>

                {/* CRT Curved Screen */}
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm">📺 CRT Curved Screen</div>
                    <div className="text-xs text-[var(--muted)]">Retro curved monitor effect</div>
                  </div>
                  <ToggleSwitch
                    checked={props.visualEffects.crtCurve}
                    onChange={props.onVisualEffectsChange.setCrtCurve}
                  />
                </div>

                {/* CRT sub-options - only show when CRT is enabled */}
                {props.visualEffects.crtCurve && (
                  <>
                    {/* Curve Intensity */}
                    <div className="flex items-center justify-between pl-4">
                      <div>
                        <div className="text-sm text-[var(--muted)]">Curve Intensity</div>
                      </div>
                      <div className="flex items-center gap-3">
                        <input
                          type="range"
                          min={1}
                          max={10}
                          step={1}
                          value={props.visualEffects.crtIntensity}
                          onChange={(e) => props.onVisualEffectsChange.setCrtIntensity(Number(e.target.value))}
                          className="w-20 h-1 accent-[var(--primary)] cursor-pointer"
                        />
                        <span className="text-xs text-[var(--muted)] w-6 text-right">{props.visualEffects.crtIntensity}</span>
                      </div>
                    </div>

                    {/* RGB Subpixels */}
                    <div className="flex items-center justify-between pl-4">
                      <div>
                        <div className="text-sm text-[var(--muted)]">RGB Subpixels</div>
                        <div className="text-xs text-[var(--muted)]/70">Vertical RGB stripe pattern</div>
                      </div>
                      <ToggleSwitch
                        checked={props.visualEffects.crtRgbSubpixels}
                        onChange={props.onVisualEffectsChange.setCrtRgbSubpixels}
                      />
                    </div>

                    {/* Chromatic Aberration */}
                    <div className="flex items-center justify-between pl-4">
                      <div>
                        <div className="text-sm text-[var(--muted)]">Color Bleed</div>
                        <div className="text-xs text-[var(--muted)]/70">RGB separation at edges</div>
                      </div>
                      <ToggleSwitch
                        checked={props.visualEffects.crtChromaticAberration}
                        onChange={props.onVisualEffectsChange.setCrtChromaticAberration}
                      />
                    </div>

                    {/* Screen Flicker */}
                    <div className="flex items-center justify-between pl-4">
                      <div>
                        <div className="text-sm text-[var(--muted)]">Screen Flicker</div>
                        <div className="text-xs text-[var(--muted)]/70">Random brightness variations</div>
                      </div>
                      <ToggleSwitch
                        checked={props.visualEffects.crtScreenFlicker}
                        onChange={props.onVisualEffectsChange.setCrtScreenFlicker}
                      />
                    </div>

                    {/* CRT Glitch Overlay */}
                    <div className="flex items-center justify-between pl-4">
                      <div>
                        <div className="text-sm text-[var(--muted)]">Glitch Overlay</div>
                        <div className="text-xs text-[var(--muted)]/70">Animated VHS/CRT glitch effect</div>
                      </div>
                      <select
                        value={props.visualEffects.crtGlitchGif ?? 'none'}
                        onChange={(e) => {
                          const val = e.target.value === 'none' ? null : Number(e.target.value)
                          props.onVisualEffectsChange.setCrtGlitchGif(val)
                        }}
                        className="px-3 py-1.5 rounded-lg bg-[var(--surface)] border border-[var(--border)] text-sm"
                      >
                        <option value="none">None</option>
                        <option value="0">Glitch Style 1</option>
                        <option value="1">Glitch Style 2</option>
                        <option value="2">Glitch Style 3</option>
                      </select>
                    </div>
                  </>
                )}

                {/* TV Border with Glass */}
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm">📺 TV Border</div>
                    <div className="text-xs text-[var(--muted)]">Retro TV frame with glass effect</div>
                  </div>
                  <ToggleSwitch
                    checked={props.visualEffects.tvBorder}
                    onChange={props.onVisualEffectsChange.setTvBorder}
                  />
                </div>

                {props.visualEffects.tvBorder && (
                  <>
                    {/* TV Border Style */}
                    <div className="flex items-center justify-between pl-4">
                      <div>
                        <div className="text-sm text-[var(--muted)]">Border Style</div>
                      </div>
                      <select
                        value={props.visualEffects.tvBorderStyle}
                        onChange={(e) => props.onVisualEffectsChange.setTvBorderStyle(e.target.value as 'classic' | 'modern' | 'retro' | 'minimal')}
                        className="px-3 py-1.5 rounded-lg bg-[var(--surface)] border border-[var(--border)] text-sm"
                      >
                        <option value="classic">Classic</option>
                        <option value="retro">Retro Wood</option>
                        <option value="modern">Modern Slim</option>
                        <option value="minimal">Minimal</option>
                      </select>
                    </div>

                    {/* Glass Effect Toggle */}
                    <div className="flex items-center justify-between pl-4">
                      <div>
                        <div className="text-sm text-[var(--muted)]">Glass Reflection</div>
                      </div>
                      <ToggleSwitch
                        checked={props.visualEffects.tvBorderGlass}
                        onChange={props.onVisualEffectsChange.setTvBorderGlass}
                      />
                    </div>

                    {/* Glass Opacity */}
                    {props.visualEffects.tvBorderGlass && (
                      <div className="flex items-center justify-between pl-4">
                        <div className="text-sm text-[var(--muted)]">Glass Intensity</div>
                        <input
                          type="range"
                          min={0.05}
                          max={0.4}
                          step={0.05}
                          value={props.visualEffects.tvBorderGlassOpacity}
                          onChange={(e) => props.onVisualEffectsChange.setTvBorderGlassOpacity(Number(e.target.value))}
                          className="w-24 h-1 accent-[var(--primary)]"
                        />
                      </div>
                    )}

                    {/* Border Padding */}
                    <div className="flex items-center justify-between pl-4">
                      <div className="text-sm text-[var(--muted)]">Border Size</div>
                      <input
                        type="range"
                        min={1}
                        max={8}
                        step={0.5}
                        value={props.visualEffects.tvBorderPadding}
                        onChange={(e) => props.onVisualEffectsChange.setTvBorderPadding(Number(e.target.value))}
                        className="w-24 h-1 accent-[var(--primary)]"
                      />
                    </div>
                  </>
                )}

                {/* Pip-Boy / Fallout Style */}
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm">☢️ Pip-Boy Mode</div>
                    <div className="text-xs text-[var(--muted)]">Fallout-style terminal overlay</div>
                  </div>
                  <ToggleSwitch
                    checked={props.visualEffects.pipBoy}
                    onChange={props.onVisualEffectsChange.setPipBoy}
                  />
                </div>

                {props.visualEffects.pipBoy && (
                  <>
                    {/* Pip-Boy Color */}
                    <div className="flex items-center justify-between pl-4">
                      <div>
                        <div className="text-sm text-[var(--muted)]">Phosphor Color</div>
                      </div>
                      <select
                        value={props.visualEffects.pipBoyColor}
                        onChange={(e) => props.onVisualEffectsChange.setPipBoyColor(e.target.value as 'green' | 'amber' | 'blue' | 'white')}
                        className="px-3 py-1.5 rounded-lg bg-[var(--surface)] border border-[var(--border)] text-sm"
                      >
                        <option value="green">Green (Classic)</option>
                        <option value="amber">Amber (Warm)</option>
                        <option value="blue">Blue (Cool)</option>
                        <option value="white">White (Terminal)</option>
                      </select>
                    </div>

                    {/* Pip-Boy Intensity */}
                    <div className="flex items-center justify-between pl-4">
                      <div className="text-sm text-[var(--muted)]">Intensity</div>
                      <input
                        type="range"
                        min={1}
                        max={10}
                        step={1}
                        value={props.visualEffects.pipBoyIntensity}
                        onChange={(e) => props.onVisualEffectsChange.setPipBoyIntensity(Number(e.target.value))}
                        className="w-24 h-1 accent-[var(--primary)]"
                      />
                    </div>
                  </>
                )}

                {/* Hearts */}
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm">💕 Hearts</div>
                    <div className="text-xs text-[var(--muted)]">Floating hearts rising upward</div>
                  </div>
                  <ToggleSwitch
                    checked={props.visualEffects.hearts}
                    onChange={props.onVisualEffectsChange.setHearts}
                  />
                </div>

                {/* Rain */}
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm">🌧️ Rain</div>
                    <div className="text-xs text-[var(--muted)]">Raindrops on glass effect</div>
                  </div>
                  <ToggleSwitch
                    checked={props.visualEffects.rain}
                    onChange={props.onVisualEffectsChange.setRain}
                  />
                </div>

                {/* Glitch */}
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm">⚡ Glitch</div>
                    <div className="text-xs text-[var(--muted)]">RGB split and screen jitter</div>
                  </div>
                  <ToggleSwitch
                    checked={props.visualEffects.glitch}
                    onChange={props.onVisualEffectsChange.setGlitch}
                  />
                </div>

                {/* Bubbles */}
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm">🫧 Bubbles</div>
                    <div className="text-xs text-[var(--muted)]">Floating bubbles</div>
                  </div>
                  <ToggleSwitch
                    checked={props.visualEffects.bubbles}
                    onChange={props.onVisualEffectsChange.setBubbles}
                  />
                </div>

                {/* Matrix Rain */}
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm">🖥️ Matrix Rain</div>
                    <div className="text-xs text-[var(--muted)]">Falling green characters</div>
                  </div>
                  <ToggleSwitch
                    checked={props.visualEffects.matrix}
                    onChange={props.onVisualEffectsChange.setMatrix}
                  />
                </div>

                {/* Confetti */}
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm">🎊 Confetti</div>
                    <div className="text-xs text-[var(--muted)]">Celebration particles</div>
                  </div>
                  <ToggleSwitch
                    checked={props.visualEffects.confetti}
                    onChange={props.onVisualEffectsChange.setConfetti}
                  />
                </div>
              </div>
            </div>

            <div className="rounded-3xl border border-[var(--border)] bg-black/20 p-5 mt-4">
              <div className="text-sm font-semibold mb-4">Goon Wall Effects</div>
              <div className="space-y-4">
                {/* Heat Overlay */}
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm">🔥 Heat Overlay</div>
                    <div className="text-xs text-[var(--muted)]">Screen warms redder over time</div>
                  </div>
                  <ToggleSwitch
                    checked={s?.goonwall?.visualEffects?.heatOverlay ?? true}
                    onChange={async (v) => {
                      await window.api.settings.goonwall?.update?.({ visualEffects: { ...s?.goonwall?.visualEffects, heatOverlay: v } })
                      const next = await window.api.settings.get()
                      props.patchSettings(next)
                    }}
                  />
                </div>

                {/* Vignette Intensity */}
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm">Vignette</div>
                    <div className="text-xs text-[var(--muted)]">Dark edges focus attention</div>
                  </div>
                  <div className="flex items-center gap-3">
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.1}
                      value={s?.goonwall?.visualEffects?.vignetteIntensity ?? 0.3}
                      onChange={async (e) => {
                        await window.api.settings.goonwall?.update?.({ visualEffects: { ...s?.goonwall?.visualEffects, vignetteIntensity: Number(e.target.value) } })
                        const next = await window.api.settings.get()
                        props.patchSettings(next)
                      }}
                      className="w-20 h-1 accent-[var(--primary)] cursor-pointer"
                    />
                    <span className="text-xs text-[var(--muted)] w-8">{((s?.goonwall?.visualEffects?.vignetteIntensity ?? 0.3) * 100).toFixed(0)}%</span>
                  </div>
                </div>

                {/* Bloom Intensity */}
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm">Bloom</div>
                    <div className="text-xs text-[var(--muted)]">Soft glow effect</div>
                  </div>
                  <div className="flex items-center gap-3">
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.1}
                      value={s?.goonwall?.visualEffects?.bloomIntensity ?? 0.1}
                      onChange={async (e) => {
                        await window.api.settings.goonwall?.update?.({ visualEffects: { ...s?.goonwall?.visualEffects, bloomIntensity: Number(e.target.value) } })
                        const next = await window.api.settings.get()
                        props.patchSettings(next)
                      }}
                      className="w-20 h-1 accent-[var(--primary)] cursor-pointer"
                    />
                    <span className="text-xs text-[var(--muted)] w-8">{((s?.goonwall?.visualEffects?.bloomIntensity ?? 0.1) * 100).toFixed(0)}%</span>
                  </div>
                </div>

                {/* Saturation Boost */}
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm">Saturation</div>
                    <div className="text-xs text-[var(--muted)]">Color intensity boost</div>
                  </div>
                  <div className="flex items-center gap-3">
                    <input
                      type="range"
                      min={0.5}
                      max={2}
                      step={0.1}
                      value={s?.goonwall?.visualEffects?.saturationBoost ?? 1.1}
                      onChange={async (e) => {
                        await window.api.settings.goonwall?.update?.({ visualEffects: { ...s?.goonwall?.visualEffects, saturationBoost: Number(e.target.value) } })
                        const next = await window.api.settings.get()
                        props.patchSettings(next)
                      }}
                      className="w-20 h-1 accent-[var(--primary)] cursor-pointer"
                    />
                    <span className="text-xs text-[var(--muted)] w-8">{(s?.goonwall?.visualEffects?.saturationBoost ?? 1.1).toFixed(1)}x</span>
                  </div>
                </div>

                {/* Contrast Boost */}
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm">Contrast</div>
                    <div className="text-xs text-[var(--muted)]">Light/dark intensity</div>
                  </div>
                  <div className="flex items-center gap-3">
                    <input
                      type="range"
                      min={0.5}
                      max={2}
                      step={0.1}
                      value={s?.goonwall?.visualEffects?.contrastBoost ?? 1.0}
                      onChange={async (e) => {
                        await window.api.settings.goonwall?.update?.({ visualEffects: { ...s?.goonwall?.visualEffects, contrastBoost: Number(e.target.value) } })
                        const next = await window.api.settings.get()
                        props.patchSettings(next)
                      }}
                      className="w-20 h-1 accent-[var(--primary)] cursor-pointer"
                    />
                    <span className="text-xs text-[var(--muted)] w-8">{(s?.goonwall?.visualEffects?.contrastBoost ?? 1.0).toFixed(1)}x</span>
                  </div>
                </div>
              </div>
            </div>

            {/* GoonWords Settings */}
            <div className="rounded-3xl border border-[var(--border)] bg-black/20 p-5 mt-4">
              <div className="text-sm font-semibold mb-4">GoonWords (Floating Text)</div>
              <div className="space-y-4">
                {/* Master Toggle */}
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm">Enable GoonWords</div>
                    <div className="text-xs text-[var(--muted)]">Floating provocative text overlays</div>
                  </div>
                  <ToggleSwitch
                    checked={s?.visualEffects?.goonWords?.enabled ?? false}
                    onChange={async (v) => {
                      const current = s?.visualEffects?.goonWords ?? {}
                      await window.api.settings.visualEffects?.update?.({ goonWords: { ...current, enabled: v } })
                      const next = await window.api.settings.get()
                      props.patchSettings(next)
                    }}
                  />
                </div>

                {s?.visualEffects?.goonWords?.enabled && (
                  <>
                    {/* Word Pack Toggles */}
                    <div className="pt-2">
                      <div className="text-sm mb-2">Word Packs</div>
                      <div className="grid grid-cols-2 gap-2">
                        {(['praise', 'humiliation', 'kink', 'goon', 'mommy', 'brat', 'insult', 'pervert', 'seduction', 'dirty', 'worship', 'denial', 'encouragement'] as const).map(packId => {
                          const packNames: Record<string, string> = {
                            praise: '💕 Praise',
                            humiliation: '😈 Humiliation',
                            kink: '⛓️ Kink',
                            goon: '🧠 Goon',
                            mommy: '👩 Mommy',
                            brat: '😤 Brat',
                            insult: '🔥 Insult',
                            pervert: '👀 Pervert',
                            seduction: '💋 Seduction',
                            dirty: '🔞 Dirty Talk',
                            worship: '🙏 Worship',
                            denial: '🚫 Denial',
                            encouragement: '✨ Encourage'
                          }
                          const enabledPacks = s?.visualEffects?.goonWords?.enabledPacks ?? ['goon', 'kink']
                          const isEnabled = enabledPacks.includes(packId)
                          return (
                            <button
                              key={packId}
                              onClick={async () => {
                                const current = s?.visualEffects?.goonWords ?? {}
                                const newPacks = isEnabled
                                  ? enabledPacks.filter((p: string) => p !== packId)
                                  : [...enabledPacks, packId]
                                await window.api.settings.visualEffects?.update?.({ goonWords: { ...current, enabledPacks: newPacks } })
                                const next = await window.api.settings.get()
                                props.patchSettings(next)
                              }}
                              className={`px-3 py-1.5 rounded-lg text-xs transition-all ${
                                isEnabled
                                  ? 'bg-[var(--primary)] text-white'
                                  : 'bg-white/5 text-[var(--muted)] hover:bg-white/10'
                              }`}
                            >
                              {packNames[packId]}
                            </button>
                          )
                        })}
                      </div>
                    </div>

                    {/* Intensity Slider */}
                    <div className="flex items-center justify-between pt-2">
                      <div>
                        <div className="text-sm">Intensity</div>
                        <div className="text-xs text-[var(--muted)]">Word size & frequency</div>
                      </div>
                      <div className="flex items-center gap-3">
                        <input
                          type="range"
                          min={1}
                          max={10}
                          step={1}
                          value={s?.visualEffects?.goonWords?.intensity ?? 5}
                          onChange={async (e) => {
                            const current = s?.visualEffects?.goonWords ?? {}
                            await window.api.settings.visualEffects?.update?.({ goonWords: { ...current, intensity: Number(e.target.value) } })
                            const next = await window.api.settings.get()
                            props.patchSettings(next)
                          }}
                          className="w-20 h-1 accent-[var(--primary)] cursor-pointer"
                        />
                        <span className="text-xs text-[var(--muted)] w-6 text-right">{s?.visualEffects?.goonWords?.intensity ?? 5}</span>
                      </div>
                    </div>

                    {/* Font Size Slider */}
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-sm">Font Size</div>
                      </div>
                      <div className="flex items-center gap-3">
                        <input
                          type="range"
                          min={16}
                          max={64}
                          step={4}
                          value={s?.visualEffects?.goonWords?.fontSize ?? 32}
                          onChange={async (e) => {
                            const current = s?.visualEffects?.goonWords ?? {}
                            await window.api.settings.visualEffects?.update?.({ goonWords: { ...current, fontSize: Number(e.target.value) } })
                            const next = await window.api.settings.get()
                            props.patchSettings(next)
                          }}
                          className="w-20 h-1 accent-[var(--primary)] cursor-pointer"
                        />
                        <span className="text-xs text-[var(--muted)] w-8">{s?.visualEffects?.goonWords?.fontSize ?? 32}px</span>
                      </div>
                    </div>

                    {/* Font Family */}
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-sm">Font Style</div>
                        <div className="text-xs text-[var(--muted)]">Choose the vibe</div>
                      </div>
                      <select
                        value={s?.visualEffects?.goonWords?.fontFamily ?? 'system-ui'}
                        onChange={async (e) => {
                          const current = s?.visualEffects?.goonWords ?? {}
                          await window.api.settings.visualEffects?.update?.({ goonWords: { ...current, fontFamily: e.target.value } })
                          const next = await window.api.settings.get()
                          props.patchSettings(next)
                        }}
                        className="bg-black/30 border border-[var(--border)] rounded-lg px-2 py-1 text-sm"
                      >
                        <optgroup label="Bold & Impactful">
                          <option value="Impact">Impact (Meme Style)</option>
                          <option value="Arial Black">Arial Black</option>
                          <option value="system-ui">System Default</option>
                        </optgroup>
                        <optgroup label="Sexy & Elegant">
                          <option value="Georgia">Georgia (Classy)</option>
                          <option value="Palatino Linotype">Palatino (Elegant)</option>
                          <option value="Brush Script MT">Brush Script (Feminine)</option>
                        </optgroup>
                        <optgroup label="Edgy & Dark">
                          <option value="Courier New">Courier (Hacker)</option>
                          <option value="Lucida Console">Console (Digital)</option>
                          <option value="Trebuchet MS">Trebuchet (Modern)</option>
                        </optgroup>
                        <optgroup label="Fun & Playful">
                          <option value="Comic Sans MS">Comic Sans (Silly)</option>
                          <option value="Segoe Script">Segoe Script (Handwritten)</option>
                          <option value="Papyrus">Papyrus (Exotic)</option>
                        </optgroup>
                      </select>
                    </div>

                    {/* Color Presets */}
                    <div className="pt-2">
                      <div className="text-sm mb-2">Color Presets</div>
                      <div className="flex flex-wrap gap-2">
                        {[
                          { name: 'Hot Pink', text: '#ffffff', glow: '#ff6b9d' },
                          { name: 'Neon Purple', text: '#e0aaff', glow: '#9d4edd' },
                          { name: 'Fire', text: '#ffcc00', glow: '#ff5500' },
                          { name: 'Ice', text: '#ffffff', glow: '#00d4ff' },
                          { name: 'Blood', text: '#ff0000', glow: '#8b0000' },
                          { name: 'Matrix', text: '#00ff00', glow: '#003300' },
                          { name: 'Gold', text: '#ffd700', glow: '#b8860b' },
                          { name: 'Demon', text: '#ff0066', glow: '#330000' },
                        ].map(preset => (
                          <button
                            key={preset.name}
                            onClick={async () => {
                              const current = s?.visualEffects?.goonWords ?? {}
                              await window.api.settings.visualEffects?.update?.({
                                goonWords: { ...current, fontColor: preset.text, glowColor: preset.glow }
                              })
                              const next = await window.api.settings.get()
                              props.patchSettings(next)
                            }}
                            className="px-2 py-1 rounded text-xs transition hover:scale-105"
                            style={{
                              background: `linear-gradient(135deg, ${preset.glow}40, ${preset.glow}20)`,
                              border: `1px solid ${preset.glow}60`,
                              color: preset.text,
                              textShadow: `0 0 8px ${preset.glow}`
                            }}
                          >
                            {preset.name}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Text Color & Glow Color */}
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-sm">Colors</div>
                        <div className="text-xs text-[var(--muted)]">Text & Glow</div>
                      </div>
                      <div className="flex gap-2">
                        <input
                          type="color"
                          value={s?.visualEffects?.goonWords?.fontColor ?? '#ffffff'}
                          onChange={async (e) => {
                            const current = s?.visualEffects?.goonWords ?? {}
                            await window.api.settings.visualEffects?.update?.({ goonWords: { ...current, fontColor: e.target.value } })
                            const next = await window.api.settings.get()
                            props.patchSettings(next)
                          }}
                          className="w-8 h-8 rounded cursor-pointer border-0"
                          title="Text Color"
                        />
                        <input
                          type="color"
                          value={s?.visualEffects?.goonWords?.glowColor ?? '#ff6b9d'}
                          onChange={async (e) => {
                            const current = s?.visualEffects?.goonWords ?? {}
                            await window.api.settings.visualEffects?.update?.({ goonWords: { ...current, glowColor: e.target.value } })
                            const next = await window.api.settings.get()
                            props.patchSettings(next)
                          }}
                          className="w-8 h-8 rounded cursor-pointer border-0"
                          title="Glow Color"
                        />
                      </div>
                    </div>

                    {/* Frequency Slider */}
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-sm">Frequency</div>
                        <div className="text-xs text-[var(--muted)]">Seconds between words</div>
                      </div>
                      <div className="flex items-center gap-3">
                        <input
                          type="range"
                          min={1}
                          max={10}
                          step={1}
                          value={s?.visualEffects?.goonWords?.frequency ?? 5}
                          onChange={async (e) => {
                            const current = s?.visualEffects?.goonWords ?? {}
                            await window.api.settings.visualEffects?.update?.({ goonWords: { ...current, frequency: Number(e.target.value) } })
                            const next = await window.api.settings.get()
                            props.patchSettings(next)
                          }}
                          className="w-20 h-1 accent-[var(--primary)] cursor-pointer"
                        />
                        <span className="text-xs text-[var(--muted)] w-6 text-right">{s?.visualEffects?.goonWords?.frequency ?? 5}s</span>
                      </div>
                    </div>

                    {/* Duration Slider */}
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-sm">Duration</div>
                        <div className="text-xs text-[var(--muted)]">How long words stay</div>
                      </div>
                      <div className="flex items-center gap-3">
                        <input
                          type="range"
                          min={1}
                          max={8}
                          step={0.5}
                          value={s?.visualEffects?.goonWords?.duration ?? 3}
                          onChange={async (e) => {
                            const current = s?.visualEffects?.goonWords ?? {}
                            await window.api.settings.visualEffects?.update?.({ goonWords: { ...current, duration: Number(e.target.value) } })
                            const next = await window.api.settings.get()
                            props.patchSettings(next)
                          }}
                          className="w-20 h-1 accent-[var(--primary)] cursor-pointer"
                        />
                        <span className="text-xs text-[var(--muted)] w-6 text-right">{s?.visualEffects?.goonWords?.duration ?? 3}s</span>
                      </div>
                    </div>

                    {/* Random Rotation Toggle */}
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-sm">Random Rotation</div>
                        <div className="text-xs text-[var(--muted)]">Tilt words randomly</div>
                      </div>
                      <ToggleSwitch
                        checked={s?.visualEffects?.goonWords?.randomRotation ?? true}
                        onChange={async (v) => {
                          const current = s?.visualEffects?.goonWords ?? {}
                          await window.api.settings.visualEffects?.update?.({ goonWords: { ...current, randomRotation: v } })
                          const next = await window.api.settings.get()
                          props.patchSettings(next)
                        }}
                      />
                    </div>

                    {/* Custom Words */}
                    <div className="pt-2">
                      <div className="text-sm mb-2">Custom Words</div>
                      <textarea
                        value={(s?.visualEffects?.goonWords?.customWords ?? []).join('\n')}
                        onChange={async (e) => {
                          const current = s?.visualEffects?.goonWords ?? {}
                          const customWords = e.target.value.split('\n').filter(w => w.trim())
                          await window.api.settings.visualEffects?.update?.({ goonWords: { ...current, customWords } })
                          const next = await window.api.settings.get()
                          props.patchSettings(next)
                        }}
                        placeholder="Add custom words (one per line)..."
                        className="w-full h-20 px-3 py-2 rounded-lg bg-black/30 border border-[var(--border)] text-sm resize-none"
                      />
                      {/* Quick-add buttons */}
                      <div className="mt-2">
                        <div className="text-xs text-[var(--muted)] mb-1">Quick Add:</div>
                        <div className="flex flex-wrap gap-1">
                          {[
                            'FUCK YES', 'SO HORNY', 'NEED IT', 'DRIPPING', 'ACHING',
                            'MORE MORE MORE', 'DON\'T STOP', 'RIGHT THERE', 'HARDER', 'DEEPER'
                          ].map(word => (
                            <button
                              key={word}
                              onClick={async () => {
                                const goonWords = s?.visualEffects?.goonWords
                                const customWords = [...(goonWords?.customWords ?? [])]
                                if (!customWords.includes(word)) {
                                  customWords.push(word)
                                  await window.api.settings.visualEffects?.update?.({ goonWords: { ...goonWords, customWords } })
                                  const next = await window.api.settings.get()
                                  props.patchSettings(next)
                                }
                              }}
                              className="px-1.5 py-0.5 rounded text-[10px] bg-white/5 hover:bg-white/10 text-[var(--muted)] hover:text-white transition"
                            >
                              + {word}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Word Count Info */}
                    <div className="pt-2 text-xs text-[var(--muted)] border-t border-[var(--border)]">
                      <div className="flex justify-between">
                        <span>Active word packs: {(s?.visualEffects?.goonWords?.enabledPacks ?? ['goon', 'kink']).length}</span>
                        <span>Custom words: {(s?.visualEffects?.goonWords?.customWords ?? []).length}</span>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>

            <div className="rounded-3xl border border-[var(--border)] bg-black/20 p-5 mt-4">
              <div className="text-sm font-semibold mb-2">Heat Effects Info</div>
              <div className="text-xs text-[var(--muted)] space-y-1">
                <p>Heat level controls intensity of visual effects that build over time:</p>
                <p>• Level 3+: Pleasure particles appear</p>
                <p>• Level 4+: Heartbeat pulse effect</p>
                <p>• Level 5+: Heat shimmer distortion</p>
                <p>• Level 6+: Desire ripples</p>
                <p>• Level 7+: Passion trail effects</p>
                <p>• Level 8+: Seduction wave overlay</p>
              </div>
            </div>
            </>
          )}

          {/* Playback Tab */}
          {activeTab === 'playback' && (
            <>
            <div className="rounded-3xl border border-[var(--border)] bg-black/20 p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="text-sm font-semibold">Playback Settings</div>
                <button
                  onClick={async () => {
                    if (confirm('Reset all Playback settings to defaults?')) {
                      try {
                        const next = await window.api.settings.resetSection?.('playback')
                        if (next) {
                          props.patchSettings(next)
                          showToast('success', 'Playback settings reset')
                        }
                      } catch (err: any) {
                        console.error('Failed to reset playback settings:', err)
                        showToast('error', err?.message ?? 'Failed to reset settings')
                      }
                    }
                  }}
                  className="text-xs px-2 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-[var(--muted)] hover:text-white transition"
                >
                  Reset to Defaults
                </button>
              </div>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm">Autoplay</div>
                    <div className="text-xs text-[var(--muted)]">Automatically play next item</div>
                  </div>
                  <ToggleSwitch
                    checked={playbackSettings.autoplayNext ?? false}
                    onChange={async (v) => {
                      await window.api.settings.playback?.update?.({ autoplayNext: v })
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
                    checked={playbackSettings.loopSingle ?? false}
                    onChange={async (v) => {
                      await window.api.settings.playback?.update?.({ loopSingle: v })
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

            {/* Video Quality Settings */}
            <div className="rounded-3xl border border-[var(--border)] bg-black/20 p-5 mt-4">
              <div className="text-sm font-semibold mb-4">Video Quality</div>
              <div className="space-y-4">
                {/* Low Quality Mode */}
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm">Low Quality Mode</div>
                    <div className="text-xs text-[var(--muted)]">Degrade all videos for retro/amateur aesthetic</div>
                  </div>
                  <ToggleSwitch
                    checked={playbackSettings.lowQualityMode ?? false}
                    onChange={async (v) => {
                      await window.api.settings.playback?.update?.({ lowQualityMode: v })
                      const next = await window.api.settings.get()
                      props.patchSettings(next)
                    }}
                  />
                </div>

                {/* Default Resolution */}
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm">Default Resolution</div>
                    <div className="text-xs text-[var(--muted)]">Preferred playback quality</div>
                  </div>
                  <select
                    value={playbackSettings.defaultResolution ?? 'original'}
                    onChange={async (e) => {
                      await window.api.settings.playback?.update?.({ defaultResolution: e.target.value })
                      const next = await window.api.settings.get()
                      props.patchSettings(next)
                    }}
                    className="bg-black/40 border border-[var(--border)] rounded-lg px-3 py-1.5 text-sm"
                  >
                    <option value="original">Original</option>
                    <option value="1080p">1080p HD</option>
                    <option value="720p">720p</option>
                    <option value="480p">480p</option>
                    <option value="360p">360p</option>
                    <option value="240p">240p (Low)</option>
                  </select>
                </div>

                {/* Low Quality Intensity */}
                {playbackSettings.lowQualityMode && (
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm">Degradation Level</div>
                      <div className="text-xs text-[var(--muted)]">How "bad" the quality looks</div>
                    </div>
                    <div className="flex items-center gap-3">
                      <input
                        type="range"
                        min={1}
                        max={10}
                        step={1}
                        value={playbackSettings.lowQualityIntensity ?? 5}
                        onChange={async (e) => {
                          await window.api.settings.playback?.update?.({ lowQualityIntensity: Number(e.target.value) })
                          const next = await window.api.settings.get()
                          props.patchSettings(next)
                        }}
                        className="w-24 h-1 accent-[var(--primary)] cursor-pointer"
                      />
                      <span className="text-xs text-[var(--muted)] w-6">{playbackSettings.lowQualityIntensity ?? 5}</span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Hardware Encoder Settings */}
            <HardwareEncoderSettings />
            </>
          )}

          {/* Sound Tab */}
          {activeTab === 'sound' && (
            <>
              <div className="rounded-3xl border border-[var(--border)] bg-black/20 p-5">
                <div className="flex items-center justify-between mb-4">
                  <div className="text-sm font-semibold">Sound Settings</div>
                  <button
                    onClick={async () => {
                      if (confirm('Reset all Sound settings to defaults?')) {
                        try {
                          const next = await window.api.settings.resetSection?.('sound')
                          if (next) {
                            props.patchSettings(next)
                            showToast('success', 'Sound settings reset')
                          }
                        } catch (err: any) {
                          console.error('Failed to reset sound settings:', err)
                          showToast('error', err?.message ?? 'Failed to reset settings')
                        }
                      }
                    }}
                    className="text-xs px-2 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-[var(--muted)] hover:text-white transition"
                  >
                    Reset to Defaults
                  </button>
                </div>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm">Enable Sounds</div>
                      <div className="text-xs text-[var(--muted)]">Master sound toggle</div>
                    </div>
                    <ToggleSwitch
                      checked={s?.sound?.enabled ?? true}
                      onChange={async (v) => {
                        await window.api.settings.update?.({ sound: { ...s?.sound, enabled: v } })
                        const next = await window.api.settings.get()
                        props.patchSettings(next)
                      }}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm">UI Sounds</div>
                      <div className="text-xs text-[var(--muted)]">Click and interaction sounds</div>
                    </div>
                    <ToggleSwitch
                      checked={s?.sound?.uiSoundsEnabled ?? true}
                      onChange={async (v) => {
                        await window.api.settings.update?.({ sound: { ...s?.sound, uiSoundsEnabled: v } })
                        const next = await window.api.settings.get()
                        props.patchSettings(next)
                      }}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm">Voice Sounds</div>
                      <div className="text-xs text-[var(--muted)]">Voice lines and reactions</div>
                    </div>
                    <ToggleSwitch
                      checked={s?.sound?.voiceSoundsEnabled ?? true}
                      onChange={async (v) => {
                        await window.api.settings.update?.({ sound: { ...s?.sound, voiceSoundsEnabled: v } })
                        const next = await window.api.settings.get()
                        props.patchSettings(next)
                      }}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm">Master Volume</div>
                      <div className="text-xs text-[var(--muted)]">Overall sound volume</div>
                    </div>
                    <div className="flex items-center gap-3">
                      <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.1}
                        value={s?.sound?.volume ?? 0.5}
                        onChange={async (e) => {
                          await window.api.settings.update?.({ sound: { ...s?.sound, volume: Number(e.target.value) } })
                          const next = await window.api.settings.get()
                          props.patchSettings(next)
                        }}
                        className="w-24 h-1 accent-[var(--primary)] cursor-pointer"
                      />
                      <span className="text-xs text-[var(--muted)] w-8">{Math.round((s?.sound?.volume ?? 0.5) * 100)}%</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Ambience Settings */}
              <div className="rounded-3xl border border-[var(--border)] bg-black/20 p-5 mt-4">
                <div className="text-sm font-semibold mb-4">Ambience</div>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm">Enable Ambience</div>
                      <div className="text-xs text-[var(--muted)]">Background ambience sounds</div>
                    </div>
                    <ToggleSwitch
                      checked={s?.sound?.ambienceEnabled ?? false}
                      onChange={async (v) => {
                        await window.api.settings.update?.({ sound: { ...s?.sound, ambienceEnabled: v } })
                        const next = await window.api.settings.get()
                        props.patchSettings(next)
                      }}
                    />
                  </div>

                  {s?.sound?.ambienceEnabled && (
                    <>
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-sm">Ambience Track</div>
                          <div className="text-xs text-[var(--muted)]">Background sound</div>
                        </div>
                        <select
                          value={s?.sound?.ambienceTrack ?? 'none'}
                          onChange={async (e) => {
                            await window.api.settings.update?.({ sound: { ...s?.sound, ambienceTrack: e.target.value } })
                            const next = await window.api.settings.get()
                            props.patchSettings(next)
                          }}
                          className="bg-black/40 border border-[var(--border)] rounded-lg px-3 py-1.5 text-sm"
                        >
                          <option value="none">None</option>
                          <option value="soft_moans">Soft Moans</option>
                          <option value="breathing">Breathing</option>
                          <option value="heartbeat">Heartbeat</option>
                          <option value="rain">Rain</option>
                        </select>
                      </div>

                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-sm">Ambience Volume</div>
                          <div className="text-xs text-[var(--muted)]">Background sound level</div>
                        </div>
                        <div className="flex items-center gap-3">
                          <input
                            type="range"
                            min={0}
                            max={1}
                            step={0.1}
                            value={s?.sound?.ambienceVolume ?? 0.3}
                            onChange={async (e) => {
                              await window.api.settings.update?.({ sound: { ...s?.sound, ambienceVolume: Number(e.target.value) } })
                              const next = await window.api.settings.get()
                              props.patchSettings(next)
                            }}
                            className="w-24 h-1 accent-[var(--primary)] cursor-pointer"
                          />
                          <span className="text-xs text-[var(--muted)] w-8">{Math.round((s?.sound?.ambienceVolume ?? 0.3) * 100)}%</span>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </>
          )}

          {/* Data Tab */}
          {activeTab === 'data' && (
            <>
              <div className="rounded-3xl border border-[var(--border)] bg-black/20 p-5">
                <div className="text-sm font-semibold mb-4">Backup & Data</div>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm">Auto Backup</div>
                      <div className="text-xs text-[var(--muted)]">Automatically backup settings</div>
                    </div>
                    <ToggleSwitch
                      checked={s?.data?.autoBackupEnabled ?? false}
                      onChange={async (v) => {
                        await window.api.settings.data?.update?.({ autoBackupEnabled: v })
                        const next = await window.api.settings.get()
                        props.patchSettings(next)
                      }}
                    />
                  </div>

                  {s?.data?.autoBackupEnabled && (
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-sm">Backup Interval</div>
                        <div className="text-xs text-[var(--muted)]">Days between backups</div>
                      </div>
                      <select
                        value={s?.data?.autoBackupIntervalDays ?? 7}
                        onChange={async (e) => {
                          await window.api.settings.data?.update?.({ autoBackupIntervalDays: Number(e.target.value) })
                          const next = await window.api.settings.get()
                          props.patchSettings(next)
                        }}
                        className="bg-black/40 border border-[var(--border)] rounded-lg px-3 py-1.5 text-sm"
                      >
                        <option value={1}>Daily</option>
                        <option value={3}>Every 3 days</option>
                        <option value={7}>Weekly</option>
                        <option value={14}>Every 2 weeks</option>
                        <option value={30}>Monthly</option>
                      </select>
                    </div>
                  )}

                  {s?.data?.lastBackupDate && (
                    <div className="text-xs text-[var(--muted)]">
                      Last backup: {new Date(s.data.lastBackupDate).toLocaleDateString()}
                    </div>
                  )}
                </div>
              </div>

              {/* Export/Import */}
              <div className="rounded-3xl border border-[var(--border)] bg-black/20 p-5 mt-4">
                <div className="text-sm font-semibold mb-4">Export & Import</div>
                <div className="flex gap-3">
                  <Btn
                    onClick={async () => {
                      try {
                        const filePath = await window.api.data?.exportSettings?.()
                        if (filePath) {
                          showToast('success', 'Settings exported successfully!')
                        }
                      } catch (err) {
                        showToast('error', 'Failed to export settings')
                      }
                    }}
                  >
                    <Download size={14} />
                    Export Settings
                  </Btn>
                  <Btn
                    onClick={async () => {
                      try {
                        const result = await window.api.data?.importSettings?.()
                        if (result) {
                          const next = await window.api.settings.get()
                          props.patchSettings(next)
                          showToast('success', 'Settings imported! Some changes may require restart.')
                        }
                      } catch (err) {
                        showToast('error', 'Failed to import settings')
                      }
                    }}
                  >
                    <ArrowUp size={14} />
                    Import Settings
                  </Btn>
                </div>
                <p className="text-xs text-[var(--muted)] mt-3">
                  Export your settings to a JSON file for backup, or import settings from a previous backup.
                </p>
              </div>

              {/* Settings Profiles */}
              <div className="rounded-3xl border border-[var(--border)] bg-black/20 p-5 mt-4">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <div className="text-sm font-semibold">Settings Profiles</div>
                    <div className="text-xs text-[var(--muted)]">Save and switch between different configurations</div>
                  </div>
                  <Btn onClick={() => setShowCreateProfileModal(true)}>
                    <Plus size={14} />
                    New Profile
                  </Btn>
                </div>

                {profiles.length === 0 ? (
                  <div className="text-sm text-[var(--muted)] text-center py-6">
                    No profiles yet. Create one to save your current settings.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {profiles.map(profile => (
                      <div
                        key={profile.id}
                        className={`flex items-center justify-between p-3 rounded-xl border transition-colors ${
                          activeProfileId === profile.id
                            ? 'border-[var(--primary)] bg-[var(--primary)]/10'
                            : 'border-[var(--border)] bg-black/20 hover:bg-black/30'
                        }`}
                      >
                        <div className="flex-1 min-w-0">
                          {renamingProfileId === profile.id ? (
                            <input
                              type="text"
                              value={renameProfileName}
                              onChange={(e) => setRenameProfileName(e.target.value)}
                              onKeyDown={async (e) => {
                                if (e.key === 'Enter' && renameProfileName.trim()) {
                                  try {
                                    await window.api.profiles?.rename?.(profile.id, renameProfileName.trim())
                                    setRenamingProfileId(null)
                                    loadProfiles()
                                  } catch (err: any) {
                                    showToast('error', err?.message ?? 'Failed to rename profile')
                                  }
                                } else if (e.key === 'Escape') {
                                  setRenamingProfileId(null)
                                }
                              }}
                              onBlur={async () => {
                                if (renameProfileName.trim() && renameProfileName !== profile.name) {
                                  try {
                                    await window.api.profiles?.rename?.(profile.id, renameProfileName.trim())
                                    loadProfiles()
                                  } catch (err: any) {
                                    showToast('error', err?.message ?? 'Failed to rename profile')
                                  }
                                }
                                setRenamingProfileId(null)
                              }}
                              autoFocus
                              className="bg-black/40 border border-[var(--border)] rounded px-2 py-1 text-sm w-full max-w-[200px]"
                            />
                          ) : (
                            <>
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium truncate">{profile.name}</span>
                                {activeProfileId === profile.id && (
                                  <span className="text-xs px-2 py-0.5 rounded-full bg-[var(--primary)] text-white">Active</span>
                                )}
                              </div>
                              {profile.description && (
                                <div className="text-xs text-[var(--muted)] truncate">{profile.description}</div>
                              )}
                              <div className="text-xs text-[var(--muted)]">
                                Updated {new Date(profile.updatedAt).toLocaleDateString()}
                              </div>
                            </>
                          )}
                        </div>
                        <div className="flex items-center gap-1 ml-3">
                          {activeProfileId !== profile.id && (
                            <Btn
                              className="text-xs px-2 py-1"
                              onClick={async () => {
                                try {
                                  await window.api.profiles?.load?.(profile.id)
                                  const next = await window.api.settings.get()
                                  props.patchSettings(next)
                                  setActiveProfileId(profile.id)
                                  showToast('success', `Loaded profile "${profile.name}"`)
                                } catch (err: any) {
                                  showToast('error', err?.message ?? 'Failed to load profile')
                                }
                              }}
                              title="Load this profile"
                            >
                              <ArrowUp size={12} style={{ transform: 'rotate(90deg)' }} />
                              Load
                            </Btn>
                          )}
                          <Btn
                            className="text-xs px-2 py-1"
                            onClick={async () => {
                              try {
                                await window.api.profiles?.save?.(profile.id)
                                loadProfiles()
                                showToast('success', `Saved current settings to "${profile.name}"`)
                              } catch (err: any) {
                                showToast('error', err?.message ?? 'Failed to save profile')
                              }
                            }}
                            title="Save current settings to this profile"
                          >
                            <Save size={12} />
                          </Btn>
                          <Btn
                            className="text-xs px-2 py-1"
                            onClick={() => {
                              setRenamingProfileId(profile.id)
                              setRenameProfileName(profile.name)
                            }}
                            title="Rename profile"
                          >
                            <Edit2 size={12} />
                          </Btn>
                          <Btn
                            className="text-xs px-2 py-1"
                            tone="danger"
                            onClick={async () => {
                              if (confirm(`Delete profile "${profile.name}"?`)) {
                                try {
                                  await window.api.profiles?.delete?.(profile.id)
                                  if (activeProfileId === profile.id) {
                                    setActiveProfileId(null)
                                  }
                                  loadProfiles()
                                  showToast('success', 'Profile deleted')
                                } catch (err: any) {
                                  showToast('error', err?.message ?? 'Failed to delete profile')
                                }
                              }
                            }}
                            title="Delete profile"
                          >
                            <Trash2 size={12} />
                          </Btn>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {activeProfileId && (
                  <div className="mt-4 pt-4 border-t border-[var(--border)]">
                    <Btn
                      onClick={async () => {
                        await window.api.profiles?.clearActive?.()
                        setActiveProfileId(null)
                        showToast('info', 'Cleared active profile')
                      }}
                    >
                      Clear Active Profile
                    </Btn>
                    <p className="text-xs text-[var(--muted)] mt-2">
                      Settings will no longer be linked to a profile.
                    </p>
                  </div>
                )}
              </div>

              {/* Create Profile Modal */}
              {showCreateProfileModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
                  <div className="bg-[var(--bg)] rounded-3xl border border-[var(--border)] p-6 w-full max-w-md">
                    <h3 className="text-lg font-semibold mb-4">Create Settings Profile</h3>
                    <p className="text-sm text-[var(--muted)] mb-4">
                      Save your current settings as a new profile that you can switch to later.
                    </p>
                    <div className="space-y-4">
                      <div>
                        <label className="text-sm mb-1 block">Profile Name</label>
                        <input
                          type="text"
                          value={newProfileName}
                          onChange={(e) => setNewProfileName(e.target.value)}
                          placeholder="e.g., Chill Mode, Work Mode"
                          className="w-full bg-black/40 border border-[var(--border)] rounded-lg px-3 py-2 text-sm"
                          autoFocus
                        />
                      </div>
                      <div>
                        <label className="text-sm mb-1 block">Description (optional)</label>
                        <input
                          type="text"
                          value={newProfileDesc}
                          onChange={(e) => setNewProfileDesc(e.target.value)}
                          placeholder="e.g., Relaxed settings with slow transitions"
                          className="w-full bg-black/40 border border-[var(--border)] rounded-lg px-3 py-2 text-sm"
                        />
                      </div>
                    </div>
                    <div className="flex justify-end gap-3 mt-6">
                      <Btn
                        tone="ghost"
                        onClick={() => {
                          setShowCreateProfileModal(false)
                          setNewProfileName('')
                          setNewProfileDesc('')
                        }}
                      >
                        Cancel
                      </Btn>
                      <Btn
                        onClick={async () => {
                          if (!newProfileName.trim()) {
                            showToast('error', 'Please enter a profile name')
                            return
                          }
                          try {
                            const profile = await window.api.profiles?.create?.(newProfileName.trim(), newProfileDesc.trim() || undefined)
                            if (profile) {
                              await window.api.profiles?.save?.(profile.id)
                              setActiveProfileId(profile.id)
                              loadProfiles()
                              showToast('success', `Created profile "${newProfileName}"`)
                            }
                            setShowCreateProfileModal(false)
                            setNewProfileName('')
                            setNewProfileDesc('')
                          } catch (err: any) {
                            showToast('error', err?.message ?? 'Failed to create profile')
                          }
                        }}
                      >
                        Create Profile
                      </Btn>
                    </div>
                  </div>
                </div>
              )}

              {/* Error Logs */}
              <div className="rounded-3xl border border-[var(--border)] bg-black/20 p-5 mt-4">
                <div className="text-sm font-semibold mb-4">Error Logs</div>
                <p className="text-xs text-[var(--muted)] mb-4">
                  View and copy error logs for debugging. Logs are stored locally and never sent anywhere.
                </p>
                <div className="flex gap-3 flex-wrap">
                  <Btn
                    onClick={async () => {
                      try {
                        const content = await window.api.logs?.getContent?.()
                        if (content) {
                          await navigator.clipboard.writeText(content)
                          showToast('success', 'Error logs copied to clipboard!')
                        } else {
                          showToast('info', 'No logs to copy')
                        }
                      } catch (err) {
                        showToast('error', 'Failed to copy logs')
                      }
                    }}
                  >
                    <Copy size={14} />
                    Copy All Logs
                  </Btn>
                  <Btn
                    onClick={async () => {
                      try {
                        const errors = await window.api.logs?.getErrors?.(20)
                        if (errors && errors.length > 0) {
                          const text = errors.map((e: { timestamp: string; source: string; message: string }) =>
                            `[${e.timestamp}] ${e.source}: ${e.message}`
                          ).join('\n')
                          await navigator.clipboard.writeText(text)
                          showToast('success', `Copied ${errors.length} recent errors!`)
                        } else {
                          showToast('info', 'No errors logged')
                        }
                      } catch (err) {
                        showToast('error', 'Failed to copy errors')
                      }
                    }}
                  >
                    <AlertCircle size={14} />
                    Copy Recent Errors
                  </Btn>
                  <Btn
                    onClick={async () => {
                      try {
                        const path = await window.api.logs?.getLogFilePath?.()
                        if (path) {
                          await window.api.shell?.openPath?.(path.replace(/[^\\\/]+$/, ''))
                          showToast('success', 'Opened logs folder')
                        }
                      } catch (err) {
                        showToast('error', 'Failed to open logs folder')
                      }
                    }}
                  >
                    <Folder size={14} />
                    Open Logs Folder
                  </Btn>
                  <Btn
                    tone="ghost"
                    onClick={async () => {
                      try {
                        const result = await window.api.logs?.clear?.()
                        if (result?.success) {
                          showToast('success', 'Logs cleared!')
                        } else {
                          showToast('error', result?.error || 'Failed to clear logs')
                        }
                      } catch (err) {
                        showToast('error', 'Failed to clear logs')
                      }
                    }}
                  >
                    <Trash2 size={14} />
                    Clear Logs
                  </Btn>
                </div>
              </div>

              {/* Performance Settings */}
              <div className="rounded-3xl border border-[var(--border)] bg-black/20 p-5 mt-4">
                <div className="text-sm font-semibold mb-4">Performance</div>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm">Memory Limit</div>
                      <div className="text-xs text-[var(--muted)]">Max RAM for caching (restart required)</div>
                    </div>
                    <select
                      value={s?.performance?.maxMemoryMB ?? 2048}
                      onChange={async (e) => {
                        await window.api.settings.update?.({ performance: { ...s?.performance, maxMemoryMB: Number(e.target.value) } })
                        const next = await window.api.settings.get()
                        props.patchSettings(next)
                      }}
                      className="bg-black/40 border border-[var(--border)] rounded-lg px-3 py-1.5 text-sm"
                    >
                      <option value={512}>512 MB (Low)</option>
                      <option value={1024}>1 GB</option>
                      <option value={2048}>2 GB (Default)</option>
                      <option value={4096}>4 GB</option>
                      <option value={8192}>8 GB (High)</option>
                    </select>
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm">Thumbnail Cache</div>
                      <div className="text-xs text-[var(--muted)]">Number of thumbnails to keep in memory</div>
                    </div>
                    <select
                      value={s?.performance?.thumbnailCacheSize ?? 2000}
                      onChange={async (e) => {
                        await window.api.settings.update?.({ performance: { ...s?.performance, thumbnailCacheSize: Number(e.target.value) } })
                        const next = await window.api.settings.get()
                        props.patchSettings(next)
                      }}
                      className="bg-black/40 border border-[var(--border)] rounded-lg px-3 py-1.5 text-sm"
                    >
                      <option value={500}>500 (Low)</option>
                      <option value={1000}>1,000</option>
                      <option value={2000}>2,000 (Default)</option>
                      <option value={5000}>5,000</option>
                      <option value={10000}>10,000 (High)</option>
                    </select>
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm">Video Concurrency</div>
                      <div className="text-xs text-[var(--muted)]">Max simultaneous video loads</div>
                    </div>
                    <select
                      value={s?.performance?.videoConcurrency ?? 4}
                      onChange={async (e) => {
                        await window.api.settings.update?.({ performance: { ...s?.performance, videoConcurrency: Number(e.target.value) } })
                        const next = await window.api.settings.get()
                        props.patchSettings(next)
                      }}
                      className="bg-black/40 border border-[var(--border)] rounded-lg px-3 py-1.5 text-sm"
                    >
                      <option value={1}>1 (Low)</option>
                      <option value={2}>2</option>
                      <option value={4}>4 (Default)</option>
                      <option value={8}>8</option>
                      <option value={16}>16 (High)</option>
                    </select>
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm">Low Memory Mode</div>
                      <div className="text-xs text-[var(--muted)]">Reduce memory at cost of performance</div>
                    </div>
                    <ToggleSwitch
                      checked={s?.performance?.lowMemoryMode ?? false}
                      onChange={async (v) => {
                        await window.api.settings.update?.({ performance: { ...s?.performance, lowMemoryMode: v } })
                        const next = await window.api.settings.get()
                        props.patchSettings(next)
                      }}
                    />
                  </div>
                </div>
                <p className="text-xs text-[var(--muted)] mt-4">
                  Higher values use more RAM but improve performance. Restart required for memory limit changes.
                </p>
              </div>
            </>
          )}

          {/* Services Tab - Privacy */}
          {activeTab === 'services' && (
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

          {/* Blacklist Section - under Services */}
          {activeTab === 'services' && (
            <div className="rounded-3xl border border-[var(--border)] bg-black/20 p-5 mt-4">
              <div className="text-sm font-semibold mb-4">Content Blacklist</div>
              <div className="space-y-4">
                {/* Master Toggle */}
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm">Enable Blacklist</div>
                    <div className="text-xs text-[var(--muted)]">Hide content with selected tags</div>
                  </div>
                  <ToggleSwitch
                    checked={s?.blacklist?.enabled ?? true}
                    onChange={async (v) => {
                      await window.api.settings.blacklist?.update?.({ enabled: v })
                      const next = await window.api.settings.get()
                      props.patchSettings(next)
                    }}
                  />
                </div>

                {s?.blacklist?.enabled && (
                  <>
                    {/* Blacklisted Tags */}
                    <div className="pt-2">
                      <div className="text-sm mb-2">Blacklisted Tags</div>
                      <div className="text-xs text-[var(--muted)] mb-3">
                        Content with these tags won't appear in Library, Goon Wall, or random shuffle
                      </div>

                      {/* Current blacklisted tags */}
                      {(s?.blacklist?.tags?.length ?? 0) > 0 && (
                        <div className="flex flex-wrap gap-2 mb-3">
                          {(s?.blacklist?.tags ?? []).map((tag: string) => (
                            <button
                              key={tag}
                              onClick={async () => {
                                await window.api.settings.blacklist?.removeTag?.(tag)
                                const next = await window.api.settings.get()
                                props.patchSettings(next)
                              }}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-red-500/20 border border-red-500/30 text-red-400 text-xs hover:bg-red-500/30 transition"
                            >
                              <span>{tag}</span>
                              <X size={12} />
                            </button>
                          ))}
                        </div>
                      )}

                      {/* Add tag dropdown */}
                      <div className="flex gap-2">
                        <select
                          className="flex-1 px-3 py-2 rounded-xl bg-black/30 border border-[var(--border)] text-sm focus:outline-none focus:border-[var(--primary)]"
                          onChange={async (e) => {
                            const tag = e.target.value
                            if (tag && !(s?.blacklist?.tags ?? []).includes(tag)) {
                              await window.api.settings.blacklist?.addTag?.(tag)
                              const next = await window.api.settings.get()
                              props.patchSettings(next)
                            }
                            e.target.value = ''
                          }}
                          defaultValue=""
                        >
                          <option value="" disabled>Add tag to blacklist...</option>
                          {allTags
                            .filter(tag => !(s?.blacklist?.tags ?? []).includes(tag))
                            .sort()
                            .map(tag => (
                              <option key={tag} value={tag}>{tag}</option>
                            ))
                          }
                        </select>
                      </div>
                    </div>

                    {/* Blacklisted count info */}
                    <div className="pt-2 text-xs text-[var(--muted)]">
                      {(s?.blacklist?.tags?.length ?? 0)} tag{(s?.blacklist?.tags?.length ?? 0) !== 1 ? 's' : ''} blacklisted
                      {(s?.blacklist?.mediaIds?.length ?? 0) > 0 && (
                        <>, {s?.blacklist?.mediaIds?.length} specific item{s?.blacklist?.mediaIds?.length !== 1 ? 's' : ''}</>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Mobile Sync Section - under Services */}
          {activeTab === 'services' && (
            <div className="rounded-3xl border border-[var(--border)] bg-black/20 p-5 mt-4">
              <div className="text-sm font-semibold mb-4">Mobile Sync</div>
              <div className="space-y-4">
                {/* Server Toggle */}
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm">Sync Server</div>
                    <div className="text-xs text-[var(--muted)]">
                      {mobileSyncStatus?.running
                        ? `Running on port ${mobileSyncStatus.port}`
                        : 'Start server to connect mobile devices'}
                    </div>
                  </div>
                  <ToggleSwitch
                    checked={mobileSyncStatus?.running ?? false}
                    onChange={toggleMobileSyncServer}
                  />
                </div>

                {/* Server Status when running */}
                {mobileSyncStatus?.running && (
                  <>
                    {/* Server addresses */}
                    <div className="bg-black/30 rounded-xl p-3">
                      <div className="text-xs text-[var(--muted)] mb-2">Connect from your mobile device:</div>
                      <div className="space-y-1">
                        {mobileSyncStatus.addresses.map((addr, i) => (
                          <div key={i} className="text-sm font-mono text-[var(--primary)]">
                            http://{addr}:{mobileSyncStatus.port}
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Pairing Code & QR */}
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <div>
                          <div className="text-sm">Pairing Code</div>
                          <div className="text-xs text-[var(--muted)]">
                            {mobilePairingCode
                              ? 'Scan QR code or enter code manually'
                              : 'Generate a code to pair a new device'}
                          </div>
                        </div>
                        {!mobilePairingCode && (
                          <button
                            onClick={generateMobilePairingCode}
                            className="px-4 py-2 rounded-xl bg-[var(--primary)]/20 text-[var(--primary)] hover:bg-[var(--primary)]/30 transition text-sm font-medium"
                          >
                            Generate Code
                          </button>
                        )}
                      </div>

                      {mobilePairingCode && mobileSyncStatus?.addresses?.[0] && (
                        <div className="flex flex-col items-center gap-4 p-4 bg-black/30 rounded-xl">
                          {/* QR Code */}
                          <div className="bg-white p-3 rounded-xl">
                            <QRCodeSVG
                              value={JSON.stringify({
                                host: mobileSyncStatus.addresses[0],
                                port: mobileSyncStatus.port,
                                code: mobilePairingCode
                              })}
                              size={160}
                              level="M"
                            />
                          </div>

                          {/* Manual Code */}
                          <div className="text-center">
                            <div className="text-xs text-[var(--muted)] mb-1">Or enter code manually:</div>
                            <div className="flex items-center justify-center gap-2">
                              <span className="text-3xl font-mono font-bold tracking-[0.3em] text-[var(--primary)]">
                                {mobilePairingCode}
                              </span>
                            </div>
                          </div>

                          {/* Connection Info */}
                          <div className="text-center">
                            <div className="text-xs text-[var(--muted)]">Server Address:</div>
                            <div className="text-sm font-mono text-[var(--primary)]">
                              {mobileSyncStatus.addresses[0]}:{mobileSyncStatus.port}
                            </div>
                          </div>

                          {/* Cancel Button */}
                          <button
                            onClick={() => setMobilePairingCode(null)}
                            className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 transition text-sm"
                          >
                            Cancel
                          </button>

                          {/* Timer */}
                          <div className="text-xs text-[var(--muted)]">
                            Code expires in 5 minutes
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Paired Devices */}
                    <div className="pt-2">
                      <div className="text-sm mb-2">Paired Devices</div>
                      {mobilePairedDevices.length === 0 ? (
                        <div className="text-xs text-[var(--muted)]">
                          No devices paired yet
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {mobilePairedDevices.map((device) => (
                            <div
                              key={device.id}
                              className="flex items-center justify-between p-3 bg-black/30 rounded-xl"
                            >
                              <div>
                                <div className="text-sm font-medium">{device.name}</div>
                                <div className="text-xs text-[var(--muted)]">
                                  {device.platform} • Last seen {new Date(device.lastSeen).toLocaleDateString()}
                                </div>
                              </div>
                              <button
                                onClick={() => unpairDevice(device.id)}
                                className="px-3 py-1.5 rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30 transition text-xs"
                              >
                                Unpair
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </>
                )}

                {/* Info when server is off */}
                {!mobileSyncStatus?.running && (
                  <div className="text-xs text-[var(--muted)] bg-black/20 rounded-xl p-3">
                    Enable the sync server to browse and stream your library from the Vault mobile app.
                    Both devices must be on the same local network.
                  </div>
                )}
              </div>
            </div>
          )}

        </div>
      </div>
    </>
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
  const [vaultStats, setVaultStats] = useState<any>(null)
  const [appVersion, setAppVersion] = useState('2.1.5')

  useEffect(() => {
    window.api.license?.getTier?.().then((t: any) => setTier(t || 'free'))
    window.api.vault?.getStats?.().then((s: any) => setVaultStats(s))
    window.api.app?.getVersion?.().then((v: any) => v && setAppVersion(v))
  }, [])

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto p-8">
        <div className="max-w-2xl mx-auto space-y-6">
          {/* Hero Section */}
          <div className="relative rounded-3xl border border-[var(--border)] bg-gradient-to-br from-[var(--primary)]/20 via-purple-500/10 to-pink-500/10 p-8 text-center overflow-hidden">
            {/* Decorative background elements */}
            <div className="absolute top-0 right-0 w-40 h-40 bg-gradient-to-br from-[var(--primary)]/30 to-transparent rounded-full blur-3xl" />
            <div className="absolute bottom-0 left-0 w-32 h-32 bg-gradient-to-tr from-purple-500/20 to-transparent rounded-full blur-2xl" />

            <div className="relative">
              <div className="w-24 h-24 mx-auto mb-5 rounded-3xl bg-gradient-to-br from-[var(--primary)] to-pink-600 flex items-center justify-center shadow-2xl shadow-[var(--primary)]/40 transform hover:scale-105 transition-transform">
                <Sparkles size={44} className="text-white" />
              </div>
              <h1 className="text-4xl font-bold bg-gradient-to-r from-white to-zinc-300 bg-clip-text text-transparent">Vault</h1>
              <p className="text-zinc-400 mt-2 text-lg">Personal Media Experience</p>
              <div className="mt-5 flex items-center justify-center gap-3">
                <span className="px-4 py-1.5 rounded-full text-sm font-medium bg-zinc-800/80 text-zinc-300 border border-zinc-700">
                  v{appVersion}
                </span>
                <span
                  className={cn(
                    'px-4 py-1.5 rounded-full text-sm font-medium flex items-center gap-1.5',
                    tier === 'owner' ? 'bg-gradient-to-r from-yellow-500/30 to-amber-500/30 text-yellow-400 border border-yellow-500/30' :
                    tier === 'premium' ? 'bg-gradient-to-r from-[var(--primary)]/30 to-pink-500/30 text-[var(--primary)] border border-[var(--primary)]/30' :
                    'bg-zinc-800/80 text-zinc-400 border border-zinc-700'
                  )}
                >
                  {tier === 'owner' ? (
                    <><Crown size={14} /> Owner</>
                  ) : tier === 'premium' ? (
                    <><Zap size={14} /> Premium</>
                  ) : (
                    'Free'
                  )}
                </span>
              </div>
            </div>
          </div>

          {/* Quick Stats */}
          {vaultStats && (
            <div className="rounded-2xl border border-[var(--border)] bg-zinc-900/50 p-6">
              <div className="text-sm font-semibold mb-4 flex items-center gap-2">
                <BarChart3 size={16} className="text-[var(--primary)]" />
                Your Collection
              </div>
              <div className="grid grid-cols-4 gap-4">
                <div className="text-center p-3 rounded-xl bg-zinc-800/50 hover:bg-zinc-800 transition-colors">
                  <div className="text-3xl font-bold text-white">{vaultStats.totalMedia?.toLocaleString() || 0}</div>
                  <div className="text-xs text-zinc-500 mt-1">Total</div>
                </div>
                <div className="text-center p-3 rounded-xl bg-zinc-800/50 hover:bg-zinc-800 transition-colors">
                  <div className="text-3xl font-bold text-green-400">{vaultStats.videoCount?.toLocaleString() || 0}</div>
                  <div className="text-xs text-zinc-500 mt-1">Videos</div>
                </div>
                <div className="text-center p-3 rounded-xl bg-zinc-800/50 hover:bg-zinc-800 transition-colors">
                  <div className="text-3xl font-bold text-purple-400">{vaultStats.imageCount?.toLocaleString() || 0}</div>
                  <div className="text-xs text-zinc-500 mt-1">Images</div>
                </div>
                <div className="text-center p-3 rounded-xl bg-zinc-800/50 hover:bg-zinc-800 transition-colors">
                  <div className="text-3xl font-bold text-blue-400">{vaultStats.tagCount?.toLocaleString() || 0}</div>
                  <div className="text-xs text-zinc-500 mt-1">Tags</div>
                </div>
              </div>
            </div>
          )}

          {/* Links - Primary Actions */}
          <div className="grid grid-cols-3 gap-4">
            <button
              onClick={() => window.api?.shell?.openExternal?.('https://github.com/vault-app/vault')}
              className="flex flex-col items-center gap-2 p-5 rounded-2xl border border-[var(--border)] bg-zinc-900/50 hover:bg-zinc-800 transition-all hover:scale-[1.02] group"
            >
              <Github size={28} className="text-zinc-400 group-hover:text-white transition-colors" />
              <span className="text-sm font-medium">GitHub</span>
              <span className="text-xs text-zinc-500">Source Code</span>
            </button>
            <button
              onClick={() => window.api?.shell?.openExternal?.('https://github.com/vault-app/vault/issues')}
              className="flex flex-col items-center gap-2 p-5 rounded-2xl border border-[var(--border)] bg-zinc-900/50 hover:bg-zinc-800 transition-all hover:scale-[1.02] group"
            >
              <MessageCircle size={28} className="text-zinc-400 group-hover:text-white transition-colors" />
              <span className="text-sm font-medium">Support</span>
              <span className="text-xs text-zinc-500">Report Issues</span>
            </button>
            <button
              onClick={() => window.api?.shell?.openExternal?.('https://github.com/vault-app/vault/releases')}
              className="flex flex-col items-center gap-2 p-5 rounded-2xl border border-[var(--border)] bg-zinc-900/50 hover:bg-zinc-800 transition-all hover:scale-[1.02] group"
            >
              <Download size={28} className="text-zinc-400 group-hover:text-white transition-colors" />
              <span className="text-sm font-medium">Updates</span>
              <span className="text-xs text-zinc-500">Download Latest</span>
            </button>
          </div>

          {/* Built With */}
          <div className="rounded-2xl border border-[var(--border)] bg-zinc-900/50 p-6">
            <div className="text-sm font-semibold mb-4 flex items-center gap-2">
              <Code size={16} className="text-[var(--primary)]" />
              Built With
            </div>
            <div className="flex flex-wrap gap-2">
              {['Electron', 'React', 'TypeScript', 'Vite', 'Tailwind CSS', 'SQLite', 'FFmpeg', 'Lucide Icons'].map(tech => (
                <span key={tech} className="px-3 py-1.5 rounded-lg bg-zinc-800 text-xs text-zinc-300 border border-zinc-700">
                  {tech}
                </span>
              ))}
            </div>
          </div>

          {/* Legal */}
          <div className="rounded-2xl border border-[var(--border)] bg-zinc-900/50 p-6">
            <div className="text-sm font-semibold mb-3 flex items-center gap-2">
              <Shield size={16} className="text-[var(--primary)]" />
              Legal
            </div>
            <div className="space-y-3 text-sm text-zinc-400 leading-relaxed">
              <p>
                Vault is designed for personal use with your own media collection.
                Users are responsible for ensuring they have the rights to any content in their vault.
              </p>
              <p>
                By using this software, you agree that you are of legal adult age in your jurisdiction.
              </p>
            </div>
          </div>

          {/* Footer */}
          <div className="text-center py-4 text-xs text-zinc-600">
            Made with passion for passionate people
          </div>
        </div>
      </div>
    </div>
  )
}
