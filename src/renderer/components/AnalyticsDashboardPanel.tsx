// File: src/renderer/components/AnalyticsDashboardPanel.tsx
//
// Personal analytics dashboard — reads from existing advancedStats:*
// IPCs (no new data collection). Pure-SVG charts (no uPlot dep) so
// the bundle stays lean.
//
// Surfaces:
//   - Top-10 tags as a horizontal bar chart
//   - Views by day of week (7 bars)
//   - Views by hour (24 bars)
//   - Most-viewed media (top-5 list w/ thumb)
//   - "Rediscovery" — highly-rated items unwatched in 90+ days
//
// Lives behind Library Tools → Analytics.

import { useEffect, useState, useCallback } from 'react'
import { BarChart3, X, Loader2, Star, Clock, RefreshCw } from 'lucide-react'
import { toFileUrlCached } from '../hooks/usePerformance'

interface ActivityStats {
  totalSessions: number
  totalWatchTime: number
  avgSessionLength: number
  longestSession: number
  currentStreak: number
  longestStreak: number
  viewsByDayOfWeek: number[]
  viewsByHour: number[]
  mostViewedMedia: Array<{ id: string; filename: string; views: number; thumbPath?: string }>
  recentActivity: Array<{ date: string; views: number; watchTime: number }>
}

interface TagStats {
  tagCloud: Array<{ name: string; count: number; category?: string }>
}

interface Props {
  isOpen: boolean
  onClose: () => void
  onPlay?: (mediaId: string) => void
  showToast?: (kind: 'success' | 'error' | 'info', msg: string) => void
}

const DOW_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function fmtHours(seconds: number): string {
  const hrs = seconds / 3600
  if (hrs < 1) return `${Math.round(seconds / 60)}m`
  if (hrs < 10) return `${hrs.toFixed(1)}h`
  return `${Math.round(hrs)}h`
}

export function AnalyticsDashboardPanel({ isOpen, onClose, onPlay, showToast }: Props) {
  const [activity, setActivity] = useState<ActivityStats | null>(null)
  const [tags, setTags] = useState<TagStats | null>(null)
  const [thumbUrls, setThumbUrls] = useState<Map<string, string>>(new Map())
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [act, tag] = await Promise.all([
        window.api.invoke('advancedStats:getActivity') as Promise<ActivityStats>,
        window.api.invoke('advancedStats:getTags') as Promise<TagStats>,
      ])
      setActivity(act)
      setTags(tag)
      // Resolve thumbs for the top-viewed list
      const m = new Map<string, string>()
      for (const item of act?.mostViewedMedia?.slice(0, 5) ?? []) {
        if (item.thumbPath) {
          try { m.set(item.id, await toFileUrlCached(item.thumbPath)) } catch { /* skip */ }
        }
      }
      setThumbUrls(m)
    } catch (err: any) {
      showToast?.('error', err?.message ?? 'Failed to load analytics')
    } finally {
      setLoading(false)
    }
  }, [showToast])

  useEffect(() => { if (isOpen) void load() }, [isOpen, load])

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[200] flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-[var(--panel)] rounded-xl border border-[var(--border)] max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <BarChart3 size={20} className="text-[var(--primary)]" />
            <div>
              <h3 className="font-semibold">Personal Analytics</h3>
              <p className="text-[11px] text-[var(--muted)]">
                Your watch patterns, top tags, rediscovery suggestions.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => void load()}
              className="text-xs px-2 py-1 rounded bg-white/5 hover:bg-white/10 text-[var(--primary)] transition flex items-center gap-1"
            >
              <RefreshCw size={11} className={loading ? 'animate-spin' : ''} />
              Reload
            </button>
            <button onClick={onClose} className="p-1.5 rounded hover:bg-white/10">
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {loading && !activity && (
            <div className="flex items-center justify-center p-8 text-[var(--muted)] text-sm">
              <Loader2 size={16} className="animate-spin mr-2" /> Crunching numbers…
            </div>
          )}

          {activity && (
            <>
              {/* Top metric row */}
              <div className="grid grid-cols-4 gap-3">
                <MetricCard label="Total sessions" value={String(activity.totalSessions ?? 0)} />
                <MetricCard label="Watch time" value={fmtHours(activity.totalWatchTime ?? 0)} />
                <MetricCard label="Current streak" value={`${activity.currentStreak ?? 0}d`} accent="emerald" />
                <MetricCard label="Longest streak" value={`${activity.longestStreak ?? 0}d`} accent="amber" />
              </div>

              {/* Day-of-week chart */}
              <ChartSection title="Views by day of week">
                <BarChart
                  data={activity.viewsByDayOfWeek ?? []}
                  labels={DOW_LABELS}
                  color="rgb(168, 85, 247)"
                />
              </ChartSection>

              {/* Hour-of-day chart */}
              <ChartSection title="Views by hour">
                <BarChart
                  data={activity.viewsByHour ?? []}
                  labels={Array.from({ length: 24 }, (_, i) => i % 4 === 0 ? String(i) : '')}
                  color="rgb(244, 114, 182)"
                  compact
                />
              </ChartSection>

              {/* Most-viewed list */}
              <ChartSection title="Most viewed">
                {(activity.mostViewedMedia ?? []).slice(0, 5).length === 0 ? (
                  <div className="text-xs text-[var(--muted)] italic">No play counts yet.</div>
                ) : (
                  <div className="space-y-1.5">
                    {activity.mostViewedMedia.slice(0, 5).map((m, i) => (
                      <button
                        key={m.id}
                        onClick={() => { onPlay?.(m.id); onClose() }}
                        className="w-full flex items-center gap-3 p-2 rounded-lg bg-white/[0.03] hover:bg-white/[0.06] transition text-left"
                      >
                        <span className="text-xs text-[var(--muted)] tabular-nums w-4">{i + 1}.</span>
                        <div className="w-14 h-8 bg-black/40 rounded overflow-hidden flex-shrink-0">
                          {thumbUrls.get(m.id) ? (
                            <img src={thumbUrls.get(m.id)} alt="" className="w-full h-full object-cover" />
                          ) : null}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm truncate" title={m.filename}>{m.filename}</div>
                          <div className="text-[11px] text-[var(--muted)]">{m.views} view{m.views === 1 ? '' : 's'}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </ChartSection>
            </>
          )}

          {tags && tags.tagCloud && tags.tagCloud.length > 0 && (
            <ChartSection title="Top tags">
              <BarChart
                data={tags.tagCloud.slice(0, 10).map(t => t.count)}
                labels={tags.tagCloud.slice(0, 10).map(t => t.name)}
                color="rgb(34, 197, 94)"
                horizontal
              />
            </ChartSection>
          )}
        </div>
      </div>
    </div>
  )
}

function MetricCard({ label, value, accent }: { label: string; value: string; accent?: 'emerald' | 'amber' }) {
  const accentClass = accent === 'emerald' ? 'text-emerald-400' : accent === 'amber' ? 'text-amber-400' : 'text-[var(--primary)]'
  return (
    <div className="p-3 rounded-lg bg-white/[0.03] border border-white/5">
      <div className="text-[10px] uppercase tracking-wider text-[var(--muted)]">{label}</div>
      <div className={`text-2xl font-bold mt-1 ${accentClass}`}>{value}</div>
    </div>
  )
}

function ChartSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="p-3 rounded-lg bg-white/[0.03] border border-white/5">
      <div className="text-[11px] font-medium text-[var(--muted)] uppercase tracking-wider mb-2 flex items-center gap-1.5">
        <Star size={10} />
        {title}
      </div>
      {children}
    </div>
  )
}

function BarChart({
  data,
  labels,
  color,
  compact,
  horizontal,
}: {
  data: number[]
  labels: string[]
  color: string
  compact?: boolean
  horizontal?: boolean
}) {
  const max = Math.max(1, ...data)
  if (horizontal) {
    return (
      <div className="space-y-1">
        {data.map((v, i) => (
          <div key={i} className="flex items-center gap-2">
            <div className="text-[11px] text-white/70 w-28 truncate text-right" title={labels[i]}>{labels[i]}</div>
            <div className="flex-1 h-4 bg-white/5 rounded overflow-hidden relative">
              <div
                className="h-full rounded transition-[width]"
                style={{ width: `${(v / max) * 100}%`, background: color }}
              />
            </div>
            <div className="text-[11px] text-[var(--muted)] tabular-nums w-10 text-right">{v}</div>
          </div>
        ))}
      </div>
    )
  }
  return (
    <div className="flex items-end gap-1" style={{ height: compact ? 64 : 96 }}>
      {data.map((v, i) => {
        const h = Math.max(2, (v / max) * 100)
        return (
          <div key={i} className="flex-1 flex flex-col items-center gap-1 min-w-0">
            <div className="w-full rounded-t" style={{ height: `${h}%`, background: color, minHeight: 2 }} title={`${labels[i] || i}: ${v}`} />
            <div className="text-[9px] text-[var(--muted)] truncate w-full text-center" title={labels[i] || String(i)}>
              {labels[i]}
            </div>
          </div>
        )
      })}
    </div>
  )
}
