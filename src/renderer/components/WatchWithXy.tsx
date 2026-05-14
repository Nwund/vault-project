// File: src/renderer/components/WatchWithXy.tsx
//
// "Watch With Xyrene" overlay for FloatingVideoPlayer. While enabled, every
// N seconds it captures the current frame from the playing <video>, sends
// it to the Xyrene commentary IPC, and plays back the returned WAV audio
// via her cloned voice (XTTS server). Free-form prose, in-character — no
// JSON, no tagging output. Audio is queued so a slow Venice round-trip
// doesn't drop the next comment.
//
// External requirements (verified by `xyrene:health`):
//   - venice-uncensored-1-2 vision model configured (Tier 2 API key)
//   - XTTS server running locally on 127.0.0.1:8020 (xtts-server/server.py
//     in the user's xyrene-portable folder)
//   - PERSONALITY.md + SYSTEM_PROMPT_v0.1.md reachable in the configured
//     character-loader directory.
//
// If any of those aren't reachable, the toggle is disabled and the user
// gets a one-line hint about what's missing.

import { useEffect, useRef, useState, useCallback } from 'react'
import { Mic, MicOff, Sparkles, AlertCircle, Loader2 } from 'lucide-react'

interface WatchWithXyProps {
  videoRef: React.RefObject<HTMLVideoElement | null>
  mediaId: string
  durationSec?: number | null
  /** Override the default comment cadence (seconds). */
  intervalSec?: number
  /** True when the host player's title bar is visible. The button slides
   *  down to clear the title when on, snaps back up to the top when off. */
  titleVisible?: boolean
}

interface XyComment {
  id: string
  text: string
  at: number          // video timestamp the comment was generated for
  generatedAt: number // wallclock ms
  audioUrl?: string   // blob URL if audio synth succeeded
}

type HealthState =
  | { kind: 'unknown' }
  | { kind: 'ok'; voiceServerOnline: boolean; characterFound: boolean; characterDir: string }
  | { kind: 'error'; message: string }

/**
 * Capture the current frame of the video to a JPEG data URL. Lower the
 * resolution to ~720px wide before encoding so we don't pay the upload
 * cost of a 4K frame on every tick.
 */
function captureFrame(video: HTMLVideoElement, maxWidth = 720): string | null {
  if (video.readyState < 2) return null
  const w = video.videoWidth || 0
  const h = video.videoHeight || 0
  if (w === 0 || h === 0) return null
  const scale = Math.min(1, maxWidth / w)
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(w * scale)
  canvas.height = Math.round(h * scale)
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  try {
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
    return canvas.toDataURL('image/jpeg', 0.82)
  } catch (err) {
    // Cross-origin video tainted canvas — only happens with remote URLs we
    // didn't load through vault://, which shouldn't occur in this app.
    console.warn('[WatchWithXy] captureFrame failed:', err)
    return null
  }
}

export function WatchWithXy({ videoRef, mediaId, durationSec, intervalSec = 8, titleVisible = true }: WatchWithXyProps) {
  const [enabled, setEnabled] = useState(false)
  const [busy, setBusy] = useState(false)
  const [comments, setComments] = useState<XyComment[]>([])
  const [health, setHealth] = useState<HealthState>({ kind: 'unknown' })
  const [audioMuted, setAudioMuted] = useState(false)

  // Audio playback queue: comments arrive faster than they finish playing
  // (long Xyrene reaction or short interval), so we serialize them.
  const audioQueueRef = useRef<string[]>([])
  const audioElRef = useRef<HTMLAudioElement | null>(null)
  const isAudioPlayingRef = useRef(false)

  // Recent comments window — sent back to the LLM so she doesn't repeat
  // the same line twice in a row. Capped at 6 lines to keep the prompt
  // small.
  const recentTextsRef = useRef<string[]>([])

  // Session tracking for the auto-learn pass (#44). Captures everything
  // that happens between toggle-on and toggle-off OR mediaId-change so the
  // session-learning extractor has enough signal to produce useful
  // brain-file appends.
  const sessionRef = useRef<{
    startedAt: number
    mediaIds: Set<string>
    allComments: string[]
  }>({ startedAt: 0, mediaIds: new Set(), allComments: [] })

  const flushSessionLearnings = useCallback(async () => {
    const session = sessionRef.current
    if (!session.startedAt) return
    const durationSec = (Date.now() - session.startedAt) / 1000
    // Reset BEFORE the await so a quick re-enable doesn't double-fire.
    sessionRef.current = { startedAt: 0, mediaIds: new Set(), allComments: [] }
    if (durationSec < 60 && session.allComments.length < 3) return  // not meaningful
    try {
      await window.api.ai.xyreneAppendSessionLearnings({
        mediaIds: Array.from(session.mediaIds),
        xyComments: session.allComments,
        durationSec,
      })
    } catch (err) {
      console.warn('[WatchWithXy] flushSessionLearnings failed:', err)
    }
  }, [])

  // Ticker for the polling loop — guarded against overlap so a slow Venice
  // call (5-10s) doesn't queue a backlog of frames behind it.
  const tickerRef = useRef<NodeJS.Timeout | null>(null)
  const inFlightRef = useRef(false)

  // ── Health probe (run once on mount + when toggle re-enabled) ─────────
  const probeHealth = useCallback(async () => {
    try {
      const h: any = await window.api.ai.xyreneHealth()
      setHealth({
        kind: 'ok',
        voiceServerOnline: !!h?.voiceServerOnline,
        characterFound: !!h?.characterFound,
        characterDir: h?.characterDir || '',
      })
    } catch (err: any) {
      setHealth({ kind: 'error', message: err?.message ?? 'health check failed' })
    }
  }, [])

  useEffect(() => { probeHealth() }, [probeHealth])

  // ── Audio queue runner ────────────────────────────────────────────────
  const playNextInQueue = useCallback(() => {
    if (isAudioPlayingRef.current) return
    const next = audioQueueRef.current.shift()
    if (!next) return
    isAudioPlayingRef.current = true
    if (!audioElRef.current) audioElRef.current = new Audio()
    const audio = audioElRef.current
    audio.src = next
    audio.muted = audioMuted
    audio.onended = () => {
      isAudioPlayingRef.current = false
      // Revoke the blob URL once playback's done — keeps memory tight.
      try { URL.revokeObjectURL(next) } catch { /* ignore */ }
      playNextInQueue()
    }
    audio.onerror = () => {
      console.warn('[WatchWithXy] audio playback error')
      isAudioPlayingRef.current = false
      try { URL.revokeObjectURL(next) } catch { /* ignore */ }
      playNextInQueue()
    }
    audio.play().catch((err) => {
      console.warn('[WatchWithXy] audio.play() rejected:', err)
      isAudioPlayingRef.current = false
      try { URL.revokeObjectURL(next) } catch { /* ignore */ }
      playNextInQueue()
    })
  }, [audioMuted])

  // Update muted state on the live element if it exists.
  useEffect(() => {
    if (audioElRef.current) audioElRef.current.muted = audioMuted
  }, [audioMuted])

  // ── Polling loop ──────────────────────────────────────────────────────
  const tick = useCallback(async () => {
    if (!enabled) return
    const video = videoRef.current
    if (!video || video.paused) return  // skip while paused; resumes naturally
    if (inFlightRef.current) return     // skip if previous tick still running
    inFlightRef.current = true
    setBusy(true)
    try {
      const frame = captureFrame(video)
      if (!frame) return

      const result: any = await window.api.ai.xyreneComment({
        mediaId,
        currentTimeSec: video.currentTime,
        durationSec: durationSec ?? video.duration ?? null,
        frameDataUrl: frame,
        recentComments: recentTextsRef.current.slice(-6),
        speak: true,
      })

      if (!result?.text) return
      const text: string = result.text
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
      setComments(prev => [...prev.slice(-19), { id, text, at: video.currentTime, generatedAt: Date.now() }])
      recentTextsRef.current.push(text)
      // Track for session-learning aggregation.
      sessionRef.current.mediaIds.add(mediaId)
      sessionRef.current.allComments.push(text)

      if (result.audioBase64 && result.audioMime) {
        try {
          const bytes = Uint8Array.from(atob(result.audioBase64), (c) => c.charCodeAt(0))
          const blob = new Blob([bytes], { type: result.audioMime })
          const url = URL.createObjectURL(blob)
          audioQueueRef.current.push(url)
          playNextInQueue()
        } catch (err) {
          console.warn('[WatchWithXy] failed to decode audio:', err)
        }
      }
    } catch (err: any) {
      console.warn('[WatchWithXy] tick failed:', err?.message ?? err)
    } finally {
      inFlightRef.current = false
      setBusy(false)
    }
  }, [enabled, mediaId, durationSec, videoRef, playNextInQueue])

  // Start / stop the ticker when `enabled` flips. Session-tracking starts
  // on enable and FLUSHES learnings on disable.
  useEffect(() => {
    if (!enabled) {
      if (tickerRef.current) { clearInterval(tickerRef.current); tickerRef.current = null }
      // Disable triggers the auto-learn pass. Fire-and-forget — main
      // process handles dedup + skip-if-too-short.
      void flushSessionLearnings()
      return
    }
    // Start a fresh session.
    sessionRef.current = { startedAt: Date.now(), mediaIds: new Set([mediaId]), allComments: [] }
    // Fire once immediately, then on cadence.
    void tick()
    tickerRef.current = setInterval(() => { void tick() }, Math.max(3, intervalSec) * 1000)
    return () => {
      if (tickerRef.current) { clearInterval(tickerRef.current); tickerRef.current = null }
    }
  }, [enabled, intervalSec, tick, mediaId, flushSessionLearnings])

  // Reset comment state when media changes — but DON'T reset the session
  // (the user is still in the same watch-along session, just on a
  // different video). The session captures the multi-video arc.
  useEffect(() => {
    setComments([])
    recentTextsRef.current = []
    audioQueueRef.current.forEach(u => { try { URL.revokeObjectURL(u) } catch {} })
    audioQueueRef.current = []
    if (sessionRef.current.startedAt) {
      sessionRef.current.mediaIds.add(mediaId)
    }
  }, [mediaId])

  // Cleanup on unmount — flush any in-flight session.
  useEffect(() => {
    return () => {
      if (tickerRef.current) clearInterval(tickerRef.current)
      audioQueueRef.current.forEach(u => { try { URL.revokeObjectURL(u) } catch {} })
      if (audioElRef.current) {
        audioElRef.current.pause()
        audioElRef.current.src = ''
      }
      void flushSessionLearnings()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Decide how the toggle button looks based on health.
  const ready =
    health.kind === 'ok' &&
    health.voiceServerOnline &&
    health.characterFound

  const blockerText =
    health.kind === 'error' ? `Health check failed: ${health.message}` :
    health.kind === 'unknown' ? 'Checking Xyrene…' :
    !health.characterFound ? `Character bible not found at ${health.characterDir}` :
    !health.voiceServerOnline ? 'XTTS voice server is offline (start xyrene-portable\'s xtts-server)' :
    null

  return (
    // Outer container is non-interactive — every click except those on the
    // explicit buttons / transcript MUST pass through to the video element
    // and the FloatingVideoPlayer's drag/resize handlers underneath. Bug
    // 2026-05-09: an earlier version of this overlay swallowed pointer
    // events across a 384px corner, which broke "drag the popup" and
    // "click to play" on the right side of the floating player.
    //
    // Anchored TOP-LEFT (not right) — the FloatingVideoPlayer's close +
    // settings buttons live on the right, this overlay would block them.
    <div className={`absolute left-2 z-30 flex flex-col items-start gap-2 max-w-sm pointer-events-none transition-all duration-300 ${titleVisible ? 'top-9' : 'top-2'}`}>
      <div className="flex items-center gap-2 pointer-events-auto">
        {enabled && (
          <button
            onClick={() => setAudioMuted(m => !m)}
            title={audioMuted ? 'Unmute Xyrene' : 'Mute Xyrene'}
            className="p-2 rounded-full bg-black/70 backdrop-blur-md border border-white/10 hover:bg-black/85 transition"
          >
            {audioMuted ? <MicOff size={14} className="text-white/60" /> : <Mic size={14} className="text-pink-300" />}
          </button>
        )}
        <button
          onClick={() => {
            if (!ready) { void probeHealth(); return }
            setEnabled(e => !e)
          }}
          disabled={!ready}
          title={blockerText ?? 'Watch With Xyrene'}
          className={`flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-medium border transition backdrop-blur-md ${
            enabled
              ? 'bg-pink-500/30 border-pink-400/50 text-pink-100'
              : ready
              ? 'bg-black/70 border-white/10 text-white/80 hover:bg-black/85'
              : 'bg-black/40 border-white/5 text-white/40 cursor-not-allowed'
          }`}
        >
          {busy ? <Loader2 size={11} className="animate-spin" /> : <Sparkles size={11} />}
          xy
          {!ready && !enabled && <AlertCircle size={11} className="text-amber-300" />}
        </button>
      </div>

      {/* Live transcript — most recent line on top, fades older lines. */}
      {enabled && comments.length > 0 && (
        <div className="bg-black/75 backdrop-blur-md border border-white/10 rounded-xl p-3 max-h-48 overflow-y-auto w-[20rem] shadow-xl pointer-events-auto">
          {[...comments].reverse().slice(0, 6).map((c, idx) => (
            <div
              key={c.id}
              className="text-xs text-white/90 mb-1.5 last:mb-0 leading-relaxed"
              style={{ opacity: Math.max(0.4, 1 - idx * 0.15) }}
            >
              <span className="font-semibold text-pink-300 mr-1.5">Xy</span>
              {c.text}
            </div>
          ))}
        </div>
      )}

      {/* Help tip when ready=false — surface what's wrong so the user can
          fix. pointer-events-none so it doesn't block clicks. */}
      {!ready && !enabled && blockerText && health.kind !== 'unknown' && (
        <div className="bg-amber-500/15 border border-amber-500/40 rounded-lg px-3 py-2 text-[11px] text-amber-200 max-w-[20rem]">
          {blockerText}
        </div>
      )}
    </div>
  )
}

export default WatchWithXy
