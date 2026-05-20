// File: src/renderer/pages/GoonWallPage.tsx
//
// Multi-tile auto-shuffling video wall ("GoonWall"). Owns its own
// playback slot manager (GOON_MAX_VIDEOS) at module scope so all
// active tiles share a fixed concurrency cap. Extracted from App.tsx
// as part of #48.

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  Eye,
  EyeOff,
  Film,
  LayoutGrid,
  Maximize2,
  Minimize2,
  RefreshCw,
  Shuffle,
  Sparkles,
  Timer,
  Volume2,
  VolumeX,
  Zap,
} from 'lucide-react'
import type { MediaRow, VaultSettings } from '../types'
import { toFileUrlCached } from '../hooks/usePerformance'
import { cn } from '../utils/cn'
import { shuffleTake } from '../utils/shuffle'
import { Btn } from '../components/ui'
import { CumCountdownOverlay } from '../components/VisualStimulants'
import { videoPool } from '../hooks/useVideoCleanup'





type GoonWallLayout = 'grid' | 'mosaic'

export function GoonWallPage(props: {
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
  const [preloadCount, setPreloadCount] = useState(50) // Configurable number of videos to preload
  const [backgroundPreloading, setBackgroundPreloading] = useState(false) // Continue preloading after starting
  const preloadedUrlsRef = useRef<Map<string, string>>(new Map()) // Cache preloaded URLs
  const preloadAbortRef = useRef(false) // For cancelling preload
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
  // Non-blocking implementation that works in background
  const preloadVideos = useCallback(async (videosToPreload: MediaRow[], continueInBackground = false) => {
    preloadAbortRef.current = false
    setPreloading(true)
    setPreloadProgress(0)

    // Limit to preloadCount videos
    const videosToLoad = videosToPreload.slice(0, preloadCount)
    setPreloadTotal(videosToLoad.length)

    const batchSize = 3 // Smaller batches for smoother UI
    let loaded = 0

    // Use requestIdleCallback-like approach to avoid blocking UI
    const loadBatch = async (startIndex: number): Promise<void> => {
      if (preloadAbortRef.current) return

      const batch = videosToLoad.slice(startIndex, startIndex + batchSize)
      if (batch.length === 0) {
        // Done loading
        setPreloading(false)
        setBackgroundPreloading(false)
        if (!continueInBackground) {
          setShowPreloadOption(false)
        }
        return
      }

      await Promise.all(
        batch.map(async (video) => {
          if (preloadAbortRef.current) return
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

      // Yield to UI before next batch (prevents freezing)
      await new Promise(resolve => setTimeout(resolve, 10))

      // Continue with next batch
      await loadBatch(startIndex + batchSize)
    }

    await loadBatch(0)
  }, [preloadCount, tileCount])

  // Start preloading and go to wall immediately (background preload)
  const startWithBackgroundPreload = useCallback(() => {
    setBackgroundPreloading(true)
    setShowPreloadOption(false)
    // Start preloading in background
    preloadVideos(tiles, true)
  }, [tiles, preloadVideos])

  // Start wall without preloading
  const startWithoutPreload = useCallback(() => {
    preloadAbortRef.current = true
    setShowPreloadOption(false)
    setPreloading(false)
    setBackgroundPreloading(false)
  }, [])

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
            <Film size={48} className="mx-auto mb-4 text-[var(--primary)]" />
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
                <button
                  onClick={startWithBackgroundPreload}
                  className="mt-4 px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-sm transition"
                >
                  Start Now (continue in background)
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Preload count slider — cap lifted from 200 → videos.length
                    so the user can actually preload ALL selected videos
                    instead of a fraction. "All" shortcut sets the count
                    to the full collection in one click. */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-white/60">Videos to preload:</span>
                    <span className="font-medium tabular-nums">
                      {preloadCount} <span className="text-white/40">/ {videos.length}</span>
                    </span>
                  </div>
                  <input
                    type="range"
                    min="10"
                    max={Math.max(10, videos.length)}
                    value={Math.min(preloadCount, videos.length)}
                    onChange={(e) => setPreloadCount(Number(e.target.value))}
                    className="w-64 h-2 bg-white/10 rounded-full appearance-none cursor-pointer
                      [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4
                      [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-gradient-to-r
                      [&::-webkit-slider-thumb]:from-pink-500 [&::-webkit-slider-thumb]:to-purple-500"
                  />
                  <div className="flex justify-between text-xs text-white/40 w-64 mx-auto">
                    <span>10</span>
                    <button
                      onClick={() => setPreloadCount(videos.length)}
                      className="text-pink-300 hover:text-pink-200 underline-offset-2 hover:underline transition"
                      title={`Preload all ${videos.length} selected videos`}
                    >
                      All ({videos.length})
                    </button>
                  </div>
                </div>

                <div className="space-y-3">
                  <button
                    onClick={() => preloadVideos(tiles)}
                    className="w-full px-6 py-3 bg-gradient-to-r from-pink-600 to-purple-600 hover:from-pink-500 hover:to-purple-500 rounded-xl font-medium transition"
                  >
                    Preload {preloadCount} {preloadCount === videos.length ? '(all)' : `of ${videos.length}`} Videos First
                    <div className="text-xs text-white/60 mt-1">Wait for smooth playback</div>
                  </button>
                  <button
                    onClick={startWithBackgroundPreload}
                    className="w-full px-6 py-3 bg-purple-600/50 hover:bg-purple-500/50 rounded-xl font-medium transition"
                  >
                    Start + Preload in Background
                    <div className="text-xs text-white/60 mt-1">Begin immediately, loads continue</div>
                  </button>
                  <button
                    onClick={startWithoutPreload}
                    className="w-full px-6 py-3 bg-white/10 hover:bg-white/20 rounded-xl font-medium transition"
                  >
                    Start Immediately
                    <div className="text-xs text-white/60 mt-1">No preloading</div>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Error state */}
      {error && !loading && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black gap-3">
          <AlertTriangle size={64} className="text-amber-400/70" />
          <div className="text-lg font-medium text-red-400">Couldn't load wall</div>
          <div className="text-sm text-white/60 max-w-md text-center">{error}</div>
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
              key={`goon-tile-${idx}`}
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

          {/* Background Preload Progress — prominent banner so it's obvious how
              many of the selected videos have loaded. Auto-hides when complete. */}
          {backgroundPreloading && preloadProgress < preloadTotal && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 bg-black/85 backdrop-blur-md rounded-2xl px-5 py-3 flex items-center gap-4 shadow-2xl border border-white/10 min-w-[360px]">
              <RefreshCw size={16} className="text-pink-400 animate-spin shrink-0" />
              <div className="flex-1 flex flex-col gap-1.5">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-white/80 font-medium">
                    Preloading {preloadTotal} videos
                  </span>
                  <span className="text-white/60 tabular-nums">
                    {preloadProgress} / {preloadTotal} ({Math.round((preloadProgress / Math.max(preloadTotal, 1)) * 100)}%)
                  </span>
                </div>
                <div className="relative w-full h-2.5 bg-white/15 rounded-full overflow-hidden">
                  <div
                    className="absolute inset-y-0 left-0 bg-gradient-to-r from-pink-500 via-fuchsia-500 to-purple-500 transition-all duration-300 rounded-full"
                    style={{ width: `${(preloadProgress / Math.max(preloadTotal, 1)) * 100}%` }}
                  />
                  {/* Shimmer pass over the filled section */}
                  <div
                    className="absolute inset-y-0 w-1/3 -translate-x-full animate-[shimmer_2s_infinite] bg-gradient-to-r from-transparent via-white/30 to-transparent"
                    style={{ animation: 'shimmer 2s linear infinite' }}
                  />
                </div>
              </div>
            </div>
          )}

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
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-8 text-center">
          <Film size={64} className="text-white/20" />
          <div className="text-lg font-medium text-white/70">No videos to wall yet</div>
          <div className="text-sm text-white/50 max-w-md">
            Add videos to your Library and they'll appear here for the multi-tile shuffle.
          </div>
          <button
            onClick={() => window.dispatchEvent(new CustomEvent('navigate-tab', { detail: 'library' }))}
            className="mt-3 flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[var(--primary)] hover:bg-[var(--primary)]/80 text-white text-sm font-medium transition shadow-lg shadow-[var(--primary)]/30"
          >
            Open Library
          </button>
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
  // Conservative limits to prevent browser resource conflicts
  if (tileCount <= 4) return tileCount
  if (tileCount <= 6) return 4
  if (tileCount <= 9) return 5
  if (tileCount <= 16) return 6
  if (tileCount <= 25) return 8
  return 10 // Keep some tiles as thumbnails for stability
}
let GOON_MAX_VIDEOS = 8 // Default, updated dynamically
const goonVideoQueue: Array<{ start: () => void; id: string; priority: number }> = []

// Reset all goon slots - call when leaving GoonWall
export function resetGoonSlots(): void {
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

const GoonTile = memo(function GoonTile(props: {
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

  // Store onShuffle in ref to avoid triggering effect re-runs when callback changes
  const onShuffleRef = useRef(onShuffle)
  useEffect(() => { onShuffleRef.current = onShuffle })

  // Right-click to skip to next video
  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    onShuffleRef.current()
  }, [])

  // Auto-shuffle timer - each tile has a randomized interval
  // shuffleInterval of 0 means disabled (no auto-shuffle)
  useEffect(() => {
    if (!ready || isFocused || shuffleInterval === 0) return

    // Randomize the shuffle interval per tile (shuffleInterval +/- 15 seconds)
    const randomizedInterval = (shuffleInterval + (Math.random() * 30 - 15)) * 1000

    autoShuffleRef.current = setTimeout(() => {
      onShuffleRef.current()
    }, randomizedInterval)

    return () => {
      if (autoShuffleRef.current) {
        clearTimeout(autoShuffleRef.current)
      }
    }
  }, [ready, isFocused, shuffleInterval, media.id])

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
            if (alive) onShuffleRef.current()
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
          if (alive) onShuffleRef.current()
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
  }, [media.id, media.path, tileCount, index, preloadedUrl])

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

  // Playback recovery - gently resume videos that were paused by the browser
  // Only recover when visibility changes or on user interaction, not continuously
  const lastPlayAttemptRef = useRef(0)

  // Resume playback when visibility changes (user tabs back in)
  useEffect(() => {
    if (!hasSlot || !url || !ready) return

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && videoRef.current?.paused) {
        // Only attempt if we haven't tried recently (prevents rapid retries)
        const now = Date.now()
        if (now - lastPlayAttemptRef.current > 1000) {
          lastPlayAttemptRef.current = now
          videoRef.current?.play().catch(() => {})
        }
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [hasSlot, url, ready])

  // Resume on user interaction with the tile (click already handled, add mouseenter)
  const handleMouseEnter = useCallback(() => {
    if (hasSlot && videoRef.current?.paused && ready) {
      const now = Date.now()
      if (now - lastPlayAttemptRef.current > 500) {
        lastPlayAttemptRef.current = now
        videoRef.current?.play().catch(() => {})
      }
    }
  }, [hasSlot, ready])

  // Poster thumbnail URL
  const [poster, setPoster] = useState('')
  useEffect(() => {
    if (media.thumbPath) {
      toFileUrlCached(media.thumbPath).then(u => setPoster(u)).catch((err: unknown) => console.warn('[GoonTile] Failed to load poster:', err))
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
      onMouseEnter={handleMouseEnter}
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
