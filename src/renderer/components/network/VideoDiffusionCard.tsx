'use memo'
// File: src/renderer/components/network/VideoDiffusionCard.tsx
//
// #377 — Video diffusion bridge. The main process exposes a generic
// "talk to an external ComfyUI / WAN / Hunyuan / CogVideoX HTTP API" bridge;
// this card configures the endpoint, probes for available models, and
// fires off prompt→video generations with live progress.
//
// Sits in the same Services tab as the other v2.7 network cards.

import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { Film, Loader2, Sparkles, Plug, RefreshCw } from 'lucide-react'
import { useToast } from '../../contexts'
import {
  NetworkServiceCard,
  NetworkActionRow,
  NetworkPrimaryBtn,
  NetworkGhostBtn,
} from './NetworkServiceCard'
import { FADE_SLIDE, SPRINGS, type ServiceState } from './motion-tokens'

export function VideoDiffusionCard() {
  const { showToast } = useToast()
  const [endpoint, setEndpoint] = useState('http://127.0.0.1:8188')
  const [models, setModels] = useState<string[] | null>(null)
  const [reachable, setReachable] = useState<boolean | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [prompt, setPrompt] = useState('a slow zoom out from a neon-lit alley at night')
  const [selectedModel, setSelectedModel] = useState<string | null>(null)
  const [importDir, setImportDir] = useState('')
  const [progress, setProgress] = useState<number | null>(null)
  const [lastMediaId, setLastMediaId] = useState<string | null>(null)

  // Listen for progress
  useEffect(() => {
    const cleanup = window.api.videoDiff?.onProgress?.((p: { progress: number }) => {
      setProgress(p.progress)
      if (p.progress >= 1) setTimeout(() => setProgress(null), 1500)
    })
    return cleanup
  }, [])

  const state: ServiceState = error
    ? 'error'
    : busy
      ? 'starting'
      : reachable
        ? 'running'
        : 'idle'

  const onSetEndpoint = useCallback(async () => {
    setBusy(true)
    setError(null)
    try {
      await window.api.videoDiff.setEndpoint(endpoint)
      showToast?.('success', 'Endpoint saved')
    } finally {
      setBusy(false)
    }
  }, [endpoint, showToast])

  const onProbe = useCallback(async () => {
    setBusy(true)
    setError(null)
    try {
      const res = await window.api.videoDiff.probe()
      setReachable(res.reachable)
      setModels(res.models ?? [])
      if (res.models?.length && !selectedModel) setSelectedModel(res.models[0])
      if (res.error) setError(res.error)
      else if (res.reachable) showToast?.('success', `Reachable · ${res.models?.length ?? 0} model${res.models?.length === 1 ? '' : 's'}`)
    } catch (e: any) {
      setError(e?.message ?? String(e))
    } finally {
      setBusy(false)
    }
  }, [selectedModel, showToast])

  const onPickImportDir = useCallback(async () => {
    const folder = await window.api.dialogOpenFolder({ title: 'Pick import folder for generated clips' })
    if (folder) setImportDir(folder)
  }, [])

  const onGenerate = useCallback(async () => {
    if (!prompt.trim() || !importDir) {
      setError(!prompt.trim() ? 'Prompt required' : 'Import folder required')
      return
    }
    setBusy(true)
    setError(null)
    setProgress(0)
    try {
      const res = await window.api.videoDiff.generate({ prompt, model: selectedModel }, importDir)
      if (!res.ok) throw new Error(res.error ?? 'Generation failed')
      setLastMediaId(res.mediaId ?? null)
      showToast?.('success', `Generated · imported as ${res.mediaId?.slice(0, 8)}…`)
    } catch (e: any) {
      setError(e?.message ?? String(e))
      setProgress(null)
    } finally {
      setBusy(false)
    }
  }, [prompt, importDir, selectedModel, showToast])

  return (
    <NetworkServiceCard
      Icon={Film}
      title="Video diffusion bridge"
      description="Connect to an external ComfyUI / WAN / Hunyuan / CogVideoX HTTP endpoint. Prompts generate clips that auto-import into the library."
      state={state}
      statusLabel={reachable ? `${models?.length ?? 0} models` : undefined}
      accent="from-pink-500 to-rose-600"
      error={error}
    >
      <label className="space-y-1 block">
        <span className="text-[10px] uppercase tracking-wider text-[var(--muted)]">Endpoint URL</span>
        <input
          value={endpoint}
          onChange={(e) => setEndpoint(e.target.value)}
          placeholder="http://127.0.0.1:8188"
          className="w-full px-2 py-1.5 rounded-lg bg-black/30 border border-white/10 text-xs font-mono outline-none focus:border-[var(--primary)]/50"
        />
      </label>

      <NetworkActionRow>
        <NetworkPrimaryBtn
          onClick={onSetEndpoint}
          disabled={busy}
          accent="bg-pink-600/30 hover:bg-pink-600/40 text-pink-100"
        >
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Plug size={14} />} Save
        </NetworkPrimaryBtn>
        <NetworkGhostBtn onClick={onProbe} disabled={busy}>
          {busy ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} Probe
        </NetworkGhostBtn>
      </NetworkActionRow>

      <AnimatePresence>
        {models && models.length > 0 && (
          <motion.div {...FADE_SLIDE} className="space-y-2">
            <div className="grid grid-cols-[1fr_auto] gap-2 items-end">
              <label className="space-y-1">
                <span className="text-[10px] uppercase tracking-wider text-[var(--muted)]">Model</span>
                <select
                  value={selectedModel ?? ''}
                  onChange={(e) => setSelectedModel(e.target.value)}
                  className="w-full px-2 py-1.5 rounded-lg bg-black/30 border border-white/10 text-xs outline-none focus:border-[var(--primary)]/50"
                >
                  {models.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </label>
              <button
                onClick={onPickImportDir}
                className="px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-xs flex items-center gap-1.5 self-end h-[30px]"
              >
                Import dir
              </button>
            </div>
            {importDir && (
              <code className="block text-[10px] font-mono text-[var(--muted)] truncate">
                → {importDir}
              </code>
            )}

            <label className="space-y-1 block">
              <span className="text-[10px] uppercase tracking-wider text-[var(--muted)]">Prompt</span>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                rows={2}
                className="w-full px-2 py-1.5 rounded-lg bg-black/30 border border-white/10 text-xs outline-none focus:border-[var(--primary)]/50 resize-none"
              />
            </label>

            <NetworkActionRow>
              <NetworkPrimaryBtn
                onClick={onGenerate}
                disabled={busy || !prompt.trim() || !importDir}
                accent="bg-rose-600/30 hover:bg-rose-600/40 text-rose-100"
              >
                {busy ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                {busy ? 'Generating…' : 'Generate clip'}
              </NetworkPrimaryBtn>
            </NetworkActionRow>

            {progress != null && (
              <motion.div {...FADE_SLIDE} className="space-y-1">
                <div className="flex items-center justify-between text-[10px] text-pink-300">
                  <span>Progress</span>
                  <span className="tabular-nums">{Math.round(progress * 100)}%</span>
                </div>
                <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
                  <motion.div
                    className="h-full bg-gradient-to-r from-pink-500 to-rose-400"
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.min(100, progress * 100)}%` }}
                    transition={SPRINGS.soft}
                  />
                </div>
              </motion.div>
            )}

            {lastMediaId && !busy && (
              <div className="text-[10px] text-emerald-300">
                Last clip → mediaId <code className="font-mono">{lastMediaId}</code>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </NetworkServiceCard>
  )
}
