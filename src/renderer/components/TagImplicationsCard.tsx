'use memo'
// File: src/renderer/components/TagImplicationsCard.tsx
//
// #317 E-93 — Tag-implication import (Hydrus/Danbooru CSV format).
// Imports rows like "creampie,internal_creampie" so the tagger can
// auto-expand a child tag with all its parents. Live UI for the
// `media.tagImplications.importCsv(File)` IPC bridge.

import { useState, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { GitBranch, Upload, Check, Loader2, AlertTriangle, Folder } from 'lucide-react'
import { useToast } from '../contexts'
import { SPRINGS, FADE_SLIDE, type ServiceState } from './network/motion-tokens'
import { NetworkServiceCard, NetworkActionRow, NetworkGhostBtn, NetworkPrimaryBtn } from './network/NetworkServiceCard'

export function TagImplicationsCard() {
  const { showToast } = useToast()
  const [busy, setBusy] = useState(false)
  const [lastResult, setLastResult] = useState<{ inserted: number; skipped: number; errors?: string[] } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const onPickFile = useCallback(async () => {
    const picked = await window.api.dialogOpenFile({
      title: 'Pick Hydrus/Danbooru implication CSV',
      filters: [{ name: 'CSV', extensions: ['csv', 'txt'] }],
    })
    if (!picked) return
    setBusy(true)
    setError(null)
    try {
      const res = await window.api.tags.tagImplications.importCsvFile(picked)
      if (!res.ok) throw new Error(res.error ?? 'Import failed')
      setLastResult({ inserted: res.inserted ?? 0, skipped: res.skipped ?? 0, errors: res.errors })
      showToast?.('success', `Imported ${res.inserted ?? 0} implications (${res.skipped ?? 0} skipped)`)
    } catch (e: any) {
      setError(e?.message ?? String(e))
    } finally {
      setBusy(false)
    }
  }, [showToast])

  const onPasteCsv = useCallback(async () => {
    try {
      const text = await navigator.clipboard.readText()
      if (!text.trim()) return showToast?.('info', 'Clipboard is empty')
      setBusy(true)
      setError(null)
      const res = await window.api.tags.tagImplications.importCsv(text)
      if (!res.ok) throw new Error(res.error ?? 'Import failed')
      setLastResult({ inserted: res.inserted ?? 0, skipped: res.skipped ?? 0, errors: res.errors })
      showToast?.('success', `Imported ${res.inserted ?? 0} from clipboard (${res.skipped ?? 0} skipped)`)
    } catch (e: any) {
      setError(e?.message ?? String(e))
    } finally {
      setBusy(false)
    }
  }, [showToast])

  const state: ServiceState = error ? 'error' : busy ? 'starting' : lastResult ? 'running' : 'idle'

  return (
    <NetworkServiceCard
      Icon={GitBranch}
      title="Tag implications"
      description="Import Hydrus/Danbooru CSV tag-implication rules so the tagger auto-expands child tags with their parents (e.g. 'creampie' → also 'cum_in')."
      state={state}
      statusLabel={lastResult ? `+${lastResult.inserted}` : undefined}
      accent="from-amber-500 to-yellow-600"
      error={error}
    >
      <p className="text-[10px] text-[var(--muted)] leading-relaxed">
        CSV format: <code className="text-[10px]">child_tag,parent_tag</code> per line.
        Free Hydrus implication packs work directly.
      </p>

      <NetworkActionRow>
        <NetworkPrimaryBtn
          onClick={onPickFile}
          disabled={busy}
          accent="bg-amber-600/30 hover:bg-amber-600/40 text-amber-100"
        >
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
          {busy ? 'Importing…' : 'Pick CSV file'}
        </NetworkPrimaryBtn>
        <NetworkGhostBtn onClick={onPasteCsv} disabled={busy}>
          Paste from clipboard
        </NetworkGhostBtn>
      </NetworkActionRow>

      <AnimatePresence>
        {lastResult && (
          <motion.div
            {...FADE_SLIDE}
            className="rounded-2xl bg-emerald-500/10 border border-emerald-500/20 p-3 space-y-1"
          >
            <div className="flex items-center gap-2 text-xs">
              <Check size={12} className="text-emerald-400" />
              <span className="text-emerald-200 font-medium">Import complete</span>
            </div>
            <div className="text-[11px] text-emerald-100">
              <span className="tabular-nums">{lastResult.inserted}</span> inserted ·
              <span className="tabular-nums"> {lastResult.skipped}</span> skipped
              {lastResult.errors && lastResult.errors.length > 0 && (
                <span className="text-amber-200"> · {lastResult.errors.length} errors</span>
              )}
            </div>
            {lastResult.errors && lastResult.errors.length > 0 && (
              <details className="text-[10px] text-amber-200/80 pt-1">
                <summary className="cursor-pointer hover:text-amber-200">Show errors</summary>
                <ul className="mt-1 pl-3 space-y-0.5 max-h-20 overflow-y-auto font-mono">
                  {lastResult.errors.slice(0, 30).map((e, i) => (
                    <li key={i}>{e}</li>
                  ))}
                </ul>
              </details>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </NetworkServiceCard>
  )
}
