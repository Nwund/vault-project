// File: src/renderer/hooks/useVoiceCommands.ts
//
// Wraps Chrome's built-in webkitSpeechRecognition (available in Electron
// out of the box — no external STT server). When enabled, listens
// continuously, matches each finalized transcript against a small command
// grammar, and dispatches the matched handler.
//
// All matching is regex-based + simple intent detection; this is NOT a
// chat interface, just a small command vocabulary the user can speak
// during watch-along.
//
// Permission: the first start() prompts the user for microphone access.
// Denied → state.error is set; nothing crashes.
//
// Auto-restart: Chromium's continuous mode times out after ~30s of silence
// and fires `onend`. We restart automatically while enabled.

import { useEffect, useRef, useState } from 'react'

export interface VoiceCommandHandlers {
  onPause?: () => void
  onPlay?: () => void
  onNext?: () => void
  onPrev?: () => void
  onSeekForward?: (seconds: number) => void
  onSeekBack?: (seconds: number) => void
  onVolumeUp?: () => void
  onVolumeDown?: () => void
  onClimax?: () => void
  onMuteXy?: () => void
  onUnmuteXy?: () => void
  // #364 G-140 — hands-free edging-session controls. Lets you drive
  // the SelfControlCard scoreboard without touching the keyboard.
  onSessionStart?: () => void
  onSessionDenied?: () => void
  onSessionRuined?: () => void
  onLockoutTrigger?: () => void
  onTaskWheelSpin?: () => void
  onFeatureLess?: () => void  // "show this less"
  onMarkBookmark?: () => void // "bookmark this"
}

export interface VoiceLogEntry {
  /** ms epoch — when the transcript was finalized. */
  at: number
  /** Verbatim transcript heard by the recognizer. */
  transcript: string
  /** Matched command label, or null if no rule fired. */
  command: string | null
}

export interface UseVoiceCommandsState {
  /** True while the recognizer is actively listening. */
  listening: boolean
  /** Label of the most recently MATCHED command, or null. */
  lastCommand: string | null
  /** Most recently FINALIZED transcript (regardless of match). */
  lastTranscript: string | null
  /** Last error message (mic denied, recognition unsupported, etc). */
  error: string | null
  /** Rolling log of the last N (default 20) transcripts + match outcome.
   *  Surfaceable in a HUD panel for "what did Xy hear?" debuggability. */
  log: VoiceLogEntry[]
}

const LOG_CAP = 20

interface CommandPattern {
  patterns: RegExp[]
  action: keyof VoiceCommandHandlers
  label: string
}

const COMMAND_GRAMMAR: CommandPattern[] = [
  { patterns: [/\b(pause|stop)\b/i],                                    action: 'onPause',        label: 'pause' },
  { patterns: [/\b(play|resume|continue|keep going)\b/i],               action: 'onPlay',         label: 'play' },
  { patterns: [/\b(next|skip(?: video)?)\b/i],                          action: 'onNext',         label: 'next' },
  { patterns: [/\b(previous|back|go back|last (one|video))\b/i],        action: 'onPrev',         label: 'previous' },
  { patterns: [/\b(louder|volume up|turn it up)\b/i],                   action: 'onVolumeUp',     label: 'louder' },
  { patterns: [/\b(quieter|softer|volume down|turn it down)\b/i],       action: 'onVolumeDown',   label: 'quieter' },
  { patterns: [/\b(forward|fast forward|skip ahead)\b/i],               action: 'onSeekForward',  label: '+10s' },
  { patterns: [/\b(rewind|skip back|go back)\b/i],                      action: 'onSeekBack',     label: '-10s' },
  { patterns: [/\b(climax|make me (cum|finish)|i'?m (cumming|close))\b/i], action: 'onClimax',    label: 'climax' },
  { patterns: [/\b(shush|shut up|stop talking|be quiet|quiet)\b/i],     action: 'onMuteXy',       label: 'mute xy' },
  { patterns: [/\b(talk to me|say something|speak|talk)\b/i],           action: 'onUnmuteXy',     label: 'unmute xy' },
  // #364 — session-control verbs. These map to SelfControlCard /
  // edging-tracker / lockout / task-wheel actions so a full session
  // can run hands-free.
  { patterns: [/\b(start (a )?session|begin (a )?session|start edging|let'?s edge)\b/i], action: 'onSessionStart',   label: 'start session' },
  { patterns: [/\b(i denied|denied myself|i held|stopped (myself|in time)|good boy|i was good)\b/i], action: 'onSessionDenied', label: 'denied' },
  { patterns: [/\b(ruined (it|that)|i ruined|that was ruined|ruin it)\b/i],     action: 'onSessionRuined',   label: 'ruined' },
  { patterns: [/\b(trigger lockout|start lockout|lock me|lock down|cool down)\b/i], action: 'onLockoutTrigger', label: 'lockout' },
  { patterns: [/\b(spin (the )?wheel|new task|give me a task|task wheel|next task)\b/i], action: 'onTaskWheelSpin', label: 'spin wheel' },
  { patterns: [/\b(feature less|less of this|show less|hide this one)\b/i],     action: 'onFeatureLess',     label: 'feature less' },
  { patterns: [/\b(bookmark (this|that|it)|mark (it|this)|save (this )?spot)\b/i], action: 'onMarkBookmark',    label: 'bookmark' },
]

export function useVoiceCommands(
  enabled: boolean,
  handlers: VoiceCommandHandlers,
): UseVoiceCommandsState {
  const [listening, setListening] = useState(false)
  const [lastCommand, setLastCommand] = useState<string | null>(null)
  const [lastTranscript, setLastTranscript] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [log, setLog] = useState<VoiceLogEntry[]>([])
  const recognitionRef = useRef<any>(null)
  const appendLog = (entry: VoiceLogEntry) => {
    setLog((prev) => {
      const next = [entry, ...prev]
      if (next.length > LOG_CAP) next.length = LOG_CAP
      return next
    })
  }
  // Stash handlers in a ref so the recognizer always sees the latest
  // closures without us tearing it down on every parent re-render.
  const handlersRef = useRef(handlers)
  handlersRef.current = handlers

  useEffect(() => {
    if (!enabled) {
      try { recognitionRef.current?.stop() } catch { /* ignore */ }
      recognitionRef.current = null
      setListening(false)
      setError(null)
      return
    }

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SpeechRecognition) {
      setError('Speech recognition not supported in this Electron build')
      return
    }

    const recognition = new SpeechRecognition()
    recognition.continuous = true
    recognition.interimResults = false
    recognition.lang = 'en-US'

    recognition.onresult = (event: any) => {
      const last = event.results[event.results.length - 1]
      if (!last?.isFinal) return
      const transcript = String(last[0]?.transcript ?? '').trim()
      if (!transcript) return
      setLastTranscript(transcript)
      // Match the first command whose any pattern hits the transcript.
      for (const cmd of COMMAND_GRAMMAR) {
        if (cmd.patterns.some((p) => p.test(transcript))) {
          setLastCommand(cmd.label)
          appendLog({ at: Date.now(), transcript, command: cmd.label })
          const fn = handlersRef.current[cmd.action]
          if (typeof fn === 'function') {
            try {
              if (cmd.action === 'onSeekForward') (fn as any)(10)
              else if (cmd.action === 'onSeekBack') (fn as any)(10)
              else (fn as any)()
            } catch (err) {
              console.warn('[useVoiceCommands] handler threw:', err)
            }
          }
          return
        }
      }
      // No match — still log so the user can see what was heard.
      appendLog({ at: Date.now(), transcript, command: null })
    }

    recognition.onerror = (e: any) => {
      const code = e?.error
      if (code === 'not-allowed' || code === 'service-not-allowed') {
        setError('Microphone permission denied')
        // Don't auto-restart on permission denial — user must re-enable.
        try { recognition.stop() } catch { /* ignore */ }
        return
      }
      // Transient errors get restarted by onend below.
      if (code !== 'no-speech' && code !== 'aborted') {
        console.warn('[useVoiceCommands] recognition error:', code)
      }
    }

    recognition.onend = () => {
      // Auto-restart while still enabled — Chromium times out after silence.
      if (recognitionRef.current === recognition) {
        try { recognition.start() } catch { /* ignore */ }
      }
    }

    try {
      recognition.start()
      setListening(true)
      recognitionRef.current = recognition
      setError(null)
    } catch (err) {
      console.warn('[useVoiceCommands] start failed:', err)
      setError('Failed to start speech recognition')
    }

    return () => {
      // Clear ref BEFORE stop so onend doesn't auto-restart.
      recognitionRef.current = null
      try { recognition.stop() } catch { /* ignore */ }
      setListening(false)
    }
  }, [enabled])

  return { listening, lastCommand, lastTranscript, error, log }
}
