'use memo'
// File: src/renderer/components/network/AudioEroticaCard.tsx
//
// #367 H-143 — Audio-erotica importer. Drop in an LRC / VTT / bracketed
// transcript and convert it to a Vault JOI script (so the Sessions/Coach
// tab's JOI player can read it). UI surface for `tags.audioErotica.*`.

import { useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { Mic2, Loader2, FileText, Wand2, Copy, Check } from 'lucide-react'
import { useToast } from '../../contexts'
import {
  NetworkServiceCard,
  NetworkActionRow,
  NetworkPrimaryBtn,
  NetworkGhostBtn,
} from './NetworkServiceCard'
import { FADE_SLIDE, SPRINGS, type ServiceState } from './motion-tokens'

interface ImportResult {
  format?: 'lrc' | 'vtt' | 'bracketed' | 'unknown'
  title?: string
  performer?: string
  durationSec?: number
  cues: Array<{ timeSec: number; text: string }>
}

export function AudioEroticaCard() {
  const { showToast } = useToast()
  const [imported, setImported] = useState<ImportResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [voice, setVoice] = useState('xyrene')
  const [joiScript, setJoiScript] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [pasteText, setPasteText] = useState('')

  const state: ServiceState = error ? 'error' : busy ? 'starting' : imported ? 'running' : 'idle'

  const onImportFile = useCallback(async () => {
    const filePath = await window.api.dialogOpenFile({
      title: 'Pick LRC / VTT / bracketed transcript',
      filters: [{ name: 'Transcript', extensions: ['lrc', 'vtt', 'srt', 'txt'] }],
    })
    if (!filePath) return
    setBusy(true)
    setError(null)
    try {
      const res = await window.api.tags.audioErotica.importFile(filePath)
      if (!res.ok) throw new Error(res.error ?? 'Import failed')
      setImported({
        format: res.format,
        title: res.title,
        performer: res.performer,
        durationSec: res.durationSec,
        cues: res.cues ?? [],
      })
      setJoiScript(null)
      showToast?.('success', `Imported ${(res.cues ?? []).length} cues (${res.format ?? '?'})`)
    } catch (e: any) {
      setError(e?.message ?? String(e))
    } finally {
      setBusy(false)
    }
  }, [showToast])

  const onImportPaste = useCallback(async () => {
    if (!pasteText.trim()) return
    setBusy(true)
    setError(null)
    try {
      const res = await window.api.tags.audioErotica.importText(pasteText)
      if (!res.ok) throw new Error(res.error ?? 'Import failed')
      setImported({
        format: res.format,
        title: res.title,
        performer: res.performer,
        durationSec: res.durationSec,
        cues: res.cues ?? [],
      })
      setJoiScript(null)
      showToast?.('success', `Parsed ${(res.cues ?? []).length} cues from text`)
    } catch (e: any) {
      setError(e?.message ?? String(e))
    } finally {
      setBusy(false)
    }
  }, [pasteText, showToast])

  const onToJoi = useCallback(async () => {
    if (!imported) return
    setBusy(true)
    setError(null)
    try {
      const res = await window.api.tags.audioErotica.toJoiScript({
        imp: imported,
        voice,
      })
      if (!res.ok || !res.script) throw new Error(res.error ?? 'Conversion failed')
      setJoiScript(res.script)
      showToast?.('success', 'JOI script ready (copy to use)')
    } catch (e: any) {
      setError(e?.message ?? String(e))
    } finally {
      setBusy(false)
    }
  }, [imported, voice, showToast])

  const onCopy = useCallback(() => {
    if (!joiScript) return
    navigator.clipboard.writeText(joiScript).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1400)
    })
  }, [joiScript])

  return (
    <NetworkServiceCard
      Icon={Mic2}
      title="Audio-erotica importer"
      description="Drop a LRC karaoke / VTT subtitle / bracketed transcript → convert to a Vault JOI script readable by Sessions → Coach view's JOI player."
      state={state}
      statusLabel={imported ? `${imported.cues.length} cues` : undefined}
      accent="from-pink-500 to-rose-500"
      error={error}
    >
      <NetworkActionRow>
        <NetworkPrimaryBtn
          onClick={onImportFile}
          disabled={busy}
          accent="bg-pink-600/30 hover:bg-pink-600/40 text-pink-100"
        >
          {busy ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />}
          Pick file
        </NetworkPrimaryBtn>
      </NetworkActionRow>

      <details className="text-[11px]">
        <summary className="cursor-pointer text-pink-300/80 hover:text-pink-200">
          …or paste raw text
        </summary>
        <div className="mt-2 space-y-2">
          <textarea
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            rows={4}
            placeholder="[00:12.40] Stroke faster&#10;[00:14.20] Don't stop"
            className="w-full px-2 py-1.5 rounded-lg bg-black/30 border border-white/10 text-xs font-mono outline-none focus:border-[var(--primary)]/50 resize-none"
          />
          <NetworkGhostBtn onClick={onImportPaste} disabled={busy || !pasteText.trim()}>
            Parse text
          </NetworkGhostBtn>
        </div>
      </details>

      <AnimatePresence>
        {imported && (
          <motion.div {...FADE_SLIDE} className="space-y-2">
            <div className="rounded-lg bg-pink-500/5 border border-pink-500/20 p-2 text-[11px] space-y-0.5">
              {imported.title && (
                <div><span className="text-pink-300">Title</span> · {imported.title}</div>
              )}
              {imported.performer && (
                <div><span className="text-pink-300">Performer</span> · {imported.performer}</div>
              )}
              {imported.durationSec != null && (
                <div className="tabular-nums"><span className="text-pink-300">Duration</span> · {imported.durationSec.toFixed(1)}s</div>
              )}
              <div><span className="text-pink-300">Format</span> · {imported.format ?? 'unknown'}</div>
            </div>

            {/* Preview first 6 cues */}
            <div className="space-y-0.5 max-h-32 overflow-y-auto pr-1">
              {imported.cues.slice(0, 6).map((c, i) => (
                <motion.div
                  key={i}
                  layout
                  transition={SPRINGS.snappy}
                  className="flex items-start gap-2 text-[10px] p-1 rounded bg-white/[0.03]"
                >
                  <span className="text-pink-300 tabular-nums w-12 flex-shrink-0">
                    {c.timeSec.toFixed(1)}s
                  </span>
                  <span className="text-zinc-300 line-clamp-1">{c.text}</span>
                </motion.div>
              ))}
              {imported.cues.length > 6 && (
                <div className="text-[10px] text-[var(--muted)] px-1 italic">
                  + {imported.cues.length - 6} more
                </div>
              )}
            </div>

            <div className="flex gap-2 items-end">
              <label className="space-y-1 flex-1">
                <span className="text-[10px] uppercase tracking-wider text-[var(--muted)]">XTTS voice</span>
                <input
                  value={voice}
                  onChange={(e) => setVoice(e.target.value)}
                  placeholder="xyrene"
                  className="w-full px-2 py-1.5 rounded-lg bg-black/30 border border-white/10 text-xs font-mono outline-none focus:border-[var(--primary)]/50"
                />
              </label>
              <NetworkPrimaryBtn
                onClick={onToJoi}
                disabled={busy}
                accent="bg-rose-600/30 hover:bg-rose-600/40 text-rose-100"
              >
                <Wand2 size={14} /> Convert to JOI
              </NetworkPrimaryBtn>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {joiScript && (
          <motion.div {...FADE_SLIDE} className="rounded-2xl bg-emerald-500/10 border border-emerald-500/20 p-3 space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase tracking-wider text-emerald-300">JOI script</span>
              <button
                onClick={onCopy}
                className="text-[11px] flex items-center gap-1.5 px-2 py-0.5 rounded bg-white/5 hover:bg-white/10 transition"
              >
                {copied ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} />}
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
            <pre className="text-[10px] font-mono text-emerald-100 max-h-32 overflow-y-auto whitespace-pre-wrap leading-snug">
              {joiScript.slice(0, 800)}
              {joiScript.length > 800 ? '\n…' : ''}
            </pre>
          </motion.div>
        )}
      </AnimatePresence>
    </NetworkServiceCard>
  )
}
