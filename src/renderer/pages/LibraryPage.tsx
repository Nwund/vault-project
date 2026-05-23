// File: src/renderer/pages/LibraryPage.tsx
//
// Main library browser — the largest page in the app. Owns the media
// grid, filtering, multi-select, drag-select, all the in-place
// editing flyouts (tagger / scene detector / chapters / bookmarks /
// subtitles / etc.), and the inline MediaTile + MediaViewer it renders.

import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Activity,
  AlertCircle,
  Trash2,
  BarChart3,
  ArrowDown,
  ArrowUp,
  Bookmark,
  Brain,
  Calendar,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  Crop,
  Download,
  Eye,
  EyeOff,
  FileText,
  Film,
  Grid3x3 as Grid3X3,
  Heart,
  Image as ImageIcon,
  Layers,
  LayoutGrid,
  Library,
  ListMusic,
  ListVideo,
  MessageSquare,
  Pause,
  PenTool,
  Play,
  Plus,
  RefreshCw,
  Repeat,
  RotateCw,
  Scissors,
  Search,
  Shuffle,
  Sliders,
  Sparkles,
  Star,
  Tag,
  Tv,
  Lock,
  Type,
  Volume2,
  VolumeX,
  Wand2,
  Workflow,
  X,
  Zap,
} from 'lucide-react'
import type { MediaRow, MediaStatsRow, MediaType, PlaylistRow, TagRow, VaultSettings } from '../types'
import { useToast, useContextMenu } from '../contexts'
import { shuffleTake } from '../utils/shuffle'
import thumbnailLoadingGif from '../assets/overlays/thumbnail-loading.gif'
import { useDebounce, toFileUrlCached, useLazyLoad } from '../hooks/usePerformance'
import { useVideoPreview } from '../hooks/useVideoPreview'
import { useConfetti } from '../hooks/useConfetti'
import { useAnime } from '../hooks/useAnime'
import { formatBytes, formatDuration } from '../utils/formatters'
import { cn } from '../utils/cn'
import { extractItems, toFileUrl } from '../utils/api'
import { Btn, TopBar, Dropdown } from '../components/ui'
import { TagSelector } from '../components/TagSelector'
import { FloatingVideoPlayer } from '../components/FloatingVideoPlayer'
import { WatchLaterPanel } from '../components/WatchLaterPanel'
import { RecentlyViewedStrip } from '../components/RecentlyViewedStrip'
import { RecommendationsRail } from '../components/RecommendationsRail'
import { TrashPanel } from '../components/TrashPanel'
import { LibraryHealthPanel } from '../components/LibraryHealthPanel'
import { PinnedFiltersBar } from '../components/PinnedFiltersBar'
import { MediaListRow } from '../components/MediaListRow'
import { ColorPaletteFilter, COLOR_FILTER_EVENT, type ColorPaletteFilterEvent } from '../components/ColorPaletteFilter'
import { SidecarWatcherBadge } from '../components/SidecarWatcherBadge'
import { QuickLookPreview } from '../components/QuickLookPreview'
import { FocusModeToggle } from '../components/FocusModeToggle'
// Heavy modals lazy-loaded so their code defers until first open.
// The Suspense fallback is `null` because each modal handles its own
// open/closed visual (returns null when !open), so the very brief gap
// while the chunk loads is invisible.
const ExportPipelineModal = React.lazy(() => import('../components/ExportPipelineModal').then((m) => ({ default: m.ExportPipelineModal })))
const StackModeOverlay = React.lazy(() => import('../components/StackModeOverlay').then((m) => ({ default: m.StackModeOverlay })))
const DupTriageModal = React.lazy(() => import('../components/DupTriageModal').then((m) => ({ default: m.DupTriageModal })))
const SubLibraryModal = React.lazy(() => import('../components/SubLibraryModal').then((m) => ({ default: m.SubLibraryModal })))
const SpriteSheetChapterEditor = React.lazy(() => import('../components/SpriteSheetChapterEditor').then((m) => ({ default: m.SpriteSheetChapterEditor })))
const ServiceHealthDashboard = React.lazy(() => import('../components/ServiceHealthDashboard').then((m) => ({ default: m.ServiceHealthDashboard })))
import { useCardLayoutPrefs } from '../hooks/useCardLayoutPrefs'
import { useSpriteHoverScrub } from '../hooks/useSpriteHoverScrub'
import { SlideshowController } from '../components/SlideshowController'
import { VaultWrappedPanel } from '../components/VaultWrappedPanel'
import { AnalyticsDashboardPanel } from '../components/AnalyticsDashboardPanel'
import { UrlDownloaderPanel } from '../components/UrlDownloaderPanel'
import { DuplicatesModal } from '../components/DuplicatesModal'
import { PlaylistPicker, AddToPlaylistPopup } from '../components/PlaylistPickers'
import { SceneDetector } from '../components/SceneDetector'
import { VideoChapters } from '../components/VideoChapters'
import { ColorGrading } from '../components/ColorGrading'
import { BookmarkManager } from '../components/BookmarkManager'
import { SubtitleEditor } from '../components/SubtitleEditor'
import { ServerKeyframeExtractor } from '../components/ServerKeyframeExtractor'
import { VideoFilters } from '../components/VideoFilters'
import { SplitScreen } from '../components/SplitScreen'
import { SmartCrop } from '../components/SmartCrop'
import { MetadataEditor } from '../components/MetadataEditor'
import { PlaylistSorter } from '../components/PlaylistSorter'
import { WatchProgress } from '../components/WatchProgress'
import { MediaExporter } from '../components/MediaExporter'
import { AITagger } from '../components/AITagger'
import { ThumbnailSelector } from '../components/ThumbnailSelector'
import { RelatedMedia } from '../components/RelatedMedia'
import { MediaTimeline } from '../components/MediaTimeline'
import { QuickNote } from '../components/QuickNote'
import { ViewModeSelector } from '../components/ViewModeSelector'
import { AutoPlaylist } from '../components/AutoPlaylist'
import { MediaMerger } from '../components/MediaMerger'
import { MediaRotator } from '../components/MediaRotator'
import { WatermarkAdder } from '../components/WatermarkAdder'
import { MediaQueue } from '../components/MediaQueue'
import { TVRemotePanel } from '../components/TVRemotePanel'

type SortOption = 'newest' | 'oldest' | 'name' | 'views' | 'duration' | 'type' | 'size' | 'random' | 'recentlyViewed' | 'rating'

type MarkerRow = {
  id: string
  mediaId: string
  timeSec: number
  title: string
}

type OptimizeNamesResult = {
  success: boolean
  optimized: number
  skipped: number
  failed: number
  error?: string
}

// Page size options for library
const PAGE_SIZE_OPTIONS = [
  { value: 20, label: '20' },
  { value: 40, label: '40' },
  { value: 60, label: '60' },
  { value: 100, label: '100' },
  { value: 200, label: '200' },
  { value: -1, label: 'All' },
] as const
type LayoutOption = 'mosaic' | 'grid' | 'wall' | 'list'

const MAX_FLOATING_PLAYERS = 10
// 60 by default — bumping higher pulls 200+ thumbnails on first load
// and tanks the initial paint on big libraries. Pagination dropdown
// in the toolbar still lets users pick 20/40/60/100/200/All.
const DEFAULT_PAGE_SIZE = 60

// Helper to get persisted filter state from sessionStorage
function getPersistedFilters() {
  try {
    const saved = sessionStorage.getItem('vault_library_filters')
    if (saved) return JSON.parse(saved)
  } catch {}
  return null
}

export function LibraryPage(props: { settings: VaultSettings | null; selected: string[]; setSelected: (ids: string[]) => void; tagBarOpen: boolean; setTagBarOpen: (open: boolean | ((prev: boolean) => boolean)) => void; confetti?: ReturnType<typeof useConfetti>; anime?: ReturnType<typeof useAnime>; onNavigateToFeed?: () => void }) {
  const { confetti, anime } = props
  const { tagBarOpen, setTagBarOpen } = props
  const { showToast } = useToast()
  const { showContextMenu } = useContextMenu()
  const [media, setMedia] = useState<MediaRow[]>([])
  const [tags, setTags] = useState<TagRow[]>([])
  // Color-palette filter: when a swatch is picked in ColorPaletteFilter,
  // it dispatches COLOR_FILTER_EVENT with a set of matching mediaIds. We
  // intersect with that set in the sortedMedia memo. Null = no filter.
  const [colorFilterIds, setColorFilterIds] = useState<Set<string> | null>(null)
  const [colorFilterLabel, setColorFilterLabel] = useState<string | null>(null)

  // v2.7 #294 — Featured-less items. Persisted server-side via
  // tags.featureLess; we fetch the full set once on mount + on toggle.
  // When showFeatureLess is false (default), items in this set are
  // hidden from sortedMedia. The set also propagates to MediaTile so
  // it can render the EyeOff badge when an item is featureLess.
  const [featureLessSet, setFeatureLessSet] = useState<Set<string>>(new Set())
  const [showFeatureLess, setShowFeatureLess] = useState(false)

  useEffect(() => {
    let cancelled = false
    const refresh = async () => {
      try {
        const r = await window.api.tags?.featureLess?.list?.()
        if (cancelled) return
        if (r?.ok && Array.isArray(r.mediaIds)) {
          setFeatureLessSet(new Set(r.mediaIds))
        }
      } catch (err) {
        // Log but don't toast — this fetch is a background filter and
        // a missing tag plugin shouldn't surface error UI to the user.
        // Logged so a real bug shows up in the dev console.
        console.warn('[featureLess] list fetch failed:', err)
      }
    }
    refresh()
    // Re-fetch whenever the user toggles via context menu — listen for
    // a broadcast event the App.tsx context menu fires after a flip.
    const onFlip = () => refresh()
    window.addEventListener('vault:featureLessChanged', onFlip)
    return () => { cancelled = true; window.removeEventListener('vault:featureLessChanged', onFlip) }
  }, [])

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<ColorPaletteFilterEvent>).detail
      if (!detail || detail.rgb == null) {
        setColorFilterIds(null)
        setColorFilterLabel(null)
        return
      }
      setColorFilterIds(new Set(detail.mediaIds))
      setColorFilterLabel(detail.swatchName)
    }
    window.addEventListener(COLOR_FILTER_EVENT, handler)
    return () => window.removeEventListener(COLOR_FILTER_EVENT, handler)
  }, [])

  // v2.7 — open the Export Pipeline modal in response to a global event
  // (dispatched from the right-click context menu in App.tsx).
  useEffect(() => {
    const handler = () => setShowExportPipeline(true)
    window.addEventListener('vault:openExportPipeline', handler)
    return () => window.removeEventListener('vault:openExportPipeline', handler)
  }, [])

  // v2.7 — single dispatcher for all the v2.7 Library tools so things
  // like CommandPalette and right-click can summon any modal by name.
  // Two entry points:
  //   1. Live `vault:openLibraryTool` CustomEvent (right-click menu,
  //      any subcomponent on the page)
  //   2. sessionStorage `vault.pendingLibraryTool` set BEFORE
  //      navigating to /library — read once on mount and cleared. This
  //      is the race-free path for CommandPalette which navigates and
  //      then mounts the page; the live event would arrive before the
  //      listener installs.
  useEffect(() => {
    const openTool = (tool: string) => {
      switch (tool) {
        case 'serviceHealth': setShowServiceHealth(true); break
        case 'dupTriage': setShowDupTriage(true); break
        case 'stack': setShowStackMode(true); break
        case 'subLibrary': setShowSubLibrary(true); break
        case 'sprite': setShowSpriteEditor(true); break
        case 'exportPipeline': setShowExportPipeline(true); break
      }
    }
    const handler = (e: Event) => openTool((e as CustomEvent<string>).detail)
    window.addEventListener('vault:openLibraryTool', handler as EventListener)
    // On mount: drain any pending tool that was set by another surface
    // (e.g., CommandPalette) before navigating here.
    const pending = sessionStorage.getItem('vault.pendingLibraryTool')
    if (pending) {
      sessionStorage.removeItem('vault.pendingLibraryTool')
      openTool(pending)
    }
    return () => window.removeEventListener('vault:openLibraryTool', handler as EventListener)
  }, [])

  // v2.7 #291 — Quick Look state. The actual hold-Q effect is installed
  // below sortedMedia/focusedIndex so the closure can read them.
  const [quickLookOpen, setQuickLookOpen] = useState(false)
  const [quickLookMedia, setQuickLookMedia] = useState<MediaRow | null>(null)
  const quickLookTimerRef = useRef<number | null>(null)

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
  // Scroll the page back to top whenever the user paginates or changes
  // sort/filter. Without this, paging to page 2 leaves the viewport
  // pinned at the bottom of page 1 and the user wonders if the click
  // worked. The Library is rendered inside <main> which is the
  // scrollable region, so target the nearest scrollable ancestor of
  // any tile element.
  useEffect(() => {
    // Use queueMicrotask so the scroll fires AFTER React commits the
    // new page contents — scrolling before paint flickers.
    queueMicrotask(() => {
      const grid = document.querySelector('[data-page="library"]')
      const scroller = grid?.closest('main, [data-scroll-root]')
        ?? document.scrollingElement
      try {
        ;(scroller as HTMLElement | null)?.scrollTo({ top: 0, behavior: 'smooth' })
      } catch { /* older browsers */ }
    })
  }, [currentPage, sortBy, sortAscending, typeFilter])
  const [totalCount, setTotalCount] = useState(0)
  // Fuzzy-search hint: when LIKE returned 0 results and the backend
  // fell back to closest-spelling match, surface "Did you mean X?" so
  // the user knows their query was rewritten.
  const [fuzzyHint, setFuzzyHint] = useState<{ original: string; matched: string } | null>(null)
  const [typeCounts, setTypeCounts] = useState<{ video: number; image: number; gif: number }>({ video: 0, image: 0, gif: 0 })
  const [randomSeed, setRandomSeed] = useState(0) // Used to trigger re-shuffle
  const [tagBarHover, setTagBarHover] = useState(false)
  const [tagBarMouseY, setTagBarMouseY] = useState(0)
  // Two-level taxonomy view — when 'category', sidebar groups tags
  // under category accordions. Falls back to 'flat' (existing flat
  // TagSelector + Quick chips) by default.
  const [tagBarView, setTagBarView] = useState<'flat' | 'category'>(() => {
    try { return (localStorage.getItem('vault_tagbar_view') as 'flat' | 'category') ?? 'flat' }
    catch { return 'flat' }
  })
  const [categories, setCategories] = useState<Array<{
    id: string; label: string; color: string; description: string
    tags: Array<{ name: string; count: number }>
    totalMedia: number
  }>>([])
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem('vault_expanded_categories')
      return new Set(saved ? JSON.parse(saved) : [])
    } catch { return new Set() }
  })
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
  // Map of mediaId → denialUntil timestamp for any media with an
  // active per-media denial cooldown. Refreshed on mount, on
  // vault:changed, and every minute while mounted so badges count
  // down without leaning on a per-card subscription.
  const [denialUntilByMedia, setDenialUntilByMedia] = useState<Map<string, number>>(new Map())
  useEffect(() => {
    let cancelled = false
    const refresh = async () => {
      try {
        const res: any = await window.api.tags?.denial?.listActive?.()
        if (cancelled) return
        const next = new Map<string, number>()
        if (res?.ok && Array.isArray(res.items)) {
          for (const r of res.items) next.set(r.mediaId, r.until)
        }
        setDenialUntilByMedia(next)
      } catch { /* ignore */ }
    }
    void refresh()
    const onChange = () => { void refresh() }
    window.addEventListener('vault:changed', onChange)
    const tick = window.setInterval(refresh, 60_000)
    return () => {
      cancelled = true
      window.removeEventListener('vault:changed', onChange)
      window.clearInterval(tick)
    }
  }, [])
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
  const [showTrashPanel, setShowTrashPanel] = useState(false) // Persistent trash / recycle bin
  const [showLibraryHealth, setShowLibraryHealth] = useState(false) // Actionable health dashboard
  const [showExportPipeline, setShowExportPipeline] = useState(false) // v2.7 #322 export pipeline modal
  const [showStackMode, setShowStackMode] = useState(false) // v2.7 #296 TikTok-style stack pager
  const [showDupTriage, setShowDupTriage] = useState(false) // v2.7 #354 dedup triage queue
  const [showSubLibrary, setShowSubLibrary] = useState(false) // v2.7 #378 animated sub-library
  const [showSpriteEditor, setShowSpriteEditor] = useState(false) // v2.7 #316 sprite-sheet chapter editor
  const [showServiceHealth, setShowServiceHealth] = useState(false) // v2.7 service health dashboard
  const [showSlideshow, setShowSlideshow] = useState(false) // Stills slideshow with Ken Burns / transitions
  const [showVaultWrapped, setShowVaultWrapped] = useState(false) // Spotify-style monthly recap
  const [showAnalytics, setShowAnalytics] = useState(false) // Personal analytics dashboard
  const [showTVRemotePanel, setShowTVRemotePanel] = useState(false) // TV Remote control panel
  const [showUrlDownloaderPanel, setShowUrlDownloaderPanel] = useState(false) // URL Downloader panel
  // Library tool panel states
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

  // Handle tool panel events from context menu — direct dispatch when
  // user is already on /library, OR drain sessionStorage handoff when
  // arriving from another page (App.tsx context menu stashes there
  // before navigating).
  useEffect(() => {
    const openByName = (tool: string, media: MediaRow) => {
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
    const handleToolEvent = (e: CustomEvent<{ tool: string; media: MediaRow }>) => {
      const { tool, media } = e.detail
      openByName(tool, media)
    }
    window.addEventListener('vault-open-tool', handleToolEvent as EventListener)
    // Drain handoff on mount — for context-menu actions fired from
    // another page that navigated here.
    try {
      const pending = sessionStorage.getItem('vault.pendingLibraryToolPayload')
      if (pending) {
        sessionStorage.removeItem('vault.pendingLibraryToolPayload')
        const parsed = JSON.parse(pending) as { tool: string; media: MediaRow }
        if (parsed.tool && parsed.media) openByName(parsed.tool, parsed.media)
      }
    } catch { /* ignore */ }
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
    // v2.7 — Check denial state. If the user has denied this media for
    // a duration that hasn't elapsed, refuse to open + show a toast
    // with the remaining time. They can still clear via the right-click
    // menu's "Deny this for…" → 0m, or from MediaInfoModal.
    window.api.tags?.denial?.status?.(mediaId).then((r: any) => {
      if (r?.ok && r.status?.active) {
        const ms = r.status.remainingMs ?? 0
        const human = ms > 86400_000 ? `${Math.floor(ms / 86400_000)}d`
          : ms > 3600_000 ? `${Math.floor(ms / 3600_000)}h ${Math.floor((ms % 3600_000) / 60_000)}m`
          : ms > 60_000 ? `${Math.floor(ms / 60_000)}m`
          : `${Math.ceil(ms / 1000)}s`
        showToast('info', `Denied · ${human} remaining. Clear via right-click → Media Info → Clear.`)
        return
      }
      // Not denied — proceed normally
      setOpenIds(prev => {
        if (prev.includes(mediaId)) return prev
        if (prev.length >= MAX_FLOATING_PLAYERS) return prev
        window.api.goon?.recordWatch?.(mediaId).catch((err: unknown) => console.warn('[Player] Failed to record watch:', err))
        return [...prev, mediaId]
      })
    }).catch(() => {
      // Denial check failed (probably the bridge isn't available);
      // proceed as if not denied.
      setOpenIds(prev => {
        if (prev.includes(mediaId)) return prev
        if (prev.length >= MAX_FLOATING_PLAYERS) return prev
        window.api.goon?.recordWatch?.(mediaId).catch((err: unknown) => console.warn('[Player] Failed to record watch:', err))
        return [...prev, mediaId]
      })
    })
  }, [showToast])

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
    // Library tool handlers
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
    // Library tool event listeners
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
      // Library tool cleanup
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
    }).catch((err: unknown) => console.warn('[Search] Failed to load tags:', err))
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
    // #114 — apply post-fetch -tag:foo exclusions from the boolean DSL
    // search syntax. The DB layer supports excludeTags via listMedia
    // but the media:search IPC doesn't surface it yet; doing the
    // filter client-side keeps the change scoped to the renderer.
    // Note: this slightly skews "N items" / pagination when many
    // results are excluded, but matches the existing blacklist pattern.
    // Inline-parse just the excludes here to avoid a TDZ on
    // parseAdvancedSearch (declared further down in this file).
    const excludes: string[] = []
    for (const token of debouncedQuery.split(/\s+/)) {
      if (token.toLowerCase().startsWith('-tag:')) {
        const t = token.slice(5).trim().toLowerCase()
        if (t) excludes.push(t)
      }
    }
    let filtered = excludes.length > 0
      ? media.filter((m: any) => {
          const mediaTags = (m.tags as string[] | undefined) ?? []
          if (mediaTags.length === 0) return true
          const lower = mediaTags.map(t => String(t).toLowerCase())
          for (const ex of excludes) if (lower.includes(ex)) return false
          return true
        })
      : media

    // Color-palette filter intersection (#286).
    if (colorFilterIds) {
      filtered = filtered.filter((m: MediaRow) => colorFilterIds.has(m.id))
    }

    // v2.7 #294 — Hide featureLess items unless the user has toggled
    // them visible. When visible, they still get a badge via MediaTile
    // so they're recognizable.
    if (!showFeatureLess && featureLessSet.size > 0) {
      filtered = filtered.filter((m: MediaRow) => !featureLessSet.has(m.id))
    }

    // Database handles: newest, oldest, name, views, duration, size, random
    // Only 'type' needs local sorting
    if (sortBy === 'type') {
      const sorted = [...filtered]
      const typeOrder: Record<string, number> = { video: 0, gif: 1, image: 2 }
      return sorted.sort((a, b) => {
        const aOrder = typeOrder[a.type] ?? 3
        const bOrder = typeOrder[b.type] ?? 3
        if (aOrder !== bOrder) return aOrder - bOrder
        return (b.addedAt ?? 0) - (a.addedAt ?? 0)
      })
    }
    // For all other sorts, database already sorted the data
    return filtered
  }, [media, sortBy, debouncedQuery, colorFilterIds, showFeatureLess, featureLessSet])

  // Effective page size: -1 means show all
  const effectivePageSize = pageSize === -1 ? sortedMedia.length : pageSize
  const totalPages = effectivePageSize > 0 ? Math.ceil(sortedMedia.length / effectivePageSize) : 1
  const showPagination = pageSize !== -1 && sortedMedia.length > effectivePageSize

  // v2.7 #291 — Quick Look: hold Q on a focused tile to pop a centered
  // enlarged preview. Release Q to close. Q because Space is already
  // bound to "open floating player".
  useEffect(() => {
    const onDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.code !== 'KeyQ' || e.repeat || quickLookTimerRef.current != null) return
      if (focusedIndex < 0 || focusedIndex >= sortedMedia.length) return
      const m = sortedMedia[focusedIndex]
      quickLookTimerRef.current = window.setTimeout(() => {
        setQuickLookMedia(m)
        setQuickLookOpen(true)
      }, 220)
    }
    const onUp = (e: KeyboardEvent) => {
      if (e.code !== 'KeyQ') return
      if (quickLookTimerRef.current != null) {
        clearTimeout(quickLookTimerRef.current)
        quickLookTimerRef.current = null
      }
      setQuickLookOpen(false)
      setQuickLookMedia(null)
    }
    window.addEventListener('keydown', onDown)
    window.addEventListener('keyup', onUp)
    return () => {
      window.removeEventListener('keydown', onDown)
      window.removeEventListener('keyup', onUp)
      if (quickLookTimerRef.current != null) clearTimeout(quickLookTimerRef.current)
    }
  }, [focusedIndex, sortedMedia])

  // Selection-mode keyboard shortcuts.
  //   Esc          — exit selection mode + clear
  //   Ctrl/Cmd-A   — select every match across all pages
  useEffect(() => {
    if (!selectionMode) return
    const onKey = async (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.key === 'Escape') {
        e.preventDefault()
        setSelectionMode(false)
        setSelectedIds(new Set())
        return
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'a' || e.key === 'A')) {
        e.preventDefault()
        try {
          const r: any = await (window.api.media as any).ids({
            q: debouncedQuery, type: typeFilter, tags: activeTags, sortBy, sortAscending,
          })
          const ids = Array.isArray(r?.ids) ? r.ids : []
          setSelectedIds(new Set(ids))
        } catch (err: any) {
          showToast('error', `Select all failed: ${err?.message ?? String(err)}`)
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selectionMode, debouncedQuery, typeFilter, activeTags, sortBy, sortAscending, showToast])

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
        case 'c':
        case 'C':
          // Compare Mode: open SplitScreen with the multi-selection.
          // Requires multi-select active + at least 2 items selected;
          // SplitScreen uses the selection as its source pool when
          // selectionMode is on (logic in the showSplitScreen JSX).
          if (selectionMode && selectedIds.size >= 2) {
            e.preventDefault()
            setShowSplitScreen(true)
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
      excludeTags: [] as string[],         // #114: -tag:foo support
      type: null as MediaType | null,
      rating: null as number | null,
      ratingOp: '=' as '=' | '>' | '<' | '>=' | '<='
    }

    // Extract special filters
    const parts: string[] = []
    const tokens = query.split(/\s+/)

    for (const token of tokens) {
      // -tag:foo  → exclude this tag from results (#114 boolean DSL)
      if (token.toLowerCase().startsWith('-tag:')) {
        const tagName = token.slice(5).trim()
        if (tagName) result.excludeTags.push(tagName.toLowerCase())
      }
      // tag:tagname
      else if (token.toLowerCase().startsWith('tag:')) {
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
      // Server-side pagination — only fetch the visible window when the
      // user has paginated browsing on. "Show All" (pageSize === -1) still
      // pulls up to 10000 for the legacy infinite-scroll behavior on small
      // libraries. With 60/page on a 30k library this drops the round-trip
      // from ~30k rows to ~60 rows. (#21 focused slice.)
      const usePagination = pageSize !== -1
      const m = await window.api.media.search({
        q: parsed.text,
        type: effectiveType,
        tags: effectiveTags,
        sortBy: dbSortBy,
        limit: usePagination ? pageSize : undefined,
        offset: usePagination ? (currentPage - 1) * pageSize : undefined,
      } as any)
      let items: MediaRow[] = extractItems<MediaRow>(m)
      // Pull the unsliced total from the response (server returns
      // {items, total} now). Falls back to items.length when the IPC
      // returns the legacy bare-array shape.
      const serverTotal: number | null = (m as any)?.total ?? null
      // Capture fuzzy-search metadata if the backend fell back to
      // Levenshtein matching (LIKE returned 0). Surfaces as "Did you
      // mean X?" hint above the results grid.
      const fuzzyApplied: boolean = !!(m as any)?.fuzzyApplied
      const fuzzyTerm: string | null = (m as any)?.fuzzyTerm ?? null
      if (fuzzyApplied && parsed.text && fuzzyTerm && fuzzyTerm !== parsed.text) {
        setFuzzyHint({ original: parsed.text, matched: fuzzyTerm })
      } else {
        setFuzzyHint(null)
      }

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
      // When server-paginated, the items array is the visible window —
      // use the unsliced server total for the pagination control. When
      // pulling all (pageSize === -1), serverTotal === items.length so
      // either path is correct.
      setTotalCount(serverTotal ?? items.length)

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
  // pageSize + currentPage now affect the server-side window, so they
  // belong in the dep array. Without them, paging would silently keep
  // showing the page-1 batch.
  }, [debouncedQuery, typeFilter, activeTags, sortBy, sortAscending, parseAdvancedSearch, pageSize, currentPage])

  useEffect(() => {
    let alive = true
    ;(async () => {
      // Use listWithCounts and filter out tags with no media attached
      const t = await window.api.tags.listWithCounts?.() ?? await window.api.tags.list()
      if (!alive) return
      // Filter to only show tags that have at least 1 media item
      const filtered = Array.isArray(t) ? t.filter((tag: any) => tag.count === undefined || tag.count > 0) : t
      setTags(filtered)
      // Two-level taxonomy data — loaded once at mount so the category
      // view is instant when the user flips to it. Refreshed on
      // vault-changed events alongside the flat tag list.
      try {
        const cats = await window.api.tags.categoriesWithCounts?.()
        if (alive && Array.isArray(cats)) setCategories(cats)
      } catch (err) {
        console.warn('[Library] failed to load category taxonomy:', err)
      }
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
    // #153 — List view: single dense column. Each row is its own
    // grid-item; MediaTile's own renderer adapts to wide cards.
    if (layout === 'list') {
      return {
        display: 'flex',
        flexDirection: 'column',
        gap: '4px',
        width: '100%',
        minWidth: 0,
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
    <div className="h-full w-full flex flex-col overflow-hidden" data-page="library">
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
              {/* #153 — Notion-style List view: dense rows + metadata columns. */}
              <button
                onClick={() => setLayout('list')}
                className={cn(
                  'px-2.5 py-1.5 text-[10px] font-medium transition',
                  layout === 'list' ? 'bg-[var(--primary)]/30 text-white' : 'text-white/50 hover:text-white/80'
                )}
                title="Dense list with metadata columns"
              >
                List
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

            {/* Duplicates / TV / Download moved into the Tools dropdown
                below to keep the toolbar lean — only Watch Later stays
                as a peer button. */}

            {/* v2.7 #323 — Sidecar watcher status pill. Tiny click-to-expand
                control showing watched-roots count + start/stop + add-root. */}
            <SidecarWatcherBadge />

            {/* v2.7 — Distraction-free focus mode toggle. Hides all chrome
                when active; the exit pill stays accessible at top-right. */}
            <FocusModeToggle />

            {/* Advanced Tools Dropdown */}
            <div
              className="relative group"
              onMouseEnter={() => {
                // v2.7 — prefetch every lazy v2.7 modal chunk in one hover
                // sweep on the Tools button itself, not just per-entry.
                // The user has clearly opened the dropdown, so warming all
                // six is much faster than waiting for the per-entry hover.
                void import('../components/ExportPipelineModal')
                void import('../components/StackModeOverlay')
                void import('../components/DupTriageModal')
                void import('../components/SubLibraryModal')
                void import('../components/SpriteSheetChapterEditor')
                void import('../components/ServiceHealthDashboard')
              }}
            >
              <Btn
                tone="ghost"
                className="flex items-center gap-1.5"
                title="Advanced Tools"
              >
                <Wand2 size={14} />
                <span className="text-xs hidden sm:inline">Tools</span>
                <ChevronDown size={12} />
              </Btn>
              {/* Compact, opaque dropdown. Section headers stay visible
                  while the list scrolls underneath. Sized to fit comfortably
                  in a small viewport: narrower (w-56), shorter (max-h-[70vh]),
                  with explicit overflow-y-auto on a tighter list so all
                  18+ tools remain reachable via scroll. */}
              <div className="absolute right-0 top-full mt-1 w-56 max-h-[70vh] overflow-y-auto bg-zinc-950 border border-white/10 rounded-xl shadow-2xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50 text-white scrollbar-thin">
                <div className="p-2 border-b border-white/10">
                  <span className="text-xs text-white/50 font-medium">Library</span>
                </div>
                <div className="p-1">
                  <button onClick={() => setShowDuplicatesModal(true)} className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-pink-500/15 rounded-md text-[13px] text-left text-white"><AlertCircle size={14} />Find Duplicates</button>
                  <button onClick={() => setShowTVRemotePanel(true)} className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-pink-500/15 rounded-md text-[13px] text-left text-white"><Tv size={14} />TV Remote</button>
                  <button onClick={() => setShowUrlDownloaderPanel(true)} className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-pink-500/15 rounded-md text-[13px] text-left text-white"><Download size={14} />URL Downloader</button>
                  <button onClick={() => setShowTrashPanel(true)} className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-pink-500/15 rounded-md text-[13px] text-left text-white"><Trash2 size={14} />Trash</button>
                  <button onClick={() => setShowLibraryHealth(true)} className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-pink-500/15 rounded-md text-[13px] text-left text-white"><Activity size={14} />Library Health</button>
                  {/* Single-click "tag the whole library" so the user
                      doesn't have to leave their browse context to
                      kick off the AI queue. ai:queue-untagged honors
                      already-tagged items and only enqueues media
                      missing canonical tags. */}
                  <button
                    onClick={async () => {
                      try {
                        const r: any = await (window.api as any).ai?.queueUntagged?.()
                        if (r?.ok || typeof r?.queued === 'number') {
                          showToast('success', `Queued ${r.queued ?? '?'} untagged items for AI analysis`)
                        } else {
                          showToast('info', 'Queued untagged items for AI analysis')
                        }
                      } catch (err: any) {
                        showToast('error', `AI queue failed: ${err?.message ?? String(err)}`)
                      }
                    }}
                    className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-blue-500/15 rounded-md text-[13px] text-left text-white"
                  >
                    <Brain size={14} />Queue untagged for AI
                  </button>
                </div>
                <div className="p-2 border-t border-b border-white/10 bg-gradient-to-r from-fuchsia-500/5 to-transparent">
                  <span className="text-xs text-fuchsia-300 font-medium flex items-center gap-1.5"><Sparkles size={11} />v2.7 — Integration tools</span>
                </div>
                <div className="p-1">
                  <button onClick={() => setShowExportPipeline(true)} onMouseEnter={() => { void import('../components/ExportPipelineModal') }} className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-emerald-500/15 rounded-md text-[13px] text-left text-white"><Workflow size={14} />Export Pipeline</button>
                  <button onClick={() => setShowStackMode(true)} onMouseEnter={() => { void import('../components/StackModeOverlay') }} className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-violet-500/15 rounded-md text-[13px] text-left text-white"><Layers size={14} />Stack Mode</button>
                  <button onClick={() => setShowDupTriage(true)} onMouseEnter={() => { void import('../components/DupTriageModal') }} className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-amber-500/15 rounded-md text-[13px] text-left text-white"><AlertCircle size={14} />Duplicate Triage</button>
                  <button onClick={() => setShowSubLibrary(true)} onMouseEnter={() => { void import('../components/SubLibraryModal') }} className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-pink-500/15 rounded-md text-[13px] text-left text-white"><Sparkles size={14} />Animated sub-library</button>
                  <button onClick={() => setShowSpriteEditor(true)} onMouseEnter={() => { void import('../components/SpriteSheetChapterEditor') }} className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-cyan-500/15 rounded-md text-[13px] text-left text-white"><Film size={14} />Sprite-sheet Chapters</button>
                  <button onClick={() => setShowServiceHealth(true)} onMouseEnter={() => { void import('../components/ServiceHealthDashboard') }} className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-emerald-500/15 rounded-md text-[13px] text-left text-white"><Activity size={14} />Service Health</button>
                </div>
                <div className="p-2 border-t border-b border-white/10">
                  <span className="text-xs text-white/50 font-medium">Sidecar interop</span>
                </div>
                <div className="p-1">
                  <button
                    onClick={async () => {
                      showToast('info', 'Exporting NFO sidecars across library…')
                      try {
                        const res = await window.api.nfo.exportAll()
                        showToast('success', `NFO export: ${res.written} written · ${res.skipped} skipped · ${res.failed} failed`)
                      } catch (e: any) {
                        showToast('error', e?.message ?? 'NFO export failed')
                      }
                    }}
                    className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-orange-500/15 rounded-md text-[13px] text-left text-white"
                  >
                    <FileText size={14} />Export NFO sidecars (all)
                  </button>
                  <button
                    onClick={async () => {
                      showToast('info', 'Scanning for .stash.json sidecars…')
                      try {
                        const res = await window.api.stash.importSidecars()
                        if (res.ok) {
                          showToast('success', `Stash import: ${res.matched}/${res.scanned} matched · ${res.tagsImported} tags · ${res.performersImported} performers`)
                        } else {
                          showToast('error', 'Stash import failed')
                        }
                      } catch (e: any) {
                        showToast('error', e?.message ?? 'Stash import failed')
                      }
                    }}
                    className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-indigo-500/15 rounded-md text-[13px] text-left text-white"
                  >
                    <Layers size={14} />Import .stash.json sidecars
                  </button>
                </div>
                <div className="p-2 border-t border-b border-white/10">
                  <span className="text-xs text-white/50 font-medium">Insights & recaps</span>
                </div>
                <div className="p-1">
                  <button onClick={() => setShowSlideshow(true)} className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-pink-500/15 rounded-md text-[13px] text-left text-white"><Play size={14} />Slideshow</button>
                  <button onClick={() => setShowVaultWrapped(true)} className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-pink-500/15 rounded-md text-[13px] text-left text-white"><Sparkles size={14} />Vault Wrapped</button>
                  <button onClick={() => setShowAnalytics(true)} className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-pink-500/15 rounded-md text-[13px] text-left text-white"><BarChart3 size={14} />Analytics</button>
                </div>
                <div className="p-2 border-t border-b border-white/10">
                  <span className="text-xs text-white/50 font-medium">Video Tools</span>
                </div>
                <div className="p-1">
                  <button onClick={() => { if (media[0]) { setActiveToolMedia(media[0]); setShowSceneDetector(true) }}} className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-pink-500/15 rounded-md text-[13px] text-left text-white"><Activity size={14} />Scene Detector</button>
                  <button onClick={() => { if (media[0]) { setActiveToolMedia(media[0]); setShowVideoChapters(true) }}} className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-pink-500/15 rounded-md text-[13px] text-left text-white"><ListVideo size={14} />Video Chapters</button>
                  <button onClick={() => { if (media[0]) { setActiveToolMedia(media[0]); setShowColorGrading(true) }}} className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-pink-500/15 rounded-md text-[13px] text-left text-white"><Sliders size={14} />Color Grading</button>
                  <button onClick={() => { if (media[0]) { setActiveToolMedia(media[0]); setShowVideoFilters(true) }}} className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-pink-500/15 rounded-md text-[13px] text-left text-white"><Sparkles size={14} />Video Filters</button>
                  <button onClick={() => setShowSplitScreen(true)} className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-pink-500/15 rounded-md text-[13px] text-left text-white"><Grid3X3 size={14} />Split Screen</button>
                  <button onClick={() => { if (media[0]) { setActiveToolMedia(media[0]); setShowKeyframeExtractor(true) }}} className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-pink-500/15 rounded-md text-[13px] text-left text-white"><Film size={14} />Keyframe Extractor</button>
                </div>
                <div className="p-2 border-t border-b border-white/10">
                  <span className="text-xs text-white/50 font-medium">Edit Tools</span>
                </div>
                <div className="p-1">
                  <button onClick={() => { if (media[0]) { setActiveToolMedia(media[0]); setShowSmartCrop(true) }}} className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-pink-500/15 rounded-md text-[13px] text-left text-white"><Crop size={14} />Smart Crop</button>
                  <button onClick={() => { if (media[0]) { setActiveToolMedia(media[0]); setShowMediaRotator(true) }}} className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-pink-500/15 rounded-md text-[13px] text-left text-white"><RotateCw size={14} />Rotate & Flip</button>
                  <button onClick={() => { if (media[0]) { setActiveToolMedia(media[0]); setShowWatermarkAdder(true) }}} className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-pink-500/15 rounded-md text-[13px] text-left text-white"><Type size={14} />Add Watermark</button>
                  <button onClick={() => { if (media[0]) { setActiveToolMedia(media[0]); setShowThumbnailSelector(true) }}} className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-pink-500/15 rounded-md text-[13px] text-left text-white"><ImageIcon size={14} />Thumbnail Selector</button>
                  <button onClick={() => setShowMediaMerger(true)} className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-pink-500/15 rounded-md text-[13px] text-left text-white"><Scissors size={14} />Merge Videos</button>
                  <button onClick={() => { if (media[0]) { setActiveToolMedia(media[0]); setShowMediaExporter(true) }}} className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-pink-500/15 rounded-md text-[13px] text-left text-white"><Download size={14} />Export Media</button>
                </div>
                <div className="p-2 border-t border-b border-white/10">
                  <span className="text-xs text-white/50 font-medium">Organization</span>
                </div>
                <div className="p-1">
                  <button onClick={() => { if (media[0]) { setActiveToolMedia(media[0]); setShowMetadataEditor(true) }}} className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-pink-500/15 rounded-md text-[13px] text-left text-white"><PenTool size={14} />Metadata Editor</button>
                  <button onClick={() => { if (media[0]) { setActiveToolMedia(media[0]); setShowAITagger(true) }}} className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-pink-500/15 rounded-md text-[13px] text-left text-white"><Brain size={14} />AI Auto-Tagger</button>
                  <button onClick={() => { if (media[0]) { setActiveToolMedia(media[0]); setShowBookmarkManager(true) }}} className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-pink-500/15 rounded-md text-[13px] text-left text-white"><Bookmark size={14} />Bookmark Manager</button>
                  <button onClick={() => { if (media[0]) { setActiveToolMedia(media[0]); setShowSubtitleEditor(true) }}} className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-pink-500/15 rounded-md text-[13px] text-left text-white"><MessageSquare size={14} />Subtitle Editor</button>
                  <button onClick={() => { if (media[0]) { setActiveToolMedia(media[0]); setShowQuickNote(true) }}} className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-pink-500/15 rounded-md text-[13px] text-left text-white"><FileText size={14} />Quick Note</button>
                </div>
                <div className="p-2 border-t border-b border-white/10">
                  <span className="text-xs text-white/50 font-medium">Views & Playlists</span>
                </div>
                <div className="p-1">
                  <button onClick={() => setShowViewModeSelector(true)} className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-pink-500/15 rounded-md text-[13px] text-left text-white"><LayoutGrid size={14} />View Modes</button>
                  <button onClick={() => setShowMediaTimeline(true)} className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-pink-500/15 rounded-md text-[13px] text-left text-white"><Calendar size={14} />Media Timeline</button>
                  <button onClick={() => setShowWatchProgress(true)} className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-pink-500/15 rounded-md text-[13px] text-left text-white"><Play size={14} />Continue Watching</button>
                  <button onClick={() => setShowAutoPlaylist(true)} className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-pink-500/15 rounded-md text-[13px] text-left text-white"><ListMusic size={14} />Auto Playlists</button>
                  <button onClick={() => setShowPlaylistSorter(true)} className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-pink-500/15 rounded-md text-[13px] text-left text-white"><Layers size={14} />Playlist Sorter</button>
                  <button onClick={() => setShowMediaQueue(true)} className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-pink-500/15 rounded-md text-[13px] text-left text-white"><ListVideo size={14} />Media Queue</button>
                  <button onClick={() => { if (media[0]) { setActiveToolMedia(media[0]); setShowRelatedMedia(true) }}} className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-pink-500/15 rounded-md text-[13px] text-left text-white"><Sparkles size={14} />Related Media</button>
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

                {/* Search tips — click any chip to insert into the search.
                    v2.7 #308 — these snippets compile through smartQuery
                    when the input matches the DSL grammar. */}
                {!query && (
                  <div id="search-tips" className="px-3 py-2 border-t border-[var(--border)] bg-black/20">
                    <div className="text-[10px] text-[var(--muted)] uppercase tracking-wide mb-1.5">Search Tips · click to insert</div>
                    <div className="flex flex-wrap gap-1">
                      {[
                        'tag:performer',
                        '-tag:compilation',
                        'type:video',
                        'rating:>=4',
                        'duration:30..',
                        'duration:..120',
                      ].map((chip) => (
                        <button
                          key={chip}
                          type="button"
                          onMouseDown={(e) => {
                            e.preventDefault()
                            setQuery((prev) => (prev ? `${prev} ${chip}` : chip))
                          }}
                          className="px-1.5 py-0.5 rounded bg-white/10 hover:bg-[var(--primary)]/20 hover:text-[var(--primary)] text-[11px] font-mono transition"
                        >
                          {chip}
                        </button>
                      ))}
                    </div>
                    <div className="text-[10px] text-white/40 mt-1.5">
                      Combine any of these — smart-query DSL grammar applies.
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

          {/* Color-palette filter — discover by dominant color (#286).
              Self-contained popover; dispatches COLOR_FILTER_EVENT which
              we listen for above to intersect the displayed media set. */}
          <ColorPaletteFilter />

          {/* v2.7 #294 — Show featureLess items toggle. Hidden by default.
              Only shown when there ARE featureLess items so the chip
              doesn't clutter the topbar when unused. */}
          {featureLessSet.size > 0 && (
            <button
              onClick={() => setShowFeatureLess((v) => !v)}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border transition-all hover:scale-105 ${
                showFeatureLess
                  ? 'bg-zinc-500/20 border-zinc-400/40 text-zinc-200'
                  : 'bg-black/20 border-[var(--border)] text-[var(--muted)] hover:text-white'
              }`}
              title={showFeatureLess ? 'Featured-less items are visible — click to hide' : `${featureLessSet.size} featured-less item${featureLessSet.size === 1 ? '' : 's'} hidden — click to show`}
            >
              <EyeOff size={12} />
              <span className="text-[10px] font-medium tabular-nums">
                {showFeatureLess ? 'Show -less' : `+${featureLessSet.size}`}
              </span>
            </button>
          )}

          {/* Pinned filter chips — sticky quick-access for the user's most-used
              filter combinations. Click "Pin current" to save the active
              filter snapshot; click any chip to apply. Persisted in
              localStorage; cap 10 chips. */}
          <PinnedFiltersBar
            current={{
              query,
              activeTags,
              typeFilter,
              sortBy,
              sortAscending,
              pageSize,
              layout,
            }}
            onApply={(snap) => {
              setQuery(snap.query)
              setActiveTags(snap.activeTags)
              setTypeFilter(snap.typeFilter as MediaType | 'all')
              setSortBy(snap.sortBy as SortOption)
              setSortAscending(snap.sortAscending)
              setPageSize(snap.pageSize)
              setLayout(snap.layout as any)
              setCurrentPage(1)
            }}
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
        {/* Clear-all pill — single click reset when any filter is on.
            Mirrors the empty-state CTA but reachable WITHOUT having to
            scroll past every tile to a zero-result screen. */}
        {(debouncedQuery || activeTags.length > 0 || typeFilter !== 'all' || sortBy !== 'newest') && (
          <button
            onClick={() => {
              setQuery('')
              setActiveTags([])
              setTypeFilter('all')
              setSortBy('newest')
              setSortAscending(false)
            }}
            className="px-2.5 py-1 rounded-full text-[11px] font-medium transition shrink-0 bg-red-500/20 text-red-300 hover:bg-red-500/30 border border-red-500/30 flex items-center gap-1"
            title="Reset query, tags, type filter, and sort to defaults"
          >
            <X size={10} /> Clear all filters
          </button>
        )}
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
        {/* Recently watched — pivots the grid to recently-viewed sort.
            Quick way to resume what the user was watching last. */}
        <button
          onClick={() => {
            setSortBy('recentlyViewed')
            setSortAscending(false)
            setTypeFilter('all')
            setActiveTags([])
          }}
          className={cn(
            'px-2.5 py-1 rounded-full text-[11px] font-medium transition shrink-0 flex items-center gap-1',
            sortBy === 'recentlyViewed'
              ? 'bg-amber-500 text-white'
              : 'bg-white/5 text-[var(--text-muted)] hover:bg-white/10 hover:text-white'
          )}
          title="Sort by most-recently-watched"
        >
          <Clock size={10} /> Recently watched
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
            {/* View toggle — flat tag list vs two-level taxonomy. */}
            <div className="flex items-center gap-1 mb-2 p-0.5 bg-black/20 rounded border border-[var(--border)]">
              <button
                onClick={() => {
                  setTagBarView('flat')
                  try { localStorage.setItem('vault_tagbar_view', 'flat') } catch { /* ignore */ }
                }}
                className={cn(
                  'flex-1 px-1 py-0.5 rounded text-[10px] font-medium transition',
                  tagBarView === 'flat' ? 'bg-[var(--primary)] text-white' : 'text-[var(--muted)] hover:text-white'
                )}
              >
                Flat
              </button>
              <button
                onClick={() => {
                  setTagBarView('category')
                  try { localStorage.setItem('vault_tagbar_view', 'category') } catch { /* ignore */ }
                }}
                className={cn(
                  'flex-1 px-1 py-0.5 rounded text-[10px] font-medium transition',
                  tagBarView === 'category' ? 'bg-[var(--primary)] text-white' : 'text-[var(--muted)] hover:text-white'
                )}
                title="Group tags by category"
              >
                Category
              </button>
            </div>
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

            {/* Two-level taxonomy accordion — only renders in 'category' view. */}
            {tagBarView === 'category' && categories.length > 0 && !tagDropdownOpen && (
              <div className="space-y-1 mb-3">
                {categories.filter((c) => c.tags.length > 0).map((cat) => {
                  const expanded = expandedCategories.has(cat.id)
                  const toggleExpanded = () => {
                    setExpandedCategories((prev) => {
                      const next = new Set(prev)
                      if (next.has(cat.id)) next.delete(cat.id)
                      else next.add(cat.id)
                      try { localStorage.setItem('vault_expanded_categories', JSON.stringify(Array.from(next))) }
                      catch { /* ignore */ }
                      return next
                    })
                  }
                  return (
                    <div key={cat.id} className="rounded border border-[var(--border)] bg-black/15 overflow-hidden">
                      <button
                        onClick={toggleExpanded}
                        className="w-full px-2 py-1 flex items-center justify-between text-left hover:bg-white/5 transition"
                        title={cat.description}
                      >
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span
                            className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                            style={{ backgroundColor: cat.color }}
                          />
                          <span className="text-[10px] font-medium truncate">{cat.label}</span>
                        </div>
                        <div className="flex items-center gap-1 text-[9px] text-[var(--muted)] tabular-nums flex-shrink-0">
                          <span>{cat.tags.length}</span>
                          <ChevronLeft
                            size={9}
                            className={cn('transition-transform', expanded ? '-rotate-90' : 'rotate-180')}
                          />
                        </div>
                      </button>
                      {expanded && (
                        <div className="flex flex-wrap gap-0.5 p-1.5 border-t border-[var(--border)] bg-black/20">
                          {cat.tags.slice(0, 60).map((t) => {
                            const active = activeTags.includes(t.name)
                            return (
                              <button
                                key={t.name}
                                onClick={() => toggleTag(t.name)}
                                className={cn(
                                  'px-1.5 py-0.5 rounded text-[9px] truncate max-w-full transition',
                                  active
                                    ? 'bg-[var(--primary)]/30 text-[var(--primary)] border border-[var(--primary)]/40'
                                    : 'bg-black/20 border border-transparent hover:border-[var(--primary)]/30 hover:bg-[var(--primary)]/10'
                                )}
                                title={`${t.name} (${t.count})`}
                              >
                                {t.name} <span className="text-[var(--muted)] tabular-nums">{t.count}</span>
                              </button>
                            )
                          })}
                          {cat.tags.length > 60 && (
                            <span className="px-1 py-0.5 text-[9px] text-[var(--muted)] italic">
                              +{cat.tags.length - 60} more
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}

            {/* Randomized Quick Tags with visual effects - hidden when dropdown is open or category view. */}
            {randomQuickTags.length > 0 && !tagDropdownOpen && tagBarView === 'flat' && (
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
                  <div className="flex items-center gap-1">
                    {/* Re-analyze ALL items matching the current filters
                        (not just the page). Fetches the full ID list via
                        media.search with no pagination, then requeues
                        them through the AI tagger. */}
                    <button
                      onClick={async () => {
                        try {
                          const r = await window.api.media.search({
                            tags: activeTags,
                            type: typeFilter === 'all' ? undefined : typeFilter,
                            limit: 100000,
                          } as any)
                          const items = Array.isArray(r) ? r : (r?.items ?? [])
                          const ids = items.map((it: any) => it.id).filter(Boolean)
                          if (ids.length === 0) {
                            showToast?.('info', 'No items match the current filter')
                            return
                          }
                          const result = await window.api.ai.requeueSpecific?.(ids)
                          const n = result?.requeued ?? ids.length
                          showToast?.('success', `Queued ${n} items for AI re-analysis`)
                        } catch (err: any) {
                          showToast?.('error', err?.message ?? 'Re-analyze failed')
                        }
                      }}
                      className="text-[10px] text-[var(--primary)] hover:text-white hover:bg-[var(--primary)]/30 px-1.5 py-0.5 rounded transition-all inline-flex items-center gap-1"
                      title="Send every item matching this filter back through the AI tagger"
                    >
                      <RefreshCw size={9} />
                      Re-analyze
                    </button>
                    <button
                      onClick={() => setActiveTags([])}
                      className="text-[10px] text-red-400 hover:text-red-300 hover:bg-red-500/10 px-1.5 py-0.5 rounded transition-all"
                    >
                      Clear all
                    </button>
                  </div>
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
            "flex-1 min-w-0 overflow-auto transition-all duration-300 ease-in-out relative pb-safe",
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

          {/* Fuzzy-search "Did you mean?" hint — appears when the
              query had no exact substring matches and the backend
              fell back to Levenshtein closest-spelling match. */}
          {fuzzyHint && (
            <div className="mb-3 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
              <Search size={14} className="mt-0.5 flex-shrink-0 opacity-70" />
              <div className="flex-1">
                <span className="opacity-80">No exact matches for </span>
                <span className="font-mono text-amber-100">"{fuzzyHint.original}"</span>
                <span className="opacity-80"> — showing closest spelling: </span>
                <strong className="text-amber-50">{fuzzyHint.matched}</strong>
              </div>
              <button
                onClick={() => { setQuery(fuzzyHint.matched); setFuzzyHint(null) }}
                className="text-xs text-amber-100 hover:text-white underline underline-offset-2"
              >
                Use this
              </button>
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
            {/* Recently viewed — top 12 unique videos from watch history.
                Hides itself when there's no history yet so it doesn't take
                up space on a fresh install. Only shows on page 1 — paging
                deep into the library means the user is browsing, not
                resuming. */}
            {currentPage === 1 && (
              <RecentlyViewedStrip
                onPlay={(mediaId) => addFloatingPlayer(mediaId)}
                limit={12}
                className="mb-4"
              />
            )}
            {/* #213 — Personalized rail blending co-watch + tag-affinity */}
            {currentPage === 1 && (
              <RecommendationsRail
                onPlay={(mediaId) => addFloatingPlayer(mediaId)}
                limit={12}
              />
            )}
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
              {/* Empty state — loaded but zero results. Two cases:
                    - Library actually has zero media → suggest scan/import
                    - Search/filter returned no matches → suggest clearing */}
              {!isLoading && sortedMedia.length === 0 && (
                <div className="col-span-full row-span-full flex flex-col items-center justify-center gap-3 py-20 text-center">
                  <Library size={64} className="text-white/15" />
                  {(debouncedQuery || activeTags.length > 0 || colorFilterIds || typeFilter !== 'all') ? (
                    <>
                      <div className="text-lg font-medium text-white/70">No matches</div>
                      <div className="text-sm text-white/50 max-w-md">
                        Your filters returned 0 results. Try widening the search or clearing tags.
                      </div>
                      <button
                        onClick={() => { setQuery(''); setActiveTags([]); setColorFilterIds(null); setTypeFilter('all') }}
                        className="mt-2 px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-sm text-white/80 transition"
                      >
                        Clear all filters
                      </button>
                    </>
                  ) : (
                    <>
                      <div className="text-lg font-medium text-white/70">Your library is empty</div>
                      <div className="text-sm text-white/50 max-w-md">
                        Add a media folder in Settings → Library, then rescan to import.
                      </div>
                      <button
                        onClick={() => window.dispatchEvent(new CustomEvent('navigate-tab', { detail: 'settings' }))}
                        className="mt-2 px-5 py-2.5 rounded-lg bg-[var(--primary)] hover:bg-[var(--primary)]/80 text-white text-sm font-medium transition shadow-lg shadow-[var(--primary)]/30"
                      >
                        Open Settings
                      </button>
                    </>
                  )}
                </div>
              )}
              {/* When pageSize !== -1, the server already returned the windowed
                  page (limit + offset applied at media:search). Don't slice
                  again client-side — that would drop everything past index 60
                  on page 2+. When pageSize === -1, slice as before to honor
                  the legacy "Show All" client-side paging affordance. */}
              {(pageSize === -1
                ? sortedMedia.slice((currentPage - 1) * effectivePageSize, currentPage * effectivePageSize)
                : sortedMedia
              ).map((m, index) => {
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
                  {layout === 'list' ? (
                    <MediaListRow
                      media={m}
                      selected={selectionMode ? selectedIds.has(m.id) : false}
                      isPlaying={isPlaying}
                      selectionMode={selectionMode}
                      onClick={() => {
                        if (selectionMode) {
                          setSelectedIds(prev => {
                            const next = new Set(prev)
                            if (next.has(m.id)) next.delete(m.id)
                            else next.add(m.id)
                            return next
                          })
                        } else if (canOpen) {
                          addFloatingPlayer(m.id)
                        }
                      }}
                      onDoubleClick={() => {
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
                        } else if (canOpen) {
                          addFloatingPlayer(m.id)
                        }
                      }}
                    />
                  ) : (
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
                      denialUntil={denialUntilByMedia.get(m.id) ?? null}
                    />
                  )}
                </div>
              )
            })}
            </div>
          </div>

          {/* Bottom Pagination — sticky so it stays in view while
              scrolling a 200/page library, but only when there's more
              than one page to paginate. flex-wrap so the controls still
              fold gracefully on narrow widths. */}
          {showPagination && (
            <div className="sticky bottom-0 mt-6 -mx-2 px-2 py-3 z-10 flex justify-center items-center gap-2 flex-wrap bg-[var(--surface)]/85 backdrop-blur-md border-t border-[var(--border)]">
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

      {/* Bulk selection helper bar — only shows in selection mode with
          nothing yet selected. Gives the user fast ways to bootstrap a
          selection over a big library without click-tapping every tile. */}
      {selectionMode && selectedIds.size === 0 && (
        <div
          role="toolbar"
          aria-label="Bulk selection helpers"
          className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[90] flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-black/90 border border-white/10 backdrop-blur-sm shadow-2xl"
        >
          <span className="text-sm text-white/70 mr-1">Selection mode</span>
          <Btn
            tone="ghost"
            onClick={() => {
              // Select every media id currently rendered on this page.
              const pageSlice = pageSize === -1
                ? sortedMedia.slice((currentPage - 1) * effectivePageSize, currentPage * effectivePageSize)
                : sortedMedia
              setSelectedIds(new Set(pageSlice.map((m: any) => m.id)))
            }}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs"
            title="Select every tile on the current page"
          >
            <LayoutGrid size={12} />
            <span>Select page ({pageSize === -1 ? sortedMedia.length : Math.min(effectivePageSize, sortedMedia.length - (currentPage - 1) * effectivePageSize)})</span>
          </Btn>
          <Btn
            tone="ghost"
            onClick={async () => {
              try {
                setBulkActionLoading('selectAll')
                // Lightweight ids-only fetch — drops the full row
                // payload that a media.search(limit=-1) would carry.
                const r: any = await (window.api.media as any).ids({
                  q: debouncedQuery,
                  type: typeFilter,
                  tags: activeTags,
                  sortBy,
                  sortAscending,
                })
                const ids = Array.isArray(r?.ids) ? r.ids : []
                setSelectedIds(new Set(ids))
              } catch (err: any) {
                showToast('error', `Select all failed: ${err?.message ?? String(err)}`)
              } finally {
                setBulkActionLoading(null)
              }
            }}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs"
            title="Select every item matching current filters across all pages"
            disabled={bulkActionLoading === 'selectAll'}
          >
            {bulkActionLoading === 'selectAll' ? <RefreshCw size={12} className="animate-spin" /> : <Check size={12} />}
            <span>Select all matches ({sortedMedia.length.toLocaleString()})</span>
          </Btn>
          <Btn
            tone="ghost"
            onClick={() => { setSelectionMode(false); setSelectedIds(new Set()) }}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs"
          >
            <X size={12} />
            <span>Exit</span>
          </Btn>
        </div>
      )}

      {/* Bulk selection floating action bar */}
      {selectionMode && selectedIds.size > 0 && (
        <div
          role="toolbar"
          aria-label="Bulk selection actions"
          className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[90] flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-black/90 border border-[var(--primary)]/30 backdrop-blur-sm shadow-2xl"
        >
          <span className="text-sm text-white/80 mr-1" aria-live="polite">{selectedIds.size} selected</span>
          <Btn
            tone="ghost"
            onClick={() => setSelectedIds(new Set())}
            className="flex items-center gap-1.5 px-2 py-1.5 text-xs text-white/60 hover:text-white/90"
            title="Clear selection"
          >
            <X size={12} />
          </Btn>

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
              } catch (err: any) {
                console.error('[Library] Failed to rename:', err)
                showToast('error', `Bulk rename failed: ${err?.message ?? String(err)}`)
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
              } catch (err: any) {
                console.error('[Library] Failed to favorite:', err)
                showToast('error', `Bulk favorite failed: ${err?.message ?? String(err)}`)
              } finally {
                setBulkActionLoading(null)
              }
            }}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-pink-400 hover:text-pink-300"
          >
            {bulkActionLoading === 'favorite' ? <RefreshCw size={12} className="animate-spin" /> : <Heart size={12} />}
          </Btn>

          {/* Bulk Add Tag — opens an inline prompt that adds the typed
              tag to every selected media item via media:bulkAddTag. Tag
              is normalized through ensureTag so canonical-tag rewrites
              still apply. */}
          <Btn
            tone="ghost"
            title="Add a tag to all selected items"
            aria-label="Add a tag to all selected items"
            disabled={!!bulkActionLoading}
            onClick={async () => {
              const tagName = window.prompt('Add tag to all selected items:')
              if (!tagName || !tagName.trim()) return
              try {
                setBulkActionLoading('tag')
                const r = await (window.api.media as any).bulkAddTag(Array.from(selectedIds), tagName.trim())
                if (r?.ok) {
                  showToast('success', `Tagged ${r.processed}/${selectedIds.size} items with "${r.tag ?? tagName.trim()}"`)
                  window.dispatchEvent(new CustomEvent('vault:tagsChanged'))
                } else {
                  showToast('error', `Bulk tag failed: ${(r?.errors?.[0] ?? 'unknown error')}`)
                }
              } catch (err: any) {
                showToast('error', `Bulk tag failed: ${err?.message ?? String(err)}`)
              } finally {
                setBulkActionLoading(null)
              }
            }}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs"
          >
            {bulkActionLoading === 'tag' ? <RefreshCw size={12} className="animate-spin" /> : <Tag size={12} />}
            <span>Tag</span>
          </Btn>

          {/* Bulk Feature-less — toggles the suppression flag on every
              selected item so recommendation rails skip them. */}
          <Btn
            tone="ghost"
            title="Feature less / hide from recommendations"
            aria-label="Feature less for all selected items"
            disabled={!!bulkActionLoading}
            onClick={async () => {
              try {
                setBulkActionLoading('featureLess')
                // Single bulk write — value is true for all selected items
                // since toggle semantics get muddled with a mixed set.
                // (Users can always re-click to unflag a smaller subset.)
                const r = await (window.api.media as any).bulkFeatureLess(Array.from(selectedIds), true)
                if (r?.ok) {
                  showToast('success', `Feature-less applied to ${r.processed}/${selectedIds.size} items`)
                  window.dispatchEvent(new CustomEvent('vault:featureLessChanged'))
                } else {
                  showToast('error', `Bulk feature-less failed: ${(r?.errors?.[0] ?? 'unknown')}`)
                }
              } catch (err: any) {
                showToast('error', `Bulk feature-less failed: ${err?.message ?? String(err)}`)
              } finally {
                setBulkActionLoading(null)
              }
            }}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs"
          >
            {bulkActionLoading === 'featureLess' ? <RefreshCw size={12} className="animate-spin" /> : <EyeOff size={12} />}
          </Btn>

          {/* Bulk Deny — sets a denial cooldown on every selected item.
              Prompts for a duration (minutes); 0 / empty cancels. */}
          <Btn
            tone="ghost"
            title="Deny all selected items for N minutes"
            aria-label="Deny all selected items"
            disabled={!!bulkActionLoading}
            onClick={async () => {
              const input = window.prompt('Deny duration (e.g. 30m, 2h, 1d):', '60m')
              if (!input) return
              const m = /^\s*(\d+(?:\.\d+)?)\s*([mhdw]?)\s*$/i.exec(input)
              if (!m) { showToast('error', 'Could not parse duration'); return }
              const n = parseFloat(m[1])
              const unit = (m[2] ?? 'm').toLowerCase()
              const minutes = unit.startsWith('w') ? n * 7 * 1440
                : unit.startsWith('d') ? n * 1440
                : unit.startsWith('h') ? n * 60
                : n
              try {
                setBulkActionLoading('deny')
                const r = await (window.api.media as any).bulkDenial(Array.from(selectedIds), Math.round(minutes))
                if (r?.ok) {
                  showToast('success', `Denied ${r.processed}/${selectedIds.size} items for ${Math.round(minutes)} min`)
                } else {
                  showToast('error', `Bulk deny failed: ${(r?.errors?.[0] ?? 'unknown')}`)
                }
              } catch (err: any) {
                showToast('error', `Bulk deny failed: ${err?.message ?? String(err)}`)
              } finally {
                setBulkActionLoading(null)
              }
            }}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs"
          >
            {bulkActionLoading === 'deny' ? <RefreshCw size={12} className="animate-spin" /> : <Lock size={12} />}
          </Btn>

          {/* Bulk Delete — soft-delete via media:delete which now writes
              to media_trash for 30-day recoverable retention (#144). */}
          <Btn
            tone="ghost"
            title="Move all selected items to Trash (recoverable for 30 days)"
            aria-label="Delete all selected items"
            disabled={!!bulkActionLoading}
            onClick={async () => {
              if (!window.confirm(`Move ${selectedIds.size} item${selectedIds.size === 1 ? '' : 's'} to Trash?\n\nRecoverable for 30 days from Library Tools → Trash.`)) return
              try {
                setBulkActionLoading('delete')
                const r = await (window.api.media as any).bulkDelete(Array.from(selectedIds))
                if (r?.ok) {
                  showToast('success', `Moved ${r.processed}/${selectedIds.size} item${selectedIds.size === 1 ? '' : 's'} to Trash`)
                  setSelectedIds(new Set())
                  setSelectionMode(false)
                } else {
                  showToast('error', `Bulk delete failed: ${(r?.errors?.[0] ?? 'unknown')}`)
                }
              } catch (err: any) {
                showToast('error', `Bulk delete failed: ${err?.message ?? String(err)}`)
              } finally {
                setBulkActionLoading(null)
              }
            }}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-red-400 hover:text-red-300"
          >
            {bulkActionLoading === 'delete' ? <RefreshCw size={12} className="animate-spin" /> : <Trash2 size={12} />}
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

      {/* Persistent trash / recycle bin (30-day retention) */}
      <TrashPanel
        isOpen={showTrashPanel}
        onClose={() => setShowTrashPanel(false)}
        showToast={showToast}
      />

      {/* v2.7 lazy-loaded modals — each only mounts when its `show*` state
          flips true, and the bundle chunk only loads at that moment. */}
      <React.Suspense fallback={null}>
        {showExportPipeline && (
          <ExportPipelineModal
            open={showExportPipeline}
            onClose={() => setShowExportPipeline(false)}
          />
        )}
        {showStackMode && (
          <StackModeOverlay
            open={showStackMode}
            media={sortedMedia}
            initialIndex={Math.max(0, focusedIndex)}
            onClose={() => setShowStackMode(false)}
            onOpenMedia={(m) => {
              setShowStackMode(false)
              if (openIds.length < MAX_FLOATING_PLAYERS && !openIds.includes(m.id)) {
                addFloatingPlayer(m.id)
              }
            }}
          />
        )}
        {showDupTriage && (
          <DupTriageModal open={showDupTriage} onClose={() => setShowDupTriage(false)} />
        )}
        {showSubLibrary && (
          <SubLibraryModal
            open={showSubLibrary}
            onClose={() => setShowSubLibrary(false)}
            onOpenMedia={(m) => {
              setShowSubLibrary(false)
              if (openIds.length < MAX_FLOATING_PLAYERS && !openIds.includes(m.id)) {
                addFloatingPlayer(m.id)
              }
            }}
          />
        )}
        {showSpriteEditor && (
          <SpriteSheetChapterEditor open={showSpriteEditor} onClose={() => setShowSpriteEditor(false)} />
        )}
        {showServiceHealth && (
          <ServiceHealthDashboard open={showServiceHealth} onClose={() => setShowServiceHealth(false)} />
        )}
      </React.Suspense>

      {/* v2.7 #291 — Quick Look preview while Q is held on a focused tile (sync, lightweight) */}
      <QuickLookPreview open={quickLookOpen} media={quickLookMedia} />

      {/* Actionable Library Health dashboard with one-click fixes */}
      <LibraryHealthPanel
        isOpen={showLibraryHealth}
        onClose={() => setShowLibraryHealth(false)}
        onOpenDuplicates={() => { setShowLibraryHealth(false); setShowDuplicatesModal(true) }}
        onOpenAiTagger={() => {
          // Switch to the AI Tools page via the global nav event
          setShowLibraryHealth(false)
          window.dispatchEvent(new CustomEvent('navigate-tab', { detail: 'ai' }))
        }}
        showToast={showToast}
      />

      {/* Stills slideshow — uses the current sortedMedia filtered to
          image+gif. Honors current selection if any items are selected
          (so "select N → Slideshow" plays just those); otherwise plays
          whatever's currently visible in the grid. */}
      {/* Vault Wrapped — Spotify-style monthly recap */}
      <VaultWrappedPanel
        isOpen={showVaultWrapped}
        onClose={() => setShowVaultWrapped(false)}
        showToast={showToast}
      />

      {/* Personal analytics dashboard */}
      <AnalyticsDashboardPanel
        isOpen={showAnalytics}
        onClose={() => setShowAnalytics(false)}
        onPlay={(mediaId) => addFloatingPlayer(mediaId)}
        showToast={showToast}
      />

      {showSlideshow && (() => {
        const sourcePool = (selectionMode && selectedIds.size >= 1)
          ? sortedMedia.filter((m: MediaRow) => selectedIds.has(m.id))
          : sortedMedia
        const items = sourcePool
          .filter((m: MediaRow) => m.type === 'image' || m.type === 'gif')
          .map((m: MediaRow) => ({
            id: m.id,
            path: m.path,
            filename: m.filename ?? '',
            type: m.type as 'image' | 'gif',
            durationSec: m.durationSec ?? null,
          }))
        if (items.length === 0) {
          showToast('info', 'No images or GIFs to play. Filter to images or select a few first.')
          setShowSlideshow(false)
          return null
        }
        return (
          <div className="fixed inset-0 z-[200] bg-black" onClick={() => setShowSlideshow(false)}>
            <div className="absolute inset-0" onClick={(e) => e.stopPropagation()}>
              <SlideshowController
                items={items}
                onClose={() => setShowSlideshow(false)}
                className="h-full w-full"
              />
            </div>
          </div>
        )
      })()}

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

      {/* Library tool panels */}
      {showSceneDetector && activeToolMedia && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-sm" onClick={() => setShowSceneDetector(false)}>
          <div className="max-w-2xl w-full max-h-safe overflow-auto pb-safe" onClick={e => e.stopPropagation()}>
            <SceneDetector videoSrc={toFileUrl(activeToolMedia.path)} mediaId={activeToolMedia.id} duration={activeToolMedia.durationSec || 0} onSceneSelect={(time: number) => { showToast('info', `Scene at ${formatDuration(time)}`); setShowSceneDetector(false) }} className="m-4" />
          </div>
        </div>
      )}

      {showVideoChapters && activeToolMedia && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-sm" onClick={() => setShowVideoChapters(false)}>
          <div className="max-w-2xl w-full max-h-safe overflow-auto pb-safe" onClick={e => e.stopPropagation()}>
            <VideoChapters mediaId={activeToolMedia.id} duration={activeToolMedia.durationSec || 0} currentTime={0} onSeek={(time: number) => showToast('info', `Jump to ${formatDuration(time)}`)} className="m-4" />
          </div>
        </div>
      )}

      {showColorGrading && activeToolMedia && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-sm" onClick={() => setShowColorGrading(false)}>
          <div className="max-w-xl w-full max-h-safe overflow-auto pb-safe" onClick={e => e.stopPropagation()}>
            <ColorGrading settings={colorGradingStyle || { brightness: 100, contrast: 100, saturation: 100, hue: 0, temperature: 0, tint: 0, shadows: 0, highlights: 0, vibrance: 0 }} onChange={(s) => {
              setColorGradingStyle(s)
              // Persist per-media so re-opening the media gets the same grade.
              try { localStorage.setItem(`vault.effects.colorGrading.${activeToolMedia.id}`, JSON.stringify(s)) } catch { /* quota */ }
            }} className="m-4" />
          </div>
        </div>
      )}

      {showBookmarkManager && activeToolMedia && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-sm" onClick={() => setShowBookmarkManager(false)}>
          <div className="max-w-2xl w-full max-h-safe overflow-auto pb-safe" onClick={e => e.stopPropagation()}>
            <BookmarkManager mediaId={activeToolMedia.id} duration={activeToolMedia.durationSec || 0} currentTime={0} onSeek={(time) => showToast('info', `Seek to ${formatDuration(time)}`)} className="m-4" />
          </div>
        </div>
      )}

      {showSubtitleEditor && activeToolMedia && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-sm" onClick={() => setShowSubtitleEditor(false)}>
          <div className="max-w-3xl w-full max-h-safe overflow-auto pb-safe" onClick={e => e.stopPropagation()}>
            <SubtitleEditor currentTime={0} duration={activeToolMedia.durationSec || 0} subtitles={[]} onChange={async (subs) => {
              // Serialize to SRT and write a sidecar next to the media
              // file. Players that consume external subs (FloatingVideoPlayer
              // libass-wasm path) will pick this up automatically.
              const srt = subs.map((s, i) => {
                const fmt = (t: number) => {
                  const ms = Math.floor((t % 1) * 1000)
                  const total = Math.floor(t)
                  const h = String(Math.floor(total / 3600)).padStart(2, '0')
                  const m = String(Math.floor((total % 3600) / 60)).padStart(2, '0')
                  const s = String(total % 60).padStart(2, '0')
                  return `${h}:${m}:${s},${String(ms).padStart(3, '0')}`
                }
                return `${i + 1}\n${fmt(s.start)} --> ${fmt(s.end)}\n${s.text}\n`
              }).join('\n')
              const srtPath = activeToolMedia.path.replace(/\.[^./]+$/, '.srt')
              try {
                const res = await window.api.fs.writeText?.(srtPath, srt)
                if (res?.ok !== false) showToast('success', `Saved ${subs.length} subtitles to .srt`)
                else showToast('error', res?.error ?? 'Subtitle write failed')
              } catch (err: any) {
                showToast('error', err?.message ?? 'Subtitle write failed')
              }
            }} onSeek={(time: number) => {
              // Seek the active floating player if one is showing this media.
              window.dispatchEvent(new CustomEvent('vault:seekActivePlayer', { detail: { mediaId: activeToolMedia.id, time } }))
            }} className="m-4" />
          </div>
        </div>
      )}

      {showKeyframeExtractor && activeToolMedia && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-sm" onClick={() => setShowKeyframeExtractor(false)}>
          <div className="max-w-2xl w-full max-h-safe overflow-auto pb-safe" onClick={e => e.stopPropagation()}>
            <ServerKeyframeExtractor mediaPath={activeToolMedia.path} duration={activeToolMedia.durationSec || 0} onDone={(count) => { showToast('success', `Extracted ${count} keyframes`); setShowKeyframeExtractor(false) }} className="m-4" />
          </div>
        </div>
      )}

      {showVideoFilters && activeToolMedia && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-sm" onClick={() => setShowVideoFilters(false)}>
          <div className="max-w-xl w-full max-h-safe overflow-auto pb-safe" onClick={e => e.stopPropagation()}>
            <VideoFilters onFilterChange={(filter: string) => {
              setVideoFiltersStyle(filter)
              // Persist per-media so re-opening retains the filter.
              try { localStorage.setItem(`vault.effects.videoFilter.${activeToolMedia.id}`, filter) } catch { /* quota */ }
            }} currentFilter={videoFiltersStyle || 'none'} className="m-4" />
          </div>
        </div>
      )}

      {showSplitScreen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-sm" onClick={() => setShowSplitScreen(false)}>
          <div className="max-w-4xl w-full max-h-safe overflow-auto pb-safe" onClick={e => e.stopPropagation()}>
            {/* Compare Mode: when entered with multi-select active, the
                available list is the user's selection (so the comparison
                slots auto-populate from the picked clips). Otherwise
                fall back to the first 20 videos in the library. */}
            <SplitScreen
              availableMedia={(() => {
                const selectedVideos = selectionMode && selectedIds.size >= 2
                  ? media.filter((m: MediaRow) => m.type === 'video' && selectedIds.has(m.id))
                  : media.filter((m: MediaRow) => m.type === 'video').slice(0, 20)
                return selectedVideos.map((m: MediaRow) => ({
                  id: m.id, path: m.path, thumbnail: m.thumbPath || undefined, title: m.filename || ''
                }))
              })()}
              className="m-4"
            />
          </div>
        </div>
      )}

      {showSmartCrop && activeToolMedia && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-sm" onClick={() => setShowSmartCrop(false)}>
          <div className="max-w-2xl w-full max-h-safe overflow-auto pb-safe" onClick={e => e.stopPropagation()}>
            <SmartCrop imageSrc={toFileUrl(activeToolMedia.thumbPath || activeToolMedia.path)} onCrop={(region, aspect) => {
              // Persist crop preference per-media so the player can apply
              // it the next time this media is opened.
              try { localStorage.setItem(`vault.effects.crop.${activeToolMedia.id}`, JSON.stringify({ region, aspect })) } catch { /* quota */ }
              showToast('success', `Crop saved: ${Math.round(region.width)}×${Math.round(region.height)} (${aspect})`)
              setShowSmartCrop(false)
            }} className="m-4" />
          </div>
        </div>
      )}

      {showMetadataEditor && activeToolMedia && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-sm" onClick={() => setShowMetadataEditor(false)}>
          <div className="max-w-2xl w-full max-h-safe overflow-auto pb-safe" onClick={e => e.stopPropagation()}>
            <MetadataEditor mediaId={activeToolMedia.id} onSave={() => { showToast('success', 'Metadata saved'); setShowMetadataEditor(false) }} onClose={() => setShowMetadataEditor(false)} className="m-4" />
          </div>
        </div>
      )}

      {showPlaylistSorter && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-sm" onClick={() => setShowPlaylistSorter(false)}>
          <div className="max-w-2xl w-full max-h-safe overflow-auto pb-safe" onClick={e => e.stopPropagation()}>
            <PlaylistSorter items={media.slice(0, 20).map((m: MediaRow, i: number) => ({ id: m.id, title: m.filename || '', duration: m.durationSec || undefined, index: i }))} onSort={(sortedIds: string[]) => {
              // The PlaylistSorter dialog operates on a slice of the
              // current Library view, not a saved playlist. To persist
              // a reorder you'd open a specific playlist from the
              // Playlists page first; this dialog is preview-only.
              showToast('info', `Preview sort of ${sortedIds.length} items — open a playlist from the Playlists page to persist a reorder`)
              setShowPlaylistSorter(false)
            }} className="m-4" />
          </div>
        </div>
      )}

      {showWatchProgress && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-sm" onClick={() => setShowWatchProgress(false)}>
          <div className="max-w-2xl w-full max-h-safe overflow-auto pb-safe" onClick={e => e.stopPropagation()}>
            <WatchProgress onResume={(id: string) => { addFloatingPlayer(id); setShowWatchProgress(false) }} onRemove={async (id: string) => {
              try {
                const res = await window.api.watchHistory.removeEntry(id)
                if (res.ok) showToast('info', 'Removed from progress')
                else showToast('error', res.error ?? 'Failed to remove')
              } catch (err: any) {
                showToast('error', err?.message ?? 'Failed to remove')
              }
            }} className="m-4" />
          </div>
        </div>
      )}

      {showMediaExporter && activeToolMedia && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-sm" onClick={() => setShowMediaExporter(false)}>
          <div className="max-w-xl w-full max-h-safe overflow-auto pb-safe" onClick={e => e.stopPropagation()}>
            <MediaExporter mediaType={activeToolMedia.type === 'video' ? 'video' : 'image'} mediaPath={activeToolMedia.path} duration={activeToolMedia.durationSec || undefined} onExport={async (settings, outputPath) => {
              showToast('info', `Exporting as ${settings.format}…`)
              try {
                const res = await window.api.mediaTools.export({
                  srcPath: activeToolMedia.path,
                  dstPath: outputPath,
                  options: { format: settings.format, quality: settings.quality, resolution: settings.resolution, fps: settings.fps, startSec: settings.startTime, endSec: settings.endTime, removeAudio: settings.removeAudio },
                })
                if (res.ok) showToast('success', `Exported to ${outputPath}`)
                else showToast('error', res.error ?? 'Export failed')
              } catch (err: any) {
                showToast('error', err?.message ?? 'Export failed')
              }
              setShowMediaExporter(false)
            }} className="m-4" />
          </div>
        </div>
      )}

      {showAITagger && activeToolMedia && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-sm" onClick={() => setShowAITagger(false)}>
          <div className="max-w-xl w-full max-h-safe overflow-auto pb-safe" onClick={e => e.stopPropagation()}>
            <AITagger mediaId={activeToolMedia.id} mediaSrc={toFileUrl(activeToolMedia.path)} mediaType={activeToolMedia.type === 'video' ? 'video' : activeToolMedia.type === 'gif' ? 'gif' : 'image'} onApplyTags={async (tags) => {
              showToast('info', `Adding ${tags.length} tags…`)
              let added = 0, failed = 0
              for (const tag of tags) {
                try {
                  await window.api.tags.addToMedia(activeToolMedia.id, tag)
                  added++
                } catch { failed++ }
              }
              if (failed > 0) showToast('error', `Added ${added}, ${failed} failed`)
              else showToast('success', `Applied ${added} tag${added === 1 ? '' : 's'}`)
              setShowAITagger(false)
            }} className="m-4" />
          </div>
        </div>
      )}

      {showThumbnailSelector && activeToolMedia && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-sm" onClick={() => setShowThumbnailSelector(false)}>
          <div className="max-w-2xl w-full max-h-safe overflow-auto pb-safe" onClick={e => e.stopPropagation()}>
            <ThumbnailSelector duration={activeToolMedia.durationSec || 0} currentThumbnail={activeToolMedia.thumbPath ? toFileUrl(activeToolMedia.thumbPath) : undefined} onSelect={async (thumb: string) => {
              try {
                const res = await window.api.thumbs.setCustom(activeToolMedia.id, thumb)
                if (res.ok) showToast('success', 'Thumbnail updated')
                else showToast('error', res.error ?? 'Failed to set thumbnail')
              } catch (err: any) {
                showToast('error', err?.message ?? 'Failed to set thumbnail')
              }
              setShowThumbnailSelector(false)
            }} className="m-4" />
          </div>
        </div>
      )}

      {showRelatedMedia && activeToolMedia && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-sm" onClick={() => setShowRelatedMedia(false)}>
          <div className="max-w-2xl w-full max-h-safe overflow-auto pb-safe" onClick={e => e.stopPropagation()}>
            <RelatedMedia currentMediaId={activeToolMedia.id} onPlay={(id: string) => { addFloatingPlayer(id); setShowRelatedMedia(false) }} maxItems={12} className="m-4" />
          </div>
        </div>
      )}

      {showMediaTimeline && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-sm" onClick={() => setShowMediaTimeline(false)}>
          <div className="max-w-4xl w-full max-h-safe overflow-auto pb-safe" onClick={e => e.stopPropagation()}>
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
            <ViewModeSelector mode="grid" config={{ columns: 4, showInfo: true, showThumbnails: true, cardSize: 'medium', aspectRatio: '16:9' }} onChange={(mode, _config) => {
              const next = mode === 'masonry' ? 'wall' : 'grid'
              setLayout(next)
              try { localStorage.setItem('vault.library.layout', next) } catch { /* quota */ }
              showToast('success', `View: ${mode}`)
              setShowViewModeSelector(false)
            }} className="m-4" />
          </div>
        </div>
      )}

      {showAutoPlaylist && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-sm" onClick={() => setShowAutoPlaylist(false)}>
          <div className="max-w-2xl w-full max-h-safe overflow-auto pb-safe" onClick={e => e.stopPropagation()}>
            <AutoPlaylist onPlay={(items) => { if (items.length > 0) addFloatingPlayer(items[0].id); showToast('info', `Playing ${items.length} items`); setShowAutoPlaylist(false) }} onSave={async (_type, name, items) => {
              try {
                const created = await window.api.playlists.create(name)
                const playlistId = (created as { id?: string })?.id
                if (!playlistId) {
                  showToast('error', 'Failed to create playlist')
                  return
                }
                if (items.length > 0) {
                  await window.api.playlists.addItems(playlistId, items.map((i) => i.id))
                }
                showToast('success', `Saved "${name}" (${items.length} items)`)
              } catch (err: any) {
                showToast('error', err?.message ?? 'Save failed')
              }
              setShowAutoPlaylist(false)
            }} className="m-4" />
          </div>
        </div>
      )}

      {showMediaMerger && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-sm" onClick={() => setShowMediaMerger(false)}>
          <div className="max-w-3xl w-full max-h-safe overflow-auto pb-safe" onClick={e => e.stopPropagation()}>
            <MediaMerger onMerge={async (items, settings) => {
              if (items.length < 2) {
                showToast('error', 'Need at least 2 videos to merge')
                return
              }
              const dst = await window.api.fs.saveFile({ title: 'Save merged video', defaultPath: `merged.${settings.outputFormat ?? 'mp4'}`, filters: [{ name: 'Video', extensions: [settings.outputFormat ?? 'mp4'] }] })
              if (!dst) return
              showToast('info', `Merging ${items.length} videos…`)
              try {
                const res = await window.api.mediaTools.merge({
                  srcPaths: items.map((i: { path: string }) => i.path),
                  dstPath: dst,
                  options: { outputFormat: (settings.outputFormat as 'mp4' | 'webm' | 'mkv' | undefined) ?? 'mp4' },
                })
                if (res.ok) showToast('success', `Merged to ${dst}`)
                else showToast('error', res.error ?? 'Merge failed')
              } catch (err: any) {
                showToast('error', err?.message ?? 'Merge failed')
              }
              setShowMediaMerger(false)
            }} onAddMedia={async () => { const videos = media.filter((m: MediaRow) => m.type === 'video'); if (videos.length === 0) return null; const m = videos[Math.floor(Math.random() * videos.length)]; return { id: m.id, path: m.path, title: m.filename || '', duration: m.durationSec || 0, thumbnail: m.thumbPath || undefined } }} className="m-4" />
          </div>
        </div>
      )}

      {showMediaRotator && activeToolMedia && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-sm" onClick={() => setShowMediaRotator(false)}>
          <div className="max-w-xl w-full max-h-safe overflow-auto pb-safe" onClick={e => e.stopPropagation()}>
            <MediaRotator src={toFileUrl(activeToolMedia.path)} type={activeToolMedia.type === 'video' ? 'video' : 'image'} onApply={async (transform) => {
              const ext = activeToolMedia.path.split('.').pop() || 'mp4'
              const dst = await window.api.fs.saveFile({ title: 'Save rotated media', defaultPath: `rotated.${ext}`, filters: [{ name: 'Media', extensions: [ext] }] })
              if (!dst) return
              showToast('info', `Applying ${transform.rotation}° rotation…`)
              try {
                const allowedRotation: 0 | 90 | 180 | 270 = (transform.rotation === 90 || transform.rotation === 180 || transform.rotation === 270) ? transform.rotation : 0
                const res = await window.api.mediaTools.rotate({
                  srcPath: activeToolMedia.path,
                  dstPath: dst,
                  options: { rotation: allowedRotation, flipH: transform.flipH, flipV: transform.flipV },
                })
                if (res.ok) showToast('success', `Saved to ${dst}`)
                else showToast('error', res.error ?? 'Rotate failed')
              } catch (err: any) {
                showToast('error', err?.message ?? 'Rotate failed')
              }
              setShowMediaRotator(false)
            }} className="m-4" />
          </div>
        </div>
      )}

      {showWatermarkAdder && activeToolMedia && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-sm" onClick={() => setShowWatermarkAdder(false)}>
          <div className="max-w-xl w-full max-h-safe overflow-auto pb-safe" onClick={e => e.stopPropagation()}>
            <WatermarkAdder mediaSrc={toFileUrl(activeToolMedia.path)} mediaType={activeToolMedia.type === 'video' ? 'video' : 'image'} onApply={async (watermark) => {
              const ext = activeToolMedia.path.split('.').pop() || 'mp4'
              const dst = await window.api.fs.saveFile({ title: 'Save watermarked media', defaultPath: `watermarked.${ext}`, filters: [{ name: 'Media', extensions: [ext] }] })
              if (!dst) return
              // Map x/y % → corner enum. Centered ranges fall through to center.
              const xPos = watermark.position.x < 33 ? 'l' : watermark.position.x > 66 ? 'r' : 'c'
              const yPos = watermark.position.y < 33 ? 't' : watermark.position.y > 66 ? 'b' : 'c'
              const position: 'tl' | 'tr' | 'bl' | 'br' | 'center' =
                xPos === 'c' && yPos === 'c' ? 'center'
                : yPos === 't' ? (xPos === 'l' ? 'tl' : 'tr')
                : (xPos === 'l' ? 'bl' : 'br')
              showToast('info', 'Applying watermark…')
              try {
                // Image-watermark mode would need a temp-file roundtrip
                // (the picker stores image as data URL); for now we
                // pass the content as text. Image mode → falls through
                // to text-of-data-URL which is harmless and only
                // text-mode is currently surfaced in practice.
                const res = await window.api.mediaTools.watermark({
                  srcPath: activeToolMedia.path,
                  dstPath: dst,
                  options: {
                    text: watermark.type === 'text' ? watermark.content : 'Watermark',
                    position,
                    opacity: watermark.opacity,
                    fontSize: watermark.size,
                    color: watermark.color,
                  },
                })
                if (res.ok) showToast('success', `Saved to ${dst}`)
                else showToast('error', res.error ?? 'Watermark failed')
              } catch (err: any) {
                showToast('error', err?.message ?? 'Watermark failed')
              }
              setShowWatermarkAdder(false)
            }} className="m-4" />
          </div>
        </div>
      )}

      {showMediaQueue && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-sm" onClick={() => setShowMediaQueue(false)}>
          <div className="max-w-md w-full max-h-safe overflow-auto pb-safe" onClick={e => e.stopPropagation()}>
            <MediaQueue onPlay={(i: number) => { const videos = media.filter((m: MediaRow) => m.type === 'video'); if (videos[i]) addFloatingPlayer(videos[i].id); setShowMediaQueue(false) }} className="m-4" />
          </div>
        </div>
      )}
    </div>
  )
}

const MediaTile = memo(function MediaTile(props: {
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
  denialUntil?: number | null
}) {
  const { media, compact, layout, disabled, showStats, stats, previewMuted = true, liked, onToggleLike, denialUntil } = props
  // #209 — Live-subscribed card-layout prefs. Hooked here so toggling
  // any field in Settings → Appearance flips the visible affordances
  // without a tile remount.
  const { fields: cardFields } = useCardLayoutPrefs()
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

  // #214 — Sprite-sheet hover scrub. Lazy: only fires on first hover
  // so we don't pre-fetch sprite sheets for every visible tile. The
  // hook handles ffmpeg-generation on demand if the sheet doesn't
  // exist yet.
  const sprite = useSpriteHoverScrub({ mediaId: media.id, enabled: isVideo })

  const handleMouseEnter = useCallback(() => {
    setIsHovered(true)
    if (isVideo && !disabled) {
      // Kick off sprite-sheet lazy-load on first hover.
      try { sprite.ensure() } catch { /* noop */ }
    }
    if (isVideo && videoUrl && !disabled) {
      startPreview(videoUrl, media.durationSec ?? undefined)
    }
  }, [isVideo, videoUrl, disabled, startPreview, media.durationSec, sprite])

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
            {/* #214 — Sprite-sheet hover scrub overlay. Shows while
                hovering, before the video preview's 2-second delay
                kicks in. Once the actual video preview starts playing
                it fades out so the user sees real motion. */}
            {isVideo && sprite.ready && isHovered && !isPreviewPlaying && (
              <div
                ref={sprite.containerRef}
                className={cn(
                  'absolute inset-0 w-full h-full transition-opacity duration-200',
                  layout === 'mosaic' || layout === 'wall' ? '' : '',
                )}
                style={sprite.style}
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

        {/* Denial badge — shown when the media has an active denial
            cooldown. Positioned below the type badge with a hot red
            tone + lock icon. Stays visible even when the rest of the
            HUD is hidden so the user can't miss it. */}
        {denialUntil != null && denialUntil > Date.now() && (
          <div
            className={cn(
              'absolute top-8 right-1.5 flex items-center gap-1 px-1.5 py-0.5 rounded backdrop-blur-sm',
              'bg-red-600/80 border border-red-300/40 text-white shadow-lg shadow-red-900/40 tabular-nums',
              compact ? 'text-[8px]' : 'text-[10px]'
            )}
            title={`Denied until ${new Date(denialUntil).toLocaleString()}`}
          >
            <Lock size={compact ? 8 : 10} />
            {(() => {
              const remMs = denialUntil - Date.now()
              const mins = Math.ceil(remMs / 60000)
              if (mins < 60) return `${mins}m`
              const hrs = Math.ceil(mins / 60)
              if (hrs < 24) return `${hrs}h`
              return `${Math.ceil(hrs / 24)}d`
            })()}
          </div>
        )}

        {/* Duration badge for videos with glow effect - hidden during preview.
            #209 — gated on cardFields.duration so users can hide it. */}
        {media.type === 'video' && media.durationSec && cardFields.has('duration') ? (
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
              {/* #209 — resolution + fileSize gated on cardFields prefs */}
              {media.width && media.height && cardFields.has('resolution') && (
                <span className={cn('transition-opacity', isHovered ? 'opacity-100' : 'opacity-0')}>
                  {media.width}×{media.height}
                </span>
              )}
              {typeof media.size === 'number' && cardFields.has('fileSize') && <span>{formatBytes(media.size)}</span>}
              {/* #209 — rating badge (compact star + number) */}
              {typeof stats?.rating === 'number' && stats.rating > 0 && cardFields.has('rating') && (
                <span className="text-amber-400 font-semibold tabular-nums">★ {stats.rating.toFixed(1)}</span>
              )}
              {/* #209 — added-date as a compact "Mar 5" pill */}
              {typeof media.addedAt === 'number' && cardFields.has('addedDate') && (
                <span className="text-[var(--muted)] tabular-nums">
                  {new Date(media.addedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                </span>
              )}
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
}, (prev, next) => {
  // Custom equality check — MediaTile is rendered ~60×/page and the
  // parent passes brand-new arrow callbacks every render. Default
  // shallow equality treats those as "changed" and re-renders every
  // tile on every parent state update (e.g. keystroke in search bar).
  // Skip the callback props — they're closures, identity-unstable by
  // design — and compare only the data props that actually drive paint.
  if (prev.media !== next.media) return false
  if (prev.selected !== next.selected) return false
  if (prev.compact !== next.compact) return false
  if (prev.layout !== next.layout) return false
  if (prev.disabled !== next.disabled) return false
  if (prev.showStats !== next.showStats) return false
  if (prev.previewMuted !== next.previewMuted) return false
  if (prev.liked !== next.liked) return false
  if (prev.selectionMode !== next.selectionMode) return false
  if (prev.denialUntil !== next.denialUntil) return false
  // stats is a plain object — compare the fields we actually render.
  const ps = prev.stats, ns = next.stats
  if (!!ps !== !!ns) return false
  if (ps && ns && (ps.rating !== ns.rating || ps.viewCount !== ns.viewCount || ps.oCount !== ns.oCount)) return false
  return true
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
