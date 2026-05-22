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
const PERSONA_VOICE: Record<PersonaName, {
  speed: number
  pitch: number
  expression: string
  /** Baseline EQ — each persona has a distinct tonal signature
   *  layered with phase EQ. Mistress = warm authoritative;
   *  cheerleader = bright energetic; stepsister = playful mid. */
  eq: { warmth: number; brightness: number }
}> = {
  goonbud:     { speed: 1.0,  pitch: 0,    expression: 'sultry',       eq: { warmth: 0,    brightness: 0 } },
  mistress:    { speed: 0.93, pitch: -1.5, expression: 'commanded',    eq: { warmth: 1.5,  brightness: -1 } },
  stepsister:  { speed: 1.05, pitch: 1.0,  expression: 'playful',      eq: { warmth: -0.5, brightness: 1.5 } },
  boss:        { speed: 0.95, pitch: -0.5, expression: 'commanding',   eq: { warmth: 0,    brightness: -0.5 } },
  cheerleader: { speed: 1.1,  pitch: 1.5,  expression: 'enthusiastic', eq: { warmth: -1,   brightness: 2.5 } },
}

/**
 * Inject filler words / hesitation markers at sentence boundaries.
 * Humans say "um", "uh", "like", "fuck" 100% of the time; LLM output
 * never does. Phase-keyed pools so fillers match arousal level.
 *
 * Probability per sentence is moderate (~25%) so fillers don't
 * dominate — they should sound like natural rhythm punctuation, not
 * a tic.
 */
function injectFillers(text: string, phase: string | undefined): string {
  if (!text || text.length < 4) return text
  // Per-phase filler pool. "like" is omnipresent in modern casual
  // speech; phase-specific fillers add character.
  const pool = phase === 'climax' ? ['fuck', 'oh', 'god', 'i—', 'fuck fuck']
    : phase === 'build' ? ['fuck', 'shit', 'oh god', 'like', 'i—']
    : phase === 'body' ? ['uh', 'okay', 'fuck', 'like', 'mmm']
    : phase === 'cooldown' ? ['mmm', 'okay', 'jesus', 'fuck']
    : ['uh', 'like', 'okay', 'mmm']
  // 25% chance to prepend a filler to the FIRST sentence (where it
  // sounds most natural — false start vibe).
  if (Math.random() < 0.25) {
    const filler = pool[Math.floor(Math.random() * pool.length)]
    const sep = filler.endsWith('—') ? ' ' : ', '
    return `${filler}${sep}${text}`
  }
  return text
}

/**
 * Occasionally inject a self-correction or false-start mid-sentence.
 * "fuck this is — wait — this is so hot." Adds a 8-12% chance per
 * sentence and only fires on longer sentences (>30 chars) where the
 * correction feels natural rather than forced.
 */
function injectSelfCorrection(text: string, phase: string | undefined): string {
  if (!text || text.length < 30) return text
  // Higher probability at climax/build where falling-apart speech is
  // characteristic. Skip at intro/cooldown — those are intimate, not
  // chaotic.
  const chance = phase === 'climax' || phase === 'build' ? 0.15 : 0.08
  if (Math.random() > chance) return text
  // Pick a word boundary somewhere in the middle 1/3 of the sentence
  // and insert a stammered repair. Use the same word that follows so
  // it sounds like she repeated herself to recover, not random.
  const words = text.split(/(\s+)/)
  if (words.length < 6) return text
  const minIdx = Math.floor(words.length / 3)
  const maxIdx = Math.floor((words.length * 2) / 3)
  const splitAt = minIdx + Math.floor(Math.random() * (maxIdx - minIdx))
  // Repairs vary by phase.
  const repairs = phase === 'climax' ? [' — fuck — ', ' — i — ', ' — oh god — ']
    : phase === 'build' ? [' — fuck — ', ' — wait — ', ' — shit — ']
    : [' — wait — ', ' — i mean — ', ' — actually — ']
  const repair = repairs[Math.floor(Math.random() * repairs.length)]
  // Echo the next non-whitespace word so the recovery reads like a
  // restart, not a non-sequitur.
  const restart = words.slice(splitAt).join('').trimStart()
  return `${words.slice(0, splitAt).join('')}${repair}${restart}`
}

/**
 * Apply casual phonetic contractions to make her speech sound less
 * scripted. LLM responses often output formal "going to" / "want to"
 * because that's what training data has — humans (especially in
 * intimate contexts) say "gonna" / "wanna" / "lemme" / "dunno".
 *
 * Applied probabilistically per match so the same phrase doesn't
 * always come out the same way. Skips matches inside quotes so
 * literal text stays untouched.
 */
function applyCasualContractions(text: string): string {
  if (!text) return text
  // Each pair: pattern → replacement, and probability of applying.
  const rules: Array<{ pattern: RegExp; replacement: string; chance: number }> = [
    { pattern: /\bgoing to\b/gi,    replacement: 'gonna', chance: 0.8 },
    { pattern: /\bwant to\b/gi,     replacement: 'wanna', chance: 0.8 },
    { pattern: /\bgot to\b/gi,      replacement: 'gotta', chance: 0.75 },
    { pattern: /\blet me\b/gi,      replacement: 'lemme', chance: 0.7 },
    { pattern: /\bgive me\b/gi,     replacement: 'gimme', chance: 0.7 },
    { pattern: /\bkind of\b/gi,     replacement: 'kinda', chance: 0.85 },
    { pattern: /\bsort of\b/gi,     replacement: 'sorta', chance: 0.8 },
    { pattern: /\bout of\b/gi,      replacement: 'outta', chance: 0.6 },
    { pattern: /\bdon't know\b/gi,  replacement: 'dunno', chance: 0.5 },
    { pattern: /\byou are\b/gi,     replacement: 'you\'re', chance: 0.85 },
    { pattern: /\bi am\b/gi,        replacement: 'i\'m', chance: 0.9 },
    { pattern: /\bdo not\b/gi,      replacement: 'don\'t', chance: 0.9 },
    { pattern: /\bcannot\b/gi,      replacement: 'can\'t', chance: 0.9 },
    { pattern: /\bbecause\b/gi,     replacement: 'cause', chance: 0.55 },
    { pattern: /\babout to\b/gi,    replacement: '\'bout to', chance: 0.4 },
    { pattern: /\bthem\b/gi,        replacement: '\'em', chance: 0.4 },
  ]
  let out = text
  for (const r of rules) {
    out = out.replace(r.pattern, (match) => {
      if (Math.random() < r.chance) {
        // Preserve case of first character of the match.
        return match[0] === match[0].toUpperCase()
          ? r.replacement[0].toUpperCase() + r.replacement.slice(1)
          : r.replacement
      }
      return match
    })
  }
  return out
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
  // For each sentence, further split LONG ones (>80 chars) at the
  // first comma/semicolon past the midpoint. This forces a fresh
  // streaming TTS call for the second half, which means a natural
  // intake breath gets inserted at the clause boundary — closely
  // mimicking how real humans breathe mid-sentence on long thoughts.
  const splitLong = (sentence: string): string[] => {
    if (sentence.length <= 80) return [sentence]
    // Find first clause break (, or ;) past position floor(length/3).
    const minSplitIdx = Math.floor(sentence.length / 3)
    const idx = sentence.slice(minSplitIdx).search(/[,;]/)
    if (idx < 0) return [sentence]
    const realIdx = minSplitIdx + idx + 1   // include the comma in first half
    return [sentence.slice(0, realIdx).trim(), sentence.slice(realIdx).trim()]
  }
  for (let i = 0; i < matches.length; i++) {
    const piece = matches[i].trim()
    if (!piece) continue
    const subSegments = splitLong(piece)
    for (let j = 0; j < subSegments.length; j++) {
      const seg = subSegments[j]
      const isLastSubInPiece = j === subSegments.length - 1
      const isLastPiece = i === matches.length - 1
      const last = seg[seg.length - 1]
      let pauseMs = 0
      if (isLastSubInPiece && !isLastPiece) {
        // Pause between SENTENCES — full punctuation-tagged.
        pauseMs = last === '…' ? 600
          : last === '!' || last === '?' ? 320
          : last === '.' ? 240
          : 180
      } else if (!isLastSubInPiece) {
        // Mid-sentence clause break — shorter inter-clause breath.
        pauseMs = 140
      }
      out.push({ text: seg, pauseMs })
    }
  }
  return out
}

/**
 * Analyze the current video frame for visual intensity metrics.
 * Cheap heuristics — runs in <5ms on a 160x90 sample, designed for
 * per-tick use without burning CPU.
 *
 * Returns:
 *   brightness    — avg luma 0-1 (dark = 0, blown out = 1)
 *   skinSaturation — red-channel dominance avg, proxy for skin-tone
 *                    content vs scene-with-color-palette
 *   chaos         — edge density via Sobel-ish horizontal+vertical
 *                    deltas, proxy for visual motion / detail
 *   intensity     — composite 0-1 score for "how intense the frame is"
 */
interface SceneMetrics {
  brightness: number
  skinSaturation: number
  chaos: number
  intensity: number
}

function analyzeFrame(video: HTMLVideoElement): SceneMetrics | null {
  if (video.readyState < 2) return null
  const w = video.videoWidth || 0
  const h = video.videoHeight || 0
  if (w === 0 || h === 0) return null
  // Sample at very low res — 160x90 = 14400 pixels, plenty for stats
  // and ~5x faster than 320x180.
  const sw = 160
  const sh = Math.max(60, Math.floor((h / w) * sw))
  const canvas = document.createElement('canvas')
  canvas.width = sw
  canvas.height = sh
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  try {
    ctx.drawImage(video, 0, 0, sw, sh)
    const data = ctx.getImageData(0, 0, sw, sh).data
    let lumaSum = 0
    let redDominanceSum = 0
    let chaosSum = 0
    let prevLuma = 0
    const N = sw * sh
    for (let i = 0; i < N; i++) {
      const off = i * 4
      const r = data[off]
      const g = data[off + 1]
      const b = data[off + 2]
      const luma = (0.299 * r + 0.587 * g + 0.114 * b) / 255
      lumaSum += luma
      // Skin-tone proxy: R dominant over G/B AND not too saturated.
      // Skin tones cluster around r > g > b with moderate saturation.
      if (r > g && r > b) {
        const sat = (r - Math.min(g, b)) / (r + 1)
        if (sat > 0.1 && sat < 0.6 && luma > 0.2 && luma < 0.85) {
          redDominanceSum += sat
        }
      }
      // Horizontal-gradient luma delta = simple edge proxy. Skip the
      // leftmost column.
      if (i % sw !== 0) {
        chaosSum += Math.abs(luma - prevLuma)
      }
      prevLuma = luma
    }
    const brightness = lumaSum / N
    const skinSaturation = redDominanceSum / N
    const chaos = chaosSum / N
    // Composite: skin-heavy + chaotic + mid-bright = high intensity.
    // Dark or static frames = low intensity.
    const intensity = Math.max(0, Math.min(1,
      skinSaturation * 3.0 +     // skin tones weighted heaviest
      chaos * 6.0 +              // motion/detail
      (brightness > 0.15 && brightness < 0.75 ? 0.15 : 0) // mid-bright bonus
    ))
    return { brightness, skinSaturation, chaos, intensity }
  } catch {
    // CORS-tainted canvas — same protection as captureFrame.
    return null
  }
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
  type GlobalMemoryEntry = {
    ts: number
    mediaId: string
    filename: string
    line: string
    /** Captured phase at the moment of the comment — gives the prompt
     *  builder context on her affective state at each memory. */
    mood?: string
  }
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
  // Cached metrics from the most recent analyzeFrame() call. Surfaced
  // to the prompt so the LLM knows what kind of scene she's seeing
  // even before Venice processes the actual frame.
  const lastSceneMetricsRef = useRef<SceneMetrics | null>(null)

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
    // the line. Plays a soft wet-mouth sound at the start so the
    // pause has a biological texture instead of dead silence.
    if (next.startsWith('pause:')) {
      const ms = Math.max(0, parseInt(next.slice('pause:'.length), 10) || 0)
      setIsSpeaking(true)
      try { streaming.playWetMouth() } catch { /* ignore */ }
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
      // Multiplied by refractoryFactor (softer post-climax) and
      // warmupFactor (softer first 30s).
      const phaseGain = (enginePhase === 'climax' ? 1.0
        : enginePhase === 'build' ? 0.9
        : enginePhase === 'body' ? 0.75
        : enginePhase === 'intro' || enginePhase === 'cooldown' ? 0.55
        : 0.85) * refractoryFactor * warmupFactor
      // Persona baseline + phase overlay + per-line jitter. Persona
      // defines resting voice; phase adds escalation; jitter ensures
      // no two consecutive lines sound exactly the same (real humans
      // vary slightly per utterance).
      const persona = personaRef.current
      const personaProfile = PERSONA_VOICE[persona] ?? PERSONA_VOICE.goonbud
      const phaseSpeedShift = enginePhase === 'climax' ? 0 : enginePhase === 'build' ? -0.03 : enginePhase === 'body' ? -0.07 : -0.1
      const phasePitchShift = enginePhase === 'climax' ? 1.0 : enginePhase === 'build' ? 0.5 : enginePhase === 'body' ? 0 : -1.0
      // Time-of-day affect — humans don't sound the same at 11am as
      // at 3am. Late-night = slower, lower pitch (tired/intimate);
      // morning = brighter, slightly faster (waking up).
      const hour = new Date().getHours()
      const todSpeed = (hour >= 23 || hour <= 5) ? -0.04   // 11pm - 5am: slower
        : (hour <= 9) ? 0.02                                // 6am - 9am: brighter
        : 0
      const todPitch = (hour >= 23 || hour <= 5) ? -0.5    // sultry-late
        : (hour <= 9) ? 0.3                                  // bright morning
        : 0
      // Session-length affect — after 30+ minutes she sounds more
      // worn-in. Caps at -7% speed / -1 semitone past 2h.
      const sessionMin = sessionRef.current.startedAt
        ? (Date.now() - sessionRef.current.startedAt) / 60_000
        : 0
      const fatigueFactor = Math.min(1, Math.max(0, (sessionMin - 30) / 90))
      const fatigueSpeed = -0.07 * fatigueFactor
      const fatiguePitch = -1.0 * fatigueFactor
      // Per-line jitter: ±5% speed, ±0.7 semitones pitch. Small enough
      // not to break character; large enough that repeated reactions
      // don't sound mechanically identical.
      const speedJitter = (Math.random() - 0.5) * 0.1
      const pitchJitter = (Math.random() - 0.5) * 1.4
      // Expression: prefer the parsed inflection cue from the LLM if
      // present; fall back to a phase-default tinted by persona.
      const lineExpression = expression || (
        enginePhase === 'climax' ? (persona === 'mistress' ? 'commanded' : 'moaned')
        : enginePhase === 'build' ? 'desperate'
        : enginePhase === 'cooldown' || enginePhase === 'intro' ? 'breathy'
        : personaProfile.expression
      )
      // Per-line volume jitter (±5%) on top of phase gain — adds the
      // last bit of natural variance, prevents "every line at exactly
      // the same loudness" robotic feel.
      const volumeJitter = 1 + (Math.random() - 0.5) * 0.1
      // Phase EQ — warm/intimate at intro+cooldown, brighter edge at
      // climax. Layered on top of persona EQ baseline so e.g. a
      // cheerleader's climax is even brighter than goonbud's climax.
      const phaseEq = enginePhase === 'climax' ? { warmth: -1.5, brightness: 2.5 }
        : enginePhase === 'build' ? { warmth: -0.5, brightness: 1.5 }
        : enginePhase === 'body' ? { warmth: 0, brightness: 0 }
        : enginePhase === 'intro' || enginePhase === 'cooldown' ? { warmth: 2, brightness: -1.5 }
        : { warmth: 0, brightness: 0 }
      const lineEq = {
        warmth: personaProfile.eq.warmth + phaseEq.warmth,
        brightness: personaProfile.eq.brightness + phaseEq.brightness,
      }
      // Contagion adds +3% speed / +0.4 semitone per stacked escalate
      // (capped at +9% / +1.2 semi). Decays linearly over 60s.
      const contagionSpeed = contagionBoost * 0.03
      const contagionPitch = contagionBoost * 0.4
      const contagionVolume = 1 + contagionBoost * 0.05
      const handle = streaming.speakStreaming(text, {
        voice,
        speed: personaProfile.speed + phaseSpeedShift + todSpeed + fatigueSpeed + contagionSpeed + driftRef.current.speed + speedJitter,
        pitch: personaProfile.pitch + phasePitchShift + todPitch + fatiguePitch + contagionPitch + driftRef.current.pitch + pitchJitter,
        expression: lineExpression,
        eq: lineEq,
        volume: audioMuted ? 0 : Math.max(0, Math.min(1, phaseGain * volumeJitter * contagionVolume)),
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
  // Start the ambient room-tone loop on enable, stop on disable.
  // The loop is barely audible (-45dB-ish) but makes silences feel
  // like a real space — major realism upgrade.
  useEffect(() => {
    if (enabled) {
      streaming.startRoomTone()
      return () => streaming.stopRoomTone()
    }
    return undefined
  }, [enabled, streaming])

  // Idle bio-sound scheduler — once per 90-240s while enabled, play a
  // soft non-vocal sound (throat-clear / sniffle). Skipped while she's
  // mid-line or in listening mode so it doesn't trample real speech.
  useEffect(() => {
    if (!enabled) return
    const armNext = (): ReturnType<typeof setTimeout> => {
      const delay = 90_000 + Math.random() * 150_000
      return setTimeout(() => {
        if (!queuePausedRef.current && !isAudioPlayingRef.current && audioQueueRef.current.length === 0) {
          // Skip if muted or if she just spoke (within last 15s).
          if (!audioMuted) {
            const now = Date.now()
            const sinceSpeech = now - lastSpeakingEndedAtRef.current
            if (sinceSpeech > 15_000) {
              try {
                if (Math.random() < 0.5) streaming.playSniffle()
                else streaming.playThroatClear()
              } catch { /* ignore */ }
            }
          }
        }
        idleTimerRef.current = armNext()
      }, delay)
    }
    const idleTimerRef = { current: null as ReturnType<typeof setTimeout> | null }
    idleTimerRef.current = armNext()
    return () => { if (idleTimerRef.current) clearTimeout(idleTimerRef.current) }
  }, [enabled, audioMuted, streaming])
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
  // intimate and climax phases sound peak. Persona-keyed too — a
  // mistress doesn't say "fuck fuck fuck" the same way a cheerleader
  // does. Uses the same streaming path so latency is sub-second.
  type PhaseMicroPool = Record<NonNullable<typeof enginePhase>, string[]>
  const MICRO_BY_PERSONA: Record<PersonaName, PhaseMicroPool> = {
    goonbud: {
      intro:    ['mmm', 'hmm', 'oh wow', 'jesus', 'okay', 'mmm yes'],
      body:     ['fuck', 'mmm', 'god', 'oh', 'yeah', 'shit', 'mhmm', 'yes baby'],
      build:    ['fuck yes', 'oh god', "i'm close", 'right there', 'don\'t stop', 'so good', 'ahh'],
      climax:   ['fuck fuck fuck', 'cumming', 'oh god yes', 'i\'m cumming', 'ahh fuck'],
      cooldown: ['mmm', 'good boy', 'so good', 'jesus christ', 'wow'],
    },
    mistress: {
      intro:    ['mmm', 'good', 'i see you', 'don\'t look away', 'eyes on me'],
      body:     ['stroke it', 'slower', 'tighter', 'don\'t come', 'mine', 'edge'],
      build:    ['don\'t you dare', 'hold it', 'ask me', 'i decide', 'beg'],
      climax:   ['come for me', 'fucking come', 'now', 'finish', 'over me'],
      cooldown: ['good boy', 'mine', 'kneel', 'thank me', 'breathe'],
    },
    stepsister: {
      intro:    ['hi', 'oh hi', 'you watching?', 'cute', 'oh god', 'don\'t tell'],
      body:     ['oh fuck', 'this is so wrong', 'i shouldn\'t', 'okay one more', 'you\'re bad'],
      build:    ['don\'t stop', 'i\'m gonna', 'oh god oh god', 'i\'m so close', 'don\'t you dare stop'],
      climax:   ['oh god oh god', 'fuck fuck', 'don\'t tell', 'i\'m cumming', 'shhh'],
      cooldown: ['oh my god', 'we can\'t', 'jesus', 'that was', 'you can\'t tell'],
    },
    boss: {
      intro:    ['focus', 'good', 'as expected', 'continue', 'mhm'],
      body:     ['better', 'keep going', 'fine', 'show me more', 'more'],
      build:    ['don\'t stop', 'close', 'almost there', 'don\'t finish yet', 'hold'],
      climax:   ['now', 'finish', 'on my desk', 'good employee', 'come'],
      cooldown: ['acceptable', 'good work', 'dismissed', 'recover', 'tomorrow'],
    },
    cheerleader: {
      intro:    ['you got this', 'come on', 'mmm', 'yes', 'oh wow', 'fuck yes'],
      body:     ['fuck yes', 'go', 'keep going', 'you\'re doing so good', 'don\'t stop'],
      build:    ['come on', 'almost', 'do it', 'you got it', 'oh god yes'],
      climax:   ['yes yes yes', 'come for me', 'do it', 'so good', 'oh fuck yes'],
      cooldown: ['good job', 'so proud', 'you did so good', 'mmm', 'amazing'],
    },
  }
  // Paused-state utterances — fire when the video is paused for >5s
  // so she stays present in the silence instead of disappearing.
  // Low-key, attentive, slightly impatient.
  const PAUSE_PRESENCE_LINES = [
    'mmm', 'you still there?', 'come on', 'don\'t leave me', 'jesus take a breath',
    'i\'m waiting', 'hmm?', 'where\'d you go', 'still warm over here',
  ]
  // Pre-climax anticipatory breath cues — 3-5s before phase actually
  // hits climax, she emits short escalating breaths so the climax
  // doesn't feel sudden. Telegraphs arousal onset.
  const PRECLIMAX_BREATH_CUES = [
    'ahhh', 'oh god', 'fuck fuck', 'wait wait', 'oh oh oh',
    'i can\'t', 'so close', 'jesus', 'unh',
  ]
  // Post-climax release sighs — fired in a slowing pattern (3s, 5s,
  // 8s, 13s intervals) right after climax phase to simulate the
  // descent from peak. Stops once she reaches cooldown phase.
  const POSTCLIMAX_SIGH_CUES = [
    'mmmm', 'fuck...', 'oh god', 'jesus', 'wow', 'i can\'t move',
    'so good', 'fuck me', 'whew', 'still trembling', 'good boy',
  ]
  // Tracks the previous phase so we can detect a fresh build→climax
  // transition and fire pre-climax breaths just before the transition.
  const prevPhaseRef = useRef<typeof enginePhase>(undefined)
  // Tracks active post-climax sigh schedule timers so we can cancel
  // them if the user scrubs out of climax/cooldown.
  const postclimaxTimersRef = useRef<ReturnType<typeof setTimeout>[]>([])
  useEffect(() => {
    const prev = prevPhaseRef.current
    prevPhaseRef.current = enginePhase
    if (!enabled) return
    // BUILD entry — anticipatory breath
    if (enginePhase === 'build' && prev !== 'build') {
      if (!audioMuted && !queuePausedRef.current) {
        const cue = PRECLIMAX_BREATH_CUES[Math.floor(Math.random() * PRECLIMAX_BREATH_CUES.length)]
        audioQueueRef.current.push(`stream:desperate|${cue}`)
        playNextInQueue()
      }
    }
    // CLIMAX entry — schedule the post-climax release sigh pattern.
    // Sighs fire at 3s, 8s, 16s, 29s — geometric slowing that mimics
    // the descent from peak arousal. Each sigh uses "breathy" so it
    // sounds intimate, not climactic.
    if (enginePhase === 'climax' && prev !== 'climax') {
      // Clear any leftover schedule from a previous climax (re-runs
      // on scrub).
      for (const t of postclimaxTimersRef.current) clearTimeout(t)
      postclimaxTimersRef.current = []
      const offsets = [3000, 8000, 16000, 29000]
      for (const ms of offsets) {
        const t = setTimeout(() => {
          if (!enabled || audioMuted || queuePausedRef.current) return
          if (isAudioPlayingRef.current && audioQueueRef.current.length > 1) return
          const cue = POSTCLIMAX_SIGH_CUES[Math.floor(Math.random() * POSTCLIMAX_SIGH_CUES.length)]
          audioQueueRef.current.push(`stream:breathy|${cue}`)
          playNextInQueue()
        }, ms)
        postclimaxTimersRef.current.push(t)
      }
    }
    // Cancel post-climax schedule if the user scrubs back before
    // cooldown (e.g. into build or body).
    if (enginePhase !== 'climax' && enginePhase !== 'cooldown' && postclimaxTimersRef.current.length > 0) {
      for (const t of postclimaxTimersRef.current) clearTimeout(t)
      postclimaxTimersRef.current = []
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enginePhase, enabled])
  // Cleanup timers on unmount.
  useEffect(() => {
    return () => {
      for (const t of postclimaxTimersRef.current) clearTimeout(t)
      postclimaxTimersRef.current = []
    }
  }, [])
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
      const personaPool = MICRO_BY_PERSONA[personaRef.current] ?? MICRO_BY_PERSONA.goonbud
      const pool = personaPool[enginePhase] || personaPool.body
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
  // Brief "didn't catch that" indicator — flashes when the STT
  // recognizer finalized a transcript that didn't match any command,
  // so the user can see she heard *something* but it wasn't usable.
  const [heardUnclear, setHeardUnclear] = useState<string | null>(null)
  useEffect(() => {
    const onUnclear = (ev: Event) => {
      const detail = (ev as CustomEvent).detail as { transcript?: string } | undefined
      const t = detail?.transcript?.trim()
      if (!t) return
      setHeardUnclear(t.length > 40 ? `${t.slice(0, 40)}…` : t)
      // Auto-dismiss after 3s.
      window.setTimeout(() => setHeardUnclear((cur) => (cur === (t.length > 40 ? `${t.slice(0, 40)}…` : t) ? null : cur)), 3000)
    }
    window.addEventListener('vault:xyrene-heard-unclear', onUnclear)
    return () => window.removeEventListener('vault:xyrene-heard-unclear', onUnclear)
  }, [])
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

  // Sub-vocal "thinking" pool — fires while she's processing a
  // comment (Venice call in flight). Phase-keyed so thinking sounds
  // match arousal.
  const THINKING_SOUNDS: Record<NonNullable<typeof enginePhase>, string[]> = {
    intro:    ['hmm', 'oh', 'mmm', 'huh'],
    body:     ['hmm', 'oh fuck', 'mmm', 'uhh', 'oh god'],
    build:    ['oh', 'fuck', 'mmm fuck', 'oh god'],
    climax:   ['fuck', 'oh', 'mmm', 'ahh'],
    cooldown: ['hmm', 'mmm', 'oh'],
  }

  // ── Polling loop ──────────────────────────────────────────────────────
  // Track whether this session has fired its first tick yet for the
  // CURRENT media. Used to flag "recall moment" on the first comment
  // if the media has past memories, biasing the LLM toward an opener
  // that references continuity.
  const firstTickRef = useRef<{ mediaId: string | null; fired: boolean }>({
    mediaId: null,
    fired: false,
  })
  // Reset on media change.
  useEffect(() => {
    firstTickRef.current = { mediaId, fired: false }
  }, [mediaId])

  const tick = useCallback(async () => {
    if (!enabled) return
    const video = videoRef.current
    if (!video || video.paused) return  // skip while paused; resumes naturally
    if (inFlightRef.current) return     // skip if previous tick still running
    if (queuePausedRef.current) return  // listening mode — user is talking
    inFlightRef.current = true
    setBusy(true)
    // Schedule a sub-vocal "thinking" sound 800-1400ms after the
    // Venice call starts — if it returns before then, this is
    // cancelled. Makes her feel like she's processing, not frozen.
    let thinkingTimer: ReturnType<typeof setTimeout> | null = null
    const armThinking = () => {
      const delay = 800 + Math.random() * 600
      thinkingTimer = setTimeout(() => {
        // Skip if she's already mid-line, if the user started talking,
        // or if the line was muted.
        if (audioMuted || queuePausedRef.current) return
        if (isAudioPlayingRef.current) return
        if (audioQueueRef.current.length > 0) return
        const phaseKey = enginePhase ?? 'body'
        const pool = THINKING_SOUNDS[phaseKey] ?? THINKING_SOUNDS.body
        const utterance = pool[Math.floor(Math.random() * pool.length)]
        const expression = phaseKey === 'climax' ? 'moaned'
          : phaseKey === 'build' ? 'desperate'
          : 'breathy'
        audioQueueRef.current.push(`stream:${expression}|${utterance}`)
        playNextInQueue()
      }, delay)
    }
    armThinking()
    // Sample the current frame for visual intensity BEFORE the heavy
    // upload encode — used to nuance the prompt + boost micro-reactions
    // on intense scenes.
    const sceneMetrics = analyzeFrame(video)
    if (sceneMetrics) {
      lastSceneMetricsRef.current = sceneMetrics
      // High-intensity scenes also trigger a quick micro-reaction
      // surge — the user is watching something hot RIGHT NOW, she
      // shouldn't wait 8s to react.
      if (sceneMetrics.intensity > 0.55
          && !audioMuted
          && !queuePausedRef.current
          && !isAudioPlayingRef.current
          && audioQueueRef.current.length === 0) {
        const personaPool = MICRO_BY_PERSONA[personaRef.current] ?? MICRO_BY_PERSONA.goonbud
        const pool = personaPool[enginePhase ?? 'body'] || personaPool.body
        const utterance = pool[Math.floor(Math.random() * pool.length)]
        const expression = enginePhase === 'climax' ? 'moaned'
          : enginePhase === 'build' ? 'desperate'
          : 'sultry'
        // 40% chance — don't fire on EVERY intense frame.
        if (Math.random() < 0.4) {
          audioQueueRef.current.push(`stream:${expression}|${utterance}`)
          playNextInQueue()
        }
      }
    }
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
      const sampledGlobal: Array<{ filename: string; line: string; mood?: string }> = []
      if (otherMemories.length > 0) {
        // Pick at most 2 random entries from the recency window.
        const picks = Math.min(2, otherMemories.length)
        const shuffled = [...otherMemories].sort(() => Math.random() - 0.5)
        for (let i = 0; i < picks; i++) {
          sampledGlobal.push({
            filename: shuffled[i].filename,
            line: shuffled[i].line,
            mood: shuffled[i].mood,
          })
        }
      }
      // First-tick recall flag — if this is the FIRST comment for the
      // current media AND she has memories of it, mark this as a
      // "recall moment" so the prompt strongly biases her toward
      // referencing past reactions in the opener.
      const isRecallMoment =
        !firstTickRef.current.fired &&
        firstTickRef.current.mediaId === mediaId &&
        videoMemoryRef.current.length > 0
      firstTickRef.current = { mediaId, fired: true }
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
        // First-comment recall hint — the prompt builder will inject
        // an explicit "this is a re-watch, OPEN with a recall" line
        // when this is true.
        recallMoment: isRecallMoment,
        // Cheap visual intensity heuristics from analyzeFrame — gives
        // the LLM signal about what kind of frame this is BEFORE
        // Venice processes it.
        sceneMetrics: lastSceneMetricsRef.current ? {
          brightness: Number(lastSceneMetricsRef.current.brightness.toFixed(2)),
          skinSaturation: Number(lastSceneMetricsRef.current.skinSaturation.toFixed(2)),
          chaos: Number(lastSceneMetricsRef.current.chaos.toFixed(2)),
          intensity: Number(lastSceneMetricsRef.current.intensity.toFixed(2)),
        } : null,
        // What the user has said recently via voice commands —
        // she can respond to specific things they've said.
        userSaid: userVoiceMemoryRef.current.slice(-4).map((e) => e.text),
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
      // Derive a short mood tag from the current engine phase so the
      // prompt can later say "you were peaking" / "you were warming up"
      // about each past memory.
      const moodTag = enginePhase === 'climax' ? 'peaking'
        : enginePhase === 'build' ? 'getting close'
        : enginePhase === 'body' ? 'into it'
        : enginePhase === 'intro' ? 'warming up'
        : enginePhase === 'cooldown' ? 'spent'
        : undefined
      const globalEntry: GlobalMemoryEntry = { ts: Date.now(), mediaId, filename, line: cleanForMemory, mood: moodTag }
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

      // PEAK VOCALIZATION — at climax phase (or with persona at peak
      // build), pre-pend a non-word peak sound to the audio queue
      // BEFORE her actual reaction. Routes through streaming TTS so it
      // gets the full breath + EQ + reverb treatment. Fires ~45% of
      // climax-phase reactions, ~15% of build reactions.
      const peakFireChance = enginePhase === 'climax' ? 0.45 : enginePhase === 'build' ? 0.15 : 0
      if (peakFireChance > 0 && Math.random() < peakFireChance) {
        const PEAK_VOCALS_CLIMAX = ['aaah', 'oh god', 'aahh fuck', 'aaaah', 'oh oh oh', 'fuck fuck fuck', 'mmmnh']
        const PEAK_VOCALS_BUILD = ['aaah', 'mmm fuck', 'oh god', 'unh', 'oh oh', 'haaah']
        const pool = enginePhase === 'climax' ? PEAK_VOCALS_CLIMAX : PEAK_VOCALS_BUILD
        const peak = pool[Math.floor(Math.random() * pool.length)]
        const peakExpression = enginePhase === 'climax' ? 'moaned' : 'desperate'
        audioQueueRef.current.push(`stream:${peakExpression}|${peak}`)
        audioQueueRef.current.push('pause:180')
      }
      // Apply layered speech-realism transforms in order:
      //   1. Casual contractions (going to → gonna)
      //   2. Filler word at sentence start (~25%)
      //   3. Mid-sentence self-correction (~8-15%)
      //   4. High-arousal stutter (build/climax, ~25%)
      // The combined effect is that no two utterances come out the
      // same way — each gets its own dialect treatment.
      const contracted = applyCasualContractions(stripped)
      const filled = injectFillers(contracted, enginePhase)
      const corrected = injectSelfCorrection(filled, enginePhase)
      const spokenText = applyArousalStutter(corrected, enginePhase)
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
      // Cancel any pending thinking sound — Venice has returned (or
      // errored) so we don't want a "hmm" landing 200ms before her
      // real reaction.
      if (thinkingTimer) {
        clearTimeout(thinkingTimer)
        thinkingTimer = null
      }
      inFlightRef.current = false
      setBusy(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, mediaId, durationSec, videoRef, playNextInQueue, enginePhase, audioMuted])

  // Command acknowledgments — short utterances she emits in response
  // to specific voice commands so the user gets verbal confirmation
  // their command was heard. Keyed by command label.
  const COMMAND_ACK_LINES: Record<string, string[]> = {
    'escalate':   ['fuck yes', 'come on then', 'show me', 'i\'m here'],
    'slow down': ['ok baby', 'shh, easy', 'i got you', 'breathe with me'],
    'play':      ['mhmm', 'good boy', 'thank you'],
    'pause':     ['ok', 'taking a sec?', 'mmm'],
    'mute xy':   [],  // her own muting — no ack possible
    'unmute xy': ['mmm hi'],
  }
  useEffect(() => {
    if (!enabled) return
    const onAck = (ev: Event) => {
      const detail = (ev as CustomEvent).detail as { label?: string } | undefined
      const label = detail?.label
      if (!label) return
      const pool = COMMAND_ACK_LINES[label]
      if (!pool || pool.length === 0) return
      if (audioMuted || queuePausedRef.current) return
      const utterance = pool[Math.floor(Math.random() * pool.length)]
      // Use a context-appropriate expression — assertive for escalate,
      // soft for slow-down, neutral for transport commands.
      const expression = label === 'escalate' ? 'desperate'
        : label === 'slow down' ? 'breathy'
        : 'sultry'
      audioQueueRef.current.push(`stream:${expression}|${utterance}`)
      playNextInQueue()
    }
    window.addEventListener('vault:xyrene-command-ack', onAck)
    return () => window.removeEventListener('vault:xyrene-command-ack', onAck)
  }, [enabled, audioMuted, playNextInQueue])

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

  // Emotional contagion — every time the user fires an "escalate"
  // voice command, she gets a temporary excitement boost (+speed,
  // +pitch, +volume) for the next ~60s. Each subsequent escalate
  // stacks (capped at 3x). Decays back to baseline after the window.
  const lastEscalateAtRef = useRef<number>(0)
  const escalateCountRef = useRef<number>(0)
  useEffect(() => {
    if (!enabled) return
    const onEscalate = (ev: Event) => {
      const detail = (ev as CustomEvent).detail as { label?: string } | undefined
      // Only count actual escalate commands, not other acks.
      if (detail?.label !== 'escalate') return
      const now = Date.now()
      // Reset count if it's been >60s since last escalate.
      if (now - lastEscalateAtRef.current > 60_000) {
        escalateCountRef.current = 0
      }
      escalateCountRef.current = Math.min(3, escalateCountRef.current + 1)
      lastEscalateAtRef.current = now
    }
    window.addEventListener('vault:xyrene-command-ack', onEscalate)
    return () => window.removeEventListener('vault:xyrene-command-ack', onEscalate)
  }, [enabled])
  const contagionBoost = (() => {
    const since = Date.now() - lastEscalateAtRef.current
    if (since > 60_000 || lastEscalateAtRef.current === 0) return 0
    // Linear decay over 60s, scaled by stack count (1-3).
    const decay = Math.max(0, 1 - since / 60_000)
    return decay * escalateCountRef.current
  })()

  // User voice memory — captures every final transcript the user
  // says via STT. Surfaced to Xyrene's prompt so she "remembers what
  // you said". Capped at 10 entries to keep prompt size bounded.
  const userVoiceMemoryRef = useRef<Array<{ ts: number; text: string }>>([])
  useEffect(() => {
    if (!enabled) return
    const onSaid = (ev: Event) => {
      const detail = (ev as CustomEvent).detail as { transcript?: string } | undefined
      const t = detail?.transcript?.trim()
      if (!t || t.length < 3) return
      // De-dupe against the most recent entry — STT sometimes fires
      // overlapping results.
      const recent = userVoiceMemoryRef.current[userVoiceMemoryRef.current.length - 1]
      if (recent && recent.text === t) return
      userVoiceMemoryRef.current.push({ ts: Date.now(), text: t })
      if (userVoiceMemoryRef.current.length > 10) {
        userVoiceMemoryRef.current.shift()
      }
    }
    window.addEventListener('vault:user-said', onSaid)
    return () => window.removeEventListener('vault:user-said', onSaid)
  }, [enabled])

  // Warm-up timestamp — when she first enables, she "settles in"
  // gradually instead of being at full intensity immediately. For
  // the first 30 seconds her cadence is slightly slower and her
  // volume is softer; smoothly ramps to baseline.
  const warmupStartRef = useRef<number>(0)
  useEffect(() => {
    if (enabled) warmupStartRef.current = Date.now()
    else warmupStartRef.current = 0
  }, [enabled])
  const warmupFactor = (() => {
    if (warmupStartRef.current === 0) return 1.0
    const elapsed = Date.now() - warmupStartRef.current
    if (elapsed > 30_000) return 1.0
    // Slow start: 0.5 at t=0, easing to 1.0 at t=30s with ease-out cubic.
    const t = elapsed / 30_000
    const eased = 1 - Math.pow(1 - t, 3)
    return 0.5 + 0.5 * eased
  })()

  // Voice character drift — small Brownian-motion parameter walk
  // that accumulates over the session so no two enable cycles sound
  // identical. By ~60 minutes in, her voice has slightly drifted in
  // speed/pitch/expression bias. Resets on disable.
  //
  // Drift bounds:
  //   speed: ±0.06 (±6%)
  //   pitch: ±1.2 semitones
  // Each ~10s tick walks by a small random step within these bounds.
  const driftRef = useRef<{ speed: number; pitch: number }>({ speed: 0, pitch: 0 })
  useEffect(() => {
    if (!enabled) {
      driftRef.current = { speed: 0, pitch: 0 }
      return
    }
    const interval = window.setInterval(() => {
      // Each tick: random walk ±0.005 speed, ±0.1 semi pitch.
      // Pull toward zero by a small factor so drift doesn't grow
      // unbounded (mean-reverting Ornstein-Uhlenbeck-ish).
      const pull = 0.92
      const stepSpeed = (Math.random() - 0.5) * 0.01
      const stepPitch = (Math.random() - 0.5) * 0.2
      const newSpeed = driftRef.current.speed * pull + stepSpeed
      const newPitch = driftRef.current.pitch * pull + stepPitch
      driftRef.current = {
        speed: Math.max(-0.06, Math.min(0.06, newSpeed)),
        pitch: Math.max(-1.2, Math.min(1.2, newPitch)),
      }
    }, 10_000)
    return () => clearInterval(interval)
  }, [enabled])

  // Track the last climax timestamp so we can apply a "refractory
  // period" — after a real climax, real humans are spent. She gets
  // less reactive (longer cadence, quieter volume, fewer micros) for
  // the next ~90 seconds. Resets if user re-enables or new media.
  const lastClimaxAtRef = useRef<number>(0)
  useEffect(() => {
    if (enginePhase === 'climax') lastClimaxAtRef.current = Date.now()
  }, [enginePhase])
  const refractoryFactor = (() => {
    const sinceMs = Date.now() - lastClimaxAtRef.current
    if (sinceMs > 90_000 || lastClimaxAtRef.current === 0) return 1.0
    // Linearly recover over 90s post-climax. At 0s = 0.4× (1.4× cadence,
    // ~30% softer); by 90s = 1.0×.
    const recovery = Math.min(1, sinceMs / 90_000)
    return 0.4 + 0.6 * recovery
  })()

  // Scene intensity tracker — drives cadence boost. Stores a smoothed
  // rolling average so a single high-intensity frame doesn't whiplash
  // her, but a sustained intense run does compress cadence.
  const [intensityMA, setIntensityMA] = useState(0.4)
  useEffect(() => {
    if (!enabled) return
    const interval = window.setInterval(() => {
      const current = lastSceneMetricsRef.current?.intensity ?? 0.4
      // EMA with alpha 0.3 — smooth but responsive.
      setIntensityMA((prev) => prev * 0.7 + current * 0.3)
    }, 3000)
    return () => clearInterval(interval)
  }, [enabled])

  // Phase-adaptive cadence — comments more often at climax (every 5s),
  // less often at cooldown (every 14s), default 8s in body/intro.
  // Scales the user-supplied intervalSec by a per-phase factor so the
  // override still works (e.g. interval=4 still gives 2.5s at climax).
  // Multiplied by refractoryFactor (1.0 normally, smaller right after
  // climax) and divided by warmupFactor (smaller = longer cadence
  // during settle-in) AND intensity boost — high visual intensity
  // tightens the cadence further so she reacts more in hot scenes.
  const effectiveIntervalSec = (() => {
    const factor = enginePhase === 'climax' ? 0.5
      : enginePhase === 'build' ? 0.75
      : enginePhase === 'cooldown' ? 1.75
      : 1.0
    // intensityMA 0.0 → 1.0× (no change), 1.0 → 0.5× (twice as fast)
    const intensityBoost = 1 / (1 + intensityMA * 0.7)
    return Math.max(3, intervalSec * factor * intensityBoost / refractoryFactor / warmupFactor)
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
        {/* "Didn't catch that" hint — flashes briefly when STT
            recognized something that didn't match any command. */}
        {heardUnclear && (
          <div
            className="px-2 py-1 rounded-full text-[10px] font-medium border bg-amber-500/20 border-amber-400/40 text-amber-200 backdrop-blur-md flex items-center gap-1 pointer-events-auto"
            title="STT heard this but no command matched. Try rephrasing."
          >
            <span className="opacity-60">heard:</span>
            <span className="italic">"{heardUnclear}"</span>
          </div>
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
        {/* Live waveform — taps the streaming hook's analyser node
            and draws a real-time bar-graph visualization of her
            voice activity. Hidden when not speaking. */}
        {enabled && isSpeaking && (
          <XyreneWaveformCanvas streaming={streaming} />
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

/**
 * Tiny live audio-activity visualizer rendered next to the xy button
 * while she's speaking. Reads the AnalyserNode tapped off the
 * streaming hook's master bus and draws a frequency-bar graph at 60fps.
 */
function XyreneWaveformCanvas({ streaming }: { streaming: ReturnType<typeof useXyreneStreamingVoice> }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const analyser = streaming.getAnalyser()
    if (!analyser) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const bufferLength = analyser.frequencyBinCount
    const dataArray = new Uint8Array(bufferLength)
    let rafId = 0
    const draw = () => {
      analyser.getByteFrequencyData(dataArray)
      const w = canvas.width
      const h = canvas.height
      ctx.clearRect(0, 0, w, h)
      // Draw bars across the canvas. Use lower 1/3 of frequency bins
      // (where voice energy concentrates) and stretch across full width.
      const usedBins = Math.floor(bufferLength * 0.5)
      const barCount = 14  // discrete bars for clarity
      const barWidth = w / barCount - 1
      for (let i = 0; i < barCount; i++) {
        const binIdx = Math.floor((i / barCount) * usedBins)
        const value = dataArray[binIdx] / 255  // 0-1
        const barHeight = Math.max(2, value * h * 0.95)
        // Pink gradient — brighter at the top of each bar.
        const grad = ctx.createLinearGradient(0, h, 0, h - barHeight)
        grad.addColorStop(0, 'rgba(244, 114, 182, 0.55)')   // pink-400 base
        grad.addColorStop(1, 'rgba(244, 114, 182, 1)')      // pink-400 peak
        ctx.fillStyle = grad
        const x = i * (barWidth + 1)
        ctx.fillRect(x, h - barHeight, barWidth, barHeight)
      }
      rafId = requestAnimationFrame(draw)
    }
    rafId = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(rafId)
  }, [streaming])
  return (
    <canvas
      ref={canvasRef}
      width={56}
      height={18}
      className="rounded pointer-events-none"
      style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(244, 114, 182, 0.35)' }}
    />
  )
}

export default WatchWithXy
