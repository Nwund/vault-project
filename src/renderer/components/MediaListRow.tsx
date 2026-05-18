// File: src/renderer/components/MediaListRow.tsx
//
// #153 — Notion-style dense list row for Library list-view. Renders
// each media item as a single horizontal row: thumb (left), filename
// + tags (middle), metadata columns (right). One-line, hover-
// highlightable, click-to-open + right-click → context menu.
//
// Designed to match the existing MediaTile interaction surface so the
// LibraryPage swap is local-only (just pick row vs tile per layout).

import React, { memo, useMemo } from 'react'
import { Film, Image as ImageIcon, FileVideo, Star, Heart, Clock } from 'lucide-react'
import { toFileUrlCached } from '../hooks/usePerformance'
import { formatDuration, formatBytes } from '../utils/formatters'

interface MediaRowLike {
  id: string
  filename?: string
  thumbPath?: string | null
  type: string
  rating?: number
  durationSec?: number | null
  sizeBytes?: number | null
  addedAt?: number | null
  tags?: Array<{ name: string }>
}

interface Props {
  media: MediaRowLike
  selected?: boolean
  isPlaying?: boolean
  onClick?: () => void
  onDoubleClick?: () => void
  onContextMenu?: (e: React.MouseEvent) => void
  /** Optional callback used by selection mode. */
  onToggleSelect?: () => void
  selectionMode?: boolean
}

function bytesToHuman(b: number | null | undefined): string {
  if (!b || b <= 0) return '—'
  return formatBytes(b)
}

function dateShort(ts: number | null | undefined): string {
  if (!ts) return ''
  const d = new Date(ts)
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: '2-digit' })
}

export const MediaListRow = memo(function MediaListRow({
  media, selected, isPlaying, onClick, onDoubleClick, onContextMenu, onToggleSelect, selectionMode,
}: Props) {
  const thumbUrl = useThumbUrl(media.thumbPath)
  const TypeIcon = media.type === 'video' ? Film : media.type === 'image' ? ImageIcon : FileVideo

  // Cap visible tags to 5 to keep rows compact; the rest hide in a tooltip.
  const tagText = useMemo(() => {
    const tags = media.tags ?? []
    if (tags.length === 0) return ''
    const visible = tags.slice(0, 5).map((t) => t.name).join(' · ')
    return tags.length > 5 ? `${visible} +${tags.length - 5}` : visible
  }, [media.tags])

  return (
    <div
      onClick={selectionMode ? onToggleSelect : onClick}
      onDoubleClick={onDoubleClick}
      onContextMenu={onContextMenu}
      className={
        'group flex items-center gap-3 px-2 py-1.5 rounded-md cursor-pointer transition select-none ' +
        (selected
          ? 'bg-[var(--primary)]/20 ring-1 ring-[var(--primary)]/40 '
          : isPlaying
            ? 'bg-emerald-500/10 '
            : 'hover:bg-white/[0.04] ')
      }
    >
      {/* Thumb */}
      <div className="relative flex-shrink-0 w-20 h-12 rounded overflow-hidden bg-black/40 border border-white/5">
        {thumbUrl ? (
          <img src={thumbUrl} alt="" className="absolute inset-0 w-full h-full object-cover" loading="lazy" draggable={false} />
        ) : (
          <div className="absolute inset-0 grid place-items-center text-zinc-700">
            <TypeIcon size={16} />
          </div>
        )}
        {media.type === 'video' && media.durationSec ? (
          <span className="absolute right-1 bottom-0.5 text-[9px] px-1 rounded bg-black/70 text-white">
            {formatDuration(media.durationSec)}
          </span>
        ) : null}
      </div>

      {/* Filename + tags */}
      <div className="min-w-0 flex-1">
        <div className="text-sm truncate">{media.filename ?? media.id}</div>
        {tagText && (
          <div className="text-[11px] text-zinc-500 truncate" title={tagText}>{tagText}</div>
        )}
      </div>

      {/* Right-side metadata columns. Stay hidden on narrow widths. */}
      <div className="hidden md:flex items-center gap-4 text-xs text-zinc-400">
        {typeof media.rating === 'number' && media.rating > 0 && (
          <span className="flex items-center gap-0.5">
            <Star size={12} className="text-amber-400 fill-amber-400" />
            {media.rating.toFixed(1)}
          </span>
        )}
        <span className="w-16 text-right tabular-nums">{bytesToHuman(media.sizeBytes ?? null)}</span>
        <span className="w-16 text-right tabular-nums flex items-center gap-1 justify-end">
          <Clock size={11} className="opacity-50" />
          {dateShort(media.addedAt ?? null)}
        </span>
      </div>
    </div>
  )
})

function useThumbUrl(thumbPath: string | null | undefined): string | null {
  const [url, setUrl] = React.useState<string | null>(null)
  React.useEffect(() => {
    let cancelled = false
    if (!thumbPath) { setUrl(null); return }
    toFileUrlCached(thumbPath)
      .then((u) => { if (!cancelled) setUrl(u) })
      .catch(() => { if (!cancelled) setUrl(null) })
    return () => { cancelled = true }
  }, [thumbPath])
  return url
}
