// File: src/renderer/pages/FeedPage.tsx
//
// TikTok-style vertical-swipe video feed. Extracted from App.tsx as
// part of #48. The page (FeedPage) owns the queue / sort / filter
// state; each clip is rendered by the memoised FeedItem child below.

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  Bookmark,
  ChevronDown,
  ChevronUp,
  Clock,
  Eye,
  EyeOff,
  Heart,
  Loader2,
  Maximize2,
  Plus,
  RefreshCw,
  Repeat,
  Settings,
  Shuffle,
  Sparkles,
  Tag,
  Volume2,
  VolumeX,
} from 'lucide-react'
import type { MediaRow, VaultSettings } from '../types'
import { useToast } from '../contexts'
import { toFileUrlCached } from '../hooks/usePerformance'
import { formatDuration } from '../utils/formatters'
import { cn } from '../utils/cn'
import { AddToPlaylistPopup } from '../components/PlaylistPickers'

type FeedSortMode = 'random' | 'liked' | 'newest' | 'views'

export function FeedPage() {
  const { showToast } = useToast()
  const [videos, setVideos] = useState<MediaRow[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [loading, setLoading] = useState(true)
  const [isMuted, setIsMuted] = useState(false)
  const [showHud, setShowHud] = useState(true)
  const [showTagPanel, setShowTagPanel] = useState(false)
  const [allTags, setAllTags] = useState<Array<{ id: string; name: string; videoCount: number }>>([])
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [recommendedTags, setRecommendedTags] = useState<string[]>([])
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set())
  const [sortMode, setSortMode] = useState<FeedSortMode>('random')
  const [infiniteMode, setInfiniteMode] = useState(false)
  const [hideUI, setHideUI] = useState(false)
  const [edgeRevealMode, setEdgeRevealMode] = useState(false)
  const [edgeActive, setEdgeActive] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [playbackSpeed, setPlaybackSpeed] = useState(1)
  const [feedResolution, setFeedResolution] = useState<'original' | '720p' | '480p' | '360p'>(() => {
    const stored = localStorage.getItem('vault-feed-resolution')
    if (stored === '720p' || stored === '480p' || stored === '360p') return stored
    return 'original'
  })
  const containerRef = useRef<HTMLDivElement>(null)
  const videoRefs = useRef<Map<number, HTMLVideoElement>>(new Map())
  const hudTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const [preloadedUrls, setPreloadedUrls] = useState<Record<string, string>>({})
  const [, setContainerSize] = useState({ width: 0, height: 0 })
  // Drip-loading state. Initial load returns 50 immediately; when user
  // approaches the end of the loaded set we fetch the next 50 in the
  // background. Keeps the feed feeling infinite without slamming a 4000-
  // file library into memory upfront.
  const [loadingMore, setLoadingMore] = useState(false)
  const seenIdsRef = useRef<Set<string>>(new Set())
  const FEED_DRIP_BATCH = 50
  const FEED_MEMORY_CAP = 500
  const FEED_PRELOAD_TRIGGER = 50

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

  const suggestedTags = useMemo(() => {
    return allTags.filter(t => t.videoCount > 0).slice(0, 20)
  }, [allTags])

  useEffect(() => {
    window.api.tags.listWithCounts().then(setAllTags)
  }, [])

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

      try {
        const settings = await window.api.settings.get() as VaultSettings | null
        const blacklistSettings = settings?.blacklist
        if (blacklistSettings?.enabled) {
          const blacklistedIds = new Set(blacklistSettings.mediaIds || [])
          vids = vids.filter(v => !blacklistedIds.has(v.id))
        }
      } catch {}

      setVideos(vids)
      seenIdsRef.current = new Set(vids.map((v) => v.id))

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

  const loadMore = useCallback(async () => {
    if (loadingMore || loading) return
    if (videos.length >= FEED_MEMORY_CAP) return
    setLoadingMore(true)
    try {
      const combinedTags = [...new Set([...selectedTags, ...recommendedTags])]
      let nextBatch: MediaRow[] = []

      if (sortMode === 'random' || sortMode === 'liked') {
        const result = await window.api.media.randomByTags(combinedTags, { limit: FEED_DRIP_BATCH * 3 })
        const arr = (Array.isArray(result) ? result : []).filter((m: any) => m.type === 'video')
        nextBatch = arr.filter((v: MediaRow) => !seenIdsRef.current.has(v.id)).slice(0, FEED_DRIP_BATCH)

        if (sortMode === 'liked') {
          const liked: MediaRow[] = []
          await Promise.all(nextBatch.map(async (v) => {
            try {
              const stats = await window.api.media.getStats(v.id)
              if (stats && (stats.rating ?? 0) >= 5) liked.push(v)
            } catch { /* ignore */ }
          }))
          nextBatch = liked
        }
      } else {
        try {
          const result = await window.api.media.list({
            sort: sortMode,
            limit: FEED_DRIP_BATCH,
            offset: videos.length,
            type: 'video',
          } as any)
          const arr = (Array.isArray(result) ? result : (result as any)?.items ?? [])
            .filter((m: any) => m.type === 'video')
          nextBatch = arr.filter((v: MediaRow) => !seenIdsRef.current.has(v.id))
        } catch {
          nextBatch = []
        }
      }

      try {
        const settings = await window.api.settings.get() as VaultSettings | null
        const blacklistSettings = settings?.blacklist
        if (blacklistSettings?.enabled) {
          const blacklistedIds = new Set(blacklistSettings.mediaIds || [])
          nextBatch = nextBatch.filter((v) => !blacklistedIds.has(v.id))
        }
      } catch { /* ignore */ }

      if (nextBatch.length === 0) return
      nextBatch.forEach((v) => seenIdsRef.current.add(v.id))
      setVideos((prev) => [...prev, ...nextBatch])
    } catch (err) {
      console.error('[Feed] drip-load failed:', err)
    } finally {
      setLoadingMore(false)
    }
  }, [loadingMore, loading, videos.length, sortMode, selectedTags, recommendedTags])

  useEffect(() => {
    if (videos.length === 0) return
    if (currentIndex >= videos.length - FEED_PRELOAD_TRIGGER) void loadMore()
  }, [currentIndex, videos.length, loadMore])

  useEffect(() => {
    loadVideos(selectedTags)
  }, [sortMode]) // eslint-disable-line

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
        e.preventDefault()
        const video = videoRefs.current.get(currentIndex)
        if (video && video.duration) {
          video.currentTime = Math.min(video.currentTime + 5, video.duration)
        }
      } else if (e.key === 'ArrowLeft' || e.key === 'h') {
        e.preventDefault()
        const video = videoRefs.current.get(currentIndex)
        if (video) {
          video.currentTime = Math.max(video.currentTime - 5, 0)
        }
      } else if (e.key === 'm') {
        e.preventDefault()
        setIsMuted(prev => !prev)
      } else if (e.key === 'H' || (e.key === 'h' && e.shiftKey)) {
        e.preventDefault()
        setHideUI(prev => !prev)
      } else if (e.key === 'b' || e.key === 'B') {
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
  }, [videos.length, currentIndex, videos, showToast])

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

  const wheelCooldownRef = useRef(false)
  const wheelAccumulatorRef = useRef(0)
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault()
      e.stopPropagation()

      wheelAccumulatorRef.current += e.deltaY

      if (wheelCooldownRef.current) return

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
    }
    el.addEventListener('wheel', handleWheel, { passive: false, capture: true })
    return () => el.removeEventListener('wheel', handleWheel, { capture: true })
  }, [videos.length])

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

      const minSwipeDistance = 80
      const maxSwipeTime = 500

      if (Math.abs(deltaY) > minSwipeDistance && deltaTime < maxSwipeTime) {
        touchCooldownRef.current = true
        window.api.goon?.trackFeedSwipe?.()
        if (deltaY > 0) {
          setCurrentIndex(prev => Math.min(prev + 1, videos.length - 1))
        } else {
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
        const nearEdge =
          e.clientX < edgeThreshold ||
          e.clientX > window.innerWidth - edgeThreshold ||
          e.clientY < edgeThreshold ||
          e.clientY > window.innerHeight - edgeThreshold
        setEdgeActive(nearEdge)
        return
      }

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

  useEffect(() => {
    videoRefs.current.forEach((video, idx) => {
      video.muted = idx !== currentIndex || isMuted
    })
  }, [currentIndex, isMuted])

  const shuffleFeed = useCallback(async () => {
    setCurrentIndex(0)
    if (containerRef.current) {
      containerRef.current.scrollTo({ top: 0, behavior: 'auto' })
    }
    await loadVideos(selectedTags)
  }, [loadVideos, selectedTags])

  const toggleLike = useCallback(async (mediaId: string) => {
    const isLiked = likedIds.has(mediaId)
    const newRating = isLiked ? 0 : 5
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
      setLikedIds(prev => {
        const next = new Set(prev)
        if (isLiked) next.add(mediaId)
        else next.delete(mediaId)
        return next
      })
    }
  }, [likedIds])

  const toggleTag = useCallback((tagName: string) => {
    setSelectedTags(prev =>
      prev.includes(tagName) ? prev.filter(t => t !== tagName) : [...prev, tagName]
    )
  }, [])

  const addToRecommended = useCallback((tagName: string) => {
    setRecommendedTags(prev =>
      prev.includes(tagName) ? prev : [...prev, tagName]
    )
  }, [])

  const removeFromRecommended = useCallback((tagName: string) => {
    setRecommendedTags(prev => prev.filter(t => t !== tagName))
  }, [])

  const applyFilters = useCallback(() => {
    setCurrentIndex(0)
    if (containerRef.current) {
      containerRef.current.scrollTo({ top: 0, behavior: 'auto' })
    }
    loadVideos(selectedTags)
    setShowTagPanel(false)
  }, [loadVideos, selectedTags])

  const skipToNext = useCallback(() => {
    if (currentIndex < videos.length - 1) {
      setCurrentIndex(currentIndex + 1)
    } else {
      shuffleFeed()
    }
  }, [currentIndex, videos.length, shuffleFeed])

  const handleVideoEnded = useCallback(() => {
    window.api.challenges?.updateProgress?.('watch_videos', 1)
    window.api.challenges?.updateProgress?.('unique_videos', 1)

    if (infiniteMode) {
      if (currentIndex < videos.length - 1) {
        setCurrentIndex(prev => prev + 1)
      } else {
        shuffleFeed()
      }
    }
  }, [infiniteMode, currentIndex, videos.length, shuffleFeed])

  const openInPlayer = useCallback(() => {
    if (videos[currentIndex]) {
      window.dispatchEvent(new CustomEvent('vault-open-video', { detail: videos[currentIndex] }))
    }
  }, [videos, currentIndex])

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
      {loadingMore && (
        <div className="absolute bottom-3 left-3 z-40 flex items-center gap-2 px-2.5 py-1 rounded-full bg-black/60 backdrop-blur-md border border-white/10 text-[10px] text-white/70 font-mono pointer-events-none">
          <Loader2 size={11} className="animate-spin" />
          loading more · {videos.length}/{FEED_MEMORY_CAP}
        </div>
      )}
      <div
        className={`absolute top-2 sm:top-4 right-2 sm:right-4 z-50 flex items-center gap-1 sm:gap-2 transition-opacity duration-300 ${(edgeRevealMode ? edgeActive : showHud) && !hideUI ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
      >
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

      {showTagPanel && (
        <div className="absolute top-16 right-4 z-50 w-80 bg-black/90 backdrop-blur-xl rounded-2xl border border-white/10 overflow-hidden">
          <div className="p-4 border-b border-white/10">
            <h3 className="text-sm font-semibold text-white">Filter by Tags</h3>
            <p className="text-xs text-white/50 mt-1">Select tags to filter your feed</p>
          </div>

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

      {showSettings && (
        <div className="absolute top-16 right-4 z-50 w-64 bg-black/90 backdrop-blur-xl rounded-2xl border border-white/10 overflow-hidden">
          <div className="p-4 border-b border-white/10">
            <h3 className="text-sm font-semibold text-white">Feed Settings</h3>
          </div>

          <div className="p-4 space-y-4">
            <div>
              <div className="text-xs text-white/60 mb-2">Playback Speed</div>
              <div className="flex gap-1">
                {[0.5, 0.75, 1, 1.25, 1.5, 2].map((speed) => (
                  <button
                    key={speed}
                    onClick={() => {
                      setPlaybackSpeed(speed)
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

      <div className="h-full w-full relative">
        {videos.map((video, index) => {
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

const FeedItem = memo(function FeedItem(props: {
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
  const [showHeartAnimation, setShowHeartAnimation] = useState(false)
  const lastTapRef = useRef<number>(0)
  const doubleTapTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const [progress, setProgress] = useState(0)
  const [duration, setDuration] = useState(0)
  const [bookmarks, setBookmarks] = useState<Array<{ id: string; timestamp: number; title: string }>>([])
  const videoElementRef = useRef<HTMLVideoElement | null>(null)

  useEffect(() => {
    window.api.invoke('bookmarks:getForMedia', video.id)
      .then((items: any) => setBookmarks(items || []))
      .catch(() => setBookmarks([]))
  }, [video.id])

  const handleTimeUpdate = useCallback(() => {
    if (videoElementRef.current) {
      setProgress(videoElementRef.current.currentTime)
      setDuration(videoElementRef.current.duration || 0)
    }
  }, [])

  const handleVideoRef = useCallback((el: HTMLVideoElement | null) => {
    videoElementRef.current = el
    onVideoRef(el)
    if (el) {
      el.addEventListener('timeupdate', handleTimeUpdate)
      el.addEventListener('loadedmetadata', () => setDuration(el.duration || 0))
    }
  }, [onVideoRef, handleTimeUpdate])

  const handleDoubleTap = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if ((e.target as HTMLElement).closest('button')) return

    const now = Date.now()
    const timeSinceLastTap = now - lastTapRef.current
    lastTapRef.current = now

    if (timeSinceLastTap < 300 && timeSinceLastTap > 0) {
      if (doubleTapTimeoutRef.current) clearTimeout(doubleTapTimeoutRef.current)

      setShowHeartAnimation(true)
      setTimeout(() => setShowHeartAnimation(false), 800)

      window.api.goon?.trackDoubleTapLike?.()

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
        if (resolution !== 'original') {
          const heightMap: Record<string, number> = { '720p': 720, '480p': 480, '360p': 360 }
          const targetHeight = heightMap[resolution] || 720
          const u = await window.api.media.getLowResUrl?.(video.id, targetHeight)
          if (alive && u) { setUrl(u as string); return }
        }
        const u = await window.api.media.getPlayableUrl(video.id)
        if (alive && u) { setUrl(u as string); return }
      } catch (e) {
        console.error('[Feed] Failed to get playable URL:', video.id, e)
      }
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
          <div
            className="h-full bg-[var(--primary)] transition-all duration-100"
            style={{ width: `${(progress / duration) * 100}%` }}
          />
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
          <div className="absolute inset-x-0 -top-2 h-5 group-hover:bg-black/20 transition-colors" />
        </div>
      )}

      {loading && !loadError && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-white/20 border-t-white/60 rounded-full animate-spin" />
        </div>
      )}

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

      <div className="absolute bottom-12 sm:bottom-20 left-3 sm:left-4 right-16 sm:right-20 text-white">
        <p className="font-semibold text-sm sm:text-lg truncate">{filename}</p>
        {video.durationSec && (
          <p className="text-xs sm:text-sm text-white/60">{formatDuration(video.durationSec)}</p>
        )}
      </div>

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
