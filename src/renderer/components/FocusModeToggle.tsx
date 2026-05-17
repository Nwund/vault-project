'use memo'
// File: src/renderer/components/FocusModeToggle.tsx
//
// Distraction-free "focus mode" for the Library. When active, sets a
// `data-focus-mode` attribute on documentElement and persists to
// localStorage so the chrome stays hidden across page swaps until
// the user toggles back. Esc exits.
//
// CSS hides matched chrome via `:root[data-focus-mode=on] ...`
// selectors — see index.css `/* v2.7 focus mode */` section.

import { useEffect, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { Focus, X } from 'lucide-react'
import { SPRINGS } from './network/motion-tokens'

const STORAGE_KEY = 'vault.focusMode'
const ATTR = 'data-focus-mode'

export function FocusModeToggle() {
  // Local mirror of the document attribute. Canonical writer is App.tsx
  // (which handles the global `vault:toggleFocusMode` event); we just
  // observe and re-render the button accordingly.
  const [active, setActive] = useState<boolean>(() => {
    try { return localStorage.getItem(STORAGE_KEY) === 'on' } catch { return false }
  })

  // Esc exits focus mode globally
  useEffect(() => {
    if (!active) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      const tgt = e.target as Element | null
      if (tgt instanceof HTMLInputElement || tgt instanceof HTMLTextAreaElement) return
      // Don't close focus mode if another z-index-stacked modal is open
      // (modals use z-[200]+). This is best-effort — if a modal traps Esc
      // itself, the toggle won't fire here.
      const hasModal = document.querySelector('[role="dialog"], [aria-modal="true"]')
      if (hasModal) return
      window.dispatchEvent(new CustomEvent('vault:toggleFocusMode'))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [active])

  // Button click dispatches the same global event the CommandPalette
  // uses. App.tsx owns the canonical toggle (document attribute +
  // localStorage); we just stay in sync by observing the attribute.
  const toggle = useCallback(() => {
    window.dispatchEvent(new CustomEvent('vault:toggleFocusMode'))
  }, [])

  // Sync our local `active` state with the document attribute so the
  // button reflects toggles fired from the CommandPalette/hotkeys.
  useEffect(() => {
    const sync = () => setActive(document.documentElement.getAttribute(ATTR) === 'on')
    sync()
    const mo = new MutationObserver(sync)
    mo.observe(document.documentElement, { attributes: true, attributeFilter: [ATTR] })
    return () => mo.disconnect()
  }, [])

  return (
    <>
      <button
        onClick={toggle}
        className={`flex items-center gap-1.5 px-2 py-1 rounded-md border transition ${
          active
            ? 'bg-violet-500/15 border-violet-500/40 text-violet-200'
            : 'bg-zinc-700/20 border-zinc-600/30 text-zinc-400 hover:text-white'
        }`}
        title={active ? 'Exit focus mode (Esc)' : 'Enter distraction-free focus mode'}
        aria-label="Toggle focus mode"
        aria-pressed={active}
      >
        <Focus size={11} />
        <span className="text-[10px] font-medium">{active ? 'Focused' : 'Focus'}</span>
      </button>

      {/* Floating exit pill — rendered to body via fixed positioning when
          focus mode is on, so the user always has a way out even after the
          TopBar is hidden by CSS. */}
      <AnimatePresence>
        {active && (
          <motion.button
            initial={{ opacity: 0, y: -8, scale: 0.92 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.92 }}
            transition={SPRINGS.standard}
            onClick={toggle}
            className="fixed top-3 right-3 z-[260] flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-zinc-950/90 backdrop-blur-md border border-violet-500/40 text-violet-200 text-[11px] font-medium shadow-2xl shadow-black/40 hover:bg-zinc-900"
            aria-label="Exit focus mode"
          >
            <X size={11} />
            Exit focus mode
            <kbd className="ml-1 px-1 py-px rounded bg-white/10 text-[9px] font-mono">Esc</kbd>
          </motion.button>
        )}
      </AnimatePresence>
    </>
  )
}
