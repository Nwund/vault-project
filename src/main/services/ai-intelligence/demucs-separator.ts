// File: src/main/services/ai-intelligence/demucs-separator.ts
// STATUS: scaffold — separate() returns null. See docs/ML_WRAPPER_BACKLOG.md.
//
// Demucs vocal/instrument separation (#25). Splits an audio stream
// into 4 stems (vocals / drums / bass / other). Used by:
//   - Cleaner Whisper transcription input (vocals stem only)
//   - Dedicated moan/spank channel for downstream BPM / onset analysis
//   - Mining vocal samples for voice-clone training (#27 F5-TTS pipeline)
//
// ACTIVATION:
//   Demucs is heavy enough that it's typically run as a Python
//   sidecar (similar to how JoyCaption runs). Two paths:
//
//   PATH A (recommended) — Python sidecar:
//     1. pip install -U demucs (in a Python 3.10+ venv).
//     2. Spawn `python -m demucs.separate -n htdemucs_ft <audio.wav>`
//        — outputs to ./separated/htdemucs_ft/<stem>.wav per stem.
//     3. Set settings.ai.demucsPython = '<path to venv python>'
//
//   PATH B (experimental) — ONNX runtime:
//     Mixxx's 2025 GSoC project exported Demucs-onnx; it's smaller
//     but constrained to specific input lengths. Drop at
//     <userData>/models/demucs.onnx and set settings.ai.useDemucsOnnx.
//
// PERFORMANCE: Demucs htdemucs_ft uses ~4 GB VRAM, processes a
// 5-minute song in ~10-30s on a 4070. CPU-only is ~10x slower.

import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'

export type DemucsStem = 'vocals' | 'drums' | 'bass' | 'other'

export interface DemucsResult {
  /** Map of stem name → temp WAV path. Caller should clean up. */
  stems: Partial<Record<DemucsStem, string>>
}

/**
 * Separate a track via the Python Demucs sidecar. Returns null when
 * the sidecar isn't configured.
 *
 * STUB: full implementation needs settings.ai.demucsPython + a
 * temp-output directory + WAV stitching. Fill in when needed.
 */
export async function demucsSeparate(_inputAudioPath: string): Promise<DemucsResult | null> {
  // Implementation would:
  //   1. Read settings.ai.demucsPython
  //   2. Spawn python -m demucs.separate with -n htdemucs_ft -o <tmp>
  //   3. Wait for exit, then collect <tmp>/htdemucs_ft/<basename>/<stem>.wav
  //   4. Return paths to stem WAVs.
  console.warn('[Demucs] separate() stub — wire up when settings.ai.demucsPython is configured')
  return null
}
