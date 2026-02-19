// File: src/renderer/components/ComparisonView.tsx
// Side-by-side media comparison view for comparing videos/images

import React, { useState, useEffect, useRef, useCallback } from 'react'
import { X, Play, Pause, Volume2, VolumeX, Maximize2, Minimize2, Plus, Trash2, Link, Unlink, RotateCcw, ChevronLeft, ChevronRight, Film, Image as ImageIcon, Zap, SkipBack, SkipForward } from 'lucide-react'
import { toFileUrlCached } from '../hooks/usePerformance'
import { formatDuration } from '../utils/formatters'

interface MediaItem {
  id: string
  filename: string
  path: string
  type: 'video' | 'image' | 'gif'
  thumbPath?: string | null
  durationSec?: number | null
  sizeBytes?: number | null
}

interface ComparisonViewProps {
  initialMedia?: MediaItem[]
  allMedia: MediaItem[]
  onClose: () => void
  onSelectMedia?: (mediaId: string) => void
}

interface MediaSlot {
  media: MediaItem | null
  url: string
  isPlaying: boolean
  currentTime: number
  duration: number
  volume: number
  muted: boolean
}

export function ComparisonView({ initialMedia = [], allMedia, onClose, onSelectMedia }: ComparisonViewProps) {
  const [slots, setSlots] = useState<MediaSlot[]>(() =>
    initialMedia.slice(0, 4).map(media => ({
      media,
      url: '',
      isPlaying: false,
      currentTime: 0,
      duration: 0,
      volume: 0.5,
      muted: true
    }))
  )
  const [layout, setLayout] = useState<'2x1' | '2x2' | '1x2' | '3x1'>('2x1')
  const [syncPlayback, setSyncPlayback] = useState(true)
  const [showMediaPicker, setShowMediaPicker] = useState<number | null>(null)
  const [mediaSearch, setMediaSearch] = useState('')
  const [isFullscreen, setIsFullscreen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const videoRefs = useRef<(HTMLVideoElement | null)[]>([])

  // Calculate grid based on layout
  const gridConfig = {
    '2x1': { cols: 2, rows: 1, maxSlots: 2 },
    '2x2': { cols: 2, rows: 2, maxSlots: 4 },
    '1x2': { cols: 1, rows: 2, maxSlots: 2 },
    '3x1': { cols: 3, rows: 1, maxSlots: 3 }
  }[layout]

  // Load URLs for media
  useEffect(() => {
    slots.forEach(async (slot, idx) => {
      if (slot.media && !slot.url) {
        try {
          const url = await toFileUrlCached(slot.media.path)
          setSlots(prev => {
            const next = [...prev]
            next[idx] = { ...next[idx], url }
            return next
          })
        } catch (e) {
          console.error('Failed to load media URL:', e)
        }
      }
    })
  }, [slots])

  // Sync playback across all videos
  useEffect(() => {
    if (!syncPlayback) return

    const handleTimeUpdate = (sourceIdx: number) => {
      const sourceVideo = videoRefs.current[sourceIdx]
      if (!sourceVideo) return

      videoRefs.current.forEach((video, idx) => {
        if (idx !== sourceIdx && video && Math.abs(video.currentTime - sourceVideo.currentTime) > 0.5) {
          video.currentTime = sourceVideo.currentTime
        }
      })
    }

    videoRefs.current.forEach((video, idx) => {
      if (video) {
        video.addEventListener('timeupdate', () => handleTimeUpdate(idx))
      }
    })

    return () => {
      videoRefs.current.forEach((video) => {
        if (video) {
          video.removeEventListener('timeupdate', () => {})
        }
      })
    }
  }, [syncPlayback, slots])

  const handlePlayPause = useCallback((slotIdx: number) => {
    if (syncPlayback) {
      // Toggle all videos
      const anyPlaying = slots.some(s => s.isPlaying)
      const newState = !anyPlaying

      setSlots(prev => prev.map(s => ({ ...s, isPlaying: newState })))

      videoRefs.current.forEach(video => {
        if (video) {
          if (newState) video.play()
          else video.pause()
        }
      })
    } else {
      // Toggle single video
      const video = videoRefs.current[slotIdx]
      if (video) {
        if (video.paused) {
          video.play()
          setSlots(prev => {
            const next = [...prev]
            next[slotIdx] = { ...next[slotIdx], isPlaying: true }
            return next
          })
        } else {
          video.pause()
          setSlots(prev => {
            const next = [...prev]
            next[slotIdx] = { ...next[slotIdx], isPlaying: false }
            return next
          })
        }
      }
    }
  }, [syncPlayback, slots])

  const handleSeek = useCallback((slotIdx: number, time: number) => {
    if (syncPlayback) {
      videoRefs.current.forEach(video => {
        if (video) video.currentTime = time
      })
    } else {
      const video = videoRefs.current[slotIdx]
      if (video) video.currentTime = time
    }
  }, [syncPlayback])

  const handleSkip = useCallback((seconds: number) => {
    if (syncPlayback) {
      videoRefs.current.forEach(video => {
        if (video) video.currentTime += seconds
      })
    }
  }, [syncPlayback])

  const addSlot = useCallback((media: MediaItem) => {
    if (slots.length >= gridConfig.maxSlots) return

    setSlots(prev => [...prev, {
      media,
      url: '',
      isPlaying: false,
      currentTime: 0,
      duration: 0,
      volume: 0.5,
      muted: true
    }])
  }, [slots.length, gridConfig.maxSlots])

  const removeSlot = useCallback((idx: number) => {
    setSlots(prev => prev.filter((_, i) => i !== idx))
  }, [])

  const updateSlot = useCallback((idx: number, media: MediaItem) => {
    setSlots(prev => {
      const next = [...prev]
      next[idx] = {
        ...next[idx],
        media,
        url: '',
        currentTime: 0,
        duration: 0
      }
      return next
    })
    setShowMediaPicker(null)
  }, [])

  const toggleFullscreen = useCallback(async () => {
    if (!containerRef.current) return

    if (document.fullscreenElement) {
      await document.exitFullscreen()
      setIsFullscreen(false)
    } else {
      await containerRef.current.requestFullscreen()
      setIsFullscreen(true)
    }
  }, [])

  // Filter media for picker
  const filteredMedia = allMedia.filter(m => {
    if (!mediaSearch) return true
    const q = mediaSearch.toLowerCase()
    return m.filename.toLowerCase().includes(q)
  }).slice(0, 50)

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showMediaPicker !== null) {
          setShowMediaPicker(null)
        } else {
          onClose()
        }
      } else if (e.key === ' ') {
        e.preventDefault()
        handlePlayPause(0)
      } else if (e.key === 'ArrowLeft') {
        handleSkip(-5)
      } else if (e.key === 'ArrowRight') {
        handleSkip(5)
      } else if (e.key === 'f' || e.key === 'F') {
        toggleFullscreen()
      } else if (e.key === 's' || e.key === 'S') {
        setSyncPlayback(prev => !prev)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose, showMediaPicker, handlePlayPause, handleSkip, toggleFullscreen])

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-50 bg-black flex flex-col"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-zinc-900/90 border-b border-zinc-800">
        <div className="flex items-center gap-4">
          <h2 className="text-white font-semibold flex items-center gap-2">
            <Zap size={18} className="text-[var(--primary)]" />
            Comparison View
          </h2>

          {/* Layout selector */}
          <div className="flex items-center gap-1 bg-zinc-800 rounded-lg p-1">
            {(['2x1', '1x2', '2x2', '3x1'] as const).map(l => (
              <button
                key={l}
                onClick={() => setLayout(l)}
                className={`px-2 py-1 text-xs rounded ${layout === l ? 'bg-[var(--primary)] text-white' : 'text-zinc-400 hover:text-white'}`}
              >
                {l}
              </button>
            ))}
          </div>

          {/* Sync toggle */}
          <button
            onClick={() => setSyncPlayback(prev => !prev)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition ${
              syncPlayback
                ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                : 'bg-zinc-800 text-zinc-400 hover:text-white'
            }`}
            title="Sync playback across all videos (S)"
          >
            {syncPlayback ? <Link size={14} /> : <Unlink size={14} />}
            {syncPlayback ? 'Synced' : 'Independent'}
          </button>
        </div>

        <div className="flex items-center gap-2">
          {/* Global playback controls when synced */}
          {syncPlayback && slots.some(s => s.media?.type === 'video') && (
            <div className="flex items-center gap-1 mr-4">
              <button
                onClick={() => handleSkip(-10)}
                className="p-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 transition"
                title="Skip back 10s"
              >
                <SkipBack size={16} />
              </button>
              <button
                onClick={() => handlePlayPause(0)}
                className="p-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 transition"
                title="Play/Pause (Space)"
              >
                {slots.some(s => s.isPlaying) ? <Pause size={16} /> : <Play size={16} />}
              </button>
              <button
                onClick={() => handleSkip(10)}
                className="p-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 transition"
                title="Skip forward 10s"
              >
                <SkipForward size={16} />
              </button>
            </div>
          )}

          {/* Add slot button */}
          {slots.length < gridConfig.maxSlots && (
            <button
              onClick={() => setShowMediaPicker(slots.length)}
              className="flex items-center gap-1 px-3 py-1.5 bg-green-500/20 text-green-400 rounded-lg hover:bg-green-500/30 transition text-sm"
            >
              <Plus size={14} />
              Add Media
            </button>
          )}

          <button
            onClick={toggleFullscreen}
            className="p-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 transition"
            title="Fullscreen (F)"
          >
            {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
          </button>

          <button
            onClick={onClose}
            className="p-2 rounded-lg bg-zinc-800 hover:bg-red-500/50 transition"
            title="Close (Esc)"
          >
            <X size={18} />
          </button>
        </div>
      </div>

      {/* Comparison Grid */}
      <div
        className="flex-1 grid gap-1 p-1"
        style={{
          gridTemplateColumns: `repeat(${gridConfig.cols}, 1fr)`,
          gridTemplateRows: `repeat(${gridConfig.rows}, 1fr)`
        }}
      >
        {Array.from({ length: Math.max(slots.length, 2) }).map((_, idx) => {
          const slot = slots[idx]

          if (!slot || !slot.media) {
            // Empty slot
            return (
              <div
                key={idx}
                className="bg-zinc-900 rounded-lg flex flex-col items-center justify-center gap-3 border border-dashed border-zinc-700 hover:border-zinc-500 transition cursor-pointer"
                onClick={() => setShowMediaPicker(idx)}
              >
                <div className="w-16 h-16 rounded-full bg-zinc-800 flex items-center justify-center">
                  <Plus size={24} className="text-zinc-500" />
                </div>
                <span className="text-sm text-zinc-500">Add media to compare</span>
              </div>
            )
          }

          const isVideo = slot.media.type === 'video'

          return (
            <div key={idx} className="relative bg-black rounded-lg overflow-hidden group">
              {/* Media content */}
              {isVideo ? (
                <video
                  ref={el => { videoRefs.current[idx] = el }}
                  src={slot.url}
                  className="w-full h-full object-contain"
                  loop
                  muted={slot.muted}
                  onTimeUpdate={(e) => {
                    setSlots(prev => {
                      const next = [...prev]
                      next[idx] = {
                        ...next[idx],
                        currentTime: e.currentTarget.currentTime,
                        duration: e.currentTarget.duration || 0
                      }
                      return next
                    })
                  }}
                  onPlay={() => {
                    setSlots(prev => {
                      const next = [...prev]
                      next[idx] = { ...next[idx], isPlaying: true }
                      return next
                    })
                  }}
                  onPause={() => {
                    setSlots(prev => {
                      const next = [...prev]
                      next[idx] = { ...next[idx], isPlaying: false }
                      return next
                    })
                  }}
                />
              ) : (
                <img
                  src={slot.url}
                  alt={slot.media.filename}
                  className="w-full h-full object-contain"
                />
              )}

              {/* Overlay controls */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/40 opacity-0 group-hover:opacity-100 transition-opacity">
                {/* Top bar - filename and actions */}
                <div className="absolute top-0 left-0 right-0 p-2 flex items-center justify-between">
                  <span className="text-xs text-white truncate max-w-[60%] bg-black/50 px-2 py-1 rounded">
                    {slot.media.filename}
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setShowMediaPicker(idx)}
                      className="p-1.5 rounded bg-black/50 hover:bg-white/20 transition"
                      title="Change media"
                    >
                      <RotateCcw size={14} />
                    </button>
                    <button
                      onClick={() => removeSlot(idx)}
                      className="p-1.5 rounded bg-black/50 hover:bg-red-500/50 transition"
                      title="Remove"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>

                {/* Video controls */}
                {isVideo && (
                  <>
                    {/* Center play button */}
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <button
                        onClick={() => handlePlayPause(idx)}
                        className="p-4 rounded-full bg-white/20 hover:bg-white/30 transition pointer-events-auto"
                      >
                        {slot.isPlaying ? <Pause size={32} /> : <Play size={32} />}
                      </button>
                    </div>

                    {/* Bottom bar - progress and volume */}
                    <div className="absolute bottom-0 left-0 right-0 p-2 space-y-2">
                      {/* Progress bar */}
                      <div
                        className="w-full h-1 bg-white/20 rounded cursor-pointer"
                        onClick={(e) => {
                          const rect = e.currentTarget.getBoundingClientRect()
                          const percent = (e.clientX - rect.left) / rect.width
                          handleSeek(idx, percent * slot.duration)
                        }}
                      >
                        <div
                          className="h-full bg-[var(--primary)] rounded"
                          style={{ width: `${(slot.currentTime / slot.duration) * 100 || 0}%` }}
                        />
                      </div>

                      <div className="flex items-center justify-between">
                        <span className="text-xs text-white/80">
                          {formatDuration(slot.currentTime)} / {formatDuration(slot.duration)}
                        </span>
                        <button
                          onClick={() => {
                            setSlots(prev => {
                              const next = [...prev]
                              next[idx] = { ...next[idx], muted: !next[idx].muted }
                              return next
                            })
                          }}
                          className="p-1 rounded bg-black/50 hover:bg-white/20 transition"
                        >
                          {slot.muted ? <VolumeX size={14} /> : <Volume2 size={14} />}
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>

              {/* Slot number indicator */}
              <div className="absolute top-2 left-2 w-6 h-6 rounded-full bg-[var(--primary)] flex items-center justify-center text-xs font-bold">
                {idx + 1}
              </div>
            </div>
          )
        })}
      </div>

      {/* Media picker modal */}
      {showMediaPicker !== null && (
        <div
          className="absolute inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={() => setShowMediaPicker(null)}
        >
          <div
            className="w-full max-w-2xl max-h-[80vh] bg-zinc-900 rounded-2xl border border-zinc-700 overflow-hidden flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-zinc-800">
              <h3 className="font-semibold">Select Media</h3>
              <button
                onClick={() => setShowMediaPicker(null)}
                className="p-1 rounded hover:bg-zinc-800"
              >
                <X size={18} />
              </button>
            </div>

            {/* Search */}
            <div className="p-3 border-b border-zinc-800">
              <input
                type="text"
                placeholder="Search media..."
                value={mediaSearch}
                onChange={e => setMediaSearch(e.target.value)}
                className="w-full px-4 py-2 bg-zinc-800 rounded-lg text-sm outline-none focus:ring-2 ring-[var(--primary)]"
                autoFocus
              />
            </div>

            {/* Media grid */}
            <div className="flex-1 overflow-auto p-3">
              <div className="grid grid-cols-4 gap-2">
                {filteredMedia.map(media => (
                  <button
                    key={media.id}
                    onClick={() => {
                      if (showMediaPicker < slots.length) {
                        updateSlot(showMediaPicker, media)
                      } else {
                        addSlot(media)
                        setShowMediaPicker(null)
                      }
                    }}
                    className="aspect-video rounded-lg overflow-hidden bg-zinc-800 hover:ring-2 ring-[var(--primary)] transition relative group"
                  >
                    {media.thumbPath ? (
                      <ThumbImage thumbPath={media.thumbPath} />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-zinc-600">
                        {media.type === 'video' ? <Film size={24} /> : <ImageIcon size={24} />}
                      </div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent opacity-0 group-hover:opacity-100 transition">
                      <div className="absolute bottom-1 left-1 right-1 text-[10px] text-white truncate">
                        {media.filename}
                      </div>
                    </div>
                    {media.durationSec && (
                      <div className="absolute bottom-1 right-1 px-1 py-0.5 bg-black/80 rounded text-[10px] text-white">
                        {formatDuration(media.durationSec)}
                      </div>
                    )}
                  </button>
                ))}
              </div>

              {filteredMedia.length === 0 && (
                <div className="text-center py-12 text-zinc-500">
                  No media found
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Help overlay */}
      <div className="absolute bottom-4 left-4 text-xs text-zinc-500 space-y-0.5">
        <div>Space: Play/Pause | S: Toggle Sync | F: Fullscreen | Esc: Close</div>
        <div>Arrow keys: Skip 5s (when synced)</div>
      </div>
    </div>
  )
}

// Lazy loading thumbnail
function ThumbImage({ thumbPath }: { thumbPath: string }) {
  const [url, setUrl] = useState('')

  useEffect(() => {
    toFileUrlCached(thumbPath).then(setUrl).catch(() => {})
  }, [thumbPath])

  if (!url) return <div className="w-full h-full bg-zinc-700 sexy-shimmer" />

  return <img src={url} alt="" className="w-full h-full object-cover" />
}

export default ComparisonView
