// File: src/renderer/components/WelcomeModal.tsx
//
// First-run welcome modal (#284). Shows on the very first launch where
// the library is empty AND the user hasn't dismissed the welcome flag.
// Walks them through the three steps that unlock Vault: add a media
// folder, optionally pair the Venice API key, optionally install the
// drop-in ML detector models. Dismissable; never re-appears unless
// localStorage is cleared.

import React, { useCallback, useEffect, useState } from 'react'
import { Sparkles, Folder, Brain, Download } from 'lucide-react'

const FLAG = 'vault.welcome.dismissed.v1'

export function WelcomeModal(): React.JSX.Element | null {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      // Already dismissed? Don't even check the library.
      try { if (localStorage.getItem(FLAG) === '1') return } catch { /* ignore */ }
      // Library actually empty?
      try {
        const stats: any = await (window.api as any).vault?.getStats?.()
        if (cancelled) return
        if (stats && typeof stats.totalMedia === 'number' && stats.totalMedia === 0) {
          setVisible(true)
        }
      } catch { /* ignore — bail */ }
    })()
    return () => { cancelled = true }
  }, [])

  const dismiss = useCallback(() => {
    try { localStorage.setItem(FLAG, '1') } catch { /* ignore */ }
    setVisible(false)
  }, [])

  const openSettings = useCallback(() => {
    dismiss()
    window.dispatchEvent(new CustomEvent('navigate-tab', { detail: 'settings' }))
  }, [dismiss])

  const openAiTools = useCallback(() => {
    dismiss()
    window.dispatchEvent(new CustomEvent('navigate-tab', { detail: 'ai' }))
  }, [dismiss])

  if (!visible) return null

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={dismiss}>
      <div
        className="relative max-w-xl w-full rounded-3xl border border-[var(--primary)]/30 bg-gradient-to-br from-zinc-900 via-zinc-950 to-purple-950/40 p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3 mb-5">
          <div className="p-3 rounded-2xl bg-gradient-to-br from-[var(--primary)] to-pink-600 shadow-lg shadow-[var(--primary)]/40 shrink-0">
            <Sparkles size={24} className="text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-xl font-bold mb-1">Welcome to Vault</h2>
            <p className="text-sm text-[var(--muted)]">
              Your personal media library + AI tagging + Watch With Xyrene. Three quick steps to get going.
            </p>
          </div>
        </div>

        <div className="space-y-3">
          <button
            onClick={openSettings}
            className="w-full flex items-start gap-3 p-3 rounded-xl bg-zinc-800/50 hover:bg-zinc-800 border border-[var(--border)] hover:border-[var(--primary)]/40 transition text-left"
          >
            <div className="p-2 rounded-lg bg-blue-500/20 shrink-0">
              <Folder size={18} className="text-blue-300" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold mb-0.5">1. Add a media folder</div>
              <div className="text-xs text-[var(--muted)]">Settings → Library → Add folder. Vault scans + indexes everything inside.</div>
            </div>
          </button>

          <button
            onClick={openAiTools}
            className="w-full flex items-start gap-3 p-3 rounded-xl bg-zinc-800/50 hover:bg-zinc-800 border border-[var(--border)] hover:border-[var(--primary)]/40 transition text-left"
          >
            <div className="p-2 rounded-lg bg-amber-500/20 shrink-0">
              <Download size={18} className="text-amber-300" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold mb-0.5">2. Install drop-in detector models (optional)</div>
              <div className="text-xs text-[var(--muted)]">AI Tools → Setup → "Download all missing". Adds aesthetic scoring, deepfake detection, scene boundaries, etc. — all under 500 MB total.</div>
            </div>
          </button>

          <button
            onClick={openAiTools}
            className="w-full flex items-start gap-3 p-3 rounded-xl bg-zinc-800/50 hover:bg-zinc-800 border border-[var(--border)] hover:border-[var(--primary)]/40 transition text-left"
          >
            <div className="p-2 rounded-lg bg-fuchsia-500/20 shrink-0">
              <Brain size={18} className="text-fuchsia-300" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold mb-0.5">3. Pair a Venice API key (optional)</div>
              <div className="text-xs text-[var(--muted)]">AI Tools → Setup → Venice. Unlocks Tier 2 vision tagging (titles, descriptions, scene-aware tags). Auto-imports from <code className="bg-black/40 px-1 rounded">.api-keys.env</code> if present.</div>
            </div>
          </button>
        </div>

        <div className="mt-5 flex items-center justify-between">
          <div className="text-[10px] text-[var(--muted)]">You can revisit any of these from the sidebar later.</div>
          <button
            onClick={dismiss}
            className="px-4 py-2 rounded-lg bg-[var(--primary)] hover:opacity-90 text-white text-sm font-medium transition"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  )
}
