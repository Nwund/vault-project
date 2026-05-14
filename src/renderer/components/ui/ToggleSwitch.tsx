// File: src/renderer/components/ui/ToggleSwitch.tsx
//
// Pill-style on/off switch. Extracted from App.tsx as part of #48 phase A.

import { cn } from '../../utils/cn'

export function ToggleSwitch({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  disabled?: boolean
}) {
  return (
    <button
      onClick={() => !disabled && onChange(!checked)}
      className={cn(
        'w-11 h-6 rounded-full transition-colors relative',
        checked ? 'bg-[var(--primary)]' : 'bg-white/20',
        disabled && 'opacity-50 cursor-not-allowed',
      )}
    >
      <div
        className={cn(
          'w-4 h-4 rounded-full bg-white absolute top-1 transition-transform',
          checked ? 'translate-x-6' : 'translate-x-1',
        )}
      />
    </button>
  )
}
