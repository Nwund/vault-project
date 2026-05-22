// File: src/renderer/hooks/useXyreneSoundEngine.ts
//
// React lifecycle wrapper around XyreneSoundEngine. Designed to be called
// from a video player component:
//
//   const { playing, phase } = useXyreneSoundEngine(videoRef, {
//     enabled: settings.xyrene.goonWallMasturbationMode,
//   })
//
// Behavior:
//   - On mount: loads the XyreneSettings, creates an engine, subscribes to
//     the video element's play / pause / timeupdate / ended events.
//   - When `enabled` is false → no engine.
//   - When the video plays AND enabled is true → engine.start().
//   - When the video pauses → engine.pause().
//   - When the video resumes → engine.resume().
//   - When timeupdate puts us in a new phase bucket → engine.setPhase().
//   - On unmount or `enabled` flip-to-false → engine.dispose().
//
// Phase progression is purely time-based for the first cut:
//
//   intro     0   – 15%
//   body      15  – 65%
//   build     65  – 90%
//   climax    90  – 95%      (one-shot, fired ONCE per crossing)
//   cooldown  95  – 100%
//
// A future revision will swap this in for vision-driven intensity from
// Watch With Xy frames, scene-change detection, or audio-RMS analysis of
// the video itself. For now: position-based, deterministic, debuggable.

import { useEffect, useRef, useState, useCallback } from 'react'
import { XyreneSoundEngine, type Phase, type XyreneSettingsState, type SoundCategoryName, type SoundMeta } from '../services/xyreneSoundEngine'

interface UseEngineOptions {
  /** Master enable flag. False → no engine even if video plays. */
  enabled: boolean
  /** Master volume 0-1. Multiplied with per-event volumes. */
  masterVolume?: number
  /** Optional override settings; if omitted, fetched via IPC on mount. */
  settings?: XyreneSettingsState
}

interface UseEngineState {
  ready: boolean
  playing: boolean
  phase: Phase
  /** Manually force the engine into a specific phase. Bypasses the
   *  position-driven phase detection — used for voice command "climax"
   *  or for explicit user-driven escalation. Returns to position-driven
   *  detection on the next video timeupdate event. */
  forcePhase?: (phase: Phase) => void
}

function phaseForProgress(p: number): Phase {
  if (p < 0.15) return 'intro'
  if (p < 0.65) return 'body'
  if (p < 0.9) return 'build'
  if (p < 0.95) return 'climax'
  return 'cooldown'
}

export function useXyreneSoundEngine(
  videoRef: React.RefObject<HTMLVideoElement | null>,
  options: UseEngineOptions,
): UseEngineState {
  const engineRef = useRef<XyreneSoundEngine | null>(null)
  const climaxFiredRef = useRef(false)
  const [state, setState] = useState<UseEngineState>({ ready: false, playing: false, phase: 'intro' })

  // Fetch settings if not provided.
  const [resolvedSettings, setResolvedSettings] = useState<XyreneSettingsState | null>(options.settings ?? null)
  useEffect(() => {
    if (options.settings) { setResolvedSettings(options.settings); return }
    if (!options.enabled) return
    let cancelled = false
    void (async () => {
      try {
        const s = await window.api.ai.xyreneGetSettings()
        if (!cancelled && s) setResolvedSettings(s as unknown as XyreneSettingsState)
      } catch (err) {
        console.warn('[useXyreneSoundEngine] failed to load settings:', err)
      }
    })()
    return () => { cancelled = true }
  }, [options.enabled, options.settings])

  // Engine lifecycle: create when (enabled && settings && video) all true.
  useEffect(() => {
    if (!options.enabled || !resolvedSettings) {
      if (engineRef.current) {
        engineRef.current.dispose()
        engineRef.current = null
        setState({ ready: false, playing: false, phase: 'intro' })
      }
      return
    }

    const engine = new XyreneSoundEngine({
      settings: resolvedSettings,
      masterVolume: options.masterVolume ?? 1,
      resolveUrl: (filename) => window.api.ai.xyrenePreviewSoundUrl(filename),
      resolveMeta: async (slot, filename) => {
        try {
          const m = await window.api.ai.xyreneGetSoundMeta({ curatedFilename: filename, category: slot })
          return (m as SoundMeta | null)
        } catch { return null }
      },
      // Climax voice synth — XTTS server, Xyrene's cloned voice. Used by
      // fireClimaxBurst when settings.climaxVoice.enabled is true.
      synthVoice: async (text, voice, opts) => {
        try {
          return await window.api.ai.xyrenePreviewVoice({
            voice,
            text,
            speed: opts?.speed,
            pitch: opts?.pitch,
            expression: opts?.expression,
          })
        } catch (err) {
          console.warn('[useXyreneSoundEngine] synthVoice failed:', err)
          return null
        }
      },
      onEvent: (ev) => {
        if (ev.type === 'phase' && ev.phase) {
          setState((s) => ({ ...s, phase: ev.phase! }))
        }
      },
    })
    engineRef.current = engine
    setState((s) => ({ ...s, ready: true }))
    climaxFiredRef.current = false

    return () => {
      engine.dispose()
      engineRef.current = null
      setState({ ready: false, playing: false, phase: 'intro' })
    }
  }, [options.enabled, resolvedSettings, options.masterVolume])

  // Wire to video element events.
  useEffect(() => {
    const video = videoRef.current
    const engine = engineRef.current
    if (!video || !engine || !options.enabled) return

    const onPlay = async () => {
      // Engine.start is idempotent; safe to call on every play event.
      // resume() handles the case where we were just paused.
      if (!state.playing) {
        await engine.start()
      } else {
        engine.resume()
      }
      setState((s) => ({ ...s, playing: true }))
    }

    const onPause = () => {
      engine.pause()
      setState((s) => ({ ...s, playing: false }))
    }

    const onEnded = () => {
      engine.stop()
      setState((s) => ({ ...s, playing: false, phase: 'intro' }))
      climaxFiredRef.current = false
    }

    const onTimeUpdate = () => {
      const dur = video.duration
      if (!isFinite(dur) || dur <= 0) return
      const p = video.currentTime / dur
      const next = phaseForProgress(p)
      // Climax is a one-shot — fire once per pass through the climax window
      // and don't bounce back into it.
      if (next === 'climax') {
        if (climaxFiredRef.current) return
        climaxFiredRef.current = true
        engine.setPhase('climax')
        return
      }
      // Reset the climax-fired latch when the user scrubs back before climax.
      if (p < 0.85) climaxFiredRef.current = false
      engine.setPhase(next)
    }

    video.addEventListener('play', onPlay)
    video.addEventListener('pause', onPause)
    video.addEventListener('ended', onEnded)
    video.addEventListener('timeupdate', onTimeUpdate)

    // If the video is already playing when we attach (common for HMR),
    // kick the engine immediately.
    if (!video.paused && !video.ended) void onPlay()

    return () => {
      video.removeEventListener('play', onPlay)
      video.removeEventListener('pause', onPause)
      video.removeEventListener('ended', onEnded)
      video.removeEventListener('timeupdate', onTimeUpdate)
    }
  }, [videoRef, options.enabled, state.playing])

  // forcePhase — exposed for voice commands / user-driven escalation.
  // Wraps engine.setPhase + flips the internal climax latch when
  // forcing climax so a second voice command can re-trigger.
  const forcePhase = useCallback((phase: Phase) => {
    const engine = engineRef.current
    if (!engine) return
    if (phase === 'climax') climaxFiredRef.current = true
    if (phase !== 'climax') climaxFiredRef.current = false
    engine.setPhase(phase)
    setState((s) => ({ ...s, phase }))
  }, [])

  return { ...state, forcePhase }
}
