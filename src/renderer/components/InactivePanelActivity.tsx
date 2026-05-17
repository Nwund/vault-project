// File: src/renderer/components/InactivePanelActivity.tsx
//
// #335 F-111 — React 19.2 <Activity hidden> for inactive browse panels.
// Browse aggregates 27 sources, each with its own tile feed; only one
// is in the foreground at a time. The Activity primitive keeps an
// inactive panel mounted (so state survives) but skips reconciliation
// and painting until it's promoted back.
//
// React 19.2's Activity isn't yet in the publicly-stable types as of
// 2026-05 — we import via the experimental entrypoint and fall back
// to a regular display:none wrapper.

import * as React from 'react'

const ReactExperimental = React as unknown as { Activity?: React.ComponentType<{ mode: 'visible' | 'hidden'; children: React.ReactNode }> }

export function InactivePanelActivity({ active, children }: { active: boolean; children: React.ReactNode }) {
  if (ReactExperimental.Activity) {
    const Activity = ReactExperimental.Activity
    return <Activity mode={active ? 'visible' : 'hidden'}>{children}</Activity>
  }
  // Fallback: display:none keeps the DOM but doesn't skip React work.
  return (
    <div style={{ display: active ? 'contents' : 'none' }}>
      {children}
    </div>
  )
}
