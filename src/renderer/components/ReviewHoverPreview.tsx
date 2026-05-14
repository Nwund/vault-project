// File: src/renderer/components/ReviewHoverPreview.tsx
//
// Hover-preview thumbnail used in the AI Tools → Review queue. Renders
// the still thumb until the user hovers, then plays a short clipped
// video preview (audio unmuted — they're reviewing accuracy and sound
// is part of the signal). Extracted from App.tsx as part of #48.

import { useEffect, useState } from 'react'
import { useVideoPreview } from '../hooks/useVideoPreview'
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

  const { videoRef, isPlaying, handleMouseEnter, handleMouseLeave } = useVideoPreview({
    clipDuration: 2,
    clipCount: 4,
    hoverDelay: 400,
    muted: false,
    autoPlay: false,
  })

  return (
    <div
      className="relative aspect-video rounded-xl overflow-hidden bg-black/50 border border-[var(--border)]"
      onMouseEnter={() => { if (videoUrl) handleMouseEnter(videoUrl) }}
      onMouseLeave={handleMouseLeave}
    >
      {thumbUrl && (
        <img
          src={thumbUrl}
          alt={filename}
          className={cn(
            'absolute inset-0 w-full h-full object-cover transition-opacity duration-300',
            isPlaying ? 'opacity-0' : 'opacity-100',
          )}
        />
      )}
      <video
        ref={videoRef}
        className={cn(
          'absolute inset-0 w-full h-full object-cover transition-opacity duration-300 pointer-events-none',
          isPlaying ? 'opacity-100' : 'opacity-0',
        )}
        playsInline
      />
      {!isPlaying && (
        <div className="absolute bottom-2 left-2 px-2 py-0.5 rounded text-[11px] bg-black/60 backdrop-blur-sm text-white/80 pointer-events-none">
          Hover to preview
        </div>
      )}
    </div>
  )
}
