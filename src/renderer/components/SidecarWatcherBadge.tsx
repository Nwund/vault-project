'use memo'
// File: src/renderer/components/SidecarWatcherBadge.tsx
//
// Small status pill that lives in the LibraryPage TopBar. Calls
// `window.api.sidecarWatcher.status()` periodically; when running,
// shows "Watching N roots" with a pulsing dot. Clicking the pill
// opens a popover for start/stop/add-root.

import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { Eye, Plus, Square, Folder, Loader2 } from 'lucide-react'
import { useToast } from '../contexts'
import { SPRINGS, FADE_SLIDE } from './network/motion-tokens'
import { useVisibilityInterval } from '../hooks/useVisibilityInterval'

export function SidecarWatcherBadge() {
  const { showToast } = useToast()
  const [status, setStatus] = useState<{ running: boolean; roots: string[] }>({ running: false, roots: [] })
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const popoverRef = useRef<HTMLDivElement>(null)

  const refresh = useCallback(async () => {
    try {
      const s = await window.api.sidecarWatcher.status()
      setStatus(s)
    } catch {
      /* sidecar watcher not yet initialized */
    }
  }, [])

  // 5s sidecar-status polling, paused while tab is hidden.
  useVisibilityInterval(refresh, 5000)

  // Close popover on outside click
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    window.addEventListener('mousedown', onDown)
    return () => window.removeEventListener('mousedown', onDown)
  }, [open])

  const onStart = useCallback(async () => {
    setBusy(true)
    try {
      const roots = status.roots
      if (roots.length === 0) {
        const picked = await window.api.dialogOpenFolder({ title: 'Pick library root to watch' })
        if (!picked) { setBusy(false); return }
        const res = await window.api.sidecarWatcher.start([picked])
        if (res.ok) {
          showToast('success', `Watching ${picked}`)
          refresh()
        }
      } else {
        const res = await window.api.sidecarWatcher.start(roots)
        if (res.ok) {
          showToast('success', `Watching ${roots.length} root${roots.length === 1 ? '' : 's'}`)
          refresh()
        }
      }
    } finally {
      setBusy(false)
    }
  }, [status.roots, refresh, showToast])

  const onStop = useCallback(async () => {
    setBusy(true)
    try {
      await window.api.sidecarWatcher.stop()
      refresh()
      showToast('info', 'Sidecar watcher stopped')
    } finally {
      setBusy(false)
    }
  }, [refresh, showToast])

  const onAddRoot = useCallback(async () => {
    const picked = await window.api.dialogOpenFolder({ title: 'Add root to watch' })
    if (!picked) return
    setBusy(true)
    try {
      await window.api.sidecarWatcher.addRoot(picked)
      refresh()
    } finally {
      setBusy(false)
    }
  }, [refresh])

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-1.5 px-2 py-1 rounded-md border transition ${
          status.running
            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200 hover:bg-emerald-500/15'
            : 'bg-zinc-700/20 border-zinc-600/30 text-zinc-400 hover:text-white'
        }`}
        title={status.running ? `Sidecar watcher · ${status.roots.length} root${status.roots.length === 1 ? '' : 's'}` : 'Sidecar watcher idle'}
      >
        <Eye size={11} />
        <span className="text-[10px] font-medium tabular-nums">
          {status.running ? status.roots.length : '—'}
        </span>
        <span
          className={`size-1.5 rounded-full ${
            status.running ? 'bg-emerald-400 animate-pulse' : 'bg-zinc-500'
          }`}
        />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            ref={popoverRef}
            initial={{ opacity: 0, y: -4, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.96 }}
            transition={SPRINGS.standard}
            className="absolute z-50 top-[calc(100%+8px)] right-0 w-72 rounded-2xl border border-[var(--border)] bg-zinc-950/95 backdrop-blur-xl shadow-2xl shadow-black/40 p-3"
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5 text-xs">
                <Eye size={12} className="text-emerald-300" />
                <span className="font-semibold">Sidecar watcher</span>
              </div>
              <span
                className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
                  status.running ? 'bg-emerald-500/20 text-emerald-200' : 'bg-zinc-700/40 text-zinc-300'
                }`}
              >
                {status.running ? 'Watching' : 'Idle'}
              </span>
            </div>

            <p className="text-[10px] text-[var(--muted)] leading-relaxed mb-2">
              Auto-applies tags from <code className="text-[10px]">.xmp</code>, <code className="text-[10px]">.nfo</code>, and <code className="text-[10px]">.stash.json</code> sidecars dropped beside media files.
            </p>

            {status.roots.length > 0 && (
              <div className="space-y-1 mb-2 max-h-40 overflow-y-auto">
                {status.roots.map((r) => (
                  <motion.div
                    key={r}
                    layout
                    transition={SPRINGS.snappy}
                    className="flex items-center gap-1.5 p-1.5 rounded-lg bg-white/[0.03] border border-white/5"
                  >
                    <Folder size={11} className="text-emerald-400 flex-shrink-0" />
                    <code className="text-[10px] font-mono text-zinc-300 truncate flex-1">{r}</code>
                  </motion.div>
                ))}
              </div>
            )}

            <div className="flex gap-1.5 pt-2 border-t border-white/5">
              {!status.running ? (
                <button
                  onClick={onStart}
                  disabled={busy}
                  className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg bg-emerald-600/30 hover:bg-emerald-600/40 text-emerald-100 text-[11px] font-medium transition disabled:opacity-50"
                >
                  {busy ? <Loader2 size={11} className="animate-spin" /> : <Eye size={11} />} Start
                </button>
              ) : (
                <button
                  onClick={onStop}
                  disabled={busy}
                  className="flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg bg-red-600/30 hover:bg-red-600/40 text-red-100 text-[11px] font-medium transition disabled:opacity-50"
                >
                  {busy ? <Loader2 size={11} className="animate-spin" /> : <Square size={11} />} Stop
                </button>
              )}
              <button
                onClick={onAddRoot}
                disabled={busy}
                className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-zinc-300 text-[11px] font-medium transition disabled:opacity-50"
              >
                <Plus size={11} /> Add root
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
