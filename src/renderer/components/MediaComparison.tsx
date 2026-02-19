// File: src/renderer/components/MediaComparison.tsx
// Side-by-side media comparison view

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import {
  Columns,
  X,
  ArrowLeftRight,
  Heart,
  Star,
  Trash2,
  Check,
  ChevronLeft,
  ChevronRight,
  Play,
  Pause,
  Volume2,
  VolumeX,
  ZoomIn,
  ZoomOut,
  Move,
  RotateCcw,
  Maximize,
  Film,
  Image,
  Clock,
  HardDrive,
  Calendar,
  Tag
} from 'lucide-react'
import { formatDuration, formatFileSize, formatDate } from '../utils/formatters'

interface MediaItem {
  id: string
  path: string
  filename: string
  type: 'video' | 'image'
  thumbnail?: string
  duration?: number
  width?: number
  height?: number
  fileSize?: number
  rating?: number
  isFavorite?: boolean
  tags?: string[]
  createdAt?: number
  viewCount?: number
}

interface MediaComparisonProps {
  items: MediaItem[]
  initialIndex?: number
  onClose: () => void
  onSelect: (id: string) => void
  onDelete: (id: string) => void
  onFavorite: (id: string) => void
  onRate: (id: string, rating: number) => void
  className?: string
}

export function MediaComparison({
  items,
  initialIndex = 0,
  onClose,
  onSelect,
  onDelete,
  onFavorite,
  onRate,
  className = ''
}: MediaComparisonProps) {
  const [leftIndex, setLeftIndex] = useState(initialIndex)
  const [rightIndex, setRightIndex] = useState(Math.min(initialIndex + 1, items.length - 1))
  const [syncPlayback, setSyncPlayback] = useState(true)
  const [isPlaying, setIsPlaying] = useState(false)
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [syncZoom, setSyncZoom] = useState(true)
  const [showInfo, setShowInfo] = useState(true)

  const leftVideoRef = useRef<HTMLVideoElement>(null)
  const rightVideoRef = useRef<HTMLVideoElement>(null)

  // Navigate items
  const navigateLeft = useCallback((direction: -1 | 1) => {
    setLeftIndex(prev => {
      const next = prev + direction
      if (next < 0 || next >= items.length) return prev
      if (next === rightIndex) return prev
      return next
    })
  }, [rightIndex, items.length])

  const navigateRight = useCallback((direction: -1 | 1) => {
    setRightIndex(prev => {
      const next = prev + direction
      if (next < 0 || next >= items.length) return prev
      if (next === leftIndex) return prev
      return next
    })
  }, [leftIndex, items.length])

  // Swap sides
  const swapSides = useCallback(() => {
    setLeftIndex(rightIndex)
    setRightIndex(leftIndex)
  }, [leftIndex, rightIndex])

  // Sync video playback
  useEffect(() => {
    if (!syncPlayback) return

    const leftVideo = leftVideoRef.current
    const rightVideo = rightVideoRef.current
    if (!leftVideo || !rightVideo) return

    const syncTime = () => {
      if (Math.abs(leftVideo.currentTime - rightVideo.currentTime) > 0.1) {
        rightVideo.currentTime = leftVideo.currentTime
      }
    }

    leftVideo.addEventListener('timeupdate', syncTime)
    return () => leftVideo.removeEventListener('timeupdate', syncTime)
  }, [syncPlayback])

  // Play/pause both videos
  const togglePlay = useCallback(() => {
    const leftVideo = leftVideoRef.current
    const rightVideo = rightVideoRef.current

    if (isPlaying) {
      leftVideo?.pause()
      rightVideo?.pause()
    } else {
      leftVideo?.play()
      rightVideo?.play()
    }
    setIsPlaying(!isPlaying)
  }, [isPlaying])

  // Zoom controls
  const handleZoom = useCallback((delta: number) => {
    setZoom(prev => Math.max(0.5, Math.min(3, prev + delta)))
  }, [])

  const resetView = useCallback(() => {
    setZoom(1)
    setPan({ x: 0, y: 0 })
  }, [])

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'Escape':
          onClose()
          break
        case 'ArrowLeft':
          if (e.shiftKey) navigateRight(-1)
          else navigateLeft(-1)
          break
        case 'ArrowRight':
          if (e.shiftKey) navigateRight(1)
          else navigateLeft(1)
          break
        case ' ':
          e.preventDefault()
          togglePlay()
          break
        case 's':
          swapSides()
          break
        case '+':
        case '=':
          handleZoom(0.25)
          break
        case '-':
          handleZoom(-0.25)
          break
        case '0':
          resetView()
          break
        case 'i':
          setShowInfo(prev => !prev)
          break
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose, navigateLeft, navigateRight, togglePlay, swapSides, handleZoom, resetView])

  const leftItem = items[leftIndex]
  const rightItem = items[rightIndex]

  if (!leftItem || !rightItem) return null

  return (
    <div className={`fixed inset-0 z-50 bg-black flex flex-col ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-zinc-900/80 backdrop-blur-sm border-b border-zinc-800">
        <div className="flex items-center gap-4">
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-zinc-800 transition"
          >
            <X size={20} />
          </button>
          <div className="flex items-center gap-2">
            <Columns size={18} className="text-[var(--primary)]" />
            <span className="font-semibold">Compare Media</span>
            <span className="text-sm text-zinc-500">
              ({leftIndex + 1} vs {rightIndex + 1} of {items.length})
            </span>
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-2">
          <button
            onClick={swapSides}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 transition text-sm"
          >
            <ArrowLeftRight size={14} />
            Swap
          </button>

          <div className="flex items-center gap-1 px-2 py-1 rounded-lg bg-zinc-800">
            <button onClick={() => handleZoom(-0.25)} className="p-1 hover:bg-zinc-700 rounded">
              <ZoomOut size={14} />
            </button>
            <span className="text-xs w-12 text-center">{Math.round(zoom * 100)}%</span>
            <button onClick={() => handleZoom(0.25)} className="p-1 hover:bg-zinc-700 rounded">
              <ZoomIn size={14} />
            </button>
            <button onClick={resetView} className="p-1 hover:bg-zinc-700 rounded">
              <RotateCcw size={14} />
            </button>
          </div>

          <label className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-zinc-800">
            <input
              type="checkbox"
              checked={syncZoom}
              onChange={(e) => setSyncZoom(e.target.checked)}
              className="accent-[var(--primary)]"
            />
            <span className="text-sm">Sync zoom</span>
          </label>

          {(leftItem.type === 'video' || rightItem.type === 'video') && (
            <label className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-zinc-800">
              <input
                type="checkbox"
                checked={syncPlayback}
                onChange={(e) => setSyncPlayback(e.target.checked)}
                className="accent-[var(--primary)]"
              />
              <span className="text-sm">Sync playback</span>
            </label>
          )}

          <button
            onClick={() => setShowInfo(!showInfo)}
            className={`p-2 rounded-lg transition ${showInfo ? 'bg-[var(--primary)]' : 'bg-zinc-800 hover:bg-zinc-700'}`}
          >
            <Tag size={16} />
          </button>
        </div>
      </div>

      {/* Comparison area */}
      <div className="flex-1 flex">
        {/* Left side */}
        <ComparisonPane
          item={leftItem}
          videoRef={leftVideoRef}
          isPlaying={isPlaying}
          zoom={zoom}
          pan={pan}
          onPanChange={setPan}
          showInfo={showInfo}
          onNavigate={(dir) => navigateLeft(dir)}
          onSelect={() => onSelect(leftItem.id)}
          onDelete={() => onDelete(leftItem.id)}
          onFavorite={() => onFavorite(leftItem.id)}
          onRate={(rating) => onRate(leftItem.id, rating)}
          canNavigatePrev={leftIndex > 0 && leftIndex - 1 !== rightIndex}
          canNavigateNext={leftIndex < items.length - 1 && leftIndex + 1 !== rightIndex}
        />

        {/* Divider */}
        <div className="w-1 bg-zinc-800 flex items-center justify-center">
          <div className="w-6 h-12 rounded-full bg-zinc-700 flex items-center justify-center">
            <ArrowLeftRight size={12} className="text-zinc-500" />
          </div>
        </div>

        {/* Right side */}
        <ComparisonPane
          item={rightItem}
          videoRef={rightVideoRef}
          isPlaying={isPlaying}
          zoom={syncZoom ? zoom : 1}
          pan={syncZoom ? pan : { x: 0, y: 0 }}
          onPanChange={syncZoom ? setPan : () => {}}
          showInfo={showInfo}
          onNavigate={(dir) => navigateRight(dir)}
          onSelect={() => onSelect(rightItem.id)}
          onDelete={() => onDelete(rightItem.id)}
          onFavorite={() => onFavorite(rightItem.id)}
          onRate={(rating) => onRate(rightItem.id, rating)}
          canNavigatePrev={rightIndex > 0 && rightIndex - 1 !== leftIndex}
          canNavigateNext={rightIndex < items.length - 1 && rightIndex + 1 !== leftIndex}
        />
      </div>

      {/* Footer with video controls */}
      {(leftItem.type === 'video' || rightItem.type === 'video') && (
        <div className="flex items-center justify-center gap-4 px-4 py-3 bg-zinc-900/80 border-t border-zinc-800">
          <button
            onClick={togglePlay}
            className="p-3 rounded-full bg-[var(--primary)] hover:bg-[var(--primary)]/80 transition"
          >
            {isPlaying ? <Pause size={20} /> : <Play size={20} />}
          </button>
        </div>
      )}
    </div>
  )
}

// Individual comparison pane
function ComparisonPane({
  item,
  videoRef,
  isPlaying,
  zoom,
  pan,
  onPanChange,
  showInfo,
  onNavigate,
  onSelect,
  onDelete,
  onFavorite,
  onRate,
  canNavigatePrev,
  canNavigateNext
}: {
  item: MediaItem
  videoRef: React.RefObject<HTMLVideoElement>
  isPlaying: boolean
  zoom: number
  pan: { x: number; y: number }
  onPanChange: (pan: { x: number; y: number }) => void
  showInfo: boolean
  onNavigate: (direction: -1 | 1) => void
  onSelect: () => void
  onDelete: () => void
  onFavorite: () => void
  onRate: (rating: number) => void
  canNavigatePrev: boolean
  canNavigateNext: boolean
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })

  // Pan handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    if (zoom > 1) {
      setIsDragging(true)
      setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y })
    }
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging) {
      onPanChange({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y
      })
    }
  }

  const handleMouseUp = () => {
    setIsDragging(false)
  }

  return (
    <div className="flex-1 flex flex-col relative">
      {/* Navigation arrows */}
      {canNavigatePrev && (
        <button
          onClick={() => onNavigate(-1)}
          className="absolute left-2 top-1/2 -translate-y-1/2 z-10 p-2 rounded-full bg-black/50 hover:bg-black/70 transition"
        >
          <ChevronLeft size={24} />
        </button>
      )}
      {canNavigateNext && (
        <button
          onClick={() => onNavigate(1)}
          className="absolute right-2 top-1/2 -translate-y-1/2 z-10 p-2 rounded-full bg-black/50 hover:bg-black/70 transition"
        >
          <ChevronRight size={24} />
        </button>
      )}

      {/* Media container */}
      <div
        ref={containerRef}
        className="flex-1 overflow-hidden flex items-center justify-center bg-black"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        style={{ cursor: zoom > 1 ? (isDragging ? 'grabbing' : 'grab') : 'default' }}
      >
        {item.type === 'video' ? (
          <video
            ref={videoRef}
            src={`file://${item.path}`}
            className="max-w-full max-h-full object-contain"
            style={{
              transform: `scale(${zoom}) translate(${pan.x / zoom}px, ${pan.y / zoom}px)`
            }}
            loop
            muted
          />
        ) : (
          <img
            src={item.thumbnail || `file://${item.path}`}
            alt={item.filename}
            className="max-w-full max-h-full object-contain"
            style={{
              transform: `scale(${zoom}) translate(${pan.x / zoom}px, ${pan.y / zoom}px)`
            }}
            draggable={false}
          />
        )}
      </div>

      {/* Info panel */}
      {showInfo && (
        <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/90 to-transparent">
          <div className="flex items-end justify-between">
            <div className="flex-1 min-w-0">
              <h3 className="font-medium truncate mb-1">{item.filename}</h3>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-400">
                {item.type === 'video' && item.duration && (
                  <span className="flex items-center gap-1">
                    <Clock size={10} />
                    {formatDuration(item.duration)}
                  </span>
                )}
                {item.width && item.height && (
                  <span>{item.width}×{item.height}</span>
                )}
                {item.fileSize && (
                  <span className="flex items-center gap-1">
                    <HardDrive size={10} />
                    {formatFileSize(item.fileSize)}
                  </span>
                )}
              </div>
              {/* Rating */}
              <div className="flex items-center gap-1 mt-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <button
                    key={i}
                    onClick={() => onRate(i + 1)}
                    className="p-0.5"
                  >
                    <Star
                      size={14}
                      className={i < (item.rating || 0) ? 'text-yellow-400 fill-yellow-400' : 'text-zinc-600'}
                    />
                  </button>
                ))}
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2">
              <button
                onClick={onFavorite}
                className={`p-2 rounded-lg transition ${
                  item.isFavorite ? 'bg-red-500/20 text-red-400' : 'bg-zinc-800 hover:bg-zinc-700'
                }`}
              >
                <Heart size={16} className={item.isFavorite ? 'fill-current' : ''} />
              </button>
              <button
                onClick={onSelect}
                className="px-3 py-2 rounded-lg bg-[var(--primary)] hover:bg-[var(--primary)]/80 transition text-sm"
              >
                <Check size={14} className="inline mr-1" />
                Keep
              </button>
              <button
                onClick={onDelete}
                className="p-2 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-400 transition"
              >
                <Trash2 size={16} />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// Quick comparison button
export function CompareButton({
  selectedCount,
  onClick,
  className = ''
}: {
  selectedCount: number
  onClick: () => void
  className?: string
}) {
  if (selectedCount < 2) return null

  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-3 py-2 rounded-lg bg-[var(--primary)]/20 text-[var(--primary)] hover:bg-[var(--primary)]/30 transition ${className}`}
    >
      <Columns size={16} />
      <span className="text-sm">Compare ({selectedCount})</span>
    </button>
  )
}

export default MediaComparison
