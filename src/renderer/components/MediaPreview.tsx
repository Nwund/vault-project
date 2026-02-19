// File: src/renderer/components/MediaPreview.tsx
// Quick preview popup on hover with video scrubbing

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Heart,
  Star,
  Clock,
  Tag,
  Calendar,
  HardDrive,
  Film,
  Image,
  Eye,
  X
} from 'lucide-react'
import { formatDuration, formatFileSize, formatDate } from '../utils/formatters'

interface MediaPreviewProps {
  mediaId: string
  mediaPath: string
  mediaType: 'video' | 'image'
  thumbnail?: string
  title: string
  duration?: number
  rating?: number
  isFavorite?: boolean
  tags?: string[]
  fileSize?: number
  createdAt?: number
  viewCount?: number
  position: { x: number; y: number }
  onClose: () => void
  onAction?: (action: string) => void
}

export function MediaPreview({
  mediaId,
  mediaPath,
  mediaType,
  thumbnail,
  title,
  duration,
  rating = 0,
  isFavorite = false,
  tags = [],
  fileSize,
  createdAt,
  viewCount,
  position,
  onClose,
  onAction
}: MediaPreviewProps) {
  const [isPlaying, setIsPlaying] = useState(false)
  const [isMuted, setIsMuted] = useState(true)
  const [currentTime, setCurrentTime] = useState(0)
  const [scrubPosition, setScrubPosition] = useState<number | null>(null)
  const [adjustedPosition, setAdjustedPosition] = useState(position)

  const containerRef = useRef<HTMLDivElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)

  // Adjust position to keep in viewport
  useEffect(() => {
    if (!containerRef.current) return

    const rect = containerRef.current.getBoundingClientRect()
    const padding = 20
    let x = position.x
    let y = position.y

    if (x + rect.width > window.innerWidth - padding) {
      x = position.x - rect.width - 20
    }
    if (y + rect.height > window.innerHeight - padding) {
      y = window.innerHeight - rect.height - padding
    }
    if (x < padding) x = padding
    if (y < padding) y = padding

    setAdjustedPosition({ x, y })
  }, [position])

  // Auto-play video preview
  useEffect(() => {
    if (mediaType === 'video' && videoRef.current) {
      videoRef.current.currentTime = duration ? duration * 0.1 : 0
      videoRef.current.play().catch(() => {})
      setIsPlaying(true)
    }
  }, [mediaType, duration])

  // Handle video time update
  const handleTimeUpdate = useCallback(() => {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime)
    }
  }, [])

  // Handle scrub
  const handleScrub = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!videoRef.current || !duration) return

    const rect = e.currentTarget.getBoundingClientRect()
    const percent = (e.clientX - rect.left) / rect.width
    const time = percent * duration
    setScrubPosition(percent)
    videoRef.current.currentTime = time
  }, [duration])

  // Toggle play/pause
  const togglePlay = useCallback(() => {
    if (!videoRef.current) return
    if (isPlaying) {
      videoRef.current.pause()
    } else {
      videoRef.current.play()
    }
    setIsPlaying(!isPlaying)
  }, [isPlaying])

  // Toggle mute
  const toggleMute = useCallback(() => {
    if (!videoRef.current) return
    videoRef.current.muted = !isMuted
    setIsMuted(!isMuted)
  }, [isMuted])

  // Render stars
  const stars = useMemo(() => {
    return Array.from({ length: 5 }).map((_, i) => (
      <Star
        key={i}
        size={12}
        className={i < rating ? 'text-yellow-400 fill-yellow-400' : 'text-zinc-600'}
      />
    ))
  }, [rating])

  return (
    <div
      ref={containerRef}
      className="fixed z-[9998] w-80 bg-zinc-900/95 backdrop-blur-xl rounded-2xl border border-zinc-700 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200"
      style={{ left: adjustedPosition.x, top: adjustedPosition.y }}
      onMouseLeave={onClose}
    >
      {/* Preview area */}
      <div
        className="relative aspect-video bg-black cursor-pointer"
        onClick={() => onAction?.('open')}
        onMouseMove={handleScrub}
        onMouseLeave={() => setScrubPosition(null)}
      >
        {mediaType === 'video' ? (
          <>
            <video
              ref={videoRef}
              src={`file://${mediaPath}`}
              className="w-full h-full object-contain"
              muted={isMuted}
              loop
              onTimeUpdate={handleTimeUpdate}
            />
            {/* Video controls overlay */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 hover:opacity-100 transition">
              <div className="absolute bottom-2 left-2 right-2 flex items-center gap-2">
                <button
                  onClick={(e) => { e.stopPropagation(); togglePlay() }}
                  className="p-1.5 rounded-full bg-black/50 hover:bg-black/70 transition"
                >
                  {isPlaying ? <Pause size={14} /> : <Play size={14} />}
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); toggleMute() }}
                  className="p-1.5 rounded-full bg-black/50 hover:bg-black/70 transition"
                >
                  {isMuted ? <VolumeX size={14} /> : <Volume2 size={14} />}
                </button>
                <div className="flex-1 text-xs text-white/70">
                  {formatDuration(currentTime)} / {formatDuration(duration || 0)}
                </div>
              </div>
            </div>
            {/* Scrub indicator */}
            {scrubPosition !== null && (
              <div
                className="absolute bottom-0 left-0 h-1 bg-[var(--primary)]"
                style={{ width: `${scrubPosition * 100}%` }}
              />
            )}
          </>
        ) : (
          <img
            src={thumbnail || `file://${mediaPath}`}
            alt={title}
            className="w-full h-full object-contain"
          />
        )}

        {/* Duration badge */}
        {mediaType === 'video' && duration && (
          <div className="absolute top-2 right-2 px-1.5 py-0.5 rounded bg-black/70 text-xs">
            {formatDuration(duration)}
          </div>
        )}

        {/* Media type indicator */}
        <div className="absolute top-2 left-2 p-1.5 rounded-full bg-black/50">
          {mediaType === 'video' ? <Film size={12} /> : <Image size={12} />}
        </div>

        {/* Favorite indicator */}
        {isFavorite && (
          <div className="absolute bottom-2 right-2 p-1">
            <Heart size={14} className="text-red-400 fill-red-400" />
          </div>
        )}
      </div>

      {/* Info section */}
      <div className="p-3 space-y-2">
        {/* Title */}
        <h3 className="font-medium text-sm truncate" title={title}>{title}</h3>

        {/* Rating and favorite */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-0.5">{stars}</div>
          {isFavorite && (
            <Heart size={12} className="text-red-400 fill-red-400" />
          )}
        </div>

        {/* Tags */}
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {tags.slice(0, 4).map(tag => (
              <span
                key={tag}
                className="px-1.5 py-0.5 rounded bg-zinc-800 text-[10px] text-zinc-400"
              >
                {tag}
              </span>
            ))}
            {tags.length > 4 && (
              <span className="px-1.5 py-0.5 rounded bg-zinc-800 text-[10px] text-zinc-500">
                +{tags.length - 4}
              </span>
            )}
          </div>
        )}

        {/* Metadata */}
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-zinc-500">
          {viewCount !== undefined && (
            <span className="flex items-center gap-1">
              <Eye size={10} />
              {viewCount} views
            </span>
          )}
          {fileSize && (
            <span className="flex items-center gap-1">
              <HardDrive size={10} />
              {formatFileSize(fileSize)}
            </span>
          )}
          {createdAt && (
            <span className="flex items-center gap-1">
              <Calendar size={10} />
              {formatDate(createdAt)}
            </span>
          )}
        </div>
      </div>

      {/* Quick actions */}
      <div className="flex border-t border-zinc-800">
        <button
          onClick={() => onAction?.('play')}
          className="flex-1 flex items-center justify-center gap-1 py-2 hover:bg-zinc-800 transition text-xs"
        >
          <Play size={12} />
          {mediaType === 'video' ? 'Play' : 'View'}
        </button>
        <button
          onClick={() => onAction?.('favorite')}
          className="flex-1 flex items-center justify-center gap-1 py-2 hover:bg-zinc-800 transition text-xs"
        >
          <Heart size={12} className={isFavorite ? 'text-red-400 fill-red-400' : ''} />
          {isFavorite ? 'Unfav' : 'Favorite'}
        </button>
        <button
          onClick={() => onAction?.('queue')}
          className="flex-1 flex items-center justify-center gap-1 py-2 hover:bg-zinc-800 transition text-xs"
        >
          <Clock size={12} />
          Queue
        </button>
      </div>
    </div>
  )
}

// Hook for preview popup
export function useMediaPreview() {
  const [preview, setPreview] = useState<{
    mediaId: string
    mediaPath: string
    mediaType: 'video' | 'image'
    thumbnail?: string
    title: string
    duration?: number
    rating?: number
    isFavorite?: boolean
    tags?: string[]
    fileSize?: number
    createdAt?: number
    viewCount?: number
    position: { x: number; y: number }
  } | null>(null)
  const timeoutRef = useRef<NodeJS.Timeout>()

  const show = useCallback((
    e: React.MouseEvent,
    data: Omit<NonNullable<typeof preview>, 'position'>
  ) => {
    // Delay to avoid flicker
    timeoutRef.current = setTimeout(() => {
      setPreview({
        ...data,
        position: { x: e.clientX + 10, y: e.clientY + 10 }
      })
    }, 400)
  }, [])

  const hide = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
    }
    setPreview(null)
  }, [])

  const cancel = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
    }
  }, [])

  return { preview, show, hide, cancel }
}

// Thumbnail preview for grid items
export function ThumbnailPreview({
  src,
  alt,
  duration,
  isVideo,
  className = ''
}: {
  src: string
  alt: string
  duration?: number
  isVideo?: boolean
  className?: string
}) {
  const [isHovered, setIsHovered] = useState(false)
  const [previewTime, setPreviewTime] = useState(0)
  const videoRef = useRef<HTMLVideoElement>(null)
  const intervalRef = useRef<NodeJS.Timeout>()

  // Animate through video on hover
  useEffect(() => {
    if (!isVideo || !isHovered || !duration) return

    const interval = duration / 10
    let time = 0

    intervalRef.current = setInterval(() => {
      time += interval
      if (time >= duration) time = 0
      setPreviewTime(time)
      if (videoRef.current) {
        videoRef.current.currentTime = time
      }
    }, 500)

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [isVideo, isHovered, duration])

  return (
    <div
      className={`relative overflow-hidden ${className}`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {isVideo && isHovered ? (
        <video
          ref={videoRef}
          src={src}
          className="w-full h-full object-cover"
          muted
          playsInline
        />
      ) : (
        <img
          src={src}
          alt={alt}
          className="w-full h-full object-cover"
        />
      )}

      {/* Duration overlay */}
      {duration && (
        <div className="absolute bottom-1 right-1 px-1 py-0.5 rounded bg-black/70 text-[10px]">
          {formatDuration(isHovered ? previewTime : duration)}
        </div>
      )}

      {/* Progress indicator on hover */}
      {isVideo && isHovered && duration && (
        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-zinc-800">
          <div
            className="h-full bg-[var(--primary)] transition-all duration-500"
            style={{ width: `${(previewTime / duration) * 100}%` }}
          />
        </div>
      )}
    </div>
  )
}

export default MediaPreview
