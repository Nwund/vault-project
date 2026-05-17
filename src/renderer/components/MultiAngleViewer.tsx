// File: src/renderer/components/MultiAngleViewer.tsx
//
// #166 — Multi-angle synchronized viewer for multi-cam shoots.
//
// Renders up to 4 <video> elements that share a single master clock.
// One pane is the "master" (audio + clock authority); the others are
// slaves that mirror master's currentTime + paused state. Slaves are
// kept muted to avoid the chorus-echo problem.
//
// Sync strategy:
//   - On master `timeupdate`, compute drift = slave.currentTime −
//     master.currentTime. If |drift| > DRIFT_THRESHOLD (200ms), hard
//     seek the slave. Below that, leave it alone — the natural
//     decoding cadence on each pane keeps frames close enough that a
//     forced seek would be more disruptive than the small drift.
//   - On master play/pause, propagate immediately.
//   - User can click any slave to promote it → swap master role.
//
// We assume the caller already grouped these as "angles" (e.g. via
// Chromaprint match). The viewer doesn't care how they're matched —
// it just plays them in lockstep.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Play, Pause, Volume2, VolumeX, X as XIcon, Star } from 'lucide-react'

interface Angle {
  id: string
  /** Resolved playable URL (vault:// or http:// stream URL). */
  url: string
  /** Human label shown over the pane (filename, "Cam A", etc.). */
  label?: string
}

interface Props {
  angles: Angle[]
  initialMasterId?: string
  onClose?: () => void
  className?: string
}

const DRIFT_THRESHOLD_SEC = 0.2

export function MultiAngleViewer({ angles, initialMasterId, onClose, className }: Props) {
  const [masterId, setMasterId] = useState<string>(initialMasterId ?? angles[0]?.id ?? '')
  const [isPlaying, setIsPlaying] = useState(false)
  const [volume, setVolume] = useState(0.7)
  const [muted, setMuted] = useState(false)
  const videoRefs = useRef<Map<string, HTMLVideoElement>>(new Map())

  // Cap at 4 panes for layout sanity.
  const panes = useMemo(() => angles.slice(0, 4), [angles])

  const registerVideo = useCallback((id: string) => (el: HTMLVideoElement | null) => {
    if (el) videoRefs.current.set(id, el)
    else videoRefs.current.delete(id)
  }, [])

  // Push play/pause to every pane whenever the master state flips.
  useEffect(() => {
    for (const [, el] of videoRefs.current) {
      if (isPlaying && el.paused) {
        void el.play().catch(() => { /* autoplay block — user has to gesture */ })
      } else if (!isPlaying && !el.paused) {
        el.pause()
      }
    }
  }, [isPlaying])

  // Slave-drift correction. Mount once; we re-bind whenever master changes.
  useEffect(() => {
    const masterEl = videoRefs.current.get(masterId)
    if (!masterEl) return

    const onTimeUpdate = () => {
      const masterT = masterEl.currentTime
      for (const [id, slaveEl] of videoRefs.current) {
        if (id === masterId) continue
        const drift = slaveEl.currentTime - masterT
        if (Math.abs(drift) > DRIFT_THRESHOLD_SEC) {
          // currentTime= can be expensive — only when drift is real.
          slaveEl.currentTime = masterT
        }
      }
    }
    const onPlay = () => setIsPlaying(true)
    const onPause = () => setIsPlaying(false)

    masterEl.addEventListener('timeupdate', onTimeUpdate)
    masterEl.addEventListener('play', onPlay)
    masterEl.addEventListener('pause', onPause)
    return () => {
      masterEl.removeEventListener('timeupdate', onTimeUpdate)
      masterEl.removeEventListener('play', onPlay)
      masterEl.removeEventListener('pause', onPause)
    }
  }, [masterId])

  // Volume + mute applies to master only — slaves stay muted to avoid
  // the chorus-echo problem. Click-to-promote swaps which pane is the
  // master so the user can audition each angle's audio if it differs.
  useEffect(() => {
    for (const [id, el] of videoRefs.current) {
      if (id === masterId) {
        el.muted = muted
        el.volume = volume
      } else {
        el.muted = true
      }
    }
  }, [masterId, volume, muted])

  // When the user manually seeks via the master scrubber, hard-sync
  // every slave (no drift tolerance — seek is intentional).
  const seekTo = useCallback((sec: number) => {
    for (const [, el] of videoRefs.current) {
      el.currentTime = sec
    }
  }, [])

  const togglePlay = useCallback(() => {
    setIsPlaying((cur) => !cur)
  }, [])

  // Promote: swap master role. The previously-master pane stays
  // visible but becomes a (muted) slave.
  const promote = useCallback((id: string) => {
    if (id === masterId) return
    setMasterId(id)
  }, [masterId])

  const gridClass = panes.length === 1
    ? 'grid-cols-1'
    : panes.length === 2
      ? 'grid-cols-2'
      : 'grid-cols-2'  // 3 or 4 wraps to 2x2

  const masterEl = videoRefs.current.get(masterId)
  const duration = masterEl?.duration ?? 0
  const currentTime = masterEl?.currentTime ?? 0

  return (
    <div className={`fixed inset-0 z-[9999] bg-black ${className ?? ''}`}>
      <div className="absolute top-3 right-3 flex items-center gap-2 z-10">
        {onClose && (
          <button
            onClick={onClose}
            className="p-2 rounded-full bg-zinc-900/80 hover:bg-zinc-800 text-white"
            title="Close (Esc)"
          >
            <XIcon size={18} />
          </button>
        )}
      </div>

      <div className={`grid ${gridClass} gap-1 h-[calc(100vh-64px)] p-1`}>
        {panes.map((angle) => {
          const isMaster = angle.id === masterId
          return (
            <div
              key={angle.id}
              className={`relative bg-black rounded overflow-hidden cursor-pointer ${
                isMaster ? 'ring-2 ring-[var(--primary)]' : 'ring-1 ring-zinc-900 hover:ring-zinc-700'
              }`}
              onClick={() => promote(angle.id)}
              title={isMaster ? 'Master pane (audio + clock)' : 'Click to promote — make this the master'}
            >
              <video
                ref={registerVideo(angle.id)}
                src={angle.url}
                className="absolute inset-0 w-full h-full object-contain bg-black"
                playsInline
                preload="auto"
                // Render-time mute: master will get unmuted by the effect above
                muted={!isMaster || muted}
              />
              <div className="absolute top-2 left-2 flex items-center gap-1.5 px-2 py-1 rounded bg-black/70 text-xs">
                {isMaster && <Star size={11} className="text-[var(--primary)] fill-[var(--primary)]" />}
                <span className="truncate max-w-[12rem]">{angle.label ?? angle.id}</span>
              </div>
            </div>
          )
        })}
      </div>

      {/* Bottom control strip — drives master, slaves follow via the effects */}
      <div className="absolute bottom-0 left-0 right-0 bg-black/90 border-t border-zinc-800 p-3">
        <div className="flex items-center gap-3">
          <button
            onClick={togglePlay}
            className="p-2 rounded-full bg-[var(--primary)] text-white"
          >
            {isPlaying ? <Pause size={16} /> : <Play size={16} />}
          </button>
          <input
            type="range"
            min={0}
            max={Math.max(0.001, duration)}
            step={0.01}
            value={currentTime}
            onChange={(e) => seekTo(Number(e.target.value))}
            className="flex-1 accent-[var(--primary)]"
          />
          <div className="text-xs text-zinc-400 font-mono tabular-nums">
            {formatClock(currentTime)} / {formatClock(duration)}
          </div>
          <button
            onClick={() => setMuted((v) => !v)}
            className="p-2 rounded-full bg-zinc-800 hover:bg-zinc-700 text-white"
            title={muted ? 'Unmute master' : 'Mute master'}
          >
            {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
          </button>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={volume}
            onChange={(e) => setVolume(Number(e.target.value))}
            className="w-24 accent-[var(--primary)]"
            disabled={muted}
          />
        </div>
        <div className="text-[10px] text-zinc-500 mt-1.5 text-center">
          {panes.length} angle{panes.length === 1 ? '' : 's'} in sync · Click a pane to swap audio + clock master
        </div>
      </div>
    </div>
  )
}

function formatClock(sec: number): string {
  if (!Number.isFinite(sec)) return '00:00'
  const s = Math.floor(sec) % 60
  const m = Math.floor(sec / 60) % 60
  const h = Math.floor(sec / 3600)
  const ss = String(s).padStart(2, '0')
  const mm = String(m).padStart(2, '0')
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`
}
