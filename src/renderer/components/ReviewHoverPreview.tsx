// File: src/renderer/components/ReviewHoverPreview.tsx
//
// AI Review media preview. Behavior depends on media type:
//
//   Video → click-to-play with native <video controls> so the reviewer
//           can pause / scrub / seek frame-by-frame.
//   GIF   → autoplay inline (no chrome — GIFs are short loops by
//           nature; controls are noise).
//   Image → show the still, full quality, no chrome.
//
// Switched from hover-to-play because hover-preview made it impossible
// to pause + scrub through a video — exactly what a reviewer needs to
// verify a tag against a specific moment. Component name kept for
// back-compat with imports.

import { useEffect, useMemo, useRef, useState } from 'react'
import { Play } from 'lucide-react'
import { toFileUrlCached } from '../hooks/usePerformance'
import { cn } from '../utils/cn'

type MediaKind = 'video' | 'gif' | 'image'

function detectKind(filename: string): MediaKind {
  const ext = filename.toLowerCase().split('.').pop() ?? ''
  if (ext === 'gif') return 'gif'
  if (['jpg', 'jpeg', 'png', 'webp', 'bmp', 'avif', 'jxl', 'heic', 'heif', 'tiff', 'tif'].includes(ext)) return 'image'
  return 'video'
}

export function ReviewHoverPreview({
  mediaId,
  thumbPath,
  filename,
}: {
  mediaId: string
  thumbPath?: string | null
  filename: string
}) {
  const kind = useMemo(() => detectKind(filename), [filename])
  const [thumbUrl, setThumbUrl] = useState<string>('')
  const [mediaUrl, setMediaUrl] = useState<string>('')
  const [playing, setPlaying] = useState(false)
  const videoRef = useRef<HTMLVideoElement | null>(null)

  // Reset to thumb view whenever the selected item changes so audio
  // doesn't keep playing in the background as the reviewer advances.
  useEffect(() => {
    setPlaying(false)
    if (videoRef.current) {
      try {
        videoRef.current.pause()
        videoRef.current.currentTime = 0
      } catch { /* ignore */ }
    }
  }, [mediaId])

  // Resolve thumbnail URL (still images use this as the primary
  // display when no thumb-distinct full URL is needed yet).
  useEffect(() => {
    let alive = true
    ;(async () => {
      if (thumbPath) {
        try {
          const u = await toFileUrlCached(thumbPath)
          if (alive) setThumbUrl(u)
        } catch { /* ignore */ }
      } else {
        try {
          const p = await window.api.media.generateThumb(mediaId)
          if (alive && p) {
            const u = await toFileUrlCached(p as string)
            if (alive) setThumbUrl(u)
          }
        } catch { /* ignore */ }
      }
    })()
    return () => { alive = false }
  }, [mediaId, thumbPath])

  // Resolve the playable / full-resolution URL. For videos this is the
  // streamable mp4/webm; for gifs it's the file URL we'll <img> with
  // autoplay; for stills it's the full-size image URL so the reviewer
  // sees the actual content quality, not a downscaled thumb.
  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const u = await window.api.media.getPlayableUrl(mediaId, false)
        if (alive && u) setMediaUrl(u as string)
      } catch { /* ignore */ }
    })()
    return () => { alive = false }
  }, [mediaId])

  const startPlaying = () => {
    if (!mediaUrl || kind !== 'video') return
    setPlaying(true)
    requestAnimationFrame(() => {
      try {
        videoRef.current?.play().catch(() => { /* user gesture issue, ignored */ })
      } catch { /* ignore */ }
    })
  }

  // ─── GIF: autoplay inline, no chrome ─────────────────────────────
  if (kind === 'gif') {
    // Prefer the full URL so the GIF actually animates. Fall back to
    // thumb (a stillframe extract) only if the full URL hasn't
    // resolved yet so we don't show a blank frame on load.
    const src = mediaUrl || thumbUrl
    return (
      <div className="relative aspect-video rounded-xl overflow-hidden bg-black/50 border border-[var(--border)]">
        {src && (
          <img
            src={src}
            alt={filename}
            className="absolute inset-0 w-full h-full object-contain"
          />
        )}
        <div className="absolute bottom-2 left-2 px-1.5 py-0.5 rounded text-[9px] bg-black/60 text-white/80 font-mono uppercase tracking-wider">
          GIF
        </div>
      </div>
    )
  }

  // ─── Still image: show at full quality, no chrome ────────────────
  if (kind === 'image') {
    const src = mediaUrl || thumbUrl
    return (
      <div className="relative aspect-video rounded-xl overflow-hidden bg-black/50 border border-[var(--border)]">
        {src && (
          <img
            src={src}
            alt={filename}
            className="absolute inset-0 w-full h-full object-contain"
          />
        )}
      </div>
    )
  }

  // ─── Video: click-to-play with native controls ───────────────────
  return (
    <div className="relative aspect-video rounded-xl overflow-hidden bg-black/50 border border-[var(--border)] group">
      {thumbUrl && (
        <img
          src={thumbUrl}
          alt={filename}
          className={cn(
            'absolute inset-0 w-full h-full object-cover transition-opacity duration-200',
            playing ? 'opacity-0' : 'opacity-100',
          )}
        />
      )}
      {!playing && (
        <button
          onClick={startPlaying}
          disabled={!mediaUrl}
          className="absolute inset-0 w-full h-full flex items-center justify-center bg-black/0 hover:bg-black/30 transition-colors disabled:cursor-wait"
          aria-label={`Play ${filename}`}
        >
          <div className="size-16 rounded-full bg-black/70 backdrop-blur-sm flex items-center justify-center group-hover:bg-black/85 transition-colors border border-white/20">
            <Play size={28} className="text-white ml-1" fill="currentColor" />
          </div>
          <div className="absolute bottom-2 left-2 right-2 px-2 py-1 rounded text-[10px] bg-black/70 backdrop-blur-sm text-white/90 truncate text-left">
            Click to review with full timeline · {filename}
          </div>
        </button>
      )}
      {playing && mediaUrl && (
        <video
          ref={videoRef}
          src={mediaUrl}
          controls
          playsInline
          className="absolute inset-0 w-full h-full object-contain bg-black"
          onEnded={() => setPlaying(false)}
        />
      )}
    </div>
  )
}
