// File: src/renderer/components/QueueDashboardCard.tsx
//
// Unified queue dashboard (#259). One card showing every background
// pipeline at a glance: AI tagging queue, URL downloader queue, and
// transcode jobs. Polls each on a 2s tick so the user can drop in and
// see "what's vault busy with right now" without hunting across tabs.

import React, { useEffect, useState } from 'react'
import { Activity, Brain, Download, Loader2 } from 'lucide-react'
import { cn } from '../utils/cn'
import { useVisibilityInterval } from '../hooks/useVisibilityInterval'

interface AiQueueSnapshot {
  isRunning: boolean
  isPaused: boolean
  pending: number
  processing: number
  completed: number
  failed: number
}

interface DownloadSnapshot {
  total: number
  active: number
  done: number
  failed: number
}

export function QueueDashboardCard(): React.JSX.Element {
  const [ai, setAi] = useState<AiQueueSnapshot | null>(null)
  const [dl, setDl] = useState<DownloadSnapshot | null>(null)

  // Polled via useVisibilityInterval so the 2s tick pauses while this
  // tab is hidden — no point burning IPC chatter when no one's looking.
  // Cadence kept at 2s for the active case so progress bars feel live.
  useVisibilityInterval(async () => {
    try {
      const a: any = await (window.api as any).ai?.getQueueStatus?.()
      if (a) setAi({
        isRunning: !!a.isRunning,
        isPaused: !!a.isPaused,
        pending: a.pending ?? 0,
        processing: a.processing ?? 0,
        completed: a.completed ?? 0,
        failed: a.failed ?? 0,
      })
    } catch { /* swallow — keep prior snapshot */ }
    try {
      const items: any[] = (await (window.api as any).urlDownloader?.list?.()) ?? []
      const active = items.filter((i) => i.status === 'downloading' || i.status === 'queued').length
      const done = items.filter((i) => i.status === 'completed' || i.status === 'imported').length
      const failed = items.filter((i) => i.status === 'failed').length
      setDl({ total: items.length, active, done, failed })
    } catch { /* ignore — downloads tab may not be initialized */ }
  }, 2000)

  return (
    <div className="bg-[var(--panel)] rounded-xl border border-[var(--border)] p-6">
      <h2 className="text-lg font-semibold mb-2 flex items-center gap-2">
        <Activity size={20} />
        Queue dashboard
      </h2>
      <p className="text-sm text-[var(--muted)] mb-4">
        Every background pipeline in one place. Polls every 2s so a long
        AI re-tag or URL download is visible without leaving this tab.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* AI tagging queue */}
        <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3">
          <div className="flex items-center gap-2 mb-2">
            <Brain size={14} className="text-emerald-300" />
            <span className="text-sm font-medium text-emerald-300">AI tagging</span>
            {ai?.isRunning && (
              <span className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-emerald-500/20 border border-emerald-500/40">
                {ai.isPaused ? 'paused' : <><Loader2 size={9} className="animate-spin" /> running</>}
              </span>
            )}
          </div>
          {ai ? (
            <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] text-zinc-300">
              <div><span className="text-[var(--muted)]">Pending:</span> <span className="font-medium tabular-nums">{ai.pending}</span></div>
              <div><span className="text-[var(--muted)]">Active:</span> <span className="font-medium tabular-nums">{ai.processing}</span></div>
              <div><span className="text-[var(--muted)]">Done:</span> <span className="font-medium tabular-nums">{ai.completed}</span></div>
              <div className={cn(ai.failed > 0 && 'text-red-300')}><span className="text-[var(--muted)]">Failed:</span> <span className="font-medium tabular-nums">{ai.failed}</span></div>
            </div>
          ) : (
            <div className="text-[11px] text-[var(--muted)] italic">No data</div>
          )}
        </div>

        {/* URL downloader queue */}
        <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 p-3">
          <div className="flex items-center gap-2 mb-2">
            <Download size={14} className="text-blue-300" />
            <span className="text-sm font-medium text-blue-300">URL downloads</span>
            {dl && dl.active > 0 && (
              <span className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-blue-500/20 border border-blue-500/40">
                <Loader2 size={9} className="animate-spin" /> {dl.active}
              </span>
            )}
          </div>
          {dl ? (
            <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] text-zinc-300">
              <div><span className="text-[var(--muted)]">Total:</span> <span className="font-medium tabular-nums">{dl.total}</span></div>
              <div><span className="text-[var(--muted)]">Active:</span> <span className="font-medium tabular-nums">{dl.active}</span></div>
              <div><span className="text-[var(--muted)]">Done:</span> <span className="font-medium tabular-nums">{dl.done}</span></div>
              <div className={cn(dl.failed > 0 && 'text-red-300')}><span className="text-[var(--muted)]">Failed:</span> <span className="font-medium tabular-nums">{dl.failed}</span></div>
            </div>
          ) : (
            <div className="text-[11px] text-[var(--muted)] italic">No data</div>
          )}
        </div>
      </div>
    </div>
  )
}
