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
 * Persona → voice baseline. Each persona is a different character with
 * a different default voice signature; phase-driven adjustments layer
 * on top so e.g. a "mistress" persona's climax still escalates but
 * stays commanding instead of moaned. Default is goonbud.
 */
type PersonaName = 'goonbud' | 'mistress' | 'stepsister' | 'boss' | 'cheerleader'
const PERSONA_VOICE: Record<PersonaName, { speed: number; pitch: number; expression: string }> = {
  goonbud:     { speed: 1.0,  pitch: 0,    expression: 'sultry' },
  mistress:    { speed: 0.93, pitch: -1.5, expression: 'commanded' },
  stepsister:  { speed: 1.05, pitch: 1.0,  expression: 'playful' },
  boss:        { speed: 0.95, pitch: -0.5, expression: 'commanding' },
  cheerleader: { speed: 1.1,  pitch: 1.5,  expression: 'enthusiastic' },
}

/**
 * Apply phase-keyed verbal "stutters" to a sentence. At high arousal
 * (build/climax), randomly stutter the first character of select words
 * — "fuck" → "f-fuck", "i" → "i-i". Adds a human, near-edge quality
 * that flat text-to-speech can't produce on its own.
 *
 * Only fires ~25% of the time so it doesn't become a tic. Skips words
 * shorter than 2 characters or that start with non-letters.
 */
function applyArousalStutter(text: string, phase: string | undefined): string {
  if (phase !== 'build' && phase !== 'climax') return text
  // 25% chance overall — keeps it occasional, not annoying.
  if (Math.random() > 0.25) return text
  // Pick a high-impact word: prefer "fuck", "god", "yes", "oh", "i",
  // "cum", "please", "more" if present. Otherwise stutter the first
  // long-enough word.
  const stutterPool = /\b(fuck|god|jesus|yes|oh|i|cum|please|more|don'?t)\b/i
  const match = text.match(stutterPool)
  if (match) {
    const word = match[0]
    const firstChar = word[0]
    const stuttered = `${firstChar.toLowerCase()}-${word.toLowerCase()}`
    return text.replace(word, stuttered)
  }
  return text
}

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

  // Per-video commentary memory ACROSS sessions. Persists her reactions
  // to each media in localStorage so when the user re-watches a video
  // later, she can reference what she said before ("i remember this
  // one — last time you were obsessed with how she moved").
  //
  // Storage key: vault.xyrene.memory.<mediaId>
  // Format: { lastSeen: number, lines: string[] } — capped at 12 lines
  // per video so storage stays bounded.
  const MEMORY_KEY = (id: string) => `vault.xyrene.memory.${id}`
  const MEMORY_CAP = 12
  // GLOBAL cross-video memory — every reaction (with the filename it
  // was about) gets appended to a single rolling log so she can also
  // reference "earlier today you watched that brunette..." across
  // different media. Capped at 40 entries.
  const GLOBAL_MEMORY_KEY = 'vault.xyrene.global-memory'
  const GLOBAL_MEMORY_CAP = 40
  type GlobalMemoryEntry = { ts: number; mediaId: string; filename: string; line: string }
  const loadGlobalMemory = (): GlobalMemoryEntry[] => {
    try {
      const raw = window.localStorage.getItem(GLOBAL_MEMORY_KEY)
      if (!raw) return []
      const arr = JSON.parse(raw)
      if (!Array.isArray(arr)) return []
      return arr.filter((e: any) => e && typeof e.line === 'string' && typeof e.filename === 'string') as GlobalMemoryEntry[]
    } catch { return [] }
  }
  const appendGlobalMemory = (entry: GlobalMemoryEntry) => {
    try {
      const existing = loadGlobalMemory()
      const next = [...existing, entry].slice(-GLOBAL_MEMORY_CAP)
      window.localStorage.setItem(GLOBAL_MEMORY_KEY, JSON.stringify(next))
    } catch { /* ignore */ }
  }
  const loadVideoMemory = (id: string): string[] => {
    try {
      const raw = window.localStorage.getItem(MEMORY_KEY(id))
      if (!raw) return []
      const parsed = JSON.parse(raw)
      const lines: string[] = Array.isArray(parsed?.lines) ? parsed.lines : []
      return lines.filter((l) => typeof l === 'string' && l.trim().length > 0)
    } catch { return [] }
  }
  const appendVideoMemory = (id: string, line: string) => {
    try {
      const existing = loadVideoMemory(id)
      // Skip duplicates — she shouldn't think she said something three
      // times across sessions when really it just happens to be similar.
      if (existing.includes(line)) return
      const next = [...existing, line].slice(-MEMORY_CAP)
      window.localStorage.setItem(MEMORY_KEY(id), JSON.stringify({
        lastSeen: Date.now(),
        lines: next,
      }))
    } catch { /* storage full / disabled — ignore */ }
  }
  // Cache her memory for the current media at mount time so we don't
  // hit localStorage on every tick. Refreshed on mediaId change.
  const videoMemoryRef = useRef<string[]>([])
  // Cache the global cross-video memory; refreshed on enable so it
  // includes reactions from prior sessions even after a page reload.
  const globalMemoryRef = useRef<GlobalMemoryEntry[]>([])
  useEffect(() => {
    if (!enabled) return
    globalMemoryRef.current = loadGlobalMemory()
  }, [enabled])

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
      // Phase-driven volume envelope — intro/cooldown are quiet/intimate
      // (~50% gain), body baseline (~75%), build escalating (~90%),
      // climax full peak (100%). Mirrors the climax-burst voice volume
      // so commentary feels like a continuous arc, not a flat layer.
      const phaseGain = enginePhase === 'climax' ? 1.0
        : enginePhase === 'build' ? 0.9
        : enginePhase === 'body' ? 0.75
        : enginePhase === 'intro' || enginePhase === 'cooldown' ? 0.55
        : 0.85
      // Persona baseline + phase overlay. Persona defines the character's
      // resting voice (mistress = lower / commanded, cheerleader =
      // higher / enthusiastic). Phase adds an additive shift on top.
      const persona = personaRef.current
      const personaProfile = PERSONA_VOICE[persona] ?? PERSONA_VOICE.goonbud
      const phaseSpeedShift = enginePhase === 'climax' ? 0 : enginePhase === 'build' ? -0.03 : enginePhase === 'body' ? -0.07 : -0.1
      const phasePitchShift = enginePhase === 'climax' ? 1.0 : enginePhase === 'build' ? 0.5 : enginePhase === 'body' ? 0 : -1.0
      // Expression: prefer the parsed inflection cue from the LLM if
      // present; fall back to a phase-default tinted by persona.
      const lineExpression = expression || (
        enginePhase === 'climax' ? (persona === 'mistress' ? 'commanded' : 'moaned')
        : enginePhase === 'build' ? 'desperate'
        : enginePhase === 'cooldown' || enginePhase === 'intro' ? 'breathy'
        : personaProfile.expression
      )
      const handle = streaming.speakStreaming(text, {
        voice,
        speed: personaProfile.speed + phaseSpeedShift,
        pitch: personaProfile.pitch + phasePitchShift,
        expression: lineExpression,
        volume: audioMuted ? 0 : phaseGain,
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
  }, [audioMuted, streaming, enginePhase])

  // Update muted state on the live element if it exists.
  useEffect(() => {
    if (audioElRef.current) audioElRef.current.muted = audioMuted
  }, [audioMuted])

  // Cache the user's chosen voice sample + persona for the streaming
  // TTS path. Refreshes on enable so changes in settings get picked up
  // between toggle cycles. ALSO pre-warms the XTTS voice embedding via
  // /cache_voice so the first synth call doesn't pay the 1-2s
  // embedding-load cost.
  const personaRef = useRef<PersonaName>('goonbud')
  useEffect(() => {
    if (!enabled) return
    void (async () => {
      try {
        const s: any = await window.api.settings.get()
        voiceSampleRef.current = s?.xyrene?.voiceSample ?? null
        const p = s?.xyrene?.persona as PersonaName | undefined
        personaRef.current = p && PERSONA_VOICE[p] ? p : 'goonbud'
        // Fire-and-forget pre-warm. Doesn't block the rest of the
        // hook lifecycle; if it fails (XTTS offline) the first synth
        // call will just pay the cold-start cost as before.
        if (voiceSampleRef.current) {
          window.api.ai.xyreneCacheVoice?.({ voice: voiceSampleRef.current })
            .catch(() => { /* ignore */ })
        }
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

  // Spontaneous micro-reactions — between full commentary ticks (every
  // 8-15s of NOT-speaking + NOT-listening), randomly inject a short
  // utterance (a sigh, "mmm", "fuck", etc) so she sounds present
  // between actual reactions. Phase-keyed so intro phases sound
  // intimate and climax phases sound peak. Uses the same streaming
  // path so latency is sub-second.
  const MICRO_BY_PHASE: Record<NonNullable<typeof enginePhase>, string[]> = {
    intro:    ['mmm', 'hmm', 'oh wow', 'jesus', 'okay', 'mmm yes'],
    body:     ['fuck', 'mmm', 'god', 'oh', 'yeah', 'shit', 'mhmm', 'yes baby'],
    build:    ['fuck yes', 'oh god', "i'm close", 'right there', 'don\'t stop', 'so good', 'ahh'],
    climax:   ['fuck fuck fuck', 'cumming', 'oh god yes', 'i\'m cumming', 'ahh fuck'],
    cooldown: ['mmm', 'good boy', 'so good', 'jesus christ', 'wow'],
  }
  // Paused-state utterances — fire when the video is paused for >5s
  // so she stays present in the silence instead of disappearing.
  // Low-key, attentive, slightly impatient.
  const PAUSE_PRESENCE_LINES = [
    'mmm', 'you still there?', 'come on', 'don\'t leave me', 'jesus take a breath',
    'i\'m waiting', 'hmm?', 'where\'d you go', 'still warm over here',
  ]
  const pausedSinceRef = useRef<number | null>(null)
  // Track video play/pause state — when video pauses, start the timer;
  // when it resumes, clear it so presence cues stop.
  useEffect(() => {
    if (!enabled) return
    const video = videoRef.current
    if (!video) return
    const onPause = () => { pausedSinceRef.current = Date.now() }
    const onPlay = () => { pausedSinceRef.current = null }
    video.addEventListener('pause', onPause)
    video.addEventListener('play', onPlay)
    return () => {
      video.removeEventListener('pause', onPause)
      video.removeEventListener('play', onPlay)
    }
  }, [enabled, videoRef])
  const lastMicroAtRef = useRef<number>(Date.now())
  useEffect(() => {
    if (!enabled) return
    const interval = window.setInterval(() => {
      if (queuePausedRef.current) return                       // user is talking
      if (isAudioPlayingRef.current) return                    // she's mid-line
      if (audioQueueRef.current.length > 0) return             // queue has a line waiting
      const now = Date.now()

      // Paused-presence path — when the video has been paused for >5s,
      // emit a low-key "still here" utterance every 6-9s instead of
      // disappearing. Stops the moment video resumes.
      const pausedSince = pausedSinceRef.current
      if (pausedSince !== null && now - pausedSince > 5000) {
        const pausedGap = 6000 + Math.random() * 3000
        if (now - lastMicroAtRef.current < pausedGap) return
        lastMicroAtRef.current = now
        const utterance = PAUSE_PRESENCE_LINES[Math.floor(Math.random() * PAUSE_PRESENCE_LINES.length)]
        audioQueueRef.current.push(`stream:breathy|${utterance}`)
        playNextInQueue()
        return
      }

      if (!enginePhase) return                                  // no phase signal yet
      // Throttle — at least 8s between micro reactions, at most 15s.
      const minGap = 8000 + Math.random() * 7000
      if (now - lastMicroAtRef.current < minGap) return
      // 35% chance each tick when eligible — keeps her from being
      // chatty between actual commentary.
      if (Math.random() > 0.35) {
        lastMicroAtRef.current = now
        return
      }
      lastMicroAtRef.current = now
      const pool = MICRO_BY_PHASE[enginePhase] || MICRO_BY_PHASE.body
      const utterance = pool[Math.floor(Math.random() * pool.length)]
      // Phase-keyed expression for the micro reaction.
      const expression = enginePhase === 'climax' ? 'moaned'
        : enginePhase === 'build' ? 'desperate'
        : enginePhase === 'intro' || enginePhase === 'cooldown' ? 'breathy'
        : 'sultry'
      audioQueueRef.current.push(`stream:${expression}|${utterance}`)
      playNextInQueue()
    }, 4000)
    return () => clearInterval(interval)
  }, [enabled, enginePhase, playNextInQueue])

  // Track the memory size in component state so the badge updates
  // live as she says new things, not just on media change.
  const [memorySize, setMemorySize] = useState(0)
  const [showMemory, setShowMemory] = useState(false)
  useEffect(() => {
    setMemorySize(videoMemoryRef.current.length)
  }, [mediaId, comments.length])

  // Listening mode — when the user starts speaking (voice command
  // recognizer fires onspeechstart), interrupt her current line and
  // pause the queue. Resumes when the user stops speaking. Without
  // this she'd talk over them and the recognizer would mishear.
  //
  // Echo suppression: while SHE is speaking, ignore "speaking start"
  // events — the recognizer is almost certainly picking up her own
  // audio bleeding through the mic. Without this, every line she says
  // would cancel itself mid-sentence. The 250ms tail guard extends the
  // suppression briefly after she finishes so the recognizer doesn't
  // catch the very end of her last word.
  const queuePausedRef = useRef(false)
  const isSpeakingRef = useRef(false)
  const lastSpeakingEndedAtRef = useRef<number>(0)
  useEffect(() => {
    isSpeakingRef.current = isSpeaking
    if (!isSpeaking) lastSpeakingEndedAtRef.current = Date.now()
  }, [isSpeaking])

  useEffect(() => {
    const onSpeaking = (ev: Event) => {
      const detail = (ev as CustomEvent).detail as { state?: 'start' | 'end' } | undefined
      if (detail?.state === 'start') {
        // Echo guard — if SHE is currently speaking or just stopped
        // within the last 250ms, treat this as her own voice bleeding
        // through the mic and ignore.
        if (isSpeakingRef.current) return
        if (Date.now() - lastSpeakingEndedAtRef.current < 250) return
        // Cancel in-flight streams immediately — don't wait for the
        // line to finish. The user is talking NOW.
        streaming.cancelAll()
        queuePausedRef.current = true
        setIsSpeaking(false)
      } else if (detail?.state === 'end') {
        if (queuePausedRef.current) {
          queuePausedRef.current = false
          // Don't replay the cancelled line — just let new commentary
          // ticks land naturally. Queue is empty anyway after cancelAll.
        }
      }
    }
    window.addEventListener('vault:user-speaking', onSpeaking)
    return () => window.removeEventListener('vault:user-speaking', onSpeaking)
  }, [streaming])

  // ── Polling loop ──────────────────────────────────────────────────────
  const tick = useCallback(async () => {
    if (!enabled) return
    const video = videoRef.current
    if (!video || video.paused) return  // skip while paused; resumes naturally
    if (inFlightRef.current) return     // skip if previous tick still running
    if (queuePausedRef.current) return  // listening mode — user is talking
    inFlightRef.current = true
    setBusy(true)
    try {
      const frame = captureFrame(video)
      if (!frame) return

      // Ask for text-only response — we'll synthesize via streaming
      // TTS in the renderer for sub-second voice latency. Falls back
      // to buffered audio if the renderer can't stream.
      // Sample 2 cross-video memories from OTHER media (not this one),
      // weighted toward recent — she can reference earlier-today
      // reactions like "i was just losing it over that brunette".
      const otherMemories = globalMemoryRef.current
        .filter((e) => e.mediaId !== mediaId)
        .slice(-15)  // recency window
      const sampledGlobal: Array<{ filename: string; line: string }> = []
      if (otherMemories.length > 0) {
        // Pick at most 2 random entries from the recency window.
        const picks = Math.min(2, otherMemories.length)
        const shuffled = [...otherMemories].sort(() => Math.random() - 0.5)
        for (let i = 0; i < picks; i++) {
          sampledGlobal.push({ filename: shuffled[i].filename, line: shuffled[i].line })
        }
      }
      const result: any = await window.api.ai.xyreneComment({
        mediaId,
        currentTimeSec: video.currentTime,
        durationSec: durationSec ?? video.duration ?? null,
        frameDataUrl: frame,
        recentComments: recentTextsRef.current.slice(-6),
        // Sprinkle 3 lines from her per-video memory so she can
        // reference past sessions with this media. Sent alongside
        // recentComments — the prompt will surface them with a
        // "you've watched this before" hint.
        pastMemories: videoMemoryRef.current.slice(-3),
        // Cross-video memories — sampled from her global log to give
        // her continuity across the whole session arc, not just this
        // media. Prompt surfaces these as "earlier you said…" cues.
        globalMemories: sampledGlobal,
        speak: false,
        phase: enginePhase,
        persona: personaRef.current,
      })

      if (!result?.text) return
      const text: string = result.text
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
      setComments(prev => [...prev.slice(-19), { id, text, at: video.currentTime, generatedAt: Date.now() }])
      recentTextsRef.current.push(text)
      // Persist to per-video memory so future sessions can reference
      // this reaction. Stutter / cue prefixes are stripped so the
      // memory holds clean "what she said".
      const cleanForMemory = text.replace(/^\s*\[[^\]]+\]\s*/, '').trim()
      appendVideoMemory(mediaId, cleanForMemory)
      videoMemoryRef.current.push(cleanForMemory)
      if (videoMemoryRef.current.length > MEMORY_CAP) {
        videoMemoryRef.current = videoMemoryRef.current.slice(-MEMORY_CAP)
      }
      // Also append to the GLOBAL cross-video memory so she can later
      // say "earlier today you watched that brunette..." across media.
      const mediaRowForName = await window.api.media?.get?.(mediaId).catch(() => null) as any
      const filename = mediaRowForName?.filename ?? mediaRowForName?.path?.split(/[\\/]/).pop() ?? mediaId
      const globalEntry: GlobalMemoryEntry = { ts: Date.now(), mediaId, filename, line: cleanForMemory }
      appendGlobalMemory(globalEntry)
      globalMemoryRef.current.push(globalEntry)
      if (globalMemoryRef.current.length > GLOBAL_MEMORY_CAP) {
        globalMemoryRef.current = globalMemoryRef.current.slice(-GLOBAL_MEMORY_CAP)
      }
      // Track for session-learning aggregation.
      sessionRef.current.mediaIds.add(mediaId)
      sessionRef.current.allComments.push(text)

      // Strip the optional leading inflection cue ([BREATHY], etc) from
      // the audio text — the cue itself shouldn't be read aloud, only
      // forwarded as an expression hint to XTTS.
      const cueMatch = text.match(/^\s*\[(BREATHY|WHISPERED|MOANED|DESPERATE|COMMANDED|LAUGHING)\]\s*/i)
      const expression = cueMatch ? cueMatch[1].toLowerCase() : ''
      const stripped = cueMatch ? text.slice(cueMatch[0].length).trim() : text
      // Apply phase-keyed verbal stutter (build/climax phases only).
      const spokenText = applyArousalStutter(stripped, enginePhase)
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

  // Voice-command-triggered immediate commentary. Listens for a
  // "vault:xyrene-talk-now" window event and fires a tick out-of-band.
  // Uses a ref to the latest tick closure so phase changes are
  // reflected even with a long-lived listener.
  const tickRef = useRef(tick)
  useEffect(() => { tickRef.current = tick }, [tick])
  useEffect(() => {
    if (!enabled) return
    const onTalkNow = () => { void tickRef.current?.() }
    const onReplayLast = () => {
      // Replay the most recent comment via streaming TTS. Falls back
      // to the most recent persisted memory line when in-memory list
      // is empty (e.g. session just started, but she watched this
      // video before).
      const lastFromList = comments.length > 0 ? comments[comments.length - 1].text : null
      const fallback = videoMemoryRef.current.length > 0
        ? videoMemoryRef.current[videoMemoryRef.current.length - 1]
        : null
      const candidate = lastFromList ?? fallback
      if (!candidate) return
      const cueMatch = candidate.match(/^\s*\[(BREATHY|WHISPERED|MOANED|DESPERATE|COMMANDED|LAUGHING)\]\s*/i)
      const expression = cueMatch ? cueMatch[1].toLowerCase() : ''
      const spokenText = cueMatch ? candidate.slice(cueMatch[0].length).trim() : candidate
      if (spokenText) {
        audioQueueRef.current.push(`stream:${expression}|${spokenText}`)
        playNextInQueue()
      }
    }
    window.addEventListener('vault:xyrene-talk-now', onTalkNow)
    window.addEventListener('vault:xyrene-replay-last', onReplayLast)
    return () => {
      window.removeEventListener('vault:xyrene-talk-now', onTalkNow)
      window.removeEventListener('vault:xyrene-replay-last', onReplayLast)
    }
  }, [enabled, comments, playNextInQueue])

  // Phase-adaptive cadence — comments more often at climax (every 5s),
  // less often at cooldown (every 14s), default 8s in body/intro.
  // Scales the user-supplied intervalSec by a per-phase factor so the
  // override still works (e.g. interval=4 still gives 2.5s at climax).
  const effectiveIntervalSec = (() => {
    const factor = enginePhase === 'climax' ? 0.5
      : enginePhase === 'build' ? 0.75
      : enginePhase === 'cooldown' ? 1.75
      : 1.0
    return Math.max(3, intervalSec * factor)
  })()

  // Start / stop the ticker when `enabled` flips. Session-tracking starts
  // on enable and FLUSHES learnings on disable. Cadence re-arms when
  // the phase changes so escalation feels responsive.
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
    tickerRef.current = setInterval(() => { void tick() }, effectiveIntervalSec * 1000)
    return () => {
      if (tickerRef.current) { clearInterval(tickerRef.current); tickerRef.current = null }
    }
  }, [enabled, effectiveIntervalSec, tick, mediaId, flushSessionLearnings])

  // Reset comment state when media changes — but DON'T reset the session
  // (the user is still in the same watch-along session, just on a
  // different video). The session captures the multi-video arc.
  // Also loads her per-video memory so she can reference past reactions
  // to the same media.
  useEffect(() => {
    setComments([])
    recentTextsRef.current = []
    audioQueueRef.current.forEach(u => { try { URL.revokeObjectURL(u) } catch {} })
    audioQueueRef.current = []
    if (sessionRef.current.startedAt) {
      sessionRef.current.mediaIds.add(mediaId)
    }
    videoMemoryRef.current = loadVideoMemory(mediaId)
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
        {/* Phase / arousal indicator — surfaces what mode she's in
            right now (intro / body / build / climax / cooldown) and
            roughly how desperate her commentary will sound. Updates
            live as the engine phase changes. */}
        {enabled && enginePhase && (() => {
          const phaseLabel = enginePhase[0].toUpperCase() + enginePhase.slice(1)
          const arousalEmoji = enginePhase === 'climax' ? '🥵'
            : enginePhase === 'build' ? '😤'
            : enginePhase === 'body' ? '😏'
            : enginePhase === 'intro' ? '🙂'
            : '😌'
          const cls = enginePhase === 'climax' ? 'bg-red-500/25 border-red-400/40 text-red-200'
            : enginePhase === 'build' ? 'bg-amber-500/20 border-amber-400/40 text-amber-200'
            : enginePhase === 'body' ? 'bg-pink-500/20 border-pink-400/40 text-pink-200'
            : enginePhase === 'cooldown' ? 'bg-slate-500/20 border-slate-400/40 text-slate-200'
            : 'bg-emerald-500/20 border-emerald-400/40 text-emerald-200'
          return (
            <div
              className={`px-2 py-1 rounded-full text-[10px] font-medium border backdrop-blur-md flex items-center gap-1 pointer-events-auto ${cls}`}
              title={`Engine phase: ${phaseLabel}. Drives her commentary tone + cadence.`}
            >
              <span>{arousalEmoji}</span>
              <span className="uppercase tracking-wider text-[9px]">{phaseLabel}</span>
            </div>
          )
        })()}

        {/* Memory chip — only shows when she has past reactions to
            this video. Click to peek at what she remembers. */}
        {enabled && memorySize > 0 && (
          <button
            onClick={() => setShowMemory(v => !v)}
            title={`She remembers ${memorySize} past reaction${memorySize === 1 ? '' : 's'} to this video`}
            className="px-2 py-1 rounded-full text-[10px] font-medium border bg-violet-500/20 hover:bg-violet-500/35 border-violet-400/40 text-violet-200 transition flex items-center gap-1 backdrop-blur-md pointer-events-auto"
          >
            <span>{memorySize}</span>
            <span className="text-[8px] uppercase tracking-wider opacity-70">mem</span>
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

      {/* Memory popover — surfaces what she remembers about THIS video
          across all sessions. Lets the user inspect / delete entries
          so memory stays curated. */}
      {enabled && showMemory && (
        <div className="bg-violet-950/80 backdrop-blur-md border border-violet-500/40 rounded-xl p-3 w-[20rem] shadow-xl pointer-events-auto">
          <div className="flex items-center justify-between mb-2">
            <div className="text-[10px] text-violet-300 uppercase tracking-widest">What Xy remembers</div>
            <button
              onClick={() => {
                try {
                  window.localStorage.removeItem(MEMORY_KEY(mediaId))
                  videoMemoryRef.current = []
                  setMemorySize(0)
                  setShowMemory(false)
                } catch { /* ignore */ }
              }}
              className="text-[9px] text-violet-300/60 hover:text-red-300 hover:underline"
              title="Wipe her memory for this video"
            >
              forget
            </button>
          </div>
          {videoMemoryRef.current.length === 0 ? (
            <div className="text-[11px] text-violet-300/50 italic">No memories yet — she'll start remembering after a few reactions.</div>
          ) : (
            <div className="space-y-1 max-h-40 overflow-y-auto">
              {videoMemoryRef.current.slice().reverse().map((line, i) => (
                <div key={i} className="text-[11px] text-violet-100 px-2 py-1 rounded bg-violet-500/10 italic leading-relaxed">
                  "{line}"
                </div>
              ))}
            </div>
          )}
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
