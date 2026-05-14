// File: src/renderer/components/ui/Btn.tsx
//
// Tonal button wrapper. Extracted from App.tsx as part of #48 phase A.

import React from 'react'
import { cn } from '../../utils/cn'

export function Btn(
  props: React.ButtonHTMLAttributes<HTMLButtonElement> & { tone?: 'primary' | 'ghost' | 'danger' | 'subtle' },
) {
  const tone = props.tone ?? 'ghost'
  const cls =
    tone === 'primary'
      ? 'bg-[var(--primary)]/20 hover:bg-[var(--primary)]/30 border-[var(--primary)]/30'
      : tone === 'danger'
        ? 'bg-red-500/10 hover:bg-red-500/15 border-red-500/20'
        : tone === 'subtle'
          ? 'bg-white/5 hover:bg-white/10 border-white/10'
          : 'bg-black/20 hover:bg-white/5 border-[var(--border)] hover:border-white/15'
  const { className, tone: _tone, ...rest } = props
  return (
    <button
      {...rest}
      className={cn(
        'px-3 py-2 rounded-xl text-xs border transition disabled:opacity-50 disabled:cursor-not-allowed focus-visible:ring-2 focus-visible:ring-[var(--primary)] focus-visible:ring-offset-1 active:scale-95',
        cls,
        className,
      )}
    />
  )
}
