// File: src/renderer/components/GifMakerModal.tsx
//
// Modal "Make GIF" popup with a draggable timeline range slider.
// Mounted in the Brainwash editor — the user picks a window of seconds with
// a visual range (drag the band, or drag either edge handle), confirms, and
// the new GIF is added to the library + handed back to the caller so the
// caption editor can switch to it.

import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { X, Play, Pause, RefreshCw, Sparkles, Shuffle, Zap, Search } from 'lucide-react'
import { useEscapeClose } from '../hooks/useEscapeClose'

// Local types — kept loose so the modal can be reused outside the brainwash flow.
type MediaRow = {
  id: string
  path?: string
  filename?: string
  type?: 'video' | 'image' | 'gif'
  thumbPath?: string | null
  durationSec?: number | null
}

interface GifMakerModalProps {
  open: boolean
  onClose: () => void
  // Library to pick from. Caller filters to videos already; we still re-filter
  // defensively in case mixed types come in.
  videos: MediaRow[]
  // Optional preselected video — if provided, skip the picker and jump straight to range.
  initialVideo?: MediaRow | null
  // Called after a GIF is created + added to the library. Returns the new media id.
  onCreated?: (newMediaId: string, gifPath: string) => void
  // Toast wrapper from the parent so we don't reach into context here.
  showToast?: (kind: 'success' | 'error' | 'info', msg: string) => void
}

const MIN_DURATION = 0.5
const MAX_DURATION = 30  // cap — anything longer is effectively a video
const DEFAULT_DURATION = 5

type DragMode = null | 'left' | 'right' | 'range'

// ─────────────────────────────────────────────────────────────────────────────
// TimelineRangeSlider — the draggable band.
// Shows the full video duration as a track. The selection band can be:
//   - dragged as a whole (the inner handle)
//   - resized from the left edge (left handle)
//   - resized from the right edge (right handle)
// Times snap to 0.1s. Keeps the band within bounds and respects MIN_DURATION.
// ─────────────────────────────────────────────────────────────────────────────
const TimelineRangeSlider: React.FC<{
  duration: number
  start: number
  end: number
  onChange: (start: number, end: number) => void
  currentTime?: number
  onScrub?: (t: number) => void
}> = ({ duration, start, end, onChange, currentTime, onScrub }) => {
  const trackRef = useRef<HTMLDivElement | null>(null)
  const [drag, setDrag] = useState<DragMode>(null)
  const dragOffsetRef = useRef(0)  // for 'range' drag — offset between cursor and start
  const total = Math.max(duration, MIN_DURATION)

  const pctOf = (t: number) => `${(t / total) * 100}%`

  const xToTime = useCallback((clientX: number): number => {
    const rect = trackRef.current?.getBoundingClientRect()
    if (!rect) return 0
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
    return Math.round(ratio * total * 10) / 10  // snap to 0.1s
  }, [total])

  const onPointerMove = useCallback((e: PointerEvent) => {
    if (!drag) return
    const t = xToTime(e.clientX)
    if (drag === 'left') {
      const newStart = Math.max(0, Math.min(t, end - MIN_DURATION))
      onChange(newStart, end)
    } else if (drag === 'right') {
      const newEnd = Math.min(total, Math.max(t, start + MIN_DURATION))
      onChange(start, newEnd)
    } else if (drag === 'range') {
      const span = end - start
      let newStart = t - dragOffsetRef.current
      newStart = Math.max(0, Math.min(newStart, total - span))
      onChange(newStart, newStart + span)
    }
  }, [drag, end, start, total, onChange, xToTime])

  const onPointerUp = useCallback(() => {
    setDrag(null)
  }, [])

  useEffect(() => {
    if (!drag) return
    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
    return () => {
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
    }
  }, [drag, onPointerMove, onPointerUp])

  const onTrackClick = (e: React.MouseEvent) => {
    if (drag) return  // mid-drag — already handled
    if (!onScrub) return
    onScrub(xToTime(e.clientX))
  }

  return (
    <div className="select-none">
      {/* Time labels */}
      <div className="flex justify-between text-[10px] text-[var(--muted)] mb-1.5 tabular-nums">
        <span>0:00</span>
        <span className="text-[var(--primary)] font-semibold">
          {fmt(start)} → {fmt(end)} <span className="text-[var(--muted)] font-normal">({(end - start).toFixed(1)}s)</span>
        </span>
        <span>{fmt(total)}</span>
      </div>

      {/* Track */}
      <div
        ref={trackRef}
        className="relative h-12 rounded-lg bg-[var(--background)] border border-[var(--border)] cursor-pointer overflow-hidden"
        onClick={onTrackClick}
      >
        {/* dim full track */}
        <div className="absolute inset-0 bg-white/[0.02]" />

        {/* selection band */}
        <div
          className="absolute top-0 bottom-0 bg-[var(--primary)]/30 border-y-2 border-[var(--primary)]"
          style={{ left: pctOf(start), width: pctOf(end - start) }}
          onPointerDown={(e) => {
            e.stopPropagation()
            // Compute offset between click position (in time) and band start.
            const clickT = xToTime(e.clientX)
            dragOffsetRef.current = clickT - start
            setDrag('range')
          }}
        >
          {/* left handle */}
          <div
            className="absolute -left-1.5 top-0 bottom-0 w-3 bg-[var(--primary)] cursor-ew-resize rounded-l flex items-center justify-center"
            onPointerDown={(e) => {
              e.stopPropagation()
              setDrag('left')
            }}
            title="Drag to set start"
          >
            <span className="w-0.5 h-4 bg-white/80 rounded-full" />
          </div>
          {/* right handle */}
          <div
            className="absolute -right-1.5 top-0 bottom-0 w-3 bg-[var(--primary)] cursor-ew-resize rounded-r flex items-center justify-center"
            onPointerDown={(e) => {
              e.stopPropagation()
              setDrag('right')
            }}
            title="Drag to set end"
          >
            <span className="w-0.5 h-4 bg-white/80 rounded-full" />
          </div>
          {/* grab strip in the middle */}
          <div className="absolute inset-y-0 left-3 right-3 flex items-center justify-center pointer-events-none">
            <span className="text-[10px] text-white/80 font-medium tabular-nums">
              {(end - start).toFixed(1)}s
            </span>
          </div>
        </div>

        {/* playhead (current scrub position) */}
        {currentTime !== undefined && (
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-white/80 pointer-events-none"
            style={{ left: pctOf(Math.max(0, Math.min(currentTime, total))) }}
          >
            <div className="absolute -top-1 -left-1 w-2.5 h-2.5 rounded-full bg-white shadow-lg" />
          </div>
        )}
      </div>

      <p className="mt-2 text-[10px] text-[var(--muted)]">
        Drag the colored band to reposition the GIF window. Drag either edge to resize. Click anywhere on the track to scrub the preview.
      </p>
    </div>
  )
}

function fmt(t: number): string {
  const s = Math.max(0, t)
  const mm = Math.floor(s / 60)
  const ss = Math.floor(s % 60)
  const tenths = Math.floor((s * 10) % 10)
  return `${mm}:${String(ss).padStart(2, '0')}.${tenths}`
}

// ─────────────────────────────────────────────────────────────────────────────
// GifMakerModal — the popup wrapper around the timeline + controls.
// ─────────────────────────────────────────────────────────────────────────────
const GifMakerModal: React.FC<GifMakerModalProps> = ({
  open, onClose, videos, initialVideo, onCreated, showToast
}) => {
  const [selected, setSelected] = useState<MediaRow | null>(null)
  const [videoUrl, setVideoUrl] = useState<string | null>(null)
  const [duration, setDuration] = useState(0)
  const [start, setStart] = useState(0)
  const [end, setEnd] = useState(DEFAULT_DURATION)
  const [currentTime, setCurrentTime] = useState(0)
  const [fps, setFps] = useState(15)
  const [quality, setQuality] = useState<'low' | 'medium' | 'high'>('medium')
  const [generating, setGenerating] = useState(false)
  const [search, setSearch] = useState('')
  const videoRef = useRef<HTMLVideoElement | null>(null)

  useEscapeClose(open, onClose)

  // Reset state on open / when initialVideo changes
  useEffect(() => {
    if (!open) return
    if (initialVideo && initialVideo.id !== selected?.id) {
      void selectVideo(initialVideo)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialVideo?.id])

  const selectVideo = useCallback(async (m: MediaRow) => {
    setSelected(m)
    setStart(0)
    setEnd(Math.min(DEFAULT_DURATION, m.durationSec || DEFAULT_DURATION))
    setCurrentTime(0)
    if (m.path) {
      try {
        // Use vault:// protocol via window.api if available, else fall back.
        const url = await (window as any).api?.fs?.toFileUrl?.(m.path) ?? `file:///${m.path.replace(/\\/g, '/')}`
        setVideoUrl(url)
      } catch (err) {
        console.error('[GifMaker] Failed to load video URL:', err)
        showToast?.('error', 'Failed to load video')
      }
    }
  }, [showToast])

  // When the underlying <video> reports its real duration, anchor our state.
  const onLoadedMetadata = () => {
    if (!videoRef.current) return
    const real = videoRef.current.duration
    if (Number.isFinite(real) && real > 0) {
      setDuration(real)
      // If end is beyond real duration, clamp.
      setEnd((prev) => Math.min(prev, real))
    } else if (selected?.durationSec) {
      setDuration(selected.durationSec)
    }
  }

  // Keep the preview seeking to start when the range changes (so user sees the cut)
  const onRangeChange = useCallback((s: number, e: number) => {
    setStart(s)
    setEnd(e)
    if (videoRef.current) {
      videoRef.current.currentTime = s
      videoRef.current.pause()
    }
  }, [])

  const onScrub = useCallback((t: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime = t
      setCurrentTime(t)
    }
  }, [])

  // Stay synced with playback so the playhead in the timeline tracks.
  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    const onTick = () => setCurrentTime(v.currentTime)
    v.addEventListener('timeupdate', onTick)
    return () => v.removeEventListener('timeupdate', onTick)
  }, [videoUrl])

  const filteredVideos = useMemo(() => {
    const q = search.trim().toLowerCase()
    const list = videos.filter((m) => m.type === 'video')
    if (!q) return list
    return list.filter((m) => (m.filename ?? '').toLowerCase().includes(q))
  }, [videos, search])

  const pickRandom = () => {
    const pool = filteredVideos.length ? filteredVideos : videos.filter((m) => m.type === 'video')
    if (!pool.length) return
    void selectVideo(pool[Math.floor(Math.random() * pool.length)])
  }

  const handleConfirm = async () => {
    if (!selected?.id) return
    setGenerating(true)
    try {
      const result = await (window as any).api?.media?.createGif?.({
        mediaId: selected.id, startTime: start, endTime: end, fps, quality
      })
      if (!result?.success || !result.gifPath) {
        showToast?.('error', result?.error ?? 'Failed to create GIF')
        setGenerating(false)
        return
      }
      // Add to library so it shows up in the brainwash gallery + can be edited like an image.
      const added = await (window as any).api?.media?.addGifToLibrary?.(result.gifPath)
      if (added?.success && added.mediaId) {
        showToast?.('success', 'GIF added to library')
        onCreated?.(added.mediaId, result.gifPath)
        onClose()
      } else {
        // Even if library-add fails, the file was created — surface the path.
        showToast?.('error', added?.error ?? 'GIF created but not added to library')
      }
    } catch (err: any) {
      showToast?.('error', err?.message ?? 'GIF creation failed')
    } finally {
      setGenerating(false)
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm" onClick={onClose}>
      <div
        className="relative w-[min(92vw,980px)] max-h-[92vh] overflow-y-auto rounded-2xl bg-[var(--panel)] border border-[var(--border)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border)] sticky top-0 bg-[var(--panel)] z-10">
          <div className="flex items-center gap-2">
            <Sparkles size={18} className="text-[var(--primary)]" />
            <h2 className="text-lg font-semibold">Make GIF</h2>
            <span className="text-xs text-[var(--muted)]">— pick a window of seconds, then confirm to add to your library.</span>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-white/10 transition"
            title="Close (Esc)"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Step 1: pick a video (only shown until one is selected) */}
          {!selected && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">1 · Pick a source video</h3>
                <button onClick={pickRandom} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 text-xs hover:bg-white/20 transition">
                  <Zap size={12} />Random
                </button>
              </div>
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search videos by filename…"
                  className="w-full pl-9 pr-3 py-2 rounded-lg bg-[var(--background)] border border-[var(--border)] text-sm focus:outline-none focus:border-[var(--primary)]"
                />
              </div>
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2 max-h-[420px] overflow-y-auto p-1 -m-1">
                {filteredVideos.length === 0 ? (
                  <div className="col-span-full text-center text-sm text-[var(--muted)] py-12">No videos found.</div>
                ) : filteredVideos.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => selectVideo(m)}
                    className="aspect-video rounded-lg overflow-hidden border-2 border-transparent hover:border-[var(--primary)] transition relative bg-black"
                    title={m.filename}
                  >
                    {m.thumbPath
                      ? <img src={`file:///${(m.thumbPath || '').replace(/\\/g, '/')}`} alt="" className="w-full h-full object-cover" />
                      : <div className="w-full h-full flex items-center justify-center text-[var(--muted)]"><Play size={20} /></div>}
                    <div className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded bg-black/70 text-[10px]">
                      {m.durationSec ? `${Math.floor(m.durationSec / 60)}:${String(Math.floor(m.durationSec % 60)).padStart(2, '0')}` : '?'}
                    </div>
                    <div className="absolute bottom-1 left-1 right-1 truncate px-1 py-0.5 text-[10px] text-white/90 bg-black/40 rounded">
                      {m.filename}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Step 2: trim + confirm */}
          {selected && videoUrl && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold flex items-center gap-2">
                    2 · Choose your seconds
                  </h3>
                  <p className="text-xs text-[var(--muted)] mt-0.5 truncate max-w-[560px]">{selected.filename}</p>
                </div>
                <button
                  onClick={() => { setSelected(null); setVideoUrl(null) }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 text-xs hover:bg-white/20 transition"
                >
                  <Shuffle size={12} />Pick a different video
                </button>
              </div>

              {/* Video preview */}
              <video
                ref={videoRef}
                src={videoUrl}
                className="w-full max-h-[44vh] bg-black rounded-xl object-contain"
                controls
                playsInline
                onLoadedMetadata={onLoadedMetadata}
              />

              {/* Timeline range */}
              <TimelineRangeSlider
                duration={duration || selected.durationSec || 0}
                start={start}
                end={end}
                onChange={onRangeChange}
                currentTime={currentTime}
                onScrub={onScrub}
              />

              {/* FPS + Quality */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-[var(--muted)] block mb-1">Frame rate</label>
                  <select
                    value={fps}
                    onChange={(e) => setFps(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-lg bg-[var(--background)] border border-[var(--border)] text-sm"
                  >
                    <option value={10}>10 FPS — small file</option>
                    <option value={15}>15 FPS — balanced</option>
                    <option value={24}>24 FPS — smooth</option>
                    <option value={30}>30 FPS — very smooth, big file</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-[var(--muted)] block mb-1">Quality</label>
                  <select
                    value={quality}
                    onChange={(e) => setQuality(e.target.value as 'low' | 'medium' | 'high')}
                    className="w-full px-3 py-2 rounded-lg bg-[var(--background)] border border-[var(--border)] text-sm"
                  >
                    <option value="low">Low — 320px wide</option>
                    <option value="medium">Medium — 480px wide</option>
                    <option value="high">High — 720px wide</option>
                  </select>
                </div>
              </div>

              {(end - start) > MAX_DURATION && (
                <p className="text-xs text-amber-400">
                  Heads up — {(end - start).toFixed(1)}s GIFs are large. Consider trimming under {MAX_DURATION}s.
                </p>
              )}
            </div>
          )}
        </div>

        {/* Sticky footer with confirm */}
        {selected && videoUrl && (
          <div className="sticky bottom-0 px-6 py-4 border-t border-[var(--border)] bg-[var(--panel)] flex justify-between items-center gap-3">
            <p className="text-xs text-[var(--muted)]">
              GIF will be added to your library and opened in the editor.
            </p>
            <div className="flex gap-2">
              <button
                onClick={onClose}
                className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 transition text-sm"
                disabled={generating}
              >
                Cancel
              </button>
              <button
                onClick={handleConfirm}
                disabled={generating || !selected || (end - start) < MIN_DURATION}
                className="px-5 py-2 rounded-lg bg-[var(--primary)] text-white font-medium text-sm hover:opacity-90 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {generating ? (
                  <><RefreshCw size={14} className="animate-spin" />Creating GIF…</>
                ) : (
                  <><Sparkles size={14} />Create &amp; edit</>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default GifMakerModal
