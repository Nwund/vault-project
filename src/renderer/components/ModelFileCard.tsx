import { useState, useEffect, useCallback } from 'react'
import { CheckCircle2, XCircle, Loader2, ExternalLink } from 'lucide-react'
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

/**
 * Compact setup card for "model file on disk → feature unlocks" detectors.
 * Drop-in for the AI Tools page when adding a new optional detector — the
 * caller just passes probe / download / strings; the card handles layout,
 * status rendering, and re-check / install flows.
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
  const [status, setStatus] = useState<Awaited<ReturnType<typeof probe>> | null>(null)
  const [busy, setBusy] = useState(false)
  const [downloading, setDownloading] = useState(false)

  const refresh = useCallback(async () => {
    setBusy(true)
    try {
      const s = await probe()
      setStatus(s ?? null)
    } catch {
      setStatus(null)
    } finally {
      setBusy(false)
    }
  }, [probe])

  useEffect(() => { void refresh() }, [refresh])

  const installed = !!(status?.installed || status?.available)
  const path = status?.expectedPath ?? status?.detectorPath ?? ''
  const size = status?.sizeBytes ?? status?.detectorSize ?? 0

  return (
    <div className="bg-[var(--panel)] rounded-xl border border-[var(--border)] p-4">
      <div className="flex items-start justify-between gap-3 mb-2">
        <div>
          <h3 className="text-sm font-semibold">{title}</h3>
          <p className="text-xs text-[var(--muted)] mt-0.5">{description}</p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {status === null || busy ? (
            <Loader2 size={16} className="animate-spin text-[var(--muted)]" />
          ) : installed ? (
            <CheckCircle2 size={16} className="text-green-500" />
          ) : (
            <XCircle size={16} className="text-red-500/60" />
          )}
        </div>
      </div>
      <div className="flex items-center justify-between gap-3 p-2 bg-white/5 rounded-md">
        <div className="min-w-0 text-[11px] flex-1">
          {status === null && <span className="text-[var(--muted)]">Checking…</span>}
          {installed && (
            <span>
              Installed
              {size > 0 && <span className="text-[var(--muted)]"> · {formatBytes(size)}</span>}
            </span>
          )}
          {status && !installed && <span className="text-[var(--muted)]">Not installed</span>}
          {path && (
            <div className="text-[10px] text-[var(--muted)] font-mono truncate mt-0.5" title={path}>
              {path}
            </div>
          )}
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {!installed && download && (
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
      {status && !installed && (installHint || upstreamUrl) && (
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
