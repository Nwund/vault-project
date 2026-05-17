'use memo'
// File: src/renderer/components/QualityAuditCard.tsx
//
// #324 — Quality auditor. Pick a video → ffprobe report + heuristic
// findings (low bitrate for resolution, mismatched audio/video codecs,
// chroma 4:2:2, etc.). UI surface for the `media.quality.audit` IPC
// bridge that had no consumer.

import { useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { Activity, Loader2, FileVideo, AlertTriangle, Info, CheckCircle2 } from 'lucide-react'
import { SPRINGS, FADE_SLIDE } from './network/motion-tokens'

interface QualityReport {
  ok: boolean
  durationSec: number
  width: number | null
  height: number | null
  videoCodec: string | null
  audioCodec: string | null
  videoBitrateKbps: number | null
  audioBitrateKbps: number | null
  audioSampleRate: number | null
  audioChannels: number | null
  container: string | null
  findings: Array<{ code: string; severity: 'info' | 'warn' | 'error'; message: string }>
}

export function QualityAuditCard({ onToast }: { onToast?: (type: 'success' | 'error' | 'info', msg: string) => void }) {
  const [report, setReport] = useState<QualityReport | null>(null)
  const [filePath, setFilePath] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [deep, setDeep] = useState(false)

  const onPick = useCallback(async () => {
    const picked = await window.api.dialogOpenFile({
      title: 'Pick video to audit',
      filters: [{ name: 'Video', extensions: ['mp4', 'mkv', 'webm', 'mov', 'avi', 'm4v', 'wmv'] }],
    })
    if (picked) setFilePath(picked)
  }, [])

  const onAudit = useCallback(async () => {
    if (!filePath) return
    setBusy(true)
    setError(null)
    try {
      const res = await window.api.tags.quality.audit({ videoPath: filePath, deep })
      if (!res.ok) throw new Error(res.error ?? 'Audit failed')
      setReport(res.report ?? null)
    } catch (e: any) {
      setError(e?.message ?? String(e))
      onToast?.('error', e?.message ?? 'Audit failed')
    } finally {
      setBusy(false)
    }
  }, [filePath, deep, onToast])

  return (
    <div className="rounded-2xl bg-black/30 border border-[var(--border)] p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Activity size={14} className="text-emerald-400" />
        <span className="text-sm font-semibold">Quality auditor</span>
      </div>
      <p className="text-[11px] text-[var(--muted)] leading-relaxed">
        ffprobe + heuristic findings (codec/bitrate/chroma/sample-rate audit).
      </p>

      <div className="flex gap-2 items-end">
        <button
          onClick={onPick}
          className="px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-xs flex items-center gap-1.5"
        >
          <FileVideo size={12} /> Pick video
        </button>
        <label className="flex items-center gap-1.5 text-[11px] text-[var(--muted)] cursor-pointer">
          <input
            type="checkbox"
            checked={deep}
            onChange={(e) => setDeep(e.target.checked)}
            className="accent-emerald-500"
          />
          Deep scan
        </label>
        <button
          onClick={onAudit}
          disabled={!filePath || busy}
          className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600/30 hover:bg-emerald-600/40 text-emerald-100 text-xs transition disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {busy ? <Loader2 size={12} className="animate-spin" /> : <Activity size={12} />}
          {busy ? 'Auditing…' : 'Audit'}
        </button>
      </div>

      {filePath && (
        <code className="block text-[10px] font-mono text-[var(--muted)] truncate" title={filePath}>
          {filePath}
        </code>
      )}

      <AnimatePresence>
        {error && (
          <motion.div {...FADE_SLIDE} className="text-[11px] text-red-300 px-2 py-1.5 rounded bg-red-500/10 border border-red-500/20">
            {error}
          </motion.div>
        )}
        {report && (
          <motion.div {...FADE_SLIDE} className="space-y-2">
            <div className="grid grid-cols-2 gap-2 text-[11px]">
              <Stat label="Resolution" value={report.width && report.height ? `${report.width}×${report.height}` : '—'} />
              <Stat label="Container" value={report.container ?? '—'} />
              <Stat label="Video codec" value={report.videoCodec ?? '—'} />
              <Stat label="Audio codec" value={report.audioCodec ?? '—'} />
              <Stat label="Video bitrate" value={report.videoBitrateKbps ? `${report.videoBitrateKbps.toFixed(0)} kbps` : '—'} />
              <Stat label="Audio bitrate" value={report.audioBitrateKbps ? `${report.audioBitrateKbps.toFixed(0)} kbps` : '—'} />
              <Stat label="Sample rate" value={report.audioSampleRate ? `${report.audioSampleRate / 1000} kHz` : '—'} />
              <Stat label="Channels" value={report.audioChannels?.toString() ?? '—'} />
            </div>
            {report.findings.length > 0 ? (
              <div className="space-y-1 max-h-48 overflow-y-auto pr-1">
                {report.findings.map((f, i) => (
                  <motion.div
                    key={i}
                    layout
                    transition={SPRINGS.snappy}
                    className={`flex items-start gap-1.5 p-1.5 rounded-lg text-[11px] ${
                      f.severity === 'error' ? 'bg-red-500/10 border border-red-500/20 text-red-200'
                      : f.severity === 'warn' ? 'bg-amber-500/10 border border-amber-500/20 text-amber-200'
                      : 'bg-white/[0.03] border border-white/5 text-zinc-300'
                    }`}
                  >
                    {f.severity === 'error' ? <AlertTriangle size={11} className="text-red-400 mt-0.5 flex-shrink-0" />
                    : f.severity === 'warn' ? <AlertTriangle size={11} className="text-amber-400 mt-0.5 flex-shrink-0" />
                    : <Info size={11} className="text-zinc-400 mt-0.5 flex-shrink-0" />}
                    <div className="flex-1">
                      <div className="font-medium">{f.code}</div>
                      <div className="text-[10px] opacity-80">{f.message}</div>
                    </div>
                  </motion.div>
                ))}
              </div>
            ) : (
              <div className="flex items-center gap-1.5 text-[11px] text-emerald-300 px-2 py-1.5 rounded bg-emerald-500/10 border border-emerald-500/20">
                <CheckCircle2 size={11} /> No issues found
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-2 py-1 rounded bg-white/[0.03]">
      <div className="text-[9px] uppercase tracking-wider text-[var(--muted)]">{label}</div>
      <div className="text-[11px] tabular-nums">{value}</div>
    </div>
  )
}
