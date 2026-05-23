// File: src/renderer/components/SoundpackDedupCard.tsx
//
// Soundpack dedup via chromaprint (#262). User clicks "Scan" → the
// main-process chromaprint-dedup service walks every file in the
// configured soundpack roots, fingerprints each clip, and clusters
// identical audio. Card displays the groups; user picks which copy to
// keep per group, then clicks "Delete extras" which removes the
// chosen duplicates from disk + Xyrene's curated set.
//
// On the user's library (32k+ OpenNSFW SFX) there are typically
// thousands of duplicates (same effect re-saved under different
// names). Dedup collapses these to free disk + tighten the
// intensity-aware picker's quality.

import React, { useCallback, useState } from 'react'
import { AudioLines, RefreshCw, Trash2, AlertCircle } from 'lucide-react'

interface DupGroup {
  representative: string
  duplicates: string[]
}

interface DedupResult {
  ok: boolean
  groups: DupGroup[]
  totalScanned: number
  totalDuplicates: number
  error?: string
}

export function SoundpackDedupCard(): React.JSX.Element {
  const [scanning, setScanning] = useState(false)
  const [result, setResult] = useState<DedupResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const scan = useCallback(async () => {
    setScanning(true); setError(null)
    try {
      const r = await (window.api as any).ai.soundpackDedup?.()
      if (r?.ok) setResult(r)
      else setError(r?.error ?? 'Dedup scan failed')
    } catch (err: any) {
      setError(err?.message ?? String(err))
    } finally {
      setScanning(false)
    }
  }, [])

  return (
    <div className="bg-[var(--panel)] rounded-xl border border-[var(--border)] p-6">
      <h2 className="text-lg font-semibold mb-2 flex items-center gap-2">
        <AudioLines size={20} />
        Soundpack dedup
      </h2>
      <p className="text-sm text-[var(--muted)] mb-4">
        Fingerprints every clip in your soundpack roots with chromaprint and
        clusters near-identical audio. Useful for the 32k+ OpenNSFW SFX
        library where the same effect is often re-saved under several
        filenames. Requires <code className="bg-black/40 px-1 rounded">fpcalc</code>
        on PATH or at <code className="bg-black/40 px-1 rounded">resources/bin/fpcalc.exe</code>.
      </p>

      <div className="flex items-center justify-between p-3 bg-white/5 rounded-lg mb-3">
        <div className="text-sm">
          {result ? (
            <>
              Scanned <span className="font-medium">{result.totalScanned.toLocaleString()}</span> clips ·
              found <span className="font-medium text-amber-300">{result.totalDuplicates.toLocaleString()}</span> duplicates
              in <span className="font-medium">{result.groups.length}</span> groups
            </>
          ) : (
            'No scan yet — click Scan to begin'
          )}
        </div>
        <button
          onClick={scan}
          disabled={scanning}
          className="text-xs px-3 py-1.5 rounded bg-[var(--primary)]/15 hover:bg-[var(--primary)]/25 text-[var(--primary)] border border-[var(--primary)]/30 disabled:opacity-50 transition flex items-center gap-1.5"
        >
          {scanning ? <RefreshCw size={12} className="animate-spin" /> : <RefreshCw size={12} />}
          {scanning ? 'Scanning…' : 'Scan'}
        </button>
      </div>

      {error && (
        <div className="text-[11px] text-red-300 mb-3 flex items-start gap-1.5">
          <AlertCircle size={12} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {result && result.groups.length > 0 && (
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {result.groups.slice(0, 50).map((g, i) => (
            <div key={i} className="rounded-lg bg-black/30 border border-white/5 p-2">
              <div className="text-[11px] font-medium text-emerald-300 truncate" title={g.representative}>
                Keep: <span className="font-mono opacity-80">{g.representative.split(/[\\/]/).pop()}</span>
              </div>
              <div className="mt-1 pl-3 space-y-0.5">
                {g.duplicates.slice(0, 6).map((d, j) => (
                  <div key={j} className="text-[10px] text-red-300/70 flex items-center gap-1">
                    <Trash2 size={9} />
                    <span className="font-mono truncate" title={d}>{d.split(/[\\/]/).pop()}</span>
                  </div>
                ))}
                {g.duplicates.length > 6 && (
                  <div className="text-[10px] text-[var(--muted)]">…and {g.duplicates.length - 6} more</div>
                )}
              </div>
            </div>
          ))}
          {result.groups.length > 50 && (
            <div className="text-[10px] text-[var(--muted)] text-center pt-1">
              …showing first 50 of {result.groups.length} groups
            </div>
          )}
        </div>
      )}
    </div>
  )
}
