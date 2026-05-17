'use memo'
// File: src/renderer/components/ExportPipelineModal.tsx
//
// UI for the v2.7 export-pipeline service (#322). Build a recipe (smart-query
// → transcode → sidecar → rclone), save it, run it, watch progress streaming
// in via the `exportPipeline:event` channel.
//
// Recipe shape mirrors src/main/services/export-pipeline.ts. We keep the form
// minimal: query + staging dir + transcode/sidecar/push toggles. Power-user
// flags like extraArgs flow through unchanged when editing saved JSON.

import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import {
  Workflow,
  X,
  Save,
  Trash2,
  Play,
  Folder,
  Loader2,
  CheckCircle2,
  XCircle,
  Cloud,
  FileBox,
  Film,
} from 'lucide-react'
import { useToast } from '../contexts'
import { useEscapeClose } from '../hooks/useEscapeClose'
import { SPRINGS, FADE_SLIDE, SCALE_IN } from './network/motion-tokens'

interface TranscodePreset {
  kind: 'ffmpeg-args'
  vcodec: string
  crf?: number
  scale?: string
  audioBitrate?: string
  extension: string
}

interface RemoteSpec {
  spec: string
  binPath?: string
  extraArgs?: string[]
}

interface ExportRecipe {
  name: string
  query: string
  stagingDir: string
  transcode?: TranscodePreset
  sidecar?: 'xmp' | 'nfo' | 'stash.json'
  organize?: string
  push?: RemoteSpec
  limit?: number
}

interface PipelineItemResult {
  mediaId: string
  sourcePath: string
  status: 'ok' | 'skipped' | 'error'
  outputPath?: string
  error?: string
}

const TRANSCODE_PRESETS: Array<{ id: string; label: string; preset: TranscodePreset | null }> = [
  { id: 'copy', label: 'Copy (no re-encode)', preset: null },
  { id: 'h264-1080p', label: 'H.264 · 1080p · CRF 22', preset: { kind: 'ffmpeg-args', vcodec: 'libx264', crf: 22, scale: '-2:1080', audioBitrate: '192k', extension: 'mp4' } },
  { id: 'hevc-1080p', label: 'HEVC · 1080p · CRF 24', preset: { kind: 'ffmpeg-args', vcodec: 'libx265', crf: 24, scale: '-2:1080', audioBitrate: '192k', extension: 'mp4' } },
  { id: 'av1-1080p', label: 'AV1 · 1080p · CRF 30', preset: { kind: 'ffmpeg-args', vcodec: 'libsvtav1', crf: 30, scale: '-2:1080', audioBitrate: '128k', extension: 'mkv' } },
  { id: 'h264-720p', label: 'H.264 · 720p · CRF 23 (mobile)', preset: { kind: 'ffmpeg-args', vcodec: 'libx264', crf: 23, scale: '-2:720', audioBitrate: '128k', extension: 'mp4' } },
]

const EMPTY_RECIPE: ExportRecipe = {
  name: 'New recipe',
  query: 'rating:>=4',
  stagingDir: '',
  organize: '{date:YYYY-MM-DD}/{title}',
}

export function ExportPipelineModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  useEscapeClose(open, onClose)

  const { showToast } = useToast()
  const [recipes, setRecipes] = useState<ExportRecipe[]>([])
  const [draft, setDraft] = useState<ExportRecipe>(EMPTY_RECIPE)
  const [presetId, setPresetId] = useState('copy')
  const [running, setRunning] = useState(false)
  const [events, setEvents] = useState<Array<{ ts: number; type: string; payload: any }>>([])
  const [results, setResults] = useState<PipelineItemResult[]>([])

  // Load saved recipes
  const refresh = useCallback(async () => {
    try {
      const list = await window.api.exportPipeline.list()
      setRecipes(list as ExportRecipe[])
    } catch (e) {
      console.warn('[ExportPipeline] list failed', e)
    }
  }, [])

  useEffect(() => { if (open) refresh() }, [open, refresh])

  // Listen for progress events while a run is active
  useEffect(() => {
    if (!running) return
    const cleanup = window.api.exportPipeline.onEvent((ev: any) => {
      setEvents((prev) => [...prev, { ts: Date.now(), type: ev.type ?? 'event', payload: ev }].slice(-100))
      if (ev.type === 'item') {
        setResults((r) => [...r, ev.result as PipelineItemResult])
      }
    })
    return cleanup
  }, [running])

  const onPickStaging = useCallback(async () => {
    const folder = await window.api.dialogOpenFolder({ title: 'Pick staging directory' })
    if (folder) setDraft((d) => ({ ...d, stagingDir: folder }))
  }, [])

  const onSave = useCallback(async () => {
    if (!draft.name.trim() || !draft.query.trim() || !draft.stagingDir) {
      showToast('error', 'Name, query, and staging dir required')
      return
    }
    const recipe: ExportRecipe = {
      ...draft,
      transcode: TRANSCODE_PRESETS.find((p) => p.id === presetId)?.preset ?? undefined,
    }
    await window.api.exportPipeline.save(recipe)
    showToast('success', `Saved recipe "${recipe.name}"`)
    refresh()
  }, [draft, presetId, showToast, refresh])

  const onDelete = useCallback(async (name: string) => {
    await window.api.exportPipeline.delete(name)
    refresh()
    if (draft.name === name) setDraft(EMPTY_RECIPE)
  }, [refresh, draft.name])

  const onLoad = useCallback((r: ExportRecipe) => {
    setDraft(r)
    if (r.transcode) {
      const match = TRANSCODE_PRESETS.find((p) =>
        p.preset?.vcodec === r.transcode?.vcodec
        && p.preset?.scale === r.transcode?.scale
      )
      setPresetId(match?.id ?? 'copy')
    } else {
      setPresetId('copy')
    }
  }, [])

  const onRun = useCallback(async () => {
    setRunning(true)
    setEvents([])
    setResults([])
    try {
      const recipe: ExportRecipe = {
        ...draft,
        transcode: TRANSCODE_PRESETS.find((p) => p.id === presetId)?.preset ?? undefined,
      }
      const res = await window.api.exportPipeline.run(recipe)
      showToast(res.ok ? 'success' : 'error', `Run finished · ${res.results?.length ?? 0} items`)
    } catch (e: any) {
      showToast('error', e?.message ?? String(e))
    } finally {
      setRunning(false)
    }
  }, [draft, presetId, showToast])

  const okCount = results.filter((r) => r.status === 'ok').length
  const errCount = results.filter((r) => r.status === 'error').length
  const skipCount = results.filter((r) => r.status === 'skipped').length

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
            className="w-full max-w-4xl max-h-[90vh] bg-zinc-950/95 border border-[var(--border)] rounded-3xl shadow-2xl shadow-black/60 flex flex-col overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/5 bg-gradient-to-r from-emerald-500/10 via-cyan-500/10 to-transparent">
              <div className="flex items-center gap-3">
                <div className="size-9 rounded-2xl bg-gradient-to-br from-emerald-500 to-cyan-600 grid place-items-center shadow-lg shadow-black/40">
                  <Workflow size={16} className="text-white" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold">Export pipeline</h2>
                  <p className="text-[11px] text-[var(--muted)]">Smart-query → transcode → sidecar → rclone</p>
                </div>
              </div>
              <button onClick={onClose} aria-label="Close" className="p-1.5 rounded-lg hover:bg-white/10 transition">
                <X size={16} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto grid grid-cols-[260px_1fr] gap-0 min-h-0">
              {/* Saved recipes */}
              <div className="border-r border-white/5 bg-black/30 p-3 overflow-y-auto space-y-1">
                <div className="text-[10px] uppercase tracking-wider text-[var(--muted)] px-1 mb-1">Saved recipes</div>
                <button
                  onClick={() => setDraft(EMPTY_RECIPE)}
                  className="w-full text-left px-2 py-1.5 rounded-lg bg-white/[0.03] hover:bg-white/[0.06] text-sm text-emerald-300 transition"
                >
                  + New recipe
                </button>
                {recipes.length === 0 && (
                  <div className="text-[10px] text-[var(--muted)] italic px-2 py-1">No saved recipes yet.</div>
                )}
                {recipes.map((r) => (
                  <motion.button
                    key={r.name}
                    layout
                    transition={SPRINGS.snappy}
                    onClick={() => onLoad(r)}
                    className={`w-full text-left px-2 py-1.5 rounded-lg text-sm transition flex items-center justify-between group ${
                      draft.name === r.name
                        ? 'bg-emerald-500/15 text-emerald-200 border border-emerald-500/30'
                        : 'bg-white/[0.03] hover:bg-white/[0.06] border border-transparent'
                    }`}
                  >
                    <span className="truncate">{r.name}</span>
                    <button
                      onClick={(e) => { e.stopPropagation(); onDelete(r.name) }}
                      className="opacity-0 group-hover:opacity-100 text-[var(--muted)] hover:text-red-300 transition"
                      aria-label="Delete"
                    >
                      <Trash2 size={12} />
                    </button>
                  </motion.button>
                ))}
              </div>

              {/* Form */}
              <div className="p-5 space-y-4 overflow-y-auto">
                {/* Name + query */}
                <div className="grid grid-cols-[1fr_2fr] gap-3">
                  <label className="space-y-1">
                    <span className="text-[10px] uppercase tracking-wider text-[var(--muted)]">Name</span>
                    <input
                      value={draft.name}
                      onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                      className="w-full px-2 py-1.5 rounded-lg bg-black/30 border border-white/10 text-sm outline-none focus:border-[var(--primary)]/50"
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-[10px] uppercase tracking-wider text-[var(--muted)]">
                      Smart query <span className="text-zinc-500">(rating:&gt;=4 tag:milf -tag:compilation duration:30..)</span>
                    </span>
                    <input
                      value={draft.query}
                      onChange={(e) => setDraft({ ...draft, query: e.target.value })}
                      placeholder="rating:>=4"
                      className="w-full px-2 py-1.5 rounded-lg bg-black/30 border border-white/10 text-sm font-mono outline-none focus:border-[var(--primary)]/50"
                    />
                  </label>
                </div>

                {/* Staging + organize */}
                <div className="grid grid-cols-[1fr_auto_1fr] gap-2 items-end">
                  <label className="space-y-1">
                    <span className="text-[10px] uppercase tracking-wider text-[var(--muted)]">Staging directory</span>
                    <input
                      value={draft.stagingDir}
                      onChange={(e) => setDraft({ ...draft, stagingDir: e.target.value })}
                      placeholder="C:\export\queue"
                      className="w-full px-2 py-1.5 rounded-lg bg-black/30 border border-white/10 text-xs font-mono outline-none focus:border-[var(--primary)]/50"
                    />
                  </label>
                  <button
                    onClick={onPickStaging}
                    className="px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-xs flex items-center gap-1.5 h-[30px]"
                  >
                    <Folder size={12} /> Pick
                  </button>
                  <label className="space-y-1">
                    <span className="text-[10px] uppercase tracking-wider text-[var(--muted)]">
                      Organize template <span className="text-zinc-500">({'{title}'} {'{date:YYYY-MM-DD}'})</span>
                    </span>
                    <input
                      value={draft.organize ?? ''}
                      onChange={(e) => setDraft({ ...draft, organize: e.target.value || undefined })}
                      placeholder="{date:YYYY-MM-DD}/{title}"
                      className="w-full px-2 py-1.5 rounded-lg bg-black/30 border border-white/10 text-xs font-mono outline-none focus:border-[var(--primary)]/50"
                    />
                  </label>
                </div>

                {/* Transcode + Sidecar */}
                <div className="grid grid-cols-2 gap-3">
                  <label className="space-y-1">
                    <span className="text-[10px] uppercase tracking-wider text-[var(--muted)] flex items-center gap-1.5">
                      <Film size={11} /> Transcode preset
                    </span>
                    <select
                      value={presetId}
                      onChange={(e) => setPresetId(e.target.value)}
                      className="w-full px-2 py-1.5 rounded-lg bg-black/30 border border-white/10 text-xs outline-none focus:border-[var(--primary)]/50"
                    >
                      {TRANSCODE_PRESETS.map((p) => (
                        <option key={p.id} value={p.id}>{p.label}</option>
                      ))}
                    </select>
                  </label>
                  <label className="space-y-1">
                    <span className="text-[10px] uppercase tracking-wider text-[var(--muted)] flex items-center gap-1.5">
                      <FileBox size={11} /> Sidecar format
                    </span>
                    <select
                      value={draft.sidecar ?? ''}
                      onChange={(e) => setDraft({ ...draft, sidecar: (e.target.value || undefined) as ExportRecipe['sidecar'] })}
                      className="w-full px-2 py-1.5 rounded-lg bg-black/30 border border-white/10 text-xs outline-none focus:border-[var(--primary)]/50"
                    >
                      <option value="">(none)</option>
                      <option value="xmp">XMP — Darktable / Lightroom</option>
                      <option value="nfo">NFO — Kodi / Jellyfin / Emby</option>
                      <option value="stash.json">Stash JSON</option>
                    </select>
                  </label>
                </div>

                {/* Push to remote */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-[var(--muted)]">
                    <Cloud size={11} /> rclone push <span className="text-zinc-500 normal-case tracking-normal">(optional)</span>
                  </div>
                  <div className="grid grid-cols-[2fr_1fr] gap-2">
                    <input
                      value={draft.push?.spec ?? ''}
                      onChange={(e) => setDraft({
                        ...draft,
                        push: e.target.value ? { ...(draft.push ?? {}), spec: e.target.value } : undefined,
                      })}
                      placeholder="myremote:vault-backup/"
                      className="w-full px-2 py-1.5 rounded-lg bg-black/30 border border-white/10 text-xs font-mono outline-none focus:border-[var(--primary)]/50"
                    />
                    <input
                      type="number"
                      value={draft.limit ?? ''}
                      onChange={(e) => setDraft({ ...draft, limit: e.target.value ? Number(e.target.value) : undefined })}
                      placeholder="Limit (optional)"
                      className="w-full px-2 py-1.5 rounded-lg bg-black/30 border border-white/10 text-xs font-mono outline-none focus:border-[var(--primary)]/50"
                    />
                  </div>
                </div>

                {/* Run progress */}
                <AnimatePresence>
                  {(running || results.length > 0) && (
                    <motion.div
                      {...FADE_SLIDE}
                      className="space-y-2 rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-3"
                    >
                      <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-3">
                          {running && <Loader2 size={12} className="animate-spin text-emerald-300" />}
                          <span className="text-emerald-200 font-medium">
                            {running ? 'Running…' : 'Last run complete'}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 text-[11px] tabular-nums">
                          <span className="text-emerald-300 flex items-center gap-1"><CheckCircle2 size={11} />{okCount}</span>
                          <span className="text-zinc-400">↷{skipCount}</span>
                          {errCount > 0 && <span className="text-red-300 flex items-center gap-1"><XCircle size={11} />{errCount}</span>}
                        </div>
                      </div>
                      <div className="max-h-40 overflow-y-auto space-y-0.5">
                        {results.slice(-30).map((r, i) => (
                          <motion.div
                            key={`${r.mediaId}-${i}`}
                            layout
                            transition={SPRINGS.snappy}
                            className="text-[10px] flex items-center gap-1.5 py-0.5"
                          >
                            {r.status === 'ok' ? (
                              <CheckCircle2 size={10} className="text-emerald-400 flex-shrink-0" />
                            ) : r.status === 'error' ? (
                              <XCircle size={10} className="text-red-400 flex-shrink-0" />
                            ) : (
                              <span className="text-zinc-500 flex-shrink-0 w-2.5">↷</span>
                            )}
                            <span className="text-zinc-300 truncate flex-1 font-mono">
                              {r.sourcePath.split(/[/\\]/).pop()}
                            </span>
                            {r.error && <span className="text-red-300 truncate max-w-[40%]">{r.error}</span>}
                          </motion.div>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>

            {/* Footer */}
            <div className="px-5 py-3 border-t border-white/5 bg-black/30 flex items-center justify-between">
              <p className="text-[10px] text-[var(--muted)]">
                Stages are idempotent. Items skipped if already in staging with matching mtime.
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={onSave}
                  disabled={running}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-sm transition disabled:opacity-50"
                >
                  <Save size={13} /> Save
                </button>
                <button
                  onClick={onRun}
                  disabled={running || !draft.query || !draft.stagingDir}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600/30 hover:bg-emerald-600/40 text-emerald-100 text-sm transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {running ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />}
                  {running ? 'Running' : 'Run pipeline'}
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
