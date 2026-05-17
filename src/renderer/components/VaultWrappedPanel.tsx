// File: src/renderer/components/VaultWrappedPanel.tsx
//
// Spotify-Wrapped-style monthly recap. Auto-generated from existing
// data plumbing (advancedStats:getTimeRange + advancedStats:getDashboard
// + tag-stats). Renders as a 6-slide story with auto-advance progress
// bars at the top, taps to navigate, and a final "share" hand-off
// (currently just copies a textual summary to clipboard).
//
// Default range: previous 30 days. Slide order:
//   1. Welcome / period header
//   2. Watch time total + minute breakdown
//   3. Top tag (mood / vibe of the month)
//   4. Most-replayed media (with thumbnail)
//   5. Peak watch hour ("you watched most at 11 PM")
//   6. Closing card with share button
//
// Skips slides for which no data exists (e.g. no top tag → skip slide 3).

import React, { useEffect, useState, useCallback, useRef } from 'react'
import { Sparkles, X, ChevronLeft, ChevronRight, Share2, Clock, Tag, Film, Sunrise } from 'lucide-react'
import { toFileUrlCached } from '../hooks/usePerformance'
import { formatDuration } from '../utils/formatters'

interface TimeRangeStats {
  period: string
  mediaAdded: number
  mediaViewed: number
  totalWatchTime: number
  avgSessionLength: number
  peakHour: number
  topTags: Array<{ name: string; count: number }>
}

interface MostViewedItem {
  id: string
  filename: string
  views: number
  thumbPath?: string | null
}

interface Props {
  isOpen: boolean
  onClose: () => void
  showToast?: (kind: 'success' | 'error' | 'info', msg: string) => void
}

const SLIDE_DURATION_MS = 5_500

function fmtMinutes(secs: number): string {
  if (!secs) return '0 minutes'
  const mins = Math.round(secs / 60)
  if (mins < 60) return `${mins} minute${mins === 1 ? '' : 's'}`
  const hrs = Math.floor(mins / 60)
  const remM = mins % 60
  if (remM === 0) return `${hrs} hour${hrs === 1 ? '' : 's'}`
  return `${hrs}h ${remM}m`
}

function hourLabel(h: number): string {
  if (h === 0) return '12 AM (midnight)'
  if (h === 12) return '12 PM (noon)'
  if (h < 12) return `${h} AM`
  return `${h - 12} PM`
}

export function VaultWrappedPanel({ isOpen, onClose, showToast }: Props) {
  const [stats, setStats] = useState<TimeRangeStats | null>(null)
  const [topMedia, setTopMedia] = useState<MostViewedItem | null>(null)
  const [topMediaThumb, setTopMediaThumb] = useState<string | null>(null)
  const [slideIdx, setSlideIdx] = useState(0)
  const [paused, setPaused] = useState(false)
  const [loading, setLoading] = useState(false)
  const startRef = useRef<number>(0)
  const rafRef = useRef<number>(0)
  const [progress, setProgress] = useState(0)

  // Load data once on open. Range = last 30 days.
  const load = useCallback(async () => {
    setLoading(true)
    setSlideIdx(0)
    try {
      const end = Date.now()
      const start = end - 30 * 24 * 60 * 60 * 1000
      const [tr, dash] = await Promise.all([
        window.api.invoke('advancedStats:getTimeRange', start, end) as Promise<TimeRangeStats>,
        window.api.invoke('advancedStats:getDashboard') as Promise<{ activity: { mostViewedMedia: MostViewedItem[] } }>,
      ])
      setStats(tr)
      const top = dash?.activity?.mostViewedMedia?.[0] ?? null
      setTopMedia(top)
      if (top?.thumbPath) {
        try { setTopMediaThumb(await toFileUrlCached(top.thumbPath)) } catch { setTopMediaThumb(null) }
      } else {
        setTopMediaThumb(null)
      }
    } catch (err: any) {
      showToast?.('error', err?.message ?? 'Failed to load Vault Wrapped')
    } finally {
      setLoading(false)
    }
  }, [showToast])

  useEffect(() => {
    if (isOpen) void load()
    else { setStats(null); setTopMedia(null); setTopMediaThumb(null) }
  }, [isOpen, load])

  // Build slide list, skipping empty ones.
  const slides = stats
    ? [
        { key: 'welcome', render: () => (
          <SlideShell tone="primary">
            <Sparkles size={56} className="text-yellow-300 mb-4 drop-shadow-glow" />
            <div className="text-xs uppercase tracking-widest text-white/60">Vault Wrapped</div>
            <div className="text-3xl font-bold mt-2">Your last 30 days</div>
            <div className="text-sm text-white/70 mt-3">Tap or wait to see what you've been up to.</div>
          </SlideShell>
        ) },
        stats.totalWatchTime > 0 && { key: 'watchtime', render: () => (
          <SlideShell tone="ember">
            <Clock size={48} className="text-amber-300 mb-3" />
            <div className="text-xs uppercase tracking-widest text-white/60">Total watch time</div>
            <div className="text-5xl font-bold mt-3">{fmtMinutes(stats.totalWatchTime)}</div>
            <div className="text-sm text-white/70 mt-3">across {stats.mediaViewed} session{stats.mediaViewed === 1 ? '' : 's'}</div>
          </SlideShell>
        ) },
        (stats.topTags?.length ?? 0) > 0 && { key: 'topTag', render: () => (
          <SlideShell tone="velvet">
            <Tag size={48} className="text-pink-300 mb-3" />
            <div className="text-xs uppercase tracking-widest text-white/60">Your top tag</div>
            <div className="text-4xl font-bold mt-3 text-pink-200">#{stats.topTags[0].name}</div>
            <div className="text-sm text-white/70 mt-3">appeared in {stats.topTags[0].count} sessions</div>
            {stats.topTags.slice(1, 4).length > 0 && (
              <div className="mt-4 flex flex-wrap justify-center gap-1.5">
                {stats.topTags.slice(1, 4).map(t => (
                  <span key={t.name} className="text-[11px] px-2 py-0.5 rounded-full bg-white/10 text-white/70">
                    #{t.name} · {t.count}
                  </span>
                ))}
              </div>
            )}
          </SlideShell>
        ) },
        topMedia && { key: 'topMedia', render: () => (
          <SlideShell tone="midnight">
            <Film size={36} className="text-emerald-300 mb-2" />
            <div className="text-xs uppercase tracking-widest text-white/60">Most replayed</div>
            <div className="mt-3 w-44 aspect-video rounded-lg overflow-hidden bg-black/40 ring-1 ring-emerald-300/40 mb-3">
              {topMediaThumb ? (
                <img src={topMediaThumb} alt="" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-[var(--muted)]">no thumb</div>
              )}
            </div>
            <div className="text-sm font-medium text-white truncate max-w-xs" title={topMedia.filename}>
              {topMedia.filename}
            </div>
            <div className="text-xs text-white/60 mt-1">{topMedia.views} views</div>
          </SlideShell>
        ) },
        { key: 'peakHour', render: () => (
          <SlideShell tone="primary">
            <Sunrise size={48} className="text-orange-300 mb-3" />
            <div className="text-xs uppercase tracking-widest text-white/60">Peak hour</div>
            <div className="text-5xl font-bold mt-3">{hourLabel(stats.peakHour)}</div>
            <div className="text-sm text-white/70 mt-3">your most-active hour of the day</div>
          </SlideShell>
        ) },
        { key: 'closing', render: () => (
          <SlideShell tone="velvet">
            <Sparkles size={48} className="text-yellow-300 mb-3" />
            <div className="text-2xl font-bold">That's a wrap.</div>
            <div className="text-sm text-white/70 mt-3 max-w-xs">
              {fmtMinutes(stats.totalWatchTime)} · {stats.mediaViewed} sessions · {stats.mediaAdded} new items added
            </div>
            <button
              onClick={async () => {
                const summary = `Vault Wrapped — last 30 days
${fmtMinutes(stats.totalWatchTime)} of watch time
${stats.mediaViewed} sessions · ${stats.mediaAdded} new
Top tag: #${stats.topTags[0]?.name ?? '—'}
Peak hour: ${hourLabel(stats.peakHour)}`
                try {
                  await navigator.clipboard.writeText(summary)
                  showToast?.('success', 'Copied to clipboard')
                } catch {
                  showToast?.('error', 'Clipboard write failed')
                }
              }}
              className="mt-5 px-4 py-2 rounded-full bg-white/10 hover:bg-white/20 text-sm flex items-center gap-2"
            >
              <Share2 size={14} /> Copy summary
            </button>
          </SlideShell>
        ) },
      ].filter(Boolean) as Array<{ key: string; render: () => React.JSX.Element }>
    : []

  // Auto-advance with pause + progress bar.
  useEffect(() => {
    if (!isOpen || slides.length === 0 || paused) {
      cancelAnimationFrame(rafRef.current)
      return
    }
    startRef.current = performance.now()
    setProgress(0)
    const tick = (now: number) => {
      const elapsed = now - startRef.current
      const p = Math.min(1, elapsed / SLIDE_DURATION_MS)
      setProgress(p)
      if (p >= 1) {
        if (slideIdx < slides.length - 1) setSlideIdx(slideIdx + 1)
        return
      }
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [isOpen, slideIdx, slides.length, paused])

  // Reset on slide change so progress bar starts fresh.
  useEffect(() => { setProgress(0) }, [slideIdx])

  const goPrev = () => setSlideIdx(i => Math.max(0, i - 1))
  const goNext = () => setSlideIdx(i => Math.min(slides.length - 1, i + 1))

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 bg-black/95 z-[300] flex items-center justify-center"
      onClick={onClose}
      onMouseDown={() => setPaused(true)}
      onMouseUp={() => setPaused(false)}
      onMouseLeave={() => setPaused(false)}
    >
      <div
        className="relative w-full max-w-md aspect-[9/16] rounded-xl overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Progress bars (Instagram-style) */}
        <div className="absolute top-0 inset-x-0 z-30 flex gap-1 p-2">
          {slides.map((_, i) => (
            <div key={i} className="flex-1 h-0.5 bg-white/20 rounded-full overflow-hidden">
              <div
                className="h-full bg-white transition-[width]"
                style={{
                  width: i < slideIdx ? '100%' : i === slideIdx ? `${progress * 100}%` : '0%',
                  transitionDuration: i === slideIdx ? '50ms' : '300ms',
                }}
              />
            </div>
          ))}
        </div>

        {/* Close */}
        <button
          onClick={onClose}
          className="absolute top-4 right-3 z-30 p-1.5 rounded-full bg-black/40 hover:bg-black/60 text-white/80"
        >
          <X size={16} />
        </button>

        {/* Slide content */}
        <div className="absolute inset-0">
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center text-[var(--muted)]">
              Loading…
            </div>
          )}
          {!loading && slides.length === 0 && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-[var(--muted)] p-8 text-center">
              <Sparkles size={48} className="mb-3 opacity-40" />
              <p className="text-sm">No activity yet for the last 30 days.</p>
              <p className="text-[11px] mt-2">Watch some media and check back at the end of the month.</p>
            </div>
          )}
          {!loading && slides.length > 0 && slides[slideIdx]?.render()}
        </div>

        {/* Tap zones for prev/next */}
        <button
          onClick={goPrev}
          aria-label="Previous slide"
          className="absolute left-0 top-0 bottom-0 w-1/3 z-20 flex items-center justify-start pl-2 opacity-0 hover:opacity-100 transition"
        >
          <ChevronLeft size={20} className="text-white/60" />
        </button>
        <button
          onClick={goNext}
          aria-label="Next slide"
          className="absolute right-0 top-0 bottom-0 w-1/3 z-20 flex items-center justify-end pr-2 opacity-0 hover:opacity-100 transition"
        >
          <ChevronRight size={20} className="text-white/60" />
        </button>
      </div>
    </div>
  )
}

// Per-slide background tones — reuses the existing Vault palette
// hints (primary / ember / velvet / midnight) for visual variety
// without pulling in a new theme system.
function SlideShell({ tone, children }: { tone: 'primary' | 'ember' | 'velvet' | 'midnight'; children: React.ReactNode }) {
  const bgClass = tone === 'primary'
    ? 'bg-gradient-to-br from-violet-700 via-fuchsia-700 to-rose-700'
    : tone === 'ember'
      ? 'bg-gradient-to-br from-amber-700 via-orange-700 to-rose-800'
      : tone === 'velvet'
        ? 'bg-gradient-to-br from-rose-700 via-pink-700 to-fuchsia-800'
        : 'bg-gradient-to-br from-indigo-900 via-slate-900 to-zinc-900'
  return (
    <div className={`absolute inset-0 ${bgClass} flex flex-col items-center justify-center p-8 text-white text-center`}>
      {children}
    </div>
  )
}
