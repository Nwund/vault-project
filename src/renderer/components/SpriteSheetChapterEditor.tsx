'use memo'
// File: src/renderer/components/SpriteSheetChapterEditor.tsx
//
// #316 E-92 — Sprite-sheet chapter editor. Pick a video → generates a
// sprite sheet of N evenly-spaced thumbnails → user clicks cells to
// mark them as chapter starts → names each pick → resolves to a
// chapter list via `tags.spriteSheet.picksToChapters`.

import { useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import {
  Film,
  X,
  Loader2,
  FileVideo,
  Plus,
  Trash2,
  Check,
  Copy,
} from 'lucide-react'
import { useToast } from '../contexts'
import { useEscapeClose } from '../hooks/useEscapeClose'
import { formatDuration } from '../utils/formatters'
import { SPRINGS, FADE_SLIDE, SCALE_IN } from './network/motion-tokens'

interface SpriteData {
  spritePath: string
  cols: number
  rows: number
  thumbWidth: number
  thumbHeight: number
  cells: Array<{ idx: number; timeSec: number; col: number; row: number }>
}

interface Pick {
  cellIdx: number
  timeSec: number
  title: string
}

export function SpriteSheetChapterEditor({ open, onClose }: { open: boolean; onClose: () => void }) {
  useEscapeClose(open, onClose)

  const { showToast } = useToast()
  const [videoPath, setVideoPath] = useState<string | null>(null)
  const [duration, setDuration] = useState(0)
  const [cellCount, setCellCount] = useState(48)
  const [sprite, setSprite] = useState<SpriteData | null>(null)
  const [picks, setPicks] = useState<Pick[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [chapters, setChapters] = useState<Array<{ startSec: number; endSec: number; title: string }> | null>(null)
  const [copied, setCopied] = useState(false)

  const onPickVideo = useCallback(async () => {
    const picked = await window.api.dialogOpenFile({
      title: 'Pick video for chapter editor',
      filters: [{ name: 'Video', extensions: ['mp4', 'mkv', 'webm', 'mov', 'avi', 'm4v'] }],
    })
    if (!picked) return
    setVideoPath(picked)
    setSprite(null)
    setPicks([])
    setChapters(null)
    // Probe duration via the quality bridge (we already have a ffprobe path)
    try {
      const audit = await window.api.tags.quality.audit({ videoPath: picked, deep: false })
      if (audit.ok && audit.report) setDuration(audit.report.durationSec ?? 0)
    } catch (e) {
      console.warn('[chapter-editor] duration probe failed:', e)
    }
  }, [])

  const onGenerate = useCallback(async () => {
    if (!videoPath || duration <= 0) return
    setBusy(true)
    setError(null)
    try {
      const res = await window.api.tags.spriteSheet.generate({
        srcPath: videoPath,
        durationSec: duration,
        cells: cellCount,
        cols: Math.min(8, Math.ceil(Math.sqrt(cellCount * 1.6))),
        thumbWidth: 160,
        thumbHeight: 90,
      })
      if (!res.ok || !res.spritePath) throw new Error(res.error ?? 'Sprite generation failed')
      setSprite({
        spritePath: res.spritePath,
        cols: res.cols ?? 8,
        rows: res.rows ?? Math.ceil((res.cells?.length ?? 0) / (res.cols ?? 8)),
        thumbWidth: res.thumbWidth ?? 160,
        thumbHeight: res.thumbHeight ?? 90,
        cells: res.cells ?? [],
      })
      setPicks([])
      setChapters(null)
    } catch (e: any) {
      setError(e?.message ?? String(e))
    } finally {
      setBusy(false)
    }
  }, [videoPath, duration, cellCount])

  const togglePick = useCallback((cellIdx: number, timeSec: number) => {
    setPicks((prev) => {
      const existing = prev.findIndex((p) => p.cellIdx === cellIdx)
      if (existing >= 0) return prev.filter((_, i) => i !== existing)
      return [...prev, { cellIdx, timeSec, title: `Chapter ${prev.length + 1}` }].sort((a, b) => a.timeSec - b.timeSec)
    })
  }, [])

  const updatePickTitle = useCallback((cellIdx: number, title: string) => {
    setPicks((prev) => prev.map((p) => (p.cellIdx === cellIdx ? { ...p, title } : p)))
  }, [])

  const onResolve = useCallback(async () => {
    if (picks.length === 0) return
    setBusy(true)
    setError(null)
    try {
      const res = await window.api.tags.spriteSheet.picksToChapters({
        picks: picks.map((p) => ({ cellIdx: p.cellIdx, title: p.title, timeSec: p.timeSec })),
        durationSec: duration,
      })
      if (!res.ok || !res.chapters) throw new Error(res.error ?? 'Resolve failed')
      setChapters(res.chapters)
      showToast?.('success', `Built ${res.chapters.length} chapters`)
    } catch (e: any) {
      setError(e?.message ?? String(e))
    } finally {
      setBusy(false)
    }
  }, [picks, duration, showToast])

  const onCopyJson = useCallback(() => {
    if (!chapters) return
    const json = JSON.stringify(chapters, null, 2)
    navigator.clipboard.writeText(json).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1400)
    })
  }, [chapters])

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          {...FADE_SLIDE}
          className="fixed inset-0 z-[200] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={onClose}
        >
          <motion.div
            {...SCALE_IN}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-5xl max-h-[90vh] bg-zinc-950/95 border border-[var(--border)] rounded-3xl shadow-2xl shadow-black/60 flex flex-col overflow-hidden"
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/5 bg-gradient-to-r from-cyan-500/10 via-blue-500/10 to-transparent">
              <div className="flex items-center gap-3">
                <div className="size-9 rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-600 grid place-items-center shadow-lg shadow-black/40">
                  <Film size={16} className="text-white" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold">Sprite-sheet chapter editor</h2>
                  <p className="text-[11px] text-[var(--muted)]">
                    Pick cells from the grid to mark chapter starts
                  </p>
                </div>
              </div>
              <button onClick={onClose} aria-label="Close" className="p-1.5 rounded-lg hover:bg-white/10 transition">
                <X size={16} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {/* Pick video + cell count */}
              <div className="flex items-end gap-2 flex-wrap">
                <button
                  onClick={onPickVideo}
                  className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-xs flex items-center gap-1.5"
                >
                  <FileVideo size={12} /> {videoPath ? 'Pick another video' : 'Pick video'}
                </button>
                {videoPath && (
                  <code className="text-[10px] font-mono text-[var(--muted)] truncate flex-1 min-w-0" title={videoPath}>
                    {videoPath}
                  </code>
                )}
                <label className="space-y-1 w-28 flex-shrink-0">
                  <span className="text-[10px] uppercase tracking-wider text-[var(--muted)]">Cells</span>
                  <input
                    type="number"
                    min={8}
                    max={400}
                    value={cellCount}
                    onChange={(e) => setCellCount(Math.max(8, Math.min(400, Number(e.target.value) || 48)))}
                    className="w-full px-2 py-1.5 rounded-lg bg-black/30 border border-white/10 text-xs font-mono outline-none focus:border-[var(--primary)]/50"
                  />
                </label>
                <button
                  onClick={onGenerate}
                  disabled={busy || !videoPath || duration <= 0}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-600/30 hover:bg-cyan-600/40 text-cyan-100 text-xs transition disabled:opacity-50"
                >
                  {busy ? <Loader2 size={12} className="animate-spin" /> : <Film size={12} />}
                  {busy ? 'Generating…' : 'Generate sheet'}
                </button>
              </div>

              {duration > 0 && (
                <div className="text-[10px] text-[var(--muted)] tabular-nums">
                  Duration: {formatDuration(duration)} · per-cell: ~{(duration / cellCount).toFixed(1)}s
                </div>
              )}

              {error && (
                <div className="rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2 text-[11px] text-red-200">
                  {error}
                </div>
              )}

              {/* Sprite grid */}
              <AnimatePresence>
                {sprite && (
                  <motion.div {...FADE_SLIDE} className="space-y-2">
                    <div className="text-[10px] uppercase tracking-wider text-[var(--muted)]">
                      Click any thumbnail to mark a chapter start
                    </div>
                    <div
                      className="grid gap-1 max-h-[50vh] overflow-y-auto p-1"
                      style={{ gridTemplateColumns: `repeat(${sprite.cols}, minmax(0, 1fr))` }}
                    >
                      {sprite.cells.map((cell) => {
                        const picked = picks.some((p) => p.cellIdx === cell.idx)
                        return (
                          <motion.button
                            key={cell.idx}
                            layout
                            transition={SPRINGS.snappy}
                            whileHover={{ scale: 1.05, zIndex: 5 }}
                            whileTap={{ scale: 0.96 }}
                            onClick={() => togglePick(cell.idx, cell.timeSec)}
                            className={`relative rounded-md overflow-hidden border-2 transition ${
                              picked ? 'border-cyan-400 ring-2 ring-cyan-400/40' : 'border-white/10 hover:border-white/30'
                            }`}
                            style={{
                              aspectRatio: `${sprite.thumbWidth} / ${sprite.thumbHeight}`,
                              backgroundImage: `url(vault://file/${encodeURIComponent(sprite.spritePath)})`,
                              backgroundSize: `${sprite.cols * 100}% ${sprite.rows * 100}%`,
                              backgroundPosition: `${(cell.col / (sprite.cols - 1 || 1)) * 100}% ${(cell.row / (sprite.rows - 1 || 1)) * 100}%`,
                            }}
                            title={`${formatDuration(cell.timeSec)} · cell ${cell.idx}`}
                          >
                            {picked && (
                              <div className="absolute inset-0 bg-cyan-500/30 grid place-items-center">
                                <Check size={14} className="text-cyan-100" />
                              </div>
                            )}
                            <span className="absolute bottom-0 right-0 px-1 text-[8px] tabular-nums bg-black/70 text-white/80 rounded-tl">
                              {formatDuration(cell.timeSec)}
                            </span>
                          </motion.button>
                        )
                      })}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Picks list with editable titles */}
              <AnimatePresence>
                {picks.length > 0 && (
                  <motion.div {...FADE_SLIDE} className="space-y-1">
                    <div className="text-[10px] uppercase tracking-wider text-[var(--muted)]">
                      Picks ({picks.length}) — click to edit title
                    </div>
                    <div className="space-y-1 max-h-40 overflow-y-auto pr-1">
                      {picks.map((p) => (
                        <motion.div
                          key={p.cellIdx}
                          layout
                          transition={SPRINGS.snappy}
                          className="flex items-center gap-2 p-1.5 rounded-lg bg-cyan-500/5 border border-cyan-500/20"
                        >
                          <span className="text-[10px] text-cyan-300 tabular-nums w-12 flex-shrink-0">
                            {formatDuration(p.timeSec)}
                          </span>
                          <input
                            value={p.title}
                            onChange={(e) => updatePickTitle(p.cellIdx, e.target.value)}
                            className="flex-1 px-2 py-0.5 rounded bg-black/30 border border-white/10 text-xs outline-none focus:border-cyan-500/50"
                          />
                          <button
                            onClick={() => togglePick(p.cellIdx, p.timeSec)}
                            className="text-[var(--muted)] hover:text-red-300 transition"
                            aria-label="Remove pick"
                          >
                            <Trash2 size={11} />
                          </button>
                        </motion.div>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Resolved chapters output */}
              <AnimatePresence>
                {chapters && (
                  <motion.div {...FADE_SLIDE} className="rounded-2xl bg-emerald-500/10 border border-emerald-500/20 p-3 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] uppercase tracking-wider text-emerald-300">
                        Resolved chapters ({chapters.length})
                      </span>
                      <button
                        onClick={onCopyJson}
                        className="text-[11px] flex items-center gap-1.5 px-2 py-0.5 rounded bg-white/5 hover:bg-white/10 transition"
                      >
                        {copied ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} />}
                        {copied ? 'Copied' : 'Copy JSON'}
                      </button>
                    </div>
                    <div className="space-y-0.5 max-h-32 overflow-y-auto">
                      {chapters.map((c, i) => (
                        <div key={i} className="text-[11px] text-emerald-100 tabular-nums">
                          <span className="text-emerald-300 w-12 inline-block">{formatDuration(c.startSec)}</span>
                          <span className="text-emerald-300/40 mx-1">→</span>
                          <span className="text-emerald-300 w-12 inline-block">{formatDuration(c.endSec)}</span>
                          <span className="ml-2">{c.title}</span>
                        </div>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Footer */}
            <div className="px-5 py-3 border-t border-white/5 bg-black/30 flex items-center justify-between">
              <p className="text-[10px] text-[var(--muted)]">
                {picks.length === 0 ? 'Pick at least one cell to build chapters' : `${picks.length} pick${picks.length === 1 ? '' : 's'}`}
              </p>
              <button
                onClick={onResolve}
                disabled={busy || picks.length === 0}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600/30 hover:bg-emerald-600/40 text-emerald-100 text-sm transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {busy ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
                Build chapters
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
