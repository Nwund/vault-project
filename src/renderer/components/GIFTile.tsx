// File: src/renderer/components/GIFTile.tsx
//
// Animated GIF tile — shows the static thumbnail by default, swaps in the
// full animated GIF on hover. Extracted from App.tsx as part of #48.

import { useEffect, useState } from 'react'
import { toFileUrlCached } from '../hooks/usePerformance'
import { cn } from '../utils/cn'

interface GifMediaLike {
  id: string
  path: string
  thumbPath?: string | null
  filename: string
  width?: number | null
  height?: number | null
}

export function GIFTile(props: {
  gif: GifMediaLike
  isPreview: boolean
  onHover: () => void
  onLeave: () => void
  viewMode: 'grid' | 'mosaic'
}) {
  const { gif, isPreview, onHover, onLeave, viewMode } = props
  const [url, setUrl] = useState('')
  const [thumbUrl, setThumbUrl] = useState('')

  useEffect(() => {
    let alive = true
    ;(async () => {
      if (gif.thumbPath) {
        const t = await toFileUrlCached(gif.thumbPath)
        if (alive) setThumbUrl(t)
      }
      const u = await toFileUrlCached(gif.path)
      if (alive) setUrl(u)
    })()
    return () => { alive = false }
  }, [gif.id, gif.path, gif.thumbPath])

  return (
    <div
      onMouseEnter={onHover}
      onMouseLeave={onLeave}
      className={cn(
        'relative group rounded-xl overflow-hidden border border-[var(--border)] hover:border-[var(--primary)] transition-all cursor-pointer',
        viewMode === 'mosaic' ? 'break-inside-avoid mb-3' : '',
      )}
    >
      <div className={cn(viewMode === 'grid' ? 'aspect-square' : '')}>
        <img
          src={isPreview ? url : (thumbUrl || url)}
          alt={gif.filename}
          className="w-full h-full object-cover"
          loading="lazy"
        />
      </div>

      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
        <div className="absolute bottom-0 left-0 right-0 p-3">
          <div className="text-xs font-medium truncate">{gif.filename}</div>
          {gif.width && gif.height && (
            <div className="text-[10px] text-[var(--muted)] mt-0.5">
              {gif.width} × {gif.height}
            </div>
          )}
        </div>
      </div>

      {isPreview && (
        <div className="absolute top-2 right-2 px-2 py-1 rounded-full bg-[var(--primary)] text-[10px] font-medium">
          Playing
        </div>
      )}
    </div>
  )
}
