// File: src/renderer/components/HardwareEncoderSettings.tsx
//
// Settings card for selecting hardware video encoders (NVENC / QSV / AMF).
// Extracted from App.tsx as part of #48. Self-contained — talks to
// window.api.encoder.* IPCs for detection + preference persistence.

import { useEffect, useState } from 'react'
import { Loader2, Zap, Cpu, Check, X } from 'lucide-react'
import { useToast } from '../contexts'
import { cn } from '../utils/cn'

export function HardwareEncoderSettings() {
  const { showToast } = useToast()
  const [encoders, setEncoders] = useState<Array<{
    id: string
    name: string
    available: boolean
    description: string
  }>>([])
  const [preferredEncoder, setPreferredEncoder] = useState<string>('libx264')
  const [detecting, setDetecting] = useState(false)
  const [hasDetected, setHasDetected] = useState(false)

  useEffect(() => {
    const loadEncoders = async () => {
      try {
        const list = await window.api.encoder?.getEncoders?.() ?? []
        if (list.length > 0) {
          setEncoders(list)
          setHasDetected(true)
        }
        const pref = await window.api.encoder?.getPreferred?.() ?? 'libx264'
        setPreferredEncoder(pref)
      } catch (err) {
        console.error('[HardwareEncoder] Failed to load encoders:', err)
      }
    }
    loadEncoders()
  }, [])

  const detectEncoders = async () => {
    setDetecting(true)
    try {
      const result = await window.api.encoder?.detect?.()
      if (result?.success && result.encoders) {
        setEncoders(result.encoders)
        setHasDetected(true)
        const available = result.encoders.filter((e: { available: boolean }) => e.available)
        if (available.length > 1) {
          showToast('success', `Found ${available.length} hardware encoders!`)
        } else {
          showToast('info', 'Only software encoder available')
        }
      } else {
        showToast('error', result?.error ?? 'Detection failed')
      }
    } catch (err: any) {
      showToast('error', err?.message ?? 'Failed to detect encoders')
    } finally {
      setDetecting(false)
    }
  }

  const setPreferred = async (encoderId: string) => {
    try {
      await window.api.encoder?.setPreferred?.(encoderId)
      setPreferredEncoder(encoderId)
      const encoder = encoders.find((e) => e.id === encoderId)
      showToast('success', `Encoder set to ${encoder?.name ?? encoderId}`)
    } catch {
      showToast('error', 'Failed to set encoder')
    }
  }

  return (
    <div className="rounded-3xl border border-[var(--border)] bg-black/20 p-5 mt-4">
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="text-sm font-semibold">Hardware Acceleration</div>
          <div className="text-xs text-[var(--muted)]">GPU-accelerated video encoding for faster transcoding</div>
        </div>
        <button
          onClick={detectEncoders}
          disabled={detecting}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[var(--primary)]/20 hover:bg-[var(--primary)]/30 text-[var(--primary)] text-xs font-medium transition disabled:opacity-50"
        >
          {detecting ? (
            <>
              <Loader2 size={14} className="animate-spin" />
              Detecting...
            </>
          ) : (
            <>
              <Zap size={14} />
              Detect GPUs
            </>
          )}
        </button>
      </div>

      {!hasDetected ? (
        <div className="text-center py-8 text-[var(--muted)]">
          <Cpu size={32} className="mx-auto mb-3 opacity-50" />
          <p className="text-sm">Click "Detect GPUs" to scan for hardware encoders</p>
          <p className="text-xs mt-1">Supports NVIDIA NVENC, Intel Quick Sync, AMD AMF</p>
        </div>
      ) : (
        <div className="space-y-3">
          {encoders.map((encoder) => (
            <div
              key={encoder.id}
              className={cn(
                'flex items-center justify-between p-3 rounded-xl border transition cursor-pointer',
                encoder.available
                  ? preferredEncoder === encoder.id
                    ? 'border-[var(--primary)] bg-[var(--primary)]/10'
                    : 'border-[var(--border)] hover:border-[var(--primary)]/50 hover:bg-white/5'
                  : 'border-[var(--border)] opacity-40 cursor-not-allowed',
              )}
              onClick={() => encoder.available && setPreferred(encoder.id)}
            >
              <div className="flex items-center gap-3">
                <div className={cn(
                  'w-8 h-8 rounded-lg flex items-center justify-center',
                  encoder.available ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400',
                )}>
                  {encoder.available ? <Check size={16} /> : <X size={16} />}
                </div>
                <div>
                  <div className="text-sm font-medium">{encoder.name}</div>
                  <div className="text-xs text-[var(--muted)]">{encoder.description}</div>
                </div>
              </div>
              {preferredEncoder === encoder.id && encoder.available && (
                <div className="px-2 py-1 rounded-full bg-[var(--primary)] text-[10px] font-medium">
                  Active
                </div>
              )}
            </div>
          ))}

          <div className="mt-4 pt-4 border-t border-[var(--border)]">
            <div className="text-xs text-[var(--muted)]">
              <strong>Tip:</strong> Hardware encoders (NVENC, QSV) are 3-10x faster than software encoding.
              If you have a compatible GPU, select it for faster video transcoding.
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
