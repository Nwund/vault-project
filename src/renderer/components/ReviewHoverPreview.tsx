// File: src/renderer/components/ReviewHoverPreview.tsx
//
// AI Review media preview. Switched from hover-to-play to
// click-to-play in v2.8.4 because hover-preview made it impossible to
// pause + scrub through the video — exactly what a reviewer needs to
// verify a tag against a specific moment.
//
// Behavior:
//   - Renders the still thumbnail by default (click to start playing).
//   - On click: swaps to a <video> with native controls so the
//     reviewer can pause, scrub the timeline, seek frame-by-frame.
//   - Auto-pauses when the selected review item changes (so switching
//     items doesn't leave audio playing in the background).
//   - Component name kept for back-compat with imports; functionally
//     it's now ReviewClickToPlay.

import { useEffect, useRef, useState } from 'react'
import { Play } from 'lucide-react'
import { toFileUrlCached } from '../hooks/usePerformance'
import { cn } from '../utils/cn'

export function ReviewHoverPreview({
  mediaId,
  thumbPath,
  filename,
}: {
  mediaId: string
  thumbPath?: string | null
  filename: string
}) {
  const [thumbUrl, setThumbUrl] = useState<string>('')
  const [videoUrl, setVideoUrl] = useState<string>('')
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

  // Resolve thumbnail URL — uses cached one if available, generates
  // on demand otherwise.
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

  // Resolve playable URL up-front so click-to-play has zero latency.
  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const u = await window.api.media.getPlayableUrl(mediaId, false)
        if (alive && u) setVideoUrl(u as string)
      } catch { /* ignore */ }
    })()
    return () => { alive = false }
  }, [mediaId])

  const startPlaying = () => {
    if (!videoUrl) return
    setPlaying(true)
    // play() must run AFTER the <video> is in the DOM with src set.
    // requestAnimationFrame gives React one tick to swap the element.
    requestAnimationFrame(() => {
      try {
        videoRef.current?.play().catch(() => { /* user gesture issue, ignored */ })
      } catch { /* ignore */ }
    })
  }

  return (
    <div className="relative aspect-video rounded-xl overflow-hidden bg-black/50 border border-[var(--border)] group">
      {/* Thumbnail view — clickable to start playback. Stays mounted
          underneath the video so video load doesn't flash black. */}
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
      {/* Click-to-play overlay — only shown when not playing. Big
          centered play button + filename overlay. */}
      {!playing && (
        <button
          onClick={startPlaying}
          disabled={!videoUrl}
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
      {/* Native video element with controls — pause / scrub / seek.
          Mounted with src ONLY when playing so background-tab cost
          stays zero when the user just glances at the thumb. */}
      {playing && videoUrl && (
        <video
          ref={videoRef}
          src={videoUrl}
          controls
          playsInline
          className="absolute inset-0 w-full h-full object-contain bg-black"
          onEnded={() => setPlaying(false)}
        />
      )}
    </div>
  )
}
