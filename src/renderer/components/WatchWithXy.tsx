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
import { useXyreneStreamingVoice } from '../hooks/useXyreneStreamingVoice'

interface WatchWithXyProps {
  videoRef: React.RefObject<HTMLVideoElement | null>
  mediaId: string
  durationSec?: number | null
  /** Override the default comment cadence (seconds). */
  intervalSec?: number
  /** True when the host player's title bar is visible. The button slides
   *  down to clear the title when on, snaps back up to the top when off. */
  titleVisible?: boolean
  /** Current XyreneSoundEngine phase, threaded through to xyrene:comment
   *  so her commentary intensity tracks the actual session escalation. */
  enginePhase?: 'intro' | 'body' | 'build' | 'climax' | 'cooldown'
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
 * Split text into speakable chunks with natural breath/pause hints.
 * Splits on sentence boundaries (.!?…) while preserving the punctuation.
 *   - `?` and `!` → slightly longer pause (questions/exclaim land)
 *   - `…` (ellipsis) → longest pause (hesitation, lingering)
 *   - `.` → medium pause
 *   - `,` and `;` → kept within the chunk; XTTS handles prosody
 *
 * Each chunk includes the trailing punctuation so the TTS engine
 * naturally rolls into the breath without sounding cut off.
 */
function splitForSpeech(text: string): Array<{ text: string; pauseMs: number }> {
  const out: Array<{ text: string; pauseMs: number }> = []
  // Split on sentence terminators while keeping the terminator with the
  // preceding sentence. Captures the punctuation in a separate group so
  // we can size the pause after each segment.
  const re = /([^.!?…]+[.!?…]+|[^.!?…]+$)/g
  const matches = text.match(re)
  if (!matches) {
    return [{ text, pauseMs: 0 }]
  }
  for (let i = 0; i < matches.length; i++) {
    const piece = matches[i].trim()
    if (!piece) continue
    const last = piece[piece.length - 1]
    let pauseMs = 0
    if (i < matches.length - 1) {
      // Pause is for the break BEFORE the next sentence — not after the last.
      pauseMs = last === '…' ? 600
        : last === '!' || last === '?' ? 320
        : last === '.' ? 240
        : 180
    }
    out.push({ text: piece, pauseMs })
  }
  return out
}

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

export function WatchWithXy({ videoRef, mediaId, durationSec, intervalSec = 8, titleVisible = true, enginePhase }: WatchWithXyProps) {
  const [enabled, setEnabled] = useState(false)
  const [busy, setBusy] = useState(false)
  const [comments, setComments] = useState<XyComment[]>([])
  const [health, setHealth] = useState<HealthState>({ kind: 'unknown' })
  const [audioMuted, setAudioMuted] = useState(false)
  // True while a streaming TTS chunk is actively playing. Drives the
  // "now speaking" pulse on the button + the video-audio ducking.
  const [isSpeaking, setIsSpeaking] = useState(false)

  // Streaming TTS — sub-second voice latency vs the 1-3s buffered /tts
  // path. Plays raw PCM via Web Audio as chunks stream from the XTTS
  // server. Falls back to the buffered audio queue if streaming fails.
  const streaming = useXyreneStreamingVoice()

  // Audio playback queue: comments arrive faster than they finish playing
  // (long Xyrene reaction or short interval), so we serialize them.
  // Each entry is EITHER a blob URL (legacy buffered audio) OR a
  // "stream:<text>" sentinel that the runner expands via streaming TTS.
  const audioQueueRef = useRef<string[]>([])
  const audioElRef = useRef<HTMLAudioElement | null>(null)
  const isAudioPlayingRef = useRef(false)
  // Cached voice sample so the streaming runner doesn't refetch settings
  // on every line.
  const voiceSampleRef = useRef<string | null>(null)

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
  // Queue entries are either:
  //   - "stream:<expression>|<text>"  → play via streaming TTS (XTTS server)
  //   - "pause:<ms>"                  → silent wait between sentences
  //   - any other string              → blob URL for legacy buffered <audio>
  // All three converge on the same serialization logic so two lines never
  // overlap.
  const playNextInQueue = useCallback(() => {
    if (isAudioPlayingRef.current) return
    const next = audioQueueRef.current.shift()
    if (!next) {
      setIsSpeaking(false)
      return
    }
    isAudioPlayingRef.current = true

    // Silent inter-sentence breath. setIsSpeaking(true) is kept so the
    // ducking + pulse keep going during the pause — she's still "in"
    // the line.
    if (next.startsWith('pause:')) {
      const ms = Math.max(0, parseInt(next.slice('pause:'.length), 10) || 0)
      setIsSpeaking(true)
      window.setTimeout(() => {
        isAudioPlayingRef.current = false
        playNextInQueue()
      }, ms)
      return
    }

    // Streaming path — XTTS server streams PCM chunks; the hook
    // schedules them in Web Audio for sub-second start latency.
    if (next.startsWith('stream:')) {
      const rest = next.slice('stream:'.length)
      // "expression|text" split — expression may be empty.
      const splitIdx = rest.indexOf('|')
      const expression = splitIdx >= 0 ? rest.slice(0, splitIdx) : ''
      const text = splitIdx >= 0 ? rest.slice(splitIdx + 1) : rest
      const voice = voiceSampleRef.current ?? undefined
      // Audio cues parsed from leading [EXPRESSION] are conveyed via
      // the expression hint; the spoken text already has it stripped.
      const handle = streaming.speakStreaming(text, {
        voice,
        volume: audioMuted ? 0 : 1,
        onStart: () => setIsSpeaking(true),
        onEnd: () => {
          setIsSpeaking(false)
          isAudioPlayingRef.current = false
          playNextInQueue()
        },
      })
      // Failsafe: if no onEnd within 30s, force-advance the queue.
      window.setTimeout(() => {
        if (!handle.isActive()) return
        handle.cancel()
      }, 30000)
      void expression  // currently unused but reserved for future server-side cue routing
      return
    }

    // Legacy buffered path — full /tts response is a blob URL already.
    if (!audioElRef.current) audioElRef.current = new Audio()
    const audio = audioElRef.current
    audio.src = next
    audio.muted = audioMuted
    setIsSpeaking(true)
    audio.onended = () => {
      setIsSpeaking(false)
      isAudioPlayingRef.current = false
      // Revoke the blob URL once playback's done — keeps memory tight.
      try { URL.revokeObjectURL(next) } catch { /* ignore */ }
      playNextInQueue()
    }
    audio.onerror = () => {
      console.warn('[WatchWithXy] audio playback error')
      setIsSpeaking(false)
      isAudioPlayingRef.current = false
      try { URL.revokeObjectURL(next) } catch { /* ignore */ }
      playNextInQueue()
    }
    audio.play().catch((err) => {
      console.warn('[WatchWithXy] audio.play() rejected:', err)
      setIsSpeaking(false)
      isAudioPlayingRef.current = false
      try { URL.revokeObjectURL(next) } catch { /* ignore */ }
      playNextInQueue()
    })
  }, [audioMuted, streaming])

  // Update muted state on the live element if it exists.
  useEffect(() => {
    if (audioElRef.current) audioElRef.current.muted = audioMuted
  }, [audioMuted])

  // Cache the user's chosen voice sample for the streaming TTS path.
  // Refreshes on enable so changes in settings get picked up between
  // toggle cycles.
  useEffect(() => {
    if (!enabled) return
    void (async () => {
      try {
        const s: any = await window.api.settings.get()
        voiceSampleRef.current = s?.xyrene?.voiceSample ?? null
      } catch { voiceSampleRef.current = null }
    })()
  }, [enabled])

  // Speech ducking — when Xyrene is mid-sentence, drop the host video's
  // volume to 25% so her voice cuts through clearly. Restore on stop.
  // Uses an inline ref so we don't have to render-react to volume
  // changes ourselves.
  const originalVolumeRef = useRef<number | null>(null)
  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    if (isSpeaking) {
      if (originalVolumeRef.current == null) {
        originalVolumeRef.current = video.volume
      }
      // 25% — quiet enough that her voice dominates, loud enough that
      // the user knows the video is still playing.
      try { video.volume = Math.min(video.volume, 0.25) } catch { /* ignore */ }
    } else if (originalVolumeRef.current != null) {
      try { video.volume = originalVolumeRef.current } catch { /* ignore */ }
      originalVolumeRef.current = null
    }
  }, [isSpeaking, videoRef])

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

      // Ask for text-only response — we'll synthesize via streaming
      // TTS in the renderer for sub-second voice latency. Falls back
      // to buffered audio if the renderer can't stream.
      const result: any = await window.api.ai.xyreneComment({
        mediaId,
        currentTimeSec: video.currentTime,
        durationSec: durationSec ?? video.duration ?? null,
        frameDataUrl: frame,
        recentComments: recentTextsRef.current.slice(-6),
        speak: false,
        phase: enginePhase,
      })

      if (!result?.text) return
      const text: string = result.text
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
      setComments(prev => [...prev.slice(-19), { id, text, at: video.currentTime, generatedAt: Date.now() }])
      recentTextsRef.current.push(text)
      // Track for session-learning aggregation.
      sessionRef.current.mediaIds.add(mediaId)
      sessionRef.current.allComments.push(text)

      // Strip the optional leading inflection cue ([BREATHY], etc) from
      // the audio text — the cue itself shouldn't be read aloud, only
      // forwarded as an expression hint to XTTS.
      const cueMatch = text.match(/^\s*\[(BREATHY|WHISPERED|MOANED|DESPERATE|COMMANDED|LAUGHING)\]\s*/i)
      const expression = cueMatch ? cueMatch[1].toLowerCase() : ''
      const spokenText = cueMatch ? text.slice(cueMatch[0].length).trim() : text
      if (spokenText) {
        // Multi-sentence sequencing — split her reaction into sentences
        // and queue each separately with a natural breath pause between.
        // Splits on `. ! ? …` while preserving the punctuation. Ellipses
        // get a longer pause because they signal hesitation/lingering.
        const sentences = splitForSpeech(spokenText)
        for (const seg of sentences) {
          if (seg.text.trim().length === 0) continue
          audioQueueRef.current.push(`stream:${expression}|${seg.text}`)
          if (seg.pauseMs > 0) {
            audioQueueRef.current.push(`pause:${seg.pauseMs}`)
          }
        }
        playNextInQueue()
      }

      // Fallback path — if the server bundled audio (e.g. streaming
      // unavailable), enqueue the blob URL as before. Not used in the
      // default speak:false path above; preserved so users on older
      // server builds still get audio.
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
          title={blockerText ?? (isSpeaking ? 'Xyrene is speaking…' : 'Watch With Xyrene')}
          className={`relative flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-medium border transition backdrop-blur-md ${
            enabled
              ? 'bg-pink-500/30 border-pink-400/50 text-pink-100'
              : ready
              ? 'bg-black/70 border-white/10 text-white/80 hover:bg-black/85'
              : 'bg-black/40 border-white/5 text-white/40 cursor-not-allowed'
          } ${isSpeaking ? 'ring-2 ring-pink-300/80 ring-offset-0 shadow-lg shadow-pink-500/40' : ''}`}
        >
          {/* Animated pulse ring underneath when speaking — radiates
              outward to telegraph her active voice activity. */}
          {isSpeaking && (
            <span className="absolute inset-0 rounded-full bg-pink-400/30 animate-ping pointer-events-none" />
          )}
          {busy ? <Loader2 size={11} className="animate-spin relative z-10" /> : <Sparkles size={11} className="relative z-10" />}
          <span className="relative z-10">xy</span>
          {!ready && !enabled && <AlertCircle size={11} className="text-amber-300 relative z-10" />}
        </button>
      </div>

      {/* Live transcript — most recent line on top, fades older lines.
          Inflection cue tags ([BREATHY], [MOANED], etc) get rendered as
          colored chips so the user can see how she's saying things. */}
      {enabled && comments.length > 0 && (
        <div className="bg-black/75 backdrop-blur-md border border-white/10 rounded-xl p-3 max-h-48 overflow-y-auto w-[20rem] shadow-xl pointer-events-auto">
          {[...comments].reverse().slice(0, 6).map((c, idx) => {
            const m = c.text.match(/^\s*\[(BREATHY|WHISPERED|MOANED|DESPERATE|COMMANDED|LAUGHING)\]\s*/i)
            const cue = m ? m[1].toUpperCase() : null
            const body = m ? c.text.slice(m[0].length).trim() : c.text
            // Cue → color: warm pink for intimate, red for peak, etc.
            const cueClass = cue === 'MOANED' || cue === 'DESPERATE' ? 'bg-rose-500/30 text-rose-200'
              : cue === 'BREATHY' || cue === 'WHISPERED' ? 'bg-pink-500/20 text-pink-200'
              : cue === 'COMMANDED' ? 'bg-violet-500/25 text-violet-200'
              : cue === 'LAUGHING' ? 'bg-amber-500/20 text-amber-200'
              : ''
            return (
              <div
                key={c.id}
                className="text-xs text-white/90 mb-1.5 last:mb-0 leading-relaxed"
                style={{ opacity: Math.max(0.4, 1 - idx * 0.15) }}
              >
                <span className="font-semibold text-pink-300 mr-1.5">Xy</span>
                {cue && (
                  <span className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-mono uppercase tracking-widest mr-1.5 align-middle ${cueClass}`}>
                    {cue}
                  </span>
                )}
                {body}
              </div>
            )
          })}
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
