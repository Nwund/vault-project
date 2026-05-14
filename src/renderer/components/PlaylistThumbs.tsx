// File: src/renderer/components/PlaylistThumbs.tsx
//
// Three nearly-identical thumb components used by Sessions / Playlists
// (small thumb / list-row thumb / grid-card thumb). Extracted from
// App.tsx as part of #48 phase B. Each lazy-loads its image via
// toFileUrlCached, requests on-demand generation if no thumbPath, and
// shows a spinner while loading + a fallback when missing.

import { useState, useEffect } from 'react'
import { toFileUrlCached } from '../hooks/usePerformance'

// MediaRow is structurally shared with App.tsx; the loose shape here is
// enough for these thumbs and avoids a deeper type import.
type MediaRowLike = { id: string; path?: string; thumbPath?: string | null }

function useThumbUrl(thumbPath: string | null | undefined, mediaId: string | undefined) {
  const [url, setUrl] = useState('')
  const [error, setError] = useState(false)

  useEffect(() => {
    let alive = true
    setUrl('')
    setError(false)

    if (thumbPath) {
      toFileUrlCached(thumbPath)
        .then((u) => { if (alive) setUrl(u) })
        .catch(() => { if (alive) setError(true) })
    } else if (mediaId) {
      window.api.media.generateThumb(mediaId)
        .then((generatedPath: string | null) => {
          if (!alive || !generatedPath) {
            if (alive) setError(true)
            return
          }
          return toFileUrlCached(generatedPath)
        })
        .then((u?: string) => { if (alive && u) setUrl(u) })
        .catch(() => { if (alive) setError(true) })
    } else {
      setError(true)
    }

    return () => { alive = false }
  }, [thumbPath, mediaId])

  return { url, error }
}

export function SessionMediaThumb(props: { media: MediaRowLike }) {
  const { url, error } = useThumbUrl(props.media.thumbPath, props.media.id)
  return (
    <div className="aspect-video bg-black/30">
      {url ? (
        <img src={url} alt="" className="w-full h-full object-cover" />
      ) : error ? (
        <div className="w-full h-full flex items-center justify-center text-xs text-[var(--muted)]">No thumb</div>
      ) : (
        <div className="w-full h-full flex items-center justify-center">
          <div className="w-4 h-4 border-2 border-white/20 border-t-white/60 rounded-full animate-spin" />
        </div>
      )}
    </div>
  )
}

export function PlaylistItemThumb(props: { item: any }) {
  const item = props.item
  const mediaId = item.media?.id ?? item.mediaId ?? item.id
  const thumbPath = item.media?.thumbPath ?? item.thumbPath
  const { url, error } = useThumbUrl(thumbPath, mediaId)
  return (
    <div className="w-16 h-10 rounded-lg bg-black/30 overflow-hidden flex-shrink-0">
      {url ? (
        <img src={url} alt="" className="w-full h-full object-cover" />
      ) : error ? (
        <div className="w-full h-full flex items-center justify-center text-xs text-[var(--muted)]" />
      ) : (
        <div className="w-full h-full flex items-center justify-center">
          <div className="w-3 h-3 border border-white/20 border-t-white/60 rounded-full animate-spin" />
        </div>
      )}
    </div>
  )
}

export function PlaylistGridThumb(props: { item: any }) {
  const item = props.item
  const mediaId = item.media?.id ?? item.mediaId ?? item.id
  const thumbPath = item.media?.thumbPath ?? item.thumbPath
  const { url, error } = useThumbUrl(thumbPath, mediaId)
  return (
    <div className="bg-black/30 overflow-hidden" style={{ aspectRatio: '16 / 10' }}>
      {url ? (
        <img
          src={url}
          alt=""
          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-110"
        />
      ) : error ? (
        <div className="w-full h-full flex items-center justify-center text-2xl opacity-30">🎬</div>
      ) : (
        <div className="w-full h-full flex items-center justify-center">
          <div className="w-6 h-6 border-2 border-white/20 border-t-white/60 rounded-full animate-spin" />
        </div>
      )}
    </div>
  )
}
