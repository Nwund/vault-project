// File: src/renderer/components/ui/TopBar.tsx
//
// Page-header bar with title + right-aligned actions + optional sub-row.
// Extracted from App.tsx as part of #48 phase A.

import React from 'react'

export function TopBar(props: {
  title: string
  /** Optional small subtitle rendered next to the title (e.g. "12,345 items · 2.3 TB"). */
  subtitle?: React.ReactNode
  right?: React.ReactNode
  children?: React.ReactNode
}) {
  return (
    <div className="px-3 sm:px-6 py-3 sm:py-5 border-b border-[var(--border)] bg-[var(--panel)]">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-baseline gap-3 min-w-0">
          <div className="text-sm sm:text-lg font-semibold shrink-0">{props.title}</div>
          {props.subtitle ? (
            <div className="text-[11px] text-[var(--muted)] truncate tabular-nums">{props.subtitle}</div>
          ) : null}
        </div>
        <div className="flex items-center gap-1 sm:gap-2 flex-wrap justify-end">{props.right}</div>
      </div>
      {props.children ? <div className="mt-2 sm:mt-4">{props.children}</div> : null}
    </div>
  )
}
