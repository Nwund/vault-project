// File: src/renderer/components/ServerKeyframeExtractor.tsx
//
// Server-backed keyframe extractor that doesn't depend on a real video
// element being mounted. Replaces the in-renderer KeyframeExtractor
// for the Library tool dropdown (LibraryPage instantiates the dialog
// with a freshly-created videoRef that has no video attached — the
// renderer version can never extract anything in that case).
//
// Talks to `window.api.mediaTools.extractFrames` which runs an ffmpeg
// `fps=1/N,scale=W:-2` pass and returns the list of written files.

import React, { useState, useCallback } from 'react'
import { Loader2, Image as ImageIcon, FolderOpen, Check } from 'lucide-react'
import { formatDuration } from '../utils/formatters'

export function ServerKeyframeExtractor({
  mediaPath,
  duration,
  onDone,
  className = '',
}: {
  mediaPath: string
  duration: number
  onDone?: (count: number) => void
  className?: string
}) {
  const [intervalSec, setIntervalSec] = useState(10)
  const [width, setWidth] = useState(640)
  const [quality, setQuality] = useState<'high' | 'medium' | 'low'>('medium')
  const [busy, setBusy] = useState(false)
  const [output, setOutput] = useState<string | null>(null)
  const [frames, setFrames] = useState<Array<{ time: number; path: string }>>([])
  const [error, setError] = useState<string | null>(null)

  const pickOutputDir = useCallback(async () => {
    const dir = await window.api.dialogOpenFolder?.({ title: 'Pick output folder for extracted frames' })
    if (dir) setOutput(dir)
  }, [])

  const run = useCallback(async () => {
    if (!output) return
    setBusy(true)
    setError(null)
    setFrames([])
    try {
      const res = await window.api.mediaTools.extractFrames({
        srcPath: mediaPath,
        options: { intervalSec, outputDir: output, quality, width },
      })
      if (!res.ok) {
        setError(res.error ?? 'Extract failed')
      } else {
        setFrames(res.frames ?? [])
        onDone?.(res.frames?.length ?? 0)
      }
    } catch (err: any) {
      setError(err?.message ?? String(err))
    } finally {
      setBusy(false)
    }
  }, [mediaPath, intervalSec, output, quality, width, onDone])

  const estimatedCount = Math.max(0, Math.floor(duration / Math.max(0.1, intervalSec)))

  return (
    <div className={`bg-zinc-900 rounded-xl border border-[var(--border)] overflow-hidden ${className}`}>
      <div className="px-4 py-3 border-b border-zinc-800 flex items-center gap-2">
        <ImageIcon size={16} className="text-[var(--primary)]" />
        <span className="font-semibold text-sm">Extract Keyframes</span>
        <span className="text-xs text-zinc-500 ml-auto">~{estimatedCount} frames · {formatDuration(duration)} video</span>
      </div>
      <div className="p-4 space-y-4">
        <div>
          <label className="text-xs text-zinc-500">Interval (seconds between frames)</label>
          <input
            type="number"
            min={0.5}
            step={0.5}
            value={intervalSec}
            onChange={(e) => setIntervalSec(Math.max(0.1, parseFloat(e.target.value) || 10))}
            className="w-full mt-1 px-3 py-2 bg-zinc-800 rounded text-sm"
          />
        </div>
        <div>
          <label className="text-xs text-zinc-500">Frame width (height auto)</label>
          <select value={width} onChange={(e) => setWidth(parseInt(e.target.value, 10))} className="w-full mt-1 px-3 py-2 bg-zinc-800 rounded text-sm">
            <option value={320}>320 px</option>
            <option value={640}>640 px</option>
            <option value={960}>960 px</option>
            <option value={1280}>1280 px</option>
            <option value={1920}>1920 px (full HD)</option>
          </select>
        </div>
        <div>
          <label className="text-xs text-zinc-500">JPEG quality</label>
          <div className="grid grid-cols-3 gap-2 mt-1">
            {(['high', 'medium', 'low'] as const).map((q) => (
              <button
                key={q}
                onClick={() => setQuality(q)}
                className={`px-3 py-2 rounded text-sm capitalize ${quality === q ? 'bg-[var(--primary)]' : 'bg-zinc-800'}`}
              >
                {q}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="text-xs text-zinc-500">Output folder</label>
          <div className="flex gap-2 mt-1">
            <input
              value={output ?? ''}
              readOnly
              placeholder="Pick a folder…"
              className="flex-1 px-3 py-2 bg-zinc-800 rounded text-sm"
            />
            <button onClick={pickOutputDir} className="px-3 py-2 bg-zinc-800 rounded">
              <FolderOpen size={14} />
            </button>
          </div>
        </div>
        {error && <div className="text-xs text-red-300 bg-red-500/10 border border-red-500/30 rounded px-3 py-2">{error}</div>}
        {frames.length > 0 && (
          <div className="text-xs text-emerald-200 bg-emerald-500/10 border border-emerald-500/30 rounded px-3 py-2 flex items-center gap-2">
            <Check size={12} />
            Extracted {frames.length} frames to {output}
          </div>
        )}
        <button
          onClick={run}
          disabled={!output || busy}
          className="w-full flex items-center justify-center gap-2 py-3 rounded bg-[var(--primary)] text-sm disabled:opacity-50"
        >
          {busy ? <Loader2 size={16} className="animate-spin" /> : <ImageIcon size={16} />}
          {busy ? 'Extracting…' : 'Extract keyframes'}
        </button>
      </div>
    </div>
  )
}
