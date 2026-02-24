// File: src/renderer/components/Skeleton.tsx
// Reusable skeleton loading components for smooth loading states

import React from 'react'

interface SkeletonProps {
  className?: string
  variant?: 'rect' | 'circle' | 'text'
  width?: string | number
  height?: string | number
  animate?: boolean
}

export const Skeleton: React.FC<SkeletonProps> = ({
  className = '',
  variant = 'rect',
  width,
  height,
  animate = true
}) => {
  const baseStyles = `bg-white/5 ${animate ? 'skeleton-shimmer' : ''}`
  const variantStyles = {
    rect: 'rounded-lg',
    circle: 'rounded-full',
    text: 'rounded h-4'
  }

  const style: React.CSSProperties = {}
  if (width) style.width = typeof width === 'number' ? `${width}px` : width
  if (height) style.height = typeof height === 'number' ? `${height}px` : height

  return (
    <div
      className={`${baseStyles} ${variantStyles[variant]} ${className}`}
      style={style}
    />
  )
}

// Media card skeleton - matches the appearance of media tiles
export const MediaCardSkeleton: React.FC<{ className?: string }> = ({ className = '' }) => (
  <div className={`group relative rounded-xl overflow-hidden bg-[var(--card)] border border-white/5 ${className}`}>
    <div className="aspect-video bg-white/5 sexy-shimmer" />
    <div className="p-2 space-y-2">
      <Skeleton height={14} className="w-3/4" />
      <Skeleton height={10} className="w-1/2" />
    </div>
  </div>
)

// Grid of media card skeletons
export const MediaGridSkeleton: React.FC<{ count?: number; columns?: number }> = ({
  count = 12,
  columns = 4
}) => (
  <div
    className="grid gap-4"
    style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
  >
    {Array.from({ length: count }).map((_, i) => (
      <MediaCardSkeleton key={i} />
    ))}
  </div>
)

// Horizontal scroll row skeleton - for dashboard sections
export const MediaRowSkeleton: React.FC<{ count?: number; title?: boolean }> = ({
  count = 6,
  title = true
}) => (
  <div className="space-y-3">
    {title && <Skeleton height={24} className="w-40" />}
    <div className="flex gap-4 overflow-hidden">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex-shrink-0 w-48">
          <div className="aspect-video rounded-lg bg-white/5 sexy-shimmer" />
          <div className="mt-2 space-y-1">
            <Skeleton height={12} className="w-4/5" />
            <Skeleton height={10} className="w-3/5" />
          </div>
        </div>
      ))}
    </div>
  </div>
)

// List item skeleton - for sidebar or list views
export const ListItemSkeleton: React.FC<{ avatar?: boolean }> = ({ avatar = false }) => (
  <div className="flex items-center gap-3 p-3 rounded-lg bg-white/5">
    {avatar && <Skeleton variant="circle" width={40} height={40} />}
    <div className="flex-1 space-y-2">
      <Skeleton height={14} className="w-3/4" />
      <Skeleton height={10} className="w-1/2" />
    </div>
  </div>
)

// Tag skeleton - for tag chips
export const TagSkeleton: React.FC = () => (
  <Skeleton height={24} className="w-16 rounded-full" />
)

// Tags row skeleton
export const TagsRowSkeleton: React.FC<{ count?: number }> = ({ count = 8 }) => (
  <div className="flex flex-wrap gap-2">
    {Array.from({ length: count }).map((_, i) => (
      <TagSkeleton key={i} />
    ))}
  </div>
)

// Stats card skeleton - for dashboard stats
export const StatCardSkeleton: React.FC = () => (
  <div className="bg-white/5 rounded-xl p-4 space-y-2">
    <Skeleton height={12} className="w-20" />
    <Skeleton height={32} className="w-16" />
    <Skeleton height={10} className="w-24" />
  </div>
)

// Feed item skeleton - for vertical feed view
export const FeedItemSkeleton: React.FC = () => (
  <div className="w-full max-w-md mx-auto">
    <div className="aspect-[9/16] rounded-2xl bg-white/5 sexy-shimmer" />
    <div className="mt-3 space-y-2">
      <Skeleton height={16} className="w-3/4" />
      <Skeleton height={12} className="w-1/2" />
    </div>
  </div>
)

// Panel skeleton - for sidebar panels
export const PanelSkeleton: React.FC<{ rows?: number }> = ({ rows = 5 }) => (
  <div className="space-y-3 p-4">
    <Skeleton height={20} className="w-32 mb-4" />
    {Array.from({ length: rows }).map((_, i) => (
      <ListItemSkeleton key={i} />
    ))}
  </div>
)

// Full page loading skeleton
export const PageSkeleton: React.FC = () => (
  <div className="p-6 space-y-6">
    <div className="flex items-center justify-between">
      <Skeleton height={32} className="w-48" />
      <div className="flex gap-2">
        <Skeleton height={36} className="w-24 rounded-lg" />
        <Skeleton height={36} className="w-24 rounded-lg" />
      </div>
    </div>
    <MediaGridSkeleton count={12} columns={4} />
  </div>
)

export default Skeleton
