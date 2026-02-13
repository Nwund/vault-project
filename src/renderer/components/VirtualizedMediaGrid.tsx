// File: src/renderer/components/VirtualizedMediaGrid.tsx
// Virtualized media grid for performance with large libraries

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react'
const { Grid: FixedSizeGrid } = require('react-window') as any

// Inline type to avoid import issues
interface GridChildComponentProps {
  columnIndex: number
  rowIndex: number
  style: React.CSSProperties
}
import { useLazyLoad, toFileUrlCached } from '../hooks/usePerformance'
import { formatDuration, formatBytes } from '../utils/formatters'

type MediaRow = {
  id: string
  path: string
  type: 'video' | 'image'
  sizeBytes?: number
  durationSec?: number | null
  thumbPath?: string | null
}

interface VirtualizedMediaGridProps {
  items: MediaRow[]
  columnWidth?: number
  rowHeight?: number
  gap?: number
  onItemClick: (item: MediaRow) => void
  onItemDoubleClick?: (item: MediaRow) => void
  onItemContextMenu?: (item: MediaRow, event: React.MouseEvent) => void
  selectedIds?: string[]
  onToggleSelect?: (id: string) => void
}

// Lazy loading thumbnail component with progressive blur-to-sharp loading
const LazyThumbnail: React.FC<{ thumbPath: string | null | undefined }> = ({ thumbPath }) => {
  const [ref, isVisible] = useLazyLoad('300px')
  const [url, setUrl] = useState<string>('')
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState(false)

  useEffect(() => {
    if (!isVisible || !thumbPath) return

    let alive = true
    toFileUrlCached(thumbPath).then(u => {
      if (alive) setUrl(u)
    })
    return () => { alive = false }
  }, [isVisible, thumbPath])

  return (
    <div ref={ref} className="w-full h-full bg-black/25 relative overflow-hidden contain-strict">
      {!thumbPath ? (
        <div className="w-full h-full flex items-center justify-center text-[var(--muted)] text-2xl">
          🎬
        </div>
      ) : !isVisible ? (
        <div className="w-full h-full sexy-shimmer bg-white/5" />
      ) : error ? (
        <div className="w-full h-full flex items-center justify-center text-[var(--muted)] text-2xl">
          🖼️
        </div>
      ) : (
        <>
          {/* Blur placeholder while loading */}
          {!loaded && (
            <div className="absolute inset-0 sexy-shimmer" />
          )}
          {url && (
            <img
              src={url}
              alt=""
              loading="lazy"
              decoding="async"
              className="w-full h-full object-cover gpu-accelerated"
              style={{
                opacity: loaded ? 1 : 0,
                filter: loaded ? 'none' : 'blur(10px)',
                transform: loaded ? 'scale(1)' : 'scale(1.1)',
                transition: 'opacity 0.3s ease-out, filter 0.4s ease-out, transform 0.4s ease-out'
              }}
              onLoad={() => setLoaded(true)}
              onError={() => setError(true)}
            />
          )}
        </>
      )}
    </div>
  )
}

// Individual media tile - memoized with CSS containment for performance
const MediaTile = React.memo<{
  media: MediaRow
  selected: boolean
  onClick: () => void
  onDoubleClick?: () => void
  onContextMenu?: (e: React.MouseEvent) => void
  onToggleSelect: () => void
}>(({ media, selected, onClick, onDoubleClick, onContextMenu, onToggleSelect }) => {
  return (
    <div
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onContextMenu={onContextMenu}
      className={`
        text-left rounded-2xl border bg-black/20 hover:border-white/15
        transition overflow-hidden relative cursor-pointer h-full
        contain-layout media-tile-glow
        ${selected ? 'border-white/25 ring-2 ring-[var(--primary)]/30' : 'border-[var(--border)]'}
      `}
    >
      <div className="aspect-[16/10] relative overflow-hidden">
        <LazyThumbnail thumbPath={media.thumbPath} />

        {media.type === 'video' && media.durationSec ? (
          <div className="absolute bottom-2 right-2 text-[10px] px-2 py-1 rounded-lg bg-black/60 border border-white/10">
            {formatDuration(media.durationSec)}
          </div>
        ) : null}

        <button
          onClick={(e) => {
            e.stopPropagation()
            onToggleSelect()
          }}
          className={`
            absolute top-2 left-2 px-3 py-2 rounded-xl text-xs border transition
            ${selected
              ? 'bg-white/15 hover:bg-white/20 border-white/20'
              : 'bg-black/20 hover:bg-white/5 border-[var(--border)] hover:border-white/15'}
          `}
        >
          {selected ? 'Selected' : 'Select'}
        </button>
      </div>

      <div className="p-3">
        <div className="text-sm font-medium truncate">
          {media.path.split(/[/\\]/).pop()}
        </div>
        <div className="mt-1 text-xs text-[var(--muted)] flex items-center justify-between">
          <span className="truncate">{media.type.toUpperCase()}</span>
          {typeof media.sizeBytes === 'number' && (
            <span className="ml-2">{formatBytes(media.sizeBytes)}</span>
          )}
        </div>
      </div>
    </div>
  )
}, (prev, next) => {
  return prev.media.id === next.media.id && prev.selected === next.selected
})

export const VirtualizedMediaGrid: React.FC<VirtualizedMediaGridProps> = ({
  items,
  columnWidth = 260,
  rowHeight = 220,
  gap = 16,
  onItemClick,
  onItemDoubleClick,
  onItemContextMenu,
  selectedIds = [],
  onToggleSelect
}) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 })

  // Measure container
  useEffect(() => {
    const updateSize = () => {
      if (containerRef.current) {
        setContainerSize({
          width: containerRef.current.offsetWidth,
          height: containerRef.current.offsetHeight
        })
      }
    }

    updateSize()
    const observer = new ResizeObserver(updateSize)
    if (containerRef.current) {
      observer.observe(containerRef.current)
    }

    return () => observer.disconnect()
  }, [])

  // Calculate grid dimensions
  const columnCount = Math.max(1, Math.floor((containerSize.width - gap) / (columnWidth + gap)))
  const rowCount = Math.ceil(items.length / columnCount)
  const actualColumnWidth = (containerSize.width - gap * (columnCount + 1)) / columnCount

  // Cell renderer
  const Cell = useCallback(({ columnIndex, rowIndex, style }: GridChildComponentProps) => {
    const index = rowIndex * columnCount + columnIndex
    const item = items[index]

    if (!item) return null

    const isSelected = selectedIds.includes(item.id)

    return (
      <div
        style={{
          ...style,
          left: Number(style.left) + gap,
          top: Number(style.top) + gap,
          width: Number(style.width) - gap,
          height: Number(style.height) - gap
        }}
      >
        <MediaTile
          media={item}
          selected={isSelected}
          onClick={() => onItemClick(item)}
          onDoubleClick={onItemDoubleClick ? () => onItemDoubleClick(item) : undefined}
          onContextMenu={onItemContextMenu ? (e) => onItemContextMenu(item, e) : undefined}
          onToggleSelect={() => onToggleSelect?.(item.id)}
        />
      </div>
    )
  }, [items, columnCount, selectedIds, onItemClick, onItemDoubleClick, onItemContextMenu, onToggleSelect, gap])

  if (containerSize.width === 0) {
    return <div ref={containerRef} className="w-full h-full" />
  }

  return (
    <div ref={containerRef} className="w-full h-full">
      <FixedSizeGrid
        columnCount={columnCount}
        columnWidth={actualColumnWidth + gap}
        height={containerSize.height}
        rowCount={rowCount}
        rowHeight={rowHeight + gap}
        width={containerSize.width}
        overscanRowCount={4}
      >
        {Cell as any}
      </FixedSizeGrid>
    </div>
  )
}

export default VirtualizedMediaGrid
