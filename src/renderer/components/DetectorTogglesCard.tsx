// File: src/renderer/components/DetectorTogglesCard.tsx
//
// Per-detector enable / disable toggles (#288). The processing-queue
// already gates several detectors on per-setting flags
// (useTransNet, useDbCrnnOcr, whisperEnabled). This card surfaces
// them in one place so a user on a slow machine can opt out of the
// heavy ones without hunting through the Settings tabs.

import React, { useCallback, useEffect, useState } from 'react'
import { Sliders } from 'lucide-react'

interface AiSettings {
  useTransNet?: boolean
  useDbCrnnOcr?: boolean
  whisperEnabled?: boolean
  joycaptionAutoStart?: boolean
  whisperxAutoStart?: boolean
  f5ttsAutoStart?: boolean
}

interface ToggleRow {
  key: keyof AiSettings
  label: string
  description: string
}

const ROWS: ToggleRow[] = [
  { key: 'useTransNet', label: 'TransNet v2 scene boundaries', description: 'Higher-quality shot detection than ffmpeg scdet. Requires transnet-v2.onnx.' },
  { key: 'useDbCrnnOcr', label: 'PaddleOCR text extraction', description: 'Pulls captions/signage out of frames. Adds ~1s/video. Requires text-detection-db.onnx + text-recognition-crnn.onnx.' },
  { key: 'whisperEnabled', label: 'Whisper audio transcription', description: 'Adds word-level transcripts (and speaker diarization when WhisperX sidecar is up). Adds 3-30s per video.' },
  { key: 'joycaptionAutoStart', label: 'JoyCaption auto-start', description: 'Boots the JoyCaption sidecar at app launch for higher-quality vision captions.' },
  { key: 'whisperxAutoStart', label: 'WhisperX auto-start', description: 'Boots the WhisperX sidecar at app launch (word-level + diarized; falls back to whisper.cpp when off).' },
  { key: 'f5ttsAutoStart', label: 'F5-TTS auto-start', description: 'Alternative voice-clone TTS sidecar. Switch via settings.ai.xyreneVoiceBackend = "f5tts".' },
]

export function DetectorTogglesCard(): React.JSX.Element {
  const [ai, setAi] = useState<AiSettings | null>(null)

  const refresh = useCallback(async () => {
    try {
      const s: any = await (window.api as any).settings?.get?.()
      setAi((s?.ai ?? {}) as AiSettings)
    } catch { /* ignore */ }
  }, [])

  useEffect(() => {
    void refresh()
    // Re-fetch when main broadcasts settings:changed (toggle elsewhere
    // in Settings should keep this card in sync).
    const unsub = (window.api as any).events?.onSettingsChanged?.((s: any) => {
      if (s?.ai) setAi(s.ai as AiSettings)
    })
    return () => { try { unsub?.() } catch { /* ignore */ } }
  }, [refresh])

  const flip = useCallback(async (key: keyof AiSettings) => {
    if (!ai) return
    const next = !ai[key]
    setAi({ ...ai, [key]: next })
    try {
      // Generic settings:update with a partial ai patch is the safest
      // way to write a single AI field without trampling siblings.
      await (window.api as any).settings.update?.({ ai: { [key]: next } })
    } catch { /* settings:changed broadcast will reconcile if write fails */ }
  }, [ai])

  return (
    <div className="bg-[var(--panel)] rounded-xl border border-[var(--border)] p-6">
      <h2 className="text-lg font-semibold mb-2 flex items-center gap-2">
        <Sliders size={20} />
        Detector toggles
      </h2>
      <p className="text-sm text-[var(--muted)] mb-4">
        Disable the slow ones if your AI queue is taking too long. Each
        toggle is read by the processing queue before that detector runs;
        no restart needed.
      </p>
      <div className="space-y-2">
        {ROWS.map((row) => {
          const on = !!ai?.[row.key]
          return (
            <div key={row.key} className="flex items-center justify-between gap-3 p-2 rounded-lg bg-white/5 border border-white/5">
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium">{row.label}</div>
                <div className="text-[11px] text-[var(--muted)]">{row.description}</div>
              </div>
              <button
                onClick={() => flip(row.key)}
                role="switch"
                aria-checked={on}
                className={`shrink-0 relative w-10 h-5 rounded-full transition-colors ${on ? 'bg-[var(--primary)]' : 'bg-zinc-700'}`}
              >
                <span className={`absolute top-0.5 ${on ? 'left-5' : 'left-0.5'} w-4 h-4 rounded-full bg-white transition-all`} />
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
