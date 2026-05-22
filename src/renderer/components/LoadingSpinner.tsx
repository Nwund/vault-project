// File: src/renderer/components/LoadingSpinner.tsx
//
// Shared loading spinner used across pages so the loading affordance is
// consistent. Previously every page picked its own combo of Loader2 /
// RefreshCw / custom border-spinner, which made the app feel uneven on
// route changes.

import { Loader2 } from 'lucide-react'
import { cn } from '../utils/cn'

export interface LoadingSpinnerProps {
  /** Optional label rendered below the spinner. */
  label?: string
  /** Pixel size of the spinner icon. Default 28. */
  size?: number
  /** When true, fills the parent and centers — use this in Suspense
   *  fallbacks and full-page loaders. */
  fullPage?: boolean
  /** Extra classes appended to the outer wrapper. */
  className?: string
}

export function LoadingSpinner({
  label,
  size = 28,
  fullPage = false,
  className,
}: LoadingSpinnerProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 text-[var(--muted)]',
        fullPage && 'h-full w-full',
        className,
      )}
    >
      <Loader2 size={size} className="animate-spin text-[var(--primary)]" />
      {label && <span className="text-xs">{label}</span>}
    </div>
  )
}
