// File: src/renderer/components/ConfirmDialog.tsx
//
// Promise-based confirm dialog that matches the app's design language
// (ModalShell, motion-tokens). Replaces browser `confirm()` which
// breaks the app's visual language and is hard to style.
//
// Usage:
//   const yes = await confirm({ title: 'Delete?', body: '…', danger: true })
//   if (!yes) return
//
// Provider: <ConfirmProvider /> mounts once at the app root.

import React, { useState, useCallback, useEffect, useContext, useRef, createContext } from 'react'
import { AlertTriangle, Check, X } from 'lucide-react'
import { ModalShell } from './ModalShell'

interface ConfirmOptions {
  title: string
  body?: string
  confirmLabel?: string
  cancelLabel?: string
  /** Render the confirm button in red. */
  danger?: boolean
}

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>

const ConfirmContext = createContext<ConfirmFn | null>(null)

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  const [opts, setOpts] = useState<ConfirmOptions | null>(null)
  const resolveRef = useRef<((value: boolean) => void) | null>(null)

  const confirm = useCallback<ConfirmFn>((options) => {
    setOpts(options)
    setOpen(true)
    return new Promise<boolean>((resolve) => {
      resolveRef.current = resolve
    })
  }, [])

  const finish = useCallback((value: boolean) => {
    setOpen(false)
    // Resolve after the close animation; not strictly necessary but
    // gives caller time to react before the modal is fully gone.
    queueMicrotask(() => {
      resolveRef.current?.(value)
      resolveRef.current = null
      setOpts(null)
    })
  }, [])

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <ModalShell open={open} onClose={() => finish(false)} maxWidth="md" zIndex={9999} cardClassName="bg-zinc-900">
        {opts && (
          <div className="flex flex-col h-full">
            <div className={`px-5 py-4 flex items-center gap-3 border-b border-white/5 ${opts.danger ? 'bg-gradient-to-br from-red-500/15 to-transparent' : 'bg-gradient-to-br from-fuchsia-500/15 to-transparent'}`}>
              <div className={`size-9 rounded-2xl grid place-items-center shadow-lg shadow-black/40 ${opts.danger ? 'bg-gradient-to-br from-red-500 to-red-700' : 'bg-gradient-to-br from-fuchsia-500 to-pink-600'}`}>
                {opts.danger ? <AlertTriangle size={16} className="text-white" /> : <Check size={16} className="text-white" />}
              </div>
              <h2 className="text-base font-semibold flex-1">{opts.title}</h2>
              <button onClick={() => finish(false)} aria-label="Cancel" className="p-1.5 rounded-lg hover:bg-white/10 transition">
                <X size={16} />
              </button>
            </div>
            {opts.body && (
              <div className="px-5 py-4 text-sm text-[var(--muted)] leading-relaxed">
                {opts.body}
              </div>
            )}
            <div className="px-5 py-3 border-t border-white/5 bg-black/30 flex items-center justify-end gap-2">
              <button
                onClick={() => finish(false)}
                className="px-4 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-sm transition"
              >
                {opts.cancelLabel ?? 'Cancel'}
              </button>
              <button
                onClick={() => finish(true)}
                className={`px-4 py-1.5 rounded-lg text-white text-sm font-medium transition shadow-md ${opts.danger
                  ? 'bg-gradient-to-br from-red-600 to-red-700 hover:from-red-500 hover:to-red-600'
                  : 'bg-gradient-to-br from-fuchsia-600 to-pink-600 hover:from-fuchsia-500 hover:to-pink-500'}`}
              >
                {opts.confirmLabel ?? (opts.danger ? 'Delete' : 'Confirm')}
              </button>
            </div>
          </div>
        )}
      </ModalShell>
    </ConfirmContext.Provider>
  )
}

export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext)
  // If no provider, fall back to the browser dialog so consumers still
  // work in tests / standalone usage. Real app mounts ConfirmProvider.
  if (!ctx) {
    return async (options) => Promise.resolve(window.confirm(options.title + (options.body ? '\n\n' + options.body : '')))
  }
  return ctx
}
