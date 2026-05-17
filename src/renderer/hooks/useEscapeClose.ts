// File: src/renderer/hooks/useEscapeClose.ts
//
// Tiny shared hook used by every v2.7 modal so Escape closes them
// consistently. Filters out keypresses originating inside inputs +
// textareas so users editing fields don't accidentally close.
//
// Usage:
//   useEscapeClose(open, onClose)

import { useEffect } from 'react'

export function useEscapeClose(open: boolean, onClose: () => void): void {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      const tgt = e.target as Element | null
      if (tgt instanceof HTMLInputElement || tgt instanceof HTMLTextAreaElement) {
        // Let inputs handle their own escape (e.g., clear field). Most
        // browsers do nothing here; bail anyway so we don't fight them.
        return
      }
      e.preventDefault()
      onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])
}
