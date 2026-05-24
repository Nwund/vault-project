'use memo'
// File: src/renderer/components/network/VaultMlSidecarCard.tsx
//
// Status + control card for the Vault ML Python sidecar (Florence-2 /
// DINOv3 / MetaCLIP / SigLIP / Demucs / CodeFormer / MusicGen / Depth /
// BLIP captioner / Mel-RoFormer / etc.). Auto-starts via main.ts when
// configured; this card surfaces health + which models are loaded +
// individual unload buttons so you can free VRAM during heavy use.

import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { useVisibilityInterval } from '../../hooks/useVisibilityInterval'
import {
  Cpu,
  Loader2,
  Play,
  Square,
  Trash2,
  RefreshCw,
  HardDrive,
} from 'lucide-react'
import { useToast } from '../../contexts'
import {
  NetworkServiceCard,
  NetworkActionRow,
  NetworkPrimaryBtn,
  NetworkGhostBtn,
} from './NetworkServiceCard'
import { FADE_SLIDE, SPRINGS, type ServiceState } from './motion-tokens'

interface HealthInfo {
  status: string
  device: string
  dtype: string
  models_dir: string
  models_dir_exists: boolean
  loaded: string[]
  available_loaders: string[]
}

export function VaultMlSidecarCard() {
  const { showToast } = useToast()
  const [health, setHealth] = useState<HealthInfo | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      const res = await window.api.tags.vaultMl.health()
      if (res.ok) {
        setHealth(res.health)
        setError(null)
      } else {
        setHealth(null)
        if (res.error) setError(res.error)
      }
    } catch (e: any) {
      setHealth(null)
      setError(e?.message ?? String(e))
    }
  }, [])

  // 8s health-poll for the Python sidecar; paused while tab hidden.
  // The probe is an HTTP call to localhost so each tick costs IPC +
  // a network hop — worth gating on visibility.
  useVisibilityInterval(refresh, 8000)

  const state: ServiceState = error
    ? 'error'
    : busy
      ? 'starting'
      : health
        ? 'running'
        : 'idle'

  const onStart = useCallback(async () => {
    setBusy(true)
    try {
      const res = await window.api.tags.vaultMl.start()
      if (!res.ok) throw new Error(res.error ?? 'Start failed')
      showToast?.('success', 'ML sidecar started')
      // Health takes a moment to flip
      setTimeout(refresh, 1500)
    } catch (e: any) {
      setError(e?.message ?? String(e))
    } finally {
      setBusy(false)
    }
  }, [refresh, showToast])

  const onStop = useCallback(async () => {
    setBusy(true)
    try {
      await window.api.tags.vaultMl.stop()
      showToast?.('info', 'ML sidecar stopped')
      setTimeout(refresh, 800)
    } finally {
      setBusy(false)
    }
  }, [refresh, showToast])

  const onUnload = useCallback(async (modelId: string) => {
    await window.api.tags.vaultMl.unloadModel(modelId)
    refresh()
  }, [refresh])

  return (
    <NetworkServiceCard
      Icon={Cpu}
      title="Vault ML sidecar"
      description="Python FastAPI sidecar that hosts the heavy ML models (Florence-2 caption/OD, DINOv3 embed, SigLIP age, Demucs separation, CodeFormer face restore, MusicGen audio, Depth-Anything v2, BLIP captioner, more)."
      state={state}
      statusLabel={health ? `${health.device} · ${health.loaded.length} loaded` : undefined}
      accent="from-blue-500 to-violet-600"
      error={error}
    >
      <AnimatePresence>
        {health && (
          <motion.div {...FADE_SLIDE} className="grid grid-cols-2 gap-2 text-[11px]">
            <Stat label="Device" value={health.device.toUpperCase()} />
            <Stat label="DType" value={health.dtype} />
            <Stat label="Status" value={health.status} />
            <Stat label="Available loaders" value={String(health.available_loaders.length)} />
          </motion.div>
        )}
      </AnimatePresence>

      <NetworkActionRow>
        {!health ? (
          <NetworkPrimaryBtn
            onClick={onStart}
            disabled={busy}
            accent="bg-blue-600/30 hover:bg-blue-600/40 text-blue-100"
          >
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />} Start sidecar
          </NetworkPrimaryBtn>
        ) : (
          <NetworkPrimaryBtn
            onClick={onStop}
            disabled={busy}
            accent="bg-red-600/30 hover:bg-red-600/40 text-red-100"
          >
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Square size={14} />} Stop
          </NetworkPrimaryBtn>
        )}
        <NetworkGhostBtn onClick={refresh}>
          <RefreshCw size={14} />
        </NetworkGhostBtn>
      </NetworkActionRow>

      <AnimatePresence>
        {health && health.loaded.length > 0 && (
          <motion.div {...FADE_SLIDE} className="space-y-1">
            <div className="text-[10px] uppercase tracking-wider text-[var(--muted)]">
              Loaded models (click trash to unload + free VRAM)
            </div>
            <div className="space-y-1 max-h-40 overflow-y-auto pr-1">
              {health.loaded.map((id) => (
                <motion.div
                  key={id}
                  layout
                  transition={SPRINGS.snappy}
                  className="flex items-center gap-2 p-1.5 rounded-lg bg-white/[0.03] border border-white/5"
                >
                  <span className="size-2 rounded-full bg-blue-400 ring-1 ring-blue-400/50" />
                  <code className="text-[10px] font-mono text-zinc-200 flex-1 truncate">{id}</code>
                  <button
                    onClick={() => onUnload(id)}
                    className="text-[var(--muted)] hover:text-red-300 transition"
                    aria-label="Unload"
                  >
                    <Trash2 size={11} />
                  </button>
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {health && (
        <div className="flex items-center gap-1.5 text-[10px] text-[var(--muted)]">
          <HardDrive size={10} />
          <code className="font-mono truncate" title={health.models_dir}>
            {health.models_dir}
          </code>
          {!health.models_dir_exists && (
            <span className="text-amber-300 ml-1">(missing!)</span>
          )}
        </div>
      )}
    </NetworkServiceCard>
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
