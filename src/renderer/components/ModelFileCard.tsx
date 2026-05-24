import { useState, useEffect, useCallback, useRef } from 'react'
import { CheckCircle2, XCircle, Loader2, ExternalLink, AlertTriangle } from 'lucide-react'
import { formatBytes } from '../utils/formatters'

export interface ModelFileCardProps {
  title: string
  description: string
  /** Probe IPC that returns whether the file is on disk + its path/size. */
  probe: () => Promise<{
    installed?: boolean
    available?: boolean
    expectedPath?: string
    detectorPath?: string
    recognizerPath?: string
    sizeBytes?: number
    detectorSize?: number
    recognizerSize?: number
    [k: string]: any
  } | null | undefined>
  /** Optional upstream URL surfaced in the "Not installed" instructions. */
  upstreamUrl?: string
  /** Free-text install hint (markdown not supported, keep short). */
  installHint?: string
  /** Optional one-click download IPC. Returns ok + sizeBytes/error.
   *  When present, an Install button replaces the manual instructions. */
  download?: () => Promise<{ ok?: boolean; error?: string; sizeBytes?: number; alreadyPresent?: boolean } | undefined>
  onToast?: (kind: 'success' | 'error' | 'info', msg: string) => void
}

type LoadState =
  | { kind: 'loading' }
  | { kind: 'ok'; status: NonNullable<Awaited<ReturnType<ModelFileCardProps['probe']>>> }
  | { kind: 'error'; error: string }
  | { kind: 'empty' } // probe returned null/undefined cleanly (IPC missing)

/**
 * Compact setup card for "model file on disk → feature unlocks" detectors.
 * Drop-in for the AI Tools page when adding a new optional detector — the
 * caller just passes probe / download / strings; the card handles layout,
 * status rendering, and re-check / install flows.
 *
 * IMPORTANT: probe is captured in a ref so callers can pass inline arrow
 * lambdas (which they all do) without re-firing the IPC on every parent
 * re-render. Without the ref, the AiTaggerPage rerendering for unrelated
 * reasons would loop the card back into "Checking..." perpetually — which
 * is exactly the "stuck loading" symptom users hit on JoyTag / upscaler /
 * WhisperX / F5-TTS cards.
 */
export function ModelFileCard({
  title,
  description,
  probe,
  upstreamUrl,
  installHint,
  download,
  onToast,
}: ModelFileCardProps) {
  const [load, setLoad] = useState<LoadState>({ kind: 'loading' })
  const [downloading, setDownloading] = useState(false)

  // Keep the LATEST probe function in a ref so refresh() always uses the
  // freshest one but doesn't itself change identity when the parent
  // re-renders with a new inline lambda.
  const probeRef = useRef(probe)
  useEffect(() => { probeRef.current = probe }, [probe])

  const refresh = useCallback(async () => {
    setLoad({ kind: 'loading' })
    try {
      const s = await probeRef.current()
      if (s == null) {
        // IPC returned nothing — usually means the handler isn't wired,
        // or the optional-chained preload bridge is missing. Don't loop.
        setLoad({ kind: 'empty' })
      } else {
        setLoad({ kind: 'ok', status: s })
      }
    } catch (err: any) {
      setLoad({ kind: 'error', error: err?.message ?? String(err) })
    }
  }, [])

  // Run ONCE on mount. Future re-runs go through the Re-check button.
  useEffect(() => { void refresh() }, [refresh])

  const status = load.kind === 'ok' ? load.status : null
  // installed = present-and-loaded. Three flavors:
  //   - { installed: true } — model file on disk
  //   - { available: true } — multi-file group (e.g. DB-CRNN OCR)
  //   - { ready: true } — sidecar pinged healthy
  const installed = !!(status?.installed || status?.available || (status as any)?.ready)
  const path = status?.expectedPath ?? status?.detectorPath ?? (status as any)?.startScript ?? ''
  const size = status?.sizeBytes ?? status?.detectorSize ?? 0

  return (
    <div className="bg-[var(--panel)] rounded-xl border border-[var(--border)] p-4">
      <div className="flex items-start justify-between gap-3 mb-2">
        <div>
          <h3 className="text-sm font-semibold">{title}</h3>
          <p className="text-xs text-[var(--muted)] mt-0.5">{description}</p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {load.kind === 'loading' ? (
            <Loader2 size={16} className="animate-spin text-[var(--muted)]" />
          ) : load.kind === 'error' ? (
            <AlertTriangle size={16} className="text-amber-400" />
          ) : installed ? (
            <CheckCircle2 size={16} className="text-emerald-400" />
          ) : (
            <XCircle size={16} className="text-red-400/60" />
          )}
        </div>
      </div>
      <div className="flex items-center justify-between gap-3 p-2 bg-white/5 rounded-md">
        <div className="min-w-0 text-[11px] flex-1">
          {load.kind === 'loading' && <span className="text-[var(--muted)]">Checking…</span>}
          {load.kind === 'error' && (
            <span className="text-amber-300" title={load.error}>Probe failed · {load.error.slice(0, 80)}</span>
          )}
          {load.kind === 'empty' && (
            <span className="text-[var(--muted)]">Probe returned nothing (IPC unavailable)</span>
          )}
          {load.kind === 'ok' && installed && (
            <span>
              Installed
              {size > 0 && <span className="text-[var(--muted)]"> · {formatBytes(size)}</span>}
            </span>
          )}
          {load.kind === 'ok' && !installed && <span className="text-[var(--muted)]">Not installed</span>}
          {path && (
            <div className="text-[10px] text-[var(--muted)] font-mono truncate mt-0.5" title={path}>
              {path}
            </div>
          )}
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {!installed && download && load.kind !== 'loading' && (
            <button
              disabled={downloading}
              onClick={async () => {
                setDownloading(true)
                try {
                  const r = await download()
                  if (r?.ok) {
                    onToast?.('success', r.alreadyPresent ? 'Already installed' : `Downloaded ${formatBytes(r.sizeBytes ?? 0)} · restart to activate`)
                    await refresh()
                  } else {
                    onToast?.('error', r?.error ?? 'Download failed')
                  }
                } catch (err: any) {
                  onToast?.('error', err?.message ?? 'Download failed')
                } finally {
                  setDownloading(false)
                }
              }}
              className="text-[11px] px-2 py-0.5 rounded bg-[var(--primary)] hover:opacity-90 text-white transition disabled:opacity-50"
            >
              {downloading ? '…' : 'Install'}
            </button>
          )}
          <button
            onClick={() => void refresh()}
            className="text-[11px] px-2 py-0.5 rounded bg-white/5 hover:bg-white/10 text-[var(--primary)] transition"
          >
            Re-check
          </button>
        </div>
      </div>
      {load.kind === 'ok' && !installed && (installHint || upstreamUrl) && (
        <div className="mt-2 text-[10px] text-[var(--muted)] space-y-0.5">
          {installHint && <div>{installHint}</div>}
          {upstreamUrl && (
            <a
              href={upstreamUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[var(--primary)] hover:underline"
            >
              <ExternalLink size={10} /> {upstreamUrl}
            </a>
          )}
        </div>
      )}
    </div>
  )
}
