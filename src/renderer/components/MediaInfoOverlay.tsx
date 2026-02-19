// File: src/renderer/components/MediaInfoOverlay.tsx
// Detailed media information overlay panel

import React, { useState, useEffect, useMemo } from 'react'
import {
  Info,
  X,
  Film,
  Image,
  Clock,
  Calendar,
  Eye,
  Star,
  Heart,
  Tag,
  HardDrive,
  FileText,
  Hash,
  Maximize2,
  Layers,
  Copy,
  ExternalLink,
  Check,
  Folder
} from 'lucide-react'
import { formatDuration } from '../utils/formatters'

interface MediaInfo {
  id: string
  filename: string
  path: string
  type: 'video' | 'image' | 'gif'
  durationSec: number | null
  sizeBytes: number | null
  width: number | null
  height: number | null
  fps: number | null
  codec: string | null
  bitrate: number | null
  addedAt: number
  lastViewedAt: number | null
  viewCount: number
  rating: number | null
  isFavorite: boolean
  tags: string[]
  hash: string | null
}

interface MediaInfoOverlayProps {
  media: MediaInfo
  onClose: () => void
  onOpenFolder?: () => void
  onEditTags?: () => void
  className?: string
}

export function MediaInfoOverlay({
  media,
  onClose,
  onOpenFolder,
  onEditTags,
  className = ''
}: MediaInfoOverlayProps) {
  const [copied, setCopied] = useState<string | null>(null)

  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text)
    setCopied(field)
    setTimeout(() => setCopied(null), 2000)
  }

  // Format file size
  const formatSize = (bytes: number | null): string => {
    if (!bytes) return 'Unknown'
    const units = ['B', 'KB', 'MB', 'GB']
    let size = bytes
    let unitIndex = 0
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024
      unitIndex++
    }
    return `${size.toFixed(2)} ${units[unitIndex]}`
  }

  // Format date
  const formatDate = (timestamp: number): string => {
    return new Date(timestamp).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  // Format bitrate
  const formatBitrate = (bitrate: number | null): string => {
    if (!bitrate) return 'Unknown'
    if (bitrate >= 1000000) {
      return `${(bitrate / 1000000).toFixed(1)} Mbps`
    }
    return `${(bitrate / 1000).toFixed(0)} Kbps`
  }

  // Get media type icon
  const TypeIcon = media.type === 'video' ? Film : Image

  return (
    <div className={`bg-zinc-900/95 backdrop-blur-xl rounded-2xl border border-zinc-700 shadow-2xl overflow-hidden ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-zinc-800 flex items-center justify-center">
            <Info size={20} className="text-[var(--primary)]" />
          </div>
          <div>
            <h2 className="font-semibold">Media Info</h2>
            <p className="text-xs text-zinc-400 truncate max-w-[200px]">{media.filename}</p>
          </div>
        </div>
        <button onClick={onClose} className="p-2 rounded-lg hover:bg-zinc-800 transition">
          <X size={18} />
        </button>
      </div>

      <div className="p-5 space-y-4 max-h-[60vh] overflow-y-auto">
        {/* Basic info */}
        <InfoSection title="Basic">
          <InfoRow
            icon={TypeIcon}
            label="Type"
            value={media.type.charAt(0).toUpperCase() + media.type.slice(1)}
          />
          <InfoRow
            icon={FileText}
            label="Filename"
            value={media.filename}
            copyable
            onCopy={() => copyToClipboard(media.filename, 'filename')}
            copied={copied === 'filename'}
          />
          <InfoRow
            icon={Folder}
            label="Path"
            value={media.path}
            copyable
            onCopy={() => copyToClipboard(media.path, 'path')}
            copied={copied === 'path'}
            truncate
          />
          <InfoRow
            icon={HardDrive}
            label="Size"
            value={formatSize(media.sizeBytes)}
          />
        </InfoSection>

        {/* Media properties */}
        <InfoSection title="Properties">
          {media.width && media.height && (
            <InfoRow
              icon={Maximize2}
              label="Resolution"
              value={`${media.width} × ${media.height}`}
            />
          )}
          {media.type === 'video' && media.durationSec && (
            <InfoRow
              icon={Clock}
              label="Duration"
              value={formatDuration(media.durationSec)}
            />
          )}
          {media.fps && (
            <InfoRow
              icon={Layers}
              label="Frame Rate"
              value={`${media.fps.toFixed(2)} fps`}
            />
          )}
          {media.codec && (
            <InfoRow
              icon={Film}
              label="Codec"
              value={media.codec}
            />
          )}
          {media.bitrate && (
            <InfoRow
              icon={Hash}
              label="Bitrate"
              value={formatBitrate(media.bitrate)}
            />
          )}
        </InfoSection>

        {/* Activity */}
        <InfoSection title="Activity">
          <InfoRow
            icon={Calendar}
            label="Added"
            value={formatDate(media.addedAt)}
          />
          {media.lastViewedAt && (
            <InfoRow
              icon={Eye}
              label="Last Viewed"
              value={formatDate(media.lastViewedAt)}
            />
          )}
          <InfoRow
            icon={Eye}
            label="View Count"
            value={media.viewCount.toString()}
          />
          {media.rating !== null && media.rating > 0 && (
            <InfoRow
              icon={Star}
              label="Rating"
              value={
                <div className="flex items-center gap-1">
                  {[1, 2, 3, 4, 5].map(star => (
                    <Star
                      key={star}
                      size={12}
                      className={star <= media.rating! ? 'text-amber-400' : 'text-zinc-600'}
                      fill={star <= media.rating! ? 'currentColor' : 'none'}
                    />
                  ))}
                </div>
              }
            />
          )}
          {media.isFavorite && (
            <InfoRow
              icon={Heart}
              label="Favorite"
              value={<Heart size={14} className="text-pink-400" fill="currentColor" />}
            />
          )}
        </InfoSection>

        {/* Tags */}
        {media.tags.length > 0 && (
          <InfoSection title="Tags">
            <div className="flex flex-wrap gap-1">
              {media.tags.map(tag => (
                <span
                  key={tag}
                  className="px-2 py-0.5 rounded-full bg-zinc-800 text-xs text-zinc-300"
                >
                  {tag}
                </span>
              ))}
            </div>
          </InfoSection>
        )}

        {/* Technical */}
        {media.hash && (
          <InfoSection title="Technical">
            <InfoRow
              icon={Hash}
              label="Hash"
              value={media.hash.substring(0, 16) + '...'}
              copyable
              onCopy={() => copyToClipboard(media.hash!, 'hash')}
              copied={copied === 'hash'}
            />
            <InfoRow
              icon={Hash}
              label="ID"
              value={media.id}
              copyable
              onCopy={() => copyToClipboard(media.id, 'id')}
              copied={copied === 'id'}
            />
          </InfoSection>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-2 px-5 pb-5">
        {onOpenFolder && (
          <button
            onClick={onOpenFolder}
            className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 transition text-sm"
          >
            <Folder size={14} />
            Open Folder
          </button>
        )}
        {onEditTags && (
          <button
            onClick={onEditTags}
            className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 transition text-sm"
          >
            <Tag size={14} />
            Edit Tags
          </button>
        )}
      </div>
    </div>
  )
}

// Section component
function InfoSection({
  title,
  children
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-2">
      <h3 className="text-xs font-medium text-zinc-500 uppercase tracking-wide">{title}</h3>
      <div className="space-y-1">{children}</div>
    </div>
  )
}

// Row component
function InfoRow({
  icon: Icon,
  label,
  value,
  copyable,
  onCopy,
  copied,
  truncate
}: {
  icon: React.ElementType
  label: string
  value: React.ReactNode
  copyable?: boolean
  onCopy?: () => void
  copied?: boolean
  truncate?: boolean
}) {
  return (
    <div className="flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-zinc-800/50 group">
      <div className="flex items-center gap-2 text-zinc-400">
        <Icon size={14} />
        <span className="text-sm">{label}</span>
      </div>
      <div className="flex items-center gap-2">
        <span className={`text-sm text-white ${truncate ? 'max-w-[150px] truncate' : ''}`}>
          {value}
        </span>
        {copyable && (
          <button
            onClick={onCopy}
            className="p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-zinc-700 transition"
            title="Copy"
          >
            {copied ? (
              <Check size={12} className="text-green-400" />
            ) : (
              <Copy size={12} className="text-zinc-400" />
            )}
          </button>
        )}
      </div>
    </div>
  )
}

// Quick info badge for thumbnails
export function QuickInfoBadge({
  duration,
  resolution,
  className = ''
}: {
  duration?: number | null
  resolution?: string
  className?: string
}) {
  return (
    <div className={`flex items-center gap-2 text-[10px] ${className}`}>
      {duration && (
        <span className="px-1.5 py-0.5 bg-black/70 rounded">
          {formatDuration(duration)}
        </span>
      )}
      {resolution && (
        <span className="px-1.5 py-0.5 bg-black/70 rounded">
          {resolution}
        </span>
      )}
    </div>
  )
}

// Info button for media cards
export function InfoButton({
  onClick,
  className = ''
}: {
  onClick: () => void
  className?: string
}) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
      className={`p-1.5 rounded-lg bg-black/50 hover:bg-black/70 transition text-white ${className}`}
      title="Show info"
    >
      <Info size={14} />
    </button>
  )
}

export default MediaInfoOverlay
