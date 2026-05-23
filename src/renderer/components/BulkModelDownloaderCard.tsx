// File: src/renderer/components/BulkModelDownloaderCard.tsx
//
// One-click batch installer for the permissively-licensed ONNX models
// Vault knows how to fetch (deepfake-detector, transnet-v2, wav2vec2-
// emotion, LAION CLAP, YAMNet class map). Models that need conversion
// from PyTorch/safetensors or that ship under non-commercial licenses
// (VideoMAE-v2, MERT, etc.) are NOT in this list — they need user
// intervention so we leave them to the dedicated drop-in cards.

import React, { useCallback, useEffect, useState } from 'react'
import { Download, Check, X as XIcon, RefreshCw, Loader2 } from 'lucide-react'
import { formatBytes } from '../utils/formatters'

interface Row {
  kind: string
  label: string
  filename: string
  expectedPath: string
  installed: boolean
  sizeBytes: number
  expectedBytes: number | null
}

export function BulkModelDownloaderCard(): React.JSX.Element {
  const [rows, setRows] = useState<Row[]>([])
  const [busy, setBusy] = useState<'list' | 'all' | string | null>('list')
  const [progress, setProgress] = useState<{ index: number; total: number; kind: string; label: string } | null>(null)
  const [lastResult, setLastResult] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setBusy('list')
    try {
      const r = await (window.api as any).ai.extraDownloadsList?.()
      setRows(Array.isArray(r) ? r : [])
    } finally {
      setBusy(null)
    }
  }, [])

  useEffect(() => {
    void refresh()
    const unsub = (window.api as any).ai.onExtraDownloadProgress?.((data: { index: number; total: number; kind: string; label: string }) => {
      setProgress(data)
    })
    return () => { try { unsub?.() } catch { /* ignore */ } }
  }, [refresh])

  const installOne = async (kind: string) => {
    setBusy(kind)
    setLastResult(null)
    try {
      const r = await (window.api as any).ai.extraDownload?.(kind)
      if (r?.ok) {
        setLastResult(r.alreadyPresent ? `${kind} already installed` : `Installed ${kind} (${formatBytes(r.sizeBytes ?? 0)})`)
      } else {
        setLastResult(`${kind} failed: ${r?.error ?? 'unknown'}`)
      }
    } catch (err: any) {
      setLastResult(`${kind} failed: ${err?.message ?? String(err)}`)
    } finally {
      setBusy(null)
      void refresh()
    }
  }

  const installAll = async () => {
    setBusy('all')
    setProgress({ index: 0, total: rows.length, kind: '', label: 'Starting…' })
    try {
      const r = await (window.api as any).ai.extraDownloadAll?.()
      if (r?.ok) {
        const ok = r.results.filter((x: any) => x.ok).length
        const failed = r.results.filter((x: any) => !x.ok)
        if (failed.length === 0) {
          setLastResult(`Installed all ${ok} model(s).`)
        } else {
          setLastResult(`${ok} ok, ${failed.length} failed: ${failed.map((f: any) => `${f.kind}: ${f.error}`).join('; ')}`)
        }
      } else {
        setLastResult('Batch install failed')
      }
    } catch (err: any) {
      setLastResult(`Batch install failed: ${err?.message ?? String(err)}`)
    } finally {
      setBusy(null)
      setProgress(null)
      void refresh()
    }
  }

  const missing = rows.filter((r) => !r.installed).length
  const total = rows.length

  return (
    <div className="bg-[var(--panel)] rounded-xl border border-[var(--border)] p-6">
      <h2 className="text-lg font-semibold mb-2 flex items-center gap-2">
        <Download size={20} />
        Auto-install detector models
      </h2>
      <p className="text-sm text-[var(--muted)] mb-4">
        One-click pull of every permissive-licensed ONNX Vault knows how to fetch.
        Skip this if you've already dropped your own weights — installs are
        idempotent. Models requiring conversion (PyTorch / safetensors) are
        left to the per-model cards below.
      </p>

      <div className="flex items-center justify-between p-3 bg-white/5 rounded-lg mb-3">
        <div className="text-sm">
          {busy === 'list' ? 'Probing…' :
            total === 0 ? 'No entries — registry is empty' :
            missing === 0 ? `All ${total} model(s) installed` :
            `${missing} of ${total} model(s) missing`}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={refresh}
            disabled={busy !== null}
            className="text-xs px-3 py-1 rounded bg-white/5 hover:bg-white/10 transition disabled:opacity-50 flex items-center gap-1.5"
          >
            <RefreshCw size={12} className={busy === 'list' ? 'animate-spin' : ''} />
            Refresh
          </button>
          <button
            onClick={installAll}
            disabled={busy !== null || missing === 0}
            className="text-xs px-3 py-1 rounded bg-[var(--primary)] hover:opacity-90 text-white transition disabled:opacity-50 flex items-center gap-1.5"
          >
            {busy === 'all' ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
            Download all missing
          </button>
        </div>
      </div>

      {progress && busy === 'all' && (
        <div className="mb-3 text-[11px] text-[var(--muted)]">
          {progress.index}/{progress.total} — {progress.label || progress.kind}
        </div>
      )}

      <div className="space-y-2">
        {rows.map((r) => (
          <div
            key={r.kind}
            className={`flex items-center gap-3 p-2 rounded-lg border ${
              r.installed ? 'bg-emerald-500/5 border-emerald-500/30' : 'bg-zinc-900/40 border-zinc-800'
            }`}
          >
            <div className={r.installed ? 'text-emerald-400' : 'text-zinc-600'}>
              {r.installed ? <Check size={14} /> : <XIcon size={14} />}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium">{r.label}</div>
              <div className="text-[10px] text-zinc-500 font-mono truncate" title={r.expectedPath}>
                {r.filename}
              </div>
            </div>
            {r.installed ? (
              <div className="text-[10px] text-zinc-500 tabular-nums">{formatBytes(r.sizeBytes)}</div>
            ) : (
              <button
                onClick={() => installOne(r.kind)}
                disabled={busy !== null}
                className="text-[11px] px-2 py-1 rounded bg-[var(--primary)]/15 hover:bg-[var(--primary)]/25 text-[var(--primary)] border border-[var(--primary)]/30 transition disabled:opacity-50 flex items-center gap-1"
              >
                {busy === r.kind ? <Loader2 size={10} className="animate-spin" /> : <Download size={10} />}
                Install
                {r.expectedBytes ? <span className="opacity-70">({formatBytes(r.expectedBytes)})</span> : null}
              </button>
            )}
          </div>
        ))}
      </div>

      {lastResult && (
        <div className="mt-3 text-[11px] text-[var(--muted)] whitespace-pre-wrap">{lastResult}</div>
      )}
    </div>
  )
}
