// File: src/renderer/components/MediaInfoModal.tsx
//
// Modal that displays detailed metadata + stats + tags for a single
// media item. Used by both App.tsx (right-click → "View info") and
// LibraryPage. Extracted from App.tsx as part of #48.

import { useEffect, useState, useCallback } from 'react'
import { Eye, Heart, Info, Star, X, Clock, EyeOff, ChevronDown, FileText } from 'lucide-react'
import type { MediaRow, MediaStatsRow, TagRow } from '../types'
import { formatBytes, formatDuration } from '../utils/formatters'
import { MediaNotesPanel } from './MediaNotesPanel'
import { BacklinksPanel } from './BacklinksPanel'
import { ModalShell } from './ModalShell'

export function MediaInfoModal({ media, onClose }: { media: MediaRow; onClose: () => void }) {
  const [stats, setStats] = useState<MediaStatsRow | null>(null)
  const [tags, setTags] = useState<TagRow[]>([])

  // v2.7 cross-cutting state: denial timer + featureLess flag for this item.
  const [denialStatus, setDenialStatus] = useState<{ active: boolean; until: number | null; remainingMs: number } | null>(null)
  const [featureLess, setFeatureLess] = useState<boolean | null>(null)


  useEffect(() => {
    Promise.all([
      window.api.media?.getStats?.(media.id),
      window.api.tags?.getForMedia?.(media.id)
    ]).then(([s, t]) => {
      if (s) setStats(s as MediaStatsRow)
      if (t) setTags(t as TagRow[])
    })
    // Probe the cross-cutting flags in parallel; both are tolerant of
    // missing rows ("not set" = null / false).
    window.api.tags?.denial?.status?.(media.id)?.then((r: any) => {
      if (r?.ok && r.status) setDenialStatus(r.status)
    }).catch(() => {})
    window.api.tags?.featureLess?.get?.(media.id)?.then((r: any) => {
      if (r?.ok) setFeatureLess(!!r.value)
    }).catch(() => {})
  }, [media.id])

  // Tick the denial countdown so the user sees the remaining time
  // shrink without re-opening the modal.
  useEffect(() => {
    if (!denialStatus?.active || !denialStatus.until) return
    const id = window.setInterval(() => {
      const remainingMs = denialStatus.until! - Date.now()
      if (remainingMs <= 0) {
        setDenialStatus({ active: false, until: null, remainingMs: 0 })
      } else {
        setDenialStatus({ ...denialStatus, remainingMs })
      }
    }, 1000)
    return () => clearInterval(id)
  }, [denialStatus])

  const onClearDenial = useCallback(async () => {
    await window.api.tags?.denial?.clear?.(media.id)
    setDenialStatus({ active: false, until: null, remainingMs: 0 })
  }, [media.id])

  const onToggleFeatureLess = useCallback(async () => {
    const next = !featureLess
    const res = await window.api.tags?.featureLess?.set?.({ mediaId: media.id, value: next })
    if (res?.ok) setFeatureLess(next)
  }, [media.id, featureLess])

  const formatRemaining = (ms: number): string => {
    if (ms <= 0) return 'now'
    const s = Math.floor(ms / 1000)
    if (s < 60) return `${s}s`
    if (s < 3600) return `${Math.floor(s / 60)}m ${s % 60}s`
    if (s < 86400) return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`
    return `${Math.floor(s / 86400)}d ${Math.floor((s % 86400) / 3600)}h`
  }

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
    <ModalShell open={true} onClose={onClose} maxWidth="lg" cardClassName="bg-[var(--panel)]">
      <div aria-labelledby="media-info-title">
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

          {/* v2.7 — Denial countdown + featureLess toggle row */}
          {(denialStatus?.active || featureLess) && (
            <div className="pt-3 border-t border-[var(--border)] flex flex-wrap items-center gap-2">
              {denialStatus?.active && (
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-red-500/10 border border-red-500/30">
                  <Clock size={11} className="text-red-300" />
                  <span className="text-[11px] text-red-200 font-medium tabular-nums">
                    Denied · {formatRemaining(denialStatus.remainingMs)} remaining
                  </span>
                  <button
                    onClick={onClearDenial}
                    className="text-[10px] text-red-300/80 hover:text-red-200 hover:underline ml-1"
                  >
                    clear
                  </button>
                </div>
              )}
              {featureLess && (
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-zinc-700/30 border border-zinc-600/40">
                  <EyeOff size={11} className="text-zinc-300" />
                  <span className="text-[11px] text-zinc-200">Featured less</span>
                </div>
              )}
            </div>
          )}

          {/* v2.7 — Feature-less toggle (always shown; shows current state) */}
          <div className="pt-3 border-t border-[var(--border)] flex items-center justify-between gap-3">
            <div>
              <div className="text-xs flex items-center gap-1.5">
                <EyeOff size={11} className="text-[var(--muted)]" />
                Feature less
              </div>
              <div className="text-[10px] text-[var(--muted)] mt-0.5">
                Hide this item from recommendation rails + random shuffle
              </div>
            </div>
            <button
              onClick={onToggleFeatureLess}
              role="switch"
              aria-checked={!!featureLess}
              className={`relative w-10 h-5 rounded-full transition-colors ${
                featureLess ? 'bg-zinc-500' : 'bg-zinc-800 border border-white/10'
              }`}
            >
              <span
                className={`absolute top-0.5 size-4 rounded-full bg-white transition-all ${
                  featureLess ? 'left-5' : 'left-0.5'
                }`}
              />
            </button>
          </div>

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

          <div className="pt-3 border-t border-[var(--border)]">
            <BacklinksPanel mediaId={media.id} />
          </div>

          {/* v2.7 — EXIF / metadata inspector. Lazy-fetched on expand
              via window.api.exif.read; useful for verifying camera
              metadata, embedded XMP tags, etc. */}
          <div className="pt-3 border-t border-[var(--border)]">
            <ExifSection filePath={media.path} />
          </div>
        </div>
      </div>
    </ModalShell>
  )
}

function ExifSection({ filePath }: { filePath: string }) {
  const [expanded, setExpanded] = useState(false)
  const [loading, setLoading] = useState(false)
  const [tags, setTags] = useState<Record<string, any> | null>(null)
  const [error, setError] = useState<string | null>(null)

  const onExpand = useCallback(async () => {
    const next = !expanded
    setExpanded(next)
    if (next && tags === null && !loading) {
      setLoading(true)
      setError(null)
      try {
        const res = await window.api.exif?.read?.(filePath)
        if (res?.ok && res.tags) {
          setTags(res.tags)
        } else {
          setError(res?.error ?? 'No EXIF tags found')
          setTags({})
        }
      } catch (e: any) {
        setError(e?.message ?? String(e))
        setTags({})
      } finally {
        setLoading(false)
      }
    }
  }, [expanded, tags, loading, filePath])

  const entries = tags ? Object.entries(tags).filter(([, v]) => v != null && v !== '') : []

  return (
    <div>
      <button
        type="button"
        onClick={onExpand}
        className="w-full flex items-center justify-between text-xs text-[var(--muted)] uppercase tracking-wide hover:text-white transition"
        aria-expanded={expanded}
      >
        <span className="flex items-center gap-1.5">
          <FileText size={11} />
          EXIF / Metadata
          {entries.length > 0 && (
            <span className="text-[10px] normal-case tracking-normal text-zinc-500">· {entries.length} tag{entries.length === 1 ? '' : 's'}</span>
          )}
        </span>
        <ChevronDown
          size={12}
          className={`transition-transform ${expanded ? 'rotate-180' : ''}`}
        />
      </button>
      {expanded && (
        <div className="mt-2">
          {loading && <div className="text-[11px] text-[var(--muted)] italic px-1 py-1">Reading EXIF…</div>}
          {error && <div className="text-[11px] text-red-300 px-1 py-1">{error}</div>}
          {entries.length > 0 && (
            <div className="max-h-48 overflow-y-auto space-y-0.5 pr-1 bg-black/30 rounded-lg p-2">
              {entries.map(([k, v]) => (
                <div key={k} className="flex items-start gap-2 text-[10px]">
                  <code className="text-[var(--muted)] font-mono w-32 flex-shrink-0 truncate" title={k}>{k}</code>
                  <span className="text-zinc-300 break-all flex-1 line-clamp-2 font-mono">
                    {typeof v === 'object' ? JSON.stringify(v) : String(v)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
