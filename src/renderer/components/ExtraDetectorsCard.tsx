// File: src/renderer/components/ExtraDetectorsCard.tsx
//
// #134 + #135 etc. — Setup-tab card that surfaces the install status
// of every "drop-in ONNX" detector Vault knows how to use but doesn't
// ship a model for. Each row shows installed/missing, the expected
// path under userData/models, and a one-line description of what
// enabling it unlocks.
//
// The detectors here are the wrappers CLAUDE.md describes as
// "functional, no consumer wired" — they DO run in the pipeline
// (processing-queue invokes them) but until now had no UI surface,
// which made it impossible for users to know if their model file was
// loaded.
//
// Polls each `ai:*-status` IPC on mount and on a 30s tick so a user
// dropping a model into the folder sees it light up without
// restarting Vault.

import React, { useCallback, useEffect, useState } from 'react'
import { Cpu, Check, X as XIcon, FolderOpen, RefreshCw } from 'lucide-react'
import { formatBytes } from '../utils/formatters'

interface DetectorRow {
  id: string
  label: string
  description: string
  ipc: string
  status?: {
    installed: boolean
    expectedPath: string
    sizeBytes?: number
    /** Set by deepfake / ai-image detector when a PyTorch / safetensors
     *  variant is on disk but the loader is ONNX-only. */
    incompatibleFound?: string
  }
}

const DETECTORS: Omit<DetectorRow, 'status'>[] = [
  // ── Vision detectors ─────────────────────────────────────────────
  {
    id: 'deepfake',
    label: 'Deepfake / synthetic face detector (#134)',
    description: 'OpenFake-style binary classifier on YuNet face crops. Adds a "deepfake" tag when P(fake) ≥ threshold.',
    ipc: 'ai:deepfake-status',
  },
  {
    id: 'ai-image',
    label: 'AI-image detector',
    description: 'Per-frame SD/MJ/DALL-E binary classifier. Tags fully-synthetic images for filtering or sorting.',
    ipc: 'ai:ai-image-status',
  },
  {
    id: 'aesthetic',
    label: 'LAION aesthetic predictor (#135)',
    description: 'CLIP-embedding MLP head that scores 0-10. Powers "show me my best 100" + thumb selection.',
    ipc: 'ai:aesthetic-status',
  },
  {
    id: 'sface',
    label: 'SFace face recognition',
    description: '128-D face embedding for clustering known people across the library.',
    ipc: 'ai:sface-status',
  },
  {
    id: 'adaface',
    label: 'AdaFace / TopoFR face recognition (#128)',
    description: 'Modern replacement for SFace — 2-3% better on low-quality crops. 512-D L2-normalized embedding.',
    ipc: 'ai:adaface-status',
  },
  {
    id: 'person-reid',
    label: 'Person re-identification (#127)',
    description: '768-D body embedding for "find this body in other clips" even when the face is obscured.',
    ipc: 'ai:person-reid-status',
  },
  // ── Text / OCR ──────────────────────────────────────────────────
  {
    id: 'db-crnn',
    label: 'Paddle OCR (DB + CRNN)',
    description: 'Two-stage text detection + recognition. Pulls captions / signage / chat-overlay text out of frames.',
    ipc: 'ai:db-crnn-status',
  },
  // ── Audio detectors ──────────────────────────────────────────────
  {
    id: 'beats',
    label: 'BEATs audio tagger (#121)',
    description: '527-class AudioSet labels (moans / slaps / music / ambient). Gates Tier 2 prompt style.',
    ipc: 'ai:beats-status',
  },
  {
    id: 'panns',
    label: 'PANNs CNN14 segmenter (#122)',
    description: 'Music vs speech vs SFX vs ambient frame-level probabilities. Powers "skip to dialogue" + chapter detection.',
    ipc: 'ai:panns-status',
  },
  // ── Scaffold-only models (single bulk IPC) ───────────────────────
  {
    id: 'wav2vec2-emotion',
    label: 'Wav2Vec2-Large emotion classifier (#123)',
    description: 'Per-utterance valence / arousal / dominance — mood-aware filters + Today\'s Mix affect dimensions.',
    ipc: 'scaffold:wav2vec2Emotion',
  },
  {
    id: 'x-clip',
    label: 'X-CLIP video-native CLIP (#124)',
    description: '8-frame clip-level embeddings — natural-language search like "rough doggy on couch" by motion, not keyframes.',
    ipc: 'scaffold:xClip',
  },
  {
    id: 'videomae-v2',
    label: 'VideoMAE-v2 action recognition (#125)',
    description: '710 Kinetics action classes per shot — adds verb tags (dancing / kissing / etc) to the canonical tag set.',
    ipc: 'scaffold:videoMaeV2',
  },
  {
    id: 'internvideo2',
    label: 'InternVideo2-Stage2 distilled (#126)',
    description: 'SOTA 2025 video-text retrieval. Tier 1.5 "scene gist" embedding to ground Tier 2 captions.',
    ipc: 'scaffold:internVideo2',
  },
  {
    id: 'solider',
    label: 'SOLIDER / TransReID-SSL (#127)',
    description: '+7 mAP over current body re-id. Drop-in replacement for cross-video body-cluster linking.',
    ipc: 'scaffold:solider',
  },
  {
    id: 'neuralfp',
    label: 'NeuralFP background music ID (#129)',
    description: 'CNN-over-mel learned fingerprint vs a local AcoustID mirror — "find scenes with this song" search.',
    ipc: 'scaffold:neuralFp',
  },
  {
    id: 'mert',
    label: 'MERT-v1-330M music understanding (#130)',
    description: 'Genre / instrument / mood embeddings — feeds Today\'s Mix + music-style recommendations.',
    ipc: 'scaffold:mert',
  },
  {
    id: 'longclip',
    label: 'LongCLIP chapter labeling (#132)',
    description: 'Long-form text-image alignment for YouTube-style chapter labels + scene-aware hover preview (#201).',
    ipc: 'scaffold:longClip',
  },
]

export function ExtraDetectorsCard(): React.JSX.Element {
  const [rows, setRows] = useState<DetectorRow[]>(DETECTORS.map((d) => ({ ...d })))
  const [refreshing, setRefreshing] = useState(false)

  const refresh = useCallback(async () => {
    setRefreshing(true)
    try {
      const api: any = (window as any).api
      // Bulk fetch the scaffold-only statuses in one call (#123 +
      // friends) so we don't fire 8 IPCs for the simple cases.
      let scaffoldBulk: Record<string, { installed: boolean; expectedPath: string }> = {}
      try { scaffoldBulk = await api.invoke('ai:scaffold-statuses') ?? {} } catch { /* IPC missing */ }
      const next = await Promise.all(rows.map(async (r) => {
        // Scaffold rows have ipc='scaffold:<key>' — read from the bulk
        // response instead of firing a separate IPC.
        if (r.ipc.startsWith('scaffold:')) {
          const key = r.ipc.slice('scaffold:'.length)
          const status = (scaffoldBulk as any)[key]
          return { ...r, status: status ?? { installed: false, expectedPath: '(scaffold IPC missing)' } }
        }
        try {
          const status = await api.invoke(r.ipc)
          return { ...r, status }
        } catch {
          return { ...r, status: { installed: false, expectedPath: '(IPC unavailable)' } }
        }
      }))
      setRows(next)
    } finally {
      setRefreshing(false)
    }
  // rows only carries IDs; safe to depend on rows.length
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows.length])

  useEffect(() => {
    void refresh()
    const t = setInterval(refresh, 30_000)
    return () => clearInterval(t)
  }, [refresh])

  return (
    <div className="rounded-3xl border border-[var(--border)] bg-black/20 p-5 mt-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Cpu size={16} className="text-[var(--primary)]" />
          <div className="text-sm font-semibold">Extra detectors (drop-in ONNX)</div>
        </div>
        <button
          onClick={refresh}
          disabled={refreshing}
          className="flex items-center gap-1.5 text-xs px-2 py-1 rounded-md bg-zinc-800 hover:bg-zinc-700 text-zinc-300 disabled:opacity-50"
        >
          <RefreshCw size={12} className={refreshing ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      <div className="text-xs text-[var(--muted)] mb-3">
        Drop the listed ONNX file into <code className="px-1 py-0.5 rounded bg-zinc-900">%APPDATA%\Vault\models\</code> and click refresh — Vault picks it up without a restart.
      </div>

      <div className="space-y-2">
        {rows.map((r) => {
          const installed = r.status?.installed ?? false
          return (
            <div
              key={r.id}
              className={`flex items-start gap-3 p-3 rounded-lg border ${
                installed ? 'bg-emerald-500/5 border-emerald-500/30' : 'bg-zinc-900/40 border-zinc-800'
              }`}
            >
              <div className={`mt-0.5 ${installed ? 'text-emerald-400' : 'text-zinc-600'}`}>
                {installed ? <Check size={16} /> : <XIcon size={16} />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium">{r.label}</div>
                <div className="text-[11px] text-zinc-400 mt-0.5">{r.description}</div>
                {r.status?.expectedPath && (
                  <div className="text-[10px] text-zinc-600 mt-1 font-mono truncate">
                    {r.status.expectedPath}
                  </div>
                )}
                {r.status?.incompatibleFound && (
                  <div className="text-[10px] text-amber-400 mt-1 truncate" title={r.status.incompatibleFound}>
                    Found incompatible format: <span className="font-mono">{r.status.incompatibleFound.split(/[\\/]/).pop()}</span> — convert to ONNX to activate.
                  </div>
                )}
              </div>
              {installed && r.status?.sizeBytes ? (
                <div className="text-[10px] text-zinc-500 tabular-nums shrink-0 mt-1">
                  {formatBytes(r.status.sizeBytes)}
                </div>
              ) : null}
              <button
                onClick={async () => {
                  const api: any = (window as any).api
                  try {
                    await api.shell?.showItemInFolder?.(r.status?.expectedPath)
                  } catch { /* noop */ }
                }}
                className="p-1 text-zinc-500 hover:text-zinc-200 shrink-0"
                title="Open models folder"
              >
                <FolderOpen size={12} />
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
