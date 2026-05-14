// File: src/main/services/ai-intelligence/extra-model-status.ts
//
// Status registry for a class of "drop-in ONNX models" Vault knows
// how to use IF the user provides the weights, but doesn't ship by
// default. Each entry produces an installed / expectedPath / sizeBytes
// triple plus a usage hint that the Setup tab surfaces.
//
// Adding a new model:
//   1. Append to MODEL_REGISTRY with the expected userData path.
//   2. Add a thin runtime wrapper next to this file (mirroring
//      deepfake-detector.ts / ai-image-detector.ts).
//   3. Wire the runtime wrapper into processing-queue.ts at the right
//      pipeline step.
//
// The registry exists so the renderer can show a "models you can
// install" gallery WITHOUT a separate IPC per model. One IPC,
// table-driven UI.

import fs from 'node:fs'
import path from 'node:path'
import { app } from 'electron'

export type ExtraModelKind =
  | 'transnet-v2'                // shot boundary detector
  | 'videomae-v2'                // per-clip action classifier
  | 'x-clip'                     // zero-shot video text-action
  | 'tbt-former'                 // temporal action localization
  | 'yamnet'                     // AudioSet pre-filter
  | 'clap-audio'                 // LAION CLAP zero-shot audio
  | 'demucs-v4'                  // vocal/instrument separation
  | 'sexual-audio-classifier'    // YAMNet/AST head
  | 'essentia-musicnn'           // BPM / key / mood
  | 'videochat-flash'            // long-video VLM (HF sidecar config)

interface ExtraModel {
  kind: ExtraModelKind
  /** File name expected at <userData>/models/<filename>. */
  filename: string
  /** Human label for the Setup tab card. */
  label: string
  /** One-line description of what enabling it gets the user. */
  description: string
  /** Pipeline stage this model plugs into — for ordering in the UI. */
  stage: 'vision' | 'audio' | 'video' | 'text'
  /** When set, indicates the model takes a SECONDARY file (config /
   *  vocab / class names) that also needs to be present. */
  companions?: string[]
}

const MODEL_REGISTRY: ExtraModel[] = [
  {
    kind: 'transnet-v2',
    filename: 'transnet-v2.onnx',
    label: 'TransNet V2 (shot boundaries)',
    description: 'Cuts video into shots — improves contact-sheet quality + biases AI frame sampling toward distinct shots.',
    stage: 'video',
  },
  {
    kind: 'videomae-v2',
    filename: 'videomae-v2.onnx',
    label: 'VideoMAE v2 (action classifier)',
    description: 'Per-clip action recognition over Kinetics-400. Adds verb tags (dancing / kissing / walking / etc).',
    stage: 'video',
  },
  {
    kind: 'x-clip',
    filename: 'x-clip.onnx',
    label: 'X-CLIP (zero-shot video text-action)',
    description: 'Score arbitrary text against video clips. Powers "find the part where X" without training.',
    stage: 'video',
  },
  {
    kind: 'tbt-former',
    filename: 'tbt-former.onnx',
    label: 'TBT-Former (temporal localization)',
    description: 'Localize WHEN an action happens — start + end timestamps instead of "this video contains X."',
    stage: 'video',
  },
  {
    kind: 'yamnet',
    filename: 'yamnet.onnx',
    label: 'YAMNet (AudioSet 521-class)',
    description: 'Cheap audio pre-filter — distinguishes speech / music / moans / silence so deeper audio models skip uninteresting clips.',
    stage: 'audio',
    companions: ['yamnet-class-map.csv'],
  },
  {
    kind: 'clap-audio',
    filename: 'laion-clap-audio.onnx',
    label: 'LAION CLAP (zero-shot audio)',
    description: 'CLIP-for-audio: score arbitrary text descriptions against audio clips. Same vibe as CLIP search but for sound.',
    stage: 'audio',
  },
  {
    kind: 'demucs-v4',
    filename: 'demucs-v4.onnx',
    label: 'Demucs v4 (vocal isolation)',
    description: 'Separate vocals from background music in the audio track. Cleaner Whisper input + lets you re-mix audio.',
    stage: 'audio',
  },
  {
    kind: 'sexual-audio-classifier',
    filename: 'sexual-audio-classifier.onnx',
    label: 'Sexual-audio classifier (YAMNet/AST head)',
    description: 'Fine-tuned head on YAMNet embeddings that scores P(sexual audio) per clip. Audio-only signal complement to vision tags.',
    stage: 'audio',
  },
  {
    kind: 'essentia-musicnn',
    filename: 'essentia-musicnn.onnx',
    label: 'Essentia MusicNN (BPM / key / mood)',
    description: 'Music descriptor extractor — emits BPM, key signature, energy / mood tags. Useful for PMV editor matching.',
    stage: 'audio',
  },
  {
    kind: 'videochat-flash',
    filename: 'videochat-flash-config.json',
    label: 'VideoChat-Flash (long-video VLM)',
    description: 'Sidecar config pointer for the HF videochat-flash hierarchical VLM. Used for >5min videos where Tier 2 frame-sampling loses temporal coherence.',
    stage: 'video',
    companions: ['videochat-flash-config.json'],
  },
]

export interface ExtraModelStatus {
  kind: ExtraModelKind
  label: string
  description: string
  stage: 'vision' | 'audio' | 'video' | 'text'
  installed: boolean
  expectedPath: string
  sizeBytes: number
  companions: Array<{ filename: string; installed: boolean; expectedPath: string }>
}

function modelsDir(): string {
  return path.join(app.getPath('userData'), 'models')
}

export function getExtraModelStatus(kind: ExtraModelKind): ExtraModelStatus | null {
  const entry = MODEL_REGISTRY.find((m) => m.kind === kind)
  if (!entry) return null
  const expectedPath = path.join(modelsDir(), entry.filename)
  let installed = false
  let sizeBytes = 0
  try {
    const stat = fs.statSync(expectedPath)
    installed = stat.isFile()
    sizeBytes = stat.size
  } catch { /* not installed */ }
  const companions = (entry.companions ?? []).map((c) => {
    const p = path.join(modelsDir(), c)
    let companionInstalled = false
    try { companionInstalled = fs.statSync(p).isFile() } catch { /* missing */ }
    return { filename: c, installed: companionInstalled, expectedPath: p }
  })
  return {
    kind: entry.kind,
    label: entry.label,
    description: entry.description,
    stage: entry.stage,
    installed,
    expectedPath,
    sizeBytes,
    companions,
  }
}

export function listExtraModelStatuses(): ExtraModelStatus[] {
  return MODEL_REGISTRY
    .map((m) => getExtraModelStatus(m.kind))
    .filter((s): s is ExtraModelStatus => s !== null)
}
