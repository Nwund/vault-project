// File: src/renderer/components/LibraryHealthPanel.tsx
//
// Actionable Library Health dashboard. Same advancedStats:getHealth
// backend as the Stats tab's read-only summary, but every issue gets
// a one-click Fix button that wires straight to the relevant IPC.
//
// Issues currently surfaced:
//   - missing_thumbs   → Rebuild Missing (thumbs:rebuildMissing)
//   - untagged         → Open AI Tagger (in-app navigation hint)
//   - duplicates       → Open Duplicates Modal (delegates via callback)
//   - broken_paths     → Auto-scan to detect (scanner:full)
//
// Lives behind Library Tools → Library Health. The Stats tab keeps its
// passive summary; this panel is the action layer.

import { useEffect, useState, useCallback } from 'react'
import {
  Activity, AlertTriangle, CheckCircle, Loader2, X,
  Image as ImageIcon, Tag, Copy, FolderSearch, RefreshCw,
} from 'lucide-react'

interface HealthIssue {
  type: string
  count: number
  severity: 'low' | 'medium' | 'high'
  description: string
}

interface HealthData {
  score: number
  issues: HealthIssue[]
  recommendations: string[]
}

interface Props {
  isOpen: boolean
  onClose: () => void
  /** Caller supplies handlers for in-app navigation actions. */
  onOpenDuplicates?: () => void
  onOpenAiTagger?: () => void
  showToast?: (kind: 'success' | 'error' | 'info', msg: string) => void
}

const ISSUE_META: Record<string, { icon: any; label: string; action?: string }> = {
  missing_thumbs: { icon: ImageIcon, label: 'Missing thumbnails', action: 'Rebuild' },
  untagged: { icon: Tag, label: 'Untagged media', action: 'Open AI Tagger' },
  duplicates: { icon: Copy, label: 'Duplicate groups', action: 'Open Duplicates' },
  broken_paths: { icon: FolderSearch, label: 'Broken file paths', action: 'Re-scan' },
}

export function LibraryHealthPanel({
  isOpen,
  onClose,
  onOpenDuplicates,
  onOpenAiTagger,
  showToast,
}: Props) {
  const [data, setData] = useState<HealthData | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    setData(null)
    try {
      const r = await window.api.invoke('advancedStats:getHealth') as HealthData
      setData(r)
    } catch (err: any) {
      showToast?.('error', err?.message ?? 'Failed to load library health')
      setData({ score: 0, issues: [], recommendations: [] })
    }
  }, [showToast])

  useEffect(() => {
    if (isOpen) void load()
  }, [isOpen, load])

  const runFix = async (issueType: string) => {
    setBusy(issueType)
    try {
      switch (issueType) {
        case 'missing_thumbs': {
          const r = await window.api.invoke('thumbs:rebuildMissing') as any
          const built = r?.built ?? r?.count ?? 0
          showToast?.('success', `Rebuilt ${built} thumbnail${built === 1 ? '' : 's'}`)
          await load()
          break
        }
        case 'untagged': {
          onOpenAiTagger?.()
          onClose()
          break
        }
        case 'duplicates': {
          onOpenDuplicates?.()
          onClose()
          break
        }
        case 'broken_paths': {
          // Trigger a full re-scan to detect missing files
          await window.api.invoke('scanner:full')
          showToast?.('success', 'Library re-scan started')
          break
        }
        default:
          showToast?.('info', `No automated fix for "${issueType}" yet`)
      }
    } catch (err: any) {
      showToast?.('error', err?.message ?? `Fix failed for ${issueType}`)
    } finally {
      setBusy(null)
    }
  }

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-[var(--panel)] rounded-xl border border-[var(--border)] max-w-2xl w-full max-h-[85vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Activity size={20} className="text-[var(--primary)]" />
            <div>
              <h3 className="font-semibold">Library Health</h3>
              <p className="text-[11px] text-[var(--muted)]">
                Detected issues + one-click fixes for library rot.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => void load()}
              className="text-[11px] px-2 py-1 rounded bg-white/5 hover:bg-white/10 text-[var(--primary)] transition flex items-center gap-1"
              title="Re-check health"
            >
              <RefreshCw size={11} />
              Re-check
            </button>
            <button onClick={onClose} className="p-1.5 rounded hover:bg-white/10">
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4">
          {!data && (
            <div className="flex items-center justify-center p-8 text-[var(--muted)] text-sm">
              <Loader2 size={16} className="animate-spin mr-2" /> Probing library…
            </div>
          )}
          {data && (
            <>
              {/* Score circle + summary */}
              <div className="flex items-center gap-6 p-4 bg-white/[0.03] rounded-lg mb-4">
                <div className="relative w-24 h-24 flex-shrink-0">
                  <svg className="w-full h-full transform -rotate-90" viewBox="0 0 96 96">
                    <circle cx="48" cy="48" r="40" fill="none" stroke="currentColor" strokeWidth="8" className="text-white/10" />
                    <circle
                      cx="48" cy="48" r="40" fill="none" stroke="currentColor" strokeWidth="8"
                      strokeDasharray={`${(data.score / 100) * 251.2} 251.2`}
                      className={
                        data.score >= 80 ? 'text-emerald-500'
                          : data.score >= 60 ? 'text-amber-500'
                            : 'text-red-500'
                      }
                    />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-2xl font-bold">{data.score}</span>
                  </div>
                </div>
                <div className="flex-1">
                  <div className="text-sm font-medium">
                    {data.score >= 80 ? 'Healthy' : data.score >= 60 ? 'Needs attention' : 'Critical'}
                  </div>
                  <div className="text-[11px] text-[var(--muted)] mt-0.5">
                    {data.issues.length === 0
                      ? 'No issues detected.'
                      : `${data.issues.length} issue${data.issues.length === 1 ? '' : 's'} detected.`}
                  </div>
                </div>
              </div>

              {/* Issues list with action buttons */}
              {data.issues.length === 0 ? (
                <div className="p-8 text-center">
                  <CheckCircle size={32} className="text-emerald-400 mx-auto mb-2" />
                  <p className="text-sm">Your library is in great shape.</p>
                  <p className="text-[11px] text-[var(--muted)] mt-1">Re-run periodically as the library grows.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {data.issues.map((issue, i) => {
                    const meta = ISSUE_META[issue.type] ?? { icon: AlertTriangle, label: issue.type, action: undefined }
                    const Icon = meta.icon
                    const sevColor = issue.severity === 'high' ? 'text-red-400'
                      : issue.severity === 'medium' ? 'text-amber-400'
                        : 'text-zinc-400'
                    return (
                      <div key={i} className="flex items-center gap-3 p-3 bg-white/[0.03] rounded-lg">
                        <Icon size={18} className={sevColor + ' flex-shrink-0'} />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm">{meta.label}</div>
                          <div className="text-[11px] text-[var(--muted)] mt-0.5">{issue.description}</div>
                        </div>
                        {meta.action && (
                          <button
                            disabled={busy === issue.type}
                            onClick={() => runFix(issue.type)}
                            className="text-[11px] px-3 py-1.5 rounded bg-[var(--primary)] hover:opacity-90 text-white transition flex items-center gap-1 flex-shrink-0 disabled:opacity-50"
                          >
                            {busy === issue.type ? <Loader2 size={11} className="animate-spin" /> : null}
                            {meta.action}
                          </button>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}

              {/* Recommendations */}
              {data.recommendations.length > 0 && (
                <div className="mt-4 p-3 bg-white/[0.02] rounded-lg">
                  <div className="text-[11px] font-medium text-[var(--muted)] mb-1.5">Recommendations</div>
                  <ul className="space-y-1">
                    {data.recommendations.map((rec, i) => (
                      <li key={i} className="text-[11px] text-[var(--muted)] flex items-start gap-1.5">
                        <span className="text-[var(--primary)] mt-0.5">•</span>
                        <span>{rec}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
