// File: src/renderer/components/MediaInfoModal.tsx
//
// Modal that displays detailed metadata + stats + tags for a single
// media item. Used by both App.tsx (right-click → "View info") and
// LibraryPage. Extracted from App.tsx as part of #48.

import { useEffect, useState } from 'react'
import { Eye, Heart, Info, Star, X } from 'lucide-react'
import type { MediaRow, MediaStatsRow, TagRow } from '../types'
import { formatBytes, formatDuration } from '../utils/formatters'
import { MediaNotesPanel } from './MediaNotesPanel'

export function MediaInfoModal({ media, onClose }: { media: MediaRow; onClose: () => void }) {
  const [stats, setStats] = useState<MediaStatsRow | null>(null)
  const [tags, setTags] = useState<TagRow[]>([])

  useEffect(() => {
    Promise.all([
      window.api.media?.getStats?.(media.id),
      window.api.tags?.getForMedia?.(media.id)
    ]).then(([s, t]) => {
      if (s) setStats(s as MediaStatsRow)
      if (t) setTags(t as TagRow[])
    })
  }, [media.id])

  const formatDate = (ms?: number | null) => {
    if (!ms) return '—'
    return new Date(ms).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const filename = media.path.split(/[/\\]/).pop() || media.path

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="media-info-title"
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-[var(--panel)] border border-[var(--border)] rounded-2xl w-full max-w-lg mx-4 shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)]">
          <div className="flex items-center gap-3">
            <Info size={18} className="text-[var(--primary)]" aria-hidden="true" />
            <h2 id="media-info-title" className="text-lg font-semibold">Media Info</h2>
          </div>
          <button
            onClick={onClose}
            aria-label="Close dialog"
            className="p-1.5 hover:bg-white/10 rounded-lg transition"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
          <div>
            <div className="text-xs text-[var(--muted)] uppercase tracking-wide mb-1">Filename</div>
            <div className="text-sm font-medium break-all">{filename}</div>
          </div>

          <div>
            <div className="text-xs text-[var(--muted)] uppercase tracking-wide mb-1">Full Path</div>
            <div className="text-xs text-white/70 break-all font-mono bg-black/30 rounded-lg px-3 py-2">
              {media.path}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-xs text-[var(--muted)] uppercase tracking-wide mb-1">Type</div>
              <div className="text-sm">{media.type.toUpperCase()}</div>
            </div>

            <div>
              <div className="text-xs text-[var(--muted)] uppercase tracking-wide mb-1">File Size</div>
              <div className="text-sm">{formatBytes(media.size)}</div>
            </div>

            {(media.width || media.height) && (
              <div>
                <div className="text-xs text-[var(--muted)] uppercase tracking-wide mb-1">Resolution</div>
                <div className="text-sm">{media.width || '?'} × {media.height || '?'}</div>
              </div>
            )}

            {media.type === 'video' && (
              <div>
                <div className="text-xs text-[var(--muted)] uppercase tracking-wide mb-1">Duration</div>
                <div className="text-sm">{formatDuration(media.durationSec)}</div>
              </div>
            )}

            <div>
              <div className="text-xs text-[var(--muted)] uppercase tracking-wide mb-1">Date Added</div>
              <div className="text-sm">{formatDate(media.addedAt)}</div>
            </div>

            <div>
              <div className="text-xs text-[var(--muted)] uppercase tracking-wide mb-1">File Modified</div>
              <div className="text-sm">{formatDate(media.mtimeMs)}</div>
            </div>
          </div>

          {stats && (
            <div className="pt-3 border-t border-[var(--border)]">
              <div className="text-xs text-[var(--muted)] uppercase tracking-wide mb-3">Statistics</div>
              <div className="grid grid-cols-3 gap-4">
                <div className="flex flex-col items-center p-3 bg-black/20 rounded-xl">
                  <Star size={16} className={stats.rating ? 'text-yellow-400' : 'text-white/30'} />
                  <div className="text-lg font-semibold mt-1">{stats.rating || 0}</div>
                  <div className="text-xs text-[var(--muted)]">Rating</div>
                </div>

                <div className="flex flex-col items-center p-3 bg-black/20 rounded-xl">
                  <Eye size={16} className="text-blue-400" />
                  <div className="text-lg font-semibold mt-1">{stats.viewCount || 0}</div>
                  <div className="text-xs text-[var(--muted)]">Views</div>
                </div>

                <div className="flex flex-col items-center p-3 bg-black/20 rounded-xl">
                  <Heart size={16} className="text-pink-400" />
                  <div className="text-lg font-semibold mt-1">{stats.oCount || 0}</div>
                  <div className="text-xs text-[var(--muted)]">O's</div>
                </div>
              </div>

              {stats.lastViewedAt && (
                <div className="mt-3 text-center">
                  <span className="text-xs text-[var(--muted)]">Last viewed: </span>
                  <span className="text-xs">{formatDate(stats.lastViewedAt)}</span>
                </div>
              )}
            </div>
          )}

          {tags.length > 0 && (
            <div className="pt-3 border-t border-[var(--border)]">
              <div className="text-xs text-[var(--muted)] uppercase tracking-wide mb-2">Tags</div>
              <div className="flex flex-wrap gap-1.5">
                {tags.map(tag => (
                  <span
                    key={tag.id}
                    className="px-2 py-1 text-xs rounded-lg bg-[var(--primary)]/20 text-[var(--primary)] border border-[var(--primary)]/30"
                  >
                    {tag.name}
                  </span>
                ))}
              </div>
            </div>
          )}

          {media.hashSha256 && (
            <div className="pt-3 border-t border-[var(--border)]">
              <div className="text-xs text-[var(--muted)] uppercase tracking-wide mb-1">SHA-256 Hash</div>
              <div className="text-[10px] text-white/50 break-all font-mono bg-black/30 rounded-lg px-3 py-2">
                {media.hashSha256}
              </div>
            </div>
          )}

          <div className="pt-3 border-t border-[var(--border)]">
            <MediaNotesPanel mediaId={media.id} />
          </div>
        </div>
      </div>
    </div>
  )
}
