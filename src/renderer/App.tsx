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
import { useLocalStorage } from './hooks/useLocalStorage'
import { useConfirm } from './components/ConfirmDialog'
import { LoadingSpinner } from './components/LoadingSpinner'
import { AboutPage } from './pages/AboutPage'
import SessionsPage from './pages/SessionsPage'
// Lazy-load every non-essential page so initial bundle shrinks.
// LibraryPage (the entry page) and SessionsPage (small) stay eager.
const DownloadsPage = React.lazy(() => import('./pages/DownloadsPage').then((m) => ({ default: m.DownloadsPage })))
const Rule34Page = React.lazy(() => import('./pages/Rule34Page'))
const PerformersPage = React.lazy(() => import('./pages/PerformersPage'))
const FeedPage = React.lazy(() => import('./pages/FeedPage').then((m) => ({ default: m.FeedPage })))
const PlaylistsPage = React.lazy(() => import('./pages/PlaylistsPage').then((m) => ({ default: m.PlaylistsPage })))
const CaptionsPage = React.lazy(() => import('./pages/CaptionsPage').then((m) => ({ default: m.CaptionsPage })))
const SettingsPage = React.lazy(() => import('./pages/SettingsPage').then((m) => ({ default: m.SettingsPage })))
const StatsPage = React.lazy(() => import('./pages/StatsPage').then((m) => ({ default: m.StatsPage })))
const AiTaggerPage = React.lazy(() => import('./pages/AiTaggerPage').then((m) => ({ default: m.AiTaggerPage })))
import { PostNutLockoutOverlay } from './components/PostNutLockoutOverlay'
import { LibraryPage } from './pages/LibraryPage'
// Defer GoonWallPage too; it's 1,586 lines and rarely visited first.
// resetGoonSlots is dynamically imported in the cleanup path so the page's
// module isn't pulled into the main bundle until needed.
const GoonWallPage = React.lazy(() => import('./pages/GoonWallPage').then((m) => ({ default: m.GoonWallPage })))
import { ContextMenuContext, useContextMenu, type ContextMenuState } from './contexts/ContextMenuContext'
import { cn } from './utils/cn'
import { extractItems, toFileUrl } from './utils/api'
import type {
  MediaType,
  MediaRow,
  TagRow,
  MarkerRow,
  PlaylistRow,
  MediaStatsRow,
  CaptionPreset,
  GoonWordPackId,
  GoonWordsSettings,
  VisualEffectsSettings,
  GoonStats,
  SoundSettings,
  SessionAnalytics,
  OptimizeNamesResult,
  VaultSettings,
  GlobalTask,
  ToastType,
  Toast,
} from './types'
import { Btn, TopBar, Dropdown, ToggleSwitch, AnimatedCounter } from './components/ui'
import { ProfileSwitcher } from './components/ProfileSwitcher'
import { SubscriptionsBellButton } from './components/SubscriptionsBellButton'

import { useHeatLevel } from './components/HeatOverlay'
import { ArousalEffects, HeartsOverlay, RainOverlay, GlitchOverlay, BubblesOverlay, MatrixRainOverlay, ConfettiOverlay } from './components/VisualStimulants'
import { AuroraBands, NeonRain, LightningVeil } from './components/NewAmbientEffects'
import { ErrorBoundary } from './components/ErrorBoundary'
import DraggableFab from './components/DraggableFab'
import { shuffleTake } from './utils/shuffle'
import { formatDuration, formatBytes } from './utils/formatters'
import { videoPool } from './hooks/useVideoCleanup'
import { useAnime } from './hooks/useAnime'
import { useConfetti } from './hooks/useConfetti'
import { useUiSounds } from './hooks/useUiSounds'
import { useAmbienceAudio } from './hooks/useAmbienceAudio'
import { FloatingVideoPlayer } from './components/FloatingVideoPlayer'
import { MediaInfoModal } from './components/MediaInfoModal'
const WhatsNewModal = React.lazy(() => import('./components/WhatsNewModal').then((m) => ({ default: m.WhatsNewModal })))
import { DuplicatesModal } from './components/DuplicatesModal'
import { HomeDashboard } from './components/HomeDashboard'
import { PmvEditorPage } from './components/PmvEditor'
// Library tool components - Professional video editing and media management
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
  Globe,
  Users,
  AlertCircle,
  FileText,
  Shield,
  CheckCircle2,
  XCircle,
  Loader2,
  Timer,
  HardDrive,
  Hash,
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
  Link2,
  Mic,
  Share2,
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
// GlobalTask + ApiListResult moved to ./types (#87 phase A). extractItems +
// toFileUrl moved to ./utils/api.ts.

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

// File-local — see CLAUDE.md "Known dev environment quirks" + the
// useContextMenu un-export note. Mixed component+hook exports break
// React Fast Refresh on App.tsx. The canonical export lives at
// `src/renderer/contexts/index.ts`.
function useGlobalTasks() {
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
// Toast — single source of truth in src/renderer/contexts/ToastContext.tsx.
// App.tsx used to define its own local context here; that was the cause
// of the long-standing bug where toasts from non-App components silently
// no-op'd. Now everything funnels through one provider mounted in main.tsx.
import { useToast as useContextsToast } from './contexts'
const useToast = useContextsToast

// ContextMenuContext / useContextMenu / ContextMenuState moved to
// src/renderer/contexts/ContextMenuContext.tsx (#48 phase E) so that
// the extracted LibraryPage can use the hook directly.

function ContextMenuOverlay({ onAddToPlaylist, onViewInfo }: { onAddToPlaylist?: (mediaId: string) => void; onViewInfo?: (media: MediaRow) => void }) {
  const { contextMenu, hideContextMenu } = useContextMenu()
  const { showToast } = useToast()
  const confirm = useConfirm()
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

  // Open a Library tool from anywhere in the app. On Library, fires the
  // event directly so listener picks it up. Off Library, stashes the
  // payload in sessionStorage + navigates to /library — the page's
  // mount drains the key and opens the tool. Race-free.
  const openLibraryTool = (tool: string) => {
    if (!contextMenu.mediaData) return
    const payload = { tool, media: contextMenu.mediaData }
    const onLibrary = document.querySelector('[data-page="library"]') !== null
    if (onLibrary) {
      window.dispatchEvent(new CustomEvent('vault-open-tool', { detail: payload }))
    } else {
      try { sessionStorage.setItem('vault.pendingLibraryToolPayload', JSON.stringify(payload)) } catch { /* quota */ }
      window.dispatchEvent(new CustomEvent('navigate-tab', { detail: 'library' }))
    }
  }

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
          } catch (e: any) {
            showToast('error', `Watch Later add failed: ${e?.message ?? String(e)}`)
          }
        }
        hideContextMenu()
      }
    },
    // Cross-page link to Brainwash (CaptionsPage). User selected media
    // they want to caption — currently they'd have to navigate to
    // Brainwash + find the file again. This jumps straight there
    // with the media id pre-staged via sessionStorage so the page can
    // auto-pick it on mount.
    {
      label: 'Open in Brainwash',
      icon: <Type size={14} />,
      action: () => {
        if (contextMenu.mediaId) {
          try { sessionStorage.setItem('vault_brainwash_open_media', contextMenu.mediaId) } catch { /* ignore */ }
          window.dispatchEvent(new CustomEvent('navigate-tab', { detail: 'captions' }))
        }
        hideContextMenu()
      }
    },
    // OS-level "show in file manager" (Explorer / Finder / Files).
    // Useful when the user wants to do something to the underlying
    // file outside Vault (move, archive, edit, share).
    {
      label: 'Open containing folder',
      icon: <FolderOpen size={14} />,
      action: () => {
        if (contextMenu.mediaData?.path) {
          window.api?.shell?.showItemInFolder?.(contextMenu.mediaData.path)
        }
        hideContextMenu()
      }
    },
    // Copy the absolute file path to clipboard for pasting into
    // external tools (ffmpeg one-offs, file dialogs, scripts).
    {
      label: 'Copy file path',
      icon: <Copy size={14} />,
      action: async () => {
        if (contextMenu.mediaData?.path) {
          try {
            await navigator.clipboard.writeText(contextMenu.mediaData.path)
            showToast('success', 'Path copied to clipboard')
          } catch (e: any) {
            showToast('error', `Clipboard write failed: ${e?.message ?? String(e)}`)
          }
        }
        hideContextMenu()
      }
    },
    // Copy the internal media id — handy for sharing a specific item
    // with another vault instance (sync / debugging / triage).
    {
      label: 'Copy media id',
      icon: <Hash size={14} />,
      action: async () => {
        if (contextMenu.mediaId) {
          try {
            await navigator.clipboard.writeText(contextMenu.mediaId)
            showToast('success', 'Media id copied')
          } catch (e: any) {
            showToast('error', `Clipboard write failed: ${e?.message ?? String(e)}`)
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
          } catch (e: any) {
            showToast('error', `Bookmark add failed: ${e?.message ?? String(e)}`)
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
            } catch (e: any) {
              showToast('error', `Note add failed: ${e?.message ?? String(e)}`)
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
    // v2.7 sharing — Iroh blob ticket. End-to-end encrypted file
    // share via content addressing; receiver pastes the ticket.
    {
      label: 'Share via Iroh',
      icon: <Share2 size={14} />,
      action: async () => {
        if (!contextMenu.mediaPath) return hideContextMenu()
        try {
          showToast('info', 'Generating Iroh ticket…')
          const res = await window.api.iroh.share(contextMenu.mediaPath)
          await navigator.clipboard.writeText(res.ticket)
          showToast('success', 'Iroh ticket copied to clipboard')
        } catch (e: any) {
          showToast('error', e?.message ?? 'Iroh share failed')
        }
        hideContextMenu()
      }
    },
    // v2.7 sharing — Helia (IPFS) pin. Returns a CID + gateway URL.
    {
      label: 'Pin to IPFS',
      icon: <HardDrive size={14} />,
      action: async () => {
        if (!contextMenu.mediaPath) return hideContextMenu()
        try {
          showToast('info', 'Pinning to local IPFS node…')
          const res = await window.api.helia.pin(contextMenu.mediaPath)
          if (res.ok && res.cid) {
            await navigator.clipboard.writeText(res.gatewayUrl ?? `ipfs://${res.cid}`)
            showToast('success', `Pinned · ${res.cid.slice(0, 14)}… (gateway URL copied)`)
          } else {
            showToast('error', res.error ?? 'IPFS pin failed')
          }
        } catch (e: any) {
          showToast('error', e?.message ?? 'IPFS pin failed')
        }
        hideContextMenu()
      }
    },
    // v2.7 export — opens the export-pipeline modal in LibraryPage via
    // a custom event so we don't have to plumb state through 5 levels.
    {
      label: 'Open Export Pipeline',
      icon: <Download size={14} />,
      action: () => {
        window.dispatchEvent(new CustomEvent('vault:openExportPipeline'))
        hideContextMenu()
      }
    },
    // v2.7 — Re-queue this media for AI tagging at priority 1. Useful
    // when you've tweaked the Venice prompt or canonical tags and want
    // an item re-analyzed without scrolling to AI Tools and selecting
    // it manually.
    {
      label: 'Re-tag with AI',
      icon: <Brain size={14} />,
      action: async () => {
        if (!contextMenu.mediaId) return hideContextMenu()
        try {
          const res = await window.api.ai.reanalyzeBatch([contextMenu.mediaId])
          showToast('success', `Queued for re-analysis · ${res.enqueued} item${res.enqueued === 1 ? '' : 's'}`)
        } catch (e: any) {
          showToast('error', e?.message ?? 'Re-tag failed')
        }
        hideContextMenu()
      }
    },
    // v2.7 — RIFE frame interpolation. Doubles a video's frame rate via
    // an external RIFE NCNN-Vulkan binary. Output writes to a sibling
    // <basename>.rife.mp4. Long-running — fire-and-forget with toast.
    {
      label: 'RIFE interpolate (60fps)',
      icon: <Activity size={14} />,
      action: async () => {
        if (!contextMenu.mediaPath || contextMenu.mediaType !== 'video') {
          showToast('info', 'RIFE only works on videos')
          return hideContextMenu()
        }
        showToast('info', 'RIFE started — this may take several minutes')
        try {
          const res = await window.api.rife.interpolate(contextMenu.mediaPath, { targetFps: 60 })
          if (res.ok) {
            showToast('success', `RIFE done · ${res.dstPath?.split(/[/\\]/).pop() ?? 'output'}`)
          } else {
            showToast('error', res.error ?? 'RIFE failed')
          }
        } catch (e: any) {
          showToast('error', e?.message ?? 'RIFE failed')
        }
        hideContextMenu()
      }
    },
    // v2.7 — Export an NFO sidecar (Kodi/Jellyfin/Emby compatible) for
    // this single media item. Writes <basename>.nfo next to the file.
    {
      label: 'Export NFO sidecar',
      icon: <FileText size={14} />,
      action: async () => {
        if (!contextMenu.mediaId) return hideContextMenu()
        try {
          const res = await window.api.nfo.exportOne(contextMenu.mediaId)
          if (res.ok) {
            showToast('success', `NFO written · ${res.path?.split(/[/\\]/).pop() ?? 'sidecar'}`)
          } else {
            showToast('error', res.error ?? 'NFO export failed')
          }
        } catch (e: any) {
          showToast('error', e?.message ?? 'NFO export failed')
        }
        hideContextMenu()
      }
    },
    // v2.7 — Per-media denial timer. Sets a "can't open this until X"
    // lockout so users practicing self-control deny themselves a
    // specific item (rather than the whole library). Uses window.prompt
    // for the duration since the existing ContextMenuOverlay doesn't
    // render submenus.
    {
      label: 'Deny this for…',
      icon: <Clock size={14} />,
      action: async () => {
        if (!contextMenu.mediaId) return hideContextMenu()
        const input = window.prompt(
          'Deny for how long? Enter minutes or examples: 30m / 1h / 1d / 1w',
          '1h',
        )
        if (!input) return hideContextMenu()
        const m = input.trim().match(/^(\d+(?:\.\d+)?)\s*(m|min|h|hr|hrs|d|day|days|w|wk|week|weeks)?$/i)
        if (!m) {
          showToast('error', "Couldn't parse duration")
          return hideContextMenu()
        }
        const n = parseFloat(m[1])
        const unit = (m[2] ?? 'm').toLowerCase()
        const minutes =
          unit.startsWith('w') ? n * 7 * 1440
          : unit.startsWith('d') ? n * 1440
          : unit.startsWith('h') ? n * 60
          : n
        try {
          const res = await window.api.tags.denial.set({
            mediaId: contextMenu.mediaId,
            durationMin: Math.round(minutes),
          })
          if (res.ok) {
            showToast('success', `Denied for ${Math.round(minutes)} min`)
          } else {
            showToast('error', res.error ?? 'Denial set failed')
          }
        } catch (e: any) {
          showToast('error', e?.message ?? 'Denial set failed')
        }
        hideContextMenu()
      }
    },
    // v2.7 #294 — Apple Photos "Feature less" suppression. Hides this
    // media from recommendation rails / random shuffles without
    // requiring a full hide flag. Toggleable.
    {
      label: 'Feature less / suggest less',
      icon: <EyeOff size={14} />,
      action: async () => {
        if (!contextMenu.mediaId) return hideContextMenu()
        try {
          // Read current state and flip
          const cur = await window.api.tags.featureLess.get(contextMenu.mediaId)
          const nextVal = !(cur?.ok && cur.value)
          const res = await window.api.tags.featureLess.set({
            mediaId: contextMenu.mediaId,
            value: nextVal,
          })
          if (res.ok) {
            showToast(
              'success',
              nextVal ? 'Will be featured less' : 'Featuring restored',
            )
            // v2.7 — fire global event so LibraryPage (and any other
            // listener) refreshes its featureLess set without remount.
            window.dispatchEvent(new CustomEvent('vault:featureLessChanged'))
          } else {
            showToast('error', res.error ?? 'Failed to update')
          }
        } catch (e: any) {
          showToast('error', e?.message ?? 'Failed to update')
        }
        hideContextMenu()
      }
    },
    // v2.7 — Auto-tease compile via the teaseCut bridge.
    // Detects spikey-energy events in the source and chains them into a
    // tease edit. Writes to a sibling MP4 in the source folder.
    {
      label: 'Auto-tease this video',
      icon: <Scissors size={14} />,
      action: async () => {
        if (!contextMenu.mediaId || !contextMenu.mediaPath || contextMenu.mediaType !== 'video') {
          showToast('info', 'Auto-tease only works on videos')
          return hideContextMenu()
        }
        const mediaPath = contextMenu.mediaPath
        const mediaId = contextMenu.mediaId
        try {
          showToast('info', 'Detecting tease events…')
          const eventsRes = await window.api.tags.teaseCut.events({ mediaId, threshold: 0.6 })
          if (!eventsRes.ok || !eventsRes.events || eventsRes.events.length === 0) {
            showToast('error', eventsRes.error ?? 'No tease events detected')
            return hideContextMenu()
          }
          const baseDir = mediaPath.replace(/[/\\][^/\\]+$/, '')
          const baseName = (mediaPath.split(/[/\\]/).pop() ?? 'tease').replace(/\.[^.]+$/, '')
          const dstPath = `${baseDir}\\${baseName}.tease.mp4`
          showToast('info', `Compiling ${eventsRes.events.length} clips…`)
          const compileRes = await window.api.tags.teaseCut.compile({
            mediaPath,
            events: eventsRes.events,
            dstPath,
            threshold: 0.6,
            leadInSec: 0.5,
            cutawaySec: 1.5,
            maxClips: 30,
            videoCodec: 'libx264',
          })
          if (compileRes.ok) {
            showToast('success', `Tease compiled · ${compileRes.clipsUsed ?? 0} clips, ${Math.round(compileRes.durationSec ?? 0)}s`)
          } else {
            showToast('error', compileRes.error ?? 'Tease compile failed')
          }
        } catch (e: any) {
          showToast('error', e?.message ?? 'Tease compile failed')
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
              // media:rename already calls broadcast('vault:changed') in main
              // (ipc.ts:1695), so the IPC route refreshes consumers — no
              // local dispatch needed.
            } catch (e: any) {
              showToast('error', e?.message || 'Failed to rename')
            }
          }
        }
        hideContextMenu()
      }
    },
    // "Re-tag with AI" above (line ~597) is the canonical v2.7 path
    // that uses ai.reanalyzeBatch — it queues with proper priority and
    // unified review handling. The older "Re-analyze with AI" entry
    // here was removed as a duplicate.
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
          } catch (e: any) {
            showToast('error', `AI queue add failed: ${e?.message ?? String(e)}`)
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
              // Renderer-only state change — fire vault:changed on window so
              // every page subscribed via onVaultChanged refreshes. The
              // preload's onBoth() helper bridges window→subscribers.
              window.dispatchEvent(new CustomEvent('vault:changed'))
            } else {
              showToast('info', 'Already in blacklist')
            }
          } catch (e: any) {
            showToast('error', `Blacklist add failed: ${e?.message ?? String(e)}`)
          }
        }
        hideContextMenu()
      }
    },
    { type: 'separator' as const },
    {
      label: 'Edit Metadata',
      icon: <Edit2 size={14} />,
      action: () => { openLibraryTool('metadata'); hideContextMenu() }
    },
    {
      label: 'AI Auto-Tag',
      icon: <Sparkles size={14} />,
      action: () => { openLibraryTool('ai-tagger'); hideContextMenu() }
    },
    {
      label: 'Scene Detection',
      icon: <Zap size={14} />,
      action: () => {
        if (contextMenu.mediaData?.type === 'video') openLibraryTool('scene-detector')
        else showToast('info', 'Scene detection is only available for videos')
        hideContextMenu()
      }
    },
    {
      label: 'Extract Keyframes',
      icon: <ImageIcon size={14} />,
      action: () => {
        if (contextMenu.mediaData?.type === 'video') openLibraryTool('keyframe')
        else showToast('info', 'Keyframe extraction is only available for videos')
        hideContextMenu()
      }
    },
    {
      label: 'Export / Convert',
      icon: <Download size={14} />,
      action: () => { openLibraryTool('export'); hideContextMenu() }
    },
    { type: 'separator' as const },
    {
      label: 'Delete from Library',
      icon: <Trash2 size={14} />,
      danger: true,
      action: async () => {
        if (contextMenu.mediaId) {
          const confirmed = await confirm({
            title: 'Remove this item from your library?',
            body: 'The file stays on disk — only the library entry is removed. Press Ctrl+Z immediately after to undo.',
            confirmLabel: 'Remove',
            danger: true,
          })
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

// Type definitions moved to ./types (#87 phase A).
// MediaType, MediaRow, TagRow, MarkerRow, PlaylistRow, MediaStatsRow,
// CaptionPreset, GoonWordPackId, GoonWordsSettings, VisualEffectsSettings,
// GoonStats, SoundSettings, SessionAnalytics, OptimizeNamesResult,
// VaultSettings are all imported at the top of this file.

// Window.api type is defined globally in src/types.d.ts
// Uses 'any' due to extensive use of window.api.invoke() for dynamic handlers

// `cn` moved to ./utils/cn.ts (#48 phase A). Import below.

// AnimatedCounter moved to ./components/ui/AnimatedCounter.tsx (#48 phase A).

// Use themes from our theme system
const NAV = [
  { id: 'home', name: 'Home', tip: 'Dashboard with continue watching and recommendations' },
  { id: 'library', name: 'Library', tip: 'Browse and manage your media collection' },
  { id: 'goonwall', name: 'Goon Wall', tip: 'Multi-tile video wall with immersive features' },
  { id: 'captions', name: 'Brainwash', tip: 'Add captions and filters to images' },
  { id: 'pmv', name: 'PMV Editor', tip: 'Create music video compilations with beat sync' },
  { id: 'ai', name: 'AI Tools', tip: 'AI-powered tagging and analysis' },
  { id: 'feed', name: 'Feed', tip: 'Endless scrolling feed of your media' },
  { id: 'playlists', name: 'Playlists', tip: 'Create and manage playlists' },
  { id: 'sessions', name: 'Sessions', tip: 'Live session control room — HR, climax verifier, devices, goon-game, history' },
  { id: 'downloads', name: 'Downloads', tip: 'Download videos from URLs' },
  { id: 'rule34', name: 'Browse', tip: 'Search 10 sources in parallel — 8 boorus + 2 tube sites (Eporner, RedTube). Download to library.' },
  { id: 'performers', name: 'Performers', tip: 'SFace face clusters — name them once, get auto-tagged forever' },
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
    case 'sessions': return <Activity {...iconProps} />
    case 'downloads': return <Download {...iconProps} />
    case 'rule34': return <Globe {...iconProps} />
    case 'performers': return <Users {...iconProps} />
    case 'stats': return <BarChart3 {...iconProps} />
    case 'settings': return <Settings {...iconProps} />
    case 'about': return <Info {...iconProps} />
    default: return null
  }
}

type NavId = (typeof NAV)[number]['id']

export default function App() {
  const confirm = useConfirm()
  const [page, setPage] = useState<NavId>('home')
  const [prevPage, setPrevPage] = useState<NavId>('home')
  const [pageTransition, setPageTransition] = useState<'enter' | 'exit' | null>(null)
  const [fabOpen, setFabOpen] = useState(false)
  const [settings, setSettings] = useState<VaultSettings | null>(null)
  const [sessionActive, setSessionActive] = useState(false)
  const [leftSidebarOpen, setLeftSidebarOpen] = useState(true)
  const [leftSidebarHover, setLeftSidebarHover] = useState(false)
  const [leftSidebarMouseY, setLeftSidebarMouseY] = useState(0)
  // Tag sidebar (inside LibraryPage). Defaults closed so the library
  // grid sits flush against the main sidebar — the previous default-true
  // looked like a "big gap between library and sidebar" to the user
  // when the bar was empty / unused. Preference persists across reboots.
  // App version string for the sidebar header. Reads from the main
  // process getVersion IPC so it matches package.json instead of the
  // hardcoded "2.1.5" the user kept seeing in the bottom-left.
  const [appVersionLabel, setAppVersionLabel] = useState<string>('…')
  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const v = await (window.api as any).app?.getVersion?.()
        if (alive && typeof v === 'string' && v) setAppVersionLabel(v)
      } catch { if (alive) setAppVersionLabel('2.7.1') }
    })()
    return () => { alive = false }
  }, [])

  const [tagBarOpen, setTagBarOpenRaw] = useState<boolean>(() => {
    try {
      const v = localStorage.getItem('vault_tagbar_open')
      if (v === 'true') return true
      if (v === 'false') return false
    } catch { /* localStorage may be unavailable */ }
    return false
  })
  const setTagBarOpen = useCallback((next: boolean | ((prev: boolean) => boolean)) => {
    setTagBarOpenRaw((prev) => {
      const resolved = typeof next === 'function' ? next(prev) : next
      try { localStorage.setItem('vault_tagbar_open', String(resolved)) } catch { /* ignore */ }
      return resolved
    })
  }, [])
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
  const { showToast } = useToast()
  // Some code paths refer to the toast via this name for clarity vs.
  // the nested ContextMenuOverlay's local showToast scope.
  const globalShowToast = showToast

  // v2.7 — Focus mode toggle handler at the app level so it works from
  // anywhere (CommandPalette, Shift+F hotkey, etc.) even if
  // FocusModeToggle is not currently mounted (it only lives on
  // LibraryPage). The button + this handler share state via the
  // document attribute and the 'vault.focusMode' useLocalStorage key.
  const [focusModePref, setFocusModePref] = useLocalStorage<string>('vault.focusMode', 'off')
  useEffect(() => {
    const onToggleFocus = () => {
      const next = document.documentElement.getAttribute('data-focus-mode') !== 'on'
      document.documentElement.setAttribute('data-focus-mode', next ? 'on' : 'off')
      setFocusModePref(next ? 'on' : 'off')
    }
    window.addEventListener('vault:toggleFocusMode', onToggleFocus)
    // Restore the persisted attribute on cold start so the Library
    // doesn't flash un-focused chrome before FocusModeToggle hydrates.
    if (focusModePref === 'on') document.documentElement.setAttribute('data-focus-mode', 'on')
    return () => window.removeEventListener('vault:toggleFocusMode', onToggleFocus)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setFocusModePref])


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
      // v2.7 — Shift+F toggles Focus Mode app-wide. Pairs with the
      // CommandPalette "Toggle Focus Mode" entry and the FocusModeToggle
      // button on LibraryPage — all three fire the same window event.
      if ((e.key === 'F') && e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault()
        window.dispatchEvent(new CustomEvent('vault:toggleFocusMode'))
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
            // media:undoDelete fires broadcast('vault:changed') in main
            // (ipc.ts:2137) — IPC route handles renderer refresh.
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
  // v2.7 — idle-time prefetch the lazy pages the user is most likely to
  // visit next. Runs once on app mount, after the renderer has settled.
  // Uses requestIdleCallback if available so it doesn't compete with
  // first-paint; falls back to a 2-second setTimeout. Each import()
  // populates Vite's chunk cache; the actual navigation later is then
  // instant (no Suspense fallback flash).
  useEffect(() => {
    const prefetch = () => {
      void import('./pages/AiTaggerPage')
      void import('./pages/SettingsPage')
      void import('./pages/StatsPage')
      void import('./pages/PlaylistsPage')
    }
    const ric = (window as any).requestIdleCallback as
      | ((cb: () => void, opts?: { timeout: number }) => number)
      | undefined
    if (ric) {
      ric(() => prefetch(), { timeout: 5000 })
    } else {
      const t = setTimeout(prefetch, 2000)
      return () => clearTimeout(t)
    }
  }, [])

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

  // Toast state moved to src/renderer/contexts/ToastContext.tsx
  // (single source of truth, mounted via ToastProvider in main.tsx).

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

  // Page transition: was a JS-driven slide + fade running translateX
  // ±30px on every navigation, which left the page visibly shifted
  // horizontally on every tab change — and a different X offset
  // depending on whether the user went forward or back through nav
  // order, which produced the "different position per page" symptom.
  // The CSS .page-transition-enter/exit fade handled by the main
  // element's class binding is sufficient; the inline anime() call is
  // redundant + bypasses the CSS to inject a hardcoded translateX.
  useEffect(() => {
    if (prevPageRef.current !== page) {
      prevPageRef.current = page
    }
  }, [page])

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
    // v2.7 lazy import — GoonWallPage stays out of the main bundle.
    // Fire-and-forget; the slots will be reset when the module loads.
    void import('./pages/GoonWallPage').then((m) => m.resetGoonSlots())

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

  // Smooth page navigation with transition.
  // v2.7 #337 — wraps in the View Transitions API when supported
  // (Chrome 111+, Safari 18+, Firefox behind flag) so the cross-page
  // morph is GPU-accelerated and respects reduced-motion. Falls back
  // to the existing 2-phase exit/enter when the API is missing.
  const navigateTo = useCallback((newPage: NavId) => {
    if (newPage === page) return

    // If leaving GoonWall, immediately stop all video/audio
    if (page === 'goonwall') {
      stopAllMediaPlayback()
    }

    const supportsVT = typeof (document as any).startViewTransition === 'function'

    if (supportsVT) {
      // Single-frame DOM swap inside the browser's transition pass.
      ;(document as any).startViewTransition(() => {
        setPage(newPage)
        if (page === 'goonwall') stopAllMediaPlayback()
      })
      return
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

  // v2.7 — Global 'navigate-tab' event handler. WhatsNewModal, the
  // ServiceHealthDashboard, and the Library health-modal dispatch this
  // with a NavId string in `detail` so deep buttons can route to a
  // top-level page without taking a prop. Was dispatched but never
  // listened for — the "Open AI Tools" / "Open Settings → Services"
  // buttons in the v2.7 splash silently did nothing until now.
  useEffect(() => {
    const onNavigateTab = (e: Event) => {
      const detail = (e as CustomEvent<unknown>).detail
      if (typeof detail !== 'string') return
      const valid: NavId[] = ['home', 'library', 'goonwall', 'captions', 'pmv', 'ai', 'feed', 'playlists', 'sessions', 'downloads', 'rule34', 'performers', 'stats', 'settings', 'about']
      if ((valid as string[]).includes(detail)) {
        navigateTo(detail as NavId)
      }
    }
    window.addEventListener('navigate-tab', onNavigateTab)
    return () => window.removeEventListener('navigate-tab', onNavigateTab)
  }, [navigateTo])

  // #302 D-78 — FloatingVideoPlayer's I-key dispatches
  // `vault:toggle-info-pane` so the parent can pop the MediaInfo modal
  // without taking a prop. Was dispatched but never listened for —
  // I-key did nothing. Now opens the modal for the active media,
  // or closes it if the same item is already showing.
  const infoModalMediaRef = useRef<MediaRow | null>(null)
  useEffect(() => { infoModalMediaRef.current = infoModalMedia }, [infoModalMedia])
  useEffect(() => {
    const onTogglePane = async (e: Event) => {
      const detail = (e as CustomEvent<{ mediaId?: string }>).detail
      const id = detail?.mediaId
      if (!id) return
      if (infoModalMediaRef.current?.id === id) {
        setInfoModalMedia(null)
        return
      }
      try {
        const row = (await window.api.media?.getById?.(id)) as MediaRow | null | undefined
        if (row) setInfoModalMedia(row)
        else globalShowToast?.('error', 'Media not found')
      } catch (err: any) {
        console.warn('[info-pane] media.getById failed:', err)
        globalShowToast?.('error', err?.message ?? 'Failed to load media info')
      }
    }
    window.addEventListener('vault:toggle-info-pane', onTogglePane)
    return () => window.removeEventListener('vault:toggle-info-pane', onTogglePane)
  }, [globalShowToast])

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
      // Propagate concurrency caps to the renderer-side limiters so the
      // user's setting takes effect immediately.
      try {
        const n = s?.library?.maxConcurrentVideos
        if (typeof n === 'number') {
          const { setMaxWallVideos } = await import('./hooks/useVideoPreview')
          setMaxWallVideos(n)
        }
      } catch { /* hook may not be present in older builds */ }
      // Auto-start session for streak tracking on app launch
      try { await window.api.goon.startSession() } catch {}
    })()

    // Subscribe to settings changes so UI updates when settings are modified
    const unsubSettings = window.api.events?.onSettingsChanged?.((newSettings: any) => {
      if (alive) {
        setSettings(newSettings)
        // Re-apply concurrency cap if the user just changed it.
        try {
          const n = newSettings?.library?.maxConcurrentVideos
          if (typeof n === 'number') {
            void import('./hooks/useVideoPreview').then(m => m.setMaxWallVideos?.(n))
          }
        } catch { /* ignore */ }
      }
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
        // Get achievement details to show names + description.
        const allAchievements = await window.api.goon.getAchievements() as Array<{ id: string; name: string; description: string; icon: string }>
        const unlocked = ids.map(id => allAchievements.find((a) => a.id === id)).filter(Boolean) as Array<{ id: string; name: string; description: string; icon: string }>

        // Show toast notification for each achievement with name + description
        // so the user knows WHY it unlocked, not just THAT it did.
        unlocked.forEach((ach, i) => {
          setTimeout(() => {
            showToast('success', `${ach.icon} Achievement: ${ach.name} — ${ach.description}`, 6000)
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

  const patchSettings = async (patch: Partial<VaultSettings> | VaultSettings) => {
    // If we're being called with what looks like full settings (has all top-level keys),
    // just set the state directly - the settings have already been saved
    const isFullSettings = patch && 'library' in patch && 'appearance' in patch && 'playback' in patch
    if (isFullSettings) {
      setSettings(patch as VaultSettings)
      return
    }
    // Otherwise, save the partial and update state
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
    <ContextMenuContext.Provider value={contextMenuValue}>
    <GlobalTaskContext.Provider value={globalTaskContextValue}>
    <div
      className="h-screen w-screen overflow-hidden"
      style={{ background: 'var(--bg)', ...shakeStyle }}
    >
      {/* #347 — post-nut clarity lockout overlay (renders only when active) */}
      <PostNutLockoutOverlay />
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

      {/* Toast Notifications are mounted in main.tsx via ToastProvider +
          ToastContainer, wrapping the entire tree. App.tsx used to mount
          its own ToastContainer here against a local context, which left
          non-App-tree components silently no-op-ing showToast — now
          consolidated to one provider. */}

      {/* Floating Action Button — draggable + glides on release. Position
          persists per machine via localStorage. Click toggles the menu;
          movement >6px enters drag mode. */}
      {!zenMode && page !== 'goonwall' && page !== 'feed' && (
        <DraggableFab
          open={fabOpen}
          onClick={() => setFabOpen(!fabOpen)}
          title="Quick Actions (drag to reposition)"
          fabContent={<Plus size={24} className={cn('transition-transform duration-300', fabOpen && 'rotate-45')} />}
        >
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
        </DraggableFab>
      )}

      {/* Context Menu */}
      <ContextMenuOverlay
        onAddToPlaylist={handleContextMenuAddToPlaylist}
        onViewInfo={(media) => setInfoModalMedia(media)}
      />

      {/* v2.7 What's New splash — one-time on first launch after upgrade.
          Lazy-loaded — chunk only downloads if the user is on a new version
          or summons it via CommandPalette. */}
      <React.Suspense fallback={null}>
        <WhatsNewModal />
      </React.Suspense>
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
        {/* Animated Background Orbs — three floating blurred blobs colored by the
            current theme's --primary / --secondary. Default ON; toggled in
            Settings → Appearance → "Background blobs". */}
        {(settings?.appearance?.backgroundOrbs ?? true) && (
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
        )}

        {/* New 2026 ambient overlays — opt-in via Settings → Appearance.
            Each one self-animates and reads --primary/--secondary from the
            active theme so it auto-restyles. Mount conditionally so we don't
            spin RAFs when the user has them off. */}
        {settings?.appearance?.auroraBands && <AuroraBands intensity={0.5} />}
        {settings?.appearance?.neonRain && <NeonRain intensity={0.5} />}
        {settings?.appearance?.lightningVeil && <LightningVeil intensity={0.5} />}

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
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold truncate">Vault</div>
                <div className="text-xs text-[var(--muted)] truncate" aria-label={`Version ${appVersionLabel}`}>{appVersionLabel}</div>
              </div>
              {/* #113 — Subscriptions inbox bell */}
              <div className="shrink-0"><SubscriptionsBellButton /></div>
              {/* #195 — Active profile switcher */}
              <div className="shrink-0"><ProfileSwitcher /></div>
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
                  onMouseEnter={() => {
                    // v2.7 perf — prefetch the lazy chunk for the hovered
                    // tab so first-click is instant. Fire-and-forget; the
                    // import() promise hits Vite's chunk cache. No-op for
                    // pages that aren't lazy or are already loaded.
                    switch (n.id) {
                      case 'settings': void import('./pages/SettingsPage'); break
                      case 'stats': void import('./pages/StatsPage'); break
                      case 'ai': void import('./pages/AiTaggerPage'); break
                      case 'captions': void import('./pages/CaptionsPage'); break
                      case 'playlists': void import('./pages/PlaylistsPage'); break
                      case 'feed': void import('./pages/FeedPage'); break
                      case 'rule34': void import('./pages/Rule34Page'); break
                      case 'performers': void import('./pages/PerformersPage'); break
                      case 'downloads': void import('./pages/DownloadsPage'); break
                      case 'goonwall': void import('./pages/GoonWallPage'); break
                    }
                  }}
                  title={n.tip}
                  aria-label={`${n.name}${isActive ? ' (current page)' : ''}`}
                  aria-current={isActive ? 'page' : undefined}
                  className={cn(
                    'relative w-full text-left pl-3 pr-2 py-2.5 rounded-xl text-sm transition-all duration-200 border flex items-center gap-2 overflow-hidden',
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
                  <span className="flex-1 min-w-0 truncate">{n.name}</span>
                  {/* AI Processing indicator */}
                  {n.id === 'ai' && globalAiStatus?.isRunning && (
                    <span
                      className="shrink-0 flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-blue-500/20 text-blue-400 animate-pulse tabular-nums"
                      title={`Processing: ${globalAiStatus.processing} | Pending: ${globalAiStatus.pending} | Completed: ${globalAiStatus.completed}`}
                    >
                      <Loader2 size={10} className="animate-spin" />
                      {globalAiStatus.processing}
                    </span>
                  )}
                  {/* Untagged items badge */}
                  {n.id === 'ai' && !globalAiStatus?.isRunning && untaggedCount > 0 && (
                    <span
                      className="shrink-0 text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-400 tabular-nums"
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
                  onClick={() => navigateTo('ai')}
                  onMouseEnter={() => { void import('./pages/AiTaggerPage') }}
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
                    navigateTo('settings')
                    // Could scroll to tags section
                  }}
                  onMouseEnter={() => { void import('./pages/SettingsPage') }}
                  className="w-full text-left px-3 py-1.5 rounded-lg text-xs transition flex items-center gap-2 hover:bg-[var(--surface)] text-[var(--text-muted)] hover:text-[var(--text)]"
                >
                  <Tags size={14} />
                  <span>Manage Tags</span>
                </button>

                {/* Find Duplicates */}
                <button
                  onClick={() => {
                    navigateTo('library')
                    // Dispatch custom event to open duplicates modal after page loads
                    setTimeout(() => {
                      window.dispatchEvent(new CustomEvent('vault-open-duplicates'))
                    }, 100)
                  }}
                  onMouseEnter={() => { void import('./components/DuplicatesModal') }}
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
            // `relative` so any absolute children inside pages position
            // against MAIN, not the outer flex container — without this,
            // page content can render OVER the sidebar.
            //
            // transition-[transform,opacity] only — using transition-all
            // here animated the derived width during sidebar toggles
            // which left pages looking like they were "shifting between
            // tabs" while in fact the layout was reflowing mid-frame.
            // Layout properties now snap immediately; only the explicit
            // page-transition animations (translateY + opacity) tween.
            'relative flex-1 min-w-0 min-h-0 h-full overflow-hidden transition-[transform,opacity] duration-300 ease-in-out',
            pageTransition === 'enter' && 'page-transition-enter',
            pageTransition === 'exit' && 'page-transition-exit'
          )}
        >
          <React.Suspense
            fallback={
              <LoadingSpinner fullPage label="Loading page…" />
            }
          >
          {page === 'home' ? (
            <ErrorBoundary pageName="Home">
              <HomeDashboard
                onPlayMedia={(mediaId) => {
                  // Navigate to library and set pending media to open
                  window.api.goon?.recordWatch?.(mediaId).catch((err: unknown) => console.warn('[Home] Failed to record watch:', err))
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
            <ErrorBoundary pageName="Playlists"><PlaylistsPage /></ErrorBoundary>
          ) : page === 'sessions' ? (
            <ErrorBoundary pageName="Sessions"><SessionsPage /></ErrorBoundary>
          ) : page === 'downloads' ? (
            <ErrorBoundary pageName="Downloads"><DownloadsPage /></ErrorBoundary>
          ) : page === 'rule34' ? (
            <ErrorBoundary pageName="Browse"><Rule34Page /></ErrorBoundary>
          ) : page === 'performers' ? (
            <ErrorBoundary pageName="Performers"><PerformersPage /></ErrorBoundary>
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
          </React.Suspense>
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
                    <kbd className="px-2 py-1 bg-black/30 rounded text-xs">Shift+F</kbd>
                    <span className="text-white/70">Focus Mode (distraction-free)</span>
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
                  { id: 'home', icon: Home, label: 'Go to Home', shortcut: '0', action: () => { navigateTo('home'); setShowCommandPalette(false) } },
                  { id: 'library', icon: Library, label: 'Go to Library', shortcut: '1', action: () => { navigateTo('library'); setShowCommandPalette(false) } },
                  { id: 'feed', icon: Play, label: 'Go to Feed', shortcut: '2', action: () => { navigateTo('feed'); setShowCommandPalette(false) } },
                  { id: 'goonwall', icon: LayoutGrid, label: 'Go to Goon Wall', shortcut: '3', action: () => { navigateTo('goonwall'); setShowCommandPalette(false) } },
                  { id: 'sessions', icon: Activity, label: 'Go to Sessions', shortcut: '4', action: () => { navigateTo('sessions'); setShowCommandPalette(false) } },
                  { id: 'playlists', icon: ListMusic, label: 'Go to Playlists', action: () => { navigateTo('playlists'); setShowCommandPalette(false) } },
                  { id: 'brainwash', icon: Brain, label: 'Go to Brainwash', shortcut: '5', action: () => { navigateTo('captions'); setShowCommandPalette(false) } },
                  { id: 'stats', icon: BarChart3, label: 'Go to Stats', shortcut: '6', action: () => { navigateTo('stats'); setShowCommandPalette(false) } },
                  { id: 'settings', icon: Settings, label: 'Go to Settings', shortcut: ',', action: () => { navigateTo('settings'); setShowCommandPalette(false) } },
                  { id: 'divider1', divider: true },
                  { id: 'zen', icon: Eye, label: 'Toggle Zen Mode', shortcut: 'Z', action: () => { setZenMode(prev => !prev); setShowCommandPalette(false) } },
                  { id: 'shortcuts', icon: HelpCircle, label: 'Show Keyboard Shortcuts', shortcut: '?', action: () => { setShowShortcutsHelp(true); setShowCommandPalette(false) } },
                  { id: 'refresh', icon: RefreshCw, label: 'Refresh Library', action: async () => { await window.api.scanner?.rescan?.(); setShowCommandPalette(false); globalShowToast('info', 'Library scan started') } },
                  { id: 'rebuildThumbs', icon: RefreshCw, label: 'Rebuild Missing Thumbnails', action: async () => {
                    setShowCommandPalette(false)
                    try {
                      const r = await window.api.thumbs.rebuildMissing()
                      globalShowToast('success', `Re-queued ${r.enqueued} missing thumbs (${r.alreadyOk} already healthy)`)
                    } catch (err: any) {
                      globalShowToast('error', err?.message ?? 'Rebuild failed')
                    }
                  }},
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
                  // Library tools - Use custom events to communicate with LibraryPage component
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
                  { id: 'pmvEditor', icon: Scissors, label: 'Open PMV Editor', action: () => { navigateTo('pmv'); setShowCommandPalette(false) } },
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
  )
}

// TopBar / Btn / Dropdown moved to ./components/ui/* (#48 phase A).

type SortOption = 'newest' | 'oldest' | 'name' | 'views' | 'duration' | 'type' | 'size' | 'random' | 'recentlyViewed' | 'rating'



// ═══════════════════════════════════════════════════════════════════════════
// DOWNLOADS PAGE - Full page URL downloader
// ═══════════════════════════════════════════════════════════════════════════





// Toggle Switch Component
// ToggleSwitch moved to ./components/ui/ToggleSwitch.tsx (#48 phase A).

